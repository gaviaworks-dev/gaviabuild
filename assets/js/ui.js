/* =====================================================================
   GAVIA CRM — PAYLAŞILAN UI PRİMİTİFLERİ (kabuk-bağımsız)
   gvToast · gvConfirm (+ delege yıkıcı-aksiyon onayı) · hesap dropdown ·
   data-demo sim toast'ı · data-export format menüsü (GV_EXPORTERS kayıtlıysa
   gerçek .xlsx/.csv indirme, değilse [MOCK-SİM] toast) ·
   tablo arama + chip filtre yardımcıları ·
   gvChain onay zinciri (timeline + rozet + onayla/reddet/revize aksiyonu) ·
   gvUrlState (?f=&q=&page= URL-state, D17) · gvNotFound kayıt-bulunamadı kartı (D17) ·
   gv-pager sayfalandırma (data-paginate, D17; data-paginate-key namespace, D18) ·
   gv-empty "Filtreleri temizle" (D17) · gvApplyFilters + tbl._gvApply bileşik-motor
   delegasyonu (D18 — çifte-listener bulgusunun kalıcı çözümü).
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
  var EXP_FMT_REAL = [                 /* gerçek indirmede PDF yok — basılı döküm "Çıktı Al" ekranlarının işi */
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
    document.title = 'Kayıt Bulunamadı — Gavia CRM';
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
      return Array.prototype.filter.call(el.querySelectorAll(rowSel), function(r){ return !r.hidden; });
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
    var sel = '.gv-tabs,.pf-tabs,.gc-body.flush';
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
    var el = e.target.closest('.gv-tabs,.pf-tabs,.gc-body.flush');
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

  /* ============ D1-T-CSS — GELİŞMİŞ FİLTRE PANELİ (gvFilterPanel, §9) ============
     HTML iskeleti + sınıf sözleşmesi: tasks/spec-filtre-tarih.md.
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
      var triggers = document.querySelectorAll(opts.trigger || (panelId ? '[data-fpanel="' + panelId + '"]' : '[data-fpanel]'));
      var activeRow = opts.activeRow ? document.querySelector(opts.activeRow) : document.querySelector('.gv-achips-row');
      var activeList = activeRow ? activeRow.querySelector('.gv-achips') : null;
      var table = opts.table ? document.querySelector(opts.table) : null;
      var closeBtn = panel.querySelector('.gv-fpanel-close');
      var state = {};

      function setOpen(o){ ov.classList.toggle('open', o); }
      triggers.forEach(function(t){ t.addEventListener('click', function(e){ e.preventDefault(); setOpen(true); }); });
      if(closeBtn) closeBtn.addEventListener('click', function(){ setOpen(false); });
      ov.addEventListener('click', function(e){ if(e.target === ov) setOpen(false); });
      document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && ov.classList.contains('open')) setOpen(false); });

      function fieldLabel(field){
        var lbl = field.getAttribute('data-fp-label');
        if(lbl) return lbl;
        var wrap = field.closest('.gfield');
        var l = wrap && wrap.querySelector('label');
        return l ? l.textContent.trim() : field.getAttribute('data-fp-key');
      }
      function fieldValueLabel(field){
        if(field.tagName === 'SELECT'){
          var opt = field.options[field.selectedIndex];
          return opt ? opt.textContent.trim() : field.value;
        }
        return field.value;
      }
      function readFilters(){
        var out = {};
        panel.querySelectorAll('[data-fp-key]').forEach(function(field){
          var key = field.getAttribute('data-fp-key');
          if(field.hasAttribute('data-gvdaterange')){
            var v = field._gvValue;
            if(v) out[key] = {value:v, label:fieldLabel(field) + ': ' + v.label, raw:v};
            return;
          }
          if(field.type === 'checkbox'){
            if(field.checked) out[key] = {value:'1', label:fieldLabel(field)};
            return;
          }
          if(!field.value) return;
          out[key] = {value:field.value, label:fieldLabel(field) + ': ' + fieldValueLabel(field)};
        });
        return out;
      }
      function applyToTable(){
        if(!table) return;
        var keys = Object.keys(state);
        table.querySelectorAll('tbody tr').forEach(function(row){
          var ok = true;
          keys.forEach(function(k){
            if(!ok) return;
            if(k === 'tarih'){
              var ds = row.getAttribute('data-tarih');
              var rg = state[k].raw;
              if(ds && rg && rg.from){
                var d = new Date(ds + 'T00:00:00');
                if(d < rg.from || d > rg.to) ok = false;
              }
              return;
            }
            var attr = row.getAttribute('data-' + k);
            if(attr !== null && attr !== state[k].value) ok = false;
          });
          if(row.hidden) ok = false;   /* mevcut arama/hızlı-çip filtresiyle AND (D18 delegasyonu olmayan basit tablo) */
          row.classList.toggle('gv-fp-hide', !ok);
        });
        if(window.gvPagerRefresh) window.gvPagerRefresh(table, true);
      }
      function renderChips(){
        var keys = Object.keys(state);
        var count = keys.length;
        triggers.forEach(function(t){
          var badge = t.querySelector('.fp-count');
          if(!badge){ badge = document.createElement('span'); badge.className = 'fp-count'; t.appendChild(badge); }
          badge.textContent = count; badge.hidden = !count;
        });
        if(!activeRow) return;
        activeRow.hidden = !count;
        if(!activeList) return;
        activeList.innerHTML = '';
        keys.forEach(function(k){
          var chip = document.createElement('span');
          chip.className = 'gv-achip';
          var txt = document.createElement('span'); txt.textContent = state[k].label;
          var x = document.createElement('button');
          x.type = 'button'; x.className = 'ac-x'; x.setAttribute('data-k', k); x.setAttribute('aria-label', 'Filtreyi kaldır');
          x.innerHTML = '<i class="fa-solid fa-xmark"></i>';
          x.addEventListener('click', function(){ removeOne(k); });
          chip.appendChild(txt); chip.appendChild(x);
          activeList.appendChild(chip);
        });
      }
      function resetFields(){
        panel.querySelectorAll('[data-fp-key]').forEach(function(field){
          if(field.hasAttribute('data-gvdaterange')){ if(field._gvDr) field._gvDr.clear(); }
          else if(field.type === 'checkbox') field.checked = false;
          else field.value = '';
        });
      }
      function removeOne(key){
        delete state[key];
        var field = panel.querySelector('[data-fp-key="' + key + '"]');
        if(field){
          if(field.hasAttribute('data-gvdaterange')){ if(field._gvDr) field._gvDr.clear(); }
          else if(field.type === 'checkbox') field.checked = false;
          else field.value = '';
        }
        applyToTable(); renderChips();
        if(opts.onApply) opts.onApply(state);
      }
      function doApply(){
        state = readFilters();
        applyToTable(); renderChips();
        setOpen(false);
        if(opts.onApply) opts.onApply(state);
      }
      function doClear(){
        resetFields();
        state = {};
        applyToTable(); renderChips();
        setOpen(false);
        if(opts.onClear) opts.onClear();
        if(opts.onApply) opts.onApply(state);
      }
      var applyBtn = panel.querySelector('[data-fp-apply]');
      var clearBtn = panel.querySelector('[data-fp-clear]');
      if(applyBtn) applyBtn.addEventListener('click', doApply);
      if(clearBtn) clearBtn.addEventListener('click', doClear);
      if(activeRow){
        var clearAllBtn = activeRow.querySelector('[data-fp-clear-all]');
        if(clearAllBtn) clearAllBtn.addEventListener('click', doClear);
      }

      panel._gvFp = { apply:doApply, clear:doClear, state:function(){ return state; }, refresh:function(){ applyToTable(); renderChips(); } };
      return panel._gvFp;
    }
  };
})();
