/* ============================================================================
   ZAMAN — UTC saklanır, kullanıcı saat diliminde gösterilir (değişmez kural 10)
   ----------------------------------------------------------------------------
   Saklama birimi: epoch milisaniye (tamsayı). Yerel saat hiçbir yerde saklanmaz.
   Test edilebilirlik için saat enjekte edilebilir (`saatAyarla`).
   ========================================================================== */

let _simdi = () => Date.now();

/** Testlerde deterministik zaman için saati sabitler. */
export function saatAyarla(fn) { _simdi = fn; }
export function saatSifirla() { _simdi = () => Date.now(); }

/** Şu an — UTC epoch ms. Uygulamada `Date.now()` DOĞRUDAN kullanılmaz. */
export const simdi = () => _simdi();

export const VARSAYILAN_TZ = 'Europe/Istanbul';

const bicimlendiriciler = new Map();
function bicimlendirici(tz, secenekler) {
  const anahtar = tz + JSON.stringify(secenekler);
  if (!bicimlendiriciler.has(anahtar)) {
    bicimlendiriciler.set(anahtar, new Intl.DateTimeFormat('tr-TR', { timeZone: tz, ...secenekler }));
  }
  return bicimlendiriciler.get(anahtar);
}

/** 11.08.2026 */
export const tarih = (ms, tz = VARSAYILAN_TZ) =>
  ms == null ? '' : bicimlendirici(tz, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ms));

/** 11.08.2026 14:32 */
export const tarihSaat = (ms, tz = VARSAYILAN_TZ) =>
  ms == null ? '' : bicimlendirici(tz, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));

/** ISO 8601 UTC — makine okunur alanlar ve çıktı künyeleri için. */
export const iso = (ms) => (ms == null ? '' : new Date(ms).toISOString());

/** "2026-08-11" (kullanıcı TZ'sinde gün) — form input[type=date] için. */
export function gunAnahtari(ms, tz = VARSAYILAN_TZ) {
  const p = bicimlendirici(tz, { day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(new Date(ms));
  const al = (t) => p.find((x) => x.type === t).value;
  return `${al('year')}-${al('month')}-${al('day')}`;
}

/** "2026-08-11" + saat dilimi → UTC epoch ms (gün başlangıcı). */
export function gunBaslangici(gun, tz = VARSAYILAN_TZ) {
  const [y, a, g] = gun.split('-').map(Number);
  /* Hedef TZ ofsetini o tarihte hesapla (yaz saati dahil). */
  const varsayim = Date.UTC(y, a - 1, g, 0, 0, 0);
  const ofset = tzOfsetMs(varsayim, tz);
  return varsayim - ofset;
}

function tzOfsetMs(ms, tz) {
  const b = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const al = (t) => Number(b.find((x) => x.type === t).value);
  const yerel = Date.UTC(al('year'), al('month') - 1, al('day'), al('hour') % 24, al('minute'), al('second'));
  return yerel - ms;
}

export const GUN_MS = 86_400_000;
export const gunEkle = (ms, n) => ms + n * GUN_MS;

/** İki zaman arasındaki tam gün farkı (gecikme hesabı için). */
export const gunFarki = (a, b) => Math.floor((b - a) / GUN_MS);
