/* ============================================================================
   ROTA TABLOSU — screen-manifest'ten türer (değişmez kural 1)
   ----------------------------------------------------------------------------
   `ekranRota()` bir ekran kodunu alır, manifestten rotasını okur ve kaydeder.
   Rota elle yazılmaz: manifestteki "Önerilen yol" ne ise o servis edilir. Kayıtlı
   ekran kodları `uygulananKodlar()` ile dışa verilir; rail/menü YALNIZ uygulanmış
   ekranları gösterir — böylece §12'nin "P0 rotada 404 / WIP bağlantısı" engeli
   yapısal olarak imkânsızlaşır.
   ========================================================================== */
import { Yonlendirici } from './cekirdek/http.mjs';
import { manifest } from './cekirdek/yapilandirma.mjs';
import { Bulunamadi } from './cekirdek/hata.mjs';
import * as kimlikRotalari from './rotalar/kimlik.mjs';
import * as calismaRotalari from './rotalar/calisma.mjs';
import * as ayarRotalari from './rotalar/ayarlar.mjs';
import * as isAkisiRotalari from './rotalar/isakisi.mjs';
import * as dokumanRotalari from './rotalar/dokuman.mjs';
import * as projeRotalari from './rotalar/proje.mjs';
import * as planRotalari from './rotalar/plan.mjs';
import * as sahaRotalari from './rotalar/saha.mjs';
import * as kaliteRotalari from './rotalar/kalite.mjs';
import * as dokumanEkRotalari from './rotalar/dokuman-ek.mjs';
import * as ikRotalari from './rotalar/ik.mjs';
import * as santiyeEkRotalari from './rotalar/santiye-ek.mjs';
import * as gorevEkRotalari from './rotalar/gorev-ek.mjs';
import * as isgEkRotalari from './rotalar/isg-ek.mjs';
import * as projeEkRotalari from './rotalar/proje-ek.mjs';
import * as satinalmaRotalari from './rotalar/satinalma.mjs';
import * as stokRotalari from './rotalar/stok.mjs';
import * as sozlesmeRotalari from './rotalar/sozlesme.mjs';
import * as sozlesmeEkRotalari from './rotalar/sozlesme-ek.mjs';
import * as finansRotalari from './rotalar/finans.mjs';
import * as finansEkRotalari from './rotalar/finans-ek.mjs';
import * as varlikRotalari from './rotalar/varlik.mjs';

const uygulanan = new Set();

export function ekran(kod) {
  const e = manifest().ekranlar.find((x) => x.kod === kod);
  if (!e) throw new Error(`Manifestte olmayan ekran kodu: ${kod}`);
  return e;
}

/** Ekran kodunu rotaya bağlar. Rota manifestten okunur, elle yazılmaz. */
export function ekranRota(y, kod, { get, post } = {}) {
  const e = ekran(kod);
  if (get) y.get(e.rota, get, { ekran: e });
  if (post) y.post(e.rota, post, { ekran: e });
  uygulanan.add(kod);
  /* Takma adlar aynı kanonik ekrana düşer (K-013). */
  for (const t of manifest().ekranlar.filter((x) => x.takmaAdi === kod)) uygulanan.add(t.kod);
  return e;
}

export const uygulananKodlar = () => uygulanan;

export function yonlendiriciKur() {
  const y = new Yonlendirici();
  kimlikRotalari.kur(y, ekranRota);
  calismaRotalari.kur(y, ekranRota);
  ayarRotalari.kur(y, ekranRota);
  isAkisiRotalari.kur(y, ekranRota);
  dokumanRotalari.kur(y, ekranRota);
  projeRotalari.kur(y, ekranRota);
  planRotalari.kur(y, ekranRota);
  sahaRotalari.kur(y, ekranRota);
  kaliteRotalari.kur(y, ekranRota);
  dokumanEkRotalari.kur(y, ekranRota);
  ikRotalari.kur(y, ekranRota);
  santiyeEkRotalari.kur(y, ekranRota);
  gorevEkRotalari.kur(y, ekranRota);
  isgEkRotalari.kur(y, ekranRota);
  projeEkRotalari.kur(y, ekranRota);
  satinalmaRotalari.kur(y, ekranRota);
  stokRotalari.kur(y, ekranRota);
  sozlesmeRotalari.kur(y, ekranRota);
  sozlesmeEkRotalari.kur(y, ekranRota);
  finansRotalari.kur(y, ekranRota);
  finansEkRotalari.kur(y, ekranRota);
  varlikRotalari.kur(y, ekranRota);

  /* Kök: oturum varsa role göre landing, yoksa giriş. */
  y.get('/', (ctx) => kimlikRotalari.kok(ctx));
  y.post('/cikis', (ctx, p) => kimlikRotalari.cikis(ctx, p));
  y.get('/sso', (ctx) => kimlikRotalari.sso(ctx));

  /* Manifestte tanımlı ama HENÜZ uygulanmamış rota: sahte ekran üretmek yerine
     dürüst 404 verilir ve hangi fazda geleceği söylenir (WIP bağlantısı yasak). */
  for (const e of manifest().ekranlar) {
    if (uygulanan.has(e.kod) || e.acik) continue;
    if (e.dinamik) continue;
    y.get(e.rota, (ctx) => { throw Bulunamadi(`"${e.ad}" ekranı bu sürümde henüz yayında değil (${e.kod}).`); }, { ekran: e, planli: true });
  }
  return y;
}
