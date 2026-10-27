/* ===========================================================================
   DAY / NIGHT TOGGLE. A round button in the header, the same as on the Punchlist site: it shows a sun while the page is dark (click for day) and a moon
   while it is light (click for night). With no choice made the page follows the device setting, as it always has; once you click, your choice is kept
   in this browser. The header is rebuilt when a deal loads, so the button is put back whenever it goes missing. The stylesheets already carry a dark set of rules keyed to the device setting, and most also carry an explicit data-theme override.
   Two of them (the editor and the institutional layer) have no explicit dark set, so rather than copy hundreds of rules this switches those media
   queries on or off in the loaded stylesheets, which makes the existing rules follow the toggle. Nothing is duplicated and no figure is touched.
   =========================================================================== */
(function(){
'use strict';
var KEY = 'bk-theme', root = document.documentElement;
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function stored(){ var v = safe(function(){ return localStorage.getItem(KEY); }, null); return v === 'dark' || v === 'light' ? v : null; }
function osDark(){ return !!safe(function(){ return window.matchMedia('(prefers-color-scheme: dark)').matches; }, false); }
function effective(){ var m = root.getAttribute('data-theme'); return m === 'dark' || m === 'light' ? m : (osDark() ? 'dark' : 'light'); }

/* the media rules that depend on the device setting, with their original conditions remembered so "follow the device" can restore them */
var rules = null;
function collect(){
  rules = [];
  safe(function(){ [].forEach.call(document.styleSheets, function(sh){ var rs; try { rs = sh.cssRules; } catch(e){ return; }
    [].forEach.call(rs || [], function(r){ if(r.type === 4 && r.media && /prefers-color-scheme/.test(r.media.mediaText)){ var t = r.media.mediaText; rules.push({ r:r, orig:t, kind:/dark/.test(t) ? 'dark' : 'light' }); } }); }); });
}
function apply(mode){
  if(!rules) collect();
  if(mode === 'dark' || mode === 'light') root.setAttribute('data-theme', mode); else root.removeAttribute('data-theme');
  rules.forEach(function(x){ var t = x.orig;
    if(mode === 'dark') t = x.kind === 'dark' ? 'all' : 'not all'; else if(mode === 'light') t = x.kind === 'light' ? 'all' : x.orig;
    safe(function(){ if(x.r.media.mediaText !== t) x.r.media.mediaText = t; }); });
  root.style.colorScheme = mode || '';
}
function paint(){
  var b = document.getElementById('bk-theme-btn'), host = document.querySelector('.pl-searchwrap'); if(!host) return;
  if(!b){ b = document.createElement('button'); b.type = 'button'; b.id = 'bk-theme-btn'; b.addEventListener('click', function(){ window.bkTheme.toggle(); }); host.appendChild(b); }
  var dark = effective() === 'dark';
  b.setAttribute('data-icon', dark ? 'sun' : 'moon'); b.setAttribute('aria-label', dark ? 'Switch to day mode' : 'Switch to night mode'); b.title = dark ? 'Switch to day mode' : 'Switch to night mode';
  b.innerHTML = dark
    ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>'
    : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"/></svg>';
}
function redraw(){ safe(function(){ if(typeof showSheet === 'function' && typeof currentSheet !== 'undefined') showSheet(currentSheet); }); }
window.bkTheme = {
  get: function(){ return effective(); },
  stored: stored,
  set: function(mode){ if(mode === 'dark' || mode === 'light'){ safe(function(){ localStorage.setItem(KEY, mode); }); apply(mode); } else { safe(function(){ localStorage.removeItem(KEY); }); apply(null); }
    paint(); setTimeout(redraw, 0); },
  toggle: function(){ window.bkTheme.set(effective() === 'dark' ? 'light' : 'dark'); }
};
var css = '#bk-theme-btn{flex:0 0 auto;width:38px;height:38px;margin-left:10px;padding:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:transparent;color:inherit;border:1px solid rgba(128,128,128,.5);border-color:color-mix(in srgb,currentColor 30%,transparent);cursor:pointer;transition:background .15s,border-color .15s}'
 + '#bk-theme-btn:hover{background:rgba(128,128,128,.16);border-color:color-mix(in srgb,currentColor 55%,transparent)}#bk-theme-btn:focus-visible{outline:2px solid #4aa3ee;outline-offset:2px}'
 + '@media (max-width:760px){#bk-theme-btn{width:28px;height:28px;margin-left:2px}#bk-theme-btn svg{width:16px;height:16px}}@media print{#bk-theme-btn{display:none !important}}';
var st = document.createElement('style'); st.id = 'bk-theme-css'; st.textContent = css; document.head.appendChild(st);

var s0 = stored(); if(s0) apply(s0);
var queued = false; function later(){ if(queued) return; queued = true; (window.requestAnimationFrame || setTimeout)(function(){ queued = false; if(document.querySelector('.pl-searchwrap') && !document.getElementById('bk-theme-btn')) paint(); }); }
function start(){ paint(); if(document.body) new MutationObserver(later).observe(document.body, { childList:true, subtree:true }); if(window.matchMedia) safe(function(){ window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(){ if(!stored()) { paint(); redraw(); } }); }); }
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
setTimeout(paint, 300);
})();
