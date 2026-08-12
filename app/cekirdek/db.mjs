/* ============================================================================
   VERİ KATMANI — node:sqlite, WAL, foreign_keys ON  (KARARLAR.md K-003)
   ----------------------------------------------------------------------------
   Repository katmanının altındaki tek kapı. Doğrudan SQL yalnız burada ve modül
   depo dosyalarında yazılır; sayfa/route kodu SQL görmez.

   Zorunlu davranışlar:
     · Her yazma bir transaction içinde olur (yarım kalan yan etki yok).
     · Optimistic concurrency: UPDATE ... WHERE surum = ? — sürüm tutmazsa 409.
     · Para tutarları INTEGER minor + TEXT birim olarak İKİ sütunda saklanır.
     · Zaman INTEGER epoch ms (UTC).
   ========================================================================== */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SurumCakismasi, Cakisma } from './hata.mjs';
import { GOCLER } from './goc.mjs';

let db = null;

export function ac(yol = process.env.GB_DB || 'veri/gaviabuild.sqlite') {
  if (db) return db;
  if (yol !== ':memory:') mkdirSync(dirname(yol), { recursive: true });
  db = new DatabaseSync(yol);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA synchronous = NORMAL');
  gocleriUygula(db);
  return db;
}

export function baglanti() {
  if (!db) throw new Error('Veritabanı açılmadı — önce ac() çağrılmalı.');
  return db;
}

export function kapat() { if (db) { db.close(); db = null; } }

/* --- Göç (migration) yönetimi ------------------------------------------- */
function gocleriUygula(d) {
  d.exec(`CREATE TABLE IF NOT EXISTS _goc (
    ad TEXT PRIMARY KEY, uygulandi INTEGER NOT NULL, ozet TEXT NOT NULL)`);
  const uygulanan = new Set(d.prepare('SELECT ad FROM _goc').all().map((r) => r.ad));
  for (const g of GOCLER) {
    if (uygulanan.has(g.ad)) continue;
    d.exec('BEGIN');
    try {
      d.exec(g.sql);
      d.prepare('INSERT INTO _goc (ad, uygulandi, ozet) VALUES (?, ?, ?)')
        .run(g.ad, Date.now(), g.sql.length);
      d.exec('COMMIT');
    } catch (e) {
      d.exec('ROLLBACK');
      throw new Error(`Göç başarısız (${g.ad}): ${e.message}`);
    }
  }
}

/* --- Sorgu yardımcıları -------------------------------------------------- */
/**
 * K-082: `undefined` bağlanmaz, `null`'a çevrilir.
 * node:sqlite `undefined` parametresinde TypeError atar; bu da formdan EKSİK
 * gelen bir kimlik alanını 422/404 yerine 500 SUNUCU HATASI yapıyordu.
 * `null` bağlandığında sorgu boş döner ve çağıran kendi doğrulama hatasını
 * üretir — kullanıcı gerçek hata kodunu görür (kural 3).
 */
const bag = (p) => p.map((x) => (x === undefined ? null : x));

export const sorgu = (sql, ...p) => baglanti().prepare(sql).all(...bag(p));
export const tek   = (sql, ...p) => baglanti().prepare(sql).get(...bag(p)) ?? null;
export const calistir = (sql, ...p) => baglanti().prepare(sql).run(...bag(p));
export const sayi  = (sql, ...p) => Number(Object.values(baglanti().prepare(sql).get(...bag(p)) ?? { n: 0 })[0] ?? 0);

/* --- Transaction --------------------------------------------------------- */
let derinlik = 0;
/** Tüm yazmalar bunun içinden geçer; iç içe çağrılarda SAVEPOINT kullanılır. */
export function islem(fn) {
  const d = baglanti();
  const ic = derinlik > 0;
  const nokta = `sp_${derinlik}`;
  d.exec(ic ? `SAVEPOINT ${nokta}` : 'BEGIN IMMEDIATE');
  derinlik++;
  try {
    const sonuc = fn();
    d.exec(ic ? `RELEASE ${nokta}` : 'COMMIT');
    return sonuc;
  } catch (e) {
    d.exec(ic ? `ROLLBACK TO ${nokta}` : 'ROLLBACK');
    throw e;
  } finally {
    derinlik--;
  }
}

/** Bir yazmanın transaction içinde olduğunu zorlar (değişmez kural 8). */
export function islemIcindeMi() { return derinlik > 0; }

/* --- Optimistic concurrency --------------------------------------------- */
/**
 * Sürüm kontrollü güncelleme. `beklenenSurum` tutmazsa 409 üretir — onaylı
 * kaydın sessizce ezilmesini (lost update) engeller.
 */
export function surumluGuncelle(tablo, id, beklenenSurum, alanlar, ek = {}) {
  const set = Object.keys(alanlar).map((k) => `${k} = ?`).join(', ');
  const sonuc = calistir(
    `UPDATE ${tablo} SET ${set}, surum = surum + 1, guncelleyen = ?, guncellendi = ?
      WHERE id = ? AND surum = ?`,
    ...Object.values(alanlar), ek.guncelleyen ?? null, ek.guncellendi ?? Date.now(), id, beklenenSurum,
  );
  if (sonuc.changes === 0) {
    const mevcut = tek(`SELECT surum FROM ${tablo} WHERE id = ?`, id);
    if (!mevcut) throw Cakisma('Kayıt bulunamadı veya silinmiş.');
    throw SurumCakismasi(`Kayıt sürümü ${mevcut.surum}, sizin sürümünüz ${beklenenSurum}.`);
  }
  return beklenenSurum + 1;
}
