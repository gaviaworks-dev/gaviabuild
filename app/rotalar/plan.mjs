/* ============================================================================
   İŞ PROGRAMI ROTALARI — PLAN-01..06, PLAN-09, PLAN-10, PLAN-11
   ----------------------------------------------------------------------------
   PLAN-01 kabul: WBS ağırlıkları 100 değilse baz çizgi ONAYA GÖNDERİLEMEZ.
   PLAN-02 kabul: proje ilerlemesi yalnız ONAYLI alt ilerlemelerden ve seçili
   baz çizgi sürümünden hesaplanır.
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, gunAnahtari, gunBaslangici } from '../cekirdek/zaman.mjs';
import { UygulamaHatasi, DogrulamaHatasi, GecisIzinsiz } from '../cekirdek/hata.mjs';
import { idempotent } from '../cekirdek/idempotency.mjs';
import * as onayMotoru from '../moduller/isakisi/onay.mjs';
import {
  agirlikDogrula, agirlikZorunlu, programIlerlemesi, aktiviteIlerlemesi, sapma, yuzdeMetni, BINDE,
} from '../moduller/plan/ilerleme.mjs';
import {
  ekranNesnesi, hataNesnesi, kullaniciAdi, ciz, listeSorgusu, filtreKosullari,
  kayitOlustur, kaydiAl, B, h, ham, sayi, csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar,
  sorgu, tek, calistir, islem, surumluGuncelle, audit, sonrakiKod,
} from './ortak.mjs';

const YONTEMLER = [
  { deger: 'miktar', etiket: 'Ölçülebilir miktar' },
  { deger: 'kilometre_tasi', etiket: 'Kilometre taşı' },
  { deger: 'sure', etiket: 'Süre ağırlığı' },
];

/** Ağırlık girdisi: kullanıcı "%12,5" yazar, sistem 1250 (binde) saklar. */
function agirlikAyristir(girdi, alanAdi = 'agirlik') {
  const s = String(girdi ?? '').trim().replace('%', '').replace(',', '.');
  if (!s) return 0;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw DogrulamaHatasi('Ağırlık 0 ile 100 arasında olmalı.', { alanlar: { [alanAdi]: ['0-100 arası bir yüzde girin.'] } });
  }
  return Math.round(n * 100);
}
const agirlikMetni = (binde) => (binde / 100).toFixed(2).replace('.', ',') + '%';

export function kur(y, ekranRota) {
  /* ================= PLAN-01 İş programı listesi ======================== */
  ekranRota(y, 'PLAN-01', {
    get: (ctx) => {
      const e = ekranNesnesi('PLAN-01');
      yetkiZorunlu(ctx, e.yetki);
      const { kosullar, parametreler } = filtreKosullari(ctx, {
        aramaAlanlari: ['ad', 'kod'], filtreler: [{ ad: 'durum' }, { ad: 'proje', sutun: 'proje_id' }],
      });
      const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
        { tablo: 'is_programi', kosullar, parametreler, sirala: 'olusturuldu DESC' });
      const projeler = sorgu('SELECT id, ad FROM proje WHERE tenant_id = ? ORDER BY ad', ctx.tenant.id)
        .map((p) => ({ deger: p.id, etiket: p.ad }));
      const zengin = satirlar.map((p) => ({ ...p, ilerleme: programIlerlemesi(p.id) }));

      const icerik = B.listeDuzeni({
        kpi: B.kpiSeridi([
          { etiket: 'Program', deger: sayi(toplam), ikon: 'fa-timeline' },
          { etiket: 'Baz çizgili', deger: sayi(Number(tek(
            `SELECT COUNT(*) AS n FROM is_programi WHERE tenant_id = ? AND baz_cizgi = 1`, ctx.tenant.id)?.n ?? 0)), ikon: 'fa-lock' },
          { etiket: 'Onay bekleyen', deger: sayi(Number(tek(
            `SELECT COUNT(*) AS n FROM is_programi WHERE tenant_id = ? AND durum IN ('onaya_gonderildi','incelemede')`,
            ctx.tenant.id)?.n ?? 0)), ikon: 'fa-hourglass-half' },
        ]),
        filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Program adı veya kodu…',
          filtreler: [{ ad: 'proje', etiket: 'Proje', secenekler: projeler },
            { ad: 'durum', etiket: 'Durum', secenekler: ['taslak', 'onaya_gonderildi', 'incelemede', 'onaylandi', 'reddedildi']
              .map((d) => ({ deger: d, etiket: d })) }] }),
        icerik: B.tablo({
          satirlar: zengin,
          satirRota: (r) => `/is-programlari/${r.id}`,
          bosDurum: { baslik: 'İş programı yok', aciklama: 'WBS, aktivite ve ilerleme programda tanımlanır.',
            ikon: 'fa-timeline',
            eylem: yetkiVar(ctx, 'PLAN-02:olustur') ? B.btn('Yeni program', { tur: 'acc', rota: '/is-programlari/yeni', ikon: 'fa-plus' }) : null },
          sutunlar: [
            { ad: 'kod', etiket: 'Kod', govde: (r) => h`${r.kod}<br><span class="muted">sürüm ${r.surum_no}</span>` },
            { ad: 'ad', etiket: 'Program', govde: (r) => h`<a href="/is-programlari/${r.id}"><b>${r.ad}</b></a>
              <br><span class="muted">${tek('SELECT ad FROM proje WHERE id = ?', r.proje_id)?.ad || ''}</span>` },
            { ad: 'ilerleme', etiket: 'Onaylı ilerleme', hizala: 'sag', govde: (r) => yuzdeMetni(r.ilerleme.onayli) },
            { ad: 'baz_cizgi', etiket: 'Baz çizgi', govde: (r) => (r.baz_cizgi
              ? B.isaret(`donduruldu ${tarih(r.baz_cizgi_tarih)}`, 'ok') : B.isaret('yok', 'nötr')) },
            { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
          ],
        }),
        sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
        veriZamani: simdi(),
      });
      return html(ctx, 200, ciz(ctx, e, icerik, {
        eylemler: yetkiVar(ctx, 'PLAN-02:olustur')
          ? B.btn('Yeni program', { tur: 'acc', rota: '/is-programlari/yeni', ikon: 'fa-plus' }) : null,
      }));
    },
  });

  /* ================= PLAN-02 Yeni iş programı ========================== */
  ekranRota(y, 'PLAN-02', {
    get: (ctx) => {
      const e = ekranNesnesi('PLAN-02');
      yetkiZorunlu(ctx, e.yetki);
      return html(ctx, 200, ciz(ctx, e, programFormu(ctx, { deger: { projeId: ctx.sorgu.get('proje') || '' } })));
    },
    post: (ctx, govde) => {
      const e = ekranNesnesi('PLAN-02');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const hatalar = {};
        const ad = String(govde.ad || '').trim();
        if (!ad) hatalar.ad = ['Program adı girin.'];
        if (!govde.projeId) hatalar.projeId = ['Proje seçin.'];
        else if (!tek('SELECT id FROM proje WHERE id = ? AND tenant_id = ?', govde.projeId, ctx.tenant.id)) {
          hatalar.projeId = ['Proje bulunamadı.'];
        }
        const bas = govde.baslangic ? gunBaslangici(govde.baslangic) : null;
        const bit = govde.bitis ? gunBaslangici(govde.bitis) : null;
        if (bas && bit && bit <= bas) hatalar.bitis = ['Bitiş başlangıçtan sonra olmalı.'];
        if (Object.keys(hatalar).length) throw DogrulamaHatasi('Program bilgileri eksik.', { alanlar: hatalar });

        const sonuc = idempotent({ anahtar: govde._idempotency, tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, govde },
          () => kayitOlustur(ctx, { tablo: 'is_programi', nesne: 'is_programi', kodNesnesi: 'is_programi',
            alanlar: { id: kimlik('plan'), proje_id: govde.projeId, santiye_id: govde.santiyeId || null,
              ad, baslangic: bas, bitis: bit, surum_no: 1, durum: 'taslak',
              calisma_gunleri: govde.calismaGunleri || '1,2,3,4,5,6' } }));
        return yonlendir(ctx, `/is-programlari/${sonuc.id}?olusan=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, ciz(ctx, e, programFormu(ctx, { deger: govde, hata: hataNesnesi(err) })));
      }
    },
  });

  /* ================= PLAN-03 Program detayı ============================ */
  ekranRota(y, 'PLAN-03', {
    get: (ctx, _g, params) => programDetayi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('PLAN-03');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      csrfZorunlu(ctx, govde);
      const program = kaydiAl(ctx, 'is_programi', 'is_programi', params.id);
      try {
        if (govde._eylem === 'wbs') return wbsEkle(ctx, program, govde);
        if (govde._eylem === 'aktivite') return aktiviteEkle(ctx, program, govde);
        if (govde._eylem === 'ilerleme') return ilerlemeGir(ctx, program, govde);
        throw DogrulamaHatasi('Tanımsız işlem.');
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return programDetayi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ================= PLAN-04 WBS düzenleyici =========================== */
  ekranRota(y, 'PLAN-04', {
    get: (ctx, _g, params) => wbsSayfasi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('PLAN-04');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      csrfZorunlu(ctx, govde);
      const program = kaydiAl(ctx, 'is_programi', 'is_programi', params.id);
      try {
        return wbsEkle(ctx, program, govde, `/is-programlari/${params.id}/wbs`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return wbsSayfasi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ================= PLAN-06 Baz çizgi onayı =========================== */
  ekranRota(y, 'PLAN-06', {
    get: (ctx, _g, params) => bazCizgiSayfasi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('PLAN-06');
      yetkiZorunlu(ctx, `${e.kod}:goruntule`);
      csrfZorunlu(ctx, govde);
      const program = kaydiAl(ctx, 'is_programi', 'is_programi', params.id);
      try {
        if (program.durum !== 'taslak' && program.durum !== 'revizyon_istendi') {
          throw GecisIzinsiz('Yalnız taslak veya revizyon istenen program onaya gönderilebilir.');
        }
        /* PLAN-01 KABUL: ağırlıklar %100 değilse onaya gönderilemez. */
        agirlikZorunlu(program.id);

        islem(() => {
          onayMotoru.onayaGonder(ctx, {
            nesne: 'is_programi', nesneId: program.id, nesneKod: program.kod,
            baslik: `Baz çizgi onayı: ${program.ad}`, belgeSurum: program.surum,
            projeId: program.proje_id, santiyeId: program.santiye_id,
            gerekce: govde.gerekce || null,
          });
          surumluGuncelle('is_programi', program.id, program.surum, { durum: 'onaya_gonderildi' },
            { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
          audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
            nesne: 'is_programi', nesneId: program.id, eylem: 'baz_cizgi_onaya_gonderildi',
            gerekce: govde.gerekce, sonraki: { durum: 'onaya_gonderildi' } });
        });
        return yonlendir(ctx, `/is-programlari/${program.id}/baz-cizgi?gonderildi=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return bazCizgiSayfasi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ================= PLAN-09 İlerleme girişi =========================== */
  ekranRota(y, 'PLAN-09', {
    get: (ctx) => {
      const e = ekranNesnesi('PLAN-09');
      yetkiZorunlu(ctx, e.yetki);
      return html(ctx, 200, ciz(ctx, e, ilerlemeFormu(ctx, {})));
    },
    post: (ctx, govde) => {
      const e = ekranNesnesi('PLAN-09');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const aktivite = tek('SELECT * FROM aktivite WHERE id = ? AND tenant_id = ?', govde.aktiviteId, ctx.tenant.id);
        if (!aktivite) throw DogrulamaHatasi('Aktivite seçin.', { alanlar: { aktiviteId: ['Aktivite bulunamadı.'] } });
        const program = tek('SELECT * FROM is_programi WHERE id = ?', aktivite.program_id);
        ilerlemeKaydet(ctx, program, aktivite, govde);
        return yonlendir(ctx, `/is-programlari/${program.id}?sekme=ilerleme&kaydedildi=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, ciz(ctx, e, ilerlemeFormu(ctx, { deger: govde, hata: hataNesnesi(err) })));
      }
    },
  });

  /* ================= PLAN-11 Plan-gerçekleşen analizi ================== */
  ekranRota(y, 'PLAN-11', {
    get: (ctx) => {
      const e = ekranNesnesi('PLAN-11');
      yetkiZorunlu(ctx, e.yetki);
      const programlar = sorgu(
        `SELECT * FROM is_programi WHERE tenant_id = ? AND baz_cizgi = 1 ORDER BY kod`, ctx.tenant.id);
      const satirlar = programlar.map((p) => {
        const s = sapma(p.id, { simdiMs: simdi() });
        return { ...p, ...(s || { planlanan: 0, gercek: 0, sapma: 0 }) };
      });
      const icerik = h`
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Plan-gerçekleşen sapması</b>
    <span>Baz çizgi sürümü ve rapor dönemi her satırda görünür (§5.5). Yalnız ONAYLI ilerleme sayılır.</span></div></div>
  <div class="gc-body flush">${B.tablo({
        satirlar,
        satirRota: (r) => `/is-programlari/${r.id}`,
        bosDurum: { baslik: 'Baz çizgili program yok',
          aciklama: 'Sapma analizi yalnız baz çizgisi onaylanmış programlar için yapılır.', ikon: 'fa-chart-line' },
        sutunlar: [
          { ad: 'kod', etiket: 'Program', govde: (r) => h`<b>${r.kod}</b><br><span class="muted">${r.ad} · baz çizgi sürüm ${r.surum_no}</span>` },
          { ad: 'planlanan', etiket: 'Planlanan', hizala: 'sag', govde: (r) => yuzdeMetni(r.planlanan) },
          { ad: 'gercek', etiket: 'Gerçekleşen', hizala: 'sag', govde: (r) => yuzdeMetni(r.gercek) },
          { ad: 'sapma', etiket: 'Sapma', hizala: 'sag', govde: (r) => B.isaret(
            (r.sapma >= 0 ? '+' : '') + yuzdeMetni(r.sapma), r.sapma < -5000 ? 'danger' : r.sapma < 0 ? 'warn' : 'ok') },
          { ad: 'baz_cizgi_tarih', etiket: 'Baz çizgi tarihi', govde: (r) => (r.baz_cizgi_tarih ? tarih(r.baz_cizgi_tarih) : '—') },
        ],
      })}</div>
</div>
${B.veriTarihi(simdi())}`;
      return html(ctx, 200, ciz(ctx, e, icerik));
    },
  });
}

/* ========================================================================== */
/* İşlemler                                                                   */
/* ========================================================================== */
function bazCizgiKilidi(program) {
  if (program.baz_cizgi) {
    throw GecisIzinsiz('Baz çizgi onaylandı; program yerinde değiştirilemez. Program revizyonu ile yeni sürüm açın (§5.4).');
  }
  if (['onaya_gonderildi', 'incelemede'].includes(program.durum)) {
    throw GecisIzinsiz('Program onayda; karar verilene kadar değiştirilemez.');
  }
}

function wbsEkle(ctx, program, govde, hedefRota = null) {
  bazCizgiKilidi(program);
  const kod = String(govde.kod || '').trim();
  const ad = String(govde.ad || '').trim();
  const hatalar = {};
  if (!kod) hatalar.kod = ['WBS kodu girin.'];
  if (!ad) hatalar.ad = ['Düğüm adı girin.'];
  if (Object.keys(hatalar).length) throw DogrulamaHatasi('WBS düğümü eksik.', { alanlar: hatalar });
  if (tek('SELECT id FROM wbs WHERE program_id = ? AND kod = ?', program.id, kod)) {
    throw DogrulamaHatasi('Bu WBS kodu programda zaten var.', { alanlar: { kod: ['Kod tekil olmalı.'] } });
  }
  const agirlik = agirlikAyristir(govde.agirlik);
  const ustId = govde.ustId || null;
  const ust = ustId ? tek('SELECT * FROM wbs WHERE id = ? AND program_id = ?', ustId, program.id) : null;
  if (ustId && !ust) throw DogrulamaHatasi('Üst düğüm bulunamadı.', { alanlar: { ustId: ['Geçersiz üst düğüm.'] } });

  kayitOlustur(ctx, { tablo: 'wbs', nesne: 'wbs',
    alanlar: { id: kimlik('wbs'), program_id: program.id, ust_id: ustId, kod, ad, agirlik,
      seviye: ust ? ust.seviye + 1 : 1, sorumlu_id: govde.sorumluId || null,
      maliyet_kodu: govde.maliyetKodu || null } });
  return yonlendir(ctx, hedefRota || `/is-programlari/${program.id}?sekme=wbs&wbs=1`);
}

function aktiviteEkle(ctx, program, govde) {
  bazCizgiKilidi(program);
  const hatalar = {};
  const kod = String(govde.aktiviteKodu || '').trim();
  const ad = String(govde.aktiviteAdi || '').trim();
  if (!kod) hatalar.aktiviteKodu = ['Aktivite kodu girin.'];
  if (!ad) hatalar.aktiviteAdi = ['Aktivite adı girin.'];
  if (!govde.wbsId) hatalar.wbsId = ['WBS düğümü seçin.'];
  if (Object.keys(hatalar).length) throw DogrulamaHatasi('Aktivite eksik.', { alanlar: hatalar });
  if (tek('SELECT id FROM aktivite WHERE program_id = ? AND kod = ?', program.id, kod)) {
    throw DogrulamaHatasi('Bu aktivite kodu programda zaten var.', { alanlar: { aktiviteKodu: ['Kod tekil olmalı.'] } });
  }
  const agirlik = agirlikAyristir(govde.aktiviteAgirligi, 'aktiviteAgirligi');
  kayitOlustur(ctx, { tablo: 'aktivite', nesne: 'aktivite',
    alanlar: { id: kimlik('aktivite'), program_id: program.id, wbs_id: govde.wbsId, kod, ad,
      yontem: govde.yontem || 'miktar', birim: govde.birim || null,
      planlanan_miktar: govde.planlananMiktar || null, agirlik,
      baslangic: govde.aktiviteBaslangic ? gunBaslangici(govde.aktiviteBaslangic) : null,
      bitis: govde.aktiviteBitis ? gunBaslangici(govde.aktiviteBitis) : null,
      sorumlu_id: govde.aktiviteSorumlusu || null } });
  return yonlendir(ctx, `/is-programlari/${program.id}?sekme=wbs&aktivite=1`);
}

/** İlerleme kaydı TASLAK açılır; onaylanmadan proje ilerlemesine katılmaz. */
function ilerlemeKaydet(ctx, program, aktivite, govde) {
  const yuzde = agirlikAyristir(govde.yuzde, 'yuzde') * 10;   // %0-100 → binde 0-100000
  const donem = String(govde.donem || gunAnahtari(simdi()).slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(donem)) {
    throw DogrulamaHatasi('Dönem YYYY-AA biçiminde olmalı.', { alanlar: { donem: ['Örn. 2026-08'] } });
  }
  if (!String(govde.kanit || '').trim()) {
    throw DogrulamaHatasi('İlerleme kanıtı zorunludur.',
      { alanlar: { kanit: ['Ölçüm, tutanak veya fotoğraf referansı girin.'] } });
  }
  const oncekiOnayli = aktiviteIlerlemesi(aktivite.id, { onayliSadece: true });
  if (yuzde < oncekiOnayli) {
    throw DogrulamaHatasi(
      `Girilen ilerleme (${yuzdeMetni(yuzde)}) onaylı ilerlemenin (${yuzdeMetni(oncekiOnayli)}) altında olamaz.`,
      { alanlar: { yuzde: ['Geri gitme için düzeltme kaydı ve gerekçe gerekir.'] } });
  }

  return islem(() => {
    const id = kimlik('rapor').replace('rpt', 'ilr');
    calistir(`INSERT INTO ilerleme (id, tenant_id, aktivite_id, program_id, santiye_id, proje_id,
                donem, miktar, yuzde_binde, kanit, aciklama, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?, 'taslak', ?,?)`,
      id, ctx.tenant.id, aktivite.id, program.id, program.santiye_id, program.proje_id,
      donem, govde.miktar || null, yuzde, govde.kanit, govde.aciklama || null,
      ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'ilerleme', nesneId: id, eylem: 'olustur',
      sonraki: { aktivite: aktivite.kod, donem, yuzde, durum: 'taslak' } });
    return { id };
  });
}

function ilerlemeGir(ctx, program, govde) {
  const aktivite = tek('SELECT * FROM aktivite WHERE id = ? AND program_id = ?', govde.aktiviteId, program.id);
  if (!aktivite) throw DogrulamaHatasi('Aktivite bulunamadı.');
  ilerlemeKaydet(ctx, program, aktivite, govde);
  return yonlendir(ctx, `/is-programlari/${program.id}?sekme=ilerleme&kaydedildi=1`);
}

/** PLAN-10 — ilerleme doğrulama (onay). Kendi girdiğini doğrulayamaz. */
export function ilerlemeDogrula(ctx, ilerlemeId, karar, gerekce) {
  const kayit = tek('SELECT * FROM ilerleme WHERE id = ? AND tenant_id = ?', ilerlemeId, ctx.tenant.id);
  if (!kayit) throw DogrulamaHatasi('İlerleme kaydı bulunamadı.');
  if (kayit.durum !== 'taslak' && kayit.durum !== 'onaya_gonderildi') {
    throw GecisIzinsiz('Bu ilerleme kaydı zaten karara bağlanmış.');
  }
  if (kayit.olusturan === ctx.kullanici.id) {
    throw DogrulamaHatasi('Kendi girdiğiniz ilerlemeyi doğrulayamazsınız (dört göz).');
  }
  if (karar === 'reddet' && !String(gerekce || '').trim()) {
    throw DogrulamaHatasi('Ret için gerekçe zorunludur.', { alanlar: { gerekce: ['Gerekçe girin.'] } });
  }
  return islem(() => {
    const yeniDurum = karar === 'onayla' ? 'onaylandi' : 'reddedildi';
    surumluGuncelle('ilerleme', kayit.id, kayit.surum,
      { durum: yeniDurum, dogrulayan: ctx.kullanici.id, dogrulandi: simdi() },
      { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'ilerleme', nesneId: kayit.id, eylem: `dogrulama:${karar}`, gerekce,
      onceki: { durum: kayit.durum }, sonraki: { durum: yeniDurum } });
    return yeniDurum;
  });
}

/** Baz çizgi onayı kapandığında motor tarafından çağrılır. */
export function bazCizgiSonucu(ctx, programId, sonuc) {
  const p = tek('SELECT * FROM is_programi WHERE id = ?', programId);
  if (!p || p.durum !== 'onaya_gonderildi') return;
  return islem(() => {
    if (sonuc === 'onaylandi') {
      surumluGuncelle('is_programi', p.id, p.surum,
        { durum: 'onaylandi', baz_cizgi: 1, baz_cizgi_tarih: simdi() },
        { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'is_programi', nesneId: p.id, eylem: 'baz_cizgi_donduruldu',
        gerekce: 'Onay tamamlandı; plan değiştirilemez sürüm olarak donduruldu.',
        sonraki: { bazCizgi: true, surumNo: p.surum_no } });
    } else {
      surumluGuncelle('is_programi', p.id, p.surum,
        { durum: sonuc === 'reddedildi' ? 'reddedildi' : 'revizyon_istendi' },
        { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
    }
  });
}

/* ========================================================================== */
/* Sayfalar                                                                   */
/* ========================================================================== */
function programFormu(ctx, { deger = {}, hata = null }) {
  const projeler = sorgu(
    `SELECT id, kod, ad FROM proje WHERE tenant_id = ? AND durum NOT IN ('kapali','arsiv') ORDER BY ad`, ctx.tenant.id)
    .map((p) => ({ deger: p.id, etiket: `${p.kod} — ${p.ad}` }));
  return B.form({
    rota: '/is-programlari/yeni', csrf: csrfAlani(ctx), idempotencyAnahtari: kimlik('idempotency'), hatalar: hata,
    bolumler: [{
      baslik: 'Program bilgisi',
      aciklama: 'Program taslak açılır; WBS ve aktiviteler eklendikten sonra baz çizgi onaya gönderilir.',
      alanlar: h`
        ${B.alan({ ad: 'ad', etiket: 'Program adı', deger: deger.ad || '', zorunlu: true, hata: hata?.alanlar?.ad, genis: true })}
        ${B.alan({ ad: 'projeId', etiket: 'Proje', deger: deger.projeId || '', zorunlu: true,
          hata: hata?.alanlar?.projeId, secenekler: [{ deger: '', etiket: 'Seçin…' }, ...projeler] })}
        ${B.alan({ ad: 'baslangic', etiket: 'Başlangıç', tur: 'date', deger: deger.baslangic || '' })}
        ${B.alan({ ad: 'bitis', etiket: 'Bitiş', tur: 'date', deger: deger.bitis || '', hata: hata?.alanlar?.bitis })}
        ${B.alan({ ad: 'calismaGunleri', etiket: 'Çalışma günleri', deger: deger.calismaGunleri || '1,2,3,4,5,6',
          ipucu: '1=Pazartesi … 7=Pazar' })}`,
    }],
    eylemler: h`${B.btn('Vazgeç', { rota: '/is-programlari' })}
      ${B.btn('Kaydet ve detaya git', { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' })}`,
  });
}

function programVerisi(ctx, id) {
  const program = kaydiAl(ctx, 'is_programi', 'is_programi', id);
  const dugumler = sorgu('SELECT * FROM wbs WHERE program_id = ? ORDER BY kod', program.id);
  const aktiviteler = sorgu('SELECT * FROM aktivite WHERE program_id = ? ORDER BY kod', program.id);
  const ilerlemeler = sorgu(
    `SELECT i.*, a.kod AS aktivite_kodu, a.ad AS aktivite_adi FROM ilerleme i
       JOIN aktivite a ON a.id = i.aktivite_id
      WHERE i.program_id = ? ORDER BY i.olusturuldu DESC`, program.id);
  return { program, dugumler, aktiviteler, ilerlemeler, dogrulama: agirlikDogrula(program.id),
    ilerleme: programIlerlemesi(program.id) };
}

function programDetayi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('PLAN-03');
  yetkiZorunlu(ctx, e.yetki);
  const { program, dugumler, aktiviteler, ilerlemeler, dogrulama, ilerleme } = programVerisi(ctx, id);
  const sekme = ctx.sorgu.get('sekme') || 'ozet';
  const proje = tek('SELECT * FROM proje WHERE id = ?', program.proje_id);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: 'İş programı oluşturuldu',
    aciklama: 'Şimdi WBS düğümlerini ve aktiviteleri ekleyin; ağırlıklar %100 olduğunda baz çizgi onaya gönderilebilir.' }) : ''}
${ctx.sorgu.get('wbs') ? B.sonucSeridi({ tur: 'ok', baslik: 'WBS düğümü eklendi' }) : ''}
${ctx.sorgu.get('aktivite') ? B.sonucSeridi({ tur: 'ok', baslik: 'Aktivite eklendi' }) : ''}
${ctx.sorgu.get('kaydedildi') ? B.sonucSeridi({ tur: 'ok', baslik: 'İlerleme kaydedildi',
    aciklama: 'Kayıt TASLAK durumunda; doğrulanmadan proje ilerlemesine katılmaz (§5.5).' }) : ''}
${B.detayOzetSeridi({
    kod: `${program.kod} · sürüm ${program.surum_no}`,
    baslik: program.ad,
    durum: program.durum,
    surum: program.surum,
    isaretler: program.baz_cizgi ? [{ metin: 'baz çizgi donduruldu', ton: 'ok' }]
      : dogrulama.gecerli ? [{ metin: 'ağırlıklar %100', ton: 'ok' }]
      : [{ metin: 'ağırlıklar %100 değil', ton: 'warn' }],
    bilgiler: [
      { etiket: 'Proje', deger: h`<a href="/projeler/${program.proje_id}">${proje?.ad || '—'}</a>` },
      { etiket: 'Takvim', deger: `${program.baslangic ? tarih(program.baslangic) : '—'} → ${program.bitis ? tarih(program.bitis) : '—'}` },
      { etiket: 'WBS düğümü', deger: sayi(dugumler.length) },
      { etiket: 'Aktivite', deger: sayi(aktiviteler.length) },
      { etiket: 'Onaylı ilerleme', deger: yuzdeMetni(ilerleme.onayli) },
      { etiket: 'Tahmini ilerleme', deger: yuzdeMetni(ilerleme.tahmini) },
    ],
    birincilEylem: program.baz_cizgi ? null
      : B.btn('Baz çizgi onayı', { tur: 'acc', rota: `/is-programlari/${program.id}/baz-cizgi`, ikon: 'fa-lock' }),
    digerEylemler: B.btn('WBS düzenleyici', { rota: `/is-programlari/${program.id}/wbs`, ikon: 'fa-sitemap' }),
  })}
${B.sekmeler({ sekmeler: [
    { ad: 'ozet', etiket: 'Özet' },
    { ad: 'wbs', etiket: 'WBS ve aktiviteler', adet: dugumler.length },
    { ad: 'ilerleme', etiket: 'İlerleme', adet: ilerlemeler.length },
  ], aktif: sekme, rota: `/is-programlari/${program.id}`, sorgu: '' })}

${sekme === 'ozet' ? h`
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>İlerleme hesabı</b>
    <span>sum(WBS ağırlığı × onaylı aktivite ilerlemesi) — elle yazılan tek yüzde yoktur (§5.5).</span></div></div>
  <div class="gc-body">
    <dl class="gd-grid" style="border-top:0;padding-top:0;margin-top:0">
      <div><dt>Onaylı ilerleme</dt><dd>${yuzdeMetni(ilerleme.onayli)}</dd></div>
      <div><dt>Tahmini (onaysız dahil)</dt><dd>${yuzdeMetni(ilerleme.tahmini)}</dd></div>
      <div><dt>Baz çizgi</dt><dd>${program.baz_cizgi ? tarih(program.baz_cizgi_tarih) : 'yok'}</dd></div>
      <div><dt>Program sürümü</dt><dd>${program.surum_no}</dd></div>
    </dl>
    <div class="gbar-track" style="margin-top:18px"><div class="gbar-fill" style="width:${ham(String(ilerleme.onayli / 1000))}%"></div></div>
  </div>
</div>` : ''}

${sekme === 'wbs' ? wbsSekmesi(ctx, program, dugumler, aktiviteler, dogrulama) : ''}
${sekme === 'ilerleme' ? ilerlemeSekmesi(ctx, program, aktiviteler, ilerlemeler) : ''}`;

  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: program.kod, baslik: program.ad }));
}

function agirlikOzeti(dogrulama) {
  return dogrulama.gecerli
    ? B.sonucSeridi({ tur: 'ok', baslik: 'WBS ağırlıkları geçerli',
        aciklama: 'Her düğüm kümesi %100; baz çizgi onaya gönderilebilir.' })
    : B.sonucSeridi({ tur: 'warn', baslik: 'WBS ağırlıkları %100 değil',
        aciklama: dogrulama.hatalar.map((x) => `${x.ustAd}: %${(x.toplam / 100).toFixed(2)}`).join(' · ')
          + ' — baz çizgi onaya gönderilemez (PLAN-01).' });
}

function wbsSekmesi(ctx, program, dugumler, aktiviteler, dogrulama) {
  const maliyetKodlari = sorgu('SELECT kod, ad FROM maliyet_kodu WHERE tenant_id = ? ORDER BY kod', ctx.tenant.id)
    .map((m) => ({ deger: m.kod, etiket: `${m.kod} — ${m.ad}` }));
  const yazilabilir = !program.baz_cizgi && !['onaya_gonderildi', 'incelemede'].includes(program.durum);
  return h`
${agirlikOzeti(dogrulama)}
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>WBS ağacı</b>
    <span>Kardeş düğümlerin ağırlık toplamı %100 olmalı.</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: dugumler,
    bosDurum: { baslik: 'WBS düğümü yok', aciklama: 'İş kırılımını eklemeden ilerleme hesaplanamaz.', ikon: 'fa-sitemap' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod', govde: (r) => h`<span style="padding-left:${ham(String((r.seviye - 1) * 16))}px"><b>${r.kod}</b></span>` },
      { ad: 'ad', etiket: 'Düğüm' },
      { ad: 'agirlik', etiket: 'Ağırlık', hizala: 'sag', govde: (r) => agirlikMetni(r.agirlik) },
      { ad: 'aktivite', etiket: 'Aktivite', hizala: 'sag',
        govde: (r) => sayi(aktiviteler.filter((a) => a.wbs_id === r.id).length) },
      { ad: 'maliyet_kodu', etiket: 'Maliyet kodu', govde: (r) => r.maliyet_kodu || '—' },
    ],
  })}</div>
</div>
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Aktiviteler</b>
    <span>Yaprak düğümlerdeki aktivite ağırlıkları da %100 olmalı.</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: aktiviteler,
    bosDurum: { baslik: 'Aktivite yok', ikon: 'fa-list-check' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'ad', etiket: 'Aktivite' },
      { ad: 'wbs_id', etiket: 'WBS', govde: (r) => dugumler.find((d) => d.id === r.wbs_id)?.kod || '—' },
      { ad: 'yontem', etiket: 'Yöntem', govde: (r) => YONTEMLER.find((x) => x.deger === r.yontem)?.etiket || r.yontem },
      { ad: 'agirlik', etiket: 'Ağırlık', hizala: 'sag', govde: (r) => agirlikMetni(r.agirlik) },
      { ad: 'ilerleme', etiket: 'Onaylı ilerleme', hizala: 'sag', govde: (r) => yuzdeMetni(aktiviteIlerlemesi(r.id)) },
    ],
  })}</div>
</div>
${yazilabilir && yetkiVar(ctx, 'PLAN-04:guncelle') ? h`
<div class="dash-cols">
  ${B.form({ rota: `/is-programlari/${program.id}`, csrf: csrfAlani(ctx),
    bolumler: [{ baslik: 'WBS düğümü ekle', alanlar: h`
      ${ham('<input type="hidden" name="_eylem" value="wbs">')}
      ${B.alan({ ad: 'kod', etiket: 'Kod', zorunlu: true, ipucu: 'Örn. 1 veya 1.2' })}
      ${B.alan({ ad: 'ad', etiket: 'Ad', zorunlu: true })}
      ${B.alan({ ad: 'agirlik', etiket: 'Ağırlık (%)', ipucu: 'Kardeşlerle toplamı 100 olmalı' })}
      ${B.alan({ ad: 'ustId', etiket: 'Üst düğüm',
        secenekler: [{ deger: '', etiket: '(kök)' }, ...dugumler.map((d) => ({ deger: d.id, etiket: `${d.kod} ${d.ad}` }))] })}
      ${B.alan({ ad: 'maliyetKodu', etiket: 'Maliyet kodu',
        secenekler: [{ deger: '', etiket: 'Seçin…' }, ...maliyetKodlari] })}` }],
    eylemler: B.btn('Düğüm ekle', { tur: 'acc', gonder: true, ikon: 'fa-plus' }) })}
  ${B.form({ rota: `/is-programlari/${program.id}`, csrf: csrfAlani(ctx),
    bolumler: [{ baslik: 'Aktivite ekle', alanlar: h`
      ${ham('<input type="hidden" name="_eylem" value="aktivite">')}
      ${B.alan({ ad: 'aktiviteKodu', etiket: 'Kod', zorunlu: true })}
      ${B.alan({ ad: 'aktiviteAdi', etiket: 'Ad', zorunlu: true })}
      ${B.alan({ ad: 'wbsId', etiket: 'WBS düğümü', zorunlu: true,
        secenekler: [{ deger: '', etiket: 'Seçin…' }, ...dugumler.map((d) => ({ deger: d.id, etiket: `${d.kod} ${d.ad}` }))] })}
      ${B.alan({ ad: 'aktiviteAgirligi', etiket: 'Ağırlık (%)' })}
      ${B.alan({ ad: 'yontem', etiket: 'İlerleme yöntemi', deger: 'miktar', secenekler: YONTEMLER })}
      ${B.alan({ ad: 'birim', etiket: 'Birim' })}
      ${B.alan({ ad: 'planlananMiktar', etiket: 'Planlanan miktar' })}` }],
    eylemler: B.btn('Aktivite ekle', { tur: 'acc', gonder: true, ikon: 'fa-plus' }) })}
</div>` : h`<p class="gf-hint">${program.baz_cizgi
    ? 'Baz çizgi onaylandı; program yerinde değiştirilemez. Değişiklik için program revizyonu ile yeni sürüm açılır (§5.4).'
    : 'Program onayda; karar verilene kadar düzenlenemez.'}</p>`}`;
}

function ilerlemeSekmesi(ctx, program, aktiviteler, ilerlemeler) {
  return h`
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>İlerleme kayıtları</b>
    <span>Yalnız <b>onaylı</b> kayıtlar proje ilerlemesine katılır; taslak kayıtlar tahmini değerde görünür.</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: ilerlemeler,
    bosDurum: { baslik: 'İlerleme kaydı yok', ikon: 'fa-chart-simple' },
    sutunlar: [
      { ad: 'donem', etiket: 'Dönem' },
      { ad: 'aktivite_kodu', etiket: 'Aktivite', govde: (r) => h`<b>${r.aktivite_kodu}</b><br><span class="muted">${r.aktivite_adi}</span>` },
      { ad: 'yuzde_binde', etiket: 'İlerleme', hizala: 'sag', govde: (r) => yuzdeMetni(r.yuzde_binde) },
      { ad: 'kanit', etiket: 'Kanıt', govde: (r) => r.kanit || '—' },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
      { ad: 'dogrulayan', etiket: 'Doğrulayan', govde: (r) => kullaniciAdi(r.dogrulayan) },
    ],
  })}</div>
</div>
${aktiviteler.length && yetkiVar(ctx, 'PLAN-09:olustur') ? B.form({
    rota: `/is-programlari/${program.id}`, csrf: csrfAlani(ctx),
    bolumler: [{ baslik: 'İlerleme gir',
      aciklama: 'Kayıt taslak açılır; yetkili bir kullanıcı doğrulamadan proje ilerlemesine katılmaz.',
      alanlar: h`
        ${ham('<input type="hidden" name="_eylem" value="ilerleme">')}
        ${B.alan({ ad: 'aktiviteId', etiket: 'Aktivite', zorunlu: true,
          secenekler: [{ deger: '', etiket: 'Seçin…' }, ...aktiviteler.map((a) => ({ deger: a.id, etiket: `${a.kod} — ${a.ad}` }))] })}
        ${B.alan({ ad: 'donem', etiket: 'Dönem', deger: gunAnahtari(simdi()).slice(0, 7), ipucu: 'YYYY-AA' })}
        ${B.alan({ ad: 'yuzde', etiket: 'Kümülatif ilerleme (%)', zorunlu: true })}
        ${B.alan({ ad: 'miktar', etiket: 'Gerçekleşen miktar' })}
        ${B.alan({ ad: 'kanit', etiket: 'Kanıt', zorunlu: true, genis: true,
          ipucu: 'Ölçüm tutanağı, foto referansı veya günlük rapor kodu' })}` }],
    eylemler: B.btn('İlerlemeyi kaydet', { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' }),
  }) : ''}`;
}

function wbsSayfasi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('PLAN-04');
  yetkiZorunlu(ctx, e.yetki);
  const { program, dugumler, aktiviteler, dogrulama } = programVerisi(ctx, id);
  const icerik = h`${hata ? B.hataOzeti(hata) : ''}
${wbsSekmesi(ctx, program, dugumler, aktiviteler, dogrulama)}`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: program.kod, baslik: `${program.ad} — WBS` }));
}

function bazCizgiSayfasi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('PLAN-06');
  yetkiZorunlu(ctx, e.yetki);
  const { program, dogurlama, dogrulama, dugumler, aktiviteler } = programVerisi(ctx, id);
  void dogurlama;
  const acikTalep = tek(`SELECT * FROM onay_talebi WHERE nesne = 'is_programi' AND nesne_id = ? AND durum = 'acik'`, program.id);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('gonderildi') ? B.sonucSeridi({ tur: 'ok', baslik: 'Baz çizgi onaya gönderildi',
    aciklama: 'Onaycı iş akışı şablonundan çözüldü. Onaylanınca plan değiştirilemez sürüm olarak dondurulur.' }) : ''}
${agirlikOzeti(dogrulama)}
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Baz çizgi kontrol listesi</b>
    <span>Onaya göndermeden önce sağlanması gereken koşullar.</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: [
      { kosul: 'WBS düğümü tanımlı', sonuc: dugumler.length > 0, deger: `${dugumler.length} düğüm` },
      { kosul: 'Aktivite tanımlı', sonuc: aktiviteler.length > 0, deger: `${aktiviteler.length} aktivite` },
      { kosul: 'WBS ağırlıkları %100', sonuc: dogrulama.gecerli,
        deger: dogrulama.gecerli ? 'geçerli' : dogrulama.hatalar.map((x) => `${x.ustAd}: %${(x.toplam / 100).toFixed(2)}`).join(' · ') },
      { kosul: 'Program takvimi girilmiş', sonuc: !!(program.baslangic && program.bitis),
        deger: program.baslangic && program.bitis ? `${tarih(program.baslangic)} → ${tarih(program.bitis)}` : 'eksik' },
      { kosul: 'Baz çizgi henüz dondurulmamış', sonuc: !program.baz_cizgi,
        deger: program.baz_cizgi ? `donduruldu ${tarih(program.baz_cizgi_tarih)}` : 'uygun' },
    ],
    sutunlar: [
      { ad: 'kosul', etiket: 'Koşul', govde: (r) => h`<b>${r.kosul}</b>` },
      { ad: 'deger', etiket: 'Durum' },
      { ad: 'sonuc', etiket: 'Sonuç', hizala: 'sag',
        govde: (r) => (r.sonuc ? B.rozet('onaylandi', 'Sağlandı') : B.rozet('reddedildi', 'Sağlanmadı')) },
    ],
  })}</div>
</div>
${acikTalep ? B.sonucSeridi({ tur: 'warn', baslik: 'Onay süreci devam ediyor',
    aciklama: 'Karar verilene kadar program düzenlenemez.', kayitRota: `/onaylar/${acikTalep.id}` })
  : program.baz_cizgi ? B.sonucSeridi({ tur: 'ok', baslik: 'Baz çizgi donduruldu',
      aciklama: `Sürüm ${program.surum_no} · ${tarih(program.baz_cizgi_tarih)}. Değişiklik için program revizyonu gerekir.` })
  : B.form({
      rota: `/is-programlari/${program.id}/baz-cizgi`, csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Baz çizgiyi onaya gönder',
        aciklama: 'Onaycıyı siz seçmezsiniz; iş akışı şablonundan çözülür. Onaylanan plan değiştirilemez.',
        alanlar: B.alan({ ad: 'gerekce', etiket: 'Not', tur: 'metin', genis: true }) }],
      eylemler: B.btn('Onaya gönder', { tur: 'acc', gonder: true, ikon: 'fa-paper-plane',
        devreDisi: !dogrulama.gecerli }),
    })}`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: program.kod, baslik: `${program.ad} — baz çizgi` }));
}

function ilerlemeFormu(ctx, { deger = {}, hata = null }) {
  const aktiviteler = sorgu(
    `SELECT a.id, a.kod, a.ad, p.ad AS program_adi FROM aktivite a
       JOIN is_programi p ON p.id = a.program_id
      WHERE a.tenant_id = ? ORDER BY p.kod, a.kod`, ctx.tenant.id)
    .map((a) => ({ deger: a.id, etiket: `${a.kod} — ${a.ad} (${a.program_adi})` }));
  return B.form({
    rota: '/ilerleme/yeni', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{
      baslik: 'İlerleme girişi',
      aciklama: 'Kayıt taslak açılır; doğrulanmadan proje ilerlemesine katılmaz (§5.5).',
      alanlar: h`
        ${B.alan({ ad: 'aktiviteId', etiket: 'Aktivite', deger: deger.aktiviteId || '', zorunlu: true,
          hata: hata?.alanlar?.aktiviteId, secenekler: [{ deger: '', etiket: 'Seçin…' }, ...aktiviteler] })}
        ${B.alan({ ad: 'donem', etiket: 'Dönem', deger: deger.donem || gunAnahtari(simdi()).slice(0, 7),
          hata: hata?.alanlar?.donem, ipucu: 'YYYY-AA' })}
        ${B.alan({ ad: 'yuzde', etiket: 'Kümülatif ilerleme (%)', deger: deger.yuzde || '', zorunlu: true,
          hata: hata?.alanlar?.yuzde })}
        ${B.alan({ ad: 'miktar', etiket: 'Gerçekleşen miktar', deger: deger.miktar || '' })}
        ${B.alan({ ad: 'kanit', etiket: 'Kanıt', deger: deger.kanit || '', zorunlu: true,
          hata: hata?.alanlar?.kanit, genis: true })}`,
    }],
    eylemler: B.btn('Kaydet', { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' }),
  });
}
