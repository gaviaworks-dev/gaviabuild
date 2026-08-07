#!/usr/bin/env node
/* =====================================================================
   CANLI YAYIN DOĞRULAMASI — GitHub Pages
   =====================================================================
   Yerel QA aracı (üretime girmez). Playwright gerektirir.
     node tools/canli-dogrula.cjs
     node tools/canli-dogrula.cjs --sayfa crm-santiye-proje.html

   Ölçtükleri, her sayfa için:
     · sayfa HTTP durumu
     · konsol hatası (console.error) ve yakalanmamış JS istisnası (pageerror)
     · ALT İSTEK hataları — CSS/JS/font/ikon/görsel isteklerinde 4xx/5xx
       (CDN'den gelen Font Awesome ve Google Fonts dahil)
   Alt istek 404'ü yerelde GÖRÜNMEZ: yerel sunucu farklı kök servis eder ve
   büyük/küçük harf duyarlılığı macOS'ta gevşektir. Pages Linux + case-sensitive
   olduğu için yalnız canlıda ortaya çıkan kırıklar vardır — bu betik onları arar.
   ===================================================================== */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.CANLI_BASE || 'https://gaviaworks-dev.github.io/gaviacrm/v2';
const V2DIR = path.join(__dirname, '..', 'v2');
const ESZAMAN = 5;
const arg = (a) => { const i = process.argv.indexOf('--' + a); return i > -1 ? process.argv[i + 1] : null; };

(async () => {
  const tek = arg('sayfa');
  const dosyalar = tek ? [tek] : fs.readdirSync(V2DIR).filter(f => f.endsWith('.html')).sort();
  console.log(`Canlı doğrulama · ${BASE}\n${dosyalar.length} sayfa · konsol hatası + alt istek 4xx/5xx\n`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const bulgular = [];
  let idx = 0, islenen = 0;

  const sayfalar = await Promise.all(Array.from({ length: ESZAMAN }, () => ctx.newPage()));
  await Promise.all(sayfalar.map(async (page) => {
    while (idx < dosyalar.length) {
      const dosya = dosyalar[idx++];
      const konsol = [], altIstek = [];
      const onConsole = (m) => { if (m.type() === 'error') konsol.push(m.text().slice(0, 120)); };
      const onPageErr = (e) => konsol.push('pageerror: ' + e.message.slice(0, 120));
      const onResp = (r) => {
        const s = r.status();
        if (s >= 400 && r.url() !== `${BASE}/${dosya}`) altIstek.push(s + ' ' + r.url().slice(0, 110));
      };
      page.on('console', onConsole); page.on('pageerror', onPageErr); page.on('response', onResp);

      let durum = 0;
      try {
        const resp = await page.goto(`${BASE}/${dosya}?role=superadmin`, { waitUntil: 'networkidle', timeout: 30000 });
        durum = resp ? resp.status() : 0;
      } catch (e) {
        konsol.push('NAV: ' + e.message.split('\n')[0].slice(0, 80));
      }
      await page.waitForTimeout(150);

      page.off('console', onConsole); page.off('pageerror', onPageErr); page.off('response', onResp);
      if (durum !== 200 || konsol.length || altIstek.length)
        bulgular.push({ dosya, durum, konsol: [...new Set(konsol)], altIstek: [...new Set(altIstek)] });

      if (++islenen % 50 === 0) process.stdout.write(`  … ${islenen}/${dosyalar.length}\n`);
    }
  }));
  await browser.close();

  console.log(`\nİşlenen: ${islenen}`);
  console.log(`Sorunlu sayfa: ${bulgular.length}\n`);
  if (bulgular.length) {
    console.log('=== BULGULAR ===');
    for (const b of bulgular) {
      console.log(`\n${b.dosya}  (HTTP ${b.durum})`);
      b.konsol.forEach(k => console.log('   konsol: ' + k));
      b.altIstek.forEach(a => console.log('   alt istek: ' + a));
    }
  } else {
    console.log('=== TEMİZ: konsol hatası 0 · alt istek 4xx/5xx 0 · tüm sayfalar 200 ===');
  }
  fs.writeFileSync(path.join(__dirname, 'canli-sonuc.json'), JSON.stringify({ islenen, bulgular }, null, 2));
  process.exit(bulgular.length ? 1 : 0);
})();
