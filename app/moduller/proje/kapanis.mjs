/* ============================================================================
   PROJE AKTİVASYON VE KAPANIŞ ENGELLERİ — PRJ-05, PRJ-09
   ----------------------------------------------------------------------------
   Şantiye karşılığıyla (moduller/santiye/kapanis.mjs) aynı ilke: engel listesi
   TEK yerde hesaplanır, hem sihirbaz ekranı hem geçiş motoru onu kullanır.
   Proje kapanışı, altındaki ŞANTİYELERİN kapanışını kapsar: bir şantiye açıkken
   proje kapanamaz — aksi halde şantiye kapanış engelleri atlanmış olurdu.
   ========================================================================== */
import { tek, sorgu } from '../../cekirdek/db.mjs';
import { simdi } from '../../cekirdek/zaman.mjs';
import { bakiye as finansBakiye } from '../finans/defter.mjs';

const say = (sql, ...p) => Number(tek(sql, ...p)?.n ?? 0);

export function aktivasyonKontrolleri(projeId) {
  const p = tek('SELECT * FROM proje WHERE id = ?', projeId);
  if (!p) return [];
  const santiye = say('SELECT COUNT(*) AS n FROM santiye WHERE proje_id = ?', projeId);
  const org = say(`SELECT COUNT(*) AS n FROM proje_organizasyonu WHERE proje_id = ? AND durum = 'aktif'`, projeId);
  const paydas = say('SELECT COUNT(*) AS n FROM proje_paydasi WHERE proje_id = ?', projeId);
  const program = say('SELECT COUNT(*) AS n FROM is_programi WHERE proje_id = ?', projeId);
  const risk = say('SELECT COUNT(*) AS n FROM proje_riski WHERE proje_id = ?', projeId);

  return [
    { ad: 'Proje künyesi', engel: !(p.ad && p.baslangic && p.sorumlu_id), zorunlu: true,
      not: 'Ad, başlangıç tarihi ve proje sorumlusu girilmeli.',
      rota: `/projeler/${projeId}/duzenle` },
    { ad: 'Proje organizasyonu', engel: org === 0, zorunlu: true,
      not: org ? `${org} aktif görev tanımı var.` : 'En az bir organizasyon satırı tanımlanmalı.',
      rota: `/projeler/${projeId}/organizasyon` },
    { ad: 'Paydaş kaydı', engel: paydas === 0, zorunlu: true,
      not: paydas ? `${paydas} paydaş kayıtlı.` : 'İşveren/müşavir gibi en az bir paydaş kayıtlı olmalı.',
      rota: `/projeler/${projeId}/paydaslar` },
    { ad: 'Şantiye açıldı', engel: santiye === 0, zorunlu: true,
      not: santiye ? `${santiye} şantiye bağlı.` : 'Projeye en az bir şantiye bağlanmalı.',
      rota: '/santiyeler' },
    { ad: 'İş programı', engel: program === 0, zorunlu: false,
      not: program ? `${program} program tanımlı.` : 'Program olmadan ilerleme ölçülemez (uyarı).',
      rota: '/is-programlari' },
    { ad: 'Risk kaydı', engel: risk === 0, zorunlu: false,
      not: risk ? `${risk} risk kayıtlı.` : 'Risk kaydı boş (uyarı).',
      rota: `/projeler/${projeId}/riskler` },
  ];
}

export const acikAktivasyonEngelleri = (projeId) =>
  aktivasyonKontrolleri(projeId).filter((k) => k.zorunlu && k.engel);

export function aktivasyonEngeliMetni(projeId) {
  const kalan = acikAktivasyonEngelleri(projeId);
  return kalan.length ? `Aktivasyon kontrolü tamamlanmadı: ${kalan.map((k) => k.ad).join(', ')}.` : null;
}

export function projeKapanisEngelleri(projeId) {
  const acikSantiye = sorgu(
    `SELECT kod, ad, durum FROM santiye WHERE proje_id = ? AND durum NOT IN ('kapali','arsiv')`, projeId);
  const acikGorev = say(
    `SELECT COUNT(*) AS n FROM gorev WHERE proje_id = ? AND durum NOT IN ('tamamlandi','iptal')`, projeId);
  const acikNcr = say(
    `SELECT COUNT(*) AS n FROM ncr WHERE proje_id = ? AND durum NOT IN ('kapali','iptal')`, projeId);
  const acikRfi = say(
    `SELECT COUNT(*) AS n FROM rfi WHERE proje_id = ? AND durum NOT IN ('kapali','iptal')`, projeId);
  const acikRisk = say(
    `SELECT COUNT(*) AS n FROM proje_riski WHERE proje_id = ? AND durum <> 'kapali'`, projeId);
  const acikProgram = say(
    `SELECT COUNT(*) AS n FROM is_programi WHERE proje_id = ? AND durum IN ('onaya_gonderildi','incelemede')`, projeId);
  const dogrulanmamisIlerleme = say(
    `SELECT COUNT(*) AS n FROM ilerleme WHERE proje_id = ? AND durum IN ('taslak','onaya_gonderildi','incelemede')`,
    projeId);
  const kesinKabulsuz = say(
    `SELECT COUNT(*) AS n FROM santiye s WHERE s.proje_id = ?
       AND NOT EXISTS (SELECT 1 FROM kabul k WHERE k.santiye_id = s.id AND k.tur = 'kesin' AND k.durum = 'onaylandi')`,
    projeId);

  /* --- K-049: sözleşme/hakediş ve bütçe/maliyet kapanışı gerçek sorguda ---
     Karar bekleyen belge = kapanmamış taahhüt. Tutarlar hakedis.mjs ve
     finans/defter.mjs'ten okunur; burada ikinci bir hesap yapılmaz. */
  const KARAR_BEKLIYOR = `('taslak','onaya_gonderildi','incelemede','revizyon_istendi')`;
  const acikHakedis = say(
    `SELECT COUNT(*) AS n FROM hakedis h JOIN sozlesme s ON s.id = h.sozlesme_id
      WHERE s.proje_id = ? AND h.durum IN ${KARAR_BEKLIYOR}`, projeId);
  const acikZeyil = say(
    `SELECT COUNT(*) AS n FROM zeyil z JOIN sozlesme s ON s.id = z.sozlesme_id
      WHERE s.proje_id = ? AND z.durum IN ${KARAR_BEKLIYOR}`, projeId);
  const acikDegisiklik = say(
    `SELECT COUNT(*) AS n FROM degisiklik WHERE proje_id = ? AND durum IN ${KARAR_BEKLIYOR}`, projeId);
  const acikTeminat = sorgu(
    `SELECT t.kod, t.tur, t.tutar_minor FROM teminat t JOIN sozlesme s ON s.id = t.sozlesme_id
      WHERE s.proje_id = ? AND t.durum = 'aktif'`, projeId);
  const acikMetraj = say(
    `SELECT COUNT(*) AS n FROM metraj m JOIN sozlesme s ON s.id = m.sozlesme_id
      WHERE s.proje_id = ? AND m.durum IN ${KARAR_BEKLIYOR}`, projeId);

  const acikButce = say(
    `SELECT COUNT(*) AS n FROM butce WHERE proje_id = ? AND durum IN ${KARAR_BEKLIYOR}`, projeId);
  const acikFatura = say(
    `SELECT COUNT(*) AS n FROM fatura f JOIN hakedis h ON h.id = f.hakedis_id
       JOIN sozlesme s ON s.id = h.sozlesme_id
      WHERE s.proje_id = ? AND f.durum NOT IN ('odendi','iptal','reddedildi')`, projeId);
  const acikOdeme = say(
    `SELECT COUNT(*) AS n FROM odeme o JOIN hakedis h ON h.id = o.hakedis_id
       JOIN sozlesme s ON s.id = h.sozlesme_id
      WHERE s.proje_id = ? AND o.durum NOT IN ('odendi','iptal','reddedildi')`, projeId);
  const projeKasalari = sorgu(`SELECT id, kod, durum FROM kasa WHERE proje_id = ?`, projeId);
  const bakiyeliKasa = projeKasalari.map((k) => ({ ...k, bakiye_minor: finansBakiye('kasa', k.id) }))
    .filter((k) => k.bakiye_minor !== 0);

  return [
    { ad: 'Kapanmamış şantiye', adet: acikSantiye.length, zorunlu: true,
      not: acikSantiye.length ? acikSantiye.map((s) => `${s.kod} (${s.durum})`).join(', ')
        : 'Tüm şantiyeler kapalı.',
      rota: '/santiyeler' },
    { ad: 'Kesin kabulü olmayan şantiye', adet: kesinKabulsuz, zorunlu: true, rota: '/santiyeler' },
    { ad: 'Açık görev', adet: acikGorev, zorunlu: true, rota: '/gorevler' },
    { ad: 'Açık uygunsuzluk (NCR)', adet: acikNcr, zorunlu: true, rota: '/kalite/ncr' },
    { ad: 'Yanıtlanmamış RFI', adet: acikRfi, zorunlu: true, rota: '/teknik/rfi' },
    { ad: 'Kapanmamış risk', adet: acikRisk, zorunlu: true, rota: `/projeler/${projeId}/riskler` },
    { ad: 'Onayda bekleyen iş programı', adet: acikProgram, zorunlu: true, rota: '/is-programlari' },
    { ad: 'Doğrulanmamış ilerleme kaydı', adet: dogrulanmamisIlerleme, zorunlu: true, rota: '/is-programlari' },
    /* K-049 — sözleşme/hakediş ve bütçe/maliyet kapanışı gerçek sorguya bağlı. */
    { ad: 'Karara bağlanmamış hakediş', adet: acikHakedis, zorunlu: true, rota: '/hakedisler' },
    { ad: 'Karara bağlanmamış metraj', adet: acikMetraj, zorunlu: true, rota: '/metraj' },
    { ad: 'Karara bağlanmamış zeyil', adet: acikZeyil, zorunlu: true, rota: '/sozlesmeler' },
    { ad: 'Karara bağlanmamış değişiklik talebi', adet: acikDegisiklik, zorunlu: true,
      rota: '/degisiklikler' },
    { ad: 'İade edilmemiş teminat', adet: acikTeminat.length, zorunlu: true,
      not: acikTeminat.length ? acikTeminat.map((t) => `${t.kod} (${t.tur})`).join(', ')
        : 'Aktif teminat kalmadı.',
      rota: '/teminatlar' },
    { ad: 'Onayda bekleyen bütçe', adet: acikButce, zorunlu: true, rota: '/butceler' },
    { ad: 'Kapanmamış fatura', adet: acikFatura, zorunlu: true, rota: '/faturalar' },
    { ad: 'Kapanmamış ödeme talebi', adet: acikOdeme, zorunlu: true, rota: '/odemeler' },
    { ad: 'Sıfırlanmamış proje kasası', adet: bakiyeliKasa.length, zorunlu: true,
      not: bakiyeliKasa.length ? bakiyeliKasa.map((k) => `${k.kod}: ${k.bakiye_minor} minor`).join(' · ')
        : projeKasalari.length ? `${projeKasalari.length} kasa sıfır bakiyeli.` : 'Projeye bağlı kasa yok.',
      rota: '/kasa-hareketleri' },
  ];
}

export const acikProjeKapanisEngelleri = (projeId) => projeKapanisEngelleri(projeId)
  .filter((e) => e.zorunlu && (e.planli || (e.adet ?? 0) > 0));

export function projeKapanisEngeliMetni(projeId) {
  const kalan = acikProjeKapanisEngelleri(projeId);
  if (!kalan.length) return null;
  const ozet = kalan.slice(0, 4)
    .map((e) => (e.planli ? `${e.ad} (${e.planli})` : `${e.ad}: ${e.adet}`)).join(' · ');
  return `Proje kapanış engeli var (${kalan.length} kalem): ${ozet}${kalan.length > 4 ? ' …' : ''}.`;
}
