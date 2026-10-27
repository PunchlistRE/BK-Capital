/* ===========================================================================
   WATERFALL VERIFICATION. For every hurdle the waterfall is re-tested from the engine's own distribution rows: does what the partners actually received
   satisfy the hurdle math? Nothing here changes a distribution; it reads bkWaterfallV07() and says whether its output is consistent with the deal's terms.
   IRR basis, per hurdle: the hurdle account is replayed from the contributions and the amounts applied against it (accrued balance less the ending balance),
   and the IRR of those dated flows is compared with the hurdle rate. A hurdle that was reached must come out at its rate; one that was not reached must come
   out below it with a balance left. Equity-multiple basis, per hurdle: the LP's multiple against the hurdle multiple, in the same two cases.
   Also checked: no distribution reaches a tier before the tiers below it were cleared, distributions and contributions are conserved, and the promote is
   the GP's distributions in excess of its pro-rata share.
   =========================================================================== */
(function(){
'use strict';
if(typeof bkLoad !== 'function' || typeof window.bkWaterfallV07 !== 'function' || typeof RENDERERS === 'undefined') return;
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function num(x){ var v = Number(x); return isFinite(v) ? v : NaN; }
function M(v){ return !isFinite(v) ? '—' : (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US'); }
function P2(v){ return !isFinite(v) ? '—' : (v * 100).toFixed(2) + '%'; }
var TOL_IRR = 0.0005, TOL_USD = 1;          /* the IRR is dated (actual days / 365) while the accounts accrue monthly: 5 bps; money to the dollar */

function run(opts){
  var w = (opts && opts.w) || window.bkWaterfallV07(), s = w.s, rows = w.rows, x = w.x, n = rows.length, gs = num(s.gpShare) || 0, lpS = 1 - gs;
  var em = String(s.hurdleBasis) === '2', both = String(s.hurdleBasis) === '3', rule = String(s.hurdleBoth) === 'either' ? 'either' : 'all', lpMode = both ? true : safe(function(){ return bkConventions(s).cvHurdleBasis === 'lp'; }, true);
  var out = { basis:em ? 'EM' : both ? 'BOTH' : 'IRR', rule:rule, lpMode:lpMode, hurdles:[], other:[], rows:n };
  var last = rows[n - 1] || {}, bal = function(k){ return num(last['b' + k]) || 0; };
  var eq0 = num(x.rows[0] && x.rows[0].eqDraw) || 0, closeDt = x.closeDt, dates = rows.map(function(r){ return r.dt; });
  var rates = [num(s.pref), num(s.hurdle2), num(s.hurdle3)], ems = [num(s.em1), num(s.em2), num(s.em3)];
  var xirr = function(v, closeAmt){ return typeof bkXirrClose === 'function' ? bkXirrClose(v, dates, closeDt, closeAmt) : (typeof bkXirr === 'function' ? bkXirr(v, dates) : NaN); };
  for(var k = 1; k <= 3; k++){
    var h = { k:k, name:k === 1 ? 'Tier 1 · preferred return' : 'Tier ' + k + ' hurdle', balance:bal(k) }, cleared = h.balance <= TOL_USD;
    if(both){
      var rt = rates[k - 1], hm2 = ems[k - 1], mr2 = Math.pow(1 + rt, 1 / 12) - 1, b2 = 0, fl = [], ap2 = 0, lpC = w.lp ? w.lp.contrib : NaN, cum = rows.reduce(function(t, r){ return t + r.lpDist; }, 0);
      for(var i2 = 0; i2 < n; i2++){ var q = rows[i2], inf = -q.lpCon, a2 = (b2 + inf) * (1 + mr2), ib = num(q['ib' + k]) || 0, ap = a2 - ib; fl.push(-inf + ap); ap2 += ap; b2 = ib; }
      var irr2 = xirr(fl, -eq0 * lpS), mult = lpC > 0 ? cum / lpC : NaN, irrSat = (num(last['ib' + k]) || 0) <= TOL_USD, emSat = !(hm2 > 0) || (isFinite(mult) && mult >= hm2 - 1e-6), reachedRule = rule === 'all' ? irrSat && emSat : irrSat || emSat;
      var irrOk = irrSat ? (isFinite(irr2) && Math.abs(irr2 - rt) <= TOL_IRR) : (!isFinite(irr2) ? ap2 <= TOL_USD : irr2 < rt + 1e-9), emOk = true;
      Object.assign(h, { name:'Tier ' + k + (k === 1 ? ' · first hurdle' : ' hurdle'), rate:rt, em:hm2, target:rt, measured:irr2, multiple:mult, unit:'both', cleared:cleared, irrMet:irrSat, emMet:emSat });
      h.status = irrOk && cleared === reachedRule ? 'pass' : 'fail';
      h.detail = 'IRR test ' + (irrSat ? 'met' : 'not met') + ' (replayed ' + P2(irr2) + ' vs ' + P2(rt) + '); multiple test ' + (emSat ? 'met' : 'not met') + ' (LP ' + (isFinite(mult) ? mult.toFixed(3) : '—') + 'x vs ' + hm2.toFixed(2) + 'x). ' + (rule === 'all' ? 'Both are required' : 'Either is enough') + ', so the tier is ' + (reachedRule ? 'reached' : 'open') + '; the waterfall shows it ' + (cleared ? 'reached' : 'open (' + M(h.balance) + ' still owed)') + (h.status === 'pass' ? '.' : ': they disagree.');
    } else if(!em){
      var rate = rates[k - 1], mr = Math.pow(1 + rate, 1 / 12) - 1, b = 0, flows = [], applied = 0, contrib = 0;
      for(var i = 0; i < n; i++){ var r = rows[i], inflow = lpMode ? (-r.lpCon) : r.con, a = (b + inflow) * (1 + mr), bk = num(r['b' + k]) || 0, ap = a - bk; flows.push(-inflow + ap); applied += ap; contrib += inflow; b = bk; }
      var irr = xirr(flows, -eq0 * (lpMode ? lpS : 1));
      Object.assign(h, { rate:rate, measured:irr, target:rate, unit:'irr', applied:applied, contributed:contrib, cleared:cleared });
      if(!isFinite(rate) || rate <= 0){ h.status = 'na'; h.detail = 'This hurdle has no rate.'; }
      else if(cleared){ var d = irr - rate; h.status = isFinite(irr) && Math.abs(d) <= TOL_IRR ? 'pass' : 'fail'; h.detail = h.status === 'pass' ? 'Reached: the replayed IRR is ' + P2(irr) + ', ' + (Math.abs(d) * 10000).toFixed(1) + ' bps from the ' + P2(rate) + ' hurdle.' : 'The account is cleared but the replayed IRR is ' + P2(irr) + ', not ' + P2(rate) + '.'; }
      else if(!isFinite(irr)){ h.status = applied > TOL_USD ? 'fail' : 'pass'; h.detail = applied > TOL_USD ? 'A balance remains and the IRR cannot be solved.' : 'Not reached: nothing was distributed against this hurdle; ' + M(h.balance) + ' is still owed.'; }
      else { h.status = irr < rate + 1e-9 ? 'pass' : 'fail'; h.detail = h.status === 'pass' ? 'Not reached: the replayed IRR is ' + P2(irr) + ', below the ' + P2(rate) + ' hurdle, with ' + M(h.balance) + ' still owed.' : 'A balance of ' + M(h.balance) + ' remains although the replayed IRR (' + P2(irr) + ') is above the hurdle.'; }
    } else {
      var hm = ems[k - 1], lpCon = w.lp ? w.lp.contrib : NaN, cumLP = rows.reduce(function(t, r){ return t + r.lpDist; }, 0);
      Object.assign(h, { name:k === 1 ? 'Tier 1 · multiple' : 'Tier ' + k + ' multiple', rate:hm, target:hm, measured:lpCon > 0 ? cumLP / lpCon : NaN, unit:'x', cleared:cleared });
      if(!(hm > 0)){ h.status = 'na'; h.detail = 'This hurdle has no multiple.'; }
      else if(cleared){ h.status = h.measured >= hm - 1e-6 ? 'pass' : 'fail'; h.detail = h.status === 'pass' ? 'Reached: the LP multiple is ' + h.measured.toFixed(3) + 'x against the ' + hm.toFixed(2) + 'x hurdle.' : 'The account is cleared but the LP multiple is ' + h.measured.toFixed(3) + 'x, below ' + hm.toFixed(2) + 'x.'; }
      else { h.status = h.measured < hm + 1e-9 ? 'pass' : 'fail'; h.detail = h.status === 'pass' ? 'Not reached: the LP multiple is ' + (isFinite(h.measured) ? h.measured.toFixed(3) : '—') + 'x, below the ' + hm.toFixed(2) + 'x hurdle, with ' + M(h.balance) + ' still owed.' : 'A balance remains although the LP multiple is above the hurdle.'; }
    }
    out.hurdles.push(h);
  }
  /* sequencing: a tier receives cash only after the tiers below it are cleared */
  var seqBad = [], eps = TOL_USD;
  rows.forEach(function(r){ var b1 = num(r.b1) || 0, b2 = num(r.b2) || 0, b3 = num(r.b3) || 0;
    if(r.t2 > eps && b1 > eps) seqBad.push('month ' + r.m + ': Tier 2 paid while Tier 1 owed ' + M(b1));
    if(r.t3 > eps && (b1 > eps || b2 > eps)) seqBad.push('month ' + r.m + ': Tier 3 paid while a lower hurdle was open');
    if(r.t4 > eps && (b1 > eps || b2 > eps || b3 > eps)) seqBad.push('month ' + r.m + ': Tier 4 paid while a hurdle was open');
    if(r.catchup > eps && b1 > eps) seqBad.push('month ' + r.m + ': catch-up paid while Tier 1 owed ' + M(b1)); });
  out.other.push({ id:'seq', label:'Tiers are paid in order', status:seqBad.length ? 'fail' : 'pass', detail:seqBad.length ? seqBad.slice(0, 3).join('; ') + (seqBad.length > 3 ? ' (+' + (seqBad.length - 3) + ' more)' : '') : 'No tier received cash while a tier below it was still owed.' });
  /* conservation */
  var sum = function(f){ return rows.reduce(function(t, r){ return t + (num(f(r)) || 0); }, 0); };
  var dist = sum(function(r){ return r.dist; }), tiers = sum(function(r){ return r.t1 + r.catchup + r.t2 + r.t3 + r.t4; }), partner = sum(function(r){ return r.lpDist + r.gpDist; }), con = sum(function(r){ return r.con; }), pcon = -sum(function(r){ return r.lpCon + r.gpCon; });
  var eng = x.rows.reduce(function(t, r){ return t + (num(r.wfDist != null ? r.wfDist : Math.max(0, r.cf)) || 0); }, 0);
  var okC = Math.abs(dist - tiers) <= TOL_USD * Math.max(1, n / 12) && Math.abs(dist - partner) <= TOL_USD * Math.max(1, n / 12) && Math.abs(con - pcon) <= TOL_USD && Math.abs(dist - eng) <= TOL_USD * Math.max(1, n / 12);
  out.other.push({ id:'cons', label:'Every dollar is distributed once', status:okC ? 'pass' : 'fail', detail:'Distributable ' + M(dist) + '; paid through the tiers ' + M(tiers) + '; to LP and GP ' + M(partner) + '; the engine\'s own distributions ' + M(eng) + '. Contributions ' + M(con) + ' vs ' + M(pcon) + ' to the partners.' });
  /* promote */
  var gpDist = sum(function(r){ return r.gpDist; }), prorata = gs * sum(function(r){ return r.t1 + r.catchup + r.t2 + r.t3 + r.t4; }), promote = num(w.promote);
  var okP = promote >= -TOL_USD && Math.abs(promote - Math.max(0, gpDist - prorata)) <= TOL_USD * Math.max(1, n / 12) + 1 && (out.hurdles[0].cleared || promote <= TOL_USD);
  out.other.push({ id:'promote', label:'Promote is the GP\'s excess over its pro-rata share', status:okP ? 'pass' : 'fail', detail:'GP distributions ' + M(gpDist) + ' less its pro-rata share ' + M(prorata) + ' = ' + M(gpDist - prorata) + '; promote reported ' + M(promote) + '.' + (out.hurdles[0].cleared ? '' : ' Tier 1 was not cleared, so no promote is due.') });
  var sm = safe(function(){ return summary({ w:w }); }, null);
  if(sm) out.other.push({ id:'cats', label:'Distribution categories add to each partner\'s distributions', status:sm.ties && sm.rocWithin ? 'pass' : 'fail', detail:'LP ' + M(sm.lp.dist) + ' = capital ' + M(sm.lp.roc) + ' + ' + (sm.basis === 'EM' ? 'first-multiple return ' : 'preferred return ') + M(sm.lp.pref) + ' + excess ' + M(sm.lp.excess) + '; GP ' + M(sm.gp.dist) + ' = capital ' + M(sm.gp.roc) + ' + ' + (sm.basis === 'EM' ? 'first-multiple return ' : 'preferred return ') + M(sm.gp.pref) + ' + excess ' + M(sm.gp.excess) + ' + promote ' + M(sm.gp.promote) + '; capital returned never exceeds capital contributed.' });
  if(num(s.promoteSplit) === 1){ var po = sum(function(r){ return r.promoteOp; }), ps = sum(function(r){ return r.promoteSale; });
    out.other.push({ id:'split', label:'Operating and sale promotes add to the promote', status:Math.abs(po + ps - promote) <= TOL_USD + 1 ? 'pass' : 'fail', detail:'Operating-cash promote ' + M(po) + ' + sale / refinance promote ' + M(ps) + ' = ' + M(po + ps) + '; promote reported ' + M(promote) + '. The hurdle accounts are shared by both parts.' }); out.split = { op:po, sale:ps }; }
  /* sponsor fees: each is paid by the deal once and received by the sponsor once, at the same amount */
  var fe = safe(function(){ if(typeof bkSponsorV08 !== 'function' || String(s.dealType || '').toLowerCase() === 'development') return null; var sp = bkSponsorV08(), d = bkDebt(), price = num(s.purchasePrice) || 0, paidAcq = num(d.basis) - price * (1 + (num(s.closingCostsPct) || 0));
    var amPaid = x.rows.reduce(function(t, r){ return t + (num(r.assetFee) || 0); }, 0), dispPaid = x.rows.reduce(function(t, r){ return t + (num(r.dispoFee) || 0); }, 0);
    return { acq:[paidAcq, sp.acqFee], am:[amPaid, sp.totalAM], disp:[dispPaid, sp.totalDisp] }; }, null);
  if(fe){ var bad = []; [['acquisition', fe.acq], ['asset management', fe.am], ['disposition', fe.disp]].forEach(function(f){ if(Math.abs(f[1][0] - f[1][1]) > TOL_USD + 1) bad.push(f[0] + ': deal pays ' + M(f[1][0]) + ', sponsor receives ' + M(f[1][1])); });
    out.other.push({ id:'fees', label:'Sponsor fees: paid by the deal once, received once', status:bad.length ? 'fail' : 'pass', detail:bad.length ? bad.join('; ') : 'Acquisition ' + M(fe.acq[0]) + ' (in the uses), asset management ' + M(fe.am[0]) + ' (in the operating cash flow), disposition ' + M(fe.disp[0]) + ' (out of the sale proceeds): each equals what the sponsor receives on Sponsor CF, so none is counted twice or missed.' }); }
  out.pass = out.hurdles.concat(out.other).filter(function(c){ return c.status === 'pass'; }).length; out.fail = out.hurdles.concat(out.other).filter(function(c){ return c.status === 'fail'; }).length;
  out.ok = out.fail === 0; return out;
}
/* ---------------------------------------------------------------- partner distribution breakdown
   Each partner's distributions are classified as return of capital, preferred return, excess cash flow and promote. Tier-1 cash (the pari passu tier) is
   classified as preferred return up to the preference accrued and unpaid to that month, then return of capital (accrued preference is paid before capital);
   on the equity-multiple basis there is no accrual, so tier-1 cash returns capital first and the rest is the return to the first multiple. The GP's excess
   is its pro-rata share of everything beyond tier 1; the promote is the engine's own (GP distributions less its pro-rata share of all tiers). The four
   categories add to each partner's distributions, which are the engine's. */
function summary(opts){
  var w = (opts && opts.w) || window.bkWaterfallV07(), s = w.s, rows = w.rows, n = rows.length, gs = num(s.gpShare) || 0, lpS = 1 - gs;
  var em = String(s.hurdleBasis) === '2', lpMode = String(s.hurdleBasis) === '3' ? true : safe(function(){ return bkConventions(s).cvHurdleBasis === 'lp'; }, true), r1 = Math.pow(1 + (num(s.pref) || 0), 1 / 12) - 1;
  var P = 0, capLeft = 0, acc = { roc:0, pref:0 }, prevB = 0, lpT1 = 0;
  rows.forEach(function(r){
    var inflow = lpMode ? -r.lpCon : r.con, T1 = lpMode ? r.t1 * lpS : r.t1, rocM = 0, prefM = 0;
    capLeft += inflow;
    if(!em){ P += (prevB + inflow) * r1; prefM = Math.min(T1, Math.max(0, P)); P -= prefM; rocM = Math.min(T1 - prefM, Math.max(0, capLeft)); prefM = T1 - rocM; /* tier-1 cash beyond capital and the accrued preference (a multiple hurdle) is hurdle return too */ capLeft -= rocM; }
    else { rocM = Math.min(T1, Math.max(0, capLeft)); capLeft -= rocM; prefM = T1 - rocM; }
    prevB = num(r.ib1 != null ? r.ib1 : r.b1) || 0; acc.roc += rocM; acc.pref += prefM; lpT1 += lpMode ? T1 : T1 * lpS; });
  var scaleLP = lpMode ? 1 : lpS, scaleGP = lpMode ? gs / lpS : gs;
  var sum = function(f){ return rows.reduce(function(t, r){ return t + (num(f(r)) || 0); }, 0); };
  var lpC = -sum(function(r){ return r.lpCon; }), gpC = -sum(function(r){ return r.gpCon; }), lpD = sum(function(r){ return r.lpDist; }), gpD = sum(function(r){ return r.gpDist; });
  var gpT1 = lpMode ? (lpS > 0 ? lpT1 * gs / lpS : 0) : sum(function(r){ return r.t1; }) * gs;
  var lp = { contributed:lpC, roc:acc.roc * scaleLP, pref:acc.pref * scaleLP, promote:0, dist:lpD }, gp = { contributed:gpC, roc:acc.roc * scaleGP, pref:acc.pref * scaleGP, promote:sum(function(r){ return r.promote; }), dist:gpD };
  lp.excess = lpD - lp.roc - lp.pref; gp.excess = gpD - gp.roc - gp.pref - gp.promote;
  [lp, gp].forEach(function(q){ q.profit = q.dist - q.contributed; q.moic = q.contributed > 0 ? q.dist / q.contributed : NaN; });
  lp.irr = num(w.lpIRR); gp.irr = num(w.gpIRR);
  var tot = { contributed:lpC + gpC, roc:lp.roc + gp.roc, pref:lp.pref + gp.pref, excess:lp.excess + gp.excess, promote:gp.promote, dist:lpD + gpD };
  tot.profit = tot.dist - tot.contributed; tot.moic = tot.contributed > 0 ? tot.dist / tot.contributed : NaN;
  var share = (gpD > 0 && tot.dist > 0) ? gpD / tot.dist : NaN, ties = Math.abs(lp.roc + lp.pref + lp.excess - lpD) < 1 && Math.abs(gp.roc + gp.pref + gp.excess + gp.promote - gpD) < 1;
  return { basis:em ? 'EM' : String(s.hurdleBasis) === '3' ? 'BOTH' : 'IRR', lp:lp, gp:gp, total:tot, ties:ties, rocWithin:lp.roc <= lp.contributed + 1 && gp.roc <= gp.contributed + 1, gpShareOfProfit:tot.profit > 0 ? gp.profit / tot.profit : NaN, prefLabel:em ? 'Return to the first multiple' : 'Preferred return' };
}
window.bkWaterfallSummary = function(opts){ return safe(function(){ return summary(opts); }, null); };
window.bkWaterfallChecks = function(opts){ return safe(function(){ return run(opts); }, null); };

function box(h){ return '<div style="background:var(--surface,#fff);border:1px solid var(--line,#dbe4ec);border-radius:8px;padding:14px 16px;margin:16px 0 14px">' + h + '</div>'; }
function chip(st){ return '<span class="status-chip ' + (st === 'pass' ? 'pass' : st === 'fail' ? 'fail' : '') + '">' + (st === 'pass' ? 'Pass' : st === 'fail' ? 'Fail' : 'N/A') + '</span>'; }
function panel(){
  var c = window.bkWaterfallChecks(); if(!c) return '';
  var cell = 'padding:6px 8px;border-bottom:1px solid var(--line,#e5ecf2)', T = 'width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums';
  var rows = c.hurdles.map(function(h){ return '<tr><td style="' + cell + ';white-space:nowrap">' + esc(h.name) + '</td><td style="' + cell + ';text-align:right">' + (h.unit === 'both' ? P2(h.target) + (c.rule === 'either' ? ' or ' : ' and ') + h.em.toFixed(2) + 'x' : h.unit === 'x' ? (isFinite(h.target) ? h.target.toFixed(2) + 'x' : '—') : P2(h.target)) + '</td><td style="' + cell + ';text-align:right">' + (h.unit === 'both' ? P2(h.measured) + ' / ' + (isFinite(h.multiple) ? h.multiple.toFixed(3) + 'x' : '—') : h.unit === 'x' ? (isFinite(h.measured) ? h.measured.toFixed(3) + 'x' : '—') : P2(h.measured)) + '</td><td style="' + cell + ';text-align:right">' + M(h.balance) + '</td><td style="' + cell + ';text-align:center">' + chip(h.status) + '</td><td style="' + cell + ';font-size:12px">' + esc(h.detail) + '</td></tr>'; }).join('');
  var oth = c.other.map(function(o){ return '<tr><td style="' + cell + '" colspan="4">' + esc(o.label) + '</td><td style="' + cell + ';text-align:center">' + chip(o.status) + '</td><td style="' + cell + ';font-size:12px">' + esc(o.detail) + '</td></tr>'; }).join('');
  return box('<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><b>Waterfall verification</b><span style="font-size:12.5px">' + (c.ok ? '<span style="color:#3F6B52;font-weight:700">All ' + c.pass + ' checks pass</span>' : '<span style="color:#8C3B34;font-weight:700">' + c.fail + ' of ' + (c.pass + c.fail) + ' checks fail</span>') + ' · ' + (c.basis === 'EM' ? 'equity-multiple basis' : c.basis === 'BOTH' ? 'IRR and equity-multiple hurdles, ' + (c.rule === 'either' ? 'either is enough' : 'both must be met') : 'IRR basis') + ', hurdles tested on ' + (c.lpMode ? 'the LP\'s own contributions and distributions' : 'total deal equity (legacy convention)') + '</span></div>'
    + '<div style="font-size:12px;opacity:.8;margin:4px 0 8px">Each hurdle is re-tested from what the partners actually received. A reached hurdle must come out at its rate; one not reached must come out below it with a balance left. The replayed IRR is dated (actual days / 365) against monthly accrual, so it is held to ' + (TOL_IRR * 10000).toFixed(0) + ' bps.</div>'
    + '<div style="overflow-x:auto"><table style="' + T + ';min-width:640px"><thead><tr><th style="' + cell + ';text-align:left">Hurdle</th><th style="' + cell + ';text-align:right">' + (c.basis === 'EM' ? 'Hurdle multiple' : c.basis === 'BOTH' ? 'Hurdle (IRR ' + (c.rule === 'either' ? 'or' : 'and') + ' multiple)' : 'Hurdle IRR') + '</th><th style="' + cell + ';text-align:right">' + (c.basis === 'EM' ? 'LP multiple' : c.basis === 'BOTH' ? 'Replayed IRR / LP multiple' : 'Replayed IRR') + '</th><th style="' + cell + ';text-align:right">Still owed</th><th style="' + cell + ';text-align:center">Result</th><th style="' + cell + ';text-align:left">Detail</th></tr></thead><tbody>' + rows + oth + '</tbody></table></div>');
}
function breakdown(){
  var m = window.bkWaterfallSummary(); if(!m) return '';
  var cell = 'padding:6px 8px;border-bottom:1px solid var(--line,#e5ecf2)', T = 'width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums', dash = function(v, z){ return z && Math.abs(v) < 0.5 ? '—' : M(v); };
  var spl = (window.bkWaterfallChecks() || {}).split, splitRows = function(){ return spl ? '<tr><td style="' + cell + ';padding-left:22px;opacity:.85">of which on operating cash</td><td style="' + cell + ';text-align:right">—</td><td style="' + cell + ';text-align:right">' + M(spl.op) + '</td><td style="' + cell + ';text-align:right">' + M(spl.op) + '</td></tr><tr><td style="' + cell + ';padding-left:22px;opacity:.85">of which on sale / refinance proceeds</td><td style="' + cell + ';text-align:right">—</td><td style="' + cell + ';text-align:right">' + M(spl.sale) + '</td><td style="' + cell + ';text-align:right">' + M(spl.sale) + '</td></tr>' : ''; };
  var r = function(l, k, o){ o = o || {}; return '<tr><td style="' + cell + (o.b ? ';font-weight:700' : '') + '">' + l + '</td>' + [m.lp, m.gp, m.total].map(function(q){ var v = q[k]; return '<td style="' + cell + ';text-align:right' + (o.b ? ';font-weight:700' : '') + '">' + (o.f ? o.f(v) : dash(v, o.z)) + '</td>'; }).join('') + '</tr>'; };
  var rows = r('Contributed', 'contributed') + r('Return of capital', 'roc') + r(m.prefLabel, 'pref') + r('Excess cash flow', 'excess', { z:1 }) + r('Promote', 'promote', { z:1 }) + splitRows() + r('Total distributions', 'dist', { b:1 }) + r('Profit', 'profit') + r('Equity multiple', 'moic', { f:function(v){ return isFinite(v) ? v.toFixed(2) + 'x' : '—'; } }) + r('IRR', 'irr', { f:function(v){ return isFinite(v) ? P2(v) : '—'; } });
  return box('<b>Partner distribution breakdown</b><div style="font-size:12px;opacity:.8;margin:4px 0 8px">What each partner received, by kind. ' + (m.basis === 'EM' ? 'Tier-1 cash returns capital first; the rest is the return to the first multiple.' : 'Tier-1 cash pays the accrued preferred return first, then capital.') + ' Excess is each partner\'s share of cash beyond tier 1; promote is the GP\'s distributions above its pro-rata share. The categories add to the engine\'s distributions' + (m.ties ? ' (they do).' : ' (THEY DO NOT: see the verification below).') + (isFinite(m.gpShareOfProfit) ? ' The GP (sponsor) takes ' + P2(m.gpShareOfProfit) + ' of the profit on ' + P2(m.gp.contributed / m.total.contributed) + ' of the equity.' : '') + '</div><div style="overflow-x:auto"><table style="' + T + ';min-width:520px"><thead><tr><th style="' + cell + ';text-align:left"></th><th style="' + cell + ';text-align:right">LP</th><th style="' + cell + ';text-align:right">GP (sponsor)</th><th style="' + cell + ';text-align:right">Total</th></tr></thead><tbody>' + rows + '</tbody></table></div>');
}
var prev = RENDERERS['Equity Waterfall'];
if(typeof prev === 'function'){
  var wrapped = function(){ var o = prev.apply(this, arguments); try { if(o && typeof o.main === 'string' && !/no deal loaded|there is no active deal/i.test(o.main)) o.main += breakdown() + panel(); } catch(e){} return o; };
  wrapped.__bkWfChecks = true; wrapped.__bkOriginal = prev.__bkOriginal || prev;
  if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Equity Waterfall', wrapped); else RENDERERS['Equity Waterfall'] = wrapped;
}
})();
