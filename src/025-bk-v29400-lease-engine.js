/* COMMERCIAL LEASE MODEL. A tenant-by-tenant projection of commercial income, used in place of the flat retail line when `commLeaseModel` is on and `leases` has tenants.
   Each tenant carries the lease in place (rent per SF with annual bumps or dated steps, expiry, recovery type). At expiry the space renews with the renewal probability, or goes dark for the
   downtime and re-leases at market; both outcomes are carried as probability-weighted branches, and each new lease rolls again until the end of the horizon. Free rent, tenant improvements and
   leasing commissions follow the new lease. Recoveries are the tenant's pro-rata share of the recoverable expense pool. TI and LC are capital below NOI (they reduce cash flow, not NOI).
   Rolled leases use market rent grown at the commercial rent growth. Not modeled: expense gross-up for vacancy, expense caps and stops other than base year, percentage rent, and inflation on TI and LC. */
(function(){
'use strict';
function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
function has(v){ return v !== null && v !== undefined && v !== '' && isFinite(Number(v)); }
function pick(a, b){ return has(a) ? Number(a) : b; }
function isDevDeal(s){ return /develop/i.test(String(s && s.dealType || '')); }
var DEF_POOL = ['taxes', 'insurance', 'utilities', 'rm', 'contract'];
window.BK_LEASE_POOL_KEYS = [['taxes', 'Real estate taxes'], ['insurance', 'Insurance'], ['utilities', 'Utilities'], ['rm', 'Repairs and maintenance'], ['contract', 'Contract services'], ['payroll', 'Payroll'], ['ga', 'General and administrative'], ['marketing', 'Marketing']];
window.bkLeaseOn = function(s){ s = s || bkLoad(); return !!(s && s.commLeaseModel === true && Array.isArray(s.leases) && s.leases.length && !isDevDeal(s)); };
window.bkLeaseMarket = function(s){
  var M = Object.assign({ growth:null, bump:0.03, termNew:60, termRenew:60, freeNew:3, freeRenew:0, renewPct:1, creditLoss:0, recoverable:DEF_POOL }, (s && s.leaseMkt) || {});
  if(!Array.isArray(M.recoverable)) M.recoverable = DEF_POOL;
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
  (s.leases || []).forEach(function(L, ti){
    var sf = num(L && L.sf); if(!(sf > 0)) return;
    var ov = L.over && typeof L.over === 'object' ? L.over : {};
    var p = Math.max(0, Math.min(1, pick(ov.renewalProbability, num(RA.renewalProbability)))), down = Math.max(0, Math.round(pick(ov.downtimeMonths, num(RA.downtimeMonths))));
    var tiN = pick(ov.tiNewPerSF, num(RA.tiNewPerSF)), tiR = pick(ov.tiRenewalPerSF, num(RA.tiRenewalPerSF)), lcN = pick(ov.lcNewPct, num(RA.lcNewPct)), lcR = pick(ov.lcRenewalPct, num(RA.lcRenewalPct));
    var termN = Math.max(1, Math.round(pick(ov.termNew, M.termNew))), termR = Math.max(1, Math.round(pick(ov.termRenew, M.termRenew))), freeN = Math.max(0, Math.round(pick(ov.freeNew, M.freeNew))), freeR = Math.max(0, Math.round(pick(ov.freeRenew, M.freeRenew)));
    var rent = num(L.rent), mkt = num(L.mkt) > 0 ? num(L.mkt) : rent, startD = bkParseDealDate(L.start, null), endD = bkParseDealDate(L.end, null);
    var rtype = ['NNN', 'Gross', 'BaseYear', 'Fixed'].indexOf(L.recType) >= 0 ? L.recType : 'NNN', rfix = num(L.recFixed);
    var steps = (Array.isArray(L.steps) ? L.steps : []).map(function(x){ var m = /^(\d{4})-(\d{1,2})/.exec(String(x && x.month || '')); return m && has(x.rent) ? { m:(Number(m[1]) - cy) * 12 + (Number(m[2]) - cm) + 1, r:Number(x.rent) } : null; }).filter(Boolean).sort(function(a, b){ return a.m - b.m; });
    var tn = { i:ti, name:String(L.tenant || L.suite || ('Tenant ' + (ti + 1))), sf:sf, p:p };
    tenants.push(tn);
    var rtypeRoll = ['NNN', 'Gross', 'BaseYear', 'Fixed'].indexOf(L.recRoll) >= 0 ? L.recRoll : rtype;
    var base = function(seg){ seg.t = ti; seg.sf = sf; seg.rtype = seg.kind === 'cur' ? rtype : rtypeRoll; seg.rfix = rfix; segs.push(seg); return seg; };
    var aggRent = function(rent0, bump, term, free){ var t = 0; for(var j = free; j < term; j++) t += rent0 * Math.pow(1 + bump, Math.floor(j / 12)) * sf / 12; return t; };
    var market = function(a, w, kind){
      var term = kind === 'renew' ? termR : termN, free = kind === 'renew' ? freeR : freeN, rent0 = mkt * mf(a) * (kind === 'renew' ? num(M.renewPct) : 1), ti_ = (kind === 'renew' ? tiR : tiN) * sf * w, lc = (kind === 'renew' ? lcR : lcN) * aggRent(rent0, num(M.bump), term, free) * w;
      return base({ kind:kind, a:a, b:a + term - 1, w:w, rent0:rent0, bump:num(M.bump), free:free, fa:1, fb:1, base:a, ti:ti_, lc:lc, tiAt:a });
    };
    var roll = function(n0, w){
      if(n0 > H || w < 1e-6) return;
      var wr = w * p, wn = w - wr;
      if(wr >= 1e-6){ var r = market(n0, wr, 'renew'); roll(r.b + 1, wr); }
      if(wn >= 1e-6){ var a = n0 + down; if(a <= H){ var nw = market(a, wn, 'new'); roll(nw.b + 1, wn); } }
    };
    var occupied = String(L.status) !== 'Vacant' && (rent > 0 || endD);
    if(!occupied){ var a0 = 1 + Math.max(0, Math.round(pick(ov.vacantMonths, down))); if(a0 <= H){ var v = market(a0, 1, 'new'); roll(v.b + 1, 1); } issues.push({ t:ti, level:'info', msg:'Vacant at closing: leases up after ' + (a0 - 1) + ' months at market.' }); return; }
    var ks = startD ? idx(startD) : -9999, E = endD ? idx(endD) : H + 9999;
    if(!endD) issues.push({ t:ti, level:'check', msg:'No lease end date: the lease is assumed to run through the analysis.' });
    if(E < 1){ issues.push({ t:ti, level:'check', msg:'The lease ended before closing: treated as rolling at closing.' }); roll(1, 1); return; }
    var dim = endD ? new Date(endD.getFullYear(), endD.getMonth() + 1, 0).getDate() : 1, fb = endD ? endD.getDate() / dim : 1;
    var fa = 1; if(startD && ks >= 1){ var d1 = new Date(startD.getFullYear(), startD.getMonth() + 1, 0).getDate(); fa = (d1 - startD.getDate() + 1) / d1; }
    base({ kind:'cur', a:ks, b:E, w:1, rent0:rent, steps:steps, bump:num(L.bump), ks:ks, free:0, fa:fa, fb:fb, base:Math.max(1, L.baseYear ? idx(new Date(Number(L.baseYear), 0, 1)) : ks), ti:0, lc:0, tiAt:0 });
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
  var nb = 0; if(g.bump) for(var a = g.ks + 12; a <= m; a += 12) if(a >= 2) nb++;
  return g.rent0 * Math.pow(1 + g.bump, nb);
}
/* Month-by-month result for months 1..months. fac = { tax(year), opex(month) } growth factors on the recoverable pool (identity for a Year 1 statement). detail adds per-tenant arrays. */
window.bkLeaseEval = function(s, months, fac, detail){
  s = s || bkLoad(); var S = struct(s), segs = S.segs; fac = fac || {}; var fT = fac.tax || function(){ return 1; }, fO = fac.opex || function(){ return 1; };
  var z = function(){ return new Array(months).fill(0); }, out = { rent:z(), free:z(), rec:z(), occ:z(), ti:z(), lc:z(), tenants:S.tenants, issues:S.issues, struct:S };
  var keys = S.M.recoverable, poolMemo = {};
  var pool = function(m){ m = Math.max(1, m); if(poolMemo[m] !== undefined) return poolMemo[m]; var t = 0; keys.forEach(function(k){ t += num(s[k]) / 12 * (k === 'taxes' ? fT(Math.ceil(m / 12)) : fO(m)); }); return (poolMemo[m] = t); };
  if(detail) out.byT = S.tenants.map(function(){ return { rent:z(), free:z(), rec:z(), cost:z(), occ:z() }; });
  var bsf = S.bsf;
  segs.forEach(function(g){
    var lo = Math.max(g.a, 1), hi = Math.min(g.b, months), share = g.sf / bsf, bp = g.rtype === 'BaseYear' ? pool(g.base) : 0, T = detail ? out.byT[S.tenants.map(function(x){ return x.i; }).indexOf(g.t)] : null;
    for(var m = lo; m <= hi; m++){
      var frac = (m === g.a && g.kind === 'cur' ? g.fa : 1) * (m === g.b && g.kind === 'cur' ? g.fb : 1);
      var psf = g.kind === 'cur' ? curRent(g, m) : g.rent0 * Math.pow(1 + g.bump, Math.floor((m - g.a) / 12)), r = g.sf * psf / 12 * g.w * frac, fr = 0;
      if(g.kind !== 'cur' && m - g.a < g.free){ fr = r; r = 0; }
      var rc = 0; if(g.rtype === 'NNN') rc = share * pool(m); else if(g.rtype === 'BaseYear') rc = share * Math.max(0, pool(m) - bp); else if(g.rtype === 'Fixed') rc = g.sf * g.rfix / 12 * fO(m);
      rc *= g.w * frac; var oc = g.sf * g.w * frac;
      out.rent[m - 1] += r; out.free[m - 1] += fr; out.rec[m - 1] += rc; out.occ[m - 1] += oc;
      if(T){ T.rent[m - 1] += r; T.free[m - 1] += fr; T.rec[m - 1] += rc; T.occ[m - 1] += oc; }
    }
    if(g.tiAt >= 1 && g.tiAt <= months){ out.ti[g.tiAt - 1] += g.ti; out.lc[g.tiAt - 1] += g.lc; if(T) T.cost[g.tiAt - 1] += g.ti + g.lc; }
  });
  var tot = S.tenants.reduce(function(t, x){ return t + x.sf; }, 0) || 1;
  out.occ = out.occ.map(function(v){ return v / tot; }); if(detail) out.byT.forEach(function(T, i){ var sf = S.tenants[i].sf; T.occ = T.occ.map(function(v){ return v / sf; }); });
  out.creditLoss = Math.max(0, Math.min(1, num(S.M.creditLoss)));
  return out;
};
/* TI and LC by month for the hold, used as capital items */
window.bkLeaseCosts = function(s, months){
  s = s || bkLoad(); var S = struct(s), ti = new Array(months).fill(0), lc = new Array(months).fill(0);
  S.segs.forEach(function(g){ if(g.tiAt >= 1 && g.tiAt <= months){ ti[g.tiAt - 1] += g.ti; lc[g.tiAt - 1] += g.lc; } });
  return { ti:ti, lc:lc };
};
/* first-year statement for bkCalc: rent after free rent, recoveries on a flat pool */
window.bkLeaseYear1 = function(s){ var e = bkLeaseEval(s, 12, null, false), t = function(a){ return a.reduce(function(x, v){ return x + v; }, 0); }; return { rent:t(e.rent), rec:t(e.rec), free:t(e.free), occ:t(e.occ) / 12, creditLoss:e.creditLoss }; };
/* summary used by the editor and the reports */
window.bkLeaseSummary = function(s){
  s = s || bkLoad(); var S = struct(s), H = S.hold, tot = S.tenants.reduce(function(t, x){ return t + x.sf; }, 0), occ0 = 0, walt = 0, inpl = 0, mktv = 0, byYear = {};
  (s.leases || []).forEach(function(L){
    var sf = num(L && L.sf); if(!(sf > 0)) return; var occupied = String(L.status) !== 'Vacant' && (num(L.rent) > 0 || L.end); if(!occupied) return;
    var e = bkParseDealDate(L.end, null), E = e ? S.idx(e) : 9999; occ0 += sf; inpl += sf * num(L.rent); mktv += sf * (num(L.mkt) > 0 ? num(L.mkt) : num(L.rent));
    var yrs = Math.max(0, Math.min(E, 9999) / 12); walt += sf * yrs; if(e){ var y = Math.max(1, Math.ceil(Math.max(E, 1) / 12)); byYear[y] = (byYear[y] || 0) + sf; }
  });
  return { sf:tot, occSF:occ0, occPct:tot ? occ0 / tot : 0, walt:occ0 ? walt / occ0 : 0, inPlacePsf:occ0 ? inpl / occ0 : 0, marketPsf:occ0 ? mktv / occ0 : 0, byYear:byYear, hold:H / 12 };
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
