/* ============================================================================
   GÖÇ G010 — Varlık ve filo (AST-01..10)
   ----------------------------------------------------------------------------
   Araçlar AYRI TABLO DEĞİLDİR: `varlik` tablosunun `tur = 'arac'` görünümüdür
   (kural 4). Bakım iş emri de ayrı tablo değildir; `is_emri` tablosuna
   `varlik_id` eklenerek aynı geçiş motoruna bağlanır.
   ========================================================================== */

export const GOCLER_10 = [
{ ad: 'G010_varlik_filo', sql: `

ALTER TABLE is_emri ADD COLUMN varlik_id TEXT REFERENCES varlik(id);
ALTER TABLE is_emri ADD COLUMN bakim_plani_id TEXT;

CREATE TABLE varlik (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenant(id),
  kod            TEXT NOT NULL,
  ad             TEXT NOT NULL,
  tur            TEXT NOT NULL DEFAULT 'demirbas',
  kategori       TEXT,
  marka TEXT, model TEXT, seri_no TEXT,
  plaka          TEXT,
  yil            INTEGER,
  santiye_id     TEXT REFERENCES santiye(id),
  proje_id       TEXT REFERENCES proje(id),
  sahiplik       TEXT NOT NULL DEFAULT 'mulk',
  tedarikci_id   TEXT REFERENCES tedarikci(id),
  alis_tarihi    INTEGER,
  alis_bedeli_minor INTEGER, alis_bedeli_birim TEXT DEFAULT 'TRY',
  /* Sayaç (km/saat) SAKLANIR ama yalnız ileri gider: geri alma yasak. */
  sayac_turu     TEXT NOT NULL DEFAULT 'yok',
  sayac_deger    INTEGER NOT NULL DEFAULT 0,
  durum          TEXT NOT NULL DEFAULT 'aktif',
  surum          INTEGER NOT NULL DEFAULT 1,
  olusturan      TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen    TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (tur IN ('demirbas','makine','arac','ekipman','kalip','iskele','diger')),
  CHECK (sahiplik IN ('mulk','kiralik','leasing','taseron')),
  CHECK (sayac_turu IN ('yok','km','saat')),
  CHECK (sayac_deger >= 0),
  CHECK (durum IN ('aktif','bakimda','arizali','kullanim_disi','satildi','hurda'))
);
CREATE INDEX ix_varlik_tur ON varlik (tenant_id, tur, durum);

CREATE TABLE zimmet (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenant(id),
  varlik_id      TEXT NOT NULL REFERENCES varlik(id),
  personel_id    TEXT REFERENCES personel(id),
  kullanici_id   TEXT REFERENCES kullanici(id),
  santiye_id     TEXT REFERENCES santiye(id),
  teslim_tarihi  INTEGER NOT NULL,
  iade_tarihi    INTEGER,
  teslim_notu    TEXT, iade_notu TEXT,
  durum          TEXT NOT NULL DEFAULT 'zimmetli',
  surum          INTEGER NOT NULL DEFAULT 1,
  olusturan      TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen    TEXT, guncellendi INTEGER,
  CHECK (durum IN ('zimmetli','iade','devir','hasarli','kayip')),
  CHECK (iade_tarihi IS NULL OR iade_tarihi >= teslim_tarihi)
);
CREATE INDEX ix_zimmet_varlik ON zimmet (varlik_id, durum);

CREATE TABLE bakim_plani (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenant(id),
  varlik_id      TEXT NOT NULL REFERENCES varlik(id) ON DELETE CASCADE,
  ad             TEXT NOT NULL,
  tur            TEXT NOT NULL DEFAULT 'periyodik',
  periyot_gun    INTEGER,
  periyot_sayac  INTEGER,
  son_bakim_tarihi INTEGER,
  son_bakim_sayac  INTEGER,
  talimat        TEXT,
  durum          TEXT NOT NULL DEFAULT 'aktif',
  surum          INTEGER NOT NULL DEFAULT 1,
  olusturan      TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen    TEXT, guncellendi INTEGER,
  CHECK (tur IN ('periyodik','sayac','karma')),
  CHECK (durum IN ('aktif','pasif')),
  CHECK (periyot_gun IS NULL OR periyot_gun > 0),
  CHECK (periyot_sayac IS NULL OR periyot_sayac > 0)
);

/* Kalibrasyon ve periyodik kontrol: süresi dolan varlık KULLANIM DIŞI sayılır. */
CREATE TABLE varlik_kontrolu (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenant(id),
  varlik_id      TEXT NOT NULL REFERENCES varlik(id) ON DELETE CASCADE,
  tur            TEXT NOT NULL,
  ad             TEXT NOT NULL,
  kurum          TEXT, belge_no TEXT,
  kontrol_tarihi INTEGER NOT NULL,
  gecerlilik     INTEGER,
  sonuc          TEXT NOT NULL DEFAULT 'uygun',
  notlar         TEXT,
  durum          TEXT NOT NULL DEFAULT 'gecerli',
  surum          INTEGER NOT NULL DEFAULT 1,
  olusturan      TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen    TEXT, guncellendi INTEGER,
  CHECK (tur IN ('kalibrasyon','periyodik_kontrol','muayene','sigorta','egzoz','fenni')),
  CHECK (sonuc IN ('uygun','uygun_degil','sartli')),
  CHECK (durum IN ('gecerli','iptal'))
);
CREATE INDEX ix_varlik_kontrol ON varlik_kontrolu (varlik_id, gecerlilik);

CREATE TABLE yakit_kaydi (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenant(id),
  varlik_id      TEXT NOT NULL REFERENCES varlik(id),
  tarih          INTEGER NOT NULL,
  sayac_deger    INTEGER NOT NULL,
  litre_binde    INTEGER NOT NULL,
  tutar_minor    INTEGER, tutar_birim TEXT DEFAULT 'TRY',
  istasyon       TEXT, fis_no TEXT,
  surucu_id      TEXT REFERENCES personel(id),
  santiye_id     TEXT REFERENCES santiye(id),
  olusturan      TEXT, olusturuldu INTEGER NOT NULL,
  CHECK (litre_binde > 0),
  CHECK (sayac_deger >= 0)
);
CREATE INDEX ix_yakit_varlik ON yakit_kaydi (varlik_id, tarih);

CREATE TABLE arac_olayi (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenant(id),
  varlik_id      TEXT NOT NULL REFERENCES varlik(id),
  kod            TEXT NOT NULL,
  tur            TEXT NOT NULL,
  olay_tarihi    INTEGER NOT NULL,
  yer            TEXT,
  surucu_id      TEXT REFERENCES personel(id),
  aciklama       TEXT,
  tutar_minor    INTEGER, tutar_birim TEXT DEFAULT 'TRY',
  odendi         INTEGER NOT NULL DEFAULT 0,
  isg_olayi_id   TEXT REFERENCES isg_olayi(id),
  durum          TEXT NOT NULL DEFAULT 'acik',
  surum          INTEGER NOT NULL DEFAULT 1,
  olusturan      TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen    TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (tur IN ('kaza','ceza','hasar','ariza','cekici')),
  CHECK (durum IN ('acik','islemde','kapali','iptal'))
);
`},
];
