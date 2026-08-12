/* ============================================================================
   HR-06 — İŞTEN AYRILIŞ SİHİRBAZI
   ----------------------------------------------------------------------------
   §7 zorunlu bağ: "Personel işten ayrılış → Kart, zimmet, erişim, puantaj:
   AÇIK ENGELLER KAPANMADAN SÜREÇ TAMAMLANMAZ."
   §6.3 son cümle: "İşten ayrılış sihirbazı KİŞİYE BAĞLI KARTLARI DONDURMADAN
   tamamlanamaz."

   Bu ekran, şantiye ve proje kapanış sihirbazlarıyla aynı ilkeyi izler
   (`moduller/santiye/kapanis.mjs`): engel listesi TEK yerde hesaplanır, hem
   ekran hem geçiş ön koşulu onu kullanır. Kullanıcı hiçbir adımı elle "tamam"
   işaretleyemez — her satır gerçek kayıttan doğrulanır.

   Kartlar burada YALNIZCA DONDURULUR (geçici bloke), iptal edilmez: bakiye
   iadesi ve kapanış ayrı bir karardır ve kart ekranından yürür.
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { simdi, tarih, gunAnahtari, gunBaslangici } from '../cekirdek/zaman.mjs';
import { Para } from '../cekirdek/para.mjs';
import { DogrulamaHatasi, GecisIzinsiz, UygulamaHatasi } from '../cekirdek/hata.mjs';
import * as kartDefteri from '../moduller/kartlar/defter.mjs';
import { gecmisKarti } from './kayit-modulu.mjs';
import {
  ekranNesnesi, hataNesnesi, ciz, kaydiAl,
  B, h, ham, sayi, csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar,
  sorgu, tek, calistir, islem, audit, gecisYap,
} from './ortak.mjs';

const para = (minor, birim = 'TRY') => (minor == null ? '—' : Para.minor(minor, birim || 'TRY').bicim());

/**
 * Ayrılış engelleri — TEK kaynak. Her satır gerçek sorgudan gelir.
 * `zorunlu: true` olan hiçbir satır kalmadan personel "ayrıldı" olamaz.
 */
export function ayrilisEngelleri(personelId) {
  const p = tek('SELECT * FROM personel WHERE id = ?', personelId);
  if (!p) return [];

  /* Kişiye bağlı AKTİF kart atamaları (§6.3). */
  const kartlar = sorgu(
    `SELECT k.id, k.kod, k.maskeli_no, k.durum, a.id AS atama_id, s.ad AS saglayici_ad
       FROM kart_atamasi a
       JOIN kart k ON k.id = a.kart_id
       JOIN saglayici_hesabi h ON h.id = k.hesap_id
       JOIN kart_saglayici s ON s.id = h.saglayici_id
      WHERE a.personel_id = ? AND a.durum = 'aktif'`, personelId);
  /* Dondurulmamış = hâlâ harcama yapılabilir durumda olan kart. */
  const canliKart = kartlar.filter((k) => !['gecici_bloke', 'kayip_calinti', 'iptal', 'arsiv'].includes(k.durum));
  const bakiyeliKart = kartlar.map((k) => ({ ...k, bakiye: kartDefteri.bakiye(k.id) }))
    .filter((k) => k.bakiye !== 0);

  const acikZimmet = sorgu(
    `SELECT z.id, v.kod, v.ad FROM zimmet z JOIN varlik v ON v.id = z.varlik_id
      WHERE z.personel_id = ? AND z.durum = 'zimmetli'`, personelId);
  const acikAtama = Number(tek(
    `SELECT COUNT(*) AS n FROM personel_atama WHERE personel_id = ? AND durum = 'aktif'`,
    personelId)?.n ?? 0);
  const mahsupsuzAvans = sorgu(
    `SELECT kod, tutar_minor, tutar_birim FROM avans
      WHERE personel_id = ? AND durum = 'onaylandi' AND (mahsup_edildi IS NULL OR mahsup_edildi = 0)`, personelId);
  const acikIzin = Number(tek(
    `SELECT COUNT(*) AS n FROM izin WHERE personel_id = ?
       AND durum IN ('taslak','onaya_gonderildi','incelemede','revizyon_istendi')`, personelId)?.n ?? 0);
  const kilitsizPuantaj = Number(tek(
    `SELECT COUNT(*) AS n FROM puantaj WHERE personel_id = ? AND kilit = 0`, personelId)?.n ?? 0);
  const acikGorev = Number(tek(
    `SELECT COUNT(*) AS n FROM gorev g
      WHERE g.sorumlu_id = (SELECT kullanici_id FROM personel WHERE id = ?)
        AND g.durum NOT IN ('tamamlandi','iptal')`, personelId)?.n ?? 0);
  const kullanici = p.kullanici_id
    ? tek(`SELECT * FROM kullanici WHERE id = ? AND durum = 'aktif'`, p.kullanici_id) : null;
  const acikOturum = kullanici ? Number(tek(
    `SELECT COUNT(*) AS n FROM oturum WHERE kullanici_id = ? AND sonlandirildi IS NULL`,
    kullanici.id)?.n ?? 0) : 0;

  return [
    { ad: 'Kişiye bağlı kartlar donduruldu', adet: canliKart.length, zorunlu: true,
      not: canliKart.length
        ? canliKart.map((k) => `${k.kod} (${k.saglayici_ad}, ${k.durum})`).join(' · ')
        : kartlar.length ? `${kartlar.length} kart dondurulmuş.` : 'Kişiye bağlı kart yok.',
      rota: '/kartlar/liste', eylem: canliKart.length ? 'kart_dondur' : null },
    { ad: 'Kart bakiyeleri sıfırlandı', adet: bakiyeliKart.length, zorunlu: false,
      not: bakiyeliKart.length
        ? bakiyeliKart.map((k) => `${k.kod}: ${para(k.bakiye)}`).join(' · ')
        : 'Bakiye kalmadı.',
      rota: '/kartlar/hareketler' },
    { ad: 'Kart atamaları kapatıldı', adet: kartlar.length, zorunlu: true,
      not: kartlar.length ? `${kartlar.length} aktif kart ataması var.` : 'Aktif kart ataması yok.',
      rota: '/kartlar/liste', eylem: kartlar.length ? 'kart_iade' : null },
    { ad: 'Zimmet iadesi', adet: acikZimmet.length, zorunlu: true,
      not: acikZimmet.length ? acikZimmet.map((z) => `${z.kod} — ${z.ad}`).join(' · ')
        : 'İade edilmemiş zimmet yok.',
      rota: '/zimmetler' },
    { ad: 'Aktif şantiye ataması', adet: acikAtama, zorunlu: true, rota: '/personel-atamalari' },
    { ad: 'Mahsup edilmemiş avans', adet: mahsupsuzAvans.length, zorunlu: true,
      not: mahsupsuzAvans.length
        ? mahsupsuzAvans.map((a) => `${a.kod}: ${para(a.tutar_minor, a.tutar_birim)}`).join(' · ')
        : 'Açık avans yok.',
      rota: '/avanslar' },
    { ad: 'Karara bağlanmamış izin', adet: acikIzin, zorunlu: true, rota: '/izinler' },
    { ad: 'Kilitlenmemiş puantaj günü', adet: kilitsizPuantaj, zorunlu: true,
      not: kilitsizPuantaj ? 'Puantaj dönemi kapanmadan ayrılış tamamlanamaz.' : 'Tüm günler kilitli.',
      rota: '/puantaj/donem-kapanis' },
    { ad: 'Üzerinde açık görev', adet: acikGorev, zorunlu: true, rota: '/gorevler' },
    { ad: 'Uygulama erişimi kapatıldı', adet: kullanici ? 1 : 0, zorunlu: true,
      not: kullanici ? `${kullanici.eposta} hesabı aktif (${acikOturum} açık oturum).`
        : 'Uygulama hesabı yok veya kapalı.',
      rota: '/ayarlar/kullanicilar', eylem: kullanici ? 'erisim_kapat' : null },
  ];
}

export const acikAyrilisEngelleri = (personelId) => ayrilisEngelleri(personelId)
  .filter((e) => e.zorunlu && (e.adet ?? 0) > 0);

export function ayrilisEngeliMetni(personelId) {
  const kalan = acikAyrilisEngelleri(personelId);
  if (!kalan.length) return null;
  const ozet = kalan.slice(0, 4).map((e) => `${e.ad}: ${e.adet}`).join(' · ');
  return `Ayrılış engeli var (${kalan.length} kalem): ${ozet}${kalan.length > 4 ? ' …' : ''}.`;
}

/* ========================================================================== */
export function kur(y, ekranRota) {
  ekranRota(y, 'HR-06', {
    get: (ctx, _g, params) => ayrilisSayfasi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('HR-06');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      csrfZorunlu(ctx, govde);
      const p = kaydiAl(ctx, 'personel', 'personel', params.id);
      try {
        const mesaj = ayrilisIslemi(ctx, p, govde);
        if (govde._eylem === 'tamamla') {
          return yonlendir(ctx, `/personel/${p.id}?islem=${encodeURIComponent(mesaj)}`);
        }
        return yonlendir(ctx, `/personel/${p.id}/isten-ayrilis?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return ayrilisSayfasi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });
}

function ayrilisSayfasi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('HR-06');
  yetkiZorunlu(ctx, e.yetki);
  const p = kaydiAl(ctx, 'personel', 'personel', id);
  const engeller = ayrilisEngelleri(p.id);
  const kalan = engeller.filter((x) => x.zorunlu && (x.adet ?? 0) > 0);
  const tamamlanabilir = kalan.length === 0 && p.durum !== 'ayrildi';

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${p.durum === 'ayrildi'
    ? B.sonucSeridi({ tur: 'ok', baslik: 'Ayrılış tamamlanmış',
      aciklama: `${p.isten_cikis ? tarih(p.isten_cikis) : '—'} tarihinde kapatıldı.` })
    : kalan.length
      ? B.sonucSeridi({ tur: 'warn', baslik: `${kalan.length} ayrılış engeli açık`,
        aciklama: 'Doküman §7: kart, zimmet, erişim ve puantaj engelleri kapanmadan süreç '
          + 'tamamlanmaz. §6.3: kişiye bağlı kartlar DONDURULMADAN sihirbaz bitmez.' })
      : B.sonucSeridi({ tur: 'ok', baslik: 'Engel yok', aciklama: 'Ayrılış tamamlanabilir.' })}
${B.detayOzetSeridi({
    kod: p.kod, baslik: p.ad_soyad, durum: p.durum, surum: p.surum,
    bilgiler: [
      { etiket: 'Görev', deger: p.gorev || '—' },
      { etiket: 'İşe giriş', deger: p.ise_giris ? tarih(p.ise_giris) : '—' },
      { etiket: 'Açık engel', deger: `${kalan.length}` },
    ],
    digerEylemler: B.btn('Personel kaydına dön', { rota: `/personel/${p.id}` }),
  })}
<div class="dash-cols">
  <div>
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Ayrılış engel listesi</b>
        <span>Her satır gerçek kayıttan doğrulanır; hiçbir adım elle "tamam" işaretlenemez.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: engeller,
    bosDurum: { baslik: 'Engel yok' },
    sutunlar: [
      { ad: 'd', etiket: '', govde: (x) => ((x.adet ?? 0) > 0
        ? B.isaret(x.zorunlu ? 'engel' : 'uyarı', x.zorunlu ? 'danger' : 'warn')
        : B.isaret('temiz', 'ok')) },
      { ad: 'ad', etiket: 'Kalem',
        govde: (x) => h`<b>${x.ad}</b>${x.not ? h`<br><span class="muted">${x.not}</span>` : ''}` },
      { ad: 'adet', etiket: 'Açık', hizala: 'sag', govde: (x) => sayi(x.adet ?? 0) },
      { ad: 'islem', etiket: '', govde: (x) => h`${x.rota
        ? B.btn('Aç', { rota: x.rota, kucuk: true }) : ''}${x.eylem && yetkiVar(ctx, 'HR-06:guncelle')
        ? h`<form method="post" action="/personel/${p.id}/isten-ayrilis" style="display:inline">
            ${ham(csrfAlani(ctx))}<input type="hidden" name="_eylem" value="${x.eylem}">
            <button class="btn btn-ghost btn-sm" type="submit">${
          { kart_dondur: 'Kartları dondur', kart_iade: 'Kart atamalarını kapat',
            erisim_kapat: 'Erişimi kapat' }[x.eylem]}</button></form>` : ''}` },
    ],
  })}</div>
    </div>
    <div style="margin-top:18px">${gecmisKarti('personel', p)}</div>
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Ayrılışı tamamla</b>
        <span>Personel "ayrıldı" durumuna yalnız bu adımla geçer.</span></div></div>
      <div class="gc-body">
        ${tamamlanabilir && yetkiVar(ctx, 'HR-06:guncelle') ? h`
        <form method="post" action="/personel/${p.id}/isten-ayrilis" data-gform="1">
          ${ham(csrfAlani(ctx))}
          <input type="hidden" name="_eylem" value="tamamla">
          ${B.alan({ ad: 'istenCikis', etiket: 'Çıkış tarihi', tur: 'date', zorunlu: true,
    deger: gunAnahtari(simdi()) })}
          ${B.alan({ ad: 'gerekce', etiket: 'Ayrılış gerekçesi', tur: 'metin', zorunlu: true, genis: true })}
          <div style="margin-top:12px">${B.btn('Ayrılışı tamamla',
    { tur: 'acc', gonder: true, ikon: 'fa-user-slash' })}</div>
        </form>`
    : p.durum === 'ayrildi' ? B.isaret('tamamlandı', 'ok')
      : B.sonucSeridi({ tur: 'warn', baslik: 'Tamamlanamaz',
        aciklama: kalan.map((x) => x.ad).join(', ') })}
      </div>
    </div>
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Kartlar neden dondurulur?</b></div></div>
      <div class="gc-body"><p class="gf-hint" style="margin:0">
        §6.3: ayrılış sihirbazı kişiye bağlı kartları dondurmadan tamamlanamaz. Dondurma
        <b>geçici blokedir</b>, iptal değil: kalan bakiyenin iadesi ve kartın kapatılması
        AYRI bir karardır ve kart ekranından yürür. Böylece ayrılış, muhasebesi
        yapılmamış bir bakiyeyi sessizce yok etmez.</p></div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: p.kod, baslik: p.ad_soyad }));
}

function ayrilisIslemi(ctx, p, govde) {
  if (govde._eylem === 'kart_dondur') {
    const kartlar = sorgu(
      `SELECT k.* FROM kart_atamasi a JOIN kart k ON k.id = a.kart_id
        WHERE a.personel_id = ? AND a.durum = 'aktif'
          AND k.durum NOT IN ('gecici_bloke','kayip_calinti','iptal','arsiv')`, p.id);
    if (!kartlar.length) throw GecisIzinsiz('Dondurulacak canlı kart yok.');
    return islem(() => {
      let sayac = 0;
      for (const k of kartlar) {
        /* Yalnız "aktif" karttan geçici bloke geçişi var; diğerleri zaten kapalı. */
        if (k.durum !== 'aktif') continue;
        gecisYap(ctx, { nesne: 'kart', tablo: 'kart', kayit: k, eylem: 'gecici_blokela',
          gerekce: `${p.ad_soyad} işten ayrılış sürecinde — kart donduruldu (§6.3).`,
          ekranKodu: 'HR-06' });
        sayac++;
      }
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'personel', nesneId: p.id, eylem: 'ayrilis:kart_dondur',
        sonraki: { dondurulan: sayac } });
      return `${sayac} kart donduruldu`;
    });
  }

  if (govde._eylem === 'kart_iade') {
    const atamalar = sorgu(
      `SELECT * FROM kart_atamasi WHERE personel_id = ? AND durum = 'aktif'`, p.id);
    if (!atamalar.length) throw GecisIzinsiz('Kapatılacak kart ataması yok.');
    return islem(() => {
      for (const a of atamalar) {
        calistir(`UPDATE kart_atamasi SET durum = 'iade', bitis = ?, iade_notu = ?,
                    guncelleyen = ?, guncellendi = ? WHERE id = ?`,
          simdi(), `${p.ad_soyad} işten ayrılışı`, ctx.kullanici.id, simdi(), a.id);
      }
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'personel', nesneId: p.id, eylem: 'ayrilis:kart_iade',
        sonraki: { kapatilan: atamalar.length } });
      return `${atamalar.length} kart ataması kapatıldı`;
    });
  }

  if (govde._eylem === 'erisim_kapat') {
    if (!p.kullanici_id) throw GecisIzinsiz('Personelin uygulama hesabı yok.');
    const k = tek('SELECT * FROM kullanici WHERE id = ?', p.kullanici_id);
    if (!k || k.durum !== 'aktif') throw GecisIzinsiz('Hesap zaten kapalı.');
    return islem(() => {
      calistir(`UPDATE kullanici SET durum = 'pasif', guncelleyen = ?, guncellendi = ? WHERE id = ?`,
        ctx.kullanici.id, simdi(), k.id);
      /* Açık oturumlar da kapatılır: erişim "kapalı" görünüp açık kalamaz. */
      calistir(`UPDATE oturum SET sonlandirildi = ?, sonlandirma_nedeni = 'isten_ayrilis'
                 WHERE kullanici_id = ? AND sonlandirildi IS NULL`, simdi(), k.id);
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'kullanici', nesneId: k.id, eylem: 'ayrilis:erisim_kapat',
        gerekce: `${p.ad_soyad} işten ayrılışı`, onceki: { durum: k.durum }, sonraki: { durum: 'pasif' } });
      return 'Uygulama erişimi kapatıldı ve açık oturumlar sonlandırıldı';
    });
  }

  if (govde._eylem === 'tamamla') {
    const gerekce = String(govde.gerekce || '').trim();
    if (!gerekce) {
      throw DogrulamaHatasi('Ayrılış gerekçesi zorunludur.', { alanlar: { gerekce: ['Gerekçe girin.'] } });
    }
    if (!govde.istenCikis) {
      throw DogrulamaHatasi('Çıkış tarihi zorunludur.', { alanlar: { istenCikis: ['Tarih girin.'] } });
    }
    /* ENGEL KONTROLÜ — ekranla aynı kaynaktan (tek hesap). */
    const engel = ayrilisEngeliMetni(p.id);
    if (engel) throw GecisIzinsiz(engel);

    return islem(() => {
      gecisYap(ctx, { nesne: 'personel', tablo: 'personel', kayit: p, eylem: 'ayrilis',
        gerekce, ekranKodu: 'HR-06',
        ekAlanlar: { isten_cikis: gunBaslangici(govde.istenCikis) } });
      return 'İşten ayrılış tamamlandı';
    });
  }

  throw DogrulamaHatasi('Bilinmeyen işlem.');
}
