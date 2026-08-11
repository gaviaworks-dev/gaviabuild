/* ============================================================================
   IDEMPOTENCY — çift gönderim ve güvenli tekrar (değişmez kural 8)
   ----------------------------------------------------------------------------
   Aynı anahtarla gelen ikinci istek işi TEKRAR YAPMAZ; ilk sonucu döndürür.
   Aynı anahtar + FARKLI gövde = 409 (anahtarın yeniden kullanımı hatadır).
   Devam eden bir istekle çakışma da 409'dur — iki eşzamanlı gönderim ikinci
   kez muhasebeleşemez (doküman §6.4/6: "aynı olay iki kez muhasebeleşmez").
   ========================================================================== */
import { createHash } from 'node:crypto';
import { tek, calistir, islem } from './db.mjs';
import { simdi } from './zaman.mjs';
import { IdempotencyCakisma } from './hata.mjs';

const govdeOzeti = (govde) => createHash('sha256').update(JSON.stringify(govde ?? null)).digest('hex');

/**
 * @param {{anahtar:string|null, tenantId:string, kullaniciId?:string, govde:any}} p
 * @param {() => any} is  gerçek iş — yalnız bir kez çalışır
 */
export function idempotent({ anahtar, tenantId, kullaniciId = null, govde }, is) {
  if (!anahtar) return is();                       // anahtarsız istek: sıradan yol
  const ozet = govdeOzeti(govde);

  const mevcut = tek('SELECT * FROM idempotency WHERE tenant_id = ? AND anahtar = ?', tenantId, anahtar);
  if (mevcut) {
    if (mevcut.istek_ozeti !== ozet) throw IdempotencyCakisma();
    if (mevcut.durum === 'tamam') return JSON.parse(mevcut.sonuc);
    if (mevcut.durum === 'islemde') throw IdempotencyCakisma('Aynı anahtarla bir istek hâlâ işleniyor.');
    /* durum = 'hata': tekrar denenebilir, kaydı temizleyip yeniden çalıştır */
    calistir('DELETE FROM idempotency WHERE tenant_id = ? AND anahtar = ?', tenantId, anahtar);
  }

  islem(() => calistir(
    `INSERT INTO idempotency (anahtar, tenant_id, kullanici_id, istek_ozeti, durum, olusturuldu)
     VALUES (?,?,?,?, 'islemde', ?)`, anahtar, tenantId, kullaniciId, ozet, simdi()));

  try {
    const sonuc = is();
    calistir(`UPDATE idempotency SET durum = 'tamam', sonuc = ?, bitti = ?
               WHERE tenant_id = ? AND anahtar = ?`,
      JSON.stringify(sonuc ?? null), simdi(), tenantId, anahtar);
    return sonuc;
  } catch (e) {
    /* İş kuralı reddi ile teknik hata AYRILIR (doküman §6.4 madde 7):
       iş kuralı reddi kalıcıdır (tekrar aynı sonucu verir), teknik hata
       güvenle tekrar edilebilir olduğu için kayıt silinir.                  */
    const isKuraliReddi = e?.durum >= 400 && e?.durum < 500;
    if (isKuraliReddi) {
      calistir(`UPDATE idempotency SET durum = 'tamam', sonuc = ?, http_durum = ?, bitti = ?
                 WHERE tenant_id = ? AND anahtar = ?`,
        JSON.stringify({ hata: e.kod, mesaj: e.mesaj }), e.durum, simdi(), tenantId, anahtar);
    } else {
      calistir('DELETE FROM idempotency WHERE tenant_id = ? AND anahtar = ?', tenantId, anahtar);
    }
    throw e;
  }
}
