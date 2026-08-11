/* ============================================================================
   DOKÜMAN SERVİSİ — sürümlü belge kaydı (DOC-01..03, §5.4)
   ----------------------------------------------------------------------------
   "Onaylı sürüm yerinde değiştirilmez; yeni revizyon açılır." Belge sürümü satırı
   tetikleyiciyle UPDATE'e kapalıdır: yeni yükleme = yeni sürüm satırı.
   Dosyalar nesne deposunda (burada dosya sisteminde), metadata veritabanında;
   ikisi ARASINDAKİ bağ özet (sha256) ile doğrulanır.
   ========================================================================== */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { sorgu, tek, calistir, islem } from '../../cekirdek/db.mjs';
import { kimlik } from '../../cekirdek/kimlikler.mjs';
import { simdi } from '../../cekirdek/zaman.mjs';
import { KOK } from '../../cekirdek/yapilandirma.mjs';
import { DogrulamaHatasi, Bulunamadi } from '../../cekirdek/hata.mjs';
import * as audit from '../../cekirdek/audit.mjs';
import { dosyaDogrula } from '../../cekirdek/coklu-parca.mjs';
import { sonrakiKod } from '../isakisi/numara.mjs';

const DEPO = process.env.GB_DOSYA_DEPO || 'veri/dosyalar';

/** İçerik-adresli yol: aynı içerik iki kez saklanmaz, özet bağı bozulmaz. */
function depoYolu(tenantId, ozet) {
  return `${DEPO}/${tenantId}/${ozet.slice(0, 2)}/${ozet}`;
}

function dosyayiYaz(tenantId, dosya) {
  const gorece = depoYolu(tenantId, dosya.ozet);
  const tam = resolve(KOK, gorece);
  if (!existsSync(tam)) {
    mkdirSync(dirname(tam), { recursive: true });
    writeFileSync(tam, dosya.icerik);
  }
  return gorece;
}

export function dosyaOku(depoGorece) {
  const tam = resolve(KOK, depoGorece);
  if (!tam.startsWith(resolve(KOK, DEPO))) throw Bulunamadi();
  if (!existsSync(tam)) throw Bulunamadi('Dosya deposunda bulunamadı.');
  return readFileSync(tam);
}

/* --- Oluşturma ----------------------------------------------------------- */
export function olustur(ctx, { ad, belgeTuru, sinif = 'ic', aciklama = null,
                               ilgiliNesne = null, ilgiliId = null,
                               projeId = null, santiyeId = null, gecerlilik = null }, dosya) {
  if (!String(ad || '').trim()) {
    throw DogrulamaHatasi('Belge adı zorunludur.', { alanlar: { ad: ['Belge adı girin.'] } });
  }
  if (!belgeTuru) {
    throw DogrulamaHatasi('Belge türü zorunludur.', { alanlar: { belgeTuru: ['Belge türü seçin.'] } });
  }
  if (!dosya) {
    throw DogrulamaHatasi('Dosya zorunludur.', { alanlar: { dosya: ['Bir dosya seçin.'] } });
  }
  const dosyaHatalari = dosyaDogrula(dosya);
  if (dosyaHatalari.length) throw DogrulamaHatasi('Dosya kabul edilmedi.', { alanlar: { dosya: dosyaHatalari } });

  return islem(() => {
    const kod = sonrakiKod(ctx.tenant.id, 'dokuman');
    const id = kimlik('dokuman');
    calistir(`INSERT INTO dokuman (id, tenant_id, kod, ad, belge_turu, sinif, proje_id, santiye_id,
                ilgili_nesne, ilgili_id, gecerlilik, aktif_surum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
      id, ctx.tenant.id, kod, ad.trim(), belgeTuru, sinif, projeId, santiyeId,
      ilgiliNesne, ilgiliId, gecerlilik, ctx.kullanici.id, simdi());

    const yol = dosyayiYaz(ctx.tenant.id, dosya);
    calistir(`INSERT INTO dokuman_surumu (id, dokuman_id, surum_no, dosya_adi, mime, bayt, ozet, depo_yolu, aciklama, yukleyen, yuklendi)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      kimlik('dosya'), id, 1, dosya.dosyaAdi, dosya.mime, dosya.bayt, dosya.ozet, yol,
      aciklama, ctx.kullanici.id, simdi());

    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'dokuman', nesneId: id, eylem: 'olustur',
      sonraki: { kod, ad, belgeTuru, sinif, surum: 1, dosyaOzeti: dosya.ozet, bayt: dosya.bayt } });
    return { id, kod };
  });
}

/* --- Yeni sürüm ---------------------------------------------------------- */
/** Mevcut sürüm DEĞİŞTİRİLMEZ; yeni sürüm satırı açılır (§5.4). */
export function surumEkle(ctx, dokumanId, dosya, aciklama = null) {
  const d = tek('SELECT * FROM dokuman WHERE id = ? AND tenant_id = ?', dokumanId, ctx.tenant.id);
  if (!d) throw Bulunamadi('Doküman bulunamadı.');
  if (!dosya) throw DogrulamaHatasi('Dosya zorunludur.', { alanlar: { dosya: ['Bir dosya seçin.'] } });
  const hatalar = dosyaDogrula(dosya);
  if (hatalar.length) throw DogrulamaHatasi('Dosya kabul edilmedi.', { alanlar: { dosya: hatalar } });

  return islem(() => {
    const yeniNo = d.aktif_surum + 1;
    const yol = dosyayiYaz(ctx.tenant.id, dosya);
    calistir(`INSERT INTO dokuman_surumu (id, dokuman_id, surum_no, dosya_adi, mime, bayt, ozet, depo_yolu, aciklama, yukleyen, yuklendi)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      kimlik('dosya'), d.id, yeniNo, dosya.dosyaAdi, dosya.mime, dosya.bayt, dosya.ozet, yol,
      aciklama, ctx.kullanici.id, simdi());
    calistir(`UPDATE dokuman SET aktif_surum = ?, guncelleyen = ?, guncellendi = ?, surum = surum + 1 WHERE id = ?`,
      yeniNo, ctx.kullanici.id, simdi(), d.id);
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'dokuman', nesneId: d.id, eylem: 'surum_ekle', gerekce: aciklama,
      onceki: { aktifSurum: d.aktif_surum }, sonraki: { aktifSurum: yeniNo, dosyaOzeti: dosya.ozet } });
    return { surumNo: yeniNo };
  });
}

/* --- Sorgular ------------------------------------------------------------- */
export const detay = (tenantId, id) => tek('SELECT * FROM dokuman WHERE id = ? AND tenant_id = ?', id, tenantId);
export const surumler = (dokumanId) =>
  sorgu(`SELECT s.*, k.ad_soyad AS yukleyen_ad FROM dokuman_surumu s
           JOIN kullanici k ON k.id = s.yukleyen
          WHERE s.dokuman_id = ? ORDER BY s.surum_no DESC`, dokumanId);
export const aktifSurum = (dokumanId) =>
  tek(`SELECT * FROM dokuman_surumu s JOIN dokuman d ON d.id = s.dokuman_id
        WHERE s.dokuman_id = ? AND s.surum_no = d.aktif_surum`, dokumanId);

/** İlgili kayıtların belgeleri (detay sayfası "belgeler" sekmesi). */
export const ilgiliBelgeler = (tenantId, nesne, nesneId) =>
  sorgu(`SELECT * FROM dokuman WHERE tenant_id = ? AND ilgili_nesne = ? AND ilgili_id = ? ORDER BY olusturuldu DESC`,
    tenantId, nesne, nesneId);
