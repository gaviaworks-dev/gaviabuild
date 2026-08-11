/* ============================================================================
   DOKÜMAN ROTALARI — DOC-01, DOC-02, DOC-03 + SET-08, SET-09, SET-12
   ========================================================================== */
import { html, yonlendir, yanitla } from '../cekirdek/http.mjs';
import { sorgu, tek, calistir, islem } from '../cekirdek/db.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarihSaat, tarih, gunBaslangici } from '../cekirdek/zaman.mjs';
import { UygulamaHatasi, Bulunamadi, DogrulamaHatasi } from '../cekirdek/hata.mjs';
import { cokluParcaOku, IZINLI_MIME } from '../cekirdek/coklu-parca.mjs';
import { manifest } from '../cekirdek/yapilandirma.mjs';
import * as audit from '../cekirdek/audit.mjs';
import { yetkiZorunlu, yetkiVar, kapsamZorunlu, maskele } from '../moduller/kimlik/yetki.mjs';
import { csrfZorunlu, csrfAlani } from '../moduller/kimlik/oturum.mjs';
import * as belgeServisi from '../moduller/dokuman/servis.mjs';
import { kabuk } from '../web/kabuk.mjs';
import { h, ham, sayi } from '../web/temel.mjs';
import * as B from '../web/bilesenler.mjs';
import { sayaclar } from './calisma.mjs';

const ekranNesnesi = (kod) => manifest().ekranlar.find((e) => e.kod === kod);
const ciz = (ctx, ekran, icerik, ek = {}) => {
  const s = sayaclar(ctx);
  return kabuk(ctx, { ekran, icerik, onayAdedi: s.onay, bildirimAdedi: s.bildirim, ...ek });
};
const hataNesnesi = (e) => ({ kod: e.kod, mesaj: e.mesaj, alanlar: e.alanlar });
const boyut = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);

const SINIF_ETIKET = { ic: 'İç belge', gizli: 'Gizli', paylasilan: 'Paylaşılan', resmi: 'Resmi' };

export function kur(y, ekranRota) {
  /* --- DOC-01 Doküman merkezi ------------------------------------------- */
  ekranRota(y, 'DOC-01', {
    get: (ctx) => {
      const e = ekranNesnesi('DOC-01');
      yetkiZorunlu(ctx, e.yetki);
      const { sayfa, boyut: sayfaBoyutu, atla } = B.sayfalamaGirdisi(ctx.sorgu);
      const q = (ctx.sorgu.get('q') || '').trim();
      const sinif = ctx.sorgu.get('sinif') || '';
      const tur = ctx.sorgu.get('belgeTuru') || '';
      const kosullar = ['tenant_id = ?']; const p = [ctx.tenant.id];
      if (q) { kosullar.push('(ad LIKE ? OR kod LIKE ?)'); p.push(`%${q}%`, `%${q}%`); }
      if (sinif) { kosullar.push('sinif = ?'); p.push(sinif); }
      if (tur) { kosullar.push('belge_turu = ?'); p.push(tur); }
      /* Gizli sınıf yalnız yetkili rollerde listelenir (alan/kayıt düzeyi koruma). */
      if (!yetkiVar(ctx, 'DOC-03:goruntule')) { kosullar.push("sinif <> 'gizli'"); }
      const nerede = kosullar.join(' AND ');

      const toplam = Number(tek(`SELECT COUNT(*) AS n FROM dokuman WHERE ${nerede}`, ...p)?.n ?? 0);
      const satirlar = sorgu(`SELECT * FROM dokuman WHERE ${nerede} ORDER BY olusturuldu DESC LIMIT ? OFFSET ?`,
        ...p, sayfaBoyutu, atla);
      const turler = sorgu('SELECT kod, ad FROM belge_turu WHERE tenant_id = ? ORDER BY ad', ctx.tenant.id)
        .map((t) => ({ deger: t.kod, etiket: t.ad }));

      const icerik = h`
${ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: 'Doküman kaydedildi',
        aciklama: 'Dosya içerik özetiyle (SHA-256) saklandı; sürüm 1 açıldı.',
        kayitRota: `/dokumanlar/${ctx.sorgu.get('olusan')}` }) : ''}
${B.listeDuzeni({
        kpi: B.kpiSeridi([
          { etiket: 'Doküman', deger: sayi(Number(tek('SELECT COUNT(*) AS n FROM dokuman WHERE tenant_id = ?', ctx.tenant.id)?.n ?? 0)), ikon: 'fa-folder-open' },
          { etiket: 'Toplam sürüm', deger: sayi(Number(tek(`SELECT COUNT(*) AS n FROM dokuman_surumu s
              JOIN dokuman d ON d.id = s.dokuman_id WHERE d.tenant_id = ?`, ctx.tenant.id)?.n ?? 0)), ikon: 'fa-layer-group' },
          { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
        ]),
        filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Belge adı veya kodu…',
          filtreler: [
            { ad: 'sinif', etiket: 'Sınıf', secenekler: Object.entries(SINIF_ETIKET).map(([k, v]) => ({ deger: k, etiket: v })) },
            { ad: 'belgeTuru', etiket: 'Belge türü', secenekler: turler },
          ] }),
        icerik: B.tablo({
          satirlar,
          satirRota: (r) => `/dokumanlar/${r.id}`,
          bosDurum: { baslik: 'Doküman yok', aciklama: 'Kanonik belge kaydı burada tutulur; her yükleme yeni sürüm açar.',
            ikon: 'fa-folder-open', eylem: B.btn('Yeni doküman', { tur: 'acc', rota: '/dokumanlar/yeni', ikon: 'fa-plus' }) },
          sutunlar: [
            { ad: 'kod', etiket: 'Kod' },
            { ad: 'ad', etiket: 'Belge', govde: (r) => h`<a href="/dokumanlar/${r.id}"><b>${r.ad}</b></a>` },
            { ad: 'belge_turu', etiket: 'Tür' },
            { ad: 'sinif', etiket: 'Sınıf', govde: (r) => B.isaret(SINIF_ETIKET[r.sinif] || r.sinif,
              r.sinif === 'gizli' ? 'danger' : r.sinif === 'resmi' ? 'info' : 'nötr') },
            { ad: 'aktif_surum', etiket: 'Sürüm', hizala: 'sag', govde: (r) => `v${r.aktif_surum}` },
            { ad: 'gecerlilik', etiket: 'Geçerlilik', govde: (r) => !r.gecerlilik ? '—'
              : r.gecerlilik < simdi() ? B.isaret(`${tarih(r.gecerlilik)} — süresi doldu`, 'danger') : tarih(r.gecerlilik) },
          ],
        }),
        sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut: sayfaBoyutu, toplam }),
        veriZamani: simdi(),
      })}`;
      return html(ctx, 200, ciz(ctx, e, icerik, {
        eylemler: yetkiVar(ctx, 'DOC-02:olustur')
          ? B.btn('Yeni doküman', { tur: 'acc', rota: '/dokumanlar/yeni', ikon: 'fa-plus' }) : null,
      }));
    },
  });

  /* --- DOC-02 Yeni doküman ---------------------------------------------- */
  ekranRota(y, 'DOC-02', {
    get: (ctx) => {
      const e = ekranNesnesi('DOC-02');
      yetkiZorunlu(ctx, e.yetki);
      return html(ctx, 200, ciz(ctx, e, dokumanFormu(ctx, {})));
    },
    post: async (ctx) => {
      const e = ekranNesnesi('DOC-02');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      /* multipart gövde router'dan önce okunmadığı için burada çözülür. */
      const { alanlar, dosyalar } = await cokluParcaOku(ctx.istek);
      csrfZorunlu(ctx, alanlar);
      try {
        const sonuc = belgeServisi.olustur(ctx, {
          ad: alanlar.ad, belgeTuru: alanlar.belgeTuru, sinif: alanlar.sinif || 'ic',
          aciklama: alanlar.aciklama,
          gecerlilik: alanlar.gecerlilik ? gunBaslangici(alanlar.gecerlilik) : null,
        }, dosyalar.find((d) => d.alan === 'dosya'));
        return yonlendir(ctx, `/dokumanlar?olusan=${encodeURIComponent(sonuc.id)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, ciz(ctx, e, dokumanFormu(ctx, { deger: alanlar, hata: hataNesnesi(err) })));
      }
    },
  });

  /* --- DOC-03 Doküman detayı (sürümler, indirme, denetim) --------------- */
  ekranRota(y, 'DOC-03', {
    get: (ctx, _g, params) => {
      const e = ekranNesnesi('DOC-03');
      yetkiZorunlu(ctx, e.yetki);
      const d = belgeServisi.detay(ctx.tenant.id, params.id);
      if (!d) throw Bulunamadi('Doküman bulunamadı.');
      kapsamZorunlu(ctx, 'dokuman', d);

      /* İndirme isteği aynı rotadan; dosya baytları depodan gelir. */
      const indir = ctx.sorgu.get('indir');
      if (indir) {
        const s = tek('SELECT * FROM dokuman_surumu WHERE dokuman_id = ? AND surum_no = ?', d.id, Number(indir));
        if (!s) throw Bulunamadi('Sürüm bulunamadı.');
        const icerik = belgeServisi.dosyaOku(s.depo_yolu);
        islem(() => audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
          nesne: 'dokuman', nesneId: d.id, eylem: 'indir', sonraki: { surum: s.surum_no, ozet: s.ozet } }));
        return yanitla(ctx, 200, icerik, {
          'Content-Type': s.mime,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(s.dosya_adi)}"`,
          'Cache-Control': 'no-store',
        });
      }

      const surumler = belgeServisi.surumler(d.id);
      const gecmis = audit.gecmis('dokuman', d.id);
      const icerik = h`
${ctx.sorgu.get('surum') ? B.sonucSeridi({ tur: 'ok', baslik: 'Yeni sürüm eklendi',
        aciklama: 'Önceki sürüm değiştirilmedi; geçmiş sürümler indirilebilir durumda kaldı.' }) : ''}
${B.detayOzetSeridi({
        kod: d.kod, baslik: d.ad, durum: d.durum, surum: d.aktif_surum,
        isaretler: d.gecerlilik && d.gecerlilik < simdi() ? [{ metin: 'geçerlilik doldu', ton: 'danger' }] : [],
        bilgiler: [
          { etiket: 'Belge türü', deger: d.belge_turu },
          { etiket: 'Sınıf', deger: SINIF_ETIKET[d.sinif] || d.sinif },
          { etiket: 'Geçerlilik', deger: d.gecerlilik ? tarih(d.gecerlilik) : '—' },
          { etiket: 'Aktif sürüm', deger: `v${d.aktif_surum}` },
          { etiket: 'Oluşturma', deger: tarihSaat(d.olusturuldu) },
          { etiket: 'Hukuki bekletme', deger: d.hukuki_bekletme ? 'Var' : 'Yok' },
        ],
        birincilEylem: B.btn('Aktif sürümü indir', { tur: 'acc', rota: `/dokumanlar/${d.id}?indir=${d.aktif_surum}`, ikon: 'fa-download' }),
      })}
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Sürümler</b>
    <span>Sürüm satırı değiştirilemez; düzeltme yeni sürüm olarak eklenir (§5.4).</span></div></div>
  <div class="gc-body flush">${B.tablo({
        satirlar: surumler,
        sutunlar: [
          { ad: 'surum_no', etiket: 'Sürüm', hizala: 'sag', govde: (r) => h`<b>v${r.surum_no}</b>${
            r.surum_no === d.aktif_surum ? h` ${B.isaret('aktif', 'ok')}` : ''}` },
          { ad: 'dosya_adi', etiket: 'Dosya', govde: (r) => h`<a href="/dokumanlar/${d.id}?indir=${r.surum_no}">${r.dosya_adi}</a>` },
          { ad: 'mime', etiket: 'Tür' },
          { ad: 'bayt', etiket: 'Boyut', hizala: 'sag', govde: (r) => boyut(r.bayt) },
          { ad: 'ozet', etiket: 'İçerik özeti', govde: (r) => h`<code>${r.ozet.slice(0, 12)}…</code>` },
          { ad: 'yukleyen_ad', etiket: 'Yükleyen', govde: (r) => h`${r.yukleyen_ad}<br><span class="muted">${tarihSaat(r.yuklendi)}</span>` },
        ],
      })}</div>
</div>
${yetkiVar(ctx, 'DOC-03:guncelle') ? h`<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Yeni sürüm yükle</b>
    <span>Mevcut sürüm korunur; yükleme yeni sürüm satırı açar.</span></div></div>
  <div class="gc-body">
    <form method="post" action="/dokumanlar/${d.id}" enctype="multipart/form-data" data-gform="1">
      ${ham(csrfAlani(ctx))}
      <div class="gform-alanlar">
        ${B.alan({ ad: 'dosya', etiket: 'Dosya', tur: 'file', zorunlu: true })}
        ${B.alan({ ad: 'aciklama', etiket: 'Revizyon açıklaması', zorunlu: true })}
      </div>
      <div class="form-foot">${B.btn('Yeni sürümü kaydet', { tur: 'acc', gonder: true, ikon: 'fa-arrow-up-from-bracket' })}</div>
    </form>
  </div>
</div>` : ''}
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Denetim geçmişi</b>
    <span>Kim, ne zaman yükledi ve indirdi — değiştirilemez kayıt.</span></div></div>
  <div class="gc-body flush">${B.tablo({
        satirlar: gecmis.slice().reverse(),
        bosDurum: { baslik: 'Kayıt yok' },
        sutunlar: [
          { ad: 'zaman', etiket: 'Zaman', govde: (r) => tarihSaat(r.zaman) },
          { ad: 'eylem', etiket: 'Eylem' },
          { ad: 'kullanici_id', etiket: 'Kullanıcı',
            govde: (r) => tek('SELECT ad_soyad FROM kullanici WHERE id = ?', r.kullanici_id)?.ad_soyad || '—' },
          { ad: 'sonraki', etiket: 'Ayrıntı', govde: (r) => h`<code>${JSON.stringify(r.sonraki || {}).slice(0, 60)}</code>` },
        ],
      })}</div>
</div>`;
      return html(ctx, 200, ciz(ctx, e, icerik, { kayitEtiketi: d.kod }));
    },
    post: async (ctx, _g, params) => {
      const e = ekranNesnesi('DOC-03');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      const { alanlar, dosyalar } = await cokluParcaOku(ctx.istek);
      csrfZorunlu(ctx, alanlar);
      try {
        if (!String(alanlar.aciklama || '').trim()) {
          throw DogrulamaHatasi('Revizyon açıklaması zorunludur.', { alanlar: { aciklama: ['Açıklama girin.'] } });
        }
        belgeServisi.surumEkle(ctx, params.id, dosyalar.find((d) => d.alan === 'dosya'), alanlar.aciklama);
        return yonlendir(ctx, `/dokumanlar/${params.id}?surum=1`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, ciz(ctx, e, h`${B.hataOzeti(hataNesnesi(err))}
          ${B.btn('Belgeye dön', { tur: 'acc', rota: `/dokumanlar/${params.id}` })}`));
      }
    },
  });

  /* --- SET-08 Bildirim kuralları ---------------------------------------- */
  ekranRota(y, 'SET-08', {
    get: (ctx) => {
      const e = ekranNesnesi('SET-08');
      yetkiZorunlu(ctx, e.yetki);
      const kurallar = sorgu('SELECT * FROM bildirim_kurali WHERE tenant_id = ? ORDER BY olay', ctx.tenant.id);
      const olaylar = sorgu(`SELECT tur, COUNT(*) AS n FROM bildirim WHERE tenant_id = ? GROUP BY tur ORDER BY n DESC`,
        ctx.tenant.id);
      const icerik = h`
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Sistemin ürettiği olaylar</b>
    <span>Bildirimler gerçek olaylardan doğar; sahte bildirim üretilmez (değişmez kural 3).</span></div></div>
  <div class="gc-body flush">${B.tablo({
        satirlar: olaylar,
        bosDurum: { baslik: 'Henüz bildirim üretilmedi', ikon: 'fa-bell-slash' },
        sutunlar: [
          { ad: 'tur', etiket: 'Olay', govde: (r) => h`<b>${r.tur}</b>` },
          { ad: 'n', etiket: 'Üretilen bildirim', hizala: 'sag', govde: (r) => sayi(r.n) },
        ],
      })}</div>
</div>
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Bildirim kuralları</b>
    <span>Olay, kanal, alıcı ve tekrar aralığı.</span></div></div>
  <div class="gc-body flush">${B.tablo({
        satirlar: kurallar,
        bosDurum: { baslik: 'Özel kural tanımlı değil',
          aciklama: 'Kural tanımlanmadığında varsayılan yönlendirme uygulanır: onay adımı ilgili role, sonuç talep sahibine.',
          ikon: 'fa-route' },
        sutunlar: [
          { ad: 'olay', etiket: 'Olay' },
          { ad: 'kanal', etiket: 'Kanal' },
          { ad: 'alici_rol', etiket: 'Alıcı rol', govde: (r) => r.alici_rol || '—' },
          { ad: 'aktif', etiket: 'Durum', govde: (r) => (r.aktif ? B.rozet('aktif') : B.rozet('pasif')) },
        ],
      })}</div>
</div>`;
      return html(ctx, 200, ciz(ctx, e, icerik));
    },
  });

  /* --- SET-09 Numaralandırma şablonları --------------------------------- */
  ekranRota(y, 'SET-09', {
    get: (ctx) => {
      const e = ekranNesnesi('SET-09');
      yetkiZorunlu(ctx, e.yetki);
      const sablonlar = sorgu('SELECT * FROM numara_sablonu WHERE tenant_id = ? ORDER BY nesne', ctx.tenant.id);
      const yil = new Date(simdi()).getUTCFullYear();
      const icerik = h`
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Numaralandırma şablonları</b>
    <span>Kod üretimi transaction içinde yapılır; iki eşzamanlı kayıt aynı numarayı alamaz.</span></div></div>
  <div class="gc-body flush">${B.tablo({
        satirlar: sablonlar,
        bosDurum: { baslik: 'Şablon yok', ikon: 'fa-hashtag' },
        sutunlar: [
          { ad: 'nesne', etiket: 'Nesne', govde: (r) => h`<b>${r.nesne}</b>` },
          { ad: 'onek', etiket: 'Ön ek' },
          { ad: 'ornek', etiket: 'Örnek', govde: (r) => h`<code>${r.onek}-${r.yil_dahil ? yil + '-' : ''}${
            String(r.sonraki).padStart(r.basamak, '0')}</code>` },
          { ad: 'sonraki', etiket: 'Sıradaki', hizala: 'sag', govde: (r) => sayi(r.sonraki) },
        ],
      })}</div>
</div>`;
      return html(ctx, 200, ciz(ctx, e, icerik));
    },
  });

  /* --- SET-12 Belge türleri ve saklama ---------------------------------- */
  ekranRota(y, 'SET-12', {
    get: (ctx) => {
      const e = ekranNesnesi('SET-12');
      yetkiZorunlu(ctx, e.yetki);
      const turler = sorgu('SELECT * FROM belge_turu WHERE tenant_id = ? ORDER BY ad', ctx.tenant.id);
      const icerik = h`
${ctx.sorgu.get('olustu') ? B.sonucSeridi({ tur: 'ok', baslik: 'Belge türü eklendi' }) : ''}
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Belge türleri ve saklama</b>
    <span>Zorunluluk, saklama süresi ve erişim sınıfı; doküman kaydı bu tanıma bağlanır.</span></div></div>
  <div class="gc-body flush">${B.tablo({
        satirlar: turler,
        bosDurum: { baslik: 'Belge türü tanımlı değil', ikon: 'fa-file-circle-question' },
        sutunlar: [
          { ad: 'kod', etiket: 'Kod' },
          { ad: 'ad', etiket: 'Ad', govde: (r) => h`<b>${r.ad}</b>` },
          { ad: 'zorunlu', etiket: 'Zorunlu', govde: (r) => (r.zorunlu ? B.isaret('zorunlu', 'warn') : '—') },
          { ad: 'saklama_ay', etiket: 'Saklama', hizala: 'sag', govde: (r) => (r.saklama_ay ? `${r.saklama_ay} ay` : '—') },
          { ad: 'erisim_sinifi', etiket: 'Erişim', govde: (r) => SINIF_ETIKET[r.erisim_sinifi] || r.erisim_sinifi },
        ],
      })}</div>
</div>
<div style="margin-top:18px">${B.form({
        rota: '/ayarlar/belge-turleri', csrf: csrfAlani(ctx),
        bolumler: [{
          baslik: 'Yeni belge türü',
          alanlar: h`
            ${B.alan({ ad: 'kod', etiket: 'Kod', zorunlu: true, ipucu: 'Örn. RUHSAT' })}
            ${B.alan({ ad: 'ad', etiket: 'Ad', zorunlu: true })}
            ${B.alan({ ad: 'saklamaAy', etiket: 'Saklama süresi (ay)', tur: 'number' })}
            ${B.alan({ ad: 'erisimSinifi', etiket: 'Erişim sınıfı', deger: 'ic',
              secenekler: Object.entries(SINIF_ETIKET).map(([k, v]) => ({ deger: k, etiket: v })) })}`,
        }],
        eylemler: B.btn('Ekle', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
      })}</div>`;
      return html(ctx, 200, ciz(ctx, e, icerik));
    },
    post: (ctx, govde) => {
      const e = ekranNesnesi('SET-12');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      const kod = String(govde.kod || '').trim().toUpperCase();
      const ad = String(govde.ad || '').trim();
      if (!kod || !ad) throw DogrulamaHatasi('Kod ve ad zorunludur.',
        { alanlar: { ...(kod ? {} : { kod: ['Kod girin.'] }), ...(ad ? {} : { ad: ['Ad girin.'] }) } });
      islem(() => {
        calistir(`INSERT INTO belge_turu (id, tenant_id, kod, ad, saklama_ay, erisim_sinifi, olusturan, olusturuldu)
                  VALUES (?,?,?,?,?,?,?,?)`,
          kimlik('dokuman').replace('doc', 'btr'), ctx.tenant.id, kod, ad,
          govde.saklamaAy ? Number(govde.saklamaAy) : null, govde.erisimSinifi || 'ic', ctx.kullanici.id, simdi());
        audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
          nesne: 'belge_turu', nesneId: kod, eylem: 'olustur', sonraki: { kod, ad } });
      });
      return yonlendir(ctx, '/ayarlar/belge-turleri?olustu=1');
    },
  });
}

/* --- DOC-02 formu -------------------------------------------------------- */
function dokumanFormu(ctx, { deger = {}, hata = null }) {
  const turler = sorgu('SELECT kod, ad FROM belge_turu WHERE tenant_id = ? ORDER BY ad', ctx.tenant.id)
    .map((t) => ({ deger: t.kod, etiket: t.ad }));
  return h`
${!turler.length ? B.sonucSeridi({ tur: 'warn', baslik: 'Belge türü tanımlı değil',
    aciklama: 'Doküman kaydı bir belge türüne bağlanır. Önce Ayarlar > Belge türleri ekranından tanım yapın.',
    kayitRota: '/ayarlar/belge-turleri' }) : ''}
${hata ? B.hataOzeti(hata) : ''}
<form method="post" action="/dokumanlar/yeni" enctype="multipart/form-data" novalidate data-gform="1">
  ${ham(csrfAlani(ctx))}
  <div class="form-grid">
    <div class="gform-main">
      <section class="gv-card gform-sec">
        <div class="gc-head"><div class="gc-title"><b>Belge bilgisi</b>
          <span>Dosya içerik özetiyle saklanır; aynı içerik iki kez depolanmaz.</span></div></div>
        <div class="gc-body"><div class="gform-alanlar">
          ${B.alan({ ad: 'ad', etiket: 'Belge adı', deger: deger.ad || '', zorunlu: true,
            hata: hata?.alanlar?.ad, genis: true })}
          ${B.alan({ ad: 'belgeTuru', etiket: 'Belge türü', deger: deger.belgeTuru || '', zorunlu: true,
            hata: hata?.alanlar?.belgeTuru, secenekler: [{ deger: '', etiket: 'Seçin…' }, ...turler] })}
          ${B.alan({ ad: 'sinif', etiket: 'Sınıf', deger: deger.sinif || 'ic',
            secenekler: Object.entries(SINIF_ETIKET).map(([k, v]) => ({ deger: k, etiket: v })) })}
          ${B.alan({ ad: 'gecerlilik', etiket: 'Geçerlilik bitişi', tur: 'date', deger: deger.gecerlilik || '',
            ipucu: 'Süreli belgelerde (ruhsat, sigorta) uyarı bu tarihten üretilir.' })}
          ${B.alan({ ad: 'dosya', etiket: 'Dosya', tur: 'file', zorunlu: true, hata: hata?.alanlar?.dosya,
            ipucu: 'PDF, resim, Office veya metin. En fazla 2 MB.' })}
          ${B.alan({ ad: 'aciklama', etiket: 'Sürüm açıklaması', deger: deger.aciklama || '', genis: true })}
        </div></div>
      </section>
    </div>
    <aside class="gform-side"><div class="gv-card"><div class="gc-body">
      <div class="gv-cap-sm">Sürümleme</div>
      <p style="margin-top:10px;font-size:12.5px;line-height:1.7;color:var(--muted)">
        Bu kayıt <b>sürüm 1</b> ile açılır. Sonraki yüklemeler mevcut sürümü değiştirmez,
        yeni sürüm satırı ekler; eski sürümler indirilebilir kalır.</p>
      <div class="gv-cap-sm" style="margin-top:16px">Kabul edilen türler</div>
      <p style="margin-top:8px;font-size:12px;color:var(--muted)">${[...IZINLI_MIME].join(', ')}</p>
    </div></div></aside>
  </div>
  <div class="form-foot">
    ${B.btn('Vazgeç', { rota: '/dokumanlar' })}
    ${B.btn('Kaydet', { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' })}
  </div>
</form>`;
}
