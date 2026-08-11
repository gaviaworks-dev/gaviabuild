/* ============================================================================
   DENETİM İZİ — değiştirilemez, zincirli (SET-16, §5.7)
   ----------------------------------------------------------------------------
   "Audit kayıtları değiştirilemez" şartı iki katmanla sağlanır:
     1) SQLite tetikleyicileri UPDATE/DELETE'i reddeder (goc.mjs).
     2) Her satır bir öncekinin özetini taşır — araya girme/silme tespit edilir.
   Kritik işlemde audit YOKSA iş kabul edilmez (§12).
   ========================================================================== */
import { createHash } from 'node:crypto';
import { tek, sorgu, calistir, islemIcindeMi } from './db.mjs';
import { kimlik } from './kimlikler.mjs';
import { simdi } from './zaman.mjs';

const KOK_OZET = '0'.repeat(64);

function ozetle(s) {
  return createHash('sha256').update([
    s.sira, s.tenant_id ?? '', s.kullanici_id ?? '', s.nesne, s.nesne_id ?? '',
    s.eylem, s.gerekce ?? '', s.onceki ?? '', s.sonraki ?? '', s.zaman, s.onceki_ozet,
  ].join('|')).digest('hex');
}

/**
 * Denetim kaydı yazar. Transaction İÇİNDE çağrılmalı: iş kaydı yazılıp audit
 * yazılmadan commit olursa denetim izi delinir.
 */
export function yaz({ tenantId = null, kullaniciId = null, istekId = null, ip = null,
                      nesne, nesneId = null, eylem, gerekce = null, onceki = null, sonraki = null }) {
  if (!islemIcindeMi()) throw new Error('Denetim kaydı transaction dışında yazılamaz.');
  const son = tek('SELECT sira, ozet FROM denetim_izi ORDER BY sira DESC LIMIT 1');
  const satir = {
    id: kimlik('audit'),
    sira: (son?.sira ?? 0) + 1,
    tenant_id: tenantId, kullanici_id: kullaniciId, istek_id: istekId, ip,
    nesne, nesne_id: nesneId, eylem, gerekce,
    onceki: onceki ? JSON.stringify(onceki) : null,
    sonraki: sonraki ? JSON.stringify(sonraki) : null,
    zaman: simdi(),
    onceki_ozet: son?.ozet ?? KOK_OZET,
  };
  satir.ozet = ozetle(satir);
  calistir(`INSERT INTO denetim_izi
    (id, sira, tenant_id, kullanici_id, istek_id, ip, nesne, nesne_id, eylem, gerekce,
     onceki, sonraki, zaman, onceki_ozet, ozet)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    satir.id, satir.sira, satir.tenant_id, satir.kullanici_id, satir.istek_id, satir.ip,
    satir.nesne, satir.nesne_id, satir.eylem, satir.gerekce, satir.onceki, satir.sonraki,
    satir.zaman, satir.onceki_ozet, satir.ozet);
  return satir.id;
}

/** Zincir doğrulaması — her faz raporunda çalıştırılır (AUD-01 kabul testi). */
export function zinciriDogrula() {
  const satirlar = sorgu('SELECT * FROM denetim_izi ORDER BY sira ASC');
  let beklenen = KOK_OZET;
  for (const s of satirlar) {
    if (s.onceki_ozet !== beklenen) return { saglam: false, kirilma: s.sira, neden: 'önceki özet uyuşmuyor' };
    if (ozetle(s) !== s.ozet) return { saglam: false, kirilma: s.sira, neden: 'satır özeti uyuşmuyor' };
    beklenen = s.ozet;
  }
  return { saglam: true, satir: satirlar.length };
}

/** Bir kaydın tüm denetim geçmişi (detay sayfası "sürüm geçmişi" sekmesi). */
export function gecmis(nesne, nesneId) {
  return sorgu('SELECT * FROM denetim_izi WHERE nesne = ? AND nesne_id = ? ORDER BY sira ASC', nesne, nesneId)
    .map((s) => ({ ...s, onceki: s.onceki ? JSON.parse(s.onceki) : null, sonraki: s.sonraki ? JSON.parse(s.sonraki) : null }));
}
