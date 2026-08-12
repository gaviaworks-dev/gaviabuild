/* ============================================================================
   SUNUCU — istek boru hattı
   ----------------------------------------------------------------------------
   Sıra: bağlam → oturum yükle → rota çöz → yetki (isleyicide) → gövde → yanıt.
   Her istek bir `istekId` taşır; hata yanıtında ve denetim izinde aynı kimlik
   görünür (OPS-01: "entegrasyon hatası istek kimliğiyle izlenir").
   ========================================================================== */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, normalize } from 'node:path';
import { ac as dbAc } from './cekirdek/db.mjs';
import { yapilandirma, KOK, manifest } from './cekirdek/yapilandirma.mjs';
import { baglamOlustur, govdeOku, html, json, yanitla, yonlendir, jsonIster } from './cekirdek/http.mjs';
import { hataCevir, UygulamaHatasi, Bulunamadi } from './cekirdek/hata.mjs';
import { yukle as oturumYukle, csrfAlani } from './moduller/kimlik/oturum.mjs';
import { rolleriKur, demoTenantKur, kapsamKurallariKur } from './moduller/kimlik/tohum.mjs';
import { isAkisiTohumla } from './moduller/isakisi/tohum.mjs';
import { kartTohumla } from './moduller/kartlar/tohum.mjs';
import { sorgu } from './cekirdek/db.mjs';
import { yonlendiriciKur, uygulananKodlar } from './rotalar.mjs';
import { durumSayfasi } from './web/sayfalar/kimlik.mjs';
import { btn } from './web/bilesenler.mjs';
import { h } from './web/temel.mjs';

const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

/* Statik önek `/statik/`: `/varliklar` MANİFEST rotasıdır (AST-01), statik dosya
   öneki olamaz — aksi halde /varliklar/yeni dosya araması olarak 404 dönerdi. */
function statikServisEt(ctx) {
  /* Yol geçişi (path traversal) koruması: normalize + kök kontrolü. */
  const gorece = normalize(ctx.yol.replace(/^\/statik\//, '')).replace(/^(\.\.[/\\])+/, '');
  const yol = resolve(KOK, 'app/web/statik', gorece);
  if (!yol.startsWith(resolve(KOK, 'app/web/statik'))) throw Bulunamadi();
  if (!existsSync(yol) || !statSync(yol).isFile()) throw Bulunamadi();
  const tur = MIME[extname(yol)] || 'application/octet-stream';
  return yanitla(ctx, 200, readFileSync(yol), {
    'Content-Type': tur,
    'Cache-Control': yapilandirma.uretim ? 'public, max-age=3600' : 'no-store',
  });
}

async function istegiIsle(yonlendirici, istek, yanit) {
  const ctx = baglamOlustur(istek, yanit);
  try {
    if (ctx.yol.startsWith('/statik/')) return statikServisEt(ctx);

    oturumYukle(ctx);
    ctx.csrfAlani = ctx.oturum ? csrfAlani(ctx) : '';

    const eslesme = yonlendirici.coz(ctx.metot, ctx.yol);
    if (!eslesme) throw Bulunamadi();
    if (eslesme.yontemUyumsuz) {
      return yanitla(ctx, 405, '', { Allow: 'GET, POST' });
    }

    const { rota, params } = eslesme;
    const ekran = rota.meta?.ekran;

    /* Kimlik gerektiren ekranda oturum yoksa: giriş sayfasına, hedef korunarak. */
    if (ekran && !ekran.acik && !ctx.kullanici) {
      if (jsonIster(ctx)) return json(ctx, 401, { hata: { kod: 'KIMLIK_GEREKLI', mesaj: 'Oturum açmanız gerekiyor.' } });
      return yonlendir(ctx, `/giris?hedef=${encodeURIComponent(ctx.yol)}`);
    }
    /* Kurulum tamamlanmadan uygulamaya girilemez (AUTH-06). */
    if (ctx.kullanici && !ctx.kullanici.kurulum_tamam && ekran && !ekran.acik
        && !['AUTH-06', 'AUTH-07'].includes(ekran.kod) && ctx.yol !== '/cikis') {
      return yonlendir(ctx, '/ilk-kurulum');
    }

    /* multipart/form-data gövdesini isleyici KENDİ okur (dosya akışı bellek
       kopyası üretmesin diye router burada tüketmez). */
    const cokluParca = (istek.headers['content-type'] || '').startsWith('multipart/form-data');
    const govde = ctx.metot === 'POST' && !cokluParca ? await govdeOku(istek) : {};
    /* `return await` ŞART: `return promise` biçimi try bloğunu beklemeden döner,
       async isleyicideki hata catch'e düşmez ve süreç çökerdi. */
    return await rota.isleyici(ctx, govde, params);
  } catch (ham) {
    return hatayiYanitla(ctx, ham);
  }
}

function hatayiYanitla(ctx, hamHata) {
  const e = hataCevir(hamHata);
  if (e.durum >= 500) console.error(`[${ctx.istekId}] ${e.kod}`, e.ayrinti?.asil || e.message, e.ayrinti?.yigin || '');

  /* 413'te gövdenin OKUNMAMIŞ kalanı sokette durur; aynı keep-alive
     bağlantısındaki bir sonraki istek ECONNRESET alıyordu (denetim-02 D-13,
     K-128). Yanıtı `Connection: close` ile veririz: istemci dürüst bir 413
     görür ve bu bağlantıyı yeniden kullanmaz. */
  if (e.durum === 413) {
    ctx.istek.on('error', () => {});      // boşaltma tavanı aşıldıysa kalan sessizce düşer
    if (!ctx.istek.readableEnded) ctx.yanit.setHeader('Connection', 'close');
  }

  if (jsonIster(ctx)) return json(ctx, e.durum, { ...e.govde(), istekId: ctx.istekId });

  const eslesen = {
    401: { kod: 'AUTH-07', baslik: 'Oturum açmanız gerekiyor', ikon: 'fa-right-to-bracket', ton: 'info',
           eylemler: btn('Giriş yap', { tur: 'acc', rota: '/giris' }) },
    403: { kod: 'AUTH-08', baslik: 'Bu sayfaya erişim yetkiniz yok', ikon: 'fa-lock', ton: 'danger',
           eylemler: btn('Ana sayfaya dön', { tur: 'acc', rota: '/' }) },
    404: { kod: 'AUTH-09', baslik: 'Aradığınız sayfa bulunamadı', ikon: 'fa-compass', ton: 'info',
           eylemler: btn('Ana sayfaya dön', { tur: 'acc', rota: '/' }) },
    413: { baslik: 'Gönderilen veri çok büyük', ikon: 'fa-file-circle-exclamation', ton: 'warn',
           eylemler: btn('Geri dön', { tur: 'acc', rota: ctx.basliklar.referer || '/' }) },
    503: { kod: 'AUTH-10', baslik: 'Sistem geçici olarak kullanılamıyor', ikon: 'fa-screwdriver-wrench', ton: 'warn',
           eylemler: btn('Yeniden dene', { tur: 'acc', rota: ctx.yol }) },
  }[e.durum];

  const s = eslesen || { baslik: e.durum >= 500 ? 'Beklenmeyen bir hata oluştu' : 'İşlem tamamlanamadı',
    ikon: e.durum >= 500 ? 'fa-triangle-exclamation' : 'fa-circle-exclamation',
    ton: e.durum >= 500 ? 'danger' : 'warn',
    eylemler: h`${btn('Geri dön', { tur: 'ghost', rota: ctx.basliklar.referer || '/' })}${btn('Ana sayfa', { tur: 'acc', rota: '/' })}` };

  return html(ctx, e.durum, durumSayfasi({
    baslik: s.baslik, ikon: s.ikon, ton: s.ton, eylemler: s.eylemler,
    aciklama: e.gizli ? 'İşlem tamamlanamadı.' : e.mesaj,
    kod: `${e.kod} · ${ctx.istekId}`,
  }));
}

/* --- Başlatma ------------------------------------------------------------- */
export function uygulamaKur({ dbYolu } = {}) {
  dbAc(dbYolu);
  rolleriKur();
  if (!yapilandirma.uretim) demoTenantKur();
  /* Her tenant, onaysız akış başlatılamadığı için asgari şablon setiyle gelir;
     ABAC kapsam/maske kuralları da tenant başına garanti edilir (§5.7). */
  for (const t of sorgu('SELECT id FROM tenant')) { kapsamKurallariKur(t.id); isAkisiTohumla(t.id); kartTohumla(t.id); }
  const yonlendirici = yonlendiriciKur();
  return { yonlendirici, istegiIsle: (istek, yanit) => istegiIsle(yonlendirici, istek, yanit) };
}

export function sunucuBaslat({ port = yapilandirma.port, dbYolu } = {}) {
  const uygulama = uygulamaKur({ dbYolu });
  const sunucu = createServer((istek, yanit) => { uygulama.istegiIsle(istek, yanit); });
  sunucu.listen(port, () => {
    const m = manifest();
    console.log(`[ÜRÜN ADI] (GaviaBuild) — http://localhost:${port}`);
    console.log(`  ortam: ${yapilandirma.ortam} · manifest: ${m.toplamAile} sayfa ailesi`
      + ` · uygulanan: ${uygulananKodlar().size}`);
  });
  return { sunucu, uygulama };
}

if (import.meta.url === `file://${process.argv[1]}`) sunucuBaslat();
