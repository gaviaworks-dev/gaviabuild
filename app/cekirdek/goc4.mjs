/* ============================================================================
   GÖÇ G004 — Faz 3 kalanı: kalite · çizim/transmittal/evrak · İK · şantiye ekleri
   ========================================================================== */

export const GOCLER_4 = [
{ ad: 'G004_kalite', sql: `

/* ---- ITP: muayene ve test planı (QLT-02, QLT-03) ----------------------- */
CREATE TABLE itp (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant(id),
  proje_id    TEXT REFERENCES proje(id),
  santiye_id  TEXT REFERENCES santiye(id),
  kod         TEXT NOT NULL,
  ad          TEXT NOT NULL,
  disiplin    TEXT,
  kapsam      TEXT,
  durum       TEXT NOT NULL DEFAULT 'taslak',
  surum       INTEGER NOT NULL DEFAULT 1,
  olusturan   TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (durum IN ('taslak','onaya_gonderildi','incelemede','revizyon_istendi','onaylandi','reddedildi','iptal'))
);

/* Kontrol noktası tipi: H=Hold (durdurma), W=Witness (şahitlik), R=Review, S=Surveillance */
CREATE TABLE itp_nokta (
  id           TEXT PRIMARY KEY,
  itp_id       TEXT NOT NULL REFERENCES itp(id) ON DELETE CASCADE,
  sira         INTEGER NOT NULL,
  ad           TEXT NOT NULL,
  nokta_tipi   TEXT NOT NULL DEFAULT 'R',
  kriter       TEXT,
  referans     TEXT,
  sorumlu_rol  TEXT,
  kanit_turu   TEXT,
  UNIQUE (itp_id, sira),
  CHECK (nokta_tipi IN ('H','W','R','S'))
);

/* ---- Muayene talebi (QLT-04) — hold/witness noktaları ------------------ */
CREATE TABLE muayene (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  itp_id        TEXT REFERENCES itp(id),
  itp_nokta_id  TEXT REFERENCES itp_nokta(id),
  santiye_id    TEXT REFERENCES santiye(id),
  proje_id      TEXT REFERENCES proje(id),
  kod           TEXT NOT NULL,
  baslik        TEXT NOT NULL,
  mahal         TEXT,
  talep_tarihi  INTEGER NOT NULL,
  muayene_tarihi INTEGER,
  nokta_tipi    TEXT NOT NULL DEFAULT 'R',
  sonuc         TEXT,
  sonuc_notu    TEXT,
  ncr_id        TEXT REFERENCES ncr(id),
  sorumlu_id    TEXT REFERENCES kullanici(id),
  durum         TEXT NOT NULL DEFAULT 'yeni',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (durum IN ('yeni','siniflandirildi','atandi','islemde','dogrulamada','kapali','iptal')),
  CHECK (sonuc IS NULL OR sonuc IN ('uygun','uygun_degil','sartli'))
);

/* ---- Malzeme onayı ve submittal (QLT-08, QLT-09) -----------------------
   Karar kodu uluslararası submittal pratiğidir: A onaylı, B notlu onaylı,
   C revize et, D reddedildi. Karar kodu KULLANICI TARAFINDAN serbest seçilmez;
   müşavir kararı olarak kaydedilir ve sürümle birlikte dondurulur.           */
CREATE TABLE submittal (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  proje_id      TEXT REFERENCES proje(id),
  santiye_id    TEXT REFERENCES santiye(id),
  kod           TEXT NOT NULL,
  tur           TEXT NOT NULL DEFAULT 'submittal',
  baslik        TEXT NOT NULL,
  disiplin      TEXT,
  tedarikci     TEXT,
  paket         TEXT,
  surum_no      INTEGER NOT NULL DEFAULT 1,
  gonderim_tarihi INTEGER,
  hedef_tarih   INTEGER,
  karar_kodu    TEXT,
  karar_tarihi  INTEGER,
  karar_veren   TEXT,
  karar_notu    TEXT,
  dokuman_id    TEXT REFERENCES dokuman(id),
  durum         TEXT NOT NULL DEFAULT 'taslak',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod, surum_no),
  CHECK (tur IN ('submittal','malzeme_onayi','numune','katalog')),
  CHECK (karar_kodu IS NULL OR karar_kodu IN ('A','B','C','D')),
  CHECK (durum IN ('taslak','onaya_gonderildi','incelemede','revizyon_istendi','onaylandi','reddedildi','iptal'))
);

/* ---- RFI (QLT-10..12) --------------------------------------------------- */
CREATE TABLE rfi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  proje_id      TEXT REFERENCES proje(id),
  santiye_id    TEXT REFERENCES santiye(id),
  kod           TEXT NOT NULL,
  baslik        TEXT NOT NULL,
  soru          TEXT NOT NULL,
  disiplin      TEXT,
  cizim_referansi TEXT,
  etki_kapsam   INTEGER NOT NULL DEFAULT 0,
  etki_sure     INTEGER NOT NULL DEFAULT 0,
  etki_maliyet  INTEGER NOT NULL DEFAULT 0,
  gerekli_tarih INTEGER,
  sla_bitis     INTEGER,
  yanit         TEXT,
  yanit_tarihi  INTEGER,
  yanitlayan    TEXT REFERENCES kullanici(id),
  degisiklik_tetikledi INTEGER NOT NULL DEFAULT 0,
  sorumlu_id    TEXT REFERENCES kullanici(id),
  durum         TEXT NOT NULL DEFAULT 'yeni',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (durum IN ('yeni','siniflandirildi','atandi','islemde','dogrulamada','kapali','iptal'))
);

/* ---- Test ve laboratuvar sonuçları (QLT-13) ---------------------------- */
CREATE TABLE test_sonucu (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  santiye_id    TEXT REFERENCES santiye(id),
  proje_id      TEXT REFERENCES proje(id),
  kod           TEXT NOT NULL,
  numune_kodu   TEXT NOT NULL,
  test_turu     TEXT NOT NULL,
  alim_tarihi   INTEGER,
  test_tarihi   INTEGER,
  laboratuvar   TEXT,
  kabul_kriteri TEXT,
  olculen_deger TEXT,
  birim         TEXT,
  sonuc         TEXT,
  ncr_id        TEXT REFERENCES ncr(id),
  zincir_notu   TEXT,
  durum         TEXT NOT NULL DEFAULT 'yeni',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (sonuc IS NULL OR sonuc IN ('uygun','uygun_degil','beklemede')),
  CHECK (durum IN ('yeni','siniflandirildi','atandi','islemde','dogrulamada','kapali','iptal'))
);

/* ---- Punch / eksik işler (QLT-14) -------------------------------------- */
CREATE TABLE punch (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  santiye_id   TEXT REFERENCES santiye(id),
  proje_id     TEXT REFERENCES proje(id),
  kod          TEXT NOT NULL,
  baslik       TEXT NOT NULL,
  lokasyon     TEXT,
  disiplin     TEXT,
  onem         TEXT NOT NULL DEFAULT 'uyari',
  sorumlu_id   TEXT REFERENCES kullanici(id),
  termin       INTEGER,
  kapanis_kaniti TEXT,
  kabul_id     TEXT,
  durum        TEXT NOT NULL DEFAULT 'yeni',
  surum        INTEGER NOT NULL DEFAULT 1,
  olusturan    TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen  TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (onem IN ('bilgi','uyari','kritik')),
  CHECK (durum IN ('yeni','siniflandirildi','atandi','islemde','dogrulamada','kapali','iptal'))
);
CREATE INDEX ix_punch_santiye ON punch (santiye_id, durum);

/* ---- Çizim ve revizyon (DOC-04, DOC-05) -------------------------------- */
CREATE TABLE cizim (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  proje_id      TEXT REFERENCES proje(id),
  kod           TEXT NOT NULL,
  ad            TEXT NOT NULL,
  disiplin      TEXT NOT NULL,
  paket         TEXT,
  olcek         TEXT,
  aktif_revizyon TEXT,
  durum         TEXT NOT NULL DEFAULT 'aktif',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (durum IN ('aktif','arsiv','iptal'))
);

/* Revizyon satırı DEĞİŞTİRİLEMEZ: yeni revizyon yeni satırdır (§5.4).       */
CREATE TABLE cizim_revizyonu (
  id           TEXT PRIMARY KEY,
  cizim_id     TEXT NOT NULL REFERENCES cizim(id) ON DELETE CASCADE,
  revizyon     TEXT NOT NULL,
  aciklama     TEXT,
  dokuman_id   TEXT REFERENCES dokuman(id),
  yayin_tarihi INTEGER NOT NULL,
  yayinlayan   TEXT NOT NULL REFERENCES kullanici(id),
  UNIQUE (cizim_id, revizyon)
);
CREATE TRIGGER trg_cizim_rev_degistirilemez BEFORE UPDATE ON cizim_revizyonu
BEGIN SELECT RAISE(ABORT, 'cizim revizyonu degistirilemez; yeni revizyon acilir'); END;

/* ---- Transmittal (DOC-06, DOC-07) -------------------------------------- */
CREATE TABLE transmittal (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  proje_id     TEXT REFERENCES proje(id),
  kod          TEXT NOT NULL,
  alici        TEXT NOT NULL,
  alici_eposta TEXT,
  amac_kodu    TEXT NOT NULL DEFAULT 'bilgi',
  aciklama     TEXT,
  gonderim_tarihi INTEGER,
  teslim_kaniti TEXT,
  teslim_tarihi INTEGER,
  durum        TEXT NOT NULL DEFAULT 'taslak',
  surum        INTEGER NOT NULL DEFAULT 1,
  olusturan    TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen  TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (amac_kodu IN ('bilgi','onay','uygulama','kayit','ihale')),
  CHECK (durum IN ('taslak','gonderildi','teslim_edildi','iptal'))
);

CREATE TABLE transmittal_kalemi (
  id             TEXT PRIMARY KEY,
  transmittal_id TEXT NOT NULL REFERENCES transmittal(id) ON DELETE CASCADE,
  dokuman_id     TEXT REFERENCES dokuman(id),
  cizim_id       TEXT REFERENCES cizim(id),
  surum_no       INTEGER,
  revizyon       TEXT,
  aciklama       TEXT
);

/* ---- Gelen-giden evrak (DOC-08) ---------------------------------------- */
CREATE TABLE evrak (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  proje_id     TEXT REFERENCES proje(id),
  kod          TEXT NOT NULL,
  yon          TEXT NOT NULL,
  konu         TEXT NOT NULL,
  karsi_taraf  TEXT,
  evrak_tarihi INTEGER NOT NULL,
  havale_id    TEXT REFERENCES kullanici(id),
  son_tarih    INTEGER,
  dokuman_id   TEXT REFERENCES dokuman(id),
  ilgili_nesne TEXT, ilgili_id TEXT,
  durum        TEXT NOT NULL DEFAULT 'yeni',
  surum        INTEGER NOT NULL DEFAULT 1,
  olusturan    TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen  TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (yon IN ('gelen','giden')),
  CHECK (durum IN ('yeni','siniflandirildi','atandi','islemde','dogrulamada','kapali','iptal'))
);

/* ---- Belge dağıtım matrisi (DOC-09) ------------------------------------ */
CREATE TABLE dagitim_matrisi (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant(id),
  belge_turu  TEXT NOT NULL,
  rol_kodu    TEXT NOT NULL,
  erisim      TEXT NOT NULL DEFAULT 'goruntule',
  olusturan   TEXT, olusturuldu INTEGER NOT NULL,
  UNIQUE (tenant_id, belge_turu, rol_kodu),
  CHECK (erisim IN ('goruntule','indir','duzenle','yok'))
);
`},
];
