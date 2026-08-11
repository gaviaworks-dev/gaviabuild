/* =====================================================================
   İSTEMCİ KATMANI — YALNIZ progressive enhancement
   ---------------------------------------------------------------------
   Burada İŞ KURALI YOKTUR. Rol, yetki, durum, onay ve bakiye kararları
   sunucudadır (değişmez kural 2, 3, 5). localStorage yalnız KİŞİSEL ARAYÜZ
   TERCİHİ için kullanılır (menü katlama gibi) — hiçbir iş kaydı tutmaz.
   JS kapalıyken tüm sayfalar çalışmaya devam eder.
   ===================================================================== */
(function () {
  'use strict';
  var TERCIH = 'gb_arayuz_tercihi';   // yalnız görsel tercih; iş verisi DEĞİL

  function tercihOku() {
    try { return JSON.parse(localStorage.getItem(TERCIH) || '{}'); } catch (e) { return {}; }
  }
  function tercihYaz(t) {
    try { localStorage.setItem(TERCIH, JSON.stringify(t)); } catch (e) { /* özel mod: yok say */ }
  }

  /* ---- 1) Menü katlama (divider grip) ---- */
  var govde = document.body;
  var divider = document.getElementById('gvDivider');
  if (divider) {
    if (tercihOku().menuKapali) govde.classList.add('gv-collapsed');
    divider.addEventListener('click', function () {
      govde.classList.toggle('gv-collapsed');
      var t = tercihOku(); t.menuKapali = govde.classList.contains('gv-collapsed'); tercihYaz(t);
    });
  }

  /* ---- 2) Mobil off-canvas menü ---- */
  var burger = document.getElementById('gvBurger');
  var overlay = document.getElementById('gvOverlay');
  function menuKapat() { govde.classList.remove('nav-open'); }
  if (burger) burger.addEventListener('click', function () { govde.classList.toggle('nav-open'); });
  if (overlay) overlay.addEventListener('click', menuKapat);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') menuKapat(); });

  /* ---- 3) Tablo satırına tıklayınca detaya git (satırda gerçek link de var) ---- */
  document.addEventListener('click', function (e) {
    var tr = e.target.closest && e.target.closest('tr[data-rota]');
    if (!tr || e.target.closest('a,button,input,select,label')) return;
    window.location.href = tr.getAttribute('data-rota');
  });

  /* ---- 4) Sayfa boyutu seçimi → doğrudan URL (JS kapalıyken de link var) ---- */
  document.addEventListener('change', function (e) {
    var s = e.target;
    if (s.matches && s.matches('select[data-git="1"]')) window.location.href = s.value;
  });

  /* ---- 5) Kaydedilmemiş değişiklik uyarısı + çift gönderim engeli (§3.2) ---- */
  document.querySelectorAll('form[data-gform="1"]').forEach(function (f) {
    var kirli = false, gonderiliyor = false;
    f.addEventListener('input', function () { kirli = true; });
    f.addEventListener('submit', function (e) {
      if (gonderiliyor) { e.preventDefault(); return; }   /* çift tık = tek istek */
      gonderiliyor = true; kirli = false;
      f.querySelectorAll('button[type="submit"]').forEach(function (b) {
        b.disabled = true;
        b.dataset.eskiHtml = b.innerHTML;
        b.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Gönderiliyor…';
      });
      /* Sunucu hata döndürürse sayfa yeniden render edilir; buton geri gelir. */
    });
    window.addEventListener('beforeunload', function (e) {
      if (!kirli) return;
      e.preventDefault(); e.returnValue = '';
    });
  });

  /* ---- 6) Hata özetine odaklan (klavye ve ekran okuyucu) ---- */
  var hata = document.getElementById('hataOzeti');
  if (hata) hata.focus();

  /* ---- 7) Yıkıcı eylemlerde onay — sunucu ayrıca gerekçe ister ---- */
  document.addEventListener('submit', function (e) {
    var f = e.target;
    var soru = f.getAttribute && f.getAttribute('data-onay');
    if (soru && !window.confirm(soru)) e.preventDefault();
  }, true);
})();
