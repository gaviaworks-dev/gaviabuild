/* ============================================================================
   GÖÇ G003 — proje ve saha (Faz 3)
   proje · şantiye · WBS · iş programı · aktivite · ilerleme · görev ·
   günlük şantiye raporu · saha bildirimi · İSG olayı · kalite (NCR/DÖF)
   ========================================================================== */

export const GOCLER_3 = [
{ ad: 'G003_proje_ve_saha', sql: `

/* ---- Proje portföyü (PRJ-01..10) --------------------------------------- */
CREATE TABLE proje (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenant(id),
  sirket_id      TEXT REFERENCES sirket(id),
  kod            TEXT NOT NULL,
  ad             TEXT NOT NULL,
  isveren        TEXT,
  tur            TEXT,
  adres          TEXT, il TEXT, ilce TEXT,
  baslangic      INTEGER, planlanan_bitis INTEGER, gercek_bitis INTEGER,
  sozlesme_bedeli_minor INTEGER, sozlesme_bedeli_birim TEXT DEFAULT 'TRY',
  butce_minor    INTEGER, butce_birim TEXT DEFAULT 'TRY',
  sorumlu_id     TEXT REFERENCES kullanici(id),
  aciklama       TEXT,
  durum          TEXT NOT NULL DEFAULT 'taslak',
  surum          INTEGER NOT NULL DEFAULT 1,
  olusturan      TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen    TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod)
);
CREATE INDEX ix_proje_durum ON proje (tenant_id, durum);

CREATE TABLE proje_riski (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant(id),
  proje_id    TEXT NOT NULL REFERENCES proje(id) ON DELETE CASCADE,
  baslik      TEXT NOT NULL,
  aciklama    TEXT,
  olasilik    INTEGER NOT NULL,
  etki        INTEGER NOT NULL,
  sahip_id    TEXT REFERENCES kullanici(id),
  aksiyon     TEXT,
  durum       TEXT NOT NULL DEFAULT 'acik',
  surum       INTEGER NOT NULL DEFAULT 1,
  olusturan   TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen TEXT, guncellendi INTEGER,
  CHECK (olasilik BETWEEN 1 AND 5), CHECK (etki BETWEEN 1 AND 5),
  CHECK (durum IN ('acik','izleniyor','kapali'))
);

CREATE TABLE proje_paydasi (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant(id),
  proje_id    TEXT NOT NULL REFERENCES proje(id) ON DELETE CASCADE,
  tur         TEXT NOT NULL,
  unvan       TEXT NOT NULL,
  kisi        TEXT, telefon TEXT, eposta TEXT,
  rol_tanimi  TEXT,
  olusturan   TEXT, olusturuldu INTEGER NOT NULL,
  CHECK (tur IN ('isveren','musavir','taseron','kurum','tedarikci','diger'))
);

/* ---- Şantiye (SITE-01..16) ---------------------------------------------- */
CREATE TABLE santiye (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenant(id),
  proje_id       TEXT NOT NULL REFERENCES proje(id),
  kod            TEXT NOT NULL,
  ad             TEXT NOT NULL,
  adres          TEXT, il TEXT, ilce TEXT,
  enlem          TEXT, boylam TEXT,
  baslangic      INTEGER, planlanan_bitis INTEGER, gercek_bitis INTEGER,
  sef_id         TEXT REFERENCES kullanici(id),
  maliyet_merkezi TEXT,
  durum          TEXT NOT NULL DEFAULT 'taslak',
  surum          INTEGER NOT NULL DEFAULT 1,
  olusturan      TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen    TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod)
);
CREATE INDEX ix_santiye_proje ON santiye (proje_id);

/* ---- İş programı ve WBS (PLAN-01..12) ----------------------------------
   Baz çizgi onaylandığında program DONDURULUR; değişiklik yeni sürüm açar.  */
CREATE TABLE is_programi (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenant(id),
  proje_id       TEXT NOT NULL REFERENCES proje(id),
  santiye_id     TEXT REFERENCES santiye(id),
  kod            TEXT NOT NULL,
  ad             TEXT NOT NULL,
  surum_no       INTEGER NOT NULL DEFAULT 1,
  baz_cizgi      INTEGER NOT NULL DEFAULT 0,
  baz_cizgi_tarih INTEGER,
  calisma_gunleri TEXT NOT NULL DEFAULT '1,2,3,4,5,6',
  baslangic      INTEGER, bitis INTEGER,
  durum          TEXT NOT NULL DEFAULT 'taslak',
  surum          INTEGER NOT NULL DEFAULT 1,
  olusturan      TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen    TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod, surum_no),
  CHECK (durum IN ('taslak','onaya_gonderildi','incelemede','revizyon_istendi','onaylandi','reddedildi','iptal'))
);

/* WBS düğümü: ağırlıklar KARDEŞLER ARASINDA yüzde 100 olmalı (PLAN-01).     */
CREATE TABLE wbs (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  program_id   TEXT NOT NULL REFERENCES is_programi(id) ON DELETE CASCADE,
  ust_id       TEXT REFERENCES wbs(id) ON DELETE CASCADE,
  kod          TEXT NOT NULL,
  ad           TEXT NOT NULL,
  agirlik      INTEGER NOT NULL DEFAULT 0,
  seviye       INTEGER NOT NULL DEFAULT 1,
  sorumlu_id   TEXT REFERENCES kullanici(id),
  maliyet_kodu TEXT,
  surum        INTEGER NOT NULL DEFAULT 1,
  olusturan    TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen  TEXT, guncellendi INTEGER,
  UNIQUE (program_id, kod),
  CHECK (agirlik >= 0 AND agirlik <= 10000)
);
CREATE INDEX ix_wbs_ust ON wbs (program_id, ust_id);

CREATE TABLE aktivite (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  program_id    TEXT NOT NULL REFERENCES is_programi(id) ON DELETE CASCADE,
  wbs_id        TEXT NOT NULL REFERENCES wbs(id) ON DELETE CASCADE,
  kod           TEXT NOT NULL,
  ad            TEXT NOT NULL,
  yontem        TEXT NOT NULL DEFAULT 'miktar',
  birim         TEXT,
  planlanan_miktar TEXT,
  agirlik       INTEGER NOT NULL DEFAULT 0,
  baslangic     INTEGER, bitis INTEGER, sure_gun INTEGER,
  onculler      TEXT,
  sorumlu_id    TEXT REFERENCES kullanici(id),
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (program_id, kod),
  CHECK (yontem IN ('miktar','kilometre_tasi','sure')),
  CHECK (agirlik >= 0 AND agirlik <= 10000)
);

/* İlerleme kaydı: ONAY GÖRMEDEN proje ilerlemesine katılmaz (PLAN-02).      */
CREATE TABLE ilerleme (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenant(id),
  aktivite_id    TEXT NOT NULL REFERENCES aktivite(id) ON DELETE CASCADE,
  program_id     TEXT NOT NULL REFERENCES is_programi(id),
  santiye_id     TEXT REFERENCES santiye(id),
  proje_id       TEXT REFERENCES proje(id),
  donem          TEXT NOT NULL,
  miktar         TEXT,
  yuzde_binde    INTEGER NOT NULL,
  kanit          TEXT,
  aciklama       TEXT,
  durum          TEXT NOT NULL DEFAULT 'taslak',
  dogrulayan     TEXT REFERENCES kullanici(id),
  dogrulandi     INTEGER,
  surum          INTEGER NOT NULL DEFAULT 1,
  olusturan      TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen    TEXT, guncellendi INTEGER,
  CHECK (yuzde_binde BETWEEN 0 AND 100000),
  CHECK (durum IN ('taslak','onaya_gonderildi','incelemede','revizyon_istendi','onaylandi','reddedildi','iptal'))
);
CREATE INDEX ix_ilerleme_aktivite ON ilerleme (aktivite_id, durum);

/* ---- Görev (TASK-01..09) ------------------------------------------------ */
CREATE TABLE gorev (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  kod          TEXT NOT NULL,
  baslik       TEXT NOT NULL,
  aciklama     TEXT,
  proje_id     TEXT REFERENCES proje(id),
  santiye_id   TEXT REFERENCES santiye(id),
  ust_id       TEXT REFERENCES gorev(id),
  sorumlu_id   TEXT REFERENCES kullanici(id),
  oncelik      TEXT NOT NULL DEFAULT 'normal',
  termin       INTEGER,
  bloke        INTEGER NOT NULL DEFAULT 0,
  bloke_nedeni TEXT,
  kaynak_nesne TEXT, kaynak_id TEXT,
  durum        TEXT NOT NULL DEFAULT 'taslak',
  surum        INTEGER NOT NULL DEFAULT 1,
  olusturan    TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen  TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (oncelik IN ('dusuk','normal','yuksek','kritik')),
  CHECK (durum IN ('taslak','atama_bekliyor','acik','devam_ediyor','dogrulamada','tamamlandi','iptal'))
);
CREATE INDEX ix_gorev_sorumlu ON gorev (tenant_id, sorumlu_id, durum);

CREATE TABLE gorev_yorumu (
  id          TEXT PRIMARY KEY,
  gorev_id    TEXT NOT NULL REFERENCES gorev(id) ON DELETE CASCADE,
  kullanici_id TEXT NOT NULL REFERENCES kullanici(id),
  metin       TEXT NOT NULL,
  olusturuldu INTEGER NOT NULL
);

/* ---- Günlük şantiye raporu (SITE-06..08) -------------------------------
   Çevrimdışı taslak + senkron kuyruğu: istemci bir istemci_kimligi üretir,
   sunucu bu anahtarla MÜKERRER kaydı engeller (SITE-01 kabul testi).        */
CREATE TABLE gunluk_rapor (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenant(id),
  santiye_id      TEXT NOT NULL REFERENCES santiye(id),
  proje_id        TEXT REFERENCES proje(id),
  kod             TEXT NOT NULL,
  rapor_gunu      TEXT NOT NULL,
  hava            TEXT, sicaklik TEXT, calisma_durumu TEXT,
  ekip_sayisi     INTEGER, taseron_sayisi INTEGER,
  imalat          TEXT, makine TEXT, ziyaretci TEXT, olay TEXT, notlar TEXT,
  istemci_kimligi TEXT,
  kilit           INTEGER NOT NULL DEFAULT 0,
  durum           TEXT NOT NULL DEFAULT 'taslak',
  surum           INTEGER NOT NULL DEFAULT 1,
  olusturan       TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen     TEXT, guncellendi INTEGER,
  UNIQUE (santiye_id, rapor_gunu),
  UNIQUE (tenant_id, istemci_kimligi),
  CHECK (durum IN ('taslak','onaya_gonderildi','incelemede','revizyon_istendi','onaylandi','reddedildi','iptal'))
);
CREATE INDEX ix_gunluk_santiye ON gunluk_rapor (santiye_id, rapor_gunu);

/* ---- Saha bildirimi (SITE-09..11) --------------------------------------- */
CREATE TABLE saha_bildirimi (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  santiye_id   TEXT NOT NULL REFERENCES santiye(id),
  proje_id     TEXT REFERENCES proje(id),
  kod          TEXT NOT NULL,
  tur          TEXT NOT NULL,
  baslik       TEXT NOT NULL,
  aciklama     TEXT,
  konum        TEXT,
  onem         TEXT NOT NULL DEFAULT 'bilgi',
  sorumlu_id   TEXT REFERENCES kullanici(id),
  sla_bitis    INTEGER,
  hedef_nesne  TEXT, hedef_id TEXT,
  durum        TEXT NOT NULL DEFAULT 'yeni',
  surum        INTEGER NOT NULL DEFAULT 1,
  olusturan    TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen  TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (tur IN ('isg','kalite','teknik','lojistik','cevre','diger')),
  CHECK (onem IN ('bilgi','uyari','kritik')),
  CHECK (durum IN ('yeni','siniflandirildi','atandi','islemde','dogrulamada','kapali','iptal'))
);

/* ---- İSG (HSE-01..12) --------------------------------------------------- */
CREATE TABLE isg_olayi (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenant(id),
  santiye_id     TEXT REFERENCES santiye(id),
  proje_id       TEXT REFERENCES proje(id),
  kod            TEXT NOT NULL,
  tur            TEXT NOT NULL,
  baslik         TEXT NOT NULL,
  olay_zamani    INTEGER NOT NULL,
  yer            TEXT,
  anlatim        TEXT,
  kisi_adi       TEXT, tedavi TEXT, kayip_gun INTEGER,
  onem           TEXT NOT NULL DEFAULT 'uyari',
  kok_neden      TEXT, duzeltici_faaliyet TEXT,
  etkinlik_dogrulandi INTEGER,
  dogrulayan     TEXT REFERENCES kullanici(id),
  resmi_bildirim INTEGER NOT NULL DEFAULT 0,
  durum          TEXT NOT NULL DEFAULT 'yeni',
  surum          INTEGER NOT NULL DEFAULT 1,
  olusturan      TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen    TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (tur IN ('kaza','ramak_kala','tehlike','cevre')),
  CHECK (durum IN ('yeni','siniflandirildi','atandi','islemde','dogrulamada','kapali','iptal'))
);

/* ---- Kalite: NCR ve DÖF (QLT-05..07) -----------------------------------
   NCR kapatma, DÖF tamamlandı VE yetkili etkinlik doğrulaması olmadan
   mümkün değildir (QLT-01 kabul testi).                                     */
CREATE TABLE ncr (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenant(id),
  santiye_id      TEXT REFERENCES santiye(id),
  proje_id        TEXT REFERENCES proje(id),
  kod             TEXT NOT NULL,
  baslik          TEXT NOT NULL,
  gereklilik      TEXT NOT NULL,
  bulgu           TEXT NOT NULL,
  etki            TEXT,
  karantina       INTEGER NOT NULL DEFAULT 0,
  onem            TEXT NOT NULL DEFAULT 'uyari',
  sorumlu_id      TEXT REFERENCES kullanici(id),
  termin          INTEGER,
  kok_neden       TEXT,
  dof_tanimi      TEXT,
  dof_tamamlandi  INTEGER,
  dof_tamamlayan  TEXT REFERENCES kullanici(id),
  etkinlik_dogrulandi INTEGER,
  etkinlik_dogrulayan TEXT REFERENCES kullanici(id),
  etkinlik_notu   TEXT,
  durum           TEXT NOT NULL DEFAULT 'yeni',
  surum           INTEGER NOT NULL DEFAULT 1,
  olusturan       TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen     TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (durum IN ('yeni','siniflandirildi','atandi','islemde','dogrulamada','kapali','iptal'))
);
CREATE INDEX ix_ncr_durum ON ncr (tenant_id, durum);
`},
];
