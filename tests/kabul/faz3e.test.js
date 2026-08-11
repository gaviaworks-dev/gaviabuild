/* ============================================================================
   KABUL TESTLERİ — Faz 3 şantiye tamamlama (SITE-04, 05, 12..16)
   ----------------------------------------------------------------------------
   SITE-05  açılış kontrolü tamamlanmadan şantiye "aktif" olamaz
   SITE-12  çıkış verilmeyen ziyaretçi "sahada" sayılır ve kapanışı engeller
   SITE-13  belge durumu SEÇİLMEZ; adlandırılmış eylemle değişir, süre hesaplanır
   SITE-14/15  kesin kabul, onaylı geçici kabul olmadan açılamaz
   SITE-16  §7: engel listesi sıfırlanmadan şantiye "kapalı" duruma geçemez
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

let ste = null;
async function kurulum(c) {
  if (ste) return ste;
  await c.csrfIle('/projeler/yeni', { ad: 'Kapanış Test Projesi', _idempotency: 'kp-prj' });
  const proje = tek(`SELECT * FROM proje WHERE ad = 'Kapanış Test Projesi'`);
  await c.csrfIle('/santiyeler/yeni',
    { ad: 'Kapanış Test Şantiyesi', projeId: proje.id, _idempotency: 'kp-ste' });
  ste = tek(`SELECT * FROM santiye WHERE ad = 'Kapanış Test Şantiyesi'`);
  return ste;
}
const guncel = () => tek('SELECT * FROM santiye WHERE id = ?', ste.id);

describe('SITE-04 — şantiye düzenle', () => {
  test('temel veri sürümlü güncellenir; eski sürüm 409 alır', async () => {
    const c = await yonetici();
    const s = await kurulum(c);
    const form = await c.get(`/santiyeler/${s.id}/duzenle`);
    assert.equal(form.durum, 200);
    assert.match(form.govde, /name="surum"/, 'form kayıt sürümünü taşımıyor');

    const ok = await c.csrfIle(`/santiyeler/${s.id}/duzenle`, {
      ad: s.ad, projeId: s.proje_id, il: 'İstanbul', ilce: 'Kartal',
      adres: 'Örnek Mah. 1. Sk.', baslangic: '2026-03-01', surum: String(s.surum) });
    assert.equal(ok.durum, 200);
    assert.equal(guncel().il, 'İstanbul');

    const eski = await c.csrfIle(`/santiyeler/${s.id}/duzenle`, {
      ad: s.ad, projeId: s.proje_id, il: 'Ankara', surum: String(s.surum) });
    assert.equal(eski.durum, 409, 'eski sürümle güncelleme kabul edildi');
  });

  test('durum alanı formda yok — yaşam durumu buradan değişmez', async () => {
    const c = await yonetici();
    const r = await c.get(`/santiyeler/${ste.id}/duzenle`);
    const formlar = r.govde.match(/<form method="post"[\s\S]*?<\/form>/g) || [];
    assert.ok(formlar.length > 0);
    for (const f of formlar) assert.ok(!/name="durum"/.test(f), 'düzenleme formu durum seçtiriyor');
  });
});

describe('SITE-05 — açılış kontrolü tamamlanmadan şantiye açılmaz', () => {
  test('eksik kontrolle "aç" reddedilir (geçiş motoru düzeyinde)', async () => {
    const c = await yonetici();
    const s = guncel();
    const sayfa = await c.get(`/santiyeler/${s.id}/acilis`);
    assert.equal(sayfa.durum, 200);
    assert.match(sayfa.govde, /Açılış kontrol listesi/);

    const hazirlik = await c.csrfIle(`/santiyeler/${s.id}/acilis`, { _eylem: 'hazirliga_al' });
    assert.equal(hazirlik.durum, 200);
    assert.equal(guncel().durum, 'hazirlik');

    const ac = await c.csrfIle(`/santiyeler/${s.id}/acilis`, { _eylem: 'ac' });
    assert.equal(ac.durum, 409, 'eksik kontrolle şantiye açıldı');
    assert.equal(guncel().durum, 'hazirlik');
  });

  test('SITE-03 detayındaki geçiş menüsünden de açılamaz (motor aynı ön koşulu uygular)', async () => {
    const c = await yonetici();
    const s = guncel();
    const y = await c.csrfIle(`/santiyeler/${s.id}`,
      { _eylem: 'gecis', gecis: 'ac', surum: String(s.surum) });
    assert.equal(y.durum, 409, 'detay ekranı açılış kontrolünü atlattı');
  });

  test('zorunlu belge + şef + ekip tamamlanınca açılır', async () => {
    const c = await yonetici();
    const s = guncel();
    const sef = tek(`SELECT id FROM kullanici WHERE eposta = 'sef@yapitas.demo'`);
    await c.csrfIle(`/santiyeler/${s.id}/duzenle`, {
      ad: s.ad, projeId: s.proje_id, il: s.il, ilce: s.ilce, adres: s.adres,
      baslangic: '2026-03-01', sefId: sef.id, surum: String(s.surum) });

    await c.csrfIle(`/santiyeler/${s.id}/izinler`,
      { ad: 'Yapı ruhsatı', tur: 'ruhsat', zorunlu: '1', gecerlilik: '2028-12-31' });

    await c.csrfIle('/personel/yeni',
      { adSoyad: 'Saha Elemanı', tcNo: '22222222222', gorev: 'Usta', iseGiris: '2026-03-01',
        _idempotency: 'kp-per' });
    const p = tek(`SELECT * FROM personel WHERE ad_soyad = 'Saha Elemanı'`);
    await c.csrfIle('/personel-atamalari',
      { personelId: p.id, santiyeId: s.id, gorev: 'Usta', baslangic: '2026-03-01' });

    const ac = await c.csrfIle(`/santiyeler/${guncel().id}/acilis`, { _eylem: 'ac' });
    assert.equal(ac.durum, 200);
    assert.equal(guncel().durum, 'aktif');
  });
});

describe('SITE-13 — belge durumu seçilmez, eylemle değişir', () => {
  test('süresi dolmuş belge HESAPLANIR (saklanan durum değil)', async () => {
    const c = await yonetici();
    await c.csrfIle(`/santiyeler/${ste.id}/izinler`,
      { ad: 'Geçici yol izni', tur: 'yol_izni', gecerlilik: '2020-01-01' });
    const b = tek(`SELECT * FROM santiye_belgesi WHERE ad = 'Geçici yol izni'`);
    assert.equal(b.durum, 'gecerli', 'süresi dolma DURUM olarak saklanmış');
    const r = await c.get(`/santiyeler/${ste.id}/izinler`);
    assert.match(r.govde, /Süresi doldu/, 'süre aşımı işareti hesaplanmıyor');
  });

  test('yenileme yeni geçerlilik tarihi olmadan kabul edilmez', async () => {
    const c = await yonetici();
    const b = tek(`SELECT * FROM santiye_belgesi WHERE ad = 'Geçici yol izni'`);
    const eksik = await c.csrfIle(`/santiyeler/${ste.id}/izinler`,
      { _eylem: 'durum', id: b.id, surum: String(b.surum), belgeEylemi: 'yenilendi' });
    assert.equal(eksik.durum, 422);

    const gecmis = await c.csrfIle(`/santiyeler/${ste.id}/izinler`,
      { _eylem: 'durum', id: b.id, surum: String(b.surum), belgeEylemi: 'yenilendi',
        yeniGecerlilik: '2020-06-01' });
    assert.equal(gecmis.durum, 422, 'geçmiş tarih yenileme sayıldı');

    const ok = await c.csrfIle(`/santiyeler/${ste.id}/izinler`,
      { _eylem: 'durum', id: b.id, surum: String(b.surum), belgeEylemi: 'yenilendi',
        yeniGecerlilik: '2030-01-01' });
    assert.equal(ok.durum, 200);
    assert.ok(tek('SELECT gecerlilik FROM santiye_belgesi WHERE id = ?', b.id).gecerlilik > Date.now());
  });

  test('iptal gerekçesiz yapılamaz', async () => {
    const c = await yonetici();
    const b = tek(`SELECT * FROM santiye_belgesi WHERE ad = 'Geçici yol izni'`);
    const y = await c.csrfIle(`/santiyeler/${ste.id}/izinler`,
      { _eylem: 'durum', id: b.id, surum: String(b.surum), belgeEylemi: 'iptal_et' });
    assert.equal(y.durum, 422);
  });
});

describe('SITE-12 — saha giriş kaydı', () => {
  test('giriş saati sunucudan gelir; çıkış verilmeyen kayıt sahada sayılır', async () => {
    const c = await yonetici();
    const y = await c.csrfIle(`/santiyeler/${ste.id}/ziyaretciler`,
      { adSoyad: 'Denetim Ekibi', tur: 'denetim', firma: 'Belediye', amac: 'Ruhsat kontrolü' });
    assert.equal(y.durum, 200);
    const z = tek(`SELECT * FROM ziyaretci WHERE ad_soyad = 'Denetim Ekibi'`);
    assert.equal(z.durum, 'sahada');
    assert.ok(z.giris > 0 && z.cikis == null);

    const r = await c.get(`/santiyeler/${ste.id}/ziyaretciler`);
    assert.match(r.govde, /1 kişi hâlâ sahada/);
  });

  test('çıkış verilen kayıt tekrar kapatılamaz', async () => {
    const c = await yonetici();
    const z = tek(`SELECT * FROM ziyaretci WHERE ad_soyad = 'Denetim Ekibi'`);
    const ilk = await c.csrfIle(`/santiyeler/${ste.id}/ziyaretciler`,
      { _eylem: 'cikis', id: z.id, surum: String(z.surum) });
    assert.equal(ilk.durum, 200);
    assert.equal(tek('SELECT durum FROM ziyaretci WHERE id = ?', z.id).durum, 'cikti');

    const guncelZ = tek('SELECT * FROM ziyaretci WHERE id = ?', z.id);
    const ikinci = await c.csrfIle(`/santiyeler/${ste.id}/ziyaretciler`,
      { _eylem: 'cikis', id: z.id, surum: String(guncelZ.surum) });
    assert.equal(ikinci.durum, 409);
  });
});

describe('SITE-14 / SITE-15 — kabul zinciri', () => {
  test('kesin kabul, onaylı geçici kabul olmadan açılamaz', async () => {
    const c = await yonetici();
    const y = await c.csrfIle(`/santiyeler/${ste.id}/kesin-kabul`,
      { _eylem: 'ac', komisyon: 'Kabul komisyonu' });
    assert.equal(y.durum, 409, 'geçici kabul olmadan kesin kabul açıldı');
    assert.equal(Number(tek(`SELECT COUNT(*) AS n FROM kabul WHERE tur = 'kesin'`).n), 0);
  });

  test('geçici kabul açılır, onaya gider ve onay zinciriyle onaylanır', async () => {
    const c = await yonetici();
    const ac = await c.csrfIle(`/santiyeler/${ste.id}/gecici-kabul`,
      { _eylem: 'ac', komisyon: 'Kabul komisyonu', kabulTarihi: '2026-08-01', garantiAy: '24' });
    assert.equal(ac.durum, 200);
    const k = tek(`SELECT * FROM kabul WHERE santiye_id = ? AND tur = 'gecici'`, ste.id);
    assert.equal(k.durum, 'taslak');
    assert.ok(k.garanti_bitis > k.kabul_tarihi, 'garanti bitişi hesaplanmadı');

    const ikinci = await c.csrfIle(`/santiyeler/${ste.id}/gecici-kabul`, { _eylem: 'ac' });
    assert.equal(ikinci.durum, 409, 'ikinci geçici kabul dosyası açıldı');

    const gonder = await c.csrfIle(`/santiyeler/${ste.id}/gecici-kabul`, { _eylem: 'onaya_gonder' });
    assert.equal(gonder.durum, 200);
    assert.equal(tek('SELECT durum FROM kabul WHERE id = ?', k.id).durum, 'onaya_gonderildi');

    const talep = tek(`SELECT * FROM onay_talebi WHERE nesne = 'kabul' AND nesne_id = ?`, k.id);
    assert.ok(talep, 'kabul için onay talebi açılmadı');

    const pm = await olarak('proje@yapitas.demo');
    assert.equal((await pm.csrfIle(`/onaylar/${talep.id}`,
      { karar: 'onayla', belgeSurum: String(talep.belge_surum) })).durum, 200);
    /* İkinci adım firma sahibi; talebi o açtığı için karar veremez (dört göz). */
    const kendi = await c.csrfIle(`/onaylar/${talep.id}`,
      { karar: 'onayla', belgeSurum: String(talep.belge_surum) });
    assert.equal(kendi.durum, 403, 'talep sahibi kendi talebini onayladı');
  });
});

describe('SITE-16 — kapanış engelleri (§7)', () => {
  test('engel varken kapanış onayına gönderilemez', async () => {
    const c = await yonetici();
    const sayfa = await c.get(`/santiyeler/${ste.id}/kapat`);
    assert.equal(sayfa.durum, 200);
    assert.match(sayfa.govde, /kapanış engeli açık/);

    await c.csrfIle(`/santiyeler/${ste.id}/kapat`, { _eylem: 'kapanisa_al', gerekce: 'Kapanış başlıyor' });
    assert.equal(guncel().durum, 'kapanista');

    const y = await c.csrfIle(`/santiyeler/${ste.id}/kapat`,
      { _eylem: 'onaya_gonder', gerekce: 'Kapanış' });
    assert.equal(y.durum, 409, 'engel varken kapanış onayına gidildi');
  });

  test('engel varken "kapat" geçişi motor tarafından reddedilir', async () => {
    const c = await yonetici();
    const s = guncel();
    const y = await c.csrfIle(`/santiyeler/${s.id}/kapat`, { _eylem: 'kapat', gerekce: 'Kapat' });
    assert.equal(y.durum, 409);
    assert.equal(guncel().durum, 'kapanista');

    /* Detay ekranındaki geçiş menüsü de aynı ön koşulu uygular. */
    const detay = await c.csrfIle(`/santiyeler/${s.id}`,
      { _eylem: 'gecis', gecis: 'kapat', gerekce: 'Kapat', surum: String(s.surum) });
    assert.equal(detay.durum, 409, 'detay ekranı kapanış engelini atlattı');
    assert.equal(guncel().durum, 'kapanista');
  });

  test('Faz 4 kalemleri "denetlenmedi" olarak görünür ve engel sayılır', async () => {
    const c = await yonetici();
    const r = await c.get(`/santiyeler/${ste.id}/kapat`);
    assert.match(r.govde, /Stok bakiyesi sıfırlandı/);
    assert.match(r.govde, /Faz 4&#39;te bağlanacak|Faz 4'te bağlanacak/);
    assert.ok(!/temiz<\/span>\s*<\/span><\/td><td[^>]*><span class="td-icerik"><b>Stok/.test(r.govde),
      'bağlanmamış kontrol "temiz" gösteriliyor');
  });
});

describe('Şantiye tamamlama ekranları ortak kalıba ve yetkiye uyar', () => {
  const YOLLAR = (id) => [
    `/santiyeler/${id}/duzenle`, `/santiyeler/${id}/acilis`, `/santiyeler/${id}/ziyaretciler`,
    `/santiyeler/${id}/izinler`, `/santiyeler/${id}/gecici-kabul`, `/santiyeler/${id}/kesin-kabul`,
    `/santiyeler/${id}/kapat`,
  ];

  test('hepsi 200 döner ve page-head kalıbını taşır', async () => {
    const c = await yonetici();
    for (const yol of YOLLAR(ste.id)) {
      const r = await c.get(yol);
      assert.equal(r.durum, 200, `${yol} açılmadı`);
      assert.match(r.govde, /class="gv-page-head"/, `${yol} page-head taşımıyor`);
    }
  });

  test('yazma formlarında durum veya onaycı alanı yok (kural 5)', async () => {
    const c = await yonetici();
    for (const yol of YOLLAR(ste.id)) {
      const r = await c.get(yol);
      for (const f of r.govde.match(/<form method="post"[\s\S]*?<\/form>/g) || []) {
        assert.ok(!/name="durum"/.test(f), `${yol} yazma formunda durum alanı var`);
        assert.ok(!/name="onayci/i.test(f), `${yol} yazma formunda onaycı alanı var`);
      }
    }
  });

  test('yetkisiz rol şantiye tamamlama ekranlarına erişemez', async () => {
    const c = await olarak('satinalma@yapitas.demo');   // bolumler: calisma, satinalma, stok, rapor
    for (const yol of YOLLAR(ste.id)) {
      const r = await c.get(yol);
      assert.equal(r.durum, 403, `${yol} yetkisiz role açıldı`);
    }
  });

  test('liste ekranları sayfalama standardını taşır (§3.5)', async () => {
    const c = await yonetici();
    for (const yol of [`/santiyeler/${ste.id}/ziyaretciler`, `/santiyeler/${ste.id}/izinler`]) {
      const r = await c.get(yol);
      assert.match(r.govde, /class="gv-pager"/, `${yol} sayfalayıcı yok`);
      assert.match(r.govde, /Veri tarihi/, `${yol} veri tarihi künyesi yok`);
    }
  });
});
