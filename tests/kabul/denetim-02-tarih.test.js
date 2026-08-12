/* ============================================================================
   DENETİM-02 / D-10 — tarih ayrıştırıcı (KARARLAR.md K-121)
   ----------------------------------------------------------------------------
   `gunBaslangici()` girdiyi doğrulamıyordu:
     · "abc" / ""      → `RangeError` → 500 SUNUCU_HATASI (kullanıcı gerçek hata
                          kodunu görmüyor; §12 "hata/retry ekranının eksikliği")
     · "2026-13-45"    → sessizce 2027-02-14'e kayıyor
     · "2026-02-31"    → sessizce 2026-03-03'e kayıyor
   Kaydırılmış gün deftere, puantaja ve hakediş dönemine YANLIŞ tarih yazar.
   Fonksiyon 111 yerden çağrıldığı için doğrulama tek kapıda zorlanır.
   ========================================================================== */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { uygulamaBaslat } from '../yardimci.mjs';
import { tek, sorgu } from '../../app/cekirdek/db.mjs';
import { gunBaslangici, gunGecerliMi, gunAnahtari } from '../../app/cekirdek/zaman.mjs';

let S; let kasa;
before(async () => {
  S = await uygulamaBaslat();
  const c = S.istemci();
  await c.giris('finans@yapitas.demo');
  await c.csrfIle('/kasalar', { ad: 'D02 tarih kasası', paraBirimi: 'TRY' });
  kasa = tek(`SELECT * FROM kasa WHERE ad = 'D02 tarih kasası'`);
  await c.csrfIle('/kasa-hareketleri',
    { kasaId: kasa.id, tur: 'tahsilat', tutar: '1.000,00', aciklama: 'baz' });
});
after(async () => { await S.kapat(); });

const finans = async () => { const c = S.istemci(); await c.giris('finans@yapitas.demo'); return c; };

describe('D-10 — geçersiz tarih 500 değil 422 verir, imkânsız tarih kaymaz', () => {
  test('imkânsız ve bozuk tarih DogrulamaHatasi (422) atar', () => {
    for (const g of ['2026-13-45', '2026-02-31', '2026-00-00', '2027-02-29',
      'abc', '', null, undefined, '2026-8-1', '2026-12-31extra', '1899-12-31']) {
      assert.equal(gunGecerliMi(g), false, `geçerli sayıldı: ${g}`);
      assert.throws(() => gunBaslangici(g), (e) => e.durum === 422,
        `422 üretmedi: ${JSON.stringify(g)}`);
    }
  });

  test('gerçek tarihler (artık yıl dahil) kabul edilir ve tur atar', () => {
    for (const g of ['2026-12-31', '2026-02-28', '2028-02-29', '2026-01-01']) {
      assert.equal(gunGecerliMi(g), true, `reddedildi: ${g}`);
      assert.equal(gunAnahtari(gunBaslangici(g)), g, `tur atmıyor: ${g}`);
    }
  });

  test('form üzerinden bozuk tarih 422 döner, 500 DEĞİL', async () => {
    const c = await finans();
    for (const t of ['abc', '2026-13-45', '2026-02-31', '31.12.2026']) {
      const once = sorgu('SELECT id FROM kasa_hareketi WHERE kasa_id = ?', kasa.id).length;
      const y = await c.csrfIle('/kasa-hareketleri',
        { kasaId: kasa.id, tur: 'odeme', tutar: '10,00', aciklama: 'bozuk tarih', tarih: t });
      assert.equal(y.durum, 422, `"${t}" için beklenen 422, gelen ${y.durum}`);
      assert.equal(sorgu('SELECT id FROM kasa_hareketi WHERE kasa_id = ?', kasa.id).length, once,
        `"${t}" ile satır yazıldı`);
    }
  });

  test('geçerli tarih yazılan güne AYNEN düşer (sessiz kayma yok)', async () => {
    const c = await finans();
    const y = await c.csrfIle('/kasa-hareketleri',
      { kasaId: kasa.id, tur: 'odeme', tutar: '10,00', aciklama: 'kayma testi', tarih: '2026-02-28' });
    assert.equal(y.durum, 200);
    const h = tek(`SELECT zaman FROM kasa_hareketi WHERE kasa_id = ? AND aciklama = 'kayma testi'`, kasa.id);
    assert.equal(gunAnahtari(h.zaman), '2026-02-28');
  });
});
