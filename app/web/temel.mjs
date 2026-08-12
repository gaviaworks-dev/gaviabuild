/* ============================================================================
   WEB TEMELİ — kaçış, belge iskeleti, ortak yardımcılar
   ----------------------------------------------------------------------------
   Sunucu render (KARARLAR.md K-007). Şablon motoru yok: etiketli şablon
   değişmezi `h` tüm interpolasyonu OTOMATİK kaçırır — XSS varsayılan olarak
   kapalıdır, açmak için açıkça `ham()` yazmak gerekir.
   ========================================================================== */

const KACIS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const kacir = (d) => String(d ?? '').replace(/[&<>"']/g, (c) => KACIS[c]);

class Ham { constructor(deger) { this.deger = deger; } toString() { return this.deger; } }
/** Kaçışı bilinçli olarak atlar — YALNIZ sunucuda üretilmiş HTML için. */
export const ham = (s) => new Ham(s);

/** Etiketli şablon: `h`vurgu ${kullaniciGirdisi}`` → girdi kaçırılır. */
export function h(parcalar, ...degerler) {
  let cikti = parcalar[0];
  for (let i = 0; i < degerler.length; i++) {
    const d = degerler[i];
    cikti += (d instanceof Ham ? d.deger
      : Array.isArray(d) ? d.map((x) => (x instanceof Ham ? x.deger : kacir(x))).join('')
      : d == null || d === false ? ''
      : kacir(d)) + parcalar[i + 1];
  }
  return new Ham(cikti);
}

export const sinif = (...parcalar) => parcalar.filter(Boolean).join(' ');
export const nitelik = (kosul, metin) => (kosul ? ham(metin) : ham(''));

/* --- Belge iskeleti ------------------------------------------------------ */
const FA = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css';
const FA_SRI = 'sha512-SnH5WK+bZxgPHs44uWIX+LLJAJ9/2PkPKZ5QiAj6Ta86w+fsb2TkcmfRyVX3pBnMFcV7oQPJkl9QevSCWr3W6A==';

/**
 * @param {{baslik:string, sec?:string, ekran?:string, govde:Ham, ekBas?:Ham,
 *          govdeSinifi?:string, ekScript?:Ham}} p
 */
export function belge({ baslik, sec = null, ekran = null, govde, ekBas = ham(''), govdeSinifi = '', ekScript = ham('') }) {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>${kacir(baslik)} — [ÜRÜN ADI]</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${FA}" integrity="${FA_SRI}" crossorigin="anonymous" referrerpolicy="no-referrer">
<link rel="stylesheet" href="/statik/css/tokens.css">
<link rel="stylesheet" href="/statik/css/shell.css">
<link rel="stylesheet" href="/statik/css/ui.css">
<link rel="stylesheet" href="/statik/css/uygulama.css">
<link rel="stylesheet" href="/statik/css/rapor.css">
${ekBas}
</head>
<body${sec ? ` data-sec="${kacir(sec)}"` : ''}${ekran ? ` data-screen="${kacir(ekran)}"` : ''}${govdeSinifi ? ` class="${kacir(govdeSinifi)}"` : ''}>
${govde}
<script src="/statik/js/uygulama.js" defer></script>
${ekScript}
</body>
</html>`;
}

/* --- Biçimlendirme ------------------------------------------------------- */
export const sayi = (n) => new Intl.NumberFormat('tr-TR').format(n ?? 0);
export const yuzde = (n, basamak = 0) =>
  new Intl.NumberFormat('tr-TR', { minimumFractionDigits: basamak, maximumFractionDigits: basamak }).format(n ?? 0) + '%';

/** Boş/az veriyi "0" yerine anlamlı gösterir. */
export const bosDegil = (d, yedek = '—') => (d === null || d === undefined || d === '' ? yedek : d);
