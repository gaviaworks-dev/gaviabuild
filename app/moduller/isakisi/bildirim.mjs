/* ============================================================================
   BİLDİRİM — olay → kanal → alıcı (GLB-06, SET-08)
   ----------------------------------------------------------------------------
   Bildirim SAHTE BAŞARI DEĞİLDİR: gerçek bir olayın gerçek alıcıya kalıcı
   kaydıdır. Transaction içinde yazılır; iş kaydı geri alınırsa bildirim de gider.
   ========================================================================== */
import { sorgu, tek, calistir, islemIcindeMi } from '../../cekirdek/db.mjs';
import { kimlik } from '../../cekirdek/kimlikler.mjs';
import { simdi } from '../../cekirdek/zaman.mjs';

/** Tek kullanıcıya bildirim. */
export function bildir(ctx, { kullaniciId, tur, baslik, govde = null, nesne = null, nesneId = null,
                              rota = null, onem = 'bilgi' }) {
  if (!islemIcindeMi()) throw new Error('Bildirim transaction dışında yazılamaz.');
  const id = kimlik('bildirim');
  calistir(`INSERT INTO bildirim (id, tenant_id, kullanici_id, tur, baslik, govde, nesne, nesne_id, rota, onem, olusturuldu)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    id, ctx.tenant.id, kullaniciId, tur, baslik, govde, nesne, nesneId, rota, onem, simdi());
  return id;
}

/** Bir role sahip tüm kullanıcılara (kapsam filtresiyle) bildirim. */
export function roleBildir(ctx, { rolKodu, kapsamTur = null, kapsamId = null, ...p }) {
  const alicilar = sorgu(
    `SELECT DISTINCT kr.kullanici_id FROM kullanici_rol kr
       JOIN rol r ON r.id = kr.rol_id
       JOIN kullanici k ON k.id = kr.kullanici_id
      WHERE kr.tenant_id = ? AND r.kod = ? AND k.durum = 'aktif'
        AND (? IS NULL OR kr.kapsam_tur IS NULL OR (kr.kapsam_tur = ? AND kr.kapsam_id = ?))`,
    ctx.tenant.id, rolKodu, kapsamTur, kapsamTur, kapsamId);
  return alicilar.map((a) => bildir(ctx, { kullaniciId: a.kullanici_id, ...p }));
}

export function okunduIsaretle(ctx, bildirimId) {
  const b = tek('SELECT * FROM bildirim WHERE id = ? AND kullanici_id = ?', bildirimId, ctx.kullanici.id);
  if (!b) return false;
  calistir('UPDATE bildirim SET okundu = ? WHERE id = ?', simdi(), bildirimId);
  return true;
}

export function tumunuOkunduIsaretle(ctx) {
  const s = calistir('UPDATE bildirim SET okundu = ? WHERE kullanici_id = ? AND okundu IS NULL',
    simdi(), ctx.kullanici.id);
  return s.changes;
}

export function ertele(ctx, bildirimId, msSonra) {
  calistir('UPDATE bildirim SET ertelendi = ? WHERE id = ? AND kullanici_id = ?',
    simdi() + msSonra, bildirimId, ctx.kullanici.id);
}
