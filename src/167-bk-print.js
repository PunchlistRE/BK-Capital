/* ===========================================================================
   PRINT / SAVE PDF FOR ANY SECTION. Every sheet gets a "Print / Save PDF" button. The page that prints is that section only: the Punchlist logo and a deal
   summary (property, asset class, location, units, price, hold, case, headline returns, date) as the header, then the section's own panels and tables
   as they are on screen, laid out for paper (letter, margins, repeated table headers, rows and panels kept whole, wide schedules turned to landscape).
   The application chrome (sidebar, tabs, step bar, buttons, deal snapshot column) is left out. Ctrl/Cmd+P gives the same page.
   =========================================================================== */
(function(){
'use strict';
if(typeof bkLoad !== 'function') return;
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function num(x){ var v = Number(x); return isFinite(v) ? v : NaN; }
function M(v){ return !isFinite(v) ? '—' : (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US'); }
function P2(v){ return !isFinite(v) ? '—' : (v * 100).toFixed(2) + '%'; }

var CSS = '#bk-print-head,#bk-print-foot{display:none}.title-block{position:relative}.title-block .bk-print-btn{position:absolute;top:12px;right:128px;z-index:2}@media (max-width:760px){.title-block .bk-print-btn{position:static;margin:6px 0 0}}'
 + '@media print{'
 + 'html,body{background:#fff !important;color:#14202b !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
 + '.rail,.brand-bar,.tabnav,.tabnav-primary,.bk-flow,.bk-stepnav,.bk-case,.side-col,.title-block,.bk-dui,.pf-bar,.rp-bar,.bk-rail-toggle,#bk-sync-status,#bk-auth-gate,#pl-palette,#pl-modal,#pl-tip,.colour-key,.bk-key-wrap,.bk-print-btn,.ae-hint,.bk-notes,.bk-addrow,.bk-guide,#bk-guide,.bk-reqbar,.bk-undo,.bk-savebar,.bk-hint,.bk-scrollhint,.bk-scroll-hint,button,.pl-hbtn,.bk-btn,.pl-btn,select{display:none !important}'
 + '.shell{display:block !important;height:auto !important}.sheet-viewport,#viewport,.sheet-frame,.body-grid{display:block !important;overflow:visible !important;height:auto !important;width:auto !important;max-width:none !important;margin:0 !important;padding:0 !important;position:static !important}'
 + '.main-col{display:block !important;width:100% !important;max-width:none !important;padding:0 !important;margin:0 !important}'
 + '#bk-print-head{display:block !important;margin:0 0 12px;padding:0 0 10px;border-bottom:2px solid #14202b}'
 + '#bk-print-head .ph-top{display:flex;align-items:center;justify-content:space-between;gap:16px}'
 + '#bk-print-head .ph-brand{display:flex;align-items:center;gap:10px}#bk-print-head .ph-brand svg{width:38px;height:38px}#bk-print-head .ph-brand b{display:block;font:700 15px/1.1 Inter,system-ui,sans-serif;letter-spacing:.02em}#bk-print-head .ph-brand span{font:500 9px/1.3 Inter,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#566a80}'
 + '#bk-print-head .ph-meta{text-align:right;font:500 9px/1.4 Inter,system-ui,sans-serif;color:#566a80}'
 + '#bk-print-head h1{font:700 20px/1.2 Inter,system-ui,sans-serif;margin:10px 0 2px;letter-spacing:-.01em}#bk-print-head .ph-sub{font:500 11px/1.4 Inter,system-ui,sans-serif;color:#44515f}'
 + '#bk-print-head .ph-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:0;margin-top:9px;border:1px solid #b8c2cc}#bk-print-head .ph-strip div{padding:5px 8px;border-right:1px solid #d5dce3}#bk-print-head .ph-strip div:last-child{border-right:0}#bk-print-head .ph-strip i{display:block;font:600 7.5px/1.2 Inter,system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#566a80;font-style:normal}#bk-print-head .ph-strip b{font:700 11.5px/1.3 Inter,system-ui,sans-serif}'
 + '#bk-print-head .ph-sec{margin-top:12px;font:700 13px/1.2 Inter,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#14202b}#bk-print-head .ph-desc{font:400 10px/1.4 Inter,system-ui,sans-serif;color:#566a80;margin-top:2px}'
 + '#bk-print-foot{display:block !important;position:fixed;left:0;right:0;bottom:0;padding:4px 0 0;border-top:1px solid #c5ced7;font:500 8px/1.3 Inter,system-ui,sans-serif;color:#6b7a89;text-align:center}'
 + 'body{font-size:9.5pt !important}'
 + '.card,.bk-snap,.pl-card,.bx,.bk-kpi,.note-flag,.metric-row{break-inside:avoid;page-break-inside:avoid;box-shadow:none !important}'
 + '.tbl-wrap{overflow:visible !important;max-height:none !important;box-shadow:none !important;break-inside:auto;margin-bottom:10px !important}'
 + 'table.fin{width:100% !important;min-width:0 !important;table-layout:auto !important;font-size:8.6pt !important;border-collapse:collapse !important}'
 + 'table.fin thead{display:table-header-group !important}table.fin tr,table.fin .metric-row{break-inside:avoid;page-break-inside:avoid}table.fin caption,table.fin thead tr{break-after:avoid;page-break-after:avoid}table.fin tbody tr:first-child{break-before:avoid;page-break-before:avoid}'
 + 'table.fin th,table.fin td{padding:3px 6px !important;position:static !important}'
 + 'table.fin td input,table.fin td select,.tbl-wrap input,.tbl-wrap select{border:0 !important;background:transparent !important;box-shadow:none !important;padding:0 !important;outline:0 !important;-webkit-appearance:none;appearance:none;color:inherit !important;font:inherit !important}'
 + 'table.fin td:has(input),table.fin td:has(select){box-shadow:none !important;background:transparent !important}'
 + 'table.fin.bk-m-scroll,table.fin.bk-scrollable{display:table !important;overflow:visible !important}'
 + '.bk-print-wide table.fin{font-size:7pt !important}.bk-print-wide table.fin th,.bk-print-wide table.fin td{padding:2px 4px !important}'
 + 'svg{max-width:100%;height:auto;break-inside:avoid}'
 + 'a{color:inherit !important;text-decoration:none !important}'
 + '.status-chip{border:1px solid #c5ced7}'
 + '*{animation:none !important;transition:none !important}'
 + '}';

function sheetMeta(){
  var cur = safe(function(){ return currentSheet; }, ''), title = '', crumb = '', desc = '', fr = document.querySelector('#viewport .sheet-frame');
  var tb = fr && fr.querySelector('.title-block');
  if(tb){ var h = tb.querySelector('h2'), cr = tb.querySelector('.crumbs, .crumb, .eyebrow, .kicker, .bk-crumb'), d = tb.querySelector('p, .desc, .sub'); title = h ? h.textContent.trim() : ''; crumb = cr ? cr.textContent.trim() : ''; desc = d ? d.textContent.trim() : ''; }
  return { title:title || cur || 'Section', crumb:crumb, desc:desc };
}
function headHtml(){
  var s = safe(function(){ return bkLoad(); }, {}) || {}, dev = /develop/i.test(String(s.dealType || '')), m = sheetMeta();
  var logo = safe(function(){ var g = document.querySelector('.brand-mark .glyph svg'); return g ? g.outerHTML.replace(/id="(pl[a-z]+\d)"/g, 'id="p$1"').replace(/url\(#(pl[a-z]+\d)\)/g, 'url(#p$1)') : ''; }, '');
  var mr = (!dev && safe(function(){ return window.bkInCase ? window.bkInCase(function(){ var x = bkMonthlyReturns(); return { irr:x.irr, moic:x.moic, eq:x.d.equity, loan:x.d.loan, dscr:x.d.dscr }; }) : null; }, null)) || null;
  var cs = String(s.scenarioCase || 'Base'), units = num(s.units), price = num(s.purchasePrice), hold = num(s.holdYears);
  var cell = function(k, v){ return v == null || v === '' || v === '—' ? '' : '<div><i>' + esc(k) + '</i><b>' + esc(v) + '</b></div>'; };
  var strip = [cell('Asset class', s.propertyType), cell('Deal type', s.dealType), cell('Units', units > 0 ? units.toLocaleString('en-US') : ''), cell('Purchase price', price > 0 ? M(price) : ''), cell('Price / unit', price > 0 && units > 0 ? M(price / units) : ''), cell('Hold', hold > 0 ? hold + ' years' : ''), cell('Case', cs),
    mr ? cell('Levered IRR', P2(mr.irr)) : '', mr ? cell('Equity multiple', isFinite(mr.moic) ? mr.moic.toFixed(2) + 'x' : '') : '', mr ? cell('Equity', M(mr.eq)) : '', mr && num(mr.loan) > 0 ? cell('Loan', M(mr.loan)) : ''].join('');
  var d = new Date(), date = d.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
  return '<div class="ph-top"><div class="ph-brand">' + logo + '<div><b>Punchlist Capital</b><span>Real Estate Investments</span></div></div><div class="ph-meta">Prepared ' + esc(date) + '<br>' + esc(cs) + ' case · ' + esc(String(s.dealId || '')) + '</div></div>'
    + '<h1>' + esc(s.name || 'Untitled deal') + '</h1><div class="ph-sub">' + esc([s.location, s.status].filter(Boolean).join(' · ')) + '</div>'
    + (strip ? '<div class="ph-strip">' + strip + '</div>' : '')
    + '<div class="ph-sec">' + esc(m.title) + (m.crumb && m.crumb.toLowerCase() !== m.title.toLowerCase() ? ' <span style="font-weight:500;color:#566a80;letter-spacing:.06em"> · ' + esc(m.crumb) + '</span>' : '') + '</div>' + (m.desc ? '<div class="ph-desc">' + esc(m.desc) + '</div>' : '');
}
function wide(){ var t = [].slice.call(document.querySelectorAll('#viewport table.fin')), mx = 0; t.forEach(function(x){ var r = x.rows[0] ? x.rows[0].cells.length : 0; if(x.tHead && x.tHead.rows[0]) r = Math.max(r, x.tHead.rows[0].cells.length); mx = Math.max(mx, r); }); return mx; }
var pageStyle = null;
function prepare(){
  cleanup();
  var fr = document.querySelector('#viewport .sheet-frame') || document.getElementById('viewport'); if(!fr) return;
  var head = document.createElement('div'); head.id = 'bk-print-head'; head.innerHTML = headHtml(); fr.insertBefore(head, fr.firstChild);
  var s = safe(function(){ return bkLoad(); }, {}) || {}, foot = document.createElement('div'); foot.id = 'bk-print-foot'; foot.textContent = 'Punchlist Capital · Beta · ' + (s.name || '') + ' · figures from the underwriting model; check against your own'; document.body.appendChild(foot);
  var w = wide(), land = w >= 9; document.documentElement.classList.toggle('bk-print-wide', w >= 7);
  pageStyle = document.createElement('style'); pageStyle.id = 'bk-print-page'; pageStyle.textContent = '@page{size:letter ' + (land ? 'landscape' : 'portrait') + ';margin:12mm 11mm 14mm}'; document.head.appendChild(pageStyle);
  document.querySelectorAll('input[type=text],input[type=number],input:not([type])').forEach(function(i){ if(i.value !== i.getAttribute('value')) i.setAttribute('value', i.value); });
}
function cleanup(){ ['bk-print-head', 'bk-print-foot', 'bk-print-page'].forEach(function(id){ var e = document.getElementById(id); if(e) e.remove(); }); document.documentElement.classList.remove('bk-print-wide'); }
window.bkPrintPrepare = prepare; window.bkPrintCleanup = cleanup;
window.bkPrintSection = function(){ prepare(); setTimeout(function(){ window.print(); }, 60); };
window.addEventListener('beforeprint', function(){ if(!document.getElementById('bk-print-head')) prepare(); });
window.addEventListener('afterprint', function(){ cleanup(); });

var st = document.createElement('style'); st.id = 'bk-print-css'; st.textContent = CSS; document.head.appendChild(st);
/* the button, on every section's header */
var queued = false;
function addBtn(){ queued = false; var v = document.getElementById('viewport'); if(!v) return;
  [].forEach.call(v.querySelectorAll('.sheet-frame'), function(fr){ var tb = fr.querySelector('.title-block'); if(!tb || tb.querySelector('.bk-print-btn') || fr.querySelector('.pf-print, .rp-bar')) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'bk-btn bk-print-btn'; b.textContent = 'Print / Save PDF'; b.setAttribute('title', 'Print or save this section as a PDF'); b.onclick = function(){ window.bkPrintSection(); };
    var key = tb.querySelector('.bk-key-wrap'); if(key) tb.insertBefore(b, key); else tb.appendChild(b); }); }
function later(){ if(!queued){ queued = true; (window.requestAnimationFrame || setTimeout)(addBtn); } }
function start(){ addBtn(); var vp = document.getElementById('viewport'); if(vp) new MutationObserver(later).observe(vp, { childList:true, subtree:true }); }
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
