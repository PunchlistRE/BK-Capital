/* PORTFOLIO ANALYSIS. How the saved properties add up, and what to do next. The holdings are the deals saved to the portfolio (Portfolio page);
   every figure is read from engines that already exist, so nothing is calculated twice:
     per holding     bkPortfolioMetricsFor (each deal run on its own scratch copy): levered IRR, multiple, equity, loan, year-1 NOI, price, exit cap
     value           year-1 NOI / the deal's exit cap (a current-value estimate), or the price when there is no NOI or cap
     combined        bkPortfolioConsolidated: every deal's dated equity flows added by date; its XIRR is the portfolio IRR, and it reconciles to the deals
     maturities      each loan matures at closing + its term (blank term = the hold); the debt maturing within 24 months of today is the exposure
     concentration   shares of value by property type, by location and the largest holding
     scenarios       the portfolio IRR with each holding left out (sold, or not bought): what each one adds to or takes from the whole
   The analysis record itself is not a holding: it names the portfolio and carries its notes. */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof bkLoad !== 'function') return;
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function n(v){ v = Number(v); return isFinite(v) ? v : 0; }
var $ = function(v){ if(v === null || v === undefined || !isFinite(v)) return '-'; var a = Math.round(Math.abs(v)).toLocaleString('en-US'); return v < 0 ? '($' + a + ')' : '$' + a; };
var P = function(v, d){ return v === null || v === undefined || !isFinite(v) ? '-' : (v * 100).toFixed(d == null ? 2 : d) + '%'; };
var X = function(v){ return v === null || v === undefined || !isFinite(v) ? '-' : v.toFixed(2) + 'x'; };
function parseDate(t){ return safe(function(){ return bkParseDealDate(t, null); }, null); }

window.bkPortfolioAnalysis = function(){
  var saved = safe(function(){ return bkPortfolioLoad(); }, []) || [], today = new Date(), horizon = new Date(today.getFullYear(), today.getMonth() + 24, today.getDate());
  var C = safe(function(){ return bkPortfolioConsolidated(saved); }, null);
  var H = saved.map(function(snap){ var m = safe(function(){ return bkPortfolioMetricsFor(snap); }, { ok:false }) || { ok:false };
    var noi = n(m.y1noi), cap = n(snap.exitCap) || n(m.exitCap), price = n(m.purchasePrice) || n(snap.purchasePrice), value = noi > 0 && cap > 0 ? noi / cap : price;
    var close = parseDate(snap.closing), term = n(snap.debtTerm) || n(snap.holdYears), mat = close && term > 0 && n(m.loan) > 0 ? new Date(close.getFullYear(), close.getMonth() + Math.round(term * 12), close.getDate()) : null;
    var loc = String(snap.location || '').split(',').pop().trim() || 'Not stated';
    return { name:snap.name || snap.dealId || 'Untitled', key:snap.dealId || snap.name, type:snap.propertyType || 'Not stated', deal:snap.dealType || 'Acquisition', location:loc, ok:m.ok, error:m.error, irr:m.irr, moic:m.moic, equity:n(m.equity), loan:n(m.loan), noi:noi, price:price, cap:cap, value:value, valueSrc:noi > 0 && cap > 0 ? 'NOI / ' + P(cap) + ' cap' : 'price', maturity:mat, maturesSoon:!!(mat && mat <= horizon) }; });
  var ok = H.filter(function(h){ return h.ok; }), gav = ok.reduce(function(a, h){ return a + h.value; }, 0), debt = ok.reduce(function(a, h){ return a + h.loan; }, 0), noi = ok.reduce(function(a, h){ return a + h.noi; }, 0);
  var share = function(key){ var by = {}; ok.forEach(function(h){ by[h[key]] = (by[h[key]] || 0) + h.value; }); return Object.keys(by).map(function(k){ return { name:k, value:by[k], share:gav > 0 ? by[k] / gav : 0 }; }).sort(function(a, b){ return b.value - a.value; }); };
  var largest = ok.slice().sort(function(a, b){ return b.value - a.value; })[0] || null;
  var r = { saved:saved, holdings:H, count:ok.length, gav:gav, debt:debt, equity:gav - debt, noi:noi, ltv:gav > 0 ? debt / gav : null, capRate:(function(){ var inc = ok.filter(function(h){ return h.noi > 0; }), v = inc.reduce(function(a, h){ return a + h.value; }, 0); return v > 0 ? noi / v : null; })(), C:C, irr:C && C.available ? C.irr : null, moic:C && C.available ? C.moic : null,
    maturing:ok.filter(function(h){ return h.maturesSoon; }).reduce(function(a, h){ return a + h.loan; }, 0), byType:share('type'), byLoc:share('location'), largest:largest, largestShare:largest && gav > 0 ? largest.value / gav : null };
  r.missing = []; if(!saved.length) r.missing.push('Saved deals: save each property to the portfolio from its own deal (Portfolio page, Save Active Deal)'); else if(!ok.length) r.missing.push('A saved deal that the engine can run');
  r.ok = !r.missing.length;
  /* scenarios: the whole without each holding */
  if(r.ok && saved.length > 1) r.scenarios = saved.map(function(snap, i){ var rest = saved.filter(function(_, j){ return j !== i; }), c2 = safe(function(){ return bkPortfolioConsolidated(rest); }, null), irr2 = c2 && c2.available ? c2.irr : null;
    return { name:H[i].name, irr:irr2, delta:irr2 !== null && r.irr !== null ? r.irr - irr2 : null }; });
  r.checks = [ { id:'portfolioTies', label:'Combined cash flows equal the sum of the holdings, and each holding reproduces its own IRR', ok:!!(C && C.reconciles && C.excluded.length === 0) },
    { id:'pfValue', label:'Gross asset value = the sum of the holdings\' values', ok:Math.abs(gav - ok.reduce(function(a, h){ return a + h.value; }, 0)) < 1 },
    { id:'pfShares', label:'Concentration shares add to 100%', ok:!gav || Math.abs(r.byType.reduce(function(a, x){ return a + x.share; }, 0) - 1) < 1e-9 } ];
  return r;
};

function tbl(cap, rows, id, head){ return '<div class="tbl-wrap" style="margin-top:14px;overflow-x:auto"><table class="fin"' + (id ? ' id="' + id + '"' : '') + '>' + (cap ? '<caption>' + esc(cap) + '</caption>' : '') + (head || '') + '<tbody>' + rows.join('') + '</tbody></table></div>'; }
function row(l, v, note, cls){ return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td class="rowlabel">' + esc(l) + '</td><td class="v">' + v + '</td><td class="u">' + esc(note || '') + '</td></tr>'; }
function head(cols){ return '<thead><tr>' + cols.map(function(c, i){ return '<th' + (i ? '' : ' class="rowlabel-h"') + '>' + c + '</th>'; }).join('') + '</tr></thead>'; }
function fmtD(d){ return d ? (d.getMonth() + 1) + '/' + d.getFullYear() : '-'; }
function summary(r){ return tbl('Portfolio summary', [row('Properties', String(r.count), r.holdings.length > r.count ? (r.holdings.length - r.count) + ' could not be run' : ''), row('Gross asset value', $(r.gav), 'each holding\'s NOI / its cap rate, or its price'), row('Debt', $(r.debt), 'loans at origination'),
  row('Equity in the value', $(r.equity), 'value less debt'), row('NOI, year 1', $(r.noi), 'after reserves'), row('Portfolio LTV', P(r.ltv, 1), ''), row('Portfolio cap rate', P(r.capRate), 'NOI / the value of the holdings with income'),
  row('Portfolio IRR', r.irr === null ? 'Unavailable' : P(r.irr), r.irr === null ? (r.C && r.C.reason) || '' : 'one combined dated equity cash flow', 'grandtotal'), row('Portfolio multiple', X(r.moic), ''), row('Debt maturing within 24 months', $(r.maturing), r.debt ? P(r.maturing / r.debt, 0) + ' of the debt' : '')], 'pf-sum'); }
function holdingsTable(r){ return tbl('Holdings side by side', r.holdings.map(function(h){ return '<tr><td class="rowlabel">' + esc(h.name) + '<div class="pf-sub">' + esc(h.type + ' · ' + h.location + ' · ' + h.deal) + '</div></td>' + (h.ok ? '<td class="v">' + $(h.value) + '</td><td class="v">' + $(h.noi) + '</td><td class="v">' + $(h.loan) + '</td><td class="v">' + P(h.value ? h.loan / h.value : null, 1) + '</td><td class="v">' + P(h.irr) + '</td><td class="v">' + X(h.moic) + '</td><td class="v">' + fmtD(h.maturity) + '</td>' : '<td colspan="7">Could not run: ' + esc(h.error || '') + '</td>') + '</tr>'; }), 'pf-hold',
  head(['Property', 'Value', 'NOI, yr 1', 'Debt', 'LTV', 'Levered IRR', 'Multiple', 'Loan matures'])); }
function concTable(cap, list, id){ return tbl(cap, list.map(function(x){ return '<tr><td class="rowlabel">' + esc(x.name) + '</td><td class="v">' + $(x.value) + '</td><td class="v">' + P(x.share, 1) + '</td></tr>'; }), id, head(['', 'Value', 'Share'])); }
function maturityTable(r){ var L = r.holdings.filter(function(h){ return h.ok && h.loan > 0; }).sort(function(a, b){ return (a.maturity || 9e15) - (b.maturity || 9e15); });
  return tbl('Debt maturities', L.map(function(h){ return '<tr' + (h.maturesSoon ? ' class="pf-soon"' : '') + '><td class="rowlabel">' + esc(h.name) + '</td><td class="v">' + fmtD(h.maturity) + '</td><td class="v">' + $(h.loan) + '</td><td>' + (h.maturesSoon ? '<span class="status-chip warn">WITHIN 24 MONTHS</span>' : '') + '</td></tr>'; }), 'pf-mat', head(['Loan', 'Matures', 'Amount', ''])); }
function risk(r){ var notes = []; if(r.largestShare > 0.4) notes.push(esc(r.largest.name) + ' is ' + P(r.largestShare, 0) + ' of the value: one property drives the result.');
  if(r.byLoc[0] && r.byLoc[0].share > 0.6 && r.byLoc.length > 0) notes.push(P(r.byLoc[0].share, 0) + ' of the value is in ' + esc(r.byLoc[0].name) + '.');
  if(r.byType[0] && r.byType[0].share > 0.75) notes.push(P(r.byType[0].share, 0) + ' of the value is ' + esc(r.byType[0].name) + '.');
  if(r.maturing > 0) notes.push($(r.maturing) + ' of debt matures within 24 months: plan the refinances now.');
  if(r.ltv > 0.7) notes.push('Portfolio LTV of ' + P(r.ltv, 0) + ' leaves little room for a fall in value.');
  return '<div class="note-flag" style="margin-top:14px"><span>' + (notes.length ? '&#9888;' : '&#10003;') + '</span><div><b>' + (notes.length ? 'Risks to look at' : 'No concentration or maturity flags') + '.</b> ' + (notes.length ? notes.join(' ') : 'No holding is over 40% of the value, no location over 60%, no type over 75%, and no loan matures within 24 months.') + '</div></div>'; }
function scenTable(r){ if(!r.scenarios) return '<p class="pf-n">With one holding there is nothing to compare: save more deals to the portfolio.</p>';
  return tbl('Scenarios: the portfolio without each holding', r.scenarios.map(function(x){ return '<tr><td class="rowlabel">Without ' + esc(x.name) + '</td><td class="v">' + (x.irr === null ? '-' : P(x.irr)) + '</td><td class="v">' + (x.delta === null ? '-' : (x.delta >= 0 ? '+' : '') + (x.delta * 10000).toFixed(0) + ' bps') + '</td></tr>'; }), 'pf-scen', head(['Scenario', 'Portfolio IRR', 'What the holding adds']))
    + '<p class="pf-n">A holding that adds negative basis points pulls the portfolio\'s return down: a candidate to sell, refinance or rework.</p>'; }
function checksTable(r){ return tbl('Checks', r.checks.map(function(c){ return '<tr><td class="rowlabel">' + esc(c.label) + '</td><td><span class="status-chip ' + (c.ok ? 'pass' : 'fail') + '">' + (c.ok ? 'Ties' : 'Does not tie') + '</span></td></tr>'; }), 'pf-checks'); }
function sheet(){ var s = bkLoad(), r = window.bkPortfolioAnalysis();
  var main = r.ok ? summary(r) + risk(r) + holdingsTable(r) + concTable('Concentration by property type', r.byType, 'pf-type') + concTable('Concentration by location', r.byLoc, 'pf-loc') + maturityTable(r) + scenTable(r) + checksTable(r)
    : '<div class="note-flag" style="margin-top:14px"><span>&#9888;</span><div><b>No holdings yet.</b> ' + esc(r.missing.join('; ')) + '. <a href="#" onclick="showSheet(\'Portfolio\');return false">Open Portfolio</a></div></div>';
  return { title:'Portfolio Analysis', crumbs:'Portfolio', desc:'How the saved properties add up: value, debt, the combined return, maturities, concentration and what each holding adds.', meta:{ Portfolio:esc(s.name || 'Portfolio'), Properties:String(r.count), IRR:r.irr === null ? '-' : P(r.irr) }, main:'<div class="rf pf">' + main + '</div>', sidebar:'' }; }
var SECT = {
  pfExec:function(r){ return '<h2>Portfolio summary</h2>' + summary(r) + risk(r); }, pfComposition:function(r){ return '<h2>Composition</h2>' + concTable('By property type', r.byType) + concTable('By location', r.byLoc); },
  pfValues:function(r){ return '<h2>Values</h2>' + tbl('', r.holdings.filter(function(h){ return h.ok; }).map(function(h){ return row(h.name, $(h.value), h.valueSrc); })); },
  pfOps:function(r){ return '<h2>Operating performance</h2>' + tbl('', r.holdings.filter(function(h){ return h.ok; }).map(function(h){ return row(h.name, $(h.noi), 'year-1 NOI'); }).concat([row('Total', $(r.noi), '', 'total')])); },
  pfConsolidation:function(r){ return '<h2>Consolidation</h2><p>Every holding\'s dated equity flows are added by date: ' + $(r.C ? r.C.contrib : null) + ' contributed, ' + $(r.C ? r.C.dist : null) + ' distributed, a ' + X(r.moic) + ' multiple and a ' + (r.irr === null ? 'unavailable' : P(r.irr)) + ' IRR. The combined flows ' + (r.C && r.C.reconciles ? 'reconcile' : 'do not reconcile') + ' to the holdings.</p>'; },
  pfDebt:function(r){ return '<h2>Debt and maturities</h2>' + maturityTable(r); }, pfCapital:function(r){ return '<h2>Capital</h2><p>Capital spending is in each holding\'s own cash flow; its levered IRR and the portfolio IRR include it.</p>'; },
  pfTax:function(r){ return '<h2>Tax</h2><p>Tax is modelled deal by deal on each holding\'s After-Tax page; the portfolio figures are before tax.</p>'; },
  pfCompare:function(r){ return '<h2>Holdings compared</h2>' + holdingsTable(r); }, pfRisk:function(r){ return '<h2>Risk</h2>' + risk(r); }, pfScenarios:function(r){ return '<h2>Scenarios</h2>' + scenTable(r); },
  disclosures:function(r){ return '<h2>Assumptions and limitations</h2><ul><li>Each holding is its saved deal run by the same engines as on its own pages.</li><li>Value is year-1 NOI over the deal\'s exit cap rate (or its price): an estimate, not an appraisal.</li><li>Debt is each loan at origination; maturity is closing plus the loan term.</li><li>The portfolio IRR is the XIRR of the combined dated equity flows, not an average of the deals\' IRRs.</li></ul>'; } };
function report(){ var s = bkLoad(), r = window.bkPortfolioAnalysis(), secs = window.BKReg ? window.BKReg.report('portfolio') : [];
  var body = r.ok ? secs.map(function(x){ var f = SECT[x.id]; return f ? '<section class="rf-sec" data-section="' + x.id + '">' + f(r) + '</section>' : ''; }).join('') : '<p>No holdings yet. ' + esc(r.missing.join('; ')) + '.</p>';
  return { title:'Portfolio Report', crumbs:'Reports', desc:'Built from the portfolio analysis, one section per part of the report. Print / PDF prints it.', meta:{ Portfolio:esc(s.name || 'Portfolio') }, main:'<div class="rf rf-report pf">' + body + '</div>', sidebar:'' }; }
window.bkPortfolioReportSections = function(){ return Object.keys(SECT); };
var reg = function(name, fn){ var w = function(){ return fn(); }; if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer(name, w); else RENDERERS[name] = w; };
reg('Portfolio Analysis', sheet); reg('Portfolio Report', report);
var st = document.createElement('style'); st.textContent = '.pf .pf-sub{font-size:11.5px;color:var(--ae-dim,#566577);font-weight:400}.pf .pf-n{font-size:12.5px;color:var(--ae-dim,#566577);margin:6px 2px 0}';
document.head.appendChild(st);
})();
