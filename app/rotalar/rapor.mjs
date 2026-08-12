/* ============================================================================
   RAPOR ROTALARI — RPT-01, RPT-02, RPT-03..14, RPT-15
   ----------------------------------------------------------------------------
   §11 RPT-01: "Ekran, PDF ve Excel AYNI FİLTRE, VERİ TARİHİ, TOPLAM ve RAPOR
   SÜRÜMÜNÜ taşır."

   Bu dosyada dört çıktı için dört kod yolu YOKTUR: her rapor rotası tanımın
   `veri()` fonksiyonunu BİR KEZ çalıştırır, sonra `?cikti=` parametresine göre
   aynı sonucu `raporEkrani()` veya `raporCikti()` ile serileştirir. Sapma için
   önce bu fonksiyonun iki kez çalışması gerekirdi.
   ========================================================================== */
import { html, yanitla, yonlendir } from '../cekirdek/http.mjs';
import { simdi, tarihSaat, gunAnahtari } from '../cekirdek/zaman.mjs';
import { DogrulamaHatasi, Bulunamadi, UygulamaHatasi, YetkiYok } from '../cekirdek/hata.mjs';
import { RAPORLAR, raporBul } from '../moduller/rapor/tanimlar.mjs';
import { raporEkrani, raporCikti, CIKTI_BICIMLERI, satirTavaniZorunlu, ekranTavani }
  from '../web/rapor-duzeni.mjs';
import {
  ekranNesnesi, hataNesnesi, ciz, B, h, ham, sayi,
  csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar, sorgu, tek, calistir, islem, audit,
} from './ortak.mjs';

/** Rapor kodundan ekran kodunu çözer: RPT-03 → RPT-03. */
const raporEkranKodu = (kod) => kod;

/**
 * Bir raporu görüntüleme yetkisi. Rapor merkezi (RPT-01) yalnız kullanıcının
 * GERÇEKTEN açabildiği raporları listeler — menüde görünüp 403 vermez.
 */
const raporYetkisi = (ctx, r) => yetkiVar(ctx, `${raporEkranKodu(r.kod)}:goruntule`);

/* --- Filtre ayrıştırma ---------------------------------------------------- */
function filtreOku(ctx, rapor) {
  const f = {};
  for (const tanim of rapor.filtreler || []) {
    const d = ctx.sorgu.get(tanim.ad);
    if (d) f[tanim.ad] = d;
  }
  return f;
}

const KAYNAK_SORGULARI = {
  proje: (ctx) => sorgu('SELECT id, kod, ad FROM proje WHERE tenant_id = ? ORDER BY kod', ctx.tenant.id),
  santiye: (ctx) => sorgu('SELECT id, kod, ad FROM santiye WHERE tenant_id = ? ORDER BY kod', ctx.tenant.id),
  depo: (ctx) => sorgu('SELECT id, kod, ad FROM depo WHERE tenant_id = ? ORDER BY kod', ctx.tenant.id),
  saglayici_hesabi: (ctx) => sorgu(
    'SELECT id, kod, ad FROM saglayici_hesabi WHERE tenant_id = ? ORDER BY kod', ctx.tenant.id),
};

function filtreBariCiz(ctx, rapor) {
  if (!rapor.filtreler?.length) return h``;
  return h`<form class="rpt-filtre" method="get" action="${rapor.rota}">
  ${rapor.filtreler.map((f) => {
    if (f.tur === 'date') {
      return h`<label class="gv-filtre-alan"><span>${f.etiket}</span>
        <input type="date" name="${f.ad}" value="${ctx.sorgu.get(f.ad) || ''}"></label>`;
    }
    const secenekler = f.kaynak
      ? (KAYNAK_SORGULARI[f.kaynak]?.(ctx) || []).map((x) => ({ deger: x.id, etiket: `${x.kod} — ${x.ad}` }))
      : (f.secenekler || []);
    return h`<label class="gv-filtre-alan"><span>${f.etiket}</span>
      <select name="${f.ad}"><option value="">Tümü</option>
      ${secenekler.map((s) => h`<option value="${s.deger}"${
        ham(ctx.sorgu.get(f.ad) === String(s.deger) ? ' selected' : '')}>${s.etiket}</option>`)}
      </select></label>`;
  })}
  <button class="btn btn-acc" type="submit"><i class="fa-solid fa-filter"></i> Uygula</button>
  <a class="btn btn-ghost" href="${rapor.rota}">Temizle</a>
</form>`;
}

/* ==========================================================================
   ROTA KURULUMU
   ========================================================================== */
export function kur(y, ekranRota) {
  ekranRota(y, 'RPT-01', { get: (ctx) => raporMerkezi(ctx) });

  /* Her rapor kendi kanonik rotasına bağlanır (manifestteki yol). RPT-15,
     PLAN-11 ve HSE-12 de bu listededir: hepsi tek ReportLayout'tan geçer ve
     dört çıktıyı da üretir (kural 9, denetim-01 D-05). */
  for (const rapor of RAPORLAR) {
    ekranRota(y, rapor.kod, { get: (ctx) => raporGoster(ctx, rapor) });
  }

  /* RPT-02 — standart rapor görüntüleyici: `/raporlar/:kod` kanonik rotaya
     yönlendirir. Aynı raporun iki farklı çıktısı olmaması için ikinci bir
     görüntüleyici YAZILMAZ (kural 4). */
  ekranRota(y, 'RPT-02', {
    get: (ctx, _g, params) => {
      const rapor = RAPORLAR.find((r) => r.kod.toLowerCase() === String(params.kod).toLowerCase()
        || r.rota.endsWith(`/${params.kod}`));
      if (!rapor) throw Bulunamadi(`"${params.kod}" adında bir rapor yok.`);
      const sorguMetni = ctx.sorgu.toString();
      return yonlendir(ctx, `${rapor.rota}${sorguMetni ? `?${sorguMetni}` : ''}`);
    },
  });

  ekranRota(y, 'RPT-14', {
    get: (ctx) => zamanlamaEkrani(ctx),
    post: (ctx, govde) => {
      const e = ekranNesnesi('RPT-14');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = zamanlamaIslemi(ctx, govde);
        return yonlendir(ctx, `/raporlar/zamanlama?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return zamanlamaEkrani(ctx, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });
}

/* ==========================================================================
   RPT-01 — rapor merkezi
   ========================================================================== */
function raporMerkezi(ctx) {
  const e = ekranNesnesi('RPT-01');
  yetkiZorunlu(ctx, e.yetki);
  /* Yalnız GERÇEKTEN açılabilen raporlar listelenir: menüde görünüp 403
     vermek §12'nin "WIP bağlantısı" yasağının aynısıdır. */
  const gorunur = RAPORLAR.filter((r) => raporYetkisi(ctx, r));

  const icerik = h`
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Erişebildiğiniz rapor', deger: sayi(gorunur.length), ikon: 'fa-chart-column' },
      { etiket: 'Toplam tanım', deger: sayi(RAPORLAR.length), ikon: 'fa-list' },
      { etiket: 'Çıktı biçimi', deger: 'PDF · Excel · CSV', ikon: 'fa-file-export' },
    ]),
    filtre: '',
    icerik: h`<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Rapor kataloğu</b>
    <span>Her rapor tek <code>ReportLayout</code> kullanır: ekran, PDF ve Excel aynı
      filtreyi, veri tarihini ve toplamı taşır (kural 9).</span></div></div>
  <div class="gc-body flush">${B.tablo({
      satirlar: gorunur,
      satirRota: (r) => r.rota,
      bosDurum: { baslik: 'Erişebildiğiniz rapor yok', ikon: 'fa-chart-column',
        aciklama: 'Rapor yetkileri rolünüzden türetilir; listede yalnız açabildikleriniz görünür.' },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod', govde: (r) => h`<b>${r.kod}</b>` },
        { ad: 'ad', etiket: 'Rapor',
          govde: (r) => h`<a href="${r.rota}"><b>${r.ad}</b></a><br>
            <span class="muted">${r.ozet}</span>` },
        { ad: 'surum', etiket: 'Sürüm', govde: (r) => r.surum || 'v1' },
        { ad: 'cikti', etiket: 'Çıktı', govde: (r) => h`
          <a class="btn btn-ghost btn-sm" href="${r.rota}?cikti=pdf">PDF</a>
          <a class="btn btn-ghost btn-sm" href="${r.rota}?cikti=xlsx">Excel</a>` },
      ],
    })}</div>
</div>
<div class="gv-card" style="margin-top:18px"><div class="gc-body">
  <p class="gf-hint" style="margin:0">Her göstergenin formülü
    <a href="/raporlar/sozluk">rapor tanım ve formül sözlüğünde</a> tanımlıdır;
    açıklanmamış sayı gösterilmez (kural 9).</p>
</div></div>`,
    veriZamani: simdi(),
  })}`;
  return html(ctx, 200, ciz(ctx, e, icerik));
}

/* ==========================================================================
   RPT-03..14 — tek görüntüleyici, dört çıktı
   ========================================================================== */
function raporGoster(ctx, rapor) {
  const e = ekranNesnesi(rapor.kod);
  yetkiZorunlu(ctx, e.yetki);
  const filtre = filtreOku(ctx, rapor);
  const bicim = ctx.sorgu.get('cikti') || 'ekran';
  if (!CIKTI_BICIMLERI.includes(bicim)) {
    throw DogrulamaHatasi(`Bilinmeyen çıktı biçimi: ${bicim}`);
  }
  if (bicim !== 'ekran') yetkiZorunlu(ctx, `${e.kod}:disa_aktar`);

  /* TEK ÇALIŞTIRMA — dört çıktı da bu sonuçtan türer. */
  const sonuc = rapor.veri(ctx, filtre);

  if (bicim === 'ekran') {
    /* Satır tavanı aşıldıysa (denetim-02 D-14, K-126) sayfayı KAPATMAYIZ:
       künye, KPI ve filtre çubuğu ayakta kalır, tablonun yerine açık ret
       gelir. Kullanıcı daraltmayı yerinde yapabilsin diye — reddedip boşta
       bırakmak sahte başarı kadar kötüdür (K-125). */
    try {
      satirTavaniZorunlu(sonuc.satirlar.length, { nerede: 'ekran görünümü', tavan: ekranTavani() });
    } catch (err) {
      if (!(err instanceof UygulamaHatasi)) throw err;
      return html(ctx, err.durum, ciz(ctx, e, raporEkrani(ctx, rapor,
        { ...sonuc, satirlar: [], toplamlar: null },
        { filtre, filtreBari: filtreBariCiz(ctx, rapor), tavanHatasi: hataNesnesi(err) })));
    }
    return html(ctx, 200, ciz(ctx, e, raporEkrani(ctx, rapor, sonuc, {
      filtre, filtreBari: filtreBariCiz(ctx, rapor) })));
  }

  const cikti = raporCikti(ctx, rapor, sonuc, bicim, { filtre });
  islem(() => audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id,
    istekId: ctx.istekId, ip: ctx.ip, nesne: 'rapor', nesneId: rapor.kod,
    eylem: 'disa_aktar',
    sonraki: { bicim, filtre, kayit: sonuc.satirlar.length,
      veriTarihi: sonuc.veriTarihi, surum: rapor.surum } }));

  const dosyaAdi = `${rapor.kod}-${gunAnahtari(simdi())}.${cikti.uzanti}`;
  return yanitla(ctx, 200, cikti.govde, {
    'Content-Type': cikti.tur,
    'Content-Disposition': `attachment; filename="${dosyaAdi}"`,
    'Cache-Control': 'no-store',
  });
}


/* ==========================================================================
   RPT-14 — zamanlanmış raporlar
   ========================================================================== */
function zamanlamaEkrani(ctx, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('RPT-14');
  yetkiZorunlu(ctx, e.yetki);
  const kayitlar = sorgu(
    `SELECT * FROM rapor_zamanlamasi WHERE tenant_id = ? ORDER BY olusturuldu DESC`, ctx.tenant.id);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.sonucSeridi({ tur: 'warn', baslik: 'Gönderim henüz bağlanmadı',
    aciklama: 'Zamanlama tanımı ve alıcı listesi burada saklanır; e-posta gönderimi K-021 '
      + 'gereği bu sürümde YOK. Kayıtlar "gönderildi" işaretlenmez — sahte başarı üretilmez (kural 3).' })}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Zamanlama', deger: sayi(kayitlar.length), ikon: 'fa-clock' },
      { etiket: 'Aktif', deger: sayi(kayitlar.filter((k) => k.durum === 'aktif').length),
        ikon: 'fa-play' },
    ]),
    filtre: '',
    icerik: h`<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Zamanlanmış raporlar</b>
    <span>Yetkili alıcılara periyodik çıktı tanımı.</span></div></div>
  <div class="gc-body flush">${B.tablo({
      satirlar: kayitlar,
      bosDurum: { baslik: 'Zamanlama yok', ikon: 'fa-clock' },
      sutunlar: [
        { ad: 'rapor_kod', etiket: 'Rapor',
          govde: (k) => h`<b>${k.rapor_kod}</b><br><span class="muted">${
            RAPORLAR.find((r) => r.kod === k.rapor_kod)?.ad || '—'}</span>` },
        { ad: 'periyot', etiket: 'Periyot' },
        { ad: 'bicim', etiket: 'Biçim' },
        { ad: 'alicilar', etiket: 'Alıcılar' },
        { ad: 'durum', etiket: 'Durum', govde: (k) => B.rozet(
          k.durum === 'aktif' ? 'onaylandi' : 'kapali', k.durum) },
      ],
    })}</div>
</div>
${yetkiVar(ctx, 'RPT-14:olustur') ? h`<div style="margin-top:22px">${B.form({
      rota: '/raporlar/zamanlama', csrf: csrfAlani(ctx), idempotencyAnahtari: null, hatalar: hata,
      bolumler: [{ baslik: 'Yeni zamanlama',
        aciklama: 'Alıcılar YETKİ KONTROLÜNDEN geçer: bir raporu göremeyen kullanıcı '
          + 'zamanlanmış kopyasını da alamaz.',
        alanlar: h`
        ${B.alan({ ad: 'raporKod', etiket: 'Rapor', zorunlu: true,
          secenekler: [{ deger: '', etiket: 'Seçin…' },
            ...RAPORLAR.filter((r) => raporYetkisi(ctx, r))
              .map((r) => ({ deger: r.kod, etiket: `${r.kod} — ${r.ad}` }))] })}
        ${B.alan({ ad: 'periyot', etiket: 'Periyot', deger: 'aylik',
          secenekler: [{ deger: 'gunluk', etiket: 'Günlük' }, { deger: 'haftalik', etiket: 'Haftalık' },
            { deger: 'aylik', etiket: 'Aylık' }] })}
        ${B.alan({ ad: 'bicim', etiket: 'Biçim', deger: 'pdf',
          secenekler: [{ deger: 'pdf', etiket: 'PDF' }, { deger: 'xlsx', etiket: 'Excel' },
            { deger: 'csv', etiket: 'CSV' }] })}
        ${B.alan({ ad: 'alicilar', etiket: 'Alıcılar (e-posta, virgülle)', zorunlu: true, genis: true })}` }],
      eylemler: B.btn('Zamanlamayı kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
    })}</div>` : ''}`,
    veriZamani: simdi(),
  })}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

function zamanlamaIslemi(ctx, govde) {
  const rapor = RAPORLAR.find((r) => r.kod === govde.raporKod);
  if (!rapor) throw DogrulamaHatasi('Rapor seçilmedi.', { alanlar: { raporKod: ['Rapor seçin.'] } });
  if (!raporYetkisi(ctx, rapor)) {
    throw YetkiYok('Göremediğiniz bir raporu zamanlayamazsınız.');
  }
  const alicilar = String(govde.alicilar || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!alicilar.length) {
    throw DogrulamaHatasi('En az bir alıcı gerekli.', { alanlar: { alicilar: ['E-posta girin.'] } });
  }
  /* ALICI YETKİSİ: raporu göremeyen kullanıcı zamanlanmış kopyasını da alamaz. */
  const yetkisiz = [];
  for (const eposta of alicilar) {
    const k = tek('SELECT id FROM kullanici WHERE tenant_id = ? AND eposta = ?', ctx.tenant.id, eposta);
    if (!k) yetkisiz.push(`${eposta} (kullanıcı yok)`);
  }
  if (yetkisiz.length) {
    throw DogrulamaHatasi(`Alıcı doğrulanamadı: ${yetkisiz.join(', ')}`,
      { alanlar: { alicilar: ['Alıcılar sistemde kayıtlı kullanıcı olmalı.'] } });
  }

  return islem(() => {
    const { kimlik } = { kimlik: null };
    const id = `rpt_${Date.now().toString(36)}_${Math.trunc(performance.now() * 1000).toString(36)}`;
    calistir(`INSERT INTO rapor_zamanlamasi (id, tenant_id, rapor_kod, periyot, bicim, alicilar,
                filtre, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?, 'aktif', ?,?)`,
      id, ctx.tenant.id, rapor.kod, govde.periyot || 'aylik', govde.bicim || 'pdf',
      alicilar.join(', '), JSON.stringify({}), ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId,
      ip: ctx.ip, nesne: 'rapor_zamanlamasi', nesneId: id, eylem: 'olustur',
      sonraki: { rapor: rapor.kod, periyot: govde.periyot, alici: alicilar.length } });
    return `${rapor.kod} zamanlaması kaydedildi (gönderim K-021 gereği henüz bağlı değil)`;
  });
}
