/* ============================================================================
   DURUM TANIMLARI — doküman §5.2 tablosu BİREBİR
   ----------------------------------------------------------------------------
   "Durum alanları serbest seçim kutusu değildir." Her nesne türü için izinli
   geçiş, yetkili eylem, ön koşul, zorunlu gerekçe/belge/onay ve yan etki burada
   TANIMLIDIR; geçişi yalnız motor (durum.mjs) yapar.

   `gecikmis` gibi işaretler DURUM DEĞİLDİR: hesaplanan işarettir, saklanmaz.
   ========================================================================== */

/**
 * geçiş tanımı:
 *   { den, e, eylem, yetkiEki, gerekce:'zorunlu'|'istege_bagli',
 *     onKosul?: (ctx, kayit) => string|null,   // hata metni döner = engel
 *     onayGerekir?: boolean, etiket: string }
 */

import { acilisEngeliMetni, kapanisEngeliMetni } from '../santiye/kapanis.mjs';
import { aktivasyonEngeliMetni, projeKapanisEngeliMetni } from '../proje/kapanis.mjs';

export const NESNELER = {
  /* ---- Proje / Şantiye ------------------------------------------------- */
  proje: {
    etiket: 'Proje',
    durumlar: ['taslak', 'hazirlik', 'aktif', 'askida', 'kapanista', 'kapali', 'arsiv'],
    baslangic: 'taslak',
    sonDurumlar: ['kapali', 'arsiv'],
    etiketler: {
      taslak: 'Taslak', hazirlik: 'Hazırlık', aktif: 'Aktif', askida: 'Askıda',
      kapanista: 'Kapanışta', kapali: 'Kapalı', arsiv: 'Arşiv',
    },
    gecisler: [
      { den: 'taslak', e: 'hazirlik', eylem: 'hazirliga_al', etiket: 'Hazırlığa al', gerekce: 'istege_bagli' },
      /* PRJ-05: aktivasyon kontrol listesi tamamlanmadan proje aktifleşmez. */
      { den: 'hazirlik', e: 'aktif', eylem: 'aktive_et', etiket: 'Aktifleştir', gerekce: 'istege_bagli',
        onayGerekir: true, onKosul: (ctx, k) => aktivasyonEngeliMetni(k.id) },
      { den: 'aktif', e: 'askida', eylem: 'askiya_al', etiket: 'Askıya al', gerekce: 'zorunlu' },
      { den: 'askida', e: 'aktif', eylem: 'devam_ettir', etiket: 'Devam ettir', gerekce: 'zorunlu' },
      { den: 'aktif', e: 'kapanista', eylem: 'kapanisa_al', etiket: 'Kapanışa al', gerekce: 'istege_bagli' },
      /* PRJ-09/§7: proje, altındaki şantiyeler kapanmadan kapatılamaz. */
      { den: 'kapanista', e: 'kapali', eylem: 'kapat', etiket: 'Kapat', gerekce: 'zorunlu', onayGerekir: true,
        onKosul: (ctx, k) => projeKapanisEngeliMetni(k.id) },
      { den: 'kapali', e: 'arsiv', eylem: 'arsivle', etiket: 'Arşivle', gerekce: 'istege_bagli' },
      { den: 'taslak', e: 'arsiv', eylem: 'iptal_et', etiket: 'İptal et', gerekce: 'zorunlu' },
    ],
    isaretler: ['takvimde', 'riskli', 'gecikmis', 'butce_asimi'],
  },

  santiye: {
    etiket: 'Şantiye',
    durumlar: ['taslak', 'hazirlik', 'aktif', 'askida', 'kapanista', 'kapali', 'arsiv'],
    baslangic: 'taslak',
    sonDurumlar: ['kapali', 'arsiv'],
    etiketler: {
      taslak: 'Taslak', hazirlik: 'Hazırlık', aktif: 'Aktif', askida: 'Askıda',
      kapanista: 'Kapanışta', kapali: 'Kapalı', arsiv: 'Arşiv',
    },
    gecisler: [
      { den: 'taslak', e: 'hazirlik', eylem: 'hazirliga_al', etiket: 'Hazırlığa al', gerekce: 'istege_bagli' },
      /* SITE-05: açılış kontrol listesi tamamlanmadan şantiye açılamaz. */
      { den: 'hazirlik', e: 'aktif', eylem: 'ac', etiket: 'Şantiyeyi aç', gerekce: 'istege_bagli',
        onKosul: (ctx, k) => acilisEngeliMetni(k.id) },
      { den: 'aktif', e: 'askida', eylem: 'askiya_al', etiket: 'Askıya al', gerekce: 'zorunlu' },
      { den: 'askida', e: 'aktif', eylem: 'devam_ettir', etiket: 'Devam ettir', gerekce: 'zorunlu' },
      { den: 'aktif', e: 'kapanista', eylem: 'kapanisa_al', etiket: 'Kapanışa al', gerekce: 'istege_bagli' },
      /* §7: engel listesi sıfırlanmadan "kapalı" duruma geçilemez. */
      { den: 'kapanista', e: 'kapali', eylem: 'kapat', etiket: 'Kapat', gerekce: 'zorunlu', onayGerekir: true,
        onKosul: (ctx, k) => kapanisEngeliMetni(k.id) },
      { den: 'kapali', e: 'arsiv', eylem: 'arsivle', etiket: 'Arşivle', gerekce: 'istege_bagli' },
    ],
    isaretler: ['takvimde', 'riskli', 'gecikmis', 'butce_asimi'],
  },

  /* ---- Görev ------------------------------------------------------------ */
  gorev: {
    etiket: 'Görev',
    durumlar: ['taslak', 'atama_bekliyor', 'acik', 'devam_ediyor', 'dogrulamada', 'tamamlandi', 'iptal'],
    baslangic: 'taslak',
    sonDurumlar: ['tamamlandi', 'iptal'],
    etiketler: {
      taslak: 'Taslak', atama_bekliyor: 'Atama bekliyor', acik: 'Açık', devam_ediyor: 'Devam ediyor',
      dogrulamada: 'Doğrulamada', tamamlandi: 'Tamamlandı', iptal: 'İptal',
    },
    gecisler: [
      { den: 'taslak', e: 'atama_bekliyor', eylem: 'havuza_ver', etiket: 'Havuza gönder', gerekce: 'istege_bagli' },
      { den: 'taslak', e: 'acik', eylem: 'ata', etiket: 'Ata', gerekce: 'istege_bagli',
        onKosul: (ctx, k) => (k.sorumlu_id ? null : 'Görevi açmak için bir sorumlu atanmalı.') },
      { den: 'atama_bekliyor', e: 'acik', eylem: 'ata', etiket: 'Ata', gerekce: 'istege_bagli',
        onKosul: (ctx, k) => (k.sorumlu_id ? null : 'Görevi açmak için bir sorumlu atanmalı.') },
      { den: 'acik', e: 'devam_ediyor', eylem: 'basla', etiket: 'Başla', gerekce: 'istege_bagli' },
      { den: 'devam_ediyor', e: 'dogrulamada', eylem: 'dogrulamaya_gonder', etiket: 'Doğrulamaya gönder', gerekce: 'istege_bagli' },
      { den: 'dogrulamada', e: 'tamamlandi', eylem: 'dogrula', etiket: 'Doğrula ve kapat', gerekce: 'istege_bagli', dortGoz: true },
      { den: 'dogrulamada', e: 'devam_ediyor', eylem: 'geri_gonder', etiket: 'Geri gönder', gerekce: 'zorunlu' },
      { den: 'acik', e: 'iptal', eylem: 'iptal_et', etiket: 'İptal et', gerekce: 'zorunlu' },
      { den: 'devam_ediyor', e: 'iptal', eylem: 'iptal_et', etiket: 'İptal et', gerekce: 'zorunlu' },
      { den: 'taslak', e: 'iptal', eylem: 'iptal_et', etiket: 'İptal et', gerekce: 'zorunlu' },
    ],
    isaretler: ['gecikmis', 'bloke', 'sla_riski'],
  },

  /* ---- Talep / Sözleşme / Hakediş (ortak onay yaşam döngüsü) ----------- */
  onayliKayit: {
    etiket: 'Onaylı kayıt',
    durumlar: ['taslak', 'onaya_gonderildi', 'incelemede', 'revizyon_istendi', 'onaylandi', 'reddedildi', 'iptal'],
    baslangic: 'taslak',
    sonDurumlar: ['onaylandi', 'reddedildi', 'iptal'],
    etiketler: {
      taslak: 'Taslak', onaya_gonderildi: 'Onaya gönderildi', incelemede: 'İncelemede',
      revizyon_istendi: 'Revizyon istendi', onaylandi: 'Onaylandı', reddedildi: 'Reddedildi', iptal: 'İptal',
    },
    gecisler: [
      /* Talep sahibi yalnız "onaya gönder" diyebilir; nihai durumu seçemez. */
      { den: 'taslak', e: 'onaya_gonderildi', eylem: 'onaya_gonder', etiket: 'Onaya gönder', gerekce: 'istege_bagli', akisBaslatir: true },
      { den: 'revizyon_istendi', e: 'onaya_gonderildi', eylem: 'onaya_gonder', etiket: 'Yeniden onaya gönder', gerekce: 'zorunlu', akisBaslatir: true },
      /* Aşağıdaki geçişleri YALNIZ onay motoru tetikler (elle çağrılamaz). */
      { den: 'onaya_gonderildi', e: 'incelemede', eylem: 'incelemeye_al', etiket: 'İncelemeye al', gerekce: 'istege_bagli', yalnizMotor: true },
      { den: 'incelemede', e: 'onaylandi', eylem: 'onayla', etiket: 'Onayla', gerekce: 'istege_bagli', yalnizMotor: true },
      { den: 'incelemede', e: 'reddedildi', eylem: 'reddet', etiket: 'Reddet', gerekce: 'zorunlu', yalnizMotor: true },
      { den: 'incelemede', e: 'revizyon_istendi', eylem: 'revizyon_iste', etiket: 'Revizyon iste', gerekce: 'zorunlu', yalnizMotor: true },
      { den: 'onaya_gonderildi', e: 'taslak', eylem: 'geri_cek', etiket: 'Onaydan geri çek', gerekce: 'zorunlu' },
      { den: 'taslak', e: 'iptal', eylem: 'iptal_et', etiket: 'İptal et', gerekce: 'zorunlu' },
      { den: 'revizyon_istendi', e: 'iptal', eylem: 'iptal_et', etiket: 'İptal et', gerekce: 'zorunlu' },
    ],
    isaretler: ['suresi_asti', 'butce_etkisi', 'odeme_bekliyor', 'gecikmis'],
  },

  /* ---- Saha bildirimi --------------------------------------------------- */
  sahaBildirimi: {
    etiket: 'Saha bildirimi',
    durumlar: ['yeni', 'siniflandirildi', 'atandi', 'islemde', 'dogrulamada', 'kapali', 'iptal'],
    baslangic: 'yeni',
    sonDurumlar: ['kapali', 'iptal'],
    etiketler: {
      yeni: 'Yeni', siniflandirildi: 'Sınıflandırıldı', atandi: 'Atandı', islemde: 'İşlemde',
      dogrulamada: 'Doğrulamada', kapali: 'Kapalı', iptal: 'İptal',
    },
    gecisler: [
      { den: 'yeni', e: 'siniflandirildi', eylem: 'siniflandir', etiket: 'Sınıflandır', gerekce: 'istege_bagli' },
      { den: 'siniflandirildi', e: 'atandi', eylem: 'ata', etiket: 'Ata', gerekce: 'istege_bagli',
        onKosul: (ctx, k) => (k.sorumlu_id ? null : 'Atama için sorumlu seçilmeli.') },
      { den: 'atandi', e: 'islemde', eylem: 'basla', etiket: 'İşleme al', gerekce: 'istege_bagli' },
      { den: 'islemde', e: 'dogrulamada', eylem: 'dogrulamaya_gonder', etiket: 'Doğrulamaya gönder', gerekce: 'istege_bagli' },
      { den: 'dogrulamada', e: 'kapali', eylem: 'kapat', etiket: 'Doğrula ve kapat', gerekce: 'istege_bagli', dortGoz: true },
      { den: 'dogrulamada', e: 'islemde', eylem: 'geri_gonder', etiket: 'Geri gönder', gerekce: 'zorunlu' },
      { den: 'yeni', e: 'iptal', eylem: 'iptal_et', etiket: 'İptal et', gerekce: 'zorunlu' },
      { den: 'siniflandirildi', e: 'iptal', eylem: 'iptal_et', etiket: 'İptal et', gerekce: 'zorunlu' },
    ],
    isaretler: ['kritik', 'sla_asildi', 'tekrar_eden'],
  },

  /* ---- Personel ---------------------------------------------------------
     "aday" → "aktif" geçişi işe giriş sihirbazının (HR-05) çıktısıdır: evrak,
     atama ve giriş tarihi tamamlanmadan personel aktif sayılmaz. */
  personel: {
    etiket: 'Personel',
    durumlar: ['aday', 'aktif', 'izinli', 'ayrildi', 'pasif'],
    baslangic: 'aday',
    sonDurumlar: ['ayrildi'],
    etiketler: {
      aday: 'Aday', aktif: 'Aktif', izinli: 'İzinli', ayrildi: 'Ayrıldı', pasif: 'Pasif',
    },
    gecisler: [
      { den: 'aday', e: 'aktif', eylem: 'ise_al', etiket: 'İşe girişi tamamla', gerekce: 'istege_bagli',
        onKosul: (ctx, k) => (k.ise_giris ? null : 'İşe giriş tarihi girilmeden personel aktifleştirilemez.') },
      { den: 'aktif', e: 'izinli', eylem: 'izne_cikar', etiket: 'İzne çıkar', gerekce: 'istege_bagli' },
      { den: 'izinli', e: 'aktif', eylem: 'izinden_don', etiket: 'İzinden dönüş', gerekce: 'istege_bagli' },
      { den: 'aktif', e: 'pasif', eylem: 'pasife_al', etiket: 'Pasife al', gerekce: 'zorunlu' },
      { den: 'pasif', e: 'aktif', eylem: 'aktife_al', etiket: 'Yeniden aktifleştir', gerekce: 'zorunlu' },
      /* Ayrılış HR-06 sihirbazına bağlıdır (Faz 5): zimmet/kart iadesi orada kapanır. */
      { den: 'aktif', e: 'ayrildi', eylem: 'ayrilis', etiket: 'İşten ayrılış', gerekce: 'zorunlu' },
      { den: 'izinli', e: 'ayrildi', eylem: 'ayrilis', etiket: 'İşten ayrılış', gerekce: 'zorunlu' },
      { den: 'pasif', e: 'ayrildi', eylem: 'ayrilis', etiket: 'İşten ayrılış', gerekce: 'zorunlu' },
      { den: 'aday', e: 'pasif', eylem: 'adayligi_kapat', etiket: 'Adaylığı kapat', gerekce: 'zorunlu' },
    ],
    isaretler: ['belge_suresi_doldu'],
  },

  /* ---- Puantaj dönemi ----------------------------------------------------
     Kapanış onaydan geçer ve dönemin puantaj satırlarını KİLİTLER (HR-09). */
  puantajDonemi: {
    etiket: 'Puantaj dönemi',
    durumlar: ['acik', 'onaya_gonderildi', 'incelemede', 'revizyon_istendi', 'onaylandi',
               'reddedildi', 'iptal', 'kapali'],
    baslangic: 'acik',
    sonDurumlar: ['kapali', 'iptal'],
    etiketler: {
      acik: 'Açık', onaya_gonderildi: 'Onaya gönderildi', incelemede: 'İncelemede',
      revizyon_istendi: 'Revizyon istendi', onaylandi: 'Onaylandı', reddedildi: 'Reddedildi',
      iptal: 'İptal', kapali: 'Kapalı (kilitli)',
    },
    gecisler: [
      { den: 'acik', e: 'onaya_gonderildi', eylem: 'onaya_gonder', etiket: 'Dönemi onaya gönder',
        gerekce: 'istege_bagli', akisBaslatir: true },
      { den: 'revizyon_istendi', e: 'onaya_gonderildi', eylem: 'onaya_gonder',
        etiket: 'Yeniden onaya gönder', gerekce: 'zorunlu', akisBaslatir: true },
      { den: 'onaya_gonderildi', e: 'incelemede', eylem: 'incelemeye_al', etiket: 'İncelemeye al',
        gerekce: 'istege_bagli', yalnizMotor: true },
      { den: 'incelemede', e: 'onaylandi', eylem: 'onayla', etiket: 'Onayla', gerekce: 'istege_bagli', yalnizMotor: true },
      { den: 'incelemede', e: 'reddedildi', eylem: 'reddet', etiket: 'Reddet', gerekce: 'zorunlu', yalnizMotor: true },
      { den: 'incelemede', e: 'revizyon_istendi', eylem: 'revizyon_iste', etiket: 'Revizyon iste',
        gerekce: 'zorunlu', yalnizMotor: true },
      { den: 'onaya_gonderildi', e: 'acik', eylem: 'geri_cek', etiket: 'Onaydan geri çek', gerekce: 'zorunlu' },
      { den: 'reddedildi', e: 'acik', eylem: 'yeniden_ac', etiket: 'Dönemi yeniden aç', gerekce: 'zorunlu' },
      /* Kapanış onaylı dönemde YAPILIR ve satırları kilitler; geri dönüşü yoktur. */
      { den: 'onaylandi', e: 'kapali', eylem: 'kapat', etiket: 'Dönemi kapat ve kilitle', gerekce: 'istege_bagli' },
      { den: 'acik', e: 'iptal', eylem: 'iptal_et', etiket: 'İptal et', gerekce: 'zorunlu' },
    ],
    isaretler: ['suresi_asti'],
  },

  /* ---- Mal kabul (STK-03..05) -------------------------------------------
     Kabul kararı stok defterine YAZAR; bu yüzden karar bir kez verilir ve
     "kabul" durumundan geri dönülmez — düzeltme ters kayıtla yapılır. */
  malKabul: {
    etiket: 'Mal kabul',
    durumlar: ['taslak', 'kontrolde', 'kabul', 'kismi_kabul', 'ret', 'iptal'],
    baslangic: 'taslak',
    sonDurumlar: ['kabul', 'kismi_kabul', 'ret', 'iptal'],
    etiketler: {
      taslak: 'Taslak', kontrolde: 'Kalite kontrolünde', kabul: 'Kabul edildi',
      kismi_kabul: 'Kısmi kabul', ret: 'Reddedildi', iptal: 'İptal',
    },
    gecisler: [
      { den: 'taslak', e: 'kontrolde', eylem: 'kontrole_gonder', etiket: 'Kalite kontrolüne gönder',
        gerekce: 'istege_bagli' },
      /* Aşağıdaki geçişleri mal kabul ekranı, kalem kararlarını işledikten
         SONRA motor kipinde tetikler: kullanıcı sonucu doğrudan seçemez. */
      { den: 'kontrolde', e: 'kabul', eylem: 'kabul_et', etiket: 'Kabul', gerekce: 'istege_bagli', yalnizMotor: true },
      { den: 'kontrolde', e: 'kismi_kabul', eylem: 'kismi_kabul_et', etiket: 'Kısmi kabul',
        gerekce: 'zorunlu', yalnizMotor: true },
      { den: 'kontrolde', e: 'ret', eylem: 'reddet', etiket: 'Ret', gerekce: 'zorunlu', yalnizMotor: true },
      { den: 'taslak', e: 'iptal', eylem: 'iptal_et', etiket: 'İptal et', gerekce: 'zorunlu' },
    ],
    isaretler: ['gecikmis'],
  },

  /* ---- Teklif talebi (RFQ, PRC-04) --------------------------------------- */
  rfq: {
    etiket: 'Teklif talebi',
    durumlar: ['taslak', 'gonderildi', 'toplaniyor', 'degerlendirmede', 'sonuclandi', 'iptal'],
    baslangic: 'taslak',
    sonDurumlar: ['sonuclandi', 'iptal'],
    etiketler: {
      taslak: 'Taslak', gonderildi: 'Tedarikçilere gönderildi', toplaniyor: 'Teklif toplanıyor',
      degerlendirmede: 'Değerlendirmede', sonuclandi: 'Sonuçlandı', iptal: 'İptal',
    },
    gecisler: [
      { den: 'taslak', e: 'gonderildi', eylem: 'gonder', etiket: 'Tedarikçilere gönder', gerekce: 'istege_bagli' },
      { den: 'gonderildi', e: 'toplaniyor', eylem: 'topla', etiket: 'Teklif toplamaya başla', gerekce: 'istege_bagli' },
      { den: 'toplaniyor', e: 'degerlendirmede', eylem: 'degerlendir', etiket: 'Değerlendirmeye al', gerekce: 'istege_bagli' },
      { den: 'gonderildi', e: 'degerlendirmede', eylem: 'degerlendir', etiket: 'Değerlendirmeye al', gerekce: 'istege_bagli' },
      { den: 'degerlendirmede', e: 'sonuclandi', eylem: 'sonuclandir', etiket: 'Kazananı belirle',
        gerekce: 'zorunlu', yalnizMotor: true },
      { den: 'taslak', e: 'iptal', eylem: 'iptal_et', etiket: 'İptal et', gerekce: 'zorunlu' },
      { den: 'gonderildi', e: 'iptal', eylem: 'iptal_et', etiket: 'İptal et', gerekce: 'zorunlu' },
      { den: 'toplaniyor', e: 'iptal', eylem: 'iptal_et', etiket: 'İptal et', gerekce: 'zorunlu' },
    ],
    isaretler: ['gecikmis', 'sla_asildi'],
  },

  /* ---- Stok transferi (STK-07) ------------------------------------------- */
  stokTransferi: {
    etiket: 'Stok transferi',
    durumlar: ['taslak', 'yolda', 'tamamlandi', 'iptal'],
    baslangic: 'taslak',
    sonDurumlar: ['tamamlandi', 'iptal'],
    etiketler: { taslak: 'Taslak', yolda: 'Yolda', tamamlandi: 'Teslim alındı', iptal: 'İptal' },
    gecisler: [
      { den: 'taslak', e: 'yolda', eylem: 'sevk_et', etiket: 'Sevk et', gerekce: 'istege_bagli' },
      /* Teslim alma karşı depoda GİRİŞ hareketi yazar; dört göz: sevk edenle
         teslim alan aynı kişi olamaz. */
      { den: 'yolda', e: 'tamamlandi', eylem: 'teslim_al', etiket: 'Teslim al', gerekce: 'istege_bagli', dortGoz: true },
      { den: 'taslak', e: 'iptal', eylem: 'iptal_et', etiket: 'İptal et', gerekce: 'zorunlu' },
    ],
    isaretler: ['gecikmis'],
  },

  /* ---- Teminat (CNT-05) --------------------------------------------------- */
  teminat: {
    etiket: 'Teminat',
    durumlar: ['aktif', 'iade', 'nakde_cevrildi', 'iptal'],
    baslangic: 'aktif',
    sonDurumlar: ['iade', 'nakde_cevrildi', 'iptal'],
    etiketler: { aktif: 'Aktif', iade: 'İade edildi', nakde_cevrildi: 'Nakde çevrildi', iptal: 'İptal' },
    gecisler: [
      { den: 'aktif', e: 'iade', eylem: 'iade_et', etiket: 'Teminatı iade et', gerekce: 'zorunlu' },
      { den: 'aktif', e: 'nakde_cevrildi', eylem: 'nakde_cevir', etiket: 'Nakde çevir', gerekce: 'zorunlu' },
      { den: 'aktif', e: 'iptal', eylem: 'iptal_et', etiket: 'İptal et', gerekce: 'zorunlu' },
    ],
    isaretler: ['gecikmis'],
  },

  /* ---- Gecikme olayı (CNT-13) --------------------------------------------- */
  gecikmeOlayi: {
    etiket: 'Gecikme olayı',
    durumlar: ['acik', 'degerlendirmede', 'kabul', 'ret', 'kapali'],
    baslangic: 'acik',
    sonDurumlar: ['kapali', 'ret'],
    etiketler: { acik: 'Açık', degerlendirmede: 'Değerlendirmede', kabul: 'Kabul edildi',
      ret: 'Reddedildi', kapali: 'Kapalı' },
    gecisler: [
      { den: 'acik', e: 'degerlendirmede', eylem: 'degerlendir', etiket: 'Değerlendirmeye al', gerekce: 'istege_bagli' },
      /* Kabul/ret dört göz ister: olayı bildiren, sorumluluğu kendi lehine belirleyemez. */
      { den: 'degerlendirmede', e: 'kabul', eylem: 'kabul_et', etiket: 'Kabul et', gerekce: 'zorunlu', dortGoz: true },
      { den: 'degerlendirmede', e: 'ret', eylem: 'reddet', etiket: 'Reddet', gerekce: 'zorunlu', dortGoz: true },
      { den: 'kabul', e: 'kapali', eylem: 'kapat', etiket: 'Kapat', gerekce: 'istege_bagli' },
      { den: 'acik', e: 'kapali', eylem: 'kapat', etiket: 'Kapat', gerekce: 'zorunlu' },
    ],
    isaretler: ['gecikmis'],
  },

  /* ---- Claim (CNT-15) ------------------------------------------------------ */
  claim: {
    etiket: 'Claim',
    durumlar: ['hazirlik', 'bildirildi', 'muzakerede', 'kabul', 'ret', 'tahkim', 'kapali'],
    baslangic: 'hazirlik',
    sonDurumlar: ['kapali'],
    etiketler: { hazirlik: 'Hazırlık', bildirildi: 'Bildirildi', muzakerede: 'Müzakerede',
      kabul: 'Kabul', ret: 'Ret', tahkim: 'Tahkim', kapali: 'Kapalı' },
    gecisler: [
      { den: 'hazirlik', e: 'bildirildi', eylem: 'bildir', etiket: 'Karşı tarafa bildir', gerekce: 'istege_bagli' },
      { den: 'bildirildi', e: 'muzakerede', eylem: 'muzakere', etiket: 'Müzakereye al', gerekce: 'istege_bagli' },
      { den: 'muzakerede', e: 'kabul', eylem: 'kabul_et', etiket: 'Kabul', gerekce: 'zorunlu' },
      { den: 'muzakerede', e: 'ret', eylem: 'reddet', etiket: 'Ret', gerekce: 'zorunlu' },
      { den: 'ret', e: 'tahkim', eylem: 'tahkime_gotur', etiket: 'Tahkime götür', gerekce: 'zorunlu' },
      { den: 'kabul', e: 'kapali', eylem: 'kapat', etiket: 'Kapat', gerekce: 'istege_bagli' },
      { den: 'ret', e: 'kapali', eylem: 'kapat', etiket: 'Kapat', gerekce: 'zorunlu' },
      { den: 'tahkim', e: 'kapali', eylem: 'kapat', etiket: 'Kapat', gerekce: 'zorunlu' },
    ],
    isaretler: ['gecikmis', 'sla_asildi'],
  },

  /* ---- Fatura (FIN-13, FIN-14) -------------------------------------------- */
  fatura: {
    etiket: 'Fatura',
    durumlar: ['kayitli', 'eslestirmede', 'onaya_gonderildi', 'incelemede', 'revizyon_istendi',
               'onaylandi', 'reddedildi', 'odendi', 'iptal'],
    baslangic: 'kayitli',
    sonDurumlar: ['odendi', 'reddedildi', 'iptal'],
    etiketler: {
      kayitli: 'Kayıtlı', eslestirmede: 'Eşleştirmede', onaya_gonderildi: 'Onaya gönderildi',
      incelemede: 'İncelemede', revizyon_istendi: 'Revizyon istendi', onaylandi: 'Onaylandı',
      reddedildi: 'Reddedildi', odendi: 'Ödendi', iptal: 'İptal',
    },
    gecisler: [
      { den: 'kayitli', e: 'eslestirmede', eylem: 'eslestir', etiket: 'Eşleştirmeye al', gerekce: 'istege_bagli' },
      /* Onaya gönderme ön koşulu: üçlü eşleştirme YAPILMIŞ olmalı (FIN-14). */
      { den: 'eslestirmede', e: 'onaya_gonderildi', eylem: 'onaya_gonder', etiket: 'Onaya gönder',
        gerekce: 'istege_bagli', akisBaslatir: true },
      { den: 'revizyon_istendi', e: 'onaya_gonderildi', eylem: 'onaya_gonder',
        etiket: 'Yeniden onaya gönder', gerekce: 'zorunlu', akisBaslatir: true },
      { den: 'onaya_gonderildi', e: 'incelemede', eylem: 'incelemeye_al', etiket: 'İncelemeye al',
        gerekce: 'istege_bagli', yalnizMotor: true },
      { den: 'incelemede', e: 'onaylandi', eylem: 'onayla', etiket: 'Onayla', gerekce: 'istege_bagli', yalnizMotor: true },
      { den: 'incelemede', e: 'reddedildi', eylem: 'reddet', etiket: 'Reddet', gerekce: 'zorunlu', yalnizMotor: true },
      { den: 'incelemede', e: 'revizyon_istendi', eylem: 'revizyon_iste', etiket: 'Revizyon iste',
        gerekce: 'zorunlu', yalnizMotor: true },
      { den: 'onaya_gonderildi', e: 'eslestirmede', eylem: 'geri_cek', etiket: 'Onaydan geri çek', gerekce: 'zorunlu' },
      /* "Ödendi" durumunu ÖDEME kaydı yazar, kullanıcı seçmez. */
      { den: 'onaylandi', e: 'odendi', eylem: 'odendi_isaretle', etiket: 'Ödendi', gerekce: 'istege_bagli', yalnizMotor: true },
      { den: 'kayitli', e: 'iptal', eylem: 'iptal_et', etiket: 'İptal et', gerekce: 'zorunlu' },
      { den: 'eslestirmede', e: 'iptal', eylem: 'iptal_et', etiket: 'İptal et', gerekce: 'zorunlu' },
    ],
    isaretler: ['gecikmis', 'odeme_bekliyor'],
  },

  /* ---- Kart yükleme partisi (Faz 5'te kullanılacak, tanım burada) ------- */
  kartYuklemePartisi: {
    etiket: 'Kart yükleme partisi',
    durumlar: ['taslak', 'dogrulandi', 'onay_bekliyor', 'gonderiliyor', 'kismi', 'basarili', 'hatali', 'mutabik', 'kapali'],
    baslangic: 'taslak',
    sonDurumlar: ['kapali'],
    etiketler: {
      taslak: 'Taslak', dogrulandi: 'Doğrulandı', onay_bekliyor: 'Onay bekliyor',
      gonderiliyor: 'Sağlayıcıya gönderiliyor', kismi: 'Kısmi', basarili: 'Başarılı',
      hatali: 'Hatalı', mutabik: 'Mutabık', kapali: 'Kapalı',
    },
    gecisler: [
      { den: 'taslak', e: 'dogrulandi', eylem: 'dogrula', etiket: 'Doğrula', gerekce: 'istege_bagli' },
      { den: 'dogrulandi', e: 'onay_bekliyor', eylem: 'onaya_gonder', etiket: 'Onaya gönder', gerekce: 'istege_bagli', akisBaslatir: true },
      { den: 'onay_bekliyor', e: 'gonderiliyor', eylem: 'gonder', etiket: 'Sağlayıcıya gönder', gerekce: 'istege_bagli', yalnizMotor: true },
      { den: 'gonderiliyor', e: 'basarili', eylem: 'sonuc_basarili', etiket: 'Başarılı', gerekce: 'istege_bagli', yalnizMotor: true },
      { den: 'gonderiliyor', e: 'kismi', eylem: 'sonuc_kismi', etiket: 'Kısmi sonuç', gerekce: 'istege_bagli', yalnizMotor: true },
      { den: 'gonderiliyor', e: 'hatali', eylem: 'sonuc_hatali', etiket: 'Hatalı', gerekce: 'zorunlu', yalnizMotor: true },
      { den: 'kismi', e: 'basarili', eylem: 'tekrar_tamam', etiket: 'Tekrar sonrası tamam', gerekce: 'istege_bagli', yalnizMotor: true },
      { den: 'basarili', e: 'mutabik', eylem: 'mutabakat', etiket: 'Mutabakatı tamamla', gerekce: 'istege_bagli' },
      { den: 'kismi', e: 'mutabik', eylem: 'mutabakat', etiket: 'Mutabakatı tamamla', gerekce: 'zorunlu' },
      { den: 'mutabik', e: 'kapali', eylem: 'kapat', etiket: 'Partiyi kapat', gerekce: 'istege_bagli' },
    ],
    isaretler: ['retry_gerekli', 'fark_var', 'banka_eslesmedi'],
  },
};

/** Onay yaşam döngüsünü paylaşan somut nesne türleri. */
export const ONAYLI_TURLER = {
  talep: 'Satın alma talebi', sozlesme: 'Sözleşme', hakedis: 'Hakediş',
  /* Onaydan geçen saha/plan kayıtları aynı yaşam döngüsünü paylaşır. */
  gunluk_rapor: 'Günlük şantiye raporu', ilerleme: 'İlerleme kaydı', is_programi: 'İş programı',
  butce_revizyonu: 'Bütçe revizyonu', sure_uzatim: 'Süre uzatım talebi',
  degisiklik: 'Değişiklik talebi', odeme: 'Ödeme talebi', kart_yukleme: 'Kart yükleme',
  kabul: 'Geçici/kesin kabul', puantaj_donemi: 'Puantaj dönemi',
  siparis: 'Satın alma siparişi', stok_sayimi: 'Stok sayımı',
  zeyil: 'Zeyilname', metraj: 'Metraj cetveli', butce: 'Bütçe',
  banka_hareketi: 'Banka hareketi', avans: 'Avans talebi', izin: 'İzin talebi',
};

/** Somut tür → durum tanımı. */
export function tanim(nesne) {
  if (NESNELER[nesne]) return NESNELER[nesne];
  if (nesne in ONAYLI_TURLER) return NESNELER.onayliKayit;
  throw new Error(`Durum tanımı olmayan nesne türü: ${nesne}`);
}

export const durumEtiketi = (nesne, durum) => tanim(nesne).etiketler[durum] || durum;
