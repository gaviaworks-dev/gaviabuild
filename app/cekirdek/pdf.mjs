/* ============================================================================
   PDF ÜRETECİ — sıfır bağımlılık, saf `node:zlib`
   ----------------------------------------------------------------------------
   §3.4: "PDF, Excel ve CSV SUNUCU TARAFINDA üretilir. Yazdırma görünümünde
   menü, buton ve form kontrolleri gizlenir; A4 dikey/yatay seçimi, TEKRARLANAN
   TABLO BAŞLIĞI, SAYFA NUMARASI ve kurumsal başlık vardır."

   Neden elle yazıldı: K-002 sıfır npm bağımlılığı diyor. PDF, metin tabanlı bir
   kapsayıcı biçimdir; tablo + başlık + sayfa numarası için gereken alt küme
   (katalog, sayfa ağacı, içerik akışı, Type1 taban font) birkaç yüz satırdır.

   TÜRKÇE KARAKTER SORUNU VE ÇÖZÜMÜ
   --------------------------------
   Taban 14 fontun varsayılan kodlaması WinAnsi'dir ve `ı ş ğ İ Ş Ğ` harflerini
   İÇERMEZ. Bu harfleri "yaklaşık" karşılıklarıyla değiştirmek (ı→i, ş→s) bir
   RAPORDA kabul edilemez: kişi adı ve kod bozulur. Bunun yerine `/Differences`
   ile kullanılmayan kod noktalarına Adobe glif adları bağlanır
   (`dotlessi`, `gbreve`, `scedilla`, `Idotaccent`, `Gbreve`, `Scedilla`).
   Bu gliflerin hepsi Helvetica'nın tam glif kümesinde vardır.
   ========================================================================== */
import { deflateSync } from 'node:zlib';

/* --- Sayfa boyutları (PostScript punto: 1/72 inç) ------------------------- */
export const SAYFA = {
  a4dikey: { genislik: 595.28, yukseklik: 841.89 },
  a4yatay: { genislik: 841.89, yukseklik: 595.28 },
};

/* --- Kodlama ------------------------------------------------------------- */
/**
 * WinAnsi'de olmayan Türkçe harfler için kullanılmayan kod noktaları.
 * 0x80-0x8F aralığı WinAnsi'de büyük ölçüde boştur.
 */
const EK_GLIFLER = [
  [0x80, 'dotlessi', 'ı'], [0x81, 'gbreve', 'ğ'], [0x82, 'scedilla', 'ş'],
  [0x83, 'Idotaccent', 'İ'], [0x84, 'Gbreve', 'Ğ'], [0x85, 'Scedilla', 'Ş'],
  [0x86, 'quotesinglbase', '‚'], [0x87, 'endash', '–'], [0x88, 'emdash', '—'],
  [0x89, 'bullet', '•'], [0x8a, 'quoteleft', '‘'], [0x8b, 'quoteright', '’'],
  [0x8c, 'quotedblleft', '“'], [0x8d, 'quotedblright', '”'], [0x8e, 'ellipsis', '…'],
  /* Formül metinlerinde geçen matematik glifleri. `×` ve `÷` zaten WinAnsi'de
     (0xD7 / 0xF7) olduğu için burada yer almaz. */
  [0x8f, 'Sigma', 'Σ'], [0x90, 'Delta', 'Δ'], [0x91, 'lessequal', '≤'],
  [0x92, 'greaterequal', '≥'], [0x93, 'notequal', '≠'], [0x94, 'minus', '−'],
];
const KARAKTER_KODU = new Map(EK_GLIFLER.map(([kod, , ch]) => [ch, kod]));

/* WinAnsi'de doğrudan bulunan Latin-1 üstü harfler (ç ö ü Ç Ö Ü â î û …). */
function winAnsiKodu(ch) {
  const k = ch.codePointAt(0);
  if (k < 0x100) return k;                       // Latin-1 doğrudan eşleşir
  return null;
}

/** Metni PDF string'ine çevirir; desteklenmeyen karakter `?` olur. */
function pdfMetin(metin) {
  const bayt = [];
  for (const ch of String(metin ?? '')) {
    const ek = KARAKTER_KODU.get(ch);
    const kod = ek ?? winAnsiKodu(ch);
    if (kod == null) { bayt.push(0x3f); continue; }   // '?'
    if (kod === 0x28 || kod === 0x29 || kod === 0x5c) bayt.push(0x5c);  // ( ) \ kaçış
    bayt.push(kod);
  }
  return Buffer.from(bayt);
}

/* --- Helvetica genişlik tablosu (1000 birim em) --------------------------- */
/* Yalnız kullanılan aralık; eksik karakterler ortalama genişlikle hesaplanır. */
const GENISLIK = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  0: 556, 1: 556, 2: 556, 3: 556, 4: 556, 5: 556, 6: 556, 7: 556, 8: 556, 9: 556,
  ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500, '{': 334, '|': 260, '}': 334,
};
const KALIN_FARKI = 1.06;   // Helvetica-Bold yaklaşık oranı

/** Metnin punto cinsinden genişliği. */
export function metinGenisligi(metin, punto, kalin = false) {
  let toplam = 0;
  for (const ch of String(metin ?? '')) {
    /* Türkçe harfler taban harflerine yakın genişliktedir. */
    const taban = { ı: 'i', ş: 's', ğ: 'g', İ: 'I', Ş: 'S', Ğ: 'G',
      ç: 'c', ö: 'o', ü: 'u', Ç: 'C', Ö: 'O', Ü: 'U' }[ch] ?? ch;
    toplam += GENISLIK[taban] ?? 556;
  }
  return (toplam / 1000) * punto * (kalin ? KALIN_FARKI : 1);
}

/** Metni verilen genişliğe sığdırır; taşarsa "…" ile keser. */
export function kirp(metin, genislik, punto, kalin = false) {
  const s = String(metin ?? '');
  if (metinGenisligi(s, punto, kalin) <= genislik) return s;
  let sonuc = '';
  for (const ch of s) {
    if (metinGenisligi(`${sonuc}${ch}…`, punto, kalin) > genislik) break;
    sonuc += ch;
  }
  return `${sonuc}…`;
}

/** Metni satırlara böler (kelime bazlı sarma). */
export function satirla(metin, genislik, punto, kalin = false) {
  const kelimeler = String(metin ?? '').split(/\s+/).filter(Boolean);
  const satirlar = []; let mevcut = '';
  for (const k of kelimeler) {
    const aday = mevcut ? `${mevcut} ${k}` : k;
    if (metinGenisligi(aday, punto, kalin) > genislik && mevcut) {
      satirlar.push(mevcut); mevcut = k;
    } else mevcut = aday;
  }
  if (mevcut) satirlar.push(mevcut);
  return satirlar.length ? satirlar : [''];
}

/* ==========================================================================
   BELGE
   ========================================================================== */
export class PdfBelgesi {
  /**
   * @param {{yon?: 'a4dikey'|'a4yatay', kenar?: number,
   *          ustBilgi?: (sayfa) => void, altBilgi?: (sayfa) => void}} p
   */
  constructor({ yon = 'a4dikey', kenar = 40 } = {}) {
    this.olcu = SAYFA[yon] || SAYFA.a4dikey;
    this.kenar = kenar;
    this.sayfalar = [];
    this.akis = null;
    this.y = 0;
    this.sayfaNo = 0;
    this.ustBilgiCizer = null;
    this.altBilgiCizer = null;
  }

  get icGenislik() { return this.olcu.genislik - this.kenar * 2; }

  /** Yeni sayfa açar; üst bilgi çizeri varsa çalıştırır. */
  yeniSayfa() {
    this.akis = [];
    this.sayfalar.push(this.akis);
    this.sayfaNo = this.sayfalar.length;
    this.y = this.olcu.yukseklik - this.kenar;
    if (this.ustBilgiCizer) this.ustBilgiCizer(this);
    return this;
  }

  /** Kalan dikey alan yetmiyorsa sayfa kırar. */
  yerAc(yukseklik) {
    if (!this.akis) this.yeniSayfa();
    if (this.y - yukseklik < this.kenar + 28) this.yeniSayfa();
    return this;
  }

  _op(s) { this.akis.push(s); return this; }

  /** Renk: 0-1 aralığında r,g,b. */
  renk(r, g, b, cizgi = false) {
    return this._op(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} ${cizgi ? 'RG' : 'rg'}`);
  }

  dikdortgen(x, y, g, h, { dolgu = true } = {}) {
    return this._op(`${x.toFixed(2)} ${y.toFixed(2)} ${g.toFixed(2)} ${h.toFixed(2)} re ${dolgu ? 'f' : 'S'}`);
  }

  cizgi(x1, y1, x2, y2, kalinlik = 0.5) {
    return this._op(`${kalinlik} w ${x1.toFixed(2)} ${y1.toFixed(2)} m `
      + `${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  /** Tek satır metin. */
  metin(s, x, y, { punto = 10, kalin = false, renk = [0, 0, 0] } = {}) {
    const govde = pdfMetin(s).toString('latin1');
    this.renk(...renk);
    return this._op(`BT /${kalin ? 'F2' : 'F1'} ${punto} Tf `
      + `${x.toFixed(2)} ${y.toFixed(2)} Td (${govde}) Tj ET`);
  }

  /** Akış içinde metin bloğu; y konumunu ilerletir. */
  yaz(s, { punto = 10, kalin = false, renk = [0, 0, 0], bosluk = 4, hizala = 'sol' } = {}) {
    const satirlar = satirla(s, this.icGenislik, punto, kalin);
    for (const satir of satirlar) {
      this.yerAc(punto + bosluk);
      let x = this.kenar;
      if (hizala === 'sag') x = this.olcu.genislik - this.kenar - metinGenisligi(satir, punto, kalin);
      if (hizala === 'orta') x = (this.olcu.genislik - metinGenisligi(satir, punto, kalin)) / 2;
      this.metin(satir, x, this.y - punto, { punto, kalin, renk });
      this.y -= punto + bosluk;
    }
    return this;
  }

  bosluk(h = 8) { this.y -= h; return this; }

  /**
   * TABLO — sayfa kırıldığında BAŞLIK SATIRI TEKRARLANIR (§3.4).
   * @param {{sutunlar: Array<{etiket, genislik, hizala?}>, satirlar: Array<Array<string>>,
   *          punto?: number, baslikRengi?: number[]}} p
   */
  tablo({ sutunlar, satirlar, punto = 8.5, baslikRengi = [0.08, 0.09, 0.2] }) {
    const toplamOran = sutunlar.reduce((t, s) => t + (s.genislik || 1), 0);
    const genislikler = sutunlar.map((s) => ((s.genislik || 1) / toplamOran) * this.icGenislik);
    const satirYuksekligi = punto + 7;

    const basligiCiz = () => {
      this.yerAc(satirYuksekligi * 2);
      this.renk(...baslikRengi);
      this.dikdortgen(this.kenar, this.y - satirYuksekligi, this.icGenislik, satirYuksekligi);
      let x = this.kenar;
      sutunlar.forEach((s, i) => {
        const metin = kirp(s.etiket, genislikler[i] - 8, punto, true);
        const mx = s.hizala === 'sag'
          ? x + genislikler[i] - 4 - metinGenisligi(metin, punto, true) : x + 4;
        this.metin(metin, mx, this.y - satirYuksekligi + 5.5,
          { punto, kalin: true, renk: [1, 1, 1] });
        x += genislikler[i];
      });
      this.y -= satirYuksekligi;
    };

    basligiCiz();
    let tek = false;
    for (const satir of satirlar) {
      if (this.y - satirYuksekligi < this.kenar + 28) {
        this.yeniSayfa();
        basligiCiz();   // BAŞLIK TEKRARI
      }
      if (tek) {
        this.renk(0.96, 0.97, 0.98);
        this.dikdortgen(this.kenar, this.y - satirYuksekligi, this.icGenislik, satirYuksekligi);
      }
      tek = !tek;
      let x = this.kenar;
      satir.forEach((hucre, i) => {
        if (i >= sutunlar.length) return;
        const metin = kirp(hucre, genislikler[i] - 8, punto);
        const mx = sutunlar[i].hizala === 'sag'
          ? x + genislikler[i] - 4 - metinGenisligi(metin, punto) : x + 4;
        this.metin(metin, mx, this.y - satirYuksekligi + 5.5, { punto, renk: [0.1, 0.1, 0.15] });
        x += genislikler[i];
      });
      this.renk(0.85, 0.87, 0.9, true);
      this.cizgi(this.kenar, this.y - satirYuksekligi, this.olcu.genislik - this.kenar,
        this.y - satirYuksekligi, 0.3);
      this.y -= satirYuksekligi;
    }
    return this;
  }

  /** Sayfa numaralarını en sonda yazar (toplam sayfa sayısı o an bilinir). */
  sayfaNumaralari(metinUret) {
    const toplam = this.sayfalar.length;
    this.sayfalar.forEach((akis, i) => {
      const eskiAkis = this.akis;
      this.akis = akis;
      const s = metinUret(i + 1, toplam);
      this.metin(s, this.olcu.genislik - this.kenar - metinGenisligi(s, 8),
        this.kenar - 14, { punto: 8, renk: [0.45, 0.47, 0.55] });
      this.akis = eskiAkis;
    });
    return this;
  }

  /* --- Serileştirme ------------------------------------------------------ */
  uret({ baslik = '', yazar = '[ÜRÜN ADI]', uretimZamani = null } = {}) {
    if (!this.sayfalar.length) this.yeniSayfa();
    const nesneler = [];
    const ekle = (govde) => { nesneler.push(govde); return nesneler.length; };

    /* 1: Katalog, 2: Sayfa ağacı — numaraları sabit tutmak için önce yer tutucu. */
    nesneler.push(null, null);

    const fontNo = ekle(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica `
      + `/Encoding ${nesneler.length + 3} 0 R >>`);
    const fontKalinNo = ekle(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold `
      + `/Encoding ${nesneler.length + 2} 0 R >>`);
    const kodlamaNo = ekle(`<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [ `
      + EK_GLIFLER.map(([kod, ad]) => `${kod} /${ad}`).join(' ') + ' ] >>');
    /* İki font da aynı kodlamayı kullanır. */
    nesneler[fontNo - 1] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica `
      + `/Encoding ${kodlamaNo} 0 R >>`;
    nesneler[fontKalinNo - 1] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold `
      + `/Encoding ${kodlamaNo} 0 R >>`;

    const kaynakNo = ekle(`<< /Font << /F1 ${fontNo} 0 R /F2 ${fontKalinNo} 0 R >> >>`);

    const sayfaNolari = [];
    for (const akis of this.sayfalar) {
      const icerik = Buffer.from(akis.join('\n'), 'latin1');
      const sikistirilmis = deflateSync(icerik);
      const akisNo = ekle({ sozluk: `<< /Length ${sikistirilmis.length} /Filter /FlateDecode >>`,
        akis: sikistirilmis });
      sayfaNolari.push(ekle(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 `
        + `${this.olcu.genislik.toFixed(2)} ${this.olcu.yukseklik.toFixed(2)}] `
        + `/Resources ${kaynakNo} 0 R /Contents ${akisNo} 0 R >>`));
    }

    const bilgiNo = ekle(`<< /Title (${pdfMetin(baslik).toString('latin1')}) `
      + `/Producer (${pdfMetin(yazar).toString('latin1')}) `
      + `/CreationDate (D:${pdfTarih(uretimZamani ?? Date.now())}) >>`);

    nesneler[0] = `<< /Type /Catalog /Pages 2 0 R >>`;
    nesneler[1] = `<< /Type /Pages /Kids [${sayfaNolari.map((n) => `${n} 0 R`).join(' ')}] `
      + `/Count ${sayfaNolari.length} >>`;

    /* --- Dosya --- */
    const parcalar = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
    let konum = parcalar[0].length;
    const konumlar = [];
    nesneler.forEach((n, i) => {
      konumlar.push(konum);
      const bas = Buffer.from(`${i + 1} 0 obj\n`, 'latin1');
      let govde;
      if (typeof n === 'object' && n?.akis) {
        govde = Buffer.concat([Buffer.from(`${n.sozluk}\nstream\n`, 'latin1'), n.akis,
          Buffer.from('\nendstream\n', 'latin1')]);
      } else {
        govde = Buffer.from(`${n}\n`, 'latin1');
      }
      const son = Buffer.from('endobj\n', 'latin1');
      parcalar.push(bas, govde, son);
      konum += bas.length + govde.length + son.length;
    });

    const xrefKonum = konum;
    let xref = `xref\n0 ${nesneler.length + 1}\n0000000000 65535 f \n`;
    for (const k of konumlar) xref += `${String(k).padStart(10, '0')} 00000 n \n`;
    xref += `trailer\n<< /Size ${nesneler.length + 1} /Root 1 0 R /Info ${bilgiNo} 0 R >>\n`
      + `startxref\n${xrefKonum}\n%%EOF\n`;
    parcalar.push(Buffer.from(xref, 'latin1'));
    return Buffer.concat(parcalar);
  }
}

function pdfTarih(ms) {
  const d = new Date(ms);
  const p = (n, u = 2) => String(n).padStart(u, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`
    + `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}
