/* ============================================================================
   TEST YARDIMCISI — gerçek HTTP sunucusuna karşı uçtan uca istemci
   ----------------------------------------------------------------------------
   Testler uygulamayı MOCK'lamaz: gerçek sunucu, gerçek veritabanı (bellek içi),
   gerçek çerez ve CSRF akışıyla konuşur. Aksi halde "sunucu tarafı yetki"
   iddiası test edilmiş olmaz.
   ========================================================================== */
import { createServer } from 'node:http';
import { uygulamaKur } from '../app/sunucu.mjs';
import { kapat } from '../app/cekirdek/db.mjs';

export async function uygulamaBaslat() {
  const uygulama = uygulamaKur({ dbYolu: ':memory:' });
  const sunucu = createServer((istek, yanit) => uygulama.istegiIsle(istek, yanit));
  await new Promise((c) => sunucu.listen(0, '127.0.0.1', c));
  const port = sunucu.address().port;
  const taban = `http://127.0.0.1:${port}`;

  return {
    taban, sunucu, uygulama,
    istemci: () => yeniIstemci(taban),
    async kapat() { await new Promise((c) => sunucu.close(c)); kapat(); },
  };
}

function cerezAyristir(satirlar = []) {
  const c = new Map();
  for (const s of satirlar) {
    const [ciftler] = s.split(';');
    const i = ciftler.indexOf('=');
    const ad = ciftler.slice(0, i).trim();
    const deger = ciftler.slice(i + 1).trim();
    if (/Max-Age=0/.test(s)) c.delete(ad); else c.set(ad, deger);
  }
  return c;
}

/** Çerez saklayan, yönlendirme izleyen küçük istemci. */
export function yeniIstemci(taban) {
  const cerezler = new Map();

  async function ham(yol, { metot = 'GET', govde = null, izle = true, basliklar = {} } = {}) {
    const c = [...cerezler].map(([k, v]) => `${k}=${v}`).join('; ');
    const secenekler = { method: metot, redirect: 'manual', headers: { ...basliklar } };
    if (c) secenekler.headers.cookie = c;
    if (govde) {
      secenekler.headers['content-type'] = 'application/x-www-form-urlencoded';
      secenekler.body = new URLSearchParams(govde).toString();
    }
    const y = await fetch(taban + yol, secenekler);
    const kur = cerezAyristir(y.headers.getSetCookie?.() || []);
    for (const [k, v] of kur) {
      if (v === '') cerezler.delete(k); else cerezler.set(k, decodeURIComponent(v));
    }
    for (const s of (y.headers.getSetCookie?.() || [])) {
      if (/Max-Age=0/.test(s)) cerezler.delete(s.split('=')[0].trim());
    }
    const metin = await y.text();
    if (izle && [301, 302, 303, 307, 308].includes(y.status)) {
      return ham(y.headers.get('location'), { izle: true });
    }
    return { durum: y.status, govde: metin, basliklar: y.headers, yol };
  }

  return {
    cerezler,
    get: (yol, s) => ham(yol, { ...s }),
    post: (yol, govde, s) => ham(yol, { metot: 'POST', govde, ...s }),
    /** Formdaki CSRF alanını okuyup gönderime ekler. */
    async csrfIle(yol, govde, s) {
      const csrf = cerezler.get('gb_csrf');
      return ham(yol, { metot: 'POST', govde: { ...govde, _csrf: csrf }, ...s });
    },
    async giris(eposta, parola = 'Demo.Parola.2026') {
      await ham('/giris');
      return ham('/giris', { metot: 'POST', govde: { eposta, parola } });
    },
  };
}
