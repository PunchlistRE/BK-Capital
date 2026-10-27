/* ONE DESIGN LANGUAGE, the parts CSS cannot do: each panel header (table caption, card head) and each top-nav tab gets the
   editor's letter icon, and the sidebar collapses to a strip of group letters (button in the rail, or the [ key; remembered). */
(function(){
'use strict';
var KEY = 'bk.railCollapsed', html = document.documentElement;
function letter(t){ var m = /[A-Za-z0-9]/.exec(String(t || '')); return m ? m[0].toUpperCase() : '•'; }
function store(v){ try { if(v) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch(e){} }
function stored(){ try { return localStorage.getItem(KEY) === '1'; } catch(e){ return false; } }
function setCollapsed(v){ html.classList.toggle('bk-rail-collapsed', !!v); store(v); var b = document.querySelector('.bk-rail-toggle'); if(b){ b.textContent = v ? '›' : '‹'; b.title = (v ? 'Expand' : 'Collapse') + ' the sidebar ([)'; b.setAttribute('aria-expanded', v ? 'false' : 'true'); } }
window.bkRailCollapse = function(v){ setCollapsed(v === undefined ? !html.classList.contains('bk-rail-collapsed') : v); };
function icons(root){
  /* the letter is an attribute drawn by CSS (::before), so no text is added to the headers and nothing that reads them changes */
  [].forEach.call(root.querySelectorAll('table.fin > caption, .card-head'), function(h){ if(h.hasAttribute('data-ic') || h.closest('.ae')) return; h.setAttribute('data-ic', letter(h.textContent)); });
  [].forEach.call(root.querySelectorAll('.tabnav-primary .grp-btn .sw'), function(sw){ if(!sw.hasAttribute('data-ic')) sw.setAttribute('data-ic', letter(sw.parentNode.textContent)); });
}
/* a column that holds status chips is centred, header and cells alike */
function chipCols(root){
  [].forEach.call(root.querySelectorAll('table'), function(t){
    var cols = {}; [].forEach.call(t.rows, function(r){ [].forEach.call(r.cells, function(c){ if(c.tagName === 'TH' || c.colSpan !== 1) return; var k = c.cellIndex, o = cols[k] || (cols[k] = { chip:0, other:0 }), ch = c.querySelector('.status-chip'), tx = c.textContent.trim();
      if(!tx) return; if(ch && tx === ch.textContent.trim()) o.chip++; else o.other++; }); });
    Object.keys(cols).forEach(function(k){ var o = cols[k]; if(!o.chip || o.chip < 0.6 * (o.chip + o.other)) return;
      [].forEach.call(t.rows, function(r){ var c = r.cells[k]; if(c && c.colSpan === 1) c.classList.add('bk-col-chip'); }); });
  });
}
/* a figure with a unit beside its box ("12.00 %"): the unit gets a fixed slot inside the cell, and every box in that column gets the same slot, so the figures end on one line and nothing spills across the column border */
function sfxSlots(root){
  var UNIT = /^\s*(%|x|bps|yrs?|years|mo|months|SF|psf|\$)\s*$/i;
  var tailOf = function(inp){ var out = [], n = inp.nextSibling; while(n){ if(n.nodeType === 1 && (n.classList.contains('bk-sfx') || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(n.tagName) || n.querySelector('input,select,textarea,button'))) break; if(n.nodeType === 3 || n.nodeType === 1) out.push(n); n = n.nextSibling; } return out; };
  [].forEach.call(root.querySelectorAll('table.fin'), function(t){
    var cols = {}; [].forEach.call(t.rows, function(r){ [].forEach.call(r.cells, function(c){ if(c.colSpan !== 1 || c.tagName === 'TH') return; var ip = c.querySelector(':scope > input:not([type=checkbox]):not([type=radio])'); if(!ip) return;
      if(c.querySelector(':scope > .bk-sfx') || UNIT.test(tailOf(ip).map(function(n){ return n.textContent; }).join(''))) cols[c.cellIndex] = 1; }); });
    Object.keys(cols).forEach(function(k){ [].forEach.call(t.rows, function(r){ var c = r.cells[k]; if(!c || c.colSpan !== 1 || c.querySelector(':scope > .bk-sfx')) return; var inp = c.querySelector(':scope > input:not([type=checkbox]):not([type=radio])'); if(!inp) return;
      var tail = tailOf(inp), txt = tail.map(function(n){ return n.textContent; }).join(''); if(txt.trim() && !UNIT.test(txt)) return;
      tail.forEach(function(n){ n.parentNode.removeChild(n); });
      var sp = document.createElement('span'); sp.className = 'bk-sfx'; sp.textContent = txt.trim(); c.appendChild(sp); c.classList.add('bk-has-sfx'); inp.classList.add('bk-sfx-in'); }); });
  });
}
/* every column header takes the alignment of the cells under it: the dominant computed alignment of the column's body cells */
function alignHeads(root){
  [].forEach.call(root.querySelectorAll('table.fin'), function(t){
    var heads = [].filter.call(t.rows, function(r){ return r.parentNode.tagName === 'THEAD' || (r.cells.length && [].every.call(r.cells, function(c){ return c.tagName === 'TH'; })); }); if(!heads.length) return;
    var body = [].filter.call(t.rows, function(r){ return heads.indexOf(r) < 0 && r.cells.length > 1; }).slice(0, 14); if(!body.length) return;
    heads.forEach(function(hr){ [].forEach.call(hr.cells, function(th){ if(th.colSpan !== 1) return; var i = th.cellIndex, n = { l:0, r:0, c:0 }, tot = 0;
      body.forEach(function(r){ var td = r.cells[i]; if(!td || td.colSpan !== 1 || !td.textContent.trim() && !td.querySelector('input,select')) return; var a = getComputedStyle(td).textAlign; tot++; if(a === 'right' || a === 'end') n.r++; else if(a === 'center') n.c++; else n.l++; });
      if(tot < 2) return; var k = n.r >= n.c && n.r >= n.l ? 'r' : n.c >= n.l ? 'c' : 'l'; if(n[k] / tot < 0.6) return;
      ['bk-h-l', 'bk-h-r', 'bk-h-c'].forEach(function(c){ th.classList.remove(c); }); th.classList.add('bk-h-' + k);
      /* the header's text starts or ends where the figures under it do: measure the cells' own ink edge and pad the header to it */
      if(k !== 'c'){ var thr = th.getBoundingClientRect(), offs = []; if(thr.width > 0){
        body.forEach(function(r){ var td = r.cells[i]; if(!td || td.colSpan !== 1) return; var el = td.querySelector('input:not([type=checkbox]),select'), edge = null;
          if(el){ var er = el.getBoundingClientRect(), cs = getComputedStyle(el); if(er.width > 0 && (cs.textAlign === (k === 'r' ? 'right' : 'left') || cs.textAlign === 'start' && k === 'l')) edge = k === 'r' ? er.right - (parseFloat(cs.paddingRight) || 0) - (parseFloat(cs.borderRightWidth) || 0) : er.left + (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.borderLeftWidth) || 0); }
          else if(td.textContent.trim()){ var rg = document.createRange(); rg.selectNodeContents(td); var rr = rg.getBoundingClientRect(); if(rr.width > 0) edge = k === 'r' ? rr.right : rr.left; }
          if(edge != null) offs.push(k === 'r' ? thr.right - edge : edge - thr.left); });
        if(offs.length >= 2){ offs.sort(function(a, b){ return a - b; }); var m = offs[Math.floor(offs.length / 2)]; if(isFinite(m) && m >= 0 && m < 160) th.style.setProperty(k === 'r' ? 'padding-right' : 'padding-left', Math.max(2, Math.round(m)) + 'px', 'important'); } } } }); });
  });
}
function rail(){
  var r = document.getElementById('rail'); if(!r) return;
  if(!r.querySelector('.bk-rail-toggle')){ var b = document.createElement('button'); b.type = 'button'; b.className = 'bk-rail-toggle'; b.onclick = function(){ window.bkRailCollapse(); }; r.insertBefore(b, r.firstChild); setCollapsed(html.classList.contains('bk-rail-collapsed')); }
  [].forEach.call(r.querySelectorAll('.rail-group'), function(g){ var lab = g.querySelector('.rail-group-label'); if(!lab) return;
    g.classList.toggle('has-active', !!g.querySelector('.rail-item.active'));
    var it = g.querySelector('.rail-item'), name = (lab.querySelector('span') || lab).textContent;
    if(!lab.hasAttribute('data-ic')){ lab.setAttribute('data-ic', letter(name)); lab.title = name; if(it) lab.style.setProperty('--rg-color', getComputedStyle(it).getPropertyValue('--gid-color') || ''); }
    if(!lab.__bkRg){ lab.__bkRg = 1;
      /* collapsed: the group's letter opens the sidebar on that group */
      lab.addEventListener('click', function(e){ if(!html.classList.contains('bk-rail-collapsed')) return; e.stopPropagation(); e.preventDefault(); setCollapsed(false); g.classList.remove('pl-collapsed'); g.scrollIntoView({ block:'nearest' }); }, true); } });
}
var queued = false;
function run(){ queued = false; var v = document.getElementById('viewport'); if(v){ icons(v); chipCols(v); sfxSlots(v); alignHeads(v); setTimeout(function(){ var w = document.getElementById('viewport'); if(w) alignHeads(w); }, 450); } rail(); var ah = document.querySelector('.rail .bk-adv-head span'); if(ah && ah.textContent.length > 14){ ah.title = ah.textContent; ah.textContent = 'Advanced'; } }
function later(){ if(!queued){ queued = true; (window.requestAnimationFrame || setTimeout)(run); } }
if(stored()) html.classList.add('bk-rail-collapsed');
document.addEventListener('keydown', function(e){ if(e.key !== '[' || e.ctrlKey || e.metaKey || e.altKey) return; var t = e.target; if(t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return; window.bkRailCollapse(); });
var rz; window.addEventListener('resize', function(){ clearTimeout(rz); rz = setTimeout(function(){ var w = document.getElementById('viewport'); if(w) alignHeads(w); }, 200); });
function start(){ run(); var mo = new MutationObserver(later); ['viewport', 'rail'].forEach(function(id){ var el = document.getElementById(id); if(el) mo.observe(el, { childList:true, subtree:true }); }); }
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
