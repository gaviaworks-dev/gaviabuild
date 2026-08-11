/* ============================================================================
   KABUL TESTLERİ — Faz 4b: sözleşme/hakediş (CNT) ve finans (FIN)
   ----------------------------------------------------------------------------
   Faz 4 çıkışı: "Onaylı metraj ve ilerlemeden hakediş üretimi" ·
                 "Üçlü eşleştirme; tolerans dışı fark onaya gidiyor."
   Kural 7: kasa/banka/cari bakiyesi defterden türetilir, ters kayıtla düzeltilir.
   ========================================================================== */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { uygulamaBaslat } from '../yardimci.mjs';
import { sorgu, tek, calistir } from '../../app/cekirdek/db.mjs';
import * as fdefter from '../../app/moduller/finans/defter.mjs';
import * as HK from '../../app/moduller/sozlesme/hakedis.mjs';

let S;
before(async () => { S = await uygulamaBaslat(); });
after(async () => { await S.kapat(); });

const olarak = async (eposta) => { const c = S.istemci(); await c.giris(eposta); return c; };
const finans = () => olarak('finans@yapitas.demo');
const V = {};

/** Bir onay talebini sırayla gezip kapatır (talep sahibi atlanır). */
async function onayla(nesne, nesneId, tablo, kisiler = ['proje@yapitas.demo', 'finans@yapitas.demo', 'sahip@yapitas.demo']) {
  const t = tek('SELECT * FROM onay_talebi WHERE nesne = ? AND nesne_id = ? AND durum = ?',
    nesne, nesneId, 'acik');
  assert.ok(t, `${nesne} için onay talebi açılmadı`);
  for (const eposta of kisiler) {
    if (tek(`SELECT durum FROM ${tablo} WHERE id = ?`, nesneId).durum === 'onaylandi') break;
    const c = await olarak(eposta);
    await c.csrfIle(`/onaylar/${t.id}`, { karar: 'onayla', belgeSurum: String(t.belge_surum) });
  }
  return tek(`SELECT durum FROM ${tablo} WHERE id = ?`, nesneId).durum;
}

describe('CNT-01..03 — sözleşme bedeli pozlardan türer, onaylı sözleşme değişmez', () => {
  test('sözleşme taslak açılır ve bedel pozlardan hesaplanır', async () => {
    const c = await finans();
    const y = await c.csrfIle('/sozlesmeler/yeni', {
      ad: 'Kaba yapı taşeronluğu', tur: 'taseron', karsiTaraf: 'Delta İnşaat',
      avansOrani: '10', teminatOrani: '5', stopajOrani: '3',
      poz0No: '01.001', poz0Tanim: 'C30 beton', poz0Miktar: '1000', poz0Birim: 'm3', poz0Fiyat: '1.800,00',
      poz1No: '01.002', poz1Tanim: 'Donatı', poz1Miktar: '80', poz1Birim: 'ton', poz1Fiyat: '22.000,00',
      _idempotency: 'f4b-c1' });
    assert.equal(y.durum, 200);
    V.sozlesme = tek(`SELECT * FROM sozlesme WHERE ad = 'Kaba yapı taşeronluğu'`);
    assert.equal(V.sozlesme.durum, 'taslak');
    /* 1000 × 1.800 + 80 × 22.000 = 1.800.000 + 1.760.000 = 3.560.000 TL */
    assert.equal(String(V.sozlesme.tutar_minor), '356000000');
    assert.equal(HK.sozlesmeBedeli(V.sozlesme.id), 356_000_000);
  });

  test('pozsuz sözleşme onaya gönderilemez; onaylı sözleşmeye poz eklenemez', async () => {
    const c = await finans();
    await c.csrfIle('/sozlesmeler/yeni',
      { ad: 'Boş sözleşme', poz0No: 'X', poz0Tanim: 'Y', poz0Miktar: '1', poz0Fiyat: '1,00',
        _idempotency: 'f4b-c2' });
    const bos = tek(`SELECT * FROM sozlesme WHERE ad = 'Boş sözleşme'`);
    calistir('DELETE FROM sozlesme_kalemi WHERE sozlesme_id = ?', bos.id);
    assert.equal((await c.csrfIle(`/sozlesmeler/${bos.id}`, { _eylem: 'onaya_gonder' })).durum, 409);

    await c.csrfIle(`/sozlesmeler/${V.sozlesme.id}`, { _eylem: 'onaya_gonder' });
    assert.equal(await onayla('sozlesme', V.sozlesme.id, 'sozlesme',
      ['proje@yapitas.demo', 'sahip@yapitas.demo']), 'onaylandi');
    V.sozlesme = tek('SELECT * FROM sozlesme WHERE id = ?', V.sozlesme.id);

    const poz = await c.csrfIle(`/sozlesmeler/${V.sozlesme.id}`,
      { _eylem: 'poz', pozNo: '01.003', pozTanim: 'Ek', pozMiktar: '1', pozFiyat: '100,00' });
    assert.equal(poz.durum, 409, 'onaylı sözleşmeye poz eklendi');
  });
});

describe('CNT-04 — zeyil sözleşmeyi yerinde değiştirmez', () => {
  test('zeyil onaylanınca güncel bedel ve süre değişir, poz satırı değişmez', async () => {
    const c = await finans();
    const ilkBedel = HK.sozlesmeBedeli(V.sozlesme.id);
    const y = await c.csrfIle(`/sozlesmeler/${V.sozlesme.id}/zeyiller`,
      { konu: 'İlave imalat', tur: 'karma', tutarFarki: '50.000,00', sureFarki: '30' });
    assert.equal(y.durum, 200);
    const z = tek(`SELECT * FROM zeyil WHERE sozlesme_id = ?`, V.sozlesme.id);
    assert.equal(z.durum, 'taslak');
    assert.equal(HK.guncelBedel(V.sozlesme.id), ilkBedel, 'onaysız zeyil bedele yansıdı');

    await c.csrfIle(`/sozlesmeler/${V.sozlesme.id}/zeyiller`,
      { _eylem: 'onaya_gonder', zeyilId: z.id });
    assert.equal(await onayla('zeyil', z.id, 'zeyil', ['proje@yapitas.demo', 'sahip@yapitas.demo']),
      'onaylandi');
    assert.equal(HK.guncelBedel(V.sozlesme.id), ilkBedel + 5_000_000);
    assert.equal(HK.zeyilSuresi(V.sozlesme.id), 30);
    /* Sözleşme poz satırları değişmedi. */
    assert.equal(HK.sozlesmeBedeli(V.sozlesme.id), ilkBedel);
  });

  test('bedeli eksiye indiren zeyil reddedilir', async () => {
    const c = await finans();
    const y = await c.csrfIle(`/sozlesmeler/${V.sozlesme.id}/zeyiller`,
      { konu: 'Aşırı indirim', tur: 'tutar', tutarFarki: '-99.999.999,00' });
    assert.equal(y.durum, 422);
  });
});

describe('CNT-06..09 — hakediş ONAYLI metrajdan üretilir', () => {
  test('onaysız sözleşmeye metraj açılamaz; onaysız metraj hakedişe girmez', async () => {
    const c = await finans();
    const taslak = tek(`SELECT * FROM sozlesme WHERE ad = 'Boş sözleşme'`);
    assert.equal((await c.csrfIle('/metraj',
      { _eylem: 'ac', sozlesmeId: taslak.id, donem: '2026-09' })).durum, 409);

    const ac = await c.csrfIle('/metraj',
      { _eylem: 'ac', sozlesmeId: V.sozlesme.id, donem: '2026-09' });
    assert.equal(ac.durum, 200);
    V.metraj = tek('SELECT * FROM metraj WHERE sozlesme_id = ?', V.sozlesme.id);
    const [k1] = sorgu('SELECT * FROM sozlesme_kalemi WHERE sozlesme_id = ? ORDER BY sira', V.sozlesme.id);
    V.poz1 = k1;
    await c.csrfIle('/metraj', { _eylem: 'satir', metrajId: V.metraj.id, kalemId: k1.id, miktar: '400' });

    /* Metraj henüz onaysız → hakediş üretilemez. */
    const erken = await c.csrfIle('/hakedisler/yeni',
      { sozlesmeId: V.sozlesme.id, donem: '2026-09', _idempotency: 'f4b-h0' });
    assert.equal(erken.durum, 409, 'onaysız metrajdan hakediş üretildi');
    assert.equal(HK.kumulatifMetraj(k1.id), 0);
  });

  test('satırsız metraj onaya gönderilemez; onaylanınca kümülatif metraja girer', async () => {
    const c = await finans();
    await c.csrfIle('/metraj', { _eylem: 'ac', sozlesmeId: V.sozlesme.id, donem: '2026-10' });
    const bos = sorgu('SELECT * FROM metraj WHERE sozlesme_id = ? ORDER BY olusturuldu', V.sozlesme.id)[1];
    assert.equal((await c.csrfIle('/metraj',
      { _eylem: 'onaya_gonder', metrajId: bos.id })).durum, 409);

    await c.csrfIle('/metraj', { _eylem: 'onaya_gonder', metrajId: V.metraj.id });
    assert.equal(await onayla('metraj', V.metraj.id, 'metraj', ['proje@yapitas.demo']), 'onaylandi');
    assert.equal(HK.kumulatifMetraj(V.poz1.id), 400_000);
  });

  test('hakediş satırları ve kesintileri HESAPLANIR; form tutar almaz', async () => {
    const c = await finans();
    const form = await c.get(`/hakedisler/yeni?sozlesmeId=${V.sozlesme.id}`);
    assert.equal(form.durum, 200);
    assert.ok(!/name="tutar"/.test(form.govde), 'hakediş formunda tutar alanı var');
    assert.match(form.govde, /Önizleme/);

    const y = await c.csrfIle('/hakedisler/yeni',
      { sozlesmeId: V.sozlesme.id, donem: '2026-09', _idempotency: 'f4b-h1' });
    assert.equal(y.durum, 200);
    V.hakedis = tek('SELECT * FROM hakedis WHERE sozlesme_id = ?', V.sozlesme.id);
    /* 400 m³ × 1.800,00 = 720.000,00 TL = 72.000.000 kuruş */
    assert.equal(String(V.hakedis.donem_brut_minor), '72000000');
    assert.equal(String(V.hakedis.avans_mahsup_minor), '7200000');    // %10
    assert.equal(String(V.hakedis.teminat_kesinti_minor), '3600000'); // %5
    assert.equal(String(V.hakedis.stopaj_minor), '2160000');          // %3
    assert.equal(String(V.hakedis.net_minor), '59040000');
    assert.equal(sorgu('SELECT id FROM hakedis_satiri WHERE hakedis_id = ?', V.hakedis.id).length, 1);
  });

  test('aynı metraj iki kez ödenmez; açık hakediş varken ikincisi açılmaz', async () => {
    const c = await finans();
    const ikinci = await c.csrfIle('/hakedisler/yeni',
      { sozlesmeId: V.sozlesme.id, donem: '2026-10', _idempotency: 'f4b-h2' });
    assert.equal(ikinci.durum, 409, 'açık hakediş varken ikincisi açıldı');

    /* Hakedişi onaylayıp yeni metraj olmadan tekrar üretmeyi dene. */
    await c.csrfIle(`/hakedisler/${V.hakedis.id}`, { _eylem: 'onaya_gonder' });
    assert.equal(await onayla('hakedis', V.hakedis.id, 'hakedis',
      ['proje@yapitas.demo', 'sahip@yapitas.demo']), 'onaylandi');
    assert.equal(HK.oncekiHakedisMiktari(V.poz1.id), 400_000);

    const yeniden = await c.csrfIle('/hakedisler/yeni',
      { sozlesmeId: V.sozlesme.id, donem: '2026-10', _idempotency: 'f4b-h3' });
    assert.equal(yeniden.durum, 409, 'yeni metraj olmadan hakediş üretildi');
  });

  test('onaylı hakediş yeniden hesaplanamaz (kural 6)', async () => {
    const c = await finans();
    const y = await c.csrfIle(`/hakedisler/${V.hakedis.id}`, { _eylem: 'yeniden_hesapla' });
    assert.equal(y.durum, 409);
  });
});

describe('CNT-12..14 — değişiklik zeyil açar, süre uzatımı dayanak ister', () => {
  test('onaylı değişiklik emri otomatik zeyil TASLAĞI açar (§7)', async () => {
    const pm = await olarak('proje@yapitas.demo');
    const y = await pm.csrfIle('/degisiklikler/yeni', { baslik: 'İlave kazı',
      sozlesmeId: V.sozlesme.id, tutarEtkisi: '25.000,00', sureEtkisi: '10',
      _idempotency: 'f4b-d1' });
    assert.equal(y.durum, 200);
    const d = tek(`SELECT * FROM degisiklik WHERE baslik = 'İlave kazı'`);
    await pm.csrfIle(`/degisiklikler/${d.id}`, { _eylem: 'onaya_gonder' });
    assert.equal(await onayla('degisiklik', d.id, 'degisiklik',
      ['finans@yapitas.demo', 'sahip@yapitas.demo']), 'onaylandi');

    const zeyil = tek('SELECT * FROM zeyil WHERE degisiklik_id = ?', d.id);
    assert.ok(zeyil, 'onaylı değişiklik zeyil açmadı');
    assert.equal(zeyil.durum, 'taslak', 'zeyil kendi onayını atlayıp onaylı açıldı');
    assert.equal(String(zeyil.tutar_farki_minor), '2500000');
  });

  test('gecikme günü tarih aralığından hesaplanır; kabul dört göz ister', async () => {
    const c = await finans();
    const y = await c.csrfIle('/gecikme-olaylari', { baslik: 'Yoğun yağış', tur: 'hava',
      baslangic: '2026-09-01', bitis: '2026-09-10' });
    assert.equal(y.durum, 200);
    V.gecikme = tek(`SELECT * FROM gecikme_olayi WHERE baslik = 'Yoğun yağış'`);
    assert.equal(V.gecikme.etkilenen_gun, 10);

    await c.csrfIle('/gecikme-olaylari', { _eylem: 'gecis', id: V.gecikme.id, gecis: 'degerlendir' });
    /* Olayı bildiren kabul edemez (dört göz). */
    const kendi = await c.csrfIle('/gecikme-olaylari',
      { _eylem: 'gecis', id: V.gecikme.id, gecis: 'kabul_et', gerekce: 'Rapor' });
    assert.equal(kendi.durum, 403, 'olayı bildiren kendi olayını kabul etti');

    const pm = await olarak('proje@yapitas.demo');
    const ok = await pm.csrfIle('/gecikme-olaylari',
      { _eylem: 'gecis', id: V.gecikme.id, gecis: 'kabul_et', gerekce: 'Meteoroloji raporu' });
    assert.equal(ok.durum, 200);
    assert.equal(tek('SELECT durum FROM gecikme_olayi WHERE id = ?', V.gecikme.id).durum, 'kabul');
  });

  test('süre uzatımı KABUL edilmiş olaya dayanır ve dayanağı aşamaz', async () => {
    const c = await finans();
    await c.csrfIle('/gecikme-olaylari', { baslik: 'Kabulsüz olay', tur: 'diger',
      baslangic: '2026-09-20', bitis: '2026-09-25' });
    const kabulsuz = tek(`SELECT * FROM gecikme_olayi WHERE baslik = 'Kabulsüz olay'`);
    assert.equal((await c.csrfIle('/sure-uzatim', { _eylem: 'ac', baslik: 'X',
      talepGun: '5', olaylar: kabulsuz.id })).durum, 409);

    assert.equal((await c.csrfIle('/sure-uzatim', { _eylem: 'ac', baslik: 'Yağış uzatımı',
      talepGun: '20', olaylar: V.gecikme.id })).durum, 422, 'dayanağı aşan talep kabul edildi');

    const ok = await c.csrfIle('/sure-uzatim', { _eylem: 'ac', baslik: 'Yağış uzatımı',
      talepGun: '10', olaylar: V.gecikme.id });
    assert.equal(ok.durum, 200);
    assert.ok(tek(`SELECT id FROM sure_uzatim WHERE baslik = 'Yağış uzatımı'`));
  });

  test('claim dayanaksız açılamaz', async () => {
    const c = await finans();
    assert.equal((await c.csrfIle('/claimler',
      { baslik: 'Hızlandırma', talepTutari: '75.000,00' })).durum, 422);
    assert.equal((await c.csrfIle('/claimler',
      { baslik: 'Hızlandırma', talepTutari: '75.000,00', dayanak: 'Madde 12.3' })).durum, 200);
  });
});

describe('FIN — kasa/banka/cari bakiyesi defterden türer (kural 7)', () => {
  test('kasa eksiye düşemez; belgesiz harcama açıklama ister', async () => {
    const c = await finans();
    await c.csrfIle('/kasalar', { ad: 'Merkez Kasa' });
    V.kasa = tek('SELECT * FROM kasa');
    assert.equal(fdefter.bakiye('kasa', V.kasa.id), 0);

    assert.equal((await c.csrfIle('/kasa-hareketleri',
      { kasaId: V.kasa.id, tur: 'odeme', tutar: '1.000,00', aciklama: 'x' })).durum, 409);
    assert.equal((await c.csrfIle('/kasa-hareketleri',
      { kasaId: V.kasa.id, tur: 'tahsilat', tutar: '10.000,00' })).durum, 422,
    'belgesiz ve açıklamasız hareket kabul edildi');

    const ok = await c.csrfIle('/kasa-hareketleri',
      { kasaId: V.kasa.id, tur: 'tahsilat', tutar: '10.000,00', belgeNo: 'MAK-1' });
    assert.equal(ok.durum, 200);
    assert.equal(fdefter.bakiye('kasa', V.kasa.id), 1_000_000);
  });

  test('kasa defteri satırı DEĞİŞTİRİLEMEZ; düzeltme ters kayıtla yapılır', async () => {
    const c = await finans();
    await c.csrfIle('/kasa-hareketleri',
      { kasaId: V.kasa.id, tur: 'odeme', tutar: '3.000,00', belgeNo: 'ODE-1' });
    assert.equal(fdefter.bakiye('kasa', V.kasa.id), 700_000);
    const hh = tek(`SELECT * FROM kasa_hareketi WHERE tur = 'odeme'`);

    assert.throws(() => calistir('UPDATE kasa_hareketi SET tutar_minor = 1 WHERE id = ?', hh.id),
      /değiştirilemez/);
    assert.throws(() => calistir('DELETE FROM kasa_hareketi WHERE id = ?', hh.id), /silinemez/);

    assert.equal((await c.csrfIle('/kasa-hareketleri',
      { _eylem: 'ters', hareketId: hh.id })).durum, 422, 'gerekçesiz ters kayıt kabul edildi');
    const ters = await c.csrfIle('/kasa-hareketleri',
      { _eylem: 'ters', hareketId: hh.id, gerekce: 'Yanlış kasaya yazıldı' });
    assert.equal(ters.durum, 200);
    assert.equal(fdefter.bakiye('kasa', V.kasa.id), 1_000_000);
    assert.equal((await c.csrfIle('/kasa-hareketleri',
      { _eylem: 'ters', hareketId: hh.id, gerekce: 'Tekrar' })).durum, 409);
  });

  test('banka hareketinde tutar/yön/tarih değişmez; mükerrer referans reddedilir', async () => {
    const c = await finans();
    await c.csrfIle('/banka-hesaplari', { banka: 'X Bank', ad: 'Ana hesap', iban: 'TR0011' });
    V.hesap = tek('SELECT * FROM banka_hesabi');
    const ok = await c.csrfIle('/banka-hareketleri',
      { hesapId: V.hesap.id, tur: 'gelen', tutar: '50.000,00', bankaReferans: 'REF-1' });
    assert.equal(ok.durum, 200);
    assert.equal(fdefter.bakiye('banka', V.hesap.id), 5_000_000);

    const mukerrer = await c.csrfIle('/banka-hareketleri',
      { hesapId: V.hesap.id, tur: 'gelen', tutar: '50.000,00', bankaReferans: 'REF-1' });
    assert.equal(mukerrer.durum, 409, 'aynı ekstre satırı iki kez girildi');

    const bh = tek('SELECT * FROM banka_hareketi');
    assert.throws(() => calistir('UPDATE banka_hareketi SET tutar_minor = 1 WHERE id = ?', bh.id),
      /değiştirilemez/);
    /* Eşleştirme alanları güncellenebilir — tetikleyici yalnız tutar/yön/tarihi korur. */
    calistir(`UPDATE banka_hareketi SET aciklama = 'not' WHERE id = ?`, bh.id);
  });
});

describe('FIN-14 — üçlü eşleştirme (Faz 4 kabul)', () => {
  test('sipariş → mal kabul → fatura zinciri kurulur', async () => {
    const sa = await olarak('satinalma@yapitas.demo');
    await sa.csrfIle('/tedarikciler', { unvan: 'Gama Tedarik', tur: 'malzeme' });
    V.tedarikci = tek(`SELECT * FROM tedarikci WHERE unvan = 'Gama Tedarik'`);
    await sa.csrfIle('/satinalma/siparisler/yeni', { baslik: 'Demir alımı',
      tedarikciId: V.tedarikci.id, kalem0Aciklama: 'Ø12 donatı', kalem0Miktar: '10',
      kalem0Birim: 'ton', kalem0Fiyat: '20.000,00', _idempotency: 'f4b-s1' });
    V.siparis = tek(`SELECT * FROM siparis WHERE baslik = 'Demir alımı'`);
    await sa.csrfIle(`/satinalma/siparisler/${V.siparis.id}`, { _eylem: 'onaya_gonder' });
    assert.equal(await onayla('siparis', V.siparis.id, 'siparis'), 'onaylandi');

    const depo = await olarak('depo@yapitas.demo');
    await depo.csrfIle('/depolar', { ad: 'Ana Depo' });
    await depo.csrfIle('/stok-kartlari', { kod: 'DEM12', ad: 'Ø12 donatı', birim: 'ton' });
    V.depo = tek('SELECT * FROM depo');
    V.kart = tek('SELECT * FROM stok_karti');
    const sk = tek('SELECT * FROM siparis_kalemi WHERE siparis_id = ?', V.siparis.id);
    await depo.csrfIle('/mal-kabul/yeni', { depoId: V.depo.id, siparisId: V.siparis.id,
      irsaliyeNo: 'IRS-77', kalem0Aciklama: 'Ø12', kalem0Kart: V.kart.id,
      kalem0Miktar: '10', kalem0Kaynak: sk.id, _idempotency: 'f4b-mk1' });
    V.malKabul = tek('SELECT * FROM mal_kabul');
    await depo.csrfIle(`/mal-kabul/${V.malKabul.id}`, { _eylem: 'kontrole_gonder' });
    const mkk = tek('SELECT * FROM mal_kabul_kalemi WHERE mal_kabul_id = ?', V.malKabul.id);
    const karar = await depo.csrfIle(`/mal-kabul/${V.malKabul.id}`,
      { _eylem: 'karar', [`kabul_${mkk.id}`]: '10', [`ret_${mkk.id}`]: '0' });
    assert.equal(karar.durum, 200);
    assert.equal(tek('SELECT durum FROM mal_kabul WHERE id = ?', V.malKabul.id).durum, 'kabul');
  });

  test('mükerrer fatura reddedilir; eşleştirmesiz fatura onaya gitmez', async () => {
    const c = await finans();
    const y = await c.csrfIle('/faturalar', { faturaNo: 'F-2026-1', tedarikciId: V.tedarikci.id,
      siparisId: V.siparis.id, matrah: '200.000,00', kdv: '40.000,00' });
    assert.equal(y.durum, 200);
    V.fatura = tek(`SELECT * FROM fatura WHERE fatura_no = 'F-2026-1'`);
    assert.equal(V.fatura.eslestirme, 'yapilmadi');

    assert.equal((await c.csrfIle('/faturalar',
      { faturaNo: 'F-2026-1', tedarikciId: V.tedarikci.id, matrah: '1,00' })).durum, 409,
    'mükerrer fatura kabul edildi');

    assert.equal((await c.csrfIle('/faturalar',
      { faturaId: V.fatura.id, _eylem: 'onaya_gonder' })).durum, 409,
    'eşleştirmesiz fatura onaya gönderildi');
  });

  test('eşleştirme sonucu HESAPLANIR; tam tutarda "eşleşti" olur', async () => {
    const c = await finans();
    const y = await c.csrfIle('/faturalar/eslestirme', { faturaId: V.fatura.id });
    assert.equal(y.durum, 200);
    const f = tek('SELECT * FROM fatura WHERE id = ?', V.fatura.id);
    assert.equal(f.eslestirme, 'eslesti');
    assert.equal(Number(f.fark_minor), 0);
    /* Cari defterine fatura kaydı düştü. */
    assert.ok(tek(`SELECT id FROM cari_hareket WHERE kaynak_nesne = 'fatura' AND kaynak_id = ?`, f.id)
      || !f.cari_id, 'cari kaydı beklenmedik');
  });

  test('tolerans DIŞI fark gerekçe ister ve onaya gider', async () => {
    const c = await finans();
    await c.csrfIle('/faturalar', { faturaNo: 'F-2026-2', tedarikciId: V.tedarikci.id,
      siparisId: V.siparis.id, matrah: '230.000,00' });
    const f2 = tek(`SELECT * FROM fatura WHERE fatura_no = 'F-2026-2'`);

    const gerekcesiz = await c.csrfIle('/faturalar/eslestirme', { faturaId: f2.id });
    assert.equal(gerekcesiz.durum, 422, 'tolerans dışı fark gerekçesiz geçti');
    assert.equal(tek('SELECT eslestirme FROM fatura WHERE id = ?', f2.id).eslestirme, 'yapilmadi');

    const ok = await c.csrfIle('/faturalar/eslestirme',
      { faturaId: f2.id, gerekce: 'Nakliye bedeli faturaya eklendi' });
    assert.equal(ok.durum, 200);
    const guncel = tek('SELECT * FROM fatura WHERE id = ?', f2.id);
    assert.equal(guncel.eslestirme, 'tolerans_disi');
    assert.equal(Number(guncel.fark_minor), 3_000_000);   // 230.000 − 200.000 TL
    assert.ok(guncel.fark_gerekcesi);

    /* Tolerans dışı fatura onaya GİDEBİLİR (gerekçesi var) ve onay zinciri açılır. */
    const gonder = await c.csrfIle('/faturalar', { faturaId: f2.id, _eylem: 'onaya_gonder' });
    assert.equal(gonder.durum, 200);
    const t = tek(`SELECT * FROM onay_talebi WHERE nesne = 'fatura' AND nesne_id = ?`, f2.id);
    assert.ok(t, 'tolerans dışı fatura onaya gitmedi');
    assert.match(t.baslik, /TOLERANS DIŞI/);
  });

  test('tolerans İÇİ fark otomatik geçer', async () => {
    const c = await finans();
    /* 200.000 TL'nin binde 5'i 1.000 TL ama tavan 50 TL → sınır 50 TL. */
    await c.csrfIle('/faturalar', { faturaNo: 'F-2026-3', tedarikciId: V.tedarikci.id,
      siparisId: V.siparis.id, matrah: '200.030,00' });
    const f3 = tek(`SELECT * FROM fatura WHERE fatura_no = 'F-2026-3'`);
    const y = await c.csrfIle('/faturalar/eslestirme', { faturaId: f3.id });
    assert.equal(y.durum, 200);
    assert.equal(tek('SELECT eslestirme FROM fatura WHERE id = ?', f3.id).eslestirme, 'tolerans_ici');
  });
});

describe('FIN-11 / FIN-15 — ödeme ve dönem kapanışı', () => {
  test('onaysız faturaya ödeme talebi açılamaz', async () => {
    const c = await finans();
    const y = await c.csrfIle('/odemeler',
      { baslik: 'Erken ödeme', faturaId: V.fatura.id, yontem: 'nakit' });
    assert.equal(y.durum, 409);
  });

  test('onaylı faturaya ödeme açılır, kasadan ödenince defter ve fatura güncellenir', async () => {
    const c = await finans();
    await c.csrfIle('/faturalar', { faturaId: V.fatura.id, _eylem: 'onaya_gonder' });
    assert.equal(await onayla('fatura', V.fatura.id, 'fatura',
      ['proje@yapitas.demo', 'sahip@yapitas.demo']), 'onaylandi');

    /* Kasada yeterli bakiye olsun. */
    await c.csrfIle('/kasa-hareketleri',
      { kasaId: V.kasa.id, tur: 'tahsilat', tutar: '500.000,00', belgeNo: 'MAK-2' });
    const oncekiBakiye = fdefter.bakiye('kasa', V.kasa.id);

    const ac = await c.csrfIle('/odemeler',
      { baslik: 'F-2026-1 ödemesi', faturaId: V.fatura.id, yontem: 'nakit' });
    assert.equal(ac.durum, 200);
    const o = tek(`SELECT * FROM odeme WHERE fatura_id = ?`, V.fatura.id);
    assert.equal(String(o.tutar_minor), String(V.fatura.toplam_minor), 'tutar faturadan alınmadı');

    await c.csrfIle('/odemeler', { _eylem: 'onaya_gonder', odemeId: o.id });
    assert.equal(await onayla('odeme', o.id, 'odeme',
      ['proje@yapitas.demo', 'sahip@yapitas.demo']), 'onaylandi');

    const ode = await c.csrfIle('/odemeler',
      { _eylem: 'kasadan_ode', odemeId: o.id, kasaId: V.kasa.id });
    assert.equal(ode.durum, 200);
    assert.equal(tek('SELECT durum FROM odeme WHERE id = ?', o.id).durum, 'odendi');
    assert.equal(tek('SELECT durum FROM fatura WHERE id = ?', V.fatura.id).durum, 'odendi');
    assert.equal(fdefter.bakiye('kasa', V.kasa.id), oncekiBakiye - Number(o.tutar_minor));
  });

  test('engel varken dönem kapanmaz; kapatan tek başına yeniden açamaz', async () => {
    const c = await finans();
    const donem = new Date().toISOString().slice(0, 7);
    const engelli = await c.csrfIle('/finans/donem-kapanis', { donem, _eylem: 'kapat' });
    assert.equal(engelli.durum, 409, 'engel varken dönem kapandı');

    /* Engelleri temizle: açık faturaları iptal et, sayımı kapat. */
    for (const f of sorgu(`SELECT * FROM fatura WHERE durum IN ('kayitli','eslestirmede','onaya_gonderildi','incelemede')`)) {
      calistir(`UPDATE fatura SET durum = 'iptal', surum = surum + 1 WHERE id = ?`, f.id);
    }
    for (const o of sorgu(`SELECT * FROM odeme WHERE durum IN ('onaya_gonderildi','incelemede')`)) {
      calistir(`UPDATE odeme SET durum = 'iptal', surum = surum + 1 WHERE id = ?`, o.id);
    }
    for (const hk of sorgu(`SELECT * FROM hakedis WHERE durum IN ('onaya_gonderildi','incelemede')`)) {
      calistir(`UPDATE hakedis SET durum = 'iptal', surum = surum + 1 WHERE id = ?`, hk.id);
    }
    calistir('UPDATE banka_hareketi SET eslesen_nesne = ?, eslesen_id = ? WHERE eslesen_id IS NULL',
      'manuel', 'x');

    const kapat = await c.csrfIle('/finans/donem-kapanis',
      { donem, _eylem: 'kapat', gerekce: 'Ay sonu kapanışı' });
    assert.equal(kapat.durum, 200, 'engel yokken dönem kapanmadı');
    assert.equal(tek('SELECT durum FROM finans_donemi WHERE donem = ?', donem).durum, 'kapali');

    /* Kapalı döneme hareket yazılamaz. */
    const yazma = await c.csrfIle('/kasa-hareketleri',
      { kasaId: V.kasa.id, tur: 'tahsilat', tutar: '100,00', belgeNo: 'X' });
    assert.equal(yazma.durum, 409, 'kapalı döneme kasa hareketi yazıldı');

    /* Kapatan kişi tek başına yeniden açamaz (dört göz). */
    const kendi = await c.csrfIle('/finans/donem-kapanis',
      { donem, _eylem: 'yeniden_ac', gerekce: 'Hata düzeltme' });
    assert.equal(kendi.durum, 409, 'kapatan kişi dönemi yeniden açtı');

    const sahip = await olarak('sahip@yapitas.demo');
    const ac = await sahip.csrfIle('/finans/donem-kapanis',
      { donem, _eylem: 'yeniden_ac', gerekce: 'Eksik fatura bulundu' });
    assert.equal(ac.durum, 200);
    assert.equal(tek('SELECT durum FROM finans_donemi WHERE donem = ?', donem).durum, 'acik');
  });
});

describe('Sözleşme ve finans ekranları ortak kalıba ve yetkiye uyar', () => {
  const YOLLAR = ['/sozlesmeler', '/sozlesmeler/yeni', '/teminatlar', '/metraj', '/hakedisler',
    '/hakedisler/yeni', '/degisiklikler', '/degisiklikler/yeni', '/gecikme-olaylari',
    '/sure-uzatim', '/claimler', '/finans', '/butceler', '/tahminler', '/kasalar',
    '/kasa-hareketleri', '/banka-hesaplari', '/banka-hareketleri',
    '/banka-hareketleri/eslestirme', '/cariler', '/odemeler', '/odemeler/plan',
    '/faturalar', '/faturalar/eslestirme', '/finans/donem-kapanis'];

  test('hepsi 200 döner ve page-head kalıbını taşır', async () => {
    const c = await finans();
    for (const yol of YOLLAR) {
      const r = await c.get(yol);
      assert.equal(r.durum, 200, `${yol} açılmadı`);
      assert.match(r.govde, /class="gv-page-head"/, `${yol} page-head taşımıyor`);
    }
  });

  test('yazma formlarında durum veya onaycı alanı yok (kural 5)', async () => {
    const c = await finans();
    for (const yol of YOLLAR) {
      const r = await c.get(yol);
      for (const f of r.govde.match(/<form method="post"[\s\S]*?<\/form>/g) || []) {
        assert.ok(!/name="durum"/.test(f), `${yol} yazma formunda durum alanı var`);
        assert.ok(!/name="onayci/i.test(f), `${yol} yazma formunda onaycı alanı var`);
      }
    }
  });

  test('liste ekranları sayfalama standardını taşır (§3.5)', async () => {
    const c = await finans();
    for (const yol of ['/sozlesmeler', '/teminatlar', '/hakedisler', '/degisiklikler',
      '/gecikme-olaylari', '/sure-uzatim', '/claimler', '/faturalar', '/odemeler']) {
      const r = await c.get(yol);
      assert.match(r.govde, /class="gv-pager"/, `${yol} sayfalayıcı yok`);
      assert.match(r.govde, /Veri tarihi/, `${yol} veri tarihi künyesi yok`);
    }
  });

  test('yetkisiz rol finans ekranlarına erişemez', async () => {
    const c = await olarak('depo@yapitas.demo');   // bolumler: calisma, stok, varlik
    for (const yol of ['/finans', '/kasalar', '/faturalar', '/sozlesmeler', '/hakedisler']) {
      const r = await c.get(yol);
      assert.equal(r.durum, 403, `${yol} yetkisiz role açıldı`);
    }
  });
});
