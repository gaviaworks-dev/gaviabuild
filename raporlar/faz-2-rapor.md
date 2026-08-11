# FAZ 2 RAPORU — İş akışı omurgası

**Tarih:** 2026-08-11 · **Dal:** `revizyon/faz-0-6` · **Şartname:** `docs/REVIZYON.md` §9 Faz 2
**Çıkış koşulu:** *"Sözleşme, talep, görev ve süre uzatımı formdan durum/onaycı seçemez."*

---

## 1. Teslim edilen ekranlar (14 aile, hepsi doğrulandı)

| Kod | Ekran | Öne çıkan davranış |
| --- | --- | --- |
| GLB-04 | Onay kutum | Tüm modüllerin merkezi onay görevleri. **Kendi talebiniz listede yer almaz** (dört göz). Vekaleten karar verilen kayıtlar şeritte bildirilir. |
| GLB-05 | Onay detayı | Karar verilen **belge sürümü dondurulur** ve ekranda gösterilir; ret/revizyonda gerekçe zorunlu; karar geçmişi değiştirilemez. |
| GLB-06 | Bildirim merkezi | Faz 1'de kabuk, Faz 2'de gerçek olay üretimi: onay bekliyor, onay sonucu, durum değişti. |
| GLB-09 | Duyurular | Onay motorunun **uçtan uca ilk uygulaması**: taslak → onaya gönder → karar → yayına **motor** alır. |
| SET-06 | İş akışı şablonları | Sürümlü; nesne, şirket, proje, tutar aralığı, maliyet kodu, risk sınıfı ve işlem türüne göre seçilir. Paralel adım ve SLA görünür. |
| SET-07 | Onay vekaletleri | Süreli; aynı kişi için **çakışan tarih aralığı reddedilir**; iptal gerekçesi denetim izine yazılır. |
| SET-08 | Bildirim kuralları | Kural tablosu + sistemin gerçekten ürettiği olayların dökümü (sahte olay yok). |
| SET-09 | Numaralandırma | `DOC-2026-0001` biçimi; kod üretimi transaction içinde, iki eşzamanlı kayıt aynı numarayı alamaz. |
| SET-10 | Durum ve sözlük yönetimi | **Çekirdek durumlar kilitli** tablosu (§5.2 zincirleri) + tenant sözlükleri. |
| SET-11 | Maliyet kodları | Hiyerarşik WBS eşlemesi; bütçe, satın alma, stok ve hakedişin ortak dili. |
| SET-12 | Belge türleri ve saklama | Zorunluluk, saklama süresi, erişim sınıfı. |
| DOC-01 | Doküman merkezi | Kanonik belge kaydı; **gizli sınıf yetkisiz kullanıcıya listelenmez**. |
| DOC-02 | Yeni doküman | **Gerçek dosya yükleme**: multipart çözümleme, MIME imza doğrulaması, SHA-256 özeti, içerik-adresli depolama. |
| DOC-03 | Doküman detayı | Sürüm satırı **değiştirilemez**; yeni yükleme yeni sürüm açar; eski sürümler indirilebilir; indirme denetim izinde. |

## 2. Motorlar

### 2.1 Geçiş motoru (§5.2)

`app/moduller/isakisi/durumlar.mjs` dokümanın §5.2 tablosunu **birebir** taşır; testler zinciri
karakter karakter doğrular. `durum.mjs` tek geçiş kapısıdır:

| Garanti | Uygulama |
| --- | --- |
| Durum serbest seçim kutusu değil | Geçiş yalnız tanımlı `(den, eylem)` çiftiyle olur; olmayan geçiş 409 |
| Nihai durumu kullanıcı seçemez | `yalnizMotor` işaretli geçişler kullanıcı kodundan çağrılamaz (403) |
| Ön koşul | `onKosul(ctx, kayit)` — örn. sorumlusuz görev "açık" olamaz |
| Zorunlu gerekçe | `gerekce: 'zorunlu'` geçişlerde boş gerekçe 422 |
| Dört göz | `dortGoz` geçişlerinde kaydın sahibi doğrulayamaz |
| Tek transaction | İş nesnesi + audit + bildirim aynı transaction'da; yan etki başarısızsa geçiş geri alınır |
| `gecikmiş` durum değil | `isaretler()` hesaplar, **saklamaz**; tamamlanan kayıt gecikmiş işareti almaz |

### 2.2 Onay motoru (§5.3)

| Şart (doküman) | Uygulama |
| --- | --- |
| Şablon; nesne, şirket, proje, tutar, maliyet kodu, risk, işlem türüne göre seçilir | `sablonSec()` — en özel eşleşme kazanır (proje > şirket > genel; dar tutar aralığı geniş aralığı yener) |
| Adımlar sıralı veya paralel | Aynı `sira` = paralel; `gereken_onay` o sırada kaç onay arandığını söyler |
| Talep sahibi kendi kaydını onaylayamaz | `kararVer()` 403 — testte doğrulandı |
| Onaycı **formdan seçilmez** | `adimAdaylari()` rol + kapsam + vekaletten çözer |
| Vekaletler süreli ve audit kayıtlı | `vekalet.mjs`; karar `vekaleten` alanıyla saklanır |
| Revizyonda önceki onaylar geçersizleşir | `revizyonBildir()` — şablondaki `revizyonda_onaylar_gecersiz` politikasına göre |
| Ret ve revizyonda gerekçe zorunlu | 422 |
| Onay ekranı karar verilen sürümü sabit gösterir | `belge_surum` dondurulur; farklı sürümle karar 409 |
| Şablon yoksa onaysız etki olmaz | Akış başlatılamaz (422); kayıt taslakta kalır |

Kurulumla gelen şablonlar: duyuru · talep (3 tutar kademesi) · sözleşme · hakediş (paralel) ·
süre uzatım · kart yükleme.

## 3. Kabul testleri — 86/86 geçiyor

```
$ npm test
ℹ tests 86   ℹ pass 86   ℹ fail 0
```

| Test | Sonuç | Nasıl doğrulandı |
| --- | --- | --- |
| **WF-01** | ✅ | §5.2 durum zincirleri birebir · hiçbir POST formunda `durum`/`onayci` alanı yok (hem render hem kaynak kod taraması) · motor-özel geçiş kullanıcı kodundan tetiklenemiyor · eylem menüsü nihai durumu göstermiyor · onaycı şablondan çözülüyor · şablonsuz akış başlatılamıyor |
| **WF-02** | ✅ | Karar formu belge sürümünü taşıyor ve ekranda gösteriyor · farklı sürümle karar 409 · revizyon açık talebi iptal ediyor · karar kaydı veritabanı düzeyinde değiştirilemiyor |
| AUTH-01, SEC-01, UI-01, UI-02, AUD-01 | ✅ | Faz 1'den regresyonsuz geçiyor |

**Ek testler (yeşil):** dört göz · kendi talebi onay kutusunda yok · gerekçe zorunluluğu ·
yetkisiz rol karar veremiyor · onaylanınca durumu **motor** ilerletiyor · aynı kişi aynı adımda iki kez
karar veremiyor · tutar kademesine göre şablon seçimi · tutar arttıkça onay kademesi artıyor ·
paralel adım tanımı · vekalet çakışması reddi · kendine vekalet reddi · vekilin kararı "vekaleten"
işleniyor · gecikme durum değil işaret · SLA riski · bildirim üretimi · karar denetim izinde ·
doküman sürümleme · MIME imza doğrulaması · izinsiz tür reddi · indirme denetimi · gizli belge gizliliği.

## 4. Bu fazda bulunan ve düzeltilen **gerçek hatalar**

| # | Bulgu | Etki | Düzeltme |
| --- | --- | --- | --- |
| 1 | **Async isleyicideki hata `try/catch`'e düşmüyordu.** `return promise` biçimi try bloğunu beklemeden döner. | Dosya yükleme gibi async rotalarda **her hata süreci çökertiyordu** (yakalanmamış promise reddi). | `return await rota.isleyici(...)` |
| 2 | Vekil karar veremiyordu | Ekran yetkisi (`GLB-05:karar_ver`) aranıyordu; vekilin kendi rolünde bu yetki yok → **vekalet özelliği tümüyle işlevsizdi** | Karar yetkisi onay **adımından** çözülür; ekran yetkisi yalnız görüntüleme (K-022) |
| 3 | "Liste/Form", "Liste/Detay" ekranlarında kayıt oluşturulamıyordu | Bileşik tip "detay" kalıbına düşüyor, `olustur` yetkisi üretilmiyordu → 42 ekranda oluşturma imkânsız | `listeForm` kalıbı (K-023) |
| 4 | Doküman detayında yeni sürüm yüklenemiyordu | "Detay" kalıbında `guncelle` yok → §5.4 sürümleme kullanılamaz | `EKRAN_EYLEMLERI` istisnası (K-024) |

## 5. Kırık link ve yetkisiz erişim taraması

| Ölçüm | Sonuç |
| --- | --- |
| Menüden erişilebilen tüm rotalar | Tümü `< 400` (otomatik test) |
| Uygulanmamış manifest rotası | Dürüst 404, WIP metni yok |
| Yetkisiz karar denemesi (depo sorumlusu) | 403 |
| Kendi talebini onaylama | 403 |
| CSRF'siz yazma | 403 |
| Gizli belge, yetkisiz kullanıcı | Listede yok |
| Dosya deposunda yol dışına çıkma | Engelli |

## 6. Veri tutarlılığı

| Kontrol | Sonuç |
| --- | --- |
| Denetim zinciri | Sağlam |
| Onay kararı değiştirme | Tetikleyiciyle reddediliyor |
| Doküman sürümü değiştirme | Tetikleyiciyle reddediliyor |
| Dosya–metadata bağı | SHA-256 özetiyle doğrulanıyor; içerik-adresli depolama |
| Eşzamanlı numara üretimi | Transaction içinde; mükerrer kod imkânsız |
| Vekalet çakışması | Tarih aralığı kesişiminde reddediliyor |

## 7. Görsel değerlendirme

`node tools/ss-eval.mjs` — 17 hedef × 1440/390px = 34 ekran görüntüsü.
Yatay taşma **0**, sayfa başına tek `<h1>`, etiketsiz form girdisi **0**, `alt`sız görsel **0**.
Yeni ekranlar (onay kutum, onay detayı, duyurular, iş akışı şablonları, vekaletler, sözlükler,
maliyet kodları, doküman merkezi/detayı) mevcut sayfa diline uyumlu; ek görsel bulgu çıkmadı.

## 8. Üretime çıkış engelleri (§12)

| Engel | Durum |
| --- | --- |
| P0 rotada 404 / WIP / yalnız toast / localStorage iş kaydı | **Yok** |
| İstemciden rol, tenant, proje veya **onay durumu** değiştirme | **Yok** — onay durumu yalnız motorda |
| Onaylı kaydın sürüm açmadan düzenlenmesi | **Yok** — doküman sürümü ve onay kararı değiştirilemez; revizyon açık onayı geçersizler |
| Bakiyenin defterden üretilememesi | Faz 4-5 kapsamı |
| Kart gönderiminde idempotency | Faz 5 kapsamı — altyapı hazır ve testli |
| Rapor çıktı tutarsızlığı | Faz 6 kapsamı |
| Audit / yetki testi / hata ekranı / maskeleme | **Yok** — dördü de mevcut ve testli |

## 9. Faz 2 çıkış koşulu

| Koşul | Durum |
| --- | --- |
| Formdan durum seçilemiyor | ✅ Render ve kaynak kod taramasıyla doğrulandı |
| Formdan onaycı seçilemiyor | ✅ Onaycı rol + kapsam + vekaletten çözülüyor |
| Merkezi geçiş motoru | ✅ §5.2 tablosu birebir; geçiş tek kapıdan |
| Merkezi onay motoru | ✅ Eşik, sıralı/paralel adım, dört göz, vekalet, SLA |
| Sürüm/iptal/arşiv | ✅ Doküman sürümleme + revizyonda onay geçersizleşmesi |
| WF-01, WF-02 | ✅ |

**Sonuç: FAZ 2 KAPANDI.** Faz 3 (proje ve saha) başlayabilir.
