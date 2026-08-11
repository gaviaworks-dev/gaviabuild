/* ============================================================================
   PERSONEL VE İK — HR-01..05, HR-07..09
   ----------------------------------------------------------------------------
   Üç kural bu modülün omurgasıdır:
     1) Maaş HASSAS ALANDIR: `alan_maskesi` kuralı olan rol maaşı ne görür ne
        yazar — alan formda hiç çizilmez, POST edilse bile yok sayılır (§5.7).
     2) Şantiye ataması TARİH ARALIĞIDIR: aynı personelin çakışan aktif ataması
        sunucuda reddedilir (HR-07 amacı).
     3) Puantaj dönemi KAPANDIKTAN sonra o dönemin satırları kilitlenir; kapanış
        onay motorundan geçer, kullanıcı "kapalı" durumunu seçemez (HR-09).
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, gunAnahtari, gunBaslangici, GUN_MS } from '../cekirdek/zaman.mjs';
import { Para } from '../cekirdek/para.mjs';
import { DogrulamaHatasi, GecisIzinsiz, Cakisma, Bulunamadi, UygulamaHatasi } from '../cekirdek/hata.mjs';
import * as onayMotoru from '../moduller/isakisi/onay.mjs';
import { kayitModulu, kullaniciSecenekleri, santiyeSecenekleri, projeSecenekleri,
  sayac, gecmisKarti } from './kayit-modulu.mjs';
import {
  ekranNesnesi, hataNesnesi, kullaniciAdi, ciz, B, h, ham, sayi, csrfAlani, csrfZorunlu,
  yetkiZorunlu, yetkiVar, alanMaskeliMi, kapsamCozucu, kaydiAl, sorgu, tek, calistir, islem,
  surumluGuncelle, audit, sonrakiKod, gecisYap,
} from './ortak.mjs';

const SOZLESME_TURLERI = [
  { deger: 'belirsiz', etiket: 'Belirsiz süreli' }, { deger: 'belirli', etiket: 'Belirli süreli' },
  { deger: 'mevsimlik', etiket: 'Mevsimlik' }, { deger: 'taseron', etiket: 'Taşeron personeli' },
  { deger: 'stajyer', etiket: 'Stajyer' },
];
const VARDIYALAR = [
  { deger: 'gunduz', etiket: 'Gündüz' }, { deger: 'gece', etiket: 'Gece' }, { deger: 'ara', etiket: 'Ara vardiya' },
];
const DEVAMSIZLIK = [
  { deger: '', etiket: 'Çalıştı' }, { deger: 'izinli', etiket: 'İzinli' },
  { deger: 'raporlu', etiket: 'Raporlu' }, { deger: 'devamsiz', etiket: 'Devamsız' },
  { deger: 'resmi_tatil', etiket: 'Resmi tatil' },
];
const YETKINLIK_TURLERI = [
  { deger: 'sertifika', etiket: 'Sertifika' }, { deger: 'egitim', etiket: 'Eğitim' },
  { deger: 'saglik', etiket: 'Sağlık raporu' }, { deger: 'ehliyet', etiket: 'Ehliyet/operatör belgesi' },
  { deger: 'diger', etiket: 'Diğer' },
];

/* Personel kaydının kapsam bağlamı KENDİ sütununda değil, atama tablosundadır:
   şantiyeye kapsamlı bir rol, yalnız o şantiyeye atanmış personeli görür. */
kapsamCozucu('personel', (k) => ({
  santiyeler: sorgu('SELECT DISTINCT santiye_id FROM personel_atama WHERE personel_id = ?', k.id)
    .map((r) => r.santiye_id).filter(Boolean),
  projeler: sorgu('SELECT DISTINCT proje_id FROM personel_atama WHERE personel_id = ?', k.id)
    .map((r) => r.proje_id).filter(Boolean),
  sirketler: [],
}));

const PERSONEL_KAPSAMI = {
  santiyeSutunu: 'EXISTS (SELECT 1 FROM personel_atama pa WHERE pa.personel_id = personel.id AND pa.santiye_id = ?)',
  projeSutunu: 'EXISTS (SELECT 1 FROM personel_atama pa WHERE pa.personel_id = personel.id AND pa.proje_id = ?)',
};

/* Hassas alanlar §5.7 gereği rol bazlı maskelenir: alan yalnız GİZLENMEZ,
   yazılamaz da (formda çizilmez, POST edilse yok sayılır). */
const maasAcik = (ctx) => !alanMaskeliMi(ctx, 'personel', 'maas');
const ibanAcik = (ctx) => !alanMaskeliMi(ctx, 'personel', 'banka_iban');
const tcAcik = (ctx) => !alanMaskeliMi(ctx, 'personel', 'tc_no');
const MASKE = h`<span class="muted" title="Bu alan rolünüz için maskelenmiştir">••••</span>`;
const maasGoster = (ctx, r) => (maasAcik(ctx)
  ? (r.maas_minor == null ? '—' : Para.minor(r.maas_minor, r.maas_birim || 'TRY').bicim())
  : MASKE);

const personelSecenekleri = (ctx, { yalnizAktif = false } = {}) => sorgu(
  `SELECT id, kod, ad_soyad FROM personel WHERE tenant_id = ?${yalnizAktif ? ` AND durum = 'aktif'` : ''}
    ORDER BY ad_soyad`, ctx.tenant.id).map((p) => ({ deger: p.id, etiket: `${p.kod} — ${p.ad_soyad}` }));

/** Süresi dolmuş belge sayısı — hesaplanan işaret, saklanmaz. */
const belgeUyarisi = (personelId) => Number(tek(
  `SELECT COUNT(*) AS n FROM yetkinlik WHERE personel_id = ? AND gecerlilik IS NOT NULL
     AND gecerlilik < ? AND durum <> 'iptal'`, personelId, simdi())?.n ?? 0);

/* ==========================================================================
   HR-07 — atama çakışma kuralı
   ========================================================================== */
/**
 * Aynı personelin AKTİF atamaları tarih aralığında çakışamaz.
 * Açık uçlu bitiş (`bitis = NULL`) sonsuz kabul edilir.
 */
export function atamaCakismasi(personelId, baslangic, bitis, haricId = null) {
  const satirlar = sorgu(
    `SELECT a.*, s.ad AS santiye_ad FROM personel_atama a
       LEFT JOIN santiye s ON s.id = a.santiye_id
      WHERE a.personel_id = ? AND a.durum = 'aktif'${haricId ? ' AND a.id <> ?' : ''}`,
    ...(haricId ? [personelId, haricId] : [personelId]));
  const son = bitis ?? Number.MAX_SAFE_INTEGER;
  return satirlar.find((a) => {
    const aSon = a.bitis ?? Number.MAX_SAFE_INTEGER;
    return baslangic <= aSon && a.baslangic <= son;
  }) || null;
}

/* ==========================================================================
   HR-08/09 — dönem ve kilit kuralları
   ========================================================================== */
const donemAnahtari = (ms) => gunAnahtari(ms).slice(0, 7);

/** Bir gün + şantiye için dönemi bulur; yoksa AÇAR (dönem elle kurulmaz). */
function donemiBulVeyaAc(ctx, santiyeId, donem) {
  const mevcut = tek(
    `SELECT * FROM puantaj_donemi WHERE tenant_id = ? AND donem = ?
       AND ${santiyeId ? 'santiye_id = ?' : 'santiye_id IS NULL'}`,
    ...(santiyeId ? [ctx.tenant.id, donem, santiyeId] : [ctx.tenant.id, donem]));
  if (mevcut) return mevcut;
  const id = kimlik('donem');
  calistir(`INSERT INTO puantaj_donemi (id, tenant_id, santiye_id, donem, durum, olusturan, olusturuldu)
            VALUES (?,?,?,?, 'acik', ?,?)`, id, ctx.tenant.id, santiyeId || null, donem, ctx.kullanici.id, simdi());
  audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
    nesne: 'puantaj_donemi', nesneId: id, eylem: 'olustur', sonraki: { donem, santiyeId } });
  return tek('SELECT * FROM puantaj_donemi WHERE id = ?', id);
}

const DONEM_YAZILABILIR = ['acik', 'revizyon_istendi', 'reddedildi'];

function donemYazilabilirMi(donem) {
  if (!donem) return null;
  if (donem.durum === 'kapali') return 'Dönem kapatıldı; puantaj satırları kilitlidir. Düzeltme ters kayıtla, yeni dönemde yapılır.';
  if (!DONEM_YAZILABILIR.includes(donem.durum)) {
    return `Dönem "${donem.durum}" durumunda; onay sürecindeki döneme puantaj yazılamaz.`;
  }
  return null;
}

/* ==========================================================================
   MODÜL KURULUMU
   ========================================================================== */
export function kur(y, ekranRota) {
  /* ================= HR-01..04 Personel ================================ */
  kayitModulu(y, ekranRota, {
    nesne: 'personel', tablo: 'personel', kodNesnesi: 'personel', kimlikTuru: 'personel',
    rota: '/personel', formRotasi: '/personel/yeni',
    baslik: 'Personel', yeniEtiketi: 'Yeni personel', baslangicEtiketi: 'aday',
    listeKodu: 'HR-01', formKodu: 'HR-02', detayKodu: 'HR-03', duzenleKodu: 'HR-04',
    gecisNesnesi: 'personel', baslikAlani: 'ad_soyad',
    kapsamSecenekleri: PERSONEL_KAPSAMI,
    aramaAlanlari: ['ad_soyad', 'kod', 'gorev'], aramaYer: 'Ad soyad, kod veya görev…',
    sirala: 'ad_soyad ASC',
    filtreler: [
      { ad: 'durum', etiket: 'Çalışma durumu', secenekler: [
        { deger: 'aday', etiket: 'Aday' }, { deger: 'aktif', etiket: 'Aktif' },
        { deger: 'izinli', etiket: 'İzinli' }, { deger: 'pasif', etiket: 'Pasif' },
        { deger: 'ayrildi', etiket: 'Ayrıldı' }] },
      { ad: 'sozlesme_turu', etiket: 'Sözleşme', secenekler: SOZLESME_TURLERI },
      { ad: 'departman', etiket: 'Departman', secenekler: (ctx) => sorgu(
        `SELECT DISTINCT departman FROM personel WHERE tenant_id = ? AND departman IS NOT NULL ORDER BY departman`,
        ctx.tenant.id).map((r) => ({ deger: r.departman, etiket: r.departman })) },
    ],
    alanlar: [
      { ad: 'adSoyad', sutun: 'ad_soyad', etiket: 'Ad soyad', tur: 'metin', zorunlu: true, genis: true, enFazla: 120 },
      { ad: 'tcNo', sutun: 'tc_no', etiket: 'T.C. kimlik no', tur: 'metin', enFazla: 11, gorunur: tcAcik,
        dogrula: (d) => (/^\d{11}$/.test(d) ? null : '11 haneli olmalıdır.') },
      { ad: 'dogumTarihi', sutun: 'dogum_tarihi', etiket: 'Doğum tarihi', tur: 'tarih' },
      { ad: 'telefon', sutun: 'telefon', etiket: 'Telefon', tur: 'metin', enFazla: 30 },
      { ad: 'eposta', sutun: 'eposta', etiket: 'E-posta', tur: 'metin', enFazla: 160 },
      { ad: 'adres', sutun: 'adres', etiket: 'Adres', tur: 'uzunMetin', genis: true },

      { ad: 'gorev', sutun: 'gorev', etiket: 'Görev', tur: 'metin', grup: 'Çalışma bilgileri', enFazla: 120 },
      { ad: 'departman', sutun: 'departman', etiket: 'Departman', tur: 'metin', grup: 'Çalışma bilgileri', enFazla: 80 },
      { ad: 'iseGiris', sutun: 'ise_giris', etiket: 'İşe giriş tarihi', tur: 'tarih', grup: 'Çalışma bilgileri',
        ipucu: 'İşe giriş tarihi girilmeden personel aktifleştirilemez.' },
      { ad: 'sozlesmeTuru', sutun: 'sozlesme_turu', etiket: 'Sözleşme türü', tur: 'secim',
        secenekler: SOZLESME_TURLERI, grup: 'Çalışma bilgileri' },
      { ad: 'sirketId', sutun: 'sirket_id', etiket: 'Tüzel kişi', tur: 'secim', grup: 'Çalışma bilgileri',
        secenekler: (ctx) => sorgu('SELECT id, kod, unvan FROM sirket WHERE tenant_id = ? ORDER BY unvan', ctx.tenant.id)
          .map((s) => ({ deger: s.id, etiket: `${s.kod} — ${s.unvan}` })) },
      { ad: 'kullaniciId', sutun: 'kullanici_id', etiket: 'Uygulama hesabı', tur: 'secim',
        secenekler: kullaniciSecenekleri, grup: 'Çalışma bilgileri',
        ipucu: 'Çalışan self-servis (HR-14) bu bağdan çözülür.' },

      /* Hassas alanlar: maskeli rolde çizilmez ve yazılamaz. */
      { ad: 'maas', sutun: 'maas_minor', etiket: 'Brüt ücret', tur: 'para', grup: 'Ücret ve banka (hassas)',
        gorunur: maasAcik, ipucu: 'Bu alan alan düzeyi maskelemeye tabidir.' },
      { ad: 'bankaIban', sutun: 'banka_iban', etiket: 'IBAN', tur: 'metin', grup: 'Ücret ve banka (hassas)',
        gorunur: ibanAcik, enFazla: 34 },
    ],
    grupAciklamalari: {
      'Ücret ve banka (hassas)': 'Alan düzeyi maskelemeye tabidir; yetkisiz rolde bu bölüm hiç gösterilmez.',
    },
    sabitAlanlar: () => ({ durum: 'aday' }),
    kpi: (ctx, toplam) => [
      { etiket: 'Aktif personel', deger: sayi(sayac(ctx.tenant.id, 'personel', `durum = 'aktif'`)), ikon: 'fa-users' },
      { etiket: 'Aday', deger: sayi(sayac(ctx.tenant.id, 'personel', `durum = 'aday'`)), ikon: 'fa-user-plus' },
      { etiket: 'Aktif atama', deger: sayi(sayac(ctx.tenant.id, 'personel_atama', `durum = 'aktif'`)), ikon: 'fa-helmet-safety' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ],
    listeSutunlari: (ctx) => [
      { ad: 'kod', etiket: 'Sicil' },
      { ad: 'ad_soyad', etiket: 'Personel', govde: (r) => h`<a href="/personel/${r.id}"><b>${r.ad_soyad}</b></a>${
        r.gorev ? h`<br><span class="muted">${r.gorev}</span>` : ''}` },
      { ad: 'departman', etiket: 'Departman', govde: (r) => r.departman || '—' },
      { ad: 'atama', etiket: 'Güncel atama', govde: (r) => {
        const a = tek(`SELECT s.kod, s.ad FROM personel_atama a JOIN santiye s ON s.id = a.santiye_id
                        WHERE a.personel_id = ? AND a.durum = 'aktif' ORDER BY a.baslangic DESC LIMIT 1`, r.id);
        return a ? h`${a.kod} — ${a.ad}` : h`<span class="muted">atanmadı</span>`;
      } },
      { ad: 'ise_giris', etiket: 'İşe giriş', govde: (r) => (r.ise_giris ? tarih(r.ise_giris) : '—') },
      { ad: 'maas_minor', etiket: 'Brüt ücret', hizala: 'sag', govde: (r) => maasGoster(ctx, r) },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum, { aday: 'Aday', aktif: 'Aktif',
        izinli: 'İzinli', pasif: 'Pasif', ayrildi: 'Ayrıldı' }[r.durum]) },
    ],
    bosDurum: { baslik: 'Personel kaydı yok', ikon: 'fa-users',
      aciklama: 'Personel "aday" durumunda açılır; işe giriş sihirbazı tamamlanınca aktifleşir.' },
    detayBilgileri: (r, ctx) => [
      { etiket: 'Görev', deger: r.gorev || '—' },
      { etiket: 'Departman', deger: r.departman || '—' },
      { etiket: 'İşe giriş', deger: r.ise_giris ? tarih(r.ise_giris) : '—' },
      { etiket: 'Sözleşme', deger: SOZLESME_TURLERI.find((s) => s.deger === r.sozlesme_turu)?.etiket || '—' },
      { etiket: 'Telefon', deger: r.telefon || '—' },
      { etiket: 'Brüt ücret', deger: maasGoster(ctx, r) },
      { etiket: 'IBAN', deger: ibanAcik(ctx) ? (r.banka_iban || '—') : MASKE },
      { etiket: 'T.C. kimlik no', deger: tcAcik(ctx) ? (r.tc_no || '—') : MASKE },
      { etiket: 'Uygulama hesabı', deger: r.kullanici_id ? kullaniciAdi(r.kullanici_id) : '—' },
    ],
    detayEylemleri: (ctx, r) => (r.durum === 'aday' && yetkiVar(ctx, 'HR-05:goruntule')
      ? B.btn('İşe giriş sihirbazı', { rota: `/personel/${r.id}/ise-giris`, ikon: 'fa-clipboard-list' }) : null),
    detayEkleri: (ctx, r) => personelSekmeleri(ctx, r),
    yanPanel: (ctx, r) => {
      const uyari = belgeUyarisi(r.id);
      if (!uyari) return h``;
      return h`<div class="gv-card"><div class="gc-body">
        ${B.sonucSeridi({ tur: 'warn', baslik: `${uyari} belgenin süresi doldu`,
          aciklama: 'Süresi dolan belge sahada çalışma engelidir; yenileme kaydı girilmeli.' })}
      </div></div>`;
    },
  });

  /* HR-05 İşe giriş sihirbazı ------------------------------------------- */
  ekranRota(y, 'HR-05', {
    get: (ctx, _g, params) => iseGirisSayfasi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('HR-05');
      yetkiZorunlu(ctx, `${e.kod}:tamamla`);
      csrfZorunlu(ctx, govde);
      const p = kaydiAl(ctx, 'personel', 'personel', params.id);
      try {
        const eksikler = iseGirisAdimlari(ctx, p).filter((a) => a.zorunlu && !a.tamam);
        if (eksikler.length) {
          throw GecisIzinsiz(`İşe giriş tamamlanamaz — eksik adım: ${eksikler.map((a) => a.ad).join(', ')}.`);
        }
        gecisYap(ctx, { nesne: 'personel', tablo: 'personel', kayit: p, eylem: 'ise_al',
          gerekce: govde.gerekce || null, ekranKodu: 'HR-05' });
        return yonlendir(ctx, `/personel/${p.id}?islem=${encodeURIComponent('İşe giriş tamamlandı, personel aktif')}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return iseGirisSayfasi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* Personel detayındaki yetkinlik/belge satırı (HR-03 içinden). */
  y.post('/personel/:id/yetkinlikler', (ctx, govde, params) => {
    yetkiZorunlu(ctx, 'HR-03:guncelle');
    csrfZorunlu(ctx, govde);
    const p = kaydiAl(ctx, 'personel', 'personel', params.id);
    const ad = String(govde.ad || '').trim();
    if (!ad) throw DogrulamaHatasi('Belge adı zorunludur.', { alanlar: { ad: ['Belge adı girin.'] } });
    islem(() => {
      const id = kimlik('yetkinlik');
      calistir(`INSERT INTO yetkinlik (id, tenant_id, personel_id, tur, ad, belge_no, veren_kurum,
                  gecerlilik, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?, 'gecerli', ?,?)`,
        id, ctx.tenant.id, p.id, govde.tur || 'diger', ad, govde.belgeNo || null,
        govde.verenKurum || null, govde.gecerlilik ? gunBaslangici(govde.gecerlilik) : null,
        ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'personel', nesneId: p.id, eylem: 'belge_eklendi', sonraki: { ad, tur: govde.tur } });
    });
    return yonlendir(ctx, `/personel/${p.id}?sekme=belgeler&islem=${encodeURIComponent('Belge kaydedildi')}`);
  }, { ekran: ekranNesnesi('HR-03') });

  /* ================= HR-07 Şantiye atamaları =========================== */
  kayitModulu(y, ekranRota, {
    nesne: 'personel_atama', tablo: 'personel_atama', kimlikTuru: 'atama',
    rota: '/personel-atamalari', formRotasi: '/personel-atamalari?yeni=1',
    baslik: 'Şantiye ataması', yeniEtiketi: 'Yeni atama',
    listeKodu: 'HR-07', formKodu: null, detayKodu: null, gecisNesnesi: 'personel',
    aramaAlanlari: ['gorev'], aramaYer: 'Görev…',
    sirala: 'baslangic DESC',
    filtreler: [
      { ad: 'durum', etiket: 'Durum', secenekler: [
        { deger: 'aktif', etiket: 'Aktif' }, { deger: 'sonlandi', etiket: 'Sonlandı' },
        { deger: 'iptal', etiket: 'İptal' }] },
      { ad: 'santiye_id', etiket: 'Şantiye', secenekler: santiyeSecenekleri },
    ],
    alanlar: [],
    kpi: (ctx, toplam) => [
      { etiket: 'Aktif atama', deger: sayi(sayac(ctx.tenant.id, 'personel_atama', `durum = 'aktif'`)), ikon: 'fa-helmet-safety' },
      { etiket: 'Atanmamış aktif personel', ikon: 'fa-user-slash', ton: 'warn', deger: sayi(Number(tek(
        `SELECT COUNT(*) AS n FROM personel p WHERE p.tenant_id = ? AND p.durum = 'aktif'
           AND NOT EXISTS (SELECT 1 FROM personel_atama a WHERE a.personel_id = p.id AND a.durum = 'aktif')`,
        ctx.tenant.id)?.n ?? 0)) },
      { etiket: 'Bu ay başlayan', deger: sayi(sayac(ctx.tenant.id, 'personel_atama', 'baslangic >= ?',
        gunBaslangici(gunAnahtari(simdi()).slice(0, 8) + '01'))), ikon: 'fa-calendar-plus' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ],
    listeSutunlari: (ctx) => [
      { ad: 'personel_id', etiket: 'Personel', govde: (r) => {
        const p = tek('SELECT kod, ad_soyad FROM personel WHERE id = ?', r.personel_id);
        return p ? h`<a href="/personel/${r.personel_id}"><b>${p.ad_soyad}</b></a><br><span class="muted">${p.kod}</span>` : '—';
      } },
      { ad: 'santiye_id', etiket: 'Şantiye', govde: (r) => {
        const s = tek('SELECT kod, ad FROM santiye WHERE id = ?', r.santiye_id);
        return s ? h`${s.kod} — ${s.ad}` : '—';
      } },
      { ad: 'gorev', etiket: 'Görev', govde: (r) => r.gorev || '—' },
      { ad: 'baslangic', etiket: 'Başlangıç', govde: (r) => tarih(r.baslangic) },
      { ad: 'bitis', etiket: 'Bitiş', govde: (r) => (r.bitis ? tarih(r.bitis) : h`<span class="muted">açık uçlu</span>`) },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(
        r.durum === 'aktif' ? 'onaylandi' : r.durum === 'iptal' ? 'iptal' : 'kapali',
        { aktif: 'Aktif', sonlandi: 'Sonlandı', iptal: 'İptal' }[r.durum]) },
      { ad: 'islem', etiket: '', govde: (r) => (r.durum !== 'aktif' ? '—'
        : h`<form method="post" action="/personel-atamalari" style="display:inline">${ham(csrfAlani(ctx))}
            <input type="hidden" name="_eylem" value="sonlandir">
            <input type="hidden" name="id" value="${r.id}">
            <input type="hidden" name="surum" value="${r.surum}">
            <button class="btn btn-ghost btn-sm" type="submit">Sonlandır</button></form>`) },
    ],
    bosDurum: { baslik: 'Atama yok', ikon: 'fa-helmet-safety',
      aciklama: 'Atamalar tarih aralıklıdır; aynı personelin çakışan aktif ataması kabul edilmez.' },
    altForm: (ctx) => B.form({
      rota: '/personel-atamalari', csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Yeni şantiye ataması',
        aciklama: 'Çakışan tarih aralığı sunucuda reddedilir; bitiş boş bırakılırsa atama açık uçludur.',
        alanlar: h`
        ${B.alan({ ad: 'personelId', etiket: 'Personel', zorunlu: true,
          secenekler: [{ deger: '', etiket: 'Seçin…' }, ...personelSecenekleri(ctx)] })}
        ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye', zorunlu: true,
          secenekler: [{ deger: '', etiket: 'Seçin…' }, ...santiyeSecenekleri(ctx)] })}
        ${B.alan({ ad: 'gorev', etiket: 'Sahadaki görev' })}
        ${B.alan({ ad: 'baslangic', etiket: 'Başlangıç', tur: 'date', zorunlu: true, deger: gunAnahtari(simdi()) })}
        ${B.alan({ ad: 'bitis', etiket: 'Bitiş (boşsa açık uçlu)', tur: 'date' })}` }],
      eylemler: B.btn('Atamayı kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
    }),
  });

  y.post('/personel-atamalari', (ctx, govde) => {
    csrfZorunlu(ctx, govde);
    if (govde._eylem === 'sonlandir') return atamaSonlandir(ctx, govde);
    yetkiZorunlu(ctx, 'HR-07:olustur');
    return atamaAc(ctx, govde);
  }, { ekran: ekranNesnesi('HR-07') });

  /* ================= HR-08 Puantaj ===================================== */
  ekranRota(y, 'HR-08', {
    get: (ctx) => puantajSayfasi(ctx),
    post: (ctx, govde) => {
      yetkiZorunlu(ctx, 'HR-08:olustur');
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = puantajKaydet(ctx, govde);
        const p = new URLSearchParams();
        if (govde.santiyeId) p.set('santiye_id', govde.santiyeId);
        if (govde.gun) p.set('donem', donemAnahtari(gunBaslangici(govde.gun)));
        p.set('islem', mesaj);
        return yonlendir(ctx, `/puantaj?${p.toString()}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return puantajSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= HR-09 Puantaj dönem kapanışı ====================== */
  ekranRota(y, 'HR-09', {
    get: (ctx) => donemKapanisSayfasi(ctx),
    post: (ctx, govde) => {
      const e = ekranNesnesi('HR-09');
      yetkiZorunlu(ctx, `${e.kod}:karar_ver`);
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = donemIslemi(ctx, govde);
        return yonlendir(ctx, `/puantaj/donem-kapanis?donem_id=${govde.donemId}&islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return donemKapanisSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });
}

/* ==========================================================================
   HR-03 sekmeleri
   ========================================================================== */
function personelSekmeleri(ctx, r) {
  const sekme = ctx.sorgu.get('sekme') || 'atamalar';
  const atamalar = sorgu(
    `SELECT a.*, s.kod AS santiye_kod, s.ad AS santiye_ad FROM personel_atama a
       LEFT JOIN santiye s ON s.id = a.santiye_id
      WHERE a.personel_id = ? ORDER BY a.baslangic DESC`, r.id);
  const belgeler = sorgu('SELECT * FROM yetkinlik WHERE personel_id = ? ORDER BY gecerlilik IS NULL, gecerlilik ASC', r.id);
  const puantajlar = sorgu(
    `SELECT p.*, d.donem, d.durum AS donem_durum FROM puantaj p
       LEFT JOIN puantaj_donemi d ON d.id = p.donem_id
      WHERE p.personel_id = ? ORDER BY p.gun DESC LIMIT 31`, r.id);

  const liste = [
    { ad: 'atamalar', etiket: 'Atamalar', adet: atamalar.length },
    { ad: 'belgeler', etiket: 'Belge ve yetkinlik', adet: belgeler.length },
    { ad: 'puantaj', etiket: 'Puantaj (son 31 gün)', adet: puantajlar.length },
    { ad: 'gecmis', etiket: 'Denetim geçmişi' },
  ];

  const govde = sekme === 'belgeler' ? h`
<div class="gv-card"><div class="gc-body flush">${B.tablo({
    satirlar: belgeler,
    bosDurum: { baslik: 'Belge yok', aciklama: 'Sertifika, eğitim, sağlık raporu ve ehliyet kayıtları burada tutulur.', ikon: 'fa-id-card' },
    sutunlar: [
      { ad: 'ad', etiket: 'Belge', govde: (b) => h`<b>${b.ad}</b><br><span class="muted">${
        YETKINLIK_TURLERI.find((t) => t.deger === b.tur)?.etiket || b.tur}</span>` },
      { ad: 'belge_no', etiket: 'No', govde: (b) => b.belge_no || '—' },
      { ad: 'veren_kurum', etiket: 'Veren kurum', govde: (b) => b.veren_kurum || '—' },
      { ad: 'gecerlilik', etiket: 'Geçerlilik', govde: (b) => !b.gecerlilik ? h`<span class="muted">süresiz</span>`
        : b.gecerlilik < simdi() ? B.isaret(`${tarih(b.gecerlilik)} — doldu`, 'danger')
        : b.gecerlilik < simdi() + 30 * GUN_MS ? B.isaret(`${tarih(b.gecerlilik)} — 30 gün içinde`, 'warn')
        : tarih(b.gecerlilik) },
    ],
  })}</div></div>
${yetkiVar(ctx, 'HR-03:guncelle') ? B.form({
    rota: `/personel/${r.id}/yetkinlikler`, csrf: csrfAlani(ctx),
    bolumler: [{ baslik: 'Belge ekle', alanlar: h`
      ${B.alan({ ad: 'ad', etiket: 'Belge adı', zorunlu: true, genis: true })}
      ${B.alan({ ad: 'tur', etiket: 'Tür', deger: 'sertifika', secenekler: YETKINLIK_TURLERI })}
      ${B.alan({ ad: 'belgeNo', etiket: 'Belge no' })}
      ${B.alan({ ad: 'verenKurum', etiket: 'Veren kurum' })}
      ${B.alan({ ad: 'gecerlilik', etiket: 'Geçerlilik bitişi', tur: 'date' })}` }],
    eylemler: B.btn('Belgeyi kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`
    : sekme === 'puantaj' ? h`
<div class="gv-card"><div class="gc-body flush">${B.tablo({
      satirlar: puantajlar,
      bosDurum: { baslik: 'Puantaj kaydı yok', aciklama: 'Günlük puantaj /puantaj ekranından girilir.', ikon: 'fa-calendar-check' },
      sutunlar: [
        { ad: 'gun', etiket: 'Gün' },
        { ad: 'vardiya', etiket: 'Vardiya', govde: (p) => VARDIYALAR.find((v) => v.deger === p.vardiya)?.etiket || p.vardiya },
        { ad: 'normal_saat', etiket: 'Normal', hizala: 'sag' },
        { ad: 'fazla_saat', etiket: 'Fazla', hizala: 'sag' },
        { ad: 'devamsizlik', etiket: 'Devamsızlık', govde: (p) => p.devamsizlik
          ? B.isaret(DEVAMSIZLIK.find((d) => d.deger === p.devamsizlik)?.etiket || p.devamsizlik, 'warn') : '—' },
        { ad: 'donem', etiket: 'Dönem', govde: (p) => h`${p.donem || '—'}${p.kilit ? ' ' : ''}${
          p.kilit ? B.isaret('kilitli', 'ok') : ''}` },
      ],
    })}</div></div>`
    : sekme === 'gecmis' ? gecmisKarti('personel', r)
    : h`
<div class="gv-card"><div class="gc-body flush">${B.tablo({
      satirlar: atamalar,
      bosDurum: { baslik: 'Atama yok', aciklama: 'Şantiye ataması /personel-atamalari ekranından yapılır.', ikon: 'fa-helmet-safety' },
      sutunlar: [
        { ad: 'santiye_ad', etiket: 'Şantiye', govde: (a) => h`<b>${a.santiye_kod || '—'}</b> ${a.santiye_ad || ''}` },
        { ad: 'gorev', etiket: 'Görev', govde: (a) => a.gorev || '—' },
        { ad: 'baslangic', etiket: 'Başlangıç', govde: (a) => tarih(a.baslangic) },
        { ad: 'bitis', etiket: 'Bitiş', govde: (a) => (a.bitis ? tarih(a.bitis) : h`<span class="muted">açık uçlu</span>`) },
        { ad: 'durum', etiket: 'Durum', govde: (a) => B.rozet(
          a.durum === 'aktif' ? 'onaylandi' : a.durum === 'iptal' ? 'iptal' : 'kapali',
          { aktif: 'Aktif', sonlandi: 'Sonlandı', iptal: 'İptal' }[a.durum]) },
      ],
    })}</div></div>`;

  return h`${B.sekmeler({ sekmeler: liste, aktif: sekme, rota: `/personel/${r.id}`, sorgu: ctx.sorgu })}${govde}`;
}

/* ==========================================================================
   HR-05 İşe giriş sihirbazı
   ========================================================================== */
/** Sihirbaz adımları GERÇEK kayıtlardan hesaplanır; kullanıcı "tamam" diyemez. */
function iseGirisAdimlari(ctx, p) {
  const atama = tek(`SELECT * FROM personel_atama WHERE personel_id = ? AND durum = 'aktif' LIMIT 1`, p.id);
  const belge = Number(tek(`SELECT COUNT(*) AS n FROM yetkinlik WHERE personel_id = ? AND durum = 'gecerli'`, p.id)?.n ?? 0);
  const suresiDolan = belgeUyarisi(p.id);
  return [
    { ad: 'Özlük bilgileri', zorunlu: true, tamam: !!(p.ad_soyad && p.tc_no && p.gorev),
      /* Koşul kimlik numarasının VARLIĞINA bakar, değerini göstermez. */
      aciklama: 'Ad soyad, T.C. kimlik no ve görev alanları dolu olmalı.',
      rota: `/personel/${p.id}/duzenle` },
    { ad: 'İşe giriş tarihi', zorunlu: true, tamam: !!p.ise_giris,
      aciklama: 'Puantaj ve sözleşme süreleri bu tarihten hesaplanır.',
      rota: `/personel/${p.id}/duzenle` },
    { ad: 'Belge ve yetkinlik', zorunlu: true, tamam: belge > 0 && suresiDolan === 0,
      aciklama: suresiDolan ? `${suresiDolan} belgenin süresi dolmuş; yenilenmeden giriş tamamlanamaz.`
        : 'En az bir geçerli belge (sağlık raporu, İSG eğitimi, sertifika) kayıtlı olmalı.',
      rota: `/personel/${p.id}?sekme=belgeler` },
    { ad: 'Şantiye ataması', zorunlu: true, tamam: !!atama,
      aciklama: 'Aktif bir şantiye ataması olmadan saha erişimi ve puantaj açılmaz.',
      rota: '/personel-atamalari' },
    { ad: 'Uygulama hesabı', zorunlu: false, tamam: !!p.kullanici_id,
      aciklama: 'İsteğe bağlı: çalışan self-servis (HR-14) erişimi bu bağdan çözülür.',
      rota: `/personel/${p.id}/duzenle` },
    { ad: 'Zimmet ve kart teslimi', zorunlu: false, tamam: false,
      aciklama: 'Zimmet (AST-04) Faz 4, kart ataması (CRD-06) Faz 5 ile bu sihirbaza bağlanacak; '
        + 'bu sürümde adım kapalıdır ve tamamlanmış sayılmaz.',
      rota: null, planli: true },
  ];
}

function iseGirisSayfasi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('HR-05');
  yetkiZorunlu(ctx, e.yetki);
  const p = kaydiAl(ctx, 'personel', 'personel', id);
  const adimlar = iseGirisAdimlari(ctx, p);
  const eksik = adimlar.filter((a) => a.zorunlu && !a.tamam);
  const tamamlanabilir = eksik.length === 0 && p.durum === 'aday';

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${B.detayOzetSeridi({
    kod: p.kod, baslik: p.ad_soyad, durum: p.durum, surum: p.surum,
    bilgiler: [
      { etiket: 'Görev', deger: p.gorev || '—' },
      { etiket: 'İşe giriş', deger: p.ise_giris ? tarih(p.ise_giris) : '—' },
      { etiket: 'Tamamlanan zorunlu adım', deger: `${adimlar.filter((a) => a.zorunlu && a.tamam).length} / ${adimlar.filter((a) => a.zorunlu).length}` },
    ],
    birincilEylem: B.btn('Personel kaydına dön', { rota: `/personel/${p.id}` }),
  })}
<div class="dash-cols">
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>İşe giriş kontrol listesi</b>
      <span>Her adım gerçek kayıttan doğrulanır; adımı elle "tamam" işaretleyemezsiniz.</span></div></div>
    <div class="gc-body flush">${B.tablo({
    satirlar: adimlar,
    bosDurum: { baslik: 'Adım yok' },
    sutunlar: [
      { ad: 'durum', etiket: '', govde: (a) => a.tamam ? B.isaret('tamam', 'ok')
        : a.planli ? B.isaret('sonraki fazda', 'info')
        : a.zorunlu ? B.isaret('eksik', 'danger') : B.isaret('isteğe bağlı', 'warn') },
      { ad: 'ad', etiket: 'Adım', govde: (a) => h`<b>${a.ad}</b><br><span class="muted">${a.aciklama}</span>` },
      { ad: 'rota', etiket: '', govde: (a) => (a.rota ? B.btn('Aç', { rota: a.rota, kucuk: true }) : '—') },
    ],
  })}</div>
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Girişi tamamla</b>
        <span>Personel "aday" durumundan "aktif"e yalnız bu adımla geçer.</span></div></div>
      <div class="gc-body">
        ${p.durum !== 'aday'
    ? B.sonucSeridi({ tur: 'ok', baslik: 'İşe giriş zaten tamamlanmış',
      aciklama: `Personel "${p.durum}" durumunda.` })
    : eksik.length
      ? B.sonucSeridi({ tur: 'warn', baslik: `${eksik.length} zorunlu adım eksik`,
        aciklama: eksik.map((a) => a.ad).join(', ') })
      : ''}
        ${tamamlanabilir && yetkiVar(ctx, 'HR-05:tamamla') ? h`
        <form method="post" action="/personel/${p.id}/ise-giris" data-gform="1">
          ${ham(csrfAlani(ctx))}
          ${B.alan({ ad: 'gerekce', etiket: 'Not', tur: 'metin' })}
          <div style="margin-top:12px">${B.btn('İşe girişi tamamla ve aktifleştir',
            { tur: 'acc', gonder: true, ikon: 'fa-user-check' })}</div>
        </form>` : ''}
      </div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: p.kod, baslik: p.ad_soyad }));
}

/* ==========================================================================
   HR-07 işlemleri
   ========================================================================== */
function atamaAc(ctx, govde) {
  const hatalar = {};
  const p = govde.personelId ? tek('SELECT * FROM personel WHERE id = ? AND tenant_id = ?', govde.personelId, ctx.tenant.id) : null;
  const s = govde.santiyeId ? tek('SELECT * FROM santiye WHERE id = ? AND tenant_id = ?', govde.santiyeId, ctx.tenant.id) : null;
  if (!p) hatalar.personelId = ['Personel seçin.'];
  if (!s) hatalar.santiyeId = ['Şantiye seçin.'];
  if (!govde.baslangic) hatalar.baslangic = ['Başlangıç tarihi girin.'];
  if (Object.keys(hatalar).length) throw DogrulamaHatasi('Atama bilgileri eksik.', { alanlar: hatalar });

  const baslangic = gunBaslangici(govde.baslangic);
  const bitis = govde.bitis ? gunBaslangici(govde.bitis) : null;
  if (bitis != null && bitis < baslangic) {
    throw DogrulamaHatasi('Bitiş tarihi başlangıçtan önce olamaz.', { alanlar: { bitis: ['Tarih aralığı geçersiz.'] } });
  }
  if (p.durum === 'ayrildi') throw GecisIzinsiz('İşten ayrılmış personele yeni atama açılamaz.');

  /* HR-07 KABUL: çakışan aktif atama reddedilir. */
  const cakisan = atamaCakismasi(p.id, baslangic, bitis);
  if (cakisan) {
    throw Cakisma(`${p.ad_soyad} için ${tarih(cakisan.baslangic)}–${cakisan.bitis ? tarih(cakisan.bitis) : 'açık uçlu'}`
      + ` aralığında "${cakisan.santiye_ad || 'başka şantiye'}" ataması zaten var. Önce mevcut atamayı sonlandırın.`);
  }

  islem(() => {
    const id = kimlik('atama');
    calistir(`INSERT INTO personel_atama (id, tenant_id, personel_id, santiye_id, proje_id, gorev,
                baslangic, bitis, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?, 'aktif', ?,?)`,
      id, ctx.tenant.id, p.id, s.id, s.proje_id || null, govde.gorev || null,
      baslangic, bitis, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'personel_atama', nesneId: id, eylem: 'olustur',
      sonraki: { personel: p.kod, santiye: s.kod, baslangic, bitis } });
  });
  return yonlendir(ctx, '/personel-atamalari?olusturuldu=1');
}

function atamaSonlandir(ctx, govde) {
  yetkiZorunlu(ctx, 'HR-07:guncelle');
  const a = tek('SELECT * FROM personel_atama WHERE id = ? AND tenant_id = ?', govde.id, ctx.tenant.id);
  if (!a) throw Bulunamadi('Atama bulunamadı.');
  if (a.durum !== 'aktif') throw GecisIzinsiz('Yalnız aktif atama sonlandırılabilir.');
  islem(() => {
    surumluGuncelle('personel_atama', a.id, Number(govde.surum),
      { durum: 'sonlandi', bitis: a.bitis ?? simdi() },
      { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'personel_atama', nesneId: a.id, eylem: 'sonlandirildi',
      onceki: { durum: 'aktif' }, sonraki: { durum: 'sonlandi' } });
  });
  return yonlendir(ctx, '/personel-atamalari?islem=1');
}

/* ==========================================================================
   HR-08 Puantaj
   ========================================================================== */
function puantajKaydet(ctx, govde) {
  const hatalar = {};
  const p = govde.personelId ? tek('SELECT * FROM personel WHERE id = ? AND tenant_id = ?', govde.personelId, ctx.tenant.id) : null;
  if (!p) hatalar.personelId = ['Personel seçin.'];
  if (!govde.gun) hatalar.gun = ['Gün seçin.'];
  const normal = Number(govde.normalSaat ?? 0);
  const fazla = Number(govde.fazlaSaat ?? 0);
  if (!Number.isInteger(normal) || normal < 0 || normal > 24) hatalar.normalSaat = ['0–24 arası tam saat girin.'];
  if (!Number.isInteger(fazla) || fazla < 0 || fazla > 24) hatalar.fazlaSaat = ['0–24 arası tam saat girin.'];
  if (normal + fazla > 24) hatalar.fazlaSaat = ['Normal + fazla mesai 24 saati aşamaz.'];
  if (Object.keys(hatalar).length) throw DogrulamaHatasi('Puantaj girişi geçersiz.', { alanlar: hatalar });

  const gunMs = gunBaslangici(govde.gun);
  if (gunMs > simdi() + GUN_MS) throw DogrulamaHatasi('Gelecek güne puantaj girilemez.', { alanlar: { gun: ['İleri tarih.'] } });
  const gun = gunAnahtari(gunMs);

  /* Atama, puantajın ön koşuludur: hangi şantiyeye çalıştığı kayıttan çözülür. */
  const atama = tek(
    `SELECT * FROM personel_atama WHERE personel_id = ? AND durum = 'aktif'
       AND baslangic <= ? AND (bitis IS NULL OR bitis >= ?) LIMIT 1`, p.id, gunMs, gunMs);
  const santiyeId = govde.santiyeId || atama?.santiye_id || null;
  if (!santiyeId) throw DogrulamaHatasi('Bu güne ait aktif şantiye ataması yok; önce atama açın.',
    { alanlar: { personelId: ['Atama bulunamadı.'] } });

  return islem(() => {
    const donem = donemiBulVeyaAc(ctx, santiyeId, donemAnahtari(gunMs));
    const engel = donemYazilabilirMi(donem);
    if (engel) throw GecisIzinsiz(engel);

    const mevcut = tek('SELECT * FROM puantaj WHERE personel_id = ? AND gun = ?', p.id, gun);
    const alanlar = {
      donem_id: donem.id, santiye_id: santiyeId, vardiya: govde.vardiya || 'gunduz',
      normal_saat: normal, fazla_saat: fazla, devamsizlik: govde.devamsizlik || null,
      kaynak: 'elle',
    };
    if (mevcut) {
      if (mevcut.kilit) throw GecisIzinsiz('Bu puantaj satırı kilitli; kapalı döneme ait kayıt değiştirilemez.');
      surumluGuncelle('puantaj', mevcut.id, mevcut.surum, alanlar,
        { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'puantaj', nesneId: mevcut.id, eylem: 'guncelle',
        onceki: { normal: mevcut.normal_saat, fazla: mevcut.fazla_saat }, sonraki: alanlar });
      return `${p.ad_soyad} — ${gun} puantajı güncellendi`;
    }
    const id = kimlik('puantaj');
    calistir(`INSERT INTO puantaj (id, tenant_id, donem_id, personel_id, santiye_id, gun, vardiya,
                normal_saat, fazla_saat, devamsizlik, kaynak, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, ctx.tenant.id, donem.id, p.id, santiyeId, gun, alanlar.vardiya,
      normal, fazla, alanlar.devamsizlik, 'elle', ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'puantaj', nesneId: id, eylem: 'olustur', sonraki: { personel: p.kod, gun, normal, fazla } });
    return `${p.ad_soyad} — ${gun} puantajı kaydedildi`;
  });
}

function puantajSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('HR-08');
  yetkiZorunlu(ctx, e.yetki);
  const secilenDonem = ctx.sorgu.get('donem') || donemAnahtari(simdi());
  const secilenSantiye = ctx.sorgu.get('santiye_id') || '';

  const kosullar = ['p.tenant_id = ?']; const parametreler = [ctx.tenant.id];
  kosullar.push("substr(p.gun, 1, 7) = ?"); parametreler.push(secilenDonem);
  if (secilenSantiye) { kosullar.push('p.santiye_id = ?'); parametreler.push(secilenSantiye); }
  const q = (ctx.sorgu.get('q') || '').trim();
  if (q) { kosullar.push('pe.ad_soyad LIKE ?'); parametreler.push(`%${q}%`); }

  const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
  const nerede = kosullar.join(' AND ');
  const toplam = Number(tek(
    `SELECT COUNT(*) AS n FROM puantaj p JOIN personel pe ON pe.id = p.personel_id WHERE ${nerede}`,
    ...parametreler)?.n ?? 0);
  const satirlar = sorgu(
    `SELECT p.*, pe.kod AS personel_kod, pe.ad_soyad, s.kod AS santiye_kod, d.durum AS donem_durum
       FROM puantaj p
       JOIN personel pe ON pe.id = p.personel_id
       LEFT JOIN santiye s ON s.id = p.santiye_id
       LEFT JOIN puantaj_donemi d ON d.id = p.donem_id
      WHERE ${nerede} ORDER BY p.gun DESC, pe.ad_soyad LIMIT ? OFFSET ?`,
    ...parametreler, boyut, atla);

  const donem = secilenSantiye
    ? tek('SELECT * FROM puantaj_donemi WHERE tenant_id = ? AND donem = ? AND santiye_id = ?',
      ctx.tenant.id, secilenDonem, secilenSantiye)
    : null;
  const kilitli = donem && donemYazilabilirMi(donem);
  const toplamNormal = satirlar.reduce((a, r) => a + r.normal_saat, 0);
  const toplamFazla = satirlar.reduce((a, r) => a + r.fazla_saat, 0);

  const donemler = sorgu(
    `SELECT DISTINCT substr(gun, 1, 7) AS d FROM puantaj WHERE tenant_id = ? ORDER BY d DESC LIMIT 24`, ctx.tenant.id)
    .map((r) => ({ deger: r.d, etiket: r.d }));
  if (!donemler.some((d) => d.deger === secilenDonem)) donemler.unshift({ deger: secilenDonem, etiket: secilenDonem });

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${kilitli ? B.sonucSeridi({ tur: 'warn', baslik: 'Bu dönem yazmaya kapalı', aciklama: kilitli }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Dönem', deger: secilenDonem, ikon: 'fa-calendar-days' },
      { etiket: 'Normal saat', deger: sayi(toplamNormal), ikon: 'fa-clock', alt: 'bu sayfadaki satırlar' },
      { etiket: 'Fazla mesai', deger: sayi(toplamFazla), ikon: 'fa-clock-rotate-left', ton: toplamFazla ? 'warn' : '' },
      { etiket: 'Kayıt', deger: sayi(toplam), ikon: 'fa-list' },
    ]),
    filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Personel adı…',
      filtreler: [
        { ad: 'donem', etiket: 'Dönem', secenekler: donemler },
        { ad: 'santiye_id', etiket: 'Şantiye', secenekler: santiyeSecenekleri(ctx) },
      ] }),
    icerik: B.tablo({
      satirlar,
      bosDurum: { baslik: 'Bu dönemde puantaj yok', ikon: 'fa-calendar-check',
        aciklama: 'Aşağıdaki formdan gün bazlı puantaj girin; dönem ilk kayıtla açılır.' },
      sutunlar: [
        { ad: 'gun', etiket: 'Gün' },
        { ad: 'ad_soyad', etiket: 'Personel', govde: (r) => h`<a href="/personel/${r.personel_id}"><b>${r.ad_soyad}</b></a>
          <br><span class="muted">${r.personel_kod}</span>` },
        { ad: 'santiye_kod', etiket: 'Şantiye', govde: (r) => r.santiye_kod || '—' },
        { ad: 'vardiya', etiket: 'Vardiya', govde: (r) => VARDIYALAR.find((v) => v.deger === r.vardiya)?.etiket || r.vardiya },
        { ad: 'normal_saat', etiket: 'Normal', hizala: 'sag' },
        { ad: 'fazla_saat', etiket: 'Fazla', hizala: 'sag' },
        { ad: 'devamsizlik', etiket: 'Devamsızlık', govde: (r) => r.devamsizlik
          ? B.isaret(DEVAMSIZLIK.find((d) => d.deger === r.devamsizlik)?.etiket || r.devamsizlik, 'warn') : '—' },
        { ad: 'kilit', etiket: 'Kilit', govde: (r) => (r.kilit ? B.isaret('kilitli', 'ok') : h`<span class="muted">açık</span>`) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'HR-08:olustur') ? B.form({
    rota: '/puantaj', csrf: csrfAlani(ctx),
    hatalar: hata,
    bolumler: [{ baslik: 'Günlük puantaj girişi',
      aciklama: 'Şantiye, o güne ait aktif atamadan çözülür. Aynı personel-gün ikilisi tek satırdır; '
        + 'yeniden gönderim mevcut satırı sürümlü günceller.',
      alanlar: h`
      ${B.alan({ ad: 'personelId', etiket: 'Personel', zorunlu: true, deger: deger.personelId || '',
        secenekler: [{ deger: '', etiket: 'Seçin…' }, ...personelSecenekleri(ctx, { yalnizAktif: true })] })}
      ${B.alan({ ad: 'gun', etiket: 'Gün', tur: 'date', zorunlu: true, deger: deger.gun || gunAnahtari(simdi()) })}
      ${B.alan({ ad: 'vardiya', etiket: 'Vardiya', deger: deger.vardiya || 'gunduz', secenekler: VARDIYALAR })}
      ${B.alan({ ad: 'normalSaat', etiket: 'Normal saat', tur: 'number', deger: deger.normalSaat ?? '8' })}
      ${B.alan({ ad: 'fazlaSaat', etiket: 'Fazla mesai', tur: 'number', deger: deger.fazlaSaat ?? '0' })}
      ${B.alan({ ad: 'devamsizlik', etiket: 'Devamsızlık', deger: deger.devamsizlik || '', secenekler: DEVAMSIZLIK })}` }],
    eylemler: B.btn('Puantajı kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;

  return html(ctx, durum, ciz(ctx, e, icerik));
}

/* ==========================================================================
   HR-09 Dönem kapanışı
   ========================================================================== */
function donemOzeti(donemId) {
  const d = tek('SELECT * FROM puantaj_donemi WHERE id = ?', donemId);
  if (!d) return null;
  const satir = sorgu('SELECT * FROM puantaj WHERE donem_id = ?', donemId);
  const personelSayisi = new Set(satir.map((s) => s.personel_id)).size;
  /* Dönemde atanmış ama hiç puantajı olmayan personel — kapanış ÖNCESİ uyarısı. */
  const eksik = sorgu(
    `SELECT DISTINCT pe.id, pe.kod, pe.ad_soyad FROM personel_atama a
       JOIN personel pe ON pe.id = a.personel_id
      WHERE a.durum = 'aktif' AND a.tenant_id = ?
        ${d.santiye_id ? 'AND a.santiye_id = ?' : ''}
        AND NOT EXISTS (SELECT 1 FROM puantaj p WHERE p.personel_id = pe.id AND p.donem_id = ?)`,
    ...(d.santiye_id ? [d.tenant_id, d.santiye_id, donemId] : [d.tenant_id, donemId]));
  return {
    donem: d, satirSayisi: satir.length, personelSayisi, eksik,
    normal: satir.reduce((a, s) => a + s.normal_saat, 0),
    fazla: satir.reduce((a, s) => a + s.fazla_saat, 0),
    kilitli: satir.filter((s) => s.kilit).length,
  };
}

function donemIslemi(ctx, govde) {
  const d = tek('SELECT * FROM puantaj_donemi WHERE id = ? AND tenant_id = ?', govde.donemId, ctx.tenant.id);
  if (!d) throw Bulunamadi('Dönem bulunamadı.');
  const eylem = govde._eylem;

  if (eylem === 'onaya_gonder') {
    const ozet = donemOzeti(d.id);
    if (!ozet.satirSayisi) throw GecisIzinsiz('Boş dönem onaya gönderilemez.');
    islem(() => {
      onayMotoru.onayaGonder(ctx, {
        nesne: 'puantaj_donemi', nesneId: d.id, nesneKod: d.donem,
        baslik: `Puantaj dönem kapanışı: ${d.donem}`, belgeSurum: d.surum,
        santiyeId: d.santiye_id, gerekce: govde.gerekce || null,
      });
      gecisYap(ctx, { nesne: 'puantajDonemi', tablo: 'puantaj_donemi', kayit: d,
        eylem: 'onaya_gonder', gerekce: govde.gerekce, ekranKodu: 'HR-09' });
    });
    return 'Dönem onaya gönderildi';
  }

  if (eylem === 'kapat') {
    if (d.durum !== 'onaylandi') {
      throw GecisIzinsiz('Yalnız onaylanmış dönem kapatılabilir; kapanış durumu formdan seçilemez.');
    }
    islem(() => {
      gecisYap(ctx, { nesne: 'puantajDonemi', tablo: 'puantaj_donemi', kayit: d,
        eylem: 'kapat', gerekce: govde.gerekce, ekranKodu: 'HR-09',
        ekAlanlar: { kapatan: ctx.kullanici.id, kapandi: simdi() } });
      /* HR-09 KABUL: kapanışta o dönemin TÜM satırları kilitlenir. */
      const n = calistir('UPDATE puantaj SET kilit = 1 WHERE donem_id = ? AND kilit = 0', d.id).changes;
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'puantaj_donemi', nesneId: d.id, eylem: 'satirlar_kilitlendi',
        sonraki: { kilitlenen: n } });
    });
    return 'Dönem kapatıldı ve puantaj satırları kilitlendi';
  }

  if (eylem === 'geri_cek' || eylem === 'yeniden_ac' || eylem === 'iptal_et') {
    gecisYap(ctx, { nesne: 'puantajDonemi', tablo: 'puantaj_donemi', kayit: d,
      eylem, gerekce: govde.gerekce, ekranKodu: 'HR-09' });
    return 'Dönem durumu güncellendi';
  }
  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

function donemKapanisSayfasi(ctx, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('HR-09');
  yetkiZorunlu(ctx, e.yetki);
  const donemler = sorgu(
    `SELECT d.*, s.kod AS santiye_kod, s.ad AS santiye_ad,
            (SELECT COUNT(*) FROM puantaj p WHERE p.donem_id = d.id) AS satir
       FROM puantaj_donemi d LEFT JOIN santiye s ON s.id = d.santiye_id
      WHERE d.tenant_id = ? ORDER BY d.donem DESC, s.kod`, ctx.tenant.id);
  const secilenId = ctx.sorgu.get('donem_id') || donemler[0]?.id || null;
  const ozet = secilenId ? donemOzeti(secilenId) : null;
  const d = ozet?.donem;
  const acikOnay = d ? tek(
    `SELECT id FROM onay_talebi WHERE nesne = 'puantaj_donemi' AND nesne_id = ? AND durum = 'acik'`, d.id) : null;

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.kpiSeridi([
    { etiket: 'Açık dönem', deger: sayi(donemler.filter((x) => x.durum === 'acik').length), ikon: 'fa-lock-open' },
    { etiket: 'Onay sürecinde', deger: sayi(donemler.filter((x) => ['onaya_gonderildi', 'incelemede'].includes(x.durum)).length), ikon: 'fa-hourglass-half' },
    { etiket: 'Kapalı dönem', deger: sayi(donemler.filter((x) => x.durum === 'kapali').length), ikon: 'fa-lock' },
    { etiket: 'Toplam dönem', deger: sayi(donemler.length), ikon: 'fa-calendar-days' },
  ])}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Dönemler</b>
        <span>Dönem ilk puantaj kaydıyla otomatik açılır; kapanış onaydan geçer.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: donemler,
    satirRota: (r) => `/puantaj/donem-kapanis?donem_id=${r.id}`,
    bosDurum: { baslik: 'Dönem yok', aciklama: 'İlk puantaj kaydı girildiğinde dönem otomatik açılır.', ikon: 'fa-calendar-days' },
    sutunlar: [
      { ad: 'donem', etiket: 'Dönem', govde: (r) => h`<b>${r.donem}</b>` },
      { ad: 'santiye_ad', etiket: 'Şantiye', govde: (r) => (r.santiye_kod ? h`${r.santiye_kod} — ${r.santiye_ad}` : h`<span class="muted">tenant geneli</span>`) },
      { ad: 'satir', etiket: 'Satır', hizala: 'sag' },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(
        { acik: 'taslak', onaya_gonderildi: 'onaya_gonderildi', incelemede: 'incelemede',
          revizyon_istendi: 'revizyon_istendi', onaylandi: 'onaylandi', reddedildi: 'reddedildi',
          iptal: 'iptal', kapali: 'kapali' }[r.durum] || r.durum,
        { acik: 'Açık', kapali: 'Kapalı (kilitli)' }[r.durum]) },
      { ad: 'kapandi', etiket: 'Kapanış', govde: (r) => (r.kapandi ? tarih(r.kapandi) : '—') },
    ],
  })}</div>
    </div>
    ${ozet ? h`
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Kapanış kontrol listesi — ${d.donem}</b>
        <span>Engeller giderilmeden dönem onaya gönderilemez.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: [
      { ad: 'Puantaj satırı var', tamam: ozet.satirSayisi > 0,
        not: `${ozet.satirSayisi} satır · ${ozet.personelSayisi} personel` },
      { ad: 'Atanmış herkesin puantajı girildi', tamam: ozet.eksik.length === 0, zorunlu: false,
        not: ozet.eksik.length ? `${ozet.eksik.length} personelin kaydı yok: ${ozet.eksik.slice(0, 5).map((x) => x.ad_soyad).join(', ')}` : 'eksik yok' },
      { ad: 'Toplam saat', tamam: true, not: `${ozet.normal} normal · ${ozet.fazla} fazla mesai` },
      { ad: 'Satır kilidi', tamam: d.durum === 'kapali' ? ozet.kilitli === ozet.satirSayisi : true,
        not: d.durum === 'kapali' ? `${ozet.kilitli}/${ozet.satirSayisi} satır kilitli` : 'kapanışta uygulanacak' },
    ],
    bosDurum: { baslik: 'Kontrol yok' },
    sutunlar: [
      { ad: 'durum', etiket: '', govde: (r) => (r.tamam ? B.isaret('tamam', 'ok')
        : r.zorunlu === false ? B.isaret('uyarı', 'warn') : B.isaret('engel', 'danger')) },
      { ad: 'ad', etiket: 'Kontrol', govde: (r) => h`<b>${r.ad}</b><br><span class="muted">${r.not}</span>` },
    ],
  })}</div>
    </div>` : ''}
  </div>
  <div class="gv-side-stack">
    ${ozet ? h`
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Dönem işlemleri</b>
        <span>Hedef durumu siz seçmezsiniz; kapanış ancak onaydan sonra mümkündür.</span></div></div>
      <div class="gc-body">
        ${acikOnay ? B.sonucSeridi({ tur: 'warn', baslik: 'Onay süreci açık',
    aciklama: 'Karar verilene kadar döneme puantaj yazılamaz.', kayitRota: `/onaylar/${acikOnay.id}` }) : ''}
        ${yetkiVar(ctx, 'HR-09:karar_ver') ? h`
        <form method="post" action="/puantaj/donem-kapanis" data-gform="1">
          ${ham(csrfAlani(ctx))}
          <input type="hidden" name="donemId" value="${d.id}">
          ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe / not', tur: 'metin' })}
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
            ${d.durum === 'acik' || d.durum === 'revizyon_istendi'
    ? h`<button class="btn btn-acc" type="submit" name="_eylem" value="onaya_gonder">
        Dönemi onaya gönder <span class="muted">→ onaya gönderildi</span></button>` : ''}
            ${d.durum === 'onaya_gonderildi'
    ? h`<button class="btn btn-ghost" type="submit" name="_eylem" value="geri_cek">
        Onaydan geri çek <span class="muted">→ açık</span></button>` : ''}
            ${d.durum === 'onaylandi'
    ? h`<button class="btn btn-acc" type="submit" name="_eylem" value="kapat">
        Dönemi kapat ve kilitle <span class="muted">→ kapalı</span></button>` : ''}
            ${d.durum === 'reddedildi'
    ? h`<button class="btn btn-ghost" type="submit" name="_eylem" value="yeniden_ac">
        Dönemi yeniden aç <span class="muted">→ açık</span></button>` : ''}
            ${d.durum === 'kapali'
    ? h`<p class="gf-hint">Dönem kapandı ve satırlar kilitlendi. Düzeltme yerinde yapılmaz;
        yeni dönemde ters kayıtla girilir (değişmez kural 6/7).</p>` : ''}
          </div>
        </form>` : h`<p class="muted">Dönem kapatma yetkiniz yok.</p>`}
      </div>
    </div>` : ''}
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/** Onay kapandığında dönemi motor ilerletir (kullanıcı değil). */
export function donemOnaySonucu(ctx, donemId, sonuc) {
  const d = tek('SELECT * FROM puantaj_donemi WHERE id = ?', donemId);
  if (!d) return;
  const eylem = { onaylandi: 'onayla', reddedildi: 'reddet', revizyon_istendi: 'revizyon_iste' }[sonuc];
  if (!eylem) return;
  if (d.durum === 'onaya_gonderildi') {
    gecisYap(ctx, { nesne: 'puantajDonemi', tablo: 'puantaj_donemi', kayit: d,
      eylem: 'incelemeye_al', motor: true });
  }
  const guncel = tek('SELECT * FROM puantaj_donemi WHERE id = ?', donemId);
  if (guncel.durum !== 'incelemede') return;
  gecisYap(ctx, { nesne: 'puantajDonemi', tablo: 'puantaj_donemi', kayit: guncel,
    eylem, gerekce: `Onay talebi sonucu: ${sonuc}`, motor: true });
}
