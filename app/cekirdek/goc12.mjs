/* ============================================================================
   GÖÇ G012 — Rapor zamanlaması (RPT-14) ve arşiv işleri (SET-17)
   ========================================================================== */

export const GOCLER_12 = [
{ ad: 'G012_rapor_arsiv', sql: `

CREATE TABLE rapor_zamanlamasi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  rapor_kod     TEXT NOT NULL,
  periyot       TEXT NOT NULL DEFAULT 'aylik',
  bicim         TEXT NOT NULL DEFAULT 'pdf',
  alicilar      TEXT NOT NULL,
  filtre        TEXT,
  son_uretim    INTEGER,
  durum         TEXT NOT NULL DEFAULT 'aktif',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  CHECK (periyot IN ('gunluk','haftalik','aylik')),
  CHECK (bicim IN ('pdf','xlsx','csv')),
  CHECK (durum IN ('aktif','pasif'))
);

/* --- SET-17 arşiv ve saklama işleri -------------------------------------- */
/* Saklama süresi dolan belge SİLİNMEZ, önce ARŞİV İŞİ açılır ve karar
   kayıt altına alınır; silme geri alınamaz bir işlemdir. */
CREATE TABLE arsiv_isi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  nesne         TEXT NOT NULL,
  nesne_id      TEXT,
  belge_turu    TEXT,
  eylem         TEXT NOT NULL DEFAULT 'arsivle',
  saklama_bitis INTEGER,
  gerekce       TEXT,
  karar_veren   TEXT REFERENCES kullanici(id),
  karar_zamani  INTEGER,
  durum         TEXT NOT NULL DEFAULT 'bekliyor',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (eylem IN ('arsivle','anonimlestir','sil')),
  CHECK (durum IN ('bekliyor','onaylandi','uygulandi','reddedildi','iptal'))
);
CREATE INDEX ix_arsiv_isi ON arsiv_isi (tenant_id, durum, saklama_bitis);
`},
];
