/* ============================================================================
   KALİTE ROTALARI — QLT-01..04, QLT-08..14
   ----------------------------------------------------------------------------
   RFI yanıtı kapsam etkiliyorsa değişiklik talebi ve iş programı bağı kurulur
   (doküman §7 zorunlu hedef bağlantı tablosu). Muayene "uygun değil" sonucu
   otomatik NCR açar — saha bildirimi → kalite zinciri budur.
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, gunAnahtari, gunBaslangici, GUN_MS } from '../cekirdek/zaman.mjs';
import { DogrulamaHatasi, GecisIzinsiz } from '../cekirdek/hata.mjs';
import { bildir } from '../moduller/isakisi/bildirim.mjs';
import { kayitModulu, kullaniciSecenekleri, santiyeSecenekleri, projeSecenekleri,
  sozlukSecenekleri, sayac, gecmisKarti } from './kayit-modulu.mjs';
import {
  ekranNesnesi, kullaniciAdi, ciz, B, h, ham, sayi, csrfAlani, csrfZorunlu,
  yetkiZorunlu, yetkiVar, sorgu, tek, calistir, islem, surumluGuncelle, audit, sonrakiKod,
} from './ortak.mjs';

/** Bir RFI'den açılmış değişiklik talebi sayısı (§7 kaynak→hedef bağı, CNT-10). */
const acikDegisiklik = (rfiId) => Number(tek(
  `SELECT COUNT(*) AS n FROM degisiklik WHERE kaynak_nesne = 'rfi' AND kaynak_id = ?`, rfiId)?.n ?? 0);

const DISIPLINLER = [
  { deger: 'mimari', etiket: 'Mimari' }, { deger: 'statik', etiket: 'Statik' },
  { deger: 'mekanik', etiket: 'Mekanik' }, { deger: 'elektrik', etiket: 'Elektrik' },
  { deger: 'altyapi', etiket: 'Altyapı' }, { deger: 'peyzaj', etiket: 'Peyzaj' },
];
const NOKTA_TIPLERI = [
  { deger: 'H', etiket: 'H — Hold (durdurma noktası)' },
  { deger: 'W', etiket: 'W — Witness (şahitlik)' },
  { deger: 'R', etiket: 'R — Review (belge incelemesi)' },
  { deger: 'S', etiket: 'S — Surveillance (gözetim)' },
];
const KARAR_KODLARI = [
  { deger: 'A', etiket: 'A — Onaylandı' },
  { deger: 'B', etiket: 'B — Notlarla onaylandı' },
  { deger: 'C', etiket: 'C — Revize edilip yeniden gönderilecek' },
  { deger: 'D', etiket: 'D — Reddedildi' },
];

export function kur(y, ekranRota) {
  /* ================= QLT-01 Kalite paneli ============================== */
  ekranRota(y, 'QLT-01', {
    get: (ctx) => {
      const e = ekranNesnesi('QLT-01');
      yetkiZorunlu(ctx, e.yetki);
      const t = ctx.tenant.id;
      const acik = (tablo) => sayac(t, tablo, `durum NOT IN ('kapali','iptal')`);
      const rfiGecikmis = sayac(t, 'rfi', `sla_bitis < ? AND durum NOT IN ('kapali','iptal')`, simdi());
      const ncrYaslandirma = sorgu(
        `SELECT kod, baslik, olusturuldu FROM ncr WHERE tenant_id = ? AND durum NOT IN ('kapali','iptal')
          ORDER BY olusturuldu ASC LIMIT 5`, t);
      const bekleyenMuayene = sorgu(
        `SELECT kod, baslik, nokta_tipi, talep_tarihi FROM muayene WHERE tenant_id = ?
           AND durum NOT IN ('kapali','iptal') ORDER BY talep_tarihi ASC LIMIT 5`, t);

      const icerik = h`
${B.kpiSeridi([
        { etiket: 'Açık NCR', deger: sayi(acik('ncr')), ikon: 'fa-clipboard-check', ton: acik('ncr') ? 'warn' : '' },
        { etiket: 'Bekleyen muayene', deger: sayi(acik('muayene')), ikon: 'fa-magnifying-glass' },
        { etiket: 'Açık RFI', deger: sayi(acik('rfi')), ikon: 'fa-circle-question',
          alt: rfiGecikmis ? `${rfiGecikmis} tanesi süresi aştı` : null, ton: rfiGecikmis ? 'danger' : '' },
        { etiket: 'Açık punch', deger: sayi(acik('punch')), ikon: 'fa-list-check' },
        { etiket: 'Bekleyen submittal', deger: sayi(acik('submittal')), ikon: 'fa-paper-plane' },
        { etiket: 'Uygunsuz test', deger: sayi(sayac(t, 'test_sonucu', `sonuc = 'uygun_degil'`)), ikon: 'fa-flask', ton: 'danger' },
      ])}
<div class="dash-cols">
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>En eski açık uygunsuzluklar</b>
      <span>Yaşlandırma, kalite borcunun en güvenilir göstergesidir.</span></div>
      ${B.btn('Tümü', { rota: '/kalite/ncr', kucuk: true })}</div>
    <div class="gc-body flush">${B.tablo({
        satirlar: ncrYaslandirma,
        bosDurum: { baslik: 'Açık uygunsuzluk yok', ikon: 'fa-circle-check' },
        sutunlar: [
          { ad: 'kod', etiket: 'Kod' },
          { ad: 'baslik', etiket: 'Uygunsuzluk' },
          { ad: 'yas', etiket: 'Yaş', hizala: 'sag', govde: (r) => {
            const g = Math.floor((simdi() - r.olusturuldu) / GUN_MS);
            return B.isaret(`${g} gün`, g > 30 ? 'danger' : g > 14 ? 'warn' : 'nötr');
          } },
        ],
      })}</div>
  </div>
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>Bekleyen muayene talepleri</b>
      <span>Hold noktası kapanmadan imalat ilerleyemez.</span></div>
      ${B.btn('Tümü', { rota: '/kalite/muayeneler', kucuk: true })}</div>
    <div class="gc-body flush">${B.tablo({
        satirlar: bekleyenMuayene,
        bosDurum: { baslik: 'Bekleyen muayene yok', ikon: 'fa-circle-check' },
        sutunlar: [
          { ad: 'kod', etiket: 'Kod' },
          { ad: 'baslik', etiket: 'Muayene' },
          { ad: 'nokta_tipi', etiket: 'Tip', govde: (r) => B.isaret(r.nokta_tipi, r.nokta_tipi === 'H' ? 'danger' : 'info') },
          { ad: 'talep_tarihi', etiket: 'Talep', govde: (r) => tarih(r.talep_tarihi) },
        ],
      })}</div>
  </div>
</div>
${B.veriTarihi(simdi())}`;
      return html(ctx, 200, ciz(ctx, e, icerik));
    },
  });

  /* ================= QLT-02 / QLT-03 ITP =============================== */
  kayitModulu(y, ekranRota, {
    nesne: 'itp', tablo: 'itp', kodNesnesi: 'itp', kimlikTuru: 'itp',
    rota: '/kalite/itp', formRotasi: '/kalite/itp/yeni',
    baslik: 'ITP', yeniEtiketi: 'Yeni ITP',
    listeKodu: 'QLT-02', formKodu: 'QLT-03', detayKodu: null,
    gecisNesnesi: 'onayliKayit',
    aramaAlanlari: ['ad', 'kod'], aramaYer: 'ITP adı veya kodu…',
    filtreler: [
      { ad: 'disiplin', etiket: 'Disiplin', secenekler: DISIPLINLER },
      { ad: 'durum', etiket: 'Durum', secenekler: ['taslak', 'onaya_gonderildi', 'onaylandi'].map((d) => ({ deger: d, etiket: d })) },
    ],
    alanlar: [
      { ad: 'ad', sutun: 'ad', etiket: 'ITP adı', tur: 'metin', zorunlu: true, genis: true, enFazla: 200 },
      { ad: 'disiplin', sutun: 'disiplin', etiket: 'Disiplin', tur: 'secim', secenekler: DISIPLINLER },
      { ad: 'projeId', sutun: 'proje_id', etiket: 'Proje', tur: 'secim', secenekler: projeSecenekleri },
      { ad: 'santiyeId', sutun: 'santiye_id', etiket: 'Şantiye', tur: 'secim', secenekler: santiyeSecenekleri },
      { ad: 'kapsam', sutun: 'kapsam', etiket: 'Kapsam', tur: 'uzunMetin', genis: true },
    ],
    kpi: (ctx, toplam) => [
      { etiket: 'ITP', deger: sayi(sayac(ctx.tenant.id, 'itp')), ikon: 'fa-clipboard-list' },
      { etiket: 'Onaylı', deger: sayi(sayac(ctx.tenant.id, 'itp', `durum = 'onaylandi'`)), ikon: 'fa-circle-check' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ],
    listeSutunlari: () => [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'ad', etiket: 'ITP', govde: (r) => h`<a href="/kalite/itp/${r.id}"><b>${r.ad}</b></a>` },
      { ad: 'disiplin', etiket: 'Disiplin', govde: (r) => r.disiplin || '—' },
      { ad: 'nokta', etiket: 'Kontrol noktası', hizala: 'sag',
        govde: (r) => sayi(Number(tek('SELECT COUNT(*) AS n FROM itp_nokta WHERE itp_id = ?', r.id)?.n ?? 0)) },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
    ],
    bosDurum: { baslik: 'ITP yok', aciklama: 'Muayene ve test planı, kontrol noktalarını ve kanıt türünü tanımlar.', ikon: 'fa-clipboard-list' },
  });

  /* ITP detayı QLT-02 rotası altında (katalogda ayrı detay ekranı yok):
     kontrol noktaları burada yönetilir. */
  y.get('/kalite/itp/:id', (ctx, _g, params) => itpDetayi(ctx, params.id), { ekran: ekranNesnesi('QLT-02') });
  y.post('/kalite/itp/:id', (ctx, govde, params) => {
    yetkiZorunlu(ctx, 'QLT-03:guncelle');
    csrfZorunlu(ctx, govde);
    const itp = tek('SELECT * FROM itp WHERE id = ? AND tenant_id = ?', params.id, ctx.tenant.id);
    if (!itp) throw DogrulamaHatasi('ITP bulunamadı.');
    if (itp.durum === 'onaylandi') throw GecisIzinsiz('Onaylı ITP değiştirilemez; revizyon açılmalıdır (§5.4).');
    const ad = String(govde.noktaAdi || '').trim();
    if (!ad) throw DogrulamaHatasi('Kontrol noktası adı zorunludur.', { alanlar: { noktaAdi: ['Ad girin.'] } });
    const sira = Number(tek('SELECT COALESCE(MAX(sira),0) + 1 AS s FROM itp_nokta WHERE itp_id = ?', itp.id).s);
    islem(() => {
      calistir(`INSERT INTO itp_nokta (id, itp_id, sira, ad, nokta_tipi, kriter, referans, sorumlu_rol, kanit_turu)
                VALUES (?,?,?,?,?,?,?,?,?)`,
        kimlik('itp'), itp.id, sira, ad, govde.noktaTipi || 'R', govde.kriter || null,
        govde.referans || null, govde.sorumluRol || null, govde.kanitTuru || null);
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'itp', nesneId: itp.id, eylem: 'kontrol_noktasi_eklendi', sonraki: { sira, ad, tip: govde.noktaTipi } });
    });
    return yonlendir(ctx, `/kalite/itp/${itp.id}?nokta=1`);
  }, { ekran: ekranNesnesi('QLT-02') });

  /* ================= QLT-04 Muayene talepleri ========================== */
  kayitModulu(y, ekranRota, {
    nesne: 'muayene', tablo: 'muayene', kodNesnesi: 'muayene', kimlikTuru: 'muayene',
    rota: '/kalite/muayeneler', formRotasi: '/kalite/muayeneler?yeni=1',
    baslik: 'Muayene talebi', yeniEtiketi: 'Yeni muayene talebi',
    listeKodu: 'QLT-04', formKodu: null, detayKodu: null,
    gecisNesnesi: 'sahaBildirimi',
    aramaAlanlari: ['baslik', 'kod'], aramaYer: 'Muayene başlığı veya kodu…',
    filtreler: [
      { ad: 'nokta_tipi', etiket: 'Nokta tipi', secenekler: NOKTA_TIPLERI },
      { ad: 'sonuc', etiket: 'Sonuç', secenekler: [
        { deger: 'uygun', etiket: 'Uygun' }, { deger: 'uygun_degil', etiket: 'Uygun değil' },
        { deger: 'sartli', etiket: 'Şartlı' }] },
    ],
    alanlar: [],
    kpi: (ctx, toplam) => [
      { etiket: 'Bekleyen', deger: sayi(sayac(ctx.tenant.id, 'muayene', `durum NOT IN ('kapali','iptal')`)), ikon: 'fa-hourglass-half' },
      { etiket: 'Hold noktası', deger: sayi(sayac(ctx.tenant.id, 'muayene', `nokta_tipi = 'H' AND durum NOT IN ('kapali','iptal')`)), ikon: 'fa-hand', ton: 'danger' },
      { etiket: 'Uygun değil', deger: sayi(sayac(ctx.tenant.id, 'muayene', `sonuc = 'uygun_degil'`)), ikon: 'fa-circle-xmark' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ],
    listeSutunlari: () => [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'baslik', etiket: 'Muayene', govde: (r) => h`<a href="/kalite/muayeneler/${r.id}"><b>${r.baslik}</b></a>${
        r.mahal ? h`<br><span class="muted">${r.mahal}</span>` : ''}` },
      { ad: 'nokta_tipi', etiket: 'Tip', govde: (r) => B.isaret(r.nokta_tipi, r.nokta_tipi === 'H' ? 'danger' : 'info') },
      { ad: 'talep_tarihi', etiket: 'Talep', govde: (r) => tarih(r.talep_tarihi) },
      { ad: 'sonuc', etiket: 'Sonuç', govde: (r) => !r.sonuc ? B.rozet('beklemede', 'Bekliyor')
        : r.sonuc === 'uygun' ? B.rozet('onaylandi', 'Uygun')
        : r.sonuc === 'sartli' ? B.rozet('beklemede', 'Şartlı') : B.rozet('reddedildi', 'Uygun değil') },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
    ],
    bosDurum: { baslik: 'Muayene talebi yok', aciklama: 'Hold/witness noktaları için muayene talebi açılır.', ikon: 'fa-magnifying-glass' },
    altForm: (ctx) => B.form({
      rota: '/kalite/muayeneler', csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Yeni muayene talebi',
        aciklama: 'Hold noktası kapanmadan ilgili imalat ilerleyemez.', alanlar: h`
        ${B.alan({ ad: 'baslik', etiket: 'Muayene konusu', zorunlu: true, genis: true })}
        ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye', secenekler: [{ deger: '', etiket: 'Seçin…' }, ...santiyeSecenekleri(ctx)] })}
        ${B.alan({ ad: 'itpId', etiket: 'ITP', secenekler: [{ deger: '', etiket: 'Seçin…' },
          ...sorgu('SELECT id, kod, ad FROM itp WHERE tenant_id = ? ORDER BY kod', ctx.tenant.id)
            .map((i) => ({ deger: i.id, etiket: `${i.kod} — ${i.ad}` }))] })}
        ${B.alan({ ad: 'noktaTipi', etiket: 'Nokta tipi', deger: 'R', secenekler: NOKTA_TIPLERI })}
        ${B.alan({ ad: 'mahal', etiket: 'Mahal' })}
        ${B.alan({ ad: 'talepTarihi', etiket: 'Talep tarihi', tur: 'date', deger: gunAnahtari(simdi()) })}
        ${B.alan({ ad: 'sorumluId', etiket: 'Sorumlu', secenekler: [{ deger: '', etiket: 'Seçin…' }, ...kullaniciSecenekleri(ctx)] })}` }],
      eylemler: B.btn('Talebi aç', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
    }),
  });

  /* Muayene oluşturma ve sonuçlandırma aynı liste rotası üzerinden (katalogda
     "Liste/Form" tipinde tek ekran). */
  y.post('/kalite/muayeneler', (ctx, govde) => {
    yetkiZorunlu(ctx, 'QLT-04:olustur');
    csrfZorunlu(ctx, govde);
    if (govde._eylem === 'sonuc') return muayeneSonuclandir(ctx, govde);
    const baslik = String(govde.baslik || '').trim();
    if (!baslik) throw DogrulamaHatasi('Başlık zorunludur.', { alanlar: { baslik: ['Başlık girin.'] } });
    const santiye = govde.santiyeId ? tek('SELECT * FROM santiye WHERE id = ? AND tenant_id = ?', govde.santiyeId, ctx.tenant.id) : null;
    islem(() => {
      const kod = sonrakiKod(ctx.tenant.id, 'muayene');
      const id = kimlik('muayene');
      calistir(`INSERT INTO muayene (id, tenant_id, itp_id, itp_nokta_id, santiye_id, proje_id, kod, baslik,
                  mahal, talep_tarihi, nokta_tipi, sorumlu_id, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'yeni', ?,?)`,
        id, ctx.tenant.id, govde.itpId || null, govde.itpNoktaId || null,
        santiye?.id || null, santiye?.proje_id || null, kod, baslik, govde.mahal || null,
        govde.talepTarihi ? gunBaslangici(govde.talepTarihi) : simdi(),
        govde.noktaTipi || 'R', govde.sorumluId || null, ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'muayene', nesneId: id, eylem: 'olustur', sonraki: { kod, baslik, noktaTipi: govde.noktaTipi } });
    });
    return yonlendir(ctx, '/kalite/muayeneler?olusturuldu=1');
  }, { ekran: ekranNesnesi('QLT-04') });

  y.get('/kalite/muayeneler/:id', (ctx, _g, params) => muayeneDetayi(ctx, params.id), { ekran: ekranNesnesi('QLT-04') });
  y.post('/kalite/muayeneler/:id', (ctx, govde, params) => {
    yetkiZorunlu(ctx, 'QLT-04:guncelle');
    csrfZorunlu(ctx, govde);
    return muayeneSonuclandir(ctx, { ...govde, id: params.id });
  }, { ekran: ekranNesnesi('QLT-04') });

  /* ================= QLT-08 / QLT-09 Submittal ve malzeme onayı ======== */
  kayitModulu(y, ekranRota, {
    nesne: 'submittal', tablo: 'submittal', kodNesnesi: 'submittal', kimlikTuru: 'submittal',
    rota: '/teknik/submittal', formRotasi: '/teknik/submittal?yeni=1',
    baslik: 'Submittal', listeKodu: 'QLT-09', detayKodu: null,
    gecisNesnesi: 'onayliKayit',
    aramaAlanlari: ['baslik', 'kod'], aramaYer: 'Submittal başlığı veya kodu…',
    filtreler: [
      { ad: 'tur', etiket: 'Tür', secenekler: [
        { deger: 'submittal', etiket: 'Submittal' }, { deger: 'malzeme_onayi', etiket: 'Malzeme onayı' },
        { deger: 'numune', etiket: 'Numune' }, { deger: 'katalog', etiket: 'Katalog' }] },
      { ad: 'karar_kodu', etiket: 'Karar', secenekler: KARAR_KODLARI },
    ],
    alanlar: [],
    kpi: (ctx, toplam) => [
      { etiket: 'Bekleyen', deger: sayi(sayac(ctx.tenant.id, 'submittal', 'karar_kodu IS NULL')), ikon: 'fa-hourglass-half' },
      { etiket: 'Onaylı (A/B)', deger: sayi(sayac(ctx.tenant.id, 'submittal', `karar_kodu IN ('A','B')`)), ikon: 'fa-circle-check' },
      { etiket: 'Revize (C)', deger: sayi(sayac(ctx.tenant.id, 'submittal', `karar_kodu = 'C'`)), ikon: 'fa-rotate-left', ton: 'warn' },
      { etiket: 'Reddedilen (D)', deger: sayi(sayac(ctx.tenant.id, 'submittal', `karar_kodu = 'D'`)), ikon: 'fa-circle-xmark', ton: 'danger' },
    ],
    listeSutunlari: () => [
      { ad: 'kod', etiket: 'Kod', govde: (r) => h`${r.kod}<br><span class="muted">sürüm ${r.surum_no}</span>` },
      { ad: 'baslik', etiket: 'Konu', govde: (r) => h`<a href="/teknik/submittal/${r.id}"><b>${r.baslik}</b></a>${
        r.tedarikci ? h`<br><span class="muted">${r.tedarikci}</span>` : ''}` },
      { ad: 'tur', etiket: 'Tür' },
      { ad: 'hedef_tarih', etiket: 'Hedef', govde: (r) => !r.hedef_tarih ? '—'
        : r.hedef_tarih < simdi() && !r.karar_kodu ? B.isaret(tarih(r.hedef_tarih), 'danger') : tarih(r.hedef_tarih) },
      { ad: 'karar_kodu', etiket: 'Karar kodu', govde: (r) => !r.karar_kodu ? B.rozet('beklemede', 'Bekliyor')
        : B.isaret(r.karar_kodu, r.karar_kodu === 'D' ? 'danger' : r.karar_kodu === 'C' ? 'warn' : 'ok') },
    ],
    bosDurum: { baslik: 'Submittal kaydı yok', aciklama: 'Paket, sürüm, gönderim ve müşavir karar kodu burada izlenir.', ikon: 'fa-paper-plane' },
    altForm: (ctx) => B.form({
      rota: '/teknik/submittal', csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Yeni submittal / malzeme onayı', alanlar: h`
        ${B.alan({ ad: 'baslik', etiket: 'Konu', zorunlu: true, genis: true })}
        ${B.alan({ ad: 'tur', etiket: 'Tür', deger: 'submittal', secenekler: [
          { deger: 'submittal', etiket: 'Submittal' }, { deger: 'malzeme_onayi', etiket: 'Malzeme onayı' },
          { deger: 'numune', etiket: 'Numune' }, { deger: 'katalog', etiket: 'Katalog' }] })}
        ${B.alan({ ad: 'disiplin', etiket: 'Disiplin', secenekler: [{ deger: '', etiket: 'Seçin…' }, ...DISIPLINLER] })}
        ${B.alan({ ad: 'tedarikci', etiket: 'Tedarikçi' })}
        ${B.alan({ ad: 'paket', etiket: 'Paket' })}
        ${B.alan({ ad: 'projeId', etiket: 'Proje', secenekler: [{ deger: '', etiket: 'Seçin…' }, ...projeSecenekleri(ctx)] })}
        ${B.alan({ ad: 'hedefTarih', etiket: 'Hedef karar tarihi', tur: 'date' })}` }],
      eylemler: B.btn('Kaydı aç', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
    }),
  });

  y.post('/teknik/submittal', (ctx, govde) => {
    yetkiZorunlu(ctx, 'QLT-09:olustur');
    csrfZorunlu(ctx, govde);
    if (govde._eylem === 'karar') return submittalKarar(ctx, govde);
    const baslik = String(govde.baslik || '').trim();
    if (!baslik) throw DogrulamaHatasi('Başlık zorunludur.', { alanlar: { baslik: ['Başlık girin.'] } });
    islem(() => {
      const kod = sonrakiKod(ctx.tenant.id, 'submittal');
      const id = kimlik('submittal');
      calistir(`INSERT INTO submittal (id, tenant_id, proje_id, santiye_id, kod, tur, baslik, disiplin,
                  tedarikci, paket, surum_no, gonderim_tarihi, hedef_tarih, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?, 'taslak', ?,?)`,
        id, ctx.tenant.id, govde.projeId || null, govde.santiyeId || null, kod,
        govde.tur || 'submittal', baslik, govde.disiplin || null, govde.tedarikci || null,
        govde.paket || null, simdi(), govde.hedefTarih ? gunBaslangici(govde.hedefTarih) : null,
        ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'submittal', nesneId: id, eylem: 'olustur', sonraki: { kod, baslik, tur: govde.tur } });
    });
    return yonlendir(ctx, '/teknik/submittal?olusturuldu=1');
  }, { ekran: ekranNesnesi('QLT-09') });

  y.get('/teknik/submittal/:id', (ctx, _g, params) => submittalDetayi(ctx, params.id), { ekran: ekranNesnesi('QLT-09') });
  y.post('/teknik/submittal/:id', (ctx, govde, params) => {
    yetkiZorunlu(ctx, 'QLT-09:guncelle');
    csrfZorunlu(ctx, govde);
    return submittalKarar(ctx, { ...govde, id: params.id });
  }, { ekran: ekranNesnesi('QLT-09') });

  /* QLT-08 malzeme onayları — aynı kanonik tabloya filtrelenmiş görünüm
     (kural 4: ikinci bir uygulama YOK). */
  ekranRota(y, 'QLT-08', {
    get: (ctx) => yonlendir(ctx, '/teknik/submittal?tur=malzeme_onayi'),
  });

  /* ================= QLT-10..12 RFI ==================================== */
  kayitModulu(y, ekranRota, {
    nesne: 'rfi', tablo: 'rfi', kodNesnesi: 'rfi', kimlikTuru: 'rfi',
    rota: '/teknik/rfi', formRotasi: '/teknik/rfi/yeni',
    baslik: 'RFI', yeniEtiketi: 'Yeni RFI',
    listeKodu: 'QLT-10', formKodu: 'QLT-11', detayKodu: 'QLT-12',
    gecisNesnesi: 'sahaBildirimi',
    baslikAlani: 'baslik',
    aramaAlanlari: ['baslik', 'kod', 'soru'], aramaYer: 'RFI başlığı, kodu veya sorusu…',
    filtreler: [
      { ad: 'disiplin', etiket: 'Disiplin', secenekler: DISIPLINLER },
      { ad: 'durum', etiket: 'Durum', secenekler: ['yeni', 'atandi', 'islemde', 'kapali'].map((d) => ({ deger: d, etiket: d })) },
    ],
    alanlar: [
      { ad: 'baslik', sutun: 'baslik', etiket: 'Başlık', tur: 'metin', zorunlu: true, genis: true, enFazla: 200 },
      { ad: 'soru', sutun: 'soru', etiket: 'Soru', tur: 'uzunMetin', zorunlu: true, genis: true,
        grup: 'Teknik bilgi talebi' },
      { ad: 'disiplin', sutun: 'disiplin', etiket: 'Disiplin', tur: 'secim', secenekler: DISIPLINLER, grup: 'Teknik bilgi talebi' },
      { ad: 'cizimReferansi', sutun: 'cizim_referansi', etiket: 'Çizim/konum referansı', tur: 'metin',
        grup: 'Teknik bilgi talebi', ipucu: 'Örn. MP-201 rev.C, aks 4-5' },
      { ad: 'projeId', sutun: 'proje_id', etiket: 'Proje', tur: 'secim', secenekler: projeSecenekleri, grup: 'Bağlam' },
      { ad: 'santiyeId', sutun: 'santiye_id', etiket: 'Şantiye', tur: 'secim', secenekler: santiyeSecenekleri, grup: 'Bağlam' },
      { ad: 'gerekliTarih', sutun: 'gerekli_tarih', etiket: 'Yanıt gerekli tarih', tur: 'tarih', grup: 'Etki ve süre',
        ipucu: 'Bu tarih SLA hesabına girer.' },
      { ad: 'etkiKapsam', sutun: 'etki_kapsam', etiket: 'Kapsamı etkiliyor', tur: 'secim', grup: 'Etki ve süre',
        varsayilan: '0', zorunlu: true, secenekler: [{ deger: '0', etiket: 'Hayır' }, { deger: '1', etiket: 'Evet' }] },
      { ad: 'etkiSure', sutun: 'etki_sure', etiket: 'Süreyi etkiliyor', tur: 'secim', grup: 'Etki ve süre',
        varsayilan: '0', zorunlu: true, secenekler: [{ deger: '0', etiket: 'Hayır' }, { deger: '1', etiket: 'Evet' }] },
      { ad: 'etkiMaliyet', sutun: 'etki_maliyet', etiket: 'Maliyeti etkiliyor', tur: 'secim', grup: 'Etki ve süre',
        varsayilan: '0', zorunlu: true, secenekler: [{ deger: '0', etiket: 'Hayır' }, { deger: '1', etiket: 'Evet' }] },
    ],
    grupAciklamalari: {
      'Etki ve süre': 'Kapsam/süre/maliyet etkisi işaretlenirse yanıt sonrası değişiklik talebi önerilir (§7).',
    },
    sabitAlanlar: (ctx, govde) => ({
      /* SLA gerekli tarihten türer; kullanıcı SLA girmez (K-031 ilkesi). */
      sla_bitis: govde.gerekliTarih ? gunBaslangici(govde.gerekliTarih) : simdi() + 7 * GUN_MS,
      durum: 'yeni',
    }),
    kpi: (ctx, toplam) => [
      { etiket: 'Açık RFI', deger: sayi(sayac(ctx.tenant.id, 'rfi', `durum NOT IN ('kapali','iptal')`)), ikon: 'fa-circle-question' },
      { etiket: 'Süresi aşan', deger: sayi(sayac(ctx.tenant.id, 'rfi', `sla_bitis < ? AND durum NOT IN ('kapali','iptal')`, simdi())), ikon: 'fa-hourglass-end', ton: 'danger' },
      { etiket: 'Kapsam etkili', deger: sayi(sayac(ctx.tenant.id, 'rfi', 'etki_kapsam = 1')), ikon: 'fa-diagram-project', ton: 'warn' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ],
    listeSutunlari: () => [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'baslik', etiket: 'RFI', govde: (r) => h`<a href="/teknik/rfi/${r.id}"><b>${r.baslik}</b></a>${
        r.cizim_referansi ? h`<br><span class="muted">${r.cizim_referansi}</span>` : ''}` },
      { ad: 'disiplin', etiket: 'Disiplin', govde: (r) => r.disiplin || '—' },
      { ad: 'etki', etiket: 'Etki', govde: (r) => {
        const p = [];
        if (r.etki_kapsam) p.push(B.isaret('kapsam', 'warn'));
        if (r.etki_sure) p.push(B.isaret('süre', 'warn'));
        if (r.etki_maliyet) p.push(B.isaret('maliyet', 'danger'));
        return p.length ? h`${p}` : '—';
      } },
      { ad: 'sla_bitis', etiket: 'SLA', govde: (r) => !r.sla_bitis ? '—'
        : r.sla_bitis < simdi() && !['kapali', 'iptal'].includes(r.durum) ? B.isaret('aşıldı', 'danger') : tarih(r.sla_bitis) },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
    ],
    bosDurum: { baslik: 'RFI yok', aciklama: 'Teknik bilgi talepleri ve yanıt süreleri burada izlenir.', ikon: 'fa-circle-question' },
    detayBilgileri: (r) => [
      { etiket: 'Disiplin', deger: r.disiplin || '—' },
      { etiket: 'Çizim referansı', deger: r.cizim_referansi || '—' },
      { etiket: 'Gerekli tarih', deger: r.gerekli_tarih ? tarih(r.gerekli_tarih) : '—' },
      { etiket: 'SLA', deger: r.sla_bitis ? tarih(r.sla_bitis) : '—' },
      { etiket: 'Etki', deger: [r.etki_kapsam && 'kapsam', r.etki_sure && 'süre', r.etki_maliyet && 'maliyet']
        .filter(Boolean).join(', ') || 'yok' },
      { etiket: 'Yanıtlayan', deger: r.yanitlayan ? kullaniciAdi(r.yanitlayan) : '—' },
    ],
    detayEkleri: (ctx, r) => h`
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Soru</b></div></div>
  <div class="gc-body"><p style="font-size:13.5px;line-height:1.7">${r.soru}</p></div>
</div>
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Yanıt</b>
    <span>Yanıt kapsamı etkiliyorsa değişiklik talebi ve iş programı bağı kurulur (§7).</span></div></div>
  <div class="gc-body">
    ${r.yanit ? h`<p style="font-size:13.5px;line-height:1.7">${r.yanit}</p>
      <p class="gf-hint" style="margin-top:10px">${kullaniciAdi(r.yanitlayan)} · ${tarih(r.yanit_tarihi)}</p>
      ${r.degisiklik_tetikledi ? h`${B.sonucSeridi({ tur: 'warn', baslik: 'Değişiklik talebi tetiklendi',
        aciklama: acikDegisiklik(r.id)
          ? `Bu RFI'den ${acikDegisiklik(r.id)} değişiklik talebi açılmış (CNT-10).`
          : 'Yanıt kapsam/süre/maliyet etkisi taşıyor; kaynağı bu RFI olan bir değişiklik talebi açın.' })}
        <div style="margin-top:10px">${B.btn(acikDegisiklik(r.id) ? 'Değişiklik taleplerini gör' : 'Değişiklik talebi aç',
          { rota: acikDegisiklik(r.id) ? '/degisiklikler' : `/degisiklikler/yeni?rfiId=${r.id}`, kucuk: true })}</div>` : ''}`
      : yetkiVar(ctx, 'QLT-12:guncelle') ? h`<form method="post" action="/teknik/rfi/${r.id}" data-gform="1">
          ${ham(csrfAlani(ctx))}
          <input type="hidden" name="_eylem" value="yanitla">
          <input type="hidden" name="surum" value="${r.surum}">
          ${B.alan({ ad: 'yanit', etiket: 'Yanıt', tur: 'metin', zorunlu: true, genis: true })}
          <div style="margin-top:12px">${B.btn('Yanıtı kaydet', { tur: 'acc', gonder: true, ikon: 'fa-reply' })}</div>
        </form>`
      : h`<p class="muted">Henüz yanıtlanmadı.</p>`}
  </div>
</div>
${gecmisKarti('rfi', r)}`,
    detayIslemleri: {
      yanitla: (ctx, r, govde) => {
        const yanit = String(govde.yanit || '').trim();
        if (!yanit) throw DogrulamaHatasi('Yanıt boş olamaz.', { alanlar: { yanit: ['Yanıt girin.'] } });
        if (r.yanit) throw GecisIzinsiz('Bu RFI zaten yanıtlanmış; düzeltme yeni RFI ile yapılır.');
        const degisiklik = r.etki_kapsam || r.etki_sure || r.etki_maliyet ? 1 : 0;
        islem(() => {
          surumluGuncelle('rfi', r.id, Number(govde.surum),
            { yanit, yanit_tarihi: simdi(), yanitlayan: ctx.kullanici.id, degisiklik_tetikledi: degisiklik },
            { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
          audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
            nesne: 'rfi', nesneId: r.id, eylem: 'yanitlandi',
            sonraki: { degisiklikTetikledi: !!degisiklik } });
          if (r.olusturan !== ctx.kullanici.id) {
            bildir(ctx, { kullaniciId: r.olusturan, tur: 'rfi_yanit', baslik: 'RFI yanıtlandı',
              govde: r.baslik, nesne: 'rfi', nesneId: r.id, rota: `/teknik/rfi/${r.id}` });
          }
        });
        return degisiklik ? 'Yanıt kaydedildi — kapsam etkisi nedeniyle değişiklik süreci gerekiyor'
          : 'Yanıt kaydedildi';
      },
    },
  });

  /* ================= QLT-13 Test sonuçları ============================= */
  kayitModulu(y, ekranRota, {
    nesne: 'test_sonucu', tablo: 'test_sonucu', kodNesnesi: 'test_sonucu', kimlikTuru: 'test',
    rota: '/kalite/testler', formRotasi: '/kalite/testler?yeni=1',
    baslik: 'Test sonucu', yeniEtiketi: 'Yeni test kaydı',
    listeKodu: 'QLT-13', detayKodu: null, gecisNesnesi: 'sahaBildirimi',
    aramaAlanlari: ['numune_kodu', 'kod', 'test_turu'], aramaYer: 'Numune kodu veya test türü…',
    filtreler: [{ ad: 'sonuc', etiket: 'Sonuç', secenekler: [
      { deger: 'uygun', etiket: 'Uygun' }, { deger: 'uygun_degil', etiket: 'Uygun değil' },
      { deger: 'beklemede', etiket: 'Beklemede' }] }],
    alanlar: [],
    kpi: (ctx, toplam) => [
      { etiket: 'Toplam test', deger: sayi(sayac(ctx.tenant.id, 'test_sonucu')), ikon: 'fa-flask' },
      { etiket: 'Uygun', deger: sayi(sayac(ctx.tenant.id, 'test_sonucu', `sonuc = 'uygun'`)), ikon: 'fa-circle-check' },
      { etiket: 'Uygun değil', deger: sayi(sayac(ctx.tenant.id, 'test_sonucu', `sonuc = 'uygun_degil'`)), ikon: 'fa-circle-xmark', ton: 'danger' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ],
    listeSutunlari: () => [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'numune_kodu', etiket: 'Numune', govde: (r) => h`<b>${r.numune_kodu}</b><br><span class="muted">${r.test_turu}</span>` },
      { ad: 'laboratuvar', etiket: 'Laboratuvar', govde: (r) => r.laboratuvar || '—' },
      { ad: 'kabul_kriteri', etiket: 'Kriter / ölçüm',
        govde: (r) => h`${r.kabul_kriteri || '—'}<br><span class="muted">${r.olculen_deger || '—'} ${r.birim || ''}</span>` },
      { ad: 'sonuc', etiket: 'Sonuç', govde: (r) => !r.sonuc ? B.rozet('beklemede', 'Bekliyor')
        : r.sonuc === 'uygun' ? B.rozet('onaylandi', 'Uygun') : B.rozet('reddedildi', 'Uygun değil') },
      { ad: 'test_tarihi', etiket: 'Test tarihi', govde: (r) => (r.test_tarihi ? tarih(r.test_tarihi) : '—') },
    ],
    bosDurum: { baslik: 'Test kaydı yok', aciklama: 'Numune zinciri, sonuç ve kabul kriteri burada tutulur.', ikon: 'fa-flask' },
    altForm: (ctx) => B.form({
      rota: '/kalite/testler', csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Yeni test kaydı',
        aciklama: '"Uygun değil" sonucu otomatik olarak kritik NCR açar (§7).', alanlar: h`
        ${B.alan({ ad: 'numuneKodu', etiket: 'Numune kodu', zorunlu: true })}
        ${B.alan({ ad: 'testTuru', etiket: 'Test türü', zorunlu: true })}
        ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye', secenekler: [{ deger: '', etiket: 'Seçin…' }, ...santiyeSecenekleri(ctx)] })}
        ${B.alan({ ad: 'laboratuvar', etiket: 'Laboratuvar' })}
        ${B.alan({ ad: 'alimTarihi', etiket: 'Numune alım tarihi', tur: 'date' })}
        ${B.alan({ ad: 'testTarihi', etiket: 'Test tarihi', tur: 'date' })}
        ${B.alan({ ad: 'kabulKriteri', etiket: 'Kabul kriteri', genis: true })}
        ${B.alan({ ad: 'olculenDeger', etiket: 'Ölçülen değer' })}
        ${B.alan({ ad: 'birim', etiket: 'Birim' })}
        ${B.alan({ ad: 'sonuc', etiket: 'Sonuç', secenekler: [{ deger: '', etiket: 'Beklemede' },
          { deger: 'uygun', etiket: 'Uygun' }, { deger: 'uygun_degil', etiket: 'Uygun değil' }] })}
        ${B.alan({ ad: 'zincirNotu', etiket: 'Numune zinciri notu', genis: true })}` }],
      eylemler: B.btn('Testi kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
    }),
  });

  y.post('/kalite/testler', (ctx, govde) => {
    yetkiZorunlu(ctx, 'QLT-13:olustur');
    csrfZorunlu(ctx, govde);
    const numune = String(govde.numuneKodu || '').trim();
    const testTuru = String(govde.testTuru || '').trim();
    const hatalar = {};
    if (!numune) hatalar.numuneKodu = ['Numune kodu girin.'];
    if (!testTuru) hatalar.testTuru = ['Test türü girin.'];
    if (Object.keys(hatalar).length) throw DogrulamaHatasi('Test kaydı eksik.', { alanlar: hatalar });
    const santiye = govde.santiyeId ? tek('SELECT * FROM santiye WHERE id = ? AND tenant_id = ?', govde.santiyeId, ctx.tenant.id) : null;

    islem(() => {
      const kod = sonrakiKod(ctx.tenant.id, 'test_sonucu');
      const id = kimlik('test');
      calistir(`INSERT INTO test_sonucu (id, tenant_id, santiye_id, proje_id, kod, numune_kodu, test_turu,
                  alim_tarihi, test_tarihi, laboratuvar, kabul_kriteri, olculen_deger, birim, sonuc,
                  zincir_notu, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'yeni', ?,?)`,
        id, ctx.tenant.id, santiye?.id || null, santiye?.proje_id || null, kod, numune, testTuru,
        govde.alimTarihi ? gunBaslangici(govde.alimTarihi) : null,
        govde.testTarihi ? gunBaslangici(govde.testTarihi) : null,
        govde.laboratuvar || null, govde.kabulKriteri || null, govde.olculenDeger || null,
        govde.birim || null, govde.sonuc || null, govde.zincirNotu || null,
        ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'test_sonucu', nesneId: id, eylem: 'olustur',
        sonraki: { kod, numune, testTuru, sonuc: govde.sonuc } });

      /* Uygunsuz test otomatik NCR açar (§7: mal kabul ret → kalite zinciri). */
      if (govde.sonuc === 'uygun_degil') {
        const ncrKod = sonrakiKod(ctx.tenant.id, 'ncr');
        const ncrId = kimlik('kalite').replace('qlt', 'ncr');
        calistir(`INSERT INTO ncr (id, tenant_id, santiye_id, proje_id, kod, baslik, gereklilik, bulgu,
                    onem, durum, olusturan, olusturuldu)
                  VALUES (?,?,?,?,?,?,?,?, 'kritik', 'yeni', ?,?)`,
          ncrId, ctx.tenant.id, santiye?.id || null, santiye?.proje_id || null, ncrKod,
          `Uygunsuz test sonucu: ${numune}`,
          govde.kabulKriteri || 'Belirtilen kabul kriteri',
          `${testTuru} testi uygun değil (ölçülen: ${govde.olculenDeger || '—'} ${govde.birim || ''})`,
          ctx.kullanici.id, simdi());
        calistir('UPDATE test_sonucu SET ncr_id = ? WHERE id = ?', ncrId, id);
        audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
          nesne: 'ncr', nesneId: ncrId, eylem: 'otomatik_olustur',
          gerekce: `Uygunsuz test sonucu ${kod}`, sonraki: { kaynak: 'test_sonucu', kaynakId: id } });
      }
    });
    return yonlendir(ctx, '/kalite/testler?olusturuldu=1');
  }, { ekran: ekranNesnesi('QLT-13') });

  /* ================= QLT-14 Punch listesi ============================== */
  kayitModulu(y, ekranRota, {
    nesne: 'punch', tablo: 'punch', kodNesnesi: 'punch', kimlikTuru: 'punch',
    rota: '/kalite/punch', formRotasi: '/kalite/punch?yeni=1',
    baslik: 'Punch maddesi', yeniEtiketi: 'Yeni punch maddesi',
    listeKodu: 'QLT-14', detayKodu: null, gecisNesnesi: 'sahaBildirimi',
    aramaAlanlari: ['baslik', 'kod', 'lokasyon'], aramaYer: 'Punch başlığı veya lokasyon…',
    filtreler: [
      { ad: 'onem', etiket: 'Önem', secenekler: ['bilgi', 'uyari', 'kritik'].map((o) => ({ deger: o, etiket: o })) },
      { ad: 'durum', etiket: 'Durum', secenekler: ['yeni', 'atandi', 'islemde', 'kapali'].map((d) => ({ deger: d, etiket: d })) },
    ],
    alanlar: [],
    sirala: `CASE onem WHEN 'kritik' THEN 0 WHEN 'uyari' THEN 1 ELSE 2 END, termin`,
    kpi: (ctx, toplam) => [
      { etiket: 'Açık madde', deger: sayi(sayac(ctx.tenant.id, 'punch', `durum NOT IN ('kapali','iptal')`)), ikon: 'fa-list-check' },
      { etiket: 'Kritik', deger: sayi(sayac(ctx.tenant.id, 'punch', `onem = 'kritik' AND durum NOT IN ('kapali','iptal')`)), ikon: 'fa-triangle-exclamation', ton: 'danger' },
      { etiket: 'Gecikmiş', deger: sayi(sayac(ctx.tenant.id, 'punch', `termin < ? AND durum NOT IN ('kapali','iptal')`, simdi())), ikon: 'fa-hourglass-end', ton: 'warn' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ],
    listeSutunlari: () => [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'baslik', etiket: 'Madde', govde: (r) => h`<a href="/kalite/punch/${r.id}"><b>${r.baslik}</b></a>${
        r.lokasyon ? h`<br><span class="muted">${r.lokasyon}</span>` : ''}` },
      { ad: 'onem', etiket: 'Önem', govde: (r) => B.isaret(r.onem, r.onem === 'kritik' ? 'danger' : r.onem === 'uyari' ? 'warn' : 'nötr') },
      { ad: 'sorumlu_id', etiket: 'Sorumlu', govde: (r) => kullaniciAdi(r.sorumlu_id) },
      { ad: 'termin', etiket: 'Termin', govde: (r) => !r.termin ? '—'
        : r.termin < simdi() && !['kapali', 'iptal'].includes(r.durum) ? B.isaret(tarih(r.termin), 'danger') : tarih(r.termin) },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
    ],
    bosDurum: { baslik: 'Punch maddesi yok', aciklama: 'Eksik işler, kabul öncesi burada toplanır.', ikon: 'fa-list-check' },
    altForm: (ctx) => B.form({
      rota: '/kalite/punch', csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Yeni punch maddesi', alanlar: h`
        ${B.alan({ ad: 'baslik', etiket: 'Eksik iş', zorunlu: true, genis: true })}
        ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye', secenekler: [{ deger: '', etiket: 'Seçin…' }, ...santiyeSecenekleri(ctx)] })}
        ${B.alan({ ad: 'lokasyon', etiket: 'Lokasyon', ipucu: 'Blok, kat, mahal' })}
        ${B.alan({ ad: 'disiplin', etiket: 'Disiplin', secenekler: [{ deger: '', etiket: 'Seçin…' }, ...DISIPLINLER] })}
        ${B.alan({ ad: 'onem', etiket: 'Önem', deger: 'uyari', secenekler: [
          { deger: 'bilgi', etiket: 'Bilgi' }, { deger: 'uyari', etiket: 'Uyarı' }, { deger: 'kritik', etiket: 'Kritik' }] })}
        ${B.alan({ ad: 'sorumluId', etiket: 'Sorumlu', secenekler: [{ deger: '', etiket: 'Seçin…' }, ...kullaniciSecenekleri(ctx)] })}
        ${B.alan({ ad: 'termin', etiket: 'Termin', tur: 'date' })}` }],
      eylemler: B.btn('Maddeyi ekle', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
    }),
  });

  y.post('/kalite/punch', (ctx, govde) => {
    yetkiZorunlu(ctx, 'QLT-14:olustur');
    csrfZorunlu(ctx, govde);
    const baslik = String(govde.baslik || '').trim();
    if (!baslik) throw DogrulamaHatasi('Başlık zorunludur.', { alanlar: { baslik: ['Başlık girin.'] } });
    const santiye = govde.santiyeId ? tek('SELECT * FROM santiye WHERE id = ? AND tenant_id = ?', govde.santiyeId, ctx.tenant.id) : null;
    islem(() => {
      const kod = sonrakiKod(ctx.tenant.id, 'punch');
      const id = kimlik('punch');
      calistir(`INSERT INTO punch (id, tenant_id, santiye_id, proje_id, kod, baslik, lokasyon, disiplin,
                  onem, sorumlu_id, termin, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?,?,?,?, 'yeni', ?,?)`,
        id, ctx.tenant.id, santiye?.id || null, santiye?.proje_id || null, kod, baslik,
        govde.lokasyon || null, govde.disiplin || null, govde.onem || 'uyari',
        govde.sorumluId || null, govde.termin ? gunBaslangici(govde.termin) : null,
        ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'punch', nesneId: id, eylem: 'olustur', sonraki: { kod, baslik, onem: govde.onem } });
    });
    return yonlendir(ctx, '/kalite/punch?olusturuldu=1');
  }, { ekran: ekranNesnesi('QLT-14') });

  y.get('/kalite/punch/:id', (ctx, _g, params) => punchDetayi(ctx, params.id), { ekran: ekranNesnesi('QLT-14') });
  y.post('/kalite/punch/:id', (ctx, govde, params) => {
    yetkiZorunlu(ctx, 'QLT-14:guncelle');
    csrfZorunlu(ctx, govde);
    const p = tek('SELECT * FROM punch WHERE id = ? AND tenant_id = ?', params.id, ctx.tenant.id);
    if (!p) throw DogrulamaHatasi('Punch maddesi bulunamadı.');
    if (govde._eylem === 'kapat') {
      /* Punch kapanışı KANIT ister — "tamamlandı" beyanı yeterli değil. */
      if (!String(govde.kapanisKaniti || '').trim()) {
        throw DogrulamaHatasi('Kapanış kanıtı zorunludur.',
          { alanlar: { kapanisKaniti: ['Fotoğraf referansı, tutanak no veya ölçüm girin.'] } });
      }
      islem(() => {
        surumluGuncelle('punch', p.id, Number(govde.surum),
          { kapanis_kaniti: govde.kapanisKaniti.trim(), durum: 'kapali' },
          { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
        audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
          nesne: 'punch', nesneId: p.id, eylem: 'gecis:kapat', gerekce: govde.kapanisKaniti,
          onceki: { durum: p.durum }, sonraki: { durum: 'kapali' } });
      });
      return yonlendir(ctx, `/kalite/punch/${p.id}?islem=${encodeURIComponent('Punch maddesi kapatıldı')}`);
    }
    throw DogrulamaHatasi('Tanımsız işlem.');
  }, { ekran: ekranNesnesi('QLT-14') });
}

/* ========================================================================== */
/* Sayfalar                                                                   */
/* ========================================================================== */
function itpDetayi(ctx, id) {
  const e = ekranNesnesi('QLT-02');
  yetkiZorunlu(ctx, e.yetki);
  const itp = tek('SELECT * FROM itp WHERE id = ? AND tenant_id = ?', id, ctx.tenant.id);
  if (!itp) throw DogrulamaHatasi('ITP bulunamadı.');
  const noktalar = sorgu('SELECT * FROM itp_nokta WHERE itp_id = ? ORDER BY sira', itp.id);
  const yazilabilir = itp.durum !== 'onaylandi' && yetkiVar(ctx, 'QLT-03:guncelle');

  const icerik = h`
${ctx.sorgu.get('nokta') ? B.sonucSeridi({ tur: 'ok', baslik: 'Kontrol noktası eklendi' }) : ''}
${B.detayOzetSeridi({
    kod: itp.kod, baslik: itp.ad, durum: itp.durum, surum: itp.surum,
    bilgiler: [
      { etiket: 'Disiplin', deger: itp.disiplin || '—' },
      { etiket: 'Kontrol noktası', deger: sayi(noktalar.length) },
      { etiket: 'Hold noktası', deger: sayi(noktalar.filter((n) => n.nokta_tipi === 'H').length) },
      { etiket: 'Kapsam', deger: itp.kapsam || '—' },
    ],
  })}
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Kontrol noktaları</b>
    <span>H (hold) noktası kapanmadan imalat ilerleyemez; W (witness) şahitlik gerektirir.</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: noktalar,
    bosDurum: { baslik: 'Kontrol noktası yok', aciklama: 'ITP, kontrol noktaları olmadan onaya gönderilemez.', ikon: 'fa-list-ol' },
    sutunlar: [
      { ad: 'sira', etiket: '#', hizala: 'sag' },
      { ad: 'ad', etiket: 'Kontrol noktası', govde: (r) => h`<b>${r.ad}</b>` },
      { ad: 'nokta_tipi', etiket: 'Tip', govde: (r) => B.isaret(r.nokta_tipi, r.nokta_tipi === 'H' ? 'danger' : r.nokta_tipi === 'W' ? 'warn' : 'info') },
      { ad: 'kriter', etiket: 'Kabul kriteri', govde: (r) => r.kriter || '—' },
      { ad: 'sorumlu_rol', etiket: 'Sorumlu', govde: (r) => r.sorumlu_rol || '—' },
      { ad: 'kanit_turu', etiket: 'Kanıt', govde: (r) => r.kanit_turu || '—' },
    ],
  })}</div>
</div>
${yazilabilir ? B.form({
    rota: `/kalite/itp/${itp.id}`, csrf: csrfAlani(ctx),
    bolumler: [{ baslik: 'Kontrol noktası ekle', alanlar: h`
      ${B.alan({ ad: 'noktaAdi', etiket: 'Kontrol noktası', zorunlu: true, genis: true })}
      ${B.alan({ ad: 'noktaTipi', etiket: 'Tip', deger: 'R', secenekler: NOKTA_TIPLERI })}
      ${B.alan({ ad: 'kriter', etiket: 'Kabul kriteri' })}
      ${B.alan({ ad: 'referans', etiket: 'Referans (şartname/standart)' })}
      ${B.alan({ ad: 'sorumluRol', etiket: 'Sorumlu taraf', ipucu: 'Örn. müşavir, taşeron, laboratuvar' })}
      ${B.alan({ ad: 'kanitTuru', etiket: 'Kanıt türü', ipucu: 'Tutanak, foto, test raporu…' })}` }],
    eylemler: B.btn('Noktayı ekle', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : h`<p class="gf-hint">Onaylı ITP değiştirilemez; değişiklik için yeni sürüm açılır (§5.4).</p>`}
${gecmisKarti('itp', itp)}`;
  return html(ctx, 200, ciz(ctx, e, icerik, { kayitEtiketi: itp.kod, baslik: itp.ad }));
}

function muayeneSonuclandir(ctx, govde) {
  const m = tek('SELECT * FROM muayene WHERE id = ? AND tenant_id = ?', govde.id, ctx.tenant.id);
  if (!m) throw DogrulamaHatasi('Muayene bulunamadı.');
  if (m.sonuc) throw GecisIzinsiz('Bu muayene zaten sonuçlandırılmış; düzeltme yeni muayene talebiyle yapılır.');
  const sonuc = govde.sonuc;
  if (!['uygun', 'uygun_degil', 'sartli'].includes(sonuc)) {
    throw DogrulamaHatasi('Geçerli bir sonuç seçin.', { alanlar: { sonuc: ['Uygun / uygun değil / şartlı.'] } });
  }
  if (sonuc !== 'uygun' && !String(govde.sonucNotu || '').trim()) {
    throw DogrulamaHatasi('Uygun olmayan sonuçta not zorunludur.', { alanlar: { sonucNotu: ['Gerekçe girin.'] } });
  }

  return islem(() => {
    let ncrId = null;
    /* Uygunsuz muayene otomatik NCR açar — kalite zinciri kopmaz (§7). */
    if (sonuc === 'uygun_degil') {
      const ncrKod = sonrakiKod(ctx.tenant.id, 'ncr');
      ncrId = kimlik('kalite').replace('qlt', 'ncr');
      calistir(`INSERT INTO ncr (id, tenant_id, santiye_id, proje_id, kod, baslik, gereklilik, bulgu,
                  onem, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?, 'uyari', 'yeni', ?,?)`,
        ncrId, ctx.tenant.id, m.santiye_id, m.proje_id, ncrKod,
        `Muayene uygunsuzluğu: ${m.baslik}`, 'ITP kabul kriteri',
        govde.sonucNotu, ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'ncr', nesneId: ncrId, eylem: 'otomatik_olustur',
        gerekce: `Uygunsuz muayene ${m.kod}`, sonraki: { kaynak: 'muayene', kaynakId: m.id } });
    }
    surumluGuncelle('muayene', m.id, Number(govde.surum || m.surum),
      { sonuc, sonuc_notu: govde.sonucNotu || null, muayene_tarihi: simdi(),
        ncr_id: ncrId, durum: sonuc === 'uygun' ? 'kapali' : 'islemde' },
      { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'muayene', nesneId: m.id, eylem: `sonuc:${sonuc}`, gerekce: govde.sonucNotu,
      sonraki: { sonuc, ncrAcildi: !!ncrId } });
    return yonlendir(ctx, `/kalite/muayeneler/${m.id}?islem=${encodeURIComponent(
      ncrId ? 'Sonuç kaydedildi — uygunsuzluk için NCR açıldı' : 'Sonuç kaydedildi')}`);
  });
}

function muayeneDetayi(ctx, id) {
  const e = ekranNesnesi('QLT-04');
  yetkiZorunlu(ctx, e.yetki);
  const m = tek('SELECT * FROM muayene WHERE id = ? AND tenant_id = ?', id, ctx.tenant.id);
  if (!m) throw DogrulamaHatasi('Muayene bulunamadı.');
  const ncr = m.ncr_id ? tek('SELECT * FROM ncr WHERE id = ?', m.ncr_id) : null;

  const icerik = h`
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.detayOzetSeridi({
    kod: m.kod, baslik: m.baslik, durum: m.durum, surum: m.surum,
    isaretler: m.nokta_tipi === 'H' ? [{ metin: 'HOLD noktası', ton: 'danger' }] : [],
    bilgiler: [
      { etiket: 'Nokta tipi', deger: NOKTA_TIPLERI.find((n) => n.deger === m.nokta_tipi)?.etiket || m.nokta_tipi },
      { etiket: 'Mahal', deger: m.mahal || '—' },
      { etiket: 'Talep tarihi', deger: tarih(m.talep_tarihi) },
      { etiket: 'Muayene tarihi', deger: m.muayene_tarihi ? tarih(m.muayene_tarihi) : '—' },
      { etiket: 'Sonuç', deger: m.sonuc || 'bekliyor' },
      { etiket: 'Açılan NCR', deger: ncr ? h`<a href="/kalite/ncr/${ncr.id}">${ncr.kod}</a>` : '—' },
    ],
  })}
<div class="dash-cols">
  <div>${gecmisKarti('muayene', m)}</div>
  <div class="gv-side-stack">
    ${!m.sonuc && yetkiVar(ctx, 'QLT-04:guncelle') ? B.form({
      rota: `/kalite/muayeneler/${m.id}`, csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Muayene sonucu',
        aciklama: '"Uygun değil" sonucu otomatik olarak NCR açar; zincir kopmaz.', alanlar: h`
        ${ham(`<input type="hidden" name="surum" value="${m.surum}">`)}
        ${B.alan({ ad: 'sonuc', etiket: 'Sonuç', zorunlu: true, secenekler: [
          { deger: '', etiket: 'Seçin…' }, { deger: 'uygun', etiket: 'Uygun' },
          { deger: 'sartli', etiket: 'Şartlı uygun' }, { deger: 'uygun_degil', etiket: 'Uygun değil' }] })}
        ${B.alan({ ad: 'sonucNotu', etiket: 'Sonuç notu', tur: 'metin', genis: true })}` }],
      eylemler: B.btn('Sonucu kaydet', { tur: 'acc', gonder: true, ikon: 'fa-clipboard-check' }),
    }) : ''}
  </div>
</div>`;
  return html(ctx, 200, ciz(ctx, e, icerik, { kayitEtiketi: m.kod, baslik: m.baslik }));
}

function submittalKarar(ctx, govde) {
  const s = tek('SELECT * FROM submittal WHERE id = ? AND tenant_id = ?', govde.id, ctx.tenant.id);
  if (!s) throw DogrulamaHatasi('Submittal bulunamadı.');
  if (s.karar_kodu) throw GecisIzinsiz('Bu sürüm karara bağlanmış; yeni karar için yeni sürüm gönderilir.');
  if (!['A', 'B', 'C', 'D'].includes(govde.kararKodu)) {
    throw DogrulamaHatasi('Karar kodu seçin.', { alanlar: { kararKodu: ['A, B, C veya D.'] } });
  }
  if (['C', 'D'].includes(govde.kararKodu) && !String(govde.kararNotu || '').trim()) {
    throw DogrulamaHatasi('Revizyon ve ret kararında not zorunludur.', { alanlar: { kararNotu: ['Gerekçe girin.'] } });
  }
  islem(() => {
    surumluGuncelle('submittal', s.id, Number(govde.surum || s.surum),
      { karar_kodu: govde.kararKodu, karar_tarihi: simdi(), karar_veren: govde.kararVeren || ctx.kullanici.ad_soyad,
        karar_notu: govde.kararNotu || null,
        durum: ['A', 'B'].includes(govde.kararKodu) ? 'onaylandi' : govde.kararKodu === 'C' ? 'revizyon_istendi' : 'reddedildi' },
      { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'submittal', nesneId: s.id, eylem: `karar:${govde.kararKodu}`, gerekce: govde.kararNotu,
      sonraki: { kararKodu: govde.kararKodu, surumNo: s.surum_no } });
  });
  return yonlendir(ctx, `/teknik/submittal/${s.id}?islem=${encodeURIComponent('Karar kaydedildi: ' + govde.kararKodu)}`);
}

function submittalDetayi(ctx, id) {
  const e = ekranNesnesi('QLT-09');
  yetkiZorunlu(ctx, e.yetki);
  const s = tek('SELECT * FROM submittal WHERE id = ? AND tenant_id = ?', id, ctx.tenant.id);
  if (!s) throw DogrulamaHatasi('Submittal bulunamadı.');
  const sonrakiSurumler = sorgu('SELECT * FROM submittal WHERE tenant_id = ? AND kod = ? ORDER BY surum_no', ctx.tenant.id, s.kod);

  const icerik = h`
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.detayOzetSeridi({
    kod: `${s.kod} · sürüm ${s.surum_no}`, baslik: s.baslik, durum: s.durum, surum: s.surum,
    bilgiler: [
      { etiket: 'Tür', deger: s.tur },
      { etiket: 'Disiplin', deger: s.disiplin || '—' },
      { etiket: 'Tedarikçi', deger: s.tedarikci || '—' },
      { etiket: 'Paket', deger: s.paket || '—' },
      { etiket: 'Hedef tarih', deger: s.hedef_tarih ? tarih(s.hedef_tarih) : '—' },
      { etiket: 'Karar', deger: s.karar_kodu
        ? `${s.karar_kodu} — ${KARAR_KODLARI.find((k) => k.deger === s.karar_kodu)?.etiket.split('— ')[1]}` : 'bekliyor' },
    ],
  })}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Sürüm geçmişi</b>
        <span>Her yeniden gönderim yeni sürüm satırıdır; karar sürümle birlikte dondurulur.</span></div></div>
      <div class="gc-body flush">${B.tablo({
        satirlar: sonrakiSurumler,
        sutunlar: [
          { ad: 'surum_no', etiket: 'Sürüm', hizala: 'sag', govde: (r) => h`<b>v${r.surum_no}</b>` },
          { ad: 'gonderim_tarihi', etiket: 'Gönderim', govde: (r) => (r.gonderim_tarihi ? tarih(r.gonderim_tarihi) : '—') },
          { ad: 'karar_kodu', etiket: 'Karar', govde: (r) => r.karar_kodu
            ? B.isaret(r.karar_kodu, r.karar_kodu === 'D' ? 'danger' : r.karar_kodu === 'C' ? 'warn' : 'ok')
            : B.rozet('beklemede', 'Bekliyor') },
          { ad: 'karar_notu', etiket: 'Not', govde: (r) => r.karar_notu || '—' },
        ],
      })}</div>
    </div>
    ${gecmisKarti('submittal', s)}
  </div>
  <div class="gv-side-stack">
    ${!s.karar_kodu && yetkiVar(ctx, 'QLT-09:guncelle') ? B.form({
      rota: `/teknik/submittal/${s.id}`, csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Müşavir kararı',
        aciklama: 'Karar kodu sürümle birlikte dondurulur; değişiklik yeni sürüm gerektirir.', alanlar: h`
        ${ham(`<input type="hidden" name="surum" value="${s.surum}">`)}
        ${B.alan({ ad: 'kararKodu', etiket: 'Karar kodu', zorunlu: true,
          secenekler: [{ deger: '', etiket: 'Seçin…' }, ...KARAR_KODLARI] })}
        ${B.alan({ ad: 'kararVeren', etiket: 'Kararı veren' })}
        ${B.alan({ ad: 'kararNotu', etiket: 'Not', tur: 'metin', genis: true })}` }],
      eylemler: B.btn('Kararı kaydet', { tur: 'acc', gonder: true, ikon: 'fa-stamp' }),
    }) : ''}
  </div>
</div>`;
  return html(ctx, 200, ciz(ctx, e, icerik, { kayitEtiketi: s.kod, baslik: s.baslik }));
}

function punchDetayi(ctx, id) {
  const e = ekranNesnesi('QLT-14');
  yetkiZorunlu(ctx, e.yetki);
  const p = tek('SELECT * FROM punch WHERE id = ? AND tenant_id = ?', id, ctx.tenant.id);
  if (!p) throw DogrulamaHatasi('Punch maddesi bulunamadı.');
  const icerik = h`
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.detayOzetSeridi({
    kod: p.kod, baslik: p.baslik, durum: p.durum, surum: p.surum,
    isaretler: p.termin && p.termin < simdi() && !['kapali', 'iptal'].includes(p.durum)
      ? [{ metin: 'gecikmiş', ton: 'danger' }] : [],
    bilgiler: [
      { etiket: 'Lokasyon', deger: p.lokasyon || '—' },
      { etiket: 'Disiplin', deger: p.disiplin || '—' },
      { etiket: 'Önem', deger: p.onem },
      { etiket: 'Sorumlu', deger: kullaniciAdi(p.sorumlu_id) },
      { etiket: 'Termin', deger: p.termin ? tarih(p.termin) : '—' },
      { etiket: 'Kapanış kanıtı', deger: p.kapanis_kaniti || '—' },
    ],
  })}
<div class="dash-cols">
  <div>${gecmisKarti('punch', p)}</div>
  <div class="gv-side-stack">
    ${p.durum !== 'kapali' && yetkiVar(ctx, 'QLT-14:guncelle') ? B.form({
      rota: `/kalite/punch/${p.id}`, csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Maddeyi kapat',
        aciklama: 'Kapanış kanıtı zorunludur; "tamamlandı" beyanı tek başına yeterli değildir.', alanlar: h`
        ${ham('<input type="hidden" name="_eylem" value="kapat">')}
        ${ham(`<input type="hidden" name="surum" value="${p.surum}">`)}
        ${B.alan({ ad: 'kapanisKaniti', etiket: 'Kapanış kanıtı', tur: 'metin', zorunlu: true, genis: true,
          ipucu: 'Fotoğraf referansı, tutanak numarası veya ölçüm' })}` }],
      eylemler: B.btn('Kapat', { tur: 'acc', gonder: true, ikon: 'fa-circle-check' }),
    }) : ''}
  </div>
</div>`;
  return html(ctx, 200, ciz(ctx, e, icerik, { kayitEtiketi: p.kod, baslik: p.baslik }));
}
