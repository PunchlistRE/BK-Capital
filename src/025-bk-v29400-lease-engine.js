/* COMMERCIAL LEASE MODEL. A tenant-by-tenant projection of commercial income, used in place of the flat retail line when `commLeaseModel` is on and `leases` has tenants.
   Each tenant carries the lease in place (rent per SF with annual bumps or dated steps, expiry, recovery type). At expiry the space renews with the renewal probability, or goes dark for the
   downtime and re-leases at market; both outcomes are carried as probability-weighted branches, and each new lease rolls again until the end of the horizon. Free rent, tenant improvements and
   leasing commissions follow the new lease. Recoveries are the tenant's pro-rata share of the recoverable expense pool, or the shares stated in its lease, line by line; they can be
   NNN, base year, expense stop, fixed or none, with an optional cap on controllable expenses and a gross-up of variable expenses for vacancy. In-place rent rises by a fixed bump, by dated
   steps, or by the greater of a floor and the CPI change. TI and LC are capital below NOI (they reduce cash flow, not NOI). Rolled leases use market rent grown at the commercial rent
   growth. Not modeled: percentage rent, and inflation on TI and LC. */
(function(){
'use strict';
function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
function has(v){ return v !== null && v !== undefined && v !== '' && isFinite(Number(v)); }
function pick(a, b){ return has(a) ? Number(a) : b; }
function isDevDeal(s){ return /develop/i.test(String(s && s.dealType || '')); }
var DEF_POOL = ['taxes', 'insurance', 'utilities', 'rm', 'contract'];
/* taxes and insurance do not vary with occupancy (the engine's own split); recovery caps conventionally exclude them and utilities */
var FIXED_KEYS = ['taxes', 'insurance'], UNCAPPED_KEYS = ['taxes', 'insurance', 'utilities'];
var REC_TYPES = ['NNN', 'Gross', 'BaseYear', 'Stop', 'Fixed'];
window.BK_LEASE_POOL_KEYS = [['taxes', 'Real estate taxes'], ['insurance', 'Insurance'], ['utilities', 'Utilities'], ['rm', 'Repairs and maintenance'], ['contract', 'Contract services'], ['payroll', 'Payroll'], ['ga', 'General and administrative'], ['marketing', 'Marketing']];
window.bkLeaseOn = function(s){ s = s || bkLoad(); return !!(s && s.commLeaseModel === true && Array.isArray(s.leases) && s.leases.length && !isDevDeal(s)); };
window.bkLeaseMarket = function(s){
  var M = Object.assign({ growth:null, bump:0.03, termNew:60, termRenew:60, freeNew:3, freeRenew:0, renewPct:1, creditLoss:0, recoverable:DEF_POOL, grossUp:1, grossVar:null, cpiForecast:0.025, cpiIndex:[] }, (s && s.leaseMkt) || {});
  if(!Array.isArray(M.recoverable)) M.recoverable = DEF_POOL;
  if(!Array.isArray(M.cpiIndex)) M.cpiIndex = [];
  M.g = has(M.growth) ? Number(M.growth) : num(s && s.commercialRentGrowth);
  var RA = Object.assign({ renewalProbability:0.65, downtimeMonths:6, tiNewPerSF:20, tiRenewalPerSF:5, lcNewPct:0.06, lcRenewalPct:0.03 }, (s && s.rolloverAssumptions) || {});
  return { M:M, RA:RA };
};
/* growth of market rent: the same rule as the engine's other streams (continuous monthly, or a step each year from year 2), with optional year-by-year rates */
function marketFactor(s, g){
  var gc = s.growthCurves && s.growthCurves.commercial, cont = (typeof bkConventions === 'function' ? bkConventions(s).cvRentGrowthStart : 'month1') === 'month1', memo = [1];
  var rate = function(k){ return Array.isArray(gc) && has(gc[k - 1]) ? Number(gc[k - 1]) : g; };
  var full = function(Y){ while(memo.length <= Y){ var k = memo.length; memo.push(memo[k - 1] * (1 + rate(cont ? k : k + 1))); } return memo[Y]; };
  var f = cont ? function(m){ var Y = Math.max(1, Math.ceil(m / 12)); return full(Y - 1) * Math.pow(1 + rate(Y), (m - 12 * (Y - 1)) / 12); } : function(m){ return full(Math.max(1, Math.ceil(m / 12)) - 1); };
  var f1 = f(1);
  return function(m){ return f(Math.max(1, m)) / f1; };
}
var cache = { key:null, val:null };
function build(s){
  var cd = bkParseDealDate(s.closing, '2026-01-01'), cy = cd.getFullYear(), cm = cd.getMonth() + 1;
  var idx = function(d){ return (d.getFullYear() - cy) * 12 + (d.getMonth() + 1 - cm) + 1; };
  var n = Math.max(1, Math.min(15, Math.round(num(s.holdYears) || 10))), hold = n * 12, H = hold + 12;
  var mk = bkLeaseMarket(s), M = mk.M, RA = mk.RA, mf = marketFactor(s, M.g), segs = [], issues = [], tenants = [];
  var bsf = Math.max(num(s.gsf), (s.leases || []).reduce(function(t, l){ return t + num(l && l.sf); }, 0));
  /* CPI index by model month (month 1 = closing month). Known values are entered by month; between and beyond them the
     index moves at the CPI forecast, so with no values entered every annual change is exactly the forecast. */
  var cf = num(M.cpiForecast), cpts = M.cpiIndex.map(function(x){ var q = /^(\d{4})-(\d{1,2})/.exec(String(x && x.month || '')); return q && num(x.value) > 0 ? { m:(Number(q[1]) - cy) * 12 + (Number(q[2]) - cm) + 1, v:num(x.value) } : null; }).filter(Boolean).sort(function(a, b){ return a.m - b.m; });
  var cpiAt = function(m){
    if(!cpts.length) return Math.pow(1 + cf, m / 12);
    var p = null; for(var j = 0; j < cpts.length && cpts[j].m <= m; j++) p = cpts[j];
    return p ? p.v * Math.pow(1 + cf, (m - p.m) / 12) : cpts[0].v / Math.pow(1 + cf, (cpts[0].m - m) / 12);
  };
  (s.leases || []).forEach(function(L, ti){
    var sf = num(L && L.sf); if(!(sf > 0)) return;
    var ov = L.over && typeof L.over === 'object' ? L.over : {};
    var p = Math.max(0, Math.min(1, pick(ov.renewalProbability, num(RA.renewalProbability)))), down = Math.max(0, Math.round(pick(ov.downtimeMonths, num(RA.downtimeMonths))));
    var tiN = pick(ov.tiNewPerSF, num(RA.tiNewPerSF)), tiR = pick(ov.tiRenewalPerSF, num(RA.tiRenewalPerSF)), lcN = pick(ov.lcNewPct, num(RA.lcNewPct)), lcR = pick(ov.lcRenewalPct, num(RA.lcRenewalPct));
    var termN = Math.max(1, Math.round(pick(ov.termNew, M.termNew))), termR = Math.max(1, Math.round(pick(ov.termRenew, M.termRenew))), freeN = Math.max(0, Math.round(pick(ov.freeNew, M.freeNew))), freeR = Math.max(0, Math.round(pick(ov.freeRenew, M.freeRenew)));
    var rent = num(L.rent), mkt = num(L.mkt) > 0 ? num(L.mkt) : rent, startD = bkParseDealDate(L.start, null), endD = bkParseDealDate(L.end, null);
    var rtype = REC_TYPES.indexOf(L.recType) >= 0 ? L.recType : 'NNN', rfix = num(L.recFixed), rstop = num(L.recStop), cap = Math.max(0, num(L.recCap));
    /* what the tenant pays toward each expense line: the lease's stated shares when it has any, else its area share of the market pool */
    var shares = L.recShares && typeof L.recShares === 'object' ? L.recShares : {}, wk = {};
    Object.keys(shares).forEach(function(k){ if(has(shares[k]) && Number(shares[k]) > 0) wk[k] = Math.min(1, Number(shares[k])); });
    if(!Object.keys(wk).length) M.recoverable.forEach(function(k){ wk[k] = sf / bsf; });
    var steps = (Array.isArray(L.steps) ? L.steps : []).map(function(x){ var m = /^(\d{4})-(\d{1,2})/.exec(String(x && x.month || '')); return m && has(x.rent) ? { m:(Number(m[1]) - cy) * 12 + (Number(m[2]) - cm) + 1, r:Number(x.rent) } : null; }).filter(Boolean).sort(function(a, b){ return a.m - b.m; });
    var tn = { i:ti, name:String(L.tenant || L.suite || ('Tenant ' + (ti + 1))), sf:sf, p:p };
    tenants.push(tn);
    var rtypeRoll = REC_TYPES.indexOf(L.recRoll) >= 0 ? L.recRoll : rtype;
    /* the cap is a term of today's lease; it carries into rolled leases only when recoveries stay "same as today" */
    var base = function(seg){ seg.t = ti; seg.sf = sf; seg.rtype = seg.kind === 'cur' ? rtype : rtypeRoll; seg.rfix = rfix; seg.rstop = rstop; seg.wk = wk; seg.cap = seg.kind === 'cur' || !L.recRoll ? cap : 0; seg.anc = seg.kind === 'cur' ? seg.ks : seg.a; segs.push(seg); return seg; };
    var aggRent = function(rent0, bump, term, free){ var t = 0; for(var j = free; j < term; j++) t += rent0 * Math.pow(1 + bump, Math.floor(j / 12)) * sf / 12; return t; };
    var market = function(a, w, kind){
      var term = kind === 'renew' ? termR : termN, free = kind === 'renew' ? freeR : freeN, rent0 = mkt * mf(a) * (kind === 'renew' ? num(M.renewPct) : 1), ti_ = (kind === 'renew' ? tiR : tiN) * sf * w, lc = (kind === 'renew' ? lcR : lcN) * aggRent(rent0, num(M.bump), term, free) * w;
      return base({ kind:kind, a:a, b:a + term - 1, w:w, rent0:rent0, bump:num(M.bump), free:free, fa:1, fb:1, base:a, ti:ti_, lc:lc, tiAt:a });
    };
    /* Rollover. Every expiry splits into a renewal (weight p) and a re-lease after the downtime (1 - p), and each new
       lease rolls again. Branches that reach the same expiry month - or start the same kind of lease in the same
       month - are merged by adding their weights, so the work grows with the horizon, not with 2^(number of rolls).
       Segment amounts are linear in the weight, so merging changes no result. */
    var roll = function(n0, w){
      var rollW = {}, segW = { renew:{}, 'new':{} }, add = function(o, k, v){ o[k] = (o[k] || 0) + v; };
      add(rollW, n0, w);
      for(var m = n0; m <= H; m++){
        var wm = rollW[m];
        if(wm >= 1e-6){ var wr = wm * p, wn = wm - wr;
          if(wr >= 1e-6) add(segW.renew, m, wr);
          if(wn >= 1e-6 && m + down <= H) add(segW['new'], m + down, wn); }
        ['renew', 'new'].forEach(function(kind){ var ws = segW[kind][m]; if(ws >= 1e-6){ var g = market(m, ws, kind); add(rollW, g.b + 1, ws); } });
      }
    };
    var occupied = String(L.status) !== 'Vacant' && (rent > 0 || endD);
    if(!occupied){ var a0 = 1 + Math.max(0, Math.round(pick(ov.vacantMonths, down))); if(a0 <= H){ var v = market(a0, 1, 'new'); roll(v.b + 1, 1); } issues.push({ t:ti, level:'info', msg:'Vacant at closing: leases up after ' + (a0 - 1) + ' months at market.' }); return; }
    var ks = startD ? idx(startD) : -9999, E = endD ? idx(endD) : H + 9999;
    /* annual bumps need a lease anniversary: without a start date they fall on closing anniversaries (month 13, 25, ...) */
    var anchor = startD ? ks : 1;
    if(!startD && num(L.bump) && !steps.length && L.esc !== 'cpi') issues.push({ t:ti, level:'check', msg:'No lease start date: annual bumps are assumed on closing anniversaries.' });
    if(!endD) issues.push({ t:ti, level:'check', msg:'No lease end date: the lease is assumed to run through the analysis.' });
    if(E < 1){ issues.push({ t:ti, level:'check', msg:'The lease ended before closing: treated as rolling at closing.' }); roll(1, 1); return; }
    var dim = endD ? new Date(endD.getFullYear(), endD.getMonth() + 1, 0).getDate() : 1, fb = endD ? endD.getDate() / dim : 1;
    var fa = 1; if(startD && ks >= 1){ var d1 = new Date(startD.getFullYear(), startD.getMonth() + 1, 0).getDate(); fa = (d1 - startD.getDate() + 1) / d1; }
    /* CPI escalation: on each anniversary A the rent rises by the greater of the floor (the bump field) and the CPI change over
       the 12 months ending lag months before A (lag 1: the month before the lease year starts), optionally capped */
    var cpi = L.esc === 'cpi' && !steps.length, lag = Math.max(0, Math.round(pick(L.cpiLag, 1))), cpiCap = has(L.cpiCap) ? Number(L.cpiCap) : null;
    var cpiCh = cpi ? function(A){ return cpiAt(A - lag) / cpiAt(A - lag - 12) - 1; } : null;
    if(cpi && !startD) issues.push({ t:ti, level:'check', msg:'CPI increases with no lease start date: assumed on closing anniversaries.' });
    base({ kind:'cur', a:ks, b:E, w:1, rent0:rent, steps:steps, bump:num(L.bump), cpiCh:cpiCh, cpiCap:cpiCap, ks:anchor, free:0, fa:fa, fb:fb, base:Math.max(1, L.baseYear ? idx(new Date(Number(L.baseYear), 0, 1)) : ks), ti:0, lc:0, tiAt:0 });
    roll(E + 1, 1);
  });
  return { segs:segs, tenants:tenants, issues:issues, hold:hold, H:H, bsf:bsf, M:M, mf:mf, idx:idx, closing:cd };
}
function struct(s){
  var key = JSON.stringify([s.leases, s.leaseMkt, s.rolloverAssumptions, s.closing, s.holdYears, s.commercialRentGrowth, s.growthCurves && s.growthCurves.commercial, s.gsf, typeof bkConventions === 'function' ? bkConventions(s).cvRentGrowthStart : '', s.dealType]);
  if(cache.key === key) return cache.val;
  var v = build(s); cache = { key:key, val:v }; return v;
}
function curRent(g, m){
  if(g.steps && g.steps.length){ var r = g.rent0; g.steps.forEach(function(x){ if(x.m <= m) r = x.r; }); return r; }
  /* bumps fall on anniversaries ks+12, ks+24, ... that are in month 2 or later and on or before m (counted, not looped) */
  var kmin = Math.max(1, Math.ceil((2 - g.ks) / 12)), kmax = Math.floor((m - g.ks) / 12);
  if(g.cpiCh){
    var memo = g.cpiMemo || (g.cpiMemo = {}), r0 = g.rent0;
    for(var k = kmin; k <= kmax; k++){ if(memo[k] === undefined){ var inc = Math.max(g.bump, g.cpiCh(g.ks + 12 * k)); if(g.cpiCap !== null) inc = Math.min(g.cpiCap, inc); memo[k] = inc; } r0 *= 1 + memo[k]; }
    return r0;
  }
  if(!g.bump) return g.rent0;
  var nb = Math.max(0, kmax - kmin + 1);
  return g.rent0 * Math.pow(1 + g.bump, nb);
}
/* Month-by-month result for months 1..months. fac = { tax(year), opex(month) } growth factors on the recoverable pool (identity for a Year 1 statement). detail adds per-tenant arrays. */
window.bkLeaseEval = function(s, months, fac, detail){
  s = s || bkLoad(); var S = struct(s), segs = S.segs; fac = fac || {}; var fT = fac.tax || function(){ return 1; }, fO = fac.opex || function(){ return 1; };
  var z = function(){ return new Array(months).fill(0); }, out = { rent:z(), free:z(), rec:z(), occ:z(), ti:z(), lc:z(), tenants:S.tenants, issues:S.issues, struct:S };
  if(detail) out.byT = S.tenants.map(function(){ return { rent:z(), free:z(), rec:z(), cost:z(), occ:z() }; });
  var tix = S.tenants.map(function(x){ return x.i; }), Tof = function(g){ return detail ? out.byT[tix.indexOf(g.t)] : null; };
  var fracOf = function(g, m){ return (m === g.a && g.kind === 'cur' ? g.fa : 1) * (m === g.b && g.kind === 'cur' ? g.fb : 1); };
  /* pass 1: rent, free rent, occupancy and leasing costs */
  segs.forEach(function(g){
    var lo = Math.max(g.a, 1), hi = Math.min(g.b, months), T = Tof(g);
    for(var m = lo; m <= hi; m++){
      var frac = fracOf(g, m);
      var psf = g.kind === 'cur' ? curRent(g, m) : g.rent0 * Math.pow(1 + g.bump, Math.floor((m - g.a) / 12)), r = g.sf * psf / 12 * g.w * frac, fr = 0;
      if(g.kind !== 'cur' && m - g.a < g.free){ fr = r; r = 0; }
      var oc = g.sf * g.w * frac;
      out.rent[m - 1] += r; out.free[m - 1] += fr; out.occ[m - 1] += oc;
      if(T){ T.rent[m - 1] += r; T.free[m - 1] += fr; T.occ[m - 1] += oc; }
    }
    if(g.tiAt >= 1 && g.tiAt <= months){ out.ti[g.tiAt - 1] += g.ti; out.lc[g.tiAt - 1] += g.lc; var T2 = Tof(g); if(T2) T2.cost[g.tiAt - 1] += g.ti + g.lc; }
  });
  var tot = S.tenants.reduce(function(t, x){ return t + x.sf; }, 0) || 1;
  out.occ = out.occ.map(function(v){ return v / tot; });
  /* pass 2: recoveries. Expense inputs are the cost at full occupancy; the variable share of every line but taxes and
     insurance falls with occupancy, as in the engine's own operating expenses. Gross-up bills the variable share as if
     occupancy were at least the gross-up level, so the default of 100% recovers on full-occupancy costs. */
  var cv = typeof bkConventions === 'function' ? bkConventions(s) : {}, c01 = function(v){ return Math.max(0, Math.min(1, Number(v))); };
  var vv = has(S.M.grossVar) ? c01(S.M.grossVar) : c01(num(cv.cvOpexVariablePct)), gu = has(S.M.grossUp) ? c01(S.M.grossUp) : 1, amtMemo = {};
  var amt = function(k, m){
    m = Math.max(1, Math.min(months, m)); var key = k + '|' + m; if(amtMemo[key] !== undefined) return amtMemo[key];
    var a = num(s[k]) / 12 * (k === 'taxes' ? fT(Math.ceil(m / 12)) : fO(m));
    if(FIXED_KEYS.indexOf(k) < 0) a *= (1 - vv) + vv * Math.max(out.occ[m - 1], gu);
    return (amtMemo[key] = a);
  };
  /* the tenant's billed expenses: [total, the part a cap applies to] */
  var tpool = function(g, m){ var t = 0, c = 0; for(var k in g.wk){ var a = g.wk[k] * amt(k, m); t += a; if(UNCAPPED_KEYS.indexOf(k) < 0) c += a; } return [t, c]; };
  segs.forEach(function(g){
    var lo = Math.max(g.a, 1), hi = Math.min(g.b, months), T = Tof(g); if(g.rtype === 'Gross' || hi < lo) return;
    /* a cap holds controllable expenses to the reference year's level grown at the cap rate, stepping on lease anniversaries (cumulative) */
    var ref = Math.max(1, g.rtype === 'BaseYear' ? g.base : g.a), c0 = g.cap > 0 ? tpool(g, ref)[1] : 0, bp = g.rtype === 'BaseYear' ? tpool(g, g.base)[0] : 0;
    for(var m = lo; m <= hi; m++){
      var rc;
      if(g.rtype === 'Fixed') rc = g.sf * g.rfix / 12 * fO(m);
      else {
        var p = tpool(g, m), bill = p[0];
        if(g.cap > 0 && m > ref){ var n = Math.floor((m - g.anc) / 12) - Math.floor((ref - g.anc) / 12); bill = p[0] - p[1] + Math.min(p[1], c0 * Math.pow(1 + g.cap, Math.max(0, n))); }
        rc = g.rtype === 'BaseYear' ? Math.max(0, bill - bp) : g.rtype === 'Stop' ? Math.max(0, bill - g.sf * g.rstop / 12) : bill;
      }
      rc *= g.w * fracOf(g, m); out.rec[m - 1] += rc; if(T) T.rec[m - 1] += rc;
    }
  });
  /* GENERAL VACANCY ALLOWANCE. The deal's commercial vacancy rate is a floor on retail vacancy, reduced by the vacancy the
     tenant schedule already carries (downtime between leases, vacant suites): only the excess is an extra loss. This is
     the conventional treatment, and it is what makes downside and sensitivity cases that raise the commercial vacancy
     rate stress a lease-by-lease deal. Potential income is income from occupied space grossed up to 100% occupancy. */
  var gv = Math.max(0, Math.min(1, num(s.commercialVacancy)));
  /* POTENTIAL retail income: rent (including abated free rent) and recoveries on the whole schedule at full occupancy.
     The schedule prices only occupied space, so potential is occupied income grossed up by occupancy; a month with the
     whole schedule dark carries the last known potential forward. */
  var lastP = 0;
  out.potential = out.occ.map(function(o, i){ if(o > 0) lastP = (out.rent[i] + out.free[i] + out.rec[i]) / o; return lastP; });
  out.genVac = out.occ.map(function(o, i){
    if(!(gv > 0) || !(o > 0)) return 0;
    var extra = gv - (1 - o); if(!(extra > 0)) return 0;
    return extra * out.potential[i];
  });
  out.genVacRate = gv; if(detail) out.byT.forEach(function(T, i){ var sf = S.tenants[i].sf; T.occ = T.occ.map(function(v){ return v / sf; }); });
  out.creditLoss = Math.max(0, Math.min(1, num(S.M.creditLoss)));
  return out;
};
/* TI and LC by month for the hold, used as capital items */
window.bkLeaseCosts = function(s, months){
  s = s || bkLoad(); var S = struct(s), ti = new Array(months).fill(0), lc = new Array(months).fill(0);
  S.segs.forEach(function(g){ if(g.tiAt >= 1 && g.tiAt <= months){ ti[g.tiAt - 1] += g.ti; lc[g.tiAt - 1] += g.lc; } });
  return { ti:ti, lc:lc };
};
/* first-year statement for bkCalc: rent after free rent, recoveries on a flat pool. The flat pool is deliberate: the
   statement holds every expense at its Year-1 input, so recoveries must be measured against those same figures. Under
   the standard growth convention (from Year 2) the monthly engine's Year 1 is also flat and the two agree exactly; under
   the legacy month-1 convention every line of the monthly Year 1, recoveries included, is above the statement by design. */
window.bkLeaseYear1 = function(s){ var e = bkLeaseEval(s, 12, null, false), t = function(a){ return a.reduce(function(x, v){ return x + v; }, 0); }; return { rent:t(e.rent), rec:t(e.rec), free:t(e.free), occ:t(e.occ) / 12, creditLoss:e.creditLoss, genVac:t(e.genVac) }; };
/* summary used by the editor and the reports */
window.bkLeaseSummary = function(s){
  s = s || bkLoad(); var S = struct(s), H = S.hold, tot = S.tenants.reduce(function(t, x){ return t + x.sf; }, 0), openEnded = 0, occ0 = 0, walt = 0, inpl = 0, mktv = 0, byYear = {};
  (s.leases || []).forEach(function(L){
    var sf = num(L && L.sf); if(!(sf > 0)) return; var occupied = String(L.status) !== 'Vacant' && (num(L.rent) > 0 || L.end); if(!occupied) return;
    /* a lease with no end date is assumed to run through the analysis, so it counts to the end of the hold */
    var e = bkParseDealDate(L.end, null), E = e ? S.idx(e) : H; if(!e) openEnded++; occ0 += sf; inpl += sf * num(L.rent); mktv += sf * (num(L.mkt) > 0 ? num(L.mkt) : num(L.rent));
    var yrs = Math.max(0, E / 12); walt += sf * yrs; if(e){ var y = Math.max(1, Math.ceil(Math.max(E, 1) / 12)); byYear[y] = (byYear[y] || 0) + sf; }
  });
  return { sf:tot, occSF:occ0, occPct:tot ? occ0 / tot : 0, walt:occ0 ? walt / occ0 : 0, inPlacePsf:occ0 ? inpl / occ0 : 0, marketPsf:occ0 ? mktv / occ0 : 0, byYear:byYear, hold:H / 12, openEnded:openEnded };
};
/* build tenants from the commercial rows of the unit rent roll (rents there are monthly dollars per suite) */
window.bkLeaseFromRentRoll = function(s){
  var rr = (Array.isArray(s.rentRoll) ? s.rentRoll : []).filter(function(u){ return u.tenantType === 'Commercial'; }), RA = bkLeaseMarket(s).RA;
  return rr.map(function(u){
    var sf = num(u.sf), occ = u.status === 'Occupied', psf = function(m){ return sf > 0 ? Math.round(num(m) * 12 / sf * 100) / 100 : 0; }, rec = psf(u.recovery);
    var L = { tenant:String(u.unitId || ''), suite:String(u.unitId || ''), sf:sf, status:occ ? 'Occupied' : 'Vacant', start:u.leaseStart || '', end:u.leaseEnd || '', rent:occ ? psf(u.inPlaceRent) : 0, bump:0, mkt:psf(u.marketRent), recType:!occ ? 'NNN' : rec > 0 ? 'Fixed' : 'Gross', recFixed:occ ? rec : 0 };
    if(u.rolloverOverride && typeof u.rolloverOverride === 'object') L.over = Object.assign({}, u.rolloverOverride);
    return L;
  });
};
})();
