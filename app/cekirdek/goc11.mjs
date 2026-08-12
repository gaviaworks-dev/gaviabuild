/* ============================================================================
   GÖÇ G011 — Kartlar modülü (CRD-01..18) ve entegrasyon katmanı (SET-13..15)
   ----------------------------------------------------------------------------
   Doküman §6.2'nin on varlığı birebir. Üç yapısal karar tabloya gömülüdür:

   1. TAM KART NUMARASI SÜTUNU YOKTUR (K-085). `kart` tablosunda yalnız
      `maskeli_no` (son dört hane) ve sağlayıcı `token`'ı vardır. Tam numara
      hiçbir yerde saklanamaz — log, rapor veya istemciye sızması yapısal
      olarak imkânsızdır.
   2. KART BAKİYESİ SÜTUNU YOKTUR (K-086). `kart_hareketi` değişmez defterdir,
      tetikleyiciyle korunur; bakiye her okumada toplanır, düzeltme ters kayıt.
      Bu, `stok_hareketi` ve `kasa_hareketi` ile AYNI sözleşmedir.
   3. YÜKLEME SATIRI TEKNİK HATA ile İŞ KURALI REDDİNİ AYIRIR (K-088).
      `durum` alanında `teknik_hata` ve `reddedildi` ayrı değerlerdir; yalnız
      teknik hata güvenli tekrar edilir (§6.4 madde 7).
   ========================================================================== */

export const GOCLER_11 = [
{ ad: 'G011_kartlar', sql: `

/* --- Sağlayıcı kataloğu (CardProvider) ---------------------------------- */
/* Sağlayıcı adı değişse bile KOD sabit kalır: Sodexo → Pluxee dönüşümünde
   tarihsel ad \`eski_adlar\` içinde korunur ve aynı koda eşlenir (§6.1). */
CREATE TABLE kart_saglayici (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kod           TEXT NOT NULL,
  ad            TEXT NOT NULL,
  eski_adlar    TEXT,
  tur           TEXT NOT NULL DEFAULT 'yemek',
  adaptor       TEXT NOT NULL DEFAULT 'dosya',
  aktif         INTEGER NOT NULL DEFAULT 1,
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (tur IN ('yemek','yakit','kredi','hgs','hediye','diger')),
  CHECK (aktif IN (0,1))
);

/* --- Kart ürünü: politika ve para birimi bu tanıma bağlanır --------------- */
CREATE TABLE kart_urunu (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  saglayici_id  TEXT NOT NULL REFERENCES kart_saglayici(id),
  kod           TEXT NOT NULL,
  ad            TEXT NOT NULL,
  tur           TEXT NOT NULL DEFAULT 'yemek',
  para_birimi   TEXT NOT NULL DEFAULT 'TRY',
  durum         TEXT NOT NULL DEFAULT 'aktif',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (tur IN ('yemek','yakit','kredi','hgs','hediye','diger')),
  CHECK (durum IN ('aktif','pasif'))
);

/* --- Entegrasyon (SET-13/14, CRD-18) ------------------------------------- */
/* Gizli bilgi BURADA DURMAZ: yalnız vault referansı ve webhook sırrının
   ÖZETİ saklanır (K-008 kalıbı). Devre kesici durumu ve ardışık hata sayısı
   operasyon ekranının (SET-19) kaynağıdır. */
CREATE TABLE entegrasyon (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenant(id),
  kod             TEXT NOT NULL,
  ad              TEXT NOT NULL,
  tur             TEXT NOT NULL DEFAULT 'kart',
  saglayici_id    TEXT REFERENCES kart_saglayici(id),
  adaptor         TEXT NOT NULL DEFAULT 'dosya',
  taban_url       TEXT,
  kimlik_referansi TEXT,
  webhook_sirri_ozeti TEXT,
  esleme_surumu   TEXT NOT NULL DEFAULT 'v1',
  devre_kesici    TEXT NOT NULL DEFAULT 'kapali',
  ardisik_hata    INTEGER NOT NULL DEFAULT 0,
  son_hata        TEXT,
  son_hata_zamani INTEGER,
  son_basari_zamani INTEGER,
  durum           TEXT NOT NULL DEFAULT 'aktif',
  surum           INTEGER NOT NULL DEFAULT 1,
  olusturan       TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen     TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  CHECK (tur IN ('kart','banka','muhasebe','eposta','sms','diger')),
  CHECK (devre_kesici IN ('kapali','acik','yarim_acik')),
  CHECK (durum IN ('aktif','pasif','bakimda'))
);

/* --- Sağlayıcı hesabı (ProviderAccount) ---------------------------------- */
CREATE TABLE saglayici_hesabi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  saglayici_id  TEXT NOT NULL REFERENCES kart_saglayici(id),
  entegrasyon_id TEXT REFERENCES entegrasyon(id),
  kod           TEXT NOT NULL,
  ad            TEXT NOT NULL,
  musteri_no    TEXT NOT NULL,
  para_birimi   TEXT NOT NULL DEFAULT 'TRY',
  banka_hesap_id TEXT REFERENCES banka_hesabi(id),
  proje_id      TEXT REFERENCES proje(id),
  santiye_id    TEXT REFERENCES santiye(id),
  durum         TEXT NOT NULL DEFAULT 'aktif',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  /* Aynı sağlayıcıda aynı müşteri numarası iki kez tanımlanamaz. */
  UNIQUE (tenant_id, saglayici_id, musteri_no),
  CHECK (durum IN ('aktif','pasif','kapali'))
);

/* --- Kart (Card) ---------------------------------------------------------- */
/* TAM NUMARA SÜTUNU YOK (K-085): maskeli_no yalnız son dört hane, token
   sağlayıcının verdiği takma kimliktir. */
CREATE TABLE kart (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  hesap_id      TEXT NOT NULL REFERENCES saglayici_hesabi(id),
  urun_id       TEXT REFERENCES kart_urunu(id),
  kod           TEXT NOT NULL,
  maskeli_no    TEXT NOT NULL,
  saglayici_token TEXT,
  bicim         TEXT NOT NULL DEFAULT 'fiziksel',
  havuz         INTEGER NOT NULL DEFAULT 0,
  son_kullanim  INTEGER,
  yenilenen_id  TEXT REFERENCES kart(id),
  durum         TEXT NOT NULL DEFAULT 'siparis_edildi',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  UNIQUE (hesap_id, saglayici_token),
  CHECK (bicim IN ('fiziksel','sanal')),
  CHECK (havuz IN (0,1)),
  /* Maskeli numara en fazla dört hane taşır — tam numara buraya sığmaz. */
  CHECK (length(maskeli_no) <= 8),
  CHECK (durum IN ('siparis_edildi','basimda','aktiflenebilir','aktif','gecici_bloke',
                   'kayip_calinti','yenilemede','iptal','suresi_doldu','arsiv'))
);
CREATE INDEX ix_kart_hesap ON kart (hesap_id, durum);

/* --- Kart ataması (CardAssignment) ---------------------------------------- */
/* Kart başına TEK çakışmayan aktif atama; geçmiş atama değişmez (CRD-02). */
CREATE TABLE kart_atamasi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kart_id       TEXT NOT NULL REFERENCES kart(id),
  personel_id   TEXT REFERENCES personel(id),
  varlik_id     TEXT REFERENCES varlik(id),
  proje_id      TEXT REFERENCES proje(id),
  santiye_id    TEXT REFERENCES santiye(id),
  departman     TEXT,
  baslangic     INTEGER NOT NULL,
  bitis         INTEGER,
  teslim_notu   TEXT,
  iade_notu     TEXT,
  devir_id      TEXT REFERENCES kart_atamasi(id),
  durum         TEXT NOT NULL DEFAULT 'aktif',
  surum         INTEGER NOT NULL DEFAULT 1,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen   TEXT, guncellendi INTEGER,
  CHECK (durum IN ('aktif','iade','devir','iptal')),
  CHECK (bitis IS NULL OR bitis >= baslangic),
  /* Atama bir hedefe bağlanmalı: kişi, araç, proje, şantiye veya departman. */
  CHECK (personel_id IS NOT NULL OR varlik_id IS NOT NULL OR proje_id IS NOT NULL
      OR santiye_id IS NOT NULL OR departman IS NOT NULL)
);
CREATE INDEX ix_kart_atama ON kart_atamasi (kart_id, durum, baslangic);

/* Kapanmış atama satırı DEĞİŞMEZ: iade/devir yalnız bitiş + durum yazar.
   Geçmişin yeniden yazılması, kartın kimde olduğunu tartışmalı yapardı. */
CREATE TRIGGER trg_kart_atama_gecmis_degismez BEFORE UPDATE ON kart_atamasi
WHEN OLD.durum <> 'aktif'
BEGIN
  SELECT RAISE(ABORT, 'Kapanmış kart ataması değiştirilemez; yeni atama açın.');
END;
CREATE TRIGGER trg_kart_atama_silinemez BEFORE DELETE ON kart_atamasi
BEGIN
  SELECT RAISE(ABORT, 'Kart ataması geçmişi silinemez.');
END;

/* --- Kart politikası (CardPolicy) ----------------------------------------- */
/* Politika ETKİLİ TARİHLİ ve SÜRÜMLÜDÜR; vergi/gün tutarı kodda sabit değildir
   (§6.2). Yükleme tutarı buradan hesaplanır, kullanıcı yazmaz. */
CREATE TABLE kart_politikasi (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenant(id),
  urun_id           TEXT NOT NULL REFERENCES kart_urunu(id),
  kod               TEXT NOT NULL,
  ad                TEXT NOT NULL,
  gecerli_baslangic INTEGER NOT NULL,
  gecerli_bitis     INTEGER,
  gun_kaynagi       TEXT NOT NULL DEFAULT 'puantaj',
  gunluk_tutar_minor INTEGER NOT NULL,
  sabit_gun         INTEGER,
  azami_tutar_minor INTEGER,
  tutar_birim       TEXT NOT NULL DEFAULT 'TRY',
  ucretsiz_izin_haric INTEGER NOT NULL DEFAULT 1,
  ayrilan_haric     INTEGER NOT NULL DEFAULT 1,
  istisna_yetkisi   TEXT,
  surum_no          INTEGER NOT NULL DEFAULT 1,
  onceki_surum_id   TEXT REFERENCES kart_politikasi(id),
  durum             TEXT NOT NULL DEFAULT 'taslak',
  surum             INTEGER NOT NULL DEFAULT 1,
  olusturan         TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen       TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod, surum_no),
  CHECK (gun_kaynagi IN ('puantaj','sabit','takvim')),
  CHECK (gunluk_tutar_minor > 0),
  CHECK (durum IN ('taslak','onaya_gonderildi','incelemede','revizyon_istendi',
                   'onaylandi','reddedildi','iptal'))
);
CREATE INDEX ix_kart_politika ON kart_politikasi (urun_id, gecerli_baslangic);

/* --- Yükleme partisi (CardLoadBatch) -------------------------------------- */
/* Aynı kaynak/dönem için MÜKERRER KONTROLÜ tabloda: (hesap, ürün, dönem,
   kaynak) tekildir ve idempotency anahtarı ayrıca tekildir (CRD-03). */
CREATE TABLE kart_yukleme_partisi (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenant(id),
  hesap_id          TEXT NOT NULL REFERENCES saglayici_hesabi(id),
  urun_id           TEXT NOT NULL REFERENCES kart_urunu(id),
  politika_id       TEXT REFERENCES kart_politikasi(id),
  kod               TEXT NOT NULL,
  donem             TEXT NOT NULL,
  kaynak            TEXT NOT NULL DEFAULT 'puantaj',
  toplam_minor      INTEGER NOT NULL DEFAULT 0,
  satir_sayisi      INTEGER NOT NULL DEFAULT 0,
  tutar_birim       TEXT NOT NULL DEFAULT 'TRY',
  /* Onaya giderken parti sürümü DONDURULUR: onaycı gördüğü sürümü onaylar. */
  surum_no          INTEGER NOT NULL DEFAULT 1,
  donduruldu        INTEGER,
  idempotency_anahtari TEXT,
  gonderim_zamani   INTEGER,
  banka_hareket_id  TEXT REFERENCES banka_hareketi(id),
  durum             TEXT NOT NULL DEFAULT 'taslak',
  surum             INTEGER NOT NULL DEFAULT 1,
  olusturan         TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen       TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  UNIQUE (hesap_id, urun_id, donem, kaynak),
  UNIQUE (tenant_id, idempotency_anahtari),
  CHECK (kaynak IN ('puantaj','sabit','dosya','elle')),
  CHECK (durum IN ('taslak','dogrulandi','onay_bekliyor','gonderiliyor','kismi',
                   'basarili','hatali','mutabik','kapali','iptal'))
);

/* --- Yükleme satırı (CardLoadItem) ---------------------------------------- */
/* SATIR BAZLI KISMİ BAŞARI: \`teknik_hata\` ve \`reddedildi\` AYRI durumlardır.
   Yalnız teknik hata güvenli tekrar edilir (§6.4 madde 7, K-088).
   Bir partide bir kart yalnız bir kez yer alabilir (mükerrer kart kontrolü). */
CREATE TABLE kart_yukleme_satiri (
  id                TEXT PRIMARY KEY,
  parti_id          TEXT NOT NULL REFERENCES kart_yukleme_partisi(id) ON DELETE CASCADE,
  kart_id           TEXT NOT NULL REFERENCES kart(id),
  personel_id       TEXT REFERENCES personel(id),
  gun_sayisi        INTEGER NOT NULL DEFAULT 0,
  tutar_minor       INTEGER NOT NULL,
  tutar_birim       TEXT NOT NULL DEFAULT 'TRY',
  istisna_gerekcesi TEXT,
  saglayici_referans TEXT,
  hata_kodu         TEXT,
  hata_mesaji       TEXT,
  deneme_sayisi     INTEGER NOT NULL DEFAULT 0,
  son_deneme        INTEGER,
  hareket_id        TEXT,
  durum             TEXT NOT NULL DEFAULT 'bekliyor',
  olusturuldu       INTEGER NOT NULL,
  guncellendi       INTEGER,
  UNIQUE (parti_id, kart_id),
  CHECK (tutar_minor > 0),
  CHECK (durum IN ('bekliyor','gonderildi','basarili','reddedildi','teknik_hata','iptal'))
);
CREATE INDEX ix_yukleme_satiri ON kart_yukleme_satiri (parti_id, durum);

/* --- Kart hareketi (CardTransaction) — DEĞİŞMEZ DEFTER -------------------- */
/* BAKİYE SÜTUNU YOKTUR (K-086). \`stok_hareketi\` ve \`kasa_hareketi\` ile aynı
   sözleşme: satır tetikleyiciyle korunur, düzeltme yalnız ters kayıttır.
   \`kesinlesmis\` alanı §6.5'in "bekleyen işlemler ayrı gösterilir" kuralıdır. */
CREATE TABLE kart_hareketi (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  kart_id       TEXT NOT NULL REFERENCES kart(id),
  tur           TEXT NOT NULL,
  yon           INTEGER NOT NULL,
  tutar_minor   INTEGER NOT NULL,
  tutar_birim   TEXT NOT NULL DEFAULT 'TRY',
  kesinlesmis   INTEGER NOT NULL DEFAULT 1,
  zaman         INTEGER NOT NULL,
  saglayici_referans TEXT,
  uye_isyeri    TEXT,
  personel_id   TEXT REFERENCES personel(id),
  proje_id      TEXT REFERENCES proje(id),
  santiye_id    TEXT REFERENCES santiye(id),
  maliyet_kodu  TEXT,
  kaynak_nesne  TEXT, kaynak_id TEXT,
  ters_kayit_id TEXT REFERENCES kart_hareketi(id),
  aciklama      TEXT,
  olusturan     TEXT, olusturuldu INTEGER NOT NULL,
  CHECK (tur IN ('yukleme','harcama','iade','duzeltme','iptal','devir_giris','devir_cikis')),
  CHECK (yon IN (-1, 1)),
  CHECK (tutar_minor > 0),
  CHECK (kesinlesmis IN (0,1))
);
CREATE INDEX ix_kart_hareket ON kart_hareketi (kart_id, zaman);
CREATE INDEX ix_kart_hareket_ref ON kart_hareketi (saglayici_referans);
CREATE INDEX ix_kart_hareket_kaynak ON kart_hareketi (kaynak_nesne, kaynak_id);

/* Aynı sağlayıcı referansı iki kez muhasebeleşemez (§6.2 IntegrationEvent). */
CREATE UNIQUE INDEX ux_kart_hareket_saglayici
  ON kart_hareketi (kart_id, saglayici_referans)
  WHERE saglayici_referans IS NOT NULL;

CREATE TRIGGER trg_kart_hareket_degismez_u BEFORE UPDATE ON kart_hareketi
BEGIN
  SELECT RAISE(ABORT, 'Kart hareketi değiştirilemez; düzeltme ters kayıtla yapılır.');
END;
CREATE TRIGGER trg_kart_hareket_degismez_d BEFORE DELETE ON kart_hareketi
BEGIN
  SELECT RAISE(ABORT, 'Kart hareketi silinemez; düzeltme ters kayıtla yapılır.');
END;

/* --- Mutabakat (CardReconciliation) --------------------------------------- */
/* Fark SIFIR veya ONAYLI AÇIKLAMA olmadan kapanamaz (§6.2). Üç kaynak:
   iç defter, sağlayıcı ekstresi, banka çıkışı. */
CREATE TABLE kart_mutabakati (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenant(id),
  hesap_id          TEXT NOT NULL REFERENCES saglayici_hesabi(id),
  kod               TEXT NOT NULL,
  donem             TEXT NOT NULL,
  ic_toplam_minor   INTEGER NOT NULL DEFAULT 0,
  saglayici_toplam_minor INTEGER,
  banka_toplam_minor INTEGER,
  fark_minor        INTEGER NOT NULL DEFAULT 0,
  tutar_birim       TEXT NOT NULL DEFAULT 'TRY',
  aciklama          TEXT,
  veri_tarihi       INTEGER,
  durum             TEXT NOT NULL DEFAULT 'taslak',
  surum             INTEGER NOT NULL DEFAULT 1,
  olusturan         TEXT, olusturuldu INTEGER NOT NULL,
  guncelleyen       TEXT, guncellendi INTEGER,
  UNIQUE (tenant_id, kod),
  UNIQUE (hesap_id, donem),
  CHECK (durum IN ('taslak','onaya_gonderildi','incelemede','revizyon_istendi',
                   'onaylandi','reddedildi','iptal'))
);

/* --- Entegrasyon olayı (IntegrationEvent) — OPS-01 ------------------------ */
/* Hassas payload MASKELENİR; aynı olay iki kez muhasebeleşmez.
   \`olay_kimligi\` webhook tekilleştirmesi, \`idempotency_anahtari\` giden
   çağrının tekilleştirmesidir. */
CREATE TABLE entegrasyon_olayi (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenant(id),
  entegrasyon_id    TEXT REFERENCES entegrasyon(id),
  yon               TEXT NOT NULL DEFAULT 'giden',
  islem             TEXT NOT NULL,
  istek_kimligi     TEXT,
  idempotency_anahtari TEXT,
  olay_kimligi      TEXT,
  http_kodu         INTEGER,
  maskeli_istek     TEXT,
  maskeli_yanit     TEXT,
  hata_sinifi       TEXT,
  hata_kodu         TEXT,
  deneme_sayisi     INTEGER NOT NULL DEFAULT 0,
  sonraki_deneme    INTEGER,
  kaynak_nesne      TEXT, kaynak_id TEXT,
  durum             TEXT NOT NULL DEFAULT 'bekliyor',
  zaman             INTEGER NOT NULL,
  olusturan         TEXT, olusturuldu INTEGER NOT NULL,
  guncellendi       INTEGER,
  UNIQUE (tenant_id, entegrasyon_id, idempotency_anahtari),
  UNIQUE (tenant_id, entegrasyon_id, olay_kimligi),
  CHECK (yon IN ('giden','gelen')),
  CHECK (hata_sinifi IS NULL OR hata_sinifi IN ('teknik','is_kurali')),
  CHECK (durum IN ('bekliyor','basarili','teknik_hata','is_kurali_reddi','dlq','iptal'))
);
CREATE INDEX ix_entegrasyon_olayi ON entegrasyon_olayi (entegrasyon_id, durum, zaman);

/* Olay kaydı da denetim kanıtıdır: silinemez, yalnız durum/deneme güncellenir. */
CREATE TRIGGER trg_entegrasyon_olayi_silinemez BEFORE DELETE ON entegrasyon_olayi
BEGIN
  SELECT RAISE(ABORT, 'Entegrasyon olayı silinemez; denetim kanıtıdır.');
END;
`},
];
