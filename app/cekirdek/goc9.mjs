/* ============================================================================
   GÖÇ G009 — Sözleşme/hakediş (CNT-01..15) ve finans (FIN-01..15)
   ----------------------------------------------------------------------------
   Stok defteriyle AYNI ilke: kasa, banka ve cari bakiyeleri SAKLANMAZ.
   `kasa_hareketi`, `banka_hareketi` ve `cari_hareket` değişmez defterlerdir;
   bakiye her okumada bu defterlerden türetilir ve düzeltme ters kayıtla yapılır
   (değişmez kural 7). Üç defterin de UPDATE/DELETE'i tetikleyiciyle kapalıdır.
   ========================================================================== */

export const GOCLER_9 = [
{ ad: 'G009_sozlesme_finans', sql: `

/* ======================= SÖZLEŞME ======================================= */
CREATE TABLE sozlesme (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  ad            TEXT NOT NULL,
  tur           TEXT NOT NULL DEFAULT 'taseron',
  yon           TEXT NOT NULL DEFAULT 'gider',
  tedarikci_id  TEXT REFERENCES tedarikci(id),
  karsi_taraf   TEXT,
  proje_id      TEXT REFERENCES proje(id),
  santiye_id    TEXT REFERENCES santiye(id),
  /* Sözleşme bedeli KALEMLERDEN türetilir; zeyillerle ayrıca izlenir. */
  tutar_minor   INTEGER NOT NULL DEFAULT 0,
  tutar_birim   TEXT NOT NULL DEFAULT 'TRY',
  baslangic     INTEGER, bitis INTEGER,
  avans_orani_binde     INTEGER NOT NULL DEFAULT 0,
  teminat_orani_binde   INTEGER NOT NULL DEFAULT 0,
  stopaj_orani_binde    INTEGER NOT NULL DEFAULT 0,
  odeme_vadesi_gun INTEGER,
  surum_no      INTEGER NOT NULL DEFAULT 1,
  onceki_surum_id TEXT REFERENCES sozlesme(id),
  revizyon_gerekcesi TEXT,
  durum         TEXT NOT NULL DEFAULT 'taslak',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod, surum_no),
  CHECK (tur IN ('taseron','musteri','tedarik','kira','hizmet','diger')),
  CHECK (yon IN ('gider','gelir')),
  CHECK (durum IN ('taslak','onaya_gonderildi','incelemede','revizyon_istendi','onaylandi','reddedildi','iptal')),
  CHECK (avans_orani_binde BETWEEN 0 AND 100000),
  CHECK (teminat_orani_binde BETWEEN 0 AND 100000),
  CHECK (stopaj_orani_binde BETWEEN 0 AND 100000)
);
CREATE INDEX ix_sozlesme_proje ON sozlesme (proje_id, durum);

CREATE TABLE sozlesme_kalemi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  sozlesme_id   TEXT NOT NULL REFERENCES sozlesme(id) ON DELETE CASCADE,
  poz_no        TEXT NOT NULL,
  sira          INTEGER NOT NULL,
  tanim         TEXT NOT NULL,
  birim         TEXT NOT NULL DEFAULT 'ad',
  miktar_binde  INTEGER NOT NULL,
  birim_fiyat_minor INTEGER NOT NULL,
  birim_fiyat_birim TEXT NOT NULL DEFAULT 'TRY',
  maliyet_kodu  TEXT,
  UNIQUE (sozlesme_id, poz_no),
  CHECK (miktar_binde > 0),
  CHECK (birim_fiyat_minor >= 0)
);

/* Zeyil: sözleşmeyi YERİNDE değiştirmez, farkı taşır (kural 6). */
CREATE TABLE zeyil (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  sozlesme_id   TEXT NOT NULL REFERENCES sozlesme(id),
  kod           TEXT NOT NULL,
  tur           TEXT NOT NULL,
  konu          TEXT NOT NULL,
  tutar_farki_minor INTEGER NOT NULL DEFAULT 0,
  tutar_birim   TEXT NOT NULL DEFAULT 'TRY',
  sure_farki_gun INTEGER NOT NULL DEFAULT 0,
  gerekce       TEXT,
  degisiklik_id TEXT,
  durum         TEXT NOT NULL DEFAULT 'taslak',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (tur IN ('tutar','sure','kapsam','karma')),
  CHECK (durum IN ('taslak','onaya_gonderildi','incelemede','revizyon_istendi','onaylandi','reddedildi','iptal'))
);

CREATE TABLE teminat (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  sozlesme_id   TEXT REFERENCES sozlesme(id),
  tedarikci_id  TEXT REFERENCES tedarikci(id),
  kod           TEXT NOT NULL,
  tur           TEXT NOT NULL,
  bicim         TEXT NOT NULL DEFAULT 'teminat_mektubu',
  tutar_minor   INTEGER NOT NULL,
  tutar_birim   TEXT NOT NULL DEFAULT 'TRY',
  banka         TEXT, mektup_no TEXT,
  veris_tarihi  INTEGER, gecerlilik INTEGER,
  iade_tarihi   INTEGER,
  durum         TEXT NOT NULL DEFAULT 'aktif',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (tur IN ('gecici','kesin','avans','ek')),
  CHECK (bicim IN ('teminat_mektubu','nakit','ipotek','senet')),
  CHECK (tutar_minor > 0),
  CHECK (durum IN ('aktif','iade','nakde_cevrildi','iptal'))
);

/* Metraj: hakedişin miktar kaynağı. ONAYLANMADAN hakedişe giremez. */
CREATE TABLE metraj (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  sozlesme_id   TEXT NOT NULL REFERENCES sozlesme(id),
  kod           TEXT NOT NULL,
  donem         TEXT NOT NULL,
  aciklama      TEXT,
  hakedis_id    TEXT,
  durum         TEXT NOT NULL DEFAULT 'taslak',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (durum IN ('taslak','onaya_gonderildi','incelemede','revizyon_istendi','onaylandi','reddedildi','iptal'))
);

CREATE TABLE metraj_satiri (
  id            TEXT PRIMARY KEY,
  metraj_id     TEXT NOT NULL REFERENCES metraj(id) ON DELETE CASCADE,
  sozlesme_kalemi_id TEXT NOT NULL REFERENCES sozlesme_kalemi(id),
  miktar_binde  INTEGER NOT NULL,
  aciklama      TEXT,
  UNIQUE (metraj_id, sozlesme_kalemi_id),
  CHECK (miktar_binde > 0)
);

/* Hakediş: satırları ONAYLI metrajdan üretilir; tutarlar hesaplanır. */
CREATE TABLE hakedis (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  sozlesme_id   TEXT NOT NULL REFERENCES sozlesme(id),
  kod           TEXT NOT NULL,
  no            INTEGER NOT NULL,
  donem         TEXT NOT NULL,
  /* Aşağıdaki tutarların HEPSİ hesaplanır; hiçbiri formdan gelmez. */
  brut_minor    INTEGER NOT NULL DEFAULT 0,
  onceki_brut_minor INTEGER NOT NULL DEFAULT 0,
  donem_brut_minor  INTEGER NOT NULL DEFAULT 0,
  avans_mahsup_minor INTEGER NOT NULL DEFAULT 0,
  teminat_kesinti_minor INTEGER NOT NULL DEFAULT 0,
  stopaj_minor  INTEGER NOT NULL DEFAULT 0,
  diger_kesinti_minor INTEGER NOT NULL DEFAULT 0,
  net_minor     INTEGER NOT NULL DEFAULT 0,
  tutar_birim   TEXT NOT NULL DEFAULT 'TRY',
  durum         TEXT NOT NULL DEFAULT 'taslak',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  UNIQUE (sozlesme_id, no),
  CHECK (durum IN ('taslak','onaya_gonderildi','incelemede','revizyon_istendi','onaylandi','reddedildi','iptal'))
);

CREATE TABLE hakedis_satiri (
  id            TEXT PRIMARY KEY,
  hakedis_id    TEXT NOT NULL REFERENCES hakedis(id) ON DELETE CASCADE,
  sozlesme_kalemi_id TEXT NOT NULL REFERENCES sozlesme_kalemi(id),
  metraj_id     TEXT REFERENCES metraj(id),
  kumulatif_binde INTEGER NOT NULL,
  onceki_binde  INTEGER NOT NULL DEFAULT 0,
  donem_binde   INTEGER NOT NULL,
  birim_fiyat_minor INTEGER NOT NULL,
  donem_tutar_minor INTEGER NOT NULL,
  CHECK (kumulatif_binde >= 0)
);

/* Değişiklik talebi → değişiklik emri (CNT-10..12) */
CREATE TABLE degisiklik (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  baslik        TEXT NOT NULL,
  aciklama      TEXT,
  proje_id      TEXT REFERENCES proje(id),
  santiye_id    TEXT REFERENCES santiye(id),
  sozlesme_id   TEXT REFERENCES sozlesme(id),
  kaynak_nesne  TEXT, kaynak_id TEXT,
  tutar_etkisi_minor INTEGER NOT NULL DEFAULT 0,
  tutar_birim   TEXT NOT NULL DEFAULT 'TRY',
  sure_etkisi_gun INTEGER NOT NULL DEFAULT 0,
  kapsam_etkisi TEXT,
  zeyil_id      TEXT REFERENCES zeyil(id),
  durum         TEXT NOT NULL DEFAULT 'taslak',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (durum IN ('taslak','onaya_gonderildi','incelemede','revizyon_istendi','onaylandi','reddedildi','iptal'))
);

CREATE TABLE gecikme_olayi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  baslik        TEXT NOT NULL,
  proje_id      TEXT REFERENCES proje(id),
  santiye_id    TEXT REFERENCES santiye(id),
  sozlesme_id   TEXT REFERENCES sozlesme(id),
  tur           TEXT NOT NULL DEFAULT 'hava',
  baslangic     INTEGER NOT NULL,
  bitis         INTEGER,
  etkilenen_gun INTEGER NOT NULL DEFAULT 0,
  sorumluluk    TEXT NOT NULL DEFAULT 'isveren',
  kanit         TEXT,
  aciklama      TEXT,
  durum         TEXT NOT NULL DEFAULT 'acik',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (tur IN ('hava','isveren','taseron','malzeme','ruhsat','mucbir','diger')),
  CHECK (sorumluluk IN ('isveren','yuklenici','ucuncu_taraf','mucbir')),
  CHECK (durum IN ('acik','degerlendirmede','kabul','ret','kapali'))
);

CREATE TABLE sure_uzatim (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  baslik        TEXT NOT NULL,
  sozlesme_id   TEXT REFERENCES sozlesme(id),
  proje_id      TEXT REFERENCES proje(id),
  talep_gun     INTEGER NOT NULL,
  onaylanan_gun INTEGER,
  gerekce       TEXT,
  zeyil_id      TEXT REFERENCES zeyil(id),
  durum         TEXT NOT NULL DEFAULT 'taslak',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (talep_gun > 0),
  CHECK (durum IN ('taslak','onaya_gonderildi','incelemede','revizyon_istendi','onaylandi','reddedildi','iptal'))
);

CREATE TABLE sure_uzatim_olayi (
  sure_uzatim_id TEXT NOT NULL REFERENCES sure_uzatim(id) ON DELETE CASCADE,
  gecikme_id     TEXT NOT NULL REFERENCES gecikme_olayi(id),
  PRIMARY KEY (sure_uzatim_id, gecikme_id)
);

CREATE TABLE claim (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  baslik        TEXT NOT NULL,
  sozlesme_id   TEXT REFERENCES sozlesme(id),
  proje_id      TEXT REFERENCES proje(id),
  tur           TEXT NOT NULL DEFAULT 'maliyet',
  talep_minor   INTEGER NOT NULL DEFAULT 0,
  kabul_minor   INTEGER,
  tutar_birim   TEXT NOT NULL DEFAULT 'TRY',
  dayanak       TEXT,
  son_bildirim_tarihi INTEGER,
  durum         TEXT NOT NULL DEFAULT 'hazirlik',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (tur IN ('maliyet','sure','karma')),
  CHECK (durum IN ('hazirlik','bildirildi','muzakerede','kabul','ret','tahkim','kapali'))
);

/* ======================= FİNANS ========================================= */
CREATE TABLE butce (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  ad            TEXT NOT NULL,
  proje_id      TEXT REFERENCES proje(id),
  santiye_id    TEXT REFERENCES santiye(id),
  yil           INTEGER,
  toplam_minor  INTEGER NOT NULL DEFAULT 0,
  tutar_birim   TEXT NOT NULL DEFAULT 'TRY',
  surum_no      INTEGER NOT NULL DEFAULT 1,
  onceki_surum_id TEXT REFERENCES butce(id),
  revizyon_gerekcesi TEXT,
  durum         TEXT NOT NULL DEFAULT 'taslak',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod, surum_no),
  CHECK (durum IN ('taslak','onaya_gonderildi','incelemede','revizyon_istendi','onaylandi','reddedildi','iptal'))
);

CREATE TABLE butce_satiri (
  id            TEXT PRIMARY KEY,
  butce_id      TEXT NOT NULL REFERENCES butce(id) ON DELETE CASCADE,
  maliyet_kodu  TEXT NOT NULL,
  aciklama      TEXT,
  tutar_minor   INTEGER NOT NULL,
  UNIQUE (butce_id, maliyet_kodu),
  CHECK (tutar_minor >= 0)
);

CREATE TABLE kasa (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  ad            TEXT NOT NULL,
  santiye_id    TEXT REFERENCES santiye(id),
  proje_id      TEXT REFERENCES proje(id),
  para_birimi   TEXT NOT NULL DEFAULT 'TRY',
  sorumlu_id    TEXT REFERENCES kullanici(id),
  /* bakiye SÜTUNU YOKTUR — kasa_hareketi defterinden türetilir (kural 7). */
  durum         TEXT NOT NULL DEFAULT 'aktif',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (durum IN ('aktif','pasif','kapali'))
);

CREATE TABLE kasa_hareketi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kasa_id       TEXT NOT NULL REFERENCES kasa(id),
  tur           TEXT NOT NULL,
  yon           INTEGER NOT NULL,
  tutar_minor   INTEGER NOT NULL,
  tutar_birim   TEXT NOT NULL DEFAULT 'TRY',
  cari_id       TEXT,
  santiye_id    TEXT REFERENCES santiye(id),
  proje_id      TEXT REFERENCES proje(id),
  maliyet_kodu  TEXT,
  belge_no      TEXT,
  aciklama      TEXT,
  kaynak_nesne  TEXT, kaynak_id TEXT,
  ters_kayit_id TEXT REFERENCES kasa_hareketi(id),
  zaman         INTEGER NOT NULL,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  CHECK (yon IN (-1, 1)),
  CHECK (tutar_minor > 0),
  CHECK (tur IN ('tahsilat','odeme','devir_giris','devir_cikis','avans','masraf','duzeltme'))
);
CREATE INDEX ix_kasa_hareket ON kasa_hareketi (kasa_id, zaman);
CREATE TRIGGER trg_kasa_hareket_u BEFORE UPDATE ON kasa_hareketi
BEGIN SELECT RAISE(ABORT, 'Kasa hareketi değiştirilemez; düzeltme ters kayıtla yapılır.'); END;
CREATE TRIGGER trg_kasa_hareket_d BEFORE DELETE ON kasa_hareketi
BEGIN SELECT RAISE(ABORT, 'Kasa hareketi silinemez; düzeltme ters kayıtla yapılır.'); END;

CREATE TABLE banka_hesabi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  ad            TEXT NOT NULL,
  banka         TEXT NOT NULL,
  sube          TEXT,
  iban          TEXT,
  hesap_no      TEXT,
  para_birimi   TEXT NOT NULL DEFAULT 'TRY',
  sirket_id     TEXT REFERENCES sirket(id),
  durum         TEXT NOT NULL DEFAULT 'aktif',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (durum IN ('aktif','pasif','kapali'))
);

CREATE TABLE banka_hareketi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  hesap_id      TEXT NOT NULL REFERENCES banka_hesabi(id),
  tur           TEXT NOT NULL,
  yon           INTEGER NOT NULL,
  tutar_minor   INTEGER NOT NULL,
  tutar_birim   TEXT NOT NULL DEFAULT 'TRY',
  valor         INTEGER,
  aciklama      TEXT,
  karsi_hesap   TEXT,
  banka_referans TEXT,
  cari_id       TEXT,
  /* Eşleştirme: hangi belgeye bağlandı (FIN-09). NULL = eşleşmemiş. */
  eslesen_nesne TEXT, eslesen_id TEXT, eslestiren TEXT REFERENCES kullanici(id),
  eslesme_zamani INTEGER,
  kaynak        TEXT NOT NULL DEFAULT 'elle',
  ters_kayit_id TEXT REFERENCES banka_hareketi(id),
  zaman         INTEGER NOT NULL,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  UNIQUE (hesap_id, banka_referans),
  CHECK (yon IN (-1, 1)),
  CHECK (tutar_minor > 0),
  CHECK (tur IN ('gelen','giden','masraf','faiz','duzeltme')),
  CHECK (kaynak IN ('elle','ekstre','entegrasyon'))
);
CREATE INDEX ix_banka_hareket ON banka_hareketi (hesap_id, zaman);
CREATE TRIGGER trg_banka_hareket_d BEFORE DELETE ON banka_hareketi
BEGIN SELECT RAISE(ABORT, 'Banka hareketi silinemez; düzeltme ters kayıtla yapılır.'); END;
/* Banka hareketinde YALNIZ eşleştirme alanları güncellenebilir; tutar/yön/tarih değişmez. */
CREATE TRIGGER trg_banka_hareket_u BEFORE UPDATE ON banka_hareketi
WHEN OLD.tutar_minor <> NEW.tutar_minor OR OLD.yon <> NEW.yon OR OLD.zaman <> NEW.zaman
  OR OLD.hesap_id <> NEW.hesap_id
BEGIN SELECT RAISE(ABORT, 'Banka hareketinin tutarı, yönü ve tarihi değiştirilemez.'); END;

CREATE TABLE cari (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  unvan         TEXT NOT NULL,
  tur           TEXT NOT NULL DEFAULT 'tedarikci',
  tedarikci_id  TEXT REFERENCES tedarikci(id),
  vergi_no      TEXT,
  para_birimi   TEXT NOT NULL DEFAULT 'TRY',
  /* bakiye SÜTUNU YOKTUR — cari_hareket defterinden türetilir. */
  durum         TEXT NOT NULL DEFAULT 'aktif',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (tur IN ('tedarikci','musteri','personel','kurum','diger')),
  CHECK (durum IN ('aktif','pasif'))
);

CREATE TABLE cari_hareket (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  cari_id       TEXT NOT NULL REFERENCES cari(id),
  tur           TEXT NOT NULL,
  yon           INTEGER NOT NULL,
  tutar_minor   INTEGER NOT NULL,
  tutar_birim   TEXT NOT NULL DEFAULT 'TRY',
  vade          INTEGER,
  aciklama      TEXT,
  kaynak_nesne  TEXT, kaynak_id TEXT,
  ters_kayit_id TEXT REFERENCES cari_hareket(id),
  zaman         INTEGER NOT NULL,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  CHECK (yon IN (-1, 1)),
  CHECK (tutar_minor > 0),
  CHECK (tur IN ('fatura','odeme','tahsilat','hakedis','avans','mahsup','duzeltme'))
);
CREATE INDEX ix_cari_hareket ON cari_hareket (cari_id, zaman);
CREATE TRIGGER trg_cari_hareket_u BEFORE UPDATE ON cari_hareket
BEGIN SELECT RAISE(ABORT, 'Cari hareketi değiştirilemez; düzeltme ters kayıtla yapılır.'); END;
CREATE TRIGGER trg_cari_hareket_d BEFORE DELETE ON cari_hareket
BEGIN SELECT RAISE(ABORT, 'Cari hareketi silinemez; düzeltme ters kayıtla yapılır.'); END;

/* Fatura ve üçlü eşleştirme (FIN-13, FIN-14) */
CREATE TABLE fatura (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  fatura_no     TEXT NOT NULL,
  yon           TEXT NOT NULL DEFAULT 'gelen',
  cari_id       TEXT REFERENCES cari(id),
  tedarikci_id  TEXT REFERENCES tedarikci(id),
  siparis_id    TEXT REFERENCES siparis(id),
  mal_kabul_id  TEXT REFERENCES mal_kabul(id),
  hakedis_id    TEXT REFERENCES hakedis(id),
  fatura_tarihi INTEGER NOT NULL,
  vade_tarihi   INTEGER,
  matrah_minor  INTEGER NOT NULL DEFAULT 0,
  kdv_minor     INTEGER NOT NULL DEFAULT 0,
  toplam_minor  INTEGER NOT NULL DEFAULT 0,
  tutar_birim   TEXT NOT NULL DEFAULT 'TRY',
  /* Üçlü eşleştirme sonucu HESAPLANIR; kullanıcı "eşleşti" diyemez. */
  eslestirme    TEXT NOT NULL DEFAULT 'yapilmadi',
  fark_minor    INTEGER NOT NULL DEFAULT 0,
  fark_gerekcesi TEXT,
  durum         TEXT NOT NULL DEFAULT 'kayitli',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  UNIQUE (tenant_id, yon, fatura_no, tedarikci_id),
  CHECK (yon IN ('gelen','giden')),
  CHECK (eslestirme IN ('yapilmadi','eslesti','tolerans_ici','tolerans_disi','eslesmedi')),
  CHECK (durum IN ('kayitli','eslestirmede','onaya_gonderildi','incelemede','revizyon_istendi',
                   'onaylandi','reddedildi','odendi','iptal'))
);

CREATE TABLE fatura_kalemi (
  id            TEXT PRIMARY KEY,
  fatura_id     TEXT NOT NULL REFERENCES fatura(id) ON DELETE CASCADE,
  siparis_kalemi_id TEXT REFERENCES siparis_kalemi(id),
  sira          INTEGER NOT NULL,
  aciklama      TEXT NOT NULL,
  birim         TEXT NOT NULL DEFAULT 'ad',
  miktar_binde  INTEGER NOT NULL,
  birim_fiyat_minor INTEGER NOT NULL,
  tutar_minor   INTEGER NOT NULL,
  CHECK (miktar_binde > 0)
);

CREATE TABLE odeme (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  baslik        TEXT NOT NULL,
  cari_id       TEXT REFERENCES cari(id),
  fatura_id     TEXT REFERENCES fatura(id),
  hakedis_id    TEXT REFERENCES hakedis(id),
  tutar_minor   INTEGER NOT NULL,
  tutar_birim   TEXT NOT NULL DEFAULT 'TRY',
  planlanan_tarih INTEGER,
  odeme_tarihi  INTEGER,
  yontem        TEXT NOT NULL DEFAULT 'havale',
  kasa_id       TEXT REFERENCES kasa(id),
  banka_hesap_id TEXT REFERENCES banka_hesabi(id),
  durum         TEXT NOT NULL DEFAULT 'taslak',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (tutar_minor > 0),
  CHECK (yontem IN ('havale','eft','nakit','cek','senet','kart')),
  CHECK (durum IN ('taslak','onaya_gonderildi','incelemede','revizyon_istendi','onaylandi',
                   'reddedildi','odendi','iptal'))
);

CREATE TABLE finans_donemi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  donem         TEXT NOT NULL,
  kapatan       TEXT REFERENCES kullanici(id),
  kapandi       INTEGER,
  yeniden_acan  TEXT REFERENCES kullanici(id),
  yeniden_acildi INTEGER,
  gerekce       TEXT,
  durum         TEXT NOT NULL DEFAULT 'acik',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, donem),
  CHECK (durum IN ('acik','kapali'))
);
`},
];
