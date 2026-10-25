
(function(){
  'use strict';
  function money0(text){
    var s=String(text==null?'':text).trim();
    var m=s.match(/^\(?\$\s*([\d,]+)(?:\.(\d+))?\)?$/);
    if(!m) return null;
    var neg=s.charAt(0)==='(';
    var n=Number(m[1].replace(/,/g,'')+'.'+(m[2]||'0'));
    if(!isFinite(n)) return null;
    var v='$'+Math.round(Math.abs(n)).toLocaleString('en-US');
    return neg?'('+v+')':v;
  }
  function clean(root){
    root=root||document;
    var vp=root.querySelector('#viewport')||root;
    vp.querySelectorAll('table').forEach(function(t){
      var heads=Array.from(t.querySelectorAll('thead th')).map(function(x){return (x.textContent||'').trim();});
      var isSU=/sources\s*&\s*uses|sources|uses/i.test((t.closest('.card,.panel,.section')||{}).textContent||'') || heads.some(function(h){return /^(value|basis|status|total|\$\s*\/\s*unit|\$\s*\/\s*sf|% of uses)$/i.test(h)});
      // Institutional alignment: labels left, numeric/value columns right, explanatory text left.
      t.querySelectorAll('thead tr').forEach(function(tr){
        Array.from(tr.children).forEach(function(th,i){
          var h=(th.textContent||'').trim();
          /* V31: alignment removed - owned by bk-v31-cell-authority */
        });
      });
      t.querySelectorAll('tbody tr').forEach(function(tr){
        var cells=Array.from(tr.children);
        if(!cells.length)return;
        var label=(cells[0].textContent||'').trim();
        /* V31: the Sponsor / LP Equity row is now marked up as a normal row at its source (it was
           a mis-classed total that this block painted white again); alignment belongs to the authority. */
      });
    });
    // Currency display standard: whole dollars workbook-wide. Never mutate form controls/state.
    vp.querySelectorAll('td,th,span,div').forEach(function(el){
      if(el.children.length || el.closest('input,select,textarea') || el.matches('input,select,textarea') || bkIsEditing(el)) return;
      var v=money0(el.textContent);
      if(v!==null && v!==el.textContent.trim()) el.textContent=v;
    });
  }
  var queued=false;
  function run(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;try{clean(document)}catch(e){}})}
  window.bkDisplayPass(run);
  run();
})();
