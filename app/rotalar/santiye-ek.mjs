/* ============================================================================
   ŞANTİYE TAMAMLAMA — SITE-05, SITE-12..16
   ----------------------------------------------------------------------------
   Sihirbazların ortak ilkesi: adım "tamam" işaretlenmez, GERÇEK kayıttan
   hesaplanır. Şantiye kapanışı doküman §7'nin son satırıdır —
   "engel listesi sıfırlanmadan kapalı duruma geçmez" — ve engel hesabı
   `moduller/santiye/kapanis.mjs` içinde TEK yerde durur: hem bu ekranlar hem
   de geçiş motoru aynı listeyi kullanır.
   ========================================================================== */
import { html, yonlendir } from '../cekirdek/http.mjs';
import { kimlik } from '../cekirdek/kimlikler.mjs';
import { simdi, tarih, tarihSaat, gunAnahtari, gunBaslangici, GUN_MS } from '../cekirdek/zaman.mjs';
import { DogrulamaHatasi, GecisIzinsiz, Bulunamadi, Cakisma, UygulamaHatasi } from '../cekirdek/hata.mjs';
import * as onayMotoru from '../moduller/isakisi/onay.mjs';
import { acilisKontrolleri, acikAcilisEngelleri, kapanisEngelleri, acikKapanisEngelleri }
  from '../moduller/santiye/kapanis.mjs';
import { kullaniciSecenekleri } from './kayit-modulu.mjs';
import {
  ekranNesnesi, hataNesnesi, kullaniciAdi, ciz, kaydiAl, B, h, ham, sayi,
  csrfAlani, csrfZorunlu, yetkiZorunlu, yetkiVar,
  sorgu, tek, calistir, islem, surumluGuncelle, audit, sonrakiKod, gecisYap,
} from './ortak.mjs';

const ZIYARET_TURLERI = [
  { deger: 'ziyaretci', etiket: 'Ziyaretçi' }, { deger: 'teslimat', etiket: 'Teslimat' },
  { deger: 'arac', etiket: 'Araç girişi' }, { deger: 'denetim', etiket: 'Resmi denetim' },
];
const BELGE_TURLERI = [
  { deger: 'ruhsat', etiket: 'Yapı ruhsatı' }, { deger: 'isg_izni', etiket: 'İSG izni / uygunluk' },
  { deger: 'cevre_izni', etiket: 'Çevre izni' }, { deger: 'sigorta', etiket: 'Sigorta poliçesi' },
  { deger: 'sgk', etiket: 'SGK işyeri bildirimi' }, { deger: 'iskan', etiket: 'İskân / kullanma izni' },
  { deger: 'yol_izni', etiket: 'Yol / kazı izni' }, { deger: 'diger', etiket: 'Diğer' },
];
const BELGE_DURUMLARI = [
  { deger: 'gecerli', etiket: 'Geçerli' }, { deger: 'yenilemede', etiket: 'Yenileme sürecinde' },
  { deger: 'iptal', etiket: 'İptal' },
];
/* "Süresi doldu" SAKLANAN durum değil, geçerlilik tarihinden HESAPLANAN işarettir
   (§5.2: gecikme yaşam durumu gibi kullanılmaz). */
const belgeIsareti = (b) => {
  if (b.durum === 'iptal') return { metin: 'İptal', ton: 'warn' };
  if (b.gecerlilik != null && b.gecerlilik < simdi()) return { metin: 'Süresi doldu', ton: 'danger' };
  if (b.durum === 'yenilemede') return { metin: 'Yenilemede', ton: 'warn' };
  if (b.gecerlilik != null && b.gecerlilik < simdi() + 30 * GUN_MS) return { metin: 'Bitişi yaklaşıyor', ton: 'warn' };
  return { metin: 'Geçerli', ton: 'ok' };
};
/* Belge durumunu kullanıcı SEÇMEZ; adlandırılmış eylem uygular (değişmez kural 5). */
const BELGE_EYLEMLERI = {
  yenilemeye_al: { den: ['gecerli'], hedef: 'yenilemede', etiket: 'Yenilemeye al', gerekce: false },
  yenilendi: { den: ['yenilemede', 'gecerli'], hedef: 'gecerli', etiket: 'Yenilendi olarak işaretle', tarihIster: true },
  iptal_et: { den: ['gecerli', 'yenilemede'], hedef: 'iptal', etiket: 'İptal et', gerekce: true },
};

const santiyeAl = (ctx, id) => kaydiAl(ctx, 'santiye', 'santiye', id);

/** Sihirbaz/alt ekranların ortak üst şeridi — bağlam her ekranda aynı. */
function santiyeBasligi(ctx, s, { eylem = null } = {}) {
  return B.detayOzetSeridi({
    kod: s.kod, baslik: s.ad, durum: s.durum, surum: s.surum,
    bilgiler: [
      { etiket: 'Şantiye şefi', deger: kullaniciAdi(s.sef_id) },
      { etiket: 'Konum', deger: [s.ilce, s.il].filter(Boolean).join(' / ') || '—' },
      { etiket: 'Takvim', deger: `${s.baslangic ? tarih(s.baslangic) : '—'} → ${s.planlanan_bitis ? tarih(s.planlanan_bitis) : '—'}` },
    ],
    birincilEylem: B.btn('Şantiyeye dön', { rota: `/santiyeler/${s.id}` }),
    digerEylemler: eylem,
  });
}

export function kur(y, ekranRota) {
  /* ================= SITE-05 Açılış kontrolü =========================== */
  ekranRota(y, 'SITE-05', {
    get: (ctx, _g, params) => acilisSayfasi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('SITE-05');
      yetkiZorunlu(ctx, `${e.kod}:tamamla`);
      csrfZorunlu(ctx, govde);
      const s = santiyeAl(ctx, params.id);
      try {
        const eylem = govde._eylem === 'hazirliga_al' ? 'hazirliga_al' : 'ac';
        gecisYap(ctx, { nesne: 'santiye', tablo: 'santiye', kayit: s, eylem,
          gerekce: govde.gerekce || null, ekranKodu: 'SITE-05' });
        return yonlendir(ctx, `/santiyeler/${s.id}/acilis?islem=${encodeURIComponent(
          eylem === 'ac' ? 'Şantiye açıldı' : 'Şantiye hazırlığa alındı')}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return acilisSayfasi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });

  /* ================= SITE-12 Ziyaretçi ve saha girişi ================== */
  ekranRota(y, 'SITE-12', {
    get: (ctx, _g, params) => ziyaretciSayfasi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('SITE-12');
      csrfZorunlu(ctx, govde);
      const s = santiyeAl(ctx, params.id);
      try {
        const mesaj = govde._eylem === 'cikis' ? ziyaretciCikis(ctx, s, govde) : ziyaretciGiris(ctx, s, govde);
        return yonlendir(ctx, `/santiyeler/${s.id}/ziyaretciler?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return ziyaretciSayfasi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= SITE-13 İzin ve resmi belgeler ==================== */
  ekranRota(y, 'SITE-13', {
    get: (ctx, _g, params) => belgeSayfasi(ctx, params.id),
    post: (ctx, govde, params) => {
      csrfZorunlu(ctx, govde);
      const s = santiyeAl(ctx, params.id);
      try {
        const mesaj = govde._eylem === 'durum' ? belgeDurumu(ctx, s, govde) : belgeEkle(ctx, s, govde);
        return yonlendir(ctx, `/santiyeler/${s.id}/izinler?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return belgeSayfasi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
      }
    },
  });

  /* ================= SITE-14 / SITE-15 Kabul sihirbazları ============== */
  for (const [kod, tur] of [['SITE-14', 'gecici'], ['SITE-15', 'kesin']]) {
    ekranRota(y, kod, {
      get: (ctx, _g, params) => kabulSayfasi(ctx, params.id, tur, kod),
      post: (ctx, govde, params) => {
        const e = ekranNesnesi(kod);
        yetkiZorunlu(ctx, `${e.kod}:olustur`);
        csrfZorunlu(ctx, govde);
        const s = santiyeAl(ctx, params.id);
        try {
          const mesaj = kabulIslemi(ctx, s, tur, govde, kod);
          return yonlendir(ctx, `${ekranNesnesi(kod).rota.replace(':id', s.id)}?islem=${encodeURIComponent(mesaj)}`);
        } catch (err) {
          if (!(err instanceof UygulamaHatasi)) throw err;
          return kabulSayfasi(ctx, params.id, tur, kod, { hata: hataNesnesi(err), durum: err.durum, deger: govde });
        }
      },
    });
  }

  /* ================= SITE-16 Şantiye kapatma =========================== */
  ekranRota(y, 'SITE-16', {
    get: (ctx, _g, params) => kapatmaSayfasi(ctx, params.id),
    post: (ctx, govde, params) => {
      const e = ekranNesnesi('SITE-16');
      yetkiZorunlu(ctx, `${e.kod}:tamamla`);
      csrfZorunlu(ctx, govde);
      const s = santiyeAl(ctx, params.id);
      try {
        const mesaj = kapatmaIslemi(ctx, s, govde);
        return yonlendir(ctx, `/santiyeler/${s.id}/kapat?islem=${encodeURIComponent(mesaj)}`);
      } catch (err) {
        if (!(err instanceof UygulamaHatasi)) throw err;
        return kapatmaSayfasi(ctx, params.id, { hata: hataNesnesi(err), durum: err.durum });
      }
    },
  });
}

/* ==========================================================================
   SITE-05
   ========================================================================== */
function acilisSayfasi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('SITE-05');
  yetkiZorunlu(ctx, e.yetki);
  const s = santiyeAl(ctx, id);
  const kontroller = acilisKontrolleri(s.id);
  const eksik = acikAcilisEngelleri(s.id);
  const acilabilir = s.durum === 'hazirlik' && eksik.length === 0;

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${santiyeBasligi(ctx, s)}
<div class="dash-cols">
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>Açılış kontrol listesi</b>
      <span>Her satır gerçek kayıttan hesaplanır; adımı elle "tamam" işaretleyemezsiniz.</span></div></div>
    <div class="gc-body flush">${B.tablo({
    satirlar: kontroller,
    bosDurum: { baslik: 'Kontrol yok' },
    sutunlar: [
      { ad: 'd', etiket: '', govde: (k) => k.planli ? B.isaret(`${k.planli}'te bağlanacak`, 'info')
        : !k.engel ? B.isaret('tamam', 'ok')
        : k.zorunlu ? B.isaret('engel', 'danger') : B.isaret('uyarı', 'warn') },
      { ad: 'ad', etiket: 'Kontrol', govde: (k) => h`<b>${k.ad}</b><br><span class="muted">${k.not}</span>` },
      { ad: 'rota', etiket: '', govde: (k) => (k.rota ? B.btn('Aç', { rota: k.rota, kucuk: true }) : '—') },
    ],
  })}</div>
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Şantiyeyi aç</b>
        <span>Durumu siz seçmezsiniz; geçişi motor yapar ve engel varsa reddeder.</span></div></div>
      <div class="gc-body">
        ${s.durum === 'aktif' ? B.sonucSeridi({ tur: 'ok', baslik: 'Şantiye zaten açık' })
    : ['kapanista', 'kapali', 'arsiv', 'askida'].includes(s.durum)
      ? B.sonucSeridi({ tur: 'warn', baslik: `Şantiye "${s.durum}" durumunda`,
        aciklama: 'Açılış sihirbazı yalnız taslak ve hazırlık durumunda çalışır.' })
      : eksik.length ? B.sonucSeridi({ tur: 'warn', baslik: `${eksik.length} zorunlu kontrol tamamlanmadı`,
        aciklama: eksik.map((k) => k.ad).join(', ') }) : ''}
        ${yetkiVar(ctx, 'SITE-05:tamamla') && ['taslak', 'hazirlik'].includes(s.durum) ? h`
        <form method="post" action="/santiyeler/${s.id}/acilis" data-gform="1">
          ${ham(csrfAlani(ctx))}
          ${B.alan({ ad: 'gerekce', etiket: 'Not', tur: 'metin' })}
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
            ${s.durum === 'taslak'
    ? h`<button class="btn btn-acc" type="submit" name="_eylem" value="hazirliga_al">
        Hazırlığa al <span class="muted">→ hazırlık</span></button>` : ''}
            ${s.durum === 'hazirlik' ? (acilabilir
    ? h`<button class="btn btn-acc" type="submit" name="_eylem" value="ac">
        Şantiyeyi aç <span class="muted">→ aktif</span></button>`
    : h`<button class="btn btn-ghost" type="button" disabled>
        <i class="fa-solid fa-ban"></i> Şantiyeyi aç</button>
        <span class="gf-err">Zorunlu kontroller tamamlanmadan açılamaz.</span>`) : ''}
          </div>
        </form>` : ''}
      </div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: s.kod, baslik: s.ad }));
}

/* ==========================================================================
   SITE-12
   ========================================================================== */
function ziyaretciGiris(ctx, s, govde) {
  yetkiZorunlu(ctx, 'SITE-12:olustur');
  const ad = String(govde.adSoyad || '').trim();
  if (!ad) throw DogrulamaHatasi('Ziyaretçi adı zorunludur.', { alanlar: { adSoyad: ['Ad soyad girin.'] } });
  if (!['aktif', 'hazirlik', 'kapanista'].includes(s.durum)) {
    throw GecisIzinsiz(`Şantiye "${s.durum}" durumunda; saha girişi kaydedilemez.`);
  }
  islem(() => {
    const id = kimlik('atama').replace('atm', 'vst');
    calistir(`INSERT INTO ziyaretci (id, tenant_id, santiye_id, proje_id, tur, ad_soyad, firma, amac,
                plaka, refakatci_id, kkd_verildi, isg_brifingi, giris, notlar, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'sahada', ?,?)`,
      id, ctx.tenant.id, s.id, s.proje_id, govde.tur || 'ziyaretci', ad,
      govde.firma || null, govde.amac || null, govde.plaka || null, govde.refakatciId || null,
      govde.kkdVerildi === '1' ? 1 : 0, govde.isgBrifingi === '1' ? 1 : 0,
      simdi(), govde.notlar || null, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'ziyaretci', nesneId: id, eylem: 'giris', sonraki: { ad, tur: govde.tur, santiye: s.kod } });
  });
  return `${ad} saha girişi kaydedildi`;
}

function ziyaretciCikis(ctx, s, govde) {
  yetkiZorunlu(ctx, 'SITE-12:guncelle');
  const z = tek('SELECT * FROM ziyaretci WHERE id = ? AND santiye_id = ?', govde.id, s.id);
  if (!z) throw Bulunamadi('Saha giriş kaydı bulunamadı.');
  if (z.durum !== 'sahada') throw GecisIzinsiz('Bu kayıt zaten kapatılmış.');
  islem(() => {
    surumluGuncelle('ziyaretci', z.id, Number(govde.surum), { durum: 'cikti', cikis: simdi() },
      { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'ziyaretci', nesneId: z.id, eylem: 'cikis',
      onceki: { durum: 'sahada' }, sonraki: { durum: 'cikti' } });
  });
  return `${z.ad_soyad} çıkışı kaydedildi`;
}

function ziyaretciSayfasi(ctx, id, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('SITE-12');
  yetkiZorunlu(ctx, e.yetki);
  const s = santiyeAl(ctx, id);
  const rota = `/santiyeler/${s.id}/ziyaretciler`;
  const gun = ctx.sorgu.get('gun') || gunAnahtari(simdi());
  const gunBas = gunBaslangici(gun);
  const kosullar = ['santiye_id = ?']; const parametreler = [s.id];
  if (ctx.sorgu.get('tur')) { kosullar.push('tur = ?'); parametreler.push(ctx.sorgu.get('tur')); }
  if (ctx.sorgu.get('sadece_sahada') === '1') kosullar.push(`durum = 'sahada'`);
  else { kosullar.push('(giris >= ? AND giris < ?)'); parametreler.push(gunBas, gunBas + GUN_MS); }
  const q = (ctx.sorgu.get('q') || '').trim();
  if (q) { kosullar.push('(ad_soyad LIKE ? OR firma LIKE ?)'); parametreler.push(`%${q}%`, `%${q}%`); }

  const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
  const nerede = kosullar.join(' AND ');
  const toplam = Number(tek(`SELECT COUNT(*) AS n FROM ziyaretci WHERE ${nerede}`, ...parametreler)?.n ?? 0);
  const satirlar = sorgu(`SELECT * FROM ziyaretci WHERE ${nerede} ORDER BY giris DESC LIMIT ? OFFSET ?`,
    ...parametreler, boyut, atla);
  const sahada = Number(tek(`SELECT COUNT(*) AS n FROM ziyaretci WHERE santiye_id = ? AND durum = 'sahada'`, s.id)?.n ?? 0);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${santiyeBasligi(ctx, s)}
${sahada ? B.sonucSeridi({ tur: 'warn', baslik: `${sahada} kişi hâlâ sahada`,
    aciklama: 'Şantiye kapanışı, sahada kayıtlı kişi kalmadan tamamlanamaz (§7).' }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Sahada', deger: sayi(sahada), ikon: 'fa-user-clock', ton: sahada ? 'warn' : '' },
      { etiket: 'Bu filtrede', deger: sayi(toplam), ikon: 'fa-filter' },
      { etiket: 'KKD verilen', deger: sayi(satirlar.filter((r) => r.kkd_verildi).length), ikon: 'fa-helmet-safety' },
      { etiket: 'İSG brifingi', deger: sayi(satirlar.filter((r) => r.isg_brifingi).length), ikon: 'fa-shield-heart' },
    ]),
    filtre: B.filtreBari({ rota, sorgu: ctx.sorgu, aramaYer: 'Ad soyad veya firma…',
      filtreler: [
        { ad: 'tur', etiket: 'Tür', secenekler: ZIYARET_TURLERI },
        { ad: 'sadece_sahada', etiket: 'Görünüm', secenekler: [{ deger: '1', etiket: 'Yalnız sahada olanlar' }] },
      ] }),
    icerik: B.tablo({
      satirlar,
      bosDurum: { baslik: 'Kayıt yok', ikon: 'fa-user-clock',
        aciklama: 'Seçili gün için saha giriş kaydı bulunamadı. Aşağıdan yeni giriş açabilirsiniz.' },
      sutunlar: [
        { ad: 'giris', etiket: 'Giriş', govde: (r) => tarihSaat(r.giris) },
        { ad: 'ad_soyad', etiket: 'Kişi / araç', govde: (r) => h`<b>${r.ad_soyad}</b>${
          r.firma ? h`<br><span class="muted">${r.firma}</span>` : ''}${
          r.plaka ? h`<br><span class="muted">plaka: ${r.plaka}</span>` : ''}` },
        { ad: 'tur', etiket: 'Tür', govde: (r) => ZIYARET_TURLERI.find((t) => t.deger === r.tur)?.etiket || r.tur },
        { ad: 'amac', etiket: 'Amaç', govde: (r) => r.amac || '—' },
        { ad: 'isg', etiket: 'İSG / KKD', govde: (r) => h`${r.isg_brifingi ? B.isaret('brifing', 'ok') : B.isaret('brifing yok', 'warn')} ${
          r.kkd_verildi ? B.isaret('KKD', 'ok') : ''}` },
        { ad: 'cikis', etiket: 'Çıkış', govde: (r) => (r.cikis ? tarihSaat(r.cikis) : B.isaret('sahada', 'warn')) },
        { ad: 'islem', etiket: '', govde: (r) => (r.durum !== 'sahada' || !yetkiVar(ctx, 'SITE-12:guncelle') ? '—'
          : h`<form method="post" action="${rota}" style="display:inline">${ham(csrfAlani(ctx))}
              <input type="hidden" name="_eylem" value="cikis">
              <input type="hidden" name="id" value="${r.id}">
              <input type="hidden" name="surum" value="${r.surum}">
              <button class="btn btn-ghost btn-sm" type="submit">Çıkış ver</button></form>`) },
      ],
    }),
    sayfalayici: B.sayfalama({ rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'SITE-12:olustur') ? B.form({
    rota, csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni saha girişi',
      aciklama: 'Giriş saati sunucu saatidir; kullanıcı giremez. Çıkış verilmeyen kayıt "sahada" sayılır.',
      alanlar: h`
      ${B.alan({ ad: 'adSoyad', etiket: 'Ad soyad', zorunlu: true, deger: deger.adSoyad || '', genis: true })}
      ${B.alan({ ad: 'tur', etiket: 'Tür', deger: deger.tur || 'ziyaretci', secenekler: ZIYARET_TURLERI })}
      ${B.alan({ ad: 'firma', etiket: 'Firma', deger: deger.firma || '' })}
      ${B.alan({ ad: 'amac', etiket: 'Amaç', deger: deger.amac || '' })}
      ${B.alan({ ad: 'plaka', etiket: 'Plaka', deger: deger.plaka || '' })}
      ${B.alan({ ad: 'refakatciId', etiket: 'Refakatçi',
        secenekler: [{ deger: '', etiket: 'Seçin…' }, ...kullaniciSecenekleri(ctx)] })}
      ${B.alan({ ad: 'isgBrifingi', etiket: 'İSG brifingi verildi', deger: deger.isgBrifingi || '0',
        secenekler: [{ deger: '0', etiket: 'Hayır' }, { deger: '1', etiket: 'Evet' }] })}
      ${B.alan({ ad: 'kkdVerildi', etiket: 'KKD teslim edildi', deger: deger.kkdVerildi || '0',
        secenekler: [{ deger: '0', etiket: 'Hayır' }, { deger: '1', etiket: 'Evet' }] })}
      ${B.alan({ ad: 'notlar', etiket: 'Not', tur: 'metin', genis: true, deger: deger.notlar || '' })}` }],
    eylemler: B.btn('Girişi kaydet', { tur: 'acc', gonder: true, ikon: 'fa-right-to-bracket' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: s.kod, baslik: s.ad }));
}

/* ==========================================================================
   SITE-13
   ========================================================================== */
function belgeEkle(ctx, s, govde) {
  yetkiZorunlu(ctx, 'SITE-13:olustur');
  const ad = String(govde.ad || '').trim();
  if (!ad) throw DogrulamaHatasi('Belge adı zorunludur.', { alanlar: { ad: ['Belge adı girin.'] } });
  const baslangic = govde.baslangic ? gunBaslangici(govde.baslangic) : null;
  const gecerlilik = govde.gecerlilik ? gunBaslangici(govde.gecerlilik) : null;
  if (baslangic && gecerlilik && gecerlilik < baslangic) {
    throw DogrulamaHatasi('Geçerlilik bitişi başlangıçtan önce olamaz.',
      { alanlar: { gecerlilik: ['Tarih aralığı geçersiz.'] } });
  }
  islem(() => {
    const id = kimlik('dokuman').replace('doc', 'sbl');
    calistir(`INSERT INTO santiye_belgesi (id, tenant_id, santiye_id, tur, ad, belge_no, veren_kurum,
                baslangic, gecerlilik, zorunlu, notlar, durum, olusturan, olusturuldu)
              VALUES (?,?,?,?,?,?,?,?,?,?,?, 'gecerli', ?,?)`,
      id, ctx.tenant.id, s.id, govde.tur || 'diger', ad, govde.belgeNo || null,
      govde.verenKurum || null, baslangic, gecerlilik, govde.zorunlu === '1' ? 1 : 0,
      govde.notlar || null, ctx.kullanici.id, simdi());
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'santiye_belgesi', nesneId: id, eylem: 'olustur',
      sonraki: { santiye: s.kod, ad, tur: govde.tur, zorunlu: govde.zorunlu === '1' } });
  });
  return `${ad} kaydedildi`;
}

function belgeDurumu(ctx, s, govde) {
  yetkiZorunlu(ctx, 'SITE-13:guncelle');
  const b = tek('SELECT * FROM santiye_belgesi WHERE id = ? AND santiye_id = ?', govde.id, s.id);
  if (!b) throw Bulunamadi('Belge bulunamadı.');
  const tanim = BELGE_EYLEMLERI[govde.belgeEylemi];
  if (!tanim) throw DogrulamaHatasi('Bilinmeyen belge eylemi.');
  if (!tanim.den.includes(b.durum)) {
    throw GecisIzinsiz(`"${b.ad}" belgesi "${b.durum}" durumundayken bu işlem yapılamaz.`);
  }
  if (tanim.gerekce && !String(govde.gerekce || '').trim()) {
    throw DogrulamaHatasi('Bu işlem için gerekçe zorunludur.', { alanlar: { gerekce: ['Gerekçe girin.'] } });
  }
  const alanlar = { durum: tanim.hedef };
  if (tanim.tarihIster) {
    if (!govde.yeniGecerlilik) {
      throw DogrulamaHatasi('Yenilenen belgenin yeni geçerlilik tarihi zorunludur.',
        { alanlar: { yeniGecerlilik: ['Yeni geçerlilik tarihi girin.'] } });
    }
    const yeni = gunBaslangici(govde.yeniGecerlilik);
    if (yeni <= simdi()) {
      throw DogrulamaHatasi('Yeni geçerlilik tarihi gelecekte olmalı.',
        { alanlar: { yeniGecerlilik: ['Geçmiş tarih yenileme sayılmaz.'] } });
    }
    alanlar.gecerlilik = yeni;
  }
  islem(() => {
    surumluGuncelle('santiye_belgesi', b.id, Number(govde.surum), alanlar,
      { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });
    audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne: 'santiye_belgesi', nesneId: b.id, eylem: `belge:${govde.belgeEylemi}`,
      gerekce: govde.gerekce || null,
      onceki: { durum: b.durum, gecerlilik: b.gecerlilik }, sonraki: alanlar });
  });
  return `${b.ad}: ${tanim.etiket.toLowerCase()} uygulandı`;
}

function belgeSayfasi(ctx, id, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi('SITE-13');
  yetkiZorunlu(ctx, e.yetki);
  const s = santiyeAl(ctx, id);
  const rota = `/santiyeler/${s.id}/izinler`;
  const kosullar = ['santiye_id = ?']; const parametreler = [s.id];
  if (ctx.sorgu.get('tur')) { kosullar.push('tur = ?'); parametreler.push(ctx.sorgu.get('tur')); }
  if (ctx.sorgu.get('durum')) { kosullar.push('durum = ?'); parametreler.push(ctx.sorgu.get('durum')); }
  const q = (ctx.sorgu.get('q') || '').trim();
  if (q) { kosullar.push('(ad LIKE ? OR belge_no LIKE ?)'); parametreler.push(`%${q}%`, `%${q}%`); }

  const { sayfa, boyut, atla } = B.sayfalamaGirdisi(ctx.sorgu);
  const nerede = kosullar.join(' AND ');
  const toplam = Number(tek(`SELECT COUNT(*) AS n FROM santiye_belgesi WHERE ${nerede}`, ...parametreler)?.n ?? 0);
  const satirlar = sorgu(
    `SELECT * FROM santiye_belgesi WHERE ${nerede} ORDER BY zorunlu DESC, gecerlilik IS NULL, gecerlilik ASC
      LIMIT ? OFFSET ?`, ...parametreler, boyut, atla);
  const tumu = sorgu('SELECT * FROM santiye_belgesi WHERE santiye_id = ?', s.id);
  const dolan = tumu.filter((b) => b.gecerlilik != null && b.gecerlilik < simdi() && b.durum !== 'iptal');
  const yaklasan = tumu.filter((b) => b.gecerlilik != null && b.gecerlilik >= simdi()
    && b.gecerlilik < simdi() + 30 * GUN_MS && b.durum !== 'iptal');

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${santiyeBasligi(ctx, s)}
${dolan.length ? B.sonucSeridi({ tur: 'hata', baslik: `${dolan.length} belgenin süresi doldu`,
    aciklama: 'Süresi dolan zorunlu belge, şantiye açılışını ve kapanışını engeller.' }) : ''}
${B.listeDuzeni({
    kpi: B.kpiSeridi([
      { etiket: 'Toplam belge', deger: sayi(tumu.length), ikon: 'fa-file-shield' },
      { etiket: 'Zorunlu', deger: sayi(tumu.filter((b) => b.zorunlu).length), ikon: 'fa-asterisk' },
      { etiket: 'Süresi dolan', deger: sayi(dolan.length), ikon: 'fa-triangle-exclamation',
        ton: dolan.length ? 'danger' : '' },
      { etiket: '30 gün içinde', deger: sayi(yaklasan.length), ikon: 'fa-hourglass-half',
        ton: yaklasan.length ? 'warn' : '' },
    ]),
    filtre: B.filtreBari({ rota, sorgu: ctx.sorgu, aramaYer: 'Belge adı veya no…',
      filtreler: [
        { ad: 'tur', etiket: 'Tür', secenekler: BELGE_TURLERI },
        { ad: 'durum', etiket: 'Durum', secenekler: BELGE_DURUMLARI },
      ] }),
    icerik: B.tablo({
      satirlar,
      bosDurum: { baslik: 'Belge yok', ikon: 'fa-file-shield',
        aciklama: 'Ruhsat, İSG izni ve sigorta gibi resmi belgeler burada izlenir.' },
      sutunlar: [
        { ad: 'ad', etiket: 'Belge', govde: (r) => h`<b>${r.ad}</b>${r.zorunlu ? h` ${B.isaret('zorunlu', 'info')}` : ''}
          <br><span class="muted">${BELGE_TURLERI.find((t) => t.deger === r.tur)?.etiket || r.tur}</span>` },
        { ad: 'belge_no', etiket: 'No', govde: (r) => r.belge_no || '—' },
        { ad: 'veren_kurum', etiket: 'Veren kurum', govde: (r) => r.veren_kurum || '—' },
        { ad: 'gecerlilik', etiket: 'Geçerlilik', govde: (r) => (r.gecerlilik
          ? tarih(r.gecerlilik) : h`<span class="muted">süresiz</span>`) },
        { ad: 'isaret', etiket: 'Durum', govde: (r) => {
          const i = belgeIsareti(r);
          return B.isaret(i.metin, i.ton);
        } },
        { ad: 'islem', etiket: 'İşlem', govde: (r) => {
          if (!yetkiVar(ctx, 'SITE-13:guncelle')) return '—';
          const uygun = Object.entries(BELGE_EYLEMLERI).filter(([, t]) => t.den.includes(r.durum));
          if (!uygun.length) return '—';
          /* Kullanıcı hedef DURUMU değil EYLEMİ seçer (değişmez kural 5). */
          return h`<form method="post" action="${rota}" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            ${ham(csrfAlani(ctx))}
            <input type="hidden" name="_eylem" value="durum">
            <input type="hidden" name="id" value="${r.id}">
            <input type="hidden" name="surum" value="${r.surum}">
            <input type="date" name="yeniGecerlilik" aria-label="Yeni geçerlilik tarihi" style="max-width:150px">
            <input type="text" name="gerekce" placeholder="Gerekçe" aria-label="Gerekçe" style="max-width:150px">
            ${uygun.map(([kod, t]) => h`<button class="btn ${ham(kod === 'iptal_et' ? 'btn-danger' : 'btn-ghost')} btn-sm"
              type="submit" name="belgeEylemi" value="${kod}">${t.etiket}</button>`)}
          </form>`;
        } },
      ],
    }),
    sayfalayici: B.sayfalama({ rota, sorgu: ctx.sorgu, sayfa, boyut, toplam }),
    veriZamani: simdi(),
  })}
${yetkiVar(ctx, 'SITE-13:olustur') ? B.form({
    rota, csrf: csrfAlani(ctx), hatalar: hata,
    bolumler: [{ baslik: 'Yeni resmi belge',
      aciklama: '"Zorunlu" işaretlenen belge geçerli olmadan şantiye açılamaz (SITE-05).',
      alanlar: h`
      ${B.alan({ ad: 'ad', etiket: 'Belge adı', zorunlu: true, genis: true, deger: deger.ad || '' })}
      ${B.alan({ ad: 'tur', etiket: 'Tür', deger: deger.tur || 'ruhsat', secenekler: BELGE_TURLERI })}
      ${B.alan({ ad: 'belgeNo', etiket: 'Belge no', deger: deger.belgeNo || '' })}
      ${B.alan({ ad: 'verenKurum', etiket: 'Veren kurum', deger: deger.verenKurum || '' })}
      ${B.alan({ ad: 'baslangic', etiket: 'Başlangıç', tur: 'date', deger: deger.baslangic || '' })}
      ${B.alan({ ad: 'gecerlilik', etiket: 'Geçerlilik bitişi', tur: 'date', deger: deger.gecerlilik || '' })}
      ${B.alan({ ad: 'zorunlu', etiket: 'Açılış için zorunlu', deger: deger.zorunlu || '0',
        secenekler: [{ deger: '0', etiket: 'Hayır' }, { deger: '1', etiket: 'Evet' }] })}
      ${B.alan({ ad: 'notlar', etiket: 'Not', tur: 'metin', genis: true, deger: deger.notlar || '' })}` }],
    eylemler: B.btn('Belgeyi kaydet', { tur: 'acc', gonder: true, ikon: 'fa-plus' }),
  }) : ''}`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: s.kod, baslik: s.ad }));
}

/* ==========================================================================
   SITE-14 / SITE-15 — kabul
   ========================================================================== */
const acikPunch = (santiyeId) => Number(tek(
  `SELECT COUNT(*) AS n FROM punch WHERE santiye_id = ? AND durum NOT IN ('kapali','iptal')`, santiyeId)?.n ?? 0);

const onayliGeciciKabul = (santiyeId) => tek(
  `SELECT * FROM kabul WHERE santiye_id = ? AND tur = 'gecici' AND durum = 'onaylandi'
    ORDER BY kabul_tarihi DESC LIMIT 1`, santiyeId);

/** Kabul dosyasının açılış/onay ön koşulları — türüne göre farklı. */
function kabulKontrolleri(s, tur) {
  const punch = acikPunch(s.id);
  const gecici = onayliGeciciKabul(s.id);
  const ortak = [
    { ad: 'Şantiye durumu uygun', engel: !['aktif', 'kapanista'].includes(s.durum), zorunlu: true,
      not: `Şantiye "${s.durum}" durumunda; kabul yalnız aktif veya kapanışta olan şantiyede açılır.` },
    { ad: 'Açık punch maddesi', engel: punch > 0, zorunlu: tur === 'kesin',
      not: punch ? `${punch} açık eksik iş var.` : 'Açık eksik iş yok.',
      rota: '/kalite/punch' },
  ];
  if (tur === 'gecici') return ortak;
  return [
    ...ortak,
    { ad: 'Onaylı geçici kabul', engel: !gecici, zorunlu: true,
      not: gecici ? `${gecici.kod} — ${gecici.kabul_tarihi ? tarih(gecici.kabul_tarihi) : 'tarih yok'}`
        : 'Kesin kabul, onaylı geçici kabul olmadan açılamaz.',
      rota: `/santiyeler/${s.id}/gecici-kabul` },
    { ad: 'Garanti süresi doldu', engel: !!(gecici?.garanti_bitis && gecici.garanti_bitis > simdi()), zorunlu: false,
      not: gecici?.garanti_bitis
        ? `Garanti bitişi: ${tarih(gecici.garanti_bitis)}${gecici.garanti_bitis > simdi() ? ' (henüz dolmadı)' : ''}`
        : 'Geçici kabulde garanti süresi tanımlanmamış.' },
  ];
}

function kabulIslemi(ctx, s, tur, govde, ekranKodu) {
  const eylem = govde._eylem || 'ac';
  const mevcut = tek(
    `SELECT * FROM kabul WHERE santiye_id = ? AND tur = ? ORDER BY olusturuldu DESC LIMIT 1`, s.id, tur);

  if (eylem === 'ac') {
    if (mevcut && !['reddedildi', 'iptal'].includes(mevcut.durum)) {
      throw Cakisma(`Bu şantiyede zaten bir ${tur === 'gecici' ? 'geçici' : 'kesin'} kabul dosyası var (${mevcut.kod}).`);
    }
    const engel = kabulKontrolleri(s, tur).filter((k) => k.zorunlu && k.engel);
    if (engel.length) throw GecisIzinsiz(`Kabul dosyası açılamaz: ${engel.map((k) => k.ad).join(', ')}.`);
    const garantiAy = govde.garantiAy ? Number(govde.garantiAy) : null;
    if (garantiAy != null && (!Number.isInteger(garantiAy) || garantiAy < 0 || garantiAy > 240)) {
      throw DogrulamaHatasi('Garanti süresi 0–240 ay arasında olmalı.', { alanlar: { garantiAy: ['Geçersiz süre.'] } });
    }
    const kabulTarihi = govde.kabulTarihi ? gunBaslangici(govde.kabulTarihi) : simdi();
    islem(() => {
      const kod = sonrakiKod(ctx.tenant.id, 'kabul');
      const id = kimlik('dokuman').replace('doc', 'kbl');
      calistir(`INSERT INTO kabul (id, tenant_id, santiye_id, proje_id, kod, tur, talep_tarihi, kabul_tarihi,
                  komisyon, isveren_temsilcisi, garanti_ay, garanti_bitis, eksik_sayisi, devir_notu,
                  durum, olusturan, olusturuldu)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'taslak', ?,?)`,
        id, ctx.tenant.id, s.id, s.proje_id, kod, tur, simdi(), kabulTarihi,
        govde.komisyon || null, govde.isverenTemsilcisi || null, garantiAy,
        garantiAy ? kabulTarihi + garantiAy * 30 * GUN_MS : null,
        acikPunch(s.id), govde.devirNotu || null, ctx.kullanici.id, simdi());
      audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
        nesne: 'kabul', nesneId: id, eylem: 'olustur', sonraki: { kod, tur, santiye: s.kod } });
    });
    return `${tur === 'gecici' ? 'Geçici' : 'Kesin'} kabul dosyası açıldı`;
  }

  if (!mevcut) throw Bulunamadi('Kabul dosyası bulunamadı.');

  if (eylem === 'onaya_gonder') {
    const engel = kabulKontrolleri(s, tur).filter((k) => k.zorunlu && k.engel);
    if (engel.length) throw GecisIzinsiz(`Kabul onaya gönderilemez: ${engel.map((k) => k.ad).join(', ')}.`);
    islem(() => {
      onayMotoru.onayaGonder(ctx, {
        nesne: 'kabul', nesneId: mevcut.id, nesneKod: mevcut.kod,
        baslik: `${tur === 'gecici' ? 'Geçici' : 'Kesin'} kabul: ${s.ad}`,
        belgeSurum: mevcut.surum, projeId: s.proje_id, santiyeId: s.id, gerekce: govde.gerekce || null,
      });
      gecisYap(ctx, { nesne: 'kabul', tablo: 'kabul', kayit: mevcut, eylem: 'onaya_gonder',
        gerekce: govde.gerekce, ekranKodu });
    });
    return 'Kabul dosyası onaya gönderildi';
  }

  if (['geri_cek', 'iptal_et'].includes(eylem)) {
    gecisYap(ctx, { nesne: 'kabul', tablo: 'kabul', kayit: mevcut, eylem,
      gerekce: govde.gerekce, ekranKodu });
    return 'Kabul dosyası durumu güncellendi';
  }
  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

function kabulSayfasi(ctx, id, tur, ekranKodu, { hata = null, durum = 200, deger = {} } = {}) {
  const e = ekranNesnesi(ekranKodu);
  yetkiZorunlu(ctx, e.yetki);
  const s = santiyeAl(ctx, id);
  const rota = e.rota.replace(':id', s.id);
  const kontroller = kabulKontrolleri(s, tur);
  const engel = kontroller.filter((k) => k.zorunlu && k.engel);
  const dosya = tek(`SELECT * FROM kabul WHERE santiye_id = ? AND tur = ? ORDER BY olusturuldu DESC LIMIT 1`, s.id, tur);
  const gecmis = sorgu(`SELECT * FROM kabul WHERE santiye_id = ? AND tur = ? ORDER BY olusturuldu DESC`, s.id, tur);
  const punchListesi = sorgu(
    `SELECT * FROM punch WHERE santiye_id = ? AND durum NOT IN ('kapali','iptal') ORDER BY olusturuldu LIMIT 10`, s.id);
  const acikOnay = dosya ? tek(
    `SELECT id FROM onay_talebi WHERE nesne = 'kabul' AND nesne_id = ? AND durum = 'acik'`, dosya.id) : null;
  const acilabilir = !dosya || ['reddedildi', 'iptal'].includes(dosya.durum);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${santiyeBasligi(ctx, s)}
<div class="dash-cols">
  <div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>${tur === 'gecici' ? 'Geçici' : 'Kesin'} kabul ön koşulları</b>
        <span>Ön koşullar gerçek kayıttan hesaplanır; engel varken dosya açılmaz.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: kontroller,
    bosDurum: { baslik: 'Kontrol yok' },
    sutunlar: [
      { ad: 'd', etiket: '', govde: (k) => (!k.engel ? B.isaret('tamam', 'ok')
        : k.zorunlu ? B.isaret('engel', 'danger') : B.isaret('uyarı', 'warn')) },
      { ad: 'ad', etiket: 'Ön koşul', govde: (k) => h`<b>${k.ad}</b><br><span class="muted">${k.not}</span>` },
      { ad: 'rota', etiket: '', govde: (k) => (k.rota ? B.btn('Aç', { rota: k.rota, kucuk: true }) : '—') },
    ],
  })}</div>
    </div>
    <div class="gv-card" style="margin-bottom:18px">
      <div class="gc-head"><div class="gc-title"><b>Eksik işler (punch)</b>
        <span>Geçici kabul tutanağının eki; kesin kabulde tamamı kapalı olmalı.</span></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: punchListesi,
    bosDurum: { baslik: 'Açık eksik iş yok', ikon: 'fa-circle-check', aciklama: 'Punch listesi temiz.' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'baslik', etiket: 'Eksik iş', govde: (r) => h`<a href="/kalite/punch"><b>${r.baslik}</b></a>` },
      { ad: 'lokasyon', etiket: 'Lokasyon', govde: (r) => r.lokasyon || '—' },
      { ad: 'son_tarih', etiket: 'Son tarih', govde: (r) => (r.son_tarih ? tarih(r.son_tarih) : '—') },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
    ],
  })}</div>
    </div>
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Kabul dosyaları</b></div></div>
      <div class="gc-body flush">${B.tablo({
    satirlar: gecmis,
    bosDurum: { baslik: 'Kabul dosyası yok', ikon: 'fa-clipboard-check',
      aciklama: 'Ön koşullar tamamlandığında sağdaki formdan dosya açabilirsiniz.' },
    sutunlar: [
      { ad: 'kod', etiket: 'Kod' },
      { ad: 'kabul_tarihi', etiket: 'Kabul tarihi', govde: (r) => (r.kabul_tarihi ? tarih(r.kabul_tarihi) : '—') },
      { ad: 'komisyon', etiket: 'Komisyon', govde: (r) => r.komisyon || '—' },
      { ad: 'eksik_sayisi', etiket: 'Eksik', hizala: 'sag' },
      { ad: 'garanti_bitis', etiket: 'Garanti bitişi', govde: (r) => (r.garanti_bitis ? tarih(r.garanti_bitis) : '—') },
      { ad: 'durum', etiket: 'Durum', govde: (r) => B.rozet(r.durum) },
    ],
  })}</div>
    </div>
  </div>
  <div class="gv-side-stack">
    ${acikOnay ? B.sonucSeridi({ tur: 'warn', baslik: 'Onay süreci açık',
    aciklama: 'Karar verilene kadar dosya değiştirilemez.', kayitRota: `/onaylar/${acikOnay.id}` }) : ''}
    ${dosya && !acilabilir ? h`
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Dosya işlemleri</b>
        <span>Nihai durumu siz seçmezsiniz; onay motoru yazar.</span></div></div>
      <div class="gc-body">
        <dl class="gd-grid" style="border-top:0;padding-top:0;margin-top:0">
          <div><dt>Kod</dt><dd>${dosya.kod}</dd></div>
          <div><dt>Durum</dt><dd>${B.rozet(dosya.durum)}</dd></div>
          <div><dt>Sürüm</dt><dd>${dosya.surum}</dd></div>
        </dl>
        ${yetkiVar(ctx, `${ekranKodu}:olustur`) ? h`
        <form method="post" action="${rota}" data-gform="1">
          ${ham(csrfAlani(ctx))}
          ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe / not', tur: 'metin' })}
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
            ${dosya.durum === 'taslak' || dosya.durum === 'revizyon_istendi'
    ? (engel.length
      ? h`<button class="btn btn-ghost" type="button" disabled><i class="fa-solid fa-ban"></i> Onaya gönder</button>
          <span class="gf-err">${engel.map((k) => k.ad).join(', ')}</span>`
      : h`<button class="btn btn-acc" type="submit" name="_eylem" value="onaya_gonder">
          Onaya gönder <span class="muted">→ onaya gönderildi</span></button>`) : ''}
            ${dosya.durum === 'onaya_gonderildi'
    ? h`<button class="btn btn-ghost" type="submit" name="_eylem" value="geri_cek">
        Onaydan geri çek <span class="muted">→ taslak</span></button>` : ''}
            ${dosya.durum === 'taslak'
    ? h`<button class="btn btn-danger" type="submit" name="_eylem" value="iptal_et">
        Dosyayı iptal et</button>` : ''}
            ${dosya.durum === 'onaylandi'
    ? h`<p class="gf-hint">Kabul onaylandı; tutanak ve karar geçmişi değiştirilemez (kural 6).</p>` : ''}
          </div>
        </form>` : ''}
      </div>
    </div>` : ''}
    ${acilabilir && yetkiVar(ctx, `${ekranKodu}:olustur`) ? h`
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Kabul dosyası aç</b>
        <span>Dosya "taslak" açılır; onayı iş akışı motoru yürütür.</span></div></div>
      <div class="gc-body">
        ${engel.length ? B.sonucSeridi({ tur: 'warn', baslik: `${engel.length} ön koşul eksik`,
    aciklama: engel.map((k) => k.ad).join(', ') }) : ''}
        <form method="post" action="${rota}" data-gform="1">
          ${ham(csrfAlani(ctx))}
          <input type="hidden" name="_eylem" value="ac">
          ${B.alan({ ad: 'kabulTarihi', etiket: 'Kabul tarihi', tur: 'date',
    deger: deger.kabulTarihi || gunAnahtari(simdi()) })}
          ${B.alan({ ad: 'komisyon', etiket: 'Kabul komisyonu', deger: deger.komisyon || '' })}
          ${B.alan({ ad: 'isverenTemsilcisi', etiket: 'İşveren temsilcisi', deger: deger.isverenTemsilcisi || '' })}
          ${tur === 'gecici' ? B.alan({ ad: 'garantiAy', etiket: 'Garanti süresi (ay)', tur: 'number',
    deger: deger.garantiAy ?? '24', ipucu: 'Kesin kabul bu sürenin sonunda yapılır.' }) : ''}
          ${tur === 'kesin' ? B.alan({ ad: 'devirNotu', etiket: 'Devir paketi notu', tur: 'metin',
    deger: deger.devirNotu || '', ipucu: 'Teslim edilen belge, anahtar ve garanti paketleri.' }) : ''}
          <div style="margin-top:12px">${engel.length
    ? h`<button class="btn btn-ghost" type="button" disabled><i class="fa-solid fa-ban"></i> Dosyayı aç</button>`
    : B.btn('Dosyayı aç', { tur: 'acc', gonder: true, ikon: 'fa-plus' })}</div>
        </form>
      </div>
    </div>` : ''}
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: s.kod, baslik: s.ad }));
}

/* ==========================================================================
   SITE-16 — kapatma
   ========================================================================== */
function kapatmaIslemi(ctx, s, govde) {
  const eylem = govde._eylem;

  if (eylem === 'kapanisa_al') {
    gecisYap(ctx, { nesne: 'santiye', tablo: 'santiye', kayit: s, eylem: 'kapanisa_al',
      gerekce: govde.gerekce, ekranKodu: 'SITE-16' });
    return 'Şantiye kapanışa alındı';
  }

  if (eylem === 'onaya_gonder') {
    const kalan = acikKapanisEngelleri(s.id);
    if (kalan.length) {
      throw GecisIzinsiz(`Kapanış onayına gönderilemez — ${kalan.length} engel açık: `
        + `${kalan.slice(0, 5).map((k) => k.ad).join(', ')}.`);
    }
    const acik = tek(
      `SELECT id FROM onay_talebi WHERE nesne = 'santiye_kapanis' AND nesne_id = ? AND durum = 'acik'`, s.id);
    if (acik) throw Cakisma('Bu şantiye için zaten açık bir kapanış onayı var.');
    onayMotoru.onayaGonder(ctx, {
      nesne: 'santiye_kapanis', nesneId: s.id, nesneKod: s.kod,
      baslik: `Şantiye kapanış onayı: ${s.ad}`, belgeSurum: s.surum,
      projeId: s.proje_id, santiyeId: s.id, gerekce: govde.gerekce || null,
    });
    return 'Kapanış onaya gönderildi';
  }

  if (eylem === 'kapat') {
    const onay = tek(
      `SELECT * FROM onay_talebi WHERE nesne = 'santiye_kapanis' AND nesne_id = ?
         AND durum = 'kapali' AND sonuc = 'onaylandi' ORDER BY kapandi DESC LIMIT 1`, s.id);
    if (!onay) throw GecisIzinsiz('Kapanış onayı alınmadan şantiye kapatılamaz.');
    if (Number(onay.belge_surum) !== Number(s.surum)) {
      throw Cakisma(`Kapanış onayı sürüm ${onay.belge_surum} üzerinde verildi; şantiye kaydı sürüm ${s.surum}. `
        + 'Yeniden onaya gönderin.');
    }
    /* Engel kontrolü ayrıca geçiş motorunun ön koşulunda da vardır. */
    gecisYap(ctx, { nesne: 'santiye', tablo: 'santiye', kayit: s, eylem: 'kapat',
      gerekce: govde.gerekce, ekranKodu: 'SITE-16',
      ekAlanlar: { gercek_bitis: s.gercek_bitis ?? simdi() } });
    return 'Şantiye kapatıldı';
  }
  throw DogrulamaHatasi('Bilinmeyen işlem.');
}

function kapatmaSayfasi(ctx, id, { hata = null, durum = 200 } = {}) {
  const e = ekranNesnesi('SITE-16');
  yetkiZorunlu(ctx, e.yetki);
  const s = santiyeAl(ctx, id);
  const engeller = kapanisEngelleri(s.id);
  const kalan = acikKapanisEngelleri(s.id);
  const acikOnay = tek(
    `SELECT * FROM onay_talebi WHERE nesne = 'santiye_kapanis' AND nesne_id = ? AND durum = 'acik'`, s.id);
  const onayliKapanis = tek(
    `SELECT * FROM onay_talebi WHERE nesne = 'santiye_kapanis' AND nesne_id = ?
       AND durum = 'kapali' AND sonuc = 'onaylandi' ORDER BY kapandi DESC LIMIT 1`, s.id);

  const icerik = h`
${hata ? B.hataOzeti(hata) : ''}
${ctx.sorgu.get('islem') ? B.sonucSeridi({ tur: 'ok', baslik: ctx.sorgu.get('islem') }) : ''}
${santiyeBasligi(ctx, s)}
${kalan.length
    ? B.sonucSeridi({ tur: 'warn', baslik: `${kalan.length} kapanış engeli açık`,
      aciklama: 'Doküman §7: engel listesi sıfırlanmadan şantiye "kapalı" duruma geçemez.' })
    : B.sonucSeridi({ tur: 'ok', baslik: 'Kapanış engeli kalmadı',
      aciklama: 'Kapanış onayına gönderilebilir.' })}
<div class="dash-cols">
  <div class="gv-card">
    <div class="gc-head"><div class="gc-title"><b>Kapanış engel listesi</b>
      <span>Sayılar canlı sorgudan gelir; "denetlenmedi" satırları tamamlanmış SAYILMAZ.</span></div></div>
    <div class="gc-body flush">${B.tablo({
    satirlar: engeller,
    bosDurum: { baslik: 'Engel yok' },
    sutunlar: [
      { ad: 'd', etiket: '', govde: (k) => (k.planli ? B.isaret(`${k.planli}'te bağlanacak`, 'danger')
        : (k.adet ?? 0) === 0 ? B.isaret('temiz', 'ok')
        : k.zorunlu ? B.isaret('engel', 'danger') : B.isaret('uyarı', 'warn')) },
      { ad: 'ad', etiket: 'Kalem', govde: (k) => h`<b>${k.ad}</b>${
        k.not ? h`<br><span class="muted">${k.not}</span>` : ''}` },
      { ad: 'adet', etiket: 'Açık', hizala: 'sag', govde: (k) => (k.adet == null ? '—' : sayi(k.adet)) },
      { ad: 'rota', etiket: '', govde: (k) => (k.rota ? B.btn('Aç', { rota: k.rota, kucuk: true }) : '—') },
    ],
  })}</div>
  </div>
  <div class="gv-side-stack">
    <div class="gv-card">
      <div class="gc-head"><div class="gc-title"><b>Kapatma işlemleri</b>
        <span>Kapanış onay zincirinden geçer; "kapalı" durumunu form seçemez.</span></div></div>
      <div class="gc-body">
        ${acikOnay ? B.sonucSeridi({ tur: 'warn', baslik: 'Kapanış onayı bekliyor',
    kayitRota: `/onaylar/${acikOnay.id}`, aciklama: 'Karar verilene kadar kapatma yapılamaz.' }) : ''}
        ${onayliKapanis && s.durum !== 'kapali' ? B.sonucSeridi({ tur: 'ok', baslik: 'Kapanış onaylandı',
    aciklama: `Onay, şantiye kaydının ${onayliKapanis.belge_surum}. sürümü üzerinde verildi.` }) : ''}
        ${s.durum === 'kapali' ? B.sonucSeridi({ tur: 'ok', baslik: 'Şantiye kapalı',
    aciklama: 'Kapanmış şantiyenin temel verisi değiştirilemez; yalnız arşivlenebilir.' }) : ''}
        ${yetkiVar(ctx, 'SITE-16:tamamla') && s.durum !== 'kapali' && s.durum !== 'arsiv' ? h`
        <form method="post" action="/santiyeler/${s.id}/kapat" data-gform="1">
          ${ham(csrfAlani(ctx))}
          ${B.alan({ ad: 'gerekce', etiket: 'Gerekçe', tur: 'metin',
    ipucu: 'Kapatma işleminde gerekçe zorunludur.' })}
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
            ${s.durum === 'aktif'
    ? h`<button class="btn btn-ghost" type="submit" name="_eylem" value="kapanisa_al">
        Kapanışa al <span class="muted">→ kapanışta</span></button>` : ''}
            ${s.durum === 'kapanista' && !acikOnay && !onayliKapanis ? (kalan.length
      ? h`<button class="btn btn-ghost" type="button" disabled>
          <i class="fa-solid fa-ban"></i> Kapanış onayına gönder</button>
          <span class="gf-err">${kalan.length} engel açık.</span>`
      : h`<button class="btn btn-acc" type="submit" name="_eylem" value="onaya_gonder">
          Kapanış onayına gönder</button>`) : ''}
            ${s.durum === 'kapanista' && onayliKapanis
    ? h`<button class="btn btn-acc" type="submit" name="_eylem" value="kapat">
        Şantiyeyi kapat <span class="muted">→ kapalı</span></button>` : ''}
          </div>
        </form>` : ''}
      </div>
    </div>
  </div>
</div>`;
  return html(ctx, durum, ciz(ctx, e, icerik, { kayitEtiketi: s.kod, baslik: s.ad }));
}

/* ==========================================================================
   Onay motoru geri çağrıları
   ========================================================================== */
/** Kabul dosyasının durumunu onay sonucuna göre motor ilerletir. */
export function kabulOnaySonucu(ctx, kabulId, sonuc) {
  const k = tek('SELECT * FROM kabul WHERE id = ?', kabulId);
  if (!k) return;
  const eylem = { onaylandi: 'onayla', reddedildi: 'reddet', revizyon_istendi: 'revizyon_iste' }[sonuc];
  if (!eylem) return;
  if (k.durum === 'onaya_gonderildi') {
    gecisYap(ctx, { nesne: 'kabul', tablo: 'kabul', kayit: k, eylem: 'incelemeye_al', motor: true });
  }
  const guncel = tek('SELECT * FROM kabul WHERE id = ?', kabulId);
  if (guncel.durum !== 'incelemede') return;
  gecisYap(ctx, { nesne: 'kabul', tablo: 'kabul', kayit: guncel, eylem,
    gerekce: `Onay talebi sonucu: ${sonuc}`, motor: true });
}

/**
 * Şantiye kapanış onayı sonuçlandığında: onay YALNIZ izin verir, durumu
 * değiştirmez. Kapatma eylemini yetkili kullanıcı SITE-16'dan tetikler ve
 * o anda engel listesi yeniden doğrulanır (onay ile kapatma arasında yeni
 * engel doğmuş olabilir).
 */
export function santiyeKapanisOnaySonucu(ctx, santiyeId, sonuc) {
  const s = tek('SELECT * FROM santiye WHERE id = ?', santiyeId);
  if (!s) return;
  audit.yaz({ tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
    nesne: 'santiye', nesneId: santiyeId, eylem: `kapanis_onayi:${sonuc}`,
    sonraki: { belgeSurum: s.surum, durum: s.durum } });
}
