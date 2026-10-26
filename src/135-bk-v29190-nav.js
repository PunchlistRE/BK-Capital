
/* top-bar dropdowns: only one open at a time, hover-to-switch once one is open, arrow keys within a menu */
(function(){
'use strict';
document.addEventListener('click', function(e){
  var b = e.target.closest && e.target.closest('[data-bk-more]'); var mine = b && b.closest('.bk-more');
  if(mine && mine.classList.contains('bk-nav') && e.isTrusted && mine.classList.contains('open') && Date.now() - (+mine.dataset.hov || 0) < 1200){ mine.dataset.hov = 0; e.stopPropagation(); return; }   /* the hover already opened it: do not toggle it shut */
  document.querySelectorAll('.bk-nav.open').forEach(function(m){ if(m !== mine) m.classList.remove('open'); });
}, true);
document.addEventListener('mouseover', function(e){
  var b = e.target.closest && e.target.closest('.bk-nav > [data-bk-more]'); if(!b) return;
  var open = document.querySelector('.bk-nav.open'); if(open && open !== b.parentNode){ b.click(); b.parentNode.dataset.hov = Date.now(); }
});
document.addEventListener('keydown', function(e){
  var open = document.querySelector('.bk-nav.open'); if(!open || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
  var items = [].slice.call(open.querySelectorAll('.it')), i = items.indexOf(document.activeElement) ; e.preventDefault();
  i = e.key === 'ArrowDown' ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1); items[i].focus();
});
function tidy(){
  document.querySelectorAll('#viewport table.fin').forEach(function(t){ var c = t.caption ? t.caption.textContent : '';
    if(/Underwriting Conventions|Tax-Grade Depreciation Settings/i.test(c) && !t.classList.contains('bk-conv')) t.classList.add('bk-conv');   /* guard: classList.add on an existing class still fires the class observer */
    if(/Conflicting Inputs/i.test(c) && !t.hasAttribute('data-bk-findings')) t.setAttribute('data-bk-findings','1'); });
  /* an input followed by a unit (%, x, bps) must not wrap the unit onto its own line */
  document.querySelectorAll('#viewport td[data-bk-kind="input-text"]').forEach(function(td){ var i = td.querySelector('input'); if(!i || td.hasAttribute('data-bk-sfx')) return;
    var tail = ''; for(var n = i.nextSibling; n; n = n.nextSibling) tail += n.textContent; if(/^\s*(%|x|bps)\s*$/.test(tail)) td.setAttribute('data-bk-sfx','1'); });
  var cs = null; try { cs = currentSheet; } catch(e){}
  var f = document.querySelector('#viewport .sheet-frame');
  if(f && cs === 'Investor Schedules' && !f.querySelector('table') && !f.querySelector('.bk-empty-note')){ var m = f.querySelector('.note-flag'); if(m){ var d = document.createElement('div'); d.className = 'note-flag bk-empty-note'; d.style.marginTop = '12px';
    d.innerHTML = '<span>&#9432;</span><div>No investors have commitments on this deal yet. Add investors on the <a data-goto-sheet2="Investors" style="cursor:pointer">Investors</a> page and each one\u2019s cash-flow schedule appears here.</div>'; m.parentNode.insertBefore(d, m.nextSibling); } }
}
function mark(){ tidy(); document.querySelectorAll('.bk-nav-pop .it').forEach(function(x){ x.tabIndex = -1; x.setAttribute('role', 'menuitem'); });
  document.querySelectorAll('.bk-nav > .grp-btn').forEach(function(x){ x.tabIndex = 0; });
  document.querySelectorAll('.bk-nav.open').forEach(function(m){ var b = m.querySelector('.grp-btn'); if(b) b.setAttribute('aria-expanded', 'true'); }); }
new MutationObserver(mark).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] }); mark();
document.addEventListener('keydown', function(e){ if((e.key === 'Enter' || e.key === ' ') && document.activeElement && document.activeElement.matches('.bk-nav .it')){ e.preventDefault(); document.activeElement.click(); }
  if((e.key === 'Enter' || e.key === ' ') && document.activeElement && document.activeElement.matches('.bk-nav > .grp-btn')){ e.preventDefault(); document.activeElement.click(); } });
})();
