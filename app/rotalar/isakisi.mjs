/* ============================================================================
   İŞ AKIŞI ROTALARI — GLB-04, GLB-05, GLB-09, SET-06, SET-07, SET-09..12
   ----------------------------------------------------------------------------
   Bu ekranlar Faz 2 çıkış koşulunun görünür yüzüdür: kullanıcı hiçbir formda
   durum veya onaycı seçmez; onay kutusundan yalnız KARAR verir.
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { sorgu, tek, calistir, islem, surumluGuncelle } from '../cekirdek/db.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarihSaat, tarih, gunBaslangici, gunAnahtari, GUN_MS } from '../cekirdek/zaman.mjs';
import { Para } from '../cekirdek/para.mjs';
import { UygulamaHatasi, Bulunamadi, DogrulamaHatasi } from '../cekirdek/hata.mjs';
import { idempotent } from '../cekirdek/idempotency.mjs';
import * as audit from '../cekirdek/audit.mjs';
import { manifest } from '../cekirdek/yapilandirma.mjs';
import { yetkiZorunlu, yetkiVar, kapsamZorunlu } from '../moduller/kimlik/yetki.mjs';
import { csrfZorunlu, csrfAlani } from '../moduller/kimlik/oturum.mjs';
import * as onayMotoru from '../moduller/isakisi/onay.mjs';
import * as vekaletServisi from '../moduller/isakisi/vekalet.mjs';
import { sonrakiKod } from '../moduller/isakisi/numara.mjs';
import { gecisYap, izinliGecisler, isaretler } from '../moduller/isakisi/durum.mjs';
import { durumEtiketi, NESNELER } from '../moduller/isakisi/durumlar.mjs';
import { bildir } from '../moduller/isakisi/bildirim.mjs';
import { bazCizgiSonucu } from './plan.mjs';
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
const ad = (id) => (id ? tek('SELECT ad_soyad FROM kullanici WHERE id = ?', id)?.ad_soyad || id : '—');

export function kur(y, ekranRota) {
  /* ======================================================================
     GLB-04 — Onay kutum   (tüm modüllerin merkezi onay görevleri)
     ====================================================================== */
  ekranRota(y, 'GLB-04', {
    get: (ctx) => {
      const e = ekranNesnesi('GLB-04');
      yetkiZorunlu(ctx, e.yetki);
      const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
      const { toplam, satirlar } = onayMotoru.onayKutum(ctx, { atla, boyut });
      const vekaletler = vekaletServisi.vekilOlduklari(ctx.tenant.id, ctx.kullanici.id);

      const icerik = h`
${vekaletler.length ? B.sonucSeridi({ tur: 'warn', baslik: 'Vekaleten karar veriyorsunuz',
        aciklama: vekaletler.map((v) => `${v.veren_ad} adına ${tarih(v.baslangic)} – ${tarih(v.bitis)}`).join(' · ') }) : ''}
${B.listeDuzeni({
        kpi: B.kpiSeridi([
          { etiket: 'Kararınızı bekleyen', deger: sayi(toplam), ikon: 'fa-circle-check' },
          { etiket: 'Süresi aşan', deger: sayi(satirlar.filter((r) => r.adim_sla && r.adim_sla < simdi()).length),
            ikon: 'fa-hourglass-end', ton: 'warn' },
          { etiket: 'Vekaleten', deger: sayi(vekaletler.length), ikon: 'fa-user-shield' },
        ]),
        icerik: B.tablo({
          satirlar,
          satirRota: (r) => `/onaylar/${r.id}`,
          bosDurum: { baslik: 'Onayınızı bekleyen kayıt yok',
            aciklama: 'Bir talep, sözleşme veya hakediş onayınıza düştüğünde burada görünür.', ikon: 'fa-circle-check' },
          sutunlar: [
            { ad: 'baslik', etiket: 'Konu', govde: (r) => h`<a href="/onaylar/${r.id}"><b>${r.baslik}</b></a>
              <br><span class="muted">${r.nesne_kod || r.nesne} · sürüm ${r.belge_surum}</span>` },
            { ad: 'adim_ad', etiket: 'Adım', govde: (r) => h`${r.adim_ad}<br><span class="muted">${r.adim_sira}. sıra</span>` },
            { ad: 'talep_eden', etiket: 'Talep eden', govde: (r) => ad(r.talep_eden) },
            { ad: 'tutar_minor', etiket: 'Tutar', hizala: 'sag',
              govde: (r) => (r.tutar_minor == null ? '—' : Para.minor(r.tutar_minor, r.tutar_birim || 'TRY').bicim()) },
            { ad: 'adim_sla', etiket: 'Süre', govde: (r) => !r.adim_sla ? '—'
              : r.adim_sla < simdi() ? B.isaret('süresi aştı', 'danger') : tarihSaat(r.adim_sla) },
          ],
        }),
        sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
        veriZamani: simdi(),
      })}`;
      return html(ctx, 200, ciz(ctx, e, icerik, {
        aciklama: 'Karar verebileceğiniz açık onaylar — kendi talepleriniz bu listede yer almaz.',
      }));
    },
  });

  /* ======================================================================
     GLB-05 — Onay detayı (karar ekranı)
     ====================================================================== */
  ekranRota(y, 'GLB-05', {
    get: (ctx, _g, params) => onayDetayiCiz(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('GLB-05');
      /* Ekran yetkisi yalnız GÖRÜNTÜLEMEYİ açar. Karar verme yetkisi onay ADIMINDAN
         çözülür (rol veya süreli vekalet) — vekil, verenin rolüne sahip olmadığı için
         ekran yetkisine bakmak vekaleti işlevsiz bırakırdı (§5.3). */
      yetkiZorunlu(ctx, e.yetki);
      csrfZorunlu(ctx, govde);
      try {
        const sonuc = onayMotoru.kararVer(ctx, {
          talepId: params.id, karar: govde.karar, gerekce: govde.gerekce, belgeSurum: govde.belgeSurum,
        });
        /* Onay motoru kapanışta iş nesnesinin durumunu da ilerletir. */
        if (sonuc.talepDurumu === 'kapali') isNesnesiniIlerlet(ctx, params.id, sonuc.sonuc);
        return yonlendir(ctx, `/onaylar/${params.id}?karar=${encodeURIComponent(govde.karar)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return onayDetayiCiz(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ======================================================================
     GLB-09 — Duyurular  (onay motorunun uçtan uca ilk uygulaması)
     Duyuru yayına ALINMADAN ÖNCE onaydan geçer: kullanıcı "yayında" durumunu
     seçemez, yalnız "onaya gönder" der (değişmez kural 5).
     ====================================================================== */
  ekranRota(y, 'GLB-09', {
    get: (ctx) => {
      const e = ekranNesnesi('GLB-09');
      yetkiZorunlu(ctx, e.yetki);
      const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
      const durum = ctx.sorgu.get('durum') || '';
      const kosullar = ['tenant_id = ?']; const p = [ctx.tenant.id];
      if (durum) { kosullar.push('durum = ?'); p.push(durum); }
      const nerede = kosullar.join(' AND ');
      const toplam = Number(tek(`SELECT COUNT(*) AS n FROM duyuru WHERE ${nerede}`, ...p)?.n ?? 0);
      const satirlar = sorgu(`SELECT * FROM duyuru WHERE ${nerede} ORDER BY olusturuldu DESC LIMIT ? OFFSET ?`,
        ...p, boyut, atla);
      const yeniYetkisi = yetkiVar(ctx, 'GLB-09:olustur');

      const icerik = h`
${ctx.sorgu.get('gonderildi') ? B.sonucSeridi({ tur: 'ok', baslik: 'Duyuru onaya gönderildi',
        aciklama: 'Onay akışı iş akışı şablonundan çözüldü; onaycıyı siz seçmediniz. Karar verilince yayına alınır.' }) : ''}
${B.listeDuzeni({
        filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: 'Duyuru ara…',
          filtreler: [{ ad: 'durum', etiket: 'Durum', secenekler: [
            { deger: 'taslak', etiket: 'Taslak' }, { deger: 'yayinda', etiket: 'Yayında' },
            { deger: 'arsiv', etiket: 'Arşiv' }] }] }),
        icerik: B.tablo({
          satirlar,
          bosDurum: { baslik: 'Duyuru yok', aciklama: 'Hedef kitleye yayınlanan duyurular burada listelenir.', ikon: 'fa-bullhorn',
            eylem: yeniYetkisi ? duyuruFormuAcButonu() : null },
          sutunlar: [
            { ad: 'baslik', etiket: 'Duyuru', govde: (r) => h`<b>${r.baslik}</b><br><span class="muted">${(r.govde || '').slice(0, 90)}</span>` },
            { ad: 'hedef_rol', etiket: 'Hedef', govde: (r) => r.hedef_rol || 'Tüm kullanıcılar' },
            { ad: 'yayin_bas', etiket: 'Yayın', govde: (r) => tarih(r.yayin_bas) },
            { ad: 'durum', etiket: 'Durum', govde: (r) => h`${B.rozet(r.durum)}${onayRozeti(r)}` },
            { ad: 'islem', etiket: 'İşlem', hizala: 'sag', govde: (r) => duyuruEylemleri(ctx, r) },
          ],
        }),
        sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
        veriZamani: simdi(),
      })}
${yeniYetkisi ? duyuruFormu(ctx) : ''}`;
      return html(ctx, 200, ciz(ctx, e, icerik));
    },
    post: (ctx, govde) => {
      const e = ekranNesnesi('GLB-09');
      csrfZorunlu(ctx, govde);
      try {
        if (govde._eylem === 'onaya_gonder') return duyuruOnayaGonder(ctx, govde);
        yetkiZorunlu(ctx, `${e.kod}:olustur`);
        const baslik = String(govde.baslik || '').trim();
        const metin = String(govde.govde || '').trim();
        if (!baslik) throw DogrulamaHatasi('Başlık zorunludur.', { alanlar: { baslik: ['Başlık girin.'] } });
        if (!metin) throw DogrulamaHatasi('Duyuru metni zorunludur.', { alanlar: { govde: ['Metin girin.'] } });

        const sonuc = idempotent({ anahtar: govde._idempotency, tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, govde },
          () => islem(() => {
            const id = kimlik('bildirim').replace('ntf', 'dyr');
            const yayinBas = govde.yayinBas ? gunBaslangici(govde.yayinBas) : simdi();
            calistir(`INSERT INTO duyuru (id, tenant_id, baslik, govde, hedef_rol, yayin_bas, teyit_ister, durum, olusturan, olusturuldu)
                      VALUES (?,?,?,?,?,?,?, 'taslak', ?,?)`,
              id, ctx.tenant.id, baslik, metin, govde.hedefRol || null, yayinBas,
              govde.teyitIster === '1' ? 1 : 0, ctx.kullanici.id, simdi());
            audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
              nesne: 'duyuru', nesneId: id, eylem: 'olustur', sonraki: { baslik, durum: 'taslak' } });
            return { id };
          }));
        return yonlendir(ctx, `/duyurular?olusan=${encodeURIComponent(sonuc.id)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, ciz(ctx, e,
          h`${B.hataOzeti(hataNesnesi(err))}${duyuruFormu(ctx, govde)}`));
      }
    },
  });

  /* ======================================================================
     SET-06 — İş akışı şablonları
     ====================================================================== */
  ekranRota(y, 'SET-06', {
    get: (ctx) => {
      const e = ekranNesnesi('SET-06');
      yetkiZorunlu(ctx, e.yetki);
      const sablonlar = sorgu(
        `SELECT s.*, (SELECT COUNT(*) FROM is_akisi_adimi a WHERE a.sablon_id = s.id) AS adim_sayisi
           FROM is_akisi_sablonu s WHERE s.tenant_id = ? ORDER BY s.nesne, s.tutar_alt_minor, s.kod`, ctx.tenant.id);
      const secili = ctx.sorgu.get('sablon');
      const adimlar = secili
        ? sorgu(`SELECT a.* FROM is_akisi_adimi a JOIN is_akisi_sablonu s ON s.id = a.sablon_id
                  WHERE s.tenant_id = ? AND s.kod = ? ORDER BY a.sira`, ctx.tenant.id, secili) : [];

      const icerik = h`
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>İş akışı şablonları</b>
    <span>Şablon; nesne türü, şirket, proje, tutar aralığı, maliyet kodu ve risk sınıfına göre seçilir.
      Onaycı adı formdan değil, buradaki <b>rol</b> tanımından çözülür.</span></div></div>
  <div class="gc-body flush">${B.tablo({
        satirlar: sablonlar,
        bosDurum: { baslik: 'Tanımlı şablon yok', ikon: 'fa-diagram-next' },
        sutunlar: [
          { ad: 'kod', etiket: 'Şablon', govde: (r) => h`<a href="/ayarlar/is-akislari?sablon=${r.kod}"><b>${r.ad}</b></a>
            <br><span class="muted">${r.kod} · sürüm ${r.surum}</span>` },
          { ad: 'nesne', etiket: 'Nesne' },
          { ad: 'tutar', etiket: 'Tutar aralığı', hizala: 'sag', govde: (r) => tutarAraligi(r) },
          { ad: 'sla_saat', etiket: 'SLA', hizala: 'sag', govde: (r) => (r.sla_saat ? `${r.sla_saat} saat` : '—') },
          { ad: 'adim_sayisi', etiket: 'Adım', hizala: 'sag', govde: (r) => sayi(r.adim_sayisi) },
          { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum === 'yayinda' ? 'aktif' : r.durum,
            r.durum === 'yayinda' ? 'Yayında' : r.durum) },
        ],
      })}</div>
</div>
${secili && adimlar.length ? h`<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>${secili} — adımlar</b>
    <span>Aynı sırayı paylaşan adımlar paraleldir; "gereken onay" o sırada kaç onay arandığını söyler.</span></div></div>
  <div class="gc-body flush">${B.tablo({
        satirlar: adimlar,
        sutunlar: [
          { ad: 'sira', etiket: 'Sıra', hizala: 'sag' },
          { ad: 'ad', etiket: 'Adım', govde: (r) => h`<b>${r.ad}</b>` },
          { ad: 'rol_kodu', etiket: 'Onaycı rolü' },
          { ad: 'paralel', etiket: 'Tür', govde: (r) => (r.paralel ? B.isaret('paralel', 'info') : 'sıralı') },
          { ad: 'gereken_onay', etiket: 'Gereken onay', hizala: 'sag' },
          { ad: 'sla_saat', etiket: 'SLA', hizala: 'sag', govde: (r) => (r.sla_saat ? `${r.sla_saat} saat` : '—') },
        ],
      })}</div>
</div>` : ''}`;
      return html(ctx, 200, ciz(ctx, e, icerik));
    },
  });

  /* ======================================================================
     SET-07 — Onay vekaletleri
     ====================================================================== */
  ekranRota(y, 'SET-07', {
    get: (ctx) => html(ctx, 200, vekaletSayfasi(ctx)),
    post: (ctx, govde) => {
      const e = ekranNesnesi('SET-07');
      csrfZorunlu(ctx, govde);
      try {
        if (govde._eylem === 'iptal') {
          yetkiZorunlu(ctx, `${e.kod}:guncelle`);
          vekaletServisi.iptal(ctx, govde.id, govde.gerekce);
          return yonlendir(ctx, '/ayarlar/vekaletler?iptal=1');
        }
        yetkiZorunlu(ctx, `${e.kod}:olustur`);
        vekaletServisi.olustur(ctx, {
          verenId: govde.verenId, alanId: govde.alanId,
          baslangic: gunBaslangici(govde.baslangic), bitis: gunBaslangici(govde.bitis) + GUN_MS - 1,
          gerekce: govde.gerekce,
        });
        return yonlendir(ctx, '/ayarlar/vekaletler?olustu=1');
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return html(ctx, err.durum, vekaletSayfasi(ctx, { hata: hataNesnesi(err), deger: govde }));
      }
    },
  });

  /* ======================================================================
     SET-10 — Durum ve sözlük yönetimi   ·   SET-11 — Maliyet kodları
     ====================================================================== */
  ekranRota(y, 'SET-10', {
    get: (ctx) => {
      const e = ekranNesnesi('SET-10');
      yetkiZorunlu(ctx, e.yetki);
      const kumeler = sorgu('SELECT DISTINCT kume FROM sozluk WHERE tenant_id = ? ORDER BY kume', ctx.tenant.id);
      const secili = ctx.sorgu.get('kume') || kumeler[0]?.kume;
      const degerler = secili
        ? sorgu('SELECT * FROM sozluk WHERE tenant_id = ? AND kume = ? ORDER BY sira, kod', ctx.tenant.id, secili) : [];
      /* Durum tanımları tek kaynaktan (durumlar.mjs) okunur; ekran kendi listesini TUTMAZ. */
      const durumTanimlari = Object.entries(NESNELER);

      const icerik = h`
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Çekirdek durumlar — KİLİTLİ</b>
    <span>Yaşam durumları iş akışı motorunun sözleşmesidir; sözlükten değiştirilemez (doküman §5.2).</span></div></div>
  <div class="gc-body flush">${B.tablo({
        satirlar: durumTanimlari.map(([anahtar, t]) => ({ anahtar, ...t })),
        sutunlar: [
          { ad: 'etiket', etiket: 'Nesne', govde: (r) => h`<b>${r.etiket}</b>` },
          { ad: 'durumlar', etiket: 'Durum zinciri', govde: (r) => r.durumlar.map((d) => r.etiketler[d]).join(' › ') },
          { ad: 'isaretler', etiket: 'Hesaplanan işaretler', govde: (r) => r.isaretler.join(', ') },
        ],
      })}</div>
</div>
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Kontrollü ana veriler</b>
    <span>Çekirdek değerler kilitlidir; tenant kendi değerlerini ekleyebilir.</span></div></div>
  <div class="gc-body flush">
    <nav class="gv-tabs">${kumeler.map((k) => h`<a class="gv-tab${ham(k.kume === secili ? ' is-active' : '')}"
      href="/ayarlar/sozlukler?kume=${k.kume}">${k.kume}</a>`)}</nav>
    ${B.tablo({
        satirlar: degerler,
        bosDurum: { baslik: 'Bu kümede değer yok', ikon: 'fa-book' },
        sutunlar: [
          { ad: 'kod', etiket: 'Kod' },
          { ad: 'ad', etiket: 'Ad', govde: (r) => h`<b>${r.ad}</b>` },
          { ad: 'cekirdek', etiket: 'Tür', govde: (r) => (r.cekirdek ? B.isaret('çekirdek — kilitli', 'info') : 'tenant') },
          { ad: 'aktif', etiket: 'Durum', govde: (r) => (r.aktif ? B.rozet('aktif') : B.rozet('pasif')) },
        ],
      })}
  </div>
</div>`;
      return html(ctx, 200, ciz(ctx, e, icerik));
    },
  });

  ekranRota(y, 'SET-11', {
    get: (ctx) => {
      const e = ekranNesnesi('SET-11');
      yetkiZorunlu(ctx, e.yetki);
      const kodlar = sorgu('SELECT * FROM maliyet_kodu WHERE tenant_id = ? ORDER BY kod', ctx.tenant.id);
      const icerik = h`
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Maliyet kodları ve WBS eşlemesi</b>
    <span>Bütçe, satın alma, stok ve hakediş bu kodlarla aynı dili konuşur; rapor toplamları buradan türer.</span></div></div>
  <div class="gc-body flush">${B.tablo({
        satirlar: kodlar,
        bosDurum: { baslik: 'Maliyet kodu tanımlı değil', ikon: 'fa-sitemap' },
        sutunlar: [
          { ad: 'kod', etiket: 'Kod', govde: (r) => h`<span style="padding-left:${ham(String((r.seviye - 1) * 18))}px"><b>${r.kod}</b></span>` },
          { ad: 'ad', etiket: 'Ad' },
          { ad: 'seviye', etiket: 'Seviye', hizala: 'sag' },
          { ad: 'tur', etiket: 'Tür' },
          { ad: 'aktif', etiket: 'Durum', govde: (r) => (r.aktif ? B.rozet('aktif') : B.rozet('pasif')) },
        ],
      })}</div>
</div>`;
      return html(ctx, 200, ciz(ctx, e, icerik));
    },
  });
}

/* ========================================================================== */
/* Yardımcılar                                                                */
/* ========================================================================== */
const tutarAraligi = (r) => {
  if (r.tutar_alt_minor == null && r.tutar_ust_minor == null) return 'tutarsız';
  const alt = Para.minor(r.tutar_alt_minor ?? 0, r.tutar_birim || 'TRY').bicim();
  const ust = r.tutar_ust_minor == null ? '∞' : Para.minor(r.tutar_ust_minor, r.tutar_birim || 'TRY').bicim();
  return `${alt} – ${ust}`;
};

function onayRozeti(duyuru) {
  const t = tek(`SELECT durum, sonuc FROM onay_talebi WHERE nesne = 'duyuru' AND nesne_id = ?
                  ORDER BY olusturuldu DESC LIMIT 1`, duyuru.id);
  if (!t) return '';
  if (t.durum === 'acik') return B.isaret('onayda', 'warn');
  if (t.sonuc === 'reddedildi') return B.isaret('reddedildi', 'danger');
  if (t.sonuc === 'revizyon_istendi') return B.isaret('revizyon istendi', 'warn');
  return '';
}

function duyuruEylemleri(ctx, r) {
  if (r.durum !== 'taslak') return h`—`;
  const acikOnay = tek(`SELECT id FROM onay_talebi WHERE nesne = 'duyuru' AND nesne_id = ? AND durum = 'acik'`, r.id);
  if (acikOnay) return h`<a class="btn btn-ghost btn-sm" href="/onaylar/${acikOnay.id}">Onayı gör</a>`;
  if (!yetkiVar(ctx, 'GLB-09:guncelle')) return h`—`;
  /* Kullanıcı "yayında" durumunu SEÇEMEZ; yalnız onaya gönderebilir. */
  return h`<form method="post" action="/duyurular" style="display:inline">${ham(csrfAlani(ctx))}
    <input type="hidden" name="_eylem" value="onaya_gonder">
    <input type="hidden" name="id" value="${r.id}">
    <input type="hidden" name="surum" value="${r.surum}">
    <button class="btn btn-acc btn-sm" type="submit">Onaya gönder</button>
  </form>`;
}

function duyuruOnayaGonder(ctx, govde) {
  yetkiZorunlu(ctx, 'GLB-09:guncelle');
  const d = tek('SELECT * FROM duyuru WHERE id = ? AND tenant_id = ?', govde.id, ctx.tenant.id);
  if (!d) throw Bulunamadi('Duyuru bulunamadı.');
  if (d.durum !== 'taslak') throw DogrulamaHatasi('Yalnız taslak duyuru onaya gönderilebilir.');

  islem(() => {
    onayMotoru.onayaGonder(ctx, {
      nesne: 'duyuru', nesneId: d.id, nesneKod: d.baslik.slice(0, 40),
      baslik: `Duyuru yayın onayı: ${d.baslik}`, belgeSurum: d.surum,
    });
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'duyuru', nesneId: d.id, eylem: 'onaya_gonder', sonraki: { belgeSurum: d.surum } });
  });
  return yonlendir(ctx, '/duyurular?gonderildi=1');
}

/** Onay kapandığında iş nesnesinin durumunu motor ilerletir (kullanıcı değil). */
function isNesnesiniIlerlet(ctx, talepId, sonuc) {
  const t = onayMotoru.talepDetayi(ctx.tenant.id, talepId);
  if (!t) return;
  if (t.nesne === 'is_programi') { bazCizgiSonucu(ctx, t.nesne_id, sonuc); return; }
  if (t.nesne === 'duyuru' && sonuc === 'onaylandi') {
    const d = tek('SELECT * FROM duyuru WHERE id = ?', t.nesne_id);
    if (!d || d.durum !== 'taslak') return;
    islem(() => {
      surumluGuncelle('duyuru', d.id, d.surum, { durum: 'yayinda' },
        { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'duyuru', nesneId: d.id, eylem: 'gecis:yayinla',
        gerekce: `Onay talebi ${talepId} onaylandı`,
        onceki: { durum: 'taslak' }, sonraki: { durum: 'yayinda' } });
      bildir(ctx, { kullaniciId: d.olusturan, tur: 'duyuru_yayinda',
        baslik: 'Duyurunuz yayına alındı', govde: d.baslik, nesne: 'duyuru', nesneId: d.id, rota: '/duyurular' });
    });
  }
}

/* --- GLB-05 sayfası ------------------------------------------------------ */
function onayDetayiCiz(ctx, talepId, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('GLB-05');
  yetkiZorunlu(ctx, e.yetki);
  const t = onayMotoru.talepDetayi(ctx.tenant.id, talepId);
  if (!t) throw Bulunamadi('Onay talebi bulunamadı.');
  kapsamZorunlu(ctx, 'onay_talebi', t);

  const adimlar = onayMotoru.talepAdimlari(talepId);
  const kararlar = onayMotoru.talepKararlari(talepId);
  const acikAdim = adimlar.find((a) => a.durum === 'acik');
  const aday = acikAdim ? onayMotoru.kararVerebilirMi(ctx, t, acikAdim) : null;
  const kendiTalebi = t.talep_eden === ctx.kullanici.id;
  const kararSonucu = ctx.sorgu.get('karar');

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${kararSonucu ? B.sonucSeridi({ tur: kararSonucu === 'onayla' ? 'ok' : 'warn',
    baslik: kararSonucu === 'onayla' ? 'Kararınız kaydedildi: onaylandı'
      : kararSonucu === 'reddet' ? 'Kararınız kaydedildi: reddedildi' : 'Revizyon talebiniz kaydedildi',
    aciklama: 'Karar denetim izine yazıldı ve talep sahibine bildirildi.' }) : ''}
${B.detayOzetSeridi({
    kod: t.nesne_kod || t.nesne,
    baslik: t.baslik,
    durum: t.durum === 'acik' ? 'incelemede' : (t.sonuc || 'kapali'),
    surum: t.belge_surum,
    isaretler: t.sla_bitis && t.sla_bitis < simdi() && t.durum === 'acik'
      ? [{ metin: 'onay süresi aşıldı', ton: 'danger' }] : [],
    bilgiler: [
      { etiket: 'Talep eden', deger: ad(t.talep_eden) },
      { etiket: 'Tutar', deger: t.tutar_minor == null ? '—' : Para.minor(t.tutar_minor, t.tutar_birim || 'TRY').bicim() },
      { etiket: 'Karar verilen belge sürümü', deger: `sürüm ${t.belge_surum}` },
      { etiket: 'Açılış', deger: tarihSaat(t.olusturuldu) },
      { etiket: 'SLA', deger: t.sla_bitis ? tarihSaat(t.sla_bitis) : '—' },
      { etiket: 'Gerekçe', deger: t.gerekce || '—' },
    ],
  })}

<div class="dash-cols">
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>Onay zinciri</b>
      <span>Onaycılar rolden çözülür; talep sahibi kendi kaydını onaylayamaz.</span></div></div>
    <div class="gc-body flush">${B.tablo({
    satirlar: adimlar,
    sutunlar: [
      { ad: 'sira', etiket: 'Sıra', hizala: 'sag' },
      { ad: 'ad', etiket: 'Adım', govde: (r) => h`<b>${r.ad}</b><br><span class="muted">rol: ${r.rol_kodu}${
        r.paralel ? ' · paralel' : ''} · gereken onay: ${r.gereken_onay}</span>` },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(
        r.durum === 'acik' ? 'beklemede' : r.durum === 'onaylandi' ? 'onaylandi'
          : r.durum === 'reddedildi' ? 'reddedildi' : r.durum === 'bekliyor' ? 'taslak' : 'kapali',
        { bekliyor: 'Sırada', acik: 'Karar bekliyor', onaylandi: 'Onaylandı', reddedildi: 'Reddedildi',
          revizyon_istendi: 'Revizyon istendi', iptal: 'İptal', atlandi: 'Atlandı' }[r.durum]) },
      { ad: 'sla_bitis', etiket: 'SLA', govde: (r) => (r.sla_bitis ? tarihSaat(r.sla_bitis) : '—') },
    ],
  })}</div>
  </div>
  <div class="gv-side-stack">
    ${acikAdim && aday && !kendiTalebi ? kararFormu(ctx, t, acikAdim, aday)
      : h`<div class="gv-card"><div class="gc-body">
          <div class="gv-cap-sm">Karar</div>
          <p style="margin-top:10px;font-size:13px;color:var(--muted)">${
            t.durum !== 'acik' ? 'Bu talep kapanmış; yeni karar verilemez.'
            : kendiTalebi ? 'Kendi talebinizi onaylayamazsınız (görevler ayrılığı).'
            : 'Bu adımda karar verme yetkiniz yok — onaycı rolden çözülür.'}</p>
        </div></div>`}
  </div>
</div>

<div class="gv-card" style="margin-top:18px">
  <div class="gc-head"><div class="gc-title"><b>Karar geçmişi</b>
    <span>Karar kayıtları değiştirilemez; düzeltme yeni karar satırı olarak eklenir.</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: kararlar,
    bosDurum: { baslik: 'Henüz karar verilmedi', ikon: 'fa-gavel' },
    sutunlar: [
      { ad: 'zaman', etiket: 'Zaman', govde: (r) => tarihSaat(r.zaman) },
      { ad: 'ad_soyad', etiket: 'Karar veren', govde: (r) => h`<b>${r.ad_soyad}</b>${
        r.vekaleten_ad ? h`<br><span class="muted">${r.vekaleten_ad} adına vekaleten</span>` : ''}` },
      { ad: 'karar', etiket: 'Karar', govde: (r) => B.rozet(
        r.karar === 'onayla' ? 'onaylandi' : r.karar === 'reddet' ? 'reddedildi' : 'revizyon_istendi',
        { onayla: 'Onayladı', reddet: 'Reddetti', revizyon_iste: 'Revizyon istedi' }[r.karar]) },
      { ad: 'belge_surum', etiket: 'Belge sürümü', hizala: 'sag', govde: (r) => `sürüm ${r.belge_surum}` },
      { ad: 'gerekce', etiket: 'Gerekçe', govde: (r) => r.gerekce || '—' },
    ],
  })}</div>
</div>`;

  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: t.nesne_kod || t.baslik.slice(0, 40) }));
}

function kararFormu(ctx, t, adim, aday) {
  return h`<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Kararınız</b>
    <span>${adim.ad}${aday.vekaleten ? ` · ${ad(aday.vekaleten)} adına vekaleten` : ''}</span></div></div>
  <div class="gc-body">
    <form method="post" action="/onaylar/${t.id}" data-gform="1">
      ${ham(csrfAlani(ctx))}
      <input type="hidden" name="belgeSurum" value="${t.belge_surum}">
      ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe', tur: 'metin',
        ipucu: 'Ret ve revizyon talebinde gerekçe zorunludur.' })}
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
        <button class="btn btn-acc" type="submit" name="karar" value="onayla">
          <i class="fa-solid fa-circle-check"></i> Onayla</button>
        <button class="btn btn-ghost" type="submit" name="karar" value="revizyon_iste">
          <i class="fa-solid fa-rotate-left"></i> Revizyon iste</button>
        <button class="btn btn-danger" type="submit" name="karar" value="reddet">
          <i class="fa-solid fa-circle-xmark"></i> Reddet</button>
      </div>
      <p class="gf-hint" style="margin-top:12px">Karar, yukarıda gösterilen
        <b>sürüm ${t.belge_surum}</b> için verilir. Belge bu sırada revize edilirse kararınız uygulanmaz.</p>
    </form>
  </div>
</div>`;
}

/* --- GLB-09 formu -------------------------------------------------------- */
const duyuruFormuAcButonu = () => B.btn('Yeni duyuru', { tur: 'acc', rota: '#duyuru-formu', ikon: 'fa-plus' });

function duyuruFormu(ctx, deger = {}) {
  const roller = sorgu('SELECT kod, ad FROM rol WHERE tenant_id IS NULL ORDER BY ad')
    .map((r) => ({ deger: r.kod, etiket: r.ad }));
  return h`<div id="duyuru-formu" style="margin-top:18px">${B.form({
    rota: '/duyurular',
    csrf: csrfAlani(ctx),
    idempotencyAnahtari: kimlik('idempotency'),
    bolumler: [{
      baslik: 'Yeni duyuru',
      aciklama: 'Duyuru taslak olarak kaydedilir. Yayına alınması için onay akışından geçer — yayın durumunu siz seçmezsiniz.',
      alanlar: h`
        ${B.alan({ ad: 'baslik', etiket: 'Başlık', deger: deger.baslik || '', zorunlu: true, genis: true })}
        ${B.alan({ ad: 'govde', etiket: 'Duyuru metni', tur: 'metin', deger: deger.govde || '', zorunlu: true, genis: true })}
        ${B.alan({ ad: 'hedefRol', etiket: 'Hedef kitle', deger: deger.hedefRol || '',
          secenekler: [{ deger: '', etiket: 'Tüm kullanıcılar' }, ...roller] })}
        ${B.alan({ ad: 'yayinBas', etiket: 'Yayın başlangıcı', tur: 'date',
          deger: deger.yayinBas || gunAnahtari(simdi()) })}`,
    }],
    ozet: h`<div class="gv-card"><div class="gc-body">
      <div class="gv-cap-sm">Akış</div>
      <ol style="margin:12px 0 0 18px;font-size:12.5px;line-height:1.85;color:var(--muted)">
        <li>Taslak olarak kaydedilir</li>
        <li>"Onaya gönder" ile akış başlar</li>
        <li>Onaycı <b>şablondan</b> çözülür</li>
        <li>Onaylanınca <b>motor</b> yayına alır</li>
      </ol>
    </div></div>`,
    eylemler: B.btn('Taslak kaydet', { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' }),
  })}</div>`;
}

/* --- SET-07 sayfası ------------------------------------------------------ */
function vekaletSayfasi(ctx, { hata = null, deger = {} } = {}) {
  const e = ekranNesnesi('SET-07');
  yetkiZorunlu(ctx, e.yetki);
  const liste = vekaletServisi.listele(ctx.tenant.id);
  const kullanicilar = sorgu(`SELECT id, ad_soyad FROM kullanici WHERE tenant_id = ? AND durum = 'aktif' ORDER BY ad_soyad`,
    ctx.tenant.id).map((k) => ({ deger: k.id, etiket: k.ad_soyad }));
  const t = simdi();

  const icerik = h`
${ctx.sorgu.get('olustu') ? B.sonucSeridi({ tur: 'ok', baslik: 'Vekalet tanımlandı',
    aciklama: 'Vekalet süreli ve denetim kayıtlıdır; vekil kararı "… adına vekaleten" olarak işlenir.' }) : ''}
${ctx.sorgu.get('iptal') ? B.sonucSeridi({ tur: 'warn', baslik: 'Vekalet iptal edildi', aciklama: 'Gerekçe denetim izine yazıldı.' }) : ''}
${hata ? B.hataOzeti(hata) : ''}
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Onay vekaletleri</b>
    <span>Aynı kişi için tarih aralığı çakışan iki aktif vekalet tanımlanamaz.</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: liste,
    bosDurum: { baslik: 'Tanımlı vekalet yok', ikon: 'fa-user-clock' },
    sutunlar: [
      { ad: 'veren_ad', etiket: 'Yetkiyi veren', govde: (r) => h`<b>${r.veren_ad}</b>` },
      { ad: 'alan_ad', etiket: 'Vekil', govde: (r) => h`<b>${r.alan_ad}</b>` },
      { ad: 'aralik', etiket: 'Tarih aralığı', govde: (r) => `${tarih(r.baslangic)} – ${tarih(r.bitis)}` },
      { ad: 'durum', etiket: 'Durum', govde: (r) => (r.durum === 'aktif' && r.baslangic <= t && r.bitis > t
        ? B.rozet('aktif', 'Yürürlükte') : r.durum === 'aktif' ? B.rozet('taslak', 'Sırada') : B.rozet(r.durum)) },
      { ad: 'gerekce', etiket: 'Gerekçe', govde: (r) => r.gerekce || '—' },
      { ad: 'islem', etiket: 'İşlem', hizala: 'sag', govde: (r) => (r.durum !== 'aktif' ? '—' : h`
        <form method="post" action="/ayarlar/vekaletler" style="display:inline"
              data-onay="Vekalet iptal edilsin mi?">${ham(csrfAlani(ctx))}
          <input type="hidden" name="_eylem" value="iptal">
          <input type="hidden" name="id" value="${r.id}">
          <input type="hidden" name="gerekce" value="Yönetici tarafından iptal edildi">
          <button class="btn btn-ghost btn-sm" type="submit">İptal et</button>
        </form>`) },
    ],
  })}</div>
</div>
<div style="margin-top:18px">${B.form({
    rota: '/ayarlar/vekaletler',
    csrf: csrfAlani(ctx),
    bolumler: [{
      baslik: 'Yeni vekalet',
      aciklama: 'Vekil, yetkiyi verenin onay adımlarında karar verebilir; karar kaydı "adına vekaleten" olarak saklanır.',
      alanlar: h`
        ${B.alan({ ad: 'verenId', etiket: 'Yetkiyi veren', deger: deger.verenId || '', zorunlu: true, secenekler: kullanicilar })}
        ${B.alan({ ad: 'alanId', etiket: 'Vekil', deger: deger.alanId || '', zorunlu: true,
          secenekler: kullanicilar, hata: hata?.alanlar?.alanId })}
        ${B.alan({ ad: 'baslangic', etiket: 'Başlangıç', tur: 'date', deger: deger.baslangic || gunAnahtari(simdi()), zorunlu: true })}
        ${B.alan({ ad: 'bitis', etiket: 'Bitiş', tur: 'date', deger: deger.bitis || '', zorunlu: true, hata: hata?.alanlar?.bitis })}
        ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe', deger: deger.gerekce || '', genis: true })}`,
    }],
    eylemler: B.btn('Vekaleti tanımla', { tur: 'acc', gonder: true, ikon: 'fa-user-shield' }),
  })}</div>`;
  return ciz(ctx, e, icerik);
}
