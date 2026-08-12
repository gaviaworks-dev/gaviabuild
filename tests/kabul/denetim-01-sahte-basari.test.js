/* ============================================================================
   KABUL TESTİ — denetim-01 / sahte başarı bildirimi
   ----------------------------------------------------------------------------
   `raporlar/denetim-01.md` D-03: e-posta gönderici bağlı DEĞİLKEN hiçbir ekran
   "gönderildi" dememeli (kural 3). Davet, teslim edilebilir kalmalı; şifre
   sıfırlama tokeni ise anonim kullanıcıya ASLA gösterilmemeli.
   ========================================================================== */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { uygulamaBaslat } from '../yardimci.mjs';
import { yapilandirma } from '../../app/cekirdek/yapilandirma.mjs';

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('denetim-01 — sahte başarı yok (kural 3)', () => {
  let S;
  before(async () => { S = await uygulamaBaslat(); });
  after(async () => S.kapat());

  test('e-posta gönderici bağlı değilken varsayılan kurulum böyle gelir', () => {
    assert.equal(yapilandirma.epostaBagli, false,
      'testler gönderici BAĞLI DEĞİL varsayımıyla yazıldı');
  });

  test('AUTH-02 gönderici yokken "gönderildi" DEMEZ', async () => {
    const c = S.istemci();
    const y = await c.post('/sifre-unuttum', { eposta: 'sahip@yapitas.demo' });
    assert.match(y.govde, /GÖNDERİLMEDİ/, 'gönderilmediği açıkça yazılmıyor');
    assert.doesNotMatch(y.govde, /<h2>Bağlantı gönderildi<\/h2>/,
      'gönderici yokken başarı başlığı gösteriliyor — sahte başarı');
    /* Anonim kullanıcıya token GÖSTERİLMEZ; hesap sayımı da sızmaz. */
    assert.match(y.govde, /Bu e-posta adresi kayıtlıysa/);
  });

  test('SET-03 daveti gönderici yokken bağlantıyı GÖSTERİR ve "gönderildi" demez', async () => {
    const c = S.istemci();
    await c.giris('sahip@yapitas.demo');
    const y = await c.csrfIle('/ayarlar/kullanicilar', {
      eposta: 'denetim01@yapitas.demo', adSoyad: 'Denetim Kullanıcı', rolKodu: 'calisan',
    });
    assert.equal(y.durum, 200);
    assert.doesNotMatch(y.govde, /e-posta adresine gönderildi/,
      'gönderici yokken "e-posta adresine gönderildi" deniyor — sahte başarı');
    assert.match(y.govde, /GÖNDERİLMEDİ/);
    assert.match(y.govde, /\/davet\//, 'davet bağlantısı gösterilmiyor — davet teslim edilemez');
  });
});

/* Bayrak ve ortam süreç başında okunduğu için ayrı süreçte doğrulanır. */
describe('denetim-01 — üretim ortamı', () => {
  const BETIK = `
import { uygulamaBaslat } from './tests/yardimci.mjs';
import { demoTenantKur } from './app/moduller/kimlik/tohum.mjs';
import { yapilandirma } from './app/cekirdek/yapilandirma.mjs';
const S = await uygulamaBaslat();
demoTenantKur({ zorla: true });
const c = S.istemci();
await c.giris('sahip@yapitas.demo');
const davet = await c.csrfIle('/ayarlar/kullanicilar', {
  eposta: 'uretim01@yapitas.demo', adSoyad: 'Üretim Kullanıcı', rolKodu: 'calisan' });
const sifre = await c.post('/sifre-unuttum', { eposta: 'sahip@yapitas.demo' });
console.log(JSON.stringify({
  uretim: yapilandirma.uretim,
  davetDurum: davet.durum,
  davetGonderildiIddiasi: /e-posta adresine gönderildi/.test(davet.govde),
  davetBaglantisiGorunur: /\\/davet\\//.test(davet.govde),
  sifreGonderildiIddiasi: /<h2>Bağlantı gönderildi<\\/h2>/.test(sifre.govde),
  sifreTokenSizdi: /\\/sifre-sifirla\\//.test(sifre.govde),
}));
await S.kapat();
`;

  test('üretimde davet "gönderildi" demez, bağlantıyı gösterir; sıfırlama tokeni sızmaz', () => {
    const cikti = execFileSync(process.execPath, ['--input-type=module', '-e', BETIK], {
      cwd: KOK, env: { ...process.env, GB_ORTAM: 'uretim', GB_HTTPS: '0', GB_EPOSTA: '' }, encoding: 'utf8',
    });
    const s = JSON.parse(cikti.trim().split('\n').pop());
    assert.equal(s.uretim, true, 'alt süreç üretim ortamında başlamadı');
    assert.equal(s.davetDurum, 200);
    assert.equal(s.davetGonderildiIddiasi, false,
      'ÜRETİMDE "e-posta adresine gönderildi" deniyor ama gönderici yok — sahte başarı');
    assert.equal(s.davetBaglantisiGorunur, true,
      'üretimde davet bağlantısı gizleniyor — davet hiçbir yolla teslim edilemez');
    assert.equal(s.sifreGonderildiIddiasi, false,
      'ÜRETİMDE şifre sıfırlama "gönderildi" diyor ama gönderici yok — sahte başarı');
    assert.equal(s.sifreTokenSizdi, false,
      'sıfırlama tokeni anonim kullanıcıya gösteriliyor — hesap ele geçirme açığı');
  });
});
