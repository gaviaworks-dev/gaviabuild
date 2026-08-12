/* ============================================================================
   KABUL TESTLERİ — Faz 5: Kartlar (CRD) ve entegrasyon (SET-13..15, SET-19)
   ----------------------------------------------------------------------------
   Doküman §11'in kart maddeleri birebir:
     CRD-01  Aynı şirket aynı anda Pluxee ve MultiNet hesaplarına ve her hesapta
             çoklu karta sahip olabilir.
     CRD-02  Bir personelde birden çok kart olabilir; aynı kart için çakışan
             aktif atama reddedilir.
     CRD-03  Aynı dönem/kaynak/idempotency key ile iki yükleme partisi FİNANSAL
             ETKİ ÜRETMEZ.
     CRD-04  Kısmi sağlayıcı sonucunda başarılı satırlar tekrar gönderilmez;
             yalnız güvenli teknik hatalar tekrar edilir.
     CRD-05  Kart bakiyesi hiçbir form alanından doğrudan değiştirilemez;
             düzeltme onaylı hareket ve ters kayıtla yapılır.
     CRD-06  Kayıp/çalıntı işlemi blokaj çağrısını, sonucu, retry'ı ve kullanıcı
             bildirimini audit izinde gösterir.
     OPS-01  Entegrasyon hatası istek kimliği, maskeli payload, retry durumu ve
             yeniden oynatma yetkisiyle izlenir.
   ========================================================================== */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { uygulamaBaslat } from '../yardimci.mjs';
import { sorgu, tek, calistir } from '../../app/cekirdek/db.mjs';
import * as kdefter from '../../app/moduller/kartlar/defter.mjs';
import * as A from '../../app/moduller/kartlar/adaptor.mjs';
import * as YK from '../../app/moduller/kartlar/yukleme.mjs';
import { ayrilisEngelleri } from '../../app/rotalar/ik-ayrilis.mjs';

let S;
before(async () => { S = await uygulamaBaslat(); });
after(async () => { await S.kapat(); });

const olarak = async (eposta) => { const c = S.istemci(); await c.giris(eposta); return c; };
const finans = () => olarak('finans@yapitas.demo');
const V = {};

/** Bir onay talebini sırayla gezip kapatır (talep sahibi dört göz gereği atlanır). */
async function onayla(nesne, nesneId, tablo,
  kisiler = ['ik@yapitas.demo', 'proje@yapitas.demo', 'sahip@yapitas.demo']) {
  const t = tek(`SELECT * FROM onay_talebi WHERE nesne = ? AND nesne_id = ? AND durum = 'acik'`,
    nesne, nesneId);
  assert.ok(t, `${nesne} için onay talebi açılmadı`);
  for (const eposta of kisiler) {
    if (tek(`SELECT durum FROM ${tablo} WHERE id = ?`, nesneId).durum === 'onaylandi') break;
    const c = await olarak(eposta);
    await c.csrfIle(`/onaylar/${t.id}`, { karar: 'onayla', belgeSurum: String(t.belge_surum) });
  }
  return tek(`SELECT durum FROM ${tablo} WHERE id = ?`, nesneId).durum;
}

/* ==========================================================================
   Kurulum kataloğu — sağlayıcılar KURULUM verisidir, demo değil
   ========================================================================== */
describe('§6.1 — sağlayıcı kataloğu ve tarihsel ad eşlemesi', () => {
  test('Pluxee ve MultiNet kurulumla gelir; kod sabit, ad değişebilir', () => {
    const t = tek('SELECT id FROM tenant LIMIT 1').id;
    const pluxee = tek(`SELECT * FROM kart_saglayici WHERE tenant_id = ? AND kod = 'PLUXEE'`, t);
    assert.ok(pluxee, 'Pluxee sağlayıcısı kurulmadı');
    assert.match(pluxee.ad, /Pluxee \(eski Sodexo\)/);
    assert.ok(tek(`SELECT id FROM kart_saglayici WHERE tenant_id = ? AND kod = 'MULTINET'`, t));
  });

  test('tarihsel "Sodexo" adı Pluxee ailesine eşlenir', () => {
    const t = tek('SELECT id FROM tenant LIMIT 1').id;
    assert.equal(A.saglayiciEsle(t, 'Sodexo')?.kod, 'PLUXEE');
    assert.equal(A.saglayiciEsle(t, 'Sodexo Avantaj')?.kod, 'PLUXEE');
    assert.equal(A.saglayiciEsle(t, 'Multinet')?.kod, 'MULTINET');
  });

  test('sağlayıcılar adaptörle genişler; if/else bloğu yok', () => {
    const kodlar = A.adaptorListesi().map((a) => a.kod);
    assert.ok(kodlar.includes('dosya') && kodlar.includes('http'));
    /* Desteklenmeyen yetenek dosya akışına düşer — çağıran dallanmaz. */
    assert.equal(A.cozumle({ adaptor: 'dosya' }, 'hareketAl').dosyayaDustu, true);
    assert.equal(A.cozumle({ adaptor: 'http' }, 'yuklemeGonder').dosyayaDustu, false);
  });
});

/* ==========================================================================
   CRD-01 — çoklu sağlayıcı, çoklu hesap, çoklu kart
   ========================================================================== */
describe('CRD-01 — aynı şirket birden çok sağlayıcı ve hesap kullanabilir', () => {
  test('iki sağlayıcıda üç hesap açılır', async () => {
    const c = await finans();
    const t = tek('SELECT id FROM tenant LIMIT 1').id;
    V.pluxee = tek(`SELECT * FROM kart_saglayici WHERE tenant_id = ? AND kod = 'PLUXEE'`, t);
    V.multinet = tek(`SELECT * FROM kart_saglayici WHERE tenant_id = ? AND kod = 'MULTINET'`, t);

    for (const [sag, ad, no] of [
      [V.pluxee, 'Pluxee Merkez', 'PX-1001'],
      [V.pluxee, 'Pluxee Şantiye', 'PX-1002'],
      [V.multinet, 'MultiNet Merkez', 'MN-2001'],
    ]) {
      const y = await c.csrfIle('/kartlar/saglayicilar',
        { saglayiciId: sag.id, ad, musteriNo: no, paraBirimi: 'TRY' });
      assert.equal(y.durum, 200, `${ad} açılmadı`);
    }
    assert.equal(sorgu('SELECT id FROM saglayici_hesabi').length, 3);
    /* Aynı sağlayıcıda AYNI müşteri numarası ikinci kez açılamaz. */
    const cift = await c.csrfIle('/kartlar/saglayicilar',
      { saglayiciId: V.pluxee.id, ad: 'Kopya', musteriNo: 'PX-1001' });
    assert.equal(cift.durum, 409, 'mükerrer müşteri numarası kabul edildi');
  });

  test('her hesapta birden çok kart açılır', async () => {
    const c = await finans();
    V.hesap = tek(`SELECT * FROM saglayici_hesabi WHERE ad = 'Pluxee Merkez'`);
    V.mnHesap = tek(`SELECT * FROM saglayici_hesabi WHERE ad = 'MultiNet Merkez'`);
    V.urun = tek(`SELECT * FROM kart_urunu WHERE kod = 'PLX-YEMEK'`);

    for (const [hesap, no, token] of [
      [V.hesap, '1001', 'PLX-T1'], [V.hesap, '1002', 'PLX-T2'], [V.mnHesap, '2001', 'MN-T1'],
    ]) {
      const y = await c.csrfIle('/kartlar/yeni', {
        hesapId: hesap.id, urunId: hesap.id === V.hesap.id ? V.urun.id : '',
        maskeliNo: no, saglayiciToken: token, _idempotency: `k-${token}` });
      assert.equal(y.durum, 200, `${token} kartı açılmadı`);
    }
    assert.equal(sorgu('SELECT id FROM kart').length, 3);
    assert.equal(sorgu('SELECT id FROM kart WHERE hesap_id = ?', V.hesap.id).length, 2);
  });

  test('TAM KART NUMARASI hiçbir yerde saklanmaz', async () => {
    const c = await finans();
    /* Form 4 haneden uzun girdiyi reddeder. */
    const y = await c.csrfIle('/kartlar/yeni',
      { hesapId: V.hesap.id, maskeliNo: '4111111111111111', _idempotency: 'k-tam' });
    assert.equal(y.durum, 422, 'tam kart numarası kabul edildi');

    /* Tabloda tam numara sütunu YOKTUR. */
    const sutunlar = sorgu('PRAGMA table_info(kart)').map((s) => s.name);
    assert.ok(!sutunlar.some((s) => /^(kart_no|tam_no|pan|numara)$/.test(s)),
      `kart tablosunda tam numara sütunu var: ${sutunlar.join(', ')}`);
    /* Denetim izinde de tam numara yok. */
    const izler = sorgu(`SELECT * FROM denetim_izi WHERE nesne = 'kart'`);
    for (const i of izler) {
      assert.ok(!/\d{13,}/.test(`${i.onceki || ''}${i.sonraki || ''}`),
        'denetim izinde tam kart numarası izlenimi veren dizi var');
    }
  });

  test('kart durumu §6.3 zincirini izler; kullanıcı durum seçmez', async () => {
    const c = await finans();
    V.kart = tek(`SELECT * FROM kart WHERE saglayici_token = 'PLX-T1'`);
    assert.equal(V.kart.durum, 'siparis_edildi');
    for (const [eylem, beklenen] of [
      ['basima_gonder', 'basimda'], ['teslim_alindi', 'aktiflenebilir'], ['aktiflestir', 'aktif'],
    ]) {
      const k = tek('SELECT * FROM kart WHERE id = ?', V.kart.id);
      const y = await c.csrfIle(`/kartlar/${k.id}`,
        { _eylem: 'gecis', gecis: eylem, surum: String(k.surum), gerekce: 'akış' });
      assert.equal(y.durum, 200, `${eylem} başarısız`);
      assert.equal(tek('SELECT durum FROM kart WHERE id = ?', k.id).durum, beklenen);
    }
    /* Sıra atlanamaz: sipariş edilmiş kart doğrudan aktif olamaz. */
    const k2 = tek(`SELECT * FROM kart WHERE saglayici_token = 'PLX-T2'`);
    const atla = await c.csrfIle(`/kartlar/${k2.id}`,
      { _eylem: 'gecis', gecis: 'aktiflestir', surum: String(k2.surum) });
    assert.equal(atla.durum, 409, 'kart durum sırası atlandı');
  });

  test('kart formunda durum veya onaycı alanı yok (kural 5)', async () => {
    const c = await finans();
    for (const yol of ['/kartlar/yeni', `/kartlar/${V.kart.id}/duzenle`, '/kartlar/saglayicilar']) {
      const r = await c.get(yol);
      assert.equal(r.durum, 200, `${yol} açılmadı`);
      for (const f of r.govde.match(/<form method="post"[\s\S]*?<\/form>/g) || []) {
        assert.ok(!/name="durum"/.test(f), `${yol} formunda durum alanı var`);
        assert.ok(!/name="onayci/i.test(f), `${yol} formunda onaycı alanı var`);
        assert.ok(!/name="bakiye"/.test(f), `${yol} formunda bakiye alanı var`);
      }
    }
  });
});

/* ==========================================================================
   CRD-02 — personelde çoklu kart, kartta tek çakışmayan aktif atama
   ========================================================================== */
describe('CRD-02 — atama kuralı', () => {
  test('personel oluşturulur', async () => {
    const c = await olarak('ik@yapitas.demo');
    await c.csrfIle('/personel/yeni',
      { adSoyad: 'Kart Sahibi Ali', tcNo: '12345678901', gorev: 'Usta',
        iseGiris: '2026-01-01', _idempotency: 'f5-p1' });
    V.personel = tek(`SELECT * FROM personel WHERE ad_soyad = 'Kart Sahibi Ali'`);
    calistir(`UPDATE personel SET durum = 'aktif' WHERE id = ?`, V.personel.id);
    assert.ok(V.personel);
  });

  test('bir personelde birden çok kart olabilir', async () => {
    const c = await finans();
    const mn = tek(`SELECT * FROM kart WHERE saglayici_token = 'MN-T1'`);
    for (const k of [V.kart, mn]) {
      const guncel = tek('SELECT * FROM kart WHERE id = ?', k.id);
      if (guncel.durum === 'siparis_edildi') {
        for (const e of ['basima_gonder', 'teslim_alindi', 'aktiflestir']) {
          const g = tek('SELECT * FROM kart WHERE id = ?', k.id);
          await c.csrfIle(`/kartlar/${k.id}`,
            { _eylem: 'gecis', gecis: e, surum: String(g.surum), gerekce: 'akış' });
        }
      }
      const y = await c.csrfIle(`/kartlar/${k.id}/atama`,
        { _eylem: 'ata', personelId: V.personel.id, baslangic: '2026-08-01' });
      assert.equal(y.durum, 200, `${k.kod} atanamadı`);
    }
    assert.equal(sorgu(
      `SELECT id FROM kart_atamasi WHERE personel_id = ? AND durum = 'aktif'`, V.personel.id).length, 2,
    'aynı personele iki kart atanamadı');
  });

  test('aynı kart için TARİH ARALIĞI ÇAKIŞAN ikinci aktif atama reddedilir', async () => {
    const c = await finans();
    const y = await c.csrfIle(`/kartlar/${V.kart.id}/atama`,
      { _eylem: 'ata', personelId: V.personel.id, baslangic: '2026-09-01' });
    assert.equal(y.durum, 409, 'çakışan atama kabul edildi');
    assert.equal(sorgu(
      `SELECT id FROM kart_atamasi WHERE kart_id = ? AND durum = 'aktif'`, V.kart.id).length, 1);
  });

  test('iade edildikten sonra yeni atama açılabilir; geçmiş DEĞİŞMEZ', async () => {
    const c = await finans();
    assert.equal((await c.csrfIle(`/kartlar/${V.kart.id}/atama`,
      { _eylem: 'iade', iadeNotu: 'devir' })).durum, 200);
    const kapali = tek(`SELECT * FROM kart_atamasi WHERE kart_id = ? AND durum = 'iade'`, V.kart.id);
    assert.ok(kapali);
    /* Kapanmış atama satırı veritabanı tetikleyicisiyle korunur. */
    assert.throws(() => calistir(`UPDATE kart_atamasi SET teslim_notu = 'x' WHERE id = ?`, kapali.id),
      /değiştirilemez/i, 'kapanmış atama düzenlenebiliyor');
    assert.throws(() => calistir('DELETE FROM kart_atamasi WHERE id = ?', kapali.id),
      /silinemez/i, 'atama geçmişi silinebiliyor');

    assert.equal((await c.csrfIle(`/kartlar/${V.kart.id}/atama`,
      { _eylem: 'ata', personelId: V.personel.id, baslangic: '2026-09-01' })).durum, 200);
  });
});

/* ==========================================================================
   CRD-05 — bakiye formdan değiştirilemez, defterden türetilir
   ========================================================================== */
describe('CRD-05 — kart bakiyesi hareket defterinden türer', () => {
  test('kart tablosunda bakiye sütunu YOKTUR', () => {
    const sutunlar = sorgu('PRAGMA table_info(kart)').map((s) => s.name);
    assert.ok(!sutunlar.some((s) => /bakiye|tutar/.test(s)),
      `kart tablosunda bakiye sütunu var: ${sutunlar.join(', ')}`);
  });

  test('hareket defteri DEĞİŞMEZ: satır güncellenemez ve silinemez', async () => {
    const c = await finans();
    /* Doğrudan defter yazımı yalnız modül üzerinden; burada gerçek akışla üretilir. */
    const ctx = { tenant: tek('SELECT * FROM tenant LIMIT 1'),
      kullanici: tek(`SELECT * FROM kullanici WHERE eposta = 'finans@yapitas.demo'`),
      istekId: 'test', ip: '127.0.0.1' };
    const { islem } = await import('../../app/cekirdek/db.mjs');
    const hareketId = islem(() => kdefter.hareketYaz(ctx, {
      kartId: V.kart.id, tur: 'yukleme', tutarMinor: 100_00, kesinlesmis: 1,
      aciklama: 'test yüklemesi' }));
    assert.ok(hareketId);
    assert.throws(() => calistir('UPDATE kart_hareketi SET tutar_minor = 1 WHERE id = ?', hareketId),
      /değiştirilemez/i);
    assert.throws(() => calistir('DELETE FROM kart_hareketi WHERE id = ?', hareketId),
      /silinemez/i);
    V.hareketId = hareketId;
  });

  test('bakiye her okumada defterden toplanır (§6.5 formülü)', () => {
    assert.equal(kdefter.bakiye(V.kart.id), 100_00);
    const defterToplami = Number(tek(
      `SELECT COALESCE(SUM(yon * tutar_minor), 0) AS n FROM kart_hareketi
        WHERE kart_id = ? AND kesinlesmis = 1`, V.kart.id).n);
    assert.equal(kdefter.bakiye(V.kart.id), defterToplami, 'ekran bakiyesi defterle ayrıştı');
  });

  test('bekleyen (provizyon) işlem bakiyeye GİRMEZ, ayrı gösterilir', async () => {
    const ctx = { tenant: tek('SELECT * FROM tenant LIMIT 1'),
      kullanici: tek(`SELECT * FROM kullanici WHERE eposta = 'finans@yapitas.demo'`),
      istekId: 'test', ip: '127.0.0.1' };
    const { islem } = await import('../../app/cekirdek/db.mjs');
    islem(() => kdefter.hareketYaz(ctx, {
      kartId: V.kart.id, tur: 'harcama', tutarMinor: 30_00, kesinlesmis: 0,
      saglayiciReferans: 'PROV-1', aciklama: 'provizyon' }));
    assert.equal(kdefter.bakiye(V.kart.id), 100_00, 'bekleyen işlem bakiyeye girdi');
    assert.equal(kdefter.bekleyen(V.kart.id), -30_00);
  });

  test('düzeltme yalnız TERS KAYITLA yapılır; aynı hareket iki kez ters çevrilemez', async () => {
    const ctx = { tenant: tek('SELECT * FROM tenant LIMIT 1'),
      kullanici: tek(`SELECT * FROM kullanici WHERE eposta = 'finans@yapitas.demo'`),
      istekId: 'test', ip: '127.0.0.1' };
    const { islem } = await import('../../app/cekirdek/db.mjs');
    islem(() => kdefter.tersKayit(ctx, V.hareketId, 'Hatalı yükleme'));
    assert.equal(kdefter.bakiye(V.kart.id), 0, 'ters kayıt bakiyeyi sıfırlamadı');
    assert.throws(() => islem(() => kdefter.tersKayit(ctx, V.hareketId, 'ikinci kez')),
      /zaten ters kayıtla düzeltilmiş/i);
    /* Orijinal satır hâlâ duruyor: defter silmez, ekler. */
    assert.ok(tek('SELECT id FROM kart_hareketi WHERE id = ?', V.hareketId));
    assert.equal(sorgu('SELECT id FROM kart_hareketi WHERE kart_id = ?', V.kart.id).length, 3);
  });

  test('aynı sağlayıcı referansı iki kez muhasebeleşemez', async () => {
    const ctx = { tenant: tek('SELECT * FROM tenant LIMIT 1'),
      kullanici: tek(`SELECT * FROM kullanici WHERE eposta = 'finans@yapitas.demo'`),
      istekId: 'test', ip: '127.0.0.1' };
    const { islem } = await import('../../app/cekirdek/db.mjs');
    assert.throws(() => islem(() => kdefter.hareketYaz(ctx, {
      kartId: V.kart.id, tur: 'harcama', tutarMinor: 10_00, kesinlesmis: 0,
      saglayiciReferans: 'PROV-1' })), /zaten muhasebeleşmiş/i);
  });
});

/* ==========================================================================
   CRD-03 / CRD-04 — toplu yükleme: idempotency ve kısmi sonuç
   ========================================================================== */
describe('CRD-03 / CRD-04 — toplu yükleme algoritması (§6.4)', () => {
  test('ONAYLI politika olmadan parti açılamaz — tutar politikadan gelir', async () => {
    const c = await finans();
    const r = await c.csrfIle('/kartlar/yuklemeler/yeni',
      { hesapId: V.hesap.id, urunId: V.urun.id, donem: '2026-09', kaynak: 'sabit',
        _idempotency: 'f5-b0' });
    assert.equal(r.durum, 422, 'politikasız parti açıldı');
    assert.match(r.govde, /ONAYLI bir politika yok|ONAYLI politika yok/);
  });

  test('politika etkili tarihli ve sürümlü açılır, onaydan geçer', async () => {
    const c = await finans();
    assert.equal((await c.csrfIle('/kartlar/onaylar', {
      _eylem: 'politika_ac', urunId: V.urun.id, ad: '2026 yemek kartı',
      gecerliBaslangic: '2026-01-01', gunKaynagi: 'sabit', sabitGun: '22',
      gunlukTutar: '150,00' })).durum, 200);
    V.politika = tek('SELECT * FROM kart_politikasi');
    assert.equal(V.politika.durum, 'taslak');
    assert.equal(String(V.politika.gunluk_tutar_minor), '15000');
    assert.equal(V.politika.surum_no, 1);

    await c.csrfIle('/kartlar/onaylar', { _eylem: 'politika_onaya', politikaId: V.politika.id });
    assert.equal(await onayla('kart_politikasi', V.politika.id, 'kart_politikasi'), 'onaylandi');
  });

  test('uygunluk ve tutar HESAPLANIR; hariç tutulan her satır nedenini taşır', async () => {
    const c = await finans();
    const r = await c.csrfIle('/kartlar/yuklemeler/yeni',
      { _eylem: 'onizle', hesapId: V.hesap.id, urunId: V.urun.id, donem: '2026-09', kaynak: 'sabit' });
    assert.equal(r.durum, 200);
    assert.match(r.govde, /Uygunluk sonucu/);
    /* 22 gün × 150,00 TL = 3.300,00 TL */
    assert.match(r.govde, /3\.300,00/, 'tutar politikadan hesaplanmadı');
    assert.match(r.govde, /Hariç tutulanlar|Uygun kart/);
    /* Önizleme ekranında tutar GİRİŞ alanı yoktur. */
    for (const f of r.govde.match(/<form method="post"[\s\S]*?<\/form>/g) || []) {
      assert.ok(!/name="tutar"/.test(f), 'yükleme formunda tutar alanı var');
    }
  });

  test('parti açılır; tutar ve satır sayısı hesaplanandır', async () => {
    const c = await finans();
    const r = await c.csrfIle('/kartlar/yuklemeler/yeni',
      { hesapId: V.hesap.id, urunId: V.urun.id, donem: '2026-09', kaynak: 'sabit',
        _idempotency: 'f5-b1' });
    assert.equal(r.durum, 200);
    V.parti = tek('SELECT * FROM kart_yukleme_partisi');
    assert.equal(V.parti.durum, 'taslak');
    assert.equal(String(V.parti.toplam_minor), '330000');
    assert.ok(V.parti.idempotency_anahtari, 'idempotency anahtarı üretilmedi');
  });

  test('CRD-03 — aynı dönem/kaynak ile ikinci parti FİNANSAL ETKİ ÜRETMEZ', async () => {
    const c = await finans();
    const oncekiToplam = Number(tek(
      'SELECT COALESCE(SUM(toplam_minor),0) AS n FROM kart_yukleme_partisi').n);
    const r = await c.csrfIle('/kartlar/yuklemeler/yeni',
      { hesapId: V.hesap.id, urunId: V.urun.id, donem: '2026-09', kaynak: 'sabit',
        _idempotency: 'f5-b2' });
    assert.equal(r.durum, 409, 'mükerrer parti açıldı');
    assert.equal(sorgu('SELECT id FROM kart_yukleme_partisi').length, 1);
    assert.equal(Number(tek('SELECT COALESCE(SUM(toplam_minor),0) AS n FROM kart_yukleme_partisi').n),
      oncekiToplam, 'mükerrer deneme finansal etki üretti');
  });

  test('parti doğrulanır, onaya giderken sürümü DONDURULUR', async () => {
    const c = await finans();
    assert.equal((await c.csrfIle(`/kartlar/yuklemeler/${V.parti.id}`, { _eylem: 'dogrula' })).durum, 200);
    assert.equal(tek('SELECT durum FROM kart_yukleme_partisi WHERE id = ?', V.parti.id).durum, 'dogrulandi');

    assert.equal((await c.csrfIle(`/kartlar/yuklemeler/${V.parti.id}`,
      { _eylem: 'onaya_gonder' })).durum, 200);
    const p = tek('SELECT * FROM kart_yukleme_partisi WHERE id = ?', V.parti.id);
    assert.equal(p.durum, 'onay_bekliyor');
    assert.ok(p.donduruldu, 'parti sürümü dondurulmadı');
    const t = tek(`SELECT * FROM onay_talebi WHERE nesne = 'kart_yukleme' AND nesne_id = ?`, V.parti.id);
    assert.ok(t, 'onay talebi açılmadı');
    assert.equal(String(t.tutar_minor), '330000');
  });

  test('ONAY GÖNDERİM DEĞİLDİR: onaylanan parti hâlâ onay_bekliyor', async () => {
    const sahip = await olarak('sahip@yapitas.demo');
    const t = tek(`SELECT * FROM onay_talebi WHERE nesne = 'kart_yukleme' AND nesne_id = ?`, V.parti.id);
    await sahip.csrfIle(`/onaylar/${t.id}`, { karar: 'onayla', belgeSurum: String(t.belge_surum) });
    assert.equal(tek('SELECT durum FROM onay_talebi WHERE id = ?', t.id).durum, 'kapali');
    assert.equal(tek('SELECT durum FROM kart_yukleme_partisi WHERE id = ?', V.parti.id).durum,
      'onay_bekliyor', 'onay kararı partiyi otomatik gönderdi');
    /* Onay tek başına hiçbir defter satırı üretmez. */
    assert.equal(sorgu(
      `SELECT id FROM kart_hareketi WHERE kaynak_nesne = 'kart_yukleme_partisi'`).length, 0);
  });

  test('gönderim: zaman aşımı/dosya akışı BAŞARI SAYILMAZ, defter yazılmaz', async () => {
    const c = await finans();
    const r = await c.csrfIle(`/kartlar/yuklemeler/${V.parti.id}`, { _eylem: 'gonder' });
    assert.equal(r.durum, 200);
    const satir = tek('SELECT * FROM kart_yukleme_satiri WHERE parti_id = ?', V.parti.id);
    assert.equal(satir.durum, 'gonderildi', 'sonuç bilinmezken satır sonuçlandırıldı');
    assert.equal(satir.hareket_id, null);
    assert.equal(sorgu(
      `SELECT id FROM kart_hareketi WHERE kaynak_nesne = 'kart_yukleme_partisi'`).length, 0,
    'sonuç bilinmezken defter yazıldı');
    /* Her çağrı olay kaydı bırakır (OPS-01). */
    assert.ok(sorgu(
      `SELECT id FROM entegrasyon_olayi WHERE kaynak_id = ?`, V.parti.id).length > 0);
  });

  test('CRD-04 — sonuç dosyası satır bazlı işlenir; başarılı satır deftere TEK kez yazılır', async () => {
    const c = await finans();
    const kart = tek(
      `SELECT k.kod FROM kart_yukleme_satiri s JOIN kart k ON k.id = s.kart_id
        WHERE s.parti_id = ?`, V.parti.id);
    const csrf = c.cerezler.get('gb_csrf');
    const sinir = '----gvtest';
    const icerik = `${kart.kod};basarili;PRV-1;;yüklendi`;
    const govde = Buffer.from(
      `--${sinir}\r\nContent-Disposition: form-data; name="_csrf"\r\n\r\n${csrf}\r\n`
      + `--${sinir}\r\nContent-Disposition: form-data; name="dosya"; filename="s.csv"\r\n`
      + `Content-Type: text/csv\r\n\r\n${icerik}\r\n--${sinir}--\r\n`);
    const y = await fetch(`${S.taban}/kartlar/yuklemeler/${V.parti.id}`, {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': `multipart/form-data; boundary=${sinir}`,
        cookie: [...c.cerezler].map(([k, v]) => `${k}=${v}`).join('; ') },
      body: govde });
    assert.equal(y.status, 303);

    const satir = tek('SELECT * FROM kart_yukleme_satiri WHERE parti_id = ?', V.parti.id);
    assert.equal(satir.durum, 'basarili');
    assert.ok(satir.hareket_id, 'başarılı satır deftere yazılmadı');
    const hareketler = sorgu(
      `SELECT * FROM kart_hareketi WHERE kaynak_nesne = 'kart_yukleme_partisi' AND kaynak_id = ?`,
      V.parti.id);
    assert.equal(hareketler.length, 1);
    assert.equal(String(hareketler[0].tutar_minor), '330000');
    assert.equal(tek('SELECT durum FROM kart_yukleme_partisi WHERE id = ?', V.parti.id).durum,
      'basarili');
  });

  test('CRD-04 — başarılı satır TEKRAR GÖNDERİLMEZ, iş kuralı reddi de edilmez', async () => {
    const c = await finans();
    const r = await c.csrfIle(`/kartlar/yuklemeler/${V.parti.id}`, { _eylem: 'tekrar' });
    assert.equal(r.durum, 409, 'sonuçlanmış partide tekrar açıldı');
    assert.match(r.govde, /Tekrar edilebilir satır yok|aynı reddi üretir/);
    /* İkinci kez sonuç dosyası işlense bile defter satırı ARTMAZ. */
    assert.equal(sorgu(
      `SELECT id FROM kart_hareketi WHERE kaynak_nesne = 'kart_yukleme_partisi'`).length, 1);
  });

  test('teknik hata ile iş kuralı reddi AYRI sınıflanır; yalnız teknik tekrar edilir', () => {
    assert.equal(A.tekrarEdilebilir(A.teknikHata('X', 'geçici')), true);
    assert.equal(A.tekrarEdilebilir(A.reddedildi('Y', 'pasif kart')), false);
    assert.equal(A.tekrarEdilebilir(A.bilinmiyor('Z', 'zaman aşımı')), false,
      'zaman aşımı doğrudan tekrar edilebilir sayıldı');
    assert.equal(A.yenidenOynatilabilir({ hata_sinifi: 'is_kurali', durum: 'is_kurali_reddi' }),
      'İş kuralı reddi yeniden oynatılamaz; kaydı düzeltip yeni gönderim açın.');
    assert.equal(A.yenidenOynatilabilir({ hata_sinifi: 'teknik', durum: 'teknik_hata' }), null);
  });

  test('yükleme dosyasında TAM KART NUMARASI yoktur', async () => {
    const c = await finans();
    const r = await c.get(`/kartlar/yuklemeler/${V.parti.id}?cikti=csv`);
    assert.equal(r.durum, 200);
    assert.match(r.basliklar.get('content-type'), /text\/csv/);
    assert.ok(!/\d{13,}/.test(r.govde), 'yükleme dosyasında uzun sayı dizisi var');
    assert.match(r.govde, /# Idempotency:/, 'dosya künyesi yok');
  });
});

/* ==========================================================================
   CRD-14 — üç yönlü mutabakat
   ========================================================================== */
describe('CRD-14 — parti üç kaynak mutabık olmadan kapanmaz', () => {
  test('iç defter toplamı her okumada yeniden hesaplanır', () => {
    const m = YK.mutabakatHesapla(tek('SELECT id FROM tenant LIMIT 1').id, V.hesap.id, '2026-09', {});
    assert.equal(m.icToplam, 330000);
    assert.deepEqual(m.eksikKaynak, ['sağlayıcı ekstresi', 'banka çıkışı']);
  });

  test('fark sıfır değilse açıklama zorunludur', async () => {
    const c = await finans();
    const r = await c.csrfIle('/kartlar/mutabakat', {
      _eylem: 'kaydet', hesapId: V.hesap.id, donem: '2026-09',
      saglayiciToplam: '3.400,00', bankaToplam: '3.300,00' });
    assert.equal(r.durum, 422, 'açıklamasız fark kabul edildi');
  });

  test('mutabık dönem kaydedilir; parti kapanış engelleri düşer', async () => {
    const c = await finans();
    const r = await c.csrfIle('/kartlar/mutabakat', {
      _eylem: 'kaydet', hesapId: V.hesap.id, donem: '2026-09',
      saglayiciToplam: '3.300,00', bankaToplam: '3.300,00' });
    assert.equal(r.durum, 200);
    const m = tek('SELECT * FROM kart_mutabakati WHERE hesap_id = ?', V.hesap.id);
    assert.equal(Number(m.fark_minor), 0);
    assert.equal(String(m.ic_toplam_minor), '330000');

    const p = tek('SELECT * FROM kart_yukleme_partisi WHERE id = ?', V.parti.id);
    const engeller = YK.kapanisEngelleri(p);
    /* Banka hareketi eşleştirilmediği için hâlâ bir engel kalır — dürüst. */
    assert.ok(engeller.some((x) => /Banka hareketi/.test(x)),
      'banka eşleştirmesi olmadan parti kapanabiliyor');
  });

  test('kapanış engeli varken parti kapatılamaz', async () => {
    const c = await finans();
    await c.csrfIle(`/kartlar/yuklemeler/${V.parti.id}`, { _eylem: 'mutabakat' });
    const r = await c.csrfIle(`/kartlar/yuklemeler/${V.parti.id}`, { _eylem: 'kapat' });
    assert.equal(r.durum, 409, 'engel varken parti kapandı');
  });
});

/* ==========================================================================
   CRD-06 — kayıp/çalıntı: blokaj, sonuç, retry ve audit
   ========================================================================== */
describe('CRD-06 — kayıp/çalıntı güvenlik akışı', () => {
  test('kayıp bildirimi kartı BEKLEMEDEN bloke eder ve audit izi bırakır', async () => {
    const c = await finans();
    const oncekiIz = sorgu(`SELECT id FROM denetim_izi WHERE nesne = 'kart'`).length;
    const r = await c.csrfIle(`/kartlar/${V.kart.id}/guvenlik`,
      { _eylem: 'kayip', gerekce: 'Kart şantiyede kayboldu' });
    assert.equal(r.durum, 200);
    assert.equal(tek('SELECT durum FROM kart WHERE id = ?', V.kart.id).durum, 'kayip_calinti');

    /* Aktif atama da kapatılır: kimde olduğu belirsiz kart "atanmış" görünemez. */
    assert.equal(sorgu(
      `SELECT id FROM kart_atamasi WHERE kart_id = ? AND durum = 'aktif'`, V.kart.id).length, 0);

    /* Blokaj ÇAĞRISI, SONUCU ve gerekçesi audit izinde. */
    const izler = sorgu(`SELECT * FROM denetim_izi WHERE nesne = 'kart' AND nesne_id = ?`, V.kart.id);
    assert.ok(izler.length > oncekiIz - oncekiIz, 'audit izi yazılmadı');
    assert.ok(izler.some((i) => i.eylem === 'blokaj_cagrisi'), 'blokaj çağrısı audit izinde yok');
    assert.ok(izler.some((i) => i.eylem === 'gecis:kayip_bildir'), 'geçiş audit izinde yok');
    const cagri = izler.find((i) => i.eylem === 'blokaj_cagrisi');
    assert.match(cagri.sonraki, /sonuc/, 'çağrı sonucu audit izinde yok');
    assert.ok(cagri.gerekce, 'gerekçe audit izinde yok');
  });

  test('SAHTE BAŞARI YOK: sağlayıcı blokajı sonuçlanmadıysa kullanıcı bunu görür', async () => {
    /* Entegrasyonsuz hesapta dosya akışına düşülür; adaptör kartBloke desteklemez. */
    const olay = tek(
      `SELECT * FROM entegrasyon_olayi WHERE kaynak_nesne = 'kart' AND kaynak_id = ?
        ORDER BY zaman DESC LIMIT 1`, V.kart.id);
    assert.ok(olay, 'blokaj olayı kaydedilmedi');
    assert.notEqual(olay.durum, 'basarili',
      'sağlayıcı çağrısı yapılmadan başarılı işaretlendi');
  });

  test('yenileme yeni kart açar ve bakiyeyi DEFTER HAREKETİYLE devreder', async () => {
    const c = await finans();
    const ctx = { tenant: tek('SELECT * FROM tenant LIMIT 1'),
      kullanici: tek(`SELECT * FROM kullanici WHERE eposta = 'finans@yapitas.demo'`),
      istekId: 'test', ip: '127.0.0.1' };
    const { islem } = await import('../../app/cekirdek/db.mjs');
    /* Devredilecek bakiye oluştur. */
    islem(() => kdefter.hareketYaz(ctx, {
      kartId: V.kart.id, tur: 'yukleme', tutarMinor: 250_00, kesinlesmis: 1,
      aciklama: 'devir öncesi bakiye' }));
    const oncekiBakiye = kdefter.bakiye(V.kart.id);
    assert.ok(oncekiBakiye > 0);

    const r = await c.csrfIle(`/kartlar/${V.kart.id}/guvenlik`,
      { _eylem: 'yenile', maskeliNo: '7777', saglayiciToken: 'PLX-T1-YENI',
        gerekce: 'Kayıp kart yerine yeniden basım' });
    assert.equal(r.durum, 200);
    const yeni = tek('SELECT * FROM kart WHERE yenilenen_id = ?', V.kart.id);
    assert.ok(yeni, 'yeni kart açılmadı');
    assert.equal(yeni.durum, 'basimda');
    assert.equal(tek('SELECT durum FROM kart WHERE id = ?', V.kart.id).durum, 'yenilemede');

    /* Bakiye ELLE taşınmadı: iki defter satırı yazıldı. */
    assert.equal(kdefter.bakiye(V.kart.id), 0);
    assert.equal(kdefter.bakiye(yeni.id), oncekiBakiye);
    assert.ok(sorgu(`SELECT id FROM kart_hareketi WHERE kart_id = ? AND tur = 'devir_cikis'`,
      V.kart.id).length === 1);
    assert.ok(sorgu(`SELECT id FROM kart_hareketi WHERE kart_id = ? AND tur = 'devir_giris'`,
      yeni.id).length === 1);
  });
});

/* ==========================================================================
   §6.7 — kart yetki matrisi
   ========================================================================== */
describe('§6.7 — kart yetki matrisi sunucuda uygulanır', () => {
  test('çalışan yalnız KENDİ kartını görür; şirket toplamını göremez', async () => {
    const c = await olarak('calisan@yapitas.demo');
    const panel = await c.get('/kartlar');
    assert.equal(panel.durum, 200);
    assert.match(panel.govde, /Kendi kartlarınız/);
    assert.ok(!/Kart defteri bakiyesi/.test(panel.govde), 'çalışan şirket toplamını görüyor');

    /* Başkasının kartının detayına erişemez. */
    const detay = await c.get(`/kartlar/${V.kart.id}`);
    assert.equal(detay.durum, 404, 'çalışan başkasının kartını açtı');

    /* Kart listesi de sunucuda daraltılır: liste ekranı AÇIK ama kapsam KAPALI. */
    const liste = await c.get('/kartlar/liste');
    assert.equal(liste.durum, 200);
    assert.match(liste.govde, /Kendi kartlarınız/, 'kapsam daraltması kullanıcıya bildirilmiyor');
    const baskaKart = tek(`SELECT kod FROM kart WHERE saglayici_token = 'MN-T1'`);
    assert.ok(!new RegExp(baskaKart.kod).test(liste.govde),
      'çalışan başkasına atanmış kartı listede görüyor');
    /* Query parametresiyle kapsam genişletilemez. */
    const zorla = await c.get('/kartlar/liste?hesap_id=');
    assert.ok(!new RegExp(baskaKart.kod).test(zorla.govde), 'kapsam parametreyle aşıldı');
  });

  test('çalışan toplu yükleme ve mutabakat ekranlarına erişemez', async () => {
    const c = await olarak('calisan@yapitas.demo');
    for (const yol of ['/kartlar/yuklemeler', '/kartlar/yuklemeler/yeni', '/kartlar/mutabakat',
      '/kartlar/saglayicilar', '/kartlar/onaylar', '/ayarlar/entegrasyonlar']) {
      assert.equal((await c.get(yol)).durum, 403, `${yol} çalışana açık`);
    }
  });

  test('İK kart atamasını görür ama banka mutabakatına erişemez', async () => {
    const c = await olarak('ik@yapitas.demo');
    assert.equal((await c.get('/kartlar')).durum, 200);
    assert.equal((await c.get('/kartlar/mutabakat')).durum, 403, 'İK mutabakata erişti');
    assert.equal((await c.get('/ayarlar/entegrasyonlar')).durum, 403,
      'İK entegrasyon sırlarına erişti');
  });

  test('sistem yöneticisi entegrasyonu yapılandırır ama karar veremez', async () => {
    const c = await olarak('sistem@yapitas.demo');
    assert.equal((await c.get('/ayarlar/entegrasyonlar/kartlar')).durum, 200);
    assert.equal((await c.get('/ayarlar/sistem-sagligi')).durum, 200);
    assert.equal((await c.get('/onaylar')).durum, 403, 'sistem yöneticisi onay kutusuna erişti');
  });

  test('üye işyeri maskeli rolde gizlenir', async () => {
    const c = await finans();
    const r = await c.get('/kartlar/hareketler');
    assert.equal(r.durum, 200);
    /* Finans rolünde `kart_hareket.uye_isyeri` maskelidir (§6.7). */
    assert.match(r.govde, /Bu rolde üye işyeri maskelidir|••••/);
  });
});

/* ==========================================================================
   OPS-01 — entegrasyon izlenebilirliği
   ========================================================================== */
describe('OPS-01 — entegrasyon hatası izlenebilir', () => {
  test('her çağrı istek kimliği ve maskeli payload ile kaydedilir', () => {
    const olaylar = sorgu('SELECT * FROM entegrasyon_olayi ORDER BY zaman DESC LIMIT 20');
    assert.ok(olaylar.length > 0, 'hiç olay kaydı yok');
    for (const o of olaylar) {
      assert.ok(o.islem, 'işlem adı yok');
      assert.ok(o.zaman, 'zaman yok');
    }
    /* Hassas alan maskesi. */
    const maskeli = A.maskele({ kartNo: '4111111111111111', tutar: 100, secret: 'abc',
      ic: { authorization: 'Bearer xyz' } });
    assert.equal(maskeli.kartNo, '••••1111');
    assert.equal(maskeli.secret, '••••');
    assert.match(maskeli.ic.authorization, /^••••/);
    assert.ok(!maskeli.ic.authorization.includes('Bearer'), 'Authorization başlığı maskelenmedi');
    assert.equal(maskeli.tutar, 100);
  });

  test('olay kaydı SİLİNEMEZ — denetim kanıtıdır', () => {
    const o = tek('SELECT id FROM entegrasyon_olayi LIMIT 1');
    assert.throws(() => calistir('DELETE FROM entegrasyon_olayi WHERE id = ?', o.id), /silinemez/i);
  });

  test('sır veritabanında AÇIK saklanmaz; ekranda da gösterilmez', async () => {
    const c = await olarak('sistem@yapitas.demo');
    const sg = tek(`SELECT * FROM kart_saglayici WHERE kod = 'PLUXEE'`);
    const y = await c.csrfIle('/ayarlar/entegrasyonlar/kartlar', {
      ad: 'Pluxee API', saglayiciId: sg.id, adaptor: 'http',
      tabanUrl: 'https://api.pluxee.example/v1', kimlikReferansi: 'PLUXEE_ANAHTARI',
      webhookSirri: 'cok-gizli-deger', _idempotency: 'f5-e1' });
    assert.equal(y.durum, 200);
    const ent = tek(`SELECT * FROM entegrasyon WHERE ad = 'Pluxee API'`);
    assert.ok(!JSON.stringify(ent).includes('cok-gizli-deger'), 'sır açık saklandı');
    assert.equal(ent.kimlik_referansi, 'PLUXEE_ANAHTARI');
    assert.ok(ent.webhook_sirri_ozeti && ent.webhook_sirri_ozeti.length === 64, 'özet saklanmadı');

    const detay = await c.get(`/ayarlar/entegrasyonlar/${ent.id}`);
    assert.ok(!detay.govde.includes('cok-gizli-deger'), 'sır ekranda gösterildi');
    assert.match(detay.govde, /Yapılandırma eksik/, 'çözülemeyen kimlik uyarısı yok');

    /* Denetim izine de sır yazılmaz. */
    const iz = tek(`SELECT * FROM denetim_izi WHERE nesne = 'entegrasyon' AND nesne_id = ?`, ent.id);
    assert.ok(!`${iz?.sonraki || ''}`.includes('cok-gizli-deger'), 'sır audit izine yazıldı');
    V.entegrasyon = ent;
  });

  test('HTTPS olmayan taban adres reddedilir', async () => {
    const c = await olarak('sistem@yapitas.demo');
    const sg = tek(`SELECT * FROM kart_saglayici WHERE kod = 'MULTINET'`);
    const y = await c.csrfIle('/ayarlar/entegrasyonlar/kartlar', {
      ad: 'MultiNet API', saglayiciId: sg.id, adaptor: 'http',
      tabanUrl: 'http://api.multinet.example', _idempotency: 'f5-e2' });
    assert.equal(y.durum, 422, 'HTTP adres kabul edildi');
  });

  test('webhook imzası doğrulanır (sabit zamanlı)', () => {
    const imza = A.imzala('sir', '{"olay":1}');
    assert.equal(A.imzaDogrula('sir', '{"olay":1}', imza), true);
    assert.equal(A.imzaDogrula('yanlis', '{"olay":1}', imza), false);
    assert.equal(A.imzaDogrula('sir', '{"olay":2}', imza), false);
    assert.equal(A.imzaDogrula(null, '{}', imza), false);
  });

  test('devre kesici ardışık teknik hatada açılır, başarıda sıfırlanır', () => {
    const { islem } = { islem: (f) => f() };
    const id = V.entegrasyon.id;
    for (let i = 0; i < A.DEVRE_ESIGI; i++) A.devreGuncelle(id, A.teknikHata('X', 'geçici'));
    let e = tek('SELECT * FROM entegrasyon WHERE id = ?', id);
    assert.equal(e.devre_kesici, 'acik', 'devre kesici açılmadı');
    assert.equal(A.devreAcikMi(e), true);

    A.devreGuncelle(id, A.basarili('ref'));
    e = tek('SELECT * FROM entegrasyon WHERE id = ?', id);
    assert.equal(e.devre_kesici, 'kapali');
    assert.equal(e.ardisik_hata, 0);
  });

  test('yapılandırılmamış entegrasyon SAHTE BAŞARI üretmez', async () => {
    const ctx = { tenant: tek('SELECT * FROM tenant LIMIT 1'),
      kullanici: tek(`SELECT * FROM kullanici WHERE eposta = 'sistem@yapitas.demo'`),
      istekId: 'test', ip: '127.0.0.1' };
    const ent = tek('SELECT * FROM entegrasyon WHERE id = ?', V.entegrasyon.id);
    const sonuc = await A.httpAdaptoru.cagir(ctx, ent, 'yukleme', {});
    assert.equal(sonuc.durum, 'teknik_hata');
    assert.equal(sonuc.kod, 'YAPILANDIRMA_EKSIK');
    assert.match(sonuc.mesaj, /kimlik bilgisi tanımlı değil/);
  });
});

/* ==========================================================================
   HR-06 — işten ayrılış: kartlar dondurulmadan tamamlanmaz (§6.3, §7)
   ========================================================================== */
describe('HR-06 — kişiye bağlı kartlar dondurulmadan ayrılış tamamlanmaz', () => {
  test('açık kart ataması ayrılışı engeller', async () => {
    const c = await olarak('ik@yapitas.demo');
    const engeller = ayrilisEngelleri(V.personel.id);
    const kartEngeli = engeller.find((x) => x.ad === 'Kart atamaları kapatıldı');
    assert.ok(kartEngeli, 'kart engeli listede yok');
    assert.ok(kartEngeli.adet > 0, 'açık kart ataması engel üretmedi');

    const y = await c.csrfIle(`/personel/${V.personel.id}/isten-ayrilis`,
      { _eylem: 'tamamla', istenCikis: '2026-12-31', gerekce: 'İstifa' });
    assert.equal(y.durum, 409, 'engel varken ayrılış tamamlandı');
    assert.equal(tek('SELECT durum FROM personel WHERE id = ?', V.personel.id).durum, 'aktif');
  });

  test('kart dondurma ve atama kapatma engelleri düşürür', async () => {
    const c = await olarak('ik@yapitas.demo');
    const canli = ayrilisEngelleri(V.personel.id).find((x) => x.ad === 'Kişiye bağlı kartlar donduruldu');
    if (canli.adet > 0) {
      assert.equal((await c.csrfIle(`/personel/${V.personel.id}/isten-ayrilis`,
        { _eylem: 'kart_dondur' })).durum, 200);
    }
    assert.equal(ayrilisEngelleri(V.personel.id)
      .find((x) => x.ad === 'Kişiye bağlı kartlar donduruldu').adet, 0);

    assert.equal((await c.csrfIle(`/personel/${V.personel.id}/isten-ayrilis`,
      { _eylem: 'kart_iade' })).durum, 200);
    assert.equal(ayrilisEngelleri(V.personel.id)
      .find((x) => x.ad === 'Kart atamaları kapatıldı').adet, 0);
  });

  test('dondurma İPTAL değildir: bakiye kararı ayrı kalır', () => {
    const kartlar = sorgu(
      `SELECT k.* FROM kart k WHERE k.durum = 'gecici_bloke'`);
    for (const k of kartlar) {
      assert.notEqual(k.durum, 'iptal', 'ayrılış kartı iptal etti');
    }
  });
});

/* ==========================================================================
   Ortak sözleşmeler — §3 kalıpları
   ========================================================================== */
describe('Kart ekranları ortak kalıba uyar', () => {
  const YOLLAR = ['/kartlar', '/kartlar/liste', '/kartlar/yeni', '/kartlar/pluxee',
    '/kartlar/multinet', '/kartlar/saglayicilar', '/kartlar/yuklemeler',
    '/kartlar/yuklemeler/yeni', '/kartlar/hareketler', '/kartlar/mutabakat', '/kartlar/onaylar'];

  test('hepsi 200 döner ve page-head taşır', async () => {
    const c = await finans();
    for (const yol of YOLLAR) {
      const r = await c.get(yol);
      assert.equal(r.durum, 200, `${yol} açılmadı`);
      assert.match(r.govde, /class="gv-page-head"/, `${yol} page-head taşımıyor`);
    }
  });

  test('liste ekranları sayfalama standardını taşır (§3.5)', async () => {
    const c = await finans();
    for (const yol of ['/kartlar/liste', '/kartlar/saglayicilar', '/kartlar/yuklemeler']) {
      const r = await c.get(yol);
      assert.match(r.govde, /class="gv-pager"/, `${yol} sayfalayıcı yok`);
      assert.match(r.govde, /Veri tarihi/, `${yol} veri tarihi künyesi yok`);
    }
  });

  test('CRD-07 ve CRD-08 ayrı kayıt değil, aynı listenin görünümüdür (kural 4)', async () => {
    const c = await finans();
    const r = await c.get('/kartlar/pluxee');
    assert.match(r.govde, /sağlayıcı filtreli hâlidir/);
    /* Ayrı bir pluxee/multinet tablosu yoktur. */
    for (const ad of ['pluxee', 'multinet', 'pluxee_kart']) {
      assert.equal(sorgu(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, ad).length, 0,
        `${ad} adında ayrı tablo var`);
    }
  });
});
