/* ============================================================================
   ŞANTİYE AÇILIŞ VE KAPANIŞ ENGELLERİ — doküman §7 zorunlu bağ tablosu
   ----------------------------------------------------------------------------
   "Şantiye kapanış → Stok, varlık, kasa, belge, açık iş: engel listesi
   sıfırlanmadan kapalı duruma geçmez."

   Engeller BURADA hesaplanır ve İKİ yerde kullanılır:
     · SITE-05 / SITE-16 sihirbaz ekranı (kullanıcıya gösterim)
     · durumlar.mjs geçiş ön koşulu (sunucu tarafı zorlama)
   Aynı listeyi iki kez yazmak, ekran ile motorun ayrışmasına yol açardı.

   Bu modül YALNIZ veri katmanına bağlıdır; rota modüllerine bağımlılığı yoktur
   (durumlar.mjs ↔ rotalar döngüsü oluşmasın diye).
   ========================================================================== */
import { tek, sorgu } from '../../cekirdek/db.mjs';
import { simdi } from '../../cekirdek/zaman.mjs';

const say = (sql, ...p) => Number(tek(sql, ...p)?.n ?? 0);

/**
 * Henüz uygulanmamış modüllerin kontrolleri "planlı" işaretlenir: bunlar
 * tamamlanmış SAYILMAZ ve "denetlendi" gibi gösterilmez (§12 dürüstlük kuralı).
 * Faz 4 (stok, varlık, kasa) geldiğinde bu satırlar gerçek sorguya bağlanır.
 */
export function acilisKontrolleri(santiyeId) {
  const s = tek('SELECT * FROM santiye WHERE id = ?', santiyeId);
  if (!s) return [];
  const zorunluBelge = sorgu(
    `SELECT * FROM santiye_belgesi WHERE santiye_id = ? AND zorunlu = 1 AND durum <> 'iptal'`, santiyeId);
  const gecersizBelge = zorunluBelge.filter(
    (b) => b.durum !== 'gecerli' || (b.gecerlilik != null && b.gecerlilik < simdi()));
  const atama = say(
    `SELECT COUNT(*) AS n FROM personel_atama WHERE santiye_id = ? AND durum = 'aktif'`, santiyeId);
  const program = say(
    `SELECT COUNT(*) AS n FROM is_programi WHERE santiye_id = ? AND baz_cizgi = 1`, santiyeId);

  return [
    { ad: 'Şantiye künyesi', engel: !(s.adres && s.baslangic), zorunlu: true,
      not: 'Adres ve başlangıç tarihi girilmeli.', rota: `/santiyeler/${santiyeId}/duzenle` },
    { ad: 'Şantiye şefi atandı', engel: !s.sef_id, zorunlu: true,
      not: 'Saha sorumluluğu tanımsız şantiye açılamaz.', rota: `/santiyeler/${santiyeId}/duzenle` },
    { ad: 'Zorunlu resmi belgeler geçerli', engel: zorunluBelge.length === 0 || gecersizBelge.length > 0, zorunlu: true,
      not: zorunluBelge.length === 0 ? 'En az bir zorunlu belge (ruhsat, İSG izni) kayıtlı olmalı.'
        : gecersizBelge.length ? `${gecersizBelge.length} zorunlu belge geçersiz veya süresi dolmuş.`
        : `${zorunluBelge.length} zorunlu belge geçerli.`,
      rota: `/santiyeler/${santiyeId}/izinler` },
    { ad: 'Saha ekibi atandı', engel: atama === 0, zorunlu: true,
      not: atama ? `${atama} aktif personel ataması var.` : 'En az bir aktif personel ataması gerekli.',
      rota: '/personel-atamalari' },
    { ad: 'Onaylı baz çizgi', engel: program === 0, zorunlu: false,
      not: program ? 'Baz çizgi onaylı.' : 'Baz çizgisi olmayan şantiyede ilerleme ölçülemez (uyarı).',
      rota: '/is-programlari' },
    { ad: 'Depo ve kasa kurulumu', engel: true, zorunlu: false, planli: 'Faz 4',
      not: 'Depo (STK-01) ve kasa (FIN-05) Faz 4 ile bu sihirbaza bağlanacak; bu sürümde denetlenmez.',
      rota: null },
  ];
}

/**
 * Kapanış engelleri. `zorunlu: true` olan hiçbir satır kalmadan şantiye
 * "kapalı" durumuna geçemez (§7 son satır).
 */
export function kapanisEngelleri(santiyeId) {
  const acikGorev = say(
    `SELECT COUNT(*) AS n FROM gorev WHERE santiye_id = ? AND durum NOT IN ('tamamlandi','iptal')`, santiyeId);
  const acikBildirim = say(
    `SELECT COUNT(*) AS n FROM saha_bildirimi WHERE santiye_id = ? AND durum NOT IN ('kapali','iptal')`, santiyeId);
  const acikNcr = say(
    `SELECT COUNT(*) AS n FROM ncr WHERE santiye_id = ? AND durum NOT IN ('kapali','iptal')`, santiyeId);
  const acikPunch = say(
    `SELECT COUNT(*) AS n FROM punch WHERE santiye_id = ? AND durum NOT IN ('kapali','iptal')`, santiyeId);
  const acikRfi = say(
    `SELECT COUNT(*) AS n FROM rfi WHERE santiye_id = ? AND durum NOT IN ('kapali','iptal')`, santiyeId);
  const acikIsg = say(
    `SELECT COUNT(*) AS n FROM isg_olayi WHERE santiye_id = ? AND durum NOT IN ('kapali','iptal')`, santiyeId);
  const sahada = say(
    `SELECT COUNT(*) AS n FROM ziyaretci WHERE santiye_id = ? AND durum = 'sahada'`, santiyeId);
  const acikDonem = say(
    `SELECT COUNT(*) AS n FROM puantaj_donemi WHERE santiye_id = ? AND durum <> 'kapali' AND durum <> 'iptal'`, santiyeId);
  const acikAtama = say(
    `SELECT COUNT(*) AS n FROM personel_atama WHERE santiye_id = ? AND durum = 'aktif'`, santiyeId);
  const suresiDolanBelge = say(
    `SELECT COUNT(*) AS n FROM santiye_belgesi WHERE santiye_id = ? AND durum = 'yenilemede'`, santiyeId);
  const kesin = tek(
    `SELECT * FROM kabul WHERE santiye_id = ? AND tur = 'kesin' ORDER BY olusturuldu DESC LIMIT 1`, santiyeId);
  const bekleyenKabul = sorgu(
    `SELECT * FROM kabul WHERE santiye_id = ? AND durum NOT IN ('onaylandi','iptal','reddedildi')`, santiyeId);

  return [
    { ad: 'Açık görev ve iş emri', adet: acikGorev, zorunlu: true, rota: '/gorevler' },
    { ad: 'Açık saha bildirimi', adet: acikBildirim, zorunlu: true, rota: '/saha-bildirimleri' },
    { ad: 'Açık uygunsuzluk (NCR)', adet: acikNcr, zorunlu: true, rota: '/kalite/ncr' },
    { ad: 'Açık punch maddesi', adet: acikPunch, zorunlu: true, rota: '/kalite/punch' },
    { ad: 'Yanıtlanmamış RFI', adet: acikRfi, zorunlu: true, rota: '/teknik/rfi' },
    { ad: 'Açık İSG olayı', adet: acikIsg, zorunlu: true, rota: '/isg/olaylar' },
    { ad: 'Sahada bulunan ziyaretçi', adet: sahada, zorunlu: true, rota: `/santiyeler/${santiyeId}/ziyaretciler` },
    { ad: 'Kapanmamış puantaj dönemi', adet: acikDonem, zorunlu: true, rota: '/puantaj/donem-kapanis' },
    { ad: 'Aktif personel ataması', adet: acikAtama, zorunlu: true, rota: '/personel-atamalari' },
    { ad: 'Yenilenmeyi bekleyen resmi belge', adet: suresiDolanBelge, zorunlu: true,
      rota: `/santiyeler/${santiyeId}/izinler` },
    { ad: 'Karara bağlanmamış kabul dosyası', adet: bekleyenKabul.length, zorunlu: true,
      rota: `/santiyeler/${santiyeId}/gecici-kabul` },
    { ad: 'Onaylı kesin kabul', adet: kesin && kesin.durum === 'onaylandi' ? 0 : 1, zorunlu: true,
      not: kesin ? `Kesin kabul "${kesin.durum}" durumunda.` : 'Kesin kabul dosyası açılmadı.',
      rota: `/santiyeler/${santiyeId}/kesin-kabul` },
    /* Faz 4: bu üç kalem gerçek sorguya bağlanana kadar "denetlenmedi" sayılır. */
    { ad: 'Stok bakiyesi sıfırlandı', adet: null, zorunlu: true, planli: 'Faz 4',
      not: 'Depo/stok modülü (STK-01..10) Faz 4. Bağlanana kadar bu engel KALDIRILAMAZ.',
      rota: null },
    { ad: 'Varlık ve zimmet iadesi', adet: null, zorunlu: true, planli: 'Faz 4',
      not: 'Varlık modülü (AST-01..10) Faz 4. Bağlanana kadar bu engel KALDIRILAMAZ.', rota: null },
    { ad: 'Kasa bakiyesi ve mutabakat', adet: null, zorunlu: true, planli: 'Faz 4',
      not: 'Kasa (FIN-05/06) Faz 4. Bağlanana kadar bu engel KALDIRILAMAZ.', rota: null },
  ];
}

/** Kalan zorunlu engeller — boşsa şantiye kapatılabilir. */
export const acikKapanisEngelleri = (santiyeId) => kapanisEngelleri(santiyeId)
  .filter((e) => e.zorunlu && (e.planli || (e.adet ?? 0) > 0));

/** Geçiş motorunun kullandığı tek satırlık engel metni (null = engel yok). */
export function kapanisEngeliMetni(santiyeId) {
  const kalan = acikKapanisEngelleri(santiyeId);
  if (!kalan.length) return null;
  const ozet = kalan.slice(0, 4)
    .map((e) => (e.planli ? `${e.ad} (${e.planli})` : `${e.ad}: ${e.adet}`)).join(' · ');
  return `Kapanış engeli var (${kalan.length} kalem): ${ozet}${kalan.length > 4 ? ' …' : ''}.`;
}

/** Açılış için kalan zorunlu engeller. */
export const acikAcilisEngelleri = (santiyeId) => acilisKontrolleri(santiyeId)
  .filter((k) => k.zorunlu && k.engel);

export function acilisEngeliMetni(santiyeId) {
  const kalan = acikAcilisEngelleri(santiyeId);
  if (!kalan.length) return null;
  return `Açılış kontrolü tamamlanmadı: ${kalan.map((k) => k.ad).join(', ')}.`;
}
