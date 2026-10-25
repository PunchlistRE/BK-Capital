
(function(){
'use strict';
function text(n){return String(n&&n.textContent||'').trim();}
function fix(){
 var vp=document.getElementById('viewport'); if(!vp)return;
 vp.querySelectorAll('table').forEach(function(t){
   var hs=Array.from(t.querySelectorAll('thead th')); if(hs.length!==5)return;
   var h=hs.map(text);
   var isSU=/\$\s*\/\s*unit/i.test(h[2]||'') && /\$\s*\/\s*SF/i.test(h[3]||'') && /%\s*of\s*Uses/i.test(h[4]||'');
   if(!isSU)return;
   t.classList.add('bk-su-grid');
   if(hs[1].textContent!=='Total ($)') hs[1].textContent='Total ($)';
   if(hs[2].textContent!=='$/unit') hs[2].textContent='$/unit';
   if(hs[3].textContent!=='$/SF') hs[3].textContent='$/SF';
   if(hs[4].textContent!=='% of Uses') hs[4].textContent='% of Uses';
 });
}
var q=false;function run(){if(q)return;q=true;requestAnimationFrame(function(){q=false;fix();});}
window.bkDisplayPass(run);

run();
})();
