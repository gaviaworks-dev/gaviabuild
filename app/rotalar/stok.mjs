/* ============================================================================
   DEPO VE STOK — STK-01..10
   ----------------------------------------------------------------------------
   STK-01 KABUL: "Stok bakiyesi hareket defterinden yeniden hesaplanabilir."
   Bu modül hiçbir yerde bakiye SAKLAMAZ; her sayı `moduller/stok/defter.mjs`
   üzerinden toplanır. Deftere yalnız o modül yazar ve satırlar tetikleyiciyle
   değişmez kılınmıştır — düzeltme yalnız TERS KAYITLA yapılır (kural 7).
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, tarihSaat, gunAnahtari, gunBaslangici, GUN_MS } from '../cekirdek/zaman.mjs';
import { Para } from '../cekirdek/para.mjs';
import { DogrulamaHatasi, GecisIzinsiz, Bulunamadi, Cakisma, UygulamaHatasi } from '../cekirdek/hata.mjs';
import { idempotent } from '../cekirdek/idempotency.mjs';
import * as onayMotoru from '../moduller/isakisi/onay.mjs';
import * as defter from '../moduller/stok/defter.mjs';
import { miktarAyristir, miktarMetni } from '../moduller/stok/defter.mjs';
import { kayitModulu, kullaniciSecenekleri, santiyeSecenekleri, sayac, gecmisKarti } from './kayit-modulu.mjs';
import {
  ekranNesnesi, hataNesnesi, kullaniciAdi, ciz, kaydiAl, listeSorgusu, filtreKosullari,
  B, h, ham, sayi, csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar,
  sorgu, tek, calistir, islem, surumluGuncelle, audit, sonrakiKod, gecisYap,
  ciktiDesteklenmez,
} from './ortak.mjs';

const DEPO_TURLERI = [
  { deger: 'santiye', etiket: 'Şantiye deposu' }, { deger: 'merkez', etiket: 'Merkez depo' },
  { deger: 'transit', etiket: 'Transit' }, { deger: 'yemekhane', etiket: 'Yemekhane' },
  { deger: 'atolye', etiket: 'Atölye' },
];
const para = (minor, birim = 'TRY') => (minor == null ? '—' : Para.minor(minor, birim || 'TRY').bicim());

const depoSecenekleri = (ctx) => sorgu(
  `SELECT id, kod, ad FROM depo WHERE tenant_id = ? AND durum = 'aktif' ORDER BY kod`, ctx.tenant.id)
  .map((d) => ({ deger: d.id, etiket: `${d.kod} — ${d.ad}` }));
const kartSecenekleri = (ctx) => sorgu(
  `SELECT id, kod, ad, birim FROM stok_karti WHERE tenant_id = ? AND durum = 'aktif' ORDER BY kod`, ctx.tenant.id)
  .map((k) => ({ deger: k.id, etiket: `${k.kod} — ${k.ad} (${k.birim})` }));

export function kur(y, ekranRota) {
  /* ================= STK-01 Depolar ==================================== */
  kayitModulu(y, ekranRota, {
    nesne: 'depo', tablo: 'depo', kodNesnesi: 'depo', kimlikTuru: 'depo',
    rota: '/depolar', formRotasi: '/depolar?yeni=1',
    baslik: 'Depo', yeniEtiketi: 'Yeni depo',
    listeKodu: 'STK-01', formKodu: null, detayKodu: null, gecisNesnesi: 'santiye',
    aramaAlanlari: ['ad', 'kod'], aramaYer: 'Depo adı veya kodu…', sirala: 'kod ASC',
    filtreler: [
      { ad: 'tur', etiket: 'Tür', secenekler: DEPO_TURLERI },
      { ad: 'santiye_id', etiket: 'Şantiye', secenekler: santiyeSecenekleri },
    ],
    alanlar: [],
    kpi: (ctx, toplam) => {
      const kritik = defter.kritikSeviyeAltindakiler(ctx.tenant.id).length;
      return [
        { etiket: 'Aktif depo', deger: sayi(sayac(ctx.tenant.id, 'depo', `durum = 'aktif'`)), ikon: 'fa-warehouse' },
        { etiket: 'Stok kartı', deger: sayi(sayac(ctx.tenant.id, 'stok_karti', `durum = 'aktif'`)), ikon: 'fa-boxes-stacked' },
        { etiket: 'Kritik seviyede', deger: sayi(kritik), ikon: 'fa-triangle-exclamation',
          ton: kritik ? 'danger' : '' },
        { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
      ];
    },
    listeSutunlari: () => [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'ad', etiket: 'Depo', govde: (r) => h`<a href="/stok/hareketler?depo_id=${r.id}"><b>${r.ad}</b></a>
        <br><span class="muted">${DEPO_TURLERI.find((t) => t.deger === r.tur)?.etiket || r.tur}</span>` },
      { ad: 'santiye_id', etiket: 'Şantiye', govde: (r) => (r.santiye_id
        ? tek('SELECT kod FROM santiye WHERE id = ?', r.santiye_id)?.kod || '—' : '—') },
      { ad: 'sorumlu_id', etiket: 'Sorumlu', govde: (r) => kullaniciAdi(r.sorumlu_id) },
      { ad: 'kalem', etiket: 'Kalem', hizala: 'sag',
        govde: (r) => sayi(defter.depoBakiyeleri(r.tenant_id, { depoId: r.id })
          .filter((x) => x.bakiye_binde !== 0).length) },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(
        r.durum === 'aktif' ? 'onaylandi' : 'kapali',
        { aktif: 'Aktif', pasif: 'Pasif', kapali: 'Kapalı' }[r.durum]) },
    ],
    bosDurum: { baslik: 'Depo yok', ikon: 'fa-warehouse',
      aciklama: 'Stok hareketi bir depoya yazılır; önce depo tanımlayın.' },
    altForm: (ctx) => B.form({
      rota: '/depolar', csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Yeni depo', alanlar: h`
        ${B.alan({ ad: 'ad', etiket: 'Depo adı', zorunlu: true, genis: true })}
        ${B.alan({ ad: 'tur', etiket: 'Tür', deger: 'santiye', secenekler: DEPO_TURLERI })}
        ${B.alan({ ad: 'santiyeId', etiket: 'Şantiye',
          secenekler: [{ deger: '', etiket: 'Seçin…' }, ...santiyeSecenekleri(ctx)] })}
        ${B.alan({ ad: 'sorumluId', etiket: 'Depo sorumlusu',
          secenekler: [{ deger: '', etiket: 'Seçin…' }, ...kullaniciSecenekleri(ctx)] })}
        ${B.alan({ ad: 'adres', etiket: 'Adres', genis: true })}` }],
      eylemler: B.btn('Depoyu kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
    }),
  });

  y.post('/depolar', (ctx, govde) => {
    yetkiZorunlu(ctx, 'STK-01:olustur');
    csrfZorunlu(ctx, govde);
    const ad = String(govde.ad || '').trim();
    if (!ad) throw DogrulamaHatasi('Depo adı zorunludur.', { alanlar: { ad: ['Ad girin.'] } });
    const santiye = govde.santiyeId
      ? tek('SELECT * FROM santiye WHERE id = ? AND tenant_id = ?', govde.santiyeId, ctx.tenant.id) : null;
    islem(() => {
      const kod = sonrakiKod(ctx.tenant.id, 'depo');
      const id = kimlik('depo');
      calistir(`INSERT INTO depo (id, tenant_id, kod, ad, tur, santiye_id, proje_id, adres, sorumlu_id,
                  durum, olusturan, olusturuldu) VALUES (?,?,?,?,?,?,?,?,?, 'aktif', ?,?)`,
        id, ctx.tenant.id, kod, ad, govde.tur || 'santiye', santiye?.id || null,
        santiye?.proje_id || null, govde.adres || null, govde.sorumluId || null,
        ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'depo', nesneId: id, eylem: 'olustur', sonraki: { kod, ad, tur: govde.tur } });
    });
    return yonlendir(ctx, '/depolar?olusturuldu=1');
  }, { ekran: ekranNesnesi('STK-01') });

  /* ================= STK-02 Stok kartları ============================== */
  ekranRota(y, 'STK-02', {
    get: (ctx) => stokKartlari(ctx),
    post: (ctx, govde) => {
      yetkiZorunlu(ctx, 'STK-02:olustur');
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = stokKartiAc(ctx, govde);
        return yonlendir(ctx, `/stok-kartlari?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return stokKartlari(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= STK-03..05 Mal kabul ============================== */
  ekranRota(y, 'STK-03', { get: (ctx) => malKabulListesi(ctx) });

  ekranRota(y, 'STK-04', {
    get: (ctx) => html(ctx, 200, ciz(ctx, ekranNesnesi('STK-04'), malKabulFormu(ctx, {}))),
    post: (ctx, govde) => {
      const e = ekranNesnesi('STK-04');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const sonuc = idempotent(
          { anahtar: govde._idempotency, tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, govde },
          () => malKabulAc(ctx, govde));
        return yonlendir(ctx, `/mal-kabul/${sonuc.id}?olusan=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, ciz(ctx, e, malKabulFormu(ctx, { deger: govde, hata: hataNesnesi(err) })));
      }
    },
  });

  ekranRota(y, 'STK-05', {
    get: (ctx, _g, params) => malKabulDetayi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('STK-05');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      csrfZorunlu(ctx, govde);
      const m = kaydiAl(ctx, 'mal_kabul', 'mal_kabul', params.id);
      try {
        const mesaj = malKabulIslemi(ctx, m, govde);
        return yonlendir(ctx, `/mal-kabul/${m.id}?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return malKabulDetayi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ================= STK-06 Rezervasyon ================================ */
  ekranRota(y, 'STK-06', {
    get: (ctx) => rezervasyonSayfasi(ctx),
    post: (ctx, govde) => {
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = govde._eylem === 'kapat' ? rezervasyonKapat(ctx, govde) : rezervasyonAc(ctx, govde);
        return yonlendir(ctx, `/stok/rezervasyonlar?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return rezervasyonSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= STK-07 Transferler ================================ */
  ekranRota(y, 'STK-07', {
    get: (ctx) => transferSayfasi(ctx),
    post: (ctx, govde) => {
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = govde._eylem === 'gecis' ? transferGecisi(ctx, govde) : transferAc(ctx, govde);
        return yonlendir(ctx, `/stok/transferler?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return transferSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= STK-08 Sarf ve iade =============================== */
  ekranRota(y, 'STK-08', {
    get: (ctx) => sarfSayfasi(ctx),
    post: (ctx, govde) => {
      yetkiZorunlu(ctx, 'STK-08:olustur');
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = sarfKaydet(ctx, govde);
        return yonlendir(ctx, `/stok/sarf?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return sarfSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= STK-09 Sayım ====================================== */
  ekranRota(y, 'STK-09', {
    get: (ctx) => sayimSayfasi(ctx),
    post: (ctx, govde) => {
      const e = ekranNesnesi('STK-09');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = sayimIslemi(ctx, govde);
        const p = new URLSearchParams({ islem: mesaj });
        if (govde.sayimId) p.set('sayim_id', govde.sayimId);
        return yonlendir(ctx, `/stok/sayim?${p.toString()}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return sayimSayfasi(ctx, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= STK-10 Hareket defteri ============================ */
  ekranRota(y, 'STK-10', {
    get: (ctx) => hareketRaporu(ctx),
    post: (ctx, govde) => {
      yetkiZorunlu(ctx, 'STK-10:goruntule');
      csrfZorunlu(ctx, govde);
      try {
        islem(() => defter.tersKayit(ctx, govde.hareketId, govde.gerekce));
        return yonlendir(ctx, `/stok/hareketler?islem=${encodeURIComponent('Ters kayıt yazıldı')}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return hareketRaporu(ctx, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });
}

/* ==========================================================================
   STK-02 stok kartları — bakiye HER SATIRDA defterden hesaplanır
   ========================================================================== */
function stokKartiAc(ctx, govde) {
  const ad = String(govde.ad || '').trim();
  const kod = String(govde.kod || '').trim();
  const hatalar = {};
  if (!kod) hatalar.kod = ['Stok kodu girin.'];
  if (!ad) hatalar.ad = ['Kart adı girin.'];
  if (Object.keys(hatalar).length) throw DogrulamaHatasi('Stok kartı eksik.', { alanlar: hatalar });
  if (tek('SELECT id FROM stok_karti WHERE tenant_id = ? AND kod = ?', ctx.tenant.id, kod)) {
    throw Cakisma(`"${kod}" kodlu stok kartı zaten var.`);
  }
  const kritik = govde.kritikSeviye ? miktarAyristir(govde.kritikSeviye, 'kritikSeviye') : 0;
  islem(() => {
    const id = kimlik('stok');
    calistir(`INSERT INTO stok_karti (id, tenant_id, kod, ad, kategori, birim, maliyet_kodu,
                kritik_seviye_binde, raf_omru_gun, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?, 'aktif', ?,?)`,
      id, ctx.tenant.id, kod, ad, govde.kategori || null, govde.birim || 'ad',
      govde.maliyetKodu || null, kritik, govde.rafOmruGun ? Number(govde.rafOmruGun) : null,
      ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'stok_karti', nesneId: id, eylem: 'olustur', sonraki: { kod, ad, birim: govde.birim } });
  });
  return `${kod} stok kartı oluşturuldu`;
}

function stokKartlari(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('STK-02');
  yetkiZorunlu(ctx, e.yetki);
  const depoId = ctx.sorgu.get('depo_id') || '';
  const q = (ctx.sorgu.get('q') || '').trim();
  const kosullar = ['tenant_id = ?']; const parametreler = [ctx.tenant.id];
  if (q) { kosullar.push('(kod LIKE ? OR ad LIKE ?)'); parametreler.push(`%${q}%`, `%${q}%`); }
  if (ctx.sorgu.get('kategori')) { kosullar.push('kategori = ?'); parametreler.push(ctx.sorgu.get('kategori')); }

  const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
  const nerede = kosullar.join(' AND ');
  const toplam = Number(tek(`SELECT COUNT(*) AS n FROM stok_karti WHERE ${nerede}`, ...parametreler)?.n ?? 0);
  const kartlar = sorgu(`SELECT * FROM stok_karti WHERE ${nerede} ORDER BY kod LIMIT ? OFFSET ?`,
    ...parametreler, boyut, atla);

  /* Her satırın bakiyesi DEFTERDEN hesaplanır; kartta saklanan bir sayı yoktur. */
  const satirlar = kartlar.map((k) => ({
    ...k,
    bakiye_binde: depoId ? defter.bakiye(depoId, k.id) : defter.toplamBakiye(ctx.tenant.id, k.id),
    rezerve_binde: depoId ? defter.rezerve(depoId, k.id) : 0,
  }));
  const kritikler = defter.kritikSeviyeAltindakiler(ctx.tenant.id);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${kritikler.length ? B.sonucSeridi({ tur: 'warn', baslik: `${kritikler.length} kart kritik seviyenin altında`,
    aciklama: kritikler.slice(0, 4).map((x) => `${x.kart_kod} @ ${x.depo_kod}`).join(', ') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Aktif kart', deger: sayi(sayac(ctx.tenant.id, 'stok_karti', `durum = 'aktif'`)), ikon: 'fa-boxes-stacked' },
      { etiket: 'Bakiyeli kalem', deger: sayi(defter.depoBakiyeleri(ctx.tenant.id)
        .filter((x) => x.bakiye_binde > 0).length), ikon: 'fa-cubes' },
      { etiket: 'Kritik seviyede', deger: sayi(kritikler.length), ikon: 'fa-triangle-exclamation',
        ton: kritikler.length ? 'danger' : '' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ]),
    filtre: B.filtreBari({ rota: '/stok-kartlari', sorgu: ctx.sorgu, aramaYer: 'Kod veya ad…',
      filtreler: [
        { ad: 'depo_id', etiket: 'Depo bakiyesi', secenekler: depoSecenekleri(ctx) },
        { ad: 'kategori', etiket: 'Kategori', secenekler: sorgu(
          `SELECT DISTINCT kategori FROM stok_karti WHERE tenant_id = ? AND kategori IS NOT NULL ORDER BY kategori`,
          ctx.tenant.id).map((r) => ({ deger: r.kategori, etiket: r.kategori })) },
      ] }),
    icerik: B.tablo({
      satirlar,
      bosDurum: { baslik: 'Stok kartı yok', ikon: 'fa-boxes-stacked',
        aciklama: 'Mal kabul ve sarf işlemleri stok kartına bağlanır.' },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'ad', etiket: 'Malzeme', govde: (k) => h`<a href="/stok/hareketler?kart_id=${k.id}${
          depoId ? `&depo_id=${depoId}` : ''}"><b>${k.ad}</b></a>${
          k.kategori ? h`<br><span class="muted">${k.kategori}</span>` : ''}` },
        { ad: 'birim', etiket: 'Birim' },
        { ad: 'bakiye_binde', etiket: depoId ? 'Depo bakiyesi' : 'Toplam bakiye', hizala: 'sag',
          govde: (k) => h`<b>${miktarMetni(k.bakiye_binde)}</b>` },
        { ad: 'rezerve_binde', etiket: 'Rezerve', hizala: 'sag',
          govde: (k) => (depoId ? miktarMetni(k.rezerve_binde) : '—') },
        { ad: 'kullanilabilir', etiket: 'Kullanılabilir', hizala: 'sag',
          govde: (k) => (depoId ? miktarMetni(k.bakiye_binde - k.rezerve_binde) : '—') },
        { ad: 'kritik_seviye_binde', etiket: 'Kritik seviye', hizala: 'sag',
          govde: (k) => (k.kritik_seviye_binde
            ? (k.bakiye_binde < k.kritik_seviye_binde
              ? B.isaret(`${miktarMetni(k.kritik_seviye_binde)} — altında`, 'danger')
              : miktarMetni(k.kritik_seviye_binde))
            : '—') },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: '/stok-kartlari', sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
<div class="gv-card" style="margin-top:18px"><div class="gc-body">
  <p class="gf-hint" style="margin:0"><b>Bakiye saklanmaz.</b> Buradaki her sayı
    <code>stok_hareketi</code> defterinin o an toplanmasıyla üretilir; kartta "mevcut miktar"
    sütunu yoktur. Düzeltme yalnız ters kayıtla yapılır (değişmez kural 7).</p>
</div></div>
${yetkiVar(ctx, 'STK-02:olustur') ? B.form({
    rota: '/stok-kartlari', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni stok kartı', alanlar: h`
      ${B.alan({ ad: 'kod', etiket: 'Stok kodu', zorunlu: true, deger: deger.kod || '',
    hata: hata?.alanlar?.kod })}
      ${B.alan({ ad: 'ad', etiket: 'Malzeme adı', zorunlu: true, genis: true, deger: deger.ad || '',
    hata: hata?.alanlar?.ad })}
      ${B.alan({ ad: 'kategori', etiket: 'Kategori', deger: deger.kategori || '' })}
      ${B.alan({ ad: 'birim', etiket: 'Birim', deger: deger.birim || 'ad',
    secenekler: sorgu(`SELECT kod, ad FROM sozluk WHERE tenant_id = ? AND kume = 'birim' AND aktif = 1 ORDER BY sira`,
      ctx.tenant.id).map((s) => ({ deger: s.kod, etiket: s.ad })) })}
      ${B.alan({ ad: 'kritikSeviye', etiket: 'Kritik seviye', deger: deger.kritikSeviye || '',
    ipucu: 'Bu miktarın altına düşünce uyarı üretilir.' })}
      ${B.alan({ ad: 'rafOmruGun', etiket: 'Raf ömrü (gün)', tur: 'number', deger: deger.rafOmruGun || '' })}
      ${B.alan({ ad: 'maliyetKodu', etiket: 'Maliyet kodu', deger: deger.maliyetKodu || '' })}` }],
    eylemler: B.btn('Kartı kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/* ==========================================================================
   STK-03..05 mal kabul
   ========================================================================== */
function malKabulListesi(ctx, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('STK-03');
  yetkiZorunlu(ctx, e.yetki);
  const { kosullar, parametreler } = filtreKosullari(ctx, {
    aramaAlanlari: ['kod', 'irsaliye_no'], filtreler: [{ ad: 'durum' }, { ad: 'depo_id' }],
  });
  const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
    { tablo: 'mal_kabul', kosullar, parametreler, sirala: 'olusturuldu DESC' });

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Kontrol bekleyen', deger: sayi(sayac(ctx.tenant.id, 'mal_kabul',
        `durum IN ('taslak','kontrolde')`)), ikon: 'fa-hourglass-half' },
      { etiket: 'Kabul edilen', deger: sayi(sayac(ctx.tenant.id, 'mal_kabul',
        `durum IN ('kabul','kismi_kabul')`)), ikon: 'fa-circle-check' },
      { etiket: 'Reddedilen', deger: sayi(sayac(ctx.tenant.id, 'mal_kabul', `durum = 'ret'`)),
        ikon: 'fa-circle-xmark', ton: 'danger' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ]),
    filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Kod veya irsaliye no…',
      filtreler: [
        { ad: 'durum', etiket: 'Durum', secenekler: ['taslak', 'kontrolde', 'kabul', 'kismi_kabul', 'ret']
          .map((d) => ({ deger: d, etiket: d })) },
        { ad: 'depo_id', etiket: 'Depo', secenekler: depoSecenekleri(ctx) },
      ] }),
    icerik: B.tablo({
      satirlar,
      satirRota: (r) => `/mal-kabul/${r.id}`,
      bosDurum: { baslik: 'Mal kabul kaydı yok', ikon: 'fa-truck-ramp-box',
        aciklama: 'Kabul kararı stok defterine giriş yazar; kayıt buradan başlar.',
        eylem: yetkiVar(ctx, 'STK-04:olustur')
          ? B.btn('Yeni mal kabul', { tur: 'acc', rota: '/mal-kabul/yeni', ikon: 'fa-plus' }) : null },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'irsaliye_no', etiket: 'İrsaliye', govde: (r) => h`${r.irsaliye_no || '—'}${
          r.irsaliye_tarihi ? h`<br><span class="muted">${tarih(r.irsaliye_tarihi)}</span>` : ''}` },
        { ad: 'tedarikci_id', etiket: 'Tedarikçi', govde: (r) => (r.tedarikci_id
          ? tek('SELECT unvan FROM tedarikci WHERE id = ?', r.tedarikci_id)?.unvan || '—' : '—') },
        { ad: 'siparis_id', etiket: 'Sipariş', govde: (r) => (r.siparis_id
          ? h`<a href="/satinalma/siparisler/${r.siparis_id}">${
            tek('SELECT kod FROM siparis WHERE id = ?', r.siparis_id)?.kod || '—'}</a>`
          : B.isaret('siparişsiz', 'warn')) },
        { ad: 'depo_id', etiket: 'Depo', govde: (r) => tek('SELECT kod FROM depo WHERE id = ?', r.depo_id)?.kod || '—' },
        { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum, {
          taslak: 'Taslak', kontrolde: 'Kontrolde', kabul: 'Kabul', kismi_kabul: 'Kısmi kabul',
          ret: 'Ret', iptal: 'İptal' }[r.durum]) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}`;
  return html(ctx, durum, ciz(ctx, e, icerik, {
    eylemler: yetkiVar(ctx, 'STK-04:olustur')
      ? B.btn('Yeni mal kabul', { tur: 'acc', rota: '/mal-kabul/yeni', ikon: 'fa-plus' }) : null,
  }));
}

function malKabulAc(ctx, govde) {
  const depo = govde.depoId
    ? tek('SELECT * FROM depo WHERE id = ? AND tenant_id = ?', govde.depoId, ctx.tenant.id) : null;
  if (!depo) throw DogrulamaHatasi('Depo seçin.', { alanlar: { depoId: ['Depo bulunamadı.'] } });
  const siparis = govde.siparisId
    ? tek('SELECT * FROM siparis WHERE id = ? AND tenant_id = ?', govde.siparisId, ctx.tenant.id) : null;
  if (govde.siparisId && !siparis) throw DogrulamaHatasi('Sipariş bulunamadı.');
  /* Onaysız sipariş teslim alınamaz: tedarikçiye gitmemiş sipariş mal getirmez. */
  if (siparis && siparis.durum !== 'onaylandi') {
    throw GecisIzinsiz(`"${siparis.kod}" siparişi "${siparis.durum}" durumunda; onaysız siparişe mal kabul yapılamaz.`);
  }

  const satirlar = [];
  const hatalar = {};
  const siparisKalemleri = siparis
    ? sorgu('SELECT * FROM siparis_kalemi WHERE siparis_id = ? ORDER BY sira', siparis.id) : [];
  for (let i = 0; i < 20; i++) {
    const miktar = String(govde[`kalem${i}Miktar`] || '').trim();
    if (!miktar) continue;
    const sk = govde[`kalem${i}Kaynak`]
      ? siparisKalemleri.find((x) => x.id === govde[`kalem${i}Kaynak`]) : null;
    const aciklama = String(govde[`kalem${i}Aciklama`] || sk?.aciklama || '').trim();
    if (!aciklama) { hatalar[`kalem${i}Aciklama`] = ['Açıklama girin.']; continue; }
    let gelen;
    try { gelen = miktarAyristir(miktar, `kalem${i}Miktar`); }
    catch (err) { hatalar[`kalem${i}Miktar`] = [err.mesaj]; continue; }
    if (sk) {
      const kalan = sk.miktar_binde - sk.teslim_binde;
      if (gelen > kalan) {
        hatalar[`kalem${i}Miktar`] = [`Siparişte kalan ${miktarMetni(kalan)} ${sk.birim}; fazlası kabul edilemez.`];
        continue;
      }
    }
    const kartId = govde[`kalem${i}Kart`] || sk?.stok_karti_id || null;
    if (!kartId) { hatalar[`kalem${i}Kart`] = ['Stok kartı seçin (defter kart bazlıdır).']; continue; }
    satirlar.push({ sira: satirlar.length + 1, aciklama, gelen, kartId, siparisKalemiId: sk?.id || null,
      birim: sk?.birim || govde[`kalem${i}Birim`] || 'ad' });
  }
  if (Object.keys(hatalar).length) throw DogrulamaHatasi('Mal kabul kalemlerinde hata var.', { alanlar: hatalar });
  if (!satirlar.length) {
    throw DogrulamaHatasi('En az bir kalem girilmelidir.',
      { alanlar: { kalem0Miktar: ['Kalemsiz mal kabul açılamaz.'] } });
  }

  return islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'mal_kabul');
    const id = kimlik('malkabul');
    calistir(`INSERT INTO mal_kabul (id, tenant_id, kod, siparis_id, tedarikci_id, depo_id, santiye_id,
                proje_id, irsaliye_no, irsaliye_tarihi, teslim_alan_id, notlar, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'taslak', ?,?)`,
      id, ctx.tenant.id, kod, siparis?.id || null, siparis?.tedarikci_id || govde.tedarikciId || null,
      depo.id, depo.santiye_id, depo.proje_id, govde.irsaliyeNo || null,
      govde.irsaliyeTarihi ? gunBaslangici(govde.irsaliyeTarihi) : simdi(),
      ctx.kullanici.id, govde.notlar || null, ctx.kullanici.id, simdi());
    for (const s of satirlar) {
      calistir(`INSERT INTO mal_kabul_kalemi (id, tenant_id, mal_kabul_id, siparis_kalemi_id,
                  stok_karti_id, sira, aciklama, birim, gelen_binde)
                VALUES (?,?,?,?,?,?,?,?,?)`,
        kimlik('satir'), ctx.tenant.id, id, s.siparisKalemiId, s.kartId, s.sira, s.aciklama,
        s.birim, s.gelen);
    }
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'mal_kabul', nesneId: id, eylem: 'olustur',
      sonraki: { kod, siparis: siparis?.kod || null, depo: depo.kod, kalem: satirlar.length } });
    return { id, kod };
  });
}

function malKabulFormu(ctx, { deger = {}, hata = null }) {
  const e = ekranNesnesi('STK-04');
  const siparisId = deger.siparisId || ctx.sorgu.get('siparisId') || '';
  const siparis = siparisId
    ? tek('SELECT * FROM siparis WHERE id = ? AND tenant_id = ?', siparisId, ctx.tenant.id) : null;
  const kalemler = siparis
    ? sorgu('SELECT * FROM siparis_kalemi WHERE siparis_id = ? ORDER BY sira', siparis.id)
      .filter((k) => k.miktar_binde > k.teslim_binde) : [];
  const satirSayisi = Math.max(3, kalemler.length);
  const acikSiparisler = sorgu(
    `SELECT s.id, s.kod, s.baslik, t.unvan FROM siparis s JOIN tedarikci t ON t.id = s.tedarikci_id
      WHERE s.tenant_id = ? AND s.durum = 'onaylandi' ORDER BY s.olusturuldu DESC LIMIT 100`, ctx.tenant.id)
    .map((s) => ({ deger: s.id, etiket: `${s.kod} — ${s.baslik} (${s.unvan})` }));

  return B.form({
    rota: e.rota, csrf: csrfAlani(ctx), idempotencyAnahtari: kimlik('idempotency'), hatalar: hata,
    bolumler: [
      { baslik: 'Teslimat künyesi',
        aciklama: 'Mal kabul TASLAK açılır. Stok girişi ancak KABUL kararıyla deftere yazılır.',
        alanlar: h`
          ${B.alan({ ad: 'siparisId', etiket: 'Sipariş', deger: siparis?.id || '',
            secenekler: [{ deger: '', etiket: 'Siparişsiz teslimat' }, ...acikSiparisler] })}
          ${B.alan({ ad: 'depoId', etiket: 'Teslim alınan depo', zorunlu: true,
            deger: deger.depoId || siparis?.depo_id || '', hata: hata?.alanlar?.depoId,
            secenekler: [{ deger: '', etiket: 'Seçin…' }, ...depoSecenekleri(ctx)] })}
          ${B.alan({ ad: 'irsaliyeNo', etiket: 'İrsaliye no', deger: deger.irsaliyeNo || '' })}
          ${B.alan({ ad: 'irsaliyeTarihi', etiket: 'İrsaliye tarihi', tur: 'date',
            deger: deger.irsaliyeTarihi || gunAnahtari(simdi()) })}
          ${B.alan({ ad: 'notlar', etiket: 'Not', tur: 'metin', genis: true, deger: deger.notlar || '' })}` },
      { baslik: 'Gelen kalemler',
        aciklama: 'Sipariş kalemine bağlı satırda miktar, siparişte KALAN miktarı aşamaz.',
        alanlar: h`${Array.from({ length: satirSayisi }, (_, i) => {
          const k = kalemler[i];
          return h`
          ${B.alan({ ad: `kalem${i}Aciklama`, etiket: `${i + 1}. kalem`, genis: true,
            deger: deger[`kalem${i}Aciklama`] ?? k?.aciklama ?? '',
            hata: hata?.alanlar?.[`kalem${i}Aciklama`] })}
          ${B.alan({ ad: `kalem${i}Kart`, etiket: 'Stok kartı',
            deger: deger[`kalem${i}Kart`] ?? k?.stok_karti_id ?? '',
            hata: hata?.alanlar?.[`kalem${i}Kart`],
            secenekler: [{ deger: '', etiket: 'Seçin…' }, ...kartSecenekleri(ctx)] })}
          ${B.alan({ ad: `kalem${i}Miktar`, etiket: 'Gelen miktar',
            deger: deger[`kalem${i}Miktar`] ?? (k ? miktarMetni(k.miktar_binde - k.teslim_binde) : ''),
            hata: hata?.alanlar?.[`kalem${i}Miktar`] })}
          ${k ? ham(`<input type="hidden" name="kalem${i}Kaynak" value="${k.id}">`)
    : B.alan({ ad: `kalem${i}Birim`, etiket: 'Birim', deger: deger[`kalem${i}Birim`] || 'ad' })}`;
        })}` },
    ],
    ozet: h`<div class="gv-card"><div class="gc-body">
      <div class="gv-cap-sm">Defter kuralı</div>
      <p style="margin-top:10px;font-size:12.5px;line-height:1.7;color:var(--muted)">
        Bu form <b>stok yazmaz</b>. Kalem kararları (kabul/ret) girildikten sonra kabul kararı
        verilir ve giriş hareketi o anda deftere düşer. Reddedilen kalem otomatik <b>NCR</b> açar (§7).</p>
    </div></div>`,
    eylemler: h`${B.btn('Vazgeç', { rota: '/mal-kabul' })}
      ${B.btn('Kaydet ve karara git', { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' })}`,
  });
}

/**
 * Mal kabul kararı — üç ayaklı zincirin ilk halkası:
 * kalem bazlı kabul/ret girilir, sonra karar tek işlemde uygulanır.
 * Kabul edilen miktar deftere GİRİŞ olarak yazılır; reddedilen NCR açar.
 */
function malKabulIslemi(ctx, m, govde) {
  if (govde._eylem === 'kontrole_gonder') {
    gecisYap(ctx, { nesne: 'malKabul', tablo: 'mal_kabul', kayit: m, eylem: 'kontrole_gonder',
      gerekce: govde.gerekce, ekranKodu: 'STK-05' });
    return 'Kalite kontrolüne gönderildi';
  }
  if (govde._eylem === 'iptal_et') {
    gecisYap(ctx, { nesne: 'malKabul', tablo: 'mal_kabul', kayit: m, eylem: 'iptal_et',
      gerekce: govde.gerekce, ekranKodu: 'STK-05' });
    return 'Mal kabul iptal edildi';
  }
  if (govde._eylem !== 'karar') throw DogrulamaHatasi('Bilinmeyen işlem.');

  if (m.durum !== 'kontrolde') {
    throw GecisIzinsiz('Karar yalnız "kontrolde" durumundaki mal kabul için verilir; sonuç bir kez yazılır.');
  }
  const kalemler = sorgu('SELECT * FROM mal_kabul_kalemi WHERE mal_kabul_id = ? ORDER BY sira', m.id);
  if (!kalemler.length) throw GecisIzinsiz('Kalemsiz mal kabul karara bağlanamaz.');

  const kararlar = [];
  const hatalar = {};
  for (const k of kalemler) {
    const kabulGirdi = String(govde[`kabul_${k.id}`] ?? '').trim();
    const retGirdi = String(govde[`ret_${k.id}`] ?? '').trim();
    let kabul = 0; let ret = 0;
    try { kabul = kabulGirdi ? miktarAyristir(kabulGirdi, `kabul_${k.id}`, { sifirSerbest: true }) : 0; }
    catch (e) { hatalar[`kabul_${k.id}`] = [e.mesaj]; continue; }
    try { ret = retGirdi ? miktarAyristir(retGirdi, `ret_${k.id}`, { sifirSerbest: true }) : 0; }
    catch (e) { hatalar[`ret_${k.id}`] = [e.mesaj]; continue; }
    if (kabul + ret !== k.gelen_binde) {
      hatalar[`kabul_${k.id}`] = [
        `Kabul + ret, gelen miktara (${miktarMetni(k.gelen_binde)}) eşit olmalı; şu an ${miktarMetni(kabul + ret)}.`];
      continue;
    }
    if (ret > 0 && !String(govde[`neden_${k.id}`] || '').trim()) {
      hatalar[`neden_${k.id}`] = ['Ret nedeni zorunludur.'];
      continue;
    }
    kararlar.push({ kalem: k, kabul, ret, neden: govde[`neden_${k.id}`] || null });
  }
  if (Object.keys(hatalar).length) throw DogrulamaHatasi('Kabul/ret miktarları geçersiz.', { alanlar: hatalar });

  const toplamKabul = kararlar.reduce((a, x) => a + x.kabul, 0);
  const toplamRet = kararlar.reduce((a, x) => a + x.ret, 0);
  const sonucEylemi = toplamRet === 0 ? 'kabul_et' : (toplamKabul === 0 ? 'reddet' : 'kismi_kabul_et');
  if (sonucEylemi !== 'kabul_et' && !String(govde.gerekce || '').trim()) {
    throw DogrulamaHatasi('Kısmi kabul ve ret kararı gerekçe ister.',
      { alanlar: { gerekce: ['Gerekçe girin.'] } });
  }

  islem(() => {
    for (const kr of kararlar) {
      calistir(`UPDATE mal_kabul_kalemi SET kabul_binde = ?, ret_binde = ?, ret_nedeni = ? WHERE id = ?`,
        kr.kabul, kr.ret, kr.neden, kr.kalem.id);

      /* Kabul edilen miktar DEFTERE giriş olarak yazılır. */
      if (kr.kabul > 0) {
        const sk = kr.kalem.siparis_kalemi_id
          ? tek('SELECT * FROM siparis_kalemi WHERE id = ?', kr.kalem.siparis_kalemi_id) : null;
        defter.hareketYaz(ctx, {
          depoId: m.depo_id, stokKartiId: kr.kalem.stok_karti_id, tur: 'giris',
          miktarBinde: kr.kabul,
          birimMaliyetMinor: sk?.birim_fiyat_minor ?? null,
          birimMaliyetBirim: sk?.birim_fiyat_birim ?? null,
          santiyeId: m.santiye_id, projeId: m.proje_id,
          kaynakNesne: 'mal_kabul', kaynakId: m.id,
          aciklama: `${m.kod} — ${kr.kalem.aciklama}`,
        });
        if (sk) {
          calistir('UPDATE siparis_kalemi SET teslim_binde = teslim_binde + ? WHERE id = ?', kr.kabul, sk.id);
        }
      }

      /* §7: mal kabul reddi kalite zincirini tetikler — otomatik NCR (K-034 ilkesi). */
      if (kr.ret > 0) {
        const ncrId = kimlik('kalite');
        const ncrKod = sonrakiKod(ctx.tenant.id, 'ncr');
        calistir(`INSERT INTO ncr (id, tenant_id, santiye_id, proje_id, kod, baslik, gereklilik,
                    bulgu, etki, onem, karantina, durum, olusturan, olusturuldu)
                  VALUES (?,?,?,?,?,?,?,?,?,?,1, 'yeni', ?,?)`,
          ncrId, ctx.tenant.id, m.santiye_id, m.proje_id, ncrKod,
          `Mal kabul reddi: ${kr.kalem.aciklama}`,
          'Sipariş ve şartname koşullarına uygun teslimat',
          `${m.kod} teslimatında ${miktarMetni(kr.ret)} ${kr.kalem.birim} reddedildi. Neden: ${kr.neden}`,
          'Kullanılabilir stok oluşmadı; tedarikçiden düzeltme bekleniyor.',
          kr.ret === kr.kalem.gelen_binde ? 'kritik' : 'uyari',
          ctx.kullanici.id, simdi());
        calistir('UPDATE mal_kabul_kalemi SET ncr_id = ? WHERE id = ?', ncrId, kr.kalem.id);
        audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
          nesne: 'ncr', nesneId: ncrId, eylem: 'mal_kabul_retten_acildi',
          sonraki: { malKabul: m.kod, retBinde: kr.ret, neden: kr.neden } });
      }
    }
    gecisYap(ctx, { nesne: 'malKabul', tablo: 'mal_kabul', kayit: m, eylem: sonucEylemi,
      gerekce: govde.gerekce || null, motor: true });
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'mal_kabul', nesneId: m.id, eylem: 'karar_verildi', gerekce: govde.gerekce || null,
      sonraki: { kabulBinde: toplamKabul, retBinde: toplamRet, sonuc: sonucEylemi } });
  });
  return toplamRet === 0 ? 'Kabul edildi; stok girişi deftere yazıldı'
    : toplamKabul === 0 ? 'Reddedildi; kullanılabilir stok oluşmadı ve NCR açıldı'
      : 'Kısmi kabul; kabul edilen miktar deftere yazıldı, reddedilen için NCR açıldı';
}

function malKabulDetayi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('STK-05');
  yetkiZorunlu(ctx, e.yetki);
  const m = kaydiAl(ctx, 'mal_kabul', 'mal_kabul', id);
  const kalemler = sorgu('SELECT * FROM mal_kabul_kalemi WHERE mal_kabul_id = ? ORDER BY sira', m.id);
  const hareketler = defter.kaynakHareketleri('mal_kabul', m.id);
  const kararVerilebilir = m.durum === 'kontrolde' && yetkiVar(ctx, 'STK-05:guncelle');

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: 'Mal kabul kaydı açıldı',
    aciklama: 'Stok girişi henüz YAZILMADI; kabul kararıyla deftere düşer.' }) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.detayOzetSeridi({
    kod: m.kod, baslik: `${m.irsaliye_no || 'İrsaliyesiz'} teslimatı`, durum: m.durum, surum: m.surum,
    bilgiler: [
      { etiket: 'Sipariş', deger: m.siparis_id
        ? h`<a href="/satinalma/siparisler/${m.siparis_id}">${
          tek('SELECT kod FROM siparis WHERE id = ?', m.siparis_id)?.kod || '—'}</a>` : 'siparişsiz' },
      { etiket: 'Tedarikçi', deger: m.tedarikci_id
        ? tek('SELECT unvan FROM tedarikci WHERE id = ?', m.tedarikci_id)?.unvan || '—' : '—' },
      { etiket: 'Depo', deger: tek('SELECT kod FROM depo WHERE id = ?', m.depo_id)?.kod || '—' },
      { etiket: 'İrsaliye tarihi', deger: m.irsaliye_tarihi ? tarih(m.irsaliye_tarihi) : '—' },
      { etiket: 'Teslim alan', deger: kullaniciAdi(m.teslim_alan_id) },
    ],
    birincilEylem: B.btn('Mal kabul listesi', { rota: '/mal-kabul' }),
  })}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Kalemler</b>
        <span>${kararVerilebilir
    ? 'Her kalem için kabul + ret, gelen miktara eşit olmalıdır.'
    : 'Karar verildikten sonra miktarlar değişmez; düzeltme ters kayıtla yapılır.'}</span></div></div>
      <div class="gc-body${kararVerilebilir ? '' : ' flush'}">
      ${kararVerilebilir ? h`
        <form method="post" action="/mal-kabul/${m.id}" data-gform="1">
          ${ham(csrfAlani(ctx))}
          <input type="hidden" name="_eylem" value="karar">
          ${kalemler.map((k) => h`
            <div style="border-top:1px solid var(--gv-border-dark,#1F2740);padding:12px 0">
              <b>${k.aciklama}</b>
              <span class="muted"> · gelen ${miktarMetni(k.gelen_binde)} ${k.birim}</span>
              <div class="gform-alanlar" style="margin-top:8px">
                ${B.alan({ ad: `kabul_${k.id}`, etiket: 'Kabul', deger: miktarMetni(k.gelen_binde),
    hata: hata?.alanlar?.[`kabul_${k.id}`] })}
                ${B.alan({ ad: `ret_${k.id}`, etiket: 'Ret', deger: '0',
    hata: hata?.alanlar?.[`ret_${k.id}`] })}
                ${B.alan({ ad: `neden_${k.id}`, etiket: 'Ret nedeni', genis: true,
    hata: hata?.alanlar?.[`neden_${k.id}`] })}
              </div>
            </div>`)}
          ${B.alan({ ad: 'gerekce', etiket: 'Karar gerekçesi', tur: 'metin', genis: true,
    ipucu: 'Kısmi kabul ve ret kararında zorunludur.', hata: hata?.alanlar?.gerekce })}
          <div style="margin-top:12px">${B.btn('Kararı uygula ve deftere yaz',
    { tur: 'acc', gonder: true, ikon: 'fa-clipboard-check' })}</div>
        </form>`
    : B.tablo({
      satirlar: kalemler,
      bosDurum: { baslik: 'Kalem yok' },
      sutunlar: [
        { ad: 'sira', etiket: '#', hizala: 'sag' },
        { ad: 'aciklama', etiket: 'Kalem', govde: (k) => h`<b>${k.aciklama}</b>` },
        { ad: 'gelen_binde', etiket: 'Gelen', hizala: 'sag',
          govde: (k) => h`${miktarMetni(k.gelen_binde)} ${k.birim}` },
        { ad: 'kabul_binde', etiket: 'Kabul', hizala: 'sag', govde: (k) => miktarMetni(k.kabul_binde) },
        { ad: 'ret_binde', etiket: 'Ret', hizala: 'sag',
          govde: (k) => (k.ret_binde ? B.isaret(miktarMetni(k.ret_binde), 'danger') : '0') },
        { ad: 'ret_nedeni', etiket: 'Ret nedeni', govde: (k) => k.ret_nedeni || '—' },
        { ad: 'ncr_id', etiket: 'NCR', govde: (k) => (k.ncr_id
          ? h`<a href="/kalite/ncr/${k.ncr_id}">açıldı</a>` : '—') },
      ],
    })}
      </div>
    </div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Bu kabulden doğan stok hareketleri</b>
        <span>Defter satırları değiştirilemez; düzeltme ters kayıtla yapılır (kural 7).</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: hareketler,
    bosDurum: { baslik: 'Henüz stok hareketi yok', ikon: 'fa-right-left',
      aciklama: 'Kabul kararı verilene kadar defterde satır oluşmaz.' },
    sutunlar: [
      { ad: 'zaman', etiket: 'Zaman', govde: (x) => tarihSaat(x.zaman) },
      { ad: 'kart_kod', etiket: 'Kart', govde: (x) => h`<b>${x.kart_kod}</b><br><span class="muted">${x.kart_ad}</span>` },
      { ad: 'depo_kod', etiket: 'Depo' },
      { ad: 'miktar_binde', etiket: 'Miktar', hizala: 'sag',
        govde: (x) => h`${x.yon > 0 ? '+' : '−'}${miktarMetni(x.miktar_binde)} ${x.birim}` },
      { ad: 'tur', etiket: 'Tür', govde: (x) => defter.HAREKET_ETIKETI[x.tur] || x.tur },
    ],
  })}</div>
    </div>
    ${gecmisKarti('mal_kabul', m)}
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Durum işlemleri</b>
        <span>Sonucu (kabul/kısmi/ret) siz seçmezsiniz; kalem kararlarından türer.</span></div></div>
      <div class="gc-body">
        ${yetkiVar(ctx, 'STK-05:guncelle') && ['taslak'].includes(m.durum) ? h`
        <form method="post" action="/mal-kabul/${m.id}" data-gform="1">
          ${ham(csrfAlani(ctx))}
          ${B.alan({ ad: 'gerekce', etiket: 'Not', tur: 'metin' })}
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
            <button class="btn btn-acc" type="submit" name="_eylem" value="kontrole_gonder">
              Kalite kontrolüne gönder <span class="muted">→ kontrolde</span></button>
            <button class="btn btn-danger" type="submit" name="_eylem" value="iptal_et">İptal et</button>
          </div>
        </form>` : ''}
        ${['kabul', 'kismi_kabul', 'ret'].includes(m.durum)
    ? h`<p class="gf-hint">Karar verildi ve deftere yazıldı. Bu kayıt artık değiştirilemez;
        hatalı giriş <a href="/stok/hareketler">hareket defterinden</a> ters kayıtla düzeltilir.</p>` : ''}
      </div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: m.kod, baslik: m.irsaliye_no || m.kod }));
}

/* ==========================================================================
   STK-06 rezervasyon
   ========================================================================== */
function rezervasyonAc(ctx, govde) {
  yetkiZorunlu(ctx, 'STK-06:olustur');
  const depo = tek('SELECT * FROM depo WHERE id = ? AND tenant_id = ?', govde.depoId, ctx.tenant.id);
  const kart = tek('SELECT * FROM stok_karti WHERE id = ? AND tenant_id = ?', govde.kartId, ctx.tenant.id);
  const hatalar = {};
  if (!depo) hatalar.depoId = ['Depo seçin.'];
  if (!kart) hatalar.kartId = ['Stok kartı seçin.'];
  if (Object.keys(hatalar).length) throw DogrulamaHatasi('Rezervasyon eksik.', { alanlar: hatalar });
  const miktar = miktarAyristir(govde.miktar, 'miktar');

  /* Rezervasyon KULLANILABİLİR stoktan yapılır: iki iş paketi aynı malı ayıramaz. */
  const kullanilabilir = defter.kullanilabilir(depo.id, kart.id);
  if (miktar > kullanilabilir) {
    throw GecisIzinsiz(`${depo.kod} deposunda kullanılabilir ${miktarMetni(kullanilabilir)} ${kart.birim} var; `
      + `${miktarMetni(miktar)} rezerve edilemez.`);
  }
  islem(() => {
    const id = kimlik('satir').replace('itm', 'rzv');
    calistir(`INSERT INTO stok_rezervasyonu (id, tenant_id, depo_id, stok_karti_id, miktar_binde,
                santiye_id, is_emri_id, gerekce, gecerlilik, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?, 'aktif', ?,?)`,
      id, ctx.tenant.id, depo.id, kart.id, miktar, depo.santiye_id, govde.isEmriId || null,
      govde.gerekce || null, govde.gecerlilik ? gunBaslangici(govde.gecerlilik) : null,
      ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'stok_rezervasyonu', nesneId: id, eylem: 'olustur',
      sonraki: { depo: depo.kod, kart: kart.kod, miktarBinde: miktar } });
  });
  return `${kart.kod} için ${miktarMetni(miktar)} ${kart.birim} rezerve edildi`;
}

function rezervasyonKapat(ctx, govde) {
  yetkiZorunlu(ctx, 'STK-06:guncelle');
  const r = tek('SELECT * FROM stok_rezervasyonu WHERE id = ? AND tenant_id = ?', govde.id, ctx.tenant.id);
  if (!r) throw Bulunamadi('Rezervasyon bulunamadı.');
  if (r.durum !== 'aktif') throw GecisIzinsiz('Bu rezervasyon zaten kapatılmış.');
  const yeni = govde.sonuc === 'kullanildi' ? 'kullanildi' : 'iptal';
  islem(() => {
    surumluGuncelle('stok_rezervasyonu', r.id, Number(govde.surum), { durum: yeni },
      { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'stok_rezervasyonu', nesneId: r.id, eylem: `kapatildi:${yeni}`,
      onceki: { durum: 'aktif' }, sonraki: { durum: yeni } });
  });
  return `Rezervasyon ${yeni === 'kullanildi' ? 'kullanıldı' : 'iptal edildi'}`;
}

function rezervasyonSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('STK-06');
  yetkiZorunlu(ctx, e.yetki);
  const kosullar = ['r.tenant_id = ?']; const parametreler = [ctx.tenant.id];
  if (ctx.sorgu.get('depo_id')) { kosullar.push('r.depo_id = ?'); parametreler.push(ctx.sorgu.get('depo_id')); }
  if (ctx.sorgu.get('durum')) { kosullar.push('r.durum = ?'); parametreler.push(ctx.sorgu.get('durum')); }
  else kosullar.push(`r.durum = 'aktif'`);

  const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
  const nerede = kosullar.join(' AND ');
  const toplam = Number(tek(`SELECT COUNT(*) AS n FROM stok_rezervasyonu r WHERE ${nerede}`,
    ...parametreler)?.n ?? 0);
  const satirlar = sorgu(
    `SELECT r.*, d.kod AS depo_kod, k.kod AS kart_kod, k.ad AS kart_ad, k.birim
       FROM stok_rezervasyonu r JOIN depo d ON d.id = r.depo_id JOIN stok_karti k ON k.id = r.stok_karti_id
      WHERE ${nerede} ORDER BY r.olusturuldu DESC LIMIT ? OFFSET ?`, ...parametreler, boyut, atla);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Aktif rezervasyon', deger: sayi(sayac(ctx.tenant.id, 'stok_rezervasyonu', `durum = 'aktif'`)),
        ikon: 'fa-lock' },
      { etiket: 'Süresi geçen', ton: 'warn', ikon: 'fa-hourglass-end',
        deger: sayi(sayac(ctx.tenant.id, 'stok_rezervasyonu',
          `durum = 'aktif' AND gecerlilik IS NOT NULL AND gecerlilik < ?`, simdi())) },
      { etiket: 'Kullanılan', deger: sayi(sayac(ctx.tenant.id, 'stok_rezervasyonu', `durum = 'kullanildi'`)),
        ikon: 'fa-circle-check' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ]),
    filtre: B.filtreBari({ rota: '/stok/rezervasyonlar', sorgu: ctx.sorgu, aramaYer: 'Ara…',
      filtreler: [
        { ad: 'depo_id', etiket: 'Depo', secenekler: depoSecenekleri(ctx) },
        { ad: 'durum', etiket: 'Durum', secenekler: [
          { deger: 'aktif', etiket: 'Aktif' }, { deger: 'kullanildi', etiket: 'Kullanıldı' },
          { deger: 'iptal', etiket: 'İptal' }] },
      ] }),
    icerik: B.tablo({
      satirlar,
      bosDurum: { baslik: 'Rezervasyon yok', ikon: 'fa-lock',
        aciklama: 'Rezervasyon, kullanılabilir stoktan düşer; iki iş paketi aynı malı ayıramaz.' },
      sutunlar: [
        { ad: 'kart_kod', etiket: 'Malzeme', govde: (r) => h`<b>${r.kart_kod}</b><br><span class="muted">${r.kart_ad}</span>` },
        { ad: 'depo_kod', etiket: 'Depo' },
        { ad: 'miktar_binde', etiket: 'Miktar', hizala: 'sag',
          govde: (r) => h`${miktarMetni(r.miktar_binde)} ${r.birim}` },
        { ad: 'gerekce', etiket: 'Gerekçe', govde: (r) => r.gerekce || '—' },
        { ad: 'gecerlilik', etiket: 'Geçerlilik', govde: (r) => (!r.gecerlilik ? '—'
          : r.gecerlilik < simdi() && r.durum === 'aktif'
            ? B.isaret(`${tarih(r.gecerlilik)} — geçti`, 'warn') : tarih(r.gecerlilik)) },
        { ad: 'islem', etiket: '', govde: (r) => (r.durum !== 'aktif' || !yetkiVar(ctx, 'STK-06:guncelle') ? '—'
          : h`<form method="post" action="/stok/rezervasyonlar" style="display:flex;gap:6px">
              ${ham(csrfAlani(ctx))}
              <input type="hidden" name="_eylem" value="kapat">
              <input type="hidden" name="id" value="${r.id}">
              <input type="hidden" name="surum" value="${r.surum}">
              <button class="btn btn-ghost btn-sm" type="submit" name="sonuc" value="kullanildi">Kullanıldı</button>
              <button class="btn btn-ghost btn-sm" type="submit" name="sonuc" value="iptal">İptal</button>
            </form>`) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: '/stok/rezervasyonlar', sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'STK-06:olustur') ? B.form({
    rota: '/stok/rezervasyonlar', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni rezervasyon',
      aciklama: 'Rezervasyon KULLANILABİLİR stoktan yapılır (bakiye − aktif rezervasyon).',
      alanlar: h`
      ${B.alan({ ad: 'depoId', etiket: 'Depo', zorunlu: true, deger: deger.depoId || '',
    hata: hata?.alanlar?.depoId, secenekler: [{ deger: '', etiket: 'Seçin…' }, ...depoSecenekleri(ctx)] })}
      ${B.alan({ ad: 'kartId', etiket: 'Stok kartı', zorunlu: true, deger: deger.kartId || '',
    hata: hata?.alanlar?.kartId, secenekler: [{ deger: '', etiket: 'Seçin…' }, ...kartSecenekleri(ctx)] })}
      ${B.alan({ ad: 'miktar', etiket: 'Miktar', zorunlu: true, deger: deger.miktar || '',
    hata: hata?.alanlar?.miktar })}
      ${B.alan({ ad: 'gecerlilik', etiket: 'Geçerlilik bitişi', tur: 'date', deger: deger.gecerlilik || '' })}
      ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe / iş paketi', genis: true, deger: deger.gerekce || '' })}` }],
    eylemler: B.btn('Rezerve et', { tur: 'acc', gonder: true, ikon: 'fa-lock' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/* ==========================================================================
   STK-07 transfer — iki hareketli tek belge
   ========================================================================== */
function transferAc(ctx, govde) {
  yetkiZorunlu(ctx, 'STK-07:olustur');
  const kaynak = tek('SELECT * FROM depo WHERE id = ? AND tenant_id = ?', govde.kaynakDepoId, ctx.tenant.id);
  const hedef = tek('SELECT * FROM depo WHERE id = ? AND tenant_id = ?', govde.hedefDepoId, ctx.tenant.id);
  const kart = tek('SELECT * FROM stok_karti WHERE id = ? AND tenant_id = ?', govde.kartId, ctx.tenant.id);
  const hatalar = {};
  if (!kaynak) hatalar.kaynakDepoId = ['Kaynak depo seçin.'];
  if (!hedef) hatalar.hedefDepoId = ['Hedef depo seçin.'];
  if (kaynak && hedef && kaynak.id === hedef.id) hatalar.hedefDepoId = ['Kaynak ve hedef aynı olamaz.'];
  if (!kart) hatalar.kartId = ['Stok kartı seçin.'];
  if (Object.keys(hatalar).length) throw DogrulamaHatasi('Transfer bilgileri eksik.', { alanlar: hatalar });
  const miktar = miktarAyristir(govde.miktar, 'miktar');

  return islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'stok_transferi');
    const id = kimlik('hareket').replace('mov', 'trf');
    calistir(`INSERT INTO stok_transferi (id, tenant_id, kod, kaynak_depo_id, hedef_depo_id, aciklama,
                sevk_tarihi, durum, olusturan, olusturuldu) VALUES (?,?,?,?,?,?,?, 'taslak', ?,?)`,
      id, ctx.tenant.id, kod, kaynak.id, hedef.id, govde.aciklama || null,
      govde.sevkTarihi ? gunBaslangici(govde.sevkTarihi) : simdi(), ctx.kullanici.id, simdi());
    calistir(`INSERT INTO stok_transfer_kalemi (id, transfer_id, stok_karti_id, miktar_binde)
              VALUES (?,?,?,?)`, kimlik('satir'), id, kart.id, miktar);
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'stok_transferi', nesneId: id, eylem: 'olustur',
      sonraki: { kod, kaynak: kaynak.kod, hedef: hedef.kod, kart: kart.kod, miktarBinde: miktar } });
    return `${kod} transferi açıldı`;
  });
}

/** Sevk çıkış hareketi, teslim alma giriş hareketi yazar — ikisi de deftere. */
function transferGecisi(ctx, govde) {
  yetkiZorunlu(ctx, 'STK-07:guncelle');
  const t = tek('SELECT * FROM stok_transferi WHERE id = ? AND tenant_id = ?', govde.id, ctx.tenant.id);
  if (!t) throw Bulunamadi('Transfer bulunamadı.');
  const kalemler = sorgu('SELECT * FROM stok_transfer_kalemi WHERE transfer_id = ?', t.id);
  if (!kalemler.length) throw GecisIzinsiz('Kalemsiz transfer sevk edilemez.');

  return islem(() => {
    if (govde.gecis === 'sevk_et') {
      for (const k of kalemler) {
        defter.hareketYaz(ctx, {
          depoId: t.kaynak_depo_id, stokKartiId: k.stok_karti_id, tur: 'transfer_cikis',
          miktarBinde: k.miktar_binde, kaynakNesne: 'stok_transferi', kaynakId: t.id,
          aciklama: `${t.kod} sevk` });
      }
    } else if (govde.gecis === 'teslim_al') {
      for (const k of kalemler) {
        defter.hareketYaz(ctx, {
          depoId: t.hedef_depo_id, stokKartiId: k.stok_karti_id, tur: 'transfer_giris',
          miktarBinde: k.miktar_binde, kaynakNesne: 'stok_transferi', kaynakId: t.id,
          aciklama: `${t.kod} teslim` });
      }
    }
    gecisYap(ctx, { nesne: 'stokTransferi', tablo: 'stok_transferi', kayit: t, eylem: govde.gecis,
      gerekce: govde.gerekce, ekranKodu: 'STK-07' });
    return govde.gecis === 'sevk_et' ? 'Transfer sevk edildi; kaynak depodan çıkış yazıldı'
      : govde.gecis === 'teslim_al' ? 'Transfer teslim alındı; hedef depoya giriş yazıldı'
        : 'Transfer durumu güncellendi';
  });
}

function transferSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('STK-07');
  yetkiZorunlu(ctx, e.yetki);
  const { kosullar, parametreler } = filtreKosullari(ctx, {
    aramaAlanlari: ['kod', 'aciklama'], filtreler: [{ ad: 'durum' }],
  });
  const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
    { tablo: 'stok_transferi', kosullar, parametreler, sirala: 'olusturuldu DESC',
      kapsamSecenekleri: { projeSutunu: null, santiyeSutunu: null } });

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Yolda', deger: sayi(sayac(ctx.tenant.id, 'stok_transferi', `durum = 'yolda'`)),
        ikon: 'fa-truck-fast', ton: 'warn' },
      { etiket: 'Tamamlanan', deger: sayi(sayac(ctx.tenant.id, 'stok_transferi', `durum = 'tamamlandi'`)),
        ikon: 'fa-circle-check' },
      { etiket: 'Taslak', deger: sayi(sayac(ctx.tenant.id, 'stok_transferi', `durum = 'taslak'`)), ikon: 'fa-pen' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ]),
    filtre: B.filtreBari({ rota: '/stok/transferler', sorgu: ctx.sorgu, aramaYer: 'Kod veya açıklama…',
      filtreler: [{ ad: 'durum', etiket: 'Durum', secenekler: ['taslak', 'yolda', 'tamamlandi', 'iptal']
        .map((d) => ({ deger: d, etiket: d })) }] }),
    icerik: B.tablo({
      satirlar,
      bosDurum: { baslik: 'Transfer yok', ikon: 'fa-right-left',
        aciklama: 'Sevk çıkış, teslim alma giriş hareketi yazar; ikisi de deftere düşer.' },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'kaynak_depo_id', etiket: 'Kaynak → Hedef', govde: (r) => h`${
          tek('SELECT kod FROM depo WHERE id = ?', r.kaynak_depo_id)?.kod || '—'} →
          ${tek('SELECT kod FROM depo WHERE id = ?', r.hedef_depo_id)?.kod || '—'}` },
        { ad: 'kalem', etiket: 'Kalem', govde: (r) => {
          const k = sorgu(`SELECT tk.miktar_binde, sk.kod, sk.birim FROM stok_transfer_kalemi tk
                            JOIN stok_karti sk ON sk.id = tk.stok_karti_id WHERE tk.transfer_id = ?`, r.id);
          return k.length ? h`${k.map((x) => h`${x.kod}: ${miktarMetni(x.miktar_binde)} ${x.birim}<br>`)}` : '—';
        } },
        { ad: 'sevk_tarihi', etiket: 'Sevk', govde: (r) => (r.sevk_tarihi ? tarih(r.sevk_tarihi) : '—') },
        { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(
          r.durum === 'tamamlandi' ? 'onaylandi' : r.durum === 'yolda' ? 'beklemede' : r.durum) },
        { ad: 'islem', etiket: '', govde: (r) => {
          if (!yetkiVar(ctx, 'STK-07:guncelle') || ['tamamlandi', 'iptal'].includes(r.durum)) return '—';
          const eylem = r.durum === 'taslak' ? 'sevk_et' : 'teslim_al';
          return h`<form method="post" action="/stok/transferler" style="display:inline">
            ${ham(csrfAlani(ctx))}
            <input type="hidden" name="_eylem" value="gecis">
            <input type="hidden" name="id" value="${r.id}">
            <input type="hidden" name="gecis" value="${eylem}">
            <button class="btn btn-ghost btn-sm" type="submit">${
  eylem === 'sevk_et' ? 'Sevk et' : 'Teslim al'}</button></form>`;
        } },
      ],
    }),
    sayfalayici: B.sayfalama({ rota: '/stok/transferler', sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'STK-07:olustur') ? B.form({
    rota: '/stok/transferler', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni transfer',
      aciklama: 'Sevk anında kaynak depodan çıkış, teslim anında hedef depoya giriş yazılır. '
        + 'Teslim alan, sevk edenden farklı olmalıdır (dört göz).',
      alanlar: h`
      ${B.alan({ ad: 'kaynakDepoId', etiket: 'Kaynak depo', zorunlu: true, deger: deger.kaynakDepoId || '',
    hata: hata?.alanlar?.kaynakDepoId, secenekler: [{ deger: '', etiket: 'Seçin…' }, ...depoSecenekleri(ctx)] })}
      ${B.alan({ ad: 'hedefDepoId', etiket: 'Hedef depo', zorunlu: true, deger: deger.hedefDepoId || '',
    hata: hata?.alanlar?.hedefDepoId, secenekler: [{ deger: '', etiket: 'Seçin…' }, ...depoSecenekleri(ctx)] })}
      ${B.alan({ ad: 'kartId', etiket: 'Stok kartı', zorunlu: true, deger: deger.kartId || '',
    hata: hata?.alanlar?.kartId, secenekler: [{ deger: '', etiket: 'Seçin…' }, ...kartSecenekleri(ctx)] })}
      ${B.alan({ ad: 'miktar', etiket: 'Miktar', zorunlu: true, deger: deger.miktar || '',
    hata: hata?.alanlar?.miktar })}
      ${B.alan({ ad: 'sevkTarihi', etiket: 'Sevk tarihi', tur: 'date', deger: deger.sevkTarihi || gunAnahtari(simdi()) })}
      ${B.alan({ ad: 'aciklama', etiket: 'Açıklama', genis: true, deger: deger.aciklama || '' })}` }],
    eylemler: B.btn('Transferi aç', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/* ==========================================================================
   STK-08 sarf ve iade
   ========================================================================== */
function sarfKaydet(ctx, govde) {
  const depo = tek('SELECT * FROM depo WHERE id = ? AND tenant_id = ?', govde.depoId, ctx.tenant.id);
  const kart = tek('SELECT * FROM stok_karti WHERE id = ? AND tenant_id = ?', govde.kartId, ctx.tenant.id);
  const hatalar = {};
  if (!depo) hatalar.depoId = ['Depo seçin.'];
  if (!kart) hatalar.kartId = ['Stok kartı seçin.'];
  if (!['sarf', 'iade'].includes(govde.tur)) hatalar.tur = ['Tür seçin.'];
  if (Object.keys(hatalar).length) throw DogrulamaHatasi('Sarf kaydı eksik.', { alanlar: hatalar });
  const miktar = miktarAyristir(govde.miktar, 'miktar');

  return islem(() => {
    defter.hareketYaz(ctx, {
      depoId: depo.id, stokKartiId: kart.id, tur: govde.tur, miktarBinde: miktar,
      santiyeId: depo.santiye_id, projeId: depo.proje_id, maliyetKodu: govde.maliyetKodu || kart.maliyet_kodu,
      kaynakNesne: govde.isEmriId ? 'is_emri' : null, kaynakId: govde.isEmriId || null,
      aciklama: govde.aciklama || null,
    });
    return govde.tur === 'sarf'
      ? `${kart.kod} — ${miktarMetni(miktar)} ${kart.birim} sarf edildi`
      : `${kart.kod} — ${miktarMetni(miktar)} ${kart.birim} iade alındı`;
  });
}

function sarfSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('STK-08');
  yetkiZorunlu(ctx, e.yetki);
  const depoId = ctx.sorgu.get('depo_id') || '';
  const ay = ctx.sorgu.get('ay') || gunAnahtari(simdi()).slice(0, 7);
  const bas = gunBaslangici(`${ay}-01`);
  const son = bas + 32 * GUN_MS;
  const hareketler = defter.hareketDokumu(ctx.tenant.id, {
    depoId: depoId || null, baslangic: bas, bitis: son, limit: 200,
  }).filter((x) => ['sarf', 'iade'].includes(x.tur));

  const sarfToplam = hareketler.filter((x) => x.tur === 'sarf').reduce((a, x) => a + x.miktar_binde, 0);
  const iadeToplam = hareketler.filter((x) => x.tur === 'iade').reduce((a, x) => a + x.miktar_binde, 0);
  const isEmirleri = sorgu(
    `SELECT id, kod, baslik FROM is_emri WHERE tenant_id = ? AND durum NOT IN ('tamamlandi','iptal')
      ORDER BY olusturuldu DESC LIMIT 50`, ctx.tenant.id)
    .map((x) => ({ deger: x.id, etiket: `${x.kod} — ${x.baslik}` }));

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Dönem', deger: ay, ikon: 'fa-calendar-days' },
      { etiket: 'Sarf hareketi', deger: sayi(hareketler.filter((x) => x.tur === 'sarf').length), ikon: 'fa-arrow-down' },
      { etiket: 'Sarf miktarı', deger: miktarMetni(sarfToplam), ikon: 'fa-cubes' },
      { etiket: 'İade miktarı', deger: miktarMetni(iadeToplam), ikon: 'fa-rotate-left' },
    ]),
    filtre: B.filtreBari({ rota: '/stok/sarf', sorgu: ctx.sorgu, aramaYer: 'Ara…',
      filtreler: [
        { ad: 'depo_id', etiket: 'Depo', secenekler: depoSecenekleri(ctx) },
        { ad: 'ay', etiket: 'Dönem', secenekler: Array.from({ length: 6 }, (_, i) => {
          const d = new Date(simdi() - i * 30 * GUN_MS);
          const k = gunAnahtari(d.getTime()).slice(0, 7);
          return { deger: k, etiket: k };
        }) },
      ] }),
    icerik: B.tablo({
      satirlar: hareketler,
      bosDurum: { baslik: 'Bu dönemde sarf kaydı yok', ikon: 'fa-arrow-down',
        aciklama: 'Sarf, depo bakiyesini eksiye düşüremez; yetersiz stokta işlem reddedilir.' },
      sutunlar: [
        { ad: 'zaman', etiket: 'Zaman', govde: (x) => tarihSaat(x.zaman) },
        { ad: 'tur', etiket: 'Tür', govde: (x) => B.isaret(
          defter.HAREKET_ETIKETI[x.tur], x.tur === 'sarf' ? 'warn' : 'ok') },
        { ad: 'kart_kod', etiket: 'Malzeme', govde: (x) => h`<b>${x.kart_kod}</b><br><span class="muted">${x.kart_ad}</span>` },
        { ad: 'depo_kod', etiket: 'Depo' },
        { ad: 'miktar_binde', etiket: 'Miktar', hizala: 'sag',
          govde: (x) => h`${x.yon > 0 ? '+' : '−'}${miktarMetni(x.miktar_binde)} ${x.birim}` },
        { ad: 'maliyet_kodu', etiket: 'Maliyet kodu', govde: (x) => x.maliyet_kodu || '—' },
        { ad: 'aciklama', etiket: 'Açıklama', govde: (x) => x.aciklama || '—' },
      ],
    }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'STK-08:olustur') ? B.form({
    rota: '/stok/sarf', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Sarf / iade kaydı',
      aciklama: 'Kayıt doğrudan deftere yazılır ve DEĞİŞTİRİLEMEZ; hata ters kayıtla düzeltilir.',
      alanlar: h`
      ${B.alan({ ad: 'tur', etiket: 'İşlem', deger: deger.tur || 'sarf', hata: hata?.alanlar?.tur,
    secenekler: [{ deger: 'sarf', etiket: 'Sarf (çıkış)' }, { deger: 'iade', etiket: 'İade (giriş)' }] })}
      ${B.alan({ ad: 'depoId', etiket: 'Depo', zorunlu: true, deger: deger.depoId || depoId,
    hata: hata?.alanlar?.depoId, secenekler: [{ deger: '', etiket: 'Seçin…' }, ...depoSecenekleri(ctx)] })}
      ${B.alan({ ad: 'kartId', etiket: 'Stok kartı', zorunlu: true, deger: deger.kartId || '',
    hata: hata?.alanlar?.kartId, secenekler: [{ deger: '', etiket: 'Seçin…' }, ...kartSecenekleri(ctx)] })}
      ${B.alan({ ad: 'miktar', etiket: 'Miktar', zorunlu: true, deger: deger.miktar || '',
    hata: hata?.alanlar?.miktar })}
      ${B.alan({ ad: 'isEmriId', etiket: 'İş emri', deger: deger.isEmriId || '',
    secenekler: [{ deger: '', etiket: 'Bağımsız' }, ...isEmirleri] })}
      ${B.alan({ ad: 'maliyetKodu', etiket: 'Maliyet kodu', deger: deger.maliyetKodu || '' })}
      ${B.alan({ ad: 'aciklama', etiket: 'Açıklama', genis: true, deger: deger.aciklama || '' })}` }],
    eylemler: B.btn('Deftere yaz', { tur: 'acc', gonder: true, ikon: 'fa-pen-to-square' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/* ==========================================================================
   STK-09 sayım — kör sayım, fark onayı, düzeltme hareketi
   ========================================================================== */
function sayimIslemi(ctx, govde) {
  if (govde._eylem === 'ac') {
    const depo = tek('SELECT * FROM depo WHERE id = ? AND tenant_id = ?', govde.depoId, ctx.tenant.id);
    if (!depo) throw DogrulamaHatasi('Depo seçin.', { alanlar: { depoId: ['Depo bulunamadı.'] } });
    const acik = tek(
      `SELECT * FROM stok_sayimi WHERE depo_id = ? AND durum NOT IN ('onaylandi','reddedildi','iptal')`, depo.id);
    if (acik) throw Cakisma(`${depo.kod} deposunda açık sayım var (${acik.kod}).`);
    return islem(() => {
      const kod = sonrakiKod(ctx.tenant.id, 'stok_sayimi');
      const id = kimlik('hareket').replace('mov', 'sym');
      calistir(`INSERT INTO stok_sayimi (id, tenant_id, kod, depo_id, sayim_tarihi, sorumlu_id, notlar,
                  durum, olusturan, olusturuldu) VALUES (?,?,?,?,?,?,?, 'sayiliyor', ?,?)`,
        id, ctx.tenant.id, kod, depo.id,
        govde.sayimTarihi ? gunBaslangici(govde.sayimTarihi) : simdi(),
        govde.sorumluId || ctx.kullanici.id, govde.notlar || null, ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'stok_sayimi', nesneId: id, eylem: 'olustur', sonraki: { kod, depo: depo.kod } });
      return `${kod} sayımı açıldı`;
    });
  }

  const s = tek('SELECT * FROM stok_sayimi WHERE id = ? AND tenant_id = ?', govde.sayimId, ctx.tenant.id);
  if (!s) throw Bulunamadi('Sayım bulunamadı.');

  if (govde._eylem === 'satir') {
    if (s.durum !== 'sayiliyor') throw GecisIzinsiz('Yalnız "sayılıyor" durumundaki sayıma satır girilir.');
    const kart = tek('SELECT * FROM stok_karti WHERE id = ? AND tenant_id = ?', govde.kartId, ctx.tenant.id);
    if (!kart) throw DogrulamaHatasi('Stok kartı seçin.', { alanlar: { kartId: ['Kart bulunamadı.'] } });
    const sayilan = miktarAyristir(govde.sayilan, 'sayilan', { sifirSerbest: true });
    if (tek('SELECT id FROM stok_sayim_satiri WHERE sayim_id = ? AND stok_karti_id = ?', s.id, kart.id)) {
      throw Cakisma(`${kart.kod} bu sayımda zaten var.`);
    }
    islem(() => {
      /* Defter bakiyesi SAYIM ANINDA dondurulur: fark sonradan kaymaz. */
      const defterBinde = defter.bakiye(s.depo_id, kart.id);
      calistir(`INSERT INTO stok_sayim_satiri (id, sayim_id, stok_karti_id, defter_binde, sayilan_binde,
                  fark_binde, gerekce) VALUES (?,?,?,?,?,?,?)`,
        kimlik('satir'), s.id, kart.id, defterBinde, sayilan, sayilan - defterBinde,
        govde.gerekce || null);
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'stok_sayimi', nesneId: s.id, eylem: 'satir_eklendi',
        sonraki: { kart: kart.kod, defterBinde, sayilan, fark: sayilan - defterBinde } });
    });
    return `${kart.kod} sayım satırı eklendi`;
  }

  if (govde._eylem === 'onaya_gonder') {
    const satirlar = sorgu('SELECT * FROM stok_sayim_satiri WHERE sayim_id = ?', s.id);
    if (!satirlar.length) throw GecisIzinsiz('Satırsız sayım onaya gönderilemez.');
    const farkli = satirlar.filter((x) => x.fark_binde !== 0);
    const gerekcesiz = farkli.filter((x) => !x.gerekce);
    if (gerekcesiz.length) {
      throw GecisIzinsiz(`${gerekcesiz.length} farklı satırın gerekçesi yok; fark gerekçesiz onaya gönderilemez.`);
    }
    islem(() => {
      onayMotoru.onayaGonder(ctx, {
        nesne: 'stok_sayimi', nesneId: s.id, nesneKod: s.kod,
        baslik: `Stok sayım farkı: ${tek('SELECT kod FROM depo WHERE id = ?', s.depo_id)?.kod || ''}`,
        belgeSurum: s.surum, gerekce: govde.gerekce || null,
      });
      calistir(`UPDATE stok_sayimi SET durum = 'onaya_gonderildi', surum = surum + 1,
                guncelleyen = ?, guncellendi = ? WHERE id = ?`, ctx.kullanici.id, simdi(), s.id);
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'stok_sayimi', nesneId: s.id, eylem: 'onaya_gonderildi',
        sonraki: { satir: satirlar.length, farkli: farkli.length } });
    });
    return 'Sayım farkı onaya gönderildi';
  }
  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

/** Sayım onaylanınca fark DÜZELTME hareketi olarak deftere yazılır (motor). */
export function sayimOnaySonucu(ctx, sayimId, sonuc) {
  const s = tek('SELECT * FROM stok_sayimi WHERE id = ?', sayimId);
  if (!s || s.durum !== 'onaya_gonderildi') return;
  islem(() => {
    if (sonuc !== 'onaylandi') {
      calistir(`UPDATE stok_sayimi SET durum = ?, surum = surum + 1 WHERE id = ?`,
        sonuc === 'reddedildi' ? 'reddedildi' : 'revizyon_istendi', s.id);
      return;
    }
    for (const satir of sorgu('SELECT * FROM stok_sayim_satiri WHERE sayim_id = ?', s.id)) {
      if (satir.fark_binde === 0) continue;
      defter.hareketYaz(ctx, {
        depoId: s.depo_id, stokKartiId: satir.stok_karti_id,
        tur: satir.fark_binde > 0 ? 'sayim_fazla' : 'sayim_eksik',
        miktarBinde: Math.abs(satir.fark_binde),
        kaynakNesne: 'stok_sayimi', kaynakId: s.id,
        aciklama: `${s.kod} sayım farkı: ${satir.gerekce || 'gerekçe yok'}`,
      });
    }
    calistir(`UPDATE stok_sayimi SET durum = 'onaylandi', surum = surum + 1 WHERE id = ?`, s.id);
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'stok_sayimi', nesneId: s.id, eylem: 'fark_deftere_yazildi',
      gerekce: 'Sayım onayı tamamlandı', sonraki: { durum: 'onaylandi' } });
  });
}

function sayimSayfasi(ctx, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('STK-09');
  yetkiZorunlu(ctx, e.yetki);
  const sayimlar = sorgu(
    `SELECT s.*, d.kod AS depo_kod, d.ad AS depo_ad FROM stok_sayimi s JOIN depo d ON d.id = s.depo_id
      WHERE s.tenant_id = ? ORDER BY s.olusturuldu DESC LIMIT 50`, ctx.tenant.id);
  const secilenId = ctx.sorgu.get('sayim_id') || sayimlar[0]?.id || null;
  const s = secilenId ? sayimlar.find((x) => x.id === secilenId) : null;
  const satirlar = s ? sorgu(
    `SELECT ss.*, k.kod, k.ad, k.birim FROM stok_sayim_satiri ss JOIN stok_karti k ON k.id = ss.stok_karti_id
      WHERE ss.sayim_id = ? ORDER BY k.kod`, s.id) : [];
  const acikOnay = s ? tek(
    `SELECT id FROM onay_talebi WHERE nesne = 'stok_sayimi' AND nesne_id = ? AND durum = 'acik'`, s.id) : null;

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.kpiSeridi([
    { etiket: 'Açık sayım', deger: sayi(sayimlar.filter((x) => x.durum === 'sayiliyor').length), ikon: 'fa-clipboard-list' },
    { etiket: 'Onayda', deger: sayi(sayimlar.filter((x) => ['onaya_gonderildi', 'incelemede'].includes(x.durum)).length),
      ikon: 'fa-hourglass-half' },
    { etiket: 'Onaylanan', deger: sayi(sayimlar.filter((x) => x.durum === 'onaylandi').length), ikon: 'fa-circle-check' },
    { etiket: 'Toplam', deger: sayi(sayimlar.length), ikon: 'fa-list' },
  ])}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Sayımlar</b>
        <span>Fark, onaylanana kadar deftere YAZILMAZ; onayla birlikte düzeltme hareketi oluşur.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: sayimlar,
    satirRota: (x) => `/stok/sayim?sayim_id=${x.id}`,
    bosDurum: { baslik: 'Sayım yok', ikon: 'fa-clipboard-list' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod', govde: (x) => h`<b>${x.kod}</b>${
        x.id === secilenId ? h` ${B.isaret('seçili', 'info')}` : ''}` },
      { ad: 'depo_kod', etiket: 'Depo', govde: (x) => h`${x.depo_kod}<br><span class="muted">${x.depo_ad}</span>` },
      { ad: 'sayim_tarihi', etiket: 'Tarih', govde: (x) => tarih(x.sayim_tarihi) },
      { ad: 'satir', etiket: 'Satır', hizala: 'sag', govde: (x) => sayi(Number(tek(
        'SELECT COUNT(*) AS n FROM stok_sayim_satiri WHERE sayim_id = ?', x.id)?.n ?? 0)) },
      { ad: 'durum', etiket: 'Durum', govde: (x) => B.rozet(x.durum) },
    ],
  })}</div>
    </div>
    ${s ? h`<div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>${s.kod} sayım satırları</b>
        <span>Defter bakiyesi satır girildiği ANDA dondurulur; fark sonradan kaymaz.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar,
    bosDurum: { baslik: 'Satır yok', ikon: 'fa-list',
      aciklama: 'Sağdaki formdan sayılan miktarları girin.' },
    sutunlar: [
      { ad: 'kod', etiket: 'Malzeme', govde: (x) => h`<b>${x.kod}</b><br><span class="muted">${x.ad}</span>` },
      { ad: 'defter_binde', etiket: 'Defter', hizala: 'sag',
        govde: (x) => h`${miktarMetni(x.defter_binde)} ${x.birim}` },
      { ad: 'sayilan_binde', etiket: 'Sayılan', hizala: 'sag', govde: (x) => miktarMetni(x.sayilan_binde) },
      { ad: 'fark_binde', etiket: 'Fark', hizala: 'sag', govde: (x) => (x.fark_binde === 0
        ? B.isaret('yok', 'ok')
        : B.isaret(`${x.fark_binde > 0 ? '+' : '−'}${miktarMetni(Math.abs(x.fark_binde))}`,
          x.fark_binde > 0 ? 'warn' : 'danger')) },
      { ad: 'gerekce', etiket: 'Gerekçe', govde: (x) => x.gerekce || (x.fark_binde !== 0
        ? B.isaret('gerekçe gerekli', 'danger') : '—') },
    ],
  })}</div>
    </div>` : ''}
  </div>
  <div class="gv-side-stack">
    ${yetkiVar(ctx, 'STK-09:olustur') ? B.form({
    rota: '/stok/sayim', csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni sayım aç', alanlar: h`
      ${ham('<input type="hidden" name="_eylem" value="ac">')}
      ${B.alan({ ad: 'depoId', etiket: 'Depo', zorunlu: true, deger: deger.depoId || '',
      hata: hata?.alanlar?.depoId, secenekler: [{ deger: '', etiket: 'Seçin…' }, ...depoSecenekleri(ctx)] })}
      ${B.alan({ ad: 'sayimTarihi', etiket: 'Sayım tarihi', tur: 'date', deger: gunAnahtari(simdi()) })}
      ${B.alan({ ad: 'sorumluId', etiket: 'Sorumlu',
      secenekler: [{ deger: '', etiket: 'Ben' }, ...kullaniciSecenekleri(ctx)] })}` }],
    eylemler: B.btn('Sayımı aç', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}
    ${s && s.durum === 'sayiliyor' && yetkiVar(ctx, 'STK-09:olustur') ? h`
    ${B.form({
    rota: '/stok/sayim', csrf: csrfAlani(ctx),
    bolumler: [{ baslik: 'Sayım satırı ekle',
      aciklama: 'Kör sayım: defter bakiyesi formda GÖSTERİLMEZ, kayıtta dondurulur.',
      alanlar: h`
      ${ham('<input type="hidden" name="_eylem" value="satir">')}
      ${ham(`<input type="hidden" name="sayimId" value="${s.id}">`)}
      ${B.alan({ ad: 'kartId', etiket: 'Stok kartı', zorunlu: true,
      secenekler: [{ deger: '', etiket: 'Seçin…' }, ...kartSecenekleri(ctx)] })}
      ${B.alan({ ad: 'sayilan', etiket: 'Sayılan miktar', zorunlu: true })}
      ${B.alan({ ad: 'gerekce', etiket: 'Fark gerekçesi', genis: true,
      ipucu: 'Fark varsa zorunludur; gerekçesiz fark onaya gönderilemez.' })}` }],
    eylemler: B.btn('Satırı ekle', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  })}
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Sayımı tamamla</b>
        <span>Fark deftere ancak ONAYDAN sonra yazılır.</span></div></div>
      <div class="gc-body">
        <form method="post" action="/stok/sayim" data-gform="1">
          ${ham(csrfAlani(ctx))}
          <input type="hidden" name="_eylem" value="onaya_gonder">
          <input type="hidden" name="sayimId" value="${s.id}">
          ${B.alan({ ad: 'gerekce', etiket: 'Not', tur: 'metin' })}
          <div style="margin-top:12px">${B.btn('Farkı onaya gönder',
    { tur: 'acc', gonder: true, ikon: 'fa-paper-plane' })}</div>
        </form>
      </div>
    </div>` : ''}
    ${acikOnay ? B.sonucSeridi({ tur: 'warn', baslik: 'Sayım onayı bekliyor',
    kayitRota: `/onaylar/${acikOnay.id}` }) : ''}
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

/* ==========================================================================
   STK-10 hareket defteri raporu — STK-01 KABUL TESTİNİN yüzeyi
   ========================================================================== */
function hareketRaporu(ctx, { hata = null, durum = 200 } = {}) {
  /* Hareket defteri ReportLayout raporu DEĞİLDİR; `?cikti=` sessizce
     yutulmaz, açıkça reddedilir (kural 9, denetim-01 D-05). */
  ciktiDesteklenmez(ctx, { yerine: 'RPT-08 Stok ve tüketim' });
  const e = ekranNesnesi('STK-10');
  yetkiZorunlu(ctx, e.yetki);
  const depoId = ctx.sorgu.get('depo_id') || '';
  const kartId = ctx.sorgu.get('kart_id') || '';
  const tur = ctx.sorgu.get('tur') || '';
  const baslangicGun = ctx.sorgu.get('baslangic') || '';
  const bitisGun = ctx.sorgu.get('bitis') || '';

  const hareketler = defter.hareketDokumu(ctx.tenant.id, {
    depoId: depoId || null, stokKartiId: kartId || null, tur: tur || null,
    baslangic: baslangicGun ? gunBaslangici(baslangicGun) : null,
    bitis: bitisGun ? gunBaslangici(bitisGun) + GUN_MS : null,
    limit: 500,
  });
  const bakiyeler = defter.depoBakiyeleri(ctx.tenant.id,
    { depoId: depoId || null, stokKartiId: kartId || null });
  const girisToplam = hareketler.filter((x) => x.yon > 0).reduce((a, x) => a + x.miktar_binde, 0);
  const cikisToplam = hareketler.filter((x) => x.yon < 0).reduce((a, x) => a + x.miktar_binde, 0);
  const tekKalem = depoId && kartId;

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.kpiSeridi([
    { etiket: 'Hareket', deger: sayi(hareketler.length), ikon: 'fa-right-left', alt: 'bu filtrede' },
    { etiket: 'Giriş', deger: miktarMetni(girisToplam), ikon: 'fa-arrow-up' },
    { etiket: 'Çıkış', deger: miktarMetni(cikisToplam), ikon: 'fa-arrow-down' },
    { etiket: 'Net', deger: miktarMetni(girisToplam - cikisToplam), ikon: 'fa-scale-balanced' },
  ])}
${B.filtreBari({ rota: '/stok/hareketler', sorgu: ctx.sorgu, aramaYer: 'Ara…',
    filtreler: [
      { ad: 'depo_id', etiket: 'Depo', secenekler: depoSecenekleri(ctx) },
      { ad: 'kart_id', etiket: 'Stok kartı', secenekler: kartSecenekleri(ctx) },
      { ad: 'tur', etiket: 'Hareket türü', secenekler: Object.entries(defter.HAREKET_ETIKETI)
        .map(([k, v]) => ({ deger: k, etiket: v })) },
    ] })}
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Bakiye — defterden yeniden hesaplandı</b>
    <span>Bu tablo saklanan bir sayı okumaz; hareket satırlarının o an toplanmasıyla üretilir (STK-01).</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: bakiyeler,
    bosDurum: { baslik: 'Bakiye yok', ikon: 'fa-scale-balanced',
      aciklama: 'Bu filtrede hareket bulunmuyor.' },
    sutunlar: [
      { ad: 'depo_kod', etiket: 'Depo', govde: (r) => h`<b>${r.depo_kod}</b><br><span class="muted">${r.depo_ad}</span>` },
      { ad: 'kart_kod', etiket: 'Malzeme', govde: (r) => h`<b>${r.kart_kod}</b><br><span class="muted">${r.kart_ad}</span>` },
      { ad: 'bakiye_binde', etiket: 'Bakiye', hizala: 'sag',
        govde: (r) => h`<b>${miktarMetni(r.bakiye_binde)}</b> ${r.birim}` },
      { ad: 'kritik', etiket: 'Kritik seviye', hizala: 'sag', govde: (r) => (r.kritik_seviye_binde
        ? (r.bakiye_binde < r.kritik_seviye_binde
          ? B.isaret(`${miktarMetni(r.kritik_seviye_binde)} — altında`, 'danger')
          : miktarMetni(r.kritik_seviye_binde)) : '—') },
      { ad: 'son_hareket', etiket: 'Son hareket', govde: (r) => (r.son_hareket ? tarihSaat(r.son_hareket) : '—') },
    ],
  })}</div>
</div>
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Hareket defteri</b>
    <span>Satırlar DEĞİŞTİRİLEMEZ ve SİLİNEMEZ (veritabanı tetikleyicisiyle zorlanır);
      düzeltme ters kayıtla yapılır.${tekKalem ? ' Yürüyen bakiye tek depo+kart seçildiğinde gösterilir.' : ''}</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: hareketler,
    bosDurum: { baslik: 'Hareket yok', ikon: 'fa-right-left' },
    sutunlar: [
      { ad: 'zaman', etiket: 'Zaman', govde: (x) => tarihSaat(x.zaman) },
      { ad: 'tur', etiket: 'Tür', govde: (x) => h`${defter.HAREKET_ETIKETI[x.tur] || x.tur}${
        x.ters_kayit_id ? h`<br>${B.isaret('ters kayıt', 'warn')}` : ''}` },
      { ad: 'depo_kod', etiket: 'Depo' },
      { ad: 'kart_kod', etiket: 'Malzeme', govde: (x) => h`<b>${x.kart_kod}</b><br><span class="muted">${x.kart_ad}</span>` },
      { ad: 'miktar_binde', etiket: 'Miktar', hizala: 'sag', govde: (x) => h`<b>${
        x.yon > 0 ? '+' : '−'}${miktarMetni(x.miktar_binde)}</b> ${x.birim}` },
      ...(tekKalem ? [{ ad: 'yuruyen_binde', etiket: 'Yürüyen bakiye', hizala: 'sag',
        govde: (x) => miktarMetni(x.yuruyen_binde) }] : []),
      { ad: 'kaynak_nesne', etiket: 'Kaynak', govde: (x) => (x.kaynak_nesne
        ? h`${x.kaynak_nesne}<br><span class="muted">${String(x.kaynak_id).slice(0, 12)}…</span>` : '—') },
      { ad: 'olusturan', etiket: 'Yazan', govde: (x) => kullaniciAdi(x.olusturan) },
      { ad: 'islem', etiket: '', govde: (x) => {
        if (!yetkiVar(ctx, 'STK-10:disa_aktar') || x.ters_kayit_id) return '—';
        if (tek('SELECT id FROM stok_hareketi WHERE ters_kayit_id = ?', x.id)) {
          return B.isaret('düzeltildi', 'info');
        }
        return h`<form method="post" action="/stok/hareketler" style="display:flex;gap:6px">
          ${ham(csrfAlani(ctx))}
          <input type="hidden" name="hareketId" value="${x.id}">
          <input type="text" name="gerekce" placeholder="Gerekçe" aria-label="Gerekçe" style="max-width:130px">
          <button class="btn btn-ghost btn-sm" type="submit">Ters kayıt</button></form>`;
      } },
    ],
  })}</div>
</div>
${B.veriTarihi(simdi())}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}
