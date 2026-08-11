#!/usr/bin/env node
/* ============================================================================
   FAZ 0 — envanter, kırık rota taraması ve eski→hedef eşleme
   ----------------------------------------------------------------------------
   Çıktılar:
     raporlar/faz-0-envanter.json   — dosya bazlı envanter + bağlantı grafiği
     manifest/eski-eslesme.json     — her eski yol için koru/birleştir/yönlendir/kaldır
   ========================================================================== */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLESME } from './faz0-eslesme-tablosu.mjs';

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(KOK, 'manifest/screen-manifest.json'), 'utf8'));
const kodlar = new Set(manifest.ekranlar.map((e) => e.kod));

/* --- 1. Dosyaları topla --------------------------------------------------- */
function htmlTopla(dizin, gorece = '') {
  const cikti = [];
  for (const ad of readdirSync(resolve(KOK, dizin), { withFileTypes: true })) {
    const yol = gorece ? `${gorece}/${ad.name}` : ad.name;
    if (ad.isDirectory()) {
      if (['.git', 'node_modules', 'raporlar', 'docs', '.claude', 'app', 'manifest', 'tests', 'tools'].includes(ad.name)) continue;
      cikti.push(...htmlTopla(join(dizin, ad.name), yol));
    } else if (ad.name.endsWith('.html')) {
      cikti.push(gorece ? `${gorece}/${ad.name}` : ad.name);
    }
  }
  return cikti;
}
const dosyalar = htmlTopla('.').sort();

/* --- 2. Her dosyanın künyesi ve bağlantıları ------------------------------ */
const KURAL_IHLAL_DESENLERI = [
  ['localStorage-is-kurali', /localStorage\.(setItem|getItem)/g],
  ['sahte-basari',           /toast\s*\(\s*['"`](Kaydedildi|Başarıyla|Oluşturuldu|Gönderildi|Onaylandı)/gi],
  ['rol-query-param',        /(searchParams\.get\(\s*['"]role['"]|[?&]role=)/g],
  ['sayfa-ici-demo-dizi',    /const\s+(DEMO|MOCK|ORNEK|VERI|DATA)\w*\s*=\s*\[/g],
  ['wip-baglanti',           /(WIP|yapım aşamasında|çok yakında)/gi],
  ['olu-aksiyon',            /data-demo=/g],          // href="#" + demo bildirimi = rotasız aksiyon
  ['bos-href',               /href=["']#["']/g],
];

const envanter = [];
const tumBaglantilar = [];
for (const d of dosyalar) {
  const metin = readFileSync(resolve(KOK, d), 'utf8');
  const title = (metin.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1].trim();
  const sec = (metin.match(/data-sec=["']([^"']+)["']/) || [, null])[1];
  const screen = (metin.match(/data-screen=["']([^"']+)["']/) || [, null])[1];

  const ihlaller = [];
  for (const [ad, desen] of KURAL_IHLAL_DESENLERI) {
    const n = (metin.match(desen) || []).length;
    if (n) ihlaller.push({ tur: ad, adet: n });
  }

  const baglantilar = [...metin.matchAll(/(?:href|src)=["']([^"'#]+)["']/g)]
    .map((m) => m[1])
    .filter((h) => !/^(https?:|mailto:|tel:|data:|javascript:|\/\/)/.test(h));

  for (const b of baglantilar) {
    const temiz = b.split('?')[0];
    if (!temiz) continue;
    const hedef = temiz.startsWith('/') ? resolve(KOK, '.' + temiz) : resolve(KOK, dirname(d), temiz);
    const varMi = existsSync(hedef) || existsSync(hedef + 'index.html') || existsSync(join(hedef, 'index.html'));
    tumBaglantilar.push({ kaynak: d, hedef: temiz, kirik: !varMi });
  }

  envanter.push({
    dosya: d,
    ad: basename(d, '.html'),
    title,
    dataSec: sec,
    dataScreen: screen,
    bayt: metin.length,
    ihlaller,
    baglantiSayisi: baglantilar.length,
  });
}

/* Ölü aksiyonlar: rotası olmayan birincil eylemler (§12 "yalnızca toast üreten işlem").
   Bilinen örnek: crm-santiye-proje.html "Yeni Proje" → href="#" (PRJ-02 / /projeler/yeni 404). */
const oluAksiyonlar = [];
for (const d of dosyalar) {
  const metin = readFileSync(resolve(KOK, d), 'utf8');
  for (const m of metin.matchAll(/<a\b[^>]*href=["']#["'][^>]*data-demo=["']([^"']*)["'][^>]*>([\s\S]{0,120}?)<\/a>/g)) {
    oluAksiyonlar.push({ dosya: d, aciklama: m[1], etiket: m[2].replace(/<[^>]+>/g, '').trim() });
  }
}

const kirikBaglantilar = tumBaglantilar.filter((b) => b.kirik);
/* Kırık hedefleri tekilleştir */
const kirikOzet = {};
for (const b of kirikBaglantilar) (kirikOzet[b.hedef] ||= []).push(b.kaynak);

/* --- 3. Eşleme --------------------------------------------------------- */
const eslesme = [];
const eslesmemis = [];
for (const e of envanter) {
  const kayit = ESLESME[e.ad];
  if (!kayit) { eslesmemis.push(e.dosya); continue; }
  const [karar, hedefler, gerekce] = kayit;
  for (const h of hedefler) if (!kodlar.has(h)) throw new Error(`${e.ad}: bilinmeyen hedef kod ${h}`);
  eslesme.push({ eskiYol: e.dosya, eskiAd: e.ad, karar, hedefKodlar: hedefler, gerekce });
}
if (eslesmemis.length) {
  console.error('EŞLEMESİZ DOSYA (Faz 0 kapanamaz):\n' + eslesmemis.join('\n'));
  process.exit(1);
}

/* --- 4. Hedef tarafı: hangi aile eski ekrandan besleniyor, hangisi sıfırdan? */
const hedefKapsam = new Map(manifest.ekranlar.map((e) => [e.kod, []]));
for (const s of eslesme) for (const h of s.hedefKodlar) hedefKapsam.get(h).push(s.eskiAd);
const sifirdan = manifest.ekranlar.filter((e) => hedefKapsam.get(e.kod).length === 0);

/* --- 5. Sayaç çelişkisinin çözümü --------------------------------------- */
const sayaclar = {
  koktekiHtml: dosyalar.filter((d) => !d.includes('/')).length,
  v2Html: dosyalar.filter((d) => d.startsWith('v2/')).length,
  toplamHtml: dosyalar.length,
  aciklama: 'Tek doğru sayaç budur; dizin sayfası ve menü sayaçları artık kullanılmaz (screen-manifest tek kaynak).',
};

const kararDagilim = {};
for (const s of eslesme) kararDagilim[s.karar] = (kararDagilim[s.karar] || 0) + 1;

mkdirSync(resolve(KOK, 'raporlar'), { recursive: true });
writeFileSync(resolve(KOK, 'raporlar/faz-0-envanter.json'), JSON.stringify({
  uretim: 'tools/faz0-envanter.mjs', sayaclar, envanter,
  baglanti: { toplam: tumBaglantilar.length, kirik: kirikBaglantilar.length, kirikHedefler: kirikOzet },
  oluAksiyonlar,
}, null, 2) + '\n');

writeFileSync(resolve(KOK, 'manifest/eski-eslesme.json'), JSON.stringify({
  $aciklama: 'ÜRETİLMİŞ DOSYA — kaynak: tools/faz0-eslesme-tablosu.mjs. Her eski yol için Faz 0 kararı.',
  kararDagilim,
  eslesme,
  sifirdanYazilacak: sifirdan.map((e) => ({ kod: e.kod, ad: e.ad, oncelik: e.oncelik, rota: e.rota })),
}, null, 2) + '\n');

console.log(`Envanter: ${sayaclar.toplamHtml} HTML (kök ${sayaclar.koktekiHtml}, v2 ${sayaclar.v2Html})`);
console.log('Karar dağılımı:', kararDagilim);
console.log(`Bağlantı: ${tumBaglantilar.length} iç bağlantı, ${kirikBaglantilar.length} kırık (${Object.keys(kirikOzet).length} benzersiz hedef)`);
console.log(`Hedef katalog: ${manifest.ekranlar.length} aile — ${manifest.ekranlar.length - sifirdan.length} tanesi eski ekrandan besleniyor, ${sifirdan.length} tanesi sıfırdan yazılacak`);
const ihlalToplam = {};
for (const e of envanter) for (const i of e.ihlaller) ihlalToplam[i.tur] = (ihlalToplam[i.tur] || 0) + i.adet;
console.log('Kural ihlali sayacı:', ihlalToplam);
console.log(`Ölü aksiyon (rotasız birincil eylem): ${oluAksiyonlar.length}`);
for (const o of oluAksiyonlar.slice(0, 8)) console.log(`  · ${o.dosya} → "${o.etiket}" (${o.aciklama})`);
