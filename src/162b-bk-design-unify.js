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
  [].forEach.call(root.querySelectorAll('table.fin > caption, .card-head'), function(h){ if(h.querySelector(':scope > i.ae-ic') || h.closest('.ae')) return; var i = document.createElement('i'); i.className = 'ae-ic'; i.setAttribute('aria-hidden', 'true'); i.textContent = letter(h.textContent); h.insertBefore(i, h.firstChild); });
  [].forEach.call(root.querySelectorAll('.tabnav-primary .grp-btn'), function(b){ var sw = b.querySelector('.sw'); if(!sw || sw.textContent) return; sw.textContent = letter(b.textContent); });
}
function rail(){
  var r = document.getElementById('rail'); if(!r) return;
  if(!r.querySelector('.bk-rail-toggle')){ var b = document.createElement('button'); b.type = 'button'; b.className = 'bk-rail-toggle'; b.onclick = function(){ window.bkRailCollapse(); }; r.insertBefore(b, r.firstChild); setCollapsed(html.classList.contains('bk-rail-collapsed')); }
  [].forEach.call(r.querySelectorAll('.rail-group'), function(g){ var lab = g.querySelector('.rail-group-label'); if(!lab) return;
    g.classList.toggle('has-active', !!g.querySelector('.rail-item.active'));
    if(lab.querySelector('.rg-ic')) return; var it = g.querySelector('.rail-item'), name = (lab.querySelector('span') || lab).textContent;
    /* an <i>, not a <span>: the rail code reads each group's name from the label's first span */
    var i = document.createElement('i'); i.className = 'rg-ic'; i.textContent = letter(name); i.title = name;
    if(it) i.style.setProperty('--rg-color', getComputedStyle(it).getPropertyValue('--gid-color') || '');
    /* collapsed: a letter opens the sidebar on that group */
    i.addEventListener('click', function(e){ if(!html.classList.contains('bk-rail-collapsed')) return; e.stopPropagation(); setCollapsed(false); g.classList.remove('pl-collapsed'); g.scrollIntoView({ block:'nearest' }); }, true);
    lab.insertBefore(i, lab.firstChild); });
}
var queued = false;
function run(){ queued = false; var v = document.getElementById('viewport'); if(v) icons(v); rail(); }
function later(){ if(!queued){ queued = true; (window.requestAnimationFrame || setTimeout)(run); } }
if(stored()) html.classList.add('bk-rail-collapsed');
document.addEventListener('keydown', function(e){ if(e.key !== '[' || e.ctrlKey || e.metaKey || e.altKey) return; var t = e.target; if(t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return; window.bkRailCollapse(); });
function start(){ run(); var mo = new MutationObserver(later); ['viewport', 'rail'].forEach(function(id){ var el = document.getElementById(id); if(el) mo.observe(el, { childList:true, subtree:true }); }); }
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
