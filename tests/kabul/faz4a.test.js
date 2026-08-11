/* ============================================================================
   KABUL TESTLERİ — Faz 4a: satın alma ve stok (PRC-01..13, STK-01..10)
   ----------------------------------------------------------------------------
   PRC-01  "Onaylanmamış talep siparişe dönüştürülemez."
   STK-01  "Stok bakiyesi hareket defterinden yeniden hesaplanabilir."
   ========================================================================== */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { uygulamaBaslat } from '../yardimci.mjs';
import { sorgu, tek, calistir } from '../../app/cekirdek/db.mjs';
import * as defter from '../../app/moduller/stok/defter.mjs';

let S;
before(async () => { S = await uygulamaBaslat(); });
after(async () => { await S.kapat(); });

const olarak = async (eposta) => { const c = S.istemci(); await c.giris(eposta); return c; };
const yonetici = () => olarak('sahip@yapitas.demo');

const V = {};
async function ortam(c) {
  if (V.tedarikci) return V;
  await c.csrfIle('/tedarikciler', { unvan: 'Beta Yapı Malzemeleri', tur: 'malzeme', vergiNo: '1112223334' });
  V.tedarikci = tek(`SELECT * FROM tedarikci WHERE unvan = 'Beta Yapı Malzemeleri'`);
  await c.csrfIle('/depolar', { ad: 'Merkez Depo', tur: 'merkez' });
  await c.csrfIle('/depolar', { ad: 'Şantiye Depo', tur: 'santiye' });
  [V.depo1, V.depo2] = sorgu('SELECT * FROM depo ORDER BY olusturuldu');
  await c.csrfIle('/stok-kartlari', { kod: 'CEM-425', ad: 'CEM I 42,5', birim: 'ton', kritikSeviye: '10' });
  V.kart = tek(`SELECT * FROM stok_karti WHERE kod = 'CEM-425'`);
  return V;
}

/** Talebi onay zincirinden geçirir (tutar kademesine göre 1 veya 2 adım). */
async function talebiOnayla(talepId) {
  const talep = tek('SELECT * FROM onay_talebi WHERE nesne = ? AND nesne_id = ?', 'talep', talepId);
  assert.ok(talep, 'onay talebi açılmadı');
  for (const eposta of ['proje@yapitas.demo', 'finans@yapitas.demo', 'sahip@yapitas.demo']) {
    if (tek('SELECT durum FROM talep WHERE id = ?', talepId).durum === 'onaylandi') break;
    const c = await olarak(eposta);
    await c.csrfIle(`/onaylar/${talep.id}`, { karar: 'onayla', belgeSurum: String(talep.belge_surum) });
  }
  return tek('SELECT durum FROM talep WHERE id = ?', talepId).durum;
}

describe('PRC-01 — onaylanmamış talep siparişe dönüşmez', () => {
  test('talep taslak açılır; tutar KALEMLERDEN hesaplanır', async () => {
    const c = await yonetici();
    await ortam(c);
    const y = await c.csrfIle('/satinalma/talepler/yeni', {
      baslik: 'Çimento alımı', kalem0Aciklama: 'CEM I 42,5', kalem0Miktar: '100',
      kalem0Birim: 'ton', kalem0Fiyat: '2.500,00', _idempotency: 'f4-t1' });
    assert.equal(y.durum, 200);
    V.talep = tek(`SELECT * FROM talep WHERE baslik = 'Çimento alımı'`);
    assert.equal(V.talep.durum, 'taslak');
    /* 100 ton × 2.500,00 TL = 250.000,00 TL = 25.000.000 kuruş */
    assert.equal(String(V.talep.tutar_minor), '25000000');
    V.talepKalemi = tek('SELECT * FROM talep_kalemi WHERE talep_id = ?', V.talep.id);
    assert.equal(V.talepKalemi.miktar_binde, 100_000);
  });

  test('TASLAK talepten sipariş açılamaz', async () => {
    const c = await yonetici();
    const y = await c.csrfIle('/satinalma/siparisler/yeni', {
      baslik: 'Çimento siparişi', tedarikciId: V.tedarikci.id, talepId: V.talep.id,
      kalem0Aciklama: 'CEM I', kalem0Miktar: '100', kalem0Fiyat: '2.500,00',
      kalem0Kaynak: V.talepKalemi.id, _idempotency: 'f4-s-erken' });
    assert.equal(y.durum, 409, 'onaysız talep siparişe dönüştürüldü');
    assert.equal(sorgu('SELECT id FROM siparis').length, 0);
  });

  test('kalemsiz talep onaya gönderilemez; onay zinciri tutardan seçilir', async () => {
    const c = await yonetici();
    await c.csrfIle('/satinalma/talepler/yeni',
      { baslik: 'Boş talep', kalem0Aciklama: 'X', kalem0Miktar: '1', _idempotency: 'f4-t2' });
    const bos = tek(`SELECT * FROM talep WHERE baslik = 'Boş talep'`);
    calistir('DELETE FROM talep_kalemi WHERE talep_id = ?', bos.id);
    const y = await c.csrfIle(`/satinalma/talepler/${bos.id}`, { _eylem: 'onaya_gonder' });
    assert.equal(y.durum, 409);

    const ok = await c.csrfIle(`/satinalma/talepler/${V.talep.id}`, { _eylem: 'onaya_gonder' });
    assert.equal(ok.durum, 200);
    assert.equal(tek('SELECT durum FROM talep WHERE id = ?', V.talep.id).durum, 'onaya_gonderildi');
    /* 250.000 TL → TALEP-ORTA (25.000-250.000 TL): iki adımlı zincir. */
    const talep = tek(`SELECT * FROM onay_talebi WHERE nesne = 'talep' AND nesne_id = ?`, V.talep.id);
    assert.equal(sorgu('SELECT DISTINCT sira FROM onay_adimi WHERE talep_id = ?', talep.id).length, 2);
  });

  test('onaydaki talebin kalemleri değiştirilemez (kural 6)', async () => {
    const c = await yonetici();
    const y = await c.csrfIle(`/satinalma/talepler/${V.talep.id}`,
      { _eylem: 'kalem', kalemAciklamasi: 'Ek kalem', kalemMiktari: '5' });
    assert.equal(y.durum, 409);
  });

  test('onaylı talepten sipariş açılır; miktar talebi AŞAMAZ', async () => {
    assert.equal(await talebiOnayla(V.talep.id), 'onaylandi');
    /* Siparişi SATIN ALMA SORUMLUSU açar: dört göz gereği talep sahibi kendi
       siparişini onaylayamaz; zincirin son adımı firma sahibidir. */
    const c = await olarak('satinalma@yapitas.demo');

    const asan = await c.csrfIle('/satinalma/siparisler/yeni', {
      baslik: 'Çimento siparişi', tedarikciId: V.tedarikci.id, talepId: V.talep.id,
      kalem0Aciklama: 'CEM I', kalem0Miktar: '150', kalem0Fiyat: '2.500,00',
      kalem0Kaynak: V.talepKalemi.id, _idempotency: 'f4-s-asan' });
    assert.equal(asan.durum, 422, 'talep miktarını aşan sipariş kabul edildi');

    const ok = await c.csrfIle('/satinalma/siparisler/yeni', {
      baslik: 'Çimento siparişi', tedarikciId: V.tedarikci.id, talepId: V.talep.id,
      kalem0Aciklama: 'CEM I 42,5', kalem0Miktar: '100', kalem0Birim: 'ton',
      kalem0Fiyat: '2.400,00', kalem0Kaynak: V.talepKalemi.id, _idempotency: 'f4-s1' });
    assert.equal(ok.durum, 200);
    V.siparis = tek('SELECT * FROM siparis');
    assert.equal(V.siparis.durum, 'taslak');
    assert.equal(String(V.siparis.tutar_minor), '24000000');
    assert.equal(tek('SELECT siparis_edilen_binde FROM talep_kalemi WHERE id = ?',
      V.talepKalemi.id).siparis_edilen_binde, 100_000);
  });

  test('kara listedeki tedarikçiye sipariş açılamaz', async () => {
    const c = await yonetici();
    await c.csrfIle('/tedarikciler', { unvan: 'Kara Liste A.Ş.', tur: 'malzeme' });
    const kl = tek(`SELECT * FROM tedarikci WHERE unvan = 'Kara Liste A.Ş.'`);
    const kara = await c.csrfIle(`/tedarikciler/${kl.id}`,
      { _eylem: 'kara_liste', gerekce: 'Tekrarlayan kalite sorunu', surum: String(kl.surum) });
    assert.equal(kara.durum, 200);
    assert.equal(tek('SELECT durum FROM tedarikci WHERE id = ?', kl.id).durum, 'kara_liste');

    const y = await c.csrfIle('/satinalma/siparisler/yeni', {
      baslik: 'Deneme', tedarikciId: kl.id, kalem0Aciklama: 'X', kalem0Miktar: '1',
      kalem0Fiyat: '10,00', _idempotency: 'f4-s-kl' });
    assert.equal(y.durum, 409);
  });
});

describe('PRC-04..06 — RFQ ve teklif karşılaştırma', () => {
  test('RFQ yalnız ONAYLI talepten açılır', async () => {
    const c = await yonetici();
    await c.csrfIle('/satinalma/talepler/yeni',
      { baslik: 'Onaysız talep', kalem0Aciklama: 'Demir', kalem0Miktar: '10', _idempotency: 'f4-t3' });
    const onaysiz = tek(`SELECT * FROM talep WHERE baslik = 'Onaysız talep'`);
    const y = await c.csrfIle('/satinalma/rfq', { baslik: 'Demir RFQ', talepId: onaysiz.id });
    assert.equal(y.durum, 409);

    const ok = await c.csrfIle('/satinalma/rfq',
      { baslik: 'Çimento RFQ', talepId: V.talep.id, sonTeklifTarihi: '2027-01-15' });
    assert.equal(ok.durum, 200);
    V.rfq = tek('SELECT * FROM rfq');
    assert.equal(V.rfq.durum, 'taslak');
  });

  test('gönderilmemiş RFQ\'ya teklif kaydedilemez; davetsiz gönderilemez', async () => {
    const c = await yonetici();
    const erken = await c.csrfIle(`/satinalma/karsilastirma/${V.rfq.id}`, {
      _eylem: 'teklif', tedarikciId: V.tedarikci.id,
      teklif0Aciklama: 'CEM I', teklif0Miktar: '100', teklif0Fiyat: '2.400,00' });
    assert.equal(erken.durum, 409);

    const davetsiz = await c.csrfIle(`/satinalma/karsilastirma/${V.rfq.id}`, { _eylem: 'gonder' });
    assert.equal(davetsiz.durum, 409, 'davetsiz RFQ gönderildi');
  });

  test('davet tokeni ÖZETLE saklanır; portal oturumsuz açılır ve teklif alır', async () => {
    const c = await yonetici();
    const davet = await c.csrfIle(`/satinalma/karsilastirma/${V.rfq.id}`,
      { _eylem: 'davet', tedarikciId: V.tedarikci.id });
    assert.equal(davet.durum, 200);
    const d = tek('SELECT * FROM rfq_tedarikci WHERE rfq_id = ?', V.rfq.id);
    assert.ok(d.token_ozeti, 'token özeti saklanmadı');
    assert.equal(d.token_ozeti.length, 64, 'token açık saklanıyor olabilir (SHA-256 özeti bekleniyor)');

    /* Geliştirme ortamında açık bağlantı ekranda gösterilir (K-021). */
    const m = davet.govde.match(/\/tedarikci\/teklif\/([A-Za-z0-9_-]+)/);
    assert.ok(m, 'davet bağlantısı gösterilmedi');
    V.portalToken = m[1];

    await c.csrfIle(`/satinalma/karsilastirma/${V.rfq.id}`, { _eylem: 'gonder' });
    assert.equal(tek('SELECT durum FROM rfq WHERE id = ?', V.rfq.id).durum, 'gonderildi');

    /* Oturumsuz istemci — portalın iç menüyü göstermediğini de doğrula. */
    const dis = S.istemci();
    const sayfa = await dis.get(`/tedarikci/teklif/${V.portalToken}`);
    assert.equal(sayfa.durum, 200);
    assert.match(sayfa.govde, /Tedarikçi portalı/);
    assert.ok(!/gv-rail/.test(sayfa.govde), 'dış portal iç menüyü gösteriyor');

    const y = await dis.csrfIle(`/tedarikci/teklif/${V.portalToken}`, {
      teslimGun: '15', odemeVadesiGun: '30',
      teklif0Aciklama: 'CEM I 42,5', teklif0Miktar: '100', teklif0Birim: 'ton',
      teklif0Fiyat: '2.350,00' });
    assert.equal(y.durum, 200);
    const t = tek('SELECT * FROM teklif WHERE rfq_id = ?', V.rfq.id);
    assert.ok(t, 'portalden teklif kaydedilmedi');
    assert.equal(t.kaynak, 'portal');
    assert.equal(String(t.toplam_minor), '23500000');
  });

  test('geçersiz token reddedilir', async () => {
    const dis = S.istemci();
    const r = await dis.get('/tedarikci/teklif/gecersiz-token-12345');
    assert.equal(r.durum, 404);
  });

  test('kazanan seçimi gerekçe ister ve RFQ\'yu bir kez sonuçlandırır', async () => {
    const c = await yonetici();
    const t = tek('SELECT * FROM teklif WHERE rfq_id = ?', V.rfq.id);
    const gerekcesiz = await c.csrfIle(`/satinalma/karsilastirma/${V.rfq.id}`,
      { _eylem: 'kazanan', teklifId: t.id });
    assert.equal(gerekcesiz.durum, 422);

    const ok = await c.csrfIle(`/satinalma/karsilastirma/${V.rfq.id}`,
      { _eylem: 'kazanan', teklifId: t.id, gerekce: 'Tek ve en düşük teklif' });
    assert.equal(ok.durum, 200);
    assert.equal(tek('SELECT durum FROM rfq WHERE id = ?', V.rfq.id).durum, 'sonuclandi');
    assert.equal(tek('SELECT durum FROM teklif WHERE id = ?', t.id).durum, 'kazandi');

    const ikinci = await c.csrfIle(`/satinalma/karsilastirma/${V.rfq.id}`,
      { _eylem: 'kazanan', teklifId: t.id, gerekce: 'Tekrar' });
    assert.equal(ikinci.durum, 409, 'sonuçlanmış RFQ yeniden karara bağlandı');
  });
});

describe('PRC-10 — sipariş revizyonu yeni sürüm açar', () => {
  test('onaylı olmayan sipariş revize edilemez; onaylıda yeni sürüm açılır', async () => {
    const c = await yonetici();
    const erken = await c.csrfIle(`/satinalma/siparisler/${V.siparis.id}/revizyon`, { gerekce: 'Erken' });
    assert.equal(erken.durum, 409);

    const sa = await olarak('satinalma@yapitas.demo');
    await sa.csrfIle(`/satinalma/siparisler/${V.siparis.id}`, { _eylem: 'onaya_gonder' });
    const ot = tek(`SELECT * FROM onay_talebi WHERE nesne = 'siparis' AND nesne_id = ?`, V.siparis.id);
    for (const eposta of ['proje@yapitas.demo', 'finans@yapitas.demo', 'sahip@yapitas.demo']) {
      if (tek('SELECT durum FROM siparis WHERE id = ?', V.siparis.id).durum === 'onaylandi') break;
      const k = await olarak(eposta);
      await k.csrfIle(`/onaylar/${ot.id}`, { karar: 'onayla', belgeSurum: String(ot.belge_surum) });
    }
    assert.equal(tek('SELECT durum FROM siparis WHERE id = ?', V.siparis.id).durum, 'onaylandi');
    V.siparis = tek('SELECT * FROM siparis WHERE id = ?', V.siparis.id);

    const gerekcesiz = await c.csrfIle(`/satinalma/siparisler/${V.siparis.id}/revizyon`, {});
    assert.equal(gerekcesiz.durum, 422);

    const y = await c.csrfIle(`/satinalma/siparisler/${V.siparis.id}/revizyon`,
      { gerekce: 'Termin öne çekildi', teslimTarihi: '2026-10-15' });
    assert.equal(y.durum, 200);
    const yeni = tek('SELECT * FROM siparis WHERE kod = ? AND surum_no = 2', V.siparis.kod);
    assert.ok(yeni, 'revizyon sürümü açılmadı');
    assert.equal(yeni.onceki_surum_id, V.siparis.id);
    assert.equal(sorgu('SELECT id FROM siparis_kalemi WHERE siparis_id = ?', yeni.id).length,
      sorgu('SELECT id FROM siparis_kalemi WHERE siparis_id = ?', V.siparis.id).length);
    /* Önceki sürüm dokunulmadan kaldı. */
    assert.equal(tek('SELECT durum FROM siparis WHERE id = ?', V.siparis.id).durum, 'onaylandi');
    calistir(`UPDATE siparis SET durum = 'iptal' WHERE id = ?`, yeni.id);   // test izolasyonu
  });
});

describe('STK-01 — bakiye HAREKET DEFTERİNDEN yeniden hesaplanır', () => {
  test('yetersiz stokta çıkış reddedilir; bakiye eksiye düşemez', async () => {
    const c = await yonetici();
    const y = await c.csrfIle('/stok/sarf',
      { tur: 'sarf', depoId: V.depo1.id, kartId: V.kart.id, miktar: '5' });
    assert.equal(y.durum, 409);
    assert.equal(defter.bakiye(V.depo1.id, V.kart.id), 0);
  });

  test('mal kabul kararı verilmeden deftere satır yazılmaz', async () => {
    const c = await yonetici();
    const y = await c.csrfIle('/mal-kabul/yeni', {
      depoId: V.depo1.id, siparisId: V.siparis.id, irsaliyeNo: 'IRS-2026-1',
      kalem0Aciklama: 'CEM I 42,5', kalem0Kart: V.kart.id, kalem0Miktar: '100',
      kalem0Kaynak: tek('SELECT id FROM siparis_kalemi WHERE siparis_id = ?', V.siparis.id).id,
      _idempotency: 'f4-mk1' });
    assert.equal(y.durum, 200);
    V.malKabul = tek('SELECT * FROM mal_kabul');
    assert.equal(V.malKabul.durum, 'taslak');
    assert.equal(sorgu('SELECT id FROM stok_hareketi').length, 0, 'karar öncesi deftere yazıldı');
  });

  test('kısmi kabul: kabul deftere yazılır, ret otomatik NCR açar (§7)', async () => {
    const c = await yonetici();
    await c.csrfIle(`/mal-kabul/${V.malKabul.id}`, { _eylem: 'kontrole_gonder' });
    const mk = tek('SELECT * FROM mal_kabul_kalemi WHERE mal_kabul_id = ?', V.malKabul.id);

    /* Kabul + ret gelen miktara eşit olmalı. */
    const eksik = await c.csrfIle(`/mal-kabul/${V.malKabul.id}`,
      { _eylem: 'karar', [`kabul_${mk.id}`]: '50', [`ret_${mk.id}`]: '10', gerekce: 'x' });
    assert.equal(eksik.durum, 422, 'kabul+ret ≠ gelen kabul edildi');

    const nedensiz = await c.csrfIle(`/mal-kabul/${V.malKabul.id}`,
      { _eylem: 'karar', [`kabul_${mk.id}`]: '90', [`ret_${mk.id}`]: '10', gerekce: 'Kısmi' });
    assert.equal(nedensiz.durum, 422, 'ret nedeni olmadan kabul edildi');

    const ok = await c.csrfIle(`/mal-kabul/${V.malKabul.id}`, {
      _eylem: 'karar', [`kabul_${mk.id}`]: '90', [`ret_${mk.id}`]: '10',
      [`neden_${mk.id}`]: 'Torba yırtık, nem almış', gerekce: 'Kısmi kabul' });
    assert.equal(ok.durum, 200);
    assert.equal(tek('SELECT durum FROM mal_kabul WHERE id = ?', V.malKabul.id).durum, 'kismi_kabul');

    /* Defter: yalnız KABUL edilen miktar. */
    assert.equal(defter.bakiye(V.depo1.id, V.kart.id), 90_000);
    assert.equal(sorgu('SELECT id FROM stok_hareketi').length, 1);
    /* Sipariş kaleminin teslim miktarı güncellendi. */
    assert.equal(tek('SELECT teslim_binde FROM siparis_kalemi WHERE siparis_id = ?',
      V.siparis.id).teslim_binde, 90_000);
    /* Ret → NCR (§7 zorunlu bağ). */
    const ncr = tek(`SELECT * FROM ncr WHERE baslik LIKE 'Mal kabul reddi%'`);
    assert.ok(ncr, 'ret NCR açmadı');
    assert.equal(ncr.karantina, 1);
    assert.equal(tek('SELECT ncr_id FROM mal_kabul_kalemi WHERE id = ?', mk.id).ncr_id, ncr.id);
  });

  test('karar bir kez verilir', async () => {
    const c = await yonetici();
    const mk = tek('SELECT * FROM mal_kabul_kalemi WHERE mal_kabul_id = ?', V.malKabul.id);
    const y = await c.csrfIle(`/mal-kabul/${V.malKabul.id}`,
      { _eylem: 'karar', [`kabul_${mk.id}`]: '100', [`ret_${mk.id}`]: '0' });
    assert.equal(y.durum, 409);
  });

  test('onaysız siparişe mal kabul yapılamaz', async () => {
    const c = await yonetici();
    await c.csrfIle('/satinalma/talepler/yeni',
      { baslik: 'Taslak sipariş için', kalem0Aciklama: 'X', kalem0Miktar: '1', _idempotency: 'f4-t9' });
    await c.csrfIle('/satinalma/siparisler/yeni', {
      baslik: 'Taslak sipariş', tedarikciId: V.tedarikci.id,
      kalem0Aciklama: 'X', kalem0Miktar: '1', kalem0Fiyat: '10,00', _idempotency: 'f4-s9' });
    const taslak = tek(`SELECT * FROM siparis WHERE baslik = 'Taslak sipariş'`);
    const y = await c.csrfIle('/mal-kabul/yeni', {
      depoId: V.depo1.id, siparisId: taslak.id,
      kalem0Aciklama: 'X', kalem0Kart: V.kart.id, kalem0Miktar: '1', _idempotency: 'f4-mk9' });
    assert.equal(y.durum, 409);
  });

  test('bakiye ekranı defterden yeniden hesaplanır ve hareketlerle tutar', async () => {
    const c = await yonetici();
    await c.csrfIle('/stok/sarf',
      { tur: 'sarf', depoId: V.depo1.id, kartId: V.kart.id, miktar: '30', aciklama: 'Temel betonu' });
    assert.equal(defter.bakiye(V.depo1.id, V.kart.id), 60_000);

    const r = await c.get(`/stok/hareketler?depo_id=${V.depo1.id}&kart_id=${V.kart.id}`);
    assert.equal(r.durum, 200);
    assert.match(r.govde, /Bakiye — defterden yeniden hesaplandı/);
    /* Ekrandaki bakiye ile toplanan defter aynı sayıyı verir. */
    const toplananBakiye = sorgu('SELECT yon, miktar_binde FROM stok_hareketi WHERE depo_id = ? AND stok_karti_id = ?',
      V.depo1.id, V.kart.id).reduce((a, x) => a + x.yon * x.miktar_binde, 0);
    assert.equal(toplananBakiye, 60_000);
    assert.match(r.govde, /60(<|\s)/, 'ekranda 60 bakiyesi görünmüyor');
  });

  test('defter satırı GÜNCELLENEMEZ ve SİLİNEMEZ (veritabanı tetikleyicisi)', () => {
    const h = tek('SELECT * FROM stok_hareketi LIMIT 1');
    assert.throws(() => calistir('UPDATE stok_hareketi SET miktar_binde = 1 WHERE id = ?', h.id),
      /değiştirilemez/);
    assert.throws(() => calistir('DELETE FROM stok_hareketi WHERE id = ?', h.id), /silinemez/);
  });

  test('düzeltme TERS KAYITLA yapılır; aynı hareket iki kez ters çevrilemez', async () => {
    const c = await yonetici();
    const sarf = tek(`SELECT * FROM stok_hareketi WHERE tur = 'sarf'`);
    const gerekcesiz = await c.csrfIle('/stok/hareketler', { hareketId: sarf.id });
    assert.equal(gerekcesiz.durum, 422);

    const y = await c.csrfIle('/stok/hareketler', { hareketId: sarf.id, gerekce: 'Yanlış depoya yazıldı' });
    assert.equal(y.durum, 200);
    const ters = tek('SELECT * FROM stok_hareketi WHERE ters_kayit_id = ?', sarf.id);
    assert.ok(ters, 'ters kayıt yazılmadı');
    assert.equal(ters.yon, -sarf.yon);
    /* Bakiye ters kayıtla geri geldi. */
    assert.equal(defter.bakiye(V.depo1.id, V.kart.id), 90_000);

    const ikinci = await c.csrfIle('/stok/hareketler', { hareketId: sarf.id, gerekce: 'Tekrar' });
    assert.equal(ikinci.durum, 409);
  });
});

describe('STK-06/07 — rezervasyon ve transfer', () => {
  test('rezervasyon KULLANILABİLİR stoktan yapılır', async () => {
    const c = await yonetici();
    const ok = await c.csrfIle('/stok/rezervasyonlar',
      { depoId: V.depo1.id, kartId: V.kart.id, miktar: '60', gerekce: 'B blok temel' });
    assert.equal(ok.durum, 200);
    assert.equal(defter.rezerve(V.depo1.id, V.kart.id), 60_000);
    assert.equal(defter.kullanilabilir(V.depo1.id, V.kart.id), 30_000);

    const asiri = await c.csrfIle('/stok/rezervasyonlar',
      { depoId: V.depo1.id, kartId: V.kart.id, miktar: '50' });
    assert.equal(asiri.durum, 409, 'kullanılabilirin üzerinde rezervasyon kabul edildi');
  });

  test('transfer iki hareket yazar; teslim alan sevk edenden farklı olmalı', async () => {
    const c = await yonetici();
    const ac = await c.csrfIle('/stok/transferler',
      { kaynakDepoId: V.depo1.id, hedefDepoId: V.depo2.id, kartId: V.kart.id, miktar: '20' });
    assert.equal(ac.durum, 200);
    const t = tek('SELECT * FROM stok_transferi');

    const sevk = await c.csrfIle('/stok/transferler', { _eylem: 'gecis', id: t.id, gecis: 'sevk_et' });
    assert.equal(sevk.durum, 200);
    assert.equal(defter.bakiye(V.depo1.id, V.kart.id), 70_000);
    assert.equal(defter.bakiye(V.depo2.id, V.kart.id), 0, 'sevkte hedef depoya yazıldı');

    /* Dört göz: sevk eden teslim alamaz. */
    const kendi = await c.csrfIle('/stok/transferler', { _eylem: 'gecis', id: t.id, gecis: 'teslim_al' });
    assert.equal(kendi.durum, 403, 'sevk eden kendi transferini teslim aldı');

    const depo = await olarak('depo@yapitas.demo');
    const teslim = await depo.csrfIle('/stok/transferler', { _eylem: 'gecis', id: t.id, gecis: 'teslim_al' });
    assert.equal(teslim.durum, 200);
    assert.equal(defter.bakiye(V.depo2.id, V.kart.id), 20_000);
    assert.equal(tek('SELECT durum FROM stok_transferi WHERE id = ?', t.id).durum, 'tamamlandi');
  });

  test('aynı depoya transfer açılamaz', async () => {
    const c = await yonetici();
    const y = await c.csrfIle('/stok/transferler',
      { kaynakDepoId: V.depo1.id, hedefDepoId: V.depo1.id, kartId: V.kart.id, miktar: '1' });
    assert.equal(y.durum, 422);
  });
});

describe('STK-09 — kör sayım ve fark onayı', () => {
  test('defter bakiyesi satır girildiği anda dondurulur; fark hesaplanır', async () => {
    const c = await yonetici();
    await c.csrfIle('/stok/sayim', { _eylem: 'ac', depoId: V.depo1.id });
    V.sayim = tek('SELECT * FROM stok_sayimi');
    assert.equal(V.sayim.durum, 'sayiliyor');

    const oncekiBakiye = defter.bakiye(V.depo1.id, V.kart.id);
    await c.csrfIle('/stok/sayim',
      { _eylem: 'satir', sayimId: V.sayim.id, kartId: V.kart.id, sayilan: '65' });
    const satir = tek('SELECT * FROM stok_sayim_satiri WHERE sayim_id = ?', V.sayim.id);
    assert.equal(satir.defter_binde, oncekiBakiye);
    assert.equal(satir.sayilan_binde, 65_000);
    assert.equal(satir.fark_binde, 65_000 - oncekiBakiye);
  });

  test('aynı kart iki kez sayılamaz; gerekçesiz fark onaya gitmez', async () => {
    const c = await yonetici();
    const ikinci = await c.csrfIle('/stok/sayim',
      { _eylem: 'satir', sayimId: V.sayim.id, kartId: V.kart.id, sayilan: '70' });
    assert.equal(ikinci.durum, 409);

    const gerekcesiz = await c.csrfIle('/stok/sayim', { _eylem: 'onaya_gonder', sayimId: V.sayim.id });
    assert.equal(gerekcesiz.durum, 409, 'gerekçesiz fark onaya gönderildi');
  });

  test('fark deftere ancak ONAY sonrası düzeltme hareketiyle yazılır', async () => {
    const c = await yonetici();
    const satir = tek('SELECT * FROM stok_sayim_satiri WHERE sayim_id = ?', V.sayim.id);
    calistir('UPDATE stok_sayim_satiri SET gerekce = ? WHERE id = ?', 'Fire ve döküntü', satir.id);

    const oncekiHareket = sorgu('SELECT id FROM stok_hareketi').length;
    const gonder = await c.csrfIle('/stok/sayim', { _eylem: 'onaya_gonder', sayimId: V.sayim.id });
    assert.equal(gonder.durum, 200);
    assert.equal(tek('SELECT durum FROM stok_sayimi WHERE id = ?', V.sayim.id).durum, 'onaya_gonderildi');
    assert.equal(sorgu('SELECT id FROM stok_hareketi').length, oncekiHareket,
      'onay öncesi fark deftere yazıldı');

    const talep = tek(`SELECT * FROM onay_talebi WHERE nesne = 'stok_sayimi' AND nesne_id = ?`, V.sayim.id);
    assert.ok(talep);
    for (const eposta of ['depo@yapitas.demo', 'finans@yapitas.demo']) {
      if (tek('SELECT durum FROM stok_sayimi WHERE id = ?', V.sayim.id).durum === 'onaylandi') break;
      const k = await olarak(eposta);
      await k.csrfIle(`/onaylar/${talep.id}`, { karar: 'onayla', belgeSurum: String(talep.belge_surum) });
    }
    assert.equal(tek('SELECT durum FROM stok_sayimi WHERE id = ?', V.sayim.id).durum, 'onaylandi');
    assert.equal(defter.bakiye(V.depo1.id, V.kart.id), 65_000, 'sayım farkı deftere yansımadı');
    const fark = tek(`SELECT * FROM stok_hareketi WHERE kaynak_nesne = 'stok_sayimi'`);
    assert.ok(fark, 'sayım düzeltme hareketi yazılmadı');
  });
});

describe('Satın alma ve stok ekranları ortak kalıba ve yetkiye uyar', () => {
  const YOLLAR = ['/tedarikciler', '/satinalma/talepler', '/satinalma/talepler/yeni', '/satinalma/rfq',
    '/satinalma/siparisler', '/satinalma/siparisler/yeni', '/depolar', '/stok-kartlari',
    '/mal-kabul', '/mal-kabul/yeni', '/stok/rezervasyonlar', '/stok/transferler',
    '/stok/sarf', '/stok/sayim', '/stok/hareketler'];

  test('hepsi 200 döner ve page-head kalıbını taşır', async () => {
    const c = await yonetici();
    for (const yol of YOLLAR) {
      const r = await c.get(yol);
      assert.equal(r.durum, 200, `${yol} açılmadı`);
      assert.match(r.govde, /class="gv-page-head"/, `${yol} page-head taşımıyor`);
    }
  });

  test('yazma formlarında durum veya onaycı alanı yok (kural 5)', async () => {
    const c = await yonetici();
    for (const yol of YOLLAR) {
      const r = await c.get(yol);
      for (const f of r.govde.match(/<form method="post"[\s\S]*?<\/form>/g) || []) {
        assert.ok(!/name="durum"/.test(f), `${yol} yazma formunda durum alanı var`);
        assert.ok(!/name="onayci/i.test(f), `${yol} yazma formunda onaycı alanı var`);
      }
    }
  });

  test('liste ekranları sayfalama standardını taşır (§3.5)', async () => {
    const c = await yonetici();
    for (const yol of ['/tedarikciler', '/satinalma/talepler', '/satinalma/rfq', '/satinalma/siparisler',
      '/depolar', '/stok-kartlari', '/mal-kabul', '/stok/rezervasyonlar', '/stok/transferler']) {
      const r = await c.get(yol);
      assert.match(r.govde, /class="gv-pager"/, `${yol} sayfalayıcı yok`);
      assert.match(r.govde, /Veri tarihi/, `${yol} veri tarihi künyesi yok`);
    }
  });

  test('yetkisiz rol satın alma ve stok ekranlarına erişemez', async () => {
    const c = await olarak('ik@yapitas.demo');   // bolumler: calisma, personel, dokuman
    for (const yol of ['/tedarikciler', '/satinalma/talepler', '/depolar', '/stok/hareketler']) {
      const r = await c.get(yol);
      assert.equal(r.durum, 403, `${yol} yetkisiz role açıldı`);
    }
  });
});
