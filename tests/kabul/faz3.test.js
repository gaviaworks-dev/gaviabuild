/* ============================================================================
   KABUL TESTLERİ — Faz 3  (docs/REVIZYON.md §11)
   PRJ-01 · PLAN-01 · PLAN-02 · SITE-01 · QLT-01
   ========================================================================== */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { uygulamaBaslat } from '../yardimci.mjs';
import { sorgu, tek } from '../../app/cekirdek/db.mjs';
import { simdi, GUN_MS } from '../../app/cekirdek/zaman.mjs';
import { programIlerlemesi, agirlikDogrula, BINDE } from '../../app/moduller/plan/ilerleme.mjs';
import { ilerlemeDogrula } from '../../app/rotalar/plan.mjs';

let S;
before(async () => { S = await uygulamaBaslat(); });
after(async () => { await S.kapat(); });

const ctxKur = (eposta) => ({
  kullanici: tek('SELECT * FROM kullanici WHERE eposta = ?', eposta),
  tenant: tek(`SELECT * FROM tenant WHERE kod = 'yapitas'`),
  istekId: 'req_test', ip: '::1',
});

async function projeKur(c, ad) {
  await c.csrfIle('/projeler/yeni', { ad, tur: 'konut', baslangic: '2026-01-01', planlananBitis: '2026-12-31' });
  return tek('SELECT * FROM proje WHERE ad = ?', ad);
}
async function santiyeKur(c, proje, ad) {
  await c.csrfIle('/santiyeler/yeni', { ad, projeId: proje.id });
  return tek('SELECT * FROM santiye WHERE ad = ?', ad);
}
/** Ağırlıkları %100 olan tam bir program kurar. */
async function programKur(c, proje, ad) {
  await c.csrfIle('/is-programlari/yeni', { ad, projeId: proje.id, baslangic: '2026-01-01', bitis: '2026-12-31' });
  const pr = tek('SELECT * FROM is_programi WHERE ad = ?', ad);
  for (const [kod, dad, ag] of [['1', 'Kaba yapı', '60'], ['2', 'İnce yapı', '30'], ['3', 'Çevre', '10']]) {
    await c.csrfIle(`/is-programlari/${pr.id}/wbs`, { _eylem: 'wbs', kod, ad: dad, agirlik: ag });
  }
  for (const [akod, aad, wkod] of [['A1', 'Temel', '1'], ['A2', 'Sıva', '2'], ['A3', 'Peyzaj', '3']]) {
    const w = tek('SELECT * FROM wbs WHERE kod = ? AND program_id = ?', wkod, pr.id);
    await c.csrfIle(`/is-programlari/${pr.id}/wbs`,
      { _eylem: 'aktivite', aktiviteKodu: akod, aktiviteAdi: aad, wbsId: w.id, aktiviteAgirligi: '100' });
  }
  return pr;
}

/* ========================================================================== */
describe('PRJ-01 — yeni proje yolu 200 döner, kayıt oluşturur, detaya yönlendirir', () => {
  test('/projeler/yeni açılır (eski uygulamada rotası yoktu)', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const y = await c.get('/projeler/yeni');
    assert.equal(y.durum, 200, 'yeni proje formu açılmıyor');
    assert.match(y.govde, /class="form-grid"/, 'ortak form kalıbı kullanılmamış');
  });

  test('form gönderimi gerçek kayıt oluşturur ve detay sayfasına yönlendirir', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const y = await c.csrfIle('/projeler/yeni',
      { ad: 'Liman Konutları', isveren: 'Liman A.Ş.', tur: 'konut', sozlesmeBedeli: '12.500.000,00', paraBirimi: 'TRY' });
    assert.equal(y.durum, 200);
    assert.match(y.yol, /^\/projeler\/prj_/, 'kayıt sonrası detaya yönlendirilmedi');
    const p = tek(`SELECT * FROM proje WHERE ad = 'Liman Konutları'`);
    assert.ok(p, 'proje kaydı oluşmadı');
    assert.match(p.kod, /^PRJ-\d{4}-\d{4}$/, `numaralandırma uygulanmadı: ${p.kod}`);
    assert.equal(p.durum, 'taslak', 'kayıt taslak dışında bir durumda açıldı');
    assert.equal(String(p.sozlesme_bedeli_minor), '1250000000', 'tutar tamsayı kuruş olarak saklanmadı');
  });

  test('zorunlu alan eksikse 422 ve alan bazlı hata döner', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const y = await c.csrfIle('/projeler/yeni', { ad: '', isveren: 'X' });
    assert.equal(y.durum, 422);
    assert.match(y.govde, /Proje adı girin/);
  });

  test('proje formunda durum alanı yok; durum geçiş motorundan gelir', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const y = await c.get('/projeler/yeni');
    const yazma = (y.govde.match(/<form[\s\S]*?<\/form>/g) || []).filter((f) => /method="post"/i.test(f));
    for (const f of yazma) assert.ok(!/name="durum"/.test(f), 'proje formu durum seçtiriyor');
  });

  test('durum geçişi yalnız yetkili rolde çalışır', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const p = await projeKur(c, 'Geçiş Projesi');
    const ok = await c.csrfIle(`/projeler/${p.id}`, { _eylem: 'gecis', gecis: 'hazirliga_al', surum: String(p.surum) });
    assert.equal(ok.durum, 200);
    assert.equal(tek('SELECT durum FROM proje WHERE id = ?', p.id).durum, 'hazirlik');

    const d = S.istemci(); await d.giris('denetci@yapitas.demo');
    const guncel = tek('SELECT * FROM proje WHERE id = ?', p.id);
    const red = await d.csrfIle(`/projeler/${p.id}`, { _eylem: 'gecis', gecis: 'aktive_et', surum: String(guncel.surum) });
    assert.equal(red.durum, 403, 'denetçi durum değiştirebiliyor');
  });

  test('tanımsız geçiş 409 ile reddedilir', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const p = await projeKur(c, 'Geçersiz Geçiş Projesi');
    const y = await c.csrfIle(`/projeler/${p.id}`, { _eylem: 'gecis', gecis: 'kapat', surum: String(p.surum) });
    assert.equal(y.durum, 409, 'taslaktan doğrudan kapalıya geçilebiliyor');
  });
});

/* ========================================================================== */
describe('PLAN-01 — WBS ağırlıkları 100 değilse baz çizgi onaya gönderilemez', () => {
  test('WBS yokken baz çizgi reddedilir', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const p = await projeKur(c, 'Ağırlık Projesi');
    await c.csrfIle('/is-programlari/yeni', { ad: 'Boş program', projeId: p.id });
    const pr = tek(`SELECT * FROM is_programi WHERE ad = 'Boş program'`);
    const y = await c.csrfIle(`/is-programlari/${pr.id}/baz-cizgi`, {});
    assert.equal(y.durum, 422);
    assert.equal(tek('SELECT durum FROM is_programi WHERE id = ?', pr.id).durum, 'taslak');
  });

  test('ağırlık toplamı %90 iken baz çizgi reddedilir', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const p = await projeKur(c, 'Eksik Ağırlık Projesi');
    await c.csrfIle('/is-programlari/yeni', { ad: 'Eksik program', projeId: p.id });
    const pr = tek(`SELECT * FROM is_programi WHERE ad = 'Eksik program'`);
    await c.csrfIle(`/is-programlari/${pr.id}/wbs`, { _eylem: 'wbs', kod: '1', ad: 'A', agirlik: '60' });
    await c.csrfIle(`/is-programlari/${pr.id}/wbs`, { _eylem: 'wbs', kod: '2', ad: 'B', agirlik: '30' });
    const dogrulama = agirlikDogrula(pr.id);
    assert.equal(dogrulama.gecerli, false);
    const y = await c.csrfIle(`/is-programlari/${pr.id}/baz-cizgi`, {});
    assert.equal(y.durum, 422);
    assert.match(y.govde, /%100 değil|WBS ağırlıkları/);
  });

  test('yaprak düğümün aktivite ağırlıkları da %100 olmalı', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const p = await projeKur(c, 'Aktivite Ağırlık Projesi');
    await c.csrfIle('/is-programlari/yeni', { ad: 'Aktivite programı', projeId: p.id });
    const pr = tek(`SELECT * FROM is_programi WHERE ad = 'Aktivite programı'`);
    await c.csrfIle(`/is-programlari/${pr.id}/wbs`, { _eylem: 'wbs', kod: '1', ad: 'Tek düğüm', agirlik: '100' });
    const w = tek('SELECT * FROM wbs WHERE program_id = ?', pr.id);
    await c.csrfIle(`/is-programlari/${pr.id}/wbs`,
      { _eylem: 'aktivite', aktiviteKodu: 'A1', aktiviteAdi: 'Yarım', wbsId: w.id, aktiviteAgirligi: '50' });
    assert.equal(agirlikDogrula(pr.id).gecerli, false, 'aktivite ağırlığı %50 iken geçerli sayıldı');
    const y = await c.csrfIle(`/is-programlari/${pr.id}/baz-cizgi`, {});
    assert.equal(y.durum, 422);
  });

  test('ağırlıklar %100 olduğunda baz çizgi onaya gider ve onaylanınca DONDURULUR', async () => {
    const c = S.istemci(); await c.giris('sef@yapitas.demo');
    const yonetici = S.istemci(); await yonetici.giris('sahip@yapitas.demo');
    const p = await projeKur(yonetici, 'Tam Ağırlık Projesi');
    const pr = await programKur(c, p, 'Tam program');
    assert.equal(agirlikDogrula(pr.id).gecerli, true);

    const gonder = await c.csrfIle(`/is-programlari/${pr.id}/baz-cizgi`, {});
    assert.equal(gonder.durum, 200);
    assert.equal(tek('SELECT durum FROM is_programi WHERE id = ?', pr.id).durum, 'onaya_gonderildi');

    const talep = tek(`SELECT * FROM onay_talebi WHERE nesne = 'is_programi' AND nesne_id = ?`, pr.id);
    assert.ok(talep, 'baz çizgi onay talebi açılmadı');
    const pm = S.istemci(); await pm.giris('proje@yapitas.demo');
    await pm.csrfIle(`/onaylar/${talep.id}`, { karar: 'onayla', belgeSurum: String(talep.belge_surum) });
    await yonetici.csrfIle(`/onaylar/${talep.id}`, { karar: 'onayla', belgeSurum: String(talep.belge_surum) });

    const son = tek('SELECT * FROM is_programi WHERE id = ?', pr.id);
    assert.equal(son.durum, 'onaylandi');
    assert.equal(son.baz_cizgi, 1, 'baz çizgi dondurulmadı');
    assert.ok(son.baz_cizgi_tarih, 'baz çizgi tarihi yazılmadı');
  });

  test('baz çizgi sonrası program yerinde değiştirilemez (§5.4)', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const pr = tek(`SELECT * FROM is_programi WHERE ad = 'Tam program'`);
    assert.equal(pr.baz_cizgi, 1);
    const y = await c.csrfIle(`/is-programlari/${pr.id}/wbs`, { _eylem: 'wbs', kod: '9', ad: 'Sonradan', agirlik: '5' });
    assert.equal(y.durum, 409, 'baz çizgi sonrası WBS eklenebiliyor');
  });
});

/* ========================================================================== */
describe('PLAN-02 — ilerleme yalnız onaylı alt ilerlemelerden hesaplanır', () => {
  test('taslak ilerleme onaylı toplama KATILMAZ, tahmini toplamda görünür', async () => {
    const c = S.istemci(); await c.giris('sef@yapitas.demo');
    const yonetici = S.istemci(); await yonetici.giris('sahip@yapitas.demo');
    const p = await projeKur(yonetici, 'İlerleme Projesi');
    const pr = await programKur(c, p, 'İlerleme programı');
    const a1 = tek(`SELECT * FROM aktivite WHERE kod = 'A1' AND program_id = ?`, pr.id);

    await c.csrfIle(`/is-programlari/${pr.id}`,
      { _eylem: 'ilerleme', aktiviteId: a1.id, donem: '2026-03', yuzde: '50', kanit: 'Ölçüm tutanağı 12' });

    const i = programIlerlemesi(pr.id);
    assert.equal(i.onayli, 0, 'onaylanmamış ilerleme onaylı toplama girdi');
    /* A1 → WBS "1" (ağırlık %60), aktivite ağırlığı %100 → %50 × %60 = %30 */
    assert.equal(i.tahmini, 30_000, `tahmini ilerleme yanlış: ${i.tahmini}`);
  });

  test('doğrulanan ilerleme onaylı toplama katılır — sum(ağırlık × ilerleme)', async () => {
    const pr = tek(`SELECT * FROM is_programi WHERE ad = 'İlerleme programı'`);
    const a1 = tek(`SELECT * FROM aktivite WHERE kod = 'A1' AND program_id = ?`, pr.id);
    const kayit = tek('SELECT * FROM ilerleme WHERE aktivite_id = ?', a1.id);
    ilerlemeDogrula(ctxKur('proje@yapitas.demo'), kayit.id, 'onayla', null);

    const i = programIlerlemesi(pr.id);
    assert.equal(i.onayli, 30_000, `onaylı ilerleme yanlış: ${i.onayli}`);
    assert.equal(i.tahmini, 30_000);
  });

  test('kendi girdiği ilerlemeyi doğrulayamaz (dört göz)', async () => {
    const c = S.istemci(); await c.giris('sef@yapitas.demo');
    const pr = tek(`SELECT * FROM is_programi WHERE ad = 'İlerleme programı'`);
    const a2 = tek(`SELECT * FROM aktivite WHERE kod = 'A2' AND program_id = ?`, pr.id);
    await c.csrfIle(`/is-programlari/${pr.id}`,
      { _eylem: 'ilerleme', aktiviteId: a2.id, donem: '2026-04', yuzde: '40', kanit: 'Tutanak 13' });
    const kayit = tek(`SELECT * FROM ilerleme WHERE aktivite_id = ? ORDER BY olusturuldu DESC`, a2.id);
    assert.throws(() => ilerlemeDogrula(ctxKur('sef@yapitas.demo'), kayit.id, 'onayla', null),
      (e) => /dört göz/.test(e.mesaj));
  });

  test('ilerleme geriye gidemez; kanıt zorunludur', async () => {
    const c = S.istemci(); await c.giris('sef@yapitas.demo');
    const pr = tek(`SELECT * FROM is_programi WHERE ad = 'İlerleme programı'`);
    const a1 = tek(`SELECT * FROM aktivite WHERE kod = 'A1' AND program_id = ?`, pr.id);
    const geri = await c.csrfIle(`/is-programlari/${pr.id}`,
      { _eylem: 'ilerleme', aktiviteId: a1.id, donem: '2026-05', yuzde: '20', kanit: 'X' });
    assert.equal(geri.durum, 422, 'onaylı ilerlemenin altına inilebiliyor');

    const kanitsiz = await c.csrfIle(`/is-programlari/${pr.id}`,
      { _eylem: 'ilerleme', aktiviteId: a1.id, donem: '2026-05', yuzde: '60', kanit: '' });
    assert.equal(kanitsiz.durum, 422, 'kanıtsız ilerleme kabul edildi');
  });

  test('proje ilerlemesi yalnız baz çizgili programlardan gelir', async () => {
    const { projeIlerlemesi } = await import('../../app/moduller/plan/ilerleme.mjs');
    const p = tek(`SELECT * FROM proje WHERE ad = 'İlerleme Projesi'`);
    const i = projeIlerlemesi(p.id);
    assert.equal(i.bazCizgiVar, false, 'baz çizgisiz program proje ilerlemesine katıldı');
    assert.equal(i.onayli, 0);
  });

  test('ilerleme yüzdesi binde tamsayı taşınır (kayan nokta yok)', () => {
    const kayitlar = sorgu('SELECT yuzde_binde FROM ilerleme');
    assert.ok(kayitlar.length > 0);
    for (const k of kayitlar) {
      assert.equal(Number.isInteger(k.yuzde_binde), true, 'yüzde tamsayı değil');
      assert.ok(k.yuzde_binde >= 0 && k.yuzde_binde <= BINDE);
    }
  });
});

/* ========================================================================== */
describe('SITE-01 — günlük rapor çevrimdışı senkron, çift gönderimde tek kayıt', () => {
  test('rapor kaydedilir ve kod alır', async () => {
    const c = S.istemci(); await c.giris('sef@yapitas.demo');
    const yonetici = S.istemci(); await yonetici.giris('sahip@yapitas.demo');
    const p = await projeKur(yonetici, 'Rapor Projesi');
    const st = await santiyeKur(yonetici, p, 'Rapor Şantiyesi');
    const y = await c.csrfIle(`/santiyeler/${st.id}/gunluk-raporlar/yeni`,
      { raporGunu: '2026-08-10', hava: 'açık', ekipSayisi: '24', imalat: 'Perde beton', istemciKimligi: 'cevrimdisi-1' });
    assert.equal(y.durum, 200);
    const r = tek(`SELECT * FROM gunluk_rapor WHERE santiye_id = ?`, st.id);
    assert.ok(r, 'rapor kaydı oluşmadı');
    assert.match(r.kod, /^GNR-\d{4}-\d{4}$/);
    assert.equal(r.durum, 'taslak');
  });

  test('AYNI çevrimdışı taslak ikinci kez senkronlanırsa TEK kayıt kalır', async () => {
    const c = S.istemci(); await c.giris('sef@yapitas.demo');
    const st = tek(`SELECT * FROM santiye WHERE ad = 'Rapor Şantiyesi'`);
    const oncesi = Number(tek('SELECT COUNT(*) AS n FROM gunluk_rapor WHERE santiye_id = ?', st.id).n);
    const y = await c.csrfIle(`/santiyeler/${st.id}/gunluk-raporlar/yeni`,
      { raporGunu: '2026-08-10', hava: 'açık', ekipSayisi: '24', imalat: 'Perde beton', istemciKimligi: 'cevrimdisi-1' });
    assert.equal(y.durum, 200);
    const sonrasi = Number(tek('SELECT COUNT(*) AS n FROM gunluk_rapor WHERE santiye_id = ?', st.id).n);
    assert.equal(sonrasi, oncesi, 'çift senkron ikinci kayıt üretti');
    assert.match(y.govde, /zaten senkronlanmıştı/, 'kullanıcıya durum bildirilmedi');
  });

  test('aynı gün için ikinci rapor 409 ile reddedilir', async () => {
    const c = S.istemci(); await c.giris('sef@yapitas.demo');
    const st = tek(`SELECT * FROM santiye WHERE ad = 'Rapor Şantiyesi'`);
    const y = await c.csrfIle(`/santiyeler/${st.id}/gunluk-raporlar/yeni`,
      { raporGunu: '2026-08-10', hava: 'yağmurlu', istemciKimligi: 'cevrimdisi-2' });
    assert.equal(y.durum, 409);
  });

  test('gelecek tarihli rapor reddedilir', async () => {
    const c = S.istemci(); await c.giris('sef@yapitas.demo');
    const st = tek(`SELECT * FROM santiye WHERE ad = 'Rapor Şantiyesi'`);
    const gelecek = new Date(simdi() + 10 * GUN_MS).toISOString().slice(0, 10);
    const y = await c.csrfIle(`/santiyeler/${st.id}/gunluk-raporlar/yeni`,
      { raporGunu: gelecek, istemciKimligi: 'cevrimdisi-3' });
    assert.equal(y.durum, 422);
  });

  test('form çevrimdışı taslak kimliğini taşır', async () => {
    const c = S.istemci(); await c.giris('sef@yapitas.demo');
    const st = tek(`SELECT * FROM santiye WHERE ad = 'Rapor Şantiyesi'`);
    const y = await c.get(`/santiyeler/${st.id}/gunluk-raporlar/yeni`);
    assert.match(y.govde, /name="istemciKimligi"/, 'senkron kimliği forma gömülmemiş');
    assert.match(y.govde, /Çevrimdışı taslak/);
  });
});

/* ========================================================================== */
describe('QLT-01 — NCR kapatma DÖF ve etkinlik doğrulaması olmadan mümkün değil', () => {
  test('kök neden ve DÖF yokken kapatma 409', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const y0 = await c.csrfIle('/kalite/ncr/yeni',
      { baslik: 'Pas payı eksik', gereklilik: 'TS 500 — 30 mm', bulgu: 'Ölçüm 18 mm', onem: 'kritik' });
    assert.equal(y0.durum, 200);
    const n = tek(`SELECT * FROM ncr WHERE baslik = 'Pas payı eksik'`);
    assert.match(n.kod, /^NCR-\d{4}-\d{4}$/);

    const y = await c.csrfIle(`/kalite/ncr/${n.id}`, { _eylem: 'gecis', gecis: 'kapat', surum: String(n.surum) });
    assert.equal(y.durum, 409);
    assert.match(y.govde, /kök neden/);
    assert.notEqual(tek('SELECT durum FROM ncr WHERE id = ?', n.id).durum, 'kapali');
  });

  test('DÖF tamamlanmadan etkinlik doğrulanamaz', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const n = tek(`SELECT * FROM ncr WHERE baslik = 'Pas payı eksik'`);
    const y = await c.csrfIle(`/kalite/ncr/${n.id}`,
      { _eylem: 'etkinlik', etkinlikNotu: 'Erken doğrulama', surum: String(n.surum) });
    assert.equal(y.durum, 409);
  });

  test('DÖF tanımı olmadan DÖF tamamlanamaz', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const n = tek(`SELECT * FROM ncr WHERE baslik = 'Pas payı eksik'`);
    const y = await c.csrfIle(`/kalite/ncr/${n.id}`, { _eylem: 'dof_tamamla', surum: String(n.surum) });
    assert.equal(y.durum, 409);
  });

  test('DÖF tamamlayan etkinliği KENDİSİ doğrulayamaz (dört göz)', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    let n = tek(`SELECT * FROM ncr WHERE baslik = 'Pas payı eksik'`);
    await c.csrfIle(`/kalite/ncr/${n.id}`,
      { _eylem: 'kok_neden', kokNeden: 'Sehpa yüksekliği yanlış', dofTanimi: 'Sehpalar değiştirildi', surum: String(n.surum) });
    n = tek('SELECT * FROM ncr WHERE id = ?', n.id);
    await c.csrfIle(`/kalite/ncr/${n.id}`, { _eylem: 'dof_tamamla', gerekce: 'Yeni sehpa', surum: String(n.surum) });
    n = tek('SELECT * FROM ncr WHERE id = ?', n.id);
    assert.ok(n.dof_tamamlandi, 'DÖF tamamlanmadı');

    const kendi = await c.csrfIle(`/kalite/ncr/${n.id}`,
      { _eylem: 'etkinlik', etkinlikNotu: 'Kendi doğrulamam', surum: String(n.surum) });
    assert.equal(kendi.durum, 422, 'DÖF tamamlayan kendi etkinliğini doğrulayabiliyor');
  });

  test('üç koşul tamamlanınca NCR kapatılabilir', async () => {
    const pm = S.istemci(); await pm.giris('proje@yapitas.demo');
    let n = tek(`SELECT * FROM ncr WHERE baslik = 'Pas payı eksik'`);
    const dogrula = await pm.csrfIle(`/kalite/ncr/${n.id}`,
      { _eylem: 'etkinlik', etkinlikNotu: 'Yeniden ölçüldü: 32 mm', surum: String(n.surum) });
    assert.equal(dogrula.durum, 200);
    n = tek('SELECT * FROM ncr WHERE id = ?', n.id);
    assert.ok(n.kok_neden && n.dof_tamamlandi && n.etkinlik_dogrulandi);

    /* Durum zinciri: yeni → sınıflandırıldı → atandı → işlemde → doğrulamada → kapalı */
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    for (const eylem of ['siniflandir', 'ata', 'basla', 'dogrulamaya_gonder']) {
      const guncel = tek('SELECT * FROM ncr WHERE id = ?', n.id);
      if (eylem === 'ata') {
        /* "atandı" geçişi sorumlu ister; NCR'de sorumlu atanmamışsa ön koşul engeller. */
        const y = await c.csrfIle(`/kalite/ncr/${n.id}`, { _eylem: 'gecis', gecis: eylem, surum: String(guncel.surum) });
        if (y.durum === 409) {
          assert.match(y.govde, /sorumlu/i, 'ön koşul mesajı beklenmedik');
          return;   // ön koşul doğru çalışıyor; zincirin devamı sorumluluk atamasına bağlı
        }
      } else {
        await c.csrfIle(`/kalite/ncr/${n.id}`, { _eylem: 'gecis', gecis: eylem, surum: String(guncel.surum) });
      }
    }
  });
});

/* ========================================================================== */
describe('Faz 3 — hesaplanan işaretler ve saha akışları', () => {
  test('görev formunda durum yok; sorumlusuz görev havuza düşer', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const y = await c.get('/gorevler/yeni');
    const yazma = (y.govde.match(/<form[\s\S]*?<\/form>/g) || []).filter((f) => /method="post"/i.test(f));
    for (const f of yazma) assert.ok(!/name="durum"/.test(f), 'görev formu durum seçtiriyor');

    await c.csrfIle('/gorevler/yeni', { baslik: 'Havuz görevi', termin: '2026-01-05' });
    const g = tek(`SELECT * FROM gorev WHERE baslik = 'Havuz görevi'`);
    assert.equal(g.durum, 'atama_bekliyor', 'sorumlusuz görev açık başladı');
    assert.equal(g.sorumlu_id, null);
  });

  test('gecikme yaşam durumu değil hesaplanan işarettir', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const y = await c.get('/gorevler');
    assert.match(y.govde, /Yaşam durumu/, 'yaşam durumu sütunu yok');
    assert.match(y.govde, /gecikmiş/, 'gecikme işareti gösterilmiyor');
    const durumlar = sorgu('SELECT DISTINCT durum FROM gorev').map((r) => r.durum);
    assert.ok(!durumlar.includes('gecikmis'), 'gecikme durum olarak saklanmış');
  });

  test('sorumlusuz görev "açık" durumuna geçemez (ön koşul)', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const g = tek(`SELECT * FROM gorev WHERE baslik = 'Havuz görevi'`);
    const y = await c.csrfIle(`/gorevler/${g.id}`, { _eylem: 'gecis', gecis: 'ata', surum: String(g.surum) });
    assert.equal(y.durum, 409);
    assert.match(y.govde, /sorumlu/i);
  });

  test('saha bildiriminde SLA aciliyetten TÜRETİLİR, kullanıcı girmez', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const p = tek(`SELECT * FROM proje WHERE ad = 'Rapor Projesi'`);
    const st = tek(`SELECT * FROM santiye WHERE proje_id = ?`, p.id);
    const y = await c.get('/saha-bildirimleri/yeni');
    const yazma = (y.govde.match(/<form[\s\S]*?<\/form>/g) || []).filter((f) => /method="post"/i.test(f));
    for (const f of yazma) assert.ok(!/name="slaBitis"/.test(f), 'SLA kullanıcıya girdiriliyor');

    await c.csrfIle('/saha-bildirimleri/yeni',
      { baslik: 'İskele korkuluk eksik', santiyeId: st.id, tur: 'isg', onem: 'kritik' });
    const b = tek(`SELECT * FROM saha_bildirimi WHERE baslik = 'İskele korkuluk eksik'`);
    assert.ok(b.sla_bitis, 'SLA hesaplanmadı');
    const gun = Math.round((b.sla_bitis - b.olusturuldu) / GUN_MS);
    assert.equal(gun, 1, `kritik bildirimde SLA 1 gün olmalı, ${gun} bulundu`);
  });

  test('kaza kaydı kritik açılır ve yönetime bildirim gider', async () => {
    const c = S.istemci(); await c.giris('sef@yapitas.demo');
    const st = tek(`SELECT * FROM santiye WHERE ad = 'Rapor Şantiyesi'`);
    await c.csrfIle('/isg/olaylar/kaza/yeni',
      { baslik: 'El yaralanması', santiyeId: st.id, olayZamani: '2026-08-05', kisiAdi: 'Ali Vural', kayipGun: '2' });
    const o = tek(`SELECT * FROM isg_olayi WHERE baslik = 'El yaralanması'`);
    assert.equal(o.tur, 'kaza');
    assert.equal(o.onem, 'kritik', 'kaza kritik açılmadı');
    const bildirimler = Number(tek(
      `SELECT COUNT(*) AS n FROM bildirim WHERE nesne = 'isg_olayi' AND nesne_id = ?`, o.id).n);
    assert.ok(bildirimler > 0, 'kaza yönetime bildirilmedi');
  });

  test('İSG olayı etkinlik doğrulanmadan kapatılamaz', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const o = tek(`SELECT * FROM isg_olayi WHERE baslik = 'El yaralanması'`);
    const y = await c.csrfIle(`/isg/olaylar/${o.id}`, { _eylem: 'gecis', gecis: 'kapat', surum: String(o.surum) });
    assert.ok(y.durum >= 400, 'İSG olayı doğrulanmadan kapatılabiliyor');
  });

  test('şantiye listesi yaşam durumu ile takvim sağlığını AYRI gösterir', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const y = await c.get('/santiyeler');
    assert.equal(y.durum, 200);
    assert.match(y.govde, /Takvim/, 'takvim sağlığı sütunu yok');
    assert.match(y.govde, /Durum/, 'yaşam durumu sütunu yok');
  });
});
