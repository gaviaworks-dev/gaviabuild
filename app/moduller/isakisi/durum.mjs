/* ============================================================================
   GEÇİŞ MOTORU — durum değişimini YALNIZ bu modül yapar (doküman §5.2)
   ----------------------------------------------------------------------------
   · Sunucu, mevcut sürüm ve kullanıcının veri kapsamına göre geçişi doğrular.
   · Her geçiş TEK transaction içinde: iş nesnesi + audit + görev/bildirim.
   · `gecikmis` gibi işaretler saklanmaz, HESAPLANIR (yaşam durumu değildir).
   ========================================================================== */
import { tek, calistir, islem, surumluGuncelle } from '../../cekirdek/db.mjs';
import { simdi, gunFarki } from '../../cekirdek/zaman.mjs';
import { GecisIzinsiz, DogrulamaHatasi, YetkiYok, Bulunamadi } from '../../cekirdek/hata.mjs';
import * as audit from '../../cekirdek/audit.mjs';
import { kapsamZorunlu, yetkiVar } from '../kimlik/yetki.mjs';
import { tanim, durumEtiketi } from './durumlar.mjs';
import { bildir } from './bildirim.mjs';

/** Bir kayıt için o kullanıcının GERÇEKTEN yapabileceği geçişler (eylem menüsü). */
export function izinliGecisler(ctx, nesne, kayit, { ekranKodu = null } = {}) {
  const t = tanim(nesne);
  return t.gecisler
    .filter((g) => g.den === kayit.durum)
    .filter((g) => !g.yalnizMotor)
    .filter((g) => !ekranKodu || yetkiVar(ctx, `${ekranKodu}:guncelle`) || yetkiVar(ctx, `${ekranKodu}:karar_ver`))
    .map((g) => ({
      ...g,
      engel: g.onKosul ? g.onKosul(ctx, kayit) : null,
      hedefEtiket: durumEtiketi(nesne, g.e),
    }));
}

/**
 * Durum geçişi uygular.
 * @param {object} ctx
 * @param {{nesne:string, tablo:string, kayit:object, eylem:string, gerekce?:string,
 *          ekAlanlar?:object, motor?:boolean, ekranKodu?:string,
 *          yanEtki?:(ctx, kayit, gecis) => void}} p
 */
export function gecisYap(ctx, p) {
  const { nesne, tablo, kayit, eylem, gerekce = null, ekAlanlar = {}, motor = false, ekranKodu = null } = p;
  const t = tanim(nesne);

  const gecis = t.gecisler.find((g) => g.den === kayit.durum && g.eylem === eylem);
  if (!gecis) {
    const olasi = t.gecisler.filter((g) => g.den === kayit.durum).map((g) => g.eylem).join(', ') || 'yok';
    throw GecisIzinsiz(
      `"${durumEtiketi(nesne, kayit.durum)}" durumundan "${eylem}" yapılamaz. İzinli eylemler: ${olasi}.`);
  }

  /* Motor-özel geçişler dışarıdan tetiklenemez (kullanıcı nihai durumu seçemez). */
  if (gecis.yalnizMotor && !motor) {
    throw YetkiYok('Bu durum değişimini yalnız onay/iş akışı motoru yapabilir.');
  }

  /* Veri kapsamı ve yetki. */
  kapsamZorunlu(ctx, nesne, kayit);
  if (ekranKodu && !motor) {
    const yeterli = yetkiVar(ctx, `${ekranKodu}:guncelle`) || yetkiVar(ctx, `${ekranKodu}:karar_ver`);
    if (!yeterli) throw YetkiYok('Bu kayıtta durum değiştirme yetkiniz yok.');
  }

  /* Dört göz: kendi kaydını doğrulayan/kapatan olamaz. */
  if (gecis.dortGoz && kayit.olusturan && kayit.olusturan === ctx.kullanici.id) {
    throw YetkiYok('Kendi oluşturduğunuz kaydı siz doğrulayamazsınız (dört göz ilkesi).');
  }

  /* Zorunlu gerekçe. */
  if (gecis.gerekce === 'zorunlu' && !String(gerekce || '').trim()) {
    throw DogrulamaHatasi('Bu işlem için gerekçe zorunludur.', { alanlar: { gerekce: ['Gerekçe girin.'] } });
  }

  /* Ön koşul. */
  const engel = gecis.onKosul ? gecis.onKosul(ctx, kayit) : null;
  if (engel) throw GecisIzinsiz(engel);

  return islem(() => {
    const yeniSurum = surumluGuncelle(tablo, kayit.id, kayit.surum,
      { durum: gecis.e, ...ekAlanlar },
      { guncelleyen: ctx.kullanici.id, guncellendi: simdi() });

    audit.yaz({
      tenantId: ctx.tenant.id, kullaniciId: ctx.kullanici.id, istekId: ctx.istekId, ip: ctx.ip,
      nesne, nesneId: kayit.id, eylem: `gecis:${eylem}`, gerekce,
      onceki: { durum: kayit.durum, surum: kayit.surum },
      sonraki: { durum: gecis.e, surum: yeniSurum },
    });

    /* Yan etki: bildirim + varsa çağıranın kendi etkisi. Başarısız yan etki
       transaction'ı geri alır — yarım kalmış geçiş bırakılmaz. */
    if (kayit.sorumlu_id && kayit.sorumlu_id !== ctx.kullanici.id) {
      bildir(ctx, {
        kullaniciId: kayit.sorumlu_id, tur: 'durum_degisti',
        baslik: `${t.etiket} durumu: ${durumEtiketi(nesne, gecis.e)}`,
        govde: `${kayit.kod || kayit.id} — ${gecis.etiket}`,
        nesne, nesneId: kayit.id, onem: gecis.e === 'iptal' ? 'uyari' : 'bilgi',
      });
    }
    if (p.yanEtki) p.yanEtki(ctx, { ...kayit, durum: gecis.e, surum: yeniSurum }, gecis);

    return { durum: gecis.e, surum: yeniSurum, gecis };
  });
}

/* --- Hesaplanan işaretler (§5.2 sağ sütun) ------------------------------ */
/**
 * İşaretler yaşam durumundan AYRI hesaplanır ve SAKLANMAZ.
 * Doküman §1: "gecikme yaşam durumu gibi kullanılıyor → gecikmiş hesaplanan işaret olsun".
 */
export function isaretler(nesne, kayit, { simdiMs = simdi() } = {}) {
  const t = tanim(nesne);
  const cikti = [];
  const bitti = t.sonDurumlar.includes(kayit.durum);

  if (t.isaretler.includes('gecikmis') && kayit.termin && !bitti && kayit.termin < simdiMs) {
    cikti.push({ kod: 'gecikmis', metin: `${gunFarki(kayit.termin, simdiMs)} gün gecikti`, ton: 'danger' });
  }
  if (t.isaretler.includes('sla_riski') && kayit.termin && !bitti) {
    const kalan = gunFarki(simdiMs, kayit.termin);
    if (kalan >= 0 && kalan <= 2) cikti.push({ kod: 'sla_riski', metin: `${kalan} gün kaldı`, ton: 'warn' });
  }
  if (t.isaretler.includes('sla_asildi') && kayit.sla_bitis && !bitti && kayit.sla_bitis < simdiMs) {
    cikti.push({ kod: 'sla_asildi', metin: 'SLA aşıldı', ton: 'danger' });
  }
  if (t.isaretler.includes('bloke') && kayit.bloke) {
    cikti.push({ kod: 'bloke', metin: 'Bloke', ton: 'danger' });
  }
  if (t.isaretler.includes('kritik') && kayit.onem === 'kritik') {
    cikti.push({ kod: 'kritik', metin: 'Kritik', ton: 'danger' });
  }
  if (t.isaretler.includes('suresi_asti') && kayit.onay_sla_bitis && kayit.durum === 'incelemede'
      && kayit.onay_sla_bitis < simdiMs) {
    cikti.push({ kod: 'suresi_asti', metin: 'Onay süresi aşıldı', ton: 'warn' });
  }
  if (t.isaretler.includes('takvimde') && kayit.planlanan_bitis && !bitti && kayit.planlanan_bitis >= simdiMs) {
    cikti.push({ kod: 'takvimde', metin: 'Takvimde', ton: 'ok' });
  }
  if (t.isaretler.includes('kontrol_suresi_doldu') && kayit.kontrol_uyarisi) {
    cikti.push({ kod: 'kontrol_suresi_doldu', metin: 'Periyodik kontrol süresi doldu', ton: 'danger' });
  }
  if (t.isaretler.includes('bakim_zamani') && kayit.bakim_uyarisi) {
    cikti.push({ kod: 'bakim_zamani', metin: 'Bakım zamanı geldi', ton: 'warn' });
  }
  if (t.isaretler.includes('belge_suresi_doldu') && kayit.belge_uyarisi) {
    cikti.push({ kod: 'belge_suresi_doldu', metin: `${kayit.belge_uyarisi} belge süresi doldu`, ton: 'danger' });
  }
  if (t.isaretler.includes('butce_asimi') && kayit.butce_asimi) {
    cikti.push({ kod: 'butce_asimi', metin: 'Bütçe aşımı', ton: 'danger' });
  }
  /* Kart işaretleri (§6.3): son kullanım ve atamasızlık yaşam durumu DEĞİLDİR. */
  if (t.isaretler.includes('son_kullanim_yaklasti') && kayit.son_kullanim && !bitti) {
    const kalan = gunFarki(simdiMs, kayit.son_kullanim);
    if (kalan < 0) cikti.push({ kod: 'son_kullanim_gecti', metin: 'Son kullanım geçti', ton: 'danger' });
    else if (kalan <= 60) cikti.push({ kod: 'son_kullanim_yaklasti', metin: `${kalan} gün kaldı`, ton: 'warn' });
  }
  if (t.isaretler.includes('atamasiz') && kayit.durum === 'aktif' && kayit.atama_sayisi === 0 && !kayit.havuz) {
    cikti.push({ kod: 'atamasiz', metin: 'Atanmamış', ton: 'warn' });
  }
  if (t.isaretler.includes('retry_gerekli') && kayit.teknik_hata_sayisi) {
    cikti.push({ kod: 'retry_gerekli', metin: `${kayit.teknik_hata_sayisi} satır tekrar bekliyor`, ton: 'warn' });
  }
  if (t.isaretler.includes('fark_var') && kayit.fark_minor) {
    cikti.push({ kod: 'fark_var', metin: 'Mutabakat farkı var', ton: 'danger' });
  }
  if (t.isaretler.includes('banka_eslesmedi') && kayit.donduruldu && !kayit.banka_hareket_id) {
    cikti.push({ kod: 'banka_eslesmedi', metin: 'Banka çıkışı eşleşmedi', ton: 'warn' });
  }
  return cikti;
}

/** Bir kaydın durumunu doğrudan yazmaya çalışan kodu erken yakalar. */
export function durumDogrula(nesne, durum) {
  const t = tanim(nesne);
  if (!t.durumlar.includes(durum)) throw DogrulamaHatasi(`Geçersiz durum: ${durum}`);
  return durum;
}
