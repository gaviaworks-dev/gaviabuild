/* ============================================================================
   GÖREV ŞABLONU · İŞ EMRİ · TOPLANTI — TASK-04..09
   ----------------------------------------------------------------------------
   Üç kural bu modülde de aynen geçerlidir:
     · Şablondan üretilen görevler TASLAK açılır; şablon "tamamlandı" üretemez.
     · İş emri görevle aynı yaşam döngüsünü kullanır (tek geçiş motoru).
     · Toplantı kararı serbest metin DEĞİL, gerçek göreve dönüşür (§7 bağ).
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, tarihSaat, gunAnahtari, gunBaslangici, GUN_MS } from '../cekirdek/zaman.mjs';
import { DogrulamaHatasi, GecisIzinsiz, Bulunamadi, Cakisma, UygulamaHatasi } from '../cekirdek/hata.mjs';
import { kayitModulu, kullaniciSecenekleri, santiyeSecenekleri, projeSecenekleri,
  sayac, gecmisKarti } from './kayit-modulu.mjs';
import {
  ekranNesnesi, hataNesnesi, kullaniciAdi, ciz, kaydiAl, kayitOlustur, gecisFormu, gecisIsle,
  ozetSeridi, B, h, ham, sayi, csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar,
  sorgu, tek, calistir, islem, surumluGuncelle, audit, sonrakiKod,
} from './ortak.mjs';

const ONCELIKLER = [
  { deger: 'dusuk', etiket: 'Düşük' }, { deger: 'normal', etiket: 'Normal' },
  { deger: 'yuksek', etiket: 'Yüksek' }, { deger: 'kritik', etiket: 'Kritik' },
];
const IS_EMRI_TURLERI = [
  { deger: 'imalat', etiket: 'İmalat' }, { deger: 'bakim', etiket: 'Bakım' },
  { deger: 'onarim', etiket: 'Onarım' }, { deger: 'kurulum', etiket: 'Kurulum' },
  { deger: 'sokum', etiket: 'Söküm' }, { deger: 'diger', etiket: 'Diğer' },
];
const TOPLANTI_TURLERI = [
  { deger: 'saha', etiket: 'Saha toplantısı' }, { deger: 'koordinasyon', etiket: 'Koordinasyon' },
  { deger: 'musteri', etiket: 'Müşteri/işveren' }, { deger: 'isg', etiket: 'İSG' },
  { deger: 'kalite', etiket: 'Kalite' }, { deger: 'ic', etiket: 'İç toplantı' },
  { deger: 'diger', etiket: 'Diğer' },
];

export function kur(y, ekranRota) {
  /* ================= TASK-04 Görev şablonları ========================== */
  kayitModulu(y, ekranRota, {
    nesne: 'gorev_sablonu', tablo: 'gorev_sablonu', kimlikTuru: 'gorevAdim',
    rota: '/gorev-sablonlari', formRotasi: '/gorev-sablonlari?yeni=1',
    baslik: 'Görev şablonu', yeniEtiketi: 'Yeni şablon',
    listeKodu: 'TASK-04', formKodu: null, detayKodu: null, gecisNesnesi: 'gorev',
    aramaAlanlari: ['ad', 'kod', 'kategori'], aramaYer: 'Şablon adı, kodu veya kategori…',
    sirala: 'ad ASC',
    filtreler: [
      { ad: 'durum', etiket: 'Durum', secenekler: [
        { deger: 'aktif', etiket: 'Aktif' }, { deger: 'pasif', etiket: 'Pasif' }] },
      { ad: 'kategori', etiket: 'Kategori', secenekler: (ctx) => sorgu(
        `SELECT DISTINCT kategori FROM gorev_sablonu WHERE tenant_id = ? AND kategori IS NOT NULL ORDER BY kategori`,
        ctx.tenant.id).map((r) => ({ deger: r.kategori, etiket: r.kategori })) },
    ],
    alanlar: [],
    kpi: (ctx, toplam) => [
      { etiket: 'Aktif şablon', deger: sayi(sayac(ctx.tenant.id, 'gorev_sablonu', `durum = 'aktif'`)), ikon: 'fa-clone' },
      { etiket: 'Toplam kalem', deger: sayi(Number(tek(
        `SELECT COUNT(*) AS n FROM gorev_sablon_kalemi k JOIN gorev_sablonu s ON s.id = k.sablon_id
          WHERE s.tenant_id = ?`, ctx.tenant.id)?.n ?? 0)), ikon: 'fa-list-ol' },
      { etiket: 'Şablondan açılan görev', deger: sayi(sayac(ctx.tenant.id, 'gorev', `kaynak_nesne = 'gorev_sablonu'`)),
        ikon: 'fa-wand-magic-sparkles' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ],
    listeSutunlari: () => [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'ad', etiket: 'Şablon', govde: (r) => h`<a href="/gorev-sablonlari/${r.id}"><b>${r.ad}</b></a>${
        r.aciklama ? h`<br><span class="muted">${r.aciklama}</span>` : ''}` },
      { ad: 'kategori', etiket: 'Kategori', govde: (r) => r.kategori || '—' },
      { ad: 'kalem', etiket: 'Kalem', hizala: 'sag', govde: (r) => sayi(Number(tek(
        'SELECT COUNT(*) AS n FROM gorev_sablon_kalemi WHERE sablon_id = ?', r.id)?.n ?? 0)) },
      { ad: 'sure_gun', etiket: 'Süre (gün)', hizala: 'sag', govde: (r) => (r.sure_gun == null ? '—' : sayi(r.sure_gun)) },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum === 'aktif' ? 'onaylandi' : 'kapali',
        r.durum === 'aktif' ? 'Aktif' : 'Pasif') },
    ],
    bosDurum: { baslik: 'Şablon yok', ikon: 'fa-clone',
      aciklama: 'Tekrar eden iş paketlerini şablona alın; toplu görev üretimi şablondan yapılır.' },
    altForm: (ctx) => B.form({
      rota: '/gorev-sablonlari', csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Yeni görev şablonu',
        aciklama: 'Şablon kalemleri şablon detayında eklenir; her kalem bir görev üretir.',
        alanlar: h`
        ${B.alan({ ad: 'kod', etiket: 'Şablon kodu', zorunlu: true })}
        ${B.alan({ ad: 'ad', etiket: 'Şablon adı', zorunlu: true, genis: true })}
        ${B.alan({ ad: 'kategori', etiket: 'Kategori' })}
        ${B.alan({ ad: 'varsayilanOncelik', etiket: 'Varsayılan öncelik', deger: 'normal', secenekler: ONCELIKLER })}
        ${B.alan({ ad: 'sureGun', etiket: 'Toplam süre (gün)', tur: 'number' })}
        ${B.alan({ ad: 'aciklama', etiket: 'Açıklama', tur: 'metin', genis: true })}` }],
      eylemler: B.btn('Şablonu kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
    }),
  });

  y.post('/gorev-sablonlari', (ctx, govde) => {
    yetkiZorunlu(ctx, 'TASK-04:olustur');
    csrfZorunlu(ctx, govde);
    return sablonEkle(ctx, govde);
  }, { ekran: ekranNesnesi('TASK-04') });

  y.get('/gorev-sablonlari/:id', (ctx, _g, params) => sablonDetayi(ctx, params.id),
    { ekran: ekranNesnesi('TASK-04') });
  y.post('/gorev-sablonlari/:id', (ctx, govde, params) => {
    yetkiZorunlu(ctx, 'TASK-04:guncelle');
    csrfZorunlu(ctx, govde);
    try {
      const mesaj = govde._eylem === 'durum' ? sablonDurumu(ctx, params.id, govde)
        : sablonKalemEkle(ctx, params.id, govde);
      return yonlendir(ctx, `/gorev-sablonlari/${params.id}?islem=${encodeURIComponent(mesaj)}`);
    } catch (err) {
      if (!(err instanceof UygulamaHatasi)) throw err;
      return sablonDetayi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
    }
  }, { ekran: ekranNesnesi('TASK-04') });

  /* ================= TASK-05 Toplu görev oluşturma ===================== */
  ekranRota(y, 'TASK-05', {
    get: (ctx) => topluSayfasi(ctx),
    post: (ctx, govde) => {
      const e = ekranNesnesi('TASK-05');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const onizleme = topluOnizle(ctx, govde);
        if (govde._eylem !== 'uygula') return topluSayfasi(ctx, { onizleme, deger: govde });
        const sonuc = topluUygula(ctx, onizleme);
        return yonlendir(ctx, `/gorevler/toplu?uretildi=${sonuc.adet}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return topluSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= TASK-06 / TASK-07 İş emirleri ===================== */
  kayitModulu(y, ekranRota, {
    nesne: 'is_emri', tablo: 'is_emri', kodNesnesi: 'is_emri', kimlikTuru: 'gorev',
    rota: '/is-emirleri', formRotasi: '/is-emirleri?yeni=1',
    baslik: 'İş emri', yeniEtiketi: 'Yeni iş emri', baslangicEtiketi: 'taslak',
    listeKodu: 'TASK-06', formKodu: null, detayKodu: 'TASK-07',
    gecisNesnesi: 'gorev', baslikAlani: 'baslik',
    aramaAlanlari: ['baslik', 'kod', 'ekip'], aramaYer: 'İş emri başlığı, kodu veya ekip…',
    filtreler: [
      { ad: 'tur', etiket: 'Tür', secenekler: IS_EMRI_TURLERI },
      { ad: 'oncelik', etiket: 'Öncelik', secenekler: ONCELIKLER },
      { ad: 'santiye_id', etiket: 'Şantiye', secenekler: santiyeSecenekleri },
    ],
    alanlar: [],
    kpi: (ctx, toplam) => {
      const acik = sayac(ctx.tenant.id, 'is_emri', `durum NOT IN ('tamamlandi','iptal')`);
      const gecikmis = sayac(ctx.tenant.id, 'is_emri',
        `termin < ? AND durum NOT IN ('tamamlandi','iptal')`, simdi());
      return [
        { etiket: 'Açık iş emri', deger: sayi(acik), ikon: 'fa-screwdriver-wrench' },
        { etiket: 'Gecikmiş', deger: sayi(gecikmis), ikon: 'fa-clock', ton: gecikmis ? 'danger' : '' },
        { etiket: 'Bloke', deger: sayi(sayac(ctx.tenant.id, 'is_emri', 'bloke = 1')), ikon: 'fa-ban', ton: 'warn' },
        { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
      ];
    },
    listeSutunlari: () => [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'baslik', etiket: 'İş emri', govde: (r) => h`<a href="/is-emirleri/${r.id}"><b>${r.baslik}</b></a>${
        r.ekip ? h`<br><span class="muted">ekip: ${r.ekip}</span>` : ''}` },
      { ad: 'tur', etiket: 'Tür', govde: (r) => IS_EMRI_TURLERI.find((t) => t.deger === r.tur)?.etiket || r.tur },
      { ad: 'sorumlu_id', etiket: 'Sorumlu', govde: (r) => kullaniciAdi(r.sorumlu_id) },
      { ad: 'termin', etiket: 'Termin', govde: (r) => (r.termin ? tarih(r.termin) : '—') },
      /* Yaşam durumu ile HESAPLANAN gecikme AYRI sütunlarda (§5.2). */
      { ad: 'gecikme', etiket: 'Takvim', govde: (r) => (r.termin && r.termin < simdi()
        && !['tamamlandi', 'iptal'].includes(r.durum)
        ? B.isaret(`${Math.floor((simdi() - r.termin) / GUN_MS)} gün gecikti`, 'danger')
        : r.bloke ? B.isaret('bloke', 'warn') : B.isaret('takvimde', 'ok')) },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
    ],
    bosDurum: { baslik: 'İş emri yok', ikon: 'fa-screwdriver-wrench',
      aciklama: 'İş emri saha ekibine verilen üretim/bakım talimatıdır; görevle aynı yaşam döngüsünü kullanır.' },
    altForm: (ctx) => B.form({
      rota: '/is-emirleri', csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Yeni iş emri',
        aciklama: 'İş emri "taslak" açılır; durum ve atama geçiş motorundan yürür.',
        alanlar: h`
        ${B.alan({ ad: 'baslik', etiket: 'Başlık', zorunlu: true, genis: true })}
        ${B.alan({ ad: 'tur', etiket: 'Tür', deger: 'imalat', secenekler: IS_EMRI_TURLERI })}
        ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye',
          secenekler: [{ deger: '', etiket: 'Seçin…' }, ...santiyeSecenekleri(ctx)] })}
        ${B.alan({ ad: 'sorumluId', etiket: 'Sorumlu',
          secenekler: [{ deger: '', etiket: 'Havuza bırak' }, ...kullaniciSecenekleri(ctx)] })}
        ${B.alan({ ad: 'ekip', etiket: 'Ekip' })}
        ${B.alan({ ad: 'oncelik', etiket: 'Öncelik', deger: 'normal', secenekler: ONCELIKLER })}
        ${B.alan({ ad: 'planlananBaslangic', etiket: 'Planlanan başlangıç', tur: 'date' })}
        ${B.alan({ ad: 'termin', etiket: 'Termin', tur: 'date' })}
        ${B.alan({ ad: 'tahminiSaat', etiket: 'Tahmini süre (saat)', tur: 'number' })}
        ${B.alan({ ad: 'aciklama', etiket: 'Talimat', tur: 'metin', genis: true })}` }],
      eylemler: B.btn('İş emrini aç', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
    }),
    detayBilgileri: (r) => [
      { etiket: 'Tür', deger: IS_EMRI_TURLERI.find((t) => t.deger === r.tur)?.etiket || r.tur },
      { etiket: 'Sorumlu', deger: kullaniciAdi(r.sorumlu_id) },
      { etiket: 'Ekip', deger: r.ekip || '—' },
      { etiket: 'Planlanan', deger: r.planlanan_baslangic ? tarih(r.planlanan_baslangic) : '—' },
      { etiket: 'Termin', deger: r.termin ? tarih(r.termin) : '—' },
      { etiket: 'Tahmini / gerçekleşen', deger: `${r.tahmini_saat ?? '—'} / ${r.gerceklesen_saat ?? '—'} saat` },
    ],
    detayEkleri: (ctx, r) => h`
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Talimat</b></div></div>
  <div class="gc-body"><p style="font-size:13.5px;line-height:1.7">${r.aciklama || '—'}</p></div>
</div>
${r.kaynak_nesne ? h`<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Kaynak kayıt</b>
    <span>Bu iş emri başka bir kayıttan türedi.</span></div></div>
  <div class="gc-body"><p>${r.kaynak_nesne} · <code>${r.kaynak_id}</code></p></div>
</div>` : ''}
${yetkiVar(ctx, 'TASK-07:guncelle') && !['tamamlandi', 'iptal'].includes(r.durum) ? h`
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Saha geri bildirimi</b>
    <span>Gerçekleşen süre ve blokaj; durum buradan seçilmez.</span></div></div>
  <div class="gc-body">
    <form method="post" action="/is-emirleri/${r.id}" data-gform="1">
      ${ham(csrfAlani(ctx))}
      <input type="hidden" name="_eylem" value="saha">
      <input type="hidden" name="surum" value="${r.surum}">
      <div class="gform-alanlar">
        ${B.alan({ ad: 'gerceklesenSaat', etiket: 'Gerçekleşen süre (saat)', tur: 'number',
      deger: r.gerceklesen_saat ?? '' })}
        ${B.alan({ ad: 'bloke', etiket: 'Bloke', deger: String(r.bloke),
      secenekler: [{ deger: '0', etiket: 'Hayır' }, { deger: '1', etiket: 'Evet' }] })}
        ${B.alan({ ad: 'blokeNedeni', etiket: 'Blokaj nedeni', genis: true, deger: r.bloke_nedeni || '' })}
      </div>
      <div style="margin-top:12px">${B.btn('Geri bildirimi kaydet', { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' })}</div>
    </form>
  </div>
</div>` : ''}
${gecmisKarti('is_emri', r)}`,
    detayIslemleri: {
      saha: (ctx, r, govde) => {
        const saat = govde.gerceklesenSaat === '' || govde.gerceklesenSaat == null
          ? null : Number(govde.gerceklesenSaat);
        if (saat != null && (!Number.isInteger(saat) || saat < 0 || saat > 10000)) {
          throw DogrulamaHatasi('Gerçekleşen süre 0–10000 saat arasında tam sayı olmalı.',
            { alanlar: { gerceklesenSaat: ['Geçersiz süre.'] } });
        }
        const bloke = govde.bloke === '1' ? 1 : 0;
        if (bloke && !String(govde.blokeNedeni || '').trim()) {
          throw DogrulamaHatasi('Blokaj nedeni zorunludur.', { alanlar: { blokeNedeni: ['Nedeni yazın.'] } });
        }
        islem(() => {
          surumluGuncelle('is_emri', r.id, Number(govde.surum),
            { gerceklesen_saat: saat, bloke, bloke_nedeni: bloke ? govde.blokeNedeni : null },
            { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
          audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
            nesne: 'is_emri', nesneId: r.id, eylem: 'saha_geri_bildirimi',
            onceki: { saat: r.gerceklesen_saat, bloke: r.bloke }, sonraki: { saat, bloke } });
        });
        return 'Saha geri bildirimi kaydedildi';
      },
    },
  });

  y.post('/is-emirleri', (ctx, govde) => {
    yetkiZorunlu(ctx, 'TASK-06:olustur');
    csrfZorunlu(ctx, govde);
    return isEmriAc(ctx, govde);
  }, { ekran: ekranNesnesi('TASK-06') });

  /* ================= TASK-08 / TASK-09 Toplantılar ===================== */
  kayitModulu(y, ekranRota, {
    nesne: 'toplanti', tablo: 'toplanti', kodNesnesi: 'toplanti', kimlikTuru: 'olay',
    rota: '/toplantilar', formRotasi: '/toplantilar?yeni=1',
    baslik: 'Toplantı', yeniEtiketi: 'Yeni toplantı',
    listeKodu: 'TASK-08', formKodu: null, detayKodu: null, gecisNesnesi: 'gorev',
    aramaAlanlari: ['baslik', 'kod', 'gundem'], aramaYer: 'Toplantı başlığı, kodu veya gündem…',
    sirala: 'baslangic DESC',
    filtreler: [
      { ad: 'tur', etiket: 'Tür', secenekler: TOPLANTI_TURLERI },
      { ad: 'durum', etiket: 'Durum', secenekler: [
        { deger: 'planlandi', etiket: 'Planlandı' }, { deger: 'yapildi', etiket: 'Yapıldı' },
        { deger: 'kapali', etiket: 'Kapalı' }, { deger: 'iptal', etiket: 'İptal' }] },
      { ad: 'santiye_id', etiket: 'Şantiye', secenekler: santiyeSecenekleri },
    ],
    alanlar: [],
    kpi: (ctx, toplam) => [
      { etiket: 'Planlanan', deger: sayi(sayac(ctx.tenant.id, 'toplanti', `durum = 'planlandi'`)), ikon: 'fa-calendar-day' },
      { etiket: 'Tutanağı eksik', deger: sayi(sayac(ctx.tenant.id, 'toplanti',
        `durum = 'yapildi' AND (tutanak IS NULL OR tutanak = '')`)), ikon: 'fa-file-pen', ton: 'warn' },
      { etiket: 'Açık karar', deger: sayi(Number(tek(
        `SELECT COUNT(*) AS n FROM toplanti_karari k JOIN gorev g ON g.id = k.gorev_id
          WHERE k.tenant_id = ? AND g.durum NOT IN ('tamamlandi','iptal')`, ctx.tenant.id)?.n ?? 0)),
        ikon: 'fa-list-check' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ],
    listeSutunlari: () => [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'baslik', etiket: 'Toplantı', govde: (r) => h`<a href="/toplantilar/${r.id}"><b>${r.baslik}</b></a>${
        r.yer ? h`<br><span class="muted">${r.yer}</span>` : ''}` },
      { ad: 'tur', etiket: 'Tür', govde: (r) => TOPLANTI_TURLERI.find((t) => t.deger === r.tur)?.etiket || r.tur },
      { ad: 'baslangic', etiket: 'Tarih', govde: (r) => tarihSaat(r.baslangic) },
      { ad: 'karar', etiket: 'Karar', hizala: 'sag', govde: (r) => sayi(Number(tek(
        'SELECT COUNT(*) AS n FROM toplanti_karari WHERE toplanti_id = ?', r.id)?.n ?? 0)) },
      { ad: 'tutanak', etiket: 'Tutanak', govde: (r) => (r.tutanak
        ? B.isaret('var', 'ok') : B.isaret('yok', r.durum === 'yapildi' ? 'danger' : 'warn')) },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(
        { planlandi: 'taslak', yapildi: 'beklemede', tutanak_onayinda: 'incelemede',
          kapali: 'kapali', iptal: 'iptal' }[r.durum] || r.durum,
        { planlandi: 'Planlandı', yapildi: 'Yapıldı', tutanak_onayinda: 'Tutanak onayında',
          kapali: 'Kapalı', iptal: 'İptal' }[r.durum]) },
    ],
    bosDurum: { baslik: 'Toplantı yok', ikon: 'fa-users-rectangle',
      aciklama: 'Saha, koordinasyon ve müşteri toplantıları; kararlar göreve dönüşür.' },
    altForm: (ctx) => B.form({
      rota: '/toplantilar', csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Yeni toplantı', alanlar: h`
        ${B.alan({ ad: 'baslik', etiket: 'Başlık', zorunlu: true, genis: true })}
        ${B.alan({ ad: 'tur', etiket: 'Tür', deger: 'saha', secenekler: TOPLANTI_TURLERI })}
        ${B.alan({ ad: 'projeId', etiket: 'Proje',
          secenekler: [{ deger: '', etiket: 'Seçin…' }, ...projeSecenekleri(ctx)] })}
        ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye',
          secenekler: [{ deger: '', etiket: 'Seçin…' }, ...santiyeSecenekleri(ctx)] })}
        ${B.alan({ ad: 'tarih', etiket: 'Tarih', tur: 'date', zorunlu: true, deger: gunAnahtari(simdi()) })}
        ${B.alan({ ad: 'saat', etiket: 'Saat', tur: 'time', deger: '10:00' })}
        ${B.alan({ ad: 'yer', etiket: 'Yer' })}
        ${B.alan({ ad: 'katilimcilar', etiket: 'Katılımcılar', genis: true })}
        ${B.alan({ ad: 'gundem', etiket: 'Gündem', tur: 'metin', genis: true })}` }],
      eylemler: B.btn('Toplantıyı kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
    }),
  });

  y.post('/toplantilar', (ctx, govde) => {
    yetkiZorunlu(ctx, 'TASK-08:olustur');
    csrfZorunlu(ctx, govde);
    return toplantiAc(ctx, govde);
  }, { ekran: ekranNesnesi('TASK-08') });

  ekranRota(y, 'TASK-09', {
    get: (ctx, _g, params) => toplantiDetayi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('TASK-09');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = govde._eylem === 'karar' ? kararEkle(ctx, params.id, govde)
          : govde._eylem === 'gorev' ? karardanGorev(ctx, params.id, govde)
            : tutanakKaydet(ctx, params.id, govde);
        return yonlendir(ctx, `/toplantilar/${params.id}?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return toplantiDetayi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });
}

/* ==========================================================================
   TASK-04 — şablon
   ========================================================================== */
function sablonEkle(ctx, govde) {
  const kod = String(govde.kod || '').trim();
  const ad = String(govde.ad || '').trim();
  const hatalar = {};
  if (!kod) hatalar.kod = ['Şablon kodu girin.'];
  if (!ad) hatalar.ad = ['Şablon adı girin.'];
  if (Object.keys(hatalar).length) throw DogrulamaHatasi('Şablon bilgileri eksik.', { alanlar: hatalar });
  if (tek('SELECT id FROM gorev_sablonu WHERE tenant_id = ? AND kod = ?', ctx.tenant.id, kod)) {
    throw Cakisma(`"${kod}" kodlu şablon zaten var.`);
  }
  const sureGun = govde.sureGun ? Number(govde.sureGun) : null;
  if (sureGun != null && (!Number.isInteger(sureGun) || sureGun < 0 || sureGun > 3650)) {
    throw DogrulamaHatasi('Süre 0–3650 gün arasında olmalı.', { alanlar: { sureGun: ['Geçersiz süre.'] } });
  }
  islem(() => {
    const id = kimlik('gorevAdim');
    calistir(`INSERT INTO gorev_sablonu (id, tenant_id, kod, ad, aciklama, kategori,
                varsayilan_oncelik, sure_gun, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?, 'aktif', ?,?)`,
      id, ctx.tenant.id, kod, ad, govde.aciklama || null, govde.kategori || null,
      govde.varsayilanOncelik || 'normal', sureGun, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'gorev_sablonu', nesneId: id, eylem: 'olustur', sonraki: { kod, ad } });
  });
  return yonlendir(ctx, '/gorev-sablonlari?olusturuldu=1');
}

function sablonKalemEkle(ctx, id, govde) {
  const s = tek('SELECT * FROM gorev_sablonu WHERE id = ? AND tenant_id = ?', id, ctx.tenant.id);
  if (!s) throw Bulunamadi('Şablon bulunamadı.');
  const baslik = String(govde.kalemBasligi || '').trim();
  if (!baslik) throw DogrulamaHatasi('Kalem başlığı zorunludur.', { alanlar: { kalemBasligi: ['Başlık girin.'] } });
  const ofset = govde.gunOfseti ? Number(govde.gunOfseti) : 0;
  if (!Number.isInteger(ofset) || ofset < 0 || ofset > 3650) {
    throw DogrulamaHatasi('Gün ofseti 0–3650 arasında olmalı.', { alanlar: { gunOfseti: ['Geçersiz ofset.'] } });
  }
  islem(() => {
    const sira = Number(tek('SELECT COALESCE(MAX(sira), 0) AS n FROM gorev_sablon_kalemi WHERE sablon_id = ?', s.id)?.n ?? 0) + 1;
    calistir(`INSERT INTO gorev_sablon_kalemi (id, sablon_id, sira, baslik, aciklama, oncelik, gun_ofseti)
              VALUES (?,?,?,?,?,?,?)`,
      kimlik('gorevAdim'), s.id, sira, baslik, govde.kalemAciklamasi || null,
      govde.kalemOnceligi || s.varsayilan_oncelik, ofset);
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'gorev_sablonu', nesneId: s.id, eylem: 'kalem_eklendi', sonraki: { sira, baslik } });
  });
  return `${baslik} kalemi eklendi`;
}

function sablonDurumu(ctx, id, govde) {
  const s = tek('SELECT * FROM gorev_sablonu WHERE id = ? AND tenant_id = ?', id, ctx.tenant.id);
  if (!s) throw Bulunamadi('Şablon bulunamadı.');
  const yeni = s.durum === 'aktif' ? 'pasif' : 'aktif';
  islem(() => {
    surumluGuncelle('gorev_sablonu', s.id, Number(govde.surum), { durum: yeni },
      { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'gorev_sablonu', nesneId: s.id, eylem: yeni === 'aktif' ? 'aktiflestirildi' : 'pasiflestirildi',
      onceki: { durum: s.durum }, sonraki: { durum: yeni } });
  });
  return `Şablon ${yeni === 'aktif' ? 'aktifleştirildi' : 'pasifleştirildi'}`;
}

function sablonDetayi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('TASK-04');
  yetkiZorunlu(ctx, e.yetki);
  const s = tek('SELECT * FROM gorev_sablonu WHERE id = ? AND tenant_id = ?', id, ctx.tenant.id);
  if (!s) throw Bulunamadi('Şablon bulunamadı.');
  const kalemler = sorgu('SELECT * FROM gorev_sablon_kalemi WHERE sablon_id = ? ORDER BY sira', s.id);
  const uretilen = sorgu(
    `SELECT * FROM gorev WHERE tenant_id = ? AND kaynak_nesne = 'gorev_sablonu' AND kaynak_id = ?
      ORDER BY olusturuldu DESC LIMIT 20`, ctx.tenant.id, s.id);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.detayOzetSeridi({
    kod: s.kod, baslik: s.ad, durum: s.durum === 'aktif' ? 'onaylandi' : 'kapali', surum: s.surum,
    bilgiler: [
      { etiket: 'Kategori', deger: s.kategori || '—' },
      { etiket: 'Kalem', deger: sayi(kalemler.length) },
      { etiket: 'Varsayılan öncelik', deger: ONCELIKLER.find((o) => o.deger === s.varsayilan_oncelik)?.etiket },
      { etiket: 'Toplam süre', deger: s.sure_gun == null ? '—' : `${s.sure_gun} gün` },
      { etiket: 'Üretilen görev', deger: sayi(uretilen.length) },
    ],
    birincilEylem: B.btn('Toplu görev üret', { tur: 'acc', rota: `/gorevler/toplu?sablonId=${s.id}`, ikon: 'fa-wand-magic-sparkles' }),
    digerEylemler: yetkiVar(ctx, 'TASK-04:guncelle')
      ? h`<form method="post" action="/gorev-sablonlari/${s.id}" style="display:inline">
          ${ham(csrfAlani(ctx))}
          <input type="hidden" name="_eylem" value="durum">
          <input type="hidden" name="surum" value="${s.surum}">
          <button class="btn btn-ghost" type="submit">${s.durum === 'aktif' ? 'Pasifleştir' : 'Aktifleştir'}</button>
        </form>` : null,
  })}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Şablon kalemleri</b>
        <span>Her kalem bir görev üretir; gün ofseti başlangıç tarihine eklenir.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: kalemler,
    bosDurum: { baslik: 'Kalem yok', ikon: 'fa-list-ol',
      aciklama: 'Kalemsiz şablondan görev üretilemez.' },
    sutunlar: [
      { ad: 'sira', etiket: '#', hizala: 'sag' },
      { ad: 'baslik', etiket: 'Görev', govde: (r) => h`<b>${r.baslik}</b>${
        r.aciklama ? h`<br><span class="muted">${r.aciklama}</span>` : ''}` },
      { ad: 'oncelik', etiket: 'Öncelik', govde: (r) => ONCELIKLER.find((o) => o.deger === r.oncelik)?.etiket },
      { ad: 'gun_ofseti', etiket: 'Gün ofseti', hizala: 'sag' },
    ],
  })}</div>
    </div>
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Bu şablondan üretilen görevler</b></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: uretilen,
    satirRota: (r) => `/gorevler/${r.id}`,
    bosDurum: { baslik: 'Henüz görev üretilmedi', ikon: 'fa-list-check' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'baslik', etiket: 'Görev' },
      { ad: 'termin', etiket: 'Termin', govde: (r) => (r.termin ? tarih(r.termin) : '—') },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
    ],
  })}</div>
    </div>
  </div>
  <div class="gv-side-stack">
    ${yetkiVar(ctx, 'TASK-04:guncelle') ? B.form({
    rota: `/gorev-sablonlari/${s.id}`, csrf: csrfAlani(ctx),
    bolumler: [{ baslik: 'Kalem ekle', alanlar: h`
      ${ham('<input type="hidden" name="_eylem" value="kalem">')}
      ${B.alan({ ad: 'kalemBasligi', etiket: 'Görev başlığı', zorunlu: true, genis: true })}
      ${B.alan({ ad: 'kalemOnceligi', etiket: 'Öncelik', deger: s.varsayilan_oncelik, secenekler: ONCELIKLER })}
      ${B.alan({ ad: 'gunOfseti', etiket: 'Gün ofseti', tur: 'number', deger: '0',
      ipucu: 'Başlangıç tarihine eklenecek gün sayısı.' })}
      ${B.alan({ ad: 'kalemAciklamasi', etiket: 'Açıklama', tur: 'metin', genis: true })}` }],
    eylemler: B.btn('Kalemi ekle', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: s.kod, baslik: s.ad }));
}

/* ==========================================================================
   TASK-05 — toplu görev
   ========================================================================== */
function topluOnizle(ctx, govde) {
  const s = govde.sablonId
    ? tek(`SELECT * FROM gorev_sablonu WHERE id = ? AND tenant_id = ?`, govde.sablonId, ctx.tenant.id) : null;
  if (!s) throw DogrulamaHatasi('Şablon seçin.', { alanlar: { sablonId: ['Şablon bulunamadı.'] } });
  if (s.durum !== 'aktif') throw GecisIzinsiz('Pasif şablondan görev üretilemez.');
  const kalemler = sorgu('SELECT * FROM gorev_sablon_kalemi WHERE sablon_id = ? ORDER BY sira', s.id);
  if (!kalemler.length) throw GecisIzinsiz('Şablonda kalem yok; üretilecek görev bulunamadı.');
  if (!govde.baslangic) {
    throw DogrulamaHatasi('Başlangıç tarihi zorunludur.', { alanlar: { baslangic: ['Tarih seçin.'] } });
  }
  const bas = gunBaslangici(govde.baslangic);
  const santiye = govde.santiyeId
    ? tek('SELECT * FROM santiye WHERE id = ? AND tenant_id = ?', govde.santiyeId, ctx.tenant.id) : null;
  if (govde.santiyeId && !santiye) {
    throw DogrulamaHatasi('Şantiye bulunamadı.', { alanlar: { santiyeId: ['Geçersiz şantiye.'] } });
  }

  /* Aynı şablon + aynı başlangıç + aynı şantiye ikinci kez üretilmez: toplu
     üretim yanlışlıkla iki kez tetiklenirse görev listesi ikiye katlanırdı. */
  const cakisan = sorgu(
    `SELECT baslik FROM gorev WHERE tenant_id = ? AND kaynak_nesne = 'gorev_sablonu' AND kaynak_id = ?
       AND (santiye_id IS ? OR santiye_id = ?) AND durum NOT IN ('iptal')`,
    ctx.tenant.id, s.id, santiye?.id ?? null, santiye?.id ?? '');
  const mevcutBasliklar = new Set(cakisan.map((g) => g.baslik));

  const satirlar = kalemler.map((k) => {
    const baslik = govde.onEk ? `${govde.onEk} — ${k.baslik}` : k.baslik;
    return {
      sira: k.sira, baslik, oncelik: k.oncelik, aciklama: k.aciklama,
      termin: bas + k.gun_ofseti * GUN_MS,
      sonuc: mevcutBasliklar.has(baslik) ? 'atlanacak' : 'uretilecek',
      not: mevcutBasliklar.has(baslik) ? 'Aynı başlıkla açık görev zaten var.' : '—',
    };
  });
  return { sablon: s, santiye, satirlar, uretilecek: satirlar.filter((r) => r.sonuc === 'uretilecek').length };
}

function topluUygula(ctx, onizleme) {
  if (!onizleme.uretilecek) throw GecisIzinsiz('Üretilecek yeni görev yok.');
  return islem(() => {
    let adet = 0;
    for (const r of onizleme.satirlar) {
      if (r.sonuc !== 'uretilecek') continue;
      /* Görev TASLAK açılır; şablon nihai durum üretemez (değişmez kural 5). */
      kayitOlustur(ctx, { tablo: 'gorev', nesne: 'gorev', kodNesnesi: 'gorev',
        alanlar: { id: kimlik('gorev'), baslik: r.baslik, aciklama: r.aciklama,
          proje_id: onizleme.santiye?.proje_id || null, santiye_id: onizleme.santiye?.id || null,
          oncelik: r.oncelik, termin: r.termin, durum: 'taslak',
          kaynak_nesne: 'gorev_sablonu', kaynak_id: onizleme.sablon.id } });
      adet++;
    }
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'gorev_sablonu', nesneId: onizleme.sablon.id, eylem: 'toplu_gorev_uretildi',
      sonraki: { adet, santiye: onizleme.santiye?.kod || null } });
    return { adet };
  });
}

function topluSayfasi(ctx, { hata = null, durum = 200, onizleme = null, deger = {} } = {}) {
  const e = ekranNesnesi('TASK-05');
  yetkiZorunlu(ctx, e.yetki);
  const sablonlar = sorgu(
    `SELECT id, kod, ad FROM gorev_sablonu WHERE tenant_id = ? AND durum = 'aktif' ORDER BY ad`, ctx.tenant.id)
    .map((s) => ({ deger: s.id, etiket: `${s.kod} — ${s.ad}` }));
  const uretildi = ctx.sorgu.get('uretildi');
  const secili = deger.sablonId || ctx.sorgu.get('sablonId') || '';

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${uretildi ? B.sonucSeridi({ tur: 'ok', baslik: `${uretildi} görev üretildi`,
    aciklama: 'Görevler TASLAK durumunda açıldı; atama ve durum geçişleri görev ekranından yürür.',
    kayitRota: '/gorevler' }) : ''}
${sablonlar.length === 0 ? B.sonucSeridi({ tur: 'warn', baslik: 'Aktif şablon yok',
    aciklama: 'Önce görev şablonu tanımlayın.', kayitRota: '/gorev-sablonlari' }) : ''}
<form method="post" action="/gorevler/toplu" data-gform="1">
  ${ham(csrfAlani(ctx))}
  <div class="form-grid">
    <div class="gform-main">
      <section class="gv-card gform-sec">
        <div class="gc-head"><div class="gc-title"><b>Toplu görev üretimi</b>
          <span>Önce KURU ÇALIŞTIRMA yapılır; ne üretileceğini görmeden hiçbir kayıt açılmaz.</span></div></div>
        <div class="gc-body"><div class="gform-alanlar">
          ${B.alan({ ad: 'sablonId', etiket: 'Şablon', zorunlu: true, deger: secili,
    hata: hata?.alanlar?.sablonId, secenekler: [{ deger: '', etiket: 'Seçin…' }, ...sablonlar] })}
          ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye', deger: deger.santiyeId || '',
    hata: hata?.alanlar?.santiyeId,
    secenekler: [{ deger: '', etiket: 'Şantiyesiz (genel)' }, ...santiyeSecenekleri(ctx)] })}
          ${B.alan({ ad: 'baslangic', etiket: 'Başlangıç tarihi', tur: 'date', zorunlu: true,
    deger: deger.baslangic || gunAnahtari(simdi()), hata: hata?.alanlar?.baslangic,
    ipucu: 'Kalem gün ofsetleri bu tarihe eklenir.' })}
          ${B.alan({ ad: 'onEk', etiket: 'Başlık ön eki', deger: deger.onEk || '',
    genis: true, ipucu: 'Örn. "B Blok" → "B Blok — Kalıp sökümü"' })}
        </div></div>
      </section>
    </div>
    <aside class="gform-side"><div class="gv-card"><div class="gc-body">
      <div class="gv-cap-sm">Üretim kuralı</div>
      <p style="margin-top:10px;font-size:12.5px;line-height:1.7;color:var(--muted)">
        Üretilen görevler <b>taslak</b> açılır. Aynı şablon, aynı şantiye ve aynı başlıkla
        <b>açık görev</b> varsa o kalem atlanır — yanlışlıkla iki kez çalıştırmak görev
        listesini ikiye katlamaz.</p>
    </div></div></aside>
  </div>
  <div class="form-foot">
    ${B.btn('Önizle (hiçbir şey yazmaz)', { gonder: true, ikon: 'fa-magnifying-glass' })}
    ${onizleme && onizleme.uretilecek
    ? h`<button class="btn btn-acc" type="submit" name="_eylem" value="uygula">
        <i class="fa-solid fa-wand-magic-sparkles"></i> ${onizleme.uretilecek} görevi üret</button>` : ''}
  </div>
</form>
${onizleme ? h`
<div class="gv-card" style="margin-top:18px">
  <div class="gc-head"><div class="gc-title"><b>Önizleme — ${onizleme.sablon.ad}</b>
    <span>${onizleme.uretilecek} görev üretilecek, ${onizleme.satirlar.length - onizleme.uretilecek} kalem atlanacak.</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: onizleme.satirlar,
    bosDurum: { baslik: 'Kalem yok' },
    sutunlar: [
      { ad: 'sira', etiket: '#', hizala: 'sag' },
      { ad: 'baslik', etiket: 'Görev', govde: (r) => h`<b>${r.baslik}</b>` },
      { ad: 'oncelik', etiket: 'Öncelik', govde: (r) => ONCELIKLER.find((o) => o.deger === r.oncelik)?.etiket },
      { ad: 'termin', etiket: 'Termin', govde: (r) => tarih(r.termin) },
      { ad: 'sonuc', etiket: 'Sonuç', govde: (r) => (r.sonuc === 'uretilecek'
        ? B.isaret('üretilecek', 'ok') : B.isaret('atlanacak', 'warn')) },
      { ad: 'not', etiket: 'Açıklama' },
    ],
  })}</div>
</div>` : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/* ==========================================================================
   TASK-06 — iş emri açılışı
   ========================================================================== */
function isEmriAc(ctx, govde) {
  const baslik = String(govde.baslik || '').trim();
  if (!baslik) throw DogrulamaHatasi('Başlık zorunludur.', { alanlar: { baslik: ['Başlık girin.'] } });
  const santiye = govde.santiyeId
    ? tek('SELECT * FROM santiye WHERE id = ? AND tenant_id = ?', govde.santiyeId, ctx.tenant.id) : null;
  const saat = govde.tahminiSaat ? Number(govde.tahminiSaat) : null;
  if (saat != null && (!Number.isInteger(saat) || saat < 0 || saat > 10000)) {
    throw DogrulamaHatasi('Tahmini süre 0–10000 saat arasında olmalı.', { alanlar: { tahminiSaat: ['Geçersiz süre.'] } });
  }
  const bas = govde.planlananBaslangic ? gunBaslangici(govde.planlananBaslangic) : null;
  const termin = govde.termin ? gunBaslangici(govde.termin) : null;
  if (bas && termin && termin < bas) {
    throw DogrulamaHatasi('Termin planlanan başlangıçtan önce olamaz.', { alanlar: { termin: ['Tarih aralığı geçersiz.'] } });
  }
  const kayit = kayitOlustur(ctx, { tablo: 'is_emri', nesne: 'is_emri', kodNesnesi: 'is_emri',
    alanlar: { id: kimlik('gorev'), baslik, tur: govde.tur || 'imalat', aciklama: govde.aciklama || null,
      proje_id: santiye?.proje_id || null, santiye_id: santiye?.id || null,
      sorumlu_id: govde.sorumluId || null, ekip: govde.ekip || null,
      oncelik: govde.oncelik || 'normal', planlanan_baslangic: bas, termin,
      tahmini_saat: saat, durum: 'taslak' } });
  return yonlendir(ctx, `/is-emirleri/${kayit.id}?olusan=1`);
}

/* ==========================================================================
   TASK-08 / TASK-09 — toplantı ve tutanak
   ========================================================================== */
function toplantiAc(ctx, govde) {
  const baslik = String(govde.baslik || '').trim();
  if (!baslik) throw DogrulamaHatasi('Başlık zorunludur.', { alanlar: { baslik: ['Başlık girin.'] } });
  if (!govde.tarih) throw DogrulamaHatasi('Tarih zorunludur.', { alanlar: { tarih: ['Tarih seçin.'] } });
  const saat = /^\d{2}:\d{2}$/.test(govde.saat || '') ? govde.saat : '09:00';
  const [ss, dd] = saat.split(':').map(Number);
  const baslangic = gunBaslangici(govde.tarih) + (ss * 60 + dd) * 60_000;
  const santiye = govde.santiyeId
    ? tek('SELECT * FROM santiye WHERE id = ? AND tenant_id = ?', govde.santiyeId, ctx.tenant.id) : null;

  islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'toplanti');
    const id = kimlik('olay').replace('evt', 'mtg');
    calistir(`INSERT INTO toplanti (id, tenant_id, kod, baslik, tur, proje_id, santiye_id, baslangic,
                yer, gundem, katilimcilar, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?, 'planlandi', ?,?)`,
      id, ctx.tenant.id, kod, baslik, govde.tur || 'saha',
      govde.projeId || santiye?.proje_id || null, santiye?.id || null, baslangic,
      govde.yer || null, govde.gundem || null, govde.katilimcilar || null, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'toplanti', nesneId: id, eylem: 'olustur', sonraki: { kod, baslik, baslangic } });
  });
  return yonlendir(ctx, '/toplantilar?olusturuldu=1');
}

const toplantiAl = (ctx, id) => {
  const t = tek('SELECT * FROM toplanti WHERE id = ? AND tenant_id = ?', id, ctx.tenant.id);
  if (!t) throw Bulunamadi('Toplantı bulunamadı.');
  return t;
};

function tutanakKaydet(ctx, id, govde) {
  const t = toplantiAl(ctx, id);
  if (t.durum === 'kapali') throw GecisIzinsiz('Kapalı toplantının tutanağı değiştirilemez (kural 6).');
  const metin = String(govde.tutanak || '').trim();
  if (!metin) throw DogrulamaHatasi('Tutanak boş olamaz.', { alanlar: { tutanak: ['Tutanak metnini girin.'] } });
  /* Toplantı "yapıldı" işaretlenmesi tutanakla birlikte olur; kullanıcı durumu
     ayrı bir kutudan seçmez. Kapanış, tüm kararlar göreve bağlanınca yapılır. */
  const kararlar = sorgu('SELECT * FROM toplanti_karari WHERE toplanti_id = ?', t.id);
  const baglanmamis = kararlar.filter((k) => !k.gorev_id).length;
  const kapat = govde.kapat === '1';
  if (kapat && baglanmamis) {
    throw GecisIzinsiz(`${baglanmamis} karar henüz göreve bağlanmadı; toplantı kapatılamaz.`);
  }
  if (kapat && !kararlar.length) throw GecisIzinsiz('Karar kaydı olmayan toplantı kapatılamaz.');

  islem(() => {
    surumluGuncelle('toplanti', t.id, Number(govde.surum),
      { tutanak: metin, durum: kapat ? 'kapali' : 'yapildi',
        bitis: t.bitis ?? simdi() },
      { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'toplanti', nesneId: t.id, eylem: kapat ? 'tutanak_kapatildi' : 'tutanak_kaydedildi',
      onceki: { durum: t.durum }, sonraki: { durum: kapat ? 'kapali' : 'yapildi' } });
  });
  return kapat ? 'Tutanak kaydedildi ve toplantı kapatıldı' : 'Tutanak kaydedildi';
}

function kararEkle(ctx, id, govde) {
  const t = toplantiAl(ctx, id);
  if (t.durum === 'kapali') throw GecisIzinsiz('Kapalı toplantıya karar eklenemez.');
  const karar = String(govde.karar || '').trim();
  if (!karar) throw DogrulamaHatasi('Karar metni zorunludur.', { alanlar: { karar: ['Karar girin.'] } });
  islem(() => {
    const sira = Number(tek('SELECT COALESCE(MAX(sira),0) AS n FROM toplanti_karari WHERE toplanti_id = ?', t.id)?.n ?? 0) + 1;
    calistir(`INSERT INTO toplanti_karari (id, tenant_id, toplanti_id, sira, karar, sorumlu_id, termin, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?)`,
      kimlik('gorevAdim'), ctx.tenant.id, t.id, sira, karar, govde.sorumluId || null,
      govde.termin ? gunBaslangici(govde.termin) : null, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'toplanti', nesneId: t.id, eylem: 'karar_eklendi', sonraki: { sira, karar } });
  });
  return `${sira_metni(t.id)}. karar eklendi`;
}
const sira_metni = (toplantiId) => Number(tek(
  'SELECT COUNT(*) AS n FROM toplanti_karari WHERE toplanti_id = ?', toplantiId)?.n ?? 0);

/** §7: toplantı kararı serbest metin olarak kalmaz, gerçek göreve dönüşür. */
function karardanGorev(ctx, id, govde) {
  const t = toplantiAl(ctx, id);
  const k = tek('SELECT * FROM toplanti_karari WHERE id = ? AND toplanti_id = ?', govde.kararId, t.id);
  if (!k) throw Bulunamadi('Karar bulunamadı.');
  if (k.gorev_id) throw Cakisma('Bu karar zaten göreve bağlanmış.');
  const kayit = islem(() => {
    const g = kayitOlustur(ctx, { tablo: 'gorev', nesne: 'gorev', kodNesnesi: 'gorev',
      alanlar: { id: kimlik('gorev'), baslik: k.karar.slice(0, 180),
        aciklama: `${t.kod} toplantısının ${k.sira}. kararı.`,
        proje_id: t.proje_id, santiye_id: t.santiye_id,
        sorumlu_id: k.sorumlu_id, termin: k.termin, oncelik: 'normal', durum: 'taslak',
        kaynak_nesne: 'toplanti_karari', kaynak_id: k.id } });
    calistir('UPDATE toplanti_karari SET gorev_id = ? WHERE id = ?', g.id, k.id);
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'toplanti', nesneId: t.id, eylem: 'karar_goreve_donusturuldu',
      sonraki: { karar: k.sira, gorev: g.kod } });
    return g;
  });
  return `${kayit.kod} görevi açıldı`;
}

function toplantiDetayi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('TASK-09');
  yetkiZorunlu(ctx, e.yetki);
  const t = toplantiAl(ctx, id);
  const kararlar = sorgu(
    `SELECT k.*, g.kod AS gorev_kod, g.durum AS gorev_durum FROM toplanti_karari k
       LEFT JOIN gorev g ON g.id = k.gorev_id
      WHERE k.toplanti_id = ? ORDER BY k.sira`, t.id);
  const baglanmamis = kararlar.filter((k) => !k.gorev_id).length;

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.detayOzetSeridi({
    kod: t.kod, baslik: t.baslik,
    durum: { planlandi: 'taslak', yapildi: 'beklemede', tutanak_onayinda: 'incelemede',
      kapali: 'kapali', iptal: 'iptal' }[t.durum] || t.durum,
    surum: t.surum,
    isaretler: baglanmamis ? [{ metin: `${baglanmamis} karar göreve bağlanmadı`, ton: 'warn' }] : [],
    bilgiler: [
      { etiket: 'Tür', deger: TOPLANTI_TURLERI.find((x) => x.deger === t.tur)?.etiket || t.tur },
      { etiket: 'Tarih', deger: tarihSaat(t.baslangic) },
      { etiket: 'Yer', deger: t.yer || '—' },
      { etiket: 'Katılımcılar', deger: t.katilimcilar || '—' },
      { etiket: 'Karar', deger: sayi(kararlar.length) },
    ],
    birincilEylem: B.btn('Toplantı listesi', { rota: '/toplantilar' }),
  })}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Gündem</b></div></div>
      <div class="gc-body"><p style="font-size:13.5px;line-height:1.7">${t.gundem || '—'}</p></div>
    </div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Kararlar</b>
        <span>Karar serbest metin olarak kalmaz; göreve bağlanmadan toplantı kapanmaz (§7).</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: kararlar,
    bosDurum: { baslik: 'Karar yok', ikon: 'fa-gavel',
      aciklama: 'Kararsız toplantı kapatılamaz.' },
    sutunlar: [
      { ad: 'sira', etiket: '#', hizala: 'sag' },
      { ad: 'karar', etiket: 'Karar', govde: (r) => h`<b>${r.karar}</b>` },
      { ad: 'sorumlu_id', etiket: 'Sorumlu', govde: (r) => kullaniciAdi(r.sorumlu_id) },
      { ad: 'termin', etiket: 'Termin', govde: (r) => (r.termin ? tarih(r.termin) : '—') },
      { ad: 'gorev', etiket: 'Görev', govde: (r) => (r.gorev_id
        ? h`<a href="/gorevler/${r.gorev_id}">${r.gorev_kod}</a><br><span class="muted">${r.gorev_durum}</span>`
        : (yetkiVar(ctx, 'TASK-09:guncelle') && t.durum !== 'kapali'
          ? h`<form method="post" action="/toplantilar/${t.id}" style="display:inline">
              ${ham(csrfAlani(ctx))}
              <input type="hidden" name="_eylem" value="gorev">
              <input type="hidden" name="kararId" value="${r.id}">
              <button class="btn btn-ghost btn-sm" type="submit">Göreve dönüştür</button></form>`
          : B.isaret('bağlanmadı', 'warn'))) },
    ],
  })}</div>
    </div>
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Tutanak</b>
        <span>${t.durum === 'kapali' ? 'Toplantı kapandı; tutanak değiştirilemez (kural 6).'
    : 'Tutanak kaydedildiğinde toplantı "yapıldı" sayılır.'}</span></div></div>
      <div class="gc-body">
        ${t.durum === 'kapali' || !yetkiVar(ctx, 'TASK-09:guncelle')
    ? h`<p style="font-size:13.5px;line-height:1.7;white-space:pre-wrap">${t.tutanak || '—'}</p>`
    : h`<form method="post" action="/toplantilar/${t.id}" data-gform="1">
        ${ham(csrfAlani(ctx))}
        <input type="hidden" name="_eylem" value="tutanak">
        <input type="hidden" name="surum" value="${t.surum}">
        ${B.alan({ ad: 'tutanak', etiket: 'Tutanak metni', tur: 'metin', genis: true, zorunlu: true,
      deger: t.tutanak || '' })}
        ${B.alan({ ad: 'kapat', etiket: 'Toplantıyı kapat', deger: '0',
      secenekler: [{ deger: '0', etiket: 'Hayır — kararlar açık kalsın' },
        { deger: '1', etiket: 'Evet — tüm kararlar göreve bağlandı' }] })}
        <div style="margin-top:12px">${B.btn('Tutanağı kaydet', { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' })}</div>
      </form>`}
      </div>
    </div>
  </div>
  <div class="gv-side-stack">
    ${yetkiVar(ctx, 'TASK-09:guncelle') && t.durum !== 'kapali' ? B.form({
    rota: `/toplantilar/${t.id}`, csrf: csrfAlani(ctx),
    bolumler: [{ baslik: 'Karar ekle', alanlar: h`
      ${ham('<input type="hidden" name="_eylem" value="karar">')}
      ${B.alan({ ad: 'karar', etiket: 'Karar', tur: 'metin', zorunlu: true, genis: true })}
      ${B.alan({ ad: 'sorumluId', etiket: 'Sorumlu',
      secenekler: [{ deger: '', etiket: 'Seçin…' }, ...kullaniciSecenekleri(ctx)] })}
      ${B.alan({ ad: 'termin', etiket: 'Termin', tur: 'date' })}` }],
    eylemler: B.btn('Kararı ekle', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}
    ${gecmisKarti('toplanti', t)}
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: t.kod, baslik: t.baslik }));
}
