/* ============================================================================
   PROJE TAMAMLAMA VE TAKVİM — PRJ-05..10, GLB-08
   ----------------------------------------------------------------------------
   PRJ-05 / PRJ-09 sihirbazları şantiye karşılıklarıyla aynı ilkeyi izler:
   kontrol listesi gerçek kayıttan hesaplanır ve geçiş motorunun ön koşuludur.
   PRJ-10 ayrı bir "sürüm tablosu" tutmaz: değişmez denetim izinden türetilir
   (kural 4 — ikinci bir geçmiş kaydı yok).
   GLB-08 takvimi de kendi kaydını tutmaz; görev, iş emri, toplantı, aktivite ve
   belge son tarihlerini TEK sorguda birleştirir.
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, tarihSaat, gunAnahtari, gunBaslangici, GUN_MS } from '../cekirdek/zaman.mjs';
import { DogrulamaHatasi, GecisIzinsiz, Bulunamadi, Cakisma, UygulamaHatasi } from '../cekirdek/hata.mjs';
import * as onayMotoru from '../moduller/isakisi/onay.mjs';
import { aktivasyonKontrolleri, acikAktivasyonEngelleri, projeKapanisEngelleri,
  acikProjeKapanisEngelleri } from '../moduller/proje/kapanis.mjs';
import { projeIlerlemesi, yuzdeMetni } from '../moduller/plan/ilerleme.mjs';
import { kullaniciSecenekleri, santiyeSecenekleri, projeSecenekleri } from './kayit-modulu.mjs';
import {
  ekranNesnesi, hataNesnesi, kullaniciAdi, ciz, kaydiAl, B, h, ham, sayi,
  csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar,
  sorgu, tek, calistir, islem, surumluGuncelle, audit, gecisYap,
} from './ortak.mjs';

const PAYDAS_TURLERI = [
  { deger: 'isveren', etiket: 'İşveren' }, { deger: 'musavir', etiket: 'Müşavir / kontrollük' },
  { deger: 'taseron', etiket: 'Taşeron' }, { deger: 'kurum', etiket: 'Resmi kurum' },
  { deger: 'tedarikci', etiket: 'Tedarikçi' }, { deger: 'diger', etiket: 'Diğer' },
];
const RISK_DURUMLARI = [
  { deger: 'acik', etiket: 'Açık' }, { deger: 'izleniyor', etiket: 'İzleniyor' },
  { deger: 'kapali', etiket: 'Kapalı' },
];
const OLCEK = [1, 2, 3, 4, 5].map((n) => ({ deger: String(n), etiket: String(n) }));

const projeAl = (ctx, id) => kaydiAl(ctx, 'proje', 'proje', id);

function projeBasligi(ctx, p, ek = {}) {
  return B.detayOzetSeridi({
    kod: p.kod, baslik: p.ad, durum: p.durum, surum: p.surum,
    bilgiler: [
      { etiket: 'İşveren', deger: p.isveren || '—' },
      { etiket: 'Sorumlu', deger: kullaniciAdi(p.sorumlu_id) },
      { etiket: 'Onaylı ilerleme', deger: yuzdeMetni(projeIlerlemesi(p.id)) },
      ...(ek.bilgiler || []),
    ],
    birincilEylem: B.btn('Projeye dön', { rota: `/projeler/${p.id}` }),
    digerEylemler: ek.eylem || null,
  });
}

export function kur(y, ekranRota) {
  /* ================= PRJ-05 Aktivasyon sihirbazı ======================= */
  ekranRota(y, 'PRJ-05', {
    get: (ctx, _g, params) => aktivasyonSayfasi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('PRJ-05');
      yetkiZorunlu(ctx, `${e.kod}:tamamla`);
      csrfZorunlu(ctx, govde);
      const p = projeAl(ctx, params.id);
      try {
        const eylem = govde._eylem === 'hazirliga_al' ? 'hazirliga_al' : 'aktive_et';
        gecisYap(ctx, { nesne: 'proje', tablo: 'proje', kayit: p, eylem,
          gerekce: govde.gerekce || null, ekranKodu: 'PRJ-05' });
        return yonlendir(ctx, `/projeler/${p.id}/aktivasyon?islem=${encodeURIComponent(
          eylem === 'aktive_et' ? 'Proje aktifleştirildi' : 'Proje hazırlığa alındı')}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return aktivasyonSayfasi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ================= PRJ-06 Organizasyon =============================== */
  ekranRota(y, 'PRJ-06', {
    get: (ctx, _g, params) => organizasyonSayfasi(ctx, params.id),
    post: (ctx, govde, params) => {
      csrfZorunlu(ctx, govde);
      const p = projeAl(ctx, params.id);
      try {
        const mesaj = govde._eylem === 'sonlandir' ? organizasyonSonlandir(ctx, p, govde)
          : organizasyonEkle(ctx, p, govde);
        return yonlendir(ctx, `/projeler/${p.id}/organizasyon?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return organizasyonSayfasi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= PRJ-07 Paydaşlar ================================== */
  ekranRota(y, 'PRJ-07', {
    get: (ctx, _g, params) => paydasSayfasi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('PRJ-07');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      const p = projeAl(ctx, params.id);
      try {
        const mesaj = paydasEkle(ctx, p, govde);
        return yonlendir(ctx, `/projeler/${p.id}/paydaslar?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return paydasSayfasi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= PRJ-08 Risk kaydı ================================= */
  ekranRota(y, 'PRJ-08', {
    get: (ctx, _g, params) => riskSayfasi(ctx, params.id),
    post: (ctx, govde, params) => {
      csrfZorunlu(ctx, govde);
      const p = projeAl(ctx, params.id);
      try {
        const mesaj = govde._eylem === 'durum' ? riskDurumu(ctx, p, govde) : riskEkle(ctx, p, govde);
        return yonlendir(ctx, `/projeler/${p.id}/riskler?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return riskSayfasi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= PRJ-09 Proje kapanışı ============================= */
  ekranRota(y, 'PRJ-09', {
    get: (ctx, _g, params) => projeKapanisSayfasi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('PRJ-09');
      yetkiZorunlu(ctx, `${e.kod}:tamamla`);
      csrfZorunlu(ctx, govde);
      const p = projeAl(ctx, params.id);
      try {
        const mesaj = projeKapanisIslemi(ctx, p, govde);
        return yonlendir(ctx, `/projeler/${p.id}/kapanis?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return projeKapanisSayfasi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ================= PRJ-10 Sürüm ve değişiklik geçmişi ================ */
  ekranRota(y, 'PRJ-10', { get: (ctx, _g, params) => gecmisSayfasi(ctx, params.id) });

  /* ================= GLB-08 Takvim ===================================== */
  ekranRota(y, 'GLB-08', { get: (ctx) => takvimSayfasi(ctx) });
}

/* ==========================================================================
   PRJ-05
   ========================================================================== */
function aktivasyonSayfasi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('PRJ-05');
  yetkiZorunlu(ctx, e.yetki);
  const p = projeAl(ctx, id);
  const kontroller = aktivasyonKontrolleri(p.id);
  const eksik = acikAktivasyonEngelleri(p.id);
  const aktiflesebilir = p.durum === 'hazirlik' && eksik.length === 0;

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${projeBasligi(ctx, p)}
<div class="dash-cols">
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>Aktivasyon kontrol listesi</b>
      <span>Her satır gerçek kayıttan hesaplanır; adım elle "tamam" işaretlenemez.</span></div></div>
    <div class="gc-body flush">${B.tablo({
    satirlar: kontroller,
    bosDurum: { baslik: 'Kontrol yok' },
    sutunlar: [
      { ad: 'd', etiket: '', govde: (k) => (!k.engel ? B.isaret('tamam', 'ok')
        : k.zorunlu ? B.isaret('engel', 'danger') : B.isaret('uyarı', 'warn')) },
      { ad: 'ad', etiket: 'Kontrol', govde: (k) => h`<b>${k.ad}</b><br><span class="muted">${k.not}</span>` },
      { ad: 'rota', etiket: '', govde: (k) => (k.rota ? B.btn('Aç', { rota: k.rota, kucuk: true }) : '—') },
    ],
  })}</div>
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Projeyi aktifleştir</b>
        <span>Durumu siz seçmezsiniz; geçişi motor yapar ve engel varsa reddeder.</span></div></div>
      <div class="gc-body">
        ${p.durum === 'aktif' ? B.sonucSeridi({ tur: 'ok', baslik: 'Proje zaten aktif' })
    : !['taslak', 'hazirlik'].includes(p.durum)
      ? B.sonucSeridi({ tur: 'warn', baslik: `Proje "${p.durum}" durumunda`,
        aciklama: 'Aktivasyon sihirbazı yalnız taslak ve hazırlık durumunda çalışır.' })
      : eksik.length ? B.sonucSeridi({ tur: 'warn', baslik: `${eksik.length} zorunlu kontrol eksik`,
        aciklama: eksik.map((k) => k.ad).join(', ') }) : ''}
        ${yetkiVar(ctx, 'PRJ-05:tamamla') && ['taslak', 'hazirlik'].includes(p.durum) ? h`
        <form method="post" action="/projeler/${p.id}/aktivasyon" data-gform="1">
          ${ham(csrfAlani(ctx))}
          ${B.alan({ ad: 'gerekce', etiket: 'Not', tur: 'metin' })}
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
            ${p.durum === 'taslak'
    ? h`<button class="btn btn-acc" type="submit" name="_eylem" value="hazirliga_al">
        Hazırlığa al <span class="muted">→ hazırlık</span></button>` : ''}
            ${p.durum === 'hazirlik' ? (aktiflesebilir
    ? h`<button class="btn btn-acc" type="submit" name="_eylem" value="aktive_et">
        Projeyi aktifleştir <span class="muted">→ aktif</span></button>`
    : h`<button class="btn btn-ghost" type="button" disabled>
        <i class="fa-solid fa-ban"></i> Projeyi aktifleştir</button>
        <span class="gf-err">Zorunlu kontroller tamamlanmadan aktifleşmez.</span>`) : ''}
          </div>
        </form>` : ''}
      </div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: p.kod, baslik: p.ad }));
}

/* ==========================================================================
   PRJ-06
   ========================================================================== */
function organizasyonEkle(ctx, p, govde) {
  yetkiZorunlu(ctx, 'PRJ-06:olustur');
  const unvan = String(govde.gorevUnvani || '').trim();
  if (!unvan) throw DogrulamaHatasi('Görev unvanı zorunludur.', { alanlar: { gorevUnvani: ['Unvan girin.'] } });
  if (!govde.kullaniciId && !govde.personelId) {
    throw DogrulamaHatasi('Kullanıcı veya personel seçin.',
      { alanlar: { kullaniciId: ['En az biri seçilmeli.'] } });
  }
  islem(() => {
    const id = kimlik('atama').replace('atm', 'org');
    calistir(`INSERT INTO proje_organizasyonu (id, tenant_id, proje_id, kullanici_id, personel_id,
                gorev_unvani, sorumluluk, ust_id, baslangic, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?, 'aktif', ?,?)`,
      id, ctx.tenant.id, p.id, govde.kullaniciId || null, govde.personelId || null,
      unvan, govde.sorumluluk || null, govde.ustId || null,
      govde.baslangic ? gunBaslangici(govde.baslangic) : simdi(), ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'proje', nesneId: p.id, eylem: 'organizasyon_eklendi', sonraki: { unvan } });
  });
  return `${unvan} organizasyona eklendi`;
}

function organizasyonSonlandir(ctx, p, govde) {
  yetkiZorunlu(ctx, 'PRJ-06:guncelle');
  const o = tek('SELECT * FROM proje_organizasyonu WHERE id = ? AND proje_id = ?', govde.id, p.id);
  if (!o) throw Bulunamadi('Organizasyon satırı bulunamadı.');
  if (o.durum !== 'aktif') throw GecisIzinsiz('Bu satır zaten sonlandırılmış.');
  islem(() => {
    surumluGuncelle('proje_organizasyonu', o.id, Number(govde.surum),
      { durum: 'sonlandi', bitis: simdi() }, { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'proje', nesneId: p.id, eylem: 'organizasyon_sonlandirildi',
      sonraki: { unvan: o.gorev_unvani } });
  });
  return `${o.gorev_unvani} sonlandırıldı`;
}

function organizasyonSayfasi(ctx, id, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('PRJ-06');
  yetkiZorunlu(ctx, e.yetki);
  const p = projeAl(ctx, id);
  const rota = `/projeler/${p.id}/organizasyon`;
  const satirlar = sorgu(
    `SELECT o.*, k.ad_soyad AS kullanici_ad, pe.ad_soyad AS personel_ad, pe.kod AS personel_kod,
            u.gorev_unvani AS ust_unvan
       FROM proje_organizasyonu o
       LEFT JOIN kullanici k ON k.id = o.kullanici_id
       LEFT JOIN personel pe ON pe.id = o.personel_id
       LEFT JOIN proje_organizasyonu u ON u.id = o.ust_id
      WHERE o.proje_id = ? ORDER BY o.durum, o.olusturuldu`, p.id);
  const aktifler = satirlar.filter((o) => o.durum === 'aktif');

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${projeBasligi(ctx, p, { bilgiler: [{ etiket: 'Aktif görev tanımı', deger: sayi(aktifler.length) }] })}
<div class="dash-cols">
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>Proje organizasyonu</b>
      <span>Kim, hangi rolde, kime bağlı. Yetki bu tablodan değil rol atamasından gelir (§5.7).</span></div></div>
    <div class="gc-body flush">${B.tablo({
    satirlar,
    bosDurum: { baslik: 'Organizasyon tanımı yok', ikon: 'fa-sitemap',
      aciklama: 'Proje aktivasyonu için en az bir satır gerekir.' },
    sutunlar: [
      { ad: 'gorev_unvani', etiket: 'Görev', govde: (r) => h`<b>${r.gorev_unvani}</b>${
        r.sorumluluk ? h`<br><span class="muted">${r.sorumluluk}</span>` : ''}` },
      { ad: 'kisi', etiket: 'Kişi', govde: (r) => (r.kullanici_ad
        ? h`${r.kullanici_ad}<br><span class="muted">uygulama hesabı</span>`
        : r.personel_ad ? h`<a href="/personel/${r.personel_id}">${r.personel_ad}</a>
          <br><span class="muted">${r.personel_kod}</span>` : '—') },
      { ad: 'ust_unvan', etiket: 'Bağlı olduğu', govde: (r) => r.ust_unvan || '—' },
      { ad: 'baslangic', etiket: 'Başlangıç', govde: (r) => (r.baslangic ? tarih(r.baslangic) : '—') },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum === 'aktif' ? 'onaylandi' : 'kapali',
        r.durum === 'aktif' ? 'Aktif' : 'Sonlandı') },
      { ad: 'islem', etiket: '', govde: (r) => (r.durum !== 'aktif' || !yetkiVar(ctx, 'PRJ-06:guncelle') ? '—'
        : h`<form method="post" action="${rota}" style="display:inline">${ham(csrfAlani(ctx))}
            <input type="hidden" name="_eylem" value="sonlandir">
            <input type="hidden" name="id" value="${r.id}">
            <input type="hidden" name="surum" value="${r.surum}">
            <button class="btn btn-ghost btn-sm" type="submit">Sonlandır</button></form>`) },
    ],
  })}</div>
  </div>
  <div class="gv-side-stack">
    ${yetkiVar(ctx, 'PRJ-06:olustur') ? B.form({
    rota, csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Görev tanımı ekle', alanlar: h`
      ${B.alan({ ad: 'gorevUnvani', etiket: 'Görev unvanı', zorunlu: true, genis: true,
      deger: deger.gorevUnvani || '', hata: hata?.alanlar?.gorevUnvani })}
      ${B.alan({ ad: 'kullaniciId', etiket: 'Uygulama kullanıcısı', deger: deger.kullaniciId || '',
      hata: hata?.alanlar?.kullaniciId,
      secenekler: [{ deger: '', etiket: 'Seçin…' }, ...kullaniciSecenekleri(ctx)] })}
      ${B.alan({ ad: 'personelId', etiket: 'Personel', deger: deger.personelId || '',
      secenekler: [{ deger: '', etiket: 'Seçin…' }, ...sorgu(
        `SELECT id, kod, ad_soyad FROM personel WHERE tenant_id = ? ORDER BY ad_soyad`, ctx.tenant.id)
        .map((x) => ({ deger: x.id, etiket: `${x.kod} — ${x.ad_soyad}` }))] })}
      ${B.alan({ ad: 'ustId', etiket: 'Bağlı olduğu görev',
      secenekler: [{ deger: '', etiket: 'Yok (en üst)' },
        ...aktifler.map((o) => ({ deger: o.id, etiket: o.gorev_unvani }))] })}
      ${B.alan({ ad: 'baslangic', etiket: 'Başlangıç', tur: 'date', deger: gunAnahtari(simdi()) })}
      ${B.alan({ ad: 'sorumluluk', etiket: 'Sorumluluk', tur: 'metin', genis: true,
      deger: deger.sorumluluk || '' })}` }],
    eylemler: B.btn('Görevi ekle', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: p.kod, baslik: p.ad }));
}

/* ==========================================================================
   PRJ-07
   ========================================================================== */
function paydasEkle(ctx, p, govde) {
  const unvan = String(govde.unvan || '').trim();
  if (!unvan) throw DogrulamaHatasi('Paydaş unvanı zorunludur.', { alanlar: { unvan: ['Unvan girin.'] } });
  if (!PAYDAS_TURLERI.some((t) => t.deger === govde.tur)) {
    throw DogrulamaHatasi('Geçersiz paydaş türü.', { alanlar: { tur: ['Tür seçin.'] } });
  }
  islem(() => {
    const id = kimlik('atama').replace('atm', 'pyd');
    calistir(`INSERT INTO proje_paydasi (id, tenant_id, proje_id, tur, unvan, kisi, telefon, eposta,
                rol_tanimi, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      id, ctx.tenant.id, p.id, govde.tur, unvan, govde.kisi || null, govde.telefon || null,
      govde.eposta || null, govde.rolTanimi || null, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'proje', nesneId: p.id, eylem: 'paydas_eklendi', sonraki: { tur: govde.tur, unvan } });
  });
  return `${unvan} paydaş listesine eklendi`;
}

function paydasSayfasi(ctx, id, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('PRJ-07');
  yetkiZorunlu(ctx, e.yetki);
  const p = projeAl(ctx, id);
  const rota = `/projeler/${p.id}/paydaslar`;
  const satirlar = sorgu('SELECT * FROM proje_paydasi WHERE proje_id = ? ORDER BY tur, unvan', p.id);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${projeBasligi(ctx, p, { bilgiler: [{ etiket: 'Paydaş', deger: sayi(satirlar.length) }] })}
<div class="dash-cols">
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>Proje paydaşları</b>
      <span>İşveren, müşavir, taşeron ve kurumlar; transmittal dağıtımı bu listeden beslenir.</span></div></div>
    <div class="gc-body flush">${B.tablo({
    satirlar,
    bosDurum: { baslik: 'Paydaş yok', ikon: 'fa-handshake',
      aciklama: 'Proje aktivasyonu için en az bir paydaş kaydı gerekir.' },
    sutunlar: [
      { ad: 'unvan', etiket: 'Kuruluş', govde: (r) => h`<b>${r.unvan}</b>${
        r.rol_tanimi ? h`<br><span class="muted">${r.rol_tanimi}</span>` : ''}` },
      { ad: 'tur', etiket: 'Tür', govde: (r) => B.isaret(
        PAYDAS_TURLERI.find((t) => t.deger === r.tur)?.etiket || r.tur, 'info') },
      { ad: 'kisi', etiket: 'İlgili kişi', govde: (r) => r.kisi || '—' },
      { ad: 'telefon', etiket: 'Telefon', govde: (r) => r.telefon || '—' },
      { ad: 'eposta', etiket: 'E-posta', govde: (r) => r.eposta || '—' },
    ],
  })}</div>
  </div>
  <div class="gv-side-stack">
    ${yetkiVar(ctx, 'PRJ-07:olustur') ? B.form({
    rota, csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Paydaş ekle', alanlar: h`
      ${B.alan({ ad: 'unvan', etiket: 'Kuruluş unvanı', zorunlu: true, genis: true,
      deger: deger.unvan || '', hata: hata?.alanlar?.unvan })}
      ${B.alan({ ad: 'tur', etiket: 'Tür', deger: deger.tur || 'isveren', secenekler: PAYDAS_TURLERI,
      hata: hata?.alanlar?.tur })}
      ${B.alan({ ad: 'kisi', etiket: 'İlgili kişi', deger: deger.kisi || '' })}
      ${B.alan({ ad: 'telefon', etiket: 'Telefon', deger: deger.telefon || '' })}
      ${B.alan({ ad: 'eposta', etiket: 'E-posta', deger: deger.eposta || '' })}
      ${B.alan({ ad: 'rolTanimi', etiket: 'Rol tanımı', tur: 'metin', genis: true,
      deger: deger.rolTanimi || '' })}` }],
    eylemler: B.btn('Paydaşı ekle', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: p.kod, baslik: p.ad }));
}

/* ==========================================================================
   PRJ-08
   ========================================================================== */
const riskSkoru = (r) => r.olasilik * r.etki;
const riskTonu = (skor) => (skor >= 15 ? 'danger' : skor >= 8 ? 'warn' : 'ok');
const riskSinifi = (skor) => (skor >= 15 ? 'Kritik' : skor >= 8 ? 'Yüksek' : skor >= 4 ? 'Orta' : 'Düşük');

function riskEkle(ctx, p, govde) {
  yetkiZorunlu(ctx, 'PRJ-08:olustur');
  const baslik = String(govde.baslik || '').trim();
  const olasilik = Number(govde.olasilik);
  const etki = Number(govde.etki);
  const hatalar = {};
  if (!baslik) hatalar.baslik = ['Risk başlığı girin.'];
  if (!Number.isInteger(olasilik) || olasilik < 1 || olasilik > 5) hatalar.olasilik = ['1–5 arası seçin.'];
  if (!Number.isInteger(etki) || etki < 1 || etki > 5) hatalar.etki = ['1–5 arası seçin.'];
  if (Object.keys(hatalar).length) throw DogrulamaHatasi('Risk bilgileri eksik.', { alanlar: hatalar });
  /* Yüksek ve kritik riskte aksiyon planı zorunludur: "risk kaydettim" demek
     tek başına §12'nin "yalnızca toast" yasağına düşer. */
  if (olasilik * etki >= 8 && !String(govde.aksiyon || '').trim()) {
    throw DogrulamaHatasi('Yüksek ve kritik riskte aksiyon planı zorunludur.',
      { alanlar: { aksiyon: ['Azaltıcı aksiyonu yazın.'] } });
  }
  islem(() => {
    const id = kimlik('proje').replace('prj', 'rsk');
    calistir(`INSERT INTO proje_riski (id, tenant_id, proje_id, baslik, aciklama, olasilik, etki,
                sahip_id, aksiyon, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?, 'acik', ?,?)`,
      id, ctx.tenant.id, p.id, baslik, govde.aciklama || null, olasilik, etki,
      govde.sahipId || null, govde.aksiyon || null, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'proje', nesneId: p.id, eylem: 'risk_eklendi',
      sonraki: { baslik, olasilik, etki, skor: olasilik * etki } });
  });
  return `"${baslik}" riski kaydedildi`;
}

function riskDurumu(ctx, p, govde) {
  yetkiZorunlu(ctx, 'PRJ-08:guncelle');
  const r = tek('SELECT * FROM proje_riski WHERE id = ? AND proje_id = ?', govde.id, p.id);
  if (!r) throw Bulunamadi('Risk bulunamadı.');
  const yeni = govde.yeniDurum;
  if (!RISK_DURUMLARI.some((d) => d.deger === yeni)) throw DogrulamaHatasi('Geçersiz risk durumu.');
  if (yeni === 'kapali' && !String(govde.gerekce || '').trim()) {
    throw DogrulamaHatasi('Risk kapatmak için gerekçe zorunludur.',
      { alanlar: { gerekce: ['Riskin neden ortadan kalktığını yazın.'] } });
  }
  islem(() => {
    surumluGuncelle('proje_riski', r.id, Number(govde.surum), { durum: yeni },
      { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'proje', nesneId: p.id, eylem: `risk:${yeni}`, gerekce: govde.gerekce || null,
      onceki: { durum: r.durum }, sonraki: { durum: yeni, baslik: r.baslik } });
  });
  return `Risk durumu "${yeni}" olarak güncellendi`;
}

function riskSayfasi(ctx, id, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('PRJ-08');
  yetkiZorunlu(ctx, e.yetki);
  const p = projeAl(ctx, id);
  const rota = `/projeler/${p.id}/riskler`;
  const tumu = sorgu('SELECT * FROM proje_riski WHERE proje_id = ?', p.id);
  const filtre = ctx.sorgu.get('durum') || '';
  const satirlar = tumu
    .filter((r) => !filtre || r.durum === filtre)
    .sort((a, b) => riskSkoru(b) - riskSkoru(a));
  const acik = tumu.filter((r) => r.durum !== 'kapali');
  const kritik = acik.filter((r) => riskSkoru(r) >= 15).length;

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${projeBasligi(ctx, p, { bilgiler: [
    { etiket: 'Açık risk', deger: sayi(acik.length) },
    { etiket: 'Kritik risk', deger: sayi(kritik) },
  ] })}
${B.kpiSeridi([
    { etiket: 'Toplam risk', deger: sayi(tumu.length), ikon: 'fa-triangle-exclamation' },
    { etiket: 'Açık', deger: sayi(acik.length), ikon: 'fa-folder-open' },
    { etiket: 'Kritik (skor ≥ 15)', deger: sayi(kritik), ikon: 'fa-fire', ton: kritik ? 'danger' : '' },
    { etiket: 'Ortalama skor', ikon: 'fa-gauge',
      deger: acik.length ? (acik.reduce((a, r) => a + riskSkoru(r), 0) / acik.length).toFixed(1).replace('.', ',') : '—',
      alt: 'olasılık × etki' },
  ])}
${B.filtreBari({ rota, sorgu: ctx.sorgu, aramaYer: 'Risk ara…',
    filtreler: [{ ad: 'durum', etiket: 'Durum', secenekler: RISK_DURUMLARI }] })}
<div class="dash-cols">
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>Risk kaydı</b>
      <span>Skor = olasılık × etki (1–25). Skor 8 ve üstünde aksiyon planı zorunludur.</span></div></div>
    <div class="gc-body flush">${B.tablo({
    satirlar,
    bosDurum: { baslik: 'Risk kaydı yok', ikon: 'fa-triangle-exclamation',
      aciklama: 'Proje kapanışı için tüm risklerin kapatılmış olması gerekir.' },
    sutunlar: [
      { ad: 'baslik', etiket: 'Risk', govde: (r) => h`<b>${r.baslik}</b>${
        r.aciklama ? h`<br><span class="muted">${r.aciklama}</span>` : ''}` },
      { ad: 'olasilik', etiket: 'O', hizala: 'sag' },
      { ad: 'etki', etiket: 'E', hizala: 'sag' },
      { ad: 'skor', etiket: 'Skor', hizala: 'sag',
        govde: (r) => B.isaret(`${riskSkoru(r)} · ${riskSinifi(riskSkoru(r))}`, riskTonu(riskSkoru(r))) },
      { ad: 'sahip_id', etiket: 'Sahip', govde: (r) => kullaniciAdi(r.sahip_id) },
      { ad: 'aksiyon', etiket: 'Aksiyon', govde: (r) => r.aksiyon || '—' },
      { ad: 'durum', etiket: 'Durum', govde: (r) => (yetkiVar(ctx, 'PRJ-08:guncelle') && r.durum !== 'kapali'
        ? h`<form method="post" action="${rota}" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            ${ham(csrfAlani(ctx))}
            <input type="hidden" name="_eylem" value="durum">
            <input type="hidden" name="id" value="${r.id}">
            <input type="hidden" name="surum" value="${r.surum}">
            <input type="text" name="gerekce" placeholder="Gerekçe" aria-label="Gerekçe" style="max-width:130px">
            ${r.durum === 'acik'
    ? h`<button class="btn btn-ghost btn-sm" type="submit" name="yeniDurum" value="izleniyor">İzlemeye al</button>` : ''}
            <button class="btn btn-ghost btn-sm" type="submit" name="yeniDurum" value="kapali">Kapat</button>
          </form>`
        : B.rozet(r.durum === 'kapali' ? 'kapali' : 'beklemede',
          RISK_DURUMLARI.find((d) => d.deger === r.durum)?.etiket)) },
    ],
  })}</div>
  </div>
  <div class="gv-side-stack">
    ${yetkiVar(ctx, 'PRJ-08:olustur') ? B.form({
    rota, csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Risk ekle',
      aciklama: 'Skor 8 ve üstünde (yüksek/kritik) aksiyon planı olmadan kayıt açılmaz.',
      alanlar: h`
      ${B.alan({ ad: 'baslik', etiket: 'Risk', zorunlu: true, genis: true, deger: deger.baslik || '',
      hata: hata?.alanlar?.baslik })}
      ${B.alan({ ad: 'olasilik', etiket: 'Olasılık (1-5)', deger: deger.olasilik || '3', secenekler: OLCEK,
      hata: hata?.alanlar?.olasilik })}
      ${B.alan({ ad: 'etki', etiket: 'Etki (1-5)', deger: deger.etki || '3', secenekler: OLCEK,
      hata: hata?.alanlar?.etki })}
      ${B.alan({ ad: 'sahipId', etiket: 'Risk sahibi', deger: deger.sahipId || '',
      secenekler: [{ deger: '', etiket: 'Seçin…' }, ...kullaniciSecenekleri(ctx)] })}
      ${B.alan({ ad: 'aksiyon', etiket: 'Azaltıcı aksiyon', tur: 'metin', genis: true,
      deger: deger.aksiyon || '', hata: hata?.alanlar?.aksiyon })}
      ${B.alan({ ad: 'aciklama', etiket: 'Açıklama', tur: 'metin', genis: true, deger: deger.aciklama || '' })}` }],
    eylemler: B.btn('Riski kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: p.kod, baslik: p.ad }));
}

/* ==========================================================================
   PRJ-09
   ========================================================================== */
function projeKapanisIslemi(ctx, p, govde) {
  const eylem = govde._eylem;
  if (eylem === 'kapanisa_al') {
    gecisYap(ctx, { nesne: 'proje', tablo: 'proje', kayit: p, eylem: 'kapanisa_al',
      gerekce: govde.gerekce, ekranKodu: 'PRJ-09' });
    return 'Proje kapanışa alındı';
  }
  if (eylem === 'onaya_gonder') {
    const kalan = acikProjeKapanisEngelleri(p.id);
    if (kalan.length) {
      throw GecisIzinsiz(`Kapanış onayına gönderilemez — ${kalan.length} engel açık: `
        + `${kalan.slice(0, 5).map((k) => k.ad).join(', ')}.`);
    }
    const acik = tek(
      `SELECT id FROM onay_talebi WHERE nesne = 'proje_kapanis' AND nesne_id = ? AND durum = 'acik'`, p.id);
    if (acik) throw Cakisma('Bu proje için zaten açık bir kapanış onayı var.');
    onayMotoru.onayaGonder(ctx, {
      nesne: 'proje_kapanis', nesneId: p.id, nesneKod: p.kod,
      baslik: `Proje kapanış onayı: ${p.ad}`, belgeSurum: p.surum,
      projeId: p.id, gerekce: govde.gerekce || null,
    });
    return 'Kapanış onaya gönderildi';
  }
  if (eylem === 'kapat') {
    const onay = tek(
      `SELECT * FROM onay_talebi WHERE nesne = 'proje_kapanis' AND nesne_id = ?
         AND durum = 'kapali' AND sonuc = 'onaylandi' ORDER BY kapandi DESC LIMIT 1`, p.id);
    if (!onay) throw GecisIzinsiz('Kapanış onayı alınmadan proje kapatılamaz.');
    if (Number(onay.belge_surum) !== Number(p.surum)) {
      throw Cakisma(`Kapanış onayı sürüm ${onay.belge_surum} üzerinde verildi; proje kaydı sürüm ${p.surum}. `
        + 'Yeniden onaya gönderin.');
    }
    gecisYap(ctx, { nesne: 'proje', tablo: 'proje', kayit: p, eylem: 'kapat',
      gerekce: govde.gerekce, ekranKodu: 'PRJ-09',
      ekAlanlar: { gercek_bitis: p.gercek_bitis ?? simdi() } });
    return 'Proje kapatıldı';
  }
  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

function projeKapanisSayfasi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('PRJ-09');
  yetkiZorunlu(ctx, e.yetki);
  const p = projeAl(ctx, id);
  const engeller = projeKapanisEngelleri(p.id);
  const kalan = acikProjeKapanisEngelleri(p.id);
  const acikOnay = tek(
    `SELECT * FROM onay_talebi WHERE nesne = 'proje_kapanis' AND nesne_id = ? AND durum = 'acik'`, p.id);
  const onayli = tek(
    `SELECT * FROM onay_talebi WHERE nesne = 'proje_kapanis' AND nesne_id = ?
       AND durum = 'kapali' AND sonuc = 'onaylandi' ORDER BY kapandi DESC LIMIT 1`, p.id);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${projeBasligi(ctx, p)}
${kalan.length
    ? B.sonucSeridi({ tur: 'warn', baslik: `${kalan.length} kapanış engeli açık`,
      aciklama: 'Proje, altındaki şantiyeler kapanmadan ve engeller sıfırlanmadan kapatılamaz (§7).' })
    : B.sonucSeridi({ tur: 'ok', baslik: 'Kapanış engeli kalmadı' })}
<div class="dash-cols">
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>Proje kapanış engelleri</b>
      <span>Sayılar canlı sorgudan gelir; "denetlenmedi" satırları tamamlanmış SAYILMAZ.</span></div></div>
    <div class="gc-body flush">${B.tablo({
    satirlar: engeller,
    bosDurum: { baslik: 'Engel yok' },
    sutunlar: [
      { ad: 'd', etiket: '', govde: (k) => (k.planli ? B.isaret(`${k.planli}'te bağlanacak`, 'danger')
        : (k.adet ?? 0) === 0 ? B.isaret('temiz', 'ok')
        : k.zorunlu ? B.isaret('engel', 'danger') : B.isaret('uyarı', 'warn')) },
      { ad: 'ad', etiket: 'Kalem', govde: (k) => h`<b>${k.ad}</b>${
        k.not ? h`<br><span class="muted">${k.not}</span>` : ''}` },
      { ad: 'adet', etiket: 'Açık', hizala: 'sag', govde: (k) => (k.adet == null ? '—' : sayi(k.adet)) },
      { ad: 'rota', etiket: '', govde: (k) => (k.rota ? B.btn('Aç', { rota: k.rota, kucuk: true }) : '—') },
    ],
  })}</div>
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Kapatma işlemleri</b>
        <span>Kapanış onay zincirinden geçer; "kapalı" durumunu form seçemez.</span></div></div>
      <div class="gc-body">
        ${acikOnay ? B.sonucSeridi({ tur: 'warn', baslik: 'Kapanış onayı bekliyor',
    kayitRota: `/onaylar/${acikOnay.id}` }) : ''}
        ${onayli && p.durum !== 'kapali' ? B.sonucSeridi({ tur: 'ok', baslik: 'Kapanış onaylandı',
    aciklama: `Onay, proje kaydının ${onayli.belge_surum}. sürümü üzerinde verildi.` }) : ''}
        ${p.durum === 'kapali' ? B.sonucSeridi({ tur: 'ok', baslik: 'Proje kapalı' }) : ''}
        ${yetkiVar(ctx, 'PRJ-09:tamamla') && !['kapali', 'arsiv'].includes(p.durum) ? h`
        <form method="post" action="/projeler/${p.id}/kapanis" data-gform="1">
          ${ham(csrfAlani(ctx))}
          ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe', tur: 'metin',
    ipucu: 'Kapatma işleminde gerekçe zorunludur.' })}
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
            ${p.durum === 'aktif'
    ? h`<button class="btn btn-ghost" type="submit" name="_eylem" value="kapanisa_al">
        Kapanışa al <span class="muted">→ kapanışta</span></button>` : ''}
            ${p.durum === 'kapanista' && !acikOnay && !onayli ? (kalan.length
      ? h`<button class="btn btn-ghost" type="button" disabled>
          <i class="fa-solid fa-ban"></i> Kapanış onayına gönder</button>
          <span class="gf-err">${kalan.length} engel açık.</span>`
      : h`<button class="btn btn-acc" type="submit" name="_eylem" value="onaya_gonder">
          Kapanış onayına gönder</button>`) : ''}
            ${p.durum === 'kapanista' && onayli
    ? h`<button class="btn btn-acc" type="submit" name="_eylem" value="kapat">
        Projeyi kapat <span class="muted">→ kapalı</span></button>` : ''}
          </div>
        </form>` : ''}
      </div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: p.kod, baslik: p.ad }));
}

/* ==========================================================================
   PRJ-10 — sürüm ve değişiklik geçmişi (denetim izinden TÜRETİLİR)
   ========================================================================== */
function gecmisSayfasi(ctx, id) {
  const e = ekranNesnesi('PRJ-10');
  yetkiZorunlu(ctx, e.yetki);
  const p = projeAl(ctx, id);

  /* Projenin kendisi + doğrudan bağlı nesnelerin denetim izi tek akışta. */
  const kayitlar = sorgu(
    `SELECT * FROM denetim_izi
      WHERE tenant_id = ? AND (
        (nesne = 'proje' AND nesne_id = ?)
        OR (nesne = 'santiye' AND nesne_id IN (SELECT id FROM santiye WHERE proje_id = ?))
        OR (nesne = 'is_programi' AND nesne_id IN (SELECT id FROM is_programi WHERE proje_id = ?))
      )
      ORDER BY zaman DESC`, ctx.tenant.id, p.id, p.id, p.id);

  const tur = ctx.sorgu.get('nesne') || '';
  const suzulmus = tur ? kayitlar.filter((k) => k.nesne === tur) : kayitlar;
  const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
  const satirlar = suzulmus.slice(atla, atla + boyut);
  const programSurumleri = sorgu(
    `SELECT * FROM is_programi WHERE proje_id = ? ORDER BY kod, surum_no DESC`, p.id);

  const icerik = h`
${projeBasligi(ctx, p, { bilgiler: [{ etiket: 'Denetim kaydı', deger: sayi(kayitlar.length) }] })}
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>İş programı sürümleri</b>
    <span>Onaylı baz çizgi yerinde değişmez; her revizyon yeni sürüm satırıdır (kural 6).</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: programSurumleri,
    satirRota: (r) => `/is-programlari/${r.id}`,
    bosDurum: { baslik: 'İş programı yok', ikon: 'fa-timeline' },
    sutunlar: [
      { ad: 'kod', etiket: 'Program', govde: (r) => h`<b>${r.kod}</b> <span class="muted">s.${r.surum_no}</span>` },
      { ad: 'ad', etiket: 'Ad' },
      { ad: 'baz_cizgi', etiket: 'Baz çizgi', govde: (r) => (r.baz_cizgi
        ? B.isaret(tarih(r.baz_cizgi_tarih), 'ok') : h`<span class="muted">açık</span>`) },
      { ad: 'revizyon_gerekcesi', etiket: 'Revizyon gerekçesi', govde: (r) => r.revizyon_gerekcesi || '—' },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
    ],
  })}</div>
</div>
${B.listeDuzeni({
    filtre: B.filtreBari({ rota: `/projeler/${p.id}/gecmis`, sorgu: ctx.sorgu, aramaYer: 'Ara…',
      filtreler: [{ ad: 'nesne', etiket: 'Kayıt türü', secenekler: [
        { deger: 'proje', etiket: 'Proje' }, { deger: 'santiye', etiket: 'Şantiye' },
        { deger: 'is_programi', etiket: 'İş programı' }] }] }),
    icerik: B.tablo({
      satirlar,
      bosDurum: { baslik: 'Değişiklik kaydı yok', ikon: 'fa-clock-rotate-left' },
      sutunlar: [
        { ad: 'zaman', etiket: 'Zaman', govde: (r) => tarihSaat(r.zaman) },
        { ad: 'nesne', etiket: 'Kayıt', govde: (r) => h`${r.nesne}<br><span class="muted">${r.nesne_id}</span>` },
        { ad: 'eylem', etiket: 'Eylem', govde: (r) => h`<b>${r.eylem}</b>` },
        { ad: 'kullanici_id', etiket: 'Kullanıcı', govde: (r) => kullaniciAdi(r.kullanici_id) },
        { ad: 'gerekce', etiket: 'Gerekçe', govde: (r) => r.gerekce || '—' },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: `/projeler/${p.id}/gecmis`, sorgu: ctx.sorgu,
      sayfa, boyut, toplam: suzulmus.length }),
    veriZamani: simdi(),
  })}`;
  return html(ctx, 200, ciz(ctx, e, icerik, { kayitEtiketi: p.kod, baslik: p.ad }));
}

/* ==========================================================================
   GLB-08 — birleşik takvim
   ========================================================================== */
function takvimSayfasi(ctx) {
  const e = ekranNesnesi('GLB-08');
  yetkiZorunlu(ctx, e.yetki);
  const t = ctx.tenant.id;
  const ay = ctx.sorgu.get('ay') || gunAnahtari(simdi()).slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ay)) throw DogrulamaHatasi('Dönem YYYY-AA biçiminde olmalı.');
  const bas = gunBaslangici(`${ay}-01`);
  const [yil, aySayi] = ay.split('-').map(Number);
  const sonrakiAy = aySayi === 12 ? `${yil + 1}-01` : `${yil}-${String(aySayi + 1).padStart(2, '0')}`;
  const son = gunBaslangici(`${sonrakiAy}-01`);
  const santiyeId = ctx.sorgu.get('santiye_id') || '';
  const turSuzgeci = ctx.sorgu.get('tur') || '';

  const sk = santiyeId ? 'AND santiye_id = ?' : '';
  const sp = santiyeId ? [santiyeId] : [];

  /* Takvim kendi kaydını TUTMAZ: kaynak modüllerden birleştirir (kural 4). */
  const olaylar = [
    ...sorgu(`SELECT id, kod, baslik, termin AS zaman, durum FROM gorev
               WHERE tenant_id = ? AND termin >= ? AND termin < ? ${sk}`, t, bas, son, ...sp)
      .map((r) => ({ ...r, tur: 'gorev', etiket: 'Görev', rota: `/gorevler/${r.id}`, ikon: 'fa-list-check' })),
    ...sorgu(`SELECT id, kod, baslik, termin AS zaman, durum FROM is_emri
               WHERE tenant_id = ? AND termin >= ? AND termin < ? ${sk}`, t, bas, son, ...sp)
      .map((r) => ({ ...r, tur: 'is_emri', etiket: 'İş emri', rota: `/is-emirleri/${r.id}`, ikon: 'fa-screwdriver-wrench' })),
    ...sorgu(`SELECT id, kod, baslik, baslangic AS zaman, durum FROM toplanti
               WHERE tenant_id = ? AND baslangic >= ? AND baslangic < ? ${sk}`, t, bas, son, ...sp)
      .map((r) => ({ ...r, tur: 'toplanti', etiket: 'Toplantı', rota: `/toplantilar/${r.id}`, ikon: 'fa-users-rectangle' })),
    ...sorgu(`SELECT a.id, a.kod, a.ad AS baslik, a.bitis AS zaman, p.durum FROM aktivite a
               JOIN is_programi p ON p.id = a.program_id
              WHERE a.tenant_id = ? AND a.bitis >= ? AND a.bitis < ?
                ${santiyeId ? 'AND p.santiye_id = ?' : ''}`, t, bas, son, ...sp)
      .map((r) => ({ ...r, tur: 'aktivite', etiket: 'Aktivite bitişi', rota: '/is-programlari', ikon: 'fa-timeline' })),
    ...sorgu(`SELECT b.id, b.ad AS baslik, b.gecerlilik AS zaman, b.durum, s.kod FROM santiye_belgesi b
               JOIN santiye s ON s.id = b.santiye_id
              WHERE b.tenant_id = ? AND b.gecerlilik >= ? AND b.gecerlilik < ? AND b.durum <> 'iptal'
                ${santiyeId ? 'AND b.santiye_id = ?' : ''}`, t, bas, son, ...sp)
      .map((r) => ({ ...r, tur: 'belge', etiket: 'Belge geçerlilik bitişi',
        rota: '/santiyeler', ikon: 'fa-file-shield' })),
    ...sorgu(`SELECT id, ad AS baslik, tarih AS zaman, durum FROM isg_egitimi
               WHERE tenant_id = ? AND tarih >= ? AND tarih < ? ${sk}`, t, bas, son, ...sp)
      .map((r) => ({ ...r, kod: '', tur: 'egitim', etiket: 'İSG eğitimi',
        rota: `/isg/egitimler/${r.id}`, ikon: 'fa-graduation-cap' })),
  ].filter((o) => !turSuzgeci || o.tur === turSuzgeci)
    .sort((a, b) => a.zaman - b.zaman);

  /* Ay ızgarası — pazartesi başlangıçlı, sunucuda kurulur. */
  const gunSayisi = Math.round((son - bas) / GUN_MS);
  const ilkGunIndeks = (new Date(bas).getUTCDay() + 6) % 7;
  const gunler = [];
  for (let i = 0; i < ilkGunIndeks; i++) gunler.push(null);
  for (let g = 0; g < gunSayisi; g++) {
    const gunBas = bas + g * GUN_MS;
    gunler.push({ gun: g + 1, bas: gunBas,
      olaylar: olaylar.filter((o) => o.zaman >= gunBas && o.zaman < gunBas + GUN_MS) });
  }
  const oncekiAy = aySayi === 1 ? `${yil - 1}-12` : `${yil}-${String(aySayi - 1).padStart(2, '0')}`;
  const bugun = gunAnahtari(simdi());

  const icerik = h`
${B.kpiSeridi([
    { etiket: 'Bu ay kayıt', deger: sayi(olaylar.length), ikon: 'fa-calendar-days' },
    { etiket: 'Görev termini', deger: sayi(olaylar.filter((o) => o.tur === 'gorev').length), ikon: 'fa-list-check' },
    { etiket: 'Toplantı', deger: sayi(olaylar.filter((o) => o.tur === 'toplanti').length), ikon: 'fa-users-rectangle' },
    { etiket: 'Belge bitişi', deger: sayi(olaylar.filter((o) => o.tur === 'belge').length),
      ikon: 'fa-file-shield', ton: olaylar.some((o) => o.tur === 'belge') ? 'warn' : '' },
  ])}
${B.filtreBari({ rota: '/takvim', sorgu: ctx.sorgu, aramaYer: 'Ara…',
    filtreler: [
      { ad: 'tur', etiket: 'Tür', secenekler: [
        { deger: 'gorev', etiket: 'Görev' }, { deger: 'is_emri', etiket: 'İş emri' },
        { deger: 'toplanti', etiket: 'Toplantı' }, { deger: 'aktivite', etiket: 'Aktivite' },
        { deger: 'belge', etiket: 'Belge' }, { deger: 'egitim', etiket: 'Eğitim' }] },
      { ad: 'santiye_id', etiket: 'Şantiye', secenekler: santiyeSecenekleri(ctx) },
    ] })}
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head">
    <div class="gc-title"><b>${ay}</b>
      <span>Takvim kendi kaydını tutmaz; görev, iş emri, toplantı, aktivite, belge ve eğitim
        kayıtlarını birleştirir (kural 4).</span></div>
    <div style="display:flex;gap:8px">
      ${B.btn('◀ Önceki', { rota: `/takvim?ay=${oncekiAy}`, kucuk: true })}
      ${B.btn('Bugün', { rota: '/takvim', kucuk: true })}
      ${B.btn('Sonraki ▶', { rota: `/takvim?ay=${sonrakiAy}`, kucuk: true })}
    </div>
  </div>
  <div class="gc-body">
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px">
      ${['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((g) =>
    h`<div class="gv-cap-sm" style="text-align:center;padding:4px 0">${g}</div>`)}
      ${gunler.map((g) => (g === null
    ? h`<div></div>`
    : h`<div style="border:1px solid var(--gv-border-dark,#1F2740);border-radius:8px;padding:6px;min-height:74px;${
      ham(gunAnahtari(g.bas) === bugun ? 'outline:2px solid var(--acc, #0E8C6D)' : '')}">
        <div class="gv-cap-sm" style="opacity:.7">${g.gun}</div>
        ${g.olaylar.slice(0, 3).map((o) => h`<div style="font-size:11px;line-height:1.5;margin-top:2px">
          <a href="${o.rota}" title="${o.etiket}: ${o.baslik}">
            <i class="fa-solid ${ham(o.ikon)}"></i> ${String(o.baslik).slice(0, 18)}</a></div>`)}
        ${g.olaylar.length > 3 ? h`<div class="muted" style="font-size:11px">+${g.olaylar.length - 3} kayıt</div>` : ''}
      </div>`))}
    </div>
  </div>
</div>
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Ay listesi</b>
    <span>Aynı veri liste biçiminde; mobilde ve yazdırmada kullanılan görünüm.</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: olaylar,
    satirRota: (r) => r.rota,
    bosDurum: { baslik: 'Bu ay kayıt yok', ikon: 'fa-calendar-days',
      aciklama: 'Görev termini, toplantı, aktivite bitişi ve belge süresi burada birleşir.' },
    sutunlar: [
      { ad: 'zaman', etiket: 'Tarih', govde: (r) => tarih(r.zaman) },
      { ad: 'etiket', etiket: 'Tür', govde: (r) => B.isaret(r.etiket, r.tur === 'belge' ? 'warn' : 'info') },
      { ad: 'baslik', etiket: 'Kayıt', govde: (r) => h`<b>${r.baslik}</b>${
        r.kod ? h`<br><span class="muted">${r.kod}</span>` : ''}` },
      { ad: 'durum', etiket: 'Durum', govde: (r) => (r.durum ? B.rozet(r.durum) : '—') },
    ],
  })}</div>
</div>
${B.veriTarihi(simdi())}`;
  return html(ctx, 200, ciz(ctx, e, icerik));
}

/** Proje kapanış onayı sonuçlandığında denetim izine yazılır (durumu motor yazmaz). */
export function projeKapanisOnaySonucu(ctx, projeId, sonuc) {
  const p = tek('SELECT * FROM proje WHERE id = ?', projeId);
  if (!p) return;
  audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
    nesne: 'proje', nesneId: projeId, eylem: `kapanis_onayi:${sonuc}`,
    sonraki: { belgeSurum: p.surum, durum: p.durum } });
}
