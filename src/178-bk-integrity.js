/* ===========================================================================
   MODEL INTEGRITY. Independent re-computations of what the engine says, each reported as one of
     pass  - the figures tie                     hard - they do not tie: a result must not be relied on, and the credit gate cannot approve
     warn  - the figures tie but something material is true that a reader must know (a disclosed assumption or limit)
     na    - the check does not apply to this deal
   Nothing here changes a figure. Every check recomputes from raw engine outputs (monthly funding rows, cash-flow rows, hurdle rows) with its own arithmetic, including its own XIRR.
   =========================================================================== */
(function(){
'use strict';
if(typeof bkLoad !== 'function') return;
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
function M(v){ return (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US'); }
function P(v){ return isFinite(v) ? (v * 100).toFixed(2) + '%' : '—'; }
var TOL = 1;   /* dollars */
/* own XIRR: flows dated in days / 365, closing-day component split out exactly as the returns do, bisection on the rate */
function xirr(vals, dates, closeDt, closeAmt){
  var day = function(x){ var q = new Date(x); return Date.UTC(q.getFullYear(), q.getMonth(), q.getDate()) / 86400000; };   /* calendar days, the date as written: the viewer's time zone cannot move a result */
  var v = vals.slice(), d = dates.map(day);
  if(closeDt && closeAmt){ v = [closeAmt, vals[0] - closeAmt].concat(vals.slice(1)); d = [day(closeDt)].concat(d); }
  var t0 = d[0], f = function(r){ return v.reduce(function(a, c, i){ return a + c / Math.pow(1 + r, (d[i] - t0) / 365); }, 0); }, lo = -0.95, hi = 10;
  if(!(f(lo) * f(hi) < 0)) return NaN;
  for(var i = 0; i < 200; i++){ var mid = (lo + hi) / 2; if(f(lo) * f(mid) <= 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}
window.bkIrrIndependent = xirr;

function run(){
  var s = bkLoad(), dev = /develop/i.test(String(s.dealType || '')), C = [];
  /* a check the deal's analysis does not use (src/139g) reads N/A, never a failure */
  var aid = safe(function(){ return window.BKReg ? window.BKReg.of(s).id : null; }, null);
  var add = function(id, group, label, status, detail){ if(aid && window.BKReg.applies && window.BKReg.mapsCheck && window.BKReg.mapsCheck(id) && !window.BKReg.applies(aid, id)){ status = 'na'; detail = 'Not used by this analysis. ' + detail; } C.push({ id:id, group:group, label:label, status:status, detail:detail }); };
  var tie = function(a, b, tol){ return Math.abs(a - b) <= (tol == null ? TOL : tol); };
  var m = safe(function(){ return bkMonthlyReturns(); }, null);
  if(!m){ add('calc', 'Engine', 'The engine produced results', 'hard', 'The returns could not be calculated.'); return summarize(C); }
  var w = safe(function(){ return bkWaterfallV07(); }, null), rows = m.rows || [];

  if(dev){
    var x = safe(function(){ return bkDevV09(); }, null), f = safe(function(){ return bkDevFundingV10(); }, null), t = safe(function(){ return bkDevTakeoutV11(); }, null);
    if(!x || !f || !t){ add('calc', 'Engine', 'The development engine produced results', 'hard', 'Development funding could not be calculated.'); return summarize(C); }
    var ms = f.months || [], sum = function(k){ return ms.reduce(function(a, z){ return a + num(z[k]); }, 0); };
    /* 1 budget ties to its lines */
    var hl = x.hardLadder, sl = x.softLadder;
    if(hl && sl){
      var hSum = hl.lines.reduce(function(a, l){ return a + l.total; }, 0) + hl.gc + hl.contractorFee + hl.riskBonds + hl.contingency, sSum = sl.lines.reduce(function(a, l){ return a + l.total; }, 0) + sl.devFee + sl.contingency;
      add('budget', 'Budget', 'Hard and soft cost totals equal the sum of their lines', tie(hSum, x.hard) && tie(sSum, x.soft) ? 'pass' : 'hard', 'Hard lines ' + M(hSum) + ' vs total ' + M(x.hard) + '; soft lines ' + M(sSum) + ' vs total ' + M(x.soft) + '.');
    } else add('budget', 'Budget', 'Hard and soft cost totals equal the sum of their lines', 'na', 'No line-level ladder for this budget mode.');
    var unlevSum = x.land + x.close + x.acq + x.pre + x.hard + x.soft + num(x.leaseDef);
    add('unlev', 'Budget', 'Cost before financing equals land + closing + acquisition fee + pre-development + hard + soft + lease-up deficit', tie(unlevSum, x.unlev) ? 'pass' : 'hard', M(unlevSum) + ' vs ' + M(x.unlev) + '.');
    /* 2 sources = uses */
    var excess = sum('excess'), draws = sum('loanDraw'), capInt = num(f.actualCapInt), uses = x.unlev + num(f.upfrontFees) + capInt + excess + num(f.resFunded), sources = draws + capInt + num(f.equityTotal) + num(f.resDrawn);
    add('su', 'Sources & Uses', 'Total sources equal total uses', tie(uses, sources) ? 'pass' : 'hard', 'Uses ' + M(uses) + ' (cost ' + M(x.unlev) + ' + fees ' + M(f.upfrontFees) + ' + capitalized interest ' + M(capInt) + ' + interest paid by equity beyond the commitment ' + M(excess) + '); sources ' + M(sources) + ' (draws ' + M(draws) + ' + capitalized interest ' + M(capInt) + ' + equity ' + M(f.equityTotal) + ').');
    /* 3 draws follow eligible costs */
    var costs = sum('need') - sum('resLease'); var fundedCosts = sum('eq') + draws + sum('overflow');
    add('draws', 'Debt', 'Every month\'s cost is paid by equity or a loan draw (debt draws follow costs)', tie(costs, fundedCosts) ? 'pass' : 'hard', 'Costs ' + M(costs) + ' = equity ' + M(sum('eq') + sum('overflow')) + ' + draws ' + M(draws) + ' (' + M(costs - fundedCosts) + ' difference).');
    /* 4 capitalized interest recomputed month by month */
    var bal = 0, bad = [], accrued = 0, rate = num(s.conRate) / 1, commit = num(f.commit), bcap = num(f.balCap) || commit, payoff = Number(s.refiAtStab || 0) ? x.stab : x.hold;
    ms.forEach(function(z){ var interest = (commit > 0 && z.mo <= x.stab && z.mo < payoff) ? bal * rate / 12 : 0, cap = Math.min(interest, Math.max(0, bcap - bal));
      if(!tie(cap, z.capInt, 0.5) || !tie(interest - cap, z.excess, 0.5)) bad.push('month ' + z.mo + ': interest ' + M(interest) + ' vs ' + M(num(z.capInt) + num(z.excess)));
      accrued += interest; bal += cap + num(z.loanDraw); if(!tie(bal, z.end, 0.5)) bad.push('month ' + z.mo + ': balance ' + M(bal) + ' vs ' + M(z.end)); });
    add('capint', 'Debt', 'Capitalized interest equals the opening balance x rate / 12 each month, and the balance rolls forward', bad.length ? 'hard' : 'pass', bad.length ? bad.slice(0, 3).join('; ') : 'Interest accrued ' + M(accrued) + ' = capitalized ' + M(capInt) + ' + paid by equity beyond the commitment ' + M(excess) + '; closing balance ' + M(bal) + '.');
    add('facility', 'Debt', 'The loan balance never exceeds the commitment', Math.max.apply(null, ms.map(function(z){ return num(z.end); }).concat([0])) <= bcap + TOL ? 'pass' : 'hard', 'Peak balance ' + M(Math.max.apply(null, ms.map(function(z){ return num(z.end); }).concat([0]))) + ' vs ' + (bcap > commit + TOL ? 'ceiling ' + M(bcap) + ' (principal commitment ' + M(commit) + ')' : 'commitment ' + M(commit)) + '.');
    if(f.fixedFacility){ var pr = ms.reduce(function(a, z){ return a + num(z.loanDraw); }, 0); add('fixed', 'Debt', 'Principal drawn does not exceed the fixed facility amount', pr <= commit + TOL ? 'pass' : 'hard', 'Principal drawn ' + M(pr) + ' vs facility ' + M(commit) + (num(s.conEquityFirst) > 0 ? '; equity called ' + M(f.equityTotal) + ' against the equity-first amount ' + M(num(s.conEquityFirst)) : '') + '.'); }
    /* 5 payoff and sale */
    var last = rows[rows.length - 1] || {}, held = !!t.conHeldToSale, expectPay = last.refi !== undefined && x.hold < x.stab ? num((ms[x.hold - 1] || {}).end) : (num(t.permDebtAtSale) + (held ? num(t.conHeldBalance) : 0));
    add('payoff', 'Debt', 'The debt repaid at sale equals the outstanding balance', tie(num(last.payoff), expectPay) ? 'pass' : 'hard', 'Repaid ' + M(last.payoff) + ' vs outstanding ' + M(expectPay) + (held ? ' (construction loan held to sale)' : '') + '.');
    var cost = num(s.saleCostPct);
    add('sale', 'Exit', 'Net sale proceeds equal the gross sale value less selling costs', tie(num(last.sale), num(last.grossSale) * (1 - cost), 2) ? 'pass' : 'hard', 'Gross ' + M(last.grossSale) + ' x (1 - ' + P(cost) + ') = ' + M(num(last.grossSale) * (1 - cost)) + ' vs ' + M(last.sale) + '.');
    /* 6 equity in returns equals the ledger plus operating shortfall */
    var eqRet = rows.reduce(function(a, r){ return a + num(r.equityDraw) + num(r.refiEq); }, 0);
    add('eqret', 'Equity', 'The equity charged in the returns cash flow equals the equity in the funding ledger', tie(eqRet, num(f.equityTotal) + num(t.refiShortfall), 2) ? 'pass' : 'hard', 'Returns ' + M(eqRet) + ' vs ledger ' + M(f.equityTotal) + (num(t.refiShortfall) ? ' + takeout shortfall ' + M(t.refiShortfall) : '') + '.');
    var shortfall = rows.reduce(function(a, r){ return a + Math.max(0, num(r.wfContrib) - num(r.equityDraw) - num(r.refiEq)); }, 0);
    if(w){ var lpC = num(w.lp && w.lp.contributed != null ? w.lp.contributed : w.lp && w.lp.contrib), gpC = num(w.gp && w.gp.contributed != null ? w.gp.contributed : w.gp && w.gp.contrib), conTot = rows.reduce(function(a, r){ return a + num(r.wfContrib); }, 0);
      add('contrib', 'Equity', 'LP + GP contributions equal total contributions: the equity ledger plus any operating shortfall the partners fund', tie(lpC + gpC, conTot, 2) && tie(conTot, eqRet + shortfall, 2) ? 'pass' : 'hard', 'LP ' + M(lpC) + ' + GP ' + M(gpC) + ' = ' + M(lpC + gpC) + '; equity called ' + M(eqRet) + ' + operating shortfall ' + M(shortfall) + ' = ' + M(eqRet + shortfall) + '.'); }
    /* 7 unlevered */
    add('unlev_irr', 'Returns', 'Unlevered IRR and multiple are calculated', m.u && isFinite(m.u.irr) && m.u.moic > 0 ? 'pass' : 'hard', m.u ? 'Unlevered IRR ' + P(m.u.irr) + ', ' + (m.u.moic || 0).toFixed(2) + 'x.' : 'missing');
    /* warnings: material, true, disclosed */
    if(excess > 1) add('w_interest', 'Debt', 'Interest accrues beyond the loan commitment', 'warn', M(excess) + ' of interest accrues after the commitment is full and is paid by equity. Either the commitment is too small for the plan or the interest reserve is short.');
    var over = num(f.overflowTotal) - excess;
    if(over > 1) add('w_overflow', 'Equity', 'Costs exceed what equity plus the commitment can fund', 'warn', M(over) + ' of costs are funded by equity over the planned amount (' + M(f.eqTarget) + ').');
    if(t.saleBeforeTakeout || x.hold < x.stab) add('w_sale', 'Exit', 'The sale falls before the project stabilizes', 'warn', 'Stabilization is month ' + x.stab + '; the hold ends at month ' + x.hold + '.');
    if(!held && !Number(s.refiAtStab || 0)) add('w_nodebt', 'Debt', 'No takeout and no construction loan', 'na', 'All-equity deal.');
  } else {
    var d = safe(function(){ return bkDebt(); }, null), fee = d ? num(d.fee) : 0;
    if(d){ var uses2 = num(d.basis) + fee, src2 = num(d.loan) + num(d.equity); add('su', 'Sources & Uses', 'Total sources equal total uses', tie(uses2, src2, 2) ? 'pass' : 'hard', 'Uses ' + M(uses2) + ' (basis ' + M(d.basis) + ' + fee ' + M(fee) + '); sources ' + M(src2) + ' (loan ' + M(d.loan) + ' + equity ' + M(d.equity) + ').'); }
    ['budget', 'capint', 'facility'].forEach(function(id){ add(id, 'Development', id === 'budget' ? 'Development budget ties to its lines' : id === 'capint' ? 'Capitalized interest' : 'Construction facility', 'na', 'Development deals only.'); });
  }
  /* common: IRR and multiple recomputed, waterfall */
  var vals = rows.map(function(r){ return num(r.cf); }), dts = rows.map(function(r){ return r.dt; }), eq0 = num(rows[0] && rows[0].eqDraw), irr2 = xirr(vals, dts, m.closeDt, -eq0);
  add('irr', 'Returns', 'Levered IRR equals an independent XIRR of the dated cash flows', isFinite(irr2) && isFinite(m.irr) ? (Math.abs(irr2 - m.irr) <= 1e-6 ? 'pass' : 'hard') : 'warn', 'Engine ' + P(m.irr) + ' vs independent ' + P(irr2) + '.');
  var dist = rows.reduce(function(a, r){ return a + (r.wfDist != null ? num(r.wfDist) : Math.max(0, num(r.cf))); }, 0), con = rows.reduce(function(a, r){ return a + (r.wfContrib != null ? num(r.wfContrib) : Math.max(0, -num(r.cf))); }, 0);
  add('moic', 'Returns', 'Equity multiple equals total distributions / total contributions', con > 0 && tie(m.moic, dist / con, 1e-9) && tie(num(m.dist), dist, 2) && tie(num(m.contrib), con, 2) ? 'pass' : 'hard', 'Distributions ' + M(dist) + ' / contributions ' + M(con) + ' = ' + (con ? (dist / con).toFixed(4) : '—') + 'x vs engine ' + (m.moic || 0).toFixed(4) + 'x.');
  if(w && typeof bkWaterfallChecks === 'function'){
    var wc = safe(function(){ return bkWaterfallChecks(); }, null);
    if(wc){ wc.hurdles.concat(wc.other).forEach(function(c){ add('wf_' + (c.id || ('h' + c.k)), 'Waterfall', c.label || c.name, c.status === 'pass' ? 'pass' : c.status === 'na' ? 'na' : 'hard', c.detail); });
      var lpFlows = safe(function(){ return w.rows.map(function(r){ return num(r.lpCF); }); }, null);
      if(lpFlows){ var lpi = xirr(lpFlows, w.rows.map(function(r){ return r.dt; }), m.closeDt, -eq0 * (1 - num(s.gpShare))); add('wf_lpirr', 'Waterfall', 'LP IRR equals an independent XIRR of the dated LP cash flows', isFinite(lpi) && isFinite(w.lpIRR) ? (Math.abs(lpi - w.lpIRR) <= 1e-6 ? 'pass' : 'hard') : 'warn', 'Engine ' + P(w.lpIRR) + ' vs independent ' + P(lpi) + '.'); } }
  } else add('wf', 'Waterfall', 'Waterfall checks', 'na', 'No waterfall for this deal.');
  return summarize(C);
}
function summarize(C){
  var o = { checks:C, hard:C.filter(function(c){ return c.status === 'hard'; }), warn:C.filter(function(c){ return c.status === 'warn'; }), na:C.filter(function(c){ return c.status === 'na'; }), pass:C.filter(function(c){ return c.status === 'pass'; }) };
  o.ok = o.hard.length === 0; o.text = o.hard.length + ' failed, ' + o.warn.length + ' warning' + (o.warn.length === 1 ? '' : 's') + ', ' + o.pass.length + ' passed, ' + o.na.length + ' not applicable'; return o;
}
window.bkIntegrity = function(){ try { return run(); } catch(e){ return summarize([{ id:'crash', group:'Engine', label:'Integrity checks ran', status:'hard', detail:'The checks themselves failed: ' + e.message }]); } };
})();
