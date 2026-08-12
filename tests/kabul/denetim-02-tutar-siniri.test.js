/* ============================================================================
   DENETİM-02 / D-08 — tutar üst sınırı (KARARLAR.md K-120)
   ----------------------------------------------------------------------------
   Tutarlar SQLite INTEGER sütununda saklanır; `node:sqlite` okurken JS Number'a
   çevirir ve `Number.MAX_SAFE_INTEGER` aşılırsa OKUMA RangeError atar. Değişmez
   defterde bu, satırı yazılmış ama okunamaz — dolayısıyla ters kayıtla da
   düzeltilemez — hale getirir: tek bir form gönderimi finans modülünü kalıcı
   olarak devre dışı bırakır (§12: "finans bakiyesinin hareket defterinden
   yeniden üretilememesi" + "kritik işlemde hata/retry ekranının eksikliği").

   Bu testler sınırın YAZMA kapısında zorlandığını kilitler.
   ========================================================================== */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { uygulamaBaslat } from '../yardimci.mjs';
import { tek, sorgu, islem } from '../../app/cekirdek/db.mjs';
import { Para, AZAMI_MINOR } from '../../app/cekirdek/para.mjs';
import * as fdefter from '../../app/moduller/finans/defter.mjs';
import * as sdefter from '../../app/moduller/stok/defter.mjs';

let S; let kasa;
const AZAMI_METIN = '90071992547409,91';        // AZAMI_MINOR = 9007199254740991
const ASAN_METIN = '90071992547409,92';         // AZAMI_MINOR + 1

before(async () => {
  S = await uygulamaBaslat();
  const c = S.istemci();
  await c.giris('finans@yapitas.demo');
  await c.csrfIle('/kasalar', { ad: 'D02 sınır kasası', paraBirimi: 'TRY' });
  kasa = tek(`SELECT * FROM kasa WHERE ad = 'D02 sınır kasası'`);
});
after(async () => { await S.kapat(); });

const finans = async () => { const c = S.istemci(); await c.giris('finans@yapitas.demo'); return c; };

describe('D-08 — okunamayacak tutar deftere GİREMEZ', () => {
  test('AZAMI_MINOR tam olarak Number.MAX_SAFE_INTEGER', () => {
    assert.equal(AZAMI_MINOR, BigInt(Number.MAX_SAFE_INTEGER));
    assert.equal(Para.ayristir(AZAMI_METIN).minor, AZAMI_MINOR);
  });

  test('Para.ayristir sınırı aşan tutarı 422 ile reddeder (pozitif ve negatif)', () => {
    for (const girdi of [ASAN_METIN, `-${ASAN_METIN}`, '9'.repeat(40), '92233720368547758,07']) {
      assert.throws(() => Para.ayristir(girdi), (e) => e.durum === 422, `kabul edildi: ${girdi}`);
    }
  });

  test('sınırı aşan tahsilat 422 döner ve HİÇBİR SATIR yazılmaz', async () => {
    const c = await finans();
    const once = sorgu('SELECT id FROM kasa_hareketi WHERE kasa_id = ?', kasa.id).length;
    const y = await c.csrfIle('/kasa-hareketleri',
      { kasaId: kasa.id, tur: 'tahsilat', tutar: ASAN_METIN, aciklama: 'sınır üstü' });
    assert.equal(y.durum, 422, 'sınırı aşan tutar kabul edildi');
    assert.equal(sorgu('SELECT id FROM kasa_hareketi WHERE kasa_id = ?', kasa.id).length, once,
      'sınırı aşan tutar deftere YAZILDI');
  });

  test('sınırdaki tutar yazılır ve defter/ekran okunabilir kalır', async () => {
    const c = await finans();
    const y = await c.csrfIle('/kasa-hareketleri',
      { kasaId: kasa.id, tur: 'tahsilat', tutar: AZAMI_METIN, aciklama: 'tam sınır' });
    assert.equal(y.durum, 200);
    assert.equal(fdefter.bakiye('kasa', kasa.id), Number(AZAMI_MINOR));
    /* Defteri okuyan üç yüzey de ayakta: liste, hareket ekranı, rapor. */
    for (const yol of ['/kasalar', `/kasa-hareketleri?kasa_id=${kasa.id}`, '/raporlar/nakit-akisi']) {
      assert.equal((await c.get(yol)).durum, 200, `${yol} çöktü`);
    }
  });

  test('defter kapıları da doğrudan çağrıda sınırı zorlar (kasa, kart, stok)', () => {
    const ctx = { tenant: tek('SELECT * FROM tenant LIMIT 1'),
      kullanici: tek(`SELECT * FROM kullanici WHERE eposta = 'finans@yapitas.demo'`),
      istekId: 'd02', ip: '127.0.0.1' };
    const asan = AZAMI_MINOR + 1n;
    assert.throws(() => islem(() => fdefter.hareketYaz(ctx, 'kasa',
      { sahipId: kasa.id, tur: 'tahsilat', tutarMinor: asan })), (e) => e.durum === 422);
    assert.throws(() => islem(() => sdefter.hareketYaz(ctx,
      { depoId: 'x', stokKartiId: 'y', tur: 'giris', miktarBinde: Number.MAX_SAFE_INTEGER + 2 })),
    (e) => e.durum === 422);
  });
});
