/* ============================================================================
   DIŞ PORTALLAR VE SAHA MOBİL — EXT-04..08, HR-14, AST-11
   ----------------------------------------------------------------------------
   §12: "Tokenli, kapsamı DARALTILMIŞ dış erişim." PRC-05 tedarikçi teklif
   portalının kalıbı (K-069) burada üç portala genelleştirildi:

     · OTURUMSUZ — dış taraf uygulama hesabı açmaz
     · TOKEN AÇIK SAKLANMAZ — yalnız SHA-256 özeti tutulur
     · SÜRELİ — `token_bitis` geçince erişim kapanır
     · KAPSAM DARALTILMIŞ — token tek bir müşteri/tedarikçi ve tek bir
       proje/sözleşmeye bağlıdır; başka kayda erişemez
     · İÇ KABUK GÖSTERİLMEZ — rail, menü ve üst bar yok

   Mobil ekranlar SITE-01 çevrimdışı taslak kalıbını tekrar eder: istemci
   kimliği tekildir, ÇİFT GÖNDERİMDE TEK KAYIT oluşur.
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik, token as tokenUret, tokenOzeti } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, tarihSaat, gunAnahtari, GUN_MS } from '../cekirdek/zaman.mjs';
import { Para } from '../cekirdek/para.mjs';
import { DogrulamaHatasi, GecisIzinsiz, Bulunamadi, YetkiYok, UygulamaHatasi } from '../cekirdek/hata.mjs';
import { h, ham, sayi } from '../web/temel.mjs';
import * as B from '../web/bilesenler.mjs';
import * as kartDefteri from '../moduller/kartlar/defter.mjs';
import {
  ekranNesnesi, hataNesnesi, ciz, B as BB, csrfAlani, csrfZorunlu,
  yetkiZorunlu, yetkiVar, sorgu, tek, calistir, islem, surumluGuncelle, audit, sonrakiKod,
} from './ortak.mjs';

const para = (minor, birim = 'TRY') => (minor == null ? '—' : Para.minor(minor, birim || 'TRY').bicim());

/* ==========================================================================
   PORTAL KABUĞU — iç kabuk (rail/menü/üst bar) GÖSTERİLMEZ
   ========================================================================== */
function portalKabugu({ baslik, altBaslik, icerik, tenantAd }) {
  return `<!doctype html>
<html lang="tr"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow">
<title>${baslik} — [ÜRÜN ADI]</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/statik/css/tokens.css">
<link rel="stylesheet" href="/statik/css/ui.css">
<link rel="stylesheet" href="/statik/css/rapor.css">
<style>
  body { background: var(--gv-light, #E9EEF1); margin: 0; font-family: Manrope, system-ui, sans-serif; }
  .pt-kabuk { max-width: 1040px; margin: 0 auto; padding: 0 20px 48px; }
  .pt-ust { background: var(--gv-deep, #020837); color: #fff; padding: 26px 0 30px; margin-bottom: 26px; }
  .pt-ust .ic { max-width: 1040px; margin: 0 auto; padding: 0 20px; }
  .pt-eyebrow { font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
    color: var(--gv-mint, #3FD5AD); font-weight: 700; }
  .pt-ust h1 { margin: 6px 0 4px; font-size: 24px; font-weight: 800; }
  .pt-ust p { margin: 0; opacity: .78; font-size: 13.5px; }
  .pt-kart { background: #fff; border: 1px solid #dfe4ea; border-radius: 12px;
    padding: 20px 22px; margin-bottom: 18px; }
  .pt-kart h2 { margin: 0 0 4px; font-size: 15px; font-weight: 800; }
  .pt-kart .alt { margin: 0 0 14px; font-size: 12.5px; color: #6b7280; }
  .pt-not { font-size: 12px; color: #6b7280; margin-top: 22px; text-align: center; }
</style>
</head><body>
<header class="pt-ust"><div class="ic">
  <div class="pt-eyebrow">${tenantAd || '[ÜRÜN ADI]'}</div>
  <h1>${baslik}</h1><p>${altBaslik}</p>
</div></header>
<main class="pt-kabuk">${icerik}
  <p class="pt-not">Bu sayfa size özel, süreli bir bağlantıyla açılmıştır. Bağlantıyı paylaşmayın;
    erişiminiz kayıt altındadır.</p>
</main></body></html>`;
}

/* --- Token çözümü --------------------------------------------------------- */
/**
 * Açık tokeni erişim kaydına çevirir. Token AÇIK saklanmadığı için ÖZETİ
 * aranır. Süresi dolan veya kapatılan erişim 403 döner — sessizce çalışmaz.
 */
function erisimCoz(acikToken, beklenenTur) {
  const ozet = tokenOzeti(String(acikToken || ''));
  const e = tek(`SELECT * FROM portal_erisimi WHERE token_ozeti = ?`, ozet);
  if (!e) throw Bulunamadi('Bağlantı geçersiz.');
  if (e.tur !== beklenenTur) throw Bulunamadi('Bağlantı geçersiz.');
  if (e.durum !== 'aktif') throw YetkiYok('Bu bağlantı kapatılmış.');
  if (e.token_bitis < simdi()) {
    islem(() => calistir(`UPDATE portal_erisimi SET durum = 'suresi_doldu' WHERE id = ?`, e.id));
    throw YetkiYok('Bağlantının süresi doldu. Yeni bağlantı için ilgili kişiyle görüşün.');
  }
  islem(() => calistir(
    'UPDATE portal_erisimi SET son_erisim = ?, erisim_sayisi = erisim_sayisi + 1 WHERE id = ?',
    simdi(), e.id));
  return e;
}

/* ==========================================================================
   ROTA KURULUMU
   ========================================================================== */
export function kur(y, ekranRota) {
  /* --- EXT-04..06 dış portallar (iç yönetim ekranı + dış tokenli sayfa) --- */
  ekranRota(y, 'EXT-04', {
    get: (ctx) => portalYonetimi(ctx, 'EXT-04', 'musteri'),
    post: (ctx, govde) => portalYonetimIslemi(ctx, 'EXT-04', 'musteri', govde),
  });
  ekranRota(y, 'EXT-05', {
    get: (ctx) => portalYonetimi(ctx, 'EXT-05', 'taseron'),
    post: (ctx, govde) => portalYonetimIslemi(ctx, 'EXT-05', 'taseron', govde),
  });
  ekranRota(y, 'EXT-06', {
    get: (ctx) => portalYonetimi(ctx, 'EXT-06', 'tedarikci'),
    post: (ctx, govde) => portalYonetimIslemi(ctx, 'EXT-06', 'tedarikci', govde),
  });

  /* Dış taraf sayfaları — oturumsuz, tokenli. Manifestte `acik` DEĞİL, çünkü
     erişim tokenle doğrulanır; router bunları ayrı kaydeder. */
  y.get('/portal/musteri/:token', (ctx, _g, p) => disPortal(ctx, p.token, 'musteri'));
  y.get('/portal/taseron/:token', (ctx, _g, p) => disPortal(ctx, p.token, 'taseron'));
  y.get('/portal/tedarikci/:token', (ctx, _g, p) => disPortal(ctx, p.token, 'tedarikci'));

  /* --- EXT-07 saha mobil --- */
  ekranRota(y, 'EXT-07', {
    get: (ctx) => mobilAna(ctx),
    post: (ctx, govde) => {
      const e = ekranNesnesi('EXT-07');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = senkronIsle(ctx, govde);
        return yonlendir(ctx, `/mobil?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return mobilAna(ctx, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* --- EXT-08 kiosk --- */
  ekranRota(y, 'EXT-08', {
    get: (ctx) => kioskEkrani(ctx),
    post: (ctx, govde) => {
      const e = ekranNesnesi('EXT-08');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = kioskIslemi(ctx, govde);
        return yonlendir(ctx, `/kiosk?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return kioskEkrani(ctx, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* --- AST-11 QR/barkod --- */
  ekranRota(y, 'AST-11', { get: (ctx) => taramaEkrani(ctx) });

  /* --- HR-14 çalışan self-servis --- */
  ekranRota(y, 'HR-14', { get: (ctx) => selfServis(ctx) });
}

/* ==========================================================================
   EXT-04..06 — portal erişim yönetimi (iç ekran)
   ========================================================================== */
const PORTAL_BASLIK = {
  musteri: { ad: 'Müşteri portalı', hedef: 'musteri', hedefAd: 'Müşteri / işveren' },
  taseron: { ad: 'Taşeron portalı', hedef: 'tedarikci', hedefAd: 'Taşeron' },
  tedarikci: { ad: 'Tedarikçi portalı', hedef: 'tedarikci', hedefAd: 'Tedarikçi' },
};

function portalYonetimi(ctx, ekranKodu, tur, { hata = null, durum = 200, yeniBaglanti = null } = {}) {
  const e = ekranNesnesi(ekranKodu);
  yetkiZorunlu(ctx, e.yetki);
  const bilgi = PORTAL_BASLIK[tur];
  const erisimler = sorgu(
    `SELECT * FROM portal_erisimi WHERE tenant_id = ? AND tur = ? ORDER BY olusturuldu DESC`,
    ctx.tenant.id, tur);

  const hedefler = tur === 'musteri'
    ? sorgu(`SELECT id, kod, ad FROM musteri WHERE tenant_id = ? AND durum = 'aktif' ORDER BY ad`,
      ctx.tenant.id)
    /* Tedarikçi ünvanı `unvan` sütununda tutulur; ortak arayüz için `ad` takma adı. */
    : sorgu(`SELECT id, kod, unvan AS ad FROM tedarikci WHERE tenant_id = ? ORDER BY unvan`,
      ctx.tenant.id);

  const icerik = h`
${hata ? BB.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? BB.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${yeniBaglanti ? BB.sonucSeridi({ tur: 'warn', baslik: 'Bağlantı üretildi — BİR KEZ gösterilir',
    aciklama: `Açık token saklanmaz, yalnız özeti tutulur. Bu bağlantıyı şimdi iletin: ${yeniBaglanti}` }) : ''}
${BB.listeDuzeni({
    kpi: BB.kpiSeridi([
      { etiket: 'Aktif erişim', ikon: 'fa-link',
        deger: sayi(erisimler.filter((x) => x.durum === 'aktif' && x.token_bitis >= simdi()).length) },
      { etiket: 'Süresi dolan', ikon: 'fa-clock',
        deger: sayi(erisimler.filter((x) => x.token_bitis < simdi()).length) },
      { etiket: 'Kapatılan', ikon: 'fa-ban',
        deger: sayi(erisimler.filter((x) => x.durum === 'kapali').length) },
    ]),
    filtre: '',
    icerik: h`<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>${bilgi.ad} erişimleri</b>
    <span>Oturumsuz, süreli ve kapsamı daraltılmış tokenli erişim (§12). Token açık
      saklanmaz; yalnız SHA-256 özeti tutulur.</span></div></div>
  <div class="gc-body flush">${BB.tablo({
      satirlar: erisimler,
      bosDurum: { baslik: 'Erişim yok', ikon: 'fa-link',
        aciklama: 'Dış taraf uygulama hesabı açmaz; erişim yalnız süreli bağlantıyla verilir.' },
      sutunlar: [
        { ad: 'ad_soyad', etiket: 'Kişi', govde: (x) => h`<b>${x.ad_soyad || '—'}</b>
          <br><span class="muted">${x.eposta}</span>` },
        { ad: 'hedef', etiket: bilgi.hedefAd, govde: (x) => {
          const id = tur === 'musteri' ? x.musteri_id : x.tedarikci_id;
          if (!id) return '—';
          return tur === 'musteri'
            ? tek('SELECT ad FROM musteri WHERE id = ?', id)?.ad || '—'
            : tek('SELECT unvan FROM tedarikci WHERE id = ?', id)?.unvan || '—';
        } },
        { ad: 'kapsam', etiket: 'Kapsam', govde: (x) => (x.proje_id
          ? tek('SELECT kod FROM proje WHERE id = ?', x.proje_id)?.kod || '—'
          : h`<span class="muted">tüm kayıtları değil, yalnız kendi kayıtları</span>`) },
        { ad: 'token_bitis', etiket: 'Geçerlilik', govde: (x) => h`${tarih(x.token_bitis)}${
          x.token_bitis < simdi() ? BB.isaret('süresi doldu', 'danger') : ''}` },
        { ad: 'erisim_sayisi', etiket: 'Erişim', hizala: 'sag', govde: (x) => sayi(x.erisim_sayisi) },
        { ad: 'son_erisim', etiket: 'Son erişim',
          govde: (x) => (x.son_erisim ? tarihSaat(x.son_erisim) : '—') },
        { ad: 'durum', etiket: 'Durum', govde: (x) => BB.rozet(
          x.durum === 'aktif' ? 'onaylandi' : 'kapali', x.durum) },
        { ad: 'islem', etiket: '', govde: (x) => (x.durum === 'aktif' && yetkiVar(ctx, `${ekranKodu}:guncelle`)
          ? h`<form method="post" action="${e.rota}" style="display:inline">
              ${ham(csrfAlani(ctx))}<input type="hidden" name="_eylem" value="kapat">
              <input type="hidden" name="erisimId" value="${x.id}">
              <button class="btn btn-ghost btn-sm" type="submit">Kapat</button></form>` : '') },
      ],
    })}</div>
</div>
${yetkiVar(ctx, `${ekranKodu}:olustur`) ? h`<div style="margin-top:22px">${BB.form({
      rota: e.rota, csrf: csrfAlani(ctx), idempotencyAnahtari: kimlik('idempotency'), hatalar: hata,
      bolumler: [{ baslik: 'Yeni portal bağlantısı',
        aciklama: 'Bağlantı BİR KEZ gösterilir ve saklanmaz. Kapsam seçilen taraf ve projeyle '
          + 'sınırlıdır; dış taraf başka kaydı göremez.',
        alanlar: h`
        <input type="hidden" name="_eylem" value="ac">
        ${BB.alan({ ad: 'hedefId', etiket: bilgi.hedefAd, zorunlu: true,
          secenekler: [{ deger: '', etiket: 'Seçin…' },
            ...hedefler.map((x) => ({ deger: x.id, etiket: `${x.kod} — ${x.ad}` }))] })}
        ${BB.alan({ ad: 'adSoyad', etiket: 'Yetkili kişi' })}
        ${BB.alan({ ad: 'eposta', etiket: 'E-posta', zorunlu: true })}
        ${BB.alan({ ad: 'projeId', etiket: 'Proje kapsamı',
          secenekler: [{ deger: '', etiket: 'Tüm kendi kayıtları' }, ...sorgu(
            `SELECT id, kod, ad FROM proje WHERE tenant_id = ? ORDER BY kod`, ctx.tenant.id)
            .map((x) => ({ deger: x.id, etiket: `${x.kod} — ${x.ad}` }))] })}
        ${BB.alan({ ad: 'gun', etiket: 'Geçerlilik (gün)', tur: 'number', deger: '30' })}` }],
      eylemler: BB.btn('Bağlantı üret', { tur: 'acc', gonder: true, ikon: 'fa-link' }),
    })}</div>` : ''}`,
    veriZamani: simdi(),
  })}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

function portalYonetimIslemi(ctx, ekranKodu, tur, govde) {
  const e = ekranNesnesi(ekranKodu);
  csrfZorunlu(ctx, govde);
  try {
    if (govde._eylem === 'kapat') {
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      const x = tek('SELECT * FROM portal_erisimi WHERE id = ? AND tenant_id = ?',
        govde.erisimId, ctx.tenant.id);
      if (!x) throw Bulunamadi('Erişim bulunamadı.');
      islem(() => {
        calistir(`UPDATE portal_erisimi SET durum = 'kapali', guncelleyen = ?, guncellendi = ?
                   WHERE id = ?`, ctx.kullanici.id, simdi(), x.id);
        audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId,
          ip: ctx.ip, nesne: 'portal_erisimi', nesneId: x.id, eylem: 'kapat',
          sonraki: { eposta: x.eposta } });
      });
      return yonlendir(ctx, `${e.rota}?islem=${encodeURIComponent('Erişim kapatıldı')}`);
    }

    yetkiZorunlu(ctx, `${e.kod}:olustur`);
    const eposta = String(govde.eposta || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(eposta)) {
      throw DogrulamaHatasi('Geçerli bir e-posta girin.', { alanlar: { eposta: ['E-posta geçersiz.'] } });
    }
    if (!govde.hedefId) {
      throw DogrulamaHatasi('Taraf seçilmedi.', { alanlar: { hedefId: ['Seçim yapın.'] } });
    }
    const gun = Math.min(365, Math.max(1, Number(govde.gun) || 30));
    const acik = tokenUret(32);
    const sonuc = islem(() => {
      const id = kimlik('portal');
      calistir(`INSERT INTO portal_erisimi (id, tenant_id, tur, musteri_id, tedarikci_id, proje_id,
                  eposta, ad_soyad, token_ozeti, token_bitis, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?,?,?, 'aktif', ?,?)`,
        id, ctx.tenant.id, tur,
        tur === 'musteri' ? govde.hedefId : null,
        tur === 'musteri' ? null : govde.hedefId,
        govde.projeId || null, eposta, String(govde.adSoyad || '').trim() || null,
        /* AÇIK TOKEN SAKLANMAZ — yalnız özeti (K-008 kalıbı). */
        tokenOzeti(acik), simdi() + gun * GUN_MS, ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId,
        ip: ctx.ip, nesne: 'portal_erisimi', nesneId: id, eylem: 'olustur',
        /* Audit'e de token yazılmaz. */
        sonraki: { tur, eposta, gun, kapsamProje: govde.projeId || null } });
      return id;
    });
    /* Bağlantı BİR KEZ gösterilir (K-021: e-posta gönderimi yok). */
    const yol = `/portal/${tur}/${acik}`;
    return portalYonetimi(ctx, ekranKodu, tur, { yeniBaglanti: yol });
  } catch (err) {
    if (!(err instanceof UygulamaHatasi)) throw err;
    return portalYonetimi(ctx, ekranKodu, tur, { hata: hataNesnesi(err), durum: err.durum });
  }
}

/* ==========================================================================
   EXT-04..06 — dış taraf sayfası (oturumsuz)
   ========================================================================== */
function disPortal(ctx, acikToken, tur) {
  const erisim = erisimCoz(acikToken, tur);
  const tenant = tek('SELECT * FROM tenant WHERE id = ?', erisim.tenant_id);
  const bilgi = PORTAL_BASLIK[tur];

  /* KAPSAM: token neye bağlıysa yalnız o görünür. */
  const projeKosul = erisim.proje_id ? 'AND s.proje_id = ?' : '';
  const pp = erisim.proje_id ? [erisim.proje_id] : [];

  let bolumler = '';
  if (tur === 'musteri') {
    const projeler = erisim.proje_id
      ? sorgu('SELECT * FROM proje WHERE id = ?', erisim.proje_id)
      : sorgu('SELECT * FROM proje WHERE tenant_id = ? LIMIT 25', erisim.tenant_id);
    const teklifler = sorgu(
      `SELECT * FROM satis_teklifi WHERE musteri_id = ? AND durum IN ('gonderildi','kabul','ret')
        ORDER BY olusturuldu DESC LIMIT 25`, erisim.musteri_id);
    bolumler = h`
<div class="pt-kart">
  <h2>Projeleriniz</h2>
  <p class="alt">Yalnız size açılan kapsam gösterilir.</p>
  ${B.tablo({ satirlar: projeler, bosDurum: { baslik: 'Proje yok' },
    sutunlar: [{ ad: 'kod', etiket: 'Kod' }, { ad: 'ad', etiket: 'Proje' },
      { ad: 'durum', etiket: 'Durum' }] })}
</div>
<div class="pt-kart">
  <h2>Teklifler</h2>
  <p class="alt">Size gönderilmiş teklifler.</p>
  ${B.tablo({ satirlar: teklifler, bosDurum: { baslik: 'Teklif yok' },
    sutunlar: [{ ad: 'kod', etiket: 'Kod' }, { ad: 'baslik', etiket: 'Konu' },
      { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag',
        govde: (t) => para(t.tutar_minor, t.tutar_birim) },
      { ad: 'durum', etiket: 'Durum' }] })}
</div>`;
  } else {
    /* Taşeron ve tedarikçi: kendi sözleşmesi, hakedişi ve siparişi. */
    const sozlesmeler = sorgu(
      `SELECT s.* FROM sozlesme s WHERE s.tedarikci_id = ? ${projeKosul} ORDER BY s.kod`,
      erisim.tedarikci_id, ...pp);
    const hakedisler = sorgu(
      `SELECT h.*, s.kod AS sozlesme_kod FROM hakedis h JOIN sozlesme s ON s.id = h.sozlesme_id
        WHERE s.tedarikci_id = ? ${projeKosul} ORDER BY h.no DESC LIMIT 25`,
      erisim.tedarikci_id, ...pp);
    const siparisler = sorgu(
      `SELECT * FROM siparis WHERE tedarikci_id = ? ORDER BY olusturuldu DESC LIMIT 25`,
      erisim.tedarikci_id);
    bolumler = h`
<div class="pt-kart">
  <h2>Sözleşmeleriniz</h2>
  <p class="alt">Güncel bedel, onaylı zeyiller dâhil hesaplanır.</p>
  ${B.tablo({ satirlar: sozlesmeler, bosDurum: { baslik: 'Sözleşme yok' },
    sutunlar: [{ ad: 'kod', etiket: 'Kod' }, { ad: 'ad', etiket: 'Sözleşme' },
      { ad: 'tutar_minor', etiket: 'Bedel', hizala: 'sag',
        govde: (s) => para(s.tutar_minor, s.tutar_birim) },
      { ad: 'durum', etiket: 'Durum' }] })}
</div>
<div class="pt-kart">
  <h2>Hakedişler</h2>
  <p class="alt">Yalnız KARARA BAĞLANMIŞ hakedişler gösterilir; taslak tutar paylaşılmaz.</p>
  ${B.tablo({ satirlar: hakedisler.filter((x) => ['onaylandi', 'odendi'].includes(x.durum)),
    bosDurum: { baslik: 'Onaylı hakediş yok' },
    sutunlar: [{ ad: 'kod', etiket: 'Kod' }, { ad: 'donem', etiket: 'Dönem' },
      { ad: 'net_minor', etiket: 'Net', hizala: 'sag',
        govde: (x) => para(x.net_minor, x.tutar_birim) },
      { ad: 'durum', etiket: 'Durum' }] })}
</div>
<div class="pt-kart">
  <h2>Siparişler</h2>
  ${B.tablo({ satirlar: siparisler, bosDurum: { baslik: 'Sipariş yok' },
    sutunlar: [{ ad: 'kod', etiket: 'Kod' }, { ad: 'baslik', etiket: 'Konu' },
      { ad: 'durum', etiket: 'Durum' }] })}
</div>`;
  }

  const govde = portalKabugu({
    baslik: bilgi.ad, tenantAd: tenant?.ad,
    altBaslik: `${erisim.ad_soyad || erisim.eposta} · erişim ${tarih(erisim.token_bitis)} tarihine kadar geçerli`,
    icerik: bolumler,
  });
  return html(ctx, 200, govde);
}

/* ==========================================================================
   EXT-07 — saha mobil (çevrimdışı taslak + senkron kuyruğu)
   ========================================================================== */
function mobilAna(ctx, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('EXT-07');
  yetkiZorunlu(ctx, e.yetki);
  const kuyruk = sorgu(
    `SELECT * FROM senkron_kuyrugu WHERE tenant_id = ? AND kullanici_id = ?
      ORDER BY olusturuldu DESC LIMIT 30`, ctx.tenant.id, ctx.kullanici.id);
  const santiyeler = sorgu(
    `SELECT id, kod, ad FROM santiye WHERE tenant_id = ? AND durum NOT IN ('kapali','arsiv')
      ORDER BY kod`, ctx.tenant.id);

  const icerik = h`
${hata ? BB.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? BB.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${BB.sonucSeridi({ tur: 'ok', baslik: 'Çevrimdışı taslak',
    aciklama: 'Bağlantı yokken kaydettiğiniz taslak cihazda bekler ve bağlantı gelince '
      + 'gönderilir. Her taslak TEKİL bir istemci kimliği taşır: aynı taslak iki kez '
      + 'gönderilse bile TEK KAYIT oluşur (SITE-01 kalıbı).' })}
<div class="dash-cols">
  <div>
    ${BB.form({
    rota: '/mobil', csrf: csrfAlani(ctx), idempotencyAnahtari: kimlik('idempotency'), hatalar: hata,
    bolumler: [{ baslik: 'Hızlı saha bildirimi',
      aciklama: 'Sahadan tek ekranda bildirim açar. Bildirim sınıflandırması ve İSG/kalite '
        + 'bağı §7 gereği sunucuda kurulur; buradan seçilmez.',
      alanlar: h`
        <input type="hidden" name="_eylem" value="saha_bildirimi">
        <input type="hidden" name="istemciKimligi" value="${kimlik('senkron')}">
        ${BB.alan({ ad: 'santiyeId', etiket: 'Şantiye', zorunlu: true,
        secenekler: [{ deger: '', etiket: 'Seçin…' },
          ...santiyeler.map((s) => ({ deger: s.id, etiket: `${s.kod} — ${s.ad}` }))] })}
        ${BB.alan({ ad: 'baslik', etiket: 'Ne oldu?', zorunlu: true, genis: true })}
        ${BB.alan({ ad: 'aciklama', etiket: 'Ayrıntı', tur: 'metin', genis: true })}` }],
    eylemler: BB.btn('Bildirimi gönder', { tur: 'acc', gonder: true, ikon: 'fa-paper-plane' }),
  })}
    <div class="gv-card" style="margin-top:18px">
      <div class="gc-head"><div class="gc-title"><b>Senkron kuyruğu</b>
        <span>Çift gönderim "mükerrer" olarak işaretlenir; ikinci kayıt oluşmaz.</span></div></div>
      <div class="gc-body flush">${BB.tablo({
    satirlar: kuyruk,
    bosDurum: { baslik: 'Kuyruk boş', ikon: 'fa-inbox' },
    sutunlar: [
      { ad: 'olusturuldu', etiket: 'Zaman', govde: (k) => tarihSaat(k.olusturuldu) },
      { ad: 'nesne', etiket: 'Kayıt türü' },
      { ad: 'durum', etiket: 'Sonuç', govde: (k) => BB.rozet(
        k.durum === 'islendi' ? 'onaylandi' : k.durum === 'hatali' ? 'reddedildi' : 'beklemede',
        { islendi: 'İşlendi', mukerrer: 'Mükerrer — tek kayıt korundu',
          hatali: 'Hata', bekliyor: 'Bekliyor' }[k.durum] || k.durum) },
      { ad: 'sonuc_nesne_id', etiket: 'Kayıt',
        govde: (k) => (k.sonuc_nesne_id ? h`<a href="/saha-bildirimleri">açıldı</a>` : '—') },
    ],
  })}</div>
    </div>
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Sahadan hızlı erişim</b></div></div>
      <div class="gc-body" style="display:flex;flex-direction:column;gap:8px">
        ${BB.btn('QR / barkod tara', { rota: '/tara', ikon: 'fa-qrcode' })}
        ${BB.btn('Günlük rapor', { rota: '/gunluk-raporlar', ikon: 'fa-clipboard' })}
        ${BB.btn('Saha bildirimleri', { rota: '/saha-bildirimleri', ikon: 'fa-triangle-exclamation' })}
        ${BB.btn('Görevlerim', { rota: '/gorevler', ikon: 'fa-list-check' })}
      </div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/**
 * Senkron: aynı istemci kimliğiyle gelen ikinci gönderim İKİNCİ KAYIT AÇMAZ.
 * `senkron_kuyrugu.istemci_kimligi` tekildir; çakışma "mükerrer" olarak kaydedilir.
 */
function senkronIsle(ctx, govde) {
  if (govde._eylem !== 'saha_bildirimi') throw DogrulamaHatasi('Bilinmeyen işlem.');
  const istemciKimligi = String(govde.istemciKimligi || '').trim();
  if (!istemciKimligi) throw DogrulamaHatasi('İstemci kimliği eksik.');
  const baslik = String(govde.baslik || '').trim();
  if (!baslik) throw DogrulamaHatasi('Bildirim başlığı zorunludur.', { alanlar: { baslik: ['Yazın.'] } });
  const santiye = tek('SELECT * FROM santiye WHERE id = ? AND tenant_id = ?',
    govde.santiyeId, ctx.tenant.id);
  if (!santiye) throw DogrulamaHatasi('Şantiye seçin.', { alanlar: { santiyeId: ['Şantiye seçin.'] } });

  const mevcut = tek('SELECT * FROM senkron_kuyrugu WHERE tenant_id = ? AND istemci_kimligi = ?',
    ctx.tenant.id, istemciKimligi);
  if (mevcut) return 'Bu taslak zaten gönderilmiş — tek kayıt korundu (mükerrer)';

  return islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'saha_bildirimi');
    const bildirimId = kimlik('isg');
    /* Tür sahadan "diger" açılır; §7 gereği SINIFLANDIRMA ve İSG/kalite bağı
       sunucu tarafındaki bildirim akışında kurulur, mobilden seçilmez. */
    calistir(`INSERT INTO saha_bildirimi (id, tenant_id, santiye_id, proje_id, kod, tur, baslik,
                aciklama, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?, 'diger', ?,?, 'yeni', ?,?)`,
      bildirimId, ctx.tenant.id, santiye.id, santiye.proje_id || null, kod, baslik,
      govde.aciklama || null, ctx.kullanici.id, simdi());
    calistir(`INSERT INTO senkron_kuyrugu (id, tenant_id, kullanici_id, istemci_kimligi, nesne,
                yuk, sonuc_nesne_id, durum, olusturuldu, islendi)
              VALUES (?,?,?,?, 'saha_bildirimi', ?,?, 'islendi', ?,?)`,
      kimlik('senkron'), ctx.tenant.id, ctx.kullanici.id, istemciKimligi,
      JSON.stringify({ baslik, santiye: santiye.kod }), bildirimId, simdi(), simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId,
      ip: ctx.ip, nesne: 'saha_bildirimi', nesneId: bildirimId, eylem: 'olustur',
      sonraki: { kod, kaynak: 'mobil', istemciKimligi } });
    return `${kod} bildirimi açıldı`;
  });
}

/* ==========================================================================
   EXT-08 — kiosk (şantiye girişinde ziyaretçi ve puantaj)
   ========================================================================== */
function kioskEkrani(ctx, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('EXT-08');
  yetkiZorunlu(ctx, e.yetki);
  const santiyeler = sorgu(
    `SELECT id, kod, ad FROM santiye WHERE tenant_id = ? AND durum NOT IN ('kapali','arsiv')`,
    ctx.tenant.id);
  const sahada = sorgu(
    `SELECT z.*, s.kod AS santiye_kod FROM ziyaretci z JOIN santiye s ON s.id = z.santiye_id
      WHERE z.tenant_id = ? AND z.durum = 'sahada' ORDER BY z.giris DESC LIMIT 40`, ctx.tenant.id);

  const icerik = h`
${hata ? BB.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? BB.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${BB.sonucSeridi({ tur: 'warn', baslik: 'Çıkışsız ziyaretçi şantiye kapanışını engeller',
    aciklama: 'Sahada görünen her ziyaretçi SITE-16 kapanış engelidir; giriş yapan mutlaka '
      + 'çıkış yapmalıdır.' })}
<div class="dash-cols">
  <div>
    ${BB.form({
    rota: '/kiosk', csrf: csrfAlani(ctx), idempotencyAnahtari: kimlik('idempotency'), hatalar: hata,
    bolumler: [{ baslik: 'Ziyaretçi girişi',
      alanlar: h`
        <input type="hidden" name="_eylem" value="giris">
        ${BB.alan({ ad: 'santiyeId', etiket: 'Şantiye', zorunlu: true,
        secenekler: [{ deger: '', etiket: 'Seçin…' },
          ...santiyeler.map((s) => ({ deger: s.id, etiket: `${s.kod} — ${s.ad}` }))] })}
        ${BB.alan({ ad: 'adSoyad', etiket: 'Ad soyad', zorunlu: true })}
        ${BB.alan({ ad: 'firma', etiket: 'Firma' })}
        ${BB.alan({ ad: 'amac', etiket: 'Ziyaret amacı' })}` }],
    eylemler: BB.btn('Girişi kaydet', { tur: 'acc', gonder: true, ikon: 'fa-right-to-bracket' }),
  })}
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Sahada olanlar</b>
        <span>${sahada.length} kişi</span></div></div>
      <div class="gc-body flush">${BB.tablo({
    satirlar: sahada,
    bosDurum: { baslik: 'Sahada kimse yok' },
    sutunlar: [
      { ad: 'ad_soyad', etiket: 'Kişi',
        govde: (z) => h`<b>${z.ad_soyad}</b><br><span class="muted">${z.firma || '—'}</span>` },
      { ad: 'santiye_kod', etiket: 'Şantiye' },
      { ad: 'giris', etiket: 'Giriş', govde: (z) => tarihSaat(z.giris) },
      { ad: 'islem', etiket: '', govde: (z) => h`<form method="post" action="/kiosk" style="display:inline">
          ${ham(csrfAlani(ctx))}<input type="hidden" name="_eylem" value="cikis">
          <input type="hidden" name="ziyaretciId" value="${z.id}">
          <button class="btn btn-ghost btn-sm" type="submit">Çıkış</button></form>` },
    ],
  })}</div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

function kioskIslemi(ctx, govde) {
  if (govde._eylem === 'giris') {
    const santiye = tek('SELECT * FROM santiye WHERE id = ? AND tenant_id = ?',
      govde.santiyeId, ctx.tenant.id);
    if (!santiye) throw DogrulamaHatasi('Şantiye seçin.', { alanlar: { santiyeId: ['Şantiye seçin.'] } });
    const ad = String(govde.adSoyad || '').trim();
    if (!ad) throw DogrulamaHatasi('Ad soyad zorunludur.', { alanlar: { adSoyad: ['Ad girin.'] } });
    return islem(() => {
      const id = kimlik('atama');
      calistir(`INSERT INTO ziyaretci (id, tenant_id, santiye_id, ad_soyad, firma, amac,
                  giris, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?, 'sahada', ?,?)`,
        id, ctx.tenant.id, santiye.id, ad, govde.firma || null, govde.amac || null,
        simdi(), ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId,
        ip: ctx.ip, nesne: 'ziyaretci', nesneId: id, eylem: 'giris',
        sonraki: { adSoyad: ad, santiye: santiye.kod } });
      return `${ad} giriş yaptı`;
    });
  }

  if (govde._eylem === 'cikis') {
    const z = tek('SELECT * FROM ziyaretci WHERE id = ? AND tenant_id = ?',
      govde.ziyaretciId, ctx.tenant.id);
    if (!z) throw Bulunamadi('Ziyaretçi bulunamadı.');
    if (z.durum !== 'sahada') throw GecisIzinsiz('Ziyaretçi zaten çıkış yapmış.');
    return islem(() => {
      calistir(`UPDATE ziyaretci SET durum = 'cikti', cikis = ?, guncelleyen = ?, guncellendi = ?
                 WHERE id = ?`, simdi(), ctx.kullanici.id, simdi(), z.id);
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId,
        ip: ctx.ip, nesne: 'ziyaretci', nesneId: z.id, eylem: 'cikis' });
      return `${z.ad_soyad} çıkış yaptı`;
    });
  }

  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

/* ==========================================================================
   AST-11 — QR / barkod işlem ekranı
   ========================================================================== */
function taramaEkrani(ctx) {
  const e = ekranNesnesi('AST-11');
  yetkiZorunlu(ctx, e.yetki);
  const q = (ctx.sorgu.get('kod') || '').trim();

  /* Kod HANGİ NESNEYE ait olduğu ÖN EKİNDEN çözülür; kullanıcı tür seçmez. */
  let bulunan = null; let tur = null;
  if (q) {
    const adaylar = [
      ['varlik', 'varlik', '/varliklar'], ['stok_karti', 'stok kartı', '/stok-kartlari'],
      ['depo', 'depo', '/depolar'], ['kart', 'kart', '/kartlar'],
      ['is_emri', 'iş emri', '/gorevler'], ['santiye', 'şantiye', '/santiyeler'],
    ];
    for (const [tablo, etiket, rota] of adaylar) {
      const k = tek(`SELECT * FROM ${tablo} WHERE tenant_id = ? AND kod = ?`, ctx.tenant.id, q);
      if (k) { bulunan = { ...k, rota: `${rota}/${k.id}`, listeRota: rota }; tur = etiket; break; }
    }
  }

  const icerik = h`
${BB.sonucSeridi({ tur: 'ok', baslik: 'Kod tarama',
    aciklama: 'Okutulan kodun hangi kayda ait olduğu ÖN EKİNDEN çözülür; tür seçmezsiniz. '
      + 'Kamera erişimi olmayan cihazda kod elle yazılabilir.' })}
<div class="gv-card">
  <div class="gc-body">
    <form method="get" action="/tara" class="rpt-filtre">
      <label class="gv-filtre-alan" style="flex:1">
        <span>Kod (QR/barkod veya elle)</span>
        <input type="text" name="kod" value="${q}" autofocus
          placeholder="AST-2026-0001, STK-2026-0007, KRT-2026-0003…">
      </label>
      <button class="btn btn-acc" type="submit"><i class="fa-solid fa-magnifying-glass"></i> Bul</button>
    </form>
  </div>
</div>
${q ? (bulunan ? h`<div class="gv-card" style="margin-top:18px">
  <div class="gc-head"><div class="gc-title"><b>${bulunan.kod} — ${tur}</b>
    <span>${bulunan.ad || bulunan.baslik || ''}</span></div></div>
  <div class="gc-body">
    <dl class="gd-grid">
      <div><dt>Kayıt türü</dt><dd>${tur}</dd></div>
      <div><dt>Durum</dt><dd>${bulunan.durum || '—'}</dd></div>
    </dl>
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
      ${BB.btn('Kaydı aç', { tur: 'acc', rota: bulunan.rota, ikon: 'fa-arrow-right' })}
      ${BB.btn('Listeye git', { rota: bulunan.listeRota })}
    </div>
  </div>
</div>`
    : BB.sonucSeridi({ tur: 'warn', baslik: `"${q}" bulunamadı`,
      aciklama: 'Bu kodla eşleşen varlık, stok kartı, depo, kart, iş emri veya şantiye yok. '
        + 'Sahte bir kayıt açılmaz; kodu kontrol edin.' })) : ''}`;
  return html(ctx, 200, ciz(ctx, e, icerik));
}

/* ==========================================================================
   HR-14 — çalışan self-servis (YALNIZ kendi verisi)
   ========================================================================== */
function selfServis(ctx) {
  const e = ekranNesnesi('HR-14');
  yetkiZorunlu(ctx, e.yetki);
  const personel = tek('SELECT * FROM personel WHERE tenant_id = ? AND kullanici_id = ?',
    ctx.tenant.id, ctx.kullanici.id);

  if (!personel) {
    return html(ctx, 200, ciz(ctx, e, BB.sonucSeridi({ tur: 'warn',
      baslik: 'Personel kaydınız bulunamadı',
      aciklama: 'Self-servis ekranı uygulama hesabınıza bağlı personel kaydını gösterir. '
        + 'İK ile görüşün.' })));
  }

  /* HER SORGU personel kimliğine bağlıdır: başkasının verisi bu ekrana giremez. */
  const izinler = sorgu(
    `SELECT * FROM izin WHERE personel_id = ? ORDER BY baslangic DESC LIMIT 20`, personel.id);
  const avanslar = sorgu(
    `SELECT * FROM avans WHERE personel_id = ? ORDER BY olusturuldu DESC LIMIT 20`, personel.id);
  const belgeler = sorgu(
    `SELECT * FROM yetkinlik WHERE personel_id = ? AND durum = 'gecerli' ORDER BY gecerlilik`, personel.id);
  const zimmetler = sorgu(
    `SELECT z.*, v.kod, v.ad FROM zimmet z JOIN varlik v ON v.id = z.varlik_id
      WHERE z.personel_id = ? AND z.durum = 'zimmetli'`, personel.id);
  const kartlar = sorgu(
    `SELECT k.* FROM kart k WHERE k.id IN
       (SELECT kart_id FROM kart_atamasi WHERE personel_id = ? AND durum = 'aktif')`, personel.id);
  const puantajGun = Number(tek(
    'SELECT COUNT(*) AS n FROM puantaj WHERE personel_id = ? AND normal_saat > 0', personel.id)?.n ?? 0);

  const icerik = h`
${BB.sonucSeridi({ tur: 'ok', baslik: 'Kendi kayıtlarınız',
    aciklama: 'Bu ekran YALNIZ size ait verileri gösterir; kapsam sunucuda kimliğinize '
      + 'bağlanmıştır ve parametreyle genişletilemez.' })}
${BB.detayOzetSeridi({
    kod: personel.kod, baslik: personel.ad_soyad, durum: personel.durum, surum: personel.surum,
    bilgiler: [
      { etiket: 'Görev', deger: personel.gorev || '—' },
      { etiket: 'İşe giriş', deger: personel.ise_giris ? tarih(personel.ise_giris) : '—' },
      { etiket: 'Çalışılan gün', deger: String(puantajGun) },
    ],
  })}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>İzinlerim</b>
        <span>Durum onay motorundan gelir; buradan değiştirilemez.</span></div></div>
      <div class="gc-body flush">${BB.tablo({
    satirlar: izinler, bosDurum: { baslik: 'İzin kaydı yok' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod' }, { ad: 'tur', etiket: 'Tür' },
      { ad: 'baslangic', etiket: 'Başlangıç', govde: (i) => tarih(i.baslangic) },
      { ad: 'gun_sayisi', etiket: 'Gün', hizala: 'sag', govde: (i) => sayi(i.gun_sayisi) },
      { ad: 'durum', etiket: 'Durum', govde: (i) => BB.rozet(
        i.durum === 'onaylandi' ? 'onaylandi' : i.durum === 'reddedildi' ? 'reddedildi' : 'beklemede',
        i.durum) },
    ],
  })}</div>
      <div class="gc-body"><a href="/izinler">İzin talebi aç →</a></div>
    </div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Avanslarım</b></div></div>
      <div class="gc-body flush">${BB.tablo({
    satirlar: avanslar, bosDurum: { baslik: 'Avans kaydı yok' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag',
        govde: (a) => para(a.tutar_minor, a.tutar_birim) },
      { ad: 'mahsup_edildi', etiket: 'Mahsup',
        govde: (a) => (a.mahsup_edildi ? BB.isaret('mahsup edildi', 'ok') : BB.isaret('açık', 'warn')) },
      { ad: 'durum', etiket: 'Durum' },
    ],
  })}</div>
    </div>
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Kartlarım</b>
        <span>Bakiye defterden okunur.</span></div></div>
      <div class="gc-body flush">${BB.tablo({
    satirlar: kartlar.map((k) => ({ ...k, bakiye: kartDefteri.bakiye(k.id) })),
    bosDurum: { baslik: 'Kart yok' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kart',
        govde: (k) => h`<a href="/kartlar/${k.id}">${k.kod}</a><br>
          <span class="muted">•••• ${k.maskeli_no}</span>` },
      { ad: 'bakiye', etiket: 'Bakiye', hizala: 'sag', govde: (k) => para(k.bakiye) },
    ],
  })}</div>
    </div>
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Zimmetlerim</b></div></div>
      <div class="gc-body flush">${BB.tablo({
    satirlar: zimmetler, bosDurum: { baslik: 'Zimmet yok' },
    sutunlar: [{ ad: 'kod', etiket: 'Kod' }, { ad: 'ad', etiket: 'Varlık' }],
  })}</div>
    </div>
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Belgelerim</b>
        <span>Süresi dolan belge kırmızı görünür.</span></div></div>
      <div class="gc-body flush">${BB.tablo({
    satirlar: belgeler, bosDurum: { baslik: 'Belge yok' },
    sutunlar: [
      { ad: 'ad', etiket: 'Belge' },
      { ad: 'gecerlilik', etiket: 'Geçerlilik', govde: (b) => (b.gecerlilik
        ? h`${tarih(b.gecerlilik)}${b.gecerlilik < simdi() ? BB.isaret('süresi doldu', 'danger') : ''}`
        : '—') },
    ],
  })}</div>
    </div>
  </div>
</div>`;
  return html(ctx, 200, ciz(ctx, e, icerik));
}
