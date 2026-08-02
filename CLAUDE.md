# GaviaCRM — İnşaat CRM/ERP Statik Prototip

## Proje Kimliği

**GaviaCRM**, inşaat firmaları için şantiye, personel, görev, kasa, puantaj, malzeme talebi,
satın alma, hakediş ve sözleşme süreçlerini tek merkezden yöneten kiralanabilir (SaaS)
CRM/ERP platformunun **statik, tıklanabilir UI prototipidir**. Gaviaworks tarafından
geliştirilmektedir; müşteri onayı ve ürün tasarım kararları için kullanılır.

**Bu repo SADECE arayüz prototipidir:**
- Backend YOK, veritabanı YOK, gerçek auth YOK. Her şey statik HTML + CSS + vanilla JS.
- Mock veri sayfaların içine ve küçük JS objelerine gömülüdür (JSON backend simülasyonu yok).
- GitHub Pages'te yayınlanır: https://by4r.github.io/gaviacrm-view/
- Build adımı YOK (buildless). CDN + el yazımı CSS/JS. `npm install` gerektiren hiçbir şey eklenmez.

**Kapsam: SADECE FAZ 1** (operasyon çekirdeği). Faz 2 (CRM/satış/ERP) ve Faz 3 (AI/SaaS)
modülleri İNŞA EDİLMEZ; ancak mimari (token yapısı, sidebar bölüm yapısı, rol sistemi,
dosya adlandırma) bu fazları ileride ekleyebilecek şekilde genişletilebilir tutulur.
Detaylı envanter: `tasks/plan.md` (yerel, commit edilmez).

**Kesinleşen ürün kararları (2026-07):**
- Ürün adı SABİT: **"Gavia CRM"**; logo/marka Gaviaworks kimliği (tipografik "G" mark).
- Palet KESİN: Gaviaworks lacivert + mint. Turuncu/sarı İSG tonları KULLANILMAZ.
- Demo personaları: **superadmin (Gavia Platform Yöneticisi) + sahip (Firma Sahibi)**
  öncelikli; index bu ikisini öne çıkarır, default `superadmin`. Kiralanabilirlik hissi
  tenant-admin konsoluyla verilir (Ayarlar > Firma: paket/limit/modül aç-kapa);
  tenant-switcher Faz 2 — superadmin topbar'ında PASİF çip olarak yer tutar.
- Rail 9 bölüm: panel, santiye, gorev, personel, operasyon, satinalma, **cari**
  (Firma Rehberi + Kişiler + Cari Durum; satış pipeline'ı Faz 2 kilitli sekme), finans, ayarlar.
- Dil: TR varsayılan; topbar'da PASİF dil düğmesi (TR çipi, kilitli — çok-dil Faz 2+).
  Shell/menü/rol metinleri `shell.js` config'inde tek yerden yönetilir (i18n'e hazır).
- Mobil first-class: web + mobil eşit önemde; 390px SS-eval zorunlu.
- Mock tenant: "Yapıtaş İnşaat A.Ş." (tamamen kurgusal) — kanonik isim listesi shell.js
  üstündeki yorum bloğunda; tüm sayfalar aynı adları kullanır.

## Gizlilik — KRİTİK

Repo **PUBLIC**. Patron brief'i / kaynak dokümanlar (`~/Desktop/GaviaCRM Sources`) ve
onlardan türetilen planlama dokümanları (`tasks/`, `docs/brief/`) **ASLA commit edilmez**
— `.gitignore` bunu zorlar; yeni dosya eklerken kontrol et. Müşteri adı, gerçek kişi/firma
bilgisi, ticari detay hiçbir commit'e girmez. Mock veriler tamamen kurgusaldır.

## Git İzin Kuralı — ŞART

İlk repo bootstrap'i (repo + Pages + iskelet) dışında **hiçbir commit/push Beyar'ın açık
onayı olmadan yapılmaz.** Agent'lar working tree'de serbestçe dosya üretir; commit/push
kararı her zaman Beyar'a sorulur. Bu kural teammate/subagent'lar için de geçerlidir.

**Aktif dalga sürecinde `git clean` çalıştırılmaz** — `tasks/` altındaki gitignored
doğrulama dosyaları (`kordon.md`, `handoff.md`) kaybolur. Bu dosyalar izlenmediği için
commit'ten geri getirilemez; kaybolurlarsa dalga sonu doğrulaması dayanaksız kalır.

### Yıkıcı git komutu YASAĞI — teammate/subagent'lar için MUTLAK

**Agent teammate'ler yıkıcı git komutu ÇALIŞTIRAMAZ.** Yasak, istisnasız:

| YASAK | | İZİNLİ |
|---|---|---|
| `git stash` (ve `stash pop`/`stash apply`) | | `git add` |
| `git reset` (her biçimi) | | `git diff` |
| `git clean` | | `git status` |
| `git checkout -- <dosya>` | | `git commit` (yalnız lead) |
| `git restore` | | `git log`, `git show` (okuma) |

Taban/karşılaştırma gerekiyorsa `git show HEAD:<dosya>` veya `git diff` kullanılır;
ikisi de working tree'ye dokunmaz. `git worktree` de güvenlidir.

**Gerekçe (2026-08-02, v3 revizyon turu):** Bir teammate, tablet taramasını tabanla
karşılaştırmak için `git stash` + `stash pop` çalıştırdı; pop, sahibi olmadığı bir
dosyada çakıştı ve **aynı anda çalışan üç ajanın işini working tree'den sildi** —
10 dosya, hepsi yeniden yapıldı. Yasak o turda yalnız prompt'ta duruyordu; prompt
kuralı ajan bazında delinebildiği için kural buraya, depoya taşındı.
Paralel ajan varken working tree paylaşılan bir kaynaktır: bir ajanın onu
sıfırlaması diğerlerinin işini sessizce yok eder.
Olay kaydı: `tasks/lessons.md`.

## Referans UI Dili

Yapı, layout, etkileşim ve component dili şu referanstan devralınır:
`~/Developer/Projects/dadamutfak/v7-6cu356/sa-shell.html`
(canlı: https://by4r.github.io/dadamutfak-view/v7-6cu356/sa-shell.html?role=super)

Devralınan pattern'lar:
- **Buildless stack:** vanilla CSS + vanilla JS, Font Awesome 6.5.2 CDN (kilitli ikon seti),
  self-host/Google Fonts. Framework yok, Tailwind yok, build yok.
- **Çift-sidebar shell:** sol ikon rail (bölümler) + ikinci sidebar (aktif bölümün modül
  menüsü, JS ile render) + beyaz içerik alanı + sabit topbar (arama, bildirim zili, persona
  chip'i). Divider grip ile menü katlanır, `localStorage`'da kalıcı.
- **Shared-asset MPA:** her ekran kendi kendine yeten ayrı `.html` dosyası; ortak
  `assets/css/*.css` + `assets/js/*.js` paylaşılır. Navigasyon gerçek `href` linkleriyle
  tam sayfa geçiş. Sayfa kimliği `body[data-sec]` + `body[data-screen]` ile.
- **Rol simülasyonu:** `?role=` query param → `localStorage` → default. JS `ROLES` config'i
  rail görünürlüğünü budar, persona chip'ini yazar, yetkisiz bölümü rolün landing'ine
  yönlendirir. Client-side RBAC simülasyonu.
- **`--acc` accent-token mimarisi:** tüm componentler `var(--acc)` / `rgba(var(--acc-rgb),…)`
  kullanır; bölüm/marka bazlı yeniden renklendirme 3 değişkenle olur.
- **Component seti:** KPI kartları, `.pnl-card`, filtre bar'ı + chip'ler, durum rozetleri
  (semantik renkler accent'ten BAĞIMSIZ sabit), tablo/liste pattern'ı, toast, confirm modal,
  empty state, hesap dropdown'u. Yıkıcı aksiyonlarda global confirm interception.
- **Etkileşim dili:** tek easing eğrisi, hover lift (−2px + gölge), accent focus ring,
  980px/640px responsive kırılımları (mobilde off-canvas drawer).

Dosya adlandırma: `crm-{bolum}-{modul}[-detay|-form].html` (referanstaki
`sa-{section}-{module}` konvansiyonunun uyarlaması).

## Gaviaworks Marka Paleti

Renkler gaviaworks.com canlı CSS'inden (`/gavia/assets/css/brand.css`) birebir alınmıştır
— TAHMİN ETME, kaynak bu:

```css
--gavia-deep:   #020837;  /* en koyu lacivert — rail zemini */
--gavia-night:  #141533;  /* koyu lacivert — menü zemini */
--gavia-dark:   #0A0E27;  /* koyu yüzey */
--gavia-mint:   #3FD5AD;  /* ana accent */
--gavia-mint-bright: #4FE5BD;
--gavia-mint-glow: rgba(63, 213, 173, 0.12);
--gavia-light:  #E9EEF1;  /* koyu zeminde metin */
--gavia-muted:  #6B7280;
--gavia-border: #1F2740;
```

- Font: **Manrope** (400/500/700/800, Google Fonts) — gaviaworks.com ile aynı.
- Kimlik dark-first'tür; CRM içerik alanı **açık zemin** çalışır: sidebar katmanları
  dark (deep/night), içerik light. Design-token dosyası HEM dark HEM light nötr skalayı
  tanımlar (`assets/css/tokens.css`).
- Mint, beyaz zeminde metin/buton için kontrast yetersiz kalabilir; açık zeminde
  koyulaştırılmış türev accent kullanılır (token dosyasında tanımlı, onaya sunulmuş).
- dadamutfak paleti (domates/krem/Gilroy) KULLANILMAZ — sadece yapı devralınır.

## Görsel Kurallar (cross-project, ZORUNLU)

- Görsel boyutlarında **CSS render genişliği esastır**; 2x retina çarpması YAPILMAZ.
  (Örn. 400px genişlik render edilecekse 400px kaynak istenir/üretilir, 800px değil.)
- **Kare/oranlı görseller `<img>` ile DEĞİL**, `div` + `background-image` +
  `background-size: cover` + `background-position: center` ile konur.
- Placeholder görsellerde de aynı kural geçerli; bozuk oran/taşma kabul edilmez.

## Agent-Team Workflow

### Pilot-first, sonra ölçek
1. Önce **shell + 1 temsili pilot sayfa** üretilir.
2. **Beyar görsel onayı** alınır (bu bir kalite kapısıdır, atlanamaz).
3. Onaydan SONRA modül bazlı paralel çoğaltmaya geçilir.

### Domain separation
- Her teammate **ayrı HTML modül dosyaları** sahiplenir; aynı dosyaya iki agent asla yazmaz.
- Ortak shell + design system dosyaları (`assets/css/*`, `assets/js/*`, token dosyası)
  **tek sahiptedir** ve pilot onayından sonra **kilitlenir**: değişiklik ihtiyacı sahibine
  bildirilir, sahibi uygular.
- Sahiplik tablosu `tasks/plan.md`'de tutulur.

### Targeted edit only
- Ortak dosyalarda **full-file overwrite YASAK** (lost-update önleme). Sadece hedefli
  `Edit` (string replace) kullanılır. Kendi sahiplendiğin yeni sayfa dosyasını
  ilk üretimde `Write` ile yazmak serbesttir.

### frontend-design skill ZORUNLU
- Her UI teammate, sayfa üretimi/polish sırasında **frontend-design skill'ini kullanmak
  zorundadır** (whitespace ritmi, tipografik ölçek, kart kompozisyonu, template-default
  görünümden kaçınma). Bu bir öneri değil şarttır; teammate prompt'larına yazılır.

### Screenshot-eval döngüsü (done tanımı)
Bir sayfaya "done" denmeden önce:
1. Playwright ile sayfanın **anahtar state'lerinin** ekran görüntüsü alınır
   (desktop 1440px + mobil 390px; varsa farklı rol/tab/boş-dolu state'ler).
2. Görüntüler şu rubriğe + referans UI'ye göre öz-değerlendirilir:
   - Görsel hiyerarşi ve whitespace ritmi
   - Tipografik ölçek tutarlılığı
   - Kontrast / erişilebilirlik (WCAG AA hedef)
   - Component tutarlılığı (token ve pattern'lara sadakat)
   - Referans UI diline sadakat (shell, etkileşim, yoğunluk)
   - Gaviaworks marka tutarlılığı (palet, font, ton)
3. Eksikler düzeltilir, gerekirse tekrar SS alınır; sonra "done" denir.

## Dizin Yapısı

```
gaviacrm/
├── CLAUDE.md              # bu dosya
├── index.html             # giriş / rol seçimi (Pages kökü)
├── crm-*.html             # ekranlar (bolum-modul[-detay|-form])
├── assets/
│   ├── css/               # tokens.css, shell.css, ui.css …
│   └── js/                # shell.js, ui.js …
├── tasks/                 # (GİTİGNORE) research.md, plan.md, handoff.md,
│                          #  lessons.md, patron-questions.md
├── docs/brief/            # (GİTİGNORE) kaynak doküman kopyaları
└── .claude/
    ├── commands/          # ör. /ss-eval
    └── agents/            # teammate tanımları (plan onayından sonra)
```

## Çalışma Kuralları Özeti

1. Faz 1 dışına çıkma; Faz 2/3 için sadece genişleme noktası bırak.
2. Türkçe UI metinleri; sade, sektörün diliyle (şantiye, hakediş, puantaj, cari…).
3. Her sayfa `?role=` simülasyonuna saygılı olmalı (yetkisiz içerik gizlenir).
4. Bootstrap dışında commit/push için Beyar onayı ŞART.
5. Hassas brief içeriği repoya girmez; mock veriler kurgusal.
6. Deploy: push sonrası `gh api` Pages build polling YAPILMAZ; Beyar tarayıcıdan
   doğrular. Sadece "push OK, Pages ~1-3 dk sonra canlı" de ve geç.
