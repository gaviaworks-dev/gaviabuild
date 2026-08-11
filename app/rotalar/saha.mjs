/* ============================================================================
   SAHA ROTALARI — SITE-06..11, TASK-01..03, HSE-02/03/06, QLT-05..07
   ----------------------------------------------------------------------------
   SITE-01 kabul: günlük şantiye raporu çevrimdışı taslaktan senkron olur;
   ÇİFT GÖNDERİMDE TEK KAYIT oluşur (istemci_kimligi + benzersiz kısıt).
   QLT-01 kabul: NCR kapatma, DÖF tamamlandı VE yetkili etkinlik doğrulaması
   yapılmadan mümkün değildir.
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, tarihSaat, gunAnahtari, gunBaslangici, GUN_MS } from '../cekirdek/zaman.mjs';
import { UygulamaHatasi, DogrulamaHatasi, GecisIzinsiz, Cakisma, Bulunamadi } from '../cekirdek/hata.mjs';
import { idempotent } from '../cekirdek/idempotency.mjs';
import { bildir } from '../moduller/isakisi/bildirim.mjs';
import {
  ekranNesnesi, hataNesnesi, kullaniciAdi, ciz, listeSorgusu, filtreKosullari,
  kayitOlustur, kaydiAl, gecisFormu, gecisIsle, ozetSeridi,
  B, h, ham, sayi, csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar,
  sorgu, tek, calistir, islem, surumluGuncelle, audit,
} from './ortak.mjs';

const santiyeler = (ctx) => sorgu(
  `SELECT id, kod, ad FROM santiye WHERE tenant_id = ? AND durum NOT IN ('kapali','arsiv') ORDER BY ad`, ctx.tenant.id)
  .map((s) => ({ deger: s.id, etiket: `${s.kod} — ${s.ad}` }));
const kullanicilar = (ctx) => sorgu(
  `SELECT id, ad_soyad FROM kullanici WHERE tenant_id = ? AND durum = 'aktif' ORDER BY ad_soyad`, ctx.tenant.id)
  .map((k) => ({ deger: k.id, etiket: k.ad_soyad }));

const HAVA = ['açık', 'parçalı bulutlu', 'yağmurlu', 'karlı', 'fırtınalı', 'sisli']
  .map((x) => ({ deger: x, etiket: x }));
const CALISMA = [{ deger: 'tam', etiket: 'Tam gün çalışıldı' }, { deger: 'kismi', etiket: 'Kısmi çalışma' },
  { deger: 'durdu', etiket: 'Çalışma durdu' }];

export function kur(y, ekranRota) {
  /* ============ SITE-06 Günlük şantiye raporları (liste) ================ */
  ekranRota(y, 'SITE-06', {
    get: (ctx, _g, params) => {
      const e = ekranNesnesi('SITE-06');
      yetkiZorunlu(ctx, e.yetki);
      const santiye = kaydiAl(ctx, 'santiye', 'santiye', params.id);
      const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
      const toplam = Number(tek('SELECT COUNT(*) AS n FROM gunluk_rapor WHERE santiye_id = ?', santiye.id)?.n ?? 0);
      const satirlar = sorgu(
        'SELECT * FROM gunluk_rapor WHERE santiye_id = ? ORDER BY rapor_gunu DESC LIMIT ? OFFSET ?',
        santiye.id, boyut, atla);
      const bugun = gunAnahtari(simdi());
      const bugunVar = !!tek('SELECT id FROM gunluk_rapor WHERE santiye_id = ? AND rapor_gunu = ?', santiye.id, bugun);

      const icerik = h`
${!bugunVar ? B.sonucSeridi({ tur: 'warn', baslik: `Bugünün raporu (${tarih(simdi())}) girilmemiş`,
        aciklama: 'Günlük rapor, ilerleme ve hakediş kanıt zincirinin ilk halkasıdır.' }) : ''}
${B.listeDuzeni({
        kpi: B.kpiSeridi([
          { etiket: 'Toplam rapor', deger: sayi(toplam), ikon: 'fa-clipboard-list' },
          { etiket: 'Onaylı', deger: sayi(Number(tek(
            `SELECT COUNT(*) AS n FROM gunluk_rapor WHERE santiye_id = ? AND durum = 'onaylandi'`, santiye.id)?.n ?? 0)), ikon: 'fa-circle-check' },
          { etiket: 'Kilitli', deger: sayi(Number(tek(
            'SELECT COUNT(*) AS n FROM gunluk_rapor WHERE santiye_id = ? AND kilit = 1', santiye.id)?.n ?? 0)), ikon: 'fa-lock' },
        ]),
        icerik: B.tablo({
          satirlar,
          satirRota: (r) => `/gunluk-raporlar/${r.id}`,
          bosDurum: { baslik: 'Günlük rapor yok',
            aciklama: 'Hava, ekip, imalat, makine, ziyaretçi ve olay kaydı günlük tutulur.', ikon: 'fa-clipboard',
            eylem: B.btn('Bugünün raporunu gir', { tur: 'acc', rota: `/santiyeler/${santiye.id}/gunluk-raporlar/yeni`, ikon: 'fa-plus' }) },
          sutunlar: [
            { ad: 'rapor_gunu', etiket: 'Gün', govde: (r) => h`<a href="/gunluk-raporlar/${r.id}"><b>${r.rapor_gunu}</b></a>` },
            { ad: 'hava', etiket: 'Hava', govde: (r) => r.hava || '—' },
            { ad: 'calisma_durumu', etiket: 'Çalışma', govde: (r) => CALISMA.find((c) => c.deger === r.calisma_durumu)?.etiket || '—' },
            { ad: 'ekip_sayisi', etiket: 'Ekip', hizala: 'sag', govde: (r) => sayi(r.ekip_sayisi || 0) },
            { ad: 'durum', etiket: 'Durum', govde: (r) => h`${B.rozet(r.durum)}${r.kilit ? B.isaret('kilitli', 'nötr') : ''}` },
          ],
        }),
        sayfalayici: B.sayfalama({ rota: `/santiyeler/${santiye.id}/gunluk-raporlar`, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
        veriZamani: simdi(),
      })}`;
      return html(ctx, 200, ciz(ctx, e, icerik, {
        baslik: `${santiye.ad} — günlük raporlar`, kayitEtiketi: santiye.kod,
        eylemler: B.btn('Yeni günlük rapor', { tur: 'acc', rota: `/santiyeler/${santiye.id}/gunluk-raporlar/yeni`, ikon: 'fa-plus' }),
      }));
    },
  });

  /* ============ SITE-07 Yeni günlük rapor =============================== */
  ekranRota(y, 'SITE-07', {
    get: (ctx, _g, params) => {
      const e = ekranNesnesi('SITE-07');
      yetkiZorunlu(ctx, e.yetki);
      const santiye = kaydiAl(ctx, 'santiye', 'santiye', params.id);
      return html(ctx, 200, ciz(ctx, e, gunlukRaporFormu(ctx, santiye, {}), {
        baslik: `${santiye.ad} — yeni günlük rapor`, kayitEtiketi: santiye.kod,
      }));
    },
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('SITE-07');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      const santiye = kaydiAl(ctx, 'santiye', 'santiye', params.id);
      try {
        const sonuc = gunlukRaporKaydet(ctx, santiye, govde);
        return yonlendir(ctx, `/gunluk-raporlar/${sonuc.id}?olusan=${sonuc.mevcuttu ? 'mevcut' : '1'}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, ciz(ctx, e, gunlukRaporFormu(ctx, santiye, { deger: govde, hata: hataNesnesi(err) })));
      }
    },
  });

  /* ============ SITE-08 Günlük rapor detayı ============================= */
  ekranRota(y, 'SITE-08', {
    get: (ctx, _g, params) => gunlukRaporDetayi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('SITE-08');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      const kayit = kaydiAl(ctx, 'gunluk_rapor', 'gunluk_rapor', params.id);
      try {
        if (kayit.kilit) throw GecisIzinsiz('Rapor kilitli; değiştirilemez.');
        gecisIsle(ctx, { nesne: 'gunluk_rapor', tablo: 'gunluk_rapor', kayit, govde, ekranKodu: 'SITE-08' });
        return yonlendir(ctx, `/gunluk-raporlar/${params.id}?gecis=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return gunlukRaporDetayi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ============ SITE-09..11 Saha bildirimleri =========================== */
  ekranRota(y, 'SITE-09', {
    get: (ctx) => {
      const e = ekranNesnesi('SITE-09');
      yetkiZorunlu(ctx, e.yetki);
      const { kosullar, parametreler } = filtreKosullari(ctx, {
        aramaAlanlari: ['baslik', 'kod'], filtreler: [{ ad: 'tur' }, { ad: 'durum' }, { ad: 'onem' }],
      });
      const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
        { tablo: 'saha_bildirimi', kosullar, parametreler, sirala: 'olusturuldu DESC' });
      const icerik = B.listeDuzeni({
        kpi: B.kpiSeridi([
          { etiket: 'Açık bildirim', deger: sayi(Number(tek(
            `SELECT COUNT(*) AS n FROM saha_bildirimi WHERE tenant_id = ? AND durum NOT IN ('kapali','iptal')`,
            ctx.tenant.id)?.n ?? 0)), ikon: 'fa-bullhorn' },
          { etiket: 'SLA aşan', deger: sayi(Number(tek(
            `SELECT COUNT(*) AS n FROM saha_bildirimi WHERE tenant_id = ? AND sla_bitis < ?
              AND durum NOT IN ('kapali','iptal')`, ctx.tenant.id, simdi())?.n ?? 0)), ikon: 'fa-hourglass-end', ton: 'warn' },
          { etiket: 'Kritik', deger: sayi(Number(tek(
            `SELECT COUNT(*) AS n FROM saha_bildirimi WHERE tenant_id = ? AND onem = 'kritik'
              AND durum NOT IN ('kapali','iptal')`, ctx.tenant.id)?.n ?? 0)), ikon: 'fa-triangle-exclamation', ton: 'danger' },
        ]),
        filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Bildirim başlığı veya kodu…',
          filtreler: [
            { ad: 'tur', etiket: 'Tür', secenekler: ['isg', 'kalite', 'teknik', 'lojistik', 'cevre', 'diger'].map((t) => ({ deger: t, etiket: t })) },
            { ad: 'onem', etiket: 'Önem', secenekler: ['bilgi', 'uyari', 'kritik'].map((t) => ({ deger: t, etiket: t })) },
            { ad: 'durum', etiket: 'Durum', secenekler: ['yeni', 'siniflandirildi', 'atandi', 'islemde', 'dogrulamada', 'kapali'].map((t) => ({ deger: t, etiket: t })) },
          ] }),
        icerik: B.tablo({
          satirlar,
          satirRota: (r) => `/saha-bildirimleri/${r.id}`,
          bosDurum: { baslik: 'Saha bildirimi yok', ikon: 'fa-bullhorn',
            eylem: B.btn('Yeni bildirim', { tur: 'acc', rota: '/saha-bildirimleri/yeni', ikon: 'fa-plus' }) },
          sutunlar: [
            { ad: 'kod', etiket: 'Kod' },
            { ad: 'baslik', etiket: 'Bildirim', govde: (r) => h`<a href="/saha-bildirimleri/${r.id}"><b>${r.baslik}</b></a>` },
            { ad: 'tur', etiket: 'Tür' },
            { ad: 'onem', etiket: 'Önem', govde: (r) => B.isaret(r.onem, r.onem === 'kritik' ? 'danger' : r.onem === 'uyari' ? 'warn' : 'info') },
            { ad: 'sla_bitis', etiket: 'SLA', govde: (r) => !r.sla_bitis ? '—'
              : r.sla_bitis < simdi() && !['kapali', 'iptal'].includes(r.durum) ? B.isaret('aşıldı', 'danger') : tarih(r.sla_bitis) },
            { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
          ],
        }),
        sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
        veriZamani: simdi(),
      });
      return html(ctx, 200, ciz(ctx, e, icerik, {
        eylemler: B.btn('Yeni bildirim', { tur: 'acc', rota: '/saha-bildirimleri/yeni', ikon: 'fa-plus' }),
      }));
    },
  });

  ekranRota(y, 'SITE-10', {
    get: (ctx) => {
      const e = ekranNesnesi('SITE-10');
      yetkiZorunlu(ctx, e.yetki);
      return html(ctx, 200, ciz(ctx, e, sahaBildirimFormu(ctx, {})));
    },
    post: (ctx, govde) => {
      const e = ekranNesnesi('SITE-10');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const hatalar = {};
        const baslik = String(govde.baslik || '').trim();
        if (!baslik) hatalar.baslik = ['Başlık girin.'];
        if (!govde.santiyeId) hatalar.santiyeId = ['Şantiye seçin.'];
        if (!govde.tur) hatalar.tur = ['Bildirim türü seçin.'];
        if (Object.keys(hatalar).length) throw DogrulamaHatasi('Bildirim eksik.', { alanlar: hatalar });
        const santiye = kaydiAl(ctx, 'santiye', 'santiye', govde.santiyeId);
        const onem = govde.onem || 'bilgi';
        /* SLA önem derecesinden türer; kullanıcı serbestçe belirlemez. */
        const slaGun = onem === 'kritik' ? 1 : onem === 'uyari' ? 3 : 7;

        const sonuc = idempotent({ anahtar: govde._idempotency, tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, govde },
          () => islem(() => {
            const kayit = kayitOlustur(ctx, { tablo: 'saha_bildirimi', nesne: 'saha_bildirimi', kodNesnesi: 'saha_bildirimi',
              alanlar: { id: kimlik('isg').replace('hse', 'shb'), santiye_id: santiye.id, proje_id: santiye.proje_id,
                tur: govde.tur, baslik, aciklama: govde.aciklama || null, konum: govde.konum || null,
                onem, sla_bitis: simdi() + slaGun * GUN_MS, durum: 'yeni' } });
            /* Tür bazlı yönlendirme (doküman §7): İSG bildirimi İSG rolüne düşer. */
            if (govde.tur === 'isg' || onem === 'kritik') {
              for (const k of sorgu(`SELECT id FROM kullanici WHERE tenant_id = ? AND durum = 'aktif'
                                       AND id IN (SELECT kullanici_id FROM kullanici_rol kr JOIN rol r ON r.id = kr.rol_id
                                                   WHERE r.kod IN ('proje_muduru','santiye_sefi'))`, ctx.tenant.id)) {
                bildir(ctx, { kullaniciId: k.id, tur: 'saha_bildirimi',
                  baslik: onem === 'kritik' ? 'Kritik saha bildirimi' : 'Yeni İSG bildirimi',
                  govde: baslik, nesne: 'saha_bildirimi', nesneId: kayit.id,
                  rota: `/saha-bildirimleri/${kayit.id}`, onem: onem === 'kritik' ? 'kritik' : 'uyari' });
              }
            }
            return kayit;
          }));
        return yonlendir(ctx, `/saha-bildirimleri/${sonuc.id}?olusan=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, ciz(ctx, e, sahaBildirimFormu(ctx, { deger: govde, hata: hataNesnesi(err) })));
      }
    },
  });

  ekranRota(y, 'SITE-11', {
    get: (ctx, _g, params) => sahaBildirimDetayi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('SITE-11');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      const kayit = kaydiAl(ctx, 'saha_bildirimi', 'saha_bildirimi', params.id);
      try {
        if (govde._eylem === 'ata') {
          csrfZorunlu(ctx, govde);
          if (!govde.sorumluId) throw DogrulamaHatasi('Sorumlu seçin.', { alanlar: { sorumluId: ['Sorumlu zorunlu.'] } });
          islem(() => {
            surumluGuncelle('saha_bildirimi', kayit.id, kayit.surum, { sorumlu_id: govde.sorumluId },
              { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
            audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
              nesne: 'saha_bildirimi', nesneId: kayit.id, eylem: 'sorumlu_atandi',
              sonraki: { sorumlu: govde.sorumluId } });
          });
          return yonlendir(ctx, `/saha-bildirimleri/${params.id}?atandi=1`);
        }
        gecisIsle(ctx, { nesne: 'sahaBildirimi', tablo: 'saha_bildirimi', kayit, govde, ekranKodu: 'SITE-11' });
        return yonlendir(ctx, `/saha-bildirimleri/${params.id}?gecis=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return sahaBildirimDetayi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ============ QLT-05..07 NCR ve DÖF =================================== */
  ekranRota(y, 'QLT-05', {
    get: (ctx) => {
      const e = ekranNesnesi('QLT-05');
      yetkiZorunlu(ctx, e.yetki);
      const { kosullar, parametreler } = filtreKosullari(ctx, {
        aramaAlanlari: ['baslik', 'kod'], filtreler: [{ ad: 'durum' }, { ad: 'onem' }],
      });
      const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
        { tablo: 'ncr', kosullar, parametreler, sirala: 'olusturuldu DESC' });
      const yaslandirma = (r) => Math.floor((simdi() - r.olusturuldu) / GUN_MS);

      const icerik = B.listeDuzeni({
        kpi: B.kpiSeridi([
          { etiket: 'Açık NCR', deger: sayi(Number(tek(
            `SELECT COUNT(*) AS n FROM ncr WHERE tenant_id = ? AND durum NOT IN ('kapali','iptal')`, ctx.tenant.id)?.n ?? 0)), ikon: 'fa-clipboard-check' },
          { etiket: 'DÖF bekleyen', deger: sayi(Number(tek(
            `SELECT COUNT(*) AS n FROM ncr WHERE tenant_id = ? AND dof_tamamlandi IS NULL
              AND durum NOT IN ('kapali','iptal')`, ctx.tenant.id)?.n ?? 0)), ikon: 'fa-screwdriver-wrench' },
          { etiket: 'Doğrulama bekleyen', deger: sayi(Number(tek(
            `SELECT COUNT(*) AS n FROM ncr WHERE tenant_id = ? AND dof_tamamlandi IS NOT NULL
              AND etkinlik_dogrulandi IS NULL AND durum NOT IN ('kapali','iptal')`, ctx.tenant.id)?.n ?? 0)), ikon: 'fa-magnifying-glass-chart' },
          { etiket: 'Karantinalı', deger: sayi(Number(tek(
            `SELECT COUNT(*) AS n FROM ncr WHERE tenant_id = ? AND karantina = 1
              AND durum NOT IN ('kapali','iptal')`, ctx.tenant.id)?.n ?? 0)), ikon: 'fa-ban', ton: 'danger' },
        ]),
        filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'NCR başlığı veya kodu…',
          filtreler: [{ ad: 'durum', etiket: 'Durum', secenekler: ['yeni', 'atandi', 'islemde', 'dogrulamada', 'kapali'].map((t) => ({ deger: t, etiket: t })) },
            { ad: 'onem', etiket: 'Önem', secenekler: ['bilgi', 'uyari', 'kritik'].map((t) => ({ deger: t, etiket: t })) }] }),
        icerik: B.tablo({
          satirlar,
          satirRota: (r) => `/kalite/ncr/${r.id}`,
          bosDurum: { baslik: 'Uygunsuzluk kaydı yok', ikon: 'fa-clipboard-check',
            eylem: B.btn('Yeni NCR', { tur: 'acc', rota: '/kalite/ncr/yeni', ikon: 'fa-plus' }) },
          sutunlar: [
            { ad: 'kod', etiket: 'Kod' },
            { ad: 'baslik', etiket: 'Uygunsuzluk', govde: (r) => h`<a href="/kalite/ncr/${r.id}"><b>${r.baslik}</b></a>` },
            { ad: 'yas', etiket: 'Yaşlandırma', hizala: 'sag', govde: (r) => {
              const g = yaslandirma(r);
              return ['kapali', 'iptal'].includes(r.durum) ? `${g} gün`
                : B.isaret(`${g} gün`, g > 30 ? 'danger' : g > 14 ? 'warn' : 'nötr');
            } },
            { ad: 'dof', etiket: 'DÖF', govde: (r) => r.dof_tamamlandi ? B.rozet('tamamlandi', 'Tamam') : B.rozet('beklemede', 'Bekliyor') },
            { ad: 'etkinlik', etiket: 'Etkinlik', govde: (r) => r.etkinlik_dogrulandi ? B.rozet('onaylandi', 'Doğrulandı') : B.rozet('beklemede', 'Bekliyor') },
            { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
          ],
        }),
        sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
        veriZamani: simdi(),
      });
      return html(ctx, 200, ciz(ctx, e, icerik, {
        eylemler: B.btn('Yeni NCR', { tur: 'acc', rota: '/kalite/ncr/yeni', ikon: 'fa-plus' }),
      }));
    },
  });

  ekranRota(y, 'QLT-06', {
    get: (ctx) => {
      const e = ekranNesnesi('QLT-06');
      yetkiZorunlu(ctx, e.yetki);
      return html(ctx, 200, ciz(ctx, e, ncrFormu(ctx, {})));
    },
    post: (ctx, govde) => {
      const e = ekranNesnesi('QLT-06');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const hatalar = {};
        for (const [alan, etiket] of [['baslik', 'Başlık'], ['gereklilik', 'Gereklilik'], ['bulgu', 'Bulgu']]) {
          if (!String(govde[alan] || '').trim()) hatalar[alan] = [`${etiket} girin.`];
        }
        if (Object.keys(hatalar).length) throw DogrulamaHatasi('NCR bilgileri eksik.', { alanlar: hatalar });
        const santiye = govde.santiyeId ? kaydiAl(ctx, 'santiye', 'santiye', govde.santiyeId) : null;
        const sonuc = idempotent({ anahtar: govde._idempotency, tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, govde },
          () => kayitOlustur(ctx, { tablo: 'ncr', nesne: 'ncr', kodNesnesi: 'ncr',
            alanlar: { id: kimlik('kalite').replace('qlt', 'ncr'),
              santiye_id: santiye?.id || null, proje_id: santiye?.proje_id || null,
              baslik: govde.baslik.trim(), gereklilik: govde.gereklilik.trim(), bulgu: govde.bulgu.trim(),
              etki: govde.etki || null, karantina: govde.karantina === '1' ? 1 : 0,
              onem: govde.onem || 'uyari', sorumlu_id: govde.sorumluId || null,
              termin: govde.termin ? gunBaslangici(govde.termin) : null, durum: 'yeni' } }));
        return yonlendir(ctx, `/kalite/ncr/${sonuc.id}?olusan=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, ciz(ctx, e, ncrFormu(ctx, { deger: govde, hata: hataNesnesi(err) })));
      }
    },
  });

  ekranRota(y, 'QLT-07', {
    get: (ctx, _g, params) => ncrDetayi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('QLT-07');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      const kayit = kaydiAl(ctx, 'ncr', 'ncr', params.id);
      try {
        csrfZorunlu(ctx, govde);
        if (govde._eylem === 'kok_neden') return ncrKokNeden(ctx, kayit, govde);
        if (govde._eylem === 'dof_tamamla') return ncrDofTamamla(ctx, kayit, govde);
        if (govde._eylem === 'etkinlik') return ncrEtkinlikDogrula(ctx, kayit, govde);
        if (govde._eylem === 'gecis') {
          /* QLT-01 KABUL: kapatma yalnız DÖF + etkinlik doğrulaması varsa. */
          if (govde.gecis === 'kapat') ncrKapanisKontrolu(kayit);
          gecisIsle(ctx, { nesne: 'sahaBildirimi', tablo: 'ncr', kayit, govde, ekranKodu: 'QLT-07' });
          return yonlendir(ctx, `/kalite/ncr/${params.id}?gecis=1`);
        }
        throw DogrulamaHatasi('Tanımsız işlem.');
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return ncrDetayi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ============ TASK-01..03 Görevler ==================================== */
  ekranRota(y, 'TASK-01', {
    get: (ctx) => {
      const e = ekranNesnesi('TASK-01');
      yetkiZorunlu(ctx, e.yetki);
      const { kosullar, parametreler } = filtreKosullari(ctx, {
        aramaAlanlari: ['baslik', 'kod'], filtreler: [{ ad: 'durum' }, { ad: 'oncelik' }],
      });
      const f = ctx.sorgu.get('f');
      if (f === 'bana') { kosullar.push('sorumlu_id = ?'); parametreler.push(ctx.kullanici.id); }
      if (f === 'havuz') kosullar.push('sorumlu_id IS NULL');
      const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
        { tablo: 'gorev', kosullar, parametreler, sirala: 'termin IS NULL, termin ASC' });

      const icerik = B.listeDuzeni({
        kpi: B.kpiSeridi([
          { etiket: 'Bana atanan açık', deger: sayi(Number(tek(
            `SELECT COUNT(*) AS n FROM gorev WHERE tenant_id = ? AND sorumlu_id = ?
              AND durum NOT IN ('tamamlandi','iptal')`, ctx.tenant.id, ctx.kullanici.id)?.n ?? 0)), ikon: 'fa-user-check' },
          { etiket: 'Havuzda', deger: sayi(Number(tek(
            `SELECT COUNT(*) AS n FROM gorev WHERE tenant_id = ? AND sorumlu_id IS NULL
              AND durum NOT IN ('tamamlandi','iptal')`, ctx.tenant.id)?.n ?? 0)), ikon: 'fa-inbox' },
          /* "Gecikmiş" DURUM DEĞİL: termin ile hesaplanır (§5.2). */
          { etiket: 'Gecikmiş', deger: sayi(Number(tek(
            `SELECT COUNT(*) AS n FROM gorev WHERE tenant_id = ? AND termin < ?
              AND durum NOT IN ('tamamlandi','iptal')`, ctx.tenant.id, simdi())?.n ?? 0)), ikon: 'fa-hourglass-end', ton: 'danger' },
          { etiket: 'Bloke', deger: sayi(Number(tek(
            `SELECT COUNT(*) AS n FROM gorev WHERE tenant_id = ? AND bloke = 1
              AND durum NOT IN ('tamamlandi','iptal')`, ctx.tenant.id)?.n ?? 0)), ikon: 'fa-ban' },
        ]),
        filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Görev başlığı veya kodu…',
          filtreler: [
            { ad: 'durum', etiket: 'Yaşam durumu', secenekler: ['taslak', 'atama_bekliyor', 'acik', 'devam_ediyor', 'dogrulamada', 'tamamlandi'].map((t) => ({ deger: t, etiket: t })) },
            { ad: 'oncelik', etiket: 'Öncelik', secenekler: ['dusuk', 'normal', 'yuksek', 'kritik'].map((t) => ({ deger: t, etiket: t })) },
          ] }),
        icerik: B.tablo({
          satirlar,
          satirRota: (r) => `/gorevler/${r.id}`,
          bosDurum: { baslik: 'Görev yok', ikon: 'fa-list-check',
            eylem: B.btn('Yeni görev', { tur: 'acc', rota: '/gorevler/yeni', ikon: 'fa-plus' }) },
          sutunlar: [
            { ad: 'kod', etiket: 'Kod' },
            { ad: 'baslik', etiket: 'Görev', govde: (r) => h`<a href="/gorevler/${r.id}"><b>${r.baslik}</b></a>` },
            { ad: 'sorumlu_id', etiket: 'Sorumlu', govde: (r) => (r.sorumlu_id ? kullaniciAdi(r.sorumlu_id) : B.isaret('havuzda', 'info')) },
            { ad: 'termin', etiket: 'Termin', govde: (r) => !r.termin ? '—' : tarih(r.termin) },
            /* Yaşam durumu ve hesaplanan gecikme AYRI sütunlarda (doküman TASK-01 amacı). */
            { ad: 'isaret', etiket: 'İşaret', govde: (r) => {
              const parcalar = [];
              if (r.termin && r.termin < simdi() && !['tamamlandi', 'iptal'].includes(r.durum)) parcalar.push(B.isaret('gecikmiş', 'danger'));
              if (r.bloke) parcalar.push(B.isaret('bloke', 'danger'));
              return parcalar.length ? h`${parcalar}` : '—';
            } },
            { ad: 'durum', etiket: 'Yaşam durumu', govde: (r) => B.rozet(r.durum) },
          ],
        }),
        sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
        veriZamani: simdi(),
      });
      return html(ctx, 200, ciz(ctx, e, icerik, {
        eylemler: B.btn('Yeni görev', { tur: 'acc', rota: '/gorevler/yeni', ikon: 'fa-plus' }),
      }));
    },
  });

  ekranRota(y, 'TASK-02', {
    get: (ctx) => {
      const e = ekranNesnesi('TASK-02');
      yetkiZorunlu(ctx, e.yetki);
      return html(ctx, 200, ciz(ctx, e, gorevFormu(ctx, {})));
    },
    post: (ctx, govde) => {
      const e = ekranNesnesi('TASK-02');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const baslik = String(govde.baslik || '').trim();
        if (!baslik) throw DogrulamaHatasi('Görev başlığı zorunludur.', { alanlar: { baslik: ['Başlık girin.'] } });
        const santiye = govde.santiyeId ? kaydiAl(ctx, 'santiye', 'santiye', govde.santiyeId) : null;
        const sonuc = idempotent({ anahtar: govde._idempotency, tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, govde },
          () => islem(() => {
            const kayit = kayitOlustur(ctx, { tablo: 'gorev', nesne: 'gorev', kodNesnesi: 'gorev',
              alanlar: { id: kimlik('gorev'), baslik, aciklama: govde.aciklama || null,
                santiye_id: santiye?.id || null, proje_id: santiye?.proje_id || govde.projeId || null,
                sorumlu_id: govde.sorumluId || null, oncelik: govde.oncelik || 'normal',
                termin: govde.termin ? gunBaslangici(govde.termin) : null,
                /* Durum SEÇTİRİLMEZ: sorumlu varsa "açık", yoksa "atama bekliyor". */
                durum: govde.sorumluId ? 'acik' : 'atama_bekliyor' } });
            if (govde.sorumluId && govde.sorumluId !== ctx.kullanici.id) {
              bildir(ctx, { kullaniciId: govde.sorumluId, tur: 'gorev_atandi',
                baslik: 'Size görev atandı', govde: baslik, nesne: 'gorev', nesneId: kayit.id,
                rota: `/gorevler/${kayit.id}` });
            }
            return kayit;
          }));
        return yonlendir(ctx, `/gorevler/${sonuc.id}?olusan=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, ciz(ctx, e, gorevFormu(ctx, { deger: govde, hata: hataNesnesi(err) })));
      }
    },
  });

  ekranRota(y, 'TASK-03', {
    get: (ctx, _g, params) => gorevDetayi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('TASK-03');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      const kayit = kaydiAl(ctx, 'gorev', 'gorev', params.id);
      try {
        csrfZorunlu(ctx, govde);
        if (govde._eylem === 'yorum') {
          const metin = String(govde.metin || '').trim();
          if (!metin) throw DogrulamaHatasi('Yorum boş olamaz.', { alanlar: { metin: ['Yorum girin.'] } });
          islem(() => {
            calistir(`INSERT INTO gorev_yorumu (id, gorev_id, kullanici_id, metin, olusturuldu) VALUES (?,?,?,?,?)`,
              kimlik('gorev').replace('tsk', 'yrm'), kayit.id, ctx.kullanici.id, metin, simdi());
            audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
              nesne: 'gorev', nesneId: kayit.id, eylem: 'yorum_ekle' });
          });
          return yonlendir(ctx, `/gorevler/${params.id}?yorum=1`);
        }
        if (govde._eylem === 'ustlen') {
          if (kayit.sorumlu_id) throw Cakisma('Görev başkasına atanmış.');
          islem(() => {
            surumluGuncelle('gorev', kayit.id, Number(govde.surum), { sorumlu_id: ctx.kullanici.id },
              { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
            audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
              nesne: 'gorev', nesneId: kayit.id, eylem: 'ustlen', sonraki: { sorumlu: ctx.kullanici.id } });
          });
          return yonlendir(ctx, `/gorevler/${params.id}?ustlenildi=1`);
        }
        gecisIsle(ctx, { nesne: 'gorev', tablo: 'gorev', kayit, govde, ekranKodu: 'TASK-03' });
        return yonlendir(ctx, `/gorevler/${params.id}?gecis=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return gorevDetayi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ============ HSE-02, HSE-03, HSE-06 ================================== */
  ekranRota(y, 'HSE-02', {
    get: (ctx) => {
      const e = ekranNesnesi('HSE-02');
      yetkiZorunlu(ctx, e.yetki);
      const { kosullar, parametreler } = filtreKosullari(ctx, {
        aramaAlanlari: ['baslik', 'kod'], filtreler: [{ ad: 'tur' }, { ad: 'durum' }],
      });
      const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
        { tablo: 'isg_olayi', kosullar, parametreler, sirala: 'olay_zamani DESC' });
      const icerik = B.listeDuzeni({
        kpi: B.kpiSeridi([
          { etiket: 'Kaza', deger: sayi(Number(tek(`SELECT COUNT(*) AS n FROM isg_olayi WHERE tenant_id = ? AND tur = 'kaza'`, ctx.tenant.id)?.n ?? 0)), ikon: 'fa-kit-medical', ton: 'danger' },
          { etiket: 'Ramak kala', deger: sayi(Number(tek(`SELECT COUNT(*) AS n FROM isg_olayi WHERE tenant_id = ? AND tur = 'ramak_kala'`, ctx.tenant.id)?.n ?? 0)), ikon: 'fa-triangle-exclamation' },
          { etiket: 'Kayıp gün', deger: sayi(Number(tek('SELECT COALESCE(SUM(kayip_gun),0) AS n FROM isg_olayi WHERE tenant_id = ?', ctx.tenant.id)?.n ?? 0)), ikon: 'fa-calendar-xmark' },
          { etiket: 'Açık', deger: sayi(Number(tek(`SELECT COUNT(*) AS n FROM isg_olayi WHERE tenant_id = ? AND durum NOT IN ('kapali','iptal')`, ctx.tenant.id)?.n ?? 0)), ikon: 'fa-folder-open' },
        ]),
        filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Olay başlığı veya kodu…',
          filtreler: [{ ad: 'tur', etiket: 'Tür', secenekler: [
            { deger: 'kaza', etiket: 'Kaza' }, { deger: 'ramak_kala', etiket: 'Ramak kala' },
            { deger: 'tehlike', etiket: 'Tehlikeli durum' }, { deger: 'cevre', etiket: 'Çevre' }] }] }),
        icerik: B.tablo({
          satirlar,
          satirRota: (r) => `/isg/olaylar/${r.id}`,
          bosDurum: { baslik: 'İSG olayı yok', aciklama: 'Kaza, ramak kala ve tehlikeli durum kayıtları burada toplanır.', ikon: 'fa-shield-heart' },
          sutunlar: [
            { ad: 'kod', etiket: 'Kod' },
            { ad: 'baslik', etiket: 'Olay', govde: (r) => h`<a href="/isg/olaylar/${r.id}"><b>${r.baslik}</b></a>` },
            { ad: 'tur', etiket: 'Tür' },
            { ad: 'olay_zamani', etiket: 'Zaman', govde: (r) => tarihSaat(r.olay_zamani) },
            { ad: 'kayip_gun', etiket: 'Kayıp gün', hizala: 'sag', govde: (r) => sayi(r.kayip_gun || 0) },
            { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
          ],
        }),
        sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
        veriZamani: simdi(),
      });
      return html(ctx, 200, ciz(ctx, e, icerik, {
        eylemler: h`${B.btn('Kaza bildir', { tur: 'danger', rota: '/isg/olaylar/kaza/yeni', ikon: 'fa-kit-medical' })}`,
      }));
    },
  });

  for (const [kod, tur, baslik] of [
    ['HSE-03', 'kaza', 'Kaza bildirimi'],
    ['HSE-04', 'ramak_kala', 'Ramak kala bildirimi'],
    ['HSE-05', 'tehlike', 'Tehlikeli durum/davranış bildirimi'],
  ]) {
    ekranRota(y, kod, {
      get: (ctx) => {
        const e = ekranNesnesi(kod);
        yetkiZorunlu(ctx, e.yetki);
        return html(ctx, 200, ciz(ctx, e, isgFormu(ctx, tur, baslik, {})));
      },
      post: (ctx, govde) => {
        const e = ekranNesnesi(kod);
        yetkiZorunlu(ctx, `${e.kod}:olustur`);
        csrfZorunlu(ctx, govde);
        try {
          const hatalar = {};
          if (!String(govde.baslik || '').trim()) hatalar.baslik = ['Başlık girin.'];
          if (!govde.olayZamani) hatalar.olayZamani = ['Olay zamanını girin.'];
          if (tur === 'kaza' && !String(govde.kisiAdi || '').trim()) hatalar.kisiAdi = ['Kazaya karışan kişiyi girin.'];
          if (Object.keys(hatalar).length) throw DogrulamaHatasi('Olay bilgileri eksik.', { alanlar: hatalar });
          const santiye = govde.santiyeId ? kaydiAl(ctx, 'santiye', 'santiye', govde.santiyeId) : null;

          const sonuc = idempotent({ anahtar: govde._idempotency, tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, govde },
            () => islem(() => {
              const kayit = kayitOlustur(ctx, { tablo: 'isg_olayi', nesne: 'isg_olayi', kodNesnesi: 'isg_olayi',
                alanlar: { id: kimlik('isg'), santiye_id: santiye?.id || null, proje_id: santiye?.proje_id || null,
                  tur, baslik: govde.baslik.trim(), olay_zamani: gunBaslangici(govde.olayZamani),
                  yer: govde.yer || null, anlatim: govde.anlatim || null,
                  kisi_adi: govde.kisiAdi || null, tedavi: govde.tedavi || null,
                  kayip_gun: govde.kayipGun ? Number(govde.kayipGun) : null,
                  onem: tur === 'kaza' ? 'kritik' : 'uyari', durum: 'yeni' } });
              /* Kaza her zaman yönetime bildirilir; önem derecesi kullanıcıya bırakılmaz. */
              for (const k of sorgu(`SELECT DISTINCT kr.kullanici_id AS id FROM kullanici_rol kr
                  JOIN rol r ON r.id = kr.rol_id WHERE kr.tenant_id = ?
                  AND r.kod IN ('proje_muduru','firma_sahibi')`, ctx.tenant.id)) {
                bildir(ctx, { kullaniciId: k.id, tur: 'isg_olayi',
                  baslik: tur === 'kaza' ? 'İş kazası bildirildi' : 'Yeni İSG olayı',
                  govde: govde.baslik, nesne: 'isg_olayi', nesneId: kayit.id,
                  rota: `/isg/olaylar/${kayit.id}`, onem: tur === 'kaza' ? 'kritik' : 'uyari' });
              }
              return kayit;
            }));
          return yonlendir(ctx, `/isg/olaylar/${sonuc.id}?olusan=1`);
        } catch (err) {
          if (!(err instanceof UygulamaHatasi)) throw err;
          return html(ctx, err.durum, ciz(ctx, e, isgFormu(ctx, tur, baslik, { deger: govde, hata: hataNesnesi(err) })));
        }
      },
    });
  }

  ekranRota(y, 'HSE-06', {
    get: (ctx, _g, params) => isgDetayi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('HSE-06');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      const kayit = kaydiAl(ctx, 'isg_olayi', 'isg_olayi', params.id);
      try {
        csrfZorunlu(ctx, govde);
        if (govde._eylem === 'arastirma') {
          islem(() => {
            surumluGuncelle('isg_olayi', kayit.id, Number(govde.surum),
              { kok_neden: govde.kokNeden || null, duzeltici_faaliyet: govde.duzelticiFaaliyet || null },
              { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
            audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
              nesne: 'isg_olayi', nesneId: kayit.id, eylem: 'arastirma_guncelle',
              sonraki: { kokNeden: govde.kokNeden, dof: govde.duzelticiFaaliyet } });
          });
          return yonlendir(ctx, `/isg/olaylar/${params.id}?arastirma=1`);
        }
        if (govde.gecis === 'kapat' && !kayit.etkinlik_dogrulandi) {
          throw GecisIzinsiz('Olay, kök neden ve düzeltici faaliyet etkinliği doğrulanmadan kapatılamaz.');
        }
        gecisIsle(ctx, { nesne: 'sahaBildirimi', tablo: 'isg_olayi', kayit, govde, ekranKodu: 'HSE-06' });
        return yonlendir(ctx, `/isg/olaylar/${params.id}?gecis=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return isgDetayi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });
}

/* ========================================================================== */
/* Günlük rapor                                                               */
/* ========================================================================== */
/**
 * SITE-01 KABUL — çevrimdışı taslaktan senkron, çift gönderimde TEK kayıt.
 * İki koruma katmanı:
 *   1) `istemci_kimligi` benzersiz: aynı taslak iki kez senkronlanırsa ikinci
 *      gönderim mevcut kaydı döndürür (yeni kayıt AÇILMAZ).
 *   2) `(santiye_id, rapor_gunu)` benzersiz: aynı gün için ikinci rapor olamaz.
 */
function gunlukRaporKaydet(ctx, santiye, govde) {
  const gun = String(govde.raporGunu || gunAnahtari(simdi()));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(gun)) {
    throw DogrulamaHatasi('Rapor günü geçersiz.', { alanlar: { raporGunu: ['YYYY-AA-GG biçiminde girin.'] } });
  }
  if (gunBaslangici(gun) > simdi() + GUN_MS) {
    throw DogrulamaHatasi('Gelecek tarihli rapor girilemez.', { alanlar: { raporGunu: ['Bugün veya geçmiş bir gün seçin.'] } });
  }
  const istemciKimligi = String(govde.istemciKimligi || '').trim() || null;

  if (istemciKimligi) {
    const mevcut = tek('SELECT * FROM gunluk_rapor WHERE tenant_id = ? AND istemci_kimligi = ?',
      ctx.tenant.id, istemciKimligi);
    if (mevcut) return { id: mevcut.id, mevcuttu: true };   // senkron tekrarı: yeni kayıt YOK
  }
  const ayniGun = tek('SELECT * FROM gunluk_rapor WHERE santiye_id = ? AND rapor_gunu = ?', santiye.id, gun);
  if (ayniGun) {
    throw Cakisma(`${gun} günü için bu şantiyede zaten bir rapor var (${ayniGun.kod}).`);
  }

  const sonuc = kayitOlustur(ctx, { tablo: 'gunluk_rapor', nesne: 'gunluk_rapor', kodNesnesi: 'gunluk_rapor',
    alanlar: { id: kimlik('rapor').replace('rpt', 'gnr'), santiye_id: santiye.id, proje_id: santiye.proje_id,
      rapor_gunu: gun, hava: govde.hava || null, sicaklik: govde.sicaklik || null,
      calisma_durumu: govde.calismaDurumu || null,
      ekip_sayisi: govde.ekipSayisi ? Number(govde.ekipSayisi) : null,
      taseron_sayisi: govde.taseronSayisi ? Number(govde.taseronSayisi) : null,
      imalat: govde.imalat || null, makine: govde.makine || null,
      ziyaretci: govde.ziyaretci || null, olay: govde.olay || null, notlar: govde.notlar || null,
      istemci_kimligi: istemciKimligi, durum: 'taslak' } });
  return { ...sonuc, mevcuttu: false };
}

function gunlukRaporFormu(ctx, santiye, { deger = {}, hata = null }) {
  return h`
<div class="gv-result gv-result-ok" style="background:var(--info-tint);border-color:rgba(59,111,212,.25)">
  <i class="fa-solid fa-cloud-arrow-up" style="color:var(--info)"></i>
  <div><b>Çevrimdışı taslak desteği</b>
    <span>Saha bağlantısı kesikse form tarayıcıda taslak olarak tutulur ve bağlantı gelince senkronlanır.
      Her taslak benzersiz bir istemci kimliği taşır: aynı taslak iki kez gönderilse bile <b>tek kayıt</b> oluşur.</span></div>
</div>
${B.form({
    rota: `/santiyeler/${santiye.id}/gunluk-raporlar/yeni`,
    csrf: csrfAlani(ctx),
    hatalar: hata,
    bolumler: [
      { baslik: 'Gün ve hava koşulları', alanlar: h`
        ${ham(`<input type="hidden" name="istemciKimligi" value="${deger.istemciKimligi || kimlik('rapor')}">`)}
        ${B.alan({ ad: 'raporGunu', etiket: 'Rapor günü', tur: 'date',
          deger: deger.raporGunu || gunAnahtari(simdi()), zorunlu: true, hata: hata?.alanlar?.raporGunu })}
        ${B.alan({ ad: 'hava', etiket: 'Hava', deger: deger.hava || '',
          secenekler: [{ deger: '', etiket: 'Seçin…' }, ...HAVA] })}
        ${B.alan({ ad: 'sicaklik', etiket: 'Sıcaklık (°C)', deger: deger.sicaklik || '' })}
        ${B.alan({ ad: 'calismaDurumu', etiket: 'Çalışma durumu', deger: deger.calismaDurumu || 'tam', secenekler: CALISMA })}` },
      { baslik: 'Ekip ve makine', alanlar: h`
        ${B.alan({ ad: 'ekipSayisi', etiket: 'Kendi ekip (kişi)', tur: 'number', deger: deger.ekipSayisi || '' })}
        ${B.alan({ ad: 'taseronSayisi', etiket: 'Taşeron (kişi)', tur: 'number', deger: deger.taseronSayisi || '' })}
        ${B.alan({ ad: 'makine', etiket: 'Çalışan makine ve ekipman', tur: 'metin', deger: deger.makine || '', genis: true })}` },
      { baslik: 'İmalat, ziyaretçi ve olaylar', alanlar: h`
        ${B.alan({ ad: 'imalat', etiket: 'Yapılan imalat', tur: 'metin', deger: deger.imalat || '', genis: true })}
        ${B.alan({ ad: 'ziyaretci', etiket: 'Ziyaretçiler', tur: 'metin', deger: deger.ziyaretci || '', genis: true })}
        ${B.alan({ ad: 'olay', etiket: 'Olay ve aksaklıklar', tur: 'metin', deger: deger.olay || '', genis: true })}
        ${B.alan({ ad: 'notlar', etiket: 'Notlar', tur: 'metin', deger: deger.notlar || '', genis: true })}` },
    ],
    ozet: h`<div class="gv-card"><div class="gc-body">
      <div class="gv-cap-sm">Şantiye</div>
      <dl class="gd-grid" style="margin-top:12px;padding-top:0;border-top:0">
        <div><dt>Kod</dt><dd>${santiye.kod}</dd></div>
        <div><dt>Şantiye</dt><dd>${santiye.ad}</dd></div>
        <div><dt>Şef</dt><dd>${kullaniciAdi(santiye.sef_id)}</dd></div>
      </dl>
      <p class="gf-hint" style="margin-top:14px">Rapor taslak açılır; onaydan sonra kilitlenir ve
        değiştirilemez — hakediş kanıt zincirinin parçasıdır.</p>
    </div></div>`,
    eylemler: h`${B.btn('Vazgeç', { rota: `/santiyeler/${santiye.id}/gunluk-raporlar` })}
      ${B.btn('Raporu kaydet', { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' })}`,
  })}`;
}

function gunlukRaporDetayi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('SITE-08');
  yetkiZorunlu(ctx, e.yetki);
  const r = kaydiAl(ctx, 'gunluk_rapor', 'gunluk_rapor', id);
  const santiye = tek('SELECT * FROM santiye WHERE id = ?', r.santiye_id);
  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('olusan') === 'mevcut' ? B.sonucSeridi({ tur: 'warn', baslik: 'Bu rapor zaten senkronlanmıştı',
    aciklama: 'Aynı çevrimdışı taslak ikinci kez gönderildi; yeni kayıt oluşturulmadı, mevcut kayıt açıldı.' })
  : ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: 'Günlük rapor kaydedildi' }) : ''}
${ctx.sorgu.get('gecis') ? B.sonucSeridi({ tur: 'ok', baslik: 'Durum güncellendi', aciklama: `Yeni durum: ${r.durum}` }) : ''}
${B.detayOzetSeridi({
    kod: r.kod, baslik: `${santiye?.ad || ''} — ${r.rapor_gunu}`,
    durum: r.durum, surum: r.surum,
    isaretler: r.kilit ? [{ metin: 'kilitli', ton: 'nötr' }] : [],
    bilgiler: [
      { etiket: 'Şantiye', deger: h`<a href="/santiyeler/${r.santiye_id}">${santiye?.ad || '—'}</a>` },
      { etiket: 'Hava', deger: r.hava || '—' },
      { etiket: 'Çalışma', deger: CALISMA.find((c) => c.deger === r.calisma_durumu)?.etiket || '—' },
      { etiket: 'Ekip', deger: `${sayi(r.ekip_sayisi || 0)} kendi + ${sayi(r.taseron_sayisi || 0)} taşeron` },
      { etiket: 'Girildi', deger: `${kullaniciAdi(r.olusturan)} · ${tarihSaat(r.olusturuldu)}` },
      { etiket: 'Senkron kimliği', deger: r.istemci_kimligi ? h`<code>${r.istemci_kimligi.slice(0, 16)}…</code>` : '—' },
    ],
  })}
<div class="dash-cols">
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>Gün kaydı</b></div></div>
    <div class="gc-body">
      <dl class="gd-grid" style="border-top:0;padding-top:0;margin-top:0">
        <div><dt>Yapılan imalat</dt><dd>${r.imalat || '—'}</dd></div>
        <div><dt>Makine ve ekipman</dt><dd>${r.makine || '—'}</dd></div>
        <div><dt>Ziyaretçiler</dt><dd>${r.ziyaretci || '—'}</dd></div>
        <div><dt>Olay ve aksaklıklar</dt><dd>${r.olay || '—'}</dd></div>
        <div><dt>Notlar</dt><dd>${r.notlar || '—'}</dd></div>
      </dl>
    </div>
  </div>
  <div class="gv-side-stack">
    ${r.kilit ? h`<div class="gv-card"><div class="gc-body">
      <div class="gv-cap-sm">Kilitli</div>
      <p style="margin-top:10px;font-size:13px;color:var(--muted)">Rapor onaylandı ve kilitlendi;
        değişiklik için revizyon kaydı açılır.</p></div></div>`
      : gecisFormu(ctx, { nesne: 'gunluk_rapor', kayit: r, rota: `/gunluk-raporlar/${r.id}`, ekranKodu: 'SITE-08' })}
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: r.kod, baslik: `Günlük rapor ${r.rapor_gunu}` }));
}

/* ========================================================================== */
/* NCR                                                                        */
/* ========================================================================== */
/** QLT-01 kapanış kapısı. */
function ncrKapanisKontrolu(kayit) {
  const eksikler = [];
  if (!kayit.kok_neden) eksikler.push('kök neden analizi');
  if (!kayit.dof_tamamlandi) eksikler.push('düzeltici faaliyet (DÖF) tamamlanması');
  if (!kayit.etkinlik_dogrulandi) eksikler.push('yetkili kişinin etkinlik doğrulaması');
  if (eksikler.length) {
    throw GecisIzinsiz(`NCR kapatılamaz. Eksik: ${eksikler.join(', ')}.`);
  }
}

function ncrKokNeden(ctx, kayit, govde) {
  if (!String(govde.kokNeden || '').trim()) {
    throw DogrulamaHatasi('Kök neden zorunludur.', { alanlar: { kokNeden: ['Kök neden analizi girin.'] } });
  }
  islem(() => {
    surumluGuncelle('ncr', kayit.id, Number(govde.surum),
      { kok_neden: govde.kokNeden.trim(), dof_tanimi: govde.dofTanimi || null },
      { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'ncr', nesneId: kayit.id, eylem: 'kok_neden_kaydedildi',
      sonraki: { kokNeden: govde.kokNeden, dofTanimi: govde.dofTanimi } });
  });
  return yonlendir(ctx, `/kalite/ncr/${kayit.id}?kokneden=1`);
}

function ncrDofTamamla(ctx, kayit, govde) {
  if (!kayit.dof_tanimi) {
    throw GecisIzinsiz('Önce düzeltici faaliyet tanımlanmalı (kök neden bölümünden).');
  }
  islem(() => {
    surumluGuncelle('ncr', kayit.id, Number(govde.surum),
      { dof_tamamlandi: simdi(), dof_tamamlayan: ctx.kullanici.id },
      { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'ncr', nesneId: kayit.id, eylem: 'dof_tamamlandi', gerekce: govde.gerekce || null });
  });
  return yonlendir(ctx, `/kalite/ncr/${kayit.id}?dof=1`);
}

/** Etkinlik doğrulaması DÖF'ü tamamlayandan FARKLI bir yetkili tarafından yapılır. */
function ncrEtkinlikDogrula(ctx, kayit, govde) {
  if (!kayit.dof_tamamlandi) {
    throw GecisIzinsiz('Düzeltici faaliyet tamamlanmadan etkinlik doğrulanamaz.');
  }
  if (kayit.dof_tamamlayan === ctx.kullanici.id) {
    throw DogrulamaHatasi('Düzeltici faaliyeti tamamlayan kişi etkinliğini kendisi doğrulayamaz (dört göz).');
  }
  if (!String(govde.etkinlikNotu || '').trim()) {
    throw DogrulamaHatasi('Doğrulama notu zorunludur.', { alanlar: { etkinlikNotu: ['Neyin doğrulandığını yazın.'] } });
  }
  islem(() => {
    surumluGuncelle('ncr', kayit.id, Number(govde.surum),
      { etkinlik_dogrulandi: simdi(), etkinlik_dogrulayan: ctx.kullanici.id, etkinlik_notu: govde.etkinlikNotu.trim() },
      { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'ncr', nesneId: kayit.id, eylem: 'etkinlik_dogrulandi', gerekce: govde.etkinlikNotu });
  });
  return yonlendir(ctx, `/kalite/ncr/${kayit.id}?etkinlik=1`);
}

function ncrFormu(ctx, { deger = {}, hata = null }) {
  return B.form({
    rota: '/kalite/ncr/yeni', csrf: csrfAlani(ctx), idempotencyAnahtari: kimlik('idempotency'), hatalar: hata,
    bolumler: [
      { baslik: 'Uygunsuzluk', aciklama: 'Gereklilik ve bulgu ayrı yazılır: neyin ihlal edildiği ve ne görüldüğü.',
        alanlar: h`
          ${B.alan({ ad: 'baslik', etiket: 'Başlık', deger: deger.baslik || '', zorunlu: true, hata: hata?.alanlar?.baslik, genis: true })}
          ${B.alan({ ad: 'gereklilik', etiket: 'Gereklilik (şartname/standart)', tur: 'metin',
            deger: deger.gereklilik || '', zorunlu: true, hata: hata?.alanlar?.gereklilik, genis: true })}
          ${B.alan({ ad: 'bulgu', etiket: 'Bulgu (sahada görülen)', tur: 'metin',
            deger: deger.bulgu || '', zorunlu: true, hata: hata?.alanlar?.bulgu, genis: true })}
          ${B.alan({ ad: 'etki', etiket: 'Etki', tur: 'metin', deger: deger.etki || '', genis: true })}` },
      { baslik: 'Sınıflandırma ve sorumluluk', alanlar: h`
          ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye', deger: deger.santiyeId || '',
            secenekler: [{ deger: '', etiket: 'Seçin…' }, ...santiyeler(ctx)] })}
          ${B.alan({ ad: 'onem', etiket: 'Önem', deger: deger.onem || 'uyari',
            secenekler: [{ deger: 'bilgi', etiket: 'Bilgi' }, { deger: 'uyari', etiket: 'Uyarı' }, { deger: 'kritik', etiket: 'Kritik' }] })}
          ${B.alan({ ad: 'sorumluId', etiket: 'Sorumlu', deger: deger.sorumluId || '',
            secenekler: [{ deger: '', etiket: 'Seçin…' }, ...kullanicilar(ctx)] })}
          ${B.alan({ ad: 'termin', etiket: 'Termin', tur: 'date', deger: deger.termin || '' })}
          ${B.alan({ ad: 'karantina', etiket: 'Karantina', deger: deger.karantina || '0',
            secenekler: [{ deger: '0', etiket: 'Hayır' }, { deger: '1', etiket: 'Evet — malzeme/imalat karantinada' }] })}` },
    ],
    ozet: h`<div class="gv-card"><div class="gc-body">
      <div class="gv-cap-sm">Kapanış koşulları</div>
      <ol style="margin:12px 0 0 18px;font-size:12.5px;line-height:1.85;color:var(--muted)">
        <li>Kök neden analizi</li><li>Düzeltici faaliyet (DÖF) tamamlanması</li>
        <li>Yetkili kişinin <b>etkinlik doğrulaması</b></li>
      </ol>
      <p class="gf-hint" style="margin-top:12px">Üçü tamamlanmadan NCR kapatılamaz (QLT-01).</p>
    </div></div>`,
    eylemler: h`${B.btn('Vazgeç', { rota: '/kalite/ncr' })}
      ${B.btn('NCR aç', { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' })}`,
  });
}

function ncrDetayi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('QLT-07');
  yetkiZorunlu(ctx, e.yetki);
  const n = kaydiAl(ctx, 'ncr', 'ncr', id);
  const kapanisEngeli = (() => { try { ncrKapanisKontrolu(n); return null; } catch (err) { return err.mesaj; } })();

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('kokneden') ? B.sonucSeridi({ tur: 'ok', baslik: 'Kök neden kaydedildi' }) : ''}
${ctx.sorgu.get('dof') ? B.sonucSeridi({ tur: 'ok', baslik: 'Düzeltici faaliyet tamamlandı olarak işaretlendi',
    aciklama: 'Etkinlik doğrulaması farklı bir yetkili tarafından yapılmalıdır.' }) : ''}
${ctx.sorgu.get('etkinlik') ? B.sonucSeridi({ tur: 'ok', baslik: 'Etkinlik doğrulandı', aciklama: 'NCR artık kapatılabilir.' }) : ''}
${ctx.sorgu.get('gecis') ? B.sonucSeridi({ tur: 'ok', baslik: 'Durum güncellendi', aciklama: `Yeni durum: ${n.durum}` }) : ''}
${ozetSeridi(ctx, {
    nesne: 'sahaBildirimi', kayit: n, baslik: n.baslik,
    bilgiler: [
      { etiket: 'Gereklilik', deger: n.gereklilik },
      { etiket: 'Bulgu', deger: n.bulgu },
      { etiket: 'Sorumlu', deger: kullaniciAdi(n.sorumlu_id) },
      { etiket: 'Termin', deger: n.termin ? tarih(n.termin) : '—' },
      { etiket: 'Karantina', deger: n.karantina ? 'Evet' : 'Hayır' },
      { etiket: 'Yaşlandırma', deger: `${Math.floor((simdi() - n.olusturuldu) / GUN_MS)} gün` },
    ],
  })}
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Kapanış kontrol zinciri</b>
    <span>Üç koşul tamamlanmadan NCR kapatılamaz (QLT-01).</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: [
      { adim: '1. Kök neden analizi', tamam: !!n.kok_neden, kim: '—',
        detay: n.kok_neden || 'Girilmedi' },
      { adim: '2. Düzeltici faaliyet (DÖF)', tamam: !!n.dof_tamamlandi,
        kim: n.dof_tamamlayan ? kullaniciAdi(n.dof_tamamlayan) : '—',
        detay: n.dof_tanimi || 'Tanımlanmadı' },
      { adim: '3. Etkinlik doğrulaması', tamam: !!n.etkinlik_dogrulandi,
        kim: n.etkinlik_dogrulayan ? kullaniciAdi(n.etkinlik_dogrulayan) : '—',
        detay: n.etkinlik_notu || 'Doğrulanmadı' },
    ],
    sutunlar: [
      { ad: 'adim', etiket: 'Adım', govde: (r) => h`<b>${r.adim}</b>` },
      { ad: 'detay', etiket: 'İçerik' },
      { ad: 'kim', etiket: 'Kim' },
      { ad: 'tamam', etiket: 'Durum', hizala: 'sag',
        govde: (r) => (r.tamam ? B.rozet('onaylandi', 'Tamam') : B.rozet('beklemede', 'Bekliyor')) },
    ],
  })}</div>
</div>
<div class="dash-cols">
  <div>
    ${!n.kok_neden && yetkiVar(ctx, 'QLT-07:guncelle') ? B.form({
      rota: `/kalite/ncr/${n.id}`, csrf: csrfAlani(ctx),
      bolumler: [{ baslik: '1. Kök neden ve düzeltici faaliyet tanımı', alanlar: h`
        ${ham('<input type="hidden" name="_eylem" value="kok_neden">')}
        ${ham(`<input type="hidden" name="surum" value="${n.surum}">`)}
        ${B.alan({ ad: 'kokNeden', etiket: 'Kök neden', tur: 'metin', zorunlu: true, genis: true })}
        ${B.alan({ ad: 'dofTanimi', etiket: 'Düzeltici faaliyet', tur: 'metin', genis: true })}` }],
      eylemler: B.btn('Kaydet', { tur: 'acc', gonder: true }) }) : ''}
    ${n.kok_neden && !n.dof_tamamlandi && yetkiVar(ctx, 'QLT-07:guncelle') ? B.form({
      rota: `/kalite/ncr/${n.id}`, csrf: csrfAlani(ctx),
      bolumler: [{ baslik: '2. Düzeltici faaliyeti tamamla',
        aciklama: 'Tamamlayan kişi kaydedilir; etkinliği aynı kişi doğrulayamaz.', alanlar: h`
        ${ham('<input type="hidden" name="_eylem" value="dof_tamamla">')}
        ${ham(`<input type="hidden" name="surum" value="${n.surum}">`)}
        ${B.alan({ ad: 'gerekce', etiket: 'Yapılan iş', tur: 'metin', genis: true })}` }],
      eylemler: B.btn('DÖF tamamlandı', { tur: 'acc', gonder: true }) }) : ''}
    ${n.dof_tamamlandi && !n.etkinlik_dogrulandi && yetkiVar(ctx, 'QLT-07:guncelle') ? B.form({
      rota: `/kalite/ncr/${n.id}`, csrf: csrfAlani(ctx),
      bolumler: [{ baslik: '3. Etkinlik doğrulaması',
        aciklama: 'Düzeltici faaliyetin gerçekten işe yaradığını doğrulayın.', alanlar: h`
        ${ham('<input type="hidden" name="_eylem" value="etkinlik">')}
        ${ham(`<input type="hidden" name="surum" value="${n.surum}">`)}
        ${B.alan({ ad: 'etkinlikNotu', etiket: 'Doğrulama notu', tur: 'metin', zorunlu: true, genis: true })}` }],
      eylemler: B.btn('Etkinliği doğrula', { tur: 'acc', gonder: true }) }) : ''}
  </div>
  <div class="gv-side-stack">
    ${kapanisEngeli ? h`<div class="gv-card"><div class="gc-body">
      <div class="gv-cap-sm">Kapanış engeli</div>
      <p style="margin-top:10px;font-size:13px;color:var(--danger)">${kapanisEngeli}</p></div></div>` : ''}
    ${gecisFormu(ctx, { nesne: 'sahaBildirimi', kayit: n, rota: `/kalite/ncr/${n.id}`, ekranKodu: 'QLT-07' })}
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: n.kod, baslik: n.baslik }));
}

/* ========================================================================== */
/* Saha bildirimi · görev · İSG sayfaları                                     */
/* ========================================================================== */
function sahaBildirimFormu(ctx, { deger = {}, hata = null }) {
  return B.form({
    rota: '/saha-bildirimleri/yeni', csrf: csrfAlani(ctx), idempotencyAnahtari: kimlik('idempotency'), hatalar: hata,
    bolumler: [{ baslik: 'Saha bildirimi',
      aciklama: 'Tür ve aciklık, bildirimin hangi role düşeceğini ve SLA süresini belirler; SLA elle girilmez.',
      alanlar: h`
        ${B.alan({ ad: 'baslik', etiket: 'Başlık', deger: deger.baslik || '', zorunlu: true, hata: hata?.alanlar?.baslik, genis: true })}
        ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye', deger: deger.santiyeId || '', zorunlu: true,
          hata: hata?.alanlar?.santiyeId, secenekler: [{ deger: '', etiket: 'Seçin…' }, ...santiyeler(ctx)] })}
        ${B.alan({ ad: 'tur', etiket: 'Tür', deger: deger.tur || '', zorunlu: true, hata: hata?.alanlar?.tur,
          secenekler: [{ deger: '', etiket: 'Seçin…' },
            { deger: 'isg', etiket: 'İSG' }, { deger: 'kalite', etiket: 'Kalite' },
            { deger: 'teknik', etiket: 'Teknik' }, { deger: 'lojistik', etiket: 'Lojistik' },
            { deger: 'cevre', etiket: 'Çevre' }, { deger: 'diger', etiket: 'Diğer' }] })}
        ${B.alan({ ad: 'onem', etiket: 'Aciliyet', deger: deger.onem || 'bilgi',
          ipucu: 'SLA: kritik 1 gün · uyarı 3 gün · bilgi 7 gün',
          secenekler: [{ deger: 'bilgi', etiket: 'Bilgi' }, { deger: 'uyari', etiket: 'Uyarı' }, { deger: 'kritik', etiket: 'Kritik' }] })}
        ${B.alan({ ad: 'konum', etiket: 'Konum', deger: deger.konum || '', ipucu: 'Blok, kat, aks…' })}
        ${B.alan({ ad: 'aciklama', etiket: 'Açıklama', tur: 'metin', deger: deger.aciklama || '', genis: true })}` }],
    eylemler: h`${B.btn('Vazgeç', { rota: '/saha-bildirimleri' })}
      ${B.btn('Bildirimi gönder', { tur: 'acc', gonder: true, ikon: 'fa-paper-plane' })}`,
  });
}

function sahaBildirimDetayi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('SITE-11');
  yetkiZorunlu(ctx, e.yetki);
  const b = kaydiAl(ctx, 'saha_bildirimi', 'saha_bildirimi', id);
  const santiye = tek('SELECT * FROM santiye WHERE id = ?', b.santiye_id);
  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: 'Bildirim oluşturuldu',
    aciklama: 'Tür ve aciliyete göre ilgili rollere bildirim gönderildi; SLA süresi başladı.' }) : ''}
${ctx.sorgu.get('atandi') ? B.sonucSeridi({ tur: 'ok', baslik: 'Sorumlu atandı' }) : ''}
${ctx.sorgu.get('gecis') ? B.sonucSeridi({ tur: 'ok', baslik: 'Durum güncellendi', aciklama: `Yeni durum: ${b.durum}` }) : ''}
${ozetSeridi(ctx, {
    nesne: 'sahaBildirimi', kayit: b, baslik: b.baslik,
    bilgiler: [
      { etiket: 'Şantiye', deger: h`<a href="/santiyeler/${b.santiye_id}">${santiye?.ad || '—'}</a>` },
      { etiket: 'Tür', deger: b.tur },
      { etiket: 'Aciliyet', deger: b.onem },
      { etiket: 'Konum', deger: b.konum || '—' },
      { etiket: 'Sorumlu', deger: kullaniciAdi(b.sorumlu_id) },
      { etiket: 'SLA', deger: b.sla_bitis ? tarih(b.sla_bitis) : '—' },
    ],
  })}
<div class="dash-cols">
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>Açıklama</b></div></div>
    <div class="gc-body"><p style="font-size:13.5px;line-height:1.7">${b.aciklama || '—'}</p></div>
  </div>
  <div class="gv-side-stack">
    ${yetkiVar(ctx, 'SITE-11:guncelle') ? B.form({
      rota: `/saha-bildirimleri/${b.id}`, csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Sorumlu ata', alanlar: h`
        ${ham('<input type="hidden" name="_eylem" value="ata">')}
        ${ham(`<input type="hidden" name="surum" value="${b.surum}">`)}
        ${B.alan({ ad: 'sorumluId', etiket: 'Sorumlu', deger: b.sorumlu_id || '', zorunlu: true,
          secenekler: [{ deger: '', etiket: 'Seçin…' }, ...kullanicilar(ctx)] })}` }],
      eylemler: B.btn('Ata', { tur: 'acc', gonder: true }) }) : ''}
    ${gecisFormu(ctx, { nesne: 'sahaBildirimi', kayit: b, rota: `/saha-bildirimleri/${b.id}`, ekranKodu: 'SITE-11' })}
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: b.kod, baslik: b.baslik }));
}

function gorevFormu(ctx, { deger = {}, hata = null }) {
  return B.form({
    rota: '/gorevler/yeni', csrf: csrfAlani(ctx), idempotencyAnahtari: kimlik('idempotency'), hatalar: hata,
    bolumler: [{ baslik: 'Görev',
      aciklama: 'Durum seçilmez: sorumlu atarsanız görev "açık", atamazsanız "atama bekliyor" olarak başlar.',
      alanlar: h`
        ${B.alan({ ad: 'baslik', etiket: 'Başlık', deger: deger.baslik || '', zorunlu: true, hata: hata?.alanlar?.baslik, genis: true })}
        ${B.alan({ ad: 'aciklama', etiket: 'Açıklama', tur: 'metin', deger: deger.aciklama || '', genis: true })}
        ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye', deger: deger.santiyeId || '',
          secenekler: [{ deger: '', etiket: 'Seçin…' }, ...santiyeler(ctx)] })}
        ${B.alan({ ad: 'sorumluId', etiket: 'Sorumlu', deger: deger.sorumluId || '',
          ipucu: 'Boş bırakılırsa görev havuza düşer.',
          secenekler: [{ deger: '', etiket: 'Havuza gönder' }, ...kullanicilar(ctx)] })}
        ${B.alan({ ad: 'oncelik', etiket: 'Öncelik', deger: deger.oncelik || 'normal',
          secenekler: ['dusuk', 'normal', 'yuksek', 'kritik'].map((o) => ({ deger: o, etiket: o })) })}
        ${B.alan({ ad: 'termin', etiket: 'Termin', tur: 'date', deger: deger.termin || '',
          ipucu: 'Gecikme bu tarihten HESAPLANIR; ayrı bir "gecikmiş" durumu yoktur.' })}` }],
    eylemler: h`${B.btn('Vazgeç', { rota: '/gorevler' })}
      ${B.btn('Görevi oluştur', { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' })}`,
  });
}

function gorevDetayi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('TASK-03');
  yetkiZorunlu(ctx, e.yetki);
  const g = kaydiAl(ctx, 'gorev', 'gorev', id);
  const yorumlar = sorgu(
    `SELECT y.*, k.ad_soyad FROM gorev_yorumu y JOIN kullanici k ON k.id = y.kullanici_id
      WHERE y.gorev_id = ? ORDER BY y.olusturuldu`, g.id);
  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: 'Görev oluşturuldu' }) : ''}
${ctx.sorgu.get('gecis') ? B.sonucSeridi({ tur: 'ok', baslik: 'Durum güncellendi', aciklama: `Yeni durum: ${g.durum}` }) : ''}
${ctx.sorgu.get('ustlenildi') ? B.sonucSeridi({ tur: 'ok', baslik: 'Görevi üstlendiniz' }) : ''}
${ozetSeridi(ctx, {
    nesne: 'gorev', kayit: g, baslik: g.baslik,
    bilgiler: [
      { etiket: 'Sorumlu', deger: g.sorumlu_id ? kullaniciAdi(g.sorumlu_id) : 'Havuzda' },
      { etiket: 'Öncelik', deger: g.oncelik },
      { etiket: 'Termin', deger: g.termin ? tarih(g.termin) : '—' },
      { etiket: 'Şantiye', deger: g.santiye_id ? (tek('SELECT ad FROM santiye WHERE id = ?', g.santiye_id)?.ad || '—') : '—' },
      { etiket: 'Oluşturan', deger: kullaniciAdi(g.olusturan) },
      { etiket: 'Kaynak', deger: g.kaynak_nesne ? `${g.kaynak_nesne}` : '—' },
    ],
    birincilEylem: !g.sorumlu_id ? h`<form method="post" action="/gorevler/${g.id}" style="display:inline">
      ${ham(csrfAlani(ctx))}<input type="hidden" name="_eylem" value="ustlen">
      <input type="hidden" name="surum" value="${g.surum}">
      <button class="btn btn-acc" type="submit"><i class="fa-solid fa-hand"></i> Görevi üstlen</button></form>` : null,
  })}
<div class="dash-cols">
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>Açıklama ve yorumlar</b></div></div>
    <div class="gc-body">
      <p style="font-size:13.5px;line-height:1.7">${g.aciklama || '—'}</p>
      <div style="margin-top:18px;display:flex;flex-direction:column;gap:12px">
        ${yorumlar.map((y) => h`<div style="padding:12px;border:1px solid var(--line);border-radius:var(--r-sm)">
          <b style="font-size:12.5px">${y.ad_soyad}</b>
          <span class="muted" style="font-size:11.5px"> · ${tarihSaat(y.olusturuldu)}</span>
          <p style="margin-top:6px;font-size:13px">${y.metin}</p></div>`)}
        ${!yorumlar.length ? h`<p class="muted" style="font-size:13px">Henüz yorum yok.</p>` : ''}
      </div>
      <form method="post" action="/gorevler/${g.id}" style="margin-top:16px">
        ${ham(csrfAlani(ctx))}<input type="hidden" name="_eylem" value="yorum">
        ${B.alan({ ad: 'metin', etiket: 'Yorum ekle', tur: 'metin' })}
        <div style="margin-top:10px">${B.btn('Yorumu gönder', { tur: 'ghost', gonder: true, kucuk: true })}</div>
      </form>
    </div>
  </div>
  <div class="gv-side-stack">
    ${gecisFormu(ctx, { nesne: 'gorev', kayit: g, rota: `/gorevler/${g.id}`, ekranKodu: 'TASK-03' })}
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: g.kod, baslik: g.baslik }));
}

function isgFormu(ctx, tur, baslik, { deger = {}, hata = null }) {
  const kazaMi = tur === 'kaza';
  return B.form({
    rota: `/isg/olaylar/${tur === 'ramak_kala' ? 'ramak-kala' : tur}/yeni`,
    csrf: csrfAlani(ctx), idempotencyAnahtari: kimlik('idempotency'), hatalar: hata,
    bolumler: [
      { baslik, aciklama: kazaMi
          ? 'Kaza kaydı her zaman kritik önemde açılır ve yönetime anında bildirilir; önem derecesi seçilmez.'
          : 'Olay kaydı, risk değerlendirmesi ve önleyici aksiyon için temel oluşturur.',
        alanlar: h`
          ${B.alan({ ad: 'baslik', etiket: 'Başlık', deger: deger.baslik || '', zorunlu: true, hata: hata?.alanlar?.baslik, genis: true })}
          ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye', deger: deger.santiyeId || '',
            secenekler: [{ deger: '', etiket: 'Seçin…' }, ...santiyeler(ctx)] })}
          ${B.alan({ ad: 'olayZamani', etiket: 'Olay tarihi', tur: 'date',
            deger: deger.olayZamani || gunAnahtari(simdi()), zorunlu: true, hata: hata?.alanlar?.olayZamani })}
          ${B.alan({ ad: 'yer', etiket: 'Yer', deger: deger.yer || '' })}
          ${B.alan({ ad: 'anlatim', etiket: 'Olayın anlatımı', tur: 'metin', deger: deger.anlatim || '', genis: true })}` },
      ...(kazaMi ? [{ baslik: 'Kişi ve tedavi', alanlar: h`
          ${B.alan({ ad: 'kisiAdi', etiket: 'Kazaya karışan kişi', deger: deger.kisiAdi || '', zorunlu: true, hata: hata?.alanlar?.kisiAdi })}
          ${B.alan({ ad: 'tedavi', etiket: 'Tedavi', deger: deger.tedavi || '' })}
          ${B.alan({ ad: 'kayipGun', etiket: 'Kayıp gün', tur: 'number', deger: deger.kayipGun || '' })}` }] : []),
    ],
    eylemler: h`${B.btn('Vazgeç', { rota: '/isg/olaylar' })}
      ${B.btn('Kaydı oluştur', { tur: kazaMi ? 'danger' : 'acc', gonder: true, ikon: 'fa-floppy-disk' })}`,
  });
}

function isgDetayi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('HSE-06');
  yetkiZorunlu(ctx, e.yetki);
  const o = kaydiAl(ctx, 'isg_olayi', 'isg_olayi', id);
  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: 'İSG olayı kaydedildi',
    aciklama: 'İlgili yöneticilere bildirim gönderildi.' }) : ''}
${ctx.sorgu.get('arastirma') ? B.sonucSeridi({ tur: 'ok', baslik: 'Araştırma bilgileri kaydedildi' }) : ''}
${ctx.sorgu.get('gecis') ? B.sonucSeridi({ tur: 'ok', baslik: 'Durum güncellendi', aciklama: `Yeni durum: ${o.durum}` }) : ''}
${ozetSeridi(ctx, {
    nesne: 'sahaBildirimi', kayit: o, baslik: o.baslik,
    bilgiler: [
      { etiket: 'Tür', deger: o.tur },
      { etiket: 'Olay zamanı', deger: tarihSaat(o.olay_zamani) },
      { etiket: 'Yer', deger: o.yer || '—' },
      { etiket: 'Kişi', deger: o.kisi_adi || '—' },
      { etiket: 'Kayıp gün', deger: sayi(o.kayip_gun || 0) },
      { etiket: 'Etkinlik doğrulaması', deger: o.etkinlik_dogrulandi ? tarih(o.etkinlik_dogrulandi) : 'yapılmadı' },
    ],
  })}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Olay anlatımı</b></div></div>
      <div class="gc-body"><p style="font-size:13.5px;line-height:1.7">${o.anlatim || '—'}</p></div>
    </div>
    ${yetkiVar(ctx, 'HSE-06:guncelle') ? B.form({
      rota: `/isg/olaylar/${o.id}`, csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Araştırma, kök neden ve DÖF', alanlar: h`
        ${ham('<input type="hidden" name="_eylem" value="arastirma">')}
        ${ham(`<input type="hidden" name="surum" value="${o.surum}">`)}
        ${B.alan({ ad: 'kokNeden', etiket: 'Kök neden', tur: 'metin', deger: o.kok_neden || '', genis: true })}
        ${B.alan({ ad: 'duzelticiFaaliyet', etiket: 'Düzeltici faaliyet', tur: 'metin',
          deger: o.duzeltici_faaliyet || '', genis: true })}` }],
      eylemler: B.btn('Kaydet', { tur: 'acc', gonder: true }) }) : ''}
  </div>
  <div class="gv-side-stack">
    ${!o.etkinlik_dogrulandi ? h`<div class="gv-card"><div class="gc-body">
      <div class="gv-cap-sm">Kapanış koşulu</div>
      <p style="margin-top:10px;font-size:13px;color:var(--muted)">Olay, düzeltici faaliyetin etkinliği
        doğrulanmadan kapatılamaz.</p></div></div>` : ''}
    ${gecisFormu(ctx, { nesne: 'sahaBildirimi', kayit: o, rota: `/isg/olaylar/${o.id}`, ekranKodu: 'HSE-06' })}
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: o.kod, baslik: o.baslik }));
}
