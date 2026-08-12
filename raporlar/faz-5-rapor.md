# FAZ 5 RAPORU — Kartlar

**Tarih:** 2026-08-12 · **Dal:** `revizyon/faz-0-6` · **Tag:** `faz-5-tamam`
**Kapsam:** doküman §9 Faz 5 — "Kartlar" · 23 sayfa ailesi
**Test:** 361/361 yeşil (`node --test`, 87 suite) · **Doğrulanan ekran:** 216/244

---

## 1. Çıkış koşulu karşılandı mı?

PLAN.md'deki Faz 5 çıkış koşulları ve §11'in kart kabul maddeleri:

| Kod | Kabul cümlesi | Durum | Kanıt |
| --- | --- | --- | --- |
| CRD-01 | Aynı şirket aynı anda Pluxee ve MultiNet hesaplarına ve her hesapta çoklu karta sahip olabilir | ✅ | `faz5.test.js` — iki sağlayıcıda üç hesap, hesap başına çoklu kart |
| CRD-02 | Bir personelde birden çok kart olabilir; aynı kart için çakışan aktif atama reddedilir | ✅ | `faz5.test.js` — aynı personele 2 kart; çakışan atama 409 |
| CRD-03 | Aynı dönem/kaynak/idempotency key ile iki yükleme partisi finansal etki üretmez | ✅ | `faz5.test.js` — ikinci parti 409, toplam değişmedi |
| CRD-04 | Kısmi sonuçta başarılı satırlar tekrar gönderilmez; yalnız güvenli teknik hatalar tekrar edilir | ✅ | `faz5.test.js` — tekrar 409, defter satırı artmadı |
| CRD-05 | Kart bakiyesi hiçbir form alanından değiştirilemez; düzeltme onaylı hareket ve ters kayıtla | ✅ | `faz5.test.js` — bakiye sütunu yok, defter tetikleyici korumalı, ters kayıt |
| CRD-06 | Kayıp/çalıntı blokaj çağrısını, sonucu, retry'ı ve bildirimi audit izinde gösterir | ✅ | `faz5.test.js` — `blokaj_cagrisi` + `gecis:kayip_bildir` audit izinde |
| OPS-01 | Entegrasyon hatası istek kimliği, maskeli payload, retry durumu ve yeniden oynatmayla izlenir | ✅ | `faz5.test.js` — olay kaydı, maskeleme, DLQ, yeniden oynatma kısıtı |
| WF-01 | Talep sahibi kart yüklemede onay durumunu/nihai durumu seçemez | ✅ | `faz2.test.js` + `faz5.test.js` — formda durum/onaycı/bakiye alanı yok |

**22/23 aile teslim edildi.** `CRD-17` (Kart raporları) manifestte `RPT-13`'ün
**takma adıdır**; tek `ReportLayout` kuralı (kural 9) gereği Faz 6'da RPT-13 ile
birlikte gelir. Bu bilinçli bir sıralamadır: ikinci bir rapor çıktı yolu açmamak
için Faz 5'te ayrı bir kart raporu YAZILMADI. Rota şu an dürüst 404 döner.

---

## 2. Teslim edilen aileler

| Blok | Kodlar | Aile | Commit |
| --- | --- | --- | --- |
| Kart çekirdeği (şema, defter, adaptör, yükleme motoru) | — | — | `faz5(CRD)` |
| Panel, liste, form, detay, düzenle, atama | CRD-01..06 | 6 | `faz5(CRD-01..09,13,15)` |
| Sağlayıcı görünümleri ve hesaplar | CRD-07..09 | 3 | `faz5(CRD-01..09,13,15)` |
| Hareket defteri ve güvenlik | CRD-13, CRD-15 | 2 | `faz5(CRD-01..09,13,15)` |
| Toplu yükleme | CRD-10..12 | 3 | `faz5(CRD-10..12,14,16)` |
| Mutabakat ve onaylar | CRD-14, CRD-16 | 2 | `faz5(CRD-10..12,14,16)` |
| Entegrasyon | CRD-18, SET-13..15, SET-19 | 5 | `faz5(CRD-18,SET-13..15,SET-19,HR-06)` |
| İşten ayrılış | HR-06 | 1 | `faz5(CRD-18,SET-13..15,SET-19,HR-06)` |
| **Toplam** | | **22** | |

---

## 3. §6'nın uygulanma biçimi

### 3.1 Veri modeli (§6.2) — üç yapısal karar

| Karar | Uygulama |
| --- | --- |
| **Tam kart numarası hiçbir yerde tutulmaz** (K-085) | `kart` tablosunda `maskeli_no` sütunu var, `CHECK (length(maskeli_no) <= 8)` ile korunuyor; tam numara sütunu **yok**. Form 4 haneden uzun girdiyi 422 ile reddediyor (K-092). Denetim izine ve yükleme dosyasına da yalnız maskeli değer yazılıyor — testte iddia ediliyor. |
| **Kart bakiyesi saklanmaz** (K-086) | `kart_hareketi` değişmez defter (UPDATE/DELETE tetikleyiciyle engelli), bakiye her okumada toplanıyor. `stok/defter.mjs` ve `finans/defter.mjs` ile **aynı sözleşme**; ikinci bir defter yazılmadı. Bekleyen (provizyon) satırlar `kesinlesmis = 0` ile ayrı tutuluyor ve bakiyeye girmiyor (§6.5). |
| **Teknik hata ≠ iş kuralı reddi** (K-088) | `kart_yukleme_satiri.durum` içinde `teknik_hata` ve `reddedildi` ayrı değerler. Yalnız teknik hata tekrar ediliyor. |

Onun dışında §6.2'nin on varlığının hepsi karşılandı: `kart_saglayici`,
`saglayici_hesabi`, `kart`, `kart_atamasi`, `kart_politikasi`,
`kart_yukleme_partisi`, `kart_yukleme_satiri`, `kart_hareketi`,
`kart_mutabakati`, `entegrasyon_olayi` (+ `kart_urunu`, `entegrasyon`).

### 3.2 Yaşam döngüsü (§6.3)

Kart durumları dokümandaki sırayla: `sipariş edildi → basımda → aktiflenebilir
→ aktif → geçici bloke / kayıp-çalıntı / yenilemede → iptal / süresi doldu →
arşiv`. Sıra atlanamıyor (testte doğrulandı). Kayıp/çalıntı sağlayıcı yanıtını
**beklemeden** bloke ediyor; çağrı başarısızsa kullanıcıya "sağlayıcı blokajı
sonuçlanmadı" deniyor ve olay tekrar kuyruğuna alınıyor (K-093). Yenilemede eski
kart, yeni kart ve **bakiye devri** aynı vaka altında; devir iki defter
satırıyla yapılıyor, elle taşınmıyor (K-094).

### 3.3 Toplu yükleme (§6.4) — sekiz adım

| Adım | Uygulama |
| --- | --- |
| 1. Kapsam seçimi | CRD-11 sihirbazı: hesap, ürün, dönem, kaynak |
| 2. Uygunluk hesabı | Kart durumu, atama, personel durumu, para birimi, ayrılış ve **kilitli puantaj** kontrolü; hariç tutulan her satır **nedenini taşıyor** |
| 3. Gün ve tutar formülü | `tutar = gün × politika günlük tutarı`; gün kaynağı politikada (puantaj/sabit/takvim). Formda tutar alanı **yok**. İstisna **gerekçe zorunlu** ve yalnız taslakta (K-089) |
| 4. Yedi kontrol | Mükerrer kart, mükerrer dönem, para birimi, sıfır/negatif tutar, pasif kart, ayrılmış personel, hesap uyumu — `partiDogrula()` |
| 5. Sürüm dondurma + onay | Onaya giderken `donduruldu` damgalanıyor; onay şablonu toplam tutardan çözülüyor |
| 6. Idempotent gönderim | Parti başına idempotency anahtarı; **zaman aşımı başarısızlık sayılmıyor**, önce durum sorgulanıyor |
| 7. Satır bazlı sonuç | `basarili / reddedildi / teknik_hata / gonderildi`; yalnız teknik hata tekrar ediliyor |
| 8. Mutabakat olmadan kapanmaz | `kapanisEngelleri()` üç kaynağı da istiyor |

**Mükerrer yükleme üç katmanda engelli** (K-090): `(hesap, ürün, dönem, kaynak)`
tekil kısıtı, parti başına tekil idempotency anahtarı ve
`(kart, sağlayıcı referansı)` tekil indeksi. Ayrıca `(parti, kart)` tekil —
bir kart bir partide bir kez yer alır.

### 3.4 Bakiye (§6.5)

`kullanılabilir bakiye = kesinleşmiş yükleme + iade + olumlu düzeltme −
kesinleşmiş harcama − ters/olumsuz düzeltme` formülü birebir. Bekleyen işlemler
ayrı gösteriliyor. Manuel harcama girişi normal akış değil: düzeltme ters kayıt
gerektiriyor ve aynı hareket iki kez ters çevrilemiyor. Üye işyeri, maskeli
rollerde gizleniyor.

### 3.5 Entegrasyon sözleşmesi (§6.6)

Dokuz yeteneğin hepsi adaptör sözleşmesinde bildiriliyor: `hesapDogrula`,
`kartSenkron`, `bakiyeSorgu`, `yuklemeGonder`, `yuklemeDurum`, `hareketAl`,
`kartBloke`, `webhookDogrula`, `mutabakatDosyasi`. Desteklenmeyen yetenekte
sistem **kontrollü dosya akışına** düşüyor — ve bu akış gerçekten çalışıyor
(K-097): parti CSV'si künyeyle indiriliyor, sağlayıcı sonuç dosyası yüklenip
satır bazlı deftere işleniyor.

Webhook imzası HMAC-SHA256 ve **sabit zamanlı** karşılaştırmayla doğrulanıyor.
Tekrar eden olaylar `olay_kimligi` ile tekilleştiriliyor. Devre kesici (5 ardışık
teknik hata), artan beklemeli retry (30sn → 4sa, 5 deneme) ve DLQ mevcut;
operasyon ekranı SET-15 ve SET-19.

### 3.6 Yetki matrisi (§6.7)

| Rol | Testte doğrulanan |
| --- | --- |
| Çalışan | Kendi kartı, bakiyesi ve hareketleri görünür; başkasının kartı **404**; şirket toplamı görünmez; yükleme/mutabakat/sağlayıcı/onay ekranları **403** |
| İK | Kart paneli ve atama açık; **banka mutabakatı 403**, entegrasyon sırları **403** |
| Finans | Hesap, parti, toplam, hareket ve mutabakat açık; üye işyeri maskeli |
| Sistem yöneticisi | Entegrasyon yapılandırır (K-099), sistem sağlığı açık; **onay kutusu 403** |
| Depo / satın alma / şantiye şefi | Kart bölümüne erişimi yok — 403 |

---

## 4. Kırık link taraması

Uygulanmış **216** ekran kodunun tamamı manifest rotasından gezildi.

| Bulgu | Adet | Değerlendirme |
| --- | --- | --- |
| 200 dönen statik rota | 148 | — |
| Parametreli (dinamik) rota | 63 | Kabul testlerinde ayrıca kanıtlandı |
| Kasıtlı durum kodu | 5 | `AUTH-06` 403 (kurulum bitti), `AUTH-07` 200, `AUTH-08` 403, `AUTH-09` 404, `AUTH-10` 503 |
| **Gerçek kırık link** | **0** | — |

Uygulanmamış **27/27** manifest rotası dürüst **404** döndürdü (K-018);
`CRD-17` dâhil, çünkü RPT-13 ile Faz 6'da gelecek.

---

## 5. Yetkisiz erişim taraması

23 rol × rota kombinasyonu denendi; **22**'si 403 döndü. Tek istisna
`calisan → /kartlar/liste = 200`, bu **tasarım gereğidir** (§6.7 "Çalışan:
kendi kartı"): liste açık, **kapsam kapalı** — sunucu tarafı ABAC yalnız
kendisine atanmış kartları döndürür ve bu ayrıca test edilir (başkasının kart
kodu listede görünmüyor, query parametresiyle kapsam genişletilemiyor).

| Kontrol | Sonuç |
| --- | --- |
| `?role=`, `?tenant=`, `?hesap_id=` ile kapsam genişletme | Etkisiz ✅ |
| Sır (`webhookSirri`) veritabanında, ekranda veya audit izinde | Hiçbirinde yok ✅ |
| HTTPS olmayan entegrasyon taban adresi | 422 ile reddedildi ✅ |
| Kart tablosunda tam numara sütunu | Yok ✅ |
| Yükleme dosyasında uzun sayı dizisi | Yok ✅ |

### Bu fazda kapatılan bulgular

| # | Bulgu | Karar |
| --- | --- | --- |
| 1 | Gelecek tarihli kart ataması iade edilirken `bitis < baslangic` veritabanı kısıtını ihlal ediyor, 500 üretiyordu | Kapanış tarihi `max(şimdi, başlangıç)` — atama başlamadan bitemez |
| 2 | Kart yükleme ve politika onay şablonlarında **hazırlayan rol adım olarak** yer alıyordu; dört göz ilkesi akışı fiilen kilitliyordu | **K-098** — hazırlayan finans, karar İK + firma sahibi |
| 3 | Mutabakat iç toplamı hareketin **yazıldığı ana** göre hesaplanıyordu; Eylül partisi Ekim'de gönderilince Eylül mutabakatı sıfır çıkıyordu | İç toplam artık partinin **dönemine** göre; partiye bağsız satırlar hareket zamanından |

---

## 6. Veri tutarlılığı

| Kural | Uygulama | Kanıt |
| --- | --- | --- |
| 4 — Tek kanonik kayıt/API | CRD-07/CRD-08 ayrı ekran değil, kart listesinin sağlayıcı görünümü (K-091). Ayrı `pluxee`/`multinet` tablosu **yok** | `faz5.test.js` |
| 5 — Kullanıcı durum/onaycı seçemez | Kart, parti, politika ve mutabakat formlarında `durum`, `onayci`, `bakiye` alanı yok | `faz5.test.js` |
| 6 — Onaylı kayıt yerinde değişmez | Onaylı mutabakat düzenlenemiyor; politika yeni sürüm açıyor; dondurulmuş partide istisna tanımlanamıyor | `faz5.test.js` |
| **7 — Bakiye defterden türer** | `kart` tablosunda bakiye sütunu yok; `kart_hareketi` tetikleyici korumalı; düzeltme ters kayıt; aynı sağlayıcı referansı iki kez muhasebeleşmiyor | `faz5.test.js` |
| 8 — Idempotency + sürüm + audit | Parti idempotency anahtarı, sürüm dondurma, her defter yazımı audit'e `defter:<tür>` | `faz5.test.js` |
| 10 — Para tamsayı kuruş | `*_minor` sütunları INTEGER; `Para.ayristir` tek giriş kapısı | K-004 |
| §7 — Zorunlu hedef bağlantılar | Kart yükleme onayı → sağlayıcı + kart defteri + banka mutabakatı · Personel ayrılış → kart, zimmet, erişim, puantaj | `faz5.test.js` |

---

## 7. Üretime çıkış engelleri (§12)

| Engel | Durum |
| --- | --- |
| P0 rotada 404, WIP bağlantısı, yalnızca toast üreten işlem | ❌ yok — 216 ekran gezildi, 0 kırık link; uygulanmamış rota dürüst 404 |
| localStorage tabanlı iş kaydı | ❌ yok |
| Query parametresi/istemci deposuyla rol, tenant, proje, kapsam değiştirme | ❌ yok — denendi, etkisiz |
| Onaylı yükleme partisinin sürüm açmadan düzenlenmesi | ❌ yok — onaya giderken sürüm donduruluyor, dondurulmuş partide istisna reddediliyor |
| **Kart bakiyesinin hareket defterinden üretilememesi** | ❌ yok — bakiye sütunu **hiç yok** |
| **Pluxee/MultiNet gönderiminde idempotency, durum sorgusu, kısmi sonuç eksikliği** | ❌ yok — üç katmanlı idempotency, zaman aşımında durum sorgusu, satır bazlı kısmi sonuç |
| Rapor PDF/Excel çıktısının ekranla uyuşmaması | ➖ Faz 6 kapsamı (CRD-17 → RPT-13) |
| Kritik işlemde audit, yetki testi, hata/retry ekranı, kişisel veri maskelemesi eksikliği | ❌ yok — blokaj çağrısı audit izinde, SET-15 retry/DLQ ekranı, üye işyeri ve kart numarası maskeli |

**Sonuç: Faz 5 için üretime çıkış engeli YOKTUR. Faz kapanır.**

---

## 8. Faz 6'ya devreden

| # | Konu | Durum |
| --- | --- | --- |
| CRD-17 | Kart raporları — `RPT-13` takma adı; tek `ReportLayout` ile gelir | ⬜ Faz 6 |
| K-030 | Günlük rapor ve tüm PDF/Excel çıktıları `ReportLayout`'ta | 🟡 planlı |
| K-027 | Antivirüs taraması — entegrasyon adaptörü artık hazır, dosya servisi bağlanacak | 🟡 planlı |
| K-021 | E-posta gönderimi yok; davet/sıfırlama bağlantısı geliştirmede ekranda | 🟡 bilinçli |
| — | `httpAdaptoru` gerçek sağlayıcı kimliği olmadan çalışmaz; **sahte başarı üretmez**, yapılandırma hatası döner. Kurulumda `kimlik_referansi` ortam değişkeni tanımlanmalıdır | 🟡 kurulum işi |
