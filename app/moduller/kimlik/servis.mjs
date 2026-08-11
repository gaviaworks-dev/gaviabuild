/* ============================================================================
   KİMLİK SERVİSİ — giriş, MFA, davet, parola sıfırlama, ilk kurulum
   ----------------------------------------------------------------------------
   Doküman 2.1 şartları:
     · Oturum çerezi HttpOnly/Secure/SameSite olarak SUNUCUDAN verilir.
     · "E-posta ile kullanıcı var/yok bilgisini sızdıran hata mesajı gösterilmez."
     · Başarılı girişten sonra SABİT panele değil; rol, bağlam, zorunlu kurulum
       ve açık onaylara göre yönlendirilir.
   ========================================================================== */
import { tek, sorgu, calistir, islem } from '../../cekirdek/db.mjs';
import { kimlik, token, tokenOzeti } from '../../cekirdek/kimlikler.mjs';
import { simdi } from '../../cekirdek/zaman.mjs';
import { yapilandirma } from '../../cekirdek/yapilandirma.mjs';
import { KimlikGecersiz, CokFazlaIstek, DogrulamaHatasi, Bulunamadi } from '../../cekirdek/hata.mjs';
import * as audit from '../../cekirdek/audit.mjs';
import * as parola from './parola.mjs';
import * as oturum from './oturum.mjs';
import * as mfa from './mfa.mjs';
import { uygulananKodlar } from '../../rotalar.mjs';
import { landingRotasi, yetkiVar } from './yetki.mjs';

/* --- Hız sınırı ---------------------------------------------------------- */
function denemeSay(anahtar) {
  const t = simdi() - yapilandirma.girisPenceresiMs;
  return Number(tek('SELECT COUNT(*) AS n FROM giris_denemesi WHERE anahtar = ? AND zaman > ? AND basarili = 0', anahtar, t)?.n ?? 0);
}
function denemeYaz(anahtar, tur, basarili) {
  calistir('INSERT INTO giris_denemesi (id, anahtar, tur, zaman, basarili) VALUES (?,?,?,?,?)',
    kimlik('olay'), anahtar, tur, simdi(), basarili ? 1 : 0);
}

/* --- Giriş (AUTH-01) ----------------------------------------------------- */
/**
 * @returns {{sonuc:'oturum'|'mfa_gerekli'|'kurulum_gerekli', hedef:string, mfaToken?:string}}
 */
export function giris(ctx, { eposta, parola: girilen }) {
  const e = String(eposta || '').trim().toLowerCase();
  if (!e || !girilen) throw KimlikGecersiz();

  /* Hız sınırı hem e-posta hem IP üzerinden — sayaç var/yok bilgisi vermez. */
  if (denemeSay(e) >= yapilandirma.girisDenemeSiniri || denemeSay(ctx.ip) >= yapilandirma.girisDenemeSiniri * 3) {
    throw CokFazlaIstek('Çok fazla başarısız deneme. Bir süre sonra tekrar deneyin.');
  }

  const k = tek(`SELECT k.*, t.durum AS tenant_durum FROM kullanici k
                   JOIN tenant t ON t.id = k.tenant_id
                  WHERE k.eposta = ? ORDER BY k.olusturuldu ASC LIMIT 1`, e);

  /* Kullanıcı yoksa da AYNI işi yap ve AYNI hatayı ver (kullanıcı sayımı yasak). */
  const gecerli = parola.dogrula(girilen, k?.parola_ozeti, k?.parola_tuz);
  const kullanilabilir = !!k && gecerli && k.durum === 'aktif' && k.tenant_durum === 'aktif'
    && (!k.kilit_bitis || k.kilit_bitis < simdi());

  if (!kullanilabilir) {
    islem(() => {
      denemeYaz(e, 'eposta', false);
      denemeYaz(ctx.ip, 'ip', false);
      if (k) {
        const sayac = k.basarisiz_deneme + 1;
        const kilit = sayac >= yapilandirma.girisDenemeSiniri ? simdi() + yapilandirma.girisKilitMs : k.kilit_bitis;
        calistir('UPDATE kullanici SET basarisiz_deneme = ?, kilit_bitis = ? WHERE id = ?', sayac, kilit, k.id);
      }
      audit.yaz({ tenantId: k?.tenant_id ?? null, kullaniciId: k?.id ?? null, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'oturum', eylem: 'giris_basarisiz', gerekce: k ? 'kimlik_dogrulanamadi' : 'kullanici_yok' });
    });
    throw KimlikGecersiz();   // tek ve aynı mesaj
  }

  return islem(() => {
    denemeYaz(e, 'eposta', true);
    calistir('UPDATE kullanici SET basarisiz_deneme = 0, kilit_bitis = NULL, son_giris = ? WHERE id = ?', simdi(), k.id);

    /* MFA zorunlu veya aktifse oturum HENÜZ açılmaz; ikinci adım tokeni verilir. */
    if (k.mfa_aktif || k.mfa_zorunlu) {
      const ham = token(24);
      calistir(`INSERT INTO tek_kullanimlik_token (id, tenant_id, kullanici_id, tur, token_ozeti, bitis, olusturuldu)
                VALUES (?,?,?,'mfa_adimi',?,?,?)`,
        kimlik('davet'), k.tenant_id, k.id, tokenOzeti(ham), simdi() + yapilandirma.mfaAdimSuresiMs, simdi());
      audit.yaz({ tenantId: k.tenant_id, kullaniciId: k.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'oturum', eylem: 'mfa_adimi_baslatildi' });
      return { sonuc: 'mfa_gerekli', hedef: '/mfa', mfaToken: ham, kurulumGerekli: !k.mfa_aktif };
    }

    oturum.baslat(ctx, k);
    audit.yaz({ tenantId: k.tenant_id, kullaniciId: k.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'oturum', eylem: 'giris' });
    return { sonuc: 'oturum', hedef: k.kurulum_tamam ? null : '/ilk-kurulum', kullanici: k };
  });
}

/* --- MFA doğrulama (AUTH-05) -------------------------------------------- */
export function mfaDogrula(ctx, { mfaToken, kod }) {
  const kayit = tek(`SELECT * FROM tek_kullanimlik_token WHERE token_ozeti = ? AND tur = 'mfa_adimi'`, tokenOzeti(mfaToken || ''));
  if (!kayit || kayit.kullanildi || kayit.bitis < simdi()) throw KimlikGecersiz('Doğrulama adımı geçersiz veya süresi doldu.');
  const k = tek('SELECT * FROM kullanici WHERE id = ?', kayit.kullanici_id);
  if (!k) throw KimlikGecersiz();

  const sonuc = mfa.kodDogrula(k.mfa_gizli, kod);
  if (!sonuc.gecerli) {
    islem(() => {
      denemeYaz(k.eposta, 'eposta', false);
      audit.yaz({ tenantId: k.tenant_id, kullaniciId: k.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'oturum', eylem: 'mfa_basarisiz' });
    });
    throw KimlikGecersiz('Doğrulama kodu hatalı.');
  }

  return islem(() => {
    calistir('UPDATE tek_kullanimlik_token SET kullanildi = ? WHERE id = ?', simdi(), kayit.id);
    oturum.baslat(ctx, k, { mfaDogrulandi: true });
    audit.yaz({ tenantId: k.tenant_id, kullaniciId: k.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'oturum', eylem: 'giris_mfa' });
    return { sonuc: 'oturum', kullanici: k };
  });
}

/* --- Parola sıfırlama (AUTH-02, AUTH-03) -------------------------------- */
/**
 * Kullanıcı var/yok bilgisini SIZDIRMAZ: her durumda aynı sonucu döner.
 * Token yalnız kullanıcı varsa üretilir; çağıran taraf bunu bilmez.
 */
export function sifirlamaIste(ctx, { eposta }) {
  const e = String(eposta || '').trim().toLowerCase();
  const k = tek('SELECT * FROM kullanici WHERE eposta = ? AND durum = ? LIMIT 1', e, 'aktif');
  let ham = null;
  islem(() => {
    if (k) {
      /* Önceki açık sıfırlama tokenleri geçersizleşir — tek kullanımlık ve tekil. */
      calistir(`UPDATE tek_kullanimlik_token SET kullanildi = ?
                 WHERE kullanici_id = ? AND tur = 'parola_sifirlama' AND kullanildi IS NULL`, simdi(), k.id);
      ham = token(32);
      calistir(`INSERT INTO tek_kullanimlik_token (id, tenant_id, kullanici_id, tur, token_ozeti, bitis, olusturuldu)
                VALUES (?,?,?,'parola_sifirlama',?,?,?)`,
        kimlik('davet'), k.tenant_id, k.id, tokenOzeti(ham), simdi() + yapilandirma.sifirlamaSuresiMs, simdi());
    }
    audit.yaz({ tenantId: k?.tenant_id ?? null, kullaniciId: k?.id ?? null, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'kullanici', nesneId: k?.id ?? null, eylem: 'parola_sifirlama_istendi',
      gerekce: k ? null : 'eslesen_kullanici_yok' });
  });
  /* Dönen mesaj her iki durumda da aynıdır. Token yalnız e-posta kanalına gider. */
  return { gonderildi: true, _token: ham };
}

export function sifirlamaTamamla(ctx, { sifirlamaToken, yeniParola, yeniParolaTekrar }) {
  const kayit = tek(`SELECT * FROM tek_kullanimlik_token WHERE token_ozeti = ? AND tur = 'parola_sifirlama'`,
    tokenOzeti(sifirlamaToken || ''));
  if (!kayit || kayit.kullanildi || kayit.bitis < simdi()) {
    throw DogrulamaHatasi('Sıfırlama bağlantısı geçersiz veya süresi dolmuş. Yeniden talep edin.');
  }
  if (yeniParola !== yeniParolaTekrar) throw DogrulamaHatasi('Parolalar eşleşmiyor.', { alanlar: { yeniParolaTekrar: ['Parolalar eşleşmiyor.'] } });
  const k = tek('SELECT * FROM kullanici WHERE id = ?', kayit.kullanici_id);
  if (!k) throw Bulunamadi();
  parola.politikaZorunlu(yeniParola, { adSoyad: k.ad_soyad, eposta: k.eposta });

  return islem(() => {
    const { ozet, tuz } = parola.ozetle(yeniParola);
    calistir(`UPDATE kullanici SET parola_ozeti = ?, parola_tuz = ?, parola_degisti = ?,
                basarisiz_deneme = 0, kilit_bitis = NULL, durum = 'aktif', surum = surum + 1 WHERE id = ?`,
      ozet, tuz, simdi(), k.id);
    calistir('UPDATE tek_kullanimlik_token SET kullanildi = ? WHERE id = ?', simdi(), kayit.id);
    /* Parola değişti → tüm oturumlar kapanır (çalınmış oturum devam edemez). */
    oturum.tumOturumlariKapat(k.id, 'parola_degisti');
    audit.yaz({ tenantId: k.tenant_id, kullaniciId: k.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'kullanici', nesneId: k.id, eylem: 'parola_sifirlandi' });
    return { tamam: true };
  });
}

/* --- Davet (AUTH-04) ----------------------------------------------------- */
export function davetOlustur(ctx, { eposta, adSoyad, rolKodu, kapsamTur = null, kapsamId = null }) {
  const e = String(eposta || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw DogrulamaHatasi('Geçerli bir e-posta adresi girin.', { alanlar: { eposta: ['Geçersiz e-posta.'] } });
  const rol = tek('SELECT * FROM rol WHERE kod = ? AND (tenant_id = ? OR tenant_id IS NULL)', rolKodu, ctx.tenant.id);
  if (!rol) throw DogrulamaHatasi('Rol bulunamadı.', { alanlar: { rolKodu: ['Geçersiz rol.'] } });

  return islem(() => {
    let k = tek('SELECT * FROM kullanici WHERE tenant_id = ? AND eposta = ?', ctx.tenant.id, e);
    if (!k) {
      const id = kimlik('kullanici');
      calistir(`INSERT INTO kullanici (id, tenant_id, eposta, ad_soyad, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,'davetli',?,?)`, id, ctx.tenant.id, e, adSoyad || e, ctx.kullanici.id, simdi());
      k = tek('SELECT * FROM kullanici WHERE id = ?', id);
    }
    calistir(`INSERT OR IGNORE INTO kullanici_rol (id, tenant_id, kullanici_id, rol_id, kapsam_tur, kapsam_id, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?)`,
      kimlik('rol'), ctx.tenant.id, k.id, rol.id, kapsamTur, kapsamId, ctx.kullanici.id, simdi());

    const ham = token(32);
    calistir(`INSERT INTO tek_kullanimlik_token (id, tenant_id, kullanici_id, tur, token_ozeti, veri, bitis, olusturan, olusturuldu)
              VALUES (?,?,?,'davet',?,?,?,?,?)`,
      kimlik('davet'), ctx.tenant.id, k.id, tokenOzeti(ham),
      JSON.stringify({ rolKodu, kapsamTur, kapsamId }), simdi() + yapilandirma.davetSuresiMs, ctx.kullanici.id, simdi());

    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'kullanici', nesneId: k.id, eylem: 'davet_gonderildi', sonraki: { eposta: e, rol: rolKodu, kapsamTur, kapsamId } });
    return { kullaniciId: k.id, _token: ham };
  });
}

export function davetKabul(ctx, { davetToken, adSoyad, yeniParola, yeniParolaTekrar, kvkkOnay }) {
  const kayit = tek(`SELECT * FROM tek_kullanimlik_token WHERE token_ozeti = ? AND tur = 'davet'`, tokenOzeti(davetToken || ''));
  if (!kayit || kayit.kullanildi || kayit.bitis < simdi()) throw DogrulamaHatasi('Davet bağlantısı geçersiz veya süresi dolmuş.');
  if (!kvkkOnay) throw DogrulamaHatasi('Devam etmek için aydınlatma metnini onaylamanız gerekiyor.', { alanlar: { kvkkOnay: ['Onay zorunlu.'] } });
  if (yeniParola !== yeniParolaTekrar) throw DogrulamaHatasi('Parolalar eşleşmiyor.', { alanlar: { yeniParolaTekrar: ['Parolalar eşleşmiyor.'] } });
  const k = tek('SELECT * FROM kullanici WHERE id = ?', kayit.kullanici_id);
  if (!k) throw Bulunamadi();
  parola.politikaZorunlu(yeniParola, { adSoyad: adSoyad || k.ad_soyad, eposta: k.eposta });

  return islem(() => {
    const { ozet, tuz } = parola.ozetle(yeniParola);
    calistir(`UPDATE kullanici SET parola_ozeti = ?, parola_tuz = ?, parola_degisti = ?, ad_soyad = ?,
                durum = 'aktif', surum = surum + 1 WHERE id = ?`,
      ozet, tuz, simdi(), adSoyad || k.ad_soyad, k.id);
    calistir('UPDATE tek_kullanimlik_token SET kullanildi = ? WHERE id = ?', simdi(), kayit.id);
    audit.yaz({ tenantId: k.tenant_id, kullaniciId: k.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'kullanici', nesneId: k.id, eylem: 'davet_kabul' });
    const guncel = tek('SELECT * FROM kullanici WHERE id = ?', k.id);
    oturum.baslat(ctx, guncel);
    return { tamam: true, kullanici: guncel };
  });
}

/* --- İlk kurulum (AUTH-06) ---------------------------------------------- */
export function kurulumTamamla(ctx, { saatDilimi, mfaKod, mfaGizli }) {
  const k = ctx.kullanici;
  return islem(() => {
    let mfaAktif = k.mfa_aktif;
    if (mfaGizli) {
      const sonuc = mfa.kodDogrula(mfaGizli, mfaKod);
      if (!sonuc.gecerli) throw DogrulamaHatasi('Doğrulama kodu hatalı.', { alanlar: { mfaKod: ['Kod doğrulanamadı.'] } });
      calistir('UPDATE kullanici SET mfa_gizli = ?, mfa_aktif = 1 WHERE id = ?', mfaGizli, k.id);
      mfaAktif = 1;
    }
    if (k.mfa_zorunlu && !mfaAktif) throw DogrulamaHatasi('Bu hesapta iki adımlı doğrulama zorunludur.');
    calistir('UPDATE kullanici SET kurulum_tamam = 1, saat_dilimi = COALESCE(?, saat_dilimi), surum = surum + 1 WHERE id = ?',
      saatDilimi || null, k.id);
    audit.yaz({ tenantId: k.tenant_id, kullaniciId: k.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'kullanici', nesneId: k.id, eylem: 'ilk_kurulum_tamam', sonraki: { mfaAktif: !!mfaAktif, saatDilimi } });
    return { tamam: true };
  });
}

/* --- Giriş sonrası yönlendirme (doküman 2.1) ---------------------------- */
/**
 * "Kullanıcı doğrudan sabit bir panele değil; son şirket/proje bağlamı, rolü,
 *  bekleyen zorunlu kurulum ve açık onaylarına göre yönlendirilir."
 */
export function girisSonrasiHedef(ctx, manifest) {
  const k = ctx.kullanici;
  if (!k.kurulum_tamam) return '/ilk-kurulum';
  if (k.mfa_zorunlu && !k.mfa_aktif) return '/ilk-kurulum';

  const acikOnay = Number(tek(
    `SELECT COUNT(*) AS n FROM bildirim WHERE kullanici_id = ? AND okundu IS NULL AND tur = 'onay_bekliyor'`, k.id)?.n ?? 0);
  if (acikOnay > 0) {
    const onayEkrani = manifest.ekranlar.find((e) => e.kod === 'GLB-04');
    if (onayEkrani && yetkiVar(ctx, onayEkrani.yetki)) return onayEkrani.rota;
  }
  return landingRotasi(ctx, manifest, uygulananKodlar());
}

/** Kullanıcının aktif oturumları (GLB-12 profil sekmesi). */
export const oturumlar = (kullaniciId) =>
  sorgu(`SELECT id, ip, tarayici, olusturuldu, son_erisim, bitis, sonlandirildi
           FROM oturum WHERE kullanici_id = ? ORDER BY olusturuldu DESC LIMIT 50`, kullaniciId);
