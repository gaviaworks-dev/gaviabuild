/* ============================================================================
   ENTEGRASYON KATALOĞU VE İZLEME — SET-13, SET-14, SET-15, SET-19, CRD-18
   ----------------------------------------------------------------------------
   OPS-01 kabul cümlesi: "Entegrasyon hatası İSTEK KİMLİĞİ, MASKELİ PAYLOAD,
   RETRY DURUMU ve YENİDEN OYNATMA YETKİSİYLE izlenir."

   İki kural bu ekranların şeklini belirler:

   1. GİZLİ BİLGİ EKRANDA DA YOKTUR. Veritabanında yalnız vault referansı
      (ortam değişkeni adı) ve webhook sırrının ÖZETİ durur; ekran da bunları
      gösterir — sırrın kendisini değil.
   2. İŞ KURALI REDDİ YENİDEN OYNATILAMAZ. Yeniden oynatma yalnız teknik
      hatalar içindir; iş kuralı reddini tekrar etmek aynı reddi üretir ve
      operatörü yanıltır.
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, tarihSaat, GUN_MS } from '../cekirdek/zaman.mjs';
import { DogrulamaHatasi, GecisIzinsiz, Bulunamadi, Cakisma, UygulamaHatasi } from '../cekirdek/hata.mjs';
import { idempotent } from '../cekirdek/idempotency.mjs';
import { tokenOzeti } from '../cekirdek/kimlikler.mjs';
import * as A from '../moduller/kartlar/adaptor.mjs';
import { sayac, gecmisKarti } from './kayit-modulu.mjs';
import { saglayiciSecenekleri } from './kartlar.mjs';
import {
  ekranNesnesi, hataNesnesi, kullaniciAdi, ciz, listeSorgusu, filtreKosullari,
  B, h, ham, sayi, csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar,
  sorgu, tek, calistir, islem, surumluGuncelle, audit, sonrakiKod,
} from './ortak.mjs';

const TURLER = [
  { deger: 'kart', etiket: 'Kart sağlayıcı' }, { deger: 'banka', etiket: 'Banka' },
  { deger: 'muhasebe', etiket: 'Muhasebe' }, { deger: 'eposta', etiket: 'E-posta' },
  { deger: 'sms', etiket: 'SMS' }, { deger: 'diger', etiket: 'Diğer' },
];
const OLAY_DURUMLARI = {
  bekliyor: 'Bekliyor', basarili: 'Başarılı', teknik_hata: 'Teknik hata',
  is_kurali_reddi: 'İş kuralı reddi', dlq: 'Ölü mektup (DLQ)', iptal: 'İptal',
};

const entegrasyonuAl = (ctx, id) => {
  const e = tek('SELECT * FROM entegrasyon WHERE id = ? AND tenant_id = ?', id, ctx.tenant.id);
  if (!e) throw Bulunamadi('Entegrasyon bulunamadı.');
  return e;
};

/** Ekranda gösterilecek sağlık özeti — SET-19 ve SET-14 aynı hesabı kullanır. */
export function saglikOzeti(ctx, ent) {
  const yap = A.yapilandirmaDurumu(ent);
  const son24 = simdi() - GUN_MS;
  const say = (kosul, ...p) => Number(tek(
    `SELECT COUNT(*) AS n FROM entegrasyon_olayi WHERE entegrasyon_id = ? AND zaman >= ? AND ${kosul}`,
    ent.id, son24, ...p)?.n ?? 0);
  return {
    yapilandirma: yap,
    basarili: say(`durum = 'basarili'`),
    teknik: say(`durum = 'teknik_hata'`),
    isKurali: say(`durum = 'is_kurali_reddi'`),
    dlq: say(`durum = 'dlq'`),
    bekleyen: say(`durum = 'bekliyor'`),
    devreAcik: A.devreAcikMi(ent),
  };
}

/* ==========================================================================
   ROTA KURULUMU
   ========================================================================== */
export function kur(y, ekranRota) {
  ekranRota(y, 'SET-13', { get: (ctx) => katalog(ctx, { kod: 'SET-13' }) });
  ekranRota(y, 'CRD-18', {
    get: (ctx) => katalog(ctx, { kod: 'CRD-18', tur: 'kart' }),
    post: (ctx, govde) => {
      const e = ekranNesnesi('CRD-18');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const sonuc = idempotent(
          { anahtar: govde._idempotency, tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, govde },
          () => entegrasyonAc(ctx, govde));
        return yonlendir(ctx, `/ayarlar/entegrasyonlar/${sonuc.id}?olusan=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return katalog(ctx, { kod: 'CRD-18', tur: 'kart', deger: govde,
          hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  ekranRota(y, 'SET-14', {
    get: (ctx, _g, p) => entegrasyonDetayi(ctx, p.id),
    post: (ctx, govde, p) => {
      const e = ekranNesnesi('SET-14');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      csrfZorunlu(ctx, govde);
      const ent = entegrasyonuAl(ctx, p.id);
      try {
        const mesaj = entegrasyonIslemi(ctx, ent, govde);
        return yonlendir(ctx, `/ayarlar/entegrasyonlar/${ent.id}?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return entegrasyonDetayi(ctx, p.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  ekranRota(y, 'SET-15', {
    get: (ctx) => olayGunlugu(ctx),
    post: async (ctx, govde) => {
      const e = ekranNesnesi('SET-15');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = await olayIslemi(ctx, govde);
        return yonlendir(ctx, `/ayarlar/entegrasyon-loglari?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return olayGunlugu(ctx, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  ekranRota(y, 'SET-19', { get: (ctx) => sistemSagligi(ctx) });
}

/* ==========================================================================
   SET-13 / CRD-18 — entegrasyon kataloğu
   ========================================================================== */
function katalog(ctx, { kod, tur = null, deger = {}, hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi(kod);
  yetkiZorunlu(ctx, e.yetki);
  const { kosullar, parametreler } = filtreKosullari(ctx, {
    aramaAlanlari: ['kod', 'ad'],
    filtreler: [{ ad: 'durum' }, ...(tur ? [] : [{ ad: 'tur' }])],
  });
  if (tur) { kosullar.push('tur = ?'); parametreler.push(tur); }
  const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
    { tablo: 'entegrasyon', kosullar, parametreler, sirala: 'kod' });
  const zengin = satirlar.map((x) => ({ ...x, saglik: saglikOzeti(ctx, x) }));

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('olusturuldu') ? B.sonucSeridi({ tur: 'ok', baslik: 'Entegrasyon kaydedildi' }) : ''}
${tur === 'kart' ? B.sonucSeridi({ tur: 'ok', baslik: 'Kart sağlayıcı entegrasyonları',
    aciklama: 'Bu ekran entegrasyon kataloğunun kart filtreli görünümüdür; ayrı bir kayıt tutulmaz '
      + '(kural 4). Sağlayıcı eklemek adaptör kaydetmektir, if/else eklemek değil (§6.1).' }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Entegrasyon', deger: sayi(toplam), ikon: 'fa-plug' },
      { etiket: 'Devre kesici açık', ikon: 'fa-bolt',
        deger: sayi(zengin.filter((x) => x.saglik.devreAcik).length),
        ton: zengin.some((x) => x.saglik.devreAcik) ? 'danger' : '' },
      { etiket: 'Yapılandırma eksik', ikon: 'fa-triangle-exclamation',
        deger: sayi(zengin.filter((x) => !x.saglik.yapilandirma.tamam).length),
        ton: zengin.some((x) => !x.saglik.yapilandirma.tamam) ? 'warn' : '' },
      { etiket: 'DLQ (24s)', ikon: 'fa-inbox',
        deger: sayi(zengin.reduce((t, x) => t + x.saglik.dlq, 0)),
        ton: zengin.some((x) => x.saglik.dlq) ? 'danger' : '' },
    ]),
    filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Kod veya ad…',
      filtreler: [
        ...(tur ? [] : [{ ad: 'tur', etiket: 'Tür', secenekler: TURLER }]),
        { ad: 'durum', etiket: 'Durum',
          secenekler: ['aktif', 'pasif', 'bakimda'].map((d) => ({ deger: d, etiket: d })) },
      ] }),
    icerik: B.tablo({
      satirlar: zengin,
      satirRota: (x) => `/ayarlar/entegrasyonlar/${x.id}`,
      bosDurum: { baslik: 'Entegrasyon yok', ikon: 'fa-plug',
        aciklama: 'Entegrasyon tanımlanmadan sağlayıcı hesapları kontrollü dosya akışı kullanır (§6.6).' },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod', govde: (x) => h`<b>${x.kod}</b><br><span class="muted">${x.ad}</span>` },
        { ad: 'tur', etiket: 'Tür', govde: (x) => TURLER.find((t) => t.deger === x.tur)?.etiket || x.tur },
        { ad: 'adaptor', etiket: 'Adaptör', govde: (x) => (x.adaptor === 'dosya'
          ? B.isaret('kontrollü dosya', 'info') : B.isaret(x.adaptor, 'ok')) },
        { ad: 'yapilandirma', etiket: 'Yapılandırma', govde: (x) => (x.saglik.yapilandirma.tamam
          ? B.isaret('tamam', 'ok')
          : B.isaret(`eksik: ${x.saglik.yapilandirma.eksik.join(', ')}`, 'warn')) },
        { ad: 'devre', etiket: 'Devre kesici', govde: (x) => (x.saglik.devreAcik
          ? B.isaret(`açık (${x.ardisik_hata} ardışık hata)`, 'danger')
          : B.isaret('kapalı', 'ok')) },
        { ad: 'olay', etiket: 'Son 24s', govde: (x) => h`${B.isaret(`${x.saglik.basarili} ok`, 'ok')}${
          x.saglik.teknik ? B.isaret(`${x.saglik.teknik} teknik`, 'warn') : ''}${
          x.saglik.isKurali ? B.isaret(`${x.saglik.isKurali} red`, 'danger') : ''}` },
        { ad: 'durum', etiket: 'Durum', govde: (x) => B.rozet(
          x.durum === 'aktif' ? 'onaylandi' : 'beklemede', x.durum) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${kod === 'CRD-18' && yetkiVar(ctx, 'CRD-18:olustur') ? h`<div style="margin-top:22px">${B.form({
    rota: '/ayarlar/entegrasyonlar/kartlar', csrf: csrfAlani(ctx),
    idempotencyAnahtari: kimlik('idempotency'), hatalar: hata,
    bolumler: [{ baslik: 'Yeni kart sağlayıcı entegrasyonu',
      aciklama: 'GİZLİ BİLGİ BURADA SAKLANMAZ: kimlik referansı bir ORTAM DEĞİŞKENİ ADIDIR, '
        + 'değeri yalnız çalışma anında çözülür. Webhook sırrının da yalnız ÖZETİ saklanır.',
      alanlar: h`
        ${B.alan({ ad: 'ad', etiket: 'Entegrasyon adı', zorunlu: true, genis: true,
        deger: deger.ad || '', hata: hata?.alanlar?.ad })}
        ${B.alan({ ad: 'saglayiciId', etiket: 'Kart sağlayıcı', zorunlu: true,
        deger: deger.saglayiciId || '', hata: hata?.alanlar?.saglayiciId,
        secenekler: [{ deger: '', etiket: 'Seçin…' }, ...saglayiciSecenekleri(ctx)] })}
        ${B.alan({ ad: 'adaptor', etiket: 'Adaptör', deger: deger.adaptor || 'http',
        ipucu: 'Adaptör yeteneği belirler; desteklenmeyen yetenekte dosya akışına düşülür.',
        secenekler: A.adaptorListesi().map((a) => ({ deger: a.kod,
          etiket: `${a.ad} (${a.yetenekler.length} yetenek)` })) })}
        ${B.alan({ ad: 'tabanUrl', etiket: 'Taban adres', deger: deger.tabanUrl || '',
        ipucu: 'Örn. https://api.saglayici.example/v1' })}
        ${B.alan({ ad: 'kimlikReferansi', etiket: 'Kimlik referansı (ortam değişkeni adı)',
        deger: deger.kimlikReferansi || '', ipucu: 'Örn. PLUXEE_API_ANAHTARI — DEĞERİ değil ADI.' })}
        ${B.alan({ ad: 'webhookSirri', etiket: 'Webhook sırrı', deger: '',
        ipucu: 'Yalnız SHA-256 özeti saklanır; açık değer bir daha gösterilmez.' })}` }],
    eylemler: B.btn('Entegrasyonu kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  })}</div>` : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

function entegrasyonAc(ctx, govde) {
  const ad = String(govde.ad || '').trim();
  if (!ad) throw DogrulamaHatasi('Entegrasyon adı zorunludur.', { alanlar: { ad: ['Ad girin.'] } });
  const s = govde.saglayiciId
    ? tek('SELECT * FROM kart_saglayici WHERE id = ? AND tenant_id = ?', govde.saglayiciId, ctx.tenant.id)
    : null;
  if (!s) {
    throw DogrulamaHatasi('Kart sağlayıcı seçilmedi.', { alanlar: { saglayiciId: ['Sağlayıcı seçin.'] } });
  }
  const adaptor = A.adaptorListesi().some((a) => a.kod === govde.adaptor) ? govde.adaptor : 'dosya';
  if (govde.tabanUrl && !/^https:\/\//i.test(String(govde.tabanUrl).trim())) {
    throw DogrulamaHatasi('Taban adres HTTPS olmalıdır.',
      { alanlar: { tabanUrl: ['Yalnız https:// adres kabul edilir.'] } });
  }
  return islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'entegrasyon');
    const id = kimlik('entegrasyon');
    calistir(`INSERT INTO entegrasyon (id, tenant_id, kod, ad, tur, saglayici_id, adaptor, taban_url,
                kimlik_referansi, webhook_sirri_ozeti, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?, 'kart', ?,?,?,?,?, 'aktif', ?,?)`,
      id, ctx.tenant.id, kod, ad, s.id, adaptor,
      String(govde.tabanUrl || '').trim() || null,
      String(govde.kimlikReferansi || '').trim() || null,
      /* SIR AÇIK SAKLANMAZ: yalnız SHA-256 özeti (K-008 kalıbı). */
      govde.webhookSirri ? tokenOzeti(String(govde.webhookSirri)) : null,
      ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'entegrasyon', nesneId: id, eylem: 'olustur',
      /* Audit'e de sır yazılmaz — yalnız hangi alanların DOLDURULDUĞU. */
      sonraki: { kod, ad, adaptor, saglayici: s.kod,
        kimlikReferansiVar: !!govde.kimlikReferansi, webhookSirriVar: !!govde.webhookSirri } });
    return { id, kod };
  });
}

/* ==========================================================================
   SET-14 — entegrasyon detayı
   ========================================================================== */
function entegrasyonDetayi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('SET-14');
  yetkiZorunlu(ctx, e.yetki);
  const ent = entegrasyonuAl(ctx, id);
  const saglik = saglikOzeti(ctx, ent);
  const adaptor = A.adaptor(ent.adaptor);
  const olaylar = sorgu(
    `SELECT * FROM entegrasyon_olayi WHERE entegrasyon_id = ? ORDER BY zaman DESC LIMIT 30`, ent.id);
  const hesaplar = sorgu(
    `SELECT h.kod, h.ad FROM saglayici_hesabi h WHERE h.entegrasyon_id = ?`, ent.id);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: 'Entegrasyon oluşturuldu' }) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${!saglik.yapilandirma.tamam ? B.sonucSeridi({ tur: 'warn', baslik: 'Yapılandırma eksik',
    aciklama: `Eksik: ${saglik.yapilandirma.eksik.join(', ')}. Eksik yapılandırmayla yapılan çağrı `
      + 'SAHTE BAŞARI üretmez; teknik sınıfta yapılandırma hatası döner (kural 3).' }) : ''}
${saglik.devreAcik ? B.sonucSeridi({ tur: 'warn', baslik: 'Devre kesici AÇIK',
    aciklama: `${ent.ardisik_hata} ardışık teknik hata sonrası devre açıldı; bekleme süresi dolmadan `
      + 'yeni çağrı yapılmaz. Son hata: ' + (ent.son_hata || '—') }) : ''}
${B.detayOzetSeridi({
    kod: ent.kod, baslik: ent.ad, durum: ent.durum, surum: ent.surum,
    bilgiler: [
      { etiket: 'Tür', deger: TURLER.find((t) => t.deger === ent.tur)?.etiket || ent.tur },
      { etiket: 'Adaptör', deger: `${adaptor.ad} (${adaptor.yetenekler.length} yetenek)` },
      { etiket: 'Eşleme sürümü', deger: ent.esleme_surumu },
      { etiket: 'Son başarı', deger: ent.son_basari_zamani ? tarihSaat(ent.son_basari_zamani) : '—' },
      { etiket: 'Bağlı hesap', deger: `${hesaplar.length}` },
    ],
  })}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Adaptör yetenekleri</b>
        <span>Desteklenmeyen yetenekte sistem kontrollü dosya akışına düşer (§6.6).</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: A.YETENEKLER.map((y) => ({ kod: y, ad: A.YETENEK_ETIKETI[y],
      var: A.yetenekli(ent.adaptor, y) })),
    bosDurum: { baslik: 'Yetenek yok' },
    sutunlar: [
      { ad: 'ad', etiket: 'Yetenek' },
      { ad: 'var', etiket: 'Durum', govde: (r) => (r.var
        ? B.isaret('destekleniyor', 'ok') : B.isaret('dosya akışına düşer', 'info')) },
    ],
  })}</div>
    </div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Son olaylar</b>
        <span>İstek kimliği, maskeli payload ve retry durumu (OPS-01).</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: olaylar,
    bosDurum: { baslik: 'Olay yok' },
    sutunlar: [
      { ad: 'zaman', etiket: 'Zaman', govde: (o) => tarihSaat(o.zaman) },
      { ad: 'islem', etiket: 'İşlem' },
      { ad: 'durum', etiket: 'Sonuç', govde: (o) => B.rozet(
        o.durum === 'basarili' ? 'onaylandi'
          : ['is_kurali_reddi', 'dlq'].includes(o.durum) ? 'reddedildi' : 'beklemede',
        OLAY_DURUMLARI[o.durum] || o.durum) },
      { ad: 'hata_sinifi', etiket: 'Sınıf', govde: (o) => (o.hata_sinifi
        ? B.isaret(o.hata_sinifi === 'teknik' ? 'teknik (tekrar edilebilir)' : 'iş kuralı (tekrar EDİLEMEZ)',
          o.hata_sinifi === 'teknik' ? 'warn' : 'danger') : '—') },
      { ad: 'istek_kimligi', etiket: 'İstek kimliği',
        govde: (o) => h`<span class="muted">${(o.istek_kimligi || '—').slice(0, 16)}</span>` },
    ],
  })}</div>
      <div class="gc-body"><a href="/ayarlar/entegrasyon-loglari?entegrasyon_id=${ent.id}">
        Tüm olay günlüğünü aç →</a></div>
    </div>
    ${gecmisKarti('entegrasyon', ent)}
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Yapılandırma</b>
        <span>Sır burada YOK: yalnız referans ve özet.</span></div></div>
      <div class="gc-body">
        <dl class="gd-grid">
          <div><dt>Taban adres</dt><dd>${ent.taban_url || '—'}</dd></div>
          <div><dt>Kimlik referansı</dt><dd>${ent.kimlik_referansi || '—'}</dd></div>
          <div><dt>Kimlik değeri çözüldü mü</dt>
            <dd>${A.sirCoz(ent) ? B.isaret('evet', 'ok') : B.isaret('hayır', 'warn')}</dd></div>
          <div><dt>Webhook sırrı</dt>
            <dd>${ent.webhook_sirri_ozeti
    ? h`<span class="muted" title="Yalnız SHA-256 özeti saklanır">özet: ${
      ent.webhook_sirri_ozeti.slice(0, 12)}…</span>` : '—'}</dd></div>
        </dl>
        <form method="post" action="/ayarlar/entegrasyonlar/${ent.id}" data-gform="1" style="margin-top:14px">
          ${ham(csrfAlani(ctx))}
          <input type="hidden" name="_eylem" value="yapilandir">
          <input type="hidden" name="surum" value="${ent.surum}">
          ${B.alan({ ad: 'tabanUrl', etiket: 'Taban adres', deger: ent.taban_url || '' })}
          ${B.alan({ ad: 'kimlikReferansi', etiket: 'Kimlik referansı',
    deger: ent.kimlik_referansi || '' })}
          ${B.alan({ ad: 'webhookSirri', etiket: 'Yeni webhook sırrı (boşsa değişmez)' })}
          ${B.alan({ ad: 'eslemeSurumu', etiket: 'Eşleme sürümü', deger: ent.esleme_surumu })}
          <div style="margin-top:12px">${B.btn('Yapılandırmayı kaydet',
    { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' })}</div>
        </form>
      </div>
    </div>
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Devre kesici</b>
        <span>Ardışık ${A.DEVRE_ESIGI} teknik hatada açılır.</span></div></div>
      <div class="gc-body">
        <p class="gf-hint">Durum: <b>${ent.devre_kesici}</b> · ardışık hata: <b>${ent.ardisik_hata}</b>
          ${ent.son_hata ? h`<br>Son hata: ${ent.son_hata}` : ''}</p>
        ${ent.devre_kesici !== 'kapali' ? h`<form method="post"
          action="/ayarlar/entegrasyonlar/${ent.id}" data-gform="1">
          ${ham(csrfAlani(ctx))}
          <input type="hidden" name="_eylem" value="devre_sifirla">
          ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe', tur: 'metin', zorunlu: true })}
          <div style="margin-top:12px">${B.btn('Devreyi kapat (sıfırla)',
    { gonder: true, ikon: 'fa-bolt' })}</div>
        </form>` : B.isaret('devre kapalı — çağrılar açık', 'ok')}
      </div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: ent.kod }));
}

function entegrasyonIslemi(ctx, ent, govde) {
  if (govde._eylem === 'yapilandir') {
    if (govde.tabanUrl && !/^https:\/\//i.test(String(govde.tabanUrl).trim())) {
      throw DogrulamaHatasi('Taban adres HTTPS olmalıdır.',
        { alanlar: { tabanUrl: ['Yalnız https:// adres kabul edilir.'] } });
    }
    const alanlar = {
      taban_url: String(govde.tabanUrl || '').trim() || null,
      kimlik_referansi: String(govde.kimlikReferansi || '').trim() || null,
      esleme_surumu: String(govde.eslemeSurumu || 'v1').trim() || 'v1',
    };
    /* Yeni sır verilmediyse mevcut ÖZET korunur; sır hiçbir zaman geri okunmaz. */
    if (String(govde.webhookSirri || '').trim()) {
      alanlar.webhook_sirri_ozeti = tokenOzeti(String(govde.webhookSirri).trim());
    }
    return islem(() => {
      surumluGuncelle('entegrasyon', ent.id, Number(govde.surum), alanlar,
        { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'entegrasyon', nesneId: ent.id, eylem: 'yapilandir',
        onceki: { tabanUrl: ent.taban_url, kimlikReferansi: ent.kimlik_referansi },
        sonraki: { ...alanlar, webhook_sirri_ozeti: alanlar.webhook_sirri_ozeti ? 'degisti' : 'degismedi' } });
      return 'Yapılandırma kaydedildi';
    });
  }

  if (govde._eylem === 'devre_sifirla') {
    const gerekce = String(govde.gerekce || '').trim();
    if (!gerekce) throw DogrulamaHatasi('Gerekçe zorunludur.', { alanlar: { gerekce: ['Gerekçe girin.'] } });
    return islem(() => {
      calistir(`UPDATE entegrasyon SET devre_kesici = 'kapali', ardisik_hata = 0,
                  guncelleyen = ?, guncellendi = ? WHERE id = ?`, ctx.kullanici.id, simdi(), ent.id);
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'entegrasyon', nesneId: ent.id, eylem: 'devre_sifirla', gerekce,
        onceki: { devre: ent.devre_kesici, ardisik: ent.ardisik_hata } });
      return 'Devre kesici sıfırlandı';
    });
  }

  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

/* ==========================================================================
   SET-15 — entegrasyon işlem günlüğü (OPS-01)
   ========================================================================== */
function olayGunlugu(ctx, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('SET-15');
  yetkiZorunlu(ctx, e.yetki);
  const { kosullar, parametreler } = filtreKosullari(ctx, {
    aramaAlanlari: ['islem', 'istek_kimligi', 'hata_kodu'],
    filtreler: [{ ad: 'entegrasyon_id' }, { ad: 'durum' }, { ad: 'hata_sinifi' }, { ad: 'yon' }],
  });
  const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
    { tablo: 'entegrasyon_olayi', kosullar, parametreler, sirala: 'zaman DESC', kapsam: false });
  const secili = ctx.sorgu.get('olay')
    ? tek('SELECT * FROM entegrasyon_olayi WHERE id = ? AND tenant_id = ?',
      ctx.sorgu.get('olay'), ctx.tenant.id) : null;

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Olay', deger: sayi(toplam), ikon: 'fa-list' },
      { etiket: 'Teknik hata', ikon: 'fa-rotate',
        deger: sayi(sayac(ctx.tenant.id, 'entegrasyon_olayi', `durum = 'teknik_hata'`)), ton: 'warn' },
      { etiket: 'İş kuralı reddi', ikon: 'fa-ban',
        deger: sayi(sayac(ctx.tenant.id, 'entegrasyon_olayi', `durum = 'is_kurali_reddi'`)) },
      { etiket: 'DLQ', ikon: 'fa-inbox', ton: 'danger',
        deger: sayi(sayac(ctx.tenant.id, 'entegrasyon_olayi', `durum = 'dlq'`)) },
    ]),
    filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'İşlem, istek kimliği, hata kodu…',
      filtreler: [
        { ad: 'entegrasyon_id', etiket: 'Entegrasyon', secenekler: sorgu(
          'SELECT id, kod, ad FROM entegrasyon WHERE tenant_id = ? ORDER BY kod', ctx.tenant.id)
          .map((x) => ({ deger: x.id, etiket: `${x.kod} — ${x.ad}` })) },
        { ad: 'durum', etiket: 'Sonuç',
          secenekler: Object.entries(OLAY_DURUMLARI).map(([d, a]) => ({ deger: d, etiket: a })) },
        { ad: 'hata_sinifi', etiket: 'Hata sınıfı', secenekler: [
          { deger: 'teknik', etiket: 'Teknik (tekrar edilebilir)' },
          { deger: 'is_kurali', etiket: 'İş kuralı (tekrar edilemez)' }] },
        { ad: 'yon', etiket: 'Yön', secenekler: [
          { deger: 'giden', etiket: 'Giden' }, { deger: 'gelen', etiket: 'Gelen (webhook)' }] },
      ] }),
    icerik: h`
${secili ? h`<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Olay ayrıntısı — ${secili.islem}</b>
    <span>Payload MASKELİDİR: kart numarası, token ve sır alanları gizlenir.</span></div></div>
  <div class="gc-body">
    <dl class="gd-grid">
      <div><dt>İstek kimliği</dt><dd>${secili.istek_kimligi || '—'}</dd></div>
      <div><dt>Idempotency</dt><dd>${secili.idempotency_anahtari || '—'}</dd></div>
      <div><dt>Olay kimliği</dt><dd>${secili.olay_kimligi || '—'}</dd></div>
      <div><dt>HTTP</dt><dd>${secili.http_kodu ?? '—'}</dd></div>
      <div><dt>Deneme</dt><dd>${secili.deneme_sayisi} / ${A.AZAMI_DENEME}</dd></div>
      <div><dt>Sonraki deneme</dt>
        <dd>${secili.sonraki_deneme ? tarihSaat(secili.sonraki_deneme) : '—'}</dd></div>
    </dl>
    <div style="margin-top:14px">
      <b>İstek (maskeli)</b>
      <pre style="overflow:auto;max-height:220px;background:var(--gv-night,#141533);color:#E9EEF1;padding:12px;border-radius:8px"><code>${
    secili.maskeli_istek || '—'}</code></pre>
      <b>Yanıt (maskeli)</b>
      <pre style="overflow:auto;max-height:220px;background:var(--gv-night,#141533);color:#E9EEF1;padding:12px;border-radius:8px"><code>${
    secili.maskeli_yanit || '—'}</code></pre>
    </div>
    ${A.yenidenOynatilabilir(secili)
    ? B.sonucSeridi({ tur: 'warn', baslik: 'Yeniden oynatılamaz',
      aciklama: A.yenidenOynatilabilir(secili) })
    : h`<form method="post" action="/ayarlar/entegrasyon-loglari" data-gform="1">
        ${ham(csrfAlani(ctx))}
        <input type="hidden" name="_eylem" value="yeniden_oynat">
        <input type="hidden" name="olayId" value="${secili.id}">
        ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe', tur: 'metin', zorunlu: true })}
        <div style="margin-top:12px">${B.btn('Yeniden oynat',
      { tur: 'acc', gonder: true, ikon: 'fa-rotate' })}</div>
      </form>`}
  </div>
</div>` : ''}
${B.tablo({
    satirlar,
    bosDurum: { baslik: 'Olay yok', ikon: 'fa-list',
      aciklama: 'Her sağlayıcı çağrısı — başarılı olsun olmasın — burada iz bırakır (OPS-01).' },
    sutunlar: [
      { ad: 'zaman', etiket: 'Zaman', govde: (o) => tarihSaat(o.zaman) },
      { ad: 'yon', etiket: 'Yön', govde: (o) => (o.yon === 'gelen' ? 'Gelen' : 'Giden') },
      { ad: 'islem', etiket: 'İşlem',
        govde: (o) => h`<a href="/ayarlar/entegrasyon-loglari?olay=${o.id}"><b>${o.islem}</b></a>` },
      { ad: 'durum', etiket: 'Sonuç', govde: (o) => B.rozet(
        o.durum === 'basarili' ? 'onaylandi'
          : ['is_kurali_reddi', 'dlq'].includes(o.durum) ? 'reddedildi' : 'beklemede',
        OLAY_DURUMLARI[o.durum] || o.durum) },
      { ad: 'hata_sinifi', etiket: 'Sınıf', govde: (o) => (o.hata_sinifi
        ? B.isaret(o.hata_sinifi === 'teknik' ? 'teknik' : 'iş kuralı',
          o.hata_sinifi === 'teknik' ? 'warn' : 'danger') : '—') },
      { ad: 'hata_kodu', etiket: 'Kod', govde: (o) => o.hata_kodu || '—' },
      { ad: 'deneme_sayisi', etiket: 'Deneme', hizala: 'sag',
        govde: (o) => `${o.deneme_sayisi}/${A.AZAMI_DENEME}` },
      { ad: 'istek_kimligi', etiket: 'İstek kimliği',
        govde: (o) => h`<span class="muted">${(o.istek_kimligi || '—').slice(0, 16)}</span>` },
    ],
  })}`,
    sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

async function olayIslemi(ctx, govde) {
  if (govde._eylem !== 'yeniden_oynat') throw DogrulamaHatasi('Bilinmeyen işlem.');
  const gerekce = String(govde.gerekce || '').trim();
  if (!gerekce) throw DogrulamaHatasi('Gerekçe zorunludur.', { alanlar: { gerekce: ['Gerekçe girin.'] } });
  const o = tek('SELECT * FROM entegrasyon_olayi WHERE id = ? AND tenant_id = ?',
    govde.olayId, ctx.tenant.id);
  if (!o) throw Bulunamadi('Olay bulunamadı.');

  /* İŞ KURALI REDDİ YENİDEN OYNATILAMAZ — aynı reddi üretir. */
  const engel = A.yenidenOynatilabilir(o);
  if (engel) throw GecisIzinsiz(engel);

  const ent = o.entegrasyon_id ? tek('SELECT * FROM entegrasyon WHERE id = ?', o.entegrasyon_id) : null;
  if (o.deneme_sayisi >= A.AZAMI_DENEME) {
    islem(() => {
      A.olayGuncelle(o.id, { durum: 'dlq', hataSinifi: o.hata_sinifi, hataKodu: o.hata_kodu,
        denemeSayisi: o.deneme_sayisi, sonrakiDeneme: null });
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'entegrasyon_olayi', nesneId: o.id, eylem: 'dlq', gerekce,
        sonraki: { deneme: o.deneme_sayisi } });
    });
    throw GecisIzinsiz(
      `Tekrar hakkı doldu (${o.deneme_sayisi}/${A.AZAMI_DENEME}); olay ölü mektup kuyruğuna alındı. `
      + 'Kaynak kaydı düzeltip yeni bir gönderim açın.');
  }

  /* Yeniden oynatma GERÇEK çağrıdır: sonuç ne çıkarsa o yazılır. */
  const sonuc = await A.cagriYurut(ctx, {
    entegrasyon: ent, yetenek: o.islem,
    girdi: { yenidenOynatma: true, kaynakOlay: o.id },
    kaynakNesne: o.kaynak_nesne, kaynakId: o.kaynak_id,
    idempotencyAnahtari: o.idempotency_anahtari,
  });
  islem(() => {
    A.olayGuncelle(o.id, {
      durum: sonuc.durum === 'basarili' ? 'basarili'
        : sonuc.durum === 'reddedildi' ? 'is_kurali_reddi' : 'teknik_hata',
      hataSinifi: sonuc.hataSinifi, hataKodu: sonuc.kod,
      denemeSayisi: o.deneme_sayisi + 1,
      sonrakiDeneme: sonuc.durum === 'teknik_hata' ? A.sonrakiDenemeAni(o.deneme_sayisi + 1) : null,
    });
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'entegrasyon_olayi', nesneId: o.id, eylem: 'yeniden_oynat', gerekce,
      sonraki: { sonuc: sonuc.durum, kod: sonuc.kod, deneme: o.deneme_sayisi + 1 } });
  });
  return `Yeniden oynatıldı — sonuç: ${sonuc.durum} (${sonuc.kod || '—'})`;
}

/* ==========================================================================
   SET-19 — sistem sağlığı
   ========================================================================== */
function sistemSagligi(ctx) {
  const e = ekranNesnesi('SET-19');
  yetkiZorunlu(ctx, e.yetki);
  const t = ctx.tenant.id;
  const entegrasyonlar = sorgu('SELECT * FROM entegrasyon WHERE tenant_id = ? ORDER BY kod', t)
    .map((x) => ({ ...x, saglik: saglikOzeti(ctx, x) }));
  const dlq = A.dlq(t);
  const bekleyenTekrar = A.tekrarBekleyenler(t);

  /* Audit zinciri bütünlüğü — SET-16 ile aynı hesap, burada özet. */
  const auditSayisi = Number(tek('SELECT COUNT(*) AS n FROM denetim_izi WHERE tenant_id = ?', t)?.n ?? 0);
  const acikParti = Number(tek(
    `SELECT COUNT(*) AS n FROM kart_yukleme_partisi WHERE tenant_id = ?
       AND durum IN ('gonderiliyor','kismi')`, t)?.n ?? 0);
  const sonucsuzSatir = Number(tek(
    `SELECT COUNT(*) AS n FROM kart_yukleme_satiri s
       JOIN kart_yukleme_partisi p ON p.id = s.parti_id
      WHERE p.tenant_id = ? AND s.durum IN ('gonderildi','teknik_hata')`, t)?.n ?? 0);

  const icerik = h`
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Entegrasyon', deger: sayi(entegrasyonlar.length), ikon: 'fa-plug' },
      { etiket: 'Devre kesici açık', ikon: 'fa-bolt',
        deger: sayi(entegrasyonlar.filter((x) => x.saglik.devreAcik).length),
        ton: entegrasyonlar.some((x) => x.saglik.devreAcik) ? 'danger' : '' },
      { etiket: 'DLQ', deger: sayi(dlq.length), ikon: 'fa-inbox', ton: dlq.length ? 'danger' : '' },
      { etiket: 'Tekrar bekleyen', deger: sayi(bekleyenTekrar.length), ikon: 'fa-rotate',
        ton: bekleyenTekrar.length ? 'warn' : '' },
      { etiket: 'Sonuçsuz yükleme satırı', deger: sayi(sonucsuzSatir), ikon: 'fa-hourglass-half',
        ton: sonucsuzSatir ? 'warn' : '' },
      { etiket: 'Denetim kaydı', deger: sayi(auditSayisi), ikon: 'fa-clipboard-list' },
    ]),
    filtre: '',
    icerik: h`
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Entegrasyon sağlığı</b>
    <span>Teknik durum ve MASKELİ kimlik; sistem yöneticisi işlem onaylayamaz (§6.7).</span></div></div>
  <div class="gc-body flush">${B.tablo({
      satirlar: entegrasyonlar,
      bosDurum: { baslik: 'Entegrasyon yok', ikon: 'fa-plug' },
      sutunlar: [
        { ad: 'kod', etiket: 'Entegrasyon',
          govde: (x) => h`<a href="/ayarlar/entegrasyonlar/${x.id}"><b>${x.kod}</b></a>
            <br><span class="muted">${x.ad}</span>` },
        { ad: 'adaptor', etiket: 'Adaptör' },
        { ad: 'yapilandirma', etiket: 'Yapılandırma', govde: (x) => (x.saglik.yapilandirma.tamam
          ? B.isaret('tamam', 'ok') : B.isaret(x.saglik.yapilandirma.eksik.join(', '), 'warn')) },
        { ad: 'devre', etiket: 'Devre', govde: (x) => (x.saglik.devreAcik
          ? B.isaret('açık', 'danger') : B.isaret(x.devre_kesici, 'ok')) },
        { ad: 'son24', etiket: 'Son 24 saat',
          govde: (x) => h`${B.isaret(`${x.saglik.basarili} ok`, 'ok')}${
            x.saglik.teknik ? B.isaret(`${x.saglik.teknik} teknik`, 'warn') : ''}${
            x.saglik.isKurali ? B.isaret(`${x.saglik.isKurali} red`, 'danger') : ''}${
            x.saglik.dlq ? B.isaret(`${x.saglik.dlq} DLQ`, 'danger') : ''}` },
        { ad: 'son_hata', etiket: 'Son hata',
          govde: (x) => h`<span class="muted">${(x.son_hata || '—').slice(0, 60)}</span>` },
      ],
    })}</div>
</div>
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Ölü mektup kuyruğu (DLQ)</b>
    <span>Tekrar hakkı biten teknik hatalar buraya düşer; sessizce kaybolmaz.</span></div></div>
  <div class="gc-body flush">${B.tablo({
      satirlar: dlq,
      bosDurum: { baslik: 'Kuyruk boş', ikon: 'fa-inbox', aciklama: 'Tekrar hakkı biten olay yok.' },
      sutunlar: [
        { ad: 'zaman', etiket: 'Zaman', govde: (o) => tarihSaat(o.zaman) },
        { ad: 'entegrasyon_ad', etiket: 'Entegrasyon', govde: (o) => o.entegrasyon_ad || '—' },
        { ad: 'islem', etiket: 'İşlem' },
        { ad: 'hata_kodu', etiket: 'Kod', govde: (o) => o.hata_kodu || '—' },
        { ad: 'kaynak', etiket: 'Kaynak',
          govde: (o) => h`<span class="muted">${o.kaynak_nesne || '—'}</span>` },
        { ad: 'ac', etiket: '', govde: (o) => B.btn('Aç',
          { rota: `/ayarlar/entegrasyon-loglari?olay=${o.id}`, kucuk: true }) },
      ],
    })}</div>
</div>
${acikParti ? h`<div class="gv-card" style="margin-top:18px"><div class="gc-body">
  <p class="gf-hint" style="margin:0"><b>${acikParti} yükleme partisi</b> sonuç bekliyor.
    Zaman aşımı başarısızlık değildir; sonuç sorgulanmadan tekrar gönderim yapılmaz (§6.4 madde 6).
    <a href="/kartlar/yuklemeler?durum=gonderiliyor">Partileri aç →</a></p>
</div></div>` : ''}`,
    veriZamani: simdi(),
  })}`;
  return html(ctx, 200, ciz(ctx, e, icerik));
}
