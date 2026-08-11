/* ============================================================================
   GÖÇ G002 — iş akışı omurgası (Faz 2)
   İş akışı şablonu · onay talebi/adımı/kararı · vekalet · bildirim kuralı ·
   doküman ve sürüm · numaralandırma · sözlük · maliyet kodu · duyuru
   ========================================================================== */

export const GOCLER_2 = [
{ ad: 'G002_is_akisi', sql: `

/* ---- İş akışı şablonu (SET-06) — SÜRÜMLÜ -------------------------------
   Onay şablonu; nesne türü, şirket, proje, tutar araligi, maliyet kodu, risk
   sinifi ve islem türüne göre secilir. Onaylı bir şablon yerinde DEĞİŞTİRİLMEZ;
   yeni sürüm açılır (değişmez kural 6).                                      */
CREATE TABLE is_akisi_sablonu (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  kod          TEXT NOT NULL,
  ad           TEXT NOT NULL,
  nesne        TEXT NOT NULL,
  surum        INTEGER NOT NULL DEFAULT 1,
  durum        TEXT NOT NULL DEFAULT 'taslak',
  gecerli_bas  INTEGER,
  gecerli_bit  INTEGER,
  sirket_id    TEXT,
  proje_id     TEXT,
  tutar_alt_minor INTEGER,
  tutar_ust_minor INTEGER,
  tutar_birim  TEXT DEFAULT 'TRY',
  maliyet_kodu TEXT,
  risk_sinifi  TEXT,
  islem_turu   TEXT,
  sla_saat     INTEGER,
  revizyonda_onaylar_gecersiz INTEGER NOT NULL DEFAULT 1,
  olusturan    TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen  TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod, surum),
  CHECK (durum IN ('taslak','yayinda','arsiv'))
);
CREATE INDEX ix_sablon_nesne ON is_akisi_sablonu (tenant_id, nesne, durum);

CREATE TABLE is_akisi_adimi (
  id          TEXT PRIMARY KEY,
  sablon_id   TEXT NOT NULL REFERENCES is_akisi_sablonu(id) ON DELETE CASCADE,
  sira        INTEGER NOT NULL,
  ad          TEXT NOT NULL,
  rol_kodu    TEXT NOT NULL,
  paralel     INTEGER NOT NULL DEFAULT 0,
  gereken_onay INTEGER NOT NULL DEFAULT 1,
  sla_saat    INTEGER,
  UNIQUE (sablon_id, sira, rol_kodu)
);

/* ---- Onay talebi (GLB-04, GLB-05) --------------------------------------
   Onay ekranı KARAR VERİLEN SÜRÜMÜ sabit gösterir: belge_surum dondurulur.  */
CREATE TABLE onay_talebi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  sablon_id     TEXT REFERENCES is_akisi_sablonu(id),
  sablon_surum  INTEGER,
  nesne         TEXT NOT NULL,
  nesne_id      TEXT NOT NULL,
  nesne_kod     TEXT,
  baslik        TEXT NOT NULL,
  belge_surum   INTEGER NOT NULL,
  tutar_minor   INTEGER,
  tutar_birim   TEXT,
  sirket_id     TEXT, proje_id TEXT, santiye_id TEXT,
  talep_eden    TEXT NOT NULL REFERENCES kullanici(id),
  gerekce       TEXT,
  durum         TEXT NOT NULL DEFAULT 'acik',
  sonuc         TEXT,
  sla_bitis     INTEGER,
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  kapandi       INTEGER,
  CHECK (durum IN ('acik','kapali','iptal')),
  CHECK (sonuc IS NULL OR sonuc IN ('onaylandi','reddedildi','revizyon_istendi','iptal'))
);
CREATE INDEX ix_onay_nesne ON onay_talebi (nesne, nesne_id);
CREATE INDEX ix_onay_durum ON onay_talebi (tenant_id, durum);

CREATE TABLE onay_adimi (
  id           TEXT PRIMARY KEY,
  talep_id     TEXT NOT NULL REFERENCES onay_talebi(id) ON DELETE CASCADE,
  sira         INTEGER NOT NULL,
  ad           TEXT NOT NULL,
  rol_kodu     TEXT NOT NULL,
  paralel      INTEGER NOT NULL DEFAULT 0,
  gereken_onay INTEGER NOT NULL DEFAULT 1,
  durum        TEXT NOT NULL DEFAULT 'bekliyor',
  sla_bitis    INTEGER,
  acildi       INTEGER,
  kapandi      INTEGER,
  CHECK (durum IN ('bekliyor','acik','onaylandi','reddedildi','revizyon_istendi','atlandi','iptal'))
);
CREATE INDEX ix_onay_adimi ON onay_adimi (talep_id, sira);

/* Karar kaydı DEĞİŞTİRİLEMEZ: düzeltme yeni karar satırıdır.               */
CREATE TABLE onay_karari (
  id           TEXT PRIMARY KEY,
  adim_id      TEXT NOT NULL REFERENCES onay_adimi(id) ON DELETE CASCADE,
  talep_id     TEXT NOT NULL REFERENCES onay_talebi(id) ON DELETE CASCADE,
  kullanici_id TEXT NOT NULL REFERENCES kullanici(id),
  vekaleten    TEXT REFERENCES kullanici(id),
  karar        TEXT NOT NULL,
  gerekce      TEXT,
  belge_surum  INTEGER NOT NULL,
  zaman        INTEGER NOT NULL,
  ip           TEXT,
  CHECK (karar IN ('onayla','reddet','revizyon_iste'))
);
CREATE TRIGGER trg_onay_karari_degistirilemez BEFORE UPDATE ON onay_karari
BEGIN SELECT RAISE(ABORT, 'onay karari degistirilemez'); END;
CREATE INDEX ix_karar_talep ON onay_karari (talep_id);

/* ---- Vekalet (SET-07) — tarih araligi cakismasi ENGELLENIR ------------- */
CREATE TABLE vekalet (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  veren_id     TEXT NOT NULL REFERENCES kullanici(id),
  alan_id      TEXT NOT NULL REFERENCES kullanici(id),
  kapsam       TEXT,
  baslangic    INTEGER NOT NULL,
  bitis        INTEGER NOT NULL,
  gerekce      TEXT,
  durum        TEXT NOT NULL DEFAULT 'aktif',
  surum        INTEGER NOT NULL DEFAULT 1,
  olusturan    TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen  TEXT, guncellendi INTEGER,
  CHECK (durum IN ('aktif','iptal','doldu')),
  CHECK (bitis > baslangic),
  CHECK (veren_id <> alan_id)
);
CREATE INDEX ix_vekalet_veren ON vekalet (veren_id, durum);

/* ---- Bildirim kuralı (SET-08) ------------------------------------------ */
CREATE TABLE bildirim_kurali (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant(id),
  olay        TEXT NOT NULL,
  kanal       TEXT NOT NULL DEFAULT 'uygulama',
  alici_rol   TEXT,
  alici_kullanici TEXT,
  tekrar_dk   INTEGER,
  aktif       INTEGER NOT NULL DEFAULT 1,
  olusturan   TEXT, olusturuldu INTEGER NOT NULL,
  CHECK (kanal IN ('uygulama','eposta','sms'))
);

/* ---- Doküman ve sürüm (DOC-01..03) -------------------------------------
   Onaylı sürüm yerinde değiştirilmez; yeni sürüm satırı açılır (kural 6).   */
CREATE TABLE dokuman (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  kod          TEXT NOT NULL,
  ad           TEXT NOT NULL,
  belge_turu   TEXT NOT NULL,
  sinif        TEXT NOT NULL DEFAULT 'ic',
  sirket_id    TEXT, proje_id TEXT, santiye_id TEXT,
  ilgili_nesne TEXT, ilgili_id TEXT,
  gecerlilik   INTEGER,
  saklama_bitis INTEGER,
  hukuki_bekletme INTEGER NOT NULL DEFAULT 0,
  aktif_surum  INTEGER NOT NULL DEFAULT 0,
  durum        TEXT NOT NULL DEFAULT 'aktif',
  surum        INTEGER NOT NULL DEFAULT 1,
  olusturan    TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen  TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (sinif IN ('ic','gizli','paylasilan','resmi')),
  CHECK (durum IN ('aktif','arsiv','imha_planli'))
);
CREATE INDEX ix_dokuman_ilgili ON dokuman (ilgili_nesne, ilgili_id);

CREATE TABLE dokuman_surumu (
  id           TEXT PRIMARY KEY,
  dokuman_id   TEXT NOT NULL REFERENCES dokuman(id) ON DELETE CASCADE,
  surum_no     INTEGER NOT NULL,
  dosya_adi    TEXT NOT NULL,
  mime         TEXT NOT NULL,
  bayt         INTEGER NOT NULL,
  ozet         TEXT NOT NULL,
  depo_yolu    TEXT NOT NULL,
  aciklama     TEXT,
  yukleyen     TEXT NOT NULL REFERENCES kullanici(id),
  yuklendi     INTEGER NOT NULL,
  UNIQUE (dokuman_id, surum_no)
);
CREATE TRIGGER trg_dokuman_surumu_degistirilemez BEFORE UPDATE ON dokuman_surumu
BEGIN SELECT RAISE(ABORT, 'dokuman surumu degistirilemez; yeni surum acilir'); END;

/* ---- Numaralandırma (SET-09) ------------------------------------------- */
CREATE TABLE numara_sablonu (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant(id),
  nesne       TEXT NOT NULL,
  onek        TEXT NOT NULL,
  yil_dahil   INTEGER NOT NULL DEFAULT 1,
  basamak     INTEGER NOT NULL DEFAULT 4,
  sonraki     INTEGER NOT NULL DEFAULT 1,
  olusturan   TEXT, olusturuldu INTEGER NOT NULL,
  UNIQUE (tenant_id, nesne)
);

/* ---- Sözlük ve maliyet kodu (SET-10, SET-11) --------------------------- */
CREATE TABLE sozluk (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant(id),
  kume        TEXT NOT NULL,
  kod         TEXT NOT NULL,
  ad          TEXT NOT NULL,
  sira        INTEGER NOT NULL DEFAULT 0,
  cekirdek    INTEGER NOT NULL DEFAULT 0,
  aktif       INTEGER NOT NULL DEFAULT 1,
  olusturan   TEXT, olusturuldu INTEGER NOT NULL,
  UNIQUE (tenant_id, kume, kod)
);

CREATE TABLE maliyet_kodu (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant(id),
  kod         TEXT NOT NULL,
  ad          TEXT NOT NULL,
  ust_id      TEXT REFERENCES maliyet_kodu(id),
  seviye      INTEGER NOT NULL DEFAULT 1,
  tur         TEXT NOT NULL DEFAULT 'maliyet',
  aktif       INTEGER NOT NULL DEFAULT 1,
  surum       INTEGER NOT NULL DEFAULT 1,
  olusturan   TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod)
);

/* ---- Belge türü ve saklama (SET-12) ------------------------------------ */
CREATE TABLE belge_turu (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  ad            TEXT NOT NULL,
  zorunlu       INTEGER NOT NULL DEFAULT 0,
  saklama_ay    INTEGER,
  erisim_sinifi TEXT NOT NULL DEFAULT 'ic',
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  UNIQUE (tenant_id, kod)
);

/* ---- Duyuru (GLB-09) ---------------------------------------------------- */
CREATE TABLE duyuru (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant(id),
  baslik      TEXT NOT NULL,
  govde       TEXT NOT NULL,
  hedef_rol   TEXT,
  yayin_bas   INTEGER NOT NULL,
  yayin_bit   INTEGER,
  teyit_ister INTEGER NOT NULL DEFAULT 0,
  durum       TEXT NOT NULL DEFAULT 'taslak',
  surum       INTEGER NOT NULL DEFAULT 1,
  olusturan   TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen TEXT, guncellendi INTEGER,
  CHECK (durum IN ('taslak','yayinda','arsiv'))
);

CREATE TABLE duyuru_okundu (
  duyuru_id    TEXT NOT NULL REFERENCES duyuru(id) ON DELETE CASCADE,
  kullanici_id TEXT NOT NULL REFERENCES kullanici(id) ON DELETE CASCADE,
  okundu       INTEGER NOT NULL,
  PRIMARY KEY (duyuru_id, kullanici_id)
);
`},
];
