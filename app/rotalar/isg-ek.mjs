/* ============================================================================
   İSG PANELİ, SAHA KAYITLARI VE İSTATİSTİK — HSE-01, HSE-07..12
   ----------------------------------------------------------------------------
   · Uygunsuz denetim bulgusu otomatik İSG olayı (tehlike) açar — §7'nin
     "saha bildirimi → kalite/İSG" zincirinin denetim karşılığı (K-034 ilkesi).
   · İSG eğitimi katılımı personelin YETKINLIK kaydını üretir: belge zinciri
     tek yerde durur, işe giriş sihirbazı (HR-05) bu kayıtları görür.
   · KKD zimmeti iade edilmeden personel ayrılış/kapanış engeli sayılır.
   · HSE-12 istatistikleri KPI formülüyle birlikte gösterilir (kural 9).
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, gunAnahtari, gunBaslangici, GUN_MS } from '../cekirdek/zaman.mjs';
import { DogrulamaHatasi, GecisIzinsiz, Bulunamadi, Cakisma, UygulamaHatasi } from '../cekirdek/hata.mjs';
import { bildir } from '../moduller/isakisi/bildirim.mjs';
import { kayitModulu, kullaniciSecenekleri, santiyeSecenekleri, sayac, gecmisKarti } from './kayit-modulu.mjs';
import {
  ekranNesnesi, hataNesnesi, kullaniciAdi, ciz, B, h, ham, sayi, csrfAlani, csrfZorunlu,
  yetkiZorunlu, yetkiVar, sorgu, tek, calistir, islem, surumluGuncelle, audit, sonrakiKod,
} from './ortak.mjs';

const DENETIM_TURLERI = [
  { deger: 'periyodik', etiket: 'Periyodik' }, { deger: 'ani', etiket: 'Ani denetim' },
  { deger: 'resmi', etiket: 'Resmi kurum' }, { deger: 'taseron', etiket: 'Taşeron denetimi' },
];
const EGITIM_TURLERI = [
  { deger: 'temel', etiket: 'Temel İSG eğitimi' }, { deger: 'ise_giris', etiket: 'İşe giriş eğitimi' },
  { deger: 'yuksekte_calisma', etiket: 'Yüksekte çalışma' }, { deger: 'kapali_alan', etiket: 'Kapalı alan' },
  { deger: 'ilk_yardim', etiket: 'İlk yardım' }, { deger: 'yangin', etiket: 'Yangın' },
  { deger: 'diger', etiket: 'Diğer' },
];
const KKD_TURLERI = [
  { deger: 'baret', etiket: 'Baret' }, { deger: 'gozluk', etiket: 'Koruyucu gözlük' },
  { deger: 'eldiven', etiket: 'Eldiven' }, { deger: 'ayakkabi', etiket: 'Çelik burunlu ayakkabı' },
  { deger: 'kemer', etiket: 'Emniyet kemeri' }, { deger: 'maske', etiket: 'Maske/respiratör' },
  { deger: 'kulaklik', etiket: 'Kulaklık' }, { deger: 'yelek', etiket: 'Reflektif yelek' },
  { deger: 'diger', etiket: 'Diğer' },
];
const ATIK_TURLERI = [
  { deger: 'tehlikeli', etiket: 'Tehlikeli atık' }, { deger: 'tehlikesiz', etiket: 'Tehlikesiz atık' },
  { deger: 'hafriyat', etiket: 'Hafriyat' }, { deger: 'ambalaj', etiket: 'Ambalaj' },
  { deger: 'metal', etiket: 'Metal hurda' }, { deger: 'beton', etiket: 'Beton/moloz' },
  { deger: 'diger', etiket: 'Diğer' },
];

const yuzdeBinde = (b) => (b == null ? '—' : `%${(b / 1000).toFixed(1).replace('.', ',')}`);

export function kur(y, ekranRota) {
  /* ================= HSE-01 İSG paneli ================================= */
  ekranRota(y, 'HSE-01', { get: (ctx) => isgPaneli(ctx) });

  /* ================= HSE-07 Saha denetimleri =========================== */
  kayitModulu(y, ekranRota, {
    nesne: 'isg_denetimi', tablo: 'isg_denetimi', kodNesnesi: 'isg_denetimi', kimlikTuru: 'isg',
    rota: '/isg/denetimler', formRotasi: '/isg/denetimler?yeni=1',
    baslik: 'İSG denetimi', yeniEtiketi: 'Yeni denetim',
    listeKodu: 'HSE-07', formKodu: null, detayKodu: null, gecisNesnesi: 'sahaBildirimi',
    aramaAlanlari: ['baslik', 'kod'], aramaYer: 'Denetim başlığı veya kodu…',
    sirala: 'denetim_tarihi DESC',
    filtreler: [
      { ad: 'tur', etiket: 'Tür', secenekler: DENETIM_TURLERI },
      { ad: 'santiye_id', etiket: 'Şantiye', secenekler: santiyeSecenekleri },
    ],
    alanlar: [],
    kpi: (ctx, toplam) => {
      const otuzGun = simdi() - 30 * GUN_MS;
      const son = sorgu(
        `SELECT puan_binde FROM isg_denetimi WHERE tenant_id = ? AND denetim_tarihi >= ? AND puan_binde IS NOT NULL`,
        ctx.tenant.id, otuzGun);
      const ort = son.length ? Math.round(son.reduce((a, r) => a + r.puan_binde, 0) / son.length) : null;
      return [
        { etiket: 'Son 30 gün denetim', deger: sayi(son.length), ikon: 'fa-clipboard-check' },
        { etiket: 'Ortalama uygunluk', deger: yuzdeBinde(ort), ikon: 'fa-percent',
          alt: 'uygun kontrol / toplam kontrol', ton: ort != null && ort < 80_000 ? 'warn' : '' },
        { etiket: 'Açık uygunsuzluk', deger: sayi(Number(tek(
          `SELECT COALESCE(SUM(uygunsuzluk_sayisi),0) AS n FROM isg_denetimi WHERE tenant_id = ?
             AND durum NOT IN ('kapali','iptal')`, ctx.tenant.id)?.n ?? 0)), ikon: 'fa-triangle-exclamation', ton: 'warn' },
        { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
      ];
    },
    listeSutunlari: () => [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'baslik', etiket: 'Denetim', govde: (r) => h`<b>${r.baslik}</b><br><span class="muted">${
        DENETIM_TURLERI.find((t) => t.deger === r.tur)?.etiket || r.tur}</span>` },
      { ad: 'denetim_tarihi', etiket: 'Tarih', govde: (r) => tarih(r.denetim_tarihi) },
      { ad: 'denetci_id', etiket: 'Denetçi', govde: (r) => kullaniciAdi(r.denetci_id) },
      { ad: 'kontrol_sayisi', etiket: 'Kontrol', hizala: 'sag' },
      { ad: 'uygunsuzluk_sayisi', etiket: 'Uygunsuz', hizala: 'sag',
        govde: (r) => (r.uygunsuzluk_sayisi ? B.isaret(String(r.uygunsuzluk_sayisi), 'danger') : '0') },
      { ad: 'puan_binde', etiket: 'Uygunluk', hizala: 'sag', govde: (r) => yuzdeBinde(r.puan_binde) },
      { ad: 'isg_olayi_id', etiket: 'Olay', govde: (r) => (r.isg_olayi_id
        ? h`<a href="/isg/olaylar/${r.isg_olayi_id}">açıldı</a>` : '—') },
    ],
    bosDurum: { baslik: 'Denetim kaydı yok', ikon: 'fa-clipboard-check',
      aciklama: 'Uygunsuzluk bulunan denetim otomatik olarak İSG olayı açar (§7).' },
    altForm: (ctx) => B.form({
      rota: '/isg/denetimler', csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Yeni saha denetimi',
        aciklama: 'Uygunluk oranı kontrol sayısından HESAPLANIR; elle girilmez. '
          + 'Uygunsuzluk varsa otomatik tehlike bildirimi açılır.',
        alanlar: h`
        ${B.alan({ ad: 'baslik', etiket: 'Denetim konusu', zorunlu: true, genis: true })}
        ${B.alan({ ad: 'tur', etiket: 'Tür', deger: 'periyodik', secenekler: DENETIM_TURLERI })}
        ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye',
          secenekler: [{ deger: '', etiket: 'Seçin…' }, ...santiyeSecenekleri(ctx)] })}
        ${B.alan({ ad: 'denetimTarihi', etiket: 'Denetim tarihi', tur: 'date', deger: gunAnahtari(simdi()) })}
        ${B.alan({ ad: 'denetciId', etiket: 'Denetçi',
          secenekler: [{ deger: '', etiket: 'Seçin…' }, ...kullaniciSecenekleri(ctx)] })}
        ${B.alan({ ad: 'kontrolSayisi', etiket: 'Kontrol edilen madde', tur: 'number', zorunlu: true })}
        ${B.alan({ ad: 'uygunsuzlukSayisi', etiket: 'Uygunsuz madde', tur: 'number', deger: '0' })}
        ${B.alan({ ad: 'bulgular', etiket: 'Bulgular', tur: 'metin', genis: true })}` }],
      eylemler: B.btn('Denetimi kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
    }),
  });

  y.post('/isg/denetimler', (ctx, govde) => {
    yetkiZorunlu(ctx, 'HSE-07:olustur');
    csrfZorunlu(ctx, govde);
    return denetimKaydet(ctx, govde);
  }, { ekran: ekranNesnesi('HSE-07') });

  /* ================= HSE-08 Toolbox konuşmaları ======================== */
  kayitModulu(y, ekranRota, {
    nesne: 'toolbox', tablo: 'toolbox', kimlikTuru: 'isg',
    rota: '/isg/toolbox', formRotasi: '/isg/toolbox?yeni=1',
    baslik: 'Toolbox konuşması', yeniEtiketi: 'Yeni konuşma',
    listeKodu: 'HSE-08', formKodu: null, detayKodu: null, gecisNesnesi: 'sahaBildirimi',
    aramaAlanlari: ['konu'], aramaYer: 'Konu…', sirala: 'tarih DESC',
    filtreler: [{ ad: 'santiye_id', etiket: 'Şantiye', secenekler: santiyeSecenekleri }],
    alanlar: [],
    kpi: (ctx, toplam) => {
      const otuzGun = simdi() - 30 * GUN_MS;
      const kayitlar = sorgu('SELECT * FROM toolbox WHERE tenant_id = ? AND tarih >= ?', ctx.tenant.id, otuzGun);
      return [
        { etiket: 'Son 30 gün', deger: sayi(kayitlar.length), ikon: 'fa-comments' },
        { etiket: 'Katılımcı (30 gün)', deger: sayi(kayitlar.reduce((a, r) => a + r.katilimci_sayisi, 0)),
          ikon: 'fa-users' },
        { etiket: 'Toplam süre (dk)', deger: sayi(kayitlar.reduce((a, r) => a + (r.sure_dk || 0), 0)), ikon: 'fa-clock' },
        { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
      ];
    },
    listeSutunlari: () => [
      { ad: 'tarih', etiket: 'Tarih', govde: (r) => tarih(r.tarih) },
      { ad: 'konu', etiket: 'Konu', govde: (r) => h`<b>${r.konu}</b>${
        r.notlar ? h`<br><span class="muted">${r.notlar}</span>` : ''}` },
      { ad: 'santiye_id', etiket: 'Şantiye', govde: (r) => (r.santiye_id
        ? tek('SELECT kod FROM santiye WHERE id = ?', r.santiye_id)?.kod || '—' : '—') },
      { ad: 'anlatan_id', etiket: 'Anlatan', govde: (r) => kullaniciAdi(r.anlatan_id) },
      { ad: 'katilimci_sayisi', etiket: 'Katılımcı', hizala: 'sag' },
      { ad: 'sure_dk', etiket: 'Süre (dk)', hizala: 'sag', govde: (r) => (r.sure_dk == null ? '—' : sayi(r.sure_dk)) },
    ],
    bosDurum: { baslik: 'Toolbox kaydı yok', ikon: 'fa-comments',
      aciklama: 'Günlük saha konuşmaları ve katılımcı sayısı burada tutulur.' },
    altForm: (ctx) => B.form({
      rota: '/isg/toolbox', csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Yeni toolbox konuşması', alanlar: h`
        ${B.alan({ ad: 'konu', etiket: 'Konu', zorunlu: true, genis: true })}
        ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye',
          secenekler: [{ deger: '', etiket: 'Seçin…' }, ...santiyeSecenekleri(ctx)] })}
        ${B.alan({ ad: 'tarih', etiket: 'Tarih', tur: 'date', deger: gunAnahtari(simdi()) })}
        ${B.alan({ ad: 'anlatanId', etiket: 'Anlatan',
          secenekler: [{ deger: '', etiket: 'Seçin…' }, ...kullaniciSecenekleri(ctx)] })}
        ${B.alan({ ad: 'katilimciSayisi', etiket: 'Katılımcı sayısı', tur: 'number', zorunlu: true })}
        ${B.alan({ ad: 'sureDk', etiket: 'Süre (dakika)', tur: 'number', deger: '15' })}
        ${B.alan({ ad: 'katilimcilar', etiket: 'Katılımcılar', tur: 'metin', genis: true })}
        ${B.alan({ ad: 'notlar', etiket: 'Not', genis: true })}` }],
      eylemler: B.btn('Konuşmayı kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
    }),
  });

  y.post('/isg/toolbox', (ctx, govde) => {
    yetkiZorunlu(ctx, 'HSE-08:olustur');
    csrfZorunlu(ctx, govde);
    const konu = String(govde.konu || '').trim();
    if (!konu) throw DogrulamaHatasi('Konu zorunludur.', { alanlar: { konu: ['Konu girin.'] } });
    const katilimci = Number(govde.katilimciSayisi ?? 0);
    if (!Number.isInteger(katilimci) || katilimci < 1 || katilimci > 1000) {
      throw DogrulamaHatasi('Katılımcı sayısı 1–1000 arasında olmalı.',
        { alanlar: { katilimciSayisi: ['Geçersiz sayı.'] } });
    }
    islem(() => {
      const id = kimlik('isg').replace('hse', 'tbx');
      calistir(`INSERT INTO toolbox (id, tenant_id, santiye_id, konu, tarih, anlatan_id, sure_dk,
                  katilimci_sayisi, katilimcilar, notlar, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?,?,?, 'yapildi', ?,?)`,
        id, ctx.tenant.id, govde.santiyeId || null, konu,
        govde.tarih ? gunBaslangici(govde.tarih) : simdi(), govde.anlatanId || null,
        govde.sureDk ? Number(govde.sureDk) : null, katilimci,
        govde.katilimcilar || null, govde.notlar || null, ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'toolbox', nesneId: id, eylem: 'olustur', sonraki: { konu, katilimci } });
    });
    return yonlendir(ctx, '/isg/toolbox?olusturuldu=1');
  }, { ekran: ekranNesnesi('HSE-08') });

  /* ================= HSE-09 İSG eğitimleri ============================= */
  kayitModulu(y, ekranRota, {
    nesne: 'isg_egitimi', tablo: 'isg_egitimi', kimlikTuru: 'isg',
    rota: '/isg/egitimler', formRotasi: '/isg/egitimler?yeni=1',
    baslik: 'İSG eğitimi', yeniEtiketi: 'Yeni eğitim',
    listeKodu: 'HSE-09', formKodu: null, detayKodu: null, gecisNesnesi: 'sahaBildirimi',
    aramaAlanlari: ['ad', 'egitmen'], aramaYer: 'Eğitim adı veya eğitmen…', sirala: 'tarih DESC',
    filtreler: [
      { ad: 'tur', etiket: 'Tür', secenekler: EGITIM_TURLERI },
      { ad: 'santiye_id', etiket: 'Şantiye', secenekler: santiyeSecenekleri },
    ],
    alanlar: [],
    kpi: (ctx, toplam) => [
      { etiket: 'Eğitim', deger: sayi(sayac(ctx.tenant.id, 'isg_egitimi')), ikon: 'fa-graduation-cap' },
      { etiket: 'Katılım kaydı', deger: sayi(Number(tek(
        `SELECT COUNT(*) AS n FROM isg_egitim_katilimi k JOIN isg_egitimi e ON e.id = k.egitim_id
          WHERE e.tenant_id = ?`, ctx.tenant.id)?.n ?? 0)), ikon: 'fa-user-check' },
      { etiket: 'Eğitimsiz aktif personel', ikon: 'fa-user-xmark', ton: 'warn', deger: sayi(Number(tek(
        `SELECT COUNT(*) AS n FROM personel p WHERE p.tenant_id = ? AND p.durum = 'aktif'
           AND NOT EXISTS (SELECT 1 FROM isg_egitim_katilimi k WHERE k.personel_id = p.id AND k.sonuc = 'katildi')`,
        ctx.tenant.id)?.n ?? 0)) },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ],
    listeSutunlari: () => [
      { ad: 'tarih', etiket: 'Tarih', govde: (r) => tarih(r.tarih) },
      { ad: 'ad', etiket: 'Eğitim', govde: (r) => h`<a href="/isg/egitimler/${r.id}"><b>${r.ad}</b></a>
        <br><span class="muted">${EGITIM_TURLERI.find((t) => t.deger === r.tur)?.etiket || r.tur}</span>` },
      { ad: 'egitmen', etiket: 'Eğitmen', govde: (r) => r.egitmen || '—' },
      { ad: 'sure_saat', etiket: 'Süre (saat)', hizala: 'sag', govde: (r) => (r.sure_saat == null ? '—' : sayi(r.sure_saat)) },
      { ad: 'katilim', etiket: 'Katılım', hizala: 'sag', govde: (r) => sayi(Number(tek(
        `SELECT COUNT(*) AS n FROM isg_egitim_katilimi WHERE egitim_id = ? AND sonuc = 'katildi'`, r.id)?.n ?? 0)) },
      { ad: 'gecerlilik_ay', etiket: 'Geçerlilik', govde: (r) => (r.gecerlilik_ay ? `${r.gecerlilik_ay} ay` : 'süresiz') },
    ],
    bosDurum: { baslik: 'Eğitim kaydı yok', ikon: 'fa-graduation-cap',
      aciklama: 'Eğitim katılımı personelin belge/yetkinlik kaydını üretir.' },
    altForm: (ctx) => B.form({
      rota: '/isg/egitimler', csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Yeni İSG eğitimi',
        aciklama: 'Katılımcılar eğitim detayında eklenir; her katılım bir yetkinlik kaydı üretir.',
        alanlar: h`
        ${B.alan({ ad: 'ad', etiket: 'Eğitim adı', zorunlu: true, genis: true })}
        ${B.alan({ ad: 'tur', etiket: 'Tür', deger: 'temel', secenekler: EGITIM_TURLERI })}
        ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye',
          secenekler: [{ deger: '', etiket: 'Seçin…' }, ...santiyeSecenekleri(ctx)] })}
        ${B.alan({ ad: 'tarih', etiket: 'Tarih', tur: 'date', deger: gunAnahtari(simdi()) })}
        ${B.alan({ ad: 'egitmen', etiket: 'Eğitmen' })}
        ${B.alan({ ad: 'sureSaat', etiket: 'Süre (saat)', tur: 'number', deger: '8' })}
        ${B.alan({ ad: 'gecerlilikAy', etiket: 'Geçerlilik (ay)', tur: 'number', deger: '36',
          ipucu: 'Katılımcı yetkinlik kaydının geçerlilik süresi buradan hesaplanır.' })}` }],
      eylemler: B.btn('Eğitimi kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
    }),
  });

  y.post('/isg/egitimler', (ctx, govde) => {
    yetkiZorunlu(ctx, 'HSE-09:olustur');
    csrfZorunlu(ctx, govde);
    const ad = String(govde.ad || '').trim();
    if (!ad) throw DogrulamaHatasi('Eğitim adı zorunludur.', { alanlar: { ad: ['Ad girin.'] } });
    islem(() => {
      const id = kimlik('isg').replace('hse', 'edu');
      calistir(`INSERT INTO isg_egitimi (id, tenant_id, santiye_id, ad, tur, tarih, gecerlilik_ay,
                  egitmen, sure_saat, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?,?, 'tamamlandi', ?,?)`,
        id, ctx.tenant.id, govde.santiyeId || null, ad, govde.tur || 'temel',
        govde.tarih ? gunBaslangici(govde.tarih) : simdi(),
        govde.gecerlilikAy ? Number(govde.gecerlilikAy) : null,
        govde.egitmen || null, govde.sureSaat ? Number(govde.sureSaat) : null,
        ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'isg_egitimi', nesneId: id, eylem: 'olustur', sonraki: { ad, tur: govde.tur } });
    });
    return yonlendir(ctx, '/isg/egitimler?olusturuldu=1');
  }, { ekran: ekranNesnesi('HSE-09') });

  y.get('/isg/egitimler/:id', (ctx, _g, params) => egitimDetayi(ctx, params.id),
    { ekran: ekranNesnesi('HSE-09') });
  y.post('/isg/egitimler/:id', (ctx, govde, params) => {
    yetkiZorunlu(ctx, 'HSE-09:guncelle');
    csrfZorunlu(ctx, govde);
    try {
      const mesaj = katilimEkle(ctx, params.id, govde);
      return yonlendir(ctx, `/isg/egitimler/${params.id}?islem=${encodeURIComponent(mesaj)}`);
    } catch (err) {
      if (!(err instanceof UygulamaHatasi)) throw err;
      return egitimDetayi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
    }
  }, { ekran: ekranNesnesi('HSE-09') });

  /* ================= HSE-10 KKD zimmet ================================= */
  kayitModulu(y, ekranRota, {
    nesne: 'kkd_zimmeti', tablo: 'kkd_zimmeti', kimlikTuru: 'zimmet',
    rota: '/isg/kkd', formRotasi: '/isg/kkd?yeni=1',
    baslik: 'KKD zimmeti', yeniEtiketi: 'Yeni zimmet',
    listeKodu: 'HSE-10', formKodu: null, detayKodu: null, gecisNesnesi: 'sahaBildirimi',
    aramaAlanlari: ['kkd_turu', 'aciklama'], aramaYer: 'KKD türü veya açıklama…',
    sirala: 'teslim_tarihi DESC',
    filtreler: [
      { ad: 'durum', etiket: 'Durum', secenekler: [
        { deger: 'zimmetli', etiket: 'Zimmetli' }, { deger: 'iade', etiket: 'İade edildi' },
        { deger: 'hasarli', etiket: 'Hasarlı' }, { deger: 'kayip', etiket: 'Kayıp' }] },
      { ad: 'santiye_id', etiket: 'Şantiye', secenekler: santiyeSecenekleri },
    ],
    alanlar: [],
    kpi: (ctx, toplam) => {
      const kontrolGecmis = sayac(ctx.tenant.id, 'kkd_zimmeti',
        `durum = 'zimmetli' AND sonraki_kontrol IS NOT NULL AND sonraki_kontrol < ?`, simdi());
      return [
        { etiket: 'Zimmetli KKD', deger: sayi(sayac(ctx.tenant.id, 'kkd_zimmeti', `durum = 'zimmetli'`)),
          ikon: 'fa-helmet-safety' },
        { etiket: 'Kontrol tarihi geçmiş', deger: sayi(kontrolGecmis), ikon: 'fa-triangle-exclamation',
          ton: kontrolGecmis ? 'danger' : '' },
        { etiket: 'Kayıp/hasarlı', deger: sayi(sayac(ctx.tenant.id, 'kkd_zimmeti', `durum IN ('kayip','hasarli')`)),
          ikon: 'fa-circle-xmark', ton: 'warn' },
        { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
      ];
    },
    listeSutunlari: (ctx) => [
      { ad: 'personel_id', etiket: 'Personel', govde: (r) => {
        const p = tek('SELECT kod, ad_soyad FROM personel WHERE id = ?', r.personel_id);
        return p ? h`<a href="/personel/${r.personel_id}"><b>${p.ad_soyad}</b></a>
          <br><span class="muted">${p.kod}</span>` : '—';
      } },
      { ad: 'kkd_turu', etiket: 'KKD', govde: (r) => h`${KKD_TURLERI.find((t) => t.deger === r.kkd_turu)?.etiket || r.kkd_turu}${
        r.aciklama ? h`<br><span class="muted">${r.aciklama}</span>` : ''}` },
      { ad: 'adet', etiket: 'Adet', hizala: 'sag' },
      { ad: 'teslim_tarihi', etiket: 'Teslim', govde: (r) => tarih(r.teslim_tarihi) },
      { ad: 'sonraki_kontrol', etiket: 'Kontrol', govde: (r) => (!r.sonraki_kontrol ? '—'
        : r.sonraki_kontrol < simdi() && r.durum === 'zimmetli'
          ? B.isaret(`${tarih(r.sonraki_kontrol)} — geçti`, 'danger') : tarih(r.sonraki_kontrol)) },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(
        r.durum === 'zimmetli' ? 'beklemede' : r.durum === 'iade' ? 'onaylandi' : 'reddedildi',
        { zimmetli: 'Zimmetli', iade: 'İade', hasarli: 'Hasarlı', kayip: 'Kayıp' }[r.durum]) },
      { ad: 'islem', etiket: '', govde: (r) => (r.durum !== 'zimmetli' || !yetkiVar(ctx, 'HSE-10:guncelle') ? '—'
        : h`<form method="post" action="/isg/kkd" style="display:flex;gap:6px;flex-wrap:wrap">
            ${ham(csrfAlani(ctx))}
            <input type="hidden" name="_eylem" value="iade">
            <input type="hidden" name="id" value="${r.id}">
            <input type="hidden" name="surum" value="${r.surum}">
            <button class="btn btn-ghost btn-sm" type="submit" name="sonuc" value="iade">İade al</button>
            <button class="btn btn-ghost btn-sm" type="submit" name="sonuc" value="hasarli">Hasarlı</button>
            <button class="btn btn-danger btn-sm" type="submit" name="sonuc" value="kayip">Kayıp</button>
          </form>`) },
    ],
    bosDurum: { baslik: 'KKD zimmeti yok', ikon: 'fa-helmet-safety',
      aciklama: 'Kişisel koruyucu donanım teslim ve iade kayıtları burada tutulur.' },
    altForm: (ctx) => B.form({
      rota: '/isg/kkd', csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Yeni KKD zimmeti',
        aciklama: 'İade edilmemiş zimmet, personel ayrılışında ve şantiye kapanışında engeldir.',
        alanlar: h`
        ${B.alan({ ad: 'personelId', etiket: 'Personel', zorunlu: true,
          secenekler: [{ deger: '', etiket: 'Seçin…' }, ...sorgu(
            `SELECT id, kod, ad_soyad FROM personel WHERE tenant_id = ? AND durum IN ('aday','aktif','izinli')
              ORDER BY ad_soyad`, ctx.tenant.id).map((p) => ({ deger: p.id, etiket: `${p.kod} — ${p.ad_soyad}` }))] })}
        ${B.alan({ ad: 'kkdTuru', etiket: 'KKD türü', zorunlu: true, deger: 'baret', secenekler: KKD_TURLERI })}
        ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye',
          secenekler: [{ deger: '', etiket: 'Seçin…' }, ...santiyeSecenekleri(ctx)] })}
        ${B.alan({ ad: 'adet', etiket: 'Adet', tur: 'number', deger: '1' })}
        ${B.alan({ ad: 'teslimTarihi', etiket: 'Teslim tarihi', tur: 'date', deger: gunAnahtari(simdi()) })}
        ${B.alan({ ad: 'sonrakiKontrol', etiket: 'Sonraki kontrol', tur: 'date' })}
        ${B.alan({ ad: 'aciklama', etiket: 'Açıklama', genis: true })}` }],
      eylemler: B.btn('Zimmeti kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
    }),
  });

  y.post('/isg/kkd', (ctx, govde) => {
    csrfZorunlu(ctx, govde);
    if (govde._eylem === 'iade') return kkdIade(ctx, govde);
    yetkiZorunlu(ctx, 'HSE-10:olustur');
    return kkdZimmet(ctx, govde);
  }, { ekran: ekranNesnesi('HSE-10') });

  /* ================= HSE-11 Çevre olayları ve atık ===================== */
  ekranRota(y, 'HSE-11', {
    get: (ctx) => cevreSayfasi(ctx),
    post: (ctx, govde) => {
      const e = ekranNesnesi('HSE-11');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = atikKaydet(ctx, govde);
        return yonlendir(ctx, `/cevre?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return cevreSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= HSE-12 İSG istatistik raporu ====================== */
  /* HSE-12 artık `moduller/rapor/tanimlar.mjs` içinde bir RAPOR TANIMIDIR;
     rotasını `rotalar/rapor.mjs` kurar (kural 9, denetim-01 D-05). */
}

/* ==========================================================================
   HSE-01 — panel
   ========================================================================== */
function isgPaneli(ctx) {
  const e = ekranNesnesi('HSE-01');
  yetkiZorunlu(ctx, e.yetki);
  const t = ctx.tenant.id;
  const otuzGun = simdi() - 30 * GUN_MS;
  const acikOlay = sayac(t, 'isg_olayi', `durum NOT IN ('kapali','iptal')`);
  const kaza30 = sayac(t, 'isg_olayi', `tur = 'kaza' AND olay_zamani >= ?`, otuzGun);
  const ramak30 = sayac(t, 'isg_olayi', `tur = 'ramak_kala' AND olay_zamani >= ?`, otuzGun);
  const kayipGun = Number(tek(
    `SELECT COALESCE(SUM(kayip_gun),0) AS n FROM isg_olayi WHERE tenant_id = ? AND olay_zamani >= ?`,
    t, otuzGun)?.n ?? 0);
  const kkdGecmis = sayac(t, 'kkd_zimmeti',
    `durum = 'zimmetli' AND sonraki_kontrol IS NOT NULL AND sonraki_kontrol < ?`, simdi());

  const acikOlaylar = sorgu(
    `SELECT * FROM isg_olayi WHERE tenant_id = ? AND durum NOT IN ('kapali','iptal')
      ORDER BY onem = 'kritik' DESC, olay_zamani DESC LIMIT 8`, t);
  const sonDenetimler = sorgu(
    `SELECT * FROM isg_denetimi WHERE tenant_id = ? ORDER BY denetim_tarihi DESC LIMIT 5`, t);
  const egitimsiz = sorgu(
    `SELECT p.id, p.kod, p.ad_soyad FROM personel p WHERE p.tenant_id = ? AND p.durum = 'aktif'
       AND NOT EXISTS (SELECT 1 FROM isg_egitim_katilimi k WHERE k.personel_id = p.id AND k.sonuc = 'katildi')
      ORDER BY p.ad_soyad LIMIT 8`, t);

  const icerik = h`
${B.kpiSeridi([
    { etiket: 'Açık İSG olayı', deger: sayi(acikOlay), ikon: 'fa-triangle-exclamation',
      ton: acikOlay ? 'warn' : '' },
    { etiket: 'Kaza (30 gün)', deger: sayi(kaza30), ikon: 'fa-user-injured', ton: kaza30 ? 'danger' : '' },
    { etiket: 'Ramak kala (30 gün)', deger: sayi(ramak30), ikon: 'fa-shield-halved',
      alt: 'raporlama kültürü göstergesi' },
    { etiket: 'Kayıp gün (30 gün)', deger: sayi(kayipGun), ikon: 'fa-calendar-xmark' },
  ])}
${kkdGecmis ? B.sonucSeridi({ tur: 'warn', baslik: `${kkdGecmis} KKD zimmetinin kontrol tarihi geçti`,
    aciklama: 'Kontrolü geçmiş KKD sahada kullanılamaz.', kayitRota: '/isg/kkd' }) : ''}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Açık olaylar</b>
        <span>Kritik olaylar üstte; kapanış kök neden + DÖF + doğrulama ister.</span></div>
        ${B.btn('Tümü', { rota: '/isg/olaylar', kucuk: true })}</div>
      <div class="gc-body flush">${B.tablo({
    satirlar: acikOlaylar,
    satirRota: (r) => `/isg/olaylar/${r.id}`,
    bosDurum: { baslik: 'Açık olay yok', ikon: 'fa-circle-check', aciklama: 'Tüm İSG olayları kapatılmış.' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'baslik', etiket: 'Olay', govde: (r) => h`<b>${r.baslik}</b><br><span class="muted">${r.tur}</span>` },
      { ad: 'olay_zamani', etiket: 'Zaman', govde: (r) => tarih(r.olay_zamani) },
      { ad: 'onem', etiket: 'Önem', govde: (r) => B.isaret(r.onem, r.onem === 'kritik' ? 'danger' : 'warn') },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
    ],
  })}</div>
    </div>
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Son denetimler</b></div>
        ${B.btn('Tümü', { rota: '/isg/denetimler', kucuk: true })}</div>
      <div class="gc-body flush">${B.tablo({
    satirlar: sonDenetimler,
    bosDurum: { baslik: 'Denetim kaydı yok', ikon: 'fa-clipboard-check' },
    sutunlar: [
      { ad: 'denetim_tarihi', etiket: 'Tarih', govde: (r) => tarih(r.denetim_tarihi) },
      { ad: 'baslik', etiket: 'Denetim' },
      { ad: 'uygunsuzluk_sayisi', etiket: 'Uygunsuz', hizala: 'sag' },
      { ad: 'puan_binde', etiket: 'Uygunluk', hizala: 'sag', govde: (r) => yuzdeBinde(r.puan_binde) },
    ],
  })}</div>
    </div>
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Eğitimsiz aktif personel</b>
        <span>Katılım kaydı olmayanlar; işe giriş sihirbazı da bu kaydı arar.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: egitimsiz,
    satirRota: (r) => `/personel/${r.id}`,
    bosDurum: { baslik: 'Eksik yok', ikon: 'fa-circle-check', aciklama: 'Tüm aktif personelin eğitim kaydı var.' },
    sutunlar: [
      { ad: 'kod', etiket: 'Sicil' },
      { ad: 'ad_soyad', etiket: 'Personel' },
    ],
  })}</div>
    </div>
    <div class="gv-card"><div class="gc-body" style="display:flex;flex-direction:column;gap:8px">
      ${B.btn('Kaza bildir', { tur: 'acc', rota: '/isg/olaylar/kaza/yeni', ikon: 'fa-user-injured' })}
      ${B.btn('Ramak kala bildir', { rota: '/isg/olaylar/ramak-kala/yeni', ikon: 'fa-shield-halved' })}
      ${B.btn('Tehlikeli durum bildir', { rota: '/isg/olaylar/tehlike/yeni', ikon: 'fa-triangle-exclamation' })}
      ${B.btn('İSG istatistik raporu', { rota: '/raporlar/isg', ikon: 'fa-chart-column' })}
    </div></div>
  </div>
</div>
${B.veriTarihi(simdi())}`;
  return html(ctx, 200, ciz(ctx, e, icerik));
}

/* ==========================================================================
   HSE-07 — denetim
   ========================================================================== */
function denetimKaydet(ctx, govde) {
  const baslik = String(govde.baslik || '').trim();
  if (!baslik) throw DogrulamaHatasi('Denetim konusu zorunludur.', { alanlar: { baslik: ['Konu girin.'] } });
  const kontrol = Number(govde.kontrolSayisi ?? 0);
  const uygunsuz = Number(govde.uygunsuzlukSayisi ?? 0);
  const hatalar = {};
  if (!Number.isInteger(kontrol) || kontrol < 1 || kontrol > 10_000) {
    hatalar.kontrolSayisi = ['1–10000 arası tam sayı girin.'];
  }
  if (!Number.isInteger(uygunsuz) || uygunsuz < 0) hatalar.uygunsuzlukSayisi = ['0 veya daha büyük olmalı.'];
  else if (uygunsuz > kontrol) hatalar.uygunsuzlukSayisi = ['Uygunsuz madde, kontrol sayısından çok olamaz.'];
  if (Object.keys(hatalar).length) throw DogrulamaHatasi('Denetim bilgileri geçersiz.', { alanlar: hatalar });

  /* Uygunluk oranı HESAPLANIR (binde tamsayı — K-029 ilkesi), elle girilmez. */
  const puan = Math.round(((kontrol - uygunsuz) / kontrol) * 100_000);
  const santiye = govde.santiyeId
    ? tek('SELECT * FROM santiye WHERE id = ? AND tenant_id = ?', govde.santiyeId, ctx.tenant.id) : null;

  const sonuc = islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'isg_denetimi');
    const id = kimlik('isg').replace('hse', 'den');
    let olayId = null;
    /* §7: uygunsuzluk bulunan denetim kendiliğinden TEHLİKE olayı açar. */
    if (uygunsuz > 0) {
      olayId = kimlik('isg');
      const olayKod = sonrakiKod(ctx.tenant.id, 'isg_olayi');
      calistir(`INSERT INTO isg_olayi (id, tenant_id, santiye_id, proje_id, kod, tur, baslik, olay_zamani,
                  yer, anlatim, onem, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?, 'tehlike', ?,?,?,?,?, 'yeni', ?,?)`,
        olayId, ctx.tenant.id, santiye?.id || null, santiye?.proje_id || null, olayKod,
        `Denetim uygunsuzluğu: ${baslik}`,
        govde.denetimTarihi ? gunBaslangici(govde.denetimTarihi) : simdi(),
        santiye?.ad || null,
        `${kod} denetiminde ${uygunsuz}/${kontrol} madde uygunsuz bulundu.\n${govde.bulgular || ''}`.trim(),
        uygunsuz / kontrol > 0.25 ? 'kritik' : 'uyari', ctx.kullanici.id, simdi());
    }
    calistir(`INSERT INTO isg_denetimi (id, tenant_id, santiye_id, proje_id, kod, baslik, tur,
                denetim_tarihi, denetci_id, kontrol_sayisi, uygunsuzluk_sayisi, puan_binde, bulgular,
                isg_olayi_id, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?,?,?)`,
      id, ctx.tenant.id, santiye?.id || null, santiye?.proje_id || null, kod, baslik,
      govde.tur || 'periyodik', govde.denetimTarihi ? gunBaslangici(govde.denetimTarihi) : simdi(),
      govde.denetciId || null, kontrol, uygunsuz, puan, govde.bulgular || null, olayId,
      uygunsuz > 0 ? 'atandi' : 'kapali', ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'isg_denetimi', nesneId: id, eylem: 'olustur',
      sonraki: { kod, kontrol, uygunsuz, puanBinde: puan, olayAcildi: !!olayId } });
    return { olayId, kod };
  });
  return yonlendir(ctx, `/isg/denetimler?olusturuldu=1${sonuc.olayId ? '&olay=1' : ''}`);
}

/* ==========================================================================
   HSE-09 — eğitim katılımı → yetkinlik
   ========================================================================== */
function katilimEkle(ctx, egitimId, govde) {
  const e = tek('SELECT * FROM isg_egitimi WHERE id = ? AND tenant_id = ?', egitimId, ctx.tenant.id);
  if (!e) throw Bulunamadi('Eğitim bulunamadı.');
  const p = govde.personelId
    ? tek('SELECT * FROM personel WHERE id = ? AND tenant_id = ?', govde.personelId, ctx.tenant.id) : null;
  if (!p) throw DogrulamaHatasi('Personel seçin.', { alanlar: { personelId: ['Personel bulunamadı.'] } });
  if (tek('SELECT id FROM isg_egitim_katilimi WHERE egitim_id = ? AND personel_id = ?', e.id, p.id)) {
    throw Cakisma(`${p.ad_soyad} bu eğitime zaten kayıtlı.`);
  }
  const sonuc = ['katildi', 'katilmadi', 'basarisiz'].includes(govde.sonuc) ? govde.sonuc : 'katildi';

  islem(() => {
    let yetkinlikId = null;
    /* Yalnız BAŞARILI katılım yetkinlik üretir; katılmayan belge alamaz. */
    if (sonuc === 'katildi') {
      yetkinlikId = kimlik('yetkinlik');
      calistir(`INSERT INTO yetkinlik (id, tenant_id, personel_id, tur, ad, veren_kurum, gecerlilik,
                  durum, olusturan, olusturuldu)
                VALUES (?,?,?, 'egitim', ?,?,?, 'gecerli', ?,?)`,
        yetkinlikId, ctx.tenant.id, p.id, e.ad, e.egitmen || null,
        e.gecerlilik_ay ? e.tarih + e.gecerlilik_ay * 30 * GUN_MS : null,
        ctx.kullanici.id, simdi());
    }
    calistir(`INSERT INTO isg_egitim_katilimi (id, egitim_id, personel_id, yetkinlik_id, sonuc, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?)`,
      kimlik('yetkinlik'), e.id, p.id, yetkinlikId, sonuc, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'isg_egitimi', nesneId: e.id, eylem: 'katilim_eklendi',
      sonraki: { personel: p.kod, sonuc, yetkinlikUretildi: !!yetkinlikId } });
  });
  return `${p.ad_soyad} katılımı kaydedildi${sonuc === 'katildi' ? ' ve yetkinlik belgesi açıldı' : ''}`;
}

function egitimDetayi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('HSE-09');
  yetkiZorunlu(ctx, e.yetki);
  const eg = tek('SELECT * FROM isg_egitimi WHERE id = ? AND tenant_id = ?', id, ctx.tenant.id);
  if (!eg) throw Bulunamadi('Eğitim bulunamadı.');
  const katilim = sorgu(
    `SELECT k.*, p.kod AS personel_kod, p.ad_soyad, y.gecerlilik FROM isg_egitim_katilimi k
       JOIN personel p ON p.id = k.personel_id
       LEFT JOIN yetkinlik y ON y.id = k.yetkinlik_id
      WHERE k.egitim_id = ? ORDER BY p.ad_soyad`, eg.id);
  const katilmayanlar = sorgu(
    `SELECT id, kod, ad_soyad FROM personel WHERE tenant_id = ? AND durum IN ('aday','aktif','izinli')
       AND id NOT IN (SELECT personel_id FROM isg_egitim_katilimi WHERE egitim_id = ?)
      ORDER BY ad_soyad`, ctx.tenant.id, eg.id);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.detayOzetSeridi({
    kod: EGITIM_TURLERI.find((t) => t.deger === eg.tur)?.etiket || eg.tur, baslik: eg.ad,
    durum: eg.durum === 'tamamlandi' ? 'onaylandi' : 'taslak', surum: eg.surum,
    bilgiler: [
      { etiket: 'Tarih', deger: tarih(eg.tarih) },
      { etiket: 'Eğitmen', deger: eg.egitmen || '—' },
      { etiket: 'Süre', deger: eg.sure_saat ? `${eg.sure_saat} saat` : '—' },
      { etiket: 'Geçerlilik', deger: eg.gecerlilik_ay ? `${eg.gecerlilik_ay} ay` : 'süresiz' },
      { etiket: 'Katılım', deger: sayi(katilim.filter((k) => k.sonuc === 'katildi').length) },
    ],
    birincilEylem: B.btn('Eğitim listesi', { rota: '/isg/egitimler' }),
  })}
<div class="dash-cols">
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>Katılımcılar</b>
      <span>Başarılı katılım, personelin belge/yetkinlik kaydını üretir.</span></div></div>
    <div class="gc-body flush">${B.tablo({
    satirlar: katilim,
    bosDurum: { baslik: 'Katılımcı yok', ikon: 'fa-user-check',
      aciklama: 'Sağdaki formdan katılım ekleyin.' },
    sutunlar: [
      { ad: 'ad_soyad', etiket: 'Personel', govde: (r) => h`<a href="/personel/${r.personel_id}"><b>${r.ad_soyad}</b></a>
        <br><span class="muted">${r.personel_kod}</span>` },
      { ad: 'sonuc', etiket: 'Sonuç', govde: (r) => B.isaret(
        { katildi: 'katıldı', katilmadi: 'katılmadı', basarisiz: 'başarısız' }[r.sonuc],
        r.sonuc === 'katildi' ? 'ok' : 'warn') },
      { ad: 'yetkinlik_id', etiket: 'Belge', govde: (r) => (r.yetkinlik_id
        ? h`<a href="/personel/${r.personel_id}?sekme=belgeler">üretildi</a>` : '—') },
      { ad: 'gecerlilik', etiket: 'Geçerlilik', govde: (r) => (r.gecerlilik ? tarih(r.gecerlilik) : '—') },
    ],
  })}</div>
  </div>
  <div class="gv-side-stack">
    ${yetkiVar(ctx, 'HSE-09:guncelle') && katilmayanlar.length ? B.form({
    rota: `/isg/egitimler/${eg.id}`, csrf: csrfAlani(ctx),
    bolumler: [{ baslik: 'Katılım ekle', alanlar: h`
      ${B.alan({ ad: 'personelId', etiket: 'Personel', zorunlu: true,
      secenekler: [{ deger: '', etiket: 'Seçin…' },
        ...katilmayanlar.map((p) => ({ deger: p.id, etiket: `${p.kod} — ${p.ad_soyad}` }))] })}
      ${B.alan({ ad: 'sonuc', etiket: 'Sonuç', deger: 'katildi', secenekler: [
      { deger: 'katildi', etiket: 'Katıldı' }, { deger: 'katilmadi', etiket: 'Katılmadı' },
      { deger: 'basarisiz', etiket: 'Başarısız' }] })}` }],
    eylemler: B.btn('Katılımı kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: eg.ad, baslik: eg.ad }));
}

/* ==========================================================================
   HSE-10 — KKD
   ========================================================================== */
function kkdZimmet(ctx, govde) {
  const p = govde.personelId
    ? tek('SELECT * FROM personel WHERE id = ? AND tenant_id = ?', govde.personelId, ctx.tenant.id) : null;
  if (!p) throw DogrulamaHatasi('Personel seçin.', { alanlar: { personelId: ['Personel bulunamadı.'] } });
  const adet = Number(govde.adet ?? 1);
  if (!Number.isInteger(adet) || adet < 1 || adet > 1000) {
    throw DogrulamaHatasi('Adet 1–1000 arasında olmalı.', { alanlar: { adet: ['Geçersiz adet.'] } });
  }
  islem(() => {
    const id = kimlik('zimmet');
    calistir(`INSERT INTO kkd_zimmeti (id, tenant_id, santiye_id, personel_id, kkd_turu, aciklama,
                adet, teslim_tarihi, sonraki_kontrol, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?, 'zimmetli', ?,?)`,
      id, ctx.tenant.id, govde.santiyeId || null, p.id, govde.kkdTuru || 'diger',
      govde.aciklama || null, adet,
      govde.teslimTarihi ? gunBaslangici(govde.teslimTarihi) : simdi(),
      govde.sonrakiKontrol ? gunBaslangici(govde.sonrakiKontrol) : null,
      ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'kkd_zimmeti', nesneId: id, eylem: 'zimmetlendi',
      sonraki: { personel: p.kod, kkd: govde.kkdTuru, adet } });
  });
  return yonlendir(ctx, '/isg/kkd?olusturuldu=1');
}

function kkdIade(ctx, govde) {
  yetkiZorunlu(ctx, 'HSE-10:guncelle');
  const z = tek('SELECT * FROM kkd_zimmeti WHERE id = ? AND tenant_id = ?', govde.id, ctx.tenant.id);
  if (!z) throw Bulunamadi('Zimmet bulunamadı.');
  if (z.durum !== 'zimmetli') throw GecisIzinsiz('Bu zimmet zaten kapatılmış.');
  const sonuc = ['iade', 'hasarli', 'kayip'].includes(govde.sonuc) ? govde.sonuc : 'iade';
  islem(() => {
    surumluGuncelle('kkd_zimmeti', z.id, Number(govde.surum), { durum: sonuc, iade_tarihi: simdi() },
      { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'kkd_zimmeti', nesneId: z.id, eylem: `kapatildi:${sonuc}`,
      onceki: { durum: 'zimmetli' }, sonraki: { durum: sonuc } });
  });
  return yonlendir(ctx, `/isg/kkd?islem=${encodeURIComponent(`Zimmet ${sonuc} olarak kapatıldı`)}`);
}

/* ==========================================================================
   HSE-11 — çevre olayları ve atık
   ========================================================================== */
function atikKaydet(ctx, govde) {
  const miktar = Number(govde.miktarKg ?? 0);
  if (!Number.isInteger(miktar) || miktar < 0 || miktar > 100_000_000) {
    throw DogrulamaHatasi('Miktar 0 ile 100.000.000 kg arasında tam sayı olmalı.',
      { alanlar: { miktarKg: ['Geçersiz miktar.'] } });
  }
  if (govde.tur === 'tehlikeli' && !String(govde.irsaliyeNo || '').trim()) {
    /* Tehlikeli atık taşıma irsaliyesi mevzuat gereği zorunludur. */
    throw DogrulamaHatasi('Tehlikeli atıkta taşıma irsaliyesi numarası zorunludur.',
      { alanlar: { irsaliyeNo: ['İrsaliye numarası girin.'] } });
  }
  islem(() => {
    const id = kimlik('isg').replace('hse', 'atk');
    calistir(`INSERT INTO atik_kaydi (id, tenant_id, santiye_id, tur, atik_kodu, miktar_kg,
                bertaraf_yontemi, tasiyici, irsaliye_no, tarih, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?, 'kayitli', ?,?)`,
      id, ctx.tenant.id, govde.santiyeId || null, govde.tur || 'tehlikesiz',
      govde.atikKodu || null, miktar, govde.bertarafYontemi || null, govde.tasiyici || null,
      govde.irsaliyeNo || null, govde.tarih ? gunBaslangici(govde.tarih) : simdi(),
      ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'atik_kaydi', nesneId: id, eylem: 'olustur',
      sonraki: { tur: govde.tur, miktar, irsaliye: govde.irsaliyeNo } });
  });
  return 'Atık kaydı oluşturuldu';
}

function cevreSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('HSE-11');
  yetkiZorunlu(ctx, e.yetki);
  const t = ctx.tenant.id;
  const olaylar = sorgu(
    `SELECT * FROM isg_olayi WHERE tenant_id = ? AND tur = 'cevre' ORDER BY olay_zamani DESC LIMIT 20`, t);

  const kosullar = ['tenant_id = ?']; const parametreler = [t];
  if (ctx.sorgu.get('tur')) { kosullar.push('tur = ?'); parametreler.push(ctx.sorgu.get('tur')); }
  if (ctx.sorgu.get('santiye_id')) { kosullar.push('santiye_id = ?'); parametreler.push(ctx.sorgu.get('santiye_id')); }
  const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
  const nerede = kosullar.join(' AND ');
  const toplam = Number(tek(`SELECT COUNT(*) AS n FROM atik_kaydi WHERE ${nerede}`, ...parametreler)?.n ?? 0);
  const atiklar = sorgu(`SELECT * FROM atik_kaydi WHERE ${nerede} ORDER BY tarih DESC LIMIT ? OFFSET ?`,
    ...parametreler, boyut, atla);
  const tehlikeliKg = Number(tek(
    `SELECT COALESCE(SUM(miktar_kg),0) AS n FROM atik_kaydi WHERE tenant_id = ? AND tur = 'tehlikeli'`, t)?.n ?? 0);
  const toplamKg = Number(tek(
    `SELECT COALESCE(SUM(miktar_kg),0) AS n FROM atik_kaydi WHERE tenant_id = ?`, t)?.n ?? 0);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Çevre olayı', deger: sayi(sayac(t, 'isg_olayi', `tur = 'cevre'`)), ikon: 'fa-leaf' },
      { etiket: 'Toplam atık (kg)', deger: sayi(toplamKg), ikon: 'fa-dumpster' },
      { etiket: 'Tehlikeli atık (kg)', deger: sayi(tehlikeliKg), ikon: 'fa-radiation',
        ton: tehlikeliKg ? 'warn' : '' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ]),
    filtre: B.filtreBari({ rota: '/cevre', sorgu: ctx.sorgu, aramaYer: 'Atık kodu…',
      filtreler: [
        { ad: 'tur', etiket: 'Atık türü', secenekler: ATIK_TURLERI },
        { ad: 'santiye_id', etiket: 'Şantiye', secenekler: santiyeSecenekleri(ctx) },
      ] }),
    icerik: B.tablo({
      satirlar: atiklar,
      bosDurum: { baslik: 'Atık kaydı yok', ikon: 'fa-dumpster',
        aciklama: 'Tehlikeli atıkta taşıma irsaliyesi numarası zorunludur.' },
      sutunlar: [
        { ad: 'tarih', etiket: 'Tarih', govde: (r) => tarih(r.tarih) },
        { ad: 'tur', etiket: 'Tür', govde: (r) => B.isaret(
          ATIK_TURLERI.find((x) => x.deger === r.tur)?.etiket || r.tur,
          r.tur === 'tehlikeli' ? 'danger' : 'info') },
        { ad: 'atik_kodu', etiket: 'Atık kodu', govde: (r) => r.atik_kodu || '—' },
        { ad: 'miktar_kg', etiket: 'Miktar (kg)', hizala: 'sag', govde: (r) => sayi(r.miktar_kg) },
        { ad: 'tasiyici', etiket: 'Taşıyıcı', govde: (r) => r.tasiyici || '—' },
        { ad: 'irsaliye_no', etiket: 'İrsaliye', govde: (r) => r.irsaliye_no || '—' },
        { ad: 'bertaraf_yontemi', etiket: 'Bertaraf', govde: (r) => r.bertaraf_yontemi || '—' },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: '/cevre', sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
<div class="gv-card" style="margin-top:18px">
  <div class="gc-head"><div class="gc-title"><b>Çevre olayları</b>
    <span>Çevre olayı, İSG olay kaydının "çevre" türüdür — ayrı bir kayıt açılmaz (kural 4).</span></div>
    ${B.btn('Yeni çevre olayı', { rota: '/isg/olaylar/tehlike/yeni?tur=cevre', kucuk: true })}</div>
  <div class="gc-body flush">${B.tablo({
    satirlar: olaylar,
    satirRota: (r) => `/isg/olaylar/${r.id}`,
    bosDurum: { baslik: 'Çevre olayı yok', ikon: 'fa-leaf' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'baslik', etiket: 'Olay' },
      { ad: 'olay_zamani', etiket: 'Zaman', govde: (r) => tarih(r.olay_zamani) },
      { ad: 'onem', etiket: 'Önem', govde: (r) => B.isaret(r.onem, r.onem === 'kritik' ? 'danger' : 'warn') },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
    ],
  })}</div>
</div>
${yetkiVar(ctx, 'HSE-11:olustur') ? B.form({
    rota: '/cevre', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni atık kaydı',
      aciklama: 'Tehlikeli atıkta taşıma irsaliyesi numarası mevzuat gereği zorunludur.',
      alanlar: h`
      ${B.alan({ ad: 'tur', etiket: 'Atık türü', deger: deger.tur || 'tehlikesiz', secenekler: ATIK_TURLERI })}
      ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye', deger: deger.santiyeId || '',
      secenekler: [{ deger: '', etiket: 'Seçin…' }, ...santiyeSecenekleri(ctx)] })}
      ${B.alan({ ad: 'atikKodu', etiket: 'Atık kodu', deger: deger.atikKodu || '', ipucu: 'Örn. 17 01 01' })}
      ${B.alan({ ad: 'miktarKg', etiket: 'Miktar (kg)', tur: 'number', deger: deger.miktarKg || '',
      hata: hata?.alanlar?.miktarKg })}
      ${B.alan({ ad: 'tarih', etiket: 'Tarih', tur: 'date', deger: deger.tarih || gunAnahtari(simdi()) })}
      ${B.alan({ ad: 'tasiyici', etiket: 'Taşıyıcı firma', deger: deger.tasiyici || '' })}
      ${B.alan({ ad: 'irsaliyeNo', etiket: 'Taşıma irsaliyesi no', deger: deger.irsaliyeNo || '',
      hata: hata?.alanlar?.irsaliyeNo })}
      ${B.alan({ ad: 'bertarafYontemi', etiket: 'Bertaraf yöntemi', deger: deger.bertarafYontemi || '', genis: true })}` }],
    eylemler: B.btn('Atık kaydını oluştur', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/* ==========================================================================
   HSE-12 — İSG istatistik raporu
   ========================================================================== */
function isgRaporu(ctx) {
  const e = ekranNesnesi('HSE-12');
  yetkiZorunlu(ctx, e.yetki);
  const t = ctx.tenant.id;
  const ay = Number(ctx.sorgu.get('ay')) || 12;
  const baslangic = simdi() - ay * 30 * GUN_MS;
  const santiyeId = ctx.sorgu.get('santiye_id') || '';

  const kosul = santiyeId ? 'AND santiye_id = ?' : '';
  const p = santiyeId ? [t, baslangic, santiyeId] : [t, baslangic];
  const olaylar = sorgu(
    `SELECT * FROM isg_olayi WHERE tenant_id = ? AND olay_zamani >= ? ${kosul} ORDER BY olay_zamani DESC`, ...p);

  const kaza = olaylar.filter((o) => o.tur === 'kaza');
  const kayipGunluKaza = kaza.filter((o) => (o.kayip_gun || 0) > 0);
  const kayipGun = kaza.reduce((a, o) => a + (o.kayip_gun || 0), 0);
  const ramak = olaylar.filter((o) => o.tur === 'ramak_kala').length;
  const tehlike = olaylar.filter((o) => o.tur === 'tehlike').length;

  /* Çalışma saati puantajdan TÜRETİLİR; elle girilen bir sayı değildir (kural 7 ilkesi). */
  const saat = Number(tek(
    `SELECT COALESCE(SUM(normal_saat + fazla_saat),0) AS n FROM puantaj p
      WHERE p.tenant_id = ? AND p.olusturuldu >= ? ${santiyeId ? 'AND p.santiye_id = ?' : ''}`, ...p)?.n ?? 0);

  /* Uluslararası tanım: 1.000.000 çalışma saati başına. Sıfır saatte oran YOK. */
  const lti = saat > 0 ? (kayipGunluKaza.length * 1_000_000) / saat : null;
  const oran = (v) => (v == null ? '—' : v.toFixed(2).replace('.', ','));
  const agirlik = saat > 0 ? (kayipGun * 1_000_000) / saat : null;

  const turDagilimi = ['kaza', 'ramak_kala', 'tehlike', 'cevre'].map((tur) => ({
    tur, adet: olaylar.filter((o) => o.tur === tur).length,
  }));
  const santiyeDagilimi = sorgu(
    `SELECT s.kod, s.ad, COUNT(o.id) AS adet,
            SUM(CASE WHEN o.tur = 'kaza' THEN 1 ELSE 0 END) AS kaza
       FROM isg_olayi o JOIN santiye s ON s.id = o.santiye_id
      WHERE o.tenant_id = ? AND o.olay_zamani >= ? GROUP BY s.id ORDER BY adet DESC LIMIT 10`, t, baslangic);
  const denetimler = sorgu(
    `SELECT COUNT(*) AS adet, AVG(puan_binde) AS ort FROM isg_denetimi
      WHERE tenant_id = ? AND denetim_tarihi >= ?`, t, baslangic)[0] || { adet: 0, ort: null };

  const icerik = h`
${B.filtreBari({ rota: '/raporlar/isg', sorgu: ctx.sorgu, aramaYer: 'Ara…',
    filtreler: [
      { ad: 'ay', etiket: 'Dönem', secenekler: [3, 6, 12, 24].map((n) => ({ deger: String(n), etiket: `Son ${n} ay` })) },
      { ad: 'santiye_id', etiket: 'Şantiye', secenekler: santiyeSecenekleri(ctx) },
    ] })}
${B.kpiSeridi([
    { etiket: 'Kaza', deger: sayi(kaza.length), ikon: 'fa-user-injured', ton: kaza.length ? 'danger' : '' },
    { etiket: 'Kayıp günlü kaza', deger: sayi(kayipGunluKaza.length), ikon: 'fa-calendar-xmark' },
    { etiket: 'Kayıp gün', deger: sayi(kayipGun), ikon: 'fa-clock' },
    { etiket: 'Ramak kala', deger: sayi(ramak), ikon: 'fa-shield-halved' },
  ])}
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Oranlar ve formülleri</b>
    <span>Her KPI'ın formülü açıkça yazılır; çalışma saati puantajdan türetilir (kural 9).</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: [
      { kpi: 'Kaza sıklık oranı (LTIFR)',
        formul: 'kayıp günlü kaza × 1.000.000 / toplam çalışma saati',
        deger: oran(lti), not: saat > 0 ? `${saat} saat üzerinden` : 'Çalışma saati yok — oran hesaplanamaz' },
      { kpi: 'Kaza ağırlık oranı',
        formul: 'kayıp gün × 1.000.000 / toplam çalışma saati',
        deger: oran(agirlik), not: saat > 0 ? `${kayipGun} kayıp gün` : 'Çalışma saati yok' },
      { kpi: 'Ramak kala / kaza oranı',
        formul: 'ramak kala adedi / kaza adedi',
        deger: kaza.length ? oran(ramak / kaza.length) : (ramak ? '∞' : '—'),
        not: 'Yüksek oran, raporlama kültürünün güçlü olduğunu gösterir.' },
      { kpi: 'Denetim uygunluk ortalaması',
        formul: 'Σ(uygun madde / kontrol madde) / denetim adedi',
        deger: denetimler.ort == null ? '—' : yuzdeBinde(Math.round(denetimler.ort)),
        not: `${denetimler.adet} denetim` },
      { kpi: 'Tehlike bildirimi',
        formul: 'tür = tehlike olan olay adedi', deger: String(tehlike),
        not: 'Proaktif bildirim göstergesi' },
    ],
    bosDurum: { baslik: 'Veri yok' },
    sutunlar: [
      { ad: 'kpi', etiket: 'Gösterge', govde: (r) => h`<b>${r.kpi}</b>` },
      { ad: 'formul', etiket: 'Formül', govde: (r) => h`<code>${r.formul}</code>` },
      { ad: 'deger', etiket: 'Değer', hizala: 'sag', govde: (r) => h`<b>${r.deger}</b>` },
      { ad: 'not', etiket: 'Not' },
    ],
  })}</div>
</div>
<div class="dash-cols">
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>Olay türü dağılımı</b></div></div>
    <div class="gc-body flush">${B.tablo({
    satirlar: turDagilimi,
    bosDurum: { baslik: 'Olay yok' },
    sutunlar: [
      { ad: 'tur', etiket: 'Tür', govde: (r) => ({ kaza: 'Kaza', ramak_kala: 'Ramak kala',
        tehlike: 'Tehlikeli durum', cevre: 'Çevre' }[r.tur]) },
      { ad: 'adet', etiket: 'Adet', hizala: 'sag' },
      { ad: 'pay', etiket: 'Pay', hizala: 'sag', govde: (r) => (olaylar.length
        ? `%${((r.adet / olaylar.length) * 100).toFixed(1).replace('.', ',')}` : '—') },
    ],
  })}</div>
  </div>
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>Şantiye dağılımı</b></div></div>
    <div class="gc-body flush">${B.tablo({
    satirlar: santiyeDagilimi,
    bosDurum: { baslik: 'Şantiye bazlı olay yok' },
    sutunlar: [
      { ad: 'kod', etiket: 'Şantiye', govde: (r) => h`<b>${r.kod}</b><br><span class="muted">${r.ad}</span>` },
      { ad: 'adet', etiket: 'Olay', hizala: 'sag' },
      { ad: 'kaza', etiket: 'Kaza', hizala: 'sag',
        govde: (r) => (r.kaza ? B.isaret(String(r.kaza), 'danger') : '0') },
    ],
  })}</div>
  </div>
</div>
<div class="gv-card" style="margin-top:18px"><div class="gc-body">
  <div class="gv-cap-sm">Rapor künyesi</div>
  <dl class="gd-grid" style="margin-top:12px;padding-top:0;border-top:0">
    <div><dt>Filtre</dt><dd>Son ${ay} ay${santiyeId ? ' · şantiye filtreli' : ' · tüm şantiyeler'}</dd></div>
    <div><dt>Veri tarihi</dt><dd>${tarih(simdi())}</dd></div>
    <div><dt>Kayıt sayısı</dt><dd>${sayi(olaylar.length)} olay · ${sayi(denetimler.adet)} denetim</dd></div>
    <div><dt>Rapor sürümü</dt><dd>HSE-12 v1</dd></div>
  </dl>
  <p class="gf-hint" style="margin-top:12px">PDF/Excel çıktısı Faz 6'daki tek <code>ReportLayout</code>
    ile üretilecektir (K-030); bu sürümde ekran görünümü kanonik kaynaktır.</p>
</div></div>
${B.veriTarihi(simdi())}`;
  return html(ctx, 200, ciz(ctx, e, icerik));
}
