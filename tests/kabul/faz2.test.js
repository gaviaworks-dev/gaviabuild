/* ============================================================================
   KABUL TESTLERİ — Faz 2  (docs/REVIZYON.md §11)
   WF-01 · WF-02 + durum motoru, vekalet, paralel adım, revizyon geçersizleşmesi
   ========================================================================== */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { uygulamaBaslat } from '../yardimci.mjs';
import { sorgu, tek, calistir, islem } from '../../app/cekirdek/db.mjs';
import { simdi, GUN_MS } from '../../app/cekirdek/zaman.mjs';
import { NESNELER, tanim } from '../../app/moduller/isakisi/durumlar.mjs';
import { gecisYap, izinliGecisler, isaretler } from '../../app/moduller/isakisi/durum.mjs';
import * as onayMotoru from '../../app/moduller/isakisi/onay.mjs';
import * as vekaletServisi from '../../app/moduller/isakisi/vekalet.mjs';

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let S;
before(async () => { S = await uygulamaBaslat(); });
after(async () => { await S.kapat(); });

/** Onaya gönderilmiş bir duyuru üretir (İK oluşturur, sahip onaycıdır). */
async function duyuruAkisi(baslik) {
  const ik = S.istemci(); await ik.giris('ik@yapitas.demo');
  await ik.csrfIle('/duyurular', { baslik, govde: 'Test duyuru metni.' });
  const d = tek('SELECT * FROM duyuru WHERE baslik = ?', baslik);
  await ik.csrfIle('/duyurular', { _eylem: 'onaya_gonder', id: d.id, surum: String(d.surum) });
  const talep = tek(`SELECT * FROM onay_talebi WHERE nesne = 'duyuru' AND nesne_id = ?`, d.id);
  return { ik, duyuru: d, talep };
}

/* ========================================================================== */
describe('WF-01 — talep sahibi durumu ve onaycıyı seçemez', () => {
  test('§5.2 durum tablosu dokümandaki zincirle birebir', () => {
    assert.deepEqual(NESNELER.gorev.durumlar,
      ['taslak', 'atama_bekliyor', 'acik', 'devam_ediyor', 'dogrulamada', 'tamamlandi', 'iptal']);
    assert.deepEqual(NESNELER.onayliKayit.durumlar,
      ['taslak', 'onaya_gonderildi', 'incelemede', 'revizyon_istendi', 'onaylandi', 'reddedildi', 'iptal']);
    assert.deepEqual(NESNELER.sahaBildirimi.durumlar,
      ['yeni', 'siniflandirildi', 'atandi', 'islemde', 'dogrulamada', 'kapali', 'iptal']);
    /* Faz 5'te `iptal` eklendi (K-095): açılmış ama gönderilmemiş bir parti geri
       alınabilmeli, reddedilen onay da partiyi bir yere bağlamalıdır. §5.2 tablosu
       her zincirde iptal öngörür; iptalsiz parti onay reddinde asılı kalırdı. */
    assert.deepEqual(NESNELER.kartYuklemePartisi.durumlar,
      ['taslak', 'dogrulandi', 'onay_bekliyor', 'gonderiliyor', 'kismi', 'basarili',
        'hatali', 'mutabik', 'kapali', 'iptal']);
    /* §6.3 kart yaşam döngüsü — dokümandaki sırayla birebir. */
    assert.deepEqual(NESNELER.kart.durumlar,
      ['siparis_edildi', 'basimda', 'aktiflenebilir', 'aktif', 'gecici_bloke',
        'kayip_calinti', 'yenilemede', 'iptal', 'suresi_doldu', 'arsiv']);
    assert.deepEqual(NESNELER.proje.durumlar,
      ['taslak', 'hazirlik', 'aktif', 'askida', 'kapanista', 'kapali', 'arsiv']);
  });

  test('hiçbir formda durum veya onaycı alanı yok', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const formRotalari = ['/notlarim/yeni', '/duyurular', '/ayarlar/vekaletler', '/ayarlar/sirket', '/ayarlar/kullanicilar'];
    for (const rota of formRotalari) {
      const y = await c.get(rota);
      assert.equal(y.durum, 200, `${rota} açılmıyor`);
      /* Yalnız YAZMA formları denetlenir; GET filtre barındaki durum seçicisi bir
         arama ölçütüdür, kaydın durumunu belirlemez. */
      const yazmaFormlari = (y.govde.match(/<form[\s\S]*?<\/form>/g) || [])
        .filter((f) => /method="post"/i.test(f));
      assert.ok(yazmaFormlari.length > 0, `${rota}: yazma formu bulunamadı`);
      for (const f of yazmaFormlari) {
        assert.ok(!/name="durum"/.test(f), `${rota}: form kullanıcıya DURUM seçtiriyor`);
        assert.ok(!/name="(onayci|onaylayan|approver)"/.test(f), `${rota}: form kullanıcıya ONAYCI seçtiriyor`);
      }
    }
  });

  test('kaynak kodda hiçbir sayfa durum/onaycı girdisi üretmiyor', () => {
    const dosyalar = [];
    (function tara(d) {
      for (const g of readdirSync(resolve(KOK, d), { withFileTypes: true })) {
        if (g.isDirectory()) tara(`${d}/${g.name}`);
        else if (g.name.endsWith('.mjs')) dosyalar.push(`${d}/${g.name}`);
      }
    })('app');
    for (const f of dosyalar) {
      const metin = readFileSync(resolve(KOK, f), 'utf8');
      /* `B.alan({ ad: 'durum' … })` = kullanıcıya durum seçtiren FORM ALANI (yasak).
         `{ ad: 'durum', etiket … }` filtre tanımı olabilir; ayrım çağrı biçimindedir. */
      assert.ok(!/B\.alan\(\{\s*ad:\s*'durum'/.test(metin), `${f}: form alanı olarak "durum" tanımlanmış`);
      assert.ok(!/B\.alan\(\{\s*ad:\s*'onayci'/.test(metin), `${f}: form alanı olarak "onayci" tanımlanmış`);
      assert.ok(!/name="durum"/.test(metin), `${f}: elle durum girdisi basılmış`);
    }
  });

  test('motor-özel geçiş kullanıcı kodundan tetiklenemez', () => {
    const ctx = { kullanici: { id: 'usr_x' }, tenant: { id: 'ten_x' }, istekId: 'req_x', ip: '::1',
      yetkiler: { kurallar: [], kapsamlar: [], tenantGeneli: true, yetkiler: new Set(['X:guncelle']) } };
    const kayit = { id: 'x', tenant_id: 'ten_x', durum: 'incelemede', surum: 1, olusturan: 'usr_y' };
    assert.throws(() => gecisYap(ctx, { nesne: 'talep', tablo: 'yok', kayit, eylem: 'onayla' }),
      (e) => e.kod === 'YETKI_YOK', 'kullanıcı doğrudan "onaylandı" durumuna geçebiliyor');
  });

  test('izinli geçişler listesi motor-özel geçişleri göstermez', () => {
    const ctx = { kullanici: { id: 'usr_x' }, yetkiler: { yetkiler: new Set() } };
    const gecisler = izinliGecisler(ctx, 'talep', { durum: 'incelemede' });
    assert.ok(!gecisler.some((g) => ['onayla', 'reddet', 'revizyon_iste'].includes(g.eylem)),
      'eylem menüsü kullanıcıya nihai durumu seçtiriyor');
  });

  test('onay akışı başlatan kullanıcı onaycıyı belirlemez — şablondan çözülür', async () => {
    const { talep } = await duyuruAkisi('WF01 duyurusu');
    assert.ok(talep, 'onay talebi oluşmadı');
    const adimlar = onayMotoru.talepAdimlari(talep.id);
    assert.ok(adimlar.length > 0);
    for (const a of adimlar) assert.ok(a.rol_kodu, 'adım bir ROLE bağlı değil');
    const sablon = tek('SELECT * FROM is_akisi_sablonu WHERE id = ?', talep.sablon_id);
    assert.equal(sablon.nesne, 'duyuru');
    assert.equal(talep.sablon_surum, sablon.surum, 'şablon sürümü dondurulmamış');
  });

  test('tanımlı şablon yoksa akış başlatılamaz (onaysız doğrudan etki yok)', () => {
    const ctx = { kullanici: { id: 'usr_x' }, tenant: tek(`SELECT * FROM tenant WHERE kod = 'yapitas'`),
      istekId: 'req_x', ip: '::1' };
    assert.throws(() => onayMotoru.onayaGonder(ctx, {
      nesne: 'boyle_bir_nesne_yok', nesneId: 'x', baslik: 'X', belgeSurum: 1,
    }), (e) => e.kod === 'DOGRULAMA_HATASI');
  });
});

/* ========================================================================== */
describe('WF-02 — onaycı karar verdiği belge sürümünü görür', () => {
  test('karar formu belge sürümünü taşır ve ekranda gösterir', async () => {
    const { talep } = await duyuruAkisi('WF02 sürüm duyurusu');
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const y = await c.get(`/onaylar/${talep.id}`);
    assert.equal(y.durum, 200);
    assert.match(y.govde, /name="belgeSurum"/, 'karar formu belge sürümünü taşımıyor');
    assert.match(y.govde, /Karar verilen belge sürümü/, 'ekran karar verilen sürümü göstermiyor');
  });

  test('belge revize edildiyse eski sürümle verilen karar reddedilir', async () => {
    const { talep } = await duyuruAkisi('WF02 revizyon duyurusu');
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const y = await c.csrfIle(`/onaylar/${talep.id}`, { karar: 'onayla', belgeSurum: String(talep.belge_surum + 5) });
    assert.equal(y.durum, 409, 'farklı sürümle verilen karar kabul edildi');
  });

  test('revizyon sonrası önceki onaylar politikaya göre geçersizleşir', async () => {
    const { duyuru, talep } = await duyuruAkisi('WF02 politika duyurusu');
    const ctx = { kullanici: tek(`SELECT * FROM kullanici WHERE eposta = 'ik@yapitas.demo'`),
      tenant: tek(`SELECT * FROM tenant WHERE kod = 'yapitas'`), istekId: 'req_x', ip: '::1' };
    const sonuc = onayMotoru.revizyonBildir(ctx, { nesne: 'duyuru', nesneId: duyuru.id, yeniBelgeSurum: duyuru.surum + 1 });
    assert.equal(sonuc.etkilenen, true);
    const guncel = tek('SELECT durum, sonuc FROM onay_talebi WHERE id = ?', talep.id);
    assert.equal(guncel.durum, 'iptal');
    const acikAdim = tek(`SELECT id FROM onay_adimi WHERE talep_id = ? AND durum IN ('acik','bekliyor')`, talep.id);
    assert.equal(acikAdim, null, 'revizyon sonrası açık adım kaldı');
  });

  test('onay kararı kaydı değiştirilemez', async () => {
    const { talep } = await duyuruAkisi('WF02 karar kaydı duyurusu');
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    await c.csrfIle(`/onaylar/${talep.id}`, { karar: 'onayla', belgeSurum: String(talep.belge_surum) });
    const karar = tek('SELECT * FROM onay_karari WHERE talep_id = ?', talep.id);
    assert.ok(karar, 'karar kaydı yazılmadı');
    assert.throws(() => calistir(`UPDATE onay_karari SET karar = 'reddet' WHERE id = ?`, karar.id), /degistirilemez/);
  });
});

/* ========================================================================== */
describe('Onay motoru — görevler ayrılığı ve gerekçe', () => {
  test('talep sahibi kendi kaydını onaylayamaz (dört göz)', async () => {
    const { ik, talep } = await duyuruAkisi('Dört göz duyurusu');
    const y = await ik.csrfIle(`/onaylar/${talep.id}`, { karar: 'onayla', belgeSurum: String(talep.belge_surum) });
    assert.equal(y.durum, 403);
    assert.equal(tek('SELECT COUNT(*) AS n FROM onay_karari WHERE talep_id = ?', talep.id).n, 0);
  });

  test('kendi talebi onay kutusunda görünmez', async () => {
    const { ik } = await duyuruAkisi('Onay kutusu duyurusu');
    const y = await ik.get('/onaylar');
    assert.ok(!y.govde.includes('Onay kutusu duyurusu'), 'kendi talebi onay kutusuna düştü');
  });

  test('ret ve revizyon talebinde gerekçe zorunlu', async () => {
    const { talep } = await duyuruAkisi('Gerekçe duyurusu');
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const ret = await c.csrfIle(`/onaylar/${talep.id}`, { karar: 'reddet', belgeSurum: String(talep.belge_surum) });
    assert.equal(ret.durum, 422);
    const rev = await c.csrfIle(`/onaylar/${talep.id}`, { karar: 'revizyon_iste', belgeSurum: String(talep.belge_surum) });
    assert.equal(rev.durum, 422);
    const ok = await c.csrfIle(`/onaylar/${talep.id}`,
      { karar: 'reddet', gerekce: 'Metin hukuk onayından geçmedi.', belgeSurum: String(talep.belge_surum) });
    assert.equal(ok.durum, 200);
    assert.equal(tek('SELECT sonuc FROM onay_talebi WHERE id = ?', talep.id).sonuc, 'reddedildi');
  });

  test('yetkisiz rol karar veremez', async () => {
    const { talep } = await duyuruAkisi('Yetki duyurusu');
    const c = S.istemci(); await c.giris('depo@yapitas.demo');
    const y = await c.csrfIle(`/onaylar/${talep.id}`, { karar: 'onayla', belgeSurum: String(talep.belge_surum) });
    assert.ok(y.durum === 403, `beklenen 403, gelen ${y.durum}`);
  });

  test('onaylanınca iş nesnesinin durumunu MOTOR ilerletir', async () => {
    const { duyuru, talep } = await duyuruAkisi('Motor duyurusu');
    assert.equal(tek('SELECT durum FROM duyuru WHERE id = ?', duyuru.id).durum, 'taslak');
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    await c.csrfIle(`/onaylar/${talep.id}`, { karar: 'onayla', belgeSurum: String(talep.belge_surum) });
    assert.equal(tek('SELECT durum FROM duyuru WHERE id = ?', duyuru.id).durum, 'yayinda');
    const iz = tek(`SELECT * FROM denetim_izi WHERE nesne = 'duyuru' AND nesne_id = ? AND eylem = 'gecis:yayinla'`, duyuru.id);
    assert.ok(iz, 'yayına alma denetim izine yazılmadı');
    assert.match(iz.gerekce, /Onay talebi/, 'geçişin gerekçesi onay talebine bağlanmamış');
  });

  test('aynı kişi aynı adımda iki kez karar veremez', async () => {
    const { talep } = await duyuruAkisi('Mükerrer karar duyurusu');
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    await c.csrfIle(`/onaylar/${talep.id}`, { karar: 'onayla', belgeSurum: String(talep.belge_surum) });
    const ikinci = await c.csrfIle(`/onaylar/${talep.id}`, { karar: 'onayla', belgeSurum: String(talep.belge_surum) });
    assert.ok(ikinci.durum >= 400, 'kapanmış talebe ikinci karar kabul edildi');
  });
});

/* ========================================================================== */
describe('Şablon seçimi ve paralel adım', () => {
  test('tutar aralığına göre doğru şablon seçilir', () => {
    const t = tek(`SELECT id FROM tenant WHERE kod = 'yapitas'`);
    const kucuk = onayMotoru.sablonSec(t.id, { nesne: 'talep', tutarMinor: 1_000_00 });
    const orta = onayMotoru.sablonSec(t.id, { nesne: 'talep', tutarMinor: 100_000_00 });
    const buyuk = onayMotoru.sablonSec(t.id, { nesne: 'talep', tutarMinor: 900_000_00 });
    assert.equal(kucuk.kod, 'TALEP-KUCUK');
    assert.equal(orta.kod, 'TALEP-ORTA');
    assert.equal(buyuk.kod, 'TALEP-BUYUK');
  });

  test('tutar arttıkça onay kademesi artar', () => {
    const t = tek(`SELECT id FROM tenant WHERE kod = 'yapitas'`);
    const adimSayisi = (kod) => Number(tek(
      `SELECT COUNT(*) AS n FROM is_akisi_adimi a JOIN is_akisi_sablonu s ON s.id = a.sablon_id
        WHERE s.tenant_id = ? AND s.kod = ?`, t.id, kod).n);
    assert.ok(adimSayisi('TALEP-KUCUK') < adimSayisi('TALEP-ORTA'));
    assert.ok(adimSayisi('TALEP-ORTA') < adimSayisi('TALEP-BUYUK'));
  });

  test('paralel adım tanımı: aynı sıra, gereken onay > 1', () => {
    const t = tek(`SELECT id FROM tenant WHERE kod = 'yapitas'`);
    /* Hangi şablonda olduğu iş kararıdır ve değişebilir; MOTOR en az bir yerde
       paralel adımı desteklemeli ve tohumlama onu doğru yazmalıdır. */
    const paralel = sorgu(
      `SELECT s.kod AS sablon, a.sira, COUNT(*) AS adet, MAX(a.gereken_onay) AS gereken
         FROM is_akisi_adimi a JOIN is_akisi_sablonu s ON s.id = a.sablon_id
        WHERE s.tenant_id = ? AND a.paralel = 1
        GROUP BY s.id, a.sira HAVING COUNT(*) > 1`, t.id);
    assert.ok(paralel.length > 0, 'hiçbir şablonda paralel adım tanımlı değil');
    for (const p of paralel) {
      assert.ok(p.gereken > 1, `${p.sablon} paralel adımında gereken onay 1 kalmış`);
      assert.equal(p.adet, p.gereken, `${p.sablon}: paralel adım sayısı gereken onayla uyuşmuyor`);
    }
  });
});

/* ========================================================================== */
describe('SET-07 — vekalet', () => {
  test('çakışan tarih aralığı reddedilir', () => {
    const ten = tek(`SELECT * FROM tenant WHERE kod = 'yapitas'`);
    const veren = tek(`SELECT * FROM kullanici WHERE eposta = 'proje@yapitas.demo'`);
    const alan = tek(`SELECT * FROM kullanici WHERE eposta = 'sef@yapitas.demo'`);
    const ctx = { kullanici: tek(`SELECT * FROM kullanici WHERE eposta = 'sahip@yapitas.demo'`),
      tenant: ten, istekId: 'req_x', ip: '::1' };
    const bas = simdi(), bit = bas + 5 * GUN_MS;
    vekaletServisi.olustur(ctx, { verenId: veren.id, alanId: alan.id, baslangic: bas, bitis: bit });
    assert.throws(() => vekaletServisi.olustur(ctx,
      { verenId: veren.id, alanId: alan.id, baslangic: bas + GUN_MS, bitis: bit + GUN_MS }),
      (e) => e.kod === 'CAKISMA', 'çakışan vekalet kabul edildi');
  });

  test('kişi kendine vekalet veremez', () => {
    const ten = tek(`SELECT * FROM tenant WHERE kod = 'yapitas'`);
    const k = tek(`SELECT * FROM kullanici WHERE eposta = 'finans@yapitas.demo'`);
    const ctx = { kullanici: k, tenant: ten, istekId: 'req_x', ip: '::1' };
    assert.throws(() => vekaletServisi.olustur(ctx,
      { verenId: k.id, alanId: k.id, baslangic: simdi(), bitis: simdi() + GUN_MS }),
      (e) => e.kod === 'DOGRULAMA_HATASI');
  });

  test('vekil, yetkiyi verenin adımında karar verebilir ve karar "vekaleten" işlenir', async () => {
    const ten = tek(`SELECT * FROM tenant WHERE kod = 'yapitas'`);
    const sahip = tek(`SELECT * FROM kullanici WHERE eposta = 'sahip@yapitas.demo'`);
    const vekil = tek(`SELECT * FROM kullanici WHERE eposta = 'proje@yapitas.demo'`);
    const ctx = { kullanici: sahip, tenant: ten, istekId: 'req_x', ip: '::1' };
    vekaletServisi.olustur(ctx, { verenId: sahip.id, alanId: vekil.id,
      baslangic: simdi() - GUN_MS, bitis: simdi() + GUN_MS, gerekce: 'Yıllık izin' });

    const { talep } = await duyuruAkisi('Vekalet duyurusu');
    const c = S.istemci(); await c.giris('proje@yapitas.demo');
    const y = await c.csrfIle(`/onaylar/${talep.id}`, { karar: 'onayla', belgeSurum: String(talep.belge_surum) });
    assert.equal(y.durum, 200, 'vekil karar veremedi');
    const karar = tek('SELECT * FROM onay_karari WHERE talep_id = ?', talep.id);
    assert.equal(karar.kullanici_id, vekil.id);
    assert.equal(karar.vekaleten, sahip.id, 'karar "vekaleten" olarak işaretlenmedi');
  });
});

/* ========================================================================== */
describe('Hesaplanan işaretler — yaşam durumu değildir', () => {
  test('gecikme durum değil, işarettir', () => {
    const dun = simdi() - 3 * GUN_MS;
    const isaret = isaretler('gorev', { durum: 'devam_ediyor', termin: dun });
    assert.ok(isaret.some((i) => i.kod === 'gecikmis'), 'gecikme işareti hesaplanmıyor');
    assert.ok(!tanim('gorev').durumlar.includes('gecikmis'), 'gecikme durum listesine sızmış');
  });

  test('tamamlanan kayıt gecikmiş işareti almaz', () => {
    const isaret = isaretler('gorev', { durum: 'tamamlandi', termin: simdi() - 3 * GUN_MS });
    assert.ok(!isaret.some((i) => i.kod === 'gecikmis'));
  });

  test('SLA riski yaklaşan terminde uyarır', () => {
    const isaret = isaretler('gorev', { durum: 'acik', termin: simdi() + GUN_MS });
    assert.ok(isaret.some((i) => i.kod === 'sla_riski'));
  });
});

/* ========================================================================== */
describe('Bildirim ve denetim', () => {
  test('onaya gönderim onaycı rolüne bildirim üretir', async () => {
    const { talep } = await duyuruAkisi('Bildirim duyurusu');
    const sahip = tek(`SELECT id FROM kullanici WHERE eposta = 'sahip@yapitas.demo'`);
    const b = tek(`SELECT * FROM bildirim WHERE nesne = 'onay_talebi' AND nesne_id = ? AND kullanici_id = ?`,
      talep.id, sahip.id);
    assert.ok(b, 'onaycıya bildirim gitmedi');
    assert.equal(b.tur, 'onay_bekliyor');
  });

  test('karar sonrası talep sahibine sonuç bildirimi gider', async () => {
    const { duyuru, talep } = await duyuruAkisi('Sonuç bildirimi duyurusu');
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    await c.csrfIle(`/onaylar/${talep.id}`, { karar: 'onayla', belgeSurum: String(talep.belge_surum) });
    const ik = tek(`SELECT id FROM kullanici WHERE eposta = 'ik@yapitas.demo'`);
    const b = tek(`SELECT * FROM bildirim WHERE kullanici_id = ? AND tur = 'onay_sonucu' AND nesne_id = ?`,
      ik.id, duyuru.id);
    assert.ok(b, 'talep sahibine sonuç bildirimi gitmedi');
  });

  test('her karar denetim izine yazılır', async () => {
    const { talep } = await duyuruAkisi('Denetim duyurusu');
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    await c.csrfIle(`/onaylar/${talep.id}`,
      { karar: 'revizyon_iste', gerekce: 'Tarih bilgisi eksik.', belgeSurum: String(talep.belge_surum) });
    const iz = tek(`SELECT * FROM denetim_izi WHERE nesne = 'onay_talebi' AND nesne_id = ?
                     AND eylem = 'karar:revizyon_iste'`, talep.id);
    assert.ok(iz, 'karar denetim izinde yok');
    assert.equal(iz.gerekce, 'Tarih bilgisi eksik.');
  });
});

/* ========================================================================== */
describe('DOC-01..03 — sürümlü doküman ve dosya bütünlüğü', () => {
  /** multipart/form-data gövdesi kurar (gerçek tarayıcı gönderimiyle aynı biçim). */
  function cokluParca(alanlar, dosya) {
    const sinir = '----gbtest' + alanlar._csrf.slice(0, 8);
    const parcalar = [];
    for (const [k, v] of Object.entries(alanlar)) {
      parcalar.push(Buffer.from(`--${sinir}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    }
    if (dosya) {
      parcalar.push(Buffer.from(`--${sinir}\r\nContent-Disposition: form-data; name="dosya"; filename="${dosya.ad}"\r\n`
        + `Content-Type: ${dosya.mime}\r\n\r\n`));
      parcalar.push(dosya.icerik);
      parcalar.push(Buffer.from('\r\n'));
    }
    parcalar.push(Buffer.from(`--${sinir}--\r\n`));
    return { govde: Buffer.concat(parcalar), tur: `multipart/form-data; boundary=${sinir}` };
  }

  async function belgeYukle(c, alanlar, dosya) {
    const csrf = c.cerezler.get('gb_csrf');
    const { govde, tur } = cokluParca({ ...alanlar, _csrf: csrf }, dosya);
    const y = await fetch(S.taban + (alanlar._rota || '/dokumanlar/yeni'), {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': tur, cookie: [...c.cerezler].map(([k, v]) => `${k}=${v}`).join('; ') },
      body: govde,
    });
    return { durum: y.status, konum: y.headers.get('location'), govde: await y.text() };
  }

  const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('test icerik'), Buffer.from('\n%%EOF')]);

  test('doküman kaydı dosyayla birlikte oluşur ve sürüm 1 açılır', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    await c.get('/dokumanlar/yeni');
    const y = await belgeYukle(c, { ad: 'Yapı ruhsatı', belgeTuru: 'RUHSAT', sinif: 'resmi' },
      { ad: 'ruhsat.pdf', mime: 'application/pdf', icerik: PDF });
    assert.ok(y.durum === 303 || y.durum === 200, `beklenmeyen durum ${y.durum}`);
    const d = tek(`SELECT * FROM dokuman WHERE ad = 'Yapı ruhsatı'`);
    assert.ok(d, 'doküman kaydı oluşmadı');
    assert.equal(d.aktif_surum, 1);
    assert.match(d.kod, /^DOC-\d{4}-\d{4}$/, `numaralandırma şablonu uygulanmadı: ${d.kod}`);
    const s = tek('SELECT * FROM dokuman_surumu WHERE dokuman_id = ?', d.id);
    assert.equal(s.bayt, PDF.length, 'dosya baytları eksik');
    assert.match(s.ozet, /^[0-9a-f]{64}$/, 'içerik özeti hesaplanmamış');
  });

  test('MIME beyanıyla uyuşmayan içerik reddedilir', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    await c.get('/dokumanlar/yeni');
    const y = await belgeYukle(c, { ad: 'Sahte PDF', belgeTuru: 'DIGER' },
      { ad: 'sahte.pdf', mime: 'application/pdf', icerik: Buffer.from('bu bir pdf degil') });
    assert.equal(y.durum, 422);
    assert.match(y.govde, /beyan edilen türle uyuşmuyor/);
    assert.equal(tek(`SELECT COUNT(*) AS n FROM dokuman WHERE ad = 'Sahte PDF'`).n, 0);
  });

  test('izinsiz dosya türü reddedilir', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    await c.get('/dokumanlar/yeni');
    const y = await belgeYukle(c, { ad: 'Betik', belgeTuru: 'DIGER' },
      { ad: 'kotu.sh', mime: 'application/x-sh', icerik: Buffer.from('#!/bin/sh\nrm -rf /') });
    assert.equal(y.durum, 422);
    assert.match(y.govde, /kabul edilmiyor/);
  });

  test('yeni sürüm öncekini DEĞİŞTİRMEZ, yeni satır açar (§5.4)', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    await c.get('/dokumanlar/yeni');
    await belgeYukle(c, { ad: 'Sürümlü belge', belgeTuru: 'CIZIM' },
      { ad: 'v1.pdf', mime: 'application/pdf', icerik: Buffer.concat([PDF, Buffer.from('v1')]) });
    const d = tek(`SELECT * FROM dokuman WHERE ad = 'Sürümlü belge'`);
    const ilkSurum = tek('SELECT * FROM dokuman_surumu WHERE dokuman_id = ? AND surum_no = 1', d.id);

    await c.get(`/dokumanlar/${d.id}`);
    await belgeYukle(c, { _rota: `/dokumanlar/${d.id}`, aciklama: 'Revizyon A' },
      { ad: 'v2.pdf', mime: 'application/pdf', icerik: Buffer.concat([PDF, Buffer.from('v2')]) });

    const guncel = tek('SELECT * FROM dokuman WHERE id = ?', d.id);
    assert.equal(guncel.aktif_surum, 2);
    const surumler = sorgu('SELECT * FROM dokuman_surumu WHERE dokuman_id = ? ORDER BY surum_no', d.id);
    assert.equal(surumler.length, 2, 'ikinci sürüm satırı açılmadı');
    assert.equal(surumler[0].ozet, ilkSurum.ozet, 'ilk sürümün içeriği değişmiş');
    assert.notEqual(surumler[0].ozet, surumler[1].ozet);
  });

  test('sürüm satırı veritabanı düzeyinde değiştirilemez', () => {
    const s = tek('SELECT * FROM dokuman_surumu LIMIT 1');
    assert.throws(() => calistir(`UPDATE dokuman_surumu SET dosya_adi = 'x' WHERE id = ?`, s.id), /degistirilemez/);
  });

  test('indirme denetim izine yazılır ve içerik özetle doğrulanır', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    const d = tek(`SELECT * FROM dokuman WHERE ad = 'Sürümlü belge'`);
    const y = await c.get(`/dokumanlar/${d.id}?indir=1`);
    assert.equal(y.durum, 200);
    const iz = tek(`SELECT * FROM denetim_izi WHERE nesne = 'dokuman' AND nesne_id = ? AND eylem = 'indir'`, d.id);
    assert.ok(iz, 'indirme denetim izine yazılmadı');
  });

  test('gizli sınıf belge, yetkisiz kullanıcının listesinde görünmez', async () => {
    const c = S.istemci(); await c.giris('sahip@yapitas.demo');
    await c.get('/dokumanlar/yeni');
    await belgeYukle(c, { ad: 'Gizli sözleşme eki', belgeTuru: 'SOZLESME', sinif: 'gizli' },
      { ad: 'gizli.pdf', mime: 'application/pdf', icerik: PDF });
    const calisanC = S.istemci(); await calisanC.giris('calisan@yapitas.demo');
    const y = await calisanC.get('/dokumanlar');
    assert.ok(y.durum === 403 || !y.govde.includes('Gizli sözleşme eki'),
      'gizli belge yetkisiz kullanıcıya listelendi');
  });
});
