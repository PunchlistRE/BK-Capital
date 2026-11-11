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

var CSS = 'table.bk-measure-wrap td,table.bk-measure-wrap th{white-space:normal !important}table.bk-measure-wrap .status-chip{white-space:nowrap !important}#bk-print-head,#bk-print-foot,.bk-print-sel{display:none}table.bk-print-clone{display:none}.title-block{position:relative}.title-block .bk-print-btn{position:absolute;top:12px;right:128px;z-index:2}.title-block:not(:has(.bk-key-wrap)) .bk-print-btn{right:18px}@media (max-width:760px){.title-block .bk-print-btn{position:static;margin:6px 0 0}}'
 + '@media print{#viewport table.fin td,#viewport table.fin th,#viewport table.rp-tbl td{white-space:normal !important;overflow-wrap:break-word}#viewport table .status-chip{white-space:nowrap !important}#viewport .tbl-wrap{overflow:visible !important}#viewport select.bk-print-hasval{display:none !important}#viewport .bk-print-sel{display:inline !important;font-weight:600}'
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
 + 'table.fin.bk-m-scroll,table.fin.bk-scrollable,table.rp-tbl,table.rp-tbl.bk-scrollable{display:table !important;overflow:visible !important}.bk-scrollable::before{display:none !important}table.rp-tbl{table-layout:auto !important}table.rp-tbl td,table.rp-tbl th{min-width:0 !important;white-space:nowrap}table.rp-tbl td:first-child,table.rp-tbl th:first-child{white-space:normal}'
 + '#viewport [style*="overflow-x"]{overflow:visible !important}.rp-tbl{width:100% !important;min-width:0 !important;border-collapse:collapse !important}.rp-tbl th,.rp-tbl td{padding:3px 6px !important}.bk-print-fit th,.bk-print-fit td{padding:2px 3px !important;white-space:nowrap;font-size:inherit !important}.bk-print-fit th:first-child,.bk-print-fit td:first-child{white-space:normal;min-width:120px}html body #viewport table.bk-print-fit.bk-print-fit th,html body #viewport table.bk-print-fit.bk-print-fit td{font-size:inherit !important;padding:2px 3px !important}'
 + 'table.fin.bk-print-orig,table.rp-tbl.bk-print-orig,table.bk-print-orig{display:none !important}table.bk-print-clone{display:table !important;margin-bottom:10px;break-inside:auto}table.rp-tbl tr{break-inside:avoid;page-break-inside:avoid}'
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
function wide(){ var t = [].slice.call(document.querySelectorAll('#viewport table.fin, #viewport table.rp-tbl')).filter(function(x){ return !x.classList.contains('bk-print-orig'); }), mx = 0; t.forEach(function(x){ var r = x.rows[0] ? x.rows[0].cells.length : 0; if(x.tHead && x.tHead.rows[0]) r = Math.max(r, x.tHead.rows[0].cells.length); mx = Math.max(mx, r); }); return mx; }
/* A schedule with a column per year has to fit the portrait page whatever the hold: up to 10 year columns it is set on one page, the type sized to the column count; a longer hold is split into pages of 10 years,
   the label column repeated and the totals on the last. Every PDF is portrait (8.5 x 11 in). Nothing is clipped, nothing is dropped. */
var YEARS_PER_PAGE = 10, PAGE_PX = { land:973, port:733 };
function headCells(t){ var rs = t.tHead ? [].slice.call(t.tHead.rows) : [], hr = rs.filter(function(r){ return [].some.call(r.cells, function(c){ return /^\s*(?:Year|Yr)\s*\d+\s*$/i.test(c.textContent); }); })[0] || rs[0] || t.rows[0]; return hr ? [].slice.call(hr.cells) : []; }   /* the row that names the years (a Forecast band may sit above it) */
/* a table cut into column groups: each group keeps the label column (column 0), the original is hidden and the groups follow it, each with the same caption and header rows */
function splitKeep(t, groups){
  var anchor = t;
  groups.forEach(function(keep){
    var c = t.cloneNode(true); c.removeAttribute('id'); c.classList.add('bk-print-clone');
    [].forEach.call(c.rows, function(r){ var cells = [].slice.call(r.cells), pos = 0, map = []; cells.forEach(function(cell){ map.push(pos); pos += cell.colSpan || 1; });
      cells.forEach(function(cell, q){ var cs = cell.colSpan || 1; if(cs > 1){ var inside = keep.filter(function(k){ return k >= map[q] && k < map[q] + cs; }).length; if(inside) cell.colSpan = inside; else cell.remove(); } else if(keep.indexOf(map[q]) < 0) cell.remove(); }); });
    anchor.parentNode.insertBefore(c, anchor.nextSibling); anchor = c; });
  t.classList.add('bk-print-orig'); t.classList.remove('bk-print-clone');   /* a piece that is cut again is hidden like any original */
}
function splitYears(t, per){ per = per || YEARS_PER_PAGE;
  var hc = headCells(t), yr = []; hc.forEach(function(c, q){ if(/^\s*(?:Year|Yr)\s*\d+\s*$/i.test(c.textContent)) yr.push(q); });
  if(yr.length <= per || t.classList.contains('bk-print-clone')) return;
  var rest = hc.map(function(c, q){ return q; }).filter(function(q){ return q !== 0 && yr.indexOf(q) < 0; }), chunks = [];
  var nPieces = Math.ceil(yr.length / per), size = Math.ceil(yr.length / nPieces);   /* equal pieces: 15 years is 3 x 5, not 6 + 6 + 3 */
  for(var a = 0; a < yr.length; a += size) chunks.push(yr.slice(a, a + size));
  splitKeep(t, chunks.map(function(ch, n){ return [0].concat(ch).concat(n === chunks.length - 1 ? rest : []); }));
}
function fitTables(land){
  var px = land ? PAGE_PX.land : PAGE_PX.port;
  [].forEach.call(document.querySelectorAll('#viewport table.rp-tbl:not(.bk-print-orig), #viewport table.fin:not(.bk-print-orig)'), function(t){
    var cols = headCells(t).reduce(function(n, c){ return n + (c.colSpan || 1); }, 0); if(cols < 9) return;
    var colW = (px - 190) / (cols - 1), fsPx = (colW - 6) / 6.6, cap = t.classList.contains('rp-tbl') ? 8.6 : 7, fs = Math.max(4.6, Math.min(cap, fsPx * 0.75));
    t.classList.add('bk-print-fit'); t.style.setProperty('font-size', fs.toFixed(2) + 'pt', 'important'); });
}
/* any table still wider than the printable page (wide text tables, input grids, tables with a chip in every cell) is scaled to fit: its narrowest possible width is measured with wrapping allowed,
   and the table is zoomed so that width is the page width. Nothing printed is ever cut off at the right edge. */
function fitWide(land){
  var px = (land ? PAGE_PX.land : PAGE_PX.port) - 6;
  [].forEach.call(document.querySelectorAll('#viewport table'), function(t){ if(t.classList.contains('bk-print-orig')) return; var clone = t.classList.contains('bk-print-clone');   /* the year pieces are hidden on screen: shown for the measurement only */
    if(!clone && !t.offsetWidth) return; if(t.parentElement && t.parentElement.closest('table')) return;
    var w0 = t.style.cssText; if(clone) t.style.setProperty('display', 'table', 'important'); if(t.classList.contains('fin') || t.classList.contains('rp-tbl')) t.classList.add('bk-measure-wrap');   /* only these wrap in print; every other table is measured as it prints */ t.style.setProperty('width', '1px', 'important'); t.style.setProperty('min-width', '0', 'important'); t.style.setProperty('table-layout', 'auto', 'important');
    var m = t.offsetWidth; t.classList.remove('bk-measure-wrap'); t.style.cssText = w0;
    /* the room the table really has: the page width less the side padding and borders of the cards it sits in */
    var pad = 0, e = t.parentElement, stop = document.getElementById('viewport'); while(e && e !== stop){ var c = getComputedStyle(e); pad += (parseFloat(c.paddingLeft) || 0) + (parseFloat(c.paddingRight) || 0) + (parseFloat(c.borderLeftWidth) || 0) + (parseFloat(c.borderRightWidth) || 0); e = e.parentElement; }
    var room = px - Math.min(120, pad) - 4; if(m <= room) return; var z = Math.max(0.42, room / m);
    t.classList.add('bk-print-zoom'); t.setAttribute('data-bk-pz', z.toFixed(3)); });
  /* the zoom itself lives in a print-only rule, so the screen is never touched */
  var css = ''; [].forEach.call(document.querySelectorAll('#viewport table.bk-print-zoom'), function(t, i){ t.setAttribute('data-bk-pzi', i); var z = +t.getAttribute('data-bk-pz'); css += '#viewport table.bk-print-zoom[data-bk-pzi="' + i + '"]{zoom:' + z + ' !important;width:auto !important;max-width:none !important;min-width:0 !important}'; });
  if(css){ var st = document.createElement('style'); st.id = 'bk-print-zoomcss'; st.textContent = '@media print{' + css + '}'; document.head.appendChild(st); }
}
function unfit(){ var zc = document.getElementById('bk-print-zoomcss'); if(zc) zc.remove(); [].forEach.call(document.querySelectorAll('table.bk-print-zoom'), function(t){ t.classList.remove('bk-print-zoom'); t.removeAttribute('data-bk-pz'); t.removeAttribute('data-bk-pzi'); });
   [].forEach.call(document.querySelectorAll('table.bk-print-clone'), function(c){ c.remove(); }); [].forEach.call(document.querySelectorAll('table.bk-print-orig'), function(t){ t.classList.remove('bk-print-orig'); });
  [].forEach.call(document.querySelectorAll('table.bk-print-fit'), function(t){ t.classList.remove('bk-print-fit'); t.style.removeProperty('font-size'); }); }
/* the print rules and the year-splitter, shared with the report pack (src/195), which lays the same rules on pages of its own */
window.BK_PRINT_RULES = CSS.slice(CSS.indexOf('@media print{') + 13, CSS.length - 1); window.bkPrintSplitYears = splitYears; window.bkPrintSplitCols = splitKeep;
var pageStyle = null;
function prepare(){
  if(document.documentElement.classList.contains('bk-sr-open')) return;   /* the schedule summary prints its own pages */
  cleanup();
  /* a printout is always the light theme, whatever theme is on screen: switch the theme for the print and put it back after */
  var de = document.documentElement; if(window.bkTheme && window.bkTheme.forPrint) window.bkTheme.forPrint(true); window.__bkPrintPrev = { had:de.hasAttribute('data-theme'), val:de.getAttribute('data-theme'), cs:de.style.colorScheme }; de.setAttribute('data-theme', 'light'); de.style.colorScheme = 'light';
  var fr = document.querySelector('#viewport .sheet-frame') || document.getElementById('viewport'); if(!fr) return;
  var head = document.createElement('div'); head.id = 'bk-print-head'; head.innerHTML = headHtml(); fr.insertBefore(head, fr.firstChild);
  var s = safe(function(){ return bkLoad(); }, {}) || {}, foot = document.createElement('div'); foot.id = 'bk-print-foot'; foot.textContent = 'Punchlist Capital · Beta · ' + (s.name || '') + ' · figures from the underwriting model; check against your own'; document.body.appendChild(foot);
  /* a chosen option prints as text (a drop-down prints blank) */
  [].forEach.call(document.querySelectorAll('#viewport select'), function(sel){ var o = sel.options[sel.selectedIndex]; if(!o) return; var sp = document.createElement('span'); sp.className = 'bk-print-sel'; sp.textContent = o.text; sel.classList.add('bk-print-hasval'); sel.parentNode.insertBefore(sp, sel.nextSibling); });
  [].forEach.call(document.querySelectorAll('#viewport table.rp-tbl, #viewport table.fin, #viewport table.pf-tbl'), function(t){ splitYears(t, t.classList.contains('rp-tbl') ? YEARS_PER_PAGE : (t.querySelector('.status-chip') || t.classList.contains('pf-tbl') ? 6 : 8));   /* a table with a status chip in every year cell needs wider columns */ });
  var w = wide(), land = false; document.documentElement.classList.toggle('bk-print-wide', w >= 7); fitTables(land); fitWide(land);
  pageStyle = document.createElement('style'); pageStyle.id = 'bk-print-page'; pageStyle.textContent = '@page{size:letter ' + (land ? 'landscape' : 'portrait') + ';margin:12mm 11mm 14mm}'; document.head.appendChild(pageStyle);
  document.querySelectorAll('input[type=text],input[type=number],input:not([type])').forEach(function(i){ if(i.value !== i.getAttribute('value')) i.setAttribute('value', i.value); });
}
function cleanup(){ [].forEach.call(document.querySelectorAll('.bk-print-sel'), function(e){ e.remove(); }); [].forEach.call(document.querySelectorAll('select.bk-print-hasval'), function(e){ e.classList.remove('bk-print-hasval'); }); if(window.__bkPrintPrev){ var de = document.documentElement; if(window.bkTheme && window.bkTheme.forPrint) window.bkTheme.forPrint(false); else { if(window.__bkPrintPrev.had) de.setAttribute('data-theme', window.__bkPrintPrev.val); else de.removeAttribute('data-theme'); de.style.colorScheme = window.__bkPrintPrev.cs || ''; } window.__bkPrintPrev = null; } unfit(); ['bk-print-head', 'bk-print-foot', 'bk-print-page'].forEach(function(id){ var e = document.getElementById(id); if(e) e.remove(); }); document.documentElement.classList.remove('bk-print-wide'); }
window.bkPrintPrepare = prepare; window.bkPrintCleanup = cleanup;
window.bkPrintSection = function(){ prepare(); setTimeout(function(){ window.print(); }, 60); };
window.addEventListener('beforeprint', function(){ if(!document.getElementById('bk-print-head')) prepare(); });
window.addEventListener('afterprint', function(){ cleanup(); });

var st = document.createElement('style'); st.id = 'bk-print-css'; st.textContent = CSS; document.head.appendChild(st);
/* the button, on every section's header */
var queued = false;
function addBtn(){ queued = false; var v = document.getElementById('viewport'); if(!v) return;
  [].forEach.call(v.querySelectorAll('.sheet-frame'), function(fr){ var tb = fr.querySelector('.title-block'); if(!tb || tb.querySelector('.bk-print-btn') || fr.querySelector('.pf-print, .rp-bar')) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'bk-btn bk-print-btn'; b.textContent = 'Print / PDF'; b.setAttribute('title', 'Print or save this section as a PDF'); b.onclick = function(){ window.bkPrintSection(); };
    var key = tb.querySelector('.bk-key-wrap'); if(key) tb.insertBefore(b, key); else tb.appendChild(b); }); }
function later(){ if(!queued){ queued = true; (window.requestAnimationFrame || setTimeout)(addBtn); } }
function start(){ addBtn(); var vp = document.getElementById('viewport'); if(vp) new MutationObserver(later).observe(vp, { childList:true, subtree:true }); }
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
