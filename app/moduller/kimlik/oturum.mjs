/* ============================================================================
   OTURUM — sunucu tarafı, HttpOnly + Secure + SameSite çerez (doküman 2.1)
   ----------------------------------------------------------------------------
   Çerezde YALNIZCA opak token bulunur; rol, tenant, yetki veya bağlam çerezde
   TAŞINMAZ (değişmez kural 2). Token veritabanında açık saklanmaz, özeti saklanır.
   CSRF: oturuma bağlı ayrı bir token; her POST formunda ve JSON başlığında istenir.
   ========================================================================== */
import { tek, calistir, islem } from '../../cekirdek/db.mjs';
import { kimlik, token, tokenOzeti, guvenliEsit } from '../../cekirdek/kimlikler.mjs';
import { simdi } from '../../cekirdek/zaman.mjs';
import { yapilandirma } from '../../cekirdek/yapilandirma.mjs';
import { cerezYaz, cerezSil } from '../../cekirdek/http.mjs';
import { CsrfGecersiz } from '../../cekirdek/hata.mjs';
import { yetkiProfili } from './yetki.mjs';

export const OTURUM_CEREZ = 'gb_oturum';
export const CSRF_CEREZ = 'gb_csrf';

/** Yeni oturum açar; çerez satırlarını ctx'e yazar. */
export function baslat(ctx, kullanici, { mfaDogrulandi = false } = {}) {
  const ham = token(32);
  const csrf = token(24);
  const t = simdi();
  const id = kimlik('oturum');
  calistir(
    `INSERT INTO oturum (id, tenant_id, kullanici_id, token_ozeti, csrf_ozeti, ip, tarayici,
                         mfa_dogrulandi, olusturuldu, son_erisim, bitis)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    id, kullanici.tenant_id, kullanici.id, tokenOzeti(ham), tokenOzeti(csrf),
    ctx.ip, ctx.tarayici, mfaDogrulandi ? 1 : 0, t, t, t + yapilandirma.oturumSuresiMs);

  ctx.cerezAyarla(cerezYaz(OTURUM_CEREZ, ham, { maxYas: yapilandirma.oturumSuresiMs }));
  /* CSRF çerezi JS tarafından okunabilir olmalı (fetch başlığına konur) → httpOnly=false.
     Değeri tek başına işe yaramaz; oturum çerezi olmadan geçersizdir. */
  ctx.cerezAyarla(cerezYaz(CSRF_CEREZ, csrf, { maxYas: yapilandirma.oturumSuresiMs, httpOnly: false }));

  /* Bağlam AYNI istek içinde de kullanılabilir olmalı: çerez daha istemciye
     ulaşmadığı için yukle() bu isteği göremez; oturumu doğrudan yerleştiriyoruz. */
  ctx.oturum = tek('SELECT * FROM oturum WHERE id = ?', id);
  ctx.kullanici = tek('SELECT * FROM kullanici WHERE id = ?', kullanici.id);
  ctx.tenant = tek('SELECT * FROM tenant WHERE id = ?', kullanici.tenant_id);
  ctx.yetkiler = yetkiProfili(kullanici.id, kullanici.tenant_id);
  ctx.cerezler[OTURUM_CEREZ] = ham;
  ctx.cerezler[CSRF_CEREZ] = csrf;
  return { id, csrf };
}

/** Çerezdeki tokeni doğrular, ctx'e oturum + kullanıcı + yetki profilini yükler. */
export function yukle(ctx) {
  const ham = ctx.cerezler[OTURUM_CEREZ];
  if (!ham) return null;
  const o = tek('SELECT * FROM oturum WHERE token_ozeti = ?', tokenOzeti(ham));
  if (!o) return null;
  const t = simdi();
  if (o.sonlandirildi || o.bitis < t) return null;

  const k = tek('SELECT * FROM kullanici WHERE id = ?', o.kullanici_id);
  if (!k || k.durum !== 'aktif') return null;
  const ten = tek('SELECT * FROM tenant WHERE id = ?', o.tenant_id);
  if (!ten || ten.durum !== 'aktif') return null;

  if (t - o.son_erisim > yapilandirma.oturumYenilemeMs) {
    calistir('UPDATE oturum SET son_erisim = ? WHERE id = ?', t, o.id);
  }
  ctx.oturum = o;
  ctx.kullanici = k;
  ctx.tenant = ten;
  ctx.yetkiler = yetkiProfili(k.id, ten.id);
  return o;
}

export function sonlandir(ctx, neden = 'kullanici_cikisi') {
  if (ctx.oturum) {
    calistir('UPDATE oturum SET sonlandirildi = ?, sonlandirma_nedeni = ? WHERE id = ?',
      simdi(), neden, ctx.oturum.id);
  }
  ctx.cerezAyarla(cerezSil(OTURUM_CEREZ));
  ctx.cerezAyarla(cerezSil(CSRF_CEREZ));
  ctx.oturum = ctx.kullanici = ctx.tenant = ctx.yetkiler = null;
}

/** Kullanıcının tüm oturumlarını kapatır (parola değişimi, işten ayrılış, kilit). */
export function tumOturumlariKapat(kullaniciId, neden) {
  calistir(`UPDATE oturum SET sonlandirildi = ?, sonlandirma_nedeni = ?
             WHERE kullanici_id = ? AND sonlandirildi IS NULL`, simdi(), neden, kullaniciId);
}

/** Aktif bağlam (şirket/proje/şantiye) oturum kaydında tutulur — istemcide DEĞİL. */
export function baglamAyarla(ctx, { sirket, proje, santiye }) {
  islem(() => calistir(
    `UPDATE oturum SET aktif_sirket = COALESCE(?, aktif_sirket),
                       aktif_proje = COALESCE(?, aktif_proje),
                       aktif_santiye = COALESCE(?, aktif_santiye) WHERE id = ?`,
    sirket ?? null, proje ?? null, santiye ?? null, ctx.oturum.id));
}

/* --- CSRF ---------------------------------------------------------------- */
export function csrfZorunlu(ctx, govde) {
  if (!ctx.oturum) return;                       // giriş öncesi formlar ayrı korunur
  const gonderilen = govde?._csrf || ctx.basliklar['x-csrf-token'];
  if (!gonderilen || !guvenliEsit(tokenOzeti(gonderilen), ctx.oturum.csrf_ozeti)) throw CsrfGecersiz();
}

/** Formlara gömülecek gizli alan. */
export function csrfAlani(ctx) {
  const csrf = ctx.cerezler[CSRF_CEREZ];
  return csrf ? `<input type="hidden" name="_csrf" value="${csrf}">` : '';
}
