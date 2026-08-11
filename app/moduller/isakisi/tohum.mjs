/* ============================================================================
   İŞ AKIŞI TOHUMLAMA — şablon, sözlük, maliyet kodu, numaralandırma
   ----------------------------------------------------------------------------
   Bu kayıtlar KURULUM verisidir (demo değil): onaysız akış başlatılamadığı için
   sistem, tenant açıldığında kullanılabilir bir asgari şablon setiyle gelir.
   Çekirdek sözlük değerleri `cekirdek = 1` ile kilitlidir (SET-10).
   ========================================================================== */
import { tek, calistir, islem } from '../../cekirdek/db.mjs';
import { kimlik } from '../../cekirdek/kimlikler.mjs';
import { simdi } from '../../cekirdek/zaman.mjs';
import * as audit from '../../cekirdek/audit.mjs';
import { sablonKur } from './numara.mjs';

/* Tutar kademeleri minor unit (kuruş). Doküman §5.3: şablon tutar aralığına göre seçilir. */
const SABLONLAR = [
  {
    kod: 'DUYURU', ad: 'Duyuru yayın onayı', nesne: 'duyuru', sla: 24,
    adimlar: [{ sira: 1, ad: 'Firma sahibi onayı', rol: 'firma_sahibi', gereken: 1 }],
  },
  {
    kod: 'TALEP-KUCUK', ad: 'Satın alma talebi — 25.000 TL altı', nesne: 'talep',
    altMinor: 0, ustMinor: 2_500_000, sla: 48,
    adimlar: [{ sira: 1, ad: 'Proje müdürü onayı', rol: 'proje_muduru', gereken: 1 }],
  },
  {
    kod: 'TALEP-ORTA', ad: 'Satın alma talebi — 25.000-250.000 TL', nesne: 'talep',
    altMinor: 2_500_001, ustMinor: 25_000_000, sla: 48,
    adimlar: [
      { sira: 1, ad: 'Proje müdürü onayı', rol: 'proje_muduru', gereken: 1 },
      { sira: 2, ad: 'Finans onayı', rol: 'finans_sorumlusu', gereken: 1 },
    ],
  },
  {
    kod: 'TALEP-BUYUK', ad: 'Satın alma talebi — 250.000 TL üstü', nesne: 'talep',
    altMinor: 25_000_001, ustMinor: null, sla: 72,
    adimlar: [
      { sira: 1, ad: 'Proje müdürü onayı', rol: 'proje_muduru', gereken: 1 },
      { sira: 2, ad: 'Finans onayı', rol: 'finans_sorumlusu', gereken: 1 },
      { sira: 3, ad: 'Firma sahibi onayı', rol: 'firma_sahibi', gereken: 1 },
    ],
  },
  {
    kod: 'SIPARIS-KUCUK', ad: 'Satın alma siparişi — 50.000 TL altı', nesne: 'siparis',
    altMinor: 0, ustMinor: 5_000_000, sla: 48,
    adimlar: [{ sira: 1, ad: 'Satın alma yöneticisi onayı', rol: 'proje_muduru', gereken: 1 }],
  },
  {
    kod: 'SIPARIS-BUYUK', ad: 'Satın alma siparişi — 50.000 TL üstü', nesne: 'siparis',
    altMinor: 5_000_001, ustMinor: null, sla: 72,
    adimlar: [
      { sira: 1, ad: 'Proje müdürü onayı', rol: 'proje_muduru', gereken: 1 },
      { sira: 2, ad: 'Finans onayı', rol: 'finans_sorumlusu', gereken: 1 },
      { sira: 3, ad: 'Firma sahibi onayı', rol: 'firma_sahibi', gereken: 1 },
    ],
  },
  {
    kod: 'SAYIM', ad: 'Stok sayım farkı onayı', nesne: 'stok_sayimi', sla: 48,
    adimlar: [
      { sira: 1, ad: 'Depo sorumlusu doğrulaması', rol: 'depo_sorumlusu', gereken: 1 },
      { sira: 2, ad: 'Finans onayı', rol: 'finans_sorumlusu', gereken: 1 },
    ],
  },
  {
    kod: 'SOZLESME', ad: 'Sözleşme onayı', nesne: 'sozlesme', altMinor: 0, ustMinor: null, sla: 72,
    adimlar: [
      { sira: 1, ad: 'Finans incelemesi', rol: 'finans_sorumlusu', gereken: 1 },
      { sira: 2, ad: 'Firma sahibi onayı', rol: 'firma_sahibi', gereken: 1 },
    ],
  },
  {
    kod: 'HAKEDIS', ad: 'Hakediş onayı', nesne: 'hakedis', altMinor: 0, ustMinor: null, sla: 72,
    adimlar: [
      /* Paralel adım örneği: proje ve finans AYNI sırada, ikisi de onaylamalı. */
      { sira: 1, ad: 'Proje müdürü onayı', rol: 'proje_muduru', paralel: 1, gereken: 2 },
      { sira: 1, ad: 'Finans onayı', rol: 'finans_sorumlusu', paralel: 1, gereken: 2 },
      { sira: 2, ad: 'Firma sahibi onayı', rol: 'firma_sahibi', gereken: 1 },
    ],
  },
  {
    kod: 'BAZ-CIZGI', ad: 'İş programı baz çizgi onayı', nesne: 'is_programi', sla: 72,
    adimlar: [
      { sira: 1, ad: 'Proje müdürü onayı', rol: 'proje_muduru', gereken: 1 },
      { sira: 2, ad: 'Firma sahibi onayı', rol: 'firma_sahibi', gereken: 1 },
    ],
  },
  {
    kod: 'ILERLEME', ad: 'İlerleme doğrulama', nesne: 'ilerleme', sla: 48,
    adimlar: [{ sira: 1, ad: 'Proje müdürü doğrulaması', rol: 'proje_muduru', gereken: 1 }],
  },
  {
    kod: 'GUNLUK-RAPOR', ad: 'Günlük şantiye raporu onayı', nesne: 'gunluk_rapor', sla: 24,
    adimlar: [{ sira: 1, ad: 'Proje müdürü onayı', rol: 'proje_muduru', gereken: 1 }],
  },
  {
    kod: 'SURE-UZATIM', ad: 'Süre uzatım talebi onayı', nesne: 'sure_uzatim', sla: 120,
    adimlar: [
      { sira: 1, ad: 'Proje müdürü onayı', rol: 'proje_muduru', gereken: 1 },
      { sira: 2, ad: 'Firma sahibi onayı', rol: 'firma_sahibi', gereken: 1 },
    ],
  },
  {
    kod: 'KABUL', ad: 'Geçici/kesin kabul onayı', nesne: 'kabul', sla: 120,
    adimlar: [
      { sira: 1, ad: 'Proje müdürü onayı', rol: 'proje_muduru', gereken: 1 },
      { sira: 2, ad: 'Firma sahibi onayı', rol: 'firma_sahibi', gereken: 1 },
    ],
  },
  {
    kod: 'PROJE-KAPANIS', ad: 'Proje kapanış onayı', nesne: 'proje_kapanis', sla: 168,
    adimlar: [
      { sira: 1, ad: 'Finans onayı', rol: 'finans_sorumlusu', gereken: 1 },
      { sira: 2, ad: 'Firma sahibi onayı', rol: 'firma_sahibi', gereken: 1 },
    ],
  },
  {
    kod: 'SANTIYE-KAPANIS', ad: 'Şantiye kapanış onayı', nesne: 'santiye_kapanis', sla: 120,
    adimlar: [
      { sira: 1, ad: 'Proje müdürü onayı', rol: 'proje_muduru', gereken: 1 },
      { sira: 2, ad: 'Finans onayı', rol: 'finans_sorumlusu', paralel: 1, gereken: 2 },
      { sira: 2, ad: 'Firma sahibi onayı', rol: 'firma_sahibi', paralel: 1, gereken: 2 },
    ],
  },
  {
    kod: 'PUANTAJ-DONEM', ad: 'Puantaj dönem kapanış onayı', nesne: 'puantaj_donemi', sla: 48,
    adimlar: [
      { sira: 1, ad: 'Proje müdürü onayı', rol: 'proje_muduru', gereken: 1 },
      { sira: 2, ad: 'İK onayı', rol: 'ik_sorumlusu', gereken: 1 },
    ],
  },
  {
    kod: 'IZIN', ad: 'İzin talebi onayı', nesne: 'izin', sla: 48,
    adimlar: [{ sira: 1, ad: 'Yönetici onayı', rol: 'proje_muduru', gereken: 1 }],
  },
  {
    kod: 'AVANS', ad: 'Avans talebi onayı', nesne: 'avans', altMinor: 0, ustMinor: null, sla: 48,
    adimlar: [
      { sira: 1, ad: 'Yönetici onayı', rol: 'proje_muduru', gereken: 1 },
      { sira: 2, ad: 'Finans onayı', rol: 'finans_sorumlusu', gereken: 1 },
    ],
  },
  {
    kod: 'KART-YUKLEME', ad: 'Kart toplu yükleme onayı', nesne: 'kart_yukleme',
    altMinor: 0, ustMinor: null, sla: 24,
    adimlar: [{ sira: 1, ad: 'Finans onayı', rol: 'finans_sorumlusu', gereken: 1 }],
  },
];

const SOZLUKLER = {
  belge_sinifi: [['ic', 'İç belge'], ['gizli', 'Gizli'], ['paylasilan', 'Paylaşılan'], ['resmi', 'Resmi']],
  risk_sinifi: [['dusuk', 'Düşük'], ['orta', 'Orta'], ['yuksek', 'Yüksek'], ['kritik', 'Kritik']],
  onem: [['bilgi', 'Bilgi'], ['uyari', 'Uyarı'], ['kritik', 'Kritik']],
  birim: [['ad', 'Adet'], ['m', 'Metre'], ['m2', 'Metrekare'], ['m3', 'Metreküp'],
          ['kg', 'Kilogram'], ['ton', 'Ton'], ['lt', 'Litre'], ['saat', 'Saat'], ['gun', 'Gün']],
};

const MALIYET_KODLARI = [
  ['01', 'İşçilik', null], ['01.01', 'Düz işçilik', '01'], ['01.02', 'Kalifiye işçilik', '01'],
  ['02', 'Malzeme', null], ['02.01', 'Beton ve demir', '02'], ['02.02', 'Kaba yapı malzemesi', '02'],
  ['02.03', 'İnce yapı malzemesi', '02'],
  ['03', 'Makine ve ekipman', null], ['03.01', 'Kiralık makine', '03'], ['03.02', 'Yakıt', '03'],
  ['04', 'Taşeron', null], ['05', 'Genel giderler', null], ['05.01', 'Şantiye giderleri', '05'],
];

export function isAkisiTohumla(tenantId, kullaniciId = null) {
  return islem(() => {
    let eklenen = 0;

    for (const s of SABLONLAR) {
      if (tek('SELECT id FROM is_akisi_sablonu WHERE tenant_id = ? AND kod = ?', tenantId, s.kod)) continue;
      const id = kimlik('onay').replace('apr', 'wfl');
      calistir(`INSERT INTO is_akisi_sablonu
        (id, tenant_id, kod, ad, nesne, surum, durum, tutar_alt_minor, tutar_ust_minor, tutar_birim,
         sla_saat, olusturan, olusturuldu)
        VALUES (?,?,?,?,?,1,'yayinda',?,?,'TRY',?,?,?)`,
        id, tenantId, s.kod, s.ad, s.nesne,
        s.altMinor ?? null, s.ustMinor ?? null, s.sla ?? null, kullaniciId, simdi());
      for (const a of s.adimlar) {
        calistir(`INSERT INTO is_akisi_adimi (id, sablon_id, sira, ad, rol_kodu, paralel, gereken_onay, sla_saat)
                  VALUES (?,?,?,?,?,?,?,?)`,
          kimlik('gorevAdim'), id, a.sira, a.ad, a.rol, a.paralel ?? 0, a.gereken ?? 1, a.sla ?? null);
      }
      eklenen++;
    }

    for (const [kume, degerler] of Object.entries(SOZLUKLER)) {
      let sira = 0;
      for (const [kod, ad] of degerler) {
        sira++;
        if (tek('SELECT id FROM sozluk WHERE tenant_id = ? AND kume = ? AND kod = ?', tenantId, kume, kod)) continue;
        calistir(`INSERT INTO sozluk (id, tenant_id, kume, kod, ad, sira, cekirdek, olusturan, olusturuldu)
                  VALUES (?,?,?,?,?,?,1,?,?)`,
          kimlik('rapor').replace('rpt', 'szl'), tenantId, kume, kod, ad, sira, kullaniciId, simdi());
      }
    }

    const kodHarita = new Map();
    for (const [kod, ad, ust] of MALIYET_KODLARI) {
      const mevcut = tek('SELECT id FROM maliyet_kodu WHERE tenant_id = ? AND kod = ?', tenantId, kod);
      if (mevcut) { kodHarita.set(kod, mevcut.id); continue; }
      const id = kimlik('rapor').replace('rpt', 'mlk');
      calistir(`INSERT INTO maliyet_kodu (id, tenant_id, kod, ad, ust_id, seviye, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?)`,
        id, tenantId, kod, ad, ust ? kodHarita.get(ust) : null, kod.split('.').length, kullaniciId, simdi());
      kodHarita.set(kod, id);
    }

    const BELGE_TURLERI = [
      ['RUHSAT', 'Ruhsat ve izin', 120, 'resmi'], ['SOZLESME', 'Sözleşme', 120, 'gizli'],
      ['CIZIM', 'Çizim ve proje', 120, 'ic'], ['TUTANAK', 'Tutanak', 60, 'ic'],
      ['SERTIFIKA', 'Sertifika ve belge', 60, 'ic'], ['FATURA', 'Fatura ve irsaliye', 120, 'gizli'],
      ['ISG', 'İSG belgesi', 60, 'ic'], ['DIGER', 'Diğer', null, 'ic'],
    ];
    for (const [kod, adi, saklama, sinif] of BELGE_TURLERI) {
      if (tek('SELECT id FROM belge_turu WHERE tenant_id = ? AND kod = ?', tenantId, kod)) continue;
      calistir(`INSERT INTO belge_turu (id, tenant_id, kod, ad, saklama_ay, erisim_sinifi, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?)`,
        kimlik('dokuman').replace('doc', 'btr'), tenantId, kod, adi, saklama, sinif, kullaniciId, simdi());
    }

    for (const [nesne, onek] of [['talep', 'TLP'], ['siparis', 'SIP'], ['sozlesme', 'SZL'],
      ['hakedis', 'HKD'], ['duyuru', 'DYR'], ['dokuman', 'DOC'], ['gorev', 'GRV'],
      ['saha_bildirimi', 'SHB'], ['kart_yukleme', 'KYP'], ['proje', 'PRJ'], ['santiye', 'STE'],
      ['is_programi', 'PRG'], ['gunluk_rapor', 'GNR'], ['isg_olayi', 'ISG'], ['ncr', 'NCR'],
      ['itp', 'ITP'], ['muayene', 'MUY'], ['submittal', 'SBM'], ['rfi', 'RFI'],
      ['test_sonucu', 'TST'], ['punch', 'PNC'], ['cizim', 'DRW'], ['transmittal', 'TRM'],
      ['evrak', 'EVR'], ['personel', 'PER'], ['izin', 'IZN'], ['avans', 'AVS'],
      ['zimmet', 'ZMT'], ['varlik', 'AST'], ['talep', 'TLP'], ['depo', 'DPO'],
      ['stok_karti', 'STK'], ['mal_kabul', 'GRN'], ['transfer', 'TRF'], ['sayim', 'SYM'],
      ['metraj', 'MTR'], ['degisiklik', 'CHG'], ['gecikme', 'DLY'], ['claim', 'CLM'],
      ['butce', 'BDG'], ['kasa', 'CSH'], ['banka', 'BNK'], ['cari', 'CAR'],
      ['fatura', 'INV'], ['odeme', 'PAY'], ['teminat', 'TMN'], ['zeyil', 'ZYL'],
      ['kabul', 'KBL'], ['is_emri', 'IEM'], ['toplanti', 'TPL'],
      ['isg_denetimi', 'DEN'], ['tedarikci', 'TED'], ['rfq', 'RFQ'], ['teklif_kaydi', 'TKF'],
      ['stok_transferi', 'TRF'], ['stok_sayimi', 'SYM']]) {
      sablonKur(tenantId, nesne, onek);
    }

    if (eklenen) {
      audit.yaz({ tenantId, kullaniciId, nesne: 'is_akisi_sablonu', eylem: 'kurulum_tohumlandi',
        sonraki: { sablon: eklenen, sozluk: Object.keys(SOZLUKLER).length, maliyetKodu: MALIYET_KODLARI.length } });
    }
    return eklenen;
  });
}
