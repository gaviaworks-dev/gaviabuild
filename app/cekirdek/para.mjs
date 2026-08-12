/* ============================================================================
   PARA — tamsayı minor unit + ISO para birimi (değişmez kural 10)
   ----------------------------------------------------------------------------
   Kayan nokta YASAK: 0.1+0.2 hatası finans defterinde kabul edilemez. Tutarlar
   BigInt "minor unit" (kuruş/cent) olarak saklanır; para birimi her tutarla
   BİRLİKTE taşınır — birimsiz tutar toplanamaz.
   ========================================================================== */
import { DogrulamaHatasi } from './hata.mjs';

/** Desteklenen para birimleri ve ondalık basamak sayısı. */
export const BIRIMLER = { TRY: 2, USD: 2, EUR: 2, GBP: 2 };

/**
 * TUTAR ÜST SINIRI (denetim-02 D-08, KARARLAR.md K-120).
 *
 * Tutarlar SQLite `INTEGER` sütununda saklanır ve `node:sqlite` bu sütunu
 * okurken JS `Number`'a çevirir: `Number.MAX_SAFE_INTEGER` aşılırsa OKUMA
 * `RangeError` atar. Değişmez defterde bu, satırı yazılmış ama okunamaz —
 * dolayısıyla ters kayıtla da düzeltilemez — hale getirir. Sınırı YAZMA
 * kapısında zorluyoruz: okunamayacak bir tutar deftere hiç girmez.
 */
export const AZAMI_MINOR = BigInt(Number.MAX_SAFE_INTEGER);   // 9.007.199.254.740.991

/** Deftere yazılacak her minor değer buradan geçer. Sınır aşılırsa 422. */
export function minorSinirZorunlu(minor, { alan = 'tutar' } = {}) {
  const m = typeof minor === 'bigint' ? minor : BigInt(minor ?? 0);
  const mutlak = m < 0n ? -m : m;
  if (mutlak > AZAMI_MINOR) {
    throw DogrulamaHatasi(
      `Tutar sınırın üzerinde. En çok ${new Para(AZAMI_MINOR, 'TRY').bicim({ simge: false })} girilebilir.`,
      { alanlar: { [alan]: ['Değer sınırın üzerinde.'] } });
  }
  return m;
}

export class Para {
  /** @param {bigint} minor @param {string} birim */
  constructor(minor, birim) {
    if (typeof minor !== 'bigint') throw new TypeError('Para minor unit BigInt olmalı');
    if (!(birim in BIRIMLER)) throw new TypeError(`Bilinmeyen para birimi: ${birim}`);
    this.minor = minor;
    this.birim = birim;
    Object.freeze(this);
  }

  static sifir(birim = 'TRY') { return new Para(0n, birim); }
  static minor(n, birim = 'TRY') { return new Para(BigInt(n), birim); }

  /** "1.234,56" | "1234.56" | 1234.56 → Para. Kullanıcı girdisi buradan geçer. */
  static ayristir(girdi, birim = 'TRY') {
    if (girdi instanceof Para) return girdi;
    const basamak = BIRIMLER[birim];
    if (basamak === undefined) throw DogrulamaHatasi(`Bilinmeyen para birimi: ${birim}`);
    let s = String(girdi ?? '').trim().replace(/\s| /g, '');
    if (!s) throw DogrulamaHatasi('Tutar boş olamaz.');
    /* TR biçimi: binlik "." ondalık "," — son ayırıcıya bakarak karar ver. */
    const sonNokta = s.lastIndexOf('.'), sonVirgul = s.lastIndexOf(',');
    if (sonVirgul > sonNokta) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    if (!/^-?\d+(\.\d+)?$/.test(s)) throw DogrulamaHatasi('Tutar sayı olmalı.');
    const eksi = s.startsWith('-');
    if (eksi) s = s.slice(1);
    let [tam, kesir = ''] = s.split('.');
    if (kesir.length > basamak) {
      /* Yarı-yukarı yuvarlama — kesme (truncate) para defterinde kayıp üretir. */
      const tasan = kesir.slice(basamak);
      kesir = kesir.slice(0, basamak);
      const yuvarla = Number(tasan[0]) >= 5;
      let minor = BigInt(tam + kesir.padEnd(basamak, '0')) + (yuvarla ? 1n : 0n);
      minorSinirZorunlu(minor);
      return new Para(eksi ? -minor : minor, birim);
    }
    const minor = BigInt(tam + kesir.padEnd(basamak, '0'));
    minorSinirZorunlu(minor);
    return new Para(eksi ? -minor : minor, birim);
  }

  #ayniBirim(o) {
    if (this.birim !== o.birim) {
      throw DogrulamaHatasi(`Farklı para birimleri toplanamaz: ${this.birim} ve ${o.birim}`);
    }
  }
  topla(o)  { this.#ayniBirim(o); return new Para(this.minor + o.minor, this.birim); }
  cikar(o)  { this.#ayniBirim(o); return new Para(this.minor - o.minor, this.birim); }
  ters()    { return new Para(-this.minor, this.birim); }
  /** Tamsayı çarpan (miktar × birim fiyat gibi). */
  carp(n)   { return new Para(this.minor * BigInt(n), this.birim); }
  /** Oran çarpımı — pay/payda tamsayı, yarı-yukarı yuvarlama (KDV, kesinti). */
  oran(pay, payda) {
    const p = BigInt(pay), q = BigInt(payda);
    if (q === 0n) throw DogrulamaHatasi('Payda sıfır olamaz.');
    const carpim = this.minor * p * 2n;
    const bolum = carpim / (q * 2n);
    const kalan = carpim % (q * 2n);
    const yukari = (kalan * 2n >= q * 2n) ? (this.minor < 0n ? -1n : 1n) : 0n;
    return new Para(bolum + yukari, this.birim);
  }
  esit(o)   { return this.birim === o.birim && this.minor === o.minor; }
  kucuk(o)  { this.#ayniBirim(o); return this.minor < o.minor; }
  buyuk(o)  { this.#ayniBirim(o); return this.minor > o.minor; }
  get sifirMi() { return this.minor === 0n; }
  get negatifMi() { return this.minor < 0n; }

  /** Veritabanı gösterimi — iki sütun: minor (INTEGER) + birim (TEXT). */
  get db() { return { minor: this.minor, birim: this.birim }; }

  /** "₺1.234,56" — yalnız SUNUM. Hesap asla metinden yapılmaz. */
  bicim({ simge = true, birimGoster = false } = {}) {
    const basamak = BIRIMLER[this.birim];
    const eksi = this.minor < 0n;
    const mutlak = (eksi ? -this.minor : this.minor).toString().padStart(basamak + 1, '0');
    const tam = mutlak.slice(0, -basamak || undefined) || '0';
    const kesir = basamak ? mutlak.slice(-basamak) : '';
    const tamGruplu = tam.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const simgeler = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };
    const on = simge ? simgeler[this.birim] : '';
    return `${eksi ? '-' : ''}${on}${tamGruplu}${basamak ? ',' + kesir : ''}${birimGoster ? ' ' + this.birim : ''}`;
  }
  toString() { return this.bicim({ simge: false, birimGoster: true }); }
  toJSON() { return { minor: this.minor.toString(), birim: this.birim }; }
}

/** Aynı birimli tutarları toplar; boş listede birim zorunlu. */
export function topla(liste, birim = 'TRY') {
  return liste.reduce((a, p) => a.topla(p), Para.sifir(birim));
}
