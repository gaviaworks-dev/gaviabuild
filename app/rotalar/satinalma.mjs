/* ============================================================================
   SATIN ALMA — PRC-01..13
   ----------------------------------------------------------------------------
   PRC-01 KABUL: "Onaylanmamış talep siparişe dönüştürülemez."
   Bu kural TEK yerde durur: `siparisAc()` kaynak talebin durumunu doğrular ve
   sipariş edilen miktarın talep miktarını aşmasını engeller. Sipariş tutarı
   kalemlerden TÜRETİLİR; onay kademesi bu tutardan seçilir (formdan değil).
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik, token, tokenOzeti } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, gunAnahtari, gunBaslangici, GUN_MS } from '../cekirdek/zaman.mjs';
import { Para, BIRIMLER } from '../cekirdek/para.mjs';
import { DogrulamaHatasi, GecisIzinsiz, Bulunamadi, Cakisma, UygulamaHatasi, YetkiYok }
  from '../cekirdek/hata.mjs';
import { idempotent } from '../cekirdek/idempotency.mjs';
import { yapilandirma } from '../cekirdek/yapilandirma.mjs';
import * as onayMotoru from '../moduller/isakisi/onay.mjs';
import { miktarAyristir, miktarMetni } from '../moduller/stok/defter.mjs';
import { kayitModulu, kullaniciSecenekleri, santiyeSecenekleri, projeSecenekleri,
  sayac, gecmisKarti } from './kayit-modulu.mjs';
import {
  ekranNesnesi, hataNesnesi, kullaniciAdi, ciz, kaydiAl, listeSorgusu, filtreKosullari,
  B, h, ham, sayi, csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar,
  sorgu, tek, calistir, islem, surumluGuncelle, audit, sonrakiKod, gecisYap, gecisFormu,
} from './ortak.mjs';

const TEDARIKCI_TURLERI = [
  { deger: 'malzeme', etiket: 'Malzeme' }, { deger: 'hizmet', etiket: 'Hizmet' },
  { deger: 'taseron', etiket: 'Taşeron' }, { deger: 'nakliye', etiket: 'Nakliye' },
  { deger: 'kiralama', etiket: 'Kiralama' }, { deger: 'diger', etiket: 'Diğer' },
];
const ONCELIKLER = [
  { deger: 'dusuk', etiket: 'Düşük' }, { deger: 'normal', etiket: 'Normal' },
  { deger: 'yuksek', etiket: 'Yüksek' }, { deger: 'kritik', etiket: 'Kritik' },
];
const BIRIM_SECENEKLERI = (ctx) => sorgu(
  `SELECT kod, ad FROM sozluk WHERE tenant_id = ? AND kume = 'birim' AND aktif = 1 ORDER BY sira`, ctx.tenant.id)
  .map((s) => ({ deger: s.kod, etiket: s.ad }));

const para = (minor, birim = 'TRY') => (minor == null ? '—' : Para.minor(minor, birim || 'TRY').bicim());

/* Tutar KALEMLERDEN türetilir — hiçbir ekran toplamı elle yazamaz. */
function talepToplami(talepId) {
  const k = sorgu('SELECT miktar_binde, tahmini_fiyat_minor FROM talep_kalemi WHERE talep_id = ?', talepId);
  return k.reduce((a, x) => a + Math.round((x.miktar_binde / 1000) * Number(x.tahmini_fiyat_minor || 0)), 0);
}
function siparisToplami(siparisId) {
  const k = sorgu('SELECT miktar_binde, birim_fiyat_minor FROM siparis_kalemi WHERE siparis_id = ?', siparisId);
  return k.reduce((a, x) => a + Math.round((x.miktar_binde / 1000) * Number(x.birim_fiyat_minor)), 0);
}
function teklifToplami(teklifId) {
  const k = sorgu('SELECT miktar_binde, birim_fiyat_minor FROM teklif_kalemi WHERE teklif_id = ?', teklifId);
  return k.reduce((a, x) => a + Math.round((x.miktar_binde / 1000) * Number(x.birim_fiyat_minor)), 0);
}

const toplamiTazele = (tablo, id, hesap) => {
  const t = hesap(id);
  calistir(`UPDATE ${tablo} SET ${tablo === 'teklif' ? 'toplam_minor' : 'tutar_minor'} = ? WHERE id = ?`,
    String(t), id);
  return t;
};

export function kur(y, ekranRota) {
  /* ================= PRC-11 / PRC-12 / PRC-13 Tedarikçiler ============== */
  kayitModulu(y, ekranRota, {
    nesne: 'tedarikci', tablo: 'tedarikci', kodNesnesi: 'tedarikci', kimlikTuru: 'tedarikci',
    rota: '/tedarikciler', formRotasi: '/tedarikciler?yeni=1',
    baslik: 'Tedarikçi', yeniEtiketi: 'Yeni tedarikçi',
    listeKodu: 'PRC-11', formKodu: null, detayKodu: 'PRC-12', gecisNesnesi: 'proje',
    baslikAlani: 'unvan', sirala: 'unvan ASC',
    aramaAlanlari: ['unvan', 'kod', 'vergi_no'], aramaYer: 'Unvan, kod veya vergi no…',
    filtreler: [
      { ad: 'tur', etiket: 'Tür', secenekler: TEDARIKCI_TURLERI },
      { ad: 'durum', etiket: 'Durum', secenekler: [
        { deger: 'aktif', etiket: 'Aktif' }, { deger: 'pasif', etiket: 'Pasif' },
        { deger: 'kara_liste', etiket: 'Kara liste' }] },
    ],
    alanlar: [],
    kpi: (ctx, toplam) => [
      { etiket: 'Aktif tedarikçi', deger: sayi(sayac(ctx.tenant.id, 'tedarikci', `durum = 'aktif'`)), ikon: 'fa-truck-field' },
      { etiket: 'Kara listede', deger: sayi(sayac(ctx.tenant.id, 'tedarikci', `durum = 'kara_liste'`)),
        ikon: 'fa-ban', ton: 'danger' },
      { etiket: 'Açık sipariş', deger: sayi(sayac(ctx.tenant.id, 'siparis', `durum = 'onaylandi'`)), ikon: 'fa-file-invoice' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ],
    listeSutunlari: () => [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'unvan', etiket: 'Tedarikçi', govde: (r) => h`<a href="/tedarikciler/${r.id}"><b>${r.unvan}</b></a>${
        r.yetkili ? h`<br><span class="muted">${r.yetkili}</span>` : ''}` },
      { ad: 'tur', etiket: 'Tür', govde: (r) => TEDARIKCI_TURLERI.find((t) => t.deger === r.tur)?.etiket || r.tur },
      { ad: 'il', etiket: 'İl', govde: (r) => r.il || '—' },
      { ad: 'siparis', etiket: 'Sipariş', hizala: 'sag', govde: (r) => sayi(Number(tek(
        `SELECT COUNT(*) AS n FROM siparis WHERE tedarikci_id = ? AND durum = 'onaylandi'`, r.id)?.n ?? 0)) },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(
        r.durum === 'aktif' ? 'onaylandi' : r.durum === 'kara_liste' ? 'reddedildi' : 'kapali',
        { aktif: 'Aktif', pasif: 'Pasif', kara_liste: 'Kara liste' }[r.durum]) },
    ],
    bosDurum: { baslik: 'Tedarikçi yok', ikon: 'fa-truck-field',
      aciklama: 'Sipariş ve teklif süreçleri tedarikçi kaydına bağlıdır.' },
    altForm: (ctx) => B.form({
      rota: '/tedarikciler', csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Yeni tedarikçi', alanlar: h`
        ${B.alan({ ad: 'unvan', etiket: 'Unvan', zorunlu: true, genis: true })}
        ${B.alan({ ad: 'tur', etiket: 'Tür', deger: 'malzeme', secenekler: TEDARIKCI_TURLERI })}
        ${B.alan({ ad: 'vergiDairesi', etiket: 'Vergi dairesi' })}
        ${B.alan({ ad: 'vergiNo', etiket: 'Vergi no' })}
        ${B.alan({ ad: 'yetkili', etiket: 'Yetkili kişi' })}
        ${B.alan({ ad: 'telefon', etiket: 'Telefon' })}
        ${B.alan({ ad: 'eposta', etiket: 'E-posta' })}
        ${B.alan({ ad: 'il', etiket: 'İl' })}
        ${B.alan({ ad: 'iban', etiket: 'IBAN' })}
        ${B.alan({ ad: 'odemeVadesiGun', etiket: 'Ödeme vadesi (gün)', tur: 'number', deger: '30' })}
        ${B.alan({ ad: 'adres', etiket: 'Adres', tur: 'metin', genis: true })}` }],
      eylemler: B.btn('Tedarikçiyi kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
    }),
    detayBilgileri: (r) => [
      { etiket: 'Tür', deger: TEDARIKCI_TURLERI.find((t) => t.deger === r.tur)?.etiket || r.tur },
      { etiket: 'Vergi no', deger: r.vergi_no || '—' },
      { etiket: 'Yetkili', deger: r.yetkili || '—' },
      { etiket: 'Telefon', deger: r.telefon || '—' },
      { etiket: 'Ödeme vadesi', deger: r.odeme_vadesi_gun ? `${r.odeme_vadesi_gun} gün` : '—' },
      { etiket: 'IBAN', deger: r.iban || '—' },
    ],
    detayEylemleri: (ctx, r) => B.btn('Değerlendirme',
      { rota: `/tedarikciler/${r.id}/degerlendirme`, ikon: 'fa-chart-simple' }),
    detayEkleri: (ctx, r) => tedarikciSekmeleri(ctx, r),
    detayIslemleri: {
      kara_liste: (ctx, r, govde) => {
        const gerekce = String(govde.gerekce || '').trim();
        if (!gerekce) throw DogrulamaHatasi('Kara liste kararı gerekçe ister.',
          { alanlar: { gerekce: ['Gerekçe girin.'] } });
        const acik = Number(tek(
          `SELECT COUNT(*) AS n FROM siparis WHERE tedarikci_id = ? AND durum = 'onaylandi'`, r.id)?.n ?? 0);
        if (acik) throw GecisIzinsiz(`${acik} açık sipariş var; önce siparişleri kapatın.`);
        islem(() => {
          surumluGuncelle('tedarikci', r.id, Number(govde.surum),
            { durum: 'kara_liste', kara_liste_nedeni: gerekce },
            { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
          audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
            nesne: 'tedarikci', nesneId: r.id, eylem: 'kara_listeye_alindi', gerekce,
            onceki: { durum: r.durum }, sonraki: { durum: 'kara_liste' } });
        });
        return 'Tedarikçi kara listeye alındı';
      },
      aktiflestir: (ctx, r, govde) => {
        islem(() => {
          surumluGuncelle('tedarikci', r.id, Number(govde.surum),
            { durum: 'aktif', kara_liste_nedeni: null },
            { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
          audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
            nesne: 'tedarikci', nesneId: r.id, eylem: 'aktiflestirildi',
            gerekce: govde.gerekce || null, sonraki: { durum: 'aktif' } });
        });
        return 'Tedarikçi aktifleştirildi';
      },
    },
  });

  y.post('/tedarikciler', (ctx, govde) => {
    yetkiZorunlu(ctx, 'PRC-11:olustur');
    csrfZorunlu(ctx, govde);
    return tedarikciAc(ctx, govde);
  }, { ekran: ekranNesnesi('PRC-11') });

  ekranRota(y, 'PRC-13', { get: (ctx, _g, params) => degerlendirmeSayfasi(ctx, params.id) });

  /* ================= PRC-01..03 Satın alma talebi ====================== */
  ekranRota(y, 'PRC-01', { get: (ctx) => talepListesi(ctx) });

  ekranRota(y, 'PRC-02', {
    get: (ctx) => html(ctx, 200, ciz(ctx, ekranNesnesi('PRC-02'), talepFormu(ctx, {}))),
    post: (ctx, govde) => {
      const e = ekranNesnesi('PRC-02');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const sonuc = idempotent(
          { anahtar: govde._idempotency, tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, govde },
          () => talepAc(ctx, govde));
        return yonlendir(ctx, `/satinalma/talepler/${sonuc.id}?olusan=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, ciz(ctx, e, talepFormu(ctx, { deger: govde, hata: hataNesnesi(err) })));
      }
    },
  });

  ekranRota(y, 'PRC-03', {
    get: (ctx, _g, params) => talepDetayi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('PRC-03');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      csrfZorunlu(ctx, govde);
      const t = kaydiAl(ctx, 'talep', 'talep', params.id);
      try {
        const mesaj = talepIslemi(ctx, t, govde);
        return yonlendir(ctx, `/satinalma/talepler/${t.id}?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return talepDetayi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ================= PRC-04 RFQ ======================================== */
  ekranRota(y, 'PRC-04', {
    get: (ctx) => rfqListesi(ctx),
    post: (ctx, govde) => {
      const e = ekranNesnesi('PRC-04');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const sonuc = rfqAc(ctx, govde);
        return yonlendir(ctx, `/satinalma/karsilastirma/${sonuc.id}?olusan=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return rfqListesi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= PRC-06 Teklif karşılaştırma ======================= */
  ekranRota(y, 'PRC-06', {
    get: (ctx, _g, params) => karsilastirmaSayfasi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('PRC-06');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = rfqIslemi(ctx, params.id, govde);
        return yonlendir(ctx, `/satinalma/karsilastirma/${params.id}?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return karsilastirmaSayfasi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= PRC-05 Tedarikçi teklif portalı =================== */
  ekranRota(y, 'PRC-05', {
    get: (ctx, _g, params) => portalSayfasi(ctx, params.token),
    post: (ctx, govde, params) => {
      try {
        const mesaj = portalTeklif(ctx, params.token, govde);
        return yonlendir(ctx, `/tedarikci/teklif/${params.token}?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return portalSayfasi(ctx, params.token, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= PRC-07..10 Sipariş ================================ */
  ekranRota(y, 'PRC-07', { get: (ctx) => siparisListesi(ctx) });

  ekranRota(y, 'PRC-08', {
    get: (ctx) => html(ctx, 200, ciz(ctx, ekranNesnesi('PRC-08'), siparisFormu(ctx, {}))),
    post: (ctx, govde) => {
      const e = ekranNesnesi('PRC-08');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const sonuc = idempotent(
          { anahtar: govde._idempotency, tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, govde },
          () => siparisAc(ctx, govde));
        return yonlendir(ctx, `/satinalma/siparisler/${sonuc.id}?olusan=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, ciz(ctx, e, siparisFormu(ctx, { deger: govde, hata: hataNesnesi(err) })));
      }
    },
  });

  ekranRota(y, 'PRC-09', {
    get: (ctx, _g, params) => siparisDetayi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('PRC-09');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      csrfZorunlu(ctx, govde);
      const s = kaydiAl(ctx, 'siparis', 'siparis', params.id);
      try {
        const mesaj = siparisIslemi(ctx, s, govde);
        return yonlendir(ctx, `/satinalma/siparisler/${s.id}?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return siparisDetayi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  ekranRota(y, 'PRC-10', {
    get: (ctx, _g, params) => siparisRevizyonSayfasi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('PRC-10');
      yetkiZorunlu(ctx, `${e.kod}:karar_ver`);
      csrfZorunlu(ctx, govde);
      const s = kaydiAl(ctx, 'siparis', 'siparis', params.id);
      try {
        const yeni = siparisRevizyonAc(ctx, s, govde);
        return yonlendir(ctx, `/satinalma/siparisler/${yeni.id}?revizyon=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return siparisRevizyonSayfasi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });
}

/* ==========================================================================
   Tedarikçi
   ========================================================================== */
function tedarikciAc(ctx, govde) {
  const unvan = String(govde.unvan || '').trim();
  if (!unvan) throw DogrulamaHatasi('Unvan zorunludur.', { alanlar: { unvan: ['Unvan girin.'] } });
  if (govde.vergiNo && tek('SELECT id FROM tedarikci WHERE tenant_id = ? AND vergi_no = ?',
    ctx.tenant.id, govde.vergiNo)) {
    throw Cakisma('Bu vergi numarasıyla kayıtlı bir tedarikçi zaten var.');
  }
  const vade = govde.odemeVadesiGun ? Number(govde.odemeVadesiGun) : null;
  if (vade != null && (!Number.isInteger(vade) || vade < 0 || vade > 365)) {
    throw DogrulamaHatasi('Ödeme vadesi 0–365 gün arasında olmalı.',
      { alanlar: { odemeVadesiGun: ['Geçersiz vade.'] } });
  }
  islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'tedarikci');
    const id = kimlik('tedarikci');
    calistir(`INSERT INTO tedarikci (id, tenant_id, kod, unvan, tur, vergi_dairesi, vergi_no, adres, il,
                telefon, eposta, yetkili, iban, odeme_vadesi_gun, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'aktif', ?,?)`,
      id, ctx.tenant.id, kod, unvan, govde.tur || 'malzeme', govde.vergiDairesi || null,
      govde.vergiNo || null, govde.adres || null, govde.il || null, govde.telefon || null,
      govde.eposta || null, govde.yetkili || null, govde.iban || null, vade,
      ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'tedarikci', nesneId: id, eylem: 'olustur', sonraki: { kod, unvan, tur: govde.tur } });
  });
  return yonlendir(ctx, '/tedarikciler?olusturuldu=1');
}

function tedarikciSekmeleri(ctx, r) {
  const sekme = ctx.sorgu.get('sekme') || 'siparisler';
  const siparisler = sorgu(
    'SELECT * FROM siparis WHERE tedarikci_id = ? ORDER BY olusturuldu DESC LIMIT 25', r.id);
  const teklifler = sorgu(
    `SELECT t.*, q.kod AS rfq_kod, q.baslik AS rfq_baslik FROM teklif t
       JOIN rfq q ON q.id = t.rfq_id WHERE t.tedarikci_id = ? ORDER BY t.olusturuldu DESC LIMIT 25`, r.id);
  const kabuller = sorgu(
    `SELECT * FROM mal_kabul WHERE tedarikci_id = ? ORDER BY olusturuldu DESC LIMIT 25`, r.id);

  const govde = sekme === 'teklifler' ? h`
<div class="gv-card"><div class="gc-body flush">${B.tablo({
    satirlar: teklifler,
    satirRota: (t) => `/satinalma/karsilastirma/${t.rfq_id}`,
    bosDurum: { baslik: 'Teklif yok', ikon: 'fa-file-invoice-dollar' },
    sutunlar: [
      { ad: 'rfq_kod', etiket: 'RFQ', govde: (t) => h`<b>${t.rfq_kod}</b><br><span class="muted">${t.rfq_baslik}</span>` },
      { ad: 'toplam_minor', etiket: 'Toplam', hizala: 'sag', govde: (t) => para(t.toplam_minor, t.toplam_birim) },
      { ad: 'teslim_gun', etiket: 'Teslim', govde: (t) => (t.teslim_gun ? `${t.teslim_gun} gün` : '—') },
      { ad: 'kaynak', etiket: 'Kaynak', govde: (t) => (t.kaynak === 'portal' ? B.isaret('portal', 'ok') : 'elle') },
      { ad: 'durum', etiket: 'Durum', govde: (t) => B.rozet(
        t.durum === 'kazandi' ? 'onaylandi' : t.durum === 'kaybetti' ? 'reddedildi' : 'beklemede',
        { alindi: 'Alındı', degerlendirmede: 'Değerlendirmede', kazandi: 'Kazandı',
          kaybetti: 'Kaybetti', iptal: 'İptal' }[t.durum]) },
    ],
  })}</div></div>`
    : sekme === 'kabuller' ? h`
<div class="gv-card"><div class="gc-body flush">${B.tablo({
      satirlar: kabuller,
      satirRota: (m) => `/mal-kabul/${m.id}`,
      bosDurum: { baslik: 'Mal kabul kaydı yok', ikon: 'fa-truck-ramp-box' },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'irsaliye_no', etiket: 'İrsaliye', govde: (m) => m.irsaliye_no || '—' },
        { ad: 'irsaliye_tarihi', etiket: 'Tarih', govde: (m) => (m.irsaliye_tarihi ? tarih(m.irsaliye_tarihi) : '—') },
        { ad: 'durum', etiket: 'Durum', govde: (m) => B.rozet(m.durum) },
      ],
    })}</div></div>`
      : sekme === 'gecmis' ? gecmisKarti('tedarikci', r)
        : h`
<div class="gv-card"><div class="gc-body flush">${B.tablo({
          satirlar: siparisler,
          satirRota: (s) => `/satinalma/siparisler/${s.id}`,
          bosDurum: { baslik: 'Sipariş yok', ikon: 'fa-file-invoice' },
          sutunlar: [
            { ad: 'kod', etiket: 'Kod', govde: (s) => h`${s.kod} <span class="muted">s.${s.surum_no}</span>` },
            { ad: 'baslik', etiket: 'Sipariş' },
            { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag', govde: (s) => para(s.tutar_minor, s.tutar_birim) },
            { ad: 'teslim_tarihi', etiket: 'Teslim', govde: (s) => (s.teslim_tarihi ? tarih(s.teslim_tarihi) : '—') },
            { ad: 'durum', etiket: 'Durum', govde: (s) => B.rozet(s.durum) },
          ],
        })}</div></div>`;

  return h`${B.sekmeler({
    sekmeler: [
      { ad: 'siparisler', etiket: 'Siparişler', adet: siparisler.length },
      { ad: 'teklifler', etiket: 'Teklifler', adet: teklifler.length },
      { ad: 'kabuller', etiket: 'Mal kabul', adet: kabuller.length },
      { ad: 'gecmis', etiket: 'Denetim geçmişi' },
    ], aktif: sekme, rota: `/tedarikciler/${r.id}`, sorgu: ctx.sorgu })}${govde}`;
}

/* PRC-13 — puanlar GERÇEK kayıtlardan hesaplanır, elle girilmez. */
function degerlendirmeSayfasi(ctx, id) {
  const e = ekranNesnesi('PRC-13');
  yetkiZorunlu(ctx, e.yetki);
  const t = kaydiAl(ctx, 'tedarikci', 'tedarikci', id);

  const siparisler = sorgu(
    `SELECT * FROM siparis WHERE tedarikci_id = ? AND durum = 'onaylandi'`, t.id);
  const kabuller = sorgu(
    `SELECT * FROM mal_kabul WHERE tedarikci_id = ? AND durum IN ('kabul','kismi_kabul','ret')`, t.id);
  const kalemler = kabuller.length
    ? sorgu(`SELECT k.* FROM mal_kabul_kalemi k JOIN mal_kabul m ON m.id = k.mal_kabul_id
              WHERE m.tedarikci_id = ?`, t.id) : [];

  const gelen = kalemler.reduce((a, k) => a + k.gelen_binde, 0);
  const ret = kalemler.reduce((a, k) => a + k.ret_binde, 0);
  const kaliteBinde = gelen > 0 ? Math.round(((gelen - ret) / gelen) * 100_000) : null;

  /* Termin: irsaliye tarihi ile siparişin teslim tarihi karşılaştırılır. */
  const terminli = kabuller.filter((m) => m.siparis_id && m.irsaliye_tarihi);
  let zamaninda = 0;
  for (const m of terminli) {
    const s = siparisler.find((x) => x.id === m.siparis_id)
      || tek('SELECT teslim_tarihi FROM siparis WHERE id = ?', m.siparis_id);
    if (s?.teslim_tarihi && m.irsaliye_tarihi <= s.teslim_tarihi) zamaninda++;
  }
  const terminBinde = terminli.length ? Math.round((zamaninda / terminli.length) * 100_000) : null;

  /* Fiyat: kazanılan tekliflerin, aynı RFQ'daki en düşük teklife oranı. */
  const kazanan = sorgu(`SELECT * FROM teklif WHERE tedarikci_id = ? AND durum = 'kazandi'`, t.id);
  let fiyatBinde = null;
  if (kazanan.length) {
    let toplamOran = 0;
    for (const k of kazanan) {
      const enDusuk = Number(tek(
        'SELECT MIN(toplam_minor) AS n FROM teklif WHERE rfq_id = ? AND toplam_minor > 0', k.rfq_id)?.n ?? 0);
      if (enDusuk > 0 && Number(k.toplam_minor) > 0) toplamOran += enDusuk / Number(k.toplam_minor);
      else toplamOran += 1;
    }
    fiyatBinde = Math.round((toplamOran / kazanan.length) * 100_000);
  }

  const puanlar = [kaliteBinde, terminBinde, fiyatBinde].filter((x) => x != null);
  const genel = puanlar.length ? Math.round(puanlar.reduce((a, b) => a + b, 0) / puanlar.length) : null;
  const yuzde = (b) => (b == null ? '—' : `%${(b / 1000).toFixed(1).replace('.', ',')}`);

  const icerik = h`
${B.detayOzetSeridi({
    kod: t.kod, baslik: `${t.unvan} — değerlendirme`, durum: t.durum, surum: t.surum,
    bilgiler: [
      { etiket: 'Genel puan', deger: yuzde(genel) },
      { etiket: 'Onaylı sipariş', deger: sayi(siparisler.length) },
      { etiket: 'Mal kabul', deger: sayi(kabuller.length) },
    ],
    birincilEylem: B.btn('Tedarikçiye dön', { rota: `/tedarikciler/${t.id}` }),
  })}
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Puanlar ve formülleri</b>
    <span>Her puan gerçek kayıttan hesaplanır; elle girilen bir değerlendirme alanı YOKTUR.</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: [
      { kpi: 'Kalite puanı', formul: '(gelen miktar − ret miktarı) / gelen miktar',
        deger: yuzde(kaliteBinde),
        not: gelen ? `${miktarMetni(gelen)} gelen · ${miktarMetni(ret)} ret` : 'Mal kabul kalemi yok' },
      { kpi: 'Termin puanı', formul: 'zamanında teslim / terminli teslim sayısı',
        deger: yuzde(terminBinde),
        not: terminli.length ? `${zamaninda}/${terminli.length} teslim zamanında` : 'Terminli teslim yok' },
      { kpi: 'Fiyat puanı', formul: 'ort( aynı RFQ\'daki en düşük teklif / bu tedarikçinin teklifi )',
        deger: yuzde(fiyatBinde),
        not: kazanan.length ? `${kazanan.length} kazanılan teklif` : 'Kazanılan teklif yok' },
      { kpi: 'İSG puanı', formul: 'taşeron İSG denetim uygunluk ortalaması',
        deger: '—', not: 'Taşeron İSG denetimi tedarikçiye bağlanmadı — Faz 6 EXT-06 ile eşlenecek.' },
      { kpi: 'Genel puan', formul: 'hesaplanabilen puanların ortalaması', deger: yuzde(genel),
        not: `${puanlar.length}/4 gösterge hesaplanabildi` },
    ],
    bosDurum: { baslik: 'Veri yok' },
    sutunlar: [
      { ad: 'kpi', etiket: 'Gösterge', govde: (r) => h`<b>${r.kpi}</b>` },
      { ad: 'formul', etiket: 'Formül', govde: (r) => h`<code>${r.formul}</code>` },
      { ad: 'deger', etiket: 'Değer', hizala: 'sag', govde: (r) => h`<b>${r.deger}</b>` },
      { ad: 'not', etiket: 'Not' },
    ],
  })}</div>
</div>
<div class="gv-card"><div class="gc-body">
  <div class="gv-cap-sm">Rapor künyesi</div>
  <dl class="gd-grid" style="margin-top:12px;padding-top:0;border-top:0">
    <div><dt>Kapsam</dt><dd>Tüm zamanlar · ${t.kod}</dd></div>
    <div><dt>Veri tarihi</dt><dd>${tarih(simdi())}</dd></div>
    <div><dt>Rapor sürümü</dt><dd>PRC-13 v1</dd></div>
  </dl>
</div></div>
${B.veriTarihi(simdi())}`;
  return html(ctx, 200, ciz(ctx, e, icerik, { kayitEtiketi: t.kod, baslik: t.unvan }));
}

/* ==========================================================================
   PRC-01..03 talep
   ========================================================================== */
function talepListesi(ctx, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('PRC-01');
  yetkiZorunlu(ctx, e.yetki);
  const { kosullar, parametreler } = filtreKosullari(ctx, {
    aramaAlanlari: ['baslik', 'kod'],
    filtreler: [{ ad: 'durum' }, { ad: 'oncelik' }, { ad: 'santiye_id' }],
  });
  const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
    { tablo: 'talep', kosullar, parametreler, sirala: 'olusturuldu DESC' });

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Onay bekleyen', deger: sayi(sayac(ctx.tenant.id, 'talep',
        `durum IN ('onaya_gonderildi','incelemede')`)), ikon: 'fa-hourglass-half' },
      { etiket: 'Onaylı, siparişsiz', ikon: 'fa-cart-plus', ton: 'warn', deger: sayi(Number(tek(
        `SELECT COUNT(*) AS n FROM talep t WHERE t.tenant_id = ? AND t.durum = 'onaylandi'
           AND NOT EXISTS (SELECT 1 FROM siparis s WHERE s.talep_id = t.id AND s.durum <> 'iptal')`,
        ctx.tenant.id)?.n ?? 0)) },
      { etiket: 'Kritik öncelik', deger: sayi(sayac(ctx.tenant.id, 'talep',
        `oncelik = 'kritik' AND durum NOT IN ('onaylandi','reddedildi','iptal')`)), ikon: 'fa-fire' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ]),
    filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Talep başlığı veya kodu…',
      filtreler: [
        { ad: 'durum', etiket: 'Durum', secenekler: ['taslak', 'onaya_gonderildi', 'incelemede',
          'revizyon_istendi', 'onaylandi', 'reddedildi'].map((d) => ({ deger: d, etiket: d })) },
        { ad: 'oncelik', etiket: 'Öncelik', secenekler: ONCELIKLER },
        { ad: 'santiye_id', etiket: 'Şantiye', secenekler: santiyeSecenekleri(ctx) },
      ] }),
    icerik: B.tablo({
      satirlar,
      satirRota: (r) => `/satinalma/talepler/${r.id}`,
      bosDurum: { baslik: 'Talep yok', ikon: 'fa-cart-shopping',
        aciklama: 'Onaylanmamış talep siparişe dönüşemez; süreç buradan başlar.',
        eylem: yetkiVar(ctx, 'PRC-02:olustur')
          ? B.btn('Yeni talep', { tur: 'acc', rota: '/satinalma/talepler/yeni', ikon: 'fa-plus' }) : null },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'baslik', etiket: 'Talep', govde: (r) => h`<a href="/satinalma/talepler/${r.id}"><b>${r.baslik}</b></a>
          <br><span class="muted">${sayi(Number(tek(
    'SELECT COUNT(*) AS n FROM talep_kalemi WHERE talep_id = ?', r.id)?.n ?? 0))} kalem</span>` },
        { ad: 'oncelik', etiket: 'Öncelik', govde: (r) => B.isaret(
          ONCELIKLER.find((o) => o.deger === r.oncelik)?.etiket || r.oncelik,
          r.oncelik === 'kritik' ? 'danger' : r.oncelik === 'yuksek' ? 'warn' : 'info') },
        { ad: 'tutar_minor', etiket: 'Tahmini tutar', hizala: 'sag',
          govde: (r) => para(r.tutar_minor, r.tutar_birim) },
        { ad: 'ihtiyac_tarihi', etiket: 'İhtiyaç', govde: (r) => (r.ihtiyac_tarihi ? tarih(r.ihtiyac_tarihi) : '—') },
        { ad: 'siparis', etiket: 'Sipariş', govde: (r) => {
          const s = sorgu(`SELECT id, kod FROM siparis WHERE talep_id = ? AND durum <> 'iptal'`, r.id);
          return s.length ? h`${s.map((x) => h`<a href="/satinalma/siparisler/${x.id}">${x.kod}</a> `)}`
            : (r.durum === 'onaylandi' ? B.isaret('bekliyor', 'warn') : '—');
        } },
        { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}`;
  return html(ctx, durum, ciz(ctx, e, icerik, {
    eylemler: yetkiVar(ctx, 'PRC-02:olustur')
      ? B.btn('Yeni talep', { tur: 'acc', rota: '/satinalma/talepler/yeni', ikon: 'fa-plus' }) : null,
  }));
}

/** Kalem satırlarını `kalem[N][alan]` biçimindeki gövdeden çözer. */
function kalemleriCoz(govde, onEk = 'kalem', { fiyatAlani = 'fiyat', fiyatZorunlu = false } = {}) {
  const satirlar = [];
  const hatalar = {};
  for (let i = 0; i < 30; i++) {
    const aciklama = String(govde[`${onEk}${i}Aciklama`] || '').trim();
    const miktar = String(govde[`${onEk}${i}Miktar`] || '').trim();
    if (!aciklama && !miktar) continue;
    if (!aciklama) { hatalar[`${onEk}${i}Aciklama`] = ['Açıklama girin.']; continue; }
    let miktarBinde;
    try { miktarBinde = miktarAyristir(miktar, `${onEk}${i}Miktar`); }
    catch (e) { hatalar[`${onEk}${i}Miktar`] = [e.mesaj || 'Geçersiz miktar.']; continue; }
    const fiyatGirdi = String(govde[`${onEk}${i}${fiyatAlani[0].toUpperCase()}${fiyatAlani.slice(1)}`] || '').trim();
    let fiyatMinor = null;
    if (fiyatGirdi) {
      try { fiyatMinor = Para.ayristir(fiyatGirdi, govde.paraBirimi || 'TRY').minor; }
      catch { hatalar[`${onEk}${i}Fiyat`] = ['Geçersiz fiyat.']; continue; }
    } else if (fiyatZorunlu) {
      hatalar[`${onEk}${i}Fiyat`] = ['Birim fiyat zorunludur.']; continue;
    }
    satirlar.push({
      sira: satirlar.length + 1, aciklama, miktarBinde,
      birim: String(govde[`${onEk}${i}Birim`] || 'ad').trim() || 'ad',
      fiyatMinor, stokKartiId: govde[`${onEk}${i}StokKarti`] || null,
      kaynakId: govde[`${onEk}${i}Kaynak`] || null,
    });
  }
  if (Object.keys(hatalar).length) throw DogrulamaHatasi('Kalem satırlarında hata var.', { alanlar: hatalar });
  return satirlar;
}

function talepAc(ctx, govde) {
  const baslik = String(govde.baslik || '').trim();
  if (!baslik) throw DogrulamaHatasi('Talep başlığı zorunludur.', { alanlar: { baslik: ['Başlık girin.'] } });
  const kalemler = kalemleriCoz(govde);
  if (!kalemler.length) {
    throw DogrulamaHatasi('En az bir kalem girilmelidir.',
      { alanlar: { kalem0Aciklama: ['Kalemsiz talep açılamaz.'] } });
  }
  const santiye = govde.santiyeId
    ? tek('SELECT * FROM santiye WHERE id = ? AND tenant_id = ?', govde.santiyeId, ctx.tenant.id) : null;

  return islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'talep');
    const id = kimlik('talep');
    calistir(`INSERT INTO talep (id, tenant_id, kod, baslik, aciklama, proje_id, santiye_id, depo_id,
                maliyet_kodu, ihtiyac_tarihi, oncelik, tutar_minor, tutar_birim, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?, 'taslak', ?,?)`,
      id, ctx.tenant.id, kod, baslik, govde.aciklama || null,
      santiye?.proje_id || govde.projeId || null, santiye?.id || null, govde.depoId || null,
      govde.maliyetKodu || null, govde.ihtiyacTarihi ? gunBaslangici(govde.ihtiyacTarihi) : null,
      govde.oncelik || 'normal', govde.paraBirimi || ctx.tenant.para_birimi,
      ctx.kullanici.id, simdi());
    for (const k of kalemler) {
      calistir(`INSERT INTO talep_kalemi (id, tenant_id, talep_id, sira, stok_karti_id, aciklama,
                  birim, miktar_binde, tahmini_fiyat_minor, tahmini_fiyat_birim)
                VALUES (?,?,?,?,?,?,?,?,?,?)`,
        kimlik('satir'), ctx.tenant.id, id, k.sira, k.stokKartiId, k.aciklama, k.birim,
        k.miktarBinde, k.fiyatMinor == null ? null : String(k.fiyatMinor),
        govde.paraBirimi || ctx.tenant.para_birimi);
    }
    const toplam = toplamiTazele('talep', id, talepToplami);
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'talep', nesneId: id, eylem: 'olustur',
      sonraki: { kod, baslik, kalem: kalemler.length, tutarMinor: toplam } });
    return { id, kod };
  });
}

function talepFormu(ctx, { deger = {}, hata = null }) {
  const e = ekranNesnesi('PRC-02');
  const kartlar = sorgu('SELECT id, kod, ad, birim FROM stok_karti WHERE tenant_id = ? ORDER BY kod', ctx.tenant.id);
  const birimler = BIRIM_SECENEKLERI(ctx);
  const satirSayisi = 5;

  return B.form({
    rota: e.rota, csrf: csrfAlani(ctx), idempotencyAnahtari: kimlik('idempotency'), hatalar: hata,
    bolumler: [
      { baslik: 'Talep künyesi',
        aciklama: 'Talep TASLAK açılır; onaya gönderme ayrı bir eylemdir ve onaycıyı siz seçmezsiniz.',
        alanlar: h`
          ${B.alan({ ad: 'baslik', etiket: 'Talep başlığı', zorunlu: true, genis: true,
            deger: deger.baslik || '', hata: hata?.alanlar?.baslik })}
          ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye', deger: deger.santiyeId || '',
            secenekler: [{ deger: '', etiket: 'Seçin…' }, ...santiyeSecenekleri(ctx)] })}
          ${B.alan({ ad: 'maliyetKodu', etiket: 'Maliyet kodu', deger: deger.maliyetKodu || '',
            secenekler: [{ deger: '', etiket: 'Seçin…' }, ...sorgu(
              'SELECT kod, ad FROM maliyet_kodu WHERE tenant_id = ? ORDER BY kod', ctx.tenant.id)
              .map((m) => ({ deger: m.kod, etiket: `${m.kod} — ${m.ad}` }))] })}
          ${B.alan({ ad: 'ihtiyacTarihi', etiket: 'İhtiyaç tarihi', tur: 'date', deger: deger.ihtiyacTarihi || '' })}
          ${B.alan({ ad: 'oncelik', etiket: 'Öncelik', deger: deger.oncelik || 'normal', secenekler: ONCELIKLER })}
          ${B.alan({ ad: 'paraBirimi', etiket: 'Para birimi', deger: deger.paraBirimi || ctx.tenant.para_birimi,
            secenekler: Object.keys(BIRIMLER).map((k) => ({ deger: k, etiket: k })) })}
          ${B.alan({ ad: 'aciklama', etiket: 'Açıklama / teknik şart', tur: 'metin', genis: true,
            deger: deger.aciklama || '' })}` },
      { baslik: 'Kalemler',
        aciklama: 'Tahmini tutar kalemlerden HESAPLANIR; toplam alanı yoktur. En az bir kalem zorunludur.',
        alanlar: h`${Array.from({ length: satirSayisi }, (_, i) => h`
          ${B.alan({ ad: `kalem${i}Aciklama`, etiket: `${i + 1}. kalem — açıklama`, genis: true,
            deger: deger[`kalem${i}Aciklama`] || '', hata: hata?.alanlar?.[`kalem${i}Aciklama`] })}
          ${B.alan({ ad: `kalem${i}StokKarti`, etiket: 'Stok kartı', deger: deger[`kalem${i}StokKarti`] || '',
            secenekler: [{ deger: '', etiket: 'Kartsız (serbest)' },
              ...kartlar.map((k) => ({ deger: k.id, etiket: `${k.kod} — ${k.ad}` }))] })}
          ${B.alan({ ad: `kalem${i}Miktar`, etiket: 'Miktar', deger: deger[`kalem${i}Miktar`] || '',
            hata: hata?.alanlar?.[`kalem${i}Miktar`], ipucu: i === 0 ? 'Örn. 12,5' : null })}
          ${B.alan({ ad: `kalem${i}Birim`, etiket: 'Birim', deger: deger[`kalem${i}Birim`] || 'ad',
            secenekler: birimler.length ? birimler : null })}
          ${B.alan({ ad: `kalem${i}Fiyat`, etiket: 'Tahmini birim fiyat', deger: deger[`kalem${i}Fiyat`] || '',
            hata: hata?.alanlar?.[`kalem${i}Fiyat`] })}`)}` },
    ],
    ozet: h`<div class="gv-card"><div class="gc-body">
      <div class="gv-cap-sm">Kayıt açılışı</div>
      <p style="margin-top:10px;font-size:12.5px;line-height:1.7;color:var(--muted)">
        Talep <b>taslak</b> durumunda açılır. Onaya gönderdiğinizde onay kademesi
        <b>tahmini tutardan</b> seçilir — onaycıyı siz belirlemezsiniz (§5.3).</p>
    </div></div>`,
    eylemler: h`${B.btn('Vazgeç', { rota: '/satinalma/talepler' })}
      ${B.btn('Kaydet ve detaya git', { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' })}`,
  });
}

function talepIslemi(ctx, t, govde) {
  if (govde._eylem === 'onaya_gonder') {
    if (!['taslak', 'revizyon_istendi'].includes(t.durum)) {
      throw GecisIzinsiz('Yalnız taslak veya revizyon istenen talep onaya gönderilebilir.');
    }
    if (!Number(tek('SELECT COUNT(*) AS n FROM talep_kalemi WHERE talep_id = ?', t.id)?.n ?? 0)) {
      throw GecisIzinsiz('Kalemsiz talep onaya gönderilemez.');
    }
    islem(() => {
      const toplam = toplamiTazele('talep', t.id, talepToplami);
      onayMotoru.onayaGonder(ctx, {
        nesne: 'talep', nesneId: t.id, nesneKod: t.kod, baslik: `Satın alma talebi: ${t.baslik}`,
        belgeSurum: t.surum, tutarMinor: toplam, tutarBirim: t.tutar_birim,
        projeId: t.proje_id, santiyeId: t.santiye_id, maliyetKodu: t.maliyet_kodu,
        gerekce: govde.gerekce || null,
      });
      gecisYap(ctx, { nesne: 'talep', tablo: 'talep', kayit: t, eylem: 'onaya_gonder',
        gerekce: govde.gerekce, ekranKodu: 'PRC-03' });
    });
    return 'Talep onaya gönderildi';
  }
  if (['geri_cek', 'iptal_et'].includes(govde._eylem)) {
    gecisYap(ctx, { nesne: 'talep', tablo: 'talep', kayit: t, eylem: govde._eylem,
      gerekce: govde.gerekce, ekranKodu: 'PRC-03' });
    return 'Talep durumu güncellendi';
  }
  if (govde._eylem === 'kalem') {
    if (!['taslak', 'revizyon_istendi'].includes(t.durum)) {
      throw GecisIzinsiz('Onaya gönderilmiş talebin kalemleri değiştirilemez (kural 6).');
    }
    const aciklama = String(govde.kalemAciklamasi || '').trim();
    if (!aciklama) throw DogrulamaHatasi('Kalem açıklaması zorunludur.',
      { alanlar: { kalemAciklamasi: ['Açıklama girin.'] } });
    const miktarBinde = miktarAyristir(govde.kalemMiktari, 'kalemMiktari');
    const fiyat = govde.kalemFiyati
      ? Para.ayristir(govde.kalemFiyati, t.tutar_birim).minor : null;
    islem(() => {
      const sira = Number(tek('SELECT COALESCE(MAX(sira),0) AS n FROM talep_kalemi WHERE talep_id = ?',
        t.id)?.n ?? 0) + 1;
      calistir(`INSERT INTO talep_kalemi (id, tenant_id, talep_id, sira, stok_karti_id, aciklama,
                  birim, miktar_binde, tahmini_fiyat_minor, tahmini_fiyat_birim)
                VALUES (?,?,?,?,?,?,?,?,?,?)`,
        kimlik('satir'), ctx.tenant.id, t.id, sira, govde.kalemStokKarti || null, aciklama,
        govde.kalemBirimi || 'ad', miktarBinde, fiyat == null ? null : String(fiyat), t.tutar_birim);
      const toplam = toplamiTazele('talep', t.id, talepToplami);
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'talep', nesneId: t.id, eylem: 'kalem_eklendi',
        sonraki: { sira, aciklama, miktarBinde, tutarMinor: toplam } });
    });
    return 'Kalem eklendi';
  }
  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

function talepDetayi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('PRC-03');
  yetkiZorunlu(ctx, e.yetki);
  const t = kaydiAl(ctx, 'talep', 'talep', id);
  const kalemler = sorgu('SELECT * FROM talep_kalemi WHERE talep_id = ? ORDER BY sira', t.id);
  const siparisler = sorgu(`SELECT * FROM siparis WHERE talep_id = ? ORDER BY olusturuldu DESC`, t.id);
  const rfqler = sorgu('SELECT * FROM rfq WHERE talep_id = ? ORDER BY olusturuldu DESC', t.id);
  const acikOnay = tek(
    `SELECT id FROM onay_talebi WHERE nesne = 'talep' AND nesne_id = ? AND durum = 'acik'`, t.id);
  const duzenlenebilir = ['taslak', 'revizyon_istendi'].includes(t.durum);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: 'Talep oluşturuldu',
    aciklama: 'Kayıt taslak durumunda; onaya göndermeden siparişe dönüşemez.' }) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.detayOzetSeridi({
    kod: t.kod, baslik: t.baslik, durum: t.durum, surum: t.surum,
    isaretler: t.ihtiyac_tarihi && t.ihtiyac_tarihi < simdi() && t.durum !== 'onaylandi'
      ? [{ metin: 'ihtiyaç tarihi geçti', ton: 'danger' }] : [],
    bilgiler: [
      { etiket: 'Tahmini tutar', deger: para(t.tutar_minor, t.tutar_birim) },
      { etiket: 'Öncelik', deger: ONCELIKLER.find((o) => o.deger === t.oncelik)?.etiket },
      { etiket: 'İhtiyaç tarihi', deger: t.ihtiyac_tarihi ? tarih(t.ihtiyac_tarihi) : '—' },
      { etiket: 'Maliyet kodu', deger: t.maliyet_kodu || '—' },
      { etiket: 'Talep eden', deger: kullaniciAdi(t.olusturan) },
    ],
    birincilEylem: t.durum === 'onaylandi' && yetkiVar(ctx, 'PRC-08:olustur')
      ? B.btn('Siparişe dönüştür', { tur: 'acc', ikon: 'fa-cart-plus',
        rota: `/satinalma/siparisler/yeni?talepId=${t.id}` })
      : null,
    digerEylemler: yetkiVar(ctx, 'PRC-04:olustur') && t.durum === 'onaylandi'
      ? B.btn('RFQ aç', { rota: `/satinalma/rfq?talepId=${t.id}`, ikon: 'fa-envelope-open-text' }) : null,
  })}
${acikOnay ? B.sonucSeridi({ tur: 'warn', baslik: 'Onay süreci açık',
    aciklama: 'Karar verilene kadar kalemler değiştirilemez.', kayitRota: `/onaylar/${acikOnay.id}` }) : ''}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Kalemler</b>
        <span>Tahmini tutar bu satırlardan hesaplanır; toplam alanı elle yazılamaz.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: kalemler,
    bosDurum: { baslik: 'Kalem yok', ikon: 'fa-list' },
    sutunlar: [
      { ad: 'sira', etiket: '#', hizala: 'sag' },
      { ad: 'aciklama', etiket: 'Kalem', govde: (k) => h`<b>${k.aciklama}</b>${
        k.stok_karti_id ? h`<br><span class="muted">${
          tek('SELECT kod FROM stok_karti WHERE id = ?', k.stok_karti_id)?.kod || ''}</span>` : ''}` },
      { ad: 'miktar_binde', etiket: 'Miktar', hizala: 'sag',
        govde: (k) => h`${miktarMetni(k.miktar_binde)} ${k.birim}` },
      { ad: 'tahmini_fiyat_minor', etiket: 'Birim fiyat', hizala: 'sag',
        govde: (k) => para(k.tahmini_fiyat_minor, k.tahmini_fiyat_birim) },
      { ad: 'tutar', etiket: 'Tutar', hizala: 'sag', govde: (k) => para(
        Math.round((k.miktar_binde / 1000) * Number(k.tahmini_fiyat_minor || 0)), k.tahmini_fiyat_birim) },
      { ad: 'siparis_edilen_binde', etiket: 'Siparişte', hizala: 'sag',
        govde: (k) => (k.siparis_edilen_binde
          ? B.isaret(miktarMetni(k.siparis_edilen_binde), 'ok') : h`<span class="muted">—</span>`) },
    ],
  })}</div>
    </div>
    ${siparisler.length ? h`<div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Bu talepten açılan siparişler</b></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: siparisler,
    satirRota: (s) => `/satinalma/siparisler/${s.id}`,
    bosDurum: { baslik: 'Sipariş yok' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod', govde: (s) => h`${s.kod} <span class="muted">s.${s.surum_no}</span>` },
      { ad: 'tedarikci_id', etiket: 'Tedarikçi',
        govde: (s) => tek('SELECT unvan FROM tedarikci WHERE id = ?', s.tedarikci_id)?.unvan || '—' },
      { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag', govde: (s) => para(s.tutar_minor, s.tutar_birim) },
      { ad: 'durum', etiket: 'Durum', govde: (s) => B.rozet(s.durum) },
    ],
  })}</div>
    </div>` : ''}
    ${rfqler.length ? h`<div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Teklif talepleri</b></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: rfqler,
    satirRota: (q) => `/satinalma/karsilastirma/${q.id}`,
    bosDurum: { baslik: 'RFQ yok' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'baslik', etiket: 'Başlık' },
      { ad: 'son_teklif_tarihi', etiket: 'Son tarih',
        govde: (q) => (q.son_teklif_tarihi ? tarih(q.son_teklif_tarihi) : '—') },
      { ad: 'durum', etiket: 'Durum', govde: (q) => B.rozet(q.durum) },
    ],
  })}</div>
    </div>` : ''}
    ${gecmisKarti('talep', t)}
  </div>
  <div class="gv-side-stack">
    ${duzenlenebilir && yetkiVar(ctx, 'PRC-03:guncelle') ? B.form({
    rota: `/satinalma/talepler/${t.id}`, csrf: csrfAlani(ctx),
    bolumler: [{ baslik: 'Kalem ekle', alanlar: h`
      ${ham('<input type="hidden" name="_eylem" value="kalem">')}
      ${B.alan({ ad: 'kalemAciklamasi', etiket: 'Açıklama', zorunlu: true, genis: true })}
      ${B.alan({ ad: 'kalemMiktari', etiket: 'Miktar', zorunlu: true })}
      ${B.alan({ ad: 'kalemBirimi', etiket: 'Birim', deger: 'ad' })}
      ${B.alan({ ad: 'kalemFiyati', etiket: 'Tahmini birim fiyat' })}` }],
    eylemler: B.btn('Kalemi ekle', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Durum işlemleri</b>
        <span>Hedef durumu siz seçmezsiniz; onaycı iş akışı şablonundan çözülür.</span></div></div>
      <div class="gc-body">
        ${yetkiVar(ctx, 'PRC-03:guncelle') ? h`
        <form method="post" action="/satinalma/talepler/${t.id}" data-gform="1">
          ${ham(csrfAlani(ctx))}
          ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe / not', tur: 'metin' })}
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
            ${duzenlenebilir && !acikOnay
    ? h`<button class="btn btn-acc" type="submit" name="_eylem" value="onaya_gonder">
        Onaya gönder <span class="muted">→ onaya gönderildi</span></button>` : ''}
            ${t.durum === 'onaya_gonderildi'
    ? h`<button class="btn btn-ghost" type="submit" name="_eylem" value="geri_cek">
        Onaydan geri çek <span class="muted">→ taslak</span></button>` : ''}
            ${duzenlenebilir
    ? h`<button class="btn btn-danger" type="submit" name="_eylem" value="iptal_et">
        Talebi iptal et</button>` : ''}
            ${t.durum === 'onaylandi'
    ? h`<p class="gf-hint">Talep onaylandı. Sipariş, bu talebin onaylı kalemlerinden açılır;
        sipariş miktarı talep miktarını aşamaz.</p>` : ''}
          </div>
        </form>` : ''}
      </div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: t.kod, baslik: t.baslik }));
}

/* ==========================================================================
   PRC-04..06 RFQ ve teklif karşılaştırma
   ========================================================================== */
function rfqAc(ctx, govde) {
  const baslik = String(govde.baslik || '').trim();
  if (!baslik) throw DogrulamaHatasi('RFQ başlığı zorunludur.', { alanlar: { baslik: ['Başlık girin.'] } });
  const talep = govde.talepId
    ? tek('SELECT * FROM talep WHERE id = ? AND tenant_id = ?', govde.talepId, ctx.tenant.id) : null;
  if (govde.talepId && !talep) throw DogrulamaHatasi('Talep bulunamadı.');
  /* RFQ, ONAYLI talepten açılır: onaysız ihtiyaç piyasaya çıkarılmaz. */
  if (talep && talep.durum !== 'onaylandi') {
    throw GecisIzinsiz('Yalnız ONAYLI talep için teklif talebi açılabilir.');
  }
  const son = govde.sonTeklifTarihi ? gunBaslangici(govde.sonTeklifTarihi) : simdi() + 7 * GUN_MS;
  if (son <= simdi()) {
    throw DogrulamaHatasi('Son teklif tarihi gelecekte olmalı.',
      { alanlar: { sonTeklifTarihi: ['Geçmiş tarih girilemez.'] } });
  }

  return islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'rfq');
    const id = kimlik('teklif');
    calistir(`INSERT INTO rfq (id, tenant_id, kod, baslik, talep_id, proje_id, santiye_id,
                son_teklif_tarihi, sartname, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?, 'taslak', ?,?)`,
      id, ctx.tenant.id, kod, baslik, talep?.id || null, talep?.proje_id || null,
      talep?.santiye_id || null, son, govde.sartname || null, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'rfq', nesneId: id, eylem: 'olustur', sonraki: { kod, baslik, talep: talep?.kod || null } });
    return { id, kod };
  });
}

function rfqListesi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('PRC-04');
  yetkiZorunlu(ctx, e.yetki);
  const { kosullar, parametreler } = filtreKosullari(ctx, {
    aramaAlanlari: ['baslik', 'kod'], filtreler: [{ ad: 'durum' }],
  });
  const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
    { tablo: 'rfq', kosullar, parametreler, sirala: 'olusturuldu DESC' });
  const talepler = sorgu(
    `SELECT id, kod, baslik FROM talep WHERE tenant_id = ? AND durum = 'onaylandi' ORDER BY kod DESC LIMIT 100`,
    ctx.tenant.id).map((t) => ({ deger: t.id, etiket: `${t.kod} — ${t.baslik}` }));

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Açık RFQ', deger: sayi(sayac(ctx.tenant.id, 'rfq',
        `durum NOT IN ('sonuclandi','iptal')`)), ikon: 'fa-envelope-open-text' },
      { etiket: 'Süresi geçen', ton: 'warn', ikon: 'fa-hourglass-end', deger: sayi(sayac(ctx.tenant.id, 'rfq',
        `son_teklif_tarihi < ? AND durum NOT IN ('sonuclandi','iptal')`, simdi())) },
      { etiket: 'Toplanan teklif', deger: sayi(Number(tek(
        'SELECT COUNT(*) AS n FROM teklif WHERE tenant_id = ?', ctx.tenant.id)?.n ?? 0)), ikon: 'fa-file-invoice-dollar' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ]),
    filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'RFQ başlığı veya kodu…',
      filtreler: [{ ad: 'durum', etiket: 'Durum', secenekler: ['taslak', 'gonderildi', 'toplaniyor',
        'degerlendirmede', 'sonuclandi', 'iptal'].map((d) => ({ deger: d, etiket: d })) }] }),
    icerik: B.tablo({
      satirlar,
      satirRota: (r) => `/satinalma/karsilastirma/${r.id}`,
      bosDurum: { baslik: 'Teklif talebi yok', ikon: 'fa-envelope-open-text',
        aciklama: 'RFQ yalnız ONAYLI talepten açılır.' },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'baslik', etiket: 'RFQ', govde: (r) => h`<a href="/satinalma/karsilastirma/${r.id}"><b>${r.baslik}</b></a>` },
        { ad: 'davetli', etiket: 'Davetli', hizala: 'sag', govde: (r) => sayi(Number(tek(
          'SELECT COUNT(*) AS n FROM rfq_tedarikci WHERE rfq_id = ?', r.id)?.n ?? 0)) },
        { ad: 'teklif', etiket: 'Teklif', hizala: 'sag', govde: (r) => sayi(Number(tek(
          'SELECT COUNT(*) AS n FROM teklif WHERE rfq_id = ?', r.id)?.n ?? 0)) },
        { ad: 'son_teklif_tarihi', etiket: 'Son tarih', govde: (r) => (!r.son_teklif_tarihi ? '—'
          : r.son_teklif_tarihi < simdi() && !['sonuclandi', 'iptal'].includes(r.durum)
            ? B.isaret(`${tarih(r.son_teklif_tarihi)} — geçti`, 'danger') : tarih(r.son_teklif_tarihi)) },
        { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'PRC-04:olustur') ? B.form({
    rota: e.rota, csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni teklif talebi (RFQ)',
      aciklama: 'RFQ yalnız ONAYLI talepten açılır; onaysız ihtiyaç piyasaya çıkarılmaz.',
      alanlar: h`
      ${B.alan({ ad: 'baslik', etiket: 'Başlık', zorunlu: true, genis: true, deger: deger.baslik || '',
    hata: hata?.alanlar?.baslik })}
      ${B.alan({ ad: 'talepId', etiket: 'Kaynak talep', deger: deger.talepId || ctx.sorgu.get('talepId') || '',
    secenekler: [{ deger: '', etiket: 'Talepsiz (serbest)' }, ...talepler] })}
      ${B.alan({ ad: 'sonTeklifTarihi', etiket: 'Son teklif tarihi', tur: 'date',
    deger: deger.sonTeklifTarihi || gunAnahtari(simdi() + 7 * GUN_MS), hata: hata?.alanlar?.sonTeklifTarihi })}
      ${B.alan({ ad: 'sartname', etiket: 'Şartname / teknik açıklama', tur: 'metin', genis: true,
    deger: deger.sartname || '' })}` }],
    eylemler: B.btn('RFQ aç', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

function rfqIslemi(ctx, rfqId, govde) {
  const q = tek('SELECT * FROM rfq WHERE id = ? AND tenant_id = ?', rfqId, ctx.tenant.id);
  if (!q) throw Bulunamadi('Teklif talebi bulunamadı.');

  if (govde._eylem === 'davet') {
    if (['sonuclandi', 'iptal'].includes(q.durum)) throw GecisIzinsiz('Sonuçlanmış RFQ\'ya davet eklenemez.');
    const ted = tek('SELECT * FROM tedarikci WHERE id = ? AND tenant_id = ?', govde.tedarikciId, ctx.tenant.id);
    if (!ted) throw DogrulamaHatasi('Tedarikçi seçin.', { alanlar: { tedarikciId: ['Tedarikçi bulunamadı.'] } });
    if (ted.durum === 'kara_liste') throw GecisIzinsiz('Kara listedeki tedarikçi teklife davet edilemez.');
    if (tek('SELECT id FROM rfq_tedarikci WHERE rfq_id = ? AND tedarikci_id = ?', q.id, ted.id)) {
      throw Cakisma(`${ted.unvan} zaten davetli.`);
    }
    /* Portal tokeni: açık değer YALNIZ üretim anında görünür, özeti saklanır. */
    const acikToken = token(24);
    islem(() => {
      calistir(`INSERT INTO rfq_tedarikci (id, tenant_id, rfq_id, tedarikci_id, token_ozeti, token_bitis,
                  gonderildi, durum) VALUES (?,?,?,?,?,?,?, 'davetli')`,
        kimlik('satir'), ctx.tenant.id, q.id, ted.id, tokenOzeti(acikToken),
        q.son_teklif_tarihi ?? simdi() + 7 * GUN_MS, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'rfq', nesneId: q.id, eylem: 'tedarikci_davet_edildi',
        sonraki: { tedarikci: ted.kod } });
    });
    /* E-posta gönderimi yok (K-021): bağlantı geliştirmede ekranda gösterilir. */
    return yapilandirma.uretim
      ? `${ted.unvan} davet edildi`
      : `${ted.unvan} davet edildi — bağlantı: /tedarikci/teklif/${acikToken}`;
  }

  if (govde._eylem === 'teklif') {
    return teklifKaydet(ctx, q, govde, { kaynak: 'elle' });
  }

  if (govde._eylem === 'kazanan') {
    if (q.durum === 'sonuclandi') throw GecisIzinsiz('Bu RFQ zaten sonuçlandırılmış (kural 6).');
    if (!['gonderildi', 'toplaniyor', 'degerlendirmede'].includes(q.durum)) {
      throw GecisIzinsiz('Kazanan seçimi için RFQ önce tedarikçilere gönderilmelidir.');
    }
    const t = tek('SELECT * FROM teklif WHERE id = ? AND rfq_id = ?', govde.teklifId, q.id);
    if (!t) throw Bulunamadi('Teklif bulunamadı.');
    const gerekce = String(govde.gerekce || '').trim();
    if (!gerekce) {
      throw DogrulamaHatasi('Kazanan seçimi gerekçe ister (en düşük teklif seçilmemiş olabilir).',
        { alanlar: { gerekce: ['Seçim gerekçesini yazın.'] } });
    }
    islem(() => {
      calistir(`UPDATE teklif SET durum = 'kaybetti', surum = surum + 1, guncelleyen = ?, guncellendi = ?
                 WHERE rfq_id = ? AND durum <> 'iptal'`, ctx.kullanici.id, simdi(), q.id);
      calistir(`UPDATE teklif SET durum = 'kazandi', surum = surum + 1 WHERE id = ?`, t.id);
      /* Değerlendirmeye geçiş mekanik bir adımdır; iş kararı KAZANAN seçimidir. */
      let guncel = q;
      if (guncel.durum !== 'degerlendirmede') {
        gecisYap(ctx, { nesne: 'rfq', tablo: 'rfq', kayit: guncel, eylem: 'degerlendir', motor: true });
        guncel = tek('SELECT * FROM rfq WHERE id = ?', q.id);
      }
      gecisYap(ctx, { nesne: 'rfq', tablo: 'rfq', kayit: guncel, eylem: 'sonuclandir',
        gerekce, motor: true });
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'rfq', nesneId: q.id, eylem: 'kazanan_secildi', gerekce,
        sonraki: { teklif: t.kod, tedarikci: t.tedarikci_id, tutarMinor: t.toplam_minor } });
    });
    return 'Kazanan teklif belirlendi; sipariş bu tekliften açılabilir';
  }

  if (['gonder', 'topla', 'degerlendir', 'iptal_et'].includes(govde._eylem)) {
    if (govde._eylem === 'gonder'
      && !Number(tek('SELECT COUNT(*) AS n FROM rfq_tedarikci WHERE rfq_id = ?', q.id)?.n ?? 0)) {
      throw GecisIzinsiz('Davetli tedarikçi olmadan RFQ gönderilemez.');
    }
    gecisYap(ctx, { nesne: 'rfq', tablo: 'rfq', kayit: q, eylem: govde._eylem,
      gerekce: govde.gerekce, ekranKodu: 'PRC-06' });
    return 'RFQ durumu güncellendi';
  }
  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

/** Teklif kaydı — elle (PRC-06) veya portalden (PRC-05) aynı yolu kullanır. */
function teklifKaydet(ctx, q, govde, { kaynak, tedarikciId = null }) {
  if (['sonuclandi', 'iptal'].includes(q.durum)) {
    throw GecisIzinsiz('Sonuçlanmış teklif talebine teklif eklenemez.');
  }
  /* Gönderilmemiş RFQ'ya teklif "gelmiş" olamaz — önce tedarikçilere gönderilir. */
  if (q.durum === 'taslak') {
    throw GecisIzinsiz('Teklif talebi henüz tedarikçilere gönderilmedi; önce "Tedarikçilere gönder" deyin.');
  }
  if (q.son_teklif_tarihi && q.son_teklif_tarihi < simdi()) {
    throw GecisIzinsiz('Teklif verme süresi doldu.');
  }
  const tedId = tedarikciId || govde.tedarikciId;
  const ted = tek('SELECT * FROM tedarikci WHERE id = ? AND tenant_id = ?', tedId, ctx.tenant.id);
  if (!ted) throw DogrulamaHatasi('Tedarikçi seçin.', { alanlar: { tedarikciId: ['Tedarikçi bulunamadı.'] } });
  const kalemler = kalemleriCoz(govde, 'teklif', { fiyatZorunlu: true });
  if (!kalemler.length) {
    throw DogrulamaHatasi('En az bir teklif kalemi girilmelidir.',
      { alanlar: { teklif0Aciklama: ['Kalemsiz teklif kaydedilemez.'] } });
  }
  const mevcut = tek('SELECT * FROM teklif WHERE rfq_id = ? AND tedarikci_id = ?', q.id, ted.id);
  if (mevcut && mevcut.durum !== 'alindi') {
    throw GecisIzinsiz('Değerlendirmeye alınmış teklif değiştirilemez; revize teklif yeni RFQ ile alınır.');
  }

  islem(() => {
    let teklifId = mevcut?.id;
    if (mevcut) {
      calistir('DELETE FROM teklif_kalemi WHERE teklif_id = ?', mevcut.id);
      surumluGuncelle('teklif', mevcut.id, mevcut.surum, {
        gecerlilik: govde.gecerlilik ? gunBaslangici(govde.gecerlilik) : null,
        teslim_gun: govde.teslimGun ? Number(govde.teslimGun) : null,
        odeme_vadesi_gun: govde.odemeVadesiGun ? Number(govde.odemeVadesiGun) : null,
        notlar: govde.notlar || null, kaynak,
      }, { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
    } else {
      teklifId = kimlik('teklif');
      const kod = sonrakiKod(ctx.tenant.id, 'teklif_kaydi');
      calistir(`INSERT INTO teklif (id, tenant_id, rfq_id, tedarikci_id, kod, gecerlilik, teslim_gun,
                  odeme_vadesi_gun, toplam_minor, toplam_birim, notlar, kaynak, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?,0,?,?,?, 'alindi', ?,?)`,
        teklifId, ctx.tenant.id, q.id, ted.id, kod,
        govde.gecerlilik ? gunBaslangici(govde.gecerlilik) : null,
        govde.teslimGun ? Number(govde.teslimGun) : null,
        govde.odemeVadesiGun ? Number(govde.odemeVadesiGun) : null,
        govde.paraBirimi || 'TRY', govde.notlar || null, kaynak,
        ctx.kullanici?.id || null, simdi());
    }
    for (const k of kalemler) {
      calistir(`INSERT INTO teklif_kalemi (id, teklif_id, talep_kalemi_id, sira, aciklama, birim,
                  miktar_binde, birim_fiyat_minor, birim_fiyat_birim)
                VALUES (?,?,?,?,?,?,?,?,?)`,
        kimlik('satir'), teklifId, k.kaynakId, k.sira, k.aciklama, k.birim, k.miktarBinde,
        String(k.fiyatMinor), govde.paraBirimi || 'TRY');
    }
    const toplam = toplamiTazele('teklif', teklifId, teklifToplami);
    calistir(`UPDATE rfq_tedarikci SET durum = 'teklif_verdi' WHERE rfq_id = ? AND tedarikci_id = ?`,
      q.id, ted.id);
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici?.id || null,
      istekId: ctx.istekId, ip: ctx.ip, nesne: 'teklif', nesneId: teklifId,
      eylem: mevcut ? 'teklif_guncellendi' : 'teklif_alindi',
      sonraki: { tedarikci: ted.kod, kaynak, toplamMinor: toplam, kalem: kalemler.length } });
  });
  return `${ted.unvan} teklifi kaydedildi`;
}

function karsilastirmaSayfasi(ctx, id, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('PRC-06');
  yetkiZorunlu(ctx, e.yetki);
  const q = tek('SELECT * FROM rfq WHERE id = ? AND tenant_id = ?', id, ctx.tenant.id);
  if (!q) throw Bulunamadi('Teklif talebi bulunamadı.');
  const davetliler = sorgu(
    `SELECT r.*, t.kod, t.unvan FROM rfq_tedarikci r JOIN tedarikci t ON t.id = r.tedarikci_id
      WHERE r.rfq_id = ? ORDER BY t.unvan`, q.id);
  const teklifler = sorgu(
    `SELECT t.*, td.unvan, td.kod AS tedarikci_kod FROM teklif t
       JOIN tedarikci td ON td.id = t.tedarikci_id WHERE t.rfq_id = ? ORDER BY t.toplam_minor`, q.id);
  const talepKalemleri = q.talep_id
    ? sorgu('SELECT * FROM talep_kalemi WHERE talep_id = ? ORDER BY sira', q.talep_id) : [];
  const kazanan = teklifler.find((t) => t.durum === 'kazandi');
  const enDusuk = teklifler.length
    ? teklifler.reduce((a, b) => (Number(a.toplam_minor) <= Number(b.toplam_minor) ? a : b)) : null;
  const secilebilir = !['sonuclandi', 'iptal'].includes(q.durum) && teklifler.length > 0;

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: 'Teklif talebi açıldı' }) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.detayOzetSeridi({
    kod: q.kod, baslik: q.baslik, durum: q.durum, surum: q.surum,
    isaretler: q.son_teklif_tarihi && q.son_teklif_tarihi < simdi() && !['sonuclandi', 'iptal'].includes(q.durum)
      ? [{ metin: 'teklif süresi doldu', ton: 'danger' }] : [],
    bilgiler: [
      { etiket: 'Kaynak talep', deger: q.talep_id
        ? h`<a href="/satinalma/talepler/${q.talep_id}">${
          tek('SELECT kod FROM talep WHERE id = ?', q.talep_id)?.kod || '—'}</a>` : '—' },
      { etiket: 'Davetli', deger: sayi(davetliler.length) },
      { etiket: 'Teklif', deger: sayi(teklifler.length) },
      { etiket: 'Son teklif tarihi', deger: q.son_teklif_tarihi ? tarih(q.son_teklif_tarihi) : '—' },
      { etiket: 'En düşük', deger: enDusuk ? para(enDusuk.toplam_minor, enDusuk.toplam_birim) : '—' },
    ],
    birincilEylem: kazanan && yetkiVar(ctx, 'PRC-08:olustur')
      ? B.btn('Siparişe dönüştür', { tur: 'acc', ikon: 'fa-cart-plus',
        rota: `/satinalma/siparisler/yeni?teklifId=${kazanan.id}` }) : null,
    digerEylemler: B.btn('RFQ listesi', { rota: '/satinalma/rfq' }),
  })}
${q.sartname ? h`<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Şartname</b></div></div>
  <div class="gc-body"><p style="font-size:13.5px;line-height:1.7;white-space:pre-wrap">${q.sartname}</p></div>
</div>` : ''}
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Teklif karşılaştırma</b>
    <span>Toplam kalemlerden hesaplanır. En düşük teklif işaretlidir; farklı seçim gerekçe ister.</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: teklifler,
    bosDurum: { baslik: 'Teklif yok', ikon: 'fa-file-invoice-dollar',
      aciklama: 'Tedarikçileri davet edin veya teklifi elle girin.' },
    sutunlar: [
      { ad: 'unvan', etiket: 'Tedarikçi', govde: (t) => h`<a href="/tedarikciler/${t.tedarikci_id}"><b>${t.unvan}</b></a>
        <br><span class="muted">${t.kod} · ${t.kaynak === 'portal' ? 'portalden' : 'elle'}</span>` },
      { ad: 'toplam_minor', etiket: 'Toplam', hizala: 'sag', govde: (t) => h`${
        para(t.toplam_minor, t.toplam_birim)}${enDusuk && t.id === enDusuk.id
        ? h` ${B.isaret('en düşük', 'ok')}` : ''}` },
      { ad: 'fark', etiket: 'En düşükten fark', hizala: 'sag', govde: (t) => (!enDusuk
        || Number(enDusuk.toplam_minor) === 0 ? '—'
        : `%${(((Number(t.toplam_minor) - Number(enDusuk.toplam_minor)) / Number(enDusuk.toplam_minor)) * 100)
          .toFixed(1).replace('.', ',')}`) },
      { ad: 'teslim_gun', etiket: 'Teslim', govde: (t) => (t.teslim_gun ? `${t.teslim_gun} gün` : '—') },
      { ad: 'odeme_vadesi_gun', etiket: 'Vade', govde: (t) => (t.odeme_vadesi_gun ? `${t.odeme_vadesi_gun} gün` : '—') },
      { ad: 'kalem', etiket: 'Kalem', hizala: 'sag', govde: (t) => sayi(Number(tek(
        'SELECT COUNT(*) AS n FROM teklif_kalemi WHERE teklif_id = ?', t.id)?.n ?? 0)) },
      { ad: 'durum', etiket: 'Durum', govde: (t) => B.rozet(
        t.durum === 'kazandi' ? 'onaylandi' : t.durum === 'kaybetti' ? 'reddedildi' : 'beklemede',
        { alindi: 'Alındı', degerlendirmede: 'Değerlendirmede', kazandi: 'Kazandı',
          kaybetti: 'Kaybetti', iptal: 'İptal' }[t.durum]) },
      { ad: 'sec', etiket: '', govde: (t) => (!secilebilir || !yetkiVar(ctx, 'PRC-06:guncelle') ? '—'
        : h`<form method="post" action="/satinalma/karsilastirma/${q.id}"
              style="display:flex;gap:6px;align-items:center">
            ${ham(csrfAlani(ctx))}
            <input type="hidden" name="_eylem" value="kazanan">
            <input type="hidden" name="teklifId" value="${t.id}">
            <input type="text" name="gerekce" placeholder="Seçim gerekçesi" aria-label="Gerekçe"
              style="max-width:150px">
            <button class="btn btn-acc btn-sm" type="submit">Kazanan</button>
          </form>`) },
    ],
  })}</div>
</div>
<div class="dash-cols">
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>Davetli tedarikçiler</b>
      <span>Her davet ayrı token taşır; portal oturumsuz ve yalnız o RFQ ile sınırlıdır.</span></div></div>
    <div class="gc-body flush">${B.tablo({
    satirlar: davetliler,
    bosDurum: { baslik: 'Davetli yok', ikon: 'fa-paper-plane',
      aciklama: 'Davetsiz RFQ gönderilemez.' },
    sutunlar: [
      { ad: 'unvan', etiket: 'Tedarikçi', govde: (d) => h`<b>${d.unvan}</b><br><span class="muted">${d.kod}</span>` },
      { ad: 'gonderildi', etiket: 'Davet', govde: (d) => (d.gonderildi ? tarih(d.gonderildi) : '—') },
      { ad: 'durum', etiket: 'Durum', govde: (d) => B.isaret(
        { davetli: 'davetli', goruntulendi: 'görüntüledi', teklif_verdi: 'teklif verdi',
          reddetti: 'reddetti', suresi_gecti: 'süresi geçti' }[d.durum] || d.durum,
        d.durum === 'teklif_verdi' ? 'ok' : 'info') },
    ],
  })}</div>
  </div>
  <div class="gv-side-stack">
    ${yetkiVar(ctx, 'PRC-06:guncelle') && !['sonuclandi', 'iptal'].includes(q.durum) ? h`
    ${B.form({
    rota: `/satinalma/karsilastirma/${q.id}`, csrf: csrfAlani(ctx),
    bolumler: [{ baslik: 'Tedarikçi davet et', alanlar: h`
      ${ham('<input type="hidden" name="_eylem" value="davet">')}
      ${B.alan({ ad: 'tedarikciId', etiket: 'Tedarikçi', zorunlu: true,
      secenekler: [{ deger: '', etiket: 'Seçin…' }, ...sorgu(
        `SELECT id, kod, unvan FROM tedarikci WHERE tenant_id = ? AND durum = 'aktif' ORDER BY unvan`,
        ctx.tenant.id).map((t) => ({ deger: t.id, etiket: `${t.kod} — ${t.unvan}` }))] })}` }],
    eylemler: B.btn('Davet et', { tur: 'acc', gonder: true, ikon: 'fa-paper-plane' }),
  })}
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>RFQ durumu</b>
        <span>Kazanan seçimi RFQ'yu sonuçlandırır; sonrası değişmez (kural 6).</span></div></div>
      <div class="gc-body">
        <form method="post" action="/satinalma/karsilastirma/${q.id}" data-gform="1">
          ${ham(csrfAlani(ctx))}
          ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe', tur: 'metin' })}
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
            ${q.durum === 'taslak'
    ? h`<button class="btn btn-acc" type="submit" name="_eylem" value="gonder">
        Tedarikçilere gönder</button>` : ''}
            ${['gonderildi', 'toplaniyor'].includes(q.durum)
    ? h`<button class="btn btn-ghost" type="submit" name="_eylem" value="degerlendir">
        Değerlendirmeye al</button>` : ''}
            <button class="btn btn-danger" type="submit" name="_eylem" value="iptal_et">RFQ'yu iptal et</button>
          </div>
        </form>
      </div>
    </div>
    ${B.form({
    rota: `/satinalma/karsilastirma/${q.id}`, csrf: csrfAlani(ctx),
    bolumler: [{ baslik: 'Teklifi elle gir',
      aciklama: 'Faks/e-posta ile gelen teklifler buradan girilir; kaynak "elle" işaretlenir.',
      alanlar: h`
      ${ham('<input type="hidden" name="_eylem" value="teklif">')}
      ${B.alan({ ad: 'tedarikciId', etiket: 'Tedarikçi', zorunlu: true, deger: deger.tedarikciId || '',
      secenekler: [{ deger: '', etiket: 'Seçin…' },
        ...davetliler.map((d) => ({ deger: d.tedarikci_id, etiket: d.unvan }))] })}
      ${B.alan({ ad: 'teslimGun', etiket: 'Teslim süresi (gün)', tur: 'number' })}
      ${B.alan({ ad: 'odemeVadesiGun', etiket: 'Ödeme vadesi (gün)', tur: 'number' })}
      ${Array.from({ length: 3 }, (_, i) => h`
        ${B.alan({ ad: `teklif${i}Aciklama`, etiket: `${i + 1}. kalem`, genis: true,
      deger: talepKalemleri[i]?.aciklama || '' })}
        ${B.alan({ ad: `teklif${i}Miktar`, etiket: 'Miktar',
      deger: talepKalemleri[i] ? miktarMetni(talepKalemleri[i].miktar_binde) : '' })}
        ${B.alan({ ad: `teklif${i}Birim`, etiket: 'Birim', deger: talepKalemleri[i]?.birim || 'ad' })}
        ${B.alan({ ad: `teklif${i}Fiyat`, etiket: 'Birim fiyat' })}`)}` }],
    eylemler: B.btn('Teklifi kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  })}` : ''}
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: q.kod, baslik: q.baslik }));
}

/* ==========================================================================
   PRC-05 tedarikçi teklif portalı (oturumsuz, tokenli)
   ========================================================================== */
function davetiCoz(ctx, acikToken) {
  const ozet = tokenOzeti(String(acikToken || ''));
  const d = tek(
    `SELECT r.*, q.kod AS rfq_kod, q.baslik, q.sartname, q.son_teklif_tarihi, q.durum AS rfq_durum,
            q.id AS rfq_id, q.talep_id, t.unvan, t.kod AS tedarikci_kod, t.tenant_id AS ted_tenant
       FROM rfq_tedarikci r
       JOIN rfq q ON q.id = r.rfq_id
       JOIN tedarikci t ON t.id = r.tedarikci_id
      WHERE r.token_ozeti = ?`, ozet);
  if (!d) throw Bulunamadi('Bu bağlantı geçersiz.');
  if (d.token_bitis && d.token_bitis < simdi()) throw YetkiYok('Bu teklif bağlantısının süresi doldu.');
  return d;
}

/** Portal bağlamı: oturum YOK; tenant ve tedarikçi TOKENDEN çözülür. */
function portalBaglami(ctx, d) {
  const t = tek('SELECT * FROM tenant WHERE id = ?', d.tenant_id);
  return { ...ctx, tenant: t, kullanici: ctx.kullanici || null };
}

function portalSayfasi(ctx, acikToken, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('PRC-05');
  const d = davetiCoz(ctx, acikToken);
  const pctx = portalBaglami(ctx, d);
  const mevcut = tek('SELECT * FROM teklif WHERE rfq_id = ? AND tedarikci_id = ?', d.rfq_id, d.tedarikci_id);
  const kalemler = mevcut
    ? sorgu('SELECT * FROM teklif_kalemi WHERE teklif_id = ? ORDER BY sira', mevcut.id)
    : (d.talep_id ? sorgu('SELECT * FROM talep_kalemi WHERE talep_id = ? ORDER BY sira', d.talep_id) : []);
  const kapali = ['sonuclandi', 'iptal'].includes(d.rfq_durum)
    || (d.son_teklif_tarihi && d.son_teklif_tarihi < simdi());

  if (!mevcut && d.durum === 'davetli') {
    islem(() => {
      calistir(`UPDATE rfq_tedarikci SET durum = 'goruntulendi', goruntulendi = ? WHERE id = ?`, simdi(), d.id);
      audit.yaz({ tenantId: d.tenant_id, nesne: 'rfq', nesneId: d.rfq_id, istekId: ctx.istekId, ip: ctx.ip,
        eylem: 'portal_goruntulendi', sonraki: { tedarikci: d.tedarikci_kod } });
    });
  }

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem'),
    aciklama: 'Teklifiniz kaydedildi. Son teklif tarihine kadar güncelleyebilirsiniz.' }) : ''}
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-body">
    <div class="gv-cap-sm">${pctx.tenant?.ad || ''} · Teklif talebi</div>
    <h2 style="margin:6px 0">${d.rfq_kod} — ${d.baslik}</h2>
    <dl class="gd-grid">
      <div><dt>Firmanız</dt><dd>${d.unvan}</dd></div>
      <div><dt>Son teklif tarihi</dt><dd>${d.son_teklif_tarihi ? tarih(d.son_teklif_tarihi) : '—'}</dd></div>
      <div><dt>Durum</dt><dd>${mevcut ? 'Teklifiniz alındı' : 'Teklif bekleniyor'}</dd></div>
    </dl>
    ${d.sartname ? h`<p style="margin-top:12px;font-size:13.5px;line-height:1.7;white-space:pre-wrap">${d.sartname}</p>` : ''}
  </div>
</div>
${kapali
    ? B.sonucSeridi({ tur: 'warn', baslik: 'Teklif verme kapalı',
      aciklama: 'Son teklif tarihi geçti veya süreç sonuçlandı.' })
    : B.form({
      rota: `/tedarikci/teklif/${acikToken}`, csrf: csrfAlani(ctx), hatalar: hata,
      bolumler: [
        { baslik: 'Ticari koşullar', alanlar: h`
          ${B.alan({ ad: 'teslimGun', etiket: 'Teslim süresi (gün)', tur: 'number',
            deger: deger.teslimGun ?? mevcut?.teslim_gun ?? '' })}
          ${B.alan({ ad: 'odemeVadesiGun', etiket: 'Ödeme vadesi (gün)', tur: 'number',
            deger: deger.odemeVadesiGun ?? mevcut?.odeme_vadesi_gun ?? '' })}
          ${B.alan({ ad: 'gecerlilik', etiket: 'Teklif geçerlilik tarihi', tur: 'date',
            deger: deger.gecerlilik || (mevcut?.gecerlilik ? gunAnahtari(mevcut.gecerlilik) : '') })}
          ${B.alan({ ad: 'notlar', etiket: 'Notlar', tur: 'metin', genis: true,
            deger: deger.notlar ?? mevcut?.notlar ?? '' })}` },
        { baslik: 'Kalem fiyatları',
          aciklama: 'Toplam tutar girmezsiniz; kalem fiyatlarından hesaplanır.',
          alanlar: h`${Array.from({ length: Math.max(3, kalemler.length) }, (_, i) => {
            const k = kalemler[i];
            return h`
            ${B.alan({ ad: `teklif${i}Aciklama`, etiket: `${i + 1}. kalem`, genis: true,
              deger: deger[`teklif${i}Aciklama`] ?? k?.aciklama ?? '' })}
            ${B.alan({ ad: `teklif${i}Miktar`, etiket: 'Miktar',
              deger: deger[`teklif${i}Miktar`] ?? (k ? miktarMetni(k.miktar_binde) : '') })}
            ${B.alan({ ad: `teklif${i}Birim`, etiket: 'Birim',
              deger: deger[`teklif${i}Birim`] ?? k?.birim ?? 'ad' })}
            ${B.alan({ ad: `teklif${i}Fiyat`, etiket: 'Birim fiyat',
              deger: deger[`teklif${i}Fiyat`] ?? (k?.birim_fiyat_minor != null
                ? Para.minor(k.birim_fiyat_minor, k.birim_fiyat_birim || 'TRY').bicim({ simge: false }) : '') })}`;
          })}` },
      ],
      eylemler: B.btn(mevcut ? 'Teklifi güncelle' : 'Teklifi gönder',
        { tur: 'acc', gonder: true, ikon: 'fa-paper-plane' }),
    })}
${mevcut ? h`<div class="gv-card" style="margin-top:18px"><div class="gc-body">
  <div class="gv-cap-sm">Kayıtlı teklifiniz</div>
  <p style="margin-top:8px;font-size:14px"><b>${para(mevcut.toplam_minor, mevcut.toplam_birim)}</b>
    <span class="muted"> · ${kalemler.length} kalem</span></p>
</div></div>` : ''}`;

  /* Portal kabuğu YOK: dış kullanıcı iç menüyü görmez. */
  return html(ctx, durum, portalKabugu(pctx, `${d.rfq_kod} — teklif`, icerik));
}

function portalTeklif(ctx, acikToken, govde) {
  const d = davetiCoz(ctx, acikToken);
  const pctx = portalBaglami(ctx, d);
  const q = tek('SELECT * FROM rfq WHERE id = ?', d.rfq_id);
  csrfZorunlu(ctx, govde);
  teklifKaydet(pctx, q, { ...govde, paraBirimi: pctx.tenant?.para_birimi || 'TRY' },
    { kaynak: 'portal', tedarikciId: d.tedarikci_id });
  return 'Teklifiniz alındı';
}

/** Dış portal kabuğu — rail/menü yok, yalnız içerik ve künye. */
function portalKabugu(ctx, baslik, icerik) {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>${baslik} — [ÜRÜN ADI]</title>
<link rel="stylesheet" href="/varliklar/css/tokens.css">
<link rel="stylesheet" href="/varliklar/css/ui.css">
<link rel="stylesheet" href="/varliklar/css/uygulama.css">
</head>
<body data-sec="dis" data-screen="PRC-05" class="gv-portal">
<main class="gv-main" style="max-width:960px;margin:0 auto;padding:32px 20px">
  <div class="gv-page-head">
    <div class="ph-txt">
      <div class="ph-eyebrow">Tedarikçi portalı</div>
      <h1>${baslik}</h1>
      <div class="ph-sub">Bu sayfa yalnız size özel bağlantıyla açılır; oturum açmanız gerekmez.</div>
    </div>
  </div>
  ${icerik}
  <p class="gf-hint" style="margin-top:24px">Bu bağlantı yalnız bu teklif talebi için geçerlidir
    ve son teklif tarihinde kapanır.</p>
</main>
</body>
</html>`;
}

/* ==========================================================================
   PRC-07..10 sipariş
   ========================================================================== */
function siparisListesi(ctx, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('PRC-07');
  yetkiZorunlu(ctx, e.yetki);
  const { kosullar, parametreler } = filtreKosullari(ctx, {
    aramaAlanlari: ['baslik', 'kod'], filtreler: [{ ad: 'durum' }, { ad: 'tedarikci_id' }],
  });
  const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
    { tablo: 'siparis', kosullar, parametreler, sirala: 'olusturuldu DESC' });

  const kalanBilgisi = (s) => {
    const k = sorgu('SELECT miktar_binde, teslim_binde FROM siparis_kalemi WHERE siparis_id = ?', s.id);
    const toplamM = k.reduce((a, x) => a + x.miktar_binde, 0);
    const teslim = k.reduce((a, x) => a + x.teslim_binde, 0);
    return { toplamM, teslim, oran: toplamM ? Math.round((teslim / toplamM) * 100) : 0 };
  };

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Onaylı sipariş', deger: sayi(sayac(ctx.tenant.id, 'siparis', `durum = 'onaylandi'`)),
        ikon: 'fa-file-invoice' },
      { etiket: 'Onay bekleyen', deger: sayi(sayac(ctx.tenant.id, 'siparis',
        `durum IN ('onaya_gonderildi','incelemede')`)), ikon: 'fa-hourglass-half' },
      { etiket: 'Termini geçmiş', ton: 'danger', ikon: 'fa-clock', deger: sayi(sayac(ctx.tenant.id, 'siparis',
        `teslim_tarihi < ? AND durum = 'onaylandi'`, simdi())) },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ]),
    filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Sipariş başlığı veya kodu…',
      filtreler: [
        { ad: 'durum', etiket: 'Durum', secenekler: ['taslak', 'onaya_gonderildi', 'incelemede',
          'onaylandi', 'reddedildi', 'iptal'].map((d) => ({ deger: d, etiket: d })) },
        { ad: 'tedarikci_id', etiket: 'Tedarikçi', secenekler: sorgu(
          'SELECT id, unvan FROM tedarikci WHERE tenant_id = ? ORDER BY unvan', ctx.tenant.id)
          .map((t) => ({ deger: t.id, etiket: t.unvan })) },
      ] }),
    icerik: B.tablo({
      satirlar,
      satirRota: (r) => `/satinalma/siparisler/${r.id}`,
      bosDurum: { baslik: 'Sipariş yok', ikon: 'fa-file-invoice',
        aciklama: 'Sipariş yalnız ONAYLI talepten veya kazanan tekliften açılır.',
        eylem: yetkiVar(ctx, 'PRC-08:olustur')
          ? B.btn('Yeni sipariş', { tur: 'acc', rota: '/satinalma/siparisler/yeni', ikon: 'fa-plus' }) : null },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod', govde: (r) => h`${r.kod}<br><span class="muted">sürüm ${r.surum_no}</span>` },
        { ad: 'baslik', etiket: 'Sipariş', govde: (r) => h`<a href="/satinalma/siparisler/${r.id}"><b>${r.baslik}</b></a>
          <br><span class="muted">${tek('SELECT unvan FROM tedarikci WHERE id = ?', r.tedarikci_id)?.unvan || ''}</span>` },
        { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag', govde: (r) => para(r.tutar_minor, r.tutar_birim) },
        { ad: 'teslim_tarihi', etiket: 'Termin', govde: (r) => (r.teslim_tarihi ? tarih(r.teslim_tarihi) : '—') },
        { ad: 'kalan', etiket: 'Teslim', hizala: 'sag', govde: (r) => {
          if (r.durum !== 'onaylandi') return '—';
          const k = kalanBilgisi(r);
          return k.oran >= 100 ? B.isaret('tamamlandı', 'ok')
            : B.isaret(`%${k.oran}`, k.oran ? 'warn' : 'info');
        } },
        { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}`;
  return html(ctx, durum, ciz(ctx, e, icerik, {
    eylemler: yetkiVar(ctx, 'PRC-08:olustur')
      ? B.btn('Yeni sipariş', { tur: 'acc', rota: '/satinalma/siparisler/yeni', ikon: 'fa-plus' }) : null,
  }));
}

/**
 * PRC-01 KABUL NOKTASI — onaysız talep siparişe dönüşmez.
 * Sipariş üç kaynaktan açılır: onaylı talep, kazanan teklif veya doğrudan
 * (talepsiz acil alım). Talep kaynaklıysa miktar talebi AŞAMAZ.
 */
function siparisAc(ctx, govde) {
  const baslik = String(govde.baslik || '').trim();
  if (!baslik) throw DogrulamaHatasi('Sipariş başlığı zorunludur.', { alanlar: { baslik: ['Başlık girin.'] } });
  const ted = govde.tedarikciId
    ? tek('SELECT * FROM tedarikci WHERE id = ? AND tenant_id = ?', govde.tedarikciId, ctx.tenant.id) : null;
  if (!ted) throw DogrulamaHatasi('Tedarikçi seçin.', { alanlar: { tedarikciId: ['Tedarikçi bulunamadı.'] } });
  if (ted.durum !== 'aktif') throw GecisIzinsiz(`${ted.unvan} aktif değil (${ted.durum}); sipariş açılamaz.`);

  const talep = govde.talepId
    ? tek('SELECT * FROM talep WHERE id = ? AND tenant_id = ?', govde.talepId, ctx.tenant.id) : null;
  if (govde.talepId && !talep) throw DogrulamaHatasi('Talep bulunamadı.');
  if (talep && talep.durum !== 'onaylandi') {
    throw GecisIzinsiz(
      `"${talep.kod}" talebi "${talep.durum}" durumunda. ONAYLANMAMIŞ talep siparişe dönüştürülemez (PRC-01).`);
  }
  const teklif = govde.teklifId
    ? tek('SELECT * FROM teklif WHERE id = ? AND tenant_id = ?', govde.teklifId, ctx.tenant.id) : null;
  if (govde.teklifId && !teklif) throw DogrulamaHatasi('Teklif bulunamadı.');
  if (teklif && teklif.durum !== 'kazandi') {
    throw GecisIzinsiz('Yalnız KAZANAN teklif siparişe dönüştürülebilir.');
  }
  if (teklif && teklif.tedarikci_id !== ted.id) {
    throw DogrulamaHatasi('Seçilen tedarikçi kazanan teklifin sahibi değil.');
  }

  const kalemler = kalemleriCoz(govde, 'kalem', { fiyatZorunlu: true });
  if (!kalemler.length) {
    throw DogrulamaHatasi('En az bir sipariş kalemi girilmelidir.',
      { alanlar: { kalem0Aciklama: ['Kalemsiz sipariş açılamaz.'] } });
  }

  /* Talep kalemine bağlı satırlarda kalan miktar kontrolü. */
  const hatalar = {};
  for (const [i, k] of kalemler.entries()) {
    if (!k.kaynakId) continue;
    const tk = tek('SELECT * FROM talep_kalemi WHERE id = ? AND talep_id = ?', k.kaynakId, talep?.id || '');
    if (!tk) { hatalar[`kalem${i}Kaynak`] = ['Talep kalemi bulunamadı.']; continue; }
    const kalan = tk.miktar_binde - tk.siparis_edilen_binde;
    if (k.miktarBinde > kalan) {
      hatalar[`kalem${i}Miktar`] = [
        `Talepte kalan ${miktarMetni(kalan)} ${tk.birim}; daha fazlası sipariş edilemez.`];
    }
  }
  if (Object.keys(hatalar).length) throw DogrulamaHatasi('Sipariş miktarları talebi aşıyor.', { alanlar: hatalar });

  const teslim = govde.teslimTarihi ? gunBaslangici(govde.teslimTarihi) : null;

  return islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'siparis');
    const id = kimlik('siparis');
    calistir(`INSERT INTO siparis (id, tenant_id, kod, baslik, tedarikci_id, talep_id, teklif_id,
                proje_id, santiye_id, depo_id, maliyet_kodu, teslim_tarihi, odeme_vadesi_gun,
                tutar_minor, tutar_birim, surum_no, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,1, 'taslak', ?,?)`,
      id, ctx.tenant.id, kod, baslik, ted.id, talep?.id || null, teklif?.id || null,
      talep?.proje_id || govde.projeId || null, talep?.santiye_id || govde.santiyeId || null,
      govde.depoId || talep?.depo_id || null, govde.maliyetKodu || talep?.maliyet_kodu || null,
      teslim, govde.odemeVadesiGun ? Number(govde.odemeVadesiGun) : ted.odeme_vadesi_gun,
      govde.paraBirimi || ctx.tenant.para_birimi, ctx.kullanici.id, simdi());

    for (const k of kalemler) {
      calistir(`INSERT INTO siparis_kalemi (id, tenant_id, siparis_id, talep_kalemi_id, stok_karti_id,
                  sira, aciklama, birim, miktar_binde, birim_fiyat_minor, birim_fiyat_birim)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        kimlik('satir'), ctx.tenant.id, id, k.kaynakId, k.stokKartiId, k.sira, k.aciklama,
        k.birim, k.miktarBinde, String(k.fiyatMinor), govde.paraBirimi || ctx.tenant.para_birimi);
      if (k.kaynakId) {
        calistir('UPDATE talep_kalemi SET siparis_edilen_binde = siparis_edilen_binde + ? WHERE id = ?',
          k.miktarBinde, k.kaynakId);
      }
    }
    const toplam = toplamiTazele('siparis', id, siparisToplami);
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'siparis', nesneId: id, eylem: 'olustur',
      sonraki: { kod, tedarikci: ted.kod, talep: talep?.kod || null, teklif: teklif?.kod || null,
        kalem: kalemler.length, tutarMinor: toplam } });
    return { id, kod };
  });
}

function siparisFormu(ctx, { deger = {}, hata = null }) {
  const e = ekranNesnesi('PRC-08');
  const talepId = deger.talepId || ctx.sorgu.get('talepId') || '';
  const teklifId = deger.teklifId || ctx.sorgu.get('teklifId') || '';
  const teklif = teklifId ? tek('SELECT * FROM teklif WHERE id = ? AND tenant_id = ?', teklifId, ctx.tenant.id) : null;
  const talep = talepId ? tek('SELECT * FROM talep WHERE id = ? AND tenant_id = ?', talepId, ctx.tenant.id)
    : (teklif ? tek(`SELECT t.* FROM talep t JOIN rfq q ON q.talep_id = t.id WHERE q.id = ?`, teklif.rfq_id) : null);

  /* Ön dolgu: kazanan teklifin kalemleri, yoksa talebin kalan kalemleri. */
  const onKalemler = teklif
    ? sorgu('SELECT * FROM teklif_kalemi WHERE teklif_id = ? ORDER BY sira', teklif.id)
      .map((k) => ({ aciklama: k.aciklama, birim: k.birim, miktar: miktarMetni(k.miktar_binde),
        fiyat: Para.minor(k.birim_fiyat_minor, k.birim_fiyat_birim).bicim({ simge: false }),
        kaynak: k.talep_kalemi_id }))
    : (talep ? sorgu('SELECT * FROM talep_kalemi WHERE talep_id = ? ORDER BY sira', talep.id)
      .filter((k) => k.miktar_binde > k.siparis_edilen_binde)
      .map((k) => ({ aciklama: k.aciklama, birim: k.birim,
        miktar: miktarMetni(k.miktar_binde - k.siparis_edilen_binde),
        fiyat: k.tahmini_fiyat_minor != null
          ? Para.minor(k.tahmini_fiyat_minor, k.tahmini_fiyat_birim || 'TRY').bicim({ simge: false }) : '',
        kaynak: k.id })) : []);
  const satirSayisi = Math.max(3, onKalemler.length);

  const tedarikciler = sorgu(
    `SELECT id, kod, unvan FROM tedarikci WHERE tenant_id = ? AND durum = 'aktif' ORDER BY unvan`, ctx.tenant.id)
    .map((t) => ({ deger: t.id, etiket: `${t.kod} — ${t.unvan}` }));
  const onayliTalepler = sorgu(
    `SELECT id, kod, baslik FROM talep WHERE tenant_id = ? AND durum = 'onaylandi' ORDER BY kod DESC LIMIT 100`,
    ctx.tenant.id).map((t) => ({ deger: t.id, etiket: `${t.kod} — ${t.baslik}` }));

  return B.form({
    rota: e.rota, csrf: csrfAlani(ctx), idempotencyAnahtari: kimlik('idempotency'), hatalar: hata,
    bolumler: [
      { baslik: 'Sipariş künyesi',
        aciklama: 'Sipariş ONAYLI talepten veya KAZANAN tekliften açılır; kaynak talep onaysızsa reddedilir.',
        alanlar: h`
          ${B.alan({ ad: 'baslik', etiket: 'Sipariş başlığı', zorunlu: true, genis: true,
            deger: deger.baslik || talep?.baslik || '', hata: hata?.alanlar?.baslik })}
          ${B.alan({ ad: 'tedarikciId', etiket: 'Tedarikçi', zorunlu: true,
            deger: deger.tedarikciId || teklif?.tedarikci_id || '', hata: hata?.alanlar?.tedarikciId,
            secenekler: [{ deger: '', etiket: 'Seçin…' }, ...tedarikciler] })}
          ${B.alan({ ad: 'talepId', etiket: 'Kaynak talep', deger: talep?.id || '',
            secenekler: [{ deger: '', etiket: 'Talepsiz (acil alım)' }, ...onayliTalepler] })}
          ${teklifId ? ham(`<input type="hidden" name="teklifId" value="${teklifId}">`) : ''}
          ${B.alan({ ad: 'teslimTarihi', etiket: 'Teslim tarihi (termin)', tur: 'date',
            deger: deger.teslimTarihi || '' })}
          ${B.alan({ ad: 'odemeVadesiGun', etiket: 'Ödeme vadesi (gün)', tur: 'number',
            deger: deger.odemeVadesiGun || '' })}
          ${B.alan({ ad: 'maliyetKodu', etiket: 'Maliyet kodu', deger: deger.maliyetKodu || talep?.maliyet_kodu || '' })}
          ${B.alan({ ad: 'paraBirimi', etiket: 'Para birimi',
            deger: deger.paraBirimi || teklif?.toplam_birim || ctx.tenant.para_birimi,
            secenekler: Object.keys(BIRIMLER).map((k) => ({ deger: k, etiket: k })) })}` },
      { baslik: 'Kalemler',
        aciklama: 'Tutar kalemlerden hesaplanır. Talep kalemine bağlı satırlarda miktar, talepte KALAN miktarı aşamaz.',
        alanlar: h`${Array.from({ length: satirSayisi }, (_, i) => {
          const o = onKalemler[i];
          return h`
          ${B.alan({ ad: `kalem${i}Aciklama`, etiket: `${i + 1}. kalem — açıklama`, genis: true,
            deger: deger[`kalem${i}Aciklama`] ?? o?.aciklama ?? '',
            hata: hata?.alanlar?.[`kalem${i}Aciklama`] })}
          ${B.alan({ ad: `kalem${i}Miktar`, etiket: 'Miktar',
            deger: deger[`kalem${i}Miktar`] ?? o?.miktar ?? '', hata: hata?.alanlar?.[`kalem${i}Miktar`] })}
          ${B.alan({ ad: `kalem${i}Birim`, etiket: 'Birim', deger: deger[`kalem${i}Birim`] ?? o?.birim ?? 'ad' })}
          ${B.alan({ ad: `kalem${i}Fiyat`, etiket: 'Birim fiyat',
            deger: deger[`kalem${i}Fiyat`] ?? o?.fiyat ?? '', hata: hata?.alanlar?.[`kalem${i}Fiyat`] })}
          ${o?.kaynak ? ham(`<input type="hidden" name="kalem${i}Kaynak" value="${o.kaynak}">`) : ''}`;
        })}` },
    ],
    ozet: h`<div class="gv-card"><div class="gc-body">
      <div class="gv-cap-sm">Kaynak</div>
      <dl class="gd-grid" style="margin-top:12px;padding-top:0;border-top:0">
        <div><dt>Talep</dt><dd>${talep ? h`<a href="/satinalma/talepler/${talep.id}">${talep.kod}</a>
          <span class="muted"> (${talep.durum})</span>` : '—'}</dd></div>
        <div><dt>Teklif</dt><dd>${teklif ? `${teklif.kod} (${teklif.durum})` : '—'}</dd></div>
      </dl>
      <p class="gf-hint" style="margin-top:12px">Sipariş <b>taslak</b> açılır ve onay kademesi
        tutardan seçilir. Onaysız sipariş tedarikçiye gönderilemez.</p>
    </div></div>`,
    eylemler: h`${B.btn('Vazgeç', { rota: '/satinalma/siparisler' })}
      ${B.btn('Kaydet ve detaya git', { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' })}`,
  });
}

function siparisIslemi(ctx, s, govde) {
  if (govde._eylem === 'onaya_gonder') {
    if (!['taslak', 'revizyon_istendi'].includes(s.durum)) {
      throw GecisIzinsiz('Yalnız taslak veya revizyon istenen sipariş onaya gönderilebilir.');
    }
    islem(() => {
      const toplam = toplamiTazele('siparis', s.id, siparisToplami);
      onayMotoru.onayaGonder(ctx, {
        nesne: 'siparis', nesneId: s.id, nesneKod: s.kod, baslik: `Satın alma siparişi: ${s.baslik}`,
        belgeSurum: s.surum, tutarMinor: toplam, tutarBirim: s.tutar_birim,
        projeId: s.proje_id, santiyeId: s.santiye_id, maliyetKodu: s.maliyet_kodu,
        gerekce: govde.gerekce || null,
      });
      gecisYap(ctx, { nesne: 'siparis', tablo: 'siparis', kayit: s, eylem: 'onaya_gonder',
        gerekce: govde.gerekce, ekranKodu: 'PRC-09' });
    });
    return 'Sipariş onaya gönderildi';
  }
  if (['geri_cek', 'iptal_et'].includes(govde._eylem)) {
    if (govde._eylem === 'iptal_et') {
      const teslim = Number(tek(
        'SELECT COALESCE(SUM(teslim_binde),0) AS n FROM siparis_kalemi WHERE siparis_id = ?', s.id)?.n ?? 0);
      if (teslim > 0) throw GecisIzinsiz('Teslimat başlamış sipariş iptal edilemez; revizyon açın.');
    }
    gecisYap(ctx, { nesne: 'siparis', tablo: 'siparis', kayit: s, eylem: govde._eylem,
      gerekce: govde.gerekce, ekranKodu: 'PRC-09' });
    return 'Sipariş durumu güncellendi';
  }
  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

function siparisDetayi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('PRC-09');
  yetkiZorunlu(ctx, e.yetki);
  const s = kaydiAl(ctx, 'siparis', 'siparis', id);
  const ted = tek('SELECT * FROM tedarikci WHERE id = ?', s.tedarikci_id);
  const kalemler = sorgu('SELECT * FROM siparis_kalemi WHERE siparis_id = ? ORDER BY sira', s.id);
  const kabuller = sorgu('SELECT * FROM mal_kabul WHERE siparis_id = ? ORDER BY olusturuldu DESC', s.id);
  const surumler = sorgu('SELECT * FROM siparis WHERE tenant_id = ? AND kod = ? ORDER BY surum_no DESC',
    ctx.tenant.id, s.kod);
  const acikOnay = tek(
    `SELECT id FROM onay_talebi WHERE nesne = 'siparis' AND nesne_id = ? AND durum = 'acik'`, s.id);
  const toplamMiktar = kalemler.reduce((a, k) => a + k.miktar_binde, 0);
  const teslimMiktar = kalemler.reduce((a, k) => a + k.teslim_binde, 0);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: 'Sipariş oluşturuldu',
    aciklama: 'Kayıt taslak durumunda; onaysız sipariş tedarikçiye gönderilemez.' }) : ''}
${ctx.sorgu.get('revizyon') ? B.sonucSeridi({ tur: 'ok', baslik: 'Revizyon sürümü açıldı',
    aciklama: 'Önceki sürüm değişmeden korundu (kural 6).' }) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.detayOzetSeridi({
    kod: `${s.kod} · s.${s.surum_no}`, baslik: s.baslik, durum: s.durum, surum: s.surum,
    isaretler: s.teslim_tarihi && s.teslim_tarihi < simdi() && s.durum === 'onaylandi'
      && teslimMiktar < toplamMiktar
      ? [{ metin: 'termin geçti', ton: 'danger' }] : [],
    bilgiler: [
      { etiket: 'Tedarikçi', deger: h`<a href="/tedarikciler/${s.tedarikci_id}">${ted?.unvan || '—'}</a>` },
      { etiket: 'Tutar', deger: para(s.tutar_minor, s.tutar_birim) },
      { etiket: 'Termin', deger: s.teslim_tarihi ? tarih(s.teslim_tarihi) : '—' },
      { etiket: 'Teslim', deger: toplamMiktar
        ? `%${Math.round((teslimMiktar / toplamMiktar) * 100)}` : '—' },
      { etiket: 'Kaynak talep', deger: s.talep_id
        ? h`<a href="/satinalma/talepler/${s.talep_id}">${
          tek('SELECT kod FROM talep WHERE id = ?', s.talep_id)?.kod || '—'}</a>` : '—' },
    ],
    birincilEylem: s.durum === 'onaylandi' && yetkiVar(ctx, 'STK-04:olustur')
      ? B.btn('Mal kabul aç', { tur: 'acc', rota: `/mal-kabul/yeni?siparisId=${s.id}`, ikon: 'fa-truck-ramp-box' })
      : null,
    digerEylemler: s.durum === 'onaylandi' && yetkiVar(ctx, 'PRC-10:karar_ver')
      ? B.btn('Revizyon', { rota: `/satinalma/siparisler/${s.id}/revizyon`, ikon: 'fa-code-branch' }) : null,
  })}
${acikOnay ? B.sonucSeridi({ tur: 'warn', baslik: 'Onay süreci açık',
    kayitRota: `/onaylar/${acikOnay.id}` }) : ''}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Kalemler ve kalan teslim</b>
        <span>Teslim ve fatura miktarları mal kabul/fatura kayıtlarından türer.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: kalemler,
    bosDurum: { baslik: 'Kalem yok' },
    sutunlar: [
      { ad: 'sira', etiket: '#', hizala: 'sag' },
      { ad: 'aciklama', etiket: 'Kalem', govde: (k) => h`<b>${k.aciklama}</b>` },
      { ad: 'miktar_binde', etiket: 'Sipariş', hizala: 'sag',
        govde: (k) => h`${miktarMetni(k.miktar_binde)} ${k.birim}` },
      { ad: 'teslim_binde', etiket: 'Teslim', hizala: 'sag', govde: (k) => miktarMetni(k.teslim_binde) },
      { ad: 'kalan', etiket: 'Kalan', hizala: 'sag', govde: (k) => {
        const kalan = k.miktar_binde - k.teslim_binde;
        return kalan > 0 ? B.isaret(miktarMetni(kalan), 'warn') : B.isaret('tamam', 'ok');
      } },
      { ad: 'faturalanan_binde', etiket: 'Faturalanan', hizala: 'sag',
        govde: (k) => miktarMetni(k.faturalanan_binde) },
      { ad: 'birim_fiyat_minor', etiket: 'Birim fiyat', hizala: 'sag',
        govde: (k) => para(k.birim_fiyat_minor, k.birim_fiyat_birim) },
      { ad: 'tutar', etiket: 'Tutar', hizala: 'sag',
        govde: (k) => para(Math.round((k.miktar_binde / 1000) * Number(k.birim_fiyat_minor)), k.birim_fiyat_birim) },
    ],
  })}</div>
    </div>
    ${kabuller.length ? h`<div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Mal kabul kayıtları</b></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: kabuller,
    satirRota: (m) => `/mal-kabul/${m.id}`,
    bosDurum: { baslik: 'Mal kabul yok' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'irsaliye_no', etiket: 'İrsaliye', govde: (m) => m.irsaliye_no || '—' },
      { ad: 'irsaliye_tarihi', etiket: 'Tarih', govde: (m) => (m.irsaliye_tarihi ? tarih(m.irsaliye_tarihi) : '—') },
      { ad: 'durum', etiket: 'Durum', govde: (m) => B.rozet(m.durum) },
    ],
  })}</div>
    </div>` : ''}
    ${surumler.length > 1 ? h`<div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Sipariş sürümleri</b>
        <span>Onaylı sipariş yerinde değişmez; revizyon yeni sürüm açar (kural 6).</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: surumler,
    satirRota: (x) => `/satinalma/siparisler/${x.id}`,
    bosDurum: { baslik: 'Sürüm yok' },
    sutunlar: [
      { ad: 'surum_no', etiket: 'Sürüm', govde: (x) => h`<b>${x.surum_no}</b>${
        x.id === s.id ? h` ${B.isaret('görüntülenen', 'info')}` : ''}` },
      { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag', govde: (x) => para(x.tutar_minor, x.tutar_birim) },
      { ad: 'revizyon_gerekcesi', etiket: 'Gerekçe', govde: (x) => x.revizyon_gerekcesi || '—' },
      { ad: 'durum', etiket: 'Durum', govde: (x) => B.rozet(x.durum) },
    ],
  })}</div>
    </div>` : ''}
    ${gecmisKarti('siparis', s)}
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Durum işlemleri</b>
        <span>Onaycı iş akışı şablonundan tutara göre çözülür.</span></div></div>
      <div class="gc-body">
        ${yetkiVar(ctx, 'PRC-09:guncelle') ? h`
        <form method="post" action="/satinalma/siparisler/${s.id}" data-gform="1">
          ${ham(csrfAlani(ctx))}
          ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe / not', tur: 'metin' })}
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
            ${['taslak', 'revizyon_istendi'].includes(s.durum) && !acikOnay
    ? h`<button class="btn btn-acc" type="submit" name="_eylem" value="onaya_gonder">
        Onaya gönder</button>` : ''}
            ${s.durum === 'onaya_gonderildi'
    ? h`<button class="btn btn-ghost" type="submit" name="_eylem" value="geri_cek">
        Onaydan geri çek</button>` : ''}
            ${['taslak', 'revizyon_istendi'].includes(s.durum)
    ? h`<button class="btn btn-danger" type="submit" name="_eylem" value="iptal_et">
        Siparişi iptal et</button>` : ''}
          </div>
        </form>` : ''}
      </div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: s.kod, baslik: s.baslik }));
}

/* PRC-10 — sipariş revizyonu: onaylı sipariş yerinde değişmez. */
function siparisRevizyonAc(ctx, s, govde) {
  if (s.durum !== 'onaylandi') {
    throw GecisIzinsiz('Yalnız ONAYLI sipariş revize edilir; taslak sipariş doğrudan düzenlenir.');
  }
  const gerekce = String(govde.gerekce || '').trim();
  if (!gerekce) {
    throw DogrulamaHatasi('Revizyon gerekçesi zorunludur.',
      { alanlar: { gerekce: ['Miktar/fiyat/termin değişikliğinin nedenini yazın.'] } });
  }
  const acik = tek(
    `SELECT * FROM siparis WHERE tenant_id = ? AND kod = ? AND durum NOT IN ('onaylandi','iptal','reddedildi')`,
    ctx.tenant.id, s.kod);
  if (acik) throw Cakisma(`Bu siparişin ${acik.surum_no}. sürümü hâlâ açık; önce onu sonuçlandırın.`);

  return islem(() => {
    const enBuyuk = Number(tek('SELECT MAX(surum_no) AS n FROM siparis WHERE tenant_id = ? AND kod = ?',
      ctx.tenant.id, s.kod)?.n ?? s.surum_no);
    const yeniId = kimlik('siparis');
    calistir(`INSERT INTO siparis (id, tenant_id, kod, baslik, tedarikci_id, talep_id, teklif_id,
                proje_id, santiye_id, depo_id, maliyet_kodu, teslim_tarihi, odeme_vadesi_gun,
                tutar_minor, tutar_birim, surum_no, onceki_surum_id, revizyon_gerekcesi,
                durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'taslak', ?,?)`,
      yeniId, ctx.tenant.id, s.kod, s.baslik, s.tedarikci_id, s.talep_id, s.teklif_id,
      s.proje_id, s.santiye_id, s.depo_id, s.maliyet_kodu,
      govde.teslimTarihi ? gunBaslangici(govde.teslimTarihi) : s.teslim_tarihi,
      s.odeme_vadesi_gun, s.tutar_minor, s.tutar_birim, enBuyuk + 1, s.id, gerekce,
      ctx.kullanici.id, simdi());

    /* Kalemler kopyalanır; TESLİM ALINMIŞ miktarlar korunur — revizyon geçmişi silmez. */
    for (const k of sorgu('SELECT * FROM siparis_kalemi WHERE siparis_id = ? ORDER BY sira', s.id)) {
      calistir(`INSERT INTO siparis_kalemi (id, tenant_id, siparis_id, talep_kalemi_id, stok_karti_id,
                  sira, aciklama, birim, miktar_binde, birim_fiyat_minor, birim_fiyat_birim,
                  teslim_binde, faturalanan_binde)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        kimlik('satir'), ctx.tenant.id, yeniId, k.talep_kalemi_id, k.stok_karti_id, k.sira,
        k.aciklama, k.birim, k.miktar_binde, k.birim_fiyat_minor, k.birim_fiyat_birim,
        k.teslim_binde, k.faturalanan_binde);
    }
    toplamiTazele('siparis', yeniId, siparisToplami);
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'siparis', nesneId: yeniId, eylem: 'revizyon_acildi', gerekce,
      onceki: { kaynakSurum: s.surum_no, kaynakId: s.id }, sonraki: { surumNo: enBuyuk + 1 } });
    return { id: yeniId };
  });
}

function siparisRevizyonSayfasi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('PRC-10');
  yetkiZorunlu(ctx, e.yetki);
  const s = kaydiAl(ctx, 'siparis', 'siparis', id);
  const surumler = sorgu('SELECT * FROM siparis WHERE tenant_id = ? AND kod = ? ORDER BY surum_no DESC',
    ctx.tenant.id, s.kod);
  const acik = surumler.find((x) => !['onaylandi', 'iptal', 'reddedildi'].includes(x.durum));
  const acilabilir = s.durum === 'onaylandi' && !acik;

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${B.detayOzetSeridi({
    kod: `${s.kod} · s.${s.surum_no}`, baslik: `${s.baslik} — revizyon`, durum: s.durum, surum: s.surum,
    bilgiler: [
      { etiket: 'Tutar', deger: para(s.tutar_minor, s.tutar_birim) },
      { etiket: 'Termin', deger: s.teslim_tarihi ? tarih(s.teslim_tarihi) : '—' },
      { etiket: 'Sürüm sayısı', deger: sayi(surumler.length) },
    ],
    birincilEylem: B.btn('Siparişe dön', { rota: `/satinalma/siparisler/${s.id}` }),
  })}
<div class="dash-cols">
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>Sürüm geçmişi</b>
      <span>Onaylı sipariş yerinde değişmez; her revizyon yeni sürüm satırıdır.</span></div></div>
    <div class="gc-body flush">${B.tablo({
    satirlar: surumler,
    satirRota: (x) => `/satinalma/siparisler/${x.id}`,
    bosDurum: { baslik: 'Sürüm yok' },
    sutunlar: [
      { ad: 'surum_no', etiket: 'Sürüm', govde: (x) => h`<b>${x.surum_no}</b>` },
      { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag', govde: (x) => para(x.tutar_minor, x.tutar_birim) },
      { ad: 'teslim_tarihi', etiket: 'Termin', govde: (x) => (x.teslim_tarihi ? tarih(x.teslim_tarihi) : '—') },
      { ad: 'revizyon_gerekcesi', etiket: 'Gerekçe', govde: (x) => x.revizyon_gerekcesi || '—' },
      { ad: 'durum', etiket: 'Durum', govde: (x) => B.rozet(x.durum) },
    ],
  })}</div>
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Yeni sürüm aç</b>
        <span>Kalemler ve teslim geçmişi kopyalanır; yeni sürüm baştan onaya girer.</span></div></div>
      <div class="gc-body">
        ${s.durum !== 'onaylandi' ? B.sonucSeridi({ tur: 'warn', baslik: 'Bu sürüm onaylı değil',
    aciklama: 'Revizyon yalnız onaylı sipariş üzerinden açılır; taslak sipariş doğrudan düzenlenir.' }) : ''}
        ${acik ? B.sonucSeridi({ tur: 'warn', baslik: `Sürüm ${acik.surum_no} açık`,
    kayitRota: `/satinalma/siparisler/${acik.id}` }) : ''}
        ${acilabilir && yetkiVar(ctx, 'PRC-10:karar_ver') ? h`
        <form method="post" action="/satinalma/siparisler/${s.id}/revizyon" data-gform="1">
          ${ham(csrfAlani(ctx))}
          ${B.alan({ ad: 'gerekce', etiket: 'Revizyon gerekçesi', tur: 'metin', zorunlu: true,
    ipucu: 'Miktar, fiyat, termin veya kapsam değişikliğinin nedeni.' })}
          ${B.alan({ ad: 'teslimTarihi', etiket: 'Yeni termin', tur: 'date',
    deger: s.teslim_tarihi ? gunAnahtari(s.teslim_tarihi) : '' })}
          <div style="margin-top:12px">${B.btn('Revizyon sürümü aç',
    { tur: 'acc', gonder: true, ikon: 'fa-code-branch' })}</div>
        </form>` : ''}
      </div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: s.kod, baslik: s.baslik }));
}

/** Onay motoru kapanışında talep/sipariş durumunu motor ilerletir. */
export function satinalmaOnaySonucu(ctx, nesne, nesneId, sonuc) {
  const tablo = nesne === 'talep' ? 'talep' : 'siparis';
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
