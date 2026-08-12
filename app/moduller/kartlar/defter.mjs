/* ============================================================================
   KART HAREKET DEFTERİ — değişmez kural 7'nin üçüncü uygulaması
   ----------------------------------------------------------------------------
   `stok/defter.mjs` ve `finans/defter.mjs` ile AYNI sözleşme. İkinci bir defter
   yazılmadı; aynı kalıp kart hareketine uygulandı:

     · Bu modül dışında hiçbir yerden `kart_hareketi` tablosuna INSERT yapılmaz.
     · Bakiye HİÇBİR YERDE saklanmaz; her okumada defter toplanır.
     · Satır veritabanı tetikleyicisiyle değişmez; düzeltme yalnız TERS KAYIT.
     · Tutarlar tamsayı minor unit (K-004).

   §6.5 formülü birebir:
     kullanılabilir bakiye = kesinleşmiş yükleme + iade + olumlu düzeltme
                           − kesinleşmiş harcama − ters/olumsuz düzeltme
   Bekleyen (henüz kesinleşmemiş) işlemler AYRI gösterilir; bakiyeye girmez.
   ========================================================================== */
import { sorgu, tek, calistir, islemIcindeMi } from '../../cekirdek/db.mjs';
import { kimlik } from '../../cekirdek/kimlikler.mjs';
import { simdi } from '../../cekirdek/zaman.mjs';
import { DogrulamaHatasi, GecisIzinsiz, Cakisma } from '../../cekirdek/hata.mjs';
import { minorSinirZorunlu } from '../../cekirdek/para.mjs';
import * as audit from '../../cekirdek/audit.mjs';

/** Hareket türü → yön. Yön TÜRDEN türediği için çağıran seçemez. */
export const HAREKET_YONU = {
  yukleme: 1, iade: 1, devir_giris: 1,
  harcama: -1, iptal: -1, devir_cikis: -1,
  duzeltme: 0,   // ters kayıt: yönü kaynak hareketten alır
};

export const HAREKET_ETIKETI = {
  yukleme: 'Yükleme', harcama: 'Harcama', iade: 'İade', iptal: 'İptal',
  devir_giris: 'Devir girişi', devir_cikis: 'Devir çıkışı',
  duzeltme: 'Düzeltme (ters kayıt)',
};

/* --- Bakiye: HER ZAMAN defterden ----------------------------------------- */
/**
 * Kullanılabilir bakiye — yalnız KESİNLEŞMİŞ satırlar (§6.5).
 * @returns {number} tamsayı minor
 */
export function bakiye(kartId) {
  return Number(tek(
    `SELECT COALESCE(SUM(yon * tutar_minor), 0) AS n FROM kart_hareketi
      WHERE kart_id = ? AND kesinlesmis = 1`, kartId)?.n ?? 0);
}

/** Bekleyen (provizyon) toplamı — bakiyeye girmez, ayrı gösterilir (§6.5). */
export function bekleyen(kartId) {
  return Number(tek(
    `SELECT COALESCE(SUM(yon * tutar_minor), 0) AS n FROM kart_hareketi
      WHERE kart_id = ? AND kesinlesmis = 0`, kartId)?.n ?? 0);
}

/** Belirli bir ana kadar bakiye — mutabakat ve dönem kapanışı için. */
export function bakiyeAnda(kartId, anMs) {
  return Number(tek(
    `SELECT COALESCE(SUM(yon * tutar_minor), 0) AS n FROM kart_hareketi
      WHERE kart_id = ? AND kesinlesmis = 1 AND zaman <= ?`, kartId, anMs)?.n ?? 0);
}

/** Bir hesabın tüm kartlarının iç defter toplamı (mutabakatın "iç" ayağı). */
export function hesapToplami(hesapId, { baslangic = null, bitis = null, tur = null } = {}) {
  const kosul = ['k.hesap_id = ?', 'h.kesinlesmis = 1']; const p = [hesapId];
  if (baslangic != null) { kosul.push('h.zaman >= ?'); p.push(baslangic); }
  if (bitis != null) { kosul.push('h.zaman < ?'); p.push(bitis); }
  if (tur) { kosul.push('h.tur = ?'); p.push(tur); }
  return Number(tek(
    `SELECT COALESCE(SUM(h.yon * h.tutar_minor), 0) AS n FROM kart_hareketi h
       JOIN kart k ON k.id = h.kart_id
      WHERE ${kosul.join(' AND ')}`, ...p)?.n ?? 0);
}

/** Liste ekranları için kart bazlı bakiye tablosu. */
export function kartBakiyeleri(tenantId, { hesapId = null, kartId = null } = {}) {
  const kosul = ['k.tenant_id = ?']; const p = [tenantId];
  if (hesapId) { kosul.push('k.hesap_id = ?'); p.push(hesapId); }
  if (kartId) { kosul.push('k.id = ?'); p.push(kartId); }
  return sorgu(
    `SELECT k.id AS kart_id, k.kod, k.maskeli_no, k.durum, k.hesap_id,
            COALESCE(SUM(CASE WHEN h.kesinlesmis = 1 THEN h.yon * h.tutar_minor END), 0) AS bakiye_minor,
            COALESCE(SUM(CASE WHEN h.kesinlesmis = 0 THEN h.yon * h.tutar_minor END), 0) AS bekleyen_minor,
            MAX(h.zaman) AS son_hareket
       FROM kart k LEFT JOIN kart_hareketi h ON h.kart_id = k.id
      WHERE ${kosul.join(' AND ')}
      GROUP BY k.id ORDER BY k.kod`, ...p);
}

/* --- Hareket yazımı ------------------------------------------------------- */
/**
 * Deftere TEK satır yazar. Transaction içinde çağrılmalıdır.
 *
 * Kart bakiyesi EKSİYE DÜŞEMEZ: ön ödemeli kartta harcama, yüklenenden fazla
 * olamaz. Sağlayıcıdan gelen fazla harcama, kaydı reddetmek yerine mutabakat
 * farkı olarak görünmelidir; bu yüzden `zorlama` seçeneği yalnız SAĞLAYICI
 * kaynaklı satırlarda açılır ve gerekçe ister.
 *
 * @param {object} ctx
 * @param {{kartId, tur, tutarMinor, tutarBirim?, kesinlesmis?, zaman?, yon?,
 *          saglayiciReferans?, uyeIsyeri?, personelId?, projeId?, santiyeId?,
 *          maliyetKodu?, kaynakNesne?, kaynakId?, tersKayitId?, aciklama?,
 *          saglayiciKaynakli?}} p
 */
export function hareketYaz(ctx, p) {
  if (!islemIcindeMi()) throw new Error('Kart hareketi transaction dışında yazılamaz.');
  const yon = p.yon ?? HAREKET_YONU[p.tur];
  if (yon !== 1 && yon !== -1) throw new Error(`Hareket yönü çözülemedi: ${p.tur}`);
  const tutar = BigInt(p.tutarMinor ?? 0);
  if (tutar <= 0n) throw DogrulamaHatasi('Tutar sıfırdan büyük olmalı.');
  /* D-08: okunamayacak büyüklükte bir tutar değişmez deftere GİREMEZ. */
  minorSinirZorunlu(tutar);

  const kart = tek('SELECT * FROM kart WHERE id = ? AND tenant_id = ?', p.kartId, ctx.tenant.id);
  if (!kart) throw DogrulamaHatasi('Kart bulunamadı.');

  /* Aynı sağlayıcı referansı iki kez muhasebeleşemez — veritabanı kısıtı da
     var; burada kullanıcıya anlamlı hata veriyoruz (§6.2 IntegrationEvent). */
  if (p.saglayiciReferans) {
    const mevcut = tek('SELECT id FROM kart_hareketi WHERE kart_id = ? AND saglayici_referans = ?',
      p.kartId, p.saglayiciReferans);
    if (mevcut) {
      throw Cakisma(`Bu sağlayıcı referansı (${p.saglayiciReferans}) zaten muhasebeleşmiş.`);
    }
  }

  if (yon === -1 && p.kesinlesmis !== 0) {
    const mevcut = BigInt(bakiye(p.kartId));
    if (mevcut < tutar && !p.saglayiciKaynakli) {
      throw GecisIzinsiz(
        `Kart bakiyesi yetersiz: ${kart.kod} kartında ${mevcut} minor var, ${tutar} minor çıkış isteniyor. `
        + 'Ön ödemeli kart bakiyesi eksiye düşemez.');
    }
  }

  const id = kimlik('hareket');
  calistir(`INSERT INTO kart_hareketi (id, tenant_id, kart_id, tur, yon, tutar_minor, tutar_birim,
              kesinlesmis, zaman, saglayici_referans, uye_isyeri, personel_id, proje_id, santiye_id,
              maliyet_kodu, kaynak_nesne, kaynak_id, ters_kayit_id, aciklama, olusturan, olusturuldu)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, ctx.tenant.id, p.kartId, p.tur, yon, String(tutar),
    p.tutarBirim || ctx.tenant.para_birimi || 'TRY',
    p.kesinlesmis === 0 ? 0 : 1, p.zaman ?? simdi(),
    p.saglayiciReferans || null, p.uyeIsyeri || null, p.personelId || null,
    p.projeId || null, p.santiyeId || null, p.maliyetKodu || null,
    p.kaynakNesne || null, p.kaynakId || null, p.tersKayitId || null,
    p.aciklama || null, ctx.kullanici.id, simdi());

  audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
    nesne: 'kart_hareketi', nesneId: id, eylem: `defter:${p.tur}`,
    sonraki: { kart: p.kartId, yon, tutarMinor: String(tutar),
      kesinlesmis: p.kesinlesmis === 0 ? 0 : 1,
      kaynak: p.kaynakNesne, kaynakId: p.kaynakId } });
  return id;
}

/**
 * Ters kayıt: satırı SİLMEZ, karşıt yönlü yeni satır yazar.
 * §6.5: "sağlayıcıdan gelmeyen istisnai düzeltme çift onay, belge ve ters
 * kayıt mekanizması ister" — çift onay çağıran akışta (CRD-16) uygulanır,
 * defterin sorumluluğu satırın değişmezliğidir.
 */
export function tersKayit(ctx, hareketId, gerekce) {
  if (!String(gerekce || '').trim()) {
    throw DogrulamaHatasi('Ters kayıt için gerekçe zorunludur.', { alanlar: { gerekce: ['Gerekçe girin.'] } });
  }
  const h = tek('SELECT * FROM kart_hareketi WHERE id = ? AND tenant_id = ?', hareketId, ctx.tenant.id);
  if (!h) throw DogrulamaHatasi('Hareket bulunamadı.');
  if (h.ters_kayit_id) throw GecisIzinsiz('Ters kayıt satırı yeniden ters çevrilemez.');
  if (tek('SELECT id FROM kart_hareketi WHERE ters_kayit_id = ?', hareketId)) {
    throw GecisIzinsiz('Bu hareket zaten ters kayıtla düzeltilmiş.');
  }
  return hareketYaz(ctx, {
    kartId: h.kart_id, tur: 'duzeltme', yon: h.yon === 1 ? -1 : 1,
    tutarMinor: h.tutar_minor, tutarBirim: h.tutar_birim, kesinlesmis: h.kesinlesmis,
    personelId: h.personel_id, projeId: h.proje_id, santiyeId: h.santiye_id,
    maliyetKodu: h.maliyet_kodu, kaynakNesne: h.kaynak_nesne, kaynakId: h.kaynak_id,
    tersKayitId: h.id, aciklama: `Ters kayıt: ${gerekce}`,
    /* Ters kayıt bakiyeyi geçici olarak eksiye itebilir; defterin gerçeği
       yansıtması, düzeltmenin engellenmesinden önceliklidir. */
    saglayiciKaynakli: true,
  });
}

/**
 * Bekleyen bir hareketi kesinleştirir. Satır DEĞİŞMEZ olduğu için provizyon
 * satırı ters kayıtla kapatılır ve kesinleşmiş satır yeniden yazılır.
 */
export function kesinlestir(ctx, hareketId, { tutarMinor = null } = {}) {
  const h = tek('SELECT * FROM kart_hareketi WHERE id = ? AND tenant_id = ?', hareketId, ctx.tenant.id);
  if (!h) throw DogrulamaHatasi('Hareket bulunamadı.');
  if (h.kesinlesmis) throw GecisIzinsiz('Hareket zaten kesinleşmiş.');
  tersKayit(ctx, h.id, 'Provizyon kapatıldı');
  return hareketYaz(ctx, {
    kartId: h.kart_id, tur: h.tur, yon: h.yon,
    tutarMinor: tutarMinor ?? h.tutar_minor, tutarBirim: h.tutar_birim, kesinlesmis: 1,
    /* Sağlayıcı referansı provizyon satırında kaldı; kesinleşen satır kendi
       referansını taşır — aynı referans iki kez muhasebeleşemez. */
    saglayiciReferans: h.saglayici_referans ? `${h.saglayici_referans}#K` : null,
    uyeIsyeri: h.uye_isyeri, personelId: h.personel_id, projeId: h.proje_id,
    santiyeId: h.santiye_id, maliyetKodu: h.maliyet_kodu,
    kaynakNesne: h.kaynak_nesne, kaynakId: h.kaynak_id,
    aciklama: 'Provizyon kesinleşti', saglayiciKaynakli: true,
  });
}

/* --- Döküm --------------------------------------------------------------- */
/**
 * Hareket dökümü + YÜRÜYEN BAKİYE. Yürüyen bakiye saklanmaz; listeleme anında
 * toplanır — ekran ile defter arasında ayrışma imkânsızdır.
 */
export function dokum(tenantId, { kartId = null, hesapId = null, personelId = null,
                                  baslangic = null, bitis = null, tur = null, limit = 500 } = {}) {
  const kosul = ['h.tenant_id = ?']; const p = [tenantId];
  if (kartId) { kosul.push('h.kart_id = ?'); p.push(kartId); }
  if (hesapId) { kosul.push('k.hesap_id = ?'); p.push(hesapId); }
  if (personelId) { kosul.push('h.personel_id = ?'); p.push(personelId); }
  if (baslangic != null) { kosul.push('h.zaman >= ?'); p.push(baslangic); }
  if (bitis != null) { kosul.push('h.zaman < ?'); p.push(bitis); }
  if (tur) { kosul.push('h.tur = ?'); p.push(tur); }

  const satirlar = sorgu(
    `SELECT h.*, k.kod AS kart_kod, k.maskeli_no, k.hesap_id
       FROM kart_hareketi h JOIN kart k ON k.id = h.kart_id
      WHERE ${kosul.join(' AND ')}
      ORDER BY h.zaman ASC, h.olusturuldu ASC LIMIT ?`, ...p, limit);
  if (kartId) {
    let y = 0;
    for (const s of satirlar) { if (s.kesinlesmis) y += s.yon * Number(s.tutar_minor); s.yuruyen_minor = y; }
  }
  return satirlar;
}

/** Bir belgenin ürettiği tüm kart hareketleri (izlenebilirlik). */
export const kaynakHareketleri = (kaynakNesne, kaynakId) => sorgu(
  `SELECT h.*, k.kod AS kart_kod, k.maskeli_no FROM kart_hareketi h
     JOIN kart k ON k.id = h.kart_id
    WHERE h.kaynak_nesne = ? AND h.kaynak_id = ? ORDER BY h.zaman, h.olusturuldu`,
  kaynakNesne, kaynakId);
