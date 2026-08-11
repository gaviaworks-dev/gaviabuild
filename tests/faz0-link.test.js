/* FAZ 0 — otomatik link ve manifest bütünlüğü testi (çıkış koşulu F0-6) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const oku = (p) => JSON.parse(readFileSync(resolve(KOK, p), 'utf8'));

test('manifest yeniden üretilebilir ve 244 sayfa ailesi içerir', () => {
  const oncesi = readFileSync(resolve(KOK, 'manifest/screen-manifest.json'), 'utf8');
  execFileSync(process.execPath, ['tools/manifest-uret.mjs'], { cwd: KOK });
  const sonrasi = readFileSync(resolve(KOK, 'manifest/screen-manifest.json'), 'utf8');
  assert.equal(oncesi, sonrasi, 'manifest elle düzenlenmiş olabilir — üretim çıktısıyla aynı değil');
  assert.equal(oku('manifest/screen-manifest.json').ekranlar.length, 244);
});

test('her ekran kodu benzersiz ve rota "/" ile başlıyor', () => {
  const { ekranlar } = oku('manifest/screen-manifest.json');
  const kodlar = new Set();
  for (const e of ekranlar) {
    assert.ok(!kodlar.has(e.kod), `mükerrer kod ${e.kod}`);
    kodlar.add(e.kod);
    assert.match(e.rota, /^\//, `${e.kod} rotası "/" ile başlamıyor`);
    assert.ok(e.yetki && e.analitik, `${e.kod} yetki/analitik anahtarı eksik`);
  }
});

test('aynı rotayı paylaşan iki ekran ayrı uygulama üretmez (takma ad zorunlu)', () => {
  const { ekranlar } = oku('manifest/screen-manifest.json');
  const rotaSahibi = new Map();
  for (const e of ekranlar) {
    if (e.takmaAdi) continue;
    assert.ok(!rotaSahibi.has(e.rota), `${e.rota} rotası ${rotaSahibi.get(e.rota)} ve ${e.kod} tarafından paylaşılıyor`);
    rotaSahibi.set(e.rota, e.kod);
  }
});

test('her eski ekran için koru/birleştir/yönlendir/kaldır kararı var', () => {
  const env = oku('raporlar/faz-0-envanter.json');
  const esl = oku('manifest/eski-eslesme.json');
  const kararliYollar = new Set(esl.eslesme.map((s) => s.eskiYol));
  for (const e of env.envanter) {
    assert.ok(kararliYollar.has(e.dosya), `${e.dosya} için Faz 0 kararı yok`);
  }
  assert.equal(env.envanter.length, esl.eslesme.length);
  for (const s of esl.eslesme) {
    assert.ok(['koru', 'birlestir', 'yonlendir', 'kaldir'].includes(s.karar), `${s.eskiAd}: geçersiz karar ${s.karar}`);
    if (s.karar !== 'kaldir') assert.ok(s.hedefKodlar.length > 0, `${s.eskiAd}: hedef kod yok`);
    if (s.karar === 'kaldir') assert.ok(s.gerekce, `${s.eskiAd}: kaldırma gerekçesi yok`);
  }
});

test('eski uygulamada kırık iç bağlantı yok', () => {
  const env = oku('raporlar/faz-0-envanter.json');
  assert.equal(env.baglanti.kirik, 0, `kırık bağlantı: ${JSON.stringify(env.baglanti.kirikHedefler)}`);
});

test('rotasız birincil eylemler (ölü aksiyon) kayıt altında', () => {
  const env = oku('raporlar/faz-0-envanter.json');
  assert.ok(Array.isArray(env.oluAksiyonlar));
  /* /projeler/yeni 404'ü dokümanda bildirilen bulgudur; envanterde kanıtı olmalı. */
  const yeniProje = env.oluAksiyonlar.find((o) => /Yeni Proje/i.test(o.etiket));
  assert.ok(yeniProje, 'dokümandaki "yeni proje formu 404" bulgusu envanterde doğrulanamadı');
});

test('her eşleme hedefi manifestte mevcut bir koda işaret ediyor', () => {
  const kodlar = new Set(oku('manifest/screen-manifest.json').ekranlar.map((e) => e.kod));
  for (const s of oku('manifest/eski-eslesme.json').eslesme) {
    for (const h of s.hedefKodlar) assert.ok(kodlar.has(h), `${s.eskiAd} → bilinmeyen hedef ${h}`);
  }
});

test('PROGRESS.md manifestteki her kodu içeriyor', () => {
  const md = readFileSync(resolve(KOK, 'PROGRESS.md'), 'utf8');
  for (const e of oku('manifest/screen-manifest.json').ekranlar) {
    assert.ok(md.includes(`| ${e.kod} |`), `PROGRESS.md içinde ${e.kod} yok`);
  }
});

test('tüm P0 rotaları manifestte tanımlı ve tekil', () => {
  const p0 = oku('manifest/screen-manifest.json').ekranlar.filter((e) => e.oncelik === 'P0');
  assert.ok(p0.length >= 150, `P0 sayısı beklenenden az: ${p0.length}`);
  for (const e of p0) assert.ok(e.rota.length > 1, `${e.kod} rotası boş`);
});

test('docs/REVIZYON.md bağlayıcı şartname olarak repoda duruyor', () => {
  assert.ok(existsSync(resolve(KOK, 'docs/REVIZYON.md')));
  const satir = readFileSync(resolve(KOK, 'docs/REVIZYON.md'), 'utf8').split('\n').length;
  assert.equal(satir, 630, 'şartname 629 satır + kapanış satırı olmalı — doküman değişmiş olabilir');
});
