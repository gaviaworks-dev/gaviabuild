# PLAN — GaviaBuild revizyonu (Faz 0 → Faz 6)

Bağlayıcı şartname: `docs/REVIZYON.md` (629 satır). Ek bağlam: `docs/REVIZYON-video-20260805.md`.
Mimari kararlar: `KARARLAR.md`. Anlık durum: `PROGRESS.md`.
Dal: `revizyon/faz-0-6`. Commit biçimi: `faz<N>(<KOD>): <ne yapıldı>`. Faz sonu tag: `faz-<N>-tamam`.

> **Her oturuma bu üç dosyayı okuyarak başla. Asla baştan başlama.**

## Değişmez kurallar (her iş paketinin kabul ön şartı)

1. Tek `screen-manifest`; menü/rota/breadcrumb/yetki/bayrak/analitik/test aynı manifestten türer.
2. localStorage/sessionStorage/query parametresi rol, tenant veya yetki kaynağı değildir.
3. Sahte başarı bildirimi yok; her eylem gerçek API sonucu ve gerçek hata kodu üretir.
4. Liste/form/detay/rapor/çıktı tek kanonik kayıt ve API kullanır.
5. Kullanıcı onay durumunu, nihai durumu veya keyfi onaycıyı seçemez.
6. Onaylı kayıt yerinde değiştirilmez; revizyon açılır.
7. Finans/stok/kart bakiyesi değişmez hareket defterinden türetilir.
8. Kritik yazmalarda idempotency key + optimistic concurrency (version) + audit.
9. Tüm raporlar tek `ReportLayout`; ekran = PDF = Excel.
10. Para = tamsayı minor unit + para birimi; zaman = UTC; her kayıtta created/updated/version/status/tenant_id.

---

## FAZ 0 — Envanter ve yönlendirme

| İş | Hedef kod | Çıkış koşulu |
| --- | --- | --- |
| F0-1 Mevcut ekran taraması | — | `raporlar/faz-0-envanter.json`: gerçek dosya sayısı, başlık, `data-sec`, `data-screen` |
| F0-2 Kırık rota taraması | — | Her iç bağlantı hedefi doğrulandı; kırık liste raporda (bilinen: `/projeler/yeni`) |
| F0-3 screen-manifest üretimi | tüm 244 kod | `manifest/screen-manifest.json` REVIZYON.md §4'ten üretiliyor, 244 aile |
| F0-4 Eski→hedef eşleme | — | Her mevcut yol için `koru / birleştir / yönlendir / kaldır` kararı |
| F0-5 Hedef mimari kararı | — | KARARLAR.md K-002..K-011 yazıldı ve iskelet kuruldu |
| F0-6 Otomatik link testi | — | `tests/faz0-link.test.js` yeşil |

**Çıkış:** screen-manifest üretildi, her yol için karar verildi, otomatik link testi çalışıyor.

## FAZ 1 — Temel platform

| İş | Hedef kod | Çıkış koşulu |
| --- | --- | --- |
| F1-1 Çekirdek runtime | — | HTTP router, hata sözleşmesi, istek kimliği, config, saat, kimlik üreteci |
| F1-2 Veri katmanı | — | Şema migrasyonu, transaction, optimistic concurrency, audit tablosu |
| F1-3 Para/zaman tipleri | — | `Money` (minor unit + currency), UTC saklama, kullanıcı TZ sunumu |
| F1-4 Kimlik ve oturum | AUTH-01..07 | Giriş, şifre unuttum/sıfırla, davet, MFA, ilk kurulum, oturum sonu |
| F1-5 Yetki | AUTH-08, SET-03..05 | Sunucu tarafı RBAC + ABAC, veri kapsamı, alan düzeyi maskeleme |
| F1-6 Sistem durumları | AUTH-08..10 | 403 / 404 / bakım sayfaları manifestten |
| F1-7 Ortak kabuk | GLB-01..13 | Rail + bağlamsal menü + üst bar + breadcrumb + page-head |
| F1-8 Ortak sayfa bileşenleri | — | Liste/form/detay/rapor kalıbı + sayfalama standardı (§3.5) |
| F1-9 Audit ve denetim izi | SET-16 | Değişmez audit; kim/ne/ne zaman/neden |
| F1-10 Demo bayrağı | — | "Rol seçerek incele" yalnız `DEMO` bayrağıyla; üretimde kapalı |

**Çıkış:** tüm API'lerde sunucu tarafı yetki; tasarım sistemi testleri geçiyor; AUTH-01 ve SEC-01 kabul testleri yeşil.

## FAZ 2 — İş akışı omurgası

| İş | Hedef kod | Çıkış koşulu |
| --- | --- | --- |
| F2-1 Durum/geçiş motoru | — | §5.2 durum tablosu birebir; geçişi yalnız motor yapar |
| F2-2 Hesaplanan işaretler | — | `gecikmiş`, `riskli`, `SLA aşıldı` türetilir, saklanmaz |
| F2-3 Onay motoru | GLB-04, GLB-05 | Eşik, sıralı/paralel adım, dört göz, kendi kaydını onaylayamama |
| F2-4 Vekalet | SET-07 | Tarih aralıklı, çakışma kontrollü, audit kayıtlı |
| F2-5 İş akışı şablonları | SET-06 | Sürümlü şablon, tutar aralığı, SLA |
| F2-6 Bildirim | GLB-06, SET-08 | Olay → kanal → alıcı; okundu/ertelendi |
| F2-7 Dosya ve sürüm | DOC-01..03 | Sürümlü yükleme, MIME doğrulama, saklama |
| F2-8 Sürüm/iptal/arşiv | — | Onaylı sürüm yerinde değişmez; iptalde ters kayıt |

**Çıkış:** sözleşme, talep, görev ve süre uzatımı formundan durum/onaycı seçilemiyor (WF-01, WF-02 yeşil).

## FAZ 3 — Proje ve saha

| İş | Hedef kod | Çıkış koşulu |
| --- | --- | --- |
| F3-1 Proje portföyü | PRJ-01..10 | `/projeler/yeni` 200 dönüyor ve kayıt oluşturuyor (PRJ-01 kabul) |
| F3-2 Şantiye ve saha | SITE-01..16 | Günlük rapor çevrimdışı taslak + çift gönderimde tek kayıt (SITE-01) |
| F3-3 İş programı ve WBS | PLAN-01..12 | WBS ağırlığı 100 değilse baz çizgi onaya gitmiyor (PLAN-01) |
| F3-4 İlerleme algoritması | PLAN-09..11 | `sum(WBS ağırlığı × onaylı aktivite ilerlemesi)` (PLAN-02) |
| F3-5 Görev ve iş emri | TASK-01..09 | Durum seçtirmeyen taslak/atama akışı |
| F3-6 İSG | HSE-01..12 | Kaza/ramak kala/tehlike ayrı formlar, DÖF ve doğrulama |
| F3-7 Kalite ve teknik onay | QLT-01..14 | NCR kapanışı DÖF + etkinlik doğrulaması olmadan mümkün değil (QLT-01) |
| F3-8 Doküman ve çizim | DOC-01..10 | Transmittal, revizyon, dağıtım matrisi |

## FAZ 4 — Tedarik ve finans

| İş | Hedef kod | Çıkış koşulu |
| --- | --- | --- |
| F4-1 Satın alma | PRC-01..13 | Onaysız talep siparişe dönüşmüyor (PRC-01) |
| F4-2 Depo ve stok | STK-01..10 | Bakiye hareket defterinden yeniden hesaplanıyor (STK-01) |
| F4-3 Sözleşme/metraj/hakediş | CNT-01..15 | Onaylı metraj ve ilerlemeden hakediş üretimi |
| F4-4 Finans | FIN-01..15 | Üçlü eşleştirme; tolerans dışı fark onaya gidiyor |

## FAZ 5 — Kartlar

| İş | Hedef kod | Çıkış koşulu |
| --- | --- | --- |
| F5-1 Kart çekirdeği | CRD-01..09 | 10 varlık, sağlayıcı bağımsız model (CRD-01) |
| F5-2 Atama kuralı | CRD-06 | Çakışan aktif atama reddediliyor (CRD-02) |
| F5-3 Toplu yükleme | CRD-10..12 | Durum makinesi + idempotency (CRD-03), kısmi sonuç (CRD-04) |
| F5-4 Hareket ve bakiye | CRD-13 | Bakiye formdan değiştirilemiyor (CRD-05) |
| F5-5 Mutabakat | CRD-14 | İç defter + ekstre + banka mutabık olmadan kapanmıyor |
| F5-6 Güvenlik | CRD-15 | Kayıp/çalıntı blokaj + retry + audit (CRD-06) |
| F5-7 Onay ve rapor | CRD-16, CRD-17 | Maskeli/toplulaştırılmış yönetici raporu |
| F5-8 Entegrasyon | CRD-18 | Adaptör sözleşmesi, webhook imzası, circuit breaker, DLQ |

## FAZ 6 — Rapor, mobil ve portallar

| İş | Hedef kod | Çıkış koşulu |
| --- | --- | --- |
| F6-1 ReportLayout | RPT-01, RPT-02, RPT-15 | Ekran = PDF = Excel (RPT-01) |
| F6-2 Standart raporlar | RPT-03..14 | Formül sözlüğünden açıklanmış KPI |
| F6-3 Dış portallar | EXT-01..06 | Tokenli, kapsamı daraltılmış dış erişim |
| F6-4 Saha mobil ve kiosk | EXT-07, EXT-08, AST-11 | Çevrimdışı taslak + senkron kuyruğu |
| F6-5 Çalışan self-servis | HR-14 | Yalnız kendi verisi |

---

## KALDIĞIMIZ YER — revizyon turu TAMAMLANDI

**Son commit:** `faz6(kapanış)` · **Test:** 390/390 · **Ekran:** **244/244 doğrulandı**

| Faz | Aile | Durum |
| --- | --- | --- |
| Faz 0 — Envanter ve yönlendirme | — | ✅ `faz-0-tamam` |
| Faz 1 — Temel platform | 22 | ✅ `faz-1-tamam` |
| Faz 2 — İş akışı omurgası | 14 | ✅ `faz-2-tamam` |
| Faz 3 — Proje ve saha | 89 | ✅ `faz-3-tamam` |
| Faz 4 — Tedarik ve finans | 69 | ✅ `faz-4-tamam` |
| Faz 5 — Kartlar | 23 | ✅ `faz-5-tamam` |
| Faz 6 — Rapor, mobil, portallar | 27 | ✅ `faz-6-tamam` |
| **Toplam** | **244** | **hepsi doğrulandı** |

Doküman §9'un altı fazı da kapandı. Her fazın raporu `raporlar/faz-N-rapor.md`
altında; hiçbirinde §12 üretime çıkış engeli kalmadı.

### Sonraki oturum ne yapmalı?

Revizyon turu bittiği için "kaldığımız yer" artık bir iş paketi değil, bir
**bakım listesi**. Sıradaki iş şunlardan biri olabilir:

1. **Bilinçli açık uçların kapatılması** (aşağıdaki tablo) — hiçbiri §12 engeli
   değildir, hepsi kayıt altındadır.
2. **Görsel tur:** `frontend-design` + `ss-eval` ile ekran ekran polish.
   Yapı ve veri bütünlüğü bitti; sıra sayfa dilinin inceliklerinde.
3. **Yük ve dayanıklılık:** çok kayıtlı listelerde sayfalama ve rapor süreleri.
4. **Gerçek sağlayıcı bağlantısı:** Pluxee/MultiNet kimlik bilgileri
   tanımlanınca `httpAdaptoru` canlıya alınır (kod hazır, yapılandırma işi).

### Bilinçli açık uçlar — gizlenmedi, kayıt altında

| # | Konu | Neden bilinçli |
| --- | --- | --- |
| K-021 | E-posta gönderimi yok; davet, şifre sıfırlama ve portal bağlantısı ekranda **bir kez** gösteriliyor | Gerçek SMTP olmadan "gönderildi" demek sahte başarı olurdu (kural 3) |
| K-027 | Antivirüs taraması dosya yüklemede bağlı değil | Adaptör sözleşmesi `kartlar/adaptor.mjs`'te hazır; bağlanacak nokta belli |
| — | `httpAdaptoru` gerçek sağlayıcı kimliği olmadan çalışmaz | Sahte başarı üretmiyor, yapılandırma hatası dönüyor |
| RPT-14 | Zamanlanmış rapor tanımı saklanıyor, gönderim yok | K-021'in sonucu; kayıt "gönderildi" işaretlenmiyor |

### Mimarinin taşıyıcı parçaları (yeni iş bunların üstüne kurulur)

- **`rotalar/kayit-modulu.mjs`** — liste+form+detay üreteci (K-033)
- **Dört değişmez defter** — `stok`, `kasa/banka/cari`, `kart`; hepsi aynı
  sözleşmede: bakiye sütunu yok, tetikleyici korumalı, düzeltme ters kayıt
- **`web/rapor-duzeni.mjs`** — tek `ReportLayout`; ekran = PDF = Excel = CSV
- **`cekirdek/pdf.mjs` · `cekirdek/xlsx.mjs`** — sıfır bağımlılık çıktı üreteçleri
- **`moduller/kartlar/adaptor.mjs`** — sağlayıcı adaptör sözleşmesi, devre
  kesici, retry, DLQ; K-027 buraya bağlanacak
- **Merkezi durum ve onay motoru** — durum yalnız motordan, onaycı politikadan
- **`ekranRota()`** — yetki rotanın kendisinde, manifestten türeyerek (K-081)

## Faz kapanış kontrol listesi (her faz için zorunlu)

- [ ] `raporlar/faz-<N>-rapor.md` üretildi: kırık link, yetkisiz erişim, veri tutarlılığı, PDF/çıktı
- [ ] Faza ait kabul testleri (§11) yeşil
- [ ] Üretime çıkış engellerinden (§12) hiçbiri yok
- [ ] PROGRESS.md güncel, commit sha'ları yazılı
- [ ] `faz-<N>-tamam` tag'i atıldı
