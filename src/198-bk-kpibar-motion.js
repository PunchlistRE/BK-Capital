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
/* ALIGNMENT PASS: a figure in a table cell is right-aligned wherever it is (the label column excepted), after every page */
var NUM = /^[\s$(\-\u2013]*[\d][\d.,]*\s*[%x)]?\s*$|^\(?\$[\d,.]+\)?[MK]?$|^[\u2013\u2014-]$/;
function alignPass(){
  var v = document.getElementById('viewport'); if(!v) return;
  [].forEach.call(v.querySelectorAll('table.fin tbody tr'), function(r){ [].forEach.call(r.cells, function(c, i){ if(i === 0 || c.colSpan > 1 || c.querySelector('input,select,button,a,.status-chip')) return; var t = c.textContent.trim(); if(!t || !NUM.test(t)) return; if(c.getAttribute('data-bk-align') === 'text' || c.hasAttribute('data-bk-col')) return; var ta = getComputedStyle(c).textAlign; if(ta !== 'right' && ta !== 'end') c.style.textAlign = 'right'; }); });
}
var qa = false; function laterAlign(){ if(qa) return; qa = true; (window.requestAnimationFrame || setTimeout)(function(){ qa = false; try { alignPass(); } catch(e){} }); }
document.addEventListener('DOMContentLoaded', function(){ var vp = document.getElementById('viewport'); if(vp) new MutationObserver(laterAlign).observe(vp, { childList:true, subtree:true }); laterAlign(); });
var css = document.createElement('style'); css.id = 'bk-kpibar-motion-css';
css.textContent = '#bk-kpibar{left:var(--bk-kpi-left,0px) !important;transition:transform .28s cubic-bezier(.2,.8,.2,1),opacity .2s}#bk-kpibar.bk-away{transform:translateY(105%);opacity:.0}@media (min-width:901px){html body.bk-has-kpibar .rail{max-height:100vh !important;height:100vh !important;top:0 !important}}#bk-kpibar{overflow:hidden}#bk-kpibar .kb-c,#bk-kpibar .kb-c.kb-long{flex:0 0 120px !important;width:120px;box-sizing:border-box;padding-left:10px;padding-right:8px}#bk-tie-hdr{display:inline-flex;align-items:center;margin-right:10px;font-size:11px}#viewport table.fin tbody tr td{height:28px;vertical-align:middle}#viewport table.fin tbody tr.grandtotal td,#viewport table.fin tbody tr.subtotal td{height:28px}@media (prefers-reduced-motion:reduce){#bk-kpibar{transition:none}}';
document.head.appendChild(css);
})();
