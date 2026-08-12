# FAZ 6 RAPORU — Rapor, mobil ve portallar

**Tarih:** 2026-08-12 · **Dal:** `revizyon/faz-0-6` · **Tag:** `faz-6-tamam`
**Kapsam:** doküman §9 Faz 6 · 27 sayfa ailesi
**Test:** 390/390 yeşil (`node --test`) · **Doğrulanan ekran:** **244/244**

---

## 1. Çıkış koşulu karşılandı mı?

| Kod | Kabul cümlesi | Durum | Kanıt |
| --- | --- | --- | --- |
| **RPT-01** | **Ekran, PDF ve Excel aynı filtre, veri tarihi, toplam ve rapor sürümünü taşır** | ✅ | `faz6.test.js` — PDF baytları açılır, XLSX ZIP'i çözülür, künyenin **her satırı** ekranla karşılaştırılır |
| RPT-02 | Ortak filtre, başlık, veri tarihi, dışa aktarım, yazdırma | ✅ | Tek `ReportLayout`; RPT-02 kanonik rotaya yönlendirir |
| RPT-15 | Formül sözlüğünden açıklanmış KPI | ✅ | Sözlük tanımlardan **üretilir**; formülsüz gösterge testte kırar |
| EXT-01..06 | Tokenli, kapsamı daraltılmış dış erişim | ✅ | `faz6.test.js` — açık token saklanmıyor, süre/tür/kapsam denetleniyor |
| EXT-07/08, AST-11 | Çevrimdışı taslak + senkron kuyruğu | ✅ | `faz6.test.js` — çift gönderimde tek kayıt |
| HR-14 | Yalnız kendi verisi | ✅ | `faz6.test.js` — başkasının kaydı ekrana girmiyor |
| GLB-07, SET-17 | Genel arama, arşiv ve saklama | ✅ | Arama yetkiyi aşmıyor; belge otomatik silinmiyor |

**Faz 6'nın 27 ailesinin tamamı teslim edildi.** Böylece manifestteki
**244 sayfa ailesinin hepsi** bir rotaya bağlandı ve doğrulandı.

---

## 2. Teslim edilen aileler

| Blok | Kodlar | Aile | Commit |
| --- | --- | --- | --- |
| ReportLayout ve raporlar | RPT-01..15 (+CRD-17 takma adı) | 15 | `faz6(RPT-01..15)` |
| Müşteri, fırsat, teklif | EXT-01..03 | 3 | `faz6(EXT…)` |
| Dış portallar | EXT-04..06 | 3 | `faz6(EXT…)` |
| Saha mobil, kiosk, QR | EXT-07, EXT-08, AST-11 | 3 | `faz6(EXT…)` |
| Self-servis, arama, arşiv | HR-14, GLB-07, SET-17 | 3 | `faz6(EXT…)` |
| **Toplam** | | **27** | |

---

## 3. "Ekran = PDF = Excel" nasıl garanti edildi

Bu, §11'in en kolay ihlal edilen maddesidir: dört çıktıyı dört ayrı kod yoluyla
üretmek, sapmayı **zamanla kaçınılmaz** yapar. Mimari buna izin vermiyor:

```
rapor.veri(ctx, filtre)          ← BİR KEZ çalışır
        ↓
{ satirlar, kpiler, veriTarihi } ← tek sonuç nesnesi
   ↓        ↓        ↓        ↓
 ekran     PDF     XLSX      CSV     ← dördü de AYNI nesneden serileşir
```

Künye (`kunyeSatirlari()`) da tek yerde üretilir: rapor kodu, şirket, filtre
özeti, veri tarihi, üretim zamanı, rapor sürümü, kayıt sayısı ve üreten kişi.
Dört çıktının hepsinde **aynı satırlar** görünür ve test bunu birebir
karşılaştırır (K-104).

### Çıktı üreteçleri sıfır bağımlılıkla yazıldı (K-102)

| Üreteç | Yaklaşım |
| --- | --- |
| `cekirdek/pdf.mjs` | Katalog + sayfa ağacı + Flate akış + Type1 taban font. **Tekrarlanan tablo başlığı**, sayfa numarası, A4 dikey/yatay, zebra satır. |
| `cekirdek/xlsx.mjs` | Elle yazılan ZIP kapsayıcı + SpreadsheetML. **Sayılar SAYI** (`<v>12.5</v>`), tarihler seri numara; başlık satırı dondurulmuş; KPI'lar formülüyle ayrı sayfada. |
| `csvUret()` | Noktalı virgül + BOM (Excel'in Türkçe yerel ayarı). |

**Türkçe karakter sorunu ve çözümü (K-103):** taban 14 fontun WinAnsi
kodlaması `ı ş ğ İ Ş Ğ` harflerini içermez. "Yaklaşık karşılık" koymak
(ı→i, ş→s) bir raporda kişi adını ve belge kodunu **bozar**; `?` basmak
okunmaz yapar. Çözüm `/Differences` kodlamasıdır: bu harfler (ve `Σ ≤ ≥ ≠`)
kullanılmayan kod noktalarına Adobe glif adlarıyla bağlandı. Testte PDF
baytları açılıp `Yapıtaş İnşaat A.Ş.` metni birebir aranıyor.

### Rapor ikinci bir hesap yazmaz (K-105)

| Rapor | Çağırdığı mevcut fonksiyon |
| --- | --- |
| RPT-03 | `plan/ilerleme.mjs` `projeIlerlemesi()` |
| RPT-06 | `finans/defter.mjs` `bakiyeler()` |
| RPT-08 | `stok/defter.mjs` `depoBakiyeleri()` |
| RPT-11 | `sozlesme/hakedis.mjs` `sozlesmeBedeli()`, `guncelBedel()`, `gerceklesmeBinde()` |
| RPT-13 | `kartlar/defter.mjs` `kartBakiyeleri()` |

RPT-15 formül sözlüğü de elle yazılmaz: rapor tanımlarından **üretilir**.
Formülsüz bir gösterge eklenirse sözlükte boş görünür ve test kırılır.

---

## 4. Kırık link taraması

Uygulanmış **244** ekran kodunun tamamı manifest rotasından gezildi.

| Bulgu | Adet | Değerlendirme |
| --- | --- | --- |
| 200 dönen statik rota | 175 | — |
| Parametreli (dinamik) rota | 64 | Kabul testlerinde ayrıca kanıtlandı |
| Kasıtlı durum kodu | 5 | `AUTH-06` 403 (kurulum bitti), `AUTH-07` 200, `AUTH-08` 403, `AUTH-09` 404, `AUTH-10` 503 |
| **Gerçek kırık link** | **0** | — |
| Uygulanmamış manifest rotası | **0** | 244/244 bağlı — `faz1.test.js` ve `faz6.test.js` bunu ayrıca iddia eder |

**Rapor çıktısı taraması:** 11 rapor × 3 biçim = **33 çıktı** üretildi;
hepsi 200 döndü ve doğru dosya imzasını taşıdı (`%PDF`, `PK`, CSV).

---

## 5. Yetkisiz erişim taraması

30 rol × rota kombinasyonu denendi; **30'u da 403** döndü.

| Kontrol | Sonuç |
| --- | --- |
| Rapor ekranları — depo, İK, çalışan, şantiye şefi | 403 ✅ |
| Hassas raporlar (nakit akışı, maliyet, kart) — satın alma | 403 ✅ (K-112) |
| Müşteri/fırsat/teklif — depo, İK, çalışan, şef | 403 ✅ |
| Portal erişim yönetimi — depo, İK, çalışan, şef | 403 ✅ |
| Arşiv işleri — depo, İK, çalışan, şef | 403 ✅ |
| Mobil ve kiosk — çalışan | 403 ✅ |
| Genel arama yetkiyi aşıyor mu? | Hayır — yetkisiz tür **hiç sorgulanmıyor** ✅ |
| Portal tokeni: yanlış tür / süresi dolmuş / kapatılmış | 404 / 403 / 403 ✅ |
| Self-servis başkasının kaydını gösteriyor mu? | Hayır ✅ |

### Bu fazda kapatılan bulgular

| # | Bulgu | Karar |
| --- | --- | --- |
| 1 | `portal` kalıbının eylem kümesi salt okunurdu; **hiç kimse portal bağlantısı üretemiyordu** | EXT-04..06 yönetim ekranıdır, `EKRAN_EYLEMLERI` ile `olustur`/`guncelle` verildi |
| 2 | Şantiye şefinin mobil ve kiosk yetkisi yoktu; sahadaki rol saha ekranını açamıyordu | `EXT-07`/`EXT-08` ekstra yetkisi eklendi — `dis` bölümünün tamamı değil, yalnız iki ekran |
| 3 | `rapor` bölümü olan her rol **tüm** raporları açabiliyordu; satın alma nakit akışını görüyordu | **K-112** — hassas raporlar `haric` ile kapatıldı (§5.7 en az yetki) |
| 4 | Demo `calisan` kullanıcısının personel kaydı yoktu; HR-14 kendi verisini bile gösteremiyordu | Demo tohumunda kullanıcı–personel bağı kuruldu |

---

## 6. Veri tutarlılığı

| Kural | Uygulama | Kanıt |
| --- | --- | --- |
| 1 — Tek manifest | **244/244** ekran kodu rotaya bağlı; test bunu iddia eder | `faz1.test.js`, `faz6.test.js` |
| 4 — Tek kanonik kayıt | Rapor ikinci hesap yazmaz; CRD-17 = RPT-13 takma adı; RPT-02 kanonik rotaya yönlendirir | `faz6.test.js` |
| 5 — Kullanıcı durum seçemez | Faz 6 yazma formlarında `durum`/`onayci` alanı yok; fırsat "kazanıldı" demek proje AÇMAKTIR | `faz6.test.js` |
| 6 — Onaylı kayıt değişmez | Arşiv işi karara bağlandıktan sonra yeniden karara bağlanamaz | `faz6.test.js` |
| **9 — Ekran = PDF = Excel** | Dört çıktı tek `veri()` çalıştırmasından; künye tek yerde | `faz6.test.js` |
| §3.4 — Print CSS | Yazdırmada rail, menü, üst bar, breadcrumb ve **tüm form kontrolleri** gizli; `thead` her sayfada yinelenir; `@page size: A4` | `faz6.test.js` |
| §3.5 — Sayfalama | Faz 6 listeleri ortak sayfalayıcı ve veri tarihi künyesi taşır | `faz6.test.js` |
| §7 — Zorunlu bağlar | Fırsat → proje · teklif → fırsat durumu · kiosk ziyaretçisi → şantiye kapanış engeli · mobil bildirim → saha bildirimi | `faz6.test.js` |

---

## 7. Üretime çıkış engelleri (§12)

| Engel | Durum |
| --- | --- |
| P0 rotada 404, WIP bağlantısı, yalnızca toast üreten işlem | ❌ yok — 244 ekran gezildi, 0 kırık link, WIP metni yok |
| localStorage tabanlı iş kaydı | ❌ yok |
| Query parametresi/istemci deposuyla rol, tenant, kapsam değiştirme | ❌ yok |
| Onaylı kaydın sürüm açmadan düzenlenmesi | ❌ yok |
| Stok/finans/kart bakiyesinin defterden üretilememesi | ❌ yok — üç defter de sütunsuz, raporlar da o defterlerden okuyor |
| Pluxee/MultiNet idempotency, durum sorgusu, kısmi sonuç | ❌ yok (Faz 5) |
| **Rapor PDF/Excel çıktısının ekran filtresi, veri tarihi veya toplamlarıyla uyuşmaması** | ❌ yok — **testte birebir karşılaştırıldı** |
| Kritik işlemde audit, yetki testi, hata/retry ekranı, kişisel veri maskelemesi eksikliği | ❌ yok — rapor dışa aktarımı bile audit izinde (biçim, filtre, veri tarihi, kayıt sayısı) |

**Sonuç: Faz 6 için üretime çıkış engeli YOKTUR. Faz ve revizyon turu kapanır.**

---

## 8. Revizyon turu kapanışı

| Faz | Aile | Tag |
| --- | --- | --- |
| Faz 0 — Envanter ve yönlendirme | — | `faz-0-tamam` |
| Faz 1 — Temel platform | 22 | `faz-1-tamam` |
| Faz 2 — İş akışı omurgası | 14 | `faz-2-tamam` |
| Faz 3 — Proje ve saha | 89 | `faz-3-tamam` |
| Faz 4 — Tedarik ve finans | 69 | `faz-4-tamam` |
| Faz 5 — Kartlar | 23 | `faz-5-tamam` |
| Faz 6 — Rapor, mobil, portallar | 27 | `faz-6-tamam` |
| **Toplam** | **244** | |

**390 test / 0 hata · sıfır npm bağımlılığı · build adımı yok.**

### Bilinçli açık uçlar (gizlenmedi, kayıt altında)

| # | Konu | Neden bilinçli |
| --- | --- | --- |
| K-021 | E-posta gönderimi yok; davet, şifre sıfırlama ve portal bağlantısı ekranda **bir kez** gösteriliyor | Gerçek SMTP olmadan "gönderildi" demek sahte başarı olurdu (kural 3) |
| K-027 | Antivirüs taraması dosya yüklemede bağlı değil | Adaptör sözleşmesi (`kartlar/adaptor.mjs`) artık hazır; bağlanacak nokta belli |
| — | `httpAdaptoru` gerçek sağlayıcı kimliği olmadan çalışmaz | **Sahte başarı üretmiyor**, yapılandırma hatası dönüyor; kurulumda `kimlik_referansi` ortam değişkeni tanımlanmalı |
| RPT-14 | Zamanlanmış rapor tanımı saklanıyor, gönderim yok | K-021'in sonucu; kayıtlar "gönderildi" işaretlenmiyor |
