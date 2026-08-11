/* ============================================================================
   HAKEDİŞ HESABI — CNT-07..09
   ----------------------------------------------------------------------------
   Hakediş tutarlarının HİÇBİRİ formdan gelmez. Satırlar ONAYLI metrajlardan,
   kesintiler sözleşme oranlarından hesaplanır (kural 5, kural 7 ilkesi).

   Kümülatif mantık: her poz için "bugüne kadarki onaylı metraj toplamı" alınır,
   önceki hakedişlerde ödenen miktar düşülür, kalan DÖNEM miktarıdır. Böylece
   aynı metraj iki kez ödenemez.
   ========================================================================== */
import { sorgu, tek } from '../../cekirdek/db.mjs';

/** Sözleşme bedeli — kalemlerden türetilir (elle yazılmaz). */
export const sozlesmeBedeli = (sozlesmeId) => sorgu(
  'SELECT miktar_binde, birim_fiyat_minor FROM sozlesme_kalemi WHERE sozlesme_id = ?', sozlesmeId)
  .reduce((a, k) => a + Math.round((k.miktar_binde / 1000) * Number(k.birim_fiyat_minor)), 0);

/** Onaylı zeyillerin tutar farkı toplamı. */
export const zeyilFarki = (sozlesmeId) => Number(tek(
  `SELECT COALESCE(SUM(tutar_farki_minor), 0) AS n FROM zeyil
    WHERE sozlesme_id = ? AND durum = 'onaylandi'`, sozlesmeId)?.n ?? 0);

/** Güncel sözleşme bedeli = ilk bedel + onaylı zeyiller. */
export const guncelBedel = (sozlesmeId) => sozlesmeBedeli(sozlesmeId) + zeyilFarki(sozlesmeId);

/** Onaylı zeyillerin süre farkı (gün). */
export const zeyilSuresi = (sozlesmeId) => Number(tek(
  `SELECT COALESCE(SUM(sure_farki_gun), 0) AS n FROM zeyil
    WHERE sozlesme_id = ? AND durum = 'onaylandi'`, sozlesmeId)?.n ?? 0);

/** Bir poz için ONAYLI metrajların kümülatif miktarı (binde). */
export function kumulatifMetraj(sozlesmeKalemiId, { harictekiMetrajId = null } = {}) {
  return Number(tek(
    `SELECT COALESCE(SUM(ms.miktar_binde), 0) AS n
       FROM metraj_satiri ms JOIN metraj m ON m.id = ms.metraj_id
      WHERE ms.sozlesme_kalemi_id = ? AND m.durum = 'onaylandi'
        ${harictekiMetrajId ? 'AND m.id <> ?' : ''}`,
    ...(harictekiMetrajId ? [sozlesmeKalemiId, harictekiMetrajId] : [sozlesmeKalemiId]))?.n ?? 0);
}

/** Önceki hakedişlerde ödenmiş kümülatif miktar (binde). */
export function oncekiHakedisMiktari(sozlesmeKalemiId, { harictekiHakedisId = null } = {}) {
  return Number(tek(
    `SELECT COALESCE(MAX(hs.kumulatif_binde), 0) AS n
       FROM hakedis_satiri hs JOIN hakedis hk ON hk.id = hs.hakedis_id
      WHERE hs.sozlesme_kalemi_id = ? AND hk.durum NOT IN ('iptal','reddedildi')
        ${harictekiHakedisId ? 'AND hk.id <> ?' : ''}`,
    ...(harictekiHakedisId ? [sozlesmeKalemiId, harictekiHakedisId] : [sozlesmeKalemiId]))?.n ?? 0);
}

/** Önceki hakedişlerin brüt toplamı (minor). */
export const oncekiBrut = (sozlesmeId, { harictekiHakedisId = null } = {}) => Number(tek(
  `SELECT COALESCE(SUM(donem_brut_minor), 0) AS n FROM hakedis
    WHERE sozlesme_id = ? AND durum NOT IN ('iptal','reddedildi')
      ${harictekiHakedisId ? 'AND id <> ?' : ''}`,
  ...(harictekiHakedisId ? [sozlesmeId, harictekiHakedisId] : [sozlesmeId]))?.n ?? 0);

/**
 * Bir sözleşme için hakediş TASLAĞINI hesaplar — hiçbir şey yazmaz.
 * @returns {{satirlar:Array, donemBrut:number, oncekiBrut:number, brut:number,
 *            kesintiler:object, net:number, uyarilar:string[]}}
 */
export function hakedisHesapla(sozlesme, { harictekiHakedisId = null } = {}) {
  const kalemler = sorgu(
    'SELECT * FROM sozlesme_kalemi WHERE sozlesme_id = ? ORDER BY sira', sozlesme.id);
  const uyarilar = [];
  const satirlar = [];

  for (const k of kalemler) {
    const kumulatif = kumulatifMetraj(k.id);
    if (kumulatif === 0) continue;
    const onceki = oncekiHakedisMiktari(k.id, { harictekiHakedisId });
    const donem = kumulatif - onceki;
    if (donem <= 0) continue;
    /* Sözleşme miktarını aşan metraj, zeyil olmadan hakedişe giremez. */
    if (kumulatif > k.miktar_binde) {
      uyarilar.push(`${k.poz_no}: onaylı metraj (${kumulatif / 1000}) sözleşme miktarını `
        + `(${k.miktar_binde / 1000}) aşıyor; fark zeyille karşılanmalı.`);
    }
    const tutar = Math.round((donem / 1000) * Number(k.birim_fiyat_minor));
    satirlar.push({
      sozlesmeKalemiId: k.id, pozNo: k.poz_no, tanim: k.tanim, birim: k.birim,
      kumulatifBinde: kumulatif, oncekiBinde: onceki, donemBinde: donem,
      birimFiyatMinor: Number(k.birim_fiyat_minor), donemTutarMinor: tutar,
      sozlesmeMiktari: k.miktar_binde,
    });
  }

  const donemBrut = satirlar.reduce((a, s) => a + s.donemTutarMinor, 0);
  const onceki = oncekiBrut(sozlesme.id, { harictekiHakedisId });
  const brut = onceki + donemBrut;

  /* Kesintiler sözleşme ORANLARINDAN hesaplanır; kullanıcı tutar yazamaz. */
  const oran = (binde) => (binde || 0) / 100_000;
  const avansToplam = Math.round(guncelBedel(sozlesme.id) * oran(sozlesme.avans_orani_binde));
  const avansMahsupEdilen = Number(tek(
    `SELECT COALESCE(SUM(avans_mahsup_minor), 0) AS n FROM hakedis
      WHERE sozlesme_id = ? AND durum NOT IN ('iptal','reddedildi')
        ${harictekiHakedisId ? 'AND id <> ?' : ''}`,
    ...(harictekiHakedisId ? [sozlesme.id, harictekiHakedisId] : [sozlesme.id]))?.n ?? 0);
  /* Avans, hakediş ilerlemesi oranında mahsup edilir; kalan avansı aşamaz. */
  const avansMahsup = Math.min(
    Math.round(donemBrut * oran(sozlesme.avans_orani_binde)),
    Math.max(0, avansToplam - avansMahsupEdilen));
  const teminatKesinti = Math.round(donemBrut * oran(sozlesme.teminat_orani_binde));
  const stopaj = Math.round(donemBrut * oran(sozlesme.stopaj_orani_binde));
  const net = donemBrut - avansMahsup - teminatKesinti - stopaj;

  return {
    satirlar, donemBrut, oncekiBrut: onceki, brut,
    kesintiler: { avansMahsup, teminatKesinti, stopaj, avansToplam, avansMahsupEdilen },
    net, uyarilar,
  };
}

/** Sözleşmenin gerçekleşme oranı (binde): ödenen brüt / güncel bedel. */
export function gerceklesmeBinde(sozlesmeId) {
  const bedel = guncelBedel(sozlesmeId);
  if (!bedel) return 0;
  return Math.round((oncekiBrut(sozlesmeId) / bedel) * 100_000);
}
