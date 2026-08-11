/* ============================================================================
   AYAR ROTALARI — SET-01..05, SET-16, SET-18
   ----------------------------------------------------------------------------
   Bu ekranlar "menü gizlemek güvenlik değildir" ilkesinin yönetim yüzeyidir:
   rol matrisi, veri kapsamı kuralları ve denetim izi burada GÖRÜNÜR olur.
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { sorgu, tek, calistir, islem, surumluGuncelle } from '../cekirdek/db.mjs';
import { simdi, tarihSaat } from '../cekirdek/zaman.mjs';
import { BIRIMLER } from '../cekirdek/para.mjs';
import { UygulamaHatasi, Bulunamadi, DogrulamaHatasi } from '../cekirdek/hata.mjs';
import * as audit from '../cekirdek/audit.mjs';
import { manifest, yapilandirma } from '../cekirdek/yapilandirma.mjs';
import { yetkiZorunlu } from '../moduller/kimlik/yetki.mjs';
import { csrfZorunlu, csrfAlani } from '../moduller/kimlik/oturum.mjs';
import * as servis from '../moduller/kimlik/servis.mjs';
import { ROLLER } from '../moduller/kimlik/roller.mjs';
import { kabuk } from '../web/kabuk.mjs';
import { h, ham, sayi } from '../web/temel.mjs';
import * as B from '../web/bilesenler.mjs';
import { sayaclar } from './calisma.mjs';

const ekranNesnesi = (kod) => manifest().ekranlar.find((e) => e.kod === kod);
const ciz = (ctx, ekran, icerik, ek = {}) => {
  const s = sayaclar(ctx);
  return kabuk(ctx, { ekran, icerik, onayAdedi: s.onay, bildirimAdedi: s.bildirim, ...ek });
};

export function kur(y, ekranRota) {
  /* --- SET-01 Şirketler (tenant ve tüzel kişi ayrımı) -------------------- */
  ekranRota(y, 'SET-01', {
    get: (ctx) => {
      const e = ekranNesnesi('SET-01');
      yetkiZorunlu(ctx, e.yetki);
      const sirketler = sorgu('SELECT * FROM sirket WHERE tenant_id = ? ORDER BY unvan', ctx.tenant.id);
      const icerik = h`
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Kiracı (tenant)</b>
    <span>Abonelik ve veri izolasyonu birimi. Tüm kayıtlar bu kimliğe bağlıdır.</span></div></div>
  <div class="gc-body"><dl class="gd-grid" style="border-top:0;padding-top:0;margin-top:0">
    <div><dt>Kod</dt><dd>${ctx.tenant.kod}</dd></div>
    <div><dt>Ad</dt><dd>${ctx.tenant.ad}</dd></div>
    <div><dt>Para birimi</dt><dd>${ctx.tenant.para_birimi}</dd></div>
    <div><dt>Saat dilimi</dt><dd>${ctx.tenant.saat_dilimi}</dd></div>
    <div><dt>Durum</dt><dd>${B.rozet(ctx.tenant.durum)}</dd></div>
    <div><dt>Demo</dt><dd>${ctx.tenant.demo ? B.isaret('DEMO veri', 'warn') : 'Hayır'}</dd></div>
  </dl></div>
</div>
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Tüzel kişiler</b>
    <span>Bir kiracı altında birden çok şirket olabilir; sözleşme ve fatura tüzel kişiye bağlanır.</span></div></div>
  <div class="gc-body flush">${B.tablo({
        satirlar: sirketler,
        bosDurum: { baslik: 'Tanımlı tüzel kişi yok', ikon: 'fa-building' },
        sutunlar: [
          { ad: 'kod', etiket: 'Kod' },
          { ad: 'unvan', etiket: 'Unvan', govde: (r) => h`<b>${r.unvan}</b>` },
          { ad: 'vergi_no', etiket: 'Vergi no', govde: (r) => r.vergi_no || '—' },
          { ad: 'para_birimi', etiket: 'Para birimi' },
          { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
        ],
      })}</div>
</div>`;
      return html(ctx, 200, ciz(ctx, e, icerik));
    },
  });

  /* --- SET-02 Şirket ayarları -------------------------------------------- */
  ekranRota(y, 'SET-02', {
    get: (ctx) => {
      const e = ekranNesnesi('SET-02');
      yetkiZorunlu(ctx, e.yetki);
      return html(ctx, 200, ciz(ctx, e, sirketFormu(ctx, {})));
    },
    post: (ctx, govde) => {
      const e = ekranNesnesi('SET-02');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      csrfZorunlu(ctx, govde);
      try {
        const ad = String(govde.ad || '').trim();
        if (!ad) throw DogrulamaHatasi('Şirket adı zorunludur.', { alanlar: { ad: ['Şirket adı girin.'] } });
        if (!(govde.paraBirimi in BIRIMLER)) {
          throw DogrulamaHatasi('Desteklenmeyen para birimi.', { alanlar: { paraBirimi: ['TRY, USD, EUR veya GBP olmalı.'] } });
        }
        try { new Intl.DateTimeFormat('tr-TR', { timeZone: govde.saatDilimi }); }
        catch { throw DogrulamaHatasi('Geçersiz saat dilimi.', { alanlar: { saatDilimi: ['IANA saat dilimi kodu girin (örn. Europe/Istanbul).'] } }); }

        const onceki = tek('SELECT * FROM tenant WHERE id = ?', ctx.tenant.id);
        islem(() => {
          /* Optimistic concurrency: başkası bu sırada güncellediyse 409 (kural 8). */
          surumluGuncelle('tenant', ctx.tenant.id, Number(govde.surum),
            { ad, para_birimi: govde.paraBirimi, saat_dilimi: govde.saatDilimi },
            { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
          audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
            nesne: 'tenant', nesneId: ctx.tenant.id, eylem: 'guncelle',
            onceki: { ad: onceki.ad, para_birimi: onceki.para_birimi, saat_dilimi: onceki.saat_dilimi },
            sonraki: { ad, para_birimi: govde.paraBirimi, saat_dilimi: govde.saatDilimi } });
        });
        return yonlendir(ctx, '/ayarlar/sirket?kaydedildi=1');
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, ciz(ctx, e,
          sirketFormu(ctx, { deger: govde, hata: { kod: err.kod, mesaj: err.mesaj, alanlar: err.alanlar } })));
      }
    },
  });

  /* --- SET-03 Kullanıcılar (liste + davet) ------------------------------- */
  ekranRota(y, 'SET-03', {
    get: (ctx) => {
      const e = ekranNesnesi('SET-03');
      yetkiZorunlu(ctx, e.yetki);
      const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
      const q = (ctx.sorgu.get('q') || '').trim();
      const durum = ctx.sorgu.get('durum') || '';
      const kosullar = ['k.tenant_id = ?']; const p = [ctx.tenant.id];
      if (q) { kosullar.push('(k.ad_soyad LIKE ? OR k.eposta LIKE ?)'); p.push(`%${q}%`, `%${q}%`); }
      if (durum) { kosullar.push('k.durum = ?'); p.push(durum); }
      const nerede = kosullar.join(' AND ');
      const toplam = Number(tek(`SELECT COUNT(*) AS n FROM kullanici k WHERE ${nerede}`, ...p)?.n ?? 0);
      const satirlar = sorgu(
        `SELECT k.*, (SELECT GROUP_CONCAT(r.ad, ', ') FROM kullanici_rol kr JOIN rol r ON r.id = kr.rol_id
                       WHERE kr.kullanici_id = k.id) AS roller
           FROM kullanici k WHERE ${nerede} ORDER BY k.ad_soyad LIMIT ? OFFSET ?`, ...p, boyut, atla);

      const icerik = B.listeDuzeni({
        kpi: B.kpiSeridi([
          { etiket: 'Kullanıcı', deger: sayi(Number(tek('SELECT COUNT(*) AS n FROM kullanici WHERE tenant_id = ?', ctx.tenant.id)?.n ?? 0)), ikon: 'fa-users' },
          { etiket: 'Aktif', deger: sayi(Number(tek(`SELECT COUNT(*) AS n FROM kullanici WHERE tenant_id = ? AND durum = 'aktif'`, ctx.tenant.id)?.n ?? 0)), ikon: 'fa-user-check' },
          { etiket: 'Davetli', deger: sayi(Number(tek(`SELECT COUNT(*) AS n FROM kullanici WHERE tenant_id = ? AND durum = 'davetli'`, ctx.tenant.id)?.n ?? 0)), ikon: 'fa-envelope' },
          { etiket: 'MFA etkin', deger: sayi(Number(tek('SELECT COUNT(*) AS n FROM kullanici WHERE tenant_id = ? AND mfa_aktif = 1', ctx.tenant.id)?.n ?? 0)), ikon: 'fa-shield-halved' },
        ]),
        filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Ad veya e-posta ara…',
          filtreler: [{ ad: 'durum', etiket: 'Durum', secenekler: [
            { deger: 'aktif', etiket: 'Aktif' }, { deger: 'davetli', etiket: 'Davetli' },
            { deger: 'pasif', etiket: 'Pasif' }, { deger: 'kilitli', etiket: 'Kilitli' }] }] }),
        icerik: B.tablo({
          satirlar,
          bosDurum: { baslik: 'Kullanıcı bulunamadı', ikon: 'fa-user-slash' },
          sutunlar: [
            { ad: 'ad_soyad', etiket: 'Kullanıcı', govde: (r) => h`<b>${r.ad_soyad}</b><br><span class="muted">${r.eposta}</span>` },
            { ad: 'roller', etiket: 'Roller', govde: (r) => r.roller || '—' },
            { ad: 'mfa_aktif', etiket: 'MFA', govde: (r) => r.mfa_aktif ? B.rozet('aktif', 'Etkin') : B.rozet('pasif', 'Kapalı') },
            { ad: 'son_giris', etiket: 'Son giriş', govde: (r) => r.son_giris ? tarihSaat(r.son_giris) : '—' },
            { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
          ],
        }),
        sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
        veriZamani: simdi(),
      });

      const davetSonucu = ctx.sorgu.get('davet');
      const davetLink = ctx.sorgu.get('baglanti');
      const ust = davetSonucu
        ? B.sonucSeridi({ tur: 'ok', baslik: 'Davet oluşturuldu',
            aciklama: davetLink && !yapilandirma.uretim
              ? `Bu ortamda e-posta gönderimi kapalı; davet bağlantısı: ${davetLink}`
              : 'Davet bağlantısı kullanıcının e-posta adresine gönderildi.' })
        : '';

      return html(ctx, 200, ciz(ctx, e, h`${ust}${icerik}${davetFormu(ctx)}`));
    },
    post: (ctx, govde) => {
      const e = ekranNesnesi('SET-03');
      yetkiZorunlu(ctx, `${e.kod}:olustur`);
      csrfZorunlu(ctx, govde);
      try {
        const sonuc = servis.davetOlustur(ctx, {
          eposta: govde.eposta, adSoyad: govde.adSoyad, rolKodu: govde.rolKodu,
        });
        const baglanti = yapilandirma.uretim ? '' : `&baglanti=${encodeURIComponent('/davet/' + sonuc._token)}`;
        return yonlendir(ctx, `/ayarlar/kullanicilar?davet=1${baglanti}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, ciz(ctx, e, h`${B.hataOzeti({ kod: err.kod, mesaj: err.mesaj, alanlar: err.alanlar })}${davetFormu(ctx, govde)}`));
      }
    },
  });

  /* --- SET-04 Roller ve yetkiler (matris) -------------------------------- */
  ekranRota(y, 'SET-04', {
    get: (ctx) => {
      const e = ekranNesnesi('SET-04');
      yetkiZorunlu(ctx, e.yetki);
      const roller = sorgu(`SELECT r.*, (SELECT COUNT(*) FROM rol_yetki ry WHERE ry.rol_id = r.id) AS yetki_sayisi,
                                   (SELECT COUNT(*) FROM kullanici_rol kr WHERE kr.rol_id = r.id AND kr.tenant_id = ?) AS kullanici_sayisi
                              FROM rol r WHERE r.tenant_id IS NULL OR r.tenant_id = ? ORDER BY r.sistem DESC, r.ad`,
        ctx.tenant.id, ctx.tenant.id);
      const seciliKod = ctx.sorgu.get('rol') || roller[0]?.kod;
      const secili = roller.find((r) => r.kod === seciliKod) || roller[0];
      const yetkiler = secili ? sorgu('SELECT yetki FROM rol_yetki WHERE rol_id = ? ORDER BY yetki', secili.id).map((x) => x.yetki) : [];
      const ekranlar = manifest().ekranlar;
      const bolumler = manifest().bolumler;

      /* Bölüm × eylem matrisi — yetkiler manifestten türediği için matris de öyle. */
      const matris = bolumler.filter((b) => b.railde).map((b) => {
        const bolumEkranlari = ekranlar.filter((x) => x.bolum === b.anahtar && !x.takmaAdi);
        const eylemler = ['goruntule', 'olustur', 'guncelle', 'karar_ver', 'disa_aktar'];
        const hucreler = eylemler.map((ey) => {
          const olasi = bolumEkranlari.filter((x) => yetkiler.includes(`${x.kod}:${ey}`)).length;
          return { eylem: ey, adet: olasi, toplam: bolumEkranlari.length };
        });
        return { bolum: b, hucreler, ekranSayisi: bolumEkranlari.length };
      });

      const icerik = h`
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Roller</b>
    <span>Sistem rolleri screen-manifest'ten üretilir; yetki listesi elle yazılmaz.</span></div></div>
  <div class="gc-body flush">${B.tablo({
        satirlar: roller,
        sutunlar: [
          { ad: 'ad', etiket: 'Rol', govde: (r) => h`<a href="/ayarlar/roller?rol=${r.kod}"><b>${r.ad}</b></a><br><span class="muted">${r.aciklama || ''}</span>` },
          { ad: 'sistem', etiket: 'Tür', govde: (r) => r.sistem ? B.isaret('Sistem rolü', 'info') : B.isaret('Özel', 'nötr') },
          { ad: 'yetki_sayisi', etiket: 'Yetki', hizala: 'sag', govde: (r) => sayi(r.yetki_sayisi) },
          { ad: 'kullanici_sayisi', etiket: 'Kullanıcı', hizala: 'sag', govde: (r) => sayi(r.kullanici_sayisi) },
        ],
      })}</div>
</div>
${secili ? h`<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>${secili.ad} — yetki matrisi</b>
    <span>${sayi(yetkiler.length)} yetki anahtarı. Hücrede "erişilen ekran / toplam ekran" gösterilir.</span></div></div>
  <div class="gc-body flush">
    <div class="gv-tscroll"><table class="gtable">
      <thead><tr><th>Bölüm</th><th class="ta-orta">Görüntüle</th><th class="ta-orta">Oluştur</th>
        <th class="ta-orta">Güncelle</th><th class="ta-orta">Karar ver</th><th class="ta-orta">Dışa aktar</th></tr></thead>
      <tbody>${matris.map((m) => h`<tr>
        <td data-etiket="Bölüm"><b>${m.bolum.ad}</b> <span class="muted">(${sayi(m.ekranSayisi)} ekran)</span></td>
        ${m.hucreler.map((c) => h`<td class="ta-orta" data-etiket="${c.eylem}">${
          c.adet === 0 ? h`<span class="muted">—</span>`
          : c.adet === c.toplam ? B.rozet('aktif', 'Tümü')
          : h`<span class="gtag">${sayi(c.adet)}/${sayi(c.toplam)}</span>`}</td>`)}
      </tr>`)}</tbody>
    </table></div>
  </div>
</div>` : ''}`;
      return html(ctx, 200, ciz(ctx, e, icerik));
    },
  });

  /* --- SET-05 Veri kapsamı kuralları ------------------------------------- */
  ekranRota(y, 'SET-05', {
    get: (ctx) => {
      const e = ekranNesnesi('SET-05');
      yetkiZorunlu(ctx, e.yetki);
      const kurallar = sorgu(
        `SELECT vk.*, r.ad AS rol_ad, r.kod AS rol_kod FROM veri_kapsami vk
           JOIN rol r ON r.id = vk.rol_id WHERE vk.tenant_id = ? ORDER BY r.ad, vk.nesne`, ctx.tenant.id);
      const KURAL_ACIKLAMA = {
        kendi_kaydi: 'Yalnız kullanıcının kendi oluşturduğu/sahibi olduğu kayıtlar',
        tutar_tavani: 'Karar yetkisi belirtilen tutarla sınırlı',
        alan_maskesi: 'Hassas alanlar sunucuda maskelenir',
        kapsam_zorunlu: 'Kayıt, kullanıcının proje/şantiye kapsamında olmalı',
      };
      const icerik = h`
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Veri kapsamı kuralları (ABAC)</b>
    <span>Rol yetkisi "neyi yapabilir", kapsam kuralı "hangi kayıtta" sorusunu yanıtlar. İkisi de sunucuda uygulanır.</span></div></div>
  <div class="gc-body flush">${B.tablo({
        satirlar: kurallar,
        bosDurum: { baslik: 'Tanımlı kapsam kuralı yok', ikon: 'fa-shield' },
        sutunlar: [
          { ad: 'rol_ad', etiket: 'Rol', govde: (r) => h`<b>${r.rol_ad}</b>` },
          { ad: 'nesne', etiket: 'Nesne', govde: (r) => r.nesne === '*' ? 'Tüm nesneler' : r.nesne },
          { ad: 'kural', etiket: 'Kural', govde: (r) => h`<b>${r.kural}</b><br><span class="muted">${KURAL_ACIKLAMA[r.kural] || ''}</span>` },
          { ad: 'deger', etiket: 'Parametre', govde: (r) => h`<code>${r.deger || '{}'}</code>` },
        ],
      })}</div>
</div>`;
      return html(ctx, 200, ciz(ctx, e, icerik));
    },
  });

  /* --- SET-16 Denetim izi ------------------------------------------------ */
  ekranRota(y, 'SET-16', {
    get: (ctx) => {
      const e = ekranNesnesi('SET-16');
      yetkiZorunlu(ctx, e.yetki);
      const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
      const nesne = ctx.sorgu.get('nesne') || '';
      const kosullar = ['(tenant_id = ? OR tenant_id IS NULL)']; const p = [ctx.tenant.id];
      if (nesne) { kosullar.push('nesne = ?'); p.push(nesne); }
      const nerede = kosullar.join(' AND ');
      const toplam = Number(tek(`SELECT COUNT(*) AS n FROM denetim_izi WHERE ${nerede}`, ...p)?.n ?? 0);
      const satirlar = sorgu(`SELECT * FROM denetim_izi WHERE ${nerede} ORDER BY sira DESC LIMIT ? OFFSET ?`, ...p, boyut, atla);
      const nesneler = sorgu('SELECT DISTINCT nesne FROM denetim_izi ORDER BY nesne').map((r) => ({ deger: r.nesne, etiket: r.nesne }));
      const zincir = audit.zinciriDogrula();

      const icerik = h`
${zincir.saglam
        ? B.sonucSeridi({ tur: 'ok', baslik: 'Denetim zinciri sağlam',
            aciklama: `${sayi(zincir.satir)} kayıt doğrulandı. Her satır bir öncekinin özetini taşır; araya kayıt eklenemez, silinemez.` })
        : B.sonucSeridi({ tur: 'hata', baslik: 'Denetim zinciri kırık',
            aciklama: `Kırılma ${zincir.kirilma}. sırada: ${zincir.neden}`, kod: 'AUDIT_ZINCIR_KIRIK' })}
${B.listeDuzeni({
        filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Kayıt kimliği ara…',
          filtreler: [{ ad: 'nesne', etiket: 'Nesne', secenekler: nesneler }] }),
        icerik: B.tablo({
          satirlar,
          bosDurum: { baslik: 'Denetim kaydı yok', ikon: 'fa-clipboard-list' },
          sutunlar: [
            { ad: 'sira', etiket: '#', hizala: 'sag' },
            { ad: 'zaman', etiket: 'Zaman', govde: (r) => tarihSaat(r.zaman) },
            { ad: 'nesne', etiket: 'Nesne', govde: (r) => h`<b>${r.nesne}</b>${r.nesne_id ? h`<br><span class="muted">${r.nesne_id}</span>` : ''}` },
            { ad: 'eylem', etiket: 'Eylem' },
            { ad: 'kullanici_id', etiket: 'Kullanıcı', govde: (r) => kullaniciAdi(r.kullanici_id) },
            { ad: 'ozet', etiket: 'Özet', govde: (r) => h`<code>${String(r.ozet).slice(0, 12)}…</code>` },
          ],
        }),
        sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
        veriZamani: simdi(),
      })}`;
      return html(ctx, 200, ciz(ctx, e, icerik));
    },
  });

  /* --- SET-18 Özellik bayrakları ----------------------------------------- */
  ekranRota(y, 'SET-18', {
    get: (ctx) => {
      const e = ekranNesnesi('SET-18');
      yetkiZorunlu(ctx, e.yetki);
      const bayraklar = sorgu(
        'SELECT * FROM ozellik_bayragi WHERE tenant_id = ? OR tenant_id IS NULL ORDER BY kod', ctx.tenant.id);
      const icerik = h`
${yapilandirma.uretim ? B.sonucSeridi({ tur: 'warn', baslik: 'Üretim ortamı',
        aciklama: 'demo.* ile başlayan bayraklar üretimde kod düzeyinde kapalıdır; veritabanında açık görünseler bile etkisizdir.' }) : ''}
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Özellik bayrakları</b>
    <span>Kademeli yayın ve geri alma. Bayrak istemciden okunmaz; sunucuda değerlendirilir.</span></div></div>
  <div class="gc-body flush">${B.tablo({
        satirlar: bayraklar,
        bosDurum: { baslik: 'Tanımlı bayrak yok', ikon: 'fa-toggle-off' },
        sutunlar: [
          { ad: 'kod', etiket: 'Bayrak', govde: (r) => h`<b>${r.kod}</b><br><span class="muted">${r.aciklama || ''}</span>` },
          { ad: 'tenant_id', etiket: 'Kapsam', govde: (r) => r.tenant_id ? 'Bu şirket' : 'Küresel' },
          { ad: 'acik', etiket: 'Durum', govde: (r) => r.acik ? B.rozet('aktif', 'Açık') : B.rozet('pasif', 'Kapalı') },
          { ad: 'etki', etiket: 'Üretimdeki etkisi', govde: (r) => r.kod.startsWith('demo.')
            ? B.isaret('Üretimde daima kapalı', 'warn') : '—' },
          { ad: 'islem', etiket: 'İşlem', hizala: 'sag', govde: (r) => h`
            <form method="post" action="/ayarlar/ozellikler" style="display:inline">${ham(csrfAlani(ctx))}
              <input type="hidden" name="kod" value="${r.kod}">
              <input type="hidden" name="tenant" value="${r.tenant_id || ''}">
              <input type="hidden" name="acik" value="${r.acik ? '0' : '1'}">
              <button class="btn btn-ghost btn-sm" type="submit">${r.acik ? 'Kapat' : 'Aç'}</button>
            </form>` },
        ],
      })}</div>
</div>`;
      return html(ctx, 200, ciz(ctx, e, icerik));
    },
    post: (ctx, govde) => {
      const e = ekranNesnesi('SET-18');
      yetkiZorunlu(ctx, `${e.kod}:guncelle`);
      csrfZorunlu(ctx, govde);
      const tenantId = govde.tenant || null;
      const mevcut = tenantId
        ? tek('SELECT * FROM ozellik_bayragi WHERE kod = ? AND tenant_id = ?', govde.kod, tenantId)
        : tek('SELECT * FROM ozellik_bayragi WHERE kod = ? AND tenant_id IS NULL', govde.kod);
      if (!mevcut) throw Bulunamadi('Bayrak bulunamadı.');
      const yeni = govde.acik === '1' ? 1 : 0;
      islem(() => {
        if (tenantId) calistir('UPDATE ozellik_bayragi SET acik = ?, guncelleyen = ?, guncellendi = ? WHERE kod = ? AND tenant_id = ?',
          yeni, ctx.kullanici.id, simdi(), govde.kod, tenantId);
        else calistir('UPDATE ozellik_bayragi SET acik = ?, guncelleyen = ?, guncellendi = ? WHERE kod = ? AND tenant_id IS NULL',
          yeni, ctx.kullanici.id, simdi(), govde.kod);
        audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
          nesne: 'ozellik_bayragi', nesneId: govde.kod, eylem: yeni ? 'ac' : 'kapat',
          onceki: { acik: mevcut.acik }, sonraki: { acik: yeni } });
      });
      return yonlendir(ctx, '/ayarlar/ozellikler');
    },
  });
}

/* --- Yardımcılar --------------------------------------------------------- */
const adOnbellek = new Map();
function kullaniciAdi(id) {
  if (!id) return '—';
  if (!adOnbellek.has(id)) adOnbellek.set(id, tek('SELECT ad_soyad FROM kullanici WHERE id = ?', id)?.ad_soyad || id);
  return adOnbellek.get(id);
}

function davetFormu(ctx, deger = {}) {
  const roller = ROLLER.map((r) => ({ deger: r.kod, etiket: r.ad }));
  return h`<div style="margin-top:18px">${B.form({
    rota: '/ayarlar/kullanicilar',
    csrf: csrfAlani(ctx),
    bolumler: [{
      baslik: 'Kullanıcı davet et',
      aciklama: 'Davet edilen kişi kendi şifresini belirler; şifre yönetici tarafından atanmaz.',
      alanlar: h`
        ${B.alan({ ad: 'adSoyad', etiket: 'Ad soyad', deger: deger.adSoyad || '', zorunlu: true })}
        ${B.alan({ ad: 'eposta', etiket: 'E-posta', tur: 'email', deger: deger.eposta || '', zorunlu: true })}
        ${B.alan({ ad: 'rolKodu', etiket: 'Rol', deger: deger.rolKodu || 'calisan', zorunlu: true, secenekler: roller })}`,
    }],
    eylemler: B.btn('Davet gönder', { tur: 'acc', gonder: true, ikon: 'fa-paper-plane' }),
  })}</div>`;
}

/* --- SET-02 formu -------------------------------------------------------- */
function sirketFormu(ctx, { deger = {}, hata = null }) {
  const t = ctx.tenant;
  const kaydedildi = ctx.sorgu.get('kaydedildi');
  return h`${kaydedildi ? B.sonucSeridi({ tur: 'ok', baslik: 'Şirket ayarları güncellendi',
      aciklama: 'Değişiklik denetim izine kaydedildi; önceki değerler geçmişte korunuyor.' }) : ''}
${B.form({
    rota: '/ayarlar/sirket',
    csrf: csrfAlani(ctx),
    hatalar: hata,
    bolumler: [{
      baslik: 'Kimlik ve yerelleştirme',
      aciklama: 'Para birimi ve saat dilimi tüm modüllerin ortak temelidir; tutarlar bu birimde, zamanlar UTC saklanıp bu dilimde gösterilir.',
      alanlar: h`
        ${B.alan({ ad: 'ad', etiket: 'Şirket adı', deger: deger.ad ?? t.ad, zorunlu: true, hata: hata?.alanlar?.ad, genis: true })}
        ${B.alan({ ad: 'paraBirimi', etiket: 'Para birimi', deger: deger.paraBirimi ?? t.para_birimi, zorunlu: true,
                   hata: hata?.alanlar?.paraBirimi,
                   secenekler: Object.keys(BIRIMLER).map((k) => ({ deger: k, etiket: k })) })}
        ${B.alan({ ad: 'saatDilimi', etiket: 'Saat dilimi', deger: deger.saatDilimi ?? t.saat_dilimi, zorunlu: true,
                   hata: hata?.alanlar?.saatDilimi, ipucu: 'IANA kodu — örn. Europe/Istanbul' })}
        <input type="hidden" name="surum" value="${t.surum}">`,
    }],
    ozet: h`<div class="gv-card"><div class="gc-body">
      <div class="gv-cap-sm">Kayıt künyesi</div>
      <dl class="gd-grid" style="margin-top:12px;padding-top:0;border-top:0">
        <div><dt>Kiracı kodu</dt><dd>${t.kod}</dd></div>
        <div><dt>Sürüm</dt><dd>${t.surum}</dd></div>
        <div><dt>Son güncelleme</dt><dd>${t.guncellendi ? tarihSaat(t.guncellendi) : '—'}</dd></div>
        <div><dt>Durum</dt><dd>${B.rozet(t.durum)}</dd></div>
      </dl>
      <p class="gf-hint" style="margin-top:14px">Kayıt sürümü form ile birlikte gönderilir;
        siz düzenlerken başkası kaydettiyse gönderim 409 ile reddedilir ve veri sessizce ezilmez.</p>
    </div></div>`,
    eylemler: h`${B.btn('Vazgeç', { rota: '/ayarlar/sirketler' })}${B.btn('Kaydet', { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' })}`,
  })}`;
}
