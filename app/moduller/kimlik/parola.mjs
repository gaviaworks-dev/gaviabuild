/* ============================================================================
   PAROLA — scrypt (node:crypto), kullanıcı başına tuz  (KARARLAR.md K-008)
   ----------------------------------------------------------------------------
   Bcrypt/argon2 npm bağımlılığı gerektirir (K-002 sıfır bağımlılık). scrypt
   yerleşiktir ve memory-hard'dır. Parametreler OWASP önerisiyle uyumlu.
   ========================================================================== */
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { DogrulamaHatasi } from '../../cekirdek/hata.mjs';
import { yapilandirma } from '../../cekirdek/yapilandirma.mjs';

const N = 2 ** 15, r = 8, p = 1, ANAHTAR_UZUNLUK = 64, MAXMEM = 64 * 1024 * 1024;

export function ozetle(parola, tuz = randomBytes(16).toString('hex')) {
  const ozet = scryptSync(parola.normalize('NFKC'), tuz, ANAHTAR_UZUNLUK, { N, r, p, maxmem: MAXMEM });
  return { ozet: ozet.toString('hex'), tuz };
}

/** Zamanlama saldırısına kapalı doğrulama. Kayıtsız kullanıcıda da aynı süre harcanır. */
export function dogrula(parola, ozet, tuz) {
  if (!ozet || !tuz) {
    /* Sahte iş: "kullanıcı yok" ile "parola yanlış" arasında zaman farkı bırakma. */
    scryptSync(String(parola), 'sahte-tuz-degeri', ANAHTAR_UZUNLUK, { N, r, p, maxmem: MAXMEM });
    return false;
  }
  const hesap = scryptSync(String(parola).normalize('NFKC'), tuz, ANAHTAR_UZUNLUK, { N, r, p, maxmem: MAXMEM });
  const kayitli = Buffer.from(ozet, 'hex');
  return hesap.length === kayitli.length && timingSafeEqual(hesap, kayitli);
}

const YAYGIN = new Set(['123456789', 'password', 'parola123', 'qwertyuiop', '1234567890', 'sifre1234', 'admin12345']);

/** Parola politikası — ihlaller ALAN BAZLI döner (§3.2 alan hata özeti). */
export function politikaKontrol(parola, { adSoyad = '', eposta = '' } = {}) {
  const hatalar = [];
  const s = String(parola || '');
  if (s.length < yapilandirma.parolaEnAz) hatalar.push(`En az ${yapilandirma.parolaEnAz} karakter olmalı.`);
  if (s.length > 200) hatalar.push('En fazla 200 karakter olabilir.');
  if (!/[a-zçğıöşü]/.test(s)) hatalar.push('En az bir küçük harf içermeli.');
  if (!/[A-ZÇĞİÖŞÜ]/.test(s)) hatalar.push('En az bir büyük harf içermeli.');
  if (!/\d/.test(s)) hatalar.push('En az bir rakam içermeli.');
  if (YAYGIN.has(s.toLowerCase())) hatalar.push('Bu parola çok yaygın kullanılıyor.');
  const yerel = eposta.split('@')[0]?.toLowerCase();
  if (yerel && yerel.length > 2 && s.toLowerCase().includes(yerel)) hatalar.push('Parola e-posta adresinizi içeremez.');
  for (const parca of adSoyad.split(/\s+/).filter((x) => x.length > 3)) {
    if (s.toLowerCase().includes(parca.toLowerCase())) { hatalar.push('Parola adınızı içeremez.'); break; }
  }
  return hatalar;
}

export function politikaZorunlu(parola, bilgi) {
  const hatalar = politikaKontrol(parola, bilgi);
  if (hatalar.length) throw DogrulamaHatasi('Parola politikası sağlanmadı.', { alanlar: { parola: hatalar } });
}
