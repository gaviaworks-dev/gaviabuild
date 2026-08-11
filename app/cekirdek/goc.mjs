/* ============================================================================
   VERİTABANI GÖÇLERİ — sıralı, geri alınamaz, tek yönlü
   ----------------------------------------------------------------------------
   Ortak sütun sözleşmesi (değişmez kural 10): her iş kaydında
     id · tenant_id · durum · surum · olusturan/olusturuldu · guncelleyen/guncellendi
   Para: <ad>_minor INTEGER + <ad>_birim TEXT (iki sütun, asla REAL).
   Zaman: INTEGER epoch ms (UTC).
   ========================================================================== */

import { GOCLER_2 } from './goc2.mjs';
import { GOCLER_3 } from './goc3.mjs';
import { GOCLER_4 } from './goc4.mjs';
import { GOCLER_5 } from './goc5.mjs';
import { GOCLER_6 } from './goc6.mjs';
import { GOCLER_7 } from './goc7.mjs';
import { GOCLER_8 } from './goc8.mjs';
import { GOCLER_9 } from './goc9.mjs';

const G001 = [
{ ad: 'G001_kimlik_ve_yetki', sql: `

/* ---- Kiracı (tenant) ve tüzel kişi ------------------------------------- */
CREATE TABLE tenant (
  id            TEXT PRIMARY KEY,
  kod           TEXT NOT NULL UNIQUE,
  ad            TEXT NOT NULL,
  para_birimi   TEXT NOT NULL DEFAULT 'TRY',
  saat_dilimi   TEXT NOT NULL DEFAULT 'Europe/Istanbul',
  durum         TEXT NOT NULL DEFAULT 'aktif',
  demo          INTEGER NOT NULL DEFAULT 0,
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  CHECK (durum IN ('aktif','askida','kapali'))
);

CREATE TABLE sirket (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  unvan         TEXT NOT NULL,
  vergi_dairesi TEXT, vergi_no TEXT,
  adres         TEXT, telefon TEXT, eposta TEXT,
  para_birimi   TEXT NOT NULL DEFAULT 'TRY',
  durum         TEXT NOT NULL DEFAULT 'aktif',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (durum IN ('aktif','pasif'))
);

/* ---- Kullanıcı --------------------------------------------------------- */
CREATE TABLE kullanici (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenant(id),
  eposta           TEXT NOT NULL,
  ad_soyad         TEXT NOT NULL,
  telefon          TEXT,
  parola_ozeti     TEXT,
  parola_tuz       TEXT,
  parola_degisti   INTEGER,
  mfa_gizli        TEXT,
  mfa_zorunlu      INTEGER NOT NULL DEFAULT 0,
  mfa_aktif        INTEGER NOT NULL DEFAULT 0,
  saat_dilimi      TEXT,
  kurulum_tamam    INTEGER NOT NULL DEFAULT 0,
  son_giris        INTEGER,
  basarisiz_deneme INTEGER NOT NULL DEFAULT 0,
  kilit_bitis      INTEGER,
  durum            TEXT NOT NULL DEFAULT 'aktif',
  surum            INTEGER NOT NULL DEFAULT 1,
  olusturan        TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen      TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, eposta),
  CHECK (durum IN ('davetli','aktif','pasif','kilitli'))
);
CREATE INDEX ix_kullanici_eposta ON kullanici (eposta);

/* ---- Rol ve yetki ------------------------------------------------------
   Yetki kodlari screen-manifest'ten turer: "<EKRAN-KODU>:goruntule" ve eylem
   yetkileri "<EKRAN-KODU>:<eylem>". Menu gizlemek yetki degildir; her istek
   sunucuda bu tabloya bakar (degismez kural 2).                             */
CREATE TABLE rol (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT REFERENCES tenant(id),
  kod         TEXT NOT NULL,
  ad          TEXT NOT NULL,
  aciklama    TEXT,
  sistem      INTEGER NOT NULL DEFAULT 0,
  durum       TEXT NOT NULL DEFAULT 'aktif',
  surum       INTEGER NOT NULL DEFAULT 1,
  olusturan   TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod)
);

CREATE TABLE rol_yetki (
  rol_id   TEXT NOT NULL REFERENCES rol(id) ON DELETE CASCADE,
  yetki    TEXT NOT NULL,
  PRIMARY KEY (rol_id, yetki)
);

CREATE TABLE kullanici_rol (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  kullanici_id TEXT NOT NULL REFERENCES kullanici(id) ON DELETE CASCADE,
  rol_id       TEXT NOT NULL REFERENCES rol(id),
  kapsam_tur   TEXT,
  kapsam_id    TEXT,
  baslangic    INTEGER, bitis INTEGER,
  olusturan    TEXT, olusturuldu INTEGER NOT NULL,
  UNIQUE (kullanici_id, rol_id, kapsam_tur, kapsam_id),
  CHECK (kapsam_tur IS NULL OR kapsam_tur IN ('sirket','proje','santiye'))
);
CREATE INDEX ix_kullanici_rol_k ON kullanici_rol (kullanici_id);

/* Veri kapsami kurallari (SET-05): tutar tavani, yalniz kendi kaydi,
   hassas alan maskesi.                                                      */
CREATE TABLE veri_kapsami (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant(id),
  rol_id      TEXT NOT NULL REFERENCES rol(id) ON DELETE CASCADE,
  nesne       TEXT NOT NULL,
  kural       TEXT NOT NULL,
  deger       TEXT,
  olusturan   TEXT, olusturuldu INTEGER NOT NULL,
  CHECK (kural IN ('kendi_kaydi','tutar_tavani','alan_maskesi','kapsam_zorunlu'))
);

/* ---- Oturum ------------------------------------------------------------
   Cerez degeri veritabaninda ACIK saklanmaz; SHA-256 ozeti saklanir.        */
CREATE TABLE oturum (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenant(id),
  kullanici_id   TEXT NOT NULL REFERENCES kullanici(id) ON DELETE CASCADE,
  token_ozeti    TEXT NOT NULL UNIQUE,
  csrf_ozeti     TEXT NOT NULL,
  ip             TEXT, tarayici TEXT,
  mfa_dogrulandi INTEGER NOT NULL DEFAULT 0,
  aktif_sirket   TEXT, aktif_proje TEXT, aktif_santiye TEXT,
  olusturuldu    INTEGER NOT NULL,
  son_erisim     INTEGER NOT NULL,
  bitis          INTEGER NOT NULL,
  sonlandirildi  INTEGER,
  sonlandirma_nedeni TEXT
);
CREATE INDEX ix_oturum_kullanici ON oturum (kullanici_id);

CREATE TABLE tek_kullanimlik_token (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  kullanici_id TEXT REFERENCES kullanici(id) ON DELETE CASCADE,
  tur          TEXT NOT NULL,
  token_ozeti  TEXT NOT NULL UNIQUE,
  veri         TEXT,
  bitis        INTEGER NOT NULL,
  kullanildi   INTEGER,
  olusturan    TEXT, olusturuldu INTEGER NOT NULL,
  CHECK (tur IN ('davet','parola_sifirlama','mfa_adimi','portal'))
);

CREATE TABLE giris_denemesi (
  id       TEXT PRIMARY KEY,
  anahtar  TEXT NOT NULL,
  tur      TEXT NOT NULL,
  zaman    INTEGER NOT NULL,
  basarili INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ix_giris_denemesi ON giris_denemesi (anahtar, zaman);

/* ---- Denetim izi (SET-16, 5.7) -----------------------------------------
   Degismez: UPDATE/DELETE tetikleyiciyle engellenir; her satir bir oncekinin
   ozetini tasir (hash zinciri).                                             */
CREATE TABLE denetim_izi (
  id           TEXT PRIMARY KEY,
  sira         INTEGER NOT NULL,
  tenant_id    TEXT,
  kullanici_id TEXT,
  istek_id     TEXT,
  ip           TEXT,
  nesne        TEXT NOT NULL,
  nesne_id     TEXT,
  eylem        TEXT NOT NULL,
  gerekce      TEXT,
  onceki       TEXT,
  sonraki      TEXT,
  zaman        INTEGER NOT NULL,
  onceki_ozet  TEXT NOT NULL,
  ozet         TEXT NOT NULL UNIQUE
);
CREATE INDEX ix_denetim_nesne ON denetim_izi (nesne, nesne_id);
CREATE INDEX ix_denetim_zaman ON denetim_izi (zaman);
CREATE TRIGGER trg_denetim_degistirilemez BEFORE UPDATE ON denetim_izi
BEGIN SELECT RAISE(ABORT, 'denetim izi degistirilemez'); END;
CREATE TRIGGER trg_denetim_silinemez BEFORE DELETE ON denetim_izi
BEGIN SELECT RAISE(ABORT, 'denetim izi silinemez'); END;

/* ---- Idempotency (degismez kural 8) ------------------------------------ */
CREATE TABLE idempotency (
  anahtar      TEXT NOT NULL,
  tenant_id    TEXT NOT NULL,
  kullanici_id TEXT,
  istek_ozeti  TEXT NOT NULL,
  durum        TEXT NOT NULL,
  sonuc        TEXT,
  http_durum   INTEGER,
  olusturuldu  INTEGER NOT NULL,
  bitti        INTEGER,
  PRIMARY KEY (tenant_id, anahtar)
);

/* ---- Ozellik bayraklari (SET-18) — DEMO rol secimi buradan acilir ------ */
CREATE TABLE ozellik_bayragi (
  kod         TEXT NOT NULL,
  tenant_id   TEXT,
  acik        INTEGER NOT NULL DEFAULT 0,
  aciklama    TEXT,
  guncelleyen TEXT, guncellendi INTEGER,
  PRIMARY KEY (kod, tenant_id)
);

/* ---- Kisisel notlar (GLB-10, GLB-11) — yalniz sahibi gorur ------------- */
CREATE TABLE kisisel_not (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  kullanici_id TEXT NOT NULL REFERENCES kullanici(id) ON DELETE CASCADE,
  baslik       TEXT NOT NULL,
  icerik       TEXT,
  etiket       TEXT,
  hatirlatma   INTEGER,
  tamamlandi   INTEGER NOT NULL DEFAULT 0,
  durum        TEXT NOT NULL DEFAULT 'aktif',
  surum        INTEGER NOT NULL DEFAULT 1,
  olusturan    TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen  TEXT, guncellendi INTEGER,
  CHECK (durum IN ('aktif','arsiv'))
);
CREATE INDEX ix_not_kullanici ON kisisel_not (kullanici_id, tamamlandi);

/* ---- Bildirim (GLB-06) ------------------------------------------------- */
CREATE TABLE bildirim (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  kullanici_id TEXT NOT NULL REFERENCES kullanici(id) ON DELETE CASCADE,
  tur          TEXT NOT NULL,
  baslik       TEXT NOT NULL,
  govde        TEXT,
  nesne        TEXT, nesne_id TEXT, rota TEXT,
  onem         TEXT NOT NULL DEFAULT 'bilgi',
  okundu       INTEGER,
  ertelendi    INTEGER,
  olusturuldu  INTEGER NOT NULL,
  CHECK (onem IN ('bilgi','uyari','kritik'))
);
CREATE INDEX ix_bildirim_kullanici ON bildirim (kullanici_id, okundu);
`},
];

/* Göçler sırayla uygulanır; her dosya bir faz ekler (tek yönlü, geri alınamaz). */
export const GOCLER = [...G001, ...GOCLER_2, ...GOCLER_3, ...GOCLER_4, ...GOCLER_5, ...GOCLER_6, ...GOCLER_7, ...GOCLER_8, ...GOCLER_9];
