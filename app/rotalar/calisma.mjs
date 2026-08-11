/* ============================================================================
   ORTAK ÇALIŞMA ALANI ROTALARI — GLB-01, GLB-06, GLB-10..13
   ----------------------------------------------------------------------------
   Faz 1'de bu ekranlar ortak liste/form/detay kalıbının ilk gerçek uygulamasıdır:
   kanonik kayıt, sunucu tarafı sayfalama, gerçek hata kodu, idempotency ve audit.
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { sorgu, tek, calistir, islem, surumluGuncelle } from '../cekirdek/db.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarihSaat, gunAnahtari, gunBaslangici } from '../cekirdek/zaman.mjs';
import { UygulamaHatasi, KimlikGerekli, Bulunamadi, DogrulamaHatasi } from '../cekirdek/hata.mjs';
import { idempotent } from '../cekirdek/idempotency.mjs';
import * as audit from '../cekirdek/audit.mjs';
import { manifest } from '../cekirdek/yapilandirma.mjs';
import { yetkiZorunlu, kapsamZorunlu } from '../moduller/kimlik/yetki.mjs';
import { csrfZorunlu, csrfAlani } from '../moduller/kimlik/oturum.mjs';
import { kabuk } from '../web/kabuk.mjs';
import { h, ham, sayi } from '../web/temel.mjs';
import * as B from '../web/bilesenler.mjs';

const ekranNesnesi = (kod) => manifest().ekranlar.find((e) => e.kod === kod);

/* --- Üst bar sayaçları (gerçek veriden) ---------------------------------- */
export function sayaclar(ctx) {
  if (!ctx.kullanici) return { onay: 0, bildirim: 0 };
  const bildirim = Number(tek(
    'SELECT COUNT(*) AS n FROM bildirim WHERE kullanici_id = ? AND okundu IS NULL', ctx.kullanici.id)?.n ?? 0);
  const onay = Number(tek(
    `SELECT COUNT(*) AS n FROM bildirim WHERE kullanici_id = ? AND okundu IS NULL AND tur = 'onay_bekliyor'`,
    ctx.kullanici.id)?.n ?? 0);
  return { onay, bildirim };
}

function sayfaCiz(ctx, ekran, icerik, ek = {}) {
  const s = sayaclar(ctx);
  return kabuk(ctx, { ekran, icerik, onayAdedi: s.onay, bildirimAdedi: s.bildirim, ...ek });
}

export function kur(y, ekranRota) {
  /* ======================================================================
     GLB-01 — Rol bazlı ana panel
     ====================================================================== */
  ekranRota(y, 'GLB-01', {
    get: (ctx) => {
      const e = ekranNesnesi('GLB-01');
      yetkiZorunlu(ctx, e.yetki);
      const s = sayaclar(ctx);
      const notAdedi = Number(tek(
        'SELECT COUNT(*) AS n FROM kisisel_not WHERE kullanici_id = ? AND tamamlandi = 0', ctx.kullanici.id)?.n ?? 0);
      const oturumAdedi = Number(tek(
        'SELECT COUNT(*) AS n FROM oturum WHERE kullanici_id = ? AND sonlandirildi IS NULL AND bitis > ?',
        ctx.kullanici.id, simdi())?.n ?? 0);
      const rolAdlari = ctx.yetkiler.roller.map((r) => r.ad).join(', ') || '—';
      const yetkiSayisi = ctx.yetkiler.yetkiler.size;

      const kpi = B.kpiSeridi([
        { etiket: 'Bekleyen onayınız', deger: sayi(s.onay), ikon: 'fa-circle-check', alt: s.onay ? 'Onay kutunuzda' : 'Bekleyen yok' },
        { etiket: 'Okunmamış bildirim', deger: sayi(s.bildirim), ikon: 'fa-bell' },
        { etiket: 'Açık notunuz', deger: sayi(notAdedi), ikon: 'fa-note-sticky' },
        { etiket: 'Aktif oturumunuz', deger: sayi(oturumAdedi), ikon: 'fa-desktop' },
      ]);

      const icerik = h`${kpi}
<div class="dash-cols">
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>Erişim bağlamınız</b>
      <span>Rolünüz ve veri kapsamınız sunucuda belirlenir; bu ekran onu görünür kılar.</span></div></div>
    <div class="gc-body">
      <dl class="gd-grid">
        <div><dt>Şirket (tenant)</dt><dd>${ctx.tenant.ad}</dd></div>
        <div><dt>Rolleriniz</dt><dd>${rolAdlari}</dd></div>
        <div><dt>Veri kapsamı</dt><dd>${ctx.yetkiler.tenantGeneli ? 'Tenant geneli'
          : ctx.yetkiler.kapsamlar.map((k) => `${k.tur}:${k.id}`).join(', ') || 'Tanımlı kapsam yok'}</dd></div>
        <div><dt>Ekran yetkisi</dt><dd>${sayi(yetkiSayisi)} yetki anahtarı</dd></div>
        <div><dt>Son giriş</dt><dd>${ctx.kullanici.son_giris ? tarihSaat(ctx.kullanici.son_giris) : '—'}</dd></div>
        <div><dt>İki adımlı doğrulama</dt><dd>${ctx.kullanici.mfa_aktif ? 'Etkin' : 'Kapalı'}</dd></div>
      </dl>
    </div>
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Kısayollar</b></div></div>
      <div class="gc-body" style="display:flex;flex-direction:column;gap:9px">
        ${B.btn('Kişisel notlarım', { rota: '/notlarim', ikon: 'fa-note-sticky' })}
        ${B.btn('Bildirim merkezi', { rota: '/bildirimler', ikon: 'fa-bell' })}
        ${B.btn('Profilim ve oturumlarım', { rota: '/profilim', ikon: 'fa-user' })}
      </div>
    </div>
  </div>
</div>
${B.veriTarihi(simdi())}`;
      return html(ctx, 200, sayfaCiz(ctx, e, icerik, {
        aciklama: 'Rol, şirket ve veri kapsamınıza göre hesaplanan özet.',
      }));
    },
  });

  /* ======================================================================
     GLB-06 — Bildirim merkezi
     ====================================================================== */
  ekranRota(y, 'GLB-06', {
    get: (ctx) => {
      const e = ekranNesnesi('GLB-06');
      yetkiZorunlu(ctx, e.yetki);
      const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
      const durum = ctx.sorgu.get('durum') || '';
      const kosul = durum === 'okunmadi' ? ' AND okundu IS NULL' : durum === 'okundu' ? ' AND okundu IS NOT NULL' : '';
      const toplam = Number(tek(
        `SELECT COUNT(*) AS n FROM bildirim WHERE kullanici_id = ?${kosul}`, ctx.kullanici.id)?.n ?? 0);
      const satirlar = sorgu(
        `SELECT * FROM bildirim WHERE kullanici_id = ?${kosul} ORDER BY olusturuldu DESC LIMIT ? OFFSET ?`,
        ctx.kullanici.id, boyut, atla);

      const icerik = B.listeDuzeni({
        filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Bildirim ara…',
          filtreler: [{ ad: 'durum', etiket: 'Durum', secenekler: [
            { deger: 'okunmadi', etiket: 'Okunmadı' }, { deger: 'okundu', etiket: 'Okundu' }] }] }),
        icerik: B.tablo({
          satirlar,
          bosDurum: { baslik: 'Bildiriminiz yok', aciklama: 'Size yönlendirilen bir bildirim olduğunda burada görünür.', ikon: 'fa-bell-slash' },
          sutunlar: [
            { ad: 'baslik', etiket: 'Bildirim', govde: (r) => h`<b>${r.baslik}</b><br><span class="muted">${r.govde || ''}</span>` },
            { ad: 'onem', etiket: 'Önem', govde: (r) => B.isaret(r.onem, r.onem === 'kritik' ? 'danger' : r.onem === 'uyari' ? 'warn' : 'info') },
            { ad: 'olusturuldu', etiket: 'Zaman', govde: (r) => tarihSaat(r.olusturuldu) },
            { ad: 'okundu', etiket: 'Durum', govde: (r) => r.okundu ? B.rozet('kapali', 'Okundu') : B.rozet('beklemede', 'Okunmadı') },
          ],
        }),
        sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
        veriZamani: simdi(),
      });
      return html(ctx, 200, sayfaCiz(ctx, e, icerik));
    },
  });

  /* ======================================================================
     GLB-10 / GLB-11 — Kişisel notlar (liste + form)
     Yalnız sahibi görür: ABAC 'kendi_kaydi' kuralı burada gerçek çalışır.
     ====================================================================== */
  ekranRota(y, 'GLB-10', {
    get: (ctx) => {
      const e = ekranNesnesi('GLB-10');
      yetkiZorunlu(ctx, e.yetki);
      const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
      const q = (ctx.sorgu.get('q') || '').trim();
      const durum = ctx.sorgu.get('durum') || '';
      const kosullar = ['tenant_id = ?', 'kullanici_id = ?'];
      const p = [ctx.tenant.id, ctx.kullanici.id];
      if (q) { kosullar.push('(baslik LIKE ? OR icerik LIKE ?)'); p.push(`%${q}%`, `%${q}%`); }
      if (durum === 'acik') kosullar.push('tamamlandi = 0');
      if (durum === 'tamam') kosullar.push('tamamlandi = 1');
      const nerede = kosullar.join(' AND ');

      const toplam = Number(tek(`SELECT COUNT(*) AS n FROM kisisel_not WHERE ${nerede}`, ...p)?.n ?? 0);
      const satirlar = sorgu(
        `SELECT * FROM kisisel_not WHERE ${nerede} ORDER BY tamamlandi ASC, olusturuldu DESC LIMIT ? OFFSET ?`,
        ...p, boyut, atla);
      const acik = Number(tek('SELECT COUNT(*) AS n FROM kisisel_not WHERE kullanici_id = ? AND tamamlandi = 0', ctx.kullanici.id)?.n ?? 0);

      const icerik = B.listeDuzeni({
        kpi: B.kpiSeridi([
          { etiket: 'Toplam not', deger: sayi(Number(tek('SELECT COUNT(*) AS n FROM kisisel_not WHERE kullanici_id = ?', ctx.kullanici.id)?.n ?? 0)), ikon: 'fa-note-sticky' },
          { etiket: 'Açık', deger: sayi(acik), ikon: 'fa-circle-dot' },
          { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
        ]),
        filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Notlarımda ara…',
          filtreler: [{ ad: 'durum', etiket: 'Durum', secenekler: [
            { deger: 'acik', etiket: 'Açık' }, { deger: 'tamam', etiket: 'Tamamlandı' }] }] }),
        icerik: B.tablo({
          satirlar,
          bosDurum: { baslik: 'Notunuz yok', aciklama: 'Yalnız sizin görebileceğiniz notlar ve yapılacaklar burada tutulur.',
            ikon: 'fa-note-sticky', eylem: B.btn('Yeni not', { tur: 'acc', rota: '/notlarim/yeni', ikon: 'fa-plus' }) },
          sutunlar: [
            { ad: 'baslik', etiket: 'Başlık', govde: (r) => h`<b>${r.baslik}</b>${r.icerik ? h`<br><span class="muted">${r.icerik.slice(0, 90)}</span>` : ''}` },
            { ad: 'etiket', etiket: 'Etiket', govde: (r) => r.etiket ? B.isaret(r.etiket, 'info') : '—' },
            { ad: 'hatirlatma', etiket: 'Hatırlatma', govde: (r) => r.hatirlatma ? tarihSaat(r.hatirlatma) : '—' },
            { ad: 'tamamlandi', etiket: 'Durum', govde: (r) => r.tamamlandi ? B.rozet('tamamlandi', 'Tamamlandı') : B.rozet('beklemede', 'Açık') },
            { ad: 'islem', etiket: 'İşlem', hizala: 'sag', govde: (r) => h`
              <form method="post" action="/notlarim" style="display:inline">${ham(csrfAlani(ctx))}
                <input type="hidden" name="_eylem" value="${r.tamamlandi ? 'ac' : 'tamamla'}">
                <input type="hidden" name="id" value="${r.id}">
                <input type="hidden" name="surum" value="${r.surum}">
                <button class="btn btn-ghost btn-sm" type="submit">${r.tamamlandi ? 'Yeniden aç' : 'Tamamla'}</button>
              </form>` },
          ],
        }),
        sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
        veriZamani: simdi(),
      });
      return html(ctx, 200, sayfaCiz(ctx, e, icerik, {
        eylemler: B.btn('Yeni not', { tur: 'acc', rota: '/notlarim/yeni', ikon: 'fa-plus' }),
      }));
    },
    post: (ctx, govde) => {
      const e = ekranNesnesi('GLB-10');
      yetkiZorunlu(ctx, `${e.kod}:goruntule`);
      csrfZorunlu(ctx, govde);
      const kayit = tek('SELECT * FROM kisisel_not WHERE id = ?', govde.id);
      if (!kayit) throw Bulunamadi('Not bulunamadı.');
      kapsamZorunlu(ctx, 'kisisel_not', kayit);
      const tamamlandi = govde._eylem === 'tamamla' ? 1 : 0;
      islem(() => {
        surumluGuncelle('kisisel_not', kayit.id, Number(govde.surum), { tamamlandi },
          { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
        audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
          nesne: 'kisisel_not', nesneId: kayit.id, eylem: tamamlandi ? 'tamamla' : 'yeniden_ac',
          onceki: { tamamlandi: kayit.tamamlandi }, sonraki: { tamamlandi } });
      });
      return yonlendir(ctx, '/notlarim');
    },
  });

  ekranRota(y, 'GLB-11', {
    get: (ctx) => {
      const e = ekranNesnesi('GLB-11');
      yetkiZorunlu(ctx, e.yetki);
      return html(ctx, 200, sayfaCiz(ctx, e, notFormu(ctx, {})));
    },
    post: (ctx, govde) => {
      const e = ekranNesnesi('GLB-11');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const baslik = String(govde.baslik || '').trim();
        if (!baslik) throw DogrulamaHatasi('Başlık zorunludur.', { alanlar: { baslik: ['Başlık girin.'] } });
        if (baslik.length > 200) throw DogrulamaHatasi('Başlık çok uzun.', { alanlar: { baslik: ['En fazla 200 karakter.'] } });
        const hatirlatma = govde.hatirlatma ? gunBaslangici(govde.hatirlatma, ctx.kullanici.saat_dilimi || undefined) : null;

        const sonuc = idempotent(
          { anahtar: govde._idempotency, tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, govde },
          () => islem(() => {
            const id = kimlik('gorev').replace('tsk', 'not');
            calistir(`INSERT INTO kisisel_not (id, tenant_id, kullanici_id, baslik, icerik, etiket, hatirlatma, olusturan, olusturuldu)
                      VALUES (?,?,?,?,?,?,?,?,?)`,
              id, ctx.tenant.id, ctx.kullanici.id, baslik, govde.icerik || null,
              govde.etiket || null, hatirlatma, ctx.kullanici.id, simdi());
            audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
              nesne: 'kisisel_not', nesneId: id, eylem: 'olustur', sonraki: { baslik } });
            return { id };
          }));
        return yonlendir(ctx, `/notlarim?olusan=${encodeURIComponent(sonuc.id)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, sayfaCiz(ctx, ekranNesnesi('GLB-11'),
          notFormu(ctx, { deger: govde, hata: { kod: err.kod, mesaj: err.mesaj, alanlar: err.alanlar } })));
      }
    },
  });

  /* ======================================================================
     GLB-12 — Profilim   /   GLB-13 — İşlem geçmişim
     ====================================================================== */
  ekranRota(y, 'GLB-12', {
    get: (ctx) => {
      const e = ekranNesnesi('GLB-12');
      yetkiZorunlu(ctx, e.yetki);
      const oturumlar = sorgu(
        `SELECT * FROM oturum WHERE kullanici_id = ? ORDER BY olusturuldu DESC LIMIT 20`, ctx.kullanici.id);
      const roller = ctx.yetkiler.roller;
      const icerik = h`
${B.detayOzetSeridi({
        kod: ctx.kullanici.eposta,
        baslik: ctx.kullanici.ad_soyad,
        durum: ctx.kullanici.durum,
        surum: ctx.kullanici.surum,
        isaretler: ctx.kullanici.mfa_aktif ? [] : [{ metin: 'İki adımlı doğrulama kapalı', ton: 'warn' }],
        bilgiler: [
          { etiket: 'Şirket', deger: ctx.tenant.ad },
          { etiket: 'Roller', deger: roller.map((r) => r.ad).join(', ') || '—' },
          { etiket: 'Saat dilimi', deger: ctx.kullanici.saat_dilimi || ctx.tenant.saat_dilimi },
          { etiket: 'Son giriş', deger: ctx.kullanici.son_giris ? tarihSaat(ctx.kullanici.son_giris) : '—' },
          { etiket: 'Parola değişimi', deger: ctx.kullanici.parola_degisti ? tarihSaat(ctx.kullanici.parola_degisti) : '—' },
        ],
        digerEylemler: B.btn('İşlem geçmişim', { rota: '/profilim/islemler', ikon: 'fa-clock-rotate-left' }),
      })}
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Oturumlarım</b>
    <span>Tanımadığınız bir oturum görürseniz şifrenizi değiştirin; tüm oturumlar kapanır.</span></div></div>
  <div class="gc-body flush">
    ${B.tablo({
        satirlar: oturumlar,
        bosDurum: { baslik: 'Kayıtlı oturum yok' },
        sutunlar: [
          { ad: 'ip', etiket: 'IP', govde: (r) => r.ip || '—' },
          { ad: 'tarayici', etiket: 'Tarayıcı', govde: (r) => (r.tarayici || '—').slice(0, 60) },
          { ad: 'olusturuldu', etiket: 'Başlangıç', govde: (r) => tarihSaat(r.olusturuldu) },
          { ad: 'son_erisim', etiket: 'Son erişim', govde: (r) => tarihSaat(r.son_erisim) },
          { ad: 'durum', etiket: 'Durum', govde: (r) => r.sonlandirildi ? B.rozet('kapali', 'Sonlandırıldı')
            : r.bitis < simdi() ? B.rozet('pasif', 'Süresi doldu') : B.rozet('aktif', 'Açık') },
        ],
      })}
  </div>
</div>`;
      return html(ctx, 200, sayfaCiz(ctx, e, icerik));
    },
  });

  ekranRota(y, 'GLB-13', {
    get: (ctx) => {
      const e = ekranNesnesi('GLB-13');
      yetkiZorunlu(ctx, e.yetki);
      const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
      const toplam = Number(tek('SELECT COUNT(*) AS n FROM denetim_izi WHERE kullanici_id = ?', ctx.kullanici.id)?.n ?? 0);
      const satirlar = sorgu(
        'SELECT * FROM denetim_izi WHERE kullanici_id = ? ORDER BY sira DESC LIMIT ? OFFSET ?',
        ctx.kullanici.id, boyut, atla);
      const icerik = B.listeDuzeni({
        icerik: B.tablo({
          satirlar,
          bosDurum: { baslik: 'İşlem kaydınız yok', ikon: 'fa-clock-rotate-left' },
          sutunlar: [
            { ad: 'zaman', etiket: 'Zaman', govde: (r) => tarihSaat(r.zaman) },
            { ad: 'nesne', etiket: 'Nesne', govde: (r) => h`<b>${r.nesne}</b>${r.nesne_id ? h`<br><span class="muted">${r.nesne_id}</span>` : ''}` },
            { ad: 'eylem', etiket: 'Eylem' },
            { ad: 'ip', etiket: 'IP', govde: (r) => r.ip || '—' },
            { ad: 'sira', etiket: 'Zincir sırası', hizala: 'sag' },
          ],
        }),
        sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
        veriZamani: simdi(),
      });
      return html(ctx, 200, sayfaCiz(ctx, e, icerik, {
        aciklama: 'Yaptığınız işlemlerin değiştirilemez denetim kaydı.',
      }));
    },
  });
}

/* --- GLB-11 form --------------------------------------------------------- */
function notFormu(ctx, { deger = {}, hata = null }) {
  return B.form({
    rota: '/notlarim/yeni',
    csrf: csrfAlani(ctx),
    idempotencyAnahtari: kimlik('idempotency'),
    hatalar: hata,
    bolumler: [{
      baslik: 'Not bilgisi',
      aciklama: 'Bu not yalnız size görünür; başka hiçbir kullanıcı erişemez.',
      alanlar: h`
        ${B.alan({ ad: 'baslik', etiket: 'Başlık', deger: deger.baslik || '', zorunlu: true, hata: hata?.alanlar?.baslik, genis: true })}
        ${B.alan({ ad: 'icerik', etiket: 'Not', tur: 'metin', deger: deger.icerik || '', genis: true })}
        ${B.alan({ ad: 'etiket', etiket: 'Etiket', deger: deger.etiket || '', ipucu: 'Örn. şantiye, toplantı, takip' })}
        ${B.alan({ ad: 'hatirlatma', etiket: 'Hatırlatma tarihi', tur: 'date', deger: deger.hatirlatma || '' })}`,
    }],
    ozet: h`<div class="gv-card"><div class="gc-body">
      <div class="gv-cap-sm">Kayıt bağlamı</div>
      <dl class="gd-grid" style="margin-top:12px;padding-top:0;border-top:0">
        <div><dt>Sahip</dt><dd>${ctx.kullanici.ad_soyad}</dd></div>
        <div><dt>Şirket</dt><dd>${ctx.tenant.ad}</dd></div>
        <div><dt>Görünürlük</dt><dd>Yalnız siz</dd></div>
      </dl></div></div>`,
    eylemler: h`${B.btn('Vazgeç', { rota: '/notlarim' })}${B.btn('Kaydet', { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' })}`,
  });
}
