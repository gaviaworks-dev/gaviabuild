/* ============================================================================
   GENEL ARAMA VE ARŞİV — GLB-07, SET-17
   ----------------------------------------------------------------------------
   GLB-07: üst bardaki arama kutusunun hedefi. İki kural belirleyicidir:
     · ARAMA YETKİYİ AŞMAZ. Her kayıt türü kendi ekran yetkisiyle taranır;
       göremeyeceğiniz bir kayıt arama sonucunda BAŞLIK OLARAK BİLE görünmez.
     · Kapsam (ABAC) da uygulanır: `kendi_kaydi` kurallı rol yalnız kendi
       kayıtlarını bulur.

   SET-17: saklama süresi dolan belge SİLİNMEZ; önce ARŞİV İŞİ açılır, karar
   kayıt altına alınır ve ancak onaydan sonra uygulanır. Silme geri alınamaz
   bir işlemdir; "otomatik temizlik" sessiz veri kaybıdır.
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, tarihSaat, GUN_MS } from '../cekirdek/zaman.mjs';
import { DogrulamaHatasi, GecisIzinsiz, Bulunamadi, UygulamaHatasi } from '../cekirdek/hata.mjs';
import { sayac } from './kayit-modulu.mjs';
import {
  ekranNesnesi, hataNesnesi, ciz, kapsamFiltresi,
  B, h, ham, sayi, csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar,
  sorgu, tek, calistir, islem, audit, sonrakiKod,
} from './ortak.mjs';

/**
 * Aranabilir kayıt türleri. Her satır KENDİ EKRAN YETKİSİNİ taşır: yetki yoksa
 * o tür hiç sorgulanmaz — sonuç sayısı bile sızmaz.
 */
const ARAMA_KAYNAKLARI = [
  { tablo: 'proje', yetki: 'PRJ-01:goruntule', etiket: 'Proje', rota: '/projeler',
    alanlar: ['kod', 'ad'], baslik: 'ad' },
  { tablo: 'santiye', yetki: 'SITE-01:goruntule', etiket: 'Şantiye', rota: '/santiyeler',
    alanlar: ['kod', 'ad'], baslik: 'ad' },
  { tablo: 'gorev', yetki: 'TASK-01:goruntule', etiket: 'Görev', rota: '/gorevler',
    alanlar: ['kod', 'baslik'], baslik: 'baslik' },
  { tablo: 'personel', yetki: 'HR-01:goruntule', etiket: 'Personel', rota: '/personel',
    alanlar: ['kod', 'ad_soyad'], baslik: 'ad_soyad' },
  { tablo: 'talep', yetki: 'PRC-01:goruntule', etiket: 'Satın alma talebi', rota: '/satinalma/talepler',
    alanlar: ['kod', 'baslik'], baslik: 'baslik' },
  { tablo: 'siparis', yetki: 'PRC-08:goruntule', etiket: 'Sipariş', rota: '/siparisler',
    alanlar: ['kod', 'baslik'], baslik: 'baslik' },
  { tablo: 'stok_karti', yetki: 'STK-02:goruntule', etiket: 'Stok kartı', rota: '/stok-kartlari',
    alanlar: ['kod', 'ad'], baslik: 'ad' },
  { tablo: 'varlik', yetki: 'AST-01:goruntule', etiket: 'Varlık', rota: '/varliklar',
    alanlar: ['kod', 'ad', 'plaka'], baslik: 'ad' },
  { tablo: 'sozlesme', yetki: 'CNT-01:goruntule', etiket: 'Sözleşme', rota: '/sozlesmeler',
    alanlar: ['kod', 'ad'], baslik: 'ad' },
  { tablo: 'hakedis', yetki: 'CNT-07:goruntule', etiket: 'Hakediş', rota: '/hakedisler',
    alanlar: ['kod', 'donem'], baslik: 'kod' },
  { tablo: 'fatura', yetki: 'FIN-13:goruntule', etiket: 'Fatura', rota: '/faturalar',
    alanlar: ['kod', 'fatura_no'], baslik: 'fatura_no' },
  { tablo: 'dokuman', yetki: 'DOC-01:goruntule', etiket: 'Doküman', rota: '/dokumanlar',
    alanlar: ['kod', 'ad'], baslik: 'ad' },
  { tablo: 'ncr', yetki: 'QLT-01:goruntule', etiket: 'Uygunsuzluk (NCR)', rota: '/kalite/ncr',
    alanlar: ['kod', 'baslik'], baslik: 'baslik' },
  { tablo: 'isg_olayi', yetki: 'HSE-02:goruntule', etiket: 'İSG olayı', rota: '/isg/olaylar',
    alanlar: ['kod', 'baslik'], baslik: 'baslik' },
  /* Kart aramasında TAM NUMARA aranmaz; yalnız kod ve son dört hane (K-085). */
  { tablo: 'kart', yetki: 'CRD-02:goruntule', etiket: 'Kart', rota: '/kartlar',
    alanlar: ['kod', 'maskeli_no'], baslik: 'kod' },
  { tablo: 'musteri', yetki: 'EXT-01:goruntule', etiket: 'Müşteri / işveren', rota: '/musteriler',
    alanlar: ['kod', 'ad'], baslik: 'ad' },
];

export function kur(y, ekranRota) {
  ekranRota(y, 'GLB-07', { get: (ctx) => aramaEkrani(ctx) });

  ekranRota(y, 'SET-17', {
    get: (ctx) => arsivEkrani(ctx),
    post: (ctx, govde) => {
      const e = ekranNesnesi('SET-17');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const mesaj = arsivIslemi(ctx, govde);
        return yonlendir(ctx, `/ayarlar/arsiv?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return arsivEkrani(ctx, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });
}

/* ==========================================================================
   GLB-07 — genel arama
   ========================================================================== */
function aramaEkrani(ctx) {
  const e = ekranNesnesi('GLB-07');
  yetkiZorunlu(ctx, e.yetki);
  const q = (ctx.sorgu.get('q') || '').trim();
  const turFiltre = ctx.sorgu.get('tur') || null;

  /* YETKİ SÜZGECİ ÖNCE: göremeyeceğiniz tür hiç sorgulanmaz. */
  const izinliKaynaklar = ARAMA_KAYNAKLARI.filter((k) => yetkiVar(ctx, k.yetki));
  const sonuclar = [];
  let toplam = 0;

  if (q.length >= 2) {
    for (const k of izinliKaynaklar) {
      if (turFiltre && k.tablo !== turFiltre) continue;
      /* KAPSAM SÜZGECİ (ABAC): kendi_kaydi kurallı rol yalnız kendi kaydını bulur. */
      const kapsam = kapsamFiltresi(ctx, {});
      const arama = k.alanlar.map((a) => `${a} LIKE ?`).join(' OR ');
      const p = [...kapsam.parametreler, ...k.alanlar.map(() => `%${q}%`)];
      let satirlar = [];
      try {
        satirlar = sorgu(
          `SELECT * FROM ${k.tablo} WHERE ${kapsam.nerede} AND (${arama})
            ORDER BY olusturuldu DESC LIMIT 8`, ...p);
      } catch {
        /* Kapsam sütunu olmayan tablo: yalnız tenant süzgeciyle (K-042 kalıbı). */
        satirlar = sorgu(
          `SELECT * FROM ${k.tablo} WHERE tenant_id = ? AND (${arama})
            ORDER BY olusturuldu DESC LIMIT 8`, ctx.tenant.id, ...k.alanlar.map(() => `%${q}%`));
      }
      if (satirlar.length) {
        toplam += satirlar.length;
        sonuclar.push({ ...k, satirlar });
      }
    }
  }

  const icerik = h`
<div class="gv-card">
  <div class="gc-body">
    <form method="get" action="/arama" class="rpt-filtre">
      <label class="gv-filtre-alan" style="flex:1">
        <span>Ara</span>
        <input type="search" name="q" value="${q}" autofocus
          placeholder="Kod, ad, başlık, plaka, fatura no…" minlength="2">
      </label>
      <label class="gv-filtre-alan"><span>Kayıt türü</span>
        <select name="tur"><option value="">Tümü</option>
          ${izinliKaynaklar.map((k) => h`<option value="${k.tablo}"${
    ham(turFiltre === k.tablo ? ' selected' : '')}>${k.etiket}</option>`)}
        </select></label>
      <button class="btn btn-acc" type="submit"><i class="fa-solid fa-magnifying-glass"></i> Ara</button>
    </form>
    <p class="gf-hint" style="margin:12px 0 0">
      Arama yetkinizi AŞMAZ: göremeyeceğiniz bir kayıt burada başlık olarak bile görünmez.
      ${izinliKaynaklar.length} kayıt türünde arama yapabiliyorsunuz.
      Kart aramasında tam numara aranmaz; yalnız kod ve son dört hane.</p>
  </div>
</div>

${q.length >= 2 ? (sonuclar.length ? h`
<div style="margin-top:18px;display:flex;flex-direction:column;gap:18px">
  ${sonuclar.map((g) => h`<div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>${g.etiket}</b>
      <span>${g.satirlar.length} sonuç</span></div></div>
    <div class="gc-body flush">${B.tablo({
    satirlar: g.satirlar,
    satirRota: (r) => `${g.rota}/${r.id}`,
    bosDurum: { baslik: 'Sonuç yok' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'baslik', etiket: 'Kayıt',
        govde: (r) => h`<a href="${g.rota}/${r.id}"><b>${r[g.baslik] || r.kod}</b></a>` },
      { ad: 'durum', etiket: 'Durum', govde: (r) => r.durum || '—' },
      { ad: 'olusturuldu', etiket: 'Oluşturuldu',
        govde: (r) => (r.olusturuldu ? tarih(r.olusturuldu) : '—') },
    ],
  })}</div>
  </div>`)}
</div>`
    : h`<div style="margin-top:18px">${B.sonucSeridi({ tur: 'warn',
      baslik: `"${q}" için sonuç yok`,
      aciklama: 'Erişebildiğiniz kayıtlar arasında eşleşme bulunamadı. Kapsamınız dışındaki '
        + 'kayıtlar aramaya girmez.' })}</div>`)
    : h`<div style="margin-top:18px">${B.sonucSeridi({ tur: 'ok', baslik: 'En az iki karakter girin',
      aciklama: 'Arama sunucuda çalışır ve sonuç sayısı gerçek sorgudan gelir.' })}</div>`}
${q.length >= 2 ? h`<div class="gv-card" style="margin-top:18px"><div class="gc-body">
  <p class="gf-hint" style="margin:0">Toplam <b>${toplam}</b> sonuç · veri tarihi
    ${tarihSaat(simdi())}</p></div></div>` : ''}`;
  return html(ctx, 200, ciz(ctx, e, icerik));
}

/* ==========================================================================
   SET-17 — arşiv ve saklama işleri
   ========================================================================== */
function arsivEkrani(ctx, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('SET-17');
  yetkiZorunlu(ctx, e.yetki);

  /* Saklama süresi dolan belgeler — belge türündeki `saklama_ay` alanından
     HESAPLANIR, saklanmaz. */
  const adaylar = sorgu(
    `SELECT d.id, d.kod, d.ad, d.belge_turu, d.olusturuldu, bt.ad AS tur_ad, bt.saklama_ay
       FROM dokuman d
       JOIN belge_turu bt ON bt.kod = d.belge_turu AND bt.tenant_id = d.tenant_id
      WHERE d.tenant_id = ? AND bt.saklama_ay IS NOT NULL
        AND d.olusturuldu + (bt.saklama_ay * 30 * 86400000) < ?
        AND NOT EXISTS (SELECT 1 FROM arsiv_isi a WHERE a.nesne = 'dokuman' AND a.nesne_id = d.id
                          AND a.durum NOT IN ('reddedildi','iptal'))
      ORDER BY d.olusturuldu LIMIT 100`, ctx.tenant.id, simdi());

  const isler = sorgu(
    `SELECT * FROM arsiv_isi WHERE tenant_id = ? ORDER BY olusturuldu DESC LIMIT 100`, ctx.tenant.id);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.sonucSeridi({ tur: 'warn', baslik: 'Saklama süresi dolan belge OTOMATİK SİLİNMEZ',
    aciklama: 'Önce arşiv işi açılır, karar kayıt altına alınır ve ancak onaydan sonra '
      + 'uygulanır. Silme geri alınamaz; sessiz otomatik temizlik veri kaybıdır.' })}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Süresi dolan belge', deger: sayi(adaylar.length), ikon: 'fa-box-archive',
        ton: adaylar.length ? 'warn' : 'ok' },
      { etiket: 'Bekleyen iş', ikon: 'fa-hourglass-half',
        deger: sayi(isler.filter((x) => x.durum === 'bekliyor').length) },
      { etiket: 'Uygulanan', ikon: 'fa-circle-check',
        deger: sayi(isler.filter((x) => x.durum === 'uygulandi').length) },
    ]),
    filtre: '',
    icerik: h`
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Saklama süresi dolan belgeler</b>
    <span>Süre, belge türündeki saklama ayından HESAPLANIR; belgede saklanmaz.</span></div></div>
  <div class="gc-body flush">${B.tablo({
      satirlar: adaylar,
      bosDurum: { baslik: 'Süresi dolan belge yok', ikon: 'fa-box-archive',
        aciklama: 'Saklama süresi dolan belge bulunmuyor.' },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'ad', etiket: 'Belge',
          govde: (d) => h`<a href="/dokumanlar/${d.id}"><b>${d.ad}</b></a><br>
            <span class="muted">${d.tur_ad} · ${d.saklama_ay} ay saklama</span>` },
        { ad: 'olusturuldu', etiket: 'Oluşturuldu', govde: (d) => tarih(d.olusturuldu) },
        { ad: 'islem', etiket: '', govde: (d) => (yetkiVar(ctx, 'SET-17:olustur')
          ? h`<form method="post" action="/ayarlar/arsiv" style="display:inline">
              ${ham(csrfAlani(ctx))}<input type="hidden" name="_eylem" value="is_ac">
              <input type="hidden" name="nesneId" value="${d.id}">
              <button class="btn btn-ghost btn-sm" type="submit">Arşiv işi aç</button></form>` : '') },
      ],
    })}</div>
</div>
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Arşiv işleri</b>
    <span>Her karar kim tarafından, ne zaman ve neden verildiği ile kayıtlıdır.</span></div></div>
  <div class="gc-body flush">${B.tablo({
      satirlar: isler,
      bosDurum: { baslik: 'Arşiv işi yok', ikon: 'fa-box-archive' },
      sutunlar: [
        { ad: 'kod', etiket: 'Kod' },
        { ad: 'nesne', etiket: 'Kayıt',
          govde: (x) => h`${x.nesne}<br><span class="muted">${
            x.nesne_id ? tek('SELECT kod FROM dokuman WHERE id = ?', x.nesne_id)?.kod || x.nesne_id : '—'}</span>` },
        { ad: 'eylem', etiket: 'Eylem', govde: (x) => ({ arsivle: 'Arşivle',
          anonimlestir: 'Anonimleştir', sil: 'Sil' }[x.eylem] || x.eylem) },
        { ad: 'saklama_bitis', etiket: 'Saklama bitişi',
          govde: (x) => (x.saklama_bitis ? tarih(x.saklama_bitis) : '—') },
        { ad: 'durum', etiket: 'Durum', govde: (x) => B.rozet(
          x.durum === 'uygulandi' ? 'onaylandi'
            : ['reddedildi', 'iptal'].includes(x.durum) ? 'reddedildi' : 'beklemede', x.durum) },
        { ad: 'karar', etiket: 'Karar',
          govde: (x) => (x.karar_zamani
            ? h`${tarihSaat(x.karar_zamani)}<br><span class="muted">${x.gerekce || ''}</span>` : '—') },
        { ad: 'islem', etiket: '', govde: (x) => (x.durum === 'bekliyor'
          && yetkiVar(ctx, 'SET-17:guncelle')
          ? h`<form method="post" action="/ayarlar/arsiv" style="display:inline">
              ${ham(csrfAlani(ctx))}<input type="hidden" name="isId" value="${x.id}">
              <input type="hidden" name="gerekce" value="Saklama süresi doldu">
              <button class="btn btn-ghost btn-sm" type="submit" name="_eylem" value="onayla">Onayla</button>
              <button class="btn btn-ghost btn-sm" type="submit" name="_eylem" value="reddet">Reddet</button>
            </form>` : '') },
      ],
    })}</div>
</div>`,
    veriZamani: simdi(),
  })}`;
  return html(ctx, durum, ciz(ctx, e, icerik));
}

function arsivIslemi(ctx, govde) {
  if (govde._eylem === 'is_ac') {
    const d = tek('SELECT * FROM dokuman WHERE id = ? AND tenant_id = ?', govde.nesneId, ctx.tenant.id);
    if (!d) throw Bulunamadi('Belge bulunamadı.');
    if (tek(`SELECT id FROM arsiv_isi WHERE nesne = 'dokuman' AND nesne_id = ?
               AND durum NOT IN ('reddedildi','iptal')`, d.id)) {
      throw GecisIzinsiz('Bu belge için zaten açık bir arşiv işi var.');
    }
    const bt = tek('SELECT * FROM belge_turu WHERE tenant_id = ? AND kod = ?',
      ctx.tenant.id, d.belge_turu);
    return islem(() => {
      const kod = sonrakiKod(ctx.tenant.id, 'arsiv_isi');
      const id = kimlik('arsiv');
      calistir(`INSERT INTO arsiv_isi (id, tenant_id, kod, nesne, nesne_id, belge_turu, eylem,
                  saklama_bitis, durum, olusturan, olusturuldu)
                VALUES (?,?,?, 'dokuman', ?,?, 'arsivle', ?, 'bekliyor', ?,?)`,
        id, ctx.tenant.id, kod, d.id, d.belge_turu,
        bt?.saklama_ay ? d.olusturuldu + bt.saklama_ay * 30 * GUN_MS : null,
        ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId,
        ip: ctx.ip, nesne: 'arsiv_isi', nesneId: id, eylem: 'olustur',
        sonraki: { kod, belge: d.kod, eylem: 'arsivle' } });
      return `${kod} arşiv işi açıldı — karar bekliyor`;
    });
  }

  if (govde._eylem === 'onayla' || govde._eylem === 'reddet') {
    const x = tek('SELECT * FROM arsiv_isi WHERE id = ? AND tenant_id = ?', govde.isId, ctx.tenant.id);
    if (!x) throw Bulunamadi('Arşiv işi bulunamadı.');
    if (x.durum !== 'bekliyor') throw GecisIzinsiz('Bu iş zaten karara bağlanmış.');
    /* DÖRT GÖZ: işi açan kişi tek başına onaylayamaz. */
    if (govde._eylem === 'onayla' && x.olusturan === ctx.kullanici.id) {
      throw GecisIzinsiz('Açtığınız arşiv işini siz onaylayamazsınız (dört göz ilkesi). '
        + 'Silme ve anonimleştirme geri alınamaz işlemlerdir.');
    }
    const gerekce = String(govde.gerekce || '').trim();
    if (!gerekce) throw DogrulamaHatasi('Gerekçe zorunludur.', { alanlar: { gerekce: ['Gerekçe girin.'] } });

    return islem(() => {
      const yeni = govde._eylem === 'onayla' ? 'onaylandi' : 'reddedildi';
      calistir(`UPDATE arsiv_isi SET durum = ?, gerekce = ?, karar_veren = ?, karar_zamani = ?,
                  guncelleyen = ?, guncellendi = ? WHERE id = ?`,
        yeni, gerekce, ctx.kullanici.id, simdi(), ctx.kullanici.id, simdi(), x.id);

      /* Onaylanan ARŞİVLEME uygulanır; belge SİLİNMEZ, arşiv durumuna geçer. */
      if (yeni === 'onaylandi' && x.eylem === 'arsivle' && x.nesne === 'dokuman') {
        const d = tek('SELECT * FROM dokuman WHERE id = ?', x.nesne_id);
        if (d && d.durum !== 'arsiv') {
          calistir(`UPDATE dokuman SET durum = 'arsiv', guncelleyen = ?, guncellendi = ?,
                      surum = surum + 1 WHERE id = ?`, ctx.kullanici.id, simdi(), d.id);
        }
        calistir(`UPDATE arsiv_isi SET durum = 'uygulandi' WHERE id = ?`, x.id);
      }
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId,
        ip: ctx.ip, nesne: 'arsiv_isi', nesneId: x.id, eylem: `karar:${yeni}`, gerekce,
        onceki: { durum: 'bekliyor' }, sonraki: { durum: yeni } });
      return yeni === 'onaylandi' ? 'Arşiv işi onaylandı ve uygulandı' : 'Arşiv işi reddedildi';
    });
  }

  throw DogrulamaHatasi('Bilinmeyen işlem.');
}
