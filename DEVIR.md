# GaviaBuild — Devir Dokümanı

**Tarih:** 12 Ağustos 2026 (son güncelleme: `faz4c` turu sonu)
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

## 3. Şu anki durum (`faz4c` turu sonu itibarıyla)

**Sayılar `PROGRESS.md`'den teyit edilir** — aşağısı o dosyayla birebir tutar.

| | |
|---|---|
| Ekran | **178 doğrulandı + 16 bitti = 194 / 244** (50 bekliyor) |
| Test | **271/271 yeşil** (`node --test`, kök dizinden) |
| Faz 0 — Envanter | ✅ `faz-0-tamam` |
| Faz 1 — Temel platform (22 aile) | ✅ `faz-1-tamam` — 22 doğrulandı |
| Faz 2 — İş akışı omurgası (14 aile) | ✅ `faz-2-tamam` — 14 doğrulandı |
| Faz 3 — Proje ve saha (89 aile) | ✅ `faz-3-tamam` — 89 doğrulandı |
| Faz 4 — Tedarik ve finans (69 aile) | 🔄 69/69 **kodlandı**, faz **KAPANMADI** — 53 doğrulandı + 16 bitti |
| Faz 5 — Kartlar (23 aile) | ⬜ başlamadı (şema hazır) |
| Faz 6 — Rapor/mobil/portal (27 aile) | ⬜ başlamadı |

**"Bitti" ile "doğrulandı" farkı:** `bitti` = kodlandı ve elle doğrulandı, ama
`tests/kabul/` altında otomatik kabul testi **yok**. `doğrulandı` = kabul testi yeşil.
`faz4c`'nin 16 ailesi (AST-01..10, HR-10..13, GLB-02/03) bu yüzden `bitti`.

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

`faz4c` turu **temiz kapandı**: commit edilmemiş dosya kalmadı, çalışma ağacı temiz,
271/271 yeşil, PLAN.md ve PROGRESS.md gerçek durumda. Önceki turdaki "commit kontrolü"
acil durumu artık yok.

İlk iş şu: **`PLAN.md` → "Kaldığımız yer" → "FAZ 4 KAPANIŞ İÇİN KALAN"** listesini yap.
Dört madde var: `tests/kabul/faz4c.test.js`, K-049, `raporlar/faz-4-rapor.md`,
`faz-4-tamam` tag'i. Bu dördü bitmeden Faz 5'e geçilmez.

Her oturumun başında refleks olarak:

```bash
cd ~/Developer/"Backend Projects"/gaviabuild
git status && git log --oneline -10
node --test          # kök dizinden; testler tests/ altında, 271/271 beklenir
```

Commit edilmemiş dosya görürsen **silme, geri alma, `git stash` yapma.** Testleri
çalıştır, geçir, ayrı concern = ayrı commit olacak şekilde commit + push et.

## 5. Çalışma döngüsü

Bu proje tek context'e sığmaz. Döngü şudur:

**a) Her yeni Claude Code oturumunda bu promptu ver:**

```
DEVIR.md, PROGRESS.md, PLAN.md ve KARARLAR.md dosyalarını oku, docs/REVIZYON.md'yi bağlayıcı şartname olarak referans al. PLAN.md'deki "Kaldığımız yer" bölümünden devam et: önce Faz 4'ün kapanış işlerini bitir (faz4c kabul testi, K-049, faz-4-rapor.md, faz-4-tamam tag'i), sonra Faz 5, sonra Faz 6. Bana hiçbir soru sorma, onay bekleme; kararı doküman → best practice → en kısıtlayıcı güvenlik seçeneği sırasıyla ver ve KARARLAR.md'ye yaz. Her iş paketinden sonra commit+push, her faz sonunda raporlar/faz-<N>-rapor.md ve faz-<N>-tamam tag'i. Durma.
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

Kalan 50 ekranın çoğu üreteç sayesinde hızlı akar. Önce Faz 4'ün kapanışı, sonra iki ağır blok.

### Açık kararlar ve borçlar — kapanmadan faz kapanmaz

| # | Konu | Durum |
|---|---|---|
| **K-049** | `moduller/santiye/kapanis.mjs` (satır 53, 107, 110, 112) ve `moduller/proje/kapanis.mjs` (satır 87, 89) içindeki `planli: 'Faz 4'` **yer tutucuları hâlâ duruyor**. Bu satırlar gerçek sorguya bağlanmadan hiçbir şantiye veya proje kapatılamaz. **Bilinçli kaldırılamaz engeldir, unutulmuş eksik değildir** — "denetlendi" gibi göstermek §12 ihlalidir. Besleyen modüllerin hepsi artık hazır: `stok/defter.mjs`, `finans/defter.mjs`, `sozlesme/hakedis.mjs`, `varlik`/`zimmet` tabloları. | 🔴 açık |
| **faz4c kabul testi** | `tests/kabul/faz4c.test.js` yok. AST-01..10, HR-10..13, GLB-02/03 yalnız elle smoke ile doğrulandı; betikler `tests/gecici/` altında yerelde duruyor (`.gitignore`'da). Senaryolar: çakışan zimmet 409, geri sayaç 422, uygunsuz kontrol → kullanım dışı + iş emri, çakışan izin 409, mahsupsuz ikinci avans 409, süresiz sağlık 422, çalışan yalnız kendi kaydını görür. | 🔴 açık |
| **Faz 4 raporu** | `raporlar/faz-4-rapor.md` üretilmedi. | 🔴 açık |
| **Faz 4 tag** | `faz-4-tamam` atılmadı. | 🔴 açık |
| K-030 | Günlük rapor **PDF**'i Faz 6 `ReportLayout`'a bırakıldı. | 🟡 planlı |
| K-027 | Antivirüs taraması Faz 5 entegrasyon adaptörüne bağlanacak. | 🟡 planlı |
| K-021 | E-posta gönderimi yok; davet/sıfırlama bağlantısı geliştirmede ekranda gösteriliyor. | 🟡 bilinçli |

### Ağır bloklar

**Faz 5 — Kartlar (23 aile).** CRUD değil. Sağlayıcı adaptörleri (Pluxee / MultiNet),
idempotent toplu yükleme, teknik hata ↔ iş kuralı reddi ayrımı, kısmi sonuç, üç yönlü
mutabakat (iç defter + sağlayıcı ekstresi + banka). Tek başına 2-3 tur. Kart yükleme
durum zinciri şema olarak zaten tanımlı, kullanılmayı bekliyor. Kart bakiyesi
`stok/defter.mjs` ve `finans/defter.mjs` kalıbını tekrar eder — **ikinci bir defter yazma.**

**Faz 6 — Rapor (15 aile).** `ReportLayout` + ekran/PDF/Excel tutarlılığı. Sıkıcı ama titiz.
`sozlesme/hakedis.mjs` fonksiyonlarını kullanır; ikinci bir hesap yazılmaz.

Tahmin: **3-5 tur daha**, tur başına ~20-30 dakika.

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

> GaviaBuild adlı inşaat/şantiye operasyon platformunu geliştiriyorum. `gaviaworks-dev/gaviabuild` reposunda, `revizyon/faz-0-6` dalında. Claude Code'u tam otonom çalıştırıyorum; sen bana durum takibi, prompt hazırlama ve karar kontrolünde yardım ediyorsun. Repodaki `DEVIR.md`, `PLAN.md`, `PROGRESS.md` ve `docs/REVIZYON.md` her şeyi anlatıyor.
