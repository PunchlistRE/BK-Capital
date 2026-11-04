/* PORTFOLIO CONSOLIDATED RETURNS. The portfolio's levered IRR is the XIRR of one combined, dated equity cash flow: every saved deal's own dated contributions
   and distributions (the same flows each deal's own IRR is computed on), added together date by date. It is never an average of deal IRRs.
   Each deal is run on a scratch copy of its snapshot (bkPortfolioMonthlyFor), so nothing here is a second calculation of a deal.
   Contributions and distributions are kept gross (a month can have both). The flows are each saved model's projection, dated; the app holds no record of
   actual cash received to date, and the page says so. A deal whose engine run fails, or whose own dated flows do not reproduce its own IRR, is left out and named. */
(function(){
'use strict';
function num(v){ v = Number(v); return isFinite(v) ? v : 0; }
function key(d){ var x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }
/* a deal's dated equity flows, gross: the closing equity on the closing date, then each month's contributions and distributions on its month-end */
window.bkPortfolioDealFlows = function(r){
  var rows = (r && r.rows) || [], eq0 = num(rows[0] && rows[0].eqDraw), out = [];
  if(!rows.length) return out;
  if(eq0 > 0 && r.closeDt) out.push({ dt:new Date(r.closeDt), contrib:eq0, dist:0 });
  rows.forEach(function(x, i){ var c = num(x.wfContrib != null ? x.wfContrib : Math.max(0, -num(x.cf))) - (i === 0 && r.closeDt ? eq0 : 0), d = num(x.wfDist != null ? x.wfDist : Math.max(0, num(x.cf)));
    out.push({ dt:new Date(x.dt), contrib:c, dist:d }); });
  return out;
};
function xirr(flows){ var v = flows.map(function(f){ return f.dist - f.contrib; }), d = flows.map(function(f){ return f.dt; });
  if(!v.some(function(a){ return a > 0; }) || !v.some(function(a){ return a < 0; })) return NaN;
  return typeof bkXirr === 'function' ? bkXirr(v, d) : NaN; }
var memo = null;
window.bkPortfolioConsolidated = function(saved){
  saved = saved || (typeof bkPortfolioLoad === 'function' ? bkPortfolioLoad() : []);
  var mk = JSON.stringify(saved); if(memo && memo.k === mk) return memo.v;
  var deals = [], excluded = [], byDate = {};
  saved.forEach(function(snap){
    var name = snap.name || snap.dealId || 'Untitled', res = typeof bkPortfolioMonthlyFor === 'function' ? bkPortfolioMonthlyFor(snap) : { ok:false, error:'no engine' };
    if(!res || !res.ok){ excluded.push({ name:name, why:'the engine could not run this deal' + (res && res.error ? ' (' + res.error + ')' : '') }); return; }
    var r = res.r, f = window.bkPortfolioDealFlows(r), own = xirr(f), engine = num(r.irr);
    var contrib = f.reduce(function(a, x){ return a + x.contrib; }, 0), dist = f.reduce(function(a, x){ return a + x.dist; }, 0);
    /* the flows must be the deal's own: their XIRR equals the deal's reported IRR, and their totals its contributions and distributions */
    var tiesIRR = isFinite(own) && isFinite(r.irr) ? Math.abs(own - r.irr) < 1e-6 : !isFinite(own) && !isFinite(r.irr), tiesC = Math.abs(contrib - num(r.contrib)) < 1, tiesD = Math.abs(dist - num(r.dist)) < 1;
    var d = { name:name, type:snap.dealType || 'Acquisition', irr:r.irr, ownIRR:own, contrib:contrib, dist:dist, first:f.length ? f[0].dt : null, last:f.length ? f[f.length - 1].dt : null, ties:tiesIRR && tiesC && tiesD, flows:f };
    if(!d.ties){ excluded.push({ name:name, why:'its dated flows do not reproduce its own IRR and totals' }); return; }
    deals.push(d);
    f.forEach(function(x){ var k = key(x.dt), b = byDate[k] || (byDate[k] = { dt:new Date(x.dt.getFullYear(), x.dt.getMonth(), x.dt.getDate()), contrib:0, dist:0 }); b.contrib += x.contrib; b.dist += x.dist; });
  });
  var flows = Object.keys(byDate).sort().map(function(k){ return byDate[k]; });
  var contrib = flows.reduce(function(a, x){ return a + x.contrib; }, 0), dist = flows.reduce(function(a, x){ return a + x.dist; }, 0);
  var sumC = deals.reduce(function(a, x){ return a + x.contrib; }, 0), sumD = deals.reduce(function(a, x){ return a + x.dist; }, 0);
  var irr = deals.length ? xirr(flows) : NaN;
  var v = { deals:deals, excluded:excluded, flows:flows, contrib:contrib, dist:dist, profit:dist - contrib, moic:contrib > 0 ? dist / contrib : NaN, irr:irr,
    reconciles:Math.abs(contrib - sumC) < 1 && Math.abs(dist - sumD) < 1, available:deals.length > 0 && isFinite(irr) && excluded.length === 0,
    reason:!saved.length ? 'No deals are saved to the portfolio.' : !deals.length ? 'No saved deal produced dated cash flows.' : excluded.length ? 'Left out: ' + excluded.map(function(e){ return e.name + ' (' + e.why + ')'; }).join('; ') + '.' : !isFinite(irr) ? 'The combined cash flow has no sign change, so it has no IRR.' : '' };
  memo = { k:mk, v:v }; return v;
};
/* how the figure reads on a page: the IRR when it covers every saved deal, otherwise "Unavailable" */
window.bkPortfolioIRRText = function(c){ c = c || window.bkPortfolioConsolidated(); return c.available ? bkPct(c.irr) : 'Unavailable'; };
window.bkPortfolioIRRNote = function(c){ c = c || window.bkPortfolioConsolidated(); if(!c.deals.length && !c.excluded.length) return '';
  return '<div class="note-flag"><span>' + (c.available ? '&#10003;' : '&#9888;') + '</span><div><b>Portfolio levered IRR</b> is the XIRR of one combined equity cash flow: each saved deal\'s dated contributions and distributions, added together on their dates (' + c.deals.length + ' deal' + (c.deals.length === 1 ? '' : 's') + ', contributions ' + '$' + bkFmt(c.contrib) + ', distributions $' + bkFmt(c.dist) + ', multiple ' + (isFinite(c.moic) ? c.moic.toFixed(2) + 'x' : '-') + '). It is not an average of deal IRRs. The flows are each saved model\'s projection on real dates; actual cash received to date is not recorded in the app.' + (c.available ? '' : ' <b>Unavailable:</b> ' + bkEsc(c.reason)) + '</div></div>'; };
/* Portfolio M: the combined dated cash flow, the IRR on it, and each deal's reconciliation */
window.bkPortfolioMBlock = function(){
  var c = window.bkPortfolioConsolidated(); if(!c.deals.length && !c.excluded.length) return '';
  var m = function(n){ return n < 0 ? '(' + bkFmt(-n) + ')' : bkFmt(n); }, yrs = {};
  c.flows.forEach(function(f){ var y = f.dt.getFullYear(), b = yrs[y] || (yrs[y] = { c:0, d:0 }); b.c += f.contrib; b.d += f.dist; });
  var Y = Object.keys(yrs).map(Number).sort(function(a, b){ return a - b; });
  var t1 = '<div class="tbl-wrap" style="margin-top:16px;overflow-x:auto"><table class="fin" id="pc-flows"><caption>Portfolio Equity Cash Flow - Dated Contributions and Distributions, by Calendar Year</caption><thead><tr><th class="rowlabel-h">Line Item</th>' + Y.map(function(y){ return '<th>' + y + '</th>'; }).join('') + '<th>Total</th></tr></thead><tbody>'
    + '<tr><td class="rowlabel">Contributions</td>' + Y.map(function(y){ return '<td>' + m(-yrs[y].c) + '</td>'; }).join('') + '<td>' + m(-c.contrib) + '</td></tr>'
    + '<tr><td class="rowlabel">Distributions</td>' + Y.map(function(y){ return '<td>' + m(yrs[y].d) + '</td>'; }).join('') + '<td>' + m(c.dist) + '</td></tr>'
    + '<tr class="grandtotal"><td class="rowlabel">Net Equity Cash Flow</td>' + Y.map(function(y){ return '<td>' + m(yrs[y].d - yrs[y].c) + '</td>'; }).join('') + '<td>' + m(c.profit) + '</td></tr>'
    + '<tr class="grandtotal"><td class="rowlabel">Portfolio Levered IRR (XIRR of the dated flows)</td><td colspan="' + (Y.length + 1) + '">' + window.bkPortfolioIRRText(c) + (c.available && isFinite(c.moic) ? ' · multiple ' + c.moic.toFixed(2) + 'x' : '') + '</td></tr></tbody></table></div>';
  var rows = c.deals.map(function(d){ return '<tr><td class="rowlabel">' + bkEsc(d.name) + '</td><td>' + bkEsc(d.type) + '</td><td>' + m(-d.contrib) + '</td><td>' + m(d.dist) + '</td><td>' + (isFinite(d.irr) ? bkPct(d.irr) : '-') + '</td><td>' + (isFinite(d.ownIRR) ? bkPct(d.ownIRR) : '-') + '</td><td><span class="status-chip pass">Ties</span></td></tr>'; }).join('')
    + c.excluded.map(function(e){ return '<tr><td class="rowlabel">' + bkEsc(e.name) + '</td><td colspan="5">' + bkEsc(e.why) + '</td><td><span class="status-chip fail">Left out</span></td></tr>'; }).join('');
  var sumC = c.deals.reduce(function(a, d){ return a + d.contrib; }, 0), sumD = c.deals.reduce(function(a, d){ return a + d.dist; }, 0);
  var t2 = '<div class="tbl-wrap" style="margin-top:16px;overflow-x:auto"><table class="fin" id="pc-recon"><caption>Reconciliation - Each Deal\'s Own Dated Flows</caption><thead><tr><th class="rowlabel-h">Deal</th><th>Type</th><th>Contributions</th><th>Distributions</th><th>Deal IRR (engine)</th><th>XIRR of the Flows Used</th><th>Status</th></tr></thead><tbody>' + rows
    + '<tr class="grandtotal"><td class="rowlabel">Sum of deals</td><td></td><td>' + m(-sumC) + '</td><td>' + m(sumD) + '</td><td colspan="2">Combined: contributions ' + m(-c.contrib) + ', distributions ' + m(c.dist) + '</td><td><span class="status-chip ' + (c.reconciles ? 'pass">Ties' : 'fail">Does not tie') + '</span></td></tr></tbody></table></div>';
  return t1 + t2 + window.bkPortfolioIRRNote(c);
};
})();
