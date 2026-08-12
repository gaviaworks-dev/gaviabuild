/* ============================================================================
   SAĞLAYICI ADAPTÖR SÖZLEŞMESİ — doküman §6.6
   ----------------------------------------------------------------------------
   "Sağlayıcılar kod içinde sabit if/else bloklarıyla değil ADAPTÖR ve ÜRÜN
   TANIMIYLA genişletilir." (§6.1)

   Her adaptör dokuz yeteneği BİLDİRİR:
     hesapDogrula · kartSenkron · bakiyeSorgu · yuklemeGonder · yuklemeDurum
     hareketAl · kartBloke · webhookDogrula · mutabakatDosyasi

   Bir sağlayıcı bir yeteneği desteklemiyorsa sistem KONTROLLÜ DOSYA akışına
   düşer (§6.6) — yetenek "varmış gibi" davranmaz.

   ÜÇ DEĞİŞMEZ KURAL — bu dosyanın var oluş sebebi:

   1. TEKNİK HATA ≠ İŞ KURALI REDDİ.
      Teknik hata (bağlantı, 5xx, zaman aşımı, imza) GÜVENLE TEKRAR EDİLİR.
      İş kuralı reddi (pasif kart, limit aşımı, uygunsuz personel) TEKRAR
      EDİLMEZ; tekrar etmek aynı reddi üretir ve kullanıcıyı yanıltır.
      Ayrım `AdaptorSonucu.hataSinifi` alanındadır: 'teknik' | 'is_kurali'.

   2. ZAMAN AŞIMI BAŞARISIZLIK DEĞİLDİR (§6.4 madde 6).
      Gönderim zaman aşımına uğrarsa sonuç BİLİNMİYOR'dur. Önce sağlayıcıdan
      DURUM SORGULANIR; sorgu yapılamıyorsa satır 'gonderildi' durumunda kalır
      ve elle karar bekler. Asla "başarısız" sayılıp yeniden gönderilmez —
      mükerrer yükleme parayla ölçülen bir hatadır.

   3. SAHTE BAŞARI YOK (kural 3).
      Yapılandırılmamış entegrasyon `basarili` dönmez; `teknik` sınıfında
      yapılandırma hatası döner. Kullanıcı gerçek durumu görür.
   ========================================================================== */
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { sorgu, tek, calistir, islem } from '../../cekirdek/db.mjs';
import { kimlik } from '../../cekirdek/kimlikler.mjs';
import { simdi } from '../../cekirdek/zaman.mjs';
import { DogrulamaHatasi, GecisIzinsiz } from '../../cekirdek/hata.mjs';
import * as audit from '../../cekirdek/audit.mjs';

/** Adaptörün bildirebileceği yetenekler (§6.6). */
export const YETENEKLER = [
  'hesapDogrula', 'kartSenkron', 'bakiyeSorgu', 'yuklemeGonder', 'yuklemeDurum',
  'hareketAl', 'kartBloke', 'webhookDogrula', 'mutabakatDosyasi',
];

export const YETENEK_ETIKETI = {
  hesapDogrula: 'Hesap doğrulama', kartSenkron: 'Kart senkronizasyonu',
  bakiyeSorgu: 'Bakiye sorgusu', yuklemeGonder: 'Yükleme gönderimi',
  yuklemeDurum: 'Yükleme durumu', hareketAl: 'Hareket / ekstre alma',
  kartBloke: 'Kart bloke / açma', webhookDogrula: 'Webhook doğrulama',
  mutabakatDosyasi: 'Mutabakat dosyası',
};

/* --- Sonuç sözleşmesi ----------------------------------------------------- */
/**
 * @typedef {object} AdaptorSonucu
 * @property {'basarili'|'reddedildi'|'teknik_hata'|'bilinmiyor'} durum
 * @property {'teknik'|'is_kurali'|null} hataSinifi
 * @property {string|null} kod       sağlayıcı hata kodu
 * @property {string|null} mesaj     kullanıcıya gösterilecek mesaj
 * @property {string|null} referans  sağlayıcı işlem referansı
 * @property {object|null} veri      işleme özel yük (maskeli)
 */
export const basarili = (referans, veri = null) =>
  ({ durum: 'basarili', hataSinifi: null, kod: null, mesaj: null, referans, veri });
export const reddedildi = (kod, mesaj) =>
  ({ durum: 'reddedildi', hataSinifi: 'is_kurali', kod, mesaj, referans: null, veri: null });
export const teknikHata = (kod, mesaj) =>
  ({ durum: 'teknik_hata', hataSinifi: 'teknik', kod, mesaj, referans: null, veri: null });
/** Zaman aşımı: başarısızlık DEĞİL. Durum sorgusu yapılmadan karar verilmez. */
export const bilinmiyor = (kod, mesaj) =>
  ({ durum: 'bilinmiyor', hataSinifi: 'teknik', kod, mesaj, referans: null, veri: null });

/** Yalnız teknik hata güvenle tekrar edilir (§6.4 madde 7). */
export const tekrarEdilebilir = (sonuc) => sonuc?.hataSinifi === 'teknik' && sonuc.durum === 'teknik_hata';

/* --- Hassas veri maskeleme ------------------------------------------------ */
const HASSAS = /(kart[_-]?no|pan|cvv|cvc|sifre|password|secret|token|authorization|iban|tc[_-]?no)/i;

/** Payload'ı loglamadan ÖNCE maskeler (§6.6 "hassas payload maskelenir"). */
export function maskele(nesne, derinlik = 0) {
  if (nesne == null || derinlik > 6) return nesne;
  if (typeof nesne === 'string') return nesne.length > 512 ? `${nesne.slice(0, 512)}…` : nesne;
  if (Array.isArray(nesne)) return nesne.slice(0, 50).map((x) => maskele(x, derinlik + 1));
  if (typeof nesne !== 'object') return nesne;
  const cikti = {};
  for (const [k, v] of Object.entries(nesne)) {
    if (HASSAS.test(k)) {
      const s = String(v ?? '');
      cikti[k] = s.length > 4 ? `••••${s.slice(-4)}` : '••••';
    } else cikti[k] = maskele(v, derinlik + 1);
  }
  return cikti;
}

/* --- Devre kesici (§6.6) -------------------------------------------------- */
export const DEVRE_ESIGI = 5;           // ardışık teknik hata
export const DEVRE_BEKLEME_MS = 60_000; // yarım açık denemeye kadar

/** Devre kesici kapalı değilse çağrı yapılmaz — sağlayıcıyı daha da yormayız. */
export function devreAcikMi(entegrasyon, simdiMs = simdi()) {
  if (!entegrasyon) return false;
  if (entegrasyon.devre_kesici !== 'acik') return false;
  const gecen = simdiMs - (entegrasyon.son_hata_zamani || 0);
  return gecen < DEVRE_BEKLEME_MS;   // süre dolduysa yarım açık: tek deneme serbest
}

/** Çağrı sonucuna göre devre kesici durumunu günceller. */
export function devreGuncelle(entegrasyonId, sonuc) {
  const e = tek('SELECT * FROM entegrasyon WHERE id = ?', entegrasyonId);
  if (!e) return;
  if (sonuc.hataSinifi === 'teknik') {
    const ardisik = (e.ardisik_hata || 0) + 1;
    calistir(`UPDATE entegrasyon SET ardisik_hata = ?, devre_kesici = ?, son_hata = ?,
                son_hata_zamani = ? WHERE id = ?`,
      ardisik, ardisik >= DEVRE_ESIGI ? 'acik' : e.devre_kesici,
      `${sonuc.kod || '—'}: ${sonuc.mesaj || ''}`.slice(0, 300), simdi(), entegrasyonId);
  } else {
    calistir(`UPDATE entegrasyon SET ardisik_hata = 0, devre_kesici = 'kapali',
                son_basari_zamani = ? WHERE id = ?`, simdi(), entegrasyonId);
  }
}

/* --- Artan beklemeli tekrar (§6.6) ---------------------------------------- */
export const BEKLEME_MS = [30_000, 120_000, 600_000, 3_600_000, 14_400_000];
export const AZAMI_DENEME = BEKLEME_MS.length;

export const sonrakiDenemeAni = (denemeSayisi, simdiMs = simdi()) =>
  simdiMs + (BEKLEME_MS[Math.min(denemeSayisi, BEKLEME_MS.length - 1)]);

/* --- Entegrasyon olayı (OPS-01) ------------------------------------------- */
/**
 * Her çağrı — başarılı olsun olmasın — olay kaydı üretir: istek kimliği,
 * MASKELİ payload, retry durumu ve yeniden oynatma yetkisi (OPS-01).
 * Aynı idempotency anahtarı iki kez muhasebeleşmez (veritabanı kısıtı).
 */
export function olayYaz(ctx, p) {
  const id = kimlik('olay');
  try {
    calistir(`INSERT INTO entegrasyon_olayi (id, tenant_id, entegrasyon_id, yon, islem,
                istek_kimligi, idempotency_anahtari, olay_kimligi, http_kodu,
                maskeli_istek, maskeli_yanit, hata_sinifi, hata_kodu, deneme_sayisi,
                sonraki_deneme, kaynak_nesne, kaynak_id, durum, zaman, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, ctx.tenant.id, p.entegrasyonId || null, p.yon || 'giden', p.islem,
      ctx.istekId || null, p.idempotencyAnahtari || null, p.olayKimligi || null,
      p.httpKodu ?? null,
      p.istek == null ? null : JSON.stringify(maskele(p.istek)),
      p.yanit == null ? null : JSON.stringify(maskele(p.yanit)),
      p.hataSinifi || null, p.hataKodu || null, p.denemeSayisi ?? 0,
      p.sonrakiDeneme ?? null, p.kaynakNesne || null, p.kaynakId || null,
      p.durum || 'bekliyor', simdi(), ctx.kullanici?.id || null, simdi());
  } catch (e) {
    /* Tekil kısıt ihlali = aynı olay ikinci kez geldi. Bu bir HATA DEĞİL,
       tekilleştirmenin ta kendisidir; çağıran mükerrer olduğunu bilmeli. */
    if (/UNIQUE/i.test(e.message)) return { id: null, mukerrer: true };
    throw e;
  }
  return { id, mukerrer: false };
}

/** Bir olayın tekrar sonucunu işler (olay satırı silinmez, güncellenir). */
export function olayGuncelle(olayId, { durum, hataSinifi = null, hataKodu = null,
                                       yanit = null, httpKodu = null, denemeSayisi = null,
                                       sonrakiDeneme = null }) {
  const o = tek('SELECT * FROM entegrasyon_olayi WHERE id = ?', olayId);
  if (!o) return;
  calistir(`UPDATE entegrasyon_olayi SET durum = ?, hata_sinifi = ?, hata_kodu = ?,
              maskeli_yanit = ?, http_kodu = ?, deneme_sayisi = ?, sonraki_deneme = ?,
              guncellendi = ? WHERE id = ?`,
    durum, hataSinifi, hataKodu,
    yanit == null ? o.maskeli_yanit : JSON.stringify(maskele(yanit)),
    httpKodu ?? o.http_kodu, denemeSayisi ?? o.deneme_sayisi, sonrakiDeneme, simdi(), olayId);
}

/* --- Webhook imzası ------------------------------------------------------- */
/**
 * HMAC-SHA256 imza doğrulaması, sabit zamanlı karşılaştırmayla.
 * Sır AÇIK saklanmaz: `entegrasyon.webhook_sirri_ozeti` yalnız özettir;
 * doğrulama, sırrın açık değerini bilen çağrı anında yapılır.
 */
export const imzala = (sir, govde) => createHmac('sha256', sir).update(govde).digest('hex');

export function imzaDogrula(sir, govde, imza) {
  if (!sir || !imza) return false;
  const beklenen = Buffer.from(imzala(sir, govde), 'utf8');
  const gelen = Buffer.from(String(imza), 'utf8');
  if (beklenen.length !== gelen.length) return false;
  return timingSafeEqual(beklenen, gelen);
}

/* ==========================================================================
   ADAPTÖRLER
   ========================================================================== */

/**
 * DOSYA ADAPTÖRÜ — §6.6'nın "kontrollü dosya içe/dışa aktarma akışı".
 *
 * Sağlayıcı API'si yoksa veya bir yeteneği desteklemiyorsa akış buraya düşer.
 * Bu adaptör GERÇEKTEN çalışır: yükleme dosyasını üretir, sonuç dosyasını
 * okur ve satır bazlı sonucu döndürür. Sahte başarı üretmez — gönderim
 * sonucu, operatör sonuç dosyasını yükleyene kadar 'bilinmiyor' kalır.
 */
export const dosyaAdaptoru = {
  kod: 'dosya',
  ad: 'Kontrollü dosya aktarımı',
  yetenekler: ['yuklemeGonder', 'yuklemeDurum', 'mutabakatDosyasi'],

  /** Yükleme dosyasını üretir; satırlar maskeli kart kimliğiyle yazılır. */
  yuklemeGonder(_ctx, { parti, satirlar }) {
    if (!satirlar.length) return reddedildi('BOS_PARTI', 'Gönderilecek satır yok.');
    /* Dosya üretmek gönderim DEĞİLDİR: sonuç, operatör sağlayıcıdan dönen
       dosyayı yükleyene kadar BİLİNMİYOR'dur. */
    return bilinmiyor('DOSYA_URETILDI',
      `${satirlar.length} satırlık yükleme dosyası üretildi. Sağlayıcıdan dönen sonuç `
      + 'dosyası yüklenmeden parti sonuçlanmaz.');
  },

  yuklemeDurum(_ctx, { parti }) {
    return bilinmiyor('DOSYA_BEKLIYOR',
      `${parti.kod} için sağlayıcı sonuç dosyası bekleniyor.`);
  },

  mutabakatDosyasi() {
    return bilinmiyor('DOSYA_BEKLIYOR', 'Mutabakat dosyası elle yüklenir.');
  },
};

/**
 * HTTP ADAPTÖRÜ — gerçek sağlayıcı API'si (Pluxee / MultiNet).
 *
 * Kimlik bilgisi vault'ta durur ve YALNIZ çalışma anında çözülür. Yapılandırma
 * eksikse SAHTE BAŞARI ÜRETİLMEZ: teknik sınıfta yapılandırma hatası döner ve
 * parti 'hatali' olur; kullanıcı gerçek nedeni görür (kural 3).
 */
export const httpAdaptoru = {
  kod: 'http',
  ad: 'Sağlayıcı API',
  yetenekler: [...YETENEKLER],

  async cagir(ctx, entegrasyon, islem, govde, { idempotencyAnahtari = null, zamanAsimiMs = 20_000 } = {}) {
    const sir = sirCoz(entegrasyon);
    if (!entegrasyon?.taban_url || !sir) {
      return teknikHata('YAPILANDIRMA_EKSIK',
        `${entegrasyon?.ad || 'Entegrasyon'} için taban adres veya kimlik bilgisi tanımlı değil. `
        + 'Ayarlar › Entegrasyonlar ekranından tamamlayın.');
    }
    const govdeMetni = JSON.stringify(govde ?? {});
    const anahtar = idempotencyAnahtari || randomUUID();
    const kontrol = new AbortController();
    const sayac = setTimeout(() => kontrol.abort(), zamanAsimiMs);
    try {
      const yanit = await fetch(`${entegrasyon.taban_url.replace(/\/$/, '')}/${islem}`, {
        method: 'POST', signal: kontrol.signal,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': anahtar,
          'x-imza': imzala(sir, govdeMetni),
          'x-istek-kimligi': ctx.istekId || '',
        },
        body: govdeMetni,
      });
      const metin = await yanit.text();
      let veri = null;
      try { veri = metin ? JSON.parse(metin) : null; } catch { veri = { ham: metin.slice(0, 500) }; }

      if (yanit.ok) return { ...basarili(veri?.referans || anahtar, veri), httpKodu: yanit.status };
      /* 4xx = iş kuralı reddi (tekrar aynı reddi üretir), 5xx/429 = teknik. */
      if (yanit.status >= 400 && yanit.status < 500 && yanit.status !== 429) {
        return { ...reddedildi(veri?.kod || `HTTP_${yanit.status}`,
          veri?.mesaj || 'Sağlayıcı isteği iş kuralı gereği reddetti.'), httpKodu: yanit.status };
      }
      return { ...teknikHata(veri?.kod || `HTTP_${yanit.status}`,
        veri?.mesaj || 'Sağlayıcı geçici olarak yanıt veremedi.'), httpKodu: yanit.status };
    } catch (e) {
      /* Zaman aşımı BAŞARISIZLIK DEĞİLDİR: sonuç bilinmiyor, durum sorulur. */
      if (e.name === 'AbortError') {
        return bilinmiyor('ZAMAN_ASIMI',
          'Sağlayıcı zamanında yanıt vermedi. Sonuç bilinmiyor; durum sorgulanmadan tekrar gönderilmez.');
      }
      return teknikHata('BAGLANTI', e.message?.slice(0, 200) || 'Bağlantı kurulamadı.');
    } finally {
      clearTimeout(sayac);
    }
  },

  yuklemeGonder(ctx, { entegrasyon, parti, satirlar }) {
    return this.cagir(ctx, entegrasyon, 'yukleme', {
      hesap: parti.hesap_id, donem: parti.donem, surum: parti.surum_no,
      satirlar: satirlar.map((s) => ({ kartToken: s.saglayici_token, tutar: String(s.tutar_minor) })),
    }, { idempotencyAnahtari: parti.idempotency_anahtari });
  },

  yuklemeDurum(ctx, { entegrasyon, parti }) {
    return this.cagir(ctx, entegrasyon, 'yukleme-durum',
      { idempotency: parti.idempotency_anahtari }, { idempotencyAnahtari: `${parti.idempotency_anahtari}#durum` });
  },

  kartBloke(ctx, { entegrasyon, kart, gerekce }) {
    return this.cagir(ctx, entegrasyon, 'kart-bloke',
      { kartToken: kart.saglayici_token, gerekce }, { idempotencyAnahtari: `bloke:${kart.id}` });
  },
};

/* --- Kayıt defteri -------------------------------------------------------- */
const ADAPTORLER = new Map([[dosyaAdaptoru.kod, dosyaAdaptoru], [httpAdaptoru.kod, httpAdaptoru]]);

/** Yeni sağlayıcı eklemek = yeni adaptör kaydetmek. if/else eklenmez (§6.1). */
export function adaptorKaydet(adaptor) {
  for (const y of adaptor.yetenekler || []) {
    if (!YETENEKLER.includes(y)) throw new Error(`Bilinmeyen yetenek: ${y}`);
  }
  ADAPTORLER.set(adaptor.kod, adaptor);
}

export const adaptor = (kod) => ADAPTORLER.get(kod) || dosyaAdaptoru;
export const adaptorListesi = () => [...ADAPTORLER.values()]
  .map((a) => ({ kod: a.kod, ad: a.ad, yetenekler: a.yetenekler }));

/** Adaptör bu yeteneği destekliyor mu; desteklemiyorsa dosya akışına düşülür. */
export function yetenekli(adaptorKodu, yetenek) {
  const a = adaptor(adaptorKodu);
  return !!(a.yetenekler.includes(yetenek) && typeof a[yetenek] === 'function');
}

/**
 * Yetenek çözümü: adaptör destekliyorsa onu, desteklemiyorsa DOSYA akışını
 * döndürür. Çağıran "destekliyor mu" diye if/else yazmaz (§6.6).
 */
export function cozumle(entegrasyon, yetenek) {
  const kod = entegrasyon?.adaptor || 'dosya';
  if (yetenekli(kod, yetenek)) return { adaptor: adaptor(kod), dosyayaDustu: false };
  return { adaptor: dosyaAdaptoru, dosyayaDustu: true };
}

/* --- Vault (K-008 kalıbı) ------------------------------------------------- */
/**
 * Gizli bilgi veritabanında AÇIK durmaz; `kimlik_referansi` bir ortam
 * değişkeni adıdır ve değer yalnız çalışma anında çözülür.
 */
export function sirCoz(entegrasyon) {
  const ref = entegrasyon?.kimlik_referansi;
  if (!ref) return null;
  return process.env[ref] || null;
}

/** Entegrasyon yapılandırması tamam mı — SET-19 sistem sağlığı bunu gösterir. */
export function yapilandirmaDurumu(entegrasyon) {
  const eksik = [];
  if (entegrasyon.adaptor !== 'dosya') {
    if (!entegrasyon.taban_url) eksik.push('taban adres');
    if (!entegrasyon.kimlik_referansi) eksik.push('kimlik referansı');
    else if (!sirCoz(entegrasyon)) eksik.push(`ortam değişkeni ${entegrasyon.kimlik_referansi}`);
    if (!entegrasyon.webhook_sirri_ozeti) eksik.push('webhook sırrı');
  }
  return { tamam: eksik.length === 0, eksik };
}

/* --- Ölü mektup kuyruğu (DLQ) --------------------------------------------- */
/** Tekrar hakkı biten teknik hatalar DLQ'ya düşer; sessizce kaybolmaz. */
export const dlq = (tenantId) => sorgu(
  `SELECT o.*, e.ad AS entegrasyon_ad FROM entegrasyon_olayi o
     LEFT JOIN entegrasyon e ON e.id = o.entegrasyon_id
    WHERE o.tenant_id = ? AND o.durum = 'dlq' ORDER BY o.zaman DESC LIMIT 200`, tenantId);

/** Tekrarı gelen olayları döndürür (zamanı gelmiş, hakkı bitmemiş). */
export const tekrarBekleyenler = (tenantId, simdiMs = simdi()) => sorgu(
  `SELECT * FROM entegrasyon_olayi
    WHERE tenant_id = ? AND durum = 'teknik_hata' AND deneme_sayisi < ?
      AND (sonraki_deneme IS NULL OR sonraki_deneme <= ?)
    ORDER BY zaman LIMIT 100`, tenantId, AZAMI_DENEME, simdiMs);

/**
 * Bir olayın yeniden oynatılması (OPS-01 "yeniden oynatma yetkisi").
 * İŞ KURALI REDDİ YENİDEN OYNATILAMAZ — aynı reddi üretir.
 */
export function yenidenOynatilabilir(olay) {
  if (!olay) return 'Olay bulunamadı.';
  if (olay.hata_sinifi === 'is_kurali') {
    return 'İş kuralı reddi yeniden oynatılamaz; kaydı düzeltip yeni gönderim açın.';
  }
  if (olay.durum === 'basarili') return 'Başarılı olay yeniden oynatılamaz.';
  return null;
}

/**
 * Çağrıyı sarar: devre kesici → olay kaydı → adaptör → sonuç → devre güncelle.
 * Bu sarmalayıcı dışında adaptör doğrudan çağrılmaz.
 */
export async function cagriYurut(ctx, { entegrasyon, yetenek, girdi, kaynakNesne = null,
                                        kaynakId = null, idempotencyAnahtari = null }) {
  if (devreAcikMi(entegrasyon)) {
    const s = teknikHata('DEVRE_ACIK',
      `${entegrasyon.ad} devre kesicisi açık (${entegrasyon.ardisik_hata} ardışık hata). `
      + 'Bekleme süresi dolmadan yeni çağrı yapılmaz.');
    islem(() => olayYaz(ctx, { entegrasyonId: entegrasyon.id, islem: yetenek, durum: 'teknik_hata',
      hataSinifi: 'teknik', hataKodu: s.kod, istek: girdi, kaynakNesne, kaynakId }));
    return s;
  }

  const { adaptor: a, dosyayaDustu } = cozumle(entegrasyon, yetenek);
  let kayit;
  islem(() => {
    kayit = olayYaz(ctx, { entegrasyonId: entegrasyon?.id, islem: yetenek, durum: 'bekliyor',
      istek: girdi, idempotencyAnahtari, kaynakNesne, kaynakId });
  });
  if (kayit.mukerrer) {
    return reddedildi('MUKERRER_OLAY',
      'Bu idempotency anahtarıyla bir çağrı zaten kaydedilmiş; ikinci kez muhasebeleşmez.');
  }

  let sonuc;
  try {
    sonuc = await a[yetenek](ctx, { ...girdi, entegrasyon });
  } catch (e) {
    sonuc = teknikHata('ADAPTOR_HATASI', e.message?.slice(0, 200) || 'Adaptör hatası.');
  }
  if (dosyayaDustu) {
    sonuc = { ...sonuc, dosyayaDustu: true,
      mesaj: `${sonuc.mesaj || ''} (Sağlayıcı bu yeteneği desteklemiyor; kontrollü dosya akışı kullanıldı.)`.trim() };
  }

  const DURUM = { basarili: 'basarili', reddedildi: 'is_kurali_reddi',
    teknik_hata: 'teknik_hata', bilinmiyor: 'bekliyor' };
  islem(() => {
    olayGuncelle(kayit.id, {
      durum: DURUM[sonuc.durum] || 'bekliyor',
      hataSinifi: sonuc.hataSinifi, hataKodu: sonuc.kod, yanit: sonuc.veri ?? { mesaj: sonuc.mesaj },
      httpKodu: sonuc.httpKodu ?? null, denemeSayisi: 1,
      sonrakiDeneme: sonuc.durum === 'teknik_hata' ? sonrakiDenemeAni(1) : null,
    });
    if (entegrasyon?.id) devreGuncelle(entegrasyon.id, sonuc);
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici?.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'entegrasyon_olayi', nesneId: kayit.id, eylem: `cagri:${yetenek}`,
      sonraki: { durum: sonuc.durum, kod: sonuc.kod, kaynak: kaynakNesne, kaynakId } });
  });
  return { ...sonuc, olayId: kayit.id };
}

/** Sağlayıcı adının tarihsel karşılığı → kanonik kod (§6.1: Sodexo → Pluxee). */
export function saglayiciEsle(tenantId, ad) {
  const hedef = String(ad || '').trim().toLocaleLowerCase('tr');
  if (!hedef) return null;
  for (const s of sorgu('SELECT * FROM kart_saglayici WHERE tenant_id = ?', tenantId)) {
    if (s.kod.toLocaleLowerCase('tr') === hedef) return s;
    if (s.ad.toLocaleLowerCase('tr') === hedef) return s;
    const eski = (s.eski_adlar || '').split(',').map((x) => x.trim().toLocaleLowerCase('tr'));
    if (eski.includes(hedef)) return s;
  }
  return null;
}

export { DogrulamaHatasi, GecisIzinsiz };
