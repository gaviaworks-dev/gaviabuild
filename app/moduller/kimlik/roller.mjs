/* ============================================================================
   ROL VE YETKİ TANIMLARI — yetkiler screen-manifest'ten TÜRETİLİR
   ----------------------------------------------------------------------------
   Değişmez kural 1: yetki anahtarı da manifestten gelir. Rol tanımı "hangi
   bölümleri, hangi eylemlerle" biçiminde yazılır; somut yetki satırları
   (rol_yetki) tohumlama sırasında manifestten genişletilir. Böylece yeni ekran
   eklendiğinde yetki listesi elle güncellenmez ve sapma olmaz.

   Menü gizlemek yetki değildir (§5.7): rail görünürlüğü de bu yetkilerden türer,
   ama asıl kontrol her istekte sunucuda yapılır.
   ========================================================================== */

/** Ekran kalıbına göre o ekranda mümkün olan eylemler. */
export const KALIP_EYLEMLERI = {
  liste:     ['goruntule', 'disa_aktar'],
  listeForm: ['goruntule', 'olustur', 'guncelle', 'disa_aktar'],
  /* Detay ekranı yalnız okuma yüzeyi DEĞİLDİR: durum geçişleri (§5.2 eylem menüsü),
     yeni sürüm yükleme ve satır ekleme burada olur. Yazma yetkisi olmayan roller
     (ör. denetçi) zaten "guncelle" eylemini taşımadığı için salt okunur kalır. */
  detay:     ['goruntule', 'guncelle', 'disa_aktar'],
  form:      ['goruntule', 'olustur', 'guncelle'],
  sihirbaz:  ['goruntule', 'olustur', 'guncelle', 'tamamla'],
  onay:      ['goruntule', 'karar_ver'],
  rapor:     ['goruntule', 'disa_aktar'],
  panel:     ['goruntule'],
  matris:    ['goruntule', 'guncelle'],
  mutabakat: ['goruntule', 'guncelle', 'kapat'],
  takvim:    ['goruntule'],
  portal:    ['goruntule'],
  mobil:     ['goruntule', 'olustur'],
  durum:     ['goruntule'],
  kimlik:    ['goruntule'],
  ayar:      ['goruntule', 'guncelle'],
};

/** Ekran koduna özel eylem kümesi — kalıp eylemlerini EZER.
    Onay ekranları kalıbı "Liste"/"Detay" olsa da karar verme yüzeyidir; bu
    yetkiyi kalıba yaymak (tüm detay ekranlarına karar_ver vermek) yanlış olurdu. */
export const EKRAN_EYLEMLERI = {
  'GLB-04': ['goruntule'],
  'GLB-05': ['goruntule', 'karar_ver'],
};

/* Katalogda AYRI form ekranı olmayan liste ekranları kaydı kendisi açar.
   Bu ekranlarda oluşturma formu listenin altındadır; "Liste" kalıbının salt
   okunur sayılması kaydın hiç açılamamasına yol açardı (K-038). */
export const LISTE_OLUSTURUR = [
  'DOC-04', 'DOC-06', 'DOC-08', 'QLT-04', 'QLT-09', 'QLT-13', 'QLT-14',
  'STK-01', 'STK-02', 'STK-03', 'STK-06', 'STK-07', 'STK-08',
  'PRC-04', 'PRC-11', 'FIN-05', 'FIN-07', 'FIN-10', 'FIN-11', 'FIN-13',
  'CNT-05', 'CNT-06', 'CNT-10', 'CNT-13', 'CNT-15',
  'AST-04', 'AST-05', 'AST-06', 'AST-07', 'AST-09', 'AST-10',
  'HR-07', 'HR-08', 'HR-10', 'HR-11', 'HR-12', 'HR-13',
  'HSE-07', 'HSE-08', 'HSE-09', 'HSE-10', 'HSE-11',
  'CRD-09', 'CRD-10', 'CRD-16', 'TASK-04', 'TASK-06', 'PLAN-08',
  'PRJ-07', 'PRJ-08', 'SITE-12', 'SITE-13', 'SET-17', 'RPT-14', 'GLB-08',
];
for (const kod of LISTE_OLUSTURUR) {
  EKRAN_EYLEMLERI[kod] = ['goruntule', 'olustur', 'guncelle', 'disa_aktar'];
}

/* Rol tanımları. `bolumler` manifest bölüm anahtarlarıdır; '*' hepsi demektir.
   `eylemler` o roldeki azami eylem kümesi; ekranın kalıbıyla kesişimi alınır. */
export const ROLLER = [
  {
    kod: 'sistem_yoneticisi', ad: 'Sistem yöneticisi', sistem: 1,
    aciklama: 'Teknik yapılandırma ve erişim yönetimi. İşlem onaylayamaz, kişisel harcama içeriği göremez.',
    bolumler: ['ayarlar', 'calisma'],
    eylemler: ['goruntule', 'olustur', 'guncelle', 'disa_aktar'],
    haric: ['GLB-04', 'GLB-05'],           // onay kutusu ve karar verme YOK (§6.7)
    kapsam: [{ nesne: '*', kural: 'alan_maskesi', deger: { alanlar: ['harcama_detay', 'maas', 'saglik', 'kart_no'] } }],
  },
  {
    kod: 'firma_sahibi', ad: 'Firma sahibi', sistem: 1,
    aciklama: 'Tenant genelinde tam görünürlük ve politika dahilinde onay.',
    bolumler: ['*'],
    eylemler: ['goruntule', 'olustur', 'guncelle', 'karar_ver', 'disa_aktar', 'tamamla', 'kapat'],
    kapsam: [{ nesne: 'kart_hareket', kural: 'alan_maskesi', deger: { alanlar: ['uye_isyeri'] } }],
  },
  {
    kod: 'proje_muduru', ad: 'Proje müdürü', sistem: 1,
    aciklama: 'Sorumlu olduğu proje ve şantiyelerde operasyon yönetimi.',
    bolumler: ['calisma', 'proje', 'santiye', 'plan', 'gorev', 'isg', 'kalite', 'dokuman', 'personel', 'satinalma', 'stok', 'varlik', 'rapor'],
    eylemler: ['goruntule', 'olustur', 'guncelle', 'karar_ver', 'disa_aktar', 'tamamla'],
    kapsam: [{ nesne: '*', kural: 'kapsam_zorunlu', deger: { turler: ['proje', 'santiye'] } }],
  },
  {
    kod: 'santiye_sefi', ad: 'Şantiye şefi', sistem: 1,
    aciklama: 'Atandığı şantiyede saha operasyonu, günlük rapor, puantaj ve talep.',
    bolumler: ['calisma', 'santiye', 'plan', 'gorev', 'isg', 'kalite', 'dokuman', 'personel', 'satinalma', 'stok', 'varlik'],
    eylemler: ['goruntule', 'olustur', 'guncelle', 'tamamla'],
    kapsam: [{ nesne: '*', kural: 'kapsam_zorunlu', deger: { turler: ['santiye'] } }],
  },
  {
    kod: 'satinalma_sorumlusu', ad: 'Satın alma sorumlusu', sistem: 1,
    aciklama: 'Talep, RFQ, teklif karşılaştırma, sipariş ve tedarikçi yönetimi.',
    bolumler: ['calisma', 'satinalma', 'stok', 'rapor'],
    eylemler: ['goruntule', 'olustur', 'guncelle', 'disa_aktar'],
  },
  {
    kod: 'depo_sorumlusu', ad: 'Depo sorumlusu', sistem: 1,
    aciklama: 'Mal kabul, stok hareketi, transfer, sayım ve zimmet.',
    bolumler: ['calisma', 'stok', 'varlik'],
    eylemler: ['goruntule', 'olustur', 'guncelle', 'tamamla'],
  },
  {
    kod: 'finans_sorumlusu', ad: 'Finans sorumlusu', sistem: 1,
    aciklama: 'Kasa, banka, cari, bütçe, hakediş ve kart mutabakatı.',
    bolumler: ['calisma', 'finans', 'sozlesme', 'kartlar', 'rapor'],
    eylemler: ['goruntule', 'olustur', 'guncelle', 'karar_ver', 'disa_aktar', 'kapat'],
    kapsam: [{ nesne: 'kart_hareket', kural: 'alan_maskesi', deger: { alanlar: ['uye_isyeri'] } }],
  },
  {
    kod: 'ik_sorumlusu', ad: 'İK sorumlusu', sistem: 1,
    aciklama: 'Personel, özlük, puantaj, izin, avans, kart uygunluk ve atama.',
    bolumler: ['calisma', 'personel', 'dokuman'],
    eylemler: ['goruntule', 'olustur', 'guncelle'],
    ekstra: ['CRD-01:goruntule', 'CRD-02:goruntule', 'CRD-04:goruntule', 'CRD-06:goruntule', 'CRD-06:olustur',
             'CRD-11:goruntule', 'CRD-11:olustur'],   // yükleme TASLAĞI; gönderim finansın (§6.7)
    kapsam: [{ nesne: 'kart_hareket', kural: 'alan_maskesi', deger: { alanlar: ['uye_isyeri', 'tutar_detay'] } }],
  },
  {
    kod: 'calisan', ad: 'Çalışan', sistem: 1,
    aciklama: 'Yalnız kendi kaydı: izin, puantaj, kart, belge ve görevleri.',
    bolumler: ['calisma'],
    eylemler: ['goruntule', 'olustur'],
    ekstra: ['HR-14:goruntule', 'HR-10:goruntule', 'HR-10:olustur', 'HR-11:goruntule', 'HR-11:olustur',
             'CRD-04:goruntule', 'CRD-15:goruntule', 'CRD-15:olustur'],
    haric: ['GLB-03', 'GLB-04', 'GLB-05'],
    kapsam: [{ nesne: '*', kural: 'kendi_kaydi', deger: {} }],
  },
  {
    kod: 'denetci', ad: 'Denetçi', sistem: 1,
    aciklama: 'Salt okunur kayıt, sürüm ve denetim izi; kanıt/rapor dışa aktarımı.',
    bolumler: ['*'],
    eylemler: ['goruntule', 'disa_aktar'],
  },
  {
    kod: 'taseron', ad: 'Taşeron (dış)', sistem: 1,
    aciklama: 'Taşeron portalı: puantaj, hakediş, belge ve iş emri.',
    bolumler: [],
    eylemler: ['goruntule', 'olustur'],
    ekstra: ['EXT-05:goruntule', 'EXT-05:olustur'],
    kapsam: [{ nesne: '*', kural: 'kendi_kaydi', deger: {} }],
  },
  {
    kod: 'musteri', ad: 'Müşteri (dış)', sistem: 1,
    aciklama: 'Müşteri portalı: ilerleme, RFI, onay, doküman ve hakediş görünümü.',
    bolumler: [],
    eylemler: ['goruntule'],
    ekstra: ['EXT-04:goruntule'],
    kapsam: [{ nesne: '*', kural: 'kendi_kaydi', deger: {} }],
  },
];

/** Rol tanımını manifestle kesiştirip somut yetki listesi üretir. */
export function yetkileriUret(rol, ekranlar) {
  const set = new Set(rol.ekstra || []);
  const haric = new Set(rol.haric || []);
  const hepsi = rol.bolumler.includes('*');
  for (const e of ekranlar) {
    if (e.takmaAdi) continue;                       // takma ad kanonik ekranın yetkisini kullanır
    if (haric.has(e.kod)) continue;
    if (!hepsi && !rol.bolumler.includes(e.bolum)) continue;
    if (e.bolum === 'kimlik') continue;             // giriş/sistem durumları yetki gerektirmez
    const kalipEylemleri = EKRAN_EYLEMLERI[e.kod] || KALIP_EYLEMLERI[e.kalip] || ['goruntule'];
    for (const eylem of kalipEylemleri) {
      if (rol.eylemler.includes(eylem)) set.add(`${e.kod}:${eylem}`);
    }
  }
  return [...set].sort();
}
