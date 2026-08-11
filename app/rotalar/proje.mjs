/* ============================================================================
   PROJE VE ŞANTİYE ROTALARI — PRJ-01..04, SITE-01..04
   ----------------------------------------------------------------------------
   PRJ-02 dokümanın en somut bulgusudur: eski uygulamada "Yeni Proje" düğmesi
   rotasızdı (href="#"). Burada gerçek form, gerçek kayıt ve detaya yönlendirme
   vardır (PRJ-01 kabul testi).
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, gunAnahtari, gunBaslangici } from '../cekirdek/zaman.mjs';
import { Para, BIRIMLER } from '../cekirdek/para.mjs';
import { UygulamaHatasi, DogrulamaHatasi } from '../cekirdek/hata.mjs';
import { idempotent } from '../cekirdek/idempotency.mjs';
import { projeIlerlemesi } from '../moduller/plan/ilerleme.mjs';
import { yuzdeMetni } from '../moduller/plan/ilerleme.mjs';
import {
  ekranNesnesi, hataNesnesi, kullaniciAdi, ciz, listeSorgusu, filtreKosullari,
  kayitOlustur, kaydiAl, gecisFormu, gecisIsle, ozetSeridi,
  B, h, ham, sayi, csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar,
  sorgu, tek, islem, surumluGuncelle, audit,
} from './ortak.mjs';

const PROJE_TURLERI = [
  { deger: 'konut', etiket: 'Konut' }, { deger: 'ticari', etiket: 'Ticari' },
  { deger: 'altyapi', etiket: 'Altyapı' }, { deger: 'endustriyel', etiket: 'Endüstriyel' },
  { deger: 'restorasyon', etiket: 'Restorasyon' }, { deger: 'diger', etiket: 'Diğer' },
];
const DURUM_SECENEKLERI = ['taslak', 'hazirlik', 'aktif', 'askida', 'kapanista', 'kapali', 'arsiv']
  .map((d) => ({ deger: d, etiket: d }));

const kullanicilar = (ctx) => sorgu(
  `SELECT id, ad_soyad FROM kullanici WHERE tenant_id = ? AND durum = 'aktif' ORDER BY ad_soyad`, ctx.tenant.id)
  .map((k) => ({ deger: k.id, etiket: k.ad_soyad }));

export function kur(y, ekranRota) {
  /* ====================== PRJ-01 Proje listesi ========================== */
  ekranRota(y, 'PRJ-01', {
    get: (ctx) => {
      const e = ekranNesnesi('PRJ-01');
      yetkiZorunlu(ctx, e.yetki);
      const { kosullar, parametreler } = filtreKosullari(ctx, {
        aramaAlanlari: ['ad', 'kod', 'isveren'],
        filtreler: [{ ad: 'durum' }, { ad: 'tur' }],
      });
      const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
        { tablo: 'proje', kosullar, parametreler, sirala: 'olusturuldu DESC' });

      const zenginSatirlar = satirlar.map((p) => ({ ...p, ilerleme: projeIlerlemesi(p.id) }));
      const aktif = Number(tek(`SELECT COUNT(*) AS n FROM proje WHERE tenant_id = ? AND durum = 'aktif'`, ctx.tenant.id)?.n ?? 0);
      const gecikmis = zenginSatirlar.filter((p) => p.planlanan_bitis && p.planlanan_bitis < simdi()
        && !['kapali', 'arsiv'].includes(p.durum)).length;

      const icerik = h`
${ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: 'Proje oluşturuldu',
        aciklama: 'Kayıt taslak durumunda açıldı; durumu iş akışı motoru ilerletir.',
        kayitRota: `/projeler/${ctx.sorgu.get('olusan')}` }) : ''}
${B.listeDuzeni({
        kpi: B.kpiSeridi([
          { etiket: 'Toplam proje', deger: sayi(Number(tek('SELECT COUNT(*) AS n FROM proje WHERE tenant_id = ?', ctx.tenant.id)?.n ?? 0)), ikon: 'fa-diagram-project' },
          { etiket: 'Aktif', deger: sayi(aktif), ikon: 'fa-play' },
          { etiket: 'Takvimi aşan', deger: sayi(gecikmis), ikon: 'fa-hourglass-end', ton: gecikmis ? 'danger' : '' },
          { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
        ]),
        filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Proje adı, kodu veya işveren…',
          filtreler: [{ ad: 'durum', etiket: 'Durum', secenekler: DURUM_SECENEKLERI },
                      { ad: 'tur', etiket: 'Tür', secenekler: PROJE_TURLERI }] }),
        icerik: B.tablo({
          satirlar: zenginSatirlar,
          satirRota: (r) => `/projeler/${r.id}`,
          bosDurum: { baslik: 'Proje yok', aciklama: 'Portföydeki ilk projeyi oluşturarak başlayın.',
            ikon: 'fa-diagram-project',
            eylem: yetkiVar(ctx, 'PRJ-02:olustur') ? B.btn('Yeni proje', { tur: 'acc', rota: '/projeler/yeni', ikon: 'fa-plus' }) : null },
          sutunlar: [
            { ad: 'kod', etiket: 'Kod' },
            { ad: 'ad', etiket: 'Proje', govde: (r) => h`<a href="/projeler/${r.id}"><b>${r.ad}</b></a>${
              r.isveren ? h`<br><span class="muted">${r.isveren}</span>` : ''}` },
            { ad: 'ilerleme', etiket: 'İlerleme', hizala: 'sag', govde: (r) => r.ilerleme.bazCizgiVar
              ? h`<b>${yuzdeMetni(r.ilerleme.onayli)}</b><br><span class="muted">onaylı</span>`
              : h`<span class="muted">baz çizgi yok</span>` },
            { ad: 'planlanan_bitis', etiket: 'Planlanan bitiş', govde: (r) => !r.planlanan_bitis ? '—'
              : r.planlanan_bitis < simdi() && !['kapali', 'arsiv'].includes(r.durum)
                ? B.isaret(tarih(r.planlanan_bitis), 'danger') : tarih(r.planlanan_bitis) },
            { ad: 'sorumlu_id', etiket: 'Sorumlu', govde: (r) => kullaniciAdi(r.sorumlu_id) },
            { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
          ],
        }),
        sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
        veriZamani: simdi(),
      })}`;
      return html(ctx, 200, ciz(ctx, e, icerik, {
        eylemler: yetkiVar(ctx, 'PRJ-02:olustur')
          ? B.btn('Yeni proje', { tur: 'acc', rota: '/projeler/yeni', ikon: 'fa-plus' }) : null,
      }));
    },
  });

  /* ====================== PRJ-02 Yeni proje ============================= */
  ekranRota(y, 'PRJ-02', {
    get: (ctx) => {
      const e = ekranNesnesi('PRJ-02');
      yetkiZorunlu(ctx, e.yetki);
      return html(ctx, 200, ciz(ctx, e, projeFormu(ctx, {})));
    },
    post: (ctx, govde) => {
      const e = ekranNesnesi('PRJ-02');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const alanlar = projeGirdisiDogrula(ctx, govde);
        const sonuc = idempotent(
          { anahtar: govde._idempotency, tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, govde },
          () => kayitOlustur(ctx, {
            tablo: 'proje', nesne: 'proje', kodNesnesi: 'proje',
            alanlar: { id: kimlik('proje'), durum: 'taslak', ...alanlar },
          }));
        /* Kayıt sonrası DETAY sayfasına yönlendirilir (§3.2). */
        return yonlendir(ctx, `/projeler/${sonuc.id}?olusan=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, ciz(ctx, e, projeFormu(ctx, { deger: govde, hata: hataNesnesi(err) })));
      }
    },
  });

  /* ====================== PRJ-03 Proje detayı =========================== */
  ekranRota(y, 'PRJ-03', {
    get: (ctx, _g, params) => projeDetayi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('PRJ-03');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      const kayit = kaydiAl(ctx, 'proje', 'proje', params.id);
      try {
        if (govde._eylem === 'gecis') {
          gecisIsle(ctx, { nesne: 'proje', tablo: 'proje', kayit, govde, ekranKodu: 'PRJ-03' });
          return yonlendir(ctx, `/projeler/${params.id}?gecis=1`);
        }
        if (govde._eylem === 'risk') {
          csrfZorunlu(ctx, govde);
          if (!String(govde.baslik || '').trim()) {
            throw DogrulamaHatasi('Risk başlığı zorunludur.', { alanlar: { baslik: ['Başlık girin.'] } });
          }
          kayitOlustur(ctx, { tablo: 'proje_riski', nesne: 'proje_riski',
            alanlar: { id: kimlik('proje').replace('prj', 'rsk'), proje_id: kayit.id,
              baslik: govde.baslik.trim(), aciklama: govde.aciklama || null,
              olasilik: Math.min(5, Math.max(1, Number(govde.olasilik) || 3)),
              etki: Math.min(5, Math.max(1, Number(govde.etki) || 3)),
              sahip_id: govde.sahipId || null, aksiyon: govde.aksiyon || null } });
          return yonlendir(ctx, `/projeler/${params.id}?sekme=riskler&risk=1`);
        }
        throw DogrulamaHatasi('Tanımsız işlem.');
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return projeDetayi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ====================== PRJ-04 Proje düzenle ========================== */
  ekranRota(y, 'PRJ-04', {
    get: (ctx, _g, params) => {
      const e = ekranNesnesi('PRJ-04');
      yetkiZorunlu(ctx, e.yetki);
      const kayit = kaydiAl(ctx, 'proje', 'proje', params.id);
      return html(ctx, 200, ciz(ctx, e, projeFormu(ctx, { kayit, deger: kayit }), { kayitEtiketi: kayit.kod }));
    },
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('PRJ-04');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      csrfZorunlu(ctx, govde);
      const kayit = kaydiAl(ctx, 'proje', 'proje', params.id);
      try {
        const alanlar = projeGirdisiDogrula(ctx, govde, kayit);
        islem(() => {
          surumluGuncelle('proje', kayit.id, Number(govde.surum), alanlar,
            { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
          audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
            nesne: 'proje', nesneId: kayit.id, eylem: 'guncelle',
            onceki: alanDegerleri(kayit, alanlar), sonraki: alanlar });
        });
        return yonlendir(ctx, `/projeler/${kayit.id}?guncellendi=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, ciz(ctx, e,
          projeFormu(ctx, { kayit, deger: govde, hata: hataNesnesi(err) })));
      }
    },
  });

  /* ====================== SITE-01 Şantiye listesi ======================= */
  ekranRota(y, 'SITE-01', {
    get: (ctx) => {
      const e = ekranNesnesi('SITE-01');
      yetkiZorunlu(ctx, e.yetki);
      const { kosullar, parametreler } = filtreKosullari(ctx, {
        aramaAlanlari: ['ad', 'kod', 'il'], filtreler: [{ ad: 'durum' }, { ad: 'proje', sutun: 'proje_id' }],
      });
      const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
        { tablo: 'santiye', kosullar, parametreler, sirala: 'ad' });
      const projeler = sorgu('SELECT id, ad FROM proje WHERE tenant_id = ? ORDER BY ad', ctx.tenant.id)
        .map((p) => ({ deger: p.id, etiket: p.ad }));

      const icerik = B.listeDuzeni({
        kpi: B.kpiSeridi([
          { etiket: 'Şantiye', deger: sayi(Number(tek('SELECT COUNT(*) AS n FROM santiye WHERE tenant_id = ?', ctx.tenant.id)?.n ?? 0)), ikon: 'fa-helmet-safety' },
          { etiket: 'Aktif', deger: sayi(Number(tek(`SELECT COUNT(*) AS n FROM santiye WHERE tenant_id = ? AND durum = 'aktif'`, ctx.tenant.id)?.n ?? 0)), ikon: 'fa-play' },
          { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
        ]),
        filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Şantiye adı, kodu veya il…',
          filtreler: [{ ad: 'durum', etiket: 'Durum', secenekler: DURUM_SECENEKLERI },
                      { ad: 'proje', etiket: 'Proje', secenekler: projeler }] }),
        icerik: B.tablo({
          satirlar,
          satirRota: (r) => `/santiyeler/${r.id}`,
          bosDurum: { baslik: 'Şantiye yok', aciklama: 'Şantiye bir projeye bağlı açılır.', ikon: 'fa-helmet-safety',
            eylem: yetkiVar(ctx, 'SITE-02:olustur') ? B.btn('Yeni şantiye', { tur: 'acc', rota: '/santiyeler/yeni', ikon: 'fa-plus' }) : null },
          sutunlar: [
            { ad: 'kod', etiket: 'Kod' },
            { ad: 'ad', etiket: 'Şantiye', govde: (r) => h`<a href="/santiyeler/${r.id}"><b>${r.ad}</b></a>` },
            { ad: 'proje_id', etiket: 'Proje', govde: (r) => tek('SELECT ad FROM proje WHERE id = ?', r.proje_id)?.ad || '—' },
            { ad: 'il', etiket: 'Konum', govde: (r) => [r.ilce, r.il].filter(Boolean).join(' / ') || '—' },
            /* Yaşam durumu ile TAKVİM SAĞLIĞI ayrı sütunlarda (doküman SITE-01 amacı). */
            { ad: 'takvim', etiket: 'Takvim', govde: (r) => !r.planlanan_bitis ? '—'
              : r.planlanan_bitis < simdi() && !['kapali', 'arsiv'].includes(r.durum)
                ? B.isaret('gecikmiş', 'danger') : B.isaret('takvimde', 'ok') },
            { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
          ],
        }),
        sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
        veriZamani: simdi(),
      });
      return html(ctx, 200, ciz(ctx, e, icerik, {
        eylemler: yetkiVar(ctx, 'SITE-02:olustur')
          ? B.btn('Yeni şantiye', { tur: 'acc', rota: '/santiyeler/yeni', ikon: 'fa-plus' }) : null,
      }));
    },
  });

  /* ====================== SITE-02 Yeni şantiye ========================== */
  ekranRota(y, 'SITE-02', {
    get: (ctx) => {
      const e = ekranNesnesi('SITE-02');
      yetkiZorunlu(ctx, e.yetki);
      return html(ctx, 200, ciz(ctx, e, santiyeFormu(ctx, {})));
    },
    post: (ctx, govde) => {
      const e = ekranNesnesi('SITE-02');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const alanlar = santiyeGirdisiDogrula(ctx, govde);
        const sonuc = idempotent(
          { anahtar: govde._idempotency, tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, govde },
          () => kayitOlustur(ctx, { tablo: 'santiye', nesne: 'santiye', kodNesnesi: 'santiye',
            alanlar: { id: kimlik('santiye'), durum: 'taslak', ...alanlar } }));
        return yonlendir(ctx, `/santiyeler/${sonuc.id}?olusan=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, ciz(ctx, e, santiyeFormu(ctx, { deger: govde, hata: hataNesnesi(err) })));
      }
    },
  });

  /* ====================== SITE-04 Şantiye düzenle ======================= */
  ekranRota(y, 'SITE-04', {
    get: (ctx, _g, params) => {
      const e = ekranNesnesi('SITE-04');
      yetkiZorunlu(ctx, e.yetki);
      const kayit = kaydiAl(ctx, 'santiye', 'santiye', params.id);
      return html(ctx, 200, ciz(ctx, e, santiyeFormu(ctx, { kayit }), { kayitEtiketi: kayit.kod, baslik: kayit.ad }));
    },
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('SITE-04');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      csrfZorunlu(ctx, govde);
      const kayit = kaydiAl(ctx, 'santiye', 'santiye', params.id);
      try {
        if (['kapali', 'arsiv'].includes(kayit.durum)) {
          throw DogrulamaHatasi('Kapalı veya arşivlenmiş şantiyenin temel verisi değiştirilemez.');
        }
        const alanlar = santiyeGirdisiDogrula(ctx, govde);
        islem(() => {
          surumluGuncelle('santiye', kayit.id, Number(govde.surum), alanlar,
            { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
          audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
            nesne: 'santiye', nesneId: kayit.id, eylem: 'guncelle',
            onceki: Object.fromEntries(Object.keys(alanlar).map((k) => [k, kayit[k]])), sonraki: alanlar });
        });
        return yonlendir(ctx, `/santiyeler/${kayit.id}?guncellendi=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, ciz(ctx, e,
          santiyeFormu(ctx, { kayit, deger: govde, hata: hataNesnesi(err) }),
          { kayitEtiketi: kayit.kod, baslik: kayit.ad }));
      }
    },
  });

  /* ====================== SITE-03 Şantiye detayı ======================== */
  ekranRota(y, 'SITE-03', {
    get: (ctx, _g, params) => santiyeDetayi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('SITE-03');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      const kayit = kaydiAl(ctx, 'santiye', 'santiye', params.id);
      try {
        gecisIsle(ctx, { nesne: 'santiye', tablo: 'santiye', kayit, govde, ekranKodu: 'SITE-03' });
        return yonlendir(ctx, `/santiyeler/${params.id}?gecis=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return santiyeDetayi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });
}

/* ========================================================================== */
/* Doğrulama                                                                  */
/* ========================================================================== */
function projeGirdisiDogrula(ctx, govde, mevcut = null) {
  const alanlar = {};
  const hatalar = {};
  const ad = String(govde.ad || '').trim();
  if (!ad) hatalar.ad = ['Proje adı girin.'];
  else if (ad.length > 200) hatalar.ad = ['En fazla 200 karakter.'];
  alanlar.ad = ad;

  alanlar.isveren = String(govde.isveren || '').trim() || null;
  alanlar.tur = govde.tur || null;
  alanlar.il = String(govde.il || '').trim() || null;
  alanlar.ilce = String(govde.ilce || '').trim() || null;
  alanlar.adres = String(govde.adres || '').trim() || null;
  alanlar.aciklama = String(govde.aciklama || '').trim() || null;
  alanlar.sorumlu_id = govde.sorumluId || null;

  alanlar.baslangic = govde.baslangic ? gunBaslangici(govde.baslangic) : null;
  alanlar.planlanan_bitis = govde.planlananBitis ? gunBaslangici(govde.planlananBitis) : null;
  if (alanlar.baslangic && alanlar.planlanan_bitis && alanlar.planlanan_bitis <= alanlar.baslangic) {
    hatalar.planlananBitis = ['Bitiş tarihi başlangıçtan sonra olmalı.'];
  }

  if (govde.sozlesmeBedeli) {
    try {
      const p = Para.ayristir(govde.sozlesmeBedeli, govde.paraBirimi || ctx.tenant.para_birimi);
      if (p.negatifMi) hatalar.sozlesmeBedeli = ['Bedel negatif olamaz.'];
      alanlar.sozlesme_bedeli_minor = String(p.minor);
      alanlar.sozlesme_bedeli_birim = p.birim;
    } catch (e) { hatalar.sozlesmeBedeli = [e.mesaj || 'Geçersiz tutar.']; }
  } else if (!mevcut) {
    alanlar.sozlesme_bedeli_minor = null;
  }

  if (Object.keys(hatalar).length) {
    throw DogrulamaHatasi('Proje bilgilerinde eksik veya hatalı alanlar var.', { alanlar: hatalar });
  }
  return alanlar;
}

function santiyeGirdisiDogrula(ctx, govde) {
  const hatalar = {};
  const ad = String(govde.ad || '').trim();
  if (!ad) hatalar.ad = ['Şantiye adı girin.'];
  const projeId = govde.projeId;
  if (!projeId) hatalar.projeId = ['Bağlı olduğu projeyi seçin.'];
  else if (!tek('SELECT id FROM proje WHERE id = ? AND tenant_id = ?', projeId, ctx.tenant.id)) {
    hatalar.projeId = ['Proje bulunamadı.'];
  }
  const baslangic = govde.baslangic ? gunBaslangici(govde.baslangic) : null;
  const bitis = govde.planlananBitis ? gunBaslangici(govde.planlananBitis) : null;
  if (baslangic && bitis && bitis <= baslangic) hatalar.planlananBitis = ['Bitiş başlangıçtan sonra olmalı.'];
  if (Object.keys(hatalar).length) {
    throw DogrulamaHatasi('Şantiye bilgilerinde eksik alanlar var.', { alanlar: hatalar });
  }
  return {
    ad, proje_id: projeId,
    il: String(govde.il || '').trim() || null,
    ilce: String(govde.ilce || '').trim() || null,
    adres: String(govde.adres || '').trim() || null,
    sef_id: govde.sefId || null,
    maliyet_merkezi: String(govde.maliyetMerkezi || '').trim() || null,
    baslangic, planlanan_bitis: bitis,
  };
}

const alanDegerleri = (kayit, alanlar) =>
  Object.fromEntries(Object.keys(alanlar).map((k) => [k, kayit[k]]));

/* ========================================================================== */
/* Formlar                                                                    */
/* ========================================================================== */
function projeFormu(ctx, { kayit = null, deger = {}, hata = null }) {
  const duzenleme = !!kayit;
  const d = (alan, sutun) => deger[alan] ?? (kayit ? kayit[sutun] : '') ?? '';
  return B.form({
    rota: duzenleme ? `/projeler/${kayit.id}/duzenle` : '/projeler/yeni',
    csrf: csrfAlani(ctx),
    idempotencyAnahtari: duzenleme ? null : kimlik('idempotency'),
    hatalar: hata,
    bolumler: [
      {
        baslik: 'Proje kimliği', aciklama: 'Kod otomatik üretilir; kayıt taslak durumunda açılır.',
        alanlar: h`
          ${B.alan({ ad: 'ad', etiket: 'Proje adı', deger: d('ad', 'ad'), zorunlu: true, hata: hata?.alanlar?.ad, genis: true })}
          ${B.alan({ ad: 'isveren', etiket: 'İşveren', deger: d('isveren', 'isveren') })}
          ${B.alan({ ad: 'tur', etiket: 'Proje türü', deger: d('tur', 'tur'),
            secenekler: [{ deger: '', etiket: 'Seçin…' }, ...PROJE_TURLERI] })}
          ${B.alan({ ad: 'sorumluId', etiket: 'Proje sorumlusu', deger: deger.sorumluId ?? kayit?.sorumlu_id ?? '',
            secenekler: [{ deger: '', etiket: 'Seçin…' }, ...kullanicilar(ctx)] })}`,
      },
      {
        baslik: 'Konum ve takvim',
        alanlar: h`
          ${B.alan({ ad: 'il', etiket: 'İl', deger: d('il', 'il') })}
          ${B.alan({ ad: 'ilce', etiket: 'İlçe', deger: d('ilce', 'ilce') })}
          ${B.alan({ ad: 'adres', etiket: 'Adres', deger: d('adres', 'adres'), genis: true })}
          ${B.alan({ ad: 'baslangic', etiket: 'Başlangıç', tur: 'date',
            deger: deger.baslangic ?? (kayit?.baslangic ? gunAnahtari(kayit.baslangic) : '') })}
          ${B.alan({ ad: 'planlananBitis', etiket: 'Planlanan bitiş', tur: 'date',
            deger: deger.planlananBitis ?? (kayit?.planlanan_bitis ? gunAnahtari(kayit.planlanan_bitis) : ''),
            hata: hata?.alanlar?.planlananBitis })}`,
      },
      {
        baslik: 'Bedel',
        aciklama: 'Tutarlar tamsayı kuruş olarak saklanır; para birimi tutarla birlikte taşınır.',
        alanlar: h`
          ${B.alan({ ad: 'sozlesmeBedeli', etiket: 'Sözleşme bedeli',
            deger: deger.sozlesmeBedeli ?? (kayit?.sozlesme_bedeli_minor
              ? Para.minor(kayit.sozlesme_bedeli_minor, kayit.sozlesme_bedeli_birim).bicim({ simge: false }) : ''),
            hata: hata?.alanlar?.sozlesmeBedeli, ipucu: 'Örn. 12.500.000,00' })}
          ${B.alan({ ad: 'paraBirimi', etiket: 'Para birimi',
            deger: deger.paraBirimi ?? kayit?.sozlesme_bedeli_birim ?? ctx.tenant.para_birimi,
            secenekler: Object.keys(BIRIMLER).map((k) => ({ deger: k, etiket: k })) })}
          ${B.alan({ ad: 'aciklama', etiket: 'Açıklama', tur: 'metin', deger: d('aciklama', 'aciklama'), genis: true })}
          ${duzenleme ? ham(`<input type="hidden" name="surum" value="${kayit.surum}">`) : ''}`,
      },
    ],
    ozet: h`<div class="gv-card"><div class="gc-body">
      <div class="gv-cap-sm">${duzenleme ? 'Kayıt künyesi' : 'Kayıt açılışı'}</div>
      ${duzenleme ? h`<dl class="gd-grid" style="margin-top:12px;padding-top:0;border-top:0">
        <div><dt>Kod</dt><dd>${kayit.kod}</dd></div>
        <div><dt>Durum</dt><dd>${B.rozet(kayit.durum)}</dd></div>
        <div><dt>Sürüm</dt><dd>${kayit.surum}</dd></div>
      </dl>
      <p class="gf-hint" style="margin-top:12px">Kayıt sürümü formla gönderilir; siz düzenlerken
        başkası kaydettiyse gönderim 409 ile reddedilir.</p>`
        : h`<p style="margin-top:10px;font-size:12.5px;line-height:1.7;color:var(--muted)">
        Proje <b>taslak</b> olarak açılır. Aktifleştirme, iş akışı motorunun onayına bağlıdır;
        bu formda durum seçilmez.</p>`}
    </div></div>`,
    eylemler: h`${B.btn('Vazgeç', { rota: duzenleme ? `/projeler/${kayit.id}` : '/projeler' })}
      ${B.btn(duzenleme ? 'Değişiklikleri kaydet' : 'Kaydet ve detaya git',
        { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' })}`,
  });
}

function santiyeFormu(ctx, { deger = {}, hata = null, kayit = null }) {
  const projeler = sorgu(
    `SELECT id, ad, kod FROM proje WHERE tenant_id = ? AND durum NOT IN ('kapali','arsiv') ORDER BY ad`, ctx.tenant.id)
    .map((p) => ({ deger: p.id, etiket: `${p.kod} — ${p.ad}` }));
  /* SITE-04 düzenleme kipi: aynı kalıp, aynı doğrulama; yalnız hedef rota ve
     ön değerler değişir (kural 4 — ikinci bir form uygulaması yok). */
  const d = kayit ? {
    ad: kayit.ad, projeId: kayit.proje_id, sefId: kayit.sef_id, il: kayit.il, ilce: kayit.ilce,
    adres: kayit.adres, maliyetMerkezi: kayit.maliyet_merkezi,
    baslangic: kayit.baslangic ? gunAnahtari(kayit.baslangic) : '',
    planlananBitis: kayit.planlanan_bitis ? gunAnahtari(kayit.planlanan_bitis) : '',
    ...deger,
  } : deger;
  deger = d;
  return B.form({
    rota: kayit ? `/santiyeler/${kayit.id}/duzenle` : '/santiyeler/yeni',
    csrf: csrfAlani(ctx),
    idempotencyAnahtari: kayit ? null : kimlik('idempotency'), hatalar: hata,
    bolumler: [
      { baslik: 'Şantiye kimliği', aciklama: 'Şantiye her zaman bir projeye bağlıdır.',
        alanlar: h`
          ${B.alan({ ad: 'ad', etiket: 'Şantiye adı', deger: deger.ad || '', zorunlu: true, hata: hata?.alanlar?.ad, genis: true })}
          ${B.alan({ ad: 'projeId', etiket: 'Proje', deger: deger.projeId || '', zorunlu: true,
            hata: hata?.alanlar?.projeId, secenekler: [{ deger: '', etiket: 'Seçin…' }, ...projeler] })}
          ${B.alan({ ad: 'sefId', etiket: 'Şantiye şefi', deger: deger.sefId || '',
            secenekler: [{ deger: '', etiket: 'Seçin…' }, ...kullanicilar(ctx)] })}` },
      { baslik: 'Konum, takvim ve maliyet merkezi',
        alanlar: h`
          ${B.alan({ ad: 'il', etiket: 'İl', deger: deger.il || '' })}
          ${B.alan({ ad: 'ilce', etiket: 'İlçe', deger: deger.ilce || '' })}
          ${B.alan({ ad: 'adres', etiket: 'Adres', deger: deger.adres || '', genis: true })}
          ${B.alan({ ad: 'baslangic', etiket: 'Başlangıç', tur: 'date', deger: deger.baslangic || '' })}
          ${B.alan({ ad: 'planlananBitis', etiket: 'Planlanan bitiş', tur: 'date',
            deger: deger.planlananBitis || '', hata: hata?.alanlar?.planlananBitis })}
          ${B.alan({ ad: 'maliyetMerkezi', etiket: 'Maliyet merkezi', deger: deger.maliyetMerkezi || '',
            ipucu: 'Bütçe ve satın alma bu kodla eşleşir.' })}` },
    ],
    ozet: kayit ? h`<div class="gv-card"><div class="gc-body">
      <div class="gv-cap-sm">Kayıt künyesi</div>
      <dl class="gd-grid" style="margin-top:12px;padding-top:0;border-top:0">
        <div><dt>Kod</dt><dd>${kayit.kod}</dd></div>
        <div><dt>Durum</dt><dd>${B.rozet(kayit.durum)}</dd></div>
        <div><dt>Sürüm</dt><dd>${kayit.surum}</dd></div>
      </dl>
      <p class="gf-hint" style="margin-top:12px">Bu form <b>temel veriyi</b> günceller; yaşam durumu
        buradan değişmez. Siz düzenlerken başkası kaydettiyse gönderim 409 ile reddedilir.</p>
      ${ham(`<input type="hidden" name="surum" value="${kayit.surum}">`)}
    </div></div>` : null,
    eylemler: h`${B.btn('Vazgeç', { rota: kayit ? `/santiyeler/${kayit.id}` : '/santiyeler' })}
      ${B.btn(kayit ? 'Değişiklikleri kaydet' : 'Kaydet ve detaya git',
        { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' })}`,
  });
}

/* ========================================================================== */
/* Detay sayfaları                                                            */
/* ========================================================================== */
function projeDetayi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('PRJ-03');
  yetkiZorunlu(ctx, e.yetki);
  const p = kaydiAl(ctx, 'proje', 'proje', id);
  const sekme = ctx.sorgu.get('sekme') || 'ozet';
  const santiyeler = sorgu('SELECT * FROM santiye WHERE proje_id = ? ORDER BY ad', p.id);
  const riskler = sorgu('SELECT * FROM proje_riski WHERE proje_id = ? ORDER BY (olasilik * etki) DESC', p.id);
  const programlar = sorgu('SELECT * FROM is_programi WHERE proje_id = ? ORDER BY surum_no DESC', p.id);
  const ilerleme = projeIlerlemesi(p.id);

  const sekmeler = [
    { ad: 'ozet', etiket: 'Özet' },
    { ad: 'santiyeler', etiket: 'Şantiyeler', adet: santiyeler.length },
    { ad: 'program', etiket: 'İş programı', adet: programlar.length },
    { ad: 'riskler', etiket: 'Riskler', adet: riskler.filter((r) => r.durum !== 'kapali').length },
    { ad: 'gecmis', etiket: 'Geçmiş' },
  ];

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: 'Proje oluşturuldu',
    aciklama: 'Kayıt taslak durumunda açıldı. Şantiye ve iş programı bu sayfadan eklenir.' }) : ''}
${ctx.sorgu.get('guncellendi') ? B.sonucSeridi({ tur: 'ok', baslik: 'Proje güncellendi',
    aciklama: 'Alan bazlı değişiklik denetim izine yazıldı.' }) : ''}
${ctx.sorgu.get('gecis') ? B.sonucSeridi({ tur: 'ok', baslik: 'Durum güncellendi',
    aciklama: `Yeni durum: ${p.durum}. Geçiş gerekçesiyle birlikte denetim izinde.` }) : ''}
${ozetSeridi(ctx, {
    nesne: 'proje', kayit: p, baslik: p.ad,
    bilgiler: [
      { etiket: 'İşveren', deger: p.isveren || '—' },
      { etiket: 'Sorumlu', deger: kullaniciAdi(p.sorumlu_id) },
      { etiket: 'Takvim', deger: `${p.baslangic ? tarih(p.baslangic) : '—'} → ${p.planlanan_bitis ? tarih(p.planlanan_bitis) : '—'}` },
      { etiket: 'Sözleşme bedeli', deger: p.sozlesme_bedeli_minor
        ? Para.minor(p.sozlesme_bedeli_minor, p.sozlesme_bedeli_birim).bicim() : '—' },
      { etiket: 'Onaylı ilerleme', deger: ilerleme.bazCizgiVar ? yuzdeMetni(ilerleme.onayli) : 'baz çizgi yok' },
      { etiket: 'Tahmini ilerleme', deger: ilerleme.bazCizgiVar ? yuzdeMetni(ilerleme.tahmini) : '—' },
    ],
    birincilEylem: yetkiVar(ctx, 'PRJ-04:guncelle')
      ? B.btn('Düzenle', { tur: 'acc', rota: `/projeler/${p.id}/duzenle`, ikon: 'fa-pen' }) : null,
  })}
${B.sekmeler({ sekmeler, aktif: sekme, rota: `/projeler/${p.id}`, sorgu: '' })}
<div class="dash-cols">
  <div>
    ${sekme === 'ozet' ? projeOzetSekmesi(p, ilerleme) : ''}
    ${sekme === 'santiyeler' ? projeSantiyeSekmesi(ctx, p, santiyeler) : ''}
    ${sekme === 'program' ? projeProgramSekmesi(ctx, p, programlar) : ''}
    ${sekme === 'riskler' ? projeRiskSekmesi(ctx, p, riskler) : ''}
    ${sekme === 'gecmis' ? projeGecmisSekmesi(p) : ''}
  </div>
  <div class="gv-side-stack">
    ${gecisFormu(ctx, { nesne: 'proje', kayit: p, rota: `/projeler/${p.id}`, ekranKodu: 'PRJ-03' })}
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: p.kod, baslik: p.ad }));
}

const projeOzetSekmesi = (p, ilerleme) => h`
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>İlerleme</b>
    <span>Proje ilerlemesi elle yazılmaz: sum(WBS ağırlığı × onaylı aktivite ilerlemesi) (§5.5).</span></div></div>
  <div class="gc-body">
    ${ilerleme.bazCizgiVar ? h`
      <dl class="gd-grid" style="border-top:0;padding-top:0;margin-top:0">
        <div><dt>Onaylı ilerleme</dt><dd>${yuzdeMetni(ilerleme.onayli)}</dd></div>
        <div><dt>Tahmini ilerleme</dt><dd>${yuzdeMetni(ilerleme.tahmini)}</dd></div>
        <div><dt>Baz çizgili program</dt><dd>${sayi(ilerleme.programSayisi)}</dd></div>
      </dl>
      <div class="gbar-track" style="margin-top:18px"><div class="gbar-fill" style="width:${ham(String(ilerleme.onayli / 1000))}%"></div></div>`
      : h`<p style="color:var(--muted);font-size:13px">Onaylı baz çizgili iş programı yok; ilerleme hesaplanamaz.
        Program oluşturulup baz çizgisi onaylandığında bu alan otomatik dolar.</p>`}
    ${p.aciklama ? h`<p style="margin-top:18px;font-size:13.5px;line-height:1.7">${p.aciklama}</p>` : ''}
  </div>
</div>`;

const projeSantiyeSekmesi = (ctx, p, santiyeler) => h`
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Şantiyeler</b>
    <span>Bu projeye bağlı saha birimleri.</span></div>
    ${yetkiVar(ctx, 'SITE-02:olustur') ? B.btn('Yeni şantiye', { rota: '/santiyeler/yeni', kucuk: true, ikon: 'fa-plus' }) : ''}</div>
  <div class="gc-body flush">${B.tablo({
    satirlar: santiyeler,
    satirRota: (r) => `/santiyeler/${r.id}`,
    bosDurum: { baslik: 'Şantiye yok', ikon: 'fa-helmet-safety' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'ad', etiket: 'Şantiye', govde: (r) => h`<a href="/santiyeler/${r.id}"><b>${r.ad}</b></a>` },
      { ad: 'sef_id', etiket: 'Şef', govde: (r) => kullaniciAdi(r.sef_id) },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
    ],
  })}</div>
</div>`;

const projeProgramSekmesi = (ctx, p, programlar) => h`
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>İş programları</b>
    <span>Baz çizgisi onaylı program, ilerleme hesabının tek kaynağıdır.</span></div>
    ${yetkiVar(ctx, 'PLAN-02:olustur') ? B.btn('Yeni program', { rota: `/is-programlari/yeni?proje=${p.id}`, kucuk: true, ikon: 'fa-plus' }) : ''}</div>
  <div class="gc-body flush">${B.tablo({
    satirlar: programlar,
    satirRota: (r) => `/is-programlari/${r.id}`,
    bosDurum: { baslik: 'İş programı yok', aciklama: 'WBS ve aktiviteler programda tanımlanır.', ikon: 'fa-timeline' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod', govde: (r) => h`${r.kod}<br><span class="muted">sürüm ${r.surum_no}</span>` },
      { ad: 'ad', etiket: 'Program', govde: (r) => h`<a href="/is-programlari/${r.id}"><b>${r.ad}</b></a>` },
      { ad: 'baz_cizgi', etiket: 'Baz çizgi', govde: (r) => (r.baz_cizgi ? B.isaret('donduruldu', 'ok') : '—') },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
    ],
  })}</div>
</div>`;

const projeRiskSekmesi = (ctx, p, riskler) => h`
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Risk kaydı</b>
    <span>Olasılık × etki puanına göre sıralanır.</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: riskler,
    bosDurum: { baslik: 'Risk kaydı yok', ikon: 'fa-triangle-exclamation' },
    sutunlar: [
      { ad: 'baslik', etiket: 'Risk', govde: (r) => h`<b>${r.baslik}</b>${r.aciklama ? h`<br><span class="muted">${r.aciklama}</span>` : ''}` },
      { ad: 'puan', etiket: 'Puan', hizala: 'sag', govde: (r) => {
        const puan = r.olasilik * r.etki;
        return B.isaret(String(puan), puan >= 15 ? 'danger' : puan >= 8 ? 'warn' : 'nötr');
      } },
      { ad: 'sahip_id', etiket: 'Sahip', govde: (r) => kullaniciAdi(r.sahip_id) },
      { ad: 'aksiyon', etiket: 'Aksiyon', govde: (r) => r.aksiyon || '—' },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
    ],
  })}</div>
</div>
${yetkiVar(ctx, 'PRJ-03:guncelle') ? B.form({
    rota: `/projeler/${p.id}`, csrf: csrfAlani(ctx),
    bolumler: [{ baslik: 'Risk ekle', alanlar: h`
      ${ham('<input type="hidden" name="_eylem" value="risk">')}
      ${B.alan({ ad: 'baslik', etiket: 'Risk başlığı', zorunlu: true, genis: true })}
      ${B.alan({ ad: 'olasilik', etiket: 'Olasılık (1-5)', tur: 'number', deger: '3' })}
      ${B.alan({ ad: 'etki', etiket: 'Etki (1-5)', tur: 'number', deger: '3' })}
      ${B.alan({ ad: 'aksiyon', etiket: 'Aksiyon', genis: true })}` }],
    eylemler: B.btn('Riski kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;

function projeGecmisSekmesi(p) {
  const gecmis = audit.gecmis('proje', p.id).slice().reverse();
  return h`<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Sürüm ve değişiklik geçmişi</b>
    <span>Alan bazlı önce/sonra kaydı — değiştirilemez.</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: gecmis,
    bosDurum: { baslik: 'Kayıt yok' },
    sutunlar: [
      { ad: 'zaman', etiket: 'Zaman', govde: (r) => tarih(r.zaman) },
      { ad: 'eylem', etiket: 'Eylem' },
      { ad: 'kullanici_id', etiket: 'Kullanıcı', govde: (r) => kullaniciAdi(r.kullanici_id) },
      { ad: 'gerekce', etiket: 'Gerekçe', govde: (r) => r.gerekce || '—' },
      { ad: 'degisim', etiket: 'Değişim', govde: (r) => h`<code>${
        JSON.stringify(r.sonraki || {}).slice(0, 80)}</code>` },
    ],
  })}</div>
</div>`;
}

function santiyeDetayi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('SITE-03');
  yetkiZorunlu(ctx, e.yetki);
  const s = kaydiAl(ctx, 'santiye', 'santiye', id);
  const proje = tek('SELECT * FROM proje WHERE id = ?', s.proje_id);
  const sekme = ctx.sorgu.get('sekme') || 'ozet';
  const raporlar = sorgu('SELECT * FROM gunluk_rapor WHERE santiye_id = ? ORDER BY rapor_gunu DESC LIMIT 10', s.id);
  const bildirimler = sorgu(`SELECT * FROM saha_bildirimi WHERE santiye_id = ? AND durum NOT IN ('kapali','iptal')
                              ORDER BY olusturuldu DESC LIMIT 10`, s.id);
  const acikGorevler = Number(tek(`SELECT COUNT(*) AS n FROM gorev WHERE santiye_id = ?
                                    AND durum NOT IN ('tamamlandi','iptal')`, s.id)?.n ?? 0);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: 'Şantiye oluşturuldu' }) : ''}
${ctx.sorgu.get('gecis') ? B.sonucSeridi({ tur: 'ok', baslik: 'Durum güncellendi', aciklama: `Yeni durum: ${s.durum}` }) : ''}
${ctx.sorgu.get('guncellendi') ? B.sonucSeridi({ tur: 'ok', baslik: 'Şantiye güncellendi',
    aciklama: 'Alan bazlı değişiklik denetim izine yazıldı.' }) : ''}
${ozetSeridi(ctx, {
    nesne: 'santiye', kayit: s, baslik: s.ad,
    bilgiler: [
      { etiket: 'Proje', deger: h`<a href="/projeler/${s.proje_id}">${proje?.ad || '—'}</a>` },
      { etiket: 'Şantiye şefi', deger: kullaniciAdi(s.sef_id) },
      { etiket: 'Konum', deger: [s.ilce, s.il].filter(Boolean).join(' / ') || '—' },
      { etiket: 'Takvim', deger: `${s.baslangic ? tarih(s.baslangic) : '—'} → ${s.planlanan_bitis ? tarih(s.planlanan_bitis) : '—'}` },
      { etiket: 'Maliyet merkezi', deger: s.maliyet_merkezi || '—' },
      { etiket: 'Açık görev', deger: sayi(acikGorevler) },
    ],
    birincilEylem: B.btn('Günlük rapor', { tur: 'acc', rota: `/santiyeler/${s.id}/gunluk-raporlar`, ikon: 'fa-clipboard-list' }),
    digerEylemler: h`${yetkiVar(ctx, 'SITE-04:guncelle')
      ? B.btn('Düzenle', { rota: `/santiyeler/${s.id}/duzenle`, ikon: 'fa-pen' }) : ''}
      ${yetkiVar(ctx, 'SITE-05:goruntule') && ['taslak', 'hazirlik'].includes(s.durum)
        ? B.btn('Açılış kontrolü', { rota: `/santiyeler/${s.id}/acilis`, ikon: 'fa-clipboard-check' }) : ''}
      ${yetkiVar(ctx, 'SITE-16:goruntule') && ['aktif', 'kapanista'].includes(s.durum)
        ? B.btn('Kapatma sihirbazı', { rota: `/santiyeler/${s.id}/kapat`, ikon: 'fa-box-archive' }) : ''}`,
  })}
<div class="gv-card" style="margin-bottom:18px"><div class="gc-body" style="display:flex;gap:8px;flex-wrap:wrap">
  ${B.btn('İzin ve resmi belgeler', { rota: `/santiyeler/${s.id}/izinler`, ikon: 'fa-file-shield', kucuk: true })}
  ${B.btn('Ziyaretçi ve saha girişi', { rota: `/santiyeler/${s.id}/ziyaretciler`, ikon: 'fa-user-clock', kucuk: true })}
  ${B.btn('Geçici kabul', { rota: `/santiyeler/${s.id}/gecici-kabul`, ikon: 'fa-clipboard-check', kucuk: true })}
  ${B.btn('Kesin kabul ve devir', { rota: `/santiyeler/${s.id}/kesin-kabul`, ikon: 'fa-handshake', kucuk: true })}
</div></div>
${B.sekmeler({ sekmeler: [
    { ad: 'ozet', etiket: 'Özet' },
    { ad: 'raporlar', etiket: 'Günlük raporlar', adet: raporlar.length },
    { ad: 'bildirimler', etiket: 'Saha bildirimleri', adet: bildirimler.length },
  ], aktif: sekme, rota: `/santiyeler/${s.id}`, sorgu: '' })}
<div class="dash-cols">
  <div>
    ${sekme === 'ozet' ? h`<div class="gv-card"><div class="gc-body">
      <dl class="gd-grid" style="border-top:0;padding-top:0;margin-top:0">
        <div><dt>Adres</dt><dd>${s.adres || '—'}</dd></div>
        <div><dt>Oluşturma</dt><dd>${tarih(s.olusturuldu)}</dd></div>
      </dl></div></div>` : ''}
    ${sekme === 'raporlar' ? h`<div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Son günlük raporlar</b></div>
        ${B.btn('Tümü', { rota: `/santiyeler/${s.id}/gunluk-raporlar`, kucuk: true })}</div>
      <div class="gc-body flush">${B.tablo({
        satirlar: raporlar,
        satirRota: (r) => `/gunluk-raporlar/${r.id}`,
        bosDurum: { baslik: 'Günlük rapor yok', ikon: 'fa-clipboard' },
        sutunlar: [
          { ad: 'rapor_gunu', etiket: 'Gün' },
          { ad: 'hava', etiket: 'Hava', govde: (r) => r.hava || '—' },
          { ad: 'ekip_sayisi', etiket: 'Ekip', hizala: 'sag', govde: (r) => sayi(r.ekip_sayisi || 0) },
          { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
        ],
      })}</div></div>` : ''}
    ${sekme === 'bildirimler' ? h`<div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Açık saha bildirimleri</b></div></div>
      <div class="gc-body flush">${B.tablo({
        satirlar: bildirimler,
        satirRota: (r) => `/saha-bildirimleri/${r.id}`,
        bosDurum: { baslik: 'Açık bildirim yok', ikon: 'fa-bullhorn' },
        sutunlar: [
          { ad: 'kod', etiket: 'Kod' },
          { ad: 'baslik', etiket: 'Bildirim', govde: (r) => h`<a href="/saha-bildirimleri/${r.id}"><b>${r.baslik}</b></a>` },
          { ad: 'tur', etiket: 'Tür' },
          { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
        ],
      })}</div></div>` : ''}
  </div>
  <div class="gv-side-stack">
    ${gecisFormu(ctx, { nesne: 'santiye', kayit: s, rota: `/santiyeler/${s.id}`, ekranKodu: 'SITE-03' })}
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: s.kod, baslik: s.ad }));
}
