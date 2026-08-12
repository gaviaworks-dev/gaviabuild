/* ============================================================================
   KAYIT MODÜLÜ ÜRETECİ — liste + form + detay üçlüsünü TEK sözleşmeden kurar
   ----------------------------------------------------------------------------
   Neden üreteç: doküman §3 "her liste ekranı AYNI sırayı kullanır", "her form
   AYNI kalıptadır" diyor. Aynı kalıbı 100+ ekranda elle tekrarlamak sapma
   üretir; burada kalıp TEK yerde tanımlıdır ve her modül yalnız ALAN TANIMI verir.

   Üretilen her ekran otomatik olarak taşır:
     · sunucu tarafı sayfalama + URL'de kalıcı filtre (§3.1, UI-01)
     · ana alan + sağ özet + ortak alt çubuk + alan bazlı hata özeti (§3.2, UI-02)
     · idempotency anahtarı, CSRF, sürümlü güncelleme (kural 8)
     · durum/onaycı alanı ASLA (kural 5) — durum yalnız geçiş motorundan
     · her yazmada denetim kaydı (AUD-01)
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, tarihSaat, gunAnahtari, gunBaslangici } from '../cekirdek/zaman.mjs';
import { Para, BIRIMLER } from '../cekirdek/para.mjs';
import { varsayilanSinir } from '../cekirdek/metin.mjs';
import { UygulamaHatasi, DogrulamaHatasi } from '../cekirdek/hata.mjs';
import { idempotent } from '../cekirdek/idempotency.mjs';
import {
  ekranNesnesi, hataNesnesi, kullaniciAdi, ciz, listeSorgusu, filtreKosullari,
  kayitOlustur, kaydiAl, gecisFormu, gecisIsle, ozetSeridi,
  B, h, ham, sayi, csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar,
  sorgu, tek, calistir, islem, surumluGuncelle, audit,
} from './ortak.mjs';

/* --- Alan dönüştürücüler -------------------------------------------------- */
const AYRISTIR = {
  metin: (d) => (String(d ?? '').trim() || null),
  uzunMetin: (d) => (String(d ?? '').trim() || null),
  sayi: (d) => (d === '' || d == null ? null : Number(d)),
  tarih: (d) => (d ? gunBaslangici(d) : null),
  secim: (d) => (String(d ?? '').trim() || null),
  onay: (d) => (d === '1' || d === 'on' ? 1 : 0),
  kullanici: (d) => (String(d ?? '').trim() || null),
  para: null,   // özel: iki sütun
};

const GOSTER = {
  metin: (v) => v || '—',
  uzunMetin: (v) => v || '—',
  sayi: (v) => (v == null ? '—' : sayi(v)),
  tarih: (v) => (v ? tarih(v) : '—'),
  secim: (v) => v || '—',
  onay: (v) => (v ? 'Evet' : 'Hayır'),
  kullanici: (v) => kullaniciAdi(v),
};

const FORM_TURU = { metin: 'text', uzunMetin: 'metin', sayi: 'number', tarih: 'date', secim: 'text', onay: 'text', kullanici: 'text' };

export const kullaniciSecenekleri = (ctx) => sorgu(
  `SELECT id, ad_soyad FROM kullanici WHERE tenant_id = ? AND durum = 'aktif' ORDER BY ad_soyad`, ctx.tenant.id)
  .map((k) => ({ deger: k.id, etiket: k.ad_soyad }));
export const santiyeSecenekleri = (ctx) => sorgu(
  `SELECT id, kod, ad FROM santiye WHERE tenant_id = ? AND durum NOT IN ('kapali','arsiv') ORDER BY ad`, ctx.tenant.id)
  .map((s) => ({ deger: s.id, etiket: `${s.kod} — ${s.ad}` }));
export const projeSecenekleri = (ctx) => sorgu(
  `SELECT id, kod, ad FROM proje WHERE tenant_id = ? AND durum NOT IN ('kapali','arsiv') ORDER BY ad`, ctx.tenant.id)
  .map((p) => ({ deger: p.id, etiket: `${p.kod} — ${p.ad}` }));
export const sozlukSecenekleri = (ctx, kume) => sorgu(
  'SELECT kod, ad FROM sozluk WHERE tenant_id = ? AND kume = ? AND aktif = 1 ORDER BY sira', ctx.tenant.id, kume)
  .map((s) => ({ deger: s.kod, etiket: s.ad }));

/* --- Girdi doğrulama ----------------------------------------------------- */
function girdiCoz(ctx, tanim, govde, mevcut = null) {
  const alanlar = {};
  const hatalar = {};
  for (const a of tanim.alanlar) {
    if (a.saltOkunur) continue;
    /* Alan bu kullanıcıya kapalıysa (maskeli/hassas) YAZILAMAZ da: gizli alanı
       elle POST etmek maskeyi delerdi (§5.7). */
    if (a.gorunur && !a.gorunur(ctx)) continue;
    const ham = govde[a.ad];
    if (a.tur === 'para') {
      if (ham) {
        try {
          const p = Para.ayristir(ham, govde[`${a.ad}Birim`] || ctx.tenant.para_birimi);
          if (p.negatifMi && !a.negatifOlabilir) hatalar[a.ad] = ['Tutar negatif olamaz.'];
          alanlar[a.sutun] = String(p.minor);
          alanlar[`${a.sutun.replace(/_minor$/, '')}_birim`] = p.birim;
        } catch (e) { hatalar[a.ad] = [e.mesaj || 'Geçersiz tutar.']; }
      } else if (a.zorunlu) hatalar[a.ad] = [`${a.etiket} zorunludur.`];
      else if (!mevcut) alanlar[a.sutun] = null;
      continue;
    }
    const deger = (AYRISTIR[a.tur] || AYRISTIR.metin)(ham);
    if (a.zorunlu && (deger == null || deger === '')) {
      hatalar[a.ad] = [`${a.etiket} zorunludur.`];
    }
    /* Uzunluk sınırı ARTIK ÖNTANIMLI (denetim-02 D-15, K-127): alan kendi
       `enFazla`sını bildirmemişse tür bazlı öntanım uygulanır. Sınırsız serbest
       metin, 100 bin karakterlik açıklamanın değişmez deftere girmesi demekti. */
    const sinir = a.enFazla ?? (['metin', 'uzunMetin'].includes(a.tur) ? varsayilanSinir(a.tur) : null);
    if (deger != null && sinir && String(deger).length > sinir) {
      hatalar[a.ad] = [`En fazla ${sinir.toLocaleString('tr-TR')} karakter (girilen: `
        + `${String(deger).length.toLocaleString('tr-TR')}). Metin kırpılmadı.`];
    }
    if (deger != null && a.secenekler && a.tur === 'secim') {
      const gecerli = (typeof a.secenekler === 'function' ? a.secenekler(ctx) : a.secenekler)
        .some((s) => String(s.deger) === String(deger));
      if (!gecerli) hatalar[a.ad] = ['Geçersiz seçim.'];
    }
    if (deger != null && a.dogrula) {
      const mesaj = a.dogrula(deger, govde, ctx);
      if (mesaj) hatalar[a.ad] = [mesaj];
    }
    alanlar[a.sutun] = deger;
  }
  if (tanim.capraDogrula) {
    const ek = tanim.capraDogrula(alanlar, govde, ctx) || {};
    Object.assign(hatalar, ek);
  }
  if (Object.keys(hatalar).length) {
    throw DogrulamaHatasi(`${tanim.baslik} bilgilerinde eksik veya hatalı alanlar var.`, { alanlar: hatalar });
  }
  return alanlar;
}

/* --- Form çizimi ---------------------------------------------------------- */
function formCiz(ctx, tanim, { kayit = null, deger = {}, hata = null }) {
  const duzenleme = !!kayit;
  const bolumler = [];
  const gruplar = new Map();
  for (const a of tanim.alanlar) {
    if (a.formDisi) continue;
    if (a.gorunur && !a.gorunur(ctx)) continue;
    const grup = a.grup || tanim.baslik;
    if (!gruplar.has(grup)) gruplar.set(grup, []);
    gruplar.get(grup).push(a);
  }
  for (const [grup, alanlar] of gruplar) {
    bolumler.push({
      baslik: grup,
      aciklama: tanim.grupAciklamalari?.[grup] || null,
      alanlar: h`${alanlar.map((a) => {
        if (a.tur === 'para') {
          return h`${B.alan({ ad: a.ad, etiket: a.etiket, zorunlu: a.zorunlu, hata: hata?.alanlar?.[a.ad],
            deger: deger[a.ad] ?? (kayit?.[a.sutun] ? Para.minor(kayit[a.sutun],
              kayit[a.sutun.replace(/_minor$/, '') + '_birim'] || 'TRY').bicim({ simge: false }) : ''),
            ipucu: a.ipucu || 'Örn. 1.250.000,00', genis: a.genis })}
          ${B.alan({ ad: `${a.ad}Birim`, etiket: 'Para birimi',
            deger: deger[`${a.ad}Birim`] ?? kayit?.[a.sutun.replace(/_minor$/, '') + '_birim'] ?? ctx.tenant.para_birimi,
            secenekler: Object.keys(BIRIMLER).map((k) => ({ deger: k, etiket: k })) })}`;
        }
        const secenekler = typeof a.secenekler === 'function' ? a.secenekler(ctx) : a.secenekler;
        const mevcutDeger = deger[a.ad] ?? (kayit
          ? (a.tur === 'tarih' ? (kayit[a.sutun] ? gunAnahtari(kayit[a.sutun]) : '') : kayit[a.sutun] ?? '')
          : (a.varsayilan ?? ''));
        return B.alan({
          ad: a.ad, etiket: a.etiket, tur: FORM_TURU[a.tur] || 'text',
          deger: mevcutDeger, zorunlu: a.zorunlu, hata: hata?.alanlar?.[a.ad],
          ipucu: a.ipucu, genis: a.genis, salt: a.saltOkunur,
          secenekler: secenekler ? [...(a.zorunlu ? [] : [{ deger: '', etiket: 'Seçin…' }]), ...secenekler] : null,
        });
      })}${grup === [...gruplar.keys()][gruplar.size - 1] && duzenleme
        ? ham(`<input type="hidden" name="surum" value="${kayit.surum}">`) : ''}`,
    });
  }

  return B.form({
    rota: duzenleme ? `${tanim.rota}/${kayit.id}/duzenle` : tanim.formRotasi,
    csrf: csrfAlani(ctx),
    idempotencyAnahtari: duzenleme ? null : kimlik('idempotency'),
    hatalar: hata,
    bolumler,
    ozet: tanim.formOzeti
      ? tanim.formOzeti(ctx, { kayit, duzenleme })
      : h`<div class="gv-card"><div class="gc-body">
          <div class="gv-cap-sm">${duzenleme ? 'Kayıt künyesi' : 'Kayıt açılışı'}</div>
          ${duzenleme ? h`<dl class="gd-grid" style="margin-top:12px;padding-top:0;border-top:0">
            <div><dt>Kod</dt><dd>${kayit.kod || '—'}</dd></div>
            <div><dt>Durum</dt><dd>${B.rozet(kayit.durum)}</dd></div>
            <div><dt>Sürüm</dt><dd>${kayit.surum}</dd></div></dl>
          <p class="gf-hint" style="margin-top:12px">Kayıt sürümü formla gönderilir; siz düzenlerken
            başkası kaydettiyse gönderim 409 ile reddedilir.</p>`
            : h`<p style="margin-top:10px;font-size:12.5px;line-height:1.7;color:var(--muted)">
              Kayıt <b>${tanim.baslangicEtiketi || 'taslak'}</b> durumunda açılır. Durumu bu formda
              seçmezsiniz; geçişleri iş akışı motoru yapar.</p>`}
        </div></div>`,
    eylemler: h`${B.btn('Vazgeç', { rota: duzenleme ? `${tanim.rota}/${kayit.id}` : tanim.rota })}
      ${B.btn(duzenleme ? 'Değişiklikleri kaydet' : 'Kaydet ve detaya git',
        { tur: 'acc', gonder: true, ikon: 'fa-floppy-disk' })}`,
  });
}

/* --- Modül kurulumu ------------------------------------------------------- */
/**
 * @param {object} t modül tanımı
 *   nesne, tablo, kodNesnesi, rota, formRotasi, baslik, listeKodu, formKodu,
 *   detayKodu, duzenleKodu?, gecisNesnesi, alanlar[], listeSutunlari[],
 *   filtreler[], aramaAlanlari[], kpi(ctx), detayBilgileri(kayit, ctx),
 *   detayEkleri(ctx, kayit)?, bosDurum{}, sirala?, olusturSonrasi(ctx, kayit)?
 */
export function kayitModulu(y, ekranRota, t) {
  const gecisNesnesi = t.gecisNesnesi || t.nesne;

  /* ---- Liste ------------------------------------------------------------ */
  ekranRota(y, t.listeKodu, {
    get: (ctx) => {
      const e = ekranNesnesi(t.listeKodu);
      yetkiZorunlu(ctx, e.yetki);
      const { kosullar, parametreler } = filtreKosullari(ctx, {
        aramaAlanlari: t.aramaAlanlari || ['kod'],
        filtreler: t.filtreler || [],
      });
      if (t.ekKosul) {
        const ek = t.ekKosul(ctx);
        if (ek) { kosullar.push(ek.kosul); parametreler.push(...ek.parametreler); }
      }
      const { sayfa, boyut, toplam, satirlar } = listeSorgusu(ctx,
        { tablo: t.tablo, kosullar, parametreler, sirala: t.sirala || 'olusturuldu DESC',
          kapsamSecenekleri: t.kapsamSecenekleri || null });

      const icerik = h`
${ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: `${t.baslik} oluşturuldu`,
        kayitRota: `${t.rota}/${ctx.sorgu.get('olusan')}` }) : ''}
${B.listeDuzeni({
        kpi: t.kpi ? B.kpiSeridi(t.kpi(ctx, toplam)) : null,
        filtre: B.filtreBari({ rota: e.rota, sorgu: ctx.sorgu, aramaYer: t.aramaYer || 'Ara…',
          filtreler: (t.filtreler || []).map((f) => ({
            ...f, secenekler: typeof f.secenekler === 'function' ? f.secenekler(ctx) : f.secenekler })) }),
        icerik: B.tablo({
          satirlar,
          satirRota: (r) => `${t.rota}/${r.id}`,
          bosDurum: { ...t.bosDurum,
            eylem: t.formKodu && yetkiVar(ctx, `${t.formKodu}:olustur`)
              ? B.btn(t.yeniEtiketi || 'Yeni kayıt', { tur: 'acc', rota: t.formRotasi, ikon: 'fa-plus' }) : null },
          sutunlar: t.listeSutunlari(ctx),
        }),
        sayfalayici: B.sayfalama({ rota: e.rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
        veriZamani: simdi(),
      })}
${ctx.sorgu.get('olusturuldu') ? B.sonucSeridi({ tur: 'ok', baslik: `${t.baslik} kaydedildi` }) : ''}
${t.altForm && yetkiVar(ctx, `${t.listeKodu}:olustur`) ? t.altForm(ctx) : ''}`;
      return html(ctx, 200, ciz(ctx, e, icerik, {
        eylemler: t.formKodu && yetkiVar(ctx, `${t.formKodu}:olustur`)
          ? B.btn(t.yeniEtiketi || 'Yeni kayıt', { tur: 'acc', rota: t.formRotasi, ikon: 'fa-plus' }) : null,
      }));
    },
  });

  /* ---- Form (oluşturma) ------------------------------------------------- */
  if (t.formKodu) {
    ekranRota(y, t.formKodu, {
      get: (ctx) => {
        const e = ekranNesnesi(t.formKodu);
        yetkiZorunlu(ctx, e.yetki);
        const onDeger = {};
        for (const [k, v] of ctx.sorgu) if (k !== 'q') onDeger[k] = v;
        return html(ctx, 200, ciz(ctx, e, formCiz(ctx, t, { deger: onDeger })));
      },
      post: (ctx, govde) => {
        const e = ekranNesnesi(t.formKodu);
        yetkiZorunlu(ctx, `${e.kod}:olustur`);
        csrfZorunlu(ctx, govde);
        try {
          const alanlar = girdiCoz(ctx, t, govde);
          const sonuc = idempotent(
            { anahtar: govde._idempotency, tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, govde },
            () => islem(() => {
              const kayit = kayitOlustur(ctx, {
                tablo: t.tablo, nesne: t.nesne, kodNesnesi: t.kodNesnesi,
                alanlar: { id: kimlik(t.kimlikTuru || 'rapor'), ...(t.sabitAlanlar?.(ctx, govde) || {}), ...alanlar },
              });
              if (t.olusturSonrasi) t.olusturSonrasi(ctx, { ...alanlar, id: kayit.id, kod: kayit.kod }, govde);
              return kayit;
            }));
          return yonlendir(ctx, `${t.rota}/${sonuc.id}?olusan=1`);
        } catch (err) {
          if (!(err instanceof UygulamaHatasi)) throw err;
          return html(ctx, err.durum, ciz(ctx, e, formCiz(ctx, t, { deger: govde, hata: hataNesnesi(err) })));
        }
      },
    });
  }

  /* ---- Düzenleme -------------------------------------------------------- */
  if (t.duzenleKodu) {
    ekranRota(y, t.duzenleKodu, {
      get: (ctx, _g, params) => {
        const e = ekranNesnesi(t.duzenleKodu);
        yetkiZorunlu(ctx, e.yetki);
        const kayit = kaydiAl(ctx, t.tablo, t.nesne, params.id);
        return html(ctx, 200, ciz(ctx, e, formCiz(ctx, t, { kayit, deger: {} }), { kayitEtiketi: kayit.kod }));
      },
      post: (ctx, govde, params) => {
        const e = ekranNesnesi(t.duzenleKodu);
        yetkiZorunlu(ctx, `${e.kod}:guncelle`);
        csrfZorunlu(ctx, govde);
        const kayit = kaydiAl(ctx, t.tablo, t.nesne, params.id);
        try {
          if (t.duzenlemeKilidi) {
            const engel = t.duzenlemeKilidi(kayit);
            if (engel) throw DogrulamaHatasi(engel);
          }
          const alanlar = girdiCoz(ctx, t, govde, kayit);
          islem(() => {
            surumluGuncelle(t.tablo, kayit.id, Number(govde.surum), alanlar,
              { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
            audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
              nesne: t.nesne, nesneId: kayit.id, eylem: 'guncelle',
              onceki: Object.fromEntries(Object.keys(alanlar).map((k) => [k, kayit[k]])), sonraki: alanlar });
          });
          return yonlendir(ctx, `${t.rota}/${kayit.id}?guncellendi=1`);
        } catch (err) {
          if (!(err instanceof UygulamaHatasi)) throw err;
          return html(ctx, err.durum, ciz(ctx, e, formCiz(ctx, t, { kayit, deger: govde, hata: hataNesnesi(err) })));
        }
      },
    });
  }

  /* ---- Detay ------------------------------------------------------------ */
  if (t.detayKodu) {
    const detayCiz = (ctx, id, { hata = null, durum = 200 } = {}) => {
      const e = ekranNesnesi(t.detayKodu);
      yetkiZorunlu(ctx, e.yetki);
      const kayit = kaydiAl(ctx, t.tablo, t.nesne, id);
      const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('olusan') ? B.sonucSeridi({ tur: 'ok', baslik: `${t.baslik} oluşturuldu` }) : ''}
${ctx.sorgu.get('guncellendi') ? B.sonucSeridi({ tur: 'ok', baslik: 'Kayıt güncellendi',
        aciklama: 'Alan bazlı değişiklik denetim izine yazıldı.' }) : ''}
${ctx.sorgu.get('gecis') ? B.sonucSeridi({ tur: 'ok', baslik: 'Durum güncellendi',
        aciklama: `Yeni durum: ${kayit.durum}` }) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${ozetSeridi(ctx, {
        nesne: gecisNesnesi, kayit,
        baslik: t.baslikAlani ? kayit[t.baslikAlani] : (kayit.ad || kayit.baslik || kayit.kod),
        bilgiler: t.detayBilgileri(kayit, ctx),
        birincilEylem: t.duzenleKodu && yetkiVar(ctx, `${t.duzenleKodu}:guncelle`)
          ? B.btn('Düzenle', { tur: 'acc', rota: `${t.rota}/${kayit.id}/duzenle`, ikon: 'fa-pen' }) : null,
        digerEylemler: t.detayEylemleri ? t.detayEylemleri(ctx, kayit) : null,
      })}
<div class="dash-cols">
  <div>${t.detayEkleri ? t.detayEkleri(ctx, kayit) : gecmisKarti(t.nesne, kayit)}</div>
  <div class="gv-side-stack">
    ${t.yanPanel ? t.yanPanel(ctx, kayit) : ''}
    ${gecisFormu(ctx, { nesne: gecisNesnesi, kayit, rota: `${t.rota}/${kayit.id}`, ekranKodu: t.detayKodu })}
  </div>
</div>`;
      return html(ctx, durum, ciz(ctx, e, icerik, {
        kayitEtiketi: kayit.kod,
        baslik: t.baslikAlani ? kayit[t.baslikAlani] : (kayit.ad || kayit.baslik || kayit.kod),
      }));
    };

    ekranRota(y, t.detayKodu, {
      get: (ctx, _g, params) => detayCiz(ctx, params.id),
      post: (ctx, govde, params) => {
        const e = ekranNesnesi(t.detayKodu);
        yetkiZorunlu(ctx, `${e.kod}:guncelle`);
        const kayit = kaydiAl(ctx, t.tablo, t.nesne, params.id);
        try {
          if (govde._eylem && t.detayIslemleri?.[govde._eylem]) {
            csrfZorunlu(ctx, govde);
            const mesaj = t.detayIslemleri[govde._eylem](ctx, kayit, govde);
            return yonlendir(ctx, `${t.rota}/${params.id}?islem=${encodeURIComponent(mesaj || 'İşlem tamamlandı')}`);
          }
          if (t.gecisOnKosulu) {
            const engel = t.gecisOnKosulu(ctx, kayit, govde);
            if (engel) throw DogrulamaHatasi(engel);
          }
          gecisIsle(ctx, { nesne: gecisNesnesi, tablo: t.tablo, kayit, govde, ekranKodu: t.detayKodu,
            yanEtki: t.gecisYanEtkisi });
          return yonlendir(ctx, `${t.rota}/${params.id}?gecis=1`);
        } catch (err) {
          if (!(err instanceof UygulamaHatasi)) throw err;
          return detayCiz(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
        }
      },
    });
  }
}

/** Detay sayfasının varsayılan alt kartı: değiştirilemez denetim geçmişi. */
export function gecmisKarti(nesne, kayit) {
  const gecmis = audit.gecmis(nesne, kayit.id).slice().reverse();
  return h`<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Denetim geçmişi</b>
    <span>Kim, ne zaman, neden değiştirdi — değiştirilemez kayıt.</span></div></div>
  <div class="gc-body flush">${B.tablo({
    satirlar: gecmis,
    bosDurum: { baslik: 'Kayıt yok' },
    sutunlar: [
      { ad: 'zaman', etiket: 'Zaman', govde: (r) => tarihSaat(r.zaman) },
      { ad: 'eylem', etiket: 'Eylem' },
      { ad: 'kullanici_id', etiket: 'Kullanıcı', govde: (r) => kullaniciAdi(r.kullanici_id) },
      { ad: 'gerekce', etiket: 'Gerekçe', govde: (r) => r.gerekce || '—' },
    ],
  })}</div>
</div>`;
}

/** Basit sayaç KPI'ı üreten yardımcı. */
export const sayac = (tenantId, tablo, kosul = '', ...p) =>
  Number(tek(`SELECT COUNT(*) AS n FROM ${tablo} WHERE tenant_id = ?${kosul ? ' AND ' + kosul : ''}`,
    tenantId, ...p)?.n ?? 0);

export { GOSTER, formCiz, girdiCoz };
