# Gavia CRM (İnşaat) — Revizyon Talimatları

**Kaynak:** `insaat-crm.mp4` — 16 dk 16 sn ekran kaydı + sesli anlatım (Yasin Bey)
**Uygulama:** `gaviaworks-dev.github.io/gaviacrm/v2/` (statik HTML sayfa seti)
**Çıkarım tarihi:** 4 Ağustos 2026

---

## 0. Bu dosya nasıl kullanılır

Bu dosya Claude Code'a doğrudan verilmek üzere hazırlandı. Her maddede:

- `[MM:SS]` = videodaki geçtiği an
- `> alıntı` = konuşmanın birebir (ASR ile deşifre edilmiş) hali
- **Yapılacak:** = uygulanacak somut değişiklik
- `📷 dosya.jpg` = `ekran-goruntuleri/` klasöründeki ilgili ekran görüntüsü

**Önerilen çalışma sırası:** Önce **Bölüm 1 (Global Kurallar)** — bunlar tüm sayfalara uygulanan tekrarlı kurallar ve iş yükünün ~%70'i. Sonra **Bölüm 2**'deki ekran özel maddeler. En son **Bölüm 3**'teki yeni geliştirmeler.

### Terim sözlüğü (konuşmadaki kullanım)

| Konuşmadaki söz | Kastedilen |
|---|---|
| "sayfalandırma" | Sayfa / sayfa yapısı / ekran (pagination DEĞİL) |
| "çıktı al" / "çift dağ" / "çıplak" | **Çıktı Al** butonu (ASR hatası) |
| "Pelux / Pelox kartlar" | **Pluxee Kartlar** |
| "hak ediş / akadış / geliş" | **Hakediş** |
| "gelişmiş bitki / fikir" | **Gelişmiş Filtre** |
| "paraşüt" | **Parasüt** (parasut.com) |
| "vantaj" | **Puantaj** |

---

## 1. GLOBAL KURALLAR — tüm sayfalara uygulanacak

Bu bölümdeki 9 kural sistemdeki **her liste sayfasında** geçerlidir. Videoda tek tek her ekranda tekrar edilmiştir.

### G-1 — "Çıktı Al" butonu kaldırılacak, "Dışa Aktar" içine taşınacak

`[01:51]`
> "Çıktı al diye bir alan oluşturmayalım. Burası dışarı aktar diye bir içeriğimiz olacak."

`[03:29]`
> "Çıktı al diye bir seçeneği iptal ediyoruz. Dışarı aktar seçeneği olacak ve dışarı aktar seçeneğinde yazdır seçeneğinden bu işlemi yapacağız."

`[04:34]`
> "Dışarı aktar ve çıktı al iki tane ayrı seçenek şeklinde oluşturulmuş. Bu sadece dışarı aktar olacak. Çıktı al seçeneği dışarı aktarın içerisinde yazdır kısmında oluşturulacak."

**Yapılacak:**
- Sistemdeki **tüm** `Çıktı Al` butonları kaldırılacak.
- Tek bir `Dışa Aktar` butonu kalacak.
- `Dışa Aktar` modalinin içinde format seçenekleri: **PDF / Excel / Yazdır**. Eski "Çıktı Al" işlevi buradaki **Yazdır** seçeneğidir.
- İki ayrı buton hiçbir sayfada bulunmayacak.

📷 `07_isg-tutanaklari-ciktial_02-00.jpg` · `17_puantaj-disa-aktar-modal_04-40.jpg`

---

### G-2 — "Dışa Aktar" butonunun konumu: her zaman "Yeni ..." butonunun yanında

`[01:51]`
> "...ve yeni ekleme butonunun yanında olacak."

`[00:43]`
> "...yeni şantiye dediğimiz kısmın yanında dışarı aktar kısmı olacak"

`[02:13]`
> "Bu iş takibi kısmındaki dışarı aktar[lar] yeni görev kısmında gözükecek. Personel tarafında, personel listesindeki dışarı aktar[,] yeni personel kısmının yan tarafına aktarılacak."

**Yapılacak:**
- `Dışa Aktar`, sayfanın **sağ üstündeki birincil ekleme butonunun** (`Yeni Şantiye`, `Yeni Görev`, `Yeni Personel`, `Yeni Evrak`, `Yeni Tutanak`, `Yeni Cari`, `Yeni Araç`, `Yeni Demirbaş`, `Yeni Kart` vb.) **hemen yanında** konumlanacak.
- Liste tablosunun üstünde/altında ayrıca duran `Dışa Aktar` / `Çıktı Al` butonları oradan kaldırılacak.
- Sayfanın **ekleme butonu olmayan** yerlerinde bile (örn. Özlük & Evrak) `Dışa Aktar` **aynı hizada** duracak — `[03:04]`: *"Buradaki dışarı aktarda yeni bir özlük evrak yapısı yok. Lakin yeni evrak yapısı var gibi aynı hizada duracak şekilde işlem yapılması lazım."*

📷 `02_santiye-listesi_00-40.jpg` · `08_gorevler-havuz_02-10.jpg` · `09_personel-listesi_02-20.jpg`

---

### G-3 — Liste üstündeki filtre/çip satırları asla ikinci satıra taşmayacak → slider

`[01:03]`
> "Tek satırda gözükeceğinden dolayı toplam şantiye, aktif şantiyenin en sonunda olacak şekilde slider şeklinde gözükebilir. **Liste sayfalandırmalarında hiçbir şekilde ikinci bir satıra geçmesin.** Bu tarz satırlardaki içerikler gelişmiş filtre içerisinde oluşsun."

`[05:42]`
> "Banka hesapları birden fazla oluşabilir. O bakımdan buradan ikinci satırdan sonra ekstra satır koymadan slider şeklinde adım atalım."

`[06:09]`
> "Kredi kartlarındaki mantıkta da aynı şekilde slider şeklinde hamle yapabiliriz."

**Yapılacak:**
- Üstteki özet kartlar (KPI kartları), durum çipleri ve filtre butonları **tek satırda** kalacak.
- Sığmayan içerik **yatay slider / carousel** ile kaydırılacak — asla alt satıra sarmayacak (`flex-wrap: nowrap` + yatay scroll/slider).
- Bu kural özellikle: Şantiye Listesi özet kartları, Banka Hesapları kart şeridi, Kredi Kartları kart şeridi, tüm filtre çip satırları için geçerli.

📷 `04_santiye-listesi-filtre-satirlari_01-20.jpg` (3 satıra taşan çip satırları) · `22_banka-hesaplari_06-00.jpg` · `23_kredi-kartlari_06-10.jpg`

---

### G-4 — Fazla filtreler "Gelişmiş Filtre" panelinin içine alınacak

`[01:27]`
> "Sistemde burada varsa ekstra olarak burada göstermeye gerek yok. İSG tutanaklarında olduğu gibi tür, şantiye — bunların tamamı gelişmiş filtrenin içerisinde olsun. Varsa buradan kaldırabiliriz."

`[06:59]`
> "Hareketler bölümündeki liste yapısında tarih aralığı, şantiye, tür gibi birden fazla içerik var. Bunları daha minimize etmemiz lazım. Yani şantiye, tür dediğimiz yapıyı gelişmiş filtrenin içerisine alabiliriz."

`[09:36]` (demirbaş) / `[09:56]` (araç durum) — aynı kural.

**Yapılacak:**
- Liste üstünde **yalnızca** arama kutusu + en kritik 1-2 durum çipi kalacak.
- `Tür`, `Şantiye`, `Tarih Aralığı`, `Durum`, `Kategori`, `Firma` gibi tüm ikincil filtreler **Gelişmiş Filtre** panelinin içine taşınacak.
- Aynı filtre hem üstte hem gelişmiş filtrede **çift** durmayacak.

📷 `06_isg-gelismis-filtre_01-40.jpg` (referans panel) · `04_santiye-listesi-filtre-satirlari_01-20.jpg` (üstte duran fazla çipler) · `26_pluxee-hareketler-filtreler_07-00.jpg`

---

### G-5 — Tipografi ve metin büyük/küçük harf standardı

`[02:39]`
> "...başlığı ve kategorilerin tamamı kalın bir puntoyla, ayrıca yukarıya geçildiğinde kayma kısımları oluşmayacak şekilde bir düzeltme yapılması lazım."

`[03:04]`
> "SGK, İSG ya da KVKK gibi içerikler dışında **tüm yazı alanlarında baş harfi büyük, diğerleri küçük** şekilde oluşturulması gerek."

**Yapılacak:**
- Tablo başlıkları ve kategori başlıkları **kalın (bold)** olacak.
- Sayfa yukarı kaydırıldığında başlıklarda **kayma / hizalama bozulması** olmayacak (sticky header düzeltmesi).
- **TÜMÜ BÜYÜK HARF (uppercase) yazımı kaldırılacak** → `Sentence case` (baş harf büyük) kullanılacak.
- **İstisna:** Kısaltmalar büyük kalır. Konuşmada sayılanlar: `SSK`, `SGK`, `İSG`, `KVKK`. "gibi" dendiği için aynı mantık diğer kısaltmalara da uygulanmalı (`TC`, `QR`, `HGS`, `IBAN` vb.).

📷 `10_ozluk-evrak-matris_03-00.jpg` (sütun başlıkları şu an TÜMÜ BÜYÜK HARF) · `09_personel-listesi_02-20.jpg`

---

### G-6 — Çift satırlı kutularda hizalama + iç scrollbar

`[03:52]`
> "Bazı liste sayfalarında bulunan grafikler ya da uyarılar gibi alanlarda çift satır olan yerlerde hizalama oluşturacağız. Gerekiyorsa kutuların kendi içerisine scrollbar ekleyeceğiz."

`[06:09]`
> "Bazı alanlarda şu an kredi kartlarındaki grafikler bölümünde olduğu gibi bu alan biraz büyük gözüküyor. Bununla ilgili gerekli düzenlemeyi... CSS ile alakalı gerekli düzenlemeyi oluşturabiliriz."

**Yapılacak:**
- Yan yana duran "Grafikler" / "Uyarılar" / "Son Hareketler" kutuları **eşit yükseklikte** hizalanacak.
- İçerik taştığında kutu büyümeyecek; **kutunun kendi içinde dikey scrollbar** olacak (`max-height` + `overflow-y: auto`).
- Kredi Kartları > Grafikler alanı gereğinden büyük — CSS ile küçültülecek.

📷 `13_saglik-raporlari-uyarilar_03-50.jpg` · `24_kredi-kartlari-grafikler_06-30.jpg`

---

### G-7 — Ekleme (form) yapıları tek tip olacak

`[07:49]`
> "Şimdi tüm ekleme yapıları tek bir yapıda olması lazım. Mesela burada bir kredi kartı görselimiz var. Burada bir kart seçeneği ile beraber bir işlem olarak ve işte yeşilse yeşil renk üzerinden götürmemiz lazım. **Yani hep standart bir yapıda olması gerek.**"

**Yapılacak:**
- `Yeni Kart`, `Yeni Personel`, `Yeni Cari`, `Yeni Araç`, `Yeni Demirbaş` vb. tüm ekleme formları **aynı şablonu** kullanacak (aynı modal/sayfa yapısı, aynı alan dizilimi, aynı buton yerleşimi).
- Renkler kurumsal marka renginden türetilecek, her formda tutarlı. (Konuşmada yalnızca *"yeşilse yeşil renk üzerinden götürmemiz lazım"* deniyor; sistemdeki ana marka rengi `Ayarlar > Firma Ayarları > Marka Renkleri` altında `#3FD5AD` olarak tanımlı — referans olarak bu alınabilir.)

📷 `28_kredi-karti-yeni-kart_08-00.jpg` · `46_ayarlar-marka-renkleri_12-10.jpg`

---

### G-8 — Tarih aralığı ve seçim alanları her sayfada aynı bileşen olacak

`[11:01]`
> "Bu raporlama merkezinde 'çıktı al' dediğimiz bir yapı var. Her içerikte bu olan bir konu. Burada tarih aralıklarına dokunacağımız gibi bir yapı oluşturuldu. Bunu tüm yapılarda eksiksiz bir şekilde oluşturalım."

`[11:28]`
> "Rapor merkezinde, hakediş raporunda bir tasarımsal bozukluk var. Sayfalandırmada mesela **talep raporundaki gibi** bir tasarım olması gerek. **Yani bütün sayfalandırmalarda tek tip bir yapıyla beraber hamle yapalım. Karışık bir yapı oluşturulmasın.**"

`[11:52]`
> "Dışarı aktar seçenekleri ya da çıktı al seçenekleri bir bütün olsun. Tarih aralıkları ve seçim alanları bir bütün olsun."

**Yapılacak:**
- **Referans tasarım: `Raporlar > Talep Raporu`.** Diğer tüm rapor/liste sayfaları bu düzene getirilecek.
- Tarih aralığı seçici **tek bir ortak bileşen** olacak. Sistemde en olgun hali `Raporlar > Puantaj Raporu`'ndaki dropdown (Bugün / Dün / Bu hafta / Son 7 gün / Son 15 gün / Bu ay / Son 30 gün / Geçen ay / Bu yıl / Özel tarih aralığı) — bu bileşen tüm sayfalarda kullanılacak.
- **`Hakediş Raporu`'ndaki somut bozukluk:** `Tarih Aralığı`, `Dönem` ve `Şantiye` filtreleri üç ayrı satıra yayılmış. `Talep Raporu`'nda bunlar tek satırda ve tek tip. Hakediş Raporu, Talep Raporu düzenine getirilecek.

📷 `38_rapor-talep_11-40.jpg` (referans düzen) · `37_rapor-hakedis_11-30.jpg` (düzeltilecek) · `47_rapor-tarih-araligi-secenekleri_11-10.jpg` (ortak tarih bileşeni)

---

### G-9 — Responsive

`[12:17]`
> "Genel yapıda **responsive özelliğine kesinlikle ve kesinlikle dikkat edelim.** Ana sayfada şu an şantiye durumunda olmuş gözüken yapı gibi — responsive özelliği burada patlıyor. Buradaki yapıda gerekli düzenlemeyi alarak işlemimizi yapalım."

`[15:40]`
> "İşlemleri yaparken responsive kısmını atlama."

**Yapılacak:**
- Tüm sayfalar mobil / tablet / masaüstü kırılımlarında test edilecek.
- **Bilinen bozukluk:** `Ana Panel > Şantiye Durumu` kartı — ilerleme çubukları kesiliyor, kart daralınca içerik taşıyor.

📷 `40_ana-panel-santiye-durumu-responsive_12-20.jpg`

---

## 2. EKRAN / MODÜL BAZLI REVİZYONLAR

### 2.1 Ana Panel & Bildirimler

**R-01 · Bildirimler sayfası masaüstü düzenine geçecek** `[00:19]`
> "Sayfalandırma içerisinde bildirimler kısmı mobil sayfa şeklinde gözüküyor. Bunu masaüstünde komple yayarak gösterelim."

**Yapılacak:** Bildirimler sayfası şu an dar/mobil kolon halinde. Masaüstünde tam genişliğe yayılacak şekilde düzenlenecek.
📷 `01_bildirimler_00-20.jpg`

**R-02 · Ana Panel responsive düzeltmesi** `[12:17]` → bkz. **G-9**
📷 `40_ana-panel-santiye-durumu-responsive_12-20.jpg` · `41_ana-panel-alt_12-30.jpg`

---

### 2.2 Şantiye Yönetimi

**R-03 · Şantiye Listesi: Dışa Aktar konumu** `[00:43]`
> "Yeni şantiye dediğimiz kısmın yanında dışarı aktar kısmı olacak."

**Yapılacak:** `Dışa Aktar` → `Yeni Şantiye` butonunun yanına.

**R-04 · Şantiye özet kartları slider** `[01:03]`
> "Ekstra şantiyeler bölümünde 'pasif/arşiv' dediğimiz kısım tek satırda gözükeceğinden dolayı, toplam şantiye/aktif şantiyenin en sonunda olacak şekilde slider şeklinde gözükebilir."

**Yapılacak:** `9 Toplam · 3 Aktif · 1 Planlama · 1 Tamamlanan · 4 Pasif/Arşiv` kart şeridi tek satır + slider. İkinci satıra taşma yok.
📷 `02_santiye-listesi_00-40.jpg` · `03_santiye-listesi-tablo_01-00.jpg` · `04_santiye-listesi-filtre-satirlari_01-20.jpg`

**R-05 · Şantiye türü / durum filtreleri gelişmiş filtreye** `[01:27]` → bkz. **G-4**

**R-06 · İSG Tutanakları: "Çıktı Al" kaldırılacak** `[01:51]`
**Yapılacak:** `Çıktı Al` → yok. `Dışa Aktar`, `Yeni Tutanak` yanında.
📷 `07_isg-tutanaklari-ciktial_02-00.jpg`

**R-07 · İSG Tutanakları filtreleri** `[01:27]` — `Tür`, `Şantiye`, `Tarih Aralığı`, `Sorumlu` zaten Gelişmiş Filtre'de; üstte tekrar edenler kaldırılacak.
📷 `06_isg-gelismis-filtre_01-40.jpg`

---

### 2.3 Görev ve İş Takibi

**R-08 · Görevler: Dışa Aktar konumu** `[02:13]`
> "Bu iş takibi kısmındaki dışarı aktar yeni görev kısmında gözükecek."

**Yapılacak:** `Dışa Aktar` → `Yeni Görev` butonunun yanına.
📷 `08_gorevler-havuz_02-10.jpg`

---

### 2.4 İnsan Kaynağı

**R-09 · Personel Listesi: Dışa Aktar konumu** `[02:13]`
**Yapılacak:** `Dışa Aktar` → `Yeni Personel` yanına.
📷 `09_personel-listesi_02-20.jpg`

**R-10 · Özlük & Evrak: başlık/kategori tipografisi ve kayma** `[02:39]`
> "Özlük evrak dediğimiz yapıda liste sayfalandırmasında bulunan personel başlığı ve kategorilerin tamamı kalın bir puntoyla; ayrıca yukarıya geçildiğinde kayma kısımları oluşmayacak şekilde düzeltme yapılması lazım."

**Yapılacak:**
- Evrak matrisi sütun başlıkları (`01 Kimlik Fotokopisi`, `02 İş Sözleşmesi`, ...) bold.
- Sayfa scroll edilince sticky başlık kayması düzeltilecek.
- Sütun başlıkları uppercase'den `Sentence case`'e (kısaltmalar hariç → **G-5**).
📷 `10_ozluk-evrak-matris_03-00.jpg`

**R-11 · Özlük & Evrak: Dışa Aktar hizası** `[03:04]`
> "Buradaki dışarı aktarda yeni bir özlük evrak yapısı yok. Lakin yeni evrak yapısı var gibi aynı hizada duracak şekilde işlem yapılması lazım."

**Yapılacak:** Sayfada `Yeni ...` butonu olmasa da `Dışa Aktar` diğer sayfalarla aynı hizada/konumda duracak.

**R-12 · İzinler / Sağlık Raporları: "Çıktı Al" kaldırılacak, kutu hizalaması** `[03:29]` `[03:52]`
**Yapılacak:** `Çıktı Al` → `Dışa Aktar > Yazdır`. Grafikler/Uyarılar kutuları eşit yükseklik + iç scrollbar (**G-6**).
📷 `11_izinler_03-20.jpg` · `12_saglik-raporlari-grafikler_03-40.jpg` · `13_saglik-raporlari-uyarilar_03-50.jpg`

**R-13 · Avanslar: "Çıktı Al" → "Dışa Aktar", onay diyaloğu modalin içine** `[04:15]`
> "Avanslar bölümünde olan 'çıktı al'ı yukarıdan 'dışarı aktar' seçeneği olarak değiştirip, buradaki 'tüm liste mi çıktı alınsın' özelliğini dışarı aktar seçeneğinin içerisinde oluşturacağız."

**Yapılacak:**
- Üstteki `Çıktı Al` → `Dışa Aktar`.
- "Hiç talep seçilmedi — tüm liste mi çıktı alınsın?" onayı ayrı bir diyalog olmayacak; `Dışa Aktar` modalinin **Kapsam** bölümüne (`Tümü` / `Filtrelenmiş liste`) taşınacak.
📷 `14_avanslar_04-00.jpg` · `15_avanslar-cikti-dialog_04-20.jpg`

---

### 2.5 Operasyon (Puantaj / Taşeron Puantajı / Yemekhane)

**R-14 · Puantaj: iki ayrı buton birleştirilecek** `[04:34]`
> "Puantaj yapısında da sayfalandırma içerisinde 'dışarı aktar' ve 'çıktı al' iki tane ayrı seçenek şeklinde oluşturulmuş. Bu sadece dışarı aktar olacak. Çıktı al seçeneği dışarı aktarın içerisinde yazdır kısmında oluşturulacak."

**Yapılacak:** Tek `Dışa Aktar` butonu; modal içinde `PDF / Excel / Yazdır`.
📷 `16_puantaj_04-30.jpg` · `17_puantaj-disa-aktar-modal_04-40.jpg`

**R-15 · Taşeron Puantajı: Dışa Aktar yukarıda** `[04:57]`
> "Taşeron puantajına da... aynı şekilde yukarıda gösterilecek."

**R-16 · Yemekhane: Dışa Aktar yukarıda** `[04:57]`
> "Yemekhane bölümünde de dışarı aktar yukarıda gösterilecek."
📷 `18_yemekhane_05-00.jpg`

---

### 2.6 Finans Yönetimi

**R-17 · Kasa: alttaki rapor & onay filtreleri gelişmiş filtreye** `[05:23]`
> "Kasa bölümünde altta rapor ve onay kısmında bu tür yapılar gelişmiş filtrenin içerisinde gösterilecek."

**Yapılacak:** `Rapor & Onay Akışı` tablosundaki durum ve tür çipleri (`Onay Bekliyor`, `Onaylandı`, `Reddedildi`, `Revize İstendi`, `Taslak`, `Kayıtlı` / `Giriş`, `Tahsilat`, `Ödeme`, `Avans Ödemesi`) Gelişmiş Filtre'ye taşınacak.
📷 `20_kasa-rapor-onay_05-20.jpg`

**R-18 · Kasa: iki ayrı dışa aktar kapsamı ayrıştırılacak** `[05:23]` `[05:42]`
> "Burada hem çıktı al hem dışarı aktar seçeneği var. İki tane yapı olduğundan dolayı bunlar kendi içerisinde ayrı gösteriliyor. Yani buradaki dışarı aktar burası ile alakalı, yukarıdaki kısımda da dışarı aktar seçeneği olması lazım. Yani kasa defterindeki bu Vadi Konakları, Liman ve benzeri tipteki yapılar için ayrıyeten dışarı aktar seçeneği konulması gerek."

**Yapılacak:**
- Sayfa üstünde **Rapor & Onay Akışı** listesi için bir `Dışa Aktar`.
- **Kasa Defteri** (şantiye bazlı: Vadi Konakları, Liman Lojistik, Merkez Şantiye...) bölümü için **ayrı** bir `Dışa Aktar`.
- Her ikisi de tek buton (çıktı al yok), kapsamı net etiketlenecek.
📷 `19_kasa_05-10.jpg` · `21_kasa-defteri_05-40.jpg`

**R-19 · Banka Hesapları: kart şeridi slider** `[05:42]`
> "Banka hesapları birden fazla oluşabilir. O bakımdan ikinci satırdan sonra ekstra satır koymadan slider şeklinde adım atalım."
📷 `22_banka-hesaplari_06-00.jpg`

**R-20 · Kredi Kartları: kart şeridi slider + grafik alanı küçültülecek** `[06:09]`
📷 `23_kredi-kartlari_06-10.jpg` · `24_kredi-kartlari-grafikler_06-30.jpg`

**R-21 · Pluxee Kartlar → "Kartlar" olarak genelleştirilecek** `[07:24]`
> "Pluxee kartlar kısmında da şöyle: sistemde sadece Pluxee kart diye bir durum değil. Bu Sodexo, Multinet gibi yapılar da oluşturulabilir. Yani sayfalandırma oluştururken diğer kartları da baz alacak şekilde oluşturalım ve burada 'Pluxee Kartlar' değil de **'Kartlar'** seçeneği gibi içerik koyabiliriz."

**Yapılacak:**
- Menü ve sayfa başlığı: `Pluxee Kartlar` → **`Kartlar`**.
- Veri modeline **kart sağlayıcı** alanı eklenecek: Pluxee, Sodexo, Multinet, (+ diğer / özel).
- Liste ve filtreler sağlayıcı bazlı çalışacak.
📷 `25_pluxee-kartlar_06-40.jpg`

**R-22 · Kartlar > Hareketler: filtreler sadeleşecek, çift buton kalkacak** `[06:59]`
> "Hareketler bölümündeki liste yapısında tarih aralığı, şantiye, tür gibi birden fazla içerik var. Bunları daha minimize etmemiz lazım... Burada hem çıktı al hem dışarı aktar seçenekleri var. Bunlar olmasın."
📷 `26_pluxee-hareketler-filtreler_07-00.jpg`

**R-23 · Kurum Hakedişleri: Çıktı Al → Dışa Aktar, yukarıda** `[07:49]`
> "Mesela kurum hakedişlerindeki 'çıktı al' seçeneği dışarı aktar şeklinde yukarıda olması lazım."
📷 `27_kurum-hakedisleri_07-50.jpg`

**R-24 · Taşeron Kartları: Dışa Aktar aynı hizada yukarıda** `[08:08]`
> "Mesela taşeron kartlarındaki dışarı aktar seçeneği yine aynı hizada yukarıda olması gerek."
📷 `29_taseron-kartlari_08-20.jpg`

**R-25 · Taşeron Hakedişleri: aynı kurallar** `[08:34]`
> "Taşeron hakedişlerindeki yapıda da sayfalandırmada bu hassasiyetlere dikkat ederek işlem yapmanı istiyorum."
📷 `30_taseron-hakedisleri_08-30.jpg`

---

### 2.7 Varlık ve Araç Yönetimi — **yapısal sadeleştirme**

Bu modülde en kapsamlı değişiklik isteniyor: **ayrı ayrı duran sayfaların ana kayıtların içine sekme olarak gömülmesi.**

**R-26 · Demirbaş / Araç ilişkisi** `[08:34]`
> "Demirbaş tarafından, aslında araçlar da birer demirbaş ama birden fazla yapı olduğundan [...] buna ekstra olarak bir adım atabiliriz."

**Yapılacak:** Araçlar kavramsal olarak demirbaştır; araçlara özel alanlar fazla olduğu için ayrı bir kırılım gerekiyor.

> ⚠️ **Bu cümle deşifrede net değil (`[08:34]`).** İki okuma mümkün: (a) araçlar ayrı liste olarak kalsın, demirbaşın içinde tekrar gösterilmesin, ya da (b) araçlar demirbaşın altına bir alt kırılım olarak alınsın. **R-29** ("demirbaşın içerisinde araç filosunu göstermeye gerek yok") (a) okumasını destekliyor. Uygulamadan önce Yasin Bey'e teyit ettirilmesi önerilir.

**R-27 · Demirbaş Etiketleri → Demirbaş içine** `[08:57]`
> "Demirbaş etiketleri dediğimiz [yapı] demirbaşın içerisinde olması lazım."

**R-28 · Araç Evrakları + Bakım/Muayene → Araç kaydının içine sekme** `[08:57]` `[10:19]`
> "Araç evrakları, bakım muayene takipleri dediğimiz kısımlar aracın içerisinde olması lazım."
> "Araç evrakları dediğim gibi araçların içerisinde bir sekmede ve bakım muayene kısmı da aynı şekilde onun içerisinde bir sekmede olarak işlem yapabiliriz."

**Yapılacak:** `Araç Evrakları` ve `Bakım / Muayene` ayrı menü öğesi olmaktan çıkarılacak; araç detay sayfasında **sekme** olacak.
📷 `33_arac-evraklari_09-00.jpg`

**R-29 · Demirbaş içinde Araç Filosu gösterilmeyecek** `[08:57]`
> "Sayfalandırma oluştururken demirbaşın içerisinde araç filosunu göstermeye gerek yok."

**Yapılacak:** Demirbaşlar sayfasındaki üst butonlardan `Araç Filosu (10)` kaldırılacak.

**R-30 · Etiket Yönet: liste oradan yönlendirilecek** `[08:57]`
> "Burada 'etiket yönet' dediğimiz yapı olduğundan dolayı etiketin buradaki sayfalandırmayı oraya yönlendirebiliyoruz."

**R-31 · Kategori Yönetimi + Marka & Model birleştirilecek** `[09:21]`
> "Kategori yönetimi dediğimiz yapı ya da marka model dediğimiz yapı bunlar aslında bir bütün olarak ilerlenebilir. Yani kategorinin içerisinde oluşturulabilir."

**Yapılacak:** `Marka & Model` ayrı buton olmaktan çıkarılıp `Kategori Yönetimi` içine alınacak.

**R-32 · Durum filtresi gelişmiş filtreye** `[09:21]` `[09:56]`
> "Ayrıca durum kısmında... bunlar gelişmiş filtrelerin içerisine eklenilebilir."
> "Araç seçeneğinde ise şu an durum kısmı direkt gelişmiş filtrenin içerisinde oluşturulur."

**R-33 · Demirbaş: Dışa Aktar → Yeni Demirbaş butonunun yanına** `[09:36]`
> "Dışarı aktar seçeneği de yeni demirbaş kısmının içerisinde oluşturulabilir."

*(Birebir "içerisinde" deniyor; G-2'deki genel kuralla uyumlu olması için "Yeni Demirbaş" butonunun hemen yanı olarak uygulanmalı.)*

**R-34 · QR / Barkod Yazdır → Etiketler içine** `[09:36]`
> "Mesela burada barkod ya da QR kod yazdır seçenekleri tamamıyla etiket kısımlarının içerisinden ilerlenilebilir."
📷 `34_demirbas-qr-barkod_09-40.jpg`

**R-35 · Bildirim Merkezi kaldırılacak** `[09:36]` `[09:56]`
> "Bildirim merkezinin burada ihtiyacı yok."
> "Bildirim merkezini buradan çıkartabiliriz."

**Yapılacak:** Demirbaşlar ve Araçlar sayfalarındaki `Bildirim Merkezi` butonu kaldırılacak (bildirimler zaten global bildirim merkezinde).

**R-36 · Dashboard sayfaları kaldırılacak** `[09:36]` `[10:19]`
> "Ya da dashboard dediğimiz yapı zaten ana içerikte olması lazım."
> "Dashboard dediğimiz yapıda da ekstra bir sayfalandırma çıkartmanın bir anlamı yok. Yani bu dashboard sayfalarını direktman kaldırabiliriz."

**Yapılacak:** `Araç Filosu Dashboard` ve modül içi ayrı `Dashboard` sayfaları kaldırılacak; özet göstergeler ilgili listenin üstündeki KPI kartlarında kalacak.
📷 `35_arac-filosu-dashboard_10-20.jpg`

**R-37 · Araçlar: Dışa Aktar → Yeni Araç yanına** `[09:56]`
📷 `32_araclar-liste_08-50.jpg` · `31_demirbaslar-ust-butonlar_08-40.jpg`

**R-38 · Genel temizlik** `[09:56]`
> "Gereksiz kısımları temizleyerek daha temiz bir görünüm elde etmeni istiyorum."

---

### 2.8 Cari ve Firma Yönetimi

**R-39 · Firma Rehberi / Kişiler: Dışa Aktar konumu** `[10:43]`
> "Bu cariler bölümünde, firma bölümünde 'yeni cari' dediğimiz kısımda dışarı aktar kısmı yeni carinin yan tarafında olması gerek. Kişiler tarafında da aynı şekilde."
📷 `36_firma-rehberi-cariler_10-40.jpg`

---

### 2.9 Raporlar

**R-40 · Tüm rapor sayfaları tek tip olacak** `[11:01]` `[11:28]` `[11:52]` → bkz. **G-8**
**Referans:** `Talep Raporu`. **Düzeltilecek:** `Hakediş Raporu` (tasarımsal bozukluk).
📷 `38_rapor-talep_11-40.jpg` · `37_rapor-hakedis_11-30.jpg`

---

### 2.10 Satış CRM

**R-41 · Teklifler / Sözleşme & Teslimat / Satış Sonrası: Dışa Aktar konumu** `[11:52]`
> "Bu satış sonrası, sözleşme ya da teklif kısımlarındaki dışarı aktarlar da aynı şekilde ekleme alanlarında gözükecek bir yapı oluşturalım."
📷 `39_satis-sozlesme-teslimat_12-00.jpg`

---

## 3. YENİ GELİŞTİRMELER

### 3.1 Tüm sayfaların index'e çıkarılması

**R-42** `[12:49]`
> "Son olarak sayfalandırmanın tamamını bir kontrol etmeni istiyorum. Kontrol sağladıktan sonra sadece rollerin gösterildiği alanlar değil, bir de ekstra sayfaları — yani giriş sayfası, şifre unuttum sayfası ya da XYZ gibi alanları da komple **indeks sayfasında** çıkartmanı istiyorum."

**Yapılacak:**
- Projedeki **tüm** HTML sayfaları taranacak.
- Rol seçim ekranındaki kartların dışında kalan sayfalar da (`giriş`, `şifremi unuttum`, `404`, `hata`, `çıktı` sayfaları vb.) bir **index / sayfa dizini** sayfasında listelenecek.
📷 `42_giris-rol-secim_12-50.jpg`

---

### 3.2 Müşteri Portalı — kapsamlı yeniden tasarım

**R-43 · Karşılama ve genel yapı** `[13:12]`
> "Müşteri portalındaki sayfalandırma yapısında ise burası bizim müşterinin kendi sayfası. Yani burada bir **hoş geldiniz** içeriğiyle beraber yapıyı göstererek... böyle bir uygulamayı ya da böyle bir yazılımı kullanacak bir kurumda olması gereken tüm özellikleri — yani burada ödeme kısımları, belgeler ya da talepler kısımları oluşturulmuş; ekstra olarak burada ihtiyaç duyulan yapılar nelerse bunları **kullanıcı dostu bir arayüzle** beraber göstermeni istiyorum."

**Yapılacak:**
- Portal girişinde kişiselleştirilmiş **hoş geldiniz** bölümü.
- Mevcut bölümler (Ödemeler, Belgeler, Talepler) korunacak, eksik kalan ihtiyaçlar tamamlanacak.
- Kullanıcı dostu, sade arayüz.
📷 `43_musteri-portali-panel_13-20.jpg`

**R-44 · Talepler: biten talepler arşive** `[13:59]`
> "Mesela talep yapılarında, buradan ise bitmiş talepleri sistemde bir kenarda **arşiv** gibi gösterebiliriz."

**Yapılacak:** `Tamamlandı` durumundaki talepler ana listeden ayrılıp `Arşiv` sekmesinde gösterilecek.

**R-45 · Yeni talep oluşturma tasarımı** `[13:59]`
> "Yeni bir talep oluşturma içeriği için daha güzel bir tasarım içeriye çıkartabiliriz."
📷 `44_musteri-portali-yeni-talep_14-10.jpg`

**R-46 · Müşteriye raporlama sayfası** `[14:22]`
> "Sayfalandırmadan gerekli raporlamayı müşteri tarafına düzgün bir şekilde aktarabilecek bir sayfa tasarımına ihtiyacımız var."

**Yapılacak:** Müşterinin kendi birimi/ödemeleri/teslim durumu için özet rapor sayfası.

---

### 3.3 Platform Sahibi (Süper Admin) Paneli — **mevcut konsol genişletilecek**

> Not: Sistemde zaten bir `Süper Admin · Platform Konsolu` rolü var (rol seçim ekranı: *"tüm firmalar, paket & modül yönetimi"*). Sıfırdan yeni modül yazılmayacak; **var olan konsol aşağıdaki kapsama genişletilecek.**

**R-47** `[14:22]` `[14:45]`
> "Aynı şekilde buranın, bu platformun sahibi olarak ben tüm firmalarımı — kimlerle beraber çalışıyorsam tüm şirketleri görüntüleyebileceğim. Hangi şirketler kaç yıldır bizimle beraber, hangisi demo alanında, hangisi ücretini ödemiş, ödememiş; ya da müşteri bilgilerinin, şirket bilgilerinin olup olmadığıyla alakalı geniş bir yapıda adım atmanı istiyorum. Burada **Parasüt gibi bir yapıyı inceleyebilirsin.**"

**Yapılacak:** SaaS yönetim paneli (multi-tenant):

| Alan | İçerik |
|---|---|
| Firma listesi | Platformu kullanan tüm şirketler |
| Müşteri kıdemi | Kaç yıldır/aydır müşteri |
| Abonelik durumu | Demo / Deneme / Ücretli / Askıda / İptal |
| Ödeme durumu | Ödemiş / Ödememiş / Gecikmiş, fatura geçmişi |
| Kayıt bütünlüğü | Şirket bilgileri ve müşteri bilgileri tam mı, eksik mi |
| Kullanım | Kullanıcı sayısı, aktif modüller |

**Referans:** Parasüt (parasut.com) — hem müşteri girişi hem firma sahibi yönetim ekranları. Videoda `[15:00–15:30]` arasında bu site açılıp örnek gösteriliyor.
📷 `45_parasut-ornek_15-10.jpg` · `42_giris-rol-secim_12-50.jpg` (mevcut Süper Admin rolü)

**R-48 · Giriş akışı** `[15:09]`
> "Biz burada bir müşteri olarak adım attığımız zaman, nasıl 'giriş yap' diyerek sayfalandırma içerisinde giriş yaparak bir işlem yapıyorsa; sistem tarafında müşteri de direkt giriş yaparak müşteri portalına giriş yapacak."

**Yapılacak:** Parasüt'teki gibi tek bir `Giriş Yap` akışı olacak. Konuşmada açıkça istenen: **müşteri giriş yaptığında doğrudan Müşteri Portalı'na düşecek** (ayrı bir portal linki aramayacak). Aynı mantığın firma kullanıcısı → CRM paneli ve platform sahibi → Süper Admin konsolu için de kurulması doğal devamıdır.

**R-49 · Yönetici ekranları referansı** `[15:25]`
> "Burada görmüş olduğumuz Parasüt sistemindeki yönetici, yani firma sahibinin görüntülediği ekranları da baz alacak şekilde sayfalandırmalarımızı yapmamız lazım."

**R-50 · Ek sayfaları çıkar, liste sayfasını düzgün göster** `[15:40]`
> "Bu tarz yapıları örnek alarak, sayfalandırmadaki ek sayfalandırmaları çıkartarak liste sayfasını da düzgün bir şekilde burada gösterebilirsin."

---

## 4. TESLİM KRİTERLERİ

`[15:40]` `[16:06]`
> "İşlemleri yaparken responsive kısmını atlama ve testlerini oluşturduktan sonra eksik olarak gördüğün yerleri tamamlamak adına işlem yapabilirsin."

**Kontrol listesi:**

- [ ] Sistemde **hiçbir** sayfada `Çıktı Al` butonu kalmadı (G-1)
- [ ] Her liste sayfasında `Dışa Aktar`, birincil ekleme butonunun yanında (G-2)
- [ ] Hiçbir filtre/çip satırı ikinci satıra taşmıyor; taşanlar slider (G-3)
- [ ] İkincil filtreler yalnızca Gelişmiş Filtre içinde, çift durmuyor (G-4)
- [ ] Uppercase metinler `Sentence case`e çevrildi (kısaltmalar hariç) (G-5)
- [ ] Yan yana kutular eşit yükseklikte + iç scrollbar (G-6)
- [ ] Tüm ekleme formları tek şablon (G-7)
- [ ] Tarih aralığı bileşeni her sayfada aynı; rapor sayfaları Talep Raporu düzeninde (G-8)
- [ ] Mobil / tablet / masaüstü responsive testi geçti; Ana Panel > Şantiye Durumu düzeldi (G-9)
- [ ] Varlık modülü sadeleşti (evraklar/bakım araç içinde sekme, dashboard'lar kalktı, bildirim merkezi kalktı)
- [ ] Tüm sayfalar index'te listeleniyor (giriş, şifremi unuttum, hata sayfaları dahil)
- [ ] Müşteri Portalı yenilendi (hoş geldiniz, arşiv, yeni talep tasarımı, raporlama)
- [ ] Süper Admin / platform sahibi paneli eklendi

---

## Ekler

- `desifre/tam-desifre-zaman-damgali.txt` — videonun zaman damgalı tam konuşma dökümü
- `ekran-goruntuleri/` — 45 adet ekran görüntüsü, dosya adlarında `MM-SS` zaman damgası var

> **Not:** Deşifre otomatik konuşma tanıma (Whisper) ile üretildi. Alıntılar bu dökümden alınmış, bağlamdan anlaşılan terim hataları düzeltilmiştir (bkz. terim sözlüğü). Herhangi bir maddede tereddüt olursa videodaki zaman damgasından kontrol edilebilir.
