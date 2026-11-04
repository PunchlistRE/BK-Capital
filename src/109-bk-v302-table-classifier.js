
/* V30.2: classifies each data table once for the responsive system. Adds classes only when
   missing (so the page stays idle); has no effect on desktop because the rules above live
   inside the mobile media query. */
(function(){
  var GENERIC=/^(value|values|units?|status|data type|basis|notes?|detail|result|action|actions|type|source|lineage|test|threshold|applies to|answer|question|effect on import|finding|severity|)$/i;
  function cols(t){
    var r=t.querySelector('thead tr')||t.querySelector('tbody tr'); if(!r) return 0;
    /* (GENERIC below) */
    var n=0; [].forEach.call(r.children,function(c){ n+=Number(c.getAttribute('colspan')||1); }); return n;
  }
  function run(){
    var vp=document.getElementById('viewport'); if(!vp) return;
    vp.querySelectorAll('table.fin').forEach(function(t){
      var want = cols(t) >= 5 ? 'bk-m-scroll' : 'bk-m-stack', other = want==='bk-m-scroll' ? 'bk-m-stack' : 'bk-m-scroll';
      if(!t.classList.contains(want)) t.classList.add(want);
      if(t.classList.contains(other)) t.classList.remove(other);
      /* stacked rows keep their column meaning: each value carries its column header as a small
         label, except the generic Value / Units / Status style columns whose meaning is obvious */
      if(want==='bk-m-stack'){
        var hs=[].map.call(t.querySelectorAll('thead th'),function(h){ return (h.textContent||'').replace(/\s+/g,' ').trim(); });
        if(hs.length>1) t.querySelectorAll('tbody tr').forEach(function(r){
          [].forEach.call(r.children,function(c,i){
            if(i===0 || c.hasAttribute('colspan')) return;
            var h=hs[i]||''; var lab=GENERIC.test(h)?'':h;
            if(lab){ if(c.getAttribute('data-bk-label')!==lab) c.setAttribute('data-bk-label',lab); }
            else if(c.hasAttribute('data-bk-label')) c.removeAttribute('data-bk-label');
          });
        });
      }
      var w=t.closest('.tbl-wrap');
      if(w){ var sc = w.scrollWidth > w.clientWidth + 2; /* any table wider than its card, on any screen, gets the scroll cue */
        if(sc && !w.classList.contains('bk-scrollable')) w.classList.add('bk-scrollable');
        if(!sc && w.classList.contains('bk-scrollable')) w.classList.remove('bk-scrollable'); }
    });
  }
  /* report tables (class rp-tbl) scroll themselves, so they get the same cue */
  function runRp(){ var vp=document.getElementById('viewport'); if(!vp) return;
    vp.querySelectorAll('table.rp-tbl').forEach(function(t){ var sc = t.scrollWidth > t.clientWidth + 2;
      if(sc !== t.classList.contains('bk-scrollable')) t.classList.toggle('bk-scrollable', sc); });
    vp.querySelectorAll('.ae table.ae-grid').forEach(function(g){ var t = g.parentElement; if(!t || t.classList.contains('ae-panel')) return; var sc = t.scrollWidth > t.clientWidth + 2;
      if(sc !== t.classList.contains('bk-scrollable')) t.classList.toggle('bk-scrollable', sc); }); }
  var q=false; function schedule(){ if(q) return; q=true; requestAnimationFrame(function(){ q=false; try{ run(); runRp(); }catch(e){} }); }
  if(typeof window.bkDisplayPass==='function') window.bkDisplayPass(schedule);
  window.addEventListener('resize', schedule);
})();
