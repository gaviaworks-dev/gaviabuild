# Denetim-02 — eşzamanlılık ve veri bütünlüğü

**Tarih:** 12 Ağustos 2026 · **Dal:** `denetim/02-esalanlilik` · **Taban:** `v1.0.0` (`40ffea8`)
**Kapsam:** yarış koşulları, ters kayıt/iptal, veri hacmi, sınır değerler.
**Kapsam dışı (bilinçli):** yük ve performans testi — ürünün gerçek ölçeği küçük.
**Yöntem:** kod okuması değil; gerçek sunucu, gerçek HTTP, `Promise.all` ile
gerçekten eşzamanlı istekler. Her iddianın altında onu üreten komut çıktısı var.
Sonuç her seferinde **defterden** doğrulandı (`SUM(yon × tutar)`), ekrandan değil.

---

## 0. Özet

| # | Bulgu | Ağırlık | Kapsam | Durum |
|---|---|---|---|---|
| D-08 | 2^53'ten büyük tutar **değişmez deftere yazılıyor**, sonra o defteri okuyan **her ekran kalıcı olarak 500** veriyor; ters kayıt da 500 — geri dönüş yok | 🔴 §12 | sınır değer | ✅ düzeltildi (K-120) |
| D-09 | Sağlayıcı API'si başarı dönünce parti "başarılı" oluyor ama **kart defterine tek satır yazılmıyor**; bakiye 0, sonuç dosyası yolu da kapanıyor | 🔴 §12 · kural 3, 7 | veri bütünlüğü | ✅ düzeltildi (K-123) |
| D-10 | `gunBaslangici()` **geçersiz tarihte 500**, imkânsız tarihte (`2026-13-45`) **sessizce kayıyor**; 111 çağrı yerinin tamamını etkiliyor | 🔴 §12 | sınır değer | ✅ düzeltildi (K-121) |
| D-11 | Kart yükleme partisi onaylanınca `/onaylar/:id` **500** veriyor (audit transaction dışında); karar kaydediliyor, kullanıcı hata görüyor | 🔴 §12 | veri bütünlüğü | ✅ düzeltildi (K-122) |
| D-12 | Aynı partiye eşzamanlı ikinci gönderim sağlayıcıya gitmiyor (idempotency tutuyor) ama **satırları "başarılı" iken partiyi "hatalı"ya düşürüyor** | 🟠 | yarış koşulu | ✅ düzeltildi (K-124) |
| D-13 | Gövde sınırı aşılınca keep-alive bağlantısı zehirleniyor; **sonraki istek `ECONNRESET`** | 🟡 | sınır değer | ⏳ açık |
| D-14 | Raporlarda satır sınırı yok: 10 bin satırda 7,5 MB HTML, RSS +340 MB. Dört çıktı **tutarlı** (kural 9 sağlam), sorun bellek | 🟡 | veri hacmi | ⏳ açık |
| D-15 | Serbest metin alanlarında uzunluk sınırı yok — 100.000 karakterlik açıklama deftere giriyor | 🟡 | sınır değer | ⏳ açık |
| D-16 | Finans hareketine **gelecek tarih** (2099) ve çok geçmiş tarih (1900) yazılabiliyor; dönem kilidi bu satırı görmüyor | 🟡 | sınır değer | ⏳ açık |

**Bağımsız olarak doğrulanmış, kırılmayan alanlar** (§1, §7, §8, §9): kasa/stok
negatife düşmüyor, aynı varlık iki kişide olmuyor, aynı onay adımına iki karar
geçmiyor, optimistic concurrency gerçekten yakalıyor, idempotency eşzamanlı üç
istekte de tek kayıt üretiyor, ters kayıt defteri sıfırlıyor ve iki kez
uygulanamıyor, liste sayfalaması/filtresi sağlam, 10 bin satırda
**ekran = PDF = Excel = CSV**, Unicode (Türkçe, emoji, ZWJ, 4 bayt) tam tur atıyor.

---

## 1. Yarış koşulları

Ölçüm ortamı: tek Node süreci, `node:sqlite` **senkron** sürücü. Bu mimaride bir
istek işleyicisi `await`'e gelene kadar olay döngüsünü bırakmaz; yani **yarış
penceresi tam olarak `await` noktalarıdır**. Uygulamadaki tüm `await` yüzeyi
15 satır:

```
$ grep -rn "await " app/rotalar/*.mjs app/moduller/**/*.mjs
app/rotalar/dokuman.mjs:107      await cokluParcaOku(ctx.istek)      ← multipart
app/rotalar/dokuman.mjs:216      await cokluParcaOku(ctx.istek)      ← multipart
app/rotalar/entegrasyon.mjs:113  await olayIslemi(...)               ← sağlayıcı çağrısı
app/rotalar/entegrasyon.mjs:553  await A.cagriYurut(...)             ← sağlayıcı çağrısı
app/rotalar/kartlar.mjs:274      await guvenlikIslemi(...)           ← sağlayıcı çağrısı
app/rotalar/kartlar.mjs:1107     await A.cagriYurut(...)             ← sağlayıcı çağrısı
app/rotalar/kartlar-ek.mjs:99    await cokluParcaOku(ctx.istek)      ← multipart
app/rotalar/kartlar-ek.mjs:105   await partiIslemi(...)              ← sağlayıcı çağrısı
app/rotalar/kartlar-ek.mjs:572   await YK.partiGonder(...)           ← sağlayıcı çağrısı
app/rotalar/kartlar-ek.mjs:587   await A.cagriYurut(...)             ← sağlayıcı çağrısı
app/moduller/kartlar/yukleme.mjs:375,385  await A.cagriYurut(...)
app/moduller/kartlar/adaptor.mjs:252,262,413  fetch / adaptör
```

Yani **finans, stok, zimmet ve onay akışlarında yarış penceresi yoktur**; bunlar
baştan sona tek transaction içinde senkron çalışır. Gerçek pencere yalnız
**dosya yükleme** ve **sağlayıcı çağrısı** yollarındadır. Aşağıdaki denemeler bu
tespiti kabul etmek yerine hepsini ayrı ayrı sınadı.

### 1.1 Aynı kasadan aynı anda iki çıkış — bakiye eksiye düşer mi?

Kasada 1.000,00 TL var; aynı anda iki kez 800,00 TL çıkış deneniyor.

```
$ node tests/gecici/d02-kasa.mjs
kasa csh_01KZVQK1MX00GV5S4HGW1P7287 CSH-2026-0001 aktif
tahsilat 200
bakiye (defterden): 100000
  istek#0 200 · Kasa hareketleri
  istek#1 409 · Kasa hareketleri
--- defter satırları ---
    tahsilat 1 100000 baslangic
    odeme -1 80000 es-zamanli-0
DEFTER BAKİYESİ: 20000   ✅ negatif değil
```

Bakiye kontrolü (`finans/defter.mjs:hareketYaz`) `islem()` içinde, yazma ile
**aynı senkron blokta**; ikinci çıkış 409 `GECIS_IZINSIZ` alıyor. **Sağlam.**

### 1.2 Aynı stok kaleminden aynı anda iki çıkış · aynı varlığa iki zimmet

Depoda 10 ton var; aynı anda iki kez 8 ton sarf ediliyor. Ardından tek bir
matkap aynı anda iki farklı personele zimmetleniyor.

```
$ node tests/gecici/d02-stok.mjs
başlangıç bakiyesi (binde): 10000
=== aynı stok kaleminden aynı anda 2 sarf (her biri 8 ton) ===
  istek#0 409 · Sarf ve iade
  istek#1 200 · Sarf ve iade
defter bakiyesi: 2000 ✅ negatif değil
hareketler: giris+10000(başlangıç) sarf-8000(es-1)

$ node tests/gecici/d02-zimmet-surum.mjs
=== aynı varlığa aynı anda 2 zimmet (iki farklı kişiye) ===
  istek#0 200 · Zimmet ve devir
  istek#1 409 · Zimmet ve devir
AÇIK ZİMMET: 1 ✅ tek kişide
```

**Sağlam.** İkisinde de "kontrol et → yaz" tek transaction içinde.

### 1.3 Aynı kayda aynı anda iki güncelleme — version çakışmayı yakalıyor mu?

İki istek de `surum=1` göndererek aynı personeli güncelliyor.

```
$ node tests/gecici/d02-zimmet-surum.mjs
=== aynı kayda aynı anda 2 güncelleme (aynı surum ile) ===
  başlangıç sürümü: 1 · görev: usta
  istek#0 200 · D02 Ali
  istek#1 409 · Personel düzenle
  son sürüm: 2 · görev: gorev-0 ✅ tek güncelleme geçti

=== sürüm alanı HİÇ gönderilmezse ===
  durum: 409 · Personel düzenle
  görev şimdi: { gorev: 'gorev-0', surum: 2 }
```

Kayıp güncelleme (lost update) yok; **sürüm alanı hiç gönderilmezse de kapalı
tarafa düşüyor** (409), sessizce ezmiyor. **Sağlam.**

### 1.4 Aynı onay adımına aynı anda iki karar

Üç deneme: (A) aynı kişi iki kez "onayla", (B) aynı anda **zıt** karar
(onayla + reddet, iki ayrı oturumdan), (C) kapanmış talebe sonradan karar.

```
$ node tests/gecici/d02-onay.mjs
=== A) aynı adıma aynı anda 2 ONAY (aynı kişi) ===
  istek#0 409 · istek#1 200
  karar satırı: [ 'onayla' ]
  talep: { durum: 'kapali', sonuc: 'onaylandi' }
  duyuru: { durum: 'yayinda' }

=== B) aynı adıma aynı anda ZIT karar (onayla + reddet) ===
  onayla 200 · reddet 409
  karar satırı: [ 'onayla' ]
  talep: { durum: 'kapali', sonuc: 'onaylandi' }
  duyuru: { durum: 'yayinda' }

=== C) kapanmış talebe karar ===
  durum: 409
```

Tek karar satırı, iş nesnesi ile talep tutarlı. **Sağlam.**

### 1.5 Aynı idempotency anahtarıyla aynı anda üç istek

```
$ node tests/gecici/d02-idem.mjs
=== aynı anda 3 istek, AYNI idempotency anahtarı ===
  istek#0 200 · /projeler/prj_01KZVQZF86MJ7Q91XBBNFPQPB1?olusan=1
  istek#1 200 · /projeler/prj_01KZVQZF86MJ7Q91XBBNFPQPB1?olusan=1
  istek#2 200 · /projeler/prj_01KZVQZF86MJ7Q91XBBNFPQPB1?olusan=1
AÇILAN PROJE SAYISI: 1 ✅
idempotency kaydı: [ { anahtar: 'D02-IDEM-PRJ', durum: 'tamam', http_durum: null } ]

=== sıralı tekrar (aynı anahtar, aynı gövde) ===
  tekrar: 200 · /projeler/prj_01KZVQZF86MJ7Q91XBBNFPQPB1?olusan=1
  proje sayısı: 1
=== aynı anahtar, FARKLI gövde ===
  farklı gövde: 409
```

Üç istek de **aynı** kaydın adresine dönüyor; ikinci bir kayıt açılmıyor;
anahtarın farklı gövdeyle yeniden kullanımı 409. **Sağlam.**

### 1.6 Aynı yükleme partisinin aynı anda iki kez gönderilmesi

Bu, gerçek `await` penceresi olan tek finansal akış. Denemede **gerçek bir
sağlayıcı** kuruldu: 300 ms gecikmeli yerel HTTP sunucusu, `httpAdaptoru`,
`entegrasyon.taban_url` ona bakıyor.

```
$ N=2 node tests/gecici/d02-parti.mjs
parti durumu: onay_bekliyor · satır: bekliyor,bekliyor
=== aynı partiye aynı anda N gönderim ===
gönderim sayısı: 2
  istek#0 200 · istek#1 200

SAĞLAYICIYA GİDEN ÇAĞRI SAYISI: 1                     ← ✅ çift çekim YOK
    /yukleme idem= d02-p1 {"hesap":"acc_…","donem":"2026-09","surum":1,"satirlar":[…]}
satır durumları: basarili, basarili
parti durumu: hatali                                   ← ❌ D-12
kart hareketi (defter) satırı: 0                       ← ❌ D-09
entegrasyon olayları: yuklemeGonder/basarili
```

Üç tur çalıştırıldı, üçünde de **birebir aynı** sonuç (rastgele değil,
belirlenimci):

```
$ for i in 1 2 3; do N=2 node tests/gecici/d02-parti.mjs; done
--- tur 1 --- SAĞLAYICIYA GİDEN ÇAĞRI SAYISI: 1 · satır: basarili, basarili · parti: hatali · defter: 0
--- tur 2 --- SAĞLAYICIYA GİDEN ÇAĞRI SAYISI: 1 · satır: basarili, basarili · parti: hatali · defter: 0
--- tur 3 --- SAĞLAYICIYA GİDEN ÇAĞRI SAYISI: 1 · satır: basarili, basarili · parti: hatali · defter: 0
```

**İyi haber:** sağlayıcıya ikinci çağrı gitmiyor. `entegrasyon_olayi` tablosundaki
`idempotency_anahtari` tekil kısıtı ikinci çağrıyı `mukerrer` olarak yakalıyor
(`adaptor.mjs:olayYaz`) ve bu kontrol `await`'ten **önce**, senkron blokta
yapılıyor. §6.4'ün "aynı olay iki kez muhasebeleşmez" şartı tutuyor.

**Kötü haber iki tane:** partinin durumu ile satırlarının durumu ayrışıyor
(**D-12**), ve tek gönderimde bile defter boş kalıyor (**D-09**).

### 1.7 Aynı sonuç dosyasının aynı anda iki kez yüklenmesi

Kontrollü dosya akışı (öntanımlı `dosya` adaptörü) — paranın karta girdiği yol.
Aynı sonuç dosyası aynı anda iki kez yükleniyor:

```
$ node tests/gecici/d02-dosya.mjs
gönderim sonrası parti: gonderiliyor · satır: gonderildi,gonderildi
=== sonuç dosyası AYNI ANDA 2 kez ===
  yanıtlar: 409, 303
  KART HAREKETİ SATIRI: 2 (beklenen 2) TEK KEZ
    KRT-2026-0001 bakiye: 100000
    KRT-2026-0002 bakiye: 100000
  parti: basarili
  satır: basarili/hareketli, basarili/hareketli
```

`sonucIsle()` her satırı transaction içinde **yeniden okuyup** `hareket_id`
doluysa atlıyor; mükerrer muhasebeleşme yok. **Sağlam** — ve D-09'un neden
yalnız API yolunda olduğunu gösteriyor: defteri yazan tek yer burası.

---

## 2. D-08 🔴 — 2^53 üstü tutar defteri kalıcı olarak kırıyor

`Para.ayristir()` üst sınır tanımıyor: `BigInt` her büyüklüğü kabul ediyor ve
değer `kasa_hareketi.tutar_minor` (SQLite `INTEGER`) sütununa yazılıyor.
`node:sqlite` bu sütunu okurken JS `Number`'a çeviriyor ve
`Number.MAX_SAFE_INTEGER`'ı aşan değerde **`RangeError` atıyor**.

Eşik tam olarak `9007199254740991` minor = **90.071.992.547.409,91 TL**:

```
$ node tests/gecici/d02-buyuk.mjs
Number.MAX_SAFE_INTEGER = 9007199254740991

MAX_SAFE (90.071.992.547.409,91 TL): form yanıtı = 200
  DB satırı okunabildi: 1 [ 9007199254740991 ]
  FIN-06 kasa hareketleri ekranı: 200
  FIN-05 kasalar listesi: 200
  RPT-06 nakit akışı raporu: 200

MAX_SAFE + 1 kuruş: form yanıtı = 500
  ❌ DB SATIRI OKUNAMIYOR: Value is too large to be represented as a JavaScript number: 9007199254740992
  gerçekte kaç satır: 1 · saklanan: integer:9007199254740992     ← SATIR YAZILDI
  FIN-06 kasa hareketleri ekranı: 500 ❌ ÇÖKTÜ
  FIN-05 kasalar listesi: 500 ❌ ÇÖKTÜ
  RPT-06 nakit akışı raporu: 500 ❌ ÇÖKTÜ
```

Satır **yazıldı** (form 500 dönse de), çünkü hata INSERT'te değil ondan sonraki
okumada oluşuyor. Ve defter değişmez olduğu için geri alınamıyor:

```
=== düzeltilebilir mi? (defter değişmez) ===
  UPDATE: Kasa hareketi değiştirilemez; düzeltme ters kayıtla yapılır.
  DELETE: Kasa hareketi silinemez; düzeltme ters kayıtla yapılır.
  ters kayıt denemesi: 500 Beklenmeyen bir hata oluştu
```

Ters kayıt da satırı **okumak zorunda** olduğu için 500 veriyor. Yani tek bir
form gönderimi, `FIN-06:olustur` yetkisi olan herhangi bir kullanıcı tarafından,
**finans modülünü kalıcı olarak ve uygulama içinden geri alınamaz biçimde**
devre dışı bırakabiliyor.

§12 iki maddeden ihlal ediliyor: *"finans bakiyesinin hareket defterinden yeniden
üretilememesi"* ve *"kritik işlemde hata/retry ekranının eksikliği"*.

Aynı açık her `_minor` sütununda var. `stok/defter.mjs`'in `miktarAyristir()`'ı
zaten `1_000_000_000_000` (1e12 < 2^53) ile sınırlı — **stok tarafı bu yüzden
etkilenmiyor**; sınırsız olan para tarafı.

```
$ node tests/gecici/d02-sinir.mjs   (kasa ÇIKIŞI tarafı — bakiye kontrolü koruyor)
  9223372036854775807 (2^63-1)   409  yazılan=0
  2^63 üstü (20 hane)            409  yazılan=0
  100 haneli                     409  yazılan=0
```

Çıkış tarafında bakiye yetersizliği tesadüfen koruyor; **giriş (tahsilat)
tarafında hiçbir koruma yok.**

---

## 3. D-09 🔴 — sağlayıcı "yükledim" diyor, kart defteri boş

`httpAdaptoru` 200 dönünce `yukleme.mjs:partiGonder()` yalnız satır durumlarını
`basarili` yapıyor; `kart_hareketi` defterine **hiçbir şey yazmıyor**.
`sonucIsle()` — paranın karta girdiği tek fonksiyon — bu yolda hiç çağrılmıyor.

Tek gönderim, hiç eşzamanlılık yok:

```
$ N=1 node tests/gecici/d02-parti.mjs
gönderim sayısı: 1
  istek#0 200

SAĞLAYICIYA GİDEN ÇAĞRI SAYISI: 1
satır durumları: basarili, basarili
parti durumu: basarili
kart hareketi (defter) satırı: 0

--- defter / bakiye ---
    KRT-2026-0001 bakiye: 0
    KRT-2026-0002 bakiye: 0
parti toplam_minor: 200000
satır hareket_id: [ null, null ]
kapanış engelleri: [ 'Dönem mutabakatı açılmamış.', 'Banka hareketi partiye eşleştirilmemiş.' ]
```

Parti "başarılı", tutar 2.000,00 TL, kartların bakiyesi **sıfır**. Bu, kural 3'ün
(sahte başarı bildirimi yok) ve kural 7'nin (kart bakiyesi defterden türer)
birlikte ihlalidir; §12'nin *"kart bakiyesinin hareket defterinden yeniden
üretilememesi"* maddesi.

**Ve kurtarma yolu da kapanıyor.** Operatör sonuç dosyası yükleyerek defteri
yazdırabilirdi, ama parti artık `basarili` durumunda:

```
app/rotalar/kartlar-ek.mjs:690
  if (!['gonderiliyor', 'kismi', 'onay_bekliyor'].includes(parti.durum)) {
    throw GecisIzinsiz(`Parti "${parti.durum}" durumunda; sonuç dosyası yalnız gönderilmiş partiye işlenir.`);
```

`_eylem: 'tekrar'` de reddediyor (teknik hatalı satır yok). Uygulama içinde
defteri yazdıracak **hiçbir yol kalmıyor**.

Karşılaştırma — aynı senaryo dosya adaptörüyle (§1.7): defter **yazılıyor**,
bakiye 100000. Fark kod yolunda, veride değil.

DEVIR.md §7 `httpAdaptoru`'nu "kod hazır, yapılandırma işi" olarak listeliyordu;
kimlik bilgisi tanımlandığı an bu bulgu üretimde canlıya çıkardı.

---

## 4. D-10 🔴 — tarih ayrıştırıcı: geçersizde 500, imkânsızda sessiz kayma

`cekirdek/zaman.mjs:gunBaslangici()` girdiyi doğrulamıyor:

```
$ node -e "…gunBaslangici(…)…"
"2026-13-45"   1802552400000  →  2027-02-13T21:00:00.000Z     ← sessizce kaydı
"2026-02-31"   1772485200000  →  2026-03-02T21:00:00.000Z     ← sessizce kaydı
"2026-00-00"   1764450000000  →  2025-11-29T21:00:00.000Z     ← sessizce kaydı
"abc"          HATA: RangeError Invalid time value            ← 500
""             HATA: RangeError Invalid time value            ← 500
"2026-8-1"     1785531600000  →  2026-07-31T21:00:00.000Z
"2026-12-31"   1798664400000  →  2026-12-30T21:00:00.000Z
```

Uçtan uca, kasa hareketi formundan:

```
$ node tests/gecici/d02-sinir.mjs
=== TARİH sınırları ===
  gelecek tarih 2099-12-31       200  yazılan=1
  geçmiş tarih 1900-01-01        200  yazılan=1
  geçersiz tarih 2026-13-45      200  yazılan=1      ← 2027-02-14 olarak deftere girdi
  tarih=abc                      500  yazılan=0      ← SUNUCU_HATASI
[req_344e75e7…] SUNUCU_HATASI Invalid time value RangeError: Invalid time value
```

`RangeError` bir `UygulamaHatasi` olmadığı için 422 değil **500** üretiyor —
kullanıcı gerçek hata kodunu görmüyor, sunucu günlüğüne yığın izi düşüyor.
İmkânsız tarih ise hiç uyarı vermeden **başka bir güne** yazılıyor: bir kasa
hareketi, bir puantaj günü veya bir hakediş dönemi sessizce kayıyor.

Yüzey dar değil:

```
$ grep -rn "gunBaslangici(" app/ | wc -l
111
```

---

## 5. D-11 🔴 — kart yükleme onayı 500 veriyor

`kartlar-ek.mjs:kartOnaySonucu()` onay `onaylandi` ile kapandığında `audit.yaz()`
çağırıyor ama **`islem()` sarmalayıcısı yok**:

```
$ node tests/gecici/d02-parti.mjs
[req_0d5f6c0f-…] SUNUCU_HATASI Denetim kaydı transaction dışında yazılamaz.
Error: Denetim kaydı transaction dışında yazılamaz.
    at Module.yaz (app/cekirdek/audit.mjs:29:31)
    at kartOnaySonucu (app/rotalar/kartlar-ek.mjs:754:13)
    at isNesnesiniIlerlet (app/rotalar/isakisi.mjs:428:5)
    at post (app/rotalar/isakisi.mjs:113:45)
parti onayı: onay_bekliyor
```

`audit.mjs:29` bunu bilerek zorluyor (*"iş kaydı yazılıp audit yazılmadan commit
olursa denetim izi delinir"*) — koruma doğru, çağıran yanlış.

Sonuç dizisi: `onayMotoru.kararVer()` kendi `islem()`'i içinde karar satırını
**commit ediyor**, sonra `isNesnesiniIlerlet()` çöküyor. Yani:

* onay **gerçekten kaydediliyor** (talep kapalı, sonuç `onaylandi`),
* kullanıcı **"Beklenmeyen bir hata oluştu"** görüyor,
* partinin `kartYuklemePartisi / onaylandi` denetim kaydı **hiç yazılmıyor**,
* onaycı tekrar denerse *"Bu adımda zaten karar verdiniz"* (409) alıyor —
  başarılı bir işlem, kullanıcıya kalıcı olarak hata gibi görünüyor.

Mevcut testler bunu yakalamadı çünkü `tests/kabul/faz5.test.js`'in `onayla()`
yardımcısı **HTTP durum kodunu hiç kontrol etmiyor**, yalnız sonuçtaki tabloya
bakıyor; tablo doğru olduğu için test yeşil kalıyor.

---

## 6. D-12 🟠 — eşzamanlı ikinci gönderim partiyi "hatalı"ya düşürüyor

§1.6'daki çıktının okunuşu: ikinci gönderim `cagriYurut`'tan
`reddedildi('MUKERRER_OLAY')` alıyor. `partiGonder` bunu **sağlayıcının iş
kuralı reddi** sanıp tüm satırları `reddedildi` yapıyor; `sonucuUygula` da
partiyi `hatali`ya çekiyor. Sonra birinci gönderim gerçek yanıtla dönüp satırları
`basarili` yapıyor — ama parti artık `gonderiliyor` durumunda olmadığı için
`sonucuUygula` çıkışta hiçbir şey yapmıyor (`kartlar-ek.mjs:733`).

Kalan durum: **satırların hepsi `basarili`, parti `hatali`.** Ekran ile veri
ayrışıyor; parti bu haliyle ne kapatılabiliyor ne tekrar edilebiliyor.

Bu bir çift çekim değil (para tek kez gitti) ama defter ile ekranın ayrışmasıdır;
mükerrer olay reddi, sağlayıcı reddiyle **aynı sınıfa** konulmamalı.

---

## 7. Ters kayıt ve iptal

```
$ node tests/gecici/d02-ters.mjs
hareket: tahsilat 50000 · bakiye: 50000

=== ters kayıt ===
  durum: 200 · bakiye: 0 ✅ sıfırlandı
  satır sayısı: 2 (silme yok)

=== aynı harekete AYNI ANDA 2 ters kayıt ===
  istek#0 200 · istek#1 409
  TERS KAYIT SAYISI: 1 ✅ tek
  bakiye: 0 (beklenen 0)

=== sıralı ikinci ters kayıt (aynı harekete) ===
  durum: 409
=== ters kaydın kendisi ters çevrilebilir mi? ===
  durum: 409
=== gerekçesiz ters kayıt ===
  durum: 422

DEFTER TOPLAMI: 0
tüm satırlar: tahsilat+50000 duzeltme-50000→ters tahsilat+30000 duzeltme-30000→ters
```

Defter toplamı **tam sıfır**; satır silinmiyor, ikinci iptal 409, ters kaydın
ters kaydı 409, gerekçesiz iptal 422. **Sağlam** — kural 7 tutuyor.

---

## 8. Veri hacmi — 10 bin satır

### 8.1 Liste (HR-01 `/personel`)

```
$ SATIR=10000 node tests/gecici/d02-hacim.mjs
10000 personel yazıldı · 96 ms · toplam: 10001
RSS başlangıç: 208 MB

=== LİSTE (HR-01 /personel) ===
  sayfa 1                            200       7 ms      27 KB  <tr>×26  RSS 208MB
  sayfa 200                          200       9 ms      27 KB  <tr>×26  RSS 210MB
  sayfa 100000 (aralık dışı)         200      12 ms       9 KB  <tr>×0   RSS 212MB
  boyut=100                          200       6 ms      79 KB  <tr>×101 RSS 214MB
  boyut=99999 (beyaz liste dışı)     200       5 ms      27 KB  <tr>×26  RSS 214MB
  filtre durum=aktif                 200       5 ms      27 KB  <tr>×26  RSS 216MB
  arama q=Öztürk                     200       6 ms      27 KB  <tr>×26  RSS 216MB
  arama q=%25 (joker)                200       6 ms      27 KB  <tr>×26  RSS 216MB
  sıralama sirala=ad_soyad           200       5 ms      27 KB  <tr>×26  RSS 216MB
  SQL denemesi sirala=1;DROP         200       4 ms      27 KB  <tr>×26  RSS 216MB
personel tablosu hâlâ var mı: 10001 satır
```

Sayfalama `LIMIT/OFFSET`, sayfa boyutu **beyaz listeli** (25/50/100 — `99999`
sessizce 25'e düşüyor), aralık dışı sayfa boş tablo, `q=%` joker olarak
yorumlanmıyor, `?sirala=` **hiç okunmuyor** — enjeksiyon yüzeyi yok. Bellek düz.

Not: `B.tablo()` sıralanabilir sütun desteği taşıyor ama
`grep -rn "siralanabilir" app/rotalar/` **hiç sonuç vermiyor** — yani hiçbir
listede kullanıcıya açık sütun sıralaması yok, sıra kodda sabit. Bulgu değil,
kayda geçiyor.

### 8.2 Rapor (RPT-09 `/raporlar/personel`) — D-14 🟡

```
=== RAPOR (RPT-09 /raporlar/personel) ===
  ekran      200    1077 ms     7534 KB  imza="<!DO"  RSS 473MB
  PDF        200    1128 ms      694 KB  imza="%PDF"  RSS 550MB
  Excel      200    1162 ms      292 KB  imza="PK"    RSS 552MB
  CSV        200    1024 ms      579 KB  imza="# Ra"  RSS 546MB
RSS bitiş: 546 MB (başlangıç 208 MB)
```

**Tüm satırları belleğe toplayan yer var:** `moduller/rapor/tanimlar.mjs`
içindeki 49 `SELECT`'in yalnız 6'sında `LIMIT` var. RPT-09'un `veri()`
fonksiyonu tüm personeli `LIMIT`siz çekip **satır başına 4 alt sorgu**
çalıştırıyor (10 bin satır = 40.001 sorgu), sonra tüm diziyi `satirlar` olarak
tutuyor; dört çıktı da aynı diziden serileşiyor. Rapor için satır tavanı,
sayfalama veya "sonuç çok büyük" uyarısı **yok**.

Ölçek küçük olduğu için bu bir üretim engeli değil; ama sınırsızlık kayda geçmeli.

### 8.3 Ekran = PDF = Excel = CSV mi? (kural 9)

En kritik hacim sorusu: büyük veride çıktılar sessizce kırpılıyor mu?

```
$ SATIR=10000 node tests/gecici/d02-rapor-esitlik.mjs
personel satırı: 10001

format        durum  bayt        PER-D02 kodu sayısı
ekran (HTML)   200    7771956      10000
PDF            200     734611      10000
Excel (XLSX)   200     310971      10000
CSV            200     549488      10000

beklenen (tenant personeli): 10001
✅ dört çıktı da AYNI satır sayısı
ekran künyesi: 10001 kayıt
CSV künyesi: # Kayıt sayısı;10001
```

PDF, Flate akışları açılıp gerçek metni sayılarak doğrulandı; XLSX, ZIP
merkezinden `sheet1.xml`/`sharedStrings.xml` çıkarılıp sayıldı. **10 bin satırda
bile sessiz kırpma yok, künye doğru.** Kural 9 ve §12'nin çıktı maddesi sağlam.

---

## 9. Sınır değerler

### 9.1 Tutar

```
$ node tests/gecici/d02-sinir.mjs
=== TUTAR sınırları (kasa çıkışı) ===
  0                              422  yazılan=0
  0,00                           422  yazılan=0
  -500                           422  yazılan=0
  -0,01                          422  yazılan=0
  boş                            422  yazılan=0
  abc                            422  yazılan=0
  1e5 (bilimsel)                 422  yazılan=0
  0,004 (yuvarlama)              422  yazılan=0     ← 0 kuruşa yuvarlanıp reddedildi
  0,005 (yuvarlama)              200  yazılan=1     ← 1 kuruş (yarı-yukarı, K-004)
  9223372036854775807 (2^63-1)   409  yazılan=0
  2^63 üstü (20 hane)            409  yazılan=0
  100 haneli                     409  yazılan=0
  Infinity                       422  yazılan=0
  NaN                            422  yazılan=0

bakiye (defterden): 99999999
tutar_minor tipleri: integer:100000000 · integer:1
```

Sıfır, negatif ve sayı olmayan girdi **kapalı**. Yuvarlama K-004'e uygun.
Çok büyük değerin **çıkış** tarafında reddedilmesi bakiye kontrolünün yan
etkisi; **giriş** tarafındaki açık D-08'dir.

### 9.2 Miktar (stok)

```
=== SIFIR/NEGATİF MİKTAR (stok) ===
  miktar="0"                       422
  miktar="-5"                      422
  miktar="0,0004"                  422
  miktar="999999999999999"         422    ← miktarAyristir üst sınırı çalışıyor
  miktar="abc"                     422
  miktar=""                        422
```

**Sağlam** — para tarafında olmayan üst sınır burada var.

### 9.3 Uzun metin — D-15 🟡 · gövde sınırı — D-13 🟡

```
=== ÇOK UZUN METİN ===
  açıklama 100k karakter         200  yazılan=1
  açıklama 3 MB (gövde sınırı)   422  yazılan=0
  son kaydın açıklama uzunluğu: 100000
```

100.000 karakterlik açıklama **değişmez deftere** giriyor (D-15): alan bazlı
uzunluk sınırı yok, oradan rapora ve PDF'e taşınıyor. 2 MB gövde sınırı çalışıyor
ama bağlantıyı bozuyor:

```
$ node tests/gecici/d02-govde.mjs
=== normal istek ===
  /kasalar: 200
=== 3 MB gövde (sınır 2 MB) ===
  yanıt: 422 İşlem tamamlanamadı
  sonraki istek: 200
  bir sonraki istek: ISTEK COKTU — ECONNRESET      ← D-13
=== 2 MB tam sınır ===
  yanıt: 422 · sonraki istek: 200
```

`govdeOku()` sınırı aşınca istek gövdesini **tüketmeden** hata atıyor; yanıt
gidiyor ama soket yarım kalmış gövdeyle kalıyor ve aynı keep-alive bağlantısında
bir sonraki istek `ECONNRESET` alıyor. Kullanıcı için: "çok büyük dosya"
uyarısından sonra bir sonraki tıklama nedensiz kopuyor.

### 9.4 Tarih — D-16 🟡

`gunBaslangici` bulgusu D-10'da. Ayrıca finans hareketine **gelecek tarih**
(2099-12-31) ve çok geçmiş tarih (1900-01-01) yazılabiliyor (§4 çıktısı).
Dönem kilidi (`donemKapaliMi`) hareketin `zaman` alanına baktığı için, gelecek
tarihli bir satır bugün kapatılan dönemin dışında kalıyor ve kapanış
kontrolünden kaçıyor. Politika kararı gerektirdiği için sarı bırakıldı.

### 9.5 Türkçe karakter ve emoji

```
$ node tests/gecici/d02-emoji.mjs
  sade turkce        200  saklanan="Sukru Cagri Ozturk" AYNI
  TR harfleri        200  saklanan="İĞÜŞÖÇ ığüşöç" AYNI
  emoji              200  saklanan="Ali 🏗️" AYNI
  ZWJ emoji          200  saklanan="Ayse 👷‍♀️" AYNI
  bayrak             200  saklanan="Veli 🇹🇷" AYNI
  arapca ligatur     200  saklanan="X ﷽" AYNI
  gotik              200  saklanan="Y 𝕶" AYNI
  4 bayt CJK         200  saklanan="Z 𠜎" AYNI
  RTL override       200  saklanan="A<U+202E>ters" AYNI
  NUL karakter       200  saklanan="B<NUL>C" AYNI
```

Onunun onu da **birebir** geri geldi: 4 bayt karakterler, ZWJ dizileri, bölgesel
gösterge çiftleri ve gömülü NUL dahil. Türkçe arama da çalışıyor
(`/personel?q=Şükrü` → 200, sonuç var). PDF'te Türkçe glifler K-103 ile zaten
çözülmüştü; emoji taban 14 fontta yok ve PDF'e düşerken düşürülüyor ama **çıktı
üretimi kırılmıyor** (§8.3'te dört çıktı da 200 ve eşit satırlı).

---

## 10. Kapanış

Denetim-01 gezinme, yetki ve dürüstlük eksenlerini sınamıştı. Denetim-02
eşzamanlılık ve veri bütünlüğü eksenini sınadı ve **dört kırmızı** buldu.
Üçü (D-08, D-10, D-11) tek bir isteğin ürünü; biri (D-09) bilinçli açık uç
sanılan `httpAdaptoru`'nun canlıya alındığı an devreye girecekti.

Dört kırmızının dördü ve turuncu bu turda kapatıldı (§11).

Eşzamanlılığın kendisi — kasa, stok, zimmet, onay, sürüm, idempotency, ters
kayıt — **hiçbir denemede kırılmadı**. Mimarinin "her yazma tek transaction
içinde senkron" seçimi (K-003 + `islem()`) yarış yüzeyini yapısal olarak 15
`await` satırına indirmiş; kırmızıların hiçbiri de yarış koşulu değil, **girdi
doğrulama ve kod yolu** hatası.

---

## 11. Düzeltmeler ve regresyon kilidi

Dört kırmızının dördü ve turuncu kapatıldı. Her biri **ayrı commit**, her biri
regresyon testine bağlı; testlerin gerçekten kilitlediği, düzeltmeler **geçici
geri alınarak** kanıtlandı.

| # | Karar | Ne yapıldı | Test dosyası | Geri alınca kırılan |
|---|---|---|---|---|
| D-08 | K-120 | `AZAMI_MINOR` + `minorSinirZorunlu()`; sınır hem `Para.ayristir`'da hem kasa/banka/cari, kart ve stok defterlerinin `hareketYaz()` girişinde zorlanıyor | `denetim-02-tutar-siniri.test.js` (5) | 4 |
| D-10 | K-121 | `gunGecerliMi()`: biçim + aralık + `Date.UTC` turu; geçersiz gün 422 | `denetim-02-tarih.test.js` (4) | 2 |
| D-11 | K-122 | Onay kararı ve iş nesnesinin ilerlemesi tek `islem()` içinde | `denetim-02-onay-koprusu.test.js` (3) | 1 |
| D-09 | K-123 | Sonuçlanan gönderim tek kanonik yoldan (`sonucIsle`) geçiyor; defteri o yazıyor | `denetim-02-kart-defteri.test.js` (4) | 1 |
| D-12 | K-124 | `MUKERRER_OLAY` sağlayıcı reddi sayılmıyor; ikinci çağrı satırlara dokunmuyor | aynı dosya | 1 |

```
$ node --test
ℹ tests 444 · pass 444 · fail 0        ← denetim öncesi 428, +16 yeni test
```

### D-08 — sonra

```
$ node tests/gecici/d02-buyuk.mjs
MAX_SAFE (90.071.992.547.409,91 TL): form yanıtı = 200
  gerçekte kaç satır: 1 · saklanan: integer:9007199254740991
  FIN-06 200 · FIN-05 200 · RPT-06 200

MAX_SAFE + 1 kuruş: form yanıtı = 422              ← 500 değil, 422
  gerçekte kaç satır: 0 · saklanan: null           ← deftere HİÇ girmedi
  FIN-06 200 · FIN-05 200 · RPT-06 200             ← hiçbir ekran çökmedi
  ters kayıt denemesi: 200                         ← düzeltme yolu açık
```

Sınır **okuma** tarafında değil **yazma** tarafında zorlanıyor: defterin her
zaman yeniden üretilebilir kalması yapısal garanti haline geliyor.

### D-09 / D-12 — sonra

```
$ N=2 node tests/gecici/d02-parti.mjs      (aynı partiye aynı anda 2 gönderim)
SAĞLAYICIYA GİDEN ÇAĞRI SAYISI: 1
satır durumları: basarili, basarili
parti durumu: basarili                              ← D-12: satırlarla tutarlı
kart hareketi (defter) satırı: 2                    ← D-09: defter yazıldı
    KRT-2026-0001 bakiye: 100000
    KRT-2026-0002 bakiye: 100000
satır hareket_id: [ 'mov_01KZ…', 'mov_01KZ…' ]
```

Kontrollü dosya akışı (§1.7) etkilenmedi — hâlâ tek kez muhasebeleşiyor ve
bakiyeleri doğru yazıyor.

### D-10 — sonra

```
$ node tests/gecici/d02-sinir.mjs
=== TARİH sınırları ===
  gelecek tarih 2099-12-31       200  yazılan=1     ← D-16, bilinçli açık
  geçmiş tarih 1900-01-01        200  yazılan=1     ← D-16, bilinçli açık
  geçersiz tarih 2026-13-45      422  yazılan=0     ← sessiz kayma bitti
  tarih=abc                      422  yazılan=0     ← 500 değil 422
```

### D-11 — sonra

`/onaylar/:id` artık 500 vermiyor; onay kararı ile iş nesnesinin ilerlemesi tek
transaction. Bulgu tek bir köprüde değildi: `kartOnaySonucu`,
`projeKapanisOnaySonucu` ve `santiyeKapanisOnaySonucu` üçü de aynı hatayı
taşıyordu, bu yüzden sarmalama 12 köprüye dağıtılmak yerine tek çağrı yerine
kondu — yeni bir köprü de yapısal olarak güvenli.

### Açık bırakılanlar (sarı — bu turun kapsamı dışı)

| # | Neden açık | Önerilen kapanış |
|---|---|---|
| D-13 | `govdeOku()` sınırı aşınca gövdeyi tüketmeden hata atıyor | Hatadan önce akışı boşalt (`istek.resume()`) veya bağlantıyı açıkça kapat |
| D-14 | Rapor tanımlarında satır tavanı yok | `ReportLayout`'a küresel tavan + aşıldığında künyede "sonuç kırpıldı" beyanı (sessiz kırpma değil) |
| D-15 | Serbest metin alanlarında uzunluk sınırı yok | `B.alan()` düzeyinde `enFazla` öntanımı; deftere giren açıklamalar için sıkı sınır |
| D-16 | Gelecek/çok geçmiş tarihli finans hareketi kabul ediliyor | Politika kararı: hareket tarihi için ileri tarih yasağı ve geriye dönük pencere |

Dördü de §12 engeli değil; D-14 ve D-16 politika kararı gerektiriyor.
