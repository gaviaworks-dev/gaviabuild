# GaviaWorks Yapı ve Şantiye Operasyonları Yönetim Platformu
## Cloud için tam sistem, sayfa mimarisi, algoritma ve Kartlar modülü revizyon dokümanı
**Sürüm:** 1.0  |  **Tarih:** 9 Ağustos 2026  |  **Belge türü:** Uygulama talimatı ve kabul şartnamesi  |  **Hedef:** Cloud geliştirme ortamı

> **Bağlayıcı ürün tanımı:** Bu ürün bir CRM değildir. Ürün; şirket, proje ve şantiye süreçlerini aynı veri omurgasında yöneten **Bütünleşik İnşaat ve Şantiye Operasyonları Yönetim Platformu** olarak adlandırılacaktır. Nihai marka seçilene kadar arayüzde `[ÜRÜN ADI]` kullanılabilir; çalışma adı olarak `GaviaBuild` uygundur.

## Yönetici kararı

İncelenen yapı güçlü bir ekran prototipi ve kapsamlı bir menü taslağıdır; ancak üretim seviyesinde tek bir uygulama gibi davranmasını engelleyen dört temel sorun vardır: aynı verinin farklı sayfalarda kopyalanması, durumların kullanıcı tarafından serbestçe seçilebilmesi, onayların merkezi bir iş akışı motoruna bağlı olmaması ve birçok işlemde gerçek kayıt yerine demo bildirimi/yerel tarayıcı verisi kullanılması. Bu revizyonun amacı yalnızca eksik sayfa eklemek değildir. Amaç; örnek bağlantıdaki sayfa dilini koruyarak veriyi, durumları, onayları, entegrasyonları ve raporları gerçek bir operasyon omurgasına bağlamaktır.

**Cloud için ana talimat:** `https://gaviaworks-dev.github.io/gaviaworks-crm/index.html` adresindeki giriş, kabuk, liste, form, detay ve rapor sayfa kalıplarını tasarım referansı olarak kullan. Demo veriyi, tarayıcı tarafı rol seçimini, sahte başarı bildirimlerini ve localStorage tabanlı iş kurallarını kopyalama. Mevcut şantiye uygulamasındaki işlevsel ekranları koru; aşağıdaki eksik ve hatalı akışları merkezi veri ve iş akışı katmanı üzerinde yeniden kur.

## 1. İnceleme dayanağı ve doğrulanmış bulgular

İnceleme; mevcut şantiye uygulamasının 240 ekranlık envanteri, sayfa içeriği ve bağlantıları ile örnek sayfa mimarisi birlikte değerlendirilerek hazırlanmıştır. Mevcut şantiye dizininde sayfa sayaçlarının 199, 202 ve 242 gibi farklı değerler göstermesi tek bir ekran manifestosu olmadığını ortaya koymaktadır. Proje liste ve detay sayfaları erişilebilirken yeni proje formu yolu 404 durumundadır. Şantiye detayındaki sekmelerin önemli bölümü kanonik bir API yerine sayfa içi örnek dizilerden beslenmektedir. İş programı görünümü ağırlıklı olarak salt okunurdur. Sözleşme, banka hareketi ve süre uzatımı gibi kritik formlarda kullanıcıya onay durumu veya onay yöntemi seçtirilmesi görevler ayrılığı ilkesini bozmaktadır.

| Alan | Mevcut sorun | Bağlayıcı revizyon |
| --- | --- | --- |
| Sayfa envanteri | Dizin, menü ve sayaçlar farklı kaynaklardan türetiliyor. | Tek `screen-manifest` üret; menü, rota, breadcrumb, yetki ve testler buradan beslensin. |
| Veri | Liste, form, detay ve çıktı aynı kaydın ayrı demo kopyalarını tutuyor. | Her iş nesnesi için tek kanonik API ve kimlik kullan. |
| Durumlar | Talep sahibi ilk/son durumu seçebiliyor; gecikme yaşam durumu gibi kullanılıyor. | Durum değişimini yalnızca geçiş motoru yapsın; `gecikmiş` hesaplanan işaret olsun. |
| Onay | Modül bazlı ve dağınık; bazı kayıtlarda onaysız doğrudan bakiye/finans etkisi var. | Merkezi, sürümlü, eşik ve vekalet destekli iş akışı motoru kur. |
| Rapor | Filtre, başlık, kolon, çıktı ve baskı davranışı sayfadan sayfaya değişiyor. | Tek `ReportLayout` ve tek rapor sözlüğü kullan. |
| Güvenlik | Rol ve bağlam tarayıcı/query/localStorage tarafından belirlenebiliyor. | Sunucu tarafı RBAC + ABAC, tenant/proje/şantiye kapsamı ve nesne sahipliği uygula. |
| Kartlar | Pluxee tek sağlayıcı sayfası; kayıt doğrudan bakiyeye yazılıyor ve veri kopyalı. | Sağlayıcı bağımsız Kartlar çekirdeği, değişmez hareket defteri, onay ve mutabakat kur. |

## 2. Korunacak sayfa dili

Referans uygulamanın aşağıdaki görsel ve etkileşim modeli tüm yeni sayfalara uygulanacaktır:

1. Sol tarafta ikon rayı; seçilen modüle ait ikinci seviye bağlamsal menü.
2. Üst barda global arama, onay kutusu, bildirim, şirket/proje/şantiye seçici ve kullanıcı menüsü.
3. Tıklanabilir breadcrumb, `eyebrow + H1 + tek satır açıklama` yapısında sayfa başlığı.
4. Liste sayfalarında KPI şeridi, filtre alanı, kaydedilmiş görünümler, kolon seçimi, tablo/kart geçişi, toplu işlem ve standart sayfalama.
5. Formlarda geniş ana alan + sağ bağlam/özet paneli; sekmeli bölümler; koşullu alanlar; dosya yükleme; alan ve sekme hata özeti; ortak alt işlem çubuğu.
6. Detaylarda özet şeridi, durum, birincil eylem, ilişkili sekmeler, aktivite akışı ve sürüm geçmişi.
7. Raporlarda tek filtre özeti, veri tarihi/sürümü, açıklanmış KPI formülü, tablo/grafik, PDF/Excel/CSV ve yazdırma.
8. Mobilde tek kolon; tabloların kart görünümü; birincil eylemler erişilebilir; saha ekranlarında çevrimdışı taslak ve senkron kuyruğu.

### 2.1 Giriş sayfası revizyonu

Giriş sayfası referanstaki iki panelli yapıda olacaktır. Sol panel ürün anlatımı, sağ panel kimlik doğrulama içindir. Sol başlık `Şirketten şantiyeye tüm operasyon tek platformda` olmalıdır. Fayda maddeleri: proje ve şantiye kontrolü; iş programı ve saha ilerlemesi; personel, puantaj ve İSG; satın alma, stok ve varlık; sözleşme, hakediş, finans ve raporlama. Sağ panelde e-posta/kullanıcı adı, şifre, beni hatırla, şifremi unuttum, SSO ve gerektiğinde MFA bulunur. `Rol seçerek incele` yalnızca demo/QA ortamında ve açık bir `DEMO` etiketiyle gösterilir; üretimde kapalıdır.

Başarılı girişten sonra kullanıcı doğrudan sabit bir panele değil; son şirket/proje bağlamı, rolü, bekleyen zorunlu kurulum ve açık onaylarına göre yönlendirilir. Oturum çerezi `HttpOnly`, `Secure`, `SameSite` olarak sunucudan verilir. E-posta ile kullanıcı var/yok bilgisini sızdıran hata mesajı gösterilmez.

## 3. Ortak sayfa sözleşmeleri

### 3.1 Liste sayfası

Her liste ekranı aynı sırayı kullanır: sayfa başlığı; en fazla 4-6 KPI; hızlı arama; gelişmiş filtre; kaydedilmiş görünüm; aktif filtre etiketleri; veri tablosu veya kart görünümü; seçim/toplu işlem; sayfalama; veri tarihi. Filtreler URL sorgusuna yazılır. Sunucu tarafı sayfalama, sıralama ve filtreleme uygulanır. `Toplam`, yetki ve filtre sonrası gerçek toplamdır. Toplu işlem yalnızca tüm seçili kayıtlar için geçerli eylemleri sunar; kısmi başarıda satır bazlı sonuç döner.

### 3.2 Form sayfası

Personel ve proje formu referans alınır. Ana form solda, bağlam/özet sağdadır. Zorunlu alanlar, koşullu bölümler, ilişkili kayıt seçicileri, belge alanları ve canlı özet ortak bileşenlerdir. Kaydetme üç biçimde olabilir: `Taslak kaydet`, `Kaydet ve detaya git`, `Onaya gönder`. Onay gerektiren kayıtta kullanıcı başlangıç durumunu veya onaycıyı serbestçe seçemez. Çift gönderim idempotency key ile engellenir. Kaydedilmemiş değişiklik uyarısı ve otomatik taslak geri yükleme bulunur.

### 3.3 Detay sayfası

Detay sayfası tek kanonik kayıt kimliğini kullanır. Üstte kod, başlık, yaşam durumu, sağlık işareti, sürüm ve bağlam görünür. Eylem menüsü yalnızca geçiş motorunun o kullanıcı için izin verdiği eylemleri gösterir. İlgili sekmeler aynı API kaynaklarına bağlanır; sayfa içi kopya veri tutulmaz. Silme yerine çoğunlukla iptal/arşiv ve gerekçe kullanılır.

### 3.4 Rapor ve çıktı sayfası

Tek `ReportLayout` bileşeni kullanılacaktır: rapor başlığı, şirket/proje/şantiye, dönem, filtre özeti, üretim zamanı, veri son güncelleme zamanı, rapor sürümü, KPI kartları, görsel/tablo ve açıklama. PDF, Excel ve CSV sunucu tarafında üretilir. Yazdırma görünümünde menü, buton ve form kontrolleri gizlenir; A4 dikey/yatay seçimi, tekrarlanan tablo başlığı, sayfa numarası ve kurumsal başlık vardır. PDF ile ekrandaki filtre ve veri sürümü aynı olmalıdır.

### 3.5 Sayfalama standardı

| Kural | Uygulama |
| --- | --- |
| Konum | Tablonun altında; sol tarafta `1-25 / 428 kayıt`, sağda sayfa boyutu ve gezinme. |
| Sayfa boyutu | 25 varsayılan; 50 ve 100 seçenekleri. Çok büyük dışa aktarım asenkron iş olarak çalışır. |
| Durum | Filtre, sıralama, görünüm ve sayfa URL'de saklanır; geri tuşu bağlamı korur. |
| Erişilebilirlik | Buton adları, klavye odağı, devre dışı ilk/son ve ekran okuyucu metni. |
| Toplam | Sunucu sonucu; demo sayaç veya istemci dizisi uzunluğu kullanılmaz. |
| Mobil | Önceki/sonraki ve kayıt aralığı; tablo yerine özet kart. |

## 4. Hedef menü ve tam sayfa kataloğu

Aşağıdaki katalog Cloud uygulaması için bağlayıcı hedef manifestodur. `Yeni` mevcut uygulamada eksik sayfayı; `Revize` mevcut ekranın korunup veri/akış/sayfa kalıbının düzeltilmesini; `Yeniden kur` ekranın görünümü kullanılabilse bile iş mantığının değiştirilmesini ifade eder. Kodlar rota, yetki, test ve analitik olaylarında ortak anahtar olarak kullanılmalıdır.

### Giriş, hesap ve sistem durumları

| Kod | Sayfa | Tip | Karar | Öncelik | Önerilen yol | Amaç |
| --- | --- | --- | --- | --- | --- | --- |
| AUTH-01 | Giriş | Kimlik doğrulama | Yeniden kur | P0 | `/giris` | İki panelli giriş; gerçek sunucu oturumu ve şirket bağlamı |
| AUTH-02 | Şifremi unuttum | Form | Yeni | P0 | `/sifre-unuttum` | Tek kullanımlık ve süreli sıfırlama bağlantısı |
| AUTH-03 | Şifre sıfırla | Form | Yeni | P0 | `/sifre-sifirla/:token` | Parola politikası ve token doğrulaması |
| AUTH-04 | Davet kabul | Form | Yeni | P0 | `/davet/:token` | Kullanıcı daveti, şirket ve rol kabulü |
| AUTH-05 | MFA doğrulama | Form | Yeni | P0 | `/mfa` | TOTP, e-posta veya kurumsal SSO ikinci adımı |
| AUTH-06 | İlk giriş kurulumu | Sihirbaz | Yeni | P0 | `/ilk-kurulum` | Şifre, MFA, aydınlatma ve profil kurulumu |
| AUTH-07 | Oturum süresi doldu | Durum | Yeni | P0 | `/oturum-sonlandi` | Taslağı koruyarak yeniden giriş |
| AUTH-08 | Yetkisiz erişim | Durum | Revize | P0 | `/403` | Kayıt ve eylem düzeyinde yetki reddi |
| AUTH-09 | Sayfa bulunamadı | Durum | Revize | P1 | `/404` | Güvenli geri dönüş ve arama |
| AUTH-10 | Bakım / servis kesintisi | Durum | Yeni | P1 | `/bakim` | Planlı bakım, olay kodu ve durum bağlantısı |

### Ortak çalışma alanı

| Kod | Sayfa | Tip | Karar | Öncelik | Önerilen yol | Amaç |
| --- | --- | --- | --- | --- | --- | --- |
| GLB-01 | Rol bazlı ana panel | Panel | Revize | P0 | `/panel` | Rol, şirket, proje ve şantiye bağlamına göre KPI |
| GLB-02 | Günlük özet | Panel | Revize | P1 | `/panel/gunluk-ozet` | Bugünkü saha, finans, onay ve risk özeti |
| GLB-03 | Yönetici kontrol merkezi | Panel | Revize | P1 | `/panel/yonetici` | Portföy, nakit, ilerleme ve kritik sapmalar |
| GLB-04 | Onay kutum | Liste | Yeniden kur | P0 | `/onaylar` | Tüm modüllerin merkezi onay görevleri |
| GLB-05 | Onay detayı | Detay | Yeni | P0 | `/onaylar/:id` | Belge sürümü, gerekçe, ek ve karar geçmişi |
| GLB-06 | Bildirim merkezi | Liste | Revize | P0 | `/bildirimler` | Okundu, ertelendi, ilişkilendirildi durumları |
| GLB-07 | Genel arama sonuçları | Liste | Yeni | P1 | `/arama` | Yetki filtreli çapraz modül araması |
| GLB-08 | Takvim | Takvim | Revize | P1 | `/takvim` | Görev, saha, bakım, toplantı ve terminler |
| GLB-09 | Duyurular | Liste/Detay | Revize | P2 | `/duyurular` | Hedef kitleli ve okundu teyitli duyuru |
| GLB-10 | Kişisel notlar | Liste | Yeni | P1 | `/notlarim` | Yalnızca sahibinin görebildiği not ve yapılacaklar |
| GLB-11 | Yeni kişisel not | Form | Yeni | P1 | `/notlarim/yeni` | Başlık, not, tarih, etiket ve tamamlandı işareti |
| GLB-12 | Profilim | Detay/Form | Revize | P1 | `/profilim` | Kişisel ayarlar, bildirim ve oturumlar |
| GLB-13 | İşlem geçmişim | Liste | Yeni | P2 | `/profilim/islemler` | Kullanıcının kendi denetim izi |

### Proje portföyü

| Kod | Sayfa | Tip | Karar | Öncelik | Önerilen yol | Amaç |
| --- | --- | --- | --- | --- | --- | --- |
| PRJ-01 | Proje listesi | Liste | Revize | P0 | `/projeler` | Portföy filtreleri ve proje sağlık göstergeleri |
| PRJ-02 | Yeni proje | Form | Yeni - 404 düzelt | P0 | `/projeler/yeni` | Mevcut kırık proje oluşturma yolunun yerine gerçek form |
| PRJ-03 | Proje detayı | Detay | Revize | P0 | `/projeler/:id` | Özet, şantiyeler, finans, sözleşme, ekip ve belge sekmeleri |
| PRJ-04 | Proje düzenle | Form | Yeni | P0 | `/projeler/:id/duzenle` | Yetkili alan güncellemesi ve sürüm kaydı |
| PRJ-05 | Proje aktivasyon sihirbazı | Sihirbaz | Yeni | P1 | `/projeler/:id/aktivasyon` | Zorunlu belge, ekip, bütçe ve takvim kontrolü |
| PRJ-06 | Proje organizasyonu | Detay/Form | Yeni | P1 | `/projeler/:id/organizasyon` | Rol, sorumluluk, vekalet ve iletişim matrisi |
| PRJ-07 | Proje paydaşları | Liste/Form | Yeni | P1 | `/projeler/:id/paydaslar` | İşveren, müşavir, taşeron ve resmi kurumlar |
| PRJ-08 | Proje risk kaydı | Liste/Detay | Yeni | P1 | `/projeler/:id/riskler` | Olasılık, etki, aksiyon ve risk sahibi |
| PRJ-09 | Proje kapanış | Sihirbaz | Yeni | P1 | `/projeler/:id/kapanis` | Kabul, hesap kapanışı, devir ve arşiv kontrolleri |
| PRJ-10 | Proje sürüm ve değişiklik geçmişi | Liste | Yeni | P1 | `/projeler/:id/gecmis` | Alan bazlı önce/sonra kaydı |

### Şantiye ve saha operasyonu

| Kod | Sayfa | Tip | Karar | Öncelik | Önerilen yol | Amaç |
| --- | --- | --- | --- | --- | --- | --- |
| SITE-01 | Şantiye listesi | Liste | Revize | P0 | `/santiyeler` | Durum ile takvim sağlığını ayıran görünüm |
| SITE-02 | Yeni şantiye | Form | Revize | P0 | `/santiyeler/yeni` | Proje, adres, izinler, ekip, tarihler ve maliyet merkezi |
| SITE-03 | Şantiye detayı | Detay | Revize | P0 | `/santiyeler/:id` | Kanonik veri kullanan sekmeli çalışma alanı |
| SITE-04 | Şantiye düzenle | Form | Yeni | P0 | `/santiyeler/:id/duzenle` | Durumdan bağımsız temel veri güncellemesi |
| SITE-05 | Şantiye açılış kontrolü | Sihirbaz | Yeni | P1 | `/santiyeler/:id/acilis` | Ruhsat, İSG, ekip, depo, kasa ve saha kurulumu |
| SITE-06 | Günlük şantiye raporları | Liste | Yeni | P0 | `/santiyeler/:id/gunluk-raporlar` | Günlük kayıt, onay ve kilit durumu |
| SITE-07 | Yeni günlük rapor | Form | Yeni | P0 | `/santiyeler/:id/gunluk-raporlar/yeni` | Hava, ekip, imalat, makine, ziyaretçi, olay ve fotoğraf |
| SITE-08 | Günlük rapor detayı | Detay/Çıktı | Yeni | P0 | `/gunluk-raporlar/:id` | Revizyon, imza, fotoğraf ve PDF |
| SITE-09 | Saha bildirimleri | Liste | Revize | P0 | `/saha-bildirimleri` | Tür bazlı yönlendirme ve SLA |
| SITE-10 | Yeni saha bildirimi | Form | Revize | P0 | `/saha-bildirimleri/yeni` | Konum, tür, aciliyet, ilişki ve kanıt |
| SITE-11 | Saha bildirimi detayı | Detay | Yeni | P0 | `/saha-bildirimleri/:id` | Atama, işlem, doğrulama ve kapanış |
| SITE-12 | Saha günlükleri ve ziyaretçiler | Liste/Form | Yeni | P2 | `/santiyeler/:id/ziyaretciler` | Ziyaretçi, teslimat ve saha giriş kaydı |
| SITE-13 | Şantiye izin ve resmi belgeleri | Liste/Detay | Yeni | P1 | `/santiyeler/:id/izinler` | Geçerlilik ve yenileme takibi |
| SITE-14 | Geçici kabul | Sihirbaz | Yeni | P1 | `/santiyeler/:id/gecici-kabul` | Eksik listesi, tutanak ve onay |
| SITE-15 | Kesin kabul ve devir | Sihirbaz | Yeni | P1 | `/santiyeler/:id/kesin-kabul` | Devir paketi, garanti ve kapanış |
| SITE-16 | Şantiye kapatma | Sihirbaz | Yeni | P1 | `/santiyeler/:id/kapat` | Açık iş, varlık, stok, kasa ve belge engelleri |

### İş programı, WBS ve ilerleme

| Kod | Sayfa | Tip | Karar | Öncelik | Önerilen yol | Amaç |
| --- | --- | --- | --- | --- | --- | --- |
| PLAN-01 | İş programı listesi | Liste | Yeni | P0 | `/is-programlari` | Projeye göre program ve baz çizgi sürümleri |
| PLAN-02 | Yeni iş programı | Form | Yeni | P0 | `/is-programlari/yeni` | Takvim, kodlama, çalışma günleri ve kaynaklar |
| PLAN-03 | İş programı detayı | Detay | Yeni | P0 | `/is-programlari/:id` | Gantt, kritik yol, kaynak ve sapma |
| PLAN-04 | WBS düzenleyici | Ağaç/Form | Yeni | P0 | `/is-programlari/:id/wbs` | Hiyerarşi, ağırlık, sorumlu ve iş paketi |
| PLAN-05 | Aktivite formu | Form | Yeni | P0 | `/is-programlari/:id/aktiviteler/yeni` | Süre, bağımlılık, takvim ve kaynak |
| PLAN-06 | Baz çizgi onayı | Onay | Yeni | P0 | `/is-programlari/:id/baz-cizgi` | Onaylı planı değiştirilemez sürüm olarak dondurma |
| PLAN-07 | Program revizyonu | Form/Onay | Yeni | P0 | `/is-programlari/:id/revizyon` | Gerekçe, etki ve yeni sürüm |
| PLAN-08 | Haftalık look-ahead | Liste/Takvim | Yeni | P1 | `/is-programlari/:id/look-ahead` | 2-6 haftalık saha planı ve engeller |
| PLAN-09 | İlerleme girişi | Form | Yeni | P0 | `/ilerleme/yeni` | Miktar, yüzde, kanıt, dönem ve onay |
| PLAN-10 | İlerleme doğrulama | Onay | Yeni | P0 | `/ilerleme/:id/dogrula` | Saha, kontrol ve hakediş bağı |
| PLAN-11 | Plan-gerçekleşen analizi | Rapor | Yeni | P1 | `/raporlar/plan-gerceklesen` | Baz çizgi ve dönem sürümüyle sapma |
| PLAN-12 | Program içe/dışa aktarma | Sihirbaz | Yeni | P2 | `/is-programlari/:id/aktarim` | Excel, Primavera/MS Project eşleme |

### Görev, iş emri ve toplantı

| Kod | Sayfa | Tip | Karar | Öncelik | Önerilen yol | Amaç |
| --- | --- | --- | --- | --- | --- | --- |
| TASK-01 | Görev listesi | Liste | Revize | P0 | `/gorevler` | Yaşam durumu ve hesaplanan gecikme ayrı |
| TASK-02 | Yeni görev | Form | Revize | P0 | `/gorevler/yeni` | Durum seçtirmeden taslak/atama akışı |
| TASK-03 | Görev detayı | Detay | Revize | P0 | `/gorevler/:id` | Alt görev, bağımlılık, yorum, kanıt ve geçmiş |
| TASK-04 | Görev şablonları | Liste/Form | Yeni | P1 | `/gorev-sablonlari` | Tekrarlanan operasyon paketleri |
| TASK-05 | Toplu görev oluşturma | Sihirbaz | Yeni | P1 | `/gorevler/toplu` | Şablon veya içe aktarma ile güvenli toplu kayıt |
| TASK-06 | İş emirleri | Liste | Yeni | P1 | `/is-emirleri` | Bakım, saha, kalite ve İSG iş emirleri |
| TASK-07 | İş emri detayı | Detay | Yeni | P1 | `/is-emirleri/:id` | Malzeme, işçilik, süre ve kabul |
| TASK-08 | Toplantılar | Liste | Revize | P2 | `/toplantilar` | Katılımcı, gündem, tutanak ve karar |
| TASK-09 | Toplantı detayı ve tutanak | Detay/Form | Revize | P2 | `/toplantilar/:id` | Kararları görev ve RFI ile ilişkilendirme |

### İSG ve çevre

| Kod | Sayfa | Tip | Karar | Öncelik | Önerilen yol | Amaç |
| --- | --- | --- | --- | --- | --- | --- |
| HSE-01 | İSG paneli | Panel | Yeni | P0 | `/isg` | Kaza, ramak kala, uygunsuzluk ve açık aksiyon |
| HSE-02 | Olay listesi | Liste | Yeni | P0 | `/isg/olaylar` | Tür ve önem derecesine göre olaylar |
| HSE-03 | Kaza bildirimi | Form | Yeni | P0 | `/isg/olaylar/kaza/yeni` | Kişi, tedavi, kayıp gün, kanıt ve resmi bildirim |
| HSE-04 | Ramak kala | Form | Yeni | P0 | `/isg/olaylar/ramak-kala/yeni` | Risk ve önleyici aksiyon |
| HSE-05 | Tehlikeli durum/davranış | Form | Yeni | P0 | `/isg/olaylar/tehlike/yeni` | Lokasyon, risk ve anlık önlem |
| HSE-06 | İSG olay detayı | Detay | Yeni | P0 | `/isg/olaylar/:id` | Araştırma, kök neden, DÖF ve doğrulama |
| HSE-07 | Saha denetimleri | Liste/Form | Yeni | P1 | `/isg/denetimler` | Kontrol listesi, bulgu ve imza |
| HSE-08 | Toolbox konuşmaları | Liste/Form | Yeni | P1 | `/isg/toolbox` | Konu, katılım ve imza |
| HSE-09 | İSG eğitimleri | Liste/Detay | Yeni | P1 | `/isg/egitimler` | Geçerlilik ve yetkinlik takibi |
| HSE-10 | KKD zimmet ve kontrol | Liste/Form | Yeni | P1 | `/isg/kkd` | Teslim, periyodik kontrol ve iade |
| HSE-11 | Çevre olayları ve atık | Liste/Form | Yeni | P2 | `/cevre` | Atık, sızıntı, ölçüm ve bertaraf belgesi |
| HSE-12 | İSG istatistik raporu | Rapor | Yeni | P1 | `/raporlar/isg` | Saat, sıklık, ağırlık ve trend; formüller açıklamalı |

### Kalite, RFI ve teknik onay

| Kod | Sayfa | Tip | Karar | Öncelik | Önerilen yol | Amaç |
| --- | --- | --- | --- | --- | --- | --- |
| QLT-01 | Kalite paneli | Panel | Yeni | P0 | `/kalite` | ITP, NCR, DÖF, test ve açık onaylar |
| QLT-02 | ITP listesi | Liste | Yeni | P0 | `/kalite/itp` | Muayene ve test planları |
| QLT-03 | ITP formu | Form | Yeni | P0 | `/kalite/itp/yeni` | Kontrol noktası, kriter, sorumlu ve kanıt |
| QLT-04 | Muayene talepleri | Liste/Form | Yeni | P0 | `/kalite/muayeneler` | Hold/witness noktaları ve sonuç |
| QLT-05 | NCR uygunsuzluk listesi | Liste | Yeni | P0 | `/kalite/ncr` | Uygunsuzluk ve yaşlandırma |
| QLT-06 | NCR formu | Form | Yeni | P0 | `/kalite/ncr/yeni` | Gereklilik, bulgu, etki ve karantina |
| QLT-07 | NCR detayı ve DÖF | Detay | Yeni | P0 | `/kalite/ncr/:id` | Kök neden, düzeltici faaliyet ve etkinlik doğrulaması |
| QLT-08 | Malzeme onayları | Liste/Form | Yeni | P0 | `/teknik/malzeme-onaylari` | Numune, katalog, revizyon ve müşavir kararı |
| QLT-09 | Submittal kayıtları | Liste/Detay | Yeni | P0 | `/teknik/submittal` | Paket, sürüm, gönderim ve karar kodu |
| QLT-10 | RFI listesi | Liste | Yeni | P0 | `/teknik/rfi` | Teknik bilgi talepleri ve SLA |
| QLT-11 | RFI formu | Form | Yeni | P0 | `/teknik/rfi/yeni` | Soru, çizim konumu, etki ve gerekli tarih |
| QLT-12 | RFI detayı | Detay | Yeni | P0 | `/teknik/rfi/:id` | Yanıt, revizyon, dağıtım ve değişiklik tetikleme |
| QLT-13 | Test ve laboratuvar sonuçları | Liste/Form | Yeni | P1 | `/kalite/testler` | Numune zinciri, sonuç ve kabul kriteri |
| QLT-14 | Punch / eksik işler | Liste/Form | Yeni | P1 | `/kalite/punch` | Lokasyon, sorumlu, son tarih ve kapanış kanıtı |

### Doküman ve çizim kontrolü

| Kod | Sayfa | Tip | Karar | Öncelik | Önerilen yol | Amaç |
| --- | --- | --- | --- | --- | --- | --- |
| DOC-01 | Doküman merkezi | Liste | Revize | P0 | `/dokumanlar` | Kanonik belge kaydı, sınıf ve yetki |
| DOC-02 | Yeni doküman | Form | Revize | P0 | `/dokumanlar/yeni` | Dosya, belge türü, sürüm ve dağıtım |
| DOC-03 | Doküman detayı | Detay | Revize | P0 | `/dokumanlar/:id` | Önizleme, sürümler, ilişkiler ve denetim |
| DOC-04 | Çizim listesi | Liste | Yeni | P0 | `/cizimler` | Disiplin, paket, revizyon ve son geçerli sürüm |
| DOC-05 | Çizim detayı | Detay | Yeni | P0 | `/cizimler/:id` | Revizyon karşılaştırma ve dağıtım |
| DOC-06 | Transmittal listesi | Liste | Yeni | P0 | `/transmittal` | Gönderi paketleri ve teslim kanıtı |
| DOC-07 | Yeni transmittal | Form | Yeni | P0 | `/transmittal/yeni` | Alıcı, belge sürümleri ve amaç kodu |
| DOC-08 | Gelen-giden evrak | Liste/Form | Revize | P1 | `/evrak` | Kayıt, havale, son tarih ve ilişki |
| DOC-09 | Belge dağıtım matrisi | Liste/Form | Yeni | P1 | `/dokumanlar/dagitim-matrisi` | Rol ve belge türüne göre kontrollü dağıtım |
| DOC-10 | Belge arşivi | Liste | Revize | P1 | `/dokumanlar/arsiv` | Saklama, imha ve hukuki bekletme |

### Personel ve İK

| Kod | Sayfa | Tip | Karar | Öncelik | Önerilen yol | Amaç |
| --- | --- | --- | --- | --- | --- | --- |
| HR-01 | Personel listesi | Liste | Revize | P0 | `/personel` | Çalışma ve atama durumu |
| HR-02 | Yeni personel | Form | Revize - referans form kalıbı | P0 | `/personel/yeni` | Sekmeli ana form, sağ özet ve belge alanı |
| HR-03 | Personel detayı | Detay | Revize | P0 | `/personel/:id` | Özlük, atama, puantaj, izin, zimmet ve kartlar |
| HR-04 | Personel düzenle | Form | Yeni | P0 | `/personel/:id/duzenle` | Alan bazlı yetki ve geçmiş |
| HR-05 | İşe giriş sihirbazı | Sihirbaz | Yeni | P1 | `/personel/:id/ise-giris` | Evrak, eğitim, zimmet, kart ve atama |
| HR-06 | İşten ayrılış sihirbazı | Sihirbaz | Yeni | P0 | `/personel/:id/isten-ayrilis` | Kart dondurma, zimmet iade, erişim ve hesaplaşma |
| HR-07 | Şantiye atamaları | Liste/Form | Revize | P0 | `/personel-atamalari` | Tarih aralıklı ve çakışma kontrollü atama |
| HR-08 | Puantaj | Liste/Form | Revize | P0 | `/puantaj` | Kaynak, vardiya, fazla mesai ve kilit |
| HR-09 | Puantaj dönem kapanışı | Onay | Yeni | P0 | `/puantaj/donem-kapanis` | Onay, kilit ve bordro aktarımı |
| HR-10 | İzin talepleri | Liste/Form | Revize | P0 | `/izinler` | Bakiye, çakışma ve vekalet |
| HR-11 | Avans talepleri | Liste/Form | Revize | P0 | `/avanslar` | Limit, ödeme ve mahsup |
| HR-12 | Sağlık ve uygunluk | Liste/Detay | Yeni | P1 | `/personel-saglik` | İşe uygunluk ve süreli kontroller |
| HR-13 | Yetkinlik ve sertifikalar | Liste/Detay | Yeni | P1 | `/yetkinlikler` | Göreve uygunluk ve bitiş uyarısı |
| HR-14 | Çalışan self-servis | Portal | Yeni | P2 | `/calisan` | Kendi izin, puantaj, kart, belge ve görevleri |

### Satın alma ve tedarik

| Kod | Sayfa | Tip | Karar | Öncelik | Önerilen yol | Amaç |
| --- | --- | --- | --- | --- | --- | --- |
| PRC-01 | Satın alma talepleri | Liste | Revize | P0 | `/satinalma/talepler` | İhtiyaç, bütçe ve onay durumu |
| PRC-02 | Yeni satın alma talebi | Form | Revize | P0 | `/satinalma/talepler/yeni` | Kalem, teknik şart, teslim yeri ve maliyet kodu |
| PRC-03 | Talep detayı | Detay | Revize | P0 | `/satinalma/talepler/:id` | Sürüm, onay, RFQ ve sipariş ilişkisi |
| PRC-04 | Teklif talepleri RFQ | Liste/Form | Yeni | P0 | `/satinalma/rfq` | Tedarikçi gönderimi ve teklif son tarihi |
| PRC-05 | Teklif toplama portalı | Portal | Yeni | P1 | `/tedarikci/teklif/:token` | Güvenli dış teklif girişi |
| PRC-06 | Teklif karşılaştırma | Karşılaştırma | Yeni | P0 | `/satinalma/karsilastirma/:id` | Teknik, ticari ve toplam maliyet |
| PRC-07 | Satın alma siparişleri | Liste | Revize | P0 | `/satinalma/siparisler` | Onaylı sipariş ve kalan teslim |
| PRC-08 | Yeni sipariş | Form | Revize | P0 | `/satinalma/siparisler/yeni` | Onaylı kaynaktan dönüşüm |
| PRC-09 | Sipariş detayı | Detay | Revize | P0 | `/satinalma/siparisler/:id` | Teslim, fatura, iade ve değişiklik |
| PRC-10 | Sipariş değişikliği | Form/Onay | Yeni | P0 | `/satinalma/siparisler/:id/revizyon` | Miktar, fiyat, termin ve kapsam sürümü |
| PRC-11 | Tedarikçiler | Liste | Revize | P1 | `/tedarikciler` | Onay, risk, kategori ve performans |
| PRC-12 | Tedarikçi detayı | Detay | Revize | P1 | `/tedarikciler/:id` | Belgeler, sözleşmeler, performans ve cari |
| PRC-13 | Tedarikçi değerlendirme | Form/Rapor | Yeni | P1 | `/tedarikciler/:id/degerlendirme` | Kalite, termin, fiyat ve İSG puanı |

### Depo, stok ve teslim

| Kod | Sayfa | Tip | Karar | Öncelik | Önerilen yol | Amaç |
| --- | --- | --- | --- | --- | --- | --- |
| STK-01 | Depolar | Liste/Detay | Revize | P0 | `/depolar` | Şantiye ve merkezi depo bağlamı |
| STK-02 | Stok kartları | Liste/Detay | Revize | P0 | `/stok-kartlari` | Birim, lot/seri, min-max ve kod |
| STK-03 | Mal kabul | Liste | Yeni | P0 | `/mal-kabul` | Siparişe bağlı kabul kayıtları |
| STK-04 | Yeni mal kabul | Form | Yeni | P0 | `/mal-kabul/yeni` | Miktar, irsaliye, kalite, lot ve fotoğraf |
| STK-05 | Mal kabul detayı | Detay | Yeni | P0 | `/mal-kabul/:id` | Kabul/ret/karantina ve fatura ilişkisi |
| STK-06 | Stok rezervasyonu | Liste/Form | Yeni | P0 | `/stok/rezervasyonlar` | İş paketi için ayrılan stok |
| STK-07 | Depolar arası transfer | Liste/Form | Revize | P0 | `/stok/transferler` | Çıkış, yolda, teslim ve fark |
| STK-08 | Sarf ve iade | Liste/Form | Yeni | P0 | `/stok/sarf` | İş paketi, ekip ve maliyet kaydı |
| STK-09 | Stok sayımı | Sihirbaz | Yeni | P1 | `/stok/sayim` | Kör sayım, fark onayı ve düzeltme |
| STK-10 | Stok hareket defteri | Liste/Rapor | Yeni | P0 | `/stok/hareketler` | Değişmez hareket günlüğü ve bakiye |

### Sözleşme, metraj, hakediş ve değişiklik

| Kod | Sayfa | Tip | Karar | Öncelik | Önerilen yol | Amaç |
| --- | --- | --- | --- | --- | --- | --- |
| CNT-01 | Sözleşmeler | Liste | Revize | P0 | `/sozlesmeler` | İşveren, taşeron ve tedarik sözleşmeleri |
| CNT-02 | Yeni sözleşme | Form | Revize | P0 | `/sozlesmeler/yeni` | Kullanıcıya onay durumu seçtirmeyen taslak |
| CNT-03 | Sözleşme detayı | Detay | Revize | P0 | `/sozlesmeler/:id` | Kapsam, bedel, teminat, zeyil ve hakediş |
| CNT-04 | Zeyil ve ek protokol | Liste/Form | Yeni | P0 | `/sozlesmeler/:id/zeyiller` | Sürüm, etki ve onay |
| CNT-05 | Teminatlar | Liste/Detay | Yeni | P0 | `/teminatlar` | Tutar, geçerlilik, iade ve uyarı |
| CNT-06 | Metraj cetvelleri | Liste/Form | Yeni | P0 | `/metraj` | Poz, mahal, miktar, revizyon ve kanıt |
| CNT-07 | Hakedişler | Liste | Revize | P0 | `/hakedisler` | Dönem ve sözleşme bazlı hakediş |
| CNT-08 | Yeni hakediş | Sihirbaz | Revize | P0 | `/hakedisler/yeni` | Onaylı metraj ve ilerlemeden üretim |
| CNT-09 | Hakediş detayı | Detay/Çıktı | Revize | P0 | `/hakedisler/:id` | Kesinti, vergi, imza, ödeme ve sürüm |
| CNT-10 | Değişiklik talepleri | Liste | Yeni | P0 | `/degisiklikler` | Kapsam, süre ve maliyet etkisi |
| CNT-11 | Yeni değişiklik talebi | Form | Yeni | P0 | `/degisiklikler/yeni` | Kaynak olay, kanıt ve ön etki |
| CNT-12 | Değişiklik emri | Detay/Onay | Yeni | P0 | `/degisiklikler/:id` | Teklif, müzakere, onay ve baz çizgi güncelleme |
| CNT-13 | Gecikme olayları | Liste/Form | Yeni | P0 | `/gecikme-olaylari` | Olay tarihi, sorumluluk, etki ve bildirim süresi |
| CNT-14 | Süre uzatım talepleri | Liste/Form | Revize | P0 | `/sure-uzatim` | Talep sahibine durum/onaycı seçtirmeyen akış |
| CNT-15 | Claim / talep dosyaları | Liste/Detay | Yeni | P1 | `/claimler` | Olay, sözleşme maddesi, süre/maliyet ve yazışma |

### Finans, bütçe ve muhasebe hazırlığı

| Kod | Sayfa | Tip | Karar | Öncelik | Önerilen yol | Amaç |
| --- | --- | --- | --- | --- | --- | --- |
| FIN-01 | Finans paneli | Panel | Revize | P0 | `/finans` | Nakit, alacak, borç, bütçe ve onay |
| FIN-02 | Bütçeler | Liste/Detay | Revize | P0 | `/butceler` | Proje, WBS ve maliyet kodu bazlı sürüm |
| FIN-03 | Bütçe revizyonu | Form/Onay | Yeni | P0 | `/butceler/:id/revizyon` | Aktarma, ek bütçe ve gerekçe |
| FIN-04 | Tahmin ve EAC | Liste/Rapor | Yeni | P1 | `/tahminler` | Taahhüt, gerçekleşen ve kalan maliyet |
| FIN-05 | Kasalar | Liste/Detay | Revize | P0 | `/kasalar` | Para birimi, sorumlu ve mutabakat |
| FIN-06 | Kasa hareketleri | Liste/Form | Revize | P0 | `/kasa-hareketleri` | Belge ve onayla değişmez hareket |
| FIN-07 | Banka hesapları | Liste/Detay | Revize | P0 | `/banka-hesaplari` | Yetkili hesaplar ve entegrasyon durumu |
| FIN-08 | Banka hareketleri | Liste | Revize | P0 | `/banka-hareketleri` | İçe aktarma ve eşleştirme |
| FIN-09 | Banka hareketi eşleştirme | Mutabakat | Yeni | P0 | `/banka-hareketleri/eslestirme` | Cari, fatura, ödeme ve kart hesabı eşleştirme |
| FIN-10 | Cari hesaplar | Liste/Detay | Revize | P0 | `/cariler` | Müşteri, tedarikçi, personel ve taşeron |
| FIN-11 | Ödeme talepleri | Liste/Form | Yeni | P0 | `/odemeler` | Vade, bütçe, belge ve onay |
| FIN-12 | Ödeme planı | Takvim/Liste | Yeni | P1 | `/odemeler/plan` | Nakit önceliği ve onaylı ödeme takvimi |
| FIN-13 | Fatura kayıtları | Liste/Detay | Revize | P0 | `/faturalar` | Sipariş, teslim ve sözleşme ilişkisi |
| FIN-14 | Üçlü eşleştirme | Kontrol | Yeni | P0 | `/faturalar/eslestirme` | Sipariş, mal kabul ve fatura toleransı |
| FIN-15 | Dönem kapanışı | Sihirbaz | Yeni | P1 | `/finans/donem-kapanis` | Mutabakat, kilit ve yeniden açma yetkisi |

### Kartlar

| Kod | Sayfa | Tip | Karar | Öncelik | Önerilen yol | Amaç |
| --- | --- | --- | --- | --- | --- | --- |
| CRD-01 | Kart paneli | Panel | Yeni | P0 | `/kartlar` | Şirket, sağlayıcı, kart türü, bakiye ve bekleyen işlem özeti |
| CRD-02 | Tüm kartlar | Liste | Yeni - Pluxee sayfasını genelleştir | P0 | `/kartlar/liste` | Pluxee, MultiNet, kredi, yakıt ve diğer kartlar |
| CRD-03 | Yeni kart | Form | Yeni | P0 | `/kartlar/yeni` | Sağlayıcı, hesap, ürün, kart ve şirket bağlamı |
| CRD-04 | Kart detayı | Detay | Yeni | P0 | `/kartlar/:id` | Bakiye, limit, atama, hareket, belge ve geçmiş |
| CRD-05 | Kart düzenle | Form | Yeni | P0 | `/kartlar/:id/duzenle` | Maskeli numara ve izinli alanlar |
| CRD-06 | Kart atama ve devir | Form/Sihirbaz | Yeni | P0 | `/kartlar/:id/atama` | Bir kartta tek aktif atama, personelde çoklu kart |
| CRD-07 | Pluxee (eski Sodexo) | Sağlayıcı görünümü | Revize | P0 | `/kartlar/pluxee` | Pluxee hesap ve kartlarının filtrelenmiş görünümü |
| CRD-08 | MultiNet | Sağlayıcı görünümü | Yeni | P0 | `/kartlar/multinet` | MultiNet hesap ve kartlarının filtrelenmiş görünümü |
| CRD-09 | Sağlayıcı hesapları | Liste/Form | Yeni | P0 | `/kartlar/saglayicilar` | Şirketin aynı sağlayıcıda birden çok kurumsal hesabı |
| CRD-10 | Yükleme partileri | Liste | Yeni | P0 | `/kartlar/yuklemeler` | Aylık/toplu yükleme paketleri ve sonuçları |
| CRD-11 | Yeni toplu yükleme | Sihirbaz | Yeni | P0 | `/kartlar/yuklemeler/yeni` | Personel uygunluğu, tutar, onay ve sağlayıcı gönderimi |
| CRD-12 | Yükleme parti detayı | Detay | Yeni | P0 | `/kartlar/yuklemeler/:id` | Satır bazlı başarılı, hatalı, tekrar ve iptal |
| CRD-13 | Kart hareketleri | Liste | Revize | P0 | `/kartlar/hareketler` | Değişmez defter; yükleme, harcama, iade ve ters kayıt |
| CRD-14 | Kart mutabakatı | Mutabakat | Yeni | P0 | `/kartlar/mutabakat` | Sağlayıcı ekstresi, iç defter ve banka eşleştirmesi |
| CRD-15 | Kayıp/çalıntı/yenileme | Sihirbaz | Yeni | P0 | `/kartlar/:id/guvenlik` | Anlık dondurma, yeniden basım ve bakiye devri |
| CRD-16 | Kart onayları | Liste | Yeni | P0 | `/kartlar/onaylar` | Yükleme, limit, düzeltme ve iptal kararları |
| CRD-17 | Kart raporları | Rapor | Yeni | P1 | `/raporlar/kartlar` | Sağlayıcı, şirket, proje, kişi ve dönem analizi |
| CRD-18 | Kart sağlayıcı entegrasyonları | Ayar/İzleme | Yeni | P0 | `/ayarlar/entegrasyonlar/kartlar` | Kimlik bilgisi, eşleme, webhook, retry ve sağlık |

### Varlık, ekipman ve filo

| Kod | Sayfa | Tip | Karar | Öncelik | Önerilen yol | Amaç |
| --- | --- | --- | --- | --- | --- | --- |
| AST-01 | Varlık listesi | Liste | Revize | P0 | `/varliklar` | Demirbaş, makine, ekipman ve araç |
| AST-02 | Yeni varlık | Form | Revize | P0 | `/varliklar/yeni` | Kategoriye göre koşullu alanlar |
| AST-03 | Varlık detayı | Detay | Revize | P0 | `/varliklar/:id` | Zimmet, lokasyon, bakım, belge ve maliyet |
| AST-04 | Zimmet ve devir | Liste/Form | Revize | P0 | `/zimmetler` | Teslim, iade, hasar ve imza |
| AST-05 | Bakım planları | Liste/Form | Yeni | P1 | `/bakim-planlari` | Sayaç veya tarihe bağlı plan |
| AST-06 | Bakım iş emirleri | Liste/Detay | Yeni | P1 | `/bakim-is-emirleri` | Arıza, parça, işçilik ve kabul |
| AST-07 | Kalibrasyon ve periyodik kontrol | Liste | Yeni | P1 | `/varlik-kontrolleri` | Geçerlilik ve kullanım engeli |
| AST-08 | Araçlar | Liste/Detay | Revize | P1 | `/araclar` | Ruhsat, sigorta, muayene ve sürücü |
| AST-09 | Yakıt ve kilometre | Liste/Form | Revize | P1 | `/araclar/yakit` | Kart, fiş, sayaç ve tüketim anomali kontrolü |
| AST-10 | Kaza, ceza ve hasar | Liste/Form | Yeni | P1 | `/araclar/olaylar` | Sürücü, olay, belge ve maliyet |
| AST-11 | QR/barkod işlem ekranı | Mobil | Yeni | P1 | `/tara` | Varlık, stok, bakım ve zimmet hızlı işlemi |

### Müşteri, satış ve dış portallar

| Kod | Sayfa | Tip | Karar | Öncelik | Önerilen yol | Amaç |
| --- | --- | --- | --- | --- | --- | --- |
| EXT-01 | Müşteri ve işverenler | Liste/Detay | Revize | P2 | `/musteriler` | Taraf, proje ve sözleşme ilişkisi |
| EXT-02 | Fırsat ve teklif | Liste/Detay | Revize | P2 | `/firsatlar` | Satıştan projeye kontrollü dönüşüm |
| EXT-03 | Teklif hazırlama | Form/Çıktı | Revize | P2 | `/teklifler` | Sürüm, maliyet tabanı ve onay |
| EXT-04 | Müşteri portalı | Portal | Revize | P1 | `/portal/musteri` | İlerleme, RFI, onay, doküman ve hakediş |
| EXT-05 | Taşeron portalı | Portal | Yeni | P1 | `/portal/taseron` | Puantaj, hakediş, belge ve iş emri |
| EXT-06 | Tedarikçi portalı | Portal | Yeni | P1 | `/portal/tedarikci` | Teklif, sipariş, teslim ve fatura |
| EXT-07 | Saha mobil ana sayfa | Mobil | Yeni | P1 | `/mobil` | Çevrimdışı günlük rapor, görev, kalite ve İSG |
| EXT-08 | Kiosk | Kiosk | Revize | P2 | `/kiosk` | Yetkili cihaz, vardiya ve çevrimdışı kuyruk |

### Raporlama ve çıktılar

| Kod | Sayfa | Tip | Karar | Öncelik | Önerilen yol | Amaç |
| --- | --- | --- | --- | --- | --- | --- |
| RPT-01 | Rapor merkezi | Liste | Revize | P0 | `/raporlar` | Tüm raporların tek katalog ve yetki modeli |
| RPT-02 | Standart rapor görüntüleyici | Rapor | Yeniden kur | P0 | `/raporlar/:kod` | Ortak filtre, başlık, veri tarihi, dışa aktarım ve yazdırma |
| RPT-03 | Proje portföy raporu | Rapor | Revize | P1 | `/raporlar/proje-portfoyu` | İlerleme, sağlık, risk ve bütçe |
| RPT-04 | Şantiye günlük özet | Rapor | Yeni | P1 | `/raporlar/santiye-gunluk` | Üretim, insan, makine, olay ve fotoğraf |
| RPT-05 | Maliyet ve bütçe sapma | Rapor | Revize | P0 | `/raporlar/maliyet` | Bütçe, taahhüt, gerçekleşen ve EAC |
| RPT-06 | Nakit akışı | Rapor | Revize | P1 | `/raporlar/nakit-akisi` | Vade ve onaylı tahmin |
| RPT-07 | Satın alma çevrim süresi | Rapor | Yeni | P1 | `/raporlar/satinalma` | Talep, onay, teklif, sipariş ve teslim süreleri |
| RPT-08 | Stok ve tüketim | Rapor | Revize | P1 | `/raporlar/stok` | Devir, fire, sarf ve anomaliler |
| RPT-09 | Personel ve puantaj | Rapor | Revize | P1 | `/raporlar/personel` | Çalışma, fazla mesai, izin ve eksik kayıt |
| RPT-10 | İSG ve kalite | Rapor | Yeni | P1 | `/raporlar/isg-kalite` | Olay, NCR, DÖF, denetim ve kapanış |
| RPT-11 | Sözleşme ve hakediş | Rapor | Revize | P1 | `/raporlar/sozlesme` | Bedel, zeyil, hakediş ve kesinti |
| RPT-12 | Varlık ve bakım | Rapor | Yeni | P2 | `/raporlar/varlik` | Kullanılabilirlik, maliyet ve gecikmiş bakım |
| RPT-13 | Kartlar raporu | Rapor | Yeni | P1 | `/raporlar/kartlar` | Pluxee, MultiNet ve diğer kartlar |
| RPT-14 | Zamanlanmış raporlar | Liste/Form | Yeni | P2 | `/raporlar/zamanlama` | Yetkili alıcılara periyodik çıktı |
| RPT-15 | Rapor tanım ve formül sözlüğü | Referans | Yeni | P0 | `/raporlar/sozluk` | KPI formülü, kaynak, sürüm ve sahibi |

### Ayarlar, yetki, iş akışı ve entegrasyon

| Kod | Sayfa | Tip | Karar | Öncelik | Önerilen yol | Amaç |
| --- | --- | --- | --- | --- | --- | --- |
| SET-01 | Şirketler | Liste/Detay | Revize | P0 | `/ayarlar/sirketler` | Tenant ve tüzel kişi ayrımı |
| SET-02 | Şirket ayarları | Form | Revize | P0 | `/ayarlar/sirket` | Kimlik, para birimi, dönem ve politika |
| SET-03 | Kullanıcılar | Liste/Detay | Revize | P0 | `/ayarlar/kullanicilar` | Hesap, şirket, rol, proje ve oturumlar |
| SET-04 | Roller ve yetkiler | Matris | Yeniden kur | P0 | `/ayarlar/roller` | Sunucu tarafı RBAC ve ABAC kuralları |
| SET-05 | Veri kapsamı kuralları | Matris | Yeni | P0 | `/ayarlar/veri-kapsami` | Şirket, proje, şantiye, kayıt sahibi ve tutar |
| SET-06 | İş akışı şablonları | Liste/Form | Yeni | P0 | `/ayarlar/is-akislari` | Sürüm, eşik, sıra, paralel adım ve SLA |
| SET-07 | Onay vekaletleri | Liste/Form | Yeni | P0 | `/ayarlar/vekaletler` | Tarih aralıklı ve çakışma kontrollü vekalet |
| SET-08 | Bildirim kuralları | Liste/Form | Yeni | P1 | `/ayarlar/bildirimler` | Olay, kanal, alıcı ve tekrar |
| SET-09 | Numaralandırma şablonları | Liste/Form | Yeni | P1 | `/ayarlar/numaralandirma` | Belge ve işlem kodları |
| SET-10 | Durum ve sözlük yönetimi | Liste/Form | Revize | P1 | `/ayarlar/sozlukler` | Kontrollü ana veriler; çekirdek durumlar kilitli |
| SET-11 | Maliyet kodları ve WBS eşleme | Ağaç/Form | Yeni | P0 | `/ayarlar/maliyet-kodlari` | Bütçe, satın alma, stok ve hakediş ortak dili |
| SET-12 | Belge türleri ve saklama | Liste/Form | Yeni | P1 | `/ayarlar/belge-turleri` | Zorunluluk, süre ve erişim |
| SET-13 | Entegrasyon kataloğu | Liste | Yeni | P0 | `/ayarlar/entegrasyonlar` | ERP, banka, e-belge, kart, SSO ve depolama |
| SET-14 | Entegrasyon detayı | Ayar/İzleme | Yeni | P0 | `/ayarlar/entegrasyonlar/:id` | Gizli anahtar, eşleme, sağlık ve olaylar |
| SET-15 | Entegrasyon işlem günlüğü | Liste/Detay | Yeni | P0 | `/ayarlar/entegrasyon-loglari` | İstek kimliği, retry, hata ve yeniden oynatma |
| SET-16 | Denetim izi | Liste/Detay | Yeni | P0 | `/ayarlar/denetim-izi` | Kim, neyi, ne zaman, neden değiştirdi |
| SET-17 | Arşiv ve saklama işleri | Liste | Yeni | P1 | `/ayarlar/arsiv` | Saklama, anonimleştirme ve silme işleri |
| SET-18 | Özellik bayrakları | Liste/Form | Yeni | P2 | `/ayarlar/ozellikler` | Kademeli yayın ve geri alma |
| SET-19 | Sistem sağlığı | Panel | Yeni | P0 | `/ayarlar/sistem-sagligi` | Kuyruk, entegrasyon, depolama ve hata oranı |

**Hedef katalog toplamı:** 244 sayfa ailesi. Form, detay, çıktı ve sistem durumu varyantları manifestoda ayrı rota olarak tutulmalıdır. Mevcut 240 ekran, bu hedef ailelere eşlenerek `koru / birleştir / yönlendir / kaldır` kararıyla temizlenmelidir.

## 5. Algoritma ve veri omurgası revizyonu

### 5.1 Kanonik veri ve kimlik

`tenant/company -> project -> site -> cost center/WBS` bağlamı tüm operasyon kayıtlarının ortak omurgasıdır. Personel, tedarikçi, belge, kart, sözleşme, bütçe, görev ve varlık gibi ana varlıklar benzersiz kimlik taşır. Liste, form, detay, rapor ve çıktı aynı kimliği sorgular. Para tutarları ondalık güvenli tip ve para birimiyle; tarih/saatler UTC saklanıp kullanıcı saat diliminde gösterilir. Her kayıtta `created_by`, `created_at`, `updated_by`, `updated_at`, `version`, `status`, `tenant_id` ve gerekli bağlam kimlikleri bulunur.

### 5.2 Merkezi durum ve geçiş motoru

Durum alanları serbest seçim kutusu değildir. Her nesne türü için izinli geçiş, yetkili rol, ön koşul, zorunlu gerekçe, belge, onay ve yan etki tanımlanır. Sunucu, mevcut sürüm ve kullanıcının veri kapsamına göre geçişi doğrular. Her geçiş tek transaction içinde iş nesnesi, audit kaydı, görev ve bildirim üretir. Başarısız yan etki iş kuyruğunda güvenli tekrar edilir.

| Nesne | Önerilen temel durumlar | Hesaplanan işaretler |
| --- | --- | --- |
| Proje/Şantiye | taslak > hazırlık > aktif > askıda > kapanışta > kapalı > arşiv | takvimde, riskli, gecikmiş, bütçe aşımı |
| Görev | taslak > atama bekliyor > açık > devam ediyor > doğrulamada > tamamlandı / iptal | gecikmiş, bloke, SLA riski |
| Talep/Sözleşme/Hakediş | taslak > onaya gönderildi > incelemede > revizyon istendi > onaylandı / reddedildi / iptal | süresi aştı, bütçe etkisi, ödeme bekliyor |
| Saha bildirimi | yeni > sınıflandırıldı > atandı > işlemde > doğrulamada > kapalı / iptal | kritik, SLA aşıldı, tekrar eden |
| Kart yükleme partisi | taslak > doğrulandı > onay bekliyor > sağlayıcıya gönderiliyor > kısmi/başarılı/hatalı > mutabık > kapalı | retry gerekli, fark var, banka eşleşmedi |

### 5.3 Merkezi onay motoru

Onay şablonu; nesne türü, şirket, proje, tutar aralığı, maliyet kodu, risk sınıfı ve işlem türüne göre seçilir. Adımlar sıralı veya paralel olabilir. Talep sahibi kendi kaydını onaylayamaz; gerekli yerlerde dört göz ilkesi uygulanır. Onaycı kullanıcı adı formdan seçilmez; rol ve bağlamdan çözülür. Vekaletler süreli ve audit kayıtlıdır. Revizyon sonrası önceki onaylar politika gereğine göre geçersizleşir. Ret ve revizyon talebinde gerekçe zorunludur. Onay ekranı karar verilen sürümü sabit olarak göstermelidir.

### 5.4 Sürüm, iptal ve arşiv

Sözleşme, iş programı, bütçe, hakediş, RFI yanıtı, submittal ve yükleme partileri sürümlüdür. Onaylı sürüm yerinde değiştirilmez; yeni revizyon açılır. İptal, finans/stok/kart etkisi oluşmuşsa ters kayıt ve gerekçeyle yapılır. Arşiv, aktif listeden kaldırır ancak denetim izini bozmaz. Fiziksel silme yalnızca yetkili veri saklama işiyle ve hukuki/finansal engel yoksa uygulanır.

### 5.5 Proje ilerleme algoritması

İlerleme, proje veya şantiye formunda elle yazılan tek bir yüzde değildir. Onaylı WBS ağırlıkları toplamı yüzde 100 olmalıdır. Aktivite ilerlemesi; ölçülebilir miktar, kilometre taşı veya süre ağırlığı yöntemlerinden biriyle hesaplanır. Proje ilerlemesi `sum(WBS ağırlığı x onaylı aktivite ilerlemesi)` formülüdür. Tahmin edilen ve onaylı ilerleme ayrı tutulur. Hakedişe aktarım yalnızca doğrulanmış miktarlardan yapılır. Baz çizgi ve rapor dönemi sürümü her raporda görünür.

### 5.6 Satın alma ve stok bütünlüğü

Talep onaylanmadan sipariş üretilemez. Sipariş revizyonu eski siparişi sessizce değiştirmez. Mal kabul sipariş kalemine bağlanır; kısmi kabul, ret ve karantina ayrı miktarlardır. Fatura kontrolü sipariş, kabul ve fatura üçlü eşleştirmesiyle yapılır; tolerans dışı fark onaya gider. Stok bakiyesi elle güncellenmez; giriş, rezervasyon, transfer, sarf, iade, sayım farkı ve ters kayıtlardan türetilir. Negatif stok şirket politikasıyla engellenir veya ayrı yetki/onay ister.

### 5.7 Güvenlik ve yetki

Menüyü gizlemek güvenlik değildir. Tüm API işlemleri sunucu tarafında tenant, şirket, proje, şantiye, rol, kayıt sahibi, tutar ve hassas alan kurallarını doğrular. Maaş, sağlık, kişisel kart harcama detayı ve gizli belgeler alan düzeyinde korunur. Hassas dışa aktarımlar filigran, kayıt ve gerektiğinde ikinci onay kullanır. Entegrasyon anahtarları tarayıcıya verilmez; gizli kasa/vault içinde tutulur. Audit kayıtları değiştirilemez ve olağan dışı erişim için alarm üretilir.

## 6. Kartlar modülü - ayrıntılı tasarım

### 6.1 Adlandırma ve kapsam

Üst menü başlığı **Kartlar** olacaktır. Alt filtre/görünümler `Tümü`, `Pluxee (eski Sodexo)`, `MultiNet`, `Kurumsal Kredi Kartları`, `Yakıt/HGS` ve `Diğer` biçiminde yapılandırılabilir. Sodexo Avantaj'ın Türkiye'de 2024 marka dönüşümüyle Pluxee olarak devam ettiği resmi Pluxee içeriğinde belirtilmektedir. Bu nedenle yeni kayıt sağlayıcısı `Pluxee`, kullanıcıya görünen yardımcı ad `Pluxee (eski Sodexo)` olmalıdır. Eski içe aktarımlarda `Sodexo` değeri tarihsel sağlayıcı adı olarak korunur ve Pluxee sağlayıcı ailesine eşlenir. MultiNet, MultiNet Up sağlayıcı ailesi altında tutulur. Sağlayıcılar kod içinde sabit if/else bloklarıyla değil adaptör ve ürün tanımıyla genişletilir.

Şirketler aynı anda birden fazla sağlayıcı, aynı sağlayıcıda birden fazla kurumsal hesap ve her hesap altında çok sayıda kart kullanabilir. Bir personelin birden fazla kartı olabilir; fakat aynı fiziksel/virtual kart için tarih aralıkları çakışan iki aktif atama olamaz. Havuz kartları personele atanmadan proje, şantiye, departman veya araç bağlamında tutulabilir.

### 6.2 Veri modeli

| Varlık | Zorunlu alanlar | Kritik kural |
| --- | --- | --- |
| CardProvider | kod, ad, eski adlar, sağlayıcı türü, aktiflik | Sağlayıcı adı değişse bile kod sabit kalır. |
| ProviderAccount | şirket, sağlayıcı, müşteri/hesap no, para birimi, ürün, entegrasyon | Bir şirkette birden çok hesap olabilir; gizli bilgiler vault'tadır. |
| Card | hesap, ürün, maskeli no/token, fiziksel/sanal, durum, son kullanım | Tam kart numarası log, rapor veya istemcide tutulmaz/gösterilmez. |
| CardAssignment | kart, kişi/araç/proje, başlangıç, bitiş, teslim/iade | Kart başına tek çakışmayan aktif atama; geçmiş değişmez. |
| CardPolicy | ürün, dönem, limit/yükleme kuralı, uygunluk, onay | Politika etkili tarihli ve sürümlüdür; vergi tutarı kodda sabit değildir. |
| CardLoadBatch | şirket, hesap, dönem, kaynak, toplam, sürüm, durum | Aynı kaynak/dönem için idempotency ve mükerrer kontrolü. |
| CardLoadItem | parti, kart, personel, tutar, durum, sağlayıcı referansı | Satır bazlı kısmi başarı ve güvenli tekrar. |
| CardTransaction | kart, tür, tutar, para birimi, zaman, durum, sağlayıcı ref | Değişmez hareket; düzeltme yeni ters/düzeltme kaydıdır. |
| CardReconciliation | hesap, dönem, iç toplam, sağlayıcı toplamı, banka toplamı | Fark sıfır veya onaylı açıklama olmadan kapanamaz. |
| IntegrationEvent | sağlayıcı, istek kimliği, idempotency key, durum, retry | Hassas payload maskelenir; aynı olay iki kez muhasebeleşmez. |

### 6.3 Kart yaşam döngüsü

Kart durumları `sipariş edildi > basımda > aktiflenebilir > aktif > geçici bloke > kayıp/çalıntı > yenilemede > iptal > süresi doldu > arşiv` olarak yönetilir. `Aktif` geçişi sağlayıcı onayı, geçerli hesap ve gerekli atama/politika kontrollerine bağlıdır. Kayıp/çalıntı eylemi kullanıcı onayı beklemeden kartı güvenli biçimde bloke etmeyi dener; başarısız sağlayıcı çağrısı kritik alarm ve tekrar kuyruğu üretir. Yenilemede eski kart, yeni kart ve bakiye devir işlemi aynı vaka altında izlenir. İşten ayrılış sihirbazı kişiye bağlı kartları dondurmadan tamamlanamaz.

### 6.4 Toplu yükleme algoritması

1. Kullanıcı şirket, sağlayıcı hesabı, ürün, dönem ve yükleme kaynağını seçer.
2. Sistem uygun personeli aktif çalışma/atama, kart durumu, politika, ücretsiz izin/ayrılış ve önceki yükleme kayıtlarına göre hesaplar.
3. Gün ve tutar formülü etkili tarihli politikadan gelir; kullanıcı yalnızca yetkisi varsa istisna önerebilir ve gerekçe yazar.
4. Mükerrer kart, mükerrer dönem, para birimi, negatif/sıfır tutar, pasif kart, ayrılmış personel ve limit kontrolleri yapılır.
5. Parti sürümü dondurulur ve toplam tutara göre onay şablonu çözülür.
6. Onaydan sonra sağlayıcıya idempotency key ile gönderilir. Zaman aşımı, başarısızlık anlamına gelmez; önce sağlayıcıdan durum sorgulanır.
7. Sonuçlar satır bazında başarılı, reddedildi, beklemede veya teknik hata olarak kaydedilir. Yalnızca teknik hata güvenli tekrar edilir.
8. İç defter, sağlayıcı ekstresi ve banka çıkışı mutabık olmadan parti kapatılmaz.

### 6.5 Hareket ve bakiye algoritması

Bakiye formdan doğrudan değiştirilmez. `Kullanılabilir bakiye = kesinleşmiş yükleme + iade + olumlu düzeltme - kesinleşmiş harcama - ters/olumsuz düzeltme`; bekleyen işlemler ayrı gösterilir. Sağlayıcı bakiyesi ile iç defter bakiyesi farklıysa kullanıcıya iki rakam ve fark nedeni gösterilir. Manuel harcama girişi normal akış değildir; sağlayıcıdan gelmeyen istisnai düzeltme çift onay, belge ve ters kayıt mekanizması ister. Harcama satırları çalışan gizliliği gözetilerek yetkilendirilir; yönetici raporunda gereksiz üye işyeri/personel detayı maskelenir veya toplulaştırılır.

### 6.6 Entegrasyon sözleşmesi

Her sağlayıcı adaptörü şu yetenekleri bildirmelidir: hesap doğrulama, kart senkronizasyonu, bakiye sorgusu, yükleme gönderimi, yükleme durumu, hareket/ekstre alma, kart bloke/açma, webhook doğrulama ve mutabakat dosyası. Sağlayıcı bu işlevlerden birini desteklemiyorsa sistem kontrollü dosya içe/dışa aktarma akışına düşer. API ve dosya eşlemeleri sürümlüdür. Webhook imzası doğrulanır; tekrar eden olaylar event kimliğiyle tekilleştirilir. Circuit breaker, artan beklemeli retry, dead-letter kuyruğu ve operasyon ekranı zorunludur.

### 6.7 Kart yetki matrisi

| Rol | Görebilir | Yapabilir | Göremez/Yapamaz |
| --- | --- | --- | --- |
| Çalışan | Kendi kartı, bakiye ve izinli hareketler | Kayıp bildir, kendi ekstresini indir | Başka kişi, toplu yükleme ve şirket toplamı |
| İK | Uygunluk, atama, kart durumu | Kart talebi/atama ve yükleme taslağı | Banka mutabakatı ve gizli entegrasyon anahtarı |
| Finans | Hesap, parti, toplam, hareket ve mutabakat | Onaylı yüklemeyi gönder, mutabakat yap | Gereksiz kişisel harcama ayrıntısı |
| Yönetici | Yetkili şirket/proje özetleri | Politika dahilinde onay | Tam kart no, entegrasyon sırrı |
| Sistem yöneticisi | Teknik durum ve maskeli kimlik | Entegrasyon yapılandır ve erişim ata | İşlem onayı veya kişisel harcama içeriği |
| Denetçi | Salt okunur kayıt, sürüm ve audit | Kanıt/rapor dışa aktar | Kayıt değiştirme veya yeniden gönderme |

## 7. Eksik kritik modüller ve algoritmik bağlar

| Kaynak olay | Zorunlu hedef bağlantı | Otomatik sonuç |
| --- | --- | --- |
| Saha bildirimi - İSG | İSG olayı ve görev | Önem derecesine göre bildirim, SLA ve inceleme |
| Saha bildirimi - kalite | NCR/ITP/muayene | Karantina, DÖF ve doğrulama |
| RFI yanıtı kapsam etkiliyor | Değişiklik talebi ve iş programı | Süre/maliyet etki incelemesi |
| Onaylı ilerleme | Hakediş ve proje raporu | Aynı dönem/sürüm üzerinden miktar aktarımı |
| Satın alma siparişi | Mal kabul, stok ve fatura | Kalan teslim, taahhüt maliyeti ve üçlü eşleştirme |
| Mal kabul ret/karantina | Tedarikçi, kalite ve stok | Kullanılabilir stok oluşmaz; düzeltme görevi açılır |
| Personel işten ayrılış | Kart, zimmet, erişim, puantaj | Açık engeller kapanmadan süreç tamamlanmaz |
| Kart yükleme onayı | Sağlayıcı, kart defteri, banka | İdempotent gönderim ve mutabakat |
| Varlık kontrol süresi doldu | Varlık durumu ve iş emri | Kullanım engeli ve bakım görevi |
| Şantiye kapanış | Stok, varlık, kasa, belge, açık iş | Engel listesi sıfırlanmadan kapalı duruma geçmez |

## 8. Teknik mimari ve entegrasyon gereksinimleri

Uygulama modüler monolit veya iyi sınırlandırılmış servisler biçiminde geliştirilebilir; ancak modül sınırları net olmalıdır: kimlik/yetki, proje-şantiye, iş akışı, doküman, satın alma-stok, sözleşme-hakediş, finans, İK, kartlar, varlık, rapor ve entegrasyon. İşlemler REST/GraphQL tercihinden bağımsız olarak sunucu sözleşmesi ve idempotency ile korunur. Uzun işler kuyrukta yürür; kullanıcıya iş kimliği ve ilerleme gösterilir. Dosyalar nesne depolamada, metadata/veri ilişkisi veritabanında tutulur; antivirüs, MIME doğrulama ve sürümleme uygulanır.

Öncelikli entegrasyon kategorileri: kurumsal SSO/MFA; e-posta ve bildirim; banka hareketi; e-Fatura/e-Arşiv/muhasebe ERP aktarımı; Pluxee ve MultiNet; dosya depolama/e-imza; Primavera veya MS Project; harita/adres; QR/barkod; gerektiğinde bordro. Her entegrasyon için sahip, ortam, kimlik doğrulama, veri eşleme, hata/retry, SLA, gizlilik, sandbox ve kabul senaryosu belgelenecektir.

## 9. Cloud uygulama sırası

| Faz | Kapsam | Çıkış koşulu |
| --- | --- | --- |
| Faz 0 - Envanter ve yönlendirme | Mevcut 240 ekranı hedef manifestoya eşle; kırık rota ve yinelenen sayfaları belirle. | Her mevcut yol için koru/birleştir/yönlendir/kaldır kararı ve otomatik link testi. |
| Faz 1 - Temel platform | Giriş, tenant, kullanıcı, RBAC/ABAC, screen manifest, audit, ortak shell ve ortak sayfa bileşenleri. | Demo rol seçimi üretimde kapalı; tüm API'lerde sunucu yetkisi; tasarım sistemi testleri. |
| Faz 2 - İş akışı omurgası | Merkezi durum/geçiş, onay, vekalet, bildirim, dosya ve sürüm. | Sözleşme, talep, görev ve süre uzatımı formdan durum/onaycı seçemez. |
| Faz 3 - Proje ve saha | Proje formu 404 düzeltme, şantiye, iş programı, günlük rapor, saha, İSG ve kalite. | WBS tabanlı ilerleme; günlük rapor PDF; RFI/NCR uçtan uca. |
| Faz 4 - Tedarik ve finans | Talep-RFQ-sipariş-mal kabul-stok-fatura; sözleşme-metraj-hakediş-bütçe. | Üçlü eşleştirme ve değişmez stok/finans defteri. |
| Faz 5 - Kartlar | Sağlayıcı bağımsız model; Pluxee ve MultiNet görünümü; toplu yükleme, güvenlik ve mutabakat. | Çoklu şirket/hesap/kart; idempotent gönderim; kısmi sonuç; fark kapatma. |
| Faz 6 - Rapor, mobil ve portallar | ReportLayout, çıktı, saha mobil, self-servis ve dış portallar. | Filtre/sürüm tutarlı PDF/Excel; rol ve veri kapsamı testleri. |

## 10. Cloud'a verilecek bağlayıcı uygulama promptu

Aşağıdaki bölüm tek parça talimat olarak Cloud geliştirme ortamına verilebilir. Bu belgenin önceki bölümleri ayrıntılı şartnamedir ve çelişki halinde daha kısıtlayıcı güvenlik/veri bütünlüğü kuralı geçerlidir.

### PROMPT BAŞLANGICI

Sen kıdemli ürün mimarı, UX sistem tasarımcısı ve full-stack uygulama geliştiricisisin. Mevcut GaviaWorks şantiye uygulamasını, `https://gaviaworks-dev.github.io/gaviaworks-crm/index.html` adresindeki giriş ve sayfa mimarisini görsel referans alarak yeniden düzenle. Ürünün kategorisi CRM değil, `Bütünleşik İnşaat ve Şantiye Operasyonları Yönetim Platformu`dur. Nihai marka verilene kadar `[ÜRÜN ADI]` kullan; hiçbir yerde ürün kategorisi olarak CRM yazma.

**Değişmez kurallar:**

1. Referanstaki sol ikon rayı, bağlamsal menü, üst bar, breadcrumb, page-head, liste, form, detay ve rapor kalıplarını koru; iş verisini veya demo davranışını kopyalama.
2. localStorage/sessionStorage/query parametresi rol veya yetki kaynağı değildir. Yetki ve tenant/proje/şantiye kapsamı sunucuda doğrulanır.
3. Sahte başarı toast'ı kullanma. Her eylem gerçek API sonucu, gerçek hata kodu ve kullanıcıya geri döndürülebilir sonuç üretir.
4. Liste, form, detay, rapor ve çıktı tek kanonik kayıt/API kullanır. Aynı örnek diziyi birden çok sayfaya kopyalama.
5. Kullanıcıya onay durumu, nihai durum veya keyfi onaycı seçtirme. Durumlar merkezi geçiş motoru; onaycılar sürümlü politika tarafından belirlenir.
6. Onaylı kayıt yerinde değiştirilmez. Revizyon oluşturulur; önceki sürüm ve karar geçmişi korunur.
7. Finans, stok ve kart bakiyeleri elle yazılan özet sayı değildir; değişmez hareketlerden türetilir ve ters kayıtla düzeltilir.
8. Tüm kritik yazma işlemlerinde idempotency, optimistic concurrency/version ve audit kaydı kullan.
9. Raporları tek `ReportLayout` ile üret; filtre, veri tarihi, formül, sürüm, PDF/Excel/CSV ve print CSS ortak olsun.
10. Bu dokümandaki hedef sayfa kataloğunu `screen-manifest` olarak uygula. Menü, rota, breadcrumb, yetki, özellik bayrağı ve test aynı manifestodan türesin.

**Giriş sayfası:** Referans bağlantıdaki iki panelli yapıyı kullan. Sol tarafta `Şirketten şantiyeye tüm operasyon tek platformda` başlığı ve beş fayda maddesi; sağ tarafta gerçek giriş, şifre sıfırlama, SSO ve MFA akışı olsun. `Rol seçerek incele` yalnızca demo/QA özellik bayrağı açıkken görünsün. Üretimde kullanıcı rolü seçilemesin.

**Form standardı:** Personel/proje formu kalıbını tüm yeni formlara uygula: ana form + sağ özet, sekmeler, `fg-section` benzeri bölümler, koşullu alanlar, tekrarlanabilir satırlar, sürümlü dosya yükleme, alan ve sekme hata özeti, kaydedilmemiş değişiklik uyarısı, çift gönderim engeli ve kayıt sonrası detay sayfasına yönlendirme.

**Kartlar modülü:** Sol menüye `Kartlar` ekle. Tek sağlayıcıya özel kopya modüller oluşturma. `CardProvider`, `ProviderAccount`, `Card`, `CardAssignment`, `CardPolicy`, `CardLoadBatch`, `CardLoadItem`, `CardTransaction`, `CardReconciliation` ve `IntegrationEvent` varlıklarını kur. Şirket aynı anda Pluxee ve MultiNet, birden çok sağlayıcı hesabı ve çok sayıda kart kullanabilsin. Kullanıcı arayüzünde `Pluxee (eski Sodexo)` ve `MultiNet` filtreleri/görünümleri olsun. Bir personelde çoklu kart olabilir; aynı kartta çakışan iki aktif atama olamaz. Tam kart numarasını istemciye, loga veya rapora yazma.

Toplu yükleme `taslak > doğrulandı > onay bekliyor > gönderiliyor > kısmi/başarılı/hatalı > mutabık > kapalı` durum makinesiyle çalışsın. Yükleme uygunluğunu çalışma durumu, kart durumu, politika, dönem ve önceki yüklemelere göre hesapla. Onaydan sonra sağlayıcıya idempotency key ile gönder. Teknik hata ile iş kuralı reddini ayır. Kısmi sonuçları satır bazında göster. İç defter, sağlayıcı ekstresi ve banka çıkışı mutabık olmadan kapatma. Harcama ve bakiye sağlayıcı/defter hareketlerinden gelsin; normal kullanıcı manuel harcama/bakiye yazamasın. Kayıp/çalıntı eylemi anında blokaj denesin ve başarısız çağrıyı kritik operasyona taşısın.

**Eksik kritik sayfalar:** Özellikle yeni proje formu, iş programı/WBS/baz çizgi/revizyon, günlük şantiye raporu, İSG olay türleri, kalite-ITP-NCR-DÖF, RFI, submittal/malzeme onayı, çizim ve transmittal, değişiklik emri, gecikme olayı/claim, metraj, mal kabul, üçlü eşleştirme, kartlar, entegrasyon logları, sistem sağlığı, şantiye açılış/kapanış ve kabul sayfalarını oluştur. Hedef katalogdaki hiçbir P0 rota WIP veya sahte toast olarak kalmasın.

**Teslimat:** Önce ekran manifestosu ve veri/iş akışı şemalarını çıkar. Sonra ortak bileşenleri ve P0 dikey akışları uygula. Her modül için birim, entegrasyon, yetki, durum geçişi, idempotency, erişilebilirlik ve uçtan uca test yaz. Seed/demo veri gerçek API üzerinden oluşturulsun ve `DEMO` etiketi taşısın. Her faz sonunda kırık link, yetkisiz erişim, veri tutarlılığı ve PDF/çıktı test raporu üret.

### PROMPT SONU

## 11. Kabul testleri

| Test | Başarı koşulu |
| --- | --- |
| AUTH-01 | Üretim girişinde rol seçimi yoktur; kullanıcı yalnızca sunucunun verdiği şirket ve rollerle oturum açar. |
| SEC-01 | Bir şirket kullanıcısı URL veya API isteği değiştirerek başka tenant kaydını göremez. |
| WF-01 | Talep sahibi sözleşme, banka, süre uzatımı ve kart yüklemede onay durumunu/nihai durumu seçemez. |
| WF-02 | Onaycı karar verdiği belge sürümünü görür; revizyon olursa politika gereği yeniden onay açılır. |
| PRJ-01 | Yeni proje yolu 200 döner, form kaydı oluşturur ve detay sayfasına yönlendirir. |
| PLAN-01 | WBS ağırlıkları 100 değilse baz çizgi onaya gönderilemez. |
| PLAN-02 | Proje ilerlemesi yalnızca onaylı alt ilerlemelerden ve seçili baz çizgi sürümünden hesaplanır. |
| SITE-01 | Günlük şantiye raporu çevrimdışı taslaktan senkron olur; çift gönderimde tek kayıt oluşur. |
| QLT-01 | NCR kapatma, DÖF tamamlandı ve yetkili kişi etkinlik doğrulaması yapmadan mümkün değildir. |
| PRC-01 | Onaysız talep siparişe dönüşmez; fatura tolerans dışındaysa ödeme adımına geçmez. |
| STK-01 | Stok bakiyesi hareket defteriyle yeniden hesaplandığında ekrandaki bakiyeyle aynıdır. |
| CRD-01 | Aynı şirket aynı anda Pluxee ve MultiNet hesaplarına ve her hesapta çoklu karta sahip olabilir. |
| CRD-02 | Bir personelde birden çok kart olabilir; aynı kart için çakışan aktif atama reddedilir. |
| CRD-03 | Aynı dönem/kaynak/idempotency key ile iki yükleme partisi finansal etki üretmez. |
| CRD-04 | Kısmi sağlayıcı sonucunda başarılı satırlar tekrar gönderilmez; yalnızca güvenli teknik hatalar tekrar edilir. |
| CRD-05 | Kart bakiyesi hiçbir form alanından doğrudan değiştirilemez; düzeltme onaylı hareket ve ters kayıtla yapılır. |
| CRD-06 | Kayıp/çalıntı işlemi blokaj çağrısını, sonucu, retry'ı ve kullanıcı bildirimini audit izinde gösterir. |
| RPT-01 | Ekran, PDF ve Excel aynı filtre, veri tarihi, toplam ve rapor sürümünü taşır. |
| UI-01 | Tüm listeler ortak sayfalama standardını ve URL'de kalıcı filtre/sıralamayı kullanır. |
| UI-02 | Tüm yeni formlar ana alan + sağ özet kalıbında; alan ve sekme hata özetine sahiptir. |
| OPS-01 | Entegrasyon hatası istek kimliği, maskeli payload, retry durumu ve yeniden oynatma yetkisiyle izlenir. |
| AUD-01 | Kritik kayıtta oluşturma, alan değişikliği, geçiş, onay, çıktı ve dışa aktarma kaydı değişmez audit izindedir. |

## 12. Üretime çıkış engelleri

- P0 rotalarda 404, WIP bağlantısı, yalnızca toast üreten işlem veya localStorage tabanlı iş kaydı bulunması.
- Kullanıcının query parametresi/istemci depolamasıyla rol, tenant, proje veya onay durumu değiştirebilmesi.
- Onaylı sözleşme, bütçe, iş programı, hakediş veya yükleme partisinin sürüm açmadan düzenlenebilmesi.
- Stok, finans veya kart bakiyesinin hareket defteriyle yeniden üretilememesi.
- Pluxee/MultiNet gönderiminde idempotency, durum sorgusu ve kısmi sonuç yönetiminin bulunmaması.
- Rapor PDF/Excel çıktısının ekran filtresi, veri tarihi veya toplamlarıyla uyuşmaması.
- Kritik işlemlerde audit, yetki testi, hata/retry ekranı veya kişisel veri maskelemesinin bulunmaması.

## 13. Sonuç

Mevcut yapı, görsel kapsam ve modül çeşitliliği bakımından iyi bir demo temelidir; fakat üretim değerini sayfa sayısı değil, sayfalar arasındaki veri ve karar bütünlüğü belirleyecektir. En önemli revizyon; yeni ekran eklemekten önce tek ekran manifestosu, tek kanonik veri kaynağı, merkezi durum/onay motoru ve değişmez hareket defterlerini kurmaktır. Kartlar modülü de mevcut Pluxee ekranının MultiNet kopyası olarak değil; çoklu şirket, sağlayıcı, hesap, kart, atama, yükleme ve mutabakatı yöneten ortak bir platform modülü olarak uygulanmalıdır.

## Kaynaklar ve adlandırma notu

- Sayfa mimarisi referansı: https://gaviaworks-dev.github.io/gaviaworks-crm/index.html
- İncelenen şantiye uygulaması: https://gaviaworks-dev.github.io/gaviacrm/v2/index.html
- Pluxee resmi marka dönüşümü bilgisi: https://www.pluxee.com.tr/pluxeeden-haberler/2026-yili-yemek-bedeli-istisnasi/
- MultiNet Up resmi kurumsal çözümler sayfası: https://multinet.com.tr/
