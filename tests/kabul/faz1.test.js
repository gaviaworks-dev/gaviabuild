/* ============================================================================
   KABUL TESTLERİ — Faz 1  (docs/REVIZYON.md §11)
   AUTH-01 · SEC-01 · UI-01 · UI-02 · AUD-01 + platform güvenlik testleri
   ========================================================================== */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { uygulamaBaslat } from '../yardimci.mjs';
import { sorgu, tek, calistir, islem } from '../../app/cekirdek/db.mjs';
import { kimlik } from '../../app/cekirdek/kimlikler.mjs';
import { simdi } from '../../app/cekirdek/zaman.mjs';
import * as audit from '../../app/cekirdek/audit.mjs';
import { manifest } from '../../app/cekirdek/yapilandirma.mjs';

let S;
before(async () => { S = await uygulamaBaslat(); });
after(async () => { await S.kapat(); });

/* ========================================================================== */
describe('AUTH-01 — üretim girişinde rol seçimi yoktur', () => {
  test('giriş sayfası dokümandaki iki panelli yapıyı ve sabit başlığı taşır', async () => {
    const { durum, govde } = await S.istemci().get('/giris');
    assert.equal(durum, 200);
    assert.match(govde, /Şirketten şantiyeye tüm operasyon tek platformda/);
    assert.match(govde, /gr-split/, 'iki panelli düzen yok');
    for (const fayda of ['Proje ve şantiye kontrolü', 'İş programı ve saha ilerlemesi',
      'Personel, puantaj ve İSG', 'Satın alma, stok ve varlık', 'Sözleşme, hakediş, finans ve raporlama']) {
      assert.ok(govde.includes(fayda), `fayda maddesi eksik: ${fayda}`);
    }
    assert.match(govde, /Şifremi unuttum/);
    assert.match(govde, /SSO/);
  });

  test('kullanıcı rolünü query parametresi ile seçemez', async () => {
    const c = S.istemci();
    await c.giris('calisan@yapitas.demo');
    const y = await c.get('/ayarlar/kullanicilar?role=firma_sahibi&rol=sistem_yoneticisi');
    assert.equal(y.durum, 403, 'query parametresi rol yükseltmesine izin veriyor');
  });

  test('rol istemci çerezinden değil sunucudaki rol atamasından gelir', async () => {
    const c = S.istemci();
    await c.giris('calisan@yapitas.demo');
    c.cerezler.set('rol', 'firma_sahibi');
    c.cerezler.set('gb_rol', 'firma_sahibi');
    const y = await c.get('/ayarlar/kullanicilar');
    assert.equal(y.durum, 403);
  });

  test('demo rol seçimi bayrağa bağlıdır ve gerçek oturum açar', async () => {
    const c = S.istemci();
    const giris = await c.get('/giris');
    assert.match(giris.govde, /DEMO/, 'demo bayrağı açıkken DEMO etiketi görünmeli');
    const y = await c.post('/giris', { eposta: 'ik@yapitas.demo', parola: 'Demo.Parola.2026', demoPersona: '1' });
    assert.equal(y.durum, 200);
    /* Persona seçimi rolü İSTEMCİDEN taşımaz: rol veritabanındaki atamadan gelir. */
    const rol = tek(`SELECT r.kod FROM kullanici k
                       JOIN kullanici_rol kr ON kr.kullanici_id = k.id
                       JOIN rol r ON r.id = kr.rol_id WHERE k.eposta = 'ik@yapitas.demo'`);
    assert.equal(rol.kod, 'ik_sorumlusu');
  });

  test('oturum çerezi HttpOnly, SameSite ve sunucudan verilir', async () => {
    const y = await fetch(S.taban + '/giris', {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ eposta: 'sahip@yapitas.demo', parola: 'Demo.Parola.2026' }).toString(),
    });
    const cerezler = y.headers.getSetCookie();
    const oturum = cerezler.find((c) => c.startsWith('gb_oturum='));
    assert.ok(oturum, 'oturum çerezi sunucudan gelmiyor');
    assert.match(oturum, /HttpOnly/);
    assert.match(oturum, /SameSite=Lax/);
  });

  test('hatalı giriş kullanıcı var/yok bilgisini sızdırmaz', async () => {
    const c = S.istemci();
    const yokKullanici = await c.post('/giris', { eposta: 'hicyok@yapitas.demo', parola: 'Yanlis.Parola.1' });
    const varKullanici = await c.post('/giris', { eposta: 'sahip@yapitas.demo', parola: 'Yanlis.Parola.1' });
    const mesaj = (g) => (g.match(/gv-m-err[\s\S]{0,400}/) || [''])[0].replace(/\s+/g, ' ');
    assert.equal(yokKullanici.durum, varKullanici.durum);
    assert.equal(mesaj(yokKullanici.govde), mesaj(varKullanici.govde),
      'kayıtlı ve kayıtsız e-posta için farklı hata mesajı dönüyor');
  });

  test('parola sıfırlama isteği de var/yok bilgisini sızdırmaz', async () => {
    const c = S.istemci();
    const a = await c.post('/sifre-unuttum', { eposta: 'hicyok@yapitas.demo' });
    const b = await c.post('/sifre-unuttum', { eposta: 'sahip@yapitas.demo' });
    assert.equal(a.durum, b.durum);
    assert.match(a.govde, /Bu e-posta adresi kayıtlıysa/);
    assert.match(b.govde, /Bu e-posta adresi kayıtlıysa/);
  });
});

/* ========================================================================== */
describe('SEC-01 — tenant izolasyonu', () => {
  test('kullanıcı URL değiştirerek başka tenant kaydını göremez', () => {
    /* İkinci tenant ve ona ait bir kayıt oluştur. */
    const yabanciTenant = kimlik('tenant');
    const yabanciKullanici = kimlik('kullanici');
    const yabanciNot = kimlik('gorev').replace('tsk', 'not');
    islem(() => {
      calistir('INSERT INTO tenant (id, kod, ad, olusturuldu) VALUES (?,?,?,?)',
        yabanciTenant, 'rakip', 'Rakip İnşaat A.Ş.', simdi());
      calistir(`INSERT INTO kullanici (id, tenant_id, eposta, ad_soyad, durum, kurulum_tamam, olusturuldu)
                VALUES (?,?,?,?,'aktif',1,?)`, yabanciKullanici, yabanciTenant, 'x@rakip.demo', 'Rakip Kullanıcı', simdi());
      calistir(`INSERT INTO kisisel_not (id, tenant_id, kullanici_id, baslik, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?)`, yabanciNot, yabanciTenant, yabanciKullanici, 'Gizli rakip notu', yabanciKullanici, simdi());
      audit.yaz({ tenantId: yabanciTenant, nesne: 'tenant', eylem: 'test_kurulumu' });
    });

    /* Yapıtaş kullanıcısının listesinde rakip tenant kaydı GÖRÜNMEMELİ. */
    const yapitas = tek(`SELECT id FROM tenant WHERE kod = 'yapitas'`);
    const gorunen = sorgu('SELECT id FROM kisisel_not WHERE tenant_id = ?', yapitas.id).map((r) => r.id);
    assert.ok(!gorunen.includes(yabanciNot), 'başka tenant kaydı listeye sızdı');
  });

  test('kapsam kontrolü başka tenant kaydını reddeder', async () => {
    const { kapsamZorunlu } = await import('../../app/moduller/kimlik/yetki.mjs');
    const yapitas = tek(`SELECT * FROM tenant WHERE kod = 'yapitas'`);
    const rakip = tek(`SELECT * FROM tenant WHERE kod = 'rakip'`);
    const sahte = { kullanici: { id: 'usr_x' }, tenant: yapitas, yetkiler: { kurallar: [], kapsamlar: [], tenantGeneli: true } };
    assert.throws(() => kapsamZorunlu(sahte, 'kisisel_not', { tenant_id: rakip.id }),
      (e) => e.kod === 'KAPSAM_DISI');
  });

  test('yetkisiz kullanıcı listeye eriştiğinde 403 alır, veri sızmaz', async () => {
    const c = S.istemci();
    await c.giris('calisan@yapitas.demo');
    const y = await c.get('/ayarlar/denetim-izi');
    assert.equal(y.durum, 403);
    assert.ok(!y.govde.includes('denetim_izi'), 'hata sayfası veri sızdırıyor');
  });
});

/* ========================================================================== */
describe('UI-01 — tüm listeler ortak sayfalama standardını kullanır', () => {
  const listeRotalari = ['/notlarim', '/bildirimler', '/ayarlar/kullanicilar', '/ayarlar/denetim-izi', '/profilim/islemler'];

  test('sayfalama, kayıt aralığı ve sayfa boyutu her listede var', async () => {
    const c = S.istemci();
    await c.giris('sahip@yapitas.demo');
    for (const rota of listeRotalari) {
      const y = await c.get(rota);
      assert.equal(y.durum, 200, `${rota} açılmıyor`);
      assert.match(y.govde, /class="gv-pager"/, `${rota}: sayfalama bileşeni yok`);
      assert.match(y.govde, /kayıt/, `${rota}: kayıt aralığı yok`);
      assert.match(y.govde, /Sayfa boyutu/, `${rota}: sayfa boyutu seçimi yok`);
    }
  });

  test('filtre ve sayfa durumu URL sorgusunda saklanır', async () => {
    const c = S.istemci();
    await c.giris('sahip@yapitas.demo');
    const y = await c.get('/ayarlar/kullanicilar?durum=aktif&sayfa=1&boyut=50');
    assert.equal(y.durum, 200);
    assert.match(y.govde, /boyut=50/, 'sayfa boyutu URL bağlantılarına yansımıyor');
    assert.match(y.govde, /durum=aktif/, 'aktif filtre URL bağlantılarında korunmuyor');
    assert.match(y.govde, /gv-achip/, 'aktif filtre etiketi gösterilmiyor');
  });

  test('sayfa boyutu yalnız izinli değerleri kabul eder (sunucu zorlaması)', async () => {
    const c = S.istemci();
    await c.giris('sahip@yapitas.demo');
    const y = await c.get('/ayarlar/kullanicilar?boyut=100000');
    assert.equal(y.durum, 200);
    assert.ok(!y.govde.includes('boyut=100000'), 'istemci sayfa boyutunu sınırsız belirleyebiliyor');
  });

  test('toplam sayı sunucu sonucudur (istemci dizi uzunluğu değil)', async () => {
    const c = S.istemci();
    await c.giris('sahip@yapitas.demo');
    const y = await c.get('/ayarlar/kullanicilar?boyut=25');
    const toplam = Number(tek(`SELECT COUNT(*) AS n FROM kullanici k JOIN tenant t ON t.id = k.tenant_id
                                WHERE t.kod = 'yapitas'`).n);
    assert.match(y.govde, new RegExp(`/ ${toplam} kayıt`), `sayfalama toplamı ${toplam} göstermiyor`);
  });
});

/* ========================================================================== */
describe('UI-02 — form kalıbı ve hata özeti', () => {
  test('yeni form ana alan + sağ özet kalıbındadır', async () => {
    const c = S.istemci();
    await c.giris('sahip@yapitas.demo');
    const y = await c.get('/notlarim/yeni');
    assert.equal(y.durum, 200);
    assert.match(y.govde, /class="form-grid"/, "ana alan + yan panel düzeni yok");
    assert.match(y.govde, /gform-main/);
    assert.match(y.govde, /gform-side/, 'sağ bağlam/özet paneli yok');
    assert.match(y.govde, /form-foot/, 'ortak alt işlem çubuğu yok');
  });

  test('doğrulama hatasında alan bazlı hata özeti döner', async () => {
    const c = S.istemci();
    await c.giris('sahip@yapitas.demo');
    const y = await c.csrfIle('/notlarim/yeni', { baslik: '' });
    assert.equal(y.durum, 422, 'boş zorunlu alan 422 döndürmeli');
    assert.match(y.govde, /hataOzeti/, 'hata özeti bloğu yok');
    assert.match(y.govde, /Başlık girin/, 'alan bazlı hata mesajı yok');
    assert.match(y.govde, /DOGRULAMA_HATASI/, 'gerçek hata kodu gösterilmiyor');
  });

  test('form kullanıcıya durum veya onaycı seçtirmez (değişmez kural 5)', async () => {
    const c = S.istemci();
    await c.giris('sahip@yapitas.demo');
    const y = await c.get('/notlarim/yeni');
    assert.ok(!/name="durum"/.test(y.govde), 'form kullanıcıya durum seçtiriyor');
    assert.ok(!/name="onayci"/.test(y.govde), 'form kullanıcıya onaycı seçtiriyor');
  });

  test('CSRF tokeni olmadan yazma reddedilir', async () => {
    const c = S.istemci();
    await c.giris('sahip@yapitas.demo');
    const y = await c.post('/notlarim/yeni', { baslik: 'CSRF olmadan' });
    assert.equal(y.durum, 403);
    assert.equal(tek(`SELECT COUNT(*) AS n FROM kisisel_not WHERE baslik = 'CSRF olmadan'`).n, 0);
  });

  test('aynı idempotency anahtarı ikinci kez kayıt üretmez', async () => {
    const c = S.istemci();
    await c.giris('sahip@yapitas.demo');
    const anahtar = 'test-idem-' + simdi();
    const govde = { baslik: 'Idempotent not', _idempotency: anahtar };
    const a = await c.csrfIle('/notlarim/yeni', govde);
    const b = await c.csrfIle('/notlarim/yeni', govde);
    assert.equal(a.durum, 200);
    assert.equal(b.durum, 200);
    const adet = Number(tek(`SELECT COUNT(*) AS n FROM kisisel_not WHERE baslik = 'Idempotent not'`).n);
    assert.equal(adet, 1, 'çift gönderim iki kayıt üretti');
  });
});

/* ========================================================================== */
describe('AUD-01 — denetim izi değiştirilemez', () => {
  test('kritik işlem denetim kaydı üretir', async () => {
    const oncesi = Number(tek('SELECT COUNT(*) AS n FROM denetim_izi').n);
    const c = S.istemci();
    await c.giris('sahip@yapitas.demo');
    await c.csrfIle('/notlarim/yeni', { baslik: 'Audit testi notu' });
    const sonrasi = Number(tek('SELECT COUNT(*) AS n FROM denetim_izi').n);
    assert.ok(sonrasi > oncesi, 'yazma işlemi denetim kaydı üretmedi');
    const kayit = tek(`SELECT * FROM denetim_izi WHERE nesne = 'kisisel_not' AND eylem = 'olustur' ORDER BY sira DESC LIMIT 1`);
    assert.ok(kayit.kullanici_id && kayit.zaman && kayit.istek_id, 'kim/ne zaman/hangi istek bilgisi eksik');
  });

  test('denetim kaydı güncellenemez ve silinemez', () => {
    assert.throws(() => calistir(`UPDATE denetim_izi SET eylem = 'degistirildi' WHERE sira = 1`), /degistirilemez/);
    assert.throws(() => calistir('DELETE FROM denetim_izi WHERE sira = 1'), /silinemez/);
  });

  test('zincir doğrulaması sağlam sonuç verir', () => {
    const sonuc = audit.zinciriDogrula();
    assert.equal(sonuc.saglam, true, `zincir kırık: ${JSON.stringify(sonuc)}`);
    assert.ok(sonuc.satir > 0);
  });

  test('denetim kaydı transaction dışında yazılamaz', () => {
    assert.throws(() => audit.yaz({ nesne: 'test', eylem: 'transactionsiz' }), /transaction/);
  });
});

/* ========================================================================== */
describe('Platform — manifest, rota ve yetki tutarlılığı', () => {
  test('rail ve menü yalnız yetkili ve UYGULANMIŞ ekranları gösterir', async () => {
    const c = S.istemci();
    await c.giris('calisan@yapitas.demo');
    const y = await c.get('/panel');
    assert.equal(y.durum, 200);
    assert.ok(!y.govde.includes('/ayarlar/kullanicilar'), 'yetkisiz ekran menüde görünüyor');
  });

  test('menüdeki her bağlantı gerçekten açılabiliyor (WIP bağlantısı yok)', async () => {
    const c = S.istemci();
    await c.giris('sahip@yapitas.demo');
    const y = await c.get('/panel');
    const baglantilar = [...y.govde.matchAll(/class="gv-mlink[^"]*" href="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(baglantilar.length > 0, 'menüde hiç bağlantı yok');
    for (const b of baglantilar) {
      const s = await c.get(b);
      assert.ok(s.durum < 400, `menü bağlantısı ${b} → ${s.durum}`);
    }
  });

  test('sayfa başlığı eyebrow + H1 + tek satır açıklama yapısındadır', async () => {
    const c = S.istemci();
    await c.giris('sahip@yapitas.demo');
    const y = await c.get('/notlarim');
    assert.match(y.govde, /class="gv-page-head"/);
    assert.match(y.govde, /class="ph-eyebrow"/);
    assert.match(y.govde, /<h1>/);
    assert.match(y.govde, /class="ph-sub"/);
  });

  test('breadcrumb tıklanabilir ve bölüm bağlamını taşır', async () => {
    const c = S.istemci();
    await c.giris('sahip@yapitas.demo');
    const y = await c.get('/notlarim/yeni');
    assert.match(y.govde, /class="gv-crumbs"/);
    assert.match(y.govde, /gvc-sec/);
  });

  test('uygulanmamış manifest rotası sahte ekran değil dürüst 404 döndürür', async () => {
    const c = S.istemci();
    await c.giris('sahip@yapitas.demo');
    /* Henüz uygulanmamış bir faz rotası (Faz 5 kartlar) — uygulandıkça bu kod güncellenir. */
    const y = await c.get('/kartlar');
    assert.equal(y.durum, 404);
    assert.ok(!/WIP|yapım aşamasında|çok yakında/i.test(y.govde), 'WIP metni kullanılmış');
  });

  test('istemci tarafı iş kuralı yok: uygulama JS dosyası localStorage ile iş kaydı tutmuyor', async () => {
    const y = await S.istemci().get('/statik/js/uygulama.js');
    assert.equal(y.durum, 200);
    const yazmalar = [...y.govde.matchAll(/localStorage\.setItem\(([^,]+)/g)].map((m) => m[1].trim());
    assert.deepEqual(yazmalar, ['TERCIH'], 'localStorage yalnız arayüz tercihi için kullanılmalı');
  });

  test('statik dosya servisinde yol geçişi (path traversal) engellenir', async () => {
    const y = await S.istemci().get('/varliklar/../../../etc/passwd');
    assert.ok(y.durum >= 400, 'dizin dışına çıkılabiliyor');
  });

  test('güvenlik başlıkları her yanıtta var', async () => {
    const y = await fetch(S.taban + '/giris');
    assert.equal(y.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(y.headers.get('x-frame-options'), 'DENY');
    assert.ok(y.headers.get('x-istek-id'), 'istek kimliği başlığı yok');
  });

  test('sistem rollerinin yetkileri manifestten türetilmiştir', () => {
    const ekranKodlari = new Set(manifest().ekranlar.map((e) => e.kod));
    const yetkiler = sorgu('SELECT DISTINCT yetki FROM rol_yetki').map((r) => r.yetki);
    assert.ok(yetkiler.length > 0);
    for (const y of yetkiler) {
      const kod = y.split(':')[0];
      assert.ok(ekranKodlari.has(kod), `yetki manifestte olmayan ekrana işaret ediyor: ${y}`);
    }
  });

  test('çalışan rolü onay kutusu ve yönetici paneli yetkisi almaz (§6.7)', () => {
    const yetkiler = sorgu(`SELECT ry.yetki FROM rol_yetki ry JOIN rol r ON r.id = ry.rol_id
                             WHERE r.kod = 'calisan'`).map((x) => x.yetki);
    assert.ok(!yetkiler.some((y) => y.startsWith('GLB-04')), 'çalışan onay kutusuna erişebiliyor');
    assert.ok(!yetkiler.some((y) => y.startsWith('GLB-03')), 'çalışan yönetici paneline erişebiliyor');
  });

  test('sistem yöneticisi onay kararı veremez (görevler ayrılığı)', () => {
    const yetkiler = sorgu(`SELECT ry.yetki FROM rol_yetki ry JOIN rol r ON r.id = ry.rol_id
                             WHERE r.kod = 'sistem_yoneticisi'`).map((x) => x.yetki);
    assert.ok(!yetkiler.some((y) => y.endsWith(':karar_ver')), 'sistem yöneticisi onay kararı verebiliyor');
  });

  test('denetçi salt okunurdur', () => {
    const yetkiler = sorgu(`SELECT ry.yetki FROM rol_yetki ry JOIN rol r ON r.id = ry.rol_id
                             WHERE r.kod = 'denetci'`).map((x) => x.yetki);
    const yazma = yetkiler.filter((y) => /:(olustur|guncelle|karar_ver|tamamla|kapat)$/.test(y));
    assert.deepEqual(yazma, [], `denetçide yazma yetkisi var: ${yazma.slice(0, 5).join(', ')}`);
  });
});

/* ========================================================================== */
describe('Kural 6 ve 8 — sürümlü güncelleme ve kayıp güncelleme koruması', () => {
  test('SET-02 formu kayıt sürümünü taşır', async () => {
    const c = S.istemci();
    await c.giris('sahip@yapitas.demo');
    const y = await c.get('/ayarlar/sirket');
    assert.equal(y.durum, 200);
    assert.match(y.govde, /name="surum"/, 'form kayıt sürümünü taşımıyor');
  });

  test('eski sürümle gönderim 409 ile reddedilir (lost update yok)', async () => {
    const c = S.istemci();
    await c.giris('sahip@yapitas.demo');
    const once = tek(`SELECT surum, ad FROM tenant WHERE kod = 'yapitas'`);
    const ilk = await c.csrfIle('/ayarlar/sirket',
      { ad: 'Yapıtaş İnşaat A.Ş.', paraBirimi: 'TRY', saatDilimi: 'Europe/Istanbul', surum: String(once.surum) });
    assert.equal(ilk.durum, 200);
    /* Aynı (artık eski) sürümle ikinci gönderim */
    const ikinci = await c.csrfIle('/ayarlar/sirket',
      { ad: 'Ezilmiş Ad', paraBirimi: 'TRY', saatDilimi: 'Europe/Istanbul', surum: String(once.surum) });
    assert.equal(ikinci.durum, 409, 'eski sürümle güncelleme kabul edildi');
    assert.notEqual(tek(`SELECT ad FROM tenant WHERE kod = 'yapitas'`).ad, 'Ezilmiş Ad');
  });

  test('geçersiz para birimi ve saat dilimi sunucuda reddedilir', async () => {
    const c = S.istemci();
    await c.giris('sahip@yapitas.demo');
    const s = tek(`SELECT surum FROM tenant WHERE kod = 'yapitas'`).surum;
    const a = await c.csrfIle('/ayarlar/sirket', { ad: 'X', paraBirimi: 'XXX', saatDilimi: 'Europe/Istanbul', surum: String(s) });
    assert.equal(a.durum, 422);
    const b = await c.csrfIle('/ayarlar/sirket', { ad: 'X', paraBirimi: 'TRY', saatDilimi: 'Ay/Kraterler', surum: String(s) });
    assert.equal(b.durum, 422);
  });

  test('para tipi kayan nokta kullanmaz ve birim karışımını reddeder', async () => {
    const { Para } = await import('../../app/cekirdek/para.mjs');
    assert.equal(Para.ayristir('0.1').topla(Para.ayristir('0.2')).bicim(), '₺0,30');
    assert.equal(Para.ayristir('1.234,56').minor, 123456n);
    assert.throws(() => Para.ayristir('10', 'TRY').topla(Para.ayristir('10', 'USD')), /Farklı para birimleri/);
  });
});
