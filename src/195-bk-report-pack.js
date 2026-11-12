/* PDF SUMMARIES AND THE FULL PROPERTY REPORT (2.2). One shell, three scopes: the open page, the open tab (its summary page and each of its pages), or the whole property.
   Nothing is calculated here. Each summary is the page itself as it renders on screen (its title and key-figure strip, then its own tables and panels), taken after every display pass has run, with the
   application chrome and the controls removed (a control shows the value it holds), then laid out on letter pages, portrait, 8.5 x 11 in. A summary is at most two pages; if the page is longer, the
   summary says so and the page's own Print / PDF has all of it. The full report is: cover, contents with page numbers, the executive summary (the Overview), then each tab's summary page followed by the
   summaries of its pages in the order of the menus. Pages that do not apply to the deal (a development page on an acquisition, a page with nothing on it) are left out; the portfolio and the import and
   admin tools are not part of a property's report. Every page has the deal, the case and the date in its footer. Tables that are wider than the page are set smaller and, past eight years, split by years
   with the labels repeated (the same rules as Print / PDF, src/167). Presentation only. */
(function(){
'use strict';
if(typeof NAV_TABS === 'undefined' || typeof GROUPS === 'undefined' || typeof showSheet !== 'function' || typeof bkLoad !== 'function' || !window.BK_NAV_FOLD) return;
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function T(e){ return e ? String(e.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function label(s){ return window.bkNavLabel ? window.bkNavLabel(s) : s; }
function cur(){ return safe(function(){ return currentSheet; }, ''); }
var XHTML = 'http://www.w3.org/1999/xhtml';

/* tools and admin pages: no summary, not in the report (reading a document, cloud sync, export, the monthly detail vectors) */
var NO_SUMMARY = { 'Import':1, 'Deal Documents':1, 'Source Ingestion':1, 'Source Data':1, 'Data Export':1, 'Portfolio Import':1, 'Cloud Sync':1, 'Storage Lifecycle':1, 'Version History':1, 'Deal Vectors (M)':1, 'Ledger (M)':1 };
var NOT_IN_PROPERTY = { portfolio:1 };   /* the portfolio is across deals: its pages have summaries, the property report leaves them out */

function groupOfSheet(s){ return GROUPS.filter(function(g){ return !g.hidden && g.sheets.indexOf(s) > -1; })[0]; }
function tabOfSheet(s){ var g = groupOfSheet(s); if(!g) return null; return NAV_TABS.filter(function(t){ return t.groups.indexOf(g.id) > -1; })[0] || null; }
/* does this page have a PDF summary? Not on a hidden SYS_ sheet, a tool, or a page that does not apply to this deal (a development page on an acquisition, the Business tab without a business) */
window.bkPackHas = function(sheet){
  if(!sheet || /^SYS_/.test(sheet) || NO_SUMMARY[sheet] || typeof RENDERERS[sheet] !== 'function') return false;
  if((sheet === 'Budget vs Actual' || sheet === 'Actuals') && !(safe(function(){ return (bkLoad() || {}).actuals || []; }, []).length)) return false;   /* nothing entered: nothing to summarize */
  var g = groupOfSheet(sheet); if(!g) return false; var t = tabOfSheet(sheet);
  if(t && window.bkNavTabHidden && window.bkNavTabHidden(t, '')) return false;
  if(window.bkNavGroupShown && !window.bkNavGroupShown(g, '')) return false;
  return true;
};
/* a tab's pages in menu order, each host followed by its views */
function tabPages(t){
  var out = [], seen = {};
  t.groups.forEach(function(id){ var g = GROUPS.filter(function(x){ return x.id === id; })[0]; if(!g || g.hidden || (window.bkNavGroupShown && !window.bkNavGroupShown(g, ''))) return;
    g.sheets.forEach(function(s){ var h = window.bkNavHostOf ? window.bkNavHostOf(s) : s; if(seen[h]) return; seen[h] = 1;
      var fam = window.BK_NAV_FOLD[h], list = [h].concat(fam ? fam.views.map(function(v){ return v[0]; }) : []);
      list.forEach(function(n){ if(window.bkPackHas(n)) out.push({ sheet:n, group:g.label, view:n !== h }); }); }); });
  return out;
}

/* the sections of a report */
function plan(scope, here){
  var secs = [], tabs = NAV_TABS.filter(function(t){ return !(window.bkNavTabHidden && window.bkNavTabHidden(t, '')); });
  if(scope === 'page') return [{ kind:'page', id:'p-' + here, sheet:here, max:1, cont:8 }];
  if(scope === 'tab'){ var t = tabOfSheet(here); if(!t) return [{ kind:'page', id:'p-' + here, sheet:here, max:1, cont:8 }];
    var pg = tabPages(t); secs.push({ kind:'tab', id:'t-' + t.id, tab:t, pages:pg, max:1 });
    pg.forEach(function(p){ secs.push({ kind:'page', id:'p-' + p.sheet, sheet:p.sheet, tab:t, group:p.group, max:1, cont:8 }); }); return secs; }
  secs.push({ kind:'cover', id:'cover' }, { kind:'toc', id:'toc', max:3 });
  secs.push({ kind:'page', id:'p-Home', sheet:'Home', exec:true, tab:tabOfSheet('Home'), max:1 });
  tabs.forEach(function(t){ if(t.id === 'overview' || NOT_IN_PROPERTY[t.id]) return; var pg = tabPages(t); if(!pg.length) return;
    secs.push({ kind:'tab', id:'t-' + t.id, tab:t, pages:pg, max:1 });
    pg.forEach(function(p){ secs.push({ kind:'page', id:'p-' + p.sheet, sheet:p.sheet, tab:t, group:p.group, max:1, cont:8 }); }); });
  return secs;
}

/* take the open page as it stands: its title, its key-figure strip, its own panels and tables; no chrome, controls as text */
var DROP = '.bk-flow,.bk-stepnav,.bk-case,.side-col,.bk-dui,.pf-bar,.rp-bar,.colour-key,.bk-key-wrap,.bk-print-btn,.ae-hint,.bk-notes,.bk-addrow,.bk-guide,.bk-reqbar,.bk-undo,.bk-savebar,.bk-hint,.bk-scrollhint,.bk-scroll-hint,button,.pl-hbtn,.bk-btn,.pl-btn,.bk-pt-bar,.ae-tabs,.ae-subs,.bk-sg,.bk-views,.bk-pack-cta,script,style,noscript,[hidden]';
function harvest(){
  var fr = document.querySelector('#viewport .sheet-frame'), main = fr && fr.querySelector('.main-col'); if(!main) return null;
  var tb = fr.querySelector('.title-block'), meta = [];
  if(tb) [].forEach.call(tb.querySelectorAll('.meta-strip .cell'), function(c){ var k = T(c.querySelector('.k')), v = T(c.querySelector('.v')); if(k && v) meta.push([k, v]); });
  var live = [].slice.call(main.querySelectorAll('input,select,textarea')), m = main.cloneNode(true), copy = [].slice.call(m.querySelectorAll('input,select,textarea'));
  /* a control shows the value it holds (a clone does not keep what was typed, so read it from the live page) */
  live.forEach(function(l, i){ var c = copy[i]; if(!c || !c.parentNode) return; var tag = c.tagName, ty = (l.type || '').toLowerCase(), txt = '';
    if(tag === 'SELECT'){ var o = l.options && l.options[l.selectedIndex]; txt = o ? o.text : ''; }
    else if(ty === 'checkbox' || ty === 'radio'){ if(!l.checked){ c.remove(); return; } txt = '✓'; }
    else if(ty === 'hidden' || ty === 'file' || ty === 'range' || ty === 'button' || ty === 'submit'){ c.remove(); return; }
    else txt = l.value || (/^[\d.,$%-]+$/.test(l.placeholder || '') ? l.placeholder : '');   /* an empty number box prints its 0 */
    var sp = document.createElement('span'), tv = String(txt == null ? '' : txt).trim(); sp.className = 'pk-v' + (c.closest && c.closest('table.ae-grid') && /^[\s$(-]*[\d.,]+\s*[%x)]*$/.test(tv) ? ' pk-n' : ''); sp.textContent = tv; c.replaceWith(sp); });
  /* panel tabs: name each panel before the bar of tab buttons goes */
  var bar = m.querySelector('.bk-pt-bar'), names = bar ? [].map.call(bar.querySelectorAll('.ae-tab, [role=tab], button'), function(b){ var cb = b.cloneNode(true); [].forEach.call(cb.querySelectorAll('i'), function(x){ x.remove(); }); return T(cb); }) : [], panes = [].slice.call(m.querySelectorAll('.bk-pt-pane'));
  if(names.length && names.length === panes.length) panes.forEach(function(p, i){ if(!names[i]) return; var h = document.createElement('div'); h.className = 'pk-pane'; h.textContent = names[i]; p.insertBefore(h, p.firstChild); });
  [].forEach.call(m.querySelectorAll(DROP), function(e){ if(e.parentNode) e.parentNode.removeChild(e); });
  var text = T(m);
  if(text.length < 60 && !m.querySelector('table,svg')) return null;   /* nothing on the page: it does not apply yet */
  return { crumb:T(tb && tb.querySelector('.crumbs')), title:T(tb && tb.querySelector('h2')), desc:T(tb && tb.querySelector('p, .desc')), meta:meta, node:m };
}

/* ---------- the report document ---------- */
var NAVY = '#0e2a4a', BLUE = '#3E9AE6';
var PACK_CSS = 'html body .pg-body #viewport table caption,html body .pg-body #viewport table.fin caption,html body .pg-body #viewport table.bk-m-scroll caption{max-width:none !important;width:100% !important;position:static !important;box-sizing:border-box}html body .pg-body #viewport table[style*="font-size"] th,html body .pg-body #viewport table[style*="font-size"] td,html body .pg-body #viewport table.pk-tight th,html body .pg-body #viewport table.pk-tight td{font-size:inherit !important}html body .pg-body #viewport table[style*="font-size"] th,html body .pg-body #viewport table[style*="font-size"] td{padding-left:3px !important;padding-right:3px !important}.pg-body .pf-card>svg,.pg-body .pf-card svg.pf-chart,.pg-body .pf svg{max-height:2.3in;width:100%}.pg-body table.ae-grid td .pk-n{display:block;text-align:right}.pg-body .pl-acts,.pg-body .pl-h:has(+.pl-acts),.pg-body details.pl-detail{display:none !important}.pg-body td:has(>input),.pg-body td:has(>select),.pg-body td.v{background:transparent !important}.pg-body input,.pg-body select,.pg-body textarea{background:transparent !important;box-shadow:none !important}html body .pg-body #viewport table.fin tbody tr:not(.grandtotal):not(.total):not(.section) > td[data-bk-kind^="input"]{background:transparent !important;box-shadow:none !important}html body .pg-body #viewport table.fin tbody tr:not(.grandtotal):not(.total):not(.section) > td[data-bk-kind="input-text"],html body .pg-body #viewport td[data-bk-kind="input-text"],html body .pg-body #viewport table.fin td.v,html body .pg-body #viewport table.fin tr.input td.v,html body .pg-body #viewport table.fin td.v:hover{background:transparent !important;box-shadow:none !important}.pg-body th.bk-h-r{padding-right:8px !important}.pg-body td[data-bk-col="left"][style*="text-align:right"],html body .pg-body #viewport table.fin tbody td[data-bk-col="left"][style*="text-align:right"],.pg-body table.fin tr.grandtotal td:not(:first-child),.pg-body table.fin tr.total td:not(:first-child){text-align:right !important}html body .pg-body #viewport .main-col{padding-left:0 !important;padding-right:0 !important;overflow:visible !important}html body .pg-body #viewport .ae-panel,html body .pg-body #viewport .ae-body{max-width:none}.pl-deal{grid-template-columns:minmax(0,2fr) repeat(3,minmax(0,1fr)) 78px !important}.pl-deal>div{min-width:0}.pl-deal>div:last-child{visibility:hidden}@page{size:8.5in 11in;margin:0}'
 + 'html,body{height:auto !important;min-height:0 !important;overflow:visible !important;background:#c9d6e2 !important;margin:0 !important;padding:0 !important;display:block !important;font:11px/1.4 Inter,"Helvetica Neue",Arial,sans-serif;color:' + NAVY + '}'
 + '.pg{position:relative;width:8.5in;height:11in;margin:0 auto 16px;background:#fff;overflow:hidden;break-after:page;page-break-after:always;box-shadow:0 6px 30px rgba(0,0,0,.25);box-sizing:border-box}'
 + '@media print{html,body{background:#fff !important}.pg{margin:0;box-shadow:none}}'
 + '.pg-head{position:absolute;left:.55in;right:.55in;top:.36in;height:.36in;border-bottom:2px solid ' + NAVY + ';display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:5px;font:700 9px/1.2 Inter,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:' + NAVY + '}.pg-head .r{color:' + BLUE + '}'
 + '.pg-body{position:absolute;left:.55in;right:.55in;top:.86in;height:9.5in;overflow:hidden}'
 + '.pg-foot{position:absolute;left:.55in;right:.55in;bottom:.28in;display:flex;justify-content:space-between;gap:10px;border-top:1px solid #c5ced7;padding-top:4px;font:500 8px/1.3 Inter,Arial,sans-serif;color:#566a80}.pg-foot .pf-note{color:#a05a00;font-weight:600;text-align:center;flex:1}'
 + '.pg.cover{background:linear-gradient(160deg,#081a30 0%,' + NAVY + ' 55%,#12609f 100%);color:#fff}.pk-cover{position:absolute;inset:0;padding:.8in .8in;display:flex;flex-direction:column}'
 + '.pk-cover .lg{display:flex;align-items:center;gap:14px}.pk-cover .lg svg{width:58px;height:54px}.pk-cover .lg b{display:block;font:800 24px/1 Inter,Arial,sans-serif;letter-spacing:.01em}.pk-cover .lg span{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#B9C8D8}'
 + '.pk-cover .ph{margin-top:.5in;height:3.1in;border-radius:4px;overflow:hidden;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.06)}.pk-cover .ph img{width:100%;height:100%;object-fit:cover;display:block}'
 + '.pk-cover h1{font:800 32px/1.1 Inter,Arial,sans-serif;margin:.4in 0 6px}.pk-cover .sub{font-size:14px;color:#B9C8D8}.pk-cover .kv{margin-top:.35in;display:grid;grid-template-columns:repeat(3,1fr);gap:14px 18px;border-top:2px solid ' + BLUE + ';padding-top:14px}.pk-cover .kv i{display:block;font-style:normal;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#8fb4d8}.pk-cover .kv b{display:block;font-size:14px;margin-top:2px}'
 + '.pk-cover .note{margin-top:auto;font-size:9.5px;color:#9db6d0;line-height:1.5}'
 + '.pk-sec{margin:0 0 10px;padding:0 0 8px;border-bottom:1px solid #d5dce3}.pk-crumb{font:700 9px/1.2 Inter,Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:' + BLUE + '}.pk-sec h2{font:800 19px/1.15 Inter,Arial,sans-serif;margin:3px 0 2px;color:' + NAVY + '}.pk-sec p{margin:0;color:#566a80;font-size:10px}'
 + '.pk-meta{display:grid;grid-template-columns:repeat(4,1fr);margin-top:8px;border:1px solid #b8c2cc;border-width:1px 0 0 1px}.pk-meta div{padding:4px 7px;border:1px solid #d5dce3;border-width:0 1px 1px 0}.pk-meta i{display:block;font-style:normal;font:600 7.5px/1.2 Inter,Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#566a80}.pk-meta b{display:block;font:700 10.5px/1.25 Inter,Arial,sans-serif;color:' + NAVY + '}'
 + '.pk-cont{font:700 9px/1.2 Inter,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#566a80;margin:0 0 8px}'
 + '.pk-pane{font:700 11px/1.2 Inter,Arial,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:' + NAVY + ';margin:12px 0 5px;padding-left:7px;border-left:3px solid ' + BLUE + '}'
 + '.pg-body table.rp-tbl{border-collapse:collapse !important;border-spacing:0}.pg-body table.rp-tbl td,.pg-body table.rp-tbl th{border-left:0 !important;border-right:0 !important;box-shadow:none !important;border-top-width:0;border-bottom:1px solid #d5dce3 !important}.pg-body table.rp-tbl td:first-child,.pg-body table.rp-tbl th:first-child{border-right:1px solid #8a98a8 !important;border-left:0 !important}.pg-body table.rp-tbl tr.rp-key td,.pg-body table.rp-tbl tr.key td,.pg-body table.rp-tbl tr.tot td{border-top:1px solid #0e2a4a !important;border-bottom:1px solid #0e2a4a !important;background:#f2f6fb !important}.pg-body table.rp-tbl td:first-child{box-shadow:none !important}html body .pg-body .main-col,html body .pg-body #viewport .main-col{padding:0 !important;overflow:visible !important;max-width:none !important;min-width:0}html body .pg-body .pl-home,html body .pg-body .pf{width:auto !important;max-width:none !important}html body .pg-body .bk-ask,html body .pg-body .bk-new-deal,html body .pg-body .pl-toolbar{display:none !important}.pg-body table[style*="font-size"] td,.pg-body table[style*="font-size"] th{font-size:inherit !important}.pk-v{font-weight:600}.pk-tight th,.pk-tight td{padding:2px 3px !important}'
 + '.pg-body .tbl-wrap{overflow:visible !important}.pg-body table{max-width:100%}.bk-pt-pane.bk-pt-hide{display:block !important}.pg-body svg{max-width:100%;height:auto}/* Property Editor sections in a summary: label and value on one row, two columns of rows that fill the panel, notes full width, tables fill their panel */.pg-body .ae-form{display:grid !important;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:22px;row-gap:0;padding:2px 10px 6px;align-items:start}.pg-body .ae-form>.pk-row{display:grid;grid-template-columns:minmax(42%,1fr) minmax(0,auto);column-gap:10px;align-items:baseline;border-bottom:1px solid #e3e8ee;padding:3.5px 0;min-width:0}.pg-body .ae-form .pk-l{font-size:9.5px;color:#25313d;min-width:0}.pg-body .ae-form .pk-r{display:flex;align-items:baseline;justify-content:flex-end;gap:6px;text-align:right;flex-wrap:wrap;min-width:0}.pg-body .ae-form .pk-r:empty{display:none}.pg-body .ae-form .pk-row:has(.pk-r:empty){grid-template-columns:1fr}.pg-body .ae-form .pk-v,.pg-body .ae-form .ae-ro{display:inline !important;width:auto !important;min-width:0 !important;max-width:none !important;padding:0 !important;border:0 !important;background:transparent !important;box-shadow:none !important;font-weight:700;font-size:9.5px;text-align:right}.pg-body .ae-form .ae-unit{font-size:8.5px;color:#566a80;font-weight:400;white-space:normal;max-width:100%}.pg-body .ae-form .pk-v,.pg-body .ae-form .ae-ro{white-space:nowrap}.pg-body .ae-form>.pk-note{grid-column:1/-1;display:block;border:0;padding:4px 0;font-size:8.5px;color:#566a80}.pg-body .ae-panel{overflow:visible}.pg-body .ae-panel table,.pg-body .ae-body table{width:100% !important;max-width:100% !important}.pg-body table.bk-sx-heat{width:100% !important;max-width:100% !important;table-layout:fixed}html body .pg-body #viewport td .status-chip,html body .pg-body #viewport td .chip{display:inline-flex !important;box-sizing:border-box !important;width:auto !important;min-width:0 !important;max-width:calc(100% - 4px) !important;margin:0 2px !important;padding:2px 6px !important;font-size:7.5px !important;letter-spacing:.04em !important;white-space:normal !important;overflow-wrap:anywhere}'
 + 'table.pk-toc{width:100%;border-collapse:collapse;font-size:11px}table.pk-toc td{padding:3px 4px;border-bottom:1px dotted #c5ced7}table.pk-toc td.n{text-align:right;width:44px;font-weight:700;color:' + NAVY + '}table.pk-toc tr.t td{font-weight:800;color:' + NAVY + ';padding-top:10px;border-bottom:1px solid ' + BLUE + '}table.pk-toc tr.p td:first-child{padding-left:16px}table.pk-toc tr.v td:first-child{padding-left:30px;color:#566a80}'
 + 'table.pk-tab{width:100%;border-collapse:collapse;font-size:10px}table.pk-tab th{background:' + NAVY + ';color:#fff;text-align:left;padding:5px 7px;font-weight:700}table.pk-tab td{padding:5px 7px;border-bottom:1px solid #d5dce3;vertical-align:top}table.pk-tab td.g{color:#566a80;white-space:nowrap}'
 + '#pk-stage{position:absolute;left:-9999px;top:0;width:7.4in;visibility:hidden}';

function dealInfo(){ var s = safe(function(){ return bkLoad(); }, {}) || {}; return { s:s, name:String(s.name || 'Untitled deal'), id:String(s.dealId || ''), kase:String(s.scenarioCase || 'Base'), date:new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) }; }
function secHead(sec, data){
  var tabL = sec.tab ? sec.tab.label : '', crumb = sec.exec ? 'Overview' : [tabL, sec.group].filter(Boolean).join(' · ');
  var title = sec.exec ? 'Executive summary' : label(sec.sheet), metas = (data.meta || []).slice(0, 8);
  return '<div class="pk-sec"><div class="pk-crumb">' + esc(crumb || data.crumb || '') + '</div><h2>' + esc(title) + '</h2>' + (data.desc ? '<p>' + esc(data.desc) + '</p>' : '')
    + (metas.length ? '<div class="pk-meta">' + metas.map(function(c){ return '<div><i>' + esc(c[0]) + '</i><b>' + esc(c[1]) + '</b></div>'; }).join('') + '</div>' : '') + '</div>';
}
function tabNode(sec, byId){
  var rows = sec.pages.map(function(p){ var d = byId['p-' + p.sheet], k = d ? d.meta.filter(function(c){ return !/^(property|case|type|currency)$/i.test(c[0]); }).slice(0, 4).map(function(c){ return esc(c[0]) + ': <b>' + esc(c[1]) + '</b>'; }).join(' · ') : '';
    return d === undefined ? '' : '<tr><td><b>' + esc(label(p.sheet)) + '</b></td><td class="g">' + esc(p.group) + '</td><td>' + (k || '<span style="color:#8a98a8">—</span>') + '</td></tr>'; }).join('');
  var q = (window.BK_NAV.filter(function(x){ return x.id === sec.tab.id; })[0] || {}).q || '';
  var w = document.createElement('div'); w.className = 'pk-page';
  w.innerHTML = '<div class="pk-sec"><div class="pk-crumb">Tab summary</div><h2>' + esc(sec.tab.label) + '</h2>' + (q ? '<p>' + esc(q) + '</p>' : '') + '</div>'
    + '<table class="pk-tab"><thead><tr><th>Page</th><th>Section</th><th>Key figures</th></tr></thead><tbody>' + rows + '</tbody></table>';
  return w;
}
function coverHtml(info, photo){
  var logo = safe(function(){ var g = document.querySelector('.brand-mark .glyph svg'); return g ? g.outerHTML.replace(/id="(pl[a-z]+\d)"/g, 'id="c$1"').replace(/url\(#(pl[a-z]+\d)\)/g, 'url(#c$1)') : ''; }, ''), s = info.s;
  var kv = [['Asset class', s.propertyType], ['Deal type', s.dealType], ['Case', info.kase], ['Deal ID', info.id], ['Prepared', info.date], ['Status', s.status]].filter(function(x){ return x[1]; });
  return '<div class="pk-cover"><div class="lg">' + logo + '<div><b>Punchlist Capital</b><span>Real Estate Investments</span></div></div>'
    + (photo ? '<div class="ph"><img alt="" src="' + esc(photo) + '"></div>' : '<div style="height:1.2in"></div>') + '<h1>' + esc(info.name) + '</h1><div class="sub">' + esc(s.location || '') + '</div>'
    + '<div class="kv">' + kv.map(function(x){ return '<div><i>' + esc(x[0]) + '</i><b>' + esc(x[1]) + '</b></div>'; }).join('') + '</div>'
    + '<div class="note">Full property report. Every figure is taken from the page it comes from in the underwriting model, in the ' + esc(info.kase) + ' case; nothing is recalculated for this document. Beta: check the figures against your own model before relying on them.</div></div>';
}

/* lay the sections on letter pages: blocks are kept whole when they fit, split by rows (headers repeated) when they do not */
function paginate(doc, secs, info){
  var out = doc.getElementById('pk-out'), stage = doc.getElementById('pk-stage-in'), S = { pg:null, body:null, root:null, chain:[], count:0, sec:null, secPages:0, stop:false, placed:0 }, starts = {}, all = [];
  function mk(tag, cls){ var e = doc.createElement(tag); if(cls) e.className = cls; return e; }
  var BLOCK = { DIV:1, SECTION:1, ARTICLE:1, MAIN:1, TABLE:1, TBODY:1, TFOOT:1, UL:1, OL:1 };
  function shellOf(src){ var s = src.cloneNode(false); if(src.tagName === 'TABLE') [].forEach.call(src.children, function(c){ if(/^(CAPTION|THEAD|COLGROUP)$/.test(c.tagName)) s.appendChild(c.cloneNode(true)); }); return s; }
  function kidsOf(n){
    if(n.nodeType !== 1 || n.namespaceURI !== XHTML || !BLOCK[n.tagName]) return null;
    if(n.tagName === 'TABLE'){ var k = [].filter.call(n.children, function(c){ return !/^(CAPTION|THEAD|COLGROUP)$/.test(c.tagName); }); return k.length ? k : null; }
    var ks = [].filter.call(n.childNodes, function(c){ return c.nodeType === 1 || (c.nodeType === 3 && c.textContent.trim()); }); return ks.length > 1 || (ks.length === 1 && ks[0].nodeType === 1) ? ks : null;
  }
  function hasContent(shell){ return shell.tagName === 'TABLE' ? !!shell.querySelector('tbody tr, tfoot tr') : (shell.textContent.trim().length > 0 || !!shell.querySelector('svg,img,canvas')); }
  function newPage(bare){
    var pg = mk('div', 'pg' + (bare ? ' cover' : '')); S.count++; all.push(pg); out.appendChild(pg); S.pg = pg; S.placed = 0;
    if(bare){ S.body = pg; S.root = pg; return pg; }
    var hd = mk('div', 'pg-head'); hd.innerHTML = '<span>' + esc(info.name) + '</span><span class="r">' + esc(S.sec ? S.sec.headRight || '' : '') + '</span>'; pg.appendChild(hd);
    var body = mk('div', 'pg-body'); pg.appendChild(body); var ft = mk('div', 'pg-foot'); ft.innerHTML = '<span>Punchlist Capital · Beta · ' + esc(info.id || info.name) + ' · ' + esc(info.kase) + ' case</span><span class="pf-note"></span><span>' + esc(info.date) + ' · <span class="pn"></span></span>'; pg.appendChild(ft);
    var v = mk('div'); v.id = 'viewport'; var f = mk('div', 'sheet-frame active'), m = mk('div', 'main-col'); body.appendChild(v); v.appendChild(f); f.appendChild(m); S.body = body; S.root = m;
    var parent = m; S.chain.forEach(function(c){ c.el = shellOf(c.src); parent.appendChild(c.el); parent = c.el; });
    return pg;
  }
  function nextPage(){
    if(S.secPages >= (S.sec.cont || S.sec.max || 2)){ S.stop = true; var n = S.pg && S.pg.querySelector('.pf-note'); if(n) n.textContent = 'Summary: the page itself has more (Print / PDF on the page)'; return false; }
    S.secPages++; newPage(false);
    var c = mk('div', 'pk-cont'); c.textContent = S.sec.headRight + ' (continued)'; S.root.insertBefore(c, S.root.firstChild); return true;
  }
  function fits(){ return S.body.scrollHeight <= S.body.clientHeight + 1; }
  function cont(d){ return d === 0 ? S.root : S.chain[d - 1].el; }
  function place(node, depth){
    if(S.stop) return;
    var c = cont(depth); c.appendChild(node);
    if(fits()){ S.placed++; return; }
    var h = node.nodeType === 1 ? node.offsetHeight : 0; c.removeChild(node);
    /* a block that would fit on a fresh page and is not long (half a page or less) goes whole to the next page */
    if(S.placed > 0 && h > 0 && h <= S.body.clientHeight * 0.5){ if(!nextPage()) return; place(node, depth); return; }
    var kids = kidsOf(node);
    if(kids){
      var shell = shellOf(node), entry = { src:node, el:shell }; c.appendChild(shell); S.chain.push(entry);
      kids.forEach(function(k){ place(k, depth + 1); });
      S.chain.pop(); if(shell.parentNode && !hasContent(shell)) shell.parentNode.removeChild(shell);
      return;
    }
    if(S.placed === 0){ c.appendChild(node); S.placed++; return; }   /* taller than a page and not splittable: what fits is shown */
    if(!nextPage()) return; place(node, depth);
  }
  /* a zoomed table keeps its percentage widths (max-width / min-width 100%) in unzoomed units in some browsers, so it ends up 1 / zoom too wide: size it by the zoom instead */
  function zoomWidth(t){ var z = parseFloat(t.style.zoom) || 1, pw = t.parentNode && t.parentNode.getBoundingClientRect().width; if(z >= 1 || !pw) return; if(t.getBoundingClientRect().width > pw + 1){ t.style.setProperty('max-width', (100 * z).toFixed(2) + '%', 'important'); t.style.setProperty('min-width', '0', 'important'); if(t.getBoundingClientRect().width > pw + 1) t.style.setProperty('width', (100 * z).toFixed(2) + '%', 'important'); } }
  function prepTables(node, sec){
    stage.appendChild(node);
    /* Property Editor forms: each label and its value become one row (label left, value right beside it), the rows sit in two columns, notes span the width.
       The editor's own markup is a flat run of labels and value boxes, which only lines up in the editor's grid. */
    [].slice.call(node.querySelectorAll('.ae-form')).forEach(function(f){ if(f.getAttribute('data-pk-rows')) return; f.setAttribute('data-pk-rows', '1');
      var kids = [].slice.call(f.children), out = []; for(var i = 0; i < kids.length; i++){ var c = kids[i];
        if(c.tagName === 'LABEL'){ var v = kids[i + 1] && kids[i + 1].tagName !== 'LABEL' && !kids[i + 1].classList.contains('note') ? kids[i + 1] : null; var row = doc.createElement('div'); row.className = 'pk-row';
          var l = doc.createElement('span'); l.className = 'pk-l'; l.innerHTML = c.innerHTML; row.appendChild(l); var r = doc.createElement('span'); r.className = 'pk-r'; if(v){ r.innerHTML = v.innerHTML; i++; } row.appendChild(r); out.push(row); }
        else if(c.classList.contains('note') || c.textContent.trim()){ c.classList.add('pk-note'); out.push(c); } }
      while(f.firstChild) f.removeChild(f.firstChild); out.forEach(function(o){ f.appendChild(o); }); });
    [].slice.call(node.querySelectorAll('table')).forEach(function(t){ if(typeof window.bkPrintSplitYears === 'function' && !t.classList.contains('bk-print-clone')) safe(function(){ window.bkPrintSplitYears(t, t.classList.contains('rp-tbl') ? 10 : (t.querySelector('.status-chip') ? 6 : 8)); }); });
    var W = stage.clientWidth, wid = function(t){ return t.getBoundingClientRect().width; };
    [].slice.call(node.querySelectorAll('table')).forEach(function(t){ if(t.classList.contains('bk-print-orig')) return; var fs = 8.6, yrs = [].filter.call([].slice.call(t.rows, 0, 4).reduce(function(c, r){ return c.concat([].slice.call(r.cells)); }, []), function(h){ return /^\s*(?:Year|Yr)\s*\d+\s*$/i.test(h.textContent); }).length, floor = (yrs >= 5 || (t.rows[0] && t.rows[0].cells.length >= 9 && t.rows[0].cells.length <= 14)) ? 5.2 : 7.4;   /* a statement of up to 10 years stays on one page: its type is set down to fit */
      while(wid(t) > W + 1 && fs > floor){ fs -= 0.4; t.style.setProperty('font-size', fs.toFixed(1) + 'pt', 'important'); if(fs < 7.4) t.classList.add('pk-tight'); }
      if(wid(t) <= W + 1) return;
      /* still wider than the page: cut it into column groups, the label column repeated in each (the same way a long hold is cut into years) */
      var row = [].filter.call(t.rows, function(r){ return r.parentNode.tagName !== 'THEAD' && [].every.call(r.cells, function(c){ return (c.colSpan || 1) === 1; }); }).sort(function(a, b){ return b.cells.length - a.cells.length; })[0], groups = [];
      if(row && row.cells.length > 14 && typeof window.bkPrintSplitCols === 'function'){   /* up to 14 columns (10 years, a total and a share) stay one table, set smaller */
        var ws = [].map.call(row.cells, function(c){ return c.getBoundingClientRect().width; }), cur = [0], sum = ws[0];
        for(var i = 1; i < ws.length; i++){ if(sum + ws[i] > W && cur.length > 1){ groups.push(cur); cur = [0]; sum = ws[0]; } cur.push(i); sum += ws[i]; } groups.push(cur); }
      if(groups.length > 1 && groups.length <= 5){ safe(function(){ window.bkPrintSplitCols(t, groups); });
        [].slice.call(t.parentNode.querySelectorAll('table.bk-print-clone')).forEach(function(c){ var f = 8.6; while(wid(c) > W + 1 && f > 6.4){ f -= 0.4; c.style.setProperty('font-size', f.toFixed(1) + 'pt', 'important'); c.classList.add('pk-tight'); } }); return; }
      /* a table that cannot be cut: set it smaller, not below half size */
      for(var k = 0; k < 3 && wid(t) > W + 1; k++){ var z = parseFloat(t.style.zoom) || 1; t.style.zoom = Math.max(0.5, z * W / wid(t) - 0.005).toFixed(3); zoomWidth(t); } });
    /* a page summary is ONE page: its whole content is scaled to fit the page (never below 50%; what still does not fit is cut and says so) */
    if(sec && sec.max === 1 && sec.kind === 'page'){ var Hb = stage.ownerDocument.defaultView.innerHeight ? 9.5 * 96 - 6 : 906;
      for(var it = 0; it < 4; it++){ var H = node.getBoundingClientRect().height; if(H <= Hb) break; var z0 = parseFloat(node.style.zoom) || 1, z1 = Math.max(0.8, z0 * Hb / H - 0.01); if(z1 >= z0 - 0.002) break; node.style.zoom = z1.toFixed(3); if(!sec.exec){ node.style.width = (100 / z1).toFixed(2) + '%'; var pw = node.parentNode.getBoundingClientRect().width; if(pw && node.getBoundingClientRect().width > pw * 1.02) node.style.width = '100%'; /* browsers differ on how a percentage width resolves inside a zoomed box: if the first guess overflows, use 100% */ } } }
    if(sec && !sec.exec){ /* nothing may stay wider than the page: tables that cannot shrink are scaled with the page */
      for(var w = 0; w < 4; w++){ var pw2 = node.parentNode.getBoundingClientRect().width, nw = node.getBoundingClientRect().width; if(!pw2 || nw <= pw2 * 1.005) break; var zz = parseFloat(node.style.zoom) || 1; node.style.zoom = Math.max(0.4, zz * pw2 / nw - 0.005).toFixed(3); } }
    stage.removeChild(node);
  }
  secs.forEach(function(sec){
    if(sec.kind === 'cover'){ var cp = newPage(true); cp.innerHTML = sec.html; starts[sec.id] = S.count; return; }
    S.sec = sec; S.secPages = 1; S.stop = false; S.chain = []; newPage(false); starts[sec.id] = S.count;
    var node = doc.importNode(sec.node, true); prepTables(node, sec); place(node, 0);
  });
  /* a table inside nested panels has less room than the page body: scale any that still pass the right edge to fit what is left (never below 55%) */
  all.forEach(function(pg){ var body = pg.querySelector('.pg-body'); if(!body) return; var edge = body.getBoundingClientRect().right;
    [].forEach.call(body.querySelectorAll('table, svg'), function(t){ if(t.classList.contains('bk-print-orig') || t.offsetParent === null) return; var r = t.getBoundingClientRect(); if(r.right <= edge + 1 || r.width < 30) return;
      var z = Math.max(0.55, (edge - r.left) / r.width); if(t.tagName === 'svg'){ t.style.maxWidth = '100%'; t.style.height = 'auto'; return; } t.style.zoom = ((parseFloat(t.style.zoom) || 1) * z - 0.005).toFixed(3); zoomWidth(t); }); });
  /* final check in the page itself (where the sizes are the ones that print): a scaled block must not be wider than its column; if the percentage width overshoots, use 100%, then scale the block to fit */
  [].slice.call(doc.querySelectorAll('.pk-page')).forEach(function(k){ var pw = k.parentNode.getBoundingClientRect().width; if(!pw) return;
    if(k.getBoundingClientRect().width > pw * 1.01 && !k.closest('.pk-exec')) k.style.width = '100%';
    for(var q = 0; q < 4; q++){ var kw = k.getBoundingClientRect().width; if(kw <= pw * 1.005) break; var zk = parseFloat(k.style.zoom) || 1; k.style.zoom = Math.max(0.4, zk * pw / kw - 0.005).toFixed(3); } });
  /* the pieces of one split table (years 1-10, then 11-15) are set at the same size, the smallest of them, so a long hold does not mix a tiny piece with a large one */
  [].slice.call(doc.querySelectorAll('.pg-body')).forEach(function(body){ var seen = []; [].slice.call(body.querySelectorAll('table.bk-print-clone')).forEach(function(tb){ if(seen.indexOf(tb.parentNode) < 0) seen.push(tb.parentNode); });
    seen.forEach(function(par){ var cl = [].slice.call(par.children).filter(function(c){ return c.tagName === 'TABLE' && c.classList.contains('bk-print-clone'); }); if(cl.length < 2) return;
      var zs = cl.map(function(c){ return parseFloat(c.style.zoom) || 1; }), fs = cl.map(function(c){ return parseFloat(c.style.fontSize) || 0; }).filter(Boolean), z = Math.min.apply(null, zs), f = fs.length ? Math.min.apply(null, fs) : 0;
      cl.forEach(function(c){ if(z < 1) c.style.zoom = z.toFixed(3); if(f) c.style.setProperty('font-size', f.toFixed(1) + 'pt', 'important'); }); }); });
  /* a table's caption (the panel heading bar) is sized in the table's own units: undo the table's scale on it so the bar spans the full table */
  [].slice.call(doc.querySelectorAll('.pg-body table')).forEach(function(tb){ var z = parseFloat(tb.style.zoom); if(!z || z >= 1) return; var cp = tb.caption; if(cp) cp.style.zoom = (1 / z).toFixed(3); });
  all.forEach(function(pg, i){ var pn = pg.querySelector('.pn'); if(pn) pn.textContent = 'Page ' + (i + 1) + ' of ' + all.length; });
  [].forEach.call(doc.querySelectorAll('[data-pg]'), function(e){ e.textContent = starts[e.getAttribute('data-pg')] || ''; });
  return all.length;
}
function tocNode(secs){
  var rows = [];
  secs.forEach(function(s){ if(s.kind === 'tab') rows.push('<tr class="t"><td>' + esc(s.tab.label) + ' — tab summary</td><td class="n" data-pg="' + s.id + '"></td></tr>');
    else if(s.kind === 'page'){ var v = window.bkNavHostOf && window.bkNavHostOf(s.sheet) !== s.sheet; rows.push('<tr class="' + (v ? 'v' : 'p') + '"><td>' + esc(s.exec ? 'Executive summary' : label(s.sheet)) + '</td><td class="n" data-pg="' + s.id + '"></td></tr>'); } });
  var w = document.createElement('div'); w.className = 'pk-page';
  w.innerHTML = '<div class="pk-sec"><div class="pk-crumb">Full property report</div><h2>Contents</h2></div><table class="pk-toc"><tbody>' + rows.join('') + '</tbody></table>';
  return w;
}

/* ---------- opening it ---------- */
var busy = false;
function modal(msg){ if(typeof window.bkModal === 'function') window.bkModal('<h3 style="margin:0 0 8px">PDF summary</h3><p>' + msg + '</p>'); else alert(msg); }
function progress(){ var e = document.getElementById('pl-pack-prog'); if(e) return e;
  e = document.createElement('div'); e.id = 'pl-pack-prog'; e.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(8,26,48,.94);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-family:Inter,system-ui,sans-serif';
  e.innerHTML = '<b style="font-size:15px;letter-spacing:.06em">BUILDING THE REPORT</b><span id="pl-pack-prog-t" style="font-size:12px;color:#B9C8D8">Reading the pages…</span><button type="button" id="pl-pack-cancel" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.5);border-radius:999px;padding:7px 18px;font:600 12px Inter,system-ui,sans-serif;cursor:pointer">Cancel</button>';
  document.body.appendChild(e); return e; }
window.bkPackClose = function(){ ['pl-pack', 'pl-pack-prog'].forEach(function(id){ var e = document.getElementById(id); if(e) e.remove(); }); document.documentElement.style.overflow = ''; };
window.bkPackPrint = function(){ var f = document.getElementById('pl-pack-frame'); if(f && f.contentWindow){ f.contentWindow.focus(); f.contentWindow.print(); } };
window.bkPackOpen = function(scope){
  if(busy) return; scope = scope || 'page';
  var s = safe(function(){ return bkLoad(); }, null);
  if(!s || (typeof window.bkHasActiveDeal === 'function' && !window.bkHasActiveDeal())){ modal('Open or create a deal first.'); return; }
  var here = cur();
  /* the waterfall pages' PDF summary is the one-page waterfall summary (src/145), not the long monthly page */
  if(scope === 'page' && (here === 'Equity Waterfall' || here === 'Waterfall (M)') && typeof window.bkWaterfallSummaryOpen === 'function'){ window.bkWaterfallSummaryOpen(); return; }
  if(scope === 'page' && !window.bkPackHas(here)){ modal('This page has no PDF summary.'); return; }
  busy = true; var canceled = false, secs = plan(scope, here), info = dealInfo(), data = {}, byId = {};
  window.bkPackClose(); var prog = progress(), pt = document.getElementById('pl-pack-prog-t'); document.getElementById('pl-pack-cancel').onclick = function(){ canceled = true; };
  var work = secs.filter(function(x){ return x.kind === 'page'; }), scroll = window.scrollY || 0;
  (async function(){
    try {
      for(var i = 0; i < work.length && !canceled; i++){
        var sec = work[i]; pt.textContent = 'Reading page ' + (i + 1) + ' of ' + work.length + ': ' + label(sec.sheet);
        if(sec.sheet !== cur()){ safe(function(){ showSheet(sec.sheet); }); await sleep(360); }
        var d = safe(harvest, null);
        /* a Property Editor page has sub-tabs (Description, Location, ...): only the open one is on screen, so open each in turn and put them all in the summary, each under its own heading */
        var subEls = [].slice.call(document.querySelectorAll('#viewport .ae-subs .ae-sub')), subList = subEls.map(function(e){ var m = /bkEdSub\('([^']*)','([^']*)'\)/.exec(e.getAttribute('onclick') || ''); return m ? { tab:m[1], id:m[2], label:T(e), on:e.classList.contains('on') } : null; }).filter(Boolean);
        if(d && subList.length > 1 && typeof window.bkEdSub === 'function'){
          var opened = subList.filter(function(x){ return x.on; })[0] || subList[0], parts = [];
          for(var q = 0; q < subList.length; q++){ var sb = subList[q], dd = sb.on ? d : (safe(function(){ window.bkEdSub(sb.tab, sb.id); return 1; }, 0) ? (await sleep(320), safe(harvest, null)) : null);
            if(dd){ var hd = document.createElement('div'); hd.className = 'pk-pane'; hd.textContent = sb.label; var wrap = document.createElement('div'); wrap.appendChild(hd); wrap.appendChild(dd.node); parts.push(wrap); } }
          safe(function(){ window.bkEdSub(opened.tab, opened.id); });
          await sleep(320);
          var holder = document.createElement('div'); holder.className = 'main-col'; parts.forEach(function(w){ holder.appendChild(w); }); d.node = holder; sec.max = 1;
        }
        if(d){ data[sec.id] = d; byId[sec.id] = d; }
      }
    } finally { if(cur() !== here) safe(function(){ showSheet(here); }); window.scrollTo(0, scroll); }
    if(canceled){ busy = false; window.bkPackClose(); return; }
    /* the sections that apply, in order */
    var keep = [];
    secs.forEach(function(sec){
      if(sec.kind === 'page'){ var d = data[sec.id]; if(!d) return; sec.headRight = sec.exec ? 'Executive summary' : label(sec.sheet);
        var w = document.createElement('div'); w.className = 'pk-page'; w.innerHTML = secHead(sec, d); w.appendChild(d.node); sec.node = w; keep.push(sec); }
      else if(sec.kind === 'tab'){ sec.pages = sec.pages.filter(function(p){ return byId['p-' + p.sheet]; }); if(!sec.pages.length) return; sec.headRight = sec.tab.label + ' · tab summary'; sec.node = tabNode(sec, byId); keep.push(sec); }
      else if(sec.kind === 'cover'){ sec.html = coverHtml(info, safe(function(){ return window.bkDealPhotoURL(); }, '')); keep.push(sec); }
      else if(sec.kind === 'toc'){ keep.push(sec); } });
    keep.forEach(function(sec){ if(sec.kind === 'toc'){ sec.headRight = 'Contents'; sec.node = tocNode(keep); } });
    if(!keep.some(function(x){ return x.kind === 'page'; })){ busy = false; window.bkPackClose(); modal('There is nothing to summarize on ' + (scope === 'page' ? 'this page' : 'these pages') + ' yet. Enter the deal’s figures first.'); return; }
    pt.textContent = 'Laying out the pages…';
    var css = [].map.call(document.querySelectorAll('style'), function(x){ return x.textContent; }).join('\n'), links = [].map.call(document.querySelectorAll('link[rel=stylesheet]'), function(l){ return '<link rel="stylesheet" href="' + esc(l.href) + '">'; }).join('');
    var title = (scope === 'full' ? 'Full property report' : scope === 'tab' ? 'Tab summary' : 'PDF summary'), name = info.name;
    var html = '<!doctype html><html lang="en" data-theme="light" class="bk-auth-ok"><head><meta charset="utf-8"><title>' + esc(name + ' — ' + title) + '</title>' + links + '<style>' + css + '</style><style>' + (window.BK_PRINT_RULES || '') + PACK_CSS + '</style></head><body><div id="pk-stage"><div id="viewport"><div class="sheet-frame active"><div class="main-col" id="pk-stage-in"></div></div></div></div><div id="pk-out"></div></body></html>';
    var o = document.createElement('div'); o.id = 'pl-pack'; o.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#081a30;display:flex;flex-direction:column;font-family:Inter,system-ui,sans-serif';
    var seg = function(k, t, off){ return '<button type="button" ' + (off ? 'disabled style="opacity:.4" ' : '') + 'onclick="bkPackOpen(\'' + k + '\')" style="border-radius:999px;font:600 12px Inter,system-ui,sans-serif;cursor:pointer;padding:6px 13px;border:1px solid rgba(255,255,255,.4);background:' + (scope === k ? '#fff' : 'transparent') + ';color:' + (scope === k ? '#0e2a4a' : '#fff') + '">' + t + '</button>'; };
    o.innerHTML = '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px 12px;padding:10px 16px;background:#0e2a4a;border-bottom:2px solid #3E9AE6;color:#fff"><b style="font-size:13px;letter-spacing:.06em">' + esc(title.toUpperCase()) + '</b><span id="pl-pack-n" style="font-size:12px;color:#B9C8D8">' + esc(name) + '</span>'
      + '<span style="display:inline-flex;gap:6px;margin-left:8px">' + seg('page', 'This page', !window.bkPackHas(here)) + seg('tab', 'This tab') + seg('full', 'Full report') + '</span><span style="flex:1"></span>'
      + '<button type="button" onclick="bkPackPrint()" style="background:#3E9AE6;color:#fff;border:0;border-radius:999px;font:700 12px Inter,system-ui,sans-serif;padding:8px 16px;cursor:pointer;letter-spacing:.04em">PRINT / SAVE PDF</button>'
      + '<button type="button" onclick="bkPackClose()" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4);border-radius:999px;font:600 12px Inter,system-ui,sans-serif;padding:7px 14px;cursor:pointer">Close</button></div>'
      + '<div style="flex:1;overflow:auto;background:#c9d6e2"><iframe id="pl-pack-frame" title="' + esc(title) + ' preview" style="border:0;width:8.5in;display:block;margin:0 auto;background:#c9d6e2;height:11in"></iframe></div>';
    document.body.appendChild(o); document.documentElement.style.overflow = 'hidden'; prog.remove();
    var f = document.getElementById('pl-pack-frame');
    f.addEventListener('load', function(){
      var doc = f.contentDocument, run = function(){ try {
          var n = paginate(doc, keep, info); f.style.height = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight) + 'px';
          var el = document.getElementById('pl-pack-n'); if(el) el.textContent = name + ' · ' + n + ' page' + (n === 1 ? '' : 's');
          var w = f.parentNode.clientWidth, sc = Math.min(1, (w - 24) / 816); if(sc < 1){ var fh = parseFloat(f.style.height) || 0; f.parentNode.style.overflowX = 'hidden'; f.style.transformOrigin = '0 0'; f.style.transform = 'scale(' + sc.toFixed(4) + ')'; f.style.margin = '0 0 ' + (-(fh * (1 - sc))).toFixed(1) + 'px ' + Math.max(0, (w - 816 * sc) / 2).toFixed(1) + 'px'; }   /* a transform with the height taken back, not CSS zoom: the same on every phone browser, and no blank space after the last page */ } catch(e){ var el2 = document.getElementById('pl-pack-n'); if(el2) el2.textContent = 'The report could not be laid out: ' + (e && e.message || e); } };
      (doc.fonts && doc.fonts.ready ? Promise.race([doc.fonts.ready, sleep(1500)]) : Promise.resolve()).then(run, run); });
    f.srcdoc = html; busy = false;
  })().catch(function(e){ busy = false; window.bkPackClose(); modal('The report could not be built: ' + esc(e && e.message || e)); });
};

/* the button on every Reports page: Compile full property report */
var prev = window.showSheet;
if(typeof prev === 'function'){ window.showSheet = function(sheet){ var r = prev.apply(this, arguments); try { cta(); } catch(e){} return r; }; try { showSheet = window.showSheet; } catch(e){} }
function cta(){
  var c = cur(), t = tabOfSheet(c); document.querySelectorAll('#viewport .bk-pack-cta').forEach(function(e){ e.remove(); });
  if(!t || t.id !== 'reports') return; var tb = document.querySelector('#viewport .title-block'); if(!tb) return;
  tb.insertAdjacentHTML('afterend', '<div class="bk-pack-cta no-print" style="display:flex;justify-content:flex-end;padding:0 22px 10px"><button type="button" class="bk-btn" onclick="bkPackOpen(\'full\')" title="Cover, contents, executive summary, then every tab and page in the order of the menus">Compile full property report</button></div>');
}
var css = document.createElement('style'); css.id = 'bk-pack-css'; css.textContent = '@media print{.bk-pack-cta,#pl-pack,#pl-pack-prog,.bk-prev-x{display:none !important}}'
  /* PDF previews (full report, PDF summary, investment summary, waterfall): the header never leaves the screen, and on a phone there is always a close button in reach */
  + '#pl-pack,#pl-report{height:100vh;height:100dvh;width:100vw;max-width:100vw;overflow:hidden;box-sizing:border-box;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);touch-action:pan-x pan-y}'
  + '#pl-pack>div:first-child,#pl-report>div:first-child{flex:0 0 auto;flex-wrap:wrap;position:relative;z-index:2}#pl-pack>div:last-child{min-height:0;-webkit-overflow-scrolling:touch}#pl-report>iframe{min-height:0}'
  + '.bk-prev-x{display:none}@media(max-width:820px){.bk-prev-x{display:flex;position:fixed;right:max(10px,env(safe-area-inset-right));top:calc(env(safe-area-inset-top) + 8px);z-index:100001;width:44px;height:44px;border-radius:50%;border:2px solid #fff;background:#0e2a4a;color:#fff;font:700 20px/1 Inter,system-ui,sans-serif;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,.45);cursor:pointer;padding:0}'
  + '#pl-pack>div:first-child,#pl-report>div:first-child{padding-right:64px !important;gap:8px 8px !important}#pl-pack>div:first-child button,#pl-report>div:first-child button{min-height:36px}}';
document.head.appendChild(css);
/* a close button that is fixed to the screen, the Escape key, and the phone's back gesture all close a preview */
function closeAny(){ if(window.bkPackClose) window.bkPackClose(); if(window.bkReportClose) window.bkReportClose(); var x = document.querySelector('.bk-prev-x'); if(x) x.remove(); }
function dress(o){ if(!o || o._bkx) return; o._bkx = 1; var old = document.querySelector('.bk-prev-x'); if(old) old.remove();
  var x = document.createElement('button'); x.type = 'button'; x.className = 'bk-prev-x'; x.setAttribute('aria-label', 'Close preview'); x.textContent = '✕'; x.onclick = function(){ closeAny(); }; document.body.appendChild(x);
  try { if(!(history.state && history.state.bkPrev)) history.pushState({ bkPrev:1 }, ''); } catch(e){} }
try { new MutationObserver(function(){ var o = document.getElementById('pl-pack') || document.getElementById('pl-report'); if(o) dress(o); else { var x = document.querySelector('.bk-prev-x'); if(x) x.remove(); } }).observe(document.body, { childList:true }); } catch(e){}
window.addEventListener('popstate', function(){ if(document.getElementById('pl-pack') || document.getElementById('pl-report')) closeAny(); });
document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && (document.getElementById('pl-pack') || document.getElementById('pl-report'))) closeAny(); });
})();
