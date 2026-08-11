/* ============================================================================
   SÖZLEŞME, METRAJ VE HAKEDİŞ — CNT-01..09
   ----------------------------------------------------------------------------
   Faz 4 çıkış koşulu: "Onaylı metraj ve ilerlemeden hakediş üretimi."
   Hakediş satırları ONAYLI metrajdan üretilir, kesintiler sözleşme oranlarından
   hesaplanır. Onaylı sözleşme yerinde değişmez: fark ZEYİLLE taşınır (kural 6).
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, gunAnahtari, gunBaslangici } from '../cekirdek/zaman.mjs';
import { Para, BIRIMLER } from '../cekirdek/para.mjs';
import { DogrulamaHatasi, GecisIzinsiz, Bulunamadi, Cakisma, UygulamaHatasi } from '../cekirdek/hata.mjs';
import { idempotent } from '../cekirdek/idempotency.mjs';
import * as onayMotoru from '../moduller/isakisi/onay.mjs';
import { miktarAyristir, miktarMetni } from '../moduller/stok/defter.mjs';
import * as HK from '../moduller/sozlesme/hakedis.mjs';
import { santiyeSecenekleri, projeSecenekleri, sayac, gecmisKarti } from './kayit-modulu.mjs';
import {
  ekranNesnesi, hataNesnesi, kullaniciAdi, ciz, kaydiAl, listeSorgusu, filtreKosullari,
  B, h, ham, sayi, csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar,
  sorgu, tek, calistir, islem, surumluGuncelle, audit, sonrakiKod, gecisYap,
} from './ortak.mjs';

const SOZLESME_TURLERI = [
  { deger: 'taseron', etiket: 'Taşeron' }, { deger: 'musteri', etiket: 'Müşteri/işveren' },
  { deger: 'tedarik', etiket: 'Tedarik' }, { deger: 'kira', etiket: 'Kiralama' },
  { deger: 'hizmet', etiket: 'Hizmet' }, { deger: 'diger', etiket: 'Diğer' },
];
const TEMINAT_TURLERI = [
  { deger: 'gecici', etiket: 'Geçici teminat' }, { deger: 'kesin', etiket: 'Kesin teminat' },
  { deger: 'avans', etiket: 'Avans teminatı' }, { deger: 'ek', etiket: 'Ek teminat' },
];
const TEMINAT_BICIMLERI = [
  { deger: 'teminat_mektubu', etiket: 'Teminat mektubu' }, { deger: 'nakit', etiket: 'Nakit' },
  { deger: 'ipotek', etiket: 'İpotek' }, { deger: 'senet', etiket: 'Senet' },
];
const ZEYIL_TURLERI = [
  { deger: 'tutar', etiket: 'Tutar' }, { deger: 'sure', etiket: 'Süre' },
  { deger: 'kapsam', etiket: 'Kapsam' }, { deger: 'karma', etiket: 'Karma' },
];

const para = (minor, birim = 'TRY') => (minor == null ? '—' : Para.minor(minor, birim || 'TRY').bicim());
const yuzde = (binde) => (binde == null ? '—' : `%${(binde / 1000).toFixed(1).replace('.', ',')}`);
const oranAyristir = (girdi, alan) => {
  const s = String(girdi ?? '').trim().replace('%', '').replace(',', '.');
  if (!s) return 0;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw DogrulamaHatasi('Oran 0 ile 100 arasında olmalı.', { alanlar: { [alan]: ['0-100 arası girin.'] } });
  }
  return Math.round(n * 1000);
};
const oranMetni = (binde) => `${(binde / 1000).toFixed(2).replace('.', ',')}%`;

const sozlesmeSecenekleri = (ctx, { yalnizOnayli = false } = {}) => sorgu(
  `SELECT id, kod, ad FROM sozlesme WHERE tenant_id = ?${yalnizOnayli ? ` AND durum = 'onaylandi'` : ''}
    ORDER BY kod DESC LIMIT 200`, ctx.tenant.id).map((s) => ({ deger: s.id, etiket: `${s.kod} — ${s.ad}` }));

export function kur(y, ekranRota) {
  /* ================= CNT-01..03 Sözleşmeler ============================ */
  ekranRota(y, 'CNT-01', { get: (ctx) => sozlesmeListesi(ctx) });

  ekranRota(y, 'CNT-02', {
    get: (ctx) => html(ctx, 200, ciz(ctx, ekranNesnesi('CNT-02'), sozlesmeFormu(ctx, {}))),
    post: (ctx, govde) => {
      const e = ekranNesnesi('CNT-02');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const sonuc = idempotent(
          { anahtar: govde._idempotency, tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, govde },
          () => sozlesmeAc(ctx, govde));
        return yonlendir(ctx, `/sozlesmeler/${sonuc.id}?olusan=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, ciz(ctx, e, sozlesmeFormu(ctx, { deger: govde, hata: hataNesnesi(err) })));
      }
    },
  });

  ekranRota(y, 'CNT-03', {
    get: (ctx, _g, params) => sozlesmeDetayi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('CNT-03');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      csrfZorunlu(ctx, govde);
      const s = kaydiAl(ctx, 'sozlesme', 'sozlesme', params.id);
      try {
        const mesaj = sozlesmeIslemi(ctx, s, govde);
        return yonlendir(ctx, `/sozlesmeler/${s.id}?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return sozlesmeDetayi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ================= CNT-04 Zeyiller =================================== */
  ekranRota(y, 'CNT-04', {
    get: (ctx, _g, params) => zeyilSayfasi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('CNT-04');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      const s = kaydiAl(ctx, 'sozlesme', 'sozlesme', params.id);
      try {
        const mesaj = zeyilIslemi(ctx, s, govde);
        return yonlendir(ctx, `/sozlesmeler/${s.id}/zeyiller?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return zeyilSayfasi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= CNT-05 Teminatlar ================================= */
  ekranRota(y, 'CNT-05', {
    get: (ctx) => teminatSayfasi(ctx),
    post: (ctx, govde) => {
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = govde._eylem === 'gecis' ? teminatGecisi(ctx, govde) : teminatAc(ctx, govde);
        return yonlendir(ctx, `/teminatlar?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return teminatSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= CNT-06 Metraj ===================================== */
  ekranRota(y, 'CNT-06', {
    get: (ctx) => metrajSayfasi(ctx),
    post: (ctx, govde) => {
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = metrajIslemi(ctx, govde);
        const p = new URLSearchParams({ islem: mesaj });
        if (govde.metrajId) p.set('metraj_id', govde.metrajId);
        return yonlendir(ctx, `/metraj?${p.toString()}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return metrajSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= CNT-07..09 Hakedişler ============================= */
  ekranRota(y, 'CNT-07', { get: (ctx) => hakedisListesi(ctx) });

  ekranRota(y, 'CNT-08', {
    get: (ctx) => hakedisSihirbazi(ctx),
    post: (ctx, govde) => {
      const e = ekranNesnesi('CNT-08');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const sonuc = idempotent(
          { anahtar: govde._idempotency, tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, govde },
          () => hakedisUret(ctx, govde));
        return yonlendir(ctx, `/hakedisler/${sonuc.id}?olusan=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return hakedisSihirbazi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  ekranRota(y, 'CNT-09', {
    get: (ctx, _g, params) => hakedisDetayi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('CNT-09');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      csrfZorunlu(ctx, govde);
      const hk = kaydiAl(ctx, 'hakedis', 'hakedis', params.id);
      try {
        const mesaj = hakedisIslemi(ctx, hk, govde);
        return yonlendir(ctx, `/hakedisler/${hk.id}?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return hakedisDetayi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });
}

/* ==========================================================================
   CNT-01..03
   ========================================================================== */
function sozlesmeListesi(ctx, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('CNT-01');
  yetkiZorunlu(ctx, e.yetki);
  const { kosullar, parametreler } = filtreKosullari(ctx, {
    aramaAlanlari: ['ad', 'kod', 'karsi_taraf'],
    filtreler: [{ ad: 'durum' }, { ad: 'tur' }, { ad: 'proje_id' }],
  });
  const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
    { tablo: 'sozlesme', kosullar, parametreler, sirala: 'olusturuldu DESC' });

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Onaylı sözleşme', deger: sayi(sayac(ctx.tenant.id, 'sozlesme', `durum = 'onaylandi'`)),
        ikon: 'fa-file-signature' },
      { etiket: 'Onay bekleyen', deger: sayi(sayac(ctx.tenant.id, 'sozlesme',
        `durum IN ('onaya_gonderildi','incelemede')`)), ikon: 'fa-hourglass-half' },
      { etiket: 'Açık teminat', deger: sayi(sayac(ctx.tenant.id, 'teminat', `durum = 'aktif'`)),
        ikon: 'fa-shield-halved' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ]),
    filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Sözleşme adı, kodu veya karşı taraf…',
      filtreler: [
        { ad: 'durum', etiket: 'Durum', secenekler: ['taslak', 'onaya_gonderildi', 'incelemede',
          'onaylandi', 'reddedildi', 'iptal'].map((d) => ({ deger: d, etiket: d })) },
        { ad: 'tur', etiket: 'Tür', secenekler: SOZLESME_TURLERI },
        { ad: 'proje_id', etiket: 'Proje', secenekler: projeSecenekleri(ctx) },
      ] }),
    icerik: B.tablo({
      satirlar,
      satirRota: (r) => `/sozlesmeler/${r.id}`,
      bosDurum: { baslik: 'Sözleşme yok', ikon: 'fa-file-signature',
        aciklama: 'Hakediş yalnız onaylı sözleşme ve onaylı metrajdan üretilir.',
        eylem: yetkiVar(ctx, 'CNT-02:olustur')
          ? B.btn('Yeni sözleşme', { tur: 'acc', rota: '/sozlesmeler/yeni', ikon: 'fa-plus' }) : null },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod', govde: (r) => h`${r.kod}<br><span class="muted">sürüm ${r.surum_no}</span>` },
        { ad: 'ad', etiket: 'Sözleşme', govde: (r) => h`<a href="/sozlesmeler/${r.id}"><b>${r.ad}</b></a>
          <br><span class="muted">${r.karsi_taraf || (r.tedarikci_id
    ? tek('SELECT unvan FROM tedarikci WHERE id = ?', r.tedarikci_id)?.unvan : '') || ''}</span>` },
        { ad: 'tur', etiket: 'Tür', govde: (r) => SOZLESME_TURLERI.find((t) => t.deger === r.tur)?.etiket || r.tur },
        { ad: 'tutar_minor', etiket: 'Güncel bedel', hizala: 'sag', govde: (r) => {
          const guncel = HK.guncelBedel(r.id);
          const fark = guncel - Number(r.tutar_minor);
          return h`${para(guncel, r.tutar_birim)}${fark
            ? h`<br><span class="muted">zeyil ${fark > 0 ? '+' : ''}${para(fark, r.tutar_birim)}</span>` : ''}`;
        } },
        { ad: 'gerceklesme', etiket: 'Gerçekleşme', hizala: 'sag',
          govde: (r) => (r.durum === 'onaylandi' ? yuzde(HK.gerceklesmeBinde(r.id)) : '—') },
        { ad: 'bitis', etiket: 'Bitiş', govde: (r) => (r.bitis ? tarih(r.bitis) : '—') },
        { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}`;
  return html(ctx, durum, ciz(ctx, e, icerik, {
    eylemler: yetkiVar(ctx, 'CNT-02:olustur')
      ? B.btn('Yeni sözleşme', { tur: 'acc', rota: '/sozlesmeler/yeni', ikon: 'fa-plus' }) : null,
  }));
}

function kalemleriCoz(govde, sayiKadar = 6) {
  const satirlar = []; const hatalar = {};
  for (let i = 0; i < sayiKadar; i++) {
    const poz = String(govde[`poz${i}No`] || '').trim();
    const tanim = String(govde[`poz${i}Tanim`] || '').trim();
    if (!poz && !tanim) continue;
    if (!poz) { hatalar[`poz${i}No`] = ['Poz no girin.']; continue; }
    if (!tanim) { hatalar[`poz${i}Tanim`] = ['Tanım girin.']; continue; }
    let miktar;
    try { miktar = miktarAyristir(govde[`poz${i}Miktar`], `poz${i}Miktar`); }
    catch (e) { hatalar[`poz${i}Miktar`] = [e.mesaj]; continue; }
    let fiyat;
    try { fiyat = Para.ayristir(govde[`poz${i}Fiyat`] || '0', govde.paraBirimi || 'TRY').minor; }
    catch { hatalar[`poz${i}Fiyat`] = ['Geçersiz birim fiyat.']; continue; }
    if (satirlar.some((x) => x.pozNo === poz)) { hatalar[`poz${i}No`] = ['Poz no tekrar ediyor.']; continue; }
    satirlar.push({ sira: satirlar.length + 1, pozNo: poz, tanim, miktarBinde: miktar,
      birim: String(govde[`poz${i}Birim`] || 'ad').trim() || 'ad', fiyatMinor: fiyat,
      maliyetKodu: govde[`poz${i}Maliyet`] || null });
  }
  if (Object.keys(hatalar).length) throw DogrulamaHatasi('Poz satırlarında hata var.', { alanlar: hatalar });
  return satirlar;
}

function sozlesmeAc(ctx, govde) {
  const ad = String(govde.ad || '').trim();
  if (!ad) throw DogrulamaHatasi('Sözleşme adı zorunludur.', { alanlar: { ad: ['Ad girin.'] } });
  const kalemler = kalemleriCoz(govde);
  if (!kalemler.length) {
    throw DogrulamaHatasi('En az bir poz girilmelidir.',
      { alanlar: { poz0No: ['Pozsuz sözleşme açılamaz; bedel pozlardan hesaplanır.'] } });
  }
  const avans = oranAyristir(govde.avansOrani, 'avansOrani');
  const teminat = oranAyristir(govde.teminatOrani, 'teminatOrani');
  const stopaj = oranAyristir(govde.stopajOrani, 'stopajOrani');
  const bas = govde.baslangic ? gunBaslangici(govde.baslangic) : null;
  const bitis = govde.bitis ? gunBaslangici(govde.bitis) : null;
  if (bas && bitis && bitis <= bas) {
    throw DogrulamaHatasi('Bitiş başlangıçtan sonra olmalı.', { alanlar: { bitis: ['Tarih aralığı geçersiz.'] } });
  }
  const santiye = govde.santiyeId
    ? tek('SELECT * FROM santiye WHERE id = ? AND tenant_id = ?', govde.santiyeId, ctx.tenant.id) : null;

  return islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'sozlesme');
    const id = kimlik('sozlesme');
    calistir(`INSERT INTO sozlesme (id, tenant_id, kod, ad, tur, yon, tedarikci_id, karsi_taraf,
                proje_id, santiye_id, tutar_minor, tutar_birim, baslangic, bitis,
                avans_orani_binde, teminat_orani_binde, stopaj_orani_binde, odeme_vadesi_gun,
                surum_no, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,1, 'taslak', ?,?)`,
      id, ctx.tenant.id, kod, ad, govde.tur || 'taseron', govde.yon || 'gider',
      govde.tedarikciId || null, govde.karsiTaraf || null,
      santiye?.proje_id || govde.projeId || null, santiye?.id || null,
      govde.paraBirimi || ctx.tenant.para_birimi, bas, bitis, avans, teminat, stopaj,
      govde.odemeVadesiGun ? Number(govde.odemeVadesiGun) : null, ctx.kullanici.id, simdi());
    for (const k of kalemler) {
      calistir(`INSERT INTO sozlesme_kalemi (id, tenant_id, sozlesme_id, poz_no, sira, tanim, birim,
                  miktar_binde, birim_fiyat_minor, birim_fiyat_birim, maliyet_kodu)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        kimlik('satir'), ctx.tenant.id, id, k.pozNo, k.sira, k.tanim, k.birim,
        k.miktarBinde, String(k.fiyatMinor), govde.paraBirimi || ctx.tenant.para_birimi, k.maliyetKodu);
    }
    const bedel = HK.sozlesmeBedeli(id);
    calistir('UPDATE sozlesme SET tutar_minor = ? WHERE id = ?', String(bedel), id);
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'sozlesme', nesneId: id, eylem: 'olustur',
      sonraki: { kod, ad, poz: kalemler.length, bedelMinor: bedel } });
    return { id, kod };
  });
}

function sozlesmeFormu(ctx, { deger = {}, hata = null }) {
  const e = ekranNesnesi('CNT-02');
  const tedarikciler = sorgu(
    `SELECT id, kod, unvan FROM tedarikci WHERE tenant_id = ? AND durum = 'aktif' ORDER BY unvan`, ctx.tenant.id)
    .map((t) => ({ deger: t.id, etiket: `${t.kod} — ${t.unvan}` }));

  return B.form({
    rota: e.rota, csrf: csrfAlani(ctx), idempotencyAnahtari: kimlik('idempotency'), hatalar: hata,
    bolumler: [
      { baslik: 'Sözleşme künyesi',
        aciklama: 'Sözleşme TASLAK açılır. Onaylandıktan sonra yerinde değişmez; fark zeyille taşınır.',
        alanlar: h`
          ${B.alan({ ad: 'ad', etiket: 'Sözleşme adı', zorunlu: true, genis: true,
            deger: deger.ad || '', hata: hata?.alanlar?.ad })}
          ${B.alan({ ad: 'tur', etiket: 'Tür', deger: deger.tur || 'taseron', secenekler: SOZLESME_TURLERI })}
          ${B.alan({ ad: 'yon', etiket: 'Yön', deger: deger.yon || 'gider',
            secenekler: [{ deger: 'gider', etiket: 'Gider (biz ödüyoruz)' },
              { deger: 'gelir', etiket: 'Gelir (bize ödeniyor)' }] })}
          ${B.alan({ ad: 'tedarikciId', etiket: 'Tedarikçi / taşeron', deger: deger.tedarikciId || '',
            secenekler: [{ deger: '', etiket: 'Seçin…' }, ...tedarikciler] })}
          ${B.alan({ ad: 'karsiTaraf', etiket: 'Karşı taraf (tedarikçi kaydı yoksa)',
            deger: deger.karsiTaraf || '' })}
          ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye', deger: deger.santiyeId || '',
            secenekler: [{ deger: '', etiket: 'Seçin…' }, ...santiyeSecenekleri(ctx)] })}
          ${B.alan({ ad: 'baslangic', etiket: 'Başlangıç', tur: 'date', deger: deger.baslangic || '' })}
          ${B.alan({ ad: 'bitis', etiket: 'Bitiş', tur: 'date', deger: deger.bitis || '',
            hata: hata?.alanlar?.bitis })}
          ${B.alan({ ad: 'paraBirimi', etiket: 'Para birimi',
            deger: deger.paraBirimi || ctx.tenant.para_birimi,
            secenekler: Object.keys(BIRIMLER).map((k) => ({ deger: k, etiket: k })) })}` },
      { baslik: 'Oranlar ve ödeme',
        aciklama: 'Hakediş kesintileri bu ORANLARDAN hesaplanır; hakediş ekranında tutar yazılmaz.',
        alanlar: h`
          ${B.alan({ ad: 'avansOrani', etiket: 'Avans oranı (%)', deger: deger.avansOrani || '0',
            hata: hata?.alanlar?.avansOrani })}
          ${B.alan({ ad: 'teminatOrani', etiket: 'Teminat kesinti oranı (%)',
            deger: deger.teminatOrani || '0', hata: hata?.alanlar?.teminatOrani })}
          ${B.alan({ ad: 'stopajOrani', etiket: 'Stopaj oranı (%)', deger: deger.stopajOrani || '0',
            hata: hata?.alanlar?.stopajOrani })}
          ${B.alan({ ad: 'odemeVadesiGun', etiket: 'Ödeme vadesi (gün)', tur: 'number',
            deger: deger.odemeVadesiGun || '30' })}` },
      { baslik: 'Poz cetveli (birim fiyat)',
        aciklama: 'Sözleşme bedeli bu satırlardan HESAPLANIR; toplam alanı yoktur.',
        alanlar: h`${Array.from({ length: 6 }, (_, i) => h`
          ${B.alan({ ad: `poz${i}No`, etiket: `${i + 1}. poz no`, deger: deger[`poz${i}No`] || '',
            hata: hata?.alanlar?.[`poz${i}No`] })}
          ${B.alan({ ad: `poz${i}Tanim`, etiket: 'Tanım', genis: true, deger: deger[`poz${i}Tanim`] || '',
            hata: hata?.alanlar?.[`poz${i}Tanim`] })}
          ${B.alan({ ad: `poz${i}Miktar`, etiket: 'Miktar', deger: deger[`poz${i}Miktar`] || '',
            hata: hata?.alanlar?.[`poz${i}Miktar`] })}
          ${B.alan({ ad: `poz${i}Birim`, etiket: 'Birim', deger: deger[`poz${i}Birim`] || 'ad' })}
          ${B.alan({ ad: `poz${i}Fiyat`, etiket: 'Birim fiyat', deger: deger[`poz${i}Fiyat`] || '',
            hata: hata?.alanlar?.[`poz${i}Fiyat`] })}`)}` },
    ],
    eylemler: h`${B.btn('Vazgeç', { rota: '/sozlesmeler' })}
      ${B.btn('Kaydet ve detaya git', { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' })}`,
  });
}

function sozlesmeIslemi(ctx, s, govde) {
  if (govde._eylem === 'onaya_gonder') {
    if (!['taslak', 'revizyon_istendi'].includes(s.durum)) {
      throw GecisIzinsiz('Yalnız taslak veya revizyon istenen sözleşme onaya gönderilebilir.');
    }
    if (!Number(tek('SELECT COUNT(*) AS n FROM sozlesme_kalemi WHERE sozlesme_id = ?', s.id)?.n ?? 0)) {
      throw GecisIzinsiz('Pozsuz sözleşme onaya gönderilemez.');
    }
    islem(() => {
      const bedel = HK.sozlesmeBedeli(s.id);
      calistir('UPDATE sozlesme SET tutar_minor = ? WHERE id = ?', String(bedel), s.id);
      onayMotoru.onayaGonder(ctx, {
        nesne: 'sozlesme', nesneId: s.id, nesneKod: s.kod, baslik: `Sözleşme onayı: ${s.ad}`,
        belgeSurum: s.surum, tutarMinor: bedel, tutarBirim: s.tutar_birim,
        projeId: s.proje_id, santiyeId: s.santiye_id, gerekce: govde.gerekce || null,
      });
      gecisYap(ctx, { nesne: 'sozlesme', tablo: 'sozlesme', kayit: s, eylem: 'onaya_gonder',
        gerekce: govde.gerekce, ekranKodu: 'CNT-03' });
    });
    return 'Sözleşme onaya gönderildi';
  }
  if (['geri_cek', 'iptal_et'].includes(govde._eylem)) {
    gecisYap(ctx, { nesne: 'sozlesme', tablo: 'sozlesme', kayit: s, eylem: govde._eylem,
      gerekce: govde.gerekce, ekranKodu: 'CNT-03' });
    return 'Sözleşme durumu güncellendi';
  }
  if (govde._eylem === 'poz') {
    if (!['taslak', 'revizyon_istendi'].includes(s.durum)) {
      throw GecisIzinsiz('Onaylı sözleşmenin pozu değiştirilemez; fark zeyille taşınır (kural 6).');
    }
    const poz = String(govde.pozNo || '').trim();
    const tanim = String(govde.pozTanim || '').trim();
    if (!poz || !tanim) {
      throw DogrulamaHatasi('Poz no ve tanım zorunludur.',
        { alanlar: { pozNo: poz ? undefined : ['Poz no girin.'], pozTanim: tanim ? undefined : ['Tanım girin.'] } });
    }
    if (tek('SELECT id FROM sozlesme_kalemi WHERE sozlesme_id = ? AND poz_no = ?', s.id, poz)) {
      throw Cakisma(`"${poz}" pozu bu sözleşmede zaten var.`);
    }
    const miktar = miktarAyristir(govde.pozMiktar, 'pozMiktar');
    const fiyat = Para.ayristir(govde.pozFiyat || '0', s.tutar_birim).minor;
    islem(() => {
      const sira = Number(tek('SELECT COALESCE(MAX(sira),0) AS n FROM sozlesme_kalemi WHERE sozlesme_id = ?',
        s.id)?.n ?? 0) + 1;
      calistir(`INSERT INTO sozlesme_kalemi (id, tenant_id, sozlesme_id, poz_no, sira, tanim, birim,
                  miktar_binde, birim_fiyat_minor, birim_fiyat_birim, maliyet_kodu)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        kimlik('satir'), ctx.tenant.id, s.id, poz, sira, tanim, govde.pozBirim || 'ad',
        miktar, String(fiyat), s.tutar_birim, govde.pozMaliyet || null);
      calistir('UPDATE sozlesme SET tutar_minor = ? WHERE id = ?', String(HK.sozlesmeBedeli(s.id)), s.id);
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'sozlesme', nesneId: s.id, eylem: 'poz_eklendi', sonraki: { poz, miktar, fiyat } });
    });
    return `${poz} pozu eklendi`;
  }
  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

function sozlesmeDetayi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('CNT-03');
  yetkiZorunlu(ctx, e.yetki);
  const s = kaydiAl(ctx, 'sozlesme', 'sozlesme', id);
  const kalemler = sorgu('SELECT * FROM sozlesme_kalemi WHERE sozlesme_id = ? ORDER BY sira', s.id);
  const zeyiller = sorgu('SELECT * FROM zeyil WHERE sozlesme_id = ? ORDER BY olusturuldu DESC', s.id);
  const hakedisler = sorgu('SELECT * FROM hakedis WHERE sozlesme_id = ? ORDER BY no DESC', s.id);
  const teminatlar = sorgu('SELECT * FROM teminat WHERE sozlesme_id = ? ORDER BY olusturuldu DESC', s.id);
  const acikOnay = tek(
    `SELECT id FROM onay_talebi WHERE nesne = 'sozlesme' AND nesne_id = ? AND durum = 'acik'`, s.id);
  const duzenlenebilir = ['taslak', 'revizyon_istendi'].includes(s.durum);
  const guncel = HK.guncelBedel(s.id);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: 'Sözleşme oluşturuldu',
    aciklama: 'Taslak durumunda; onaylanmadan metraj ve hakediş üretilemez.' }) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.detayOzetSeridi({
    kod: `${s.kod} · s.${s.surum_no}`, baslik: s.ad, durum: s.durum, surum: s.surum,
    bilgiler: [
      { etiket: 'Karşı taraf', deger: s.tedarikci_id
        ? h`<a href="/tedarikciler/${s.tedarikci_id}">${
          tek('SELECT unvan FROM tedarikci WHERE id = ?', s.tedarikci_id)?.unvan || '—'}</a>`
        : (s.karsi_taraf || '—') },
      { etiket: 'İlk bedel', deger: para(HK.sozlesmeBedeli(s.id), s.tutar_birim) },
      { etiket: 'Güncel bedel', deger: para(guncel, s.tutar_birim) },
      { etiket: 'Gerçekleşme', deger: yuzde(HK.gerceklesmeBinde(s.id)) },
      { etiket: 'Kesintiler', deger: `avans ${oranMetni(s.avans_orani_binde)} · teminat ${
        oranMetni(s.teminat_orani_binde)} · stopaj ${oranMetni(s.stopaj_orani_binde)}` },
      { etiket: 'Süre', deger: `${s.baslangic ? tarih(s.baslangic) : '—'} → ${
        s.bitis ? tarih(s.bitis) : '—'}${HK.zeyilSuresi(s.id) ? ` (+${HK.zeyilSuresi(s.id)} gün zeyil)` : ''}` },
    ],
    birincilEylem: s.durum === 'onaylandi' && yetkiVar(ctx, 'CNT-08:olustur')
      ? B.btn('Hakediş üret', { tur: 'acc', rota: `/hakedisler/yeni?sozlesmeId=${s.id}`, ikon: 'fa-file-invoice-dollar' })
      : null,
    digerEylemler: h`${B.btn('Zeyiller', { rota: `/sozlesmeler/${s.id}/zeyiller`, ikon: 'fa-file-circle-plus' })}
      ${s.durum === 'onaylandi' ? B.btn('Metraj', { rota: `/metraj?sozlesme_id=${s.id}`, ikon: 'fa-ruler' }) : ''}`,
  })}
${acikOnay ? B.sonucSeridi({ tur: 'warn', baslik: 'Onay süreci açık',
    aciklama: 'Karar verilene kadar pozlar değiştirilemez.', kayitRota: `/onaylar/${acikOnay.id}` }) : ''}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Poz cetveli</b>
        <span>Bedel bu satırlardan hesaplanır. "Metraj" onaylı metrajların kümülatif toplamıdır.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: kalemler,
    bosDurum: { baslik: 'Poz yok', ikon: 'fa-list' },
    sutunlar: [
      { ad: 'poz_no', etiket: 'Poz', govde: (k) => h`<b>${k.poz_no}</b>` },
      { ad: 'tanim', etiket: 'Tanım' },
      { ad: 'miktar_binde', etiket: 'Sözleşme', hizala: 'sag',
        govde: (k) => h`${miktarMetni(k.miktar_binde)} ${k.birim}` },
      { ad: 'metraj', etiket: 'Onaylı metraj', hizala: 'sag', govde: (k) => {
        const m = HK.kumulatifMetraj(k.id);
        return m > k.miktar_binde ? B.isaret(`${miktarMetni(m)} — aşım`, 'danger') : miktarMetni(m);
      } },
      { ad: 'odenen', etiket: 'Ödenen', hizala: 'sag',
        govde: (k) => miktarMetni(HK.oncekiHakedisMiktari(k.id)) },
      { ad: 'birim_fiyat_minor', etiket: 'Birim fiyat', hizala: 'sag',
        govde: (k) => para(k.birim_fiyat_minor, k.birim_fiyat_birim) },
      { ad: 'tutar', etiket: 'Poz tutarı', hizala: 'sag', govde: (k) => para(
        Math.round((k.miktar_binde / 1000) * Number(k.birim_fiyat_minor)), k.birim_fiyat_birim) },
    ],
  })}</div>
    </div>
    ${hakedisler.length ? h`<div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Hakedişler</b></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: hakedisler,
    satirRota: (r) => `/hakedisler/${r.id}`,
    bosDurum: { baslik: 'Hakediş yok' },
    sutunlar: [
      { ad: 'no', etiket: 'No', hizala: 'sag', govde: (r) => h`<b>${r.no}</b>` },
      { ad: 'donem', etiket: 'Dönem' },
      { ad: 'donem_brut_minor', etiket: 'Dönem brüt', hizala: 'sag',
        govde: (r) => para(r.donem_brut_minor, r.tutar_birim) },
      { ad: 'net_minor', etiket: 'Net', hizala: 'sag', govde: (r) => para(r.net_minor, r.tutar_birim) },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
    ],
  })}</div>
    </div>` : ''}
    ${zeyiller.length ? h`<div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Zeyiller</b>
        <span>Onaylı zeyiller güncel bedeli ve süreyi değiştirir; sözleşme satırı değişmez.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: zeyiller,
    bosDurum: { baslik: 'Zeyil yok' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'konu', etiket: 'Konu' },
      { ad: 'tutar_farki_minor', etiket: 'Tutar farkı', hizala: 'sag',
        govde: (z) => (z.tutar_farki_minor ? para(z.tutar_farki_minor, z.tutar_birim) : '—') },
      { ad: 'sure_farki_gun', etiket: 'Süre farkı', hizala: 'sag',
        govde: (z) => (z.sure_farki_gun ? `${z.sure_farki_gun} gün` : '—') },
      { ad: 'durum', etiket: 'Durum', govde: (z) => B.rozet(z.durum) },
    ],
  })}</div>
    </div>` : ''}
    ${gecmisKarti('sozlesme', s)}
  </div>
  <div class="gv-side-stack">
    ${teminatlar.length ? h`<div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Teminatlar</b></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: teminatlar,
    bosDurum: { baslik: 'Teminat yok' },
    sutunlar: [
      { ad: 'tur', etiket: 'Tür', govde: (t) => TEMINAT_TURLERI.find((x) => x.deger === t.tur)?.etiket || t.tur },
      { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag', govde: (t) => para(t.tutar_minor, t.tutar_birim) },
      { ad: 'durum', etiket: 'Durum', govde: (t) => B.rozet(
        t.durum === 'aktif' ? 'onaylandi' : 'kapali') },
    ],
  })}</div>
    </div>` : ''}
    ${duzenlenebilir && yetkiVar(ctx, 'CNT-03:guncelle') ? B.form({
    rota: `/sozlesmeler/${s.id}`, csrf: csrfAlani(ctx),
    bolumler: [{ baslik: 'Poz ekle', alanlar: h`
      ${ham('<input type="hidden" name="_eylem" value="poz">')}
      ${B.alan({ ad: 'pozNo', etiket: 'Poz no', zorunlu: true })}
      ${B.alan({ ad: 'pozTanim', etiket: 'Tanım', zorunlu: true, genis: true })}
      ${B.alan({ ad: 'pozMiktar', etiket: 'Miktar', zorunlu: true })}
      ${B.alan({ ad: 'pozBirim', etiket: 'Birim', deger: 'ad' })}
      ${B.alan({ ad: 'pozFiyat', etiket: 'Birim fiyat', zorunlu: true })}` }],
    eylemler: B.btn('Pozu ekle', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Durum işlemleri</b>
        <span>Onaycı iş akışı şablonundan çözülür.</span></div></div>
      <div class="gc-body">
        ${yetkiVar(ctx, 'CNT-03:guncelle') ? h`
        <form method="post" action="/sozlesmeler/${s.id}" data-gform="1">
          ${ham(csrfAlani(ctx))}
          ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe / not', tur: 'metin' })}
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
            ${duzenlenebilir && !acikOnay
    ? h`<button class="btn btn-acc" type="submit" name="_eylem" value="onaya_gonder">
        Onaya gönder</button>` : ''}
            ${s.durum === 'onaya_gonderildi'
    ? h`<button class="btn btn-ghost" type="submit" name="_eylem" value="geri_cek">
        Onaydan geri çek</button>` : ''}
            ${duzenlenebilir
    ? h`<button class="btn btn-danger" type="submit" name="_eylem" value="iptal_et">İptal et</button>` : ''}
            ${s.durum === 'onaylandi'
    ? h`<p class="gf-hint">Sözleşme onaylandı ve <b>yerinde değişmez</b>. Miktar, süre veya
        kapsam değişikliği <a href="/sozlesmeler/${s.id}/zeyiller">zeyille</a> yapılır.</p>` : ''}
          </div>
        </form>` : ''}
      </div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: s.kod, baslik: s.ad }));
}

/* ==========================================================================
   CNT-04 zeyil
   ========================================================================== */
function zeyilIslemi(ctx, s, govde) {
  if (govde._eylem === 'onaya_gonder') {
    const z = tek('SELECT * FROM zeyil WHERE id = ? AND sozlesme_id = ?', govde.zeyilId, s.id);
    if (!z) throw Bulunamadi('Zeyil bulunamadı.');
    islem(() => {
      onayMotoru.onayaGonder(ctx, {
        nesne: 'zeyil', nesneId: z.id, nesneKod: z.kod, baslik: `Zeyilname: ${z.konu}`,
        belgeSurum: z.surum, tutarMinor: Math.abs(Number(z.tutar_farki_minor)), tutarBirim: z.tutar_birim,
        projeId: s.proje_id, santiyeId: s.santiye_id, gerekce: govde.gerekce || null,
      });
      gecisYap(ctx, { nesne: 'zeyil', tablo: 'zeyil', kayit: z, eylem: 'onaya_gonder',
        gerekce: govde.gerekce, ekranKodu: 'CNT-04' });
    });
    return 'Zeyil onaya gönderildi';
  }

  if (s.durum !== 'onaylandi') {
    throw GecisIzinsiz('Zeyil yalnız ONAYLI sözleşme üzerinde açılır; taslak sözleşme doğrudan düzenlenir.');
  }
  const konu = String(govde.konu || '').trim();
  if (!konu) throw DogrulamaHatasi('Zeyil konusu zorunludur.', { alanlar: { konu: ['Konu girin.'] } });
  const tur = ZEYIL_TURLERI.some((t) => t.deger === govde.tur) ? govde.tur : 'karma';
  let tutarFarki = 0;
  if (govde.tutarFarki) {
    try { tutarFarki = Number(Para.ayristir(String(govde.tutarFarki).replace('-', ''), s.tutar_birim).minor); }
    catch { throw DogrulamaHatasi('Geçersiz tutar farkı.', { alanlar: { tutarFarki: ['Tutar girin.'] } }); }
    if (String(govde.tutarFarki).trim().startsWith('-')) tutarFarki = -tutarFarki;
  }
  const sureFarki = govde.sureFarki ? Number(govde.sureFarki) : 0;
  if (!Number.isInteger(sureFarki) || Math.abs(sureFarki) > 3650) {
    throw DogrulamaHatasi('Süre farkı ±3650 gün aralığında tam sayı olmalı.',
      { alanlar: { sureFarki: ['Geçersiz gün.'] } });
  }
  if (tutarFarki === 0 && sureFarki === 0 && tur !== 'kapsam') {
    throw DogrulamaHatasi('Zeyil tutar veya süre farkı taşımalıdır (kapsam zeyili hariç).',
      { alanlar: { tutarFarki: ['Fark girin.'] } });
  }
  /* Bedeli sıfırın altına indiren zeyil kabul edilmez. */
  if (HK.guncelBedel(s.id) + tutarFarki < 0) {
    throw DogrulamaHatasi('Zeyil, güncel sözleşme bedelini sıfırın altına indiremez.',
      { alanlar: { tutarFarki: ['Fark çok büyük.'] } });
  }

  islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'zeyil');
    const id = kimlik('sozlesme').replace('cnt', 'zyl');
    calistir(`INSERT INTO zeyil (id, tenant_id, sozlesme_id, kod, tur, konu, tutar_farki_minor,
                tutar_birim, sure_farki_gun, gerekce, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?, 'taslak', ?,?)`,
      id, ctx.tenant.id, s.id, kod, tur, konu, String(tutarFarki), s.tutar_birim,
      sureFarki, govde.gerekce || null, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'zeyil', nesneId: id, eylem: 'olustur',
      sonraki: { kod, konu, tutarFarki, sureFarki } });
  });
  return 'Zeyil taslağı açıldı';
}

function zeyilSayfasi(ctx, id, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('CNT-04');
  yetkiZorunlu(ctx, e.yetki);
  const s = kaydiAl(ctx, 'sozlesme', 'sozlesme', id);
  const zeyiller = sorgu('SELECT * FROM zeyil WHERE sozlesme_id = ? ORDER BY olusturuldu DESC', s.id);
  const rota = `/sozlesmeler/${s.id}/zeyiller`;

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.detayOzetSeridi({
    kod: s.kod, baslik: `${s.ad} — zeyiller`, durum: s.durum, surum: s.surum,
    bilgiler: [
      { etiket: 'İlk bedel', deger: para(HK.sozlesmeBedeli(s.id), s.tutar_birim) },
      { etiket: 'Zeyil farkı', deger: para(HK.zeyilFarki(s.id), s.tutar_birim) },
      { etiket: 'Güncel bedel', deger: para(HK.guncelBedel(s.id), s.tutar_birim) },
      { etiket: 'Süre farkı', deger: `${HK.zeyilSuresi(s.id)} gün` },
    ],
    birincilEylem: B.btn('Sözleşmeye dön', { rota: `/sozlesmeler/${s.id}` }),
  })}
<div class="dash-cols">
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>Zeyilnameler</b>
      <span>Onaylı sözleşme yerinde değişmez; fark bu satırlarda taşınır (kural 6).</span></div></div>
    <div class="gc-body flush">${B.tablo({
    satirlar: zeyiller,
    bosDurum: { baslik: 'Zeyil yok', ikon: 'fa-file-circle-plus',
      aciklama: 'Miktar, süre veya kapsam değişikliği zeyille yapılır.' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'konu', etiket: 'Konu', govde: (z) => h`<b>${z.konu}</b><br><span class="muted">${
        ZEYIL_TURLERI.find((t) => t.deger === z.tur)?.etiket || z.tur}</span>` },
      { ad: 'tutar_farki_minor', etiket: 'Tutar farkı', hizala: 'sag',
        govde: (z) => (Number(z.tutar_farki_minor)
          ? B.isaret(para(z.tutar_farki_minor, z.tutar_birim),
            Number(z.tutar_farki_minor) > 0 ? 'warn' : 'ok') : '—') },
      { ad: 'sure_farki_gun', etiket: 'Süre farkı', hizala: 'sag',
        govde: (z) => (z.sure_farki_gun ? `${z.sure_farki_gun > 0 ? '+' : ''}${z.sure_farki_gun} gün` : '—') },
      { ad: 'durum', etiket: 'Durum', govde: (z) => B.rozet(z.durum) },
      { ad: 'islem', etiket: '', govde: (z) => (z.durum !== 'taslak' || !yetkiVar(ctx, 'CNT-04:olustur') ? '—'
        : h`<form method="post" action="${rota}" style="display:inline">${ham(csrfAlani(ctx))}
            <input type="hidden" name="_eylem" value="onaya_gonder">
            <input type="hidden" name="zeyilId" value="${z.id}">
            <button class="btn btn-acc btn-sm" type="submit">Onaya gönder</button></form>`) },
    ],
  })}</div>
  </div>
  <div class="gv-side-stack">
    ${s.durum === 'onaylandi' && yetkiVar(ctx, 'CNT-04:olustur') ? B.form({
    rota, csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni zeyil',
      aciklama: 'Tutar farkı eksi girmek için başına "-" koyun. Zeyil taslak açılır ve onaydan geçer.',
      alanlar: h`
      ${B.alan({ ad: 'konu', etiket: 'Konu', zorunlu: true, genis: true, deger: deger.konu || '',
      hata: hata?.alanlar?.konu })}
      ${B.alan({ ad: 'tur', etiket: 'Tür', deger: deger.tur || 'tutar', secenekler: ZEYIL_TURLERI })}
      ${B.alan({ ad: 'tutarFarki', etiket: 'Tutar farkı', deger: deger.tutarFarki || '',
      hata: hata?.alanlar?.tutarFarki, ipucu: 'Örn. 125.000,00 veya -50.000,00' })}
      ${B.alan({ ad: 'sureFarki', etiket: 'Süre farkı (gün)', tur: 'number', deger: deger.sureFarki || '0',
      hata: hata?.alanlar?.sureFarki })}
      ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe', tur: 'metin', genis: true, deger: deger.gerekce || '' })}` }],
    eylemler: B.btn('Zeyil taslağı aç', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : B.sonucSeridi({ tur: 'warn', baslik: 'Sözleşme onaylı değil',
    aciklama: 'Zeyil yalnız onaylı sözleşmede açılır; taslak sözleşme doğrudan düzenlenir.' })}
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: s.kod, baslik: s.ad }));
}

/* ==========================================================================
   CNT-05 teminat
   ========================================================================== */
function teminatAc(ctx, govde) {
  yetkiZorunlu(ctx, 'CNT-05:olustur');
  const s = govde.sozlesmeId
    ? tek('SELECT * FROM sozlesme WHERE id = ? AND tenant_id = ?', govde.sozlesmeId, ctx.tenant.id) : null;
  const tutar = Para.ayristir(govde.tutar || '', govde.paraBirimi || ctx.tenant.para_birimi);
  if (tutar.minor <= 0n) {
    throw DogrulamaHatasi('Teminat tutarı sıfırdan büyük olmalı.', { alanlar: { tutar: ['Tutar girin.'] } });
  }
  islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'teminat');
    const id = kimlik('sozlesme').replace('cnt', 'tmn');
    calistir(`INSERT INTO teminat (id, tenant_id, sozlesme_id, tedarikci_id, kod, tur, bicim,
                tutar_minor, tutar_birim, banka, mektup_no, veris_tarihi, gecerlilik,
                durum, olusturan, olusturuldu) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'aktif', ?,?)`,
      id, ctx.tenant.id, s?.id || null, s?.tedarikci_id || govde.tedarikciId || null, kod,
      govde.tur || 'kesin', govde.bicim || 'teminat_mektubu', String(tutar.minor), tutar.birim,
      govde.banka || null, govde.mektupNo || null,
      govde.verisTarihi ? gunBaslangici(govde.verisTarihi) : simdi(),
      govde.gecerlilik ? gunBaslangici(govde.gecerlilik) : null, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'teminat', nesneId: id, eylem: 'olustur',
      sonraki: { kod, tur: govde.tur, tutarMinor: String(tutar.minor) } });
  });
  return 'Teminat kaydedildi';
}

function teminatGecisi(ctx, govde) {
  yetkiZorunlu(ctx, 'CNT-05:guncelle');
  const t = tek('SELECT * FROM teminat WHERE id = ? AND tenant_id = ?', govde.id, ctx.tenant.id);
  if (!t) throw Bulunamadi('Teminat bulunamadı.');
  gecisYap(ctx, { nesne: 'teminat', tablo: 'teminat', kayit: t, eylem: govde.gecis,
    gerekce: govde.gerekce, ekranKodu: 'CNT-05',
    ekAlanlar: govde.gecis === 'iade_et' ? { iade_tarihi: simdi() } : {} });
  return 'Teminat durumu güncellendi';
}

function teminatSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('CNT-05');
  yetkiZorunlu(ctx, e.yetki);
  const { kosullar, parametreler } = filtreKosullari(ctx, {
    aramaAlanlari: ['kod', 'mektup_no', 'banka'], filtreler: [{ ad: 'durum' }, { ad: 'tur' }],
  });
  const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
    { tablo: 'teminat', kosullar, parametreler, sirala: 'olusturuldu DESC',
      kapsamSecenekleri: { projeSutunu: null, santiyeSutunu: null } });
  const suresiYaklasan = sayac(ctx.tenant.id, 'teminat',
    `durum = 'aktif' AND gecerlilik IS NOT NULL AND gecerlilik < ?`, simdi() + 30 * 86_400_000);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${suresiYaklasan ? B.sonucSeridi({ tur: 'warn', baslik: `${suresiYaklasan} teminatın süresi 30 gün içinde doluyor`,
    aciklama: 'Süresi dolan teminat mektubu yenilenmeli veya iade alınmalıdır.' }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Aktif teminat', deger: sayi(sayac(ctx.tenant.id, 'teminat', `durum = 'aktif'`)),
        ikon: 'fa-shield-halved' },
      { etiket: 'Toplam tutar', ikon: 'fa-coins', deger: para(Number(tek(
        `SELECT COALESCE(SUM(tutar_minor),0) AS n FROM teminat WHERE tenant_id = ? AND durum = 'aktif'`,
        ctx.tenant.id)?.n ?? 0), ctx.tenant.para_birimi) },
      { etiket: 'Süresi yaklaşan', deger: sayi(suresiYaklasan), ikon: 'fa-hourglass-half',
        ton: suresiYaklasan ? 'warn' : '' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ]),
    filtre: B.filtreBari({ rota: '/teminatlar', sorgu: ctx.sorgu, aramaYer: 'Kod, mektup no veya banka…',
      filtreler: [
        { ad: 'tur', etiket: 'Tür', secenekler: TEMINAT_TURLERI },
        { ad: 'durum', etiket: 'Durum', secenekler: ['aktif', 'iade', 'nakde_cevrildi', 'iptal']
          .map((d) => ({ deger: d, etiket: d })) },
      ] }),
    icerik: B.tablo({
      satirlar,
      bosDurum: { baslik: 'Teminat yok', ikon: 'fa-shield-halved' },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'tur', etiket: 'Tür', govde: (t) => h`${TEMINAT_TURLERI.find((x) => x.deger === t.tur)?.etiket}
          <br><span class="muted">${TEMINAT_BICIMLERI.find((x) => x.deger === t.bicim)?.etiket}</span>` },
        { ad: 'sozlesme_id', etiket: 'Sözleşme', govde: (t) => (t.sozlesme_id
          ? h`<a href="/sozlesmeler/${t.sozlesme_id}">${
            tek('SELECT kod FROM sozlesme WHERE id = ?', t.sozlesme_id)?.kod || '—'}</a>` : '—') },
        { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag', govde: (t) => para(t.tutar_minor, t.tutar_birim) },
        { ad: 'banka', etiket: 'Banka / mektup', govde: (t) => h`${t.banka || '—'}${
          t.mektup_no ? h`<br><span class="muted">${t.mektup_no}</span>` : ''}` },
        { ad: 'gecerlilik', etiket: 'Geçerlilik', govde: (t) => (!t.gecerlilik ? '—'
          : t.gecerlilik < simdi() && t.durum === 'aktif'
            ? B.isaret(`${tarih(t.gecerlilik)} — doldu`, 'danger') : tarih(t.gecerlilik)) },
        { ad: 'durum', etiket: 'Durum', govde: (t) => (t.durum === 'aktif' && yetkiVar(ctx, 'CNT-05:guncelle')
          ? h`<form method="post" action="/teminatlar" style="display:flex;gap:6px;flex-wrap:wrap">
              ${ham(csrfAlani(ctx))}
              <input type="hidden" name="_eylem" value="gecis">
              <input type="hidden" name="id" value="${t.id}">
              <input type="text" name="gerekce" placeholder="Gerekçe" aria-label="Gerekçe" style="max-width:120px">
              <button class="btn btn-ghost btn-sm" type="submit" name="gecis" value="iade_et">İade</button>
              <button class="btn btn-danger btn-sm" type="submit" name="gecis" value="nakde_cevir">Nakde çevir</button>
            </form>`
          : B.rozet(t.durum === 'aktif' ? 'onaylandi' : 'kapali',
            { aktif: 'Aktif', iade: 'İade', nakde_cevrildi: 'Nakde çevrildi', iptal: 'İptal' }[t.durum])) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: '/teminatlar', sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'CNT-05:olustur') ? B.form({
    rota: '/teminatlar', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni teminat', alanlar: h`
      ${B.alan({ ad: 'sozlesmeId', etiket: 'Sözleşme', deger: deger.sozlesmeId || '',
    secenekler: [{ deger: '', etiket: 'Sözleşmesiz' }, ...sozlesmeSecenekleri(ctx)] })}
      ${B.alan({ ad: 'tur', etiket: 'Tür', deger: deger.tur || 'kesin', secenekler: TEMINAT_TURLERI })}
      ${B.alan({ ad: 'bicim', etiket: 'Biçim', deger: deger.bicim || 'teminat_mektubu',
    secenekler: TEMINAT_BICIMLERI })}
      ${B.alan({ ad: 'tutar', etiket: 'Tutar', zorunlu: true, deger: deger.tutar || '',
    hata: hata?.alanlar?.tutar })}
      ${B.alan({ ad: 'banka', etiket: 'Banka', deger: deger.banka || '' })}
      ${B.alan({ ad: 'mektupNo', etiket: 'Mektup no', deger: deger.mektupNo || '' })}
      ${B.alan({ ad: 'verisTarihi', etiket: 'Veriliş tarihi', tur: 'date',
    deger: deger.verisTarihi || gunAnahtari(simdi()) })}
      ${B.alan({ ad: 'gecerlilik', etiket: 'Geçerlilik bitişi', tur: 'date', deger: deger.gecerlilik || '' })}` }],
    eylemler: B.btn('Teminatı kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/* ==========================================================================
   CNT-06 metraj
   ========================================================================== */
function metrajIslemi(ctx, govde) {
  if (govde._eylem === 'ac') {
    yetkiZorunlu(ctx, 'CNT-06:olustur');
    const s = tek('SELECT * FROM sozlesme WHERE id = ? AND tenant_id = ?', govde.sozlesmeId, ctx.tenant.id);
    if (!s) throw DogrulamaHatasi('Sözleşme seçin.', { alanlar: { sozlesmeId: ['Sözleşme bulunamadı.'] } });
    if (s.durum !== 'onaylandi') throw GecisIzinsiz('Metraj yalnız ONAYLI sözleşme için açılır.');
    const donem = String(govde.donem || gunAnahtari(simdi()).slice(0, 7));
    if (!/^\d{4}-\d{2}$/.test(donem)) {
      throw DogrulamaHatasi('Dönem YYYY-AA biçiminde olmalı.', { alanlar: { donem: ['Örn. 2026-09'] } });
    }
    return islem(() => {
      const kod = sonrakiKod(ctx.tenant.id, 'metraj');
      const id = kimlik('metraj');
      calistir(`INSERT INTO metraj (id, tenant_id, sozlesme_id, kod, donem, aciklama, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?, 'taslak', ?,?)`,
        id, ctx.tenant.id, s.id, kod, donem, govde.aciklama || null, ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'metraj', nesneId: id, eylem: 'olustur', sonraki: { kod, sozlesme: s.kod, donem } });
      return `${kod} metraj cetveli açıldı`;
    });
  }

  const m = tek('SELECT * FROM metraj WHERE id = ? AND tenant_id = ?', govde.metrajId, ctx.tenant.id);
  if (!m) throw Bulunamadi('Metraj bulunamadı.');

  if (govde._eylem === 'satir') {
    yetkiZorunlu(ctx, 'CNT-06:guncelle');
    if (!['taslak', 'revizyon_istendi'].includes(m.durum)) {
      throw GecisIzinsiz('Onaya gönderilmiş metrajın satırları değiştirilemez (kural 6).');
    }
    const k = tek('SELECT * FROM sozlesme_kalemi WHERE id = ? AND sozlesme_id = ?',
      govde.kalemId, m.sozlesme_id);
    if (!k) throw DogrulamaHatasi('Poz seçin.', { alanlar: { kalemId: ['Poz bulunamadı.'] } });
    const miktar = miktarAyristir(govde.miktar, 'miktar');
    if (tek('SELECT id FROM metraj_satiri WHERE metraj_id = ? AND sozlesme_kalemi_id = ?', m.id, k.id)) {
      throw Cakisma(`${k.poz_no} pozu bu metrajda zaten var.`);
    }
    islem(() => {
      calistir(`INSERT INTO metraj_satiri (id, metraj_id, sozlesme_kalemi_id, miktar_binde, aciklama)
                VALUES (?,?,?,?,?)`, kimlik('satir'), m.id, k.id, miktar, govde.aciklama || null);
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'metraj', nesneId: m.id, eylem: 'satir_eklendi',
        sonraki: { poz: k.poz_no, miktarBinde: miktar } });
    });
    return `${k.poz_no} metraj satırı eklendi`;
  }

  if (govde._eylem === 'onaya_gonder') {
    yetkiZorunlu(ctx, 'CNT-06:guncelle');
    if (!Number(tek('SELECT COUNT(*) AS n FROM metraj_satiri WHERE metraj_id = ?', m.id)?.n ?? 0)) {
      throw GecisIzinsiz('Satırsız metraj onaya gönderilemez.');
    }
    const s = tek('SELECT * FROM sozlesme WHERE id = ?', m.sozlesme_id);
    islem(() => {
      onayMotoru.onayaGonder(ctx, {
        nesne: 'metraj', nesneId: m.id, nesneKod: m.kod,
        baslik: `Metraj onayı: ${s.kod} · ${m.donem}`, belgeSurum: m.surum,
        projeId: s.proje_id, santiyeId: s.santiye_id, gerekce: govde.gerekce || null,
      });
      gecisYap(ctx, { nesne: 'metraj', tablo: 'metraj', kayit: m, eylem: 'onaya_gonder',
        gerekce: govde.gerekce, ekranKodu: 'CNT-06' });
    });
    return 'Metraj onaya gönderildi';
  }
  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

function metrajSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('CNT-06');
  yetkiZorunlu(ctx, e.yetki);
  const sozlesmeId = ctx.sorgu.get('sozlesme_id') || '';
  const kosul = ['m.tenant_id = ?']; const p = [ctx.tenant.id];
  if (sozlesmeId) { kosul.push('m.sozlesme_id = ?'); p.push(sozlesmeId); }
  const metrajlar = sorgu(
    `SELECT m.*, s.kod AS sozlesme_kod, s.ad AS sozlesme_ad FROM metraj m
       JOIN sozlesme s ON s.id = m.sozlesme_id
      WHERE ${kosul.join(' AND ')} ORDER BY m.olusturuldu DESC LIMIT 100`, ...p);
  const secilenId = ctx.sorgu.get('metraj_id') || metrajlar[0]?.id || null;
  const m = secilenId ? metrajlar.find((x) => x.id === secilenId) : null;
  const satirlar = m ? sorgu(
    `SELECT ms.*, k.poz_no, k.tanim, k.birim, k.miktar_binde AS sozlesme_binde
       FROM metraj_satiri ms JOIN sozlesme_kalemi k ON k.id = ms.sozlesme_kalemi_id
      WHERE ms.metraj_id = ? ORDER BY k.sira`, m.id) : [];
  const pozlar = m ? sorgu('SELECT * FROM sozlesme_kalemi WHERE sozlesme_id = ? ORDER BY sira', m.sozlesme_id)
    .map((k) => ({ deger: k.id, etiket: `${k.poz_no} — ${k.tanim}` })) : [];
  const acikOnay = m ? tek(
    `SELECT id FROM onay_talebi WHERE nesne = 'metraj' AND nesne_id = ? AND durum = 'acik'`, m.id) : null;

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.kpiSeridi([
    { etiket: 'Metraj cetveli', deger: sayi(metrajlar.length), ikon: 'fa-ruler' },
    { etiket: 'Onaylı', deger: sayi(metrajlar.filter((x) => x.durum === 'onaylandi').length), ikon: 'fa-circle-check' },
    { etiket: 'Onayda', deger: sayi(metrajlar.filter((x) => ['onaya_gonderildi', 'incelemede'].includes(x.durum)).length),
      ikon: 'fa-hourglass-half' },
    { etiket: 'Taslak', deger: sayi(metrajlar.filter((x) => x.durum === 'taslak').length), ikon: 'fa-pen' },
  ])}
${B.filtreBari({ rota: '/metraj', sorgu: ctx.sorgu, aramaYer: 'Ara…',
    filtreler: [{ ad: 'sozlesme_id', etiket: 'Sözleşme', secenekler: sozlesmeSecenekleri(ctx, { yalnizOnayli: true }) }] })}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Metraj cetvelleri</b>
        <span>Hakediş yalnız ONAYLI metrajdan üretilir.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: metrajlar,
    satirRota: (x) => `/metraj?metraj_id=${x.id}${sozlesmeId ? `&sozlesme_id=${sozlesmeId}` : ''}`,
    bosDurum: { baslik: 'Metraj yok', ikon: 'fa-ruler',
      aciklama: 'Metraj onaylı sözleşme üzerinden açılır.' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod', govde: (x) => h`<b>${x.kod}</b>${
        x.id === secilenId ? h` ${B.isaret('seçili', 'info')}` : ''}` },
      { ad: 'sozlesme_kod', etiket: 'Sözleşme', govde: (x) => h`${x.sozlesme_kod}
        <br><span class="muted">${x.sozlesme_ad}</span>` },
      { ad: 'donem', etiket: 'Dönem' },
      { ad: 'satir', etiket: 'Satır', hizala: 'sag', govde: (x) => sayi(Number(tek(
        'SELECT COUNT(*) AS n FROM metraj_satiri WHERE metraj_id = ?', x.id)?.n ?? 0)) },
      { ad: 'durum', etiket: 'Durum', govde: (x) => B.rozet(x.durum) },
    ],
  })}</div>
    </div>
    ${m ? h`<div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>${m.kod} satırları</b>
        <span>Kümülatif sütunu, tüm onaylı metrajların toplamıdır.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar,
    bosDurum: { baslik: 'Satır yok', ikon: 'fa-list', aciklama: 'Sağdaki formdan poz metrajı girin.' },
    sutunlar: [
      { ad: 'poz_no', etiket: 'Poz', govde: (x) => h`<b>${x.poz_no}</b><br><span class="muted">${x.tanim}</span>` },
      { ad: 'miktar_binde', etiket: 'Bu metraj', hizala: 'sag',
        govde: (x) => h`${miktarMetni(x.miktar_binde)} ${x.birim}` },
      { ad: 'kumulatif', etiket: 'Onaylı kümülatif', hizala: 'sag',
        govde: (x) => miktarMetni(HK.kumulatifMetraj(x.sozlesme_kalemi_id)) },
      { ad: 'sozlesme_binde', etiket: 'Sözleşme miktarı', hizala: 'sag',
        govde: (x) => miktarMetni(x.sozlesme_binde) },
      { ad: 'asim', etiket: 'Durum', govde: (x) => {
        const k = HK.kumulatifMetraj(x.sozlesme_kalemi_id);
        return k > x.sozlesme_binde ? B.isaret('sözleşme aşımı', 'danger') : B.isaret('içinde', 'ok');
      } },
      { ad: 'aciklama', etiket: 'Açıklama', govde: (x) => x.aciklama || '—' },
    ],
  })}</div>
    </div>` : ''}
  </div>
  <div class="gv-side-stack">
    ${yetkiVar(ctx, 'CNT-06:olustur') ? B.form({
    rota: '/metraj', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni metraj cetveli', alanlar: h`
      ${ham('<input type="hidden" name="_eylem" value="ac">')}
      ${B.alan({ ad: 'sozlesmeId', etiket: 'Sözleşme', zorunlu: true,
      deger: deger.sozlesmeId || sozlesmeId, hata: hata?.alanlar?.sozlesmeId,
      secenekler: [{ deger: '', etiket: 'Seçin…' }, ...sozlesmeSecenekleri(ctx, { yalnizOnayli: true })] })}
      ${B.alan({ ad: 'donem', etiket: 'Dönem', deger: deger.donem || gunAnahtari(simdi()).slice(0, 7),
      hata: hata?.alanlar?.donem, ipucu: 'YYYY-AA' })}
      ${B.alan({ ad: 'aciklama', etiket: 'Açıklama', genis: true, deger: deger.aciklama || '' })}` }],
    eylemler: B.btn('Cetveli aç', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}
    ${m && ['taslak', 'revizyon_istendi'].includes(m.durum) && yetkiVar(ctx, 'CNT-06:guncelle') ? h`
    ${B.form({
    rota: '/metraj', csrf: csrfAlani(ctx),
    bolumler: [{ baslik: 'Metraj satırı ekle', alanlar: h`
      ${ham('<input type="hidden" name="_eylem" value="satir">')}
      ${ham(`<input type="hidden" name="metrajId" value="${m.id}">`)}
      ${B.alan({ ad: 'kalemId', etiket: 'Poz', zorunlu: true,
      secenekler: [{ deger: '', etiket: 'Seçin…' }, ...pozlar] })}
      ${B.alan({ ad: 'miktar', etiket: 'Miktar', zorunlu: true })}
      ${B.alan({ ad: 'aciklama', etiket: 'Açıklama', genis: true })}` }],
    eylemler: B.btn('Satırı ekle', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  })}
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Metrajı onaya gönder</b>
        <span>Onaylanmadan hakedişe giremez.</span></div></div>
      <div class="gc-body">
        <form method="post" action="/metraj" data-gform="1">
          ${ham(csrfAlani(ctx))}
          <input type="hidden" name="_eylem" value="onaya_gonder">
          <input type="hidden" name="metrajId" value="${m.id}">
          ${B.alan({ ad: 'gerekce', etiket: 'Not', tur: 'metin' })}
          <div style="margin-top:12px">${B.btn('Onaya gönder', { tur: 'acc', gonder: true, ikon: 'fa-paper-plane' })}</div>
        </form>
      </div>
    </div>` : ''}
    ${acikOnay ? B.sonucSeridi({ tur: 'warn', baslik: 'Metraj onayı bekliyor',
    kayitRota: `/onaylar/${acikOnay.id}` }) : ''}
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/* ==========================================================================
   CNT-07..09 hakediş
   ========================================================================== */
function hakedisListesi(ctx, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('CNT-07');
  yetkiZorunlu(ctx, e.yetki);
  const { kosullar, parametreler } = filtreKosullari(ctx, {
    aramaAlanlari: ['kod', 'donem'], filtreler: [{ ad: 'durum' }, { ad: 'sozlesme_id' }],
  });
  const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
    { tablo: 'hakedis', kosullar, parametreler, sirala: 'olusturuldu DESC',
      kapsamSecenekleri: { projeSutunu: null, santiyeSutunu: null } });

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Onaylı hakediş', deger: sayi(sayac(ctx.tenant.id, 'hakedis', `durum = 'onaylandi'`)),
        ikon: 'fa-file-invoice-dollar' },
      { etiket: 'Onay bekleyen', deger: sayi(sayac(ctx.tenant.id, 'hakedis',
        `durum IN ('onaya_gonderildi','incelemede')`)), ikon: 'fa-hourglass-half' },
      { etiket: 'Onaylı net toplam', ikon: 'fa-coins', deger: para(Number(tek(
        `SELECT COALESCE(SUM(net_minor),0) AS n FROM hakedis WHERE tenant_id = ? AND durum = 'onaylandi'`,
        ctx.tenant.id)?.n ?? 0), ctx.tenant.para_birimi) },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ]),
    filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Kod veya dönem…',
      filtreler: [
        { ad: 'durum', etiket: 'Durum', secenekler: ['taslak', 'onaya_gonderildi', 'incelemede',
          'onaylandi', 'reddedildi'].map((d) => ({ deger: d, etiket: d })) },
        { ad: 'sozlesme_id', etiket: 'Sözleşme', secenekler: sozlesmeSecenekleri(ctx) },
      ] }),
    icerik: B.tablo({
      satirlar,
      satirRota: (r) => `/hakedisler/${r.id}`,
      bosDurum: { baslik: 'Hakediş yok', ikon: 'fa-file-invoice-dollar',
        aciklama: 'Hakediş, onaylı sözleşme ve onaylı metrajdan üretilir.',
        eylem: yetkiVar(ctx, 'CNT-08:olustur')
          ? B.btn('Hakediş üret', { tur: 'acc', rota: '/hakedisler/yeni', ikon: 'fa-plus' }) : null },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod', govde: (r) => h`${r.kod}<br><span class="muted">${r.no}. hakediş</span>` },
        { ad: 'sozlesme_id', etiket: 'Sözleşme', govde: (r) => {
          const s = tek('SELECT kod, ad FROM sozlesme WHERE id = ?', r.sozlesme_id);
          return h`<a href="/sozlesmeler/${r.sozlesme_id}"><b>${s?.kod || '—'}</b></a>
            <br><span class="muted">${s?.ad || ''}</span>`;
        } },
        { ad: 'donem', etiket: 'Dönem' },
        { ad: 'donem_brut_minor', etiket: 'Dönem brüt', hizala: 'sag',
          govde: (r) => para(r.donem_brut_minor, r.tutar_birim) },
        { ad: 'kesinti', etiket: 'Kesinti', hizala: 'sag', govde: (r) => para(
          Number(r.avans_mahsup_minor) + Number(r.teminat_kesinti_minor) + Number(r.stopaj_minor)
          + Number(r.diger_kesinti_minor), r.tutar_birim) },
        { ad: 'net_minor', etiket: 'Net', hizala: 'sag', govde: (r) => h`<b>${para(r.net_minor, r.tutar_birim)}</b>` },
        { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}`;
  return html(ctx, durum, ciz(ctx, e, icerik, {
    eylemler: yetkiVar(ctx, 'CNT-08:olustur')
      ? B.btn('Hakediş üret', { tur: 'acc', rota: '/hakedisler/yeni', ikon: 'fa-plus' }) : null,
  }));
}

/** CNT-08 — hakediş ÜRETİLİR: satır ve tutar girilmez, hesaplanır. */
function hakedisUret(ctx, govde) {
  const s = govde.sozlesmeId
    ? tek('SELECT * FROM sozlesme WHERE id = ? AND tenant_id = ?', govde.sozlesmeId, ctx.tenant.id) : null;
  if (!s) throw DogrulamaHatasi('Sözleşme seçin.', { alanlar: { sozlesmeId: ['Sözleşme bulunamadı.'] } });
  if (s.durum !== 'onaylandi') throw GecisIzinsiz('Hakediş yalnız ONAYLI sözleşmeden üretilir.');
  const acik = tek(
    `SELECT * FROM hakedis WHERE sozlesme_id = ? AND durum NOT IN ('onaylandi','reddedildi','iptal')`, s.id);
  if (acik) throw Cakisma(`Bu sözleşmede açık hakediş var (${acik.kod}); önce onu sonuçlandırın.`);

  const donem = String(govde.donem || gunAnahtari(simdi()).slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(donem)) {
    throw DogrulamaHatasi('Dönem YYYY-AA biçiminde olmalı.', { alanlar: { donem: ['Örn. 2026-09'] } });
  }
  const hesap = HK.hakedisHesapla(s);
  if (!hesap.satirlar.length) {
    throw GecisIzinsiz('Bu sözleşmede ödenecek yeni ONAYLI metraj yok; hakediş üretilemez.');
  }

  return islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'hakedis');
    const id = kimlik('hakedis');
    const no = Number(tek('SELECT COALESCE(MAX(no),0) AS n FROM hakedis WHERE sozlesme_id = ?', s.id)?.n ?? 0) + 1;
    calistir(`INSERT INTO hakedis (id, tenant_id, sozlesme_id, kod, no, donem, brut_minor,
                onceki_brut_minor, donem_brut_minor, avans_mahsup_minor, teminat_kesinti_minor,
                stopaj_minor, net_minor, tutar_birim, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'taslak', ?,?)`,
      id, ctx.tenant.id, s.id, kod, no, donem, String(hesap.brut), String(hesap.oncekiBrut),
      String(hesap.donemBrut), String(hesap.kesintiler.avansMahsup),
      String(hesap.kesintiler.teminatKesinti), String(hesap.kesintiler.stopaj),
      String(hesap.net), s.tutar_birim, ctx.kullanici.id, simdi());
    for (const r of hesap.satirlar) {
      calistir(`INSERT INTO hakedis_satiri (id, hakedis_id, sozlesme_kalemi_id, kumulatif_binde,
                  onceki_binde, donem_binde, birim_fiyat_minor, donem_tutar_minor)
                VALUES (?,?,?,?,?,?,?,?)`,
        kimlik('satir'), id, r.sozlesmeKalemiId, r.kumulatifBinde, r.oncekiBinde, r.donemBinde,
        String(r.birimFiyatMinor), String(r.donemTutarMinor));
    }
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'hakedis', nesneId: id, eylem: 'uretildi',
      sonraki: { kod, no, donem, satir: hesap.satirlar.length,
        donemBrutMinor: hesap.donemBrut, netMinor: hesap.net } });
    return { id, kod };
  });
}

function hakedisSihirbazi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('CNT-08');
  yetkiZorunlu(ctx, e.yetki);
  const sozlesmeId = deger.sozlesmeId || ctx.sorgu.get('sozlesmeId') || '';
  const s = sozlesmeId
    ? tek('SELECT * FROM sozlesme WHERE id = ? AND tenant_id = ?', sozlesmeId, ctx.tenant.id) : null;
  const hesap = s && s.durum === 'onaylandi' ? HK.hakedisHesapla(s) : null;

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${s && s.durum !== 'onaylandi' ? B.sonucSeridi({ tur: 'warn', baslik: 'Sözleşme onaylı değil',
    aciklama: 'Hakediş yalnız onaylı sözleşmeden üretilir.' }) : ''}
${hesap && hesap.uyarilar.length ? B.sonucSeridi({ tur: 'warn', baslik: 'Sözleşme aşımı uyarısı',
    aciklama: hesap.uyarilar.join(' · ') }) : ''}
<form method="post" action="/hakedisler/yeni" data-gform="1">
  ${ham(csrfAlani(ctx))}
  <input type="hidden" name="_idempotency" value="${kimlik('idempotency')}">
  <div class="form-grid">
    <div class="gform-main">
      <section class="gv-card gform-sec">
        <div class="gc-head"><div class="gc-title"><b>Hakediş üretimi</b>
          <span>Satırlar ve tutarlar HESAPLANIR; bu formda tutar alanı yoktur.</span></div></div>
        <div class="gc-body"><div class="gform-alanlar">
          ${B.alan({ ad: 'sozlesmeId', etiket: 'Sözleşme', zorunlu: true, deger: sozlesmeId,
    hata: hata?.alanlar?.sozlesmeId,
    secenekler: [{ deger: '', etiket: 'Seçin…' }, ...sozlesmeSecenekleri(ctx, { yalnizOnayli: true })] })}
          ${B.alan({ ad: 'donem', etiket: 'Dönem', deger: deger.donem || gunAnahtari(simdi()).slice(0, 7),
    hata: hata?.alanlar?.donem, ipucu: 'YYYY-AA' })}
        </div></div>
      </section>
    </div>
    <aside class="gform-side"><div class="gv-card"><div class="gc-body">
      <div class="gv-cap-sm">Üretim kuralı</div>
      <p style="margin-top:10px;font-size:12.5px;line-height:1.7;color:var(--muted)">
        Her poz için <b>onaylı metrajların kümülatif toplamı</b> alınır, önceki hakedişlerde
        ödenen miktar düşülür; kalan dönem miktarıdır. Kesintiler sözleşme oranlarından
        hesaplanır. Aynı metraj iki kez ödenemez.</p>
    </div></div></aside>
  </div>
  <div class="form-foot">
    ${B.btn('Vazgeç', { rota: '/hakedisler' })}
    ${B.btn('Önizlemeyi yenile', { gonder: false, ikon: 'fa-rotate' })}
    ${hesap && hesap.satirlar.length
    ? B.btn('Hakedişi üret', { tur: 'acc', gonder: true, ikon: 'fa-file-invoice-dollar' }) : ''}
  </div>
</form>
${s && sozlesmeId ? h`<div style="margin-top:8px">
  ${B.btn('Bu sözleşme için önizle', { rota: `/hakedisler/yeni?sozlesmeId=${sozlesmeId}`, kucuk: true })}
</div>` : ''}
${hesap ? h`
<div class="gv-card" style="margin-top:18px">
  <div class="gc-head"><div class="gc-title"><b>Önizleme — ${s.kod}</b>
    <span>${hesap.satirlar.length
    ? `${hesap.satirlar.length} pozda ödenecek yeni metraj var.`
    : 'Ödenecek yeni onaylı metraj yok.'}</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: hesap.satirlar,
    bosDurum: { baslik: 'Ödenecek metraj yok', ikon: 'fa-ruler',
      aciklama: 'Önce metraj cetveli açıp onaylatın.' },
    sutunlar: [
      { ad: 'pozNo', etiket: 'Poz', govde: (r) => h`<b>${r.pozNo}</b><br><span class="muted">${r.tanim}</span>` },
      { ad: 'kumulatifBinde', etiket: 'Onaylı kümülatif', hizala: 'sag',
        govde: (r) => h`${miktarMetni(r.kumulatifBinde)} ${r.birim}` },
      { ad: 'oncekiBinde', etiket: 'Önceki hakediş', hizala: 'sag',
        govde: (r) => miktarMetni(r.oncekiBinde) },
      { ad: 'donemBinde', etiket: 'Bu dönem', hizala: 'sag',
        govde: (r) => h`<b>${miktarMetni(r.donemBinde)}</b>` },
      { ad: 'birimFiyatMinor', etiket: 'Birim fiyat', hizala: 'sag',
        govde: (r) => para(r.birimFiyatMinor, s.tutar_birim) },
      { ad: 'donemTutarMinor', etiket: 'Tutar', hizala: 'sag',
        govde: (r) => para(r.donemTutarMinor, s.tutar_birim) },
    ],
  })}</div>
  <div class="gc-body">
    ${kesintiTablosu(hesap, s)}
  </div>
</div>` : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

function kesintiTablosu(hesap, s) {
  return B.tablo({
    satirlar: [
      { ad: 'Dönem brüt', tutar: hesap.donemBrut, formul: 'Σ(dönem miktarı × birim fiyat)' },
      { ad: 'Avans mahsubu', tutar: -hesap.kesintiler.avansMahsup,
        formul: `dönem brüt × ${oranMetni(s.avans_orani_binde)} (kalan avansla sınırlı)` },
      { ad: 'Teminat kesintisi', tutar: -hesap.kesintiler.teminatKesinti,
        formul: `dönem brüt × ${oranMetni(s.teminat_orani_binde)}` },
      { ad: 'Stopaj', tutar: -hesap.kesintiler.stopaj,
        formul: `dönem brüt × ${oranMetni(s.stopaj_orani_binde)}` },
      { ad: 'NET ÖDENECEK', tutar: hesap.net, formul: 'dönem brüt − kesintiler', vurgu: true },
    ],
    bosDurum: { baslik: 'Hesap yok' },
    sutunlar: [
      { ad: 'ad', etiket: 'Kalem', govde: (r) => (r.vurgu ? h`<b>${r.ad}</b>` : r.ad) },
      { ad: 'formul', etiket: 'Formül', govde: (r) => h`<code>${r.formul}</code>` },
      { ad: 'tutar', etiket: 'Tutar', hizala: 'sag',
        govde: (r) => (r.vurgu ? h`<b>${para(r.tutar, s.tutar_birim)}</b>` : para(r.tutar, s.tutar_birim)) },
    ],
  });
}

function hakedisIslemi(ctx, hk, govde) {
  const s = tek('SELECT * FROM sozlesme WHERE id = ?', hk.sozlesme_id);
  if (govde._eylem === 'onaya_gonder') {
    if (!['taslak', 'revizyon_istendi'].includes(hk.durum)) {
      throw GecisIzinsiz('Yalnız taslak veya revizyon istenen hakediş onaya gönderilebilir.');
    }
    islem(() => {
      onayMotoru.onayaGonder(ctx, {
        nesne: 'hakedis', nesneId: hk.id, nesneKod: hk.kod,
        baslik: `Hakediş ${hk.no}: ${s.ad} (${hk.donem})`, belgeSurum: hk.surum,
        tutarMinor: Number(hk.net_minor), tutarBirim: hk.tutar_birim,
        projeId: s.proje_id, santiyeId: s.santiye_id, gerekce: govde.gerekce || null,
      });
      gecisYap(ctx, { nesne: 'hakedis', tablo: 'hakedis', kayit: hk, eylem: 'onaya_gonder',
        gerekce: govde.gerekce, ekranKodu: 'CNT-09' });
    });
    return 'Hakediş onaya gönderildi';
  }
  if (govde._eylem === 'yeniden_hesapla') {
    if (!['taslak', 'revizyon_istendi'].includes(hk.durum)) {
      throw GecisIzinsiz('Onaydaki veya onaylı hakediş yeniden hesaplanamaz (kural 6).');
    }
    islem(() => {
      const hesap = HK.hakedisHesapla(s, { harictekiHakedisId: hk.id });
      calistir('DELETE FROM hakedis_satiri WHERE hakedis_id = ?', hk.id);
      for (const r of hesap.satirlar) {
        calistir(`INSERT INTO hakedis_satiri (id, hakedis_id, sozlesme_kalemi_id, kumulatif_binde,
                    onceki_binde, donem_binde, birim_fiyat_minor, donem_tutar_minor)
                  VALUES (?,?,?,?,?,?,?,?)`,
          kimlik('satir'), hk.id, r.sozlesmeKalemiId, r.kumulatifBinde, r.oncekiBinde,
          r.donemBinde, String(r.birimFiyatMinor), String(r.donemTutarMinor));
      }
      surumluGuncelle('hakedis', hk.id, hk.surum, {
        brut_minor: String(hesap.brut), onceki_brut_minor: String(hesap.oncekiBrut),
        donem_brut_minor: String(hesap.donemBrut),
        avans_mahsup_minor: String(hesap.kesintiler.avansMahsup),
        teminat_kesinti_minor: String(hesap.kesintiler.teminatKesinti),
        stopaj_minor: String(hesap.kesintiler.stopaj), net_minor: String(hesap.net),
      }, { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'hakedis', nesneId: hk.id, eylem: 'yeniden_hesaplandi',
        onceki: { netMinor: hk.net_minor }, sonraki: { netMinor: hesap.net } });
    });
    return 'Hakediş onaylı metrajlara göre yeniden hesaplandı';
  }
  if (['geri_cek', 'iptal_et'].includes(govde._eylem)) {
    gecisYap(ctx, { nesne: 'hakedis', tablo: 'hakedis', kayit: hk, eylem: govde._eylem,
      gerekce: govde.gerekce, ekranKodu: 'CNT-09' });
    return 'Hakediş durumu güncellendi';
  }
  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

function hakedisDetayi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('CNT-09');
  yetkiZorunlu(ctx, e.yetki);
  const hk = kaydiAl(ctx, 'hakedis', 'hakedis', id);
  const s = tek('SELECT * FROM sozlesme WHERE id = ?', hk.sozlesme_id);
  const satirlar = sorgu(
    `SELECT hs.*, k.poz_no, k.tanim, k.birim FROM hakedis_satiri hs
       JOIN sozlesme_kalemi k ON k.id = hs.sozlesme_kalemi_id
      WHERE hs.hakedis_id = ? ORDER BY k.sira`, hk.id);
  const acikOnay = tek(
    `SELECT id FROM onay_talebi WHERE nesne = 'hakedis' AND nesne_id = ? AND durum = 'acik'`, hk.id);
  const duzenlenebilir = ['taslak', 'revizyon_istendi'].includes(hk.durum);
  const hesap = {
    donemBrut: Number(hk.donem_brut_minor), net: Number(hk.net_minor),
    kesintiler: { avansMahsup: Number(hk.avans_mahsup_minor),
      teminatKesinti: Number(hk.teminat_kesinti_minor), stopaj: Number(hk.stopaj_minor) },
  };

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: 'Hakediş üretildi',
    aciklama: 'Satırlar onaylı metrajdan, kesintiler sözleşme oranlarından hesaplandı.' }) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.detayOzetSeridi({
    kod: hk.kod, baslik: `${hk.no}. hakediş — ${s?.ad || ''} (${hk.donem})`, durum: hk.durum, surum: hk.surum,
    bilgiler: [
      { etiket: 'Sözleşme', deger: h`<a href="/sozlesmeler/${hk.sozlesme_id}">${s?.kod || '—'}</a>` },
      { etiket: 'Dönem brüt', deger: para(hk.donem_brut_minor, hk.tutar_birim) },
      { etiket: 'Kümülatif brüt', deger: para(hk.brut_minor, hk.tutar_birim) },
      { etiket: 'Net ödenecek', deger: para(hk.net_minor, hk.tutar_birim) },
      { etiket: 'Sözleşme bedeli', deger: para(HK.guncelBedel(hk.sozlesme_id), hk.tutar_birim) },
    ],
    birincilEylem: B.btn('Hakediş listesi', { rota: '/hakedisler' }),
  })}
${acikOnay ? B.sonucSeridi({ tur: 'warn', baslik: 'Onay süreci açık',
    aciklama: 'Karar verilene kadar hakediş yeniden hesaplanamaz.',
    kayitRota: `/onaylar/${acikOnay.id}` }) : ''}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Hakediş satırları</b>
        <span>Miktarlar ONAYLI metrajdan; hiçbir satır elle eklenmez.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar,
    bosDurum: { baslik: 'Satır yok' },
    sutunlar: [
      { ad: 'poz_no', etiket: 'Poz', govde: (r) => h`<b>${r.poz_no}</b><br><span class="muted">${r.tanim}</span>` },
      { ad: 'kumulatif_binde', etiket: 'Kümülatif', hizala: 'sag',
        govde: (r) => h`${miktarMetni(r.kumulatif_binde)} ${r.birim}` },
      { ad: 'onceki_binde', etiket: 'Önceki', hizala: 'sag', govde: (r) => miktarMetni(r.onceki_binde) },
      { ad: 'donem_binde', etiket: 'Bu dönem', hizala: 'sag',
        govde: (r) => h`<b>${miktarMetni(r.donem_binde)}</b>` },
      { ad: 'birim_fiyat_minor', etiket: 'Birim fiyat', hizala: 'sag',
        govde: (r) => para(r.birim_fiyat_minor, hk.tutar_birim) },
      { ad: 'donem_tutar_minor', etiket: 'Tutar', hizala: 'sag',
        govde: (r) => para(r.donem_tutar_minor, hk.tutar_birim) },
    ],
  })}</div>
    </div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Kesinti icmali</b>
        <span>Her kalem formülüyle birlikte; hiçbiri elle yazılmaz (kural 9 ilkesi).</span></div></div>
      <div class="gc-body flush">${s ? kesintiTablosu(hesap, s) : ''}</div>
    </div>
    ${gecmisKarti('hakedis', hk)}
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Durum işlemleri</b></div></div>
      <div class="gc-body">
        ${yetkiVar(ctx, 'CNT-09:guncelle') ? h`
        <form method="post" action="/hakedisler/${hk.id}" data-gform="1">
          ${ham(csrfAlani(ctx))}
          ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe / not', tur: 'metin' })}
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
            ${duzenlenebilir
    ? h`<button class="btn btn-ghost" type="submit" name="_eylem" value="yeniden_hesapla">
        Onaylı metrajlara göre yeniden hesapla</button>` : ''}
            ${duzenlenebilir && !acikOnay
    ? h`<button class="btn btn-acc" type="submit" name="_eylem" value="onaya_gonder">
        Onaya gönder</button>` : ''}
            ${hk.durum === 'onaya_gonderildi'
    ? h`<button class="btn btn-ghost" type="submit" name="_eylem" value="geri_cek">
        Onaydan geri çek</button>` : ''}
            ${duzenlenebilir
    ? h`<button class="btn btn-danger" type="submit" name="_eylem" value="iptal_et">İptal et</button>` : ''}
            ${hk.durum === 'onaylandi'
    ? h`<p class="gf-hint">Hakediş onaylandı; satır ve tutarlar değişmez. Ödeme,
        <a href="/odemeler">ödeme talebi</a> ile yürür.</p>` : ''}
          </div>
        </form>` : ''}
      </div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: hk.kod, baslik: `${hk.no}. hakediş` }));
}

/** Onay motoru geri çağrısı — sözleşme, zeyil, metraj ve hakediş. */
export function sozlesmeOnaySonucu(ctx, nesne, nesneId, sonuc) {
  const tablo = { sozlesme: 'sozlesme', zeyil: 'zeyil', metraj: 'metraj', hakedis: 'hakedis' }[nesne];
  if (!tablo) return;
  const k = tek(`SELECT * FROM ${tablo} WHERE id = ?`, nesneId);
  if (!k) return;
  const eylem = { onaylandi: 'onayla', reddedildi: 'reddet', revizyon_istendi: 'revizyon_iste' }[sonuc];
  if (!eylem) return;
  if (k.durum === 'onaya_gonderildi') {
    gecisYap(ctx, { nesne, tablo, kayit: k, eylem: 'incelemeye_al', motor: true });
  }
  const guncel = tek(`SELECT * FROM ${tablo} WHERE id = ?`, nesneId);
  if (guncel.durum !== 'incelemede') return;
  gecisYap(ctx, { nesne, tablo, kayit: guncel, eylem, gerekce: `Onay talebi sonucu: ${sonuc}`, motor: true });

  /* Onaylı zeyil sözleşmenin süresini uzatır — güncel bedel zaten türetilir. */
  if (nesne === 'zeyil' && sonuc === 'onaylandi' && guncel.sure_farki_gun) {
    const s = tek('SELECT * FROM sozlesme WHERE id = ?', guncel.sozlesme_id);
    if (s?.bitis) {
      calistir('UPDATE sozlesme SET bitis = ?, surum = surum + 1 WHERE id = ?',
        s.bitis + guncel.sure_farki_gun * 86_400_000, s.id);
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'sozlesme', nesneId: s.id, eylem: 'zeyille_sure_uzatildi',
        gerekce: `${guncel.kod} zeyili onaylandı`,
        onceki: { bitis: s.bitis }, sonraki: { bitis: s.bitis + guncel.sure_farki_gun * 86_400_000 } });
    }
  }
}
