/* ============================================================================
   NUMARALANDIRMA (SET-09) — belge ve işlem kodları
   ----------------------------------------------------------------------------
   Kod üretimi transaction içinde ve satır kilitli yapılır: iki eşzamanlı kayıt
   aynı numarayı ALAMAZ. Numara atlanabilir (iptal edilen kayıt), ama tekrar
   edemez — denetim izinde kod tekilliği şarttır.
   ========================================================================== */
import { tek, calistir, islemIcindeMi } from '../../cekirdek/db.mjs';
import { kimlik } from '../../cekirdek/kimlikler.mjs';
import { simdi, gunAnahtari } from '../../cekirdek/zaman.mjs';

export function sablonKur(tenantId, nesne, onek, { yilDahil = true, basamak = 4 } = {}) {
  const varMi = tek('SELECT id FROM numara_sablonu WHERE tenant_id = ? AND nesne = ?', tenantId, nesne);
  if (varMi) return varMi.id;
  const id = kimlik('rapor').replace('rpt', 'num');
  calistir(`INSERT INTO numara_sablonu (id, tenant_id, nesne, onek, yil_dahil, basamak, olusturuldu)
            VALUES (?,?,?,?,?,?,?)`, id, tenantId, nesne, onek, yilDahil ? 1 : 0, basamak, simdi());
  return id;
}

/** Örn. `TLP-2026-0007`. Transaction İÇİNDE çağrılmalı. */
export function sonrakiKod(tenantId, nesne) {
  if (!islemIcindeMi()) throw new Error('Numara üretimi transaction dışında yapılamaz.');
  const s = tek('SELECT * FROM numara_sablonu WHERE tenant_id = ? AND nesne = ?', tenantId, nesne);
  if (!s) throw new Error(`Numaralandırma şablonu tanımsız: ${nesne}`);
  const sira = s.sonraki;
  calistir('UPDATE numara_sablonu SET sonraki = sonraki + 1 WHERE id = ?', s.id);
  const yil = s.yil_dahil ? gunAnahtari(simdi()).slice(0, 4) + '-' : '';
  return `${s.onek}-${yil}${String(sira).padStart(s.basamak, '0')}`;
}
