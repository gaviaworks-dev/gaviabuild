/* ============================================================================
   İZİN, AVANS, SAĞLIK VE YETKİNLİK — HR-10..13
   ----------------------------------------------------------------------------
   İzin ve avans FİNANS ETKİLİDİR: ikisi de onay motorundan geçer, avans onayı
   cari/kasa defterine değil AVANS kaydına yazılır ve puantaj dönemine mahsup
   edilir. Sağlık kayıtları (HR-12) ayrı tablo değildir: `yetkinlik` tablosunun
   `tur = 'saglik'` görünümüdür (kural 4).
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, gunAnahtari, gunBaslangici, GUN_MS } from '../cekirdek/zaman.mjs';
import { Para } from '../cekirdek/para.mjs';
import { DogrulamaHatasi, GecisIzinsiz, Bulunamadi, Cakisma, UygulamaHatasi } from '../cekirdek/hata.mjs';
import * as onayMotoru from '../moduller/isakisi/onay.mjs';
import { sayac } from './kayit-modulu.mjs';
import {
  ekranNesnesi, hataNesnesi, kullaniciAdi, ciz, listeSorgusu, filtreKosullari,
  B, h, ham, sayi, csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar, alanMaskeliMi,
  sorgu, tek, calistir, islem, surumluGuncelle, audit, sonrakiKod, gecisYap,
} from './ortak.mjs';

const para = (minor, birim = 'TRY') => (minor == null ? '—' : Para.minor(minor, birim || 'TRY').bicim());
const IZIN_TURLERI = [
  { deger: 'yillik', etiket: 'Yıllık izin' }, { deger: 'ucretsiz', etiket: 'Ücretsiz izin' },
  { deger: 'rapor', etiket: 'Raporlu' }, { deger: 'mazeret', etiket: 'Mazeret' },
  { deger: 'dogum', etiket: 'Doğum' }, { deger: 'babalik', etiket: 'Babalık' },
  { deger: 'olum', etiket: 'Ölüm' },
];
const YETKINLIK_TURLERI = [
  { deger: 'sertifika', etiket: 'Sertifika' }, { deger: 'egitim', etiket: 'Eğitim' },
  { deger: 'saglik', etiket: 'Sağlık raporu' }, { deger: 'ehliyet', etiket: 'Ehliyet/operatör' },
  { deger: 'diger', etiket: 'Diğer' },
];

const personelSecenekleri = (ctx) => sorgu(
  `SELECT id, kod, ad_soyad FROM personel WHERE tenant_id = ? AND durum IN ('aday','aktif','izinli')
    ORDER BY ad_soyad`, ctx.tenant.id).map((p) => ({ deger: p.id, etiket: `${p.kod} — ${p.ad_soyad}` }));

/** Çalışan rolü YALNIZ kendi kaydını görür (ABAC kendi_kaydi kuralı). */
function kendiPersoneli(ctx) {
  return tek('SELECT * FROM personel WHERE tenant_id = ? AND kullanici_id = ?',
    ctx.tenant.id, ctx.kullanici.id);
}
const yalnizKendisi = (ctx) => (ctx.yetkiler?.kurallar || [])
  .some((k) => k.kural === 'kendi_kaydi');

export function kur(y, ekranRota) {
  /* ================= HR-10 İzin talepleri ============================== */
  ekranRota(y, 'HR-10', {
    get: (ctx) => izinSayfasi(ctx),
    post: (ctx, govde) => {
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = izinIslemi(ctx, govde);
        return yonlendir(ctx, `/izinler?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return izinSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= HR-11 Avans talepleri ============================= */
  ekranRota(y, 'HR-11', {
    get: (ctx) => avansSayfasi(ctx),
    post: (ctx, govde) => {
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = avansIslemi(ctx, govde);
        return yonlendir(ctx, `/avanslar?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return avansSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= HR-12 / HR-13 Sağlık ve yetkinlik ================= */
  for (const [kod, tur] of [['HR-12', 'saglik'], ['HR-13', null]]) {
    ekranRota(y, kod, {
      get: (ctx) => yetkinlikSayfasi(ctx, kod, tur),
      post: (ctx, govde) => {
        const e = ekranNesnesi(kod);
        yetkiZorunlu(ctx, `${e.kod}:olustur`);
        csrfZorunlu(ctx, govde);
        try {
          const mesaj = govde._eylem === 'iptal' ? yetkinlikIptal(ctx, kod, govde)
            : yetkinlikEkle(ctx, kod, govde, tur);
          return yonlendir(ctx, `${e.rota}?islem=${encodeURIComponent(mesaj)}`);
        } catch (err) {
          if (!(err instanceof UygulamaHatasi)) throw err;
          return yetkinlikSayfasi(ctx, kod, tur, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
        }
      },
    });
  }
}

/* ==========================================================================
   HR-10 izin
   ========================================================================== */
function izinIslemi(ctx, govde) {
  if (!govde._eylem || govde._eylem === 'ac') {
    yetkiZorunlu(ctx, 'HR-10:olustur');
    /* Çalışan yalnız KENDİ izin talebini açar. */
    const kendi = kendiPersoneli(ctx);
    const personelId = yalnizKendisi(ctx) ? kendi?.id : (govde.personelId || kendi?.id);
    const p = personelId
      ? tek('SELECT * FROM personel WHERE id = ? AND tenant_id = ?', personelId, ctx.tenant.id) : null;
    if (!p) {
      throw DogrulamaHatasi(yalnizKendisi(ctx)
        ? 'Kullanıcı hesabınıza bağlı personel kaydı yok; İK ile iletişime geçin.'
        : 'Personel seçin.', { alanlar: { personelId: ['Personel bulunamadı.'] } });
    }
    if (!IZIN_TURLERI.some((t) => t.deger === govde.tur)) {
      throw DogrulamaHatasi('İzin türü seçin.', { alanlar: { tur: ['Tür seçin.'] } });
    }
    if (!govde.baslangic || !govde.bitis) {
      throw DogrulamaHatasi('Başlangıç ve bitiş tarihi zorunludur.',
        { alanlar: { baslangic: ['Tarih girin.'], bitis: ['Tarih girin.'] } });
    }
    const bas = gunBaslangici(govde.baslangic);
    const bitis = gunBaslangici(govde.bitis);
    if (bitis < bas) {
      throw DogrulamaHatasi('Bitiş başlangıçtan önce olamaz.', { alanlar: { bitis: ['Tarih aralığı geçersiz.'] } });
    }
    /* Gün sayısı tarih aralığından HESAPLANIR; kullanıcı yazmaz. */
    const gun = Math.round((bitis - bas) / GUN_MS) + 1;
    /* Aynı personelin çakışan izni olamaz. */
    const cakisan = sorgu(
      `SELECT * FROM izin WHERE personel_id = ? AND durum NOT IN ('reddedildi','iptal')
         AND baslangic <= ? AND bitis >= ?`, p.id, bitis, bas)[0];
    if (cakisan) {
      throw Cakisma(`${p.ad_soyad} için ${tarih(cakisan.baslangic)}–${tarih(cakisan.bitis)} `
        + `aralığında ${cakisan.kod} izin kaydı zaten var.`);
    }

    return islem(() => {
      const kod = sonrakiKod(ctx.tenant.id, 'izin');
      const id = kimlik('izin');
      calistir(`INSERT INTO izin (id, tenant_id, personel_id, kod, tur, baslangic, bitis, gun_sayisi,
                  gerekce, vekil_id, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?,?,?, 'taslak', ?,?)`,
        id, ctx.tenant.id, p.id, kod, govde.tur, bas, bitis, gun,
        govde.gerekce || null, govde.vekilId || null, ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'izin', nesneId: id, eylem: 'olustur',
        sonraki: { kod, personel: p.kod, tur: govde.tur, gun } });
      return `${kod} izin talebi açıldı (${gun} gün)`;
    });
  }

  const iz = tek('SELECT * FROM izin WHERE id = ? AND tenant_id = ?', govde.izinId, ctx.tenant.id);
  if (!iz) throw Bulunamadi('İzin talebi bulunamadı.');
  if (yalnizKendisi(ctx) && iz.olusturan !== ctx.kullanici.id) {
    throw GecisIzinsiz('Yalnız kendi izin talebinizi işleyebilirsiniz.');
  }
  yetkiZorunlu(ctx, 'HR-10:guncelle');

  if (govde._eylem === 'onaya_gonder') {
    const p = tek('SELECT * FROM personel WHERE id = ?', iz.personel_id);
    islem(() => {
      onayMotoru.onayaGonder(ctx, {
        nesne: 'izin', nesneId: iz.id, nesneKod: iz.kod,
        baslik: `İzin talebi: ${p?.ad_soyad || ''} (${iz.gun_sayisi} gün)`,
        belgeSurum: iz.surum, gerekce: govde.gerekce || null,
      });
      gecisYap(ctx, { nesne: 'izin', tablo: 'izin', kayit: iz, eylem: 'onaya_gonder',
        gerekce: govde.gerekce, ekranKodu: 'HR-10' });
    });
    return 'İzin talebi onaya gönderildi';
  }
  if (['geri_cek', 'iptal_et'].includes(govde._eylem)) {
    gecisYap(ctx, { nesne: 'izin', tablo: 'izin', kayit: iz, eylem: govde._eylem,
      gerekce: govde.gerekce, ekranKodu: 'HR-10' });
    return 'İzin talebi durumu güncellendi';
  }
  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

function izinSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('HR-10');
  yetkiZorunlu(ctx, e.yetki);
  const kendi = yalnizKendisi(ctx) ? kendiPersoneli(ctx) : null;
  const kosullar = ['i.tenant_id = ?']; const parametreler = [ctx.tenant.id];
  if (yalnizKendisi(ctx)) { kosullar.push('i.olusturan = ?'); parametreler.push(ctx.kullanici.id); }
  if (ctx.sorgu.get('durum')) { kosullar.push('i.durum = ?'); parametreler.push(ctx.sorgu.get('durum')); }
  if (ctx.sorgu.get('tur')) { kosullar.push('i.tur = ?'); parametreler.push(ctx.sorgu.get('tur')); }
  const q = (ctx.sorgu.get('q') || '').trim();
  if (q) { kosullar.push('(p.ad_soyad LIKE ? OR i.kod LIKE ?)'); parametreler.push(`%${q}%`, `%${q}%`); }

  const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
  const nerede = kosullar.join(' AND ');
  const toplam = Number(tek(
    `SELECT COUNT(*) AS n FROM izin i JOIN personel p ON p.id = i.personel_id WHERE ${nerede}`,
    ...parametreler)?.n ?? 0);
  const satirlar = sorgu(
    `SELECT i.*, p.ad_soyad, p.kod AS personel_kod FROM izin i
       JOIN personel p ON p.id = i.personel_id
      WHERE ${nerede} ORDER BY i.baslangic DESC LIMIT ? OFFSET ?`, ...parametreler, boyut, atla);
  const suradaIzinli = sorgu(
    `SELECT i.*, p.ad_soyad FROM izin i JOIN personel p ON p.id = i.personel_id
      WHERE i.tenant_id = ? AND i.durum = 'onaylandi' AND i.baslangic <= ? AND i.bitis >= ?`,
    ctx.tenant.id, simdi(), simdi());

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${yalnizKendisi(ctx) ? B.sonucSeridi({ tur: 'ok', baslik: 'Kendi kayıtlarınız',
    aciklama: 'Bu ekranda yalnız sizin izin talepleriniz görünür (veri kapsamı kuralı).' }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Onay bekleyen', ikon: 'fa-hourglass-half',
        deger: sayi(sayac(ctx.tenant.id, 'izin', `durum IN ('onaya_gonderildi','incelemede')`)) },
      { etiket: 'Şu an izinde', deger: sayi(suradaIzinli.length), ikon: 'fa-umbrella-beach',
        alt: suradaIzinli.slice(0, 3).map((x) => x.ad_soyad).join(', ') || null },
      { etiket: 'Onaylı gün (bu yıl)', ikon: 'fa-calendar-check', deger: sayi(Number(tek(
        `SELECT COALESCE(SUM(gun_sayisi),0) AS n FROM izin WHERE tenant_id = ? AND durum = 'onaylandi'
           AND baslangic >= ?`, ctx.tenant.id,
        gunBaslangici(`${new Date(simdi()).getUTCFullYear()}-01-01`))?.n ?? 0)) },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ]),
    filtre: B.filtreBari({ rota: '/izinler', sorgu: ctx.sorgu, aramaYer: 'Personel veya kod…',
      filtreler: [
        { ad: 'tur', etiket: 'Tür', secenekler: IZIN_TURLERI },
        { ad: 'durum', etiket: 'Durum', secenekler: ['taslak', 'onaya_gonderildi', 'incelemede',
          'onaylandi', 'reddedildi'].map((d) => ({ deger: d, etiket: d })) },
      ] }),
    icerik: B.tablo({
      satirlar,
      bosDurum: { baslik: 'İzin talebi yok', ikon: 'fa-umbrella-beach',
        aciklama: 'Gün sayısı tarih aralığından hesaplanır; çakışan izin kabul edilmez.' },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'ad_soyad', etiket: 'Personel', govde: (r) => h`<a href="/personel/${r.personel_id}">
          <b>${r.ad_soyad}</b></a><br><span class="muted">${r.personel_kod}</span>` },
        { ad: 'tur', etiket: 'Tür', govde: (r) => IZIN_TURLERI.find((t) => t.deger === r.tur)?.etiket || r.tur },
        { ad: 'baslangic', etiket: 'Aralık',
          govde: (r) => h`${tarih(r.baslangic)} → ${tarih(r.bitis)}` },
        { ad: 'gun_sayisi', etiket: 'Gün', hizala: 'sag', govde: (r) => h`<b>${r.gun_sayisi}</b>` },
        { ad: 'vekil_id', etiket: 'Vekil', govde: (r) => (r.vekil_id
          ? tek('SELECT ad_soyad FROM personel WHERE id = ?', r.vekil_id)?.ad_soyad || '—' : '—') },
        { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
        { ad: 'islem', etiket: '', govde: (r) => (r.durum !== 'taslak' || !yetkiVar(ctx, 'HR-10:guncelle') ? '—'
          : h`<form method="post" action="/izinler" style="display:inline">${ham(csrfAlani(ctx))}
              <input type="hidden" name="_eylem" value="onaya_gonder">
              <input type="hidden" name="izinId" value="${r.id}">
              <button class="btn btn-acc btn-sm" type="submit">Onaya gönder</button></form>`) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: '/izinler', sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'HR-10:olustur') ? B.form({
    rota: '/izinler', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni izin talebi',
      aciklama: 'Gün sayısı tarih aralığından HESAPLANIR. Talep taslak açılır; onaycıyı siz seçmezsiniz.',
      alanlar: h`
      ${yalnizKendisi(ctx)
    ? h`<div class="gfield full"><span class="gf-hint">Talep sizin adınıza açılır:
        <b>${kendi?.ad_soyad || 'personel kaydı yok'}</b></span></div>`
    : B.alan({ ad: 'personelId', etiket: 'Personel', zorunlu: true, deger: deger.personelId || '',
      hata: hata?.alanlar?.personelId,
      secenekler: [{ deger: '', etiket: 'Seçin…' }, ...personelSecenekleri(ctx)] })}
      ${B.alan({ ad: 'tur', etiket: 'İzin türü', zorunlu: true, deger: deger.tur || 'yillik',
    hata: hata?.alanlar?.tur, secenekler: IZIN_TURLERI })}
      ${B.alan({ ad: 'baslangic', etiket: 'Başlangıç', tur: 'date', zorunlu: true,
    deger: deger.baslangic || '', hata: hata?.alanlar?.baslangic })}
      ${B.alan({ ad: 'bitis', etiket: 'Bitiş', tur: 'date', zorunlu: true,
    deger: deger.bitis || '', hata: hata?.alanlar?.bitis })}
      ${B.alan({ ad: 'vekilId', etiket: 'Vekil', deger: deger.vekilId || '',
    secenekler: [{ deger: '', etiket: 'Yok' }, ...personelSecenekleri(ctx)] })}
      ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe', tur: 'metin', genis: true, deger: deger.gerekce || '' })}` }],
    eylemler: B.btn('Talebi aç', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/* ==========================================================================
   HR-11 avans
   ========================================================================== */
function avansIslemi(ctx, govde) {
  if (!govde._eylem || govde._eylem === 'ac') {
    yetkiZorunlu(ctx, 'HR-11:olustur');
    const kendi = kendiPersoneli(ctx);
    const personelId = yalnizKendisi(ctx) ? kendi?.id : (govde.personelId || kendi?.id);
    const p = personelId
      ? tek('SELECT * FROM personel WHERE id = ? AND tenant_id = ?', personelId, ctx.tenant.id) : null;
    if (!p) {
      throw DogrulamaHatasi('Personel seçin.', { alanlar: { personelId: ['Personel bulunamadı.'] } });
    }
    if (p.durum !== 'aktif') throw GecisIzinsiz('Yalnız AKTİF personel avans talebi açabilir.');
    const tutar = Para.ayristir(govde.tutar || '', ctx.tenant.para_birimi);
    if (tutar.minor <= 0n) {
      throw DogrulamaHatasi('Tutar sıfırdan büyük olmalı.', { alanlar: { tutar: ['Tutar girin.'] } });
    }
    /* Mahsup edilmemiş avansı olan personel yeni avans alamaz. */
    const acik = tek(
      `SELECT * FROM avans WHERE personel_id = ? AND durum = 'onaylandi' AND mahsup_edildi IS NULL`, p.id);
    if (acik) {
      throw Cakisma(`${p.ad_soyad} için mahsup edilmemiş avans var (${acik.kod}); önce mahsup edilmeli.`);
    }
    const mahsupDonem = String(govde.mahsupDonem || '').trim()
      || gunAnahtari(simdi() + 30 * GUN_MS).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mahsupDonem)) {
      throw DogrulamaHatasi('Mahsup dönemi YYYY-AA biçiminde olmalı.',
        { alanlar: { mahsupDonem: ['Örn. 2026-10'] } });
    }

    return islem(() => {
      const kod = sonrakiKod(ctx.tenant.id, 'avans');
      const id = kimlik('avans');
      calistir(`INSERT INTO avans (id, tenant_id, personel_id, kod, tutar_minor, tutar_birim,
                  gerekce, mahsup_donem, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?, 'taslak', ?,?)`,
        id, ctx.tenant.id, p.id, kod, String(tutar.minor), tutar.birim,
        govde.gerekce || null, mahsupDonem, ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'avans', nesneId: id, eylem: 'olustur',
        sonraki: { kod, personel: p.kod, tutarMinor: String(tutar.minor), mahsupDonem } });
      return `${kod} avans talebi açıldı`;
    });
  }

  const av = tek('SELECT * FROM avans WHERE id = ? AND tenant_id = ?', govde.avansId, ctx.tenant.id);
  if (!av) throw Bulunamadi('Avans talebi bulunamadı.');
  if (yalnizKendisi(ctx) && av.olusturan !== ctx.kullanici.id) {
    throw GecisIzinsiz('Yalnız kendi avans talebinizi işleyebilirsiniz.');
  }
  yetkiZorunlu(ctx, 'HR-11:guncelle');

  if (govde._eylem === 'onaya_gonder') {
    const p = tek('SELECT * FROM personel WHERE id = ?', av.personel_id);
    islem(() => {
      onayMotoru.onayaGonder(ctx, {
        nesne: 'avans', nesneId: av.id, nesneKod: av.kod,
        baslik: `Avans talebi: ${p?.ad_soyad || ''}`, belgeSurum: av.surum,
        tutarMinor: Number(av.tutar_minor), tutarBirim: av.tutar_birim,
        gerekce: govde.gerekce || null,
      });
      gecisYap(ctx, { nesne: 'avans', tablo: 'avans', kayit: av, eylem: 'onaya_gonder',
        gerekce: govde.gerekce, ekranKodu: 'HR-11' });
    });
    return 'Avans talebi onaya gönderildi';
  }
  if (govde._eylem === 'mahsup') {
    yetkiZorunlu(ctx, 'HR-11:guncelle');
    if (av.durum !== 'onaylandi') throw GecisIzinsiz('Yalnız ONAYLI avans mahsup edilir.');
    if (av.mahsup_edildi) throw Cakisma('Bu avans zaten mahsup edilmiş.');
    islem(() => {
      surumluGuncelle('avans', av.id, av.surum, { mahsup_edildi: simdi() },
        { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'avans', nesneId: av.id, eylem: 'mahsup_edildi', gerekce: govde.gerekce || null,
        sonraki: { donem: av.mahsup_donem } });
    });
    return 'Avans mahsup edildi olarak işaretlendi';
  }
  if (['geri_cek', 'iptal_et'].includes(govde._eylem)) {
    gecisYap(ctx, { nesne: 'avans', tablo: 'avans', kayit: av, eylem: govde._eylem,
      gerekce: govde.gerekce, ekranKodu: 'HR-11' });
    return 'Avans durumu güncellendi';
  }
  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

function avansSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('HR-11');
  yetkiZorunlu(ctx, e.yetki);
  const kendi = yalnizKendisi(ctx) ? kendiPersoneli(ctx) : null;
  const kosullar = ['a.tenant_id = ?']; const parametreler = [ctx.tenant.id];
  if (yalnizKendisi(ctx)) { kosullar.push('a.olusturan = ?'); parametreler.push(ctx.kullanici.id); }
  if (ctx.sorgu.get('durum')) { kosullar.push('a.durum = ?'); parametreler.push(ctx.sorgu.get('durum')); }
  const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
  const nerede = kosullar.join(' AND ');
  const toplam = Number(tek(
    `SELECT COUNT(*) AS n FROM avans a JOIN personel p ON p.id = a.personel_id WHERE ${nerede}`,
    ...parametreler)?.n ?? 0);
  const satirlar = sorgu(
    `SELECT a.*, p.ad_soyad, p.kod AS personel_kod FROM avans a
       JOIN personel p ON p.id = a.personel_id
      WHERE ${nerede} ORDER BY a.olusturuldu DESC LIMIT ? OFFSET ?`, ...parametreler, boyut, atla);
  const acikToplam = Number(tek(
    `SELECT COALESCE(SUM(tutar_minor),0) AS n FROM avans WHERE tenant_id = ?
       AND durum = 'onaylandi' AND mahsup_edildi IS NULL`, ctx.tenant.id)?.n ?? 0);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${yalnizKendisi(ctx) ? B.sonucSeridi({ tur: 'ok', baslik: 'Kendi kayıtlarınız',
    aciklama: 'Bu ekranda yalnız sizin avans talepleriniz görünür.' }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Onay bekleyen', ikon: 'fa-hourglass-half',
        deger: sayi(sayac(ctx.tenant.id, 'avans', `durum IN ('onaya_gonderildi','incelemede')`)) },
      { etiket: 'Mahsup bekleyen', ikon: 'fa-money-bill-wave', ton: acikToplam ? 'warn' : '',
        deger: para(acikToplam, ctx.tenant.para_birimi) },
      { etiket: 'Mahsup edilen', ikon: 'fa-circle-check',
        deger: sayi(sayac(ctx.tenant.id, 'avans', 'mahsup_edildi IS NOT NULL')) },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ]),
    filtre: B.filtreBari({ rota: '/avanslar', sorgu: ctx.sorgu, aramaYer: 'Ara…',
      filtreler: [{ ad: 'durum', etiket: 'Durum', secenekler: ['taslak', 'onaya_gonderildi',
        'incelemede', 'onaylandi', 'reddedildi'].map((d) => ({ deger: d, etiket: d })) }] }),
    icerik: B.tablo({
      satirlar,
      bosDurum: { baslik: 'Avans talebi yok', ikon: 'fa-money-bill-wave',
        aciklama: 'Mahsup edilmemiş avansı olan personel yeni avans alamaz.' },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'ad_soyad', etiket: 'Personel', govde: (r) => h`<a href="/personel/${r.personel_id}">
          <b>${r.ad_soyad}</b></a><br><span class="muted">${r.personel_kod}</span>` },
        { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag',
          govde: (r) => h`<b>${para(r.tutar_minor, r.tutar_birim)}</b>` },
        { ad: 'mahsup_donem', etiket: 'Mahsup dönemi' },
        { ad: 'mahsup_edildi', etiket: 'Mahsup', govde: (r) => (r.mahsup_edildi
          ? B.isaret(tarih(r.mahsup_edildi), 'ok')
          : (r.durum === 'onaylandi' ? B.isaret('bekliyor', 'warn') : '—')) },
        { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
        { ad: 'islem', etiket: '', govde: (r) => {
          if (!yetkiVar(ctx, 'HR-11:guncelle')) return '—';
          if (r.durum === 'taslak') {
            return h`<form method="post" action="/avanslar" style="display:inline">${ham(csrfAlani(ctx))}
              <input type="hidden" name="_eylem" value="onaya_gonder">
              <input type="hidden" name="avansId" value="${r.id}">
              <button class="btn btn-acc btn-sm" type="submit">Onaya gönder</button></form>`;
          }
          if (r.durum === 'onaylandi' && !r.mahsup_edildi) {
            return h`<form method="post" action="/avanslar" style="display:inline">${ham(csrfAlani(ctx))}
              <input type="hidden" name="_eylem" value="mahsup">
              <input type="hidden" name="avansId" value="${r.id}">
              <button class="btn btn-ghost btn-sm" type="submit">Mahsup et</button></form>`;
          }
          return '—';
        } },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: '/avanslar', sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'HR-11:olustur') ? B.form({
    rota: '/avanslar', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni avans talebi',
      aciklama: 'Mahsup dönemi zorunludur; mahsup edilmemiş avansı olan personel yeni avans alamaz.',
      alanlar: h`
      ${yalnizKendisi(ctx)
    ? h`<div class="gfield full"><span class="gf-hint">Talep sizin adınıza açılır:
        <b>${kendi?.ad_soyad || 'personel kaydı yok'}</b></span></div>`
    : B.alan({ ad: 'personelId', etiket: 'Personel', zorunlu: true, deger: deger.personelId || '',
      hata: hata?.alanlar?.personelId,
      secenekler: [{ deger: '', etiket: 'Seçin…' }, ...personelSecenekleri(ctx)] })}
      ${B.alan({ ad: 'tutar', etiket: 'Tutar', zorunlu: true, deger: deger.tutar || '',
    hata: hata?.alanlar?.tutar })}
      ${B.alan({ ad: 'mahsupDonem', etiket: 'Mahsup dönemi', deger: deger.mahsupDonem
    || gunAnahtari(simdi() + 30 * GUN_MS).slice(0, 7), hata: hata?.alanlar?.mahsupDonem,
    ipucu: 'YYYY-AA' })}
      ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe', tur: 'metin', genis: true, deger: deger.gerekce || '' })}` }],
    eylemler: B.btn('Talebi aç', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/* ==========================================================================
   HR-12 / HR-13 — tek tablo, iki görünüm (kural 4)
   ========================================================================== */
function yetkinlikEkle(ctx, kod, govde, sabitTur) {
  const p = govde.personelId
    ? tek('SELECT * FROM personel WHERE id = ? AND tenant_id = ?', govde.personelId, ctx.tenant.id) : null;
  if (!p) throw DogrulamaHatasi('Personel seçin.', { alanlar: { personelId: ['Personel bulunamadı.'] } });
  const ad = String(govde.ad || '').trim();
  if (!ad) throw DogrulamaHatasi('Belge adı zorunludur.', { alanlar: { ad: ['Ad girin.'] } });
  const tur = sabitTur || (YETKINLIK_TURLERI.some((t) => t.deger === govde.tur) ? govde.tur : 'diger');
  const gecerlilik = govde.gecerlilik ? gunBaslangici(govde.gecerlilik) : null;
  /* Sağlık raporunda geçerlilik zorunludur: süresiz sağlık raporu olmaz. */
  if (tur === 'saglik' && !gecerlilik) {
    throw DogrulamaHatasi('Sağlık raporunda geçerlilik tarihi zorunludur.',
      { alanlar: { gecerlilik: ['Geçerlilik girin.'] } });
  }
  islem(() => {
    const id = kimlik('yetkinlik');
    calistir(`INSERT INTO yetkinlik (id, tenant_id, personel_id, tur, ad, belge_no, veren_kurum,
                gecerlilik, durum, olusturan, olusturuldu) VALUES (?,?,?,?,?,?,?,?, 'gecerli', ?,?)`,
      id, ctx.tenant.id, p.id, tur, ad, govde.belgeNo || null, govde.verenKurum || null,
      gecerlilik, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'personel', nesneId: p.id, eylem: 'belge_eklendi',
      sonraki: { ad, tur, gecerlilik } });
  });
  return `${p.ad_soyad} — ${ad} kaydedildi`;
}

function yetkinlikIptal(ctx, kod, govde) {
  yetkiZorunlu(ctx, `${kod}:guncelle`);
  const yk = tek('SELECT * FROM yetkinlik WHERE id = ? AND tenant_id = ?', govde.id, ctx.tenant.id);
  if (!yk) throw Bulunamadi('Belge bulunamadı.');
  if (yk.durum === 'iptal') throw GecisIzinsiz('Bu belge zaten iptal edilmiş.');
  if (!String(govde.gerekce || '').trim()) {
    throw DogrulamaHatasi('İptal gerekçesi zorunludur.', { alanlar: { gerekce: ['Gerekçe girin.'] } });
  }
  islem(() => {
    surumluGuncelle('yetkinlik', yk.id, Number(govde.surum), { durum: 'iptal' },
      { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'personel', nesneId: yk.personel_id, eylem: 'belge_iptal', gerekce: govde.gerekce,
      onceki: { durum: yk.durum }, sonraki: { durum: 'iptal', belge: yk.ad } });
  });
  return `${yk.ad} iptal edildi`;
}

function yetkinlikSayfasi(ctx, kod, sabitTur, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi(kod);
  yetkiZorunlu(ctx, e.yetki);
  const kosullar = ['y.tenant_id = ?']; const parametreler = [ctx.tenant.id];
  if (sabitTur) { kosullar.push('y.tur = ?'); parametreler.push(sabitTur); }
  else if (ctx.sorgu.get('tur')) { kosullar.push('y.tur = ?'); parametreler.push(ctx.sorgu.get('tur')); }
  if (yalnizKendisi(ctx)) {
    kosullar.push('p.kullanici_id = ?'); parametreler.push(ctx.kullanici.id);
  }
  const q = (ctx.sorgu.get('q') || '').trim();
  if (q) { kosullar.push('(p.ad_soyad LIKE ? OR y.ad LIKE ?)'); parametreler.push(`%${q}%`, `%${q}%`); }
  if (ctx.sorgu.get('gecerlilik') === 'dolan') { kosullar.push('y.gecerlilik < ?'); parametreler.push(simdi()); }

  const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
  const nerede = kosullar.join(' AND ');
  const toplam = Number(tek(
    `SELECT COUNT(*) AS n FROM yetkinlik y JOIN personel p ON p.id = y.personel_id WHERE ${nerede}`,
    ...parametreler)?.n ?? 0);
  const satirlar = sorgu(
    `SELECT y.*, p.ad_soyad, p.kod AS personel_kod FROM yetkinlik y
       JOIN personel p ON p.id = y.personel_id
      WHERE ${nerede} ORDER BY y.gecerlilik IS NULL, y.gecerlilik ASC LIMIT ? OFFSET ?`,
    ...parametreler, boyut, atla);
  const turKosulu = sabitTur ? `AND tur = '${sabitTur}'` : '';
  const dolan = Number(tek(
    `SELECT COUNT(*) AS n FROM yetkinlik WHERE tenant_id = ? AND durum = 'gecerli'
       AND gecerlilik IS NOT NULL AND gecerlilik < ? ${turKosulu}`, ctx.tenant.id, simdi())?.n ?? 0);
  /* Sağlık ekranında: raporu olmayan aktif personel de bir eksikliktir. */
  const raporsuz = sabitTur === 'saglik' ? sorgu(
    `SELECT p.id, p.kod, p.ad_soyad FROM personel p WHERE p.tenant_id = ? AND p.durum = 'aktif'
       AND NOT EXISTS (SELECT 1 FROM yetkinlik y WHERE y.personel_id = p.id AND y.tur = 'saglik'
                         AND y.durum = 'gecerli' AND (y.gecerlilik IS NULL OR y.gecerlilik >= ?))
      ORDER BY p.ad_soyad LIMIT 20`, ctx.tenant.id, simdi()) : [];

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${dolan ? B.sonucSeridi({ tur: 'hata', baslik: `${dolan} belgenin süresi doldu`,
    aciklama: sabitTur === 'saglik'
      ? 'Sağlık raporu süresi dolan personel sahada çalıştırılamaz.'
      : 'Süresi dolan belge, işe giriş ve saha görevlendirmesinde engeldir.' }) : ''}
${raporsuz.length ? B.sonucSeridi({ tur: 'warn',
    baslik: `${raporsuz.length} aktif personelin geçerli sağlık raporu yok`,
    aciklama: raporsuz.slice(0, 5).map((p) => p.ad_soyad).join(', ') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: sabitTur === 'saglik' ? 'Sağlık kaydı' : 'Belge / yetkinlik', deger: sayi(toplam),
        ikon: sabitTur === 'saglik' ? 'fa-heart-pulse' : 'fa-id-card' },
      { etiket: 'Süresi dolan', deger: sayi(dolan), ikon: 'fa-triangle-exclamation',
        ton: dolan ? 'danger' : '' },
      { etiket: '30 gün içinde', ikon: 'fa-hourglass-half', deger: sayi(Number(tek(
        `SELECT COUNT(*) AS n FROM yetkinlik WHERE tenant_id = ? AND durum = 'gecerli'
           AND gecerlilik BETWEEN ? AND ? ${turKosulu}`,
        ctx.tenant.id, simdi(), simdi() + 30 * GUN_MS)?.n ?? 0)) },
      ...(sabitTur === 'saglik'
        ? [{ etiket: 'Raporsuz aktif personel', deger: sayi(raporsuz.length), ikon: 'fa-user-xmark',
          ton: raporsuz.length ? 'warn' : '' }]
        : [{ etiket: 'İptal edilen', ikon: 'fa-ban',
          deger: sayi(sayac(ctx.tenant.id, 'yetkinlik', `durum = 'iptal'`)) }]),
    ]),
    filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Personel veya belge…',
      filtreler: [
        ...(sabitTur ? [] : [{ ad: 'tur', etiket: 'Tür', secenekler: YETKINLIK_TURLERI }]),
        { ad: 'gecerlilik', etiket: 'Geçerlilik',
          secenekler: [{ deger: 'dolan', etiket: 'Süresi dolanlar' }] },
      ] }),
    icerik: B.tablo({
      satirlar,
      bosDurum: { baslik: sabitTur === 'saglik' ? 'Sağlık kaydı yok' : 'Belge yok',
        ikon: sabitTur === 'saglik' ? 'fa-heart-pulse' : 'fa-id-card',
        aciklama: 'İSG eğitimi katılımı da bu tabloya otomatik yetkinlik kaydı yazar (HSE-09).' },
      sutunlar: [
        { ad: 'ad_soyad', etiket: 'Personel', govde: (r) => h`<a href="/personel/${r.personel_id}">
          <b>${r.ad_soyad}</b></a><br><span class="muted">${r.personel_kod}</span>` },
        { ad: 'ad', etiket: 'Belge', govde: (r) => h`<b>${r.ad}</b>${sabitTur ? ''
          : h`<br><span class="muted">${YETKINLIK_TURLERI.find((t) => t.deger === r.tur)?.etiket || r.tur}</span>`}` },
        { ad: 'veren_kurum', etiket: 'Veren kurum', govde: (r) => r.veren_kurum || '—' },
        { ad: 'belge_no', etiket: 'Belge no', govde: (r) => r.belge_no || '—' },
        { ad: 'gecerlilik', etiket: 'Geçerlilik', govde: (r) => (!r.gecerlilik
          ? h`<span class="muted">süresiz</span>`
          : r.gecerlilik < simdi() ? B.isaret(`${tarih(r.gecerlilik)} — doldu`, 'danger')
            : r.gecerlilik < simdi() + 30 * GUN_MS
              ? B.isaret(`${tarih(r.gecerlilik)} — yaklaşıyor`, 'warn') : tarih(r.gecerlilik)) },
        { ad: 'durum', etiket: 'Durum', govde: (r) => (r.durum === 'gecerli' && yetkiVar(ctx, `${kod}:guncelle`)
          ? h`<form method="post" action="${e.rota}" style="display:flex;gap:6px">
              ${ham(csrfAlani(ctx))}
              <input type="hidden" name="_eylem" value="iptal">
              <input type="hidden" name="id" value="${r.id}">
              <input type="hidden" name="surum" value="${r.surum}">
              <input type="text" name="gerekce" placeholder="Gerekçe" aria-label="Gerekçe" style="max-width:110px">
              <button class="btn btn-ghost btn-sm" type="submit">İptal</button></form>`
          : B.rozet(r.durum === 'gecerli' ? 'onaylandi' : 'iptal',
            { gecerli: 'Geçerli', suresi_doldu: 'Süresi doldu', iptal: 'İptal' }[r.durum])) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${sabitTur ? h`<div class="gv-card" style="margin-top:18px"><div class="gc-body">
  <p class="gf-hint" style="margin:0">Bu ekran <a href="/yetkinlikler">yetkinlik listesinin</a>
    <code>tür = sağlık raporu</code> görünümüdür; ayrı bir sağlık tablosu yoktur (kural 4).</p>
</div></div>` : ''}
${yetkiVar(ctx, `${kod}:olustur`) ? B.form({
    rota: e.rota, csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: sabitTur === 'saglik' ? 'Yeni sağlık kaydı' : 'Yeni belge / yetkinlik',
      aciklama: sabitTur === 'saglik'
        ? 'Sağlık raporunda geçerlilik tarihi zorunludur; süresiz sağlık raporu olmaz.'
        : 'Süresi dolan belge işe giriş sihirbazında ve saha görevlendirmesinde engeldir.',
      alanlar: h`
      ${B.alan({ ad: 'personelId', etiket: 'Personel', zorunlu: true, deger: deger.personelId || '',
    hata: hata?.alanlar?.personelId,
    secenekler: [{ deger: '', etiket: 'Seçin…' }, ...personelSecenekleri(ctx)] })}
      ${B.alan({ ad: 'ad', etiket: 'Belge adı', zorunlu: true, genis: true, deger: deger.ad || '',
    hata: hata?.alanlar?.ad })}
      ${sabitTur ? '' : B.alan({ ad: 'tur', etiket: 'Tür', deger: deger.tur || 'sertifika',
    secenekler: YETKINLIK_TURLERI })}
      ${B.alan({ ad: 'verenKurum', etiket: 'Veren kurum', deger: deger.verenKurum || '' })}
      ${B.alan({ ad: 'belgeNo', etiket: 'Belge no', deger: deger.belgeNo || '' })}
      ${B.alan({ ad: 'gecerlilik', etiket: 'Geçerlilik bitişi', tur: 'date',
    zorunlu: sabitTur === 'saglik', deger: deger.gecerlilik || '', hata: hata?.alanlar?.gecerlilik })}` }],
    eylemler: B.btn('Kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/** İzin ve avans onayı motor geri çağrısı. */
export function ikOnaySonucu(ctx, nesne, nesneId, sonuc) {
  const tablo = { izin: 'izin', avans: 'avans' }[nesne];
  if (!tablo) return;
  const k = tek(`SELECT * FROM ${tablo} WHERE id = ?`, nesneId);
  if (!k) return;
  const eylem = { onaylandi: 'onayla', reddedildi: 'reddet', revizyon_istendi: 'revizyon_iste' }[sonuc];
  if (!eylem) return;
  if (k.durum === 'onaya_gonderildi') {
    gecisYap(ctx, { nesne, tablo, kayit: k, eylem: 'incelemeye_al', motor: true });
  }
  const guncel = tek(`SELECT * FROM ${tablo} WHERE id = ?`, nesneId);
  if (guncel.durum !== 'incelemede') return;
  gecisYap(ctx, { nesne, tablo, kayit: guncel, eylem, gerekce: `Onay talebi sonucu: ${sonuc}`, motor: true });

  /* Onaylı izin personeli "izinli" yapar; izin bitince İK geri alır. */
  if (nesne === 'izin' && sonuc === 'onaylandi') {
    const p = tek('SELECT * FROM personel WHERE id = ?', guncel.personel_id);
    if (p && p.durum === 'aktif' && guncel.baslangic <= simdi() && guncel.bitis >= simdi()) {
      gecisYap(ctx, { nesne: 'personel', tablo: 'personel', kayit: p, eylem: 'izne_cikar',
        gerekce: `${guncel.kod} izni onaylandı`, motor: true });
    }
  }
}
