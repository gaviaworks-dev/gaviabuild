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
import { depoBakiyeleri, miktarMetni } from '../stok/defter.mjs';
import { bakiye as finansBakiye } from '../finans/defter.mjs';

const say = (sql, ...p) => Number(tek(sql, ...p)?.n ?? 0);

/**
 * Faz 4 kapanışında (K-049) stok, varlık/zimmet ve kasa kontrolleri gerçek
 * sorguya bağlandı; "planlı" yer tutucu satır KALMADI. Bakiyeler defter
 * modüllerinden okunur (kural 7) — burada ikinci bir toplama yazılmaz.
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
  const depo = say(
    `SELECT COUNT(*) AS n FROM depo WHERE santiye_id = ? AND durum = 'aktif'`, santiyeId);
  const kasa = say(
    `SELECT COUNT(*) AS n FROM kasa WHERE santiye_id = ? AND durum = 'aktif'`, santiyeId);

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
    { ad: 'Depo kurulumu', engel: depo === 0, zorunlu: false,
      not: depo ? `${depo} aktif depo tanımlı.`
        : 'Şantiyeye bağlı aktif depo yok; malzeme girişi kaydedilemez (uyarı).',
      rota: '/depolar' },
    { ad: 'Kasa kurulumu', engel: kasa === 0, zorunlu: false,
      not: kasa ? `${kasa} aktif kasa tanımlı.`
        : 'Şantiye kasası yok; saha harcaması kasa defterine yazılamaz (uyarı).',
      rota: '/kasalar' },
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

  /* --- K-049: stok, varlık/zimmet ve kasa artık gerçek sorguya bağlı ------
     Bakiyeler defter modüllerinden okunur; burada ikinci bir toplama yok. */
  const tenantId = tek('SELECT tenant_id FROM santiye WHERE id = ?', santiyeId)?.tenant_id;
  const depolar = sorgu(`SELECT id, kod, ad FROM depo WHERE santiye_id = ?`, santiyeId);
  const stokKalan = tenantId
    ? depolar.flatMap((d) => depoBakiyeleri(tenantId, { depoId: d.id }))
      .filter((r) => Number(r.bakiye_binde) !== 0)
    : [];
  const acikRezervasyon = say(
    `SELECT COUNT(*) AS n FROM stok_rezervasyonu r JOIN depo d ON d.id = r.depo_id
      WHERE d.santiye_id = ? AND r.durum = 'aktif'`, santiyeId);
  const yoldakiTransfer = say(
    `SELECT COUNT(*) AS n FROM stok_transferi t
      WHERE t.durum = 'yolda'
        AND (t.kaynak_depo_id IN (SELECT id FROM depo WHERE santiye_id = ?)
          OR t.hedef_depo_id IN (SELECT id FROM depo WHERE santiye_id = ?))`, santiyeId, santiyeId);

  const acikZimmet = say(
    `SELECT COUNT(*) AS n FROM zimmet z JOIN varlik v ON v.id = z.varlik_id
      WHERE z.durum = 'zimmetli' AND (z.santiye_id = ? OR v.santiye_id = ?)`, santiyeId, santiyeId);
  const sahadakiVarlik = say(
    `SELECT COUNT(*) AS n FROM varlik WHERE santiye_id = ? AND durum NOT IN ('satildi','hurda')`, santiyeId);
  const acikBakim = say(
    `SELECT COUNT(*) AS n FROM is_emri e JOIN varlik v ON v.id = e.varlik_id
      WHERE v.santiye_id = ? AND e.durum NOT IN ('tamamlandi','iptal')`, santiyeId);

  const kasalar = sorgu(`SELECT id, kod, ad, durum FROM kasa WHERE santiye_id = ?`, santiyeId);
  const bakiyeliKasa = kasalar.map((k) => ({ ...k, bakiye_minor: finansBakiye('kasa', k.id) }))
    .filter((k) => k.bakiye_minor !== 0);
  const acikKasa = kasalar.filter((k) => k.durum === 'aktif');

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
    /* K-049 — Faz 4 defterlerine bağlı gerçek engeller. */
    { ad: 'Depo stok bakiyesi', adet: stokKalan.length, zorunlu: true,
      not: stokKalan.length
        ? stokKalan.slice(0, 3).map((r) => `${r.depo_kod}/${r.kart_kod}: ${miktarMetni(r.bakiye_binde)} ${r.birim}`)
          .join(' · ') + (stokKalan.length > 3 ? ' …' : '')
        : depolar.length ? `${depolar.length} depo boşaltıldı.` : 'Şantiyeye bağlı depo yok.',
      rota: '/stok/hareketler' },
    { ad: 'Açık stok rezervasyonu', adet: acikRezervasyon, zorunlu: true, rota: '/stok/rezervasyonlar' },
    { ad: 'Yolda bekleyen depo transferi', adet: yoldakiTransfer, zorunlu: true, rota: '/stok/transferler' },
    { ad: 'İade edilmemiş zimmet', adet: acikZimmet, zorunlu: true, rota: '/zimmetler' },
    { ad: 'Şantiyede duran varlık', adet: sahadakiVarlik, zorunlu: true,
      not: sahadakiVarlik ? 'Varlıklar başka şantiyeye devredilmeli veya merkeze çekilmeli.'
        : 'Şantiyede varlık kalmadı.',
      rota: '/varliklar' },
    { ad: 'Kapanmamış bakım iş emri', adet: acikBakim, zorunlu: true, rota: '/bakim-is-emirleri' },
    { ad: 'Sıfırlanmamış kasa bakiyesi', adet: bakiyeliKasa.length, zorunlu: true,
      not: bakiyeliKasa.length
        ? bakiyeliKasa.map((k) => `${k.kod}: ${k.bakiye_minor} minor`).join(' · ')
        : kasalar.length ? `${kasalar.length} kasa sıfır bakiyeli.` : 'Şantiyeye bağlı kasa yok.',
      rota: '/kasa-hareketleri' },
    { ad: 'Kapatılmamış kasa', adet: acikKasa.length, zorunlu: true,
      not: acikKasa.length ? acikKasa.map((k) => k.kod).join(', ') : 'Tüm kasalar kapalı/pasif.',
      rota: '/kasalar' },
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
