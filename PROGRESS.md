# PROGRESS — ekran bazlı durum tablosu

> **ÜRETİLMİŞ DOSYA.** Elle düzenlemeyin. Durum kaynağı `manifest/durum.json`;
> güncelledikten sonra `node tools/progress-uret.mjs` çalıştırın.
> Plan: `PLAN.md` · Kararlar: `KARARLAR.md` · Şartname: `docs/REVIZYON.md`

**Toplam:** 244 sayfa ailesi — bekliyor: 221 · devam: 0 · bitti: 0 · doğrulandı: 23

| Faz | Aile | Bekliyor | Devam | Bitti | Doğrulandı |
| --- | --- | --- | --- | --- | --- |
| Faz 1 | 22 | 0 | 0 | 0 | 22 |
| Faz 2 | 14 | 13 | 0 | 0 | 1 |
| Faz 3 | 89 | 89 | 0 | 0 | 0 |
| Faz 4 | 69 | 69 | 0 | 0 | 0 |
| Faz 5 | 23 | 23 | 0 | 0 | 0 |
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
| GLB-12 | Profilim | P1 | detay | `/profilim` | ✅ doğrulandı | faz1 | Profil ve oturum listesi |
| GLB-13 | İşlem geçmişim | P2 | liste | `/profilim/islemler` | ✅ doğrulandı | faz1 | Kullanıcının kendi denetim izi |
| SET-01 | Şirketler | P0 | detay | `/ayarlar/sirketler` | ✅ doğrulandı | faz1 | Tenant ve tüzel kişi ayrımı |
| SET-02 | Şirket ayarları | P0 | form | `/ayarlar/sirket` | ✅ doğrulandı | faz1 | Şirket ayarları — optimistic concurrency (409) ile korumalı |
| SET-03 | Kullanıcılar | P0 | detay | `/ayarlar/kullanicilar` | ✅ doğrulandı | faz1 | Kullanıcı listesi + davet akışı |
| SET-04 | Roller ve yetkiler | P0 | matris | `/ayarlar/roller` | ✅ doğrulandı | faz1 | Rol matrisi — yetkiler manifestten türetiliyor |
| SET-05 | Veri kapsamı kuralları | P0 | matris | `/ayarlar/veri-kapsami` | ✅ doğrulandı | faz1 | Veri kapsamı (ABAC) kuralları |
| SET-16 | Denetim izi | P0 | detay | `/ayarlar/denetim-izi` | ✅ doğrulandı | faz1 | Denetim izi + hash zinciri doğrulaması |
| SET-18 | Özellik bayrakları | P2 | form | `/ayarlar/ozellikler` | ✅ doğrulandı | faz1 | Özellik bayrakları — demo.* üretimde kod düzeyinde kilitli |

## Faz 2 — 14 sayfa ailesi

| Kod | Sayfa | Öncelik | Kalıp | Rota | Durum | Commit | Not |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GLB-04 | Onay kutum | P0 | liste | `/onaylar` | ⬜ bekliyor | — | kaynak: crm-panel-onaylar (koru) |
| GLB-05 | Onay detayı | P0 | detay | `/onaylar/:id` | ⬜ bekliyor | — | kaynak: crm-sistem-onay-durum (birlestir) |
| GLB-06 | Bildirim merkezi | P0 | liste | `/bildirimler` | ✅ doğrulandı | faz1 | Bildirim merkezi — liste kalıbı, sunucu sayfalama |
| GLB-09 | Duyurular | P2 | detay | `/duyurular` | ⬜ bekliyor | — | kaynak: crm-panel-duyurular (koru) |
| DOC-01 | Doküman merkezi | P0 | liste | `/dokumanlar` | ⬜ bekliyor | — | sıfırdan |
| DOC-02 | Yeni doküman | P0 | form | `/dokumanlar/yeni` | ⬜ bekliyor | — | kaynak: crm-personel-evrak-form (birlestir) |
| DOC-03 | Doküman detayı | P0 | detay | `/dokumanlar/:id` | ⬜ bekliyor | — | kaynak: crm-personel-evrak-detay (birlestir) |
| SET-06 | İş akışı şablonları | P0 | form | `/ayarlar/is-akislari` | ⬜ bekliyor | — | kaynak: crm-ayarlar-imza-form (birlestir), crm-ayarlar-imza-revizyon (birlestir), crm-ayarlar-onay-form (birlestir), crm-ayarlar-onay (koru) |
| SET-07 | Onay vekaletleri | P0 | form | `/ayarlar/vekaletler` | ⬜ bekliyor | — | sıfırdan |
| SET-08 | Bildirim kuralları | P1 | form | `/ayarlar/bildirimler` | ⬜ bekliyor | — | sıfırdan |
| SET-09 | Numaralandırma şablonları | P1 | form | `/ayarlar/numaralandirma` | ⬜ bekliyor | — | sıfırdan |
| SET-10 | Durum ve sözlük yönetimi | P1 | form | `/ayarlar/sozlukler` | ⬜ bekliyor | — | kaynak: crm-operasyon-demirbas-kategori (birlestir), crm-personel-ozel-alan (birlestir) |
| SET-11 | Maliyet kodları ve WBS eşleme | P0 | matris | `/ayarlar/maliyet-kodlari` | ⬜ bekliyor | — | sıfırdan |
| SET-12 | Belge türleri ve saklama | P1 | form | `/ayarlar/belge-turleri` | ⬜ bekliyor | — | sıfırdan |

## Faz 3 — 89 sayfa ailesi

| Kod | Sayfa | Öncelik | Kalıp | Rota | Durum | Commit | Not |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GLB-08 | Takvim | P1 | takvim | `/takvim` | ⬜ bekliyor | — | kaynak: crm-panel-ajanda (koru), crm-santiye-ajanda-katman (birlestir), crm-santiye-ajanda (birlestir) |
| PRJ-01 | Proje listesi | P0 | liste | `/projeler` | ⬜ bekliyor | — | kaynak: crm-santiye-proje (koru) |
| PRJ-02 | Yeni proje | P0 | form | `/projeler/yeni` | ⬜ bekliyor | — | sıfırdan |
| PRJ-03 | Proje detayı | P0 | detay | `/projeler/:id` | ⬜ bekliyor | — | kaynak: crm-santiye-proje-detay (koru) |
| PRJ-04 | Proje düzenle | P0 | form | `/projeler/:id/duzenle` | ⬜ bekliyor | — | sıfırdan |
| PRJ-05 | Proje aktivasyon sihirbazı | P1 | sihirbaz | `/projeler/:id/aktivasyon` | ⬜ bekliyor | — | sıfırdan |
| PRJ-06 | Proje organizasyonu | P1 | detay | `/projeler/:id/organizasyon` | ⬜ bekliyor | — | sıfırdan |
| PRJ-07 | Proje paydaşları | P1 | form | `/projeler/:id/paydaslar` | ⬜ bekliyor | — | sıfırdan |
| PRJ-08 | Proje risk kaydı | P1 | detay | `/projeler/:id/riskler` | ⬜ bekliyor | — | sıfırdan |
| PRJ-09 | Proje kapanış | P1 | sihirbaz | `/projeler/:id/kapanis` | ⬜ bekliyor | — | sıfırdan |
| PRJ-10 | Proje sürüm ve değişiklik geçmişi | P1 | liste | `/projeler/:id/gecmis` | ⬜ bekliyor | — | sıfırdan |
| SITE-01 | Şantiye listesi | P0 | liste | `/santiyeler` | ⬜ bekliyor | — | kaynak: crm-santiye (koru) |
| SITE-02 | Yeni şantiye | P0 | form | `/santiyeler/yeni` | ⬜ bekliyor | — | kaynak: crm-santiye-form (koru) |
| SITE-03 | Şantiye detayı | P0 | detay | `/santiyeler/:id` | ⬜ bekliyor | — | kaynak: crm-santiye-detay (koru) |
| SITE-04 | Şantiye düzenle | P0 | form | `/santiyeler/:id/duzenle` | ⬜ bekliyor | — | sıfırdan |
| SITE-05 | Şantiye açılış kontrolü | P1 | sihirbaz | `/santiyeler/:id/acilis` | ⬜ bekliyor | — | sıfırdan |
| SITE-06 | Günlük şantiye raporları | P0 | liste | `/santiyeler/:id/gunluk-raporlar` | ⬜ bekliyor | — | sıfırdan |
| SITE-07 | Yeni günlük rapor | P0 | form | `/santiyeler/:id/gunluk-raporlar/yeni` | ⬜ bekliyor | — | sıfırdan |
| SITE-08 | Günlük rapor detayı | P0 | detay | `/gunluk-raporlar/:id` | ⬜ bekliyor | — | sıfırdan |
| SITE-09 | Saha bildirimleri | P0 | liste | `/saha-bildirimleri` | ⬜ bekliyor | — | kaynak: crm-santiye-bildirimler (koru) |
| SITE-10 | Yeni saha bildirimi | P0 | form | `/saha-bildirimleri/yeni` | ⬜ bekliyor | — | kaynak: crm-santiye-bildirim-form (koru) |
| SITE-11 | Saha bildirimi detayı | P0 | detay | `/saha-bildirimleri/:id` | ⬜ bekliyor | — | kaynak: crm-santiye-bildirim-detay (koru) |
| SITE-12 | Saha günlükleri ve ziyaretçiler | P2 | form | `/santiyeler/:id/ziyaretciler` | ⬜ bekliyor | — | sıfırdan |
| SITE-13 | Şantiye izin ve resmi belgeleri | P1 | detay | `/santiyeler/:id/izinler` | ⬜ bekliyor | — | sıfırdan |
| SITE-14 | Geçici kabul | P1 | sihirbaz | `/santiyeler/:id/gecici-kabul` | ⬜ bekliyor | — | sıfırdan |
| SITE-15 | Kesin kabul ve devir | P1 | sihirbaz | `/santiyeler/:id/kesin-kabul` | ⬜ bekliyor | — | sıfırdan |
| SITE-16 | Şantiye kapatma | P1 | sihirbaz | `/santiyeler/:id/kapat` | ⬜ bekliyor | — | sıfırdan |
| PLAN-01 | İş programı listesi | P0 | liste | `/is-programlari` | ⬜ bekliyor | — | sıfırdan |
| PLAN-02 | Yeni iş programı | P0 | form | `/is-programlari/yeni` | ⬜ bekliyor | — | sıfırdan |
| PLAN-03 | İş programı detayı | P0 | detay | `/is-programlari/:id` | ⬜ bekliyor | — | sıfırdan |
| PLAN-04 | WBS düzenleyici | P0 | matris | `/is-programlari/:id/wbs` | ⬜ bekliyor | — | sıfırdan |
| PLAN-05 | Aktivite formu | P0 | form | `/is-programlari/:id/aktiviteler/yeni` | ⬜ bekliyor | — | sıfırdan |
| PLAN-06 | Baz çizgi onayı | P0 | onay | `/is-programlari/:id/baz-cizgi` | ⬜ bekliyor | — | sıfırdan |
| PLAN-07 | Program revizyonu | P0 | onay | `/is-programlari/:id/revizyon` | ⬜ bekliyor | — | sıfırdan |
| PLAN-08 | Haftalık look-ahead | P1 | takvim | `/is-programlari/:id/look-ahead` | ⬜ bekliyor | — | sıfırdan |
| PLAN-09 | İlerleme girişi | P0 | form | `/ilerleme/yeni` | ⬜ bekliyor | — | sıfırdan |
| PLAN-10 | İlerleme doğrulama | P0 | onay | `/ilerleme/:id/dogrula` | ⬜ bekliyor | — | sıfırdan |
| PLAN-11 | Plan-gerçekleşen analizi | P1 | rapor | `/raporlar/plan-gerceklesen` | ⬜ bekliyor | — | kaynak: crm-panel-rapor-isprogrami (birlestir) |
| PLAN-12 | Program içe/dışa aktarma | P2 | sihirbaz | `/is-programlari/:id/aktarim` | ⬜ bekliyor | — | sıfırdan |
| TASK-01 | Görev listesi | P0 | liste | `/gorevler` | ⬜ bekliyor | — | kaynak: crm-gorev (koru) |
| TASK-02 | Yeni görev | P0 | form | `/gorevler/yeni` | ⬜ bekliyor | — | kaynak: crm-gorev-form (koru) |
| TASK-03 | Görev detayı | P0 | detay | `/gorevler/:id` | ⬜ bekliyor | — | kaynak: crm-gorev-detay (koru) |
| TASK-04 | Görev şablonları | P1 | form | `/gorev-sablonlari` | ⬜ bekliyor | — | sıfırdan |
| TASK-05 | Toplu görev oluşturma | P1 | sihirbaz | `/gorevler/toplu` | ⬜ bekliyor | — | sıfırdan |
| TASK-06 | İş emirleri | P1 | liste | `/is-emirleri` | ⬜ bekliyor | — | sıfırdan |
| TASK-07 | İş emri detayı | P1 | detay | `/is-emirleri/:id` | ⬜ bekliyor | — | sıfırdan |
| TASK-08 | Toplantılar | P2 | liste | `/toplantilar` | ⬜ bekliyor | — | sıfırdan |
| TASK-09 | Toplantı detayı ve tutanak | P2 | detay | `/toplantilar/:id` | ⬜ bekliyor | — | sıfırdan |
| HSE-01 | İSG paneli | P0 | panel | `/isg` | ⬜ bekliyor | — | sıfırdan |
| HSE-02 | Olay listesi | P0 | liste | `/isg/olaylar` | ⬜ bekliyor | — | kaynak: crm-santiye-isg (koru) |
| HSE-03 | Kaza bildirimi | P0 | form | `/isg/olaylar/kaza/yeni` | ⬜ bekliyor | — | kaynak: crm-santiye-isg-form (birlestir) |
| HSE-04 | Ramak kala | P0 | form | `/isg/olaylar/ramak-kala/yeni` | ⬜ bekliyor | — | kaynak: crm-santiye-isg-form (birlestir) |
| HSE-05 | Tehlikeli durum/davranış | P0 | form | `/isg/olaylar/tehlike/yeni` | ⬜ bekliyor | — | kaynak: crm-santiye-isg-form (birlestir) |
| HSE-06 | İSG olay detayı | P0 | detay | `/isg/olaylar/:id` | ⬜ bekliyor | — | kaynak: crm-santiye-isg-detay (koru) |
| HSE-07 | Saha denetimleri | P1 | form | `/isg/denetimler` | ⬜ bekliyor | — | sıfırdan |
| HSE-08 | Toolbox konuşmaları | P1 | form | `/isg/toolbox` | ⬜ bekliyor | — | sıfırdan |
| HSE-09 | İSG eğitimleri | P1 | detay | `/isg/egitimler` | ⬜ bekliyor | — | sıfırdan |
| HSE-10 | KKD zimmet ve kontrol | P1 | form | `/isg/kkd` | ⬜ bekliyor | — | sıfırdan |
| HSE-11 | Çevre olayları ve atık | P2 | form | `/cevre` | ⬜ bekliyor | — | sıfırdan |
| HSE-12 | İSG istatistik raporu | P1 | rapor | `/raporlar/isg` | ⬜ bekliyor | — | sıfırdan |
| QLT-01 | Kalite paneli | P0 | panel | `/kalite` | ⬜ bekliyor | — | sıfırdan |
| QLT-02 | ITP listesi | P0 | liste | `/kalite/itp` | ⬜ bekliyor | — | sıfırdan |
| QLT-03 | ITP formu | P0 | form | `/kalite/itp/yeni` | ⬜ bekliyor | — | sıfırdan |
| QLT-04 | Muayene talepleri | P0 | form | `/kalite/muayeneler` | ⬜ bekliyor | — | sıfırdan |
| QLT-05 | NCR uygunsuzluk listesi | P0 | liste | `/kalite/ncr` | ⬜ bekliyor | — | sıfırdan |
| QLT-06 | NCR formu | P0 | form | `/kalite/ncr/yeni` | ⬜ bekliyor | — | sıfırdan |
| QLT-07 | NCR detayı ve DÖF | P0 | detay | `/kalite/ncr/:id` | ⬜ bekliyor | — | sıfırdan |
| QLT-08 | Malzeme onayları | P0 | form | `/teknik/malzeme-onaylari` | ⬜ bekliyor | — | sıfırdan |
| QLT-09 | Submittal kayıtları | P0 | detay | `/teknik/submittal` | ⬜ bekliyor | — | sıfırdan |
| QLT-10 | RFI listesi | P0 | liste | `/teknik/rfi` | ⬜ bekliyor | — | sıfırdan |
| QLT-11 | RFI formu | P0 | form | `/teknik/rfi/yeni` | ⬜ bekliyor | — | sıfırdan |
| QLT-12 | RFI detayı | P0 | detay | `/teknik/rfi/:id` | ⬜ bekliyor | — | sıfırdan |
| QLT-13 | Test ve laboratuvar sonuçları | P1 | form | `/kalite/testler` | ⬜ bekliyor | — | sıfırdan |
| QLT-14 | Punch / eksik işler | P1 | form | `/kalite/punch` | ⬜ bekliyor | — | sıfırdan |
| DOC-04 | Çizim listesi | P0 | liste | `/cizimler` | ⬜ bekliyor | — | sıfırdan |
| DOC-05 | Çizim detayı | P0 | detay | `/cizimler/:id` | ⬜ bekliyor | — | sıfırdan |
| DOC-06 | Transmittal listesi | P0 | liste | `/transmittal` | ⬜ bekliyor | — | sıfırdan |
| DOC-07 | Yeni transmittal | P0 | form | `/transmittal/yeni` | ⬜ bekliyor | — | sıfırdan |
| DOC-08 | Gelen-giden evrak | P1 | form | `/evrak` | ⬜ bekliyor | — | sıfırdan |
| DOC-09 | Belge dağıtım matrisi | P1 | form | `/dokumanlar/dagitim-matrisi` | ⬜ bekliyor | — | sıfırdan |
| DOC-10 | Belge arşivi | P1 | liste | `/dokumanlar/arsiv` | ⬜ bekliyor | — | sıfırdan |
| HR-01 | Personel listesi | P0 | liste | `/personel` | ⬜ bekliyor | — | kaynak: crm-personel (koru) |
| HR-02 | Yeni personel | P0 | form | `/personel/yeni` | ⬜ bekliyor | — | kaynak: crm-personel-form (koru) |
| HR-03 | Personel detayı | P0 | detay | `/personel/:id` | ⬜ bekliyor | — | kaynak: crm-personel-detay (koru), crm-personel-ozluk (birlestir) |
| HR-04 | Personel düzenle | P0 | form | `/personel/:id/duzenle` | ⬜ bekliyor | — | sıfırdan |
| HR-05 | İşe giriş sihirbazı | P1 | sihirbaz | `/personel/:id/ise-giris` | ⬜ bekliyor | — | sıfırdan |
| HR-07 | Şantiye atamaları | P0 | form | `/personel-atamalari` | ⬜ bekliyor | — | sıfırdan |
| HR-08 | Puantaj | P0 | form | `/puantaj` | ⬜ bekliyor | — | kaynak: crm-operasyon-puantaj-form (birlestir), crm-operasyon-puantaj (koru) |
| HR-09 | Puantaj dönem kapanışı | P0 | onay | `/puantaj/donem-kapanis` | ⬜ bekliyor | — | sıfırdan |

## Faz 4 — 69 sayfa ailesi

| Kod | Sayfa | Öncelik | Kalıp | Rota | Durum | Commit | Not |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GLB-02 | Günlük özet | P1 | panel | `/panel/gunluk-ozet` | ⬜ bekliyor | — | K-017: veri kaynağı modülleri (Faz 3-4) gelmeden boş kabuk olurdu → Faz 4 |
| GLB-03 | Yönetici kontrol merkezi | P1 | panel | `/panel/yonetici` | ⬜ bekliyor | — | K-017: portföy/nakit verisi Faz 4 ile gelir → Faz 4 |
| HR-10 | İzin talepleri | P0 | form | `/izinler` | ⬜ bekliyor | — | kaynak: crm-personel-izin-detay (birlestir), crm-personel-izin-form (birlestir), crm-personel-izin (koru) |
| HR-11 | Avans talepleri | P0 | form | `/avanslar` | ⬜ bekliyor | — | kaynak: crm-personel-avans-detay (birlestir), crm-personel-avans-form (birlestir), crm-personel-avans (koru) |
| HR-12 | Sağlık ve uygunluk | P1 | detay | `/personel-saglik` | ⬜ bekliyor | — | sıfırdan |
| HR-13 | Yetkinlik ve sertifikalar | P1 | detay | `/yetkinlikler` | ⬜ bekliyor | — | kaynak: crm-personel-evrak-uyari (birlestir) |
| PRC-01 | Satın alma talepleri | P0 | liste | `/satinalma/talepler` | ⬜ bekliyor | — | kaynak: crm-satinalma-formlar (birlestir), crm-satinalma-talepler (koru) |
| PRC-02 | Yeni satın alma talebi | P0 | form | `/satinalma/talepler/yeni` | ⬜ bekliyor | — | kaynak: crm-satinalma-talep-form (koru) |
| PRC-03 | Talep detayı | P0 | detay | `/satinalma/talepler/:id` | ⬜ bekliyor | — | kaynak: crm-satinalma-form-detay (birlestir), crm-satinalma-talep-detay (koru) |
| PRC-04 | Teklif talepleri RFQ | P0 | form | `/satinalma/rfq` | ⬜ bekliyor | — | kaynak: crm-satinalma-teklif-detay (birlestir), crm-satinalma-teklifler (koru) |
| PRC-05 | Teklif toplama portalı | P1 | portal | `/tedarikci/teklif/:token` | ⬜ bekliyor | — | sıfırdan |
| PRC-06 | Teklif karşılaştırma | P0 | mutabakat | `/satinalma/karsilastirma/:id` | ⬜ bekliyor | — | kaynak: crm-satinalma-teklif-karsilastir (koru) |
| PRC-07 | Satın alma siparişleri | P0 | liste | `/satinalma/siparisler` | ⬜ bekliyor | — | kaynak: crm-satinalma-siparisler (koru), crm-satinalma-termin (birlestir) |
| PRC-08 | Yeni sipariş | P0 | form | `/satinalma/siparisler/yeni` | ⬜ bekliyor | — | sıfırdan |
| PRC-09 | Sipariş detayı | P0 | detay | `/satinalma/siparisler/:id` | ⬜ bekliyor | — | kaynak: crm-satinalma-siparis-detay (koru) |
| PRC-10 | Sipariş değişikliği | P0 | onay | `/satinalma/siparisler/:id/revizyon` | ⬜ bekliyor | — | sıfırdan |
| PRC-11 | Tedarikçiler | P1 | liste | `/tedarikciler` | ⬜ bekliyor | — | kaynak: crm-finans-taseron (birlestir), crm-finans-taseronlar (koru), crm-satinalma-tedarikciler (koru) |
| PRC-12 | Tedarikçi detayı | P1 | detay | `/tedarikciler/:id` | ⬜ bekliyor | — | kaynak: crm-finans-taseron-detay (birlestir), crm-satinalma-tedarikci-detay (koru) |
| PRC-13 | Tedarikçi değerlendirme | P1 | rapor | `/tedarikciler/:id/degerlendirme` | ⬜ bekliyor | — | sıfırdan |
| STK-01 | Depolar | P0 | detay | `/depolar` | ⬜ bekliyor | — | kaynak: crm-operasyon-yemekhane (birlestir) |
| STK-02 | Stok kartları | P0 | detay | `/stok-kartlari` | ⬜ bekliyor | — | kaynak: crm-satinalma-stok-detay (birlestir), crm-satinalma-stok-form (birlestir), crm-satinalma-stok (koru) |
| STK-03 | Mal kabul | P0 | liste | `/mal-kabul` | ⬜ bekliyor | — | kaynak: crm-satinalma-irsaliye-fatura (birlestir) |
| STK-04 | Yeni mal kabul | P0 | form | `/mal-kabul/yeni` | ⬜ bekliyor | — | sıfırdan |
| STK-05 | Mal kabul detayı | P0 | detay | `/mal-kabul/:id` | ⬜ bekliyor | — | sıfırdan |
| STK-06 | Stok rezervasyonu | P0 | form | `/stok/rezervasyonlar` | ⬜ bekliyor | — | sıfırdan |
| STK-07 | Depolar arası transfer | P0 | form | `/stok/transferler` | ⬜ bekliyor | — | sıfırdan |
| STK-08 | Sarf ve iade | P0 | form | `/stok/sarf` | ⬜ bekliyor | — | sıfırdan |
| STK-09 | Stok sayımı | P1 | sihirbaz | `/stok/sayim` | ⬜ bekliyor | — | kaynak: crm-operasyon-yemekhane-sayim-detay (birlestir), crm-operasyon-yemekhane-sayim-form (birlestir) |
| STK-10 | Stok hareket defteri | P0 | rapor | `/stok/hareketler` | ⬜ bekliyor | — | sıfırdan |
| CNT-01 | Sözleşmeler | P0 | liste | `/sozlesmeler` | ⬜ bekliyor | — | kaynak: crm-finans-sozlesmeler (koru), crm-satis-sozlesmeler (birlestir) |
| CNT-02 | Yeni sözleşme | P0 | form | `/sozlesmeler/yeni` | ⬜ bekliyor | — | kaynak: crm-finans-sozlesme-form (koru) |
| CNT-03 | Sözleşme detayı | P0 | detay | `/sozlesmeler/:id` | ⬜ bekliyor | — | kaynak: crm-finans-sozlesme-detay (koru), crm-finans-sozlesme-yetki (birlestir), crm-satis-sozlesme-detay (birlestir) |
| CNT-04 | Zeyil ve ek protokol | P0 | form | `/sozlesmeler/:id/zeyiller` | ⬜ bekliyor | — | kaynak: crm-finans-sozlesme-revizyon (birlestir) |
| CNT-05 | Teminatlar | P0 | detay | `/teminatlar` | ⬜ bekliyor | — | sıfırdan |
| CNT-06 | Metraj cetvelleri | P0 | form | `/metraj` | ⬜ bekliyor | — | sıfırdan |
| CNT-07 | Hakedişler | P0 | liste | `/hakedisler` | ⬜ bekliyor | — | sıfırdan |
| CNT-08 | Yeni hakediş | P0 | sihirbaz | `/hakedisler/yeni` | ⬜ bekliyor | — | kaynak: crm-finans-hakedis-form (koru) |
| CNT-09 | Hakediş detayı | P0 | detay | `/hakedisler/:id` | ⬜ bekliyor | — | kaynak: crm-finans-hakedis-cikti (birlestir), crm-finans-hakedis-detay (koru), crm-finans-hakedis-onay-gecmisi (birlestir) |
| CNT-10 | Değişiklik talepleri | P0 | liste | `/degisiklikler` | ⬜ bekliyor | — | sıfırdan |
| CNT-11 | Yeni değişiklik talebi | P0 | form | `/degisiklikler/yeni` | ⬜ bekliyor | — | sıfırdan |
| CNT-12 | Değişiklik emri | P0 | onay | `/degisiklikler/:id` | ⬜ bekliyor | — | sıfırdan |
| CNT-13 | Gecikme olayları | P0 | form | `/gecikme-olaylari` | ⬜ bekliyor | — | sıfırdan |
| CNT-14 | Süre uzatım talepleri | P0 | form | `/sure-uzatim` | ⬜ bekliyor | — | kaynak: crm-santiye-sure-uzatim-form (koru) |
| CNT-15 | Claim / talep dosyaları | P1 | detay | `/claimler` | ⬜ bekliyor | — | sıfırdan |
| FIN-01 | Finans paneli | P0 | panel | `/finans` | ⬜ bekliyor | — | kaynak: crm-finans-nakit (birlestir) |
| FIN-02 | Bütçeler | P0 | detay | `/butceler` | ⬜ bekliyor | — | kaynak: crm-finans-butce-detay (koru), crm-finans-butce (koru) |
| FIN-03 | Bütçe revizyonu | P0 | onay | `/butceler/:id/revizyon` | ⬜ bekliyor | — | sıfırdan |
| FIN-04 | Tahmin ve EAC | P1 | rapor | `/tahminler` | ⬜ bekliyor | — | sıfırdan |
| FIN-05 | Kasalar | P0 | detay | `/kasalar` | ⬜ bekliyor | — | kaynak: crm-operasyon-kasa-detay (koru), crm-operasyon-kasa-form (birlestir), crm-operasyon-kasa (koru) |
| FIN-06 | Kasa hareketleri | P0 | form | `/kasa-hareketleri` | ⬜ bekliyor | — | kaynak: crm-operasyon-kasa-belgesiz-harcama-form (birlestir), crm-operasyon-kasa-onay-gecmisi (birlestir) |
| FIN-07 | Banka hesapları | P0 | detay | `/banka-hesaplari` | ⬜ bekliyor | — | kaynak: crm-ayarlar-banka-form (birlestir), crm-finans-banka-detay (koru), crm-finans-banka-form (birlestir), crm-finans-banka (koru) |
| FIN-08 | Banka hareketleri | P0 | liste | `/banka-hareketleri` | ⬜ bekliyor | — | kaynak: crm-finans-banka-hareket-detay (birlestir), crm-finans-banka-hareket-form (birlestir), crm-finans-banka-hareket (koru) |
| FIN-09 | Banka hareketi eşleştirme | P0 | mutabakat | `/banka-hareketleri/eslestirme` | ⬜ bekliyor | — | sıfırdan |
| FIN-10 | Cari hesaplar | P0 | detay | `/cariler` | ⬜ bekliyor | — | kaynak: crm-cari-detay (koru), crm-cari-durum (birlestir), crm-cari-form (birlestir), crm-cari (koru), crm-finans-kurum (birlestir), crm-finans-mizan (birlestir) |
| FIN-11 | Ödeme talepleri | P0 | form | `/odemeler` | ⬜ bekliyor | — | sıfırdan |
| FIN-12 | Ödeme planı | P1 | takvim | `/odemeler/plan` | ⬜ bekliyor | — | sıfırdan |
| FIN-13 | Fatura kayıtları | P0 | detay | `/faturalar` | ⬜ bekliyor | — | kaynak: crm-satinalma-irsaliye-fatura (birlestir) |
| FIN-14 | Üçlü eşleştirme | P0 | mutabakat | `/faturalar/eslestirme` | ⬜ bekliyor | — | sıfırdan |
| FIN-15 | Dönem kapanışı | P1 | sihirbaz | `/finans/donem-kapanis` | ⬜ bekliyor | — | kaynak: crm-operasyon-kasa-donem-kapat (birlestir), crm-operasyon-kasa-mutabakat (birlestir) |
| AST-01 | Varlık listesi | P0 | liste | `/varliklar` | ⬜ bekliyor | — | kaynak: crm-operasyon-demirbas (koru), crm-operasyon-makine (birlestir) |
| AST-02 | Yeni varlık | P0 | form | `/varliklar/yeni` | ⬜ bekliyor | — | kaynak: crm-operasyon-arac-form (birlestir), crm-operasyon-demirbas-form (koru), crm-operasyon-makine-form (birlestir) |
| AST-03 | Varlık detayı | P0 | detay | `/varliklar/:id` | ⬜ bekliyor | — | kaynak: crm-operasyon-demirbas-detay (koru) |
| AST-04 | Zimmet ve devir | P0 | form | `/zimmetler` | ⬜ bekliyor | — | kaynak: crm-personel-zimmet-detay (koru), crm-personel-zimmet-iade (birlestir) |
| AST-05 | Bakım planları | P1 | form | `/bakim-planlari` | ⬜ bekliyor | — | sıfırdan |
| AST-06 | Bakım iş emirleri | P1 | detay | `/bakim-is-emirleri` | ⬜ bekliyor | — | kaynak: crm-operasyon-arac-bakim (birlestir) |
| AST-07 | Kalibrasyon ve periyodik kontrol | P1 | liste | `/varlik-kontrolleri` | ⬜ bekliyor | — | sıfırdan |
| AST-08 | Araçlar | P1 | detay | `/araclar` | ⬜ bekliyor | — | kaynak: crm-operasyon-arac-arsiv (birlestir), crm-operasyon-arac-detay (koru), crm-operasyon-arac-evrak (birlestir), crm-operasyon-arac (koru) |
| AST-09 | Yakıt ve kilometre | P1 | form | `/araclar/yakit` | ⬜ bekliyor | — | kaynak: crm-operasyon-arac-kullanim (birlestir), crm-operasyon-arac-yakit (koru) |
| AST-10 | Kaza, ceza ve hasar | P1 | form | `/araclar/olaylar` | ⬜ bekliyor | — | kaynak: crm-operasyon-arac-gider (birlestir) |

## Faz 5 — 23 sayfa ailesi

| Kod | Sayfa | Öncelik | Kalıp | Rota | Durum | Commit | Not |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HR-06 | İşten ayrılış sihirbazı | P0 | sihirbaz | `/personel/:id/isten-ayrilis` | ⬜ bekliyor | — | sıfırdan |
| CRD-01 | Kart paneli | P0 | panel | `/kartlar` | ⬜ bekliyor | — | sıfırdan |
| CRD-02 | Tüm kartlar | P0 | liste | `/kartlar/liste` | ⬜ bekliyor | — | kaynak: crm-operasyon-kredikarti (birlestir) |
| CRD-03 | Yeni kart | P0 | form | `/kartlar/yeni` | ⬜ bekliyor | — | kaynak: crm-operasyon-kredikarti-form (birlestir), crm-operasyon-kredikarti-kart-form (birlestir) |
| CRD-04 | Kart detayı | P0 | detay | `/kartlar/:id` | ⬜ bekliyor | — | sıfırdan |
| CRD-05 | Kart düzenle | P0 | form | `/kartlar/:id/duzenle` | ⬜ bekliyor | — | sıfırdan |
| CRD-06 | Kart atama ve devir | P0 | sihirbaz | `/kartlar/:id/atama` | ⬜ bekliyor | — | sıfırdan |
| CRD-07 | Pluxee (eski Sodexo) | P0 | liste | `/kartlar/pluxee` | ⬜ bekliyor | — | kaynak: crm-operasyon-pluxee (koru) |
| CRD-08 | MultiNet | P0 | liste | `/kartlar/multinet` | ⬜ bekliyor | — | sıfırdan |
| CRD-09 | Sağlayıcı hesapları | P0 | form | `/kartlar/saglayicilar` | ⬜ bekliyor | — | sıfırdan |
| CRD-10 | Yükleme partileri | P0 | liste | `/kartlar/yuklemeler` | ⬜ bekliyor | — | sıfırdan |
| CRD-11 | Yeni toplu yükleme | P0 | sihirbaz | `/kartlar/yuklemeler/yeni` | ⬜ bekliyor | — | kaynak: crm-operasyon-pluxee-form (birlestir) |
| CRD-12 | Yükleme parti detayı | P0 | detay | `/kartlar/yuklemeler/:id` | ⬜ bekliyor | — | sıfırdan |
| CRD-13 | Kart hareketleri | P0 | liste | `/kartlar/hareketler` | ⬜ bekliyor | — | sıfırdan |
| CRD-14 | Kart mutabakatı | P0 | mutabakat | `/kartlar/mutabakat` | ⬜ bekliyor | — | sıfırdan |
| CRD-15 | Kayıp/çalıntı/yenileme | P0 | sihirbaz | `/kartlar/:id/guvenlik` | ⬜ bekliyor | — | sıfırdan |
| CRD-16 | Kart onayları | P0 | liste | `/kartlar/onaylar` | ⬜ bekliyor | — | sıfırdan |
| CRD-17 | Kart raporları | P1 | rapor | `/raporlar/kartlar` | ⬜ bekliyor | — | takma ad → RPT-13 |
| CRD-18 | Kart sağlayıcı entegrasyonları | P0 | ayar | `/ayarlar/entegrasyonlar/kartlar` | ⬜ bekliyor | — | sıfırdan |
| SET-13 | Entegrasyon kataloğu | P0 | liste | `/ayarlar/entegrasyonlar` | ⬜ bekliyor | — | kaynak: crm-ayarlar-entegrasyonlar (koru) |
| SET-14 | Entegrasyon detayı | P0 | ayar | `/ayarlar/entegrasyonlar/:id` | ⬜ bekliyor | — | sıfırdan |
| SET-15 | Entegrasyon işlem günlüğü | P0 | detay | `/ayarlar/entegrasyon-loglari` | ⬜ bekliyor | — | sıfırdan |
| SET-19 | Sistem sağlığı | P0 | panel | `/ayarlar/sistem-sagligi` | ⬜ bekliyor | — | sıfırdan |

## Faz 6 — 27 sayfa ailesi

| Kod | Sayfa | Öncelik | Kalıp | Rota | Durum | Commit | Not |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GLB-07 | Genel arama sonuçları | P1 | liste | `/arama` | ⬜ bekliyor | — | kaynak: crm-sistem-arama-yok (birlestir) |
| HR-14 | Çalışan self-servis | P2 | portal | `/calisan` | ⬜ bekliyor | — | sıfırdan |
| AST-11 | QR/barkod işlem ekranı | P1 | mobil | `/tara` | ⬜ bekliyor | — | kaynak: crm-operasyon-demirbas-etiket-yazdir (birlestir), crm-operasyon-demirbas-etiket (birlestir) |
| EXT-01 | Müşteri ve işverenler | P2 | detay | `/musteriler` | ⬜ bekliyor | — | kaynak: crm-cari-kisiler (birlestir), crm-satis-musteri-detay (koru), crm-satis-musteri-form (birlestir), crm-satis-musteriler (koru), crm-satis-talep-detay (birlestir), crm-satis-talepler (birlestir) |
| EXT-02 | Fırsat ve teklif | P2 | detay | `/firsatlar` | ⬜ bekliyor | — | kaynak: crm-satis-birim-detay (birlestir), crm-satis-birimler (birlestir), crm-satis-firsat-detay (koru), crm-satis-pipeline (koru) |
| EXT-03 | Teklif hazırlama | P2 | form | `/teklifler` | ⬜ bekliyor | — | kaynak: crm-satis-teklif-detay (birlestir), crm-satis-teklif-form (birlestir), crm-satis-teklifler (koru) |
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
| RPT-14 | Zamanlanmış raporlar | P2 | form | `/raporlar/zamanlama` | ⬜ bekliyor | — | sıfırdan |
| RPT-15 | Rapor tanım ve formül sözlüğü | P0 | rapor | `/raporlar/sozluk` | ⬜ bekliyor | — | sıfırdan |
| SET-17 | Arşiv ve saklama işleri | P1 | liste | `/ayarlar/arsiv` | ⬜ bekliyor | — | kaynak: crm-ayarlar-arsiv (koru) |

