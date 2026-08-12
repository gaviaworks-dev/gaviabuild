/* ============================================================================
   KART YÜKLEME, MUTABAKAT VE ONAYLAR — CRD-10..12, CRD-14, CRD-16
   ----------------------------------------------------------------------------
   Bu dosya §6.4'ün sekiz adımının EKRAN yüzüdür; algoritmanın kendisi
   `moduller/kartlar/yukleme.mjs` içindedir — ekran ikinci bir hesap yapmaz.

   Üç kural ekranda da görünür olmalıdır:
     · Tutar kullanıcıdan gelmez; politika × gün. İstisna gerekçe ister.
     · Teknik hata tekrar edilir, iş kuralı reddi EDİLMEZ.
     · Parti, iç defter + sağlayıcı ekstresi + banka çıkışı mutabık olmadan
       kapanmaz.
   ========================================================================== */
import { html, yonlendir, yanitla } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, tarihSaat, gunAnahtari, gunBaslangici } from '../cekirdek/zaman.mjs';
import { Para } from '../cekirdek/para.mjs';
import { DogrulamaHatasi, GecisIzinsiz, Bulunamadi, Cakisma, UygulamaHatasi } from '../cekirdek/hata.mjs';
import { idempotent } from '../cekirdek/idempotency.mjs';
import { cokluParcaOku } from '../cekirdek/coklu-parca.mjs';
import * as defter from '../moduller/kartlar/defter.mjs';
import * as YK from '../moduller/kartlar/yukleme.mjs';
import * as A from '../moduller/kartlar/adaptor.mjs';
import * as onayMotoru from '../moduller/isakisi/onay.mjs';
import { sayac, gecmisKarti } from './kayit-modulu.mjs';
import { hesapSecenekleri, urunSecenekleri, saglayiciSecenekleri } from './kartlar.mjs';
import {
  ekranNesnesi, hataNesnesi, kullaniciAdi, ciz, listeSorgusu, filtreKosullari,
  gecisFormu, ozetSeridi,
  B, h, ham, sayi, csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar,
  sorgu, tek, calistir, islem, surumluGuncelle, audit, sonrakiKod, gecisYap,
} from './ortak.mjs';

const para = (minor, birim = 'TRY') => (minor == null ? '—' : Para.minor(minor, birim || 'TRY').bicim());

const PARTI_DURUMLARI = {
  taslak: 'Taslak', dogrulandi: 'Doğrulandı', onay_bekliyor: 'Onay bekliyor',
  gonderiliyor: 'Gönderiliyor', kismi: 'Kısmi', basarili: 'Başarılı',
  hatali: 'Hatalı', mutabik: 'Mutabık', kapali: 'Kapalı', iptal: 'İptal',
};
const SATIR_DURUMLARI = {
  bekliyor: 'Bekliyor', gonderildi: 'Gönderildi (sonuç bilinmiyor)', basarili: 'Başarılı',
  reddedildi: 'Reddedildi (iş kuralı)', teknik_hata: 'Teknik hata (tekrar edilebilir)', iptal: 'İptal',
};
const partiRozeti = (d) => B.rozet(
  ['basarili', 'mutabik', 'kapali'].includes(d) ? 'onaylandi'
    : ['hatali', 'iptal'].includes(d) ? 'reddedildi' : 'beklemede', PARTI_DURUMLARI[d] || d);

const partiyiAl = (ctx, id) => {
  const p = tek(
    `SELECT p.*, h.ad AS hesap_ad, h.kod AS hesap_kod, h.para_birimi, h.entegrasyon_id,
            s.ad AS saglayici_ad, s.adaptor, u.ad AS urun_ad, u.kod AS urun_kod,
            pol.kod AS politika_kod, pol.ad AS politika_ad, pol.gunluk_tutar_minor, pol.gun_kaynagi
       FROM kart_yukleme_partisi p
       JOIN saglayici_hesabi h ON h.id = p.hesap_id
       JOIN kart_saglayici s ON s.id = h.saglayici_id
       JOIN kart_urunu u ON u.id = p.urun_id
       LEFT JOIN kart_politikasi pol ON pol.id = p.politika_id
      WHERE p.id = ? AND p.tenant_id = ?`, id, ctx.tenant.id);
  if (!p) throw Bulunamadi('Yükleme partisi bulunamadı.');
  return p;
};

/* ==========================================================================
   ROTA KURULUMU
   ========================================================================== */
export function kur(y, ekranRota) {
  ekranRota(y, 'CRD-10', { get: (ctx) => partiListesi(ctx) });

  ekranRota(y, 'CRD-11', {
    get: (ctx) => yuklemeShirbazi(ctx),
    post: (ctx, govde) => {
      const e = ekranNesnesi('CRD-11');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        if (govde._eylem === 'onizle') return yuklemeShirbazi(ctx, { deger: govde, onizleme: true });
        const sonuc = idempotent(
          { anahtar: govde._idempotency, tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, govde },
          () => partiAc(ctx, govde));
        return yonlendir(ctx, `/kartlar/yuklemeler/${sonuc.id}?olusan=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return yuklemeShirbazi(ctx, { deger: govde, hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  ekranRota(y, 'CRD-12', {
    get: (ctx, _g, p) => (ctx.sorgu.get('cikti') === 'csv'
      ? yuklemeDosyasi(ctx, p.id) : partiDetayi(ctx, p.id)),
    post: async (ctx, govde, p) => {
      const e = ekranNesnesi('CRD-12');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      const parti = partiyiAl(ctx, p.id);
      /* Sonuç dosyası multipart gelir; gövdeyi işleyici kendi okur. */
      const cokluMu = (ctx.istek.headers['content-type'] || '').startsWith('multipart/form-data');
      try {
        if (cokluMu) {
          const { alanlar, dosyalar } = await cokluParcaOku(ctx.istek);
          csrfZorunlu(ctx, alanlar);
          const mesaj = sonucDosyasiniIsle(ctx, parti, dosyalar.find((d) => d.alan === 'dosya'));
          return yonlendir(ctx, `/kartlar/yuklemeler/${parti.id}?islem=${encodeURIComponent(mesaj)}`);
        }
        csrfZorunlu(ctx, govde);
        const mesaj = await partiIslemi(ctx, parti, govde);
        return yonlendir(ctx, `/kartlar/yuklemeler/${parti.id}?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return partiDetayi(ctx, p.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  ekranRota(y, 'CRD-14', {
    get: (ctx) => mutabakatEkrani(ctx),
    post: (ctx, govde) => {
      const e = ekranNesnesi('CRD-14');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = mutabakatIslemi(ctx, govde);
        return yonlendir(ctx, `/kartlar/mutabakat?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return mutabakatEkrani(ctx, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  ekranRota(y, 'CRD-16', {
    get: (ctx) => onayEkrani(ctx),
    post: (ctx, govde) => {
      const e = ekranNesnesi('CRD-16');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = politikaIslemi(ctx, govde);
        return yonlendir(ctx, `/kartlar/onaylar?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return onayEkrani(ctx, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });
}

/* ==========================================================================
   CRD-10 — yükleme partileri
   ========================================================================== */
function partiListesi(ctx) {
  const e = ekranNesnesi('CRD-10');
  yetkiZorunlu(ctx, e.yetki);
  const { kosullar, parametreler } = filtreKosullari(ctx, {
    aramaAlanlari: ['kod', 'donem'],
    filtreler: [{ ad: 'hesap_id' }, { ad: 'durum' }, { ad: 'donem' }],
  });
  const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
    { tablo: 'kart_yukleme_partisi', kosullar, parametreler, sirala: 'donem DESC, olusturuldu DESC' });
  const zengin = satirlar.map((p) => ({ ...p, ozet: YK.satirOzeti(p.id),
    hesap: tek('SELECT ad FROM saglayici_hesabi WHERE id = ?', p.hesap_id)?.ad }));

  const icerik = h`
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-layer-group' },
      { etiket: 'Onay bekleyen', ikon: 'fa-hourglass-half',
        deger: sayi(sayac(ctx.tenant.id, 'kart_yukleme_partisi', `durum = 'onay_bekliyor'`)) },
      { etiket: 'Kısmi / hatalı', ikon: 'fa-triangle-exclamation',
        deger: sayi(sayac(ctx.tenant.id, 'kart_yukleme_partisi', `durum IN ('kismi','hatali')`)),
        ton: 'warn' },
      { etiket: 'Kapanan', ikon: 'fa-circle-check',
        deger: sayi(sayac(ctx.tenant.id, 'kart_yukleme_partisi', `durum = 'kapali'`)) },
    ]),
    filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Parti kodu veya dönem…',
      filtreler: [
        { ad: 'hesap_id', etiket: 'Hesap', secenekler: hesapSecenekleri(ctx) },
        { ad: 'durum', etiket: 'Durum',
          secenekler: Object.entries(PARTI_DURUMLARI).map(([d, a]) => ({ deger: d, etiket: a })) },
      ] }),
    icerik: B.tablo({
      satirlar: zengin,
      satirRota: (p) => `/kartlar/yuklemeler/${p.id}`,
      bosDurum: { baslik: 'Yükleme partisi yok', ikon: 'fa-layer-group',
        aciklama: 'Parti, uygun personel ve tutar POLİTİKADAN hesaplanarak açılır.',
        eylem: yetkiVar(ctx, 'CRD-11:olustur')
          ? B.btn('Yeni toplu yükleme', { tur: 'acc', rota: '/kartlar/yuklemeler/yeni', ikon: 'fa-plus' }) : null },
      sutunlar: [
        { ad: 'kod', etiket: 'Parti', govde: (p) => h`<b>${p.kod}</b><br><span class="muted">${p.hesap || '—'}</span>` },
        { ad: 'donem', etiket: 'Dönem' },
        { ad: 'kaynak', etiket: 'Kaynak' },
        { ad: 'satir_sayisi', etiket: 'Satır', hizala: 'sag', govde: (p) => sayi(p.satir_sayisi) },
        { ad: 'sonuc', etiket: 'Sonuç', govde: (p) => h`${p.ozet.basarili
          ? B.isaret(`${p.ozet.basarili} başarılı`, 'ok') : ''}${p.ozet.reddedildi
          ? B.isaret(`${p.ozet.reddedildi} red`, 'danger') : ''}${p.ozet.teknik_hata
          ? B.isaret(`${p.ozet.teknik_hata} teknik`, 'warn') : ''}${p.ozet.bekliyor
          ? B.isaret(`${p.ozet.bekliyor} bekliyor`, 'info') : ''}` },
        { ad: 'toplam_minor', etiket: 'Toplam', hizala: 'sag',
          govde: (p) => para(p.toplam_minor, p.tutar_birim) },
        { ad: 'durum', etiket: 'Durum', govde: (p) => partiRozeti(p.durum) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}`;
  return html(ctx, 200, ciz(ctx, e, icerik, {
    eylemler: yetkiVar(ctx, 'CRD-11:olustur')
      ? B.btn('Yeni toplu yükleme', { tur: 'acc', rota: '/kartlar/yuklemeler/yeni', ikon: 'fa-plus' }) : null,
  }));
}

/* ==========================================================================
   CRD-11 — yeni toplu yükleme sihirbazı (§6.4 madde 1-5)
   ========================================================================== */
function yuklemeShirbazi(ctx, { deger = {}, hata = null, onizleme = false, durum = 200 } = {}) {
  const e = ekranNesnesi('CRD-11');
  yetkiZorunlu(ctx, e.yetki);

  let hesaplama = null; let politika = null; let hesaplamaHatasi = null;
  if (onizleme && deger.hesapId && deger.urunId && deger.donem) {
    try {
      politika = YK.politikaCoz(ctx.tenant.id, deger.urunId, deger.donem);
      if (!politika) {
        hesaplamaHatasi = `${deger.donem} döneminde bu ürün için yürürlükte ONAYLI politika yok. `
          + 'Tutar politikadan hesaplanır; politika olmadan parti açılamaz (§6.4 madde 3).';
      } else {
        hesaplama = YK.uygunlukHesapla(ctx,
          { hesapId: deger.hesapId, urunId: deger.urunId, donem: deger.donem, politika });
      }
    } catch (err) {
      hesaplamaHatasi = err.mesaj || err.message;
    }
  }

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${B.form({
    rota: '/kartlar/yuklemeler/yeni', csrf: csrfAlani(ctx),
    idempotencyAnahtari: deger._idempotency || kimlik('idempotency'), hatalar: hata,
    bolumler: [{ baslik: '1. Kapsam',
      aciklama: 'Şirket, sağlayıcı hesabı, ürün, dönem ve yükleme kaynağı seçilir (§6.4 madde 1). '
        + 'Tutar burada girilmez: uygun personel ve tutar politikadan HESAPLANIR.',
      alanlar: h`
        ${B.alan({ ad: 'hesapId', etiket: 'Sağlayıcı hesabı', zorunlu: true, deger: deger.hesapId || '',
        hata: hata?.alanlar?.hesapId,
        secenekler: [{ deger: '', etiket: 'Seçin…' }, ...hesapSecenekleri(ctx)] })}
        ${B.alan({ ad: 'urunId', etiket: 'Ürün', zorunlu: true, deger: deger.urunId || '',
        hata: hata?.alanlar?.urunId,
        secenekler: [{ deger: '', etiket: 'Seçin…' }, ...urunSecenekleri(ctx)] })}
        ${B.alan({ ad: 'donem', etiket: 'Dönem (YYYY-AA)', zorunlu: true,
        deger: deger.donem || gunAnahtari(simdi()).slice(0, 7), hata: hata?.alanlar?.donem,
        ipucu: 'Aynı hesap, ürün ve dönemde ikinci parti açılamaz (CRD-03).' })}
        ${B.alan({ ad: 'kaynak', etiket: 'Yükleme kaynağı', deger: deger.kaynak || 'puantaj',
        ipucu: 'Puantaj kaynağında yalnız KİLİTLİ puantaj günleri sayılır.',
        secenekler: [
          { deger: 'puantaj', etiket: 'Puantaj (kilitli günler)' },
          { deger: 'sabit', etiket: 'Politika sabit günü' },
          { deger: 'dosya', etiket: 'Dosyadan' },
          { deger: 'elle', etiket: 'Elle' }] })}` }],
    ozet: h`<div class="gv-card"><div class="gc-head"><div class="gc-title"><b>Tutar nereden gelir?</b>
      <span>Formda tutar alanı yoktur.</span></div></div>
      <div class="gc-body"><p class="gf-hint" style="margin:0">
        <code>tutar = gün × politika günlük tutarı</code><br>
        Gün kaynağı politikanın kendisinde tanımlıdır (puantaj / sabit / takvim).
        Yetkili kullanıcı satır bazında <b>istisna</b> önerebilir; istisna
        <b>gerekçe zorunludur</b> ve yalnız taslak partide yapılır (§6.4 madde 3).
      </p></div></div>`,
    eylemler: h`<button class="btn btn-ghost" type="submit" name="_eylem" value="onizle">
      <i class="fa-solid fa-eye"></i> Uygunluğu hesapla</button>`,
  })}
${hesaplamaHatasi ? B.sonucSeridi({ tur: 'warn', baslik: 'Uygunluk hesaplanamadı',
    aciklama: hesaplamaHatasi }) : ''}
${hesaplama ? h`
<div class="gv-card" style="margin-top:22px">
  <div class="gc-head"><div class="gc-title"><b>2. Uygunluk sonucu</b>
    <span>Politika: ${politika.kod} — ${politika.ad} · gün kaynağı: ${politika.gun_kaynagi}
      · günlük ${para(politika.gunluk_tutar_minor, politika.tutar_birim)}</span></div></div>
  <div class="gc-body">
    ${B.kpiSeridi([
    { etiket: 'Uygun kart', deger: sayi(hesaplama.satirlar.length), ikon: 'fa-credit-card' },
    { etiket: 'Hariç', deger: sayi(hesaplama.haricler.length), ikon: 'fa-user-slash',
      ton: hesaplama.haricler.length ? 'warn' : '' },
    { etiket: 'Toplam tutar', deger: para(hesaplama.toplamMinor, hesaplama.urun.para_birimi),
      ikon: 'fa-wallet' },
  ])}
  </div>
  <div class="gc-body flush">${B.tablo({
    satirlar: hesaplama.satirlar,
    bosDurum: { baslik: 'Uygun kart yok' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kart', govde: (s) => h`<b>${s.kod}</b> <span class="muted">•••• ${s.maskeliNo}</span>` },
      { ad: 'adSoyad', etiket: 'Personel', govde: (s) => s.adSoyad || '—' },
      { ad: 'gunSayisi', etiket: 'Gün', hizala: 'sag', govde: (s) => sayi(s.gunSayisi) },
      { ad: 'aciklama', etiket: 'Hesap', govde: (s) => h`<span class="muted">${s.aciklama}</span>` },
      { ad: 'tutarMinor', etiket: 'Tutar', hizala: 'sag', govde: (s) => para(s.tutarMinor) },
    ],
  })}</div>
</div>
${hesaplama.haricler.length ? h`<div class="gv-card" style="margin-top:18px">
  <div class="gc-head"><div class="gc-title"><b>Hariç tutulanlar</b>
    <span>Her satır NEDEN hariç olduğunu taşır; sessiz eksik yoktur.</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: hesaplama.haricler,
    bosDurum: { baslik: 'Yok' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kart', govde: (x) => h`${x.kod} <span class="muted">•••• ${x.maskeliNo}</span>` },
      { ad: 'adSoyad', etiket: 'Personel', govde: (x) => x.adSoyad || '—' },
      { ad: 'neden', etiket: 'Neden hariç' },
    ],
  })}</div>
</div>` : ''}
${hesaplama.satirlar.length ? h`<form method="post" action="/kartlar/yuklemeler/yeni"
  data-gform="1" style="margin-top:18px">
  ${ham(csrfAlani(ctx))}
  <input type="hidden" name="_idempotency" value="${kimlik('idempotency')}">
  <input type="hidden" name="hesapId" value="${deger.hesapId}">
  <input type="hidden" name="urunId" value="${deger.urunId}">
  <input type="hidden" name="donem" value="${deger.donem}">
  <input type="hidden" name="kaynak" value="${deger.kaynak || 'puantaj'}">
  <div class="gv-card"><div class="gc-body">
    <p class="gf-hint">Parti <b>taslak</b> olarak açılır. Onaya gönderildiğinde sürümü
      <b>dondurulur</b> ve toplam tutara göre onay şablonu çözülür (§6.4 madde 5).</p>
    ${B.btn(`Partiyi aç (${hesaplama.satirlar.length} satır · ${para(hesaplama.toplamMinor)})`,
    { tur: 'acc', gonder: true, ikon: 'fa-plus' })}
  </div></div>
</form>` : ''}` : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

function partiAc(ctx, govde) {
  return YK.partiOlustur(ctx, {
    hesapId: govde.hesapId, urunId: govde.urunId, donem: govde.donem,
    kaynak: govde.kaynak || 'puantaj',
    idempotencyAnahtari: govde._idempotency || null,
  });
}

/* ==========================================================================
   CRD-12 — parti detayı (§6.4 madde 6-8)
   ========================================================================== */
function partiDetayi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('CRD-12');
  yetkiZorunlu(ctx, e.yetki);
  const p = partiyiAl(ctx, id);
  const ozet = YK.satirOzeti(p.id);
  const satirlar = sorgu(
    `SELECT s.*, k.kod AS kart_kod, k.maskeli_no, k.durum AS kart_durum, pe.ad_soyad
       FROM kart_yukleme_satiri s
       JOIN kart k ON k.id = s.kart_id
       LEFT JOIN personel pe ON pe.id = s.personel_id
      WHERE s.parti_id = ? ORDER BY k.kod`, p.id);
  const dogrulama = YK.partiDogrula(ctx, p);
  const engeller = YK.kapanisEngelleri(p);
  const olaylar = sorgu(
    `SELECT * FROM entegrasyon_olayi WHERE kaynak_nesne = 'kart_yukleme_partisi' AND kaynak_id = ?
      ORDER BY zaman DESC LIMIT 20`, p.id);
  const acikOnay = tek(
    `SELECT id FROM onay_talebi WHERE nesne = 'kart_yukleme' AND nesne_id = ? AND durum = 'acik'`, p.id);
  const tekrarlanabilir = ozet.teknik_hata > 0;

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: 'Parti açıldı',
    aciklama: 'Satırlar ve tutarlar politikadan hesaplandı; parti taslak durumda.' }) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${ozet.reddedildi > 0 ? B.sonucSeridi({ tur: 'warn', baslik: `${ozet.reddedildi} satır iş kuralı gereği reddedildi`,
    aciklama: 'Reddedilen satır TEKRAR GÖNDERİLMEZ: aynı reddi üretir. Kaydı düzeltip yeni parti açın.' }) : ''}
${ozet.gonderildi > 0 ? B.sonucSeridi({ tur: 'warn', baslik: `${ozet.gonderildi} satırın sonucu BİLİNMİYOR`,
    aciklama: 'Gönderim zaman aşımına uğradı. Zaman aşımı başarısızlık değildir; sağlayıcıdan '
      + 'durum sorgulanmadan tekrar gönderilmez (§6.4 madde 6).' }) : ''}
${ozetSeridi(ctx, {
    nesne: 'kartYuklemePartisi',
    kayit: { ...p, teknik_hata_sayisi: ozet.teknik_hata },
    baslik: `${p.donem} — ${p.urun_ad}`,
    bilgiler: [
      { etiket: 'Hesap', deger: `${p.hesap_kod} — ${p.hesap_ad}` },
      { etiket: 'Sağlayıcı', deger: p.saglayici_ad },
      { etiket: 'Politika', deger: p.politika_kod ? `${p.politika_kod} (${p.gun_kaynagi})` : '—' },
      { etiket: 'Satır', deger: `${p.satir_sayisi}` },
      { etiket: 'Toplam', deger: para(p.toplam_minor, p.tutar_birim) },
      { etiket: 'Parti sürümü', deger: p.donduruldu ? `dondurulmuş (v${p.surum_no})` : `v${p.surum_no}` },
    ],
    digerEylemler: h`${acikOnay ? B.btn('Onay talebini aç', { rota: `/onaylar/${acikOnay.id}`, ikon: 'fa-circle-check' }) : ''}`,
  })}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Satır sonuçları</b>
        <span>Teknik hata tekrar edilir; iş kuralı reddi edilmez (§6.4 madde 7).</span></div></div>
      <div class="gc-body">${B.kpiSeridi([
    { etiket: 'Başarılı', deger: sayi(ozet.basarili), ikon: 'fa-circle-check' },
    { etiket: 'Reddedildi', deger: sayi(ozet.reddedildi), ikon: 'fa-ban',
      ton: ozet.reddedildi ? 'danger' : '' },
    { etiket: 'Teknik hata', deger: sayi(ozet.teknik_hata), ikon: 'fa-rotate',
      ton: ozet.teknik_hata ? 'warn' : '' },
    { etiket: 'Bekleyen', deger: sayi(ozet.bekliyor + ozet.gonderildi), ikon: 'fa-hourglass-half' },
    { etiket: 'Yüklenen tutar', deger: para(ozet.basarili_minor, p.tutar_birim), ikon: 'fa-wallet' },
  ])}</div>
      <div class="gc-body flush">${B.tablo({
    satirlar,
    bosDurum: { baslik: 'Satır yok' },
    sutunlar: [
      { ad: 'kart_kod', etiket: 'Kart',
        govde: (s) => h`<a href="/kartlar/${s.kart_id}">${s.kart_kod}</a>
          <span class="muted">•••• ${s.maskeli_no}</span>` },
      { ad: 'ad_soyad', etiket: 'Personel', govde: (s) => s.ad_soyad || '—' },
      { ad: 'gun_sayisi', etiket: 'Gün', hizala: 'sag', govde: (s) => sayi(s.gun_sayisi) },
      { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag',
        govde: (s) => h`${para(s.tutar_minor, s.tutar_birim)}${s.istisna_gerekcesi
          ? h`<br>${B.isaret('istisna', 'warn')}` : ''}` },
      { ad: 'durum', etiket: 'Sonuç', govde: (s) => h`${B.rozet(
        s.durum === 'basarili' ? 'onaylandi'
          : s.durum === 'reddedildi' ? 'reddedildi' : 'beklemede', SATIR_DURUMLARI[s.durum] || s.durum)}${
        s.hata_mesaji ? h`<br><span class="muted">${s.hata_kodu || ''} ${s.hata_mesaji}</span>` : ''}` },
      { ad: 'deneme_sayisi', etiket: 'Deneme', hizala: 'sag', govde: (s) => sayi(s.deneme_sayisi) },
    ],
  })}</div>
    </div>

    ${p.durum === 'taslak' && dogrulama.bulgular.length ? h`<div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Doğrulama bulguları</b>
        <span>Mükerrer kart, mükerrer dönem, para birimi, pasif kart, ayrılmış personel (§6.4 madde 4).</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: dogrulama.bulgular,
    bosDurum: { baslik: 'Bulgu yok' },
    sutunlar: [
      { ad: 'agirlik', etiket: '', govde: (b) => B.isaret(b.agirlik === 'engel' ? 'engel' : 'uyarı',
        b.agirlik === 'engel' ? 'danger' : 'warn') },
      { ad: 'mesaj', etiket: 'Bulgu' },
    ],
  })}</div>
    </div>` : ''}

    ${olaylar.length ? h`<div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Entegrasyon olayları</b>
        <span>İstek kimliği, maskeli payload, retry durumu (OPS-01).</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: olaylar,
    bosDurum: { baslik: 'Olay yok' },
    sutunlar: [
      { ad: 'zaman', etiket: 'Zaman', govde: (o) => tarihSaat(o.zaman) },
      { ad: 'islem', etiket: 'İşlem' },
      { ad: 'durum', etiket: 'Sonuç', govde: (o) => h`${B.rozet(
        o.durum === 'basarili' ? 'onaylandi'
          : o.durum === 'is_kurali_reddi' ? 'reddedildi' : 'beklemede', o.durum)}${
        o.hata_kodu ? h`<br><span class="muted">${o.hata_kodu}</span>` : ''}` },
      { ad: 'idempotency_anahtari', etiket: 'Idempotency',
        govde: (o) => h`<span class="muted">${(o.idempotency_anahtari || '—').slice(0, 18)}</span>` },
      { ad: 'deneme_sayisi', etiket: 'Deneme', hizala: 'sag', govde: (o) => sayi(o.deneme_sayisi) },
    ],
  })}</div>
    </div>` : ''}
    ${gecmisKarti('kart_yukleme_partisi', p)}
  </div>

  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Parti işlemleri</b>
        <span>Nihai durumu siz seçmezsiniz; sonucu motor yazar.</span></div></div>
      <div class="gc-body">
        <form method="post" action="/kartlar/yuklemeler/${p.id}" data-gform="1">
          ${ham(csrfAlani(ctx))}
          ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe', tur: 'metin' })}
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
            ${p.durum === 'taslak' ? h`<button class="btn btn-ghost" type="submit" name="_eylem" value="dogrula"
              ${ham(dogrulama.engel ? 'disabled title="Engel bulguları giderilmeli"' : '')}>
              <i class="fa-solid fa-list-check"></i> Doğrula</button>` : ''}
            ${p.durum === 'dogrulandi' ? h`<button class="btn btn-acc" type="submit" name="_eylem" value="onaya_gonder">
              <i class="fa-solid fa-paper-plane"></i> Onaya gönder (sürümü dondurur)</button>` : ''}
            ${p.durum === 'onay_bekliyor' && !acikOnay ? h`<button class="btn btn-acc" type="submit"
              name="_eylem" value="gonder"><i class="fa-solid fa-cloud-arrow-up"></i>
              Sağlayıcıya gönder</button>` : ''}
            ${['gonderiliyor', 'kismi'].includes(p.durum) ? h`<button class="btn btn-ghost" type="submit"
              name="_eylem" value="durum_sorgula"><i class="fa-solid fa-question"></i>
              Sağlayıcıdan durum sorgula</button>` : ''}
            ${tekrarlanabilir ? h`<button class="btn btn-ghost" type="submit" name="_eylem" value="tekrar">
              <i class="fa-solid fa-rotate"></i> Teknik hatalı ${ozet.teknik_hata} satırı tekrar gönder</button>` : ''}
            ${['basarili', 'kismi'].includes(p.durum) ? h`<button class="btn btn-ghost" type="submit"
              name="_eylem" value="mutabakat"><i class="fa-solid fa-scale-balanced"></i>
              Mutabakatı tamamla</button>` : ''}
            ${p.durum === 'mutabik' ? h`<button class="btn btn-acc" type="submit" name="_eylem" value="kapat"
              ${ham(engeller.length ? 'disabled title="Kapanış engeli var"' : '')}>
              <i class="fa-solid fa-lock"></i> Partiyi kapat</button>` : ''}
            ${['taslak', 'dogrulandi'].includes(p.durum) ? h`<button class="btn btn-danger" type="submit"
              name="_eylem" value="iptal"><i class="fa-solid fa-ban"></i> İptal et</button>` : ''}
          </div>
        </form>
      </div>
    </div>
    ${['gonderiliyor', 'kismi', 'onay_bekliyor'].includes(p.durum) ? h`<div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Kontrollü dosya akışı</b>
        <span>Sağlayıcı API'si yoksa veya yeteneği desteklemiyorsa akış buraya düşer (§6.6).</span></div></div>
      <div class="gc-body">
        <p class="gf-hint">Yükleme dosyasında TAM KART NUMARASI yoktur: kart kodu ve
          sağlayıcı token'ı taşınır. Dosya üretmek "gönderildi" demek değildir —
          sonuç, sağlayıcıdan dönen dosya yüklenene kadar bilinmez.</p>
        <div style="margin-bottom:14px">${B.btn('Yükleme dosyasını indir',
    { rota: `/kartlar/yuklemeler/${p.id}?cikti=csv`, ikon: 'fa-file-arrow-down' })}</div>
        <form method="post" action="/kartlar/yuklemeler/${p.id}" enctype="multipart/form-data">
          ${ham(csrfAlani(ctx))}
          <div class="gfield full">
            <label for="alan-dosya">Sağlayıcı sonuç dosyası</label>
            <input id="alan-dosya" type="file" name="dosya" accept=".csv,text/csv,text/plain" required>
            <span class="gf-hint">Biçim: <code>kart_kodu;sonuc;referans;hata_kodu;mesaj</code> ·
              <code>sonuc</code> ∈ basarili | reddedildi | teknik_hata</span>
          </div>
          <div style="margin-top:12px">${B.btn('Sonuç dosyasını işle',
    { tur: 'acc', gonder: true, ikon: 'fa-file-arrow-up' })}</div>
        </form>
      </div>
    </div>` : ''}
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Kapanış engelleri</b>
        <span>İç defter + sağlayıcı ekstresi + banka mutabık olmadan kapanmaz (§6.4 madde 8).</span></div></div>
      <div class="gc-body">${engeller.length
    ? h`<ul style="margin:0;padding-left:18px">${engeller.map((x) => h`<li>${x}</li>`)}</ul>`
    : B.isaret('engel yok', 'ok')}</div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: p.kod }));
}

async function partiIslemi(ctx, p, govde) {
  const gerekce = String(govde.gerekce || '').trim() || null;

  if (govde._eylem === 'dogrula') {
    const d = YK.partiDogrula(ctx, p);
    if (d.engel) {
      throw GecisIzinsiz(`Doğrulama engelleri var: ${d.bulgular.filter((b) => b.agirlik === 'engel')
        .slice(0, 3).map((b) => b.mesaj).join(' · ')}`);
    }
    islem(() => {
      YK.toplamiYenile(p.id);
      gecisYap(ctx, { nesne: 'kartYuklemePartisi', tablo: 'kart_yukleme_partisi', kayit: p,
        eylem: 'dogrula', gerekce, ekranKodu: 'CRD-12' });
    });
    return 'Parti doğrulandı';
  }

  if (govde._eylem === 'onaya_gonder') {
    return islem(() => {
      const t = YK.toplamiYenile(p.id);
      /* Sürüm DONDURULUR: onaycı gördüğü sürümü onaylar (§6.4 madde 5, WF-02). */
      calistir('UPDATE kart_yukleme_partisi SET donduruldu = ? WHERE id = ?', simdi(), p.id);
      onayMotoru.onayaGonder(ctx, {
        nesne: 'kart_yukleme', nesneId: p.id, nesneKod: p.kod,
        baslik: `Kart yükleme: ${p.donem} — ${p.urun_ad} (${t.satirSayisi} satır)`,
        belgeSurum: p.surum, tutarMinor: t.toplamMinor, tutarBirim: p.tutar_birim, gerekce,
      });
      const guncel = tek('SELECT * FROM kart_yukleme_partisi WHERE id = ?', p.id);
      gecisYap(ctx, { nesne: 'kartYuklemePartisi', tablo: 'kart_yukleme_partisi', kayit: guncel,
        eylem: 'onaya_gonder', gerekce, ekranKodu: 'CRD-12' });
      return `Parti onaya gönderildi (${para(t.toplamMinor, p.tutar_birim)})`;
    });
  }

  if (govde._eylem === 'gonder' || govde._eylem === 'tekrar') {
    if (govde._eylem === 'tekrar') {
      const ozet = YK.satirOzeti(p.id);
      if (!ozet.teknik_hata) {
        throw GecisIzinsiz('Tekrar edilebilir satır yok. İş kuralı reddi tekrar gönderilmez — '
          + 'aynı reddi üretir (§6.4 madde 7).');
      }
    }
    /* Gönderim öncesi durumu 'gonderiliyor'a al (motor geçişi). */
    if (p.durum === 'onay_bekliyor') {
      islem(() => gecisYap(ctx, { nesne: 'kartYuklemePartisi', tablo: 'kart_yukleme_partisi',
        kayit: p, eylem: 'gonder', motor: true, gerekce, ekranKodu: 'CRD-12' }));
    }
    const guncel = partiyiAl(ctx, p.id);
    const sonuc = await YK.partiGonder(ctx, guncel);
    sonucuUygula(ctx, p.id);
    const s = sonuc.sonuc || {};
    if (s.durum === 'basarili') return `${sonuc.gonderilen} satır gönderildi`;
    if (s.durum === 'bilinmiyor') {
      return `Gönderim sonucu BİLİNMİYOR (${s.kod || '—'}). ${s.mesaj || ''} `
        + 'Satırlar "gönderildi" durumunda; durum sorgulanmadan tekrar gönderilmez.';
    }
    return `Gönderim sonucu: ${s.durum} (${s.kod || '—'}). ${s.mesaj || ''}`;
  }

  if (govde._eylem === 'durum_sorgula') {
    const hesap = tek('SELECT * FROM saglayici_hesabi WHERE id = ?', p.hesap_id);
    const entegrasyon = hesap?.entegrasyon_id
      ? tek('SELECT * FROM entegrasyon WHERE id = ?', hesap.entegrasyon_id) : null;
    const sonuc = await A.cagriYurut(ctx, {
      entegrasyon, yetenek: 'yuklemeDurum', girdi: { parti: p },
      kaynakNesne: 'kart_yukleme_partisi', kaynakId: p.id,
      idempotencyAnahtari: `${p.idempotency_anahtari}#durum-${simdi()}`,
    });
    return `Durum sorgusu: ${sonuc.durum} (${sonuc.kod || '—'}). ${sonuc.mesaj || ''}`;
  }

  if (govde._eylem === 'mutabakat') {
    const engeller = YK.kapanisEngelleri(p);
    const mutabakatEksik = engeller.filter((x) => /ekstre|banka|mutabakat|fark/i.test(x));
    if (mutabakatEksik.length) {
      throw GecisIzinsiz(`Mutabakat tamamlanamaz: ${mutabakatEksik.join(' · ')} `
        + '(Kart mutabakatı ekranından tamamlayın.)');
    }
    islem(() => gecisYap(ctx, { nesne: 'kartYuklemePartisi', tablo: 'kart_yukleme_partisi',
      kayit: p, eylem: 'mutabakat', gerekce, ekranKodu: 'CRD-12' }));
    return 'Parti mutabık işaretlendi';
  }

  if (govde._eylem === 'kapat') {
    const engeller = YK.kapanisEngelleri(p);
    if (engeller.length) throw GecisIzinsiz(`Kapanış engeli var: ${engeller.join(' · ')}`);
    islem(() => gecisYap(ctx, { nesne: 'kartYuklemePartisi', tablo: 'kart_yukleme_partisi',
      kayit: p, eylem: 'kapat', gerekce, ekranKodu: 'CRD-12' }));
    return 'Parti kapatıldı';
  }

  if (govde._eylem === 'iptal') {
    if (!gerekce) throw DogrulamaHatasi('İptal için gerekçe zorunludur.',
      { alanlar: { gerekce: ['Gerekçe girin.'] } });
    islem(() => {
      calistir(`UPDATE kart_yukleme_satiri SET durum = 'iptal', guncellendi = ?
                 WHERE parti_id = ? AND durum IN ('bekliyor','teknik_hata')`, simdi(), p.id);
      calistir(`UPDATE kart_yukleme_partisi SET durum = 'iptal', guncelleyen = ?, guncellendi = ?
                 WHERE id = ?`, ctx.kullanici.id, simdi(), p.id);
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'kartYuklemePartisi', nesneId: p.id, eylem: 'iptal', gerekce });
    });
    return 'Parti iptal edildi';
  }

  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

/* ==========================================================================
   KONTROLLÜ DOSYA AKIŞI (§6.6)
   --------------------------------------------------------------------------
   Sağlayıcı API'si yoksa veya bir yeteneği desteklemiyorsa akış buraya düşer.
   Bu akış GERÇEKTİR: yükleme dosyası üretilir, sağlayıcıdan dönen sonuç
   dosyası okunur ve satır bazlı sonuç deftere işlenir. Dosya üretmek
   "gönderildi" demek DEĞİLDİR; sonuç, dosya geri yüklenene kadar bilinmez.

   Dosyada TAM KART NUMARASI yoktur: kart kodu ve sağlayıcı token'ı taşınır.
   ========================================================================== */
function yuklemeDosyasi(ctx, partiId) {
  const e = ekranNesnesi('CRD-12');
  yetkiZorunlu(ctx, `${e.kod}:disa_aktar`);
  const p = partiyiAl(ctx, partiId);
  const satirlar = sorgu(
    `SELECT s.*, k.kod AS kart_kod, k.maskeli_no, k.saglayici_token, pe.kod AS personel_kod
       FROM kart_yukleme_satiri s
       JOIN kart k ON k.id = s.kart_id
       LEFT JOIN personel pe ON pe.id = s.personel_id
      WHERE s.parti_id = ? AND s.durum IN ('bekliyor','gonderildi','teknik_hata')
      ORDER BY k.kod`, p.id);

  /* Künye: hangi filtre, hangi veri tarihi, hangi sürüm (kural 9 kalıbı). */
  const kunye = [
    `# Parti: ${p.kod}`, `# Hesap: ${p.hesap_kod} (${p.hesap_ad})`,
    `# Sağlayıcı: ${p.saglayici_ad}`, `# Ürün: ${p.urun_kod}`,
    `# Dönem: ${p.donem}`, `# Parti sürümü: v${p.surum_no}`,
    `# Idempotency: ${p.idempotency_anahtari}`,
    `# Veri tarihi: ${new Date(simdi()).toISOString()}`,
    '# Sütunlar: kart_kodu;saglayici_token;tutar_minor;para_birimi',
  ].join('\n');
  const govde = satirlar
    .map((s) => [s.kart_kod, s.saglayici_token || '', s.tutar_minor, s.tutar_birim].join(';'))
    .join('\n');

  islem(() => audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id,
    istekId: ctx.istekId, ip: ctx.ip,
    nesne: 'kartYuklemePartisi', nesneId: p.id, eylem: 'disa_aktar',
    sonraki: { satir: satirlar.length, bicim: 'csv' } }));

  return yanitla(ctx, 200, `\ufeff${kunye}\n${govde}\n`, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${p.kod}-yukleme.csv"`,
  });
}

/**
 * Sağlayıcıdan dönen SONUÇ dosyasını işler.
 * Biçim: `kart_kodu;sonuc;referans;hata_kodu;mesaj`
 * `sonuc` ∈ basarili | reddedildi | teknik_hata
 *
 * Kullanıcı burada "sonuç seçmiyor": sağlayıcının verdiği dosyayı sisteme
 * aktarıyor. Aynı satır iki kez muhasebeleşmez (`hareket_id` kontrolü).
 */
function sonucDosyasiniIsle(ctx, parti, dosya) {
  if (!dosya || !dosya.icerik?.length) {
    throw DogrulamaHatasi('Sonuç dosyası seçilmedi.', { alanlar: { dosya: ['Dosya yükleyin.'] } });
  }
  if (!['gonderiliyor', 'kismi', 'onay_bekliyor'].includes(parti.durum)) {
    throw GecisIzinsiz(`Parti "${parti.durum}" durumunda; sonuç dosyası yalnız gönderilmiş partiye işlenir.`);
  }
  const metin = dosya.icerik.toString('utf8').replace(/^\ufeff/, '');
  const satirlar = metin.split(/\r?\n/).filter((x) => x.trim() && !x.startsWith('#'));
  if (!satirlar.length) throw DogrulamaHatasi('Sonuç dosyası boş.');

  const IZINLI = ['basarili', 'reddedildi', 'teknik_hata'];
  const sonuclar = []; const bulunamayan = [];
  for (const satir of satirlar) {
    const [kartKodu, sonuc, referans, hataKodu, ...mesaj] = satir.split(';').map((x) => x.trim());
    if (!IZINLI.includes(sonuc)) {
      throw DogrulamaHatasi(
        `Geçersiz sonuç değeri: "${sonuc}". İzinli değerler: ${IZINLI.join(', ')}. `
        + 'Teknik hata ile iş kuralı reddi AYRI kaydedilir; yalnız teknik hata tekrar edilir.');
    }
    const s = tek(
      `SELECT s.id FROM kart_yukleme_satiri s JOIN kart k ON k.id = s.kart_id
        WHERE s.parti_id = ? AND k.kod = ?`, parti.id, kartKodu);
    if (!s) { bulunamayan.push(kartKodu); continue; }
    sonuclar.push({ satirId: s.id, durum: sonuc, referans: referans || null,
      kod: hataKodu || null, mesaj: mesaj.join(';') || null });
  }
  if (!sonuclar.length) {
    throw DogrulamaHatasi(`Dosyadaki hiçbir kart bu partide bulunamadı: ${bulunamayan.slice(0, 5).join(', ')}`);
  }

  const ozet = YK.sonucIsle(ctx, parti, sonuclar);
  sonucuUygula(ctx, parti.id);
  return `Sonuç dosyası işlendi: ${ozet.basarili} başarılı, ${ozet.reddedilen} red, `
    + `${ozet.teknik} teknik hata`
    + (bulunamayan.length ? ` · ${bulunamayan.length} satır bu partide bulunamadı` : '');
}

/**
 * Satır özetinden PARTİ durumunu motor eylemiyle günceller.
 * Kullanıcı nihai durumu seçemez (kural 5): sonuç eylemini `yukleme.mjs` çözer.
 */
function sonucuUygula(ctx, partiId) {
  const ozet = YK.satirOzeti(partiId);
  const eylem = YK.sonucEylemi(ozet);
  if (!eylem) return null;
  const guncel = tek('SELECT * FROM kart_yukleme_partisi WHERE id = ?', partiId);
  if (guncel.durum !== 'gonderiliyor' && guncel.durum !== 'kismi') return null;
  const izinli = { sonuc_basarili: 'basarili', sonuc_kismi: 'kismi', sonuc_hatali: 'hatali' };
  if (guncel.durum === 'kismi' && eylem !== 'sonuc_basarili') return null;
  return islem(() => gecisYap(ctx, { nesne: 'kartYuklemePartisi', tablo: 'kart_yukleme_partisi',
    kayit: guncel, eylem: guncel.durum === 'kismi' ? 'tekrar_tamam' : eylem, motor: true,
    gerekce: `Satır sonucu: ${ozet.basarili} başarılı, ${ozet.reddedildi} red, ${ozet.teknik_hata} teknik`,
    ekranKodu: 'CRD-12' }));
}

/**
 * Onay kapandığında kart nesnelerini ilerletir — `isakisi.mjs` bu köprüyü çağırır.
 *
 * ÖNEMLİ: onay GÖNDERİM DEĞİLDİR. Onaylanan parti `onay_bekliyor` durumunda
 * kalır ve gönderim ayrı, bilinçli bir adımdır (§6.4 madde 6). Onayın kendisi
 * sağlayıcıya para göndermez.
 */
export function kartOnaySonucu(ctx, nesne, nesneId, sonuc) {
  if (nesne === 'kart_yukleme') {
    const p = tek('SELECT * FROM kart_yukleme_partisi WHERE id = ?', nesneId);
    if (!p || p.durum !== 'onay_bekliyor') return;
    if (sonuc === 'onaylandi') {
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'kartYuklemePartisi', nesneId, eylem: 'onaylandi',
        sonraki: { durum: p.durum, not: 'Onay gönderim değildir; gönderim ayrı adımdır.' } });
      return;
    }
    /* Reddedilen veya revizyon istenen parti taslağa döner; sürüm dondurması kalkar. */
    islem(() => {
      gecisYap(ctx, { nesne: 'kartYuklemePartisi', tablo: 'kart_yukleme_partisi', kayit: p,
        eylem: sonuc === 'reddedildi' ? 'iptal' : 'revizyon', motor: true,
        gerekce: `Onay sonucu: ${sonuc}` });
    });
    return;
  }

  /* Politika ve mutabakat: onaylı kayıt yerinde değişmez (kural 6). */
  const tablo = { kart_politikasi: 'kart_politikasi', kart_mutabakati: 'kart_mutabakati' }[nesne];
  if (!tablo) return;
  const k = tek(`SELECT * FROM ${tablo} WHERE id = ?`, nesneId);
  if (!k) return;
  const yeni = sonuc === 'onaylandi' ? 'onaylandi'
    : sonuc === 'reddedildi' ? 'reddedildi' : 'revizyon_istendi';
  islem(() => {
    surumluGuncelle(tablo, k.id, k.surum, { durum: yeni },
      { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne, nesneId, eylem: `gecis:${yeni}`, gerekce: 'Onay motoru kararı',
      onceki: { durum: k.durum }, sonraki: { durum: yeni } });
  });
}

/* ==========================================================================
   CRD-14 — kart mutabakatı (üç yönlü)
   ========================================================================== */
function mutabakatEkrani(ctx, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('CRD-14');
  yetkiZorunlu(ctx, e.yetki);
  const hesapId = ctx.sorgu.get('hesap_id') || null;
  const donem = ctx.sorgu.get('donem') || gunAnahtari(simdi()).slice(0, 7);

  const kayitlar = sorgu(
    `SELECT m.*, h.ad AS hesap_ad, h.kod AS hesap_kod, s.ad AS saglayici_ad
       FROM kart_mutabakati m
       JOIN saglayici_hesabi h ON h.id = m.hesap_id
       JOIN kart_saglayici s ON s.id = h.saglayici_id
      WHERE m.tenant_id = ? ${hesapId ? 'AND m.hesap_id = ?' : ''}
      ORDER BY m.donem DESC LIMIT 60`,
    ...(hesapId ? [ctx.tenant.id, hesapId] : [ctx.tenant.id]));

  /* Seçili hesap+dönem için CANLI hesap: iç defter her zaman yeniden toplanır. */
  let canli = null;
  if (hesapId) {
    try {
      const mevcut = tek('SELECT * FROM kart_mutabakati WHERE hesap_id = ? AND donem = ?', hesapId, donem);
      canli = YK.mutabakatHesapla(ctx.tenant.id, hesapId, donem, {
        saglayiciToplam: mevcut?.saglayici_toplam_minor == null ? null : Number(mevcut.saglayici_toplam_minor),
        bankaToplam: mevcut?.banka_toplam_minor == null ? null : Number(mevcut.banka_toplam_minor),
      });
      canli.mevcut = mevcut;
    } catch (err) { canli = null; }
  }

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Mutabakat kaydı', deger: sayi(kayitlar.length), ikon: 'fa-scale-balanced' },
      { etiket: 'Farklı dönem', ikon: 'fa-triangle-exclamation',
        deger: sayi(kayitlar.filter((m) => Number(m.fark_minor) !== 0).length),
        ton: kayitlar.some((m) => Number(m.fark_minor) !== 0) ? 'danger' : '' },
      { etiket: 'Onaylanan', ikon: 'fa-circle-check',
        deger: sayi(kayitlar.filter((m) => m.durum === 'onaylandi').length) },
    ]),
    filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Dönem…',
      filtreler: [{ ad: 'hesap_id', etiket: 'Hesap', secenekler: hesapSecenekleri(ctx) }] }),
    icerik: h`
${canli ? h`<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>${donem} — üç yönlü karşılaştırma</b>
    <span>İç defter her okumada yeniden toplanır; ekranla defter ayrışamaz.</span></div></div>
  <div class="gc-body">
    ${B.kpiSeridi([
    { etiket: 'İç defter', deger: para(canli.icToplam), ikon: 'fa-book' },
    { etiket: 'Sağlayıcı ekstresi',
      deger: canli.saglayiciToplam == null ? '—' : para(canli.saglayiciToplam), ikon: 'fa-file-invoice' },
    { etiket: 'Banka çıkışı',
      deger: canli.bankaToplam == null ? '—' : para(canli.bankaToplam), ikon: 'fa-building-columns' },
    { etiket: 'Fark', deger: para(canli.farkMinor), ikon: 'fa-scale-unbalanced',
      ton: canli.farkMinor ? 'danger' : 'ok' },
  ])}
    ${canli.eksikKaynak.length ? B.sonucSeridi({ tur: 'warn', baslik: 'Eksik kaynak',
    aciklama: `${canli.eksikKaynak.join(' ve ')} girilmeden mutabakat kapanamaz (§6.4 madde 8).` }) : ''}
    ${B.form({
    rota: '/kartlar/mutabakat', csrf: csrfAlani(ctx), idempotencyAnahtari: kimlik('idempotency'),
    bolumler: [{ baslik: 'Dış kaynak toplamları',
      aciklama: 'Sağlayıcı ekstresi ve banka çıkışı buradan girilir. İç defter GİRİLMEZ — '
        + 'o her zaman hareket defterinden hesaplanır (kural 7).',
      alanlar: h`
        <input type="hidden" name="_eylem" value="kaydet">
        <input type="hidden" name="hesapId" value="${hesapId}">
        <input type="hidden" name="donem" value="${donem}">
        ${B.alan({ ad: 'saglayiciToplam', etiket: 'Sağlayıcı ekstre toplamı',
        deger: canli.saglayiciToplam == null ? ''
          : Para.minor(canli.saglayiciToplam, 'TRY').bicim({ simge: false }) })}
        ${B.alan({ ad: 'bankaToplam', etiket: 'Banka çıkış toplamı',
        deger: canli.bankaToplam == null ? ''
          : Para.minor(canli.bankaToplam, 'TRY').bicim({ simge: false }) })}
        ${B.alan({ ad: 'aciklama', etiket: 'Fark açıklaması', tur: 'metin', genis: true,
        ipucu: 'Fark sıfır değilse açıklama ZORUNLUDUR ve onaydan geçmeden kapanmaz.' })}` }],
    eylemler: B.btn('Mutabakatı kaydet', { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' }),
  })}
  </div>
</div>` : B.sonucSeridi({ tur: 'ok', baslik: 'Hesap seçin',
    aciklama: 'Üç yönlü karşılaştırma için filtreden bir sağlayıcı hesabı seçin.' })}
${B.tablo({
    satirlar: kayitlar,
    bosDurum: { baslik: 'Mutabakat kaydı yok', ikon: 'fa-scale-balanced',
      aciklama: 'İç defter, sağlayıcı ekstresi ve banka çıkışı mutabık olmadan parti kapanmaz.' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'donem', etiket: 'Dönem' },
      { ad: 'hesap_ad', etiket: 'Hesap',
        govde: (m) => h`<b>${m.hesap_ad}</b><br><span class="muted">${m.saglayici_ad}</span>` },
      { ad: 'ic_toplam_minor', etiket: 'İç defter', hizala: 'sag',
        govde: (m) => para(m.ic_toplam_minor, m.tutar_birim) },
      { ad: 'saglayici_toplam_minor', etiket: 'Sağlayıcı', hizala: 'sag',
        govde: (m) => (m.saglayici_toplam_minor == null ? '—' : para(m.saglayici_toplam_minor, m.tutar_birim)) },
      { ad: 'banka_toplam_minor', etiket: 'Banka', hizala: 'sag',
        govde: (m) => (m.banka_toplam_minor == null ? '—' : para(m.banka_toplam_minor, m.tutar_birim)) },
      { ad: 'fark_minor', etiket: 'Fark', hizala: 'sag',
        govde: (m) => h`${Number(m.fark_minor) ? B.isaret(para(m.fark_minor, m.tutar_birim), 'danger')
          : B.isaret('mutabık', 'ok')}` },
      { ad: 'durum', etiket: 'Durum', govde: (m) => B.rozet(
        m.durum === 'onaylandi' ? 'onaylandi' : 'beklemede', m.durum) },
      { ad: 'islem', etiket: '', govde: (m) => (Number(m.fark_minor) && m.durum === 'taslak'
        ? h`<form method="post" action="/kartlar/mutabakat" style="display:inline">
            ${ham(csrfAlani(ctx))}<input type="hidden" name="_eylem" value="onaya_gonder">
            <input type="hidden" name="mutabakatId" value="${m.id}">
            <button class="btn btn-ghost btn-sm" type="submit">Farkı onaya gönder</button></form>`
        : '') },
    ],
  })}`,
    veriZamani: simdi(),
  })}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

function mutabakatIslemi(ctx, govde) {
  if (govde._eylem === 'kaydet') {
    const hesapId = govde.hesapId;
    const donem = govde.donem;
    if (!hesapId || !YK.donemGecerliMi(donem)) {
      throw DogrulamaHatasi('Hesap ve dönem gereklidir.', { alanlar: { donem: ['Dönem "YYYY-AA" olmalı.'] } });
    }
    const hesap = tek('SELECT * FROM saglayici_hesabi WHERE id = ? AND tenant_id = ?', hesapId, ctx.tenant.id);
    if (!hesap) throw Bulunamadi('Hesap bulunamadı.');

    const say = (x) => (String(x ?? '').trim() === '' ? null
      : Number(Para.ayristir(String(x), hesap.para_birimi).minor));
    const saglayiciToplam = say(govde.saglayiciToplam);
    const bankaToplam = say(govde.bankaToplam);
    const hesaplama = YK.mutabakatHesapla(ctx.tenant.id, hesapId, donem, { saglayiciToplam, bankaToplam });
    const aciklama = String(govde.aciklama || '').trim() || null;
    if (hesaplama.farkMinor !== 0 && !aciklama) {
      throw DogrulamaHatasi(
        `Fark ${para(hesaplama.farkMinor, hesap.para_birimi)}. Fark sıfır değilse açıklama zorunludur.`,
        { alanlar: { aciklama: ['Farkın nedenini yazın.'] } });
    }

    return islem(() => {
      const mevcut = tek('SELECT * FROM kart_mutabakati WHERE hesap_id = ? AND donem = ?', hesapId, donem);
      if (mevcut && mevcut.durum === 'onaylandi') {
        throw GecisIzinsiz('Onaylı mutabakat yerinde değişmez; yeni dönem kaydı açın (kural 6).');
      }
      if (mevcut) {
        calistir(`UPDATE kart_mutabakati SET ic_toplam_minor = ?, saglayici_toplam_minor = ?,
                    banka_toplam_minor = ?, fark_minor = ?, aciklama = ?, veri_tarihi = ?,
                    guncelleyen = ?, guncellendi = ? WHERE id = ?`,
          String(hesaplama.icToplam), saglayiciToplam == null ? null : String(saglayiciToplam),
          bankaToplam == null ? null : String(bankaToplam), String(hesaplama.farkMinor),
          aciklama, hesaplama.veriTarihi, ctx.kullanici.id, simdi(), mevcut.id);
        audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
          nesne: 'kart_mutabakati', nesneId: mevcut.id, eylem: 'guncelle',
          sonraki: { ic: String(hesaplama.icToplam), fark: String(hesaplama.farkMinor) } });
      } else {
        const kod = sonrakiKod(ctx.tenant.id, 'kart_mutabakati');
        const id = kimlik('mutabakat');
        calistir(`INSERT INTO kart_mutabakati (id, tenant_id, hesap_id, kod, donem, ic_toplam_minor,
                    saglayici_toplam_minor, banka_toplam_minor, fark_minor, tutar_birim, aciklama,
                    veri_tarihi, durum, olusturan, olusturuldu)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'taslak', ?,?)`,
          id, ctx.tenant.id, hesapId, kod, donem, String(hesaplama.icToplam),
          saglayiciToplam == null ? null : String(saglayiciToplam),
          bankaToplam == null ? null : String(bankaToplam), String(hesaplama.farkMinor),
          hesap.para_birimi, aciklama, hesaplama.veriTarihi, ctx.kullanici.id, simdi());
        audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
          nesne: 'kart_mutabakati', nesneId: id, eylem: 'olustur',
          sonraki: { kod, donem, fark: String(hesaplama.farkMinor) } });
      }
      return hesaplama.farkMinor === 0
        ? 'Mutabakat kaydedildi — üç kaynak mutabık'
        : `Mutabakat kaydedildi — ${para(hesaplama.farkMinor, hesap.para_birimi)} fark açıklamayla onaya gitmeli`;
    });
  }

  if (govde._eylem === 'onaya_gonder') {
    const m = tek('SELECT * FROM kart_mutabakati WHERE id = ? AND tenant_id = ?',
      govde.mutabakatId, ctx.tenant.id);
    if (!m) throw Bulunamadi('Mutabakat bulunamadı.');
    if (!m.aciklama) throw DogrulamaHatasi('Farkın açıklaması olmadan onaya gönderilemez.');
    return islem(() => {
      onayMotoru.onayaGonder(ctx, {
        nesne: 'kart_mutabakati', nesneId: m.id, nesneKod: m.kod,
        baslik: `Kart mutabakat farkı: ${m.donem} (${para(m.fark_minor, m.tutar_birim)})`,
        belgeSurum: m.surum, tutarMinor: Math.abs(Number(m.fark_minor)), tutarBirim: m.tutar_birim,
        gerekce: m.aciklama,
      });
      calistir(`UPDATE kart_mutabakati SET durum = 'onaya_gonderildi', guncelleyen = ?, guncellendi = ?
                 WHERE id = ?`, ctx.kullanici.id, simdi(), m.id);
      return 'Mutabakat farkı onaya gönderildi';
    });
  }

  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

/* ==========================================================================
   CRD-16 — kart onayları ve politika yönetimi
   ========================================================================== */
function onayEkrani(ctx, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('CRD-16');
  yetkiZorunlu(ctx, e.yetki);

  const talepler = sorgu(
    `SELECT t.*, a.ad AS adim_ad FROM onay_talebi t
       LEFT JOIN onay_adimi a ON a.talep_id = t.id AND a.durum = 'acik'
      WHERE t.tenant_id = ? AND t.nesne IN ('kart_yukleme','kart_politikasi','kart_mutabakati')
      ORDER BY t.olusturuldu DESC LIMIT 60`, ctx.tenant.id);

  const politikalar = sorgu(
    `SELECT p.*, u.ad AS urun_ad, u.kod AS urun_kod FROM kart_politikasi p
       JOIN kart_urunu u ON u.id = p.urun_id
      WHERE p.tenant_id = ? ORDER BY p.gecerli_baslangic DESC, p.surum_no DESC`, ctx.tenant.id);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Açık karar', deger: sayi(talepler.filter((t) => t.durum === 'acik').length),
        ikon: 'fa-circle-check' },
      { etiket: 'Yürürlükteki politika', ikon: 'fa-file-shield',
        deger: sayi(politikalar.filter((p) => p.durum === 'onaylandi').length) },
      { etiket: 'Onay bekleyen politika', ikon: 'fa-hourglass-half',
        deger: sayi(politikalar.filter((p) => ['taslak', 'onaya_gonderildi', 'incelemede'].includes(p.durum)).length) },
    ]),
    filtre: '',
    icerik: h`
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Kart kararları</b>
    <span>Yükleme, politika (limit) ve mutabakat farkı kararları — karar ekranı GLB-05'tir.</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: talepler,
    bosDurum: { baslik: 'Karar yok', ikon: 'fa-circle-check' },
    sutunlar: [
      { ad: 'nesne_kod', etiket: 'Belge',
        govde: (t) => h`<b>${t.nesne_kod}</b><br><span class="muted">${t.baslik}</span>` },
      { ad: 'nesne', etiket: 'Tür', govde: (t) => ({ kart_yukleme: 'Yükleme partisi',
        kart_politikasi: 'Politika', kart_mutabakati: 'Mutabakat' }[t.nesne] || t.nesne) },
      { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag',
        govde: (t) => (t.tutar_minor == null ? '—' : para(t.tutar_minor, t.tutar_birim)) },
      { ad: 'adim_ad', etiket: 'Bekleyen adım', govde: (t) => t.adim_ad || '—' },
      { ad: 'durum', etiket: 'Durum', govde: (t) => B.rozet(
        t.durum === 'onaylandi' ? 'onaylandi' : t.durum === 'reddedildi' ? 'reddedildi' : 'beklemede',
        t.durum) },
      { ad: 'ac', etiket: '', govde: (t) => (t.durum === 'acik'
        ? B.btn('Karar ver', { rota: `/onaylar/${t.id}`, kucuk: true }) : '') },
    ],
  })}</div>
</div>
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Kart politikaları</b>
    <span>Politika ETKİLİ TARİHLİ ve SÜRÜMLÜDÜR; tutar kodda sabit değildir (§6.2).</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: politikalar,
    bosDurum: { baslik: 'Politika yok', ikon: 'fa-file-shield',
      aciklama: 'Politika olmadan yükleme partisi açılamaz: tutar politikadan hesaplanır.' },
    sutunlar: [
      { ad: 'kod', etiket: 'Politika',
        govde: (p) => h`<b>${p.kod}</b> <span class="muted">v${p.surum_no}</span><br>
          <span class="muted">${p.ad}</span>` },
      { ad: 'urun_ad', etiket: 'Ürün', govde: (p) => `${p.urun_kod} — ${p.urun_ad}` },
      { ad: 'gecerli_baslangic', etiket: 'Yürürlük',
        govde: (p) => `${tarih(p.gecerli_baslangic)} → ${p.gecerli_bitis ? tarih(p.gecerli_bitis) : '—'}` },
      { ad: 'gun_kaynagi', etiket: 'Gün kaynağı' },
      { ad: 'gunluk_tutar_minor', etiket: 'Günlük', hizala: 'sag',
        govde: (p) => para(p.gunluk_tutar_minor, p.tutar_birim) },
      { ad: 'azami_tutar_minor', etiket: 'Üst sınır', hizala: 'sag',
        govde: (p) => (p.azami_tutar_minor ? para(p.azami_tutar_minor, p.tutar_birim) : '—') },
      { ad: 'durum', etiket: 'Durum', govde: (p) => B.rozet(
        p.durum === 'onaylandi' ? 'onaylandi' : p.durum === 'reddedildi' ? 'reddedildi' : 'beklemede',
        p.durum) },
      { ad: 'islem', etiket: '', govde: (p) => (p.durum === 'taslak' && yetkiVar(ctx, 'CRD-16:olustur')
        ? h`<form method="post" action="/kartlar/onaylar" style="display:inline">
            ${ham(csrfAlani(ctx))}<input type="hidden" name="_eylem" value="politika_onaya">
            <input type="hidden" name="politikaId" value="${p.id}">
            <button class="btn btn-ghost btn-sm" type="submit">Onaya gönder</button></form>`
        : '') },
    ],
  })}</div>
</div>
${yetkiVar(ctx, 'CRD-16:olustur') ? h`<div style="margin-top:22px">${B.form({
    rota: '/kartlar/onaylar', csrf: csrfAlani(ctx), idempotencyAnahtari: kimlik('idempotency'),
    hatalar: hata,
    bolumler: [{ baslik: 'Yeni kart politikası',
      aciklama: 'Politika yürürlük tarihiyle ve sürümüyle saklanır. Geçmiş partiler kendi '
        + 'politika sürümlerini taşır; politika değişince geçmiş etkilenmez.',
      alanlar: h`
        <input type="hidden" name="_eylem" value="politika_ac">
        ${B.alan({ ad: 'urunId', etiket: 'Ürün', zorunlu: true,
        secenekler: [{ deger: '', etiket: 'Seçin…' }, ...urunSecenekleri(ctx)] })}
        ${B.alan({ ad: 'ad', etiket: 'Politika adı', zorunlu: true, genis: true })}
        ${B.alan({ ad: 'gecerliBaslangic', etiket: 'Yürürlük başlangıcı', tur: 'date', zorunlu: true,
        deger: gunAnahtari(simdi()) })}
        ${B.alan({ ad: 'gecerliBitis', etiket: 'Yürürlük bitişi (boşsa süresiz)', tur: 'date' })}
        ${B.alan({ ad: 'gunKaynagi', etiket: 'Gün kaynağı', deger: 'puantaj',
        secenekler: [
          { deger: 'puantaj', etiket: 'Puantaj (kilitli günler)' },
          { deger: 'sabit', etiket: 'Sabit gün' },
          { deger: 'takvim', etiket: 'Takvim günü' }] })}
        ${B.alan({ ad: 'sabitGun', etiket: 'Sabit gün sayısı', tur: 'number',
        ipucu: 'Yalnız "sabit" gün kaynağında kullanılır.' })}
        ${B.alan({ ad: 'gunlukTutar', etiket: 'Günlük tutar', zorunlu: true,
        ipucu: 'Vergi istisnası tutarı kodda sabit değildir; buradan yönetilir (§6.2).' })}
        ${B.alan({ ad: 'azamiTutar', etiket: 'Dönem üst sınırı (boşsa sınırsız)' })}
        ${B.alan({ ad: 'ucretsizIzinHaric', etiket: 'Ücretsiz izin düşülsün mü', deger: '1',
        secenekler: [{ deger: '1', etiket: 'Evet' }, { deger: '0', etiket: 'Hayır' }] })}
        ${B.alan({ ad: 'ayrilanHaric', etiket: 'Ayrılan personel hariç mi', deger: '1',
        secenekler: [{ deger: '1', etiket: 'Evet' }, { deger: '0', etiket: 'Hayır' }] })}` }],
    eylemler: B.btn('Politikayı taslak aç', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  })}</div>` : ''}`,
    veriZamani: simdi(),
  })}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

function politikaIslemi(ctx, govde) {
  if (govde._eylem === 'politika_ac') {
    const urun = tek('SELECT * FROM kart_urunu WHERE id = ? AND tenant_id = ?', govde.urunId, ctx.tenant.id);
    if (!urun) throw DogrulamaHatasi('Ürün seçilmedi.', { alanlar: { urunId: ['Ürün seçin.'] } });
    const ad = String(govde.ad || '').trim();
    if (!ad) throw DogrulamaHatasi('Politika adı zorunludur.', { alanlar: { ad: ['Ad girin.'] } });
    if (!govde.gecerliBaslangic) {
      throw DogrulamaHatasi('Yürürlük başlangıcı zorunludur.',
        { alanlar: { gecerliBaslangic: ['Tarih girin.'] } });
    }
    const gunluk = Para.ayristir(govde.gunlukTutar || '', urun.para_birimi);
    if (gunluk.minor <= 0n) {
      throw DogrulamaHatasi('Günlük tutar sıfırdan büyük olmalı.',
        { alanlar: { gunlukTutar: ['Tutar girin.'] } });
    }
    const azami = String(govde.azamiTutar || '').trim()
      ? Para.ayristir(govde.azamiTutar, urun.para_birimi).minor : null;
    const gunKaynagi = ['puantaj', 'sabit', 'takvim'].includes(govde.gunKaynagi) ? govde.gunKaynagi : 'puantaj';
    const sabitGun = govde.sabitGun ? Number(govde.sabitGun) : null;
    if (gunKaynagi === 'sabit' && (!Number.isInteger(sabitGun) || sabitGun <= 0)) {
      throw DogrulamaHatasi('"Sabit" gün kaynağında sabit gün sayısı zorunludur.',
        { alanlar: { sabitGun: ['Gün sayısı girin.'] } });
    }

    return islem(() => {
      /* Aynı ürün için önceki sürümü bul: sürüm numarası artar (K-089). */
      const onceki = tek(
        `SELECT * FROM kart_politikasi WHERE tenant_id = ? AND urun_id = ?
          ORDER BY surum_no DESC LIMIT 1`, ctx.tenant.id, urun.id);
      const kod = onceki ? onceki.kod : sonrakiKod(ctx.tenant.id, 'kart_politikasi');
      const id = kimlik('politika');
      calistir(`INSERT INTO kart_politikasi (id, tenant_id, urun_id, kod, ad, gecerli_baslangic,
                  gecerli_bitis, gun_kaynagi, gunluk_tutar_minor, sabit_gun, azami_tutar_minor,
                  tutar_birim, ucretsiz_izin_haric, ayrilan_haric, surum_no, onceki_surum_id,
                  durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'taslak', ?,?)`,
        id, ctx.tenant.id, urun.id, kod, ad, gunBaslangici(govde.gecerliBaslangic),
        govde.gecerliBitis ? gunBaslangici(govde.gecerliBitis) : null,
        gunKaynagi, String(gunluk.minor), sabitGun, azami == null ? null : String(azami),
        urun.para_birimi, govde.ucretsizIzinHaric === '0' ? 0 : 1,
        govde.ayrilanHaric === '0' ? 0 : 1,
        (onceki?.surum_no || 0) + 1, onceki?.id || null, ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'kart_politikasi', nesneId: id, eylem: 'olustur',
        sonraki: { kod, surum: (onceki?.surum_no || 0) + 1, gunluk: String(gunluk.minor) } });
      return `${kod} politikası v${(onceki?.surum_no || 0) + 1} taslak olarak açıldı`;
    });
  }

  if (govde._eylem === 'politika_onaya') {
    const p = tek('SELECT * FROM kart_politikasi WHERE id = ? AND tenant_id = ?',
      govde.politikaId, ctx.tenant.id);
    if (!p) throw Bulunamadi('Politika bulunamadı.');
    if (p.durum !== 'taslak') throw GecisIzinsiz('Yalnız taslak politika onaya gönderilir.');
    return islem(() => {
      onayMotoru.onayaGonder(ctx, {
        nesne: 'kart_politikasi', nesneId: p.id, nesneKod: p.kod,
        baslik: `Kart politikası: ${p.ad} (v${p.surum_no})`,
        belgeSurum: p.surum, tutarMinor: Number(p.gunluk_tutar_minor), tutarBirim: p.tutar_birim,
      });
      calistir(`UPDATE kart_politikasi SET durum = 'onaya_gonderildi', guncelleyen = ?, guncellendi = ?
                 WHERE id = ?`, ctx.kullanici.id, simdi(), p.id);
      return 'Politika onaya gönderildi';
    });
  }

  throw DogrulamaHatasi('Bilinmeyen işlem.');
}
