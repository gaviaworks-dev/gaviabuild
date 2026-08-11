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

**Son commit:** `faz4(CNT,FIN)` · **Test:** 271/271 · **Doğrulanan ekran:** 178/244

| Faz | Durum | Not |
| --- | --- | --- |
| Faz 0 | ✅ kapandı (`faz-0-tamam`) | 244 yol kararı, screen-manifest, link testi |
| Faz 1 | ✅ kapandı (`faz-1-tamam`) | 22 aile; AUTH-01, SEC-01, UI-01, UI-02, AUD-01 yeşil |
| Faz 2 | ✅ kapandı (`faz-2-tamam`) | 14 aile; WF-01, WF-02 yeşil; geçiş + onay motoru |
| Faz 3 | ✅ kapandı (`faz-3-tamam`) | 89/89 aile; raporlar/faz-3-rapor.md; §12 engeli yok |
| Faz 4 | 🟡 53/69 aile | PRC, STK (`faz4a`) + CNT, FIN (`faz4b`) tamam; kalan: AST-01..10, HR-10..13, GLB-02/03 |
| Faz 5-6 | ⬜ başlamadı | |

### Faz 3'te teslim edilenler
Proje/şantiye çekirdeği (PRJ-01..04, SITE-01..03, SITE-06..11) · iş programı ve ilerleme
(PLAN-01..04, 06, 09, 11) · görev (TASK-01..03) · İSG (HSE-02..06) · kalite bloğu
(QLT-01..14, QLT-05..07 dahil) · doküman bloğu (DOC-01..10) · İK bloğu
(HR-01..05, HR-07..09: personel, işe giriş sihirbazı, atama, puantaj, dönem kapanışı) ·
şantiye tamamlama (SITE-04, 05, 12..16: düzenleme, açılış/kapanış sihirbazı, ziyaretçi,
resmi belge, geçici/kesin kabul).

### SIRADAKİ İŞ PAKETİ — Faz 4 (69 aile)

Sıra doküman §9'a göre: **PRC → STK → CNT → FIN**, ardından AST ve GLB panoları.

1. ~~**Satın alma (PRC-01..13)**~~ ✅ `faz4a` — PRC-01 kabul yeşil.
2. ~~**Depo ve stok (STK-01..10)**~~ ✅ `faz4a` — STK-01 kabul yeşil; defter tetikleyiciyle değişmez.
3. ~~**Sözleşme, metraj, hakediş (CNT-01..15)**~~ ✅ `faz4b`.
4. ~~**Finans (FIN-01..15)**~~ ✅ `faz4b` — üçlü eşleştirme kabul testi yeşil.
5. **Varlık ve filo (AST-01..10)** — 10 aile. Bakım iş emri `is_emri` tablosunu kullanır
   (kural 4); araçlar `varlik` tablosunun filtrelenmiş görünümüdür.
6. **İK finans etkili (HR-10..13)** — 4 aile: izin, avans, sağlık, yetkinlik.
   `IZIN` ve `AVANS` onay şablonları `faz3d` ile HAZIR; tablolar `goc5.mjs`'de var.
7. **Panolar (GLB-02, GLB-03)** — 2 aile. K-017 gereği veri kaynakları geldikten sonra.

**Faz 4'ün ilk işi olmalı:** `moduller/santiye/kapanis.mjs` ve `moduller/proje/kapanis.mjs`
içindeki `planli: 'Faz 4'` satırlarını gerçek sorguyla değiştirmek (K-049). Bu satırlar
şu an kaldırılamaz engeldir; stok/varlık/kasa/sözleşme modülleri gelmeden hiçbir şantiye
veya proje kapatılamaz — bu bilinçli bir tasarımdır, unutulmuş bir eksik değildir.

### Hazır ama henüz kullanılmayan altyapı

- **`rotalar/kayit-modulu.mjs`** — liste+form+detay üreteci (K-033). Yeni modül yazmanın
  standart yolu: alan tanımı ver, sayfalama/CSRF/idempotency/sürüm/audit üreteçten gelsin.
  `altForm` seçeneği, katalogda ayrı form ekranı olmayan listelere oluşturma formu ekler.
- `LISTE_OLUSTURUR` (roller.mjs) — ayrı form ekranı olmayan liste kodları burada;
  yeni modül eklerken ilgili kodu bu listeye eklemek gerekir (K-038).
- Para (tamsayı minor unit), idempotent(), surumluGuncelle() (409), audit zinciri
- Onay motoru: tutar kademeli şablon, paralel adım, vekalet, revizyonda geçersizleşme
- `cokluParcaOku()` dosya yükleme, doküman sürümleme, içerik-adresli depo
- **Kapsam çözücü (`kapsamCozucu`)** — kapsam sütunu olmayan tablolarda ABAC bağını
  kuran kayıt (K-041). Faz 4'te cari, tedarikçi, varlık için gerekecek.
- **Alan maskesi (`alanMaskeliMi` + alan tanımında `gorunur(ctx)`)** — hassas alanı
  hem okumaya hem yazmaya kapatır (K-039).
- **`moduller/santiye/kapanis.mjs`** — açılış/kapanış engel listesi; Faz 4'te stok,
  varlık ve kasa sorguları BURAYA bağlanacak (K-049: şu an kaldırılamaz engel).
  **Stok ayağı artık bağlanabilir**: `moduller/stok/defter.mjs` hazır.
- **`moduller/stok/defter.mjs`** ve **`moduller/finans/defter.mjs`** — değişmez hareket
  defterleri (K-061, K-071). Bakiye, yürüyen bakiye ve ters kayıt tek yerde.
- **`moduller/sozlesme/hakedis.mjs`** — kümülatif metraj, güncel bedel, kesinti hesabı.
  RPT raporları (Faz 6) bu fonksiyonları kullanacak; ikinci bir hesap yazılmaz.

### Bilinen açık uçlar

- Günlük rapor **PDF**'i Faz 6 `ReportLayout`'a bırakıldı (K-030)
- `GLB-02`, `GLB-03` panoları Faz 4'e alındı (K-017)
- RFI yanıtının tetiklediği **değişiklik talebi** kaydı Faz 4 CNT-10 ile bağlanacak
  (şu an yalnız `degisiklik_tetikledi` işareti konuyor)
- E-posta gönderimi yok: davet/sıfırlama bağlantısı geliştirmede ekranda (K-021)
- Antivirüs taraması Faz 5 entegrasyon adaptörüne bağlanacak (K-027)

## Faz kapanış kontrol listesi (her faz için zorunlu)

- [ ] `raporlar/faz-<N>-rapor.md` üretildi: kırık link, yetkisiz erişim, veri tutarlılığı, PDF/çıktı
- [ ] Faza ait kabul testleri (§11) yeşil
- [ ] Üretime çıkış engellerinden (§12) hiçbiri yok
- [ ] PROGRESS.md güncel, commit sha'ları yazılı
- [ ] `faz-<N>-tamam` tag'i atıldı
