/* ============================================================================
   KABUL TESTLERİ — Faz 6: Rapor, mobil ve portallar
   ----------------------------------------------------------------------------
   §11 RPT-01: "Ekran, PDF ve Excel AYNI FİLTRE, VERİ TARİHİ, TOPLAM ve RAPOR
   SÜRÜMÜNÜ taşır." Bu dosyanın çekirdeği o eşitliğin GERÇEK çıktılar üzerinde
   kanıtlanmasıdır: PDF baytları çözülür, XLSX ZIP'i açılır ve künye satırları
   ekranla karşılaştırılır.

   Ayrıca §12'nin dış erişim, mobil ve arama maddeleri:
     · tokenli, kapsamı daraltılmış portal erişimi
     · çevrimdışı taslak: çift gönderimde tek kayıt (SITE-01 kalıbı)
     · arama yetkiyi ve kapsamı aşmaz
     · saklama süresi dolan belge otomatik silinmez
   ========================================================================== */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync, inflateRawSync } from 'node:zlib';
import { uygulamaBaslat } from '../yardimci.mjs';
import { sorgu, tek, calistir } from '../../app/cekirdek/db.mjs';
import { manifest } from '../../app/cekirdek/yapilandirma.mjs';
import { uygulananKodlar } from '../../app/rotalar.mjs';
import { RAPORLAR, formulSozlugu } from '../../app/moduller/rapor/tanimlar.mjs';
import { tokenOzeti } from '../../app/cekirdek/kimlikler.mjs';

let S;
before(async () => { S = await uygulamaBaslat(); });
after(async () => { await S.kapat(); });

const olarak = async (eposta) => { const c = S.istemci(); await c.giris(eposta); return c; };
const V = {};

/** Çıktıyı BAYT olarak indirir (test istemcisi metin okur; ikili çıktı bozulur). */
async function ikiliCek(c, yol) {
  const cerez = [...c.cerezler].map(([k, v]) => `${k}=${v}`).join('; ');
  const y = await fetch(S.taban + yol, { headers: { cookie: cerez } });
  return { durum: y.status, tur: y.headers.get('content-type'),
    ad: y.headers.get('content-disposition'), govde: Buffer.from(await y.arrayBuffer()) };
}

/** PDF içeriğini çözer: tüm Flate akışlarını açıp metin operatörlerini toplar. */
function pdfMetni(buf) {
  let cikti = '';
  const re = /\/Length (\d+) \/Filter \/FlateDecode >>\s*stream\r?\n/g;
  let m;
  while ((m = re.exec(buf.toString('latin1'))) !== null) {
    const n = Number(m[1]);
    try { cikti += inflateSync(buf.subarray(m.index + m[0].length, m.index + m[0].length + n))
      .toString('latin1'); } catch { /* akış değilse atla */ }
  }
  /* `(metin) Tj` operatörlerinden düz metni çıkar ve Türkçe gliflerini geri çevir. */
  const HARF = { 0x80: 'ı', 0x81: 'ğ', 0x82: 'ş', 0x83: 'İ', 0x84: 'Ğ', 0x85: 'Ş',
    0x87: '–', 0x88: '—', 0x8e: '…', 0x8f: 'Σ' };
  return [...cikti.matchAll(/\(((?:\\.|[^()\\])*)\) Tj/g)]
    .map((x) => [...x[1]].map((ch) => HARF[ch.charCodeAt(0)] ?? ch).join(''))
    .join('\n');
}

/** XLSX ZIP'inden bir dosyayı çıkarır (deflate, tek dosya). */
function xlsxDosya(buf, ad) {
  const metin = buf.toString('latin1');
  const adIndeks = metin.indexOf(ad);
  assert.ok(adIndeks > 0, `${ad} arşivde yok`);
  /* Yerel başlık: ad indeksinden 30 bayt geri. */
  const bas = adIndeks - 30;
  assert.equal(buf.readUInt32LE(bas), 0x04034b50, 'yerel ZIP başlığı bulunamadı');
  const sikistirilmis = buf.readUInt32LE(bas + 18);
  const adUzunluk = buf.readUInt16LE(bas + 26);
  const ekUzunluk = buf.readUInt16LE(bas + 28);
  const veriBas = bas + 30 + adUzunluk + ekUzunluk;
  return inflateRawSync(buf.subarray(veriBas, veriBas + sikistirilmis)).toString('utf8');
}

/* ==========================================================================
   Kural 1 — manifest kapsaması
   ========================================================================== */
describe('Kural 1 — manifestteki her ekran bir rotaya bağlı', () => {
  test('244 sayfa ailesinin tamamı uygulandı', () => {
    const kodlar = uygulananKodlar();
    const eksik = manifest().ekranlar.filter((e) => !kodlar.has(e.kod)).map((e) => e.kod);
    assert.deepEqual(eksik, [], `rotaya bağlanmamış ekran: ${eksik.join(', ')}`);
    assert.equal(manifest().ekranlar.length, 244);
  });
});

/* ==========================================================================
   Gerçek veri kurulumu — raporlar boş küme üzerinde sınanmaz
   ========================================================================== */
describe('rapor verisi kurulur', () => {
  test('proje, şantiye, depo ve stok hareketi oluşturulur', async () => {
    const c = await olarak('sahip@yapitas.demo');
    await c.csrfIle('/projeler/yeni', { ad: 'Faz6 Rapor Projesi', _idempotency: 'f6-p' });
    V.proje = tek(`SELECT * FROM proje WHERE ad = 'Faz6 Rapor Projesi'`);
    await c.csrfIle('/santiyeler/yeni',
      { ad: 'Faz6 Şantiyesi', projeId: V.proje.id, _idempotency: 'f6-s' });
    V.santiye = tek(`SELECT * FROM santiye WHERE ad = 'Faz6 Şantiyesi'`);

    const d = await olarak('depo@yapitas.demo');
    await d.csrfIle('/depolar', { ad: 'Faz6 Deposu', tur: 'santiye', santiyeId: V.santiye.id });
    V.depo = tek(`SELECT * FROM depo WHERE ad = 'Faz6 Deposu'`);
    await d.csrfIle('/stok-kartlari',
      { kod: 'F6-CIM', ad: 'Çimento ışığı', birim: 'ton', kritikSeviye: '50' });
    V.kart = tek(`SELECT * FROM stok_karti WHERE kod = 'F6-CIM'`);
    const y = await d.csrfIle('/stok/sarf',
      { tur: 'iade', depoId: V.depo.id, kartId: V.kart.id, miktar: '12,5', aciklama: 'giriş' });
    assert.equal(y.durum, 200);
  });
});

/* ==========================================================================
   RPT-01 — EKRAN = PDF = EXCEL (§11'in çekirdek maddesi)
   ========================================================================== */
describe('RPT-01 — ekran, PDF ve Excel aynı filtre/veri tarihi/toplam/sürümü taşır', () => {
  test('ekran künyesi okunur', async () => {
    const c = await olarak('sahip@yapitas.demo');
    const r = await c.get('/raporlar/stok');
    assert.equal(r.durum, 200);
    V.ekranKunye = Object.fromEntries(
      [...r.govde.matchAll(/<dt>([^<]+)<\/dt><dd>([^<]*)<\/dd>/g)].map((m) => [m[1], m[2]]));
    assert.ok(V.ekranKunye['Veri tarihi'], 'ekranda veri tarihi yok');
    assert.equal(V.ekranKunye['Rapor sürümü'], 'v1');
    assert.equal(V.ekranKunye['Kayıt sayısı'], '1');
    assert.match(V.ekranKunye.Rapor, /RPT-08/);
    /* Ekran gövdesinde bakiye değeri. */
    assert.match(r.govde, /12,5/, 'ekranda bakiye yok');
    V.ekranGovde = r.govde;
  });

  test('PDF ekranla AYNI künyeyi ve toplamı taşır', async () => {
    const c = await olarak('sahip@yapitas.demo');
    const pdf = await ikiliCek(c, '/raporlar/stok');
    const pdfIkili = await ikiliCek(c, '/raporlar/stok?cikti=pdf');
    assert.equal(pdfIkili.durum, 200);
    assert.match(pdfIkili.tur, /application\/pdf/);
    assert.match(pdfIkili.ad, /attachment; filename="RPT-08-/);
    assert.equal(pdfIkili.govde.subarray(0, 4).toString(), '%PDF');

    const metin = pdfMetni(pdfIkili.govde);
    /* Künyenin HER satırı PDF'te de var. */
    for (const [k, v] of Object.entries(V.ekranKunye)) {
      assert.ok(metin.includes(v), `PDF künyesinde "${k}: ${v}" yok`);
    }
    assert.ok(metin.includes('12,5'), 'PDF toplamı ekrandan farklı');
    assert.ok(/Sayfa 1 \/ 1/.test(metin), 'PDF sayfa numarası yok');
    /* Türkçe glifler bozulmadan geçti. */
    assert.ok(metin.includes('Yapıtaş İnşaat A.Ş.'), 'PDF Türkçe karakterleri bozdu');
    /* KPI formülü PDF'te de var (kural 9). */
    assert.ok(metin.includes('Σ stok_hareketi.miktar_binde'), 'PDF KPI formülü taşımıyor');
    V.pdfMetin = metin;
  });

  test('Excel ekranla AYNI künyeyi taşır; sayılar SAYI olarak yazılır', async () => {
    const c = await olarak('sahip@yapitas.demo');
    const x = await ikiliCek(c, '/raporlar/stok?cikti=xlsx');
    assert.equal(x.durum, 200);
    assert.match(x.tur, /spreadsheetml\.sheet/);
    assert.equal(x.govde.subarray(0, 2).toString(), 'PK');

    const sheet = xlsxDosya(x.govde, 'xl/worksheets/sheet1.xml');
    for (const [k, v] of Object.entries(V.ekranKunye)) {
      assert.ok(sheet.includes(v.replace(/&/g, '&amp;')), `Excel künyesinde "${k}: ${v}" yok`);
    }
    /* Bakiye METİN değil SAYI: `<v>12.5</v>` — Excel'de toplanabilir olmalı. */
    assert.match(sheet, /<v>12\.5<\/v>/, 'Excel bakiyeyi metin olarak yazdı');

    /* KPI'lar formülleriyle ayrı sayfada (kural 9). */
    const kpi = xlsxDosya(x.govde, 'xl/worksheets/sheet2.xml');
    assert.ok(kpi.includes('Formül'), 'Excel KPI sayfasında formül sütunu yok');
    assert.ok(kpi.includes('count(distinct depo'), 'Excel KPI formülü taşımıyor');
  });

  test('CSV de aynı künyeyi taşır', async () => {
    const c = await olarak('sahip@yapitas.demo');
    const r = await c.get('/raporlar/stok?cikti=csv');
    assert.equal(r.durum, 200);
    assert.match(r.basliklar.get('content-type'), /text\/csv/);
    for (const [k, v] of Object.entries(V.ekranKunye)) {
      assert.ok(r.govde.includes(v), `CSV künyesinde "${k}: ${v}" yok`);
    }
  });

  test('FİLTRE dört çıktıya da AYNI şekilde yansır', async () => {
    const c = await olarak('sahip@yapitas.demo');
    const yol = `/raporlar/stok?depo_id=${V.depo.id}`;
    const ekran = await c.get(yol);
    const ekranKunye = Object.fromEntries(
      [...ekran.govde.matchAll(/<dt>([^<]+)<\/dt><dd>([^<]*)<\/dd>/g)].map((m) => [m[1], m[2]]));
    assert.match(ekranKunye.Filtre, /Depo: DPO-/, 'ekran filtre özeti yok');

    const pdf = await ikiliCek(c, `${yol}&cikti=pdf`);
    assert.ok(pdfMetni(pdf.govde).includes(ekranKunye.Filtre), 'PDF filtre özeti ekrandan farklı');

    const csv = await c.get(`${yol}&cikti=csv`);
    assert.ok(csv.govde.includes(ekranKunye.Filtre), 'CSV filtre özeti ekrandan farklı');

    /* Boş küme veren filtre: rapor SAHTE veri üretmez, dürüstçe boş döner. */
    const bos = await c.get('/raporlar/stok?depo_id=yok');
    const bosKunye = Object.fromEntries(
      [...bos.govde.matchAll(/<dt>([^<]+)<\/dt><dd>([^<]*)<\/dd>/g)].map((m) => [m[1], m[2]]));
    assert.equal(bosKunye['Kayıt sayısı'], '0');
    assert.match(bos.govde, /Bu filtrede kayıt yok/);
  });

  test('rapor dışa aktarımı denetim izine yazılır', () => {
    const izler = sorgu(
      `SELECT * FROM denetim_izi WHERE nesne = 'rapor' AND eylem = 'disa_aktar'`);
    assert.ok(izler.length >= 3, 'dışa aktarım audit izine yazılmadı');
    const iz = izler.find((x) => x.nesne_id === 'RPT-08');
    assert.ok(iz, 'RPT-08 dışa aktarımı izlenmedi');
    assert.match(iz.sonraki, /bicim/, 'çıktı biçimi izlenmedi');
    assert.match(iz.sonraki, /veriTarihi/, 'veri tarihi izlenmedi');
  });
});

/* ==========================================================================
   RPT-15 — açıklanmış KPI (kural 9)
   ========================================================================== */
describe('RPT-15 — her KPI formülüyle açıklanır', () => {
  test('formül sözlüğü rapor tanımlarından üretilir ve boş formül yoktur', async () => {
    const c = await olarak('sahip@yapitas.demo');
    const ctx = { tenant: tek('SELECT * FROM tenant LIMIT 1'),
      kullanici: tek(`SELECT * FROM kullanici WHERE eposta = 'sahip@yapitas.demo'`),
      sorgu: new URLSearchParams() };
    const sozluk = formulSozlugu(ctx);
    assert.ok(sozluk.length >= 30, `sözlükte yalnız ${sozluk.length} gösterge var`);
    const formulsuz = sozluk.filter((s) => !s.formul);
    assert.deepEqual(formulsuz.map((s) => `${s.rapor}/${s.gosterge}`), [],
      'formülsüz gösterge var — kural 9 ihlali');
    for (const s of sozluk) assert.ok(s.kaynak, `${s.gosterge} kaynağı yok`);

    const r = await c.get('/raporlar/sozluk');
    assert.equal(r.durum, 200);
    /* RPT-15 artık tek ReportLayout'tan geçer (denetim-01 D-05); formülsüz
       gösterge sayısı bir KPI'dır ve sıfır olmalıdır. */
    assert.match(r.govde, /Formülsüz gösterge/);
    assert.match(r.govde, /rk-etiket">Formülsüz gösterge<\/div>\s*<div class="rk-deger">0</);
  });

  test('her rapor tanımı sürüm ve rota taşır', () => {
    for (const r of RAPORLAR) {
      assert.ok(r.kod && r.ad && r.rota, `${r.kod} eksik tanım`);
      assert.ok(r.surum, `${r.kod} rapor sürümü yok`);
      assert.ok(r.sutunlar?.length, `${r.kod} sütun tanımı yok`);
    }
  });

  test('rapor merkezi yalnız AÇILABİLEN raporları listeler', async () => {
    /* Satın alma sorumlusunun 'rapor' bölümü var ama 'finans' bölümü yok. */
    const sa = await olarak('satinalma@yapitas.demo');
    const r = await sa.get('/raporlar');
    assert.equal(r.durum, 200);
    assert.ok(!/RPT-06/.test(r.govde), 'erişilemeyen rapor listede görünüyor');
    assert.equal((await sa.get('/raporlar/nakit-akisi')).durum, 403);
    /* Erişebildiği rapor listede var. */
    assert.match(r.govde, /RPT-08/, 'erişilebilen rapor listede yok');

    /* 'rapor' bölümü hiç olmayan rol rapor merkezini de açamaz. */
    const depo = await olarak('depo@yapitas.demo');
    assert.equal((await depo.get('/raporlar')).durum, 403);
  });

  test('dışa aktarma yetkisi ayrıdır', async () => {
    const denetci = await olarak('denetci@yapitas.demo');
    assert.equal((await denetci.get('/raporlar/stok')).durum, 200);
    assert.equal((await denetci.get('/raporlar/stok?cikti=pdf')).durum, 200,
      'denetçi kanıt dışa aktaramıyor');
  });
});

/* ==========================================================================
   EXT-04..06 — tokenli, kapsamı daraltılmış portal
   ========================================================================== */
describe('EXT-04..06 — dış portal erişimi', () => {
  test('portal bağlantısı üretilir; token AÇIK saklanmaz', async () => {
    const c = await olarak('sahip@yapitas.demo');
    await c.csrfIle('/musteriler',
      { ad: 'Faz6 İşveren A.Ş.', tur: 'isveren', _idempotency: 'f6-m' });
    V.musteri = tek(`SELECT * FROM musteri WHERE ad = 'Faz6 İşveren A.Ş.'`);
    assert.ok(V.musteri);

    const r = await c.csrfIle('/portal/musteri', {
      _eylem: 'ac', hedefId: V.musteri.id, adSoyad: 'Portal Yetkilisi',
      eposta: 'yetkili@isveren.example', projeId: V.proje.id, gun: '30' });
    assert.equal(r.durum, 200);
    const m = r.govde.match(/\/portal\/musteri\/([A-Za-z0-9_-]+)/);
    assert.ok(m, 'bağlantı gösterilmedi');
    V.portalToken = m[1];

    const erisim = tek(`SELECT * FROM portal_erisimi WHERE tur = 'musteri'`);
    assert.ok(erisim, 'erişim kaydı yok');
    /* AÇIK TOKEN HİÇBİR YERDE YOK — yalnız özeti. */
    assert.ok(!JSON.stringify(erisim).includes(V.portalToken), 'açık token saklandı');
    assert.equal(erisim.token_ozeti, tokenOzeti(V.portalToken));
    assert.equal(erisim.proje_id, V.proje.id, 'kapsam projeye bağlanmadı');

    const iz = tek(`SELECT * FROM denetim_izi WHERE nesne = 'portal_erisimi'`);
    assert.ok(!`${iz?.sonraki || ''}`.includes(V.portalToken), 'token audit izine yazıldı');
  });

  test('dış portal OTURUMSUZ açılır ve iç kabuğu göstermez', async () => {
    const anonim = S.istemci();   // giriş YOK
    const r = await anonim.get(`/portal/musteri/${V.portalToken}`);
    assert.equal(r.durum, 200, 'tokenli portal oturumsuz açılmadı');
    assert.match(r.govde, /Müşteri portalı/);
    /* İç kabuk YOK: rail, bağlamsal menü, üst bar. */
    assert.ok(!/gv-rail|gv-menu|gv-top/.test(r.govde), 'portal iç kabuğu gösteriyor');
    assert.match(r.govde, /noindex/, 'portal arama motoruna kapalı değil');
  });

  test('geçersiz, kapatılmış ve süresi dolmuş token reddedilir', async () => {
    const anonim = S.istemci();
    assert.equal((await anonim.get('/portal/musteri/olmayan-token')).durum, 404);
    /* Yanlış TÜR ile aynı token kullanılamaz. */
    assert.equal((await anonim.get(`/portal/taseron/${V.portalToken}`)).durum, 404,
      'müşteri tokeni taşeron portalını açtı');

    const erisim = tek(`SELECT * FROM portal_erisimi WHERE tur = 'musteri'`);
    calistir('UPDATE portal_erisimi SET token_bitis = ? WHERE id = ?', 1, erisim.id);
    assert.equal((await anonim.get(`/portal/musteri/${V.portalToken}`)).durum, 403,
      'süresi dolmuş token çalıştı');
    assert.equal(tek('SELECT durum FROM portal_erisimi WHERE id = ?', erisim.id).durum,
      'suresi_doldu');
  });

  test('taşeron portalında yalnız KARARA BAĞLANMIŞ hakediş görünür', async () => {
    /* Taslak hakediş tutarı dış tarafla paylaşılmaz. */
    const c = await olarak('sahip@yapitas.demo');
    const ted = tek('SELECT * FROM tedarikci LIMIT 1');
    if (!ted) return;   // tedarikçi yoksa bu senaryo kurulamaz
    const r = await c.csrfIle('/portal/taseron',
      { _eylem: 'ac', hedefId: ted.id, eposta: 'taseron@x.example', gun: '10' });
    assert.equal(r.durum, 200);
    const m = r.govde.match(/\/portal\/taseron\/([A-Za-z0-9_-]+)/);
    assert.ok(m);
    const anonim = S.istemci();
    const p = await anonim.get(`/portal/taseron/${m[1]}`);
    assert.equal(p.durum, 200);
    assert.match(p.govde, /Onaylı hakediş yok|Hakedişler/);
    assert.ok(!/taslak/i.test(p.govde.split('Hakedişler')[1] || ''), 'taslak hakediş sızdı');
  });
});

/* ==========================================================================
   EXT-07 — çevrimdışı taslak: çift gönderimde TEK KAYIT (SITE-01 kalıbı)
   ========================================================================== */
describe('EXT-07 — mobil senkron', () => {
  test('aynı istemci kimliğiyle iki gönderim TEK kayıt üretir', async () => {
    const c = await olarak('sef@yapitas.demo');
    const istemciKimligi = 'syn_test_0001';
    const oncesi = sorgu('SELECT id FROM saha_bildirimi').length;

    const bir = await c.csrfIle('/mobil', { _eylem: 'saha_bildirimi', istemciKimligi,
      santiyeId: V.santiye.id, baslik: 'Kalıp iskelesi gevşek', aciklama: 'Acil' });
    assert.equal(bir.durum, 200);
    const iki = await c.csrfIle('/mobil', { _eylem: 'saha_bildirimi', istemciKimligi,
      santiyeId: V.santiye.id, baslik: 'Kalıp iskelesi gevşek', aciklama: 'Acil' });
    assert.equal(iki.durum, 200);

    assert.equal(sorgu('SELECT id FROM saha_bildirimi').length, oncesi + 1,
      'çift gönderim ikinci kayıt açtı');
    assert.equal(sorgu('SELECT id FROM senkron_kuyrugu WHERE istemci_kimligi = ?',
      istemciKimligi).length, 1);
    assert.match(iki.yol, /mükerrer|islem=/);
  });

  test('kiosk girişi çıkışsız kalırsa şantiye kapanışını engeller', async () => {
    const c = await olarak('sef@yapitas.demo');
    const r = await c.csrfIle('/kiosk',
      { _eylem: 'giris', santiyeId: V.santiye.id, adSoyad: 'Ziyaretçi Ali', firma: 'X A.Ş.' });
    assert.equal(r.durum, 200);
    const z = tek(`SELECT * FROM ziyaretci WHERE ad_soyad = 'Ziyaretçi Ali'`);
    assert.equal(z.durum, 'sahada');

    const { kapanisEngelleri } = await import('../../app/moduller/santiye/kapanis.mjs');
    const engel = kapanisEngelleri(V.santiye.id).find((x) => x.ad === 'Sahada bulunan ziyaretçi');
    assert.equal(engel.adet, 1, 'sahadaki ziyaretçi kapanış engeli üretmedi');

    assert.equal((await c.csrfIle('/kiosk', { _eylem: 'cikis', ziyaretciId: z.id })).durum, 200);
    assert.equal(kapanisEngelleri(V.santiye.id)
      .find((x) => x.ad === 'Sahada bulunan ziyaretçi').adet, 0);
  });

  test('AST-11 kod taraması ön ekten çözülür; bulunmayan kod SAHTE kayıt açmaz', async () => {
    const c = await olarak('depo@yapitas.demo');
    const bulundu = await c.get(`/tara?kod=${V.kart.kod}`);
    assert.equal(bulundu.durum, 200);
    assert.match(bulundu.govde, /stok kartı/);
    assert.match(bulundu.govde, /Kaydı aç/);

    const yok = await c.get('/tara?kod=OLMAYAN-9999');
    assert.equal(yok.durum, 200);
    assert.match(yok.govde, /bulunamadı/);
    assert.ok(!/Kaydı aç/.test(yok.govde), 'bulunmayan kod için kayıt bağlantısı gösterildi');
  });
});

/* ==========================================================================
   HR-14 — çalışan self-servis: yalnız kendi verisi
   ========================================================================== */
describe('HR-14 — self-servis yalnız kendi verisini gösterir', () => {
  test('başkasının kaydı bu ekrana giremez', async () => {
    const ik = await olarak('ik@yapitas.demo');
    await ik.csrfIle('/personel/yeni', { adSoyad: 'Faz6 Başkası', tcNo: '32132132132',
      gorev: 'Usta', iseGiris: '2026-01-01', _idempotency: 'f6-baska' });
    const baskasi = tek(`SELECT * FROM personel WHERE ad_soyad = 'Faz6 Başkası'`);
    calistir(`UPDATE personel SET durum = 'aktif' WHERE id = ?`, baskasi.id);
    await ik.csrfIle('/izinler', { personelId: baskasi.id, tur: 'yillik',
      baslangic: '2026-10-01', bitis: '2026-10-05' });

    const calisan = await olarak('calisan@yapitas.demo');
    const r = await calisan.get('/calisan');
    assert.equal(r.durum, 200);
    assert.match(r.govde, /Kendi kayıtlarınız/);
    assert.ok(!new RegExp(baskasi.ad_soyad).test(r.govde),
      'self-servis başkasının kaydını gösteriyor');
    assert.ok(!new RegExp(baskasi.kod).test(r.govde));
  });
});

/* ==========================================================================
   GLB-07 — arama yetkiyi ve kapsamı aşmaz
   ========================================================================== */
describe('GLB-07 — genel arama', () => {
  test('yetkisiz kayıt türü arama sonucunda BAŞLIK OLARAK BİLE görünmez', async () => {
    const c = await olarak('sahip@yapitas.demo');
    const sahipSonuc = await c.get('/arama?q=Faz6');
    assert.equal(sahipSonuc.durum, 200);
    assert.match(sahipSonuc.govde, /Faz6 Rapor Projesi/, 'firma sahibi projeyi bulamadı');

    /* Depo sorumlusunun projeye yetkisi yok: proje sonucu görünmemeli. */
    const depo = await olarak('depo@yapitas.demo');
    const depoSonuc = await depo.get('/arama?q=Faz6');
    assert.equal(depoSonuc.durum, 200);
    assert.ok(!/Faz6 Rapor Projesi/.test(depoSonuc.govde),
      'yetkisiz rol proje başlığını arama sonucunda gördü');
    /* Ama kendi yetkisindeki stok kartını bulabilmeli. */
    const stokSonuc = await depo.get('/arama?q=Çimento');
    assert.match(stokSonuc.govde, /Çimento ışığı/, 'yetkili rol kendi kaydını bulamadı');
  });

  test('arama kart TAM NUMARASINI aramaz', async () => {
    const c = await olarak('sahip@yapitas.demo');
    const r = await c.get('/arama?q=4111111111111111');
    assert.equal(r.durum, 200);
    assert.match(r.govde, /sonuç yok/);
  });

  test('iki karakterden kısa sorgu çalıştırılmaz', async () => {
    const c = await olarak('sahip@yapitas.demo');
    const r = await c.get('/arama?q=a');
    assert.match(r.govde, /En az iki karakter/);
  });
});

/* ==========================================================================
   SET-17 — saklama süresi dolan belge otomatik silinmez
   ========================================================================== */
describe('SET-17 — arşiv ve saklama işleri', () => {
  test('arşiv işi açılır; işi açan tek başına ONAYLAYAMAZ (dört göz)', async () => {
    const c = await olarak('sahip@yapitas.demo');
    /* Saklama süresi dolmuş bir belge kur. */
    const bt = tek(`SELECT * FROM belge_turu WHERE tenant_id = ? AND saklama_ay IS NOT NULL LIMIT 1`,
      tek('SELECT id FROM tenant LIMIT 1').id);
    assert.ok(bt, 'saklama süreli belge türü yok');
    const dokId = `doc_${'F6ARSIV'.padEnd(26, '0')}`;
    calistir(`INSERT INTO dokuman (id, tenant_id, kod, ad, belge_turu, sinif, durum,
                olusturan, olusturuldu)
              VALUES (?,?,?,?,?, 'ic', 'aktif', ?,?)`,
      dokId, tek('SELECT id FROM tenant LIMIT 1').id, 'DOC-ARSIV-1', 'Süresi dolmuş belge',
      bt.kod, tek(`SELECT id FROM kullanici WHERE eposta = 'sahip@yapitas.demo'`).id,
      Date.UTC(2000, 0, 1));

    const ekran = await c.get('/ayarlar/arsiv');
    assert.equal(ekran.durum, 200);
    assert.match(ekran.govde, /DOC-ARSIV-1/, 'süresi dolan belge listelenmedi');
    assert.match(ekran.govde, /OTOMATİK SİLİNMEZ/);

    const ac = await c.csrfIle('/ayarlar/arsiv', { _eylem: 'is_ac', nesneId: dokId });
    assert.equal(ac.durum, 200);
    const is = tek(`SELECT * FROM arsiv_isi WHERE nesne_id = ?`, dokId);
    assert.ok(is, 'arşiv işi açılmadı');
    assert.equal(is.durum, 'bekliyor');

    /* Aynı kişi onaylayamaz. */
    const kendi = await c.csrfIle('/ayarlar/arsiv',
      { _eylem: 'onayla', isId: is.id, gerekce: 'Süresi doldu' });
    assert.equal(kendi.durum, 409, 'işi açan kendi işini onayladı');
    assert.equal(tek('SELECT durum FROM arsiv_isi WHERE id = ?', is.id).durum, 'bekliyor');

    /* Başka yetkili onaylar: belge SİLİNMEZ, arşive geçer. */
    const sistem = await olarak('sistem@yapitas.demo');
    const onay = await sistem.csrfIle('/ayarlar/arsiv',
      { _eylem: 'onayla', isId: is.id, gerekce: 'Saklama süresi doldu' });
    assert.equal(onay.durum, 200);
    assert.equal(tek('SELECT durum FROM arsiv_isi WHERE id = ?', is.id).durum, 'uygulandi');
    const dok = tek('SELECT * FROM dokuman WHERE id = ?', dokId);
    assert.ok(dok, 'belge SİLİNDİ — arşivleme silme değildir');
    assert.equal(dok.durum, 'arsiv');
  });
});

/* ==========================================================================
   EXT-01..03 — fırsat kazanılınca gerçekten proje açılır
   ========================================================================== */
describe('EXT-01..03 — müşteri, fırsat ve teklif', () => {
  test('teklif verilince fırsat durumu ilerler; kazanılınca PROJE açılır', async () => {
    const c = await olarak('sahip@yapitas.demo');
    assert.equal((await c.csrfIle('/firsatlar', { _eylem: 'ac', baslik: 'Faz6 İhalesi',
      musteriId: V.musteri.id, tahminiBedel: '5.000.000,00' })).durum, 200);
    const f = tek(`SELECT * FROM firsat WHERE baslik = 'Faz6 İhalesi'`);
    assert.equal(f.durum, 'aday');
    assert.equal(String(f.tahmini_bedel_minor), '500000000');

    assert.equal((await c.csrfIle('/teklifler', { _eylem: 'ac', baslik: 'Faz6 teklifi',
      musteriId: V.musteri.id, firsatId: f.id, tutar: '4.800.000,00' })).durum, 200);
    assert.equal(tek('SELECT durum FROM firsat WHERE id = ?', f.id).durum, 'teklif_verildi',
      'teklif verilince fırsat ilerlemedi');
    assert.equal(tek(`SELECT durum FROM satis_teklifi WHERE baslik = 'Faz6 teklifi'`).durum,
      'taslak', 'teklif taslak dışında açıldı');

    const oncekiProje = sorgu('SELECT id FROM proje').length;
    assert.equal((await c.csrfIle('/firsatlar', { _eylem: 'kazan', firsatId: f.id })).durum, 200);
    const guncel = tek('SELECT * FROM firsat WHERE id = ?', f.id);
    assert.equal(guncel.durum, 'kazanildi');
    assert.ok(guncel.proje_id, 'fırsat kazanıldı ama proje açılmadı');
    assert.equal(sorgu('SELECT id FROM proje').length, oncekiProje + 1);
    assert.equal(tek('SELECT durum FROM proje WHERE id = ?', guncel.proje_id).durum, 'taslak');
  });
});

/* ==========================================================================
   Ortak sözleşmeler
   ========================================================================== */
describe('Faz 6 ekranları ortak kalıba uyar', () => {
  const YOLLAR = ['/raporlar', '/raporlar/sozluk', '/raporlar/zamanlama', '/raporlar/stok',
    '/musteriler', '/firsatlar', '/teklifler', '/portal/musteri', '/portal/taseron',
    '/portal/tedarikci', '/mobil', '/kiosk', '/tara', '/calisan', '/arama', '/ayarlar/arsiv'];

  test('hepsi 200 döner ve page-head taşır', async () => {
    const c = await olarak('sahip@yapitas.demo');
    for (const yol of YOLLAR) {
      const r = await c.get(yol);
      assert.equal(r.durum, 200, `${yol} açılmadı`);
      assert.match(r.govde, /class="gv-page-head"/, `${yol} page-head taşımıyor`);
    }
  });

  test('yazma formlarında durum veya onaycı alanı yok (kural 5)', async () => {
    const c = await olarak('sahip@yapitas.demo');
    for (const yol of YOLLAR) {
      const r = await c.get(yol);
      for (const f of r.govde.match(/<form method="post"[\s\S]*?<\/form>/g) || []) {
        assert.ok(!/name="durum"/.test(f), `${yol} yazma formunda durum alanı var`);
        assert.ok(!/name="onayci/i.test(f), `${yol} yazma formunda onaycı alanı var`);
      }
    }
  });

  test('yazdırma görünümü print CSS ile menü ve butonları gizler (§3.4)', async () => {
    const c = await olarak('sahip@yapitas.demo');
    const css = await c.get('/statik/css/rapor.css');
    assert.equal(css.durum, 200);
    assert.match(css.govde, /@media print/);
    /* Kabuk ve form kontrolleri gizlenir. */
    for (const secici of ['.gv-rail', '.gv-menu', '.gv-top', '.gv-crumbs', 'button', 'form']) {
      assert.ok(css.govde.includes(secici), `print CSS ${secici} gizlemiyor`);
    }
    /* Tablo başlığı her sayfada yinelenir. */
    assert.match(css.govde, /thead\s*{\s*display:\s*table-header-group/);
    assert.match(css.govde, /@page.*size:\s*A4/s);
  });
});
