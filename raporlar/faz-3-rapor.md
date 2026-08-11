# FAZ 3 RAPORU — Proje ve saha

**Tarih:** 2026-08-11 · **Dal:** `revizyon/faz-0-6` · **Tag:** `faz-3-tamam`
**Kapsam:** doküman §9 Faz 3 — "Proje ve saha" · 89 sayfa ailesi
**Test:** 213/213 yeşil (`node --test`) · **Doğrulanan ekran:** 125/244

---

## 1. Çıkış koşulu karşılandı mı?

PLAN.md'deki Faz 3 çıkış koşulu: *"`/projeler/yeni` 200; WBS tabanlı ilerleme; günlük rapor PDF."*

| Koşul | Durum | Kanıt |
| --- | --- | --- |
| `/projeler/yeni` 200 dönüyor ve gerçek kayıt oluşturuyor | ✅ | `tests/kabul/faz3.test.js` — PRJ-01 |
| WBS tabanlı ilerleme (`sum(ağırlık × onaylı ilerleme)`) | ✅ | `tests/kabul/faz3.test.js` — PLAN-01, PLAN-02 |
| Günlük rapor PDF | ⏭️ **Faz 6'ya devredildi (K-030)** | Tek `ReportLayout` kuralı (kural 9); ayrı PDF üretici ikinci çıktı yolu doğururdu |

Diğer tüm Faz 3 aileleri (89/89) uygulandı ve doğrulandı.

---

## 2. Teslim edilen aileler

| Blok | Kodlar | Aile | Commit |
| --- | --- | --- | --- |
| Proje çekirdeği | PRJ-01..04 | 4 | `faz3` |
| Şantiye ve saha | SITE-01..03, 06..11 | 9 | `faz3` |
| İş programı ve ilerleme | PLAN-01..04, 06, 09, 11 | 7 | `faz3` |
| Görev | TASK-01..03 | 3 | `faz3` |
| İSG olayları | HSE-02..06 | 5 | `faz3` |
| Kalite ve teknik | QLT-01..14 | 14 | `faz3`, `faz3b` |
| Doküman ve çizim | DOC-01..10 | 10 | `faz3`, `faz3c` |
| **İK** | **HR-01..05, 07..09** | **8** | **`faz3d`** |
| **Şantiye tamamlama** | **SITE-04, 05, 12..16** | **7** | **`faz3e`** |
| **Plan/görev/İSG/proje kalanları** | **PLAN-05/07/08/10/12 · TASK-04..09 · HSE-01/07..12 · PRJ-05..10 · GLB-08** | **25** | **`faz3f`** |
| **Toplam** | | **89** | |

---

## 3. Kabul testleri (§11)

Faz 3'e ait kabul maddeleri ve karşılık gelen otomatik testler:

| Kod | Kabul cümlesi | Test | Sonuç |
| --- | --- | --- | --- |
| PRJ-01 | Yeni proje formu 200 döner ve kayıt oluşturur | `faz3.test.js` | ✅ |
| PLAN-01 | WBS ağırlığı 100 değilse baz çizgi onaya gitmez | `faz3.test.js` | ✅ |
| PLAN-02 | İlerleme = Σ(WBS ağırlığı × onaylı aktivite ilerlemesi) | `faz3.test.js` | ✅ |
| SITE-01 | Günlük rapor çevrimdışı taslak; çift gönderimde tek kayıt | `faz3.test.js` | ✅ |
| QLT-01 | NCR, DÖF ve etkinlik doğrulaması olmadan kapanmaz | `faz3.test.js` | ✅ |
| — | Uygunsuz muayene/test otomatik NCR açar (§7) | `faz3b.test.js` | ✅ |
| — | Submittal kararı sürümle dondurulur | `faz3b.test.js` | ✅ |
| — | Transmittal teslim kanıtı olmadan "teslim edildi" olamaz | `faz3c` bloğu | ✅ |
| HR-05 | İşe giriş eksik adımla tamamlanamaz | `faz3d.test.js` | ✅ |
| HR-07 | Çakışan aktif atama reddedilir | `faz3d.test.js` | ✅ |
| HR-08 | Personel-gün tekil; kilitli satır değişmez | `faz3d.test.js` | ✅ |
| HR-09 | Dönem onaysız kapanmaz; kapanış satırları kilitler | `faz3d.test.js` | ✅ |
| SITE-05 | Açılış kontrolü tamamlanmadan şantiye aktifleşmez | `faz3e.test.js` | ✅ |
| SITE-16 | §7 engel listesi sıfırlanmadan şantiye kapanmaz | `faz3e.test.js` | ✅ |
| PLAN-07 | Onaylı baz çizgi yerinde değişmez; revizyon yeni sürüm açar | `faz3f.test.js` | ✅ |
| TASK-09 | Karar göreve bağlanmadan toplantı kapanmaz | `faz3f.test.js` | ✅ |
| PRJ-09 | Şantiyeler kapanmadan proje kapanmaz | `faz3f.test.js` | ✅ |

**Toplam:** 213 test / 50 suite / 0 hata.

---

## 4. Kırık link taraması

Uygulanmış 125 ekran kodunun tamamı gezildi (`uygulananKodlar()` × manifest rotası).

| Bulgu | Adet | Değerlendirme |
| --- | --- | --- |
| 200 dönen ekran | 113 | — |
| Kasıtlı durum kodu (`/403`, `/404`, `/bakim`) | 3 | Doğru davranış; bu ekranların işi o kodu döndürmektir |
| Tarama betiğinin örnek kayıt üretemediği dinamik rota | 9 | İlgili kabul testlerinde ayrıca kanıtlandı (SITE-08/11, PLAN-10, HSE-06, QLT-07/12, DOC-05, AUTH-03/04) |
| **Gerçek kırık link** | **0** | — |

Uygulanmamış manifest rotaları K-018 gereği **dürüst 404** döndürür ve rail/menüde
görünmez; kullanıcı ölü bağlantı göremez.

---

## 5. Yetkisiz erişim taraması

| Kontrol | Sonuç |
| --- | --- |
| İK ekranları (`/personel`, `/personel-atamalari`, `/puantaj`) — depo sorumlusu | 403 ✅ |
| Şantiye tamamlama ekranları — satın alma sorumlusu | 403 ✅ |
| İSG ve görev ekranları — finans sorumlusu | 403 ✅ |
| Kalite ve doküman ekranları — yetkisiz rol | 403 ✅ (`faz3b`) |
| Rol/tenant/kapsam query parametresinden okunuyor mu? | Hayır — `yetkiProfili()` yalnız oturum + veritabanı ✅ |
| Kapsam sütunu olmayan tabloda kapsamlı rol | Boş küme (`1 = 0`) — K-042 ✅ |
| Hassas alan (`maas`, `banka_iban`, `tc_no`) maskeli rolde POST edilebiliyor mu? | Hayır — `girdiCoz` yok sayıyor, K-039 ✅ |

---

## 6. Veri tutarlılığı

| Kural | Uygulama | Kanıt |
| --- | --- | --- |
| 5 — Kullanıcı durum/onaycı seçemez | Kaynak kod taraması: hiçbir dosyada `name="durum"` yazma formu yok | `faz2.test.js` WF-01 (tüm `app/**` taranır) |
| 6 — Onaylı kayıt yerinde değişmez | Baz çizgi → revizyon sürümü (PLAN-07); submittal kararı; kapalı toplantı tutanağı; kilitli puantaj | `faz3f`, `faz3b`, `faz3d` |
| 8 — Idempotency + sürüm + audit | `kayitModulu` üreteci tüm yazmalarda uygular; 409 testleri | `faz3d`, `faz3e` |
| 10 — Binde tamsayı ilerleme / uygunluk | `yuzde_binde`, `agirlik`, `puan_binde` INTEGER | K-029 |
| §5.2 — İşaret saklanmaz, hesaplanır | `gecikmis`, `sla_asildi`, belge "süresi doldu", ziyaretçi "sahada" | K-051, K-052 |
| §7 — Zorunlu hedef bağlantılar | Uygunsuz test/muayene → NCR; uygunsuz denetim → İSG olayı; toplantı kararı → görev; aktivite → görev | K-034, K-054, K-056 |

**Değişmez defter kontrolü:** Faz 3'te para/stok defteri kapsam dışıdır (Faz 4).
İlerleme yüzdesi ise saklanan bir toplam değil, onaylı `ilerleme` satırlarından
her okumada yeniden hesaplanır (`programIlerlemesi`, `projeIlerlemesi`).

---

## 7. Çıktı kontrolü

| Çıktı | Durum |
| --- | --- |
| PLAN-12 CSV dışa aktarım | ✅ Künye taşıyor (program kodu, sürüm, baz çizgi tarihi, veri tarihi); `Content-Disposition` ile iniyor |
| PLAN-12 CSV içe aktarım | ✅ Kuru çalıştırma + hep-ya-da-hiç uygulama; baz çizgili programda kapalı |
| HSE-12 istatistik | ✅ Her KPI formülüyle birlikte; rapor künyesi (filtre, veri tarihi, kayıt sayısı, rapor sürümü) |
| PDF / Excel | ⏭️ Faz 6 `ReportLayout` (K-030) — Faz 3'te bilinçli olarak üretilmedi |

---

## 8. Üretime çıkış engelleri (§12)

| Engel | Durum |
| --- | --- |
| P0 rotada 404, WIP bağlantısı, yalnızca toast üreten işlem | ❌ yok — uygulanmamış rota dürüst 404, menüde görünmez (K-018); tüm sihirbaz adımları gerçek kayıttan hesaplanır (K-044, K-048) |
| localStorage tabanlı iş kaydı | ❌ yok — `localStorage` yalnız kişisel arayüz tercihi (menü genişliği) |
| Query parametresi/istemci deposuyla rol, tenant, proje, onay durumu değiştirme | ❌ yok — hepsi sunucuda oturumdan çözülür |
| Onaylı kayıt sürüm açmadan düzenleme | ❌ yok — baz çizgi, submittal, kabul, kapalı toplantı, kilitli puantaj korumalı |
| Bakiyenin hareket defterinden üretilememesi | ➖ Faz 4 kapsamı; Faz 3'te para defteri yok |
| Pluxee/MultiNet idempotency | ➖ Faz 5 kapsamı |
| Rapor çıktısının ekran filtresiyle uyuşmaması | ❌ yok — CSV ve HSE-12 aynı sorgudan; PDF/Excel Faz 6 |
| Kritik işlemde audit, yetki testi, hata ekranı, kişisel veri maskelemesi eksikliği | ❌ yok — K-039/K-040 ile ücret, IBAN ve T.C. no maskeli; her yazma audit'e düşüyor |

**Sonuç: Faz 3 için üretime çıkış engeli YOKTUR.**

---

## 9. Faz 4'e devredilen bağlar

Faz 3'te **kaldırılamaz engel** olarak listelenen, Faz 4'te gerçek sorguya bağlanacak kalemler
(K-049 — "denetlenmedi" gibi gösterilmez, temiz sayılmaz):

| Ekran | Engel kalemi | Bağlanacağı modül |
| --- | --- | --- |
| SITE-05 | Depo ve kasa kurulumu | STK-01, FIN-05 |
| SITE-16 | Stok bakiyesi sıfırlandı | STK-01..10 |
| SITE-16 | Varlık ve zimmet iadesi | AST-01..10 |
| SITE-16 | Kasa bakiyesi ve mutabakat | FIN-05/06 |
| PRJ-09 | Sözleşme ve hakediş kapanışı | CNT-01..15 |
| PRJ-09 | Bütçe ve maliyet kapanışı | FIN-02, FIN-15 |
| HR-05 | Zimmet ve kart teslimi | AST-04 (Faz 4), CRD-06 (Faz 5) |
| QLT-12 | RFI yanıtının tetiklediği değişiklik talebi | CNT-10 |

Bu bağların hepsi `moduller/santiye/kapanis.mjs` ve `moduller/proje/kapanis.mjs`
içinde **tek yerde** durur; Faz 4'te yalnız bu iki dosyadaki satırlar gerçek sorguyla
değiştirilecektir.

---

## 10. Faz 3'te alınan kararlar

`KARARLAR.md` K-039 … K-058 (20 karar). Öne çıkanlar:

- **K-039/K-040** — Hassas alan maskesi hem okuma hem yazma kapatır; ücret, IBAN ve
  T.C. no operasyon rollerinde maskeli.
- **K-041/K-042** — Kapsam çözücü mekanizması; kapsam sütunu olmayan tabloda
  kapsamlı rol boş küme görür.
- **K-047** — Puantaj dönem kapanışı onay motorundan geçer ve satırları kilitler.
- **K-048/K-050** — Açılış/kapanış engelleri tek yerde; hem ekran hem geçiş motoru
  aynı listeyi kullanır, detay ekranından atlanamaz.
- **K-049** — Bağlanmamış kontrol kalemi kaldırılamaz engeldir.
- **K-055** — Program revizyonu yeni sürüm açar; ilerleme eski sürümde kalır.
- **K-057** — Toplu üretim ve içe aktarım önce kuru çalıştırma yapar; hep ya da hiç.
