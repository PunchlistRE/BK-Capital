/* ===========================================================================
   TENANT-LEVEL COMMERCIAL LEASES IN A DEVELOPMENT DEAL. With the commercial lease model switched on, a development deal's retail comes from the tenant schedule
   (each tenant's rent, term, steps, recovery type, free rent, downtime, TI and LC), on a lease clock that starts the month after completion.
   The development engine keeps its own stabilised-NOI path (grown at the NOI growth rate). The tenant schedule is added to it as a difference: from stabilisation,
   each month's NOI is the growth path less the retail it assumes plus the retail the schedule actually earns (rent after free rent, recoveries, vacancy, credit
   loss, less the management fee on that income). During lease-up the retail inside the ramp is replaced the same way. Tenant improvements and leasing
   commissions are capital in the month they fall, and the exit value reads the same NOI. Nothing changes for a deal without a tenant schedule.
   =========================================================================== */
(function(){
'use strict';
if(typeof bkLoad !== 'function' || typeof window.bkLeaseOn !== 'function') return;
function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
function isDev(s){ return /develop/i.test(String((s && s.dealType) || '')); }
function leaseNet(LM, k){ var i = k - 1; if(i < 0 || i >= LM.rent.length) return 0; return (LM.rent[i] + LM.rec[i] - LM.genVac[i]) * (1 - LM.creditLoss); }

/* the lease clock, evaluated once per call: LM (monthly schedule), costs, and the retail the stabilised path already contains */
function ctx(s, x){
  if(!isDev(s) || !window.bkLeaseOn(s)) return null;
  var co = num(x.co) || (Math.round(num(s.predevMonths)) + Math.round(num(s.constructionMonths))), hold = Math.max(1, Math.round(num(s.holdYears) * 12)), N = Math.max(12, hold - co + 12);
  var cv = typeof bkConventions === 'function' ? bkConventions(s) : {}, gE = cv.cvRentGrowthStart === 'month1' ? function(m){ return m / 12; } : function(m){ return Math.ceil(m / 12) - 1; };
  var tg = num(s.taxGrowth), og = num(s.opexGrowth);
  var LM = bkLeaseEval(s, N, { tax:function(y){ return Math.pow(1 + tg, y - 1); }, opex:function(m){ return Math.pow(1 + og, gE(m)); } }, true), LC = bkLeaseCosts(s, N), c = bkCalc();
  return { s:s, x:x, co:co, LM:LM, LC:LC, base:num(c.netComm), mg:num(s.mgmtPct), g:num(s.noiGrowth || s.rentGrowth) };
}
window.bkDevLeaseHooks = function(s, x){
  var C = ctx(s, x); if(!C) return null;
  return {
    /* NOI change from the tenant schedule in month mo (after stabilisation): schedule retail less the retail inside the growth path, net of the management fee */
    delta:function(mo){ var k = mo - C.co; if(k < 1) return 0; var yr = Math.max(1, Math.ceil((mo - C.x.stab + 1) / 12)); return (leaseNet(C.LM, k) - C.base * Math.pow(1 + C.g, yr - 1) / 12) * (1 - C.mg); },
    cap:function(mo){ var k = mo - C.co; if(k < 1 || k > C.LC.ti.length) return 0; return C.LC.ti[k - 1] + C.LC.lc[k - 1]; },
    ctx:C
  };
};

/* the lease-up ramp: the retail inside each month's income (the stabilised retail, scaled by the project's occupancy) is replaced by what the tenants pay */
var prev = window.bkDevLeaseupRamp;
window.bkDevLeaseupRamp = function(s, co, stab, luMo){
  var r = prev(s, co, stab, luMo); if(!isDev(s) || !window.bkLeaseOn(s) || !r.months || !r.months.length) return r;
  var C = ctx(s, { co:co, stab:stab, luMo:luMo }); if(!C) return r; var mg = C.mg;
  r.months.forEach(function(m){ var k = m.mo - co, f = m.f !== undefined ? m.f : m.occ, d = (k >= 1 ? leaseNet(C.LM, k) : 0) - C.base * f / 12, dn = d * (1 - mg);
    m.egi += d; m.noi += dn; m.after += dn; m.retail = k >= 1 ? leaseNet(C.LM, k) : 0; });
  r.leaseDef = Math.max(0, -r.months.reduce(function(a, m){ return a + m.after; }, 0));
  return r;
};
})();
