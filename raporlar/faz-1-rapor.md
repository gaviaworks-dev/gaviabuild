# FAZ 1 RAPORU — Temel platform

**Tarih:** 2026-08-11 · **Dal:** `revizyon/faz-0-6` · **Şartname:** `docs/REVIZYON.md` §9 Faz 1
**Çıkış koşulu:** *"Demo rol seçimi üretimde kapalı; tüm API'lerde sunucu yetkisi; tasarım sistemi testleri."*

---

## 1. Teslim edilen ekranlar (22 aile, hepsi doğrulandı)

| Kod | Ekran | Öne çıkan davranış |
| --- | --- | --- |
| AUTH-01 | Giriş | İki panelli; sol başlık şartnamedeki sabit metin, beş fayda maddesi birebir. Sunucu oturumu, hız sınırı, var/yok sızdırmayan tek hata mesajı. |
| AUTH-02 | Şifremi unuttum | Kayıtlı/kayıtsız e-posta için **aynı** yanıt; önceki açık tokenler geçersizleşir. |
| AUTH-03 | Şifre sıfırla | Tek kullanımlık + 1 saat süreli token; parola politikası; başarıda **tüm oturumlar kapanır**. |
| AUTH-04 | Davet kabul | Kullanıcı kendi şifresini belirler (yönetici atamaz); KVKK onayı zorunlu; rol ve kapsam davetle birlikte atanır. |
| AUTH-05 | MFA doğrulama | TOTP (RFC 6238), ±1 pencere toleransı, 5 dakikalık ikinci adım tokeni. Bağımlılıksız (`node:crypto`). |
| AUTH-06 | İlk kurulum | Kurulum tamamlanmadan **hiçbir uygulama ekranına** girilemez (sunucu tarafı yönlendirme). |
| AUTH-07..10 | Oturum sonu · 403 · 404 · Bakım | Her biri istek kimliği (`req_…`) ile; 404'te WIP/"yakında" metni yok. |
| GLB-01 | Rol bazlı ana panel | KPI ve "erişim bağlamınız" kartı gerçek veriden; rol, kapsam ve yetki sayısı görünür. |
| GLB-06 | Bildirim merkezi | Ortak liste kalıbı, sunucu tarafı sayfalama ve filtre. |
| GLB-10 · GLB-11 | Kişisel notlar + yeni not | ABAC `kendi_kaydi` kuralının gerçek uygulaması; idempotency, CSRF, alan bazlı hata özeti, sürümlü güncelleme. |
| GLB-12 · GLB-13 | Profilim · İşlem geçmişim | Aktif oturum listesi; kullanıcının kendi değiştirilemez denetim izi. |
| SET-01 | Şirketler | Kiracı (tenant) ve tüzel kişi ayrımı. |
| SET-02 | Şirket ayarları | Para birimi ve saat dilimi sunucuda doğrulanır; **optimistic concurrency** ile eski sürüm 409 alır. |
| SET-03 | Kullanıcılar | Liste + davet akışı; davet edilen kişi kendi şifresini belirler. |
| SET-04 | Roller ve yetkiler | Bölüm × eylem matrisi; yetkiler **manifestten türetilir**, elle liste tutulmaz. |
| SET-05 | Veri kapsamı kuralları | ABAC kuralları (kendi_kaydi, kapsam_zorunlu, alan_maskesi, tutar_tavani) görünür. |
| SET-16 | Denetim izi | Hash zinciri doğrulaması ekranda; kırılma olsaydı kırmızı şeritle ve kod ile bildirilirdi. |
| SET-18 | Özellik bayrakları | `demo.*` bayrakları üretimde **kod düzeyinde** kapalı; veritabanında açık olsa bile etkisiz. |

**Faz 1 dışına alınan:** `GLB-02` ve `GLB-03` panoları Faz 4'e taşındı — besleyen modüller (saha, tedarik,
finans) gelmeden yayınlanırsa boş kabuk olurlardı (KARARLAR.md **K-017**).

## 2. Çekirdek platform

| Katman | Dosya | Sağladığı garanti |
| --- | --- | --- |
| Hata sözleşmesi | `app/cekirdek/hata.mjs` | Her hata makine-okunur kod + HTTP durumu + alan bazlı ayrıntı taşır. Sessiz başarısızlık yok. |
| Zaman | `app/cekirdek/zaman.mjs` | UTC epoch ms saklama; sunum kullanıcı saat diliminde. `Date.now()` doğrudan kullanılmaz (test için enjekte edilebilir saat). |
| Para | `app/cekirdek/para.mjs` | Tamsayı minor unit + ISO birim. `0.1 + 0.2 = ₺0,30`; farklı birimlerin toplamı **hata**. Yarı-yukarı yuvarlama. |
| Veri | `app/cekirdek/db.mjs` + `goc.mjs` | WAL + foreign_keys; iç içe transaction (SAVEPOINT); `surumluGuncelle` ile kayıp güncelleme koruması. |
| Denetim | `app/cekirdek/audit.mjs` | Append-only tablo + UPDATE/DELETE tetikleyici reddi + **hash zinciri**. Transaction dışında yazım engelli. |
| Idempotency | `app/cekirdek/idempotency.mjs` | Aynı anahtar → tek etki. Aynı anahtar + farklı gövde → 409. İş kuralı reddi kalıcı, teknik hata tekrar edilebilir. |
| HTTP | `app/cekirdek/http.mjs` | Manifestten türeyen router (statik segment dinamiği yener), güvenlik başlıkları, `HttpOnly/Secure/SameSite` çerez. |
| Yetki | `app/moduller/kimlik/yetki.mjs` | RBAC (yetki anahtarı) + ABAC (tenant, proje/şantiye kapsamı, kayıt sahipliği, alan maskesi, tutar tavanı). |
| Kabuk | `app/web/kabuk.mjs` | Rail + bağlamsal menü + üst bar + breadcrumb + page-head — hepsi **sunucuda**, kullanıcının gerçek yetkilerinden. |
| Bileşenler | `app/web/bilesenler.mjs` | Liste/form/detay/rapor kalıpları + §3.5 sayfalama standardı tek yerden. |

Toplam ~5.300 satır uygulama + test + araç kodu, **sıfır npm bağımlılığı**.

## 3. Kabul testleri — 50/50 geçiyor

```
$ npm test
ℹ tests 50   ℹ pass 50   ℹ fail 0
```

| Test | Sonuç | Nasıl doğrulandı |
| --- | --- | --- |
| **AUTH-01** | ✅ | Ayrı süreçte `GB_ORTAM=uretim` ile: rol seçimi bloğu **yok**, DEMO etiketi **yok**, demo tenant **kurulmuyor**. Ayrıca `?role=`/çerez ile rol yükseltme denemesi 403. |
| **SEC-01** | ✅ | İkinci tenant + kaydı oluşturuldu; liste sorgusu ve `kapsamZorunlu()` başka tenant kaydını reddediyor. 403 sayfası veri sızdırmıyor. |
| **UI-01** | ✅ | 5 listede sayfalama bileşeni, kayıt aralığı, sayfa boyutu; filtre/sayfa URL'de kalıcı; `boyut=100000` sunucuda reddediliyor; toplam **sunucu sonucu**. |
| **UI-02** | ✅ | Form ana alan + sağ özet + ortak alt çubuk; boş zorunlu alan → 422 + alan bazlı hata özeti + gerçek hata kodu; formda durum/onaycı alanı **yok**; CSRF'siz yazma 403; aynı idempotency anahtarı tek kayıt. |
| **AUD-01** | ✅ | Yazma işlemi denetim kaydı üretiyor (kim/ne zaman/hangi istek); `UPDATE`/`DELETE` tetikleyiciyle reddediliyor; zincir doğrulaması sağlam; transaction dışı yazım engelli. |

**Ek platform testleri (yeşil):** menüdeki her bağlantı gerçekten açılıyor (WIP bağlantısı yok) ·
uygulanmamış rota dürüst 404 · yol geçişi (path traversal) engelli · güvenlik başlıkları her yanıtta ·
istemci JS'i `localStorage`'ı yalnız arayüz tercihi için kullanıyor · rol yetkileri manifestten türemiş ·
çalışan onay kutusuna erişemiyor · sistem yöneticisi onay kararı veremiyor · denetçi salt okunur ·
eski sürümle güncelleme 409 · para birimi karışımı reddediliyor.

## 4. Kırık link taraması

`tests/kabul/faz1.test.js` içindeki *"menüdeki her bağlantı gerçekten açılabiliyor"* testi, giriş yapmış
kullanıcının menüsündeki **tüm** bağlantıları gerçek HTTP isteğiyle dolaşır ve `< 400` bekler.
Rail/menü yalnız uygulanmış ekranlardan türediği için ölü bağlantı üretmek yapısal olarak mümkün değil (K-018).

| Ölçüm | Sonuç |
| --- | --- |
| Menüden erişilebilen rota | Tümü 200 |
| Uygulanmamış manifest rotası | Dürüst 404 (WIP metni yok) |
| Statik varlık | `/varliklar/**` — dizin dışına çıkma engelli |

## 5. Yetkisiz erişim testi

| Senaryo | Beklenen | Sonuç |
| --- | --- | --- |
| Oturumsuz `/panel` | Giriş sayfasına yönlendirme (hedef korunarak) | ✅ |
| Çalışan → `/ayarlar/kullanicilar` | 403 | ✅ |
| Çalışan → `/ayarlar/denetim-izi` | 403, veri sızmıyor | ✅ |
| `?role=firma_sahibi` ile yükseltme | 403 | ✅ |
| Sahte rol çerezi | 403 | ✅ |
| Başka tenant kaydı | KAPSAM_DISI | ✅ |
| CSRF'siz POST | 403, kayıt oluşmuyor | ✅ |

## 6. Veri tutarlılığı

| Kontrol | Sonuç |
| --- | --- |
| Denetim zinciri | Sağlam (her satır bir öncekinin özetini taşıyor) |
| Denetim kaydı değiştirme/silme | Veritabanı tetikleyicisiyle reddediliyor |
| Kayıp güncelleme (lost update) | Eski sürümle gönderim 409; kayıt ezilmiyor |
| Çift gönderim | Aynı idempotency anahtarıyla tek kayıt |
| Para hassasiyeti | `0.1 + 0.2 = ₺0,30`; birim karışımı hata |
| Zaman | UTC saklanıyor, sunumda kullanıcı dilimi |

## 7. Görsel değerlendirme (screenshot-eval)

`node tools/ss-eval.mjs` — 11 hedef × 2 ölçü (**1440px** ve **390px**) = 22 ekran görüntüsü.

| Rubrik ölçümü | Sonuç |
| --- | --- |
| Yatay taşma | **0** (her iki ölçüde de) |
| Sayfa başına `<h1>` | 1 (hepsinde) |
| Etiketsiz form girdisi | 0 |
| `alt` metni olmayan görsel | 0 |
| 11px altı metin | 2 (marka imzası `GAVIA` 9.5px ve menü eyebrow 10.5px — tasarım sisteminin kendi bilinçli istisnaları) |

**Bu turda düzeltilen görsel bulgular:**

1. Form düzeni tasarım sistemiyle çakışıyordu (`.gform` ui.css'te alan ızgarası, benim kullanımım
   sayfa düzeniydi) → ana alan/yan panel için `.form-grid`, alanlar için ayrı ızgara.
2. KPI kartı yapısı `.kpi-card` sözleşmesine uymuyordu (etiket/sayı yan yana akıyordu) → ikon + sarmal yapı.
3. Kart başlığında başlık ve açıklama tek satırda akıyordu → `:has()` ile dikey yığma (ikonlu kullanım bozulmadan).
4. Üst bardaki kullanıcı bloğu `me-ava/me-id` sözleşmesini kullanmıyordu → ad ve rol üst üste okunuyor.
5. Mobil kart görünümünde hücre içeriği etiketle yan yana taşıyordu → içerik sarmalı + taşma kırma.
6. Mobil sayfalamada ilk/son düğmeleri gizlenmiyordu → `pg-uc` sınıfıyla §3.5 mobil kuralı uygulandı.
7. Page-head eyebrow breadcrumb'ı tekrar ediyordu → eyebrow artık ekran türünü söylüyor (K-020).
8. Menü ikonları kalıba göre aynıydı → ekran koduna özel ikon haritası.

## 8. Üretime çıkış engelleri (§12) kontrolü

| Engel | Durum |
| --- | --- |
| P0 rotada 404 / WIP / yalnız toast / localStorage iş kaydı | **Yok** — Faz 1 kapsamındaki P0 rotaların tümü gerçek; menü uygulanmamış ekranı göstermiyor; istemci JS'i iş kaydı tutmuyor |
| Query/istemci deposuyla rol, tenant, proje veya onay değişimi | **Yok** — testle doğrulandı |
| Onaylı kaydın sürüm açmadan düzenlenmesi | Faz 1'de onaylı kayıt türü yok; sürüm altyapısı hazır ve 409 ile test edildi |
| Bakiyenin defterden üretilememesi | Faz 1 kapsamı dışı (Faz 4-5) |
| Pluxee/MultiNet idempotency | Faz 5 kapsamı — idempotency altyapısı hazır ve test edildi |
| Rapor PDF/Excel tutarsızlığı | Faz 6 kapsamı |
| Audit / yetki testi / hata ekranı / maskeleme eksiği | **Yok** — dördü de mevcut ve testli |

## 9. Faz 1 çıkış koşulu

| Koşul | Durum |
| --- | --- |
| Tüm API'lerde sunucu tarafı yetki | ✅ RBAC + ABAC; her isleyici `yetkiZorunlu`/`kapsamZorunlu` çağırıyor |
| Demo rol seçimi üretimde kapalı | ✅ Ayrı süreçte üretim ortamıyla doğrulandı |
| Tasarım sistemi testleri | ✅ Sayfa başlığı, breadcrumb, sayfalama, form kalıbı ve SS-eval rubriği |
| Kabul testleri (AUTH-01, SEC-01, UI-01, UI-02, AUD-01) | ✅ 50/50 |

**Sonuç: FAZ 1 KAPANDI.** Faz 2 (iş akışı omurgası) başlayabilir.
