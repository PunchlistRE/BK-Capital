
/* V29.23.0 - FLOW: a command palette (Ctrl/Cmd+K, or the Search button in the header) that jumps to any sheet or action, remembers recent sheets, and a left rail whose groups fold
   away so only the group you are working in is open. Navigation only; nothing here touches the numbers. */
(function(){
'use strict';
if(typeof GROUPS === 'undefined' || typeof showSheet !== 'function') return;
var RKEY = 'pl.recent.v1', OKEY = 'pl.rail.open.v1';
function store(k, v){ try { if(v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch(e){} return null; }
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
var CSS = '.pl-searchwrap{display:flex;justify-content:flex-end;min-width:150px}.pl-search{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.22);color:#DDE5EC;border-radius:999px;padding:7px 12px 7px 14px;font:600 11.5px Inter,system-ui,sans-serif;letter-spacing:.04em;cursor:pointer}'
 + '.pl-search:hover{background:rgba(255,255,255,.16);color:#fff}.pl-kbd{font:600 10px Inter,system-ui,sans-serif;border:1px solid rgba(255,255,255,.3);border-radius:4px;padding:1px 5px;color:#3E9AE6}'
 + '#pl-palette{position:fixed;inset:0;z-index:2000;background:rgba(10,16,22,.55);display:none;align-items:flex-start;justify-content:center;padding-top:12vh}#pl-palette.open{display:flex}'
 + '#pl-palette .box{width:min(620px,92vw);background:var(--surface,#fff);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.35);overflow:hidden;border:1px solid var(--line,#dbe4ec)}'
 + '#pl-palette input{width:100%;box-sizing:border-box;border:0;border-bottom:1px solid var(--line,#dbe4ec);padding:16px 18px;font:500 16px Inter,system-ui,sans-serif;outline:none;background:transparent;color:var(--ink-900,#10233a);text-align:left}'
 + '#pl-palette .list{max-height:52vh;overflow-y:auto;padding:6px}#pl-palette .sec{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-500,#566a80);font-weight:700;padding:10px 12px 4px}'
 + '#pl-palette .it{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;cursor:pointer;font-size:14px;color:var(--ink-900,#10233a)}#pl-palette .it .sw{width:8px;height:8px;border-radius:50%;flex:0 0 auto}#pl-palette .it .g{margin-left:auto;font-size:11px;color:var(--ink-500,#566a80)}#pl-palette .it.on{background:rgba(62,154,230,.22)}'
 + '#pl-palette .hint{padding:8px 14px;font-size:11px;color:var(--ink-500,#566a80);border-top:1px solid var(--line,#dbe4ec);display:flex;gap:14px}'
 + '.rail-group-label{cursor:pointer;user-select:none}.rail-group-label::after{content:"\\25BE";font-size:10px;margin-left:6px;opacity:.6;order:3}.rail-group.pl-collapsed .rail-group-label::after{content:"\\25B8"}.rail-group.pl-collapsed .rail-item{display:none}'
 + '@media (max-width:760px){.brand-mid{display:none !important}.pl-searchwrap{min-width:0}.pl-search span{display:none}.pl-kbd{display:none}.pl-search::before{content:"\\1F50D";font-size:13px}.brand-bar{position:relative}}';
var st = document.createElement('style'); st.id = 'pl-nav2-css'; st.textContent = CSS; document.head.appendChild(st);
document.querySelectorAll('.pl-kbd').forEach(function(k){ k.textContent = mac ? '⌘K' : 'Ctrl K'; });

/* ---- what the palette can open */
function sheets(){ var out = []; GROUPS.forEach(function(g){ if(g.hidden) return; g.sheets.forEach(function(s){ if(typeof RENDERERS !== 'undefined' && !RENDERERS[s]) return; out.push({ kind:'sheet', label:s, group:g.label, color:g.color, run:function(){ showSheet(s); } }); }); }); return out; }
function actions(){
  var A = [{ kind:'act', label:'Start a new deal', group:'Action', run:function(){ showSheet('Home'); setTimeout(function(){ if(window.bkNewDealDialog) bkNewDealDialog(); }, 50); } },
    { kind:'act', label:'Clear inputs on this deal', group:'Action', run:function(){ showSheet('Home'); setTimeout(function(){ if(window.bkClearInputsDialog) bkClearInputsDialog(); }, 50); } },
    { kind:'act', label:'Start the step-by-step guide', group:'Action', run:function(){ if(typeof bkGuideOn === 'function') bkGuideOn(); } },
    { kind:'act', label:'Import an offering memorandum and create a deal', group:'Action', run:function(){ showSheet('Import OM'); } },
    { kind:'act', label:'Import a T-12 and create a deal', group:'Action', run:function(){ showSheet('Import Deal'); } },
    { kind:'act', label:'Import a rent roll into this deal', group:'Action', run:function(){ showSheet('Import Rent Roll'); } },
    { kind:'act', label:'Save this deal to the portfolio', group:'Action', run:function(){ if(typeof bkPortfolioAddCurrent === 'function') bkPortfolioAddCurrent(); } },
    { kind:'act', label:'Switch case: Downside', group:'Action', run:function(){ setCase('Downside'); } }, { kind:'act', label:'Switch case: Base', group:'Action', run:function(){ setCase('Base'); } }, { kind:'act', label:'Switch case: Upside', group:'Action', run:function(){ setCase('Upside'); } }];
  try { if(window.bkSizeLoanDialog) A.push({ kind:'act', label:'Size the loan to policy capacity', group:'Action', run:function(){ showSheet('Home'); setTimeout(function(){ bkSizeLoanDialog(); }, 50); } }); } catch(e){}
  try { var G = window.BK_GLOSSARY || []; G.forEach(function(g){ A.push({ kind:'term', label:'Glossary: ' + g[0], group:'Definition', run:function(){ if(window.bkGlossaryShow) bkGlossaryShow(g[0]); } }); }); } catch(e){}
  try { bkPortfolioLoad().forEach(function(d){ var key = String(d.dealId || d.name || 'untitled'); A.push({ kind:'deal', label:'Open deal: ' + (d.name || d.dealId || key), group:'Saved deal', run:function(){ bkPortfolioLoadActive(key); } }); }); } catch(e){}
  return A;
}
function setCase(c){ try { var s = bkLoad(); if(s && String(s.scenarioCase || 'Base') !== c){ s.scenarioCase = c; bkSave(s); } showSheet(currentSheet); } catch(e){} }
function score(it, q){ var l = it.label.toLowerCase(), g = (it.group || '').toLowerCase(); if(!q) return 1; var toks = q.toLowerCase().split(/\s+/).filter(Boolean), sc = 0;
  for(var i = 0; i < toks.length; i++){ var t = toks[i]; if(l.indexOf(t) === 0) sc += 6; else if(l.indexOf(' ' + t) >= 0) sc += 4; else if(l.indexOf(t) >= 0) sc += 3; else if(g.indexOf(t) >= 0) sc += 1; else return 0; } return sc; }
var P = { items:[], sel:0 };
function el(){ var e = document.getElementById('pl-palette'); if(e) return e; e = document.createElement('div'); e.id = 'pl-palette'; e.setAttribute('role', 'dialog'); e.setAttribute('aria-label', 'Search sheets and actions');
  e.innerHTML = '<div class="box"><input type="text" id="pl-pq" placeholder="Search sheets and actions…" autocomplete="off" spellcheck="false"><div class="list" id="pl-pl" role="listbox"></div><div class="hint"><span>↑↓ move</span><span>Enter open</span><span>Esc close</span></div></div>';
  document.body.appendChild(e); e.addEventListener('mousedown', function(ev){ if(ev.target === e) close(); });
  e.querySelector('#pl-pq').addEventListener('input', function(){ P.sel = 0; draw(); });
  e.querySelector('#pl-pl').addEventListener('click', function(ev){ var it = ev.target.closest('.it'); if(it) choose(+it.dataset.i); });
  e.addEventListener('keydown', function(ev){ if(ev.key === 'Escape'){ ev.preventDefault(); close(); } else if(ev.key === 'ArrowDown'){ ev.preventDefault(); P.sel = Math.min(P.items.length - 1, P.sel + 1); mark(); } else if(ev.key === 'ArrowUp'){ ev.preventDefault(); P.sel = Math.max(0, P.sel - 1); mark(); } else if(ev.key === 'Enter'){ ev.preventDefault(); choose(P.sel); } });
  return e; }
function mark(){ var l = document.getElementById('pl-pl'); [].forEach.call(l.querySelectorAll('.it'), function(n){ n.classList.toggle('on', +n.dataset.i === P.sel); }); var on = l.querySelector('.it.on'); if(on && on.scrollIntoView) on.scrollIntoView({ block:'nearest' }); }
function draw(){
  var q = (document.getElementById('pl-pq').value || '').trim(), all = sheets().concat(actions()), rec = store(RKEY) || [], items;
  if(!q){ var byName = {}; all.forEach(function(x){ if(x.kind === 'sheet') byName[x.label] = x; }); var r = rec.map(function(n){ return byName[n]; }).filter(Boolean).slice(0, 6); r.forEach(function(x){ x.sec = 'Recent'; });
    var acts = actions().slice(0, 4); acts.forEach(function(x){ x.sec = 'Actions'; }); items = r.concat(acts); if(!r.length){ items = sheets().slice(0, 8).map(function(x){ x.sec = 'Sheets'; return x; }).concat(acts); } }
  else { items = all.map(function(x){ return { x:x, s:score(x, q) }; }).filter(function(z){ return z.s > 0; }).sort(function(a, b){ return b.s - a.s; }).slice(0, 40).map(function(z){ var it = z.x; it.sec = it.kind === 'sheet' ? 'Sheets' : (it.kind === 'term' ? 'Glossary' : 'Actions'); return it; }); }
  P.items = items; var html = '', last = null;
  items.forEach(function(it, i){ if(it.sec !== last){ html += '<div class="sec">' + it.sec + '</div>'; last = it.sec; }
    html += '<div class="it" role="option" data-i="' + i + '">' + (it.color ? '<span class="sw" style="background:' + it.color + '"></span>' : '') + '<span>' + esc(it.label) + '</span><span class="g">' + esc(it.group || '') + '</span></div>'; });
  document.getElementById('pl-pl').innerHTML = html || '<div class="sec">No matches</div>'; mark();
}
function choose(i){ var it = P.items[i]; if(!it) return; close(); setTimeout(function(){ it.run(); try { window.scrollTo(0, 0); } catch(e){} }, 0); }
function open(){ var e = el(); e.classList.add('open'); var q = e.querySelector('#pl-pq'); q.value = ''; P.sel = 0; draw(); setTimeout(function(){ q.focus(); }, 0); }
function close(){ var e = document.getElementById('pl-palette'); if(e) e.classList.remove('open'); }
window.bkPalette = { open:open, close:close };
document.addEventListener('keydown', function(e){
  var k = String(e.key).toLowerCase(), typing = e.target && (e.target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName));
  if((e.metaKey || e.ctrlKey) && k === 'k'){ e.preventDefault(); open(); return; }
  if(k === '/' && !typing && !e.metaKey && !e.ctrlKey){ e.preventDefault(); open(); }
}, true);
document.addEventListener('click', function(e){ if(e.target.closest && e.target.closest('[data-pl-palette]')){ e.preventDefault(); open(); } });

/* ---- recent sheets */
var _show = window.showSheet;
var wrapped = function(sheet){ try { var r = store(RKEY) || []; r = [sheet].concat(r.filter(function(x){ return x !== sheet; })).slice(0, 8); store(RKEY, r); } catch(e){} var out = _show.apply(this, arguments); setTimeout(function(){ applyRail(); railHead(); }, 0); return out; };
window.showSheet = wrapped; try { showSheet = wrapped; } catch(e){}

/* ---- rail header: the deal you are in, not the workbook name */
function railHead(){
  var h = document.querySelector('#rail .rail-head'); if(!h) return; var t = h.querySelector('h1'), p = h.querySelector('p'), e = h.querySelector('.eyebrow'); if(!t || !p) return;
  var s = null, on = true; try { on = typeof window.bkHasActiveDeal === 'function' ? window.bkHasActiveDeal() : true; s = on ? bkLoad() : null; } catch(x){}
  if(e) e.textContent = 'Punchlist Capital';
  if(s && s.name){ t.textContent = s.name; p.textContent = [s.dealType, s.propertyType, s.status].filter(Boolean).join(' \u00b7 '); } else { t.textContent = 'No deal open'; p.textContent = 'Start from Home: import a T-12 or begin a blank deal.'; }
}
/* ---- rail: only the working group is open; click a group name to open or fold it */
function groupOf(sheet){ for(var i = 0; i < GROUPS.length; i++) if(GROUPS[i].sheets.indexOf(sheet) > -1) return GROUPS[i]; return null; }
var userOpen = store(OKEY) || {};
function applyRail(){
  var rail = document.getElementById('rail-groups'); if(!rail) return; var cur = null; try { cur = currentSheet; } catch(e){} var g = groupOf(cur);
  [].forEach.call(rail.querySelectorAll('.rail-group'), function(el){ var lab = (el.querySelector('.rail-group-label span') || {}).textContent || '';
    var grp = GROUPS.filter(function(x){ return x.label === lab || lab.indexOf(x.label) === 0; })[0]; if(!grp) return;
    var open = (g && grp.id === g.id) || !!userOpen[grp.id]; var has = el.classList.contains('pl-collapsed'); if(open === has) el.classList.toggle('pl-collapsed', !open); el.setAttribute('data-pl-gid', grp.id); });
}
document.addEventListener('click', function(e){ var lab = e.target.closest && e.target.closest('#rail-groups .rail-group-label'); if(!lab) return; var grp = lab.parentNode, id = grp.getAttribute('data-pl-gid'); if(!id) return;
  var cur = null; try { cur = currentSheet; } catch(x){} var g = groupOf(cur), isCur = g && g.id === id;
  if(grp.classList.contains('pl-collapsed')){ userOpen[id] = 1; grp.classList.remove('pl-collapsed'); } else { delete userOpen[id]; if(!isCur) grp.classList.add('pl-collapsed'); else { userOpen[id] = 0; grp.classList.add('pl-collapsed'); } }
  store(OKEY, userOpen); });
/* the current group re-opens when you move into it; a folded current group stays folded until you navigate */
var rg = document.getElementById('rail-groups'); if(rg){ new MutationObserver(function(){ applyRail(); }).observe(rg, { childList:true }); }
setTimeout(function(){ applyRail(); railHead(); }, 0);
})();
