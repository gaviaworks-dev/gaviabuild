# PROGRESS — ekran bazlı durum tablosu

> **ÜRETİLMİŞ DOSYA.** Elle düzenlemeyin. Durum kaynağı `manifest/durum.json`;
> güncelledikten sonra `node tools/progress-uret.mjs` çalıştırın.
> Plan: `PLAN.md` · Kararlar: `KARARLAR.md` · Şartname: `docs/REVIZYON.md`

**Toplam:** 244 sayfa ailesi — bekliyor: 28 · devam: 0 · bitti: 0 · doğrulandı: 216

| Faz | Aile | Bekliyor | Devam | Bitti | Doğrulandı |
| --- | --- | --- | --- | --- | --- |
| Faz 1 | 22 | 0 | 0 | 0 | 22 |
| Faz 2 | 14 | 0 | 0 | 0 | 14 |
| Faz 3 | 89 | 0 | 0 | 0 | 89 |
| Faz 4 | 69 | 0 | 0 | 0 | 69 |
| Faz 5 | 23 | 1 | 0 | 0 | 22 |
| Faz 6 | 27 | 27 | 0 | 0 | 0 |

## Faz 1 — 22 sayfa ailesi

| Kod | Sayfa | Öncelik | Kalıp | Rota | Durum | Commit | Not |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AUTH-01 | Giriş | P0 | kimlik | `/giris` | ✅ doğrulandı | faz1 | İki panelli giriş; sunucu oturumu, HttpOnly çerez, hız sınırı, var/yok sızdırmayan hata |
| AUTH-02 | Şifremi unuttum | P0 | form | `/sifre-unuttum` | ✅ doğrulandı | faz1 | Sıfırlama isteği — var/yok sızdırmaz, önceki tokenleri geçersizler |
| AUTH-03 | Şifre sıfırla | P0 | form | `/sifre-sifirla/:token` | ✅ doğrulandı | faz1 | Tek kullanımlık + süreli token, parola politikası, tüm oturumları kapatır |
| AUTH-04 | Davet kabul | P0 | form | `/davet/:token` | ✅ doğrulandı | faz1 | Davet + rol/kapsam ataması, KVKK onayı zorunlu |
| AUTH-05 | MFA doğrulama | P0 | form | `/mfa` | ✅ doğrulandı | faz1 | TOTP (RFC 6238), ±1 pencere, 5 dk süreli ikinci adım tokeni |
| AUTH-06 | İlk giriş kurulumu | P0 | sihirbaz | `/ilk-kurulum` | ✅ doğrulandı | faz1 | İlk kurulum sihirbazı — kurulum bitmeden uygulamaya erişilemez |
| AUTH-07 | Oturum süresi doldu | P0 | durum | `/oturum-sonlandi` | ✅ doğrulandı | faz1 | Oturum sonu durumu |
| AUTH-08 | Yetkisiz erişim | P0 | durum | `/403` | ✅ doğrulandı | faz1 | 403 — kayıt ve eylem düzeyi yetki reddi, istek kimliği ile |
| AUTH-09 | Sayfa bulunamadı | P1 | durum | `/404` | ✅ doğrulandı | faz1 | 404 — dürüst bulunamadı, WIP metni yok |
| AUTH-10 | Bakım / servis kesintisi | P1 | durum | `/bakim` | ✅ doğrulandı | faz1 | Bakım/kesinti durumu, olay kodu |
| GLB-01 | Rol bazlı ana panel | P0 | panel | `/panel` | ✅ doğrulandı | faz1 | Rol bazlı panel — KPI ve erişim bağlamı gerçek veriden |
| GLB-10 | Kişisel notlar | P1 | liste | `/notlarim` | ✅ doğrulandı | faz1 | Kişisel notlar — ABAC kendi_kaydi kuralının gerçek uygulaması |
| GLB-11 | Yeni kişisel not | P1 | form | `/notlarim/yeni` | ✅ doğrulandı | faz1 | Yeni not formu — idempotency, CSRF, alan bazlı hata özeti |
| GLB-12 | Profilim | P1 | listeForm | `/profilim` | ✅ doğrulandı | faz1 | Profil ve oturum listesi |
| GLB-13 | İşlem geçmişim | P2 | liste | `/profilim/islemler` | ✅ doğrulandı | faz1 | Kullanıcının kendi denetim izi |
| SET-01 | Şirketler | P0 | listeForm | `/ayarlar/sirketler` | ✅ doğrulandı | faz1 | Tenant ve tüzel kişi ayrımı |
| SET-02 | Şirket ayarları | P0 | form | `/ayarlar/sirket` | ✅ doğrulandı | faz1 | Şirket ayarları — optimistic concurrency (409) ile korumalı |
| SET-03 | Kullanıcılar | P0 | listeForm | `/ayarlar/kullanicilar` | ✅ doğrulandı | faz1 | Kullanıcı listesi + davet akışı |
| SET-04 | Roller ve yetkiler | P0 | matris | `/ayarlar/roller` | ✅ doğrulandı | faz1 | Rol matrisi — yetkiler manifestten türetiliyor |
| SET-05 | Veri kapsamı kuralları | P0 | matris | `/ayarlar/veri-kapsami` | ✅ doğrulandı | faz1 | Veri kapsamı (ABAC) kuralları |
| SET-16 | Denetim izi | P0 | listeForm | `/ayarlar/denetim-izi` | ✅ doğrulandı | faz1 | Denetim izi + hash zinciri doğrulaması |
| SET-18 | Özellik bayrakları | P2 | listeForm | `/ayarlar/ozellikler` | ✅ doğrulandı | faz1 | Özellik bayrakları — demo.* üretimde kod düzeyinde kilitli |

## Faz 2 — 14 sayfa ailesi

| Kod | Sayfa | Öncelik | Kalıp | Rota | Durum | Commit | Not |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GLB-04 | Onay kutum | P0 | liste | `/onaylar` | ✅ doğrulandı | faz2 | Merkezi onay kutusu — kendi talebi listede yok, vekaleten kararlar işaretli |
| GLB-05 | Onay detayı | P0 | detay | `/onaylar/:id` | ✅ doğrulandı | faz2 | Karar ekranı — belge sürümü dondurulmuş, dört göz, gerekçe zorunluluğu |
| GLB-06 | Bildirim merkezi | P0 | liste | `/bildirimler` | ✅ doğrulandı | faz2 | Bildirim merkezi (Faz 1 kabuğu + Faz 2 gerçek olay üretimi) |
| GLB-09 | Duyurular | P2 | listeForm | `/duyurular` | ✅ doğrulandı | faz2 | Duyurular — onay motorunun uçtan uca ilk uygulaması; yayına motor alır |
| DOC-01 | Doküman merkezi | P0 | liste | `/dokumanlar` | ✅ doğrulandı | faz3 | Doküman merkezi (Faz 2) |
| DOC-02 | Yeni doküman | P0 | form | `/dokumanlar/yeni` | ✅ doğrulandı | faz3 | Yeni doküman (Faz 2) |
| DOC-03 | Doküman detayı | P0 | detay | `/dokumanlar/:id` | ✅ doğrulandı | faz3 | Doküman detayı (Faz 2) |
| SET-06 | İş akışı şablonları | P0 | listeForm | `/ayarlar/is-akislari` | ✅ doğrulandı | faz2 | İş akışı şablonları — sürümlü, tutar kademeli, paralel adımlı |
| SET-07 | Onay vekaletleri | P0 | listeForm | `/ayarlar/vekaletler` | ✅ doğrulandı | faz2 | Onay vekaletleri — süreli, çakışma kontrollü, audit kayıtlı |
| SET-08 | Bildirim kuralları | P1 | listeForm | `/ayarlar/bildirimler` | ✅ doğrulandı | faz2 | Bildirim kuralları + sistemin ürettiği gerçek olay dökümü |
| SET-09 | Numaralandırma şablonları | P1 | listeForm | `/ayarlar/numaralandirma` | ✅ doğrulandı | faz2 | Numaralandırma şablonları — transaction içinde tekil kod üretimi |
| SET-10 | Durum ve sözlük yönetimi | P1 | listeForm | `/ayarlar/sozlukler` | ✅ doğrulandı | faz2 | Sözlük yönetimi + çekirdek durumlar KİLİTLİ tablosu |
| SET-11 | Maliyet kodları ve WBS eşleme | P0 | matris | `/ayarlar/maliyet-kodlari` | ✅ doğrulandı | faz2 | Maliyet kodları ve WBS eşlemesi — hiyerarşik |
| SET-12 | Belge türleri ve saklama | P1 | listeForm | `/ayarlar/belge-turleri` | ✅ doğrulandı | faz2 | Belge türleri ve saklama süreleri |

## Faz 3 — 89 sayfa ailesi

| Kod | Sayfa | Öncelik | Kalıp | Rota | Durum | Commit | Not |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GLB-08 | Takvim | P1 | takvim | `/takvim` | ✅ doğrulandı | faz3f | Takvim — görev, iş emri, toplantı, aktivite, belge ve eğitim tek görünümde |
| PRJ-01 | Proje listesi | P0 | liste | `/projeler` | ✅ doğrulandı | faz3 | Proje listesi — portföy filtreleri, ilerleme ve takvim sağlığı |
| PRJ-02 | Yeni proje | P0 | form | `/projeler/yeni` | ✅ doğrulandı | faz3 | Yeni proje — eski uygulamadaki 404 giderildi; gerçek kayıt + detaya yönlendirme |
| PRJ-03 | Proje detayı | P0 | detay | `/projeler/:id` | ✅ doğrulandı | faz3 | Proje detayı — özet/şantiye/program/risk/geçmiş sekmeleri, durum geçiş menüsü |
| PRJ-04 | Proje düzenle | P0 | form | `/projeler/:id/duzenle` | ✅ doğrulandı | faz3 | Proje düzenle — sürümlü güncelleme (409 korumalı) |
| PRJ-05 | Proje aktivasyon sihirbazı | P1 | sihirbaz | `/projeler/:id/aktivasyon` | ✅ doğrulandı | faz3f | Proje aktivasyon sihirbazı — kontrol listesi geçiş motorunun ön koşulu |
| PRJ-06 | Proje organizasyonu | P1 | listeForm | `/projeler/:id/organizasyon` | ✅ doğrulandı | faz3f | Proje organizasyonu — görev/kişi/bağlılık; yetki buradan gelmez |
| PRJ-07 | Proje paydaşları | P1 | listeForm | `/projeler/:id/paydaslar` | ✅ doğrulandı | faz3f | Proje paydaşları — işveren, müşavir, kurum; transmittal dağıtımının kaynağı |
| PRJ-08 | Proje risk kaydı | P1 | listeForm | `/projeler/:id/riskler` | ✅ doğrulandı | faz3f | Proje risk kaydı — skor = olasılık × etki; yüksek riskte aksiyon zorunlu |
| PRJ-09 | Proje kapanış | P1 | sihirbaz | `/projeler/:id/kapanis` | ✅ doğrulandı | faz3f | Proje kapanış — şantiyeler kapanmadan ve engeller sıfırlanmadan kapanmaz (§7) |
| PRJ-10 | Proje sürüm ve değişiklik geçmişi | P1 | liste | `/projeler/:id/gecmis` | ✅ doğrulandı | faz3f | Proje sürüm ve değişiklik geçmişi — denetim izinden türer, ayrı tablo yok |
| SITE-01 | Şantiye listesi | P0 | liste | `/santiyeler` | ✅ doğrulandı | faz3 | Şantiye listesi — yaşam durumu ile takvim sağlığı AYRI sütunlarda |
| SITE-02 | Yeni şantiye | P0 | form | `/santiyeler/yeni` | ✅ doğrulandı | faz3 | Yeni şantiye — projeye bağlı, maliyet merkezi ile |
| SITE-03 | Şantiye detayı | P0 | detay | `/santiyeler/:id` | ✅ doğrulandı | faz3 | Şantiye detayı — kanonik veriden sekmeler |
| SITE-04 | Şantiye düzenle | P0 | form | `/santiyeler/:id/duzenle` | ✅ doğrulandı | faz3e | Şantiye düzenle — sürümlü temel veri güncellemesi; yaşam durumu buradan değişmez |
| SITE-05 | Şantiye açılış kontrolü | P1 | sihirbaz | `/santiyeler/:id/acilis` | ✅ doğrulandı | faz3e | Açılış kontrolü — belge/şef/ekip tamamlanmadan geçiş motoru "aktif" yapmaz |
| SITE-06 | Günlük şantiye raporları | P0 | liste | `/santiyeler/:id/gunluk-raporlar` | ✅ doğrulandı | faz3 | Günlük şantiye raporları listesi |
| SITE-07 | Yeni günlük rapor | P0 | form | `/santiyeler/:id/gunluk-raporlar/yeni` | ✅ doğrulandı | faz3 | Yeni günlük rapor — çevrimdışı taslak kimliği, çift senkronda tek kayıt |
| SITE-08 | Günlük rapor detayı | P0 | listeForm | `/gunluk-raporlar/:id` | ✅ doğrulandı | faz3 | Günlük rapor detayı — onaydan sonra kilit |
| SITE-09 | Saha bildirimleri | P0 | liste | `/saha-bildirimleri` | ✅ doğrulandı | faz3 | Saha bildirimleri — SLA ve önem işaretleri |
| SITE-10 | Yeni saha bildirimi | P0 | form | `/saha-bildirimleri/yeni` | ✅ doğrulandı | faz3 | Yeni saha bildirimi — SLA aciliyetten türetilir, kullanıcı girmez |
| SITE-11 | Saha bildirimi detayı | P0 | detay | `/saha-bildirimleri/:id` | ✅ doğrulandı | faz3 | Saha bildirimi detayı — atama, işlem, doğrulama, kapanış |
| SITE-12 | Saha günlükleri ve ziyaretçiler | P2 | listeForm | `/santiyeler/:id/ziyaretciler` | ✅ doğrulandı | faz3e | Ziyaretçi ve saha girişi — giriş saati sunucudan; çıkışsız kayıt kapanışı engeller |
| SITE-13 | Şantiye izin ve resmi belgeleri | P1 | listeForm | `/santiyeler/:id/izinler` | ✅ doğrulandı | faz3e | İzin ve resmi belgeler — süre aşımı hesaplanır, durum eylemle değişir |
| SITE-14 | Geçici kabul | P1 | sihirbaz | `/santiyeler/:id/gecici-kabul` | ✅ doğrulandı | faz3e | Geçici kabul — punch eki, garanti süresi, onay motoru |
| SITE-15 | Kesin kabul ve devir | P1 | sihirbaz | `/santiyeler/:id/kesin-kabul` | ✅ doğrulandı | faz3e | Kesin kabul ve devir — onaylı geçici kabul olmadan açılamaz |
| SITE-16 | Şantiye kapatma | P1 | sihirbaz | `/santiyeler/:id/kapat` | ✅ doğrulandı | faz3e | Şantiye kapatma — §7 engel listesi sıfırlanmadan kapalı duruma geçilemez |
| PLAN-01 | İş programı listesi | P0 | liste | `/is-programlari` | ✅ doğrulandı | faz3 | İş programı listesi — baz çizgi ve onaylı ilerleme |
| PLAN-02 | Yeni iş programı | P0 | form | `/is-programlari/yeni` | ✅ doğrulandı | faz3 | Yeni iş programı |
| PLAN-03 | İş programı detayı | P0 | detay | `/is-programlari/:id` | ✅ doğrulandı | faz3 | Program detayı — WBS, aktivite ve ilerleme sekmeleri |
| PLAN-04 | WBS düzenleyici | P0 | matris | `/is-programlari/:id/wbs` | ✅ doğrulandı | faz3 | WBS düzenleyici — ağırlık doğrulaması canlı |
| PLAN-05 | Aktivite formu | P0 | form | `/is-programlari/:id/aktiviteler/yeni` | ✅ doğrulandı | faz3f | Aktivite formu — baz çizgi dondurulmuşsa kilitli; ağırlık WBS içinde |
| PLAN-06 | Baz çizgi onayı | P0 | onay | `/is-programlari/:id/baz-cizgi` | ✅ doğrulandı | faz3 | Baz çizgi onayı — %100 kontrol listesi, onaylanınca DONDURULUR |
| PLAN-07 | Program revizyonu | P0 | onay | `/is-programlari/:id/revizyon` | ✅ doğrulandı | faz3f | Program revizyonu — onaylı sürüm değişmez, WBS/aktivite kopyalanarak yeni sürüm açılır |
| PLAN-08 | Haftalık look-ahead | P1 | takvim | `/is-programlari/:id/look-ahead` | ✅ doğrulandı | faz3f | Haftalık look-ahead — pencere sunucuda kurulur; aktiviteden görev açılır (§7) |
| PLAN-09 | İlerleme girişi | P0 | form | `/ilerleme/yeni` | ✅ doğrulandı | faz3 | İlerleme girişi — kanıt zorunlu, geri gidiş engelli |
| PLAN-10 | İlerleme doğrulama | P0 | onay | `/ilerleme/:id/dogrula` | ✅ doğrulandı | faz3f | İlerleme doğrulama — kendi girdiğini doğrulayamaz (dört göz) |
| PLAN-11 | Plan-gerçekleşen analizi | P1 | rapor | `/raporlar/plan-gerceklesen` | ✅ doğrulandı | faz3 | Plan-gerçekleşen sapması — baz çizgi sürümü görünür |
| PLAN-12 | Program içe/dışa aktarma | P2 | sihirbaz | `/is-programlari/:id/aktarim` | ✅ doğrulandı | faz3f | Program içe/dışa aktarım — CSV kuru çalıştırma, hep ya da hiç uygulama |
| TASK-01 | Görev listesi | P0 | liste | `/gorevler` | ✅ doğrulandı | faz3 | Görev listesi — yaşam durumu ve hesaplanan gecikme AYRI |
| TASK-02 | Yeni görev | P0 | form | `/gorevler/yeni` | ✅ doğrulandı | faz3 | Yeni görev — durum seçtirmeden atama/havuz akışı |
| TASK-03 | Görev detayı | P0 | detay | `/gorevler/:id` | ✅ doğrulandı | faz3 | Görev detayı — yorum, üstlenme, geçiş menüsü |
| TASK-04 | Görev şablonları | P1 | listeForm | `/gorev-sablonlari` | ✅ doğrulandı | faz3f | Görev şablonları — sürümlü, kalemli; şablondan üretilen görev taslak açılır |
| TASK-05 | Toplu görev oluşturma | P1 | sihirbaz | `/gorevler/toplu` | ✅ doğrulandı | faz3f | Toplu görev oluşturma — önizleme yazmaz, ikinci çalıştırma listeyi ikiye katlamaz |
| TASK-06 | İş emirleri | P1 | liste | `/is-emirleri` | ✅ doğrulandı | faz3f | İş emirleri — görevle aynı geçiş motoru; yaşam durumu ve gecikme ayrı |
| TASK-07 | İş emri detayı | P1 | detay | `/is-emirleri/:id` | ✅ doğrulandı | faz3f | İş emri detayı — saha geri bildirimi; blokaj nedeni zorunlu |
| TASK-08 | Toplantılar | P2 | liste | `/toplantilar` | ✅ doğrulandı | faz3f | Toplantılar — planlandı/yapıldı/kapalı; tutanağı eksik toplantı işaretli |
| TASK-09 | Toplantı detayı ve tutanak | P2 | listeForm | `/toplantilar/:id` | ✅ doğrulandı | faz3f | Toplantı detayı ve tutanak — karar göreve bağlanmadan toplantı kapanmaz (§7) |
| HSE-01 | İSG paneli | P0 | panel | `/isg` | ✅ doğrulandı | faz3f | İSG paneli — açık olay, kaza/ramak kala, kayıp gün, eğitimsiz personel |
| HSE-02 | Olay listesi | P0 | liste | `/isg/olaylar` | ✅ doğrulandı | faz3 | İSG olay listesi — kaza/ramak kala/tehlike |
| HSE-03 | Kaza bildirimi | P0 | form | `/isg/olaylar/kaza/yeni` | ✅ doğrulandı | faz3 | Kaza bildirimi — kritik açılır, yönetime bildirim |
| HSE-04 | Ramak kala | P0 | form | `/isg/olaylar/ramak-kala/yeni` | ✅ doğrulandı | faz3 | Ramak kala bildirimi |
| HSE-05 | Tehlikeli durum/davranış | P0 | form | `/isg/olaylar/tehlike/yeni` | ✅ doğrulandı | faz3 | Tehlikeli durum/davranış bildirimi |
| HSE-06 | İSG olay detayı | P0 | detay | `/isg/olaylar/:id` | ✅ doğrulandı | faz3 | İSG olay detayı — kök neden, DÖF, etkinlik doğrulamadan kapanmaz |
| HSE-07 | Saha denetimleri | P1 | listeForm | `/isg/denetimler` | ✅ doğrulandı | faz3f | Saha denetimleri — uygunluk oranı hesaplanır, uygunsuzluk otomatik olay açar |
| HSE-08 | Toolbox konuşmaları | P1 | listeForm | `/isg/toolbox` | ✅ doğrulandı | faz3f | Toolbox konuşmaları — katılımcı ve süre kaydı |
| HSE-09 | İSG eğitimleri | P1 | listeForm | `/isg/egitimler` | ✅ doğrulandı | faz3f | İSG eğitimleri — başarılı katılım personel yetkinlik kaydı üretir |
| HSE-10 | KKD zimmet ve kontrol | P1 | listeForm | `/isg/kkd` | ✅ doğrulandı | faz3f | KKD zimmet ve kontrol — iade edilmemiş zimmet kapanış engeli |
| HSE-11 | Çevre olayları ve atık | P2 | listeForm | `/cevre` | ✅ doğrulandı | faz3f | Çevre olayları ve atık — çevre olayı İSG kaydının türü; tehlikeli atıkta irsaliye zorunlu |
| HSE-12 | İSG istatistik raporu | P1 | rapor | `/raporlar/isg` | ✅ doğrulandı | faz3f | İSG istatistik raporu — LTIFR ve ağırlık oranı formülüyle; saat puantajdan türer |
| QLT-01 | Kalite paneli | P0 | panel | `/kalite` | ✅ doğrulandı | faz3b | Kalite paneli — NCR yaşlandırma, bekleyen muayene, RFI SLA |
| QLT-02 | ITP listesi | P0 | liste | `/kalite/itp` | ✅ doğrulandı | faz3b | ITP listesi + kontrol noktaları (H/W/R/S) |
| QLT-03 | ITP formu | P0 | form | `/kalite/itp/yeni` | ✅ doğrulandı | faz3b | ITP formu — onaylı ITP değiştirilemez |
| QLT-04 | Muayene talepleri | P0 | listeForm | `/kalite/muayeneler` | ✅ doğrulandı | faz3b | Muayene talepleri — uygunsuz sonuç otomatik NCR açar |
| QLT-05 | NCR uygunsuzluk listesi | P0 | liste | `/kalite/ncr` | ✅ doğrulandı | faz3 | NCR listesi — yaşlandırma, DÖF ve etkinlik durumu |
| QLT-06 | NCR formu | P0 | form | `/kalite/ncr/yeni` | ✅ doğrulandı | faz3 | NCR formu — gereklilik/bulgu/etki/karantina |
| QLT-07 | NCR detayı ve DÖF | P0 | detay | `/kalite/ncr/:id` | ✅ doğrulandı | faz3 | NCR detayı — üç adımlı kapanış zinciri, dört göz |
| QLT-08 | Malzeme onayları | P0 | listeForm | `/teknik/malzeme-onaylari` | ✅ doğrulandı | faz3b | Malzeme onayları — submittal tablosunun filtrelenmiş görünümü (kural 4) |
| QLT-09 | Submittal kayıtları | P0 | listeForm | `/teknik/submittal` | ✅ doğrulandı | faz3b | Submittal — sürümlü, müşavir karar kodu (A/B/C/D) dondurulur |
| QLT-10 | RFI listesi | P0 | liste | `/teknik/rfi` | ✅ doğrulandı | faz3b | RFI listesi — SLA ve kapsam/süre/maliyet etkisi |
| QLT-11 | RFI formu | P0 | form | `/teknik/rfi/yeni` | ✅ doğrulandı | faz3b | RFI formu — SLA gerekli tarihten türer |
| QLT-12 | RFI detayı | P0 | detay | `/teknik/rfi/:id` | ✅ doğrulandı | faz3b | RFI detayı — yanıt kapsam etkiliyse değişiklik tetikler (§7) |
| QLT-13 | Test ve laboratuvar sonuçları | P1 | listeForm | `/kalite/testler` | ✅ doğrulandı | faz3b | Test sonuçları — uygunsuz test otomatik kritik NCR açar |
| QLT-14 | Punch / eksik işler | P1 | listeForm | `/kalite/punch` | ✅ doğrulandı | faz3b | Punch listesi — kapanış KANIT ister |
| DOC-04 | Çizim listesi | P0 | liste | `/cizimler` | ✅ doğrulandı | faz3c | Çizim listesi — disiplin, paket ve son geçerli revizyon |
| DOC-05 | Çizim detayı | P0 | detay | `/cizimler/:id` | ✅ doğrulandı | faz3c | Çizim detayı — revizyon satırı değiştirilemez, dağıtım geçmişi |
| DOC-06 | Transmittal listesi | P0 | liste | `/transmittal` | ✅ doğrulandı | faz3c | Transmittal listesi — teslim kanıtı durumu |
| DOC-07 | Yeni transmittal | P0 | form | `/transmittal/yeni` | ✅ doğrulandı | faz3c | Yeni transmittal — amaç kodu; boş transmittal gönderilemez |
| DOC-08 | Gelen-giden evrak | P1 | listeForm | `/evrak` | ✅ doğrulandı | faz3c | Gelen-giden evrak — havale ve cevap son tarihi |
| DOC-09 | Belge dağıtım matrisi | P1 | listeForm | `/dokumanlar/dagitim-matrisi` | ✅ doğrulandı | faz3c | Belge dağıtım matrisi — rol × belge türü erişimi |
| DOC-10 | Belge arşivi | P1 | liste | `/dokumanlar/arsiv` | ✅ doğrulandı | faz3c | Belge arşivi — saklama süresi ve hukuki bekletme |
| HR-01 | Personel listesi | P0 | liste | `/personel` | ✅ doğrulandı | faz3d | Personel listesi — atama ve belge durumu; ücret alanı rol bazlı maskeli |
| HR-02 | Yeni personel | P0 | form | `/personel/yeni` | ✅ doğrulandı | faz3d | Yeni personel — "aday" durumunda açılır; hassas alanlar maskeli rolde çizilmez |
| HR-03 | Personel detayı | P0 | detay | `/personel/:id` | ✅ doğrulandı | faz3d | Personel detayı — atama, belge/yetkinlik, puantaj ve denetim geçmişi sekmeleri |
| HR-04 | Personel düzenle | P0 | form | `/personel/:id/duzenle` | ✅ doğrulandı | faz3d | Personel düzenle — sürümlü güncelleme; maskeli alan POST edilse de yazılmaz |
| HR-05 | İşe giriş sihirbazı | P1 | sihirbaz | `/personel/:id/ise-giris` | ✅ doğrulandı | faz3d | İşe giriş sihirbazı — adımlar gerçek kayıttan doğrulanır, elle "tamam" yok |
| HR-07 | Şantiye atamaları | P0 | listeForm | `/personel-atamalari` | ✅ doğrulandı | faz3d | Şantiye atamaları — çakışan tarih aralığı sunucuda 409 ile reddedilir |
| HR-08 | Puantaj | P0 | listeForm | `/puantaj` | ✅ doğrulandı | faz3d | Puantaj — personel-gün tekil; dönem ilk kayıtla açılır, kilitli satır değişmez |
| HR-09 | Puantaj dönem kapanışı | P0 | onay | `/puantaj/donem-kapanis` | ✅ doğrulandı | faz3d | Puantaj dönem kapanışı — onay motorundan geçer, kapanışta satırlar kilitlenir |

## Faz 4 — 69 sayfa ailesi

| Kod | Sayfa | Öncelik | Kalıp | Rota | Durum | Commit | Not |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GLB-02 | Günlük özet | P1 | panel | `/panel/gunluk-ozet` | ✅ doğrulandı | faz4c | Günlük özet — her sayı kaynak modülün canlı sorgusu; kart kaynağına gider (kural 4) |
| GLB-03 | Yönetici kontrol merkezi | P1 | panel | `/panel/yonetici` | ✅ doğrulandı | faz4c | Yönetici kontrol merkezi — portföy/nakit/ilerleme; hakediş ve defter fonksiyonlarından |
| HR-10 | İzin talepleri | P0 | listeForm | `/izinler` | ✅ doğrulandı | faz4c | İzin talepleri — çakışan tarih aralığı 409; onay motorundan geçer, bakiye düşer |
| HR-11 | Avans talepleri | P0 | listeForm | `/avanslar` | ✅ doğrulandı | faz4c | Avans talepleri — aday personele avans yok; mahsupsuz ikinci avans 409 |
| HR-12 | Sağlık ve uygunluk | P1 | listeForm | `/personel-saglik` | ✅ doğrulandı | faz4c | Sağlık ve uygunluk — süresiz kayıt reddedilir; süre dolunca uyarı işareti |
| HR-13 | Yetkinlik ve sertifikalar | P1 | listeForm | `/yetkinlikler` | ✅ doğrulandı | faz4c | Yetkinlik ve sertifikalar — bitiş uyarısı; iptal gerekçe ister |
| PRC-01 | Satın alma talepleri | P0 | liste | `/satinalma/talepler` | ✅ doğrulandı | faz4a | Satın alma talepleri — onaylı/siparişsiz izleme; tutar kalemlerden türer |
| PRC-02 | Yeni satın alma talebi | P0 | form | `/satinalma/talepler/yeni` | ✅ doğrulandı | faz4a | Yeni talep — kalemli form, toplam alanı yok, taslak açılır |
| PRC-03 | Talep detayı | P0 | detay | `/satinalma/talepler/:id` | ✅ doğrulandı | faz4a | Talep detayı — onaydaki talebin kalemleri değişmez; RFQ/sipariş bağı |
| PRC-04 | Teklif talepleri RFQ | P0 | listeForm | `/satinalma/rfq` | ✅ doğrulandı | faz4a | RFQ listesi — yalnız ONAYLI talepten açılır |
| PRC-05 | Teklif toplama portalı | P1 | portal | `/tedarikci/teklif/:token` | ✅ doğrulandı | faz4a | Tedarikçi teklif portalı — oturumsuz, token özeti saklanır, iç menü yok |
| PRC-06 | Teklif karşılaştırma | P0 | mutabakat | `/satinalma/karsilastirma/:id` | ✅ doğrulandı | faz4a | Teklif karşılaştırma — en düşük işaretli; farklı seçim gerekçe ister |
| PRC-07 | Satın alma siparişleri | P0 | liste | `/satinalma/siparisler` | ✅ doğrulandı | faz4a | Siparişler — kalan teslim oranı hareketlerden türer |
| PRC-08 | Yeni sipariş | P0 | form | `/satinalma/siparisler/yeni` | ✅ doğrulandı | faz4a | Yeni sipariş — ONAYSIZ talep siparişe dönüşmez (PRC-01 kabul) |
| PRC-09 | Sipariş detayı | P0 | detay | `/satinalma/siparisler/:id` | ✅ doğrulandı | faz4a | Sipariş detayı — teslim/fatura miktarları kaynak kayıtlardan türer |
| PRC-10 | Sipariş değişikliği | P0 | onay | `/satinalma/siparisler/:id/revizyon` | ✅ doğrulandı | faz4a | Sipariş revizyonu — onaylı sipariş yerinde değişmez, yeni sürüm açılır |
| PRC-11 | Tedarikçiler | P1 | liste | `/tedarikciler` | ✅ doğrulandı | faz4a | Tedarikçiler — kara liste açık siparişte engellenir |
| PRC-12 | Tedarikçi detayı | P1 | detay | `/tedarikciler/:id` | ✅ doğrulandı | faz4a | Tedarikçi detayı — sipariş, teklif ve mal kabul sekmeleri |
| PRC-13 | Tedarikçi değerlendirme | P1 | rapor | `/tedarikciler/:id/degerlendirme` | ✅ doğrulandı | faz4a | Tedarikçi değerlendirme — kalite/termin/fiyat puanı formülüyle hesaplanır |
| STK-01 | Depolar | P0 | listeForm | `/depolar` | ✅ doğrulandı | faz4a | Depolar — bakiye kalemi defterden sayılır |
| STK-02 | Stok kartları | P0 | listeForm | `/stok-kartlari` | ✅ doğrulandı | faz4a | Stok kartları — mevcut miktar sütunu YOK; bakiye defterden türer |
| STK-03 | Mal kabul | P0 | liste | `/mal-kabul` | ✅ doğrulandı | faz4a | Mal kabul listesi |
| STK-04 | Yeni mal kabul | P0 | form | `/mal-kabul/yeni` | ✅ doğrulandı | faz4a | Yeni mal kabul — sipariş kalanını aşamaz; stok henüz yazılmaz |
| STK-05 | Mal kabul detayı | P0 | detay | `/mal-kabul/:id` | ✅ doğrulandı | faz4a | Mal kabul detayı — kabul deftere yazar, ret otomatik NCR açar (§7) |
| STK-06 | Stok rezervasyonu | P0 | listeForm | `/stok/rezervasyonlar` | ✅ doğrulandı | faz4a | Stok rezervasyonu — kullanılabilir stoktan (bakiye − rezerve) |
| STK-07 | Depolar arası transfer | P0 | listeForm | `/stok/transferler` | ✅ doğrulandı | faz4a | Depolar arası transfer — sevk çıkış, teslim giriş; dört göz |
| STK-08 | Sarf ve iade | P0 | listeForm | `/stok/sarf` | ✅ doğrulandı | faz4a | Sarf ve iade — doğrudan deftere; negatif bakiye engelli |
| STK-09 | Stok sayımı | P1 | sihirbaz | `/stok/sayim` | ✅ doğrulandı | faz4a | Stok sayımı — kör sayım, defter dondurulur, fark onaydan sonra yazılır |
| STK-10 | Stok hareket defteri | P0 | rapor | `/stok/hareketler` | ✅ doğrulandı | faz4a | Stok hareket defteri — değişmez (tetikleyici), ters kayıtla düzeltilir (STK-01 kabul) |
| CNT-01 | Sözleşmeler | P0 | liste | `/sozlesmeler` | ✅ doğrulandı | faz4b | Sözleşmeler — bedel pozlardan türer, güncel bedel zeyillerle |
| CNT-02 | Yeni sözleşme | P0 | form | `/sozlesmeler/yeni` | ✅ doğrulandı | faz4b | Yeni sözleşme — poz cetveli; toplam alanı yok |
| CNT-03 | Sözleşme detayı | P0 | detay | `/sozlesmeler/:id` | ✅ doğrulandı | faz4b | Sözleşme detayı — onaylı sözleşmenin pozu değişmez (kural 6) |
| CNT-04 | Zeyil ve ek protokol | P0 | listeForm | `/sozlesmeler/:id/zeyiller` | ✅ doğrulandı | faz4b | Zeyiller — sözleşmeyi yerinde değiştirmez, farkı taşır; onaydan geçer |
| CNT-05 | Teminatlar | P0 | listeForm | `/teminatlar` | ✅ doğrulandı | faz4b | Teminatlar — süresi yaklaşan uyarısı; iade/nakde çevirme gerekçeli |
| CNT-06 | Metraj cetvelleri | P0 | listeForm | `/metraj` | ✅ doğrulandı | faz4b | Metraj cetvelleri — onaylanmadan hakedişe giremez |
| CNT-07 | Hakedişler | P0 | liste | `/hakedisler` | ✅ doğrulandı | faz4b | Hakedişler — dönem brüt, kesinti ve net ayrı |
| CNT-08 | Yeni hakediş | P0 | sihirbaz | `/hakedisler/yeni` | ✅ doğrulandı | faz4b | Yeni hakediş — ONAYLI metrajdan üretilir; tutar alanı yok |
| CNT-09 | Hakediş detayı | P0 | listeForm | `/hakedisler/:id` | ✅ doğrulandı | faz4b | Hakediş detayı — kesinti icmali formülüyle; onaylı hakediş değişmez |
| CNT-10 | Değişiklik talepleri | P0 | liste | `/degisiklikler` | ✅ doğrulandı | faz4b | Değişiklik talepleri — kapsam etkili RFI kaynağı (§7) |
| CNT-11 | Yeni değişiklik talebi | P0 | form | `/degisiklikler/yeni` | ✅ doğrulandı | faz4b | Yeni değişiklik talebi — tutar/süre/kapsam etkisi |
| CNT-12 | Değişiklik emri | P0 | onay | `/degisiklikler/:id` | ✅ doğrulandı | faz4b | Değişiklik emri — onaylanınca otomatik zeyil taslağı açar (§7) |
| CNT-13 | Gecikme olayları | P0 | listeForm | `/gecikme-olaylari` | ✅ doğrulandı | faz4b | Gecikme olayları — etkilenen gün hesaplanır; kabul dört göz ister |
| CNT-14 | Süre uzatım talepleri | P0 | listeForm | `/sure-uzatim` | ✅ doğrulandı | faz4b | Süre uzatım talepleri — kabul edilmiş gecikme olayına dayanır, aşamaz |
| CNT-15 | Claim / talep dosyaları | P1 | listeForm | `/claimler` | ✅ doğrulandı | faz4b | Claim dosyaları — dayanaksız açılamaz; kabul tutarı talebi aşamaz |
| FIN-01 | Finans paneli | P0 | panel | `/finans` | ✅ doğrulandı | faz4b | Finans paneli — kasa/banka bakiyeleri defterden; eşleşmemiş uyarısı |
| FIN-02 | Bütçeler | P0 | listeForm | `/butceler` | ✅ doğrulandı | faz4b | Bütçeler — maliyet kodu bazlı; gerçekleşen defterlerden hesaplanır |
| FIN-03 | Bütçe revizyonu | P0 | onay | `/butceler/:id/revizyon` | ✅ doğrulandı | faz4b | Bütçe revizyonu — onaylı bütçe yerinde değişmez, yeni sürüm açar |
| FIN-04 | Tahmin ve EAC | P1 | rapor | `/tahminler` | ✅ doğrulandı | faz4b | Tahmin ve EAC — BAC/EV/AC/CPI/EAC/VAC formülleriyle |
| FIN-05 | Kasalar | P0 | listeForm | `/kasalar` | ✅ doğrulandı | faz4b | Kasalar — bakiye sütunu YOK; defterden türer, eksiye düşemez |
| FIN-06 | Kasa hareketleri | P0 | listeForm | `/kasa-hareketleri` | ✅ doğrulandı | faz4b | Kasa hareketleri — değişmez defter, ters kayıt; belgesiz harcama açıklama ister |
| FIN-07 | Banka hesapları | P0 | listeForm | `/banka-hesaplari` | ✅ doğrulandı | faz4b | Banka hesapları — bakiye defterden |
| FIN-08 | Banka hareketleri | P0 | liste | `/banka-hareketleri` | ✅ doğrulandı | faz4b | Banka hareketleri — tutar/yön/tarih değişmez; mükerrer referans reddedilir |
| FIN-09 | Banka hareketi eşleştirme | P0 | mutabakat | `/banka-hareketleri/eslestirme` | ✅ doğrulandı | faz4b | Banka eşleştirme — tutar farkı gerekçe ister; ödeme eşleşince ödendi olur |
| FIN-10 | Cari hesaplar | P0 | listeForm | `/cariler` | ✅ doğrulandı | faz4b | Cari hesaplar — bakiye ve ekstre defterden türer |
| FIN-11 | Ödeme talepleri | P0 | listeForm | `/odemeler` | ✅ doğrulandı | faz4b | Ödeme talepleri — yalnız ONAYLI fatura/hakedişe; tutar belgeden alınır |
| FIN-12 | Ödeme planı | P1 | takvim | `/odemeler/plan` | ✅ doğrulandı | faz4b | Ödeme planı — haftalık nakit projeksiyonu, açık uyarısı |
| FIN-13 | Fatura kayıtları | P0 | listeForm | `/faturalar` | ✅ doğrulandı | faz4b | Fatura kayıtları — mükerrer fatura engelli; eşleştirmesiz onaya gitmez |
| FIN-14 | Üçlü eşleştirme | P0 | mutabakat | `/faturalar/eslestirme` | ✅ doğrulandı | faz4b | Üçlü eşleştirme — sonuç hesaplanır; tolerans dışı fark gerekçe + onay ister |
| FIN-15 | Dönem kapanışı | P1 | sihirbaz | `/finans/donem-kapanis` | ✅ doğrulandı | faz4b | Dönem kapanışı — engel listesi; kapalı döneme yazılamaz; yeniden açma dört göz |
| AST-01 | Varlık listesi | P0 | liste | `/varliklar` | ✅ doğrulandı | faz4c | Varlık listesi — demirbaş/makine/ekipman/araç tek tabloda; tür filtresi (kural 4) |
| AST-02 | Yeni varlık | P0 | form | `/varliklar/yeni` | ✅ doğrulandı | faz4c | Yeni varlık — türe göre koşullu alan; araçta plaka zorunlu, sayaç türü seçilir |
| AST-03 | Varlık detayı | P0 | detay | `/varliklar/:id` | ✅ doğrulandı | faz4c | Varlık detayı — zimmet, bakım, kontrol, olay ve maliyet geçmişi; geçiş motoru |
| AST-04 | Zimmet ve devir | P0 | listeForm | `/zimmetler` | ✅ doğrulandı | faz4c | Zimmet ve devir — aynı varlığa çakışan aktif zimmet 409 ile reddedilir |
| AST-05 | Bakım planları | P1 | listeForm | `/bakim-planlari` | ✅ doğrulandı | faz4c | Bakım planları — sayaç veya tarih tetikli; iş emrini motor açar |
| AST-06 | Bakım iş emirleri | P1 | listeForm | `/bakim-is-emirleri` | ✅ doğrulandı | faz4c | Bakım iş emirleri — ayrı tablo değil, is_emri.varlik_id ile aynı motora bağlı |
| AST-07 | Kalibrasyon ve periyodik kontrol | P1 | liste | `/varlik-kontrolleri` | ✅ doğrulandı | faz4c | Periyodik kontrol — uygunsuz sonuç varlığı KULLANIM DIŞI bırakır ve iş emri açar |
| AST-08 | Araçlar | P1 | listeForm | `/araclar` | ✅ doğrulandı | faz4c | Araçlar — varlık tablosunun tur=arac görünümü; ayrı kayıt yok (kural 4) |
| AST-09 | Yakıt ve kilometre | P1 | listeForm | `/araclar/yakit` | ✅ doğrulandı | faz4c | Yakıt ve kilometre — sayaç yalnız ileri gider; geri sayaç 422 ile reddedilir |
| AST-10 | Kaza, ceza ve hasar | P1 | listeForm | `/araclar/olaylar` | ✅ doğrulandı | faz4c | Kaza/ceza/hasar — araç olayı geçiş motorunda; kaza İSG olayı da açar |

## Faz 5 — 23 sayfa ailesi

| Kod | Sayfa | Öncelik | Kalıp | Rota | Durum | Commit | Not |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HR-06 | İşten ayrılış sihirbazı | P0 | sihirbaz | `/personel/:id/isten-ayrilis` | ✅ doğrulandı | faz5 | İşten ayrılış sihirbazı — kişiye bağlı kartlar dondurulmadan tamamlanmaz (§6.3, §7) |
| CRD-01 | Kart paneli | P0 | panel | `/kartlar` | ✅ doğrulandı | faz5 | Kart paneli — sağlayıcı/hesap/kart özeti; çalışan yalnız kendi kartlarını görür |
| CRD-02 | Tüm kartlar | P0 | liste | `/kartlar/liste` | ✅ doğrulandı | faz5 | Tüm kartlar — tek liste; Pluxee/MultiNet görünümleri bunun filtresi (kural 4) |
| CRD-03 | Yeni kart | P0 | form | `/kartlar/yeni` | ✅ doğrulandı | faz5 | Yeni kart — yalnız son dört hane; tam numara sütunu YOK (K-085) |
| CRD-04 | Kart detayı | P0 | detay | `/kartlar/:id` | ✅ doğrulandı | faz5 | Kart detayı — bakiye defterden türer, §6.3 durum zinciri |
| CRD-05 | Kart düzenle | P0 | form | `/kartlar/:id/duzenle` | ✅ doğrulandı | faz5 | Kart düzenle — maskeli numara ve izinli alanlar |
| CRD-06 | Kart atama ve devir | P0 | sihirbaz | `/kartlar/:id/atama` | ✅ doğrulandı | faz5 | Kart atama ve devir — çakışan aktif atama 409; geçmiş değişmez |
| CRD-07 | Pluxee (eski Sodexo) | P0 | liste | `/kartlar/pluxee` | ✅ doğrulandı | faz5 | Pluxee (eski Sodexo) — kart listesinin sağlayıcı görünümü |
| CRD-08 | MultiNet | P0 | liste | `/kartlar/multinet` | ✅ doğrulandı | faz5 | MultiNet — kart listesinin sağlayıcı görünümü |
| CRD-09 | Sağlayıcı hesapları | P0 | listeForm | `/kartlar/saglayicilar` | ✅ doğrulandı | faz5 | Sağlayıcı hesapları — aynı sağlayıcıda çoklu kurumsal hesap |
| CRD-10 | Yükleme partileri | P0 | liste | `/kartlar/yuklemeler` | ✅ doğrulandı | faz5 | Yükleme partileri — satır bazlı sonuç özeti |
| CRD-11 | Yeni toplu yükleme | P0 | sihirbaz | `/kartlar/yuklemeler/yeni` | ✅ doğrulandı | faz5 | Yeni toplu yükleme — uygunluk ve tutar politikadan hesaplanır (§6.4) |
| CRD-12 | Yükleme parti detayı | P0 | detay | `/kartlar/yuklemeler/:id` | ✅ doğrulandı | faz5 | Parti detayı — teknik hata/iş kuralı reddi ayrımı, kontrollü dosya akışı |
| CRD-13 | Kart hareketleri | P0 | liste | `/kartlar/hareketler` | ✅ doğrulandı | faz5 | Kart hareketleri — değişmez defter, üye işyeri maskesi |
| CRD-14 | Kart mutabakatı | P0 | mutabakat | `/kartlar/mutabakat` | ✅ doğrulandı | faz5 | Kart mutabakatı — iç defter + sağlayıcı ekstresi + banka |
| CRD-15 | Kayıp/çalıntı/yenileme | P0 | sihirbaz | `/kartlar/:id/guvenlik` | ✅ doğrulandı | faz5 | Kayıp/çalıntı/yenileme — beklemeden blokaj, bakiye devri defter hareketiyle |
| CRD-16 | Kart onayları | P0 | liste | `/kartlar/onaylar` | ✅ doğrulandı | faz5 | Kart onayları + etkili tarihli sürümlü politika yönetimi |
| CRD-17 | Kart raporları | P1 | rapor | `/raporlar/kartlar` | ⬜ bekliyor | — | takma ad → RPT-13; tek ReportLayout ile Faz 6'da gelir |
| CRD-18 | Kart sağlayıcı entegrasyonları | P0 | listeForm | `/ayarlar/entegrasyonlar/kartlar` | ✅ doğrulandı | faz5 | Kart sağlayıcı entegrasyonları — vault referansı, webhook özeti |
| SET-13 | Entegrasyon kataloğu | P0 | liste | `/ayarlar/entegrasyonlar` | ✅ doğrulandı | faz5 | Entegrasyon kataloğu — adaptör, devre kesici, yapılandırma durumu |
| SET-14 | Entegrasyon detayı | P0 | listeForm | `/ayarlar/entegrasyonlar/:id` | ✅ doğrulandı | faz5 | Entegrasyon detayı — yetenek tablosu, devre kesici sıfırlama |
| SET-15 | Entegrasyon işlem günlüğü | P0 | listeForm | `/ayarlar/entegrasyon-loglari` | ✅ doğrulandı | faz5 | Entegrasyon işlem günlüğü — OPS-01: istek kimliği, maskeli payload, retry, DLQ |
| SET-19 | Sistem sağlığı | P0 | panel | `/ayarlar/sistem-sagligi` | ✅ doğrulandı | faz5 | Sistem sağlığı — entegrasyon, DLQ, tekrar kuyruğu, sonuçsuz satır |

## Faz 6 — 27 sayfa ailesi

| Kod | Sayfa | Öncelik | Kalıp | Rota | Durum | Commit | Not |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GLB-07 | Genel arama sonuçları | P1 | liste | `/arama` | ⬜ bekliyor | — | kaynak: crm-sistem-arama-yok (birlestir) |
| HR-14 | Çalışan self-servis | P2 | portal | `/calisan` | ⬜ bekliyor | — | sıfırdan |
| AST-11 | QR/barkod işlem ekranı | P1 | mobil | `/tara` | ⬜ bekliyor | — | kaynak: crm-operasyon-demirbas-etiket-yazdir (birlestir), crm-operasyon-demirbas-etiket (birlestir) |
| EXT-01 | Müşteri ve işverenler | P2 | listeForm | `/musteriler` | ⬜ bekliyor | — | kaynak: crm-cari-kisiler (birlestir), crm-satis-musteri-detay (koru), crm-satis-musteri-form (birlestir), crm-satis-musteriler (koru), crm-satis-talep-detay (birlestir), crm-satis-talepler (birlestir) |
| EXT-02 | Fırsat ve teklif | P2 | listeForm | `/firsatlar` | ⬜ bekliyor | — | kaynak: crm-satis-birim-detay (birlestir), crm-satis-birimler (birlestir), crm-satis-firsat-detay (koru), crm-satis-pipeline (koru) |
| EXT-03 | Teklif hazırlama | P2 | listeForm | `/teklifler` | ⬜ bekliyor | — | kaynak: crm-satis-teklif-detay (birlestir), crm-satis-teklif-form (birlestir), crm-satis-teklifler (koru) |
| EXT-04 | Müşteri portalı | P1 | portal | `/portal/musteri` | ⬜ bekliyor | — | kaynak: portal-belgeler (birlestir), portal-odemeler (birlestir), portal-panel (koru), portal-rapor (birlestir), portal-talepler (birlestir), portal-teslim-tutanagi-detay (birlestir) |
| EXT-05 | Taşeron portalı | P1 | portal | `/portal/taseron` | ⬜ bekliyor | — | kaynak: crm-operasyon-taseron-puantaj-detay (birlestir), crm-operasyon-taseron-puantaj (birlestir) |
| EXT-06 | Tedarikçi portalı | P1 | portal | `/portal/tedarikci` | ⬜ bekliyor | — | sıfırdan |
| EXT-07 | Saha mobil ana sayfa | P1 | mobil | `/mobil` | ⬜ bekliyor | — | kaynak: crm-sistem-baglanti-yok (birlestir) |
| EXT-08 | Kiosk | P2 | mobil | `/kiosk` | ⬜ bekliyor | — | sıfırdan |
| RPT-01 | Rapor merkezi | P0 | liste | `/raporlar` | ⬜ bekliyor | — | kaynak: crm-panel-raporlar (koru) |
| RPT-02 | Standart rapor görüntüleyici | P0 | rapor | `/raporlar/:kod` | ⬜ bekliyor | — | kaynak: crm-finans-banka-cikti (birlestir), crm-finans-mizan-cikti (birlestir), crm-operasyon-kasa-cikti (birlestir), crm-panel-rapor-cari (birlestir) |
| RPT-03 | Proje portföy raporu | P1 | rapor | `/raporlar/proje-portfoyu` | ⬜ bekliyor | — | sıfırdan |
| RPT-04 | Şantiye günlük özet | P1 | rapor | `/raporlar/santiye-gunluk` | ⬜ bekliyor | — | kaynak: crm-panel-rapor-santiye (koru) |
| RPT-05 | Maliyet ve bütçe sapma | P0 | rapor | `/raporlar/maliyet` | ⬜ bekliyor | — | kaynak: crm-finans-maliyet (birlestir), crm-panel-rapor-maliyet (koru) |
| RPT-06 | Nakit akışı | P1 | rapor | `/raporlar/nakit-akisi` | ⬜ bekliyor | — | sıfırdan |
| RPT-07 | Satın alma çevrim süresi | P1 | rapor | `/raporlar/satinalma` | ⬜ bekliyor | — | kaynak: crm-panel-rapor-talep (koru), crm-satinalma-icmal-cikti (birlestir) |
| RPT-08 | Stok ve tüketim | P1 | rapor | `/raporlar/stok` | ⬜ bekliyor | — | sıfırdan |
| RPT-09 | Personel ve puantaj | P1 | rapor | `/raporlar/personel` | ⬜ bekliyor | — | kaynak: crm-operasyon-puantaj-cikti (birlestir), crm-panel-rapor-avans (birlestir), crm-panel-rapor-calisma (birlestir), crm-panel-rapor-em (birlestir), crm-panel-rapor-fm (birlestir), crm-panel-rapor-izin (birlestir), crm-panel-rapor-personel (koru), crm-panel-rapor-puantaj (birlestir), crm-personel-avans-cikti (birlestir), crm-personel-rapor-detay (birlestir), crm-personel-rapor-form (birlestir), crm-personel-rapor (birlestir) |
| RPT-10 | İSG ve kalite | P1 | rapor | `/raporlar/isg-kalite` | ⬜ bekliyor | — | sıfırdan |
| RPT-11 | Sözleşme ve hakediş | P1 | rapor | `/raporlar/sozlesme` | ⬜ bekliyor | — | kaynak: crm-panel-rapor-hakedis (koru) |
| RPT-12 | Varlık ve bakım | P2 | rapor | `/raporlar/varlik` | ⬜ bekliyor | — | kaynak: crm-panel-rapor-demirbas (koru), crm-panel-rapor-makine (birlestir) |
| RPT-13 | Kartlar raporu | P1 | rapor | `/raporlar/kartlar` | ⬜ bekliyor | — | kaynak: crm-operasyon-kredikarti-cikti (birlestir), crm-operasyon-pluxee-cikti (birlestir) |
| RPT-14 | Zamanlanmış raporlar | P2 | listeForm | `/raporlar/zamanlama` | ⬜ bekliyor | — | sıfırdan |
| RPT-15 | Rapor tanım ve formül sözlüğü | P0 | rapor | `/raporlar/sozluk` | ⬜ bekliyor | — | sıfırdan |
| SET-17 | Arşiv ve saklama işleri | P1 | liste | `/ayarlar/arsiv` | ⬜ bekliyor | — | kaynak: crm-ayarlar-arsiv (koru) |

