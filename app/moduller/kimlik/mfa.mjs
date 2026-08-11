/* ============================================================================
   MFA — TOTP (RFC 6238), node:crypto ile, bağımlılıksız  (AUTH-05)
   ----------------------------------------------------------------------------
   30 saniyelik pencere, ±1 pencere tolerans (saat kayması). Kullanılan kod
   tekrar kabul edilmez (replay koruması) — oturumdaki son adım kaydedilir.
   ========================================================================== */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { simdi } from '../../cekirdek/zaman.mjs';

const ALFABE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';   // base32 (RFC 4648)

export function gizliUret(bayt = 20) {
  const b = randomBytes(bayt);
  let bit = 0, deger = 0, s = '';
  for (const x of b) {
    deger = (deger << 8) | x; bit += 8;
    while (bit >= 5) { s += ALFABE[(deger >>> (bit - 5)) & 31]; bit -= 5; }
  }
  if (bit > 0) s += ALFABE[(deger << (5 - bit)) & 31];
  return s;
}

function base32Coz(s) {
  let bit = 0, deger = 0;
  const cikti = [];
  for (const c of s.toUpperCase().replace(/=+$/, '')) {
    const i = ALFABE.indexOf(c);
    if (i < 0) continue;
    deger = (deger << 5) | i; bit += 5;
    if (bit >= 8) { cikti.push((deger >>> (bit - 8)) & 255); bit -= 8; }
  }
  return Buffer.from(cikti);
}

export function kodUret(gizli, zamanMs = simdi(), adim = 30) {
  const sayac = Math.floor(zamanMs / 1000 / adim);
  const tampon = Buffer.alloc(8);
  tampon.writeBigUInt64BE(BigInt(sayac));
  const ozet = createHmac('sha1', base32Coz(gizli)).update(tampon).digest();
  const konum = ozet[ozet.length - 1] & 0xf;
  const sayi = ((ozet[konum] & 0x7f) << 24) | (ozet[konum + 1] << 16) | (ozet[konum + 2] << 8) | ozet[konum + 3];
  return String(sayi % 1_000_000).padStart(6, '0');
}

/** ±1 pencere toleransıyla doğrular; hangi pencerede eşleştiğini döner (replay için). */
export function kodDogrula(gizli, kod, zamanMs = simdi()) {
  const temiz = String(kod || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(temiz)) return { gecerli: false };
  for (const kayma of [0, -1, 1]) {
    const beklenen = kodUret(gizli, zamanMs + kayma * 30_000);
    const a = Buffer.from(beklenen), b = Buffer.from(temiz);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return { gecerli: true, pencere: Math.floor((zamanMs + kayma * 30_000) / 30_000) };
    }
  }
  return { gecerli: false };
}

/** Kimlik doğrulayıcı uygulamasına verilecek otpauth URI'si. */
export const kurulumUri = (gizli, eposta, yayinci = 'GaviaBuild') =>
  `otpauth://totp/${encodeURIComponent(yayinci)}:${encodeURIComponent(eposta)}` +
  `?secret=${gizli}&issuer=${encodeURIComponent(yayinci)}&algorithm=SHA1&digits=6&period=30`;
