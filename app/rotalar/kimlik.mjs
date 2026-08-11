/* ============================================================================
   KİMLİK ROTALARI — AUTH-01..10 + kök yönlendirme + çıkış
   ========================================================================== */
import { html, yonlendir, json, jsonIster } from '../cekirdek/http.mjs';
import { manifest, bayrakAcik, BAYRAKLAR, yapilandirma } from '../cekirdek/yapilandirma.mjs';
import { UygulamaHatasi, Bulunamadi, KimlikGerekli, DogrulamaHatasi } from '../cekirdek/hata.mjs';
import { tek, calistir, islem } from '../cekirdek/db.mjs';
import * as servis from '../moduller/kimlik/servis.mjs';
import * as oturum from '../moduller/kimlik/oturum.mjs';
import * as mfa from '../moduller/kimlik/mfa.mjs';
import { demoPersonalar } from '../moduller/kimlik/tohum.mjs';
import { uygulananKodlar } from '../rotalar.mjs';
import { landingRotasi } from '../moduller/kimlik/yetki.mjs';
import * as sayfa from '../web/sayfalar/kimlik.mjs';
import { h, ham } from '../web/temel.mjs';
import { btn } from '../web/bilesenler.mjs';

const hataNesnesi = (e) => ({ kod: e.kod, mesaj: e.mesaj, alanlar: e.alanlar });

export function kok(ctx) {
  if (!ctx.kullanici) return yonlendir(ctx, '/giris');
  return yonlendir(ctx, landingRotasi(ctx, manifest(), uygulananKodlar()));
}

export function sso(ctx) {
  return html(ctx, 501, sayfa.durumSayfasi({
    baslik: 'Kurumsal SSO henüz bağlanmadı',
    aciklama: 'Kurumsal kimlik sağlayıcısı (SAML/OIDC) entegrasyonu şirket ayarlarından tanımlanır. '
      + 'Tanım yapılana kadar e-posta ve şifre ile giriş kullanılır.',
    ikon: 'fa-id-badge', ton: 'info',
    eylemler: btn('Giriş sayfasına dön', { tur: 'acc', rota: '/giris' }),
  }));
}

export function cikis(ctx, govde) {
  if (ctx.oturum) oturum.csrfZorunlu(ctx, govde);
  oturum.sonlandir(ctx);
  return yonlendir(ctx, '/giris');
}

export function kur(y, ekranRota) {
  /* --- AUTH-01 Giriş ---------------------------------------------------- */
  ekranRota(y, 'AUTH-01', {
    get: (ctx) => {
      if (ctx.kullanici) return yonlendir(ctx, landingRotasi(ctx, manifest(), uygulananKodlar()));
      const demo = bayrakAcik(BAYRAKLAR.DEMO_ROL_SECIMI) || demoBayragiTenantta();
      return html(ctx, 200, sayfa.girisSayfasi(ctx, { demoPersonalar: demo ? demoPersonalar() : null }));
    },
    post: (ctx, govde) => {
      try {
        const sonuc = servis.giris(ctx, { eposta: govde.eposta, parola: govde.parola });
        if (sonuc.sonuc === 'mfa_gerekli') {
          const kurulum = sonuc.kurulumGerekli
            ? (() => { const g = mfa.gizliUret(); return { gizli: g, uri: mfa.kurulumUri(g, govde.eposta) }; })()
            : null;
          return html(ctx, 200, sayfa.mfaSayfasi(ctx, { mfaToken: sonuc.mfaToken, kurulumGerekli: sonuc.kurulumGerekli, kurulum }));
        }
        oturum.yukle(ctx);
        return yonlendir(ctx, servis.girisSonrasiHedef(ctx, manifest()));
      } catch (e) {
        if (!(e instanceof UygulamaHatasi)) throw e;
        const demo = bayrakAcik(BAYRAKLAR.DEMO_ROL_SECIMI) || demoBayragiTenantta();
        if (jsonIster(ctx)) return json(ctx, e.durum, e.govde());
        return html(ctx, e.durum, sayfa.girisSayfasi(ctx, {
          hata: hataNesnesi(e), eposta: govde.eposta || '',
          demoPersonalar: demo ? demoPersonalar() : null,
        }));
      }
    },
  });

  /* --- AUTH-02 Şifremi unuttum ------------------------------------------ */
  ekranRota(y, 'AUTH-02', {
    get: (ctx) => html(ctx, 200, sayfa.sifreUnuttumSayfasi(ctx, {})),
    post: (ctx, govde) => {
      const sonuc = servis.sifirlamaIste(ctx, { eposta: govde.eposta });
      /* Yanıt her durumda AYNI: kullanıcı var/yok sızdırılmaz (doküman 2.1). */
      const demoBaglanti = !yapilandirma.uretim && sonuc._token ? `/sifre-sifirla/${sonuc._token}` : null;
      return html(ctx, 200, sayfa.sifreUnuttumSayfasi(ctx, { gonderildi: true, demoBaglanti }));
    },
  });

  /* --- AUTH-03 Şifre sıfırla -------------------------------------------- */
  ekranRota(y, 'AUTH-03', {
    get: (ctx, _g, params) => html(ctx, 200, sayfa.sifreSifirlaSayfasi(ctx, { token: params.token })),
    post: (ctx, govde, params) => {
      try {
        servis.sifirlamaTamamla(ctx, { sifirlamaToken: params.token, ...govde });
        return html(ctx, 200, sayfa.girisSayfasi(ctx, {
          bilgi: { tur: 'ok', baslik: 'Şifreniz güncellendi', aciklama: 'Yeni şifrenizle oturum açabilirsiniz. Açık tüm oturumlar kapatıldı.' },
        }));
      } catch (e) {
        if (!(e instanceof UygulamaHatasi)) throw e;
        return html(ctx, e.durum, sayfa.sifreSifirlaSayfasi(ctx, { token: params.token, hata: hataNesnesi(e) }));
      }
    },
  });

  /* --- AUTH-04 Davet kabul ---------------------------------------------- */
  ekranRota(y, 'AUTH-04', {
    get: (ctx, _g, params) => html(ctx, 200, sayfa.davetSayfasi(ctx, { token: params.token })),
    post: (ctx, govde, params) => {
      try {
        servis.davetKabul(ctx, { davetToken: params.token, ...govde, kvkkOnay: govde.kvkkOnay === '1' });
        oturum.yukle(ctx);
        return yonlendir(ctx, '/ilk-kurulum');
      } catch (e) {
        if (!(e instanceof UygulamaHatasi)) throw e;
        return html(ctx, e.durum, sayfa.davetSayfasi(ctx, { token: params.token, adSoyad: govde.adSoyad || '', hata: hataNesnesi(e) }));
      }
    },
  });

  /* --- AUTH-05 MFA ------------------------------------------------------ */
  ekranRota(y, 'AUTH-05', {
    get: (ctx) => yonlendir(ctx, '/giris'),   // MFA adımı yalnız giriş akışından gelir
    post: (ctx, govde) => {
      try {
        if (govde.mfaGizli) {
          /* İlk kurulum: gizli anahtar doğrulanınca kalıcılaşır. */
          const kontrol = mfa.kodDogrula(govde.mfaGizli, govde.kod);
          if (!kontrol.gecerli) throw DogrulamaHatasi('Doğrulama kodu hatalı.', { alanlar: { kod: ['Kod doğrulanamadı.'] } });
          const adim = tek(`SELECT * FROM tek_kullanimlik_token WHERE tur = 'mfa_adimi' AND kullanildi IS NULL
                            ORDER BY olusturuldu DESC LIMIT 1`);
          if (adim) mfaGizliKaydet(adim.kullanici_id, govde.mfaGizli);
        }
        servis.mfaDogrula(ctx, { mfaToken: govde.mfaToken, kod: govde.kod });
        oturum.yukle(ctx);
        return yonlendir(ctx, servis.girisSonrasiHedef(ctx, manifest()));
      } catch (e) {
        if (!(e instanceof UygulamaHatasi)) throw e;
        return html(ctx, e.durum, sayfa.mfaSayfasi(ctx, { mfaToken: govde.mfaToken, hata: hataNesnesi(e) }));
      }
    },
  });

  /* --- AUTH-06 İlk kurulum ---------------------------------------------- */
  ekranRota(y, 'AUTH-06', {
    get: (ctx) => {
      if (!ctx.kullanici) throw KimlikGerekli();
      if (ctx.kullanici.kurulum_tamam) return yonlendir(ctx, landingRotasi(ctx, manifest(), uygulananKodlar()));
      const gizli = ctx.kullanici.mfa_aktif ? null : mfa.gizliUret();
      return html(ctx, 200, kurulumSayfasi(ctx, { gizli }));
    },
    post: (ctx, govde) => {
      if (!ctx.kullanici) throw KimlikGerekli();
      oturum.csrfZorunlu(ctx, govde);
      try {
        servis.kurulumTamamla(ctx, { saatDilimi: govde.saatDilimi, mfaKod: govde.mfaKod, mfaGizli: govde.mfaGizli || null });
        oturum.yukle(ctx);
        return yonlendir(ctx, landingRotasi(ctx, manifest(), uygulananKodlar()));
      } catch (e) {
        if (!(e instanceof UygulamaHatasi)) throw e;
        return html(ctx, e.durum, kurulumSayfasi(ctx, { gizli: govde.mfaGizli || null, hata: hataNesnesi(e) }));
      }
    },
  });

  /* --- AUTH-07..10 sistem durumları ------------------------------------- */
  ekranRota(y, 'AUTH-07', { get: (ctx) => html(ctx, 200, sayfa.durumSayfasi({
    baslik: 'Oturum süresi doldu', ikon: 'fa-clock-rotate-left', ton: 'warn',
    aciklama: 'Güvenliğiniz için oturumunuz sonlandırıldı. Doldurduğunuz form varsa tarayıcı taslağı korunur; '
      + 'yeniden giriş yaptıktan sonra aynı sayfaya dönebilirsiniz.',
    eylemler: btn('Yeniden giriş yap', { tur: 'acc', rota: '/giris' }),
  })) });

  ekranRota(y, 'AUTH-08', { get: (ctx) => html(ctx, 403, sayfa.durumSayfasi({
    baslik: 'Bu sayfaya erişim yetkiniz yok', ikon: 'fa-lock', ton: 'danger',
    aciklama: 'Yetki, rolünüz ve veri kapsamınız üzerinden sunucuda belirlenir. '
      + 'Erişim gerekiyorsa şirket yöneticinizden yetki talep edin.',
    eylemler: h`${btn('Ana sayfaya dön', { tur: 'acc', rota: '/' })}${btn('Çıkış yap', { tur: 'ghost', rota: '/giris' })}`,
    kod: ctx.istekId,
  })) });

  ekranRota(y, 'AUTH-09', { get: (ctx) => html(ctx, 404, sayfa.durumSayfasi({
    baslik: 'Aradığınız sayfa bulunamadı', ikon: 'fa-compass', ton: 'info',
    aciklama: 'Adres değişmiş veya kayıt kaldırılmış olabilir. Arama ile devam edebilirsiniz.',
    eylemler: h`${btn('Ana sayfaya dön', { tur: 'acc', rota: '/' })}${btn('Arama yap', { tur: 'ghost', rota: '/arama' })}`,
    kod: ctx.istekId,
  })) });

  ekranRota(y, 'AUTH-10', { get: (ctx) => html(ctx, 503, sayfa.durumSayfasi({
    baslik: 'Planlı bakım', ikon: 'fa-screwdriver-wrench', ton: 'warn',
    aciklama: 'Sistem kısa süreli bakımda. İşleminiz kaydedilmediyse bakım bitiminde yeniden deneyin.',
    eylemler: btn('Yeniden dene', { tur: 'acc', rota: '/' }),
    kod: ctx.istekId,
  })) });
}

/* --- Yardımcılar --------------------------------------------------------- */
function demoBayragiTenantta() {
  const t = tek('SELECT id FROM tenant WHERE demo = 1 LIMIT 1');
  return t ? bayrakAcik(BAYRAKLAR.DEMO_ROL_SECIMI, t.id) : false;
}

function mfaGizliKaydet(kullaniciId, gizli) {
  islem(() => calistir('UPDATE kullanici SET mfa_gizli = ?, mfa_aktif = 1 WHERE id = ?', gizli, kullaniciId));
}

/* --- AUTH-06 sayfası ----------------------------------------------------- */
import { alan, hataOzeti } from '../web/bilesenler.mjs';
import { belge } from '../web/temel.mjs';
import { csrfAlani } from '../moduller/kimlik/oturum.mjs';
import { VARSAYILAN_TZ } from '../cekirdek/zaman.mjs';

function kurulumSayfasi(ctx, { gizli = null, hata = null }) {
  const uri = gizli ? mfa.kurulumUri(gizli, ctx.kullanici.eposta) : null;
  const govde = h`<main class="gv-durum">
  <div class="gv-durum-kart" style="max-width:560px;text-align:left">
    <h1>Hesabınızı kurun</h1>
    <p>İlk girişte üç adım tamamlanır: profil bilgisi, iki adımlı doğrulama ve aydınlatma onayı.
       Kurulum tamamlanmadan uygulamaya erişilemez.</p>
    ${hata ? hataOzeti(hata) : ''}
    <form class="gr-form" method="post" action="/ilk-kurulum" data-gform="1" style="margin-top:22px">
      ${ham(csrfAlani(ctx))}
      ${alan({ ad: 'saatDilimi', etiket: 'Saat dilimi', deger: ctx.kullanici.saat_dilimi || VARSAYILAN_TZ,
               ipucu: 'Tarihler UTC saklanır, bu saat diliminde gösterilir.' })}
      ${gizli ? h`
        <div class="gr-demo">
          <div class="gr-demo-bas">İki adımlı doğrulama</div>
          <p>Kimlik doğrulayıcı uygulamanıza şu anahtarı ekleyin:</p>
          <p><code>${gizli}</code></p>
          <p style="word-break:break-all"><code>${uri}</code></p>
        </div>
        <input type="hidden" name="mfaGizli" value="${gizli}">
        ${alan({ ad: 'mfaKod', etiket: 'Uygulamadaki 6 haneli kod', zorunlu: true,
                 hata: hata?.alanlar?.mfaKod, ekNitelik: ' inputmode="numeric" pattern="[0-9]{6}" maxlength="6"' })}
      ` : h`<p>İki adımlı doğrulama zaten etkin.</p>`}
      ${btn('Kurulumu tamamla', { tur: 'acc', gonder: true, ikon: 'fa-circle-check' })}
    </form>
  </div>
</main>`;
  return belge({ baslik: 'İlk kurulum', govde, govdeSinifi: 'gv-sade' });
}
