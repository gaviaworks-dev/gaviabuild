/* ============================================================================
   ORTAK SAYFA BİLEŞENLERİ — doküman §3 sayfa sözleşmeleri
   ----------------------------------------------------------------------------
   Liste, form, detay, rapor ve sayfalama TEK yerden gelir. Bir ekran bu
   bileşenleri kullanmıyorsa "component tutarlılığı" kalite kapısından geçemez.
   Bileşenler VERİ almaz, VERİ TANIMI alır: sütunlar, alanlar, filtreler.
   ========================================================================== */
import { h, ham, kacir, sayi } from './temel.mjs';
import { yapilandirma, manifest } from '../cekirdek/yapilandirma.mjs';
import { tarihSaat, iso } from '../cekirdek/zaman.mjs';

/* --- Durum rozetleri — semantik renkler accent'ten BAĞIMSIZ sabittir ----- */
export const ROZET_TONU = {
  taslak: 'nötr', beklemede: 'warn', onay_bekliyor: 'warn', incelemede: 'info',
  onaylandi: 'ok', aktif: 'ok', tamamlandi: 'ok', kapali: 'nötr', mutabik: 'ok',
  reddedildi: 'danger', iptal: 'danger', hatali: 'danger', gecikmis: 'danger',
  revizyon_istendi: 'warn', kismi: 'warn', arsiv: 'nötr', pasif: 'nötr',
};
const TON_SINIFI = { ok: 'ok', warn: 'warn', danger: 'danger', info: 'info', 'nötr': '' };

export function rozet(durum, etiket = null) {
  const ton = ROZET_TONU[durum] || 'nötr';
  return h`<span class="gstat ${ham(TON_SINIFI[ton])}">${etiket ?? durum}</span>`;
}

/** Hesaplanan işaret (gecikmiş, riskli, SLA aşıldı) — yaşam durumundan AYRI gösterilir. */
export function isaret(metin, ton = 'warn') {
  return h`<span class="gtag ${ham(TON_SINIFI[ton] || '')}">${metin}</span>`;
}

/* --- KPI şeridi (§3.1: en fazla 4-6 KPI) -------------------------------- */
export function kpiSeridi(kartlar) {
  if (!kartlar?.length) return h``;
  const sinirli = kartlar.slice(0, 6);
  /* Yapı ui.css .kpi-card ile birebir: ikon + (sayı, etiket, delta) sarmalı. */
  return h`<div class="kpi-grid">${sinirli.map((k) => h`
    <div class="kpi-card${ham(k.ton ? ' ' + kacir(k.ton) : '')}">
      ${k.ikon ? h`<div class="kpi-ico"><i class="fa-solid ${ham(kacir(k.ikon))}"></i></div>` : ''}
      <div>
        <div class="kpi-num">${k.deger}</div>
        <div class="kpi-lbl">${k.etiket}</div>
        ${k.alt ? h`<div class="kpi-delta flat">${k.alt}</div>` : ''}
      </div>
    </div>`)}</div>`;
}

/* --- Filtre barı — durum URL sorgusunda tutulur (§3.1) ------------------ */
export function filtreBari({ rota, filtreler = [], sorgu, aramaYer = 'Ara…' }) {
  const aktif = [];
  for (const f of filtreler) {
    const d = sorgu.get(f.ad);
    if (d) aktif.push({ ...f, deger: d, etiketDeger: f.secenekler?.find((s) => s.deger === d)?.etiket || d });
  }
  const q = sorgu.get('q') || '';
  return h`<form class="filter-bar" method="get" action="${rota}" role="search">
  <div class="fb-search">
    <i class="fa-solid fa-magnifying-glass"></i>
    <input type="search" name="q" value="${q}" placeholder="${aramaYer}" aria-label="Hızlı arama">
  </div>
  ${filtreler.map((f) => h`<label class="gfield gfield-inline">
    <span class="gv-cap-sm">${f.etiket}</span>
    <select name="${f.ad}" aria-label="${f.etiket}">
      <option value="">Tümü</option>
      ${(f.secenekler || []).map((s) => h`<option value="${s.deger}"${ham(sorgu.get(f.ad) === s.deger ? ' selected' : '')}>${s.etiket}</option>`)}
    </select>
  </label>`)}
  <button class="btn btn-acc btn-sm" type="submit"><i class="fa-solid fa-filter"></i> Uygula</button>
  ${aktif.length || q ? h`<a class="btn btn-ghost btn-sm" href="${rota}">Temizle</a>` : ''}
  ${aktif.length ? h`<div class="gv-achips-row"><div class="gv-achips">
    ${aktif.map((a) => h`<span class="gv-achip">${a.etiket}: <b>${a.etiketDeger}</b></span>`)}
  </div></div>` : ''}
</form>`;
}

/* --- Tablo --------------------------------------------------------------- */
/**
 * @param {{sutunlar:Array<{ad:string,etiket:string,hizala?:string,govde?:Function,mobilBaslik?:boolean}>,
 *          satirlar:Array, bosDurum?:object, satirRota?:Function}} p
 */
export function tablo({ sutunlar, satirlar, bosDurum, satirRota = null, siralama = null, rota = null, sorgu = null }) {
  if (!satirlar.length) return bosluk(bosDurum || {});
  const basliklar = sutunlar.map((s) => {
    if (!siralama || !s.siralanabilir) return h`<th${ham(s.hizala ? ` class="ta-${kacir(s.hizala)}"` : '')}>${s.etiket}</th>`;
    const mevcut = sorgu?.get('sirala');
    const yon = mevcut === s.ad ? '-' + s.ad : s.ad;
    const p = new URLSearchParams(sorgu); p.set('sirala', yon); p.delete('sayfa');
    const ok = mevcut === s.ad ? 'fa-arrow-down-short-wide' : mevcut === '-' + s.ad ? 'fa-arrow-up-wide-short' : 'fa-sort';
    return h`<th${ham(s.hizala ? ` class="ta-${kacir(s.hizala)}"` : '')}>
      <a href="${rota}?${p.toString()}" class="gth-sort">${s.etiket} <i class="fa-solid ${ham(ok)}"></i></a></th>`;
  });
  return h`<div class="gv-tscroll"><table class="gtable">
  <thead><tr>${basliklar}</tr></thead>
  <tbody>${satirlar.map((r) => h`<tr${ham(satirRota ? ` data-rota="${kacir(satirRota(r))}"` : '')}>
    ${sutunlar.map((s) => h`<td${ham(s.hizala ? ` class="ta-${kacir(s.hizala)}"` : '')} data-etiket="${s.etiket}"><span class="td-icerik">${
      s.govde ? s.govde(r) : (r[s.ad] ?? '—')}</span></td>`)}
  </tr>`)}</tbody>
</table></div>`;
}

/* --- Boş durum (§3.1 — ayrı ekran değil, listenin state'i) -------------- */
export function bosluk({ baslik = 'Kayıt yok', aciklama = 'Bu filtrelerle eşleşen kayıt bulunamadı.', ikon = 'fa-inbox', eylem = null }) {
  return h`<div class="gv-empty">
  <div class="gv-empty-ico"><i class="fa-solid ${ham(kacir(ikon))}"></i></div>
  <b>${baslik}</b><span>${aciklama}</span>
  ${eylem ? h`<div class="gv-empty-act">${eylem}</div>` : ''}
</div>`;
}

/* --- Sayfalama — doküman §3.5 standardı --------------------------------- */
/**
 * `toplam` SUNUCU sonucudur; istemci dizi uzunluğu kullanılmaz.
 * Filtre, sıralama, görünüm ve sayfa URL'de saklanır; geri tuşu bağlamı korur.
 */
export function sayfalama({ rota, sorgu, sayfa, boyut, toplam }) {
  const sonSayfa = Math.max(1, Math.ceil(toplam / boyut));
  const bas = toplam === 0 ? 0 : (sayfa - 1) * boyut + 1;
  const son = Math.min(sayfa * boyut, toplam);
  const bag = (s, b = boyut) => {
    const p = new URLSearchParams(sorgu);
    p.set('sayfa', String(s)); p.set('boyut', String(b));
    return `${rota}?${p.toString()}`;
  };
  const dugme = (hedefSayfa, ikon, etiket, devreDisi, ekSinif = '') => devreDisi
    ? h`<span class="pg-btn is-disabled ${ham(ekSinif)}" aria-disabled="true"><i class="fa-solid ${ham(ikon)}"></i><span class="gv-sr">${etiket}</span></span>`
    : h`<a class="pg-btn ${ham(ekSinif)}" href="${bag(hedefSayfa)}" aria-label="${etiket}"><i class="fa-solid ${ham(ikon)}"></i></a>`;

  return h`<nav class="gv-pager" aria-label="Sayfalama">
  <div class="pg-count">
    <b>${sayi(bas)}-${sayi(son)}</b> / ${sayi(toplam)} kayıt
    <span class="pg-compact">${sayi(sayfa)}. sayfa / ${sayi(sonSayfa)}</span>
  </div>
  <div class="pg-btns">
    <label class="gv-cap-sm pg-size">Sayfa boyutu
      <select name="boyut" aria-label="Sayfa boyutu" data-git="1">
        ${yapilandirma.sayfaBoyutlari.map((b) => h`<option value="${bag(1, b)}"${ham(b === boyut ? ' selected' : '')}>${b}</option>`)}
      </select>
    </label>
    ${dugme(1, 'fa-angles-left', 'İlk sayfa', sayfa <= 1, 'pg-uc')}
    ${dugme(sayfa - 1, 'fa-angle-left', 'Önceki sayfa', sayfa <= 1)}
    <span class="pg-num" aria-current="page">${sayi(sayfa)}</span>
    ${dugme(sayfa + 1, 'fa-angle-right', 'Sonraki sayfa', sayfa >= sonSayfa)}
    ${dugme(sonSayfa, 'fa-angles-right', 'Son sayfa', sayfa >= sonSayfa, 'pg-uc')}
  </div>
</nav>`;
}

/** Sorgu parametrelerinden sayfalama girdisi — sınırlar sunucuda zorlanır. */
export function sayfalamaGirdisi(sorgu) {
  const sayfa = Math.max(1, Number(sorgu.get('sayfa')) || 1);
  const istenen = Number(sorgu.get('boyut')) || yapilandirma.varsayilanSayfaBoyutu;
  const boyut = yapilandirma.sayfaBoyutlari.includes(istenen) ? istenen : yapilandirma.varsayilanSayfaBoyutu;
  return { sayfa, boyut, atla: (sayfa - 1) * boyut };
}

/* --- Veri tarihi künyesi (§3.1 son satır, §3.4 rapor künyesi) ---------- */
export const veriTarihi = (ms) => h`<div class="gv-datastamp"><i class="fa-solid fa-clock-rotate-left"></i>
  Veri tarihi: <time datetime="${iso(ms)}">${tarihSaat(ms)}</time></div>`;

/* --- Liste sayfası düzeni (§3.1 sırası birebir) ------------------------- */
export function listeDuzeni({ kpi, filtre, icerik, sayfalayici, veriZamani, toplu = null }) {
  return h`
${kpi || ''}
${filtre || ''}
<div class="gv-card">
  ${toplu || ''}
  <div class="gc-body flush">${icerik}</div>
  ${sayfalayici || ''}
</div>
${veriZamani ? veriTarihi(veriZamani) : ''}`;
}

/* --- Form (§3.2) --------------------------------------------------------- */
/**
 * Ana form solda, bağlam/özet sağda. Kaydetme üç biçimde:
 * Taslak kaydet · Kaydet ve detaya git · Onaya gönder.
 * Kullanıcı BAŞLANGIÇ DURUMUNU veya ONAYCIYI seçemez (değişmez kural 5) —
 * bu yüzden form ayağında durum/onaycı alanı YOKTUR, yalnız eylem düğmeleri vardır.
 */
export function form({ rota, csrf, idempotencyAnahtari, bolumler, ozet = null, eylemler = null, hatalar = null, metot = 'post' }) {
  return h`<form method="${metot}" action="${rota}" novalidate data-gform="1">
  ${ham(csrf || '')}
  ${idempotencyAnahtari ? h`<input type="hidden" name="_idempotency" value="${idempotencyAnahtari}">` : ''}
  ${hatalar ? hataOzeti(hatalar) : ''}
  <div class="form-grid">
    <div class="gform-main">
      ${bolumler.map((b) => h`<section class="gv-card gform-sec" id="${b.ad || ''}">
        <div class="gc-head"><div class="gc-title"><b>${b.baslik}</b>${b.aciklama ? h`<span>${b.aciklama}</span>` : ''}</div></div>
        <div class="gc-body"><div class="gform-alanlar">${b.alanlar}</div></div>
      </section>`)}
    </div>
    ${ozet ? h`<aside class="gform-side">${ozet}</aside>` : ''}
  </div>
  <div class="form-foot">${eylemler}</div>
</form>`;
}

/** Alan ve sekme hata özeti (§3.2) — hangi bölümde kaç hata olduğu görünür. */
export function hataOzeti(hatalar) {
  const alanlar = Object.entries(hatalar.alanlar || {});
  return h`<div class="gv-m-err" role="alert" tabindex="-1" id="hataOzeti">
  <b><i class="fa-solid fa-circle-exclamation"></i> ${hatalar.mesaj || 'Form gönderilemedi.'}</b>
  ${alanlar.length ? h`<ul>${alanlar.map(([alan, liste]) => h`<li><a href="#alan-${alan}">${alan}</a>: ${[].concat(liste).join(' ')}</li>`)}</ul>` : ''}
  ${hatalar.kod ? h`<span class="gv-errcode">Hata kodu: <code>${hatalar.kod}</code></span>` : ''}
</div>`;
}

/** Tek form alanı. */
/* --- Ön koşul eşlemesi (denetim-01 D-07) --------------------------------
   Zorunlu bir seçicide HİÇ seçenek yoksa, kullanıcı formu dolduramaz ve neyin
   eksik olduğunu formdan anlayamaz. Hangi alanın hangi ekrandan beslendiği
   TEK YERDE durur; hedef rota ve ad manifestten okunur (kural 1), böylece
   ekran taşınırsa bağlantı da taşınır. Alan adı bu kod tabanında sabit bir
   sözleşmedir (`projeId`, `depoId`, `hesapId` …). */
const ON_KOSUL_EKRANI = {
  projeId: 'PRJ-02', santiyeId: 'SITE-02', depoId: 'STK-01',
  kaynakDepoId: 'STK-01', hedefDepoId: 'STK-01', kartId: 'STK-02',
  varlikId: 'AST-02', hesapId: 'CRD-09', sozlesmeId: 'CNT-02',
  kasaId: 'FIN-05', bankaHesabiId: 'FIN-07', cariId: 'FIN-10',
  tedarikciId: 'PRC-11', aktiviteId: 'PLAN-01', sablonId: 'TASK-04',
  personelId: 'HR-02', musteriId: 'EXT-01', belgeTuru: 'SET-12',
};

/** Zorunlu seçicide gerçek seçenek var mı? (ilk "Seçin…" satırı sayılmaz) */
const seciciBos = (secenekler, zorunlu) =>
  !!secenekler && zorunlu && !secenekler.some((s) => s.deger !== '' && s.deger != null);

/** Boş zorunlu seçici için ön koşul ipucu — hangi ekrandan besleneceğini söyler. */
function onKosulIpucu(ad) {
  const kod = ON_KOSUL_EKRANI[ad];
  const e = kod ? manifest().ekranlar.find((x) => x.kod === kod) : null;
  /* DİNAMİK rota ön koşul hedefi OLAMAZ: `/is-programlari/:id/wbs` bağlantısı
     `:id` ile çizilir ve 404 verir. Böyle bir eşleme yapılırsa yönlendirmesiz
     ama dürüst metne düşülür (denetim-01 D-07). */
  if (!e || e.dinamik || e.rota.includes('/:')) {
    return h`Bu alan için önce ilgili kayıt açılmalı; şu an seçilebilecek kayıt yok.`;
  }
  return h`Seçilebilecek kayıt yok. Önce <a href="${e.rota}">${e.ad}</a> ekranından kayıt açın.`;
}

export function alan({ ad, etiket, tur = 'text', deger = '', zorunlu = false, ipucu = null, hata = null, secenekler = null, genis = false, salt = false, ekNitelik = '' }) {
  const id = `alan-${ad}`;
  const bosSecici = seciciBos(secenekler, zorunlu);
  const govde = secenekler
    ? h`<select id="${id}" name="${ad}"${ham(zorunlu ? ' required' : '')}${ham(salt ? ' disabled' : '')}>
        ${secenekler.map((s) => h`<option value="${s.deger}"${ham(String(s.deger) === String(deger) ? ' selected' : '')}>${s.etiket}</option>`)}
      </select>`
    : tur === 'metin'
      ? h`<textarea id="${id}" name="${ad}" rows="4"${ham(zorunlu ? ' required' : '')}${ham(salt ? ' readonly' : '')}>${deger}</textarea>`
      : h`<input id="${id}" type="${tur}" name="${ad}" value="${deger}"${ham(zorunlu ? ' required' : '')}${ham(salt ? ' readonly' : '')}${ham(ekNitelik)}>`;
  return h`<div class="gfield${ham(genis ? ' full' : '')}${ham(hata ? ' has-error' : '')}">
  <label for="${id}">${etiket}${zorunlu ? h`<span class="gf-req" aria-hidden="true">*</span>` : ''}</label>
  ${govde}
  ${bosSecici ? h`<span class="gf-hint gf-onkosul" data-onkosul="${ad}">${onKosulIpucu(ad)}</span>` : ''}
  ${ipucu ? h`<span class="gf-hint">${ipucu}</span>` : ''}
  ${hata ? h`<span class="gf-err" role="alert">${[].concat(hata).join(' ')}</span>` : ''}
</div>`;
}

/* --- Detay sayfası (§3.3) ------------------------------------------------ */
export function detayOzetSeridi({ kod, baslik, durum, isaretler = [], surum, bilgiler = [], birincilEylem = null, digerEylemler = null }) {
  return h`<div class="gv-card gd-summary">
  <div class="gc-body">
    <div class="gd-top">
      <div class="gd-ident">
        <span class="gv-cap-sm">${kod}</span>
        <h2>${baslik}</h2>
        <div class="gd-badges">${rozet(durum)}${isaretler.map((i) => isaret(i.metin, i.ton))}
          ${surum != null ? h`<span class="gtag">sürüm ${surum}</span>` : ''}</div>
      </div>
      <div class="gd-acts">${birincilEylem || ''}${digerEylemler || ''}</div>
    </div>
    ${bilgiler.length ? h`<dl class="gd-grid">${bilgiler.map((b) => h`<div><dt>${b.etiket}</dt><dd>${b.deger}</dd></div>`)}</dl>` : ''}
  </div>
</div>`;
}

/**
 * Sekme çubuğu. Bir sekmenin manifestte KENDİ ekranı varsa (`s.rota` dolu ise)
 * bağlantı o kanonik rotaya gider; `?sekme=` biçimi ÜRETİLMEZ — aynı ekran için
 * ikinci bir URL doğmaz (kural 1, K-116). `ozet` gibi kanonik karşılığı olmayan
 * sekmeler tek ekranın iç durumudur ve query biçimini korur.
 */
export function sekmeler({ sekmeler: liste, aktif, rota, sorgu }) {
  return h`<nav class="gv-tabs" role="tablist">${liste.map((s) => {
    let hedef;
    if (s.rota) hedef = s.rota;
    else { const p = new URLSearchParams(sorgu || ''); p.set('sekme', s.ad); hedef = `${rota}?${p.toString()}`; }
    return h`<a class="gv-tab${ham(s.ad === aktif ? ' is-active' : '')}" role="tab"
      aria-selected="${s.ad === aktif ? 'true' : 'false'}" href="${hedef}">
      ${s.etiket}${s.adet != null ? h` <span class="ml-cnt">${sayi(s.adet)}</span>` : ''}</a>`;
  })}</nav>`;
}

/* --- Dosya güvenlik beyanı (K-027, denetim-01 D-06) --------------------- */
/**
 * Yükleme ekranlarında dosyaya NE YAPILDIĞINI ve NE YAPILMADIĞINI söyler.
 *
 * §8 "antivirüs, MIME doğrulama ve sürümleme uygulanır" diyor; bunlardan
 * yalnız ikisi bağlı. Eksiği söylememek sahte başarının sessiz biçimidir:
 * kullanıcı dosyanın taranmış olduğunu varsayar. Metin TEK YERDE durur ki
 * ekranlar arasında sapmasın; tarayıcı bağlanınca tek bayrakla düzelir.
 */
export function dosyaGuvenlikSeridi() {
  if (yapilandirma.antivirusBagli) {
    return sonucSeridi({ tur: 'ok', baslik: 'Dosya güvenlik kontrolleri açık',
      aciklama: 'Yüklenen dosya antivirüs taramasından geçer; MIME içerik imzası '
        + 'doğrulanır ve her sürüm SHA-256 özetiyle saklanır.' });
  }
  return sonucSeridi({ tur: 'warn', baslik: 'Antivirüs taraması BAĞLI DEĞİL',
    aciklama: 'Bu kurulumda yüklenen dosyalar virüse karşı TARANMAZ (K-027). '
      + 'Uygulanan kontroller: izinli tür listesi, MIME içerik imzası (uzantı '
      + 'değil dosyanın kendisi) ve SHA-256 ile sürümleme. Bilinmeyen kaynaktan '
      + 'gelen dosyaları yüklemeden önce kendi tarayıcınızla kontrol edin.' });
}

/* --- İşlem sonucu — sahte başarı DEĞİL, gerçek API sonucu (kural 3) ----- */
export function sonucSeridi({ tur = 'ok', baslik, aciklama, kayitRota = null, kod = null }) {
  return h`<div class="gv-result gv-result-${ham(kacir(tur))}" role="status">
  <i class="fa-solid ${ham(tur === 'ok' ? 'fa-circle-check' : tur === 'warn' ? 'fa-triangle-exclamation' : 'fa-circle-xmark')}"></i>
  <div><b>${baslik}</b>${aciklama ? h`<span>${aciklama}</span>` : ''}</div>
  ${kod ? h`<code class="gv-errcode">${kod}</code>` : ''}
  ${kayitRota ? h`<a class="btn btn-sm btn-ghost" href="${kayitRota}">Kaydı aç</a>` : ''}
</div>`;
}

/* --- Buton yardımcıları -------------------------------------------------- */
export const btn = (etiket, { rota = null, tur = 'ghost', ikon = null, gonder = false, ad = null, deger = null, kucuk = false, devreDisi = false } = {}) => {
  const s = `btn btn-${tur}${kucuk ? ' btn-sm' : ''}`;
  const ic = h`${ikon ? h`<i class="fa-solid ${ham(kacir(ikon))}"></i> ` : ''}${etiket}`;
  if (rota) return h`<a class="${s}" href="${rota}">${ic}</a>`;
  return h`<button class="${s}" type="${gonder ? 'submit' : 'button'}"${ham(ad ? ` name="${kacir(ad)}"` : '')}${
    ham(deger ? ` value="${kacir(deger)}"` : '')}${ham(devreDisi ? ' disabled' : '')}>${ic}</button>`;
};
