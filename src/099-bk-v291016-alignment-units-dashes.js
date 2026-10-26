
(function(){
'use strict';
function txt(n){return String((n&&n.textContent)||'').trim();}
function dollar0(v){
  var s=String(v||'').trim();
  if(/^\$/.test(s)||/^\(\$/.test(s)) return s.replace(/\.00\b/g,'');
  if(/^[-+]?\d[\d,]*(?:\.\d+)?$/.test(s)){
    var n=Number(s.replace(/,/g,'')); if(!isFinite(n)) return s;
    return (n<0?'($'+Math.round(Math.abs(n)).toLocaleString('en-US')+')':'$'+Math.round(n).toLocaleString('en-US'));
  }
  return s;
}
function normalize(root){
  var vp=(root||document).querySelector('#viewport')||root||document;
  /* Absolutely no long dash characters/entities in rendered user-facing copy. */
  var w=document.createTreeWalker(vp,NodeFilter.SHOW_TEXT); var n;
  while((n=w.nextNode())){ if(bkIsEditing(n)) continue; var nv=n.nodeValue.replace(/[\u2014\u2013]/g,'-'); if(nv!==n.nodeValue) n.nodeValue=nv; }

  vp.querySelectorAll('table').forEach(function(t){
    var hs=Array.from(t.querySelectorAll('thead th'));
    var heads=hs.map(function(h){return txt(h);});
    /* Canonical unit headers. */
    hs.forEach(function(h){
      var x=txt(h);
      x=x.replace(/^\$\s*\/\s*Unit$/i,'$/unit')
         .replace(/^\$\s*\/\s*SF$/i,'$/SF')
         .replace(/^\$\s*\/\s*GSF$/i,'$/GSF')
         .replace(/^%\s+of\s+Uses$/i,'% of Uses');
      if(txt(h)!==x) h.textContent=x;
    });
    heads=hs.map(function(h){return txt(h);});
    var basisIdx=heads.findIndex(function(h){return /^(basis|units?|units\s*\/\s*basis|status)$/i.test(h);});
    hs.forEach(function(th,i){
      var h=txt(th);
          /* V31: alignment removed - owned by bk-v31-cell-authority */
    });
    t.querySelectorAll('tbody tr').forEach(function(tr){
      var cells=Array.from(tr.children); if(!cells.length)return;
      cells.forEach(function(td,i){
        var h=heads[i]||'';
          /* V31: alignment removed - owned by bk-v31-cell-authority */
      });
    });
  });
  /* V30: one alignment rule (identical to the V29.10.15 pass - "$/unit" is a numeric column),
     and text is written only when it changes. The previous "unit" vs "units" disagreement made
     the two passes rewrite each other forever on Sources & Uses. */
  function setTxt(el,v){ if(el.textContent!==v) el.textContent=v; }
  function colHead(td){ var t=td.closest('table'); if(!t) return ''; var th=t.querySelectorAll('thead th')[td.cellIndex]; return th?String(th.textContent||'').trim():''; }

  /* Sources & Uses / S&U check: these are currency outputs, not unitless counts. */
  vp.querySelectorAll('tr').forEach(function(tr){
    var cells=Array.from(tr.children); if(cells.length<2)return;
    var label=txt(cells[0]);
    if(/^(Total Uses|Total Sources|Acquisition Loan|Sponsor\s*\/\s*LP Equity|TOTAL USES|TOTAL SOURCES)$/i.test(label)){
      for(var i=1;i<cells.length;i++){
        if(cells[i].querySelector('input,select,textarea,.status-chip'))continue;
        if(/month|count|%|ratio|dscr|\bx\b/i.test(colHead(cells[i]))) continue;   /* a month count is not money ("$120") */
        var v=txt(cells[i]); if(/^[-+]?\d[\d,]*(?:\.\d+)?$/.test(v)||/^\$/.test(v)) setTxt(cells[i],dollar0(v));
      }
    }
    if(/^Loan\s*\/\s*Equity$/i.test(label)){
      for(var j=1;j<cells.length;j++){
        var q=txt(cells[j]);
        var m=q.match(/^\s*([\d,.]+)\s*\/\s*([\d,.]+)\s*$/);
        if(m) setTxt(cells[j],dollar0(m[1])+' / '+dollar0(m[2]));
      }
    }
  });

  /* Cards use div rows rather than tables on some pages. */
  vp.querySelectorAll('*').forEach(function(el){
    if(el.children.length>6)return;
    var s=txt(el);
    if(/^(Total Uses|Total Sources)$/i.test(s) && el.parentElement){
      Array.from(el.parentElement.children).forEach(function(c){
        if(c===el)return; var v=txt(c); if(/^\d[\d,]*(?:\.\d+)?$/.test(v)) setTxt(c,dollar0(v));
      });
    }
    if(/^Loan\s*\/\s*Equity$/i.test(s) && el.parentElement){
      Array.from(el.parentElement.children).forEach(function(c){
        if(c===el)return; var m=txt(c).match(/^([\d,.]+)\s*\/\s*([\d,.]+)$/); if(m)setTxt(c,dollar0(m[1])+' / '+dollar0(m[2]));
      });
    }
  });
}
var pending=false; function go(){if(pending)return;pending=true;requestAnimationFrame(function(){pending=false;normalize(document);});}
window.bkDisplayPass(go);

go();
})();
