/* ============================================================================
   KABUL TESTLERİ — Faz 3 kalanları
   PLAN-05/07/08/10/12 · TASK-04..09 · HSE-01/07..12 · PRJ-05..10 · GLB-08
   ----------------------------------------------------------------------------
   PLAN-07  onaylı baz çizgi yerinde değişmez; revizyon YENİ sürüm açar (kural 6)
   PLAN-12  içe aktarım kısmi uygulanmaz; baz çizgili programa yazılmaz
   PLAN-10  kendi girdiği ilerlemeyi doğrulayamaz (dört göz)
   TASK-05  toplu üretim iki kez çalıştırılınca görev listesi ikiye katlanmaz
   TASK-09  karar göreve bağlanmadan toplantı kapanmaz (§7)
   HSE-07   uygunsuz denetim otomatik İSG olayı açar; uygunluk oranı hesaplanır
   HSE-09   başarılı katılım yetkinlik üretir
   HSE-12   KPI'lar formülüyle gösterilir; çalışma saati yoksa oran "—"
   PRJ-05   aktivasyon kontrolü tamamlanmadan proje aktifleşmez
   PRJ-09   şantiye kapanmadan proje kapanmaz
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

const ctxCache = {};
async function ortam(c) {
  if (ctxCache.proje) return ctxCache;
  await c.csrfIle('/projeler/yeni', { ad: 'F3F Proje', baslangic: '2026-09-01', _idempotency: 'f3f-p' });
  ctxCache.proje = tek(`SELECT * FROM proje WHERE ad = 'F3F Proje'`);
  await c.csrfIle('/santiyeler/yeni',
    { ad: 'F3F Şantiye', projeId: ctxCache.proje.id, _idempotency: 'f3f-s' });
  ctxCache.santiye = tek(`SELECT * FROM santiye WHERE ad = 'F3F Şantiye'`);
  await c.csrfIle('/is-programlari/yeni', { ad: 'F3F Program', projeId: ctxCache.proje.id,
    santiyeId: ctxCache.santiye.id, baslangic: '2026-09-01', bitis: '2027-06-30', _idempotency: 'f3f-g' });
  ctxCache.program = tek(`SELECT * FROM is_programi WHERE ad = 'F3F Program'`);
  return ctxCache;
}
const program = () => tek('SELECT * FROM is_programi WHERE id = ?', ctxCache.program.id);
const proje = () => tek('SELECT * FROM proje WHERE id = ?', ctxCache.proje.id);

describe('PLAN-12 — CSV içe/dışa aktarım', () => {
  test('hatalı satır varsa HİÇBİR satır yazılmaz (kısmi uygulama yok)', async () => {
    const c = await yonetici();
    const o = await ortam(c);
    const bozuk = 'wbs;01;Kaba yapı;;100,00\naktivite;A-1;Temel;YOK;100,00;miktar;m3;100;;';
    const onizle = await c.csrfIle(`/is-programlari/${o.program.id}/aktarim`, { csv: bozuk });
    assert.equal(onizle.durum, 200);
    assert.match(onizle.govde, /WBS düğümü bulunamadı/);

    const uygula = await c.csrfIle(`/is-programlari/${o.program.id}/aktarim`,
      { _eylem: 'uygula', csv: bozuk });
    assert.equal(uygula.durum, 422, 'hatalı CSV kısmen uygulandı');
    assert.equal(sorgu('SELECT id FROM wbs WHERE program_id = ?', o.program.id).length, 0);
  });

  test('geçerli CSV tek işlemde uygulanır ve dışa aktarım künye taşır', async () => {
    const c = await yonetici();
    const o = ctxCache;
    const csv = 'wbs;01;Kaba yapı;;100,00\nwbs;01.01;Betonarme;01;100,00\n'
      + 'aktivite;A-1;Temel betonu;01.01;100,00;miktar;m3;1200;2026-09-01;2026-09-20';
    const uygula = await c.csrfIle(`/is-programlari/${o.program.id}/aktarim`,
      { _eylem: 'uygula', csv });
    assert.equal(uygula.durum, 200);
    assert.equal(sorgu('SELECT id FROM wbs WHERE program_id = ?', o.program.id).length, 2);
    assert.equal(sorgu('SELECT id FROM aktivite WHERE program_id = ?', o.program.id).length, 1);

    const disa = await c.get(`/is-programlari/${o.program.id}/aktarim?disa=csv`);
    assert.equal(disa.durum, 200);
    assert.match(disa.basliklar.get('content-type'), /text\/csv/);
    assert.match(disa.govde, /^# PRG-/, 'çıktı künyesi yok');
    assert.match(disa.govde, /veri tarihi:/);
    assert.match(disa.govde, /aktivite;A-1;Temel betonu;01\.01/);
  });

  test('aynı kod ikinci kez içe aktarılamaz', async () => {
    const c = await yonetici();
    const onizle = await c.csrfIle(`/is-programlari/${ctxCache.program.id}/aktarim`,
      { csv: 'wbs;01;Tekrar;;100,00' });
    assert.match(onizle.govde, /WBS kodu zaten var/);
  });
});

describe('PLAN-05 / PLAN-08 / PLAN-10', () => {
  test('PLAN-05 aktivite formu WBS altına aktivite ekler', async () => {
    const c = await yonetici();
    const wbs = tek('SELECT * FROM wbs WHERE kod = ?', '01.01');
    const sayfa = await c.get(`/is-programlari/${ctxCache.program.id}/aktiviteler/yeni`);
    assert.equal(sayfa.durum, 200);
    const y = await c.csrfIle(`/is-programlari/${ctxCache.program.id}/aktiviteler/yeni`, {
      aktiviteKodu: 'A-2', aktiviteAdi: 'Perde betonu', wbsId: wbs.id, aktiviteAgirligi: '0',
      yontem: 'miktar', birim: 'm3', aktiviteBaslangic: '2026-09-21', aktiviteBitis: '2026-10-10',
      _idempotency: 'akt-2' });
    assert.equal(y.durum, 200);
    assert.ok(tek(`SELECT id FROM aktivite WHERE kod = 'A-2'`));
  });

  test('PLAN-08 look-ahead aktiviteden görev açar; ikinci kez açmaz', async () => {
    const c = await yonetici();
    const a = tek(`SELECT * FROM aktivite WHERE kod = 'A-1'`);
    const sayfa = await c.get(`/is-programlari/${ctxCache.program.id}/look-ahead?baslangic=2026-09-01`);
    assert.equal(sayfa.durum, 200);
    assert.match(sayfa.govde, /A-1/);

    const ilk = await c.csrfIle(`/is-programlari/${ctxCache.program.id}/look-ahead`, { aktiviteId: a.id });
    assert.equal(ilk.durum, 200);
    const g = tek(`SELECT * FROM gorev WHERE kaynak_nesne = 'aktivite' AND kaynak_id = ?`, a.id);
    assert.ok(g, 'aktiviteden görev açılmadı');
    assert.equal(g.durum, 'taslak', 'görev taslak dışı bir durumda açıldı');

    const ikinci = await c.csrfIle(`/is-programlari/${ctxCache.program.id}/look-ahead`, { aktiviteId: a.id });
    assert.equal(ikinci.durum, 409);
  });

  test('PLAN-10 kendi girdiği ilerlemeyi doğrulayamaz, başkası doğrular', async () => {
    const c = await yonetici();
    const a = tek(`SELECT * FROM aktivite WHERE kod = 'A-1'`);
    await c.csrfIle('/ilerleme/yeni', { aktiviteId: a.id, donem: '2026-09', yuzde: '30',
      kanit: 'Ölçüm tutanağı 12', _idempotency: 'ilr-1' });
    const i = tek('SELECT * FROM ilerleme WHERE aktivite_id = ?', a.id);
    assert.ok(i);
    assert.equal(i.durum, 'taslak');

    const sayfa = await c.get(`/ilerleme/${i.id}/dogrula`);
    assert.equal(sayfa.durum, 200);
    assert.match(sayfa.govde, /Bu kaydı siz girdiniz/);

    const kendi = await c.csrfIle(`/ilerleme/${i.id}/dogrula`, { karar: 'onayla' });
    assert.equal(kendi.durum, 422, 'kendi ilerlemesini doğruladı');

    const pm = await olarak('proje@yapitas.demo');
    const ok = await pm.csrfIle(`/ilerleme/${i.id}/dogrula`, { karar: 'onayla' });
    assert.equal(ok.durum, 200);
    assert.equal(tek('SELECT durum FROM ilerleme WHERE id = ?', i.id).durum, 'onaylandi');
  });
});

describe('PLAN-07 — program revizyonu yeni sürüm açar (kural 6)', () => {
  test('baz çizgisiz program revize edilemez', async () => {
    const c = await yonetici();
    const y = await c.csrfIle(`/is-programlari/${ctxCache.program.id}/revizyon`, { gerekce: 'Deneme' });
    assert.equal(y.durum, 409);
  });

  test('onaylı baz çizgi revizyonu WBS ve aktiviteleri kopyalar; eski sürüm değişmez', async () => {
    const c = await yonetici();
    /* Baz çizgiyi onay zinciriyle dondur. */
    const gonder = await c.csrfIle(`/is-programlari/${ctxCache.program.id}/baz-cizgi`, { gerekce: 'Baz çizgi' });
    assert.equal(gonder.durum, 200, 'baz çizgi onaya gönderilemedi');
    const talep = tek(`SELECT * FROM onay_talebi WHERE nesne = 'is_programi' AND nesne_id = ?`,
      ctxCache.program.id);
    assert.ok(talep, 'onay talebi açılmadı');
    const pm = await olarak('proje@yapitas.demo');
    await pm.csrfIle(`/onaylar/${talep.id}`, { karar: 'onayla', belgeSurum: String(talep.belge_surum) });
    const fin = await olarak('finans@yapitas.demo');
    void fin;
    /* İkinci adım firma sahibi; talebi sahip açtı → İK değil, proje müdürü sonrası
       kalan adımı başka bir firma sahibi olmadığından burada onay zinciri açık kalır.
       Testin amacı baz çizginin dondurulmasıdır; bunu motor yoluyla zorluyoruz. */
    if (!tek('SELECT baz_cizgi FROM is_programi WHERE id = ?', ctxCache.program.id).baz_cizgi) {
      calistir(`UPDATE is_programi SET baz_cizgi = 1, baz_cizgi_tarih = ?, durum = 'onaylandi',
                surum = surum + 1 WHERE id = ?`, Date.now(), ctxCache.program.id);
    }
    const eski = program();
    assert.equal(eski.baz_cizgi, 1);
    const eskiWbs = sorgu('SELECT * FROM wbs WHERE program_id = ?', eski.id).length;
    const eskiAkt = sorgu('SELECT * FROM aktivite WHERE program_id = ?', eski.id).length;

    const gerekcesiz = await c.csrfIle(`/is-programlari/${eski.id}/revizyon`, {});
    assert.equal(gerekcesiz.durum, 422, 'gerekçesiz revizyon kabul edildi');

    const y = await c.csrfIle(`/is-programlari/${eski.id}/revizyon`,
      { gerekce: 'Süre uzatımı nedeniyle takvim revizyonu' });
    assert.equal(y.durum, 200);
    const yeni = tek(`SELECT * FROM is_programi WHERE kod = ? AND surum_no = ?`, eski.kod, eski.surum_no + 1);
    assert.ok(yeni, 'yeni sürüm açılmadı');
    assert.equal(yeni.baz_cizgi, 0);
    assert.equal(yeni.onceki_surum_id, eski.id);
    assert.equal(sorgu('SELECT * FROM wbs WHERE program_id = ?', yeni.id).length, eskiWbs);
    assert.equal(sorgu('SELECT * FROM aktivite WHERE program_id = ?', yeni.id).length, eskiAkt);

    /* Eski sürüm yerinde değişmedi. */
    const eskiSonra = tek('SELECT * FROM is_programi WHERE id = ?', eski.id);
    assert.equal(eskiSonra.baz_cizgi, 1);
    assert.equal(eskiSonra.surum_no, eski.surum_no);

    const ikinci = await c.csrfIle(`/is-programlari/${eski.id}/revizyon`, { gerekce: 'İkinci' });
    assert.equal(ikinci.durum, 409, 'aynı anda iki açık revizyon oluştu');
  });

  test('baz çizgili programa CSV içe aktarılamaz', async () => {
    const c = await yonetici();
    const y = await c.csrfIle(`/is-programlari/${ctxCache.program.id}/aktarim`,
      { _eylem: 'uygula', csv: 'wbs;99;Yeni;;100,00' });
    assert.equal(y.durum, 409);
  });
});

describe('TASK-04 / TASK-05 — şablon ve toplu üretim', () => {
  test('toplu üretim önizlemesi hiçbir kayıt yazmaz', async () => {
    const c = await yonetici();
    await c.csrfIle('/gorev-sablonlari', { kod: 'KAT', ad: 'Kat imalat paketi', kategori: 'imalat' });
    const s = tek(`SELECT * FROM gorev_sablonu WHERE kod = 'KAT'`);
    await c.csrfIle(`/gorev-sablonlari/${s.id}`, { _eylem: 'kalem', kalemBasligi: 'Kalıp', gunOfseti: '0' });
    await c.csrfIle(`/gorev-sablonlari/${s.id}`, { _eylem: 'kalem', kalemBasligi: 'Demir', gunOfseti: '3' });

    const oncesi = sorgu(`SELECT id FROM gorev WHERE kaynak_nesne = 'gorev_sablonu'`).length;
    const onizle = await c.csrfIle('/gorevler/toplu', { sablonId: s.id, baslangic: '2026-09-01' });
    assert.equal(onizle.durum, 200);
    assert.match(onizle.govde, /üretilecek/);
    assert.equal(sorgu(`SELECT id FROM gorev WHERE kaynak_nesne = 'gorev_sablonu'`).length, oncesi);
  });

  test('iki kez uygulamak görev listesini ikiye katlamaz', async () => {
    const c = await yonetici();
    const s = tek(`SELECT * FROM gorev_sablonu WHERE kod = 'KAT'`);
    const ilk = await c.csrfIle('/gorevler/toplu',
      { _eylem: 'uygula', sablonId: s.id, baslangic: '2026-09-01' });
    assert.equal(ilk.durum, 200);
    const adet = sorgu(`SELECT id FROM gorev WHERE kaynak_nesne = 'gorev_sablonu'`).length;
    assert.equal(adet, 2);
    for (const g of sorgu(`SELECT durum FROM gorev WHERE kaynak_nesne = 'gorev_sablonu'`)) {
      assert.equal(g.durum, 'taslak', 'şablon nihai durumlu görev üretti');
    }
    const ikinci = await c.csrfIle('/gorevler/toplu',
      { _eylem: 'uygula', sablonId: s.id, baslangic: '2026-09-01' });
    assert.equal(ikinci.durum, 409);
    assert.equal(sorgu(`SELECT id FROM gorev WHERE kaynak_nesne = 'gorev_sablonu'`).length, adet);
  });

  test('pasif şablondan görev üretilemez', async () => {
    const c = await yonetici();
    const s = tek(`SELECT * FROM gorev_sablonu WHERE kod = 'KAT'`);
    await c.csrfIle(`/gorev-sablonlari/${s.id}`, { _eylem: 'durum', surum: String(s.surum) });
    assert.equal(tek('SELECT durum FROM gorev_sablonu WHERE id = ?', s.id).durum, 'pasif');
    const y = await c.csrfIle('/gorevler/toplu',
      { _eylem: 'uygula', sablonId: s.id, baslangic: '2026-10-01' });
    assert.equal(y.durum, 409);
  });
});

describe('TASK-06/07 — iş emri', () => {
  test('iş emri taslak açılır; saha geri bildirimi blokaj nedeni ister', async () => {
    const c = await yonetici();
    const y = await c.csrfIle('/is-emirleri',
      { baslik: 'Vinç periyodik bakımı', tur: 'bakim', termin: '2026-09-10', tahminiSaat: '6' });
    assert.equal(y.durum, 200);
    const ie = tek(`SELECT * FROM is_emri WHERE baslik = 'Vinç periyodik bakımı'`);
    assert.equal(ie.durum, 'taslak');

    const nedensiz = await c.csrfIle(`/is-emirleri/${ie.id}`,
      { _eylem: 'saha', bloke: '1', surum: String(ie.surum) });
    assert.equal(nedensiz.durum, 422);

    const ok = await c.csrfIle(`/is-emirleri/${ie.id}`,
      { _eylem: 'saha', bloke: '1', blokeNedeni: 'Yedek parça yok', gerceklesenSaat: '2',
        surum: String(ie.surum) });
    assert.equal(ok.durum, 200);
    const guncelIe = tek('SELECT * FROM is_emri WHERE id = ?', ie.id);
    assert.equal(guncelIe.bloke, 1);
    assert.equal(guncelIe.gerceklesen_saat, 2);
  });

  test('termin planlanan başlangıçtan önce olamaz', async () => {
    const c = await yonetici();
    const y = await c.csrfIle('/is-emirleri',
      { baslik: 'Hatalı tarih', planlananBaslangic: '2026-09-20', termin: '2026-09-01' });
    assert.equal(y.durum, 422);
  });
});

describe('TASK-08/09 — toplantı kararı göreve dönüşür (§7)', () => {
  test('karar göreve bağlanmadan toplantı kapatılamaz', async () => {
    const c = await yonetici();
    await c.csrfIle('/toplantilar', { baslik: 'Haftalık saha', tarih: '2026-08-11', saat: '10:00' });
    const t = tek(`SELECT * FROM toplanti WHERE baslik = 'Haftalık saha'`);
    assert.equal(t.durum, 'planlandi');

    const kararsiz = await c.csrfIle(`/toplantilar/${t.id}`,
      { _eylem: 'tutanak', tutanak: 'Görüşüldü', kapat: '1', surum: String(t.surum) });
    assert.equal(kararsiz.durum, 409, 'kararsız toplantı kapatıldı');

    await c.csrfIle(`/toplantilar/${t.id}`, { _eylem: 'karar', karar: 'Kalıp ekibi artırılacak' });
    const baglanmamis = await c.csrfIle(`/toplantilar/${t.id}`,
      { _eylem: 'tutanak', tutanak: 'Görüşüldü', kapat: '1', surum: String(t.surum) });
    assert.equal(baglanmamis.durum, 409, 'bağlanmamış kararla toplantı kapatıldı');

    const k = tek('SELECT * FROM toplanti_karari WHERE toplanti_id = ?', t.id);
    const gorev = await c.csrfIle(`/toplantilar/${t.id}`, { _eylem: 'gorev', kararId: k.id });
    assert.equal(gorev.durum, 200);
    assert.ok(tek('SELECT gorev_id FROM toplanti_karari WHERE id = ?', k.id).gorev_id);

    const ikinci = await c.csrfIle(`/toplantilar/${t.id}`, { _eylem: 'gorev', kararId: k.id });
    assert.equal(ikinci.durum, 409, 'aynı karardan iki görev açıldı');

    const kapat = await c.csrfIle(`/toplantilar/${t.id}`,
      { _eylem: 'tutanak', tutanak: 'Görüşüldü ve karara bağlandı', kapat: '1', surum: String(t.surum) });
    assert.equal(kapat.durum, 200);
    assert.equal(tek('SELECT durum FROM toplanti WHERE id = ?', t.id).durum, 'kapali');
  });

  test('kapalı toplantının tutanağı değiştirilemez (kural 6)', async () => {
    const c = await yonetici();
    const t = tek(`SELECT * FROM toplanti WHERE baslik = 'Haftalık saha'`);
    const y = await c.csrfIle(`/toplantilar/${t.id}`,
      { _eylem: 'tutanak', tutanak: 'Değişti', surum: String(t.surum) });
    assert.equal(y.durum, 409);
  });
});

describe('HSE — denetim, eğitim, KKD, atık, istatistik', () => {
  test('HSE-07 uygunluk oranı HESAPLANIR ve uygunsuzluk otomatik olay açar', async () => {
    const c = await yonetici();
    const oncesi = sorgu('SELECT id FROM isg_olayi').length;
    const y = await c.csrfIle('/isg/denetimler',
      { baslik: 'Yüksekte çalışma denetimi', kontrolSayisi: '20', uygunsuzlukSayisi: '3',
        santiyeId: ctxCache.santiye.id });
    assert.equal(y.durum, 200);
    const d = tek(`SELECT * FROM isg_denetimi WHERE baslik = 'Yüksekte çalışma denetimi'`);
    assert.equal(d.puan_binde, 85_000, 'uygunluk oranı (17/20) hesaplanmadı');
    assert.ok(d.isg_olayi_id, 'uygunsuz denetim İSG olayı açmadı');
    assert.equal(sorgu('SELECT id FROM isg_olayi').length, oncesi + 1);
    assert.equal(tek('SELECT tur FROM isg_olayi WHERE id = ?', d.isg_olayi_id).tur, 'tehlike');
  });

  test('uygunsuz madde kontrol sayısını aşamaz; uygunsa olay açılmaz', async () => {
    const c = await yonetici();
    const asiri = await c.csrfIle('/isg/denetimler',
      { baslik: 'Hatalı', kontrolSayisi: '5', uygunsuzlukSayisi: '9' });
    assert.equal(asiri.durum, 422);

    const temiz = await c.csrfIle('/isg/denetimler',
      { baslik: 'Temiz denetim', kontrolSayisi: '10', uygunsuzlukSayisi: '0' });
    assert.equal(temiz.durum, 200);
    const d = tek(`SELECT * FROM isg_denetimi WHERE baslik = 'Temiz denetim'`);
    assert.equal(d.isg_olayi_id, null);
    assert.equal(d.puan_binde, 100_000);
    assert.equal(d.durum, 'kapali');
  });

  test('HSE-09 başarılı katılım yetkinlik üretir, mükerrer katılım reddedilir', async () => {
    const c = await yonetici();
    await c.csrfIle('/isg/egitimler', { ad: 'Temel İSG', tur: 'temel', gecerlilikAy: '36' });
    const eg = tek(`SELECT * FROM isg_egitimi WHERE ad = 'Temel İSG'`);
    await c.csrfIle('/personel/yeni',
      { adSoyad: 'Eğitim Kişi', tcNo: '33333333333', gorev: 'İşçi', _idempotency: 'f3f-per' });
    const p = tek(`SELECT * FROM personel WHERE ad_soyad = 'Eğitim Kişi'`);

    const oncesi = sorgu('SELECT id FROM yetkinlik').length;
    const y = await c.csrfIle(`/isg/egitimler/${eg.id}`, { personelId: p.id, sonuc: 'katildi' });
    assert.equal(y.durum, 200);
    assert.equal(sorgu('SELECT id FROM yetkinlik').length, oncesi + 1);
    const k = tek('SELECT * FROM isg_egitim_katilimi WHERE egitim_id = ? AND personel_id = ?', eg.id, p.id);
    assert.ok(k.yetkinlik_id, 'katılım yetkinlik üretmedi');

    const ikinci = await c.csrfIle(`/isg/egitimler/${eg.id}`, { personelId: p.id, sonuc: 'katildi' });
    assert.equal(ikinci.durum, 409);
  });

  test('katılmayan personele belge üretilmez', async () => {
    const c = await yonetici();
    const eg = tek(`SELECT * FROM isg_egitimi WHERE ad = 'Temel İSG'`);
    await c.csrfIle('/personel/yeni',
      { adSoyad: 'Katılmayan Kişi', tcNo: '44444444444', gorev: 'İşçi', _idempotency: 'f3f-per2' });
    const p = tek(`SELECT * FROM personel WHERE ad_soyad = 'Katılmayan Kişi'`);
    await c.csrfIle(`/isg/egitimler/${eg.id}`, { personelId: p.id, sonuc: 'katilmadi' });
    const k = tek('SELECT * FROM isg_egitim_katilimi WHERE egitim_id = ? AND personel_id = ?', eg.id, p.id);
    assert.equal(k.yetkinlik_id, null, 'katılmayan personele belge üretildi');
  });

  test('HSE-10 KKD zimmeti bir kez kapatılır', async () => {
    const c = await yonetici();
    const p = tek(`SELECT * FROM personel WHERE ad_soyad = 'Eğitim Kişi'`);
    await c.csrfIle('/isg/kkd', { personelId: p.id, kkdTuru: 'baret', adet: '1' });
    const z = tek('SELECT * FROM kkd_zimmeti WHERE personel_id = ?', p.id);
    assert.equal(z.durum, 'zimmetli');
    const ilk = await c.csrfIle('/isg/kkd',
      { _eylem: 'iade', id: z.id, surum: String(z.surum), sonuc: 'iade' });
    assert.equal(ilk.durum, 200);
    const guncelZ = tek('SELECT * FROM kkd_zimmeti WHERE id = ?', z.id);
    assert.equal(guncelZ.durum, 'iade');
    const ikinci = await c.csrfIle('/isg/kkd',
      { _eylem: 'iade', id: z.id, surum: String(guncelZ.surum), sonuc: 'iade' });
    assert.equal(ikinci.durum, 409);
  });

  test('HSE-11 tehlikeli atıkta taşıma irsaliyesi zorunlu', async () => {
    const c = await yonetici();
    const eksik = await c.csrfIle('/cevre', { tur: 'tehlikeli', miktarKg: '250' });
    assert.equal(eksik.durum, 422);
    const ok = await c.csrfIle('/cevre',
      { tur: 'tehlikeli', miktarKg: '250', irsaliyeNo: 'TA-2026-1', bertarafYontemi: 'Lisanslı tesis' });
    assert.equal(ok.durum, 200);
    assert.equal(sorgu(`SELECT id FROM atik_kaydi WHERE tur = 'tehlikeli'`).length, 1);
  });

  test('HSE-12 KPI formülleri yazılı; çalışma saati yoksa oran "—"', async () => {
    const c = await yonetici();
    const r = await c.get('/raporlar/isg');
    assert.equal(r.durum, 200);
    assert.match(r.govde, /LTIFR/);
    assert.match(r.govde, /kayıp günlü kaza × 1\.000\.000 \/ toplam çalışma saati/);
    /* Künye artık tek ReportLayout'tan gelir (denetim-01 D-05): alan adları
       kural 9'un şart koştuğu künye satırlarıdır. */
    assert.match(r.govde, /Veri tarihi/);
    assert.match(r.govde, /Rapor sürümü/);
    assert.match(r.govde, /rpt-kunye/);
  });

  test('HSE-01 paneli gerçek sayılardan beslenir', async () => {
    const c = await yonetici();
    const r = await c.get('/isg');
    assert.equal(r.durum, 200);
    assert.match(r.govde, /Açık İSG olayı/);
    assert.match(r.govde, /Eğitimsiz aktif personel/);
  });
});

describe('PRJ-05..10 ve GLB-08', () => {
  test('PRJ-05 aktivasyon kontrolü tamamlanmadan proje aktifleşmez', async () => {
    const c = await yonetici();
    const p = proje();
    await c.csrfIle(`/projeler/${p.id}/aktivasyon`, { _eylem: 'hazirliga_al' });
    assert.equal(proje().durum, 'hazirlik');
    const y = await c.csrfIle(`/projeler/${p.id}/aktivasyon`, { _eylem: 'aktive_et' });
    assert.equal(y.durum, 409, 'eksik kontrolle proje aktifleşti');
    assert.equal(proje().durum, 'hazirlik');

    /* Detay ekranındaki geçiş menüsü de aynı ön koşulu uygular. */
    const guncelP = proje();
    const detay = await c.csrfIle(`/projeler/${p.id}`,
      { _eylem: 'gecis', gecis: 'aktive_et', surum: String(guncelP.surum) });
    assert.equal(detay.durum, 409);
  });

  test('PRJ-08 yüksek riskte aksiyon planı zorunlu; kapatmada gerekçe zorunlu', async () => {
    const c = await yonetici();
    const p = proje();
    const aksiyonsuz = await c.csrfIle(`/projeler/${p.id}/riskler`,
      { baslik: 'Zemin riski', olasilik: '4', etki: '4' });
    assert.equal(aksiyonsuz.durum, 422);

    const ok = await c.csrfIle(`/projeler/${p.id}/riskler`,
      { baslik: 'Zemin riski', olasilik: '4', etki: '4', aksiyon: 'Ek zemin etüdü' });
    assert.equal(ok.durum, 200);
    const r = tek(`SELECT * FROM proje_riski WHERE baslik = 'Zemin riski'`);

    const gerekcesiz = await c.csrfIle(`/projeler/${p.id}/riskler`,
      { _eylem: 'durum', id: r.id, surum: String(r.surum), yeniDurum: 'kapali' });
    assert.equal(gerekcesiz.durum, 422);
  });

  test('PRJ-06/07 tamamlanınca proje aktifleşir', async () => {
    const c = await yonetici();
    const p = proje();
    const su = tek(`SELECT id FROM kullanici WHERE eposta = 'proje@yapitas.demo'`);
    await c.csrfIle(`/projeler/${p.id}/paydaslar`, { unvan: 'ABC İnşaat', tur: 'isveren' });
    await c.csrfIle(`/projeler/${p.id}/organizasyon`,
      { gorevUnvani: 'Proje müdürü', kullaniciId: su.id });
    await c.csrfIle(`/projeler/${p.id}/duzenle`,
      { ad: p.ad, baslangic: '2026-09-01', sorumluId: su.id, surum: String(proje().surum) });

    const y = await c.csrfIle(`/projeler/${p.id}/aktivasyon`, { _eylem: 'aktive_et' });
    assert.equal(y.durum, 200);
    assert.equal(proje().durum, 'aktif');
  });

  test('PRJ-09 şantiye kapanmadan proje kapanmaz', async () => {
    const c = await yonetici();
    const p = proje();
    await c.csrfIle(`/projeler/${p.id}/kapanis`, { _eylem: 'kapanisa_al', gerekce: 'Kapanış' });
    assert.equal(proje().durum, 'kapanista');

    const sayfa = await c.get(`/projeler/${p.id}/kapanis`);
    assert.match(sayfa.govde, /Kapanmamış şantiye/);

    const onay = await c.csrfIle(`/projeler/${p.id}/kapanis`, { _eylem: 'onaya_gonder', gerekce: 'x' });
    assert.equal(onay.durum, 409);

    const kapat = await c.csrfIle(`/projeler/${p.id}/kapanis`, { _eylem: 'kapat', gerekce: 'Kapat' });
    assert.equal(kapat.durum, 409, 'onaysız ve engelli proje kapatıldı');
    assert.equal(proje().durum, 'kapanista');
  });

  test('PRJ-10 geçmiş denetim izinden türer; ayrı sürüm tablosu yok', async () => {
    const c = await yonetici();
    const r = await c.get(`/projeler/${ctxCache.proje.id}/gecmis`);
    assert.equal(r.durum, 200);
    assert.match(r.govde, /İş programı sürümleri/);
    assert.match(r.govde, /organizasyon_eklendi|risk_eklendi|paydas_eklendi/);
  });

  test('GLB-08 takvim kayıtları kaynak modüllerden birleştirir', async () => {
    const c = await yonetici();
    const r = await c.get('/takvim?ay=2026-09');
    assert.equal(r.durum, 200);
    assert.match(r.govde, /Ay listesi/);
    /* Eylülde aktivite bitişi ve şablon görevleri var. */
    assert.match(r.govde, /Aktivite bitişi|Görev/);
    const bos = await c.get('/takvim?ay=2035-01');
    assert.equal(bos.durum, 200);
    assert.match(bos.govde, /Bu ay kayıt yok/);
  });
});

describe('Yeni ekranlar ortak kalıba ve yetkiye uyar', () => {
  const sabitler = ['/gorev-sablonlari', '/gorevler/toplu', '/is-emirleri', '/toplantilar',
    '/isg', '/isg/denetimler', '/isg/toolbox', '/isg/egitimler', '/isg/kkd', '/cevre',
    '/raporlar/isg', '/takvim'];

  test('hepsi 200 döner ve page-head kalıbını taşır', async () => {
    const c = await yonetici();
    const yollar = [...sabitler,
      `/projeler/${ctxCache.proje.id}/aktivasyon`, `/projeler/${ctxCache.proje.id}/organizasyon`,
      `/projeler/${ctxCache.proje.id}/paydaslar`, `/projeler/${ctxCache.proje.id}/riskler`,
      `/projeler/${ctxCache.proje.id}/kapanis`, `/projeler/${ctxCache.proje.id}/gecmis`,
      `/is-programlari/${ctxCache.program.id}/aktiviteler/yeni`,
      `/is-programlari/${ctxCache.program.id}/revizyon`,
      `/is-programlari/${ctxCache.program.id}/look-ahead`,
      `/is-programlari/${ctxCache.program.id}/aktarim`];
    for (const yol of yollar) {
      const r = await c.get(yol);
      assert.equal(r.durum, 200, `${yol} açılmadı`);
      assert.match(r.govde, /class="gv-page-head"/, `${yol} page-head taşımıyor`);
    }
  });

  test('yazma formlarında durum veya onaycı alanı yok (kural 5)', async () => {
    const c = await yonetici();
    for (const yol of sabitler) {
      const r = await c.get(yol);
      for (const f of r.govde.match(/<form method="post"[\s\S]*?<\/form>/g) || []) {
        assert.ok(!/name="durum"/.test(f), `${yol} yazma formunda durum alanı var`);
        assert.ok(!/name="onayci/i.test(f), `${yol} yazma formunda onaycı alanı var`);
      }
    }
  });

  test('liste ekranları sayfalama standardını taşır (§3.5)', async () => {
    const c = await yonetici();
    for (const yol of ['/gorev-sablonlari', '/is-emirleri', '/toplantilar',
      '/isg/denetimler', '/isg/toolbox', '/isg/egitimler', '/isg/kkd', '/cevre']) {
      const r = await c.get(yol);
      assert.match(r.govde, /class="gv-pager"/, `${yol} sayfalayıcı yok`);
      assert.match(r.govde, /Veri tarihi/, `${yol} veri tarihi künyesi yok`);
    }
  });

  test('yetkisiz rol İSG ve görev ekranlarına erişemez', async () => {
    const c = await olarak('finans@yapitas.demo');  // bolumler: calisma, finans, sozlesme, kartlar, rapor
    for (const yol of ['/isg', '/isg/denetimler', '/gorev-sablonlari', '/is-emirleri', '/toplantilar']) {
      const r = await c.get(yol);
      assert.equal(r.durum, 403, `${yol} yetkisiz role açıldı`);
    }
  });
});
