/* ============================================================================
   DENETİM-02 / D-16 — finans hareketinde ileri tarih (KARARLAR.md K-125)
   ----------------------------------------------------------------------------
   Kasa ve banka GERÇEKLEŞMİŞ para hareketidir. İleri tarihli bir satır henüz
   olmamış bir ödemeyi defterde olmuş gibi gösterir ve bugün kapatılan dönemin
   DIŞINDA kalarak dönem kilidinden de kaçar (denetim-02 §9.4). Planlanan çıkış
   FIN-12 Ödeme planı'nın işidir.

   Ret SESSİZ DEĞİLDİR: 422 + alan hatası + kullanıcıyı FIN-12'ye götüren
   gerçek bağlantı (K-125 "reddin çıkışı").

   Cari defteri HARİÇTİR: vadesi ileri tarihli olabilir — vade hareketin
   kendisi değil, ödeneceği gündür.
   ========================================================================== */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { uygulamaBaslat } from '../yardimci.mjs';
import { tek, sorgu, islem } from '../../app/cekirdek/db.mjs';
import { gunAnahtari, gunBaslangici, simdi, GUN_MS } from '../../app/cekirdek/zaman.mjs';
import * as fdefter from '../../app/moduller/finans/defter.mjs';
import { manifest } from '../../app/cekirdek/yapilandirma.mjs';

let S; let kasa; let hesap; let cari;
const bugun = () => gunAnahtari(simdi());
const gunSonra = (n) => gunAnahtari(simdi() + n * GUN_MS);

before(async () => {
  S = await uygulamaBaslat();
  const c = await finans();
  await c.csrfIle('/kasalar', { ad: 'D16 kasası', paraBirimi: 'TRY' });
  kasa = tek(`SELECT * FROM kasa WHERE ad = 'D16 kasası'`);
  await c.csrfIle('/banka-hesaplari',
    { ad: 'D16 hesabı', banka: 'Test Bankası', iban: 'TR000000000000000000000016' });
  hesap = tek(`SELECT * FROM banka_hesabi WHERE ad = 'D16 hesabı'`);
  await c.csrfIle('/cariler', { unvan: 'D16 Tedarik A.Ş.', tur: 'tedarikci' });
  cari = tek(`SELECT * FROM cari WHERE unvan = 'D16 Tedarik A.Ş.'`);
});
after(async () => { await S.kapat(); });

const finans = async () => { const c = S.istemci(); await c.giris('finans@yapitas.demo'); return c; };
const kasaSatiri = () => sorgu('SELECT id FROM kasa_hareketi WHERE kasa_id = ?', kasa.id).length;
const bankaSatiri = () => sorgu('SELECT id FROM banka_hareketi WHERE hesap_id = ?', hesap.id).length;

describe('D-16 — kasa ve banka hareketi ileri tarihli olamaz', () => {
  test('bugün ve geçmiş kabul edilir', async () => {
    const c = await finans();
    for (const t of [bugun(), gunSonra(-1), gunSonra(-400)]) {
      const once = kasaSatiri();
      const y = await c.csrfIle('/kasa-hareketleri',
        { kasaId: kasa.id, tur: 'tahsilat', tutar: '100,00', aciklama: `gecmis ${t}`, tarih: t });
      assert.equal(y.durum, 200, `${t} reddedildi`);
      assert.equal(kasaSatiri(), once + 1, `${t} için satır yazılmadı`);
    }
  });

  test('ileri tarihli kasa hareketi 422 ile REDDEDİLİR, satır yazılmaz', async () => {
    const c = await finans();
    for (const t of [gunSonra(1), gunSonra(30), '2099-12-31']) {
      const once = kasaSatiri();
      const y = await c.csrfIle('/kasa-hareketleri',
        { kasaId: kasa.id, tur: 'odeme', tutar: '10,00', aciklama: `ileri ${t}`, tarih: t });
      assert.equal(y.durum, 422, `${t} kabul edildi`);
      assert.equal(kasaSatiri(), once, `${t} için deftere satır yazıldı`);
    }
  });

  test('ileri tarihli banka hareketi de reddedilir', async () => {
    const c = await finans();
    const once = bankaSatiri();
    const y = await c.csrfIle('/banka-hareketleri',
      { hesapId: hesap.id, tur: 'gelen', tutar: '10,00', aciklama: 'ileri', tarih: gunSonra(3) });
    assert.equal(y.durum, 422);
    assert.equal(bankaSatiri(), once, 'ileri tarihli banka hareketi yazıldı');
  });

  test('ret SESSİZ değil: kullanıcı FIN-12 Ödeme planı ekranına yönlendirilir', async () => {
    const c = await finans();
    const y = await c.csrfIle('/kasa-hareketleri',
      { kasaId: kasa.id, tur: 'odeme', tutar: '10,00', aciklama: 'yön', tarih: gunSonra(7) });
    assert.equal(y.durum, 422);
    const fin12 = manifest().ekranlar.find((x) => x.kod === 'FIN-12');
    assert.ok(y.govde.includes('gv-err-cikis'), 'ret kutusunda çıkış bağlantısı yok');
    assert.ok(y.govde.includes(`href="${fin12.rota}"`),
      `FIN-12 rotasına (${fin12.rota}) bağlantı verilmedi`);
    assert.match(y.govde, /Ödeme planı/, 'kullanıcıya nereye gideceği söylenmiyor');
  });

  test('defter kapısı doğrudan çağrıda da zorlar; CARİ defteri hariçtir', () => {
    const ctx = { tenant: tek('SELECT * FROM tenant LIMIT 1'),
      kullanici: tek(`SELECT * FROM kullanici WHERE eposta = 'finans@yapitas.demo'`),
      istekId: 'd16', ip: '127.0.0.1' };
    const ileri = simdi() + 10 * GUN_MS;
    assert.throws(() => islem(() => fdefter.hareketYaz(ctx, 'kasa',
      { sahipId: kasa.id, tur: 'tahsilat', tutarMinor: 1000n, zaman: ileri })),
    (e) => e.durum === 422, 'kasa kapısı ileri tarihi geçirdi');
    assert.throws(() => islem(() => fdefter.hareketYaz(ctx, 'banka',
      { sahipId: hesap.id, tur: 'gelen', tutarMinor: 1000n, zaman: ileri })),
    (e) => e.durum === 422, 'banka kapısı ileri tarihi geçirdi');
    /* Cari: vade ileri olabilir, hareketin kendisi bugün yazılır. */
    assert.doesNotThrow(() => islem(() => fdefter.hareketYaz(ctx, 'cari',
      { sahipId: cari.id, tur: 'fatura', tutarMinor: 1000n, vade: ileri })),
    'cari defteri gereksiz yere kısıtlandı');
  });

  test('bugünün SON ANI hâlâ bugündür — ölçüt saat değil GÜN', () => {
    const ctx = { tenant: tek('SELECT * FROM tenant LIMIT 1'),
      kullanici: tek(`SELECT * FROM kullanici WHERE eposta = 'finans@yapitas.demo'`),
      istekId: 'd16', ip: '127.0.0.1' };
    /* Kullanıcı saat diliminde bugünün 23:59:59.999'u reddedilmemeli; ölçüt
       "şu an"dan büyük olmak değil, BUGÜNDEN sonraki bir güne düşmektir. */
    const bugunSonAn = gunBaslangici(bugun()) + GUN_MS - 1;
    assert.ok(bugunSonAn > simdi(), 'test kurgusu: son an şu andan ileride olmalı');
    assert.doesNotThrow(() => islem(() => fdefter.hareketYaz(ctx, 'kasa',
      { sahipId: kasa.id, tur: 'tahsilat', tutarMinor: 500n, zaman: bugunSonAn })),
    'bugünün son anı ileri tarih sayıldı');
    /* Yarının ilk anı ise reddedilir. */
    assert.throws(() => islem(() => fdefter.hareketYaz(ctx, 'kasa',
      { sahipId: kasa.id, tur: 'tahsilat', tutarMinor: 500n, zaman: bugunSonAn + 1 })),
    (e) => e.durum === 422, 'yarının ilk anı kabul edildi');
  });
});
