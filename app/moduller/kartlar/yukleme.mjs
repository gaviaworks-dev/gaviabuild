/* ============================================================================
   TOPLU YÜKLEME ALGORİTMASI — doküman §6.4, sekiz adım birebir
   ----------------------------------------------------------------------------
   1. Şirket, sağlayıcı hesabı, ürün, dönem ve kaynak seçilir.
   2. Uygun personel AKTİF ÇALIŞMA/ATAMA, KART DURUMU, POLİTİKA, ÜCRETSİZ İZİN/
      AYRILIŞ ve ÖNCEKİ YÜKLEME kayıtlarına göre HESAPLANIR.
   3. Gün ve tutar formülü ETKİLİ TARİHLİ POLİTİKADAN gelir; kullanıcı yalnız
      yetkisi varsa istisna önerir ve GEREKÇE yazar.
   4. Mükerrer kart, mükerrer dönem, para birimi, negatif/sıfır tutar, pasif
      kart, ayrılmış personel ve limit kontrolleri yapılır.
   5. Parti sürümü DONDURULUR ve toplam tutara göre onay şablonu çözülür.
   6. Onaydan sonra sağlayıcıya IDEMPOTENCY KEY ile gönderilir. ZAMAN AŞIMI
      BAŞARISIZLIK ANLAMINA GELMEZ; önce sağlayıcıdan DURUM SORGULANIR.
   7. Sonuçlar satır bazında başarılı / reddedildi / beklemede / teknik hata
      olarak kaydedilir. YALNIZ TEKNİK HATA güvenli tekrar edilir.
   8. İç defter, sağlayıcı ekstresi ve banka çıkışı mutabık olmadan parti
      KAPATILMAZ.

   Tutar hiçbir adımda kullanıcı formundan gelmez: politika × gün.
   ========================================================================== */
import { sorgu, tek, calistir, islem } from '../../cekirdek/db.mjs';
import { kimlik } from '../../cekirdek/kimlikler.mjs';
import { sonrakiKod } from '../isakisi/numara.mjs';
import { simdi, gunAnahtari, gunBaslangici, GUN_MS } from '../../cekirdek/zaman.mjs';
import { DogrulamaHatasi, GecisIzinsiz, Cakisma, Bulunamadi } from '../../cekirdek/hata.mjs';
import * as audit from '../../cekirdek/audit.mjs';
import * as defter from './defter.mjs';
import * as A from './adaptor.mjs';

/* --- Dönem yardımcıları --------------------------------------------------- */
/** `YYYY-AA` dönem anahtarını [başlangıç, bitiş) milisaniyeye çevirir. */
export function donemAraligi(donem) {
  const [y, a] = String(donem || '').split('-').map(Number);
  if (!y || !a || a < 1 || a > 12) {
    throw DogrulamaHatasi('Dönem "YYYY-AA" biçiminde olmalı.', { alanlar: { donem: ['Örn. 2026-09'] } });
  }
  const bas = Date.UTC(y, a - 1, 1);
  const son = Date.UTC(a === 12 ? y + 1 : y, a === 12 ? 0 : a, 1);
  return { bas, son, gunSayisi: Math.round((son - bas) / GUN_MS) };
}

export const donemGecerliMi = (d) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(d || ''));

/* --- Politika çözümü (§6.4 madde 3) --------------------------------------- */
/**
 * ETKİLİ TARİHLİ politika: dönem başlangıcında yürürlükte olan, ONAYLI ve en
 * yüksek sürümlü kayıt. Tutar kodda sabit değildir — politika değişince
 * geçmiş partiler etkilenmez, çünkü parti kendi politika kimliğini saklar.
 */
export function politikaCoz(tenantId, urunId, donem) {
  const { bas } = donemAraligi(donem);
  return tek(
    `SELECT * FROM kart_politikasi
      WHERE tenant_id = ? AND urun_id = ? AND durum = 'onaylandi'
        AND gecerli_baslangic <= ?
        AND (gecerli_bitis IS NULL OR gecerli_bitis >= ?)
      ORDER BY gecerli_baslangic DESC, surum_no DESC LIMIT 1`,
    tenantId, urunId, bas, bas);
}

/* --- Uygunluk hesabı (§6.4 madde 2) --------------------------------------- */
/**
 * Kimin, kaç gün ve ne kadar alacağını HESAPLAR. Hiçbir değer formdan gelmez.
 * Her satır neden dahil/hariç olduğunu taşır — kullanıcı listeyi denetleyebilir.
 *
 * @returns {{satirlar:Array, haricler:Array, toplamMinor:number}}
 */
export function uygunlukHesapla(ctx, { hesapId, urunId, donem, politika }) {
  const { bas, son, gunSayisi } = donemAraligi(donem);
  const hesap = tek('SELECT * FROM saglayici_hesabi WHERE id = ? AND tenant_id = ?', hesapId, ctx.tenant.id);
  if (!hesap) throw Bulunamadi('Sağlayıcı hesabı bulunamadı.');
  const urun = tek('SELECT * FROM kart_urunu WHERE id = ? AND tenant_id = ?', urunId, ctx.tenant.id);
  if (!urun) throw Bulunamadi('Kart ürünü bulunamadı.');

  /* Bu hesap + ürün altındaki her kart, aktif ataması ve personeliyle. */
  const kartlar = sorgu(
    `SELECT k.*, a.personel_id, a.baslangic AS atama_baslangic, a.bitis AS atama_bitis,
            p.ad_soyad, p.durum AS personel_durum, p.ise_giris, p.isten_cikis
       FROM kart k
       LEFT JOIN kart_atamasi a
         ON a.kart_id = k.id AND a.durum = 'aktif'
        AND a.baslangic < ? AND (a.bitis IS NULL OR a.bitis >= ?)
       LEFT JOIN personel p ON p.id = a.personel_id
      WHERE k.hesap_id = ? AND (k.urun_id = ? OR k.urun_id IS NULL)
      ORDER BY k.kod`, son, bas, hesapId, urunId);

  const satirlar = [];
  const haricler = [];
  const haric = (k, neden) => haricler.push({
    kartId: k.id, kod: k.kod, maskeliNo: k.maskeli_no, adSoyad: k.ad_soyad || null, neden });

  for (const k of kartlar) {
    /* 4. kontrol — pasif/bloke kart yükleme almaz. */
    if (k.durum !== 'aktif') { haric(k, `Kart "${k.durum}" durumunda; yalnız aktif kart yükleme alır.`); continue; }
    /* Para birimi uyuşmazlığı sessizce dönüştürülmez. */
    if ((urun.para_birimi || 'TRY') !== (hesap.para_birimi || 'TRY')) {
      haric(k, `Ürün para birimi (${urun.para_birimi}) hesap para birimiyle (${hesap.para_birimi}) uyuşmuyor.`);
      continue;
    }
    /* Havuz kartı kişiye bağlı değildir: politika gün kaynağı puantajsa alamaz. */
    if (!k.personel_id) {
      if (k.havuz && politika.gun_kaynagi !== 'puantaj') {
        const gun = politika.sabit_gun || gunSayisi;
        satirlar.push(satirYap(k, null, gun, politika, 'Havuz kartı — sabit gün'));
      } else haric(k, 'Kartın aktif ataması yok; kime yükleneceği belirsiz.');
      continue;
    }
    /* 4. kontrol — ayrılmış personel. */
    if (politika.ayrilan_haric && k.personel_durum === 'ayrildi') {
      haric(k, 'Personel işten ayrılmış.'); continue;
    }
    if (k.personel_durum !== 'aktif' && k.personel_durum !== 'izinli') {
      haric(k, `Personel "${k.personel_durum}" durumunda; aktif çalışma yok.`); continue;
    }
    if (k.isten_cikis && k.isten_cikis < bas) { haric(k, 'Personel dönem başından önce ayrılmış.'); continue; }

    const gun = gunHesapla(ctx, k, { bas, son, gunSayisi, politika });
    if (gun.sayi <= 0) { haric(k, gun.aciklama || 'Dönemde ücretli çalışma günü yok.'); continue; }
    satirlar.push(satirYap(k, k.personel_id, gun.sayi, politika, gun.aciklama));
  }

  const toplamMinor = satirlar.reduce((t, s) => t + s.tutarMinor, 0);
  return { satirlar, haricler, toplamMinor, politika, urun, hesap, gunSayisi };
}

function satirYap(kart, personelId, gun, politika, aciklama) {
  let tutar = gun * Number(politika.gunluk_tutar_minor);
  let kirpildi = false;
  if (politika.azami_tutar_minor && tutar > Number(politika.azami_tutar_minor)) {
    tutar = Number(politika.azami_tutar_minor);
    kirpildi = true;
  }
  return {
    kartId: kart.id, kod: kart.kod, maskeliNo: kart.maskeli_no,
    personelId, adSoyad: kart.ad_soyad || null,
    gunSayisi: gun, tutarMinor: tutar,
    aciklama: kirpildi ? `${aciklama} · politika üst sınırına kırpıldı` : aciklama,
  };
}

/**
 * Gün sayısı: politikanın `gun_kaynagi` alanı belirler.
 *  · puantaj — dönemdeki ücretli çalışma günü (ücretsiz izin düşülür)
 *  · sabit   — politikadaki sabit gün
 *  · takvim  — dönemin takvim günü
 */
function gunHesapla(ctx, kart, { bas, son, gunSayisi, politika }) {
  if (politika.gun_kaynagi === 'sabit') {
    return { sayi: politika.sabit_gun || 0, aciklama: `Politika sabit günü: ${politika.sabit_gun || 0}` };
  }
  if (politika.gun_kaynagi === 'takvim') {
    return { sayi: gunSayisi, aciklama: `Takvim günü: ${gunSayisi}` };
  }
  /* puantaj — GERÇEK puantaj kayıtlarından. `gun` gün anahtarı (YYYY-AA-GG)
     olarak saklanır; yalnız KİLİTLİ (dönem kapanışıyla dondurulmuş) ve fiilen
     çalışılmış günler sayılır. Kilitlenmemiş puantaj yükleme üretmez —
     kapanmamış dönemden para çıkmaz. */
  const calisilan = Number(tek(
    `SELECT COUNT(*) AS n FROM puantaj
      WHERE personel_id = ? AND gun >= ? AND gun < ? AND kilit = 1 AND normal_saat > 0`,
    kart.personel_id, gunAnahtari(bas), gunAnahtari(son))?.n ?? 0);
  if (!calisilan) {
    return { sayi: 0, aciklama: 'Dönemde kilitli puantaj günü yok (dönem kapanmamış olabilir).' };
  }
  let ucretsiz = 0;
  if (politika.ucretsiz_izin_haric) {
    ucretsiz = Number(tek(
      `SELECT COALESCE(SUM(gun_sayisi), 0) AS n FROM izin
        WHERE personel_id = ? AND tur = 'ucretsiz' AND durum = 'onaylandi'
          AND baslangic < ? AND bitis >= ?`, kart.personel_id, son, bas)?.n ?? 0);
  }
  const sayi = Math.max(0, calisilan - ucretsiz);
  return { sayi,
    aciklama: ucretsiz ? `${calisilan} puantaj günü − ${ucretsiz} ücretsiz izin` : `${calisilan} puantaj günü` };
}

/* --- Parti oluşturma (§6.4 madde 1-5) ------------------------------------- */
/**
 * Partiyi ve satırlarını yazar. Mükerrer dönem kontrolü veritabanı kısıtındadır
 * (hesap, ürün, dönem, kaynak tekil); burada kullanıcıya anlamlı hata veriyoruz.
 */
export function partiOlustur(ctx, { hesapId, urunId, donem, kaynak = 'puantaj',
                                    idempotencyAnahtari = null }) {
  if (!donemGecerliMi(donem)) {
    throw DogrulamaHatasi('Dönem "YYYY-AA" biçiminde olmalı.', { alanlar: { donem: ['Örn. 2026-09'] } });
  }
  const mevcut = tek(
    `SELECT kod, durum FROM kart_yukleme_partisi
      WHERE hesap_id = ? AND urun_id = ? AND donem = ? AND kaynak = ?`, hesapId, urunId, donem, kaynak);
  if (mevcut) {
    throw Cakisma(`${donem} dönemi için bu hesap ve üründe zaten bir parti var: `
      + `${mevcut.kod} (${mevcut.durum}). Mükerrer yükleme finansal etki üretemez.`);
  }
  const urun = tek('SELECT * FROM kart_urunu WHERE id = ? AND tenant_id = ?', urunId, ctx.tenant.id);
  if (!urun) throw Bulunamadi('Kart ürünü bulunamadı.');
  const politika = politikaCoz(ctx.tenant.id, urunId, donem);
  if (!politika) {
    throw DogrulamaHatasi(
      `${donem} döneminde ${urun.ad} için yürürlükte ONAYLI bir politika yok. `
      + 'Tutar politikadan hesaplanır; politika olmadan parti açılamaz.');
  }

  const hesaplama = uygunlukHesapla(ctx, { hesapId, urunId, donem, politika });
  if (!hesaplama.satirlar.length) {
    throw DogrulamaHatasi('Bu dönemde uygun kart bulunamadı; parti boş olurdu.',
      { ayrinti: { haricler: hesaplama.haricler.slice(0, 20) } });
  }

  return islem(() => {
    /* Kod üretimi transaction İÇİNDE olmalı: numara sayacı da bu işlemin parçası. */
    const kod = sonrakiKod(ctx.tenant.id, 'kart_yukleme');
    const partiId = kimlik('parti');
    calistir(`INSERT INTO kart_yukleme_partisi (id, tenant_id, hesap_id, urun_id, politika_id,
                kod, donem, kaynak, toplam_minor, satir_sayisi, tutar_birim, surum_no,
                idempotency_anahtari, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?, 'taslak', ?,?)`,
      partiId, ctx.tenant.id, hesapId, urunId, politika.id, kod, donem, kaynak,
      String(hesaplama.toplamMinor), hesaplama.satirlar.length,
      urun.para_birimi || 'TRY', idempotencyAnahtari || kimlik('idempotency'),
      ctx.kullanici.id, simdi());

    for (const s of hesaplama.satirlar) satirYaz(partiId, s, urun.para_birimi || 'TRY');

    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'kart_yukleme_partisi', nesneId: partiId, eylem: 'olustur',
      sonraki: { kod, donem, kaynak, politika: politika.kod,
        satir: hesaplama.satirlar.length, toplamMinor: String(hesaplama.toplamMinor) } });
    return { id: partiId, kod, ...hesaplama };
  });
}

function satirYaz(partiId, s, birim) {
  calistir(`INSERT INTO kart_yukleme_satiri (id, parti_id, kart_id, personel_id, gun_sayisi,
              tutar_minor, tutar_birim, istisna_gerekcesi, durum, olusturuldu)
            VALUES (?,?,?,?,?,?,?,?, 'bekliyor', ?)`,
    kimlik('satir'), partiId, s.kartId, s.personelId || null, s.gunSayisi,
    String(s.tutarMinor), birim, s.istisnaGerekcesi || null, simdi());
}

/** Parti toplamı SATIRLARDAN türer; elle yazılan toplam alanı yoktur (K-064). */
export function toplamiYenile(partiId) {
  const t = tek(
    `SELECT COALESCE(SUM(tutar_minor), 0) AS toplam, COUNT(*) AS adet
       FROM kart_yukleme_satiri WHERE parti_id = ? AND durum <> 'iptal'`, partiId);
  calistir('UPDATE kart_yukleme_partisi SET toplam_minor = ?, satir_sayisi = ? WHERE id = ?',
    String(t?.toplam ?? 0), Number(t?.adet ?? 0), partiId);
  return { toplamMinor: Number(t?.toplam ?? 0), satirSayisi: Number(t?.adet ?? 0) };
}

/* --- İstisna (§6.4 madde 3) ----------------------------------------------- */
/**
 * Yetkili kullanıcı bir satırın tutarını politikadan SAPTIRABİLİR, ama:
 *   · gerekçe zorunludur,
 *   · yalnız TASLAK partide yapılabilir (dondurulmuş parti değişmez),
 *   · sapma audit'e ayrı eylem olarak düşer.
 */
export function istisnaUygula(ctx, { parti, satirId, yeniTutarMinor, gerekce }) {
  if (parti.durum !== 'taslak') {
    throw GecisIzinsiz('Yalnız taslak partide istisna tanımlanabilir; dondurulmuş parti değişmez.');
  }
  if (!String(gerekce || '').trim()) {
    throw DogrulamaHatasi('İstisna için gerekçe zorunludur.', { alanlar: { gerekce: ['Gerekçe girin.'] } });
  }
  const s = tek('SELECT * FROM kart_yukleme_satiri WHERE id = ? AND parti_id = ?', satirId, parti.id);
  if (!s) throw Bulunamadi('Satır bulunamadı.');
  const tutar = BigInt(yeniTutarMinor ?? 0);
  if (tutar <= 0n) throw DogrulamaHatasi('Tutar sıfırdan büyük olmalı.', { alanlar: { tutar: ['Tutar girin.'] } });

  return islem(() => {
    calistir(`UPDATE kart_yukleme_satiri SET tutar_minor = ?, istisna_gerekcesi = ?, guncellendi = ?
               WHERE id = ?`, String(tutar), gerekce.trim(), simdi(), satirId);
    const y = toplamiYenile(parti.id);
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'kart_yukleme_satiri', nesneId: satirId, eylem: 'istisna', gerekce,
      onceki: { tutarMinor: String(s.tutar_minor) }, sonraki: { tutarMinor: String(tutar) } });
    return y;
  });
}

/* --- Doğrulama (§6.4 madde 4) --------------------------------------------- */
/**
 * Partiyi gönderime hazır hâle getirmeden ÖNCEKİ tüm kontroller.
 * Her bulgu satır kimliğiyle döner; kullanıcı neyin neden engellediğini görür.
 */
export function partiDogrula(ctx, parti) {
  const bulgular = [];
  const satirlar = sorgu(
    `SELECT s.*, k.durum AS kart_durum, k.kod AS kart_kod, k.maskeli_no, k.hesap_id,
            p.durum AS personel_durum, p.ad_soyad
       FROM kart_yukleme_satiri s
       JOIN kart k ON k.id = s.kart_id
       LEFT JOIN personel p ON p.id = s.personel_id
      WHERE s.parti_id = ? AND s.durum <> 'iptal'`, parti.id);

  if (!satirlar.length) bulgular.push({ agirlik: 'engel', mesaj: 'Partide satır yok.' });

  const gorulen = new Set();
  for (const s of satirlar) {
    if (gorulen.has(s.kart_id)) {
      bulgular.push({ agirlik: 'engel', satirId: s.id, mesaj: `${s.kart_kod} kartı partide birden çok kez var.` });
    }
    gorulen.add(s.kart_id);
    if (s.hesap_id !== parti.hesap_id) {
      bulgular.push({ agirlik: 'engel', satirId: s.id,
        mesaj: `${s.kart_kod} başka bir sağlayıcı hesabına ait.` });
    }
    if (s.kart_durum !== 'aktif') {
      bulgular.push({ agirlik: 'engel', satirId: s.id,
        mesaj: `${s.kart_kod} kartı "${s.kart_durum}" durumunda; yükleme alamaz.` });
    }
    if (Number(s.tutar_minor) <= 0) {
      bulgular.push({ agirlik: 'engel', satirId: s.id, mesaj: `${s.kart_kod} tutarı sıfır veya negatif.` });
    }
    if (s.tutar_birim !== parti.tutar_birim) {
      bulgular.push({ agirlik: 'engel', satirId: s.id,
        mesaj: `${s.kart_kod} para birimi (${s.tutar_birim}) parti para birimiyle uyuşmuyor.` });
    }
    if (s.personel_id && s.personel_durum === 'ayrildi') {
      bulgular.push({ agirlik: 'engel', satirId: s.id, mesaj: `${s.ad_soyad} işten ayrılmış.` });
    }
  }

  /* Aynı kart, aynı dönemde başka bir partide de yer alıyor mu? */
  const cakisan = sorgu(
    `SELECT s2.kart_id, p2.kod FROM kart_yukleme_satiri s2
       JOIN kart_yukleme_partisi p2 ON p2.id = s2.parti_id
      WHERE p2.donem = ? AND p2.id <> ? AND p2.durum NOT IN ('iptal','hatali')
        AND s2.durum NOT IN ('iptal','reddedildi')
        AND s2.kart_id IN (SELECT kart_id FROM kart_yukleme_satiri WHERE parti_id = ?)`,
    parti.donem, parti.id, parti.id);
  for (const c of cakisan) {
    bulgular.push({ agirlik: 'engel',
      mesaj: `Bir kart ${parti.donem} döneminde ${c.kod} partisinde de yükleme alıyor (mükerrer dönem).` });
  }

  const politika = parti.politika_id ? tek('SELECT * FROM kart_politikasi WHERE id = ?', parti.politika_id) : null;
  if (!politika) bulgular.push({ agirlik: 'engel', mesaj: 'Partinin politikası bulunamadı.' });
  else if (politika.durum !== 'onaylandi') {
    bulgular.push({ agirlik: 'engel', mesaj: `Politika "${politika.durum}" durumunda; onaylı olmalı.` });
  }

  return { bulgular, engel: bulgular.some((b) => b.agirlik === 'engel'), satirlar };
}

/* --- Gönderim (§6.4 madde 6-7) -------------------------------------------- */
/**
 * Onaylı partiyi sağlayıcıya gönderir.
 *
 * · Aynı idempotency anahtarıyla ikinci gönderim FİNANSAL ETKİ ÜRETMEZ.
 * · Zaman aşımında ÖNCE DURUM SORGULANIR; sorgulanamazsa satırlar
 *   'gonderildi' kalır ve elle karar bekler — asla tekrar gönderilmez.
 * · Sonuç satır bazlıdır; başarılı satır ikinci kez gönderilmez.
 */
export async function partiGonder(ctx, parti) {
  if (parti.durum !== 'onay_bekliyor' && parti.durum !== 'gonderiliyor' && parti.durum !== 'kismi') {
    throw GecisIzinsiz(
      `Yalnız onaylanmış parti gönderilir. Parti "${parti.durum}" durumunda.`);
  }
  const hesap = tek('SELECT * FROM saglayici_hesabi WHERE id = ?', parti.hesap_id);
  const entegrasyon = hesap?.entegrasyon_id
    ? tek('SELECT * FROM entegrasyon WHERE id = ?', hesap.entegrasyon_id) : null;

  /* Yalnız GÖNDERİLMEMİŞ ve TEKNİK HATAlı satırlar gönderilir.
     Başarılı satır tekrar gönderilmez (CRD-04); reddedilen satır da
     gönderilmez — tekrar aynı reddi üretir (K-088). */
  const gonderilecek = sorgu(
    `SELECT s.*, k.saglayici_token, k.kod AS kart_kod FROM kart_yukleme_satiri s
       JOIN kart k ON k.id = s.kart_id
      WHERE s.parti_id = ? AND s.durum IN ('bekliyor','teknik_hata')`, parti.id);

  if (!gonderilecek.length) {
    return { gonderilen: 0, mesaj: 'Gönderilecek satır yok; tüm satırlar sonuçlanmış.' };
  }

  const sonuc = await A.cagriYurut(ctx, {
    entegrasyon, yetenek: 'yuklemeGonder',
    girdi: { parti, satirlar: gonderilecek },
    kaynakNesne: 'kart_yukleme_partisi', kaynakId: parti.id,
    idempotencyAnahtari: parti.idempotency_anahtari,
  });

  /* ZAMAN AŞIMI: sonuç bilinmiyor → önce durum sorgulanır (§6.4 madde 6). */
  let nihai = sonuc;
  if (sonuc.durum === 'bilinmiyor' && A.yetenekli(entegrasyon?.adaptor, 'yuklemeDurum')) {
    nihai = await A.cagriYurut(ctx, {
      entegrasyon, yetenek: 'yuklemeDurum', girdi: { parti },
      kaynakNesne: 'kart_yukleme_partisi', kaynakId: parti.id,
      idempotencyAnahtari: `${parti.idempotency_anahtari}#durum`,
    });
  }

  return islem(() => {
    calistir('UPDATE kart_yukleme_partisi SET gonderim_zamani = ? WHERE id = ?', simdi(), parti.id);
    const satirDurumu = {
      basarili: 'basarili', reddedildi: 'reddedildi',
      teknik_hata: 'teknik_hata', bilinmiyor: 'gonderildi',
    }[nihai.durum] || 'gonderildi';

    for (const s of gonderilecek) {
      calistir(`UPDATE kart_yukleme_satiri SET durum = ?, hata_kodu = ?, hata_mesaji = ?,
                  deneme_sayisi = deneme_sayisi + 1, son_deneme = ?, guncellendi = ? WHERE id = ?`,
        satirDurumu, nihai.kod || null, nihai.mesaj ? String(nihai.mesaj).slice(0, 300) : null,
        simdi(), simdi(), s.id);
    }
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'kart_yukleme_partisi', nesneId: parti.id, eylem: 'gonder',
      sonraki: { satir: gonderilecek.length, sonuc: nihai.durum, kod: nihai.kod } });

    return { gonderilen: gonderilecek.length, sonuc: nihai, satirDurumu };
  });
}

/**
 * Satır bazlı sonucu işler (sağlayıcı yanıtı veya sonuç dosyası).
 * BAŞARILI satır kart defterine hareket yazar — burası paranın karta girdiği
 * tek yerdir. Aynı satır iki kez muhasebeleşemez: `hareket_id` doluysa atlanır.
 */
export function sonucIsle(ctx, parti, sonuclar) {
  return islem(() => {
    let basarili = 0; let reddedilen = 0; let teknik = 0;
    for (const r of sonuclar) {
      const s = tek('SELECT * FROM kart_yukleme_satiri WHERE id = ? AND parti_id = ?', r.satirId, parti.id);
      if (!s) continue;
      if (s.hareket_id) { basarili++; continue; }   // zaten muhasebeleşmiş

      if (r.durum === 'basarili') {
        const hareketId = defter.hareketYaz(ctx, {
          kartId: s.kart_id, tur: 'yukleme', tutarMinor: s.tutar_minor, tutarBirim: s.tutar_birim,
          kesinlesmis: 1, personelId: s.personel_id, saglayiciReferans: r.referans || null,
          kaynakNesne: 'kart_yukleme_partisi', kaynakId: parti.id,
          aciklama: `${parti.donem} dönemi yüklemesi (${parti.kod})`,
        });
        calistir(`UPDATE kart_yukleme_satiri SET durum = 'basarili', saglayici_referans = ?,
                    hareket_id = ?, hata_kodu = NULL, hata_mesaji = NULL, guncellendi = ? WHERE id = ?`,
          r.referans || null, hareketId, simdi(), s.id);
        basarili++;
      } else if (r.durum === 'reddedildi') {
        calistir(`UPDATE kart_yukleme_satiri SET durum = 'reddedildi', hata_kodu = ?,
                    hata_mesaji = ?, guncellendi = ? WHERE id = ?`,
          r.kod || null, (r.mesaj || '').slice(0, 300), simdi(), s.id);
        reddedilen++;
      } else {
        calistir(`UPDATE kart_yukleme_satiri SET durum = 'teknik_hata', hata_kodu = ?,
                    hata_mesaji = ?, guncellendi = ? WHERE id = ?`,
          r.kod || null, (r.mesaj || '').slice(0, 300), simdi(), s.id);
        teknik++;
      }
    }
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'kart_yukleme_partisi', nesneId: parti.id, eylem: 'sonuc_isle',
      sonraki: { basarili, reddedilen, teknik } });
    return { basarili, reddedilen, teknik };
  });
}

/** Parti satır özeti — ekran ve durum kararı bundan türer. */
export function satirOzeti(partiId) {
  const s = tek(
    `SELECT COUNT(*) AS toplam,
            SUM(durum = 'basarili') AS basarili,
            SUM(durum = 'reddedildi') AS reddedildi,
            SUM(durum = 'teknik_hata') AS teknik_hata,
            SUM(durum = 'gonderildi') AS gonderildi,
            SUM(durum = 'bekliyor') AS bekliyor,
            SUM(durum = 'iptal') AS iptal,
            COALESCE(SUM(CASE WHEN durum = 'basarili' THEN tutar_minor END), 0) AS basarili_minor
       FROM kart_yukleme_satiri WHERE parti_id = ?`, partiId);
  const s2 = Object.fromEntries(Object.entries(s || {}).map(([k, v]) => [k, Number(v || 0)]));
  return { ...s2, tamamlandi: s2.bekliyor === 0 && s2.gonderildi === 0 && s2.teknik_hata === 0 };
}

/**
 * Satır özetinden PARTİ durumunu ÇÖZER — kullanıcı nihai durumu seçemez
 * (kural 5). Geçiş motoru bu eylemi `yalnizMotor` olarak uygular.
 */
export function sonucEylemi(ozet) {
  if (!ozet.tamamlandi) return null;                       // hâlâ bekleyen var
  if (ozet.basarili === 0) return 'sonuc_hatali';
  if (ozet.reddedildi > 0 || ozet.iptal > 0) return 'sonuc_kismi';
  return 'sonuc_basarili';
}

/* --- Mutabakat (§6.4 madde 8) --------------------------------------------- */
/**
 * ÜÇ YÖNLÜ mutabakat: iç defter + sağlayıcı ekstresi + banka çıkışı.
 * Fark sıfır DEĞİLSE ve onaylı açıklama YOKSA parti kapanamaz.
 */
export function mutabakatHesapla(tenantId, hesapId, donem, { saglayiciToplam = null, bankaToplam = null } = {}) {
  const { bas, son } = donemAraligi(donem);
  const icToplam = defter.hesapToplami(hesapId, { baslangic: bas, bitis: son, tur: 'yukleme' });
  const fark = [icToplam, saglayiciToplam, bankaToplam].filter((x) => x != null);
  const enBuyuk = Math.max(...fark);
  const enKucuk = Math.min(...fark);
  return {
    icToplam,
    saglayiciToplam: saglayiciToplam ?? null,
    bankaToplam: bankaToplam ?? null,
    farkMinor: fark.length > 1 ? enBuyuk - enKucuk : 0,
    eksikKaynak: [saglayiciToplam == null ? 'sağlayıcı ekstresi' : null,
      bankaToplam == null ? 'banka çıkışı' : null].filter(Boolean),
    veriTarihi: simdi(),
  };
}

/** Parti kapanış engelleri — üç kaynak mutabık olmadan kapanmaz. */
export function kapanisEngelleri(parti) {
  const engeller = [];
  const ozet = satirOzeti(parti.id);
  if (!ozet.tamamlandi) engeller.push('Sonuçlanmamış satır var.');
  const m = tek('SELECT * FROM kart_mutabakati WHERE hesap_id = ? AND donem = ?', parti.hesap_id, parti.donem);
  if (!m) engeller.push('Dönem mutabakatı açılmamış.');
  else {
    if (m.saglayici_toplam_minor == null) engeller.push('Sağlayıcı ekstresi girilmemiş.');
    if (m.banka_toplam_minor == null) engeller.push('Banka çıkışı girilmemiş.');
    if (Number(m.fark_minor) !== 0 && m.durum !== 'onaylandi') {
      engeller.push('Mutabakat farkı var ve açıklaması onaylanmamış.');
    }
  }
  if (!parti.banka_hareket_id) engeller.push('Banka hareketi partiye eşleştirilmemiş.');
  return engeller;
}

