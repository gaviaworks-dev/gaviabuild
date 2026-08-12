# Denetim-01 — düşman gözüyle bağımsız doğrulama

**Tarih:** 12 Ağustos 2026 · **Dal:** `revizyon/faz-0-6` · **Taban commit:** `a3d1be7`
**Yöntem:** Kod okuması değil — **gerçek sunucu, gerçek HTTP, gerçek oturum**.
`tests/yardimci.mjs` istemcisiyle 10 demo persona ile giriş yapıldı, siteler
gezildi, formlar gönderildi, veritabanı satır sayıları gönderim öncesi/sonrası
karşılaştırıldı. Her iddianın altında onu üreten komut çıktısı vardır.

> Bu rapor `DEVIR.md`'nin "244/244 doğrulandı, §12 engeli kalmadı" iddiasını
> sınamak için yazıldı. **İddia kısmen tutmadı:** üç kırmızı bulgu §12
> kapsamındadır. Üçü de bu turda düzeltildi ve regresyon testine bağlandı.

---

## 0. Özet

| # | Bulgu | Ağırlık | Durum |
|---|---|---|---|
| D-01 | 26 ekran (11'i P0) hiçbir rolde, hiçbir sayfadan bağlantısı olmadığı için **açılamıyordu** | 🔴 §12 | ✅ düzeltildi |
| D-02 | `/mobil` ana ekranındaki "Günlük rapor" düğmesi **404** veriyordu | 🔴 §12 | ✅ düzeltildi |
| D-03 | Üretimde davet ve şifre sıfırlama **"gönderildi" diyordu**, gönderici yok | 🔴 kural 3 | ✅ düzeltildi |
| D-04 | Proje/plan detayında `?sekme=` ile ikinci bir gezinme şeması; manifest rotaları yetim | 🟡 kural 1 | açık |
| D-05 | RPT-15, HSE-12, PLAN-11 `?cikti=pdf` çağrısında sessizce HTML dönüyor | 🟡 kural 9 | açık |
| D-06 | K-027 (antivirüs bağlı değil) kullanıcıya **hiçbir yerde söylenmiyor** | 🟡 | açık |
| D-07 | Boş kurulumda `/kartlar/yeni` ve `/santiyeler/yeni` çıkışsız form | 🟡 UX | açık |

**Sağlam çıkan alanlar (bağımsız olarak doğrulandı):** sunucu tarafı yetki,
tenant/kapsam izolasyonu, CSRF, defter değişmezliği, rapor çıktı üretimi,
doğrulama katmanı, 5xx yokluğu. Ayrıntı §7.

---

## 1. Manifest ↔ gerçek rota

```
$ node d1-envanter.mjs
manifestAile 244 · uygulananKod 244 · rotaSayisi 429
planliStub 0            ← "henüz yayında değil" 404 stub'ı KALMAMIŞ
rotasizManifest 1       ← CRD-17 (takmaAdi: RPT-13 — kanonik ekranın rotasını kullanır, doğru)
manifestsizRota 6       ← GET /portal/{musteri,taseron,tedarikci}/:token, POST /cikis, GET /sso, GET /
cakisanDesen 0
uygulananFazlalik 0
```

Manifest ile router **birebir örtüşüyor**. Manifest dışı 6 rotanın hepsi
gerekçeli: üç portal rotası tokenle doğrulanır (K-108), diğer üçü altyapı.

### D-01 — 26 ekran hiçbir yerden açılamıyordu 🔴

`app/web/kabuk.mjs:menuOgesiMi()` şu kuralı uyguluyordu: *"rotası başka bir
ekranın rotasının altına düşüyorsa menüde gösterme."* Amaç `/projeler/yeni`
gibi kayıt açma sayfalarını menüden düşürmekti; sonuç, `/kartlar/hareketler`
gibi **kendi başına gezinme hedefi olan liste ekranlarının da düşmesi** oldu.
Ebeveyn sayfa da bunlara bağlantı vermeyince ekran erişilemez hale geldi.

10 personanın hepsiyle giriş yapılıp kökten başlayarak toplanan **tüm `href`
değerleri** birleştirildi; manifestteki hiçbir sayfada geçmeyen ekranlar:

```
$ node d9-coklu.mjs            # 10 persona × tam gezinti, 149 ayrı iç bağlantı toplandı
toplanan link 149 {"sahip":148,"sistem":30,"proje":114,"sef":82,"satinalma":34,
                   "depo":29,"finans":52,"ik":30,"calisan":15,"denetci":133}
=== HİÇBİR ROLDE HİÇBİR SAYFADAN LİNKLENMEYEN EKRANLAR (34) ===
P0 | AUTH-01 | /giris                    ← beklenen (oturum içinden bağlanmaz)
P0 | AUTH-02 | /sifre-unuttum            ← beklenen
P0 | AUTH-05 | /mfa                      ← beklenen
P0 | AUTH-06 | /ilk-kurulum              ← beklenen
P0 | AUTH-07 | /oturum-sonlandi          ← beklenen
P0 | AUTH-08 | /403                      ← beklenen
P1 | AUTH-09 | /404                      ← beklenen
P1 | AUTH-10 | /bakim                    ← beklenen
--- aşağıdakiler BULGU ---
P1 | GLB-02 | /panel/gunluk-ozet          | Günlük özet
P1 | GLB-03 | /panel/yonetici             | Yönetici kontrol merkezi
P1 | PLAN-11 | /raporlar/plan-gerceklesen | Plan-gerçekleşen analizi
P1 | TASK-05 | /gorevler/toplu            | Toplu görev oluşturma
P1 | HSE-08 | /isg/toolbox                | Toolbox konuşmaları
P1 | HSE-09 | /isg/egitimler              | İSG eğitimleri
P1 | HSE-10 | /isg/kkd                    | KKD zimmet ve kontrol
P0 | QLT-02 | /kalite/itp                 | ITP listesi
P0 | QLT-03 | /kalite/itp/yeni            | ITP formu
P1 | QLT-13 | /kalite/testler             | Test ve laboratuvar sonuçları
P1 | QLT-14 | /kalite/punch               | Punch / eksik işler
P1 | DOC-09 | /dokumanlar/dagitim-matrisi | Belge dağıtım matrisi
P1 | DOC-10 | /dokumanlar/arsiv           | Belge arşivi
P0 | HR-09  | /puantaj/donem-kapanis      | Puantaj dönem kapanışı
P1 | FIN-12 | /odemeler/plan              | Ödeme planı
P0 | CRD-07 | /kartlar/pluxee             | Pluxee (eski Sodexo)
P0 | CRD-08 | /kartlar/multinet           | MultiNet
P0 | CRD-09 | /kartlar/saglayicilar       | Sağlayıcı hesapları
P0 | CRD-10 | /kartlar/yuklemeler         | Yükleme partileri
P0 | CRD-11 | /kartlar/yuklemeler/yeni    | Yeni toplu yükleme
P0 | CRD-13 | /kartlar/hareketler         | Kart hareketleri
P0 | CRD-14 | /kartlar/mutabakat          | Kart mutabakatı
P0 | CRD-16 | /kartlar/onaylar            | Kart onayları
P1 | AST-09 | /araclar/yakit              | Yakıt ve kilometre
P1 | AST-10 | /araclar/olaylar            | Kaza, ceza ve hasar
P2 | RPT-14 | /raporlar/zamanlama         | Zamanlanmış raporlar
```

**26 ekran, 11'i P0.** Kartlar modülünün 18 ekranından **9'u** — yani doğrudan
Faz 5'in tamamı — kullanıcı için yoktu. `/kartlar` bölüm menüsünde **tek bir
öge** vardı ("Kart paneli"); Raporlar bölümünde de tek öge vardı.

Ekranların kendisi çalışıyordu (doğrudan URL yazınca 200 dönüyor). Bu yüzden
mevcut testler bunu yakalamadı: testler rotayı çağırıyor, **kullanıcının oraya
gidebildiğini** sınamıyordu.

**Düzeltme (K-114):** gizleme ölçütü rota ön eki değil ekran kalıbıdır. Yalnız
`form` ve `sihirbaz` kalıpları ebeveynine bırakılır. Ek olarak `/gorevler`
listesine TASK-05 sihirbazına giden "Toplu görev" düğmesi eklendi
(`app/rotalar/saha.mjs`).

```
$ node d9-coklu.mjs            # düzeltmeden sonra
KALAN YETİM: 0 []
AUTH yetimleri (beklenen): AUTH-01,AUTH-02,AUTH-05,AUTH-06,AUTH-07,AUTH-08,AUTH-09,AUTH-10
```

Bölüm menüsü azami öge sayısı **değişmedi** (Ayarlar zaten 18 ögeydi; en çok
büyüyen bölüm Raporlar 1 → 14):

```
Ayarlar        18 →  18        Kartlar             1 →  10
Raporlar        1 →  14        Kalite ve teknik    4 →   9
Finans         10 →  13        İSG ve çevre        2 →   8
Çalışma alanı   8 →  11        ESKİ MAKS 18 · YENİ MAKS 18
```

---

## 2. Her ekran ailesinden gerçek istek

### 2.1 Durum matrisi — 10 persona × 176 statik ekran

```
$ node d3-matris.mjs
persona                  rol                    durum dağılımı
sahip@yapitas.demo       Firma sahibi           {"200":172,"303":3,"403":2,"404":1,"503":1}
sistem@yapitas.demo      Sistem yöneticisi      {"200":32,"303":2,"403":143,"404":1,"503":1}
proje@yapitas.demo       Proje müdürü           {"200":128,"303":3,"403":46,"404":1,"503":1}
sef@yapitas.demo         Şantiye şefi           {"200":95,"303":3,"403":79,"404":1,"503":1}
satinalma@yapitas.demo   Satın alma sorumlusu   {"200":38,"303":2,"403":137,"404":1,"503":1}
depo@yapitas.demo        Depo sorumlusu         {"200":33,"303":2,"403":142,"404":1,"503":1}
finans@yapitas.demo      Finans sorumlusu       {"200":65,"303":2,"403":110,"404":1,"503":1}
ik@yapitas.demo          İK sorumlusu           {"200":35,"303":2,"403":140,"404":1,"503":1}
calisan@yapitas.demo     Çalışan                {"200":18,"303":2,"403":157,"404":1,"503":1}
denetci@yapitas.demo     Denetçi                {"200":172,"303":3,"403":2,"404":1,"503":1}

--- 5xx olanlar ---
(yalnız AUTH-10 /bakim → 503, bilinçli bakım sayfası)
```

**Hiçbir ekranda beklenmeyen 5xx yok.** Rol başına 403 sayısının 2 ile 157
arasında değişmesi, yetkinin gerçekten sunucuda çözüldüğünü gösteriyor.

`404` dönen tek ekran AUTH-09 `/404`'ün kendisidir (doğru davranış).
`Denetçi` ile `Firma sahibi`nin GET matrisi **birebir aynı** — bu tasarım
gereğidir (`roller.mjs`: denetçi `bolumler: ['*']`, `eylemler:
['goruntule','disa_aktar']`); yazma denemeleri §4'te ayrıca sınandı.

### 2.2 Form gönderimi gerçekten yazıyor mu?

143 form/liste-form/sihirbaz ekranının formu ayrıştırıldı, alan tipine göre
makul değerlerle dolduruldu, gönderildi ve **gönderim öncesi/sonrası tüm
tabloların satır sayıları** karşılaştırıldı (audit/oturum tabloları hariç).

```
$ node d4-form.mjs
hedef 143 · denenen 89 · atlanan 54 (multipart veya POST formu olmayan)
durum dağılımı { '200': 1, '303': 43, '409': 1, '422': 44 }
YAZMA YOK ama 2xx/3xx: 3
```

43 başarılı gönderimin **41'i gerçekten satır yazdı**:

```
GLB-09 /duyurular       → {"idempotency":1,"duyuru":1}
TASK-02 /gorevler/yeni  → {"idempotency":1,"bildirim":1,"gorev":1}
HSE-03 /isg/olaylar/kaza/yeni → {"idempotency":1,"bildirim":2,"isg_olayi":1}
QLT-06 /kalite/ncr/yeni → {"idempotency":1,"ncr":1}
FIN-05 /kasalar         → {"kasa":1}
CRD-09 /kartlar/saglayicilar → {"idempotency":1,"saglayici_hesabi":1}
SET-03 /ayarlar/kullanicilar → {"kullanici":1,"kullanici_rol":1,"tek_kullanimlik_token":1}
…toplam 41 ekran
```

Satır yazmayan 2 gönderim (SET-02 şirket ayarı, SET-18 özellik bayrağı)
**güncelleme**dir — satır sayısı zaten değişmez. Üçüncüsü AUTH-02'dir ve §3'ün
konusudur.

44 adet 422, **gerçek alan doğrulamasıdır**, kabuk değil:

```
$ node d5-prj.mjs   /projeler/yeni → 422
  uyarı: ["Bitiş tarihi başlangıçtan sonra olmalı.", "Tutar sayı olmalı."]
  /personel/yeni → 422
  uyarı: ["11 haneli olmalıdır.", "Tutar sayı olmalı."]
  /sozlesmeler/yeni → 422
  uyarı: ["Miktar sıfırdan büyük olmalı."]
```

Doğru değerlerle gönderildiğinde hepsi 303 dönüp kayıt açıyor (§2.3).

### 2.3 Uçtan uca veri kurulumu ve dinamik ekranlar

Gerçek formlarla proje → şantiye → depo/kasa/banka/cari/tedarikçi → personel →
sağlayıcı hesabı → iş programı → sözleşme → görev zinciri kuruldu:

```
$ node d6-tohum.mjs
303 /projeler/yeni · 303 /santiyeler/yeni · 303 /depolar · 303 /kasalar
303 /banka-hesaplari · 303 /cariler · 303 /tedarikciler · 303 /personel/yeni
303 /kartlar/saglayicilar · 303 /is-programlari/yeni · 303 /sozlesmeler/yeni
303 /gorevler/yeni
=== GEZİ === ziyaret 171 · ulasilanKod 168/244
HATALI: [{"yol":"/gunluk-raporlar","durum":404,"nereden":"/mobil"}]
```

Kayıt açıldıktan sonra detay ve alt sekme ekranları gerçek kimliklerle açıldı:

```
200 /projeler/prj_…            [PRJ-03]     200 /santiyeler/ste_…/acilis        [SITE-05]
200 /projeler/prj_…/duzenle    [PRJ-04]     200 /santiyeler/ste_…/izinler       [SITE-13]
200 /santiyeler/ste_…          [SITE-03]    200 /santiyeler/ste_…/gecici-kabul  [SITE-14]
200 /is-programlari/pln_…/wbs  [PLAN-04]    200 /santiyeler/ste_…/kesin-kabul   [SITE-15]
200 /sozlesmeler/cnt_…/zeyiller[CNT-04]     200 /santiyeler/ste_…/gunluk-raporlar/yeni [SITE-07]
```

### D-02 — `/mobil` → `/gunluk-raporlar` ölü bağlantı 🔴

```
$ grep -rn "'/gunluk-raporlar'" app/
app/rotalar/portal.mjs:458:  ${BB.btn('Günlük rapor', { rota: '/gunluk-raporlar', ikon: 'fa-clipboard' })}
```

`/gunluk-raporlar` **rota değildir**. Kanonik rotalar `SITE-06
/santiyeler/:id/gunluk-raporlar` ve `SITE-08 /gunluk-raporlar/:id`'dir. Düğme
saha mobil ana ekranının (EXT-07) "Sahadan hızlı erişim" kartındadır — yani
şantiye şefinin günlük raporunu açtığı birincil yol. §12: *"P0 rotada 404, WIP
bağlantısı."*

**Düzeltme:** düğme aktif şantiyenin kanonik rotasına gider; şantiye yoksa
düğme hiç çizilmez (ölü bağlantı üretmektense göstermemek doğrudur).

---

## 3. Sahte başarı avı

### D-03 — Üretimde "gönderildi" diyen iki akış 🔴

`K-021` e-posta gönderiminin bağlı olmadığını kayda geçirmişti; **metinler
düzeltilmemişti.**

```
$ grep -rn "e-posta adresine" app/
app/rotalar/ayarlar.mjs:158: : 'Davet bağlantısı kullanıcının e-posta adresine gönderildi.'
```

Ternary'nin koşulu `davetLink && !yapilandirma.uretim` idi. Üretimde:
* `davetLink` **hiç üretilmiyordu** (`const baglanti = yapilandirma.uretim ? '' : …`),
* kullanıcıya **"e-posta adresine gönderildi"** deniyordu,
* uygulamada **hiçbir e-posta göndericisi yok** (`grep -rn "smtp\|sendMail" app/` → 0 sonuç).

Sonuç: üretimde davet **hiçbir yolla teslim edilemiyordu** ve ekran bunu
başarı olarak bildiriyordu. Aynı desen AUTH-02'de:

```
app/web/sayfalar/kimlik.mjs:81: <h2>Bağlantı gönderildi</h2>
    <p>Bu e-posta adresi kayıtlıysa, sıfırlama bağlantısı gönderildi.</p>
```

Bu, kural 3'ün ("Sahte başarı bildirimi yok") ve §12'nin ("yalnızca toast
üreten işlem") doğrudan ihlalidir.

**Düzeltme (K-115):** ölçüt ortam değil, **göndericinin varlığıdır**
(`yapilandirma.epostaBagli`, öntanımlı kapalı).

| Akış | Aktör | Gönderici yokken davranış |
|---|---|---|
| SET-03 davet | oturumlu, `SET-03:olustur` yetkili yönetici | "davet oluşturuldu — **e-posta GÖNDERİLMEDİ**" + bağlantı gösterilir (üretim dahil), elden iletilir |
| AUTH-02 sıfırlama | **anonim** | "talebiniz alındı — **e-posta GÖNDERİLMEDİ**", yöneticiye yönlendirme; **token hiçbir ortamda gösterilmez** |

İki akış ayrı karara bağlandı: sıfırlama tokenini anonim kullanıcıya göstermek
doğrudan hesap ele geçirme olurdu. Hesap var/yok sızıntısına karşı "Bu e-posta
adresi kayıtlıysa" ifadesi korundu.

### Sahte başarı bulunmayan yerler

Aynı desen tüm kod tabanında arandı; kalan üç açık uç **dürüst** çıktı:

```
app/rotalar/rapor.mjs:254   B.sonucSeridi({ tur: 'warn', baslik: 'Gönderim henüz bağlanmadı',
  aciklama: '…e-posta gönderimi K-021 gereği bu sürümde YOK. Kayıtlar "gönderildi"
             işaretlenmez — sahte başarı üretilmez (kural 3).' })
app/rotalar/rapor.mjs:338   return `${rapor.kod} zamanlaması kaydedildi (gönderim K-021 gereği henüz bağlı değil)`;

app/moduller/kartlar/adaptor.mjs:213  return bilinmiyor('DOSYA_URETILDI', '…Sağlayıcıdan dönen sonuç
                                       dosyası yüklenmeden parti sonuçlanmaz.');
app/moduller/kartlar/adaptor.mjs:243  return teknikHata('YAPILANDIRMA_EKSIK', '…taban adres veya kimlik
                                       bilgisi tanımlı değil. Ayarlar › Entegrasyonlar ekranından tamamlayın.');
```

Dosya adaptörü "gönderildi" değil **`bilinmiyor`** döndürüyor; HTTP adaptörü
yapılandırma eksikken **teknik hata** veriyor. İkisi de doğru.

---

## 4. Yetki — her rol için gerçek deneme

```
$ node d8-yetki.mjs
403  denetçi PROJE oluşturamamalı          403  çalışan FİNANS listesi
403  denetçi CARİ oluşturamamalı           403  çalışan PERSONEL listesi
403  denetçi KASA oluşturamamalı           403  çalışan BÜTÇELER
403  denetçi DUYURU oluşturamamalı         403  çalışan PROJE detayı
                                            403  çalışan AYARLAR
200  çalışan KART HAREKETLERİ (kendi)      403  çalışan DENETİM İZİ
```

**Denetçi** GET matrisinde firma sahibiyle aynı görünse de, denenen dört yazma
işleminin **dördü de 403** döndü — salt okunurluk gerçek.
**Çalışan** yalnız `ekstra` ile açılan kendi verisine ulaşabiliyor.

### Mobil ve kiosk

```
200  şef → /mobil        200  şef → /kiosk        200  şef → /tara
403  çalışan → /mobil    403  çalışan → /kiosk    403  çalışan → /tara
403  finans → /mobil     403  finans → /kiosk     403  finans → /tara
```

K-113 ile şantiye şefine verilen `EXT-07`/`EXT-08` ekstra yetkisi çalışıyor;
`dis` bölümünün tamamı açılmamış.

### Portal (oturumsuz, tokenli)

```
404  anonim /portal/tedarikci/UYDURMA     303  anonim /portal/tedarikci  → /giris
404  anonim /portal/musteri/UYDURMA       303  anonim /kartlar           → /giris
404  anonim /portal/taseron/UYDURMA       303  anonim /projeler          → /giris
404  anonim /tedarikci/teklif/UYDURMA     303  anonim /finans            → /giris
```

Uydurma token **404**; iç ekranlar anonim kullanıcıyı girişe yönlendiriyor.
Token açık saklanmıyor (`portal_erisimi.token_ozeti`, K-108).

### İstemci tarafı yetki denemeleri

```
403  şef /kasalar?rol=firma_sahibi                403  CSRF alanı olmadan POST
403  şef /kasalar?role=firma_sahibi               403  çalışan başka kapsamdaki proje detayı
403  şef /butceler?tenant=ten_x
403  şef /ayarlar/kullanicilar?rol=sistem_yoneticisi
```

Query parametresiyle rol/tenant değiştirme **çalışmıyor** (değişmez kural 2).

---

## 5. Dört açık uç — kullanıcıya nasıl görünüyor?

| Açık uç | Kullanıcıya söyleniyor mu? | Değerlendirme |
|---|---|---|
| **K-021** e-posta gönderimi | ❌ **Hayır — tersini söylüyordu** | 🔴 D-03, düzeltildi |
| **RPT-14** zamanlanmış rapor gönderimi | ✅ Evet — ekranda sarı şerit: *"Gönderim henüz bağlanmadı… Kayıtlar 'gönderildi' işaretlenmez"*; kaydetme mesajı da *"gönderim K-021 gereği henüz bağlı değil"* | ✅ dürüst |
| **Sağlayıcı kimliği** (`httpAdaptoru`) | ✅ Evet — `YAPILANDIRMA_EKSIK` teknik hatası, *"Ayarlar › Entegrasyonlar ekranından tamamlayın"* yönlendirmesiyle. Dosya akışı da "gönderildi" değil `bilinmiyor` döner | ✅ dürüst |
| **K-027** antivirüs taraması | ❌ **Hayır — yalnız kod yorumu** | 🟡 D-06 |

### D-06 — Antivirüs sessizce yutuluyor 🟡

```
$ grep -rn "antivir\|virüs" app/
app/cekirdek/coklu-parca.mjs:111: * "Antivirüs, MIME doğrulama ve sürümleme uygulanır" (§8) — MIME doğrulaması budur;
app/cekirdek/coklu-parca.mjs:112: * antivirüs entegrasyonu Faz 5 entegrasyon katmanında adaptör olarak bağlanır.
```

Kod içi yorum dışında hiçbir yerde geçmiyor. Dosya yükleyen kullanıcı, MIME
imza doğrulamasının yapıldığını ama virüs taramasının yapılmadığını göremiyor.
Sahte başarı değil ama **eksik beyan**. RPT-14'ün yaptığı gibi yükleme
ekranlarına tek satırlık bir bilgi şeridi eklenmesi önerilir.

---

## 6. Sarı bulgular

### D-04 — İkinci gezinme şeması: `?sekme=` 🟡

```
$ node d7-detay.mjs
### proje detay /projeler/prj_… → 200
/projeler/prj_…/duzenle
/projeler/prj_…?sekme=ozet      /projeler/prj_…?sekme=santiyeler
/projeler/prj_…?sekme=program   /projeler/prj_…?sekme=riskler
/projeler/prj_…?sekme=gecmis
```

Manifest `PRJ-08 /projeler/:id/riskler` ve `PRJ-10 /projeler/:id/gecmis`
tanımlıyor; sayfa bunun yerine `?sekme=riskler` ve `?sekme=gecmis` kullanıyor.
Manifest rotaları çalışıyor (200) ama **hiçbir yerden bağlanmıyor** — aynı
ekran için iki URL. Değişmez kural 1 ile gerilimde. Aynı durum
`/is-programlari/:id?sekme=wbs` ↔ `PLAN-04 /is-programlari/:id/wbs` için de var.

Ayrıca proje detayından hiç bağlanmayan alt ekranlar: `PRJ-05 aktivasyon`,
`PRJ-06 organizasyon`, `PRJ-07 paydaslar`, `PRJ-09 kapanis`.

### D-05 — Üç raporda çıktı parametresi sessizce yutuluyor 🟡

```
$ node d11-rapor.mjs
{"rota":"/raporlar/maliyet",        "pdf":"200 2240b \"%PDF\"", "xlsx":"200 3489b \"PK\\u0003\\u0004\"", "csv":"200 644b \"ï»¿#\""}
{"rota":"/raporlar/nakit-akisi",    "pdf":"200 2377b \"%PDF\"", "xlsx":"200 3540b \"PK\\u0003\\u0004\"", "csv":"200 763b \"ï»¿#\""}
…11 rapor için aynı…
{"rota":"/raporlar/sozluk",         "pdf":"200 28868b \"<!DO\"", "xlsx":"200 28868b \"<!DO\"", "csv":"200 28868b \"<!DO\""}
{"rota":"/raporlar/isg",            "pdf":"200 13730b \"<!DO\"", "xlsx":"200 13730b \"<!DO\"", "csv":"200 13730b \"<!DO\""}
{"rota":"/raporlar/plan-gerceklesen","pdf":"200 7586b \"<!DO\"", "xlsx":"200 7586b \"<!DO\"", "csv":"200 7586b \"<!DO\""}
```

RPT-15 (formül sözlüğü), HSE-12 (İSG raporu) ve PLAN-11 (plan-gerçekleşen)
`?cikti=pdf` çağrısında **HTML döndürüyor**. Kural 9 "tüm raporlar tek
`ReportLayout`, PDF/Excel/CSV" diyor.

Hafifletici: bu üç ekranda **çıktı düğmesi yok**, yani kullanıcıya yerine
getirilmeyen bir vaat sunulmuyor:

```
$ node d12.mjs
/raporlar/sozluk          → çıktı linkleri: []  · buton metinleri: []
/raporlar/isg             → çıktı linkleri: []  · buton metinleri: []
/raporlar/plan-gerceklesen→ çıktı linkleri: []  · buton metinleri: []
/raporlar/maliyet         → çıktı linkleri: ["…?cikti=pdf","…?cikti=xlsx","…?cikti=csv"] · ["PDF","Excel","CSV"]
```

Yine de bilinmeyen bir `?cikti=` değerini sessizce yok saymak yerine ya
`ReportLayout`'a bağlanmalı ya da açıkça reddedilmeli.

### D-07 — Boş kurulumda çıkışsız formlar 🟡

`/kartlar/yeni` zorunlu `hesapId` seçicisinde tek seçenek var ("Seçin…"), çünkü
hiç sağlayıcı hesabı yok — ve hesabı açan ekran (CRD-09) D-01 nedeniyle
erişilemezdi. Benzer şekilde `/santiyeler/yeni` proje olmadan tamamlanamıyor.
D-01 düzeltmesi CRD-09'u açtı; kalan iş, boş durumda kullanıcıyı ön koşul
ekranına yönlendiren bir boş-durum metnidir.

---

## 7. Doğrulanmış sağlam alanlar

### Defter değişmezliği (kural 7)

```
$ node d10-defter.mjs
=== "bakiye" adlı SÜTUN taşıyan tablolar ===
(hiç yok)
 stok_hareketi:  VAR · tetikleyici: trg_stok_hareket_degismez_u, trg_stok_hareket_degismez_d
 kasa_hareketi:  VAR · tetikleyici: trg_kasa_hareket_u, trg_kasa_hareket_d
 banka_hareketi: VAR · tetikleyici: trg_banka_hareket_d, trg_banka_hareket_u
 cari_hareket:   VAR · tetikleyici: trg_cari_hareket_u, trg_cari_hareket_d
 kart_hareketi:  VAR · tetikleyici: trg_kart_hareket_degismez_u, trg_kart_hareket_degismez_d

$ node d10b.mjs      # gerçek hareket yazıp SQL ile değiştirmeyi dene
kasa hareketi: 303 · kasa_hareketi satır sayısı: 1
  UPDATE kasa_hareketi SET tutar_minor = 9999 → ENGELLENDİ ✅ Kasa hareketi değiştirilemez; düzeltme ters kayıtla yapılır.
  DELETE FROM kasa_hareketi                   → ENGELLENDİ ✅ Kasa hareketi silinemez; düzeltme ters kayıtla yapılır.
```

Hiçbir tabloda `bakiye` sütunu yok; ekran da bunu söylüyor: *"Toplam bakiye
defterden hesaplandı"*. Nakit kasa eksiye düşürülmek istendiğinde:

```
409 GECIS_IZINSIZ — "Kasa bakiyesi yetersiz: mevcut 0 minor, çıkış 150000 minor.
                     Nakit kasa eksiye düşemez."
```

### Rapor çıktıları (kural 9)

11 standart rapor gerçek ikili çıktı üretiyor: PDF `%PDF` imzalı, XLSX
`PK\x03\x04` (ZIP) imzalı, CSV BOM'lu. Ekranda künye (veri tarihi + rapor
sürümü) her raporda mevcut (`kunye: true`).

### Test tabanı

```
$ node --test
ℹ tests 390 · pass 390 · fail 0        ← denetim öncesi (DEVIR.md iddiası doğrulandı)
ℹ tests 398 · pass 398 · fail 0        ← denetim düzeltmeleri + 8 yeni test sonrası
```

---

## 8. Düzeltmeler ve regresyon kilidi

| Bulgu | Dosya | Test |
|---|---|---|
| D-01 | `app/web/kabuk.mjs` (K-114), `app/rotalar/saha.mjs` | `tests/kabul/denetim-01-gezinme.test.js` |
| D-02 | `app/rotalar/portal.mjs` | aynı dosya — "hiçbir iç bağlantı 4xx/5xx dönmez" |
| D-03 | `app/cekirdek/yapilandirma.mjs`, `app/rotalar/ayarlar.mjs`, `app/web/sayfalar/kimlik.mjs` (K-115) | `tests/kabul/denetim-01-sahte-basari.test.js` |

Testlerin gerçekten kilitlediği, düzeltmeler **geçici olarak geri alınıp**
kanıtlandı:

```
$ (menuOgesiMi ve /gunluk-raporlar eski haline alındı) && node --test tests/kabul/denetim-01.test.js
ℹ tests 8 · pass 5 · fail 3
✖ manifestteki her statik ekrana gezinerek ulaşılır (yetim ekran yok)
  actual: ['GLB-02 /panel/gunluk-ozet', …, 'CRD-16 /kartlar/onaylar', …]   (26 ekran)
✖ hiçbir iç bağlantı 4xx/5xx dönmez
  actual: ['404 /gunluk-raporlar  ←  /mobil']
✖ iç içe rotalı liste/rapor/onay ekranları menüde kalır
  actual: false, expected: true
```

Yeni testler:

1. `manifestteki her statik ekrana gezinerek ulaşılır` — kökten tam gezinti;
   `acik` ekranlar ve AUTH-06 hariç yetim ekran olamaz.
2. `hiçbir iç bağlantı 4xx/5xx dönmez` — ölü bağlantı kilidi.
3. `iç içe rotalı liste/rapor/onay ekranları menüde kalır` — CRD-13/14/16/10,
   QLT-02, HR-09, RPT-05, AST-09.
4. `kayıt açma yüzeyleri menüde görünmez` — PRJ-02, SITE-02, CRD-03, CRD-11,
   QLT-03, TASK-05 tekrar etmez.
5. `AUTH-02 gönderici yokken "gönderildi" DEMEZ` — hesap sızıntısı ifadesi korunur.
6. `SET-03 daveti bağlantıyı GÖSTERİR ve "gönderildi" demez`.
7. `üretimde davet "gönderildi" demez, bağlantıyı gösterir; sıfırlama tokeni
   sızmaz` — `GB_ORTAM=uretim` ile ayrı süreçte.
8. `epostaBagli` öntanımlı kapalı olma kilidi.

---

## 9. Kalan iş

| # | İş | Öncelik |
|---|---|---|
| D-04 | `?sekme=` şemasını manifest rotalarıyla birleştir; PRJ-05..10 sekmelerini detaydan bağla | orta |
| D-05 | RPT-15/HSE-12/PLAN-11'i `ReportLayout`'a bağla veya bilinmeyen `?cikti=` değerini açıkça reddet | orta |
| D-06 | Dosya yükleme ekranlarına antivirüs durumu bilgi şeridi (RPT-14 kalıbı) | düşük |
| D-07 | Ön koşulu eksik formlarda boş-durum yönlendirmesi | düşük |

Hiçbiri §12 üretime çıkış engeli değildir.
