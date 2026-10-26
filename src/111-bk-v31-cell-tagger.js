
/* V31: tags every financial-table cell with what it IS, from its contents - an editable control,
   a pill, a number, text - never from row labels or column headings. The cell authority styles
   only from this tag. Writes attributes only when they change, so pages stay idle. */
(function(){
  var NUM=/^(\(?-?\$?\(?[\d,]*\.?\d+\)?\s*(%|x|bps|yrs?|mo)?\)?|-|\u2013|\u2014|n\/a|\$?-|\(\$?[\d,]*\.?\d+\))$/i;
  function t(e){ return (e.textContent||'').replace(/\u00a0/g,' ').trim(); }
  /* a figure, or a pair of figures shown as "A / B" (e.g. "$76,861 / $76,861") */
  function isNum(x){ x=String(x||'').replace(/\s+/g,' ').trim(); if(!x) return false;
    return x.split(' / ').every(function(p){ return NUM.test(p.replace(/\s+/g,'')); }); }
  function set(el,k,v){ if(el.getAttribute(k)!==v) el.setAttribute(k,v); }
  var GRID=false;
  function kindOf(td, i, tr){
    var ctl = td.querySelector('select,input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),textarea');
    /* structural: a value cell of an input row with a bound key is editable (bkWire makes it so
       after render, so the attribute itself cannot be relied on at tagging time) */
    var editable = td.isContentEditable || td.getAttribute('contenteditable')==='true' ||
                   (td.classList.contains('v') && tr.classList.contains('input') && tr.hasAttribute('data-bk-key'));
    if(ctl || editable){
      var fmt=(tr.dataset && tr.dataset.bkFmt)||'';
      var numeric = (ctl && ctl.tagName==='INPUT' && ctl.type==='number') ||
                    (!ctl && fmt && fmt!=='text' && fmt!=='date') ||
                    (!ctl && !fmt && isNum(t(td)));
      return numeric ? 'input-num' : 'input-text';
    }
    if(i===0) return 'label';
    var chips=td.querySelectorAll('.status-chip');
    var txt=t(td);
    if(chips.length){
      var rest=txt; chips.forEach(function(c){ rest=rest.replace(t(c),''); });
      if(!rest.replace(/[\s\u25cf\u2022]/g,'')) return 'chip';
    }
    if(!txt) return 'empty';
    /* a bare dash outside the Value column of an input grid is a placeholder, not a calculated figure */
    if(i>=2 && /^[-\u2013\u2014]$/.test(txt)) return 'empty';
    /* a figure in an input grid that is not itself editable is a calculated value */
    if(isNum(txt)) return (tr.classList.contains('input') || GRID) ? 'calc' : 'num';
    return 'text';
  }
  function run(){
    var vp=document.getElementById('viewport'); if(!vp) return;
    vp.querySelectorAll('.status-chip').forEach(function(c){
      var empty = !t(c).replace(/[\u25cf\u2022\s]/g,'');
      if(empty){ if(c.getAttribute('data-bk-pill-empty')!=='1') c.setAttribute('data-bk-pill-empty','1'); }
      else if(c.hasAttribute('data-bk-pill-empty')) c.removeAttribute('data-bk-pill-empty');
    });
    vp.querySelectorAll('table.fin').forEach(function(tb){
      var colNum={}, colAll={}, inNum={}, inTxt={}, hasSel={};
      GRID = !!tb.querySelector('tbody tr.input');
      tb.querySelectorAll('tbody tr').forEach(function(tr){
        var i=0;
        [].forEach.call(tr.children,function(td){
          var k=kindOf(td,i,tr); set(td,'data-bk-kind',k);
          if(k==='empty' && i>=2 && /^[-\u2013\u2014]$/.test(t(td))) set(td,'data-bk-ph','1'); else if(td.hasAttribute('data-bk-ph')) td.removeAttribute('data-bk-ph');
          if(!td.hasAttribute('colspan')){
            if(k==='input-num') inNum[i]=(inNum[i]||0)+1; else if(k==='input-text') inTxt[i]=(inTxt[i]||0)+1;
            if(/^input/.test(k) && td.querySelector('select')) hasSel[i]=1; }
          if(!td.hasAttribute('colspan')){ colAll[i]=(colAll[i]||0)+(k==='empty'?0:1); if(/num|calc/.test(k)) colNum[i]=(colNum[i]||0)+1; }
          i+=Number(td.getAttribute('colspan')||1);
        });
      });
      /* a column is numeric when most of its filled cells are figures; text inside a numeric
         column ("Pari passu", "IRR") follows the column so every column has ONE alignment */
      var tableIsGrid = !!tb.querySelector('tbody tr.input') || tb.classList.contains('bk-grid4') || tb.classList.contains('bk-grid3');
      tb.querySelectorAll('tbody tr').forEach(function(tr){
        var i=0;
        [].forEach.call(tr.children,function(td){
          var span=Number(td.getAttribute('colspan')||1), numCol = i>0;
          for(var c=i;c<i+span && numCol;c++){ numCol = !!(colAll[c] && colNum[c]/colAll[c] >= 0.5); }
          if(span>1 && i===0) numCol=false;
          var k=td.getAttribute('data-bk-kind');
          /* a column that holds mostly editable figures aligns its editable text/dropdowns with them */
          var colIsNum = !!(colAll[i] && colNum[i]/colAll[i] >= 0.5);
          var mixNum = span===1 && i>0 && k==='input-text' && colIsNum;
          var leftFig = !tableIsGrid && span===1 && i>0 && (k==='num'||k==='calc') && colAll[i] && colNum[i]/colAll[i] < 0.5;
          if((numCol && (k==='text'||k==='empty'||k==='chip')) || mixNum) set(td,'data-bk-col','num');
          else if(leftFig) set(td,'data-bk-col','left');
          else if(td.hasAttribute('data-bk-col')) td.removeAttribute('data-bk-col');
          var gut = span===1 && i>0 && /^input/.test(k) && hasSel[i] && colIsNum;
          if(gut) set(td,'data-bk-gutter','1'); else if(td.hasAttribute('data-bk-gutter')) td.removeAttribute('data-bk-gutter');
          i+=Number(td.getAttribute('colspan')||1);
        });
      });
      /* every financial table whose 2nd column is figures shares ONE value line (60% of the card), so tables stacked on a page never disagree */
      var nc=0; [].some.call(tb.querySelectorAll('tbody tr'),function(r){ if(r.querySelector('[colspan]')) return false; nc=r.children.length; return true; });
      var hr0=tb.querySelector('thead tr:last-child');
      var isG0=!!tb.querySelector('tbody tr.input') || tb.classList.contains('bk-grid4') || tb.classList.contains('bk-grid3') ||
               !!(hr0 && (hr0.children.length===3||hr0.children.length===4) && /^field$/i.test(t(hr0.children[0])) && /^value$/i.test(t(hr0.children[1])));
      var col3Num = nc>=3 && colAll[2] && colNum[2]/colAll[2]>=0.5;   /* a time-series schedule (figure | figure | figure) is not a value/basis table */
      var vt = (!isG0 && nc>=2 && nc<=4 && !col3Num && colAll[1] && colNum[1]/colAll[1]>=0.5 && !tb.classList.contains('bk-m-scroll')) ? 'bk-vt'+nc : '';
      var tt = (!isG0 && !vt && nc>=2 && nc<=4 && !col3Num && !tb.classList.contains('bk-m-scroll') && !(nc>2 && tb.classList.contains('wrap'))) ? 'bk-tt'+nc : '';
      ['bk-tt2','bk-tt3','bk-tt4'].forEach(function(c){ if(c!==tt && tb.classList.contains(c)) tb.classList.remove(c); });
      if(tt && !tb.classList.contains(tt)) tb.classList.add(tt);
      ['bk-vt2','bk-vt3','bk-vt4'].forEach(function(c){ if(c!==vt && tb.classList.contains(c)) tb.classList.remove(c); });
      if(vt && !tb.classList.contains(vt)) tb.classList.add(vt);
      var hr=tb.querySelector('thead tr:last-child'); if(!hr) return;
      /* input grids (tables of editable rows) share ONE column geometry app-wide, so stacked grids
         line up: Field | Value | Units/Type/Basis | Status */
      var nh=hr.children.length, isGrid=!!tb.querySelector('tbody tr.input');
      /* a Field | Value | ... table is an input grid even when every row is linked / read-only, so stacked tables never disagree */
      if(!isGrid && (nh===3||nh===4) && /^field$/i.test(t(hr.children[0])) && /^value$/i.test(t(hr.children[1]))) isGrid=true;
      var g = isGrid && nh===4 ? 'bk-grid4' : (isGrid && nh===3 ? 'bk-grid3' : '');
      ['bk-grid4','bk-grid3'].forEach(function(c){ if(c!==g && tb.classList.contains(c)) tb.classList.remove(c); });
      if(g && !tb.classList.contains(g)) tb.classList.add(g);
      var i=0;
      [].forEach.call(hr.children,function(th){
        var k = (i>0 && colAll[i] && colNum[i]/colAll[i] >= 0.5) ? 'num' : 'text';
        set(th,'data-bk-kind',k); i+=Number(th.getAttribute('colspan')||1);
      });
    });
  }
  var q=false; function schedule(){ if(q) return; q=true; requestAnimationFrame(function(){ q=false; try{ run(); }catch(e){} }); }
  if(typeof window.bkDisplayPass==='function') window.bkDisplayPass(schedule);
  window.bkCellTaggerRun=run;
})();
