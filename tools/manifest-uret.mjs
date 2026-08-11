#!/usr/bin/env node
/* ============================================================================
   screen-manifest üreteci  —  TEK KAYNAK: docs/REVIZYON.md §4
   ----------------------------------------------------------------------------
   Manifest ELLE YAZILMAZ (KARARLAR.md K-006). Bu betik dokümanın 4. bölümündeki
   19 katalog tablosunu ayrıştırıp `manifest/screen-manifest.json` üretir.
   Menü, rota, breadcrumb, yetki, özellik bayrağı, analitik olayı ve testler
   yalnız bu dosyadan türer.
   ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KAYNAK = resolve(KOK, 'docs/REVIZYON.md');
const HEDEF = resolve(KOK, 'manifest/screen-manifest.json');

/* Katalog başlığı → rail bölümü. Rail sırası bu nesnenin sırasıdır. */
const BOLUMLER = {
  'Giriş, hesap ve sistem durumları':          { anahtar: 'kimlik',    ad: 'Kimlik ve sistem',   ikon: 'fa-right-to-bracket', railde: false },
  'Ortak çalışma alanı':                       { anahtar: 'calisma',   ad: 'Çalışma alanı',      ikon: 'fa-gauge-high',       railde: true  },
  'Proje portföyü':                            { anahtar: 'proje',     ad: 'Projeler',           ikon: 'fa-diagram-project',  railde: true  },
  'Şantiye ve saha operasyonu':                { anahtar: 'santiye',   ad: 'Şantiye ve saha',    ikon: 'fa-helmet-safety',    railde: true  },
  'İş programı, WBS ve ilerleme':              { anahtar: 'plan',      ad: 'İş programı',        ikon: 'fa-timeline',         railde: true  },
  'Görev, iş emri ve toplantı':                { anahtar: 'gorev',     ad: 'Görev ve iş emri',   ikon: 'fa-list-check',       railde: true  },
  'İSG ve çevre':                              { anahtar: 'isg',       ad: 'İSG ve çevre',       ikon: 'fa-shield-heart',     railde: true  },
  'Kalite, RFI ve teknik onay':                { anahtar: 'kalite',    ad: 'Kalite ve teknik',   ikon: 'fa-clipboard-check',  railde: true  },
  'Doküman ve çizim kontrolü':                 { anahtar: 'dokuman',   ad: 'Doküman ve çizim',   ikon: 'fa-folder-open',      railde: true  },
  'Personel ve İK':                            { anahtar: 'personel',  ad: 'Personel ve İK',     ikon: 'fa-users',            railde: true  },
  'Satın alma ve tedarik':                     { anahtar: 'satinalma', ad: 'Satın alma',         ikon: 'fa-cart-shopping',    railde: true  },
  'Depo, stok ve teslim':                      { anahtar: 'stok',      ad: 'Depo ve stok',       ikon: 'fa-boxes-stacked',    railde: true  },
  'Sözleşme, metraj, hakediş ve değişiklik':   { anahtar: 'sozlesme',  ad: 'Sözleşme ve hakediş',ikon: 'fa-file-signature',   railde: true  },
  'Finans, bütçe ve muhasebe hazırlığı':       { anahtar: 'finans',    ad: 'Finans',             ikon: 'fa-wallet',           railde: true  },
  'Kartlar':                                   { anahtar: 'kartlar',   ad: 'Kartlar',            ikon: 'fa-credit-card',      railde: true  },
  'Varlık, ekipman ve filo':                   { anahtar: 'varlik',    ad: 'Varlık ve filo',     ikon: 'fa-truck-ramp-box',   railde: true  },
  'Müşteri, satış ve dış portallar':           { anahtar: 'dis',       ad: 'Portallar',          ikon: 'fa-globe',            railde: true  },
  'Raporlama ve çıktılar':                     { anahtar: 'rapor',     ad: 'Raporlar',           ikon: 'fa-chart-column',     railde: true  },
  'Ayarlar, yetki, iş akışı ve entegrasyon':   { anahtar: 'ayarlar',   ad: 'Ayarlar',            ikon: 'fa-sliders',          railde: true  },
};

/* Tip → sayfa kalıbı (§3 ortak sayfa sözleşmeleri). */
function kalipCoz(tip) {
  const t = tip.toLowerCase();
  if (t.includes('rapor') || t.includes('referans')) return 'rapor';
  if (t.includes('mutabakat') || t.includes('karşılaştırma') || t.includes('kontrol')) return 'mutabakat';
  if (t.includes('sihirbaz')) return 'sihirbaz';
  if (t.includes('matris') || t.includes('ağaç')) return 'matris';
  if (t.includes('panel')) return 'panel';
  if (t.includes('portal')) return 'portal';
  if (t.includes('kiosk') || t.includes('mobil')) return 'mobil';
  if (t.includes('takvim')) return 'takvim';
  if (t.includes('durum')) return 'durum';
  if (t.includes('onay')) return 'onay';
  if (t.includes('detay')) return 'detay';
  if (t.includes('form')) return 'form';
  if (t.includes('liste')) return 'liste';
  if (t.includes('kimlik')) return 'kimlik';
  if (t.includes('ayar') || t.includes('izleme')) return 'ayar';
  return 'liste';
}

/* Yol → rota deseni + parametre listesi. */
function rotaCoz(yol) {
  const parametreler = [...yol.matchAll(/:([a-zA-Z]+)/g)].map((m) => m[1]);
  return { rota: yol, parametreler, dinamik: parametreler.length > 0 };
}

/* Kimlik doğrulaması gerektirmeyen (herkese açık) rotalar. */
const ACIK_ROTALAR = new Set([
  '/giris', '/sifre-unuttum', '/sifre-sifirla/:token', '/davet/:token',
  '/mfa', '/oturum-sonlandi', '/bakim', '/404', '/403',
  '/tedarikci/teklif/:token',
]);

function ayristir(metin) {
  const satirlar = metin.split('\n');
  const ekranlar = [];
  let aktifBolum = null;
  let sirayaGir = false; // §4 içinde miyiz

  for (const satir of satirlar) {
    if (/^## 4\. Hedef menü ve tam sayfa kataloğu/.test(satir)) { sirayaGir = true; continue; }
    if (sirayaGir && /^## 5\./.test(satir)) break;
    if (!sirayaGir) continue;

    const baslik = satir.match(/^### (.+)$/);
    if (baslik) {
      const ad = baslik[1].trim();
      if (!BOLUMLER[ad]) throw new Error(`Bilinmeyen katalog bölümü: "${ad}" — BOLUMLER haritasını güncelle.`);
      aktifBolum = { ad, ...BOLUMLER[ad] };
      continue;
    }

    const hucre = satir.match(/^\|\s*([A-Z]+-\d+)\s*\|(.+)\|\s*$/);
    if (!hucre || !aktifBolum) continue;

    const kod = hucre[1];
    const alanlar = hucre[2].split('|').map((s) => s.trim());
    if (alanlar.length < 6) throw new Error(`${kod}: beklenen 6 sütun, gelen ${alanlar.length}`);
    const [ad, tip, karar, oncelik, yolHam, amac] = alanlar;
    const yol = yolHam.replace(/`/g, '').trim();
    const { rota, parametreler, dinamik } = rotaCoz(yol);

    ekranlar.push({
      kod,
      ad,
      bolum: aktifBolum.anahtar,
      bolumAd: aktifBolum.ad,
      tip,
      kalip: kalipCoz(tip),
      karar: karar.split(' - ')[0].trim(),     // "Yeni - 404 düzelt" → "Yeni"
      kararNotu: karar.includes(' - ') ? karar.split(' - ').slice(1).join(' - ').trim() : null,
      oncelik,
      rota,
      parametreler,
      dinamik,
      acik: ACIK_ROTALAR.has(rota),
      amac,
      yetki: `${kod}:goruntule`,
      analitik: `ekran.goruntulendi:${kod}`,
      bayrak: null,
    });
  }
  return ekranlar;
}

const metin = readFileSync(KAYNAK, 'utf8');
const ekranlar = ayristir(metin);

/* Doğrulamalar — manifest kendi kendini denetler. */
const hatalar = [];
const beklenenToplam = Number(metin.match(/\*\*Hedef katalog toplamı:\*\*\s*(\d+)\s*sayfa ailesi/)[1]);
if (ekranlar.length !== beklenenToplam) {
  hatalar.push(`Ekran sayısı ${ekranlar.length}, dokümandaki hedef ${beklenenToplam}`);
}
const kodSeti = new Set();
for (const e of ekranlar) {
  if (kodSeti.has(e.kod)) hatalar.push(`Mükerrer kod: ${e.kod}`);
  kodSeti.add(e.kod);
  if (!e.rota.startsWith('/')) hatalar.push(`${e.kod}: rota "/" ile başlamıyor (${e.rota})`);
}
/* Aynı rotayı iki ekran paylaşamaz (RPT-13 ve CRD-17 dokümanda aynı yolu gösteriyor: raporda ayrı ele alınır). */
const rotaSayaci = new Map();
for (const e of ekranlar) rotaSayaci.set(e.rota, [...(rotaSayaci.get(e.rota) || []), e.kod]);
const cakisan = [...rotaSayaci].filter(([, k]) => k.length > 1);

/* Rota çakışması = kopya sayfa riski (kural 4). Kanonik sahip: rapor kataloğundaki kod;
   diğerleri menü takma adı olur, AYRI uygulama üretmez. */
for (const [rota, kodlar] of cakisan) {
  const sahipKod = kodlar.find((k) => ekranlar.find((e) => e.kod === k).bolum === 'rapor') || kodlar[0];
  for (const k of kodlar) {
    if (k === sahipKod) continue;
    const e = ekranlar.find((x) => x.kod === k);
    e.takmaAdi = sahipKod;                 // aynı kanonik ekranı gösterir
    e.yetki = `${sahipKod}:goruntule`;     // yetki de kanonik ekrandan gelir
  }
}

if (hatalar.length) { console.error('MANIFEST HATASI:\n' + hatalar.join('\n')); process.exit(1); }

const manifest = {
  $aciklama: 'ÜRETİLMİŞ DOSYA — elle düzenlemeyin. Kaynak: docs/REVIZYON.md §4. Üretici: tools/manifest-uret.mjs',
  urun: { ad: '[ÜRÜN ADI]', calismaAdi: 'GaviaBuild', kategori: 'Bütünleşik İnşaat ve Şantiye Operasyonları Yönetim Platformu' },
  kaynak: 'docs/REVIZYON.md',
  toplamAile: ekranlar.length,
  bolumler: Object.entries(BOLUMLER).map(([ad, b]) => ({ ...b, kataloqAd: ad })),
  cakisanRotalar: cakisan.map(([rota, kodlar]) => ({ rota, kodlar })),
  ekranlar,
};

mkdirSync(dirname(HEDEF), { recursive: true });
writeFileSync(HEDEF, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

const dagilim = {};
for (const e of ekranlar) dagilim[e.bolum] = (dagilim[e.bolum] || 0) + 1;
const oncelikDagilim = {};
for (const e of ekranlar) oncelikDagilim[e.oncelik] = (oncelikDagilim[e.oncelik] || 0) + 1;

console.log(`screen-manifest üretildi: ${ekranlar.length} sayfa ailesi, ${Object.keys(dagilim).length} bölüm`);
console.log('Öncelik dağılımı:', oncelikDagilim);
if (cakisan.length) console.log('Rota çakışması (raporda ele alınacak):', cakisan.map(([r, k]) => `${r} → ${k.join(', ')}`).join(' | '));
