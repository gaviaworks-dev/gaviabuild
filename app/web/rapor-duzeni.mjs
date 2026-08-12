/* ============================================================================
   REPORTLAYOUT — TEK rapor bileşeni (doküman §3.4, değişmez kural 9)
   ----------------------------------------------------------------------------
   "Tüm raporlar tek `ReportLayout`: filtre özeti, veri tarihi, rapor sürümü,
   açıklanmış KPI formülü, PDF/Excel/CSV, print CSS. **Ekran = PDF = Excel.**"

   BU EŞİTLİĞİN NASIL GARANTİ EDİLDİĞİ
   -----------------------------------
   Ekran, PDF, Excel ve CSV DÖRT AYRI KOD YOLU DEĞİLDİR. Rapor tanımı bir kez
   çalıştırılır (`veri(ctx, filtre)`), tek bir sonuç nesnesi üretir; dört çıktı
   da AYNI nesneden serileştirilir. Bir çıktının diğerinden sapması için önce
   bu fonksiyonun iki kez çalışması gerekirdi — mimari buna izin vermiyor.

   Künye (filtre özeti + veri tarihi + rapor sürümü) da tek yerde üretilir ve
   dört çıktının hepsinde aynı satırlarla görünür.
   ========================================================================== */
import { html } from '../cekirdek/http.mjs';
import { simdi, tarih, tarihSaat } from '../cekirdek/zaman.mjs';
import { Para } from '../cekirdek/para.mjs';
import { PdfBelgesi } from '../cekirdek/pdf.mjs';
import { xlsxUret, csvUret } from '../cekirdek/xlsx.mjs';
import { h, ham, sayi } from './temel.mjs';
import * as B from './bilesenler.mjs';

export const CIKTI_BICIMLERI = ['ekran', 'pdf', 'xlsx', 'csv'];

/* --- Hücre biçimlendirme -------------------------------------------------- */
/**
 * Bir sütunun değerini üç gösterime çevirir:
 *   `ekran` HTML · `pdf` düz metin · `sayfa` Excel hücresi (SAYI sayı kalır)
 *
 * Para PDF'te ISO koduyla yazılır (`1.234,50 TRY`): taban 14 fontta `₺` glifi
 * yoktur ve `?` basmak rakamı okunmaz yapardı.
 */
export function hucreBicimle(sutun, satir) {
  const ham2 = typeof sutun.deger === 'function' ? sutun.deger(satir) : satir[sutun.ad];
  const tur = sutun.tur || 'metin';

  if (ham2 == null || ham2 === '') return { ekran: '—', pdf: '—', sayfa: null };

  if (tur === 'para') {
    const birim = (typeof sutun.birim === 'function' ? sutun.birim(satir) : sutun.birim) || 'TRY';
    const p = Para.minor(ham2, birim);
    return {
      ekran: p.bicim(),
      pdf: `${p.bicim({ simge: false })} ${birim}`,
      sayfa: { s: Number(ham2) / 100, stil: 'sayi' },
    };
  }
  if (tur === 'sayi') {
    return { ekran: sayi(ham2), pdf: sayi(ham2), sayfa: { s: Number(ham2), stil: 'tamsayi' } };
  }
  if (tur === 'ondalik') {
    const n = Number(ham2);
    return { ekran: n.toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
      pdf: n.toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
      sayfa: { s: n, stil: 'sayi' } };
  }
  if (tur === 'yuzde') {
    const n = Number(ham2) / 100;
    return { ekran: `%${(n * 100).toFixed(1)}`, pdf: `%${(n * 100).toFixed(1)}`,
      sayfa: { s: n, stil: 'yuzde' } };
  }
  if (tur === 'tarih') {
    return { ekran: tarih(ham2), pdf: tarih(ham2), sayfa: { t: Number(ham2) } };
  }
  if (tur === 'tarihSaat') {
    return { ekran: tarihSaat(ham2), pdf: tarihSaat(ham2), sayfa: { d: tarihSaat(ham2) } };
  }
  const metin = String(ham2);
  return { ekran: metin, pdf: metin, sayfa: { d: metin } };
}

/* --- Künye ---------------------------------------------------------------- */
/**
 * Filtre özeti + veri tarihi + rapor sürümü. Dört çıktının hepsinde AYNI
 * satırlar görünür; ayrıştıkları anda testler kırılır.
 */
export function kunyeSatirlari(rapor, { ctx, filtre, veriTarihi, kayitSayisi }) {
  const ozet = (rapor.filtreOzeti ? rapor.filtreOzeti(ctx, filtre) : [])
    .filter((x) => x && x.deger != null && x.deger !== '');
  return [
    ['Rapor', `${rapor.kod} — ${rapor.ad}`],
    ['Şirket', ctx.tenant?.ad || '—'],
    ['Filtre', ozet.length ? ozet.map((x) => `${x.etiket}: ${x.deger}`).join(' · ') : 'filtre yok'],
    ['Veri tarihi', tarihSaat(veriTarihi)],
    ['Üretim zamanı', tarihSaat(simdi())],
    ['Rapor sürümü', rapor.surum || 'v1'],
    ['Kayıt sayısı', String(kayitSayisi)],
    ['Üreten', ctx.kullanici?.ad_soyad || '—'],
  ];
}

/* ==========================================================================
   ÇIKTI ÜRETİMİ
   ========================================================================== */
/**
 * @param {object} rapor  tanım (moduller/rapor/tanimlar.mjs)
 * @param {object} sonuc  { satirlar, kpiler, veriTarihi, sutunlar?, gruplar? }
 */
export function raporCikti(ctx, rapor, sonuc, bicim, { filtre = {} } = {}) {
  const sutunlar = sonuc.sutunlar || rapor.sutunlar;
  const kunye = kunyeSatirlari(rapor, {
    ctx, filtre, veriTarihi: sonuc.veriTarihi, kayitSayisi: sonuc.satirlar.length });

  /* Tüm çıktılar AYNI biçimlenmiş matristen türer. */
  const matris = sonuc.satirlar.map((s) => sutunlar.map((c) => hucreBicimle(c, s)));

  if (bicim === 'csv') return csvCikti(rapor, kunye, sutunlar, matris, sonuc);
  if (bicim === 'xlsx') return xlsxCikti(rapor, kunye, sutunlar, matris, sonuc);
  return pdfCikti(ctx, rapor, kunye, sutunlar, matris, sonuc);
}

function csvCikti(rapor, kunye, sutunlar, matris, sonuc) {
  const satirlar = [
    ...kunye.map(([k, v]) => [`# ${k}`, v]),
    [],
    ...(sonuc.kpiler?.length ? [['# KPI', 'Değer', 'Formül'],
      ...sonuc.kpiler.map((k) => [k.etiket, k.deger, k.formul || '']), []] : []),
    sutunlar.map((c) => c.etiket),
    ...matris.map((r) => r.map((h2) => h2.pdf)),
  ];
  return { govde: csvUret(satirlar), tur: 'text/csv; charset=utf-8', uzanti: 'csv' };
}

function xlsxCikti(rapor, kunye, sutunlar, matris, sonuc) {
  const rapordaki = [
    ...kunye.map(([k, v]) => [{ d: k, stil: 'kunye' }, { d: v, stil: 'kunye' }]),
    [],
    sutunlar.map((c) => ({ d: c.etiket, stil: 'baslik' })),
    ...matris.map((r) => r.map((h2) => h2.sayfa)),
  ];
  const sayfalar = [{
    ad: rapor.kod, satirlar: rapordaki, donmusSatir: kunye.length + 2,
    sutunGenislikleri: sutunlar.map((c) => c.genislik ? c.genislik * 10 : 18),
  }];
  /* KPI'lar AYRI SAYFADA, formülüyle birlikte: "açıklanmış KPI" kuralı Excel'de
     de geçerlidir; sayı formülsüz gönderilmez. */
  if (sonuc.kpiler?.length) {
    sayfalar.push({
      ad: 'KPI', donmusSatir: 1, sutunGenislikleri: [34, 20, 60],
      satirlar: [
        [{ d: 'Gösterge', stil: 'baslik' }, { d: 'Değer', stil: 'baslik' },
          { d: 'Formül', stil: 'baslik' }],
        ...sonuc.kpiler.map((k) => [k.etiket, k.deger, k.formul || '—']),
      ],
    });
  }
  return { govde: xlsxUret(sayfalar),
    tur: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', uzanti: 'xlsx' };
}

function pdfCikti(ctx, rapor, kunye, sutunlar, matris, sonuc) {
  const yon = rapor.yon || (sutunlar.length > 6 ? 'a4yatay' : 'a4dikey');
  const d = new PdfBelgesi({ yon });

  d.ustBilgiCizer = (b) => {
    b.renk(0.008, 0.031, 0.216);
    b.dikdortgen(0, b.olcu.yukseklik - 58, b.olcu.genislik, 58);
    b.metin(ctx.tenant?.ad || '[ÜRÜN ADI]', b.kenar, b.olcu.yukseklik - 24,
      { punto: 8.5, renk: [0.62, 0.84, 0.79] });
    b.metin(`${rapor.kod} — ${rapor.ad}`, b.kenar, b.olcu.yukseklik - 42,
      { punto: 13, kalin: true, renk: [1, 1, 1] });
    b.y = b.olcu.yukseklik - 78;
  };
  d.yeniSayfa();

  /* Künye — ekrandakiyle AYNI satırlar. */
  for (const [k, v] of kunye) {
    d.yerAc(12);
    d.metin(`${k}:`, d.kenar, d.y - 8, { punto: 8, kalin: true, renk: [0.35, 0.37, 0.45] });
    d.metin(v, d.kenar + 78, d.y - 8, { punto: 8, renk: [0.15, 0.16, 0.2] });
    d.y -= 12;
  }
  d.bosluk(10);

  if (sonuc.kpiler?.length) {
    d.yaz('Göstergeler', { punto: 10.5, kalin: true, bosluk: 6 });
    d.tablo({
      sutunlar: [{ etiket: 'Gösterge', genislik: 2 }, { etiket: 'Değer', genislik: 1, hizala: 'sag' },
        { etiket: 'Formül', genislik: 3 }],
      satirlar: sonuc.kpiler.map((k) => [k.etiket, String(k.deger), k.formul || '—']),
      punto: 8,
    });
    d.bosluk(14);
  }

  d.yaz(rapor.tabloBasligi || 'Ayrıntı', { punto: 10.5, kalin: true, bosluk: 6 });
  d.tablo({
    sutunlar: sutunlar.map((c) => ({ etiket: c.etiket, genislik: c.genislik || 1,
      hizala: ['para', 'sayi', 'ondalik', 'yuzde'].includes(c.tur) ? 'sag' : 'sol' })),
    satirlar: matris.map((r) => r.map((x) => x.pdf)),
  });

  d.sayfaNumaralari((s, t) => `${rapor.kod} · ${tarihSaat(sonuc.veriTarihi)} · Sayfa ${s} / ${t}`);
  return { govde: d.uret({ baslik: `${rapor.kod} — ${rapor.ad}` }),
    tur: 'application/pdf', uzanti: 'pdf' };
}

/* ==========================================================================
   EKRAN
   ========================================================================== */
/**
 * Rapor ekranı. Yazdırma görünümünde menü, buton ve form kontrolleri gizlenir
 * (print CSS `statik/css/rapor.css` içindedir, `@media print`).
 */
export function raporEkrani(ctx, rapor, sonuc, { filtre = {}, filtreBari = null } = {}) {
  const sutunlar = sonuc.sutunlar || rapor.sutunlar;
  const kunye = kunyeSatirlari(rapor, {
    ctx, filtre, veriTarihi: sonuc.veriTarihi, kayitSayisi: sonuc.satirlar.length });
  const matris = sonuc.satirlar.map((s) => sutunlar.map((c) => hucreBicimle(c, s)));
  const sorguMetni = ctx.sorgu.toString();
  const ciktiRota = (b) => `${rapor.rota}?${sorguMetni ? `${sorguMetni}&` : ''}cikti=${b}`;

  return h`
<div class="gv-rapor" data-rapor="${rapor.kod}">
  <div class="gv-card rpt-kunye">
    <div class="gc-body">
      <div class="rpt-kunye-grid">
        ${kunye.map(([k, v]) => h`<div><dt>${k}</dt><dd>${v}</dd></div>`)}
      </div>
    </div>
  </div>

  <div class="rpt-arac gv-noprint">
    ${filtreBari || ''}
    <div class="rpt-cikti">
      ${B.btn('PDF', { rota: ciktiRota('pdf'), ikon: 'fa-file-pdf' })}
      ${B.btn('Excel', { rota: ciktiRota('xlsx'), ikon: 'fa-file-excel' })}
      ${B.btn('CSV', { rota: ciktiRota('csv'), ikon: 'fa-file-csv' })}
      <button class="btn btn-ghost" type="button" onclick="window.print()">
        <i class="fa-solid fa-print"></i> Yazdır</button>
    </div>
  </div>

  ${sonuc.kpiler?.length ? h`<div class="gv-card rpt-kpi">
    <div class="gc-head"><div class="gc-title"><b>Göstergeler</b>
      <span>Her KPI formülüyle birlikte gösterilir; açıklanmamış sayı yoktur (kural 9).</span></div></div>
    <div class="gc-body">
      <div class="rpt-kpi-grid">
        ${sonuc.kpiler.map((k) => h`<div class="rpt-kpi-kart${ham(k.ton ? ` is-${k.ton}` : '')}">
          <div class="rk-etiket">${k.etiket}</div>
          <div class="rk-deger">${k.deger}</div>
          <div class="rk-formul" title="${k.formul || ''}">${k.formul || '—'}</div>
          ${k.kaynak ? h`<div class="rk-kaynak">kaynak: ${k.kaynak}</div>` : ''}
        </div>`)}
      </div>
    </div>
  </div>` : ''}

  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>${rapor.tabloBasligi || 'Ayrıntı'}</b>
      <span>${sonuc.satirlar.length} kayıt · veri tarihi ${tarihSaat(sonuc.veriTarihi)}</span></div></div>
    <div class="gc-body flush">
      <div class="gv-tscroll"><table class="gtable rpt-tablo">
        <thead><tr>${sutunlar.map((c) => h`<th class="${ham(
    ['para', 'sayi', 'ondalik', 'yuzde'].includes(c.tur) ? 'ta-sag' : '')}">${c.etiket}</th>`)}</tr></thead>
        <tbody>${matris.length ? matris.map((r) => h`<tr>${r.map((x, i) => h`<td class="${ham(
    ['para', 'sayi', 'ondalik', 'yuzde'].includes(sutunlar[i].tur) ? 'ta-sag' : '')}"
            data-etiket="${sutunlar[i].etiket}"><span class="td-icerik">${x.ekran}</span></td>`)}</tr>`)
    : h`<tr><td colspan="${sutunlar.length}"><div class="gv-bosluk">
        <i class="fa-solid fa-inbox"></i><b>Bu filtrede kayıt yok</b>
        <span>Filtreyi genişletin; boş rapor da gerçek sonuçtur.</span></div></td></tr>`}</tbody>
        ${sonuc.toplamlar?.length ? h`<tfoot><tr>${sonuc.toplamlar.map((t, i) => h`<td class="${ham(
    ['para', 'sayi', 'ondalik', 'yuzde'].includes(sutunlar[i]?.tur) ? 'ta-sag' : '')}"><b>${t}</b></td>`)}</tr></tfoot>` : ''}
      </table></div>
    </div>
  </div>

  ${rapor.aciklama ? h`<div class="gv-card"><div class="gc-body">
    <p class="gf-hint" style="margin:0">${rapor.aciklama}</p></div></div>` : ''}
</div>`;
}
