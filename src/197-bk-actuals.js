/* ACTUALS AND ASSET MANAGEMENT (1.7). Enter or paste the property's monthly actuals (revenue, operating expenses, capex, debt service); see them against the underwriting month by month (Budget vs Actual), the reforecast
   of each year (actual months plus the budget for the months still to come), and the lender covenant tested on the actuals. The budget is the underwriting's own monthly rows (bkMonthlyReturns) and the covenant
   minimum the loan's own (bkLenderDscrMin); only sums, differences and ratios are computed here. Acquisitions. Actuals are stored on the deal (s.actuals). */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof bkLoad !== 'function') return;
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function M(v){ v = Math.round(Number(v) || 0); return v < 0 ? '($' + Math.abs(v).toLocaleString('en-US') + ')' : '$' + v.toLocaleString('en-US'); }
function X(v){ return isFinite(v) ? v.toFixed(2) + 'x' : '—'; }
function isDev(s){ return /develop/i.test(String((s || {}).dealType || '')); }
function ym(d){ return new Date(d).toISOString().slice(0, 7); }
function parseYM(t){ t = String(t || '').trim(); var m = t.match(/^(\d{4})[-\/](\d{1,2})/); if(m) return m[1] + '-' + ('0' + m[2]).slice(-2); m = t.match(/^(\d{1,2})[-\/](\d{4})/); if(m) return m[2] + '-' + ('0' + m[1]).slice(-2); return null; }
function num(t){ var s = String(t == null ? '' : t).trim(), neg = /^\(.*\)$/.test(s) || /^-/.test(s), v = parseFloat(s.replace(/[^0-9.]/g, '')); return isFinite(v) ? (neg ? -v : v) : NaN; }
/* the budget by month: the underwriting's own rows */
function budget(){ var r = safe(function(){ return bkMonthlyReturns(); }, null); if(!r || !r.rows) return []; return r.rows.map(function(x){ return { ym:ym(x.dt), y:x.y, m:x.m, rev:x.egi || 0, noiB:(x.noi || 0) + (x.reserve || 0), capex:x.reserve || 0, ds:x.ds || 0 }; }); }
function acts(){ var a = (bkLoad() || {}).actuals; return Array.isArray(a) ? a.slice().sort(function(p, q){ return p.ym < q.ym ? -1 : 1; }) : []; }
function save(list){ var s = bkLoad(); s.actuals = list; bkSave(s); if(typeof showSheet === 'function') showSheet(currentSheet); }
window.bkActualsApply = function(){
  var t = document.getElementById('bk-act-paste'); if(!t) return; var by = {}, bad = 0, n = 0; acts().forEach(function(a){ by[a.ym] = a; });
  String(t.value || '').split(/\r?\n/).forEach(function(line){ if(!line.trim()) return; var c = line.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(function(z){ return z.replace(/^"|"$/g, ''); }), k = parseYM(c[0]); if(!k){ if(!/month|date|period/i.test(c[0])) bad++; return; }
    var rev = num(c[1]), opex = num(c[2]); if(!isFinite(rev) || !isFinite(opex)){ bad++; return; } by[k] = { ym:k, rev:rev, opex:Math.abs(opex), capex:isFinite(num(c[3])) ? Math.abs(num(c[3])) : 0, ds:isFinite(num(c[4])) ? Math.abs(num(c[4])) : null }; n++; });
  window.__bkActNote = n + ' month' + (n === 1 ? '' : 's') + ' read' + (bad ? '; ' + bad + ' line' + (bad === 1 ? '' : 's') + ' skipped (a line needs a month, revenue and operating expenses)' : '') + '.';
  save(Object.keys(by).map(function(k){ return by[k]; }));
};
window.bkActualsClear = function(){ if(confirm('Remove all entered actuals from this deal?')) { window.__bkActNote = ''; save([]); } };
window.bkActualsDelete = function(k){ save(acts().filter(function(a){ return a.ym !== k; })); };
function head(title, desc, s, extra){ var o = { title:title, crumbs:'Operations', desc:desc, meta:Object.assign({ Property:s.name || '' }, extra || {}), sidebar:'' }; return o; }
function notDev(s, title){ return isDev(s) ? Object.assign(head(title, 'Actuals are tracked against an acquisition’s underwriting.', s), { main:'<div class="note-flag"><span>&#9432;</span><div>Actuals apply to acquisitions. A development deal is tracked on its Dev Draws and Dev Schedule pages.</div></div>' }) : null; }
RENDERERS['Actuals'] = function(){
  var s = bkLoad() || {}, nd = notDev(s, 'Actuals'); if(nd) return nd; var A = acts(), B = {}; budget().forEach(function(b){ B[b.ym] = b; });
  var rows = A.map(function(a){ return '<tr><td class="rowlabel">' + a.ym + (B[a.ym] ? '' : ' <span class="dim">(outside the hold)</span>') + '</td><td>' + M(a.rev) + '</td><td>' + M(a.opex) + '</td><td>' + M(a.rev - a.opex) + '</td><td>' + M(a.capex) + '</td><td>' + (a.ds == null ? '<span class="dim">budget</span>' : M(a.ds)) + '</td><td><button type="button" class="bk-btn" onclick="bkActualsDelete(\'' + a.ym + '\')">Remove</button></td></tr>'; }).join('');
  var main = '<div class="note-flag"><span>&#9432;</span><div>Paste monthly actuals, one month per line: <b>month, revenue, operating expenses, capex, debt service</b> (comma or tab separated; month as 2027-02 or 2/2027; capex and debt service optional). A month already entered is replaced. Operating expenses exclude capex and debt service. Months run from the deal’s closing.</div></div>'
    + '<div class="tbl-wrap" style="margin-top:12px;padding:12px"><textarea id="bk-act-paste" rows="7" style="width:100%;font:12px/1.4 ui-monospace,Menlo,monospace;background:#fff !important;text-align:left !important" placeholder="2027-01, 212000, 98000, 3000, 87087\n2027-02, 209500, 101200, 0, 87087"></textarea>'
    + '<div style="margin-top:8px;display:flex;gap:8px;align-items:center"><button type="button" class="bk-btn" onclick="bkActualsApply()">Add to actuals</button>' + (A.length ? '<button type="button" class="bk-btn" onclick="bkActualsClear()">Remove all</button>' : '') + '<span class="dim">' + esc(window.__bkActNote || '') + '</span></div></div>'
    + (A.length ? '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Actuals Entered</caption><thead><tr><th class="rowlabel-h">Month</th><th>Revenue</th><th>Operating Expenses</th><th>NOI</th><th>Capex</th><th>Debt Service</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="note-flag"><span>&#9432;</span><div>No actuals entered yet.</div></div>');
  var o = head('Actuals', 'Monthly revenue, operating expenses, capex and debt service as they happened.', s, { 'Months entered':String(A.length) }); o.main = main; return o;
};
RENDERERS['Budget vs Actual'] = function(){
  var s = bkLoad() || {}, nd = notDev(s, 'Budget vs Actual'); if(nd) return nd; var A = acts(), Bm = budget(), B = {}; Bm.forEach(function(b){ B[b.ym] = b; });
  var o = head('Budget vs Actual', 'Actuals against the underwriting month by month, the reforecast of each year, and the loan covenant tested on the actuals.', s);
  var inHold = A.filter(function(a){ return B[a.ym]; });
  if(!inHold.length){ o.main = '<div class="note-flag"><span>&#9432;</span><div>No actuals within the hold yet. Enter them on the Actuals view (the tab above), then this page shows the variance, the reforecast and the covenant test.</div></div>'; return o; }
  var line = function(c, a, b, good){ var v = a - b, pct = b ? v / Math.abs(b) : NaN; return '<td>' + M(b) + '</td><td>' + M(a) + '</td><td class="' + ((good > 0 ? v >= 0 : v <= 0) ? 'pos' : 'neg') + '">' + M(v) + '</td><td>' + (isFinite(pct) ? (pct * 100).toFixed(1) + '%' : '—') + '</td>'; };
  var tot = { bn:0, an:0, br:0, ar:0 }, body = inHold.map(function(a){ var b = B[a.ym], an = a.rev - a.opex; tot.bn += b.noiB; tot.an += an; tot.br += b.rev; tot.ar += a.rev;
    return '<tr><td class="rowlabel">' + a.ym + '</td>' + line('r', a.rev, b.rev, 1) + line('n', an, b.noiB, 1) + '</tr>'; }).join('');
  var tr = '<tr class="grandtotal"><td class="rowlabel">Total, ' + inHold.length + ' months</td>' + line('r', tot.ar, tot.br, 1) + line('n', tot.an, tot.bn, 1) + '</tr>';
  var main = '<div class="tbl-wrap"><table class="fin"><caption>Variance by Month - revenue and NOI before capex</caption><thead><tr><th class="rowlabel-h" rowspan="2">Month</th><th colspan="4">Revenue</th><th colspan="4">NOI</th></tr><tr><th>Budget</th><th>Actual</th><th>Variance</th><th>%</th><th>Budget</th><th>Actual</th><th>Variance</th><th>%</th></tr></thead><tbody>' + body + tr + '</tbody></table></div>';
  /* reforecast by year: the actual months, the budget for the rest */
  var ys = {}; Bm.forEach(function(b){ var a = A.filter(function(x){ return x.ym === b.ym; })[0], y = ys[b.y] = ys[b.y] || { bud:0, ref:0, act:0, n:0 }; y.bud += b.noiB; if(a){ y.ref += a.rev - a.opex; y.act++; } else y.ref += b.noiB; y.n++; });
  var yrows = Object.keys(ys).map(function(k){ var y = ys[k], v = y.ref - y.bud; return '<tr><td class="rowlabel">Year ' + k + '</td><td>' + y.act + ' of ' + y.n + '</td><td>' + M(y.bud) + '</td><td>' + M(y.ref) + '</td><td class="' + (v >= 0 ? 'pos' : 'neg') + '">' + M(v) + '</td></tr>'; }).join('');
  main += '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Reforecast NOI by Year - actual months plus the budget for the months to come</caption><thead><tr><th class="rowlabel-h">Year</th><th>Months actual</th><th>Budget NOI</th><th>Reforecast NOI</th><th>Change</th></tr></thead><tbody>' + yrows + '</tbody></table></div>';
  /* covenant on the actuals: the last twelve entered months (fewer: annualized), the lender NOI basis, the loan's own minimum */
  var last = inHold.slice(-12), n = last.length, after = safe(function(){ return bkLenderNoiBasis(s) === 'after'; }, false), noi = 0, ds = 0;
  last.forEach(function(a){ noi += a.rev - a.opex - (after ? a.capex : 0); ds += a.ds != null ? a.ds : B[a.ym].ds; });
  var scale = 12 / n, dscr = ds > 0 ? noi / ds : NaN, min = safe(function(){ return bkLenderDscrMin(); }, NaN), ok = isFinite(dscr) && isFinite(min) ? dscr >= min : null;
  main += '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Covenant Test on Actuals - ' + safe(function(){ return bkDscrShort('lender'); }, 'Lender DSCR') + '</caption><tbody>'
    + '<tr><td class="rowlabel">Months used</td><td class="v">' + n + (n < 12 ? ' (annualized)' : ' (trailing twelve)') + '</td></tr>'
    + '<tr><td class="rowlabel">NOI (' + safe(function(){ return bkDscrBasis('lender'); }, 'lender basis') + '), annualized</td><td class="v">' + M(noi * scale) + '</td></tr>'
    + '<tr><td class="rowlabel">Debt service, annualized</td><td class="v">' + M(ds * scale) + '</td></tr>'
    + '<tr class="grandtotal"><td class="rowlabel">Actual DSCR</td><td class="v">' + X(dscr) + '</td></tr><tr><td class="rowlabel">Loan minimum</td><td class="v">' + X(min) + '</td></tr>'
    + '<tr><td class="rowlabel">Result</td><td class="v">' + (ok == null ? '—' : '<span class="status-chip ' + (ok ? 'pass' : 'fail') + '">' + (ok ? 'PASS' : 'BELOW MINIMUM') + '</span>') + '</td></tr></tbody></table></div>'
    + '<div class="note-flag"><span>&#9432;</span><div>The budget is the underwriting’s monthly rows. Debt service uses the actual figure where one is entered and the budget where it is not. Revenue and NOI are before capex unless the loan tests NOI after reserves.</div></div>';
  o.main = main; o.meta['Months with actuals'] = String(inHold.length); o.meta['NOI vs budget'] = M(tot.an - tot.bn); return o;
};
})();
