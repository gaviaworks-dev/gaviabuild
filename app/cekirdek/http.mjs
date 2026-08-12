/* ============================================================================
   HTTP ÇEKİRDEĞİ — router, istek bağlamı, çerez, gövde, güvenlik başlıkları
   ----------------------------------------------------------------------------
   Rota tablosu screen-manifest'ten türer (değişmez kural 1). Statik segment
   dinamik segmenti yener (KARARLAR.md K-015).
   ========================================================================== */
import { URL } from 'node:url';
import { istekKimligi } from './kimlikler.mjs';
import { yapilandirma } from './yapilandirma.mjs';
import { hataCevir, DogrulamaHatasi, GovdeCokBuyuk } from './hata.mjs';

/* --- Router -------------------------------------------------------------- */
export class Yonlendirici {
  constructor() { this.rotalar = []; }

  /** @param {string} metot @param {string} desen @param {Function} isleyici @param {object} meta */
  ekle(metot, desen, isleyici, meta = {}) {
    const parcalar = desen.split('/').filter(Boolean).map((p) => (p.startsWith(':')
      ? { tur: 'param', ad: p.slice(1) }
      : { tur: 'sabit', deger: p }));
    /* Statik segment sayısı sıralama anahtarı: /a/b sabitleri /a/:id'den önce gelir. */
    const sabitSayisi = parcalar.filter((p) => p.tur === 'sabit').length;
    this.rotalar.push({ metot, desen, parcalar, isleyici, meta, sabitSayisi });
    this.rotalar.sort((a, b) => b.sabitSayisi - a.sabitSayisi || a.parcalar.length - b.parcalar.length);
    return this;
  }
  get(d, h, m)  { return this.ekle('GET', d, h, m); }
  post(d, h, m) { return this.ekle('POST', d, h, m); }

  coz(metot, yol) {
    const parcalar = yol.split('/').filter(Boolean);
    let yolEslesti = false;
    for (const r of this.rotalar) {
      if (r.parcalar.length !== parcalar.length) continue;
      const params = {};
      let uyum = true;
      for (let i = 0; i < parcalar.length; i++) {
        const p = r.parcalar[i];
        if (p.tur === 'sabit') { if (decodeURIComponent(parcalar[i]) !== p.deger) { uyum = false; break; } }
        else params[p.ad] = decodeURIComponent(parcalar[i]);
      }
      if (!uyum) continue;
      yolEslesti = true;
      if (r.metot !== metot) continue;
      return { rota: r, params };
    }
    return yolEslesti ? { yontemUyumsuz: true } : null;
  }
}

/* --- Çerez --------------------------------------------------------------- */
export function cerezleriAyristir(basliksatiri = '') {
  const c = {};
  for (const parca of basliksatiri.split(';')) {
    const i = parca.indexOf('=');
    if (i < 0) continue;
    c[parca.slice(0, i).trim()] = decodeURIComponent(parca.slice(i + 1).trim());
  }
  return c;
}

/**
 * Oturum çerezi HttpOnly + Secure + SameSite ile SUNUCUDAN verilir (doküman 2.1).
 * SameSite=Lax: CSRF yüzeyini daraltır, normal gezinmede oturumu korur.
 */
export function cerezYaz(ad, deger, { maxYas = null, httpOnly = true, yol = '/' } = {}) {
  const p = [`${ad}=${encodeURIComponent(deger)}`, `Path=${yol}`, 'SameSite=Lax'];
  if (httpOnly) p.push('HttpOnly');
  if (yapilandirma.guvenliCerez) p.push('Secure');
  if (maxYas != null) p.push(`Max-Age=${Math.floor(maxYas / 1000)}`);
  return p.join('; ');
}
export const cerezSil = (ad) => `${ad}=; Path=/; Max-Age=0; SameSite=Lax${yapilandirma.guvenliCerez ? '; Secure' : ''}; HttpOnly`;

/* --- Gövde --------------------------------------------------------------- */
/**
 * Gövde sınırı aşımı (denetim-02 D-13, K-128).
 *
 * Sınır aşılınca akışı okumayı bırakırız; soketin okunmamış gövdeyle kalması
 * aynı keep-alive bağlantısındaki BİR SONRAKİ isteği `ECONNRESET` ile
 * düşürüyordu. Yanıt `413` döner ve `sunucu.mjs` bağlantıyı `Connection: close`
 * ile düzgünce kapatır: kullanıcı önce dürüst bir hata, sonra çalışan bir
 * bağlantı görür.
 */
export const govdeSiniriAsildi = (boyut = null) => GovdeCokBuyuk(
  `Gönderilen veri çok büyük: en fazla ${Math.floor(yapilandirma.maxGovdeBayt / 1048576)} MB `
  + `kabul edilir${boyut ? ` (gelen: ${(boyut / 1048576).toFixed(1)} MB)` : ''}. `
  + 'Dosyayı küçültüp veya metni kısaltıp tekrar deneyin.');

/**
 * Sınırı aşan gövdeyi BELLEĞE ALMADAN ama AKIŞTAN OKUYARAK tüketir.
 *
 * Okumayı büsbütün bırakmak soketi yarım gövdeyle bırakıyor ve istemci temiz
 * 413'ü göremeden yazma hatası alıyordu. Kalanı biriktirmeden boşaltırız:
 * bellek maliyeti yok, istemci gönderimini bitirir ve dürüst 413'ü okur.
 * Kötü niyetli sonsuz gövdeye karşı boşaltmanın da bir tavanı vardır.
 */
const BOSALTMA_TAVANI_KATI = 8;

export async function govdeyiBosalt(istek, okunan = 0) {
  const tavan = yapilandirma.maxGovdeBayt * BOSALTMA_TAVANI_KATI;
  let boyut = okunan;
  try {
    for await (const p of istek) {
      boyut += p.length;
      if (boyut > tavan) return { boyut, tamBosaldi: false };
    }
  } catch { return { boyut, tamBosaldi: false }; }
  return { boyut, tamBosaldi: true };
}
export async function govdeOku(istek) {
  const bildirilen = Number(istek.headers['content-length'] || 0);
  if (bildirilen > yapilandirma.maxGovdeBayt) {
    const { boyut } = await govdeyiBosalt(istek);
    throw govdeSiniriAsildi(Math.max(boyut, bildirilen));
  }
  const parcalar = [];
  let boyut = 0;
  for await (const p of istek) {
    boyut += p.length;
    if (boyut > yapilandirma.maxGovdeBayt) {
      parcalar.length = 0;                       // biriktirmeyi bırak
      const b = await govdeyiBosalt(istek, boyut);
      throw govdeSiniriAsildi(b.boyut);
    }
    parcalar.push(p);
  }
  const ham = Buffer.concat(parcalar).toString('utf8');
  const tur = (istek.headers['content-type'] || '').split(';')[0].trim();
  if (!ham) return {};
  if (tur === 'application/json') {
    try { return JSON.parse(ham); } catch { throw DogrulamaHatasi('Geçersiz JSON gövdesi.'); }
  }
  if (tur === 'application/x-www-form-urlencoded') {
    const p = new URLSearchParams(ham);
    const o = {};
    for (const [k, v] of p) {
      if (k in o) o[k] = [].concat(o[k], v);   // çoklu seçim alanları
      else o[k] = v;
    }
    return o;
  }
  return { _ham: ham };
}

/* --- İstek bağlamı ------------------------------------------------------- */
export function baglamOlustur(istek, yanit) {
  const url = new URL(istek.url, 'http://yerel');
  return {
    istekId: istekKimligi(),
    metot: istek.method,
    yol: url.pathname,
    sorgu: url.searchParams,
    cerezler: cerezleriAyristir(istek.headers.cookie),
    ip: (istek.headers['x-forwarded-for'] || istek.socket.remoteAddress || '').split(',')[0].trim(),
    tarayici: istek.headers['user-agent'] || '',
    basliklar: istek.headers,
    istek, yanit,
    oturum: null, kullanici: null, tenant: null, yetkiler: null,
    kurulacakCerezler: [],
    cerezAyarla(satir) { this.kurulacakCerezler.push(satir); },
  };
}

/* --- Yanıt --------------------------------------------------------------- */
const GUVENLIK_BASLIKLARI = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'geolocation=(self), camera=(self), microphone=()',
};

export function yanitla(ctx, durum, govde, basliklar = {}) {
  const ek = { ...GUVENLIK_BASLIKLARI, 'X-Istek-Id': ctx.istekId, ...basliklar };
  if (ctx.kurulacakCerezler.length) ek['Set-Cookie'] = ctx.kurulacakCerezler;
  ctx.yanit.writeHead(durum, ek);
  ctx.yanit.end(govde);
}

export const html = (ctx, durum, govde) =>
  yanitla(ctx, durum, govde, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });

export const json = (ctx, durum, nesne) =>
  yanitla(ctx, durum, JSON.stringify(nesne, (_, v) => (typeof v === 'bigint' ? v.toString() : v)),
    { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });

export const yonlendir = (ctx, hedef, durum = 303) =>
  yanitla(ctx, durum, '', { Location: hedef });

/** İstemcinin HTML mi JSON mu beklediği — aynı rota ikisini de servis eder. */
export const jsonIster = (ctx) =>
  (ctx.basliklar.accept || '').includes('application/json') ||
  (ctx.basliklar['content-type'] || '').includes('application/json');

export { hataCevir };
