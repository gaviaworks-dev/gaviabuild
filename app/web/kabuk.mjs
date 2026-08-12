/* ============================================================================
   UYGULAMA KABUĞU — rail + bağlamsal menü + üst bar + breadcrumb + page-head
   ----------------------------------------------------------------------------
   Referans sayfa dili (doküman §2) korunur; markup SUNUCUDA üretilir. Rail ve
   menü, kullanıcının GERÇEK yetkilerinden türer (yetki.mjs) — istemci tarafı rol
   motoru yoktur. Menü gizlemek yetki değildir: her rota ayrıca sunucuda kontrol
   edilir; menü yalnız o kontrolün görünür yansımasıdır.
   ========================================================================== */
import { h, ham, kacir, belge } from './temel.mjs';
import { gorunurBolumler } from '../moduller/kimlik/yetki.mjs';
import { manifest, bayrakAcik, BAYRAKLAR, yapilandirma } from '../cekirdek/yapilandirma.mjs';
import { uygulananKodlar } from '../rotalar.mjs';
import { sayi } from './temel.mjs';

/* Bir ebeveyn rotanın altına düşen ekranlardan YALNIZ bunlar menüden gizlenir:
   ebeveyn listenin "Yeni …" düğmesi zaten oraya götürür. Liste, rapor, panel,
   onay ve mutabakat ekranları kendi başına gezinme hedefidir — rota iç içe diye
   gizlenirlerse hiçbir yerden erişilemez hale gelirler (denetim-01 §1). */
const IC_ICE_GIZLENEN_KALIPLAR = ['form', 'sihirbaz'];

/**
 * Bir ekran menüde görünür mü?
 *
 * Rota ön eki TEK BAŞINA gizleme gerekçesi değildir: `/kartlar/hareketler`
 * `/kartlar`ın altındadır ama ayrı bir gezinme hedefidir. Yalnızca kayıt AÇMA
 * yüzeyleri (form/sihirbaz) ebeveynine bırakılır.
 */
export function menuOgesiMi(ekran, tumEkranlar) {
  if (ekran.dinamik || ekran.takmaAdi) return false;
  if (['detay', 'durum', 'kimlik'].includes(ekran.kalip)) return false;
  const icIce = tumEkranlar.some((d) => d !== ekran && !d.dinamik && ekran.rota.startsWith(d.rota + '/'));
  return !icIce || !IC_ICE_GIZLENEN_KALIPLAR.includes(ekran.kalip);
}

/* Ekran koduna özel ikon; yoksa kalıp ikonu kullanılır. */
const KOD_IKONU = {
  'GLB-01': 'fa-gauge-high', 'GLB-02': 'fa-calendar-day', 'GLB-03': 'fa-chart-line',
  'GLB-04': 'fa-circle-check', 'GLB-06': 'fa-bell', 'GLB-07': 'fa-magnifying-glass',
  'GLB-08': 'fa-calendar-days', 'GLB-09': 'fa-bullhorn', 'GLB-10': 'fa-note-sticky',
  'GLB-12': 'fa-user', 'GLB-13': 'fa-clock-rotate-left',
  'SET-01': 'fa-building', 'SET-02': 'fa-briefcase', 'SET-03': 'fa-users-gear',
  'SET-04': 'fa-user-shield', 'SET-05': 'fa-shield-halved', 'SET-16': 'fa-clipboard-list',
  'SET-18': 'fa-toggle-on',
};

const IKON = {
  liste: 'fa-list', listeForm: 'fa-list-check', form: 'fa-pen-to-square', panel: 'fa-gauge-high', rapor: 'fa-chart-column',
  sihirbaz: 'fa-wand-magic-sparkles', onay: 'fa-circle-check', matris: 'fa-table-cells',
  mutabakat: 'fa-scale-balanced', takvim: 'fa-calendar-days', portal: 'fa-globe',
  mobil: 'fa-mobile-screen', ayar: 'fa-sliders', detay: 'fa-file-lines', durum: 'fa-triangle-exclamation',
};

/* --- Rail ---------------------------------------------------------------- */
function rail(ctx, bolumler, aktifBolum) {
  const ikonlar = bolumler.map((b) => {
    const ilk = b.ekranlar.find((e) => !e.dinamik) || b.ekranlar[0];
    return h`<a class="gv-rail-ico${ham(b.anahtar === aktifBolum ? ' is-active' : '')}" data-sec="${b.anahtar}"
       href="${ilk.rota}" data-tip="${b.ad}" aria-label="${b.ad}"><i class="fa-solid ${ham(kacir(b.ikon))}"></i></a>`;
  });
  return h`<aside class="gv-rail" id="gvRail">
  <a class="gv-rail-logo" href="/" data-tip="[ÜRÜN ADI]">G</a>
  <span class="gv-rail-div"></span>
  ${ikonlar}
  <div class="gv-rail-foot">
    <a class="gv-sig" href="https://gaviaworks.com" target="_blank" rel="noopener" data-tip="gaviaworks.com">GAVIA</a>
  </div>
</aside>`;
}

/* --- Bölüm menüsü -------------------------------------------------------- */
function menu(ctx, bolum, aktifKod, rozetler) {
  if (!bolum) return h`<nav class="gv-menu" id="gvMenu"></nav>`;
  const tum = manifest().ekranlar;
  const ogeler = bolum.ekranlar
    .filter((e) => menuOgesiMi(e, tum))
    .map((e) => {
      const rozet = rozetler?.[e.kod];
      return h`<a class="gv-mlink${ham(e.kod === aktifKod ? ' is-active' : '')}" href="${e.rota}" data-kod="${e.kod}">
        <i class="fa-solid ${ham(kacir(KOD_IKONU[e.kod] || IKON[e.kalip] || 'fa-circle'))}"></i> ${e.ad}${
        rozet ? h`<span class="ml-cnt">${sayi(rozet)}</span>` : ''}</a>`;
    });
  return h`<nav class="gv-menu" id="gvMenu">
  <div class="gv-menu-head"><span class="gmh-eyebrow">${ctx.tenant?.ad || '[ÜRÜN ADI]'}</span><span class="gmh-title">${bolum.ad}</span></div>
  <div class="gv-mnav">${ogeler}</div>
  <div class="gv-menu-foot">
    <form method="post" action="/cikis" class="gv-cikis-form">${ham(ctx.csrfAlani || '')}
      <button class="gv-mlink" type="submit"><i class="fa-solid fa-right-from-bracket"></i> Çıkış</button>
    </form>
  </div>
</nav>`;
}

/* --- Üst bar ------------------------------------------------------------- */
function ustBar(ctx, { onayAdedi = 0, bildirimAdedi = 0, baglam = null }) {
  const k = ctx.kullanici;
  const bas = (k?.ad_soyad || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const rolAdi = ctx.yetkiler?.roller?.[0]?.ad || '—';
  return h`<header class="gv-top">
  <button class="gv-burger" id="gvBurger" aria-label="Menüyü aç"><i class="fa-solid fa-bars"></i></button>
  <form class="gv-search" method="get" action="/arama" role="search">
    <i class="fa-solid fa-magnifying-glass"></i>
    <input type="search" name="q" placeholder="Kayıt, kod veya kişi ara…" aria-label="Genel arama" value="${ctx.sorgu?.get('q') || ''}">
  </form>
  <div class="gv-top-tools">
    ${baglam ? h`<span class="gv-tenant" title="Aktif bağlam"><span class="tn-dot"></span><span class="tn-lbl">${baglam}</span></span>` : ''}
    <a class="gv-iconbtn" href="/onaylar" data-tip="Onay kutum"
       aria-label="Onay kutum${ham(onayAdedi ? `, ${onayAdedi} bekleyen` : '')}">
      <i class="fa-solid fa-circle-check"></i>${onayAdedi ? h`<span class="gb-dot"></span>` : ''}</a>
    <a class="gv-iconbtn" href="/bildirimler" data-tip="Bildirimler"
       aria-label="Bildirimler${ham(bildirimAdedi ? `, ${bildirimAdedi} okunmamış` : '')}">
      <i class="fa-regular fa-bell"></i>${bildirimAdedi ? h`<span class="gb-dot"></span>` : ''}</a>
    <a class="gv-me" href="/profilim" aria-label="Profilim">
      <div class="me-ava">${bas}</div>
      <div class="me-id"><div class="me-name">${k?.ad_soyad || ''}</div><div class="me-role">${rolAdi}</div></div>
      <i class="fa-solid fa-chevron-right"></i>
    </a>
  </div>
</header>`;
}

/* --- Breadcrumb + page-head ---------------------------------------------- */
function kirintilar(bolum, ekran, kayitEtiketi) {
  if (!bolum) return h``;
  const ilk = bolum.ekranlar.find((e) => !e.dinamik);
  const modul = ekran && ekran.kod !== ilk?.kod;
  return h`<nav class="gv-crumbs" aria-label="Sayfa yolu">
  ${ilk ? h`<a class="gvc-sec" href="${ilk.rota}">${bolum.ad}</a>` : h`<span class="gvc-sec">${bolum.ad}</span>`}
  ${modul ? h`<i class="fa-solid fa-chevron-right gvc-sep"></i>${
    kayitEtiketi ? h`<a class="gvc-mod" href="${ekran.rota.split('/:')[0]}">${ekran.ad}</a>` : h`<span class="gvc-mod">${ekran.ad}</span>`}` : ''}
  ${kayitEtiketi ? h`<i class="fa-solid fa-chevron-right gvc-sep"></i><span class="gvc-rec">${kayitEtiketi}</span>` : ''}
</nav>`;
}

/** eyebrow + H1 + tek satır açıklama (doküman §2 madde 3). */
export function sayfaBasligi({ eyebrow, baslik, aciklama, eylemler = null }) {
  return h`<div class="gv-page-head">
  <div class="ph-txt">
    ${eyebrow ? h`<div class="ph-eyebrow">${eyebrow}</div>` : ''}
    <h1>${baslik}</h1>
    ${aciklama ? h`<div class="ph-sub">${aciklama}</div>` : ''}
  </div>
  ${eylemler ? h`<div class="ph-actions">${eylemler}</div>` : ''}
</div>`;
}

/* --- Kabuk --------------------------------------------------------------- */
/**
 * @param {object} ctx
 * @param {{ekran:object, baslik?:string, eyebrow?:string, aciklama?:string,
 *          eylemler?:any, kayitEtiketi?:string, icerik:any, rozetler?:object,
 *          onayAdedi?:number, bildirimAdedi?:number, ekBas?:any, ekScript?:any}} p
 */
export function kabuk(ctx, p) {
  const m = manifest();
  const bolumler = gorunurBolumler(ctx, m, uygulananKodlar());
  const aktif = bolumler.find((b) => b.anahtar === p.ekran?.bolum) || null;
  const baglam = ctx.tenant?.ad;

  const govde = h`<div class="gv-app">
${rail(ctx, bolumler, p.ekran?.bolum)}
${menu(ctx, aktif, p.ekran?.kod, p.rozetler)}
<div class="gv-divider" id="gvDivider" role="separator" aria-label="Menüyü daralt/genişlet"><span class="gv-grip"></span></div>
${ustBar(ctx, { onayAdedi: p.onayAdedi || 0, bildirimAdedi: p.bildirimAdedi || 0, baglam })}
<main class="gv-main">
${kirintilar(aktif, p.ekran, p.kayitEtiketi)}
${sayfaBasligi({
    /* Eyebrow breadcrumb'ı TEKRAR ETMEZ: kırıntı bölümü söyler, eyebrow ekranın
       türünü (Panel/Liste/Form/Rapor…) söyler — ikisi ayrı bilgi taşır. */
    eyebrow: p.eyebrow ?? p.ekran?.tip,
    baslik: p.baslik ?? p.ekran?.ad,
    aciklama: p.aciklama ?? p.ekran?.amac,
    eylemler: p.eylemler,
  })}
${p.icerik}
</main>
<div class="gv-overlay" id="gvOverlay"></div>
</div>`;

  return belge({
    baslik: p.baslik ?? p.ekran?.ad ?? '[ÜRÜN ADI]',
    sec: p.ekran?.bolum, ekran: p.ekran?.kod,
    govde, ekBas: p.ekBas, ekScript: p.ekScript,
  });
}

/* --- Kabuksuz sayfa (giriş, 403, 404, bakım) ----------------------------- */
export function sade(ctx, { baslik, icerik, ekBas, govdeSinifi = 'gv-sade' }) {
  return belge({ baslik, govde: icerik, ekBas, govdeSinifi });
}

/** Demo rol seçimi yalnız bayrak açıkken görünür ve DEMO etiketi taşır (2.1). */
export const demoRolSecimiAcik = (tenantId) => bayrakAcik(BAYRAKLAR.DEMO_ROL_SECIMI, tenantId) && !yapilandirma.uretim;
