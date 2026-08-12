/* ============================================================================
   YAPILANDIRMA — ortam, güvenlik ayarları ve özellik bayrakları
   ----------------------------------------------------------------------------
   "Rol seçerek incele" gibi demo yüzeyleri BAYRAĞA bağlıdır ve üretimde
   kapalıdır (doküman 2.1). Bayrak istemciden gelemez; sunucu tarafında
   ozellik_bayragi tablosundan okunur.
   ========================================================================== */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tek } from './db.mjs';

export const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const ORTAM = process.env.GB_ORTAM || 'gelistirme';   // gelistirme | test | uretim

export const yapilandirma = {
  ortam: ORTAM,
  uretim: ORTAM === 'uretim',
  port: Number(process.env.GB_PORT || 8787),
  /* Dinlenen adres. Öntanımlı yerel arayüz: uygulama sunucu tarafı yetki
     çözdüğü için dışarı açılması bilinçli bir karar olmalı (GB_HOST). */
  host: process.env.GB_HOST || '127.0.0.1',
  /* Çerez `Secure` bayrağı üretimde zorunlu; yerel HTTP'de çerez düşerdi. */
  guvenliCerez: ORTAM === 'uretim' || process.env.GB_HTTPS === '1',
  oturumSuresiMs: 12 * 60 * 60 * 1000,      // 12 saat
  oturumYenilemeMs: 30 * 60 * 1000,         // 30 dk hareketsizlikte son_erisim güncelle
  davetSuresiMs: 7 * 24 * 60 * 60 * 1000,
  sifirlamaSuresiMs: 60 * 60 * 1000,        // 1 saat — tek kullanımlık
  /* K-021: e-posta gönderimi BAĞLI DEĞİL. Bu bayrak kapalıyken hiçbir ekran
     "gönderildi" DEMEZ (kural 3); bağlantının elden iletilmesi gerektiği açıkça
     yazılır. Gerçek bir gönderici bağlandığında burası açılır ve metinler
     kendiliğinden doğru hale gelir. */
  epostaBagli: process.env.GB_EPOSTA === '1',
  /* K-027: antivirüs taraması dosya yüklemede BAĞLI DEĞİL. Bayrak kapalıyken
     yükleme ekranları bunu açıkça yazar (kural 3'ün eksik beyan karşılığı);
     gerçek bir tarayıcı adaptörü bağlandığında burası açılır. */
  antivirusBagli: process.env.GB_ANTIVIRUS === '1',
  mfaAdimSuresiMs: 5 * 60 * 1000,
  girisDenemeSiniri: 5,
  girisPenceresiMs: 15 * 60 * 1000,
  girisKilitMs: 15 * 60 * 1000,
  parolaEnAz: 10,
  maxGovdeBayt: 2 * 1024 * 1024,
  varsayilanSayfaBoyutu: 25,
  sayfaBoyutlari: [25, 50, 100],
  /* SATIR TAVANLARI (denetim-02 D-14, KARARLAR.md K-126).
     Sınırsız rapor 10 bin satırda 7,5 MB HTML ve +340 MB RSS üretiyordu.
     Tavan aşılınca ASLA sessizce kırpılmaz: kaç satır olduğu söylenir ve
     filtre daraltması istenir (D-05'in açık ret kalıbı). */
  ekranSatirTavani: 5_000,
  dosyaSatirTavani: 20_000,
  /* Serbest metin uzunlukları (denetim-02 D-15, K-127). */
  metinEnFazla: 4_000,        // uzunMetin/textarea alanları: açıklama, not, gerekçe
  kisaMetinEnFazla: 250,      // tek satırlık metin alanları
};

/** Manifest — tek kaynak (değişmez kural 1). Süreç ömrü boyunca bir kez okunur. */
let _manifest = null;
export function manifest() {
  if (!_manifest) _manifest = JSON.parse(readFileSync(resolve(KOK, 'manifest/screen-manifest.json'), 'utf8'));
  return _manifest;
}

/* --- Özellik bayrakları (SET-18) ---------------------------------------- */
export const BAYRAKLAR = {
  DEMO_ROL_SECIMI: 'demo.rol_secimi',
  DEMO_VERI: 'demo.veri',
};

/**
 * Bayrak durumu: tenant'a özel kayıt > küresel kayıt > kapalı.
 * Üretim ortamında demo bayrakları kod düzeyinde de kilitlidir — veritabanına
 * yanlışlıkla açık kayıt düşse bile üretimde açılmaz (en kısıtlayıcı seçenek).
 */
export function bayrakAcik(kod, tenantId = null) {
  if (yapilandirma.uretim && kod.startsWith('demo.')) return false;
  const ozel = tenantId ? tek('SELECT acik FROM ozellik_bayragi WHERE kod = ? AND tenant_id = ?', kod, tenantId) : null;
  if (ozel) return !!ozel.acik;
  const kuresel = tek('SELECT acik FROM ozellik_bayragi WHERE kod = ? AND tenant_id IS NULL', kod);
  return !!(kuresel && kuresel.acik);
}
