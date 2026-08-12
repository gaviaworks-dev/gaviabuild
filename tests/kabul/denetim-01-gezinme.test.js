/* ============================================================================
   KABUL TESTİ — denetim-01 / gezinme bütünlüğü
   ----------------------------------------------------------------------------
   Bu dosya `raporlar/denetim-01.md` bulgularının regresyon kilididir:

   D-01  Ekran ailesinin tamamı gezinerek erişilebilir olmalı. Manifestte var
         olup hiçbir sayfadan bağlantısı bulunmayan ekran = §12'nin "WIP
         bağlantısı" yasağının sessiz biçimi.
   D-02  Uygulama içi hiçbir bağlantı 4xx/5xx dönmemeli (§12: "P0 rotada 404").
   ========================================================================== */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { uygulamaBaslat } from '../yardimci.mjs';
import { manifest } from '../../app/cekirdek/yapilandirma.mjs';
import { menuOgesiMi } from '../../app/web/kabuk.mjs';

/** Sayfadaki iç bağlantılar (çıktı bağlantıları ve çıkış hariç). */
const icBaglantilar = (govde) => [...new Set([...govde.matchAll(/href="([^"]+)"/g)].map((m) => m[1]))]
  .map((u) => u.split('#')[0])
  .filter((u) => u.startsWith('/') && !u.startsWith('//'))
  .filter((u) => !/^\/(cikis|statik)/.test(u) && !/cikti=(pdf|xlsx|csv)/.test(u));

/** Kökten başlayarak erişilebilen her yolu gezer. */
async function gez(istemci) {
  const gorulen = new Map();
  const kuyruk = [['/', 'KÖK']];
  while (kuyruk.length) {
    const [yol, nereden] = kuyruk.shift();
    const anahtar = yol.split('?')[0];
    if (gorulen.has(anahtar)) continue;
    const y = await istemci.get(yol, { izle: false });
    gorulen.set(anahtar, { durum: y.durum, nereden });
    const konum = y.basliklar.get('location');
    if ([301, 302, 303, 307, 308].includes(y.durum) && konum?.startsWith('/')) {
      kuyruk.push([konum, yol]);
      continue;
    }
    if (y.durum !== 200) continue;
    for (const b of icBaglantilar(y.govde)) {
      if (!gorulen.has(b.split('?')[0])) kuyruk.push([b, yol]);
    }
  }
  return gorulen;
}

describe('denetim-01 — ekran erişilebilirliği', () => {
  let S; let gorulen;
  before(async () => {
    S = await uygulamaBaslat();
    const c = S.istemci();
    await c.giris('sahip@yapitas.demo');
    gorulen = await gez(c);
  });
  after(async () => S.kapat());

  /* D-01: `menuOgesiMi` bir zamanlar rota ön ekine bakarak gizlediği için
     Kartlar modülünün 9 ekranı, ITP, puantaj dönem kapanışı ve toplu görev
     sihirbazı hiçbir yerden açılamıyordu. */
  test('manifestteki her statik ekrana gezinerek ulaşılır (yetim ekran yok)', () => {
    const yollar = new Set([...gorulen.keys()]);
    const yetim = manifest().ekranlar
      /* `acik` ekranlar (giriş, 403/404, bakım, portal) oturum içinden
         bağlanmaz; AUTH-06 yalnız kurulumu bitmemiş kullanıcıda çıkar. */
      .filter((e) => !e.dinamik && !e.takmaAdi && !e.acik && e.kod !== 'AUTH-06')
      .filter((e) => !yollar.has(e.rota));
    assert.deepEqual(yetim.map((e) => `${e.kod} ${e.rota}`), [],
      'bu ekranlar manifestte var ama hiçbir sayfadan bağlantısı yok');
  });

  /* D-02: `/mobil` ekranındaki "Günlük rapor" düğmesi var olmayan
     `/gunluk-raporlar` rotasına gidiyordu. */
  test('hiçbir iç bağlantı 4xx/5xx dönmez', () => {
    const kirik = [...gorulen]
      .filter(([, v]) => v.durum >= 400)
      .map(([yol, v]) => `${v.durum} ${yol}  ←  ${v.nereden}`);
    assert.deepEqual(kirik, [], 'ölü bağlantı bulundu');
  });
});

describe('denetim-01 — menü kuralı', () => {
  const tum = manifest().ekranlar;
  const ekran = (kod) => tum.find((e) => e.kod === kod);

  /* İç içe rota TEK BAŞINA gizleme gerekçesi değildir: yalnız kayıt AÇMA
     yüzeyleri (form/sihirbaz) ebeveynine bırakılır. */
  test('iç içe rotalı liste/rapor/onay ekranları menüde kalır', () => {
    for (const kod of ['CRD-13', 'CRD-14', 'CRD-16', 'CRD-10', 'QLT-02', 'HR-09', 'RPT-05', 'AST-09']) {
      assert.equal(menuOgesiMi(ekran(kod), tum), true, `${kod} menüden düşüyor — erişilemez hale gelir`);
    }
  });

  test('kayıt açma yüzeyleri (form/sihirbaz) menüde görünmez, ebeveyni bağlar', () => {
    for (const kod of ['PRJ-02', 'SITE-02', 'CRD-03', 'CRD-11', 'QLT-03', 'TASK-05']) {
      assert.equal(menuOgesiMi(ekran(kod), tum), false, `${kod} menüde tekrar ediyor`);
    }
  });
});
