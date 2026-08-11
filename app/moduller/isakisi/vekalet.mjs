/* ============================================================================
   VEKALET — süreli, çakışma kontrollü, denetim kayıtlı (SET-07, §5.3)
   ----------------------------------------------------------------------------
   "Vekaletler süreli ve audit kayıtlıdır." Aynı kişi için tarih aralığı çakışan
   iki aktif vekalet OLAMAZ — aksi halde bir onay iki farklı vekile düşer ve
   kimin karar verdiği belirsizleşir.
   ========================================================================== */
import { sorgu, tek, calistir, islem } from '../../cekirdek/db.mjs';
import { kimlik } from '../../cekirdek/kimlikler.mjs';
import { simdi } from '../../cekirdek/zaman.mjs';
import { DogrulamaHatasi, Cakisma } from '../../cekirdek/hata.mjs';
import * as audit from '../../cekirdek/audit.mjs';

export function olustur(ctx, { verenId, alanId, baslangic, bitis, kapsam = null, gerekce = null }) {
  if (verenId === alanId) {
    throw DogrulamaHatasi('Kişi kendine vekalet veremez.', { alanlar: { alanId: ['Farklı bir kullanıcı seçin.'] } });
  }
  if (!(bitis > baslangic)) {
    throw DogrulamaHatasi('Bitiş tarihi başlangıçtan sonra olmalı.', { alanlar: { bitis: ['Geçersiz tarih aralığı.'] } });
  }

  /* Çakışma: [baslangic, bitis) aralıkları kesişiyorsa reddet. */
  const cakisan = tek(
    `SELECT * FROM vekalet
      WHERE tenant_id = ? AND veren_id = ? AND durum = 'aktif'
        AND baslangic < ? AND bitis > ?`,
    ctx.tenant.id, verenId, bitis, baslangic);
  if (cakisan) {
    throw Cakisma('Bu tarih aralığında zaten aktif bir vekalet var; önce onu iptal edin.');
  }

  return islem(() => {
    const id = kimlik('onay').replace('apr', 'vkl');
    calistir(`INSERT INTO vekalet (id, tenant_id, veren_id, alan_id, kapsam, baslangic, bitis, gerekce, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?)`,
      id, ctx.tenant.id, verenId, alanId, kapsam, baslangic, bitis, gerekce, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'vekalet', nesneId: id, eylem: 'olustur', gerekce,
      sonraki: { verenId, alanId, baslangic, bitis, kapsam } });
    return id;
  });
}

export function iptal(ctx, id, gerekce) {
  const v = tek('SELECT * FROM vekalet WHERE id = ? AND tenant_id = ?', id, ctx.tenant.id);
  if (!v) throw DogrulamaHatasi('Vekalet bulunamadı.');
  if (!String(gerekce || '').trim()) {
    throw DogrulamaHatasi('İptal için gerekçe zorunludur.', { alanlar: { gerekce: ['Gerekçe girin.'] } });
  }
  return islem(() => {
    calistir(`UPDATE vekalet SET durum = 'iptal', guncelleyen = ?, guncellendi = ?, surum = surum + 1 WHERE id = ?`,
      ctx.kullanici.id, simdi(), id);
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'vekalet', nesneId: id, eylem: 'iptal', gerekce,
      onceki: { durum: v.durum }, sonraki: { durum: 'iptal' } });
  });
}

/** Kullanıcının ŞU AN vekaleten temsil ettiği kişiler. */
export function vekilOlduklari(tenantId, kullaniciId, anMs = simdi()) {
  return sorgu(
    `SELECT v.*, k.ad_soyad AS veren_ad FROM vekalet v JOIN kullanici k ON k.id = v.veren_id
      WHERE v.tenant_id = ? AND v.alan_id = ? AND v.durum = 'aktif' AND v.baslangic <= ? AND v.bitis > ?`,
    tenantId, kullaniciId, anMs, anMs);
}

/** Kullanıcı adına şu an vekalet eden kişiler. */
export function vekilleri(tenantId, kullaniciId, anMs = simdi()) {
  return sorgu(
    `SELECT v.*, k.ad_soyad AS alan_ad FROM vekalet v JOIN kullanici k ON k.id = v.alan_id
      WHERE v.tenant_id = ? AND v.veren_id = ? AND v.durum = 'aktif' AND v.baslangic <= ? AND v.bitis > ?`,
    tenantId, kullaniciId, anMs, anMs);
}

export const listele = (tenantId) => sorgu(
  `SELECT v.*, kv.ad_soyad AS veren_ad, ka.ad_soyad AS alan_ad
     FROM vekalet v JOIN kullanici kv ON kv.id = v.veren_id JOIN kullanici ka ON ka.id = v.alan_id
    WHERE v.tenant_id = ? ORDER BY v.baslangic DESC`, tenantId);
