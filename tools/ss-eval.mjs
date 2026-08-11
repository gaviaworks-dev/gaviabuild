#!/usr/bin/env node
/* ============================================================================
   SCREENSHOT-EVAL — CLAUDE.md kalite kapısı
   Desktop 1440px + mobil 390px; anahtar state'ler ve farklı roller.
   Çıktı docs/screenshots/ (gitignore) — değerlendirme terminalde yapılır.
   ========================================================================== */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { uygulamaKur } from '../app/sunucu.mjs';
import { mkdirSync } from 'node:fs';

const HEDEFLER = [
  { ad: 'giris',            yol: '/giris',                     rol: null },
  { ad: 'panel-sahip',      yol: '/panel',                     rol: 'sahip@yapitas.demo' },
  { ad: 'panel-calisan',    yol: '/panel',                     rol: 'calisan@yapitas.demo' },
  { ad: 'notlar-bos',       yol: '/notlarim',                  rol: 'sahip@yapitas.demo' },
  { ad: 'not-formu',        yol: '/notlarim/yeni',             rol: 'sahip@yapitas.demo' },
  { ad: 'kullanicilar',     yol: '/ayarlar/kullanicilar',      rol: 'sahip@yapitas.demo' },
  { ad: 'rol-matrisi',      yol: '/ayarlar/roller',            rol: 'sahip@yapitas.demo' },
  { ad: 'denetim-izi',      yol: '/ayarlar/denetim-izi',       rol: 'sahip@yapitas.demo' },
  { ad: 'profil',           yol: '/profilim',                  rol: 'sahip@yapitas.demo' },
  { ad: 'yetkisiz-403',     yol: '/ayarlar/kullanicilar',      rol: 'calisan@yapitas.demo' },
  { ad: 'bulunamadi-404',   yol: '/projeler',                  rol: 'sahip@yapitas.demo' },
];
const OLCULER = [{ ad: 'masaustu', w: 1440, h: 960 }, { ad: 'mobil', w: 390, h: 844 }];

const uygulama = uygulamaKur({ dbYolu: ':memory:' });
const sunucu = createServer((i, y) => uygulama.istegiIsle(i, y));
await new Promise((c) => sunucu.listen(0, '127.0.0.1', c));
const taban = `http://127.0.0.1:${sunucu.address().port}`;
mkdirSync('docs/screenshots', { recursive: true });

const tarayici = await chromium.launch();
const bulgular = [];
for (const o of OLCULER) {
  for (const t of HEDEFLER) {
    const baglam = await tarayici.newContext({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: 1 });
    const sayfa = await baglam.newPage();
    if (t.rol) {
      await sayfa.goto(taban + '/giris');
      await sayfa.fill('#alan-eposta', t.rol);
      await sayfa.fill('#alan-parola', 'Demo.Parola.2026');
      await Promise.all([sayfa.waitForNavigation(), sayfa.click('button[type=submit]')]);
    }
    const yanit = await sayfa.goto(taban + t.yol, { waitUntil: 'networkidle' });
    await sayfa.screenshot({ path: `docs/screenshots/${o.ad}-${t.ad}.png`, fullPage: true });

    /* Otomatik rubrik kontrolleri */
    const olcum = await sayfa.evaluate(() => ({
      yatayTasma: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      genislik: document.documentElement.scrollWidth,
      gorunumGenisligi: document.documentElement.clientWidth,
      h1Sayisi: document.querySelectorAll('h1').length,
      gorselAltEksik: [...document.querySelectorAll('img')].filter((i) => !i.alt).length,
      etiketsizGirdi: [...document.querySelectorAll('input:not([type=hidden]),select,textarea')]
        .filter((e) => !e.labels?.length && !e.getAttribute('aria-label')).length,
      kucukYazi: [...document.querySelectorAll('body *')]
        .filter((e) => e.childElementCount === 0 && e.textContent.trim()
          && parseFloat(getComputedStyle(e).fontSize) < 11).length,
    }));
    bulgular.push({ olcu: o.ad, hedef: t.ad, durum: yanit.status(), ...olcum });
    await baglam.close();
  }
}
await tarayici.close();
sunucu.close();

const sorunlar = bulgular.filter((b) => b.yatayTasma || b.h1Sayisi !== 1 || b.gorselAltEksik || b.etiketsizGirdi || b.kucukYazi);
console.log(`${bulgular.length} ekran görüntüsü alındı → docs/screenshots/`);
console.table(bulgular.map((b) => ({ ölçü: b.olcu, hedef: b.hedef, HTTP: b.durum,
  taşma: b.yatayTasma ? `EVET (${b.genislik}>${b.gorunumGenisligi})` : '—',
  h1: b.h1Sayisi, 'etiketsiz girdi': b.etiketsizGirdi, 'küçük yazı': b.kucukYazi })));
console.log(sorunlar.length ? `\n${sorunlar.length} ekranda rubrik bulgusu var.` : '\nRubrik bulgusu yok.');
