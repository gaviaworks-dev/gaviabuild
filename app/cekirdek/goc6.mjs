/* ============================================================================
   GÖÇ G006 — Şantiye tamamlama: ziyaretçi, resmi belge, kabul (SITE-12..16)
   ========================================================================== */

export const GOCLER_6 = [
{ ad: 'G006_santiye_tamamlama', sql: `

/* Saha giriş kaydı: ziyaretçi, teslimat ve araç (SITE-12).
   Çıkış saati boş olan kayıt "sahada" sayılır — hesaplanan işaret, saklanmaz. */
CREATE TABLE ziyaretci (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  santiye_id    TEXT NOT NULL REFERENCES santiye(id),
  proje_id      TEXT REFERENCES proje(id),
  tur           TEXT NOT NULL DEFAULT 'ziyaretci',
  ad_soyad      TEXT NOT NULL,
  firma         TEXT,
  amac          TEXT,
  plaka         TEXT,
  refakatci_id  TEXT REFERENCES kullanici(id),
  kkd_verildi   INTEGER NOT NULL DEFAULT 0,
  isg_brifingi  INTEGER NOT NULL DEFAULT 0,
  giris         INTEGER NOT NULL,
  cikis         INTEGER,
  notlar        TEXT,
  durum         TEXT NOT NULL DEFAULT 'sahada',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  CHECK (tur IN ('ziyaretci','teslimat','arac','denetim')),
  CHECK (durum IN ('sahada','cikti','iptal')),
  CHECK (cikis IS NULL OR cikis >= giris)
);
CREATE INDEX ix_ziyaretci_santiye ON ziyaretci (santiye_id, giris);

/* Şantiyenin resmi izin ve belgeleri (SITE-13).
   \`zorunlu = 1\` olan ve geçerliliği dolmuş belge şantiye AÇILIŞINI engeller. */
CREATE TABLE santiye_belgesi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  santiye_id    TEXT NOT NULL REFERENCES santiye(id),
  tur           TEXT NOT NULL,
  ad            TEXT NOT NULL,
  belge_no      TEXT,
  veren_kurum   TEXT,
  baslangic     INTEGER,
  gecerlilik    INTEGER,
  zorunlu       INTEGER NOT NULL DEFAULT 0,
  dokuman_id    TEXT REFERENCES dokuman(id),
  notlar        TEXT,
  durum         TEXT NOT NULL DEFAULT 'gecerli',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  CHECK (tur IN ('ruhsat','isg_izni','cevre_izni','sigorta','sgk','iskan','yol_izni','diger')),
  /* 'suresi_doldu' SAKLANMAZ: geçerlilik tarihinden HESAPLANIR (§5.2 işaret kuralı). */
  CHECK (durum IN ('gecerli','yenilemede','iptal'))
);
CREATE INDEX ix_santiye_belgesi ON santiye_belgesi (santiye_id, gecerlilik);

/* Geçici ve kesin kabul (SITE-14, SITE-15) — onaylı kayıt yaşam döngüsü.
   Kesin kabul, ONAYLI bir geçici kabul olmadan açılamaz. */
CREATE TABLE kabul (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenant(id),
  santiye_id      TEXT NOT NULL REFERENCES santiye(id),
  proje_id        TEXT REFERENCES proje(id),
  kod             TEXT NOT NULL,
  tur             TEXT NOT NULL,
  talep_tarihi    INTEGER,
  kabul_tarihi    INTEGER,
  komisyon        TEXT,
  isveren_temsilcisi TEXT,
  garanti_ay      INTEGER,
  garanti_bitis   INTEGER,
  eksik_sayisi    INTEGER NOT NULL DEFAULT 0,
  tutanak_id      TEXT REFERENCES dokuman(id),
  devir_notu      TEXT,
  durum           TEXT NOT NULL DEFAULT 'taslak',
  surum           INTEGER NOT NULL DEFAULT 1,
  olusturan       TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen     TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (tur IN ('gecici','kesin')),
  CHECK (durum IN ('taslak','onaya_gonderildi','incelemede','revizyon_istendi','onaylandi','reddedildi','iptal'))
);
CREATE INDEX ix_kabul_santiye ON kabul (santiye_id, tur);
`},
];
