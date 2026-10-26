
(function(){
'use strict';
function norm(s){return String(s||'').replace(/\s+/g,' ').trim().toLowerCase();}
function fixFundingFill(){
 var vp=document.getElementById('viewport'); if(!vp)return;
 vp.querySelectorAll('table').forEach(function(t){
   var wrap=t.closest('.table-wrap,.sheet-table,.card')||t.parentElement;
   var context=norm((wrap&&wrap.textContent)||'');
   var heads=Array.from(t.querySelectorAll('th')).map(function(x){return norm(x.textContent);});
   var hasFundingRows=Array.from(t.querySelectorAll('tbody tr')).some(function(r){
     var first=r.children[0]; return first && /^(total uses|total sources|sources less uses|figures belong to the active deal)$/.test(norm(first.textContent));
   });
   if(!hasFundingRows || heads.indexOf('basis')<0 || heads.indexOf('status')<0)return;
   t.classList.add('bk-funding-control');
   Array.from(t.querySelectorAll('tbody tr')).forEach(function(r){
     var first=r.children[0], label=first?norm(first.textContent):'';
     if(label==='sources less uses') r.classList.add('grandtotal');
     else r.classList.remove('grandtotal');
   });
 });
}
var pending=false;function go(){if(pending)return;pending=true;requestAnimationFrame(function(){pending=false;fixFundingFill();});}
window.bkDisplayPass(go);

go();
})();
