/* ============================================================================
   KABUL TESTLERİ — Faz 3 kalite ve doküman blokları
   QLT-04/09/13/14 zinciri · DOC-04..09 sürüm ve teslim kanıtı
   ========================================================================== */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { uygulamaBaslat } from '../yardimci.mjs';
import { sorgu, tek, calistir } from '../../app/cekirdek/db.mjs';

let S;
before(async () => { S = await uygulamaBaslat(); });
after(async () => { await S.kapat(); });

const yonetici = async () => { const c = S.istemci(); await c.giris('sahip@yapitas.demo'); return c; };

describe('Kalite zinciri — uygunsuzluk otomatik NCR açar (§7)', () => {
  test('uygunsuz test sonucu kritik NCR açar ve teste bağlar', async () => {
    const c = await yonetici();
    const oncesi = Number(tek('SELECT COUNT(*) AS n FROM ncr').n);
    await c.csrfIle('/kalite/testler', {
      numuneKodu: 'BET-001', testTuru: 'Basınç dayanımı',
      kabulKriteri: 'C30/37 ≥ 30 MPa', olculenDeger: '22', birim: 'MPa', sonuc: 'uygun_degil' });
    const t = tek(`SELECT * FROM test_sonucu WHERE numune_kodu = 'BET-001'`);
    assert.ok(t, 'test kaydı oluşmadı');
    assert.ok(t.ncr_id, 'uygunsuz test NCR açmadı');
    assert.equal(Number(tek('SELECT COUNT(*) AS n FROM ncr').n), oncesi + 1);
    assert.equal(tek('SELECT onem FROM ncr WHERE id = ?', t.ncr_id).onem, 'kritik');
  });

  test('uygun test NCR açmaz', async () => {
    const c = await yonetici();
    await c.csrfIle('/kalite/testler', {
      numuneKodu: 'BET-002', testTuru: 'Basınç dayanımı', olculenDeger: '35', birim: 'MPa', sonuc: 'uygun' });
    const t = tek(`SELECT * FROM test_sonucu WHERE numune_kodu = 'BET-002'`);
    assert.equal(t.ncr_id, null);
  });

  test('uygunsuz muayene NCR açar; uygun olmayan sonuçta not zorunlu', async () => {
    const c = await yonetici();
    await c.csrfIle('/kalite/muayeneler', { baslik: 'Donatı kontrolü', noktaTipi: 'H' });
    const m = tek(`SELECT * FROM muayene WHERE baslik = 'Donatı kontrolü'`);
    const notsuz = await c.csrfIle(`/kalite/muayeneler/${m.id}`,
      { sonuc: 'uygun_degil', surum: String(m.surum) });
    assert.equal(notsuz.durum, 422, 'notsuz uygunsuz sonuç kabul edildi');

    const ok = await c.csrfIle(`/kalite/muayeneler/${m.id}`,
      { sonuc: 'uygun_degil', sonucNotu: 'Donatı aralığı 20 cm yerine 25 cm', surum: String(m.surum) });
    assert.equal(ok.durum, 200);
    assert.ok(tek('SELECT ncr_id FROM muayene WHERE id = ?', m.id).ncr_id, 'muayene NCR açmadı');
  });

  test('sonuçlandırılmış muayene yeniden karara bağlanamaz', async () => {
    const c = await yonetici();
    const m = tek(`SELECT * FROM muayene WHERE baslik = 'Donatı kontrolü'`);
    const y = await c.csrfIle(`/kalite/muayeneler/${m.id}`,
      { sonuc: 'uygun', surum: String(m.surum) });
    assert.equal(y.durum, 409);
  });
});

describe('Submittal — karar kodu sürümle dondurulur', () => {
  test('C/D kararında gerekçe zorunlu, karar bir kez verilir', async () => {
    const c = await yonetici();
    await c.csrfIle('/teknik/submittal', { baslik: 'Cephe kaplama numunesi', tur: 'malzeme_onayi' });
    const s = tek(`SELECT * FROM submittal WHERE baslik = 'Cephe kaplama numunesi'`);
    const notsuz = await c.csrfIle(`/teknik/submittal/${s.id}`, { kararKodu: 'C', surum: String(s.surum) });
    assert.equal(notsuz.durum, 422, 'gerekçesiz C kararı kabul edildi');

    const ok = await c.csrfIle(`/teknik/submittal/${s.id}`,
      { kararKodu: 'C', kararNotu: 'Renk kodu şartnameye uymuyor', surum: String(s.surum) });
    assert.equal(ok.durum, 200);
    const guncel = tek('SELECT * FROM submittal WHERE id = ?', s.id);
    assert.equal(guncel.karar_kodu, 'C');
    assert.equal(guncel.durum, 'revizyon_istendi');

    const ikinci = await c.csrfIle(`/teknik/submittal/${s.id}`,
      { kararKodu: 'A', surum: String(guncel.surum) });
    assert.equal(ikinci.durum, 409, 'karara bağlanmış sürüm yeniden karara bağlandı');
  });
});

describe('RFI — SLA türetilir, yanıt kapsam etkisini taşır', () => {
  test('SLA gerekli tarihten türer; kullanıcı SLA alanı görmez', async () => {
    const c = await yonetici();
    const form = await c.get('/teknik/rfi/yeni');
    assert.ok(!/name="slaBitis"/.test(form.govde), 'SLA kullanıcıya girdiriliyor');
    await c.csrfIle('/teknik/rfi/yeni', {
      baslik: 'Aks 4-5 kolon detayı', soru: 'Birleşim detayı belirsiz.',
      etkiKapsam: '1', etkiSure: '0', etkiMaliyet: '0', gerekliTarih: '2026-08-20' });
    const r = tek(`SELECT * FROM rfi WHERE baslik = 'Aks 4-5 kolon detayı'`);
    assert.ok(r.sla_bitis, 'SLA hesaplanmadı');
  });

  test('kapsam etkili RFI yanıtı değişiklik tetikler', async () => {
    const c = await yonetici();
    const r = tek(`SELECT * FROM rfi WHERE baslik = 'Aks 4-5 kolon detayı'`);
    const y = await c.csrfIle(`/teknik/rfi/${r.id}`,
      { _eylem: 'yanitla', yanit: 'Detay MP-301 rev.B geçerlidir.', surum: String(r.surum) });
    assert.equal(y.durum, 200);
    const guncel = tek('SELECT * FROM rfi WHERE id = ?', r.id);
    assert.equal(guncel.degisiklik_tetikledi, 1, 'kapsam etkisi değişiklik tetiklemedi');
    assert.ok(guncel.yanit_tarihi && guncel.yanitlayan);
  });

  test('yanıtlanmış RFI yeniden yanıtlanamaz', async () => {
    const c = await yonetici();
    const r = tek(`SELECT * FROM rfi WHERE baslik = 'Aks 4-5 kolon detayı'`);
    const y = await c.csrfIle(`/teknik/rfi/${r.id}`,
      { _eylem: 'yanitla', yanit: 'İkinci yanıt', surum: String(r.surum) });
    assert.equal(y.durum, 409);
  });
});

describe('Punch — kapanış kanıt ister', () => {
  test('kanıtsız kapatma reddedilir, kanıtlı kapatma kaydedilir', async () => {
    const c = await yonetici();
    await c.csrfIle('/kalite/punch', { baslik: 'Boya rötuşu', lokasyon: 'A blok 3. kat', onem: 'uyari' });
    const p = tek(`SELECT * FROM punch WHERE baslik = 'Boya rötuşu'`);
    const kanitsiz = await c.csrfIle(`/kalite/punch/${p.id}`, { _eylem: 'kapat', surum: String(p.surum) });
    assert.equal(kanitsiz.durum, 422);
    assert.notEqual(tek('SELECT durum FROM punch WHERE id = ?', p.id).durum, 'kapali');

    const ok = await c.csrfIle(`/kalite/punch/${p.id}`,
      { _eylem: 'kapat', kapanisKaniti: 'Foto 2026-08-11-14', surum: String(p.surum) });
    assert.equal(ok.durum, 200);
    assert.equal(tek('SELECT durum FROM punch WHERE id = ?', p.id).durum, 'kapali');
  });
});

describe('DOC-04/05 — çizim revizyonu değiştirilemez', () => {
  test('revizyon yayınlanınca "son geçerli sürüm" güncellenir', async () => {
    const c = await yonetici();
    await c.csrfIle('/cizimler', { cizimNo: 'MP-201', ad: 'Kat planı', disiplin: 'mimari' });
    const cz = tek(`SELECT * FROM cizim WHERE kod = 'MP-201'`);
    assert.equal(cz.aktif_revizyon, null);
    await c.csrfIle(`/cizimler/${cz.id}`, { revizyon: 'A', aciklama: 'İlk yayın', surum: String(cz.surum) });
    assert.equal(tek('SELECT aktif_revizyon FROM cizim WHERE id = ?', cz.id).aktif_revizyon, 'A');
  });

  test('aynı revizyon kodu ikinci kez yayınlanamaz', async () => {
    const c = await yonetici();
    const cz = tek(`SELECT * FROM cizim WHERE kod = 'MP-201'`);
    const y = await c.csrfIle(`/cizimler/${cz.id}`, { revizyon: 'A', surum: String(cz.surum) });
    assert.equal(y.durum, 409);
  });

  test('revizyon satırı veritabanı düzeyinde değiştirilemez', () => {
    const r = tek('SELECT * FROM cizim_revizyonu LIMIT 1');
    assert.throws(() => calistir(`UPDATE cizim_revizyonu SET aciklama = 'x' WHERE id = ?`, r.id), /degistirilemez/);
  });
});

describe('DOC-06/07 — transmittal teslim kanıtı zorunlu', () => {
  test('boş transmittal gönderilemez', async () => {
    const c = await yonetici();
    await c.csrfIle('/transmittal/yeni', { alici: 'Müşavir A.Ş.', amacKodu: 'onay' });
    const t = tek(`SELECT * FROM transmittal WHERE alici = 'Müşavir A.Ş.'`);
    const y = await c.csrfIle(`/transmittal/${t.id}`, { _eylem: 'gonder', surum: String(t.surum) });
    assert.equal(y.durum, 409);
  });

  test('kalem eklendiğinde gönderim anındaki revizyon DONDURULUR', async () => {
    const c = await yonetici();
    const t = tek(`SELECT * FROM transmittal WHERE alici = 'Müşavir A.Ş.'`);
    const cz = tek(`SELECT * FROM cizim WHERE kod = 'MP-201'`);
    await c.csrfIle(`/transmittal/${t.id}`, { _eylem: 'kalem', cizimId: cz.id });
    const k = tek('SELECT * FROM transmittal_kalemi WHERE transmittal_id = ?', t.id);
    assert.equal(k.revizyon, cz.aktif_revizyon, 'gönderilen revizyon dondurulmadı');
  });

  test('teslim kanıtı olmadan "teslim edildi" olmaz', async () => {
    const c = await yonetici();
    let t = tek(`SELECT * FROM transmittal WHERE alici = 'Müşavir A.Ş.'`);
    await c.csrfIle(`/transmittal/${t.id}`, { _eylem: 'gonder', surum: String(t.surum) });
    t = tek('SELECT * FROM transmittal WHERE id = ?', t.id);
    assert.equal(t.durum, 'gonderildi');

    const kanitsiz = await c.csrfIle(`/transmittal/${t.id}`, { _eylem: 'teslim', surum: String(t.surum) });
    assert.equal(kanitsiz.durum, 422);

    const ok = await c.csrfIle(`/transmittal/${t.id}`,
      { _eylem: 'teslim', teslimKaniti: 'İmzalı tutanak 2026-08-11', surum: String(t.surum) });
    assert.equal(ok.durum, 200);
    assert.equal(tek('SELECT durum FROM transmittal WHERE id = ?', t.id).durum, 'teslim_edildi');
  });

  test('gönderilmiş transmittale belge eklenemez', async () => {
    const c = await yonetici();
    const t = tek(`SELECT * FROM transmittal WHERE alici = 'Müşavir A.Ş.'`);
    const cz = tek(`SELECT * FROM cizim WHERE kod = 'MP-201'`);
    const y = await c.csrfIle(`/transmittal/${t.id}`, { _eylem: 'kalem', cizimId: cz.id });
    assert.equal(y.durum, 409);
  });
});

describe('Yeni ekranlar ortak kalıba uyuyor (UI-01, UI-02 regresyonu)', () => {
  const rotalar = ['/kalite', '/kalite/itp', '/kalite/muayeneler', '/teknik/submittal',
    '/teknik/rfi', '/kalite/testler', '/kalite/punch', '/cizimler', '/transmittal',
    '/evrak', '/dokumanlar/dagitim-matrisi', '/dokumanlar/arsiv'];

  test('hepsi açılıyor ve sayfa başlığı kalıbını taşıyor', async () => {
    const c = await yonetici();
    for (const r of rotalar) {
      const y = await c.get(r);
      assert.equal(y.durum, 200, `${r} açılmıyor`);
      assert.match(y.govde, /class="gv-page-head"/, `${r}: page-head yok`);
      assert.match(y.govde, /class="gv-crumbs"/, `${r}: breadcrumb yok`);
    }
  });

  test('liste ekranları sayfalama standardını taşıyor', async () => {
    const c = await yonetici();
    for (const r of ['/kalite/itp', '/kalite/muayeneler', '/teknik/rfi', '/cizimler', '/evrak']) {
      const y = await c.get(r);
      assert.match(y.govde, /class="gv-pager"/, `${r}: sayfalama yok`);
      assert.match(y.govde, /Sayfa boyutu/, `${r}: sayfa boyutu seçimi yok`);
    }
  });

  test('hiçbir yazma formunda durum veya onaycı alanı yok', async () => {
    const c = await yonetici();
    for (const r of rotalar) {
      const y = await c.get(r);
      const yazma = (y.govde.match(/<form[\s\S]*?<\/form>/g) || []).filter((f) => /method="post"/i.test(f));
      for (const f of yazma) {
        assert.ok(!/name="durum"/.test(f), `${r}: form durum seçtiriyor`);
        assert.ok(!/name="(onayci|onaylayan)"/.test(f), `${r}: form onaycı seçtiriyor`);
      }
    }
  });

  test('yetkisiz kullanıcı kalite ve doküman ekranlarına erişemez', async () => {
    const c = S.istemci(); await c.giris('calisan@yapitas.demo');
    for (const r of ['/kalite/ncr', '/teknik/rfi', '/cizimler', '/transmittal']) {
      const y = await c.get(r);
      assert.equal(y.durum, 403, `${r}: çalışan erişebiliyor`);
    }
  });
});
