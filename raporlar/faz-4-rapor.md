# FAZ 4 RAPORU — Tedarik ve finans

**Tarih:** 2026-08-12 · **Dal:** `revizyon/faz-0-6` · **Tag:** `faz-4-tamam`
**Kapsam:** doküman §9 Faz 4 — "Tedarik ve finans" · 69 sayfa ailesi
**Test:** 306/306 yeşil (`node --test`, 76 suite) · **Doğrulanan ekran:** 194/244

---

## 1. Çıkış koşulu karşılandı mı?

PLAN.md'deki Faz 4 çıkış koşulu: *"Üçlü eşleştirme; değişmez stok/finans defteri."*

| Koşul | Durum | Kanıt |
| --- | --- | --- |
| Onaysız talep siparişe dönüşmüyor (PRC-01) | ✅ | `faz4a.test.js` |
| Stok bakiyesi hareket defterinden yeniden hesaplanıyor (STK-01) | ✅ | `faz4a.test.js` |
| Onaylı metraj ve ilerlemeden hakediş üretimi (CNT) | ✅ | `faz4b.test.js` |
| Üçlü eşleştirme; tolerans dışı fark onaya gidiyor (FIN-14) | ✅ | `faz4b.test.js` |
| Kasa/banka/cari bakiyesi defterden türer, ters kayıtla düzeltilir | ✅ | `faz4b.test.js` |
| Varlık, zimmet, bakım ve filo (AST) | ✅ | `faz4c.test.js` |
| İzin, avans, sağlık, yetkinlik (HR-10..13) | ✅ | `faz4c.test.js` |
| Günlük özet ve yönetici kontrol merkezi (GLB-02/03) | ✅ | `faz4c.test.js` |
| **K-049 — kapanış engellerinin gerçek sorguya bağlanması** | ✅ **kapandı** | `faz4c.test.js`, `faz3e.test.js` |

Faz 4'ün 69 ailesinin **tamamı** uygulandı ve otomatik kabul testiyle doğrulandı.
Faz 4 kapanışına girerken `bitti` (elle doğrulanmış, otomatik testi yok) durumunda
kalan 16 aile — AST-01..10, HR-10..13, GLB-02/03 — `tests/kabul/faz4c.test.js`
yazılarak `doğrulandı` durumuna alındı.

---

## 2. Teslim edilen aileler

| Blok | Kodlar | Aile | Commit |
| --- | --- | --- | --- |
| Satın alma ve tedarik | PRC-01..13 | 13 | `faz4a` |
| Depo, stok ve teslim | STK-01..10 | 10 | `faz4a` |
| Sözleşme, metraj, hakediş | CNT-01..15 | 15 | `faz4b` |
| Finans, bütçe, muhasebe hazırlığı | FIN-01..15 | 15 | `faz4b` |
| Varlık, ekipman ve filo | AST-01..10 | 10 | `faz4c` |
| İK — finans etkili | HR-10..13 | 4 | `faz4c` |
| Panolar | GLB-02, GLB-03 | 2 | `faz4c` |
| **Toplam** | | **69** | |

`AST-11` (QR/barkod) ve `HR-14` (çalışan self-servis) Faz 6'ya aittir; Faz 4
kapsamında değildir.

---

## 3. Kabul testleri (§11)

| Kod | Kabul cümlesi | Test | Sonuç |
| --- | --- | --- | --- |
| PRC-01 | Onaysız talep siparişe dönüşmez; tolerans dışı fatura ödemeye geçmez | `faz4a.test.js` | ✅ |
| STK-01 | Stok bakiyesi defterle yeniden hesaplandığında ekrandakiyle aynıdır | `faz4a.test.js` | ✅ |
| — | Çıkış hareketi depoyu eksiye düşüremez (K-063) | `faz4a.test.js` | ✅ |
| — | Kör sayım: defter bakiyesi formda gösterilmez, fark onaydan sonra yazılır | `faz4a.test.js` | ✅ |
| — | Transferde teslim alan, sevk edenden farklı olmalı (dört göz, K-067) | `faz4a.test.js` | ✅ |
| — | Sözleşme bedeli pozlardan türer; onaylı sözleşmeye poz eklenemez | `faz4b.test.js` | ✅ |
| — | Hakediş satırları onaylı metrajın kümülatifinden üretilir (K-073) | `faz4b.test.js` | ✅ |
| — | Zeyil sözleşmeyi yerinde değiştirmez; güncel bedel türetilir (K-074) | `faz4b.test.js` | ✅ |
| FIN-14 | Üçlü eşleştirme sonucu hesaplanır; tolerans dışı fark onaya gider | `faz4b.test.js` | ✅ |
| FIN-11/15 | Onaysız faturaya ödeme açılmaz; engelli dönem kapanmaz; kapatan tek başına yeniden açamaz | `faz4b.test.js` | ✅ |
| — | Araç ayrı tablo değil (`varlik.tur='arac'`); bakım iş emri ayrı tablo değil | `faz4c.test.js` | ✅ |
| — | Sayaç geri alınamaz; plakasız araç kaydedilemez | `faz4c.test.js` | ✅ |
| — | Çakışan zimmet 409; zimmetli varlık satılamaz | `faz4c.test.js` | ✅ |
| — | Uygunsuz periyodik kontrol → kullanım dışı + onarım iş emri (§7) | `faz4c.test.js` | ✅ |
| — | Kaza kaydı otomatik İSG olayı açar (§7) | `faz4c.test.js` | ✅ |
| — | Çakışan izin 409; mahsupsuz ikinci avans 409; süresiz sağlık 422 | `faz4c.test.js` | ✅ |
| — | Çalışan yalnız kendi kaydını görür (ABAC `kendi_kaydi`) | `faz4c.test.js` | ✅ |
| — | Panonun kendi tablosu ve yazma formu yoktur; her sayı canlı sorgu | `faz4c.test.js` | ✅ |
| — | K-049: kapanış engelleri defterden hesaplanır, engel varken kapanış 409 | `faz4c.test.js` | ✅ |
| WF-01 | Talep sahibi durum/onaycı seçemez (tüm `app/**` taranır) | `faz2.test.js` | ✅ |
| AUD-01 | Kritik kayıtta değişmez audit izi | `faz1.test.js` | ✅ |

**Toplam:** 306 test / 76 suite / 0 hata.

---

## 4. Kırık link taraması

Uygulanmış **194** ekran kodunun tamamı manifest rotasından gezildi.

| Bulgu | Adet | Değerlendirme |
| --- | --- | --- |
| 200 dönen statik rota | 133 | — |
| Kasıtlı durum kodu | 4 | `AUTH-07` 200, `AUTH-08` 403, `AUTH-09` 404, `AUTH-10` 503 — doğru davranış |
| Parametreli (dinamik) rota | 56 | Örnek kayıt gerektirir; ilgili kabul testlerinde ayrıca kanıtlandı |
| Ön koşullu rota | 1 | `AUTH-06 /ilk-kurulum` → 403: kurulum tamamlandıktan sonra erişimin kapanması **beklenen** davranış |
| **Gerçek kırık link** | **0** | — |

Uygulanmamış manifest rotalarından örneklenen **42/42**'si dürüst **404**
döndürdü (K-018) ve rail/menüde görünmüyor — kullanıcı ölü bağlantı göremez.

---

## 5. Yetkisiz erişim taraması

31 rol × rota kombinasyonu denendi; **30**'u 403 döndü. Tek istisna
`calisan → /izinler = 200`, bu **tasarım gereğidir**: çalışan rolünün
`HR-10:goruntule` ekstra yetkisi vardır ve liste `kendi_kaydi` ABAC kuralıyla
yalnız kendi kayıtlarına daraltılır (aynı test dosyasında ayrıca doğrulanır).

| Kontrol | Sonuç |
| --- | --- |
| Finans ekranları (`/butceler`, `/kasalar`, `/faturalar`) — depo, satın alma, İK, çalışan | 403 ✅ |
| Varlık ekranları (`/varliklar`, `/zimmetler`) — finans, İK, çalışan | 403 ✅ |
| Sözleşme/hakediş — depo, satın alma, çalışan | 403 ✅ |
| İK ekranları — depo sorumlusu | 403 ✅ |
| Yönetici kontrol merkezi (`/panel/yonetici`) — çalışan | 403 ✅ |
| `?role=`, `?rol=`, `?tenant=` ile rol/tenant değiştirme | Etkisiz — rol sabit kaldı ✅ |

### Bu fazda kapatılan üç gerçek güvenlik/dürüstlük açığı

| # | Bulgu | Karar |
| --- | --- | --- |
| 1 | `AST-02 /varliklar/yeni` GET işleyicisi `yetkiZorunlu` çağırmıyordu; yalnız `calisma` bölümüne yetkili `calisan` rolüne **200** dönüyordu. | **K-081** — yetki artık `ekranRota()` içinde, işleyiciden önce zorunlu; manifestte `acik` olmayan her ekran kendi `yetki` alanını uygular. İşleyicilerdeki mevcut çağrılar ikinci savunma katmanı olarak duruyor. |
| 2 | İzin formundaki "Vekil" açılır kutusu **tüm personelin** kodunu ve adını sayıyordu; liste ABAC ile daraltılıyorken kutu sızdırıyordu. | **K-083** — kapsam yalnız listede değil, kaydın göründüğü her yerde uygulanır. |
| 3 | Formdan **eksik** gelen bir kimlik alanı `node:sqlite`'ta `TypeError` üretip **500 SUNUCU_HATASI** dönüyordu (`/stok/sarf`, `/butceler`). | **K-082** — veri katmanı `undefined`'ı `null`'a çevirir; sorgu boş döner, çağıran kendi 422/404'ünü üretir. Kullanıcı gerçek hata kodunu görür (kural 3). |

---

## 6. Veri tutarlılığı

| Kural | Uygulama | Kanıt |
| --- | --- | --- |
| 4 — Tek kanonik kayıt/API | Araç = `varlik.tur='arac'`; bakım iş emri = `is_emri.varlik_id`; sağlık = `yetkinlik.tur='saglik'`. Ayrı `arac`, `bakim_is_emri`, `saglik_kaydi` tablosu **yok** (testte iddia edilir) | `faz4c.test.js` |
| 5 — Kullanıcı durum/onaycı seçemez | Faz 4 yazma formlarında `name="durum"` / `name="onayci"` yok | `faz4a/b/c.test.js` |
| 6 — Onaylı kayıt yerinde değişmez | Onaylı sözleşmeye poz eklenemez; zeyil ayrı sürüm; onaylı bütçe revizyon ister (FIN-03) | `faz4b.test.js` |
| **7 — Bakiye hareket defterinden türer** | `stok_karti`'nda "mevcut miktar", `kasa`'da "bakiye" **sütunu yoktur**. `stok_hareketi`, `kasa_hareketi`, `banka_hareketi`, `cari_hareket` veritabanı **tetikleyicisiyle** değişmez; düzeltme yalnız ters kayıt | K-061, K-071; `faz4a/b.test.js` |
| 8 — Idempotency + sürüm + audit | `kayitModulu` üreteci tüm yazmalarda uygular; defter yazımları audit'e `defter:<tür>` olarak düşer | `faz4a/b/c.test.js` |
| 10 — Para tamsayı kuruş, miktar tamsayı binde | `*_minor` ve `*_binde` sütunları INTEGER; kayan nokta yok | K-004, K-062 |
| §7 — Zorunlu hedef bağlantılar | Mal kabul reddi → karantinalı NCR · Sipariş → mal kabul → fatura üçlü eşleştirme · Uygunsuz varlık kontrolü → kullanım engeli + iş emri · Kaza → İSG olayı · RFI yanıtı → değişiklik talebi · **Şantiye/proje kapanış → stok, varlık, kasa, sözleşme, bütçe** | K-066, K-075, `faz4c.test.js` |

### K-049 — kapanış engelleri artık gerçekten denetleniyor

Faz 4 boyunca `moduller/santiye/kapanis.mjs` ve `moduller/proje/kapanis.mjs`
içinde `planli: 'Faz 4'` yer tutucuları duruyordu. Bunlar **bilinçli, kaldırılamaz
engellerdi**: besleyen modül gelmeden bir kontrolü "temiz" göstermek §12'nin
dürüstlük yasağını ihlal ederdi. Faz 4 kapanışında hepsi gerçek sorguya bağlandı.

| Kapanış | Denetlenen engeller |
| --- | --- |
| Şantiye (SITE-16) | Depo stok bakiyesi · açık rezervasyon · yolda transfer · iade edilmemiş zimmet · şantiyede duran varlık · açık bakım iş emri · sıfırlanmamış kasa bakiyesi · kapatılmamış kasa |
| Şantiye açılış (SITE-05) | Depo kurulumu · kasa kurulumu (uyarı düzeyi) |
| Proje (PRJ-09) | Karara bağlanmamış hakediş/metraj/zeyil/değişiklik · iade edilmemiş teminat · onayda bekleyen bütçe · kapanmamış fatura/ödeme talebi · sıfırlanmamış proje kasası |
| İşe giriş (HR-05) | Zimmet teslimi bağlandı; **kart teslimi (CRD-06) dürüstçe Faz 5'te** |

Stok ve kasa bakiyeleri `stok/defter.mjs` ve `finans/defter.mjs`'ten okunur;
kapanış modülünde **ikinci bir toplama yazılmadı** (kural 4 + kural 7).

`planli` mekanizmasının kendisi kodda **kalmaya devam ediyor**: bağlanmamış bir
kontrolün asla "temiz" görünmemesini garanti eden dürüstlük kapısıdır ve Faz 5
kart teslimi adımında hâlâ kullanılıyor.

---

## 7. Çıktı kontrolü

| Çıktı | Durum |
| --- | --- |
| Stok hareket defteri dökümü (yürüyen bakiye) | ✅ Ekranda toplanır, saklanmaz — defterle ekran ayrışamaz |
| Kasa/banka/cari dökümü (yürüyen bakiye) | ✅ Aynı sözleşme |
| Hakediş icmali (brüt, kesinti, net) | ✅ Tamamı `sozlesme/hakedis.mjs`'ten hesaplanır; formda tutar alanı yok |
| Üçlü eşleştirme farkı | ✅ Hesaplanır; kullanıcı "eşleşti" diyemez (K-075) |
| PDF / Excel | ⏭️ Faz 6 tek `ReportLayout` (K-030) — Faz 4'te bilinçli olarak üretilmedi |

---

## 8. Üretime çıkış engelleri (§12)

| Engel | Durum |
| --- | --- |
| P0 rotada 404, WIP bağlantısı, yalnızca toast üreten işlem | ❌ yok — 194 ekranın tamamı gezildi; uygulanmamış rota dürüst 404 ve menüde görünmüyor |
| localStorage tabanlı iş kaydı | ❌ yok — `localStorage` yalnız menü genişliği gibi arayüz tercihi |
| Query parametresi/istemci deposuyla rol, tenant, proje, onay durumu değiştirme | ❌ yok — `?role=`, `?rol=`, `?tenant=` denendi, etkisiz |
| Onaylı sözleşme/bütçe/iş programı/hakediş sürüm açmadan düzenleme | ❌ yok — sözleşme, zeyil, bütçe revizyonu ve hakediş korumalı |
| **Stok/finans bakiyesinin defterden yeniden üretilememesi** | ❌ yok — bakiye sütunu **hiç yok**; defter tetikleyiciyle değişmez, düzeltme ters kayıt |
| Pluxee/MultiNet idempotency | ➖ Faz 5 kapsamı |
| Rapor PDF/Excel çıktısının ekranla uyuşmaması | ➖ Faz 6 kapsamı (K-030) |
| Kritik işlemde audit, yetki testi, hata/retry ekranı, kişisel veri maskelemesi eksikliği | ❌ yok — bu fazda bulunan üç açık (K-081, K-082, K-083) kapatıldı; ücret/IBAN/T.C. no maskeleri yerinde |

**Sonuç: Faz 4 için üretime çıkış engeli YOKTUR. Faz kapanır.**

---

## 9. Faz 5'e devreden bilinen açık uçlar

| # | Konu | Durum |
| --- | --- | --- |
| K-030 | Günlük rapor ve tüm PDF/Excel çıktıları Faz 6 `ReportLayout`'ta | 🟡 planlı |
| K-027 | Antivirüs taraması Faz 5 entegrasyon adaptörüne bağlanacak | 🟡 planlı |
| K-021 | E-posta gönderimi yok; davet/sıfırlama bağlantısı geliştirmede ekranda | 🟡 bilinçli |
| HR-05 | İşe giriş sihirbazında **kart teslimi** adımı `planli` — CRD-06 ile bağlanacak | 🟡 planlı |
| HR-06 | İşten ayrılış sihirbazı Faz 5'te; kişiye bağlı kartlar dondurulmadan tamamlanamaz (§6.3) | ⬜ Faz 5 |
