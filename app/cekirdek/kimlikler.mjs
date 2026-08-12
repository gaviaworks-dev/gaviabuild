/* ============================================================================
   KİMLİK ÜRETİMİ — ön ekli, zaman-sıralı, tahmin edilemez kimlikler
   ----------------------------------------------------------------------------
   Otomatik artan tamsayı kullanılmaz: tenant sayısını, kayıt hacmini ve komşu
   kayıtları sızdırır (URL'de id++ ile başka tenant'ın kaydını denemek).
   Biçim: `<onek>_<26 karakter Crockford base32 ULID>` — zaman sıralı, çakışmasız.
   ========================================================================== */
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { simdi } from './zaman.mjs';

const ALFABE = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (I,L,O,U yok)

function base32(sayi, uzunluk) {
  let s = '';
  for (let i = uzunluk - 1; i >= 0; i--) { s = ALFABE[Number(sayi % 32n)] + s; sayi /= 32n; }
  return s;
}

/** ULID: 48 bit zaman + 80 bit rastgele. */
export function ulid(ms = simdi()) {
  const zaman = base32(BigInt(ms), 10);
  const bayt = randomBytes(10);
  let rast = 0n;
  for (const b of bayt) rast = (rast << 8n) | BigInt(b);
  return zaman + base32(rast, 16);
}

/** Modül ön ekleri — kayıt türü kimlikten okunabilir olmalı (log/denetim kolaylığı). */
export const ONEK = {
  tenant: 'ten', kullanici: 'usr', oturum: 'ses', rol: 'rol', davet: 'dvt',
  proje: 'prj', santiye: 'ste', gorev: 'tsk', plan: 'pln', aktivite: 'akt', wbs: 'wbs',
  isg: 'hse', kalite: 'qlt', dokuman: 'doc', dosya: 'fil',
  itp: 'itp', muayene: 'muy', submittal: 'sbm', rfi: 'rfi', test: 'tst', punch: 'pnc',
  cizim: 'drw', transmittal: 'trm', evrak: 'evr',
  atama: 'atm', donem: 'dnm', yetkinlik: 'ytk',
  personel: 'per', puantaj: 'pnt', izin: 'izn', avans: 'avs',
  talep: 'req', siparis: 'ord', tedarikci: 'sup', teklif: 'rfq',
  depo: 'whs', stok: 'stk', hareket: 'mov', malkabul: 'grn',
  sozlesme: 'cnt', hakedis: 'hkd', metraj: 'mtr', degisiklik: 'chg',
  butce: 'bdg', kasa: 'csh', banka: 'bnk', cari: 'car', fatura: 'inv', odeme: 'pay',
  kart: 'crd', saglayici: 'prv', hesap: 'acc', parti: 'bat', satir: 'itm',
  urun: 'prd', politika: 'pol', mutabakat: 'rec', entegrasyon: 'itg',
  musteri: 'cus', firsat: 'opp', portal: 'ptl', senkron: 'syn', arsiv: 'arc',
  sablon: 'tpl', adim: 'stp',
  varlik: 'ast', zimmet: 'asg', arac: 'veh',
  onay: 'apr', gorevAdim: 'stp', bildirim: 'ntf', audit: 'aud', olay: 'evt',
  rapor: 'rpt', idempotency: 'idm',
};

export function kimlik(tur, ms = simdi()) {
  const onek = ONEK[tur];
  if (!onek) throw new Error(`Bilinmeyen kimlik türü: ${tur}`);
  return `${onek}_${ulid(ms)}`;
}

/** Kimliğin beklenen türde olduğunu doğrular (yanlış tür = yanlış tablo sorgusu). */
export function kimlikTuru(id) { return String(id).split('_')[0]; }
export function kimlikDogrula(id, tur) {
  return typeof id === 'string' && id.startsWith(ONEK[tur] + '_') && id.length === ONEK[tur].length + 27;
}

/** Oturum/davet/sıfırlama tokenleri — 256 bit, URL güvenli. */
export function token(bayt = 32) {
  return randomBytes(bayt).toString('base64url');
}

/** Token veritabanında AÇIK saklanmaz; SHA-256 özeti saklanır. */
export const tokenOzeti = (t) => createHash('sha256').update(t, 'utf8').digest('hex');

/** Zamanlama saldırısına kapalı karşılaştırma. */
export function guvenliEsit(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

export const istekKimligi = () => 'req_' + randomUUID();
