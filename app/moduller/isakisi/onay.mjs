/* ============================================================================
   MERKEZİ ONAY MOTORU — doküman §5.3
   ----------------------------------------------------------------------------
   Şart listesi ve karşılıkları:
     · Şablon; nesne türü, şirket, proje, tutar aralığı, maliyet kodu, risk
       sınıfı ve işlem türüne göre SEÇİLİR         → sablonSec()
     · Adımlar sıralı veya paralel olabilir         → onay_adimi.paralel/gereken_onay
     · Talep sahibi kendi kaydını onaylayamaz       → kararVer() dört göz kontrolü
     · Onaycı kullanıcı adı FORMDAN SEÇİLMEZ; rol ve bağlamdan çözülür
                                                     → adimAdaylari()
     · Vekaletler süreli ve audit kayıtlı            → vekalet.mjs
     · Revizyon sonrası önceki onaylar politikaya göre geçersizleşir
                                                     → revizyonda_onaylar_gecersiz
     · Ret ve revizyonda gerekçe zorunlu             → kararVer()
     · Onay ekranı KARAR VERİLEN SÜRÜMÜ sabit gösterir → belge_surum dondurulur
   ========================================================================== */
import { sorgu, tek, calistir, islem } from '../../cekirdek/db.mjs';
import { kimlik } from '../../cekirdek/kimlikler.mjs';
import { simdi } from '../../cekirdek/zaman.mjs';
import { YetkiYok, DogrulamaHatasi, Bulunamadi, GecisIzinsiz, Cakisma } from '../../cekirdek/hata.mjs';
import * as audit from '../../cekirdek/audit.mjs';
import { bildir, roleBildir } from './bildirim.mjs';
import { vekilOlduklari } from './vekalet.mjs';
import { tutarTavani } from '../kimlik/yetki.mjs';

const SAAT_MS = 3600_000;

/* --- Şablon seçimi -------------------------------------------------------- */
/**
 * En ÖZEL eşleşen yayınlanmış şablonu seçer (proje > şirket > genel; dar tutar
 * aralığı geniş aralığı yener). Eşleşme yoksa hata: onaysız akış başlatılamaz.
 */
export function sablonSec(tenantId, { nesne, sirketId = null, projeId = null,
                                      tutarMinor = null, maliyetKodu = null, riskSinifi = null, islemTuru = null }) {
  const t = simdi();
  const adaylar = sorgu(
    `SELECT * FROM is_akisi_sablonu
      WHERE tenant_id = ? AND nesne = ? AND durum = 'yayinda'
        AND (gecerli_bas IS NULL OR gecerli_bas <= ?)
        AND (gecerli_bit IS NULL OR gecerli_bit >= ?)`,
    tenantId, nesne, t, t)
    .filter((s) => !s.sirket_id || s.sirket_id === sirketId)
    .filter((s) => !s.proje_id || s.proje_id === projeId)
    .filter((s) => !s.maliyet_kodu || s.maliyet_kodu === maliyetKodu)
    .filter((s) => !s.risk_sinifi || s.risk_sinifi === riskSinifi)
    .filter((s) => !s.islem_turu || s.islem_turu === islemTuru)
    .filter((s) => {
      if (tutarMinor == null) return s.tutar_alt_minor == null && s.tutar_ust_minor == null;
      const alt = s.tutar_alt_minor ?? 0n;
      const ust = s.tutar_ust_minor;
      const v = BigInt(tutarMinor);
      return v >= BigInt(alt) && (ust == null || v <= BigInt(ust));
    });

  if (!adaylar.length) return null;

  const puan = (s) => (s.proje_id ? 8 : 0) + (s.sirket_id ? 4 : 0) + (s.maliyet_kodu ? 2 : 0)
    + (s.risk_sinifi ? 1 : 0) + (s.islem_turu ? 1 : 0)
    + (s.tutar_ust_minor != null ? 1 : 0);
  return adaylar.sort((a, b) => puan(b) - puan(a) || b.surum - a.surum)[0];
}

/* --- Onaya gönderme ------------------------------------------------------- */
/**
 * @returns {{talepId:string, adimSayisi:number}}
 */
export function onayaGonder(ctx, { nesne, nesneId, nesneKod, baslik, belgeSurum,
                                   tutarMinor = null, tutarBirim = null,
                                   sirketId = null, projeId = null, santiyeId = null,
                                   maliyetKodu = null, riskSinifi = null, islemTuru = null, gerekce = null }) {
  const acik = tek(
    `SELECT id FROM onay_talebi WHERE nesne = ? AND nesne_id = ? AND durum = 'acik'`, nesne, nesneId);
  if (acik) throw Cakisma('Bu kayıt için zaten açık bir onay talebi var.');

  const sablon = sablonSec(ctx.tenant.id, { nesne, sirketId, projeId, tutarMinor, maliyetKodu, riskSinifi, islemTuru });
  if (!sablon) {
    /* Onaysız doğrudan etki YASAK: şablon yoksa akış başlatılmaz, kayıt taslakta kalır. */
    throw DogrulamaHatasi(
      'Bu kayıt için tanımlı bir onay akışı yok. Ayarlar > İş akışı şablonlarından tanım yapılmalı.');
  }
  const adimlar = sorgu('SELECT * FROM is_akisi_adimi WHERE sablon_id = ? ORDER BY sira, rol_kodu', sablon.id);
  if (!adimlar.length) throw DogrulamaHatasi('Seçilen onay şablonunda adım tanımlı değil.');

  return islem(() => {
    const talepId = kimlik('onay');
    const slaBitis = sablon.sla_saat ? simdi() + sablon.sla_saat * SAAT_MS : null;
    calistir(`INSERT INTO onay_talebi
      (id, tenant_id, sablon_id, sablon_surum, nesne, nesne_id, nesne_kod, baslik, belge_surum,
       tutar_minor, tutar_birim, sirket_id, proje_id, santiye_id, talep_eden, gerekce, sla_bitis, olusturan, olusturuldu)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      talepId, ctx.tenant.id, sablon.id, sablon.surum, nesne, nesneId, nesneKod, baslik, belgeSurum,
      tutarMinor == null ? null : String(tutarMinor), tutarBirim, sirketId, projeId, santiyeId,
      ctx.kullanici.id, gerekce, slaBitis, ctx.kullanici.id, simdi());

    /* Adımlar dondurulur: şablon sonradan değişse bile bu talep aynı akışla yürür. */
    const ilkSira = adimlar[0].sira;
    for (const a of adimlar) {
      const ilkMi = a.sira === ilkSira;
      calistir(`INSERT INTO onay_adimi (id, talep_id, sira, ad, rol_kodu, paralel, gereken_onay, durum, sla_bitis, acildi)
                VALUES (?,?,?,?,?,?,?,?,?,?)`,
        kimlik('gorevAdim'), talepId, a.sira, a.ad, a.rol_kodu, a.paralel, a.gereken_onay,
        ilkMi ? 'acik' : 'bekliyor',
        a.sla_saat ? simdi() + a.sla_saat * SAAT_MS : slaBitis,
        ilkMi ? simdi() : null);
    }

    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'onay_talebi', nesneId: talepId, eylem: 'olustur', gerekce,
      sonraki: { nesne, nesneId, belgeSurum, sablon: sablon.kod, sablonSurum: sablon.surum, adim: adimlar.length } });

    adimBildir(ctx, talepId, ilkSira, baslik);
    return { talepId, adimSayisi: adimlar.length, sablon };
  });
}

function adimBildir(ctx, talepId, sira, baslik) {
  const adimlar = sorgu(`SELECT * FROM onay_adimi WHERE talep_id = ? AND sira = ?`, talepId, sira);
  for (const a of adimlar) {
    roleBildir(ctx, {
      rolKodu: a.rol_kodu, tur: 'onay_bekliyor',
      baslik: 'Onayınız bekleniyor', govde: baslik,
      nesne: 'onay_talebi', nesneId: talepId, rota: `/onaylar/${talepId}`, onem: 'uyari',
    });
  }
}

/* --- Onaycı çözümü -------------------------------------------------------- */
/**
 * Bir adımın onaycıları ROLDEN çözülür — formdan seçilmez (§5.3).
 * Vekalet aktifse vekil de aday listesine girer.
 */
export function adimAdaylari(tenantId, adim, { projeId = null, santiyeId = null } = {}) {
  const asil = sorgu(
    `SELECT DISTINCT k.id, k.ad_soyad FROM kullanici_rol kr
       JOIN rol r ON r.id = kr.rol_id
       JOIN kullanici k ON k.id = kr.kullanici_id
      WHERE kr.tenant_id = ? AND r.kod = ? AND k.durum = 'aktif'
        AND (kr.kapsam_tur IS NULL
             OR (kr.kapsam_tur = 'proje' AND kr.kapsam_id = ?)
             OR (kr.kapsam_tur = 'santiye' AND kr.kapsam_id = ?))`,
    tenantId, adim.rol_kodu, projeId, santiyeId);

  const hepsi = new Map(asil.map((a) => [a.id, { ...a, vekaleten: null }]));
  for (const a of asil) {
    for (const v of sorgu(
      `SELECT alan_id, k.ad_soyad FROM vekalet v JOIN kullanici k ON k.id = v.alan_id
        WHERE v.tenant_id = ? AND v.veren_id = ? AND v.durum = 'aktif' AND v.baslangic <= ? AND v.bitis > ?`,
      tenantId, a.id, simdi(), simdi())) {
      if (!hepsi.has(v.alan_id)) hepsi.set(v.alan_id, { id: v.alan_id, ad_soyad: v.ad_soyad, vekaleten: a.id });
    }
  }
  return [...hepsi.values()];
}

/** Kullanıcı bu adımda karar verebilir mi? (rol veya vekalet) */
export function kararVerebilirMi(ctx, talep, adim) {
  const adaylar = adimAdaylari(ctx.tenant.id, adim, { projeId: talep.proje_id, santiyeId: talep.santiye_id });
  return adaylar.find((a) => a.id === ctx.kullanici.id) || null;
}

/* --- Karar --------------------------------------------------------------- */
/**
 * @param {'onayla'|'reddet'|'revizyon_iste'} karar
 * @returns {{talepDurumu:string, sonuc:string|null, sonrakiSira:number|null}}
 */
export function kararVer(ctx, { talepId, karar, gerekce = null, belgeSurum }) {
  const talep = tek('SELECT * FROM onay_talebi WHERE id = ? AND tenant_id = ?', talepId, ctx.tenant.id);
  if (!talep) throw Bulunamadi('Onay talebi bulunamadı.');
  if (talep.durum !== 'acik') throw GecisIzinsiz('Bu onay talebi kapanmış.');

  /* Onay ekranı karar verilen sürümü sabit gösterir; belge değiştiyse karar geçersiz. */
  if (Number(belgeSurum) !== Number(talep.belge_surum)) {
    throw Cakisma('Belge bu sırada revize edildi; kararınız güncel sürüme uygulanamaz. Sayfayı yenileyin.');
  }
  if (['reddet', 'revizyon_iste'].includes(karar) && !String(gerekce || '').trim()) {
    throw DogrulamaHatasi('Ret ve revizyon talebinde gerekçe zorunludur.', { alanlar: { gerekce: ['Gerekçe girin.'] } });
  }

  /* Dört göz: talep sahibi kendi kaydını onaylayamaz. */
  if (talep.talep_eden === ctx.kullanici.id) {
    throw YetkiYok('Kendi talebinizi onaylayamazsınız (görevler ayrılığı).');
  }

  const acikAdimlar = sorgu(`SELECT * FROM onay_adimi WHERE talep_id = ? AND durum = 'acik' ORDER BY sira`, talepId);
  if (!acikAdimlar.length) throw GecisIzinsiz('Açık onay adımı yok.');

  let adim = null, aday = null;
  for (const a of acikAdimlar) {
    const k = kararVerebilirMi(ctx, talep, a);
    if (k) { adim = a; aday = k; break; }
  }
  if (!adim) throw YetkiYok('Bu adımda karar verme yetkiniz yok (rol veya vekalet gerekiyor).');

  /* Tutar tavanı — rolün karar yetkisi tutarla sınırlıysa. */
  const tavan = tutarTavani(ctx, talep.nesne);
  if (tavan != null && talep.tutar_minor != null && BigInt(talep.tutar_minor) > tavan) {
    throw YetkiYok('Bu tutar karar yetkinizin üzerinde; bir üst onay kademesine yönlendirilmelidir.');
  }

  /* Aynı kişi aynı adımda iki kez karar veremez. */
  const oncekiKarar = tek('SELECT id FROM onay_karari WHERE adim_id = ? AND kullanici_id = ?', adim.id, ctx.kullanici.id);
  if (oncekiKarar) throw Cakisma('Bu adımda zaten karar verdiniz.');

  return islem(() => {
    calistir(`INSERT INTO onay_karari (id, adim_id, talep_id, kullanici_id, vekaleten, karar, gerekce, belge_surum, zaman, ip)
              VALUES (?,?,?,?,?,?,?,?,?,?)`,
      kimlik('onay'), adim.id, talepId, ctx.kullanici.id, aday.vekaleten, karar, gerekce,
      talep.belge_surum, simdi(), ctx.ip);

    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'onay_talebi', nesneId: talepId, eylem: `karar:${karar}`, gerekce,
      sonraki: { adim: adim.ad, sira: adim.sira, belgeSurum: talep.belge_surum, vekaleten: aday.vekaleten } });

    /* Ret ve revizyon akışı ANINDA sonlandırır. */
    if (karar !== 'onayla') {
      const sonuc = karar === 'reddet' ? 'reddedildi' : 'revizyon_istendi';
      calistir(`UPDATE onay_adimi SET durum = ?, kapandi = ? WHERE id = ?`, sonuc, simdi(), adim.id);
      calistir(`UPDATE onay_adimi SET durum = 'iptal', kapandi = ? WHERE talep_id = ? AND durum IN ('bekliyor','acik')`,
        simdi(), talepId);
      talebiKapat(ctx, talep, sonuc);
      return { talepDurumu: 'kapali', sonuc, sonrakiSira: null };
    }

    /* Paralel adımda gereken onay sayısına ulaşıldı mı? */
    const ayniSira = sorgu(`SELECT * FROM onay_adimi WHERE talep_id = ? AND sira = ?`, talepId, adim.sira);
    const onaySayisi = Number(tek(
      `SELECT COUNT(DISTINCT kullanici_id) AS n FROM onay_karari k
         JOIN onay_adimi a ON a.id = k.adim_id
        WHERE k.talep_id = ? AND a.sira = ? AND k.karar = 'onayla'`, talepId, adim.sira)?.n ?? 0);
    const gereken = Math.max(...ayniSira.map((a) => a.gereken_onay));
    if (onaySayisi < gereken) {
      return { talepDurumu: 'acik', sonuc: null, sonrakiSira: adim.sira };  // aynı sırada beklemeye devam
    }

    calistir(`UPDATE onay_adimi SET durum = 'onaylandi', kapandi = ? WHERE talep_id = ? AND sira = ? AND durum = 'acik'`,
      simdi(), talepId, adim.sira);

    const sonraki = tek(
      `SELECT MIN(sira) AS s FROM onay_adimi WHERE talep_id = ? AND durum = 'bekliyor'`, talepId)?.s ?? null;
    if (sonraki == null) {
      talebiKapat(ctx, talep, 'onaylandi');
      return { talepDurumu: 'kapali', sonuc: 'onaylandi', sonrakiSira: null };
    }
    calistir(`UPDATE onay_adimi SET durum = 'acik', acildi = ? WHERE talep_id = ? AND sira = ?`,
      simdi(), talepId, sonraki);
    adimBildir(ctx, talepId, sonraki, talep.baslik);
    return { talepDurumu: 'acik', sonuc: null, sonrakiSira: sonraki };
  });
}

function talebiKapat(ctx, talep, sonuc) {
  calistir(`UPDATE onay_talebi SET durum = 'kapali', sonuc = ?, kapandi = ?, guncelleyen = ?, guncellendi = ?, surum = surum + 1
             WHERE id = ?`, sonuc, simdi(), ctx.kullanici.id, simdi(), talep.id);
  bildir(ctx, {
    kullaniciId: talep.talep_eden, tur: 'onay_sonucu',
    baslik: sonuc === 'onaylandi' ? 'Talebiniz onaylandı'
      : sonuc === 'reddedildi' ? 'Talebiniz reddedildi' : 'Talebiniz için revizyon istendi',
    govde: talep.baslik, nesne: talep.nesne, nesneId: talep.nesne_id,
    rota: `/onaylar/${talep.id}`, onem: sonuc === 'onaylandi' ? 'bilgi' : 'uyari',
  });
  /* Onaylanan/beklemedeki bildirimler kapatılır: onay kutusu şişmez. */
  calistir(`UPDATE bildirim SET okundu = ? WHERE nesne = 'onay_talebi' AND nesne_id = ? AND okundu IS NULL
             AND tur = 'onay_bekliyor'`, simdi(), talep.id);
}

/* --- Revizyon: önceki onaylar politikaya göre geçersizleşir -------------- */
/**
 * Belge revize edildiğinde çağrılır. Şablon `revizyonda_onaylar_gecersiz = 1` ise
 * açık talep iptal edilir ve yeniden onaya gönderilmesi gerekir.
 */
export function revizyonBildir(ctx, { nesne, nesneId, yeniBelgeSurum }) {
  const talep = tek(`SELECT * FROM onay_talebi WHERE nesne = ? AND nesne_id = ? AND durum = 'acik'`, nesne, nesneId);
  if (!talep) return { etkilenen: false };
  const sablon = talep.sablon_id ? tek('SELECT * FROM is_akisi_sablonu WHERE id = ?', talep.sablon_id) : null;
  if (sablon && sablon.revizyonda_onaylar_gecersiz === 0) return { etkilenen: false };

  return islem(() => {
    calistir(`UPDATE onay_adimi SET durum = 'iptal', kapandi = ? WHERE talep_id = ? AND durum IN ('bekliyor','acik')`,
      simdi(), talep.id);
    calistir(`UPDATE onay_talebi SET durum = 'iptal', sonuc = 'iptal', kapandi = ?, guncellendi = ?, surum = surum + 1
               WHERE id = ?`, simdi(), simdi(), talep.id);
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'onay_talebi', nesneId: talep.id, eylem: 'revizyon_nedeniyle_gecersiz',
      gerekce: 'Belge revize edildi; politikaya göre önceki onaylar geçersizleşti.',
      onceki: { belgeSurum: talep.belge_surum }, sonraki: { belgeSurum: yeniBelgeSurum } });
    return { etkilenen: true, talepId: talep.id };
  });
}

/* --- Sorgular ------------------------------------------------------------- */
/** Kullanıcının karar verebileceği açık onaylar (GLB-04 onay kutum). */
export function onayKutum(ctx, { atla = 0, boyut = 25 } = {}) {
  const t = simdi();
  const vekaletVerenler = vekilOlduklari(ctx.tenant.id, ctx.kullanici.id, t).map((v) => v.veren_id);
  const kisiler = [ctx.kullanici.id, ...vekaletVerenler];
  const yerTutucu = kisiler.map(() => '?').join(',');

  const sql = `
    SELECT DISTINCT t.*, a.ad AS adim_ad, a.sira AS adim_sira, a.sla_bitis AS adim_sla
      FROM onay_talebi t
      JOIN onay_adimi a ON a.talep_id = t.id AND a.durum = 'acik'
      JOIN rol r ON r.kod = a.rol_kodu
      JOIN kullanici_rol kr ON kr.rol_id = r.id AND kr.tenant_id = t.tenant_id
     WHERE t.tenant_id = ? AND t.durum = 'acik'
       AND kr.kullanici_id IN (${yerTutucu})
       AND t.talep_eden <> ?
       AND (kr.kapsam_tur IS NULL
            OR (kr.kapsam_tur = 'proje' AND kr.kapsam_id = t.proje_id)
            OR (kr.kapsam_tur = 'santiye' AND kr.kapsam_id = t.santiye_id))`;
  const toplam = Number(tek(`SELECT COUNT(*) AS n FROM (${sql})`,
    ctx.tenant.id, ...kisiler, ctx.kullanici.id)?.n ?? 0);
  const satirlar = sorgu(`${sql} ORDER BY t.olusturuldu ASC LIMIT ? OFFSET ?`,
    ctx.tenant.id, ...kisiler, ctx.kullanici.id, boyut, atla);
  return { toplam, satirlar };
}

export const talepDetayi = (tenantId, talepId) =>
  tek('SELECT * FROM onay_talebi WHERE id = ? AND tenant_id = ?', talepId, tenantId);

export const talepAdimlari = (talepId) =>
  sorgu('SELECT * FROM onay_adimi WHERE talep_id = ? ORDER BY sira', talepId);

export const talepKararlari = (talepId) => sorgu(
  `SELECT k.*, ku.ad_soyad, kv.ad_soyad AS vekaleten_ad
     FROM onay_karari k JOIN kullanici ku ON ku.id = k.kullanici_id
     LEFT JOIN kullanici kv ON kv.id = k.vekaleten
    WHERE k.talep_id = ? ORDER BY k.zaman`, talepId);

export const nesneTalepleri = (nesne, nesneId) => sorgu(
  'SELECT * FROM onay_talebi WHERE nesne = ? AND nesne_id = ? ORDER BY olusturuldu DESC', nesne, nesneId);
