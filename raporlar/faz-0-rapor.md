# FAZ 0 RAPORU — Envanter ve yönlendirme

**Tarih:** 2026-08-11 · **Dal:** `revizyon/faz-0-6` · **Şartname:** `docs/REVIZYON.md` §9 Faz 0
**Üreten betikler:** `tools/manifest-uret.mjs`, `tools/faz0-envanter.mjs`, `tools/progress-uret.mjs`
**Ham çıktılar:** `raporlar/faz-0-envanter.json`, `manifest/screen-manifest.json`, `manifest/eski-eslesme.json`

---

## 1. Sayaç çelişkisinin çözümü

Doküman §1, mevcut dizinde **199 / 202 / 242** gibi farklı sayfa sayaçları görüldüğünü ve tek bir
ekran manifestosu olmadığını tespit ediyordu. Dosya sistemi taraması bunu doğruladı ve tek doğru
sayacı üretti:

| Ölçüm | Değer |
| --- | --- |
| Kök dizindeki HTML | 2 (`index.html`, `404.html`) |
| `v2/` altındaki HTML | 242 |
| **Toplam gerçek ekran dosyası** | **244** |
| `data-sec` künyesi taşıyan | 208 / 244 (%85) |

Farklı sayaçların nedeni: prototipin kendi dizin sayfası (`crm-dizin.html`) ve sidebar menüsü,
dosya sisteminden değil elle tutulan listelerden besleniyordu. **Karar:** `crm-dizin.html` kaldırılır;
sayfa envanteri yalnız `manifest/screen-manifest.json`'dan okunur (KARARLAR.md K-006).

## 2. Hedef katalog (screen-manifest)

`manifest/screen-manifest.json` doğrudan `docs/REVIZYON.md` §4'ten üretilir — elle yazılmaz.

| Ölçüm | Değer |
| --- | --- |
| Sayfa ailesi | **244** (dokümandaki hedefle birebir) |
| Bölüm (rail) | 19 |
| Öncelik | P0: 155 · P1: 74 · P2: 15 |
| Dokümandaki karar | Yeni: 157 · Revize: 83 · Yeniden kur: 4 |

Kalıp dağılımı (§3 ortak sayfa sözleşmelerine bağlanır):
detay 50 · form 75 · liste 42 · rapor 19 · sihirbaz 17 · panel 8 · onay 7 · portal 5 ·
matris 4 · mutabakat 4 · durum 4 · takvim 3 · mobil 3 · ayar 2 · kimlik 1

**Bulunan çakışma:** `CRD-17` ve `RPT-13` dokümanda aynı yolu (`/raporlar/kartlar`) gösteriyor.
Kural 4 (tek kanonik kayıt/API) gereği ikinci bir uygulama üretilmez: kanonik sahip **RPT-13**,
`CRD-17` Kartlar menüsünden aynı ekrana giden **takma ad** olarak işaretlendi ve yetkisi de
RPT-13'ten türetildi. Karar: KARARLAR.md K-013.

## 3. Eski → hedef eşleme kararları

244 mevcut dosyanın **tamamı** için karar verildi (eşlemesiz dosya kalırsa Faz 0 betiği hata verip
durur — `tools/faz0-envanter.mjs` çıkış kodu 1):

| Karar | Adet | Anlamı |
| --- | --- | --- |
| **koru** | 94 | Ekran hedef aileyle 1:1; veri ve akış revize edilerek taşınır |
| **birleştir** | 125 | Birden çok eski ekran tek hedef ailenin sekmesi/kalıbı olur |
| **yönlendir** | 4 | Eski yol kalır, kanonik hedefe devreder |
| **kaldır** | 21 | Hedef katalogda karşılığı yok veya değişmez kural ihlali |

**Kaldırılan 21 ekranın gerekçe grupları:**

- *Sahte başarı ekranı (değişmez kural 3):* `crm-sistem-basarili`, `portal-talep-tamamlandi`,
  `gavia-firma-form-sonuc`, `crm-ayarlar-odeme-sonuc`
- *SaaS abonelik/faturalama — ürün kapsamı dışı:* `crm-ayarlar-faturalar`, `crm-ayarlar-fatura-detay`,
  `crm-ayarlar-odeme-yontemi`, `crm-ayarlar-paket-degistir`, `crm-ayarlar-paket-karsilastir`,
  `crm-ayarlar-abonelik-iptal`, `crm-ayarlar-deneme-durum`, `crm-auth-abonelik-pasif`,
  `gavia-paketler`, `gavia-mrr-raporu`, `gavia-churn-riski`, `crm-sistem-limit-asildi`
- *Bileşene indirgendi:* `crm-sistem-kayit-yok` (boş durum artık liste bileşeninin state'i),
  `crm-sistem-filtre-demo`
- *Tek kaynak kuralı:* `crm-dizin` (yerini screen-manifest aldı)
- *Hedef katalogda yok:* `crm-ayarlar-marka-renkleri`, `crm-ayarlar-cok-dil`

**Kapsama:** hedef katalogdaki 244 aileden **114'ü** en az bir eski ekrandan besleniyor,
**130'u sıfırdan yazılacak** — bunların **75'i P0**. Bu, Faz 1-6 iş yükünün gerçek büyüklüğüdür.

## 4. Kırık rota ve ölü aksiyon taraması

| Ölçüm | Sonuç |
| --- | --- |
| Taranan iç bağlantı | 4.234 |
| **Kırık dosya bağlantısı** | **0** |
| **Ölü aksiyon** (rotası olmayan birincil eylem) | **7** |

Statik prototipte dosya-bağlantı bütünlüğü tamdır; kırılma **rotası hiç açılmamış birincil
eylemlerde**dir. Dokümanın "yeni proje formu yolu 404" bulgusu kanıtlandı:

| Dosya | Eylem | Prototipteki durum |
| --- | --- | --- |
| `crm-santiye-proje.html` | **Yeni Proje** | `href="#"` — "Proje ekleme formu bu prototipte kurgulanmadı" |
| `crm-santiye-detay.html` | Risk Ekle (×2) | demo bildirimi |
| `crm-santiye-detay.html` | Yetki Ekle (×2) | demo bildirimi |
| `crm-satinalma-tedarikciler.html` | Yeni Tedarikçi | demo bildirimi |
| `crm-satis-musteri-detay.html` | Düzenle | demo bildirimi |

Hedef karşılıkları: PRJ-02 `/projeler/yeni`, PRJ-08 `/projeler/:id/riskler`,
PRJ-06 `/projeler/:id/organizasyon`, PRC-11 `/tedarikciler`, EXT-01 `/musteriler` —
hepsi manifestte tanımlı ve `PROGRESS.md`'de izleniyor.

## 5. Değişmez kural ihlali taraması (taban ölçüm)

Mevcut kod tabanı, hedef kuralların hangi noktalarda ihlal edildiğini gösteren taban ölçüm:

| İhlal türü | Adet | İlgili değişmez kural |
| --- | --- | --- |
| `localStorage` ile iş kuralı/veri | 133 | Kural 2 ve 3 — istemci depolaması iş kaydı değildir |
| `href="#"` (rotasız bağlantı) | 133 | §12 — WIP/ölü bağlantı üretime çıkış engeli |
| `data-demo` demo bildirimi | 106 | Kural 3 — sahte başarı bildirimi yasak |
| `?role=` ile rol seçimi | 28 | Kural 2 — rol istemciden gelmez |

**130 / 244 dosya** en az bir ihlal içeriyor. Bu sayaç Faz 1-6 boyunca sıfıra inmelidir;
her faz raporunda yeniden ölçülecektir.

## 6. Hedef mimari kararı (uygulandı)

| Konu | Karar | Kayıt |
| --- | --- | --- |
| Uygulama biçimi | Modüler monolit, net modül sınırları | K-002 |
| Çalışma zamanı | Node.js 22+, **sıfır npm bağımlılığı** (yalnız `node:*`) | K-002 |
| Veri | `node:sqlite`, WAL + foreign_keys, repository katmanı ardında | K-003 |
| Para / zaman | Tamsayı minor unit + ISO para birimi; UTC saklama | K-004 |
| Render | Sunucu tarafı HTML + progressive enhancement | K-007 |
| Kimlik | Sunucu oturumu, `HttpOnly; Secure; SameSite=Lax`, scrypt | K-008 |
| Çıktı | PDF/XLSX/CSV sunucuda, sıfır bağımlılıkla | K-009 |
| Barındırma | GitHub Pages uygulamayı barındıramaz; Node süreci | K-010 |
| Test | `node:test`; kabul testleri kod bazlı dosyalarda | K-011 |

Modül sınırları (doküman §8): kimlik-yetki · proje-şantiye · iş akışı · doküman ·
satın alma-stok · sözleşme-hakediş · finans · İK · kartlar · varlık · rapor · entegrasyon.

## 7. Otomatik link testi

`tests/faz0-link.test.js` — **10/10 geçiyor** (`npm test`):

1. Manifest yeniden üretilebilir ve 244 aile içeriyor (elle düzenleme tespit edilir)
2. Her ekran kodu benzersiz, rota `/` ile başlıyor, yetki + analitik anahtarı var
3. Aynı rotayı paylaşan iki ekran ayrı uygulama üretmiyor (takma ad zorunlu)
4. Her eski ekran için koru/birleştir/yönlendir/kaldır kararı mevcut, kaldırma gerekçeli
5. Eski uygulamada kırık iç bağlantı yok
6. Ölü aksiyonlar kayıt altında; `/projeler/yeni` bulgusu kanıtlı
7. Her eşleme hedefi manifestteki gerçek bir koda işaret ediyor
8. `PROGRESS.md` manifestteki her kodu içeriyor
9. Tüm P0 rotaları tanımlı
10. Şartname dokümanı repoda ve 629 satır

## 8. Faz 0 çıkış koşulu

| Koşul | Durum |
| --- | --- |
| screen-manifest üretildi | ✅ 244 aile, dokümandan üretiliyor |
| Her mevcut yol için karar verildi | ✅ 244/244, eşlemesiz dosya kalırsa betik hata veriyor |
| Kırık rotalar belirlendi | ✅ 0 dosya bağlantısı kırık, 7 ölü aksiyon raporlandı |
| Hedef mimari kararı verildi ve uygulandı | ✅ K-002..K-014, iskelet kuruldu |
| Otomatik link testi çalışıyor | ✅ 10/10 |

**Sonuç: FAZ 0 KAPANDI.** Faz 1 (temel platform) başlayabilir.
