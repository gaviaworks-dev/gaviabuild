# [ÜRÜN ADI] — Bütünleşik İnşaat ve Şantiye Operasyonları Yönetim Platformu

Şirket, proje ve şantiye süreçlerini **aynı veri omurgasında** yöneten üretim seviyesi
uygulama. Çalışma adı **GaviaBuild**. Nihai marka verilene kadar arayüzde `[ÜRÜN ADI]` kullanılır.

> Bu ürün bir CRM değildir. Kapsam; proje portföyü, şantiye ve saha operasyonu, iş programı ve
> WBS, görev ve iş emri, İSG, kalite/RFI, doküman ve çizim kontrolü, personel ve puantaj,
> satın alma ve tedarik, depo ve stok, sözleşme-metraj-hakediş, finans ve bütçe, kartlar,
> varlık ve filo, raporlama ve dış portallardır.

## Durum

| | |
| --- | --- |
| Bağlayıcı şartname | `docs/REVIZYON.md` (629 satır) |
| Hedef katalog | **244 sayfa ailesi** — `manifest/screen-manifest.json` |
| Aktif dal | `revizyon/faz-0-6` |
| Faz durumu | Faz 0 kapandı · Faz 1 devam |
| İlerleme | `PROGRESS.md` · Plan: `PLAN.md` · Kararlar: `KARARLAR.md` |

## Çalıştırma

Bağımlılık kurulumu ve build adımı **yoktur**; yalnız Node.js 22+ gerekir.

```bash
node --version        # >= 22.5
npm test              # tüm testler (node:test)
npm run manifest      # screen-manifest + envanter + PROGRESS.md yeniden üretimi
npm run baslat        # uygulamayı başlat
```

## Mimari

Modüler monolit, sıfır npm bağımlılığı (`node:http`, `node:sqlite`, `node:crypto`,
`node:zlib`, `node:test`). Sunucu tarafı render + progressive enhancement. Yetki sunucuda
doğrulanır (RBAC + ABAC); para tamsayı minor unit + para birimi; zaman UTC saklanır.
Gerekçeler `KARARLAR.md`'de.

Modül sınırları: kimlik-yetki · proje-şantiye · iş akışı · doküman · satın alma-stok ·
sözleşme-hakediş · finans · İK · kartlar · varlık · rapor · entegrasyon.

## Dizinler

| Yol | İçerik |
| --- | --- |
| `app/` | Uygulama — çekirdek, modüller, sunucu render web katmanı |
| `manifest/` | Üretilen ekran manifestosu, eski→hedef eşleme, iş durumu |
| `tools/` | Manifest ve envanter üreteçleri (elle yazılan dosya üretmez) |
| `tests/` | Birim, entegrasyon ve kabul testleri (`tests/kabul/` = şartname §11) |
| `raporlar/` | Faz raporları: kırık link, yetkisiz erişim, veri tutarlılığı, çıktı doğrulama |
| `v2/` | **ARŞİV** — statik prototip; yalnız görsel referans, geliştirme yapılmaz |

## Katkı kuralları

`CLAUDE.md`'deki 10 değişmez kural ve §12 üretime çıkış engelleri bağlayıcıdır.
Ekran eklemek `manifest/screen-manifest.json`'ı elle düzenlemek değildir — kaynak
`docs/REVIZYON.md` §4'tür ve manifest ondan üretilir.
