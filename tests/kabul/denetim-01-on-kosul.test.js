/* ============================================================================
   KABUL TESTİ — denetim-01 / D-07 ön koşulu eksik formlar
   ----------------------------------------------------------------------------
   Boş bir kurulumda zorunlu bir seçicide HİÇ seçenek yoksa kullanıcı formu
   dolduramaz ve neyin eksik olduğunu formdan anlayamaz: gönderir, 422 alır,
   nereye gideceğini bilmez. §3'ün boş durum sözleşmesi bunu kapsar.

   Bu dosya, boş kurulumdaki HER zorunlu-ama-seçeneksiz alanın ön koşulu
   söylediğini ve — mümkünse — ön koşul ekranına bağlandığını kilitler.
   ========================================================================== */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { uygulamaBaslat } from '../yardimci.mjs';
import { manifest } from '../../app/cekirdek/yapilandirma.mjs';
import { alan } from '../../app/web/bilesenler.mjs';

let S; let c;

/** Sayfadaki POST formlarının zorunlu ama seçeneksiz `select` alanları. */
function bosZorunluSeciciler(govde) {
  const bulunan = [];
  for (const f of govde.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)) {
    if (!/method="post"/i.test(f[1]) || /\/cikis/.test(f[1])) continue;
    for (const sel of f[2].matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
      if (!/\brequired\b/.test(sel[1])) continue;
      const ad = /name="([^"]+)"/.exec(sel[1])?.[1];
      const gercekSecenek = [...sel[2].matchAll(/<option value="([^"]*)"/g)]
        .some((o) => o[1] !== '');
      if (ad && !gercekSecenek) bulunan.push(ad);
    }
  }
  return bulunan;
}

before(async () => {
  S = await uygulamaBaslat();
  c = S.istemci();
  await c.giris('sahip@yapitas.demo');
});
after(async () => S.kapat());

describe('D-07 — boş kurulumda hiçbir form çıkışsız kalmaz', () => {
  test('zorunlu-ama-seçeneksiz her alan ön koşulu söyler ve bağlar', async () => {
    const formEkranlari = manifest().ekranlar.filter((e) => !e.dinamik && !e.takmaAdi
      && ['form', 'listeForm', 'sihirbaz'].includes(e.kalip));
    const eksik = [];
    let kapsanan = 0;

    for (const e of formEkranlari) {
      const y = await c.get(e.rota, { izle: false });
      if (y.durum !== 200) continue;
      for (const ad of bosZorunluSeciciler(y.govde)) {
        const ipucuVar = new RegExp(`data-onkosul="${ad}"`).test(y.govde);
        if (!ipucuVar) { eksik.push(`${e.kod} ${e.rota} · ${ad} — ön koşul metni yok`); continue; }
        kapsanan++;
      }
    }
    /* Boş kurulumda gerçekten çıkışsız form OLMALI; yoksa tarama şüphelidir. */
    assert.ok(kapsanan >= 20, `yalnız ${kapsanan} boş zorunlu seçici bulundu — tarama şüpheli`);
    assert.deepEqual(eksik, [], 'bu formlar boş kurulumda çıkışsız');
  });

  test('ön koşul metni kullanıcıyı kayıt açacağı ekrana yollar', async () => {
    const y = await c.get('/santiyeler/yeni', { izle: false });
    assert.equal(y.durum, 200);
    assert.match(y.govde, /data-onkosul="projeId"/);
    assert.match(y.govde, /Seçilebilecek kayıt yok\. Önce <a href="\/projeler\/yeni">/,
      'proje açma ekranına bağlantı yok');
  });

  test('kart formu sağlayıcı hesabı ekranına yollar (CRD-09)', async () => {
    const y = await c.get('/kartlar/yeni', { izle: false });
    assert.match(y.govde, /data-onkosul="hesapId"/);
    assert.match(y.govde, /Önce <a href="\/kartlar\/saglayicilar">/);
  });
});

describe('D-07 — ipucu yalnız gerçekten boşken çıkar', () => {
  test('seçeneği olan zorunlu alan ön koşul metni göstermez', () => {
    const dolu = String(alan({ ad: 'projeId', etiket: 'Proje', zorunlu: true,
      secenekler: [{ deger: '', etiket: 'Seçin…' }, { deger: 'prj_1', etiket: 'P1' }] }));
    assert.ok(!dolu.includes('gf-onkosul'), 'dolu seçicide ön koşul uyarısı çıkıyor');
  });

  test('zorunlu olmayan boş seçicide ön koşul metni çıkmaz', () => {
    const istege = String(alan({ ad: 'projeId', etiket: 'Proje', zorunlu: false,
      secenekler: [{ deger: '', etiket: 'Tümü' }] }));
    assert.ok(!istege.includes('gf-onkosul'), 'isteğe bağlı alanda ön koşul uyarısı çıkıyor');
  });

  /* Denetim sırasında yakalandı: `aktiviteId` önce PLAN-04'e (dinamik rota)
     eşlenmişti ve `/is-programlari/:id/wbs` bağlantısı 404 veriyordu. */
  test('ön koşul hedefi DİNAMİK rota olamaz — 404 bağlantı üretilmez', () => {
    const dinamikRotalar = manifest().ekranlar.filter((e) => e.dinamik || e.rota.includes('/:'));
    for (const alanAdi of ['aktiviteId', 'projeId', 'depoId', 'hesapId', 'sozlesmeId', 'varlikId']) {
      const metin = String(alan({ ad: alanAdi, etiket: 'X', zorunlu: true,
        secenekler: [{ deger: '', etiket: 'Seçin…' }] }));
      const hedef = /href="([^"]+)"/.exec(metin)?.[1];
      if (!hedef) continue;                       // yönlendirmesiz dürüst metin — kabul
      assert.ok(!hedef.includes('/:'), `${alanAdi} ön koşulu desen rotaya bağlanıyor: ${hedef}`);
      assert.ok(!dinamikRotalar.some((e) => e.rota === hedef),
        `${alanAdi} ön koşulu dinamik ekrana bağlanıyor: ${hedef}`);
    }
  });
});
