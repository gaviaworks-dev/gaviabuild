/* ============================================================================
   İŞ PROGRAMI ROTALARI — PLAN-01..12
   ----------------------------------------------------------------------------
   PLAN-01 kabul: WBS ağırlıkları 100 değilse baz çizgi ONAYA GÖNDERİLEMEZ.
   PLAN-02 kabul: proje ilerlemesi yalnız ONAYLI alt ilerlemelerden ve seçili
   baz çizgi sürümünden hesaplanır.
   ========================================================================== */
import { html, yonlendir, yanitla } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, gunAnahtari, gunBaslangici } from '../cekirdek/zaman.mjs';
import { UygulamaHatasi, DogrulamaHatasi, GecisIzinsiz, Cakisma } from '../cekirdek/hata.mjs';
import { idempotent } from '../cekirdek/idempotency.mjs';
import * as onayMotoru from '../moduller/isakisi/onay.mjs';
import {
  agirlikDogrula, agirlikZorunlu, programIlerlemesi, aktiviteIlerlemesi, sapma, yuzdeMetni, BINDE,
} from '../moduller/plan/ilerleme.mjs';
import {
  ekranNesnesi, hataNesnesi, kullaniciAdi, ciz, listeSorgusu, filtreKosullari,
  kayitOlustur, kaydiAl, sekmeleriCoz, eskiSekmeHedefi,
  B, h, ham, sayi, csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar,
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
        /* WBS düğümü ve aktivite PLAN-04'ün (`/is-programlari/:id/wbs`) işidir;
           detay ekranı ikinci bir yazma yüzeyi açmaz (kural 4, K-116). */
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
      const hedef = `/is-programlari/${params.id}/wbs`;
      try {
        if (govde._eylem === 'aktivite') return aktiviteEkle(ctx, program, govde, hedef);
        return wbsEkle(ctx, program, govde, hedef);
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

  /* ================= PLAN-05 Aktivite formu ============================ */
  ekranRota(y, 'PLAN-05', {
    get: (ctx, _g, params) => aktiviteSayfasi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('PLAN-05');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      const program = kaydiAl(ctx, 'is_programi', 'is_programi', params.id);
      try {
        return aktiviteEkle(ctx, program, govde);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return aktiviteSayfasi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= PLAN-07 Program revizyonu ========================= */
  ekranRota(y, 'PLAN-07', {
    get: (ctx, _g, params) => revizyonSayfasi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('PLAN-07');
      yetkiZorunlu(ctx, `${e.kod}:karar_ver`);
      csrfZorunlu(ctx, govde);
      const program = kaydiAl(ctx, 'is_programi', 'is_programi', params.id);
      try {
        const yeni = revizyonAc(ctx, program, govde);
        return yonlendir(ctx, `/is-programlari/${yeni.id}?revizyon=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return revizyonSayfasi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ================= PLAN-08 Haftalık look-ahead ======================= */
  ekranRota(y, 'PLAN-08', {
    get: (ctx, _g, params) => lookAheadSayfasi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('PLAN-08');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      const program = kaydiAl(ctx, 'is_programi', 'is_programi', params.id);
      try {
        const mesaj = lookAheadGorevi(ctx, program, govde);
        return yonlendir(ctx, `/is-programlari/${program.id}/look-ahead?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return lookAheadSayfasi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ================= PLAN-10 İlerleme doğrulama ======================== */
  ekranRota(y, 'PLAN-10', {
    get: (ctx, _g, params) => ilerlemeDogrulaSayfasi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('PLAN-10');
      yetkiZorunlu(ctx, `${e.kod}:karar_ver`);
      csrfZorunlu(ctx, govde);
      try {
        const sonuc = ilerlemeDogrula(ctx, params.id, govde.karar, govde.gerekce);
        return yonlendir(ctx, `/ilerleme/${params.id}/dogrula?karar=${sonuc}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return ilerlemeDogrulaSayfasi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ================= PLAN-12 İçe/dışa aktarım ========================== */
  ekranRota(y, 'PLAN-12', {
    get: (ctx, _g, params) => {
      if (ctx.sorgu.get('disa') === 'csv') return programCsvDisaAktar(ctx, params.id);
      return aktarimSayfasi(ctx, params.id);
    },
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('PLAN-12');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      const program = kaydiAl(ctx, 'is_programi', 'is_programi', params.id);
      try {
        const onizleme = csvOnizle(ctx, program, govde.csv || '');
        if (govde._eylem !== 'uygula') {
          return aktarimSayfasi(ctx, params.id, { onizleme, girdi: govde.csv });
        }
        const sonuc = csvUygula(ctx, program, onizleme);
        return yonlendir(ctx, `/is-programlari/${program.id}/aktarim?ice=${sonuc.wbs}_${sonuc.aktivite}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return aktarimSayfasi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum, girdi: govde.csv });
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

  /* PLAN-11 artık `moduller/rapor/tanimlar.mjs` içinde bir RAPOR TANIMIDIR ve
     rotasını `rotalar/rapor.mjs` kurar: tek ReportLayout, dört çıktı
     (kural 9, denetim-01 D-05). Burada ikinci bir görüntüleyici yazılmaz. */
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
  return yonlendir(ctx, `${hedefRota || `/is-programlari/${program.id}/wbs`}?wbs=1`);
}

function aktiviteEkle(ctx, program, govde, hedefRota = null) {
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
  return yonlendir(ctx, `${hedefRota || `/is-programlari/${program.id}/wbs`}?aktivite=1`);
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
  /* Eski `?sekme=wbs` biçimi kanonik PLAN-04 rotasına kalıcı yollanır (K-116). */
  const kanonik = eskiSekmeHedefi(ctx, { desen: '/is-programlari/:id', rota: `/is-programlari/${id}` });
  if (kanonik) return yonlendir(ctx, kanonik, 301);
  const { program, dugumler, aktiviteler, ilerlemeler, dogrulama, ilerleme } = programVerisi(ctx, id);
  const sekme = ctx.sorgu.get('sekme') || 'ozet';
  const proje = tek('SELECT * FROM proje WHERE id = ?', program.proje_id);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: 'İş programı oluşturuldu',
    aciklama: 'Şimdi WBS düğümlerini ve aktiviteleri ekleyin; ağırlıklar %100 olduğunda baz çizgi onaya gönderilebilir.' }) : ''}
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
${B.sekmeler({ sekmeler: sekmeleriCoz([
    { ad: 'ozet', etiket: 'Özet' },
    { ad: 'wbs', etiket: 'WBS ve aktiviteler', adet: dugumler.length },
    { ad: 'ilerleme', etiket: 'İlerleme', adet: ilerlemeler.length },
  ], { desen: '/is-programlari/:id', rota: `/is-programlari/${program.id}` }),
    aktif: sekme, rota: `/is-programlari/${program.id}`, sorgu: '' })}

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

${/* `wbs` sekmesi PLAN-04'ün kendi ekranıdır; burada TEKRAR çizilmez (kural 4). */ ''}
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

/* Formlar PLAN-04'ün KENDİ rotasına gönderir: sekme PLAN-03'te çizilmediği için
   yazma yüzeyi de oraya bakmaz (K-116). */
function wbsSekmesi(ctx, program, dugumler, aktiviteler, dogrulama) {
  const formRota = `/is-programlari/${program.id}/wbs`;
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
  ${B.form({ rota: formRota, csrf: csrfAlani(ctx),
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
  ${B.form({ rota: formRota, csrf: csrfAlani(ctx),
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
${ctx.sorgu.get('wbs') ? B.sonucSeridi({ tur: 'ok', baslik: 'WBS düğümü eklendi' }) : ''}
${ctx.sorgu.get('aktivite') ? B.sonucSeridi({ tur: 'ok', baslik: 'Aktivite eklendi' }) : ''}
${B.btn('Programa dön', { rota: `/is-programlari/${program.id}`, ikon: 'fa-arrow-left', kucuk: true })}
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

/* ==========================================================================
   PLAN-05 — Aktivite formu
   ========================================================================== */
function aktiviteSayfasi(ctx, id, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('PLAN-05');
  yetkiZorunlu(ctx, e.yetki);
  const { program, dugumler, aktiviteler } = programVerisi(ctx, id);
  const kilit = program.baz_cizgi
    ? 'Baz çizgi dondurulmuş; yeni aktivite ancak program revizyonu ile eklenir (§5.4).'
    : ['onaya_gonderildi', 'incelemede'].includes(program.durum) ? 'Program onayda; karar verilene kadar değiştirilemez.' : null;

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${kilit ? B.sonucSeridi({ tur: 'warn', baslik: 'Program kilitli', aciklama: kilit }) : ''}
${B.detayOzetSeridi({
    kod: program.kod, baslik: `${program.ad} — yeni aktivite`, durum: program.durum, surum: program.surum_no,
    bilgiler: [
      { etiket: 'WBS düğümü', deger: sayi(dugumler.length) },
      { etiket: 'Aktivite', deger: sayi(aktiviteler.length) },
      { etiket: 'Baz çizgi', deger: program.baz_cizgi ? `donduruldu ${tarih(program.baz_cizgi_tarih)}` : 'açık' },
    ],
    birincilEylem: B.btn('Programa dön', { rota: `/is-programlari/${program.id}/wbs` }),
  })}
${kilit ? '' : B.form({
    rota: `/is-programlari/${program.id}/aktiviteler/yeni`, csrf: csrfAlani(ctx), hatalar: hata,
    idempotencyAnahtari: kimlik('idempotency'),
    bolumler: [
      { baslik: 'Aktivite kimliği',
        aciklama: 'Aktivite bir WBS düğümüne bağlıdır; ağırlığı o düğümün içinde %100 tamamlamalıdır.',
        alanlar: h`
          ${B.alan({ ad: 'aktiviteKodu', etiket: 'Aktivite kodu', zorunlu: true,
            deger: deger.aktiviteKodu || '', hata: hata?.alanlar?.aktiviteKodu })}
          ${B.alan({ ad: 'aktiviteAdi', etiket: 'Aktivite adı', zorunlu: true, genis: true,
            deger: deger.aktiviteAdi || '', hata: hata?.alanlar?.aktiviteAdi })}
          ${B.alan({ ad: 'wbsId', etiket: 'WBS düğümü', zorunlu: true, deger: deger.wbsId || '',
            hata: hata?.alanlar?.wbsId,
            secenekler: [{ deger: '', etiket: 'Seçin…' },
              ...dugumler.map((d) => ({ deger: d.id, etiket: `${d.kod} — ${d.ad}` }))] })}
          ${B.alan({ ad: 'aktiviteAgirligi', etiket: 'Ağırlık (%)', deger: deger.aktiviteAgirligi || '',
            hata: hata?.alanlar?.aktiviteAgirligi, ipucu: 'Bağlı olduğu WBS düğümü içindeki payı.' })}` },
      { baslik: 'Ölçüm ve takvim',
        aciklama: 'İlerleme ölçüm yöntemi sonradan değişmez; kümülatif ilerleme bu yönteme göre yorumlanır.',
        alanlar: h`
          ${B.alan({ ad: 'yontem', etiket: 'Ölçüm yöntemi', deger: deger.yontem || 'miktar', secenekler: YONTEMLER })}
          ${B.alan({ ad: 'birim', etiket: 'Birim', deger: deger.birim || '', ipucu: 'Örn. m3, m2, ton' })}
          ${B.alan({ ad: 'planlananMiktar', etiket: 'Planlanan miktar', deger: deger.planlananMiktar || '' })}
          ${B.alan({ ad: 'aktiviteBaslangic', etiket: 'Planlanan başlangıç', tur: 'date',
            deger: deger.aktiviteBaslangic || '' })}
          ${B.alan({ ad: 'aktiviteBitis', etiket: 'Planlanan bitiş', tur: 'date', deger: deger.aktiviteBitis || '' })}
          ${B.alan({ ad: 'aktiviteSorumlusu', etiket: 'Sorumlu', deger: deger.aktiviteSorumlusu || '',
            secenekler: [{ deger: '', etiket: 'Seçin…' },
              ...sorgu(`SELECT id, ad_soyad FROM kullanici WHERE tenant_id = ? AND durum = 'aktif' ORDER BY ad_soyad`,
                ctx.tenant.id).map((k) => ({ deger: k.id, etiket: k.ad_soyad }))] })}` },
    ],
    eylemler: h`${B.btn('Vazgeç', { rota: `/is-programlari/${program.id}/wbs` })}
      ${B.btn('Aktiviteyi ekle', { tur: 'acc', gonder: true, ikon: 'fa-plus' })}`,
  })}`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: program.kod, baslik: program.ad }));
}

/* ==========================================================================
   PLAN-07 — Program revizyonu (yeni sürüm; önceki sürüm DEĞİŞMEZ)
   ========================================================================== */
/** Onaylı programın yeni sürümünü açar; WBS ve aktiviteler kopyalanır. */
function revizyonAc(ctx, program, govde) {
  if (!program.baz_cizgi) {
    throw GecisIzinsiz('Yalnız baz çizgisi dondurulmuş program revize edilir. '
      + 'Baz çizgi öncesi düzenleme WBS ekranından yapılır.');
  }
  const gerekce = String(govde.gerekce || '').trim();
  if (!gerekce) {
    throw DogrulamaHatasi('Revizyon gerekçesi zorunludur.',
      { alanlar: { gerekce: ['Neden yeni sürüm açıldığını yazın.'] } });
  }
  const acikRevizyon = tek(
    `SELECT * FROM is_programi WHERE tenant_id = ? AND kod = ? AND durum <> 'iptal' AND baz_cizgi = 0`,
    ctx.tenant.id, program.kod);
  if (acikRevizyon) {
    throw Cakisma(`Bu programın ${acikRevizyon.surum_no}. sürümü hâlâ açık; önce onu sonuçlandırın.`);
  }

  return islem(() => {
    const enBuyuk = Number(tek(
      'SELECT MAX(surum_no) AS n FROM is_programi WHERE tenant_id = ? AND kod = ?',
      ctx.tenant.id, program.kod)?.n ?? program.surum_no);
    const yeniId = kimlik('plan');
    calistir(`INSERT INTO is_programi (id, tenant_id, proje_id, santiye_id, kod, ad, surum_no, baz_cizgi,
                calisma_gunleri, baslangic, bitis, durum, onceki_surum_id, revizyon_gerekcesi,
                olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,0,?,?,?, 'taslak', ?,?,?,?)`,
      yeniId, ctx.tenant.id, program.proje_id, program.santiye_id, program.kod, program.ad,
      enBuyuk + 1, program.calisma_gunleri,
      govde.baslangic ? gunBaslangici(govde.baslangic) : program.baslangic,
      govde.bitis ? gunBaslangici(govde.bitis) : program.bitis,
      program.id, gerekce, ctx.kullanici.id, simdi());

    /* WBS ağacı kopyalanır; üst-alt bağı yeni kimliklerle yeniden kurulur. */
    const harita = new Map();
    const dugumler = sorgu('SELECT * FROM wbs WHERE program_id = ? ORDER BY seviye, kod', program.id);
    for (const d of dugumler) {
      const id = kimlik('wbs');
      harita.set(d.id, id);
      calistir(`INSERT INTO wbs (id, tenant_id, program_id, ust_id, kod, ad, agirlik, seviye,
                  sorumlu_id, maliyet_kodu, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        id, ctx.tenant.id, yeniId, d.ust_id ? harita.get(d.ust_id) : null, d.kod, d.ad,
        d.agirlik, d.seviye, d.sorumlu_id, d.maliyet_kodu, ctx.kullanici.id, simdi());
    }
    const aktiviteler = sorgu('SELECT * FROM aktivite WHERE program_id = ? ORDER BY kod', program.id);
    for (const a of aktiviteler) {
      calistir(`INSERT INTO aktivite (id, tenant_id, program_id, wbs_id, kod, ad, yontem, birim,
                  planlanan_miktar, agirlik, baslangic, bitis, sure_gun, onculler, sorumlu_id,
                  olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        kimlik('aktivite'), ctx.tenant.id, yeniId, harita.get(a.wbs_id), a.kod, a.ad, a.yontem,
        a.birim, a.planlanan_miktar, a.agirlik, a.baslangic, a.bitis, a.sure_gun, a.onculler,
        a.sorumlu_id, ctx.kullanici.id, simdi());
    }

    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'is_programi', nesneId: yeniId, eylem: 'revizyon_acildi', gerekce,
      onceki: { kaynakSurum: program.surum_no, kaynakId: program.id },
      sonraki: { surumNo: enBuyuk + 1, wbs: dugumler.length, aktivite: aktiviteler.length } });
    return { id: yeniId, surum_no: enBuyuk + 1 };
  });
}

function revizyonSayfasi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('PLAN-07');
  yetkiZorunlu(ctx, e.yetki);
  const program = kaydiAl(ctx, 'is_programi', 'is_programi', id);
  const surumler = sorgu(
    `SELECT * FROM is_programi WHERE tenant_id = ? AND kod = ? ORDER BY surum_no DESC`,
    ctx.tenant.id, program.kod);
  const acikRevizyon = surumler.find((p) => !p.baz_cizgi && p.durum !== 'iptal');
  const acilabilir = !!program.baz_cizgi && !acikRevizyon;

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${B.detayOzetSeridi({
    kod: program.kod, baslik: `${program.ad} — revizyon`, durum: program.durum, surum: program.surum_no,
    bilgiler: [
      { etiket: 'Baz çizgi', deger: program.baz_cizgi ? tarih(program.baz_cizgi_tarih) : 'yok' },
      { etiket: 'Sürüm sayısı', deger: sayi(surumler.length) },
      { etiket: 'Onaylı ilerleme', deger: yuzdeMetni(programIlerlemesi(program.id)) },
    ],
    birincilEylem: B.btn('Programa dön', { rota: `/is-programlari/${program.id}` }),
  })}
<div class="dash-cols">
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>Sürüm geçmişi</b>
      <span>Onaylı sürüm yerinde değiştirilmez; revizyon YENİ sürüm açar (kural 6).</span></div></div>
    <div class="gc-body flush">${B.tablo({
    satirlar: surumler,
    satirRota: (r) => `/is-programlari/${r.id}`,
    bosDurum: { baslik: 'Sürüm yok' },
    sutunlar: [
      { ad: 'surum_no', etiket: 'Sürüm', govde: (r) => h`<b>${r.surum_no}</b>${
        r.id === program.id ? h` ${B.isaret('görüntülenen', 'info')}` : ''}` },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
      { ad: 'baz_cizgi', etiket: 'Baz çizgi', govde: (r) => (r.baz_cizgi
        ? B.isaret(tarih(r.baz_cizgi_tarih), 'ok') : h`<span class="muted">açık</span>`) },
      { ad: 'ilerleme', etiket: 'Onaylı ilerleme', hizala: 'sag',
        govde: (r) => yuzdeMetni(programIlerlemesi(r.id)) },
      { ad: 'revizyon_gerekcesi', etiket: 'Revizyon gerekçesi', govde: (r) => r.revizyon_gerekcesi || '—' },
    ],
  })}</div>
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Yeni sürüm aç</b>
        <span>WBS ve aktiviteler kopyalanır; ilerleme kayıtları eski sürümde kalır.</span></div></div>
      <div class="gc-body">
        ${!program.baz_cizgi ? B.sonucSeridi({ tur: 'warn', baslik: 'Bu sürümün baz çizgisi yok',
    aciklama: 'Revizyon yalnız dondurulmuş baz çizgi üzerinden açılır; bu sürüm hâlâ düzenlenebilir.' }) : ''}
        ${acikRevizyon ? B.sonucSeridi({ tur: 'warn', baslik: `Sürüm ${acikRevizyon.surum_no} açık`,
    aciklama: 'Aynı anda birden fazla açık revizyon olamaz.',
    kayitRota: `/is-programlari/${acikRevizyon.id}` }) : ''}
        ${acilabilir && yetkiVar(ctx, 'PLAN-07:karar_ver') ? h`
        <form method="post" action="/is-programlari/${program.id}/revizyon" data-gform="1">
          ${ham(csrfAlani(ctx))}
          ${B.alan({ ad: 'gerekce', etiket: 'Revizyon gerekçesi', tur: 'metin', zorunlu: true,
    ipucu: 'Değişiklik emri, süre uzatımı veya kapsam değişikliği referansı.' })}
          ${B.alan({ ad: 'baslangic', etiket: 'Yeni başlangıç', tur: 'date',
    deger: program.baslangic ? gunAnahtari(program.baslangic) : '' })}
          ${B.alan({ ad: 'bitis', etiket: 'Yeni bitiş', tur: 'date',
    deger: program.bitis ? gunAnahtari(program.bitis) : '' })}
          <div style="margin-top:12px">${B.btn('Revizyon sürümü aç',
    { tur: 'acc', gonder: true, ikon: 'fa-code-branch' })}</div>
        </form>` : ''}
      </div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: program.kod, baslik: program.ad }));
}

/* ==========================================================================
   PLAN-08 — Haftalık look-ahead
   ========================================================================== */
const HAFTA_MS = 7 * 86_400_000;

function lookAheadGorevi(ctx, program, govde) {
  const a = tek('SELECT * FROM aktivite WHERE id = ? AND program_id = ?', govde.aktiviteId, program.id);
  if (!a) throw DogrulamaHatasi('Aktivite bulunamadı.');
  const mevcut = tek(
    `SELECT * FROM gorev WHERE tenant_id = ? AND kaynak_nesne = 'aktivite' AND kaynak_id = ?
       AND durum NOT IN ('tamamlandi','iptal')`, ctx.tenant.id, a.id);
  if (mevcut) throw Cakisma(`Bu aktivite için açık görev zaten var: ${mevcut.kod}.`);
  /* Görev TASLAK açılır; durumu ve sorumluyu kullanıcı burada seçmez. */
  const kayit = kayitOlustur(ctx, { tablo: 'gorev', nesne: 'gorev', kodNesnesi: 'gorev',
    alanlar: { id: kimlik('gorev'), baslik: `${a.kod} — ${a.ad}`,
      aciklama: `Look-ahead penceresinde planlanan aktivite (${program.kod} s.${program.surum_no}).`,
      proje_id: program.proje_id, santiye_id: program.santiye_id,
      termin: a.bitis, oncelik: 'normal', durum: 'taslak',
      kaynak_nesne: 'aktivite', kaynak_id: a.id } });
  return `${kayit.kod} görevi açıldı (${a.kod})`;
}

function lookAheadSayfasi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('PLAN-08');
  yetkiZorunlu(ctx, e.yetki);
  const program = kaydiAl(ctx, 'is_programi', 'is_programi', id);
  const hafta = Math.min(12, Math.max(1, Number(ctx.sorgu.get('hafta')) || 6));
  const baslangicGun = ctx.sorgu.get('baslangic') || gunAnahtari(simdi());
  const bas = gunBaslangici(baslangicGun);
  const son = bas + hafta * HAFTA_MS;

  const aktiviteler = sorgu(
    `SELECT a.*, w.kod AS wbs_kod, w.ad AS wbs_ad FROM aktivite a
       JOIN wbs w ON w.id = a.wbs_id
      WHERE a.program_id = ? AND a.baslangic IS NOT NULL
        AND a.baslangic < ? AND (a.bitis IS NULL OR a.bitis >= ?)
      ORDER BY a.baslangic, a.kod`, program.id, son, bas);

  /* Haftalık kolonlar — pencere sunucuda hesaplanır, istemci takvim kurmaz. */
  const haftalar = Array.from({ length: hafta }, (_, i) => ({
    no: i + 1, bas: bas + i * HAFTA_MS, son: bas + (i + 1) * HAFTA_MS,
  }));

  const satirlar = aktiviteler.map((a) => {
    const gorev = tek(
      `SELECT kod, id, durum FROM gorev WHERE tenant_id = ? AND kaynak_nesne = 'aktivite' AND kaynak_id = ?
        ORDER BY olusturuldu DESC LIMIT 1`, ctx.tenant.id, a.id);
    return { ...a, ilerleme: aktiviteIlerlemesi(a.id), gorev };
  });

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.detayOzetSeridi({
    kod: program.kod, baslik: `${program.ad} — look-ahead`, durum: program.durum, surum: program.surum_no,
    bilgiler: [
      { etiket: 'Pencere', deger: `${hafta} hafta` },
      { etiket: 'Aralık', deger: `${tarih(bas)} → ${tarih(son)}` },
      { etiket: 'Penceredeki aktivite', deger: sayi(aktiviteler.length) },
    ],
    birincilEylem: B.btn('Programa dön', { rota: `/is-programlari/${program.id}` }),
  })}
${B.filtreBari({ rota: `/is-programlari/${program.id}/look-ahead`, sorgu: ctx.sorgu, aramaYer: 'Aktivite ara…',
    filtreler: [{ ad: 'hafta', etiket: 'Pencere',
      secenekler: [3, 4, 6, 8, 12].map((n) => ({ deger: String(n), etiket: `${n} hafta` })) }] })}
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Haftalık plan penceresi</b>
    <span>Pencerede başlayan/süren aktiviteler; kısıt yerine gerçek görev açılır (§7 bağ).</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar,
    bosDurum: { baslik: 'Bu pencerede aktivite yok', ikon: 'fa-calendar-week',
      aciklama: 'Aktivitelere planlanan başlangıç/bitiş tarihi girildiğinde burada görünür.' },
    sutunlar: [
      { ad: 'kod', etiket: 'Aktivite', govde: (r) => h`<b>${r.kod}</b><br><span class="muted">${r.ad}</span>` },
      { ad: 'wbs_kod', etiket: 'WBS', govde: (r) => h`${r.wbs_kod}<br><span class="muted">${r.wbs_ad}</span>` },
      { ad: 'takvim', etiket: 'Planlanan', govde: (r) => h`${r.baslangic ? tarih(r.baslangic) : '—'} →
        ${r.bitis ? tarih(r.bitis) : '—'}` },
      ...haftalar.map((w) => ({ ad: `h${w.no}`, etiket: `H${w.no}`, hizala: 'sag',
        govde: (r) => ((r.baslangic ?? 0) < w.son && (r.bitis ?? Number.MAX_SAFE_INTEGER) >= w.bas
          ? B.isaret('●', r.bitis && r.bitis < simdi() && r.ilerleme < 100_000 ? 'danger' : 'ok')
          : h`<span class="muted">·</span>`) })),
      { ad: 'ilerleme', etiket: 'Onaylı', hizala: 'sag', govde: (r) => yuzdeMetni(r.ilerleme) },
      { ad: 'gorev', etiket: 'Görev', govde: (r) => (r.gorev
        ? h`<a href="/gorevler/${r.gorev.id}">${r.gorev.kod}</a><br><span class="muted">${r.gorev.durum}</span>`
        : (yetkiVar(ctx, 'PLAN-08:olustur')
          ? h`<form method="post" action="/is-programlari/${program.id}/look-ahead" style="display:inline">
              ${ham(csrfAlani(ctx))}
              <input type="hidden" name="aktiviteId" value="${r.id}">
              <button class="btn btn-ghost btn-sm" type="submit">Görev aç</button></form>`
          : '—')) },
    ],
  })}</div>
</div>
${B.veriTarihi(simdi())}`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: program.kod, baslik: program.ad }));
}

/* ==========================================================================
   PLAN-10 — İlerleme doğrulama
   ========================================================================== */
function ilerlemeDogrulaSayfasi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('PLAN-10');
  yetkiZorunlu(ctx, e.yetki);
  const kayit = kaydiAl(ctx, 'ilerleme', 'ilerleme', id);
  const aktivite = tek('SELECT * FROM aktivite WHERE id = ?', kayit.aktivite_id);
  const program = tek('SELECT * FROM is_programi WHERE id = ?', kayit.program_id);
  const oncekiOnayli = aktiviteIlerlemesi(kayit.aktivite_id, { onayliSadece: true });
  const kendisi = kayit.olusturan === ctx.kullanici.id;
  const karar = ctx.sorgu.get('karar');
  const kararVerilebilir = ['taslak', 'onaya_gonderildi'].includes(kayit.durum) && !kendisi
    && yetkiVar(ctx, 'PLAN-10:karar_ver');

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${karar ? B.sonucSeridi({ tur: karar === 'onaylandi' ? 'ok' : 'warn',
    baslik: karar === 'onaylandi' ? 'İlerleme doğrulandı' : 'İlerleme reddedildi',
    aciklama: 'Karar denetim izine yazıldı; yalnız onaylı ilerleme proje yüzdesine katılır.' }) : ''}
${B.detayOzetSeridi({
    kod: aktivite?.kod || '—', baslik: aktivite?.ad || 'İlerleme kaydı', durum: kayit.durum, surum: kayit.surum,
    bilgiler: [
      { etiket: 'Program', deger: h`<a href="/is-programlari/${program?.id}">${program?.ad || '—'}</a>` },
      { etiket: 'Dönem', deger: kayit.donem },
      { etiket: 'Bildirilen kümülatif', deger: yuzdeMetni(kayit.yuzde_binde) },
      { etiket: 'Önceki onaylı', deger: yuzdeMetni(oncekiOnayli) },
      { etiket: 'Giren', deger: kullaniciAdi(kayit.olusturan) },
      { etiket: 'Doğrulayan', deger: kayit.dogrulayan ? kullaniciAdi(kayit.dogrulayan) : '—' },
    ],
    birincilEylem: program ? B.btn('Programa dön',
      { rota: `/is-programlari/${program.id}?sekme=ilerleme` }) : null,
  })}
<div class="dash-cols">
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>Kanıt ve açıklama</b>
      <span>Kanıtsız ilerleme kaydı açılamaz; doğrulama kanıt üzerinden yapılır.</span></div></div>
    <div class="gc-body">
      <dl class="gd-grid" style="border-top:0;padding-top:0;margin-top:0">
        <div><dt>Kanıt</dt><dd>${kayit.kanit || '—'}</dd></div>
        <div><dt>Gerçekleşen miktar</dt><dd>${kayit.miktar || '—'}</dd></div>
        <div><dt>Planlanan miktar</dt><dd>${aktivite?.planlanan_miktar || '—'} ${aktivite?.birim || ''}</dd></div>
        <div><dt>Açıklama</dt><dd>${kayit.aciklama || '—'}</dd></div>
      </dl>
    </div>
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Doğrulama kararı</b>
        <span>Kendi girdiğiniz ilerlemeyi doğrulayamazsınız (dört göz).</span></div></div>
      <div class="gc-body">
        ${kendisi ? B.sonucSeridi({ tur: 'warn', baslik: 'Bu kaydı siz girdiniz',
    aciklama: 'Doğrulamayı başka bir yetkili yapmalıdır.' }) : ''}
        ${!['taslak', 'onaya_gonderildi'].includes(kayit.durum)
    ? B.sonucSeridi({ tur: 'ok', baslik: `Kayıt "${kayit.durum}"`,
      aciklama: 'Karara bağlanmış ilerleme yeniden doğrulanmaz; düzeltme yeni kayıtla yapılır.' }) : ''}
        ${kararVerilebilir ? h`
        <form method="post" action="/ilerleme/${kayit.id}/dogrula" data-gform="1">
          ${ham(csrfAlani(ctx))}
          ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe', tur: 'metin',
    ipucu: 'Ret kararında gerekçe zorunludur.' })}
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
            <button class="btn btn-acc" type="submit" name="karar" value="onayla">
              Doğrula <span class="muted">→ onaylandı</span></button>
            <button class="btn btn-danger" type="submit" name="karar" value="reddet">
              Reddet <span class="muted">→ reddedildi</span></button>
          </div>
        </form>` : ''}
      </div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: aktivite?.kod, baslik: aktivite?.ad || 'İlerleme' }));
}

/* ==========================================================================
   PLAN-12 — Program içe/dışa aktarımı (CSV, sıfır bağımlılık)
   ========================================================================== */
const CSV_BASLIK = 'tip;kod;ad;ust_kod;agirlik_yuzde;yontem;birim;planlanan_miktar;baslangic;bitis';

const csvKacir = (v) => {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function csvSatirAyristir(satir) {
  const alanlar = []; let mevcut = ''; let tirnak = false;
  for (let i = 0; i < satir.length; i++) {
    const c = satir[i];
    if (tirnak) {
      if (c === '"' && satir[i + 1] === '"') { mevcut += '"'; i++; }
      else if (c === '"') tirnak = false;
      else mevcut += c;
    } else if (c === '"') tirnak = true;
    else if (c === ';') { alanlar.push(mevcut); mevcut = ''; }
    else mevcut += c;
  }
  alanlar.push(mevcut);
  return alanlar.map((a) => a.trim());
}

function programCsvDisaAktar(ctx, id) {
  const e = ekranNesnesi('PLAN-12');
  yetkiZorunlu(ctx, `${e.kod}:goruntule`);
  const program = kaydiAl(ctx, 'is_programi', 'is_programi', id);
  const dugumler = sorgu('SELECT * FROM wbs WHERE program_id = ? ORDER BY seviye, kod', program.id);
  const ustKodu = new Map(dugumler.map((d) => [d.id, d.kod]));
  const aktiviteler = sorgu('SELECT * FROM aktivite WHERE program_id = ? ORDER BY kod', program.id);

  const satirlar = [CSV_BASLIK];
  for (const d of dugumler) {
    satirlar.push(['wbs', d.kod, d.ad, d.ust_id ? ustKodu.get(d.ust_id) : '',
      (d.agirlik / 100).toFixed(2), '', '', '', '', ''].map(csvKacir).join(';'));
  }
  for (const a of aktiviteler) {
    satirlar.push(['aktivite', a.kod, a.ad, ustKodu.get(a.wbs_id) || '',
      (a.agirlik / 100).toFixed(2), a.yontem, a.birim || '', a.planlanan_miktar || '',
      a.baslangic ? gunAnahtari(a.baslangic) : '', a.bitis ? gunAnahtari(a.bitis) : '']
      .map(csvKacir).join(';'));
  }
  /* Çıktı künyesi: hangi sürüm, hangi veri tarihi (kural 9 ile aynı ilke). */
  const kunye = `# ${program.kod} · sürüm ${program.surum_no} · baz çizgi: `
    + `${program.baz_cizgi ? tarih(program.baz_cizgi_tarih) : 'yok'} · veri tarihi: ${tarih(simdi())}`;
  islem(() => audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId,
    ip: ctx.ip, nesne: 'is_programi', nesneId: program.id, eylem: 'disa_aktarildi',
    sonraki: { bicim: 'csv', wbs: dugumler.length, aktivite: aktiviteler.length } }));
  return yanitla(ctx, 200, `${kunye}\n${satirlar.join('\n')}\n`, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${program.kod}-s${program.surum_no}.csv"`,
  });
}

/** İçe aktarımın KURU ÇALIŞTIRMASI: hiçbir şey yazmaz, satır satır sonuç üretir. */
function csvOnizle(ctx, program, metin) {
  bazCizgiKilidi(program);
  const satirlar = String(metin || '').split(/\r?\n/)
    .map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
  if (!satirlar.length) {
    throw DogrulamaHatasi('İçe aktarılacak satır bulunamadı.', { alanlar: { csv: ['CSV içeriği boş.'] } });
  }
  if (satirlar[0].toLowerCase().startsWith('tip;')) satirlar.shift();

  const mevcutWbs = new Map(sorgu('SELECT kod, id FROM wbs WHERE program_id = ?', program.id)
    .map((d) => [d.kod, d.id]));
  const mevcutAkt = new Set(sorgu('SELECT kod FROM aktivite WHERE program_id = ?', program.id).map((a) => a.kod));
  const yeniWbs = new Set();
  const sonuc = [];

  satirlar.forEach((satir, i) => {
    const a = csvSatirAyristir(satir);
    const [tip, kod, ad, ustKod, agirlik, yontem, birim, miktar, bas, bit] = a;
    const satirNo = i + 1;
    const hata = (m) => sonuc.push({ satirNo, tip, kod, ad, sonuc: 'hata', not: m });

    if (!['wbs', 'aktivite'].includes(tip)) return hata(`Bilinmeyen tip: "${tip}". "wbs" veya "aktivite" olmalı.`);
    if (!kod) return hata('Kod boş olamaz.');
    if (!ad) return hata('Ad boş olamaz.');
    let agirlikBinde = 0;
    try { agirlikBinde = agirlikAyristir(agirlik); } catch { return hata('Ağırlık 0-100 arası olmalı.'); }

    if (tip === 'wbs') {
      if (mevcutWbs.has(kod) || yeniWbs.has(kod)) return hata(`WBS kodu zaten var: ${kod}`);
      if (ustKod && !mevcutWbs.has(ustKod) && !yeniWbs.has(ustKod)) {
        return hata(`Üst WBS bulunamadı: ${ustKod} (üst düğüm kendinden önce gelmeli).`);
      }
      yeniWbs.add(kod);
      return sonuc.push({ satirNo, tip, kod, ad, ustKod, agirlikBinde, sonuc: 'eklenecek', not: '—' });
    }
    if (mevcutAkt.has(kod)) return hata(`Aktivite kodu zaten var: ${kod}`);
    if (!ustKod) return hata('Aktivite için WBS kodu (ust_kod) zorunlu.');
    if (!mevcutWbs.has(ustKod) && !yeniWbs.has(ustKod)) return hata(`WBS düğümü bulunamadı: ${ustKod}`);
    if (yontem && !YONTEMLER.some((v) => v.deger === yontem)) return hata(`Geçersiz yöntem: ${yontem}`);
    mevcutAkt.add(kod);
    return sonuc.push({ satirNo, tip, kod, ad, ustKod, agirlikBinde,
      yontem: yontem || 'miktar', birim, miktar, bas, bit, sonuc: 'eklenecek', not: '—' });
  });

  return { satirlar: sonuc, hataliSayisi: sonuc.filter((r) => r.sonuc === 'hata').length };
}

/** Uygulama: ÖNİZLEMEDE tek bir hata varsa hiçbir satır yazılmaz (hep ya da hiç). */
function csvUygula(ctx, program, onizleme) {
  bazCizgiKilidi(program);
  if (onizleme.hataliSayisi > 0) {
    throw DogrulamaHatasi(
      `${onizleme.hataliSayisi} satır hatalı; içe aktarım kısmi uygulanmaz. Hataları düzeltip yeniden deneyin.`);
  }
  return islem(() => {
    const kodMap = new Map(sorgu('SELECT kod, id, seviye FROM wbs WHERE program_id = ?', program.id)
      .map((d) => [d.kod, { id: d.id, seviye: d.seviye }]));
    let w = 0; let a = 0;
    for (const r of onizleme.satirlar) {
      if (r.tip !== 'wbs') continue;
      const ust = r.ustKod ? kodMap.get(r.ustKod) : null;
      const id = kimlik('wbs');
      calistir(`INSERT INTO wbs (id, tenant_id, program_id, ust_id, kod, ad, agirlik, seviye, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?,?,?)`,
        id, ctx.tenant.id, program.id, ust?.id || null, r.kod, r.ad, r.agirlikBinde,
        ust ? ust.seviye + 1 : 1, ctx.kullanici.id, simdi());
      kodMap.set(r.kod, { id, seviye: ust ? ust.seviye + 1 : 1 });
      w++;
    }
    for (const r of onizleme.satirlar) {
      if (r.tip !== 'aktivite') continue;
      calistir(`INSERT INTO aktivite (id, tenant_id, program_id, wbs_id, kod, ad, yontem, birim,
                  planlanan_miktar, agirlik, baslangic, bitis, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        kimlik('aktivite'), ctx.tenant.id, program.id, kodMap.get(r.ustKod).id, r.kod, r.ad,
        r.yontem || 'miktar', r.birim || null, r.miktar || null, r.agirlikBinde,
        r.bas ? gunBaslangici(r.bas) : null, r.bit ? gunBaslangici(r.bit) : null,
        ctx.kullanici.id, simdi());
      a++;
    }
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'is_programi', nesneId: program.id, eylem: 'ice_aktarildi',
      sonraki: { bicim: 'csv', wbs: w, aktivite: a } });
    return { wbs: w, aktivite: a };
  });
}

function aktarimSayfasi(ctx, id, { hata = null, durum = 200, onizleme = null, girdi = '' } = {}) {
  const e = ekranNesnesi('PLAN-12');
  yetkiZorunlu(ctx, e.yetki);
  const { program, dugumler, aktiviteler, dogrulama } = programVerisi(ctx, id);
  const iceSonuc = ctx.sorgu.get('ice');
  const kilitli = program.baz_cizgi || ['onaya_gonderildi', 'incelemede'].includes(program.durum);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${iceSonuc ? B.sonucSeridi({ tur: 'ok', baslik: 'İçe aktarım tamamlandı',
    aciklama: `${iceSonuc.split('_')[0]} WBS düğümü, ${iceSonuc.split('_')[1]} aktivite eklendi.` }) : ''}
${B.detayOzetSeridi({
    kod: program.kod, baslik: `${program.ad} — içe/dışa aktarım`, durum: program.durum, surum: program.surum_no,
    bilgiler: [
      { etiket: 'WBS düğümü', deger: sayi(dugumler.length) },
      { etiket: 'Aktivite', deger: sayi(aktiviteler.length) },
      { etiket: 'Ağırlık', deger: dogrulama.gecerli ? 'geçerli (%100)' : 'geçersiz' },
    ],
    birincilEylem: B.btn('CSV dışa aktar',
      { tur: 'acc', rota: `/is-programlari/${program.id}/aktarim?disa=csv`, ikon: 'fa-file-csv' }),
    digerEylemler: B.btn('Programa dön', { rota: `/is-programlari/${program.id}` }),
  })}
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Biçim</b>
    <span>Noktalı virgülle ayrılmış; başlık satırı ve <code>#</code> ile başlayan künye satırı yok sayılır.</span></div></div>
  <div class="gc-body">
    <pre style="overflow-x:auto;font-size:12px;line-height:1.7;margin:0">${CSV_BASLIK}
wbs;01;Kaba yapı;;40,00;;;;;
wbs;01.01;Betonarme;01;60,00;;;;;
aktivite;A-101;Temel betonu;01.01;50,00;miktar;m3;1200;2026-09-01;2026-09-20</pre>
    <p class="gf-hint" style="margin-top:10px">Üst WBS düğümü dosyada kendinden <b>önce</b> gelmelidir.
      Ağırlık, bağlı olduğu düğüm içindeki yüzdedir.</p>
  </div>
</div>
${kilitli ? B.sonucSeridi({ tur: 'warn', baslik: 'İçe aktarım kapalı',
    aciklama: program.baz_cizgi
      ? 'Baz çizgi dondurulmuş; içe aktarım ancak yeni revizyon sürümünde yapılır (kural 6).'
      : 'Program onayda; karar verilene kadar değiştirilemez.' })
  : yetkiVar(ctx, 'PLAN-12:olustur') ? h`
<form method="post" action="/is-programlari/${program.id}/aktarim" data-gform="1">
  ${ham(csrfAlani(ctx))}
  <div class="gv-card" style="margin-bottom:18px">
    <div class="gc-head"><div class="gc-title"><b>CSV içe aktar</b>
      <span>Önce KURU ÇALIŞTIRMA yapılır; tek satır hatalıysa hiçbir satır yazılmaz.</span></div></div>
    <div class="gc-body">
      ${B.alan({ ad: 'csv', etiket: 'CSV içeriği', tur: 'metin', genis: true, deger: girdi || '',
    hata: hata?.alanlar?.csv })}
      <div style="display:flex;gap:8px;margin-top:12px">
        ${B.btn('Önizle (hiçbir şey yazmaz)', { gonder: true, ikon: 'fa-magnifying-glass' })}
        ${onizleme && onizleme.hataliSayisi === 0
    ? h`<button class="btn btn-acc" type="submit" name="_eylem" value="uygula">
        <i class="fa-solid fa-file-import"></i> ${onizleme.satirlar.length} satırı uygula</button>` : ''}
      </div>
    </div>
  </div>
</form>` : ''}
${onizleme ? h`
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Önizleme sonucu</b>
    <span>${onizleme.hataliSayisi ? `${onizleme.hataliSayisi} satır hatalı — uygulama kapalı.`
    : 'Tüm satırlar geçerli.'}</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: onizleme.satirlar,
    bosDurum: { baslik: 'Satır yok' },
    sutunlar: [
      { ad: 'satirNo', etiket: 'Satır', hizala: 'sag' },
      { ad: 'tip', etiket: 'Tip' },
      { ad: 'kod', etiket: 'Kod', govde: (r) => h`<b>${r.kod || '—'}</b>` },
      { ad: 'ad', etiket: 'Ad', govde: (r) => r.ad || '—' },
      { ad: 'sonuc', etiket: 'Sonuç', govde: (r) => (r.sonuc === 'hata'
        ? B.isaret('hata', 'danger') : B.isaret('eklenecek', 'ok')) },
      { ad: 'not', etiket: 'Açıklama' },
    ],
  })}</div>
</div>` : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: program.kod, baslik: program.ad }));
}
