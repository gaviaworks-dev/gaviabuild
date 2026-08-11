/* ============================================================================
   KABUL TESTİ — AUTH-01 üretim koşulu
   "Üretim girişinde rol seçimi yoktur."
   Bayrak süreç başlangıcında okunduğu için ayrı bir süreçte doğrulanır.
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const BETIK = `
import { uygulamaBaslat } from './tests/yardimci.mjs';
const S = await uygulamaBaslat();
const y = await S.istemci().get('/giris');
const demoTenant = (await import('./app/cekirdek/db.mjs')).tek("SELECT id FROM tenant WHERE demo = 1");
console.log(JSON.stringify({
  durum: y.durum,
  rolSecimiVar: /Rol seçerek incele/.test(y.govde),
  demoEtiketiVar: /DEMO/.test(y.govde),
  demoTenantOlusturuldu: !!demoTenant,
}));
await S.kapat();
`;

test('AUTH-01 — üretim ortamında demo rol seçimi görünmez ve demo tenant kurulmaz', () => {
  const cikti = execFileSync(process.execPath, ['--input-type=module', '-e', BETIK], {
    cwd: KOK, env: { ...process.env, GB_ORTAM: 'uretim', GB_HTTPS: '0' }, encoding: 'utf8',
  });
  const sonuc = JSON.parse(cikti.trim().split('\n').pop());
  assert.equal(sonuc.durum, 200, 'üretimde giriş sayfası açılmıyor');
  assert.equal(sonuc.rolSecimiVar, false, 'ÜRETİMDE ROL SEÇİMİ GÖRÜNÜYOR — kabul edilemez');
  assert.equal(sonuc.demoEtiketiVar, false, 'üretimde DEMO etiketi görünüyor');
  assert.equal(sonuc.demoTenantOlusturuldu, false, 'üretimde demo tenant oluşturuluyor');
});
