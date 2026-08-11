/* ============================================================================
   KABUL TESTLERİ — Faz 3 İK bloğu (HR-01..05, HR-07..09)
   ----------------------------------------------------------------------------
   HR-01  maaş alanı maskeli rolde ne görünür ne yazılır (§5.7)
   HR-05  işe giriş sihirbazı eksik adımla tamamlanamaz
   HR-07  çakışan aktif atama reddedilir
   HR-08  aynı personel-gün ikilisi tek satırdır; kilitli satır değişmez
   HR-09  dönem onaysız kapanmaz; kapanışta satırlar kilitlenir
   ========================================================================== */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { uygulamaBaslat } from '../yardimci.mjs';
import { sorgu, tek, calistir } from '../../app/cekirdek/db.mjs';

let S;
before(async () => { S = await uygulamaBaslat(); });
after(async () => { await S.kapat(); });

const olarak = async (eposta) => { const c = S.istemci(); await c.giris(eposta); return c; };
const yonetici = () => olarak('sahip@yapitas.demo');

let santiyeId = null;
async function santiyeAc(c) {
  if (santiyeId) return santiyeId;
  const p = await c.csrfIle('/projeler/yeni',
    { ad: 'İK Test Projesi', _idempotency: 'ik-prj-1' });
  assert.equal(p.durum, 200, 'proje açılamadı');
  const proje = tek(`SELECT * FROM proje WHERE ad = 'İK Test Projesi'`);
  const s = await c.csrfIle('/santiyeler/yeni',
    { ad: 'İK Test Şantiyesi', projeId: proje.id, _idempotency: 'ik-ste-1' });
  assert.equal(s.durum, 200, 'şantiye açılamadı');
  santiyeId = tek(`SELECT id FROM santiye WHERE ad = 'İK Test Şantiyesi'`).id;
  return santiyeId;
}

async function personelAc(c, ad, ek = {}) {
  const y = await c.csrfIle('/personel/yeni', {
    adSoyad: ad, tcNo: '11111111111', gorev: 'Formen', iseGiris: '2026-07-01',
    _idempotency: `per-${ad}`, ...ek });
  assert.equal(y.durum, 200, `personel açılamadı: ${ad}`);
  return tek('SELECT * FROM personel WHERE ad_soyad = ?', ad);
}

describe('HR-01..04 — personel kaydı ve maaş maskesi (§5.7)', () => {
  test('personel "aday" durumunda açılır; durumu form seçmez', async () => {
    const c = await yonetici();
    const form = await c.get('/personel/yeni');
    assert.equal(form.durum, 200);
    assert.ok(!/name="durum"/.test(form.govde), 'formda durum alanı var');

    const p = await personelAc(c, 'Ahmet Yıldız');
    assert.equal(p.durum, 'aday');
    assert.match(p.kod, /^PER-\d{4}-\d{4}$/);
  });

  test('maaş yetkili rolde yazılır ve okunur', async () => {
    const c = await yonetici();
    const p = await personelAc(c, 'Zeynep Kaya', { maas: '45.000,00', maasBirim: 'TRY' });
    assert.equal(String(p.maas_minor), '4500000');
    const detay = await c.get(`/personel/${p.id}`);
    assert.match(detay.govde, /45\.000,00/, 'yetkili rol maaşı göremedi');
  });

  test('maskeli rol maaşı GÖRMEZ ve POST etse bile YAZAMAZ', async () => {
    const yon = await yonetici();
    const p = await personelAc(yon, 'Mehmet Demir', { maas: '30.000,00' });

    /* Proje müdürü personeli görür ama ücret/IBAN/TC alanı maskelidir. */
    const sis = await olarak('proje@yapitas.demo');
    const detay = await sis.get(`/personel/${p.id}`);
    assert.equal(detay.durum, 200);
    assert.ok(!/30\.000,00/.test(detay.govde), 'maskeli rol maaşı gördü');

    const form = await sis.get(`/personel/${p.id}/duzenle`);
    assert.ok(!/name="maas"/.test(form.govde), 'maskeli rolde maaş alanı çizilmiş');

    /* Gizli alanı elle POST etmek maskeyi delmemeli. */
    const oncekiSurum = tek('SELECT surum FROM personel WHERE id = ?', p.id).surum;
    const y = await sis.csrfIle(`/personel/${p.id}/duzenle`, {
      adSoyad: p.ad_soyad, gorev: p.gorev, maas: '999.999,00', maasBirim: 'TRY',
      surum: String(oncekiSurum) });
    assert.equal(y.durum, 200);
    assert.equal(String(tek('SELECT maas_minor FROM personel WHERE id = ?', p.id).maas_minor), '3000000',
      'maskeli rol maaşı değiştirdi');
  });

  test('düzenlemede eski sürüm 409 ile reddedilir', async () => {
    const c = await yonetici();
    const p = tek(`SELECT * FROM personel WHERE ad_soyad = 'Ahmet Yıldız'`);
    const ilk = await c.csrfIle(`/personel/${p.id}/duzenle`,
      { adSoyad: p.ad_soyad, gorev: 'Saha mühendisi', surum: String(p.surum) });
    assert.equal(ilk.durum, 200);
    const ikinci = await c.csrfIle(`/personel/${p.id}/duzenle`,
      { adSoyad: p.ad_soyad, gorev: 'Şef', surum: String(p.surum) });
    assert.equal(ikinci.durum, 409);
  });
});

describe('HR-07 — atama tarih aralığı çakışamaz', () => {
  test('çakışan aktif atama 409 ile reddedilir', async () => {
    const c = await yonetici();
    const ste = await santiyeAc(c);
    const p = tek(`SELECT * FROM personel WHERE ad_soyad = 'Ahmet Yıldız'`);

    const ilk = await c.csrfIle('/personel-atamalari',
      { personelId: p.id, santiyeId: ste, gorev: 'Formen', baslangic: '2026-08-01', bitis: '2026-09-30' });
    assert.equal(ilk.durum, 200);
    assert.equal(Number(tek(`SELECT COUNT(*) AS n FROM personel_atama WHERE personel_id = ?`, p.id).n), 1);

    const cakisan = await c.csrfIle('/personel-atamalari',
      { personelId: p.id, santiyeId: ste, gorev: 'Formen', baslangic: '2026-09-01', bitis: '2026-10-31' });
    assert.equal(cakisan.durum, 409, 'çakışan atama kabul edildi');
    assert.equal(Number(tek(`SELECT COUNT(*) AS n FROM personel_atama WHERE personel_id = ?`, p.id).n), 1);

    const ayrik = await c.csrfIle('/personel-atamalari',
      { personelId: p.id, santiyeId: ste, gorev: 'Formen', baslangic: '2026-10-01', bitis: '2026-11-30' });
    assert.equal(ayrik.durum, 200, 'çakışmayan atama reddedildi');
  });

  test('bitiş başlangıçtan önce olamaz', async () => {
    const c = await yonetici();
    const ste = await santiyeAc(c);
    const p = tek(`SELECT * FROM personel WHERE ad_soyad = 'Zeynep Kaya'`);
    const y = await c.csrfIle('/personel-atamalari',
      { personelId: p.id, santiyeId: ste, baslangic: '2026-08-10', bitis: '2026-08-01' });
    assert.equal(y.durum, 422);
  });
});

describe('HR-05 — işe giriş sihirbazı gerçek kayıttan doğrular', () => {
  test('eksik zorunlu adımla tamamlanamaz', async () => {
    const c = await yonetici();
    const p = await personelAc(c, 'Belgesiz Aday');
    const sayfa = await c.get(`/personel/${p.id}/ise-giris`);
    assert.equal(sayfa.durum, 200);
    assert.match(sayfa.govde, /zorunlu adım eksik/);

    const y = await c.csrfIle(`/personel/${p.id}/ise-giris`, {});
    assert.equal(y.durum, 409, 'eksik adımla işe giriş tamamlandı');
    assert.equal(tek('SELECT durum FROM personel WHERE id = ?', p.id).durum, 'aday');
  });

  test('tüm zorunlu adımlar tamamsa personel aktifleşir', async () => {
    const c = await yonetici();
    const ste = await santiyeAc(c);
    const p = tek(`SELECT * FROM personel WHERE ad_soyad = 'Zeynep Kaya'`);

    await c.csrfIle(`/personel/${p.id}/yetkinlikler`,
      { ad: 'İSG temel eğitimi', tur: 'egitim', gecerlilik: '2027-12-31' });
    await c.csrfIle('/personel-atamalari',
      { personelId: p.id, santiyeId: ste, gorev: 'Mühendis', baslangic: '2026-08-01' });

    const y = await c.csrfIle(`/personel/${p.id}/ise-giris`, { gerekce: 'Evrak tamam' });
    assert.equal(y.durum, 200);
    assert.equal(tek('SELECT durum FROM personel WHERE id = ?', p.id).durum, 'aktif');
  });

  test('süresi dolmuş belge işe girişi engeller', async () => {
    const c = await yonetici();
    const ste = await santiyeAc(c);
    const p = await personelAc(c, 'Süresi Dolan', { _idempotency: 'per-sd' });
    await c.csrfIle(`/personel/${p.id}/yetkinlikler`,
      { ad: 'Sağlık raporu', tur: 'saglik', gecerlilik: '2020-01-01' });
    await c.csrfIle('/personel-atamalari',
      { personelId: p.id, santiyeId: ste, baslangic: '2026-08-01' });
    const y = await c.csrfIle(`/personel/${p.id}/ise-giris`, {});
    assert.equal(y.durum, 409);
    assert.equal(tek('SELECT durum FROM personel WHERE id = ?', p.id).durum, 'aday');
  });
});

describe('HR-08 — puantaj girişi ve dönem', () => {
  test('atamasız personele puantaj yazılamaz', async () => {
    const c = await yonetici();
    const p = tek(`SELECT * FROM personel WHERE ad_soyad = 'Belgesiz Aday'`);
    const y = await c.csrfIle('/puantaj',
      { personelId: p.id, gun: '2026-08-03', normalSaat: '8', fazlaSaat: '0' });
    assert.equal(y.durum, 422);
  });

  test('ilk kayıt dönemi açar; aynı gün ikinci gönderim TEK satır bırakır', async () => {
    const c = await yonetici();
    const p = tek(`SELECT * FROM personel WHERE ad_soyad = 'Zeynep Kaya'`);
    const ilk = await c.csrfIle('/puantaj',
      { personelId: p.id, gun: '2026-08-03', vardiya: 'gunduz', normalSaat: '8', fazlaSaat: '2' });
    assert.equal(ilk.durum, 200);
    const d = tek(`SELECT * FROM puantaj_donemi WHERE donem = '2026-08'`);
    assert.ok(d, 'dönem açılmadı');
    assert.equal(d.durum, 'acik');

    const ikinci = await c.csrfIle('/puantaj',
      { personelId: p.id, gun: '2026-08-03', vardiya: 'gunduz', normalSaat: '9', fazlaSaat: '1' });
    assert.equal(ikinci.durum, 200);
    const satirlar = sorgu('SELECT * FROM puantaj WHERE personel_id = ? AND gun = ?', p.id, '2026-08-03');
    assert.equal(satirlar.length, 1, 'aynı gün için ikinci satır açıldı');
    assert.equal(satirlar[0].normal_saat, 9);
    assert.equal(satirlar[0].surum, 2, 'güncelleme sürümlü değil');
  });

  test('24 saati aşan ve gelecek tarihli giriş reddedilir', async () => {
    const c = await yonetici();
    const p = tek(`SELECT * FROM personel WHERE ad_soyad = 'Zeynep Kaya'`);
    const asiri = await c.csrfIle('/puantaj',
      { personelId: p.id, gun: '2026-08-04', normalSaat: '20', fazlaSaat: '8' });
    assert.equal(asiri.durum, 422);
    const ileri = await c.csrfIle('/puantaj',
      { personelId: p.id, gun: '2030-01-01', normalSaat: '8', fazlaSaat: '0' });
    assert.equal(ileri.durum, 422);
  });
});

describe('HR-09 — dönem kapanışı onaydan geçer ve satırları kilitler', () => {
  test('boş dönem onaya gönderilemez', async () => {
    const c = await yonetici();
    const ste = await santiyeAc(c);
    /* Kayıtsız bir dönem elle kurulur (senaryo: gelecek dönem açılmış). */
    calistir(`INSERT INTO puantaj_donemi (id, tenant_id, santiye_id, donem, durum, olusturuldu)
              VALUES ('dnm_bos', (SELECT id FROM tenant WHERE kod = 'yapitas'), ?, '2026-01', 'acik', 1)`, ste);
    const y = await c.csrfIle('/puantaj/donem-kapanis', { donemId: 'dnm_bos', _eylem: 'onaya_gonder' });
    assert.equal(y.durum, 409);
  });

  test('onaylanmamış dönem kapatılamaz', async () => {
    const c = await yonetici();
    const d = tek(`SELECT * FROM puantaj_donemi WHERE donem = '2026-08'`);
    const y = await c.csrfIle('/puantaj/donem-kapanis', { donemId: d.id, _eylem: 'kapat' });
    assert.equal(y.durum, 409, 'onaysız kapanış kabul edildi');
    assert.equal(tek('SELECT durum FROM puantaj_donemi WHERE id = ?', d.id).durum, 'acik');
  });

  test('onay zinciri tamamlanınca dönem kapatılır ve satırlar kilitlenir', async () => {
    const c = await yonetici();
    const d = tek(`SELECT * FROM puantaj_donemi WHERE donem = '2026-08'`);

    const gonder = await c.csrfIle('/puantaj/donem-kapanis', { donemId: d.id, _eylem: 'onaya_gonder' });
    assert.equal(gonder.durum, 200);
    assert.equal(tek('SELECT durum FROM puantaj_donemi WHERE id = ?', d.id).durum, 'onaya_gonderildi');

    const talep = tek(`SELECT * FROM onay_talebi WHERE nesne = 'puantaj_donemi' AND nesne_id = ?`, d.id);
    assert.ok(talep, 'onay talebi açılmadı');

    /* Onay sürecindeki döneme puantaj yazılamaz. */
    const p = tek(`SELECT * FROM personel WHERE ad_soyad = 'Zeynep Kaya'`);
    const kilitliYazma = await c.csrfIle('/puantaj',
      { personelId: p.id, gun: '2026-08-05', normalSaat: '8', fazlaSaat: '0' });
    assert.equal(kilitliYazma.durum, 409, 'onay sürecindeki döneme yazıldı');

    /* Adım 1: proje müdürü, adım 2: İK sorumlusu. */
    const pm = await olarak('proje@yapitas.demo');
    const k1 = await pm.csrfIle(`/onaylar/${talep.id}`,
      { karar: 'onayla', belgeSurum: String(talep.belge_surum) });
    assert.equal(k1.durum, 200, 'proje müdürü kararı reddedildi');

    const ik = await olarak('ik@yapitas.demo');
    const k2 = await ik.csrfIle(`/onaylar/${talep.id}`,
      { karar: 'onayla', belgeSurum: String(talep.belge_surum) });
    assert.equal(k2.durum, 200, 'İK kararı reddedildi');
    assert.equal(tek('SELECT sonuc FROM onay_talebi WHERE id = ?', talep.id).sonuc, 'onaylandi');
    assert.equal(tek('SELECT durum FROM puantaj_donemi WHERE id = ?', d.id).durum, 'onaylandi');

    const kapat = await c.csrfIle('/puantaj/donem-kapanis', { donemId: d.id, _eylem: 'kapat' });
    assert.equal(kapat.durum, 200);
    const kapali = tek('SELECT * FROM puantaj_donemi WHERE id = ?', d.id);
    assert.equal(kapali.durum, 'kapali');
    assert.ok(kapali.kapandi, 'kapanış zamanı yazılmadı');
    const kilitsiz = sorgu('SELECT * FROM puantaj WHERE donem_id = ? AND kilit = 0', d.id);
    assert.equal(kilitsiz.length, 0, 'kapanışta kilitlenmeyen satır kaldı');
  });

  test('kapalı döneme yazma reddedilir', async () => {
    const c = await yonetici();
    const p = tek(`SELECT * FROM personel WHERE ad_soyad = 'Zeynep Kaya'`);
    const y = await c.csrfIle('/puantaj',
      { personelId: p.id, gun: '2026-08-06', normalSaat: '8', fazlaSaat: '0' });
    assert.equal(y.durum, 409);
    const guncelle = await c.csrfIle('/puantaj',
      { personelId: p.id, gun: '2026-08-03', normalSaat: '4', fazlaSaat: '0' });
    assert.equal(guncelle.durum, 409, 'kilitli satır güncellendi');
    assert.equal(tek('SELECT normal_saat FROM puantaj WHERE personel_id = ? AND gun = ?', p.id, '2026-08-03').normal_saat, 9);
  });
});

describe('İK ekranları ortak kalıba ve yetkiye uyar', () => {
  const EKRANLAR = ['/personel', '/personel/yeni', '/personel-atamalari', '/puantaj', '/puantaj/donem-kapanis'];

  test('hepsi 200 döner ve page-head kalıbını taşır', async () => {
    const c = await yonetici();
    for (const yol of EKRANLAR) {
      const r = await c.get(yol);
      assert.equal(r.durum, 200, `${yol} açılmadı`);
      assert.match(r.govde, /class="gv-page-head"/, `${yol} page-head taşımıyor`);
    }
  });

  test('yazma formlarında durum veya onaycı alanı yok (kural 5)', async () => {
    const c = await yonetici();
    for (const yol of EKRANLAR) {
      const r = await c.get(yol);
      /* Yalnız POST formları denetlenir: liste filtre barı GET'tir ve durum
         SÜZME ölçütüdür, yazma alanı değildir. */
      const yazmaFormlari = r.govde.match(/<form method="post"[\s\S]*?<\/form>/g) || [];
      for (const f of yazmaFormlari) {
        assert.ok(!/name="durum"/.test(f), `${yol} yazma formunda durum alanı var`);
        assert.ok(!/name="onayci/i.test(f), `${yol} yazma formunda onaycı alanı var`);
      }
    }
  });

  test('yetkisiz rol İK ekranlarına erişemez', async () => {
    const c = await olarak('depo@yapitas.demo');   // bolumler: calisma, stok, varlik
    for (const yol of ['/personel', '/personel-atamalari', '/puantaj']) {
      const r = await c.get(yol);
      assert.equal(r.durum, 403, `${yol} yetkisiz role açıldı`);
    }
  });

  test('liste ekranları sayfalama standardını taşır (§3.5)', async () => {
    const c = await yonetici();
    for (const yol of ['/personel', '/personel-atamalari', '/puantaj']) {
      const r = await c.get(yol);
      assert.match(r.govde, /class="gv-pager"/, `${yol} sayfalayıcı yok`);
      assert.match(r.govde, /Veri tarihi/, `${yol} veri tarihi künyesi yok`);
    }
  });
});
