/* ============================================================================
   HATA SÖZLEŞMESİ — her eylem gerçek hata kodu üretir (değişmez kural 3)
   ----------------------------------------------------------------------------
   Sahte başarı bildirimi yasak; başarısızlık da "sessiz" olamaz. Her hata
   makine-okunur bir `kod`, kullanıcıya gösterilebilir bir `mesaj` ve gerekiyorsa
   alan bazlı `alanlar` taşır. HTTP durumu hatanın türünden türetilir.
   ========================================================================== */

export class UygulamaHatasi extends Error {
  /** @param {{kod:string,mesaj:string,durum:number,alanlar?:object,ayrinti?:object,
   *           gizli?:boolean,yonlendirme?:{kod:string,metin?:string}}} p */
  constructor({ kod, mesaj, durum, alanlar = null, ayrinti = null, gizli = false,
                yonlendirme = null }) {
    super(mesaj);
    this.name = 'UygulamaHatasi';
    this.kod = kod;
    this.mesaj = mesaj;
    this.durum = durum;
    this.alanlar = alanlar;
    this.ayrinti = ayrinti;
    /** gizli=true → istemciye ayrıntı sızdırılmaz (kullanıcı var/yok gibi) */
    this.gizli = gizli;
    /**
     * Reddin ÇIKIŞI (denetim-02 D-14/D-16, KARARLAR.md K-125): kullanıcıyı işi
     * yapabileceği ekrana götüren manifest EKRAN KODU. Rota koda göre
     * manifestten çözülür (kural 1) — reddedip kullanıcıyı boşta bırakmayız.
     */
    this.yonlendirme = yonlendirme;
  }
  govde() {
    return { hata: { kod: this.kod, mesaj: this.mesaj, ...(this.alanlar ? { alanlar: this.alanlar } : {}) } };
  }
}

const yap = (kod, durum, varsayilanMesaj) => (mesaj = varsayilanMesaj, ek = {}) =>
  new UygulamaHatasi({ kod, durum, mesaj, ...ek });

/* 4xx — istemci */
export const DogrulamaHatasi   = yap('DOGRULAMA_HATASI', 422, 'Girdiler geçerli değil.');
export const KimlikGerekli     = yap('KIMLIK_GEREKLI', 401, 'Oturum açmanız gerekiyor.');
export const KimlikGecersiz    = yap('KIMLIK_GECERSIZ', 401, 'E-posta veya şifre hatalı.');
export const YetkiYok          = yap('YETKI_YOK', 403, 'Bu işlem için yetkiniz yok.');
export const KapsamDisi        = yap('KAPSAM_DISI', 403, 'Bu kayıt erişim kapsamınızın dışında.');
export const Bulunamadi        = yap('BULUNAMADI', 404, 'Kayıt bulunamadı.');
export const Cakisma           = yap('CAKISMA', 409, 'Kayıt bu sırada başkası tarafından değiştirildi.');
export const SurumCakismasi    = yap('SURUM_CAKISMASI', 409, 'Kaydın sürümü değişti; sayfayı yenileyip tekrar deneyin.');
export const GecisIzinsiz      = yap('GECIS_IZINSIZ', 409, 'Bu durum geçişine izin verilmiyor.');
export const OnPartiKosulu     = yap('ON_KOSUL', 409, 'İşlemin ön koşulu sağlanmadı.');
export const IdempotencyCakisma= yap('IDEMPOTENCY_CAKISMASI', 409, 'Aynı anahtarla farklı içerikli bir istek daha önce işlendi.');
/**
 * 413 — gövde sınırı (denetim-02 D-13, KARARLAR.md K-128). 422 DEĞİL: sorun
 * alan doğrulaması değil, isteğin kendisinin taşınamayacak kadar büyük olması.
 * Bu durum bağlantıyı da etkiler; `sunucu.mjs` yanıtı `Connection: close` ile
 * kapatır, aksi halde okunmamış gövde bir sonraki isteği ECONNRESET'le düşürür.
 */
export const GovdeCokBuyuk     = yap('GOVDE_COK_BUYUK', 413, 'Gönderilen veri çok büyük.');
export const CokFazlaIstek     = yap('COK_FAZLA_ISTEK', 429, 'Çok fazla deneme yapıldı, lütfen bekleyin.');
export const CsrfGecersiz      = yap('CSRF_GECERSIZ', 403, 'Oturum doğrulaması başarısız; sayfayı yenileyin.');

/* 5xx — sunucu ve dış bağımlılık */
export const SunucuHatasi      = yap('SUNUCU_HATASI', 500, 'Beklenmeyen bir hata oluştu.');
export const EntegrasyonHatasi = yap('ENTEGRASYON_HATASI', 502, 'Dış servis şu anda yanıt vermiyor.');
export const Bakimda           = yap('BAKIMDA', 503, 'Sistem planlı bakımda.');

/** Bilinmeyen hatayı sızdırmadan sözleşmeye çevirir. */
export function hataCevir(e) {
  if (e instanceof UygulamaHatasi) return e;
  const h = SunucuHatasi();
  h.ayrinti = { asil: e?.message, yigin: e?.stack };
  return h;
}
