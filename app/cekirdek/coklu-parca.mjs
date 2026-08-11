/* ============================================================================
   MULTIPART/FORM-DATA ÇÖZÜMLEYİCİ — bağımlılıksız (RFC 7578)
   ----------------------------------------------------------------------------
   Dosya yükleme gerçek olmalı (değişmez kural 3): "dosya seçildi" bildirimi
   yeterli değil, bayt sunucuya ulaşmalı, özeti alınmalı ve saklanmalı.
   Güvenlik: boyut sınırı, MIME beyanı ile içerik imzasının karşılaştırılması,
   dosya adının temizlenmesi.
   ========================================================================== */
import { createHash } from 'node:crypto';
import { DogrulamaHatasi } from './hata.mjs';
import { yapilandirma } from './yapilandirma.mjs';

const CRLF = Buffer.from('\r\n');

/** İçerik imzaları (magic bytes) — beyan edilen MIME ile tutarlılık kontrolü. */
const IMZALAR = [
  { mime: 'application/pdf', imza: [0x25, 0x50, 0x44, 0x46] },                 // %PDF
  { mime: 'image/png', imza: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', imza: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', imza: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'application/zip', imza: [0x50, 0x4b, 0x03, 0x04] },                 // xlsx/docx da bu ailedendir
];

export const IZINLI_MIME = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'text/plain', 'text/csv',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

/** Dosya adını yol bileşenlerinden ve tehlikeli karakterlerden arındırır. */
export function dosyaAdiTemizle(ad) {
  const temiz = String(ad || 'dosya')
    .replace(/[\\/]/g, '_')
    .replace(/[\x00-\x1f<>:"|?*]/g, '')
    .replace(/^\.+/, '')
    .slice(0, 180);
  return temiz || 'dosya';
}

function baslikCoz(ham) {
  const basliklar = {};
  for (const satir of ham.split('\r\n')) {
    const i = satir.indexOf(':');
    if (i > 0) basliklar[satir.slice(0, i).trim().toLowerCase()] = satir.slice(i + 1).trim();
  }
  return basliklar;
}

/**
 * @returns {{alanlar:object, dosyalar:Array<{alan,dosyaAdi,mime,bayt,icerik,ozet}>}}
 */
export async function cokluParcaOku(istek) {
  const tur = istek.headers['content-type'] || '';
  const eslesme = tur.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!eslesme) throw DogrulamaHatasi('Geçersiz form gönderimi (sınır belirteci yok).');
  const sinir = Buffer.from('--' + (eslesme[1] || eslesme[2]).trim());

  const parcalar = [];
  let boyut = 0;
  for await (const p of istek) {
    boyut += p.length;
    if (boyut > yapilandirma.maxGovdeBayt) throw DogrulamaHatasi('Yüklenen dosya çok büyük.');
    parcalar.push(p);
  }
  const govde = Buffer.concat(parcalar);

  const alanlar = {};
  const dosyalar = [];
  let konum = govde.indexOf(sinir);
  while (konum !== -1) {
    const basla = konum + sinir.length;
    if (govde.slice(basla, basla + 2).toString() === '--') break;         // kapanış sınırı
    const govdeBasi = govde.indexOf(Buffer.from('\r\n\r\n'), basla);
    if (govdeBasi === -1) break;
    const sonrakiSinir = govde.indexOf(sinir, govdeBasi);
    if (sonrakiSinir === -1) break;

    const basliklar = baslikCoz(govde.slice(basla + 2, govdeBasi).toString('utf8'));
    const icerik = govde.slice(govdeBasi + 4, sonrakiSinir - CRLF.length);
    const cd = basliklar['content-disposition'] || '';
    const alanAdi = (cd.match(/name="([^"]*)"/) || [])[1];
    const dosyaAdi = (cd.match(/filename="([^"]*)"/) || [])[1];

    if (alanAdi) {
      if (dosyaAdi !== undefined) {
        if (dosyaAdi !== '' && icerik.length > 0) {
          dosyalar.push({
            alan: alanAdi,
            dosyaAdi: dosyaAdiTemizle(dosyaAdi),
            mime: (basliklar['content-type'] || 'application/octet-stream').split(';')[0].trim(),
            bayt: icerik.length,
            icerik,
            ozet: createHash('sha256').update(icerik).digest('hex'),
          });
        }
      } else {
        const deger = icerik.toString('utf8');
        if (alanAdi in alanlar) alanlar[alanAdi] = [].concat(alanlar[alanAdi], deger);
        else alanlar[alanAdi] = deger;
      }
    }
    konum = sonrakiSinir;
  }
  return { alanlar, dosyalar };
}

/**
 * Dosyayı doğrular: izinli MIME + içerik imzasının beyanla tutarlılığı.
 * "Antivirüs, MIME doğrulama ve sürümleme uygulanır" (§8) — MIME doğrulaması budur;
 * antivirüs entegrasyonu Faz 5 entegrasyon katmanında adaptör olarak bağlanır.
 */
export function dosyaDogrula(d) {
  const hatalar = [];
  if (!IZINLI_MIME.has(d.mime)) hatalar.push(`Bu dosya türü kabul edilmiyor: ${d.mime}`);
  const beklenen = IMZALAR.find((i) => i.mime === d.mime
    || (d.mime.includes('openxmlformats') && i.mime === 'application/zip'));
  if (beklenen) {
    const bas = [...d.icerik.slice(0, beklenen.imza.length)];
    if (!beklenen.imza.every((b, i) => bas[i] === b)) {
      hatalar.push('Dosya içeriği beyan edilen türle uyuşmuyor.');
    }
  }
  if (d.bayt === 0) hatalar.push('Dosya boş.');
  return hatalar;
}
