/* KEY-FIGURE BAR MOTION AND ALIGNMENT. The bar sits under the main page only (it starts where the side menu ends, and follows the menu when it is collapsed or hidden), and while the page scrolls it slips
   down out of the way, then slides back up once scrolling stops. Presentation only. */
(function(){
'use strict';
var timer = null, away = false;
function bar(){ return document.getElementById('bk-kpibar'); }
function place(){
  var r = document.querySelector('.rail'), left = 0;
  if(r && window.innerWidth > 900){ var b = r.getBoundingClientRect(); if(b.width > 0 && getComputedStyle(r).display !== 'none') left = Math.max(0, Math.round(b.right)); }
  document.documentElement.style.setProperty('--bk-kpi-left', left + 'px');
}
function onScroll(){
  var b = bar(); if(!b || b.hidden) return;
  if(!away){ away = true; b.classList.add('bk-away'); }
  clearTimeout(timer); timer = setTimeout(function(){ away = false; var x = bar(); if(x) x.classList.remove('bk-away'); }, 260);
}
window.addEventListener('scroll', onScroll, { passive:true, capture:true });
window.addEventListener('resize', place);
try { new MutationObserver(function(){ place(); setTimeout(place, 260); }).observe(document.documentElement, { attributes:true, attributeFilter:['class'] }); } catch(e){}
document.addEventListener('click', function(){ setTimeout(place, 280); });
setInterval(place, 1500);
place();
var css = document.createElement('style'); css.id = 'bk-kpibar-motion-css';
css.textContent = '#bk-kpibar{left:var(--bk-kpi-left,0px) !important;transition:transform .28s cubic-bezier(.2,.8,.2,1),opacity .2s}#bk-kpibar.bk-away{transform:translateY(105%);opacity:.0}@media (prefers-reduced-motion:reduce){#bk-kpibar{transition:none}}';
document.head.appendChild(css);
})();
