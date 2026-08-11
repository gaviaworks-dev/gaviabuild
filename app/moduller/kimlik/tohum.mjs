/* ============================================================================
   TOHUMLAMA — sistem rolleri, yetkiler ve DEMO tenant
   ----------------------------------------------------------------------------
   · Sistem rolleri ve yetkileri screen-manifest'ten ÜRETİLİR (roller.mjs).
   · Demo veri GERÇEK servis çağrılarıyla oluşur ve `DEMO` etiketi taşır
     (doküman §10 "Teslimat": seed/demo veri gerçek API üzerinden oluşturulsun).
   · Üretim ortamında demo tenant OLUŞTURULMAZ.
   ========================================================================== */
import { tek, sorgu, calistir, islem } from '../../cekirdek/db.mjs';
import { kimlik } from '../../cekirdek/kimlikler.mjs';
import { simdi } from '../../cekirdek/zaman.mjs';
import { manifest, yapilandirma, BAYRAKLAR } from '../../cekirdek/yapilandirma.mjs';
import * as audit from '../../cekirdek/audit.mjs';
import { ROLLER, yetkileriUret } from './roller.mjs';
import * as parola from './parola.mjs';

/** Sistem rollerini ve manifestten türeyen yetkilerini kurar/günceller. */
export function rolleriKur() {
  const ekranlar = manifest().ekranlar;
  return islem(() => {
    for (const tanim of ROLLER) {
      let r = tek('SELECT * FROM rol WHERE kod = ? AND tenant_id IS NULL', tanim.kod);
      if (!r) {
        const id = kimlik('rol');
        calistir(`INSERT INTO rol (id, tenant_id, kod, ad, aciklama, sistem, olusturuldu)
                  VALUES (?, NULL, ?, ?, ?, 1, ?)`, id, tanim.kod, tanim.ad, tanim.aciklama, simdi());
        r = tek('SELECT * FROM rol WHERE id = ?', id);
      } else {
        calistir('UPDATE rol SET ad = ?, aciklama = ?, guncellendi = ? WHERE id = ?',
          tanim.ad, tanim.aciklama, simdi(), r.id);
      }
      /* Yetkiler manifestten türer → her açılışta yeniden hesaplanır ve senkronlanır. */
      const yetkiler = yetkileriUret(tanim, ekranlar);
      calistir('DELETE FROM rol_yetki WHERE rol_id = ?', r.id);
      for (const y of yetkiler) calistir('INSERT INTO rol_yetki (rol_id, yetki) VALUES (?,?)', r.id, y);
    }
    audit.yaz({ nesne: 'rol', eylem: 'sistem_rolleri_senkronlandi',
      sonraki: { rolSayisi: ROLLER.length, ekranSayisi: ekranlar.length } });
    return ROLLER.length;
  });
}

/** Bir tenant'a rol kapsam kurallarını (ABAC) yazar. */
function kapsamKurallariKur(tenantId) {
  for (const tanim of ROLLER) {
    if (!tanim.kapsam?.length) continue;
    const r = tek('SELECT id FROM rol WHERE kod = ? AND tenant_id IS NULL', tanim.kod);
    if (!r) continue;
    for (const k of tanim.kapsam) {
      const varMi = tek('SELECT id FROM veri_kapsami WHERE tenant_id = ? AND rol_id = ? AND nesne = ? AND kural = ?',
        tenantId, r.id, k.nesne, k.kural);
      if (varMi) continue;
      calistir(`INSERT INTO veri_kapsami (id, tenant_id, rol_id, nesne, kural, deger, olusturuldu)
                VALUES (?,?,?,?,?,?,?)`,
        kimlik('rol'), tenantId, r.id, k.nesne, k.kural, JSON.stringify(k.deger || {}), simdi());
    }
  }
}

/**
 * DEMO tenant — tamamen kurgusal "Yapıtaş İnşaat A.Ş.".
 * Üretimde çalışmaz; kayıtlar `demo = 1` ile işaretlenir.
 */
export function demoTenantKur({ zorla = false } = {}) {
  if (yapilandirma.uretim && !zorla) return null;
  const mevcut = tek('SELECT * FROM tenant WHERE kod = ?', 'yapitas');
  if (mevcut) return mevcut;

  return islem(() => {
    const tenantId = kimlik('tenant');
    calistir(`INSERT INTO tenant (id, kod, ad, para_birimi, saat_dilimi, demo, olusturuldu)
              VALUES (?,?,?,?,?,1,?)`,
      tenantId, 'yapitas', 'Yapıtaş İnşaat A.Ş.', 'TRY', 'Europe/Istanbul', simdi());
    audit.yaz({ tenantId, nesne: 'tenant', eylem: 'olustur', sonraki: { kod: 'yapitas', demo: true } });

    calistir(`INSERT INTO sirket (id, tenant_id, kod, unvan, vergi_dairesi, vergi_no, para_birimi, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?)`,
      kimlik('proje').replace('prj', 'srk'), tenantId, 'YPT', 'Yapıtaş İnşaat Taahhüt A.Ş.',
      'Kozyatağı', '1234567890', 'TRY', simdi());

    kapsamKurallariKur(tenantId);

    /* Demo kullanıcılar — her biri DEMO etiketli tenant altında, gerçek parola akışıyla. */
    const kullanicilar = [
      { eposta: 'sahip@yapitas.demo',    ad: 'Kemal Yapıcıoğlu', rol: 'firma_sahibi' },
      { eposta: 'sistem@yapitas.demo',   ad: 'Deniz Aksoy',      rol: 'sistem_yoneticisi' },
      { eposta: 'proje@yapitas.demo',    ad: 'Elif Karahan',     rol: 'proje_muduru' },
      { eposta: 'sef@yapitas.demo',      ad: 'Murat Şen',        rol: 'santiye_sefi' },
      { eposta: 'satinalma@yapitas.demo', ad: 'Okan Eren',       rol: 'satinalma_sorumlusu' },
      { eposta: 'depo@yapitas.demo',     ad: 'Hakan Tuna',       rol: 'depo_sorumlusu' },
      { eposta: 'finans@yapitas.demo',   ad: 'Selin Duran',      rol: 'finans_sorumlusu' },
      { eposta: 'ik@yapitas.demo',       ad: 'Ayça Bulut',       rol: 'ik_sorumlusu' },
      { eposta: 'calisan@yapitas.demo',  ad: 'Serkan Ay',        rol: 'calisan' },
      { eposta: 'denetci@yapitas.demo',  ad: 'Nuray Özkan',      rol: 'denetci' },
    ];
    const { ozet, tuz } = parola.ozetle('Demo.Parola.2026');
    for (const u of kullanicilar) {
      const id = kimlik('kullanici');
      calistir(`INSERT INTO kullanici (id, tenant_id, eposta, ad_soyad, parola_ozeti, parola_tuz,
                  parola_degisti, kurulum_tamam, durum, olusturuldu)
                VALUES (?,?,?,?,?,?,?,1,'aktif',?)`,
        id, tenantId, u.eposta, u.ad, ozet, tuz, simdi(), simdi());
      const rol = tek('SELECT id FROM rol WHERE kod = ? AND tenant_id IS NULL', u.rol);
      calistir(`INSERT INTO kullanici_rol (id, tenant_id, kullanici_id, rol_id, olusturuldu)
                VALUES (?,?,?,?,?)`, kimlik('rol'), tenantId, id, rol.id, simdi());
      audit.yaz({ tenantId, nesne: 'kullanici', nesneId: id, eylem: 'demo_kullanici_olustur',
        sonraki: { eposta: u.eposta, rol: u.rol, demo: true } });
    }

    /* Demo bayrakları yalnız demo tenant için açılır; üretimde kod düzeyinde kilitli. */
    for (const kod of [BAYRAKLAR.DEMO_ROL_SECIMI, BAYRAKLAR.DEMO_VERI]) {
      calistir(`INSERT OR REPLACE INTO ozellik_bayragi (kod, tenant_id, acik, aciklama, guncellendi)
                VALUES (?,?,?,?,?)`, kod, tenantId, 1, 'Demo/QA yüzeyi — üretimde kapalı', simdi());
    }
    return tek('SELECT * FROM tenant WHERE id = ?', tenantId);
  });
}

/** Demo personaları — giriş sayfasındaki DEMO bloğu bunları listeler. */
export function demoPersonalar() {
  return sorgu(`SELECT k.eposta, k.ad_soyad, r.ad AS rol_ad, r.kod AS rol_kod
                  FROM kullanici k
                  JOIN tenant t ON t.id = k.tenant_id AND t.demo = 1
                  JOIN kullanici_rol kr ON kr.kullanici_id = k.id
                  JOIN rol r ON r.id = kr.rol_id
                 WHERE k.durum = 'aktif'
                 ORDER BY k.olusturuldu ASC`);
}
