/* ============================================================================
   ÇİZİM · TRANSMITTAL · EVRAK · DAĞITIM MATRİSİ · ARŞİV — DOC-04..10
   ----------------------------------------------------------------------------
   Çizim revizyonu satırı DEĞİŞTİRİLEMEZ (tetikleyici); "son geçerli sürüm"
   çizim kaydındaki aktif_revizyon alanından okunur. Transmittal teslim kanıtı
   olmadan "teslim edildi" olamaz.
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, tarihSaat, gunAnahtari, gunBaslangici } from '../cekirdek/zaman.mjs';
import { DogrulamaHatasi, GecisIzinsiz, Cakisma } from '../cekirdek/hata.mjs';
import { kayitModulu, kullaniciSecenekleri, projeSecenekleri, sayac, gecmisKarti } from './kayit-modulu.mjs';
import {
  ekranNesnesi, kullaniciAdi, ciz, B, h, ham, sayi, csrfAlani, csrfZorunlu,
  yetkiZorunlu, yetkiVar, sorgu, tek, calistir, islem, surumluGuncelle, audit, sonrakiKod,
} from './ortak.mjs';

const DISIPLINLER = [
  { deger: 'mimari', etiket: 'Mimari' }, { deger: 'statik', etiket: 'Statik' },
  { deger: 'mekanik', etiket: 'Mekanik' }, { deger: 'elektrik', etiket: 'Elektrik' },
  { deger: 'altyapi', etiket: 'Altyapı' }, { deger: 'peyzaj', etiket: 'Peyzaj' },
];
const AMAC_KODLARI = [
  { deger: 'bilgi', etiket: 'Bilgi için' }, { deger: 'onay', etiket: 'Onay için' },
  { deger: 'uygulama', etiket: 'Uygulama için' }, { deger: 'kayit', etiket: 'Kayıt için' },
  { deger: 'ihale', etiket: 'İhale için' },
];

export function kur(y, ekranRota) {
  /* ================= DOC-04 / DOC-05 Çizimler ========================== */
  kayitModulu(y, ekranRota, {
    nesne: 'cizim', tablo: 'cizim', kodNesnesi: 'cizim', kimlikTuru: 'cizim',
    rota: '/cizimler', formRotasi: '/cizimler?yeni=1',
    baslik: 'Çizim', listeKodu: 'DOC-04', detayKodu: null, gecisNesnesi: 'proje',
    aramaAlanlari: ['ad', 'kod'], aramaYer: 'Çizim adı veya numarası…',
    filtreler: [
      { ad: 'disiplin', etiket: 'Disiplin', secenekler: DISIPLINLER },
      { ad: 'paket', etiket: 'Paket', secenekler: (ctx) => sorgu(
        'SELECT DISTINCT paket FROM cizim WHERE tenant_id = ? AND paket IS NOT NULL ORDER BY paket', ctx.tenant.id)
        .map((r) => ({ deger: r.paket, etiket: r.paket })) },
    ],
    alanlar: [],
    sirala: 'disiplin, kod',
    kpi: (ctx, toplam) => [
      { etiket: 'Çizim', deger: sayi(sayac(ctx.tenant.id, 'cizim')), ikon: 'fa-compass-drafting' },
      { etiket: 'Toplam revizyon', deger: sayi(Number(tek(
        `SELECT COUNT(*) AS n FROM cizim_revizyonu r JOIN cizim c ON c.id = r.cizim_id WHERE c.tenant_id = ?`,
        ctx.tenant.id)?.n ?? 0)), ikon: 'fa-layer-group' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ],
    listeSutunlari: () => [
      { ad: 'kod', etiket: 'Çizim no' },
      { ad: 'ad', etiket: 'Çizim', govde: (r) => h`<a href="/cizimler/${r.id}"><b>${r.ad}</b></a>` },
      { ad: 'disiplin', etiket: 'Disiplin' },
      { ad: 'paket', etiket: 'Paket', govde: (r) => r.paket || '—' },
      /* "Son geçerli sürüm" tek kaynaktan okunur; liste kendi hesabını yapmaz. */
      { ad: 'aktif_revizyon', etiket: 'Son geçerli revizyon', hizala: 'sag',
        govde: (r) => (r.aktif_revizyon ? B.isaret(`rev. ${r.aktif_revizyon}`, 'ok') : B.isaret('revizyon yok', 'warn')) },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
    ],
    bosDurum: { baslik: 'Çizim yok', aciklama: 'Disiplin, paket ve revizyon takibi burada yapılır.', ikon: 'fa-compass-drafting' },
    altForm: (ctx) => B.form({
      rota: '/cizimler', csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Yeni çizim', alanlar: h`
        ${B.alan({ ad: 'cizimNo', etiket: 'Çizim numarası', zorunlu: true, ipucu: 'Örn. MP-201' })}
        ${B.alan({ ad: 'ad', etiket: 'Çizim adı', zorunlu: true, genis: true })}
        ${B.alan({ ad: 'disiplin', etiket: 'Disiplin', zorunlu: true, secenekler: DISIPLINLER })}
        ${B.alan({ ad: 'paket', etiket: 'Paket' })}
        ${B.alan({ ad: 'olcek', etiket: 'Ölçek' })}
        ${B.alan({ ad: 'projeId', etiket: 'Proje', secenekler: [{ deger: '', etiket: 'Seçin…' }, ...projeSecenekleri(ctx)] })}` }],
      eylemler: B.btn('Çizimi ekle', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
    }),
  });

  y.post('/cizimler', (ctx, govde) => {
    yetkiZorunlu(ctx, 'DOC-04:olustur');
    csrfZorunlu(ctx, govde);
    const cizimNo = String(govde.cizimNo || '').trim();
    const ad = String(govde.ad || '').trim();
    const hatalar = {};
    if (!cizimNo) hatalar.cizimNo = ['Çizim numarası girin.'];
    if (!ad) hatalar.ad = ['Çizim adı girin.'];
    if (!govde.disiplin) hatalar.disiplin = ['Disiplin seçin.'];
    if (Object.keys(hatalar).length) throw DogrulamaHatasi('Çizim bilgileri eksik.', { alanlar: hatalar });
    if (tek('SELECT id FROM cizim WHERE tenant_id = ? AND kod = ?', ctx.tenant.id, cizimNo)) {
      throw Cakisma(`${cizimNo} numaralı çizim zaten kayıtlı.`);
    }
    islem(() => {
      const id = kimlik('cizim');
      calistir(`INSERT INTO cizim (id, tenant_id, proje_id, kod, ad, disiplin, paket, olcek, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?, 'aktif', ?,?)`,
        id, ctx.tenant.id, govde.projeId || null, cizimNo, ad, govde.disiplin,
        govde.paket || null, govde.olcek || null, ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'cizim', nesneId: id, eylem: 'olustur', sonraki: { kod: cizimNo, ad, disiplin: govde.disiplin } });
    });
    return yonlendir(ctx, '/cizimler?olusturuldu=1');
  }, { ekran: ekranNesnesi('DOC-04') });

  ekranRota(y, 'DOC-05', {
    get: (ctx, _g, params) => cizimDetayi(ctx, params.id),
    post: (ctx, govde, params) => {
      yetkiZorunlu(ctx, 'DOC-05:guncelle');
      csrfZorunlu(ctx, govde);
      const c = tek('SELECT * FROM cizim WHERE id = ? AND tenant_id = ?', params.id, ctx.tenant.id);
      if (!c) throw DogrulamaHatasi('Çizim bulunamadı.');
      const rev = String(govde.revizyon || '').trim().toUpperCase();
      if (!rev) throw DogrulamaHatasi('Revizyon kodu zorunludur.', { alanlar: { revizyon: ['Örn. A, B, 0, 1'] } });
      if (tek('SELECT id FROM cizim_revizyonu WHERE cizim_id = ? AND revizyon = ?', c.id, rev)) {
        throw Cakisma(`${rev} revizyonu bu çizimde zaten var; revizyon satırı değiştirilemez (§5.4).`);
      }
      islem(() => {
        calistir(`INSERT INTO cizim_revizyonu (id, cizim_id, revizyon, aciklama, yayin_tarihi, yayinlayan)
                  VALUES (?,?,?,?,?,?)`,
          kimlik('cizim'), c.id, rev, govde.aciklama || null,
          govde.yayinTarihi ? gunBaslangici(govde.yayinTarihi) : simdi(), ctx.kullanici.id);
        surumluGuncelle('cizim', c.id, Number(govde.surum), { aktif_revizyon: rev },
          { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
        audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
          nesne: 'cizim', nesneId: c.id, eylem: 'revizyon_yayinlandi', gerekce: govde.aciklama,
          onceki: { aktifRevizyon: c.aktif_revizyon }, sonraki: { aktifRevizyon: rev } });
      });
      return yonlendir(ctx, `/cizimler/${c.id}?islem=${encodeURIComponent(`Revizyon ${rev} yayınlandı`)}`);
    },
  });

  /* ================= DOC-06 / DOC-07 Transmittal ======================= */
  kayitModulu(y, ekranRota, {
    nesne: 'transmittal', tablo: 'transmittal', kodNesnesi: 'transmittal', kimlikTuru: 'transmittal',
    rota: '/transmittal', formRotasi: '/transmittal/yeni',
    baslik: 'Transmittal', yeniEtiketi: 'Yeni transmittal',
    listeKodu: 'DOC-06', formKodu: 'DOC-07', detayKodu: null, gecisNesnesi: 'proje',
    baslikAlani: 'alici',
    aramaAlanlari: ['alici', 'kod'], aramaYer: 'Alıcı veya transmittal no…',
    filtreler: [
      { ad: 'amac_kodu', etiket: 'Amaç', secenekler: AMAC_KODLARI },
      { ad: 'durum', etiket: 'Durum', secenekler: [
        { deger: 'taslak', etiket: 'Taslak' }, { deger: 'gonderildi', etiket: 'Gönderildi' },
        { deger: 'teslim_edildi', etiket: 'Teslim edildi' }] },
    ],
    alanlar: [
      { ad: 'alici', sutun: 'alici', etiket: 'Alıcı', tur: 'metin', zorunlu: true, genis: true },
      { ad: 'aliciEposta', sutun: 'alici_eposta', etiket: 'Alıcı e-posta', tur: 'metin' },
      { ad: 'amacKodu', sutun: 'amac_kodu', etiket: 'Amaç kodu', tur: 'secim', zorunlu: true,
        varsayilan: 'bilgi', secenekler: AMAC_KODLARI },
      { ad: 'projeId', sutun: 'proje_id', etiket: 'Proje', tur: 'secim', secenekler: projeSecenekleri },
      { ad: 'aciklama', sutun: 'aciklama', etiket: 'Açıklama', tur: 'uzunMetin', genis: true },
    ],
    sabitAlanlar: () => ({ durum: 'taslak' }),
    kpi: (ctx, toplam) => [
      { etiket: 'Taslak', deger: sayi(sayac(ctx.tenant.id, 'transmittal', `durum = 'taslak'`)), ikon: 'fa-pen' },
      { etiket: 'Gönderildi', deger: sayi(sayac(ctx.tenant.id, 'transmittal', `durum = 'gonderildi'`)), ikon: 'fa-paper-plane' },
      { etiket: 'Teslim kanıtlı', deger: sayi(sayac(ctx.tenant.id, 'transmittal', `durum = 'teslim_edildi'`)), ikon: 'fa-circle-check' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ],
    listeSutunlari: () => [
      { ad: 'kod', etiket: 'Transmittal no' },
      { ad: 'alici', etiket: 'Alıcı', govde: (r) => h`<a href="/transmittal/${r.id}"><b>${r.alici}</b></a>` },
      { ad: 'amac_kodu', etiket: 'Amaç', govde: (r) => AMAC_KODLARI.find((a) => a.deger === r.amac_kodu)?.etiket || r.amac_kodu },
      { ad: 'kalem', etiket: 'Belge', hizala: 'sag',
        govde: (r) => sayi(Number(tek('SELECT COUNT(*) AS n FROM transmittal_kalemi WHERE transmittal_id = ?', r.id)?.n ?? 0)) },
      { ad: 'gonderim_tarihi', etiket: 'Gönderim', govde: (r) => (r.gonderim_tarihi ? tarih(r.gonderim_tarihi) : '—') },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum === 'teslim_edildi' ? 'tamamlandi'
        : r.durum === 'gonderildi' ? 'beklemede' : 'taslak',
        { taslak: 'Taslak', gonderildi: 'Gönderildi', teslim_edildi: 'Teslim edildi', iptal: 'İptal' }[r.durum]) },
    ],
    bosDurum: { baslik: 'Transmittal yok', aciklama: 'Gönderi paketleri ve teslim kanıtı burada izlenir.', ikon: 'fa-paper-plane' },
    detayBilgileri: (r) => [
      { etiket: 'Alıcı e-posta', deger: r.alici_eposta || '—' },
      { etiket: 'Amaç kodu', deger: AMAC_KODLARI.find((a) => a.deger === r.amac_kodu)?.etiket || r.amac_kodu },
      { etiket: 'Gönderim', deger: r.gonderim_tarihi ? tarih(r.gonderim_tarihi) : '—' },
      { etiket: 'Teslim kanıtı', deger: r.teslim_kaniti || '—' },
      { etiket: 'Teslim tarihi', deger: r.teslim_tarihi ? tarih(r.teslim_tarihi) : '—' },
      { etiket: 'Açıklama', deger: r.aciklama || '—' },
    ],
  });

  y.get('/transmittal/:id', (ctx, _g, params) => transmittalDetayi(ctx, params.id), { ekran: ekranNesnesi('DOC-06') });
  y.post('/transmittal/:id', (ctx, govde, params) => {
    yetkiZorunlu(ctx, 'DOC-06:guncelle');
    csrfZorunlu(ctx, govde);
    const t = tek('SELECT * FROM transmittal WHERE id = ? AND tenant_id = ?', params.id, ctx.tenant.id);
    if (!t) throw DogrulamaHatasi('Transmittal bulunamadı.');

    if (govde._eylem === 'kalem') {
      if (t.durum !== 'taslak') throw GecisIzinsiz('Gönderilmiş transmittale belge eklenemez.');
      if (!govde.dokumanId && !govde.cizimId) {
        throw DogrulamaHatasi('Belge veya çizim seçin.', { alanlar: { dokumanId: ['Bir kayıt seçin.'] } });
      }
      islem(() => {
        const cizim = govde.cizimId ? tek('SELECT * FROM cizim WHERE id = ?', govde.cizimId) : null;
        const dok = govde.dokumanId ? tek('SELECT * FROM dokuman WHERE id = ?', govde.dokumanId) : null;
        calistir(`INSERT INTO transmittal_kalemi (id, transmittal_id, dokuman_id, cizim_id, surum_no, revizyon, aciklama)
                  VALUES (?,?,?,?,?,?,?)`,
          kimlik('transmittal'), t.id, dok?.id || null, cizim?.id || null,
          dok?.aktif_surum || null, cizim?.aktif_revizyon || null, govde.kalemAciklamasi || null);
        audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
          nesne: 'transmittal', nesneId: t.id, eylem: 'kalem_eklendi',
          sonraki: { dokuman: dok?.kod, cizim: cizim?.kod, revizyon: cizim?.aktif_revizyon } });
      });
      return yonlendir(ctx, `/transmittal/${t.id}?islem=${encodeURIComponent('Belge eklendi')}`);
    }

    if (govde._eylem === 'gonder') {
      if (t.durum !== 'taslak') throw GecisIzinsiz('Yalnız taslak transmittal gönderilebilir.');
      const kalemSayisi = Number(tek('SELECT COUNT(*) AS n FROM transmittal_kalemi WHERE transmittal_id = ?', t.id).n);
      if (!kalemSayisi) throw GecisIzinsiz('Boş transmittal gönderilemez; en az bir belge ekleyin.');
      islem(() => {
        surumluGuncelle('transmittal', t.id, Number(govde.surum),
          { durum: 'gonderildi', gonderim_tarihi: simdi() },
          { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
        audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
          nesne: 'transmittal', nesneId: t.id, eylem: 'gonderildi', sonraki: { kalem: kalemSayisi } });
      });
      return yonlendir(ctx, `/transmittal/${t.id}?islem=${encodeURIComponent('Transmittal gönderildi')}`);
    }

    if (govde._eylem === 'teslim') {
      if (t.durum !== 'gonderildi') throw GecisIzinsiz('Yalnız gönderilmiş transmittal teslim edilmiş sayılabilir.');
      /* Teslim KANIT ister: "teslim edildi" beyanı tek başına yeterli değil. */
      if (!String(govde.teslimKaniti || '').trim()) {
        throw DogrulamaHatasi('Teslim kanıtı zorunludur.',
          { alanlar: { teslimKaniti: ['İmzalı tutanak, e-posta referansı veya kargo takip no girin.'] } });
      }
      islem(() => {
        surumluGuncelle('transmittal', t.id, Number(govde.surum),
          { durum: 'teslim_edildi', teslim_kaniti: govde.teslimKaniti.trim(), teslim_tarihi: simdi() },
          { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
        audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
          nesne: 'transmittal', nesneId: t.id, eylem: 'teslim_edildi', gerekce: govde.teslimKaniti });
      });
      return yonlendir(ctx, `/transmittal/${t.id}?islem=${encodeURIComponent('Teslim kanıtı kaydedildi')}`);
    }
    throw DogrulamaHatasi('Tanımsız işlem.');
  }, { ekran: ekranNesnesi('DOC-06') });

  /* ================= DOC-08 Gelen-giden evrak ========================== */
  kayitModulu(y, ekranRota, {
    nesne: 'evrak', tablo: 'evrak', kodNesnesi: 'evrak', kimlikTuru: 'evrak',
    rota: '/evrak', formRotasi: '/evrak?yeni=1',
    baslik: 'Evrak', listeKodu: 'DOC-08', detayKodu: null, gecisNesnesi: 'sahaBildirimi',
    baslikAlani: 'konu',
    aramaAlanlari: ['konu', 'kod', 'karsi_taraf'], aramaYer: 'Konu, evrak no veya karşı taraf…',
    filtreler: [
      { ad: 'yon', etiket: 'Yön', secenekler: [{ deger: 'gelen', etiket: 'Gelen' }, { deger: 'giden', etiket: 'Giden' }] },
      { ad: 'durum', etiket: 'Durum', secenekler: ['yeni', 'atandi', 'islemde', 'kapali'].map((d) => ({ deger: d, etiket: d })) },
    ],
    alanlar: [],
    sirala: 'evrak_tarihi DESC',
    kpi: (ctx, toplam) => [
      { etiket: 'Gelen', deger: sayi(sayac(ctx.tenant.id, 'evrak', `yon = 'gelen'`)), ikon: 'fa-inbox' },
      { etiket: 'Giden', deger: sayi(sayac(ctx.tenant.id, 'evrak', `yon = 'giden'`)), ikon: 'fa-paper-plane' },
      { etiket: 'Süresi geçen', deger: sayi(sayac(ctx.tenant.id, 'evrak',
        `son_tarih < ? AND durum NOT IN ('kapali','iptal')`, simdi())), ikon: 'fa-hourglass-end', ton: 'danger' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
    ],
    listeSutunlari: () => [
      { ad: 'kod', etiket: 'Evrak no' },
      { ad: 'konu', etiket: 'Konu', govde: (r) => h`<a href="/evrak/${r.id}"><b>${r.konu}</b></a>${
        r.karsi_taraf ? h`<br><span class="muted">${r.karsi_taraf}</span>` : ''}` },
      { ad: 'yon', etiket: 'Yön', govde: (r) => B.isaret(r.yon === 'gelen' ? 'gelen' : 'giden', r.yon === 'gelen' ? 'info' : 'nötr') },
      { ad: 'evrak_tarihi', etiket: 'Tarih', govde: (r) => tarih(r.evrak_tarihi) },
      { ad: 'son_tarih', etiket: 'Son tarih', govde: (r) => !r.son_tarih ? '—'
        : r.son_tarih < simdi() && !['kapali', 'iptal'].includes(r.durum) ? B.isaret(tarih(r.son_tarih), 'danger') : tarih(r.son_tarih) },
      { ad: 'havale_id', etiket: 'Havale', govde: (r) => kullaniciAdi(r.havale_id) },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
    ],
    bosDurum: { baslik: 'Evrak kaydı yok', aciklama: 'Gelen ve giden yazışmalar, havale ve son tarihle izlenir.', ikon: 'fa-envelope-open-text' },
    altForm: (ctx) => B.form({
      rota: '/evrak', csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Evrak kaydı', alanlar: h`
        ${B.alan({ ad: 'konu', etiket: 'Konu', zorunlu: true, genis: true })}
        ${B.alan({ ad: 'yon', etiket: 'Yön', zorunlu: true, deger: 'gelen',
          secenekler: [{ deger: 'gelen', etiket: 'Gelen' }, { deger: 'giden', etiket: 'Giden' }] })}
        ${B.alan({ ad: 'karsiTaraf', etiket: 'Karşı taraf' })}
        ${B.alan({ ad: 'evrakTarihi', etiket: 'Evrak tarihi', tur: 'date', deger: gunAnahtari(simdi()), zorunlu: true })}
        ${B.alan({ ad: 'havaleId', etiket: 'Havale edilen', secenekler: [{ deger: '', etiket: 'Seçin…' }, ...kullaniciSecenekleri(ctx)] })}
        ${B.alan({ ad: 'sonTarih', etiket: 'Cevap son tarihi', tur: 'date' })}
        ${B.alan({ ad: 'projeId', etiket: 'Proje', secenekler: [{ deger: '', etiket: 'Seçin…' }, ...projeSecenekleri(ctx)] })}` }],
      eylemler: B.btn('Evrakı kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
    }),
  });

  y.post('/evrak', (ctx, govde) => {
    yetkiZorunlu(ctx, 'DOC-08:olustur');
    csrfZorunlu(ctx, govde);
    const konu = String(govde.konu || '').trim();
    if (!konu) throw DogrulamaHatasi('Konu zorunludur.', { alanlar: { konu: ['Konu girin.'] } });
    islem(() => {
      const kod = sonrakiKod(ctx.tenant.id, 'evrak');
      const id = kimlik('evrak');
      calistir(`INSERT INTO evrak (id, tenant_id, proje_id, kod, yon, konu, karsi_taraf, evrak_tarihi,
                  havale_id, son_tarih, durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?,?,?, 'yeni', ?,?)`,
        id, ctx.tenant.id, govde.projeId || null, kod, govde.yon || 'gelen', konu,
        govde.karsiTaraf || null, govde.evrakTarihi ? gunBaslangici(govde.evrakTarihi) : simdi(),
        govde.havaleId || null, govde.sonTarih ? gunBaslangici(govde.sonTarih) : null,
        ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'evrak', nesneId: id, eylem: 'olustur', sonraki: { kod, konu, yon: govde.yon } });
    });
    return yonlendir(ctx, '/evrak?olusturuldu=1');
  }, { ekran: ekranNesnesi('DOC-08') });

  y.get('/evrak/:id', (ctx, _g, params) => {
    const e = ekranNesnesi('DOC-08');
    yetkiZorunlu(ctx, e.yetki);
    const ev = tek('SELECT * FROM evrak WHERE id = ? AND tenant_id = ?', params.id, ctx.tenant.id);
    if (!ev) throw DogrulamaHatasi('Evrak bulunamadı.');
    const icerik = h`${B.detayOzetSeridi({
      kod: ev.kod, baslik: ev.konu, durum: ev.durum, surum: ev.surum,
      bilgiler: [
        { etiket: 'Yön', deger: ev.yon },
        { etiket: 'Karşı taraf', deger: ev.karsi_taraf || '—' },
        { etiket: 'Evrak tarihi', deger: tarih(ev.evrak_tarihi) },
        { etiket: 'Havale', deger: kullaniciAdi(ev.havale_id) },
        { etiket: 'Son tarih', deger: ev.son_tarih ? tarih(ev.son_tarih) : '—' },
      ],
    })}${gecmisKarti('evrak', ev)}`;
    return html(ctx, 200, ciz(ctx, e, icerik, { kayitEtiketi: ev.kod, baslik: ev.konu }));
  }, { ekran: ekranNesnesi('DOC-08') });

  /* ================= DOC-09 Belge dağıtım matrisi ====================== */
  ekranRota(y, 'DOC-09', {
    get: (ctx) => {
      const e = ekranNesnesi('DOC-09');
      yetkiZorunlu(ctx, e.yetki);
      const turler = sorgu('SELECT kod, ad FROM belge_turu WHERE tenant_id = ? ORDER BY ad', ctx.tenant.id);
      const roller = sorgu('SELECT kod, ad FROM rol WHERE tenant_id IS NULL ORDER BY ad');
      const kurallar = sorgu('SELECT * FROM dagitim_matrisi WHERE tenant_id = ?', ctx.tenant.id);
      const erisim = (bt, rk) => kurallar.find((k) => k.belge_turu === bt && k.rol_kodu === rk)?.erisim;

      const icerik = h`
${ctx.sorgu.get('kaydedildi') ? B.sonucSeridi({ tur: 'ok', baslik: 'Dağıtım kuralı kaydedildi' }) : ''}
<div class="gv-card" style="margin-bottom:18px">
  <div class="gc-head"><div class="gc-title"><b>Belge dağıtım matrisi</b>
    <span>Rol ve belge türüne göre kontrollü dağıtım. Kural yoksa varsayılan: belge sınıfına göre
      erişim (gizli belge yalnız yetkili rollere).</span></div></div>
  <div class="gc-body flush"><div class="gv-tscroll"><table class="gtable">
    <thead><tr><th>Belge türü</th>${roller.map((r) => h`<th class="ta-orta">${r.ad}</th>`)}</tr></thead>
    <tbody>${turler.map((t) => h`<tr>
      <td data-etiket="Belge türü"><span class="td-icerik"><b>${t.ad}</b><br><span class="muted">${t.kod}</span></span></td>
      ${roller.map((r) => h`<td class="ta-orta" data-etiket="${r.ad}"><span class="td-icerik">${
        erisim(t.kod, r.kod) === 'yok' ? B.isaret('yok', 'danger')
        : erisim(t.kod, r.kod) ? B.isaret(erisim(t.kod, r.kod), 'ok')
        : h`<span class="muted">varsayılan</span>`}</span></td>`)}
    </tr>`)}</tbody>
  </table></div></div>
</div>
${yetkiVar(ctx, 'DOC-09:guncelle') ? B.form({
        rota: '/dokumanlar/dagitim-matrisi', csrf: csrfAlani(ctx),
        bolumler: [{ baslik: 'Kural tanımla', alanlar: h`
          ${B.alan({ ad: 'belgeTuru', etiket: 'Belge türü', zorunlu: true,
            secenekler: [{ deger: '', etiket: 'Seçin…' }, ...turler.map((t) => ({ deger: t.kod, etiket: t.ad }))] })}
          ${B.alan({ ad: 'rolKodu', etiket: 'Rol', zorunlu: true,
            secenekler: [{ deger: '', etiket: 'Seçin…' }, ...roller.map((r) => ({ deger: r.kod, etiket: r.ad }))] })}
          ${B.alan({ ad: 'erisim', etiket: 'Erişim', zorunlu: true, deger: 'goruntule', secenekler: [
            { deger: 'goruntule', etiket: 'Görüntüle' }, { deger: 'indir', etiket: 'İndir' },
            { deger: 'duzenle', etiket: 'Düzenle' }, { deger: 'yok', etiket: 'Erişim yok' }] })}` }],
        eylemler: B.btn('Kuralı kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
      }) : ''}`;
      return html(ctx, 200, ciz(ctx, e, icerik));
    },
    post: (ctx, govde) => {
      yetkiZorunlu(ctx, 'DOC-09:guncelle');
      csrfZorunlu(ctx, govde);
      if (!govde.belgeTuru || !govde.rolKodu) throw DogrulamaHatasi('Belge türü ve rol seçin.');
      islem(() => {
        calistir(`INSERT OR REPLACE INTO dagitim_matrisi (id, tenant_id, belge_turu, rol_kodu, erisim, olusturan, olusturuldu)
                  VALUES (?,?,?,?,?,?,?)`,
          kimlik('dokuman').replace('doc', 'dgm'), ctx.tenant.id, govde.belgeTuru, govde.rolKodu,
          govde.erisim || 'goruntule', ctx.kullanici.id, simdi());
        audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
          nesne: 'dagitim_matrisi', nesneId: `${govde.belgeTuru}:${govde.rolKodu}`, eylem: 'kural_tanimlandi',
          sonraki: { erisim: govde.erisim } });
      });
      return yonlendir(ctx, '/dokumanlar/dagitim-matrisi?kaydedildi=1');
    },
  });

  /* ================= DOC-10 Belge arşivi =============================== */
  ekranRota(y, 'DOC-10', {
    get: (ctx) => {
      const e = ekranNesnesi('DOC-10');
      yetkiZorunlu(ctx, e.yetki);
      const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
      const toplam = Number(tek(
        `SELECT COUNT(*) AS n FROM dokuman WHERE tenant_id = ? AND (durum = 'arsiv' OR saklama_bitis IS NOT NULL)`,
        ctx.tenant.id)?.n ?? 0);
      const satirlar = sorgu(
        `SELECT d.*, bt.saklama_ay FROM dokuman d
           LEFT JOIN belge_turu bt ON bt.kod = d.belge_turu AND bt.tenant_id = d.tenant_id
          WHERE d.tenant_id = ? ORDER BY d.olusturuldu DESC LIMIT ? OFFSET ?`,
        ctx.tenant.id, boyut, atla);

      const icerik = h`
<div class="gv-card">
  <div class="gc-head"><div class="gc-title"><b>Belge arşivi ve saklama</b>
    <span>Saklama süresi belge türünden gelir. <b>Hukuki bekletme</b> varsa süre dolsa bile imha edilmez.</span></div></div>
  <div class="gc-body flush">${B.tablo({
        satirlar,
        satirRota: (r) => `/dokumanlar/${r.id}`,
        bosDurum: { baslik: 'Arşivlenecek belge yok', ikon: 'fa-box-archive' },
        sutunlar: [
          { ad: 'kod', etiket: 'Kod' },
          { ad: 'ad', etiket: 'Belge', govde: (r) => h`<a href="/dokumanlar/${r.id}"><b>${r.ad}</b></a>` },
          { ad: 'belge_turu', etiket: 'Tür' },
          { ad: 'saklama_ay', etiket: 'Saklama', hizala: 'sag', govde: (r) => (r.saklama_ay ? `${r.saklama_ay} ay` : '—') },
          { ad: 'hukuki_bekletme', etiket: 'Hukuki bekletme',
            govde: (r) => (r.hukuki_bekletme ? B.isaret('var — imha edilemez', 'danger') : '—') },
          { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
        ],
      })}</div>
  ${B.sayfalama({ rota: '/dokumanlar/arsiv', sorgu: ctx.sorgu, sayfa, boyut, toplam })}
</div>
${B.veriTarihi(simdi())}`;
      return html(ctx, 200, ciz(ctx, e, icerik));
    },
  });
}

/* ========================================================================== */
function cizimDetayi(ctx, id) {
  const e = ekranNesnesi('DOC-05');
  yetkiZorunlu(ctx, e.yetki);
  const c = tek('SELECT * FROM cizim WHERE id = ? AND tenant_id = ?', id, ctx.tenant.id);
  if (!c) throw DogrulamaHatasi('Çizim bulunamadı.');
  const revizyonlar = sorgu(
    `SELECT r.*, k.ad_soyad FROM cizim_revizyonu r JOIN kullanici k ON k.id = r.yayinlayan
      WHERE r.cizim_id = ? ORDER BY r.yayin_tarihi DESC`, c.id);
  const dagitimlar = sorgu(
    `SELECT t.kod, t.alici, t.gonderim_tarihi, tk.revizyon FROM transmittal_kalemi tk
       JOIN transmittal t ON t.id = tk.transmittal_id
      WHERE tk.cizim_id = ? ORDER BY t.gonderim_tarihi DESC`, c.id);

  const icerik = h`
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.detayOzetSeridi({
    kod: c.kod, baslik: c.ad, durum: c.durum, surum: c.surum,
    isaretler: c.aktif_revizyon ? [{ metin: `son geçerli: rev. ${c.aktif_revizyon}`, ton: 'ok' }]
      : [{ metin: 'revizyon yayınlanmamış', ton: 'warn' }],
    bilgiler: [
      { etiket: 'Disiplin', deger: c.disiplin },
      { etiket: 'Paket', deger: c.paket || '—' },
      { etiket: 'Ölçek', deger: c.olcek || '—' },
      { etiket: 'Revizyon sayısı', deger: sayi(revizyonlar.length) },
      { etiket: 'Dağıtım', deger: sayi(dagitimlar.length) },
    ],
  })}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Revizyon geçmişi</b>
        <span>Revizyon satırı değiştirilemez; yeni revizyon yeni satırdır (§5.4).</span></div></div>
      <div class="gc-body flush">${B.tablo({
        satirlar: revizyonlar,
        bosDurum: { baslik: 'Revizyon yok', aciklama: 'İlk revizyonu yayınlayın.', ikon: 'fa-code-branch' },
        sutunlar: [
          { ad: 'revizyon', etiket: 'Revizyon', govde: (r) => h`<b>rev. ${r.revizyon}</b>${
            r.revizyon === c.aktif_revizyon ? h` ${B.isaret('geçerli', 'ok')}` : ''}` },
          { ad: 'aciklama', etiket: 'Açıklama', govde: (r) => r.aciklama || '—' },
          { ad: 'yayin_tarihi', etiket: 'Yayın', govde: (r) => tarih(r.yayin_tarihi) },
          { ad: 'ad_soyad', etiket: 'Yayınlayan' },
        ],
      })}</div>
    </div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Dağıtım geçmişi</b>
        <span>Bu çizim hangi transmittalle, hangi revizyonda kime gitti.</span></div></div>
      <div class="gc-body flush">${B.tablo({
        satirlar: dagitimlar,
        bosDurum: { baslik: 'Dağıtım kaydı yok', ikon: 'fa-share-nodes' },
        sutunlar: [
          { ad: 'kod', etiket: 'Transmittal' },
          { ad: 'alici', etiket: 'Alıcı' },
          { ad: 'revizyon', etiket: 'Revizyon', govde: (r) => (r.revizyon ? `rev. ${r.revizyon}` : '—') },
          { ad: 'gonderim_tarihi', etiket: 'Gönderim', govde: (r) => (r.gonderim_tarihi ? tarih(r.gonderim_tarihi) : '—') },
        ],
      })}</div>
    </div>
    ${gecmisKarti('cizim', c)}
  </div>
  <div class="gv-side-stack">
    ${yetkiVar(ctx, 'DOC-05:guncelle') ? B.form({
      rota: `/cizimler/${c.id}`, csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Yeni revizyon yayınla',
        aciklama: 'Yayınlanan revizyon "son geçerli sürüm" olur; önceki revizyonlar korunur.', alanlar: h`
        ${ham(`<input type="hidden" name="surum" value="${c.surum}">`)}
        ${B.alan({ ad: 'revizyon', etiket: 'Revizyon kodu', zorunlu: true, ipucu: 'Örn. A, B, 0, 1' })}
        ${B.alan({ ad: 'yayinTarihi', etiket: 'Yayın tarihi', tur: 'date', deger: gunAnahtari(simdi()) })}
        ${B.alan({ ad: 'aciklama', etiket: 'Revizyon açıklaması', tur: 'metin', genis: true })}` }],
      eylemler: B.btn('Revizyonu yayınla', { tur: 'acc', gonder: true, ikon: 'fa-code-branch' }),
    }) : ''}
  </div>
</div>`;
  return html(ctx, 200, ciz(ctx, e, icerik, { kayitEtiketi: c.kod, baslik: c.ad }));
}

function transmittalDetayi(ctx, id) {
  const e = ekranNesnesi('DOC-06');
  yetkiZorunlu(ctx, e.yetki);
  const t = tek('SELECT * FROM transmittal WHERE id = ? AND tenant_id = ?', id, ctx.tenant.id);
  if (!t) throw DogrulamaHatasi('Transmittal bulunamadı.');
  const kalemler = sorgu(
    `SELECT tk.*, d.kod AS dokuman_kodu, d.ad AS dokuman_adi, c.kod AS cizim_kodu, c.ad AS cizim_adi
       FROM transmittal_kalemi tk
       LEFT JOIN dokuman d ON d.id = tk.dokuman_id
       LEFT JOIN cizim c ON c.id = tk.cizim_id
      WHERE tk.transmittal_id = ?`, t.id);
  const cizimler = sorgu('SELECT id, kod, ad, aktif_revizyon FROM cizim WHERE tenant_id = ? ORDER BY kod', ctx.tenant.id);
  const dokumanlar = sorgu('SELECT id, kod, ad, aktif_surum FROM dokuman WHERE tenant_id = ? ORDER BY kod LIMIT 200', ctx.tenant.id);

  const icerik = h`
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${B.detayOzetSeridi({
    kod: t.kod, baslik: t.alici,
    durum: t.durum === 'teslim_edildi' ? 'tamamlandi' : t.durum === 'gonderildi' ? 'beklemede' : 'taslak',
    surum: t.surum,
    bilgiler: [
      { etiket: 'Amaç kodu', deger: AMAC_KODLARI.find((a) => a.deger === t.amac_kodu)?.etiket || t.amac_kodu },
      { etiket: 'Alıcı e-posta', deger: t.alici_eposta || '—' },
      { etiket: 'Belge sayısı', deger: sayi(kalemler.length) },
      { etiket: 'Gönderim', deger: t.gonderim_tarihi ? tarih(t.gonderim_tarihi) : '—' },
      { etiket: 'Teslim kanıtı', deger: t.teslim_kaniti || '—' },
    ],
  })}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Gönderi içeriği</b>
        <span>Her kalem, gönderildiği andaki sürüm/revizyonla birlikte dondurulur.</span></div></div>
      <div class="gc-body flush">${B.tablo({
        satirlar: kalemler,
        bosDurum: { baslik: 'Belge eklenmemiş', aciklama: 'Boş transmittal gönderilemez.', ikon: 'fa-file-circle-plus' },
        sutunlar: [
          { ad: 'kayit', etiket: 'Belge / çizim',
            govde: (r) => h`<b>${r.cizim_kodu || r.dokuman_kodu || '—'}</b><br><span class="muted">${r.cizim_adi || r.dokuman_adi || ''}</span>` },
          { ad: 'surum', etiket: 'Sürüm / revizyon',
            govde: (r) => (r.revizyon ? `rev. ${r.revizyon}` : r.surum_no ? `v${r.surum_no}` : '—') },
          { ad: 'aciklama', etiket: 'Açıklama', govde: (r) => r.aciklama || '—' },
        ],
      })}</div>
    </div>
    ${gecmisKarti('transmittal', t)}
  </div>
  <div class="gv-side-stack">
    ${t.durum === 'taslak' && yetkiVar(ctx, 'DOC-06:guncelle') ? h`
      ${B.form({ rota: `/transmittal/${t.id}`, csrf: csrfAlani(ctx),
        bolumler: [{ baslik: 'Belge ekle', alanlar: h`
          ${ham('<input type="hidden" name="_eylem" value="kalem">')}
          ${B.alan({ ad: 'cizimId', etiket: 'Çizim', secenekler: [{ deger: '', etiket: 'Seçin…' },
            ...cizimler.map((c) => ({ deger: c.id, etiket: `${c.kod} (rev. ${c.aktif_revizyon || '—'})` }))] })}
          ${B.alan({ ad: 'dokumanId', etiket: 'Doküman', secenekler: [{ deger: '', etiket: 'Seçin…' },
            ...dokumanlar.map((d) => ({ deger: d.id, etiket: `${d.kod} — ${d.ad}` }))] })}
          ${B.alan({ ad: 'kalemAciklamasi', etiket: 'Açıklama' })}` }],
        eylemler: B.btn('Ekle', { tur: 'ghost', gonder: true, ikon: 'fa-plus' }) })}
      ${B.form({ rota: `/transmittal/${t.id}`, csrf: csrfAlani(ctx),
        bolumler: [{ baslik: 'Gönder', aciklama: 'Gönderim sonrası içerik değiştirilemez.', alanlar: h`
          ${ham('<input type="hidden" name="_eylem" value="gonder">')}
          ${ham(`<input type="hidden" name="surum" value="${t.surum}">`)}` }],
        eylemler: B.btn('Transmittalı gönder', { tur: 'acc', gonder: true, ikon: 'fa-paper-plane' }) })}` : ''}
    ${t.durum === 'gonderildi' && yetkiVar(ctx, 'DOC-06:guncelle') ? B.form({
      rota: `/transmittal/${t.id}`, csrf: csrfAlani(ctx),
      bolumler: [{ baslik: 'Teslim kanıtı',
        aciklama: 'Teslim, kanıt olmadan kaydedilemez.', alanlar: h`
        ${ham('<input type="hidden" name="_eylem" value="teslim">')}
        ${ham(`<input type="hidden" name="surum" value="${t.surum}">`)}
        ${B.alan({ ad: 'teslimKaniti', etiket: 'Kanıt', tur: 'metin', zorunlu: true, genis: true,
          ipucu: 'İmzalı tutanak, e-posta referansı veya kargo takip numarası' })}` }],
      eylemler: B.btn('Teslimi kaydet', { tur: 'acc', gonder: true, ikon: 'fa-circle-check' }),
    }) : ''}
  </div>
</div>`;
  return html(ctx, 200, ciz(ctx, e, icerik, { kayitEtiketi: t.kod, baslik: t.alici }));
}
