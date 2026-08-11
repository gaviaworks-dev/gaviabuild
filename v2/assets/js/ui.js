/* =====================================================================
   [ÜRÜN ADI] — PAYLAŞILAN UI PRİMİTİFLERİ (kabuk-bağımsız)
   gvToast · gvConfirm (+ delege yıkıcı-aksiyon onayı) · hesap dropdown ·
   data-demo sim toast'ı · data-export format menüsü (GV_EXPORTERS kayıtlıysa
   gerçek .xlsx/.csv indirme, değilse [MOCK-SİM] toast) ·
   tablo arama + chip filtre yardımcıları ·
   gvChain onay zinciri (timeline + rozet + onayla/reddet/revize aksiyonu) ·
   gvUrlState (?f=&q=&page= URL-state, D17) · gvNotFound kayıt-bulunamadı kartı (D17) ·
   gv-pager sayfalandırma (data-paginate, D17; data-paginate-key namespace, D18) ·
   gv-empty "Filtreleri temizle" (D17) · gvApplyFilters + tbl._gvApply bileşik-motor
   delegasyonu (D18 — çifte-listener bulgusunun kalıcı çözümü).
   V2 REVİZYON — T-CORE: gvExport (çıktı akışı modalı) · gvResult (9 durumlu işlem
   sonuç modalı) · gvHelp (yardım/açıklama modalı) · gvEmpty (yönlendiren boş durum +
   yükleniyor/hata/boş/kayıt durum makinesi) · gvCount (kayıt sayısı özeti, 6 eksen) ·
   gvBulk (seçili kayıt işlemleri barı) · gvBar/gvDonut/gvSpark (bağımlılıksız SVG
   rapor grafikleri) · gvViewSync (gv-desktop-only/gv-mobile-only aria-hidden senkronu).
   Spec: tasks/spec-v2-core.md.
   Ortak çekirdek dosya — değişiklikler tek elden yapılır.
   ===================================================================== */
(function(){
  'use strict';
  if(window.gvToast) return;   /* çift yükleme koruması */

  /* ---- gvToast — köşe geri bildirim ---- */
  window.gvToast = function(msg, opts){
    opts = opts || {};
    var wrap = document.querySelector('.gv-toast-wrap');
    if(!wrap){ wrap = document.createElement('div'); wrap.className = 'gv-toast-wrap'; document.body.appendChild(wrap); }
    var t = document.createElement('div');
    t.className = 'gv-toast ' + (opts.type || 'ok');
    t.setAttribute('role','status');
    var ic = document.createElement('i');
    ic.className = 'fa-solid ' + (opts.icon || (opts.type==='danger' ? 'fa-trash' : opts.type==='info' ? 'fa-circle-info' : 'fa-circle-check'));
    var sp = document.createElement('span'); sp.textContent = msg;
    t.appendChild(ic); t.appendChild(sp); wrap.appendChild(t);
    requestAnimationFrame(function(){ t.classList.add('show'); });
    setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){ t.remove(); }, 260); }, opts.ms || 2600);
  };

  /* ---- gvConfirm — onay modalı ----
     Dalga 1b düzeltme: guard ÖNCEDEN "DOM'da herhangi bir .gv-modal-ov var mı"
     diye bakıyordu — birçok sayfada KALICI/statik .gv-modal-ov elemanları var
     (ör. crm-personel.html #ataModalOv, crm-santiye-detay.html dosya-ekle modalı,
     gizli dursalar bile DOM'da duruyorlar) → gvConfirm o sayfalarda SESSİZCE
     no-op oluyordu (üç ayrı track bağımsız buldu). Guard artık yalnız gvConfirm'in
     KENDİ ürettiği, `data-gv-confirm` işaretli modalı arıyor — sayfa-lokal statik
     overlay'ler artık guard'ı tetiklemiyor; D15'in orijinal amacı (çift/hızlı tık
     üst üste modal açmasın) korunuyor çünkü işaretli modal DOM'dan kaldırılana
     kadar (close() → 220ms sonra .remove()) guard true kalır. ---- */
  window.gvConfirm = function(opts){
    if(document.querySelector('.gv-modal-ov[data-gv-confirm]')) return;
    opts = opts || {};
    var danger = !!opts.danger;
    var ov = document.createElement('div'); ov.className = 'gv-modal-ov'; ov.setAttribute('data-gv-confirm', '');
    var m = document.createElement('div');
    m.className = 'gv-modal' + (danger ? ' danger' : '');
    m.setAttribute('role','dialog'); m.setAttribute('aria-modal','true');
    m.innerHTML = '<div class="gv-modal-ico"><i class="fa-solid ' + (opts.icon || (danger ? 'fa-trash' : 'fa-circle-question')) + '"></i></div>'
      + '<h3></h3><p></p>'
      + '<div class="gv-modal-acts">'
      +   '<button type="button" class="btn btn-ghost btn-sm gv-m-cancel"></button>'
      +   '<button type="button" class="btn btn-sm ' + (danger ? 'btn-danger' : 'btn-acc') + ' gv-m-ok"></button>'
      + '</div>';
    m.querySelector('h3').textContent = opts.title || 'Emin misiniz?';
    m.querySelector('p').textContent = opts.message || '';
    m.querySelector('.gv-m-cancel').textContent = opts.cancel || 'Vazgeç';
    m.querySelector('.gv-m-ok').textContent = opts.ok || 'Onayla';
    ov.appendChild(m); document.body.appendChild(ov);
    requestAnimationFrame(function(){ ov.classList.add('open'); });
    var okBtn = m.querySelector('.gv-m-ok'); okBtn.focus();
    function close(){ ov.classList.remove('open'); setTimeout(function(){ ov.remove(); }, 220); document.removeEventListener('keydown', onKey); }
    function onKey(e){ if(e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', function(e){ if(e.target === ov) close(); });
    m.querySelector('.gv-m-cancel').addEventListener('click', close);
    okBtn.addEventListener('click', function(){ close(); if(opts.onConfirm) opts.onConfirm(); });
  };

  /* ---- delege YIKICI-AKSİYON onayı — sil/iptal/reddet/kaldır/arşivle
     tetikleyicilerini CAPTURE fazında yakalar; onay SONRASI orijinal aksiyon.
     data-no-confirm ile devre dışı.
     Dalga 1b düzeltme: ÖNCEDEN onay sonrası yalnız `el.getAttribute('onclick')`
     stringi yeniden `eval` ediliyordu (`new Function(oc)).call(el)`) — sayfa
     aksiyonunu `addEventListener` ile bağladıysa (inline onclick YOKSA) bu dal
     hiç çalışmıyordu, çünkü ilk tıklama zaten CAPTURE fazında `stopImmediatePropagation`
     ile durduruluyor ve gerçek `addEventListener` handler'ına HİÇ ulaşmıyordu; kullanıcı
     "silindi" toast'ı görüyordu ama gerçek aksiyon SESSİZCE hiç çalışmıyordu (T-B bulgusu).
     Çözüm: onay sonrası orijinal elemanın native `.click()`'i BYPASS işaretiyle yeniden
     tetiklenir — bu, inline onclick'i DE, addEventListener ile bağlı handler'ları DA,
     elemanın varsayılan aksiyonunu (href navigasyonu/form submit) DA aynı native
     event akışıyla çalıştırır; interceptor bu ikinci (replay) tıklamayı BYPASS setinden
     tanıyıp müdahale etmeden bırakır (sonsuz döngü YOK). Inline onclick'i YOKSA (yalnız
     bu durumda — eski davranışla aynı sezgi) jenerik "silindi" toast'ı hâlâ gösterilir;
     addEventListener-only sayfalarda kendi geri bildirimini veren nadir durumlarda çift
     toast riski olabilir — kritikse sayfa `data-no-confirm` ile kendi akışını yazar
     (mevcut kaçış kapısı, DEĞİŞMEDİ). ---- */
  var DESTR = {
    sil:    {ico:'fa-trash',        ok:'Sil',      q:'Silinsin mi?',      fut:'kalıcı olarak silinecek. Bu işlem geri alınamaz.', done:'silindi'},
    iptal:  {ico:'fa-xmark',        ok:'İptal Et', q:'İptal edilsin mi?', fut:'iptal edilecek.',  done:'iptal edildi'},
    reddet: {ico:'fa-xmark',        ok:'Reddet',   q:'Reddedilsin mi?',   fut:'reddedilecek.',    done:'reddedildi'},
    kaldir: {ico:'fa-circle-minus', ok:'Kaldır',   q:'Kaldırılsın mı?',   fut:'kaldırılacak.',    done:'kaldırıldı'},
    arsiv:  {ico:'fa-box-archive',  ok:'Arşivle',  q:'Arşivlensin mi?',   fut:'arşivlenecek.',    done:'arşivlendi'}
  };
  function destrKind(el, txt){
    if(el.querySelector('.fa-trash, .fa-trash-can')) return 'sil';
    if(/(^|\s)İptal Et(\s|$)/.test(txt)) return 'iptal';
    if(/(^|\s)Reddet(\s|$)/.test(txt))   return 'reddet';
    if(/(^|\s)Arşivle(\s|$)/.test(txt))  return 'arsiv';
    if(/(^|\s)(Kaldır|Çıkar)(\s|$)/.test(txt)) return 'kaldir';
    if(/(^|\s)Sil(\s|$)/.test(txt))      return 'sil';
    return null;
  }
  var DESTR_BYPASS_ATTR = 'data-gv-destr-bypass';
  document.addEventListener('click', function(e){
    var el = e.target.closest('button,a'); if(!el) return;
    if(el.hasAttribute(DESTR_BYPASS_ATTR)){ el.removeAttribute(DESTR_BYPASS_ATTR); return; }   /* onay SONRASI replay — tekrar yakalama */
    if(el.closest('.gv-modal')) return;
    if(el.hasAttribute('data-no-confirm')) return;
    if(el.hasAttribute('data-chain-act')) return;   /* onay zinciri kendi modalını açar */
    var txt = (el.textContent || '').replace(/\s+/g,' ').trim();
    var kind = destrKind(el, txt); if(!kind) return;
    var V = DESTR[kind];
    e.preventDefault(); e.stopImmediatePropagation();
    var row = el.closest('tr,li,.gv-card,.act-row,.mod-row');
    var nameEl = row && row.querySelector('.gcell-name,strong,b,h4,td');
    var name = nameEl ? nameEl.textContent.trim().split('\n')[0].trim() : '';
    if(name.length > 48 || name.length < 2 || /^[\d.,₺%]+$/.test(name)) name = '';
    var hadInlineOnclick = !!el.getAttribute('onclick');
    gvConfirm({
      danger:true, icon:V.ico, ok:V.ok, cancel:'Vazgeç',
      title:V.q,
      message: name ? ('“' + name + '” ' + V.fut) : ('Bu kayıt ' + V.fut),
      onConfirm:function(){
        /* native replay: inline onclick + addEventListener + varsayılan aksiyon
           (href navigasyonu/form submit) hepsi AYNI native click akışıyla çalışır */
        el.setAttribute(DESTR_BYPASS_ATTR, '');
        el.click();
        if(!hadInlineOnclick) gvToast(name ? (name + ' ' + V.done) : ('Kayıt ' + V.done), {type:'danger'});
      }
    });
  }, true);

  /* ---- data-demo aksiyonları [MOCK-SİM] — gerçek arka uç gerektiren buton/link
     tıklanınca attribute'taki mesajı toast'lar (ör. data-demo="İndirme hazırlanıyor (demo)") ---- */
  document.addEventListener('click', function(e){
    var el = e.target.closest('[data-demo]'); if(!el) return;
    e.preventDefault();
    gvToast(el.getAttribute('data-demo') || 'Bu işlem bu prototipte simülasyondur (demo).', {type:'info'});
  });

  /* ---- data-export — DIŞA AKTARMA format menüsü ----
     <a data-export="Kasa hareketleri"> → format mini-dropdown. İKİ MOD:
     · Sayfa window.GV_EXPORTERS['<ad>'] kaydettiyse GERÇEK indirme: Excel .xlsx
       (SheetJS, cdnjs'ten tembel yüklenir; yüklenemezse BOM'lu CSV fallback) +
       CSV (BOM + ';' ayraç, TR bölge ayarlı Excel uyumlu). Exporter sözleşmesi:
       fn(fmt) → {file, aoa:[[…]], sheet?, cols?:[genişlik]} — görünen veriden üretir.
     · Exporter'sız sayfalarda [MOCK-SİM] demo toast davranışı aynen sürer.
     Görsel: .gv-pop idiyomu; konum inline fixed (butona demirli — ata elemanın
     position'ına bağımlı DEĞİL, ui.css dokunuşu yok). ---- */
  var EXP_FMT = [
    {ic:'fa-file-excel', lbl:'Excel (.xlsx)', f:'Excel'},
    {ic:'fa-file-pdf',   lbl:'PDF (.pdf)',    f:'PDF'},
    {ic:'fa-file-csv',   lbl:'CSV (.csv)',    f:'CSV'}
  ];
  var EXP_FMT_REAL = [                 /* gerçek indirmede PDF yok — basılı döküm `-cikti.html` ekranlarının işi */
    {ic:'fa-file-excel', lbl:'Excel (.xlsx)', f:'Excel'},
    {ic:'fa-file-csv',   lbl:'CSV (.csv)',    f:'CSV'}
  ];
  /* SheetJS tembel yükleme — yalnız ilk gerçek Excel isteğinde CDN'den gelir (buildless) */
  var XLSX_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  var XLSX_SRI = 'sha512-r22gChDnGvBylk90+2e/ycr3RVrDi8DIOkIGNhJlKfuyQM4tIRAI062MaV8sfjQKYVGjOBaZBOA87z+IhZE9DA==';
  var xlsxProm = null;
  function loadXlsx(){
    if(window.XLSX) return Promise.resolve();
    if(!xlsxProm){
      xlsxProm = new Promise(function(res, rej){
        var s = document.createElement('script');
        s.src = XLSX_SRC; s.integrity = XLSX_SRI;
        s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer';
        s.onload = res;
        s.onerror = function(){ xlsxProm = null; s.remove(); rej(new Error('SheetJS CDN yüklenemedi')); };
        document.head.appendChild(s);
      });
    }
    return xlsxProm;
  }
  function dlBlob(blob, fname){
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
  }
  function aoaToCsv(aoa){
    return '\uFEFF' + aoa.map(function(row){   /* BOM — Excel'in UTF-8'i doğru açması için */
      return row.map(function(c){
        if(typeof c === 'number') return String(c).replace('.', ',');
        var s = c == null ? '' : String(c);
        return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(';');
    }).join('\r\n');
  }
  function csvDownload(data){
    dlBlob(new Blob([aoaToCsv(data.aoa)], {type:'text/csv;charset=utf-8'}), data.file + '.csv');
  }
  function xlsxDownload(data){
    var ws = XLSX.utils.aoa_to_sheet(data.aoa);
    if(data.cols) ws['!cols'] = data.cols.map(function(w){ return {wch:w}; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, data.sheet || 'Rapor');
    XLSX.writeFile(wb, data.file + '.xlsx');
  }
  function runExport(exporter, fmt){
    var data;
    try{ data = exporter(fmt); }catch(err){ console.warn('GV_EXPORTERS:', err); }
    if(!data || !data.aoa || !data.aoa.length){
      gvToast('Dışa aktarılacak kayıt bulunamadı', {type:'info'});
      return;
    }
    if(fmt === 'Excel'){
      loadXlsx().then(function(){
        xlsxDownload(data);
        gvToast(data.file + '.xlsx indirildi', {icon:'fa-file-arrow-down'});
      }).catch(function(){
        csvDownload(data);
        gvToast('Excel kitaplığı yüklenemedi — ' + data.file + '.csv (BOM) indirildi', {type:'info', icon:'fa-file-arrow-down'});
      });
    } else {
      csvDownload(data);
      gvToast(data.file + '.csv indirildi', {icon:'fa-file-arrow-down'});
    }
  }
  var expMenu = null, expBtn = null;
  function expClose(){
    if(!expMenu) return;
    var m = expMenu; expMenu = null;
    m.classList.remove('open');
    if(expBtn){ expBtn.setAttribute('aria-expanded','false'); expBtn = null; }
    setTimeout(function(){ m.remove(); }, 180);
  }
  document.addEventListener('click', function(e){
    if(expMenu && !e.target.closest('.gv-export-pop') && !e.target.closest('[data-export]')) expClose();
  });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') expClose(); });
  /* kaydırmada kapat — 'scroll' DEĞİL wheel/touchmove: programatik/smooth scroll
     (ör. resize sonrası toparlanma) menüyü açılır açılmaz kapatmasın, yalnız kullanıcı niyeti kapatsın */
  document.addEventListener('wheel', function(){ expClose(); }, {passive:true});
  document.addEventListener('touchmove', function(){ expClose(); }, {passive:true});
  document.addEventListener('click', function(e){
    var el = e.target.closest('[data-export]'); if(!el) return;
    e.preventDefault();
    if(expBtn === el){ expClose(); return; }   /* aynı butona tekrar tıklama = kapat */
    expClose();
    var name = (el.getAttribute('data-export') || '').replace(/^1$/, '').trim();
    var exporter = name && window.GV_EXPORTERS && window.GV_EXPORTERS[name];
    var menu = document.createElement('div');
    menu.className = 'gv-pop gv-export-pop';
    var html = '<div class="gp-head"><b>Dışa Aktar</b><span></span></div>';
    (exporter ? EXP_FMT_REAL : EXP_FMT).forEach(function(F){
      html += '<a href="#" data-fmt="' + F.f + '"><i class="fa-solid ' + F.ic + '"></i> ' + F.lbl + '</a>';
    });
    menu.innerHTML = html;
    menu.querySelector('.gp-head span').textContent = name || 'Format seçin (demo)';
    document.body.appendChild(menu);   /* önce ekle: gerçek yükseklik ölçülür (görünmez — .gv-pop opacity:0) */
    var r = el.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.minWidth = '188px';
    menu.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    var h = menu.offsetHeight || 200;
    var top = r.bottom + 8;
    if(top + h > window.innerHeight - 8){            /* aşağı sığmıyor → yukarı dene */
      var upTop = r.top - 8 - h;
      top = upTop >= 8 ? upTop : Math.max(8, window.innerHeight - h - 8);   /* yukarı da sığmazsa viewport'a kelepçele */
    }
    menu.style.top = top + 'px';                     /* tek eksen: inline top, temel .gv-pop top kuralını her dalda ezer */
    menu.querySelectorAll('a[data-fmt]').forEach(function(a){
      a.addEventListener('click', function(ev){
        ev.preventDefault(); ev.stopPropagation();
        var f = a.getAttribute('data-fmt');
        expClose();
        if(exporter) runExport(exporter, f);
        else gvToast((name ? name + ' — ' : '') + f + ' formatında hazırlanıyor (demo)', {type:'info', icon:'fa-file-arrow-down'});
      });
    });
    el.setAttribute('aria-haspopup','true');
    el.setAttribute('aria-expanded','true');
    expBtn = el; expMenu = menu;
    requestAnimationFrame(function(){ menu.classList.add('open'); });
  });

  /* ---- HESAP DROPDOWN — persona çipi (içerik: window.GV_ACCOUNT_ITEMS) ---- */
  function accountMenu(){
    var me = document.querySelector('.gv-me'); if(!me || me.querySelector('.gv-pop')) return;
    var nm = (document.getElementById('gvName') || {}).textContent || 'Hesabım';
    var rl = (document.getElementById('gvRole') || {}).textContent || '';
    me.setAttribute('role','button'); me.setAttribute('tabindex','0');
    me.setAttribute('aria-haspopup','true'); me.setAttribute('aria-expanded','false');
    var items = window.GV_ACCOUNT_ITEMS || [
      {ic:'fa-regular fa-user', lbl:'Profil', href:'crm-ayarlar-profil.html'},
      {div:true},
      {ic:'fa-solid fa-right-from-bracket', lbl:'Çıkış', href:'index.html', danger:true}
    ];
    var menu = document.createElement('div'); menu.className = 'gv-pop';
    var html = '<div class="gp-head"><b></b><span></span></div>';
    items.forEach(function(it){
      if(it.div){ html += '<div class="gp-div"></div>'; return; }
      var cls = it.danger ? ' class="danger"' : '';
      html += '<a' + cls + ' href="' + (it.href || '#') + '"><i class="' + (it.ic || 'fa-solid fa-circle') + '"></i> ' + it.lbl + '</a>';
    });
    menu.innerHTML = html;
    menu.querySelector('b').textContent = nm;
    menu.querySelector('span').textContent = rl;
    me.appendChild(menu);
    function setOpen(o){ menu.classList.toggle('open', o); me.setAttribute('aria-expanded', o ? 'true' : 'false'); }
    me.addEventListener('click', function(e){ if(e.target.closest('.gv-pop')) return; e.stopPropagation(); setOpen(!menu.classList.contains('open')); });
    me.addEventListener('keydown', function(e){
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); setOpen(!menu.classList.contains('open')); }
      else if(e.key === 'Escape') setOpen(false);
    });
    document.addEventListener('click', function(e){ if(!me.contains(e.target)) setOpen(false); });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', accountMenu);
  else accountMenu();

  /* ---- ONAY ZİNCİRİ (gvChain) — kasa/malzeme/izin/avans/hakediş ORTAK primitifi.
     Yeniden YAZILMAZ, çağrılır (sahip: T0).
     1) Timeline: gvChain(el, {steps:[{rol,kisi,durum,tarih,not}, …]})
        veya deklaratif <div data-chain='{"steps":[…]}'></div>
        Adım durumları: olusturdu | onaylandi | reddedildi | revize | bekliyor | sirada | iptal
        reddedildi/revize adımında `not` ZORUNLU (eksikse görsel uyarı + console.warn).
     2) Kayıt rozeti: gvChainBadge('taslak|bekliyor|onaylandi|reddedildi|revize|iptal')
        → .gstat span HTML string'i döner.
     3) Aksiyon: <button data-chain-act="onayla|reddet|revize" data-chain-name="KSA-2026-018">
        veya gvChainAction({kind,name,onDone(note)}) — reddet/revize'de boş açıklama GEÇMEZ. ---- */
  var CHAIN_STEP = {
    olusturdu:  {ico:'fa-paper-plane',    cls:'info',   lbl:'Oluşturdu'},
    onaylandi:  {ico:'fa-check',          cls:'ok',     lbl:'Onayladı'},
    reddedildi: {ico:'fa-xmark',          cls:'danger', lbl:'Reddetti'},
    revize:     {ico:'fa-rotate-left',    cls:'warn',   lbl:'Revize istedi'},
    bekliyor:   {ico:'fa-hourglass-half', cls:'wait',   lbl:'Onay bekliyor'},
    sirada:     {ico:'fa-minus',          cls:'idle',   lbl:'Sırada'},
    iptal:      {ico:'fa-ban',            cls:'off',    lbl:'İptal etti'}
  };
  var CHAIN_STAT = {
    taslak:     {cls:'off',    lbl:'Taslak'},
    bekliyor:   {cls:'wait',   lbl:'Onay bekliyor'},
    onaylandi:  {cls:'ok',     lbl:'Onaylandı'},
    reddedildi: {cls:'danger', lbl:'Reddedildi'},
    revize:     {cls:'warn',   lbl:'Revize istendi'},
    iptal:      {cls:'off',    lbl:'İptal edildi'}
  };
  window.gvChainBadge = function(status){
    var v = CHAIN_STAT[status] || CHAIN_STAT.bekliyor;
    return '<span class="gstat ' + v.cls + '">' + v.lbl + '</span>';
  };
  window.gvChain = function(el, data){
    if(!el || !data || !Array.isArray(data.steps)) return;
    var ol = document.createElement('ol'); ol.className = 'gv-chain';
    data.steps.forEach(function(st){
      var V = CHAIN_STEP[st.durum] || CHAIN_STEP.sirada;
      var li = document.createElement('li');
      li.className = 'chain-step ' + V.cls + (st.durum === 'bekliyor' ? ' is-now' : '');
      var node = document.createElement('span'); node.className = 'cs-node';
      node.innerHTML = '<i class="fa-solid ' + V.ico + '"></i>';
      var body = document.createElement('div'); body.className = 'cs-body';
      var top = document.createElement('div'); top.className = 'cs-top';
      var who = document.createElement('div'); who.className = 'cs-who';
      var nm = document.createElement('b'); nm.textContent = st.kisi || '—';
      var rl = document.createElement('span'); rl.textContent = st.rol || '';
      who.appendChild(nm); who.appendChild(rl);
      var when = document.createElement('div'); when.className = 'cs-when';
      var act = document.createElement('span'); act.className = 'cs-act'; act.textContent = V.lbl;
      when.appendChild(act);
      if(st.tarih){ var dt = document.createElement('span'); dt.className = 'cs-date'; dt.textContent = st.tarih; when.appendChild(dt); }
      top.appendChild(who); top.appendChild(when);
      body.appendChild(top);
      var needsNote = (st.durum === 'reddedildi' || st.durum === 'revize');
      if(st.not || needsNote){
        var note = document.createElement('div');
        note.className = 'cs-note' + (needsNote ? ' ' + V.cls : '');
        note.textContent = st.not || 'Açıklama girilmedi — red/revize adımında açıklama zorunludur.';
        if(needsNote && !st.not) console.warn('gvChain: red/revize adımında `not` zorunlu', st);
        body.appendChild(note);
      }
      li.appendChild(node); li.appendChild(body); ol.appendChild(li);
    });
    el.innerHTML = ''; el.appendChild(ol);
  };
  var CHAIN_ACT = {
    onayla:{ico:'fa-check',       tone:'',       btn:'btn-acc',    title:'Onaylansın mı?',
            fut:'onaylanacak ve bir sonraki onay adımına geçecek.',
            ok:'Onayla',      ph:'Not ekle (isteğe bağlı)',      need:false, done:'onaylandı',            type:'ok'},
    reddet:{ico:'fa-xmark',       tone:'danger', btn:'btn-danger', title:'Reddedilsin mi?',
            fut:'reddedilecek; gerekçe talep sahibine iletilir.',
            ok:'Reddet',      ph:'Red gerekçesi — zorunlu',      need:true,  done:'reddedildi',           type:'danger'},
    revize:{ico:'fa-rotate-left', tone:'warn',   btn:'btn-warn',   title:'Revize istensin mi?',
            fut:'revize için talep sahibine geri gönderilecek.',
            ok:'Revize İste', ph:'Revize açıklaması — zorunlu',  need:true,  done:'için revize istendi',  type:'info'}
  };
  window.gvChainAction = function(opts){
    /* Dalga 1b düzeltme: gvConfirm ile aynı kök sebep/aynı çözüm — bkz yukarıdaki yorum. */
    if(document.querySelector('.gv-modal-ov[data-gv-confirm]')) return;
    opts = opts || {};
    var K = CHAIN_ACT[opts.kind] || CHAIN_ACT.onayla;
    var ov = document.createElement('div'); ov.className = 'gv-modal-ov'; ov.setAttribute('data-gv-confirm', '');
    var m = document.createElement('div');
    m.className = 'gv-modal has-note' + (K.tone ? ' ' + K.tone : '');
    m.setAttribute('role','dialog'); m.setAttribute('aria-modal','true');
    m.innerHTML = '<div class="gv-modal-ico"><i class="fa-solid ' + K.ico + '"></i></div>'
      + '<h3></h3><p></p>'
      + '<textarea class="gv-m-note" rows="3"></textarea>'
      + '<div class="gv-m-err" hidden><i class="fa-solid fa-circle-exclamation"></i> Açıklama zorunludur.</div>'
      + '<div class="gv-modal-acts">'
      +   '<button type="button" class="btn btn-ghost btn-sm gv-m-cancel">Vazgeç</button>'
      +   '<button type="button" class="btn btn-sm ' + K.btn + ' gv-m-ok"></button>'
      + '</div>';
    m.querySelector('h3').textContent = K.title;
    m.querySelector('p').textContent = (opts.name ? ('“' + opts.name + '” ') : 'Bu kayıt ') + K.fut;
    var ta = m.querySelector('.gv-m-note'); ta.placeholder = K.ph;
    m.querySelector('.gv-m-ok').textContent = K.ok;
    ov.appendChild(m); document.body.appendChild(ov);
    requestAnimationFrame(function(){ ov.classList.add('open'); });
    ta.focus();
    function close(){ ov.classList.remove('open'); setTimeout(function(){ ov.remove(); }, 220); document.removeEventListener('keydown', onKey); }
    function onKey(e){ if(e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', function(e){ if(e.target === ov) close(); });
    m.querySelector('.gv-m-cancel').addEventListener('click', close);
    var err = m.querySelector('.gv-m-err');
    ta.addEventListener('input', function(){ if(ta.value.trim()){ err.hidden = true; ta.classList.remove('is-err'); } });
    m.querySelector('.gv-m-ok').addEventListener('click', function(){
      var note = ta.value.trim();
      if(K.need && !note){ err.hidden = false; ta.classList.add('is-err'); ta.focus(); return; }
      close();
      if(opts.onDone) opts.onDone(note);
      else gvToast((opts.name ? ('“' + opts.name + '” ') : 'Kayıt ') + K.done, {type:K.type});
    });
  };
  /* data-chain-act butonları + data-chain deklaratif render */
  document.addEventListener('click', function(e){
    var el = e.target.closest('[data-chain-act]'); if(!el) return;
    e.preventDefault();
    gvChainAction({kind: el.getAttribute('data-chain-act'), name: el.getAttribute('data-chain-name') || ''});
  });
  function wireChains(){
    document.querySelectorAll('[data-chain]').forEach(function(el){
      var raw = el.getAttribute('data-chain'); if(!raw || !raw.trim()) return;
      try{ gvChain(el, JSON.parse(raw)); }
      catch(err){ console.warn('gvChain: data-chain JSON hatalı', el, err); }
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireChains);
  else wireChains();

  /* ---- URL-STATE YARDIMCISI (D17 Y6) — liste durumu ?f=&q=&page= paramlarında
     yaşar; replaceState ile yazılır (history spam yok), yüklemede geri uygulanır.
     Detay sekmeleri #hash idiyomunda sürer (D13). ---- */
  window.gvUrlState = {
    get: function(k){ return new URLSearchParams(location.search).get(k); },
    set: function(obj){
      var p = new URLSearchParams(location.search);
      Object.keys(obj).forEach(function(k){
        var v = obj[k];
        if(v === null || v === undefined || v === '') p.delete(k); else p.set(k, String(v));
      });
      var qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    }
  };

  /* ---- KAYIT BULUNAMADI KARTI (D17 Y7 / DK3) — param-driven detay sayfaları
     TANINMAYAN param değerinde çağırır; parametresiz açılış default kayda düşmeye
     devam eder (ALTIN KURAL — menü linkleri ölü ekrana düşmez).
     gvNotFound({code:'051', tur:'malzeme talebi', listHref, listLbl, defHref, defLbl}) ---- */
  window.gvNotFound = function(opts){
    opts = opts || {};
    var mount = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
    if(!mount) mount = document.querySelector('main.gv-main') || document.body;
    var card = document.createElement('div');
    card.className = 'gv-card gv-notfound';
    card.innerHTML = '<div class="nf-ico"><i class="fa-solid fa-file-circle-question"></i></div>'
      + '<h2>Kayıt bulunamadı</h2><p></p><div class="nf-acts"></div>';
    var p = card.querySelector('p');
    if(opts.code){
      var b = document.createElement('span'); b.className = 'nf-code'; b.textContent = opts.code;
      p.appendChild(document.createTextNode('“'));
      p.appendChild(b);
      p.appendChild(document.createTextNode('” koduna ait bir ' + (opts.tur || 'kayıt')
        + ' bu çalışma alanında yok. Bağlantı eski ya da hatalı olabilir.'));
    } else {
      p.textContent = 'Aradığınız ' + (opts.tur || 'kayıt') + ' bu çalışma alanında yok. Bağlantı eski ya da hatalı olabilir.';
    }
    var acts = card.querySelector('.nf-acts');
    function act(href, lbl, cls, ic){
      if(!href) return;
      var a = document.createElement('a');
      a.className = 'btn ' + cls; a.href = href;
      a.innerHTML = '<i class="fa-solid ' + ic + '"></i> ';
      a.appendChild(document.createTextNode(lbl));
      acts.appendChild(a);
    }
    act(opts.listHref, opts.listLbl || 'Listeye dön', 'btn-acc', 'fa-list');
    act(opts.defHref, opts.defLbl || 'Varsayılan kaydı aç', 'btn-ghost', 'fa-file-lines');
    mount.innerHTML = '';
    mount.appendChild(card);
    document.title = 'Kayıt Bulunamadı — [ÜRÜN ADI]';
  };

  /* ---- SAYFALANDIRMA (gv-pager, D17 Y5 / DK11) ----
     Bağlama: tabloya/konteynere data-paginate="25"; tablo-dışı listede satır kaynağı
     data-paginate-rows="selector". wireTables otomatik kurar; JS-render sayfalar
     satırları bastıktan sonra gvPager(el) çağırabilir (ikinci çağrı = refresh).
     Eksen ayrımı: filtre motoru tr.hidden yazar (mevcut idiyom), pager YALNIZ
     filtre-görünür satırları .gv-pg-hide ile böler — iki mekanizma çakışmaz.
     Sayfa-lokal filtre motoru olan ekranlar filtre sonrası gvPagerRefresh(el) çağırır;
     ui.js applyFilters bunu kendisi yapar. Kurallar (RB §5 statik alt kümesi):
     kayıt ≤ pageSize → pager gizli · filtre değişince page=1 · geçersiz/aşkın ?page →
     son sayfaya kelepçe · toplam kayıt sayacı · ?page= URL'de. D18: aynı sayfada
     birden çok pager için data-paginate-key="defter" → parametre ?page-defter= olur
     (anahtar verilmezse ?page=, tek-listeli sayfalar değişmez). Her refresh'te
     konteyner 'gvpage' CustomEvent yayar (gün-başlıklı listelerin grup başlığı
     senkronu için — ayarlar-log idiyomu). ---- */
  window.gvPager = function(el, opts){
    if(typeof el === 'string') el = document.querySelector(el);
    if(!el) return null;
    if(el._gvPager){ el._gvPager.refresh(); return el._gvPager; }
    opts = opts || {};
    var size = parseInt(el.getAttribute('data-paginate'), 10) || opts.pageSize || 25;
    var pkey = el.getAttribute('data-paginate-key');
    pkey = pkey ? 'page-' + pkey : 'page';
    var rowSel = el.getAttribute('data-paginate-rows') || (el.tagName === 'TABLE' ? 'tbody tr' : ':scope > *');
    var nav = document.createElement('nav');
    nav.className = 'gv-pager'; nav.hidden = true;
    nav.setAttribute('aria-label', 'Sayfalandırma');
    var anchor = el.closest('.gc-body') || el;
    anchor.parentNode.insertBefore(nav, anchor.nextSibling);
    var page = parseInt(gvUrlState.get(pkey), 10) || 1;

    function visRows(){
      /* [v2-Dalga2/LEAD] `.gv-fp-hide` de dışlanır. Üstteki not iki mekanizmanın
         çakışmadığını varsayıyordu: filtre satırı `hidden` ile, pager `.gv-pg-hide`
         ile gizler. Bu, MARKUP-tabanlı `gvFilterPanel` için doğru; ancak config-driven
         `gvFilterDrawer` aynı motoru `.gv-fp-hide` SINIFIYLA sürüyor (bkz. satır ~1082).
         O yolda pager filtrelenmiş satırları saymaya devam ediyor, "N kayıt" sayacı ve
         sayfa bölmesi yanlış çıkıyordu — gelişmiş filtre ile sayfalamayı birlikte
         kullanan her sayfayı etkiliyordu. `.gv-pg-hide` BİLİNÇLİ olarak dışlanmaz:
         onu pager'ın kendisi koyar, sayımın girdisi değil çıktısıdır. */
      return Array.prototype.filter.call(el.querySelectorAll(rowSel), function(r){
        return !r.hidden && !r.classList.contains('gv-fp-hide');
      });
    }
    function pageBtns(pages){
      /* pencereli numara listesi: 1 … p−1 p p+1 … son */
      var set = [1, pages, page - 1, page, page + 1]
        .filter(function(n){ return n >= 1 && n <= pages; })
        .filter(function(n, i, a){ return a.indexOf(n) === i; })
        .sort(function(a, b){ return a - b; });
      var out = [];
      set.forEach(function(n, i){
        if(i && n - set[i - 1] > 1) out.push('gap');
        out.push(n);
      });
      return out;
    }
    function render(total, pages){
      var from = (page - 1) * size + 1, to = Math.min(page * size, total);
      var h = '<span class="pg-count">' + from + '–' + to + ' · ' + total + ' kayıt</span>'
            + '<div class="pg-btns">'
            + '<button type="button" class="pg-btn" data-pg="prev" aria-label="Önceki sayfa"' + (page <= 1 ? ' disabled' : '') + '><i class="fa-solid fa-chevron-left"></i></button>';
      pageBtns(pages).forEach(function(n){
        if(n === 'gap'){ h += '<span class="pg-gap">…</span>'; return; }
        h += '<button type="button" class="pg-num' + (n === page ? ' is-on" aria-current="page"' : '"') + ' data-pg="' + n + '">' + n + '</button>';
      });
      h += '<span class="pg-compact">' + page + ' / ' + pages + '</span>'
         + '<button type="button" class="pg-btn" data-pg="next" aria-label="Sonraki sayfa"' + (page >= pages ? ' disabled' : '') + '><i class="fa-solid fa-chevron-right"></i></button>'
         + '</div>';
      nav.innerHTML = h;
    }
    function refresh(reset){
      if(reset) page = 1;
      var vis = visRows();
      var total = vis.length;
      var pages = Math.max(1, Math.ceil(total / size));
      if(page > pages) page = pages;   /* geçersiz/aşkın sayfa → son sayfa (RB §5) */
      if(page < 1) page = 1;
      vis.forEach(function(r, i){
        r.classList.toggle('gv-pg-hide', i < (page - 1) * size || i >= page * size);
      });
      el.querySelectorAll(rowSel).forEach(function(r){ if(r.hidden) r.classList.remove('gv-pg-hide'); });
      nav.hidden = total <= size;      /* az kayıt → pager kendini gizler (RB §4) */
      if(!nav.hidden) render(total, pages);
      var st = {}; st[pkey] = page > 1 ? page : null;
      gvUrlState.set(st);
      el.dispatchEvent(new CustomEvent('gvpage', { bubbles: true, detail: { page: page, pages: pages, total: total, size: size } }));
    }
    nav.addEventListener('click', function(e){
      var b = e.target.closest('[data-pg]'); if(!b || b.disabled) return;
      var v = b.getAttribute('data-pg');
      var pages = Math.max(1, Math.ceil(visRows().length / size));
      if(v === 'prev') page = Math.max(1, page - 1);
      else if(v === 'next') page = Math.min(pages, page + 1);
      else page = parseInt(v, 10) || 1;
      refresh(false);
      /* sayfa değişiminde liste başına dön (sabit topbar payıyla) */
      var top = (el.closest('.gv-card') || el).getBoundingClientRect().top + window.pageYOffset - 86;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    });
    el._gvPager = { refresh: refresh, el: el, key: pkey };
    refresh(false);
    return el._gvPager;
  };
  window.gvPagerRefresh = function(el, reset){
    if(typeof el === 'string') el = document.querySelector(el);
    if(el && el._gvPager) el._gvPager.refresh(reset !== false);
  };

  /* ---- TABLO YARDIMCILARI (data-attribute ile kendiliğinden bağlanır) ----
     Arama: <input data-table-search="#tbl"> — satır metninde arar.
     Chip filtre: .chip[data-filter="deger"] + tablo satırında data-f="deger";
     "hepsi" değeri tümünü gösterir. İkisi birlikte AND çalışır.
     D17: kullanıcı değişimi ?f=&q= URL-state'ine yazılır; yüklemede geri uygulanır. ---- */
  function wireTables(){
    /* URL → başlangıç durumu (D17 Y6): ?q= arama kutusuna; ?f= YALNIZ birebir eşleşen
       data-filter chip'i varsa ona uygulanır (sayfa-lokal ?f= semantiği olan ekranlar
       — ör. crm-gorev görünümleri — etkilenmez) */
    var uq = gvUrlState.get('q'), uf = gvUrlState.get('f');
    if(uq){
      var inp0 = document.querySelector('input[data-table-search]');
      if(inp0) inp0.value = uq;
    }
    if(uf){
      var chTarget = null;
      try{
        chTarget = document.querySelector('.chip[data-filter="' + (window.CSS && CSS.escape ? CSS.escape(uf) : uf.replace(/"/g, '')) + '"]');
      }catch(_){}
      if(chTarget){
        var grp0 = chTarget.closest('.chips');
        if(grp0){
          grp0.querySelectorAll('.chip').forEach(function(x){ x.classList.remove('is-on'); });
          chTarget.classList.add('is-on');
        }
      }
    }
    document.querySelectorAll('input[data-table-search]').forEach(function(inp){
      var tbl = document.querySelector(inp.getAttribute('data-table-search')); if(!tbl) return;
      inp.addEventListener('input', function(){ applyFilters(tbl, true); });
    });
    document.querySelectorAll('.chip[data-filter]').forEach(function(ch){
      ch.addEventListener('click', function(){
        var grp = ch.closest('.chips');
        grp.querySelectorAll('.chip').forEach(function(x){ x.classList.remove('is-on'); });
        ch.classList.add('is-on');
        var tbl = document.querySelector(grp.getAttribute('data-target') || '.gtable');
        if(tbl) applyFilters(tbl, true);
      });
    });
    /* data-paginate otomatik kurulum — satırlar inline sayfa scriptlerince
       basıldıktan sonra çalışır (DOMContentLoaded) */
    document.querySelectorAll('[data-paginate]').forEach(function(el){ gvPager(el); });
    /* yüklemede ilk uygulama — sayfa scriptinin rol budaması (tr.remove) SONRASI
       sayaç + boş durum senkronlanır (satır gizlemek İÇİN rol budamada tr.hidden
       KULLANMA; bu ilk uygulama onu geri açar — budama tr.remove ile yapılır) */
    document.querySelectorAll('input[data-table-search]').forEach(function(inp){
      var tbl = document.querySelector(inp.getAttribute('data-table-search'));
      if(tbl) applyFilters(tbl);
    });
  }
  function applyFilters(tbl, isChange){
    var card = tbl.closest('.gv-card') || document;
    var inp = card.querySelector('input[data-table-search]');
    var term = inp ? inp.value.trim().toLocaleLowerCase('tr') : '';
    var on = card.querySelector('.chip.is-on[data-filter]');
    var f = on ? on.getAttribute('data-filter') : 'hepsi';
    /* D17: kullanıcı değişimi URL-state'e; filtre değişti → sayfa 1 (RB §5).
       D18: tablonun pager'ı namespace'li anahtar kullanıyorsa KENDİ anahtarı sıfırlanır. */
    if(isChange){
      var st0 = { q: term || null, f: f !== 'hepsi' ? f : null };
      st0[(tbl._gvPager && tbl._gvPager.key) || 'page'] = null;
      gvUrlState.set(st0);
    }
    /* D18 BİLEŞİK-MOTOR DELEGASYONU (çifte-listener bulgusunun kalıcı çözümü):
       çok boyutlu sayfa-lokal filtre motoru olan tablo kendini tbl._gvApply = fn ile
       kaydeder. Bu durumda satır görünürlüğü + boş durum + sayaç TAMAMEN motorundur;
       sayfa kendi arama/chip listener'ı BAĞLAMAZ (ui.js dinler, motora devreder).
       Ekstra boyut kontrolleri (select vb.) gvApplyFilters(tbl, true) çağırır.
       Delegasyonda ge-clear affordance'ı üretilmez — boş durum aksiyonu sayfanındır. */
    if(typeof tbl._gvApply === 'function'){
      tbl._gvApply();
      if(tbl._gvPager) tbl._gvPager.refresh(isChange === true);
      return;
    }
    var shown = 0;
    tbl.querySelectorAll('tbody tr').forEach(function(tr){
      var okF = (f === 'hepsi') || (tr.getAttribute('data-f') === f);
      var okT = !term || tr.textContent.toLocaleLowerCase('tr').indexOf(term) !== -1;
      var show = okF && okT;
      tr.hidden = !show;
      if(show) shown++;
    });
    var empty = card.querySelector('[data-table-empty]');
    if(empty){
      empty.hidden = shown !== 0;
      /* D17 Y13: filtre kaynaklı boş sonuçta "Filtreleri temizle" affordance'ı */
      syncClearBtn(empty, tbl, shown === 0 && (!!term || f !== 'hepsi'));
    }
    /* sayaç kart dışında (.gv-page-head) olabilir — karttan bulunamazsa belgeden.
       Çok tablolu sayfada sayaç KART İÇİNE konmalı. */
    var cnt = card.querySelector('[data-table-count]') || document.querySelector('[data-table-count]');
    if(cnt) cnt.textContent = shown;
    if(tbl._gvPager) tbl._gvPager.refresh(isChange === true);
  }
  window.gvApplyFilters = applyFilters;
  function syncClearBtn(empty, tbl, show){
    var btn = empty.querySelector('.ge-clear');
    if(show && !btn){
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-ghost btn-sm ge-clear';
      btn.innerHTML = '<i class="fa-solid fa-filter-circle-xmark"></i> Filtreleri temizle';
      btn.addEventListener('click', function(){
        var card = tbl.closest('.gv-card') || document;
        var inp = card.querySelector('input[data-table-search]');
        if(inp) inp.value = '';
        var on = card.querySelector('.chip.is-on[data-filter]');
        if(on){
          var grp = on.closest('.chips');
          var hepsi = grp && grp.querySelector('.chip[data-filter="hepsi"]');
          if(hepsi){
            grp.querySelectorAll('.chip').forEach(function(x){ x.classList.remove('is-on'); });
            hepsi.classList.add('is-on');
          }
        }
        applyFilters(tbl, true);
      });
      empty.appendChild(btn);
    }
    if(btn) btn.hidden = !show;
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireTables);
  else wireTables();

  /* ---- D1-T-CSS — YATAY KAYDIRMA İPUCU (§8 açık kalem) ----
     .gv-tabs/.pf-tabs (sayfa-lokal <style>, scrollbar-width:none kullanır — kaydırılabilir
     olduğu HİÇ görünmez) ve .gc-body.flush (geniş .gtable sarmalayıcısı) için gerçek
     scrollWidth/scrollLeft ölçümüne göre kenar ipucu (ui.css .gv-scroll-l/-r). ---- */
  function wireScrollHints(){
    /* [Dalga 2] `.gc-head` EKLENDİ — G-3'ün eksik kalan yatay-kaydırma yarısı ona da
       tükettirildi (bkz. ui.css .gc-head kuralı), dolayısıyla kenar ipucunu da alır. */
    var sel = '.gv-tabs,.pf-tabs,.gc-body.flush,.gv-chipbar,.gc-head';
    function update(el){
      var canL = el.scrollLeft > 3;
      var canR = el.scrollLeft < (el.scrollWidth - el.clientWidth - 3);
      el.classList.toggle('gv-scroll-l', canL);
      el.classList.toggle('gv-scroll-r', canR);
    }
    function scan(){
      document.querySelectorAll(sel).forEach(function(el){
        if(el._gvScrollHintWired) { update(el); return; }
        el._gvScrollHintWired = true;
        el.addEventListener('scroll', function(){ update(el); }, {passive:true});
        update(el);
      });
    }
    scan();
    window.addEventListener('resize', scan);
    window.addEventListener('load', scan);
    /* sayfa-scripti içeriği DOMContentLoaded SONRASI basıyorsa (JS-render tablo/sekme)
       scrollWidth geç netleşir — kısa gecikmeli yeniden tarama */
    setTimeout(scan, 400);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireScrollHints);
  else wireScrollHints();

  /* ---- §8 GERÇEK KÖK SEBEP — düşey fare tekerleğinin yatay konteynere
     "yönlendirilmesi" (D1-T-CSS taban taramasında document.scrollWidth SIFIR
     bulundu — mevcut sayfalar zaten taşmıyor; şikayet edilen "normal fare ile
     kullanırken sayfa sol/sağa kayıyor" DAVRANIŞI, tarayıcının SADECE yatay
     kaydırabilen bir kutuda (overflow-x:auto + dikey kaydırma kapasitesi yok —
     .gv-tabs/.pf-tabs/.gc-body.flush) düşey tekerlek delta'sını otomatik olarak
     yatay kaydırmaya çevirmesinden kaynaklanıyor. scrollbar-width:none bu
     kaymayı GÖRÜNMEZ kılıyor — kullanıcı "sayfa bozuldu" hissediyor.
     Fix: baskın eksen DÜŞEY ise (deltaX ≈ 0, gerçek yatay niyet YOK) olayı
     kapsayıcıya bıraktırma, sayfayı normal kaydır; shift+tekerlek/trackpad
     iki-parmak yatay hareketi (deltaX baskın) DOKUNULMADAN kendi işini görür. ---- */
  document.addEventListener('wheel', function(e){
    if(e.ctrlKey) return;   /* pinch-zoom — müdahale etme */
    var el = e.target.closest('.gv-tabs,.pf-tabs,.gc-body.flush,.gv-chipbar');
    if(!el) return;
    if(el.scrollWidth <= el.clientWidth + 1) return;   /* taşma yoksa yönlendirilecek bir şey yok */
    if(Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;   /* kullanıcı zaten bilerek yatay kaydırıyor */
    e.preventDefault();
    window.scrollBy(0, e.deltaY);
  }, {passive:false});

  /* ============ D1-T-CSS — TARİH ARALIĞI BİLEŞENİ (gvDateRange, §13) ============
     Kısayollar GERÇEK new Date() ile hesaplanır (mock bağlamdaki "bugün 2 Temmuz 2026"
     sabit değildir — üretimde/gerçek tarihte de tutarlı çalışır; sabit "15 gün" kısıtı YOK).
     Deklaratif: <div data-gvdaterange></div> — DOMContentLoaded'da otomatik kurulur.
     İmperatif: gvDateRange(el, {onChange(val), initial:{key}, emptyLabel}) —
     val: {key, from:Date, to:Date, label} | null (temizlendiğinde). ============ */
  var DR_PRESETS = [
    {k:'bugun',    lbl:'Bugün'},
    {k:'dun',      lbl:'Dün'},
    {k:'bu_hafta', lbl:'Bu hafta'},
    {k:'son7',     lbl:'Son 7 gün'},
    {k:'son15',    lbl:'Son 15 gün'},
    {k:'bu_ay',    lbl:'Bu ay'},
    {k:'son30',    lbl:'Son 30 gün'},
    {k:'gecen_ay', lbl:'Geçen ay'},
    {k:'bu_yil',   lbl:'Bu yıl'},
    {k:'ozel',     lbl:'Özel tarih aralığı'}
  ];
  var DR_AY = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  function drFmt(d){ return d.getDate() + ' ' + DR_AY[d.getMonth()] + ' ' + d.getFullYear(); }
  function drStartOfDay(d){ var x = new Date(d); x.setHours(0,0,0,0); return x; }
  function drEndOfDay(d){ var x = new Date(d); x.setHours(23,59,59,999); return x; }
  function drRange(key){
    var today = new Date();
    var s = drStartOfDay(today), e = drEndOfDay(today);
    if(key === 'dun'){
      s = drStartOfDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
      e = drEndOfDay(s);
    } else if(key === 'bu_hafta'){
      var dow = (today.getDay() + 6) % 7;   /* Pazartesi=0 … Pazar=6 (TR hafta başı) */
      s = drStartOfDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - dow));
    } else if(key === 'son7'){
      s = drStartOfDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6));
    } else if(key === 'son15'){
      s = drStartOfDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 14));
    } else if(key === 'bu_ay'){
      s = drStartOfDay(new Date(today.getFullYear(), today.getMonth(), 1));
    } else if(key === 'son30'){
      s = drStartOfDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29));
    } else if(key === 'gecen_ay'){
      s = drStartOfDay(new Date(today.getFullYear(), today.getMonth() - 1, 1));
      e = drEndOfDay(new Date(today.getFullYear(), today.getMonth(), 0));
    } else if(key === 'bu_yil'){
      s = drStartOfDay(new Date(today.getFullYear(), 0, 1));
    }
    return {from:s, to:e};
  }
  window.gvDateRange = function(el, opts){
    if(typeof el === 'string') el = document.querySelector(el);
    if(!el || el._gvDr) return el && el._gvDr;
    opts = opts || {};
    var emptyLabel = opts.emptyLabel || 'Tüm zamanlar';
    el.classList.add('gv-drange');
    el.innerHTML =
      '<button type="button" class="gv-drange-trigger btn btn-ghost btn-sm">'
        + '<i class="fa-solid fa-calendar-days"></i><span class="dr-lbl"></span>'
        + '<i class="fa-solid fa-chevron-down"></i></button>'
      + '<div class="gv-drange-pop gv-pop">'
        + '<div class="dr-presets">' + DR_PRESETS.map(function(p){
            return '<button type="button" class="dr-preset-btn' + (p.k === 'ozel' ? ' dr-ozel' : '') + '" data-dr="' + p.k + '">' + p.lbl + '</button>';
          }).join('') + '</div>'
        + '<div class="dr-custom">'
          + '<div class="gfield"><label>Başlangıç</label><input type="date" class="dr-start"></div>'
          + '<div class="gfield"><label>Bitiş</label><input type="date" class="dr-end"></div>'
        + '</div>'
        + '<div class="dr-foot">'
          + '<button type="button" class="btn btn-ghost btn-sm dr-clear">Temizle</button>'
          + '<button type="button" class="btn btn-acc btn-sm dr-apply">Uygula</button>'
        + '</div>'
      + '</div>';
    var trigger = el.querySelector('.gv-drange-trigger');
    var pop = el.querySelector('.gv-drange-pop');
    var lblEl = el.querySelector('.dr-lbl'); lblEl.textContent = emptyLabel;
    var customWrap = el.querySelector('.dr-custom');
    var startInp = el.querySelector('.dr-start');
    var endInp = el.querySelector('.dr-end');
    var pendingKey = null;

    function iso(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function setOpen(o){ pop.classList.toggle('open', o); trigger.setAttribute('aria-expanded', o ? 'true' : 'false'); }
    trigger.addEventListener('click', function(e){ e.stopPropagation(); setOpen(!pop.classList.contains('open')); });
    document.addEventListener('click', function(e){ if(!el.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') setOpen(false); });

    el.querySelectorAll('[data-dr]').forEach(function(btn){
      btn.addEventListener('click', function(){
        el.querySelectorAll('[data-dr]').forEach(function(b){ b.classList.remove('is-on'); });
        btn.classList.add('is-on');
        pendingKey = btn.getAttribute('data-dr');
        customWrap.classList.toggle('open', pendingKey === 'ozel');
        if(pendingKey === 'ozel' && !startInp.value){
          var r = drRange('son30');
          startInp.value = iso(r.from); endInp.value = iso(r.to);
        }
      });
    });

    function apply(){
      if(!pendingKey) return;
      var val;
      if(pendingKey === 'ozel'){
        if(!startInp.value || !endInp.value) return;
        var s = drStartOfDay(new Date(startInp.value + 'T00:00:00'));
        var e = drEndOfDay(new Date(endInp.value + 'T00:00:00'));
        val = {key:'ozel', from:s, to:e, label: drFmt(s) + ' – ' + drFmt(e)};
      } else {
        var r = drRange(pendingKey);
        var p = DR_PRESETS.filter(function(x){ return x.k === pendingKey; })[0];
        val = {key:pendingKey, from:r.from, to:r.to, label:p.lbl};
      }
      el._gvValue = val;
      lblEl.textContent = val.label;
      trigger.classList.add('is-set');
      setOpen(false);
      el.dispatchEvent(new CustomEvent('gvdaterange', {bubbles:true, detail:val}));
      if(opts.onChange) opts.onChange(val);
    }
    function clear(){
      pendingKey = null;
      el.querySelectorAll('[data-dr]').forEach(function(b){ b.classList.remove('is-on'); });
      customWrap.classList.remove('open');
      startInp.value = ''; endInp.value = '';
      el._gvValue = null;
      lblEl.textContent = emptyLabel;
      trigger.classList.remove('is-set');
      setOpen(false);
      el.dispatchEvent(new CustomEvent('gvdaterange', {bubbles:true, detail:null}));
      if(opts.onChange) opts.onChange(null);
    }
    el.querySelector('.dr-apply').addEventListener('click', apply);
    el.querySelector('.dr-clear').addEventListener('click', clear);

    if(opts.initial && opts.initial.key){
      var ib = el.querySelector('[data-dr="' + opts.initial.key + '"]');
      if(ib){ ib.click(); apply(); }
    }

    el._gvDr = { apply:apply, clear:clear, el:el };
    return el._gvDr;
  };
  function wireDateRanges(){
    document.querySelectorAll('[data-gvdaterange]').forEach(function(el){
      if(!el._gvDr) window.gvDateRange(el);
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireDateRanges);
  else wireDateRanges();

  /* ============================================================================
     PAYLAŞILAN FİLTRE MOTORU (gvFpMakeEngine) — gvFilterPanel (§9, önceki tur,
     markup-tabanlı) VE gvFilterDrawer'ın (§8.3, bu tur, config-driven) ORTAK
     çekirdeğidir. Karar K-167 (tasks/kararlar.md): iki API yüzeyi KALICI olarak
     korunur (27 sayfa `gvFilterPanel.init(panelSel, opts)` ile hand-authored
     markup kullanıyor, migrasyon riskli/gereksiz) ama ARKADA TEK GERÇEK
     UYGULAMA çalışır — doküman §8.1 "tüm liste sayfaları aynı kullanım
     mantığına sahip olmalıdır" hükmü böylece korunur. `gvFilterPanel` MEVCUT
     DOM'u okur/bağlar (`gvFdBindField`), `gvFilterDrawer` kendi DOM'unu `fields`
     config'inden üretir (`gvFdBuildField`, aşağıda) — ikisi de aynı
     `{get,clear,serialize,restore}` sözleşmesini üretip motoru besler. ============ */
  function gvFpFieldLabel(field){
    var lbl = field.getAttribute('data-fp-label');
    if(lbl) return lbl;
    var wrap = field.closest('.gfield');
    var l = wrap && wrap.querySelector('label');
    return l ? l.textContent.trim() : field.getAttribute('data-fp-key');
  }
  function gvFpFieldValueLabel(field){
    if(field.tagName === 'SELECT'){
      var opt = field.options[field.selectedIndex];
      return opt ? opt.textContent.trim() : field.value;
    }
    return field.value;
  }
  /* ---- gvFdBindField — MEVCUT (hand-authored) [data-fp-key] elemanına bağlanır.
     gvFilterPanel'in ESKİ readFilters/resetFields mantığıyla BİREBİR aynı biçim/
     etiket sözleşmesini üretir — 27 sayfanın görünür davranışı DEĞİŞMEZ. ---- */
  function gvFdBindField(el){
    if(el.hasAttribute('data-gvdaterange')){
      return {type:'daterange', api:{
        get: function(){ var v = el._gvValue; if(!v) return null; return {value:v.key, label:gvFpFieldLabel(el) + ': ' + v.label, raw:v}; },
        clear: function(){ if(el._gvDr) el._gvDr.clear(); },
        serialize: function(){
          var v = el._gvValue; if(!v) return null;
          return {key:v.key, from: v.from ? v.from.toISOString() : null, to: v.to ? v.to.toISOString() : null};
        },
        restore: function(v){
          if(!v || !v.key) return;
          if(v.key === 'ozel'){
            var s = el.querySelector('.dr-start'), e = el.querySelector('.dr-end');
            if(s && e && v.from && v.to){
              s.value = v.from.slice(0, 10); e.value = v.to.slice(0, 10);
              var ob = el.querySelector('[data-dr="ozel"]'); if(ob) ob.click();
              var ap = el.querySelector('.dr-apply'); if(ap) ap.click();
            }
          } else {
            var pb = el.querySelector('[data-dr="' + v.key + '"]');
            if(pb){ pb.click(); var ap2 = el.querySelector('.dr-apply'); if(ap2) ap2.click(); }
          }
        }
      }};
    }
    if(el.tagName === 'SELECT'){
      return {type:'select', api:{
        get: function(){ if(!el.value) return null; return {value:el.value, label:gvFpFieldLabel(el) + ': ' + gvFpFieldValueLabel(el), raw:el.value}; },
        clear: function(){ el.value = ''; },
        serialize: function(){ return el.value; },
        restore: function(v){ el.value = v || ''; }
      }};
    }
    if(el.type === 'checkbox'){
      return {type:'toggle', api:{
        get: function(){ return el.checked ? {value:'1', label:gvFpFieldLabel(el)} : null; },
        clear: function(){ el.checked = false; },
        serialize: function(){ return el.checked; },
        restore: function(v){ el.checked = !!v; }
      }};
    }
    return {type:'text', api:{   /* metin/sayı — LEGACY biçim: "Etiket: değer" (tırnak YOK, orijinaliyle birebir) */
      get: function(){ if(!el.value) return null; return {value:el.value, label:gvFpFieldLabel(el) + ': ' + gvFpFieldValueLabel(el), raw:el.value}; },
      clear: function(){ el.value = ''; },
      serialize: function(){ return el.value; },
      restore: function(v){ el.value = v || ''; }
    }};
  }
  /* ---- gvFpMakeEngine — açma/kapama (scroll kilidi + odak tuzağı + ESC/overlay,
     §13.3), Uygula/Temizle/tekil-kaldır, aktif çip render, opsiyonel data-<key>
     tablo süzgeci (daterange sabit `data-tarih` ISO okur — HER İKİ çağıran da
     aynı sözleşmeyi kullanır — 26/27 legacy sayfa zaten `data-fp-key="tarih"`
     kullanıyor; tip-bazlı algılama tek istisnayı da (`fptarih`) doğru sınıflar),
     opsiyonel localStorage kalıcılığı (storeKey verilmezse KAPALI — legacy 27
     sayfanın davranışı DEĞİŞMEZ). setOpen zaten-o-durumdaysa NO-OP (kapalıyken
     "Temizle"ye basmak eski odağı çalıp geri getirmesin). ---- */
  function gvFpMakeEngine(cfg){
    var ov = cfg.ov, panel = cfg.panel, triggers = cfg.triggers || [];
    var fields = cfg.fields || [];   /* [{key,type,api:{get,clear,serialize,restore}}] */
    var chipsRow = cfg.chipsRow, chipsList = cfg.chipsList, clearAllBtn = cfg.clearAllBtn, closeBtn = cfg.closeBtn;
    var table = cfg.table || null, storeKey = cfg.storeKey || null;
    var state = {}, lastFocus = null;

    function onKey(e){
      if(!ov.classList.contains('open')) return;
      if(e.key === 'Escape'){ setOpen(false); return; }
      if(e.key === 'Tab') gvTrapTab(e, panel);
    }
    document.addEventListener('keydown', onKey);
    function setOpen(o){
      var was = ov.classList.contains('open');
      if(o === was) return;   /* idempotent — kapalıyken doClear'ın "yine de kapat" çağrısı odak/scroll-lock yan etkisi ÜRETMEZ */
      ov.classList.toggle('open', o);
      if(o){
        lastFocus = document.activeElement;
        gvScrollLock(true);
        var f0 = panel.querySelector('input,select,button,textarea');
        if(f0) f0.focus();
      } else {
        gvScrollLock(false);
        if(lastFocus && lastFocus.focus) lastFocus.focus();
      }
    }
    triggers.forEach(function(t){ t.addEventListener('click', function(e){ e.preventDefault(); setOpen(true); }); });
    if(closeBtn) closeBtn.addEventListener('click', function(){ setOpen(false); });
    ov.addEventListener('click', function(e){ if(e.target === ov) setOpen(false); });

    function fieldByKey(k){ return fields.filter(function(x){ return x.key === k; })[0]; }
    function readValues(){
      var out = {};
      fields.forEach(function(f){ var v = f.api.get(); if(v != null) out[f.key] = v; });
      return out;
    }
    function applyToTable(){
      if(!table) return;
      var keys = Object.keys(state);
      table.querySelectorAll('tbody tr').forEach(function(row){
        var ok = true;
        keys.forEach(function(k){
          if(!ok) return;
          var f = fieldByKey(k);
          var raw = state[k].raw;
          if(f && f.type === 'daterange'){
            var ds = row.getAttribute('data-tarih');
            if(ds && raw && raw.from){ var d = new Date(ds + 'T00:00:00'); if(d < raw.from || d > raw.to) ok = false; }
            return;
          }
          if(f && f.type === 'numrange'){
            var nv = parseFloat(row.getAttribute('data-' + k));
            if(!isNaN(nv)){
              if(raw.min != null && nv < raw.min) ok = false;
              if(raw.max != null && nv > raw.max) ok = false;
            }
            return;
          }
          if(f && f.type === 'multiselect'){
            var av = row.getAttribute('data-' + k);
            if(av !== null && raw.indexOf(av) === -1) ok = false;
            return;
          }
          var attr = row.getAttribute('data-' + k);   /* select/text/toggle — legacy ile BİREBİR aynı genel eşleşme */
          if(attr !== null && attr !== state[k].value) ok = false;
        });
        if(row.hidden) ok = false;   /* mevcut arama/hızlı-çip filtresiyle AND (D18 delegasyonu olmayan basit tablo) */
        row.classList.toggle('gv-fp-hide', !ok);
      });
      if(window.gvPagerRefresh) window.gvPagerRefresh(table, true);
    }
    function renderChips(){
      var keys = Object.keys(state);
      triggers.forEach(function(t){
        var badge = t.querySelector('.fp-count');
        if(!badge){ badge = document.createElement('span'); badge.className = 'fp-count'; t.appendChild(badge); }
        badge.textContent = keys.length; badge.hidden = !keys.length;
      });
      if(chipsRow) chipsRow.hidden = !keys.length;
      if(!chipsList) return;
      chipsList.innerHTML = '';
      keys.forEach(function(k){
        var chip = document.createElement('span'); chip.className = 'gv-achip';
        var txt = document.createElement('span'); txt.textContent = state[k].label;
        var x = document.createElement('button'); x.type = 'button'; x.className = 'ac-x'; x.setAttribute('data-k', k); x.setAttribute('aria-label', 'Filtreyi kaldır');
        x.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        x.addEventListener('click', function(){ removeOne(k); });
        chip.appendChild(txt); chip.appendChild(x); chipsList.appendChild(chip);
      });
    }
    function persist(){
      if(!storeKey) return;
      try{
        var raw = {};
        Object.keys(state).forEach(function(k){ var f = fieldByKey(k); if(f) raw[k] = f.api.serialize(); });
        localStorage.setItem(storeKey, JSON.stringify(raw));
      }catch(e){}
    }
    function restoreFromStore(){
      if(!storeKey) return;
      var raw; try{ raw = JSON.parse(localStorage.getItem(storeKey) || 'null'); }catch(e){ raw = null; }
      if(!raw) return;
      fields.forEach(function(f){ if(raw[f.key] !== undefined && f.api.restore) f.api.restore(raw[f.key]); });
    }
    function removeOne(k){
      delete state[k];
      var f = fieldByKey(k); if(f) f.api.clear();
      applyToTable(); renderChips(); persist();
      if(cfg.onApply) cfg.onApply(state);
    }
    function doApply(){
      state = readValues();
      applyToTable(); renderChips(); persist();
      setOpen(false);
      if(cfg.onApply) cfg.onApply(state);
    }
    function doClear(){
      fields.forEach(function(f){ f.api.clear(); });
      state = {};
      applyToTable(); renderChips(); persist();
      setOpen(false);
      if(cfg.onClear) cfg.onClear();
      if(cfg.onApply) cfg.onApply(state);
    }
    if(cfg.applyBtn) cfg.applyBtn.addEventListener('click', doApply);
    if(cfg.clearBtn) cfg.clearBtn.addEventListener('click', doClear);
    if(clearAllBtn) clearAllBtn.addEventListener('click', doClear);

    if(storeKey){
      restoreFromStore();
      state = readValues();
      if(Object.keys(state).length){ applyToTable(); renderChips(); }
    }

    return {
      setOpen: setOpen, doApply: doApply, doClear: doClear, removeOne: removeOne,
      state: function(){ return state; },
      refresh: function(){ applyToTable(); renderChips(); }
    };
  }

  /* ============ gvFilterPanel (§9, önceki tur) — MARKUP-TABANLI ============
     HTML iskeleti + sınıf sözleşmesi: tasks/spec-filtre-tarih.md. API DEĞİŞMEDİ
     (27 sayfa çağırıyor) — gövde artık gvFpMakeEngine'e delege eder (K-167).
     gvFilterPanel.init(panelSel, opts):
       opts.table       — '#tblId' (opsiyonel; verilirse satırlar data-<key>="<değer>"
                           ile eşleştirilir; tarih alanı data-tarih="YYYY-MM-DD" ISO okur)
       opts.trigger      — açma butonu seçicisi (opsiyonel, varsayılan [data-fpanel="#panelId"])
       opts.activeRow     — aktif filtre çipi satırı seçicisi (opsiyonel, varsayılan .gv-achips-row)
       opts.onApply(state) — her uygula/temizle/çip-kaldırdıktan SONRA çağrılır (state: {key:{value,label,raw}})
       opts.onClear()      — yalnız Temizle'de çağrılır
     Panel içi alanlar [data-fp-key="..."] taşır (select/input/checkbox veya
     [data-gvdaterange] sarmalayıcı). Footer: [data-fp-apply] / [data-fp-clear].
     Aktif satırdaki toplu temizleme: [data-fp-clear-all]. ============ */
  window.gvFilterPanel = {
    init: function(panelSel, opts){
      var panel = typeof panelSel === 'string' ? document.querySelector(panelSel) : panelSel;
      if(!panel || panel._gvFp) return panel && panel._gvFp;
      opts = opts || {};
      var ov = panel.closest('.gv-fpanel-ov');
      if(!ov){ console.warn('gvFilterPanel: .gv-fpanel-ov sarmalayıcısı bulunamadı', panel); return null; }
      var panelId = panel.id ? '#' + panel.id : null;
      var triggers = Array.prototype.slice.call(document.querySelectorAll(opts.trigger || (panelId ? '[data-fpanel="' + panelId + '"]' : '[data-fpanel]')));
      var activeRow = opts.activeRow ? document.querySelector(opts.activeRow) : document.querySelector('.gv-achips-row');
      var activeList = activeRow ? activeRow.querySelector('.gv-achips') : null;
      var table = opts.table ? document.querySelector(opts.table) : null;
      var closeBtn = panel.querySelector('.gv-fpanel-close');
      var applyBtn = panel.querySelector('[data-fp-apply]');
      var clearBtn = panel.querySelector('[data-fp-clear]');
      var clearAllBtn = activeRow ? activeRow.querySelector('[data-fp-clear-all]') : null;

      var fields = [];
      panel.querySelectorAll('[data-fp-key]').forEach(function(el){
        var bound = gvFdBindField(el);
        fields.push({key: el.getAttribute('data-fp-key'), type: bound.type, api: bound.api});
      });

      var engine = gvFpMakeEngine({
        ov:ov, panel:panel, triggers:triggers, fields:fields,
        chipsRow:activeRow, chipsList:activeList, clearAllBtn:clearAllBtn,
        closeBtn:closeBtn, applyBtn:applyBtn, clearBtn:clearBtn,
        table:table, storeKey:null,   /* legacy: kalıcılık YOK — 27 sayfanın davranışı korunur */
        onApply:opts.onApply, onClear:opts.onClear
      });

      panel._gvFp = { apply:engine.doApply, clear:engine.doClear, state:engine.state, refresh:engine.refresh };
      return panel._gvFp;
    }
  };

  /* ============================================================================
     V3 REVİZYON DALGA 1 (TC) — STANDART LİSTE MİMARİSİ ORTAK BİLEŞENLERİ (§8)
     gvFilterDrawer (§8.3) · gvCols (§8.4) · gvChipBar (§5.3/§13.3, .gv-chipbar
     seçicisi yukarıdaki paylaşılan edge-fade/wheel-redirect altyapısına ZATEN
     eklendi). Sayfalandırma (gvPager) ve boş durum (.gv-empty) ÖNCEKİ turdan
     (D17) hazır — burada tekrar YAZILMADI, doğrudan kullanılır.
     Spec + örnek çağrılar: tasks/spec-liste-mimarisi.md.
     ============================================================================ */

  /* ---- gvScrollLock — sayaçlı body/​html scroll kilidi (§13.3 "modal açıldığında
     body scroll kilidi"). Referans sayacı: iç içe açılan birden çok overlay
     (drawer + confirm modal gibi) erken kilit açmasın. ---- */
  var gvScrollLockCount = 0;
  window.gvScrollLock = function(on){
    if(on){
      gvScrollLockCount++;
      if(gvScrollLockCount === 1) document.documentElement.classList.add('gv-scroll-locked');
    } else {
      gvScrollLockCount = Math.max(0, gvScrollLockCount - 1);
      if(gvScrollLockCount === 0) document.documentElement.classList.remove('gv-scroll-locked');
    }
  };

  /* ---- gvTrapTab — basit odak tuzağı (a11y). Görünür (offsetParent) odaklanabilir
     elemanlar arasında Tab/Shift+Tab döngüsü. ---- */
  function gvTrapTab(e, container){
    var list = container.querySelectorAll('input,select,button,textarea,a[href],[tabindex]:not([tabindex="-1"])');
    list = Array.prototype.filter.call(list, function(el){ return !el.disabled && el.offsetParent !== null; });
    if(!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  }

  /* ============ gvFilterDrawer (§8.3, §14-11) ============
     Config-driven sağ overlay drawer. gvFilterPanel (§9, önceki tur) markup-tabanlıydı;
     bu bileşen HTML iskeletini `fields` konfigürasyonundan KENDİSİ üretir — Dalga 4
     track'leri (şantiye/personel/ajanda) yalnız bir tetikleyici buton + fields dizisi
     yazar. İki bileşen de aynı görsel dili (.gv-fpanel-ov/.gv-fpanel ailesi) paylaşır;
     var olan gvFilterPanel kullanan sayfalar DOKUNULMAZ, taşınmak ZORUNDA değil.
     API + alan tipleri: tasks/spec-liste-mimarisi.md. */
  function gvFdOptions(list){
    return (list || []).map(function(o){ return (typeof o === 'string') ? {v:o, l:o} : o; });
  }
  function gvFdBuildField(f){
    var api;
    var wrap = document.createElement('div');
    if(f.type === 'toggle'){
      wrap.className = 'gv-fd-field gv-fd-toggle-row';
      var lbl = document.createElement('label'); lbl.className = 'gv-toggle';
      var inp = document.createElement('input'); inp.type = 'checkbox';
      var track = document.createElement('span'); track.className = 'tg-track';
      lbl.appendChild(inp); lbl.appendChild(track);
      var txt = document.createElement('span'); txt.className = 'gv-fd-toggle-lbl'; txt.textContent = f.label || '';
      wrap.appendChild(txt); wrap.appendChild(lbl);
      api = {
        get: function(){ return inp.checked ? {value:'1', label:f.label || 'Aktif', raw:true} : null; },
        clear: function(){ inp.checked = false; },
        serialize: function(){ return inp.checked; },
        restore: function(v){ inp.checked = !!v; }
      };
    } else {
      wrap.className = 'gfield full gv-fd-field';
      if(f.label){ var l = document.createElement('label'); l.textContent = f.label; wrap.appendChild(l); }
      if(f.type === 'select'){
        var sel = document.createElement('select');
        var optAll = document.createElement('option'); optAll.value = ''; optAll.textContent = f.allLabel || 'Tümü'; sel.appendChild(optAll);
        gvFdOptions(f.options).forEach(function(o){ var op = document.createElement('option'); op.value = o.v; op.textContent = o.l; sel.appendChild(op); });
        wrap.appendChild(sel);
        api = {
          get: function(){ if(!sel.value) return null; return {value:sel.value, label:f.label + ': ' + sel.options[sel.selectedIndex].textContent, raw:sel.value}; },
          clear: function(){ sel.value = ''; },
          serialize: function(){ return sel.value; },
          restore: function(v){ sel.value = v || ''; }
        };
      } else if(f.type === 'multiselect'){
        var box = document.createElement('div'); box.className = 'gv-fd-chips';
        var opts = gvFdOptions(f.options), btns = {};
        opts.forEach(function(o){
          var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = o.l;
          b.addEventListener('click', function(){ b.classList.toggle('is-on'); });
          box.appendChild(b); btns[o.v] = b;
        });
        wrap.appendChild(box);
        api = {
          get: function(){
            var vals = opts.filter(function(o){ return btns[o.v].classList.contains('is-on'); }).map(function(o){ return o.v; });
            if(!vals.length) return null;
            var lbls = opts.filter(function(o){ return vals.indexOf(o.v) !== -1; }).map(function(o){ return o.l; });
            return {value:vals, label:f.label + ': ' + lbls.join(', '), raw:vals};
          },
          clear: function(){ opts.forEach(function(o){ btns[o.v].classList.remove('is-on'); }); },
          serialize: function(){ return opts.filter(function(o){ return btns[o.v].classList.contains('is-on'); }).map(function(o){ return o.v; }); },
          restore: function(v){ (v || []).forEach(function(vv){ if(btns[vv]) btns[vv].classList.add('is-on'); }); }
        };
      } else if(f.type === 'daterange'){
        var dr = document.createElement('div'); dr.setAttribute('data-gvdaterange', '');
        wrap.appendChild(dr);
        window.gvDateRange(dr, {emptyLabel: f.emptyLabel || 'Tüm zamanlar'});
        api = {
          get: function(){ var v = dr._gvValue; if(!v) return null; return {value:v.key, label:(f.label ? f.label + ': ' : '') + v.label, raw:v}; },
          clear: function(){ if(dr._gvDr) dr._gvDr.clear(); },
          serialize: function(){
            var v = dr._gvValue; if(!v) return null;
            return {key:v.key, from: v.from ? v.from.toISOString() : null, to: v.to ? v.to.toISOString() : null};
          },
          restore: function(v){
            if(!v || !v.key) return;
            if(v.key === 'ozel'){
              var s = dr.querySelector('.dr-start'), e = dr.querySelector('.dr-end');
              if(s && e && v.from && v.to){
                s.value = v.from.slice(0, 10); e.value = v.to.slice(0, 10);
                var ob = dr.querySelector('[data-dr="ozel"]'); if(ob) ob.click();
                var ap = dr.querySelector('.dr-apply'); if(ap) ap.click();
              }
            } else {
              var pb = dr.querySelector('[data-dr="' + v.key + '"]');
              if(pb){ pb.click(); var ap2 = dr.querySelector('.dr-apply'); if(ap2) ap2.click(); }
            }
          }
        };
      } else if(f.type === 'numrange'){
        var row = document.createElement('div'); row.className = 'gv-fd-numrange';
        var mn = document.createElement('input'); mn.type = 'number'; mn.placeholder = 'Min';
        var mx = document.createElement('input'); mx.type = 'number'; mx.placeholder = 'Maks';
        var dash = document.createElement('span'); dash.className = 'gv-fd-dash'; dash.textContent = '–';
        row.appendChild(mn); row.appendChild(dash); row.appendChild(mx);
        wrap.appendChild(row);
        function gvFdFmtN(n){ var s = Number(n).toLocaleString('tr-TR'); return f.prefix ? f.prefix + s : (f.suffix ? s + f.suffix : s); }
        api = {
          get: function(){
            var a = mn.value !== '' ? parseFloat(mn.value) : null, b = mx.value !== '' ? parseFloat(mx.value) : null;
            if(a == null && b == null) return null;
            var lbl = f.label + ': ' + (a != null ? gvFdFmtN(a) : '…') + ' – ' + (b != null ? gvFdFmtN(b) : '…');
            return {value:{min:a, max:b}, label:lbl, raw:{min:a, max:b}};
          },
          clear: function(){ mn.value = ''; mx.value = ''; },
          serialize: function(){ return {min: mn.value === '' ? null : mn.value, max: mx.value === '' ? null : mx.value}; },
          restore: function(v){ if(!v) return; mn.value = v.min != null ? v.min : ''; mx.value = v.max != null ? v.max : ''; }
        };
      } else { /* 'text' — varsayılan */
        var ti = document.createElement('input'); ti.type = 'text'; if(f.placeholder) ti.placeholder = f.placeholder;
        wrap.appendChild(ti);
        api = {
          get: function(){ var v = ti.value.trim(); if(!v) return null; return {value:v, label:f.label + ': “' + v + '”', raw:v}; },
          clear: function(){ ti.value = ''; },
          serialize: function(){ return ti.value; },
          restore: function(v){ ti.value = v || ''; }
        };
      }
    }
    api.el = wrap;
    return api;
  }
  var GV_FD_REG = {}, GV_FD_ALL = [];
  window.gvFilterDrawer = {
    init: function(cfg){
      cfg = cfg || {};
      var trigger = typeof cfg.mount === 'string' ? document.querySelector(cfg.mount) : cfg.mount;
      if(!trigger){ console.warn('gvFilterDrawer: mount bulunamadı', cfg.mount); return null; }
      if(trigger._gvFd) return trigger._gvFd;
      var fieldsCfg = cfg.fields || [];
      var storeKey = cfg.screen ? 'gv_filters_' + cfg.screen : null;
      var table = cfg.table ? document.querySelector(cfg.table) : null;

      var ov = document.createElement('div'); ov.className = 'gv-fpanel-ov gv-fdrawer-ov';
      var panel = document.createElement('aside'); panel.className = 'gv-fpanel gv-fdrawer';
      panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-label', cfg.title || 'Gelişmiş Filtre');
      panel.innerHTML =
          '<div class="gv-fpanel-head"><h3><i class="fa-solid fa-sliders"></i> ' + (cfg.title || 'Gelişmiş Filtre') + '</h3>'
        + '<button type="button" class="gv-fpanel-close" aria-label="Kapat"><i class="fa-solid fa-xmark"></i></button></div>'
        + '<div class="gv-fpanel-body"></div>'
        + '<div class="gv-fpanel-foot">'
        +   '<button type="button" class="btn btn-ghost btn-sm gv-fd-clear">Filtreleri Temizle</button>'
        +   '<button type="button" class="btn btn-acc btn-sm gv-fd-apply">Uygula</button>'
        + '</div>';
      ov.appendChild(panel); document.body.appendChild(ov);
      var body = panel.querySelector('.gv-fpanel-body');
      var fields = fieldsCfg.map(function(f){
        var w = gvFdBuildField(f);   /* w = {get,clear,serialize,restore,el} — aynı zamanda "api" sözleşmesi */
        body.appendChild(w.el);
        return {key:f.key, type:f.type, api:w};
      });

      var chipsRow = cfg.chipsMount ? document.querySelector(cfg.chipsMount) : null;
      if(!chipsRow){
        chipsRow = document.createElement('div'); chipsRow.className = 'gv-achips-row'; chipsRow.hidden = true;
        chipsRow.innerHTML = '<div class="gv-achips"></div><div class="gv-achips-acts">'
          + '<button type="button" class="btn btn-ghost btn-sm gv-fd-clear-all"><i class="fa-solid fa-filter-circle-xmark"></i> Filtreleri Temizle</button></div>';
        var bar = trigger.closest('.filter-bar');
        if(bar && bar.parentNode) bar.parentNode.insertBefore(chipsRow, bar.nextSibling);
        else trigger.parentNode.insertBefore(chipsRow, trigger.nextSibling);
      } else {
        chipsRow.classList.add('gv-achips-row');
        if(!chipsRow.querySelector('.gv-achips')){ var d0 = document.createElement('div'); d0.className = 'gv-achips'; chipsRow.appendChild(d0); }
      }
      var chipsList = chipsRow.querySelector('.gv-achips');
      var clearAllBtn = chipsRow.querySelector('.gv-fd-clear-all');

      var engine = gvFpMakeEngine({
        ov:ov, panel:panel, triggers:[trigger], fields:fields,
        chipsRow:chipsRow, chipsList:chipsList, clearAllBtn:clearAllBtn,
        closeBtn: panel.querySelector('.gv-fpanel-close'),
        applyBtn: panel.querySelector('.gv-fd-apply'), clearBtn: panel.querySelector('.gv-fd-clear'),
        table:table, storeKey:storeKey,
        onApply:cfg.onApply, onClear:null
      });

      var handle = {
        open: function(){ engine.setOpen(true); }, close: function(){ engine.setOpen(false); }, clear: engine.doClear,
        values: engine.state, el: panel
      };
      trigger._gvFd = handle;
      if(cfg.screen) GV_FD_REG[cfg.screen] = handle;
      if(typeof cfg.mount === 'string') GV_FD_REG[cfg.mount] = handle;
      GV_FD_ALL.push(handle);
      return handle;
    },
    open: function(key){
      var h = key ? GV_FD_REG[key] : null;
      if(!h && GV_FD_ALL.length) h = GV_FD_ALL[GV_FD_ALL.length - 1];
      if(h) h.open(); else console.warn('gvFilterDrawer.open: örnek bulunamadı', key);
    }
  };

  /* ============ gvCols (§8.4, §14-9) ============
     Kolon göster/gizle + sıra + "Varsayılana dön", kullanıcı tercihi localStorage'da.
     roleHidden'daki kolonlar aktif rolde HİÇ görünmez (seçicide de yer almaz).
     Tablo <th>/<td> `data-col="<key>"` ile eşleşir; data-col TAŞIMAYAN hücreler
     (ör. sondaki işlem sütunu) sıra/gizlemeye dahil edilmez, yerinde sabit kalır. */
  window.gvCols = {
    init: function(cfg){
      cfg = cfg || {};
      var trigger = typeof cfg.mount === 'string' ? document.querySelector(cfg.mount) : cfg.mount;
      var table = typeof cfg.table === 'string' ? document.querySelector(cfg.table) : cfg.table;
      if(!trigger || !table){ console.warn('gvCols: mount/table bulunamadı', cfg); return null; }
      if(trigger._gvCols) return trigger._gvCols;
      var defs = cfg.cols || [];
      var storeKey = cfg.screen ? 'gv_cols_' + cfg.screen : null;
      /* V3A — adlandırılmış görünüm (§4.4 madde 5). Yalnız `cfg.screen` verilmişse
         çalışır (namespace şart); ekransız kullanım eskisi gibi tek örtük tercihte kalır. */
      var viewsKey = cfg.screen ? 'gv_colviews_' + cfg.screen : null;
      var role = null; try{ role = localStorage.getItem('gv_crm_role'); }catch(e){}
      var visibleDefs = defs.filter(function(c){ return !c.roleHidden || c.roleHidden.indexOf(role) === -1; });
      var defOrder = visibleDefs.map(function(c){ return c.key; });
      var defHidden = visibleDefs.filter(function(c){ return c.def === false; }).map(function(c){ return c.key; });
      var forcedHidden = defs.filter(function(c){ return c.roleHidden && c.roleHidden.indexOf(role) !== -1; }).map(function(c){ return c.key; });

      function load(){
        var base = {order:defOrder.slice(), hidden:defHidden.slice()};
        if(!storeKey) return base;
        var raw; try{ raw = JSON.parse(localStorage.getItem(storeKey) || 'null'); }catch(e){ raw = null; }
        if(!raw) return base;
        var order = (raw.order || []).filter(function(k){ return defOrder.indexOf(k) !== -1; });
        defOrder.forEach(function(k){ if(order.indexOf(k) === -1) order.push(k); });
        var hidden = (raw.hidden || []).filter(function(k){ return defOrder.indexOf(k) !== -1; });
        return {order:order, hidden:hidden};
      }
      function save(){ if(storeKey){ try{ localStorage.setItem(storeKey, JSON.stringify(state)); }catch(e){} } }
      var state = load();
      /* V3A — adlandırılmış görünümler deposu: {"<isim>": {order:[...], hidden:[...]}} */
      function loadViews(){
        if(!viewsKey) return {};
        var raw; try{ raw = JSON.parse(localStorage.getItem(viewsKey) || 'null'); }catch(e){ raw = null; }
        return raw && typeof raw === 'object' ? raw : {};
      }
      function saveViews(v){ if(viewsKey){ try{ localStorage.setItem(viewsKey, JSON.stringify(v)); }catch(e){} } }
      var views = loadViews();

      function cellsFor(key){ return table.querySelectorAll('[data-col="' + key + '"]'); }
      function reorderRows(){
        var rows = table.querySelectorAll('tr');
        rows.forEach(function(row){
          var cells = Array.prototype.slice.call(row.children);
          var map = {}, firstIdx = -1;
          cells.forEach(function(c, i){ var k = c.getAttribute('data-col'); if(k){ map[k] = c; if(firstIdx === -1) firstIdx = i; } });
          if(firstIdx === -1) return;
          var ref = cells[firstIdx].previousElementSibling;
          state.order.forEach(function(k){
            var cell = map[k]; if(!cell) return;
            row.insertBefore(cell, ref ? ref.nextSibling : row.firstChild);
            ref = cell;
          });
        });
      }
      function applyVisibility(){
        defs.forEach(function(c){
          var hide = forcedHidden.indexOf(c.key) !== -1 || state.hidden.indexOf(c.key) !== -1;
          cellsFor(c.key).forEach(function(cell){ cell.style.display = hide ? 'none' : ''; });
        });
      }
      function apply(){ reorderRows(); applyVisibility(); save(); }

      var menu = null;
      function onDoc(e){
        if(!menu) return;
        /* Not: e.target canlı DOM'da kontrol edilmez — sıra değiştir sonrası liste
           yeniden çizilirken (draw()) tıklanan buton DOM'dan sökülüyor; sökülmüş
           düğümde closest()/contains() canlı ağaç bağını kaybettiği için "dışarı
           tıklama" sanılıp popover yanlışlıkla kapanıyordu. composedPath() dispatch
           anında sabitlendiğinden sonraki DOM mutasyonundan etkilenmez. */
        if(typeof e.composedPath === 'function'){
          var path = e.composedPath();
          if(path.indexOf(menu) !== -1 || path.indexOf(trigger) !== -1) return;
        } else if(e.target.closest('.gv-colpop') || e.target === trigger || trigger.contains(e.target)){
          return;
        }
        closeMenu();
      }
      function closeMenu(){
        if(!menu) return; var m = menu; menu = null;
        m.classList.remove('open'); setTimeout(function(){ m.remove(); }, 160);
        document.removeEventListener('click', onDoc);
      }
      function openMenu(){
        if(menu) return;
        menu = document.createElement('div'); menu.className = 'gv-pop gv-colpop';
        /* V3A — adlandırılmış görünüm bloğu (§4.4 madde 5): yalnız cfg.screen
           verilmişse render edilir (viewsKey null ise bölüm hiç eklenmez). */
        var viewsHtml = '';
        if(viewsKey){
          viewsHtml = '<div class="gcol-views"><div class="gcol-views-lbl">Kayıtlı Görünümler</div>'
            + '<div class="gcol-views-list"></div>'
            + '<div class="gcol-save-row">'
            +   '<input type="text" class="gcol-save-input" placeholder="Görünüm adı" maxlength="40" aria-label="Görünüm adı">'
            +   '<button type="button" class="gcol-save-go" aria-label="Görünümü kaydet" disabled><i class="fa-solid fa-floppy-disk"></i></button>'
            + '</div></div>';
        }
        menu.innerHTML = '<div class="gp-head"><b>Kolonlar</b><span>Göster / sırala</span></div>'
          + viewsHtml
          + '<div class="gcol-list"></div>'
          + '<div class="gcol-foot"><button type="button" class="btn btn-ghost btn-sm gcol-reset">Varsayılana Dön</button></div>';
        document.body.appendChild(menu);
        var list = menu.querySelector('.gcol-list');
        /* Sıra değiştirme sonrası draw() tüm satırları yeniden yaratır (innerHTML=''),
           bu yüzden odak taşınan kolonun yeni konumundaki eş butona (mümkünse aynı
           yön) elle geri verilir — klavyeyle art arda Yukarı/Aşağı basılabilsin. */
        function focusMove(key, dir){
          var idx = state.order.indexOf(key);
          var rowEl = list.children[idx];
          if(!rowEl) return;
          var btn = rowEl.querySelector('[data-dir="' + dir + '"]');
          if(!btn || btn.disabled){
            var alt = rowEl.querySelector('[data-dir="' + (dir === 'up' ? 'down' : 'up') + '"]');
            btn = (alt && !alt.disabled) ? alt : null;
          }
          if(!btn) btn = rowEl.querySelector('input');
          if(btn) btn.focus();
          if(rowEl.scrollIntoView) rowEl.scrollIntoView({block: 'nearest'});
        }
        function draw(){
          list.innerHTML = '';
          state.order.forEach(function(k, i){
            var c = visibleDefs.filter(function(x){ return x.key === k; })[0]; if(!c) return;
            var hidden = state.hidden.indexOf(k) !== -1;
            var row = document.createElement('div'); row.className = 'gcol-row';
            row.innerHTML =
                '<button type="button" class="gcol-mv" data-dir="up" aria-label="Yukarı taşı"' + (i === 0 ? ' disabled' : '') + '><i class="fa-solid fa-chevron-up"></i></button>'
              + '<button type="button" class="gcol-mv" data-dir="down" aria-label="Aşağı taşı"' + (i === state.order.length - 1 ? ' disabled' : '') + '><i class="fa-solid fa-chevron-down"></i></button>'
              + '<label class="gcol-chk"><input type="checkbox"' + (hidden ? '' : ' checked') + '><span>' + c.lbl + '</span></label>';
            row.querySelector('[data-dir="up"]').addEventListener('click', function(){
              if(i > 0){ var t = state.order[i - 1]; state.order[i - 1] = state.order[i]; state.order[i] = t; apply(); draw(); focusMove(k, 'up'); }
            });
            row.querySelector('[data-dir="down"]').addEventListener('click', function(){
              if(i < state.order.length - 1){ var t = state.order[i + 1]; state.order[i + 1] = state.order[i]; state.order[i] = t; apply(); draw(); focusMove(k, 'down'); }
            });
            row.querySelector('input').addEventListener('change', function(e){
              var idx = state.hidden.indexOf(k);
              if(e.target.checked){ if(idx !== -1) state.hidden.splice(idx, 1); }
              else if(idx === -1) state.hidden.push(k);
              apply();
            });
            list.appendChild(row);
          });
        }
        draw();
        menu.querySelector('.gcol-reset').addEventListener('click', function(){
          state = {order:defOrder.slice(), hidden:defHidden.slice()};
          apply(); draw();
        });
        if(viewsKey){
          var viewsList = menu.querySelector('.gcol-views-list');
          var saveInp = menu.querySelector('.gcol-save-input');
          var saveGo = menu.querySelector('.gcol-save-go');
          function drawViews(){
            viewsList.innerHTML = '';
            Object.keys(views).forEach(function(name){
              var row = document.createElement('div'); row.className = 'gcol-view-row';
              var b = document.createElement('button'); b.type = 'button'; b.className = 'gcol-view-btn'; b.textContent = name;
              b.addEventListener('click', function(){
                var v = views[name]; if(!v) return;
                var order = (v.order || []).filter(function(k){ return defOrder.indexOf(k) !== -1; });
                defOrder.forEach(function(k){ if(order.indexOf(k) === -1) order.push(k); });
                var hidden = (v.hidden || []).filter(function(k){ return defOrder.indexOf(k) !== -1; });
                state = {order:order, hidden:hidden};
                apply(); draw(); drawViews();
              });
              var del = document.createElement('button'); del.type = 'button'; del.className = 'gcol-view-del';
              del.setAttribute('aria-label', '"' + name + '" görünümünü sil');
              del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
              del.addEventListener('click', function(e){
                e.stopPropagation();
                delete views[name]; saveViews(views); drawViews();
              });
              row.appendChild(b); row.appendChild(del); viewsList.appendChild(row);
            });
          }
          drawViews();
          saveInp.addEventListener('input', function(){ saveGo.disabled = !saveInp.value.trim(); });
          saveInp.addEventListener('keydown', function(e){ if(e.key === 'Enter' && !saveGo.disabled) saveGo.click(); });
          saveGo.addEventListener('click', function(){
            var name = saveInp.value.trim(); if(!name) return;
            views[name] = {order:state.order.slice(), hidden:state.hidden.slice()};
            saveViews(views);
            saveInp.value = ''; saveGo.disabled = true;
            drawViews();
          });
        }
        var r = trigger.getBoundingClientRect();
        menu.style.position = 'fixed'; menu.style.minWidth = '240px';
        menu.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
        menu.style.top = (r.bottom + 8) + 'px';
        requestAnimationFrame(function(){ menu.classList.add('open'); });
        document.addEventListener('click', onDoc);
        document.addEventListener('keydown', function esc(e){ if(e.key === 'Escape'){ closeMenu(); document.removeEventListener('keydown', esc); } });
      }
      trigger.addEventListener('click', function(e){ e.preventDefault(); if(menu) closeMenu(); else openMenu(); });

      apply();
      var handle = {
        apply: apply,
        reset: function(){ state = {order:defOrder.slice(), hidden:defHidden.slice()}; apply(); },
        state: function(){ return state; }
      };
      trigger._gvCols = handle;
      return handle;
    }
  };

  /* ============ gvChipBar (§5.3, §6.2, §7.2, §13.3) ============
     `.gv-chipbar` zaten yukarıdaki paylaşılan edge-fade + dikey-tekerlek-yönlendirme
     seçicilerine eklendi (bkz. `sel`/wheel listener) — burada YALNIZ ok butonları +
     klavye gezinme + aktif chip'e otomatik kaydırma eklenir. Chip tıklama/filtre
     davranışı zaten wireTables()'ın `.chip[data-filter]`+`.chips` delegasyonundan
     GELİR (`.gv-chipbar` aynı zamanda `.chips` taşır) — tekrar YAZILMAZ. */
  window.gvChipBar = {
    init: function(sel){
      var wraps = typeof sel === 'string' ? document.querySelectorAll(sel)
        : (sel ? [sel] : document.querySelectorAll('[data-chipbar]'));
      Array.prototype.forEach.call(wraps, function(wrap){
        if(wrap._gvCb) return;
        /* [G-3] `.kpi-rail` de geçerli bir iz — KPI şeridi aynı kaydırma/ok/kenar-solması
           motorunu tüketir, ayrı bir primitif yazılmadı. */
        var track = wrap.classList && (wrap.classList.contains('gv-chipbar') || wrap.classList.contains('kpi-rail')) ? wrap
          : (wrap.querySelector('.gv-chipbar') || wrap.querySelector('.kpi-rail'));
        if(!track) return;
        var prev = wrap.querySelector('.cb-prev'), next = wrap.querySelector('.cb-next');
        track._gvScrollHintWired = true;   /* wireScrollHints ile çifte 'scroll' bağlama olmasın */
        function update(){
          var canL = track.scrollLeft > 3;
          var canR = track.scrollLeft < (track.scrollWidth - track.clientWidth - 3);
          track.classList.toggle('gv-scroll-l', canL);
          track.classList.toggle('gv-scroll-r', canR);
          var can = track.scrollWidth > track.clientWidth + 3;
          if(prev) prev.hidden = !(can && canL);
          if(next) next.hidden = !(can && canR);
        }
        track.addEventListener('scroll', update, {passive:true});
        window.addEventListener('resize', update);
        setTimeout(update, 300);
        update();
        if(prev) prev.addEventListener('click', function(){ track.scrollBy({left:-track.clientWidth * .7, behavior:'smooth'}); });
        if(next) next.addEventListener('click', function(){ track.scrollBy({left:track.clientWidth * .7, behavior:'smooth'}); });
        track.addEventListener('keydown', function(e){
          var chips = Array.prototype.slice.call(track.querySelectorAll('.chip'));
          var i = chips.indexOf(document.activeElement);
          if(i === -1) return;
          if(e.key === 'ArrowRight' && chips[i + 1]){ e.preventDefault(); chips[i + 1].focus(); }
          else if(e.key === 'ArrowLeft' && chips[i - 1]){ e.preventDefault(); chips[i - 1].focus(); }
          else if(e.key === 'Home'){ e.preventDefault(); chips[0].focus(); }
          else if(e.key === 'End'){ e.preventDefault(); chips[chips.length - 1].focus(); }
        });
        track.addEventListener('click', function(e){
          var chip = e.target.closest('.chip'); if(!chip) return;
          chip.scrollIntoView({block:'nearest', inline:'nearest', behavior:'smooth'});
        });
        wrap._gvCb = {update:update, el:wrap};
      });
    }
  };
  function wireChipBars(){ window.gvChipBar.init(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireChipBars);
  else wireChipBars();

  /* =====================================================================
     V2 REVİZYON — T-CORE (§6/§8/§9 primitifleri)
     gvExport · gvResult · gvHelp · gvEmpty · gvCount · gvBulk ·
     gvBar/gvDonut/gvSpark · gvViewSync/gvEllipSync.
     API dokümanı + kullanım örnekleri: tasks/spec-v2-core.md — sonraki dalgalar
     BU dosyayı okuyup tüketir.
     ===================================================================== */

  /* ---- ortak küçük yardımcılar ---- */
  function gvEscHtml(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function gvFmtNum(n){ var v = Number(n); return isNaN(v) ? String(n) : v.toLocaleString('tr-TR'); }

  /* ============================================================================
     gvResult — 9 kanonik durumlu İŞLEM SONUÇ modalı (B §9.4). Kullanıcıyı bir
     sonraki adıma yönlendirmek için `aksiyonlar` alır; verilmezse tek "Tamam"
     butonu ile kapanır. gvConfirm ile AYNI `.gv-modal-ov`/`.gv-modal` ailesini
     kullanır — yeni bir modal sistemi İCAT EDİLMEDİ. ============================ */
  var GV_RESULT_META = {
    'basarili':         {ico:'fa-circle-check',       cls:'ok',     baslik:'İşlem başarılı',    mesaj:'İşlem başarıyla tamamlandı.'},
    'onaya-gonderildi': {ico:'fa-paper-plane',         cls:'info',   baslik:'Onaya gönderildi',  mesaj:'Kayıt onay sürecine gönderildi; ilgili onaycıya bildirim iletildi.'},
    'revize-istendi':   {ico:'fa-rotate-left',         cls:'warn',   baslik:'Revize istendi',    mesaj:'Kayıt, açıklamayla birlikte talep sahibine revize için geri gönderildi.'},
    'reddedildi':       {ico:'fa-circle-xmark',        cls:'danger', baslik:'Reddedildi',        mesaj:'Kayıt reddedildi; gerekçe ilgili kişiye iletildi.'},
    'kaydedildi':       {ico:'fa-floppy-disk',         cls:'ok',     baslik:'Kaydedildi',        mesaj:'Değişiklikleriniz kaydedildi.'},
    'cikti-hazir':      {ico:'fa-file-circle-check',   cls:'info',   baslik:'Çıktı hazırlandı',  mesaj:'Çıktınız hazırlandı.'},
    'dosya-yuklendi':   {ico:'fa-cloud-arrow-up',      cls:'ok',     baslik:'Dosya yüklendi',    mesaj:'Dosyanız başarıyla yüklendi.'},
    'yetkisiz':         {ico:'fa-lock',                cls:'danger', baslik:'Yetkiniz yok',      mesaj:'Bu işlem için yetkiniz bulunmuyor — erişim için yöneticinizle iletişime geçin.'},
    'eksik-bilgi':      {ico:'fa-triangle-exclamation', cls:'warn',   baslik:'Eksik bilgi',       mesaj:'Devam etmeden önce zorunlu alanları tamamlayın.'}
  };
  window.gvResult = function(durum, opts){
    opts = opts || {};
    var K = GV_RESULT_META[durum] || GV_RESULT_META.basarili;
    if(!GV_RESULT_META[durum]) console.warn('gvResult: tanımsız durum "' + durum + '" — basarili varsayıldı', durum);
    if(document.querySelector('.gv-modal-ov[data-gv-result]')) return null;
    var ov = document.createElement('div'); ov.className = 'gv-modal-ov'; ov.setAttribute('data-gv-result', '');
    var m = document.createElement('div'); m.className = 'gv-modal gv-result-modal ' + K.cls;
    m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    var aksiyonlar = (opts.aksiyonlar && opts.aksiyonlar.length) ? opts.aksiyonlar : [{etiket:'Tamam', birincil:true}];
    var actsHtml = aksiyonlar.map(function(a, i){
      var cls = a.birincil ? 'btn-acc' : 'btn-ghost';
      var tag = a.href ? 'a' : 'button';
      var hrefAttr = a.href ? (' href="' + gvEscHtml(a.href) + '"') : '';
      var typeAttr = a.href ? '' : ' type="button"';
      return '<' + tag + typeAttr + hrefAttr + ' class="btn btn-sm ' + cls + '" data-gvr-act="' + i + '">' + gvEscHtml(a.etiket) + '</' + tag + '>';
    }).join('');
    m.innerHTML = '<div class="gv-modal-ico"><i class="fa-solid ' + K.ico + '"></i></div>'
      + '<h3></h3><p></p>'
      + '<div class="gv-modal-acts">' + actsHtml + '</div>';
    m.querySelector('h3').textContent = opts.baslik || K.baslik;
    m.querySelector('p').textContent = opts.mesaj || K.mesaj;
    ov.appendChild(m); document.body.appendChild(ov);
    gvScrollLock(true);
    requestAnimationFrame(function(){ ov.classList.add('open'); });
    function close(){
      ov.classList.remove('open'); gvScrollLock(false);
      setTimeout(function(){ ov.remove(); }, 220);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e){ if(e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', function(e){ if(e.target === ov) close(); });
    aksiyonlar.forEach(function(a, i){
      var btn = m.querySelector('[data-gvr-act="' + i + '"]');
      if(!btn) return;
      btn.addEventListener('click', function(){ if(!a.href) { /* navigasyon yok */ } close(); if(a.onClick) a.onClick(); });
    });
    var firstBtn = m.querySelector('.gv-modal-acts .btn'); if(firstBtn) firstBtn.focus();
    return { close: close };
  };

  /* ============================================================================
     gvHelp — [data-help="anahtar"] öğelerine küçük soru-işareti tetikleyicisi
     bağlar, tıklanınca `metinler` sözlüğünden açıklama modalı açar (B §9.2).
     Sözlük dışarıdan genişletilebilir: sayfa scripti
     `gvHelp.metinler['yeni-anahtar'] = {baslik, mesaj}` ekleyip `gvHelp.init()`
     tekrar çağırabilir (idempotent — zaten bağlı öğeler atlanır). ============ */
  window.gvHelp = {
    metinler: {
      'hakedis-nedir': {
        baslik: 'Hakediş Nedir?',
        mesaj: 'Hakediş, taşeron veya ana yüklenicinin belirli bir dönemde tamamladığı iş miktarına karşılık talep ettiği ödeme tutarının hesaplandığı belgedir. Saha ilerlemesi (metraj) ile sözleşme birim fiyatları çarpılarak brüt tutar bulunur; kesintiler (avans mahsubu, teminat, ceza vb.) düşülerek net ödenecek tutara ulaşılır. Onay zincirinden geçtikten sonra kasa/banka hareketine dönüşür.'
      },
      'taseron-puantaji': {
        baslik: 'Taşeron Puantajı',
        mesaj: 'Taşeron puantajı, bir taşeron firmaya bağlı çalışan işçilerin şantiyedeki günlük devam durumunun (tam gün / yarım gün / gelmedi / izinli vb.) kaydıdır. Bu kayıtlar taşeron hakediş hesaplamasında işçilik gün sayısını doğrulamak ve saha yoğunluğunu takip etmek için kullanılır; öz personel puantajından ayrı tutulur.'
      },
      'banka-hareketi-raporlar': {
        baslik: 'Banka Hareketleri Raporlara Nasıl Yansır?',
        mesaj: 'Banka hesabına giren/çıkan her hareket ilgili şantiye ve gider kalemiyle eşleştirilir. Onaylanan/mutabık banka hareketleri otomatik olarak kasa özeti, maliyet raporu ve mizan gibi finansal raporların girdisi olur — mutabakatı yapılmamış hareketler bu raporlarda "beklemede" gösterilir ve toplamlara dahil edilmez.'
      },
      'sure-uzatim': {
        baslik: 'Süre Uzatımı Nedir?',
        mesaj: 'Süre uzatımı, hava koşulları, iş değişikliği veya mücbir sebep gibi yüklenicinin kontrolü dışındaki gerekçelerle proje teslim tarihinin sözleşmeye uygun biçimde ertelenmesi talebidir. Gerekçe ve ek süre miktarıyla birlikte onaya sunulur; onaylanırsa şantiye teslim tarihi ve buna bağlı hakediş/gecikme cezası hesapları güncellenir.'
      },
      'mizan-nedir': {
        baslik: 'Mizan Nedir?',
        mesaj: 'Mizan, belirli bir dönemde tüm hesap kalemlerinin (kasa, banka, cari, gider) borç ve alacak toplamlarını tek tabloda özetleyen finansal rapordur. Borç ve alacak toplamlarının eşitliği kayıtların dengede olduğunu gösterir; şantiye veya firma bazında maliyet/gelir dengesini hızlıca görmek için kullanılır.'
      }
    },
    init: function(sel){
      var els = document.querySelectorAll(sel || '[data-help]');
      Array.prototype.forEach.call(els, function(el){
        if(el._gvHelpWired) return;
        el._gvHelpWired = true;
        var trigger = el;
        if(!el.classList.contains('gv-help-ico')){
          var btn = document.createElement('button');
          btn.type = 'button'; btn.className = 'gv-help-ico'; btn.setAttribute('aria-label', 'Yardım — açıklama göster');
          btn.innerHTML = '<i class="fa-solid fa-circle-question"></i>';
          el.appendChild(btn);
          trigger = btn;
        }
        trigger.addEventListener('click', function(e){
          e.preventDefault(); e.stopPropagation();
          window.gvHelp.show(el.getAttribute('data-help'));
        });
      });
    },
    show: function(key){
      var d = this.metinler[key];
      if(!d){ console.warn('gvHelp: tanımsız anahtar "' + key + '"', key); d = {baslik:'Yardım', mesaj:'Bu konu için henüz açıklama eklenmedi.'}; }
      if(document.querySelector('.gv-modal-ov[data-gv-help]')) return;
      var ov = document.createElement('div'); ov.className = 'gv-modal-ov'; ov.setAttribute('data-gv-help', '');
      var m = document.createElement('div'); m.className = 'gv-modal gv-help-modal info';
      m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
      m.innerHTML = '<div class="gv-modal-ico"><i class="fa-solid fa-circle-question"></i></div><h3></h3><p></p>'
        + '<div class="gv-modal-acts"><button type="button" class="btn btn-acc btn-sm gv-m-ok">Anladım</button></div>';
      m.querySelector('h3').textContent = d.baslik || 'Yardım';
      m.querySelector('p').textContent = d.mesaj || '';
      ov.appendChild(m); document.body.appendChild(ov);
      gvScrollLock(true);
      requestAnimationFrame(function(){ ov.classList.add('open'); });
      function close(){ ov.classList.remove('open'); gvScrollLock(false); setTimeout(function(){ ov.remove(); }, 220); document.removeEventListener('keydown', onKey); }
      function onKey(e){ if(e.key === 'Escape') close(); }
      document.addEventListener('keydown', onKey);
      ov.addEventListener('click', function(e){ if(e.target === ov) close(); });
      m.querySelector('.gv-m-ok').addEventListener('click', close);
      m.querySelector('.gv-m-ok').focus();
    }
  };
  function wireHelp(){ gvHelp.init(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireHelp);
  else wireHelp();

  /* ============================================================================
     gvExport — 34 statik "Dışa Aktar" tetikleyicisinin ORTAK çözümü (B §6.4).
     ÖNEMLİ AYRIM: mevcut `[data-export]` (yukarıda, satır ~145) sayfa-lokal
     GV_EXPORTERS varsa GERÇEK .xlsx/.csv indiren, yoksa demo toast basan
     KÜÇÜK format-menüsüdür — 34 buton HÂLİHAZIRDA bunu kullanıyor ve ÇALIŞIYOR;
     `tasks/kararlar.md` K-200'de gerekçelendirildiği gibi bu davranışa
     DOKUNULMADI (regresyon riski). `gvExport`, B §6.4'ün istediği DAHA ZENGİN
     akışı (format + kapsam + filtre özeti içeren modal) ayrı bir `data-gv-export`
     özniteliğiyle sunan YENİ/opsiyonel bir primitiftir — sayfa sahibi ajanlar
     ileride bir butonu `data-export`'tan `data-gv-export`'a TAŞIMAYI seçebilir
     (bu taşıma T-CORE'un işi değil, sayfa dosyasına dokunmaz). ============ */
  var GVX_FMT_META = {
    pdf:    {ico:'fa-file-pdf',   lbl:'PDF'},
    excel:  {ico:'fa-file-excel', lbl:'Excel (.xlsx)'},
    yazdir: {ico:'fa-print',      lbl:'Yazdır'}
  };
  var GVX_SCOPE_META = {
    tumu:     {ico:'fa-layer-group',   lbl:'Tümü'},
    filtreli: {ico:'fa-filter',        lbl:'Filtrelenmiş liste'},
    secili:   {ico:'fa-square-check',  lbl:'Seçili kayıtlar'},
    /* [ŞEF-KAPSAM — Yasin Bey kararı, 5 Ağustos 2026] Rolün yetkisi kendi şantiyesiyle
       sınırlı olduğunda kapsam ekseni BU TEK çipe iner: 'tumu' hiç sunulmaz, dolayısıyla
       genişletilebilir bir kapsam seçeneği KALMAZ. Ayrı bir yetki mekanizması değil,
       yalnız mevcut kapsam listesinin bir değeri — kısıtı sayfa `kapsam:['santiyem']`
       vererek uygular. `msg`: sonuç mesajında 1. tekil çip etiketi ("Kendi şantiyem")
       yerine 2. çoğul anlatım kullanılsın diye ("… yalnız kendi şantiyeniz kapsamıyla
       hazırlandı"); diğer anahtarlarda `msg` yoktur, davranışları DEĞİŞMEDİ. */
    santiyem: {ico:'fa-helmet-safety', lbl:'Kendi şantiyem', msg:'yalnız kendi şantiyeniz'}
  };
  function gvxFormatChip(f){
    var v = GVX_FMT_META[f] || {ico:'fa-file', lbl:f};
    return '<button type="button" class="chip" data-fmt="' + f + '"><i class="fa-solid ' + v.ico + '"></i> ' + v.lbl + '</button>';
  }
  function gvxFormatLabel(f){ return (GVX_FMT_META[f] || {lbl:f}).lbl; }
  function gvxScopeChip(k, secimSayisi){
    var v = GVX_SCOPE_META[k] || {ico:'fa-list', lbl:k};
    var n = (k === 'secili' && typeof secimSayisi === 'function') ? secimSayisi() : null;
    var locked = k === 'secili' && !n;
    return '<button type="button" class="chip' + (locked ? ' is-locked' : '') + '" data-scope="' + k + '"' + (locked ? ' disabled title="Önce en az bir kayıt seçin"' : '') + '>'
      + '<i class="fa-solid ' + v.ico + '"></i> ' + v.lbl + (n ? ' (' + gvFmtNum(n) + ')' : '') + '</button>';
  }
  function gvxScopeLabel(k, secimSayisi){
    var v = GVX_SCOPE_META[k] || {lbl:k};
    if(k === 'secili' && typeof secimSayisi === 'function') return gvFmtNum(secimSayisi()) + ' seçili kayıt';
    if(v.msg) return v.msg;   /* bkz. GVX_SCOPE_META.santiyem — çip etiketi ≠ mesaj anlatımı */
    return v.lbl.toLocaleLowerCase('tr');
  }
  function gvxDefaultFilterSummary(){
    var chips = document.querySelectorAll('.gv-achips .gv-achip');
    if(!chips.length) return 'Aktif filtre yok — tüm kayıtlar kapsamda.';
    return Array.prototype.map.call(chips, function(c){ return c.textContent.replace(/\s+/g, ' ').trim(); }).join(' · ');
  }
  window.gvExport = {
    /* [G-1] Tetikleyicisiz açma. Toplu-seçim (gvBulk) aksiyonları bir DOM elemanına
       değil bir callback'e bağlıdır; `init` ise elemana ihtiyaç duyar. `ac` aynı
       modali doğrudan açar, böylece 12 liste sayfasındaki "seçili kayıtları dışa
       aktar" akışı 12 ayrı çözüm yerine TEK desende toplanır:
         gvExport.ac({baslik:'Cari kayıtları', kapsam:['secili'], secimSayisi:function(){ return rows.length; }})
       Modal/format/kapsam mantığı `init` ile BİREBİR aynıdır — kopya kod yok. */
    ac: function(opts){
      var el = document.createElement('span');
      var h = window.gvExport.init(el, opts);
      if(h) h.open();
      return h;
    },
    init: function(triggerSelector, opts){
      var trigger = typeof triggerSelector === 'string' ? document.querySelector(triggerSelector) : triggerSelector;
      if(!trigger){ console.warn('gvExport: tetikleyici bulunamadı', triggerSelector); return null; }
      if(trigger._gvExport) return trigger._gvExport;
      opts = opts || {};
      var baslik = opts.baslik || 'Kayıtlar';
      var ciktiHref = opts.ciktiHref || null;
      var formatlar = (opts.formatlar && opts.formatlar.length) ? opts.formatlar : ['pdf', 'excel', 'yazdir'];
      var kapsamList = (opts.kapsam && opts.kapsam.length) ? opts.kapsam : ['tumu', 'filtreli'];
      var filtreOzeti = typeof opts.filtreOzeti === 'function' ? opts.filtreOzeti : gvxDefaultFilterSummary;
      var secimSayisi = typeof opts.secimSayisi === 'function' ? opts.secimSayisi : null;
      /* [G-1] yazdirFn — "Yazdır" formatı seçildiğinde ÇAĞRILIR ve ciktiHref'i geçersiz
         kılar. Dedike bir `-cikti.html` ekranı OLMAYAN, bunun yerine sayfayı @media print
         ile kendisi basan sayfalar için: eskiden bu sayfalarda `window.print()` çağıran
         AYRI bir buton duruyordu; G-1 tek buton istediği için o davranış modalin Yazdır
         dalına taşınır. Verilmezse davranış aynen eskisi gibi (ciktiHref → çıktı sayfası). */
      var yazdirFn = typeof opts.yazdirFn === 'function' ? opts.yazdirFn : null;
      /* [G-2/R-14] ekAlanlar — Format ve Kapsam'ın ALTINA, aynı çip dilinde ek seçim
         eksenleri koyar. Sayfaya özel bir çıktı sihirbazı ortak modale devredilirken
         sihirbazın kendine has eksenleri (ör. puantajda Dönem: Haftalık/Günlük/Aylık,
         Taşeron Firma) burada geri kazanılır — İŞLEV KAYBETTİRMEME kuralı.
         Biçim: [{key:'donem', etiket:'Dönem', secenekler:[{deger,etiket,ikon}],
                  varsayilan:'haftalik', gizle:function(){...}}]
         Seçilen değerler ciktiHref'e 3. argüman olarak bir nesneyle geçer. */
      var ekAlanlar = Array.isArray(opts.ekAlanlar) ? opts.ekAlanlar : [];
      /* [G-2] formatKilit(fmt) — bir formatı KİLİTLER ve sebebini tooltip'te gösterir.
         İki aksiyon birleşip yetki kuralları farklı kaldığında kullanılır: buton
         herkese görünür (en geniş erişim korunur), kısıt YALNIZ kısıtlı formata
         uygulanır. Dönüş: null/'' → serbest, string → kilitli + sebep. */
      var formatKilit = typeof opts.formatKilit === 'function' ? opts.formatKilit : null;

      function runGvExport(fmt, kapsam, ek){
        ek = ek || {};
        /* [G-1/R-13] ciktiHref FONKSİYON da olabilir: (kapsam, fmt) => url. Aktif
           filtreleri/seçimi çıktı sayfasına taşıyan sayfalar (avans, kredi kartı,
           kasa, pluxee…) böylece kendi buildOutputUrl() mantığını korur — eskiden
           bunu ayrı bir "Tüm liste mi çıktı alınsın?" gvConfirm'i ile yapıyorlardı,
           o soru artık modalin Kapsam bölümü. Statik string davranışı DEĞİŞMEDİ. */
        if(fmt === 'yazdir' && yazdirFn){ yazdirFn(kapsam, ek); return; }
        /* Gerçek indirme motoru HER ZAMAN önce denenir (mevcut davranış korunur). */
        if(fmt === 'excel'){
          var exporter = window.GV_EXPORTERS && window.GV_EXPORTERS[baslik];
          if(exporter){ runExport(exporter, 'Excel'); return; }   /* bkz. yukarı [data-export] bloğu */
        }
        var href = typeof ciktiHref === 'function' ? ciktiHref(kapsam, fmt, ek) : ciktiHref;
        /* [G-1] Excel de ciktiHref'e DÜŞEBİLİR. Eskiden yalnız pdf/yazdir düşerdi;
           GV_EXPORTERS kaydı olmayan ama çıktı sayfası `?format=excel` üreten sayfalar
           (ör. puantaj — kanonik roster liste sayfasında değil çıktı sayfasında) böylece
           demo ekranına düşmek yerine gerçek dökümü verir. Exporter varsa yukarıda zaten
           dönüldü, dolayısıyla mevcut gerçek indirmeler etkilenmez. */
        if(href){
          /* ciktiHref fonksiyonu kapsam/format'ı KENDİSİ eşlemiş olabilir (sayfaya özel
             sözlükle, ör. kapsam=taseron). O durumda üstüne ham değeri EKLEMEYİZ — yoksa
             URL'de aynı parametre iki kez görünür (ilki kazanır ama çıktı kirli olur). */
          var qs = href.indexOf('?') === -1 ? '?' : '&';
          var ek = '';
          if(!/[?&]kapsam=/.test(href)) ek += 'kapsam=' + encodeURIComponent(kapsam) + '&';
          if(!/[?&]format=/.test(href)) ek += 'format=' + encodeURIComponent(fmt) + '&';
          location.href = ek ? href + qs + ek.slice(0, -1) : href;
          return;
        }
        gvResult('cikti-hazir', {
          baslik: 'Çıktı hazırlandı',
          mesaj: baslik + ' — ' + gvxFormatLabel(fmt) + ' formatında, ' + gvxScopeLabel(kapsam, secimSayisi) + ' kapsamıyla hazırlandı. (statik prototip — gerçek dosya üretilmez)',
          aksiyonlar: [{etiket:'Kapat', birincil:true}]
        });
      }

      function openModal(){
        if(document.querySelector('.gv-modal-ov[data-gv-export]')) return;
        var ov = document.createElement('div'); ov.className = 'gv-modal-ov'; ov.setAttribute('data-gv-export', '');
        var m = document.createElement('div'); m.className = 'gv-modal gv-export-modal';
        m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
        var fmtHtml = formatlar.map(function(f){
          var kilit = formatKilit ? formatKilit(f) : null;
          if(!kilit) return gvxFormatChip(f);
          var v = GVX_FMT_META[f] || {ico:'fa-file', lbl:f};
          return '<button type="button" class="chip is-locked" data-fmt="' + f + '" disabled title="' + kilit.replace(/"/g, '&quot;') + '">'
            + '<i class="fa-solid fa-lock"></i> ' + v.lbl + '</button>';
        }).join('');
        var kapsamHtml = kapsamList.map(function(k){ return gvxScopeChip(k, secimSayisi); }).join('');
        /* ek eksenler — Format/Kapsam ile AYNI çip dili, ayrı bir görsel dil İCAT EDİLMEZ */
        var ekHtml = ekAlanlar.filter(function(a){ return !(typeof a.gizle === 'function' && a.gizle()); }).map(function(a){
          /* secenekler FONKSİYON da olabilir — sayfa durumuna göre değişen eksenler için
             (ör. puantajda "Filtre aralığı" yalnız Gelişmiş Filtre'de tarih seçiliyken) */
          var sec = typeof a.secenekler === 'function' ? (a.secenekler() || []) : (a.secenekler || []);
          var chips = sec.map(function(o){
            return '<button type="button" class="chip" data-ek="' + a.key + '" data-deger="' + o.deger + '">'
              + (o.ikon ? '<i class="fa-solid ' + o.ikon + '"></i> ' : '') + o.etiket + '</button>';
          }).join('');
          return '<div class="gvx-section"><span class="gvx-lbl">' + a.etiket + '</span>'
            + '<div class="gvx-chips gvx-ek" data-ekkey="' + a.key + '" role="radiogroup" aria-label="' + a.etiket + '">' + chips + '</div></div>';
        }).join('');
        m.innerHTML = '<div class="gv-modal-ico"><i class="fa-solid fa-file-export"></i></div>'
          + '<h3>Dışa Aktar</h3><p></p>'
          + '<div class="gvx-section"><span class="gvx-lbl">Format</span><div class="gvx-chips gvx-fmt" role="radiogroup" aria-label="Format">' + fmtHtml + '</div></div>'
          + '<div class="gvx-section"><span class="gvx-lbl">Kapsam</span><div class="gvx-chips gvx-scope" role="radiogroup" aria-label="Kapsam">' + kapsamHtml + '</div></div>'
          + ekHtml
          + '<div class="gvx-summary"><i class="fa-solid fa-filter"></i><span></span></div>'
          + '<div class="gv-modal-acts">'
          +   '<button type="button" class="btn btn-ghost btn-sm gv-m-cancel">Vazgeç</button>'
          +   '<button type="button" class="btn btn-acc btn-sm gvx-go"><i class="fa-solid fa-download"></i> Çıktıyı Hazırla</button>'
          + '</div>';
        m.querySelector('p').textContent = baslik + ' için çıktı biçimini ve kapsamını seçin.';
        m.querySelector('.gvx-summary span').textContent = filtreOzeti();
        ov.appendChild(m); document.body.appendChild(ov);
        gvScrollLock(true);
        requestAnimationFrame(function(){ ov.classList.add('open'); });

        var fmtChips = m.querySelectorAll('.gvx-fmt .chip');
        var scopeChips = m.querySelectorAll('.gvx-scope .chip:not(.is-locked)');
        /* varsayılan seçim KİLİTLİ olmayan ilk çip — kilitli bir format açılışta seçili
           gelirse "Çıktıyı Hazırla" yetkisiz bir işi tetiklerdi */
        var ilkAcik = m.querySelector('.gvx-fmt .chip:not(.is-locked)');
        if(ilkAcik) ilkAcik.classList.add('is-on');
        if(scopeChips.length) scopeChips[0].classList.add('is-on');
        /* ek eksenlerin varsayılanı */
        ekAlanlar.forEach(function(a){
          var grup = m.querySelector('.gvx-ek[data-ekkey="' + a.key + '"]'); if(!grup) return;
          var hedef = a.varsayilan ? grup.querySelector('.chip[data-deger="' + a.varsayilan + '"]') : null;
          (hedef || grup.querySelector('.chip') || {classList:{add:function(){}}}).classList.add('is-on');
        });
        m.querySelectorAll('.gvx-ek').forEach(function(grup){
          grup.addEventListener('click', function(e){
            var c = e.target.closest('.chip'); if(!c || c.hasAttribute('disabled')) return;
            grup.querySelectorAll('.chip').forEach(function(x){ x.classList.remove('is-on'); });
            c.classList.add('is-on');
          });
        });
        m.querySelector('.gvx-fmt').addEventListener('click', function(e){
          var c = e.target.closest('.chip'); if(!c || c.hasAttribute('disabled')) return;
          Array.prototype.forEach.call(fmtChips, function(x){ x.classList.remove('is-on'); });
          c.classList.add('is-on');
        });
        m.querySelector('.gvx-scope').addEventListener('click', function(e){
          var c = e.target.closest('.chip'); if(!c || c.hasAttribute('disabled')) return;
          Array.prototype.forEach.call(m.querySelectorAll('.gvx-scope .chip'), function(x){ x.classList.remove('is-on'); });
          c.classList.add('is-on');
        });

        function close(){ ov.classList.remove('open'); gvScrollLock(false); setTimeout(function(){ ov.remove(); }, 220); document.removeEventListener('keydown', onKey); }
        function onKey(e){ if(e.key === 'Escape') close(); }
        document.addEventListener('keydown', onKey);
        ov.addEventListener('click', function(e){ if(e.target === ov) close(); });
        m.querySelector('.gv-m-cancel').addEventListener('click', close);
        m.querySelector('.gvx-go').addEventListener('click', function(){
          var fmtEl = m.querySelector('.gvx-fmt .chip.is-on');
          var scopeEl = m.querySelector('.gvx-scope .chip.is-on');
          var fmt = fmtEl ? fmtEl.getAttribute('data-fmt') : formatlar[0];
          var kapsam = scopeEl ? scopeEl.getAttribute('data-scope') : kapsamList[0];
          var ek = {};
          m.querySelectorAll('.gvx-ek').forEach(function(g){
            var on = g.querySelector('.chip.is-on');
            if(on) ek[g.getAttribute('data-ekkey')] = on.getAttribute('data-deger');
          });
          close();
          runGvExport(fmt, kapsam, ek);
        });
      }

      trigger.addEventListener('click', function(e){ e.preventDefault(); openModal(); });
      var handle = { open: openModal };
      trigger._gvExport = handle;
      return handle;
    },
    bind: function(sel){
      var els = document.querySelectorAll(sel || '[data-gv-export]');
      Array.prototype.forEach.call(els, function(el){
        if(el._gvExport) return;
        var cfg = {};
        var raw = el.getAttribute('data-gv-export');
        if(raw && raw.trim() && raw.trim() !== '1'){
          try{ cfg = JSON.parse(raw); }catch(err){ console.warn('gvExport.bind: data-gv-export JSON hatalı', el, err); }
        }
        if(!cfg.baslik) cfg.baslik = el.getAttribute('data-gv-export-baslik') || el.textContent.replace(/\s+/g, ' ').trim() || 'Kayıtlar';
        window.gvExport.init(el, cfg);
      });
    }
  };

  /* [G-1] Oto-bağlama: `data-gv-export` taşıyan her tetikleyici, sayfa scripti
     ayrıca `gvExport.bind()` çağırmasa da çalışır. `bind` idempotenttir
     (`el._gvExport` nöbetçisi), bu yüzden kendi bind'ini çağıran 23 sayfada
     çifte kayıt OLUŞTURMAZ. Revizyonda 30+ "Çıktı Al" butonu deklaratif
     `data-gv-export`'a taşındığı için bu kanca olmadan sessizce ölü kalırlardı. */
  function wireGvExports(){ window.gvExport.bind(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireGvExports); else wireGvExports();

  /* ============================================================================
     gvEmpty — YÖNLENDİREN boş durum (B §9.1) + yükleniyor/hata/boş/kayıt durum
     makinesi (A §3 kritik kural: yukleniyor → hata → sonucSayisi===0 → kayıtlar,
     ikisi ASLA aynı anda görünmez). `render` mevcut `.gv-empty` sınıf ailesini
     (ge-ico/h4/p) doldurur — yeni bir görsel dil İCAT EDİLMEDİ. `durum`,
     `[data-gv-state="loading|error|empty|content"]` sözleşmesiyle işaretlenmiş
     kardeş elemanlar arasında `hidden` özniteliğiyle geçiş yapar — `[hidden]{
     display:none !important}` kuralı zaten shell.css'te (satır 29) global
     olarak tanımlı, ayrı bir CSS kuralı GEREKMEZ (görünürlük garantisi DOM'da). */
  window.gvEmpty = {
    render: function(el, opts){
      if(typeof el === 'string') el = document.querySelector(el);
      if(!el) return;
      opts = opts || {};
      el.classList.add('gv-empty');
      el.innerHTML = '<div class="ge-ico"><i class="fa-solid ' + (opts.ikon || 'fa-inbox') + '"></i></div>'
        + '<h4></h4><p></p>';
      el.querySelector('h4').textContent = opts.baslik || 'Kayıt bulunamadı';
      var p = el.querySelector('p');
      if(opts.aciklama) p.textContent = opts.aciklama; else p.remove();
      if(opts.aksiyon && opts.aksiyon.etiket){
        var a = document.createElement('a');
        a.className = 'btn btn-acc btn-sm ge-cta';
        a.href = opts.aksiyon.href || '#';
        a.innerHTML = '<i class="fa-solid fa-arrow-right"></i> ';
        a.appendChild(document.createTextNode(opts.aksiyon.etiket));
        el.appendChild(a);
      }
    },
    durum: function(el, opts){
      if(typeof el === 'string') el = document.querySelector(el);
      if(!el) return null;
      opts = opts || {};
      var nodes = {
        loading: el.querySelector('[data-gv-state="loading"]'),
        error:   el.querySelector('[data-gv-state="error"]'),
        empty:   el.querySelector('[data-gv-state="empty"]'),
        content: el.querySelector('[data-gv-state="content"]')
      };
      var active = opts.yukleniyor ? 'loading' : opts.hata ? 'error' : (opts.sonucSayisi === 0 ? 'empty' : 'content');
      Object.keys(nodes).forEach(function(k){
        var node = nodes[k]; if(!node) return;
        node.hidden = (k !== active);
      });
      return active;
    }
  };

  /* ============================================================================
     gvCount — kayıt sayısı özeti (A §3'ün 6 ekseni: toplam · aktif · pasif ·
     arşiv · filtre sonucu · seçili). Filtre uygulanmışken "N kayıttan M tanesi",
     filtre yokken sade "N kayıt". `gorunen` verilirse (arama/filtre DEĞİL, bir
     switch/toggle ile daralan görünürlük ekseni — örn. "Pasif Şantiyeleri Göster"
     kapalıyken 9 kayıttan 5'i görünür) "Toplam N · görünen M" biçimi kullanılır
     (şantiye sayfasının kanonik ihtiyacı, bkz shell.js "V2 SAYIM KANONİĞİ").
     Verilmeyen eksen render EDİLMEZ. ============================================ */
  window.gvCount = {
    render: function(el, opts){
      if(typeof el === 'string') el = document.querySelector(el);
      if(!el) return;
      opts = opts || {};
      var base;
      if(opts.filtreSonucu != null){
        base = gvFmtNum(opts.toplam) + ' kayıttan ' + gvFmtNum(opts.filtreSonucu) + ' tanesi';
      } else if(opts.gorunen != null){
        base = 'Toplam ' + gvFmtNum(opts.toplam) + ' · görünen ' + gvFmtNum(opts.gorunen);
      } else {
        base = gvFmtNum(opts.toplam) + ' kayıt';
      }
      var subParts = [];
      if(opts.aktif != null) subParts.push(gvFmtNum(opts.aktif) + ' aktif');
      if(opts.pasif != null) subParts.push(gvFmtNum(opts.pasif) + ' pasif');
      if(opts.arsiv != null) subParts.push(gvFmtNum(opts.arsiv) + ' arşiv');
      el.classList.add('gv-count');
      var html = '<span class="gv-count-base">' + gvEscHtml(base) + '</span>';
      if(subParts.length) html += '<span class="gv-count-sub">' + gvEscHtml(subParts.join(' · ')) + '</span>';
      if(opts.secili){
        html += '<span class="gv-count-secili"><i class="fa-solid fa-square-check"></i> ' + gvFmtNum(opts.secili) + ' seçili</span>';
      }
      el.innerHTML = html;
    }
  };

  /* ============================================================================
     gvBulk — seçili kayıt işlemleri barı (B §2.1). Tabloya çalışma-zamanında
     seçim kutusu kolonu ENJEKTE eder (sayfa dosyasına dokunmadan — sayfa yalnız
     `gvBulk.init('#tblX', {...})` çağırır), en az 1 satır seçilince kart başında
     sticky bir aksiyon barı belirir. Tehlikeli aksiyon gvConfirm'den geçer.
     `cfg.skipRowSelector` verilirse eşleşen satırlara (ör. ara toplam/devir
     satırları) checkbox EKLENMEZ — bkz tasks/spec-v2-core.md örneği. ============ */
  function gvBulkRowVisible(tr){
    return !tr.hidden && !tr.classList.contains('gv-pg-hide') && !tr.classList.contains('gv-fp-hide') && tr.offsetParent !== null;
  }
  window.gvBulk = {
    init: function(tableSel, cfg){
      var table = typeof tableSel === 'string' ? document.querySelector(tableSel) : tableSel;
      if(!table){ console.warn('gvBulk: tablo bulunamadı', tableSel); return null; }
      if(table._gvBulk) return table._gvBulk;
      cfg = cfg || {};
      var actions = cfg.aksiyonlar || [];
      var skipSel = cfg.skipRowSelector || null;

      var headRow = table.tHead && table.tHead.rows[0];
      var chkAllInput = null;
      if(headRow && !headRow.querySelector('.gv-bulk-th')){
        var th = document.createElement('th'); th.className = 'gv-bulk-th';
        th.innerHTML = '<label class="row-chk" aria-label="Görünen tüm kayıtları seç"><input type="checkbox" class="gv-bulk-all"><span class="chk-box"><i class="fa-solid fa-check"></i></span></label>';
        headRow.insertBefore(th, headRow.firstChild);
        chkAllInput = th.querySelector('.gv-bulk-all');
      }
      function wireRow(tr){
        if(tr.querySelector('.gv-bulk-td')) return;
        if(skipSel && tr.matches(skipSel)) return;
        var td = document.createElement('td'); td.className = 'gv-bulk-td';
        td.innerHTML = '<label class="row-chk" aria-label="Kaydı seç"><input type="checkbox" class="gv-bulk-chk"><span class="chk-box"><i class="fa-solid fa-check"></i></span></label>';
        tr.insertBefore(td, tr.firstChild);
      }
      function wireAllRows(){
        if(table.tBodies[0]) Array.prototype.forEach.call(table.tBodies[0].rows, wireRow);
      }
      wireAllRows();

      var bar = document.createElement('div'); bar.className = 'gv-bulk-bar'; bar.hidden = true;
      bar.innerHTML = '<span class="gvb-count"></span><div class="gvb-acts"></div>'
        + '<button type="button" class="btn btn-ghost btn-sm gvb-clear"><i class="fa-solid fa-xmark"></i> Seçimi Temizle</button>';
      var actsWrap = bar.querySelector('.gvb-acts');
      function selectedRows(){
        return Array.prototype.map.call(table.querySelectorAll('.gv-bulk-chk:checked'), function(c){ return c.closest('tr'); });
      }
      actions.forEach(function(a){
        var b = document.createElement('button'); b.type = 'button';
        b.className = 'btn btn-sm ' + (a.tehlikeli ? 'btn-danger' : 'btn-ghost');
        b.innerHTML = (a.ikon ? '<i class="fa-solid ' + a.ikon + '"></i> ' : '') + gvEscHtml(a.etiket || '');
        /* `data-no-confirm` ŞART: aksiyon etiketi "Sil"/"Reddet"/"Kaldır"/"Arşivle" gibi
           yukarıdaki GENEL yıkıcı-aksiyon interceptor'ının (satır ~91, DESTR) desenleriyle
           eşleşirse, o interceptor CAPTURE fazında bu tıklamayı BURADAKİ bubble-phase
           dinleyicisinden ÖNCE yakalar ve KENDİ (jenerik metinli) gvConfirm'ini açar; onay
           sonrası native replay tetiklendiğinde BU dinleyici çalışır ama önceki modal henüz
           DOM'dan kalkmamış olur (close() 220ms gecikmeli remove) → gvConfirm'in "aynı anda
           tek modal" guard'ı YENİ (doğru "N kayıt…" mesajlı) onayı SESSİZCE no-op eder ve
           `onClick` HİÇ ÇALIŞMAZ — kullanıcı jenerik "silindi" toast'ı görür ama gerçek
           aksiyon çalışmamış olur. `data-no-confirm` bu butonu genel interceptor'ın kapsamı
           dışına alır; gvBulk KENDİ (kayıt sayısını içeren) onayını her zaman güvenilir
           şekilde gösterir. */
        b.setAttribute('data-no-confirm', '');
        b.addEventListener('click', function(){
          var sel = selectedRows(); if(!sel.length) return;
          if(a.tehlikeli){
            gvConfirm({
              danger:true, icon:'fa-triangle-exclamation', title:(a.etiket || 'Uygula') + '?',
              message: sel.length + ' kayıt için bu işlem uygulanacak. Bu işlem geri alınamaz.',
              ok:a.etiket || 'Uygula', cancel:'Vazgeç',
              onConfirm:function(){ if(a.onClick) a.onClick(sel); }
            });
          } else if(a.onClick) a.onClick(sel);
        });
        actsWrap.appendChild(b);
      });
      var gcBody = table.closest('.gc-body') || table;
      gcBody.parentNode.insertBefore(bar, gcBody);

      function refresh(){
        var sel = selectedRows();
        bar.hidden = sel.length === 0;
        bar.querySelector('.gvb-count').textContent = gvFmtNum(sel.length) + ' kayıt seçildi';
        Array.prototype.forEach.call(table.querySelectorAll('.gv-bulk-chk'), function(c){
          var tr = c.closest('tr'); if(tr) tr.classList.toggle('is-checked', c.checked);
        });
        if(chkAllInput){
          var visBoxes = Array.prototype.filter.call(table.querySelectorAll('.gv-bulk-chk'), function(c){ return gvBulkRowVisible(c.closest('tr')); });
          var allOn = visBoxes.length > 0 && visBoxes.every(function(c){ return c.checked; });
          chkAllInput.checked = allOn;
          chkAllInput.indeterminate = !allOn && visBoxes.some(function(c){ return c.checked; });
        }
      }
      table.addEventListener('change', function(e){ if(e.target.classList.contains('gv-bulk-chk')) refresh(); });
      if(chkAllInput){
        chkAllInput.addEventListener('change', function(e){
          var checked = e.target.checked;
          Array.prototype.forEach.call(table.querySelectorAll('.gv-bulk-chk'), function(c){
            if(gvBulkRowVisible(c.closest('tr'))) c.checked = checked;
          });
          refresh();
        });
      }
      bar.querySelector('.gvb-clear').addEventListener('click', function(){
        Array.prototype.forEach.call(table.querySelectorAll('.gv-bulk-chk'), function(c){ c.checked = false; });
        refresh();
      });

      var handle = {
        refresh: function(){ wireAllRows(); refresh(); },
        clear: function(){ Array.prototype.forEach.call(table.querySelectorAll('.gv-bulk-chk'), function(c){ c.checked = false; }); refresh(); },
        selected: selectedRows
      };
      table._gvBulk = handle;
      return handle;
    }
  };

  /* ============================================================================
     gvBar/gvDonut/gvSpark — bağımlılıksız, token-uyumlu inline SVG rapor
     grafikleri (.rp-chart içine mount edilir, bkz tasks/spec-v2-core.md).
     Hepsi responsive (viewBox+preserveAspectRatio) ve erişilebilir
     (role="img" + <title>). Grafik kütüphanesi EKLENMEDİ — CDN yok. ============ */
  var GV_CHART_TONE = {
    acc:'var(--acc-ink)', ok:'var(--ok)', warn:'var(--warn)', danger:'var(--danger)', info:'var(--info)', muted:'var(--muted)'
  };
  function gvChartColor(tone){ return GV_CHART_TONE[tone] || GV_CHART_TONE.acc; }
  function gvSvgEsc(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function gvChartVal(d){ return d.val != null ? d.val : d.deger; }
  function gvChartLbl(d){ return d.lbl != null ? d.lbl : d.etiket; }
  function gvChartValLbl(d){ return d.valLbl != null ? d.valLbl : gvFmtNum(gvChartVal(d)); }

  window.gvBar = function(el, veri, opts){
    if(typeof el === 'string') el = document.querySelector(el);
    if(!el) return;
    veri = veri || []; opts = opts || {};
    if(!veri.length){ el.innerHTML = ''; return; }
    var yon = opts.yon || 'yatay';
    var max = Math.max.apply(null, veri.map(function(d){ return Math.abs(gvChartVal(d)) || 0; })) || 1;
    var titleTxt = opts.baslik || 'Grafik';
    var svg;
    if(yon === 'dikey'){
      var W = 480, H = 220, pad = 30, gap = 14;
      var bw = (W - pad * 2 - gap * (veri.length - 1)) / veri.length;
      var body = veri.map(function(d, i){
        var v = gvChartVal(d);
        var bh = (Math.abs(v) / max) * (H - pad * 2 - 22);
        var x = pad + i * (bw + gap);
        var y = H - pad - bh;
        return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(bh, 1).toFixed(1) + '" rx="4" style="fill:' + gvChartColor(d.tone) + '"><title>' + gvSvgEsc(gvChartLbl(d)) + ': ' + gvSvgEsc(gvChartValLbl(d)) + '</title></rect>'
          + '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + Math.max(y - 6, 12).toFixed(1) + '" text-anchor="middle" style="font:700 9px var(--font);fill:var(--ink)">' + gvSvgEsc(gvChartValLbl(d)) + '</text>'
          + '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - pad + 15) + '" text-anchor="middle" style="font:600 9px var(--font);fill:var(--muted)">' + gvSvgEsc(gvChartLbl(d)) + '</text>';
      }).join('');
      svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img"><title>' + gvSvgEsc(titleTxt) + '</title>' + body + '</svg>';
    } else {
      var W2 = 480, rowH = 30, pad2 = 3;
      var H2 = veri.length * rowH + pad2 * 2;
      var labelW = opts.labelWidth || 100;
      var barMaxW = W2 - labelW - 58;
      var rows = veri.map(function(d, i){
        var v = gvChartVal(d);
        var bw2 = (Math.abs(v) / max) * barMaxW;
        var y = pad2 + i * rowH;
        return '<text x="2" y="' + (y + rowH / 2 + 3.5) + '" style="font:600 10.5px var(--font);fill:var(--ink-2)">' + gvSvgEsc(gvChartLbl(d)) + '</text>'
          + '<rect x="' + labelW + '" y="' + (y + 6) + '" width="' + Math.max(bw2, 2).toFixed(1) + '" height="' + (rowH - 12) + '" rx="4" style="fill:' + gvChartColor(d.tone) + '"><title>' + gvSvgEsc(gvChartLbl(d)) + ': ' + gvSvgEsc(gvChartValLbl(d)) + '</title></rect>'
          + '<text x="' + (labelW + bw2 + 8) + '" y="' + (y + rowH / 2 + 3.5) + '" style="font:700 10.5px var(--font);fill:var(--ink)">' + gvSvgEsc(gvChartValLbl(d)) + '</text>';
      }).join('');
      svg = '<svg viewBox="0 0 ' + W2 + ' ' + H2 + '" preserveAspectRatio="xMidYMid meet" role="img"><title>' + gvSvgEsc(titleTxt) + '</title>' + rows + '</svg>';
    }
    el.innerHTML = svg;
  };

  window.gvDonut = function(el, veri, opts){
    if(typeof el === 'string') el = document.querySelector(el);
    if(!el) return;
    veri = veri || []; opts = opts || {};
    var total = veri.reduce(function(s, d){ return s + (Number(gvChartVal(d)) || 0); }, 0);
    if(!veri.length || !total){ el.innerHTML = ''; return; }
    var r = 54, cx = 64, cy = 64, sw = 20, circ = 2 * Math.PI * r, offset = 0;
    var arcs = veri.map(function(d){
      var v = Number(gvChartVal(d)) || 0;
      var frac = v / total;
      var dash = frac * circ;
      var seg = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" style="stroke:' + gvChartColor(d.tone) + '" stroke-width="' + sw + '" stroke-dasharray="' + dash.toFixed(2) + ' ' + (circ - dash).toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"><title>' + gvSvgEsc(gvChartLbl(d)) + ': ' + gvSvgEsc(gvChartValLbl(d)) + ' (%' + Math.round(frac * 100) + ')</title></circle>';
      offset += dash;
      return seg;
    }).join('');
    var svg = '<svg viewBox="0 0 128 128" preserveAspectRatio="xMidYMid meet" role="img" style="max-width:200px;margin:0 auto;display:block"><title>' + gvSvgEsc(opts.baslik || 'Dağılım') + '</title>' + arcs
      + '<text x="64" y="60" text-anchor="middle" style="font:800 18px var(--font);fill:var(--ink)">' + gvSvgEsc(opts.merkezEtiket != null ? opts.merkezEtiket : gvFmtNum(total)) + '</text>'
      + '<text x="64" y="76" text-anchor="middle" style="font:600 8.5px var(--font);fill:var(--muted)">' + gvSvgEsc(opts.merkezAlt || 'toplam') + '</text>'
      + '</svg>';
    var legend = '<div class="rp-chart-legend">' + veri.map(function(d){
      var v = Number(gvChartVal(d)) || 0;
      return '<span><i style="background:' + gvChartColor(d.tone) + '"></i>' + gvSvgEsc(gvChartLbl(d)) + ' — ' + gvSvgEsc(gvChartValLbl(d)) + ' (%' + Math.round(v / total * 100) + ')</span>';
    }).join('') + '</div>';
    el.innerHTML = svg + legend;
  };

  window.gvSpark = function(el, veri, opts){
    if(typeof el === 'string') el = document.querySelector(el);
    if(!el) return;
    opts = opts || {};
    var nums = (veri || []).map(function(d){ return typeof d === 'number' ? d : gvChartVal(d); });
    if(!nums.length){ el.innerHTML = ''; return; }
    var W = 320, H = 72, pad = 6;
    var min = Math.min.apply(null, nums), max = Math.max.apply(null, nums);
    var range = (max - min) || 1;
    var stepX = (W - pad * 2) / (nums.length - 1 || 1);
    var pts = nums.map(function(v, i){
      var x = pad + i * stepX;
      var y = H - pad - ((v - min) / range) * (H - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    var line = 'M' + pts.join(' L');
    var area = line + ' L' + (pad + (nums.length - 1) * stepX).toFixed(1) + ',' + (H - pad) + ' L' + pad + ',' + (H - pad) + ' Z';
    var tone = gvChartColor(opts.tone);
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img"><title>' + gvSvgEsc(opts.baslik || 'Zaman serisi') + '</title>'
      + '<path d="' + area + '" style="fill:' + tone + ';fill-opacity:.12;stroke:none"></path>'
      + '<path d="' + line + '" style="fill:none;stroke:' + tone + ';stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round"></path>'
      + '</svg>';
    el.innerHTML = svg;
  };

  /* ============================================================================
     gvViewSync (A §4/§8) — `.gv-desktop-only`/`.gv-mobile-only` (tek breakpoint,
     640px) çiftinin `aria-hidden` senkronu: CSS `display:none` görsel olarak
     gizler ama ekran okuyucuya kapatmaz — bu fonksiyon matchMedia ile gerçek
     görünürlüğü izleyip görünmeyen tarafa `aria-hidden="true"` yazar. Sayfa
     dinamik içerik eklediyse tekrar `gvViewSync()` çağırabilir (idempotent). */
  var gvViewMQ = window.matchMedia('(max-width:640px)');
  function gvViewSync(){
    var mobile = gvViewMQ.matches;
    document.querySelectorAll('.gv-desktop-only').forEach(function(el){ el.setAttribute('aria-hidden', mobile ? 'true' : 'false'); });
    document.querySelectorAll('.gv-mobile-only').forEach(function(el){ el.setAttribute('aria-hidden', mobile ? 'false' : 'true'); });
  }
  window.gvViewSync = gvViewSync;
  if(gvViewMQ.addEventListener) gvViewMQ.addEventListener('change', gvViewSync); else if(gvViewMQ.addListener) gvViewMQ.addListener(gvViewSync);
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', gvViewSync); else gvViewSync();

  /* ---- gvEllipSync — .gv-ellip/.gv-ellip-2 taşıyan elemanlara `title` yoksa
     tam metni otomatik yazar (A §8 "uzun metin ellipsis, tam metin title'a düşer"). */
  function gvEllipSync(){
    document.querySelectorAll('.gv-ellip,.gv-ellip-2').forEach(function(el){
      if(!el.hasAttribute('title')){
        var t = el.textContent.replace(/\s+/g, ' ').trim();
        if(t) el.setAttribute('title', t);
      }
    });
  }
  window.gvEllipSync = gvEllipSync;
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', gvEllipSync); else gvEllipSync();

  /* =====================================================================
     V3A REVİZYON — T-CORE: ORTAK LİSTE ÜST ALANI PRİMİTİFLERİ (doküman §2/§3/§4/§8)
     gvListHead · gvTabs · gvSticky. DOM sözleşmesi + kanonik HTML iskeletleri:
     tasks/spec-v3a-ortak.md — sonraki dalgalar BU dosyayı okuyup tüketir.
     Hepsi MEVCUT primitifleri (gvFilterDrawer/gvCols/gvExport/gvChipBar) TÜKETİR,
     yeniden yazmaz. ===================================================== */

  /* ============================================================================
     gvListHead — §2.1/§2.2 standart liste üst alanı orkestratörü. İKİ MOD:
     1) "bağlan" — cfg.mount zaten `.lh-row`/`.lh-acts` içeren hazır DOM'a işaret
        ediyorsa (sayfa kendi HTML'ini yazdıysa — bileşik/özel filtre motoru olan
        sayfaların TERCİH ETTİĞİ yol, ör. crm-gorev.html), gvListHead yalnız eksik
        aksiyon düğmelerini tamamlar ve verilen primitifleri var olan/oluşturduğu
        düğmelere bağlar.
     2) "üret" — cfg.mount boş bir kapsayıcıysa (`.lh-row` YOKSA), iskeleti SIFIRDAN
        kurar. Basit tek-boyutlu filtre motoruna sahip yeni sayfalar için önerilir.
     Her iki modda da: cfg.filter → gvFilterDrawer.init, cfg.cols → gvCols.init,
     cfg.export → gvExport.init, cfg.arsiv → `.lh-toggle` checkbox (etiket
     parametreli, §3.1'in 4 adından biri), cfg.tabs → `.lh-tabs` + gvChipBar.init.
     Yalnız verilen anahtarlar işlenir — hiçbiri ZORUNLU değildir. ============ */
  window.gvListHead = {
    init: function(cfg){
      cfg = cfg || {};
      var root = typeof cfg.mount === 'string' ? document.querySelector(cfg.mount) : cfg.mount;
      if(!root){ console.warn('gvListHead: mount bulunamadı', cfg.mount); return null; }
      if(root._gvListHead) return root._gvListHead;
      root.classList.add('gv-listhead');

      var lhRow = root.querySelector(':scope > .lh-row');
      if(!lhRow){
        lhRow = document.createElement('div'); lhRow.className = 'lh-row';
        root.insertBefore(lhRow, root.firstChild);
      }
      var searchWrap = lhRow.querySelector('.lh-search');
      if(!searchWrap && cfg.search){
        searchWrap = document.createElement('div'); searchWrap.className = 'lh-search';
        searchWrap.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i><input type="text">';
        lhRow.insertBefore(searchWrap, lhRow.firstChild);
      }
      if(searchWrap && cfg.search){
        var sInp = searchWrap.querySelector('input');
        if(sInp){
          if(cfg.search.placeholder) sInp.placeholder = cfg.search.placeholder;
          if(cfg.search.table) sInp.setAttribute('data-table-search', cfg.search.table);
        }
      }
      var acts = lhRow.querySelector('.lh-acts');
      if(!acts){ acts = document.createElement('div'); acts.className = 'lh-acts'; lhRow.appendChild(acts); }

      var handles = {};

      /* Gelişmiş Filtre — mevcut gvFilterDrawer'ı çağırır, yeni motor İCAT ETMEZ */
      if(cfg.filter){
        var fbtn = cfg.filter.trigger ? document.querySelector(cfg.filter.trigger) : null;
        if(!fbtn){
          fbtn = document.createElement('button');
          fbtn.type = 'button'; fbtn.className = 'btn btn-ghost btn-sm gv-fp-open';
          fbtn.innerHTML = '<i class="fa-solid fa-sliders"></i> <span class="lh-lbl">Gelişmiş Filtre</span>';
          acts.appendChild(fbtn);
        } else {
          fbtn.classList.add('gv-fp-open');
        }
        var fcfg = {}; for(var fk in cfg.filter){ if(fk !== 'trigger') fcfg[fk] = cfg.filter[fk]; }
        fcfg.mount = fbtn;
        handles.filter = window.gvFilterDrawer.init(fcfg);
      }
      /* Kolonlar — mevcut gvCols'u çağırır */
      if(cfg.cols){
        var cbtn = cfg.cols.trigger ? document.querySelector(cfg.cols.trigger) : null;
        if(!cbtn){
          cbtn = document.createElement('button');
          cbtn.type = 'button'; cbtn.className = 'btn btn-ghost btn-sm';
          cbtn.innerHTML = '<i class="fa-solid fa-table-columns"></i> <span class="lh-lbl">Kolonlar</span>';
          acts.appendChild(cbtn);
        }
        var ccfg = {}; for(var ck in cfg.cols){ if(ck !== 'trigger') ccfg[ck] = cfg.cols[ck]; }
        ccfg.mount = cbtn;
        handles.cols = window.gvCols.init(ccfg);
      }
      /* Arşivlenenleri/Pasifleri/Tamamlananları/İptal Edilenleri Göster (§3.1) —
         etiket parametreli tek toggle deseni */
      if(cfg.arsiv){
        var tgl = cfg.arsiv.trigger ? document.querySelector(cfg.arsiv.trigger) : null;
        var chk;
        if(!tgl){
          tgl = document.createElement('label'); tgl.className = 'lh-toggle';
          chk = document.createElement('input'); chk.type = 'checkbox';
          var ic = document.createElement('i'); ic.className = 'fa-solid ' + (cfg.arsiv.ikon || 'fa-box-archive');
          var lbl = document.createElement('span'); lbl.className = 'lh-lbl'; lbl.textContent = cfg.arsiv.etiket || 'Arşivlenenleri Göster';
          tgl.appendChild(chk); tgl.appendChild(ic); tgl.appendChild(lbl);
          acts.appendChild(tgl);
        } else {
          chk = tgl.querySelector('input[type="checkbox"]') || tgl;
        }
        if(cfg.arsiv.onToggle) chk.addEventListener('change', function(){ cfg.arsiv.onToggle(chk.checked); });
        handles.arsiv = { input: chk, get checked(){ return chk.checked; } };
      }
      /* Dışa Aktar — mevcut gvExport'u çağırır */
      if(cfg.export){
        var ebtn = cfg.export.trigger ? document.querySelector(cfg.export.trigger) : null;
        if(!ebtn){
          ebtn = document.createElement('a'); ebtn.href = '#'; ebtn.className = 'btn btn-ghost btn-sm';
          ebtn.innerHTML = '<i class="fa-solid fa-download"></i> <span class="lh-lbl">Dışa Aktar</span>';
          acts.appendChild(ebtn);
        }
        var xcfg = {}; for(var xk in cfg.export){ if(xk !== 'trigger') xcfg[xk] = cfg.export[xk]; }
        handles.export = window.gvExport.init(ebtn, xcfg);
      }
      /* Alt tab satırı (§2.1/§2.3) — .lh-tabs + gvChipBar slider */
      if(cfg.tabs && cfg.tabs.length){
        var tabsWrap = root.querySelector(':scope > .lh-tabs');
        if(!tabsWrap){
          tabsWrap = document.createElement('div'); tabsWrap.className = 'lh-tabs';
          var wrap = document.createElement('div'); wrap.className = 'gv-chipbar-wrap'; wrap.setAttribute('data-chipbar', '');
          var prevB = document.createElement('button'); prevB.type = 'button'; prevB.className = 'cb-arrow cb-prev'; prevB.hidden = true; prevB.setAttribute('aria-label', 'Sola kaydır'); prevB.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
          var track = document.createElement('div'); track.className = 'gv-chipbar chips';
          if(cfg.tabs.target) track.setAttribute('data-target', cfg.tabs.target);
          var nextB = document.createElement('button'); nextB.type = 'button'; nextB.className = 'cb-arrow cb-next'; nextB.hidden = true; nextB.setAttribute('aria-label', 'Sağa kaydır'); nextB.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
          (cfg.tabs.chips || []).forEach(function(c){
            var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.setAttribute('data-filter', c.filter);
            b.innerHTML = (c.ikon ? '<i class="fa-solid ' + c.ikon + '"></i> ' : '') + c.etiket + (c.sayi != null ? ' <span class="ch-cnt">' + c.sayi + '</span>' : '');
            track.appendChild(b);
          });
          wrap.appendChild(prevB); wrap.appendChild(track); wrap.appendChild(nextB);
          tabsWrap.appendChild(wrap);
          root.appendChild(tabsWrap);
        }
        window.gvChipBar.init(tabsWrap.querySelector('[data-chipbar]') || tabsWrap);
        handles.tabsEl = tabsWrap;
      }

      root._gvListHead = handles;
      return handles;
    }
  };

  /* ============================================================================
     gvTabs — §8.2 sekme görünümü (Liste/Grafikler/Özet/Rapor/Son Hareketler/
     Uyarılar). `crm-operasyon-puantaj.html`'in yerel `activateTab()` desenini
     (satır ~1824-1838, salt-okundu, o dosya DEĞİŞTİRİLMEDİ) genelleştirir:
     role=tablist/tab/tabpanel + aria-selected + klavye ok tuşu + hash/localStorage
     kalıcılığı eklendi. **JS KAPALI DAVRANIŞI**: panelleri JS ile gizler, statik
     HTML'de TÜMÜ görünür kalmalıdır (progressive enhancement, §"JS kapalı statik
     bake ikizi") — bu yüzden `hidden` özniteliği yalnız burada, çalışma zamanında
     yazılır; sayfa markup'ında ÖNCEDEN yazılmamalıdır. ============================ */
  window.gvTabs = {
    init: function(cfg){
      cfg = cfg || {};
      var mount = typeof cfg.mount === 'string' ? document.querySelector(cfg.mount) : cfg.mount;
      if(!mount){ console.warn('gvTabs: mount bulunamadı', cfg.mount); return null; }
      if(mount._gvTabs) return mount._gvTabs;
      var tabs = cfg.tabs || []; if(!tabs.length) return null;
      var screen = cfg.screen || mount.id || 'gvtabs';
      var storeKey = 'gv_tab_' + screen;

      var bar = mount.querySelector(':scope > .gv-tabbar');
      if(!bar){
        bar = document.createElement('div'); bar.className = 'gv-tabbar gv-chipbar-wrap'; bar.setAttribute('data-chipbar', '');
        var prevB = document.createElement('button'); prevB.type = 'button'; prevB.className = 'cb-arrow cb-prev'; prevB.hidden = true; prevB.setAttribute('aria-label', 'Sola kaydır'); prevB.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
        var track = document.createElement('div'); track.className = 'gv-chipbar chips'; track.setAttribute('role', 'tablist');
        var nextB = document.createElement('button'); nextB.type = 'button'; nextB.className = 'cb-arrow cb-next'; nextB.hidden = true; nextB.setAttribute('aria-label', 'Sağa kaydır'); nextB.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        bar.appendChild(prevB); bar.appendChild(track); bar.appendChild(nextB);
        tabs.forEach(function(t){
          var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.setAttribute('role', 'tab');
          b.setAttribute('data-tab', t.key); b.id = 'gvtab-' + screen + '-' + t.key;
          b.innerHTML = (t.ikon ? '<i class="fa-solid ' + t.ikon + '"></i> ' : '') + gvEscHtml(t.etiket || t.key);
          track.appendChild(b);
        });
        mount.insertBefore(bar, mount.firstChild);
      }
      var track2 = bar.querySelector('.gv-chipbar');
      var btns = {};
      track2.querySelectorAll('[data-tab]').forEach(function(b){ btns[b.getAttribute('data-tab')] = b; });
      var panels = {};
      tabs.forEach(function(t){
        var p = typeof t.panel === 'string' ? document.querySelector(t.panel) : t.panel;
        if(!p) return;
        p.classList.add('gv-tabpanel');
        p.setAttribute('role', 'tabpanel');
        if(btns[t.key]){ p.setAttribute('aria-labelledby', btns[t.key].id); btns[t.key].setAttribute('aria-controls', p.id || ''); }
        panels[t.key] = p;
      });

      function pickInitial(){
        var h = (location.hash || '').replace('#', '');
        if(h && panels[h]) return h;
        try{ var ls = localStorage.getItem(storeKey); if(ls && panels[ls]) return ls; }catch(e){}
        return cfg.varsayilan && panels[cfg.varsayilan] ? cfg.varsayilan : tabs[0].key;
      }
      function activate(key, persist){
        if(!panels[key] && !btns[key]) return;
        Object.keys(btns).forEach(function(k){
          var on = k === key;
          btns[k].classList.toggle('is-on', on);
          btns[k].setAttribute('aria-selected', on ? 'true' : 'false');
          btns[k].tabIndex = on ? 0 : -1;
        });
        Object.keys(panels).forEach(function(k){ panels[k].hidden = (k !== key); });
        if(persist){
          try{ localStorage.setItem(storeKey, key); }catch(e){}
          if(cfg.onChange) cfg.onChange(key);
        }
      }
      Object.keys(btns).forEach(function(k){
        btns[k].addEventListener('click', function(){ activate(k, true); });
      });
      track2.addEventListener('keydown', function(e){
        var keys = Object.keys(btns);
        var i = keys.indexOf(document.activeElement && document.activeElement.getAttribute('data-tab'));
        if(i === -1) return;
        if(e.key === 'ArrowRight' && keys[i + 1]){ e.preventDefault(); btns[keys[i + 1]].focus(); activate(keys[i + 1], true); }
        else if(e.key === 'ArrowLeft' && keys[i - 1]){ e.preventDefault(); btns[keys[i - 1]].focus(); activate(keys[i - 1], true); }
        else if(e.key === 'Home'){ e.preventDefault(); btns[keys[0]].focus(); activate(keys[0], true); }
        else if(e.key === 'End'){ e.preventDefault(); btns[keys[keys.length - 1]].focus(); activate(keys[keys.length - 1], true); }
      });
      window.gvChipBar.init(bar);
      activate(pickInitial(), false);
      var handle = { activate: function(k){ activate(k, true); }, el: bar };
      mount._gvTabs = handle;
      return handle;
    }
  };

  /* ============================================================================
     gvSticky — §7 sabit-kalan üst alan yardımcısı. Konumlandırma SAF CSS'tir
     (`.gv-sticky-head{position:sticky}`, ui.css) — bu fonksiyon YALNIZ elemanın
     gerçekten "yapıştığı" anı (IntersectionObserver sentinel) algılayıp
     `.gv-sticky-shadow` sınıfını ekler/çıkarır (görsel geri bildirim; JS
     yoksa/desteklenmiyorsa sticky konumlanma yine çalışır, yalnız gölge eksik kalır). */
  window.gvSticky = {
    init: function(sel, opts){
      var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
      if(!el || el._gvSticky) return el && el._gvSticky;
      opts = opts || {};
      el.classList.add('gv-sticky-head');
      if(opts.top != null) el.style.top = (typeof opts.top === 'number' ? opts.top + 'px' : opts.top);
      var handle = {el: el};
      if('IntersectionObserver' in window){
        var sentinel = document.createElement('div');
        sentinel.style.cssText = 'position:relative;height:0;width:100%;pointer-events:none';
        el.parentNode.insertBefore(sentinel, el);
        var io = new IntersectionObserver(function(entries){
          el.classList.toggle('gv-sticky-shadow', !entries[0].isIntersecting);
        }, {threshold:0});
        io.observe(sentinel);
        handle.sentinel = sentinel; handle.io = io;
      }
      el._gvSticky = handle;
      return handle;
    }
  };
})();
