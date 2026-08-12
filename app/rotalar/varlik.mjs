/* ============================================================================
   VARLIK VE FİLO — AST-01..10
   ----------------------------------------------------------------------------
   Kural 4 uygulaması: araçlar ayrı tablo değil, `varlik` tablosunun
   `tur = 'arac'` filtrelenmiş görünümüdür (AST-08). Bakım iş emri de ayrı bir
   nesne değil, `is_emri` kaydının varlığa bağlı hâlidir (AST-06) — böylece aynı
   geçiş motoru ve aynı liste kalıbı kullanılır.

   §7 bağı: "Varlık kontrol süresi doldu → varlık durumu ve iş emri: kullanım
   engeli ve bakım görevi." Süresi dolan kontrol varlığı KULLANIM DIŞI yapar.
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, gunAnahtari, gunBaslangici, GUN_MS } from '../cekirdek/zaman.mjs';
import { Para } from '../cekirdek/para.mjs';
import { DogrulamaHatasi, GecisIzinsiz, Bulunamadi, Cakisma, UygulamaHatasi } from '../cekirdek/hata.mjs';
import { idempotent } from '../cekirdek/idempotency.mjs';
import { miktarAyristir, miktarMetni } from '../moduller/stok/defter.mjs';
import { kayitModulu, kullaniciSecenekleri, santiyeSecenekleri, sayac, gecmisKarti } from './kayit-modulu.mjs';
import {
  ekranNesnesi, hataNesnesi, kullaniciAdi, ciz, kaydiAl, listeSorgusu, filtreKosullari,
  B, h, ham, sayi, csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar,
  sorgu, tek, calistir, islem, surumluGuncelle, audit, sonrakiKod, gecisYap,
} from './ortak.mjs';

const para = (minor, birim = 'TRY') => (minor == null ? '—' : Para.minor(minor, birim || 'TRY').bicim());
const VARLIK_TURLERI = [
  { deger: 'demirbas', etiket: 'Demirbaş' }, { deger: 'makine', etiket: 'İş makinesi' },
  { deger: 'arac', etiket: 'Araç' }, { deger: 'ekipman', etiket: 'Ekipman' },
  { deger: 'kalip', etiket: 'Kalıp' }, { deger: 'iskele', etiket: 'İskele' },
  { deger: 'diger', etiket: 'Diğer' },
];
const SAHIPLIK = [
  { deger: 'mulk', etiket: 'Mülk' }, { deger: 'kiralik', etiket: 'Kiralık' },
  { deger: 'leasing', etiket: 'Leasing' }, { deger: 'taseron', etiket: 'Taşeron malı' },
];
const KONTROL_TURLERI = [
  { deger: 'periyodik_kontrol', etiket: 'Periyodik kontrol' },
  { deger: 'kalibrasyon', etiket: 'Kalibrasyon' }, { deger: 'muayene', etiket: 'Araç muayenesi' },
  { deger: 'sigorta', etiket: 'Sigorta' }, { deger: 'egzoz', etiket: 'Egzoz' },
  { deger: 'fenni', etiket: 'Fenni muayene' },
];
const OLAY_TURLERI = [
  { deger: 'kaza', etiket: 'Kaza' }, { deger: 'ceza', etiket: 'Ceza' },
  { deger: 'hasar', etiket: 'Hasar' }, { deger: 'ariza', etiket: 'Arıza' },
  { deger: 'cekici', etiket: 'Çekici' },
];

const varlikSecenekleri = (ctx, { tur = null } = {}) => sorgu(
  `SELECT id, kod, ad, plaka FROM varlik WHERE tenant_id = ?
     AND durum NOT IN ('satildi','hurda') ${tur ? 'AND tur = ?' : ''} ORDER BY kod`,
  ...(tur ? [ctx.tenant.id, tur] : [ctx.tenant.id]))
  .map((v) => ({ deger: v.id, etiket: `${v.kod} — ${v.ad}${v.plaka ? ` (${v.plaka})` : ''}` }));

/** Süresi dolmuş zorunlu kontrol sayısı — hesaplanan işaret, saklanmaz. */
export const kontrolUyarisi = (varlikId) => Number(tek(
  `SELECT COUNT(*) AS n FROM varlik_kontrolu WHERE varlik_id = ? AND durum = 'gecerli'
     AND gecerlilik IS NOT NULL AND gecerlilik < ?`, varlikId, simdi())?.n ?? 0);

/** Zamanı gelen bakım planı sayısı (gün veya sayaç periyoduna göre). */
export function bakimUyarisi(varlikId) {
  const v = tek('SELECT sayac_deger FROM varlik WHERE id = ?', varlikId);
  return sorgu(`SELECT * FROM bakim_plani WHERE varlik_id = ? AND durum = 'aktif'`, varlikId)
    .filter((p) => {
      if (p.periyot_gun && p.son_bakim_tarihi
        && simdi() >= p.son_bakim_tarihi + p.periyot_gun * GUN_MS) return true;
      if (p.periyot_gun && !p.son_bakim_tarihi) return true;
      if (p.periyot_sayac && v && (v.sayac_deger - (p.son_bakim_sayac || 0)) >= p.periyot_sayac) return true;
      return false;
    }).length;
}

export const acikZimmet = (varlikId) => tek(
  `SELECT z.*, p.ad_soyad, p.kod AS personel_kod FROM zimmet z
     LEFT JOIN personel p ON p.id = z.personel_id
    WHERE z.varlik_id = ? AND z.durum = 'zimmetli' ORDER BY z.teslim_tarihi DESC LIMIT 1`, varlikId);

export function kur(y, ekranRota) {
  /* ================= AST-01..03 Varlıklar ============================== */
  ekranRota(y, 'AST-01', { get: (ctx) => varlikListesi(ctx, {}) });

  ekranRota(y, 'AST-02', {
    get: (ctx) => html(ctx, 200, ciz(ctx, ekranNesnesi('AST-02'), varlikFormu(ctx, {}))),
    post: (ctx, govde) => {
      const e = ekranNesnesi('AST-02');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const sonuc = idempotent(
          { anahtar: govde._idempotency, tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, govde },
          () => varlikAc(ctx, govde));
        return yonlendir(ctx, `/varliklar/${sonuc.id}?olusan=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, ciz(ctx, e, varlikFormu(ctx, { deger: govde, hata: hataNesnesi(err) })));
      }
    },
  });

  ekranRota(y, 'AST-03', {
    get: (ctx, _g, params) => varlikDetayi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('AST-03');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      csrfZorunlu(ctx, govde);
      const v = kaydiAl(ctx, 'varlik', 'varlik', params.id);
      try {
        const mesaj = varlikIslemi(ctx, v, govde);
        return yonlendir(ctx, `/varliklar/${v.id}?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return varlikDetayi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ================= AST-04 Zimmet ===================================== */
  ekranRota(y, 'AST-04', {
    get: (ctx) => zimmetSayfasi(ctx),
    post: (ctx, govde) => {
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = govde._eylem === 'gecis' ? zimmetGecisi(ctx, govde) : zimmetAc(ctx, govde);
        return yonlendir(ctx, `/zimmetler?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return zimmetSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= AST-05 Bakım planları ============================= */
  ekranRota(y, 'AST-05', {
    get: (ctx) => bakimPlaniSayfasi(ctx),
    post: (ctx, govde) => {
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = govde._eylem === 'is_emri' ? bakimIsEmriAc(ctx, govde) : bakimPlaniAc(ctx, govde);
        return yonlendir(ctx, `/bakim-planlari?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return bakimPlaniSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= AST-06 Bakım iş emirleri (is_emri görünümü) ======= */
  ekranRota(y, 'AST-06', { get: (ctx) => bakimIsEmirleri(ctx) });

  /* ================= AST-07 Kalibrasyon ve kontrol ===================== */
  ekranRota(y, 'AST-07', {
    get: (ctx) => kontrolSayfasi(ctx),
    post: (ctx, govde) => {
      yetkiZorunlu(ctx, 'AST-07:olustur');
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = kontrolKaydet(ctx, govde);
        return yonlendir(ctx, `/varlik-kontrolleri?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return kontrolSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= AST-08 Araçlar (varlık görünümü) ================== */
  ekranRota(y, 'AST-08', { get: (ctx) => varlikListesi(ctx, { tur: 'arac', kod: 'AST-08' }) });

  /* ================= AST-09 Yakıt ve kilometre ========================= */
  ekranRota(y, 'AST-09', {
    get: (ctx) => yakitSayfasi(ctx),
    post: (ctx, govde) => {
      yetkiZorunlu(ctx, 'AST-09:olustur');
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = yakitKaydet(ctx, govde);
        return yonlendir(ctx, `/araclar/yakit?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return yakitSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= AST-10 Kaza, ceza ve hasar ======================== */
  ekranRota(y, 'AST-10', {
    get: (ctx) => olaySayfasi(ctx),
    post: (ctx, govde) => {
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = govde._eylem === 'gecis' ? olayGecisi(ctx, govde) : olayAc(ctx, govde);
        return yonlendir(ctx, `/araclar/olaylar?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return olaySayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });
}

/* ==========================================================================
   AST-01 / AST-08 — tek liste, iki görünüm (kural 4)
   ========================================================================== */
function varlikListesi(ctx, { tur = null, kod = 'AST-01' }) {
  const e = ekranNesnesi(kod);
  yetkiZorunlu(ctx, e.yetki);
  const { kosullar, parametreler } = filtreKosullari(ctx, {
    aramaAlanlari: ['ad', 'kod', 'plaka', 'seri_no'],
    filtreler: [{ ad: 'durum' }, { ad: 'sahiplik' }, { ad: 'santiye_id' },
      ...(tur ? [] : [{ ad: 'tur' }])],
  });
  if (tur) { kosullar.push('tur = ?'); parametreler.push(tur); }
  const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
    { tablo: 'varlik', kosullar, parametreler, sirala: 'kod' });

  const zengin = satirlar.map((v) => ({
    ...v, kontrol_uyarisi: kontrolUyarisi(v.id), bakim_uyarisi: bakimUyarisi(v.id),
    zimmet: acikZimmet(v.id),
  }));
  const kontrolluk = sorgu(
    `SELECT COUNT(DISTINCT v.id) AS n FROM varlik v JOIN varlik_kontrolu k ON k.varlik_id = v.id
      WHERE v.tenant_id = ? AND k.durum = 'gecerli' AND k.gecerlilik IS NOT NULL AND k.gecerlilik < ?
        ${tur ? 'AND v.tur = ?' : ''}`,
    ...(tur ? [ctx.tenant.id, simdi(), tur] : [ctx.tenant.id, simdi()]))[0]?.n ?? 0;

  const icerik = h`
${Number(kontrolluk) ? B.sonucSeridi({ tur: 'warn',
    baslik: `${kontrolluk} varlığın periyodik kontrol süresi doldu`,
    aciklama: 'Süresi dolan kontrol kullanım engelidir (§7); varlık kullanım dışı bırakılmalıdır.',
    kayitRota: '/varlik-kontrolleri' }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: tur === 'arac' ? 'Araç' : 'Varlık', ikon: 'fa-truck-ramp-box',
        deger: sayi(sayac(ctx.tenant.id, 'varlik',
          `durum NOT IN ('satildi','hurda')${tur ? ` AND tur = '${tur}'` : ''}`)) },
      { etiket: 'Zimmetli', deger: sayi(sayac(ctx.tenant.id, 'zimmet', `durum = 'zimmetli'`)),
        ikon: 'fa-hand-holding' },
      { etiket: 'Bakımda / arızalı', ikon: 'fa-screwdriver-wrench', ton: 'warn',
        deger: sayi(sayac(ctx.tenant.id, 'varlik', `durum IN ('bakimda','arizali')`)) },
      { etiket: 'Kontrol süresi dolan', deger: sayi(Number(kontrolluk)), ikon: 'fa-triangle-exclamation',
        ton: Number(kontrolluk) ? 'danger' : '' },
    ]),
    filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Ad, kod, plaka veya seri no…',
      filtreler: [
        ...(tur ? [] : [{ ad: 'tur', etiket: 'Tür', secenekler: VARLIK_TURLERI }]),
        { ad: 'durum', etiket: 'Durum', secenekler: ['aktif', 'bakimda', 'arizali', 'kullanim_disi',
          'satildi', 'hurda'].map((d) => ({ deger: d, etiket: d })) },
        { ad: 'sahiplik', etiket: 'Sahiplik', secenekler: SAHIPLIK },
        { ad: 'santiye_id', etiket: 'Şantiye', secenekler: santiyeSecenekleri(ctx) },
      ] }),
    icerik: B.tablo({
      satirlar: zengin,
      satirRota: (v) => `/varliklar/${v.id}`,
      bosDurum: { baslik: tur === 'arac' ? 'Araç yok' : 'Varlık yok', ikon: 'fa-truck-ramp-box',
        aciklama: 'Araçlar da varlık kaydıdır; ayrı bir araç tablosu yoktur (kural 4).',
        eylem: yetkiVar(ctx, 'AST-02:olustur')
          ? B.btn('Yeni varlık', { tur: 'acc', rota: '/varliklar/yeni', ikon: 'fa-plus' }) : null },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'ad', etiket: tur === 'arac' ? 'Araç' : 'Varlık',
          govde: (v) => h`<a href="/varliklar/${v.id}"><b>${v.ad}</b></a><br><span class="muted">${
            [v.marka, v.model, v.plaka].filter(Boolean).join(' · ') || VARLIK_TURLERI
              .find((t) => t.deger === v.tur)?.etiket}</span>` },
        ...(tur ? [] : [{ ad: 'tur', etiket: 'Tür',
          govde: (v) => VARLIK_TURLERI.find((t) => t.deger === v.tur)?.etiket || v.tur }]),
        { ad: 'santiye_id', etiket: 'Şantiye', govde: (v) => (v.santiye_id
          ? tek('SELECT kod FROM santiye WHERE id = ?', v.santiye_id)?.kod || '—' : '—') },
        { ad: 'zimmet', etiket: 'Zimmet', govde: (v) => (v.zimmet
          ? h`<a href="/personel/${v.zimmet.personel_id}">${v.zimmet.ad_soyad || 'zimmetli'}</a>`
          : h`<span class="muted">boşta</span>`) },
        { ad: 'sayac_deger', etiket: 'Sayaç', hizala: 'sag', govde: (v) => (v.sayac_turu === 'yok'
          ? '—' : `${sayi(v.sayac_deger)} ${v.sayac_turu}`) },
        { ad: 'uyari', etiket: 'Uyarı', govde: (v) => h`${v.kontrol_uyarisi
          ? B.isaret('kontrol süresi doldu', 'danger') : ''}${v.bakim_uyarisi
          ? B.isaret('bakım zamanı', 'warn') : ''}${!v.kontrol_uyarisi && !v.bakim_uyarisi
          ? B.isaret('temiz', 'ok') : ''}` },
        { ad: 'durum', etiket: 'Durum', govde: (v) => B.rozet(
          v.durum === 'aktif' ? 'onaylandi' : ['satildi', 'hurda'].includes(v.durum) ? 'kapali' : 'beklemede',
          { aktif: 'Aktif', bakimda: 'Bakımda', arizali: 'Arızalı', kullanim_disi: 'Kullanım dışı',
            satildi: 'Satıldı', hurda: 'Hurda' }[v.durum]) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${tur === 'arac' ? h`<div class="gv-card" style="margin-top:18px"><div class="gc-body">
  <p class="gf-hint" style="margin:0">Bu ekran <a href="/varliklar">varlık listesinin</a>
    <code>tür = araç</code> görünümüdür; ayrı bir araç kaydı tutulmaz (kural 4).</p>
</div></div>` : ''}`;
  return html(ctx, 200, ciz(ctx, e, icerik, {
    eylemler: yetkiVar(ctx, 'AST-02:olustur')
      ? B.btn('Yeni varlık', { tur: 'acc', rota: '/varliklar/yeni', ikon: 'fa-plus' }) : null,
  }));
}

function varlikAc(ctx, govde) {
  const ad = String(govde.ad || '').trim();
  if (!ad) throw DogrulamaHatasi('Varlık adı zorunludur.', { alanlar: { ad: ['Ad girin.'] } });
  const tur = VARLIK_TURLERI.some((t) => t.deger === govde.tur) ? govde.tur : 'demirbas';
  if (tur === 'arac' && !String(govde.plaka || '').trim()) {
    throw DogrulamaHatasi('Araç kaydında plaka zorunludur.', { alanlar: { plaka: ['Plaka girin.'] } });
  }
  if (govde.plaka && tek('SELECT id FROM varlik WHERE tenant_id = ? AND plaka = ?',
    ctx.tenant.id, govde.plaka)) {
    throw Cakisma(`"${govde.plaka}" plakalı araç zaten kayıtlı.`);
  }
  const sayacTuru = ['yok', 'km', 'saat'].includes(govde.sayacTuru) ? govde.sayacTuru : 'yok';
  const sayacDeger = govde.sayacDeger ? Number(govde.sayacDeger) : 0;
  if (!Number.isInteger(sayacDeger) || sayacDeger < 0) {
    throw DogrulamaHatasi('Sayaç değeri sıfır veya pozitif tam sayı olmalı.',
      { alanlar: { sayacDeger: ['Geçersiz değer.'] } });
  }
  const santiye = govde.santiyeId
    ? tek('SELECT * FROM santiye WHERE id = ? AND tenant_id = ?', govde.santiyeId, ctx.tenant.id) : null;
  const bedel = govde.alisBedeli
    ? Para.ayristir(govde.alisBedeli, ctx.tenant.para_birimi).minor : null;

  return islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'varlik');
    const id = kimlik('varlik');
    calistir(`INSERT INTO varlik (id, tenant_id, kod, ad, tur, kategori, marka, model, seri_no, plaka,
                yil, santiye_id, proje_id, sahiplik, tedarikci_id, alis_tarihi, alis_bedeli_minor,
                alis_bedeli_birim, sayac_turu, sayac_deger, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'aktif', ?,?)`,
      id, ctx.tenant.id, kod, ad, tur, govde.kategori || null, govde.marka || null,
      govde.model || null, govde.seriNo || null, govde.plaka || null,
      govde.yil ? Number(govde.yil) : null, santiye?.id || null, santiye?.proje_id || null,
      govde.sahiplik || 'mulk', govde.tedarikciId || null,
      govde.alisTarihi ? gunBaslangici(govde.alisTarihi) : null,
      bedel == null ? null : String(bedel), ctx.tenant.para_birimi,
      sayacTuru, sayacDeger, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'varlik', nesneId: id, eylem: 'olustur', sonraki: { kod, ad, tur, plaka: govde.plaka } });
    return { id, kod };
  });
}

function varlikFormu(ctx, { deger = {}, hata = null }) {
  const e = ekranNesnesi('AST-02');
  return B.form({
    rota: e.rota, csrf: csrfAlani(ctx), idempotencyAnahtari: kimlik('idempotency'), hatalar: hata,
    bolumler: [
      { baslik: 'Varlık künyesi',
        aciklama: 'Araç da bir varlıktır: türü "Araç" seçin, plaka zorunlu olur.',
        alanlar: h`
          ${B.alan({ ad: 'ad', etiket: 'Varlık adı', zorunlu: true, genis: true,
            deger: deger.ad || '', hata: hata?.alanlar?.ad })}
          ${B.alan({ ad: 'tur', etiket: 'Tür', deger: deger.tur || 'demirbas', secenekler: VARLIK_TURLERI })}
          ${B.alan({ ad: 'kategori', etiket: 'Kategori', deger: deger.kategori || '' })}
          ${B.alan({ ad: 'marka', etiket: 'Marka', deger: deger.marka || '' })}
          ${B.alan({ ad: 'model', etiket: 'Model', deger: deger.model || '' })}
          ${B.alan({ ad: 'seriNo', etiket: 'Seri no', deger: deger.seriNo || '' })}
          ${B.alan({ ad: 'plaka', etiket: 'Plaka (araçta zorunlu)', deger: deger.plaka || '',
            hata: hata?.alanlar?.plaka })}
          ${B.alan({ ad: 'yil', etiket: 'Model yılı', tur: 'number', deger: deger.yil || '' })}` },
      { baslik: 'Sahiplik ve konum', alanlar: h`
          ${B.alan({ ad: 'sahiplik', etiket: 'Sahiplik', deger: deger.sahiplik || 'mulk',
            secenekler: SAHIPLIK })}
          ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye', deger: deger.santiyeId || '',
            secenekler: [{ deger: '', etiket: 'Merkez' }, ...santiyeSecenekleri(ctx)] })}
          ${B.alan({ ad: 'alisTarihi', etiket: 'Alış/kiralama tarihi', tur: 'date',
            deger: deger.alisTarihi || '' })}
          ${B.alan({ ad: 'alisBedeli', etiket: 'Alış bedeli', deger: deger.alisBedeli || '' })}` },
      { baslik: 'Sayaç',
        aciklama: 'Sayaç yalnız İLERİ gider; yakıt kaydında geri değer girilemez.',
        alanlar: h`
          ${B.alan({ ad: 'sayacTuru', etiket: 'Sayaç türü', deger: deger.sayacTuru || 'yok',
            secenekler: [{ deger: 'yok', etiket: 'Sayaç yok' }, { deger: 'km', etiket: 'Kilometre' },
              { deger: 'saat', etiket: 'Çalışma saati' }] })}
          ${B.alan({ ad: 'sayacDeger', etiket: 'Açılış sayaç değeri', tur: 'number',
            deger: deger.sayacDeger || '0', hata: hata?.alanlar?.sayacDeger })}` },
    ],
    eylemler: h`${B.btn('Vazgeç', { rota: '/varliklar' })}
      ${B.btn('Kaydet ve detaya git', { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' })}`,
  });
}

function varlikIslemi(ctx, v, govde) {
  if (govde._eylem === 'gecis') {
    /* Açık zimmet varken varlık satılamaz/hurdaya ayrılamaz (§7 iade zinciri). */
    if (['sat', 'hurdaya_ayir'].includes(govde.gecis) && acikZimmet(v.id)) {
      throw GecisIzinsiz('Açık zimmet var; önce zimmet iadesi alınmalı.');
    }
    gecisYap(ctx, { nesne: 'varlik', tablo: 'varlik', kayit: v, eylem: govde.gecis,
      gerekce: govde.gerekce, ekranKodu: 'AST-03' });
    return 'Varlık durumu güncellendi';
  }
  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

function varlikDetayi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('AST-03');
  yetkiZorunlu(ctx, e.yetki);
  const v = kaydiAl(ctx, 'varlik', 'varlik', id);
  const zengin = { ...v, kontrol_uyarisi: kontrolUyarisi(v.id), bakim_uyarisi: bakimUyarisi(v.id) };
  const zimmetler = sorgu(
    `SELECT z.*, p.ad_soyad, p.kod AS personel_kod FROM zimmet z LEFT JOIN personel p ON p.id = z.personel_id
      WHERE z.varlik_id = ? ORDER BY z.teslim_tarihi DESC LIMIT 20`, v.id);
  const kontroller = sorgu(
    'SELECT * FROM varlik_kontrolu WHERE varlik_id = ? ORDER BY kontrol_tarihi DESC LIMIT 20', v.id);
  const planlar = sorgu('SELECT * FROM bakim_plani WHERE varlik_id = ? ORDER BY ad', v.id);
  const isEmirleri = sorgu(
    'SELECT * FROM is_emri WHERE varlik_id = ? ORDER BY olusturuldu DESC LIMIT 20', v.id);
  const yakitlar = sorgu('SELECT * FROM yakit_kaydi WHERE varlik_id = ? ORDER BY tarih DESC LIMIT 10', v.id);
  const olaylar = sorgu('SELECT * FROM arac_olayi WHERE varlik_id = ? ORDER BY olay_tarihi DESC LIMIT 10', v.id);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: 'Varlık kaydedildi' }) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${zengin.kontrol_uyarisi ? B.sonucSeridi({ tur: 'hata',
    baslik: `${zengin.kontrol_uyarisi} periyodik kontrolün süresi doldu`,
    aciklama: 'Bu varlık sahada kullanılamaz; kontrol yenilenmeli veya kullanım dışı bırakılmalıdır (§7).',
    kayitRota: '/varlik-kontrolleri' }) : ''}
${B.detayOzetSeridi({
    kod: v.kod, baslik: v.ad,
    durum: v.durum === 'aktif' ? 'onaylandi' : ['satildi', 'hurda'].includes(v.durum) ? 'kapali' : 'beklemede',
    surum: v.surum,
    isaretler: [
      ...(zengin.kontrol_uyarisi ? [{ metin: 'kontrol süresi doldu', ton: 'danger' }] : []),
      ...(zengin.bakim_uyarisi ? [{ metin: 'bakım zamanı', ton: 'warn' }] : []),
    ],
    bilgiler: [
      { etiket: 'Tür', deger: VARLIK_TURLERI.find((t) => t.deger === v.tur)?.etiket || v.tur },
      { etiket: 'Marka / model', deger: [v.marka, v.model].filter(Boolean).join(' ') || '—' },
      { etiket: v.tur === 'arac' ? 'Plaka' : 'Seri no', deger: v.plaka || v.seri_no || '—' },
      { etiket: 'Sahiplik', deger: SAHIPLIK.find((s) => s.deger === v.sahiplik)?.etiket },
      { etiket: 'Sayaç', deger: v.sayac_turu === 'yok' ? '—' : `${v.sayac_deger} ${v.sayac_turu}` },
      { etiket: 'Zimmet', deger: acikZimmet(v.id)?.ad_soyad || 'boşta' },
    ],
    birincilEylem: B.btn('Varlık listesi', { rota: v.tur === 'arac' ? '/araclar' : '/varliklar' }),
  })}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Periyodik kontroller</b>
        <span>Süresi dolan kontrol kullanım engelidir (§7).</span></div>
        ${B.btn('Kontrol ekle', { rota: `/varlik-kontrolleri?varlik_id=${v.id}`, kucuk: true })}</div>
      <div class="gc-body flush">${B.tablo({
    satirlar: kontroller,
    bosDurum: { baslik: 'Kontrol kaydı yok', ikon: 'fa-clipboard-check' },
    sutunlar: [
      { ad: 'ad', etiket: 'Kontrol', govde: (k) => h`<b>${k.ad}</b><br><span class="muted">${
        KONTROL_TURLERI.find((t) => t.deger === k.tur)?.etiket || k.tur}</span>` },
      { ad: 'kontrol_tarihi', etiket: 'Tarih', govde: (k) => tarih(k.kontrol_tarihi) },
      { ad: 'gecerlilik', etiket: 'Geçerlilik', govde: (k) => (!k.gecerlilik ? 'süresiz'
        : k.gecerlilik < simdi() ? B.isaret(`${tarih(k.gecerlilik)} — doldu`, 'danger')
          : tarih(k.gecerlilik)) },
      { ad: 'sonuc', etiket: 'Sonuç', govde: (k) => B.isaret(k.sonuc,
        k.sonuc === 'uygun' ? 'ok' : k.sonuc === 'sartli' ? 'warn' : 'danger') },
    ],
  })}</div>
    </div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Bakım planları ve iş emirleri</b>
        <span>Bakım iş emri ayrı bir nesne değildir; <code>is_emri</code> kaydıdır (kural 4).</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: [...planlar.map((p) => ({ ...p, tip: 'Plan' })),
      ...isEmirleri.map((i) => ({ ...i, tip: 'İş emri' }))],
    satirRota: (r) => (r.tip === 'İş emri' ? `/is-emirleri/${r.id}` : null),
    bosDurum: { baslik: 'Bakım planı yok', ikon: 'fa-screwdriver-wrench' },
    sutunlar: [
      { ad: 'tip', etiket: 'Tip' },
      { ad: 'ad', etiket: 'Kayıt', govde: (r) => h`<b>${r.ad || r.baslik}</b>` },
      { ad: 'periyot', etiket: 'Periyot / termin', govde: (r) => (r.tip === 'Plan'
        ? [r.periyot_gun ? `${r.periyot_gun} gün` : null,
          r.periyot_sayac ? `${r.periyot_sayac} ${v.sayac_turu}` : null].filter(Boolean).join(' · ') || '—'
        : (r.termin ? tarih(r.termin) : '—')) },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
    ],
  })}</div>
    </div>
    ${v.tur === 'arac' ? h`<div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Son yakıt kayıtları</b></div>
        ${B.btn('Tümü', { rota: `/araclar/yakit?varlik_id=${v.id}`, kucuk: true })}</div>
      <div class="gc-body flush">${B.tablo({
    satirlar: yakitlar,
    bosDurum: { baslik: 'Yakıt kaydı yok', ikon: 'fa-gas-pump' },
    sutunlar: [
      { ad: 'tarih', etiket: 'Tarih', govde: (r) => tarih(r.tarih) },
      { ad: 'sayac_deger', etiket: 'Sayaç', hizala: 'sag', govde: (r) => sayi(r.sayac_deger) },
      { ad: 'litre_binde', etiket: 'Litre', hizala: 'sag', govde: (r) => miktarMetni(r.litre_binde) },
      { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag', govde: (r) => para(r.tutar_minor, r.tutar_birim) },
    ],
  })}</div>
    </div>` : ''}
    ${gecmisKarti('varlik', v)}
  </div>
  <div class="gv-side-stack">
    ${zimmetler.length ? h`<div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Zimmet geçmişi</b></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: zimmetler,
    bosDurum: { baslik: 'Zimmet yok' },
    sutunlar: [
      { ad: 'ad_soyad', etiket: 'Kişi', govde: (z) => z.ad_soyad || kullaniciAdi(z.kullanici_id) },
      { ad: 'teslim_tarihi', etiket: 'Teslim', govde: (z) => tarih(z.teslim_tarihi) },
      { ad: 'durum', etiket: 'Durum', govde: (z) => B.rozet(
        z.durum === 'zimmetli' ? 'beklemede' : z.durum === 'iade' ? 'onaylandi' : 'reddedildi') },
    ],
  })}</div>
    </div>` : ''}
    ${olaylar.length ? h`<div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Kaza, ceza ve hasar</b></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: olaylar,
    bosDurum: { baslik: 'Olay yok' },
    sutunlar: [
      { ad: 'olay_tarihi', etiket: 'Tarih', govde: (o) => tarih(o.olay_tarihi) },
      { ad: 'tur', etiket: 'Tür', govde: (o) => OLAY_TURLERI.find((t) => t.deger === o.tur)?.etiket },
      { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag', govde: (o) => para(o.tutar_minor, o.tutar_birim) },
      { ad: 'durum', etiket: 'Durum', govde: (o) => B.rozet(o.durum) },
    ],
  })}</div>
    </div>` : ''}
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Durum işlemleri</b>
        <span>Açık zimmet varken varlık satılamaz veya hurdaya ayrılamaz.</span></div></div>
      <div class="gc-body">
        ${yetkiVar(ctx, 'AST-03:guncelle') ? h`
        <form method="post" action="/varliklar/${v.id}" data-gform="1">
          ${ham(csrfAlani(ctx))}
          <input type="hidden" name="_eylem" value="gecis">
          <input type="hidden" name="surum" value="${v.surum}">
          ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe', tur: 'metin' })}
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
            ${[['aktif', [['bakima_al', 'Bakıma al'], ['ariza_bildir', 'Arıza bildir'],
    ['kullanim_disi_birak', 'Kullanım dışı bırak']]],
  ['bakimda', [['bakimdan_al', 'Bakımdan çıkar']]],
  ['arizali', [['bakima_al', 'Bakıma al'], ['kullanim_disi_birak', 'Kullanım dışı bırak']]],
  ['kullanim_disi', [['kullanima_al', 'Kullanıma al'], ['sat', 'Satıldı'],
    ['hurdaya_ayir', 'Hurdaya ayır']]]]
    .find(([d]) => d === v.durum)?.[1]?.map(([kod, etiket]) => h`
      <button class="btn ${ham(['sat', 'hurdaya_ayir'].includes(kod) ? 'btn-danger' : 'btn-ghost')}"
        type="submit" name="gecis" value="${kod}">${etiket}</button>`) || ''}
          </div>
        </form>` : ''}
      </div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: v.kod, baslik: v.ad }));
}

/* ==========================================================================
   AST-04 zimmet
   ========================================================================== */
function zimmetAc(ctx, govde) {
  yetkiZorunlu(ctx, 'AST-04:olustur');
  const v = tek('SELECT * FROM varlik WHERE id = ? AND tenant_id = ?', govde.varlikId, ctx.tenant.id);
  if (!v) throw DogrulamaHatasi('Varlık seçin.', { alanlar: { varlikId: ['Varlık bulunamadı.'] } });
  if (['satildi', 'hurda'].includes(v.durum)) {
    throw GecisIzinsiz(`"${v.durum}" durumundaki varlık zimmetlenemez.`);
  }
  /* Bir varlık aynı anda TEK kişide olabilir. */
  const mevcut = acikZimmet(v.id);
  if (mevcut) {
    throw Cakisma(`${v.kod} zaten ${mevcut.ad_soyad || 'birine'} zimmetli; önce iade alınmalı.`);
  }
  if (kontrolUyarisi(v.id)) {
    throw GecisIzinsiz('Periyodik kontrol süresi dolmuş varlık zimmetlenemez (§7).');
  }
  const p = govde.personelId
    ? tek('SELECT * FROM personel WHERE id = ? AND tenant_id = ?', govde.personelId, ctx.tenant.id) : null;
  if (!p && !govde.kullaniciId) {
    throw DogrulamaHatasi('Personel veya kullanıcı seçin.', { alanlar: { personelId: ['Kişi seçin.'] } });
  }

  islem(() => {
    const id = kimlik('zimmet');
    calistir(`INSERT INTO zimmet (id, tenant_id, varlik_id, personel_id, kullanici_id, santiye_id,
                teslim_tarihi, teslim_notu, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?, 'zimmetli', ?,?)`,
      id, ctx.tenant.id, v.id, p?.id || null, govde.kullaniciId || null,
      v.santiye_id, govde.teslimTarihi ? gunBaslangici(govde.teslimTarihi) : simdi(),
      govde.teslimNotu || null, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'zimmet', nesneId: id, eylem: 'zimmetlendi',
      sonraki: { varlik: v.kod, personel: p?.kod || null } });
  });
  return `${v.kod} zimmetlendi`;
}

function zimmetGecisi(ctx, govde) {
  yetkiZorunlu(ctx, 'AST-04:guncelle');
  const z = tek('SELECT * FROM zimmet WHERE id = ? AND tenant_id = ?', govde.id, ctx.tenant.id);
  if (!z) throw Bulunamadi('Zimmet bulunamadı.');
  gecisYap(ctx, { nesne: 'zimmet', tablo: 'zimmet', kayit: z, eylem: govde.gecis,
    gerekce: govde.gerekce, ekranKodu: 'AST-04',
    ekAlanlar: { iade_tarihi: simdi(), iade_notu: govde.gerekce || null } });
  return 'Zimmet durumu güncellendi';
}

function zimmetSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('AST-04');
  yetkiZorunlu(ctx, e.yetki);
  const kosullar = ['z.tenant_id = ?']; const parametreler = [ctx.tenant.id];
  if (ctx.sorgu.get('durum')) { kosullar.push('z.durum = ?'); parametreler.push(ctx.sorgu.get('durum')); }
  else kosullar.push(`z.durum = 'zimmetli'`);
  const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
  const nerede = kosullar.join(' AND ');
  const toplam = Number(tek(`SELECT COUNT(*) AS n FROM zimmet z WHERE ${nerede}`, ...parametreler)?.n ?? 0);
  const satirlar = sorgu(
    `SELECT z.*, v.kod AS varlik_kod, v.ad AS varlik_ad, v.tur AS varlik_tur,
            p.ad_soyad, p.kod AS personel_kod
       FROM zimmet z JOIN varlik v ON v.id = z.varlik_id
       LEFT JOIN personel p ON p.id = z.personel_id
      WHERE ${nerede} ORDER BY z.teslim_tarihi DESC LIMIT ? OFFSET ?`, ...parametreler, boyut, atla);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Zimmetli varlık', deger: sayi(sayac(ctx.tenant.id, 'zimmet', `durum = 'zimmetli'`)),
        ikon: 'fa-hand-holding' },
      { etiket: 'İade edilen', deger: sayi(sayac(ctx.tenant.id, 'zimmet', `durum = 'iade'`)),
        ikon: 'fa-rotate-left' },
      { etiket: 'Kayıp / hasarlı', ton: 'danger', ikon: 'fa-circle-xmark',
        deger: sayi(sayac(ctx.tenant.id, 'zimmet', `durum IN ('kayip','hasarli')`)) },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ]),
    filtre: B.filtreBari({ rota: '/zimmetler', sorgu: ctx.sorgu, aramaYer: 'Ara…',
      filtreler: [{ ad: 'durum', etiket: 'Durum', secenekler: ['zimmetli', 'iade', 'devir', 'hasarli', 'kayip']
        .map((d) => ({ deger: d, etiket: d })) }] }),
    icerik: B.tablo({
      satirlar,
      bosDurum: { baslik: 'Zimmet kaydı yok', ikon: 'fa-hand-holding',
        aciklama: 'Bir varlık aynı anda tek kişide olabilir.' },
      sutunlar: [
        { ad: 'varlik_kod', etiket: 'Varlık', govde: (z) => h`<a href="/varliklar/${z.varlik_id}">
          <b>${z.varlik_kod}</b></a><br><span class="muted">${z.varlik_ad}</span>` },
        { ad: 'ad_soyad', etiket: 'Kişi', govde: (z) => (z.personel_id
          ? h`<a href="/personel/${z.personel_id}">${z.ad_soyad}</a>` : kullaniciAdi(z.kullanici_id)) },
        { ad: 'teslim_tarihi', etiket: 'Teslim', govde: (z) => tarih(z.teslim_tarihi) },
        { ad: 'iade_tarihi', etiket: 'İade', govde: (z) => (z.iade_tarihi ? tarih(z.iade_tarihi) : '—') },
        { ad: 'durum', etiket: 'Durum', govde: (z) => (z.durum === 'zimmetli' && yetkiVar(ctx, 'AST-04:guncelle')
          ? h`<form method="post" action="/zimmetler" style="display:flex;gap:6px;flex-wrap:wrap">
              ${ham(csrfAlani(ctx))}
              <input type="hidden" name="_eylem" value="gecis">
              <input type="hidden" name="id" value="${z.id}">
              <input type="text" name="gerekce" placeholder="Not" aria-label="Not" style="max-width:100px">
              <button class="btn btn-ghost btn-sm" type="submit" name="gecis" value="iade_al">İade al</button>
              <button class="btn btn-ghost btn-sm" type="submit" name="gecis" value="hasarli_iade">Hasarlı</button>
              <button class="btn btn-danger btn-sm" type="submit" name="gecis" value="kayip_bildir">Kayıp</button>
            </form>`
          : B.rozet(z.durum === 'iade' ? 'onaylandi' : z.durum === 'zimmetli' ? 'beklemede' : 'reddedildi',
            { zimmetli: 'Zimmetli', iade: 'İade', devir: 'Devir', hasarli: 'Hasarlı', kayip: 'Kayıp' }[z.durum])) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: '/zimmetler', sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'AST-04:olustur') ? B.form({
    rota: '/zimmetler', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni zimmet',
      aciklama: 'Kontrol süresi dolmuş varlık zimmetlenemez; bir varlık tek kişide olur.',
      alanlar: h`
      ${B.alan({ ad: 'varlikId', etiket: 'Varlık', zorunlu: true, deger: deger.varlikId || '',
    hata: hata?.alanlar?.varlikId, secenekler: [{ deger: '', etiket: 'Seçin…' }, ...varlikSecenekleri(ctx)] })}
      ${B.alan({ ad: 'personelId', etiket: 'Personel', deger: deger.personelId || '',
    hata: hata?.alanlar?.personelId, secenekler: [{ deger: '', etiket: 'Seçin…' }, ...sorgu(
      `SELECT id, kod, ad_soyad FROM personel WHERE tenant_id = ? AND durum IN ('aday','aktif','izinli')
        ORDER BY ad_soyad`, ctx.tenant.id).map((p) => ({ deger: p.id, etiket: `${p.kod} — ${p.ad_soyad}` }))] })}
      ${B.alan({ ad: 'kullaniciId', etiket: 'veya uygulama kullanıcısı', deger: deger.kullaniciId || '',
    secenekler: [{ deger: '', etiket: 'Seçin…' }, ...kullaniciSecenekleri(ctx)] })}
      ${B.alan({ ad: 'teslimTarihi', etiket: 'Teslim tarihi', tur: 'date',
    deger: deger.teslimTarihi || gunAnahtari(simdi()) })}
      ${B.alan({ ad: 'teslimNotu', etiket: 'Teslim notu', tur: 'metin', genis: true,
    deger: deger.teslimNotu || '' })}` }],
    eylemler: B.btn('Zimmetle', { tur: 'acc', gonder: true, ikon: 'fa-hand-holding' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/* ==========================================================================
   AST-05 / AST-06 bakım
   ========================================================================== */
function bakimPlaniAc(ctx, govde) {
  yetkiZorunlu(ctx, 'AST-05:olustur');
  const v = tek('SELECT * FROM varlik WHERE id = ? AND tenant_id = ?', govde.varlikId, ctx.tenant.id);
  if (!v) throw DogrulamaHatasi('Varlık seçin.', { alanlar: { varlikId: ['Varlık bulunamadı.'] } });
  const ad = String(govde.ad || '').trim();
  if (!ad) throw DogrulamaHatasi('Plan adı zorunludur.', { alanlar: { ad: ['Ad girin.'] } });
  const gun = govde.periyotGun ? Number(govde.periyotGun) : null;
  const sayacP = govde.periyotSayac ? Number(govde.periyotSayac) : null;
  if (!gun && !sayacP) {
    throw DogrulamaHatasi('Gün veya sayaç periyodundan en az biri girilmelidir.',
      { alanlar: { periyotGun: ['Periyot girin.'] } });
  }
  if (sayacP && v.sayac_turu === 'yok') {
    throw DogrulamaHatasi('Bu varlıkta sayaç tanımlı değil; sayaç periyodu kullanılamaz.',
      { alanlar: { periyotSayac: ['Varlıkta sayaç yok.'] } });
  }
  islem(() => {
    const id = kimlik('varlik').replace('ast', 'bpl');
    calistir(`INSERT INTO bakim_plani (id, tenant_id, varlik_id, ad, tur, periyot_gun, periyot_sayac,
                son_bakim_tarihi, son_bakim_sayac, talimat, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?, 'aktif', ?,?)`,
      id, ctx.tenant.id, v.id, ad, gun && sayacP ? 'karma' : (gun ? 'periyodik' : 'sayac'),
      gun, sayacP, govde.sonBakimTarihi ? gunBaslangici(govde.sonBakimTarihi) : null,
      v.sayac_deger, govde.talimat || null, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'bakim_plani', nesneId: id, eylem: 'olustur',
      sonraki: { varlik: v.kod, ad, periyotGun: gun, periyotSayac: sayacP } });
  });
  return `${ad} bakım planı oluşturuldu`;
}

/** Bakım iş emri AYRI bir nesne değil; `is_emri` kaydıdır (kural 4). */
function bakimIsEmriAc(ctx, govde) {
  yetkiZorunlu(ctx, 'AST-06:olustur');
  const p = tek('SELECT * FROM bakim_plani WHERE id = ? AND tenant_id = ?', govde.planId, ctx.tenant.id);
  if (!p) throw Bulunamadi('Bakım planı bulunamadı.');
  const v = tek('SELECT * FROM varlik WHERE id = ?', p.varlik_id);
  const acik = tek(
    `SELECT * FROM is_emri WHERE bakim_plani_id = ? AND durum NOT IN ('tamamlandi','iptal')`, p.id);
  if (acik) throw Cakisma(`Bu bakım planı için açık iş emri var (${acik.kod}).`);

  const kayit = islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'is_emri');
    const id = kimlik('gorev');
    calistir(`INSERT INTO is_emri (id, tenant_id, kod, baslik, tur, aciklama, proje_id, santiye_id,
                varlik_id, bakim_plani_id, oncelik, termin, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?, 'bakim', ?,?,?,?,?,?,?, 'taslak', ?,?)`,
      id, ctx.tenant.id, kod, `${v.kod} — ${p.ad}`, p.talimat || null,
      v.proje_id, v.santiye_id, v.id, p.id, 'normal', simdi() + 7 * GUN_MS,
      ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'is_emri', nesneId: id, eylem: 'bakim_planindan_acildi',
      sonraki: { kod, varlik: v.kod, plan: p.ad } });
    return { kod };
  });
  return `${kayit.kod} bakım iş emri açıldı`;
}

function bakimPlaniSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('AST-05');
  yetkiZorunlu(ctx, e.yetki);
  const planlar = sorgu(
    `SELECT p.*, v.kod AS varlik_kod, v.ad AS varlik_ad, v.sayac_turu, v.sayac_deger
       FROM bakim_plani p JOIN varlik v ON v.id = p.varlik_id
      WHERE p.tenant_id = ? ORDER BY v.kod, p.ad LIMIT 200`, ctx.tenant.id);
  const zengin = planlar.map((p) => {
    const gecikmeGun = p.periyot_gun && p.son_bakim_tarihi
      ? Math.floor((simdi() - (p.son_bakim_tarihi + p.periyot_gun * GUN_MS)) / GUN_MS) : null;
    const sayacFark = p.periyot_sayac
      ? (p.sayac_deger - (p.son_bakim_sayac || 0)) - p.periyot_sayac : null;
    const acikIsEmri = tek(
      `SELECT kod, id FROM is_emri WHERE bakim_plani_id = ? AND durum NOT IN ('tamamlandi','iptal')`, p.id);
    return { ...p, gecikmeGun, sayacFark, acikIsEmri,
      zamani: (gecikmeGun != null && gecikmeGun >= 0) || (sayacFark != null && sayacFark >= 0)
        || (p.periyot_gun && !p.son_bakim_tarihi) };
  });

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Bakım planı', deger: sayi(planlar.length), ikon: 'fa-calendar-check' },
      { etiket: 'Zamanı gelen', deger: sayi(zengin.filter((p) => p.zamani).length),
        ikon: 'fa-bell', ton: zengin.some((p) => p.zamani) ? 'warn' : '' },
      { etiket: 'Açık bakım iş emri', ikon: 'fa-screwdriver-wrench',
        deger: sayi(sayac(ctx.tenant.id, 'is_emri', `tur = 'bakim' AND durum NOT IN ('tamamlandi','iptal')`)) },
      { etiket: 'Bakımdaki varlık', deger: sayi(sayac(ctx.tenant.id, 'varlik', `durum = 'bakimda'`)),
        ikon: 'fa-wrench' },
    ]),
    icerik: B.tablo({
      satirlar: zengin,
      bosDurum: { baslik: 'Bakım planı yok', ikon: 'fa-calendar-check',
        aciklama: 'Plan gün ve/veya sayaç periyoduna göre iş emri üretir.' },
      sutunlar: [
        { ad: 'varlik_kod', etiket: 'Varlık', govde: (p) => h`<a href="/varliklar/${p.varlik_id}">
          <b>${p.varlik_kod}</b></a><br><span class="muted">${p.varlik_ad}</span>` },
        { ad: 'ad', etiket: 'Plan', govde: (p) => h`<b>${p.ad}</b>` },
        { ad: 'periyot', etiket: 'Periyot', govde: (p) => [
          p.periyot_gun ? `${p.periyot_gun} gün` : null,
          p.periyot_sayac ? `${p.periyot_sayac} ${p.sayac_turu}` : null].filter(Boolean).join(' · ') },
        { ad: 'son_bakim_tarihi', etiket: 'Son bakım',
          govde: (p) => (p.son_bakim_tarihi ? tarih(p.son_bakim_tarihi) : 'hiç') },
        { ad: 'zamani', etiket: 'Durum', govde: (p) => (p.zamani
          ? B.isaret(p.gecikmeGun != null && p.gecikmeGun >= 0 ? `${p.gecikmeGun} gün gecikti` : 'sayaç doldu',
            'warn') : B.isaret('zamanı gelmedi', 'ok')) },
        { ad: 'isEmri', etiket: 'İş emri', govde: (p) => (p.acikIsEmri
          ? h`<a href="/is-emirleri/${p.acikIsEmri.id}">${p.acikIsEmri.kod}</a>`
          : (p.zamani && yetkiVar(ctx, 'AST-06:olustur')
            ? h`<form method="post" action="/bakim-planlari" style="display:inline">${ham(csrfAlani(ctx))}
                <input type="hidden" name="_eylem" value="is_emri">
                <input type="hidden" name="planId" value="${p.id}">
                <button class="btn btn-acc btn-sm" type="submit">İş emri aç</button></form>`
            : '—')) },
      ],
    }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'AST-05:olustur') ? B.form({
    rota: '/bakim-planlari', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni bakım planı',
      aciklama: 'Gün ve/veya sayaç periyodu; sayaç periyodu yalnız sayacı olan varlıkta kullanılır.',
      alanlar: h`
      ${B.alan({ ad: 'varlikId', etiket: 'Varlık', zorunlu: true, deger: deger.varlikId || '',
    hata: hata?.alanlar?.varlikId, secenekler: [{ deger: '', etiket: 'Seçin…' }, ...varlikSecenekleri(ctx)] })}
      ${B.alan({ ad: 'ad', etiket: 'Plan adı', zorunlu: true, genis: true, deger: deger.ad || '',
    hata: hata?.alanlar?.ad })}
      ${B.alan({ ad: 'periyotGun', etiket: 'Gün periyodu', tur: 'number', deger: deger.periyotGun || '',
    hata: hata?.alanlar?.periyotGun })}
      ${B.alan({ ad: 'periyotSayac', etiket: 'Sayaç periyodu', tur: 'number',
    deger: deger.periyotSayac || '', hata: hata?.alanlar?.periyotSayac })}
      ${B.alan({ ad: 'sonBakimTarihi', etiket: 'Son bakım tarihi', tur: 'date',
    deger: deger.sonBakimTarihi || '' })}
      ${B.alan({ ad: 'talimat', etiket: 'Bakım talimatı', tur: 'metin', genis: true,
    deger: deger.talimat || '' })}` }],
    eylemler: B.btn('Planı kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/** AST-06 — `is_emri` tablosunun bakım görünümü (kural 4). */
function bakimIsEmirleri(ctx) {
  const e = ekranNesnesi('AST-06');
  yetkiZorunlu(ctx, e.yetki);
  const { kosullar, parametreler } = filtreKosullari(ctx, {
    aramaAlanlari: ['baslik', 'kod'], filtreler: [{ ad: 'durum' }, { ad: 'oncelik' }],
  });
  kosullar.push(`tur = 'bakim'`);
  const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
    { tablo: 'is_emri', kosullar, parametreler, sirala: 'olusturuldu DESC' });

  const icerik = h`
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Açık bakım emri', ikon: 'fa-screwdriver-wrench',
        deger: sayi(sayac(ctx.tenant.id, 'is_emri', `tur = 'bakim' AND durum NOT IN ('tamamlandi','iptal')`)) },
      { etiket: 'Gecikmiş', ton: 'danger', ikon: 'fa-clock',
        deger: sayi(sayac(ctx.tenant.id, 'is_emri',
          `tur = 'bakim' AND termin < ? AND durum NOT IN ('tamamlandi','iptal')`, simdi())) },
      { etiket: 'Tamamlanan', ikon: 'fa-circle-check',
        deger: sayi(sayac(ctx.tenant.id, 'is_emri', `tur = 'bakim' AND durum = 'tamamlandi'`)) },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ]),
    filtre: B.filtreBari({ rota: '/bakim-is-emirleri', sorgu: ctx.sorgu, aramaYer: 'Başlık veya kod…',
      filtreler: [{ ad: 'durum', etiket: 'Durum', secenekler: ['taslak', 'acik', 'devam_ediyor',
        'dogrulamada', 'tamamlandi'].map((d) => ({ deger: d, etiket: d })) }] }),
    icerik: B.tablo({
      satirlar,
      satirRota: (r) => `/is-emirleri/${r.id}`,
      bosDurum: { baslik: 'Bakım iş emri yok', ikon: 'fa-screwdriver-wrench',
        aciklama: 'Bakım iş emri, bakım planından açılır ve iş emri ekranında yürür (kural 4).',
        eylem: B.btn('Bakım planları', { rota: '/bakim-planlari', ikon: 'fa-calendar-check' }) },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'baslik', etiket: 'İş emri', govde: (r) => h`<a href="/is-emirleri/${r.id}"><b>${r.baslik}</b></a>` },
        { ad: 'varlik_id', etiket: 'Varlık', govde: (r) => (r.varlik_id
          ? h`<a href="/varliklar/${r.varlik_id}">${
            tek('SELECT kod FROM varlik WHERE id = ?', r.varlik_id)?.kod || '—'}</a>` : '—') },
        { ad: 'termin', etiket: 'Termin', govde: (r) => (!r.termin ? '—'
          : r.termin < simdi() && !['tamamlandi', 'iptal'].includes(r.durum)
            ? B.isaret(tarih(r.termin), 'danger') : tarih(r.termin)) },
        { ad: 'gerceklesen_saat', etiket: 'Süre', hizala: 'sag',
          govde: (r) => (r.gerceklesen_saat != null ? `${r.gerceklesen_saat} s` : '—') },
        { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: '/bakim-is-emirleri', sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
<div class="gv-card" style="margin-top:18px"><div class="gc-body">
  <p class="gf-hint" style="margin:0">Bu ekran <a href="/is-emirleri">iş emri listesinin</a>
    <code>tür = bakım</code> görünümüdür; ayrı bir bakım iş emri tablosu yoktur (kural 4).</p>
</div></div>`;
  return html(ctx, 200, ciz(ctx, e, icerik));
}

/* ==========================================================================
   AST-07 kontrol
   ========================================================================== */
function kontrolKaydet(ctx, govde) {
  const v = tek('SELECT * FROM varlik WHERE id = ? AND tenant_id = ?', govde.varlikId, ctx.tenant.id);
  if (!v) throw DogrulamaHatasi('Varlık seçin.', { alanlar: { varlikId: ['Varlık bulunamadı.'] } });
  const ad = String(govde.ad || '').trim();
  if (!ad) throw DogrulamaHatasi('Kontrol adı zorunludur.', { alanlar: { ad: ['Ad girin.'] } });
  const sonuc = ['uygun', 'uygun_degil', 'sartli'].includes(govde.sonuc) ? govde.sonuc : 'uygun';
  const gecerlilik = govde.gecerlilik ? gunBaslangici(govde.gecerlilik) : null;

  return islem(() => {
    const id = kimlik('varlik').replace('ast', 'ktr');
    calistir(`INSERT INTO varlik_kontrolu (id, tenant_id, varlik_id, tur, ad, kurum, belge_no,
                kontrol_tarihi, gecerlilik, sonuc, notlar, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?, 'gecerli', ?,?)`,
      id, ctx.tenant.id, v.id, govde.tur || 'periyodik_kontrol', ad, govde.kurum || null,
      govde.belgeNo || null, govde.kontrolTarihi ? gunBaslangici(govde.kontrolTarihi) : simdi(),
      gecerlilik, sonuc, govde.notlar || null, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'varlik_kontrolu', nesneId: id, eylem: 'olustur',
      sonraki: { varlik: v.kod, ad, sonuc, gecerlilik } });

    /* §7: uygunsuz kontrol varlığı KULLANIM DIŞI yapar ve bakım iş emri açar. */
    if (sonuc === 'uygun_degil' && v.durum === 'aktif') {
      gecisYap(ctx, { nesne: 'varlik', tablo: 'varlik', kayit: v, eylem: 'kullanim_disi_birak',
        gerekce: `${ad} kontrolü uygunsuz sonuçlandı`, motor: true });
      const kod = sonrakiKod(ctx.tenant.id, 'is_emri');
      calistir(`INSERT INTO is_emri (id, tenant_id, kod, baslik, tur, aciklama, proje_id, santiye_id,
                  varlik_id, oncelik, termin, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?, 'onarim', ?,?,?,?, 'yuksek', ?, 'taslak', ?,?)`,
        kimlik('gorev'), ctx.tenant.id, kod, `${v.kod} — ${ad} uygunsuzluğu`,
        `Kontrol uygunsuz sonuçlandı; varlık kullanım dışı bırakıldı.`,
        v.proje_id, v.santiye_id, v.id, simdi() + 7 * GUN_MS, ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'is_emri', nesneId: kod, eylem: 'kontrolden_acildi',
        sonraki: { varlik: v.kod, kontrol: ad } });
      return `${ad} uygunsuz: ${v.kod} kullanım dışı bırakıldı ve ${kod} onarım iş emri açıldı`;
    }
    return `${ad} kontrolü kaydedildi`;
  });
}

function kontrolSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('AST-07');
  yetkiZorunlu(ctx, e.yetki);
  const varlikId = ctx.sorgu.get('varlik_id') || '';
  const kosullar = ['k.tenant_id = ?']; const parametreler = [ctx.tenant.id];
  if (varlikId) { kosullar.push('k.varlik_id = ?'); parametreler.push(varlikId); }
  if (ctx.sorgu.get('tur')) { kosullar.push('k.tur = ?'); parametreler.push(ctx.sorgu.get('tur')); }
  const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
  const nerede = kosullar.join(' AND ');
  const toplam = Number(tek(`SELECT COUNT(*) AS n FROM varlik_kontrolu k WHERE ${nerede}`,
    ...parametreler)?.n ?? 0);
  const satirlar = sorgu(
    `SELECT k.*, v.kod AS varlik_kod, v.ad AS varlik_ad FROM varlik_kontrolu k
       JOIN varlik v ON v.id = k.varlik_id
      WHERE ${nerede} ORDER BY k.gecerlilik IS NULL, k.gecerlilik ASC LIMIT ? OFFSET ?`,
    ...parametreler, boyut, atla);
  const dolan = Number(tek(
    `SELECT COUNT(*) AS n FROM varlik_kontrolu WHERE tenant_id = ? AND durum = 'gecerli'
       AND gecerlilik IS NOT NULL AND gecerlilik < ?`, ctx.tenant.id, simdi())?.n ?? 0);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${dolan ? B.sonucSeridi({ tur: 'hata', baslik: `${dolan} kontrolün süresi doldu`,
    aciklama: 'Süresi dolan kontrol kullanım engelidir; varlık sahada kullanılamaz (§7).' }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Kontrol kaydı', deger: sayi(toplam), ikon: 'fa-clipboard-check' },
      { etiket: 'Süresi dolan', deger: sayi(dolan), ikon: 'fa-triangle-exclamation',
        ton: dolan ? 'danger' : '' },
      { etiket: '30 gün içinde', ikon: 'fa-hourglass-half',
        deger: sayi(Number(tek(`SELECT COUNT(*) AS n FROM varlik_kontrolu WHERE tenant_id = ?
          AND durum = 'gecerli' AND gecerlilik BETWEEN ? AND ?`,
        ctx.tenant.id, simdi(), simdi() + 30 * GUN_MS)?.n ?? 0)) },
      { etiket: 'Uygunsuz', ikon: 'fa-circle-xmark',
        deger: sayi(sayac(ctx.tenant.id, 'varlik_kontrolu', `sonuc = 'uygun_degil'`)) },
    ]),
    filtre: B.filtreBari({ rota: '/varlik-kontrolleri', sorgu: ctx.sorgu, aramaYer: 'Ara…',
      filtreler: [
        { ad: 'varlik_id', etiket: 'Varlık', secenekler: varlikSecenekleri(ctx) },
        { ad: 'tur', etiket: 'Tür', secenekler: KONTROL_TURLERI },
      ] }),
    icerik: B.tablo({
      satirlar,
      bosDurum: { baslik: 'Kontrol kaydı yok', ikon: 'fa-clipboard-check',
        aciklama: 'Uygunsuz kontrol varlığı otomatik kullanım dışı bırakır ve onarım iş emri açar.' },
      sutunlar: [
        { ad: 'varlik_kod', etiket: 'Varlık', govde: (k) => h`<a href="/varliklar/${k.varlik_id}">
          <b>${k.varlik_kod}</b></a><br><span class="muted">${k.varlik_ad}</span>` },
        { ad: 'ad', etiket: 'Kontrol', govde: (k) => h`<b>${k.ad}</b><br><span class="muted">${
          KONTROL_TURLERI.find((t) => t.deger === k.tur)?.etiket || k.tur}</span>` },
        { ad: 'kurum', etiket: 'Kurum', govde: (k) => k.kurum || '—' },
        { ad: 'kontrol_tarihi', etiket: 'Tarih', govde: (k) => tarih(k.kontrol_tarihi) },
        { ad: 'gecerlilik', etiket: 'Geçerlilik', govde: (k) => (!k.gecerlilik ? 'süresiz'
          : k.gecerlilik < simdi() ? B.isaret(`${tarih(k.gecerlilik)} — doldu`, 'danger')
            : k.gecerlilik < simdi() + 30 * GUN_MS
              ? B.isaret(`${tarih(k.gecerlilik)} — yaklaşıyor`, 'warn') : tarih(k.gecerlilik)) },
        { ad: 'sonuc', etiket: 'Sonuç', govde: (k) => B.isaret(
          { uygun: 'uygun', uygun_degil: 'uygun değil', sartli: 'şartlı' }[k.sonuc],
          k.sonuc === 'uygun' ? 'ok' : k.sonuc === 'sartli' ? 'warn' : 'danger') },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: '/varlik-kontrolleri', sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'AST-07:olustur') ? B.form({
    rota: '/varlik-kontrolleri', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni kontrol kaydı',
      aciklama: '"Uygun değil" sonucu varlığı KULLANIM DIŞI bırakır ve onarım iş emri açar (§7).',
      alanlar: h`
      ${B.alan({ ad: 'varlikId', etiket: 'Varlık', zorunlu: true, deger: deger.varlikId || varlikId,
    hata: hata?.alanlar?.varlikId, secenekler: [{ deger: '', etiket: 'Seçin…' }, ...varlikSecenekleri(ctx)] })}
      ${B.alan({ ad: 'ad', etiket: 'Kontrol adı', zorunlu: true, genis: true, deger: deger.ad || '',
    hata: hata?.alanlar?.ad })}
      ${B.alan({ ad: 'tur', etiket: 'Tür', deger: deger.tur || 'periyodik_kontrol',
    secenekler: KONTROL_TURLERI })}
      ${B.alan({ ad: 'kurum', etiket: 'Kontrol kurumu', deger: deger.kurum || '' })}
      ${B.alan({ ad: 'belgeNo', etiket: 'Belge no', deger: deger.belgeNo || '' })}
      ${B.alan({ ad: 'kontrolTarihi', etiket: 'Kontrol tarihi', tur: 'date',
    deger: deger.kontrolTarihi || gunAnahtari(simdi()) })}
      ${B.alan({ ad: 'gecerlilik', etiket: 'Geçerlilik bitişi', tur: 'date', deger: deger.gecerlilik || '' })}
      ${B.alan({ ad: 'sonuc', etiket: 'Sonuç', deger: deger.sonuc || 'uygun', secenekler: [
    { deger: 'uygun', etiket: 'Uygun' }, { deger: 'sartli', etiket: 'Şartlı uygun' },
    { deger: 'uygun_degil', etiket: 'Uygun değil' }] })}
      ${B.alan({ ad: 'notlar', etiket: 'Notlar', tur: 'metin', genis: true, deger: deger.notlar || '' })}` }],
    eylemler: B.btn('Kontrolü kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/* ==========================================================================
   AST-09 yakıt ve kilometre
   ========================================================================== */
function yakitKaydet(ctx, govde) {
  const v = tek('SELECT * FROM varlik WHERE id = ? AND tenant_id = ?', govde.varlikId, ctx.tenant.id);
  if (!v) throw DogrulamaHatasi('Varlık seçin.', { alanlar: { varlikId: ['Varlık bulunamadı.'] } });
  if (v.sayac_turu === 'yok') {
    throw GecisIzinsiz('Bu varlıkta sayaç tanımlı değil; yakıt/kilometre kaydı tutulamaz.');
  }
  const sayacDeger = Number(govde.sayacDeger);
  if (!Number.isInteger(sayacDeger) || sayacDeger < 0) {
    throw DogrulamaHatasi('Sayaç değeri tam sayı olmalı.', { alanlar: { sayacDeger: ['Geçersiz değer.'] } });
  }
  /* Sayaç GERİ GİDEMEZ: aracın kilometresi azalmaz. */
  if (sayacDeger < v.sayac_deger) {
    throw DogrulamaHatasi(
      `Sayaç geri gidemez: mevcut ${v.sayac_deger} ${v.sayac_turu}, girilen ${sayacDeger}.`,
      { alanlar: { sayacDeger: ['Mevcut sayaçtan küçük olamaz.'] } });
  }
  const litre = miktarAyristir(govde.litre, 'litre');
  const tutar = govde.tutar ? Para.ayristir(govde.tutar, ctx.tenant.para_birimi).minor : null;

  return islem(() => {
    calistir(`INSERT INTO yakit_kaydi (id, tenant_id, varlik_id, tarih, sayac_deger, litre_binde,
                tutar_minor, tutar_birim, istasyon, fis_no, surucu_id, santiye_id, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      kimlik('varlik').replace('ast', 'ykt'), ctx.tenant.id, v.id,
      govde.tarih ? gunBaslangici(govde.tarih) : simdi(), sayacDeger, litre,
      tutar == null ? null : String(tutar), ctx.tenant.para_birimi,
      govde.istasyon || null, govde.fisNo || null, govde.surucuId || null,
      v.santiye_id, ctx.kullanici.id, simdi());
    /* Varlığın sayacı ileri alınır — bakım planları bu değerden tetiklenir. */
    surumluGuncelle('varlik', v.id, v.surum, { sayac_deger: sayacDeger },
      { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'varlik', nesneId: v.id, eylem: 'yakit_kaydi',
      onceki: { sayac: v.sayac_deger }, sonraki: { sayac: sayacDeger, litreBinde: litre } });
    return `${v.kod} yakıt kaydı eklendi; sayaç ${sayacDeger} ${v.sayac_turu}`;
  });
}

function yakitSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('AST-09');
  yetkiZorunlu(ctx, e.yetki);
  const varlikId = ctx.sorgu.get('varlik_id') || '';
  const kosullar = ['y.tenant_id = ?']; const parametreler = [ctx.tenant.id];
  if (varlikId) { kosullar.push('y.varlik_id = ?'); parametreler.push(varlikId); }
  const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
  const nerede = kosullar.join(' AND ');
  const toplam = Number(tek(`SELECT COUNT(*) AS n FROM yakit_kaydi y WHERE ${nerede}`,
    ...parametreler)?.n ?? 0);
  const satirlar = sorgu(
    `SELECT y.*, v.kod AS varlik_kod, v.ad AS varlik_ad, v.sayac_turu FROM yakit_kaydi y
       JOIN varlik v ON v.id = y.varlik_id
      WHERE ${nerede} ORDER BY y.tarih DESC, y.sayac_deger DESC LIMIT ? OFFSET ?`,
    ...parametreler, boyut, atla);

  /* Tüketim: iki dolum arasındaki sayaç farkına bölünen litre — HESAPLANIR. */
  const zengin = satirlar.map((r, i) => {
    const onceki = satirlar.slice(i + 1).find((x) => x.varlik_id === r.varlik_id);
    const fark = onceki ? r.sayac_deger - onceki.sayac_deger : null;
    const tuketim = fark && fark > 0 ? (r.litre_binde / 1000) / fark : null;
    return { ...r, sayacFark: fark, tuketim };
  });
  const toplamLitre = satirlar.reduce((a, r) => a + r.litre_binde, 0);
  const toplamTutar = satirlar.reduce((a, r) => a + Number(r.tutar_minor || 0), 0);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Kayıt', deger: sayi(toplam), ikon: 'fa-gas-pump' },
      { etiket: 'Toplam litre', deger: miktarMetni(toplamLitre), ikon: 'fa-droplet' },
      { etiket: 'Toplam tutar', deger: para(toplamTutar, ctx.tenant.para_birimi), ikon: 'fa-coins' },
      { etiket: 'Ortalama birim', ikon: 'fa-calculator',
        deger: toplamLitre ? para(Math.round(toplamTutar / (toplamLitre / 1000)), ctx.tenant.para_birimi) : '—',
        alt: 'tutar / litre' },
    ]),
    filtre: B.filtreBari({ rota: '/araclar/yakit', sorgu: ctx.sorgu, aramaYer: 'Ara…',
      filtreler: [{ ad: 'varlik_id', etiket: 'Araç',
        secenekler: varlikSecenekleri(ctx, { tur: 'arac' }) }] }),
    icerik: B.tablo({
      satirlar: zengin,
      bosDurum: { baslik: 'Yakıt kaydı yok', ikon: 'fa-gas-pump',
        aciklama: 'Sayaç yalnız ileri gider; geri değer girilemez.' },
      sutunlar: [
        { ad: 'tarih', etiket: 'Tarih', govde: (r) => tarih(r.tarih) },
        { ad: 'varlik_kod', etiket: 'Araç', govde: (r) => h`<a href="/varliklar/${r.varlik_id}">
          <b>${r.varlik_kod}</b></a>` },
        { ad: 'sayac_deger', etiket: 'Sayaç', hizala: 'sag',
          govde: (r) => h`${sayi(r.sayac_deger)} <span class="muted">${r.sayac_turu}</span>` },
        { ad: 'sayacFark', etiket: 'Fark', hizala: 'sag',
          govde: (r) => (r.sayacFark == null ? '—' : sayi(r.sayacFark)) },
        { ad: 'litre_binde', etiket: 'Litre', hizala: 'sag', govde: (r) => miktarMetni(r.litre_binde) },
        { ad: 'tuketim', etiket: 'Tüketim', hizala: 'sag', govde: (r) => (r.tuketim == null ? '—'
          : `${(r.tuketim * 100).toFixed(1).replace('.', ',')} L/100${r.sayac_turu}`) },
        { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag', govde: (r) => para(r.tutar_minor, r.tutar_birim) },
        { ad: 'fis_no', etiket: 'Fiş', govde: (r) => r.fis_no || '—' },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: '/araclar/yakit', sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'AST-09:olustur') ? B.form({
    rota: '/araclar/yakit', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni yakıt kaydı',
      aciklama: 'Sayaç değeri mevcut değerden küçük olamaz; tüketim iki dolum arasından hesaplanır.',
      alanlar: h`
      ${B.alan({ ad: 'varlikId', etiket: 'Araç / makine', zorunlu: true,
    deger: deger.varlikId || varlikId, hata: hata?.alanlar?.varlikId,
    secenekler: [{ deger: '', etiket: 'Seçin…' }, ...varlikSecenekleri(ctx)] })}
      ${B.alan({ ad: 'tarih', etiket: 'Tarih', tur: 'date', deger: deger.tarih || gunAnahtari(simdi()) })}
      ${B.alan({ ad: 'sayacDeger', etiket: 'Sayaç değeri', tur: 'number', zorunlu: true,
    deger: deger.sayacDeger || '', hata: hata?.alanlar?.sayacDeger })}
      ${B.alan({ ad: 'litre', etiket: 'Litre', zorunlu: true, deger: deger.litre || '',
    hata: hata?.alanlar?.litre })}
      ${B.alan({ ad: 'tutar', etiket: 'Tutar', deger: deger.tutar || '' })}
      ${B.alan({ ad: 'istasyon', etiket: 'İstasyon', deger: deger.istasyon || '' })}
      ${B.alan({ ad: 'fisNo', etiket: 'Fiş no', deger: deger.fisNo || '' })}` }],
    eylemler: B.btn('Kaydı ekle', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/* ==========================================================================
   AST-10 kaza, ceza, hasar
   ========================================================================== */
function olayAc(ctx, govde) {
  yetkiZorunlu(ctx, 'AST-10:olustur');
  const v = tek('SELECT * FROM varlik WHERE id = ? AND tenant_id = ?', govde.varlikId, ctx.tenant.id);
  if (!v) throw DogrulamaHatasi('Varlık seçin.', { alanlar: { varlikId: ['Varlık bulunamadı.'] } });
  const tur = OLAY_TURLERI.some((t) => t.deger === govde.tur) ? govde.tur : 'hasar';
  const tutar = govde.tutar ? Para.ayristir(govde.tutar, ctx.tenant.para_birimi).minor : null;
  const olayTarihi = govde.olayTarihi ? gunBaslangici(govde.olayTarihi) : simdi();

  return islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'arac_olayi');
    const id = kimlik('olay').replace('evt', 'aol');
    let isgId = null;
    /* §7: araç kazası aynı zamanda bir İSG olayıdır — otomatik bağ kurulur. */
    if (tur === 'kaza') {
      isgId = kimlik('isg');
      const isgKod = sonrakiKod(ctx.tenant.id, 'isg_olayi');
      calistir(`INSERT INTO isg_olayi (id, tenant_id, santiye_id, proje_id, kod, tur, baslik,
                  olay_zamani, yer, anlatim, onem, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?, 'kaza', ?,?,?,?, 'kritik', 'yeni', ?,?)`,
        isgId, ctx.tenant.id, v.santiye_id, v.proje_id, isgKod,
        `Araç kazası: ${v.kod}${v.plaka ? ` (${v.plaka})` : ''}`, olayTarihi,
        govde.yer || null, govde.aciklama || null, ctx.kullanici.id, simdi());
    }
    calistir(`INSERT INTO arac_olayi (id, tenant_id, varlik_id, kod, tur, olay_tarihi, yer,
                surucu_id, aciklama, tutar_minor, tutar_birim, isg_olayi_id, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'acik', ?,?)`,
      id, ctx.tenant.id, v.id, kod, tur, olayTarihi, govde.yer || null,
      govde.surucuId || null, govde.aciklama || null,
      tutar == null ? null : String(tutar), ctx.tenant.para_birimi, isgId,
      ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'arac_olayi', nesneId: id, eylem: 'olustur',
      sonraki: { kod, varlik: v.kod, tur, isgOlayiAcildi: !!isgId } });
    return isgId ? `${kod} kaydedildi ve İSG kaza kaydı açıldı (§7)` : `${kod} kaydedildi`;
  });
}

function olayGecisi(ctx, govde) {
  yetkiZorunlu(ctx, 'AST-10:guncelle');
  const o = tek('SELECT * FROM arac_olayi WHERE id = ? AND tenant_id = ?', govde.id, ctx.tenant.id);
  if (!o) throw Bulunamadi('Olay bulunamadı.');
  gecisYap(ctx, { nesne: 'aracOlayi', tablo: 'arac_olayi', kayit: o, eylem: govde.gecis,
    gerekce: govde.gerekce, ekranKodu: 'AST-10' });
  return 'Olay durumu güncellendi';
}

function olaySayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('AST-10');
  yetkiZorunlu(ctx, e.yetki);
  const kosullar = ['o.tenant_id = ?']; const parametreler = [ctx.tenant.id];
  if (ctx.sorgu.get('tur')) { kosullar.push('o.tur = ?'); parametreler.push(ctx.sorgu.get('tur')); }
  if (ctx.sorgu.get('durum')) { kosullar.push('o.durum = ?'); parametreler.push(ctx.sorgu.get('durum')); }
  const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
  const nerede = kosullar.join(' AND ');
  const toplam = Number(tek(`SELECT COUNT(*) AS n FROM arac_olayi o WHERE ${nerede}`,
    ...parametreler)?.n ?? 0);
  const satirlar = sorgu(
    `SELECT o.*, v.kod AS varlik_kod, v.plaka, p.ad_soyad FROM arac_olayi o
       JOIN varlik v ON v.id = o.varlik_id LEFT JOIN personel p ON p.id = o.surucu_id
      WHERE ${nerede} ORDER BY o.olay_tarihi DESC LIMIT ? OFFSET ?`, ...parametreler, boyut, atla);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Açık olay', deger: sayi(sayac(ctx.tenant.id, 'arac_olayi', `durum <> 'kapali'`)),
        ikon: 'fa-car-burst' },
      { etiket: 'Kaza', deger: sayi(sayac(ctx.tenant.id, 'arac_olayi', `tur = 'kaza'`)),
        ikon: 'fa-triangle-exclamation', ton: 'danger' },
      { etiket: 'Ceza', deger: sayi(sayac(ctx.tenant.id, 'arac_olayi', `tur = 'ceza'`)), ikon: 'fa-receipt' },
      { etiket: 'Toplam tutar', ikon: 'fa-coins', deger: para(Number(tek(
        `SELECT COALESCE(SUM(tutar_minor),0) AS n FROM arac_olayi WHERE tenant_id = ?`,
        ctx.tenant.id)?.n ?? 0), ctx.tenant.para_birimi) },
    ]),
    filtre: B.filtreBari({ rota: '/araclar/olaylar', sorgu: ctx.sorgu, aramaYer: 'Ara…',
      filtreler: [
        { ad: 'tur', etiket: 'Tür', secenekler: OLAY_TURLERI },
        { ad: 'durum', etiket: 'Durum', secenekler: ['acik', 'islemde', 'kapali']
          .map((d) => ({ deger: d, etiket: d })) },
      ] }),
    icerik: B.tablo({
      satirlar,
      bosDurum: { baslik: 'Olay kaydı yok', ikon: 'fa-car-burst',
        aciklama: 'Araç kazası otomatik olarak İSG kaza kaydı da açar (§7).' },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'varlik_kod', etiket: 'Araç', govde: (o) => h`<a href="/varliklar/${o.varlik_id}">
          <b>${o.varlik_kod}</b></a>${o.plaka ? h`<br><span class="muted">${o.plaka}</span>` : ''}` },
        { ad: 'tur', etiket: 'Tür', govde: (o) => B.isaret(
          OLAY_TURLERI.find((t) => t.deger === o.tur)?.etiket || o.tur,
          o.tur === 'kaza' ? 'danger' : 'info') },
        { ad: 'olay_tarihi', etiket: 'Tarih', govde: (o) => tarih(o.olay_tarihi) },
        { ad: 'ad_soyad', etiket: 'Sürücü', govde: (o) => o.ad_soyad || '—' },
        { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag', govde: (o) => para(o.tutar_minor, o.tutar_birim) },
        { ad: 'isg_olayi_id', etiket: 'İSG', govde: (o) => (o.isg_olayi_id
          ? h`<a href="/isg/olaylar/${o.isg_olayi_id}">açıldı</a>` : '—') },
        { ad: 'durum', etiket: 'Durum', govde: (o) => (o.durum !== 'kapali' && yetkiVar(ctx, 'AST-10:guncelle')
          ? h`<form method="post" action="/araclar/olaylar" style="display:flex;gap:6px;flex-wrap:wrap">
              ${ham(csrfAlani(ctx))}
              <input type="hidden" name="_eylem" value="gecis">
              <input type="hidden" name="id" value="${o.id}">
              <input type="text" name="gerekce" placeholder="Not" aria-label="Not" style="max-width:100px">
              ${o.durum === 'acik'
    ? h`<button class="btn btn-ghost btn-sm" type="submit" name="gecis" value="islem_al">İşleme al</button>`
    : h`<button class="btn btn-ghost btn-sm" type="submit" name="gecis" value="kapat">Kapat</button>`}
            </form>`
          : B.rozet(o.durum === 'kapali' ? 'kapali' : 'beklemede',
            { acik: 'Açık', islemde: 'İşlemde', kapali: 'Kapalı', iptal: 'İptal' }[o.durum])) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: '/araclar/olaylar', sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'AST-10:olustur') ? B.form({
    rota: '/araclar/olaylar', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni olay kaydı',
      aciklama: '"Kaza" türü otomatik olarak kritik İSG olayı da açar (§7).',
      alanlar: h`
      ${B.alan({ ad: 'varlikId', etiket: 'Araç', zorunlu: true, deger: deger.varlikId || '',
    hata: hata?.alanlar?.varlikId,
    secenekler: [{ deger: '', etiket: 'Seçin…' }, ...varlikSecenekleri(ctx)] })}
      ${B.alan({ ad: 'tur', etiket: 'Tür', deger: deger.tur || 'hasar', secenekler: OLAY_TURLERI })}
      ${B.alan({ ad: 'olayTarihi', etiket: 'Olay tarihi', tur: 'date',
    deger: deger.olayTarihi || gunAnahtari(simdi()) })}
      ${B.alan({ ad: 'yer', etiket: 'Yer', deger: deger.yer || '' })}
      ${B.alan({ ad: 'surucuId', etiket: 'Sürücü', deger: deger.surucuId || '',
    secenekler: [{ deger: '', etiket: 'Seçin…' }, ...sorgu(
      `SELECT id, kod, ad_soyad FROM personel WHERE tenant_id = ? AND durum = 'aktif' ORDER BY ad_soyad`,
      ctx.tenant.id).map((p) => ({ deger: p.id, etiket: `${p.kod} — ${p.ad_soyad}` }))] })}
      ${B.alan({ ad: 'tutar', etiket: 'Tutar', deger: deger.tutar || '' })}
      ${B.alan({ ad: 'aciklama', etiket: 'Açıklama', tur: 'metin', genis: true,
    deger: deger.aciklama || '' })}` }],
    eylemler: B.btn('Olayı kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}
