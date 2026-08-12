/* ============================================================================
   KART SAĞLAYICI KATALOĞU — KURULUM verisi (demo değil)
   ----------------------------------------------------------------------------
   §6.1: "Sodexo Avantaj'ın Türkiye'de 2024 marka dönüşümüyle Pluxee olarak
   devam ettiği resmî Pluxee içeriğinde belirtilmektedir. Bu nedenle yeni kayıt
   sağlayıcısı `Pluxee`, kullanıcıya görünen yardımcı ad `Pluxee (eski Sodexo)`
   olmalıdır. Eski içe aktarımlarda `Sodexo` değeri TARİHSEL SAĞLAYICI ADI
   olarak korunur ve Pluxee sağlayıcı ailesine EŞLENİR."

   Bu yüzden `kod` sabittir (`PLUXEE`), görünen ad değişebilir ve `eski_adlar`
   tarihsel adları taşır. Sağlayıcı eklemek = satır eklemek; kodda if/else yok.

   Sağlayıcılar KURULUM verisidir: hiçbiri hesap, kart veya bakiye içermez.
   Gerçek hesaplar kullanıcı tarafından CRD-09 ekranından açılır.
   ========================================================================== */
import { tek, calistir, islem } from '../../cekirdek/db.mjs';
import { kimlik } from '../../cekirdek/kimlikler.mjs';
import { simdi } from '../../cekirdek/zaman.mjs';
import * as audit from '../../cekirdek/audit.mjs';
import { sablonKur } from '../isakisi/numara.mjs';

/** §6.1'in sağlayıcı ailesi listesi. `adaptor` yeteneği belirler. */
export const SAGLAYICILAR = [
  { kod: 'PLUXEE', ad: 'Pluxee (eski Sodexo)', eskiAdlar: 'Sodexo,Sodexo Avantaj,Sodexo Pass',
    tur: 'yemek', adaptor: 'http',
    urunler: [{ kod: 'PLX-YEMEK', ad: 'Yemek kartı', tur: 'yemek' }] },
  { kod: 'MULTINET', ad: 'MultiNet Up', eskiAdlar: 'Multinet,MultiNet',
    tur: 'yemek', adaptor: 'http',
    urunler: [
      { kod: 'MNU-YEMEK', ad: 'Yemek kartı', tur: 'yemek' },
      { kod: 'MNU-YAKIT', ad: 'Yakıt kartı', tur: 'yakit' },
    ] },
  { kod: 'KURUMSAL-KK', ad: 'Kurumsal kredi kartı', eskiAdlar: null,
    tur: 'kredi', adaptor: 'dosya',
    urunler: [{ kod: 'KK-HARCAMA', ad: 'Kurumsal harcama kartı', tur: 'kredi' }] },
  { kod: 'HGS', ad: 'HGS / geçiş', eskiAdlar: 'OGS',
    tur: 'hgs', adaptor: 'dosya',
    urunler: [{ kod: 'HGS-GECIS', ad: 'Otoyol geçiş etiketi', tur: 'hgs' }] },
];

/** Kart modülünün numaralandırma önekleri. */
const NUMARA_ONEKLERI = [
  ['kart', 'KRT'], ['saglayici_hesabi', 'SGH'], ['kart_politikasi', 'KPL'],
  ['kart_mutabakati', 'KMT'], ['entegrasyon', 'ENT'],
];

/** Kart modülünün onay şablonları (§6.7 yetki matrisiyle uyumlu). */
const SABLONLAR = [
  {
    kod: 'KART-POLITIKA', ad: 'Kart politikası onayı', nesne: 'kart_politikasi', sla: 72,
    adimlar: [
      { sira: 1, ad: 'İK onayı', rol: 'ik_sorumlusu', gereken: 1 },
      { sira: 2, ad: 'Finans onayı', rol: 'finans_sorumlusu', gereken: 1 },
      { sira: 3, ad: 'Firma sahibi onayı', rol: 'firma_sahibi', gereken: 1 },
    ],
  },
  {
    kod: 'KART-MUTABAKAT', ad: 'Kart mutabakat farkı onayı', nesne: 'kart_mutabakati', sla: 48,
    adimlar: [
      { sira: 1, ad: 'Finans onayı', rol: 'finans_sorumlusu', gereken: 1 },
      { sira: 2, ad: 'Firma sahibi onayı', rol: 'firma_sahibi', gereken: 1 },
    ],
  },
];

/**
 * Sağlayıcı kataloğunu, numaralandırmayı ve onay şablonlarını kurar.
 * Yeniden çalıştırılabilir: var olan kayıt güncellenir, ikinci kez eklenmez.
 */
export function kartTohumla(tenantId, kullaniciId = null) {
  return islem(() => {
    let eklenen = 0;
    for (const s of SAGLAYICILAR) {
      let kayit = tek('SELECT * FROM kart_saglayici WHERE tenant_id = ? AND kod = ?', tenantId, s.kod);
      if (!kayit) {
        const id = kimlik('saglayici');
        calistir(`INSERT INTO kart_saglayici (id, tenant_id, kod, ad, eski_adlar, tur, adaptor,
                    aktif, olusturan, olusturuldu) VALUES (?,?,?,?,?,?,?,1,?,?)`,
          id, tenantId, s.kod, s.ad, s.eskiAdlar, s.tur, s.adaptor, kullaniciId, simdi());
        kayit = tek('SELECT * FROM kart_saglayici WHERE id = ?', id);
        eklenen++;
      } else {
        /* Ad değişebilir (Sodexo → Pluxee); KOD sabittir. */
        calistir('UPDATE kart_saglayici SET ad = ?, eski_adlar = ?, guncellendi = ? WHERE id = ?',
          s.ad, s.eskiAdlar, simdi(), kayit.id);
      }
      for (const u of s.urunler) {
        if (tek('SELECT id FROM kart_urunu WHERE tenant_id = ? AND kod = ?', tenantId, u.kod)) continue;
        calistir(`INSERT INTO kart_urunu (id, tenant_id, saglayici_id, kod, ad, tur, para_birimi,
                    durum, olusturan, olusturuldu) VALUES (?,?,?,?,?,?, 'TRY', 'aktif', ?,?)`,
          kimlik('urun'), tenantId, kayit.id, u.kod, u.ad, u.tur, kullaniciId, simdi());
      }
    }

    for (const [nesne, onek] of NUMARA_ONEKLERI) sablonKur(tenantId, nesne, onek);

    for (const s of SABLONLAR) {
      if (tek('SELECT id FROM is_akisi_sablonu WHERE tenant_id = ? AND kod = ?', tenantId, s.kod)) continue;
      const id = kimlik('sablon');
      calistir(`INSERT INTO is_akisi_sablonu (id, tenant_id, kod, ad, nesne, durum,
                  tutar_alt_minor, tutar_ust_minor, sla_saat, surum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?, 'yayinda', NULL, NULL, ?, 1, ?, ?)`,
        id, tenantId, s.kod, s.ad, s.nesne, s.sla, kullaniciId, simdi());
      for (const a of s.adimlar) {
        calistir(`INSERT INTO is_akisi_adimi (id, sablon_id, sira, ad, rol_kodu, paralel, gereken_onay)
                  VALUES (?,?,?,?,?,0,?)`,
          kimlik('adim'), id, a.sira, a.ad, a.rol, a.gereken);
      }
      eklenen++;
    }

    if (eklenen) {
      audit.yaz({ tenantId, kullaniciId, nesne: 'kart_saglayici', eylem: 'katalog_tohumlandi',
        sonraki: { saglayici: SAGLAYICILAR.length, sablon: SABLONLAR.length } });
    }
    return eklenen;
  });
}
