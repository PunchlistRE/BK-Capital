
/* ===========================================================================
   V29.13.0 - CREDIT POLICY, DEBT CAPACITY AND THE IC DEAL GATE
   ===========================================================================
   Ported from the Capital Markets model (CMM v3): the decision layer that sits
   on top of the underwriting engines. Nothing here changes a return or a loan;
   it TESTS the deal the engines already produced against house credit policy.

   * bkPolicy()          house thresholds, per deal (s._policy), CMM defaults.
   * bkDebtCapacity()    the largest senior loan the property supports under
                         each constraint - LTV, LTC, DSCR at the coupon, DSCR at
                         a STRESSED coupon, interest-only DSCR, debt yield on
                         underwriting and stabilised NOI - the binding one,
                         headroom to the next, overage versus the loan the
                         engine sized, a leverage ladder, and the highest coupon
                         at which DSCR still holds the minimum.
   * bkRiskCushions()    break-even economic occupancy, NOI decline tolerance to
                         minimum DSCR, break-even rent, exit-cap cushion to the
                         target IRR, upside / downside IRR. Each break-even is a
                         bisection against the REAL engine (bkRunWith), not a
                         linear approximation.
   * bkDealGate()        15-gate-style policy table: direction, HARD / SOFT
                         severity, weight; weighted score; exception counts;
                         verdict (APPROVE / CONDITIONAL / DECLINE); ranked
                         exceptions; recommended action; credit-override
                         governance (needs YES + reason + approver).

   Acquisition deals get the full set. Development deals are gated on the tests
   that apply to them (returns, LP returns, construction leverage); the rest are
   reported as not applicable rather than forced onto a different methodology.
   Not ported (needs modules the app lacks): lender eligibility screening,
   capital-stack structures, refinance timing, fund and portfolio impact.
   =========================================================================== */
(function(){
'use strict';
if(typeof bkLoad !== 'function' || typeof bkDebt !== 'function' || typeof bkAnnualCF !== 'function') return;

var POLICY_DEFAULTS = {
  targetIRR:0.12, targetEM:2.25, targetLpIRR:0.12, targetLpEM:2.0, minDSCR:1.25, minDebtYield:0.085, maxLTV:0.65, maxLTC:0.70,
  stressBps:150, minGoingInCap:0.05, minDevSpreadBps:150, maxBreakEvenOcc:0.75, minNOITolerance:0.15, minRentCushion:0.10,
  maxHighRisks:2, maxDebtOverage:0, advanceScore:0.85, conditionalScore:0.65, exitCapStressBps:75
};
/* id, label, how the value is read, threshold key, direction, severity, weight. Weights sum to 100%. */
var GATES = [
  ['grossIRR',  'Gross levered IRR (property)',               'targetIRR',      '>=', 'HARD', 0.00, 'pct'],
  ['lpIRR',     'Net LP IRR (after promote)',                  'targetLpIRR',    '>=', 'HARD', 0.18, 'pct'],
  ['lpEM',      'Net LP equity multiple',                      'targetLpEM',     '>=', 'SOFT', 0.08, 'x'],
  ['dscr',      'Year-1 DSCR (senior)',                        'minDSCR',        '>=', 'HARD', 0.12, 'x'],
  ['debtYield', 'Year-1 debt yield (senior)',                  'minDebtYield',   '>=', 'HARD', 0.08, 'pct'],
  ['ltv',       'Senior LTV',                                  'maxLTV',         '<=', 'HARD', 0.04, 'pct'],
  ['capacity',  'Requested debt vs. house capacity',           'capacity',       '<=', 'HARD', 0.16, 'usd'],
  ['goingIn',   'Going-in cap rate (Year-1 NOI / price)',      'minGoingInCap',  '>=', 'SOFT', 0.10, 'pct'],
  ['beOcc',     'Break-even economic occupancy',               'maxBreakEvenOcc','<=', 'SOFT', 0.08, 'pct'],
  ['exitCush',  'Exit cap cushion to target IRR (bps)',        'zero',           '>=', 'SOFT', 0.04, 'bps'],
  ['noiTol',    'Stabilized NOI decline tolerance',            'minNOITolerance','>=', 'SOFT', 0.08, 'pct'],
  ['rentCush',  'Rent cushion vs. break-even',                 'minRentCushion', '>=', 'SOFT', 0.04, 'pct'],
  ['risks',     'High or critical risks',                      'maxHighRisks',   '<=', 'SOFT', 0.00, 'n'],
  ['devSpread', 'Development spread (bps, development only)',  'minDevSpreadBps','>=', 'HARD', 0.00, 'bps']
];

/* ------------------------------------------------------------------ state */
function raw(){ var s = bkLoad(); return (s && s._policy) || {}; }
function policy(){
  var r = raw(), out = Object.assign({}, POLICY_DEFAULTS);
  Object.keys(POLICY_DEFAULTS).forEach(function(k){ if(r[k] !== undefined && r[k] !== null && r[k] !== '' && isFinite(Number(r[k]))) out[k] = Number(r[k]); });
  return out;
}
function gateCfg(id){
  var g = GATES.filter(function(x){ return x[0] === id; })[0], o = (raw().gates || {})[id] || {};
  return { weight: (o.weight !== undefined && isFinite(Number(o.weight))) ? Number(o.weight) : g[5], severity: (o.severity === 'HARD' || o.severity === 'SOFT') ? o.severity : g[4] };
}
function ic(){ var s = bkLoad(); return (s && s._ic) || {}; }
function commit(mut){
  var s = bkLoad(); if(!s) return false;
  mut(s); bkSave(s); return true;
}
window.bkPolicy = policy;
/* Re-render AFTER the event finishes: replacing an input from inside its own change/blur handler throws a DOM error. */
function later(name){ setTimeout(function(){ if(typeof showSheet === 'function') showSheet(name); }, 0); }
window.bkPolicySet = function(k, v){ commit(function(s){ s._policy = s._policy || {}; s._policy[k] = Number(v); }); later('Credit Policy'); };
window.bkPolicyGate = function(id, field, v){ commit(function(s){ s._policy = s._policy || {}; s._policy.gates = s._policy.gates || {}; s._policy.gates[id] = s._policy.gates[id] || {}; s._policy.gates[id][field] = field === 'weight' ? Number(v) : String(v); }); later('Credit Policy'); };
window.bkPolicyReset = function(){ commit(function(s){ delete s._policy; }); later('Credit Policy'); };
window.bkICSet = function(path, v){
  commit(function(s){
    s._ic = s._ic || {}; var p = path.split('.'), o = s._ic;
    for(var i = 0; i < p.length - 1; i++){ var k = /^\d+$/.test(p[i + 1]) ? [] : {}; o[p[i]] = o[p[i]] || k; o = o[p[i]]; }
    o[p[p.length - 1]] = v;
  });
  later('IC Memo');
};

/* ------------------------------------------- run the engine with overrides */
/* Same technique as bkRunScenario: bkLoad / bkSave are swapped for a scratch copy so nothing touches the saved deal. */
window.bkRunWith = function(overrides, fn){
  var real = bkLoad(), scratch = Object.assign({}, real, overrides), L = window.bkLoad, S = window.bkSave;
  window.bkLoad = function(){ return scratch; }; window.bkSave = function(d){ Object.assign(scratch, d); };
  try { return fn(); } finally { window.bkLoad = L; window.bkSave = S; }
};
function bisect(f, lo, hi, target, increasing){
  var flo = f(lo) - target, fhi = f(hi) - target;
  if(!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
  for(var i = 0; i < 80; i++){ var m = (lo + hi) / 2, fm = f(m) - target; if(!isFinite(fm)) return null; if(flo * fm <= 0){ hi = m; fhi = fm; } else { lo = m; flo = fm; } }
  return (lo + hi) / 2;
}
function isDev(s){ return /develop/i.test(String(s.dealType || '')); }

/* -------------------------------------------------------------- debt capacity */
function pvAnnuity(rate, years, annualPayment){ var i = rate / 12, n = years * 12; return i > 0 ? annualPayment / 12 * (1 - Math.pow(1 + i, -n)) / i : annualPayment * years; }
function annualDS(rate, years, loan){ return loan > 0 ? bkPmt(rate / 12, Math.round(years * 12), 1) * loan * 12 : 0; }
function debtCapacity(){
  var s = bkLoad(), p = policy(), u = bkAnnualCF(), d = bkDebt();
  if(isDev(s) || !(d.loan > 0)) return null;
  var noi = u.arr[0].after, stab = (u.arr[Math.min(2, u.arr.length - 1)] || u.arr[0]).after;
  var coupon = d.coupon, years = Number(s.acqAmort) || 30, stressed = coupon + p.stressBps / 10000;
  var value = d.ltvValue, cost = d.basis, req = d.loan;
  var rows = [
    ['Loan-to-value',                         'Value x maximum LTV',                     value * p.maxLTV],
    ['Loan-to-cost',                          'Cost basis x maximum LTC',                cost * p.maxLTC],
    ['DSCR, actual rate, amortizing',         'NOI / minimum DSCR, capitalised',         pvAnnuity(coupon, years, noi / p.minDSCR)],
    ['DSCR, stressed rate, amortizing',       'NOI / minimum DSCR at coupon + stress',   pvAnnuity(stressed, years, noi / p.minDSCR)],
    ['DSCR, interest-only, actual rate',      'NOI / minimum DSCR / coupon',             coupon > 0 ? noi / p.minDSCR / coupon : Infinity],
    ['Debt yield, underwriting NOI',          'NOI / minimum debt yield',                noi / p.minDebtYield],
    ['Debt yield, stabilised NOI',            'Year-3 NOI / minimum debt yield',         stab / p.minDebtYield]
  ].map(function(r){ return { name:r[0], basis:r[1], max:r[2], ltv:value > 0 ? r[2] / value : 0, vsRequest:r[2] - req }; });
  var min = Math.min.apply(null, rows.map(function(r){ return r.max; }));
  var binding = rows.filter(function(r){ return r.max === min; })[0];
  var next = Math.min.apply(null, rows.filter(function(r){ return r !== binding; }).map(function(r){ return r.max; }));
  var dsReq = annualDS(coupon, years, req);
  var ladder = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8].map(function(l){
    var loan = value * l, ds = annualDS(coupon, years, loan);
    return { ltv:l, loan:loan, ltc:cost > 0 ? loan / cost : 0, ds:ds, dscr:ds > 0 ? noi / ds : Infinity, stabDscr:ds > 0 ? stab / ds : Infinity };
  });
  var maxCoupon = bisect(function(r){ var ds = annualDS(r, years, req); return ds > 0 ? noi / ds : 1e9; }, 0.0001, 0.40, p.minDSCR);
  var actualDS = (d.annual[0] || {}).payment || dsReq;
  return { policy:p, noi:noi, stabNoi:stab, coupon:coupon, stressedRate:stressed, years:years, value:value, cost:cost, requested:req,
    rows:rows, binding:binding, capacity:min, headroom:next - min, overage:req - min,
    box:{ ltv:req / value, ltc:req / cost, dscr:actualDS > 0 ? noi / actualDS : Infinity, debtYield:noi / req,
          stressedDscr:annualDS(stressed, years, req) > 0 ? noi / annualDS(stressed, years, req) : Infinity, actualDS:actualDS },
    ladder:ladder, maxCoupon:maxCoupon, couponCushionBps:maxCoupon == null ? null : (maxCoupon - coupon) * 10000 };
}
window.bkDebtCapacity = debtCapacity;

/* ------------------------------------------------------------- risk cushions */
function riskCushions(){
  var s = bkLoad(), p = policy();
  if(isDev(s)) return null;
  var u = bkAnnualCF(), d = bkDebt(); if(!(d.loan > 0)) return null;
  var noi1 = u.arr[0].after, ds1 = (d.annual[0] || {}).payment, ds3 = (d.annual[Math.min(2, u.arr.length - 1)] || {}).payment;
  var out = { y1NOI:noi1, ds1:ds1 };
  var irrAt = function(cap){ return bkRunWith({ exitCap:cap }, function(){ return bkMonthlyReturns().irr; }); };
  var baseCap = Number(s.exitCap), baseIRR = bkMonthlyReturns().irr;
  /* Scan a grid of exit caps for the one where IRR crosses the target (the IRR solver can fail at the extremes, so a two-point bracket is not safe),
     then bisect inside that cell. If the target is never crossed, the cushion is reported as a bound. */
  var lo = Math.max(0.01, baseCap - 0.03), hi = baseCap + 0.06, N = 36, pts = [];
  for(var gi = 0; gi <= N; gi++){ var cx = lo + (hi - lo) * gi / N, iv = irrAt(cx); if(isFinite(iv)) pts.push([cx, iv]); }
  var be = null;
  for(var gj = 0; gj < pts.length - 1 && be == null; gj++){
    if((pts[gj][1] - p.targetIRR) * (pts[gj + 1][1] - p.targetIRR) <= 0) be = bisect(irrAt, pts[gj][0], pts[gj + 1][0], p.targetIRR);
  }
  out.exitCapBreakeven = be; out.exitCapCushionBps = be == null ? null : (be - baseCap) * 10000; out.exitCapBound = null;
  if(be == null && pts.length){
    if(pts.every(function(q){ return q[1] < p.targetIRR; })){ out.exitCapCushionBps = (pts[0][0] - baseCap) * 10000; out.exitCapBound = 'at most'; }
    else if(pts.every(function(q){ return q[1] > p.targetIRR; })){ out.exitCapCushionBps = (pts[pts.length - 1][0] - baseCap) * 10000; out.exitCapBound = 'at least'; }
  }
  var dn = baseCap + p.exitCapStressBps / 10000, up = Math.max(0.01, baseCap - p.exitCapStressBps / 10000);
  out.irrBase = baseIRR; out.irrDownside = irrAt(dn); out.irrUpside = irrAt(up); out.stressBps = p.exitCapStressBps;
  var noiAtVac = function(v){ return bkRunWith({ vacancy:v }, function(){ return bkAnnualCF().arr[0].after; }); };
  var beVac = bisect(noiAtVac, 0, 0.95, ds1);                          /* NOI = debt service, loan held fixed */
  out.breakEvenOccupancy = beVac == null ? null : 1 - beVac;
  out.occupancyCushionBps = beVac == null ? null : (Number(s.vacancy) - beVac) * 10000;
  out.noiTolerance1 = noi1 > 0 ? (noi1 - p.minDSCR * ds1) / noi1 : 0;
  var noi3 = (u.arr[Math.min(2, u.arr.length - 1)] || u.arr[0]).after;
  out.noiTolerance3 = noi3 > 0 ? (noi3 - p.minDSCR * ds3) / noi3 : 0;
  var noiAtRent = function(r){ return bkRunWith({ avgRent:r }, function(){ return bkAnnualCF().arr[0].after; }); };
  var rent0 = Number(s.avgRent), responsive = Math.abs(noiAtRent(rent0 * 1.01) - noiAtRent(rent0)) > 1e-6;
  var beRent = responsive ? bisect(noiAtRent, rent0 * 0.2, rent0 * 1.5, p.minDSCR * ds1) : null;
  out.breakEvenRent = beRent; out.rentCushion = beRent ? rent0 / beRent - 1 : null;
  return out;
}
window.bkRiskCushions = riskCushions;

/* ----------------------------------------------------------------- risk register */
function sevOf(score){ return score >= 20 ? 'Critical' : score >= 12 ? 'High' : score >= 6 ? 'Moderate' : 'Low'; }
function riskRegister(){
  var r = (ic().risks || []).filter(function(x){ return x && (x.risk || '').trim(); }).map(function(x){
    var sc = (Number(x.prob) || 0) * (Number(x.impact) || 0); return Object.assign({}, x, { score:sc, severity:sevOf(sc) }); });
  return { rows:r, high:r.filter(function(x){ return x.severity === 'High' || x.severity === 'Critical'; }).length };
}
window.bkRiskRegister = riskRegister;

/* ------------------------------------------------------------------ the gate */
function fmtVal(v, t){
  if(v == null || !isFinite(v)) return 'n/a';
  return t === 'pct' ? (v * 100).toFixed(2) + '%' : t === 'x' ? v.toFixed(2) + 'x' : t === 'usd' ? '$' + (v / 1e6).toFixed(2) + 'M' : t === 'bps' ? v.toFixed(0) + ' bps' : String(Math.round(v));
}
function dealGate(){
  var s = bkLoad(), p = policy(), dev = isDev(s), cap = null, rc = null, d = null, rr = riskRegister();
  var ret = bkMonthlyReturns(), w = null; try { w = bkWaterfallV07(); } catch(e){}
  if(!dev){ cap = debtCapacity(); rc = riskCushions(); }
  d = bkDebt();
  var ov = ic().override || {}, overrideValid = ov.on === 'YES' && String(ov.reason || '').trim() !== '' && String(ov.approvedBy || '').trim() !== '';
  var val = {}, thr = {}, na = {};
  val.grossIRR = ret.irr; val.lpIRR = w ? w.lpIRR : null; val.lpEM = (w && w.lp && w.lp.contrib > 0) ? w.lp.dist / w.lp.contrib : null;
  thr.grossIRR = p.targetIRR; thr.lpIRR = p.targetLpIRR; thr.lpEM = p.targetLpEM;
  if(dev){
    var f = bkDevFundingV10(), cost = f.levered || 0;
    val.ltv = null; val.dscr = null; val.debtYield = null; val.capacity = null; val.goingIn = null; val.beOcc = null; val.exitCush = null; val.noiTol = null; val.rentCush = null;
    ['dscr','debtYield','ltv','capacity','goingIn','beOcc','exitCush','noiTol','rentCush'].forEach(function(k){ na[k] = 'acquisition deals only'; });
    var yoc = cost > 0 ? (bkDevTakeoutV11().noi / cost) : null;
    val.devSpread = yoc == null ? null : (yoc - Number(s.exitCap)) * 10000;
  } else {
    val.dscr = cap ? cap.box.dscr : null; val.debtYield = cap ? cap.box.debtYield : null; val.ltv = cap ? cap.box.ltv : null;
    val.capacity = cap ? cap.requested : null; thr.capacity = cap ? cap.capacity + p.maxDebtOverage + (overrideValid ? 9e99 : 0) : null;
    val.goingIn = Number(s.purchasePrice) > 0 ? bkAnnualCF().arr[0].after / Number(s.purchasePrice) : null;
    val.beOcc = rc ? rc.breakEvenOccupancy : null; val.exitCush = rc ? rc.exitCapCushionBps : null;
    val.noiTol = rc ? rc.noiTolerance3 : null; val.rentCush = rc ? rc.rentCushion : null;
    na.devSpread = 'development deals only';
  }
  val.risks = rr.high; thr.risks = p.maxHighRisks;
  thr.dscr = p.minDSCR; thr.debtYield = p.minDebtYield; thr.ltv = p.maxLTV; thr.goingIn = p.minGoingInCap; thr.beOcc = p.maxBreakEvenOcc;
  thr.exitCush = 0; thr.noiTol = p.minNOITolerance; thr.rentCush = p.minRentCushion; thr.devSpread = p.minDevSpreadBps;
  var rows = GATES.map(function(g){
    var id = g[0], c = gateCfg(id), v = val[id], t = thr[id], applicable = !na[id] && v != null && isFinite(v) && t != null;
    var pass = applicable ? (g[3] === '>=' ? v >= t - 1e-12 : v <= t + 1e-12) : null;
    return { id:id, label:g[1], type:g[6], value:v, threshold:t, dir:g[3], severity:c.severity, weight:c.weight, applicable:applicable, pass:pass,
             result:!applicable ? 'N/A' : pass ? 'PASS' : 'FAIL', note:na[id] || (v == null ? 'not available' : '') };
  });
  var live = rows.filter(function(r){ return r.applicable; });
  var wTotal = rows.reduce(function(a, r){ return a + r.weight; }, 0);
  var wLive = live.reduce(function(a, r){ return a + r.weight; }, 0);
  /* Weights of gates that do not apply (e.g. the debt gates on a development deal) are dropped and the rest re-based, so the score stays 0-100%. */
  var score = wLive > 0 ? live.reduce(function(a, r){ return a + (r.pass ? r.weight : 0); }, 0) / wLive : 0;
  var hard = live.filter(function(r){ return !r.pass && r.severity === 'HARD'; }).length, soft = live.filter(function(r){ return !r.pass && r.severity === 'SOFT'; }).length;
  var overage = cap ? cap.overage : 0;
  var verdict;
  if(!overrideValid && overage > p.maxDebtOverage) verdict = 'DECLINE';
  else if(hard === 0 && score >= p.advanceScore) verdict = 'APPROVE';
  else if(score >= p.conditionalScore || (hard === 0 && soft <= 2)) verdict = 'CONDITIONAL';
  else verdict = 'DECLINE';
  var exceptions = live.filter(function(r){ return !r.pass; }).sort(function(a, b){ return (a.severity === b.severity ? 0 : a.severity === 'HARD' ? -1 : 1) || (b.weight - a.weight); }).map(function(r){
    var gap = r.dir === '>=' ? r.threshold - r.value : r.value - r.threshold, msg;
    if(r.id === 'capacity') msg = 'Debt: ' + fmtVal(r.value - r.threshold, 'usd') + ' above capacity (' + fmtVal(r.value, 'usd') + ' vs ' + fmtVal(cap.capacity, 'usd') + ')';
    else if(r.type === 'pct') msg = r.label.replace(/ \(.*/, '') + ': ' + (Math.abs(gap) * 10000).toFixed(0) + ' bps ' + (r.dir === '>=' ? 'below' : 'above') + ' policy (' + fmtVal(r.value, 'pct') + ' vs ' + fmtVal(r.threshold, 'pct') + ')';
    else msg = r.label.replace(/ \(.*/, '') + ': ' + fmtVal(r.value, r.type) + ' vs ' + fmtVal(r.threshold, r.type) + ' required';
    return { severity:r.severity, id:r.id, message:msg };
  });
  var action = verdict === 'APPROVE' ? 'Proceed to close on the selected structure; satisfy the conditions precedent.'
    : (overage > p.maxDebtOverage && !overrideValid) ? 'Resize senior debt to <= ' + fmtVal(cap.capacity, 'usd') + ', renegotiate price / economics, or record a documented credit override.'
    : hard > 0 ? 'Resolve the hard exceptions before returning to committee.' : 'Resolve or accept the soft exceptions; conditional approval is available at the committee’s discretion.';
  var status = verdict + ' — ' + (hard + soft === 0 ? 'NO MATERIAL EXCEPTIONS' : hard + ' HARD / ' + soft + ' SOFT EXCEPTION' + (hard + soft > 1 ? 'S' : ''));
  return { policy:p, rows:rows, score:score, weightTotal:wTotal, weightsOk:Math.abs(wTotal - 1) < 1e-9, passed:live.filter(function(r){ return r.pass; }).length, applicable:live.length,
    hard:hard, soft:soft, overage:overage, overrideValid:overrideValid, override:ov, verdict:verdict, status:status, action:action, exceptions:exceptions,
    capacity:cap, cushions:rc, ret:ret, waterfall:w, register:rr, development:dev };
}
/* The gate re-runs the engine dozens of times (capacity ladder, cushions), about half a second. It is a pure function of the deal, so the last few results are kept by the deal's own contents. */
var gateMemo = [];
window.bkDealGatePeek = function(){ var key; try { key = JSON.stringify(bkLoad()); } catch(e){ return null; } for(var i = 0; i < gateMemo.length; i++) if(gateMemo[i][0] === key) return gateMemo[i][1]; return null; };
window.bkDealGate = function(){
  var key; try { key = JSON.stringify(bkLoad()); } catch(e){ return dealGate(); }
  for(var i = 0; i < gateMemo.length; i++) if(gateMemo[i][0] === key) return gateMemo[i][1];
  var v = dealGate(); gateMemo.unshift([key, v]); if(gateMemo.length > 4) gateMemo.length = 4; return v;
};
window.BK_GATES = GATES; window.BK_POLICY_DEFAULTS = POLICY_DEFAULTS;
})();
