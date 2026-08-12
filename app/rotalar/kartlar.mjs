/* ============================================================================
   KARTLAR — CRD-01..09, CRD-13, CRD-15
   ----------------------------------------------------------------------------
   §6.1: "Kartlar modülü mevcut Pluxee ekranının MultiNet KOPYASI olarak değil;
   çoklu şirket, sağlayıcı, hesap, kart, atama, yükleme ve mutabakatı yöneten
   ORTAK BİR PLATFORM MODÜLÜ olarak uygulanmalıdır."

   Bu yüzden `/kartlar/pluxee` (CRD-07) ve `/kartlar/multinet` (CRD-08) ayrı
   ekran DEĞİL, `/kartlar/liste` görünümünün sağlayıcı filtreli hâlidir —
   varlık/araç ilişkisinin (AST-01/AST-08) aynısı, kural 4.

   Kart numarası: tabloda TAM NUMARA YOKTUR (K-085). Formda istenen değer
   yalnız son dört hanedir; daha uzun girdi reddedilir.
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, tarihSaat, gunAnahtari, gunBaslangici } from '../cekirdek/zaman.mjs';
import { Para } from '../cekirdek/para.mjs';
import { DogrulamaHatasi, GecisIzinsiz, Bulunamadi, Cakisma, UygulamaHatasi } from '../cekirdek/hata.mjs';
import { idempotent } from '../cekirdek/idempotency.mjs';
import * as defter from '../moduller/kartlar/defter.mjs';
import * as A from '../moduller/kartlar/adaptor.mjs';
import { kayitModulu, sayac, gecmisKarti, projeSecenekleri, santiyeSecenekleri } from './kayit-modulu.mjs';
import {
  ekranNesnesi, hataNesnesi, kullaniciAdi, ciz, kaydiAl, listeSorgusu, filtreKosullari,
  gecisFormu, gecisIsle, ozetSeridi, alanMaskeliMi,
  B, h, ham, sayi, csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar,
  sorgu, tek, calistir, islem, surumluGuncelle, audit, sonrakiKod, gecisYap,
} from './ortak.mjs';

const para = (minor, birim = 'TRY') => (minor == null ? '—' : Para.minor(minor, birim || 'TRY').bicim());

export const KART_DURUMLARI = {
  siparis_edildi: 'Sipariş edildi', basimda: 'Basımda', aktiflenebilir: 'Aktiflenebilir',
  aktif: 'Aktif', gecici_bloke: 'Geçici bloke', kayip_calinti: 'Kayıp / çalıntı',
  yenilemede: 'Yenilemede', iptal: 'İptal', suresi_doldu: 'Süresi doldu', arsiv: 'Arşiv',
};
const ROZET_ESLEME = {
  aktif: 'onaylandi', aktiflenebilir: 'beklemede', siparis_edildi: 'beklemede',
  basimda: 'beklemede', yenilemede: 'beklemede',
  gecici_bloke: 'reddedildi', kayip_calinti: 'reddedildi',
  iptal: 'kapali', suresi_doldu: 'kapali', arsiv: 'kapali',
};
const kartRozeti = (d) => B.rozet(ROZET_ESLEME[d] || 'beklemede', KART_DURUMLARI[d] || d);

/* --- Seçenek listeleri ---------------------------------------------------- */
export const saglayiciSecenekleri = (ctx) => sorgu(
  `SELECT id, kod, ad FROM kart_saglayici WHERE tenant_id = ? AND aktif = 1 ORDER BY ad`, ctx.tenant.id)
  .map((s) => ({ deger: s.id, etiket: s.ad }));

export const hesapSecenekleri = (ctx, { saglayiciId = null } = {}) => sorgu(
  `SELECT h.id, h.kod, h.ad, s.ad AS saglayici FROM saglayici_hesabi h
     JOIN kart_saglayici s ON s.id = h.saglayici_id
    WHERE h.tenant_id = ? AND h.durum = 'aktif' ${saglayiciId ? 'AND h.saglayici_id = ?' : ''}
    ORDER BY s.ad, h.ad`, ...(saglayiciId ? [ctx.tenant.id, saglayiciId] : [ctx.tenant.id]))
  .map((h2) => ({ deger: h2.id, etiket: `${h2.saglayici} — ${h2.ad}` }));

export const urunSecenekleri = (ctx, { saglayiciId = null } = {}) => sorgu(
  `SELECT id, kod, ad FROM kart_urunu WHERE tenant_id = ? AND durum = 'aktif'
     ${saglayiciId ? 'AND saglayici_id = ?' : ''} ORDER BY ad`,
  ...(saglayiciId ? [ctx.tenant.id, saglayiciId] : [ctx.tenant.id]))
  .map((u) => ({ deger: u.id, etiket: `${u.kod} — ${u.ad}` }));

const personelSecenekleri = (ctx) => sorgu(
  `SELECT id, kod, ad_soyad FROM personel WHERE tenant_id = ? AND durum IN ('aday','aktif','izinli')
    ORDER BY ad_soyad`, ctx.tenant.id)
  .map((p) => ({ deger: p.id, etiket: `${p.kod} — ${p.ad_soyad}` }));

const aracSecenekleri = (ctx) => sorgu(
  `SELECT id, kod, ad, plaka FROM varlik WHERE tenant_id = ? AND tur = 'arac'
     AND durum NOT IN ('satildi','hurda') ORDER BY kod`, ctx.tenant.id)
  .map((v) => ({ deger: v.id, etiket: `${v.kod} — ${v.ad}${v.plaka ? ` (${v.plaka})` : ''}` }));

/* --- Ortak yardımcılar ---------------------------------------------------- */
/** Kartın o andaki aktif ataması (kart başına tek aktif atama — CRD-02). */
export const aktifAtama = (kartId) => tek(
  `SELECT a.*, p.ad_soyad, p.kod AS personel_kod, v.kod AS varlik_kod, v.plaka
     FROM kart_atamasi a
     LEFT JOIN personel p ON p.id = a.personel_id
     LEFT JOIN varlik v ON v.id = a.varlik_id
    WHERE a.kart_id = ? AND a.durum = 'aktif' ORDER BY a.baslangic DESC LIMIT 1`, kartId);

export const kartiAl = (ctx, id) => {
  const k = tek(
    `SELECT k.*, h.ad AS hesap_ad, h.kod AS hesap_kod, h.para_birimi, h.saglayici_id,
            h.entegrasyon_id, s.ad AS saglayici_ad, s.kod AS saglayici_kod, s.adaptor,
            u.ad AS urun_ad, u.kod AS urun_kod
       FROM kart k
       JOIN saglayici_hesabi h ON h.id = k.hesap_id
       JOIN kart_saglayici s ON s.id = h.saglayici_id
       LEFT JOIN kart_urunu u ON u.id = k.urun_id
      WHERE k.id = ? AND k.tenant_id = ?`, id, ctx.tenant.id);
  if (!k) throw Bulunamadi('Kart bulunamadı.');
  return k;
};

/**
 * ÇALIŞAN GİZLİLİĞİ (§6.7): çalışan yalnız KENDİ kartını görür.
 * Kapsam sunucuda daraltılır; menü gizlemek yetki değildir.
 */
const yalnizKendisi = (ctx) => (ctx.yetkiler?.kurallar || []).some((k) => k.kural === 'kendi_kaydi');
const kendiPersoneli = (ctx) => tek(
  'SELECT * FROM personel WHERE tenant_id = ? AND kullanici_id = ?', ctx.tenant.id, ctx.kullanici.id);

/** Kart listesine uygulanacak kapsam koşulu. */
function kartKapsami(ctx) {
  if (!yalnizKendisi(ctx)) return null;
  const p = kendiPersoneli(ctx);
  if (!p) return { kosul: '1 = 0', parametreler: [] };
  return {
    kosul: `id IN (SELECT kart_id FROM kart_atamasi WHERE personel_id = ? AND durum = 'aktif')`,
    parametreler: [p.id],
  };
}

/** Üye işyeri gibi kişisel harcama ayrıntısı maskeli roller için gizlenir (§6.7). */
const uyeIsyeriGorunur = (ctx) => !alanMaskeliMi(ctx, 'kart_hareket', 'uye_isyeri');

/* ==========================================================================
   ROTA KURULUMU
   ========================================================================== */
export function kur(y, ekranRota) {
  ekranRota(y, 'CRD-01', { get: (ctx) => kartPaneli(ctx) });

  ekranRota(y, 'CRD-02', { get: (ctx) => kartListesi(ctx, { kod: 'CRD-02' }) });
  ekranRota(y, 'CRD-07', { get: (ctx) => kartListesi(ctx, { kod: 'CRD-07', saglayiciKodu: 'PLUXEE' }) });
  ekranRota(y, 'CRD-08', { get: (ctx) => kartListesi(ctx, { kod: 'CRD-08', saglayiciKodu: 'MULTINET' }) });

  ekranRota(y, 'CRD-03', {
    get: (ctx) => html(ctx, 200, ciz(ctx, ekranNesnesi('CRD-03'), kartFormu(ctx, {}))),
    post: (ctx, govde) => {
      const e = ekranNesnesi('CRD-03');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const sonuc = idempotent(
          { anahtar: govde._idempotency, tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, govde },
          () => kartAc(ctx, govde));
        return yonlendir(ctx, `/kartlar/${sonuc.id}?olusan=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, ciz(ctx, e, kartFormu(ctx, { deger: govde, hata: hataNesnesi(err) })));
      }
    },
  });

  ekranRota(y, 'CRD-04', {
    get: (ctx, _g, p) => kartDetayi(ctx, p.id),
    post: (ctx, govde, p) => {
      const e = ekranNesnesi('CRD-04');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      const k = kartiAl(ctx, p.id);
      try {
        if (govde._eylem === 'gecis') {
          gecisIsle(ctx, { nesne: 'kart', tablo: 'kart', kayit: k, govde, ekranKodu: 'CRD-04',
            yanEtki: kartGecisYanEtkisi });
          return yonlendir(ctx, `/kartlar/${k.id}?gecis=1`);
        }
        const mesaj = kartIslemi(ctx, k, govde);
        return yonlendir(ctx, `/kartlar/${k.id}?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return kartDetayi(ctx, p.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  ekranRota(y, 'CRD-05', {
    get: (ctx, _g, p) => html(ctx, 200,
      ciz(ctx, ekranNesnesi('CRD-05'), kartFormu(ctx, { kayit: kartiAl(ctx, p.id) }),
        { kayitEtiketi: kartiAl(ctx, p.id).kod })),
    post: (ctx, govde, p) => {
      const e = ekranNesnesi('CRD-05');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      csrfZorunlu(ctx, govde);
      const k = kartiAl(ctx, p.id);
      try {
        kartGuncelle(ctx, k, govde);
        return yonlendir(ctx, `/kartlar/${k.id}?guncellendi=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum,
          ciz(ctx, e, kartFormu(ctx, { kayit: k, deger: govde, hata: hataNesnesi(err) })));
      }
    },
  });

  ekranRota(y, 'CRD-06', {
    get: (ctx, _g, p) => atamaEkrani(ctx, p.id),
    post: (ctx, govde, p) => {
      const e = ekranNesnesi('CRD-06');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      const k = kartiAl(ctx, p.id);
      try {
        const mesaj = atamaIslemi(ctx, k, govde);
        return yonlendir(ctx, `/kartlar/${k.id}/atama?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return atamaEkrani(ctx, p.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* CRD-09 sağlayıcı hesapları — liste + alt form (K-038). */
  kayitModulu(y, ekranRota, {
    nesne: 'saglayici_hesabi', tablo: 'saglayici_hesabi', kodNesnesi: 'saglayici_hesabi',
    kimlikTuru: 'hesap', rota: '/kartlar/saglayicilar', formRotasi: '/kartlar/saglayicilar?yeni=1',
    baslik: 'Sağlayıcı hesabı', yeniEtiketi: 'Yeni hesap',
    listeKodu: 'CRD-09', formKodu: null, detayKodu: null, gecisNesnesi: null,
    aramaAlanlari: ['ad', 'kod', 'musteri_no'], aramaYer: 'Hesap adı, kod veya müşteri no…',
    sirala: 'kod', alanlar: [],
    filtreler: [{ ad: 'saglayici_id', etiket: 'Sağlayıcı', secenekler: saglayiciSecenekleri },
      { ad: 'durum', etiket: 'Durum', secenekler: ['aktif', 'pasif', 'kapali'].map((d) => ({ deger: d, etiket: d })) }],
    kpi: (ctx, toplam) => [
      { etiket: 'Sağlayıcı', deger: sayi(sayac(ctx.tenant.id, 'kart_saglayici', 'aktif = 1')), ikon: 'fa-building-columns' },
      { etiket: 'Kurumsal hesap', deger: sayi(sayac(ctx.tenant.id, 'saglayici_hesabi', `durum = 'aktif'`)), ikon: 'fa-id-card-clip' },
      { etiket: 'Kart', deger: sayi(sayac(ctx.tenant.id, 'kart', `durum = 'aktif'`)), ikon: 'fa-credit-card' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ],
    bosDurum: { baslik: 'Sağlayıcı hesabı yok', ikon: 'fa-id-card-clip',
      aciklama: 'Bir şirket aynı sağlayıcıda birden çok kurumsal hesap tutabilir (§6.1).' },
    listeSutunlari: (ctx) => [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'ad', etiket: 'Hesap', govde: (r) => h`<b>${r.ad}</b><br><span class="muted">${
        tek('SELECT ad FROM kart_saglayici WHERE id = ?', r.saglayici_id)?.ad || '—'}</span>` },
      { ad: 'musteri_no', etiket: 'Müşteri no' },
      { ad: 'para_birimi', etiket: 'Para birimi' },
      { ad: 'kart', etiket: 'Kart', hizala: 'sag',
        govde: (r) => sayi(Number(tek('SELECT COUNT(*) AS n FROM kart WHERE hesap_id = ?', r.id)?.n ?? 0)) },
      { ad: 'entegrasyon_id', etiket: 'Entegrasyon', govde: (r) => (r.entegrasyon_id
        ? h`<a href="/ayarlar/entegrasyonlar/${r.entegrasyon_id}">${
          tek('SELECT kod FROM entegrasyon WHERE id = ?', r.entegrasyon_id)?.kod || '—'}</a>`
        : h`<span class="muted">dosya akışı</span>`) },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(
        r.durum === 'aktif' ? 'onaylandi' : 'kapali', r.durum) },
    ],
    altForm: (ctx) => hesapFormu(ctx),
    detayBilgileri: () => [],
  });

  /* CRD-09 alt formunun POST'u kayıt üretecinin dışında: iki farklı eylem var. */
  y.post('/kartlar/saglayicilar', (ctx, govde) => {
    const e = ekranNesnesi('CRD-09');
    yetkiZorunlu(ctx, `${e.kod}:olustur`);
    csrfZorunlu(ctx, govde);
    try {
      const sonuc = idempotent(
        { anahtar: govde._idempotency, tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, govde },
        () => hesapAc(ctx, govde));
      return yonlendir(ctx, `/kartlar/saglayicilar?olusturuldu=1&yeni=${sonuc.kod}`);
    } catch (err) {
      if (!(err instanceof UygulamaHatasi)) throw err;
      return html(ctx, err.durum, ciz(ctx, e, hesapFormu(ctx, { deger: govde, hata: hataNesnesi(err) })));
    }
  }, { ekran: ekranNesnesi('CRD-09') });

  ekranRota(y, 'CRD-13', { get: (ctx) => hareketListesi(ctx) });

  ekranRota(y, 'CRD-15', {
    get: (ctx, _g, p) => guvenlikEkrani(ctx, p.id),
    post: async (ctx, govde, p) => {
      const e = ekranNesnesi('CRD-15');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      const k = kartiAl(ctx, p.id);
      try {
        const mesaj = await guvenlikIslemi(ctx, k, govde);
        return yonlendir(ctx, `/kartlar/${k.id}/guvenlik?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return guvenlikEkrani(ctx, p.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });
}

/* ==========================================================================
   CRD-01 — kart paneli
   ========================================================================== */
function kartPaneli(ctx) {
  const e = ekranNesnesi('CRD-01');
  yetkiZorunlu(ctx, e.yetki);
  const t = ctx.tenant.id;
  const kendi = yalnizKendisi(ctx);

  /* Çalışan panelinde yalnız kendi kartları; şirket toplamı GÖSTERİLMEZ (§6.7). */
  if (kendi) {
    const p = kendiPersoneli(ctx);
    const kartlar = p ? sorgu(
      `SELECT k.*, s.ad AS saglayici_ad FROM kart k
         JOIN saglayici_hesabi h ON h.id = k.hesap_id
         JOIN kart_saglayici s ON s.id = h.saglayici_id
        WHERE k.id IN (SELECT kart_id FROM kart_atamasi WHERE personel_id = ? AND durum = 'aktif')
        ORDER BY k.kod`, p.id) : [];
    const icerik = h`
${B.sonucSeridi({ tur: 'ok', baslik: 'Kendi kartlarınız',
      aciklama: 'Çalışan rolü yalnız kendi kartını, bakiyesini ve izinli hareketlerini görür (§6.7).' })}
<div class="dash-cols"><div>${B.tablo({
      satirlar: kartlar.map((k) => ({ ...k, bakiye: defter.bakiye(k.id), bekleyen: defter.bekleyen(k.id) })),
      bosDurum: { baslik: 'Size atanmış kart yok', ikon: 'fa-credit-card' },
      sutunlar: [
        { ad: 'kod', etiket: 'Kart', govde: (k) => h`<b>${k.kod}</b><br><span class="muted">${k.saglayici_ad}</span>` },
        { ad: 'maskeli_no', etiket: 'Numara', govde: (k) => h`•••• ${k.maskeli_no}` },
        { ad: 'bakiye', etiket: 'Bakiye', hizala: 'sag', govde: (k) => para(k.bakiye, k.tutar_birim) },
        { ad: 'bekleyen', etiket: 'Bekleyen', hizala: 'sag',
          govde: (k) => (k.bekleyen ? para(k.bekleyen) : '—') },
        { ad: 'durum', etiket: 'Durum', govde: (k) => kartRozeti(k.durum) },
        { ad: 'islem', etiket: '', govde: (k) => B.btn('Kayıp bildir',
          { rota: `/kartlar/${k.id}/guvenlik`, kucuk: true, ikon: 'fa-triangle-exclamation' }) },
      ],
    })}</div></div>`;
    return html(ctx, 200, ciz(ctx, e, icerik));
  }

  const saglayicilar = sorgu(
    `SELECT s.id, s.kod, s.ad, s.tur, s.adaptor,
            (SELECT COUNT(*) FROM saglayici_hesabi h WHERE h.saglayici_id = s.id) AS hesap,
            (SELECT COUNT(*) FROM kart k JOIN saglayici_hesabi h2 ON h2.id = k.hesap_id
              WHERE h2.saglayici_id = s.id AND k.durum = 'aktif') AS kart
       FROM kart_saglayici s WHERE s.tenant_id = ? AND s.aktif = 1 ORDER BY s.ad`, t);

  const bakiyeler = defter.kartBakiyeleri(t);
  const toplamBakiye = bakiyeler.reduce((x, r) => x + Number(r.bakiye_minor || 0), 0);
  const toplamBekleyen = bakiyeler.reduce((x, r) => x + Number(r.bekleyen_minor || 0), 0);
  const acikParti = sorgu(
    `SELECT p.*, h.ad AS hesap_ad FROM kart_yukleme_partisi p
       JOIN saglayici_hesabi h ON h.id = p.hesap_id
      WHERE p.tenant_id = ? AND p.durum NOT IN ('kapali','iptal')
      ORDER BY p.donem DESC LIMIT 8`, t);
  const atamasiz = Number(tek(
    `SELECT COUNT(*) AS n FROM kart WHERE tenant_id = ? AND durum = 'aktif' AND havuz = 0
       AND id NOT IN (SELECT kart_id FROM kart_atamasi WHERE durum = 'aktif')`, t)?.n ?? 0);
  const bloke = sayac(t, 'kart', `durum IN ('gecici_bloke','kayip_calinti')`);

  const icerik = h`
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Kart defteri bakiyesi', deger: para(toplamBakiye), ikon: 'fa-wallet' },
      { etiket: 'Bekleyen işlem', deger: toplamBekleyen ? para(toplamBekleyen) : '—',
        ikon: 'fa-hourglass-half', ton: toplamBekleyen ? 'warn' : '' },
      { etiket: 'Aktif kart', deger: sayi(sayac(t, 'kart', `durum = 'aktif'`)), ikon: 'fa-credit-card' },
      { etiket: 'Bloke / kayıp', deger: sayi(bloke), ikon: 'fa-ban', ton: bloke ? 'danger' : '' },
      { etiket: 'Atanmamış kart', deger: sayi(atamasiz), ikon: 'fa-user-slash', ton: atamasiz ? 'warn' : '' },
    ]),
    filtre: '',
    icerik: h`<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Sağlayıcılar</b>
    <span>Her sayı kaynak sorgudan gelir; panonun kendi kaydı yoktur (kural 4).</span></div></div>
  <div class="gc-body flush">${B.tablo({
      satirlar: saglayicilar,
      bosDurum: { baslik: 'Sağlayıcı yok', ikon: 'fa-building-columns' },
      sutunlar: [
        { ad: 'ad', etiket: 'Sağlayıcı', govde: (s) => h`<b>${s.ad}</b><br><span class="muted">kod: ${s.kod}</span>` },
        { ad: 'adaptor', etiket: 'Adaptör', govde: (s) => h`${s.adaptor === 'dosya'
          ? B.isaret('kontrollü dosya akışı', 'info') : B.isaret('sağlayıcı API', 'ok')}` },
        { ad: 'hesap', etiket: 'Hesap', hizala: 'sag', govde: (s) => sayi(s.hesap) },
        { ad: 'kart', etiket: 'Aktif kart', hizala: 'sag', govde: (s) => sayi(s.kart) },
        { ad: 'git', etiket: '', govde: (s) => B.btn('Kartları gör',
          { rota: `/kartlar/liste?saglayici_id=${s.id}`, kucuk: true }) },
      ],
    })}</div>
</div>
<div class="gv-card" style="margin-top:18px">
  <div class="gc-head"><div class="gc-title"><b>Açık yükleme partileri</b>
    <span>Parti, üç kaynak mutabık olmadan kapanmaz (§6.4 madde 8).</span></div></div>
  <div class="gc-body flush">${B.tablo({
      satirlar: acikParti,
      bosDurum: { baslik: 'Açık parti yok', ikon: 'fa-layer-group' },
      sutunlar: [
        { ad: 'kod', etiket: 'Parti', govde: (p) => h`<a href="/kartlar/yuklemeler/${p.id}"><b>${p.kod}</b></a>` },
        { ad: 'donem', etiket: 'Dönem' },
        { ad: 'hesap_ad', etiket: 'Hesap' },
        { ad: 'satir_sayisi', etiket: 'Satır', hizala: 'sag', govde: (p) => sayi(p.satir_sayisi) },
        { ad: 'toplam_minor', etiket: 'Toplam', hizala: 'sag', govde: (p) => para(p.toplam_minor, p.tutar_birim) },
        { ad: 'durum', etiket: 'Durum', govde: (p) => B.rozet(
          p.durum === 'basarili' ? 'onaylandi' : p.durum === 'hatali' ? 'reddedildi' : 'beklemede', p.durum) },
      ],
    })}</div>
</div>`,
    veriZamani: simdi(),
  })}`;
  return html(ctx, 200, ciz(ctx, e, icerik, {
    eylemler: yetkiVar(ctx, 'CRD-03:olustur')
      ? B.btn('Yeni kart', { tur: 'acc', rota: '/kartlar/yeni', ikon: 'fa-plus' }) : null,
  }));
}

/* ==========================================================================
   CRD-02 / CRD-07 / CRD-08 — TEK liste, sağlayıcı görünümleri (kural 4)
   ========================================================================== */
function kartListesi(ctx, { kod, saglayiciKodu = null }) {
  const e = ekranNesnesi(kod);
  yetkiZorunlu(ctx, e.yetki);
  const saglayici = saglayiciKodu
    ? tek('SELECT * FROM kart_saglayici WHERE tenant_id = ? AND kod = ?', ctx.tenant.id, saglayiciKodu) : null;

  const { kosullar, parametreler } = filtreKosullari(ctx, {
    aramaAlanlari: ['kod', 'maskeli_no'],
    filtreler: [{ ad: 'durum' }, { ad: 'bicim' },
      ...(saglayici ? [] : [{ ad: 'hesap_id' }])],
  });
  if (saglayici) {
    kosullar.push('hesap_id IN (SELECT id FROM saglayici_hesabi WHERE saglayici_id = ?)');
    parametreler.push(saglayici.id);
  } else if (ctx.sorgu.get('saglayici_id')) {
    kosullar.push('hesap_id IN (SELECT id FROM saglayici_hesabi WHERE saglayici_id = ?)');
    parametreler.push(ctx.sorgu.get('saglayici_id'));
  }
  const kapsam = kartKapsami(ctx);
  if (kapsam) { kosullar.push(kapsam.kosul); parametreler.push(...kapsam.parametreler); }

  const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
    { tablo: 'kart', kosullar, parametreler, sirala: 'kod' });
  const zengin = satirlar.map((k) => ({
    ...k, bakiye: defter.bakiye(k.id), bekleyen: defter.bekleyen(k.id), atama: aktifAtama(k.id),
    hesap: tek('SELECT h.ad, h.kod, s.ad AS saglayici FROM saglayici_hesabi h '
      + 'JOIN kart_saglayici s ON s.id = h.saglayici_id WHERE h.id = ?', k.hesap_id),
  }));

  const icerik = h`
${saglayici ? B.sonucSeridi({ tur: 'ok', baslik: `${saglayici.ad} görünümü`,
    aciklama: 'Bu ekran tüm kartlar listesinin sağlayıcı filtreli hâlidir; ayrı bir kart kaydı '
      + 'tutulmaz (kural 4). Sağlayıcı eklemek kod değişikliği gerektirmez.' }) : ''}
${yalnizKendisi(ctx) ? B.sonucSeridi({ tur: 'ok', baslik: 'Kendi kartlarınız',
    aciklama: 'Kapsam sunucuda daraltıldı (§6.7).' }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-credit-card' },
      { etiket: 'Defter bakiyesi', ikon: 'fa-wallet',
        deger: para(zengin.reduce((x, k) => x + k.bakiye, 0)) },
      { etiket: 'Atanmamış', ikon: 'fa-user-slash',
        deger: sayi(zengin.filter((k) => !k.atama && !k.havuz).length) },
      { etiket: 'Bloke / kayıp', ikon: 'fa-ban',
        deger: sayi(zengin.filter((k) => ['gecici_bloke', 'kayip_calinti'].includes(k.durum)).length) },
    ]),
    filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Kart kodu veya son dört hane…',
      filtreler: [
        ...(saglayici ? [] : [{ ad: 'hesap_id', etiket: 'Hesap', secenekler: hesapSecenekleri(ctx) }]),
        { ad: 'durum', etiket: 'Durum',
          secenekler: Object.entries(KART_DURUMLARI).map(([d, a]) => ({ deger: d, etiket: a })) },
        { ad: 'bicim', etiket: 'Biçim',
          secenekler: [{ deger: 'fiziksel', etiket: 'Fiziksel' }, { deger: 'sanal', etiket: 'Sanal' }] },
      ] }),
    icerik: B.tablo({
      satirlar: zengin,
      satirRota: (k) => `/kartlar/${k.id}`,
      bosDurum: { baslik: 'Kart yok', ikon: 'fa-credit-card',
        aciklama: 'Pluxee, MultiNet, kredi, yakıt ve HGS kartları aynı listede tutulur.',
        eylem: yetkiVar(ctx, 'CRD-03:olustur')
          ? B.btn('Yeni kart', { tur: 'acc', rota: '/kartlar/yeni', ikon: 'fa-plus' }) : null },
      sutunlar: [
        { ad: 'kod', etiket: 'Kart', govde: (k) => h`<a href="/kartlar/${k.id}"><b>${k.kod}</b></a>
          <br><span class="muted">${k.hesap?.saglayici || '—'} · ${k.hesap?.ad || '—'}</span>` },
        /* TAM NUMARA YOK: yalnız son dört hane (K-085). */
        { ad: 'maskeli_no', etiket: 'Numara', govde: (k) => h`•••• ${k.maskeli_no}` },
        { ad: 'bicim', etiket: 'Biçim', govde: (k) => (k.bicim === 'sanal' ? 'Sanal' : 'Fiziksel') },
        { ad: 'atama', etiket: 'Atama', govde: (k) => (k.atama
          ? h`${k.atama.ad_soyad || k.atama.varlik_kod || k.atama.departman || 'atanmış'}`
          : k.havuz ? h`<span class="muted">havuz</span>` : B.isaret('atanmamış', 'warn')) },
        { ad: 'bakiye', etiket: 'Bakiye', hizala: 'sag', govde: (k) => para(k.bakiye) },
        { ad: 'son_kullanim', etiket: 'Son kullanım',
          govde: (k) => (k.son_kullanim ? tarih(k.son_kullanim) : '—') },
        { ad: 'durum', etiket: 'Durum', govde: (k) => kartRozeti(k.durum) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}`;
  return html(ctx, 200, ciz(ctx, e, icerik, {
    eylemler: yetkiVar(ctx, 'CRD-03:olustur')
      ? B.btn('Yeni kart', { tur: 'acc', rota: '/kartlar/yeni', ikon: 'fa-plus' }) : null,
  }));
}

/* ==========================================================================
   CRD-03 / CRD-05 — kart formu
   ========================================================================== */
function kartFormu(ctx, { kayit = null, deger = {}, hata = null }) {
  const e = ekranNesnesi(kayit ? 'CRD-05' : 'CRD-03');
  const d = (ad, varsayilan = '') => deger[ad] ?? (kayit ? kayit[ad] : '') ?? varsayilan;
  return B.form({
    rota: kayit ? `/kartlar/${kayit.id}/duzenle` : '/kartlar/yeni',
    csrf: csrfAlani(ctx), idempotencyAnahtari: kimlik('idempotency'), hatalar: hata,
    bolumler: [
      { baslik: 'Kart künyesi',
        aciklama: 'Kart numarasının TAMAMI hiçbir yerde saklanmaz. Yalnız son dört hane girilir; '
          + 'sağlayıcı işlemleri token üzerinden yürür (§6.2).',
        alanlar: h`
          ${kayit ? '' : h`${B.alan({ ad: 'hesapId', etiket: 'Sağlayıcı hesabı', zorunlu: true,
            deger: d('hesapId'), hata: hata?.alanlar?.hesapId,
            secenekler: [{ deger: '', etiket: 'Seçin…' }, ...hesapSecenekleri(ctx)] })}`}
          ${B.alan({ ad: 'urunId', etiket: 'Ürün', deger: d('urun_id'),
            secenekler: [{ deger: '', etiket: 'Belirtilmedi' }, ...urunSecenekleri(ctx)] })}
          ${B.alan({ ad: 'maskeliNo', etiket: 'Son dört hane', zorunlu: true,
            deger: d('maskeli_no'), hata: hata?.alanlar?.maskeliNo,
            ipucu: 'Yalnız son dört hane. Daha uzun girdi reddedilir.' })}
          ${B.alan({ ad: 'saglayiciToken', etiket: 'Sağlayıcı token', deger: d('saglayici_token'),
            ipucu: 'Sağlayıcının verdiği takma kimlik; gönderim ve blokaj bununla yapılır.' })}
          ${B.alan({ ad: 'bicim', etiket: 'Biçim', deger: d('bicim', 'fiziksel'),
            secenekler: [{ deger: 'fiziksel', etiket: 'Fiziksel' }, { deger: 'sanal', etiket: 'Sanal' }] })}
          ${B.alan({ ad: 'havuz', etiket: 'Havuz kartı', deger: String(d('havuz', '0')),
            ipucu: 'Havuz kartı kişiye atanmadan proje, şantiye, departman veya araç bağlamında tutulur.',
            secenekler: [{ deger: '0', etiket: 'Hayır' }, { deger: '1', etiket: 'Evet' }] })}
          ${B.alan({ ad: 'sonKullanim', etiket: 'Son kullanım', tur: 'date',
            deger: kayit?.son_kullanim ? gunAnahtari(kayit.son_kullanim) : (deger.sonKullanim || '') })}` }],
    ozet: h`<div class="gv-card"><div class="gc-head"><div class="gc-title"><b>Kart durumu</b>
      <span>Durumu siz seçmezsiniz.</span></div></div>
      <div class="gc-body"><p class="gf-hint" style="margin:0">Yeni kart <b>sipariş edildi</b>
        durumunda açılır. Basım, teslim ve aktifleştirme adımları kart detayındaki eylem
        menüsünden, geçiş motoruyla yapılır (§6.3, kural 5).</p></div></div>`,
    eylemler: B.btn(kayit ? 'Değişikliği kaydet' : 'Kartı aç',
      { tur: 'acc', gonder: true, ikon: kayit ? 'fa-floppy-disk' : 'fa-plus' }),
  });
}

function maskeliNoAyristir(girdi) {
  const s = String(girdi ?? '').trim();
  if (!/^\d{4}$/.test(s)) {
    throw DogrulamaHatasi('Yalnız son dört hane girilir.',
      { alanlar: { maskeliNo: ['Tam kart numarası saklanmaz; 4 haneli son grup girin.'] } });
  }
  return s;
}

function kartAc(ctx, govde) {
  const hesap = tek('SELECT * FROM saglayici_hesabi WHERE id = ? AND tenant_id = ?',
    govde.hesapId, ctx.tenant.id);
  if (!hesap) {
    throw DogrulamaHatasi('Sağlayıcı hesabı seçilmedi.', { alanlar: { hesapId: ['Hesap seçin.'] } });
  }
  if (hesap.durum !== 'aktif') throw GecisIzinsiz('Pasif hesaba kart açılamaz.');
  const maskeliNo = maskeliNoAyristir(govde.maskeliNo);
  const token = String(govde.saglayiciToken || '').trim() || null;
  if (token && tek('SELECT id FROM kart WHERE hesap_id = ? AND saglayici_token = ?', hesap.id, token)) {
    throw Cakisma('Bu token ile bu hesapta zaten bir kart var.');
  }
  const urun = govde.urunId
    ? tek('SELECT * FROM kart_urunu WHERE id = ? AND tenant_id = ?', govde.urunId, ctx.tenant.id) : null;

  return islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'kart');
    const id = kimlik('kart');
    calistir(`INSERT INTO kart (id, tenant_id, hesap_id, urun_id, kod, maskeli_no, saglayici_token,
                bicim, havuz, son_kullanim, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?, 'siparis_edildi', ?,?)`,
      id, ctx.tenant.id, hesap.id, urun?.id || null, kod, maskeliNo, token,
      govde.bicim === 'sanal' ? 'sanal' : 'fiziksel', govde.havuz === '1' ? 1 : 0,
      govde.sonKullanim ? gunBaslangici(govde.sonKullanim) : null,
      ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'kart', nesneId: id, eylem: 'olustur',
      /* Audit'e de yalnız MASKELİ değer yazılır. */
      sonraki: { kod, hesap: hesap.kod, maskeliNo, bicim: govde.bicim } });
    return { id, kod };
  });
}

function kartGuncelle(ctx, k, govde) {
  const alanlar = {};
  if (govde.maskeliNo != null && govde.maskeliNo !== '') alanlar.maskeli_no = maskeliNoAyristir(govde.maskeliNo);
  if (govde.saglayiciToken !== undefined) alanlar.saglayici_token = String(govde.saglayiciToken).trim() || null;
  if (govde.bicim) alanlar.bicim = govde.bicim === 'sanal' ? 'sanal' : 'fiziksel';
  if (govde.havuz !== undefined) alanlar.havuz = govde.havuz === '1' ? 1 : 0;
  if (govde.urunId !== undefined) alanlar.urun_id = govde.urunId || null;
  if (govde.sonKullanim !== undefined) {
    alanlar.son_kullanim = govde.sonKullanim ? gunBaslangici(govde.sonKullanim) : null;
  }
  return islem(() => {
    surumluGuncelle('kart', k.id, Number(govde.surum ?? k.surum), alanlar,
      { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'kart', nesneId: k.id, eylem: 'guncelle',
      onceki: { maskeliNo: k.maskeli_no, bicim: k.bicim }, sonraki: alanlar });
  });
}

/* ==========================================================================
   CRD-04 — kart detayı
   ========================================================================== */
function kartDetayi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('CRD-04');
  yetkiZorunlu(ctx, e.yetki);
  const k = kartiAl(ctx, id);
  /* Çalışan yalnız kendi kartını açabilir (§6.7). */
  if (yalnizKendisi(ctx)) {
    const p = kendiPersoneli(ctx);
    const kendisinin = p && tek(
      `SELECT id FROM kart_atamasi WHERE kart_id = ? AND personel_id = ? AND durum = 'aktif'`, k.id, p.id);
    if (!kendisinin) throw Bulunamadi('Kart bulunamadı.');
  }

  const atama = aktifAtama(k.id);
  const bakiye = defter.bakiye(k.id);
  const bekleyen = defter.bekleyen(k.id);
  const hareketler = defter.dokum(ctx.tenant.id, { kartId: k.id, limit: 50 }).reverse();
  const atamaGecmisi = sorgu(
    `SELECT a.*, p.ad_soyad, v.kod AS varlik_kod FROM kart_atamasi a
       LEFT JOIN personel p ON p.id = a.personel_id
       LEFT JOIN varlik v ON v.id = a.varlik_id
      WHERE a.kart_id = ? ORDER BY a.baslangic DESC LIMIT 20`, k.id);
  const uyeGorunur = uyeIsyeriGorunur(ctx);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: 'Kart açıldı',
    aciklama: 'Kart "sipariş edildi" durumunda; basım ve aktifleştirme geçiş motoruyla yapılır.' }) : ''}
${ctx.sorgu.get('guncellendi') ? B.sonucSeridi({ tur: 'ok', baslik: 'Kart güncellendi' }) : ''}
${ctx.sorgu.get('gecis') ? B.sonucSeridi({ tur: 'ok', baslik: 'Durum güncellendi',
    aciklama: `Yeni durum: ${KART_DURUMLARI[k.durum] || k.durum}` }) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${ozetSeridi(ctx, {
    nesne: 'kart', kayit: { ...k, atama_sayisi: atama ? 1 : 0 },
    baslik: `${k.saglayici_ad} •••• ${k.maskeli_no}`,
    bilgiler: [
      { etiket: 'Hesap', deger: `${k.hesap_kod} — ${k.hesap_ad}` },
      { etiket: 'Ürün', deger: k.urun_ad || '—' },
      { etiket: 'Biçim', deger: k.bicim === 'sanal' ? 'Sanal' : 'Fiziksel' },
      { etiket: 'Son kullanım', deger: k.son_kullanim ? tarih(k.son_kullanim) : '—' },
      { etiket: 'Atama', deger: atama ? (atama.ad_soyad || atama.varlik_kod || atama.departman || 'atanmış')
        : (k.havuz ? 'Havuz kartı' : 'Atanmamış') },
    ],
    birincilEylem: yetkiVar(ctx, 'CRD-05:guncelle')
      ? B.btn('Düzenle', { tur: 'acc', rota: `/kartlar/${k.id}/duzenle`, ikon: 'fa-pen' }) : null,
    digerEylemler: h`${yetkiVar(ctx, 'CRD-06:olustur')
      ? B.btn('Atama ve devir', { rota: `/kartlar/${k.id}/atama`, ikon: 'fa-people-arrows' }) : ''}${
      yetkiVar(ctx, 'CRD-15:olustur')
        ? B.btn('Kayıp / çalıntı', { rota: `/kartlar/${k.id}/guvenlik`, ikon: 'fa-triangle-exclamation' }) : ''}`,
  })}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Bakiye</b>
        <span>Bakiye saklanmaz; hareket defterinden her okumada toplanır (kural 7).</span></div></div>
      <div class="gc-body">${B.kpiSeridi([
    { etiket: 'Kullanılabilir bakiye', deger: para(bakiye, k.para_birimi), ikon: 'fa-wallet' },
    { etiket: 'Bekleyen işlem', deger: bekleyen ? para(bekleyen, k.para_birimi) : '—',
      ikon: 'fa-hourglass-half', ton: bekleyen ? 'warn' : '' },
    { etiket: 'Hareket', deger: sayi(hareketler.length), ikon: 'fa-list' },
  ])}
        <p class="gf-hint" style="margin-top:12px">
          Kullanılabilir bakiye = kesinleşmiş yükleme + iade + olumlu düzeltme
          − kesinleşmiş harcama − ters/olumsuz düzeltme (§6.5).
          Bakiye hiçbir form alanından değiştirilemez.</p>
      </div>
    </div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Hareketler</b>
        <span>Değişmez defter; düzeltme ters kayıtla yapılır.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: hareketler,
    bosDurum: { baslik: 'Hareket yok', ikon: 'fa-list' },
    sutunlar: [
      { ad: 'zaman', etiket: 'Zaman', govde: (r) => tarihSaat(r.zaman) },
      { ad: 'tur', etiket: 'Tür', govde: (r) => defter.HAREKET_ETIKETI[r.tur] || r.tur },
      ...(uyeGorunur ? [{ ad: 'uye_isyeri', etiket: 'Üye işyeri', govde: (r) => r.uye_isyeri || '—' }]
        : [{ ad: 'uye_isyeri', etiket: 'Üye işyeri', govde: () => h`<span class="muted">••••</span>` }]),
      { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag',
        govde: (r) => h`${r.yon < 0 ? '−' : '+'}${para(r.tutar_minor, r.tutar_birim)}` },
      { ad: 'kesinlesmis', etiket: 'Durum',
        govde: (r) => (r.kesinlesmis ? B.isaret('kesinleşti', 'ok') : B.isaret('bekliyor', 'warn')) },
    ],
  })}</div>
    </div>
    ${gecmisKarti('kart', k)}
  </div>
  <div class="gv-side-stack">
    ${gecisFormu(ctx, { nesne: 'kart', kayit: k, rota: `/kartlar/${k.id}`, ekranKodu: 'CRD-04' })}
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Atama geçmişi</b>
        <span>Kapanmış atama satırı değişmez.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: atamaGecmisi,
    bosDurum: { baslik: 'Atama yok' },
    sutunlar: [
      { ad: 'hedef', etiket: 'Hedef',
        govde: (a) => a.ad_soyad || a.varlik_kod || a.departman || a.santiye_id || '—' },
      { ad: 'baslangic', etiket: 'Başlangıç', govde: (a) => tarih(a.baslangic) },
      { ad: 'bitis', etiket: 'Bitiş', govde: (a) => (a.bitis ? tarih(a.bitis) : '—') },
      { ad: 'durum', etiket: 'Durum', govde: (a) => B.rozet(
        a.durum === 'aktif' ? 'onaylandi' : 'kapali', a.durum) },
    ],
  })}</div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: k.kod, baslik: `Kart ${k.kod}` }));
}

/**
 * Kart geçişlerinin yan etkileri.
 * Kayıp/çalıntı ve iptal, AÇIK ATAMAYI da kapatır: kimde olduğu belirsiz bir
 * kart "atanmış" görünemez.
 */
function kartGecisYanEtkisi(ctx, kayit) {
  if (['kayip_calinti', 'iptal', 'arsiv', 'suresi_doldu'].includes(kayit.durum)) {
    const a = tek(`SELECT * FROM kart_atamasi WHERE kart_id = ? AND durum = 'aktif'`, kayit.id);
    if (a) {
      calistir(`UPDATE kart_atamasi SET durum = 'iade', bitis = ?, iade_notu = ?,
                  guncelleyen = ?, guncellendi = ? WHERE id = ?`,
        simdi(), `Kart durumu "${kayit.durum}" olduğu için atama kapatıldı.`,
        ctx.kullanici.id, simdi(), a.id);
    }
  }
}

/** CRD-04 detayındaki adlandırılmış işlemler. */
function kartIslemi(ctx, k, govde) {
  if (govde._eylem === 'bakiye_sorgu') {
    /* Sağlayıcı bakiyesi ile iç defter farklıysa İKİ RAKAM ve fark gösterilir
       (§6.5) — sahte tek rakam üretilmez. */
    throw GecisIzinsiz(
      'Sağlayıcı bakiye sorgusu entegrasyon ekranından yapılır; iç defter bakiyesi bu ekranda gösterilir.');
  }
  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

/* ==========================================================================
   CRD-06 — atama ve devir
   ========================================================================== */
function atamaEkrani(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('CRD-06');
  yetkiZorunlu(ctx, e.yetki);
  const k = kartiAl(ctx, id);
  const mevcut = aktifAtama(k.id);
  const gecmis = sorgu(
    `SELECT a.*, p.ad_soyad, v.kod AS varlik_kod FROM kart_atamasi a
       LEFT JOIN personel p ON p.id = a.personel_id
       LEFT JOIN varlik v ON v.id = a.varlik_id
      WHERE a.kart_id = ? ORDER BY a.baslangic DESC`, k.id);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.detayOzetSeridi({
    kod: k.kod, baslik: `${k.saglayici_ad} •••• ${k.maskeli_no}`, durum: k.durum, surum: k.surum,
    bilgiler: [
      { etiket: 'Hesap', deger: k.hesap_ad },
      { etiket: 'Aktif atama', deger: mevcut ? (mevcut.ad_soyad || mevcut.varlik_kod || mevcut.departman) : '—' },
    ],
    digerEylemler: B.btn('Karta dön', { rota: `/kartlar/${k.id}` }),
  })}
<div class="dash-cols">
  <div>
    ${mevcut ? h`<div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Açık atamayı kapat</b>
        <span>Kart başına tek çakışmayan aktif atama olabilir (CRD-02).</span></div></div>
      <div class="gc-body">
        <p class="gf-hint">Şu an <b>${mevcut.ad_soyad || mevcut.varlik_kod || mevcut.departman}</b>
          üzerinde (${tarih(mevcut.baslangic)} →). Yeni atama açmadan önce bu atama kapatılmalıdır.</p>
        <form method="post" action="/kartlar/${k.id}/atama" data-gform="1">
          ${ham(csrfAlani(ctx))}
          <input type="hidden" name="_eylem" value="iade">
          ${B.alan({ ad: 'iadeNotu', etiket: 'İade notu', tur: 'metin', genis: true })}
          <div style="margin-top:12px">${B.btn('İade al ve atamayı kapat',
    { tur: 'acc', gonder: true, ikon: 'fa-rotate-left' })}</div>
        </form>
      </div>
    </div>` : ''}
    ${B.form({
    rota: `/kartlar/${k.id}/atama`, csrf: csrfAlani(ctx),
    idempotencyAnahtari: kimlik('idempotency'), hatalar: hata,
    bolumler: [{ baslik: mevcut ? 'Devret (yeni atama)' : 'Yeni atama',
      aciklama: 'Bir personelin birden çok kartı olabilir; fakat aynı kart için tarih aralıkları '
        + 'çakışan iki aktif atama olamaz (§6.1). Havuz kartı kişiye atanmadan proje, şantiye, '
        + 'departman veya araç bağlamında tutulabilir.',
      alanlar: h`
        <input type="hidden" name="_eylem" value="ata">
        ${B.alan({ ad: 'personelId', etiket: 'Personel',
        secenekler: [{ deger: '', etiket: 'Yok (havuz/araç/departman)' }, ...personelSecenekleri(ctx)] })}
        ${B.alan({ ad: 'varlikId', etiket: 'Araç',
        secenekler: [{ deger: '', etiket: 'Yok' }, ...aracSecenekleri(ctx)] })}
        ${B.alan({ ad: 'projeId', etiket: 'Proje',
        secenekler: [{ deger: '', etiket: 'Yok' }, ...projeSecenekleri(ctx)] })}
        ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye',
        secenekler: [{ deger: '', etiket: 'Yok' }, ...santiyeSecenekleri(ctx)] })}
        ${B.alan({ ad: 'departman', etiket: 'Departman' })}
        ${B.alan({ ad: 'baslangic', etiket: 'Başlangıç', tur: 'date', zorunlu: true,
        deger: gunAnahtari(simdi()) })}
        ${B.alan({ ad: 'bitis', etiket: 'Bitiş (boşsa açık uçlu)', tur: 'date' })}
        ${B.alan({ ad: 'teslimNotu', etiket: 'Teslim notu', tur: 'metin', genis: true })}` }],
    eylemler: B.btn(mevcut ? 'Devret' : 'Ata', { tur: 'acc', gonder: true, ikon: 'fa-people-arrows' }),
  })}
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Atama geçmişi</b>
        <span>Geçmiş değişmez; kapanmış satır düzenlenemez.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: gecmis,
    bosDurum: { baslik: 'Atama yok' },
    sutunlar: [
      { ad: 'hedef', etiket: 'Hedef',
        govde: (a) => a.ad_soyad || a.varlik_kod || a.departman || '—' },
      { ad: 'aralik', etiket: 'Aralık',
        govde: (a) => `${tarih(a.baslangic)} → ${a.bitis ? tarih(a.bitis) : '—'}` },
      { ad: 'durum', etiket: 'Durum',
        govde: (a) => B.rozet(a.durum === 'aktif' ? 'onaylandi' : 'kapali', a.durum) },
    ],
  })}</div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: k.kod }));
}

function atamaIslemi(ctx, k, govde) {
  if (govde._eylem === 'iade') {
    const a = tek(`SELECT * FROM kart_atamasi WHERE kart_id = ? AND durum = 'aktif'`, k.id);
    if (!a) throw GecisIzinsiz('Kartta açık atama yok.');
    return islem(() => {
      calistir(`UPDATE kart_atamasi SET durum = 'iade', bitis = ?, iade_notu = ?,
                  guncelleyen = ?, guncellendi = ? WHERE id = ?`,
        simdi(), String(govde.iadeNotu || '').trim() || null, ctx.kullanici.id, simdi(), a.id);
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'kart_atamasi', nesneId: a.id, eylem: 'iade', sonraki: { kart: k.kod } });
      return 'Atama kapatıldı';
    });
  }

  if (govde._eylem !== 'ata') throw DogrulamaHatasi('Bilinmeyen işlem.');

  const baslangic = govde.baslangic ? gunBaslangici(govde.baslangic) : null;
  if (!baslangic) {
    throw DogrulamaHatasi('Başlangıç tarihi zorunludur.', { alanlar: { baslangic: ['Tarih girin.'] } });
  }
  const bitis = govde.bitis ? gunBaslangici(govde.bitis) : null;
  if (bitis && bitis < baslangic) {
    throw DogrulamaHatasi('Bitiş, başlangıçtan önce olamaz.', { alanlar: { bitis: ['Tarihi düzeltin.'] } });
  }
  const hedefler = { personel_id: govde.personelId || null, varlik_id: govde.varlikId || null,
    proje_id: govde.projeId || null, santiye_id: govde.santiyeId || null,
    departman: String(govde.departman || '').trim() || null };
  if (!Object.values(hedefler).some(Boolean)) {
    throw DogrulamaHatasi('Atama bir hedefe bağlanmalı: kişi, araç, proje, şantiye veya departman.',
      { alanlar: { personelId: ['En az bir hedef seçin.'] } });
  }
  if (!['aktif', 'aktiflenebilir'].includes(k.durum)) {
    throw GecisIzinsiz(`"${KART_DURUMLARI[k.durum]}" durumundaki karta atama yapılamaz.`);
  }

  /* CRD-02 — TARİH ARALIKLARI ÇAKIŞAN iki aktif atama olamaz. */
  const cakisan = tek(
    `SELECT * FROM kart_atamasi WHERE kart_id = ? AND durum = 'aktif'
       AND baslangic <= ? AND (bitis IS NULL OR bitis >= ?)`,
    k.id, bitis ?? Number.MAX_SAFE_INTEGER, baslangic);
  if (cakisan) {
    throw Cakisma(
      `${k.kod} kartında ${tarih(cakisan.baslangic)} → ${cakisan.bitis ? tarih(cakisan.bitis) : 'açık uçlu'} `
      + 'aralığında zaten aktif bir atama var. Kart başına tek çakışmayan aktif atama olabilir (CRD-02).');
  }

  if (hedefler.personel_id) {
    const p = tek('SELECT * FROM personel WHERE id = ? AND tenant_id = ?', hedefler.personel_id, ctx.tenant.id);
    if (!p) throw Bulunamadi('Personel bulunamadı.');
    if (p.durum === 'ayrildi') throw GecisIzinsiz('İşten ayrılmış personele kart atanamaz.');
  }

  return islem(() => {
    const id = kimlik('atama');
    calistir(`INSERT INTO kart_atamasi (id, tenant_id, kart_id, personel_id, varlik_id, proje_id,
                santiye_id, departman, baslangic, bitis, teslim_notu, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?, 'aktif', ?,?)`,
      id, ctx.tenant.id, k.id, hedefler.personel_id, hedefler.varlik_id, hedefler.proje_id,
      hedefler.santiye_id, hedefler.departman, baslangic, bitis,
      String(govde.teslimNotu || '').trim() || null, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'kart_atamasi', nesneId: id, eylem: 'ata',
      sonraki: { kart: k.kod, ...hedefler, baslangic, bitis } });
    return 'Kart atandı';
  });
}

/* ==========================================================================
   CRD-09 — sağlayıcı hesabı alt formu
   ========================================================================== */
function hesapFormu(ctx, { deger = {}, hata = null } = {}) {
  return h`<div style="margin-top:22px">${B.form({
    rota: '/kartlar/saglayicilar', csrf: csrfAlani(ctx),
    idempotencyAnahtari: kimlik('idempotency'), hatalar: hata,
    bolumler: [{ baslik: 'Yeni sağlayıcı hesabı',
      aciklama: 'Bir şirket aynı anda birden fazla sağlayıcı ve aynı sağlayıcıda birden fazla '
        + 'kurumsal hesap kullanabilir (§6.1). Gizli bilgiler burada değil, entegrasyon '
        + 'kaydında vault referansıyla tutulur.',
      alanlar: h`
        ${B.alan({ ad: 'saglayiciId', etiket: 'Sağlayıcı', zorunlu: true, deger: deger.saglayiciId || '',
        hata: hata?.alanlar?.saglayiciId,
        secenekler: [{ deger: '', etiket: 'Seçin…' }, ...saglayiciSecenekleri(ctx)] })}
        ${B.alan({ ad: 'ad', etiket: 'Hesap adı', zorunlu: true, genis: true, deger: deger.ad || '',
        hata: hata?.alanlar?.ad })}
        ${B.alan({ ad: 'musteriNo', etiket: 'Müşteri / hesap no', zorunlu: true,
        deger: deger.musteriNo || '', hata: hata?.alanlar?.musteriNo })}
        ${B.alan({ ad: 'paraBirimi', etiket: 'Para birimi', deger: deger.paraBirimi || 'TRY',
        secenekler: [{ deger: 'TRY', etiket: 'TRY' }, { deger: 'EUR', etiket: 'EUR' },
          { deger: 'USD', etiket: 'USD' }] })}
        ${B.alan({ ad: 'entegrasyonId', etiket: 'Entegrasyon', deger: deger.entegrasyonId || '',
        ipucu: 'Boş bırakılırsa kontrollü dosya akışı kullanılır (§6.6).',
        secenekler: [{ deger: '', etiket: 'Dosya akışı' }, ...sorgu(
          `SELECT id, kod, ad FROM entegrasyon WHERE tenant_id = ? AND tur = 'kart' ORDER BY kod`,
          ctx.tenant.id).map((x) => ({ deger: x.id, etiket: `${x.kod} — ${x.ad}` }))] })}` }],
    eylemler: B.btn('Hesabı aç', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  })}</div>`;
}

function hesapAc(ctx, govde) {
  const s = tek('SELECT * FROM kart_saglayici WHERE id = ? AND tenant_id = ?',
    govde.saglayiciId, ctx.tenant.id);
  if (!s) throw DogrulamaHatasi('Sağlayıcı seçilmedi.', { alanlar: { saglayiciId: ['Sağlayıcı seçin.'] } });
  const ad = String(govde.ad || '').trim();
  if (!ad) throw DogrulamaHatasi('Hesap adı zorunludur.', { alanlar: { ad: ['Ad girin.'] } });
  const musteriNo = String(govde.musteriNo || '').trim();
  if (!musteriNo) {
    throw DogrulamaHatasi('Müşteri numarası zorunludur.', { alanlar: { musteriNo: ['Numara girin.'] } });
  }
  if (tek('SELECT id FROM saglayici_hesabi WHERE tenant_id = ? AND saglayici_id = ? AND musteri_no = ?',
    ctx.tenant.id, s.id, musteriNo)) {
    throw Cakisma(`${s.ad} sağlayıcısında ${musteriNo} numaralı hesap zaten kayıtlı.`);
  }
  return islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'saglayici_hesabi');
    const id = kimlik('hesap');
    calistir(`INSERT INTO saglayici_hesabi (id, tenant_id, saglayici_id, entegrasyon_id, kod, ad,
                musteri_no, para_birimi, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?, 'aktif', ?,?)`,
      id, ctx.tenant.id, s.id, govde.entegrasyonId || null, kod, ad, musteriNo,
      govde.paraBirimi || 'TRY', ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'saglayici_hesabi', nesneId: id, eylem: 'olustur',
      sonraki: { kod, ad, saglayici: s.kod, musteriNo } });
    return { id, kod };
  });
}

/* ==========================================================================
   CRD-13 — kart hareketleri (değişmez defter)
   ========================================================================== */
function hareketListesi(ctx) {
  const e = ekranNesnesi('CRD-13');
  yetkiZorunlu(ctx, e.yetki);
  const uyeGorunur = uyeIsyeriGorunur(ctx);
  const kendi = yalnizKendisi(ctx);
  const p = kendi ? kendiPersoneli(ctx) : null;

  const secenekler = {
    kartId: ctx.sorgu.get('kart_id') || null,
    hesapId: ctx.sorgu.get('hesap_id') || null,
    tur: ctx.sorgu.get('tur') || null,
    personelId: kendi ? (p?.id || '__yok__') : null,
    limit: 300,
  };
  const satirlar = defter.dokum(ctx.tenant.id, secenekler).reverse();
  const toplamGiris = satirlar.filter((s) => s.yon > 0 && s.kesinlesmis)
    .reduce((x, s) => x + Number(s.tutar_minor), 0);
  const toplamCikis = satirlar.filter((s) => s.yon < 0 && s.kesinlesmis)
    .reduce((x, s) => x + Number(s.tutar_minor), 0);

  const icerik = h`
${kendi ? B.sonucSeridi({ tur: 'ok', baslik: 'Kendi hareketleriniz',
    aciklama: 'Harcama satırları çalışan gizliliği gözetilerek yetkilendirilir (§6.5).' }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Kesinleşmiş giriş', deger: para(toplamGiris), ikon: 'fa-arrow-down' },
      { etiket: 'Kesinleşmiş çıkış', deger: para(toplamCikis), ikon: 'fa-arrow-up' },
      { etiket: 'Net', deger: para(toplamGiris - toplamCikis), ikon: 'fa-scale-balanced' },
      { etiket: 'Satır', deger: sayi(satirlar.length), ikon: 'fa-list' },
    ]),
    filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Sağlayıcı referansı…',
      filtreler: [
        { ad: 'hesap_id', etiket: 'Hesap', secenekler: hesapSecenekleri(ctx) },
        { ad: 'tur', etiket: 'Tür',
          secenekler: Object.entries(defter.HAREKET_ETIKETI).map(([d, a]) => ({ deger: d, etiket: a })) },
      ] }),
    icerik: B.tablo({
      satirlar,
      bosDurum: { baslik: 'Hareket yok', ikon: 'fa-list',
        aciklama: 'Kart hareketleri yalnız yükleme, sağlayıcı ekstresi ve onaylı düzeltmeyle oluşur; '
          + 'elle bakiye yazılamaz (kural 7).' },
      sutunlar: [
        { ad: 'zaman', etiket: 'Zaman', govde: (r) => tarihSaat(r.zaman) },
        { ad: 'kart_kod', etiket: 'Kart',
          govde: (r) => h`<a href="/kartlar/${r.kart_id}">${r.kart_kod}</a>
            <br><span class="muted">•••• ${r.maskeli_no}</span>` },
        { ad: 'tur', etiket: 'Tür', govde: (r) => defter.HAREKET_ETIKETI[r.tur] || r.tur },
        ...(uyeGorunur
          ? [{ ad: 'uye_isyeri', etiket: 'Üye işyeri', govde: (r) => r.uye_isyeri || '—' }]
          : [{ ad: 'uye_isyeri', etiket: 'Üye işyeri',
            govde: () => h`<span class="muted" title="Bu rolde üye işyeri maskelidir (§6.7)">••••</span>` }]),
        { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag',
          govde: (r) => h`${r.yon < 0 ? '−' : '+'}${para(r.tutar_minor, r.tutar_birim)}` },
        { ad: 'kesinlesmis', etiket: 'Durum',
          govde: (r) => (r.kesinlesmis ? B.isaret('kesinleşti', 'ok') : B.isaret('bekliyor', 'warn')) },
        { ad: 'saglayici_referans', etiket: 'Referans',
          govde: (r) => r.saglayici_referans || (r.ters_kayit_id ? 'ters kayıt' : '—') },
      ],
    }),
    veriZamani: simdi(),
  })}
<div class="gv-card" style="margin-top:18px"><div class="gc-body">
  <p class="gf-hint" style="margin:0">Bu defter <b>değişmezdir</b>: satır güncellenemez ve silinemez
    (veritabanı tetikleyicisiyle korunur). Hatalı kayıt <b>ters kayıtla</b> düzeltilir; ters kayıt da
    ayrı bir satırdır. Bakiye bu satırların toplamıdır — hiçbir yerde saklanmaz (kural 7).</p>
</div></div>`;
  return html(ctx, 200, ciz(ctx, e, icerik));
}

/* ==========================================================================
   CRD-15 — kayıp / çalıntı / yenileme
   ========================================================================== */
function guvenlikEkrani(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('CRD-15');
  yetkiZorunlu(ctx, e.yetki);
  const k = kartiAl(ctx, id);
  const olaylar = sorgu(
    `SELECT * FROM entegrasyon_olayi WHERE kaynak_nesne = 'kart' AND kaynak_id = ?
      ORDER BY zaman DESC LIMIT 20`, k.id);
  const bakiye = defter.bakiye(k.id);
  const yeni = k.yenilenen_id ? tek('SELECT * FROM kart WHERE yenilenen_id = ?', k.id) : null;
  const yenisi = tek('SELECT * FROM kart WHERE yenilenen_id = ?', k.id);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${['kayip_calinti', 'gecici_bloke'].includes(k.durum) ? B.sonucSeridi({ tur: 'warn',
    baslik: `Kart "${KART_DURUMLARI[k.durum]}" durumunda`,
    aciklama: 'Blokaj sonucu, tekrar denemeleri ve bildirimler aşağıdaki olay kaydındadır (CRD-06).' }) : ''}
${B.detayOzetSeridi({
    kod: k.kod, baslik: `${k.saglayici_ad} •••• ${k.maskeli_no}`, durum: k.durum, surum: k.surum,
    bilgiler: [
      { etiket: 'Bakiye', deger: para(bakiye, k.para_birimi) },
      { etiket: 'Adaptör', deger: k.adaptor === 'dosya' ? 'Kontrollü dosya akışı' : 'Sağlayıcı API' },
      { etiket: 'Yeni kart', deger: yenisi ? yenisi.kod : '—' },
    ],
    digerEylemler: B.btn('Karta dön', { rota: `/kartlar/${k.id}` }),
  })}
<div class="dash-cols">
  <div>
    ${B.form({
    rota: `/kartlar/${k.id}/guvenlik`, csrf: csrfAlani(ctx),
    idempotencyAnahtari: kimlik('idempotency'), hatalar: hata,
    bolumler: [{ baslik: 'Kayıp / çalıntı bildirimi',
      aciklama: 'Kayıp/çalıntı eylemi KULLANICI ONAYI BEKLEMEDEN kartı güvenli biçimde bloke '
        + 'etmeyi dener. Sağlayıcı çağrısı başarısız olursa kart yine de bloke edilir, '
        + 'kritik alarm ve tekrar kuyruğu üretilir (§6.3).',
      alanlar: h`
        <input type="hidden" name="_eylem" value="kayip">
        ${B.alan({ ad: 'gerekce', etiket: 'Ne oldu?', tur: 'metin', zorunlu: true, genis: true,
        hata: hata?.alanlar?.gerekce })}` }],
    eylemler: B.btn('Kartı bloke et ve kayıp bildir',
      { tur: 'acc', gonder: true, ikon: 'fa-triangle-exclamation',
        devreDisi: !['aktif', 'gecici_bloke', 'aktiflenebilir'].includes(k.durum) }),
  })}
    ${k.durum === 'kayip_calinti' || k.durum === 'suresi_doldu' ? h`<div style="margin-top:18px">${B.form({
    rota: `/kartlar/${k.id}/guvenlik`, csrf: csrfAlani(ctx),
    idempotencyAnahtari: kimlik('idempotency'),
    bolumler: [{ baslik: 'Yeniden bas ve bakiyeyi devret',
      aciklama: 'Eski kart, yeni kart ve BAKİYE DEVRİ aynı vaka altında izlenir (§6.3). '
        + 'Devir iki defter satırı üretir: eskiden çıkış, yeniye giriş.',
      alanlar: h`
        <input type="hidden" name="_eylem" value="yenile">
        ${B.alan({ ad: 'maskeliNo', etiket: 'Yeni kartın son dört hanesi', zorunlu: true })}
        ${B.alan({ ad: 'saglayiciToken', etiket: 'Yeni kart token' })}
        ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe', tur: 'metin', zorunlu: true, genis: true })}` }],
    eylemler: B.btn('Yeni kartı bas ve bakiyeyi devret',
      { tur: 'acc', gonder: true, ikon: 'fa-arrows-rotate' }),
  })}</div>` : ''}
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Blokaj olay kaydı</b>
        <span>Çağrı, sonuç, retry ve bildirim denetim izindedir (CRD-06).</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: olaylar,
    bosDurum: { baslik: 'Olay yok' },
    sutunlar: [
      { ad: 'zaman', etiket: 'Zaman', govde: (o) => tarihSaat(o.zaman) },
      { ad: 'islem', etiket: 'İşlem' },
      { ad: 'durum', etiket: 'Sonuç', govde: (o) => B.rozet(
        o.durum === 'basarili' ? 'onaylandi'
          : o.durum === 'is_kurali_reddi' ? 'reddedildi' : 'beklemede', o.durum) },
      { ad: 'deneme_sayisi', etiket: 'Deneme', hizala: 'sag', govde: (o) => sayi(o.deneme_sayisi) },
    ],
  })}</div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: k.kod }));
}

async function guvenlikIslemi(ctx, k, govde) {
  if (govde._eylem === 'kayip') {
    const gerekce = String(govde.gerekce || '').trim();
    if (!gerekce) {
      throw DogrulamaHatasi('Gerekçe zorunludur.', { alanlar: { gerekce: ['Ne olduğunu yazın.'] } });
    }
    const entegrasyon = k.entegrasyon_id
      ? tek('SELECT * FROM entegrasyon WHERE id = ?', k.entegrasyon_id) : null;

    /* Sağlayıcıya blokaj çağrısı — SONUÇ BEKLENMEZ, kart her hâlükârda bloke
       edilir. Başarısız çağrı kritik alarm ve tekrar kuyruğu üretir (§6.3). */
    const sonuc = await A.cagriYurut(ctx, {
      entegrasyon, yetenek: 'kartBloke', girdi: { kart: k, gerekce },
      kaynakNesne: 'kart', kaynakId: k.id, idempotencyAnahtari: `bloke:${k.id}`,
    });

    islem(() => {
      gecisYap(ctx, { nesne: 'kart', tablo: 'kart', kayit: k, eylem: 'kayip_bildir',
        gerekce, ekranKodu: 'CRD-15', yanEtki: kartGecisYanEtkisi });
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'kart', nesneId: k.id, eylem: 'blokaj_cagrisi', gerekce,
        sonraki: { sonuc: sonuc.durum, kod: sonuc.kod, mesaj: sonuc.mesaj } });
    });

    if (sonuc.durum === 'basarili') return 'Kart bloke edildi ve sağlayıcıda kapatıldı';
    /* SAHTE BAŞARI YOK: sağlayıcı çağrısı olmadıysa kullanıcı bunu görür. */
    return `Kart yerel olarak bloke edildi. Sağlayıcı blokajı SONUÇLANMADI (${sonuc.kod || 'bilinmiyor'}) `
      + '— tekrar kuyruğuna alındı, entegrasyon günlüğünden izleyin.';
  }

  if (govde._eylem === 'yenile') {
    const gerekce = String(govde.gerekce || '').trim();
    if (!gerekce) throw DogrulamaHatasi('Gerekçe zorunludur.', { alanlar: { gerekce: ['Gerekçe girin.'] } });
    const maskeliNo = maskeliNoAyristir(govde.maskeliNo);
    if (tek('SELECT id FROM kart WHERE yenilenen_id = ?', k.id)) {
      throw Cakisma('Bu kart için zaten yeni bir kart basılmış.');
    }

    return islem(() => {
      /* Eski kart "yenilemede" durumuna geçer. */
      const guncel = tek('SELECT * FROM kart WHERE id = ?', k.id);
      gecisYap(ctx, { nesne: 'kart', tablo: 'kart', kayit: guncel, eylem: 'yenile',
        gerekce, ekranKodu: 'CRD-15' });

      const kod = sonrakiKod(ctx.tenant.id, 'kart');
      const yeniId = kimlik('kart');
      calistir(`INSERT INTO kart (id, tenant_id, hesap_id, urun_id, kod, maskeli_no, saglayici_token,
                  bicim, havuz, son_kullanim, yenilenen_id, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?,?,?,?, 'basimda', ?,?)`,
        yeniId, ctx.tenant.id, k.hesap_id, k.urun_id, kod, maskeliNo,
        String(govde.saglayiciToken || '').trim() || null, k.bicim, k.havuz, k.son_kullanim,
        k.id, ctx.kullanici.id, simdi());

      /* BAKİYE DEVRİ: iki defter satırı — eskiden çıkış, yeniye giriş.
         Bakiye elle yazılmaz; devir de bir harekettir (kural 7). */
      const kalan = defter.bakiye(k.id);
      if (kalan > 0) {
        defter.hareketYaz(ctx, {
          kartId: k.id, tur: 'devir_cikis', tutarMinor: kalan, kesinlesmis: 1,
          kaynakNesne: 'kart', kaynakId: yeniId,
          aciklama: `Bakiye ${kod} kartına devredildi (yenileme).`,
        });
        defter.hareketYaz(ctx, {
          kartId: yeniId, tur: 'devir_giris', tutarMinor: kalan, kesinlesmis: 1,
          kaynakNesne: 'kart', kaynakId: k.id,
          aciklama: `Bakiye ${k.kod} kartından devralındı (yenileme).`,
        });
      }
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'kart', nesneId: yeniId, eylem: 'yenileme', gerekce,
        sonraki: { eski: k.kod, yeni: kod, devredilenMinor: String(kalan) } });
      return `Yeni kart ${kod} basıma gönderildi${kalan > 0 ? ` ve ${para(kalan)} bakiye devredildi` : ''}`;
    });
  }

  throw DogrulamaHatasi('Bilinmeyen işlem.');
}
