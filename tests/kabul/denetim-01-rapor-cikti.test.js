/* ============================================================================
   KABUL TESTİ — denetim-01 / D-05 rapor çıktısı sessizce yutulmaz
   ----------------------------------------------------------------------------
   Değişmez kural 9: "Tüm raporlar tek `ReportLayout`: … PDF/Excel/CSV."

   `?cikti=pdf` isteyip HTML almak, isteğin karşılanmadığı hâlde 200 dönmesidir;
   kullanıcı çıktının üretildiğini sanır. Bu dosya manifestteki HER `rapor`
   kalıplı ekranı tarar ve ikisinden birini şart koşar:

     a) ReportLayout'a bağlıdır → gerçek PDF/XLSX/CSV üretir, bilinmeyen
        biçimi 4xx ile reddeder, ekran = çıktı künyesi tutar
     b) Bağlı değildir → `?cikti=` parametresini AÇIKÇA reddeder (4xx)

   Sessiz yutma (200 + HTML) ikisinde de kabul edilmez.
   ========================================================================== */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { uygulamaBaslat } from '../yardimci.mjs';
import { manifest } from '../../app/cekirdek/yapilandirma.mjs';
import { RAPORLAR } from '../../app/moduller/rapor/tanimlar.mjs';

let S; let c; let taban;

/** Ham getirme — ikili gövdeyi bozmadan okur. */
async function ham(yol) {
  const cerez = [...c.cerezler].map(([k, v]) => `${k}=${v}`).join('; ');
  const y = await fetch(taban + yol, { headers: { cookie: cerez } });
  const gövde = Buffer.from(await y.arrayBuffer());
  return { durum: y.status, gövde, imza: gövde.subarray(0, 4).toString('latin1') };
}

before(async () => {
  S = await uygulamaBaslat();
  taban = S.taban;
  c = S.istemci();
  await c.giris('sahip@yapitas.demo');
});
after(async () => S.kapat());

describe('D-05 — ReportLayout raporları dört çıktıyı da üretir', () => {
  /* Denetimde yakalanan üçü listede olmalı; yoksa tanım geri alınmış demektir. */
  test('PLAN-11, HSE-12 ve RPT-15 birer rapor tanımıdır', () => {
    const kodlar = RAPORLAR.map((r) => r.kod);
    for (const k of ['PLAN-11', 'HSE-12', 'RPT-15']) {
      assert.ok(kodlar.includes(k), `${k} ReportLayout'a bağlı değil — çıktı üretemez`);
    }
  });

  test('her rapor tanımı gerçek PDF, XLSX ve CSV üretir', async () => {
    for (const r of RAPORLAR) {
      const ekran = await ham(r.rota);
      assert.equal(ekran.durum, 200, `${r.kod} ekranı açılmıyor`);

      const pdf = await ham(`${r.rota}?cikti=pdf`);
      assert.equal(pdf.durum, 200, `${r.kod} PDF vermiyor`);
      assert.equal(pdf.imza, '%PDF', `${r.kod} PDF yerine HTML dönüyor — sessiz yutma`);

      const xlsx = await ham(`${r.rota}?cikti=xlsx`);
      assert.equal(xlsx.durum, 200, `${r.kod} Excel vermiyor`);
      assert.equal(xlsx.imza, 'PK', `${r.kod} Excel yerine HTML dönüyor — sessiz yutma`);

      const csv = await ham(`${r.rota}?cikti=csv`);
      assert.equal(csv.durum, 200, `${r.kod} CSV vermiyor`);
      assert.ok(csv.gövde.toString('utf8').startsWith('﻿'), `${r.kod} CSV BOM taşımıyor`);
    }
  });

  test('bilinmeyen çıktı biçimi sessizce yutulmaz, reddedilir', async () => {
    for (const r of RAPORLAR) {
      const y = await ham(`${r.rota}?cikti=docx`);
      assert.ok(y.durum >= 400 && y.durum < 500,
        `${r.kod} bilinmeyen biçimi ${y.durum} ile yutuyor — kural 9 ihlali`);
    }
  });

  test('ekran ile çıktı aynı künyeyi taşır (ekran = PDF = Excel)', async () => {
    for (const r of RAPORLAR) {
      const ekran = (await ham(r.rota)).gövde.toString('utf8');
      const csv = (await ham(`${r.rota}?cikti=csv`)).gövde.toString('utf8');
      /* Kayıt sayısı künyenin parçasıdır; iki çıktıda da AYNI olmalı. */
      const ekranSayi = /<dt>Kayıt sayısı<\/dt><dd>([\d.]+)<\/dd>/.exec(ekran)?.[1];
      const csvSayi = /# Kayıt sayısı[;,"]*([\d.]+)/.exec(csv)?.[1];
      assert.ok(ekranSayi != null, `${r.kod} ekran künyesinde kayıt sayısı yok`);
      assert.equal(csvSayi, ekranSayi, `${r.kod} ekran ve CSV kayıt sayısı ayrışıyor`);
      assert.match(csv, /# Rapor sürümü/, `${r.kod} CSV künyesinde rapor sürümü yok`);
    }
  });
});

describe('D-05 — ReportLayout dışındaki rapor ekranları çıktıyı REDDEDER', () => {
  /* Manifestteki her `rapor` kalıplı ekran taranır: ya tanımı vardır ya da
     `?cikti=` parametresini açıkça reddeder. Yeni bir rapor ekranı sessiz
     yutmayla eklenirse bu test kırılır. */
  const raporEkranlari = manifest().ekranlar
    .filter((e) => e.kalip === 'rapor' && !e.dinamik && !e.takmaAdi);

  test('manifestteki her rapor ekranı ya çıktı üretir ya açıkça reddeder', async () => {
    const tanimliRotalar = new Set(RAPORLAR.map((r) => r.rota));
    const sessizYutan = [];
    for (const e of raporEkranlari) {
      if (tanimliRotalar.has(e.rota)) continue;      // (a) — üstteki testler kapsar
      const y = await ham(`${e.rota}?cikti=pdf`);
      /* (b) — açık ret bekleniyor; 200 + HTML sessiz yutmadır. */
      if (y.durum === 200 && y.imza === '<!DO') sessizYutan.push(`${e.kod} ${e.rota}`);
    }
    assert.deepEqual(sessizYutan, [],
      'bu ekranlar ?cikti= parametresini sessizce yutuyor (kural 9)');
  });

  test('reddedilen çıktı kullanıcıya nedenini ve alternatifini söyler', async () => {
    const y = await ham('/stok/hareketler?cikti=pdf');
    assert.equal(y.durum, 422);
    const govde = y.gövde.toString('utf8');
    assert.match(govde, /dosya çıktısı üretmez/, 'ret gerekçesi yazılmıyor');
    assert.match(govde, /RPT-08/, 'kullanıcı hangi rapora gideceğini öğrenemiyor');
  });
});
