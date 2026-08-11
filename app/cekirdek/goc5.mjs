/* ============================================================================
   GÖÇ G005 — İK ve personel (HR-01..14)
   ========================================================================== */

export const GOCLER_5 = [
{ ad: 'G005_ik', sql: `

CREATE TABLE personel (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenant(id),
  sirket_id      TEXT REFERENCES sirket(id),
  kullanici_id   TEXT REFERENCES kullanici(id),
  kod            TEXT NOT NULL,
  ad_soyad       TEXT NOT NULL,
  tc_no          TEXT,
  dogum_tarihi   INTEGER,
  telefon        TEXT, eposta TEXT, adres TEXT,
  gorev          TEXT,
  departman      TEXT,
  ise_giris      INTEGER,
  isten_cikis    INTEGER,
  sozlesme_turu  TEXT,
  /* Maaş HASSAS ALAN: alan düzeyi maskeleme kuralına tabidir (§5.7). */
  maas_minor     INTEGER, maas_birim TEXT DEFAULT 'TRY',
  banka_iban     TEXT,
  taseron_id     TEXT,
  durum          TEXT NOT NULL DEFAULT 'aktif',
  surum          INTEGER NOT NULL DEFAULT 1,
  olusturan      TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen    TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (durum IN ('aday','aktif','izinli','ayrildi','pasif'))
);
CREATE INDEX ix_personel_durum ON personel (tenant_id, durum);

/* Şantiye ataması: tarih aralıkları ÇAKIŞAMAZ (HR-07 amacı). */
CREATE TABLE personel_atama (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  personel_id  TEXT NOT NULL REFERENCES personel(id) ON DELETE CASCADE,
  santiye_id   TEXT NOT NULL REFERENCES santiye(id),
  proje_id     TEXT REFERENCES proje(id),
  gorev        TEXT,
  baslangic    INTEGER NOT NULL,
  bitis        INTEGER,
  durum        TEXT NOT NULL DEFAULT 'aktif',
  surum        INTEGER NOT NULL DEFAULT 1,
  olusturan    TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen  TEXT, guncellendi INTEGER,
  CHECK (durum IN ('aktif','sonlandi','iptal'))
);
CREATE INDEX ix_atama_personel ON personel_atama (personel_id, durum);

/* Puantaj dönemi: KAPANDIKTAN sonra o dönemin kayıtları KİLİTLENİR (HR-09). */
CREATE TABLE puantaj_donemi (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  santiye_id   TEXT REFERENCES santiye(id),
  donem        TEXT NOT NULL,
  durum        TEXT NOT NULL DEFAULT 'acik',
  kapatan      TEXT REFERENCES kullanici(id),
  kapandi      INTEGER,
  bordro_aktarim INTEGER,
  surum        INTEGER NOT NULL DEFAULT 1,
  olusturan    TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen  TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, santiye_id, donem),
  CHECK (durum IN ('acik','onaya_gonderildi','incelemede','revizyon_istendi','onaylandi','reddedildi','iptal','kapali'))
);

CREATE TABLE puantaj (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  donem_id     TEXT REFERENCES puantaj_donemi(id),
  personel_id  TEXT NOT NULL REFERENCES personel(id),
  santiye_id   TEXT REFERENCES santiye(id),
  gun          TEXT NOT NULL,
  vardiya      TEXT NOT NULL DEFAULT 'gunduz',
  normal_saat  INTEGER NOT NULL DEFAULT 0,
  fazla_saat   INTEGER NOT NULL DEFAULT 0,
  devamsizlik  TEXT,
  kaynak       TEXT NOT NULL DEFAULT 'elle',
  kilit        INTEGER NOT NULL DEFAULT 0,
  surum        INTEGER NOT NULL DEFAULT 1,
  olusturan    TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen  TEXT, guncellendi INTEGER,
  UNIQUE (personel_id, gun),
  CHECK (kaynak IN ('elle','kiosk','mobil','ice_aktarim')),
  CHECK (normal_saat >= 0 AND normal_saat <= 24),
  CHECK (fazla_saat >= 0 AND fazla_saat <= 24)
);
CREATE INDEX ix_puantaj_donem ON puantaj (donem_id, personel_id);

CREATE TABLE izin (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  personel_id  TEXT NOT NULL REFERENCES personel(id),
  kod          TEXT NOT NULL,
  tur          TEXT NOT NULL,
  baslangic    INTEGER NOT NULL,
  bitis        INTEGER NOT NULL,
  gun_sayisi   INTEGER NOT NULL,
  gerekce      TEXT,
  vekil_id     TEXT REFERENCES personel(id),
  durum        TEXT NOT NULL DEFAULT 'taslak',
  surum        INTEGER NOT NULL DEFAULT 1,
  olusturan    TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen  TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (tur IN ('yillik','ucretsiz','rapor','mazeret','dogum','babalik','olum')),
  CHECK (bitis >= baslangic),
  CHECK (durum IN ('taslak','onaya_gonderildi','incelemede','revizyon_istendi','onaylandi','reddedildi','iptal'))
);

CREATE TABLE avans (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  personel_id  TEXT NOT NULL REFERENCES personel(id),
  kod          TEXT NOT NULL,
  tutar_minor  INTEGER NOT NULL,
  tutar_birim  TEXT NOT NULL DEFAULT 'TRY',
  gerekce      TEXT,
  odeme_tarihi INTEGER,
  mahsup_donem TEXT,
  mahsup_edildi INTEGER,
  durum        TEXT NOT NULL DEFAULT 'taslak',
  surum        INTEGER NOT NULL DEFAULT 1,
  olusturan    TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen  TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (tutar_minor > 0),
  CHECK (durum IN ('taslak','onaya_gonderildi','incelemede','revizyon_istendi','onaylandi','reddedildi','iptal'))
);

/* Personel belgesi ve yetkinlik — geçerlilik bitişi uyarı üretir (HR-12, HR-13) */
CREATE TABLE yetkinlik (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  personel_id  TEXT NOT NULL REFERENCES personel(id) ON DELETE CASCADE,
  tur          TEXT NOT NULL,
  ad           TEXT NOT NULL,
  belge_no     TEXT,
  veren_kurum  TEXT,
  gecerlilik   INTEGER,
  dokuman_id   TEXT REFERENCES dokuman(id),
  durum        TEXT NOT NULL DEFAULT 'gecerli',
  surum        INTEGER NOT NULL DEFAULT 1,
  olusturan    TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen  TEXT, guncellendi INTEGER,
  CHECK (tur IN ('sertifika','egitim','saglik','ehliyet','diger')),
  CHECK (durum IN ('gecerli','suresi_doldu','iptal'))
);
CREATE INDEX ix_yetkinlik_personel ON yetkinlik (personel_id, gecerlilik);
`},
];
