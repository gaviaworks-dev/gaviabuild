#!/usr/bin/env node
/* =====================================================================
   G-9 YATAY TAŞMA TARAMASI — sekme panelleri DAHİL
   =====================================================================
   Yerel QA aracı. Repo buildless kalır: bu betik üretime girmez, yalnız
   doğrulama içindir. Playwright gerektirir (node_modules gitignored):
       npm install playwright && npx playwright install chromium
   Çalıştırma (repo kökünden):
       python3 -m http.server 8899 --directory v2 &
       node tools/g9-tarama.cjs
       node tools/g9-tarama.cjs --sayfa crm-santiye-detay.html   (tek sayfa)
       node tools/g9-tarama.cjs --genislik 390                    (tek genişlik)

   NEDEN YENİDEN YAZILDI (Dalga 2)
   Önceki dalgada tarama 240/240 "geçti" ama KÖR NOKTASI vardı: sekme panelleri
   `hidden` attribute ile gizlenir; gizli elemanın clientWidth/scrollWidth değeri
   0'dır, dolayısıyla taşma hesabı (scrollWidth - clientWidth) her zaman 0 çıkar.
   Yani sekme içindeki içerik HİÇ ÖLÇÜLMEMİŞTİ. Şantiye detayının İş Programı
   sekmesindeki 57px'lik belge taşması bu yüzden gözden kaçtı.
   Bu sürüm her sekmeyi TEK TEK AÇAR ve açıkken ölçer; Dalga 2'de eklenen iki
   kademeli gruplanmış sekmeleri (.gv-tabgroup → .gv-tab) de gezer.

   TEST TUZAKLARI (önceki turların dersleri — bunlara UYULUR)
   1) `mobile:true` KULLANILMAZ. O modda tarayıcı layout viewport'unu (ICB)
      içeriğe göre şişirir; innerWidth 390'dan 400+'a çıkar ve
      `docScrollWidth > innerWidth` ölçütü İKİ TARAF BİRLİKTE ŞİŞTİĞİ için
      kendi kendini iptal eder. Masaüstü modunda ölçülür.
   2) widthAssert: ölçülen innerWidth, istenen genişliğe EŞİT olmalı. Değilse
      o ölçüm güvenilmez sayılır ve raporlanır.
   3) Eşzamanlılık düşük tutulur — `python3 -m http.server` tek iş parçacıklıdır,
      5+ paralel bağlamda navigasyon timeout'u DÜZEN KUSURU sanılır.
   4) Her sayfa `?role=` ile açılır; rol budaması görünürlüğü değiştirir.
   5) Ölçüm iki kanaldan yapılır: (a) BELGE taşması — asıl kusur budur,
      (b) taşan ELEMAN tespiti — kök sebebi göstermek için. Bir eleman kendi
      içinde kaydırılabiliyorsa (overflow-x auto/scroll/hidden) kusur DEĞİLDİR;
      ev standardı odur (geniş tablo .gc-body.flush içinde kayar).
   ===================================================================== */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.G9_BASE || 'http://localhost:8899';
const V2DIR = path.join(__dirname, '..', 'v2');
const GENISLIKLER = [390, 768, 1024, 1440];
const ROL = 'superadmin';          // en geniş görünüm; budanmış rol daha az içerik gösterir
const ESZAMAN = 3;                 // http.server tek iş parçacıklı — tuzak 3
const TOLERANS = 2;               // px; alt-piksel yuvarlama gürültüsü

const arg = (ad) => { const i = process.argv.indexOf('--' + ad); return i > -1 ? process.argv[i + 1] : null; };

/* Sayfadaki sekme yapısını çıkarır ve her sekmeyi tek tek açıp ölçer.
   Döndürülen her kayıt bir (sayfa, genişlik, sekme) üçlüsüdür. */
async function sayfayiOlc(page, dosya, genislik) {
  const url = `${BASE}/${dosya}?role=${ROL}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch (e) {
    return [{ dosya, genislik, sekme: '-', hata: 'NAV: ' + e.message.split('\n')[0].slice(0, 60) }];
  }
  // ui.js scroll ipuçları + sayfa-lokal render için 400ms'lik gecikmeli tarama var
  await page.waitForTimeout(500);

  return await page.evaluate(({ tol, genislik }) => {
    const sonuc = [];
    const de = document.documentElement;

    const olc = (etiket) => {
      const docTasma = de.scrollWidth - de.clientWidth;
      const widthOk = window.innerWidth === genislik;     // tuzak 2
      let suclu = null;
      if (docTasma > tol) {
        // Kök sebep: görünür, kendi kendine kaydıramayan, kabını aşan ilk eleman
        let enKotu = 0;
        document.querySelectorAll('body *').forEach((el) => {
          if (!el.getClientRects().length) return;         // gizli/çizilmeyen atlanır
          const cs = getComputedStyle(el);
          if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'hidden') return; // ev standardı
          const tasma = el.scrollWidth - el.clientWidth;
          const r = el.getBoundingClientRect();
          const disari = Math.round(r.right - de.clientWidth);
          const skor = Math.max(tasma, disari);
          if (skor > enKotu && skor > tol) {
            enKotu = skor;
            suclu = {
              tag: el.tagName.toLowerCase(),
              cls: (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).slice(0, 3).join('.'),
              id: el.id || '',
              tasma, disari
            };
          }
        });
      }
      sonuc.push({ sekme: etiket, docTasma, widthOk, suclu });
    };

    // --- sekme yapısını çıkar ---
    const gruplar = [...document.querySelectorAll('.gv-tabgroup[data-tabgroup]')]
      .filter((b) => b.offsetParent !== null || !b.hidden);
    const sekmeler = () => [...document.querySelectorAll('.gv-tab[data-tab]')]
      .filter((b) => b.offsetParent !== null || !b.hidden);

    if (!gruplar.length && !sekmeler().length) {
      olc('(sekme yok)');
      return sonuc;
    }

    if (gruplar.length) {
      // İKİ KADEMELİ (Dalga 2): her grubu aç, sonra o grubun her sekmesini aç
      for (const g of gruplar) {
        g.click();
        const gAd = (g.textContent || '').trim().slice(0, 24);
        const alt = sekmeler();
        if (!alt.length) { olc('grup:' + gAd); continue; }
        for (const s of alt) {
          s.click();
          olc('grup:' + gAd + ' > ' + (s.getAttribute('data-tab') || ''));
        }
      }
    } else {
      // TEK KADEMELİ (taban): doğrudan sekmeler
      for (const s of sekmeler()) {
        s.click();
        olc(s.getAttribute('data-tab') || (s.textContent || '').trim().slice(0, 20));
      }
    }
    return sonuc;
  }, { tol: TOLERANS, genislik });
}

(async () => {
  const tekSayfa = arg('sayfa');
  const tekGenislik = arg('genislik');
  const genislikler = tekGenislik ? [Number(tekGenislik)] : GENISLIKLER;
  const dosyalar = tekSayfa
    ? [tekSayfa]
    : fs.readdirSync(V2DIR).filter((f) => f.endsWith('.html')).sort();

  console.log(`G-9 taraması · ${dosyalar.length} sayfa × ${genislikler.length} genişlik · rol=${ROL}`);
  console.log('Sekme panelleri TEK TEK AÇILARAK ölçülüyor (gizli panel kör noktası kapatıldı).\n');

  const browser = await chromium.launch();
  const bulgular = [];
  const hatalar = [];
  let olcumSayisi = 0, sayfaSayaci = 0;

  for (const genislik of genislikler) {
    // mobile:true KULLANILMIYOR — tuzak 1
    const ctx = await browser.newContext({ viewport: { width: genislik, height: 900 } });
    const havuz = Array.from({ length: ESZAMAN }, () => ctx.newPage());
    const sayfalar = await Promise.all(havuz);
    let idx = 0;

    await Promise.all(sayfalar.map(async (page) => {
      page.on('pageerror', (e) => hatalar.push({ tip: 'js', mesaj: e.message.slice(0, 80) }));
      while (idx < dosyalar.length) {
        const dosya = dosyalar[idx++];
        const kayitlar = await sayfayiOlc(page, dosya, genislik);
        for (const k of kayitlar) {
          olcumSayisi++;
          if (k.hata) { hatalar.push({ dosya, genislik, mesaj: k.hata }); continue; }
          if (!k.widthOk) hatalar.push({ dosya, genislik, mesaj: 'widthAssert basarisiz' });
          if (k.docTasma > TOLERANS) bulgular.push({ dosya, genislik, ...k });
        }
        if (++sayfaSayaci % 60 === 0) process.stdout.write(`  … ${sayfaSayaci} sayfa-genişlik işlendi\n`);
      }
    }));
    await ctx.close();
  }
  await browser.close();

  console.log(`\nToplam ölçüm (sayfa × genişlik × sekme): ${olcumSayisi}`);
  console.log(`Belge taşması bulgusu: ${bulgular.length}`);
  console.log(`Hata/uyarı: ${hatalar.length}\n`);

  if (bulgular.length) {
    const gruplu = {};
    for (const b of bulgular) (gruplu[b.dosya] ||= []).push(b);
    console.log('=== TAŞMALAR ===');
    for (const [dosya, liste] of Object.entries(gruplu)) {
      console.log(`\n${dosya}`);
      for (const b of liste) {
        const s = b.suclu;
        console.log(`  ${b.genislik}px · ${b.sekme} · belge +${b.docTasma}px` +
          (s ? `  →  ${s.tag}${s.id ? '#' + s.id : ''}${s.cls ? '.' + s.cls : ''} (ic:${s.tasma} disari:${s.disari})` : ''));
      }
    }
  } else {
    console.log('=== TAŞMA YOK ===');
  }

  if (hatalar.length) {
    console.log('\n=== HATA / UYARI ===');
    const ozet = {};
    for (const h of hatalar) { const k = (h.dosya || '') + ' ' + h.mesaj; ozet[k] = (ozet[k] || 0) + 1; }
    Object.entries(ozet).slice(0, 25).forEach(([k, n]) => console.log(`  ${n}× ${k}`));
  }

  fs.writeFileSync(path.join(__dirname, 'g9-sonuc.json'),
    JSON.stringify({ olcumSayisi, bulgular, hatalar }, null, 2));
  console.log('\nAyrıntı: tools/g9-sonuc.json');
  process.exit(bulgular.length ? 1 : 0);
})();
