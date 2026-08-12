# GaviaBuild — Devir Dokümanı

**Tarih:** 12 Ağustos 2026 (son güncelleme: **DONDURMA NOKTASI** — `v1.0.0`, `main`)
**Amaç:** Bu projeyi yeni bir Claude hesabı/oturumu ile kaldığı yerden sürdürmek.
**Kime:** Yeni oturumdaki Claude'a ve Beyar'a.

> Yeni oturuma şunu söyle: *"Bu projeyi devralıyorsun. Depo kökündeki DEVIR.md, PLAN.md,
> PROGRESS.md ve KARARLAR.md'yi oku, sonra PLAN.md'deki 'Kaldığımız yer'den devam et."*
>
> Bu dosya artık **depoda** duruyor; ayrıca dışarıdan vermeye gerek yok.

---

## 1. Proje kimliği

| | |
|---|---|
| Ürün | **GaviaBuild** — Bütünleşik İnşaat ve Şantiye Operasyonları Yönetim Platformu |
| **Ürün CRM DEĞİLDİR** | Doküman bunu bağlayıcı kural yapıyor. Kod, arayüz, README hiçbir yerde "CRM" geçmeyecek. Nihai marka verilene kadar kullanıcıya görünen yerlerde `[ÜRÜN ADI]` |
| Repo | `github.com/gaviaworks-dev/gaviabuild` (public) |
| Yerel yol | `~/Developer/Backend Projects/gaviabuild` |
| Çalışma dalı | `revizyon/faz-0-6` |
| Eski repo | `eski-gaviacrm` remote'u olarak duruyor (kaynak: `gaviaworks-dev/gaviacrm`) |
| Tasarım referansı | `https://gaviaworks-dev.github.io/gaviaworks-crm/index.html` — **sadece sayfa dili**, demo verisi/rol seçimi/localStorage mantığı kopyalanmaz |

## 2. Repodaki yol haritası dosyaları

Bunlar tek doğruluk kaynağıdır. Her oturum bunları okuyarak başlar.

| Dosya | İçerik |
|---|---|
| `docs/REVIZYON.md` | **Bağlayıcı şartname**, 629 satır. 244 sayfalık hedef katalog (§4), algoritma omurgası (§5), Kartlar modülü (§6), kabul testleri (§11), üretime çıkış engelleri (§12) |
| `docs/REVIZYON-video-20260805.md` | Önceki revizyon turu (ekran kaydından çıkarılmış), ek bağlam |
| `PLAN.md` | Faz kırılımı + **"Kaldığımız yer"** bölümü — sıradaki iş paketi burada |
| `PROGRESS.md` | Ekran bazlı durum tablosu (kod / faz / durum / commit) |
| `KARARLAR.md` | Verilen mimari kararlar, K-001…K-0xx, gerekçeleriyle |
| `raporlar/faz-N-rapor.md` | Her faz sonu doğrulama raporu |
| `manifest/screen-manifest.json` | 244 aile; `REVIZYON.md` §4'ten **üretiliyor**, elle yazılmıyor. Menü, rota, breadcrumb, yetki, test hep buradan türer |

## 3. Şu anki durum — DONDURMA NOKTASI `v1.0.0`

**Sayılar `PROGRESS.md`'den teyit edilir** — aşağısı o dosyayla birebir tutar.

| | |
|---|---|
| Sürüm | **`v1.0.1`** — denetim-02 sonrası kararlı nokta (`v1.0.0` denetim-01 sonrasıydı) |
| Dal | **`main`** artık her şeyi taşıyor; `revizyon/faz-0-6` ile aynı commit'te |
| Ekran | **244 / 244 doğrulandı** ve denetim-01 turunda gezinerek erişilebilir olduğu kanıtlandı |
| Test | **471/471 yeşil** (`node --test`, kök dizinden) — denetim-02 ile +43 |
| Faz 0 — Envanter | ✅ `faz-0-tamam` |
| Faz 1 — Temel platform (22 aile) | ✅ `faz-1-tamam` |
| Faz 2 — İş akışı omurgası (14 aile) | ✅ `faz-2-tamam` |
| Faz 3 — Proje ve saha (89 aile) | ✅ `faz-3-tamam` |
| Faz 4 — Tedarik ve finans (69 aile) | ✅ `faz-4-tamam` |
| Faz 5 — Kartlar (23 aile) | ✅ `faz-5-tamam` |
| Faz 6 — Rapor, mobil, portallar (27 aile) | ✅ `faz-6-tamam` |
| Denetim-01 | ✅ `raporlar/denetim-01.md` — 7 bulgunun 7'si kapalı |
| Denetim-02 | ✅ `raporlar/denetim-02.md` — 9 bulgunun 9'u kapalı (K-120..K-128) |

Doküman §9'un altı fazı da kapandı. Her fazın raporu `raporlar/faz-N-rapor.md`
altında; **hiçbirinde §12 üretime çıkış engeli kalmadı**.

### Dondurma noktası ne demek?

`v1.0.0` tag'i, **bağımsız düşman denetiminden geçmiş ve bulgularının hepsi
kapatılmış** ilk durumu işaretler; `v1.0.1` aynı şeyi ikinci denetim
(eşzamanlılık ve veri bütünlüğü) için yapar. Bu noktada doğrulanmış olanlar:

* 244 ekranın tamamı gezinerek erişilebilir (10 rol, tam gezinti, yetim ekran 0)
* Uygulama içi hiçbir bağlantı 4xx/5xx dönmüyor
* Sunucu tarafı yetki 10 rol × 176 ekran gerçek istekle sınandı; beklenmeyen 5xx yok
* Değişmez defterler tetikleyici düzeyinde korumalı, bakiye defterden türüyor
* Her rapor dört çıktıyı da üretiyor; üretemeyen ekran çıktıyı açıkça reddediyor
* Bağlı olmayan yetenekler (e-posta K-021, antivirüs K-027) ekranda açıkça
  söyleniyor — hiçbir yerde sahte başarı bildirimi yok

`v1.0.1` ile ek olarak: eşzamanlı isteklerde kasa/stok negatife düşmüyor, aynı
varlık iki kişide olmuyor, aynı onay adımına iki karar geçmiyor, sürüm çakışması
ve idempotency gerçekten tutuyor; okunamayacak büyüklükte tutar veya geçersiz
tarih deftere giremiyor; sağlayıcı başarısı kart defterine yazılıyor; rapor ve
metin sınırları sessiz kırpma yerine açık ret üretiyor.

Bir şey bozulursa karşılaştırma tabanı budur: `git diff v1.0.1`.

### Kurulmuş ve çalışan altyapı (yeniden yazma!)

- Sıfır npm bağımlılığı, saf Node.js
- Sunucu tarafı **RBAC + ABAC**; yetkiler manifestten türetiliyor
- **Hash zincirli değişmez audit** izi
- **Merkezi durum geçiş motoru** (REVIZYON.md §5.2 tablosu birebir) — durumu yalnız motor değiştirir
- **Onay motoru**: tutar kademeli şablon, paralel adım, dört göz, süreli vekalet, revizyonda geçersizleşme, dondurulmuş belge sürümü
- Idempotency, optimistic concurrency (version), tamsayı kuruş para, UTC zaman
- Gerçek dosya yükleme: MIME imza doğrulaması, SHA-256, sürümleme
- `app/rotalar/kayit-modulu.mjs` — **liste + form + detay üreteci** (K-033). Modüller yalnız alan tanımı verir; sayfalama, CSRF, idempotency, sürümlü güncelleme, audit ve "durum/onaycı alanı yok" kuralı üreteçten gelir. **Kalan ekranların hızlı akmasının sebebi budur.**

### Testlerin bulduğu ve düzeltilen gerçek hatalar

1. Async işleyicideki hata `try/catch`'e düşmüyordu — her hata süreci çökertiyordu
2. Vekil karar veremiyordu — vekalet özelliği fiilen işlevsizdi
3. "Liste/Form" ve "Liste/Detay" ekranlarında kayıt oluşturulamıyordu (42 ekran)
4. Detay kalıbı `guncelle` üretmiyordu — hiçbir detay ekranında durum geçişi yapılamıyordu
5. Ayrı form ekranı olmayan liste ekranları salt okunur sayılıyordu (`LISTE_OLUSTURUR`, K-038) — Faz 4-6'da 40+ kodu etkileyecekti

---

## 4. Yeni oturumun ilk işi

Revizyon turu bitti; sıradaki iş bir faz değil, **bakım/iyileştirme** seçimidir.
`PLAN.md` → "Kaldığımız yer" bölümü dört seçenek sunar:

1. Bilinçli açık uçların kapatılması (K-021 e-posta, K-027 antivirüs,
   gerçek sağlayıcı kimliği, RPT-14 gönderimi) — hiçbiri §12 engeli değil.
2. Görsel tur: `frontend-design` + `ss-eval` ile ekran ekran polish.
3. Yük ve dayanıklılık: çok kayıtlı listelerde sayfalama ve rapor süreleri.
4. Gerçek sağlayıcı bağlantısı: kimlik bilgileri tanımlanınca `httpAdaptoru`
   canlıya alınır (kod hazır, yapılandırma işi).

Her oturumun başında refleks olarak:

```bash
cd ~/Developer/"Backend Projects"/gaviabuild
git status && git log --oneline -10
node --test          # kök dizinden; 471/471 beklenir
git describe --tags  # v1.0.1 (veya sonrası) beklenir
```

**Dal düzeni:** `v1.0.1` itibarıyla `main` güncel ve her şeyi taşıyor. Yeni iş
`main`'den açılan bir dalda yapılır; `revizyon/faz-0-6` tarihsel dal olarak
duruyor, yeni iş için kullanılmaz.

Commit edilmemiş dosya görürsen **silme, geri alma, `git stash` yapma.** Testleri
çalıştır, geçir, ayrı concern = ayrı commit olacak şekilde commit + push et.

## 5. Çalışma döngüsü

Bu proje tek context'e sığmaz. Döngü şudur:

**a) Her yeni Claude Code oturumunda bu promptu ver:**

```
DEVIR.md, PROGRESS.md, PLAN.md ve KARARLAR.md dosyalarını oku, docs/REVIZYON.md'yi bağlayıcı şartname olarak referans al. Revizyon turu (Faz 0-6) tamamlandı; PLAN.md'deki "Kaldığımız yer" bölümü artık bakım listesi. Oradan bir iş seç veya sana verdiğim işi yap. Bana hiçbir soru sorma, onay bekleme; kararı doküman → mevcut proje pattern'ı → best practice → en kısıtlayıcı güvenlik seçeneği sırasıyla ver ve KARARLAR.md'ye yaz. Her iş paketinden sonra testleri geçir, PROGRESS.md ve PLAN.md'yi güncelle, ayrı concern ayrı commit olacak şekilde commit+push. Durma.
```

**b) Context %15'in altına inince**, iş paketinin ortasındaysa şunu yolla (sıraya girer):

```
Şu anki iş paketini tamamla: testleri çalıştır, geçir, PROGRESS.md ve PLAN.md'deki "Kaldığımız yer" bölümünü güncelle, commit+push yap ve DUR. Yeni iş paketine başlama.
```

**c) Durunca `/clear`, sonra (a)'ya dön.**

Claude Code `--dangerously-skip-permissions` ile başlatılır (tam otonom, karar sorulmaz):

```bash
claude --dangerously-skip-permissions
```

---

## 6. Değişmez kurallar (ihlal edilirse iş kabul edilmez)

1. Tek `screen-manifest`; menü, rota, breadcrumb, yetki, test hep ondan türer
2. localStorage / sessionStorage / query parametresi **rol veya yetki kaynağı değildir**; yetki sunucuda doğrulanır
3. Sahte başarı bildirimi yok; her eylem gerçek API sonucu üretir
4. Liste, form, detay, rapor, çıktı **tek kanonik kayıt/API** kullanır
5. Kullanıcı onay durumunu, nihai durumu veya onaycıyı seçemez
6. Onaylı kayıt yerinde değiştirilmez; revizyon açılır
7. Finans, stok, kart bakiyesi **hareket defterinden türetilir**, ters kayıtla düzeltilir
8. Kritik yazmalarda idempotency + version + audit
9. Tüm raporlar tek `ReportLayout`; ekran = PDF = Excel aynı filtre/veri/toplam
10. Para: tamsayı kuruş. Zaman: UTC saklanır, kullanıcı saatinde gösterilir

## 7. Kalan iş ve dikkat noktaları

**Faz kalmadı.** Kalanlar bilinçli, kayıt altında ve §12 engeli değil:

| # | Konu | Neden bilinçli | Nereye bağlanacak |
|---|---|---|---|
| K-021 | E-posta gönderimi yok; davet, şifre sıfırlama ve portal bağlantısı ekranda **bir kez** gösteriliyor | Gerçek SMTP olmadan "gönderildi" demek sahte başarı olurdu (kural 3) | `moduller/isakisi/bildirim.mjs` |
| K-027 | Antivirüs taraması dosya yüklemede bağlı değil | Adaptör sözleşmesi hazır, bağlanacak nokta belli | `cekirdek/coklu-parca.mjs` → `moduller/kartlar/adaptor.mjs` kalıbı |
| — | `httpAdaptoru` gerçek sağlayıcı kimliği olmadan çalışmaz | **Sahte başarı üretmiyor**, teknik sınıfta yapılandırma hatası dönüyor | Kurulumda `entegrasyon.kimlik_referansi` ortam değişkeni |
| RPT-14 | Zamanlanmış rapor tanımı saklanıyor, gönderim yok | K-021'in sonucu; kayıt "gönderildi" işaretlenmiyor | K-021 ile birlikte |

**Denetim-01 (12 Ağustos 2026):** bağımsız düşman-gözü denetim yapıldı —
`raporlar/denetim-01.md`. Üç kırmızı bulgu (yetim ekranlar, ölü `/gunluk-raporlar`
bağlantısı, üretimde sahte "e-posta gönderildi") kapatıldı ve regresyon testine
bağlandı (K-114, K-115). **Sarı bulgular D-04…D-07 de kapatıldı** (K-116…K-119):
tek kanonik URL, rapor çıktısında sessiz yutma yok, antivirüs durumu beyan
ediliyor, ön koşulu eksik formlar kullanıcıyı kayıt açacağı ekrana yolluyor.
**K-021 ve K-027 artık ekranlarda dürüstçe söyleniyor.**

**Denetim-02 (12 Ağustos 2026):** ikinci düşman denetimi — eşzamanlılık ve veri
bütünlüğü (`raporlar/denetim-02.md`, dal `denetim/02-esalanlilik`). Yarış
koşullarının kendisi kırılmadı (kasa, stok, zimmet, onay, sürüm, idempotency,
ters kayıt); ama **dört kırmızı** çıktı ve kapatıldı: 2^53 üstü tutarın değişmez
defteri kalıcı olarak kırması (**K-120**), sağlayıcı API'si başarı dönerken kart
defterinin boş kalması (**K-123**), tarih ayrıştırıcının geçersizde 500 verip
imkânsızda sessizce kayması (**K-121**), kart yükleme onayının 500 vermesi
(**K-122**). Turuncu D-12 de kapatıldı (**K-124**). Dört sarı da ikinci turda kapatıldı:
kasa/banka hareketi ileri tarihli olamaz ve ret FIN-12'ye yönlendiriyor
(**K-125**), rapor/liste satır tavanı ekran 5.000 · dosya 20.000 ve aşımda
sessiz kırpma yerine açık ret (**K-126**), serbest metinde öntanımlı uzunluk
sınırı 4.000/250 (**K-127**), gövde aşımı 413 ve bağlantı sağlam kalıyor
(**K-128**). **Dokuz bulgunun dokuzu kapalı; açık §12 engeli yok.**

**Dikkat — `httpAdaptoru` canlıya alınmadan önce:** D-09 tam olarak bu yolun
kart defterini hiç yazmadığını gösterdi. Bağlantı öncesi
`tests/kabul/denetim-02-kart-defteri.test.js` referans alınmalı; test gecikmeli
gerçek bir sağlayıcı HTTP sunucusuna karşı çalışır.

### Mimarinin taşıyıcı parçaları — yeni iş bunların üstüne kurulur

- **`rotalar/kayit-modulu.mjs`** — liste+form+detay üreteci (K-033). Yeni modül
  yazmanın standart yolu: alan tanımı ver, sayfalama/CSRF/idempotency/sürüm/audit
  üreteçten gelsin. Yeni liste kodu `LISTE_OLUSTURUR`'a eklenir (K-038).
- **Dört değişmez defter** — `stok/defter.mjs`, `finans/defter.mjs` (kasa/banka/
  cari), `kartlar/defter.mjs`. Hepsi AYNI sözleşmede: bakiye sütunu yok,
  tetikleyici korumalı, düzeltme ters kayıt. **Beşinci defter yazma.**
- **`web/rapor-duzeni.mjs`** — tek `ReportLayout`. Rapor tanımının `veri()`
  fonksiyonu bir kez çalışır; ekran, PDF, Excel ve CSV aynı nesneden serileşir.
  **Yeni rapor eklemek = `moduller/rapor/tanimlar.mjs`'e bir nesne eklemek.**
- **`cekirdek/pdf.mjs` · `cekirdek/xlsx.mjs`** — sıfır bağımlılık çıktı
  üreteçleri. PDF'te Türkçe glifler `/Differences` ile çözüldü (K-103).
- **`moduller/kartlar/adaptor.mjs`** — sağlayıcı adaptör sözleşmesi: dokuz
  yetenek bildirimi, devre kesici, artan beklemeli retry, DLQ, maskeli olay
  kaydı. **Yeni sağlayıcı = `adaptorKaydet()` çağrısı**, if/else değil.
- **Merkezi durum ve onay motoru** — durum yalnız motordan, onaycı politikadan.
- **`ekranRota()`** — yetki rotanın kendisinde, manifestten türeyerek (K-081).
  Bir işleyicinin `yetkiZorunlu` yazmayı unutması artık açık üretemez.
- **Kapanış engel modülleri** — `santiye/kapanis.mjs`, `proje/kapanis.mjs`,
  `ik-ayrilis.mjs`: engel listesi tek yerde, hem ekran hem geçiş ön koşulu
  onu kullanır. `planli` alanı, bağlanmamış bir kontrolün "temiz" görünmesini
  yapısal olarak engeller.

## 8. Öğrenilen dersler (tekrarlama)

- **İş paketinin ortasında kesme.** Önce "paketi kapat ve dur" de, sonra `/clear`.
- **%15 eşiği.** Altına inince temiz devret; %10'un altında otomatik sıkıştırma devreye girer ve kalite düşer.
- **Dosya adı çakışması.** Downloads'a indirilen dosya aynı adda başkası varsa `-1` ekiyle iner; `cp` yanlış dosyayı kopyalar. Kopyaladıktan sonra `wc -l` + `head -1` ile doğrula. (`docs/REVIZYON.md` = **629 satır**, ilk satır `# GaviaWorks Yapı ve Şantiye Operasyonları Yönetim Platformu`)
- **Doküman okundu mu testi.** Yeni oturumda şüphelenirsen sor: dosya kaç satır (629), hedef katalog toplamı (244 sayfa ailesi), Kartlar tablosunda kaç CRD kodu var (18), giriş sol panel başlığı ("Şirketten şantiyeye tüm operasyon tek platformda"). Dördü tutuyorsa gerçekten okumuştur.
- **Kaynak dosyalar** `~/Desktop/GaviaWorks-CRM Sources/<tarih>/` altında duruyor.
  Devir notları ise `~/Desktop/Devir Notlari/` altında; oradaki `DEVIR.md` bu dosyanın
  kaynağıdır, diğer `DEVIR*.md` dosyaları **önceki ürüne (CRM) aittir**, karıştırma.
- **Ayrı concern = ayrı commit.** Bir dosya birden çok concern'e dokunuyorsa (ör.
  `app/rotalar.mjs`) ara sürümünü elle yazıp parçalı stage'le; her ara commit tek
  başına yeşil olmalı.
- **Yazılan dosya bağlanmış mı?** `faz4c`'de `panolar.mjs` yazılmış ama
  `app/rotalar.mjs`'e import edilmemişti; iki rota da 404 dönüyordu ve testler bunu
  yakalamıyordu. Yeni rota dosyası eklerken router bağını ve gerçek HTTP durumunu doğrula.

---

## 9. Yeni Cowork/sohbet oturumuna verilecek özet cümle

> GaviaBuild adlı inşaat/şantiye operasyon platformunu geliştiriyorum. `gaviaworks-dev/gaviabuild` reposunda, `revizyon/faz-0-6` dalında. **Revizyon turu tamamlandı: 244 sayfa ailesinin hepsi doğrulandı, 390 test yeşil, altı fazın da tag'i atıldı.** Şimdi bakım ve iyileştirme aşamasındayım. Claude Code'u tam otonom çalıştırıyorum; sen bana durum takibi, prompt hazırlama ve karar kontrolünde yardım ediyorsun. Repodaki `DEVIR.md`, `PLAN.md`, `PROGRESS.md` ve `docs/REVIZYON.md` her şeyi anlatıyor.
