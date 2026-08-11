# FAZ 3 RAPORU — Proje ve saha (çekirdek)

**Tarih:** 2026-08-11 · **Dal:** `revizyon/faz-0-6` · **Şartname:** `docs/REVIZYON.md` §9 Faz 3
**Çıkış koşulu:** *"WBS tabanlı ilerleme; günlük rapor PDF; RFI/NCR uçtan uca; `/projeler/yeni` 200."*

> **Kapsam beyanı — dürüstlük notu.** Bu fazın **kabul kriterleri** (PRJ-01, PLAN-01, PLAN-02,
> SITE-01, QLT-01) karşılandı ve otomatik testle doğrulandı. Ancak Faz 3 kataloğundaki **89 sayfa
> ailesinin 34'ü** teslim edildi; kalan 49 aile (+ 14 HR ailesi) hâlâ `bekliyor` durumunda ve
> `PROGRESS.md`'de öyle işaretli. **Faz 3 tam kapanmadı; çekirdek dikey akış kapandı.**
> Günlük rapor **PDF çıktısı** Faz 6'daki `ReportLayout` ile gelecek (K-030).

---

## 1. Teslim edilen ekranlar (34 aile)

| Grup | Kodlar | Öne çıkan davranış |
| --- | --- | --- |
| Proje | PRJ-01..04 | `/projeler/yeni` **200 dönüyor ve kayıt oluşturuyor** — eski uygulamanın en somut bulgusu giderildi |
| Şantiye | SITE-01..03 | Yaşam durumu ile **takvim sağlığı ayrı sütunlarda** (dokümanın SITE-01 amacı) |
| Günlük rapor | SITE-06..08 | Çevrimdışı taslak kimliği; **çift senkronda tek kayıt**; onaydan sonra kilit |
| Saha bildirimi | SITE-09..11 | SLA **aciliyetten türetilir**, kullanıcı girmez; İSG/kritik bildirimler role yönlendirilir |
| İş programı | PLAN-01..04, 06, 09, 11 | WBS ağırlık kapısı, baz çizgi dondurma, ilerleme algoritması, sapma analizi |
| Görev | TASK-01..03 | Durum seçtirmeyen atama/havuz akışı; **gecikme hesaplanan işaret** |
| İSG | HSE-02..06 | Kaza kritik açılır ve yönetime bildirilir; etkinlik doğrulanmadan kapanmaz |
| Kalite | QLT-05..07 | NCR üç adımlı kapanış zinciri; DÖF tamamlayan etkinliği kendisi doğrulayamaz |
| Doküman | DOC-01..03 | (Faz 2'de teslim edildi, Faz 3 kataloğunda da sayılır) |

## 2. İlerleme algoritması (§5.5) — birebir uygulama

| Şart (doküman) | Uygulama | Test |
| --- | --- | --- |
| İlerleme elle yazılan tek yüzde değildir | Formda proje yüzdesi alanı **yok**; yalnız aktivite bazlı kayıt | ✅ |
| Onaylı WBS ağırlıkları toplamı %100 olmalı | `agirlikDogrula()` her kardeş kümesini ve yaprak aktivite kümesini denetler | ✅ |
| Aktivite ilerlemesi 3 yöntemden biriyle | `yontem`: miktar · kilometre taşı · süre | ✅ |
| `sum(WBS ağırlığı × onaylı aktivite ilerlemesi)` | Özyinelemeli ağırlıklı ortalama, binde tamsayı | ✅ %50 × %60 = %30 |
| Tahmin ve onaylı AYRI tutulur | `onayli` / `tahmini` iki ayrı hesap | ✅ |
| Baz çizgi ve dönem sürümü raporda görünür | Program sürümü ve baz çizgi tarihi her ekranda | ✅ |
| Hakedişe aktarım yalnız doğrulanmış miktarlardan | İlerleme onaylanmadan toplama girmiyor (Faz 4 hakediş bağı bu veriyi kullanacak) | ✅ |

## 3. Kabul testleri — 120/120 geçiyor

```
$ npm test
ℹ tests 120   ℹ pass 120   ℹ fail 0
```

| Test | Sonuç | Nasıl doğrulandı |
| --- | --- | --- |
| **PRJ-01** | ✅ | `/projeler/yeni` 200 · form gönderimi gerçek kayıt üretiyor (`PRJ-2026-0001`) · detaya yönlendiriyor · tutar tamsayı kuruş · eksik alanda 422 + alan hatası · formda durum alanı yok · denetçi geçiş yapamıyor · tanımsız geçiş 409 |
| **PLAN-01** | ✅ | WBS yokken 422 · ağırlık %90 iken 422 · yaprak aktivite ağırlığı %50 iken 422 · %100 olunca onaya gidiyor · onaylanınca **baz çizgi donduruluyor** · baz çizgi sonrası düzenleme 409 |
| **PLAN-02** | ✅ | Taslak ilerleme onaylı toplama **girmiyor** (0), tahminde görünüyor (%30) · doğrulanınca onaylıya geçiyor (%30) · kendi girdiğini doğrulayamıyor · geri gidiş 422 · kanıtsız kayıt 422 · baz çizgisiz program proje ilerlemesine katılmıyor · yüzdeler tamsayı |
| **SITE-01** | ✅ | Rapor kaydı + kod · **aynı çevrimdışı taslak ikinci kez senkronlanınca tek kayıt** ve kullanıcıya bildirim · aynı gün ikinci rapor 409 · gelecek tarih 422 · formda senkron kimliği var |
| **QLT-01** | ✅ | Kök neden/DÖF yokken kapatma 409 · DÖF tamamlanmadan etkinlik doğrulanamıyor 409 · DÖF tanımı yokken tamamlanamıyor 409 · **DÖF tamamlayan etkinliği kendisi doğrulayamıyor** 422 · farklı yetkili doğrulayınca zincir tamamlanıyor |
| AUTH-01, SEC-01, WF-01, WF-02, UI-01, UI-02, AUD-01 | ✅ | Faz 1-2'den regresyonsuz |

**Ek testler (yeşil):** görev formunda durum yok · sorumlusuz görev havuza düşüyor ve "açık"a
geçemiyor (ön koşul) · gecikme durum değil işaret · SLA aciliyetten türüyor (kritik = 1 gün) ·
kaza kritik açılıyor ve yönetime bildiriliyor · İSG olayı doğrulanmadan kapanmıyor ·
şantiye listesi durumu ve takvimi ayrı gösteriyor.

## 4. Bu fazda bulunan ve düzeltilen gerçek hatalar

| # | Bulgu | Etki | Düzeltme |
| --- | --- | --- | --- |
| 1 | `detay` kalıbı `guncelle` yetkisi üretmiyordu | **Hiçbir detay ekranında durum geçişi yapılamıyordu** — geçiş motoru erişilemezdi | `detay` kalıbına `guncelle` eklendi (K-028) |
| 2 | `gunluk_rapor`, `ilerleme`, `is_programi` durum tanımı yoktu | Bu kayıtların detay sayfası 500 veriyordu | `ONAYLI_TURLER`e eklendi |
| 3 | İş programı/günlük rapor için onay şablonu yoktu | Baz çizgi onaya gönderilemiyordu | Kurulum tohumuna `BAZ-CIZGI`, `ILERLEME`, `GUNLUK-RAPOR` şablonları eklendi |

## 5. Kırık link, yetkisiz erişim ve veri tutarlılığı

| Kontrol | Sonuç |
| --- | --- |
| Menüden erişilebilen tüm rotalar | Tümü `< 400` (otomatik test) |
| Uygulanmamış manifest rotası | Dürüst 404 (örn. `/kartlar` — Faz 5) |
| Denetçi durum geçişi | 403 |
| Baz çizgi sonrası program düzenleme | 409 |
| Aynı gün ikinci günlük rapor | 409 |
| Çift senkron | Tek kayıt |
| İlerleme geri gidişi | 422 |
| Denetim zinciri | Sağlam |
| Para/yüzde tipleri | Tamsayı (kuruş / binde) |

## 6. Görsel değerlendirme

`node tools/ss-eval.mjs` — 25 hedef × 1440/390px = 50 ekran görüntüsü.
Yatay taşma **0**, sayfa başına tek `<h1>`, etiketsiz form girdisi **0**.
Yeni ekranlar mevcut sayfa diline uyumlu; ek görsel bulgu çıkmadı.

## 7. Faz 3 durumu

| Çıkış koşulu | Durum |
| --- | --- |
| `/projeler/yeni` 200 dönüyor ve kayıt oluşturuyor | ✅ |
| WBS ağırlıkları 100 değilse baz çizgi onaya gidemiyor | ✅ |
| İlerleme `sum(WBS ağırlığı × onaylı aktivite ilerlemesi)` | ✅ |
| Günlük rapor çevrimdışı taslak + çift gönderimde tek kayıt | ✅ |
| NCR uçtan uca (DÖF + etkinlik doğrulaması) | ✅ |
| Günlük rapor **PDF** | ⏳ Faz 6 `ReportLayout` (K-030) |
| RFI uçtan uca | ⏳ QLT-10..12 henüz teslim edilmedi |
| Faz 3 kataloğunun tamamı (89 aile) | ⏳ 34 teslim · 55 bekliyor |

**Sonuç: FAZ 3 ÇEKİRDEĞİ KAPANDI, KATALOG AÇIK.**
Kalan Faz 3 aileleri: PRJ-05..10 · SITE-04, 05, 12..16 · PLAN-05, 07, 08, 10, 12 ·
TASK-04..09 · HSE-01, 07..12 · QLT-01..04, 08..14 · DOC-04..10 · HR-01..09.
