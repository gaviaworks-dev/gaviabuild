/* ============================================================================
   STOK HAREKET DEFTERİ — değişmez kural 7'nin uygulaması
   ----------------------------------------------------------------------------
   "Finans, stok ve kart bakiyeleri elle yazılan sayı değildir; DEĞİŞMEZ HAREKET
   DEFTERİNDEN türetilir ve ters kayıtla düzeltilir."

   Bu modül dışında hiçbir yerden `stok_hareketi` tablosuna INSERT yapılmaz.
   Bakiye sorgusu her çağrıda defteri toplar; hiçbir yerde saklanmaz.
   Miktarlar tamsayı BİNDE taşınır (12,5 m³ → 12500).
   ========================================================================== */
import { sorgu, tek, calistir, islemIcindeMi } from '../../cekirdek/db.mjs';
import { kimlik } from '../../cekirdek/kimlikler.mjs';
import { simdi } from '../../cekirdek/zaman.mjs';
import { DogrulamaHatasi, GecisIzinsiz } from '../../cekirdek/hata.mjs';
import * as audit from '../../cekirdek/audit.mjs';

/** Hareket türü → yön. Yön hareketin türünden TÜREDİĞİ için çağıran seçemez. */
export const HAREKET_YONU = {
  giris: 1, transfer_giris: 1, iade: 1, sayim_fazla: 1,
  cikis: -1, transfer_cikis: -1, sarf: -1, sayim_eksik: -1,
  duzeltme: 0,   // ters kayıt: yönü kaynak hareketten alır
};

export const HAREKET_ETIKETI = {
  giris: 'Giriş (mal kabul)', cikis: 'Çıkış', transfer_cikis: 'Transfer çıkışı',
  transfer_giris: 'Transfer girişi', sarf: 'Sarf', iade: 'İade',
  sayim_fazla: 'Sayım fazlası', sayim_eksik: 'Sayım eksiği', duzeltme: 'Düzeltme (ters kayıt)',
};

/** Binde tamsayı ayrıştırıcı: "12,5" → 12500. Kayan nokta saklanmaz (K-004). */
export function miktarAyristir(girdi, alanAdi = 'miktar', { enAz = 1, sifirSerbest = false } = {}) {
  const s = String(girdi ?? '').trim().replace(',', '.');
  if (!s) throw DogrulamaHatasi('Miktar zorunludur.', { alanlar: { [alanAdi]: ['Miktar girin.'] } });
  const n = Number(s);
  /* Sıfır, kabul/ret gibi "bölüştürme" alanlarında geçerli bir değerdir. */
  if (sifirSerbest && Number.isFinite(n) && n === 0) return 0;
  if (!Number.isFinite(n) || n <= 0) {
    throw DogrulamaHatasi('Miktar sıfırdan büyük olmalı.', { alanlar: { [alanAdi]: ['Geçerli bir miktar girin.'] } });
  }
  const binde = Math.round(n * 1000);
  if (binde < enAz) {
    throw DogrulamaHatasi('Miktar çok küçük.', { alanlar: { [alanAdi]: ['En az 0,001 girin.'] } });
  }
  if (binde > 1_000_000_000_000) {
    throw DogrulamaHatasi('Miktar çok büyük.', { alanlar: { [alanAdi]: ['Değer sınırın üzerinde.'] } });
  }
  return binde;
}

export const miktarMetni = (binde, basamak = 3) => {
  if (binde == null) return '—';
  const s = (binde / 1000).toFixed(basamak).replace(/0+$/, '').replace(/\.$/, '');
  return (s || '0').replace('.', ',');
};

/* --- Bakiye: HER ZAMAN defterden türetilir ------------------------------- */
/**
 * @returns {number} binde tamsayı bakiye
 */
export function bakiye(depoId, stokKartiId) {
  return Number(tek(
    `SELECT COALESCE(SUM(yon * miktar_binde), 0) AS n FROM stok_hareketi
      WHERE depo_id = ? AND stok_karti_id = ?`, depoId, stokKartiId)?.n ?? 0);
}

/** Tüm depolardaki toplam bakiye. */
export function toplamBakiye(tenantId, stokKartiId) {
  return Number(tek(
    `SELECT COALESCE(SUM(yon * miktar_binde), 0) AS n FROM stok_hareketi
      WHERE tenant_id = ? AND stok_karti_id = ?`, tenantId, stokKartiId)?.n ?? 0);
}

/** Aktif rezervasyon toplamı — kullanılabilir stok bundan düşülür. */
export function rezerve(depoId, stokKartiId) {
  return Number(tek(
    `SELECT COALESCE(SUM(miktar_binde), 0) AS n FROM stok_rezervasyonu
      WHERE depo_id = ? AND stok_karti_id = ? AND durum = 'aktif'`, depoId, stokKartiId)?.n ?? 0);
}

export const kullanilabilir = (depoId, stokKartiId) => bakiye(depoId, stokKartiId) - rezerve(depoId, stokKartiId);

/** Bir deponun tüm kartları için bakiye listesi (STK-01/02 ekranları). */
export function depoBakiyeleri(tenantId, { depoId = null, stokKartiId = null } = {}) {
  const kosul = ['h.tenant_id = ?']; const p = [tenantId];
  if (depoId) { kosul.push('h.depo_id = ?'); p.push(depoId); }
  if (stokKartiId) { kosul.push('h.stok_karti_id = ?'); p.push(stokKartiId); }
  return sorgu(
    `SELECT h.depo_id, h.stok_karti_id, d.kod AS depo_kod, d.ad AS depo_ad,
            k.kod AS kart_kod, k.ad AS kart_ad, k.birim, k.kritik_seviye_binde,
            SUM(h.yon * h.miktar_binde) AS bakiye_binde,
            MAX(h.zaman) AS son_hareket
       FROM stok_hareketi h
       JOIN depo d ON d.id = h.depo_id
       JOIN stok_karti k ON k.id = h.stok_karti_id
      WHERE ${kosul.join(' AND ')}
      GROUP BY h.depo_id, h.stok_karti_id
      HAVING SUM(h.yon * h.miktar_binde) <> 0 OR MAX(h.zaman) IS NOT NULL
      ORDER BY d.kod, k.kod`, ...p);
}

/* --- Hareket yazımı ------------------------------------------------------ */
/**
 * Deftere TEK satır yazar. Transaction içinde çağrılmalıdır.
 * Çıkış hareketlerinde negatif bakiye oluşamaz — depo eksiye düşemez.
 *
 * @param {object} ctx
 * @param {{depoId, stokKartiId, tur, miktarBinde, birimMaliyetMinor?, birimMaliyetBirim?,
 *          santiyeId?, projeId?, maliyetKodu?, kaynakNesne?, kaynakId?, aciklama?,
 *          zaman?, tersKayitId?, yon?}} p
 */
export function hareketYaz(ctx, p) {
  if (!islemIcindeMi()) throw new Error('Stok hareketi transaction dışında yazılamaz.');
  const yon = p.yon ?? HAREKET_YONU[p.tur];
  if (yon !== 1 && yon !== -1) throw new Error(`Hareket yönü çözülemedi: ${p.tur}`);
  if (!Number.isInteger(p.miktarBinde) || p.miktarBinde <= 0) {
    throw DogrulamaHatasi('Hareket miktarı sıfırdan büyük tamsayı (binde) olmalı.');
  }

  if (yon === -1) {
    const mevcut = bakiye(p.depoId, p.stokKartiId);
    if (mevcut < p.miktarBinde) {
      const kart = tek('SELECT kod, ad, birim FROM stok_karti WHERE id = ?', p.stokKartiId);
      throw GecisIzinsiz(
        `Yetersiz stok: ${kart?.kod || p.stokKartiId} deposunda ${miktarMetni(mevcut)} ${kart?.birim || ''} var, `
        + `${miktarMetni(p.miktarBinde)} çıkış isteniyor. Depo bakiyesi eksiye düşemez.`);
    }
  }

  const id = kimlik('hareket');
  calistir(`INSERT INTO stok_hareketi (id, tenant_id, depo_id, stok_karti_id, tur, yon, miktar_binde,
              birim_maliyet_minor, birim_maliyet_birim, santiye_id, proje_id, maliyet_kodu,
              kaynak_nesne, kaynak_id, ters_kayit_id, aciklama, zaman, olusturan, olusturuldu)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, ctx.tenant.id, p.depoId, p.stokKartiId, p.tur, yon, p.miktarBinde,
    p.birimMaliyetMinor == null ? null : String(p.birimMaliyetMinor),
    p.birimMaliyetBirim || (p.birimMaliyetMinor == null ? null : 'TRY'),
    p.santiyeId || null, p.projeId || null, p.maliyetKodu || null,
    p.kaynakNesne || null, p.kaynakId || null, p.tersKayitId || null,
    p.aciklama || null, p.zaman ?? simdi(), ctx.kullanici.id, simdi());

  audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
    nesne: 'stok_hareketi', nesneId: id, eylem: `defter:${p.tur}`,
    sonraki: { depo: p.depoId, kart: p.stokKartiId, yon, miktarBinde: p.miktarBinde,
      kaynak: p.kaynakNesne, kaynakId: p.kaynakId } });
  return id;
}

/**
 * Ters kayıt: bir hareketi SİLMEZ, karşıt yönlü yeni satır yazar.
 * Aynı hareket iki kez ters çevrilemez.
 */
export function tersKayit(ctx, hareketId, gerekce) {
  if (!String(gerekce || '').trim()) {
    throw DogrulamaHatasi('Ters kayıt için gerekçe zorunludur.', { alanlar: { gerekce: ['Gerekçe girin.'] } });
  }
  const h = tek('SELECT * FROM stok_hareketi WHERE id = ? AND tenant_id = ?', hareketId, ctx.tenant.id);
  if (!h) throw DogrulamaHatasi('Hareket bulunamadı.');
  const mevcutTers = tek('SELECT id FROM stok_hareketi WHERE ters_kayit_id = ?', hareketId);
  if (mevcutTers) throw GecisIzinsiz('Bu hareket zaten ters kayıtla düzeltilmiş.');
  if (h.ters_kayit_id) throw GecisIzinsiz('Ters kayıt satırı yeniden ters çevrilemez.');

  return hareketYaz(ctx, {
    depoId: h.depo_id, stokKartiId: h.stok_karti_id, tur: 'duzeltme',
    yon: h.yon === 1 ? -1 : 1, miktarBinde: h.miktar_binde,
    birimMaliyetMinor: h.birim_maliyet_minor, birimMaliyetBirim: h.birim_maliyet_birim,
    santiyeId: h.santiye_id, projeId: h.proje_id, maliyetKodu: h.maliyet_kodu,
    kaynakNesne: h.kaynak_nesne, kaynakId: h.kaynak_id, tersKayitId: h.id,
    aciklama: `Ters kayıt: ${gerekce}`,
  });
}

/** Bir kaynak belgenin ürettiği tüm hareketler (izlenebilirlik). */
export const kaynakHareketleri = (kaynakNesne, kaynakId) => sorgu(
  `SELECT h.*, d.kod AS depo_kod, k.kod AS kart_kod, k.ad AS kart_ad, k.birim
     FROM stok_hareketi h
     JOIN depo d ON d.id = h.depo_id
     JOIN stok_karti k ON k.id = h.stok_karti_id
    WHERE h.kaynak_nesne = ? AND h.kaynak_id = ? ORDER BY h.zaman, h.olusturuldu`,
  kaynakNesne, kaynakId);

/**
 * Bir kartın belirli bir depodaki hareket dökümü + YÜRÜYEN BAKİYE.
 * Yürüyen bakiye saklanmaz; listeleme anında toplanır (STK-01 kabul testi).
 */
export function hareketDokumu(tenantId, { depoId = null, stokKartiId = null, baslangic = null,
                                          bitis = null, tur = null, limit = 500 } = {}) {
  const kosul = ['h.tenant_id = ?']; const p = [tenantId];
  if (depoId) { kosul.push('h.depo_id = ?'); p.push(depoId); }
  if (stokKartiId) { kosul.push('h.stok_karti_id = ?'); p.push(stokKartiId); }
  if (baslangic) { kosul.push('h.zaman >= ?'); p.push(baslangic); }
  if (bitis) { kosul.push('h.zaman < ?'); p.push(bitis); }
  if (tur) { kosul.push('h.tur = ?'); p.push(tur); }
  const satirlar = sorgu(
    `SELECT h.*, d.kod AS depo_kod, k.kod AS kart_kod, k.ad AS kart_ad, k.birim
       FROM stok_hareketi h
       JOIN depo d ON d.id = h.depo_id
       JOIN stok_karti k ON k.id = h.stok_karti_id
      WHERE ${kosul.join(' AND ')}
      ORDER BY h.zaman ASC, h.olusturuldu ASC LIMIT ?`, ...p, limit);

  /* Yürüyen bakiye yalnız TEK depo + TEK kart seçiliyken anlamlıdır. */
  if (depoId && stokKartiId) {
    let y = 0;
    for (const s of satirlar) { y += s.yon * s.miktar_binde; s.yuruyen_binde = y; }
  }
  return satirlar;
}

/** Kritik seviyenin altına düşen kart/depo çiftleri (STK-02 uyarısı). */
export const kritikSeviyeAltindakiler = (tenantId) => depoBakiyeleri(tenantId)
  .filter((r) => r.kritik_seviye_binde > 0 && r.bakiye_binde < r.kritik_seviye_binde);
