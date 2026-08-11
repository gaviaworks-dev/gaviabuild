/* ============================================================================
   FİNANS HAREKET DEFTERLERİ — kasa, banka, cari  (değişmez kural 7)
   ----------------------------------------------------------------------------
   Stok defteriyle aynı sözleşme: bakiye HİÇBİR YERDE saklanmaz, her okumada
   defterden toplanır; satırlar veritabanı tetikleyicisiyle değişmezdir ve
   düzeltme yalnız TERS KAYITLA yapılır.

   Bu modül dışında hiçbir yerden kasa_hareketi / banka_hareketi / cari_hareket
   tablolarına INSERT yapılmaz. Tutarlar tamsayı minor unit'tir (K-004).
   ========================================================================== */
import { sorgu, tek, calistir, islemIcindeMi } from '../../cekirdek/db.mjs';
import { kimlik } from '../../cekirdek/kimlikler.mjs';
import { simdi } from '../../cekirdek/zaman.mjs';
import { DogrulamaHatasi, GecisIzinsiz } from '../../cekirdek/hata.mjs';
import * as audit from '../../cekirdek/audit.mjs';

/** Defter tanımları: tek yerde: tablo, sahip sütunu, yön kuralı. */
const DEFTERLER = {
  kasa: { tablo: 'kasa_hareketi', sahip: 'kasa_id', ustTablo: 'kasa',
    yonler: { tahsilat: 1, devir_giris: 1, odeme: -1, devir_cikis: -1, avans: -1, masraf: -1 },
    etiketler: { tahsilat: 'Tahsilat', odeme: 'Ödeme', devir_giris: 'Devir girişi',
      devir_cikis: 'Devir çıkışı', avans: 'Avans', masraf: 'Masraf', duzeltme: 'Düzeltme (ters kayıt)' } },
  banka: { tablo: 'banka_hareketi', sahip: 'hesap_id', ustTablo: 'banka_hesabi',
    yonler: { gelen: 1, faiz: 1, giden: -1, masraf: -1 },
    etiketler: { gelen: 'Gelen', giden: 'Giden', masraf: 'Banka masrafı', faiz: 'Faiz',
      duzeltme: 'Düzeltme (ters kayıt)' } },
  cari: { tablo: 'cari_hareket', sahip: 'cari_id', ustTablo: 'cari',
    /* Cari yönü ALACAK/BORÇ mantığıdır: +1 = bizim borcumuz artar (fatura),
       −1 = borç azalır (ödeme). Tedarikçi carisi için doğal okuma budur. */
    yonler: { fatura: 1, hakedis: 1, odeme: -1, tahsilat: -1, avans: -1, mahsup: -1 },
    etiketler: { fatura: 'Fatura', hakedis: 'Hakediş', odeme: 'Ödeme', tahsilat: 'Tahsilat',
      avans: 'Avans', mahsup: 'Mahsup', duzeltme: 'Düzeltme (ters kayıt)' } },
};

export const defterTanimi = (ad) => {
  const d = DEFTERLER[ad];
  if (!d) throw new Error(`Bilinmeyen defter: ${ad}`);
  return d;
};
export const hareketEtiketi = (defterAdi, tur) => defterTanimi(defterAdi).etiketler[tur] || tur;
export const hareketTurleri = (defterAdi) => Object.keys(defterTanimi(defterAdi).yonler);

/* --- Bakiye: HER ZAMAN defterden ------------------------------------------ */
export function bakiye(defterAdi, sahipId) {
  const d = defterTanimi(defterAdi);
  return Number(tek(
    `SELECT COALESCE(SUM(yon * tutar_minor), 0) AS n FROM ${d.tablo} WHERE ${d.sahip} = ?`, sahipId)?.n ?? 0);
}

/** Belirli bir ana kadar bakiye (dönem kapanışı ve mutabakat için). */
export function bakiyeAnda(defterAdi, sahipId, anMs) {
  const d = defterTanimi(defterAdi);
  return Number(tek(
    `SELECT COALESCE(SUM(yon * tutar_minor), 0) AS n FROM ${d.tablo} WHERE ${d.sahip} = ? AND zaman <= ?`,
    sahipId, anMs)?.n ?? 0);
}

/** Tüm sahipler için bakiye listesi (liste ekranları). */
export function bakiyeler(defterAdi, tenantId) {
  const d = defterTanimi(defterAdi);
  return sahipler(defterAdi, tenantId).map((s) => ({
    ...s,
    bakiye_minor: bakiye(defterAdi, s.id),
    hareket_sayisi: Number(tek(`SELECT COUNT(*) AS n FROM ${d.tablo} WHERE ${d.sahip} = ?`, s.id)?.n ?? 0),
    son_hareket: tek(`SELECT MAX(zaman) AS n FROM ${d.tablo} WHERE ${d.sahip} = ?`, s.id)?.n ?? null,
  }));
}

const sahipler = (defterAdi, tenantId) => sorgu(
  `SELECT * FROM ${defterTanimi(defterAdi).ustTablo} WHERE tenant_id = ? ORDER BY kod`, tenantId);

/* --- Hareket yazımı ------------------------------------------------------- */
/**
 * Deftere tek satır yazar. Transaction içinde çağrılmalıdır.
 * Kasa bakiyesi eksiye düşemez (fiziksel nakit negatif olamaz); banka ve cari
 * eksi bakiye taşıyabilir (kredili hesap, alacak bakiyesi).
 */
export function hareketYaz(ctx, defterAdi, p) {
  if (!islemIcindeMi()) throw new Error('Finans hareketi transaction dışında yazılamaz.');
  const d = defterTanimi(defterAdi);
  const yon = p.yon ?? d.yonler[p.tur];
  if (yon !== 1 && yon !== -1) throw new Error(`Hareket yönü çözülemedi: ${defterAdi}/${p.tur}`);
  const tutar = BigInt(p.tutarMinor ?? 0);
  if (tutar <= 0n) throw DogrulamaHatasi('Tutar sıfırdan büyük olmalı.');

  if (defterAdi === 'kasa' && yon === -1) {
    const mevcut = bakiye('kasa', p.sahipId);
    if (BigInt(mevcut) < tutar) {
      throw GecisIzinsiz(`Kasa bakiyesi yetersiz: mevcut ${mevcut} minor, çıkış ${tutar} minor. `
        + 'Nakit kasa eksiye düşemez.');
    }
  }

  const id = kimlik('hareket');
  const ortak = [id, ctx.tenant.id, p.sahipId, p.tur, yon, String(tutar),
    p.tutarBirim || ctx.tenant.para_birimi || 'TRY'];

  if (defterAdi === 'kasa') {
    calistir(`INSERT INTO kasa_hareketi (id, tenant_id, kasa_id, tur, yon, tutar_minor, tutar_birim,
                cari_id, santiye_id, proje_id, maliyet_kodu, belge_no, aciklama,
                kaynak_nesne, kaynak_id, ters_kayit_id, zaman, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ...ortak, p.cariId || null, p.santiyeId || null, p.projeId || null, p.maliyetKodu || null,
      p.belgeNo || null, p.aciklama || null, p.kaynakNesne || null, p.kaynakId || null,
      p.tersKayitId || null, p.zaman ?? simdi(), ctx.kullanici.id, simdi());
  } else if (defterAdi === 'banka') {
    calistir(`INSERT INTO banka_hareketi (id, tenant_id, hesap_id, tur, yon, tutar_minor, tutar_birim,
                valor, aciklama, karsi_hesap, banka_referans, cari_id, kaynak,
                ters_kayit_id, zaman, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ...ortak, p.valor || null, p.aciklama || null, p.karsiHesap || null,
      p.bankaReferans || null, p.cariId || null, p.kaynak || 'elle',
      p.tersKayitId || null, p.zaman ?? simdi(), ctx.kullanici.id, simdi());
  } else {
    calistir(`INSERT INTO cari_hareket (id, tenant_id, cari_id, tur, yon, tutar_minor, tutar_birim,
                vade, aciklama, kaynak_nesne, kaynak_id, ters_kayit_id, zaman, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ...ortak, p.vade || null, p.aciklama || null, p.kaynakNesne || null, p.kaynakId || null,
      p.tersKayitId || null, p.zaman ?? simdi(), ctx.kullanici.id, simdi());
  }

  audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
    nesne: d.tablo, nesneId: id, eylem: `defter:${p.tur}`,
    sonraki: { sahip: p.sahipId, yon, tutarMinor: String(tutar),
      kaynak: p.kaynakNesne, kaynakId: p.kaynakId } });
  return id;
}

/** Ters kayıt: satırı silmez, karşıt yönlü yeni satır yazar. */
export function tersKayit(ctx, defterAdi, hareketId, gerekce) {
  if (!String(gerekce || '').trim()) {
    throw DogrulamaHatasi('Ters kayıt için gerekçe zorunludur.', { alanlar: { gerekce: ['Gerekçe girin.'] } });
  }
  const d = defterTanimi(defterAdi);
  const h = tek(`SELECT * FROM ${d.tablo} WHERE id = ? AND tenant_id = ?`, hareketId, ctx.tenant.id);
  if (!h) throw DogrulamaHatasi('Hareket bulunamadı.');
  if (h.ters_kayit_id) throw GecisIzinsiz('Ters kayıt satırı yeniden ters çevrilemez.');
  if (tek(`SELECT id FROM ${d.tablo} WHERE ters_kayit_id = ?`, hareketId)) {
    throw GecisIzinsiz('Bu hareket zaten ters kayıtla düzeltilmiş.');
  }
  return hareketYaz(ctx, defterAdi, {
    sahipId: h[d.sahip], tur: 'duzeltme', yon: h.yon === 1 ? -1 : 1,
    tutarMinor: h.tutar_minor, tutarBirim: h.tutar_birim,
    cariId: h.cari_id, santiyeId: h.santiye_id, projeId: h.proje_id,
    maliyetKodu: h.maliyet_kodu, kaynakNesne: h.kaynak_nesne, kaynakId: h.kaynak_id,
    tersKayitId: h.id, aciklama: `Ters kayıt: ${gerekce}`,
  });
}

/**
 * Hareket dökümü + YÜRÜYEN BAKİYE. Yürüyen bakiye saklanmaz; listeleme anında
 * toplanır — ekran ile defter arasında ayrışma imkânsızdır.
 */
export function dokum(defterAdi, tenantId, { sahipId = null, baslangic = null, bitis = null,
                                             tur = null, eslesmemis = false, limit = 500 } = {}) {
  const d = defterTanimi(defterAdi);
  const kosul = ['h.tenant_id = ?']; const p = [tenantId];
  if (sahipId) { kosul.push(`h.${d.sahip} = ?`); p.push(sahipId); }
  if (baslangic) { kosul.push('h.zaman >= ?'); p.push(baslangic); }
  if (bitis) { kosul.push('h.zaman < ?'); p.push(bitis); }
  if (tur) { kosul.push('h.tur = ?'); p.push(tur); }
  if (eslesmemis && defterAdi === 'banka') kosul.push('h.eslesen_id IS NULL');

  const satirlar = sorgu(
    `SELECT h.*, u.kod AS sahip_kod, u.ad AS sahip_ad FROM ${d.tablo} h
       JOIN ${d.ustTablo} u ON u.id = h.${d.sahip}
      WHERE ${kosul.join(' AND ')} ORDER BY h.zaman ASC, h.olusturuldu ASC LIMIT ?`, ...p, limit);
  if (sahipId) {
    let y = 0;
    for (const s of satirlar) { y += s.yon * Number(s.tutar_minor); s.yuruyen_minor = y; }
  }
  return satirlar;
}

/** Bir belgenin ürettiği tüm finans hareketleri (izlenebilirlik). */
export const kaynakHareketleri = (defterAdi, kaynakNesne, kaynakId) => {
  const d = defterTanimi(defterAdi);
  if (defterAdi === 'banka') {
    return sorgu(`SELECT * FROM banka_hareketi WHERE eslesen_nesne = ? AND eslesen_id = ?`,
      kaynakNesne, kaynakId);
  }
  return sorgu(`SELECT * FROM ${d.tablo} WHERE kaynak_nesne = ? AND kaynak_id = ? ORDER BY zaman`,
    kaynakNesne, kaynakId);
};

/* --- Dönem kilidi --------------------------------------------------------- */
/**
 * Kapalı döneme hareket yazılamaz (FIN-15). Dönem anahtarı `YYYY-AA`.
 * Kilit kontrolü defterin GİRİŞ KAPISINDA değil, çağıran akışta yapılır —
 * çünkü ters kayıt bilerek kapalı döneme değil, AÇIK döneme yazılır.
 */
export function donemKapaliMi(tenantId, zamanMs, donemAnahtari) {
  const d = tek('SELECT * FROM finans_donemi WHERE tenant_id = ? AND donem = ?',
    tenantId, donemAnahtari);
  return !!(d && d.durum === 'kapali');
}
