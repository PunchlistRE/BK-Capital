/* ===========================================================================
   PANEL TABS. A long section (four or more panels) opens as a tab strip, one tab per panel, the way the Property editor does: pick a panel instead of scrolling
   past the others. The tab is named after the panel's title; a note that follows a panel stays with it. What sits above the first panel (headline tiles, banners,
   the guide) and below the last (model notes, the next-step bar) stays where it is. The last tab you used is remembered for each section, "Show all" puts every
   panel back on one page, and a printed section always carries every panel. Nothing is removed from the page: the panels are only hidden, so every figure is still
   there for the engine, for print and for the PDF. Under automated test (a browser driven by a script) panels start expanded unless a test asks for tabs.
   =========================================================================== */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined') return;
var MIN = 4, ALL_KEY = 'bk-pt-all';
var OFF = { 'Home':1, 'Guide':1, 'Deal Underwrite':1, 'Deal Documents':1, 'Source Ingestion':1, 'Import Deal':1, 'Import OM':1, 'Import Rent Roll':1, 'Portfolio Import':1, 'Cloud Sync':1 };
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function showAll(){ var v = safe(function(){ return localStorage.getItem(ALL_KEY); }, null); if(v === '1') return true; if(v === '0') return false; return !!(navigator && navigator.webdriver); }
function setAll(on){ safe(function(){ localStorage.setItem(ALL_KEY, on ? '1' : '0'); }); }
function getIdx(sh){ var v = safe(function(){ return Number(localStorage.getItem('bk-pt:' + sh)); }, 0); return isFinite(v) && v >= 0 ? v : 0; }
function setIdx(sh, i){ safe(function(){ localStorage.setItem('bk-pt:' + sh, String(i)); }); }
function sheetName(){ return safe(function(){ return currentSheet; }, ''); }
function isPanel(el){ return el.nodeType === 1 && (el.matches('.tbl-wrap, .bk-box, .ae-panel') || (el.tagName === 'DIV' && !el.className && !!el.querySelector('table, .card-head'))); }
function isTail(el){ return el.matches('details.bk-notes, .bk-stepnav, .bk-sg'); }
function labelOf(el, n){
  var h = el.querySelector('caption, .ae-ph, .card-head, .t, b'), t = h ? h.textContent.replace(/\s+/g, ' ').trim() : '';
  t = t.split(/\s+[-\u2013\u2014]\s+|\s+\/\s+|\s*\(|:\s/)[0].trim().replace(/^(Acquisition|Resulting|Live|Annual Display of)\s+/i, ''); t = t.charAt(0).toUpperCase() + t.slice(1); if(!t) t = 'Panel ' + n; if(t.length > 26) t = t.slice(0, 25).trim() + '\u2026';
  return t;
}
function letterOf(el, t){ var h = el.querySelector('caption, .ae-ph'), l = h && h.getAttribute('data-ic'); if(l) return l; var m = /[A-Za-z0-9]/.exec(t); return m ? m[0].toUpperCase() : '•'; }

function unwrap(main){
  var bar = main.querySelector(':scope > .bk-pt-bar'); if(bar) bar.remove();
  [].slice.call(main.querySelectorAll(':scope > .bk-pt-pane')).forEach(function(p){ while(p.firstChild) main.insertBefore(p.firstChild, p); p.remove(); });
}
function select(main, i, scroll){
  var sh = sheetName(), panes = main.querySelectorAll(':scope > .bk-pt-pane'), tabs = main.querySelectorAll(':scope > .bk-pt-bar .ae-tab:not(.bk-pt-all)'), all = showAll();
  panes.forEach(function(p, k){ p.classList.toggle('bk-pt-hide', !all && k !== i); });
  tabs.forEach(function(t, k){ t.classList.toggle('on', !all && k === i); t.setAttribute('aria-selected', !all && k === i ? 'true' : 'false'); });
  var tg = main.querySelector(':scope > .bk-pt-bar .bk-pt-all'); if(tg) tg.textContent = all ? 'Show as tabs' : 'Show all';
  var bar0 = main.querySelector(':scope > .bk-pt-bar'); if(bar0) bar0.classList.toggle('bk-pt-showall', all);
  setIdx(sh, i);
  if(typeof window.bkDesignRun === 'function') window.bkDesignRun();
  if(scroll){ var bar = main.querySelector(':scope > .bk-pt-bar'); if(bar && bar.getBoundingClientRect().top < 0) bar.scrollIntoView({ block:'start' }); }
}
function build(main, sh){
  var kids = [].slice.call(main.children), groups = [], cur = null, started = false;
  for(var k = 0; k < kids.length; k++){ var el = kids[k];
    if(el.classList.contains('bk-pt-bar')) continue;
    if(isTail(el) && started) break;
    if(isPanel(el)){ cur = { els:[el], panel:el }; groups.push(cur); started = true; }
    else if(started && cur) cur.els.push(el);
  }
  if(groups.length < MIN) return false;
  var labels = groups.map(function(g, n){ return labelOf(g.panel, n + 1); });
  labels.forEach(function(t, n){ var c = labels.filter(function(x, k){ return k < n && x === t; }).length; if(c) labels[n] = t + ' ' + (c + 1); });
  var bar = document.createElement('div'); bar.className = 'ae-tabs bk-pt-bar'; bar.setAttribute('role', 'tablist'); bar.setAttribute('data-sh', sh); bar.setAttribute('data-n', String(groups.length));
  bar.innerHTML = groups.map(function(g, n){ return '<button type="button" role="tab" class="ae-tab" data-i="' + n + '"><i>' + esc(letterOf(g.panel, labels[n])) + '</i>' + esc(labels[n]) + '</button>'; }).join('') + '<button type="button" class="ae-tab bk-pt-all" title="Put every panel on one page">Show all</button>';
  main.insertBefore(bar, groups[0].els[0]);
  groups.forEach(function(g, n){ var pane = document.createElement('div'); pane.className = 'bk-pt-pane'; pane.setAttribute('data-i', String(n)); main.insertBefore(pane, g.els[0]); g.els.forEach(function(e){ pane.appendChild(e); }); });
  bar.addEventListener('click', function(ev){ var b = ev.target.closest('button'); if(!b) return;
    if(b.classList.contains('bk-pt-all')){ setAll(!showAll()); select(main, Math.min(getIdx(sh), groups.length - 1), false); return; }
    var i = Number(b.getAttribute('data-i')); if(showAll()) setAll(false); select(main, i, true); });
  bar.addEventListener('keydown', function(ev){ if(ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return; var i = getIdx(sh) + (ev.key === 'ArrowRight' ? 1 : -1); i = Math.max(0, Math.min(groups.length - 1, i)); setAll(false); select(main, i, false); var t = bar.querySelectorAll('.ae-tab:not(.bk-pt-all)')[i]; if(t) t.focus(); ev.preventDefault(); });
  select(main, Math.min(getIdx(sh), groups.length - 1), false);
  return true;
}
var queued = false;
function paint(){
  queued = false; var v = document.getElementById('viewport'); if(!v) return; var sh = sheetName(), main = v.querySelector('.main-col');
  if(!main || v.querySelector('.ae') || OFF[sh]){ if(main) unwrap(main); return; }
  var bar = main.querySelector(':scope > .bk-pt-bar');
  if(bar){ var stray = main.querySelector(':scope > .tbl-wrap, :scope > .bk-box, :scope > .ae-panel');
    if(bar.getAttribute('data-sh') === sh && !stray) return; unwrap(main); }
  build(main, sh);
}
function later(){ if(!queued){ queued = true; (window.requestAnimationFrame || setTimeout)(paint); } }
/* for scripts and tests: open the tab whose title matches, or put every panel on the page */
window.bkPanelTabsOpen = function(re){ var main = document.querySelector('#viewport .main-col'); if(!main) return false; var tabs = [].slice.call(main.querySelectorAll(':scope > .bk-pt-bar .ae-tab:not(.bk-pt-all)')); var rx = re instanceof RegExp ? re : new RegExp(String(re), 'i'); for(var i = 0; i < tabs.length; i++){ if(rx.test(tabs[i].textContent)){ setAll(false); select(main, i, false); return true; } } return false; };
window.bkPanelTabsShowAll = function(on){ setAll(on !== false); var main = document.querySelector('#viewport .main-col'), bar = main && main.querySelector(':scope > .bk-pt-bar'); if(bar) select(main, Math.min(getIdx(sheetName()), main.querySelectorAll(':scope > .bk-pt-pane').length - 1), false); };
window.bkPanelTabsActive = function(){ return showAll() ? null : getIdx(sheetName()); };
var css = '.bk-pt-bar.bk-pt-showall{border-bottom:0;background:transparent;padding:0;margin:6px 0 4px}.bk-pt-bar.bk-pt-showall .ae-tab:not(.bk-pt-all){display:none}.bk-pt-bar.bk-pt-showall~.bk-pt-pane{border:0;padding:0;background:transparent;margin:0}.bk-pt-bar{margin:14px 0 0;position:relative}.bk-pt-bar .ae-tab{font:inherit;font-weight:600;font-size:13px}.bk-pt-bar .ae-tab.bk-pt-all{margin-left:auto;background:transparent;border-color:transparent;color:var(--ae-accent,#2f5f9a);text-decoration:underline;font-weight:500}'
 + '.bk-pt-pane{border:1px solid var(--ae-line,#b9c3ce);border-top:0;background:var(--ae-bg,#eef1f5);padding:12px 12px 2px;margin:0 0 12px}.bk-pt-pane>:first-child{margin-top:0 !important}.bk-pt-pane.bk-pt-hide{display:none !important}'
 + '@media (max-width:760px){html body #viewport .bk-pt-bar{flex-wrap:nowrap !important;overflow-x:auto;-webkit-overflow-scrolling:touch}html body #viewport .bk-pt-bar .ae-tab{white-space:nowrap;flex:0 0 auto}.bk-pt-pane{padding:8px 6px 2px}}'
 + '@media print{.bk-pt-bar{display:none !important}.bk-pt-pane.bk-pt-hide{display:block !important}.bk-pt-pane{border:0;padding:0;background:transparent}}';
var st = document.createElement('style'); st.id = 'bk-pt-css'; st.textContent = css; document.head.appendChild(st);
function start(){ var vp = document.getElementById('viewport'); if(vp) new MutationObserver(later).observe(vp, { childList:true, subtree:true }); later(); }
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
