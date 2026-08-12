/* ============================================================================
   KABUL TESTİ — denetim-01 / D-06 antivirüs durumu beyan edilir
   ----------------------------------------------------------------------------
   §8 "antivirüs, MIME doğrulama ve sürümleme uygulanır" diyor; K-027 gereği
   antivirüs BAĞLI DEĞİL. Eksiği söylememek sahte başarının sessiz biçimidir:
   kullanıcı dosyanın taranmış olduğunu varsayar.

   Bu dosya, dosya yükleyen HER ekranın durumu açıkça yazdığını kilitler ve
   metnin tek kaynaktan geldiğini (sapmasın diye) doğrular.
   ========================================================================== */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync } from 'node:fs';
import { uygulamaBaslat } from '../yardimci.mjs';
import { yapilandirma } from '../../app/cekirdek/yapilandirma.mjs';
import { dosyaGuvenlikSeridi } from '../../app/web/bilesenler.mjs';

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

let S; let c;

before(async () => {
  S = await uygulamaBaslat();
  c = S.istemci();
  await c.giris('sahip@yapitas.demo');
});
after(async () => S.kapat());

describe('D-06 — antivirüs durumu tek kaynaktan beyan edilir', () => {
  test('varsayılan kurulumda antivirüs bağlı DEĞİLDİR', () => {
    assert.equal(yapilandirma.antivirusBagli, false,
      'testler tarayıcı BAĞLI DEĞİL varsayımıyla yazıldı');
  });

  test('şerit ne yapıldığını ve ne YAPILMADIĞINI söyler', () => {
    const metin = String(dosyaGuvenlikSeridi());
    assert.match(metin, /Antivirüs taraması BAĞLI DEĞİL/, 'eksik açıkça söylenmiyor');
    assert.match(metin, /TARANMAZ/);
    assert.match(metin, /K-027/, 'karar referansı yok');
    /* Yapılanlar da yazılmalı — yalnız eksiği söylemek yanıltıcı olurdu. */
    assert.match(metin, /MIME içerik imzası/);
    assert.match(metin, /SHA-256/);
  });

  test('DOC-02 yeni doküman ekranında şerit görünür', async () => {
    const y = await c.get('/dokumanlar/yeni');
    assert.equal(y.durum, 200);
    assert.match(y.govde, /Antivirüs taraması BAĞLI DEĞİL/,
      'yükleme ekranı antivirüs durumunu söylemiyor');
  });

  /* Kayıt gerektiren yüzeyler (DOC-03 yeni sürüm, CRD-12 sonuç dosyası) için
     canlı sayfa yerine KAYNAK TARAMASI yapılır: fikstür kurulamadığında sessizce
     geçen bir test, test olmaktan çıkar. Bu tarama ayrıca YENİ eklenen bir
     yükleme yüzeyini de yakalar. */
  test('multipart form içeren her yüzey güvenlik şeridini çizer', () => {
    const dizinler = [resolve(KOK, 'app/rotalar'), resolve(KOK, 'app/web'),
      resolve(KOK, 'app/web/sayfalar')];
    const eksik = [];
    let toplamForm = 0;
    for (const d of dizinler) {
      for (const ad of readdirSync(d)) {
        if (!ad.endsWith('.mjs')) continue;
        const kaynak = readFileSync(resolve(d, ad), 'utf8');
        const formSayisi = (kaynak.match(/enctype="multipart\/form-data"/g) || []).length;
        if (!formSayisi) continue;
        toplamForm += formSayisi;
        const seritSayisi = (kaynak.match(/dosyaGuvenlikSeridi\(\)/g) || []).length;
        if (seritSayisi < formSayisi) {
          eksik.push(`${ad}: ${formSayisi} yükleme formu, ${seritSayisi} güvenlik şeridi`);
        }
      }
    }
    assert.ok(toplamForm >= 3, `yalnız ${toplamForm} yükleme formu bulundu — tarama şüpheli`);
    assert.deepEqual(eksik, [],
      'bu dosyalarda antivirüs durumunu söylemeyen yükleme formu var (K-027, D-06)');
  });

  /* Bayrak açılınca metin kendiliğinden düzelmeli; ekranlarda ayrı ayrı
     düzenlenmesi gereken bir cümle KALMAMALI. */
  test('tarayıcı bağlanınca beyan kendiliğinden düzelir', () => {
    const BETIK = `
import { dosyaGuvenlikSeridi } from './app/web/bilesenler.mjs';
import { yapilandirma } from './app/cekirdek/yapilandirma.mjs';
console.log(JSON.stringify({
  bagli: yapilandirma.antivirusBagli,
  metin: String(dosyaGuvenlikSeridi()),
}));
`;
    const cikti = execFileSync(process.execPath, ['--input-type=module', '-e', BETIK], {
      cwd: KOK, env: { ...process.env, GB_ANTIVIRUS: '1' }, encoding: 'utf8',
    });
    const s = JSON.parse(cikti.trim().split('\n').pop());
    assert.equal(s.bagli, true, 'alt süreçte bayrak açılmadı');
    assert.match(s.metin, /Dosya güvenlik kontrolleri açık/);
    assert.doesNotMatch(s.metin, /BAĞLI DEĞİL/,
      'tarayıcı bağlıyken hâlâ "bağlı değil" deniyor');
  });
});
