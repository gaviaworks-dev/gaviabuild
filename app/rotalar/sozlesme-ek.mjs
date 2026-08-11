/* ============================================================================
   DEĞİŞİKLİK, GECİKME, SÜRE UZATIMI VE CLAIM — CNT-10..15
   ----------------------------------------------------------------------------
   §7 zorunlu bağ: "RFI yanıtı kapsam etkiliyor → değişiklik talebi ve iş programı".
   Değişiklik emri ONAYLANDIĞINDA sözleşmede otomatik ZEYİL taslağı açar; süre
   uzatımı kabul edilen GECİKME OLAYLARINA dayanmak zorundadır.
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, gunAnahtari, gunBaslangici, GUN_MS } from '../cekirdek/zaman.mjs';
import { Para } from '../cekirdek/para.mjs';
import { DogrulamaHatasi, GecisIzinsiz, Bulunamadi, Cakisma, UygulamaHatasi } from '../cekirdek/hata.mjs';
import * as onayMotoru from '../moduller/isakisi/onay.mjs';
import { santiyeSecenekleri, projeSecenekleri, sayac, gecmisKarti } from './kayit-modulu.mjs';
import {
  ekranNesnesi, hataNesnesi, kullaniciAdi, ciz, kaydiAl, listeSorgusu, filtreKosullari,
  B, h, ham, sayi, csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar,
  sorgu, tek, calistir, islem, surumluGuncelle, audit, sonrakiKod, gecisYap,
} from './ortak.mjs';

const para = (minor, birim = 'TRY') => (minor == null ? '—' : Para.minor(minor, birim || 'TRY').bicim());
const GECIKME_TURLERI = [
  { deger: 'hava', etiket: 'Hava koşulu' }, { deger: 'isveren', etiket: 'İşveren kaynaklı' },
  { deger: 'taseron', etiket: 'Taşeron kaynaklı' }, { deger: 'malzeme', etiket: 'Malzeme temini' },
  { deger: 'ruhsat', etiket: 'Ruhsat/izin' }, { deger: 'mucbir', etiket: 'Mücbir sebep' },
  { deger: 'diger', etiket: 'Diğer' },
];
const SORUMLULUK = [
  { deger: 'isveren', etiket: 'İşveren' }, { deger: 'yuklenici', etiket: 'Yüklenici' },
  { deger: 'ucuncu_taraf', etiket: 'Üçüncü taraf' }, { deger: 'mucbir', etiket: 'Mücbir sebep' },
];
const CLAIM_TURLERI = [
  { deger: 'maliyet', etiket: 'Maliyet' }, { deger: 'sure', etiket: 'Süre' },
  { deger: 'karma', etiket: 'Karma' },
];
const sozlesmeSecenekleri = (ctx) => sorgu(
  `SELECT id, kod, ad FROM sozlesme WHERE tenant_id = ? AND durum = 'onaylandi' ORDER BY kod DESC LIMIT 200`,
  ctx.tenant.id).map((s) => ({ deger: s.id, etiket: `${s.kod} — ${s.ad}` }));

export function kur(y, ekranRota) {
  /* ================= CNT-10..12 Değişiklik ============================= */
  ekranRota(y, 'CNT-10', { get: (ctx) => degisiklikListesi(ctx) });

  ekranRota(y, 'CNT-11', {
    get: (ctx) => html(ctx, 200, ciz(ctx, ekranNesnesi('CNT-11'), degisiklikFormu(ctx, {}))),
    post: (ctx, govde) => {
      const e = ekranNesnesi('CNT-11');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const sonuc = degisiklikAc(ctx, govde);
        return yonlendir(ctx, `/degisiklikler/${sonuc.id}?olusan=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, ciz(ctx, e, degisiklikFormu(ctx, { deger: govde, hata: hataNesnesi(err) })));
      }
    },
  });

  ekranRota(y, 'CNT-12', {
    get: (ctx, _g, params) => degisiklikDetayi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('CNT-12');
      yetkiZorunlu(ctx, `${e.kod}:karar_ver`);
      csrfZorunlu(ctx, govde);
      const d = kaydiAl(ctx, 'degisiklik', 'degisiklik', params.id);
      try {
        const mesaj = degisiklikIslemi(ctx, d, govde);
        return yonlendir(ctx, `/degisiklikler/${d.id}?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return degisiklikDetayi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ================= CNT-13 Gecikme olayları =========================== */
  ekranRota(y, 'CNT-13', {
    get: (ctx) => gecikmeSayfasi(ctx),
    post: (ctx, govde) => {
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = govde._eylem === 'gecis' ? gecikmeGecisi(ctx, govde) : gecikmeAc(ctx, govde);
        return yonlendir(ctx, `/gecikme-olaylari?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return gecikmeSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= CNT-14 Süre uzatımı =============================== */
  ekranRota(y, 'CNT-14', {
    get: (ctx) => sureUzatimSayfasi(ctx),
    post: (ctx, govde) => {
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = sureUzatimIslemi(ctx, govde);
        const p = new URLSearchParams({ islem: mesaj });
        if (govde.uzatimId) p.set('uzatim_id', govde.uzatimId);
        return yonlendir(ctx, `/sure-uzatim?${p.toString()}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return sureUzatimSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= CNT-15 Claim ====================================== */
  ekranRota(y, 'CNT-15', {
    get: (ctx) => claimSayfasi(ctx),
    post: (ctx, govde) => {
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = govde._eylem === 'gecis' ? claimGecisi(ctx, govde) : claimAc(ctx, govde);
        return yonlendir(ctx, `/claimler?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return claimSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });
}

/* ==========================================================================
   CNT-10..12
   ========================================================================== */
function degisiklikListesi(ctx, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('CNT-10');
  yetkiZorunlu(ctx, e.yetki);
  const { kosullar, parametreler } = filtreKosullari(ctx, {
    aramaAlanlari: ['baslik', 'kod'], filtreler: [{ ad: 'durum' }, { ad: 'sozlesme_id' }, { ad: 'proje_id' }],
  });
  const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
    { tablo: 'degisiklik', kosullar, parametreler, sirala: 'olusturuldu DESC' });

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Açık değişiklik', deger: sayi(sayac(ctx.tenant.id, 'degisiklik',
        `durum NOT IN ('onaylandi','reddedildi','iptal')`)), ikon: 'fa-code-branch' },
      { etiket: 'Onaylı', deger: sayi(sayac(ctx.tenant.id, 'degisiklik', `durum = 'onaylandi'`)),
        ikon: 'fa-circle-check' },
      { etiket: 'Onaylı tutar etkisi', ikon: 'fa-coins', deger: para(Number(tek(
        `SELECT COALESCE(SUM(tutar_etkisi_minor),0) AS n FROM degisiklik
          WHERE tenant_id = ? AND durum = 'onaylandi'`, ctx.tenant.id)?.n ?? 0), ctx.tenant.para_birimi) },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ]),
    filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Başlık veya kod…',
      filtreler: [
        { ad: 'durum', etiket: 'Durum', secenekler: ['taslak', 'onaya_gonderildi', 'incelemede',
          'onaylandi', 'reddedildi'].map((d) => ({ deger: d, etiket: d })) },
        { ad: 'sozlesme_id', etiket: 'Sözleşme', secenekler: sozlesmeSecenekleri(ctx) },
      ] }),
    icerik: B.tablo({
      satirlar,
      satirRota: (r) => `/degisiklikler/${r.id}`,
      bosDurum: { baslik: 'Değişiklik talebi yok', ikon: 'fa-code-branch',
        aciklama: 'Kapsam etkili RFI yanıtları ve saha talepleri buraya düşer (§7).',
        eylem: yetkiVar(ctx, 'CNT-11:olustur')
          ? B.btn('Yeni değişiklik', { tur: 'acc', rota: '/degisiklikler/yeni', ikon: 'fa-plus' }) : null },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'baslik', etiket: 'Değişiklik', govde: (r) => h`<a href="/degisiklikler/${r.id}"><b>${r.baslik}</b></a>${
          r.kaynak_nesne ? h`<br><span class="muted">kaynak: ${r.kaynak_nesne}</span>` : ''}` },
        { ad: 'sozlesme_id', etiket: 'Sözleşme', govde: (r) => (r.sozlesme_id
          ? h`<a href="/sozlesmeler/${r.sozlesme_id}">${
            tek('SELECT kod FROM sozlesme WHERE id = ?', r.sozlesme_id)?.kod || '—'}</a>` : '—') },
        { ad: 'tutar_etkisi_minor', etiket: 'Tutar etkisi', hizala: 'sag',
          govde: (r) => (Number(r.tutar_etkisi_minor)
            ? para(r.tutar_etkisi_minor, r.tutar_birim) : '—') },
        { ad: 'sure_etkisi_gun', etiket: 'Süre etkisi', hizala: 'sag',
          govde: (r) => (r.sure_etkisi_gun ? `${r.sure_etkisi_gun} gün` : '—') },
        { ad: 'zeyil_id', etiket: 'Zeyil', govde: (r) => (r.zeyil_id
          ? B.isaret(tek('SELECT kod FROM zeyil WHERE id = ?', r.zeyil_id)?.kod || 'açıldı', 'ok')
          : (r.durum === 'onaylandi' ? B.isaret('bekliyor', 'warn') : '—')) },
        { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}`;
  return html(ctx, durum, ciz(ctx, e, icerik, {
    eylemler: yetkiVar(ctx, 'CNT-11:olustur')
      ? B.btn('Yeni değişiklik', { tur: 'acc', rota: '/degisiklikler/yeni', ikon: 'fa-plus' }) : null,
  }));
}

function degisiklikAc(ctx, govde) {
  const baslik = String(govde.baslik || '').trim();
  if (!baslik) throw DogrulamaHatasi('Başlık zorunludur.', { alanlar: { baslik: ['Başlık girin.'] } });
  const s = govde.sozlesmeId
    ? tek('SELECT * FROM sozlesme WHERE id = ? AND tenant_id = ?', govde.sozlesmeId, ctx.tenant.id) : null;
  let tutar = 0;
  if (govde.tutarEtkisi) {
    const ham = String(govde.tutarEtkisi).trim();
    try { tutar = Number(Para.ayristir(ham.replace('-', ''), s?.tutar_birim || ctx.tenant.para_birimi).minor); }
    catch { throw DogrulamaHatasi('Geçersiz tutar etkisi.', { alanlar: { tutarEtkisi: ['Tutar girin.'] } }); }
    if (ham.startsWith('-')) tutar = -tutar;
  }
  const sure = govde.sureEtkisi ? Number(govde.sureEtkisi) : 0;
  if (!Number.isInteger(sure) || Math.abs(sure) > 3650) {
    throw DogrulamaHatasi('Süre etkisi ±3650 gün aralığında olmalı.', { alanlar: { sureEtkisi: ['Geçersiz gün.'] } });
  }
  if (tutar === 0 && sure === 0 && !String(govde.kapsamEtkisi || '').trim()) {
    throw DogrulamaHatasi('Değişiklik tutar, süre veya kapsam etkisi taşımalıdır.',
      { alanlar: { tutarEtkisi: ['Bir etki girin.'] } });
  }
  const santiye = govde.santiyeId
    ? tek('SELECT * FROM santiye WHERE id = ? AND tenant_id = ?', govde.santiyeId, ctx.tenant.id) : null;

  return islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'degisiklik');
    const id = kimlik('degisiklik');
    calistir(`INSERT INTO degisiklik (id, tenant_id, kod, baslik, aciklama, proje_id, santiye_id,
                sozlesme_id, kaynak_nesne, kaynak_id, tutar_etkisi_minor, tutar_birim,
                sure_etkisi_gun, kapsam_etkisi, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'taslak', ?,?)`,
      id, ctx.tenant.id, kod, baslik, govde.aciklama || null,
      s?.proje_id || santiye?.proje_id || govde.projeId || null, santiye?.id || s?.santiye_id || null,
      s?.id || null, govde.kaynakNesne || null, govde.kaynakId || null,
      String(tutar), s?.tutar_birim || ctx.tenant.para_birimi, sure,
      govde.kapsamEtkisi || null, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'degisiklik', nesneId: id, eylem: 'olustur',
      sonraki: { kod, baslik, tutarEtkisi: tutar, sureEtkisi: sure } });
    return { id, kod };
  });
}

function degisiklikFormu(ctx, { deger = {}, hata = null }) {
  const e = ekranNesnesi('CNT-11');
  /* §7 bağı: kapsam etkili RFI yanıtları burada kaynak olarak seçilebilir. */
  const rfiler = sorgu(
    `SELECT id, kod, baslik FROM rfi WHERE tenant_id = ? AND degisiklik_tetikledi = 1
      ORDER BY olusturuldu DESC LIMIT 50`, ctx.tenant.id);
  const kaynakId = deger.kaynakId || ctx.sorgu.get('rfiId') || '';

  return B.form({
    rota: e.rota, csrf: csrfAlani(ctx), idempotencyAnahtari: kimlik('idempotency'), hatalar: hata,
    bolumler: [
      { baslik: 'Değişiklik talebi',
        aciklama: 'Talep TASLAK açılır. Onaylandığında sözleşmede otomatik ZEYİL taslağı oluşur.',
        alanlar: h`
          ${B.alan({ ad: 'baslik', etiket: 'Başlık', zorunlu: true, genis: true,
            deger: deger.baslik || '', hata: hata?.alanlar?.baslik })}
          ${B.alan({ ad: 'sozlesmeId', etiket: 'Sözleşme', deger: deger.sozlesmeId || '',
            secenekler: [{ deger: '', etiket: 'Sözleşmesiz (yalnız kapsam)' }, ...sozlesmeSecenekleri(ctx)] })}
          ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye', deger: deger.santiyeId || '',
            secenekler: [{ deger: '', etiket: 'Seçin…' }, ...santiyeSecenekleri(ctx)] })}
          ${rfiler.length ? h`
          ${B.alan({ ad: 'kaynakId', etiket: 'Kaynak RFI (§7 bağı)', deger: kaynakId,
            secenekler: [{ deger: '', etiket: 'Kaynak yok' },
              ...rfiler.map((r) => ({ deger: r.id, etiket: `${r.kod} — ${r.baslik}` }))] })}
          ${ham('<input type="hidden" name="kaynakNesne" value="rfi">')}` : ''}
          ${B.alan({ ad: 'aciklama', etiket: 'Açıklama', tur: 'metin', genis: true,
            deger: deger.aciklama || '' })}` },
      { baslik: 'Etki',
        aciklama: 'Eksi tutar için başına "-" koyun. Onaylanan etki, sözleşmeye zeyille yansır.',
        alanlar: h`
          ${B.alan({ ad: 'tutarEtkisi', etiket: 'Tutar etkisi', deger: deger.tutarEtkisi || '',
            hata: hata?.alanlar?.tutarEtkisi, ipucu: 'Örn. 85.000,00 veya -20.000,00' })}
          ${B.alan({ ad: 'sureEtkisi', etiket: 'Süre etkisi (gün)', tur: 'number',
            deger: deger.sureEtkisi || '0', hata: hata?.alanlar?.sureEtkisi })}
          ${B.alan({ ad: 'kapsamEtkisi', etiket: 'Kapsam etkisi', tur: 'metin', genis: true,
            deger: deger.kapsamEtkisi || '' })}` },
    ],
    eylemler: h`${B.btn('Vazgeç', { rota: '/degisiklikler' })}
      ${B.btn('Kaydet ve detaya git', { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' })}`,
  });
}

function degisiklikIslemi(ctx, d, govde) {
  if (govde._eylem === 'onaya_gonder') {
    if (!['taslak', 'revizyon_istendi'].includes(d.durum)) {
      throw GecisIzinsiz('Yalnız taslak veya revizyon istenen değişiklik onaya gönderilebilir.');
    }
    islem(() => {
      onayMotoru.onayaGonder(ctx, {
        nesne: 'degisiklik', nesneId: d.id, nesneKod: d.kod, baslik: `Değişiklik emri: ${d.baslik}`,
        belgeSurum: d.surum, tutarMinor: Math.abs(Number(d.tutar_etkisi_minor)), tutarBirim: d.tutar_birim,
        projeId: d.proje_id, santiyeId: d.santiye_id, gerekce: govde.gerekce || null,
      });
      gecisYap(ctx, { nesne: 'degisiklik', tablo: 'degisiklik', kayit: d, eylem: 'onaya_gonder',
        gerekce: govde.gerekce, ekranKodu: 'CNT-12' });
    });
    return 'Değişiklik onaya gönderildi';
  }
  if (['geri_cek', 'iptal_et'].includes(govde._eylem)) {
    gecisYap(ctx, { nesne: 'degisiklik', tablo: 'degisiklik', kayit: d, eylem: govde._eylem,
      gerekce: govde.gerekce, ekranKodu: 'CNT-12' });
    return 'Değişiklik durumu güncellendi';
  }
  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

function degisiklikDetayi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('CNT-12');
  yetkiZorunlu(ctx, e.yetki);
  const d = kaydiAl(ctx, 'degisiklik', 'degisiklik', id);
  const s = d.sozlesme_id ? tek('SELECT * FROM sozlesme WHERE id = ?', d.sozlesme_id) : null;
  const zeyil = d.zeyil_id ? tek('SELECT * FROM zeyil WHERE id = ?', d.zeyil_id) : null;
  const kaynak = d.kaynak_nesne === 'rfi' && d.kaynak_id
    ? tek('SELECT kod, baslik FROM rfi WHERE id = ?', d.kaynak_id) : null;
  const acikOnay = tek(
    `SELECT id FROM onay_talebi WHERE nesne = 'degisiklik' AND nesne_id = ? AND durum = 'acik'`, d.id);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: 'Değişiklik talebi açıldı' }) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.detayOzetSeridi({
    kod: d.kod, baslik: d.baslik, durum: d.durum, surum: d.surum,
    bilgiler: [
      { etiket: 'Sözleşme', deger: s ? h`<a href="/sozlesmeler/${s.id}">${s.kod}</a>` : '—' },
      { etiket: 'Tutar etkisi', deger: Number(d.tutar_etkisi_minor)
        ? para(d.tutar_etkisi_minor, d.tutar_birim) : '—' },
      { etiket: 'Süre etkisi', deger: d.sure_etkisi_gun ? `${d.sure_etkisi_gun} gün` : '—' },
      { etiket: 'Kaynak', deger: kaynak
        ? h`<a href="/teknik/rfi/${d.kaynak_id}">${kaynak.kod}</a>` : (d.kaynak_nesne || '—') },
      { etiket: 'Zeyil', deger: zeyil
        ? h`<a href="/sozlesmeler/${d.sozlesme_id}/zeyiller">${zeyil.kod}</a> (${zeyil.durum})` : '—' },
    ],
    birincilEylem: B.btn('Değişiklik listesi', { rota: '/degisiklikler' }),
  })}
${acikOnay ? B.sonucSeridi({ tur: 'warn', baslik: 'Onay süreci açık',
    kayitRota: `/onaylar/${acikOnay.id}` }) : ''}
${d.durum === 'onaylandi' && !zeyil && !d.sozlesme_id
    ? B.sonucSeridi({ tur: 'warn', baslik: 'Sözleşmesiz değişiklik',
      aciklama: 'Sözleşmeye bağlı olmadığı için zeyil açılmadı; yalnız kapsam etkisi kayıtlıdır.' }) : ''}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Açıklama ve kapsam etkisi</b></div></div>
      <div class="gc-body">
        <p style="font-size:13.5px;line-height:1.7;white-space:pre-wrap">${d.aciklama || '—'}</p>
        ${d.kapsam_etkisi ? h`<dl class="gd-grid" style="margin-top:12px">
          <div><dt>Kapsam etkisi</dt><dd>${d.kapsam_etkisi}</dd></div></dl>` : ''}
      </div>
    </div>
    ${gecmisKarti('degisiklik', d)}
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Karar</b>
        <span>Onaylanan değişiklik, sözleşmede otomatik zeyil taslağı açar.</span></div></div>
      <div class="gc-body">
        ${yetkiVar(ctx, 'CNT-12:karar_ver') ? h`
        <form method="post" action="/degisiklikler/${d.id}" data-gform="1">
          ${ham(csrfAlani(ctx))}
          ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe / not', tur: 'metin' })}
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
            ${['taslak', 'revizyon_istendi'].includes(d.durum) && !acikOnay
    ? h`<button class="btn btn-acc" type="submit" name="_eylem" value="onaya_gonder">
        Onaya gönder</button>` : ''}
            ${d.durum === 'onaya_gonderildi'
    ? h`<button class="btn btn-ghost" type="submit" name="_eylem" value="geri_cek">
        Onaydan geri çek</button>` : ''}
            ${['taslak', 'revizyon_istendi'].includes(d.durum)
    ? h`<button class="btn btn-danger" type="submit" name="_eylem" value="iptal_et">İptal et</button>` : ''}
          </div>
        </form>` : ''}
      </div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: d.kod, baslik: d.baslik }));
}

/* ==========================================================================
   CNT-13 gecikme olayları
   ========================================================================== */
function gecikmeAc(ctx, govde) {
  yetkiZorunlu(ctx, 'CNT-13:olustur');
  const baslik = String(govde.baslik || '').trim();
  if (!baslik) throw DogrulamaHatasi('Başlık zorunludur.', { alanlar: { baslik: ['Başlık girin.'] } });
  if (!govde.baslangic) {
    throw DogrulamaHatasi('Başlangıç tarihi zorunludur.', { alanlar: { baslangic: ['Tarih girin.'] } });
  }
  const bas = gunBaslangici(govde.baslangic);
  const bitis = govde.bitis ? gunBaslangici(govde.bitis) : null;
  if (bitis && bitis < bas) {
    throw DogrulamaHatasi('Bitiş başlangıçtan önce olamaz.', { alanlar: { bitis: ['Tarih aralığı geçersiz.'] } });
  }
  /* Etkilenen gün, tarih aralığından HESAPLANIR; kullanıcı yazmaz. */
  const gun = bitis ? Math.max(1, Math.round((bitis - bas) / GUN_MS) + 1) : 0;
  const s = govde.sozlesmeId
    ? tek('SELECT * FROM sozlesme WHERE id = ? AND tenant_id = ?', govde.sozlesmeId, ctx.tenant.id) : null;
  const santiye = govde.santiyeId
    ? tek('SELECT * FROM santiye WHERE id = ? AND tenant_id = ?', govde.santiyeId, ctx.tenant.id) : null;

  islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'gecikme');
    const id = kimlik('olay').replace('evt', 'dly');
    calistir(`INSERT INTO gecikme_olayi (id, tenant_id, kod, baslik, proje_id, santiye_id, sozlesme_id,
                tur, baslangic, bitis, etkilenen_gun, sorumluluk, kanit, aciklama,
                durum, olusturan, olusturuldu) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'acik', ?,?)`,
      id, ctx.tenant.id, kod, baslik, s?.proje_id || santiye?.proje_id || null,
      santiye?.id || s?.santiye_id || null, s?.id || null, govde.tur || 'hava',
      bas, bitis, gun, govde.sorumluluk || 'isveren', govde.kanit || null,
      govde.aciklama || null, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'gecikme_olayi', nesneId: id, eylem: 'olustur',
      sonraki: { kod, baslik, gun, sorumluluk: govde.sorumluluk } });
  });
  return `${baslik} gecikme olayı kaydedildi${gun ? ` (${gun} gün)` : ''}`;
}

function gecikmeGecisi(ctx, govde) {
  yetkiZorunlu(ctx, 'CNT-13:guncelle');
  const g = tek('SELECT * FROM gecikme_olayi WHERE id = ? AND tenant_id = ?', govde.id, ctx.tenant.id);
  if (!g) throw Bulunamadi('Gecikme olayı bulunamadı.');
  gecisYap(ctx, { nesne: 'gecikmeOlayi', tablo: 'gecikme_olayi', kayit: g, eylem: govde.gecis,
    gerekce: govde.gerekce, ekranKodu: 'CNT-13' });
  return 'Gecikme olayı durumu güncellendi';
}

function gecikmeSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('CNT-13');
  yetkiZorunlu(ctx, e.yetki);
  const { kosullar, parametreler } = filtreKosullari(ctx, {
    aramaAlanlari: ['baslik', 'kod'], filtreler: [{ ad: 'durum' }, { ad: 'tur' }, { ad: 'sorumluluk' }],
  });
  const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
    { tablo: 'gecikme_olayi', kosullar, parametreler, sirala: 'baslangic DESC' });
  const kabulGun = Number(tek(
    `SELECT COALESCE(SUM(etkilenen_gun),0) AS n FROM gecikme_olayi
      WHERE tenant_id = ? AND durum IN ('kabul','kapali')`, ctx.tenant.id)?.n ?? 0);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Açık olay', deger: sayi(sayac(ctx.tenant.id, 'gecikme_olayi',
        `durum NOT IN ('kapali','ret')`)), ikon: 'fa-clock' },
      { etiket: 'Kabul edilen gün', deger: sayi(kabulGun), ikon: 'fa-calendar-plus',
        alt: 'süre uzatımına dayanak' },
      { etiket: 'İşveren kaynaklı', deger: sayi(sayac(ctx.tenant.id, 'gecikme_olayi',
        `sorumluluk = 'isveren'`)), ikon: 'fa-user-tie' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ]),
    filtre: B.filtreBari({ rota: '/gecikme-olaylari', sorgu: ctx.sorgu, aramaYer: 'Başlık veya kod…',
      filtreler: [
        { ad: 'tur', etiket: 'Tür', secenekler: GECIKME_TURLERI },
        { ad: 'sorumluluk', etiket: 'Sorumluluk', secenekler: SORUMLULUK },
        { ad: 'durum', etiket: 'Durum', secenekler: ['acik', 'degerlendirmede', 'kabul', 'ret', 'kapali']
          .map((d) => ({ deger: d, etiket: d })) },
      ] }),
    icerik: B.tablo({
      satirlar,
      bosDurum: { baslik: 'Gecikme olayı yok', ikon: 'fa-clock',
        aciklama: 'Süre uzatımı yalnız KABUL edilmiş gecikme olaylarına dayanabilir.' },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'baslik', etiket: 'Olay', govde: (r) => h`<b>${r.baslik}</b><br><span class="muted">${
          GECIKME_TURLERI.find((t) => t.deger === r.tur)?.etiket || r.tur}</span>` },
        { ad: 'baslangic', etiket: 'Aralık', govde: (r) => h`${tarih(r.baslangic)} → ${
          r.bitis ? tarih(r.bitis) : h`<span class="muted">sürüyor</span>`}` },
        { ad: 'etkilenen_gun', etiket: 'Gün', hizala: 'sag',
          govde: (r) => (r.etkilenen_gun ? h`<b>${r.etkilenen_gun}</b>` : '—') },
        { ad: 'sorumluluk', etiket: 'Sorumluluk', govde: (r) => B.isaret(
          SORUMLULUK.find((x) => x.deger === r.sorumluluk)?.etiket || r.sorumluluk,
          r.sorumluluk === 'yuklenici' ? 'danger' : 'info') },
        { ad: 'durum', etiket: 'Durum', govde: (r) => {
          if (!yetkiVar(ctx, 'CNT-13:guncelle') || ['kapali', 'ret'].includes(r.durum)) {
            return B.rozet(r.durum === 'kabul' ? 'onaylandi' : r.durum === 'ret' ? 'reddedildi' : 'beklemede',
              { acik: 'Açık', degerlendirmede: 'Değerlendirmede', kabul: 'Kabul',
                ret: 'Ret', kapali: 'Kapalı' }[r.durum]);
          }
          const gecisler = r.durum === 'acik' ? [['degerlendir', 'Değerlendir']]
            : [['kabul_et', 'Kabul'], ['reddet', 'Ret']];
          return h`<form method="post" action="/gecikme-olaylari" style="display:flex;gap:6px;flex-wrap:wrap">
            ${ham(csrfAlani(ctx))}
            <input type="hidden" name="_eylem" value="gecis">
            <input type="hidden" name="id" value="${r.id}">
            <input type="text" name="gerekce" placeholder="Gerekçe" aria-label="Gerekçe" style="max-width:110px">
            ${gecisler.map(([kod, et]) => h`<button class="btn ${
  ham(kod === 'reddet' ? 'btn-danger' : 'btn-ghost')} btn-sm" type="submit"
              name="gecis" value="${kod}">${et}</button>`)}
          </form>`;
        } },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: '/gecikme-olaylari', sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'CNT-13:olustur') ? B.form({
    rota: '/gecikme-olaylari', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni gecikme olayı',
      aciklama: 'Etkilenen gün, tarih aralığından HESAPLANIR; elle girilmez. '
        + 'Kabul/ret kararını olayı bildiren veremez (dört göz).',
      alanlar: h`
      ${B.alan({ ad: 'baslik', etiket: 'Başlık', zorunlu: true, genis: true, deger: deger.baslik || '',
    hata: hata?.alanlar?.baslik })}
      ${B.alan({ ad: 'tur', etiket: 'Tür', deger: deger.tur || 'hava', secenekler: GECIKME_TURLERI })}
      ${B.alan({ ad: 'sorumluluk', etiket: 'Sorumluluk', deger: deger.sorumluluk || 'isveren',
    secenekler: SORUMLULUK })}
      ${B.alan({ ad: 'sozlesmeId', etiket: 'Sözleşme', deger: deger.sozlesmeId || '',
    secenekler: [{ deger: '', etiket: 'Seçin…' }, ...sozlesmeSecenekleri(ctx)] })}
      ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye', deger: deger.santiyeId || '',
    secenekler: [{ deger: '', etiket: 'Seçin…' }, ...santiyeSecenekleri(ctx)] })}
      ${B.alan({ ad: 'baslangic', etiket: 'Başlangıç', tur: 'date', zorunlu: true,
    deger: deger.baslangic || '', hata: hata?.alanlar?.baslangic })}
      ${B.alan({ ad: 'bitis', etiket: 'Bitiş', tur: 'date', deger: deger.bitis || '',
    hata: hata?.alanlar?.bitis })}
      ${B.alan({ ad: 'kanit', etiket: 'Kanıt', genis: true, deger: deger.kanit || '',
    ipucu: 'Meteoroloji raporu, tutanak, yazışma referansı' })}
      ${B.alan({ ad: 'aciklama', etiket: 'Açıklama', tur: 'metin', genis: true, deger: deger.aciklama || '' })}` }],
    eylemler: B.btn('Olayı kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/* ==========================================================================
   CNT-14 süre uzatımı
   ========================================================================== */
function sureUzatimIslemi(ctx, govde) {
  if (govde._eylem === 'ac') {
    yetkiZorunlu(ctx, 'CNT-14:olustur');
    const baslik = String(govde.baslik || '').trim();
    if (!baslik) throw DogrulamaHatasi('Başlık zorunludur.', { alanlar: { baslik: ['Başlık girin.'] } });
    const olayIdleri = [].concat(govde.olaylar || []).filter(Boolean);
    if (!olayIdleri.length) {
      throw DogrulamaHatasi('Süre uzatımı en az bir KABUL edilmiş gecikme olayına dayanmalıdır.',
        { alanlar: { olaylar: ['Dayanak olay seçin.'] } });
    }
    const olaylar = olayIdleri.map((id) => tek(
      `SELECT * FROM gecikme_olayi WHERE id = ? AND tenant_id = ?`, id, ctx.tenant.id)).filter(Boolean);
    const kabulsuz = olaylar.filter((o) => !['kabul', 'kapali'].includes(o.durum));
    if (kabulsuz.length) {
      throw GecisIzinsiz(`Kabul edilmemiş gecikme olayı dayanak gösterilemez: ${
        kabulsuz.map((o) => o.kod).join(', ')}.`);
    }
    /* Talep edilen gün, dayanak olayların toplamını AŞAMAZ. */
    const dayanakGun = olaylar.reduce((a, o) => a + o.etkilenen_gun, 0);
    const talep = Number(govde.talepGun || 0);
    if (!Number.isInteger(talep) || talep <= 0) {
      throw DogrulamaHatasi('Talep edilen gün sıfırdan büyük olmalı.', { alanlar: { talepGun: ['Gün girin.'] } });
    }
    if (talep > dayanakGun) {
      throw DogrulamaHatasi(
        `Talep (${talep} gün), dayanak olayların toplamını (${dayanakGun} gün) aşamaz.`,
        { alanlar: { talepGun: ['Dayanağı aşan talep.'] } });
    }
    const s = govde.sozlesmeId
      ? tek('SELECT * FROM sozlesme WHERE id = ? AND tenant_id = ?', govde.sozlesmeId, ctx.tenant.id) : null;

    return islem(() => {
      const kod = sonrakiKod(ctx.tenant.id, 'sure_uzatim');
      const id = kimlik('sozlesme').replace('cnt', 'suz');
      calistir(`INSERT INTO sure_uzatim (id, tenant_id, kod, baslik, sozlesme_id, proje_id,
                  talep_gun, gerekce, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?, 'taslak', ?,?)`,
        id, ctx.tenant.id, kod, baslik, s?.id || null, s?.proje_id || govde.projeId || null,
        talep, govde.gerekce || null, ctx.kullanici.id, simdi());
      for (const o of olaylar) {
        calistir('INSERT INTO sure_uzatim_olayi (sure_uzatim_id, gecikme_id) VALUES (?,?)', id, o.id);
      }
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'sure_uzatim', nesneId: id, eylem: 'olustur',
        sonraki: { kod, talepGun: talep, dayanakGun, olay: olaylar.length } });
      return `${kod} süre uzatım talebi açıldı`;
    });
  }

  const u = tek('SELECT * FROM sure_uzatim WHERE id = ? AND tenant_id = ?', govde.uzatimId, ctx.tenant.id);
  if (!u) throw Bulunamadi('Süre uzatım talebi bulunamadı.');

  if (govde._eylem === 'onaya_gonder') {
    yetkiZorunlu(ctx, 'CNT-14:guncelle');
    islem(() => {
      onayMotoru.onayaGonder(ctx, {
        nesne: 'sure_uzatim', nesneId: u.id, nesneKod: u.kod,
        baslik: `Süre uzatımı: ${u.baslik} (${u.talep_gun} gün)`, belgeSurum: u.surum,
        projeId: u.proje_id, gerekce: govde.gerekce || null,
      });
      gecisYap(ctx, { nesne: 'sure_uzatim', tablo: 'sure_uzatim', kayit: u, eylem: 'onaya_gonder',
        gerekce: govde.gerekce, ekranKodu: 'CNT-14' });
    });
    return 'Süre uzatımı onaya gönderildi';
  }
  if (['geri_cek', 'iptal_et'].includes(govde._eylem)) {
    yetkiZorunlu(ctx, 'CNT-14:guncelle');
    gecisYap(ctx, { nesne: 'sure_uzatim', tablo: 'sure_uzatim', kayit: u, eylem: govde._eylem,
      gerekce: govde.gerekce, ekranKodu: 'CNT-14' });
    return 'Süre uzatım durumu güncellendi';
  }
  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

function sureUzatimSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('CNT-14');
  yetkiZorunlu(ctx, e.yetki);
  const { kosullar, parametreler } = filtreKosullari(ctx, {
    aramaAlanlari: ['baslik', 'kod'], filtreler: [{ ad: 'durum' }, { ad: 'sozlesme_id' }],
  });
  const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
    { tablo: 'sure_uzatim', kosullar, parametreler, sirala: 'olusturuldu DESC',
      kapsamSecenekleri: { santiyeSutunu: null } });
  const kabulOlaylar = sorgu(
    `SELECT * FROM gecikme_olayi WHERE tenant_id = ? AND durum IN ('kabul','kapali')
      ORDER BY baslangic DESC LIMIT 30`, ctx.tenant.id);
  const secilenId = ctx.sorgu.get('uzatim_id') || null;
  const secilen = secilenId ? satirlar.find((x) => x.id === secilenId) : null;

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Açık talep', deger: sayi(sayac(ctx.tenant.id, 'sure_uzatim',
        `durum NOT IN ('onaylandi','reddedildi','iptal')`)), ikon: 'fa-calendar-plus' },
      { etiket: 'Onaylanan gün', deger: sayi(Number(tek(
        `SELECT COALESCE(SUM(onaylanan_gun),0) AS n FROM sure_uzatim
          WHERE tenant_id = ? AND durum = 'onaylandi'`, ctx.tenant.id)?.n ?? 0)), ikon: 'fa-calendar-check' },
      { etiket: 'Dayanak olay', deger: sayi(kabulOlaylar.length), ikon: 'fa-clock' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ]),
    filtre: B.filtreBari({ rota: '/sure-uzatim', sorgu: ctx.sorgu, aramaYer: 'Başlık veya kod…',
      filtreler: [{ ad: 'durum', etiket: 'Durum', secenekler: ['taslak', 'onaya_gonderildi',
        'incelemede', 'onaylandi', 'reddedildi'].map((d) => ({ deger: d, etiket: d })) }] }),
    icerik: B.tablo({
      satirlar,
      satirRota: (r) => `/sure-uzatim?uzatim_id=${r.id}`,
      bosDurum: { baslik: 'Süre uzatım talebi yok', ikon: 'fa-calendar-plus',
        aciklama: 'Talep, KABUL edilmiş gecikme olaylarına dayanmak zorundadır.' },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'baslik', etiket: 'Talep', govde: (r) => h`<b>${r.baslik}</b>` },
        { ad: 'sozlesme_id', etiket: 'Sözleşme', govde: (r) => (r.sozlesme_id
          ? tek('SELECT kod FROM sozlesme WHERE id = ?', r.sozlesme_id)?.kod || '—' : '—') },
        { ad: 'dayanak', etiket: 'Dayanak', hizala: 'sag', govde: (r) => {
          const g = Number(tek(
            `SELECT COALESCE(SUM(g.etkilenen_gun),0) AS n FROM sure_uzatim_olayi so
               JOIN gecikme_olayi g ON g.id = so.gecikme_id WHERE so.sure_uzatim_id = ?`, r.id)?.n ?? 0);
          return `${g} gün`;
        } },
        { ad: 'talep_gun', etiket: 'Talep', hizala: 'sag', govde: (r) => h`<b>${r.talep_gun}</b> gün` },
        { ad: 'onaylanan_gun', etiket: 'Onaylanan', hizala: 'sag',
          govde: (r) => (r.onaylanan_gun != null ? `${r.onaylanan_gun} gün` : '—') },
        { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
        { ad: 'islem', etiket: '', govde: (r) => (r.durum !== 'taslak' || !yetkiVar(ctx, 'CNT-14:guncelle') ? '—'
          : h`<form method="post" action="/sure-uzatim" style="display:inline">${ham(csrfAlani(ctx))}
              <input type="hidden" name="_eylem" value="onaya_gonder">
              <input type="hidden" name="uzatimId" value="${r.id}">
              <button class="btn btn-acc btn-sm" type="submit">Onaya gönder</button></form>`) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: '/sure-uzatim', sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${secilen ? h`<div class="gv-card" style="margin-top:18px">
  <div class="gc-head"><div class="gc-title"><b>${secilen.kod} dayanak olayları</b></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: sorgu(`SELECT g.* FROM sure_uzatim_olayi so JOIN gecikme_olayi g ON g.id = so.gecikme_id
                      WHERE so.sure_uzatim_id = ? ORDER BY g.baslangic`, secilen.id),
    bosDurum: { baslik: 'Dayanak yok' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'baslik', etiket: 'Olay' },
      { ad: 'etkilenen_gun', etiket: 'Gün', hizala: 'sag' },
      { ad: 'sorumluluk', etiket: 'Sorumluluk' },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum === 'kabul' ? 'onaylandi' : 'kapali') },
    ],
  })}</div>
</div>` : ''}
${yetkiVar(ctx, 'CNT-14:olustur') ? B.form({
    rota: '/sure-uzatim', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni süre uzatım talebi',
      aciklama: 'Talep edilen gün, seçilen KABUL edilmiş olayların toplamını aşamaz.',
      alanlar: h`
      ${ham('<input type="hidden" name="_eylem" value="ac">')}
      ${B.alan({ ad: 'baslik', etiket: 'Başlık', zorunlu: true, genis: true, deger: deger.baslik || '',
    hata: hata?.alanlar?.baslik })}
      ${B.alan({ ad: 'sozlesmeId', etiket: 'Sözleşme', deger: deger.sozlesmeId || '',
    secenekler: [{ deger: '', etiket: 'Seçin…' }, ...sozlesmeSecenekleri(ctx)] })}
      ${B.alan({ ad: 'talepGun', etiket: 'Talep edilen gün', tur: 'number', zorunlu: true,
    deger: deger.talepGun || '', hata: hata?.alanlar?.talepGun })}
      ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe', tur: 'metin', genis: true, deger: deger.gerekce || '' })}
      ${kabulOlaylar.length
    ? h`<div class="gfield full"><label>Dayanak gecikme olayları<span class="gf-req">*</span></label>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">
          ${kabulOlaylar.map((o) => h`<label style="display:flex;gap:8px;align-items:center;font-size:13px">
            <input type="checkbox" name="olaylar" value="${o.id}">
            <span><b>${o.kod}</b> — ${o.baslik} <span class="muted">(${o.etkilenen_gun} gün · ${
  SORUMLULUK.find((x) => x.deger === o.sorumluluk)?.etiket})</span></span></label>`)}
        </div>
        ${hata?.alanlar?.olaylar ? h`<span class="gf-err">${hata.alanlar.olaylar.join(' ')}</span>` : ''}
      </div>`
    : h`<div class="gfield full"><span class="gf-hint">Kabul edilmiş gecikme olayı yok;
        önce <a href="/gecikme-olaylari">gecikme olayı</a> kaydedip kabul ettirin.</span></div>`}` }],
    eylemler: B.btn('Talebi aç', { tur: 'acc', gonder: true, ikon: 'fa-plus',
      devreDisi: kabulOlaylar.length === 0 }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/* ==========================================================================
   CNT-15 claim
   ========================================================================== */
function claimAc(ctx, govde) {
  yetkiZorunlu(ctx, 'CNT-15:olustur');
  const baslik = String(govde.baslik || '').trim();
  if (!baslik) throw DogrulamaHatasi('Başlık zorunludur.', { alanlar: { baslik: ['Başlık girin.'] } });
  const s = govde.sozlesmeId
    ? tek('SELECT * FROM sozlesme WHERE id = ? AND tenant_id = ?', govde.sozlesmeId, ctx.tenant.id) : null;
  let talep = 0;
  if (govde.talepTutari) {
    try { talep = Number(Para.ayristir(govde.talepTutari, s?.tutar_birim || ctx.tenant.para_birimi).minor); }
    catch { throw DogrulamaHatasi('Geçersiz talep tutarı.', { alanlar: { talepTutari: ['Tutar girin.'] } }); }
  }
  if (!String(govde.dayanak || '').trim()) {
    throw DogrulamaHatasi('Claim dayanağı zorunludur (sözleşme maddesi, olay, yazışma).',
      { alanlar: { dayanak: ['Dayanak girin.'] } });
  }
  islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'claim');
    const id = kimlik('sozlesme').replace('cnt', 'clm');
    calistir(`INSERT INTO claim (id, tenant_id, kod, baslik, sozlesme_id, proje_id, tur,
                talep_minor, tutar_birim, dayanak, son_bildirim_tarihi, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?, 'hazirlik', ?,?)`,
      id, ctx.tenant.id, kod, baslik, s?.id || null, s?.proje_id || govde.projeId || null,
      govde.tur || 'maliyet', String(talep), s?.tutar_birim || ctx.tenant.para_birimi,
      govde.dayanak, govde.sonBildirimTarihi ? gunBaslangici(govde.sonBildirimTarihi) : null,
      ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'claim', nesneId: id, eylem: 'olustur', sonraki: { kod, baslik, talepMinor: talep } });
  });
  return 'Claim dosyası açıldı';
}

function claimGecisi(ctx, govde) {
  yetkiZorunlu(ctx, 'CNT-15:guncelle');
  const c = tek('SELECT * FROM claim WHERE id = ? AND tenant_id = ?', govde.id, ctx.tenant.id);
  if (!c) throw Bulunamadi('Claim bulunamadı.');
  const ek = {};
  if (govde.gecis === 'kabul_et') {
    if (!govde.kabulTutari) {
      throw DogrulamaHatasi('Kabul edilen tutar zorunludur.',
        { alanlar: { kabulTutari: ['Tutar girin.'] } });
    }
    const kabul = Number(Para.ayristir(govde.kabulTutari, c.tutar_birim).minor);
    if (kabul > Number(c.talep_minor)) {
      throw DogrulamaHatasi('Kabul edilen tutar talebi aşamaz.',
        { alanlar: { kabulTutari: ['Talepten büyük.'] } });
    }
    ek.kabul_minor = String(kabul);
  }
  gecisYap(ctx, { nesne: 'claim', tablo: 'claim', kayit: c, eylem: govde.gecis,
    gerekce: govde.gerekce, ekranKodu: 'CNT-15', ekAlanlar: ek });
  return 'Claim durumu güncellendi';
}

function claimSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('CNT-15');
  yetkiZorunlu(ctx, e.yetki);
  const { kosullar, parametreler } = filtreKosullari(ctx, {
    aramaAlanlari: ['baslik', 'kod'], filtreler: [{ ad: 'durum' }, { ad: 'tur' }],
  });
  const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
    { tablo: 'claim', kosullar, parametreler, sirala: 'olusturuldu DESC',
      kapsamSecenekleri: { santiyeSutunu: null } });

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Açık claim', deger: sayi(sayac(ctx.tenant.id, 'claim', `durum <> 'kapali'`)),
        ikon: 'fa-gavel' },
      { etiket: 'Talep toplamı', ikon: 'fa-coins', deger: para(Number(tek(
        `SELECT COALESCE(SUM(talep_minor),0) AS n FROM claim WHERE tenant_id = ?`,
        ctx.tenant.id)?.n ?? 0), ctx.tenant.para_birimi) },
      { etiket: 'Kabul edilen', ikon: 'fa-circle-check', deger: para(Number(tek(
        `SELECT COALESCE(SUM(kabul_minor),0) AS n FROM claim WHERE tenant_id = ?`,
        ctx.tenant.id)?.n ?? 0), ctx.tenant.para_birimi) },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ]),
    filtre: B.filtreBari({ rota: '/claimler', sorgu: ctx.sorgu, aramaYer: 'Başlık veya kod…',
      filtreler: [
        { ad: 'tur', etiket: 'Tür', secenekler: CLAIM_TURLERI },
        { ad: 'durum', etiket: 'Durum', secenekler: ['hazirlik', 'bildirildi', 'muzakerede',
          'kabul', 'ret', 'tahkim', 'kapali'].map((d) => ({ deger: d, etiket: d })) },
      ] }),
    icerik: B.tablo({
      satirlar,
      bosDurum: { baslik: 'Claim dosyası yok', ikon: 'fa-gavel',
        aciklama: 'Claim, dayanak (sözleşme maddesi/olay/yazışma) olmadan açılamaz.' },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'baslik', etiket: 'Claim', govde: (r) => h`<b>${r.baslik}</b><br><span class="muted">${
          CLAIM_TURLERI.find((t) => t.deger === r.tur)?.etiket || r.tur}</span>` },
        { ad: 'sozlesme_id', etiket: 'Sözleşme', govde: (r) => (r.sozlesme_id
          ? tek('SELECT kod FROM sozlesme WHERE id = ?', r.sozlesme_id)?.kod || '—' : '—') },
        { ad: 'talep_minor', etiket: 'Talep', hizala: 'sag', govde: (r) => para(r.talep_minor, r.tutar_birim) },
        { ad: 'kabul_minor', etiket: 'Kabul', hizala: 'sag',
          govde: (r) => (r.kabul_minor != null ? para(r.kabul_minor, r.tutar_birim) : '—') },
        { ad: 'son_bildirim_tarihi', etiket: 'Son bildirim', govde: (r) => (!r.son_bildirim_tarihi ? '—'
          : r.son_bildirim_tarihi < simdi() && r.durum === 'hazirlik'
            ? B.isaret(`${tarih(r.son_bildirim_tarihi)} — geçti`, 'danger') : tarih(r.son_bildirim_tarihi)) },
        { ad: 'durum', etiket: 'Durum', govde: (r) => {
          if (!yetkiVar(ctx, 'CNT-15:guncelle') || r.durum === 'kapali') {
            return B.rozet(r.durum === 'kabul' ? 'onaylandi' : r.durum === 'ret' ? 'reddedildi' : 'beklemede',
              { hazirlik: 'Hazırlık', bildirildi: 'Bildirildi', muzakerede: 'Müzakerede',
                kabul: 'Kabul', ret: 'Ret', tahkim: 'Tahkim', kapali: 'Kapalı' }[r.durum]);
          }
          const gecisler = { hazirlik: [['bildir', 'Bildir']], bildirildi: [['muzakere', 'Müzakere']],
            muzakerede: [['kabul_et', 'Kabul'], ['reddet', 'Ret']],
            kabul: [['kapat', 'Kapat']], ret: [['tahkime_gotur', 'Tahkim'], ['kapat', 'Kapat']],
            tahkim: [['kapat', 'Kapat']] }[r.durum] || [];
          return h`<form method="post" action="/claimler" style="display:flex;gap:6px;flex-wrap:wrap">
            ${ham(csrfAlani(ctx))}
            <input type="hidden" name="_eylem" value="gecis">
            <input type="hidden" name="id" value="${r.id}">
            ${r.durum === 'muzakerede'
  ? h`<input type="text" name="kabulTutari" placeholder="Kabul tutarı" aria-label="Kabul tutarı"
      style="max-width:110px">` : ''}
            <input type="text" name="gerekce" placeholder="Gerekçe" aria-label="Gerekçe" style="max-width:100px">
            ${gecisler.map(([kod, et]) => h`<button class="btn ${
  ham(kod === 'reddet' ? 'btn-danger' : 'btn-ghost')} btn-sm" type="submit"
              name="gecis" value="${kod}">${et}</button>`)}
          </form>`;
        } },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: '/claimler', sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'CNT-15:olustur') ? B.form({
    rota: '/claimler', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni claim dosyası',
      aciklama: 'Dayanak zorunludur; dayanaksız talep müzakerede savunulamaz.',
      alanlar: h`
      ${B.alan({ ad: 'baslik', etiket: 'Başlık', zorunlu: true, genis: true, deger: deger.baslik || '',
    hata: hata?.alanlar?.baslik })}
      ${B.alan({ ad: 'tur', etiket: 'Tür', deger: deger.tur || 'maliyet', secenekler: CLAIM_TURLERI })}
      ${B.alan({ ad: 'sozlesmeId', etiket: 'Sözleşme', deger: deger.sozlesmeId || '',
    secenekler: [{ deger: '', etiket: 'Seçin…' }, ...sozlesmeSecenekleri(ctx)] })}
      ${B.alan({ ad: 'talepTutari', etiket: 'Talep tutarı', deger: deger.talepTutari || '',
    hata: hata?.alanlar?.talepTutari })}
      ${B.alan({ ad: 'sonBildirimTarihi', etiket: 'Son bildirim tarihi', tur: 'date',
    deger: deger.sonBildirimTarihi || '', ipucu: 'Sözleşmedeki bildirim süresi.' })}
      ${B.alan({ ad: 'dayanak', etiket: 'Dayanak', tur: 'metin', genis: true, zorunlu: true,
    deger: deger.dayanak || '', hata: hata?.alanlar?.dayanak,
    ipucu: 'Sözleşme maddesi, gecikme olayı kodu, yazışma referansı' })}` }],
    eylemler: B.btn('Claim aç', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/**
 * Onay motoru geri çağrısı — değişiklik ve süre uzatımı.
 * ONAYLANAN değişiklik, sözleşmede otomatik ZEYİL TASLAĞI açar (§7 bağı):
 * zeyil kendi onayından geçer, böylece sözleşme bedeli iki kez onaylanmış olur.
 */
export function degisiklikOnaySonucu(ctx, nesne, nesneId, sonuc) {
  const tablo = nesne === 'degisiklik' ? 'degisiklik' : 'sure_uzatim';
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
  if (sonuc !== 'onaylandi') return;

  if (nesne === 'degisiklik' && guncel.sozlesme_id && !guncel.zeyil_id) islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'zeyil');
    const zid = kimlik('sozlesme').replace('cnt', 'zyl');
    const tur = Number(guncel.tutar_etkisi_minor) && guncel.sure_etkisi_gun ? 'karma'
      : (Number(guncel.tutar_etkisi_minor) ? 'tutar' : (guncel.sure_etkisi_gun ? 'sure' : 'kapsam'));
    calistir(`INSERT INTO zeyil (id, tenant_id, sozlesme_id, kod, tur, konu, tutar_farki_minor,
                tutar_birim, sure_farki_gun, gerekce, degisiklik_id, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?, 'taslak', ?,?)`,
      zid, ctx.tenant.id, guncel.sozlesme_id, kod, tur, `${guncel.kod} değişiklik emri: ${guncel.baslik}`,
      String(guncel.tutar_etkisi_minor), guncel.tutar_birim, guncel.sure_etkisi_gun,
      `Onaylı değişiklik emrinden otomatik açıldı (${guncel.kod}).`, guncel.id,
      ctx.kullanici.id, simdi());
    calistir('UPDATE degisiklik SET zeyil_id = ?, surum = surum + 1 WHERE id = ?', zid, guncel.id);
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'zeyil', nesneId: zid, eylem: 'degisiklikten_acildi',
      gerekce: `${guncel.kod} değişiklik emri onaylandı`,
      sonraki: { kod, tutarFarki: guncel.tutar_etkisi_minor, sureFarki: guncel.sure_etkisi_gun } });
  });

  if (nesne === 'sure_uzatim') islem(() => {
    /* Onaylanan gün = talep edilen gün (onaycı farklı gün veremez; veriyorsa
       revizyon ister ve talep güncellenir — böylece karar izlenebilir kalır). */
    calistir('UPDATE sure_uzatim SET onaylanan_gun = talep_gun, surum = surum + 1 WHERE id = ?', guncel.id);
    if (guncel.sozlesme_id) {
      const s = tek('SELECT * FROM sozlesme WHERE id = ?', guncel.sozlesme_id);
      const kod = sonrakiKod(ctx.tenant.id, 'zeyil');
      const zid = kimlik('sozlesme').replace('cnt', 'zyl');
      calistir(`INSERT INTO zeyil (id, tenant_id, sozlesme_id, kod, tur, konu, tutar_farki_minor,
                  tutar_birim, sure_farki_gun, gerekce, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?, 'sure', ?,0,?,?,?, 'taslak', ?,?)`,
        zid, ctx.tenant.id, s.id, kod, `${guncel.kod} süre uzatımı: ${guncel.baslik}`,
        s.tutar_birim, guncel.talep_gun,
        `Onaylı süre uzatımından otomatik açıldı (${guncel.kod}).`, ctx.kullanici.id, simdi());
      calistir('UPDATE sure_uzatim SET zeyil_id = ? WHERE id = ?', zid, guncel.id);
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'zeyil', nesneId: zid, eylem: 'sure_uzatimindan_acildi',
        sonraki: { kod, sureFarki: guncel.talep_gun } });
    }
  });
}
