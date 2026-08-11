# GaviaBuild — Bütünleşik İnşaat ve Şantiye Operasyonları Yönetim Platformu

## Ürün Kimliği

**Bu ürün bir CRM DEĞİLDİR.** Kategorisi: *Bütünleşik İnşaat ve Şantiye Operasyonları
Yönetim Platformu*. Şirket, proje ve şantiye süreçlerini **aynı veri omurgasında** yöneten
üretim seviyesi bir uygulamadır. Çalışma adı **GaviaBuild**; nihai marka verilene kadar
kullanıcıya görünen her yerde **`[ÜRÜN ADI]`** kullanılır. Kod, arayüz, rota, sınıf adı,
yorum, test ve dokümanda "CRM" ifadesi geçmez.

**Bağlayıcı şartname:** `docs/REVIZYON.md` (629 satır) — uygulama talimatı ve kabul
şartnamesidir. Ek bağlam: `docs/REVIZYON-video-20260805.md`. Çelişki halinde **daha
kısıtlayıcı güvenlik/veri bütünlüğü kuralı** geçerlidir.

## Her Oturumun İlk İşi

Şu üç dosya okunmadan iş yapılmaz; iş bittikçe güncellenir:

| Dosya | İçerik |
| --- | --- |
| `PLAN.md` | Faz faz iş kırılımı, hedef kodlar, çıkış koşulları |
| `PROGRESS.md` | 244 sayfa ailesinin durum tablosu (**üretilen dosya** — kaynak `manifest/durum.json`) |
| `KARARLAR.md` | Her mimari/stack/isimlendirme kararı + gerekçe + tarih |

**Asla baştan başlanmaz; kaldığı yerden devam edilir.**

## Değişmez Kurallar — ihlal edilirse iş kabul edilmez

1. Tek `screen-manifest`: menü, rota, breadcrumb, yetki, özellik bayrağı, analitik olayı ve
   testler `manifest/screen-manifest.json`'dan türer. Bu dosya **elle yazılmaz**, üretilir.
2. `localStorage` / `sessionStorage` / query parametresi **rol, tenant veya yetki kaynağı
   değildir**. Yetki ve tenant/proje/şantiye kapsamı sunucuda doğrulanır (RBAC + ABAC).
3. **Sahte başarı bildirimi yok.** Her eylem gerçek API sonucu, gerçek hata kodu ve geri
   döndürülebilir sonuç üretir.
4. Liste, form, detay, rapor ve çıktı **tek kanonik kayıt/API** kullanır. Aynı örnek dizi
   birden çok sayfaya kopyalanmaz.
5. Kullanıcı **onay durumunu, nihai durumu veya keyfi onaycıyı seçemez**. Durum = merkezi
   geçiş motoru; onaycı = sürümlü politika.
6. **Onaylı kayıt yerinde değiştirilmez**; revizyon açılır, önceki sürüm ve karar geçmişi korunur.
7. Finans, stok ve kart bakiyeleri elle yazılan sayı değildir; **değişmez hareket defterinden**
   türetilir ve ters kayıtla düzeltilir.
8. Tüm kritik yazmalarda **idempotency key + optimistic concurrency (version) + audit**.
9. Tüm raporlar tek `ReportLayout`: filtre özeti, veri tarihi, rapor sürümü, açıklanmış KPI
   formülü, PDF/Excel/CSV, print CSS. **Ekran = PDF = Excel.**
10. Para: **tamsayı minor unit + para birimi**. Zaman: **UTC** saklanır, kullanıcı saat
    diliminde gösterilir. Her kayıtta `created_by/at`, `updated_by/at`, `version`, `status`,
    `tenant_id` ve bağlam kimlikleri.

## Mimari

Modüler monolit, **Node.js 22+**, **sıfır npm bağımlılığı** (yalnız `node:*` yerleşikleri —
`node:http`, `node:sqlite`, `node:crypto`, `node:zlib`, `node:test`). Build adımı yok,
`npm install` yok. Gerekçeler: `KARARLAR.md` K-002..K-011.

```
gaviabuild/
├── PLAN.md · PROGRESS.md · KARARLAR.md    # çalışma protokolü (her oturum okunur)
├── docs/REVIZYON.md                        # bağlayıcı şartname
├── manifest/
│   ├── screen-manifest.json                # ÜRETİLEN — 244 sayfa ailesi, tek kaynak
│   ├── eski-eslesme.json                   # ÜRETİLEN — eski ekran → hedef karar
│   └── durum.json                          # iş durumu (elle güncellenen tek durum kaynağı)
├── app/                                    # uygulama (modüler monolit)
│   ├── cekirdek/                           # http, db, hata, kimlik üretimi, para, zaman, audit
│   ├── moduller/                           # kimlik, isakisi, dokuman, proje, santiye, plan,
│   │                                       #  gorev, isg, kalite, satinalma, stok, sozlesme,
│   │                                       #  finans, ik, kartlar, varlik, rapor, entegrasyon
│   └── web/                                # sunucu render kabuk + ortak sayfa bileşenleri
├── tests/                                  # node:test — birim, entegrasyon, kabul (§11)
├── tools/                                  # manifest ve envanter üreteçleri
├── raporlar/                               # faz raporları (kırık link, yetki, veri, çıktı)
└── v2/                                     # ARŞİV — statik prototip, salt okunur görsel referans
```

Modül sınırları (doküman §8): kimlik-yetki · proje-şantiye · iş akışı · doküman ·
satın alma-stok · sözleşme-hakediş · finans · İK · kartlar · varlık · rapor · entegrasyon.

## Faz Sırası (doküman §9 — bozulmaz)

| Faz | Kapsam | Çıkış koşulu |
| --- | --- | --- |
| 0 | Envanter ve yönlendirme | ✅ screen-manifest + 244 yol kararı + link testi |
| 1 | Temel platform | Tüm API'lerde sunucu yetkisi; demo rol seçimi üretimde kapalı |
| 2 | İş akışı omurgası | Formdan durum/onaycı seçilemiyor |
| 3 | Proje ve saha | `/projeler/yeni` 200; WBS tabanlı ilerleme; günlük rapor PDF |
| 4 | Tedarik ve finans | Üçlü eşleştirme; değişmez stok/finans defteri |
| 5 | Kartlar | Sağlayıcı bağımsız model; idempotent gönderim; mutabakat |
| 6 | Rapor, mobil, portallar | Filtre/sürüm tutarlı PDF/Excel; kapsam testleri |

Commit biçimi: `faz<N>(<KOD>): <ne yapıldı>` · Faz sonu tag: `faz-<N>-tamam` ·
Dal: `revizyon/faz-0-6` · Her faz sonunda `raporlar/faz-<N>-rapor.md` üretilir.

## Üretime Çıkış Engelleri (§12) — biri varsa faz kapanmaz

- P0 rotada 404, WIP bağlantısı, yalnızca toast üreten işlem veya localStorage tabanlı iş kaydı
- Kullanıcının query parametresi/istemci deposuyla rol, tenant, proje veya onay durumu değiştirebilmesi
- Onaylı sözleşme/bütçe/iş programı/hakediş/yükleme partisinin sürüm açmadan düzenlenebilmesi
- Stok, finans veya kart bakiyesinin hareket defterinden yeniden üretilememesi
- Pluxee/MultiNet gönderiminde idempotency, durum sorgusu veya kısmi sonuç yönetiminin eksikliği
- Rapor PDF/Excel çıktısının ekran filtresi, veri tarihi veya toplamlarıyla uyuşmaması
- Kritik işlemde audit, yetki testi, hata/retry ekranı veya kişisel veri maskelemesinin eksikliği

## Gizlilik — KRİTİK

Repo **PUBLIC**. Kaynak brief'ler ve onlardan türetilen planlama dokümanları (`tasks/`,
`docs/brief/`) **ASLA commit edilmez** — `.gitignore` bunu zorlar. Müşteri adı, gerçek
kişi/firma bilgisi, ticari detay hiçbir commit'e girmez. Mock tenant "Yapıtaş İnşaat A.Ş."
tamamen kurgusaldır; seed/demo veri gerçek API üzerinden üretilir ve `DEMO` etiketi taşır.

## Git Kuralı

Bootstrap dışında commit/push **Beyar'ın açık onayıyla** yapılır. Revizyon turu (Faz 0-6)
için bu onay verilmiştir: her tamamlanan iş paketi commit + push edilir, her faz tag'lenir.

### Yıkıcı git komutu YASAĞI — teammate/subagent'lar için MUTLAK

| YASAK | İZİNLİ |
| --- | --- |
| `git stash` / `stash pop` / `stash apply` | `git add`, `git commit` (yalnız lead) |
| `git reset` (her biçimi) | `git diff`, `git status`, `git log`, `git show` |
| `git clean`, `git restore`, `git checkout -- <dosya>` | `git worktree` |

Taban karşılaştırması için `git show HEAD:<dosya>` veya `git diff` kullanılır; ikisi de
working tree'ye dokunmaz. **Gerekçe (2026-08-02):** bir teammate'in `git stash pop`'u aynı
anda çalışan üç ajanın işini working tree'den sildi (10 dosya). Paylaşılan working tree'de
bir ajanın sıfırlaması diğerlerinin işini sessizce yok eder.

## Görsel Dil

`docs/REVIZYON.md` §2'deki sayfa dili korunur: sol ikon rayı + bağlamsal ikinci menü,
üst bar (arama, onay kutusu, bildirim, şirket/proje/şantiye seçici, kullanıcı menüsü),
tıklanabilir breadcrumb, `eyebrow + H1 + tek satır açıklama` page-head, liste/form/detay/
rapor kalıpları, mobilde tek kolon + kart görünümü. Görsel referans: `v2/` (ARŞİV).
**Kopyalanmayacaklar:** demo veri, `?role=` rol seçimi, sahte başarı bildirimleri,
`localStorage` iş kuralları.

### Gaviaworks marka paleti

gaviaworks.com canlı CSS'inden birebir (`v2/assets/css/tokens.css` içinde tanımlı):

```css
--gv-deep:#020837;  --gv-night:#141533;  --gv-dark:#0A0E27;
--gv-mint:#3FD5AD;  --gv-mint-bright:#4FE5BD;  --gv-mint-glow:rgba(63,213,173,.12);
--gv-light:#E9EEF1; --gv-border-dark:#1F2740;
--acc-ink:#0E8C6D;  /* açık zeminde erişilebilir mint türevi */
```

Font **Manrope** (400/500/700/800). Kimlik dark-first; sidebar katmanları dark (deep/night),
içerik alanı light. Semantik durum renkleri accent'ten **bağımsız sabittir**.

### Görsel kuralları (zorunlu)

- Görsel boyutlarında **CSS render genişliği esastır**; 2x retina çarpması yapılmaz.
- Kare/oranlı görseller `<img>` ile değil, `div` + `background-image` + `background-size:cover`
  + `background-position:center` ile konur. Placeholder'da da aynı kural geçerlidir.

## Kalite Kapıları

- **frontend-design skill zorunlu:** her UI üretimi/polish'inde kullanılır (whitespace ritmi,
  tipografik ölçek, kart kompozisyonu, template-default görünümden kaçınma).
- **Screenshot-eval:** bir sayfaya "done" denmeden önce anahtar state'lerin SS'i alınır
  (desktop 1440px + mobil 390px), görsel hiyerarşi / tipografik ölçek / kontrast (WCAG AA) /
  component tutarlılığı / referans dile sadakat / marka tutarlılığı rubriğine göre değerlendirilir.
- **Test:** her modül için birim, entegrasyon, yetki, durum geçişi, idempotency, erişilebilirlik
  ve uçtan uca test. Doküman §11'deki kabul testlerinin **hepsi** `tests/kabul/` altında otomatiktir.
- **Domain separation:** her teammate ayrı dosya sahiplenir; ortak dosyalarda **full-file
  overwrite yasak**, yalnız hedefli `Edit`.
