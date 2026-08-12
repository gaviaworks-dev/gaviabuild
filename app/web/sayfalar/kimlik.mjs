/* ============================================================================
   KİMLİK SAYFALARI — AUTH-01..10
   ----------------------------------------------------------------------------
   Doküman 2.1 birebir: iki panelli giriş; sol panel ürün anlatımı, sağ panel
   kimlik doğrulama. Sol başlık ve beş fayda maddesi şartnamede SABİT metindir.
   "Rol seçerek incele" yalnız demo/QA bayrağıyla ve açık DEMO etiketiyle görünür.
   ========================================================================== */
import { h, ham, belge, kacir } from '../temel.mjs';
import { alan, btn, hataOzeti, sonucSeridi } from '../bilesenler.mjs';
import { yapilandirma } from '../../cekirdek/yapilandirma.mjs';

/* Şartnamede sabitlenen metinler — değiştirilmesi doküman revizyonu gerektirir. */
export const SOL_BASLIK = 'Şirketten şantiyeye tüm operasyon tek platformda';
export const FAYDALAR = [
  { ikon: 'fa-diagram-project',  metin: 'Proje ve şantiye kontrolü' },
  { ikon: 'fa-timeline',         metin: 'İş programı ve saha ilerlemesi' },
  { ikon: 'fa-users',            metin: 'Personel, puantaj ve İSG' },
  { ikon: 'fa-boxes-stacked',    metin: 'Satın alma, stok ve varlık' },
  { ikon: 'fa-file-signature',   metin: 'Sözleşme, hakediş, finans ve raporlama' },
];

function solPanel() {
  return h`<section class="gr-sol">
  <div class="gr-mark">G</div>
  <h1>${SOL_BASLIK}</h1>
  <p class="gr-lead">Şirket, proje ve şantiye süreçleri aynı veri omurgasında yönetilir;
    her onay, her hareket ve her rapor tek kanonik kayda dayanır.</p>
  <ul class="gr-fay">
    ${FAYDALAR.map((f) => h`<li><i class="fa-solid ${ham(kacir(f.ikon))}"></i> ${f.metin}</li>`)}
  </ul>
  <div class="gr-foot">[ÜRÜN ADI] · Bütünleşik İnşaat ve Şantiye Operasyonları Yönetim Platformu</div>
</section>`;
}

function ikiPanel(sag) {
  return h`<div class="gr-split">${solPanel()}<section class="gr-sag"><div class="gr-kart">${sag}</div></section></div>`;
}

/* --- AUTH-01 Giriş ------------------------------------------------------- */
export function girisSayfasi(ctx, { hata = null, eposta = '', demoPersonalar = null, bilgi = null } = {}) {
  const sag = h`
  <h2>Oturum açın</h2>
  <p class="gr-alt">Hesabınız şirket yöneticiniz tarafından tanımlanır.</p>
  ${bilgi ? sonucSeridi(bilgi) : ''}
  ${hata ? hataOzeti(hata) : ''}
  <form class="gr-form" method="post" action="/giris" data-gform="1">
    ${alan({ ad: 'eposta', etiket: 'E-posta veya kullanıcı adı', tur: 'email', deger: eposta, zorunlu: true,
             ekNitelik: ' autocomplete="username" autofocus' })}
    ${alan({ ad: 'parola', etiket: 'Şifre', tur: 'password', zorunlu: true, ekNitelik: ' autocomplete="current-password"' })}
    <div class="gr-satir">
      <label><input type="checkbox" name="beniHatirla" value="1"> Beni hatırla</label>
      <a href="/sifre-unuttum">Şifremi unuttum</a>
    </div>
    ${btn('Giriş yap', { tur: 'acc', gonder: true, ikon: 'fa-right-to-bracket' })}
  </form>
  <div class="gr-ayrac">veya</div>
  ${btn('Kurumsal hesapla devam et (SSO)', { tur: 'ghost', rota: '/sso' })}
  ${demoPersonalar?.length ? demoBlogu(demoPersonalar) : ''}`;
  return belge({ baslik: 'Giriş', govde: ikiPanel(sag), govdeSinifi: 'gv-sade' });
}

/** DEMO/QA yüzeyi — bayrak açıkken görünür, üretimde kod düzeyinde kapalı. */
function demoBlogu(personalar) {
  return h`<div class="gr-demo">
  <div class="gr-demo-bas"><span class="gtag">DEMO</span> Rol seçerek incele</div>
  <p>Bu blok yalnız demo/QA ortamında görünür. Seçtiğiniz persona ile <b>gerçek oturum</b> açılır;
     rol istemciden değil sunucudaki rol atamasından gelir. Ortak şifre: <code>Demo.Parola.2026</code></p>
  <div class="gr-demo-liste">
    ${personalar.map((p) => h`<form method="post" action="/giris" style="display:inline">
      <input type="hidden" name="eposta" value="${p.eposta}">
      <input type="hidden" name="parola" value="Demo.Parola.2026">
      <input type="hidden" name="demoPersona" value="1">
      <button class="btn btn-ghost btn-sm" type="submit">${p.rol_ad}</button>
    </form>`)}
  </div>
</div>`;
}

/* --- AUTH-02 Şifremi unuttum -------------------------------------------- */
export function sifreUnuttumSayfasi(ctx, { gonderildi = false, eposta = '', demoBaglanti = null } = {}) {
  /* Kural 3: gönderici bağlı değilken "gönderildi" DENMEZ. Token anonim
     kullanıcıya GÖSTERİLMEZ — gösterilseydi herkes herkesin şifresini
     sıfırlardı; bu yüzden K-021'in aksine burada bağlantı üretimde de gizlidir
     ve kullanıcı yöneticisine yönlendirilir (K-115). */
  const sag = gonderildi
    ? (yapilandirma.epostaBagli
      ? h`<h2>Bağlantı gönderildi</h2>
        <p class="gr-alt">Bu e-posta adresi kayıtlıysa, sıfırlama bağlantısı gönderildi.
           Bağlantı <b>bir saat</b> geçerlidir ve <b>tek kullanımlıktır</b>.</p>`
      : h`<h2>Talebiniz alındı — e-posta GÖNDERİLMEDİ</h2>
        <p class="gr-alt">Bu e-posta adresi kayıtlıysa sıfırlama talebi oluşturuldu.
           Ancak bu kurulumda e-posta gönderimi <b>bağlı değil</b>; size otomatik bir
           bağlantı <b>gönderilemez</b>. Şifrenizi sıfırlamak için sistem yöneticinizden
           davet/sıfırlama bağlantısı isteyin.</p>`)
    : null;
  const sagTam = sag
    ? h`${sag}
        ${demoBaglanti ? h`<div class="gr-demo"><div class="gr-demo-bas"><span class="gtag">DEMO</span> Sıfırlama bağlantısı</div>
          <p>E-posta gönderimi bu ortamda kapalı olduğu için bağlantı burada gösteriliyor.</p>
          <a class="btn btn-acc btn-sm" href="${demoBaglanti}">Şifre sıfırlama sayfasına git</a></div>` : ''}
        <div class="gr-ayrac">veya</div>
        ${btn('Giriş sayfasına dön', { tur: 'ghost', rota: '/giris' })}`
    : h`<h2>Şifremi unuttum</h2>
        <p class="gr-alt">Kayıtlı e-posta adresinizi girin.${yapilandirma.epostaBagli
          ? ' Sıfırlama bağlantısı gönderelim.'
          : ' Bu kurulumda e-posta gönderimi BAĞLI DEĞİL; bağlantı otomatik gönderilemez.'}</p>
        <form class="gr-form" method="post" action="/sifre-unuttum" data-gform="1">
          ${alan({ ad: 'eposta', etiket: 'E-posta', tur: 'email', deger: eposta, zorunlu: true, ekNitelik: ' autocomplete="username" autofocus' })}
          ${btn(yapilandirma.epostaBagli ? 'Sıfırlama bağlantısı gönder' : 'Sıfırlama talebi oluştur',
    { tur: 'acc', gonder: true, ikon: 'fa-paper-plane' })}
        </form>
        <div class="gr-ayrac">veya</div>
        ${btn('Giriş sayfasına dön', { tur: 'ghost', rota: '/giris' })}`;
  return belge({ baslik: 'Şifremi unuttum', govde: ikiPanel(sagTam), govdeSinifi: 'gv-sade' });
}

/* --- AUTH-03 Şifre sıfırla ---------------------------------------------- */
export function sifreSifirlaSayfasi(ctx, { token, hata = null } = {}) {
  const sag = h`<h2>Yeni şifre belirleyin</h2>
  <p class="gr-alt">Şifreniz en az 10 karakter olmalı; büyük harf, küçük harf ve rakam içermelidir.</p>
  ${hata ? hataOzeti(hata) : ''}
  <form class="gr-form" method="post" action="/sifre-sifirla/${ham(encodeURIComponent(token))}" data-gform="1">
    ${alan({ ad: 'yeniParola', etiket: 'Yeni şifre', tur: 'password', zorunlu: true,
             hata: hata?.alanlar?.parola, ekNitelik: ' autocomplete="new-password" autofocus' })}
    ${alan({ ad: 'yeniParolaTekrar', etiket: 'Yeni şifre (tekrar)', tur: 'password', zorunlu: true,
             hata: hata?.alanlar?.yeniParolaTekrar, ekNitelik: ' autocomplete="new-password"' })}
    ${btn('Şifreyi güncelle', { tur: 'acc', gonder: true, ikon: 'fa-key' })}
  </form>
  <p class="gr-alt" style="margin-top:16px">Şifre değiştiğinde <b>tüm açık oturumlar kapatılır</b>.</p>`;
  return belge({ baslik: 'Şifre sıfırla', govde: ikiPanel(sag), govdeSinifi: 'gv-sade' });
}

/* --- AUTH-04 Davet kabul ------------------------------------------------ */
export function davetSayfasi(ctx, { token, adSoyad = '', hata = null } = {}) {
  const sag = h`<h2>Davetiniz</h2>
  <p class="gr-alt">Hesabınızı etkinleştirmek için bilgilerinizi tamamlayın.</p>
  ${hata ? hataOzeti(hata) : ''}
  <form class="gr-form" method="post" action="/davet/${ham(encodeURIComponent(token))}" data-gform="1">
    ${alan({ ad: 'adSoyad', etiket: 'Ad soyad', deger: adSoyad, zorunlu: true, hata: hata?.alanlar?.adSoyad, ekNitelik: ' autofocus' })}
    ${alan({ ad: 'yeniParola', etiket: 'Şifre belirleyin', tur: 'password', zorunlu: true,
             hata: hata?.alanlar?.parola, ekNitelik: ' autocomplete="new-password"' })}
    ${alan({ ad: 'yeniParolaTekrar', etiket: 'Şifre (tekrar)', tur: 'password', zorunlu: true, hata: hata?.alanlar?.yeniParolaTekrar })}
    <div class="gr-satir">
      <label><input type="checkbox" name="kvkkOnay" value="1" required>
        <span>Aydınlatma metnini okudum ve kabul ediyorum.</span></label>
    </div>
    ${btn('Hesabımı etkinleştir', { tur: 'acc', gonder: true, ikon: 'fa-user-check' })}
  </form>`;
  return belge({ baslik: 'Davet kabul', govde: ikiPanel(sag), govdeSinifi: 'gv-sade' });
}

/* --- AUTH-05 MFA -------------------------------------------------------- */
export function mfaSayfasi(ctx, { mfaToken, hata = null, kurulumGerekli = false, kurulum = null } = {}) {
  const sag = h`<h2>İki adımlı doğrulama</h2>
  <p class="gr-alt">${kurulumGerekli
    ? 'Bu hesapta iki adımlı doğrulama zorunlu. Kimlik doğrulayıcı uygulamanıza aşağıdaki anahtarı ekleyip kodu girin.'
    : 'Kimlik doğrulayıcı uygulamanızdaki 6 haneli kodu girin.'}</p>
  ${hata ? hataOzeti(hata) : ''}
  ${kurulum ? h`<div class="gr-demo"><div class="gr-demo-bas">Kurulum anahtarı</div>
    <p><code>${kurulum.gizli}</code></p><p>URI: <code>${kurulum.uri}</code></p></div>` : ''}
  <form class="gr-form" method="post" action="/mfa" data-gform="1">
    <input type="hidden" name="mfaToken" value="${mfaToken}">
    ${kurulum ? h`<input type="hidden" name="mfaGizli" value="${kurulum.gizli}">` : ''}
    ${alan({ ad: 'kod', etiket: 'Doğrulama kodu', zorunlu: true,
             ekNitelik: ' inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" autofocus' })}
    ${btn('Doğrula', { tur: 'acc', gonder: true, ikon: 'fa-shield-halved' })}
  </form>
  <p class="gr-alt" style="margin-top:16px">Doğrulama adımı <b>5 dakika</b> geçerlidir.</p>`;
  return belge({ baslik: 'İki adımlı doğrulama', govde: ikiPanel(sag), govdeSinifi: 'gv-sade' });
}

/* --- Sistem durumu sayfaları (AUTH-07..10) ------------------------------ */
export function durumSayfasi({ baslik, aciklama, ikon, ton = 'info', eylemler = [], kod = null }) {
  const tonlar = { info: 'var(--info-tint);color:var(--info)', warn: 'var(--warn-tint);color:var(--warn)',
                   danger: 'var(--danger-tint);color:var(--danger)', ok: 'var(--ok-tint);color:var(--ok)' };
  const govde = h`<main class="gv-durum">
  <div class="gv-durum-kart">
    <div class="gv-durum-ico" style="background:${ham(tonlar[ton] || tonlar.info)}"><i class="fa-solid ${ham(kacir(ikon))}"></i></div>
    <h1>${baslik}</h1>
    <p>${aciklama}</p>
    <div class="gv-durum-acts">${eylemler}</div>
    ${kod ? h`<div class="gv-durum-kod">Olay kodu: <code>${kod}</code></div>` : ''}
  </div>
</main>`;
  return belge({ baslik, govde, govdeSinifi: 'gv-sade' });
}
