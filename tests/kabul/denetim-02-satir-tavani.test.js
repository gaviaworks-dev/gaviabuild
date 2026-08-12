/* ============================================================================
   DENETİM-02 / D-14 — rapor ve liste satır tavanı (KARARLAR.md K-126)
   ----------------------------------------------------------------------------
   Rapor tanımlarında satır tavanı yoktu: 10 bin satırda ekran 7,5 MB HTML
   üretiyor, RSS 208 → 546 MB'a çıkıyordu (denetim-02 §8.2).

   Tavan: ekran 5.000 · dosya çıktıları 20.000.

   Tavan aşılınca SESSİZCE KIRPILMAZ. Kırpılmış rapor, doğru görünen ama yanlış
   toplam taşıyan rapordur ve §12'nin "PDF/Excel çıktısı ekran filtresi veya
   toplamlarıyla uyuşmuyor" maddesine düşer. Bunun yerine D-05'in AÇIK RET
   kalıbı: kaç satır olduğu söylenir, filtre daraltması istenir, 422 döner.

   Ekran görünümünde ret sayfayı KAPATMAZ: künye, KPI ve filtre çubuğu ayakta
   kalır ki kullanıcı daraltmayı yerinde yapabilsin (K-125).
   ========================================================================== */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { uygulamaBaslat } from '../yardimci.mjs';
import { tek, sorgu, calistir, islem } from '../../app/cekirdek/db.mjs';
import { yapilandirma } from '../../app/cekirdek/yapilandirma.mjs';
import { satirTavaniZorunlu, ekranTavani, dosyaTavani } from '../../app/web/rapor-duzeni.mjs';

let S; let tenant; let kullanici;
before(async () => {
  S = await uygulamaBaslat();
  tenant = tek('SELECT * FROM tenant LIMIT 1');
  kullanici = tek(`SELECT id FROM kullanici WHERE eposta = 'sahip@yapitas.demo'`);
});
after(async () => { await S.kapat(); });

const sahip = async () => { const c = S.istemci(); await c.giris('sahip@yapitas.demo'); return c; };

/** N personel yazar (tavanı aşmak için; gerçek forma gerek yok). */
function personelUret(n, onek) {
  islem(() => {
    for (let i = 0; i < n; i++) {
      calistir(`INSERT INTO personel (id, tenant_id, kod, ad_soyad, gorev, durum,
                  ise_giris, surum, olusturan, olusturuldu) VALUES (?,?,?,?,?,?,?,1,?,?)`,
      `per_${onek}_${i}`, tenant.id, `${onek}-${String(i).padStart(6, '0')}`,
      `Personel ${i}`, 'usta', 'aktif', Date.UTC(2026, 0, 1), kullanici.id, Date.now());
    }
  });
}
const personelSil = (onek) => calistir(`DELETE FROM personel WHERE kod LIKE '${onek}-%'`);

describe('D-14 — satır tavanı sessizce kırpmaz, açıkça reddeder', () => {
  test('tavanlar yapılandırmadan gelir: ekran 5.000, dosya 20.000', () => {
    assert.equal(ekranTavani(), 5000);
    assert.equal(dosyaTavani(), 20000);
    assert.equal(yapilandirma.ekranSatirTavani, 5000);
    assert.equal(yapilandirma.dosyaSatirTavani, 20000);
  });

  test('tavan altındaki sonuç geçer, tavandaki sonuç da geçer (sınır dahil)', () => {
    assert.doesNotThrow(() => satirTavaniZorunlu(4999, { nerede: 'x', tavan: 5000 }));
    assert.doesNotThrow(() => satirTavaniZorunlu(5000, { nerede: 'x', tavan: 5000 }));
    assert.throws(() => satirTavaniZorunlu(5001, { nerede: 'x', tavan: 5000 }),
      (e) => e.durum === 422, 'tavanın bir üstü geçti');
  });

  test('ret metni SAYIYI söyler ve filtre daraltmasını ister', () => {
    try {
      satirTavaniZorunlu(12345, { nerede: 'ekran görünümü', tavan: 5000 });
      assert.fail('tavan aşımı reddedilmedi');
    } catch (e) {
      assert.equal(e.durum, 422);
      assert.match(e.mesaj, /12\.345/, 'kaç kayıt olduğu söylenmiyor');
      assert.match(e.mesaj, /5\.000/, 'tavan söylenmiyor');
      assert.match(e.mesaj, /KIRPILMADI/, 'kırpılmadığı açıkça söylenmiyor');
      assert.match(e.mesaj, /daralt/i, 'filtre daraltması önerilmiyor');
    }
  });

  test('EKRAN: tavan aşılınca 422 + açık ret, ama filtre çubuğu ve künye AYAKTA', async () => {
    personelUret(ekranTavani() + 10, 'DTV');
    const c = await sahip();
    const y = await c.get('/raporlar/personel');
    assert.equal(y.durum, 422, 'tavan aşımı ekranda kabul edildi');
    assert.match(y.govde, /KIRPILMADI/, 'sessiz kırpma');
    assert.match(y.govde, /5\.010|5\.0\d\d/, 'kayıt sayısı yazılmıyor');
    /* Kullanıcı daraltmayı YERİNDE yapabilmeli. */
    assert.match(y.govde, /rpt-arac/, 'filtre çubuğu kayboldu — kullanıcı daraltamaz');
    assert.match(y.govde, /rpt-kunye/, 'künye kayboldu');
    /* 7,5 MB'lık tablo çizilmedi. */
    assert.ok(y.govde.length < 200_000, `ret sayfası ${y.govde.length} bayt — tablo yine çizildi`);
  });

  test('DOSYA: ekran tavanı ile dosya tavanı arasında çıktı ÜRETİLİR', async () => {
    const c = await sahip();
    for (const [bicim, imza] of [['pdf', /^%PDF/], ['xlsx', /^PK/], ['csv', /^\ufeff?#\s*Rapor/]]) {
      const y = await c.get(`/raporlar/personel?cikti=${bicim}`);
      assert.equal(y.durum, 200, `${bicim} tavan altında reddedildi`);
      assert.match(y.govde.slice(0, 20), imza, `${bicim} imzası tutmuyor`);
    }
  });

  test('DOSYA: dosya tavanı aşılınca çıktı da açıkça reddedilir', async () => {
    personelUret(dosyaTavani() - ekranTavani(), 'DTW');
    const toplam = sorgu('SELECT id FROM personel').length;
    assert.ok(toplam > dosyaTavani(), `kurgu: ${toplam} satır tavanı aşmalı`);
    const c = await sahip();
    for (const bicim of ['pdf', 'xlsx', 'csv']) {
      const y = await c.get(`/raporlar/personel?cikti=${bicim}`);
      assert.equal(y.durum, 422, `${bicim} tavan üstünde üretildi`);
      assert.match(y.govde, /KIRPILMADI/, `${bicim} sessizce kırpıldı`);
    }
    personelSil('DTV'); personelSil('DTW');
  });

  test('tavan altında rapor normal çalışır (regresyon değil)', async () => {
    const c = await sahip();
    const ekran = await c.get('/raporlar/personel');
    assert.equal(ekran.durum, 200);
    assert.ok(!/KIRPILMADI/.test(ekran.govde), 'tavan altında ret üretildi');
    const xlsx = await c.get('/raporlar/personel?cikti=xlsx');
    assert.equal(xlsx.durum, 200);
    assert.ok(xlsx.govde.startsWith('PK'));
  });

  test('LİSTE: sayfa boyutu ekran tavanını yapısal olarak aşamaz', async () => {
    const c = await sahip();
    const y = await c.get('/personel?boyut=100');
    assert.equal(y.durum, 200);
    /* Beyaz liste büyütülse bile listeSorgusu ekran tavanıyla sınırlıdır. */
    assert.ok(yapilandirma.sayfaBoyutlari.every((b) => b <= ekranTavani()),
      'sayfa boyutu beyaz listesi ekran tavanını aşıyor');
  });
});
