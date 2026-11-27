/* HOLD & DISPOSITION. For an owner deciding whether to keep a property or sell it now.
     sell now     current value (entered, or year-1 NOI / the market cap rate) less the cost of sale, the existing loan's payoff (balance + prepayment
                  penalty) and the estimated tax on the sale: the cash the owner can take out today
     hold         year by year: NOI (year-1 income grown at the rent growth, expenses at the expense growth) less replacement reserves, debt service on
                  the existing loan (the balance at maturity is repaid by the owner when maturity falls inside the hold), and capital spending;
                  at the end of the hold a sale at the exit cap on the next year's NOI, less the cost of sale, the loan balance and the tax
     compare      the hold case's IRR on the cash given up by not selling today, its NPV at the discount rate, and the call: hold when the IRR clears
                  the discount rate. Also: the IRR of selling in each year, the exit cap at which holding just breaks even, and a sensitivity grid.
     tax          an estimate for professional review: gain = sale price less costs less the adjusted basis (cost basis less accumulated depreciation);
                  the part up to the accumulated depreciation at the recapture rate (25% when blank), the rest at the capital gains rate (20% when
                  blank). Calculated only when a cost basis is entered; otherwise the comparison is before tax and says so.
   The year-1 operating statement is the app's own (bkCalc). Nothing here changes the acquisition or development engines. */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof bkLoad !== 'function') return;
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function n(v){ if(v === null || v === undefined || v === '') return null; v = Number(v); return isFinite(v) ? v : null; }
function pos(v){ v = n(v); return v !== null && v > 0 ? v : null; }
var $ = function(v){ v = n(v); if(v === null) return '-'; var a = Math.round(Math.abs(v)).toLocaleString('en-US'); return v < 0 ? '($' + a + ')' : '$' + a; };
var P = function(v, d){ v = n(v); return v === null ? '-' : (v * 100).toFixed(d == null ? 2 : d) + '%'; };
var X = function(v){ v = n(v); return v === null ? '-' : v.toFixed(2) + 'x'; };
function pmt(r, m){ return r ? r / (1 - Math.pow(1 + r, -m)) : 1 / m; }
function irr(cf){ var f = function(r){ return cf.reduce(function(a, v, t){ return a + v / Math.pow(1 + r, t); }, 0); }, lo = -0.99, hi = 5, a = f(lo), b = f(hi);
  if(!isFinite(a) || !isFinite(b) || a * b > 0) return null; for(var i = 0; i < 200; i++){ var m = (lo + hi) / 2, v = f(m); if(a * v <= 0){ hi = m; b = v; } else { lo = m; a = v; } } return (lo + hi) / 2; }
function npv(cf, r){ return cf.reduce(function(a, v, t){ return a + v / Math.pow(1 + r, t); }, 0); }
/* months from the analysis date to a date such as 6/30/2028 or 2028-06-30 */
function monthsTo(txt, start){ var t = String(txt || '').trim(); if(!t) return null; var m = /^(\d{4})-(\d{1,2})/.exec(t) || null, y, mo;
  if(m){ y = +m[1]; mo = +m[2]; } else { m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t); if(!m) return null; mo = +m[1]; y = +m[3]; if(y < 100) y += 2000; }
  return (y - start.getFullYear()) * 12 + (mo - (start.getMonth() + 1)); }

/* the tax on a sale at price, with costs, after `years` more years of depreciation */
function saleTax(s, price, costs, years){ var basis = pos(s.holdTaxBasis); if(!basis) return { tax:null, note:'not estimated: enter the cost basis' };
  var acc = Math.max(0, n(s.holdAccumDep) || 0) + Math.max(0, n(s.holdAnnualDep) || 0) * years, adj = basis - acc, gain = price - costs - adj;
  if(gain <= 0) return { tax:0, gain:gain, adj:adj, acc:acc, recapture:0, capital:0, note:'no gain on the sale' };
  var rr = n(s.holdRecaptureRate) !== null ? n(s.holdRecaptureRate) : 0.25, cg = n(s.holdCapGainsRate) !== null ? n(s.holdCapGainsRate) : 0.20, rec = Math.min(gain, acc), rest = gain - rec;
  return { tax:rec * rr + rest * cg, gain:gain, adj:adj, acc:acc, recapture:rec * rr, capital:rest * cg, rr:rr, cg:cg, note:'estimate: recapture ' + P(rr, 0) + ', capital gains ' + P(cg, 0) }; }

window.bkHold = function(s, over){
  s = Object.assign({}, s || bkLoad(), over || {}); var c = safe(function(){ return bkCalc(); }, null) || {};
  if(over) c = safe(function(){ return window.bkRunWith(over, function(){ return bkCalc(); }); }, c);
  var N = Math.max(1, Math.round(n(s.holdYears) || 5)), g = n(s.rentGrowth) || 0, og = n(s.opexGrowth) !== null ? n(s.opexGrowth) : g;
  var egi1 = n(c.egi), opex1 = n(c.total), noi1 = n(c.noi), res1 = (n(c.noi) || 0) - (n(c.after) !== null ? n(c.after) : n(c.noi) || 0);
  var cap = pos(s.valCapRate), cv = pos(s.currentValue), value = cv || (cap && noi1 > 0 ? noi1 / cap : null), valueSrc = cv ? 'entered' : value ? 'year-1 NOI / ' + P(cap) + ' market cap rate' : null;
  var exitCap = pos(s.exitCap), costPct = n(s.saleCostPct) !== null ? n(s.saleCostPct) : null, disc = pos(s.holdDiscRate) || pos(s.reverseSolveTargetIRR) || 0.08, discSrc = pos(s.holdDiscRate) ? 'entered' : pos(s.reverseSolveTargetIRR) ? 'the target IRR' : '8% when none is entered';
  var bal0 = n(s.exLoanBalance), rate = pos(s.exLoanRate) || 0, am = n(s.exLoanAmort), prepay = n(s.exPrepay) || 0;
  var missing = []; if(!(noi1 > 0)) missing.push('Operating income and expenses (a positive NOI)'); if(!value) missing.push('Current value or a market cap rate'); if(bal0 === null) missing.push('Existing loan balance (0 if none)');
  if(!exitCap) missing.push('Exit cap rate'); if(costPct === null) missing.push('Cost of sale');
  var start = safe(function(){ return bkParseDealDate(s.valDate || s.closing, new Date().toISOString().slice(0, 10)); }, new Date());
  var matM = monthsTo(s.exLoanMaturity, start);
  /* the year-by-year operating projection, one year beyond the hold for the exit value */
  var yrs = []; for(var y = 1; y <= N + 1; y++){ var egi = (egi1 || 0) * Math.pow(1 + g, y - 1), ox = (opex1 || 0) * Math.pow(1 + og, y - 1); yrs.push({ y:y, egi:egi, opex:ox, noi:egi - ox, reserves:res1 * Math.pow(1 + og, y - 1) }); }
  var cx = safe(function(){ return bkCapexByMonth(Object.assign({}, s, { closing:s.valDate || s.closing }), N * 12); }, []) || [];
  yrs.forEach(function(r){ r.capex = r.y <= N ? cx.slice((r.y - 1) * 12, r.y * 12).reduce(function(a, v){ return a + (v || 0); }, 0) : 0; });
  /* the existing loan, month by month: interest only when no amortization is entered; repaid by the owner at maturity inside the hold */
  var bal = bal0 || 0, mp = am > 0 ? pmt(rate / 12, Math.round(am * 12)) * bal : 0, balAt = [bal];
  for(var m = 1; m <= N * 12; m++){ var yi = Math.ceil(m / 12) - 1, it = bal * rate / 12, ds = 0, prin = 0, ball = 0;
    if(bal > 0){ if(am > 0){ ds = Math.min(mp, bal + it); prin = ds - it; } else ds = it; bal -= prin; if(matM !== null && m === matM){ ball = bal; bal = 0; } }
    yrs[yi].ds = (yrs[yi].ds || 0) + ds; yrs[yi].interest = (yrs[yi].interest || 0) + it; yrs[yi].balloon = (yrs[yi].balloon || 0) + ball; if(m % 12 === 0) balAt.push(bal); }
  yrs.forEach(function(r){ r.ds = r.ds || 0; r.balloon = r.balloon || 0; r.cf = r.noi - r.reserves - r.ds - r.capex - r.balloon; });
  /* selling now */
  var now = null; if(value && bal0 !== null && costPct !== null){ var t0 = saleTax(s, value, value * costPct, 0); now = { price:value, costs:value * costPct, payoff:(bal0 || 0) + prepay, balance:bal0 || 0, prepay:prepay, tax:t0.tax, taxInfo:t0 }; now.net = now.price - now.costs - now.payoff - (now.tax || 0); }
  /* selling at the end of year k (k = 1..N): the exit value on year k+1's NOI */
  function exitAt(k, xc){ var noiNext = yrs[k].noi, price = noiNext / xc, costs = price * costPct, payoff = balAt[k] || 0, t = saleTax(s, price, costs, k); return { k:k, price:price, costs:costs, payoff:payoff, tax:t.tax, taxInfo:t, net:price - costs - payoff - (t.tax || 0) }; }
  function caseFor(k, xc){ var e = exitAt(k, xc), cf = [-now.net].concat(yrs.slice(0, k).map(function(r, i){ return r.cf + (i === k - 1 ? e.net : 0); })); var inflow = yrs.slice(0, k).reduce(function(a, r){ return a + r.cf; }, 0) + e.net;
    return { k:k, exit:e, flows:cf, irr:irr(cf), npv:npv(cf, disc), multiple:now.net > 0 ? inflow / now.net : null, profit:inflow - now.net }; }
  var r = { s:s, N:N, calc:c, yrs:yrs, value:value, valueSrc:valueSrc, cap:cap, exitCap:exitCap, costPct:costPct, disc:disc, discSrc:discSrc, now:now, missing:missing, balance:bal0, rate:rate, amort:am, prepay:prepay, maturityMonth:matM, maturity:s.exLoanMaturity || '', growth:g, opexGrowth:og };
  r.ok = !missing.length && now && now.net !== null;
  if(r.ok){
    r.hold = caseFor(N, exitCap); r.byYear = []; for(var k = 1; k <= N; k++) r.byYear.push(caseFor(k, exitCap));
    r.call = r.hold.irr === null ? null : r.hold.irr >= disc ? 'HOLD' : 'SELL';
    r.forwardNOI = yrs[0].noi; r.capital = yrs.slice(0, N).reduce(function(a, x){ return a + x.capex; }, 0);
    var f = function(xc){ var h = caseFor(N, xc); return h.irr === null ? NaN : h.irr - disc; }, lo = 0.02, hi = 0.2, fa = f(lo), fb = f(hi);
    if(isFinite(fa) && isFinite(fb) && fa * fb < 0){ for(var i = 0; i < 60; i++){ var mid = (lo + hi) / 2, fm = f(mid); if(fa * fm <= 0){ hi = mid; fb = fm; } else { lo = mid; fa = fm; } } r.breakEvenCap = (lo + hi) / 2; } else r.breakEvenCap = null;
    if(!(over && over._sens)){ r.sens = { caps:[-0.005, -0.0025, 0, 0.0025, 0.005].map(function(d){ return exitCap + d; }), growth:[-0.01, 0, 0.01].map(function(d){ return g + d; }) };
    r.sens.grid = r.sens.growth.map(function(gg){ return r.sens.caps.map(function(xc){ var h = window.bkHold(s, { rentGrowth:gg, exitCap:xc, _sens:1 }); return h && h.ok ? h.hold.irr : null; }); });
    }
    /* checks: each figure recomputed another way */
    var e = r.hold.exit; r.checks = [
      { id:'holdNow', label:'Net proceeds today = value - cost of sale - payoff - tax', ok:Math.abs(now.net - (now.price - now.costs - now.payoff - (now.tax || 0))) < 0.01 },
      { id:'holdPayoff', label:'Payoff today = existing balance + prepayment penalty', ok:Math.abs(now.payoff - ((bal0 || 0) + prepay)) < 0.01 },
      { id:'holdExit', label:'Exit price = year ' + (N + 1) + ' NOI / exit cap', ok:Math.abs(e.price - yrs[N].noi / exitCap) < 0.01 },
      { id:'holdCF', label:'Each year\'s cash flow = NOI - reserves - debt service - capital - balloon', ok:yrs.slice(0, N).every(function(x){ return Math.abs(x.cf - (x.noi - x.reserves - x.ds - x.capex - x.balloon)) < 0.01; }) },
      { id:'holdIRR', label:'The hold IRR discounts the flows to zero', ok:r.hold.irr === null || Math.abs(npv(r.hold.flows, r.hold.irr)) < 1 } ];
  }
  return r;
};

/* ---------- the page ---------- */
var LABEL = { currentValue:'Current property value', valCapRate:'Or: market cap rate', valDate:'As of (analysis date)', exLoanBalance:'Existing loan balance', exLoanRate:'Existing interest rate', exLoanMaturity:'Existing maturity date', exLoanAmort:'Remaining amortization', exPrepay:'Prepayment penalty if sold now',
  holdYears:'Hold period', rentGrowth:'Rent growth', opexGrowth:'Expense growth', exitCap:'Exit cap rate', saleCostPct:'Cost of sale', holdDiscRate:'Discount rate (your required return)',
  holdTaxBasis:'Cost basis (purchase price plus improvements)', holdAccumDep:'Accumulated depreciation to date', holdAnnualDep:'Depreciation each further year', holdRecaptureRate:'Depreciation recapture rate', holdCapGainsRate:'Capital gains rate' };
function fv(v, kind){ if(v === null || v === undefined || v === '') return ''; var x = Number(v); if(!isFinite(x)) return String(v); return kind === 'pct' ? String(+(x * 100).toFixed(4)) : kind === 'text' ? String(v) : x.toLocaleString('en-US', { maximumFractionDigits:4 }); }
function inp(key, kind, s, unit, ph){ return '<tr><td class="rowlabel">' + esc(LABEL[key] || key) + '</td><td class="v"><input type="text" class="rf-in" id="hd-' + key + '" value="' + esc(fv(s[key], kind)) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + ' autocomplete="off" onchange="bkEdSet(\'' + key + '\',\'' + kind + '\',this.value,\'null\')"></td><td class="u">' + esc(unit || '') + '</td></tr>'; }
function tbl(cap, rows, id, head){ return '<div class="tbl-wrap" style="margin-top:14px;overflow-x:auto"><table class="fin"' + (id ? ' id="' + id + '"' : '') + '>' + (cap ? '<caption>' + esc(cap) + '</caption>' : '') + (head || '') + '<tbody>' + rows.join('') + '</tbody></table></div>'; }
function row(l, v, note, cls){ return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td class="rowlabel">' + esc(l) + '</td><td class="v">' + v + '</td><td class="u">' + esc(note || '') + '</td></tr>'; }
function verdict(r){ var h = r.hold; return '<div class="note-flag" style="margin-top:14px"><span>' + (r.call === 'HOLD' ? '&#10003;' : '&#9888;') + '</span><div><b>' + (r.call === 'HOLD' ? 'Hold' : r.call === 'SELL' ? 'Sell' : 'No call') + '.</b> '
  + (r.call ? 'Holding ' + r.N + ' more years earns <b>' + P(h.irr) + '</b> a year on the <b>' + $(r.now.net) + '</b> you could take out today, against a ' + P(r.disc) + ' required return (' + esc(r.discSrc) + '): ' + (r.call === 'HOLD' ? 'it clears it' : 'it falls short') + ' by ' + Math.abs(Math.round((h.irr - r.disc) * 10000)) + ' bps. NPV at ' + P(r.disc) + ': <b>' + $(h.npv) + '</b>.' : 'The hold case has no IRR (its cash flows never change sign).')
  + (r.breakEvenCap ? ' Holding breaks even at a ' + P(r.breakEvenCap) + ' exit cap (now ' + P(r.exitCap) + ').' : r.call === 'HOLD' ? ' Holding clears the required return at any exit cap up to 20%.' : r.call === 'SELL' ? ' Holding falls short even at a 2% exit cap.' : '') + (r.now.tax === null ? ' Before tax: enter the cost basis to estimate the tax on each sale.' : '') + '</div></div>'; }
function compareRows(r){ var h = r.hold, e = h.exit; return [row('Sale price', $(r.now.price), r.valueSrc), row('Cost of sale', $(-r.now.costs), P(r.costPct) + ' of price'), row('Loan payoff', $(-r.now.payoff), 'balance ' + $(r.now.balance) + ' + prepayment ' + $(r.now.prepay)), row('Tax on the sale', r.now.tax === null ? '-' : $(-r.now.tax), r.now.taxInfo.note),
  row('Net cash if sold today', $(r.now.net), '', 'grandtotal'), row('Hold: operating cash flow, ' + r.N + ' years', $(r.yrs.slice(0, r.N).reduce(function(a, x){ return a + x.cf; }, 0)), 'after debt service, reserves and capital'), row('Hold: net sale in year ' + r.N, $(e.net), $(e.price) + ' at a ' + P(r.exitCap) + ' exit cap, less costs ' + $(e.costs) + ', loan ' + $(e.payoff) + (e.tax ? ', tax ' + $(e.tax) : '')),
  row('Hold-case IRR', P(h.irr), 'on the cash given up today', 'grandtotal'), row('Equity multiple', X(h.multiple), ''), row('Profit over selling today', $(h.profit), 'undiscounted'), row('NPV at ' + P(r.disc), $(h.npv), r.discSrc)]; }
function flowTable(r){ var Y = r.yrs.slice(0, r.N), head = '<thead><tr><th class="rowlabel-h">Year</th>' + Y.map(function(x){ return '<th>Year ' + x.y + '</th>'; }).join('') + '</tr></thead>';
  var line = function(l, f, cls){ return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td class="rowlabel">' + l + '</td>' + Y.map(function(x){ return '<td class="v">' + $(f(x)) + '</td>'; }).join('') + '</tr>'; };
  return tbl('Hold case: cash flow by year', [line('Effective gross income', function(x){ return x.egi; }), line('Operating expenses', function(x){ return -x.opex; }), line('Net operating income', function(x){ return x.noi; }, 'total'), line('Replacement reserves', function(x){ return -x.reserves; }),
    line('Debt service, existing loan', function(x){ return -x.ds; }), line('Capital spending', function(x){ return -x.capex; }), line('Loan repaid at maturity', function(x){ return -x.balloon; }), line('Cash flow', function(x){ return x.cf; }, 'grandtotal'),
    line('Net sale proceeds', function(x){ return x.y === r.N ? r.hold.exit.net : 0; }), line('Total to the owner', function(x){ return x.cf + (x.y === r.N ? r.hold.exit.net : 0); }, 'grandtotal')], 'hd-flows', head); }
function byYearTable(r){ var best = r.byYear.reduce(function(a, x){ return x.irr !== null && (a === null || x.npv > a.npv) ? x : a; }, null);
  return tbl('When to sell: holding to each year', r.byYear.map(function(x){ return '<tr' + (best && x.k === best.k ? ' class="grandtotal"' : '') + '><td class="rowlabel">Sell at the end of year ' + x.k + '</td><td class="v">' + $(x.exit.net) + '</td><td class="v">' + P(x.irr) + '</td><td class="v">' + $(x.npv) + '</td><td class="v">' + X(x.multiple) + '</td></tr>'; }), 'hd-years',
    '<thead><tr><th class="rowlabel-h">Sale year</th><th>Net sale</th><th>IRR</th><th>NPV at ' + P(r.disc) + '</th><th>Multiple</th></tr></thead>') + (best ? '<p class="hd-n">The highest NPV is selling at the end of year ' + best.k + '. Selling today is the baseline: NPV 0.</p>' : ''); }
function sensTable(r){ if(!r.sens) return ''; return tbl('Hold-case IRR: exit cap (across) by rent growth (down)', r.sens.growth.map(function(gg, i){ return '<tr><td class="rowlabel">Rent growth ' + P(gg) + '</td>' + r.sens.grid[i].map(function(v){ return '<td class="v' + (v !== null && v >= r.disc ? ' hd-ok' : '') + '">' + P(v) + '</td>'; }).join('') + '</tr>'; }), 'hd-sens',
  '<thead><tr><th class="rowlabel-h"></th>' + r.sens.caps.map(function(c){ return '<th>' + P(c) + '</th>'; }).join('') + '</tr></thead>') + '<p class="hd-n">Shaded: clears the ' + P(r.disc) + ' required return.</p>'; }
function taxRows(r){ var t0 = r.now.taxInfo, t1 = r.hold.exit.taxInfo; if(r.now.tax === null) return [row('Tax', '-', 'not estimated: enter the cost basis and accumulated depreciation')];
  return [row('Adjusted basis today', $(t0.adj), 'cost basis ' + $(r.s.holdTaxBasis) + ' less depreciation ' + $(t0.acc)), row('Gain if sold today', $(t0.gain), ''), row('Recapture tax today', $(t0.recapture), P(t0.rr || 0.25, 0) + ' on gain up to the depreciation taken'), row('Capital gains tax today', $(t0.capital), P(t0.cg || 0.2, 0) + ' on the rest'),
    row('Tax if sold today', $(r.now.tax), '', 'total'), row('Tax if sold in year ' + r.N, $(r.hold.exit.tax), 'gain ' + $(t1.gain) + ' after ' + $(t1.acc) + ' of depreciation', 'total')]; }
function checksTable(r){ return tbl('Checks', r.checks.map(function(c){ return '<tr><td class="rowlabel">' + esc(c.label) + '</td><td><span class="status-chip ' + (c.ok ? 'pass' : 'fail') + '">' + (c.ok ? 'Ties' : 'Does not tie') + '</span></td></tr>'; }), 'hd-checks'); }
function sheet(){
  var s = bkLoad(), r = window.bkHold(s);
  var inputs = tbl('Today', [inp('valDate', 'text', s, 'date', 'e.g. 1/1/2027'), inp('currentValue', 'num', s, '$'), inp('valCapRate', 'pct', s, '% (used when no value is entered)'), inp('saleCostPct', 'pct', s, '% of price')])
    + tbl('Existing loan', [inp('exLoanBalance', 'num', s, '$ (0 if none)'), inp('exLoanRate', 'pct', s, '%'), inp('exLoanAmort', 'num', s, 'years left (blank = interest only)'), inp('exLoanMaturity', 'text', s, 'date (repaid by you if inside the hold)', 'e.g. 6/30/2029'), inp('exPrepay', 'num', s, '$ (0 if none)')])
    + tbl('Hold case', [inp('holdYears', 'num', s, 'years'), inp('rentGrowth', 'pct', s, '% a year'), inp('opexGrowth', 'pct', s, '% a year'), inp('exitCap', 'pct', s, '% on the next year\'s NOI'), inp('holdDiscRate', 'pct', s, '% (blank = the target IRR, else 8%)')])
    + tbl('Tax (optional, an estimate for professional review)', [inp('holdTaxBasis', 'num', s, '$'), inp('holdAccumDep', 'num', s, '$'), inp('holdAnnualDep', 'num', s, '$ a year'), inp('holdRecaptureRate', 'pct', s, '% (blank = 25%)'), inp('holdCapGainsRate', 'pct', s, '% (blank = 20%)')]);
  var res = r.ok ? verdict(r) + tbl('Hold vs sell', compareRows(r), 'hd-compare') + flowTable(r) + byYearTable(r) + sensTable(r) + tbl('Tax on a sale', taxRows(r), 'hd-tax') + checksTable(r)
    : '<div class="note-flag" style="margin-top:14px"><span>&#9888;</span><div><b>Not calculated yet.</b> Still needed: ' + esc(r.missing.join('; ')) + '. Income and expenses are entered on Property &gt; Revenues and Expenses; capital spending on Expenses &gt; Capital.</div></div>';
  return { title:'Hold vs Sell', crumbs:'Operations', desc:'Keep the property or sell it today: the hold case\'s return on the cash you could take out now.', meta:{ Property:esc(s.name || 'Untitled'), 'Hold IRR':r.ok ? P(r.hold.irr) : '-', 'Net if sold today':r.ok ? $(r.now.net) : '-', Call:r.ok && r.call ? r.call : '-' }, main:'<div class="rf hd">' + inputs + res + '</div>', sidebar:'' };
}
/* ---------- the report: one section per registry section ---------- */
var SECT = {
  holdExec:function(s, r){ return '<h2>Hold or sell</h2>' + (r.ok ? verdict(r) : '<p>Not calculated yet. Still needed: ' + esc(r.missing.join('; ')) + '.</p>'); },
  propDesc:function(s, r){ return '<h2>Property</h2>' + tbl('', [row('Property', esc(s.name || '-')), row('Location', esc(s.location || '-')), row('Type', esc(s.propertyType || '-')), row('Units', s.units ? String(s.units) : '-'), row('Year-1 NOI', $(r.yrs[0] && r.yrs[0].noi), 'before reserves'), row('Current value', $(r.value), r.valueSrc || '')]); },
  acqCashFlow:function(s, r){ return '<h2>Hold-case cash flow</h2>' + (r.ok ? flowTable(r) : '<p>Not calculated.</p>'); },
  capitalBudget:function(s, r){ var Y = r.yrs.slice(0, r.N); return '<h2>Capital requirements</h2>' + (r.capital > 0.5 ? tbl('', Y.map(function(x){ return row('Year ' + x.y, $(x.capex)); }).concat([row('Total', $(r.capital), '', 'total')])) : '<p>No capital spending is entered for the hold. Capital items are entered on Expenses &gt; Capital.</p>'); },
  holdCompare:function(s, r){ return '<h2>Hold vs sell</h2>' + (r.ok ? tbl('', compareRows(r)) + byYearTable(r) + sensTable(r) : '<p>Not calculated.</p>'); },
  saleTax:function(s, r){ return '<h2>Tax on a sale</h2>' + (r.ok ? tbl('', taxRows(r)) : '<p>Not calculated.</p>'); },
  disclosures:function(s, r){ return '<h2>Assumptions and limitations</h2><ul><li>Year-1 NOI is the app\'s operating statement; income grows at ' + P(r.growth) + ' and expenses at ' + P(r.opexGrowth) + ' a year.</li><li>The existing loan is ' + (r.amort > 0 ? 'amortizing over ' + r.amort + ' more years' : 'interest only') + (r.maturity ? ', maturing ' + esc(r.maturity) + (r.maturityMonth !== null && r.maturityMonth <= r.N * 12 ? ' (inside the hold: you repay it then; a refinance is modelled separately on Refinancing)' : '') : '') + '. A prepayment penalty is charged only on a sale today.</li><li>The tax is an estimate (recapture and capital gains at the rates shown) and needs professional review; state taxes, the net investment income tax and installment or 1031 treatment are not modelled.</li><li>The hold IRR is measured on the net cash you could take out today, which is what holding gives up.</li></ul>'; }
};
function report(){ var s = bkLoad(), r = window.bkHold(s), secs = window.BKReg ? window.BKReg.report('hold') : [];
  var body = secs.map(function(x){ var f = SECT[x.id]; return f ? '<section class="rf-sec" data-section="' + x.id + '">' + f(s, r) + '</section>' : ''; }).join('');
  return { title:'Hold vs Sell Report', crumbs:'Reports', desc:'Built from the hold and disposition analysis, one section per part of the report. Print / PDF prints it.', meta:{ Property:esc(s.name || 'Untitled') }, main:'<div class="rf rf-report hd">' + body + '</div>', sidebar:'' }; }
window.bkHoldReportSections = function(){ return Object.keys(SECT); };
var reg = function(name, fn){ var w = function(){ if(typeof window.bkHasActiveDeal === 'function' && !window.bkHasActiveDeal() && typeof window.bkEmptyState === 'function') return window.bkEmptyState(name); return fn(); }; if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer(name, w); else RENDERERS[name] = w; };
reg('Hold vs Sell', sheet); reg('Hold vs Sell Report', report);
var st = document.createElement('style'); st.textContent = '.hd .hd-n{font-size:12.5px;color:var(--ae-dim,#566577);margin:6px 2px 0}html body #viewport .hd table.fin td.hd-ok{background:var(--bk-ok-bg,#e3f3ea);font-weight:600}';
document.head.appendChild(st);
})();
