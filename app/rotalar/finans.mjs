/* ============================================================================
   FİNANS — panel, bütçe, kasa, banka, cari  (FIN-01..10)
   ----------------------------------------------------------------------------
   Kasa, banka ve cari bakiyeleri SAKLANMAZ; `moduller/finans/defter.mjs`
   üzerinden her okumada defterden toplanır. Deftere yalnız o modül yazar,
   satırlar tetikleyiciyle değişmezdir ve düzeltme ters kayıtla yapılır (kural 7).
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, tarihSaat, gunAnahtari, gunBaslangici, GUN_MS } from '../cekirdek/zaman.mjs';
import { Para, BIRIMLER } from '../cekirdek/para.mjs';
import { DogrulamaHatasi, GecisIzinsiz, Bulunamadi, Cakisma, UygulamaHatasi } from '../cekirdek/hata.mjs';
import * as onayMotoru from '../moduller/isakisi/onay.mjs';
import * as fdefter from '../moduller/finans/defter.mjs';
import * as sdefter from '../moduller/stok/defter.mjs';
import * as HK from '../moduller/sozlesme/hakedis.mjs';
import { kullaniciSecenekleri, santiyeSecenekleri, projeSecenekleri, sayac, gecmisKarti }
  from './kayit-modulu.mjs';
import {
  ekranNesnesi, hataNesnesi, kullaniciAdi, ciz, kaydiAl, listeSorgusu, filtreKosullari,
  B, h, ham, sayi, csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar,
  sorgu, tek, calistir, islem, surumluGuncelle, audit, sonrakiKod, gecisYap,
  ciktiDesteklenmez,
} from './ortak.mjs';

const para = (minor, birim = 'TRY') => (minor == null ? '—' : Para.minor(minor, birim || 'TRY').bicim());
const donemAnahtari = (ms) => gunAnahtari(ms).slice(0, 7);

const kasaSecenekleri = (ctx) => sorgu(
  `SELECT id, kod, ad FROM kasa WHERE tenant_id = ? AND durum = 'aktif' ORDER BY kod`, ctx.tenant.id)
  .map((k) => ({ deger: k.id, etiket: `${k.kod} — ${k.ad}` }));
const hesapSecenekleri = (ctx) => sorgu(
  `SELECT id, kod, ad, banka FROM banka_hesabi WHERE tenant_id = ? AND durum = 'aktif' ORDER BY kod`,
  ctx.tenant.id).map((k) => ({ deger: k.id, etiket: `${k.kod} — ${k.banka} ${k.ad}` }));
export const cariSecenekleri = (ctx) => sorgu(
  `SELECT id, kod, unvan FROM cari WHERE tenant_id = ? AND durum = 'aktif' ORDER BY unvan`, ctx.tenant.id)
  .map((c) => ({ deger: c.id, etiket: `${c.kod} — ${c.unvan}` }));

/** Dönem kilidi: kapalı döneme finans hareketi yazılamaz (FIN-15). */
export function donemKilidiKontrol(ctx, zamanMs) {
  const donem = donemAnahtari(zamanMs);
  if (fdefter.donemKapaliMi(ctx.tenant.id, zamanMs, donem)) {
    throw GecisIzinsiz(`${donem} dönemi kapatıldı; bu döneme finans hareketi yazılamaz. `
      + 'Düzeltme açık dönemde ters kayıtla yapılır.');
  }
}

export function kur(y, ekranRota) {
  /* ================= FIN-01 Finans paneli ============================== */
  ekranRota(y, 'FIN-01', { get: (ctx) => finansPaneli(ctx) });

  /* ================= FIN-02 / FIN-03 Bütçe ============================= */
  ekranRota(y, 'FIN-02', {
    get: (ctx) => butceSayfasi(ctx),
    post: (ctx, govde) => {
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = butceIslemi(ctx, govde);
        const p = new URLSearchParams({ islem: mesaj });
        if (govde.butceId) p.set('butce_id', govde.butceId);
        return yonlendir(ctx, `/butceler?${p.toString()}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return butceSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  ekranRota(y, 'FIN-03', {
    get: (ctx, _g, params) => butceRevizyonSayfasi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('FIN-03');
      yetkiZorunlu(ctx, `${e.kod}:karar_ver`);
      csrfZorunlu(ctx, govde);
      const b = kaydiAl(ctx, 'butce', 'butce', params.id);
      try {
        const yeni = butceRevizyonAc(ctx, b, govde);
        return yonlendir(ctx, `/butceler?butce_id=${yeni.id}&islem=${encodeURIComponent('Revizyon sürümü açıldı')}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return butceRevizyonSayfasi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ================= FIN-04 Tahmin ve EAC ============================== */
  ekranRota(y, 'FIN-04', { get: (ctx) => tahminRaporu(ctx) });

  /* ================= FIN-05 / FIN-06 Kasa ============================== */
  ekranRota(y, 'FIN-05', {
    get: (ctx) => kasaSayfasi(ctx),
    post: (ctx, govde) => {
      yetkiZorunlu(ctx, 'FIN-05:olustur');
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = kasaAc(ctx, govde);
        return yonlendir(ctx, `/kasalar?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return kasaSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  ekranRota(y, 'FIN-06', {
    get: (ctx) => kasaHareketSayfasi(ctx),
    post: (ctx, govde) => {
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = govde._eylem === 'ters' ? kasaTersKayit(ctx, govde) : kasaHareketiYaz(ctx, govde);
        const p = new URLSearchParams({ islem: mesaj });
        if (govde.kasaId) p.set('kasa_id', govde.kasaId);
        return yonlendir(ctx, `/kasa-hareketleri?${p.toString()}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return kasaHareketSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= FIN-07..09 Banka ================================== */
  ekranRota(y, 'FIN-07', {
    get: (ctx) => bankaSayfasi(ctx),
    post: (ctx, govde) => {
      yetkiZorunlu(ctx, 'FIN-07:olustur');
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = bankaHesabiAc(ctx, govde);
        return yonlendir(ctx, `/banka-hesaplari?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return bankaSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  ekranRota(y, 'FIN-08', {
    get: (ctx) => bankaHareketSayfasi(ctx),
    post: (ctx, govde) => {
      yetkiZorunlu(ctx, 'FIN-08:disa_aktar');
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = bankaHareketiYaz(ctx, govde);
        const p = new URLSearchParams({ islem: mesaj });
        if (govde.hesapId) p.set('hesap_id', govde.hesapId);
        return yonlendir(ctx, `/banka-hareketleri?${p.toString()}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return bankaHareketSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  ekranRota(y, 'FIN-09', {
    get: (ctx) => eslestirmeSayfasi(ctx),
    post: (ctx, govde) => {
      const e = ekranNesnesi('FIN-09');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = bankaEslestir(ctx, govde);
        return yonlendir(ctx, `/banka-hareketleri/eslestirme?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return eslestirmeSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ================= FIN-10 Cari hesaplar ============================== */
  ekranRota(y, 'FIN-10', {
    get: (ctx) => cariSayfasi(ctx),
    post: (ctx, govde) => {
      yetkiZorunlu(ctx, 'FIN-10:olustur');
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = cariAc(ctx, govde);
        return yonlendir(ctx, `/cariler?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return cariSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });
}

/* ==========================================================================
   FIN-01 panel
   ========================================================================== */
function finansPaneli(ctx) {
  const e = ekranNesnesi('FIN-01');
  yetkiZorunlu(ctx, e.yetki);
  const t = ctx.tenant.id;
  const kasalar = fdefter.bakiyeler('kasa', t);
  const hesaplar = fdefter.bakiyeler('banka', t);
  const kasaToplam = kasalar.reduce((a, k) => a + k.bakiye_minor, 0);
  const bankaToplam = hesaplar.reduce((a, k) => a + k.bakiye_minor, 0);
  const acikFatura = Number(tek(
    `SELECT COALESCE(SUM(toplam_minor),0) AS n FROM fatura
      WHERE tenant_id = ? AND yon = 'gelen' AND durum NOT IN ('odendi','iptal','reddedildi')`, t)?.n ?? 0);
  const bekleyenOdeme = Number(tek(
    `SELECT COALESCE(SUM(tutar_minor),0) AS n FROM odeme
      WHERE tenant_id = ? AND durum IN ('onaylandi','onaya_gonderildi','incelemede')`, t)?.n ?? 0);
  const eslesmemis = sayac(t, 'banka_hareketi', 'eslesen_id IS NULL');
  const toleransDisi = sayac(t, 'fatura', `eslestirme = 'tolerans_disi'`);
  const vadesiGecen = sorgu(
    `SELECT * FROM fatura WHERE tenant_id = ? AND yon = 'gelen' AND vade_tarihi < ?
       AND durum NOT IN ('odendi','iptal','reddedildi') ORDER BY vade_tarihi LIMIT 8`, t, simdi());

  const icerik = h`
${B.kpiSeridi([
    { etiket: 'Kasa bakiyesi', deger: para(kasaToplam, ctx.tenant.para_birimi), ikon: 'fa-cash-register',
      alt: `${kasalar.length} kasa · defterden` },
    { etiket: 'Banka bakiyesi', deger: para(bankaToplam, ctx.tenant.para_birimi), ikon: 'fa-building-columns',
      alt: `${hesaplar.length} hesap · defterden` },
    { etiket: 'Açık gelen fatura', deger: para(acikFatura, ctx.tenant.para_birimi), ikon: 'fa-file-invoice' },
    { etiket: 'Bekleyen ödeme', deger: para(bekleyenOdeme, ctx.tenant.para_birimi), ikon: 'fa-money-bill-transfer',
      ton: bekleyenOdeme ? 'warn' : '' },
  ])}
${eslesmemis || toleransDisi ? B.sonucSeridi({ tur: 'warn',
    baslik: `${eslesmemis} eşleşmemiş banka hareketi · ${toleransDisi} tolerans dışı fatura`,
    aciklama: 'Eşleşmemiş hareket ve tolerans dışı fark, dönem kapanışını engeller.',
    kayitRota: '/banka-hareketleri/eslestirme' }) : ''}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Kasa ve banka bakiyeleri</b>
        <span>Her satır hareket defterinin o an toplanmasıyla üretilir; saklanan bakiye yoktur.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: [...kasalar.map((k) => ({ ...k, tip: 'Kasa', rota: `/kasa-hareketleri?kasa_id=${k.id}` })),
      ...hesaplar.map((k) => ({ ...k, tip: 'Banka', rota: `/banka-hareketleri?hesap_id=${k.id}` }))],
    satirRota: (r) => r.rota,
    bosDurum: { baslik: 'Kasa veya banka hesabı yok', ikon: 'fa-wallet' },
    sutunlar: [
      { ad: 'tip', etiket: 'Tip' },
      { ad: 'kod', etiket: 'Hesap', govde: (r) => h`<b>${r.kod}</b><br><span class="muted">${r.ad}</span>` },
      { ad: 'bakiye_minor', etiket: 'Bakiye', hizala: 'sag',
        govde: (r) => h`<b>${para(r.bakiye_minor, r.para_birimi)}</b>` },
      { ad: 'hareket_sayisi', etiket: 'Hareket', hizala: 'sag' },
      { ad: 'son_hareket', etiket: 'Son hareket', govde: (r) => (r.son_hareket ? tarih(r.son_hareket) : '—') },
    ],
  })}</div>
    </div>
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Vadesi geçen gelen faturalar</b></div>
        ${B.btn('Tüm faturalar', { rota: '/faturalar', kucuk: true })}</div>
      <div class="gc-body flush">${B.tablo({
    satirlar: vadesiGecen,
    satirRota: (r) => `/faturalar?fatura_id=${r.id}`,
    bosDurum: { baslik: 'Vadesi geçen fatura yok', ikon: 'fa-circle-check' },
    sutunlar: [
      { ad: 'fatura_no', etiket: 'Fatura' },
      { ad: 'vade_tarihi', etiket: 'Vade', govde: (r) => B.isaret(tarih(r.vade_tarihi), 'danger') },
      { ad: 'toplam_minor', etiket: 'Tutar', hizala: 'sag', govde: (r) => para(r.toplam_minor, r.tutar_birim) },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
    ],
  })}</div>
    </div>
  </div>
  <div class="gv-side-stack">
    <div class="gv-card"><div class="gc-body" style="display:flex;flex-direction:column;gap:8px">
      ${B.btn('Bütçeler', { rota: '/butceler', ikon: 'fa-chart-pie' })}
      ${B.btn('Tahmin ve EAC', { rota: '/tahminler', ikon: 'fa-chart-line' })}
      ${B.btn('Üçlü eşleştirme', { tur: 'acc', rota: '/faturalar/eslestirme', ikon: 'fa-code-compare' })}
      ${B.btn('Banka eşleştirme', { rota: '/banka-hareketleri/eslestirme', ikon: 'fa-link' })}
      ${B.btn('Dönem kapanışı', { rota: '/finans/donem-kapanis', ikon: 'fa-lock' })}
    </div></div>
  </div>
</div>
${B.veriTarihi(simdi())}`;
  return html(ctx, 200, ciz(ctx, e, icerik));
}

/* ==========================================================================
   FIN-02 / FIN-03 bütçe
   ========================================================================== */
const butceToplami = (butceId) => Number(tek(
  'SELECT COALESCE(SUM(tutar_minor),0) AS n FROM butce_satiri WHERE butce_id = ?', butceId)?.n ?? 0);

/** Maliyet kodu bazında GERÇEKLEŞEN: stok sarfı + onaylı fatura + kasa masrafı. */
function gerceklesen(tenantId, maliyetKodu, { projeId = null } = {}) {
  const stok = Number(tek(
    `SELECT COALESCE(SUM(h.yon * -1 * h.miktar_binde * COALESCE(h.birim_maliyet_minor,0) / 1000), 0) AS n
       FROM stok_hareketi h WHERE h.tenant_id = ? AND h.maliyet_kodu = ? AND h.yon = -1
       ${projeId ? 'AND h.proje_id = ?' : ''}`,
    ...(projeId ? [tenantId, maliyetKodu, projeId] : [tenantId, maliyetKodu]))?.n ?? 0);
  const kasa = Number(tek(
    `SELECT COALESCE(SUM(tutar_minor), 0) AS n FROM kasa_hareketi
      WHERE tenant_id = ? AND maliyet_kodu = ? AND yon = -1 ${projeId ? 'AND proje_id = ?' : ''}`,
    ...(projeId ? [tenantId, maliyetKodu, projeId] : [tenantId, maliyetKodu]))?.n ?? 0);
  return Math.round(stok) + kasa;
}

function butceIslemi(ctx, govde) {
  if (govde._eylem === 'ac') {
    yetkiZorunlu(ctx, 'FIN-02:olustur');
    const ad = String(govde.ad || '').trim();
    if (!ad) throw DogrulamaHatasi('Bütçe adı zorunludur.', { alanlar: { ad: ['Ad girin.'] } });
    return islem(() => {
      const kod = sonrakiKod(ctx.tenant.id, 'butce');
      const id = kimlik('butce');
      calistir(`INSERT INTO butce (id, tenant_id, kod, ad, proje_id, santiye_id, yil, toplam_minor,
                  tutar_birim, surum_no, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,0,?,1, 'taslak', ?,?)`,
        id, ctx.tenant.id, kod, ad, govde.projeId || null, govde.santiyeId || null,
        govde.yil ? Number(govde.yil) : new Date(simdi()).getUTCFullYear(),
        ctx.tenant.para_birimi, ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'butce', nesneId: id, eylem: 'olustur', sonraki: { kod, ad } });
      return `${kod} bütçesi açıldı`;
    });
  }

  const b = tek('SELECT * FROM butce WHERE id = ? AND tenant_id = ?', govde.butceId, ctx.tenant.id);
  if (!b) throw Bulunamadi('Bütçe bulunamadı.');

  if (govde._eylem === 'satir') {
    yetkiZorunlu(ctx, 'FIN-02:guncelle');
    if (!['taslak', 'revizyon_istendi'].includes(b.durum)) {
      throw GecisIzinsiz('Onaylı bütçe yerinde değişmez; revizyon sürümü açın (FIN-03).');
    }
    const kod = String(govde.maliyetKodu || '').trim();
    if (!kod) throw DogrulamaHatasi('Maliyet kodu zorunludur.', { alanlar: { maliyetKodu: ['Kod seçin.'] } });
    const tutar = Para.ayristir(govde.tutar || '', b.tutar_birim);
    if (tutar.minor <= 0n) {
      throw DogrulamaHatasi('Tutar sıfırdan büyük olmalı.', { alanlar: { tutar: ['Tutar girin.'] } });
    }
    if (tek('SELECT id FROM butce_satiri WHERE butce_id = ? AND maliyet_kodu = ?', b.id, kod)) {
      throw Cakisma(`${kod} maliyet kodu bu bütçede zaten var.`);
    }
    islem(() => {
      calistir(`INSERT INTO butce_satiri (id, butce_id, maliyet_kodu, aciklama, tutar_minor)
                VALUES (?,?,?,?,?)`, kimlik('satir'), b.id, kod, govde.aciklama || null, String(tutar.minor));
      calistir('UPDATE butce SET toplam_minor = ? WHERE id = ?', String(butceToplami(b.id)), b.id);
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'butce', nesneId: b.id, eylem: 'satir_eklendi',
        sonraki: { maliyetKodu: kod, tutarMinor: String(tutar.minor) } });
    });
    return `${kod} bütçe satırı eklendi`;
  }

  if (govde._eylem === 'onaya_gonder') {
    yetkiZorunlu(ctx, 'FIN-02:guncelle');
    if (!Number(tek('SELECT COUNT(*) AS n FROM butce_satiri WHERE butce_id = ?', b.id)?.n ?? 0)) {
      throw GecisIzinsiz('Satırsız bütçe onaya gönderilemez.');
    }
    islem(() => {
      const toplam = butceToplami(b.id);
      calistir('UPDATE butce SET toplam_minor = ? WHERE id = ?', String(toplam), b.id);
      onayMotoru.onayaGonder(ctx, {
        nesne: 'butce', nesneId: b.id, nesneKod: b.kod,
        baslik: `Bütçe onayı: ${b.ad} (sürüm ${b.surum_no})`, belgeSurum: b.surum,
        tutarMinor: toplam, tutarBirim: b.tutar_birim, projeId: b.proje_id,
        gerekce: govde.gerekce || null,
      });
      gecisYap(ctx, { nesne: 'butce', tablo: 'butce', kayit: b, eylem: 'onaya_gonder',
        gerekce: govde.gerekce, ekranKodu: 'FIN-02' });
    });
    return 'Bütçe onaya gönderildi';
  }
  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

/** FIN-03: onaylı bütçe yerinde değişmez, yeni sürüm açılır (kural 6). */
function butceRevizyonAc(ctx, b, govde) {
  if (b.durum !== 'onaylandi') {
    throw GecisIzinsiz('Yalnız ONAYLI bütçe revize edilir; taslak bütçe doğrudan düzenlenir.');
  }
  const gerekce = String(govde.gerekce || '').trim();
  if (!gerekce) {
    throw DogrulamaHatasi('Revizyon gerekçesi zorunludur.', { alanlar: { gerekce: ['Gerekçe girin.'] } });
  }
  const acik = tek(
    `SELECT * FROM butce WHERE tenant_id = ? AND kod = ? AND durum NOT IN ('onaylandi','iptal','reddedildi')`,
    ctx.tenant.id, b.kod);
  if (acik) throw Cakisma(`Bu bütçenin ${acik.surum_no}. sürümü hâlâ açık.`);

  return islem(() => {
    const enBuyuk = Number(tek('SELECT MAX(surum_no) AS n FROM butce WHERE tenant_id = ? AND kod = ?',
      ctx.tenant.id, b.kod)?.n ?? b.surum_no);
    const yeniId = kimlik('butce');
    calistir(`INSERT INTO butce (id, tenant_id, kod, ad, proje_id, santiye_id, yil, toplam_minor,
                tutar_birim, surum_no, onceki_surum_id, revizyon_gerekcesi, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'taslak', ?,?)`,
      yeniId, ctx.tenant.id, b.kod, b.ad, b.proje_id, b.santiye_id, b.yil, b.toplam_minor,
      b.tutar_birim, enBuyuk + 1, b.id, gerekce, ctx.kullanici.id, simdi());
    for (const s of sorgu('SELECT * FROM butce_satiri WHERE butce_id = ?', b.id)) {
      calistir(`INSERT INTO butce_satiri (id, butce_id, maliyet_kodu, aciklama, tutar_minor)
                VALUES (?,?,?,?,?)`, kimlik('satir'), yeniId, s.maliyet_kodu, s.aciklama, s.tutar_minor);
    }
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'butce', nesneId: yeniId, eylem: 'revizyon_acildi', gerekce,
      onceki: { kaynakSurum: b.surum_no }, sonraki: { surumNo: enBuyuk + 1 } });
    return { id: yeniId };
  });
}

function butceSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('FIN-02');
  yetkiZorunlu(ctx, e.yetki);
  const butceler = sorgu(
    `SELECT * FROM butce WHERE tenant_id = ? ORDER BY kod, surum_no DESC LIMIT 100`, ctx.tenant.id);
  const secilenId = ctx.sorgu.get('butce_id') || butceler[0]?.id || null;
  const b = secilenId ? butceler.find((x) => x.id === secilenId) : null;
  const satirlar = b ? sorgu('SELECT * FROM butce_satiri WHERE butce_id = ? ORDER BY maliyet_kodu', b.id) : [];
  const maliyetKodlari = sorgu(
    'SELECT kod, ad FROM maliyet_kodu WHERE tenant_id = ? ORDER BY kod', ctx.tenant.id)
    .map((m) => ({ deger: m.kod, etiket: `${m.kod} — ${m.ad}` }));
  const acikOnay = b ? tek(
    `SELECT id FROM onay_talebi WHERE nesne = 'butce' AND nesne_id = ? AND durum = 'acik'`, b.id) : null;

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.kpiSeridi([
    { etiket: 'Bütçe', deger: sayi(new Set(butceler.map((x) => x.kod)).size), ikon: 'fa-chart-pie' },
    { etiket: 'Onaylı sürüm', deger: sayi(butceler.filter((x) => x.durum === 'onaylandi').length),
      ikon: 'fa-circle-check' },
    { etiket: 'Onaylı toplam', ikon: 'fa-coins', deger: para(butceler
      .filter((x) => x.durum === 'onaylandi').reduce((a, x) => a + Number(x.toplam_minor), 0),
    ctx.tenant.para_birimi) },
    { etiket: 'Onayda', deger: sayi(butceler.filter((x) => ['onaya_gonderildi', 'incelemede'].includes(x.durum)).length),
      ikon: 'fa-hourglass-half' },
  ])}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Bütçeler ve sürümleri</b>
        <span>Onaylı bütçe yerinde değişmez; revizyon yeni sürüm açar (kural 6).</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: butceler,
    satirRota: (x) => `/butceler?butce_id=${x.id}`,
    bosDurum: { baslik: 'Bütçe yok', ikon: 'fa-chart-pie' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod', govde: (x) => h`<b>${x.kod}</b> <span class="muted">s.${x.surum_no}</span>${
        x.id === secilenId ? h` ${B.isaret('seçili', 'info')}` : ''}` },
      { ad: 'ad', etiket: 'Bütçe' },
      { ad: 'proje_id', etiket: 'Proje', govde: (x) => (x.proje_id
        ? tek('SELECT kod FROM proje WHERE id = ?', x.proje_id)?.kod || '—' : 'genel') },
      { ad: 'toplam_minor', etiket: 'Toplam', hizala: 'sag', govde: (x) => para(x.toplam_minor, x.tutar_birim) },
      { ad: 'revizyon_gerekcesi', etiket: 'Revizyon gerekçesi', govde: (x) => x.revizyon_gerekcesi || '—' },
      { ad: 'durum', etiket: 'Durum', govde: (x) => B.rozet(x.durum) },
      { ad: 'islem', etiket: '', govde: (x) => (x.durum === 'onaylandi' && yetkiVar(ctx, 'FIN-03:karar_ver')
        ? B.btn('Revizyon', { rota: `/butceler/${x.id}/revizyon`, kucuk: true }) : '—') },
    ],
  })}</div>
    </div>
    ${b ? h`<div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>${b.kod} s.${b.surum_no} — satırlar</b>
        <span>Gerçekleşen, stok sarfı ve kasa masrafı defterlerinden HESAPLANIR.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: satirlar.map((s) => {
      const g = gerceklesen(ctx.tenant.id, s.maliyet_kodu, { projeId: b.proje_id });
      return { ...s, gerceklesen: g, kalan: Number(s.tutar_minor) - g };
    }),
    bosDurum: { baslik: 'Satır yok', ikon: 'fa-list', aciklama: 'Maliyet kodu bazında bütçe girin.' },
    sutunlar: [
      { ad: 'maliyet_kodu', etiket: 'Maliyet kodu', govde: (s) => h`<b>${s.maliyet_kodu}</b>
        <br><span class="muted">${tek('SELECT ad FROM maliyet_kodu WHERE tenant_id = ? AND kod = ?',
    ctx.tenant.id, s.maliyet_kodu)?.ad || ''}</span>` },
      { ad: 'tutar_minor', etiket: 'Bütçe', hizala: 'sag', govde: (s) => para(s.tutar_minor, b.tutar_birim) },
      { ad: 'gerceklesen', etiket: 'Gerçekleşen', hizala: 'sag',
        govde: (s) => para(s.gerceklesen, b.tutar_birim) },
      { ad: 'kalan', etiket: 'Kalan', hizala: 'sag', govde: (s) => (s.kalan < 0
        ? B.isaret(para(s.kalan, b.tutar_birim), 'danger') : para(s.kalan, b.tutar_birim)) },
      { ad: 'oran', etiket: 'Kullanım', hizala: 'sag', govde: (s) => (Number(s.tutar_minor)
        ? `%${((s.gerceklesen / Number(s.tutar_minor)) * 100).toFixed(1).replace('.', ',')}` : '—') },
    ],
  })}</div>
    </div>` : ''}
  </div>
  <div class="gv-side-stack">
    ${yetkiVar(ctx, 'FIN-02:olustur') ? B.form({
    rota: '/butceler', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni bütçe', alanlar: h`
      ${ham('<input type="hidden" name="_eylem" value="ac">')}
      ${B.alan({ ad: 'ad', etiket: 'Bütçe adı', zorunlu: true, genis: true, deger: deger.ad || '',
      hata: hata?.alanlar?.ad })}
      ${B.alan({ ad: 'projeId', etiket: 'Proje',
      secenekler: [{ deger: '', etiket: 'Genel' }, ...projeSecenekleri(ctx)] })}
      ${B.alan({ ad: 'yil', etiket: 'Yıl', tur: 'number', deger: String(new Date(simdi()).getUTCFullYear()) })}` }],
    eylemler: B.btn('Bütçeyi aç', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}
    ${b && ['taslak', 'revizyon_istendi'].includes(b.durum) && yetkiVar(ctx, 'FIN-02:guncelle') ? h`
    ${B.form({
    rota: '/butceler', csrf: csrfAlani(ctx),
    bolumler: [{ baslik: 'Bütçe satırı ekle', alanlar: h`
      ${ham('<input type="hidden" name="_eylem" value="satir">')}
      ${ham(`<input type="hidden" name="butceId" value="${b.id}">`)}
      ${B.alan({ ad: 'maliyetKodu', etiket: 'Maliyet kodu', zorunlu: true,
      secenekler: [{ deger: '', etiket: 'Seçin…' }, ...maliyetKodlari] })}
      ${B.alan({ ad: 'tutar', etiket: 'Tutar', zorunlu: true })}
      ${B.alan({ ad: 'aciklama', etiket: 'Açıklama', genis: true })}` }],
    eylemler: B.btn('Satırı ekle', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  })}
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Bütçeyi onaya gönder</b></div></div>
      <div class="gc-body">
        <form method="post" action="/butceler" data-gform="1">
          ${ham(csrfAlani(ctx))}
          <input type="hidden" name="_eylem" value="onaya_gonder">
          <input type="hidden" name="butceId" value="${b.id}">
          ${B.alan({ ad: 'gerekce', etiket: 'Not', tur: 'metin' })}
          <div style="margin-top:12px">${B.btn('Onaya gönder', { tur: 'acc', gonder: true, ikon: 'fa-paper-plane' })}</div>
        </form>
      </div>
    </div>` : ''}
    ${acikOnay ? B.sonucSeridi({ tur: 'warn', baslik: 'Bütçe onayı bekliyor',
    kayitRota: `/onaylar/${acikOnay.id}` }) : ''}
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

function butceRevizyonSayfasi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('FIN-03');
  yetkiZorunlu(ctx, e.yetki);
  const b = kaydiAl(ctx, 'butce', 'butce', id);
  const surumler = sorgu('SELECT * FROM butce WHERE tenant_id = ? AND kod = ? ORDER BY surum_no DESC',
    ctx.tenant.id, b.kod);
  const acik = surumler.find((x) => !['onaylandi', 'iptal', 'reddedildi'].includes(x.durum));

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${B.detayOzetSeridi({
    kod: `${b.kod} · s.${b.surum_no}`, baslik: `${b.ad} — revizyon`, durum: b.durum, surum: b.surum,
    bilgiler: [
      { etiket: 'Toplam', deger: para(b.toplam_minor, b.tutar_birim) },
      { etiket: 'Sürüm sayısı', deger: sayi(surumler.length) },
    ],
    birincilEylem: B.btn('Bütçelere dön', { rota: `/butceler?butce_id=${b.id}` }),
  })}
<div class="dash-cols">
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>Sürüm geçmişi</b></div></div>
    <div class="gc-body flush">${B.tablo({
    satirlar: surumler,
    satirRota: (x) => `/butceler?butce_id=${x.id}`,
    bosDurum: { baslik: 'Sürüm yok' },
    sutunlar: [
      { ad: 'surum_no', etiket: 'Sürüm', govde: (x) => h`<b>${x.surum_no}</b>` },
      { ad: 'toplam_minor', etiket: 'Toplam', hizala: 'sag', govde: (x) => para(x.toplam_minor, x.tutar_birim) },
      { ad: 'revizyon_gerekcesi', etiket: 'Gerekçe', govde: (x) => x.revizyon_gerekcesi || '—' },
      { ad: 'durum', etiket: 'Durum', govde: (x) => B.rozet(x.durum) },
    ],
  })}</div>
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Yeni sürüm aç</b>
        <span>Satırlar kopyalanır; yeni sürüm baştan onaya girer.</span></div></div>
      <div class="gc-body">
        ${b.durum !== 'onaylandi' ? B.sonucSeridi({ tur: 'warn', baslik: 'Bu sürüm onaylı değil' }) : ''}
        ${acik ? B.sonucSeridi({ tur: 'warn', baslik: `Sürüm ${acik.surum_no} açık`,
    kayitRota: `/butceler?butce_id=${acik.id}` }) : ''}
        ${b.durum === 'onaylandi' && !acik && yetkiVar(ctx, 'FIN-03:karar_ver') ? h`
        <form method="post" action="/butceler/${b.id}/revizyon" data-gform="1">
          ${ham(csrfAlani(ctx))}
          ${B.alan({ ad: 'gerekce', etiket: 'Revizyon gerekçesi', tur: 'metin', zorunlu: true,
    hata: hata?.alanlar?.gerekce })}
          <div style="margin-top:12px">${B.btn('Revizyon sürümü aç',
    { tur: 'acc', gonder: true, ikon: 'fa-code-branch' })}</div>
        </form>` : ''}
      </div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: b.kod, baslik: b.ad }));
}

/* ==========================================================================
   FIN-04 tahmin ve EAC
   ========================================================================== */
function tahminRaporu(ctx) {
  const e = ekranNesnesi('FIN-04');
  /* Tahmin/EAC ekranı ReportLayout raporu DEĞİLDİR; `?cikti=` açıkça
     reddedilir (kural 9, denetim-01 D-05). */
  ciktiDesteklenmez(ctx, { yerine: 'RPT-05 Maliyet ve bütçe sapma' });
  yetkiZorunlu(ctx, e.yetki);
  const projeler = sorgu(
    `SELECT * FROM proje WHERE tenant_id = ? AND durum NOT IN ('arsiv') ORDER BY kod`, ctx.tenant.id);

  const satirlar = projeler.map((p) => {
    const butce = tek(
      `SELECT * FROM butce WHERE tenant_id = ? AND proje_id = ? AND durum = 'onaylandi'
        ORDER BY surum_no DESC LIMIT 1`, ctx.tenant.id, p.id);
    const bac = butce ? Number(butce.toplam_minor) : 0;
    /* Gerçekleşen maliyet: onaylı hakediş brütü + kasa masrafı + stok sarfı. */
    const hakedis = Number(tek(
      `SELECT COALESCE(SUM(hk.donem_brut_minor),0) AS n FROM hakedis hk
         JOIN sozlesme s ON s.id = hk.sozlesme_id
        WHERE hk.tenant_id = ? AND s.proje_id = ? AND hk.durum = 'onaylandi'`,
      ctx.tenant.id, p.id)?.n ?? 0);
    const kasa = Number(tek(
      `SELECT COALESCE(SUM(tutar_minor),0) AS n FROM kasa_hareketi
        WHERE tenant_id = ? AND proje_id = ? AND yon = -1`, ctx.tenant.id, p.id)?.n ?? 0);
    const ac = hakedis + kasa;
    /* İlerleme onaylı ilerleme kayıtlarından; PV = BAC × ilerleme. */
    const ilerlemeBinde = Number(tek(
      `SELECT COALESCE(AVG(yuzde_binde),0) AS n FROM ilerleme
        WHERE tenant_id = ? AND proje_id = ? AND durum = 'onaylandi'`, ctx.tenant.id, p.id)?.n ?? 0);
    const ev = Math.round(bac * (ilerlemeBinde / 100_000));
    const cpi = ac > 0 ? ev / ac : null;
    const eac = cpi && cpi > 0 ? Math.round(bac / cpi) : (ac || bac);
    return { proje: p, butce, bac, ac, ev, cpi, eac, vac: bac - eac, ilerlemeBinde };
  });

  const icerik = h`
${B.kpiSeridi([
    { etiket: 'Bütçe (BAC)', ikon: 'fa-chart-pie',
      deger: para(satirlar.reduce((a, s) => a + s.bac, 0), ctx.tenant.para_birimi) },
    { etiket: 'Gerçekleşen (AC)', ikon: 'fa-money-bill-wave',
      deger: para(satirlar.reduce((a, s) => a + s.ac, 0), ctx.tenant.para_birimi) },
    { etiket: 'Tahmini toplam (EAC)', ikon: 'fa-chart-line',
      deger: para(satirlar.reduce((a, s) => a + s.eac, 0), ctx.tenant.para_birimi) },
    { etiket: 'Tahmini sapma (VAC)', ikon: 'fa-scale-unbalanced',
      ton: satirlar.reduce((a, s) => a + s.vac, 0) < 0 ? 'danger' : '',
      deger: para(satirlar.reduce((a, s) => a + s.vac, 0), ctx.tenant.para_birimi) },
  ])}
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Proje bazında tahmin</b>
    <span>Her sütunun formülü aşağıdadır; hiçbir değer elle girilmez (kural 9).</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar,
    bosDurum: { baslik: 'Proje yok', ikon: 'fa-diagram-project' },
    sutunlar: [
      { ad: 'proje', etiket: 'Proje', govde: (s) => h`<a href="/projeler/${s.proje.id}"><b>${s.proje.kod}</b></a>
        <br><span class="muted">${s.proje.ad}</span>` },
      { ad: 'bac', etiket: 'BAC', hizala: 'sag', govde: (s) => (s.butce
        ? para(s.bac, ctx.tenant.para_birimi) : h`<span class="muted">bütçe yok</span>`) },
      { ad: 'ilerlemeBinde', etiket: 'İlerleme', hizala: 'sag',
        govde: (s) => `%${(s.ilerlemeBinde / 1000).toFixed(1).replace('.', ',')}` },
      { ad: 'ev', etiket: 'EV', hizala: 'sag', govde: (s) => para(s.ev, ctx.tenant.para_birimi) },
      { ad: 'ac', etiket: 'AC', hizala: 'sag', govde: (s) => para(s.ac, ctx.tenant.para_birimi) },
      { ad: 'cpi', etiket: 'CPI', hizala: 'sag', govde: (s) => (s.cpi == null ? '—'
        : B.isaret(s.cpi.toFixed(2).replace('.', ','), s.cpi < 1 ? 'danger' : 'ok')) },
      { ad: 'eac', etiket: 'EAC', hizala: 'sag', govde: (s) => para(s.eac, ctx.tenant.para_birimi) },
      { ad: 'vac', etiket: 'VAC', hizala: 'sag', govde: (s) => (s.vac < 0
        ? B.isaret(para(s.vac, ctx.tenant.para_birimi), 'danger') : para(s.vac, ctx.tenant.para_birimi)) },
    ],
  })}</div>
</div>
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Formül sözlüğü</b></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: [
      { k: 'BAC', ad: 'Bütçelenen toplam', f: 'projenin ONAYLI son sürüm bütçe toplamı' },
      { k: 'İlerleme', ad: 'Fiziksel ilerleme', f: 'onaylı ilerleme kayıtlarının ortalaması (binde)' },
      { k: 'EV', ad: 'Kazanılmış değer', f: 'BAC × ilerleme' },
      { k: 'AC', ad: 'Gerçekleşen maliyet', f: 'onaylı hakediş brütü + kasa çıkışları' },
      { k: 'CPI', ad: 'Maliyet performans endeksi', f: 'EV / AC (1\'in altı bütçe aşımı riski)' },
      { k: 'EAC', ad: 'Tahmini toplam maliyet', f: 'BAC / CPI' },
      { k: 'VAC', ad: 'Tahmini sapma', f: 'BAC − EAC (eksi ise aşım)' },
    ],
    bosDurum: { baslik: 'Formül yok' },
    sutunlar: [
      { ad: 'k', etiket: 'Kısaltma', govde: (r) => h`<b>${r.k}</b>` },
      { ad: 'ad', etiket: 'Gösterge' },
      { ad: 'f', etiket: 'Formül', govde: (r) => h`<code>${r.f}</code>` },
    ],
  })}</div>
</div>
<div class="gv-card"><div class="gc-body">
  <div class="gv-cap-sm">Rapor künyesi</div>
  <dl class="gd-grid" style="margin-top:12px;padding-top:0;border-top:0">
    <div><dt>Kapsam</dt><dd>${satirlar.length} proje · arşiv hariç</dd></div>
    <div><dt>Veri tarihi</dt><dd>${tarih(simdi())}</dd></div>
    <div><dt>Rapor sürümü</dt><dd>FIN-04 v1</dd></div>
  </dl>
</div></div>
${B.veriTarihi(simdi())}`;
  return html(ctx, 200, ciz(ctx, e, icerik));
}

/* ==========================================================================
   FIN-05 / FIN-06 kasa
   ========================================================================== */
function kasaAc(ctx, govde) {
  const ad = String(govde.ad || '').trim();
  if (!ad) throw DogrulamaHatasi('Kasa adı zorunludur.', { alanlar: { ad: ['Ad girin.'] } });
  const santiye = govde.santiyeId
    ? tek('SELECT * FROM santiye WHERE id = ? AND tenant_id = ?', govde.santiyeId, ctx.tenant.id) : null;
  islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'kasa');
    const id = kimlik('kasa');
    calistir(`INSERT INTO kasa (id, tenant_id, kod, ad, santiye_id, proje_id, para_birimi, sorumlu_id,
                durum, olusturan, olusturuldu) VALUES (?,?,?,?,?,?,?,?, 'aktif', ?,?)`,
      id, ctx.tenant.id, kod, ad, santiye?.id || null, santiye?.proje_id || null,
      govde.paraBirimi || ctx.tenant.para_birimi, govde.sorumluId || null, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'kasa', nesneId: id, eylem: 'olustur', sonraki: { kod, ad } });
  });
  return 'Kasa açıldı';
}

function kasaSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('FIN-05');
  yetkiZorunlu(ctx, e.yetki);
  const kasalar = fdefter.bakiyeler('kasa', ctx.tenant.id);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Aktif kasa', deger: sayi(kasalar.filter((k) => k.durum === 'aktif').length),
        ikon: 'fa-cash-register' },
      { etiket: 'Toplam bakiye', ikon: 'fa-coins',
        deger: para(kasalar.reduce((a, k) => a + k.bakiye_minor, 0), ctx.tenant.para_birimi) },
      { etiket: 'Hareket', deger: sayi(kasalar.reduce((a, k) => a + k.hareket_sayisi, 0)), ikon: 'fa-right-left' },
      { etiket: 'Kasa sayısı', deger: sayi(kasalar.length), ikon: 'fa-list' },
    ]),
    filtre: null,
    icerik: B.tablo({
      satirlar: kasalar,
      satirRota: (k) => `/kasa-hareketleri?kasa_id=${k.id}`,
      bosDurum: { baslik: 'Kasa yok', ikon: 'fa-cash-register',
        aciklama: 'Kasa bakiyesi saklanmaz; hareket defterinden türetilir.' },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'ad', etiket: 'Kasa', govde: (k) => h`<b>${k.ad}</b>${k.santiye_id
          ? h`<br><span class="muted">${tek('SELECT kod FROM santiye WHERE id = ?', k.santiye_id)?.kod || ''}</span>` : ''}` },
        { ad: 'sorumlu_id', etiket: 'Sorumlu', govde: (k) => kullaniciAdi(k.sorumlu_id) },
        { ad: 'bakiye_minor', etiket: 'Bakiye', hizala: 'sag',
          govde: (k) => h`<b>${para(k.bakiye_minor, k.para_birimi)}</b>` },
        { ad: 'hareket_sayisi', etiket: 'Hareket', hizala: 'sag' },
        { ad: 'son_hareket', etiket: 'Son hareket', govde: (k) => (k.son_hareket ? tarih(k.son_hareket) : '—') },
        { ad: 'durum', etiket: 'Durum', govde: (k) => B.rozet(k.durum === 'aktif' ? 'onaylandi' : 'kapali',
          { aktif: 'Aktif', pasif: 'Pasif', kapali: 'Kapalı' }[k.durum]) },
      ],
    }),
    sayfalayici: null,
    veriZamani: simdi(),
  })}
<div class="gv-card" style="margin-top:18px"><div class="gc-body">
  <p class="gf-hint" style="margin:0"><b>Bakiye saklanmaz.</b> Buradaki her sayı
    <code>kasa_hareketi</code> defterinin toplanmasıyla üretilir; kasa kaydında bakiye
    sütunu yoktur. Nakit kasa eksiye düşemez (kural 7).</p>
</div></div>
${yetkiVar(ctx, 'FIN-05:olustur') ? B.form({
    rota: '/kasalar', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni kasa', alanlar: h`
      ${B.alan({ ad: 'ad', etiket: 'Kasa adı', zorunlu: true, genis: true, deger: deger.ad || '',
    hata: hata?.alanlar?.ad })}
      ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye',
    secenekler: [{ deger: '', etiket: 'Merkez' }, ...santiyeSecenekleri(ctx)] })}
      ${B.alan({ ad: 'sorumluId', etiket: 'Kasa sorumlusu',
    secenekler: [{ deger: '', etiket: 'Seçin…' }, ...kullaniciSecenekleri(ctx)] })}
      ${B.alan({ ad: 'paraBirimi', etiket: 'Para birimi', deger: ctx.tenant.para_birimi,
    secenekler: Object.keys(BIRIMLER).map((k) => ({ deger: k, etiket: k })) })}` }],
    eylemler: B.btn('Kasayı aç', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

function kasaHareketiYaz(ctx, govde) {
  yetkiZorunlu(ctx, 'FIN-06:olustur');
  const k = tek('SELECT * FROM kasa WHERE id = ? AND tenant_id = ?', govde.kasaId, ctx.tenant.id);
  if (!k) throw DogrulamaHatasi('Kasa seçin.', { alanlar: { kasaId: ['Kasa bulunamadı.'] } });
  if (k.durum !== 'aktif') throw GecisIzinsiz('Kapalı kasaya hareket yazılamaz.');
  const turler = fdefter.hareketTurleri('kasa');
  if (!turler.includes(govde.tur)) {
    throw DogrulamaHatasi('İşlem türü seçin.', { alanlar: { tur: ['Geçersiz tür.'] } });
  }
  const tutar = Para.ayristir(govde.tutar || '', k.para_birimi);
  if (tutar.minor <= 0n) {
    throw DogrulamaHatasi('Tutar sıfırdan büyük olmalı.', { alanlar: { tutar: ['Tutar girin.'] } });
  }
  const zaman = govde.tarih ? gunBaslangici(govde.tarih) : simdi();
  donemKilidiKontrol(ctx, zaman);
  /* Belgesiz harcamada açıklama zorunlu: denetimde "ne için" sorusu yanıtsız kalmaz. */
  if (!String(govde.belgeNo || '').trim() && !String(govde.aciklama || '').trim()) {
    throw DogrulamaHatasi('Belge numarası yoksa açıklama zorunludur.',
      { alanlar: { aciklama: ['Belgesiz harcamada açıklama girin.'] } });
  }

  return islem(() => {
    fdefter.hareketYaz(ctx, 'kasa', {
      sahipId: k.id, tur: govde.tur, tutarMinor: tutar.minor, tutarBirim: k.para_birimi,
      cariId: govde.cariId || null, santiyeId: k.santiye_id, projeId: k.proje_id,
      maliyetKodu: govde.maliyetKodu || null, belgeNo: govde.belgeNo || null,
      aciklama: govde.aciklama || null, zaman,
    });
    /* Cari seçilmişse cari defterine de karşı kayıt düşer (çift taraflı izleme). */
    if (govde.cariId) {
      const c = tek('SELECT * FROM cari WHERE id = ? AND tenant_id = ?', govde.cariId, ctx.tenant.id);
      if (c) {
        fdefter.hareketYaz(ctx, 'cari', {
          sahipId: c.id, tur: govde.tur === 'tahsilat' ? 'tahsilat' : 'odeme',
          tutarMinor: tutar.minor, tutarBirim: c.para_birimi,
          kaynakNesne: 'kasa', kaynakId: k.id, zaman,
          aciklama: `${k.kod} kasa hareketi${govde.aciklama ? ` — ${govde.aciklama}` : ''}`,
        });
      }
    }
    return `${fdefter.hareketEtiketi('kasa', govde.tur)} — ${para(tutar.minor, k.para_birimi)} deftere yazıldı`;
  });
}

function kasaTersKayit(ctx, govde) {
  yetkiZorunlu(ctx, 'FIN-06:guncelle');
  const h0 = tek('SELECT * FROM kasa_hareketi WHERE id = ? AND tenant_id = ?', govde.hareketId, ctx.tenant.id);
  if (!h0) throw Bulunamadi('Hareket bulunamadı.');
  donemKilidiKontrol(ctx, simdi());
  islem(() => fdefter.tersKayit(ctx, 'kasa', govde.hareketId, govde.gerekce));
  return 'Ters kayıt yazıldı';
}

function kasaHareketSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('FIN-06');
  yetkiZorunlu(ctx, e.yetki);
  const kasaId = ctx.sorgu.get('kasa_id') || '';
  const ay = ctx.sorgu.get('ay') || donemAnahtari(simdi());
  const bas = gunBaslangici(`${ay}-01`);
  const hareketler = fdefter.dokum('kasa', ctx.tenant.id, {
    sahipId: kasaId || null, baslangic: bas, bitis: bas + 32 * GUN_MS, limit: 300,
  });
  const kasa = kasaId ? tek('SELECT * FROM kasa WHERE id = ?', kasaId) : null;
  const bakiye = kasaId ? fdefter.bakiye('kasa', kasaId) : null;

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: kasa ? `${kasa.kod} bakiyesi` : 'Toplam bakiye', ikon: 'fa-coins',
        deger: para(bakiye ?? fdefter.bakiyeler('kasa', ctx.tenant.id)
          .reduce((a, k) => a + k.bakiye_minor, 0), ctx.tenant.para_birimi),
        alt: 'defterden hesaplandı' },
      { etiket: 'Dönem girişi', ikon: 'fa-arrow-up', deger: para(hareketler
        .filter((x) => x.yon > 0).reduce((a, x) => a + Number(x.tutar_minor), 0), ctx.tenant.para_birimi) },
      { etiket: 'Dönem çıkışı', ikon: 'fa-arrow-down', deger: para(hareketler
        .filter((x) => x.yon < 0).reduce((a, x) => a + Number(x.tutar_minor), 0), ctx.tenant.para_birimi) },
      { etiket: 'Hareket', deger: sayi(hareketler.length), ikon: 'fa-right-left' },
    ]),
    filtre: B.filtreBari({ rota: '/kasa-hareketleri', sorgu: ctx.sorgu, aramaYer: 'Ara…',
      filtreler: [
        { ad: 'kasa_id', etiket: 'Kasa', secenekler: kasaSecenekleri(ctx) },
        { ad: 'ay', etiket: 'Dönem', secenekler: Array.from({ length: 6 }, (_, i) => {
          const k = donemAnahtari(simdi() - i * 30 * GUN_MS);
          return { deger: k, etiket: k };
        }) },
      ] }),
    icerik: B.tablo({
      satirlar: hareketler,
      bosDurum: { baslik: 'Bu dönemde kasa hareketi yok', ikon: 'fa-cash-register',
        aciklama: 'Hareketler değiştirilemez; düzeltme ters kayıtla yapılır.' },
      sutunlar: [
        { ad: 'zaman', etiket: 'Tarih', govde: (x) => tarih(x.zaman) },
        { ad: 'sahip_kod', etiket: 'Kasa' },
        { ad: 'tur', etiket: 'Tür', govde: (x) => h`${fdefter.hareketEtiketi('kasa', x.tur)}${
          x.ters_kayit_id ? h`<br>${B.isaret('ters kayıt', 'warn')}` : ''}` },
        { ad: 'aciklama', etiket: 'Açıklama', govde: (x) => h`${x.aciklama || '—'}${
          x.belge_no ? h`<br><span class="muted">belge: ${x.belge_no}</span>`
            : h`<br>${B.isaret('belgesiz', 'warn')}`}` },
        { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag', govde: (x) => h`<b>${
          x.yon > 0 ? '+' : '−'}${para(x.tutar_minor, x.tutar_birim)}</b>` },
        ...(kasaId ? [{ ad: 'yuruyen_minor', etiket: 'Yürüyen bakiye', hizala: 'sag',
          govde: (x) => para(x.yuruyen_minor, x.tutar_birim) }] : []),
        { ad: 'islem', etiket: '', govde: (x) => {
          if (!yetkiVar(ctx, 'FIN-06:guncelle') || x.ters_kayit_id) return '—';
          if (tek('SELECT id FROM kasa_hareketi WHERE ters_kayit_id = ?', x.id)) {
            return B.isaret('düzeltildi', 'info');
          }
          return h`<form method="post" action="/kasa-hareketleri" style="display:flex;gap:6px">
            ${ham(csrfAlani(ctx))}
            <input type="hidden" name="_eylem" value="ters">
            <input type="hidden" name="hareketId" value="${x.id}">
            <input type="text" name="gerekce" placeholder="Gerekçe" aria-label="Gerekçe" style="max-width:120px">
            <button class="btn btn-ghost btn-sm" type="submit">Ters kayıt</button></form>`;
        } },
      ],
    }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'FIN-06:olustur') ? B.form({
    rota: '/kasa-hareketleri', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Kasa hareketi',
      aciklama: 'Hareket doğrudan deftere yazılır ve DEĞİŞTİRİLEMEZ. '
        + 'Belge numarası yoksa açıklama zorunludur. Kapalı döneme yazılamaz.',
      alanlar: h`
      ${B.alan({ ad: 'kasaId', etiket: 'Kasa', zorunlu: true, deger: deger.kasaId || kasaId,
    hata: hata?.alanlar?.kasaId, secenekler: [{ deger: '', etiket: 'Seçin…' }, ...kasaSecenekleri(ctx)] })}
      ${B.alan({ ad: 'tur', etiket: 'İşlem türü', zorunlu: true, deger: deger.tur || 'odeme',
    hata: hata?.alanlar?.tur,
    secenekler: fdefter.hareketTurleri('kasa').map((t) => ({ deger: t, etiket: fdefter.hareketEtiketi('kasa', t) })) })}
      ${B.alan({ ad: 'tutar', etiket: 'Tutar', zorunlu: true, deger: deger.tutar || '',
    hata: hata?.alanlar?.tutar })}
      ${B.alan({ ad: 'tarih', etiket: 'Tarih', tur: 'date', deger: deger.tarih || gunAnahtari(simdi()) })}
      ${B.alan({ ad: 'cariId', etiket: 'Cari', deger: deger.cariId || '',
    secenekler: [{ deger: '', etiket: 'Carisiz' }, ...cariSecenekleri(ctx)] })}
      ${B.alan({ ad: 'belgeNo', etiket: 'Belge no', deger: deger.belgeNo || '' })}
      ${B.alan({ ad: 'maliyetKodu', etiket: 'Maliyet kodu', deger: deger.maliyetKodu || '',
    secenekler: [{ deger: '', etiket: 'Seçin…' }, ...sorgu(
      'SELECT kod, ad FROM maliyet_kodu WHERE tenant_id = ? ORDER BY kod', ctx.tenant.id)
      .map((m) => ({ deger: m.kod, etiket: `${m.kod} — ${m.ad}` }))] })}
      ${B.alan({ ad: 'aciklama', etiket: 'Açıklama', tur: 'metin', genis: true, deger: deger.aciklama || '',
    hata: hata?.alanlar?.aciklama })}` }],
    eylemler: B.btn('Deftere yaz', { tur: 'acc', gonder: true, ikon: 'fa-pen-to-square' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/* ==========================================================================
   FIN-07..09 banka
   ========================================================================== */
function bankaHesabiAc(ctx, govde) {
  const ad = String(govde.ad || '').trim();
  const banka = String(govde.banka || '').trim();
  if (!ad || !banka) {
    throw DogrulamaHatasi('Hesap adı ve banka zorunludur.',
      { alanlar: { ad: ad ? undefined : ['Ad girin.'], banka: banka ? undefined : ['Banka girin.'] } });
  }
  if (govde.iban && tek('SELECT id FROM banka_hesabi WHERE tenant_id = ? AND iban = ?',
    ctx.tenant.id, govde.iban)) {
    throw Cakisma('Bu IBAN ile kayıtlı hesap zaten var.');
  }
  islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'banka');
    const id = kimlik('banka');
    calistir(`INSERT INTO banka_hesabi (id, tenant_id, kod, ad, banka, sube, iban, hesap_no,
                para_birimi, durum, olusturan, olusturuldu) VALUES (?,?,?,?,?,?,?,?,?, 'aktif', ?,?)`,
      id, ctx.tenant.id, kod, ad, banka, govde.sube || null, govde.iban || null,
      govde.hesapNo || null, govde.paraBirimi || ctx.tenant.para_birimi, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'banka_hesabi', nesneId: id, eylem: 'olustur', sonraki: { kod, ad, banka } });
  });
  return 'Banka hesabı açıldı';
}

function bankaSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('FIN-07');
  yetkiZorunlu(ctx, e.yetki);
  const hesaplar = fdefter.bakiyeler('banka', ctx.tenant.id);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Aktif hesap', deger: sayi(hesaplar.filter((k) => k.durum === 'aktif').length),
        ikon: 'fa-building-columns' },
      { etiket: 'Toplam bakiye', ikon: 'fa-coins',
        deger: para(hesaplar.reduce((a, k) => a + k.bakiye_minor, 0), ctx.tenant.para_birimi) },
      { etiket: 'Eşleşmemiş hareket', ton: 'warn', ikon: 'fa-link-slash',
        deger: sayi(sayac(ctx.tenant.id, 'banka_hareketi', 'eslesen_id IS NULL')) },
      { etiket: 'Hesap sayısı', deger: sayi(hesaplar.length), ikon: 'fa-list' },
    ]),
    icerik: B.tablo({
      satirlar: hesaplar,
      satirRota: (k) => `/banka-hareketleri?hesap_id=${k.id}`,
      bosDurum: { baslik: 'Banka hesabı yok', ikon: 'fa-building-columns' },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'ad', etiket: 'Hesap', govde: (k) => h`<b>${k.banka}</b> ${k.ad}${
          k.sube ? h`<br><span class="muted">${k.sube}</span>` : ''}` },
        { ad: 'iban', etiket: 'IBAN', govde: (k) => k.iban || '—' },
        { ad: 'bakiye_minor', etiket: 'Bakiye', hizala: 'sag',
          govde: (k) => h`<b>${para(k.bakiye_minor, k.para_birimi)}</b>` },
        { ad: 'hareket_sayisi', etiket: 'Hareket', hizala: 'sag' },
        { ad: 'durum', etiket: 'Durum', govde: (k) => B.rozet(k.durum === 'aktif' ? 'onaylandi' : 'kapali',
          { aktif: 'Aktif', pasif: 'Pasif', kapali: 'Kapalı' }[k.durum]) },
      ],
    }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'FIN-07:olustur') ? B.form({
    rota: '/banka-hesaplari', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni banka hesabı', alanlar: h`
      ${B.alan({ ad: 'banka', etiket: 'Banka', zorunlu: true, deger: deger.banka || '',
    hata: hata?.alanlar?.banka })}
      ${B.alan({ ad: 'ad', etiket: 'Hesap adı', zorunlu: true, deger: deger.ad || '',
    hata: hata?.alanlar?.ad })}
      ${B.alan({ ad: 'sube', etiket: 'Şube', deger: deger.sube || '' })}
      ${B.alan({ ad: 'iban', etiket: 'IBAN', genis: true, deger: deger.iban || '' })}
      ${B.alan({ ad: 'hesapNo', etiket: 'Hesap no', deger: deger.hesapNo || '' })}
      ${B.alan({ ad: 'paraBirimi', etiket: 'Para birimi', deger: ctx.tenant.para_birimi,
    secenekler: Object.keys(BIRIMLER).map((k) => ({ deger: k, etiket: k })) })}` }],
    eylemler: B.btn('Hesabı aç', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

function bankaHareketiYaz(ctx, govde) {
  const hesap = tek('SELECT * FROM banka_hesabi WHERE id = ? AND tenant_id = ?', govde.hesapId, ctx.tenant.id);
  if (!hesap) throw DogrulamaHatasi('Hesap seçin.', { alanlar: { hesapId: ['Hesap bulunamadı.'] } });
  const turler = fdefter.hareketTurleri('banka');
  if (!turler.includes(govde.tur)) {
    throw DogrulamaHatasi('İşlem türü seçin.', { alanlar: { tur: ['Geçersiz tür.'] } });
  }
  const tutar = Para.ayristir(govde.tutar || '', hesap.para_birimi);
  if (tutar.minor <= 0n) {
    throw DogrulamaHatasi('Tutar sıfırdan büyük olmalı.', { alanlar: { tutar: ['Tutar girin.'] } });
  }
  const zaman = govde.tarih ? gunBaslangici(govde.tarih) : simdi();
  donemKilidiKontrol(ctx, zaman);
  /* Banka referansı hesap içinde TEKİLDİR: aynı ekstre satırı iki kez girilemez. */
  const ref = String(govde.bankaReferans || '').trim() || null;
  if (ref && tek('SELECT id FROM banka_hareketi WHERE hesap_id = ? AND banka_referans = ?', hesap.id, ref)) {
    throw Cakisma(`"${ref}" referanslı hareket bu hesapta zaten var; ekstre iki kez yüklenemez.`);
  }

  islem(() => {
    fdefter.hareketYaz(ctx, 'banka', {
      sahipId: hesap.id, tur: govde.tur, tutarMinor: tutar.minor, tutarBirim: hesap.para_birimi,
      valor: govde.valor ? gunBaslangici(govde.valor) : null,
      aciklama: govde.aciklama || null, karsiHesap: govde.karsiHesap || null,
      bankaReferans: ref, cariId: govde.cariId || null, kaynak: govde.kaynak || 'elle', zaman,
    });
  });
  return `${fdefter.hareketEtiketi('banka', govde.tur)} — ${para(tutar.minor, hesap.para_birimi)} kaydedildi`;
}

function bankaHareketSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('FIN-08');
  yetkiZorunlu(ctx, e.yetki);
  const hesapId = ctx.sorgu.get('hesap_id') || '';
  const ay = ctx.sorgu.get('ay') || donemAnahtari(simdi());
  const bas = gunBaslangici(`${ay}-01`);
  const hareketler = fdefter.dokum('banka', ctx.tenant.id, {
    sahipId: hesapId || null, baslangic: bas, bitis: bas + 32 * GUN_MS,
    eslesmemis: ctx.sorgu.get('eslesmemis') === '1', limit: 300,
  });

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: hesapId ? 'Hesap bakiyesi' : 'Toplam bakiye', ikon: 'fa-coins',
        deger: para(hesapId ? fdefter.bakiye('banka', hesapId)
          : fdefter.bakiyeler('banka', ctx.tenant.id).reduce((a, k) => a + k.bakiye_minor, 0),
        ctx.tenant.para_birimi), alt: 'defterden hesaplandı' },
      { etiket: 'Dönem girişi', ikon: 'fa-arrow-up', deger: para(hareketler
        .filter((x) => x.yon > 0).reduce((a, x) => a + Number(x.tutar_minor), 0), ctx.tenant.para_birimi) },
      { etiket: 'Dönem çıkışı', ikon: 'fa-arrow-down', deger: para(hareketler
        .filter((x) => x.yon < 0).reduce((a, x) => a + Number(x.tutar_minor), 0), ctx.tenant.para_birimi) },
      { etiket: 'Eşleşmemiş', ton: 'warn', ikon: 'fa-link-slash',
        deger: sayi(hareketler.filter((x) => !x.eslesen_id).length) },
    ]),
    filtre: B.filtreBari({ rota: '/banka-hareketleri', sorgu: ctx.sorgu, aramaYer: 'Ara…',
      filtreler: [
        { ad: 'hesap_id', etiket: 'Hesap', secenekler: hesapSecenekleri(ctx) },
        { ad: 'ay', etiket: 'Dönem', secenekler: Array.from({ length: 6 }, (_, i) => {
          const k = donemAnahtari(simdi() - i * 30 * GUN_MS);
          return { deger: k, etiket: k };
        }) },
        { ad: 'eslesmemis', etiket: 'Görünüm', secenekler: [{ deger: '1', etiket: 'Yalnız eşleşmemiş' }] },
      ] }),
    icerik: B.tablo({
      satirlar: hareketler,
      bosDurum: { baslik: 'Bu dönemde banka hareketi yok', ikon: 'fa-building-columns',
        aciklama: 'Hareketin tutarı, yönü ve tarihi değiştirilemez; yalnız eşleştirme alanı güncellenir.' },
      sutunlar: [
        { ad: 'zaman', etiket: 'Tarih', govde: (x) => tarih(x.zaman) },
        { ad: 'sahip_kod', etiket: 'Hesap' },
        { ad: 'tur', etiket: 'Tür', govde: (x) => fdefter.hareketEtiketi('banka', x.tur) },
        { ad: 'aciklama', etiket: 'Açıklama', govde: (x) => h`${x.aciklama || '—'}${
          x.banka_referans ? h`<br><span class="muted">ref: ${x.banka_referans}</span>` : ''}` },
        { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag', govde: (x) => h`<b>${
          x.yon > 0 ? '+' : '−'}${para(x.tutar_minor, x.tutar_birim)}</b>` },
        ...(hesapId ? [{ ad: 'yuruyen_minor', etiket: 'Yürüyen bakiye', hizala: 'sag',
          govde: (x) => para(x.yuruyen_minor, x.tutar_birim) }] : []),
        { ad: 'eslesen_id', etiket: 'Eşleşme', govde: (x) => (x.eslesen_id
          ? B.isaret(`${x.eslesen_nesne}`, 'ok') : B.isaret('eşleşmemiş', 'warn')) },
      ],
    }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'FIN-08:disa_aktar') ? B.form({
    rota: '/banka-hareketleri', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Banka hareketi kaydet',
      aciklama: 'Banka referansı hesap içinde tekildir; aynı ekstre satırı iki kez girilemez. '
        + 'Tutar, yön ve tarih sonradan değiştirilemez.',
      alanlar: h`
      ${B.alan({ ad: 'hesapId', etiket: 'Hesap', zorunlu: true, deger: deger.hesapId || hesapId,
    hata: hata?.alanlar?.hesapId, secenekler: [{ deger: '', etiket: 'Seçin…' }, ...hesapSecenekleri(ctx)] })}
      ${B.alan({ ad: 'tur', etiket: 'İşlem türü', zorunlu: true, deger: deger.tur || 'gelen',
    hata: hata?.alanlar?.tur,
    secenekler: fdefter.hareketTurleri('banka').map((t) => ({ deger: t, etiket: fdefter.hareketEtiketi('banka', t) })) })}
      ${B.alan({ ad: 'tutar', etiket: 'Tutar', zorunlu: true, deger: deger.tutar || '',
    hata: hata?.alanlar?.tutar })}
      ${B.alan({ ad: 'tarih', etiket: 'İşlem tarihi', tur: 'date', deger: deger.tarih || gunAnahtari(simdi()) })}
      ${B.alan({ ad: 'valor', etiket: 'Valör', tur: 'date', deger: deger.valor || '' })}
      ${B.alan({ ad: 'bankaReferans', etiket: 'Banka referansı', deger: deger.bankaReferans || '' })}
      ${B.alan({ ad: 'karsiHesap', etiket: 'Karşı hesap / IBAN', deger: deger.karsiHesap || '' })}
      ${B.alan({ ad: 'cariId', etiket: 'Cari', deger: deger.cariId || '',
    secenekler: [{ deger: '', etiket: 'Carisiz' }, ...cariSecenekleri(ctx)] })}
      ${B.alan({ ad: 'aciklama', etiket: 'Açıklama', genis: true, deger: deger.aciklama || '' })}` }],
    eylemler: B.btn('Hareketi kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/** FIN-09 — banka hareketi ↔ ödeme/fatura eşleştirmesi. */
function bankaEslestir(ctx, govde) {
  const hh = tek('SELECT * FROM banka_hareketi WHERE id = ? AND tenant_id = ?',
    govde.hareketId, ctx.tenant.id);
  if (!hh) throw Bulunamadi('Banka hareketi bulunamadı.');
  if (hh.eslesen_id) throw Cakisma('Bu hareket zaten eşleştirilmiş.');
  const [nesne, id] = String(govde.hedef || '').split(':');
  if (!nesne || !id) throw DogrulamaHatasi('Eşleştirilecek belgeyi seçin.',
    { alanlar: { hedef: ['Belge seçin.'] } });

  const tablo = { odeme: 'odeme', fatura: 'fatura' }[nesne];
  if (!tablo) throw DogrulamaHatasi('Geçersiz belge türü.');
  const belge = tek(`SELECT * FROM ${tablo} WHERE id = ? AND tenant_id = ?`, id, ctx.tenant.id);
  if (!belge) throw Bulunamadi('Belge bulunamadı.');
  const belgeTutar = Number(nesne === 'odeme' ? belge.tutar_minor : belge.toplam_minor);
  const fark = Math.abs(belgeTutar - Number(hh.tutar_minor));
  /* Tutar farkı varsa gerekçe zorunlu: "yaklaşık eşleşme" sessizce kabul edilmez. */
  if (fark > 0 && !String(govde.gerekce || '').trim()) {
    throw DogrulamaHatasi(
      `Tutar farkı var (${para(fark, hh.tutar_birim)}); eşleştirme gerekçesi zorunludur.`,
      { alanlar: { gerekce: ['Farkın nedenini yazın.'] } });
  }

  islem(() => {
    calistir(`UPDATE banka_hareketi SET eslesen_nesne = ?, eslesen_id = ?, eslestiren = ?,
              eslesme_zamani = ? WHERE id = ?`, nesne, id, ctx.kullanici.id, simdi(), hh.id);
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'banka_hareketi', nesneId: hh.id, eylem: 'eslestirildi', gerekce: govde.gerekce || null,
      sonraki: { hedef: `${nesne}:${id}`, farkMinor: fark } });
    /* Ödeme eşleşince ödendi sayılır ve cari defterine kayıt düşer. */
    if (nesne === 'odeme' && belge.durum === 'onaylandi') {
      calistir(`UPDATE odeme SET durum = 'odendi', odeme_tarihi = ?, surum = surum + 1 WHERE id = ?`,
        hh.zaman, belge.id);
      if (belge.cari_id) {
        const c = tek('SELECT * FROM cari WHERE id = ?', belge.cari_id);
        fdefter.hareketYaz(ctx, 'cari', {
          sahipId: c.id, tur: 'odeme', tutarMinor: belge.tutar_minor, tutarBirim: belge.tutar_birim,
          kaynakNesne: 'odeme', kaynakId: belge.id, zaman: hh.zaman,
          aciklama: `${belge.kod} ödemesi (banka)`,
        });
      }
      if (belge.fatura_id) {
        const f = tek('SELECT * FROM fatura WHERE id = ?', belge.fatura_id);
        if (f && f.durum === 'onaylandi') {
          gecisYap(ctx, { nesne: 'fatura', tablo: 'fatura', kayit: f,
            eylem: 'odendi_isaretle', motor: true });
        }
      }
    }
  });
  return fark > 0
    ? `Eşleştirildi — ${para(fark, hh.tutar_birim)} fark gerekçeyle kaydedildi`
    : 'Eşleştirildi';
}

function eslestirmeSayfasi(ctx, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('FIN-09');
  yetkiZorunlu(ctx, e.yetki);
  const eslesmemisler = sorgu(
    `SELECT h.*, b.kod AS hesap_kod FROM banka_hareketi h JOIN banka_hesabi b ON b.id = h.hesap_id
      WHERE h.tenant_id = ? AND h.eslesen_id IS NULL ORDER BY h.zaman DESC LIMIT 100`, ctx.tenant.id);
  const odemeler = sorgu(
    `SELECT * FROM odeme WHERE tenant_id = ? AND durum IN ('onaylandi','odendi') ORDER BY olusturuldu DESC LIMIT 100`,
    ctx.tenant.id);
  const faturalar = sorgu(
    `SELECT * FROM fatura WHERE tenant_id = ? AND durum IN ('onaylandi','odendi') ORDER BY olusturuldu DESC LIMIT 100`,
    ctx.tenant.id);
  const hedefler = [
    ...odemeler.map((o) => ({ deger: `odeme:${o.id}`,
      etiket: `Ödeme ${o.kod} — ${para(o.tutar_minor, o.tutar_birim)}` })),
    ...faturalar.map((f) => ({ deger: `fatura:${f.id}`,
      etiket: `Fatura ${f.fatura_no} — ${para(f.toplam_minor, f.tutar_birim)}` })),
  ];

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.kpiSeridi([
    { etiket: 'Eşleşmemiş hareket', deger: sayi(eslesmemisler.length), ikon: 'fa-link-slash',
      ton: eslesmemisler.length ? 'warn' : '' },
    { etiket: 'Eşleşen hareket', ikon: 'fa-link',
      deger: sayi(sayac(ctx.tenant.id, 'banka_hareketi', 'eslesen_id IS NOT NULL')) },
    { etiket: 'Aday belge', deger: sayi(hedefler.length), ikon: 'fa-file-invoice' },
    { etiket: 'Eşleşmemiş tutar', ikon: 'fa-coins',
      deger: para(eslesmemisler.reduce((a, x) => a + x.yon * Number(x.tutar_minor), 0),
        ctx.tenant.para_birimi) },
  ])}
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Eşleşmemiş banka hareketleri</b>
    <span>Tutar farkı olan eşleştirme GEREKÇE ister; sessiz "yaklaşık eşleşme" yoktur.</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: eslesmemisler,
    bosDurum: { baslik: 'Eşleşmemiş hareket yok', ikon: 'fa-circle-check',
      aciklama: 'Tüm banka hareketleri bir belgeye bağlanmış.' },
    sutunlar: [
      { ad: 'zaman', etiket: 'Tarih', govde: (x) => tarih(x.zaman) },
      { ad: 'hesap_kod', etiket: 'Hesap' },
      { ad: 'aciklama', etiket: 'Açıklama', govde: (x) => h`${x.aciklama || '—'}${
        x.banka_referans ? h`<br><span class="muted">ref: ${x.banka_referans}</span>` : ''}` },
      { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag', govde: (x) => h`<b>${
        x.yon > 0 ? '+' : '−'}${para(x.tutar_minor, x.tutar_birim)}</b>` },
      { ad: 'eslestir', etiket: 'Eşleştir', govde: (x) => (!yetkiVar(ctx, 'FIN-09:guncelle') ? '—'
        : h`<form method="post" action="/banka-hareketleri/eslestirme"
              style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            ${ham(csrfAlani(ctx))}
            <input type="hidden" name="hareketId" value="${x.id}">
            <select name="hedef" aria-label="Belge">
              <option value="">Belge seçin…</option>
              ${hedefler.map((o) => h`<option value="${o.deger}">${o.etiket}</option>`)}
            </select>
            <input type="text" name="gerekce" placeholder="Fark gerekçesi" aria-label="Gerekçe"
              style="max-width:140px">
            <button class="btn btn-acc btn-sm" type="submit">Eşleştir</button>
          </form>`) },
    ],
  })}</div>
</div>
${B.veriTarihi(simdi())}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/* ==========================================================================
   FIN-10 cari
   ========================================================================== */
function cariAc(ctx, govde) {
  const unvan = String(govde.unvan || '').trim();
  if (!unvan) throw DogrulamaHatasi('Unvan zorunludur.', { alanlar: { unvan: ['Unvan girin.'] } });
  islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'cari');
    const id = kimlik('cari');
    calistir(`INSERT INTO cari (id, tenant_id, kod, unvan, tur, tedarikci_id, vergi_no, para_birimi,
                durum, olusturan, olusturuldu) VALUES (?,?,?,?,?,?,?,?, 'aktif', ?,?)`,
      id, ctx.tenant.id, kod, unvan, govde.tur || 'tedarikci', govde.tedarikciId || null,
      govde.vergiNo || null, govde.paraBirimi || ctx.tenant.para_birimi, ctx.kullanici.id, simdi());
    if (govde.tedarikciId) calistir('UPDATE tedarikci SET cari_id = ? WHERE id = ?', id, govde.tedarikciId);
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'cari', nesneId: id, eylem: 'olustur', sonraki: { kod, unvan } });
  });
  return 'Cari hesap açıldı';
}

function cariSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('FIN-10');
  yetkiZorunlu(ctx, e.yetki);
  const cariler = fdefter.bakiyeler('cari', ctx.tenant.id);
  const secilenId = ctx.sorgu.get('cari_id') || '';
  const hareketler = secilenId
    ? fdefter.dokum('cari', ctx.tenant.id, { sahipId: secilenId, limit: 200 }) : [];
  const borc = cariler.filter((c) => c.bakiye_minor > 0).reduce((a, c) => a + c.bakiye_minor, 0);
  const alacak = cariler.filter((c) => c.bakiye_minor < 0).reduce((a, c) => a + c.bakiye_minor, 0);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Cari hesap', deger: sayi(cariler.length), ikon: 'fa-address-book' },
      { etiket: 'Toplam borcumuz', deger: para(borc, ctx.tenant.para_birimi), ikon: 'fa-arrow-up',
        ton: borc ? 'warn' : '' },
      { etiket: 'Toplam alacağımız', deger: para(Math.abs(alacak), ctx.tenant.para_birimi),
        ikon: 'fa-arrow-down' },
      { etiket: 'Net', deger: para(borc + alacak, ctx.tenant.para_birimi), ikon: 'fa-scale-balanced' },
    ]),
    filtre: B.filtreBari({ rota: '/cariler', sorgu: ctx.sorgu, aramaYer: 'Ara…',
      filtreler: [{ ad: 'cari_id', etiket: 'Ekstre', secenekler: cariSecenekleri(ctx) }] }),
    icerik: B.tablo({
      satirlar: cariler,
      satirRota: (c) => `/cariler?cari_id=${c.id}`,
      bosDurum: { baslik: 'Cari hesap yok', ikon: 'fa-address-book',
        aciklama: 'Cari bakiyesi saklanmaz; hareket defterinden türetilir.' },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'unvan', etiket: 'Cari', govde: (c) => h`<b>${c.unvan}</b><br><span class="muted">${c.tur}</span>` },
        { ad: 'bakiye_minor', etiket: 'Bakiye', hizala: 'sag', govde: (c) => (c.bakiye_minor > 0
          ? B.isaret(`${para(c.bakiye_minor, c.para_birimi)} borç`, 'warn')
          : c.bakiye_minor < 0
            ? B.isaret(`${para(Math.abs(c.bakiye_minor), c.para_birimi)} alacak`, 'ok')
            : para(0, c.para_birimi)) },
        { ad: 'hareket_sayisi', etiket: 'Hareket', hizala: 'sag' },
        { ad: 'son_hareket', etiket: 'Son hareket', govde: (c) => (c.son_hareket ? tarih(c.son_hareket) : '—') },
      ],
    }),
    veriZamani: simdi(),
  })}
${secilenId ? h`<div class="gv-card" style="margin-top:18px">
  <div class="gc-head"><div class="gc-title"><b>Cari ekstresi</b>
    <span>Yürüyen bakiye listeleme anında toplanır; saklanmaz.</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: hareketler,
    bosDurum: { baslik: 'Hareket yok', ikon: 'fa-right-left' },
    sutunlar: [
      { ad: 'zaman', etiket: 'Tarih', govde: (x) => tarih(x.zaman) },
      { ad: 'tur', etiket: 'Tür', govde: (x) => fdefter.hareketEtiketi('cari', x.tur) },
      { ad: 'aciklama', etiket: 'Açıklama', govde: (x) => x.aciklama || '—' },
      { ad: 'borc', etiket: 'Borç', hizala: 'sag',
        govde: (x) => (x.yon > 0 ? para(x.tutar_minor, x.tutar_birim) : '—') },
      { ad: 'alacak', etiket: 'Alacak', hizala: 'sag',
        govde: (x) => (x.yon < 0 ? para(x.tutar_minor, x.tutar_birim) : '—') },
      { ad: 'yuruyen_minor', etiket: 'Bakiye', hizala: 'sag',
        govde: (x) => h`<b>${para(x.yuruyen_minor, x.tutar_birim)}</b>` },
    ],
  })}</div>
</div>` : ''}
${yetkiVar(ctx, 'FIN-10:olustur') ? B.form({
    rota: '/cariler', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni cari hesap', alanlar: h`
      ${B.alan({ ad: 'unvan', etiket: 'Unvan', zorunlu: true, genis: true, deger: deger.unvan || '',
    hata: hata?.alanlar?.unvan })}
      ${B.alan({ ad: 'tur', etiket: 'Tür', deger: deger.tur || 'tedarikci', secenekler: [
    { deger: 'tedarikci', etiket: 'Tedarikçi' }, { deger: 'musteri', etiket: 'Müşteri' },
    { deger: 'personel', etiket: 'Personel' }, { deger: 'kurum', etiket: 'Kurum' },
    { deger: 'diger', etiket: 'Diğer' }] })}
      ${B.alan({ ad: 'tedarikciId', etiket: 'Tedarikçi kaydı', deger: deger.tedarikciId || '',
    secenekler: [{ deger: '', etiket: 'Bağımsız' }, ...sorgu(
      `SELECT id, kod, unvan FROM tedarikci WHERE tenant_id = ? AND cari_id IS NULL ORDER BY unvan`,
      ctx.tenant.id).map((t) => ({ deger: t.id, etiket: `${t.kod} — ${t.unvan}` }))] })}
      ${B.alan({ ad: 'vergiNo', etiket: 'Vergi no', deger: deger.vergiNo || '' })}` }],
    eylemler: B.btn('Cariyi aç', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/** Bütçe onayı motor geri çağrısı. */
export function butceOnaySonucu(ctx, butceId, sonuc) {
  const b = tek('SELECT * FROM butce WHERE id = ?', butceId);
  if (!b) return;
  const eylem = { onaylandi: 'onayla', reddedildi: 'reddet', revizyon_istendi: 'revizyon_iste' }[sonuc];
  if (!eylem) return;
  if (b.durum === 'onaya_gonderildi') {
    gecisYap(ctx, { nesne: 'butce', tablo: 'butce', kayit: b, eylem: 'incelemeye_al', motor: true });
  }
  const guncel = tek('SELECT * FROM butce WHERE id = ?', butceId);
  if (guncel.durum !== 'incelemede') return;
  gecisYap(ctx, { nesne: 'butce', tablo: 'butce', kayit: guncel, eylem,
    gerekce: `Onay talebi sonucu: ${sonuc}`, motor: true });
}
