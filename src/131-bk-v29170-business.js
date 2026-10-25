
/* ===========================================================================
   V29.17.0 - OPERATING BUSINESS (OpCo) MODEL, ported from the Punchlist business model
   ===========================================================================
   For an owner whose business runs in, or alongside, a property: a driver-based operating model
   (tiered pricing -> revenue per job -> P&L -> break-even), a discount-rate build-up, a three-case DCF
   (bear / base / bull; owner compensation normalised out; capex and working capital; mid-year
   discounting; perpetuity, exit-multiple or averaged terminal value), three sensitivity grids, market-
   multiple and 10-year scenario valuation - and the OpCo / PropCo question: sell the business, sell the
   place of business, sell both, or hold both.

   Stored per deal in s._biz, loaded only by an explicit action (bkBizSeedPunchlist / bkBizStartBlank),
   never as a default. Nothing here touches the real-estate engines.

   Convention switch (dcf.tvDiscount):
     'workbook'  the terminal value, whichever method, is discounted with the final mid-year factor, as
                 the source workbook does (default, so the numbers tie).
     'standard'  perpetuity TV at the final mid-year factor, exit-multiple TV at the END of year 5: a
                 multiple is a value at year-end, so the workbook overstates it by (1 + rate)^0.5.
   =========================================================================== */
(function(){
'use strict';
if(typeof bkLoad !== 'function' || typeof bkSave !== 'function') return;
var num = function(x){ var v = Number(x); return isFinite(v) ? v : 0; };
var SEED = {"name":"Punchlist Real Estate, LLC","modelStart":"2026-07-01","tiers":[{"name":"<$5k","mix":0.5,"avgValue":2500,"coordPct":0.1,"fee":149},{"name":"$5k\u2013$25k","mix":0.3,"avgValue":12500,"coordPct":0.1,"fee":249},{"name":"$25k\u2013$50k","mix":0.1,"avgValue":35000,"coordPct":0.1,"fee":349},{"name":"$50k\u2013$150k","mix":0.08,"avgValue":85000,"coordPct":0.075,"fee":349},{"name":"$150k+","mix":0.02,"avgValue":250000,"coordPct":0.05,"fee":349}],"relaunchJobs":[2,3,3,5,5,6],"growth":{"jobs":[0.2,0.175,0.15,0.125,0.1],"value":[0.03,0.03,0.03,0.03,0.03],"opex":[0.03,0.03,0.03,0.03,0.03]},"opex":[{"name":"Advertising / Marketing","annual":1000,"cls":"Fixed","note":"Current conservative run-rate"},{"name":"Admin / Software / QuickBooks","annual":3000,"cls":"Fixed","note":"Business management subscriptions/admin"},{"name":"Payroll","annual":6000,"cls":"Fixed","note":"$500/month starting payroll"},{"name":"Professional Fees / Licenses","annual":2500,"cls":"Fixed","note":"Includes RE license / professional fees"},{"name":"Legal","annual":750,"cls":"Fixed","note":null},{"name":"Rent","annual":9000,"cls":"Fixed","note":"$750/month"},{"name":"Transportation","annual":5000,"cls":"Semi-variable","note":null},{"name":"Web Services","annual":850,"cls":"Fixed","note":null},{"name":"FF&E","annual":1000,"cls":"CapEx / cash","note":"Shown separately from EBITDA"},{"name":"Insurance","annual":250,"cls":"Fixed","note":null},{"name":"Miscellaneous","annual":500,"cls":"Editable","note":"Placeholder \u2014 intentionally $0"}],"dcf":{"case":2,"netDebt":0,"ownerCompEsc":0.03,"tvMethod":3,"cases":{"bear":{"rev":[0.85,0.8,0.75,0.7,0.7],"comp":75000,"capex":[0.015,0.015,0.015,0.015,0.015],"nwc":[0.03,0.03,0.03,0.03,0.03],"rate":0.263,"g":0.02,"mult":3},"base":{"rev":[1,1,1,1,1],"comp":65000,"capex":[0.01,0.01,0.01,0.01,0.01],"nwc":[0.02,0.02,0.02,0.02,0.02],"rate":null,"g":0.03,"mult":4},"bull":{"rev":[1.15,1.25,1.35,1.45,1.55],"comp":55000,"capex":[0.008,0.008,0.008,0.008,0.008],"nwc":[0.01,0.01,0.01,0.01,0.01],"rate":0.183,"g":0.035,"mult":5}}},"rate":{"rf":0.048,"erp":0.055,"size":0.06,"specific":0.06,"debt":0,"costDebt":0,"debtWeight":0},"valuation":{"current":{"low":50000,"base":75000,"high":125000},"scenarios":[{"name":"Owner-Operated","revenue":750000,"margin":0.3,"mult":3},{"name":"Small Regional Company","revenue":2000000,"margin":0.25,"mult":4},{"name":"Successful Punchlist","revenue":5000000,"margin":0.25,"mult":5},{"name":"Strong Regional Platform","revenue":10000000,"margin":0.25,"mult":6},{"name":"Exceptional Platform","revenue":20000000,"margin":0.25,"mult":7.5}],"ext":{"growth":[0.25,0.25,0.25,0.2,0.2],"margin":[0.3,0.28,0.27,0.26,0.25],"mult":[3,3.5,4,4.5,5,5,5,5,5,5]}}};
var clone = function(o){ return JSON.parse(JSON.stringify(o)); };
function biz(s){ s = s || bkLoad(); return (s && s._biz && s._biz.enabled) ? s._biz : null; }

/* ------------------------------------------------------------------ actions */
function later(){ setTimeout(function(){ if(typeof showSheet === 'function' && typeof currentSheet !== 'undefined') showSheet(currentSheet); }, 0); }
window.bkBizSeedPunchlist = function(){ var s = bkLoad(); if(!s) return false; var b = clone(SEED); b.enabled = true; b.dcf.tvDiscount = 'workbook'; b.dcf.convention = 'mid'; b.place = b.place || {}; s._biz = b; bkSave(s); later(); return true; };
window.bkBizStartBlank = function(){
  var s = bkLoad(); if(!s) return false; var b = clone(SEED); b.enabled = true; b.name = 'Operating business'; b.relaunchJobs = [0, 0, 0, 0, 0, 0];
  b.tiers.forEach(function(t){ t.mix = 0; t.avgValue = 0; t.coordPct = 0; t.fee = 0; });
  b.opex.forEach(function(o){ o.annual = 0; });
  ['bear', 'base', 'bull'].forEach(function(k){ b.dcf.cases[k].comp = 0; });
  b.valuation.current = { low:0, base:0, high:0 }; b.dcf.tvDiscount = 'workbook'; b.dcf.convention = 'mid'; s._biz = b; bkSave(s); later(); return true;
};
window.bkBizClear = function(){ var s = bkLoad(); if(!s) return; delete s._biz; bkSave(s); later(); };
/* path like 'tiers.0.mix' or 'dcf.cases.bear.rev.2' */
window.bkBizSet = function(path, v){
  var s = bkLoad(); if(!s || !s._biz) return; var p = path.split('.'), o = s._biz;
  for(var i = 0; i < p.length - 1; i++){ if(o[p[i]] == null) o[p[i]] = /^\d+$/.test(p[i + 1]) ? [] : {}; o = o[p[i]]; }
  o[p[p.length - 1]] = v; bkSave(s); later();
};

/* -------------------------------------------------------------------- engine */
function tiersEcon(b){
  var rows = b.tiers.map(function(t){ var coord = num(t.avgValue) * num(t.coordPct); return { name:t.name, mix:num(t.mix), coord:coord, revPerJob:coord + num(t.fee), effFee:num(t.avgValue) > 0 ? (coord + num(t.fee)) / num(t.avgValue) : 0 }; });
  return { rows:rows, mixTotal:rows.reduce(function(a, r){ return a + r.mix; }, 0), wValue:b.tiers.reduce(function(a, t){ return a + num(t.mix) * num(t.avgValue); }, 0), wRevJob:rows.reduce(function(a, r){ return a + r.mix * r.revPerJob; }, 0) };
}
function pnl(b){
  var te = tiersEcon(b), g = b.growth;
  var run = b.opex.filter(function(o){ return !/^capex/i.test(o.cls || ''); }).reduce(function(a, o){ return a + num(o.annual); }, 0);
  var ffe = b.opex.filter(function(o){ return /^capex/i.test(o.cls || ''); }).reduce(function(a, o){ return a + num(o.annual); }, 0);
  var h2 = b.relaunchJobs.reduce(function(a, x){ return a + num(x); }, 0);
  var years = [{ label:'H2 2025', jobs:h2, value:te.wValue, revJob:te.wRevJob, opex:run / 2, ffe:ffe / 2 }];
  var jobs = h2 * 2, value = te.wValue, rj = te.wRevJob, ox = 1;
  for(var k = 0; k < 5; k++){ jobs *= 1 + num(g.jobs[k]); value *= 1 + num(g.value[k]); rj *= 1 + num(g.value[k]); ox *= 1 + num(g.opex[k]); years.push({ label:String(2026 + k), jobs:jobs, value:value, revJob:rj, opex:run * ox, ffe:ffe * ox }); }
  years.forEach(function(y){ y.gpv = y.jobs * y.value; y.revenue = y.jobs * y.revJob; y.ebitda = y.revenue - y.opex; y.margin = y.revenue ? y.ebitda / y.revenue : 0; y.cashBT = y.ebitda - y.ffe; });
  var be = te.wRevJob > 0 ? run / te.wRevJob : 0;
  return { tiers:te, years:years, runRate:run, ffe:ffe, breakEven:{ jobsYear:be, jobsMonth:be / 12, gpv:be * te.wValue } };
}
function ke(r){ return num(r.rf) + num(r.erp) + num(r.size) + num(r.specific); }
function wacc(r){ var dw = num(r.debtWeight); return ke(r) * (1 - dw) + num(r.costDebt) * dw; }
var CASES = ['bear', 'base', 'bull'];
function dcf(b, P, o){
  o = o || {}; var d = b.dcf, cs = o.case || CASES[(num(d.case) || 2) - 1], c = d.cases[cs];
  var rate = o.rate != null ? o.rate : (cs === 'base' ? wacc(b.rate) : num(c.rate)), g = o.g != null ? o.g : num(c.g), mult = o.mult != null ? o.mult : num(c.mult), comp0 = o.comp != null ? o.comp : num(c.comp);
  var method = o.tv != null ? o.tv : (num(d.tvMethod) || 3), tvd = o.tvDiscount || d.tvDiscount || 'workbook', conv = o.convention || d.convention || 'mid';
  var prev = P.years[0].revenue * 2, rows = [];
  for(var k = 0; k < 5; k++){
    var y = P.years[k + 1], rev = y.revenue * num(c.rev[k]), opex = y.opex, sde = rev - opex, owner = comp0 * Math.pow(1 + num(d.ownerCompEsc), k), ebitda = sde - owner;
    var capex = rev * num(c.capex[k]), nwc = (rev - prev) * num(c.nwc[k]), fcf = ebitda - capex - nwc, t = conv === 'mid' ? k + 0.5 : k + 1;
    rows.push({ year:2026 + k, revenue:rev, opex:opex, sde:sde, owner:owner, ebitda:ebitda, capex:capex, nwc:nwc, fcf:fcf, t:t, df:1 / Math.pow(1 + rate, t) }); prev = rev;
  }
  rows.forEach(function(r){ r.pv = r.fcf * r.df; });
  var last = rows[4], termFcf = last.fcf * (1 + g), tvPerp = rate > g ? termFcf / (rate - g) : NaN, tvMult = last.ebitda * mult;
  var sel = method === 1 ? tvPerp : method === 2 ? tvMult : (tvPerp + tvMult) / 2, dfN = last.df, dfEnd = 1 / Math.pow(1 + rate, 5), pvTV;
  if(tvd === 'workbook') pvTV = sel * dfN; else pvTV = method === 1 ? tvPerp * dfN : method === 2 ? tvMult * dfEnd : (tvPerp * dfN + tvMult * dfEnd) / 2;
  var sumPV = rows.reduce(function(a, r){ return a + r.pv; }, 0), ev = sumPV + pvTV, nd = num(d.netDebt);
  return { case:cs, rate:rate, g:g, mult:mult, comp:comp0, method:method, tvDiscount:tvd, convention:conv, rows:rows, termFcf:termFcf, tvPerp:tvPerp, tvMult:tvMult, tvSel:sel, pvTV:pvTV, sumPV:sumPV, ev:ev, equity:ev - nd,
    eqPerp:sumPV + tvPerp * dfN - nd, eqMult:sumPV + tvMult * dfN - nd, tvShare:ev ? pvTV / ev : 0, evEbitda2030:last.ebitda ? ev / last.ebitda : 0, evEbitda2026:rows[0].ebitda ? ev / rows[0].ebitda : 0, gOk:rate > g };
}
function sens(b, P){
  var d = b.dcf, cs = CASES[(num(d.case) || 2) - 1], base = dcf(b, P), c = d.cases[cs];
  var rates = [-0.04, -0.02, 0, 0.02, 0.04].map(function(x){ return base.rate + x; }), gs = [-0.01, -0.005, 0, 0.005, 0.01].map(function(x){ return base.g + x; });
  var mults = [-2, -1, 0, 1, 2].map(function(x){ return base.mult + x; }), comps = [-20000, -10000, 0, 10000, 20000].map(function(x){ return num(c.comp) + x; });
  return { rates:rates, gs:gs, mults:mults, comps:comps,
    s1:rates.map(function(r){ return gs.map(function(g){ return dcf(b, P, { rate:r, g:g }).eqPerp; }); }),
    s2:rates.map(function(r){ return mults.map(function(m){ return dcf(b, P, { rate:r, mult:m }).eqMult; }); }),
    s3:comps.map(function(cm){ return rates.map(function(r){ return dcf(b, P, { rate:r, comp:cm }).eqPerp; }); }) };
}
function valuation(b, P){
  var v = b.valuation, ext = v.ext, ys = P.years.slice(1), rev = ys.map(function(y){ return y.revenue; }), marg = ys.map(function(y){ return y.margin; });
  for(var k = 0; k < 5; k++) rev.push(rev[rev.length - 1] * (1 + num(ext.growth[k])));
  marg = marg.concat(ext.margin.map(num)); var ebitda = rev.map(function(r, i){ return r * marg[i]; }), ev = ebitda.map(function(e, i){ return e * num(ext.mult[i]); });
  return { rev:rev, margin:marg, ebitda:ebitda, ev:ev, scenarios:v.scenarios.map(function(s){ var e = num(s.revenue) * num(s.margin); return { name:s.name, revenue:num(s.revenue), margin:num(s.margin), mult:num(s.mult), ebitda:e, ev:e * num(s.mult) }; }) };
}
function model(b){
  var P = pnl(b), out = { pnl:P, ke:ke(b.rate), wacc:wacc(b.rate), dcf:dcf(b, P), cases:{}, sens:sens(b, P), valuation:valuation(b, P) };
  CASES.forEach(function(c){ out.cases[c] = dcf(b, P, { case:c }); });
  var std = dcf(b, P, { tvDiscount:'standard' }); out.standardEV = std.ev; out.tvDiscountEffect = out.dcf.ev - std.ev;
  return out;
}
window.bkBizModel = function(){ var b = biz(); return b ? model(clone(b)) : null; };
window.bkBizInputs = function(){ var b = biz(); return b ? clone(b) : null; };
window.bkBizModelOf = function(b){ return model(clone(b)); };

/* ------------------------------------------------- OpCo / PropCo: sell what? */
function placeOf(s){
  var b = biz(s), pl = (b && b.place) || {}, d = {};
  var idx = b ? b.opex.findIndex(function(o){ return /rent/i.test(o.name || ''); }) : -1;
  d.marketRent = num(pl.marketRent); d.rentPaid = pl.rentPaid != null && pl.rentPaid !== '' ? num(pl.rentPaid) : (idx >= 0 ? num(b.opex[idx].annual) : 0);
  d.rentIncludedInNOI = num(pl.rentIncludedInNOI); d.propertyValue = num(pl.propertyValue); d.brokerPct = pl.brokerPct != null && pl.brokerPct !== '' ? num(pl.brokerPct) : 0.10;
  d.bizTaxRate = pl.bizTaxRate != null && pl.bizTaxRate !== '' ? num(pl.bizTaxRate) : 0.20; d.propTaxRate = pl.propTaxRate != null && pl.propTaxRate !== '' ? num(pl.propTaxRate) : 0.25;
  d.bizBasis = num(pl.bizBasis); d.propBasis = pl.propBasis != null && pl.propBasis !== '' ? num(pl.propBasis) : num(s.purchasePrice); d.bundlePct = num(pl.bundlePct); d.rentIdx = idx;
  return d;
}
function place(){
  var s = bkLoad(), b = biz(s); if(!s || !b) return null;
  var pl = placeOf(s), P = pnl(clone(b)), asIs = dcf(clone(b), P);
  /* The business as a stand-alone buyer would value it: market rent in its costs instead of whatever it pays today. */
  var norm = clone(b);
  if(pl.rentIdx >= 0) norm.opex[pl.rentIdx].annual = pl.marketRent; else if(pl.marketRent > 0) norm.opex.push({ name:'Rent (market, normalised)', annual:pl.marketRent, cls:'Fixed' });
  var Pn = pnl(norm), normDcf = dcf(norm, Pn), c = b.dcf.cases[CASES[(num(b.dcf.case) || 2) - 1]];
  /* The property: Year-1 NOI after reserves over the cap rate (or an appraised value you enter), plus the rent it does not yet earn from this tenant, capitalised. */
  var noi = 0, cap = num(s.exitCap); try { noi = bkAnnualCF().arr[0].after; } catch(e){}
  var uplift = pl.marketRent - pl.rentIncludedInNOI, propBase = pl.propertyValue > 0 ? pl.propertyValue : (cap > 0 ? noi / cap : 0);
  var propValue = propBase + (cap > 0 ? uplift / cap : 0), propNOI = noi + uplift, saleCost = num(s.saleCostPct) || 0.02;
  /* Rent coverage: what the business earns before rent and after paying its owner, divided by the rent. Buyers of a sale-leaseback look for 2x or more. */
  var y1 = Pn.years[1], ebitdar = y1.revenue - (y1.opex - pl.marketRent) - num(c.comp), coverage = pl.marketRent > 0 ? ebitdar / pl.marketRent : null;
  var bizEV = normDcf.ev, bizNet = bizEV * (1 - pl.brokerPct), bizTax = Math.max(0, bizNet - pl.bizBasis) * pl.bizTaxRate;
  var propNet = propValue * (1 - saleCost), propTax = Math.max(0, propNet - pl.propBasis) * pl.propTaxRate;
  var bizB = bizEV * (1 + pl.bundlePct) * (1 - pl.brokerPct), propB = propValue * (1 + pl.bundlePct) * (1 - saleCost);
  var bothTax = Math.max(0, bizB - pl.bizBasis) * pl.bizTaxRate + Math.max(0, propB - pl.propBasis) * pl.propTaxRate;
  var sc = function(name, cash, tax, retained, desc){ return { name:name, cashPre:cash, tax:tax, cashAfter:cash - tax, retained:retained, total:cash + retained, totalAfterTax:cash - tax + retained, desc:desc }; };
  var scenarios = [
    sc('Hold both', 0, 0, bizEV + propValue, 'Keep the business and the property; the business pays market rent to the property.'),
    sc('Sell the business, keep the property', bizNet, bizTax, propValue, 'A buyer takes the business and leases the place of business from you at market rent.'),
    sc('Sell the property, keep the business', propNet, propTax, bizEV, 'Sale-leaseback: the property is sold and the business pays market rent to the new owner.'),
    sc('Sell both', bizB + propB, bothTax, 0, 'Both assets sold together' + (pl.bundlePct ? ' at a ' + (pl.bundlePct * 100).toFixed(1) + '% bundle premium / (discount)' : '') + '.')
  ];
  return { inputs:pl, asIs:asIs, normalised:normDcf, normPnl:Pn, bizEV:bizEV, asIsEV:asIs.ev, rentNormalisation:normDcf.ev - asIs.ev, propNOI:propNOI, propBase:propBase, propValue:propValue, cap:cap, ebitdar:ebitdar,
    rentCoverage:coverage, scenarios:scenarios, bizShare:(bizEV + propValue) > 0 ? bizEV / (bizEV + propValue) : 0, uplift:uplift, bizNet:bizNet, bizTax:bizTax, propNet:propNet, propTax:propTax, saleCost:saleCost };
}
window.bkBizPlace = place;
})();
