/* ============================================================================
   KABUL TESTİ — denetim-01 / D-04 tek kanonik URL
   ----------------------------------------------------------------------------
   Değişmez kural 1: menü, rota ve breadcrumb screen-manifest'ten türer.
   Bir ekranın manifestte rotası varsa (`PRJ-08 /projeler/:id/riskler`) o rota
   TEK adresidir; aynı içeriğe `?sekme=riskler` ile ikinci bir adres açılamaz.

   Bu dosya üç şeyi kilitler:
     · sekme çubuğu kanonik rotaya bağlanır, `?sekme=` biçimi ÜRETİLMEZ
     · eski `?sekme=` biçimi 301 ile kanonik rotaya gider (sorgu korunarak)
     · kanonik karşılığı OLMAYAN sekmeler query biçimini korur
   ========================================================================== */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { uygulamaBaslat } from '../yardimci.mjs';
import { tek } from '../../app/cekirdek/db.mjs';
import { manifest } from '../../app/cekirdek/yapilandirma.mjs';
import { sekmeEkrani, sekmeleriCoz, eskiSekmeHedefi } from '../../app/rotalar/ortak.mjs';

let S; let c; let pid; let plid;

before(async () => {
  S = await uygulamaBaslat();
  c = S.istemci();
  await c.giris('sahip@yapitas.demo');
  /* Künye kontrolü (PRJ-05) proje sorumlusu ister; aktivasyon testi için şart. */
  await c.csrfIle('/projeler/yeni', { ad: 'Kanonik URL Projesi', baslangic: '2026-01-01',
    planlananBitis: '2026-12-31', sozlesmeBedeli: '1000000', tur: 'konut', paraBirimi: 'TRY',
    sorumluId: tek(`SELECT id FROM kullanici WHERE eposta = 'proje@yapitas.demo'`).id });
  pid = tek(`SELECT id FROM proje WHERE ad = 'Kanonik URL Projesi'`).id;
  await c.csrfIle('/is-programlari/yeni', { ad: 'Kanonik URL Programı', projeId: pid,
    baslangic: '2026-01-01', bitis: '2026-12-31' });
  plid = tek(`SELECT id FROM is_programi WHERE ad = 'Kanonik URL Programı'`).id;
});
after(async () => S.kapat());

describe('D-04 — sekme kanoniği manifestten türer', () => {
  test('manifestte kendi ekranı olan sekme kanonik rotasını alır', () => {
    assert.equal(sekmeEkrani('/projeler/:id', 'riskler')?.kod, 'PRJ-08');
    assert.equal(sekmeEkrani('/projeler/:id', 'gecmis')?.kod, 'PRJ-10');
    assert.equal(sekmeEkrani('/is-programlari/:id', 'wbs')?.kod, 'PLAN-04');
    /* Manifestte karşılığı olmayan sekme kanonikleşmez. */
    assert.equal(sekmeEkrani('/projeler/:id', 'ozet'), null);
    assert.equal(sekmeEkrani('/projeler/:id', 'santiyeler'), null);
  });

  test('sekmeleriCoz yalnız kanonik olanlara rota yazar', () => {
    const cozulmus = sekmeleriCoz(
      [{ ad: 'ozet' }, { ad: 'riskler' }, { ad: 'gecmis' }],
      { desen: '/projeler/:id', rota: '/projeler/PRJ1' });
    assert.equal(cozulmus[0].rota, undefined, 'ozet sekmesi kanonikleştirilmiş');
    assert.equal(cozulmus[1].rota, '/projeler/PRJ1/riskler');
    assert.equal(cozulmus[2].rota, '/projeler/PRJ1/gecmis');
  });

  test('eskiSekmeHedefi yanıtı YAZMAZ, yol döner', () => {
    const sahteCtx = (qs) => ({ sorgu: new URLSearchParams(qs) });
    assert.equal(
      eskiSekmeHedefi(sahteCtx('sekme=riskler&durum=acik'), { desen: '/projeler/:id', rota: '/projeler/P1' }),
      '/projeler/P1/riskler?durum=acik', 'sorgu parametreleri korunmuyor');
    assert.equal(eskiSekmeHedefi(sahteCtx('sekme=ozet'), { desen: '/projeler/:id', rota: '/projeler/P1' }), null);
    assert.equal(eskiSekmeHedefi(sahteCtx(''), { desen: '/projeler/:id', rota: '/projeler/P1' }), null);
  });
});

describe('D-04 — ekranlar tek adresten servis edilir', () => {
  const baglar = (govde) => [...new Set([...govde.matchAll(/href="([^"]+)"/g)].map((m) => m[1]))];

  test('proje detayı kanonik alt ekranlara bağlanır, ?sekme= üretmez', async () => {
    const y = await c.get(`/projeler/${pid}`, { izle: false });
    assert.equal(y.durum, 200);
    const b = baglar(y.govde);
    for (const yol of ['riskler', 'gecmis', 'organizasyon', 'paydaslar', 'aktivasyon']) {
      assert.ok(b.includes(`/projeler/${pid}/${yol}`), `proje detayı ${yol} ekranına bağlanmıyor`);
    }
    for (const s of ['riskler', 'gecmis']) {
      assert.ok(!b.some((u) => u.includes(`sekme=${s}`)),
        `?sekme=${s} hâlâ üretiliyor — aynı ekran için ikinci URL`);
    }
    /* Kanonik karşılığı olmayan sekmeler query biçimini korur. */
    assert.ok(b.some((u) => u.includes('sekme=ozet')), 'ozet sekmesi kayboldu');
  });

  /* PRJ-05 aktivasyon kontrolü gerçekten uygulanır: organizasyon, paydaş ve
     şantiye tamamlanmadan proje aktifleşmez. Bu kurulum aynı zamanda PRJ-06 ve
     PRJ-07 yazma yüzeylerini de KANONİK rotalarından doğrular. */
  test('PRJ-09 kapanış sihirbazı proje aktifleşince bağlanır (durum bağımlı)', async () => {
    const yon = await c.csrfIle(`/projeler/${pid}/organizasyon`, {
      gorevUnvani: 'Proje müdürü', kullaniciId: tek(`SELECT id FROM kullanici WHERE eposta = 'proje@yapitas.demo'`).id,
      sorumluluk: 'Genel koordinasyon' }, { izle: false });
    assert.equal(yon.durum, 303, 'PRJ-06 kanonik rotasından organizasyon yazılamıyor');
    const pay = await c.csrfIle(`/projeler/${pid}/paydaslar`,
      { tur: 'isveren', unvan: 'Denetim İşveren A.Ş.', kisi: 'Yetkili' }, { izle: false });
    assert.equal(pay.durum, 303, 'PRJ-07 kanonik rotasından paydaş yazılamıyor');
    await c.csrfIle('/santiyeler/yeni', { ad: 'Kanonik Şantiye', projeId: pid,
      baslangic: '2026-01-01', planlananBitis: '2026-12-31' });

    for (const gecis of ['hazirliga_al', 'aktive_et']) {
      const kayit = tek('SELECT * FROM proje WHERE id = ?', pid);
      await c.csrfIle(`/projeler/${pid}`, { _eylem: 'gecis', gecis, surum: String(kayit.surum) });
    }
    assert.equal(tek('SELECT durum FROM proje WHERE id = ?', pid).durum, 'aktif',
      'aktivasyon kontrolü tamamlandığı hâlde proje aktifleşmedi');
    const y = await c.get(`/projeler/${pid}`, { izle: false });
    assert.ok(baglar(y.govde).includes(`/projeler/${pid}/kapanis`),
      'aktif projede kapanış sihirbazına bağlantı yok');
  });

  test('iş programı detayı WBS ekranına kanonik rotayla bağlanır', async () => {
    const y = await c.get(`/is-programlari/${plid}`, { izle: false });
    const b = baglar(y.govde);
    assert.ok(b.includes(`/is-programlari/${plid}/wbs`));
    assert.ok(!b.some((u) => u.includes('sekme=wbs')), '?sekme=wbs hâlâ üretiliyor');
    assert.ok(b.some((u) => u.includes('sekme=ilerleme')), 'ilerleme sekmesi kayboldu');
  });
});

describe('D-04 — eski ?sekme= biçimi kanonik rotaya 301', () => {
  test('çakışan sekme değeri kalıcı olarak yönlendirilir', async () => {
    for (const [yol, hedef] of [
      [`/projeler/${pid}?sekme=riskler`, `/projeler/${pid}/riskler`],
      [`/projeler/${pid}?sekme=gecmis`, `/projeler/${pid}/gecmis`],
      [`/is-programlari/${plid}?sekme=wbs`, `/is-programlari/${plid}/wbs`],
    ]) {
      const y = await c.get(yol, { izle: false });
      assert.equal(y.durum, 301, `${yol} kalıcı yönlendirme vermiyor`);
      assert.equal(y.basliklar.get('location'), hedef);
    }
  });

  test('yönlendirmede diğer sorgu parametreleri korunur', async () => {
    const y = await c.get(`/projeler/${pid}?sekme=riskler&durum=acik`, { izle: false });
    assert.equal(y.durum, 301);
    assert.equal(y.basliklar.get('location'), `/projeler/${pid}/riskler?durum=acik`);
  });

  test('kanonik karşılığı olmayan sekme yönlendirilmez, sayfayı çizer', async () => {
    for (const yol of [`/projeler/${pid}?sekme=ozet`, `/projeler/${pid}?sekme=santiyeler`,
      `/is-programlari/${plid}?sekme=ilerleme`]) {
      const y = await c.get(yol, { izle: false });
      assert.equal(y.durum, 200, `${yol} artık çizilmiyor`);
    }
  });

  test('yönlendiren istek gövde de yazmaz (ERR_HTTP_HEADERS_SENT kilidi)', async () => {
    const y = await c.get(`/projeler/${pid}?sekme=riskler`, { izle: false });
    assert.equal(y.govde, '', 'yönlendirmeden sonra sayfa da çiziliyor');
  });
});

describe('D-04 — yazma yüzeyi de kanonik ekranda', () => {
  test('WBS düğümü PLAN-04 rotasına yazılır; PLAN-03 ikinci yüzey açmaz', async () => {
    const kanonik = await c.csrfIle(`/is-programlari/${plid}/wbs`,
      { _eylem: 'wbs', kod: 'K1', ad: 'Kanonik düğüm', agirlik: '100' }, { izle: false });
    assert.equal(kanonik.durum, 303);
    assert.equal(kanonik.basliklar.get('location'), `/is-programlari/${plid}/wbs?wbs=1`);
    assert.ok(tek('SELECT id FROM wbs WHERE program_id = ? AND kod = ?', plid, 'K1'));

    const eski = await c.csrfIle(`/is-programlari/${plid}`,
      { _eylem: 'wbs', kod: 'K2', ad: 'Eski yüzey', agirlik: '10' });
    assert.equal(eski.durum, 422, 'PLAN-03 hâlâ WBS yazıyor — ikinci yazma yüzeyi');
    assert.equal(tek('SELECT id FROM wbs WHERE program_id = ? AND kod = ?', plid, 'K2'), null);
  });

  test('risk kaydı PRJ-08 rotasına yazılır; proje detayı ikinci yüzey açmaz', async () => {
    const kanonik = await c.csrfIle(`/projeler/${pid}/riskler`,
      { baslik: 'Kanonik risk', olasilik: '3', etki: '4', aksiyon: 'Aksiyon planı' }, { izle: false });
    assert.equal(kanonik.durum, 303);
    assert.ok(tek(`SELECT id FROM proje_riski WHERE proje_id = ? AND baslik = 'Kanonik risk'`, pid));

    const eski = await c.csrfIle(`/projeler/${pid}`, { _eylem: 'risk', baslik: 'Eski yüzey riski' });
    assert.equal(eski.durum, 422, 'PRJ-03 hâlâ risk yazıyor — ikinci yazma yüzeyi');
    assert.equal(tek(`SELECT id FROM proje_riski WHERE proje_id = ? AND baslik = 'Eski yüzey riski'`, pid), null);
  });
});

describe('D-04 — manifest kapsaması', () => {
  test('proje ve iş programı alt ekranlarının hepsi manifestte tanımlı', () => {
    const rotalar = new Set(manifest().ekranlar.map((e) => e.rota));
    for (const r of ['/projeler/:id/aktivasyon', '/projeler/:id/organizasyon', '/projeler/:id/paydaslar',
      '/projeler/:id/riskler', '/projeler/:id/kapanis', '/projeler/:id/gecmis', '/is-programlari/:id/wbs']) {
      assert.ok(rotalar.has(r), `${r} manifestte yok — kanonik adres türetilemez`);
    }
  });
});
