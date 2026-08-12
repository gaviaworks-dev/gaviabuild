/* ============================================================================
   RAPOR TANIMLARI — RPT-03..14 ve formül sözlüğü (RPT-15)
   ----------------------------------------------------------------------------
   Değişmez kural: **RAPOR İKİNCİ BİR HESAP YAZMAZ.** Her tanım, ilgili modülün
   zaten var olan fonksiyonunu çağırır:

     hakediş/sözleşme → `moduller/sozlesme/hakedis.mjs`
     stok             → `moduller/stok/defter.mjs`
     kasa/banka/cari  → `moduller/finans/defter.mjs`
     kart             → `moduller/kartlar/defter.mjs`
     ilerleme         → `moduller/plan/ilerleme.mjs`

   Ekranla rapor ayrışırsa §12 engeli doğar; ayrışmanın tek yolu ikinci bir
   hesap yazmaktır, o da burada yasaktır.

   Her KPI `formul` alanı taşır: §11 RPT-01 ve kural 9 "açıklanmış KPI formülü"
   şartı. Formülü olmayan gösterge tanıma eklenemez (`sozlukDogrula` bunu
   testte zorlar).
   ========================================================================== */
import { sorgu, tek } from '../../cekirdek/db.mjs';
import { simdi, tarih, gunAnahtari, gunBaslangici, GUN_MS } from '../../cekirdek/zaman.mjs';
import { Para } from '../../cekirdek/para.mjs';
import * as HK from '../sozlesme/hakedis.mjs';
import * as stokDefteri from '../stok/defter.mjs';
import * as finansDefteri from '../finans/defter.mjs';
import * as kartDefteri from '../kartlar/defter.mjs';
import * as ilerlemeModulu from '../plan/ilerleme.mjs';

const para = (minor, birim = 'TRY') => Para.minor(minor ?? 0, birim).bicim();
const say = (sql, ...p) => Number(tek(sql, ...p)?.n ?? 0);

/** Dönem filtresini [başlangıç, bitiş) milisaniyeye çevirir. */
function donemAraligi(filtre) {
  const bas = filtre.baslangic ? gunBaslangici(filtre.baslangic) : null;
  const bit = filtre.bitis ? gunBaslangici(filtre.bitis) + GUN_MS : null;
  return { bas, bit };
}

/* ==========================================================================
   RPT-03 — Proje portföy raporu
   ========================================================================== */
const RPT03 = {
  kod: 'RPT-03', ad: 'Proje portföy raporu', rota: '/raporlar/proje-portfoyu',
  ozet: 'İlerleme, sağlık, risk ve bütçe', surum: 'v1', yon: 'a4yatay',
  tabloBasligi: 'Projeler',
  aciklama: 'İlerleme yüzdesi `moduller/plan/ilerleme.mjs` fonksiyonuyla, bütçe ve '
    + 'gerçekleşme finans defteriyle hesaplanır; bu raporda ikinci bir hesap yoktur.',
  filtreler: [{ ad: 'durum', etiket: 'Durum', secenekler: ['taslak', 'hazirlik', 'aktif', 'askida',
    'kapanista', 'kapali'].map((d) => ({ deger: d, etiket: d })) }],
  filtreOzeti: (ctx, f) => [{ etiket: 'Durum', deger: f.durum || 'tümü' }],
  sutunlar: [
    { ad: 'kod', etiket: 'Kod', genislik: 1 },
    { ad: 'ad', etiket: 'Proje', genislik: 2.4 },
    { ad: 'durum', etiket: 'Durum', genislik: 1 },
    { ad: 'santiye', etiket: 'Şantiye', tur: 'sayi', genislik: 0.7 },
    { ad: 'ilerleme', etiket: 'İlerleme', tur: 'yuzde', genislik: 0.9 },
    { ad: 'butce', etiket: 'Onaylı bütçe', tur: 'para', genislik: 1.4 },
    { ad: 'gerceklesen', etiket: 'Gerçekleşen', tur: 'para', genislik: 1.4 },
    { ad: 'sapma', etiket: 'Sapma', tur: 'para', genislik: 1.3 },
    { ad: 'acikRisk', etiket: 'Açık risk', tur: 'sayi', genislik: 0.8 },
  ],
  veri(ctx, filtre) {
    const kosul = ['tenant_id = ?']; const p = [ctx.tenant.id];
    if (filtre.durum) { kosul.push('durum = ?'); p.push(filtre.durum); }
    const projeler = sorgu(`SELECT * FROM proje WHERE ${kosul.join(' AND ')} ORDER BY kod`, ...p);

    const satirlar = projeler.map((pr) => {
      const butce = Number(tek(
        `SELECT COALESCE(SUM(toplam_minor),0) AS n FROM butce
          WHERE proje_id = ? AND durum = 'onaylandi'`, pr.id)?.n ?? 0);
      /* Gerçekleşen = kasa çıkışı + onaylı hakediş brütü (finans defteri). */
      const kasa = Number(tek(
        `SELECT COALESCE(SUM(tutar_minor),0) AS n FROM kasa_hareketi
          WHERE proje_id = ? AND yon = -1`, pr.id)?.n ?? 0);
      const hakedis = Number(tek(
        `SELECT COALESCE(SUM(h.brut_minor),0) AS n FROM hakedis h
           JOIN sozlesme s ON s.id = h.sozlesme_id
          WHERE s.proje_id = ? AND h.durum = 'onaylandi'`, pr.id)?.n ?? 0);
      const gerceklesen = kasa + hakedis;
      return {
        ...pr,
        santiye: say('SELECT COUNT(*) AS n FROM santiye WHERE proje_id = ?', pr.id),
        ilerleme: ilerlemeModulu.projeIlerlemesi(pr.id) / 1000,
        butce, gerceklesen, sapma: butce - gerceklesen,
        acikRisk: say(`SELECT COUNT(*) AS n FROM proje_riski WHERE proje_id = ? AND durum <> 'kapali'`, pr.id),
      };
    });

    const toplamButce = satirlar.reduce((t, s) => t + s.butce, 0);
    const toplamGerc = satirlar.reduce((t, s) => t + s.gerceklesen, 0);
    return {
      satirlar, veriTarihi: simdi(),
      kpiler: [
        { etiket: 'Proje', deger: String(satirlar.length),
          formul: 'count(proje)', kaynak: 'proje' },
        { etiket: 'Toplam onaylı bütçe', deger: para(toplamButce),
          formul: 'Σ butce.toplam_minor (durum = onaylandi)', kaynak: 'butce' },
        { etiket: 'Toplam gerçekleşen', deger: para(toplamGerc),
          formul: 'Σ kasa çıkışı + Σ onaylı hakediş brütü', kaynak: 'kasa_hareketi + hakedis' },
        { etiket: 'Bütçe kullanımı', deger: toplamButce ? `%${((toplamGerc / toplamButce) * 100).toFixed(1)}` : '—',
          formul: 'gerçekleşen ÷ onaylı bütçe', kaynak: 'türetilmiş',
          ton: toplamButce && toplamGerc > toplamButce ? 'danger' : '' },
      ],
    };
  },
};

/* ==========================================================================
   RPT-04 — Şantiye günlük özet
   ========================================================================== */
const RPT04 = {
  kod: 'RPT-04', ad: 'Şantiye günlük özet', rota: '/raporlar/santiye-gunluk',
  ozet: 'Üretim, insan, makine, olay', surum: 'v1', tabloBasligi: 'Günlük raporlar',
  filtreler: [
    { ad: 'santiye_id', etiket: 'Şantiye', kaynak: 'santiye' },
    { ad: 'baslangic', etiket: 'Başlangıç', tur: 'date' },
    { ad: 'bitis', etiket: 'Bitiş', tur: 'date' },
  ],
  filtreOzeti: (ctx, f) => [
    { etiket: 'Şantiye', deger: f.santiye_id
      ? tek('SELECT kod FROM santiye WHERE id = ?', f.santiye_id)?.kod : 'tümü' },
    { etiket: 'Dönem', deger: `${f.baslangic || '—'} → ${f.bitis || '—'}` },
  ],
  sutunlar: [
    { ad: 'rapor_gunu', etiket: 'Gün', genislik: 1 },
    { ad: 'santiye_kod', etiket: 'Şantiye', genislik: 1 },
    { ad: 'personel', etiket: 'Personel', tur: 'sayi', genislik: 0.8 },
    { ad: 'olay', etiket: 'İSG olayı', tur: 'sayi', genislik: 0.8 },
    { ad: 'bildirim', etiket: 'Saha bildirimi', tur: 'sayi', genislik: 0.9 },
    { ad: 'durum', etiket: 'Durum', genislik: 1 },
  ],
  veri(ctx, filtre) {
    const { bas, bit } = donemAraligi(filtre);
    const kosul = ['g.tenant_id = ?']; const p = [ctx.tenant.id];
    if (filtre.santiye_id) { kosul.push('g.santiye_id = ?'); p.push(filtre.santiye_id); }
    if (bas) { kosul.push('g.rapor_gunu >= ?'); p.push(gunAnahtari(bas)); }
    if (bit) { kosul.push('g.rapor_gunu < ?'); p.push(gunAnahtari(bit)); }
    const raporlar = sorgu(
      `SELECT g.*, s.kod AS santiye_kod FROM gunluk_rapor g
         JOIN santiye s ON s.id = g.santiye_id
        WHERE ${kosul.join(' AND ')} ORDER BY g.rapor_gunu DESC LIMIT 500`, ...p);

    const satirlar = raporlar.map((g) => ({
      ...g,
      personel: say('SELECT COUNT(*) AS n FROM puantaj WHERE santiye_id = ? AND gun = ?',
        g.santiye_id, g.rapor_gunu),
      olay: say(`SELECT COUNT(*) AS n FROM isg_olayi WHERE santiye_id = ?
                   AND date(olusturuldu/1000,'unixepoch') = ?`, g.santiye_id, g.rapor_gunu),
      bildirim: say(`SELECT COUNT(*) AS n FROM saha_bildirimi WHERE santiye_id = ?
                       AND date(olusturuldu/1000,'unixepoch') = ?`, g.santiye_id, g.rapor_gunu),
    }));
    return {
      satirlar, veriTarihi: simdi(),
      kpiler: [
        { etiket: 'Günlük rapor', deger: String(satirlar.length), formul: 'count(gunluk_rapor)',
          kaynak: 'gunluk_rapor' },
        { etiket: 'Onaylı rapor', deger: String(satirlar.filter((s) => s.durum === 'onaylandi').length),
          formul: 'count(durum = onaylandi)', kaynak: 'gunluk_rapor' },
        { etiket: 'Toplam İSG olayı', deger: String(satirlar.reduce((t, s) => t + s.olay, 0)),
          formul: 'Σ günlük İSG olayı', kaynak: 'isg_olayi' },
      ],
    };
  },
};

/* ==========================================================================
   RPT-05 — Maliyet ve bütçe sapma
   ========================================================================== */
const RPT05 = {
  kod: 'RPT-05', ad: 'Maliyet ve bütçe sapma', rota: '/raporlar/maliyet',
  ozet: 'Bütçe, taahhüt, gerçekleşen ve EAC', surum: 'v1', yon: 'a4yatay',
  tabloBasligi: 'Maliyet kodu bazında',
  aciklama: 'Taahhüt = onaylı siparişlerin kalan tutarı. Gerçekleşen = stok sarfı + '
    + 'kasa çıkışı. EAC (tahmini nihai maliyet) = gerçekleşen + taahhüt.',
  filtreler: [{ ad: 'proje_id', etiket: 'Proje', kaynak: 'proje' }],
  filtreOzeti: (ctx, f) => [{ etiket: 'Proje', deger: f.proje_id
    ? tek('SELECT kod FROM proje WHERE id = ?', f.proje_id)?.kod : 'tümü' }],
  sutunlar: [
    { ad: 'maliyet_kodu', etiket: 'Maliyet kodu', genislik: 1 },
    { ad: 'ad', etiket: 'Açıklama', genislik: 2 },
    { ad: 'butce', etiket: 'Bütçe', tur: 'para', genislik: 1.3 },
    { ad: 'taahhut', etiket: 'Taahhüt', tur: 'para', genislik: 1.3 },
    { ad: 'gerceklesen', etiket: 'Gerçekleşen', tur: 'para', genislik: 1.3 },
    { ad: 'eac', etiket: 'EAC', tur: 'para', genislik: 1.3 },
    { ad: 'sapma', etiket: 'Sapma', tur: 'para', genislik: 1.3 },
  ],
  veri(ctx, filtre) {
    const projeKosul = filtre.proje_id ? 'AND b.proje_id = ?' : '';
    const p = filtre.proje_id ? [ctx.tenant.id, filtre.proje_id] : [ctx.tenant.id];
    const satirlarHam = sorgu(
      `SELECT bs.maliyet_kodu, COALESCE(SUM(bs.tutar_minor),0) AS butce
         FROM butce_satiri bs JOIN butce b ON b.id = bs.butce_id
        WHERE b.tenant_id = ? AND b.durum = 'onaylandi' ${projeKosul}
        GROUP BY bs.maliyet_kodu ORDER BY bs.maliyet_kodu`, ...p);

    const satirlar = satirlarHam.map((r) => {
      const pf = filtre.proje_id ? 'AND proje_id = ?' : '';
      const pp = filtre.proje_id ? [r.maliyet_kodu, filtre.proje_id] : [r.maliyet_kodu];
      /* Gerçekleşen: stok defteri (çıkış) + kasa defteri (çıkış) — ikinci hesap yok. */
      const stok = Number(tek(
        `SELECT COALESCE(SUM(miktar_binde * COALESCE(birim_maliyet_minor,0) / 1000),0) AS n
           FROM stok_hareketi WHERE maliyet_kodu = ? AND yon = -1 ${pf}`, ...pp)?.n ?? 0);
      const kasa = Number(tek(
        `SELECT COALESCE(SUM(tutar_minor),0) AS n FROM kasa_hareketi
          WHERE maliyet_kodu = ? AND yon = -1 ${pf}`, ...pp)?.n ?? 0);
      const gerceklesen = Math.round(stok) + kasa;
      /* Taahhüt = onaylı siparişlerin HENÜZ TESLİM ALINMAMIŞ kalan tutarı.
         Maliyet kodu sipariş başlığında taşınır (kalemde değil). */
      const taahhut = Number(tek(
        `SELECT COALESCE(SUM((sk.miktar_binde - sk.teslim_binde)
                  * sk.birim_fiyat_minor / 1000), 0) AS n
           FROM siparis_kalemi sk JOIN siparis s ON s.id = sk.siparis_id
          WHERE s.maliyet_kodu = ? AND s.durum = 'onaylandi'
            AND sk.miktar_binde > sk.teslim_binde`, r.maliyet_kodu)?.n ?? 0);
      const eac = gerceklesen + Math.round(taahhut);
      return { ...r, ad: tek('SELECT ad FROM maliyet_kodu WHERE kod = ? AND tenant_id = ?',
        r.maliyet_kodu, ctx.tenant.id)?.ad || '—',
      gerceklesen, taahhut: Math.round(taahhut), eac, sapma: Number(r.butce) - eac };
    });

    const t = (alan) => satirlar.reduce((x, s) => x + Number(s[alan] || 0), 0);
    return {
      satirlar, veriTarihi: simdi(),
      kpiler: [
        { etiket: 'Onaylı bütçe', deger: para(t('butce')),
          formul: 'Σ butce_satiri.tutar_minor (bütçe durum = onaylandi)', kaynak: 'butce_satiri' },
        { etiket: 'Taahhüt', deger: para(t('taahhut')),
          formul: 'Σ (sipariş kalem miktarı − teslim edilen) × birim fiyat', kaynak: 'siparis_kalemi' },
        { etiket: 'Gerçekleşen', deger: para(t('gerceklesen')),
          formul: 'Σ stok çıkış maliyeti + Σ kasa çıkışı', kaynak: 'stok_hareketi + kasa_hareketi' },
        { etiket: 'EAC', deger: para(t('eac')), formul: 'gerçekleşen + taahhüt', kaynak: 'türetilmiş' },
        { etiket: 'Sapma', deger: para(t('sapma')), formul: 'bütçe − EAC', kaynak: 'türetilmiş',
          ton: t('sapma') < 0 ? 'danger' : 'ok' },
      ],
    };
  },
};

/* ==========================================================================
   RPT-06 — Nakit akışı
   ========================================================================== */
const RPT06 = {
  kod: 'RPT-06', ad: 'Nakit akışı', rota: '/raporlar/nakit-akisi',
  ozet: 'Vade ve onaylı tahmin', surum: 'v1', tabloBasligi: 'Vade dilimleri',
  aciklama: 'Bakiyeler `moduller/finans/defter.mjs` üzerinden okunur; hiçbir bakiye '
    + 'bu raporda yeniden hesaplanmaz (kural 7).',
  filtreler: [],
  filtreOzeti: () => [],
  sutunlar: [
    { ad: 'dilim', etiket: 'Vade dilimi', genislik: 1.4 },
    { ad: 'girisSayi', etiket: 'Tahsilat adedi', tur: 'sayi', genislik: 1 },
    { ad: 'giris', etiket: 'Beklenen tahsilat', tur: 'para', genislik: 1.5 },
    { ad: 'cikisSayi', etiket: 'Ödeme adedi', tur: 'sayi', genislik: 1 },
    { ad: 'cikis', etiket: 'Beklenen ödeme', tur: 'para', genislik: 1.5 },
    { ad: 'net', etiket: 'Net', tur: 'para', genislik: 1.5 },
  ],
  veri(ctx) {
    const bugun = simdi();
    const dilimler = [
      ['Gecikmiş', -Infinity, bugun], ['0-7 gün', bugun, bugun + 7 * GUN_MS],
      ['8-30 gün', bugun + 7 * GUN_MS, bugun + 30 * GUN_MS],
      ['31-90 gün', bugun + 30 * GUN_MS, bugun + 90 * GUN_MS],
      ['90+ gün', bugun + 90 * GUN_MS, Infinity],
    ];
    const satirlar = dilimler.map(([dilim, bas, bit]) => {
      const kosul = (alan) => `${alan} ${bas === -Infinity ? '<' : '>='} ?`
        + (bit === Infinity ? '' : ` AND ${alan} < ?`);
      const p = bas === -Infinity ? [bugun] : (bit === Infinity ? [bas] : [bas, bit]);
      const odeme = tek(
        `SELECT COUNT(*) AS adet, COALESCE(SUM(tutar_minor),0) AS toplam FROM odeme
          WHERE tenant_id = ? AND durum IN ('onaylandi','onaya_gonderildi')
            AND planlanan_tarih IS NOT NULL AND ${kosul('planlanan_tarih')}`, ctx.tenant.id, ...p);
      const fatura = tek(
        `SELECT COUNT(*) AS adet, COALESCE(SUM(toplam_minor),0) AS toplam FROM fatura
          WHERE tenant_id = ? AND yon = 'giden' AND durum <> 'odendi'
            AND vade_tarihi IS NOT NULL AND ${kosul('vade_tarihi')}`, ctx.tenant.id, ...p);
      const giris = Number(fatura?.toplam ?? 0); const cikis = Number(odeme?.toplam ?? 0);
      return { dilim, giris, cikis, net: giris - cikis,
        girisSayi: Number(fatura?.adet ?? 0), cikisSayi: Number(odeme?.adet ?? 0) };
    });

    const kasaToplam = finansDefteri.bakiyeler('kasa', ctx.tenant.id)
      .reduce((t, k) => t + k.bakiye_minor, 0);
    const bankaToplam = finansDefteri.bakiyeler('banka', ctx.tenant.id)
      .reduce((t, k) => t + k.bakiye_minor, 0);
    return {
      satirlar, veriTarihi: simdi(),
      kpiler: [
        { etiket: 'Kasa bakiyesi', deger: para(kasaToplam),
          formul: 'Σ (kasa_hareketi.yon × tutar_minor)', kaynak: 'finans/defter.mjs' },
        { etiket: 'Banka bakiyesi', deger: para(bankaToplam),
          formul: 'Σ (banka_hareketi.yon × tutar_minor)', kaynak: 'finans/defter.mjs' },
        { etiket: 'Toplam nakit', deger: para(kasaToplam + bankaToplam),
          formul: 'kasa + banka', kaynak: 'türetilmiş' },
        { etiket: '30 gün net', deger: para(satirlar.slice(0, 3).reduce((t, s) => t + s.net, 0)),
          formul: 'Σ (gecikmiş + 0-7 + 8-30) net', kaynak: 'türetilmiş' },
      ],
    };
  },
};

/* ==========================================================================
   RPT-07 — Satın alma çevrim süresi
   ========================================================================== */
const RPT07 = {
  kod: 'RPT-07', ad: 'Satın alma çevrim süresi', rota: '/raporlar/satinalma',
  ozet: 'Talep, onay, teklif, sipariş ve teslim süreleri', surum: 'v1',
  tabloBasligi: 'Talepler', yon: 'a4yatay',
  filtreler: [{ ad: 'durum', etiket: 'Durum' }],
  filtreOzeti: (ctx, f) => [{ etiket: 'Durum', deger: f.durum || 'tümü' }],
  sutunlar: [
    { ad: 'kod', etiket: 'Talep', genislik: 1 },
    { ad: 'baslik', etiket: 'Konu', genislik: 2.2 },
    { ad: 'durum', etiket: 'Durum', genislik: 1 },
    { ad: 'olusturuldu', etiket: 'Açılış', tur: 'tarih', genislik: 1 },
    { ad: 'onayGun', etiket: 'Onaya kadar (gün)', tur: 'ondalik', genislik: 1.1 },
    { ad: 'siparisGun', etiket: 'Siparişe kadar (gün)', tur: 'ondalik', genislik: 1.2 },
    { ad: 'tutar', etiket: 'Tutar', tur: 'para', genislik: 1.3 },
  ],
  veri(ctx, filtre) {
    const kosul = ['t.tenant_id = ?']; const p = [ctx.tenant.id];
    if (filtre.durum) { kosul.push('t.durum = ?'); p.push(filtre.durum); }
    const talepler = sorgu(
      `SELECT * FROM talep t WHERE ${kosul.join(' AND ')} ORDER BY t.olusturuldu DESC LIMIT 500`, ...p);

    const satirlar = talepler.map((t) => {
      const onay = tek(
        `SELECT kapandi FROM onay_talebi WHERE nesne = 'talep' AND nesne_id = ?
           AND sonuc = 'onaylandi' ORDER BY kapandi LIMIT 1`, t.id);
      const siparis = tek(
        `SELECT MIN(s.olusturuldu) AS ilk FROM siparis s
           JOIN siparis_kalemi sk ON sk.siparis_id = s.id
           JOIN talep_kalemi tk ON tk.id = sk.talep_kalemi_id
          WHERE tk.talep_id = ?`, t.id);
      const gun = (a, b) => (a && b ? Math.round(((b - a) / GUN_MS) * 10) / 10 : null);
      return { ...t,
        onayGun: gun(t.olusturuldu, onay?.kapandi),
        siparisGun: gun(t.olusturuldu, siparis?.ilk),
        tutar: t.tutar_minor };
    });

    const ort = (alan) => {
      const v = satirlar.map((s) => s[alan]).filter((x) => x != null);
      return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
    };
    return {
      satirlar, veriTarihi: simdi(),
      kpiler: [
        { etiket: 'Talep', deger: String(satirlar.length), formul: 'count(talep)', kaynak: 'talep' },
        { etiket: 'Ortalama onay süresi', deger: ort('onayGun') == null ? '—' : `${ort('onayGun')} gün`,
          formul: 'ortalama(onay kapanışı − talep açılışı)', kaynak: 'onay_talebi' },
        { etiket: 'Ortalama sipariş süresi',
          deger: ort('siparisGun') == null ? '—' : `${ort('siparisGun')} gün`,
          formul: 'ortalama(ilk sipariş − talep açılışı)', kaynak: 'siparis' },
        { etiket: 'Onaysız bekleyen',
          deger: String(satirlar.filter((s) => ['taslak', 'onaya_gonderildi', 'incelemede']
            .includes(s.durum)).length),
          formul: 'count(durum: taslak | onaya_gonderildi | incelemede)', kaynak: 'talep' },
      ],
    };
  },
};

/* ==========================================================================
   RPT-08 — Stok ve tüketim
   ========================================================================== */
const RPT08 = {
  kod: 'RPT-08', ad: 'Stok ve tüketim', rota: '/raporlar/stok',
  ozet: 'Devir, fire, sarf ve anomaliler', surum: 'v1', tabloBasligi: 'Depo × stok kartı',
  aciklama: 'Bakiye `moduller/stok/defter.mjs` `depoBakiyeleri()` fonksiyonundan gelir; '
    + 'ekrandaki stok listesiyle AYNI kaynak, ikinci bir toplama yok (kural 7).',
  filtreler: [{ ad: 'depo_id', etiket: 'Depo', kaynak: 'depo' }],
  filtreOzeti: (ctx, f) => [{ etiket: 'Depo', deger: f.depo_id
    ? tek('SELECT kod FROM depo WHERE id = ?', f.depo_id)?.kod : 'tümü' }],
  sutunlar: [
    { ad: 'depo_kod', etiket: 'Depo', genislik: 1 },
    { ad: 'kart_kod', etiket: 'Stok kodu', genislik: 1 },
    { ad: 'kart_ad', etiket: 'Malzeme', genislik: 2 },
    { ad: 'birim', etiket: 'Birim', genislik: 0.6 },
    { ad: 'bakiyeGosterim', etiket: 'Bakiye', tur: 'ondalik', genislik: 1 },
    { ad: 'kritikGosterim', etiket: 'Kritik seviye', tur: 'ondalik', genislik: 1 },
    { ad: 'durum', etiket: 'Durum', genislik: 1 },
  ],
  veri(ctx, filtre) {
    const bakiyeler = stokDefteri.depoBakiyeleri(ctx.tenant.id,
      filtre.depo_id ? { depoId: filtre.depo_id } : {});
    const satirlar = bakiyeler.map((r) => ({
      ...r,
      bakiyeGosterim: Number(r.bakiye_binde) / 1000,
      kritikGosterim: Number(r.kritik_seviye_binde || 0) / 1000,
      durum: r.kritik_seviye_binde > 0 && Number(r.bakiye_binde) < r.kritik_seviye_binde
        ? 'KRİTİK SEVİYE ALTINDA' : 'normal',
    }));
    const kritik = satirlar.filter((s) => s.durum !== 'normal');
    const sarf = Number(tek(
      `SELECT COALESCE(SUM(miktar_binde),0) AS n FROM stok_hareketi
        WHERE tenant_id = ? AND tur = 'sarf'`, ctx.tenant.id)?.n ?? 0);
    return {
      satirlar, veriTarihi: simdi(),
      kpiler: [
        { etiket: 'Depo × kart satırı', deger: String(satirlar.length),
          formul: 'count(distinct depo × stok kartı)', kaynak: 'stok/defter.mjs' },
        { etiket: 'Kritik seviye altında', deger: String(kritik.length),
          formul: 'count(bakiye < kritik seviye)', kaynak: 'stok/defter.mjs',
          ton: kritik.length ? 'danger' : 'ok' },
        { etiket: 'Toplam sarf', deger: `${(sarf / 1000).toLocaleString('tr-TR')} birim`,
          formul: "Σ stok_hareketi.miktar_binde (tur = sarf) ÷ 1000", kaynak: 'stok_hareketi' },
      ],
    };
  },
};

/* ==========================================================================
   RPT-09 — Personel ve puantaj
   ========================================================================== */
const RPT09 = {
  kod: 'RPT-09', ad: 'Personel ve puantaj', rota: '/raporlar/personel',
  ozet: 'Çalışma, fazla mesai, izin ve eksik kayıt', surum: 'v1', yon: 'a4yatay',
  tabloBasligi: 'Personel',
  filtreler: [
    { ad: 'baslangic', etiket: 'Başlangıç', tur: 'date' },
    { ad: 'bitis', etiket: 'Bitiş', tur: 'date' },
  ],
  filtreOzeti: (ctx, f) => [{ etiket: 'Dönem', deger: `${f.baslangic || '—'} → ${f.bitis || '—'}` }],
  sutunlar: [
    { ad: 'kod', etiket: 'Kod', genislik: 0.9 },
    { ad: 'ad_soyad', etiket: 'Ad soyad', genislik: 2 },
    { ad: 'gorev', etiket: 'Görev', genislik: 1.3 },
    { ad: 'durum', etiket: 'Durum', genislik: 0.9 },
    { ad: 'gun', etiket: 'Çalışılan gün', tur: 'sayi', genislik: 1 },
    { ad: 'fazlaSaat', etiket: 'Fazla mesai (saat)', tur: 'sayi', genislik: 1.1 },
    { ad: 'izinGun', etiket: 'İzin (gün)', tur: 'sayi', genislik: 0.9 },
    { ad: 'kilitsiz', etiket: 'Kilitlenmemiş gün', tur: 'sayi', genislik: 1.1 },
  ],
  veri(ctx, filtre) {
    const { bas, bit } = donemAraligi(filtre);
    const gunFiltre = bas || bit ? 'AND gun >= ? AND gun < ?' : '';
    const gp = bas || bit
      ? [gunAnahtari(bas || 0), gunAnahtari(bit || simdi() + GUN_MS)] : [];
    const personeller = sorgu(
      `SELECT * FROM personel WHERE tenant_id = ? ORDER BY ad_soyad`, ctx.tenant.id);
    const satirlar = personeller.map((p) => ({
      ...p,
      gun: say(`SELECT COUNT(*) AS n FROM puantaj WHERE personel_id = ? AND normal_saat > 0 ${gunFiltre}`,
        p.id, ...gp),
      fazlaSaat: say(`SELECT COALESCE(SUM(fazla_saat),0) AS n FROM puantaj
                        WHERE personel_id = ? ${gunFiltre}`, p.id, ...gp),
      izinGun: say(`SELECT COALESCE(SUM(gun_sayisi),0) AS n FROM izin
                      WHERE personel_id = ? AND durum = 'onaylandi'`, p.id),
      kilitsiz: say(`SELECT COUNT(*) AS n FROM puantaj WHERE personel_id = ? AND kilit = 0 ${gunFiltre}`,
        p.id, ...gp),
    }));
    return {
      satirlar, veriTarihi: simdi(),
      kpiler: [
        { etiket: 'Personel', deger: String(satirlar.length), formul: 'count(personel)',
          kaynak: 'personel' },
        { etiket: 'Aktif', deger: String(satirlar.filter((s) => s.durum === 'aktif').length),
          formul: 'count(durum = aktif)', kaynak: 'personel' },
        { etiket: 'Toplam fazla mesai',
          deger: `${satirlar.reduce((t, s) => t + s.fazlaSaat, 0)} saat`,
          formul: 'Σ puantaj.fazla_saat', kaynak: 'puantaj' },
        { etiket: 'Kilitlenmemiş gün',
          deger: String(satirlar.reduce((t, s) => t + s.kilitsiz, 0)),
          formul: 'count(puantaj.kilit = 0)', kaynak: 'puantaj',
          ton: satirlar.some((s) => s.kilitsiz) ? 'warn' : 'ok' },
      ],
    };
  },
};

/* ==========================================================================
   RPT-10 — İSG ve kalite
   ========================================================================== */
const RPT10 = {
  kod: 'RPT-10', ad: 'İSG ve kalite', rota: '/raporlar/isg-kalite',
  ozet: 'Olay, NCR, DÖF, denetim ve kapanış', surum: 'v1', tabloBasligi: 'Olay ve uygunsuzluklar',
  filtreler: [{ ad: 'santiye_id', etiket: 'Şantiye', kaynak: 'santiye' }],
  filtreOzeti: (ctx, f) => [{ etiket: 'Şantiye', deger: f.santiye_id
    ? tek('SELECT kod FROM santiye WHERE id = ?', f.santiye_id)?.kod : 'tümü' }],
  sutunlar: [
    { ad: 'tur', etiket: 'Kayıt türü', genislik: 1.2 },
    { ad: 'kod', etiket: 'Kod', genislik: 1 },
    { ad: 'baslik', etiket: 'Konu', genislik: 2.4 },
    { ad: 'durum', etiket: 'Durum', genislik: 1 },
    { ad: 'olusturuldu', etiket: 'Açılış', tur: 'tarih', genislik: 1 },
  ],
  veri(ctx, filtre) {
    const sk = filtre.santiye_id ? 'AND santiye_id = ?' : '';
    const p = filtre.santiye_id ? [ctx.tenant.id, filtre.santiye_id] : [ctx.tenant.id];
    const isg = sorgu(
      `SELECT 'İSG olayı' AS tur, kod, baslik, durum, olusturuldu FROM isg_olayi
        WHERE tenant_id = ? ${sk} ORDER BY olusturuldu DESC LIMIT 200`, ...p);
    const ncr = sorgu(
      `SELECT 'NCR' AS tur, kod, baslik, durum, olusturuldu FROM ncr
        WHERE tenant_id = ? ${sk} ORDER BY olusturuldu DESC LIMIT 200`, ...p);
    const satirlar = [...isg, ...ncr].sort((a, b) => b.olusturuldu - a.olusturuldu);
    const acik = (liste) => liste.filter((x) => !['kapali', 'iptal'].includes(x.durum)).length;
    return {
      satirlar, veriTarihi: simdi(),
      kpiler: [
        { etiket: 'İSG olayı', deger: String(isg.length), formul: 'count(isg_olayi)',
          kaynak: 'isg_olayi' },
        { etiket: 'Açık İSG olayı', deger: String(acik(isg)),
          formul: 'count(durum: kapali ve iptal dışındakiler)', kaynak: 'isg_olayi',
          ton: acik(isg) ? 'danger' : 'ok' },
        { etiket: 'NCR', deger: String(ncr.length), formul: 'count(ncr)', kaynak: 'ncr' },
        { etiket: 'Açık NCR', deger: String(acik(ncr)),
          formul: 'count(durum: kapali ve iptal dışındakiler)', kaynak: 'ncr', ton: acik(ncr) ? 'warn' : 'ok' },
      ],
    };
  },
};

/* ==========================================================================
   RPT-11 — Sözleşme ve hakediş
   ========================================================================== */
const RPT11 = {
  kod: 'RPT-11', ad: 'Sözleşme ve hakediş', rota: '/raporlar/sozlesme',
  ozet: 'Bedel, zeyil, hakediş ve kesinti', surum: 'v1', yon: 'a4yatay',
  tabloBasligi: 'Sözleşmeler',
  aciklama: 'Sözleşme bedeli, zeyil farkı, güncel bedel ve gerçekleşme oranı '
    + '`moduller/sozlesme/hakedis.mjs` fonksiyonlarından gelir — bu raporda ikinci bir hesap yoktur.',
  filtreler: [{ ad: 'proje_id', etiket: 'Proje', kaynak: 'proje' }],
  filtreOzeti: (ctx, f) => [{ etiket: 'Proje', deger: f.proje_id
    ? tek('SELECT kod FROM proje WHERE id = ?', f.proje_id)?.kod : 'tümü' }],
  sutunlar: [
    { ad: 'kod', etiket: 'Kod', genislik: 1 },
    { ad: 'ad', etiket: 'Sözleşme', genislik: 2.2 },
    { ad: 'durum', etiket: 'Durum', genislik: 1 },
    { ad: 'bedel', etiket: 'Sözleşme bedeli', tur: 'para', genislik: 1.4 },
    { ad: 'zeyil', etiket: 'Zeyil farkı', tur: 'para', genislik: 1.3 },
    { ad: 'guncel', etiket: 'Güncel bedel', tur: 'para', genislik: 1.4 },
    { ad: 'hakedisBrut', etiket: 'Onaylı hakediş', tur: 'para', genislik: 1.4 },
    { ad: 'gerceklesme', etiket: 'Gerçekleşme', tur: 'yuzde', genislik: 1 },
  ],
  veri(ctx, filtre) {
    const kosul = ['tenant_id = ?']; const p = [ctx.tenant.id];
    if (filtre.proje_id) { kosul.push('proje_id = ?'); p.push(filtre.proje_id); }
    const sozlesmeler = sorgu(
      `SELECT * FROM sozlesme WHERE ${kosul.join(' AND ')} ORDER BY kod`, ...p);
    const satirlar = sozlesmeler.map((s) => ({
      ...s,
      bedel: HK.sozlesmeBedeli(s.id),
      zeyil: HK.zeyilFarki(s.id),
      guncel: HK.guncelBedel(s.id),
      hakedisBrut: Number(tek(
        `SELECT COALESCE(SUM(brut_minor),0) AS n FROM hakedis
          WHERE sozlesme_id = ? AND durum = 'onaylandi'`, s.id)?.n ?? 0),
      gerceklesme: HK.gerceklesmeBinde(s.id) / 1000,
    }));
    const t = (alan) => satirlar.reduce((x, s) => x + Number(s[alan] || 0), 0);
    return {
      satirlar, veriTarihi: simdi(),
      kpiler: [
        { etiket: 'Sözleşme', deger: String(satirlar.length), formul: 'count(sozlesme)',
          kaynak: 'sozlesme' },
        { etiket: 'Toplam güncel bedel', deger: para(t('guncel')),
          formul: 'Σ (poz cetveli bedeli + onaylı zeyil farkı)', kaynak: 'sozlesme/hakedis.mjs' },
        { etiket: 'Onaylı hakediş', deger: para(t('hakedisBrut')),
          formul: 'Σ hakedis.brut_minor (durum = onaylandi)', kaynak: 'hakedis' },
        { etiket: 'Ortalama gerçekleşme',
          deger: t('guncel') ? `%${((t('hakedisBrut') / t('guncel')) * 100).toFixed(1)}` : '—',
          formul: 'onaylı hakediş brütü ÷ güncel bedel', kaynak: 'türetilmiş' },
      ],
    };
  },
};

/* ==========================================================================
   RPT-12 — Varlık ve bakım
   ========================================================================== */
const RPT12 = {
  kod: 'RPT-12', ad: 'Varlık ve bakım', rota: '/raporlar/varlik',
  ozet: 'Kullanılabilirlik, maliyet ve gecikmiş bakım', surum: 'v1',
  tabloBasligi: 'Varlıklar', yon: 'a4yatay',
  filtreler: [{ ad: 'tur', etiket: 'Tür' }, { ad: 'durum', etiket: 'Durum' }],
  filtreOzeti: (ctx, f) => [
    { etiket: 'Tür', deger: f.tur || 'tümü' }, { etiket: 'Durum', deger: f.durum || 'tümü' }],
  sutunlar: [
    { ad: 'kod', etiket: 'Kod', genislik: 1 },
    { ad: 'ad', etiket: 'Varlık', genislik: 2 },
    { ad: 'tur', etiket: 'Tür', genislik: 1 },
    { ad: 'durum', etiket: 'Durum', genislik: 1 },
    { ad: 'zimmet', etiket: 'Zimmet', genislik: 1.4 },
    { ad: 'acikIsEmri', etiket: 'Açık iş emri', tur: 'sayi', genislik: 1 },
    { ad: 'suresiDolanKontrol', etiket: 'Süresi dolan kontrol', tur: 'sayi', genislik: 1.2 },
  ],
  veri(ctx, filtre) {
    const kosul = ['tenant_id = ?']; const p = [ctx.tenant.id];
    if (filtre.tur) { kosul.push('tur = ?'); p.push(filtre.tur); }
    if (filtre.durum) { kosul.push('durum = ?'); p.push(filtre.durum); }
    const varliklar = sorgu(`SELECT * FROM varlik WHERE ${kosul.join(' AND ')} ORDER BY kod`, ...p);
    const satirlar = varliklar.map((v) => ({
      ...v,
      zimmet: tek(`SELECT p.ad_soyad FROM zimmet z LEFT JOIN personel p ON p.id = z.personel_id
                    WHERE z.varlik_id = ? AND z.durum = 'zimmetli'`, v.id)?.ad_soyad || '—',
      acikIsEmri: say(`SELECT COUNT(*) AS n FROM is_emri WHERE varlik_id = ?
                         AND durum NOT IN ('tamamlandi','iptal')`, v.id),
      suresiDolanKontrol: say(`SELECT COUNT(*) AS n FROM varlik_kontrolu WHERE varlik_id = ?
                                 AND durum = 'gecerli' AND gecerlilik IS NOT NULL AND gecerlilik < ?`,
      v.id, simdi()),
    }));
    const kullanilabilir = satirlar.filter((s) => s.durum === 'aktif').length;
    return {
      satirlar, veriTarihi: simdi(),
      kpiler: [
        { etiket: 'Varlık', deger: String(satirlar.length), formul: 'count(varlik)', kaynak: 'varlik' },
        { etiket: 'Kullanılabilirlik',
          deger: satirlar.length ? `%${((kullanilabilir / satirlar.length) * 100).toFixed(1)}` : '—',
          formul: 'count(durum = aktif) ÷ count(varlik)', kaynak: 'türetilmiş' },
        { etiket: 'Açık bakım iş emri',
          deger: String(satirlar.reduce((t, s) => t + s.acikIsEmri, 0)),
          formul: 'count(is_emri.varlik_id, durum: tamamlandi/iptal dışı)', kaynak: 'is_emri' },
        { etiket: 'Süresi dolan kontrol',
          deger: String(satirlar.reduce((t, s) => t + s.suresiDolanKontrol, 0)),
          formul: 'count(varlik_kontrolu.gecerlilik < şimdi)', kaynak: 'varlik_kontrolu',
          ton: satirlar.some((s) => s.suresiDolanKontrol) ? 'danger' : 'ok' },
      ],
    };
  },
};

/* ==========================================================================
   RPT-13 — Kartlar raporu (CRD-17 bu raporun takma adıdır)
   ========================================================================== */
const RPT13 = {
  kod: 'RPT-13', ad: 'Kartlar raporu', rota: '/raporlar/kartlar',
  ozet: 'Pluxee, MultiNet ve diğer kartlar', surum: 'v1', yon: 'a4yatay',
  tabloBasligi: 'Kartlar',
  aciklama: 'Bakiye `moduller/kartlar/defter.mjs` `kartBakiyeleri()` fonksiyonundan gelir. '
    + '§6.5 gereği YÖNETİCİ RAPORUNDA gereksiz üye işyeri ve kişisel harcama ayrıntısı '
    + 'gösterilmez; rapor kart ve dönem düzeyinde TOPLULAŞTIRILMIŞTIR.',
  filtreler: [{ ad: 'hesap_id', etiket: 'Sağlayıcı hesabı', kaynak: 'saglayici_hesabi' }],
  filtreOzeti: (ctx, f) => [{ etiket: 'Hesap', deger: f.hesap_id
    ? tek('SELECT kod FROM saglayici_hesabi WHERE id = ?', f.hesap_id)?.kod : 'tümü' }],
  sutunlar: [
    { ad: 'kod', etiket: 'Kart', genislik: 1 },
    { ad: 'maskeliNo', etiket: 'Numara', genislik: 1 },
    { ad: 'saglayici', etiket: 'Sağlayıcı', genislik: 1.3 },
    { ad: 'hesap', etiket: 'Hesap', genislik: 1.3 },
    { ad: 'atanan', etiket: 'Atanan', genislik: 1.6 },
    { ad: 'durum', etiket: 'Durum', genislik: 1 },
    { ad: 'bakiye_minor', etiket: 'Bakiye', tur: 'para', genislik: 1.3 },
    { ad: 'bekleyen_minor', etiket: 'Bekleyen', tur: 'para', genislik: 1.2 },
  ],
  veri(ctx, filtre) {
    const bakiyeler = kartDefteri.kartBakiyeleri(ctx.tenant.id,
      filtre.hesap_id ? { hesapId: filtre.hesap_id } : {});
    const satirlar = bakiyeler.map((k) => {
      const hesap = tek(
        `SELECT h.kod, h.ad, s.ad AS saglayici FROM saglayici_hesabi h
           JOIN kart_saglayici s ON s.id = h.saglayici_id WHERE h.id = ?`, k.hesap_id);
      const atama = tek(
        `SELECT p.ad_soyad, v.kod AS varlik_kod, a.departman FROM kart_atamasi a
           LEFT JOIN personel p ON p.id = a.personel_id
           LEFT JOIN varlik v ON v.id = a.varlik_id
          WHERE a.kart_id = ? AND a.durum = 'aktif' LIMIT 1`, k.kart_id);
      return { ...k,
        /* TAM NUMARA YOK: yalnız son dört hane (K-085). */
        maskeliNo: `•••• ${k.maskeli_no}`,
        saglayici: hesap?.saglayici || '—',
        hesap: hesap?.ad || '—',
        atanan: atama?.ad_soyad || atama?.varlik_kod || atama?.departman || '—' };
    });
    const t = (alan) => satirlar.reduce((x, s) => x + Number(s[alan] || 0), 0);
    return {
      satirlar, veriTarihi: simdi(),
      kpiler: [
        { etiket: 'Kart', deger: String(satirlar.length), formul: 'count(kart)', kaynak: 'kart' },
        { etiket: 'Aktif kart', deger: String(satirlar.filter((s) => s.durum === 'aktif').length),
          formul: 'count(durum = aktif)', kaynak: 'kart' },
        { etiket: 'Toplam bakiye', deger: para(t('bakiye_minor')),
          formul: 'Σ (kart_hareketi.yon × tutar_minor), kesinleşmiş', kaynak: 'kartlar/defter.mjs' },
        { etiket: 'Bekleyen işlem', deger: para(t('bekleyen_minor')),
          formul: 'Σ (kart_hareketi.yon × tutar_minor), kesinleşmemiş', kaynak: 'kartlar/defter.mjs' },
        { etiket: 'Bloke / kayıp',
          deger: String(satirlar.filter((s) => ['gecici_bloke', 'kayip_calinti'].includes(s.durum)).length),
          formul: 'count(durum: gecici_bloke | kayip_calinti)', kaynak: 'kart' },
      ],
    };
  },
};

/* ========================================================================== */
export const RAPORLAR = [RPT03, RPT04, RPT05, RPT06, RPT07, RPT08, RPT09, RPT10,
  RPT11, RPT12, RPT13];

export const raporBul = (kod) => RAPORLAR.find((r) => r.kod === kod)
  || RAPORLAR.find((r) => r.rota === kod);

/**
 * RPT-15 formül sözlüğü — TÜM raporların KPI'ları buradan derlenir.
 * Sözlük elle yazılmaz: tanımlardan ÜRETİLİR, böylece bir rapora formülsüz
 * gösterge eklenirse sözlükte de boş görünür ve test kırılır.
 */
export function formulSozlugu(ctx) {
  const satirlar = [];
  for (const r of RAPORLAR) {
    let kpiler = [];
    try { kpiler = r.veri(ctx, {}).kpiler || []; } catch { kpiler = []; }
    for (const k of kpiler) {
      satirlar.push({ rapor: `${r.kod} — ${r.ad}`, gosterge: k.etiket,
        formul: k.formul || '', kaynak: k.kaynak || '', surum: r.surum || 'v1' });
    }
  }
  return satirlar;
}
