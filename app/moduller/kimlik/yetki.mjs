/* ============================================================================
   YETKİ — sunucu tarafı RBAC + ABAC  (değişmez kural 2, doküman §5.7)
   ----------------------------------------------------------------------------
   "Menüyü gizlemek güvenlik değildir." Her istek burada doğrulanır:
     RBAC : kullanıcının rollerinden gelen yetki kodu var mı?
     ABAC : kaydın tenant/şirket/proje/şantiye bağlamı kullanıcının kapsamında mı?
            kayıt sahipliği, tutar tavanı ve hassas alan maskesi uygulanıyor mu?
   Rol, tenant ve kapsam ASLA query parametresinden veya çerezden okunmaz;
   oturum kaydından ve veritabanından gelir.
   ========================================================================== */
import { sorgu, tek } from '../../cekirdek/db.mjs';
import { YetkiYok, KapsamDisi, KimlikGerekli } from '../../cekirdek/hata.mjs';
import { simdi } from '../../cekirdek/zaman.mjs';

/** Kullanıcının etkin yetkileri + kapsam kuralları (oturum başına bir kez okunur). */
export function yetkiProfili(kullaniciId, tenantId) {
  const t = simdi();
  const roller = sorgu(
    `SELECT kr.rol_id, kr.kapsam_tur, kr.kapsam_id, r.kod AS rol_kod, r.ad AS rol_ad
       FROM kullanici_rol kr JOIN rol r ON r.id = kr.rol_id
      WHERE kr.kullanici_id = ? AND kr.tenant_id = ? AND r.durum = 'aktif'
        AND (kr.baslangic IS NULL OR kr.baslangic <= ?)
        AND (kr.bitis IS NULL OR kr.bitis >= ?)`,
    kullaniciId, tenantId, t, t);

  const yetkiler = new Set();
  const kapsamlar = [];      // {tur, id} — boş liste = tenant geneli
  const kurallar = [];
  let tenantGeneli = false;

  for (const r of roller) {
    for (const y of sorgu('SELECT yetki FROM rol_yetki WHERE rol_id = ?', r.rol_id)) yetkiler.add(y.yetki);
    if (r.kapsam_tur) kapsamlar.push({ tur: r.kapsam_tur, id: r.kapsam_id });
    else tenantGeneli = true;
    for (const k of sorgu('SELECT nesne, kural, deger FROM veri_kapsami WHERE rol_id = ?', r.rol_id)) {
      kurallar.push({ ...k, deger: k.deger ? JSON.parse(k.deger) : {} });
    }
  }
  return {
    roller: roller.map((r) => ({ kod: r.rol_kod, ad: r.rol_ad, kapsamTur: r.kapsam_tur, kapsamId: r.kapsam_id })),
    yetkiler, kapsamlar, kurallar, tenantGeneli,
  };
}

/* --- RBAC ---------------------------------------------------------------- */
export function yetkiVar(ctx, yetki) {
  return !!ctx.yetkiler?.yetkiler?.has(yetki);
}

export function yetkiZorunlu(ctx, yetki) {
  if (!ctx.kullanici) throw KimlikGerekli();
  if (!yetkiVar(ctx, yetki)) throw YetkiYok(`"${yetki}" yetkiniz yok.`);
}

/** Ekran kodu bazlı kontrol — manifestten gelen `yetki` alanı kullanılır. */
export function ekranZorunlu(ctx, ekran) {
  if (ekran.acik) return;
  yetkiZorunlu(ctx, ekran.yetki);
}

/* --- ABAC ---------------------------------------------------------------- */
/**
 * Nesneye özgü kapsam çözümü. Bazı kayıtların proje/şantiye bağlamı kendi
 * sütununda DEĞİLDİR (personel şantiyeye atama tablosu üzerinden bağlanır).
 * Çözücü kaydı olmayan nesnelerde varsayılan sütun okuması kullanılır.
 * @type {Map<string, (kayit:object) => {santiyeler?:string[], projeler?:string[], sirketler?:string[]}>}
 */
export const KAPSAM_COZUCULERI = new Map();
export const kapsamCozucu = (nesne, fn) => KAPSAM_COZUCULERI.set(nesne, fn);

function kapsamBaglami(nesne, kayit) {
  const cozucu = KAPSAM_COZUCULERI.get(nesne);
  if (cozucu) {
    const b = cozucu(kayit) || {};
    return { santiyeler: b.santiyeler || [], projeler: b.projeler || [], sirketler: b.sirketler || [] };
  }
  return {
    santiyeler: kayit.santiye_id ? [kayit.santiye_id] : [],
    projeler: kayit.proje_id ? [kayit.proje_id] : [],
    sirketler: kayit.sirket_id ? [kayit.sirket_id] : [],
  };
}

/**
 * Kaydın kullanıcının veri kapsamında olup olmadığını doğrular.
 * @param {object} ctx
 * @param {string} nesne  'proje' | 'santiye' | 'hakedis' …
 * @param {object} kayit  en az { tenant_id } ; varsa proje_id / santiye_id / olusturan
 */
export function kapsamZorunlu(ctx, nesne, kayit) {
  if (!ctx.kullanici) throw KimlikGerekli();
  if (!kayit) throw KapsamDisi();

  /* 1) Tenant izolasyonu — her şeyden önce (SEC-01 kabul testi). */
  if (kayit.tenant_id && kayit.tenant_id !== ctx.tenant.id) throw KapsamDisi();

  const p = ctx.yetkiler;

  /* 2) Kayıt sahipliği — 'kendi_kaydi' kuralı olan rollerde. */
  const sahiplikKurali = p.kurallar.find((k) => k.kural === 'kendi_kaydi' && (k.nesne === '*' || k.nesne === nesne));
  if (sahiplikKurali) {
    const sahip = kayit.kullanici_id ?? kayit.personel_kullanici_id ?? kayit.olusturan;
    if (sahip && sahip !== ctx.kullanici.id) throw KapsamDisi('Yalnız kendi kayıtlarınızı görebilirsiniz.');
  }

  /* 3) Proje/şantiye kapsamı — rol ataması kapsamlıysa kayıt o kapsamda olmalı. */
  if (!p.tenantGeneli && p.kapsamlar.length) {
    const b = kapsamBaglami(nesne, kayit);
    const uyum = p.kapsamlar.some((k) => {
      if (k.tur === 'santiye') return b.santiyeler.includes(k.id);
      if (k.tur === 'proje')   return b.projeler.includes(k.id) || kayit.id === k.id;
      if (k.tur === 'sirket')  return b.sirketler.includes(k.id);
      return false;
    });
    /* Kapsam alanı hiç taşımayan kayıtlar (tenant geneli ayar kayıtları) muaftır. */
    const kapsamAlaniVar = b.santiyeler.length > 0 || b.projeler.length > 0 || b.sirketler.length > 0;
    if (kapsamAlaniVar && !uyum) throw KapsamDisi('Bu kayıt erişim kapsamınızın dışında.');
  }
  return true;
}

/**
 * Liste sorgularına kapsam filtresi ekler — "yetki filtreli toplam" için (§3.1).
 * Sütun seçenekleri üç biçim alır:
 *   'santiye_id'                     → `santiye_id = ?`
 *   'EXISTS (SELECT … pa.santiye_id = ?)' → yüklem AYNEN kullanılır (bir `?` taşımalı)
 *   null / false                     → o kapsam boyutu bu tabloda YOK
 * Kapsamlı bir rol için hiçbir yüklem kurulamıyorsa sonuç boş küme olur:
 * kapsam sütunu olmayan tabloyu "herkese açık" saymak en kısıtlayıcı seçenek değildir.
 */
export function kapsamFiltresi(ctx, { projeSutunu = 'proje_id', santiyeSutunu = 'santiye_id', sahipSutunu = 'olusturan' } = {}) {
  const p = ctx.yetkiler;
  const kosullar = ['tenant_id = ?'];
  const parametreler = [ctx.tenant.id];
  const yuklem = (s) => (String(s).includes('?') ? String(s) : `${s} = ?`);

  const sahiplik = p.kurallar.find((k) => k.kural === 'kendi_kaydi');
  if (sahiplik) { kosullar.push(yuklem(sahipSutunu)); parametreler.push(ctx.kullanici.id); }

  if (!p.tenantGeneli && p.kapsamlar.length) {
    const parcalar = [];
    for (const k of p.kapsamlar) {
      if (k.tur === 'santiye' && santiyeSutunu) { parcalar.push(yuklem(santiyeSutunu)); parametreler.push(k.id); }
      if (k.tur === 'proje'   && projeSutunu)   { parcalar.push(yuklem(projeSutunu));   parametreler.push(k.id); }
    }
    kosullar.push(parcalar.length ? `(${parcalar.join(' OR ')})` : '1 = 0');
  }
  return { nerede: kosullar.join(' AND '), parametreler };
}

/* --- Alan düzeyi maskeleme (§5.7) --------------------------------------- */
const MASKE = '••••';

/** Hassas alanları rolün kuralına göre maskeler. Maskeleme SUNUCUDA yapılır. */
export function maskele(ctx, nesne, kayit) {
  if (!kayit) return kayit;
  const kurallar = ctx.yetkiler.kurallar.filter((k) => k.kural === 'alan_maskesi' && (k.nesne === '*' || k.nesne === nesne));
  if (!kurallar.length) return kayit;
  const kopya = { ...kayit };
  for (const k of kurallar) for (const alan of k.deger.alanlar || []) {
    if (alan in kopya && kopya[alan] != null) kopya[alan] = MASKE;
  }
  return kopya;
}

/** Bir mantıksal alanın bu kullanıcı için maskeli olup olmadığı (form/liste kararı). */
export function alanMaskeliMi(ctx, nesne, alan) {
  return (ctx.yetkiler?.kurallar || []).some((k) => k.kural === 'alan_maskesi'
    && (k.nesne === '*' || k.nesne === nesne)
    && (k.deger.alanlar || []).includes(alan));
}

/** Tutar tavanı — onay/karar yetkisini tutar aralığıyla sınırlar. */
export function tutarTavani(ctx, nesne) {
  const k = ctx.yetkiler.kurallar.find((x) => x.kural === 'tutar_tavani' && (x.nesne === '*' || x.nesne === nesne));
  return k ? BigInt(k.deger.minor ?? 0) : null;
}

/** Kullanıcı kendi kaydını onaylayamaz (dört göz — doküman §5.3). */
export function kendiKaydiniOnaylayamaz(ctx, kayit) {
  if (kayit?.olusturan && kayit.olusturan === ctx.kullanici.id) {
    throw YetkiYok('Kendi oluşturduğunuz kaydı onaylayamazsınız (görevler ayrılığı).');
  }
}

/** Rail/menü görünürlüğü — yetkiden TÜRETİLİR, ayrı bir liste tutulmaz. */
export function gorunurBolumler(ctx, manifest, uygulanan = null) {
  const gorunur = new Map();
  for (const e of manifest.ekranlar) {
    if (e.bolum === 'kimlik' || e.takmaAdi) continue;
    if (uygulanan && !uygulanan.has(e.kod)) continue;   // uygulanmamış ekran menüde görünmez
    if (!yetkiVar(ctx, e.yetki)) continue;
    if (!gorunur.has(e.bolum)) gorunur.set(e.bolum, []);
    gorunur.get(e.bolum).push(e);
  }
  return manifest.bolumler
    .filter((b) => b.railde && gorunur.has(b.anahtar))
    .map((b) => ({ ...b, ekranlar: gorunur.get(b.anahtar) }));
}

/** Rolün landing rotası — yetkisiz bölüme girişte buraya yönlendirilir. */
export function landingRotasi(ctx, manifest, uygulanan = null) {
  const uygun = (e) => e && yetkiVar(ctx, e.yetki) && (!uygulanan || uygulanan.has(e.kod));
  for (const kod of ['GLB-01', 'GLB-02', 'HR-14', 'EXT-04', 'EXT-05']) {
    const e = manifest.ekranlar.find((x) => x.kod === kod);
    if (uygun(e)) return e.rota;
  }
  const ilk = manifest.ekranlar.find((e) => !e.acik && !e.dinamik && uygun(e));
  return ilk ? ilk.rota : '/403';
}
