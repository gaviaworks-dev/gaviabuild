/* ============================================================================
   DENETİM-03 / D-17 — `npm run baslat` gerçekten dinleyen bir sunucu bırakmalı
   ----------------------------------------------------------------------------
   `npm run baslat` hiçbir çıktı vermeden 0 ile çıkıyordu: sunucu ayağa
   kalkmıyor, tarayıcı ERR_CONNECTION_REFUSED veriyordu.

   Kök neden: giriş koşulu `import.meta.url === \`file://${process.argv[1]}\``
   idi. `import.meta.url` bir URL'dir ve yol içindeki boşluğu yüzde kodlamasıyla
   kaçırır (`Backend Projects` → `Backend%20Projects`); elle kurulan dize
   kaçırmaz. Depo yolunda boşluk olduğu için koşul HİÇBİR ZAMAN tutmadı — modül
   yüklenip hiçbir şey yapmadan sonlandı.

   Testler bunu kaçırmıştı çünkü `tests/yardimci.mjs` kendi sunucusunu
   `uygulamaKur()` ile kuruyor; PAKETTEKİ BETİK hiç çalıştırılmamıştı.

   Buradaki testler iki şeyi kilitler:
     1. `package.json`'daki başlatma betiği DİNLEYEN bir süreç bırakır ve
        gerçek bir HTTP isteği 200 döner (yavaş, uçtan uca).
     2. Giriş koşulu yüzde kodlanan yollarda da doğru çalışır (hızlı, birim).
   ========================================================================== */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const paket = JSON.parse(readFileSync(join(KOK, 'package.json'), 'utf8'));

let surec = null; let gecici = null; let port = 0;
const ciktilar = [];

/** İşletim sisteminden boş bir port ister (sabit port başka süreçle çakışır). */
const bosPort = () => new Promise((c, r) => {
  const s = createServer();
  s.on('error', r);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => c(p)); });
});

/** Sunucu dinlemeye başlayana kadar bekler; süre dolarsa toplanan çıktıyı verir. */
async function dinlemeyiBekle(url, sureMs = 20_000) {
  const bitis = Date.now() + sureMs;
  while (Date.now() < bitis) {
    if (surec.exitCode != null) {
      throw new Error(`süreç ${surec.exitCode} ile sonlandı — çıktı:\n${ciktilar.join('')}`);
    }
    try {
      const y = await fetch(url, { signal: AbortSignal.timeout(1500) });
      return y;
    } catch { await new Promise((c) => setTimeout(c, 200)); }
  }
  throw new Error(`sunucu ${sureMs} ms içinde dinlemedi — çıktı:\n${ciktilar.join('')}`);
}

before(async () => {
  port = await bosPort();
  gecici = mkdtempSync(join(tmpdir(), 'gb-baslat-'));
  /* `npm run baslat` bu dizeyi kabuğa verir; betiğin KENDİSİNİ sınıyoruz ki
     package.json değişirse test de değişsin (npm katmanı testi yavaşlatırdı). */
  surec = spawn('/bin/sh', ['-c', paket.scripts.baslat], {
    cwd: KOK,
    env: { ...process.env, GB_PORT: String(port), GB_HOST: '127.0.0.1',
      GB_DB: join(gecici, 'test.sqlite') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  surec.stdout.on('data', (d) => ciktilar.push(String(d)));
  surec.stderr.on('data', (d) => ciktilar.push(String(d)));
});

after(async () => {
  if (surec && surec.exitCode == null) {
    surec.kill('SIGTERM');
    await new Promise((c) => { surec.on('exit', c); setTimeout(c, 2000); });
  }
  if (gecici) rmSync(gecici, { recursive: true, force: true });
});

describe('D-17 — paketteki başlatma betiği dinleyen bir sunucu bırakır', () => {
  test('betik package.json içinde tanımlı', () => {
    assert.ok(paket.scripts?.baslat, 'package.json `scripts.baslat` taşımıyor');
    assert.match(paket.scripts.baslat, /sunucu\.mjs/, 'başlatma betiği sunucuyu çağırmıyor');
  });

  test('süreç SESSİZCE ÇIKMAZ; dinlemeye başlar', async () => {
    const y = await dinlemeyiBekle(`http://127.0.0.1:${port}/giris`);
    assert.equal(surec.exitCode, null, 'süreç ayakta kalmadı');
    assert.ok(y.status, 'yanıt alınamadı');
  });

  test('/giris GERÇEK istekte 200 döner ve giriş sayfasını verir', async () => {
    const y = await fetch(`http://127.0.0.1:${port}/giris`);
    assert.equal(y.status, 200, `/giris ${y.status} döndü`);
    const govde = await y.text();
    assert.match(govde, /<title>Giriş/, 'gelen sayfa giriş ekranı değil');
    assert.ok(govde.length > 1000, `yanıt gövdesi çok kısa (${govde.length} bayt)`);
  });

  test('dinlenen ADRESİ ve PORTU ekrana basar', () => {
    const metin = ciktilar.join('');
    assert.match(metin, /dinlemede/i, 'dinlemeye başladığını söylemiyor');
    assert.match(metin, new RegExp(`127\\.0\\.0\\.1:${port}`),
      `dinlenen adres:port ekrana basılmadı — çıktı:\n${metin}`);
    assert.match(metin, new RegExp(`port:\\s*${port}`), 'port ayrıca yazılmıyor');
  });

  test('süreç istek sonrası hâlâ ayakta (tek istekte ölmüyor)', async () => {
    for (const yol of ['/giris', '/sifre-unuttum', '/giris']) {
      const y = await fetch(`http://127.0.0.1:${port}${yol}`);
      assert.ok(y.status < 500, `${yol} → ${y.status}`);
    }
    assert.equal(surec.exitCode, null, 'süreç isteklerden sonra sonlandı');
  });
});

describe('D-17 — giriş koşulu yüzde kodlanan yollarda da doğru', () => {
  test('boşluklu yolda eski koşul YANLIŞ, yenisi DOĞRU sonuç verir', () => {
    const bosluklu = '/tmp/Backend Projects/app/sunucu.mjs';
    /* Hatanın kendisi: URL kodlaması ile elle kurulan dize ayrışır. */
    assert.notEqual(pathToFileURL(bosluklu).href, `file://${bosluklu}`,
      'kurgu: boşluklu yolda kodlama farkı olmalı');
    assert.match(pathToFileURL(bosluklu).href, /%20/, 'boşluk kodlanmıyor');
  });

  test('dogrudanCalistirildiMi bu dosyanın kendi yolunu tanır ve başkasını tanımaz',
    async () => {
      const { dogrudanCalistirildiMi } = await import('../../app/sunucu.mjs');
      const sunucuYolu = join(KOK, 'app', 'sunucu.mjs');
      assert.equal(dogrudanCalistirildiMi(sunucuYolu), true,
        'kendi yolu tanınmadı — boşluklu depo yolunda sessiz çıkış geri gelir');
      assert.equal(dogrudanCalistirildiMi(join(KOK, 'app', 'rotalar.mjs')), false,
        'başka bir dosya giriş noktası sayıldı');
      assert.equal(dogrudanCalistirildiMi(undefined), false);
      assert.equal(dogrudanCalistirildiMi(''), false);
    });

  test('deponun gerçek yolu boşluk içeriyorsa bu bir regresyon tuzağıdır', () => {
    /* Bilgi amaçlı: bu depo `Backend Projects` altında duruyor. Yol boşluksuz
       bir yere taşınsa bile yukarıdaki test koşulu kilitlemeye devam eder. */
    if (KOK.includes(' ')) {
      assert.match(pathToFileURL(KOK).href, /%20/,
        'depo yolu boşluklu ama URL kodlanmıyor — varsayım değişmiş');
    }
  });
});
