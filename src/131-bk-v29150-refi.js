
/* ===========================================================================
   V29.15.0 - REFINANCE / RECAPITALISATION (ported from the Capital Markets model, 24_REFI RECAP)
   ===========================================================================
   For a chosen refinance year, and for every possible year:
     position      trailing NOI, value at the appraisal cap, the existing balance
     new loan      the lowest of LTV, DSCR and debt-yield capacity; the binding one
     cash-out      new loan - existing balance - refinance costs - prepayment
     afterwards    post-refinance DSCR, debt yield, LTV, balance and penalty at exit
     impact        the equity cash flow rebuilt MONTHLY with the cash-out, the new
                   debt service and the new payoff, giving IRR, multiple, profit and
                   cash returned before exit versus holding the original loan
     verdict       REFINANCE / TRADE-OFF / DO NOT REFINANCE
     reconcile     existing balance re-derived in closed form; profit bridge; net
                   cash-out tie
   It reads the engine's own monthly levered cash flow and debt schedule; it does not
   change a return. Acquisition deals with a sized, fixed-rate senior loan only.
   =========================================================================== */
(function(){
'use strict';
if(typeof bkLoad !== 'function' || typeof bkMonthlyReturns !== 'function') return;
var num = function(x){ var v = Number(x); return isFinite(v) ? v : NaN; };
function isDev(s){ return /develop/i.test(String(s.dealType || '')); }
function raw(){ var s = bkLoad(); return (s && s._refi) || {}; }
function inputs(s){
  var r = raw(), p = (typeof window.bkPolicy === 'function') ? window.bkPolicy() : { minDebtYield:0.085, minDSCR:1.25 };
  var hold = Math.max(1, Math.round(num(s.holdYears) || 10));
  var pick = function(k, dflt){ var v = num(r[k]); return (r[k] !== undefined && r[k] !== '' && isFinite(v)) ? v : dflt; };
  return { year:Math.round(pick('year', Math.min(5, Math.max(1, hold - 1)))), appraisalCap:pick('appraisalCap', num(s.exitCap)), maxLTV:pick('maxLTV', num(s.refiLTV) || 0.65),
    minDSCR:pick('minDSCR', num(s.refiDSCR) || p.minDSCR), minDebtYield:pick('minDebtYield', p.minDebtYield), rate:pick('rate', num(s.refiRate) || 0.065), amort:pick('amort', num(s.refiAmort) || 30),
    costsPct:pick('costsPct', num(s.refiOrigFee) || 0.01), prepayPct:pick('prepayPct', 0.01), exitPenaltyPct:pick('exitPenaltyPct', 0.01), hold:hold };
}
window.bkRefiInputs = function(){ return inputs(bkLoad()); };
window.bkRefiSet = function(k, v){
  var s = bkLoad(); if(!s) return; s._refi = s._refi || {}; s._refi[k] = Number(v); bkSave(s);
  setTimeout(function(){ if(typeof showSheet === 'function') showSheet('Refi / Recap'); }, 0);
};
window.bkRefiReset = function(){ var s = bkLoad(); if(!s) return; delete s._refi; bkSave(s); setTimeout(function(){ if(typeof showSheet === 'function') showSheet('Refi / Recap'); }, 0); };

function pvAnn(rate, years, annual){ var i = rate / 12, n = Math.round(years * 12); return i > 0 ? annual / 12 * (1 - Math.pow(1 + i, -n)) / i : annual * years; }
function pmtM(rate, years, loan){ var i = rate / 12, n = Math.round(years * 12); return i > 0 ? loan * i / (1 - Math.pow(1 + i, -n)) : loan / n; }
function balAfter(loan, rate, years, k){ var i = rate / 12, p = pmtM(rate, years, loan), g = Math.pow(1 + i, k); return i > 0 ? loan * g - p * (g - 1) / i : loan - p * k; }

function metricsOf(values, dates, closeDt, eq0){
  var irr = bkXirrClose(values, dates, closeDt, -eq0), pos = 0, neg = 0, sum = 0;
  values.forEach(function(v){ if(v > 0) pos += v; else neg += -v; sum += v; });
  return { irr:irr, moic:neg ? pos / neg : 0, profit:sum };
}
function refiAt(y, inp, ctx){
  var u = ctx.u, d = ctx.d, r = ctx.r, n = ctx.n, rows = r.rows, last = rows.length - 1;
  var noi = u.arr[y - 1].after, bal = (d.annual[y - 1] || {}).ending, value = noi / inp.appraisalCap;
  var cLTV = value * inp.maxLTV, cDSCR = pvAnn(inp.rate, inp.amort, noi / inp.minDSCR), cDY = noi / inp.minDebtYield;
  var loan = Math.min(cLTV, cDSCR, cDY), binding = loan === cLTV ? 'LTV' : loan === cDSCR ? 'DSCR' : 'Debt yield';
  var costs = loan * inp.costsPct, prepay = bal * inp.prepayPct, gross = loan - bal, net = gross - costs - prepay;
  var pm = pmtM(inp.rate, inp.amort, loan), ds = pm * 12, kExit = (n - y) * 12, balExit = balAfter(loan, inp.rate, inp.amort, kExit), pen = balExit * inp.exitPenaltyPct;
  var mr = y * 12, vals = rows.map(function(q){ return q.cf; }), dsDelta = 0, oldPayoff = rows[last].payoff || 0;
  vals[mr - 1] += net;
  for(var i = mr; i <= last; i++){ var dd = (rows[i].ds || 0) - pm; vals[i] += dd; dsDelta += dd; }
  var payoffDelta = oldPayoff - balExit - pen; vals[last] += payoffDelta;
  var m = metricsOf(vals, ctx.dates, r.closeDt, ctx.eq0);
  var before = vals.slice(0, last).reduce(function(a, v){ return a + v; }, 0) + ctx.eq0;
  return { year:y, noi:noi, value:value, existingBalance:bal, existingLTV:value > 0 ? bal / value : 0, capLTV:cLTV, capDSCR:cDSCR, capDY:cDY, newLoan:loan, binding:binding,
    costs:costs, prepay:prepay, grossCashOut:gross, netCashOut:net, newDS:ds, postDSCR:ds > 0 ? noi / ds : Infinity, postDY:loan > 0 ? noi / loan : 0, postLTV:value > 0 ? loan / value : 0,
    newBalanceAtExit:balExit, exitPenalty:pen, dsDelta:dsDelta, payoffDelta:payoffDelta, irr:m.irr, moic:m.moic, profit:m.profit, cashBeforeExit:before, payoffAtExit:balExit + pen };
}
function refi(){
  var s = bkLoad(); if(!s || isDev(s)) return null;
  var d = bkDebt(); if(!(d.loan > 0) || s.debtEnabled === false) return null;
  var u = bkAnnualCF(), r = bkMonthlyReturns(), n = u.arr.length; if(n < 2) return null;
  var inp = inputs(s), eq0 = Number(r.rows[0].eqDraw) || 0, dates = r.rows.map(function(q){ return q.dt; });
  var ctx = { u:u, d:d, r:r, n:n, eq0:eq0, dates:dates };
  var baseVals = r.rows.map(function(q){ return q.cf; }), base = metricsOf(baseVals, dates, r.closeDt, eq0);
  base.cashBeforeExit = baseVals.slice(0, baseVals.length - 1).reduce(function(a, v){ return a + v; }, 0) + eq0; base.payoffAtExit = r.rows[r.rows.length - 1].payoff || 0;
  var valid = inp.year >= 1 && inp.year <= n - 1;
  var sel = valid ? refiAt(inp.year, inp, ctx) : null;
  var timing = []; for(var y = 2; y <= n - 1; y++) timing.push(refiAt(y, inp, ctx));
  var peak = timing.length ? timing.reduce(function(a, b){ return b.netCashOut > a.netCashOut ? b : a; }) : null;
  var verdict = null;
  if(sel){
    var dIRR = sel.irr - base.irr, dProfit = sel.profit - base.profit, dMoic = sel.moic - base.moic;
    verdict = sel.postDSCR < inp.minDSCR ? 'DO NOT REFINANCE — post-refinance DSCR breaches the minimum'
      : (dIRR > 0 && dProfit > 0) ? 'REFINANCE — accretive to both IRR and total profit; clears minimum DSCR'
      : dIRR > 0 ? 'TRADE-OFF — refinance lifts IRR by ' + Math.round(dIRR * 10000) + ' bps but reduces total profit by $' + Math.round(-dProfit).toLocaleString('en-US') + ' and the multiple by ' + (-dMoic).toFixed(2) + 'x; clears minimum DSCR'
      : 'DO NOT REFINANCE — dilutive to IRR';
  }
  /* reconciliation: independent re-derivation of the existing balance, and the profit bridge */
  var rec = { balanceClosedForm:null, balanceEngine:null, balanceDiff:null, bridgeDiff:null, netTieDiff:null, ok:null };
  if(sel){
    var fixed = !/float/i.test(String(s.debtRateType || '')) && !num(s.refiAtMaturity);
    if(fixed){
      var k = sel.year * 12, io = Math.round((num(s.acqIO) || 0) * 12), i = d.coupon / 12, am = Math.round((num(s.acqAmort) || 30) * 12), L = d.loan, cf;
      if(k <= io) cf = L; else { var kk = k - io, g = Math.pow(1 + i, kk), p = i > 0 ? L * i / (1 - Math.pow(1 + i, -am)) : L / am; cf = i > 0 ? L * g - p * (g - 1) / i : L - p * kk; }
      rec.balanceClosedForm = cf; rec.balanceEngine = sel.existingBalance; rec.balanceDiff = sel.existingBalance - cf;
    }
    rec.bridgeDiff = (sel.profit - base.profit) - (sel.netCashOut + sel.dsDelta + sel.payoffDelta);
    rec.netTieDiff = sel.netCashOut - (sel.grossCashOut - sel.costs - sel.prepay);
    rec.ok = (rec.balanceDiff == null || Math.abs(rec.balanceDiff) < 1) && Math.abs(rec.bridgeDiff) < 1 && Math.abs(rec.netTieDiff) < 1;
  }
  return { inputs:inp, valid:valid, base:base, selected:sel, timing:timing, peak:peak, verdict:verdict, recon:rec, holdYears:n, commonEquity:eq0 };
}
window.bkRefi = refi;

/* ------------------------------------------------------------------ sheet */
function $(v){ var x = Number(v); if(!isFinite(x)) return 'n/a'; var b = Math.abs(x).toLocaleString('en-US', {maximumFractionDigits:0}); return x < 0 ? '($' + b + ')' : '$' + b; }
function P(v, d){ return (v == null || !isFinite(v)) ? 'n/a' : (v * 100).toFixed(d == null ? 2 : d) + '%'; }
function X(v){ return (v == null || !isFinite(v)) ? 'n/a' : v.toFixed(2) + 'x'; }
function chip(cls, t){ return '<span class="status-chip ' + cls + '">' + t + '</span>'; }
function inp(key, val, w){ return '<input type="text" value="' + val + '" style="width:' + (w || 90) + 'px;text-align:left" onchange="bkRefiSet(\'' + key + '\',' + (key === 'year' || key === 'amort' ? 'parseFloat(this.value)||0' : '(parseFloat(this.value)||0)/100') + ')">'; }
var render = function(){
  if(typeof window.bkHasActiveDeal === 'function' && !window.bkHasActiveDeal() && typeof window.bkEmptyState === 'function') return window.bkEmptyState('Refi / Recap');
  var s = bkLoad(), R = refi();
  if(!R) return { title:'Refi / Recap', crumbs:'Debt', desc:'Cash-out refinance sizing, timing and return impact.', meta:{ Property:s.name },
    main:'<div class="note-flag"><span>&#9432;</span><div>Refinance analysis applies to acquisition deals with a sized senior loan. This deal is a development deal, has no loan, or is too short to refinance.</div></div>', sidebar:'' };
  var I = R.inputs, S = R.selected, B = R.base;
  var t = function(cap, head, body, extra){ return '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>' + cap + '</caption>' + (head ? '<thead><tr>' + head + '</tr></thead>' : '') + '<tbody>' + body + '</tbody></table></div>' + (extra || ''); };
  var row = function(a, b, c){ return '<tr><td class="rowlabel">' + a + '</td><td class="v">' + b + '</td>' + (c !== undefined ? '<td data-bk-align="text">' + c + '</td>' : '') + '</tr>'; };
  /* the position and sizing tables carry a note column on some rows: every row gets the third cell, so the columns line up and no row is squeezed */
  var row3 = function(a, b, c){ return row(a, b, c === undefined ? '' : c); };
  var inRows = [['Refinance year (end of year)', inp('year', I.year, 60), 'Between 1 and ' + (R.holdYears - 1)], ['Appraisal cap rate', inp('appraisalCap', (I.appraisalCap * 100).toFixed(2)) + ' %', 'Value = trailing NOI / cap'],
    ['Maximum new loan LTV', inp('maxLTV', (I.maxLTV * 100).toFixed(1)) + ' %', ''], ['Minimum DSCR', X(I.minDSCR), 'Deal refinance DSCR (Inputs); edit under Credit Policy for the house minimum'],
    ['Minimum debt yield', inp('minDebtYield', (I.minDebtYield * 100).toFixed(2)) + ' %', 'Defaults to the house policy'], ['New loan coupon', inp('rate', (I.rate * 100).toFixed(2)) + ' %', ''],
    ['New loan amortisation (years)', inp('amort', I.amort, 60), ''], ['Refinance costs', inp('costsPct', (I.costsPct * 100).toFixed(2)) + ' %', 'Of the new loan'],
    ['Prepayment / defeasance on existing loan', inp('prepayPct', (I.prepayPct * 100).toFixed(2)) + ' %', 'Of the existing balance'], ['Exit prepayment on new loan', inp('exitPenaltyPct', (I.exitPenaltyPct * 100).toFixed(2)) + ' %', 'Of the balance at sale']]
    .map(function(r){ return row(r[0], r[1], r[2]); }).join('');
  var main = t('Refinance Assumptions', '<th class="rowlabel-h">Assumption</th><th>Value</th><th style="text-align:left">Note</th>', inRows);
  if(!S) main += '<div class="note-flag"><span>&#9888;</span><div>The refinance year must be between 1 and ' + (R.holdYears - 1) + ' (the year of sale cannot be refinanced).</div></div>';
  else {
    var vc = /^REFINANCE/.test(R.verdict) ? 'pass' : /^TRADE/.test(R.verdict) ? 'warn' : 'fail';
    main += '<div class="note-flag" style="margin-top:12px"><span>' + (vc === 'pass' ? '&#10003;' : '&#9888;') + '</span><div><b>' + R.verdict.replace(/&/g, '&amp;') + '</b></div></div>'
      + t('1. Position at Refinance', null, row3('Refinance year', S.year) + row3('Trailing NOI after reserves', $(S.noi)) + row3('Existing senior balance', $(S.existingBalance)) + row3('Value at appraisal cap', $(S.value)) + row3('Existing LTV', P(S.existingLTV)))
      + t('2. New Loan Sizing and Cash-Out', null, row3('LTV constraint', $(S.capLTV)) + row3('DSCR constraint', $(S.capDSCR)) + row3('Debt-yield constraint', $(S.capDY))
        + '<tr class="grandtotal"><td class="rowlabel">New loan amount</td><td class="v">' + $(S.newLoan) + '</td><td data-bk-align="text">Binding: ' + S.binding + '</td></tr>'
        + row3('Refinance costs', $(-S.costs)) + row3('Prepayment on existing loan', $(-S.prepay)) + row3('Gross cash-out', $(S.grossCashOut))
        + '<tr class="grandtotal"><td class="rowlabel">Net cash-out to equity</td><td class="v">' + $(S.netCashOut) + '</td><td data-bk-align="text">' + P(S.netCashOut / R.commonEquity) + ' of common equity</td></tr>'
        + row3('New annual debt service', $(S.newDS)) + row3('Post-refinance DSCR', X(S.postDSCR), S.postDSCR >= I.minDSCR ? chip('pass', 'PASS') : chip('fail', 'BELOW MINIMUM')) + row3('Post-refinance debt yield', P(S.postDY)) + row3('Post-refinance LTV', P(S.postLTV))
        + row3('New loan balance at exit', $(S.newBalanceAtExit)) + row3('Exit prepayment on new loan', $(S.exitPenalty)));
  }
  var trows = R.timing.map(function(x){ var sel = S && x.year === S.year, peak = R.peak && x.year === R.peak.year;
    return '<tr' + (sel ? ' class="subtotal"' : '') + '><td class="rowlabel">' + x.year + (peak ? ' (peak)' : '') + '</td><td>' + $(x.noi) + '</td><td>' + $(x.value) + '</td><td>' + $(x.existingBalance) + '</td><td>' + $(x.newLoan) + '</td><td>' + $(x.netCashOut) + '</td><td>' + X(x.postDSCR) + '</td><td>' + x.binding + '</td><td>' + P(x.irr) + '</td><td>' + ((x.irr - B.irr) * 10000 >= 0 ? '+' : '') + Math.round((x.irr - B.irr) * 10000) + ' bps</td></tr>'; }).join('');
  main += t('3. Refinance Timing - Every Possible Year', '<th class="rowlabel-h">Year</th><th>NOI</th><th>Value</th><th>Existing balance</th><th>Maximum new loan</th><th>Net cash-out</th><th>Post-refi DSCR</th><th>Binding</th><th>Equity IRR</th><th>vs. hold</th>', trows,
    R.peak ? '<div class="note-flag" style="margin-top:12px"><span>&#9432;</span><div>Peak net cash-out: <b>' + $(R.peak.netCashOut) + '</b> in year ' + R.peak.year + '. The most cash-out is not always the best year: refinancing earlier raises IRR; later raises the amount.</div></div>' : '');
  if(S){
    var f = function(a, b, fm){ return '<tr><td class="rowlabel">' + a + '</td><td>' + fm(b) + '</td><td>' + fm(a === '' ? 0 : 0) + '</td></tr>'; };
    var cmp = [['Common equity IRR', P(B.irr), P(S.irr), ((S.irr - B.irr) * 10000 >= 0 ? '+' : '') + Math.round((S.irr - B.irr) * 10000) + ' bps'], ['Equity multiple', X(B.moic), X(S.moic), (S.moic - B.moic >= 0 ? '+' : '') + (S.moic - B.moic).toFixed(2) + 'x'],
      ['Net profit', $(B.profit), $(S.profit), $(S.profit - B.profit)], ['Cash returned before exit', $(B.cashBeforeExit), $(S.cashBeforeExit), $(S.cashBeforeExit - B.cashBeforeExit)], ['Loan payoff at exit (incl. penalty)', $(B.payoffAtExit), $(S.payoffAtExit), $(S.payoffAtExit - B.payoffAtExit)]]
      .map(function(r){ return '<tr><td class="rowlabel">' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td><td>' + r[3] + '</td></tr>'; }).join('');
    main += t('4. Return Impact - Refinance Case vs. Holding the Original Loan (monthly cash flow)', '<th class="rowlabel-h">Metric</th><th>Hold original loan</th><th>Refinance case</th><th>Delta</th>', cmp);
    var rc = R.recon;
    main += t('5. Reconciliation', null, row('Existing balance, engine', $(rc.balanceEngine == null ? S.existingBalance : rc.balanceEngine)) + row('Existing balance, closed form', rc.balanceClosedForm == null ? 'n/a (floating rate or refinance at maturity)' : $(rc.balanceClosedForm))
      + row('Difference (must be zero)', rc.balanceDiff == null ? 'n/a' : $(rc.balanceDiff)) + row('Profit bridge: cash-out + debt-service change + payoff change vs. actual (must be zero)', $(rc.bridgeDiff)) + row('Net cash-out ties to gross less costs (must be zero)', $(rc.netTieDiff))
      + '<tr class="grandtotal"><td class="rowlabel">Overall</td><td class="v">' + (rc.ok ? chip('pass', 'PASS') : chip('fail', 'CHECK')) + '</td></tr>');
  }
  main += '<div class="note-flag" style="margin-top:12px"><span>&#9432;</span><div>This is a property-level, pre-tax view of the equity cash flow rebuilt monthly: the cash-out arrives at the end of the refinance year, debt service changes from the next month, and the payoff at sale is the new loan’s balance plus its prepayment penalty. It does not re-run the JV waterfall, and the refinance is not part of the base case unless you add it there.</div></div>';
  return { title:'Refi / Recap', crumbs:'Debt', desc:'Cash-out refinance sizing, timing and return impact against holding the original loan.',
    meta:{ Property:s.name, Year:I.year, 'Net cash-out':S ? $(S.netCashOut) : 'n/a' }, main:main,
    sidebar:(typeof sidebarShell === 'function' && S) ? sidebarShell('<div class="card"><div class="card-head">Refinance</div><div class="metric-list"><div class="metric-row"><span class="k">Net cash-out</span><span class="v">' + $(S.netCashOut) + '</span></div><div class="metric-row"><span class="k">New loan</span><span class="v">' + $(S.newLoan) + '</span></div><div class="metric-row"><span class="k">Post-refi DSCR</span><span class="v">' + X(S.postDSCR) + '</span></div><div class="metric-row"><span class="k">IRR vs. hold</span><span class="v">' + Math.round((S.irr - B.irr) * 10000) + ' bps</span></div></div></div>' + (typeof colorKeyCard === 'function' ? colorKeyCard() : '')) : '' };
};
if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Refi / Recap', render); else if(typeof RENDERERS !== 'undefined') RENDERERS['Refi / Recap'] = render;
})();
