/* ============================================================================
   GÖÇ G008 — Satın alma ve stok (PRC-01..13, STK-01..10)
   ----------------------------------------------------------------------------
   İki yapısal karar bu şemanın omurgasıdır:

   1) STOK BAKİYESİ SAKLANMAZ. `stok_hareketi` DEĞİŞMEZ bir defterdir; bakiye
      her okumada bu defterden türetilir (kural 7). Tabloda "mevcut_miktar"
      sütunu yoktur — olsaydı defterle ayrışabilirdi.
   2) Miktarlar tamsayı **binde** taşınır (`_binde` son eki): 12,5 m³ → 12500.
      Kayan nokta yasağının (K-004) miktar karşılığıdır; ondalık hatası birikmez.
   ========================================================================== */

export const GOCLER_8 = [
{ ad: 'G008_satinalma_stok', sql: `

/* ---- Tedarikçi (PRC-11..13) -------------------------------------------- */
CREATE TABLE tedarikci (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  unvan         TEXT NOT NULL,
  tur           TEXT NOT NULL DEFAULT 'malzeme',
  vergi_dairesi TEXT, vergi_no TEXT,
  adres TEXT, il TEXT, telefon TEXT, eposta TEXT,
  yetkili       TEXT,
  iban          TEXT,
  odeme_vadesi_gun INTEGER,
  cari_id       TEXT,
  /* Değerlendirme puanı HESAPLANIR (teslim/kalite/fiyat), elle yazılmaz. */
  durum         TEXT NOT NULL DEFAULT 'aktif',
  kara_liste_nedeni TEXT,
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (tur IN ('malzeme','hizmet','taseron','nakliye','kiralama','diger')),
  CHECK (durum IN ('aktif','pasif','kara_liste'))
);

/* ---- Satın alma talebi (PRC-01..03) ------------------------------------ */
CREATE TABLE talep (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  baslik        TEXT NOT NULL,
  aciklama      TEXT,
  proje_id      TEXT REFERENCES proje(id),
  santiye_id    TEXT REFERENCES santiye(id),
  depo_id       TEXT,
  maliyet_kodu  TEXT,
  ihtiyac_tarihi INTEGER,
  oncelik       TEXT NOT NULL DEFAULT 'normal',
  /* Tutar KALEMLERDEN türetilir; onay kademesi bu tutara göre seçilir. */
  tutar_minor   INTEGER NOT NULL DEFAULT 0,
  tutar_birim   TEXT NOT NULL DEFAULT 'TRY',
  durum         TEXT NOT NULL DEFAULT 'taslak',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (oncelik IN ('dusuk','normal','yuksek','kritik')),
  CHECK (durum IN ('taslak','onaya_gonderildi','incelemede','revizyon_istendi','onaylandi','reddedildi','iptal'))
);
CREATE INDEX ix_talep_durum ON talep (tenant_id, durum);

CREATE TABLE talep_kalemi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  talep_id      TEXT NOT NULL REFERENCES talep(id) ON DELETE CASCADE,
  sira          INTEGER NOT NULL,
  stok_karti_id TEXT,
  aciklama      TEXT NOT NULL,
  birim         TEXT NOT NULL DEFAULT 'ad',
  miktar_binde  INTEGER NOT NULL,
  tahmini_fiyat_minor INTEGER,
  tahmini_fiyat_birim TEXT DEFAULT 'TRY',
  /* Siparişe dönüşen miktar — kalan sipariş hesabı buradan türer. */
  siparis_edilen_binde INTEGER NOT NULL DEFAULT 0,
  CHECK (miktar_binde > 0),
  CHECK (siparis_edilen_binde >= 0)
);
CREATE INDEX ix_talep_kalemi ON talep_kalemi (talep_id, sira);

/* ---- Teklif talebi ve teklifler (PRC-04..06) --------------------------- */
CREATE TABLE rfq (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  baslik        TEXT NOT NULL,
  talep_id      TEXT REFERENCES talep(id),
  proje_id      TEXT REFERENCES proje(id),
  santiye_id    TEXT REFERENCES santiye(id),
  son_teklif_tarihi INTEGER,
  sartname      TEXT,
  durum         TEXT NOT NULL DEFAULT 'taslak',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (durum IN ('taslak','gonderildi','toplaniyor','degerlendirmede','sonuclandi','iptal'))
);

/* Tedarikçiye özel TOKEN: dış portal (PRC-05) bu tokenle, oturumsuz açılır.
   Token özeti saklanır; açık değeri yalnız üretim anında görünür (K-008 ilkesi). */
CREATE TABLE rfq_tedarikci (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  rfq_id        TEXT NOT NULL REFERENCES rfq(id) ON DELETE CASCADE,
  tedarikci_id  TEXT NOT NULL REFERENCES tedarikci(id),
  token_ozeti   TEXT,
  token_bitis   INTEGER,
  gonderildi    INTEGER,
  goruntulendi  INTEGER,
  durum         TEXT NOT NULL DEFAULT 'davetli',
  UNIQUE (rfq_id, tedarikci_id),
  CHECK (durum IN ('davetli','goruntulendi','teklif_verdi','reddetti','suresi_gecti'))
);

CREATE TABLE teklif (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  rfq_id        TEXT NOT NULL REFERENCES rfq(id) ON DELETE CASCADE,
  tedarikci_id  TEXT NOT NULL REFERENCES tedarikci(id),
  kod           TEXT NOT NULL,
  gecerlilik    INTEGER,
  teslim_gun    INTEGER,
  odeme_vadesi_gun INTEGER,
  /* Toplam KALEMLERDEN türetilir; elle yazılmaz. */
  toplam_minor  INTEGER NOT NULL DEFAULT 0,
  toplam_birim  TEXT NOT NULL DEFAULT 'TRY',
  notlar        TEXT,
  kaynak        TEXT NOT NULL DEFAULT 'elle',
  durum         TEXT NOT NULL DEFAULT 'alindi',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (rfq_id, tedarikci_id),
  CHECK (kaynak IN ('elle','portal')),
  CHECK (durum IN ('alindi','degerlendirmede','kazandi','kaybetti','iptal'))
);

CREATE TABLE teklif_kalemi (
  id            TEXT PRIMARY KEY,
  teklif_id     TEXT NOT NULL REFERENCES teklif(id) ON DELETE CASCADE,
  talep_kalemi_id TEXT REFERENCES talep_kalemi(id),
  sira          INTEGER NOT NULL,
  aciklama      TEXT NOT NULL,
  birim         TEXT NOT NULL DEFAULT 'ad',
  miktar_binde  INTEGER NOT NULL,
  birim_fiyat_minor INTEGER NOT NULL,
  birim_fiyat_birim TEXT NOT NULL DEFAULT 'TRY',
  CHECK (miktar_binde > 0),
  CHECK (birim_fiyat_minor >= 0)
);

/* ---- Sipariş (PRC-07..10) ---------------------------------------------- */
CREATE TABLE siparis (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  baslik        TEXT NOT NULL,
  tedarikci_id  TEXT NOT NULL REFERENCES tedarikci(id),
  talep_id      TEXT REFERENCES talep(id),
  teklif_id     TEXT REFERENCES teklif(id),
  proje_id      TEXT REFERENCES proje(id),
  santiye_id    TEXT REFERENCES santiye(id),
  depo_id       TEXT,
  maliyet_kodu  TEXT,
  teslim_tarihi INTEGER,
  odeme_vadesi_gun INTEGER,
  tutar_minor   INTEGER NOT NULL DEFAULT 0,
  tutar_birim   TEXT NOT NULL DEFAULT 'TRY',
  surum_no      INTEGER NOT NULL DEFAULT 1,
  onceki_surum_id TEXT REFERENCES siparis(id),
  revizyon_gerekcesi TEXT,
  durum         TEXT NOT NULL DEFAULT 'taslak',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod, surum_no),
  CHECK (durum IN ('taslak','onaya_gonderildi','incelemede','revizyon_istendi','onaylandi','reddedildi','iptal'))
);
CREATE INDEX ix_siparis_tedarikci ON siparis (tedarikci_id, durum);

CREATE TABLE siparis_kalemi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  siparis_id    TEXT NOT NULL REFERENCES siparis(id) ON DELETE CASCADE,
  talep_kalemi_id TEXT REFERENCES talep_kalemi(id),
  stok_karti_id TEXT,
  sira          INTEGER NOT NULL,
  aciklama      TEXT NOT NULL,
  birim         TEXT NOT NULL DEFAULT 'ad',
  miktar_binde  INTEGER NOT NULL,
  birim_fiyat_minor INTEGER NOT NULL,
  birim_fiyat_birim TEXT NOT NULL DEFAULT 'TRY',
  /* Teslim alınan ve faturalanan miktar — üçlü eşleştirmenin iki ayağı. */
  teslim_binde  INTEGER NOT NULL DEFAULT 0,
  faturalanan_binde INTEGER NOT NULL DEFAULT 0,
  CHECK (miktar_binde > 0),
  CHECK (birim_fiyat_minor >= 0),
  CHECK (teslim_binde >= 0),
  CHECK (faturalanan_binde >= 0)
);
CREATE INDEX ix_siparis_kalemi ON siparis_kalemi (siparis_id, sira);

/* ---- Depo ve stok kartı (STK-01, STK-02) ------------------------------- */
CREATE TABLE depo (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  ad            TEXT NOT NULL,
  tur           TEXT NOT NULL DEFAULT 'santiye',
  santiye_id    TEXT REFERENCES santiye(id),
  proje_id      TEXT REFERENCES proje(id),
  adres         TEXT,
  sorumlu_id    TEXT REFERENCES kullanici(id),
  durum         TEXT NOT NULL DEFAULT 'aktif',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (tur IN ('santiye','merkez','transit','yemekhane','atolye')),
  CHECK (durum IN ('aktif','pasif','kapali'))
);

CREATE TABLE stok_karti (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  ad            TEXT NOT NULL,
  kategori      TEXT,
  birim         TEXT NOT NULL DEFAULT 'ad',
  maliyet_kodu  TEXT,
  kritik_seviye_binde INTEGER NOT NULL DEFAULT 0,
  raf_omru_gun  INTEGER,
  /* mevcut_miktar SÜTUNU YOKTUR: bakiye hareket defterinden türetilir (kural 7). */
  durum         TEXT NOT NULL DEFAULT 'aktif',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (durum IN ('aktif','pasif')),
  CHECK (kritik_seviye_binde >= 0)
);

/* ---- Mal kabul (STK-03..05) -------------------------------------------- */
CREATE TABLE mal_kabul (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  siparis_id    TEXT REFERENCES siparis(id),
  tedarikci_id  TEXT REFERENCES tedarikci(id),
  depo_id       TEXT NOT NULL REFERENCES depo(id),
  santiye_id    TEXT REFERENCES santiye(id),
  proje_id      TEXT REFERENCES proje(id),
  irsaliye_no   TEXT,
  irsaliye_tarihi INTEGER,
  teslim_alan_id TEXT REFERENCES kullanici(id),
  notlar        TEXT,
  durum         TEXT NOT NULL DEFAULT 'taslak',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (durum IN ('taslak','kontrolde','kabul','kismi_kabul','ret','iptal'))
);
CREATE INDEX ix_mal_kabul_siparis ON mal_kabul (siparis_id, durum);

CREATE TABLE mal_kabul_kalemi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  mal_kabul_id  TEXT NOT NULL REFERENCES mal_kabul(id) ON DELETE CASCADE,
  siparis_kalemi_id TEXT REFERENCES siparis_kalemi(id),
  stok_karti_id TEXT REFERENCES stok_karti(id),
  sira          INTEGER NOT NULL,
  aciklama      TEXT NOT NULL,
  birim         TEXT NOT NULL DEFAULT 'ad',
  gelen_binde   INTEGER NOT NULL,
  kabul_binde   INTEGER NOT NULL DEFAULT 0,
  ret_binde     INTEGER NOT NULL DEFAULT 0,
  ret_nedeni    TEXT,
  ncr_id        TEXT REFERENCES ncr(id),
  CHECK (gelen_binde > 0),
  CHECK (kabul_binde >= 0 AND ret_binde >= 0),
  CHECK (kabul_binde + ret_binde <= gelen_binde)
);

/* ---- Stok hareket defteri (STK-07, 08, 10) ------------------------------
   DEĞİŞMEZ: satır güncellenmez, silinmez. Düzeltme TERS KAYITLA yapılır.
   Bunu tetikleyiciyle zorluyoruz — uygulama hatası defteri bozamaz. */
CREATE TABLE stok_hareketi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  depo_id       TEXT NOT NULL REFERENCES depo(id),
  stok_karti_id TEXT NOT NULL REFERENCES stok_karti(id),
  tur           TEXT NOT NULL,
  yon           INTEGER NOT NULL,
  miktar_binde  INTEGER NOT NULL,
  birim_maliyet_minor INTEGER,
  birim_maliyet_birim TEXT DEFAULT 'TRY',
  santiye_id    TEXT REFERENCES santiye(id),
  proje_id      TEXT REFERENCES proje(id),
  maliyet_kodu  TEXT,
  kaynak_nesne  TEXT, kaynak_id TEXT,
  ters_kayit_id TEXT REFERENCES stok_hareketi(id),
  aciklama      TEXT,
  zaman         INTEGER NOT NULL,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  CHECK (tur IN ('giris','cikis','transfer_cikis','transfer_giris','sarf','iade','sayim_fazla','sayim_eksik','duzeltme')),
  CHECK (yon IN (-1, 1)),
  CHECK (miktar_binde > 0)
);
CREATE INDEX ix_stok_hareket_kart ON stok_hareketi (depo_id, stok_karti_id, zaman);
CREATE INDEX ix_stok_hareket_kaynak ON stok_hareketi (kaynak_nesne, kaynak_id);

CREATE TRIGGER trg_stok_hareket_degismez_u BEFORE UPDATE ON stok_hareketi
BEGIN
  SELECT RAISE(ABORT, 'Stok hareketi değiştirilemez; düzeltme ters kayıtla yapılır.');
END;
CREATE TRIGGER trg_stok_hareket_degismez_d BEFORE DELETE ON stok_hareketi
BEGIN
  SELECT RAISE(ABORT, 'Stok hareketi silinemez; düzeltme ters kayıtla yapılır.');
END;

/* ---- Rezervasyon (STK-06) ---------------------------------------------- */
CREATE TABLE stok_rezervasyonu (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  depo_id       TEXT NOT NULL REFERENCES depo(id),
  stok_karti_id TEXT NOT NULL REFERENCES stok_karti(id),
  miktar_binde  INTEGER NOT NULL,
  santiye_id    TEXT REFERENCES santiye(id),
  is_emri_id    TEXT REFERENCES is_emri(id),
  gerekce       TEXT,
  gecerlilik    INTEGER,
  durum         TEXT NOT NULL DEFAULT 'aktif',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  CHECK (miktar_binde > 0),
  CHECK (durum IN ('aktif','kullanildi','iptal','suresi_doldu'))
);
CREATE INDEX ix_rezervasyon ON stok_rezervasyonu (depo_id, stok_karti_id, durum);

/* ---- Transfer (STK-07) — iki hareketli tek belge ------------------------ */
CREATE TABLE stok_transferi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  kaynak_depo_id TEXT NOT NULL REFERENCES depo(id),
  hedef_depo_id TEXT NOT NULL REFERENCES depo(id),
  aciklama      TEXT,
  sevk_tarihi   INTEGER,
  durum         TEXT NOT NULL DEFAULT 'taslak',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (kaynak_depo_id <> hedef_depo_id),
  CHECK (durum IN ('taslak','yolda','tamamlandi','iptal'))
);

CREATE TABLE stok_transfer_kalemi (
  id            TEXT PRIMARY KEY,
  transfer_id   TEXT NOT NULL REFERENCES stok_transferi(id) ON DELETE CASCADE,
  stok_karti_id TEXT NOT NULL REFERENCES stok_karti(id),
  miktar_binde  INTEGER NOT NULL,
  CHECK (miktar_binde > 0)
);

/* ---- Sayım (STK-09) ----------------------------------------------------- */
CREATE TABLE stok_sayimi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  depo_id       TEXT NOT NULL REFERENCES depo(id),
  sayim_tarihi  INTEGER NOT NULL,
  sorumlu_id    TEXT REFERENCES kullanici(id),
  notlar        TEXT,
  durum         TEXT NOT NULL DEFAULT 'taslak',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (durum IN ('taslak','sayiliyor','onaya_gonderildi','incelemede','revizyon_istendi','onaylandi','reddedildi','iptal'))
);

CREATE TABLE stok_sayim_satiri (
  id            TEXT PRIMARY KEY,
  sayim_id      TEXT NOT NULL REFERENCES stok_sayimi(id) ON DELETE CASCADE,
  stok_karti_id TEXT NOT NULL REFERENCES stok_karti(id),
  /* Defter bakiyesi sayım anında DONDURULUR: fark sonradan değişmez. */
  defter_binde  INTEGER NOT NULL,
  sayilan_binde INTEGER NOT NULL,
  fark_binde    INTEGER NOT NULL,
  gerekce       TEXT,
  UNIQUE (sayim_id, stok_karti_id),
  CHECK (sayilan_binde >= 0)
);
`},
];
