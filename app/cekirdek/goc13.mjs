/* ============================================================================
   GÖÇ G013 — Müşteri/satış (EXT-01..03) ve dış portal erişimi (EXT-04..06)
   ----------------------------------------------------------------------------
   Bu ürün bir CRM DEĞİLDİR: buradaki "müşteri" bir inşaat sözleşmesinin
   İŞVEREN tarafıdır, "fırsat" ise henüz sözleşmeye dönmemiş iş imkânıdır.
   Satış hunisi değil, PROJE KAYNAĞI olarak modellenir: fırsat kazanılınca
   proje ve sözleşme açılır.

   PORTAL ERİŞİMİ OTURUMSUZDUR (K-069 kalıbı): erişim tokenle olur, token
   AÇIK SAKLANMAZ (yalnız SHA-256 özeti), süre sonunda kapanır ve kapsam
   tek bir projeye/carîye daraltılır.
   ========================================================================== */

export const GOCLER_13 = [
{ ad: 'G013_musteri_portal', sql: `

CREATE TABLE musteri (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  ad            TEXT NOT NULL,
  tur           TEXT NOT NULL DEFAULT 'isveren',
  vergi_no      TEXT, vergi_dairesi TEXT,
  yetkili       TEXT, telefon TEXT, eposta TEXT, adres TEXT,
  cari_id       TEXT REFERENCES cari(id),
  durum         TEXT NOT NULL DEFAULT 'aktif',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (tur IN ('isveren','musteri','kurum','musavir','ortak')),
  CHECK (durum IN ('aktif','pasif','kara_liste'))
);

/* Fırsat: sözleşmeye dönmemiş iş imkânı. Kazanıldığında PROJE açılır. */
CREATE TABLE firsat (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  musteri_id    TEXT REFERENCES musteri(id),
  kod           TEXT NOT NULL,
  baslik        TEXT NOT NULL,
  aciklama      TEXT,
  tahmini_bedel_minor INTEGER NOT NULL DEFAULT 0,
  tutar_birim   TEXT NOT NULL DEFAULT 'TRY',
  ihale_tarihi  INTEGER,
  proje_id      TEXT REFERENCES proje(id),
  kayip_nedeni  TEXT,
  durum         TEXT NOT NULL DEFAULT 'aday',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (durum IN ('aday','degerlendirmede','teklif_verildi','kazanildi','kaybedildi','iptal'))
);

/* Verilen teklif — GELEN tekliften (satın alma \`teklif\`) ayrı tablodur:
   biri bizim aldığımız, diğeri bizim verdiğimiz tekliftir. */
CREATE TABLE satis_teklifi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  firsat_id     TEXT REFERENCES firsat(id),
  musteri_id    TEXT REFERENCES musteri(id),
  kod           TEXT NOT NULL,
  baslik        TEXT NOT NULL,
  gecerlilik    INTEGER,
  tutar_minor   INTEGER NOT NULL DEFAULT 0,
  tutar_birim   TEXT NOT NULL DEFAULT 'TRY',
  surum_no      INTEGER NOT NULL DEFAULT 1,
  onceki_surum_id TEXT REFERENCES satis_teklifi(id),
  sozlesme_id   TEXT REFERENCES sozlesme(id),
  durum         TEXT NOT NULL DEFAULT 'taslak',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod, surum_no),
  CHECK (durum IN ('taslak','onaya_gonderildi','incelemede','revizyon_istendi',
                   'onaylandi','reddedildi','gonderildi','kabul','ret','iptal'))
);

/* --- Dış portal erişimi (EXT-04..06) ------------------------------------- */
/* K-069 kalıbı: oturumsuz, tokenli, süreli, kapsamı DARALTILMIŞ erişim.
   Token AÇIK saklanmaz; yalnız özeti tutulur. */
CREATE TABLE portal_erisimi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  tur           TEXT NOT NULL,
  musteri_id    TEXT REFERENCES musteri(id),
  tedarikci_id  TEXT REFERENCES tedarikci(id),
  proje_id      TEXT REFERENCES proje(id),
  santiye_id    TEXT REFERENCES santiye(id),
  sozlesme_id   TEXT REFERENCES sozlesme(id),
  eposta        TEXT NOT NULL,
  ad_soyad      TEXT,
  token_ozeti   TEXT NOT NULL,
  token_bitis   INTEGER NOT NULL,
  son_erisim    INTEGER,
  erisim_sayisi INTEGER NOT NULL DEFAULT 0,
  durum         TEXT NOT NULL DEFAULT 'aktif',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (token_ozeti),
  CHECK (tur IN ('musteri','taseron','tedarikci')),
  CHECK (durum IN ('aktif','kapali','suresi_doldu'))
);
CREATE INDEX ix_portal_erisim ON portal_erisimi (tenant_id, tur, durum);

/* --- Mobil senkron kuyruğu (EXT-07, EXT-08, AST-11) ----------------------- */
/* Çevrimdışı taslak SITE-01 kalıbını tekrar eder: istemci kimliği tekildir,
   çift gönderimde TEK KAYIT oluşur. */
CREATE TABLE senkron_kuyrugu (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenant(id),
  kullanici_id    TEXT REFERENCES kullanici(id),
  istemci_kimligi TEXT NOT NULL,
  nesne           TEXT NOT NULL,
  yuk             TEXT NOT NULL,
  sonuc_nesne_id  TEXT,
  hata_mesaji     TEXT,
  durum           TEXT NOT NULL DEFAULT 'bekliyor',
  olusturuldu     INTEGER NOT NULL,
  islendi         INTEGER,
  UNIQUE (tenant_id, istemci_kimligi),
  CHECK (durum IN ('bekliyor','islendi','mukerrer','hatali'))
);
`},
];
