/* ============================================================================
   DENETİM-02 / D-11 — onay kapanış köprüsü (KARARLAR.md K-122)
   ----------------------------------------------------------------------------
   `kararVer()` kendi transaction'ında karar satırını COMMIT ediyor, sonra
   `isNesnesiniIlerlet()` iş nesnesini ilerletiyordu. Köprü fonksiyonları
   `audit.yaz()` çağırıyor ve `audit.mjs` bunu transaction dışında yasaklıyor
   (haklı olarak: "iş kaydı yazılıp audit yazılmadan commit olursa denetim izi
   delinir"). Sonuç: onay GERÇEKTEN kaydediliyor ama `/onaylar/:id` **500**
   dönüyordu; kullanıcı başarılı bir işlem için kalıcı hata görüyor, iş
   nesnesinin denetim kaydı hiç yazılmıyordu (§12).

   Mevcut testler bunu kaçırdı çünkü onay yardımcıları HTTP DURUM KODUNU
   kontrol etmiyordu. Buradaki testlerin ana işi tam olarak odur.
   ========================================================================== */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { uygulamaBaslat } from '../yardimci.mjs';
import { tek, sorgu } from '../../app/cekirdek/db.mjs';

let S;
before(async () => { S = await uygulamaBaslat(); });
after(async () => { await S.kapat(); });

const olarak = async (eposta) => { const c = S.istemci(); await c.giris(eposta); return c; };

describe('D-11 — onay kararı ve iş nesnesinin ilerlemesi tek transaction', () => {
  test('kapanış köprüleri audit yazabilmek için transaction İÇİNDE çağrılır', async () => {
    /* Köprüler doğrudan (transaction dışından) çağrılırsa audit koruması
       tetiklenir — yani köprüler kendi başlarına güvenli değil; çağıranın
       sarmalaması ŞART. Bu testin kilitlediği şey çağıranın sarmaladığıdır. */
    const { islem } = await import('../../app/cekirdek/db.mjs');
    const PE = await import('../../app/rotalar/proje-ek.mjs');
    const c = await olarak('sahip@yapitas.demo');
    await c.csrfIle('/projeler/yeni', { ad: 'D02 köprü projesi', kod: 'D02K', tur: 'konut',
      baslangic: '2026-01-01', bitis: '2027-01-01', _idempotency: 'd02-kopru' });
    const p = tek(`SELECT * FROM proje WHERE ad = 'D02 köprü projesi'`);
    const ctx = { tenant: tek('SELECT * FROM tenant LIMIT 1'),
      kullanici: tek(`SELECT * FROM kullanici WHERE eposta = 'sahip@yapitas.demo'`),
      istekId: 'd02', ip: '127.0.0.1' };

    assert.throws(() => PE.projeKapanisOnaySonucu(ctx, p.id, 'onaylandi'),
      /transaction dışında yazılamaz/, 'köprü transaction dışında sessizce geçti');
    assert.doesNotThrow(() => islem(() => PE.projeKapanisOnaySonucu(ctx, p.id, 'onaylandi')));
  });

  test('duyuru onayı 2xx/3xx döner, iş nesnesi ilerler ve denetim izine yazılır', async () => {
    const proje = await olarak('proje@yapitas.demo');
    const sahip = await olarak('sahip@yapitas.demo');
    await proje.csrfIle('/duyurular', { baslik: 'D02 köprü duyurusu', govde: 'gövde',
      _idempotency: 'd02-kd' });
    const d = tek(`SELECT * FROM duyuru WHERE baslik = 'D02 köprü duyurusu'`);
    await proje.csrfIle('/duyurular', { _eylem: 'onaya_gonder', id: d.id, surum: String(d.surum) });
    const t = tek(`SELECT * FROM onay_talebi WHERE nesne='duyuru' AND nesne_id=? AND durum='acik'`, d.id);

    const y = await sahip.csrfIle(`/onaylar/${t.id}`,
      { karar: 'onayla', belgeSurum: String(t.belge_surum) });
    assert.ok(y.durum < 400, `onay kararı ${y.durum} döndü (500 sınıfı hata beklenmiyor)`);
    assert.equal(tek('SELECT durum FROM duyuru WHERE id = ?', d.id).durum, 'yayinda');
    assert.ok(sorgu(`SELECT id FROM denetim_izi WHERE nesne = 'duyuru' AND nesne_id = ?
                      AND eylem LIKE 'gecis:%'`, d.id).length, 'iş nesnesinin denetim kaydı yok');
  });

  test('kart yükleme partisi onayı 500 DEĞİL; parti denetim izine yazılır', async () => {
    const finans = await olarak('finans@yapitas.demo');
    const proje = await olarak('proje@yapitas.demo');
    const ik = await olarak('ik@yapitas.demo');
    const sahip = await olarak('sahip@yapitas.demo');
    const { calistir } = await import('../../app/cekirdek/db.mjs');

    const tenant = tek('SELECT * FROM tenant LIMIT 1');
    const pluxee = tek(`SELECT * FROM kart_saglayici WHERE tenant_id=? AND kod='PLUXEE'`, tenant.id);
    await finans.csrfIle('/kartlar/saglayicilar',
      { saglayiciId: pluxee.id, ad: 'D02 hesap', musteriNo: 'D02-1', paraBirimi: 'TRY' });
    const hesap = tek(`SELECT * FROM saglayici_hesabi WHERE ad = 'D02 hesap'`);
    const urun = tek(`SELECT * FROM kart_urunu WHERE kod = 'PLX-YEMEK'`);
    await finans.csrfIle('/kartlar/yeni', { hesapId: hesap.id, urunId: urun.id,
      maskeliNo: '9001', saglayiciToken: 'D02-T1', _idempotency: 'd02-k1' });
    calistir(`UPDATE kart SET havuz = 1, durum = 'aktif' WHERE hesap_id = ?`, hesap.id);

    await finans.csrfIle('/kartlar/onaylar', { _eylem: 'politika_ac', urunId: urun.id,
      ad: 'D02 politika', gecerliBaslangic: '2026-01-01', gunKaynagi: 'sabit',
      sabitGun: '10', gunlukTutar: '100,00' });
    const pol = tek(`SELECT * FROM kart_politikasi WHERE ad = 'D02 politika'`);
    await finans.csrfIle('/kartlar/onaylar', { _eylem: 'politika_onaya', politikaId: pol.id });
    await onaylaVeDogrula('kart_politikasi', pol.id, 'kart_politikasi', [proje, ik, sahip]);

    await finans.csrfIle('/kartlar/yuklemeler/yeni', { hesapId: hesap.id, urunId: urun.id,
      donem: '2026-09', kaynak: 'sabit', _idempotency: 'd02-parti' });
    const parti = tek(`SELECT * FROM kart_yukleme_partisi WHERE hesap_id = ?`, hesap.id);
    assert.ok(parti, 'parti açılmadı');
    await finans.csrfIle(`/kartlar/yuklemeler/${parti.id}`, { _eylem: 'dogrula' });
    await finans.csrfIle(`/kartlar/yuklemeler/${parti.id}`, { _eylem: 'onaya_gonder' });

    await onaylaVeDogrula('kart_yukleme', parti.id, 'kart_yukleme_partisi', [proje, ik, sahip]);
    /* Onay GÖNDERİM DEĞİLDİR (K-096): parti onay_bekliyor kalır. */
    assert.equal(tek('SELECT durum FROM kart_yukleme_partisi WHERE id = ?', parti.id).durum,
      'onay_bekliyor');
    assert.ok(sorgu(`SELECT id FROM denetim_izi WHERE nesne = 'kartYuklemePartisi'
                      AND nesne_id = ? AND eylem = 'onaylandi'`, parti.id).length,
    'partinin "onaylandı" denetim kaydı yazılmadı');
  });

  /** Onay talebini gezer; HER kararın HTTP durumunu da doğrular (asıl mesele bu). */
  async function onaylaVeDogrula(nesne, nesneId, tablo, istemciler) {
    const t = tek(`SELECT * FROM onay_talebi WHERE nesne=? AND nesne_id=? AND durum='acik'`,
      nesne, nesneId);
    assert.ok(t, `${nesne} için onay talebi açılmadı`);
    for (const c of istemciler) {
      if (tek(`SELECT durum FROM ${tablo} WHERE id = ?`, nesneId).durum === 'onaylandi') break;
      const guncelTalep = tek('SELECT * FROM onay_talebi WHERE id = ?', t.id);
      if (guncelTalep.durum !== 'acik') break;
      const y = await c.csrfIle(`/onaylar/${t.id}`,
        { karar: 'onayla', belgeSurum: String(guncelTalep.belge_surum) });
      assert.ok(y.durum < 500, `${nesne} onayında ${y.durum} SUNUCU HATASI`);
    }
  }
});
