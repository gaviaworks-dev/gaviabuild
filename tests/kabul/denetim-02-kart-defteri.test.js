/* ============================================================================
   DENETİM-02 / D-09 · D-12 — sağlayıcı yanıtı ve kart defteri
   ----------------------------------------------------------------------------
   D-09 (K-123): `httpAdaptoru` 200 dönünce `partiGonder()` yalnız satır
     durumlarını "başarılı" yapıyor, `sonucIsle()`yi HİÇ çağırmıyordu — yani
     paranın karta girdiği tek fonksiyon atlanıyordu. Parti "başarılı", tutar
     yerinde, kart bakiyesi SIFIR. Üstelik parti "basarili" olduğu için sonuç
     dosyası yolu da kapanıyordu: defteri yazdıracak hiçbir yol kalmıyordu
     (§12 "kart bakiyesinin hareket defterinden yeniden üretilememesi",
     kural 3 ve 7).

   D-12 (K-124): aynı parti aynı anda iki kez gönderilince ikinci çağrı
     idempotency kısıtına takılıp `MUKERRER_OLAY` dönüyordu; bu SAĞLAYICI REDDİ
     sanılıp satırlar "reddedildi", parti "hatalı" yapılıyordu. İlk gönderim
     gerçek yanıtla dönünce satırlar "başarılı" oluyor ama parti "hatalı"
     kalıyordu — ekran ile veri ayrışıyordu.

   Test GERÇEK bir sağlayıcıya karşı çalışır: gecikmeli yerel HTTP sunucusu,
   `adaptor: 'http'`. Gecikme, eşzamanlılık penceresinin gerçek olması için.
   ========================================================================== */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { uygulamaBaslat } from '../yardimci.mjs';
import { tek, sorgu, calistir } from '../../app/cekirdek/db.mjs';
import * as kdefter from '../../app/moduller/kartlar/defter.mjs';

let S; let saglayici; let cagrilar = [];
const V = {};

before(async () => {
  /* Gecikmeli sahte sağlayıcı: her çağrıyı sayar, 120 ms sonra başarı döner. */
  saglayici = createServer(async (istek, yanit) => {
    const parcalar = []; for await (const p of istek) parcalar.push(p);
    cagrilar.push({ yol: istek.url, anahtar: istek.headers['idempotency-key'] });
    setTimeout(() => {
      yanit.writeHead(200, { 'content-type': 'application/json' });
      yanit.end(JSON.stringify({ referans: `PRV-${cagrilar.length}` }));
    }, 120);
  });
  await new Promise((c) => saglayici.listen(0, '127.0.0.1', c));
  process.env.GB_DENETIM02_SIR = 'test-sirri';

  S = await uygulamaBaslat();
  await kur(`http://127.0.0.1:${saglayici.address().port}`);
});
after(async () => {
  await S.kapat();
  await new Promise((c) => saglayici.close(c));
  delete process.env.GB_DENETIM02_SIR;
});

const olarak = async (eposta) => { const c = S.istemci(); await c.giris(eposta); return c; };

async function onayla(nesne, nesneId, tablo, istemciler) {
  const t = tek(`SELECT * FROM onay_talebi WHERE nesne=? AND nesne_id=? AND durum='acik'`, nesne, nesneId);
  assert.ok(t, `${nesne} için onay talebi açılmadı`);
  for (const c of istemciler) {
    if (tek(`SELECT durum FROM ${tablo} WHERE id = ?`, nesneId).durum === 'onaylandi') break;
    const guncel = tek('SELECT * FROM onay_talebi WHERE id = ?', t.id);
    if (guncel.durum !== 'acik') break;
    const y = await c.csrfIle(`/onaylar/${t.id}`,
      { karar: 'onayla', belgeSurum: String(guncel.belge_surum) });
    assert.ok(y.durum < 500, `${nesne} onayında ${y.durum}`);
  }
  return tek(`SELECT durum FROM ${tablo} WHERE id = ?`, nesneId).durum;
}

/** Sağlayıcı hesabı → kart → politika → onaylı parti zinciri (gerçek formlarla). */
async function kur(tabanUrl) {
  const finans = await olarak('finans@yapitas.demo');
  const proje = await olarak('proje@yapitas.demo');
  const ik = await olarak('ik@yapitas.demo');
  const sahip = await olarak('sahip@yapitas.demo');
  V.onaycilar = [proje, ik, sahip];
  V.finans = finans;

  const tenant = tek('SELECT * FROM tenant LIMIT 1');
  const pluxee = tek(`SELECT * FROM kart_saglayici WHERE tenant_id=? AND kod='PLUXEE'`, tenant.id);
  await finans.csrfIle('/kartlar/saglayicilar',
    { saglayiciId: pluxee.id, ad: 'D02 API hesabı', musteriNo: 'D02-API', paraBirimi: 'TRY' });
  V.hesap = tek(`SELECT * FROM saglayici_hesabi WHERE ad = 'D02 API hesabı'`);
  V.urun = tek(`SELECT * FROM kart_urunu WHERE kod = 'PLX-YEMEK'`);
  for (const [no, tok] of [['9001', 'D02-T1'], ['9002', 'D02-T2']]) {
    await finans.csrfIle('/kartlar/yeni', { hesapId: V.hesap.id, urunId: V.urun.id,
      maskeliNo: no, saglayiciToken: tok, _idempotency: `d02-${tok}` });
  }
  calistir(`UPDATE kart SET havuz = 1, durum = 'aktif' WHERE hesap_id = ?`, V.hesap.id);

  /* GERÇEK sağlayıcı API'si: taban adres + ortam değişkeninden çözülen sır (K-100). */
  calistir(`INSERT INTO entegrasyon (id, tenant_id, kod, ad, tur, saglayici_id, adaptor,
              taban_url, kimlik_referansi, olusturuldu) VALUES (?,?,?,?,?,?,?,?,?,?)`,
  'ent_d02', tenant.id, 'D02API', 'Denetim-02 sağlayıcısı', 'kart', pluxee.id, 'http',
  tabanUrl, 'GB_DENETIM02_SIR', Date.now());
  calistir('UPDATE saglayici_hesabi SET entegrasyon_id = ? WHERE id = ?', 'ent_d02', V.hesap.id);

  await finans.csrfIle('/kartlar/onaylar', { _eylem: 'politika_ac', urunId: V.urun.id,
    ad: 'D02 politika', gecerliBaslangic: '2026-01-01', gunKaynagi: 'sabit',
    sabitGun: '10', gunlukTutar: '100,00' });
  const pol = tek(`SELECT * FROM kart_politikasi WHERE ad = 'D02 politika'`);
  await finans.csrfIle('/kartlar/onaylar', { _eylem: 'politika_onaya', politikaId: pol.id });
  assert.equal(await onayla('kart_politikasi', pol.id, 'kart_politikasi', V.onaycilar), 'onaylandi');

  await finans.csrfIle('/kartlar/yuklemeler/yeni', { hesapId: V.hesap.id, urunId: V.urun.id,
    donem: '2026-09', kaynak: 'sabit', _idempotency: 'd02-parti' });
  V.parti = tek(`SELECT * FROM kart_yukleme_partisi WHERE hesap_id = ?`, V.hesap.id);
  assert.ok(V.parti, 'parti açılmadı');
  await finans.csrfIle(`/kartlar/yuklemeler/${V.parti.id}`, { _eylem: 'dogrula' });
  await finans.csrfIle(`/kartlar/yuklemeler/${V.parti.id}`, { _eylem: 'onaya_gonder' });
  await onayla('kart_yukleme', V.parti.id, 'kart_yukleme_partisi', V.onaycilar);
  assert.equal(tek('SELECT durum FROM kart_yukleme_partisi WHERE id = ?', V.parti.id).durum,
    'onay_bekliyor', 'onay gönderim sayıldı (K-096)');
}

describe('D-09 / D-12 — sağlayıcı başarısı deftere yazılır, mükerrer çağrı bozmaz', () => {
  test('aynı partiye AYNI ANDA iki gönderim: sağlayıcıya TEK çağrı gider', async () => {
    const y = await Promise.all([
      V.finans.csrfIle(`/kartlar/yuklemeler/${V.parti.id}`, { _eylem: 'gonder' }),
      V.finans.csrfIle(`/kartlar/yuklemeler/${V.parti.id}`, { _eylem: 'gonder' }),
    ]);
    for (const r of y) assert.ok(r.durum < 500, `gönderim ${r.durum} döndü`);
    assert.equal(cagrilar.filter((c) => c.yol === '/yukleme').length, 1,
      'sağlayıcıya ikinci yükleme çağrısı gitti — çift çekim');
  });

  test('D-09 — başarılı gönderim KART DEFTERİNE yazar, bakiye defterden üretilir', () => {
    const satirlar = sorgu('SELECT * FROM kart_yukleme_satiri WHERE parti_id = ?', V.parti.id);
    assert.ok(satirlar.length, 'parti satırsız');
    for (const s of satirlar) {
      assert.equal(s.durum, 'basarili', `satır durumu ${s.durum}`);
      assert.ok(s.hareket_id, 'başarılı satır defter hareketi üretmedi (D-09)');
    }
    const hareketler = sorgu(
      `SELECT * FROM kart_hareketi WHERE kaynak_nesne = 'kart_yukleme_partisi' AND kaynak_id = ?`,
      V.parti.id);
    assert.equal(hareketler.length, satirlar.length, 'defter satır sayısı tutmuyor');

    /* Bakiye defterden türer ve parti toplamıyla birebir eşleşir (kural 7). */
    const defterToplami = sorgu('SELECT id FROM kart WHERE hesap_id = ?', V.hesap.id)
      .reduce((t, k) => t + kdefter.bakiye(k.id), 0);
    assert.equal(defterToplami, Number(V.parti.toplam_minor),
      'kart bakiyeleri toplamı parti tutarını vermiyor');
    assert.ok(defterToplami > 0, 'bakiye sıfır — para kartlara girmemiş');
  });

  test('D-12 — parti durumu satır durumlarıyla TUTARLI (mükerrer çağrı bozmadı)', () => {
    const p = tek('SELECT durum FROM kart_yukleme_partisi WHERE id = ?', V.parti.id);
    const durumlar = new Set(sorgu('SELECT durum FROM kart_yukleme_satiri WHERE parti_id = ?',
      V.parti.id).map((s) => s.durum));
    assert.deepEqual([...durumlar], ['basarili'], 'satır durumları ayrıştı');
    assert.equal(p.durum, 'basarili',
      `satırların hepsi başarılıyken parti "${p.durum}" — ekran ile veri ayrıştı (D-12)`);
  });

  test('aynı satır ikinci kez muhasebeleşmez (tekrar gönderim reddedilir)', async () => {
    const once = sorgu(`SELECT id FROM kart_hareketi WHERE kaynak_id = ?`, V.parti.id).length;
    const y = await V.finans.csrfIle(`/kartlar/yuklemeler/${V.parti.id}`, { _eylem: 'tekrar' });
    assert.equal(y.durum, 409, 'sonuçlanmış partide tekrar açıldı');
    assert.equal(sorgu(`SELECT id FROM kart_hareketi WHERE kaynak_id = ?`, V.parti.id).length, once,
      'tekrar denemesi ikinci kez muhasebeleşti');
  });
});
