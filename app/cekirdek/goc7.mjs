/* ============================================================================
   GÖÇ G007 — Program revizyon zinciri, görev şablonu, iş emri, toplantı,
              İSG saha kayıtları ve proje organizasyonu
   ========================================================================== */

export const GOCLER_7 = [
{ ad: 'G007_plan_gorev_isg', sql: `

/* Program revizyonu YENİ SÜRÜM açar; önceki sürüm değişmez kalır (kural 6). */
ALTER TABLE is_programi ADD COLUMN onceki_surum_id TEXT REFERENCES is_programi(id);
ALTER TABLE is_programi ADD COLUMN revizyon_gerekcesi TEXT;

/* ---- Görev şablonu (TASK-04, TASK-05) ---------------------------------- */
CREATE TABLE gorev_sablonu (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  kod          TEXT NOT NULL,
  ad           TEXT NOT NULL,
  aciklama     TEXT,
  kategori     TEXT,
  varsayilan_oncelik TEXT NOT NULL DEFAULT 'normal',
  sure_gun     INTEGER,
  durum        TEXT NOT NULL DEFAULT 'aktif',
  surum        INTEGER NOT NULL DEFAULT 1,
  olusturan    TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen  TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (varsayilan_oncelik IN ('dusuk','normal','yuksek','kritik')),
  CHECK (durum IN ('aktif','pasif'))
);

CREATE TABLE gorev_sablon_kalemi (
  id           TEXT PRIMARY KEY,
  sablon_id    TEXT NOT NULL REFERENCES gorev_sablonu(id) ON DELETE CASCADE,
  sira         INTEGER NOT NULL,
  baslik       TEXT NOT NULL,
  aciklama     TEXT,
  oncelik      TEXT NOT NULL DEFAULT 'normal',
  gun_ofseti   INTEGER NOT NULL DEFAULT 0,
  CHECK (oncelik IN ('dusuk','normal','yuksek','kritik'))
);
CREATE INDEX ix_sablon_kalemi ON gorev_sablon_kalemi (sablon_id, sira);

/* ---- İş emri (TASK-06, TASK-07) ---------------------------------------- */
CREATE TABLE is_emri (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  baslik        TEXT NOT NULL,
  tur           TEXT NOT NULL DEFAULT 'imalat',
  aciklama      TEXT,
  proje_id      TEXT REFERENCES proje(id),
  santiye_id    TEXT REFERENCES santiye(id),
  aktivite_id   TEXT REFERENCES aktivite(id),
  sorumlu_id    TEXT REFERENCES kullanici(id),
  ekip          TEXT,
  oncelik       TEXT NOT NULL DEFAULT 'normal',
  planlanan_baslangic INTEGER,
  termin        INTEGER,
  tahmini_saat  INTEGER,
  gerceklesen_saat INTEGER,
  bloke         INTEGER NOT NULL DEFAULT 0,
  bloke_nedeni  TEXT,
  kaynak_nesne  TEXT, kaynak_id TEXT,
  durum         TEXT NOT NULL DEFAULT 'taslak',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (tur IN ('imalat','bakim','onarim','kurulum','sokum','diger')),
  CHECK (oncelik IN ('dusuk','normal','yuksek','kritik')),
  CHECK (durum IN ('taslak','atama_bekliyor','acik','devam_ediyor','dogrulamada','tamamlandi','iptal'))
);
CREATE INDEX ix_is_emri_santiye ON is_emri (santiye_id, durum);

/* ---- Toplantı ve tutanak (TASK-08, TASK-09) ---------------------------- */
CREATE TABLE toplanti (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  baslik        TEXT NOT NULL,
  tur           TEXT NOT NULL DEFAULT 'saha',
  proje_id      TEXT REFERENCES proje(id),
  santiye_id    TEXT REFERENCES santiye(id),
  baslangic     INTEGER NOT NULL,
  bitis         INTEGER,
  yer           TEXT,
  gundem        TEXT,
  katilimcilar  TEXT,
  tutanak       TEXT,
  tutanak_id    TEXT REFERENCES dokuman(id),
  durum         TEXT NOT NULL DEFAULT 'planlandi',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (tur IN ('saha','koordinasyon','musteri','isg','kalite','ic','diger')),
  CHECK (durum IN ('planlandi','yapildi','tutanak_onayinda','kapali','iptal')),
  CHECK (bitis IS NULL OR bitis >= baslangic)
);
CREATE INDEX ix_toplanti_tarih ON toplanti (tenant_id, baslangic);

/* Toplantı kararı GÖREVE dönüşür: karar satırı görev kimliğini taşır (§7). */
CREATE TABLE toplanti_karari (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  toplanti_id   TEXT NOT NULL REFERENCES toplanti(id) ON DELETE CASCADE,
  sira          INTEGER NOT NULL,
  karar         TEXT NOT NULL,
  sorumlu_id    TEXT REFERENCES kullanici(id),
  termin        INTEGER,
  gorev_id      TEXT REFERENCES gorev(id),
  olusturan     TEXT, olusturuldu INTEGER NOT NULL
);
CREATE INDEX ix_toplanti_karari ON toplanti_karari (toplanti_id, sira);

/* ---- İSG saha kayıtları (HSE-07..11) ----------------------------------- */
CREATE TABLE isg_denetimi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  santiye_id    TEXT REFERENCES santiye(id),
  proje_id      TEXT REFERENCES proje(id),
  kod           TEXT NOT NULL,
  baslik        TEXT NOT NULL,
  tur           TEXT NOT NULL DEFAULT 'periyodik',
  denetim_tarihi INTEGER NOT NULL,
  denetci_id    TEXT REFERENCES kullanici(id),
  kontrol_sayisi INTEGER NOT NULL DEFAULT 0,
  uygunsuzluk_sayisi INTEGER NOT NULL DEFAULT 0,
  puan_binde    INTEGER,
  bulgular      TEXT,
  isg_olayi_id  TEXT REFERENCES isg_olayi(id),
  durum         TEXT NOT NULL DEFAULT 'yeni',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (tur IN ('periyodik','ani','resmi','taseron')),
  CHECK (durum IN ('yeni','siniflandirildi','atandi','islemde','dogrulamada','kapali','iptal')),
  CHECK (puan_binde IS NULL OR puan_binde BETWEEN 0 AND 100000)
);

CREATE TABLE toolbox (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  santiye_id    TEXT REFERENCES santiye(id),
  konu          TEXT NOT NULL,
  tarih         INTEGER NOT NULL,
  anlatan_id    TEXT REFERENCES kullanici(id),
  sure_dk       INTEGER,
  katilimci_sayisi INTEGER NOT NULL DEFAULT 0,
  katilimcilar  TEXT,
  notlar        TEXT,
  durum         TEXT NOT NULL DEFAULT 'yapildi',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  CHECK (durum IN ('yapildi','iptal'))
);
CREATE INDEX ix_toolbox_santiye ON toolbox (santiye_id, tarih);

CREATE TABLE isg_egitimi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  santiye_id    TEXT REFERENCES santiye(id),
  ad            TEXT NOT NULL,
  tur           TEXT NOT NULL DEFAULT 'temel',
  tarih         INTEGER NOT NULL,
  gecerlilik_ay INTEGER,
  egitmen       TEXT,
  sure_saat     INTEGER,
  durum         TEXT NOT NULL DEFAULT 'tamamlandi',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  CHECK (tur IN ('temel','ise_giris','yuksekte_calisma','kapali_alan','ilk_yardim','yangin','diger')),
  CHECK (durum IN ('planlandi','tamamlandi','iptal'))
);

/* Eğitim katılımı personelin YETKINLIK kaydını üretir — belge zinciri tek yerde. */
CREATE TABLE isg_egitim_katilimi (
  id            TEXT PRIMARY KEY,
  egitim_id     TEXT NOT NULL REFERENCES isg_egitimi(id) ON DELETE CASCADE,
  personel_id   TEXT NOT NULL REFERENCES personel(id) ON DELETE CASCADE,
  yetkinlik_id  TEXT REFERENCES yetkinlik(id),
  sonuc         TEXT NOT NULL DEFAULT 'katildi',
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  UNIQUE (egitim_id, personel_id),
  CHECK (sonuc IN ('katildi','katilmadi','basarisiz'))
);

CREATE TABLE kkd_zimmeti (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  santiye_id    TEXT REFERENCES santiye(id),
  personel_id   TEXT NOT NULL REFERENCES personel(id),
  kkd_turu      TEXT NOT NULL,
  aciklama      TEXT,
  adet          INTEGER NOT NULL DEFAULT 1,
  teslim_tarihi INTEGER NOT NULL,
  iade_tarihi   INTEGER,
  sonraki_kontrol INTEGER,
  durum         TEXT NOT NULL DEFAULT 'zimmetli',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  CHECK (adet > 0),
  CHECK (durum IN ('zimmetli','iade','hasarli','kayip')),
  CHECK (iade_tarihi IS NULL OR iade_tarihi >= teslim_tarihi)
);
CREATE INDEX ix_kkd_personel ON kkd_zimmeti (personel_id, durum);

CREATE TABLE atik_kaydi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  santiye_id    TEXT REFERENCES santiye(id),
  tur           TEXT NOT NULL,
  atik_kodu     TEXT,
  miktar_kg     INTEGER NOT NULL DEFAULT 0,
  bertaraf_yontemi TEXT,
  tasiyici      TEXT,
  irsaliye_no   TEXT,
  tarih         INTEGER NOT NULL,
  durum         TEXT NOT NULL DEFAULT 'kayitli',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  CHECK (tur IN ('tehlikeli','tehlikesiz','hafriyat','ambalaj','metal','beton','diger')),
  CHECK (miktar_kg >= 0),
  CHECK (durum IN ('kayitli','bertaraf_edildi','iptal'))
);
CREATE INDEX ix_atik_santiye ON atik_kaydi (santiye_id, tarih);

/* ---- Proje organizasyonu (PRJ-06) -------------------------------------- */
CREATE TABLE proje_organizasyonu (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  proje_id      TEXT NOT NULL REFERENCES proje(id) ON DELETE CASCADE,
  kullanici_id  TEXT REFERENCES kullanici(id),
  personel_id   TEXT REFERENCES personel(id),
  gorev_unvani  TEXT NOT NULL,
  sorumluluk    TEXT,
  ust_id        TEXT REFERENCES proje_organizasyonu(id),
  baslangic     INTEGER,
  bitis         INTEGER,
  durum         TEXT NOT NULL DEFAULT 'aktif',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  CHECK (durum IN ('aktif','sonlandi'))
);
CREATE INDEX ix_proje_org ON proje_organizasyonu (proje_id, durum);
`},
];
