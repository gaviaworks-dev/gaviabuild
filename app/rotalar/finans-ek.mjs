/* ============================================================================
   ÖDEME, FATURA, ÜÇLÜ EŞLEŞTİRME VE DÖNEM KAPANIŞI — FIN-11..15
   ----------------------------------------------------------------------------
   FAZ 4 KABUL: "Üçlü eşleştirme; tolerans dışı fark onaya gidiyor."
   Eşleştirme sonucu HESAPLANIR (sipariş ↔ mal kabul ↔ fatura); kullanıcı
   "eşleşti" diyemez. Tolerans içi fark otomatik geçer, tolerans dışı fark
   gerekçe ve onay ister. Dönem kapanışı açık farkları engel sayar (FIN-15).
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, gunAnahtari, gunBaslangici, GUN_MS } from '../cekirdek/zaman.mjs';
import { Para } from '../cekirdek/para.mjs';
import { DogrulamaHatasi, GecisIzinsiz, Bulunamadi, Cakisma, UygulamaHatasi } from '../cekirdek/hata.mjs';
import * as onayMotoru from '../moduller/isakisi/onay.mjs';
import * as fdefter from '../moduller/finans/defter.mjs';
import { miktarMetni } from '../moduller/stok/defter.mjs';
import { sayac } from './kayit-modulu.mjs';
import { cariSecenekleri, donemKilidiKontrol } from './finans.mjs';
import {
  ekranNesnesi, hataNesnesi, kullaniciAdi, ciz, kaydiAl, listeSorgusu, filtreKosullari,
  B, h, ham, sayi, csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar,
  sorgu, tek, calistir, islem, surumluGuncelle, audit, sonrakiKod, gecisYap,
} from './ortak.mjs';

const para = (minor, birim = 'TRY') => (minor == null ? '—' : Para.minor(minor, birim || 'TRY').bicim());
const donemAnahtari = (ms) => gunAnahtari(ms).slice(0, 7);

/* Üçlü eşleştirme toleransı: tutarda binde 5 VEYA en çok 50 TL (5000 kuruş).
   Tolerans, kur farkı ve yuvarlama için vardır; iş kararı için değil. */
const TOLERANS_BINDE = 5;
const TOLERANS_TAVAN_MINOR = 5000;
const toleransSiniri = (tutarMinor) => Math.min(
  Math.round((Math.abs(tutarMinor) * TOLERANS_BINDE) / 1000), TOLERANS_TAVAN_MINOR);

const ODEME_YONTEMLERI = [
  { deger: 'havale', etiket: 'Havale' }, { deger: 'eft', etiket: 'EFT' },
  { deger: 'nakit', etiket: 'Nakit' }, { deger: 'cek', etiket: 'Çek' },
  { deger: 'senet', etiket: 'Senet' }, { deger: 'kart', etiket: 'Kart' },
];

/**
 * ÜÇLÜ EŞLEŞTİRME — sipariş, mal kabul ve fatura tutarları karşılaştırılır.
 * Sonuç hesaplanır; hiçbir ekran bu değeri elle yazamaz.
 */
export function ucluEslestir(faturaId) {
  const f = tek('SELECT * FROM fatura WHERE id = ?', faturaId);
  if (!f) return null;
  const siparis = f.siparis_id ? tek('SELECT * FROM siparis WHERE id = ?', f.siparis_id) : null;
  const kabuller = f.siparis_id
    ? sorgu(`SELECT * FROM mal_kabul WHERE siparis_id = ? AND durum IN ('kabul','kismi_kabul')`, f.siparis_id)
    : (f.mal_kabul_id ? [tek('SELECT * FROM mal_kabul WHERE id = ?', f.mal_kabul_id)].filter(Boolean) : []);

  /* Teslim alınan tutar: kabul edilen miktar × sipariş birim fiyatı. */
  let teslimTutar = 0;
  const satirlar = [];
  for (const m of kabuller) {
    for (const k of sorgu('SELECT * FROM mal_kabul_kalemi WHERE mal_kabul_id = ?', m.id)) {
      const sk = k.siparis_kalemi_id ? tek('SELECT * FROM siparis_kalemi WHERE id = ?', k.siparis_kalemi_id) : null;
      const fiyat = sk ? Number(sk.birim_fiyat_minor) : 0;
      const tutar = Math.round((k.kabul_binde / 1000) * fiyat);
      teslimTutar += tutar;
      satirlar.push({ malKabul: m.kod, aciklama: k.aciklama, kabulBinde: k.kabul_binde,
        birimFiyat: fiyat, tutar });
    }
  }

  const siparisTutar = siparis ? Number(siparis.tutar_minor) : null;
  const faturaTutar = Number(f.matrah_minor);
  const fark = faturaTutar - teslimTutar;
  const sinir = toleransSiniri(teslimTutar);

  let sonuc;
  if (!siparis && !kabuller.length) sonuc = 'eslesmedi';
  else if (fark === 0) sonuc = 'eslesti';
  else if (Math.abs(fark) <= sinir) sonuc = 'tolerans_ici';
  else sonuc = 'tolerans_disi';

  return { fatura: f, siparis, kabuller, satirlar, siparisTutar, teslimTutar,
    faturaTutar, fark, sinir, sonuc };
}

export function kur(y, ekranRota) {
  /* ================= FIN-11 Ödeme talepleri ============================ */
  ekranRota(y, 'FIN-11', {
    get: (ctx) => odemeSayfasi(ctx),
    post: (ctx, govde) => {
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = odemeIslemi(ctx, govde);
        return yonlendir(ctx, `/odemeler?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return odemeSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= FIN-12 Ödeme planı ================================ */
  ekranRota(y, 'FIN-12', { get: (ctx) => odemePlani(ctx) });

  /* ================= FIN-13 Faturalar ================================== */
  ekranRota(y, 'FIN-13', {
    get: (ctx) => faturaSayfasi(ctx),
    post: (ctx, govde) => {
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = faturaIslemi(ctx, govde);
        const p = new URLSearchParams({ islem: mesaj });
        if (govde.faturaId) p.set('fatura_id', govde.faturaId);
        return yonlendir(ctx, `/faturalar?${p.toString()}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return faturaSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= FIN-14 Üçlü eşleştirme ============================ */
  ekranRota(y, 'FIN-14', {
    get: (ctx) => ucluSayfasi(ctx),
    post: (ctx, govde) => {
      const e = ekranNesnesi('FIN-14');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = ucluIslem(ctx, govde);
        return yonlendir(ctx, `/faturalar/eslestirme?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return ucluSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ================= FIN-15 Dönem kapanışı ============================= */
  ekranRota(y, 'FIN-15', {
    get: (ctx) => donemKapanisSayfasi(ctx),
    post: (ctx, govde) => {
      const e = ekranNesnesi('FIN-15');
      yetkiZorunlu(ctx, `${e.kod}:tamamla`);
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = donemIslemi(ctx, govde);
        return yonlendir(ctx, `/finans/donem-kapanis?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return donemKapanisSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });
}

/* ==========================================================================
   FIN-13 fatura
   ========================================================================== */
function faturaAc(ctx, govde) {
  yetkiZorunlu(ctx, 'FIN-13:olustur');
  const no = String(govde.faturaNo || '').trim();
  if (!no) throw DogrulamaHatasi('Fatura numarası zorunludur.', { alanlar: { faturaNo: ['No girin.'] } });
  const ted = govde.tedarikciId
    ? tek('SELECT * FROM tedarikci WHERE id = ? AND tenant_id = ?', govde.tedarikciId, ctx.tenant.id) : null;
  const mevcut = tek(
    `SELECT id FROM fatura WHERE tenant_id = ? AND yon = ? AND fatura_no = ?
       AND (tedarikci_id IS ? OR tedarikci_id = ?)`,
    ctx.tenant.id, govde.yon || 'gelen', no, ted?.id ?? null, ted?.id ?? '');
  if (mevcut) throw Cakisma(`Bu tedarikçiden "${no}" numaralı fatura zaten kayıtlı (mükerrer fatura).`);

  const matrah = Para.ayristir(govde.matrah || '', ctx.tenant.para_birimi);
  if (matrah.minor <= 0n) {
    throw DogrulamaHatasi('Matrah sıfırdan büyük olmalı.', { alanlar: { matrah: ['Tutar girin.'] } });
  }
  const kdv = govde.kdv ? Para.ayristir(govde.kdv, ctx.tenant.para_birimi).minor : 0n;
  const siparis = govde.siparisId
    ? tek('SELECT * FROM siparis WHERE id = ? AND tenant_id = ?', govde.siparisId, ctx.tenant.id) : null;
  if (govde.siparisId && !siparis) throw DogrulamaHatasi('Sipariş bulunamadı.');
  const hakedis = govde.hakedisId
    ? tek('SELECT * FROM hakedis WHERE id = ? AND tenant_id = ?', govde.hakedisId, ctx.tenant.id) : null;
  if (hakedis && hakedis.durum !== 'onaylandi') {
    throw GecisIzinsiz('Yalnız ONAYLI hakediş faturaya bağlanabilir.');
  }
  const faturaTarihi = govde.faturaTarihi ? gunBaslangici(govde.faturaTarihi) : simdi();
  donemKilidiKontrol(ctx, faturaTarihi);

  return islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'fatura');
    const id = kimlik('fatura');
    const vade = govde.vadeTarihi ? gunBaslangici(govde.vadeTarihi)
      : (ted?.odeme_vadesi_gun ? faturaTarihi + ted.odeme_vadesi_gun * GUN_MS : null);
    calistir(`INSERT INTO fatura (id, tenant_id, kod, fatura_no, yon, cari_id, tedarikci_id,
                siparis_id, mal_kabul_id, hakedis_id, fatura_tarihi, vade_tarihi,
                matrah_minor, kdv_minor, toplam_minor, tutar_birim, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'kayitli', ?,?)`,
      id, ctx.tenant.id, kod, no, govde.yon || 'gelen', govde.cariId || ted?.cari_id || null,
      ted?.id || siparis?.tedarikci_id || null, siparis?.id || null, govde.malKabulId || null,
      hakedis?.id || null, faturaTarihi, vade, String(matrah.minor), String(kdv),
      String(matrah.minor + kdv), matrah.birim, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'fatura', nesneId: id, eylem: 'olustur',
      sonraki: { kod, faturaNo: no, matrahMinor: String(matrah.minor) } });
    return `${kod} faturası kaydedildi`;
  });
}

function faturaIslemi(ctx, govde) {
  if (!govde._eylem || govde._eylem === 'ac') return faturaAc(ctx, govde);
  const f = tek('SELECT * FROM fatura WHERE id = ? AND tenant_id = ?', govde.faturaId, ctx.tenant.id);
  if (!f) throw Bulunamadi('Fatura bulunamadı.');
  yetkiZorunlu(ctx, 'FIN-13:guncelle');

  if (govde._eylem === 'eslestir') {
    gecisYap(ctx, { nesne: 'fatura', tablo: 'fatura', kayit: f, eylem: 'eslestir',
      gerekce: govde.gerekce, ekranKodu: 'FIN-13' });
    return 'Fatura eşleştirmeye alındı';
  }
  if (govde._eylem === 'onaya_gonder') {
    /* FIN-14 KABUL: eşleştirme yapılmadan fatura onaya gönderilemez. */
    if (f.eslestirme === 'yapilmadi') {
      throw GecisIzinsiz('Üçlü eşleştirme yapılmadan fatura onaya gönderilemez (FIN-14).');
    }
    if (f.eslestirme === 'tolerans_disi' && !String(f.fark_gerekcesi || '').trim()) {
      throw GecisIzinsiz('Tolerans dışı fark gerekçesiz onaya gönderilemez.');
    }
    islem(() => {
      onayMotoru.onayaGonder(ctx, {
        nesne: 'fatura', nesneId: f.id, nesneKod: f.kod,
        baslik: `Fatura onayı: ${f.fatura_no}${f.eslestirme === 'tolerans_disi' ? ' (TOLERANS DIŞI)' : ''}`,
        belgeSurum: f.surum, tutarMinor: Number(f.toplam_minor), tutarBirim: f.tutar_birim,
        gerekce: govde.gerekce || f.fark_gerekcesi || null,
      });
      gecisYap(ctx, { nesne: 'fatura', tablo: 'fatura', kayit: f, eylem: 'onaya_gonder',
        gerekce: govde.gerekce, ekranKodu: 'FIN-13' });
    });
    return 'Fatura onaya gönderildi';
  }
  if (['geri_cek', 'iptal_et'].includes(govde._eylem)) {
    gecisYap(ctx, { nesne: 'fatura', tablo: 'fatura', kayit: f, eylem: govde._eylem,
      gerekce: govde.gerekce, ekranKodu: 'FIN-13' });
    return 'Fatura durumu güncellendi';
  }
  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

function faturaSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('FIN-13');
  yetkiZorunlu(ctx, e.yetki);
  const { kosullar, parametreler } = filtreKosullari(ctx, {
    aramaAlanlari: ['fatura_no', 'kod'], filtreler: [{ ad: 'durum' }, { ad: 'yon' }, { ad: 'eslestirme' }],
  });
  const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
    { tablo: 'fatura', kosullar, parametreler, sirala: 'fatura_tarihi DESC',
      kapsamSecenekleri: { projeSutunu: null, santiyeSutunu: null } });
  const secilenId = ctx.sorgu.get('fatura_id') || '';
  const secilen = secilenId ? tek('SELECT * FROM fatura WHERE id = ? AND tenant_id = ?', secilenId, ctx.tenant.id) : null;
  const siparisler = sorgu(
    `SELECT id, kod, baslik FROM siparis WHERE tenant_id = ? AND durum = 'onaylandi'
      ORDER BY olusturuldu DESC LIMIT 100`, ctx.tenant.id)
    .map((s) => ({ deger: s.id, etiket: `${s.kod} — ${s.baslik}` }));
  const hakedisler = sorgu(
    `SELECT id, kod, no FROM hakedis WHERE tenant_id = ? AND durum = 'onaylandi'
      ORDER BY olusturuldu DESC LIMIT 100`, ctx.tenant.id)
    .map((x) => ({ deger: x.id, etiket: `${x.kod} (${x.no}. hakediş)` }));

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Kayıtlı fatura', deger: sayi(sayac(ctx.tenant.id, 'fatura', `durum <> 'iptal'`)),
        ikon: 'fa-file-invoice' },
      { etiket: 'Eşleştirilmemiş', ton: 'warn', ikon: 'fa-code-compare',
        deger: sayi(sayac(ctx.tenant.id, 'fatura', `eslestirme = 'yapilmadi' AND durum NOT IN ('iptal','odendi')`)) },
      { etiket: 'Tolerans dışı', ton: 'danger', ikon: 'fa-triangle-exclamation',
        deger: sayi(sayac(ctx.tenant.id, 'fatura', `eslestirme = 'tolerans_disi'`)) },
      { etiket: 'Ödenmemiş tutar', ikon: 'fa-coins', deger: para(Number(tek(
        `SELECT COALESCE(SUM(toplam_minor),0) AS n FROM fatura WHERE tenant_id = ?
           AND yon = 'gelen' AND durum NOT IN ('odendi','iptal','reddedildi')`,
        ctx.tenant.id)?.n ?? 0), ctx.tenant.para_birimi) },
    ]),
    filtre: B.filtreBari({ rota: '/faturalar', sorgu: ctx.sorgu, aramaYer: 'Fatura no veya kod…',
      filtreler: [
        { ad: 'yon', etiket: 'Yön', secenekler: [{ deger: 'gelen', etiket: 'Gelen' },
          { deger: 'giden', etiket: 'Giden' }] },
        { ad: 'eslestirme', etiket: 'Eşleştirme', secenekler: [
          { deger: 'yapilmadi', etiket: 'Yapılmadı' }, { deger: 'eslesti', etiket: 'Eşleşti' },
          { deger: 'tolerans_ici', etiket: 'Tolerans içi' },
          { deger: 'tolerans_disi', etiket: 'Tolerans dışı' },
          { deger: 'eslesmedi', etiket: 'Eşleşmedi' }] },
        { ad: 'durum', etiket: 'Durum', secenekler: ['kayitli', 'eslestirmede', 'onaya_gonderildi',
          'onaylandi', 'odendi'].map((d) => ({ deger: d, etiket: d })) },
      ] }),
    icerik: B.tablo({
      satirlar,
      satirRota: (r) => `/faturalar?fatura_id=${r.id}`,
      bosDurum: { baslik: 'Fatura yok', ikon: 'fa-file-invoice',
        aciklama: 'Fatura, üçlü eşleştirme yapılmadan onaya gönderilemez.' },
      sutunlar: [
        { ad: 'fatura_no', etiket: 'Fatura', govde: (r) => h`<b>${r.fatura_no}</b><br><span class="muted">${r.kod}</span>` },
        { ad: 'tedarikci_id', etiket: 'Tedarikçi', govde: (r) => (r.tedarikci_id
          ? tek('SELECT unvan FROM tedarikci WHERE id = ?', r.tedarikci_id)?.unvan || '—' : '—') },
        { ad: 'fatura_tarihi', etiket: 'Tarih', govde: (r) => tarih(r.fatura_tarihi) },
        { ad: 'vade_tarihi', etiket: 'Vade', govde: (r) => (!r.vade_tarihi ? '—'
          : r.vade_tarihi < simdi() && !['odendi', 'iptal'].includes(r.durum)
            ? B.isaret(`${tarih(r.vade_tarihi)} — geçti`, 'danger') : tarih(r.vade_tarihi)) },
        { ad: 'toplam_minor', etiket: 'Toplam', hizala: 'sag', govde: (r) => para(r.toplam_minor, r.tutar_birim) },
        { ad: 'eslestirme', etiket: 'Eşleştirme', govde: (r) => B.isaret(
          { yapilmadi: 'yapılmadı', eslesti: 'eşleşti', tolerans_ici: 'tolerans içi',
            tolerans_disi: 'TOLERANS DIŞI', eslesmedi: 'eşleşmedi' }[r.eslestirme],
          r.eslestirme === 'eslesti' ? 'ok' : r.eslestirme === 'tolerans_ici' ? 'warn'
            : r.eslestirme === 'yapilmadi' ? 'info' : 'danger') },
        { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: '/faturalar', sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${secilen ? h`<div class="gv-card" style="margin-top:18px">
  <div class="gc-head"><div class="gc-title"><b>${secilen.fatura_no} — durum işlemleri</b>
    <span>Eşleştirme yapılmadan onaya gönderilemez (FIN-14).</span></div>
    ${B.btn('Eşleştirmeye git', { rota: `/faturalar/eslestirme?fatura_id=${secilen.id}`, kucuk: true })}</div>
  <div class="gc-body">
    <dl class="gd-grid" style="border-top:0;padding-top:0;margin-top:0">
      <div><dt>Matrah</dt><dd>${para(secilen.matrah_minor, secilen.tutar_birim)}</dd></div>
      <div><dt>KDV</dt><dd>${para(secilen.kdv_minor, secilen.tutar_birim)}</dd></div>
      <div><dt>Toplam</dt><dd><b>${para(secilen.toplam_minor, secilen.tutar_birim)}</b></dd></div>
      <div><dt>Eşleştirme</dt><dd>${secilen.eslestirme}${secilen.fark_minor
    ? ` · fark ${para(secilen.fark_minor, secilen.tutar_birim)}` : ''}</dd></div>
      <div><dt>Fark gerekçesi</dt><dd>${secilen.fark_gerekcesi || '—'}</dd></div>
    </dl>
    ${yetkiVar(ctx, 'FIN-13:guncelle') ? h`
    <form method="post" action="/faturalar" data-gform="1" style="margin-top:14px">
      ${ham(csrfAlani(ctx))}
      <input type="hidden" name="faturaId" value="${secilen.id}">
      ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe / not', tur: 'metin' })}
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        ${secilen.durum === 'kayitli'
    ? h`<button class="btn btn-ghost" type="submit" name="_eylem" value="eslestir">
        Eşleştirmeye al</button>` : ''}
        ${secilen.durum === 'eslestirmede' || secilen.durum === 'revizyon_istendi'
    ? h`<button class="btn btn-acc" type="submit" name="_eylem" value="onaya_gonder">
        Onaya gönder</button>` : ''}
        ${secilen.durum === 'onaya_gonderildi'
    ? h`<button class="btn btn-ghost" type="submit" name="_eylem" value="geri_cek">
        Onaydan geri çek</button>` : ''}
        ${['kayitli', 'eslestirmede'].includes(secilen.durum)
    ? h`<button class="btn btn-danger" type="submit" name="_eylem" value="iptal_et">İptal et</button>` : ''}
      </div>
    </form>` : ''}
  </div>
</div>` : ''}
${yetkiVar(ctx, 'FIN-13:olustur') ? B.form({
    rota: '/faturalar', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni fatura',
      aciklama: 'Aynı tedarikçiden aynı numaralı fatura iki kez kaydedilemez (mükerrer fatura koruması).',
      alanlar: h`
      ${B.alan({ ad: 'faturaNo', etiket: 'Fatura no', zorunlu: true, deger: deger.faturaNo || '',
    hata: hata?.alanlar?.faturaNo })}
      ${B.alan({ ad: 'yon', etiket: 'Yön', deger: deger.yon || 'gelen',
    secenekler: [{ deger: 'gelen', etiket: 'Gelen (alış)' }, { deger: 'giden', etiket: 'Giden (satış)' }] })}
      ${B.alan({ ad: 'tedarikciId', etiket: 'Tedarikçi', deger: deger.tedarikciId || '',
    secenekler: [{ deger: '', etiket: 'Seçin…' }, ...sorgu(
      `SELECT id, kod, unvan FROM tedarikci WHERE tenant_id = ? ORDER BY unvan`, ctx.tenant.id)
      .map((t) => ({ deger: t.id, etiket: `${t.kod} — ${t.unvan}` }))] })}
      ${B.alan({ ad: 'cariId', etiket: 'Cari', deger: deger.cariId || '',
    secenekler: [{ deger: '', etiket: 'Otomatik' }, ...cariSecenekleri(ctx)] })}
      ${B.alan({ ad: 'siparisId', etiket: 'Sipariş (üçlü eşleştirme için)', deger: deger.siparisId || '',
    secenekler: [{ deger: '', etiket: 'Siparişsiz' }, ...siparisler] })}
      ${B.alan({ ad: 'hakedisId', etiket: 'Hakediş', deger: deger.hakedisId || '',
    secenekler: [{ deger: '', etiket: 'Hakedişsiz' }, ...hakedisler] })}
      ${B.alan({ ad: 'faturaTarihi', etiket: 'Fatura tarihi', tur: 'date',
    deger: deger.faturaTarihi || gunAnahtari(simdi()) })}
      ${B.alan({ ad: 'vadeTarihi', etiket: 'Vade tarihi', tur: 'date', deger: deger.vadeTarihi || '' })}
      ${B.alan({ ad: 'matrah', etiket: 'Matrah', zorunlu: true, deger: deger.matrah || '',
    hata: hata?.alanlar?.matrah })}
      ${B.alan({ ad: 'kdv', etiket: 'KDV', deger: deger.kdv || '' })}` }],
    eylemler: B.btn('Faturayı kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/* ==========================================================================
   FIN-14 üçlü eşleştirme
   ========================================================================== */
function ucluIslem(ctx, govde) {
  const f = tek('SELECT * FROM fatura WHERE id = ? AND tenant_id = ?', govde.faturaId, ctx.tenant.id);
  if (!f) throw Bulunamadi('Fatura bulunamadı.');
  if (['odendi', 'iptal'].includes(f.durum)) throw GecisIzinsiz('Kapanmış fatura yeniden eşleştirilemez.');

  const sonuc = ucluEslestir(f.id);
  if (!sonuc) throw Bulunamadi('Eşleştirme yapılamadı.');
  /* Tolerans dışı fark GEREKÇE ister; kullanıcı sonucu değiştiremez, yalnız açıklar. */
  if (sonuc.sonuc === 'tolerans_disi' && !String(govde.gerekce || '').trim()) {
    throw DogrulamaHatasi(
      `Fark ${para(sonuc.fark, f.tutar_birim)}, tolerans sınırını (${para(sonuc.sinir, f.tutar_birim)}) aşıyor; `
      + 'gerekçe zorunludur ve fatura onaya gider.',
      { alanlar: { gerekce: ['Farkın nedenini yazın.'] } });
  }
  if (sonuc.sonuc === 'eslesmedi') {
    throw GecisIzinsiz('Faturaya bağlı sipariş veya mal kabul yok; üçlü eşleştirme yapılamaz.');
  }

  islem(() => {
    surumluGuncelle('fatura', f.id, f.surum, {
      eslestirme: sonuc.sonuc, fark_minor: String(sonuc.fark),
      fark_gerekcesi: govde.gerekce || null,
      durum: f.durum === 'kayitli' ? 'eslestirmede' : f.durum,
    }, { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });

    /* Faturalanan miktar sipariş kalemlerine işlenir (kalan fatura takibi). */
    for (const m of sonuc.kabuller) {
      for (const k of sorgu('SELECT * FROM mal_kabul_kalemi WHERE mal_kabul_id = ?', m.id)) {
        if (!k.siparis_kalemi_id || !k.kabul_binde) continue;
        calistir(`UPDATE siparis_kalemi SET faturalanan_binde =
                    MIN(miktar_binde, faturalanan_binde + ?) WHERE id = ?`, k.kabul_binde, k.siparis_kalemi_id);
      }
    }
    /* Cari defterine fatura kaydı — bakiye buradan türer. */
    if (f.cari_id && !fdefter.kaynakHareketleri('cari', 'fatura', f.id).length) {
      const c = tek('SELECT * FROM cari WHERE id = ?', f.cari_id);
      if (c) {
        fdefter.hareketYaz(ctx, 'cari', {
          sahipId: c.id, tur: 'fatura', tutarMinor: Number(f.toplam_minor), tutarBirim: f.tutar_birim,
          vade: f.vade_tarihi, kaynakNesne: 'fatura', kaynakId: f.id, zaman: f.fatura_tarihi,
          aciklama: `${f.fatura_no} numaralı fatura`,
        });
      }
    }
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'fatura', nesneId: f.id, eylem: `uclu_eslestirme:${sonuc.sonuc}`,
      gerekce: govde.gerekce || null,
      sonraki: { siparisMinor: sonuc.siparisTutar, teslimMinor: sonuc.teslimTutar,
        faturaMinor: sonuc.faturaTutar, farkMinor: sonuc.fark, sinirMinor: sonuc.sinir } });
  });

  return sonuc.sonuc === 'eslesti' ? 'Üçlü eşleştirme tuttu; fatura onaya hazır'
    : sonuc.sonuc === 'tolerans_ici'
      ? `Tolerans içi fark (${para(sonuc.fark, f.tutar_birim)}); fatura onaya hazır`
      : `TOLERANS DIŞI fark (${para(sonuc.fark, f.tutar_birim)}) gerekçeyle kaydedildi; onaya gitmelidir`;
}

function ucluSayfasi(ctx, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('FIN-14');
  yetkiZorunlu(ctx, e.yetki);
  const bekleyenler = sorgu(
    `SELECT * FROM fatura WHERE tenant_id = ? AND durum NOT IN ('odendi','iptal','reddedildi')
      ORDER BY fatura_tarihi DESC LIMIT 100`, ctx.tenant.id);
  const secilenId = ctx.sorgu.get('fatura_id') || bekleyenler[0]?.id || null;
  const sonuc = secilenId ? ucluEslestir(secilenId) : null;

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.kpiSeridi([
    { etiket: 'Eşleştirme bekleyen', ton: 'warn', ikon: 'fa-code-compare',
      deger: sayi(bekleyenler.filter((f) => f.eslestirme === 'yapilmadi').length) },
    { etiket: 'Eşleşen', ikon: 'fa-circle-check',
      deger: sayi(sayac(ctx.tenant.id, 'fatura', `eslestirme IN ('eslesti','tolerans_ici')`)) },
    { etiket: 'Tolerans dışı', ton: 'danger', ikon: 'fa-triangle-exclamation',
      deger: sayi(sayac(ctx.tenant.id, 'fatura', `eslestirme = 'tolerans_disi'`)) },
    { etiket: 'Tolerans', ikon: 'fa-percent', deger: `‰${TOLERANS_BINDE}`,
      alt: `en çok ${para(TOLERANS_TAVAN_MINOR, ctx.tenant.para_birimi)}` },
  ])}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Faturalar</b>
        <span>Eşleştirme sonucu HESAPLANIR; kullanıcı "eşleşti" diyemez.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: bekleyenler,
    satirRota: (f) => `/faturalar/eslestirme?fatura_id=${f.id}`,
    bosDurum: { baslik: 'Eşleştirilecek fatura yok', ikon: 'fa-code-compare' },
    sutunlar: [
      { ad: 'fatura_no', etiket: 'Fatura', govde: (f) => h`<b>${f.fatura_no}</b>${
        f.id === secilenId ? h` ${B.isaret('seçili', 'info')}` : ''}` },
      { ad: 'siparis_id', etiket: 'Sipariş', govde: (f) => (f.siparis_id
        ? tek('SELECT kod FROM siparis WHERE id = ?', f.siparis_id)?.kod || '—'
        : B.isaret('siparişsiz', 'warn')) },
      { ad: 'toplam_minor', etiket: 'Toplam', hizala: 'sag', govde: (f) => para(f.toplam_minor, f.tutar_birim) },
      { ad: 'eslestirme', etiket: 'Sonuç', govde: (f) => B.isaret(
        { yapilmadi: 'yapılmadı', eslesti: 'eşleşti', tolerans_ici: 'tolerans içi',
          tolerans_disi: 'TOLERANS DIŞI', eslesmedi: 'eşleşmedi' }[f.eslestirme],
        f.eslestirme === 'eslesti' ? 'ok' : f.eslestirme === 'tolerans_ici' ? 'warn'
          : f.eslestirme === 'yapilmadi' ? 'info' : 'danger') },
    ],
  })}</div>
    </div>
    ${sonuc ? h`<div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>${sonuc.fatura.fatura_no} — üçlü karşılaştırma</b>
        <span>Sipariş ↔ mal kabul ↔ fatura. Fark tolerans sınırını aşarsa onaya gider.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: [
      { ad: 'Sipariş tutarı', deger: sonuc.siparisTutar,
        not: sonuc.siparis ? `${sonuc.siparis.kod} · onaylı sipariş` : 'sipariş yok' },
      { ad: 'Teslim alınan (mal kabul)', deger: sonuc.teslimTutar,
        not: `${sonuc.kabuller.length} kabul belgesi · kabul edilen miktar × sipariş fiyatı` },
      { ad: 'Fatura matrahı', deger: sonuc.faturaTutar, not: sonuc.fatura.fatura_no },
      { ad: 'FARK (fatura − teslim)', deger: sonuc.fark, vurgu: true,
        not: `tolerans sınırı ${para(sonuc.sinir, sonuc.fatura.tutar_birim)}` },
    ],
    bosDurum: { baslik: 'Veri yok' },
    sutunlar: [
      { ad: 'ad', etiket: 'Kalem', govde: (r) => (r.vurgu ? h`<b>${r.ad}</b>` : r.ad) },
      { ad: 'not', etiket: 'Kaynak', govde: (r) => h`<span class="muted">${r.not}</span>` },
      { ad: 'deger', etiket: 'Tutar', hizala: 'sag', govde: (r) => (r.deger == null ? '—'
        : r.vurgu
          ? (Math.abs(r.deger) > sonuc.sinir
            ? B.isaret(para(r.deger, sonuc.fatura.tutar_birim), 'danger')
            : B.isaret(para(r.deger, sonuc.fatura.tutar_birim), 'ok'))
          : para(r.deger, sonuc.fatura.tutar_birim)) },
    ],
  })}</div>
      ${sonuc.satirlar.length ? h`<div class="gc-body flush">${B.tablo({
    satirlar: sonuc.satirlar,
    bosDurum: { baslik: 'Kalem yok' },
    sutunlar: [
      { ad: 'malKabul', etiket: 'Mal kabul' },
      { ad: 'aciklama', etiket: 'Kalem' },
      { ad: 'kabulBinde', etiket: 'Kabul', hizala: 'sag', govde: (r) => miktarMetni(r.kabulBinde) },
      { ad: 'birimFiyat', etiket: 'Sipariş fiyatı', hizala: 'sag',
        govde: (r) => para(r.birimFiyat, sonuc.fatura.tutar_birim) },
      { ad: 'tutar', etiket: 'Tutar', hizala: 'sag', govde: (r) => para(r.tutar, sonuc.fatura.tutar_birim) },
    ],
  })}</div>` : ''}
    </div>` : ''}
  </div>
  <div class="gv-side-stack">
    ${sonuc && yetkiVar(ctx, 'FIN-14:guncelle') ? h`
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Eşleştirmeyi çalıştır</b>
        <span>Sonucu sistem yazar; siz yalnız farkı açıklarsınız.</span></div></div>
      <div class="gc-body">
        ${sonuc.sonuc === 'tolerans_disi' ? B.sonucSeridi({ tur: 'hata',
    baslik: `Tolerans dışı fark: ${para(sonuc.fark, sonuc.fatura.tutar_birim)}`,
    aciklama: 'Gerekçe zorunlu; fatura onaya gitmeden ödenemez.' }) : ''}
        <form method="post" action="/faturalar/eslestirme" data-gform="1">
          ${ham(csrfAlani(ctx))}
          <input type="hidden" name="faturaId" value="${sonuc.fatura.id}">
          ${B.alan({ ad: 'gerekce', etiket: 'Fark gerekçesi', tur: 'metin',
    deger: sonuc.fatura.fark_gerekcesi || '',
    ipucu: 'Tolerans dışı farkta zorunludur.' })}
          <div style="margin-top:12px">${B.btn('Eşleştirmeyi çalıştır',
    { tur: 'acc', gonder: true, ikon: 'fa-code-compare' })}</div>
        </form>
      </div>
    </div>` : ''}
    <div class="gv-card"><div class="gc-body">
      <div class="gv-cap-sm">Tolerans kuralı</div>
      <p style="margin-top:10px;font-size:12.5px;line-height:1.7;color:var(--muted)">
        Fark, teslim tutarının <b>binde ${TOLERANS_BINDE}</b>'ini veya
        <b>${para(TOLERANS_TAVAN_MINOR, ctx.tenant.para_birimi)}</b>'yi (hangisi küçükse) aşmıyorsa
        tolerans içi sayılır. Tolerans yuvarlama ve kur farkı içindir; iş kararı için değil.</p>
    </div></div>
  </div>
</div>
${B.veriTarihi(simdi())}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/* ==========================================================================
   FIN-11 / FIN-12 ödeme
   ========================================================================== */
function odemeIslemi(ctx, govde) {
  if (!govde._eylem || govde._eylem === 'ac') {
    yetkiZorunlu(ctx, 'FIN-11:olustur');
    const baslik = String(govde.baslik || '').trim();
    if (!baslik) throw DogrulamaHatasi('Başlık zorunludur.', { alanlar: { baslik: ['Başlık girin.'] } });
    const fatura = govde.faturaId
      ? tek('SELECT * FROM fatura WHERE id = ? AND tenant_id = ?', govde.faturaId, ctx.tenant.id) : null;
    const hakedis = govde.hakedisId
      ? tek('SELECT * FROM hakedis WHERE id = ? AND tenant_id = ?', govde.hakedisId, ctx.tenant.id) : null;
    /* Ödeme yalnız ONAYLI belgeye açılır: onaysız harcama yapılamaz. */
    if (fatura && !['onaylandi', 'odendi'].includes(fatura.durum)) {
      throw GecisIzinsiz(`Fatura "${fatura.durum}" durumunda; onaysız faturaya ödeme talebi açılamaz.`);
    }
    if (hakedis && hakedis.durum !== 'onaylandi') {
      throw GecisIzinsiz('Onaysız hakedişe ödeme talebi açılamaz.');
    }
    const tutar = fatura ? BigInt(fatura.toplam_minor)
      : hakedis ? BigInt(hakedis.net_minor)
        : Para.ayristir(govde.tutar || '', ctx.tenant.para_birimi).minor;
    if (tutar <= 0n) {
      throw DogrulamaHatasi('Tutar sıfırdan büyük olmalı.', { alanlar: { tutar: ['Tutar girin.'] } });
    }
    return islem(() => {
      const kod = sonrakiKod(ctx.tenant.id, 'odeme');
      const id = kimlik('odeme');
      calistir(`INSERT INTO odeme (id, tenant_id, kod, baslik, cari_id, fatura_id, hakedis_id,
                  tutar_minor, tutar_birim, planlanan_tarih, yontem, kasa_id, banka_hesap_id,
                  durum, olusturan, olusturuldu) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'taslak', ?,?)`,
        id, ctx.tenant.id, kod, baslik, govde.cariId || fatura?.cari_id || null,
        fatura?.id || null, hakedis?.id || null, String(tutar),
        fatura?.tutar_birim || ctx.tenant.para_birimi,
        govde.planlananTarih ? gunBaslangici(govde.planlananTarih) : (fatura?.vade_tarihi || null),
        govde.yontem || 'havale', govde.kasaId || null, govde.bankaHesapId || null,
        ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'odeme', nesneId: id, eylem: 'olustur',
        sonraki: { kod, baslik, tutarMinor: String(tutar) } });
      return `${kod} ödeme talebi açıldı`;
    });
  }

  const o = tek('SELECT * FROM odeme WHERE id = ? AND tenant_id = ?', govde.odemeId, ctx.tenant.id);
  if (!o) throw Bulunamadi('Ödeme talebi bulunamadı.');
  yetkiZorunlu(ctx, 'FIN-11:guncelle');

  if (govde._eylem === 'onaya_gonder') {
    islem(() => {
      onayMotoru.onayaGonder(ctx, {
        nesne: 'odeme', nesneId: o.id, nesneKod: o.kod, baslik: `Ödeme talebi: ${o.baslik}`,
        belgeSurum: o.surum, tutarMinor: Number(o.tutar_minor), tutarBirim: o.tutar_birim,
        gerekce: govde.gerekce || null,
      });
      gecisYap(ctx, { nesne: 'odeme', tablo: 'odeme', kayit: o, eylem: 'onaya_gonder',
        gerekce: govde.gerekce, ekranKodu: 'FIN-11' });
    });
    return 'Ödeme talebi onaya gönderildi';
  }
  if (govde._eylem === 'kasadan_ode') {
    if (o.durum !== 'onaylandi') throw GecisIzinsiz('Yalnız ONAYLI ödeme talebi gerçekleştirilir.');
    const k = tek('SELECT * FROM kasa WHERE id = ? AND tenant_id = ?', govde.kasaId || o.kasa_id, ctx.tenant.id);
    if (!k) throw DogrulamaHatasi('Kasa seçin.', { alanlar: { kasaId: ['Kasa bulunamadı.'] } });
    const zaman = simdi();
    donemKilidiKontrol(ctx, zaman);
    islem(() => {
      fdefter.hareketYaz(ctx, 'kasa', {
        sahipId: k.id, tur: 'odeme', tutarMinor: BigInt(o.tutar_minor), tutarBirim: o.tutar_birim,
        cariId: o.cari_id, santiyeId: k.santiye_id, projeId: k.proje_id,
        kaynakNesne: 'odeme', kaynakId: o.id, belgeNo: o.kod,
        aciklama: `${o.kod} — ${o.baslik}`, zaman,
      });
      if (o.cari_id) {
        const c = tek('SELECT * FROM cari WHERE id = ?', o.cari_id);
        if (c) {
          fdefter.hareketYaz(ctx, 'cari', {
            sahipId: c.id, tur: 'odeme', tutarMinor: BigInt(o.tutar_minor), tutarBirim: o.tutar_birim,
            kaynakNesne: 'odeme', kaynakId: o.id, zaman, aciklama: `${o.kod} kasadan ödeme`,
          });
        }
      }
      calistir(`UPDATE odeme SET durum = 'odendi', odeme_tarihi = ?, kasa_id = ?, surum = surum + 1
                 WHERE id = ?`, zaman, k.id, o.id);
      if (o.fatura_id) {
        const f = tek('SELECT * FROM fatura WHERE id = ?', o.fatura_id);
        if (f && f.durum === 'onaylandi') {
          gecisYap(ctx, { nesne: 'fatura', tablo: 'fatura', kayit: f, eylem: 'odendi_isaretle', motor: true });
        }
      }
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'odeme', nesneId: o.id, eylem: 'kasadan_odendi',
        sonraki: { kasa: k.kod, tutarMinor: o.tutar_minor } });
    });
    return 'Ödeme kasadan gerçekleştirildi ve deftere yazıldı';
  }
  if (['geri_cek', 'iptal_et'].includes(govde._eylem)) {
    gecisYap(ctx, { nesne: 'odeme', tablo: 'odeme', kayit: o, eylem: govde._eylem,
      gerekce: govde.gerekce, ekranKodu: 'FIN-11' });
    return 'Ödeme durumu güncellendi';
  }
  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

function odemeSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('FIN-11');
  yetkiZorunlu(ctx, e.yetki);
  const { kosullar, parametreler } = filtreKosullari(ctx, {
    aramaAlanlari: ['baslik', 'kod'], filtreler: [{ ad: 'durum' }, { ad: 'yontem' }],
  });
  const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
    { tablo: 'odeme', kosullar, parametreler, sirala: 'olusturuldu DESC',
      kapsamSecenekleri: { projeSutunu: null, santiyeSutunu: null } });
  const onayliFaturalar = sorgu(
    `SELECT id, kod, fatura_no, toplam_minor, tutar_birim FROM fatura
      WHERE tenant_id = ? AND durum = 'onaylandi' ORDER BY vade_tarihi LIMIT 100`, ctx.tenant.id)
    .map((f) => ({ deger: f.id, etiket: `${f.fatura_no} — ${para(f.toplam_minor, f.tutar_birim)}` }));
  const onayliHakedisler = sorgu(
    `SELECT id, kod, no, net_minor, tutar_birim FROM hakedis
      WHERE tenant_id = ? AND durum = 'onaylandi' ORDER BY olusturuldu DESC LIMIT 100`, ctx.tenant.id)
    .map((x) => ({ deger: x.id, etiket: `${x.kod} — ${para(x.net_minor, x.tutar_birim)}` }));

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Onay bekleyen', deger: sayi(sayac(ctx.tenant.id, 'odeme',
        `durum IN ('onaya_gonderildi','incelemede')`)), ikon: 'fa-hourglass-half' },
      { etiket: 'Ödemeye hazır', deger: sayi(sayac(ctx.tenant.id, 'odeme', `durum = 'onaylandi'`)),
        ikon: 'fa-money-bill-transfer', ton: 'warn' },
      { etiket: 'Ödenen', deger: sayi(sayac(ctx.tenant.id, 'odeme', `durum = 'odendi'`)), ikon: 'fa-circle-check' },
      { etiket: 'Bekleyen tutar', ikon: 'fa-coins', deger: para(Number(tek(
        `SELECT COALESCE(SUM(tutar_minor),0) AS n FROM odeme WHERE tenant_id = ?
           AND durum IN ('onaylandi','onaya_gonderildi','incelemede')`, ctx.tenant.id)?.n ?? 0),
      ctx.tenant.para_birimi) },
    ]),
    filtre: B.filtreBari({ rota: '/odemeler', sorgu: ctx.sorgu, aramaYer: 'Başlık veya kod…',
      filtreler: [
        { ad: 'durum', etiket: 'Durum', secenekler: ['taslak', 'onaya_gonderildi', 'incelemede',
          'onaylandi', 'odendi', 'reddedildi'].map((d) => ({ deger: d, etiket: d })) },
        { ad: 'yontem', etiket: 'Yöntem', secenekler: ODEME_YONTEMLERI },
      ] }),
    icerik: B.tablo({
      satirlar,
      bosDurum: { baslik: 'Ödeme talebi yok', ikon: 'fa-money-bill-transfer',
        aciklama: 'Ödeme yalnız ONAYLI fatura veya hakedişe açılır.' },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'baslik', etiket: 'Ödeme', govde: (r) => h`<b>${r.baslik}</b>${r.fatura_id
          ? h`<br><span class="muted">fatura: ${
            tek('SELECT fatura_no FROM fatura WHERE id = ?', r.fatura_id)?.fatura_no || ''}</span>`
          : r.hakedis_id ? h`<br><span class="muted">hakediş: ${
            tek('SELECT kod FROM hakedis WHERE id = ?', r.hakedis_id)?.kod || ''}</span>` : ''}` },
        { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag',
          govde: (r) => h`<b>${para(r.tutar_minor, r.tutar_birim)}</b>` },
        { ad: 'planlanan_tarih', etiket: 'Planlanan', govde: (r) => (!r.planlanan_tarih ? '—'
          : r.planlanan_tarih < simdi() && r.durum !== 'odendi'
            ? B.isaret(tarih(r.planlanan_tarih), 'danger') : tarih(r.planlanan_tarih)) },
        { ad: 'yontem', etiket: 'Yöntem',
          govde: (r) => ODEME_YONTEMLERI.find((y) => y.deger === r.yontem)?.etiket || r.yontem },
        { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
        { ad: 'islem', etiket: '', govde: (r) => {
          if (!yetkiVar(ctx, 'FIN-11:guncelle')) return '—';
          if (r.durum === 'taslak') {
            return h`<form method="post" action="/odemeler" style="display:inline">${ham(csrfAlani(ctx))}
              <input type="hidden" name="_eylem" value="onaya_gonder">
              <input type="hidden" name="odemeId" value="${r.id}">
              <button class="btn btn-acc btn-sm" type="submit">Onaya gönder</button></form>`;
          }
          if (r.durum === 'onaylandi' && r.yontem === 'nakit') {
            return h`<form method="post" action="/odemeler" style="display:flex;gap:6px">
              ${ham(csrfAlani(ctx))}
              <input type="hidden" name="_eylem" value="kasadan_ode">
              <input type="hidden" name="odemeId" value="${r.id}">
              <select name="kasaId" aria-label="Kasa">${sorgu(
    `SELECT id, kod FROM kasa WHERE tenant_id = ? AND durum = 'aktif'`, ctx.tenant.id)
    .map((k) => h`<option value="${k.id}">${k.kod}</option>`)}</select>
              <button class="btn btn-acc btn-sm" type="submit">Kasadan öde</button></form>`;
          }
          if (r.durum === 'onaylandi') {
            return h`<a class="btn btn-ghost btn-sm" href="/banka-hareketleri/eslestirme">Banka eşleştir</a>`;
          }
          return '—';
        } },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: '/odemeler', sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'FIN-11:olustur') ? B.form({
    rota: '/odemeler', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni ödeme talebi',
      aciklama: 'Fatura veya hakediş seçilirse tutar O BELGEDEN alınır; elle değiştirilemez. '
        + 'Onaysız belgeye ödeme açılamaz.',
      alanlar: h`
      ${B.alan({ ad: 'baslik', etiket: 'Başlık', zorunlu: true, genis: true, deger: deger.baslik || '',
    hata: hata?.alanlar?.baslik })}
      ${B.alan({ ad: 'faturaId', etiket: 'Fatura', deger: deger.faturaId || '',
    secenekler: [{ deger: '', etiket: 'Faturasız' }, ...onayliFaturalar] })}
      ${B.alan({ ad: 'hakedisId', etiket: 'Hakediş', deger: deger.hakedisId || '',
    secenekler: [{ deger: '', etiket: 'Hakedişsiz' }, ...onayliHakedisler] })}
      ${B.alan({ ad: 'cariId', etiket: 'Cari', deger: deger.cariId || '',
    secenekler: [{ deger: '', etiket: 'Otomatik' }, ...cariSecenekleri(ctx)] })}
      ${B.alan({ ad: 'tutar', etiket: 'Tutar (belge seçilmediyse)', deger: deger.tutar || '',
    hata: hata?.alanlar?.tutar })}
      ${B.alan({ ad: 'planlananTarih', etiket: 'Planlanan ödeme tarihi', tur: 'date',
    deger: deger.planlananTarih || '' })}
      ${B.alan({ ad: 'yontem', etiket: 'Yöntem', deger: deger.yontem || 'havale',
    secenekler: ODEME_YONTEMLERI })}` }],
    eylemler: B.btn('Talebi aç', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/** FIN-12 — ödeme planı: haftalık nakit çıkış takvimi. */
function odemePlani(ctx) {
  const e = ekranNesnesi('FIN-12');
  yetkiZorunlu(ctx, e.yetki);
  const hafta = Math.min(16, Math.max(2, Number(ctx.sorgu.get('hafta')) || 8));
  const bas = gunBaslangici(gunAnahtari(simdi()));
  const HAFTA = 7 * GUN_MS;

  const odemeler = sorgu(
    `SELECT * FROM odeme WHERE tenant_id = ? AND durum IN ('taslak','onaya_gonderildi','incelemede','onaylandi')
      ORDER BY planlanan_tarih`, ctx.tenant.id);
  const faturalar = sorgu(
    `SELECT * FROM fatura WHERE tenant_id = ? AND yon = 'gelen'
       AND durum NOT IN ('odendi','iptal','reddedildi') ORDER BY vade_tarihi`, ctx.tenant.id);

  const haftalar = Array.from({ length: hafta }, (_, i) => {
    const hBas = bas + i * HAFTA;
    const hSon = hBas + HAFTA;
    const o = odemeler.filter((x) => x.planlanan_tarih && x.planlanan_tarih >= hBas && x.planlanan_tarih < hSon);
    const f = faturalar.filter((x) => x.vade_tarihi && x.vade_tarihi >= hBas && x.vade_tarihi < hSon
      && !odemeler.some((y) => y.fatura_id === x.id));
    return { no: i + 1, bas: hBas, son: hSon,
      odemeToplam: o.reduce((a, x) => a + Number(x.tutar_minor), 0),
      faturaToplam: f.reduce((a, x) => a + Number(x.toplam_minor), 0),
      odemeler: o, faturalar: f };
  });
  const gecmis = [
    ...odemeler.filter((x) => x.planlanan_tarih && x.planlanan_tarih < bas),
    ...faturalar.filter((x) => x.vade_tarihi && x.vade_tarihi < bas
      && !odemeler.some((y) => y.fatura_id === x.id)),
  ];
  const kasaBanka = [...fdefter.bakiyeler('kasa', ctx.tenant.id), ...fdefter.bakiyeler('banka', ctx.tenant.id)]
    .reduce((a, k) => a + k.bakiye_minor, 0);

  let kalan = kasaBanka;
  const projeksiyon = haftalar.map((w) => {
    kalan -= w.odemeToplam + w.faturaToplam;
    return { ...w, kalanNakit: kalan };
  });

  const icerik = h`
${B.kpiSeridi([
    { etiket: 'Mevcut nakit', deger: para(kasaBanka, ctx.tenant.para_birimi), ikon: 'fa-wallet',
      alt: 'kasa + banka · defterden' },
    { etiket: `${hafta} haftalık çıkış`, ikon: 'fa-arrow-down',
      deger: para(haftalar.reduce((a, w) => a + w.odemeToplam + w.faturaToplam, 0), ctx.tenant.para_birimi) },
    { etiket: 'Vadesi geçmiş', ton: gecmis.length ? 'danger' : '', ikon: 'fa-clock',
      deger: para(gecmis.reduce((a, x) => a + Number(x.tutar_minor || x.toplam_minor), 0),
        ctx.tenant.para_birimi) },
    { etiket: 'Dönem sonu nakit', ton: kalan < 0 ? 'danger' : '', ikon: 'fa-scale-balanced',
      deger: para(kalan, ctx.tenant.para_birimi) },
  ])}
${B.filtreBari({ rota: '/odemeler/plan', sorgu: ctx.sorgu, aramaYer: 'Ara…',
    filtreler: [{ ad: 'hafta', etiket: 'Pencere',
      secenekler: [4, 8, 12, 16].map((n) => ({ deger: String(n), etiket: `${n} hafta` })) }] })}
${kalan < 0 ? B.sonucSeridi({ tur: 'hata', baslik: 'Nakit açığı öngörülüyor',
    aciklama: `${hafta} hafta sonunda ${para(kalan, ctx.tenant.para_birimi)} açık. `
      + 'Ödeme planı veya tahsilat gözden geçirilmeli.' }) : ''}
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Haftalık nakit çıkış projeksiyonu</b>
    <span>Mevcut nakit defterden; çıkışlar onaylı ödeme talepleri ve vadesi gelen faturalardan.</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: projeksiyon,
    bosDurum: { baslik: 'Plan yok' },
    sutunlar: [
      { ad: 'no', etiket: 'Hafta', govde: (w) => h`<b>H${w.no}</b><br><span class="muted">${tarih(w.bas)}</span>` },
      { ad: 'odemeToplam', etiket: 'Ödeme talebi', hizala: 'sag',
        govde: (w) => (w.odemeToplam ? para(w.odemeToplam, ctx.tenant.para_birimi) : '—') },
      { ad: 'faturaToplam', etiket: 'Vadesi gelen fatura', hizala: 'sag',
        govde: (w) => (w.faturaToplam ? para(w.faturaToplam, ctx.tenant.para_birimi) : '—') },
      { ad: 'toplam', etiket: 'Haftalık çıkış', hizala: 'sag',
        govde: (w) => para(w.odemeToplam + w.faturaToplam, ctx.tenant.para_birimi) },
      { ad: 'kalanNakit', etiket: 'Kalan nakit', hizala: 'sag', govde: (w) => (w.kalanNakit < 0
        ? B.isaret(para(w.kalanNakit, ctx.tenant.para_birimi), 'danger')
        : para(w.kalanNakit, ctx.tenant.para_birimi)) },
    ],
  })}</div>
</div>
<div class="gv-card"><div class="gc-body">
  <div class="gv-cap-sm">Rapor künyesi</div>
  <dl class="gd-grid" style="margin-top:12px;padding-top:0;border-top:0">
    <div><dt>Pencere</dt><dd>${hafta} hafta · ${tarih(bas)} başlangıçlı</dd></div>
    <div><dt>Veri tarihi</dt><dd>${tarih(simdi())}</dd></div>
    <div><dt>Rapor sürümü</dt><dd>FIN-12 v1</dd></div>
  </dl>
</div></div>
${B.veriTarihi(simdi())}`;
  return html(ctx, 200, ciz(ctx, e, icerik));
}

/* ==========================================================================
   FIN-15 dönem kapanışı
   ========================================================================== */
/** Kapanış engelleri — hepsi canlı sorgudan; hiçbiri beyanla geçilemez. */
function kapanisEngelleri(tenantId, donem) {
  const bas = gunBaslangici(`${donem}-01`);
  const [y, a] = donem.split('-').map(Number);
  const son = gunBaslangici(a === 12 ? `${y + 1}-01-01` : `${y}-${String(a + 1).padStart(2, '0')}-01`);
  const say = (sql, ...p) => Number(tek(sql, ...p)?.n ?? 0);

  return [
    { ad: 'Eşleşmemiş banka hareketi', adet: say(
      `SELECT COUNT(*) AS n FROM banka_hareketi WHERE tenant_id = ? AND eslesen_id IS NULL
         AND zaman >= ? AND zaman < ?`, tenantId, bas, son), rota: '/banka-hareketleri/eslestirme' },
    { ad: 'Eşleştirilmemiş fatura', adet: say(
      `SELECT COUNT(*) AS n FROM fatura WHERE tenant_id = ? AND eslestirme = 'yapilmadi'
         AND durum NOT IN ('iptal','reddedildi') AND fatura_tarihi >= ? AND fatura_tarihi < ?`,
      tenantId, bas, son), rota: '/faturalar/eslestirme' },
    { ad: 'Tolerans dışı fark (gerekçesiz)', adet: say(
      `SELECT COUNT(*) AS n FROM fatura WHERE tenant_id = ? AND eslestirme = 'tolerans_disi'
         AND (fark_gerekcesi IS NULL OR fark_gerekcesi = '')`, tenantId), rota: '/faturalar/eslestirme' },
    { ad: 'Karara bağlanmamış fatura', adet: say(
      `SELECT COUNT(*) AS n FROM fatura WHERE tenant_id = ? AND durum IN ('kayitli','eslestirmede')
         AND fatura_tarihi >= ? AND fatura_tarihi < ?`, tenantId, bas, son), rota: '/faturalar' },
    { ad: 'Onayda bekleyen fatura', adet: say(
      `SELECT COUNT(*) AS n FROM fatura WHERE tenant_id = ? AND durum IN ('onaya_gonderildi','incelemede')`,
      tenantId), rota: '/faturalar' },
    { ad: 'Onayda bekleyen ödeme', adet: say(
      `SELECT COUNT(*) AS n FROM odeme WHERE tenant_id = ? AND durum IN ('onaya_gonderildi','incelemede')`,
      tenantId), rota: '/odemeler' },
    { ad: 'Onayda bekleyen hakediş', adet: say(
      `SELECT COUNT(*) AS n FROM hakedis WHERE tenant_id = ? AND durum IN ('onaya_gonderildi','incelemede')`,
      tenantId), rota: '/hakedisler' },
    { ad: 'Kapanmamış stok sayımı', adet: say(
      `SELECT COUNT(*) AS n FROM stok_sayimi WHERE tenant_id = ?
         AND durum NOT IN ('onaylandi','reddedildi','iptal')`, tenantId), rota: '/stok/sayim' },
    { ad: 'Negatif kasa bakiyesi', adet: fdefter.bakiyeler('kasa', tenantId)
      .filter((k) => k.bakiye_minor < 0).length, rota: '/kasalar' },
  ];
}

function donemIslemi(ctx, govde) {
  const donem = String(govde.donem || '').trim();
  if (!/^\d{4}-\d{2}$/.test(donem)) {
    throw DogrulamaHatasi('Dönem YYYY-AA biçiminde olmalı.', { alanlar: { donem: ['Örn. 2026-09'] } });
  }
  const mevcut = tek('SELECT * FROM finans_donemi WHERE tenant_id = ? AND donem = ?', ctx.tenant.id, donem);

  if (govde._eylem === 'kapat') {
    if (mevcut?.durum === 'kapali') throw Cakisma(`${donem} dönemi zaten kapalı.`);
    const kalan = kapanisEngelleri(ctx.tenant.id, donem).filter((x) => x.adet > 0);
    if (kalan.length) {
      throw GecisIzinsiz(`${donem} kapatılamaz — ${kalan.length} engel açık: `
        + `${kalan.map((x) => `${x.ad} (${x.adet})`).join(', ')}.`);
    }
    islem(() => {
      if (mevcut) {
        calistir(`UPDATE finans_donemi SET durum = 'kapali', kapatan = ?, kapandi = ?, gerekce = ?,
                  surum = surum + 1 WHERE id = ?`, ctx.kullanici.id, simdi(), govde.gerekce || null, mevcut.id);
      } else {
        calistir(`INSERT INTO finans_donemi (id, tenant_id, donem, kapatan, kapandi, gerekce,
                    durum, olusturan, olusturuldu) VALUES (?,?,?,?,?,?, 'kapali', ?,?)`,
          kimlik('donem'), ctx.tenant.id, donem, ctx.kullanici.id, simdi(),
          govde.gerekce || null, ctx.kullanici.id, simdi());
      }
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'finans_donemi', nesneId: donem, eylem: 'kapatildi', gerekce: govde.gerekce || null,
        sonraki: { donem, durum: 'kapali' } });
    });
    return `${donem} dönemi kapatıldı; bu döneme yeni finans hareketi yazılamaz`;
  }

  if (govde._eylem === 'yeniden_ac') {
    if (!mevcut || mevcut.durum !== 'kapali') throw GecisIzinsiz('Bu dönem kapalı değil.');
    const gerekce = String(govde.gerekce || '').trim();
    if (!gerekce) {
      throw DogrulamaHatasi('Dönem yeniden açmak gerekçe ister.',
        { alanlar: { gerekce: ['Gerekçe girin.'] } });
    }
    /* Yeniden açma AYRI bir yetkidir: kapatan kişi tek başına geri alamaz. */
    yetkiZorunlu(ctx, 'FIN-15:kapat');
    if (mevcut.kapatan === ctx.kullanici.id) {
      throw GecisIzinsiz('Dönemi kapatan kişi tek başına yeniden açamaz (dört göz).');
    }
    islem(() => {
      calistir(`UPDATE finans_donemi SET durum = 'acik', yeniden_acan = ?, yeniden_acildi = ?,
                gerekce = ?, surum = surum + 1 WHERE id = ?`,
        ctx.kullanici.id, simdi(), gerekce, mevcut.id);
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'finans_donemi', nesneId: donem, eylem: 'yeniden_acildi', gerekce,
        onceki: { durum: 'kapali', kapatan: mevcut.kapatan }, sonraki: { durum: 'acik' } });
    });
    return `${donem} dönemi yeniden açıldı`;
  }
  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

function donemKapanisSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('FIN-15');
  yetkiZorunlu(ctx, e.yetki);
  const donem = ctx.sorgu.get('donem') || donemAnahtari(simdi() - 30 * GUN_MS);
  const engeller = kapanisEngelleri(ctx.tenant.id, donem);
  const kalan = engeller.filter((x) => x.adet > 0);
  const donemler = sorgu(
    `SELECT d.*, k.ad_soyad AS kapatan_ad, a.ad_soyad AS acan_ad FROM finans_donemi d
       LEFT JOIN kullanici k ON k.id = d.kapatan LEFT JOIN kullanici a ON a.id = d.yeniden_acan
      WHERE d.tenant_id = ? ORDER BY d.donem DESC LIMIT 24`, ctx.tenant.id);
  const mevcut = donemler.find((x) => x.donem === donem);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.kpiSeridi([
    { etiket: 'Hedef dönem', deger: donem, ikon: 'fa-calendar-days' },
    { etiket: 'Açık engel', deger: sayi(kalan.length), ikon: 'fa-triangle-exclamation',
      ton: kalan.length ? 'danger' : '' },
    { etiket: 'Kapalı dönem', deger: sayi(donemler.filter((x) => x.durum === 'kapali').length), ikon: 'fa-lock' },
    { etiket: 'Yeniden açılan', deger: sayi(donemler.filter((x) => x.yeniden_acan).length),
      ikon: 'fa-lock-open', ton: donemler.some((x) => x.yeniden_acan) ? 'warn' : '' },
  ])}
${B.filtreBari({ rota: '/finans/donem-kapanis', sorgu: ctx.sorgu, aramaYer: 'Ara…',
    filtreler: [{ ad: 'donem', etiket: 'Dönem',
      secenekler: Array.from({ length: 12 }, (_, i) => {
        const k = donemAnahtari(simdi() - i * 30 * GUN_MS);
        return { deger: k, etiket: k };
      }) }] })}
${kalan.length
    ? B.sonucSeridi({ tur: 'warn', baslik: `${kalan.length} kapanış engeli açık`,
      aciklama: 'Engeller sıfırlanmadan dönem kapatılamaz; kapanış beyanla geçilemez.' })
    : B.sonucSeridi({ tur: 'ok', baslik: 'Kapanış engeli yok' })}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>${donem} kapanış kontrol listesi</b>
        <span>Her satır canlı sorgudan gelir.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: engeller,
    bosDurum: { baslik: 'Kontrol yok' },
    sutunlar: [
      { ad: 'd', etiket: '', govde: (x) => (x.adet > 0 ? B.isaret('engel', 'danger') : B.isaret('temiz', 'ok')) },
      { ad: 'ad', etiket: 'Kontrol', govde: (x) => h`<b>${x.ad}</b>` },
      { ad: 'adet', etiket: 'Açık', hizala: 'sag' },
      { ad: 'rota', etiket: '', govde: (x) => (x.rota ? B.btn('Aç', { rota: x.rota, kucuk: true }) : '—') },
    ],
  })}</div>
    </div>
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Dönem geçmişi</b>
        <span>Yeniden açma AYRI yetkidir ve kapatan kişi tek başına yapamaz (dört göz).</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: donemler,
    bosDurum: { baslik: 'Kapatılmış dönem yok', ikon: 'fa-lock' },
    sutunlar: [
      { ad: 'donem', etiket: 'Dönem', govde: (x) => h`<b>${x.donem}</b>` },
      { ad: 'durum', etiket: 'Durum', govde: (x) => B.rozet(x.durum === 'kapali' ? 'kapali' : 'taslak',
        x.durum === 'kapali' ? 'Kapalı' : 'Açık') },
      { ad: 'kapatan_ad', etiket: 'Kapatan', govde: (x) => h`${x.kapatan_ad || '—'}${
        x.kapandi ? h`<br><span class="muted">${tarih(x.kapandi)}</span>` : ''}` },
      { ad: 'acan_ad', etiket: 'Yeniden açan', govde: (x) => (x.acan_ad
        ? h`${x.acan_ad}<br><span class="muted">${tarih(x.yeniden_acildi)}</span>` : '—') },
      { ad: 'gerekce', etiket: 'Gerekçe', govde: (x) => x.gerekce || '—' },
    ],
  })}</div>
    </div>
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Dönem işlemleri</b>
        <span>Kapalı döneme kasa, banka ve cari hareketi yazılamaz.</span></div></div>
      <div class="gc-body">
        ${mevcut?.durum === 'kapali'
    ? B.sonucSeridi({ tur: 'ok', baslik: `${donem} kapalı`,
      aciklama: `${mevcut.kapatan_ad || ''} tarafından ${tarih(mevcut.kapandi)} tarihinde kapatıldı.` }) : ''}
        ${yetkiVar(ctx, 'FIN-15:tamamla') ? h`
        <form method="post" action="/finans/donem-kapanis" data-gform="1">
          ${ham(csrfAlani(ctx))}
          <input type="hidden" name="donem" value="${donem}">
          ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe / not', tur: 'metin',
    hata: hata?.alanlar?.gerekce })}
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
            ${mevcut?.durum !== 'kapali' ? (kalan.length
      ? h`<button class="btn btn-ghost" type="button" disabled>
          <i class="fa-solid fa-ban"></i> Dönemi kapat</button>
          <span class="gf-err">${kalan.length} engel açık.</span>`
      : h`<button class="btn btn-acc" type="submit" name="_eylem" value="kapat">
          ${donem} dönemini kapat</button>`) : ''}
            ${mevcut?.durum === 'kapali' && yetkiVar(ctx, 'FIN-15:kapat')
    ? h`<button class="btn btn-danger" type="submit" name="_eylem" value="yeniden_ac">
        Dönemi yeniden aç</button>
        <span class="gf-hint">Gerekçe zorunlu; kapatan kişi yeniden açamaz.</span>` : ''}
          </div>
        </form>` : ''}
      </div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/** Fatura ve ödeme onayı motor geri çağrısı. */
export function finansOnaySonucu(ctx, nesne, nesneId, sonuc) {
  const tablo = { fatura: 'fatura', odeme: 'odeme' }[nesne];
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
}
