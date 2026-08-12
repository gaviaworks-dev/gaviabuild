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

## KALDIĞIMIZ YER — sonraki oturum buradan devam eder

**Son commit:** `faz4(kapanış)` · **Test:** 306/306 · **Ekran:** 194 doğrulandı / 244

| Faz | Durum | Not |
| --- | --- | --- |
| Faz 0 | ✅ kapandı (`faz-0-tamam`) | 244 yol kararı, screen-manifest, link testi |
| Faz 1 | ✅ kapandı (`faz-1-tamam`) | 22 aile; AUTH-01, SEC-01, UI-01, UI-02, AUD-01 yeşil |
| Faz 2 | ✅ kapandı (`faz-2-tamam`) | 14 aile; WF-01, WF-02 yeşil; geçiş + onay motoru |
| Faz 3 | ✅ kapandı (`faz-3-tamam`) | 89/89 aile; raporlar/faz-3-rapor.md; §12 engeli yok |
| Faz 4 | ✅ kapandı (`faz-4-tamam`) | 69/69 aile; raporlar/faz-4-rapor.md; K-049 kapandı; §12 engeli yok |
| **Faz 5** | 🔜 **sıradaki** | Kartlar + entegrasyon, 23 aile |
| Faz 6 | ⬜ başlamadı | Rapor/mobil/portal, 27 aile |

### Faz 4'te teslim edilenler

Satın alma (PRC-01..13) ve değişmez stok defteri (STK-01..10) → `faz4a` ·
sözleşme/metraj/hakediş (CNT-01..15) ve finans defterleri + üçlü eşleştirme
(FIN-01..15) → `faz4b` · varlık ve filo (AST-01..10), İK finans etkili
(HR-10..13), panolar (GLB-02, GLB-03) → `faz4c` · kapanış turu: `faz4c.test.js`
(35 test), K-049, faz-4-rapor.md, `faz-4-tamam`.

**Kapanış turunda bulunan ve düzeltilen üç gerçek açık:**
1. `AST-02` GET işleyicisi yetki kontrolü yapmıyordu → yetki artık `ekranRota()`
   içinde, manifestten türeyerek zorunlu (**K-081**).
2. İzin formundaki "Vekil" kutusu tüm personeli sayıyordu → açılır kutular da
   ABAC kapsamıyla daraltılıyor (**K-083**).
3. Formdan eksik gelen kimlik alanı 500 üretiyordu → veri katmanı `undefined`'ı
   `null`'a çeviriyor, çağıran gerçek 422/404'ünü üretiyor (**K-082**).

---

### FAZ 5 — Kartlar ve entegrasyon (23 aile) — SIRADAKİ İŞ

**Bu bir CRUD modülü DEĞİLDİR.** Doküman §6 ayrıntılı tasarım veriyor; §6.4
toplu yükleme algoritması ve §6.5 bakiye formülü birebir uygulanır.

| İş paketi | Kodlar | Çıkış koşulu |
| --- | --- | --- |
| F5-1 Kart çekirdeği | CRD-01..05, CRD-07..09 | 10 varlık (§6.2), sağlayıcı bağımsız model; tam kart no hiçbir yerde tutulmaz/gösterilmez (CRD-01) |
| F5-2 Atama kuralı | CRD-06 | Kart başına tek çakışmayan aktif atama; personelde çoklu kart (CRD-02) |
| F5-3 Toplu yükleme | CRD-10..12 | Durum makinesi + idempotency (CRD-03); kısmi sonuçta başarılı satır tekrar gönderilmez (CRD-04) |
| F5-4 Hareket ve bakiye | CRD-13 | Bakiye formdan değiştirilemez; düzeltme onaylı ters kayıt (CRD-05) |
| F5-5 Mutabakat | CRD-14 | İç defter + sağlayıcı ekstresi + banka mutabık olmadan parti kapanmaz |
| F5-6 Güvenlik | CRD-15 | Kayıp/çalıntı blokaj + retry + audit (CRD-06) |
| F5-7 Onay ve rapor | CRD-16 | Maskeli/toplulaştırılmış yönetici görünümü (§6.7) |
| F5-8 Entegrasyon | CRD-18, SET-13..15, SET-19 | Adaptör sözleşmesi (§6.6), webhook imzası, circuit breaker, DLQ, OPS-01 |
| F5-9 İşten ayrılış | HR-06 | Kişiye bağlı kartlar dondurulmadan sihirbaz tamamlanamaz (§6.3) |

**Kesin kurallar — sapılmaz:**
- Kart bakiyesi `stok/defter.mjs` ve `finans/defter.mjs` kalıbını tekrar eder.
  **İkinci bir defter yazılmaz**: `kart_hareketi` değişmez, tetikleyici korumalı,
  bakiye her okumada toplanır, düzeltme ters kayıt.
- **Teknik hata ≠ iş kuralı reddi.** Yalnız teknik hata güvenli tekrar edilir;
  reddedilen satır tekrar gönderilmez (§6.4 madde 7).
- **Zaman aşımı başarısızlık değildir**: önce sağlayıcıdan durum sorgulanır
  (§6.4 madde 6).
- Sağlayıcılar `if/else` ile değil **adaptör + ürün tanımıyla** genişletilir.
  `Sodexo` tarihsel ad olarak korunur, `Pluxee` ailesine eşlenir.
- Kart yükleme durum zinciri `moduller/isakisi/durumlar.mjs` içinde **zaten
  tanımlı** (satır ~425); yeni bir durum tablosu yazılmaz, o kullanılır.
- Kart numarası maskesi `alanMaskeliMi` + alan tanımında `gorunur(ctx)`
  üzerinden gelir (K-039); kapsam bağı `kapsamCozucu` ile kurulur (K-041).
- Ekranlar `rotalar/kayit-modulu.mjs` üretecinden türer (K-033); yeni liste
  kodu `LISTE_OLUSTURUR`'a eklenir (K-038).

### Hazır ama henüz kullanılmayan altyapı

- **`rotalar/kayit-modulu.mjs`** — liste+form+detay üreteci (K-033). `altForm`
  seçeneği, ayrı form ekranı olmayan listelere oluşturma formu ekler.
- **`moduller/stok/defter.mjs`** ve **`moduller/finans/defter.mjs`** — değişmez
  hareket defteri kalıbı (K-061, K-071). **Faz 5 kart defteri bunu tekrar eder.**
- **`moduller/sozlesme/hakedis.mjs`** — kümülatif metraj, güncel bedel, kesinti.
  Faz 6 RPT raporları bunu kullanır; ikinci bir hesap yazılmaz.
- **`rotalar/panolar.mjs`** — GLB-02/03 pano kalıbı; Faz 6 RPT ekranları aynı
  kaynak-sorgu yaklaşımını kullanır.
- **`moduller/santiye/kapanis.mjs` / `proje/kapanis.mjs`** — engel listesi tek
  yerde; `planli` alanı bağlanmamış kontrolün "temiz" görünmesini engeller.
- Onay motoru, vekalet, idempotency, sürümlü güncelleme (409), audit zinciri,
  `cokluParcaOku()` dosya yükleme, alan maskesi, kapsam çözücü.

### Bilinen açık uçlar

- Günlük rapor ve tüm PDF/Excel çıktıları Faz 6 `ReportLayout`'ta (K-030)
- Antivirüs taraması Faz 5 entegrasyon adaptörüne bağlanacak (K-027)
- E-posta gönderimi yok: davet/sıfırlama bağlantısı geliştirmede ekranda (K-021)
- `HR-05` işe giriş sihirbazında **kart teslimi** adımı `planli` — CRD-06 ile bağlanacak
- `AST-11` (QR/barkod) ve `HR-14` (çalışan self-servis) Faz 6'ya ait

## Faz kapanış kontrol listesi (her faz için zorunlu)

- [ ] `raporlar/faz-<N>-rapor.md` üretildi: kırık link, yetkisiz erişim, veri tutarlılığı, PDF/çıktı
- [ ] Faza ait kabul testleri (§11) yeşil
- [ ] Üretime çıkış engellerinden (§12) hiçbiri yok
- [ ] PROGRESS.md güncel, commit sha'ları yazılı
- [ ] `faz-<N>-tamam` tag'i atıldı
