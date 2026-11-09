/* ============================================================================================
   VALUATION ENGINE: present value, net present value, future value, maximum supportable price.
   One set of pure functions over DATED cash flows, and one adapter that reads the deal's own
   monthly cash flows from the Present Value Report's engine (bkPvCalc, src/156). Nothing here
   rebuilds a schedule or an assumption: the Present Value Report, the Valuation Report, the
   Pricing Engine and the saved scenarios all call these functions.

   Definitions (shown with every result):
     Unleveraged PV   present value of the property-level cash flows before debt service plus the net sale
     Property NPV     unleveraged PV less the acquisition basis (price, closing costs, acquisition fee)
     Leveraged PV     present value of the equity cash flows (distributions, equity called after closing,
                      and the sale net of selling costs, the disposition fee and the loan payoff)
     Equity NPV       leveraged PV less the closing equity
     FV               each dated cash flow accumulated to a chosen date at the accumulation rate
   The opening loan is financing: it is never added to an equity present value.
   Discounting: actual days / 365 from the valuation date (the engine's XNPV, bkXnpv).
   ============================================================================================ */
(function(){
var VER = 'val-1.0';
window.bkValEngineVersion = VER;
function num(v){ v = Number(v); return isFinite(v) ? v : 0; }
function iso(d){ d = new Date(d); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function days(a, b){ return window.bkDays(a, b); }
function okRate(r){ r = Number(r); return isFinite(r) && r > -1; }

/* ---------- pure functions over [{date, amount}] ---------- */
window.bkValDiscount = function(amount, date, d0, rate){ if(!okRate(rate)) return NaN; return num(amount) / Math.pow(1 + Number(rate), days(d0, date) / 365); };
window.bkValPV = function(flows, d0, rate){ if(!okRate(rate)) return NaN; var t = 0; for(var i = 0; i < flows.length; i++) t += window.bkValDiscount(flows[i].amount, flows[i].date, d0, rate); return t; };
window.bkValNPV = function(flows, d0, rate, initial){ var p = window.bkValPV(flows, d0, rate); return isFinite(p) ? p - num(initial) : NaN; };
/* each flow dated on or before the target is accumulated to the target date; a flow after it is left out (and counted) */
window.bkValFV = function(flows, d0, target, rate, initial){
  if(!okRate(rate)) return { fv:NaN }; var fv = 0, out = 0;
  for(var i = 0; i < flows.length; i++){ var dd = days(flows[i].date, target); if(dd < 0){ out++; continue; } fv += num(flows[i].amount) * Math.pow(1 + Number(rate), dd / 365); }
  var net = fv - num(initial) * Math.pow(1 + Number(rate), Math.max(0, days(d0, target)) / 365);
  return { fv:fv, fvNet:net, excluded:out, target:iso(target) };
};
window.bkValCagr = function(start, target, years){ start = Number(start); target = Number(target); years = Number(years); if(!(start > 0) || !(target > 0) || !(years > 0)) return NaN; return Math.pow(target / start, 1 / years) - 1; };
/* bracketed bisection: f must change sign between lo and hi */
window.bkValBisect = function(f, lo, hi, tol, maxIt){
  var flo = f(lo), fhi = f(hi); if(!isFinite(flo) || !isFinite(fhi)) return { ok:false, reason:'not computable at the search bounds' };
  if(flo === 0) return { ok:true, x:lo }; if(fhi === 0) return { ok:true, x:hi };
  if(flo * fhi > 0) return { ok:false, reason:'no sign change between the bounds' };
  for(var i = 0; i < (maxIt || 80); i++){ var m = (lo + hi) / 2, fm = f(m); if(!isFinite(fm)) return { ok:false, reason:'not computable inside the bounds' }; if(Math.abs(fm) < (tol || 0.005)) return { ok:true, x:m, iterations:i }; if(flo * fm < 0){ hi = m; fhi = fm; } else { lo = m; flo = fm; } }
  return { ok:true, x:(lo + hi) / 2 };
};

/* ---------- the deal's own dated cash flows (current deal, or inside bkRunWith) ---------- */
window.bkValDealFlows = function(){
  var s = bkLoad();
  /* a development: the equity series the engine's own levered IRR uses (contributions through construction as negatives, distributions and the sale as positives), the first flow dated at closing and the rest month-end (the engine's own IRR dates), valued at the closing date. The property-level series is not published by the development engine, so the unleveraged measures are not offered. */
  if(/develop/i.test(String(s.dealType || ''))){ var mr = window.bkMonthlyReturns(), E = []; for(var q = 0; q < mr.values.length; q++) E.push({ date:iso(q === 0 && mr.closeDt ? mr.closeDt : mr.dates[q]), amount:num(mr.values[q]) });   /* the engine dates the first (closing) flow at the closing date, the rest month-end: the same dates its own IRR uses */
    var pos = 0, neg = 0; E.forEach(function(x){ if(x.amount < 0) neg += -x.amount; else pos += x.amount; });
    return { engineVersion:VER, development:true, valuationDate:E[0].date, saleDate:E[E.length - 1].date, holdMonths:E.length, unlevered:null, equity:E, basis:null, closingEquity:neg, loan:0, price:num(s.purchasePrice), distributions:pos, contributions:neg }; }
  var c = window.bkPvCalc(s, 0.1), hm = c.ac.holdMonths, d0 = c.d0, U = [], L = [], end = window.bkMonthEnd(d0, hm);
  for(var j = 0; j < hm; j++){ var dt = iso(window.bkMonthEnd(d0, j + 1)); U.push({ date:dt, amount:num(c.opsU[j]) }); L.push({ date:dt, amount:num(c.opsL[j]) }); }
  U.push({ date:iso(end), amount:num(c.netU) }); L.push({ date:iso(end), amount:num(c.saleL) });
  return { engineVersion:VER, valuationDate:iso(d0), saleDate:iso(end), holdMonths:hm, unlevered:U, equity:L, basis:-num(c.ac.initial), closingEquity:num(c.eq0), loan:num(c.debt0), netSale:num(c.netU), equitySale:num(c.saleL), price:num(s.purchasePrice) };
};

/* ---------- the deal-level valuation ---------- */
/* o: { rate (property discount rate), equityRate, accumRate, fvDate }. Equity rate defaults to the property rate. */
window.bkValuate = function(o){
  o = o || {}; var f = window.bkValDealFlows(), d0 = f.valuationDate, r = Number(o.rate), re = o.equityRate != null && o.equityRate !== '' ? Number(o.equityRate) : r, ra = o.accumRate != null && o.accumRate !== '' ? Number(o.accumRate) : re;
  var T = o.fvDate || f.saleDate;
  if(f.development){ /* equity only: PV of the distributions, PV of every contribution, NPV = their difference (= the XNPV of the whole series) */
    var dist = f.equity.filter(function(x){ return x.amount > 0; }), cont = f.equity.filter(function(x){ return x.amount < 0; }).map(function(x){ return { date:x.date, amount:-x.amount }; });
    var pvD = window.bkValPV(dist, d0, re), pvC = window.bkValPV(cont, d0, re), fvD = window.bkValFV(dist, d0, T, ra, 0), fvC = window.bkValFV(cont, d0, T, ra, 0);
    return { engineVersion:VER, development:true, valuationDate:d0, rate:r, equityRate:re, accumRate:ra, fvDate:iso(T), basis:null, closingEquity:f.contributions, loan:0,
      unleveragedPV:null, propertyNPV:null, leveragedPV:pvD, equityInvestmentPV:pvC, equityNPV:pvD - pvC, fvUnlevered:null, fvUnleveredNet:null, fvEquity:fvD.fv, fvEquityNet:fvD.fv - fvC.fv, fvExcluded:fvD.excluded + fvC.excluded }; }
  var pvU = window.bkValPV(f.unlevered, d0, r), pvL = window.bkValPV(f.equity, d0, re);
  var fvU = window.bkValFV(f.unlevered, d0, T, ra, f.basis), fvL = window.bkValFV(f.equity, d0, T, ra, f.closingEquity);
  return { engineVersion:VER, valuationDate:d0, rate:r, equityRate:re, accumRate:ra, fvDate:iso(T), basis:f.basis, closingEquity:f.closingEquity, loan:f.loan,
    unleveragedPV:pvU, propertyNPV:pvU - f.basis, leveragedPV:pvL, equityNPV:pvL - f.closingEquity,
    fvUnlevered:fvU.fv, fvUnleveredNet:fvU.fvNet, fvEquity:fvL.fv, fvEquityNet:fvL.fvNet, fvExcluded:fvU.excluded + fvL.excluded };
};
/* the discount rate at which an NPV is zero (the IRR of that cash flow series), or null when none in -50%..200% */
window.bkValBreakEvenRate = function(kind){
  var f = window.bkValDealFlows(), d0 = f.valuationDate; if(kind !== 'equity' && f.development) return null;
  var x = window.bkValBisect(function(r){ if(f.development) return window.bkValNPV(f.equity, d0, r, 0); return window.bkValNPV(kind === 'equity' ? f.equity : f.unlevered, d0, r, kind === 'equity' ? f.closingEquity : f.basis); }, -0.5, 2, 0.01); return x.ok ? x.x : null;
};

/* ---------- maximum supportable purchase price ----------
   The price P at which the chosen NPV is zero, with the WHOLE deal re-run at every trial price (bkRunWith): closing costs and fees, the loan
   (LTV, LTC, DSCR and debt-yield sizing), the closing equity, debt service and the exit all respond to P. Never "PV minus a fixed number".
   kind: 'property' (unleveraged NPV at the property rate) or 'equity' (leveraged NPV at the equity rate). Scans downward from a high price for the
   highest price whose NPV is still >= 0, then bisects between it and the next price up. */
window.bkValMaxPrice = function(kind, rate, equityRate){
  var s = bkLoad(), p0 = num(s.purchasePrice); if(!(p0 > 0)) return { ok:false, reason:'enter a purchase price first' };
  if(/develop/i.test(String(s.dealType || '')) && kind !== 'equity') return { ok:false, reason:'a development has no property-level cash flow series: solve the equity price' };
  var npvAt = function(P){ return window.bkRunWith({ purchasePrice:P }, function(){ var v = window.bkValuate({ rate:rate, equityRate:equityRate != null ? equityRate : rate }); return kind === 'equity' ? v.equityNPV : v.propertyNPV; }); };
  var grid = [], lo = 0.25, hi = 3, N = 24; for(var i = 0; i <= N; i++) grid.push(p0 * lo * Math.pow(hi / lo, i / N));
  var vals = grid.map(npvAt), k = -1; for(var j = grid.length - 1; j >= 0; j--){ if(isFinite(vals[j]) && vals[j] >= 0){ k = j; break; } }
  if(k < 0) return { ok:false, reason:'the NPV is negative at every price from ' + Math.round(grid[0]) + ' up: the cash flows cannot support any price at this return', checked:grid.length };
  if(k === grid.length - 1) return { ok:false, reason:'the NPV is still positive at ' + Math.round(grid[k]) + ' (3x the entered price): no maximum inside the search range', checked:grid.length };
  var r2 = window.bkValBisect(npvAt, grid[k], grid[k + 1], 0.5, 60); if(!r2.ok) return { ok:false, reason:r2.reason };
  return { ok:true, price:r2.x, npvAtPrice:npvAt(r2.x), npvAtEntered:npvAt(p0), enteredPrice:p0, kind:kind, rate:rate, checked:grid.length + (r2.iterations || 0) };
};
})();
