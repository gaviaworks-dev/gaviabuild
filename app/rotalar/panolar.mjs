/* ============================================================================
   GÜNLÜK ÖZET VE YÖNETİCİ KONTROL MERKEZİ — GLB-02, GLB-03
   ----------------------------------------------------------------------------
   K-017: bu panolar Faz 1'den Faz 4'e alınmıştı, çünkü besleyen modüller
   (saha, kalite, stok, finans) gelmeden BOŞ KABUK olurlardı — §12'nin
   "yalnızca toast üreten işlem" yasağının pano karşılığı.

   İki panonun da tek bir kendi kaydı yoktur: her sayı kaynak modülün canlı
   sorgusudur ve her kart tıklanınca kaynağına gider (kural 4).
   ========================================================================== */
import { html } from '../cekirdek/http.mjs';
import { simdi, tarih, tarihSaat, gunAnahtari, gunBaslangici, GUN_MS } from '../cekirdek/zaman.mjs';
import { Para } from '../cekirdek/para.mjs';
import * as fdefter from '../moduller/finans/defter.mjs';
import * as sdefter from '../moduller/stok/defter.mjs';
import { projeIlerlemesi, yuzdeMetni } from '../moduller/plan/ilerleme.mjs';
import { guncelBedel, gerceklesmeBinde } from '../moduller/sozlesme/hakedis.mjs';
import { sayac } from './kayit-modulu.mjs';
import {
  ekranNesnesi, kullaniciAdi, ciz, B, h, ham, sayi, yetkiZorunlu, yetkiVar,
  sorgu, tek,
} from './ortak.mjs';

const para = (minor, birim = 'TRY') => (minor == null ? '—' : Para.minor(minor, birim || 'TRY').bicim());

export function kur(y, ekranRota) {
  ekranRota(y, 'GLB-02', { get: (ctx) => gunlukOzet(ctx) });
  ekranRota(y, 'GLB-03', { get: (ctx) => yoneticiMerkezi(ctx) });
}

/* ==========================================================================
   GLB-02 — günlük özet: dün ne oldu, bugün ne var
   ========================================================================== */
function gunlukOzet(ctx) {
  const e = ekranNesnesi('GLB-02');
  yetkiZorunlu(ctx, e.yetki);
  const t = ctx.tenant.id;
  const gun = ctx.sorgu.get('gun') || gunAnahtari(simdi());
  const bas = gunBaslangici(gun);
  const son = bas + GUN_MS;
  const donem = gun.slice(0, 7);

  /* --- Saha --- */
  const raporlar = sorgu(
    `SELECT g.*, s.kod AS santiye_kod, s.ad AS santiye_ad FROM gunluk_rapor g
       JOIN santiye s ON s.id = g.santiye_id
      WHERE g.tenant_id = ? AND g.rapor_gunu = ? ORDER BY s.kod`, t, gun);
  const raporsuzSantiye = sorgu(
    `SELECT kod, ad, id FROM santiye WHERE tenant_id = ? AND durum = 'aktif'
       AND id NOT IN (SELECT santiye_id FROM gunluk_rapor WHERE rapor_gunu = ?) ORDER BY kod`, t, gun);
  const puantaj = sorgu(
    `SELECT COUNT(*) AS kisi, COALESCE(SUM(normal_saat),0) AS normal,
            COALESCE(SUM(fazla_saat),0) AS fazla FROM puantaj WHERE tenant_id = ? AND gun = ?`, t, gun)[0]
    || { kisi: 0, normal: 0, fazla: 0 };
  const sahada = Number(tek(
    `SELECT COUNT(*) AS n FROM ziyaretci WHERE tenant_id = ? AND durum = 'sahada'`, t)?.n ?? 0);

  /* --- Olaylar --- */
  const bildirimler = sorgu(
    `SELECT * FROM saha_bildirimi WHERE tenant_id = ? AND olusturuldu >= ? AND olusturuldu < ?
      ORDER BY onem DESC, olusturuldu DESC LIMIT 10`, t, bas, son);
  const isgOlaylari = sorgu(
    `SELECT * FROM isg_olayi WHERE tenant_id = ? AND olay_zamani >= ? AND olay_zamani < ?
      ORDER BY onem DESC LIMIT 10`, t, bas, son);
  const ncr = Number(tek(
    `SELECT COUNT(*) AS n FROM ncr WHERE tenant_id = ? AND olusturuldu >= ? AND olusturuldu < ?`,
    t, bas, son)?.n ?? 0);

  /* --- Tedarik ve stok --- */
  const malKabul = sorgu(
    `SELECT m.*, d.kod AS depo_kod FROM mal_kabul m JOIN depo d ON d.id = m.depo_id
      WHERE m.tenant_id = ? AND m.olusturuldu >= ? AND m.olusturuldu < ? ORDER BY m.olusturuldu DESC`,
    t, bas, son);
  const stokHareket = Number(tek(
    `SELECT COUNT(*) AS n FROM stok_hareketi WHERE tenant_id = ? AND zaman >= ? AND zaman < ?`,
    t, bas, son)?.n ?? 0);
  const kritikStok = sdefter.kritikSeviyeAltindakiler(t);

  /* --- Bugünün işleri --- */
  const bugunTermin = sorgu(
    `SELECT kod, baslik, durum, id FROM gorev WHERE tenant_id = ? AND termin >= ? AND termin < ?
       AND durum NOT IN ('tamamlandi','iptal') ORDER BY oncelik DESC LIMIT 10`, t, bas, son);
  const toplantilar = sorgu(
    `SELECT * FROM toplanti WHERE tenant_id = ? AND baslangic >= ? AND baslangic < ? ORDER BY baslangic`,
    t, bas, son);
  const gecikmisGorev = Number(tek(
    `SELECT COUNT(*) AS n FROM gorev WHERE tenant_id = ? AND termin < ?
       AND durum NOT IN ('tamamlandi','iptal')`, t, bas)?.n ?? 0);

  const oncekiGun = gunAnahtari(bas - GUN_MS);
  const sonrakiGun = gunAnahtari(bas + GUN_MS);

  const icerik = h`
${B.filtreBari({ rota: '/panel/gunluk-ozet', sorgu: ctx.sorgu, aramaYer: 'Ara…', filtreler: [] })}
<div style="display:flex;gap:8px;margin-bottom:14px;align-items:center">
  ${B.btn('◀ Önceki gün', { rota: `/panel/gunluk-ozet?gun=${oncekiGun}`, kucuk: true })}
  <b style="font-size:14px">${tarih(bas)}</b>
  ${B.btn('Bugün', { rota: '/panel/gunluk-ozet', kucuk: true })}
  ${B.btn('Sonraki gün ▶', { rota: `/panel/gunluk-ozet?gun=${sonrakiGun}`, kucuk: true })}
</div>
${B.kpiSeridi([
    { etiket: 'Günlük rapor', deger: `${raporlar.length}/${raporlar.length + raporsuzSantiye.length}`,
      ikon: 'fa-clipboard-list', ton: raporsuzSantiye.length ? 'warn' : '',
      alt: raporsuzSantiye.length ? `${raporsuzSantiye.length} şantiye raporsuz` : 'tüm şantiyeler raporlu' },
    { etiket: 'Puantaj', deger: sayi(puantaj.kisi), ikon: 'fa-user-clock',
      alt: `${puantaj.normal} normal · ${puantaj.fazla} fazla saat` },
    { etiket: 'Saha bildirimi', deger: sayi(bildirimler.length), ikon: 'fa-bullhorn' },
    { etiket: 'İSG olayı', deger: sayi(isgOlaylari.length), ikon: 'fa-shield-heart',
      ton: isgOlaylari.some((o) => o.onem === 'kritik') ? 'danger' : '' },
  ])}
${raporsuzSantiye.length ? B.sonucSeridi({ tur: 'warn',
    baslik: `${raporsuzSantiye.length} aktif şantiyenin ${tarih(bas)} günlük raporu yok`,
    aciklama: raporsuzSantiye.slice(0, 5).map((s) => s.kod).join(', ') }) : ''}
${kritikStok.length ? B.sonucSeridi({ tur: 'warn',
    baslik: `${kritikStok.length} stok kalemi kritik seviyenin altında`,
    aciklama: kritikStok.slice(0, 4).map((x) => `${x.kart_kod} @ ${x.depo_kod}`).join(', '),
    kayitRota: '/stok-kartlari' }) : ''}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Günlük şantiye raporları</b>
        <span>Her satır ilgili şantiyenin kanonik raporudur.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: raporlar,
    satirRota: (r) => `/gunluk-raporlar/${r.id}`,
    bosDurum: { baslik: 'Bu güne ait rapor yok', ikon: 'fa-clipboard-list',
      aciklama: 'Şantiye şefleri günlük raporu girdiğinde burada görünür.' },
    sutunlar: [
      { ad: 'santiye_kod', etiket: 'Şantiye',
        govde: (r) => h`<b>${r.santiye_kod}</b><br><span class="muted">${r.santiye_ad}</span>` },
      { ad: 'hava', etiket: 'Hava', govde: (r) => r.hava || '—' },
      { ad: 'ekip_sayisi', etiket: 'Ekip', hizala: 'sag', govde: (r) => sayi(r.ekip_sayisi || 0) },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
    ],
  })}</div>
    </div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Bugünün olayları</b>
        <span>Saha bildirimi ve İSG olayları tek akışta.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: [
      ...bildirimler.map((b) => ({ ...b, tip: 'Saha bildirimi', rota: `/saha-bildirimleri/${b.id}` })),
      ...isgOlaylari.map((o) => ({ ...o, tip: 'İSG olayı', rota: `/isg/olaylar/${o.id}` })),
    ],
    satirRota: (r) => r.rota,
    bosDurum: { baslik: 'Bu güne ait olay yok', ikon: 'fa-circle-check' },
    sutunlar: [
      { ad: 'tip', etiket: 'Tip' },
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'baslik', etiket: 'Olay', govde: (r) => h`<b>${r.baslik}</b>` },
      { ad: 'onem', etiket: 'Önem', govde: (r) => B.isaret(r.onem || 'bilgi',
        r.onem === 'kritik' ? 'danger' : r.onem === 'uyari' ? 'warn' : 'info') },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
    ],
  })}</div>
    </div>
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Bugün terminli işler</b>
        <span>${gecikmisGorev ? `Ayrıca ${gecikmisGorev} gecikmiş görev var.` : 'Gecikmiş görev yok.'}</span></div>
        ${B.btn('Tüm görevler', { rota: '/gorevler', kucuk: true })}</div>
      <div class="gc-body flush">${B.tablo({
    satirlar: [...bugunTermin.map((g) => ({ ...g, tip: 'Görev', rota: `/gorevler/${g.id}` })),
      ...toplantilar.map((m) => ({ ...m, tip: 'Toplantı', rota: `/toplantilar/${m.id}` }))],
    satirRota: (r) => r.rota,
    bosDurum: { baslik: 'Bugün terminli iş yok', ikon: 'fa-calendar-check' },
    sutunlar: [
      { ad: 'tip', etiket: 'Tip' },
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'baslik', etiket: 'Kayıt', govde: (r) => h`<b>${r.baslik}</b>` },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
    ],
  })}</div>
    </div>
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Tedarik ve stok</b>
        <span>Bugünkü mal kabul ve stok hareketi.</span></div></div>
      <div class="gc-body">
        <dl class="gd-grid" style="border-top:0;padding-top:0;margin-top:0">
          <div><dt>Mal kabul</dt><dd>${sayi(malKabul.length)}</dd></div>
          <div><dt>Stok hareketi</dt><dd>${sayi(stokHareket)}</dd></div>
          <div><dt>Sahada kişi</dt><dd>${sayi(sahada)}</dd></div>
          <div><dt>Açılan NCR</dt><dd>${sayi(ncr)}</dd></div>
        </dl>
      </div>
      <div class="gc-body flush">${B.tablo({
    satirlar: malKabul,
    satirRota: (m) => `/mal-kabul/${m.id}`,
    bosDurum: { baslik: 'Bugün mal kabul yok', ikon: 'fa-truck-ramp-box' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'depo_kod', etiket: 'Depo' },
      { ad: 'durum', etiket: 'Durum', govde: (m) => B.rozet(m.durum) },
    ],
  })}</div>
    </div>
    <div class="gv-card"><div class="gc-body" style="display:flex;flex-direction:column;gap:8px">
      ${B.btn('Puantaj', { rota: `/puantaj?donem=${donem}`, ikon: 'fa-user-clock' })}
      ${B.btn('Saha bildirimleri', { rota: '/saha-bildirimleri', ikon: 'fa-bullhorn' })}
      ${B.btn('Takvim', { rota: `/takvim?ay=${donem}`, ikon: 'fa-calendar-days' })}
      ${B.btn('İSG paneli', { rota: '/isg', ikon: 'fa-shield-heart' })}
    </div></div>
  </div>
</div>
${B.veriTarihi(simdi())}`;
  return html(ctx, 200, ciz(ctx, e, icerik));
}

/* ==========================================================================
   GLB-03 — yönetici kontrol merkezi
   ========================================================================== */
function yoneticiMerkezi(ctx) {
  const e = ekranNesnesi('GLB-03');
  yetkiZorunlu(ctx, e.yetki);
  const t = ctx.tenant.id;
  const pb = ctx.tenant.para_birimi;

  /* --- Portföy --- */
  const projeler = sorgu(
    `SELECT * FROM proje WHERE tenant_id = ? AND durum NOT IN ('arsiv') ORDER BY kod`, t);
  const portfoy = projeler.map((p) => {
    const butce = tek(
      `SELECT toplam_minor FROM butce WHERE tenant_id = ? AND proje_id = ? AND durum = 'onaylandi'
        ORDER BY surum_no DESC LIMIT 1`, t, p.id);
    const hakedis = Number(tek(
      `SELECT COALESCE(SUM(hk.donem_brut_minor),0) AS n FROM hakedis hk
         JOIN sozlesme s ON s.id = hk.sozlesme_id
        WHERE hk.tenant_id = ? AND s.proje_id = ? AND hk.durum = 'onaylandi'`, t, p.id)?.n ?? 0);
    const acikRisk = Number(tek(
      `SELECT COUNT(*) AS n FROM proje_riski WHERE proje_id = ? AND durum <> 'kapali'`, p.id)?.n ?? 0);
    const kritikRisk = Number(tek(
      `SELECT COUNT(*) AS n FROM proje_riski WHERE proje_id = ? AND durum <> 'kapali'
         AND olasilik * etki >= 15`, p.id)?.n ?? 0);
    return { ...p, bac: butce ? Number(butce.toplam_minor) : 0, ac: hakedis,
      ilerleme: projeIlerlemesi(p.id), acikRisk, kritikRisk };
  });

  /* --- Nakit --- */
  const kasa = fdefter.bakiyeler('kasa', t).reduce((a, k) => a + k.bakiye_minor, 0);
  const banka = fdefter.bakiyeler('banka', t).reduce((a, k) => a + k.bakiye_minor, 0);
  const acikBorc = Number(tek(
    `SELECT COALESCE(SUM(toplam_minor),0) AS n FROM fatura WHERE tenant_id = ? AND yon = 'gelen'
       AND durum NOT IN ('odendi','iptal','reddedildi')`, t)?.n ?? 0);
  const acikAlacak = Number(tek(
    `SELECT COALESCE(SUM(toplam_minor),0) AS n FROM fatura WHERE tenant_id = ? AND yon = 'giden'
       AND durum NOT IN ('odendi','iptal','reddedildi')`, t)?.n ?? 0);

  /* --- Onay ve risk kuyruğu --- */
  const onaylar = sorgu(
    `SELECT o.*, COUNT(a.id) AS acik_adim FROM onay_talebi o
       LEFT JOIN onay_adimi a ON a.talep_id = o.id AND a.durum = 'acik'
      WHERE o.tenant_id = ? AND o.durum = 'acik'
      GROUP BY o.id ORDER BY o.sla_bitis IS NULL, o.sla_bitis LIMIT 10`, t);
  const slaAsan = onaylar.filter((o) => o.sla_bitis && o.sla_bitis < simdi()).length;

  /* --- Üretime çıkış riski gösterenler (§12 izleme) --- */
  const engeller = [
    { ad: 'Tolerans dışı fatura farkı', adet: sayac(t, 'fatura', `eslestirme = 'tolerans_disi'`),
      rota: '/faturalar/eslestirme' },
    { ad: 'Eşleşmemiş banka hareketi', adet: sayac(t, 'banka_hareketi', 'eslesen_id IS NULL'),
      rota: '/banka-hareketleri/eslestirme' },
    { ad: 'Açık NCR', adet: sayac(t, 'ncr', `durum NOT IN ('kapali','iptal')`), rota: '/kalite/ncr' },
    { ad: 'Açık İSG olayı', adet: sayac(t, 'isg_olayi', `durum NOT IN ('kapali','iptal')`),
      rota: '/isg/olaylar' },
    { ad: 'Süresi dolan varlık kontrolü', rota: '/varlik-kontrolleri', adet: Number(tek(
      `SELECT COUNT(*) AS n FROM varlik_kontrolu WHERE tenant_id = ? AND durum = 'gecerli'
         AND gecerlilik IS NOT NULL AND gecerlilik < ?`, t, simdi())?.n ?? 0) },
    { ad: 'Kapanmamış puantaj dönemi', rota: '/puantaj/donem-kapanis',
      adet: sayac(t, 'puantaj_donemi', `durum NOT IN ('kapali','iptal')`) },
  ];
  const acikEngel = engeller.filter((x) => x.adet > 0);

  /* --- Sözleşme gerçekleşmesi --- */
  const sozlesmeler = sorgu(
    `SELECT * FROM sozlesme WHERE tenant_id = ? AND durum = 'onaylandi' ORDER BY olusturuldu DESC LIMIT 8`, t)
    .map((s) => ({ ...s, guncel: guncelBedel(s.id), gerceklesme: gerceklesmeBinde(s.id) }));

  const icerik = h`
${B.kpiSeridi([
    { etiket: 'Nakit (kasa + banka)', deger: para(kasa + banka, pb), ikon: 'fa-wallet',
      alt: 'defterden hesaplandı', ton: kasa + banka < 0 ? 'danger' : '' },
    { etiket: 'Açık borç', deger: para(acikBorc, pb), ikon: 'fa-arrow-up', ton: acikBorc ? 'warn' : '' },
    { etiket: 'Açık alacak', deger: para(acikAlacak, pb), ikon: 'fa-arrow-down' },
    { etiket: 'Bekleyen onay', deger: sayi(onaylar.length), ikon: 'fa-circle-check',
      ton: slaAsan ? 'danger' : '', alt: slaAsan ? `${slaAsan} tanesi SLA aştı` : null },
  ])}
${acikEngel.length ? B.sonucSeridi({ tur: 'warn',
    baslik: `${acikEngel.length} açık kontrol kalemi`,
    aciklama: acikEngel.map((x) => `${x.ad}: ${x.adet}`).join(' · ') }) : ''}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Proje portföyü</b>
        <span>İlerleme onaylı ilerleme kayıtlarından, maliyet onaylı hakedişlerden gelir.</span></div>
        ${B.btn('Tahmin ve EAC', { rota: '/tahminler', kucuk: true })}</div>
      <div class="gc-body flush">${B.tablo({
    satirlar: portfoy,
    satirRota: (p) => `/projeler/${p.id}`,
    bosDurum: { baslik: 'Proje yok', ikon: 'fa-diagram-project' },
    sutunlar: [
      { ad: 'kod', etiket: 'Proje', govde: (p) => h`<b>${p.kod}</b><br><span class="muted">${p.ad}</span>` },
      { ad: 'durum', etiket: 'Durum', govde: (p) => B.rozet(p.durum) },
      { ad: 'ilerleme', etiket: 'İlerleme', hizala: 'sag', govde: (p) => yuzdeMetni(p.ilerleme) },
      { ad: 'bac', etiket: 'Bütçe', hizala: 'sag',
        govde: (p) => (p.bac ? para(p.bac, pb) : h`<span class="muted">yok</span>`) },
      { ad: 'ac', etiket: 'Gerçekleşen', hizala: 'sag', govde: (p) => para(p.ac, pb) },
      { ad: 'sapma', etiket: 'Kalan', hizala: 'sag', govde: (p) => (!p.bac ? '—'
        : (p.bac - p.ac < 0 ? B.isaret(para(p.bac - p.ac, pb), 'danger') : para(p.bac - p.ac, pb))) },
      { ad: 'acikRisk', etiket: 'Risk', hizala: 'sag', govde: (p) => (p.kritikRisk
        ? B.isaret(`${p.acikRisk} (${p.kritikRisk} kritik)`, 'danger')
        : (p.acikRisk ? B.isaret(String(p.acikRisk), 'warn') : '0')) },
    ],
  })}</div>
    </div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Onay kuyruğu</b>
        <span>SLA'sı yaklaşan ve aşan talepler üstte.</span></div>
        ${B.btn('Onay kutum', { rota: '/onaylar', kucuk: true })}</div>
      <div class="gc-body flush">${B.tablo({
    satirlar: onaylar,
    satirRota: (o) => `/onaylar/${o.id}`,
    bosDurum: { baslik: 'Bekleyen onay yok', ikon: 'fa-circle-check' },
    sutunlar: [
      { ad: 'nesne', etiket: 'Tür' },
      { ad: 'baslik', etiket: 'Talep', govde: (o) => h`<b>${o.baslik}</b><br><span class="muted">${
        o.nesne_kod || ''}</span>` },
      { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag',
        govde: (o) => (o.tutar_minor == null ? '—' : para(o.tutar_minor, o.tutar_birim)) },
      { ad: 'talep_eden', etiket: 'Talep eden', govde: (o) => kullaniciAdi(o.talep_eden) },
      { ad: 'sla_bitis', etiket: 'SLA', govde: (o) => (!o.sla_bitis ? '—'
        : o.sla_bitis < simdi() ? B.isaret('aşıldı', 'danger') : tarihSaat(o.sla_bitis)) },
    ],
  })}</div>
    </div>
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Sözleşme gerçekleşmesi</b>
        <span>Güncel bedel = ilk bedel + onaylı zeyiller.</span></div>
        ${B.btn('Sözleşmeler', { rota: '/sozlesmeler', kucuk: true })}</div>
      <div class="gc-body flush">${B.tablo({
    satirlar: sozlesmeler,
    satirRota: (s) => `/sozlesmeler/${s.id}`,
    bosDurum: { baslik: 'Onaylı sözleşme yok', ikon: 'fa-file-signature' },
    sutunlar: [
      { ad: 'kod', etiket: 'Sözleşme', govde: (s) => h`<b>${s.kod}</b><br><span class="muted">${s.ad}</span>` },
      { ad: 'guncel', etiket: 'Güncel bedel', hizala: 'sag', govde: (s) => para(s.guncel, s.tutar_birim) },
      { ad: 'gerceklesme', etiket: 'Gerçekleşme', hizala: 'sag',
        govde: (s) => yuzdeMetni(s.gerceklesme) },
    ],
  })}</div>
    </div>
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Kontrol kalemleri</b>
        <span>Her satır canlı sorgudur; sıfırlanmadan dönem/proje kapanmaz.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: engeller,
    bosDurum: { baslik: 'Kontrol yok' },
    sutunlar: [
      { ad: 'd', etiket: '', govde: (x) => (x.adet > 0 ? B.isaret('açık', 'warn') : B.isaret('temiz', 'ok')) },
      { ad: 'ad', etiket: 'Kalem' },
      { ad: 'adet', etiket: 'Adet', hizala: 'sag' },
      { ad: 'rota', etiket: '', govde: (x) => B.btn('Aç', { rota: x.rota, kucuk: true }) },
    ],
  })}</div>
    </div>
    <div class="gv-card"><div class="gc-body" style="display:flex;flex-direction:column;gap:8px">
      ${B.btn('Günlük özet', { rota: '/panel/gunluk-ozet', ikon: 'fa-sun' })}
      ${B.btn('Finans paneli', { rota: '/finans', ikon: 'fa-wallet' })}
      ${B.btn('Ödeme planı', { rota: '/odemeler/plan', ikon: 'fa-calendar-days' })}
      ${B.btn('Plan-gerçekleşen', { rota: '/raporlar/plan-gerceklesen', ikon: 'fa-chart-line' })}
      ${B.btn('İSG istatistiği', { rota: '/raporlar/isg', ikon: 'fa-shield-heart' })}
    </div></div>
  </div>
</div>
${B.veriTarihi(simdi())}`;
  return html(ctx, 200, ciz(ctx, e, icerik));
}
