
(function(){
  function isMoneyUnit(unit){
    unit=String(unit||'').trim();
    return unit.charAt(0)==='$';
  }
  function moneyDecimals(unit){
    unit=String(unit||'').trim().toLowerCase();
    return (unit==='$') ? 0 : 2;
  }
  function formatMoneyText(raw, unit){
    var t=String(raw==null?'':raw).trim();
    if(!t || t==='-' || t==='-' || t.indexOf('$')===0) return t;
    /* Never touch dropdown/text labels. */
    var cleaned=t.replace(/,/g,'');
    if(!/^-?\d+(\.\d+)?$/.test(cleaned)) return t;
    var n=Number(cleaned);
    if(!isFinite(n)) return t;
    var dec=moneyDecimals(unit);
    return '$'+n.toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec});
  }
  function normalizeDealUnderwrite(html){
    var tpl=document.createElement('template');
    tpl.innerHTML=html;
    tpl.content.querySelectorAll('table.fin').forEach(function(table){
      var head=table.querySelector('thead tr');
      if(!head) return;
      var ths=head.querySelectorAll('th');
      /* Deal Underwrite input tables are 3- or 4-column Field/Value/Units[/Status] tables.
         Do not coerce unrelated analytical tables with other shapes. */
      var first=(ths[0]&&ths[0].textContent||'').trim().toLowerCase();
      var second=(ths[1]&&ths[1].textContent||'').trim().toLowerCase();
      if(first!=='field' || second!=='value') return;

      if(ths.length===3){
        var sh=document.createElement('th');
        sh.textContent='Status';
        head.appendChild(sh);
        table.querySelectorAll('tbody tr').forEach(function(tr){
          if(tr.children.length===3){
            var td=document.createElement('td');
            td.innerHTML='<span class="status-chip pass">OK</span>';
            tr.appendChild(td);
          }
        });
      }
      table.classList.add('bk-input-grid');

      table.querySelectorAll('tbody tr').forEach(function(tr){
        if(tr.children.length<3) return;
        var value=tr.children[1], unit=tr.children[2];
        var u=(unit.textContent||'').trim();
        if(!isMoneyUnit(u)) return;
        if(value.querySelector('select,input')) return;
        var raw=value.textContent;
        var formatted=formatMoneyText(raw,u);
        if(formatted!==raw.trim()) value.textContent=formatted;
      });
    });
    return tpl.innerHTML;
  }

  try{
    if(typeof RENDERERS!=='undefined' && RENDERERS['Deal Underwrite']){
      var prior=RENDERERS['Deal Underwrite'];
      var wrapped=function(){
        var o=prior();
        if(o && typeof o.main==='string') o.main=normalizeDealUnderwrite(o.main);
        return o;
      };
      wrapped.__bkV291011=true;
      RENDERERS['Deal Underwrite']=wrapped;
      if(typeof window.bkRegisterRenderer==='function'){
        try{ window.bkRegisterRenderer('Deal Underwrite', wrapped); }catch(e){}
      }
    }
  }catch(e){ console.error('V29.10.11 input formatting/grid patch failed',e); }

  /* Re-render the current page so the patch is visible immediately when this file opens. */
  try{
    if(typeof currentSheet!=='undefined' && currentSheet==='Deal Underwrite' && typeof showSheet==='function'){
      showSheet('Deal Underwrite');
    }
  }catch(e){}
})();
