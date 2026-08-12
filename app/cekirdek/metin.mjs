/* ============================================================================
   SERBEST METİN SINIRI — denetim-02 D-15, KARARLAR.md K-127
   ----------------------------------------------------------------------------
   Serbest metin alanlarında hiçbir uzunluk sınırı yoktu: 100.000 karakterlik
   bir açıklama DEĞİŞMEZ kasa defterine giriyor, oradan listeye, rapora ve PDF'e
   taşınıyordu. Defter satırı silinemediği için bu geri alınamaz bir şişmedir.

   Sınır form katmanında DEĞİL, veriye giriş kapısında zorlanır: elle yazılmış
   rotalar `girdiCoz()`ten geçmez, ama hepsi bu yardımcıdan geçebilir.
   ========================================================================== */
import { yapilandirma } from './yapilandirma.mjs';
import { DogrulamaHatasi } from './hata.mjs';

/**
 * Metni sınırla; aşarsa 422 ile AÇIKÇA reddet (sessizce kırpma — kırpılmış
 * açıklama, denetimde "ne için" sorusunu yarım yanıtlar).
 *
 * @param {any} deger
 * @param {{alan?:string, etiket?:string, enFazla?:number}} p
 * @returns {string|null} kırpılmamış, doğrulanmış metin
 */
export function metinSinirZorunlu(deger, { alan = 'metin', etiket = null,
                                           enFazla = yapilandirma.metinEnFazla } = {}) {
  if (deger == null) return null;
  const s = String(deger);
  if (s.length > enFazla) {
    const ad = etiket || alan;
    throw DogrulamaHatasi(
      `${ad} çok uzun: ${s.length.toLocaleString('tr-TR')} karakter girildi, `
      + `en fazla ${enFazla.toLocaleString('tr-TR')} karakter kabul edilir. `
      + 'Metin KIRPILMADI — kısaltıp tekrar gönderin.',
      { alanlar: { [alan]: [`En fazla ${enFazla.toLocaleString('tr-TR')} karakter.`] } });
  }
  return s;
}

/**
 * Alan türünden öntanımlı sınır. `kayit-modulu` sözlüğünde `uzunMetin` çok
 * satırlı alandır (textarea), `metin` tek satırlıktır — sınırlar buna göre.
 * Alan kendi `enFazla`sını bildirmişse o kazanır; bu yalnız ÖNTANIMDIR.
 */
export const varsayilanSinir = (tur) =>
  (tur === 'uzunMetin' ? yapilandirma.metinEnFazla : yapilandirma.kisaMetinEnFazla);
