/* ============================================================================
   ROTA ORTAKLARI — her modülün tekrar ettiği kalıplar tek yerde
   ----------------------------------------------------------------------------
   Amaç yalnız kısalık değil TUTARLILIK: sayfa çizimi, liste sorgusu, durum
   geçişi ve kayıt oluşturma hep aynı sözleşmeyle yapılır; bir modül kuralı
   atlarsa fark açıkça görünür.
   ========================================================================== */
import { sorgu, tek, calistir, islem, surumluGuncelle } from '../cekirdek/db.mjs';
import { manifest } from '../cekirdek/yapilandirma.mjs';
import { simdi } from '../cekirdek/zaman.mjs';
import { Bulunamadi, DogrulamaHatasi } from '../cekirdek/hata.mjs';
import * as audit from '../cekirdek/audit.mjs';
import { yetkiZorunlu, yetkiVar, kapsamZorunlu, kapsamFiltresi, alanMaskeliMi,
  kapsamCozucu, maskele } from '../moduller/kimlik/yetki.mjs';
import { gecisYap, izinliGecisler, isaretler } from '../moduller/isakisi/durum.mjs';
import { durumEtiketi } from '../moduller/isakisi/durumlar.mjs';
import { sonrakiKod } from '../moduller/isakisi/numara.mjs';
import { csrfZorunlu, csrfAlani } from '../moduller/kimlik/oturum.mjs';
import { kabuk } from '../web/kabuk.mjs';
import { h, ham, sayi } from '../web/temel.mjs';
import * as B from '../web/bilesenler.mjs';
import { sayaclar } from './calisma.mjs';

export const ekranNesnesi = (kod) => manifest().ekranlar.find((e) => e.kod === kod);
export const hataNesnesi = (e) => ({ kod: e.kod, mesaj: e.mesaj, alanlar: e.alanlar,
  yonlendirme: e.yonlendirme || null });
export const kullaniciAdi = (id) => (id ? tek('SELECT ad_soyad FROM kullanici WHERE id = ?', id)?.ad_soyad || '—' : '—');

/* ==========================================================================
   DETAY SEKMELERİ — kanonik adres manifestten TÜRER (değişmez kural 1)
   --------------------------------------------------------------------------
   Bir detay ekranının sekmesi, manifestte KENDİ ekranı olan bir yola denk
   gelebilir: `/projeler/:id` detayının `riskler` sekmesi aslında PRJ-08
   `/projeler/:id/riskler` ekranıdır. Böyle bir sekmenin `?sekme=riskler`
   biçiminde ikinci bir adresi olamaz — aynı ekran için iki URL, kural 1'in
   ve kural 4'ün ihlalidir.

   Eşleştirme manifestten hesaplanır; elle liste tutulmaz. Manifeste yeni bir
   alt ekran eklendiğinde sekme kendiliğinden kanonik rotaya döner.
   ========================================================================== */

/** `<desen>/<sekme>` rotasına sahip manifest ekranı (yoksa null). */
export const sekmeEkrani = (desen, sekmeAdi) =>
  manifest().ekranlar.find((e) => e.rota === `${desen}/${sekmeAdi}`) || null;

/** Sekme listesini kanonik rotalarıyla zenginleştirir. */
export function sekmeleriCoz(sekmeler, { desen, rota }) {
  return sekmeler.map((s) => {
    const ekran = sekmeEkrani(desen, s.ad);
    return ekran ? { ...s, rota: `${rota}/${s.ad}`, kod: ekran.kod } : s;
  });
}

/**
 * Eski `?sekme=<kanonik>` biçiminin gitmesi gereken kanonik YOL (yoksa null).
 *
 * Yolu döner, yanıtı YAZMAZ: `yonlendir()` yanıtı yan etki olarak yazar ve
 * `undefined` döner; dönüş değerinin doğruluğuna bakan bir çağrı yönlendirmeyi
 * yazıp sayfayı da çizmeye kalkardı (ERR_HTTP_HEADERS_SENT).
 *
 * Kanonik karşılığı OLMAYAN sekmeler (`ozet`, `santiyeler` …) tek ekranın iç
 * durumudur, ikinci bir URL değildir — onlar için null döner.
 */
export function eskiSekmeHedefi(ctx, { desen, rota }) {
  const sekme = ctx.sorgu.get('sekme');
  if (!sekme || !sekmeEkrani(desen, sekme)) return null;
  const kalan = new URLSearchParams(ctx.sorgu);
  kalan.delete('sekme');
  const qs = kalan.toString();
  return `${rota}/${sekme}${qs ? `?${qs}` : ''}`;
}

/**
 * `?cikti=` desteklemeyen ekranlarda parametreyi AÇIKÇA REDDEDER (kural 9).
 *
 * Sessizce yutmak, PDF isteyen kullanıcıya HTML vermek demektir: istek
 * karşılanmadığı hâlde 200 döner ve kullanıcı çıktının üretildiğini sanır.
 * Bu ekranların ReportLayout karşılığı varsa `yerine` ile gösterilir.
 */
export function ciktiDesteklenmez(ctx, { yerine = null } = {}) {
  const bicim = ctx.sorgu.get('cikti');
  if (!bicim) return;
  throw DogrulamaHatasi(
    `Bu ekran dosya çıktısı üretmez (istenen biçim: ${bicim}).`
    + (yerine ? ` PDF/Excel/CSV için ${yerine} raporunu kullanın.` : ''),
    { alanlar: { cikti: ['Bu ekranda desteklenmiyor.'] } });
}

export function ciz(ctx, ekran, icerik, ek = {}) {
  const s = sayaclar(ctx);
  return kabuk(ctx, { ekran, icerik, onayAdedi: s.onay, bildirimAdedi: s.bildirim, ...ek });
}

/** Tenant + kapsam filtreli, sunucu tarafı sayfalanan liste sorgusu (§3.1). */
export function listeSorgusu(ctx, { tablo, ekAlanlar = '', kosullar = [], parametreler = [],
                                    sirala = 'olusturuldu DESC', kapsam = true, kapsamSecenekleri = null }) {
  const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
  const tumKosullar = [...kosullar];
  const tumParametreler = [...parametreler];
  if (kapsam) {
    const k = kapsamFiltresi(ctx, kapsamSecenekleri || {});
    tumKosullar.unshift(k.nerede);
    tumParametreler.unshift(...k.parametreler);
  } else {
    tumKosullar.unshift('tenant_id = ?');
    tumParametreler.unshift(ctx.tenant.id);
  }
  const nerede = tumKosullar.join(' AND ');
  const toplam = Number(tek(`SELECT COUNT(*) AS n FROM ${tablo} WHERE ${nerede}`, ...tumParametreler)?.n ?? 0);
  const satirlar = sorgu(
    `SELECT *${ekAlanlar} FROM ${tablo} WHERE ${nerede} ORDER BY ${sirala} LIMIT ? OFFSET ?`,
    ...tumParametreler, boyut, atla);
  return { sayfa, boyut, toplam, satirlar };
}

/** Arama + filtre koşullarını sorgu parametrelerinden kurar. */
export function filtreKosullari(ctx, { aramaAlanlari = [], filtreler = [] }) {
  const kosullar = []; const parametreler = [];
  const q = (ctx.sorgu.get('q') || '').trim();
  if (q && aramaAlanlari.length) {
    kosullar.push(`(${aramaAlanlari.map((a) => `${a} LIKE ?`).join(' OR ')})`);
    for (const _ of aramaAlanlari) parametreler.push(`%${q}%`);
  }
  for (const f of filtreler) {
    const d = ctx.sorgu.get(f.ad);
    if (d) { kosullar.push(`${f.sutun || f.ad} = ?`); parametreler.push(d); }
  }
  return { kosullar, parametreler };
}

/** Kod üreterek kayıt açar; audit yazar. Transaction dışında çağrılabilir. */
export function kayitOlustur(ctx, { tablo, nesne, alanlar, kodNesnesi = null }) {
  return islem(() => {
    const kod = kodNesnesi ? sonrakiKod(ctx.tenant.id, kodNesnesi) : null;
    const id = alanlar.id;
    const tumAlanlar = { ...alanlar, ...(kod ? { kod } : {}), tenant_id: ctx.tenant.id,
      olusturan: ctx.kullanici.id, olusturuldu: simdi() };
    const sutunlar = Object.keys(tumAlanlar);
    calistir(`INSERT INTO ${tablo} (${sutunlar.join(', ')}) VALUES (${sutunlar.map(() => '?').join(', ')})`,
      ...Object.values(tumAlanlar));
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne, nesneId: id, eylem: 'olustur', sonraki: { ...alanlar, kod, id: undefined } });
    return { id, kod };
  });
}

/** Detay sayfası için kaydı yükler ve kapsamı doğrular. */
export function kaydiAl(ctx, tablo, nesne, id) {
  const kayit = tek(`SELECT * FROM ${tablo} WHERE id = ? AND tenant_id = ?`, id, ctx.tenant.id);
  if (!kayit) throw Bulunamadi('Kayıt bulunamadı.');
  kapsamZorunlu(ctx, nesne, kayit);
  return kayit;
}

/**
 * Detay sayfasındaki durum geçişi formu — kullanıcı hedef DURUMU değil EYLEMİ
 * seçer; hangi durumun geleceğini motor bilir (değişmez kural 5).
 */
export function gecisFormu(ctx, { nesne, kayit, rota, ekranKodu }) {
  const gecisler = izinliGecisler(ctx, nesne, kayit, { ekranKodu });
  if (!gecisler.length) return h``;
  return h`<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Durum işlemleri</b>
    <span>Hedef durumu siz seçmezsiniz; eylemi seçersiniz, geçişi motor yapar.</span></div></div>
  <div class="gc-body">
    <form method="post" action="${rota}" data-gform="1">
      ${ham(csrfAlani(ctx))}
      <input type="hidden" name="_eylem" value="gecis">
      <input type="hidden" name="surum" value="${kayit.surum}">
      ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe', tur: 'metin',
        ipucu: 'Askıya alma, iptal ve geri gönderme gibi işlemlerde gerekçe zorunludur.' })}
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
        ${gecisler.map((g) => g.engel
          ? h`<button class="btn btn-ghost" type="button" disabled title="${g.engel}">
              <i class="fa-solid fa-ban"></i> ${g.etiket}</button>
              <span class="gf-err">${g.engel}</span>`
          : h`<button class="btn ${ham(g.e === 'iptal' ? 'btn-danger' : 'btn-ghost')}" type="submit"
              name="gecis" value="${g.eylem}">${g.etiket}
              <span class="muted">→ ${g.hedefEtiket}</span></button>`)}
      </div>
    </form>
  </div>
</div>`;
}

/** Geçiş formunun POST tarafı. */
export function gecisIsle(ctx, { nesne, tablo, kayit, govde, ekranKodu, yanEtki = null }) {
  csrfZorunlu(ctx, govde);
  if (Number(govde.surum) !== kayit.surum) {
    throw DogrulamaHatasi('Kayıt bu sırada değişti; sayfayı yenileyin.');
  }
  return gecisYap(ctx, { nesne, tablo, kayit, eylem: govde.gecis, gerekce: govde.gerekce, ekranKodu, yanEtki });
}

/** Detay üst şeridi — durum + hesaplanan işaretler AYRI gösterilir (§5.2). */
export function ozetSeridi(ctx, { nesne, kayit, baslik, bilgiler, birincilEylem = null, digerEylemler = null }) {
  return B.detayOzetSeridi({
    kod: kayit.kod || kayit.id,
    baslik,
    durum: kayit.durum,
    surum: kayit.surum,
    isaretler: isaretler(nesne, kayit).map((i) => ({ metin: i.metin, ton: i.ton })),
    bilgiler,
    birincilEylem, digerEylemler,
  });
}

export { B, h, ham, sayi, csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar, kapsamZorunlu,
  alanMaskeliMi, kapsamCozucu, maskele, kapsamFiltresi,
  durumEtiketi, isaretler, izinliGecisler, gecisYap, sorgu, tek, calistir, islem,
  surumluGuncelle, audit, sonrakiKod };
