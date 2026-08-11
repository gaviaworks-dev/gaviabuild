/* ============================================================================
   PROJE İLERLEME ALGORİTMASI — doküman §5.5
   ----------------------------------------------------------------------------
   Şartname birebir:
     · İlerleme, formda elle yazılan tek bir yüzde DEĞİLDİR.
     · Onaylı WBS ağırlıkları toplamı yüzde 100 OLMALIDIR.
     · Aktivite ilerlemesi: ölçülebilir miktar | kilometre taşı | süre ağırlığı.
     · Proje ilerlemesi = sum(WBS ağırlığı × ONAYLI aktivite ilerlemesi).
     · Tahmin edilen ve onaylı ilerleme AYRI tutulur.
     · Baz çizgi ve rapor dönemi sürümü her raporda görünür.

   Yüzdeler binde (0-100000 = %0-100,000) tamsayı olarak taşınır: kayan nokta
   yasak (para kuralının ilerleme karşılığı), yuvarlama kaybı birikmez.
   ========================================================================== */
import { sorgu, tek } from '../../cekirdek/db.mjs';
import { DogrulamaHatasi } from '../../cekirdek/hata.mjs';

export const BINDE = 100_000;               // %100 = 100000 (üç ondalık hassasiyet)
export const yuzdeMetni = (binde, basamak = 1) =>
  (binde / 1000).toFixed(basamak).replace('.', ',') + '%';

/* --- WBS ağırlık doğrulaması (PLAN-01) ---------------------------------- */
/**
 * Her düğüm KÜMESİ (aynı üst altındaki kardeşler) toplamda %100 olmalı.
 * @returns {{gecerli:boolean, hatalar:Array<{ustKod:string, toplam:number}>}}
 */
export function agirlikDogrula(programId) {
  const dugumler = sorgu('SELECT * FROM wbs WHERE program_id = ?', programId);
  if (!dugumler.length) return { gecerli: false, hatalar: [{ ustKod: '(kök)', toplam: 0, neden: 'WBS tanımlı değil' }] };

  const kumeler = new Map();
  for (const d of dugumler) {
    const anahtar = d.ust_id || '(kök)';
    kumeler.set(anahtar, [...(kumeler.get(anahtar) || []), d]);
  }
  const hatalar = [];
  for (const [ustId, kardesler] of kumeler) {
    const toplam = kardesler.reduce((a, d) => a + d.agirlik, 0);
    if (toplam !== 10000) {
      const ust = ustId === '(kök)' ? null : dugumler.find((d) => d.id === ustId);
      hatalar.push({ ustKod: ust ? ust.kod : '(kök)', ustAd: ust ? ust.ad : 'Program kökü', toplam });
    }
  }

  /* Yaprak düğümlerin aktivite ağırlıkları da %100 olmalı. */
  const yaprakIdler = dugumler.filter((d) => !dugumler.some((x) => x.ust_id === d.id)).map((d) => d.id);
  for (const yid of yaprakIdler) {
    const aktiviteler = sorgu('SELECT * FROM aktivite WHERE wbs_id = ?', yid);
    if (!aktiviteler.length) continue;
    const toplam = aktiviteler.reduce((a, x) => a + x.agirlik, 0);
    if (toplam !== 10000) {
      const d = dugumler.find((x) => x.id === yid);
      hatalar.push({ ustKod: d.kod, ustAd: `${d.ad} (aktiviteler)`, toplam });
    }
  }
  return { gecerli: hatalar.length === 0, hatalar };
}

export function agirlikZorunlu(programId) {
  const s = agirlikDogrula(programId);
  if (!s.gecerli) {
    const ayrinti = s.hatalar
      .map((h) => `${h.ustAd}: %${(h.toplam / 100).toFixed(2)} (100 olmalı)`).join(' · ');
    throw DogrulamaHatasi(
      `WBS ağırlıkları %100 değil; baz çizgi onaya gönderilemez. ${ayrinti}`,
      { alanlar: { agirlik: s.hatalar.map((h) => `${h.ustAd}: toplam %${(h.toplam / 100).toFixed(2)}`) } });
  }
  return true;
}

/* --- Aktivite ilerlemesi -------------------------------------------------- */
/**
 * Bir aktivitenin ilerlemesi. `onayliSadece = true` ise yalnız ONAYLI kayıtlar
 * sayılır (proje ilerlemesi bunu kullanır); false ise tahmin edilen değer döner.
 */
export function aktiviteIlerlemesi(aktiviteId, { onayliSadece = true, donem = null } = {}) {
  const kosullar = ['aktivite_id = ?'];
  const p = [aktiviteId];
  if (onayliSadece) kosullar.push(`durum = 'onaylandi'`);
  else kosullar.push(`durum <> 'iptal' AND durum <> 'reddedildi'`);
  if (donem) { kosullar.push('donem <= ?'); p.push(donem); }
  const satir = tek(
    `SELECT MAX(yuzde_binde) AS y FROM ilerleme WHERE ${kosullar.join(' AND ')}`, ...p);
  return Number(satir?.y ?? 0);
}

/* --- WBS düğüm ilerlemesi (özyinelemeli ağırlıklı ortalama) -------------- */
function dugumIlerlemesi(dugum, dugumler, aktiviteler, secenekler) {
  const cocuklar = dugumler.filter((d) => d.ust_id === dugum.id);
  if (cocuklar.length) {
    let toplam = 0;
    for (const c of cocuklar) {
      toplam += c.agirlik * dugumIlerlemesi(c, dugumler, aktiviteler, secenekler);
    }
    return Math.round(toplam / 10000);
  }
  const kendiAktiviteleri = aktiviteler.filter((a) => a.wbs_id === dugum.id);
  if (!kendiAktiviteleri.length) return 0;
  let toplam = 0;
  for (const a of kendiAktiviteleri) {
    toplam += a.agirlik * aktiviteIlerlemesi(a.id, secenekler);
  }
  return Math.round(toplam / 10000);
}

/**
 * Program ilerlemesi = sum(WBS ağırlığı × onaylı aktivite ilerlemesi).
 * @returns {{onayli:number, tahmini:number, bazCizgi:boolean, surumNo:number}}
 */
export function programIlerlemesi(programId, { donem = null } = {}) {
  const program = tek('SELECT * FROM is_programi WHERE id = ?', programId);
  if (!program) return { onayli: 0, tahmini: 0, bazCizgi: false, surumNo: 0 };
  const dugumler = sorgu('SELECT * FROM wbs WHERE program_id = ?', programId);
  const aktiviteler = sorgu('SELECT * FROM aktivite WHERE program_id = ?', programId);
  const kokler = dugumler.filter((d) => !d.ust_id);

  const hesapla = (onayliSadece) => {
    let toplam = 0;
    for (const k of kokler) toplam += k.agirlik * dugumIlerlemesi(k, dugumler, aktiviteler, { onayliSadece, donem });
    return Math.round(toplam / 10000);
  };

  return {
    onayli: hesapla(true),
    tahmini: hesapla(false),
    bazCizgi: !!program.baz_cizgi,
    surumNo: program.surum_no,
    bazCizgiTarih: program.baz_cizgi_tarih,
  };
}

/** Proje ilerlemesi: projenin ONAYLI baz çizgili programlarından. */
export function projeIlerlemesi(projeId, { donem = null } = {}) {
  const programlar = sorgu(
    `SELECT * FROM is_programi WHERE proje_id = ? AND baz_cizgi = 1 AND durum = 'onaylandi'`, projeId);
  if (!programlar.length) return { onayli: 0, tahmini: 0, programSayisi: 0, bazCizgiVar: false };
  let onayli = 0, tahmini = 0;
  for (const p of programlar) {
    const i = programIlerlemesi(p.id, { donem });
    onayli += i.onayli; tahmini += i.tahmini;
  }
  return {
    onayli: Math.round(onayli / programlar.length),
    tahmini: Math.round(tahmini / programlar.length),
    programSayisi: programlar.length,
    bazCizgiVar: true,
  };
}

/** Plan-gerçekleşen sapması (PLAN-11). */
export function sapma(programId, { simdiMs }) {
  const program = tek('SELECT * FROM is_programi WHERE id = ?', programId);
  if (!program || !program.baslangic || !program.bitis) return null;
  const gecen = Math.max(0, Math.min(1, (simdiMs - program.baslangic) / (program.bitis - program.baslangic)));
  const planlanan = Math.round(gecen * BINDE);
  const gercek = programIlerlemesi(programId).onayli;
  return { planlanan, gercek, sapma: gercek - planlanan };
}
