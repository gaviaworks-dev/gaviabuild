/* ============================================================================
   DENETİM-02 / D-15 — serbest metin uzunluk sınırı (KARARLAR.md K-127)
   ----------------------------------------------------------------------------
   Hiçbir serbest metin alanında uzunluk sınırı yoktu: 100.000 karakterlik bir
   açıklama DEĞİŞMEZ kasa defterine giriyor (denetim-02 §9.3), oradan listeye,
   rapora ve PDF'e taşınıyordu. Defter satırı silinemediği için geri alınamaz.

   Sınır iki katmanda: (1) `kayit-modulu` alanları için TÜR BAZLI ÖNTANIM —
   alan kendi `enFazla`sını bildirmemişse artık sınırsız değil; (2) elle yazılmış
   rotaların da geçtiği DEFTER KAPILARI (`hareketYaz`).

   Aşım SESSİZCE KIRPILMAZ: 422 + kaç karakter girildiği + kısaltma isteği.
   ========================================================================== */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { uygulamaBaslat } from '../yardimci.mjs';
import { tek, sorgu, islem } from '../../app/cekirdek/db.mjs';
import { yapilandirma } from '../../app/cekirdek/yapilandirma.mjs';
import { metinSinirZorunlu, varsayilanSinir } from '../../app/cekirdek/metin.mjs';
import * as fdefter from '../../app/moduller/finans/defter.mjs';

let S; let kasa;
const UZUN = yapilandirma.metinEnFazla;       // 4.000
const KISA = yapilandirma.kisaMetinEnFazla;   // 250

before(async () => {
  S = await uygulamaBaslat();
  const c = await finans();
  await c.csrfIle('/kasalar', { ad: 'D15 kasası', paraBirimi: 'TRY' });
  kasa = tek(`SELECT * FROM kasa WHERE ad = 'D15 kasası'`);
});
after(async () => { await S.kapat(); });

const finans = async () => { const c = S.istemci(); await c.giris('finans@yapitas.demo'); return c; };
const ik = async () => { const c = S.istemci(); await c.giris('ik@yapitas.demo'); return c; };
const satir = () => sorgu('SELECT id FROM kasa_hareketi WHERE kasa_id = ?', kasa.id).length;

describe('D-15 — serbest metin sınırsız değil', () => {
  test('öntanımlar yapılandırmadan gelir; uzunMetin uzun, tek satır kısa', () => {
    assert.equal(UZUN, 4000);
    assert.equal(KISA, 250);
    assert.equal(varsayilanSinir('uzunMetin'), UZUN);
    assert.equal(varsayilanSinir('metin'), KISA);
  });

  test('sınırdaki metin geçer, bir fazlası 422 ile reddedilir', () => {
    assert.doesNotThrow(() => metinSinirZorunlu('A'.repeat(UZUN)));
    assert.throws(() => metinSinirZorunlu('A'.repeat(UZUN + 1)), (e) => e.durum === 422);
    assert.equal(metinSinirZorunlu(null), null, 'boş değer reddedilmemeli');
  });

  test('ret metni KAÇ karakter girildiğini söyler ve kırpmadığını belirtir', () => {
    try {
      metinSinirZorunlu('A'.repeat(100_000), { alan: 'aciklama', etiket: 'Açıklama' });
      assert.fail('100 bin karakter kabul edildi');
    } catch (e) {
      assert.equal(e.durum, 422);
      assert.match(e.mesaj, /100\.000/, 'girilen uzunluk söylenmiyor');
      assert.match(e.mesaj, /4\.000/, 'sınır söylenmiyor');
      assert.match(e.mesaj, /KIRPILMADI/, 'kırpılmadığı söylenmiyor');
    }
  });

  test('DEFTER KAPISI: sınırı aşan açıklama değişmez deftere GİREMEZ', async () => {
    const c = await finans();
    const once = satir();
    const y = await c.csrfIle('/kasa-hareketleri',
      { kasaId: kasa.id, tur: 'tahsilat', tutar: '10,00', aciklama: 'A'.repeat(100_000) });
    assert.equal(y.durum, 422, '100 bin karakterlik açıklama kabul edildi');
    assert.equal(satir(), once, 'sınırı aşan açıklama deftere yazıldı');
  });

  test('DEFTER KAPISI: sınırdaki açıklama geçer, belge no KISA sınıra tabidir', async () => {
    const c = await finans();
    const once = satir();
    const y = await c.csrfIle('/kasa-hareketleri',
      { kasaId: kasa.id, tur: 'tahsilat', tutar: '10,00', aciklama: 'A'.repeat(UZUN) });
    assert.equal(y.durum, 200, 'sınırdaki açıklama reddedildi');
    assert.equal(satir(), once + 1);
    assert.equal(tek(`SELECT length(aciklama) AS n FROM kasa_hareketi
                       WHERE kasa_id = ? ORDER BY olusturuldu DESC LIMIT 1`, kasa.id).n, UZUN,
    'açıklama sessizce kırpıldı');

    const uzunBelge = await c.csrfIle('/kasa-hareketleri',
      { kasaId: kasa.id, tur: 'tahsilat', tutar: '10,00', aciklama: 'x',
        belgeNo: 'B'.repeat(KISA + 1) });
    assert.equal(uzunBelge.durum, 422, 'belge numarası uzun sınıra tabi tutuldu');
  });

  test('defter kapıları doğrudan çağrıda da zorlar', () => {
    const ctx = { tenant: tek('SELECT * FROM tenant LIMIT 1'),
      kullanici: tek(`SELECT * FROM kullanici WHERE eposta = 'finans@yapitas.demo'`),
      istekId: 'd15', ip: '127.0.0.1' };
    assert.throws(() => islem(() => fdefter.hareketYaz(ctx, 'kasa',
      { sahipId: kasa.id, tur: 'tahsilat', tutarMinor: 100n, aciklama: 'A'.repeat(UZUN + 1) })),
    (e) => e.durum === 422, 'defter kapısı uzun metni geçirdi');
  });

  test('KAYIT ÜRETECİ: enFazla bildirmeyen alan artık sınırsız değil', async () => {
    const c = await ik();
    /* `adres` uzunMetin ve enFazla bildirmiyor → öntanım UZUN. */
    const tam = await c.csrfIle('/personel/yeni', { adSoyad: 'D15 Sınır', gorev: 'usta',
      iseGiris: '2026-01-01', adres: 'B'.repeat(UZUN), _idempotency: 'd15-tam' });
    assert.equal(tam.durum, 200, 'sınırdaki adres reddedildi');

    const asan = await c.csrfIle('/personel/yeni', { adSoyad: 'D15 Aşan', gorev: 'usta',
      iseGiris: '2026-01-01', adres: 'B'.repeat(UZUN + 1), _idempotency: 'd15-asan' });
    assert.equal(asan.durum, 422, 'sınırı aşan adres kabul edildi');
    assert.equal(sorgu(`SELECT id FROM personel WHERE ad_soyad = 'D15 Aşan'`).length, 0,
      'sınırı aşan kayıt açıldı');
  });

  test('alanın kendi enFazla bildirimi öntanımı EZER (gevşetmez de)', async () => {
    const c = await ik();
    /* `adSoyad` enFazla: 120 bildiriyor — öntanım 250 olsa da 121 reddedilir. */
    const y = await c.csrfIle('/personel/yeni', { adSoyad: 'X'.repeat(121), gorev: 'usta',
      iseGiris: '2026-01-01', _idempotency: 'd15-ad' });
    assert.equal(y.durum, 422, 'alanın kendi sınırı uygulanmadı');
  });
});
