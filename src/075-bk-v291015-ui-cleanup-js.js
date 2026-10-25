
(function(){
  function moneyDisplay(input){
    if(!input || input.dataset.bkMoneyClean==='1') return;
    input.dataset.bkMoneyClean='1';
    const format=()=>{
      const n=Number(input.value);
      if(!Number.isFinite(n)) return;
      input.value=n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    };
    const raw=()=>{ input.value=String(input.value).replace(/[$,]/g,''); };
    input.addEventListener('focus',raw);
    input.addEventListener('blur',format);
    format();
  }

  function clean(){
    const root=document.getElementById('viewport');
    if(!root) return;

    /* Depreciation status column: convert text statuses to the same compact pill language */
    root.querySelectorAll('.bk-dep-v2 table.fin').forEach(table=>{
      const headers=[...table.querySelectorAll('thead th')].map(x=>(x.textContent||'').trim().toLowerCase());
      const si=headers.indexOf('status');
      if(si<0) return;
      table.querySelectorAll('tbody tr').forEach(tr=>{
        const td=tr.children[si];
        if(!td || td.querySelector('.bk-status-pill')) return;
        const val=(td.textContent||'').trim();
        if(!val) return;
        const cls=/calc/i.test(val)?'calc':/linked/i.test(val)?'linked':/source/i.test(val)?'source':'';
        td.innerHTML='<span class="bk-status-pill '+cls+'">'+val+'</span>';
      });
    });

    /* Only the depreciation land/component money inputs get display formatting */
    root.querySelectorAll('.bk-dep-v2 input.dep-money').forEach(moneyDisplay);
  }

  function boot(){
    clean();
    window.bkDisplayPass(()=>requestAnimationFrame(clean));
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
