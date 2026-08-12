/* ============================================================================
   KABUL TESTLERİ — Faz 4c: varlık/filo (AST), İK finans etkili (HR), panolar (GLB)
   ----------------------------------------------------------------------------
   AST-01..10  araç ayrı tablo değil (`varlik.tur='arac'`), bakım iş emri ayrı
               tablo değil (`is_emri.varlik_id`); sayaç yalnız ileri gider;
               uygunsuz periyodik kontrol varlığı KULLANIM DIŞI bırakır (§7).
   HR-10..13   çakışan izin, mahsupsuz ikinci avans ve süresiz sağlık kaydı
               reddedilir; çalışan yalnız kendi kaydını görür (ABAC).
   GLB-02/03   panonun kendi kaydı yoktur; her sayı kaynak modülün canlı sorgusu.
   K-049       şantiye ve proje kapanış engelleri artık gerçek defterlere bağlı:
               stok bakiyesi, zimmet, kasa, hakediş, teminat ve bütçe.
   ========================================================================== */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { uygulamaBaslat } from '../yardimci.mjs';
import { sorgu, tek, calistir } from '../../app/cekirdek/db.mjs';
import { kapanisEngelleri, acikKapanisEngelleri } from '../../app/moduller/santiye/kapanis.mjs';
import { projeKapanisEngelleri } from '../../app/moduller/proje/kapanis.mjs';

let S;
before(async () => { S = await uygulamaBaslat(); });
after(async () => { await S.kapat(); });

const olarak = async (eposta) => { const c = S.istemci(); await c.giris(eposta); return c; };
const depo = () => olarak('depo@yapitas.demo');
const ik = () => olarak('ik@yapitas.demo');
const V = {};

/** Bir engel listesinde adı verilen kalemi bulur. */
const engel = (liste, ad) => liste.find((e) => e.ad === ad);

/* ==========================================================================
   AST-01..03 — varlık: araç `varlik` tablosunun bir görünümüdür (kural 4)
   ========================================================================== */
describe('AST-01..03 — varlık ve araç tek tabloda', () => {
  test('plakasız araç kaydedilemez', async () => {
    const c = await depo();
    const y = await c.csrfIle('/varliklar/yeni',
      { ad: 'Kamyon 1', tur: 'arac', sayacTuru: 'km', sayacDeger: '50000', _idempotency: 'f4c-a1' });
    assert.equal(y.durum, 422, 'plakasız araç kabul edildi');
  });

  test('araç kaydı `varlik` tablosuna yazılır ve /araclar görünümünde çıkar', async () => {
    const c = await depo();
    const y = await c.csrfIle('/varliklar/yeni', {
      ad: 'Kamyon 1', tur: 'arac', plaka: '34ABC01',
      sayacTuru: 'km', sayacDeger: '50000', _idempotency: 'f4c-a2' });
    assert.equal(y.durum, 200);
    V.arac = tek(`SELECT * FROM varlik WHERE ad = 'Kamyon 1'`);
    assert.ok(V.arac, 'araç varlik tablosuna yazılmadı');
    assert.equal(V.arac.tur, 'arac');
    /* İkinci bir "arac" tablosu YOKTUR — görünüm aynı kayıttan gelir. */
    assert.equal(sorgu(`SELECT name FROM sqlite_master WHERE type='table' AND name='arac'`).length, 0);

    const liste = await c.get('/araclar');
    assert.equal(liste.durum, 200);
    assert.match(liste.govde, /34ABC01/, 'araç görünümünde plaka yok');
  });

  test('sayaç GERİ alınamaz (AST-09)', async () => {
    const c = await depo();
    const geri = await c.csrfIle('/araclar/yakit',
      { varlikId: V.arac.id, sayacDeger: '49000', litre: '100' });
    assert.equal(geri.durum, 422, 'sayaç geri alındı');
    assert.equal(tek('SELECT sayac_deger FROM varlik WHERE id = ?', V.arac.id).sayac_deger, 50000);

    const ileri = await c.csrfIle('/araclar/yakit',
      { varlikId: V.arac.id, sayacDeger: '50500', litre: '120', tutar: '6.000,00' });
    assert.equal(ileri.durum, 200);
    assert.equal(tek('SELECT sayac_deger FROM varlik WHERE id = ?', V.arac.id).sayac_deger, 50500);
  });
});

/* ==========================================================================
   AST-04 — zimmet: bir varlıkta tek açık zimmet
   ========================================================================== */
describe('AST-04 — çakışan zimmet reddedilir', () => {
  test('personel oluşturulur ve varlık zimmetlenir', async () => {
    const c = await ik();
    await c.csrfIle('/personel/yeni',
      { adSoyad: 'Sürücü Ali', tcNo: '99999999999', gorev: 'Şoför',
        iseGiris: '2026-01-01', _idempotency: 'f4c-p1' });
    V.personel = tek(`SELECT * FROM personel WHERE ad_soyad = 'Sürücü Ali'`);
    assert.ok(V.personel);

    const d = await depo();
    const y = await d.csrfIle('/zimmetler', { varlikId: V.arac.id, personelId: V.personel.id });
    assert.equal(y.durum, 200);
    assert.equal(tek(`SELECT durum FROM zimmet WHERE varlik_id = ?`, V.arac.id).durum, 'zimmetli');
  });

  test('aynı varlık ikinci kez zimmetlenemez (409)', async () => {
    const d = await depo();
    const y = await d.csrfIle('/zimmetler', { varlikId: V.arac.id, personelId: V.personel.id });
    assert.equal(y.durum, 409, 'çakışan zimmet kabul edildi');
    assert.equal(sorgu(`SELECT id FROM zimmet WHERE varlik_id = ? AND durum = 'zimmetli'`, V.arac.id).length, 1);
  });

  test('zimmetli varlık satılamaz — geçiş motoru reddeder', async () => {
    const d = await depo();
    const v = tek('SELECT * FROM varlik WHERE id = ?', V.arac.id);
    const y = await d.csrfIle(`/varliklar/${v.id}`,
      { _eylem: 'gecis', gecis: 'sat', gerekce: 'Satış', surum: String(v.surum) });
    assert.equal(y.durum, 409);
    assert.notEqual(tek('SELECT durum FROM varlik WHERE id = ?', v.id).durum, 'satildi');
  });
});

/* ==========================================================================
   AST-05..07 — bakım ve periyodik kontrol (§7: "kullanım engeli ve bakım görevi")
   ========================================================================== */
describe('AST-05..07 — uygunsuz kontrol varlığı kullanım dışı bırakır', () => {
  test('bakım planı iş emrini `is_emri.varlik_id` üzerinden açar', async () => {
    const c = await depo();
    assert.equal((await c.csrfIle('/bakim-planlari',
      { varlikId: V.arac.id, ad: '10.000 km bakımı', periyotSayac: '10000' })).durum, 200);
    const plan = tek('SELECT * FROM bakim_plani WHERE varlik_id = ?', V.arac.id);
    assert.ok(plan);

    assert.equal((await c.csrfIle('/bakim-planlari', { _eylem: 'is_emri', planId: plan.id })).durum, 200);
    const emir = tek(`SELECT * FROM is_emri WHERE varlik_id = ? AND tur = 'bakim'`, V.arac.id);
    assert.ok(emir, 'bakım iş emri açılmadı');
    /* Ayrı bir "bakim_is_emri" tablosu YOKTUR (kural 4). */
    assert.equal(sorgu(`SELECT name FROM sqlite_master WHERE type='table' AND name='bakim_is_emri'`).length, 0);
  });

  test('"uygun değil" periyodik kontrol → varlık kullanım dışı + onarım iş emri', async () => {
    const c = await depo();
    const y = await c.csrfIle('/varlik-kontrolleri', {
      varlikId: V.arac.id, ad: 'Fenni muayene', tur: 'fenni',
      sonuc: 'uygun_degil', gecerlilik: '2027-01-01' });
    assert.equal(y.durum, 200);
    assert.equal(tek('SELECT durum FROM varlik WHERE id = ?', V.arac.id).durum, 'kullanim_disi',
      'uygunsuz kontrol varlığı kullanım dışı bırakmadı');
    assert.ok(tek(`SELECT id FROM is_emri WHERE varlik_id = ? AND tur = 'onarim'`, V.arac.id),
      'uygunsuz kontrol onarım iş emri açmadı');
  });
});

/* ==========================================================================
   AST-10 — araç olayı: kaza İSG olayı açar (§7 saha bildirimi → İSG)
   ========================================================================== */
describe('AST-10 — kaza kaydı İSG olayı üretir', () => {
  test('kaza türü araç olayı otomatik İSG olayı açar', async () => {
    const c = await depo();
    const oncesi = sorgu(`SELECT id FROM isg_olayi WHERE tur = 'kaza'`).length;
    const y = await c.csrfIle('/araclar/olaylar',
      { varlikId: V.arac.id, tur: 'kaza', yer: 'Şantiye girişi', aciklama: 'Manevra sırasında' });
    assert.equal(y.durum, 200);
    assert.equal(sorgu(`SELECT id FROM isg_olayi WHERE tur = 'kaza'`).length, oncesi + 1,
      'kaza İSG olayı üretmedi');
  });
});

/* ==========================================================================
   HR-10 — izin: çakışan tarih aralığı reddedilir; durum formdan seçilmez
   ========================================================================== */
describe('HR-10 — çakışan izin reddedilir, onay motorundan geçer', () => {
  test('izin kaydı gün sayısını hesaplar (formdan gelmez)', async () => {
    const c = await ik();
    const y = await c.csrfIle('/izinler',
      { personelId: V.personel.id, tur: 'yillik', baslangic: '2026-09-01', bitis: '2026-09-05' });
    assert.equal(y.durum, 200);
    V.izin = tek('SELECT * FROM izin WHERE personel_id = ?', V.personel.id);
    assert.equal(V.izin.durum, 'taslak', 'izin taslak dışında bir durumla açıldı');
    assert.equal(V.izin.gun_sayisi, 5);
  });

  test('tarihi çakışan ikinci izin 409 ile reddedilir', async () => {
    const c = await ik();
    const y = await c.csrfIle('/izinler',
      { personelId: V.personel.id, tur: 'yillik', baslangic: '2026-09-03', bitis: '2026-09-08' });
    assert.equal(y.durum, 409, 'çakışan izin kabul edildi');
    assert.equal(sorgu('SELECT id FROM izin WHERE personel_id = ?', V.personel.id).length, 1);
  });

  test('izin durumu yalnız onay motoruyla değişir', async () => {
    const c = await ik();
    assert.equal((await c.csrfIle('/izinler', { _eylem: 'onaya_gonder', izinId: V.izin.id })).durum, 200);
    assert.equal(tek('SELECT durum FROM izin WHERE id = ?', V.izin.id).durum, 'onaya_gonderildi');

    const t = tek(`SELECT * FROM onay_talebi WHERE nesne = 'izin' AND nesne_id = ?`, V.izin.id);
    assert.ok(t, 'izin için onay talebi açılmadı');
    const pm = await olarak('proje@yapitas.demo');
    await pm.csrfIle(`/onaylar/${t.id}`, { karar: 'onayla', belgeSurum: String(t.belge_surum) });
    assert.equal(tek('SELECT durum FROM izin WHERE id = ?', V.izin.id).durum, 'onaylandi');
  });
});

/* ==========================================================================
   HR-11 — avans: aktif olmayan personele avans yok, mahsupsuz ikinci avans yok
   ========================================================================== */
describe('HR-11 — avans mahsup zinciri', () => {
  test('aday personele avans açılamaz', async () => {
    const c = await ik();
    assert.equal(tek('SELECT durum FROM personel WHERE id = ?', V.personel.id).durum, 'aday');
    const y = await c.csrfIle('/avanslar', { personelId: V.personel.id, tutar: '5.000,00' });
    assert.equal(y.durum, 409, 'aday personele avans açıldı');
  });

  test('onaylı avans kasadan değil, tutarı formdan gelen tek kayıttan hesaplanır', async () => {
    calistir(`UPDATE personel SET durum = 'aktif' WHERE id = ?`, V.personel.id);
    const c = await ik();
    const y = await c.csrfIle('/avanslar',
      { personelId: V.personel.id, tutar: '5.000,00', mahsupDonem: '2026-10' });
    assert.equal(y.durum, 200);
    V.avans = tek('SELECT * FROM avans WHERE personel_id = ?', V.personel.id);
    assert.equal(String(V.avans.tutar_minor), '500000');   // 5.000,00 TL = 500000 kuruş
    assert.equal(V.avans.durum, 'taslak');

    await c.csrfIle('/avanslar', { _eylem: 'onaya_gonder', avansId: V.avans.id });
    const t = tek(`SELECT * FROM onay_talebi WHERE nesne = 'avans' AND nesne_id = ?`, V.avans.id);
    assert.ok(t);
    for (const eposta of ['proje@yapitas.demo', 'finans@yapitas.demo', 'sahip@yapitas.demo']) {
      if (tek('SELECT durum FROM avans WHERE id = ?', V.avans.id).durum === 'onaylandi') break;
      const k = await olarak(eposta);
      await k.csrfIle(`/onaylar/${t.id}`, { karar: 'onayla', belgeSurum: String(t.belge_surum) });
    }
    assert.equal(tek('SELECT durum FROM avans WHERE id = ?', V.avans.id).durum, 'onaylandi');
  });

  test('mahsup edilmemiş avans varken ikinci avans 409', async () => {
    const c = await ik();
    const y = await c.csrfIle('/avanslar', { personelId: V.personel.id, tutar: '1.000,00' });
    assert.equal(y.durum, 409, 'mahsupsuz ikinci avans açıldı');
  });

  test('mahsuptan sonra yeni avans açılabilir', async () => {
    const c = await ik();
    assert.equal((await c.csrfIle('/avanslar', { _eylem: 'mahsup', avansId: V.avans.id })).durum, 200);
    assert.ok(tek('SELECT mahsup_edildi FROM avans WHERE id = ?', V.avans.id).mahsup_edildi);
    const y = await c.csrfIle('/avanslar',
      { personelId: V.personel.id, tutar: '1.000,00', mahsupDonem: '2026-11' });
    assert.equal(y.durum, 200, 'mahsuptan sonra avans açılamadı');
  });
});

/* ==========================================================================
   HR-12/13 — sağlık ve yetkinlik: süresiz belge kaydedilemez
   ========================================================================== */
describe('HR-12/13 — geçerlilik tarihi olmayan sağlık kaydı reddedilir', () => {
  test('süresiz sağlık raporu 422', async () => {
    const c = await ik();
    const y = await c.csrfIle('/personel-saglik', { personelId: V.personel.id, ad: 'Periyodik muayene' });
    assert.equal(y.durum, 422, 'süresiz sağlık kaydı kabul edildi');
  });

  test('geçerlilik verilince kayıt `yetkinlik` tablosuna tek kanonik biçimde yazılır', async () => {
    const c = await ik();
    const y = await c.csrfIle('/personel-saglik',
      { personelId: V.personel.id, ad: 'Periyodik muayene', gecerlilik: '2027-06-30' });
    assert.equal(y.durum, 200);
    assert.equal(sorgu(`SELECT id FROM yetkinlik WHERE personel_id = ? AND tur = 'saglik'`,
      V.personel.id).length, 1);
    /* Ayrı bir "saglik_kaydi" tablosu YOKTUR (kural 4). */
    assert.equal(sorgu(`SELECT name FROM sqlite_master WHERE type='table' AND name='saglik_kaydi'`).length, 0);
  });
});

/* ==========================================================================
   HR-10..13 ABAC — çalışan yalnız kendi kaydını görür
   ========================================================================== */
describe('İK ekranlarında kapsam sunucuda daraltılır', () => {
  test('çalışan rolü izin listesinde yalnız kendi kaydını görür', async () => {
    const c = await olarak('calisan@yapitas.demo');
    const r = await c.get('/izinler');
    assert.equal(r.durum, 200);
    assert.match(r.govde, /Kendi kayıtlarınız/, 'kapsam daraltması kullanıcıya bildirilmiyor');
    assert.ok(!new RegExp(V.personel.ad_soyad).test(r.govde),
      'çalışan başka personelin izin kaydını görüyor');
  });

  test('yetkisiz rol İK ekranlarına erişemez', async () => {
    const c = await olarak('depo@yapitas.demo');
    for (const yol of ['/izinler', '/avanslar', '/personel-saglik', '/yetkinlikler']) {
      assert.equal((await c.get(yol)).durum, 403, `${yol} yetkisiz role açıldı`);
    }
  });
});

/* ==========================================================================
   GLB-02 / GLB-03 — panonun kendi kaydı yoktur
   ========================================================================== */
describe('GLB-02/03 — panolar canlı sorgudan beslenir', () => {
  test('her iki pano 200 döner ve ortak kalıbı taşır', async () => {
    const c = await olarak('sahip@yapitas.demo');
    for (const yol of ['/panel/gunluk-ozet', '/panel/yonetici']) {
      const r = await c.get(yol);
      assert.equal(r.durum, 200, `${yol} açılmadı`);
      assert.match(r.govde, /class="gv-page-head"/, `${yol} page-head taşımıyor`);
    }
  });

  test('panoların kendi tablosu ve yazma formu yoktur (kural 4)', async () => {
    const c = await olarak('sahip@yapitas.demo');
    for (const ad of ['gunluk_ozet', 'kontrol_merkezi', 'pano']) {
      assert.equal(sorgu(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, ad).length, 0,
        `${ad} adında pano tablosu var`);
    }
    for (const yol of ['/panel/gunluk-ozet', '/panel/yonetici']) {
      const r = await c.get(yol);
      assert.ok(!/<form method="post"[^>]*action="\/panel/.test(r.govde), `${yol} yazma formu içeriyor`);
    }
  });

  test('yetkisiz rol yönetici kontrol merkezini göremez', async () => {
    const c = await olarak('calisan@yapitas.demo');
    assert.equal((await c.get('/panel/yonetici')).durum, 403);
  });
});

/* ==========================================================================
   K-049 — şantiye ve proje kapanış engelleri gerçek defterlere bağlı
   --------------------------------------------------------------------------
   Faz 4 öncesinde bu kalemler "planlı" yer tutucusuydu ve KALDIRILAMAZDI.
   Artık gerçek sorgu: veri varsa engel açılır, veri temizlenince engel kapanır.
   ========================================================================== */
describe('K-049 — kapanış engelleri Faz 4 defterlerinden hesaplanır', () => {
  test('kapanış listesinde "planlı" yer tutucu kalmadı', async () => {
    const c = await olarak('sahip@yapitas.demo');
    await c.csrfIle('/projeler/yeni', { ad: 'K049 Projesi', _idempotency: 'f4c-k1' });
    V.proje = tek(`SELECT * FROM proje WHERE ad = 'K049 Projesi'`);
    await c.csrfIle('/santiyeler/yeni',
      { ad: 'K049 Şantiyesi', projeId: V.proje.id, _idempotency: 'f4c-k2' });
    V.santiye = tek(`SELECT * FROM santiye WHERE ad = 'K049 Şantiyesi'`);

    assert.equal(kapanisEngelleri(V.santiye.id).filter((e) => e.planli).length, 0);
    assert.equal(projeKapanisEngelleri(V.proje.id).filter((e) => e.planli).length, 0);
  });

  test('şantiye deposunda stok kalırsa "Depo stok bakiyesi" engeli açılır', async () => {
    const c = await depo();
    assert.equal((await c.csrfIle('/depolar',
      { ad: 'K049 Deposu', tur: 'santiye', santiyeId: V.santiye.id })).durum, 200);
    V.depo = tek(`SELECT * FROM depo WHERE ad = 'K049 Deposu'`);
    assert.equal((await c.csrfIle('/stok-kartlari',
      { kod: 'K049-CIM', ad: 'K049 Çimento', kategori: 'insaat', birim: 'ton' })).durum, 200);
    V.kart = tek(`SELECT * FROM stok_karti WHERE ad = 'K049 Çimento'`);

    /* Boşken engel yok. */
    assert.equal(engel(kapanisEngelleri(V.santiye.id), 'Depo stok bakiyesi').adet, 0);

    /* Gerçek defter hareketi: bakiye defterden gelir, elle yazılmaz. */
    const y = await c.csrfIle('/stok/sarf', {
      tur: 'iade', depoId: V.depo.id, kartId: V.kart.id,
      miktar: '10', aciklama: 'K049 sahadan iade' });
    assert.equal(y.durum, 200, 'stok hareketi yazılamadı');

    const kalem = engel(kapanisEngelleri(V.santiye.id), 'Depo stok bakiyesi');
    assert.equal(kalem.adet, 1, 'depoda stok varken engel açılmadı');
    assert.ok(acikKapanisEngelleri(V.santiye.id).some((e) => e.ad === 'Depo stok bakiyesi'));
  });

  test('stok sıfırlanınca engel kapanır — sayı defterden yeniden üretilir', async () => {
    const c = await depo();
    const y = await c.csrfIle('/stok/sarf', {
      tur: 'sarf', depoId: V.depo.id, kartId: V.kart.id,
      miktar: '10', aciklama: 'K049 kapanış sarfı' });
    assert.equal(y.durum, 200);
    assert.equal(engel(kapanisEngelleri(V.santiye.id), 'Depo stok bakiyesi').adet, 0,
      'depo boşaldığı halde engel kapanmadı');
  });

  test('şantiye kasasında bakiye kalırsa "Sıfırlanmamış kasa bakiyesi" engeli açılır', async () => {
    const c = await olarak('finans@yapitas.demo');
    assert.equal((await c.csrfIle('/kasalar',
      { ad: 'K049 Kasası', santiyeId: V.santiye.id, paraBirimi: 'TRY' })).durum, 200);
    V.kasa = tek(`SELECT * FROM kasa WHERE ad = 'K049 Kasası'`);
    assert.equal(engel(kapanisEngelleri(V.santiye.id), 'Sıfırlanmamış kasa bakiyesi').adet, 0);
    /* Kasa açık olduğu sürece "Kapatılmamış kasa" engeli zaten açıktır. */
    assert.equal(engel(kapanisEngelleri(V.santiye.id), 'Kapatılmamış kasa').adet, 1);

    const y = await c.csrfIle('/kasa-hareketleri',
      { kasaId: V.kasa.id, tur: 'tahsilat', tutar: '1.000,00', tarih: '2026-08-12', aciklama: 'K049 devir' });
    assert.equal(y.durum, 200, 'kasa hareketi yazılamadı');
    assert.equal(engel(kapanisEngelleri(V.santiye.id), 'Sıfırlanmamış kasa bakiyesi').adet, 1,
      'kasada bakiye varken engel açılmadı');
  });

  test('şantiyede duran varlık ve açık zimmet engelleri gerçek sayıdır', async () => {
    const c = await depo();
    assert.equal((await c.csrfIle('/varliklar/yeni', {
      ad: 'K049 Jeneratör', tur: 'ekipman', santiyeId: V.santiye.id,
      _idempotency: 'f4c-k3' })).durum, 200);
    assert.equal(engel(kapanisEngelleri(V.santiye.id), 'Şantiyede duran varlık').adet, 1,
      'şantiyedeki varlık engeli açılmadı');

    const jen = tek(`SELECT * FROM varlik WHERE ad = 'K049 Jeneratör'`);
    assert.equal((await c.csrfIle('/zimmetler',
      { varlikId: jen.id, personelId: V.personel.id, santiyeId: V.santiye.id })).durum, 200);
    assert.equal(engel(kapanisEngelleri(V.santiye.id), 'İade edilmemiş zimmet').adet, 1,
      'açık zimmet engeli açılmadı');
  });

  test('engeller açıkken şantiye kapatılamaz (geçiş motoru 409)', async () => {
    const c = await olarak('sahip@yapitas.demo');
    const s = tek('SELECT * FROM santiye WHERE id = ?', V.santiye.id);
    const y = await c.csrfIle(`/santiyeler/${s.id}`,
      { _eylem: 'gecis', gecis: 'kapat', gerekce: 'Kapat', surum: String(s.surum) });
    assert.equal(y.durum, 409, 'engel varken şantiye kapandı');
    assert.notEqual(tek('SELECT durum FROM santiye WHERE id = ?', s.id).durum, 'kapali');
  });

  test('proje kapanışında hakediş, teminat ve bütçe engelleri gerçek sorgudan gelir', async () => {
    const liste = projeKapanisEngelleri(V.proje.id);
    for (const ad of ['Karara bağlanmamış hakediş', 'Karara bağlanmamış metraj',
      'Karara bağlanmamış zeyil', 'İade edilmemiş teminat', 'Onayda bekleyen bütçe',
      'Kapanmamış fatura', 'Kapanmamış ödeme talebi', 'Sıfırlanmamış proje kasası']) {
      assert.ok(engel(liste, ad), `${ad} engeli listede yok`);
      assert.equal(typeof engel(liste, ad).adet, 'number', `${ad} sayısı hesaplanmıyor`);
    }

    /* Onayda bekleyen bütçe gerçekten engel açar. */
    const c = await olarak('finans@yapitas.demo');
    assert.equal((await c.csrfIle('/butceler',
      { _eylem: 'ac', ad: 'K049 Bütçesi', projeId: V.proje.id, yil: '2026' })).durum, 200);
    assert.equal(engel(projeKapanisEngelleri(V.proje.id), 'Onayda bekleyen bütçe').adet, 1,
      'taslak bütçe proje kapanışını engellemiyor');
  });
});

/* ==========================================================================
   Ortak sözleşmeler — §3 kalıpları ve kural 5
   ========================================================================== */
describe('Faz 4c ekranları ortak kalıba ve yetkiye uyar', () => {
  const AST_YOLLARI = ['/varliklar', '/varliklar/yeni', '/zimmetler', '/bakim-planlari',
    '/bakim-is-emirleri', '/varlik-kontrolleri', '/araclar', '/araclar/yakit', '/araclar/olaylar'];
  const HR_YOLLARI = ['/izinler', '/avanslar', '/personel-saglik', '/yetkinlikler'];

  test('AST ekranları 200 döner ve page-head taşır', async () => {
    const c = await depo();
    for (const yol of AST_YOLLARI) {
      const r = await c.get(yol);
      assert.equal(r.durum, 200, `${yol} açılmadı`);
      assert.match(r.govde, /class="gv-page-head"/, `${yol} page-head taşımıyor`);
    }
  });

  test('HR ekranları 200 döner ve page-head taşır', async () => {
    const c = await ik();
    for (const yol of HR_YOLLARI) {
      const r = await c.get(yol);
      assert.equal(r.durum, 200, `${yol} açılmadı`);
      assert.match(r.govde, /class="gv-page-head"/, `${yol} page-head taşımıyor`);
    }
  });

  test('yazma formlarında durum veya onaycı alanı yok (kural 5)', async () => {
    for (const [c, yollar] of [[await depo(), AST_YOLLARI], [await ik(), HR_YOLLARI]]) {
      for (const yol of yollar) {
        const r = await c.get(yol);
        for (const f of r.govde.match(/<form method="post"[\s\S]*?<\/form>/g) || []) {
          assert.ok(!/name="durum"/.test(f), `${yol} yazma formunda durum alanı var`);
          assert.ok(!/name="onayci/i.test(f), `${yol} yazma formunda onaycı alanı var`);
        }
      }
    }
  });

  test('liste ekranları sayfalama standardını taşır (§3.5)', async () => {
    const c = await depo();
    for (const yol of ['/varliklar', '/zimmetler', '/bakim-is-emirleri', '/araclar']) {
      const r = await c.get(yol);
      assert.match(r.govde, /class="gv-pager"/, `${yol} sayfalayıcı yok`);
      assert.match(r.govde, /Veri tarihi/, `${yol} veri tarihi künyesi yok`);
    }
  });

  test('yetkisiz rol AST ekranlarına erişemez', async () => {
    const c = await olarak('calisan@yapitas.demo');
    for (const yol of AST_YOLLARI) {
      assert.equal((await c.get(yol)).durum, 403, `${yol} yetkisiz role açıldı`);
    }
  });
});
