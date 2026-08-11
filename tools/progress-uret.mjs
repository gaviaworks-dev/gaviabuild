#!/usr/bin/env node
/* ============================================================================
   PROGRESS.md üreteci — screen-manifest + faz haritası + manifest/durum.json
   ----------------------------------------------------------------------------
   Durum kaynağı `manifest/durum.json`; iş bittikçe SADECE o dosya güncellenir,
   PROGRESS.md yeniden üretilir. Böylece tablo elle tutulmaz ve manifestten sapmaz.
   ========================================================================== */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(KOK, 'manifest/screen-manifest.json'), 'utf8'));
const eslesme = JSON.parse(readFileSync(resolve(KOK, 'manifest/eski-eslesme.json'), 'utf8'));
const durumYolu = resolve(KOK, 'manifest/durum.json');
const durumlar = existsSync(durumYolu) ? JSON.parse(readFileSync(durumYolu, 'utf8')) : {};

/* Faz haritası — PLAN.md §FAZ SIRASI. Doküman §9 fazları kapsamayan kodlar için
   karar gerekçesi KARARLAR.md K-014'te. Kural: bir kod tek faza aittir. */
const FAZ = (kod) => {
  const [ek, noStr] = kod.split('-');
  const no = Number(noStr);
  switch (ek) {
    case 'AUTH': return 1;
    /* GLB-02/03 panoları besleyen veri Faz 3-4'te oluşur (KARARLAR K-017). */
    case 'GLB':  return no === 1 ? 1 : no <= 3 ? 4 : no <= 6 ? 2 : no === 7 ? 6 : no === 8 ? 3 : no === 9 ? 2 : 1;
    case 'SET':  return no <= 5 ? 1 : no === 16 ? 1 : no === 18 ? 1 : no <= 10 ? 2 : no === 11 ? 2 : no === 12 ? 2 : no <= 15 ? 5 : no === 19 ? 5 : 6;
    case 'PRJ':  return 3;
    case 'SITE': return 3;
    case 'PLAN': return 3;
    case 'TASK': return 3;
    case 'HSE':  return 3;
    case 'QLT':  return 3;
    case 'DOC':  return no <= 3 ? 2 : 3;
    case 'HR':   return no === 6 ? 5 : no === 14 ? 6 : no <= 9 ? 3 : 4;
    case 'PRC':  return 4;
    case 'STK':  return 4;
    case 'CNT':  return 4;
    case 'FIN':  return 4;
    case 'AST':  return no === 11 ? 6 : 4;
    case 'CRD':  return 5;
    case 'RPT':  return 6;
    case 'EXT':  return 6;
    default: throw new Error(`Faz haritasında eksik ön ek: ${ek}`);
  }
};

const kaynakHarita = new Map();
for (const s of eslesme.eslesme) for (const h of s.hedefKodlar) {
  kaynakHarita.set(h, [...(kaynakHarita.get(h) || []), `${s.eskiAd} (${s.karar})`]);
}

const satirlar = manifest.ekranlar.map((e) => {
  const d = durumlar[e.kod] || {};
  const kaynak = kaynakHarita.get(e.kod) || [];
  return {
    kod: e.kod, ad: e.ad, faz: FAZ(e.kod), oncelik: e.oncelik, rota: e.rota, kalip: e.kalip,
    durum: d.durum || 'bekliyor', commit: d.commit || '—',
    not: d.not || (e.takmaAdi ? `takma ad → ${e.takmaAdi}` : kaynak.length ? `kaynak: ${kaynak.join(', ')}` : 'sıfırdan'),
  };
});

const DURUM_ROZET = { bekliyor: '⬜ bekliyor', devam: '🟡 devam', bitti: '🟩 bitti', dogrulandi: '✅ doğrulandı' };
const fazlar = [...new Set(satirlar.map((s) => s.faz))].sort();
let md = `# PROGRESS — ekran bazlı durum tablosu

> **ÜRETİLMİŞ DOSYA.** Elle düzenlemeyin. Durum kaynağı \`manifest/durum.json\`;
> güncelledikten sonra \`node tools/progress-uret.mjs\` çalıştırın.
> Plan: \`PLAN.md\` · Kararlar: \`KARARLAR.md\` · Şartname: \`docs/REVIZYON.md\`

`;

const sayac = {};
for (const s of satirlar) sayac[s.durum] = (sayac[s.durum] || 0) + 1;
md += `**Toplam:** ${satirlar.length} sayfa ailesi — ` +
  Object.entries(DURUM_ROZET).map(([k, v]) => `${v.split(' ')[1]}: ${sayac[k] || 0}`).join(' · ') + '\n\n';

md += `| Faz | Aile | Bekliyor | Devam | Bitti | Doğrulandı |\n| --- | --- | --- | --- | --- | --- |\n`;
for (const f of fazlar) {
  const g = satirlar.filter((s) => s.faz === f);
  const c = (d) => g.filter((s) => s.durum === d).length;
  md += `| Faz ${f} | ${g.length} | ${c('bekliyor')} | ${c('devam')} | ${c('bitti')} | ${c('dogrulandi')} |\n`;
}
md += '\n';

for (const f of fazlar) {
  const g = satirlar.filter((s) => s.faz === f);
  md += `## Faz ${f} — ${g.length} sayfa ailesi\n\n`;
  md += `| Kod | Sayfa | Öncelik | Kalıp | Rota | Durum | Commit | Not |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n`;
  for (const s of g) {
    md += `| ${s.kod} | ${s.ad} | ${s.oncelik} | ${s.kalip} | \`${s.rota}\` | ${DURUM_ROZET[s.durum]} | ${s.commit} | ${s.not} |\n`;
  }
  md += '\n';
}

writeFileSync(resolve(KOK, 'PROGRESS.md'), md);
console.log(`PROGRESS.md üretildi: ${satirlar.length} satır,`, sayac);
