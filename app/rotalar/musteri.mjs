/* ============================================================================
   MÜŞTERİ, FIRSAT VE TEKLİF — EXT-01, EXT-02, EXT-03
   ----------------------------------------------------------------------------
   **Bu ürün bir CRM DEĞİLDİR.** Buradaki "müşteri" bir inşaat sözleşmesinin
   İŞVEREN tarafıdır; "fırsat" henüz sözleşmeye dönmemiş iş imkânıdır. Model
   satış hunisi değil, PROJE KAYNAĞIDIR: fırsat kazanılınca proje açılır,
   teklif kabul edilince sözleşmeye bağlanır.

   Eski uygulamadaki `crm-satis-*` ekranları bu üç aileye birleştirildi
   (manifest `eski-eslesme.json`); pipeline/deal/lead sözlüğü kullanılmaz.
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, gunAnahtari, gunBaslangici } from '../cekirdek/zaman.mjs';
import { Para } from '../cekirdek/para.mjs';
import { DogrulamaHatasi, GecisIzinsiz, Bulunamadi, Cakisma, UygulamaHatasi } from '../cekirdek/hata.mjs';
import { idempotent } from '../cekirdek/idempotency.mjs';
import { kayitModulu, sayac, gecmisKarti, projeSecenekleri } from './kayit-modulu.mjs';
import {
  ekranNesnesi, hataNesnesi, kullaniciAdi, ciz, listeSorgusu, filtreKosullari,
  B, h, ham, sayi, csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar,
  sorgu, tek, calistir, islem, surumluGuncelle, audit, sonrakiKod,
} from './ortak.mjs';

const para = (minor, birim = 'TRY') => (minor == null ? '—' : Para.minor(minor, birim || 'TRY').bicim());

const MUSTERI_TURLERI = [
  { deger: 'isveren', etiket: 'İşveren' }, { deger: 'musteri', etiket: 'Müşteri' },
  { deger: 'kurum', etiket: 'Kurum' }, { deger: 'musavir', etiket: 'Müşavir' },
  { deger: 'ortak', etiket: 'İş ortağı' },
];
const FIRSAT_DURUMLARI = {
  aday: 'Aday', degerlendirmede: 'Değerlendirmede', teklif_verildi: 'Teklif verildi',
  kazanildi: 'Kazanıldı', kaybedildi: 'Kaybedildi', iptal: 'İptal',
};

const musteriSecenekleri = (ctx) => sorgu(
  `SELECT id, kod, ad FROM musteri WHERE tenant_id = ? AND durum = 'aktif' ORDER BY ad`, ctx.tenant.id)
  .map((m) => ({ deger: m.id, etiket: `${m.kod} — ${m.ad}` }));

export function kur(y, ekranRota) {
  /* ================= EXT-01 Müşteri ve işverenler ====================== */
  kayitModulu(y, ekranRota, {
    nesne: 'musteri', tablo: 'musteri', kodNesnesi: 'musteri', kimlikTuru: 'musteri',
    rota: '/musteriler', formRotasi: '/musteriler?yeni=1',
    baslik: 'Müşteri / işveren', yeniEtiketi: 'Yeni müşteri',
    listeKodu: 'EXT-01', formKodu: null, detayKodu: null, gecisNesnesi: null,
    aramaAlanlari: ['ad', 'kod', 'vergi_no', 'yetkili'], aramaYer: 'Ad, kod, vergi no…',
    sirala: 'ad', alanlar: [],
    filtreler: [{ ad: 'tur', etiket: 'Tür', secenekler: MUSTERI_TURLERI },
      { ad: 'durum', etiket: 'Durum',
        secenekler: ['aktif', 'pasif', 'kara_liste'].map((d) => ({ deger: d, etiket: d })) }],
    kpi: (ctx, toplam) => [
      { etiket: 'Müşteri / işveren', deger: sayi(sayac(ctx.tenant.id, 'musteri', `durum = 'aktif'`)),
        ikon: 'fa-handshake' },
      { etiket: 'Açık fırsat', ikon: 'fa-lightbulb',
        deger: sayi(sayac(ctx.tenant.id, 'firsat',
          `durum IN ('aday','degerlendirmede','teklif_verildi')`)) },
      { etiket: 'Kazanılan fırsat', ikon: 'fa-trophy',
        deger: sayi(sayac(ctx.tenant.id, 'firsat', `durum = 'kazanildi'`)) },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ],
    bosDurum: { baslik: 'Müşteri yok', ikon: 'fa-handshake',
      aciklama: 'İşveren, müşavir ve kurum kayıtları burada tutulur; sözleşme karşı tarafı buradan seçilir.' },
    listeSutunlari: () => [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'ad', etiket: 'Müşteri / işveren',
        govde: (r) => h`<b>${r.ad}</b><br><span class="muted">${
          MUSTERI_TURLERI.find((t) => t.deger === r.tur)?.etiket || r.tur}</span>` },
      { ad: 'yetkili', etiket: 'Yetkili', govde: (r) => r.yetkili || '—' },
      { ad: 'telefon', etiket: 'Telefon', govde: (r) => r.telefon || '—' },
      { ad: 'firsat', etiket: 'Fırsat', hizala: 'sag',
        govde: (r) => sayi(Number(tek('SELECT COUNT(*) AS n FROM firsat WHERE musteri_id = ?', r.id)?.n ?? 0)) },
      { ad: 'durum', etiket: 'Durum',
        govde: (r) => B.rozet(r.durum === 'aktif' ? 'onaylandi' : 'kapali', r.durum) },
    ],
    altForm: (ctx) => musteriFormu(ctx),
    detayBilgileri: () => [],
  });

  y.post('/musteriler', (ctx, govde) => {
    const e = ekranNesnesi('EXT-01');
    yetkiZorunlu(ctx, `${e.kod}:olustur`);
    csrfZorunlu(ctx, govde);
    try {
      const s = idempotent(
        { anahtar: govde._idempotency, tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, govde },
        () => musteriAc(ctx, govde));
      return yonlendir(ctx, `/musteriler?olusturuldu=1&yeni=${s.kod}`);
    } catch (err) {
      if (!(err instanceof UygulamaHatasi)) throw err;
      return html(ctx, err.durum, ciz(ctx, e, musteriFormu(ctx, { deger: govde, hata: hataNesnesi(err) })));
    }
  }, { ekran: ekranNesnesi('EXT-01') });

  /* ================= EXT-02 Fırsatlar ================================== */
  ekranRota(y, 'EXT-02', {
    get: (ctx) => firsatEkrani(ctx),
    post: (ctx, govde) => {
      const e = ekranNesnesi('EXT-02');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = firsatIslemi(ctx, govde);
        return yonlendir(ctx, `/firsatlar?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return firsatEkrani(ctx, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ================= EXT-03 Teklif hazırlama =========================== */
  ekranRota(y, 'EXT-03', {
    get: (ctx) => teklifEkrani(ctx),
    post: (ctx, govde) => {
      const e = ekranNesnesi('EXT-03');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = teklifIslemi(ctx, govde);
        return yonlendir(ctx, `/teklifler?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return teklifEkrani(ctx, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });
}

/* ==========================================================================
   EXT-01 — müşteri formu
   ========================================================================== */
function musteriFormu(ctx, { deger = {}, hata = null } = {}) {
  return h`<div style="margin-top:22px">${B.form({
    rota: '/musteriler', csrf: csrfAlani(ctx),
    idempotencyAnahtari: kimlik('idempotency'), hatalar: hata,
    bolumler: [{ baslik: 'Yeni müşteri / işveren',
      aciklama: 'Sözleşmenin karşı tarafı buradan seçilir. Cari hesap bağı kurulursa '
        + 'tahsilat ve bakiye finans defterinden okunur; burada tutar tutulmaz.',
      alanlar: h`
        ${B.alan({ ad: 'ad', etiket: 'Ünvan', zorunlu: true, genis: true,
        deger: deger.ad || '', hata: hata?.alanlar?.ad })}
        ${B.alan({ ad: 'tur', etiket: 'Tür', deger: deger.tur || 'isveren', secenekler: MUSTERI_TURLERI })}
        ${B.alan({ ad: 'vergiNo', etiket: 'Vergi no', deger: deger.vergiNo || '' })}
        ${B.alan({ ad: 'vergiDairesi', etiket: 'Vergi dairesi', deger: deger.vergiDairesi || '' })}
        ${B.alan({ ad: 'yetkili', etiket: 'Yetkili kişi', deger: deger.yetkili || '' })}
        ${B.alan({ ad: 'telefon', etiket: 'Telefon', deger: deger.telefon || '' })}
        ${B.alan({ ad: 'eposta', etiket: 'E-posta', deger: deger.eposta || '' })}
        ${B.alan({ ad: 'adres', etiket: 'Adres', tur: 'metin', genis: true, deger: deger.adres || '' })}` }],
    eylemler: B.btn('Müşteriyi kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  })}</div>`;
}

function musteriAc(ctx, govde) {
  const ad = String(govde.ad || '').trim();
  if (!ad) throw DogrulamaHatasi('Ünvan zorunludur.', { alanlar: { ad: ['Ünvan girin.'] } });
  if (govde.vergiNo && tek('SELECT id FROM musteri WHERE tenant_id = ? AND vergi_no = ?',
    ctx.tenant.id, govde.vergiNo)) {
    throw Cakisma(`${govde.vergiNo} vergi numaralı müşteri zaten kayıtlı.`);
  }
  return islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'musteri');
    const id = kimlik('musteri');
    calistir(`INSERT INTO musteri (id, tenant_id, kod, ad, tur, vergi_no, vergi_dairesi,
                yetkili, telefon, eposta, adres, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?, 'aktif', ?,?)`,
      id, ctx.tenant.id, kod, ad,
      MUSTERI_TURLERI.some((t) => t.deger === govde.tur) ? govde.tur : 'isveren',
      govde.vergiNo || null, govde.vergiDairesi || null, govde.yetkili || null,
      govde.telefon || null, govde.eposta || null, govde.adres || null,
      ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId,
      ip: ctx.ip, nesne: 'musteri', nesneId: id, eylem: 'olustur', sonraki: { kod, ad } });
    return { id, kod };
  });
}

/* ==========================================================================
   EXT-02 — fırsatlar
   ========================================================================== */
function firsatEkrani(ctx, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('EXT-02');
  yetkiZorunlu(ctx, e.yetki);
  const { kosullar, parametreler } = filtreKosullari(ctx, {
    aramaAlanlari: ['baslik', 'kod'], filtreler: [{ ad: 'durum' }, { ad: 'musteri_id' }] });
  const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
    { tablo: 'firsat', kosullar, parametreler, sirala: 'olusturuldu DESC' });

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Açık fırsat', ikon: 'fa-lightbulb',
        deger: sayi(sayac(ctx.tenant.id, 'firsat',
          `durum IN ('aday','degerlendirmede','teklif_verildi')`)) },
      { etiket: 'Kazanılan', ikon: 'fa-trophy',
        deger: sayi(sayac(ctx.tenant.id, 'firsat', `durum = 'kazanildi'`)) },
      { etiket: 'Kaybedilen', ikon: 'fa-circle-xmark',
        deger: sayi(sayac(ctx.tenant.id, 'firsat', `durum = 'kaybedildi'`)) },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ]),
    filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Fırsat başlığı veya kodu…',
      filtreler: [
        { ad: 'durum', etiket: 'Durum',
          secenekler: Object.entries(FIRSAT_DURUMLARI).map(([d, a]) => ({ deger: d, etiket: a })) },
        { ad: 'musteri_id', etiket: 'Müşteri', secenekler: musteriSecenekleri(ctx) },
      ] }),
    icerik: B.tablo({
      satirlar,
      bosDurum: { baslik: 'Fırsat yok', ikon: 'fa-lightbulb',
        aciklama: 'Fırsat kazanılınca PROJE açılır; satış hunisi değil, proje kaynağıdır.' },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'baslik', etiket: 'Fırsat',
          govde: (f) => h`<b>${f.baslik}</b><br><span class="muted">${
            f.musteri_id ? tek('SELECT ad FROM musteri WHERE id = ?', f.musteri_id)?.ad || '—' : '—'}</span>` },
        { ad: 'tahmini_bedel_minor', etiket: 'Tahmini bedel', hizala: 'sag',
          govde: (f) => para(f.tahmini_bedel_minor, f.tutar_birim) },
        { ad: 'ihale_tarihi', etiket: 'İhale',
          govde: (f) => (f.ihale_tarihi ? tarih(f.ihale_tarihi) : '—') },
        { ad: 'proje_id', etiket: 'Proje', govde: (f) => (f.proje_id
          ? h`<a href="/projeler/${f.proje_id}">${
            tek('SELECT kod FROM proje WHERE id = ?', f.proje_id)?.kod || '—'}</a>` : '—') },
        { ad: 'durum', etiket: 'Durum', govde: (f) => B.rozet(
          f.durum === 'kazanildi' ? 'onaylandi'
            : ['kaybedildi', 'iptal'].includes(f.durum) ? 'reddedildi' : 'beklemede',
          FIRSAT_DURUMLARI[f.durum] || f.durum) },
        { ad: 'islem', etiket: '', govde: (f) => (f.durum === 'teklif_verildi'
          && yetkiVar(ctx, 'EXT-02:guncelle')
          ? h`<form method="post" action="/firsatlar" style="display:inline">
              ${ham(csrfAlani(ctx))}<input type="hidden" name="_eylem" value="kazan">
              <input type="hidden" name="firsatId" value="${f.id}">
              <button class="btn btn-ghost btn-sm" type="submit">Kazanıldı → proje aç</button></form>`
          : '') },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'EXT-02:olustur') ? h`<div style="margin-top:22px">${B.form({
    rota: '/firsatlar', csrf: csrfAlani(ctx), idempotencyAnahtari: kimlik('idempotency'), hatalar: hata,
    bolumler: [{ baslik: 'Yeni fırsat',
      aciklama: 'Tahmini bedel bir TAHMİNDİR; sözleşme bedeli poz cetvelinden türer (K-064). '
        + 'Fırsat kazanılınca buradan proje açılır ve iki kayıt birbirine bağlanır.',
      alanlar: h`
        <input type="hidden" name="_eylem" value="ac">
        ${B.alan({ ad: 'baslik', etiket: 'Başlık', zorunlu: true, genis: true })}
        ${B.alan({ ad: 'musteriId', etiket: 'Müşteri / işveren',
        secenekler: [{ deger: '', etiket: 'Seçin…' }, ...musteriSecenekleri(ctx)] })}
        ${B.alan({ ad: 'tahminiBedel', etiket: 'Tahmini bedel' })}
        ${B.alan({ ad: 'ihaleTarihi', etiket: 'İhale tarihi', tur: 'date' })}
        ${B.alan({ ad: 'aciklama', etiket: 'Açıklama', tur: 'metin', genis: true })}` }],
    eylemler: B.btn('Fırsatı aç', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  })}</div>` : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

function firsatIslemi(ctx, govde) {
  if (govde._eylem === 'ac') {
    const baslik = String(govde.baslik || '').trim();
    if (!baslik) throw DogrulamaHatasi('Başlık zorunludur.', { alanlar: { baslik: ['Başlık girin.'] } });
    const bedel = govde.tahminiBedel
      ? Para.ayristir(govde.tahminiBedel, ctx.tenant.para_birimi).minor : 0n;
    return islem(() => {
      const kod = sonrakiKod(ctx.tenant.id, 'firsat');
      const id = kimlik('firsat');
      calistir(`INSERT INTO firsat (id, tenant_id, musteri_id, kod, baslik, aciklama,
                  tahmini_bedel_minor, tutar_birim, ihale_tarihi, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?,?, 'aday', ?,?)`,
        id, ctx.tenant.id, govde.musteriId || null, kod, baslik, govde.aciklama || null,
        String(bedel), ctx.tenant.para_birimi,
        govde.ihaleTarihi ? gunBaslangici(govde.ihaleTarihi) : null, ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId,
        ip: ctx.ip, nesne: 'firsat', nesneId: id, eylem: 'olustur', sonraki: { kod, baslik } });
      return `${kod} fırsatı açıldı`;
    });
  }

  if (govde._eylem === 'kazan') {
    const f = tek('SELECT * FROM firsat WHERE id = ? AND tenant_id = ?', govde.firsatId, ctx.tenant.id);
    if (!f) throw Bulunamadi('Fırsat bulunamadı.');
    if (f.durum !== 'teklif_verildi') {
      throw GecisIzinsiz('Yalnız teklif verilmiş fırsat kazanıldı olarak kapatılır.');
    }
    if (f.proje_id) throw Cakisma('Bu fırsattan zaten proje açılmış.');
    return islem(() => {
      /* Proje AÇILIR ve iki kayıt bağlanır — fırsat "kazanıldı" demek, projenin
         var olduğunu söylemektir; kayıt açmadan durum değiştirmek boş vaattir. */
      const projeKod = sonrakiKod(ctx.tenant.id, 'proje');
      const projeId = kimlik('proje');
      calistir(`INSERT INTO proje (id, tenant_id, kod, ad, aciklama, sorumlu_id, durum,
                  olusturan, olusturuldu) VALUES (?,?,?,?,?,?, 'taslak', ?,?)`,
        projeId, ctx.tenant.id, projeKod, f.baslik, f.aciklama || null,
        ctx.kullanici.id, ctx.kullanici.id, simdi());
      surumluGuncelle('firsat', f.id, f.surum, { durum: 'kazanildi', proje_id: projeId },
        { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId,
        ip: ctx.ip, nesne: 'firsat', nesneId: f.id, eylem: 'kazanildi',
        sonraki: { proje: projeKod } });
      return `${f.kod} kazanıldı; ${projeKod} projesi taslak olarak açıldı`;
    });
  }

  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

/* ==========================================================================
   EXT-03 — teklif hazırlama
   ========================================================================== */
function teklifEkrani(ctx, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('EXT-03');
  yetkiZorunlu(ctx, e.yetki);
  const { kosullar, parametreler } = filtreKosullari(ctx, {
    aramaAlanlari: ['baslik', 'kod'], filtreler: [{ ad: 'durum' }, { ad: 'musteri_id' }] });
  const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
    { tablo: 'satis_teklifi', kosullar, parametreler, sirala: 'olusturuldu DESC' });

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Teklif', deger: sayi(toplam), ikon: 'fa-file-invoice' },
      { etiket: 'Gönderilen', ikon: 'fa-paper-plane',
        deger: sayi(sayac(ctx.tenant.id, 'satis_teklifi', `durum = 'gonderildi'`)) },
      { etiket: 'Kabul edilen', ikon: 'fa-circle-check',
        deger: sayi(sayac(ctx.tenant.id, 'satis_teklifi', `durum = 'kabul'`)) },
    ]),
    filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Teklif başlığı veya kodu…',
      filtreler: [{ ad: 'musteri_id', etiket: 'Müşteri', secenekler: musteriSecenekleri(ctx) }] }),
    icerik: B.tablo({
      satirlar,
      bosDurum: { baslik: 'Teklif yok', ikon: 'fa-file-invoice',
        aciklama: 'Verilen teklif, satın almadaki GELEN tekliften ayrı bir kayıttır.' },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod', govde: (t) => h`${t.kod} <span class="muted">v${t.surum_no}</span>` },
        { ad: 'baslik', etiket: 'Teklif',
          govde: (t) => h`<b>${t.baslik}</b><br><span class="muted">${
            t.musteri_id ? tek('SELECT ad FROM musteri WHERE id = ?', t.musteri_id)?.ad || '—' : '—'}</span>` },
        { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag',
          govde: (t) => para(t.tutar_minor, t.tutar_birim) },
        { ad: 'gecerlilik', etiket: 'Geçerlilik',
          govde: (t) => (t.gecerlilik ? tarih(t.gecerlilik) : '—') },
        { ad: 'durum', etiket: 'Durum', govde: (t) => B.rozet(
          ['kabul', 'onaylandi'].includes(t.durum) ? 'onaylandi'
            : ['ret', 'reddedildi', 'iptal'].includes(t.durum) ? 'reddedildi' : 'beklemede', t.durum) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'EXT-03:olustur') ? h`<div style="margin-top:22px">${B.form({
    rota: '/teklifler', csrf: csrfAlani(ctx), idempotencyAnahtari: kimlik('idempotency'), hatalar: hata,
    bolumler: [{ baslik: 'Yeni teklif',
      aciklama: 'Teklif TASLAK açılır. Gönderim ve kabul ayrı adımlardır; kullanıcı '
        + '"kabul edildi" durumunu doğrudan seçemez (kural 5).',
      alanlar: h`
        <input type="hidden" name="_eylem" value="ac">
        ${B.alan({ ad: 'baslik', etiket: 'Başlık', zorunlu: true, genis: true })}
        ${B.alan({ ad: 'musteriId', etiket: 'Müşteri',
        secenekler: [{ deger: '', etiket: 'Seçin…' }, ...musteriSecenekleri(ctx)] })}
        ${B.alan({ ad: 'firsatId', etiket: 'Fırsat',
        secenekler: [{ deger: '', etiket: 'Bağımsız' }, ...sorgu(
          `SELECT id, kod, baslik FROM firsat WHERE tenant_id = ?
             AND durum IN ('aday','degerlendirmede','teklif_verildi') ORDER BY kod`, ctx.tenant.id)
          .map((f) => ({ deger: f.id, etiket: `${f.kod} — ${f.baslik}` }))] })}
        ${B.alan({ ad: 'tutar', etiket: 'Teklif tutarı', zorunlu: true })}
        ${B.alan({ ad: 'gecerlilik', etiket: 'Geçerlilik tarihi', tur: 'date' })}` }],
    eylemler: B.btn('Teklifi aç', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  })}</div>` : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

function teklifIslemi(ctx, govde) {
  if (govde._eylem !== 'ac') throw DogrulamaHatasi('Bilinmeyen işlem.');
  const baslik = String(govde.baslik || '').trim();
  if (!baslik) throw DogrulamaHatasi('Başlık zorunludur.', { alanlar: { baslik: ['Başlık girin.'] } });
  const tutar = Para.ayristir(govde.tutar || '', ctx.tenant.para_birimi);
  if (tutar.minor <= 0n) {
    throw DogrulamaHatasi('Teklif tutarı sıfırdan büyük olmalı.', { alanlar: { tutar: ['Tutar girin.'] } });
  }
  return islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'satis_teklifi');
    const id = kimlik('teklif');
    calistir(`INSERT INTO satis_teklifi (id, tenant_id, firsat_id, musteri_id, kod, baslik,
                gecerlilik, tutar_minor, tutar_birim, surum_no, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,1, 'taslak', ?,?)`,
      id, ctx.tenant.id, govde.firsatId || null, govde.musteriId || null, kod, baslik,
      govde.gecerlilik ? gunBaslangici(govde.gecerlilik) : null,
      String(tutar.minor), ctx.tenant.para_birimi, ctx.kullanici.id, simdi());

    /* Fırsat "teklif verildi" durumuna GEÇER: iki kayıt tutarlı kalır. */
    if (govde.firsatId) {
      const f = tek('SELECT * FROM firsat WHERE id = ? AND tenant_id = ?',
        govde.firsatId, ctx.tenant.id);
      if (f && ['aday', 'degerlendirmede'].includes(f.durum)) {
        surumluGuncelle('firsat', f.id, f.surum, { durum: 'teklif_verildi' },
          { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
      }
    }
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId,
      ip: ctx.ip, nesne: 'satis_teklifi', nesneId: id, eylem: 'olustur',
      sonraki: { kod, baslik, tutarMinor: String(tutar.minor) } });
    return `${kod} teklifi taslak olarak açıldı`;
  });
}
