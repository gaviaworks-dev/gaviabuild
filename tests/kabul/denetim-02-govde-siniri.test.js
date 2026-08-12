/* ============================================================================
   DENETİM-02 / D-13 — gövde sınırı ve bağlantı sağlığı (KARARLAR.md K-128)
   ----------------------------------------------------------------------------
   `govdeOku()` sınırı aşınca isteği okumayı bırakıp hata atıyordu. Yanıt gidiyor
   ama soket YARIM KALMIŞ gövdeyle kalıyor ve aynı keep-alive bağlantısındaki
   BİR SONRAKİ istek `ECONNRESET` alıyordu (denetim-02 §9.3): kullanıcı "çok
   büyük" uyarısından sonra nedensiz kopan bir tıklama görüyordu.

   Ayrıca durum 422 idi — sorun alan doğrulaması değil, isteğin kendisinin
   taşınamaz olması: doğru kod 413'tür.

   Düzeltme: sınır aşılınca kalan gövde BELLEĞE ALINMADAN akıştan boşaltılır,
   413 döner, bağlantı sağlam kalır. Boşaltmanın da bir tavanı vardır.
   ========================================================================== */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { uygulamaBaslat } from '../yardimci.mjs';
import { tek } from '../../app/cekirdek/db.mjs';
import { yapilandirma } from '../../app/cekirdek/yapilandirma.mjs';

let S; let kasa;
const SINIR = yapilandirma.maxGovdeBayt;

before(async () => {
  S = await uygulamaBaslat();
  const c = await finans();
  await c.csrfIle('/kasalar', { ad: 'D13 kasası', paraBirimi: 'TRY' });
  kasa = tek(`SELECT * FROM kasa WHERE ad = 'D13 kasası'`);
});
after(async () => { await S.kapat(); });

const finans = async () => { const c = S.istemci(); await c.giris('finans@yapitas.demo'); return c; };

describe('D-13 — gövde sınırı 413 döner, bağlantıyı bozmaz', () => {
  test('sınırı aşan gövde 413 döner (422 değil)', async () => {
    const c = await finans();
    const y = await c.csrfIle('/kasa-hareketleri',
      { kasaId: kasa.id, tur: 'tahsilat', tutar: '10,00', aciklama: 'A'.repeat(SINIR + 1024) });
    assert.equal(y.durum, 413, `beklenen 413, gelen ${y.durum}`);
    assert.match(y.govde, /çok büyük/i, 'kullanıcıya neden söylenmiyor');
  });

  test('413 SONRASI aynı istemci çalışmaya devam eder (ECONNRESET yok)', async () => {
    const c = await finans();
    await c.csrfIle('/kasa-hareketleri',
      { kasaId: kasa.id, tur: 'tahsilat', tutar: '10,00', aciklama: 'B'.repeat(SINIR * 2) });
    /* Asıl bulgu buydu: ilk istek geçiyor, İKİNCİSİ ECONNRESET alıyordu. */
    for (let i = 0; i < 4; i++) {
      const y = await c.get('/kasalar');
      assert.equal(y.durum, 200, `413 sonrası ${i + 1}. istek ${y.durum} döndü`);
    }
  });

  test('art arda birden çok aşım da bağlantıyı bozmaz', async () => {
    const c = await finans();
    for (let i = 0; i < 3; i++) {
      const y = await c.csrfIle('/kasa-hareketleri',
        { kasaId: kasa.id, tur: 'tahsilat', tutar: '10,00', aciklama: 'C'.repeat(SINIR + 500) });
      assert.equal(y.durum, 413);
      assert.equal((await c.get('/kasalar')).durum, 200, `${i + 1}. aşımdan sonra bağlantı bozuldu`);
    }
  });

  test('sınır altındaki gövde normal işlenir (regresyon değil)', async () => {
    const c = await finans();
    const y = await c.csrfIle('/kasa-hareketleri',
      { kasaId: kasa.id, tur: 'tahsilat', tutar: '10,00', aciklama: 'D'.repeat(1000) });
    assert.equal(y.durum, 200);
  });

  test('JSON isteyen istemciye de 413 ve makine-okunur kod döner', async () => {
    const c = await finans();
    const y = await fetch(`${S.taban}/kasa-hareketleri`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json',
        cookie: [...c.cerezler].map(([k, v]) => `${k}=${v}`).join('; ') },
      body: JSON.stringify({ aciklama: 'E'.repeat(SINIR + 100) }),
    });
    assert.equal(y.status, 413);
    const govde = await y.json();
    assert.equal(govde.hata.kod, 'GOVDE_COK_BUYUK');
  });
});
