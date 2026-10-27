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
function run(){ queued = false; var v = document.getElementById('viewport'); if(v) icons(v); rail(); }
function later(){ if(!queued){ queued = true; (window.requestAnimationFrame || setTimeout)(run); } }
if(stored()) html.classList.add('bk-rail-collapsed');
document.addEventListener('keydown', function(e){ if(e.key !== '[' || e.ctrlKey || e.metaKey || e.altKey) return; var t = e.target; if(t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return; window.bkRailCollapse(); });
function start(){ run(); var mo = new MutationObserver(later); ['viewport', 'rail'].forEach(function(id){ var el = document.getElementById(id); if(el) mo.observe(el, { childList:true, subtree:true }); }); }
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
