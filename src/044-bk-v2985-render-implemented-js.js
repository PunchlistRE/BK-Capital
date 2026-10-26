
(function(){
'use strict';
function norm(s){return String(s||'').replace(/\s+/g,' ').trim();}
function implement(root){
  var scope=root||document;
  Array.prototype.forEach.call(scope.querySelectorAll('table.fin'),function(tbl){
    var hr=tbl.querySelector('thead tr');
    var heads=[];
    if(hr){
      Array.prototype.forEach.call(hr.children,function(th,i){
        var h=norm(th.textContent); heads[i]=h;
        if(/^(units?|uom|data type)$/i.test(h)){th.classList.add('bk-uom');th.style.textAlign='';}
        if(/^(notes?|notes \/ lineage|lineage|basis|source|status)$/i.test(h)){th.classList.add('bk-note');th.style.textAlign='';}
        if(/^(value|total \(\$\)|\$ \/ gsf)$/i.test(h)){th.classList.add('bk-value-head');th.style.textAlign='';}
      });
    }
    Array.prototype.forEach.call(tbl.querySelectorAll('tbody tr'),function(tr){
      var cells=Array.prototype.slice.call(tr.children);
      // Empty-state prose must read as prose, never as a metric.
      cells.forEach(function(td){
        var t=norm(td.textContent);
        if(td.colSpan>1 && (/^no\b/i.test(t)||/no .* yet/i.test(t))){
          td.classList.add('bk-empty-state');td.classList.remove('bk-a-num');td.setAttribute('data-bk-align','text');td.style.textAlign='';
        }
      });
      cells.forEach(function(td,i){
        var h=heads[i]||'';
        if(/^(units?|uom|data type)$/i.test(h)){td.classList.add('bk-uom');td.setAttribute('data-bk-align','text');td.style.textAlign='';}
        if(/^(notes?|notes \/ lineage|lineage|basis|source|status)$/i.test(h)){td.classList.add('bk-note');td.style.textAlign='';}
        if(/^(value|total \(\$\)|\$ \/ gsf)$/i.test(h) || td.classList.contains('v')){
          if(!td.classList.contains('bk-empty-state')){td.classList.add('bk-a-num');td.setAttribute('data-bk-align','num');td.style.textAlign='';}
        }
      });
      // Four-column input tables: label | value | unit | status/note.
      // Never invent a measurement. A blank unit becomes an explicit dash = N/A/unitless.
      if(heads.length>=3 && /^(units?|uom)$/i.test(heads[2]||'') && cells[2]){
        cells[2].classList.add('bk-uom');
        if(!norm(cells[2].textContent)) cells[2].textContent='-';
        var label=norm(cells[0]&&cells[0].textContent);
        var unit=norm(cells[2].textContent);
        if(/^average unit size$/i.test(label) && /^NRSF$/i.test(unit)) cells[2].textContent='NRSF / unit';
        if(/^(include|use|refinance|interest-only|gp catch-up)/i.test(label) && /^toggle$/i.test(unit)) cells[2].textContent='-';
      }
    });
  });
}
window.bkImplementApprovedRender=implement;
var prev=window.showSheet;
if(typeof prev==='function'&&!prev.__bkV2985){
  var wrapped=function(sheet){prev(sheet);try{implement(document.getElementById('viewport')||document);}catch(e){}};
  wrapped.__bkV2985=true;window.showSheet=wrapped;
}
try{implement(document);}catch(e){}
})();
