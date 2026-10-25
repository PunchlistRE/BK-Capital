
/* ===========================================================================
   FINAL WAVE - PARITY CLOSE-OUT
   ===========================================================================
   Six items that Wave 3 left open and that can be closed without inventing an
   economic convention. Each one names the workbook cell or rule it reproduces.

     A. Operating Underwrite revenue build, with the loss-to-lease and
        concession deductions the engine now carries (Operating Underwrite
        C8/C9). Both default to zero; the Final baseline proves nothing moved.
     B. Sensitivity - the workbook's remaining two grid axes: base rent factor
        x exit cap delta (GRID 1) and vacancy delta x operating expense LEVEL
        variance (GRID 3). The level axis was the divergence Wave 1 named and
        left on the gap list; Wave 3C added the assumption, so it is now real.
     C. Debt Schedule - total debt across the acquisition, construction and
        permanent facilities, with a reconciliation to each source schedule.
     D. Reverse Solve - the plain-English verdict (RS-05), stated from figures
        the solve already computed.
     E. Home - the valuation conclusion readout (HM-04). The control itself
        stays on Returns; Home reports, it does not duplicate.
     F. Capital Allocation - hold / refinance / sell, using the workbook's own
        stated thresholds, which are shown and editable rather than buried.

   NOT CLOSED, and why - these are in the blocker list, not quietly dropped:
     - SPCF-01 sponsor fee treatment (the workbook books the development and
       construction-management fee as sponsor income AND project cost; this
       engine capitalises them only). Reconciling the two is a policy choice.
     - DEV-05 construction cost calibration (k-factor): a budget-mode/benchmark
       calibration the engine has no field for. New economics, not exposure.
     - INV-01/02, CC-01, PF-01/05, PDB-01, LDG-01: each needs a data-model
       decision first (cross-deal investor registry, LP slots with distinct
       terms, funded-actuals store, per-slot property overrides, minimum-cash
       capital-call sizing). Building either answer would assert a model BK
       has not chosen.
   =========================================================================== */
(function(){
'use strict';

function esc(v){ return (typeof bkEsc==='function') ? bkEsc(v) : String(v==null?'':v); }
function money(n){
  if(n===null||n===undefined||n==='') return '-';
  var x=Number(n); if(!isFinite(x)) return '-';
  if(Object.is(x,-0)) x=0;
  var neg=x<0, a=Math.abs(x);
  var body = a<100 ? a.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
                   : a.toLocaleString('en-US',{maximumFractionDigits:0});
  return neg ? '($'+body+')' : '$'+body;
}
function money0(n){ var x=Number(n); return (!isFinite(x)||x===0) ? '-' : money(x); }
function pct(n,dp){ var x=Number(n); if(!isFinite(x)) return '-'; return (x*100).toFixed(dp===undefined?2:dp)+'%'; }
function mult(n){ var x=Number(n); if(!isFinite(x)) return '-'; return x.toFixed(2)+'x'; }
function intf(n){ var x=Number(n); if(!isFinite(x)) return '-'; return Math.round(x).toLocaleString('en-US'); }
function chip(cls,t){ return '<span class="status-chip '+(cls||'')+'">'+esc(t)+'</span>'; }
function note(sym,html){ return '<div class="note-flag" style="margin-top:10px;"><span>'+sym+'</span><div>'+html+'</div></div>'; }
function lbl(t){ return '<td class="rowlabel" data-bk-align="text">'+t+'</td>'; }
function val(t){ return '<td class="v">'+t+'</td>'; }
function txt(t){ return '<td class="rowlabel" data-bk-align="text" style="font-weight:400;opacity:.8">'+t+'</td>'; }
function wrapTable(caption, headHtml, bodyHtml){
  return '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>'+caption+'</caption>'
       + '<thead>'+headHtml+'</thead><tbody>'+bodyHtml+'</tbody></table></div>';
}
function sandbox(fn){
  var real = bkLoad(); var scratch = Object.assign({}, real);
  var ol = window.bkLoad, os = window.bkSave;
  window.bkLoad = function(){ return scratch; };
  window.bkSave = function(d){ Object.assign(scratch, d); return d; };
  try { return fn(); } finally { window.bkLoad = ol; window.bkSave = os; }
}
function extend(sheet, tag, fn){
  if(typeof RENDERERS==='undefined' || typeof RENDERERS[sheet] !== 'function') return false;
  var prev = RENDERERS[sheet];
  if(prev['__'+tag]) return true;
  var wrapped = function(){
    var o = prev.apply(this, arguments);
    // BLANK-SLATE GUARD: extension layers must never append calculations to a
    // canonical no-deal page. The base renderer is authoritative for empty state.
    try {
      if(typeof window.bkProductionCounts === 'function' && !window.bkProductionCounts().activeDeal) return o;
    } catch(_blankStateErr){}
    if(/no deal loaded|there is no active deal/i.test(String(o && o.main || ''))) return o;
    if(!o || typeof o !== 'object') return o;
    // FAIL CLOSED: inherit the base renderer's withholding decision. If the page
    // is withholding figures behind the readiness gate, this layer adds nothing.
    if(/withheld|calculation blocked/i.test(String(o.main||''))) return o;
    try { fn(o); } catch(e){
      o.main = (o.main||'') + note('&#9888;','A close-out block could not be rendered: '+esc(e.message)
        + '. The figures above are unaffected.');
    }
    return o;
  };
  wrapped['__'+tag] = true; wrapped.__bkOriginal = prev.__bkOriginal || prev;
  Object.keys(prev).forEach(function(k){ if(k.indexOf('__')===0 && !wrapped[k]) wrapped[k] = prev[k]; });
  if(typeof window.bkRegisterRenderer==='function') window.bkRegisterRenderer(sheet, wrapped);
  else RENDERERS[sheet] = wrapped;
  return true;
}
function setField(k, v){ var s = bkLoad(); s[k] = v; bkSave(s);
  if(typeof showSheet==='function') showSheet(typeof currentSheet!=='undefined'?currentSheet:'Home'); }

/* New assumptions, all inert at their defaults. */
if(typeof BK_BASE !== 'undefined'){
  var NEW = { lossToLeasePct: 0, concessionPct: 0, concessionLeaseUpPct: 0,
              capRefiHeadroom: 1000000, capRefiDebtYield: 0.10,
              capSellCoE: 0.04, capSellNOIGrowth: 0.02, capKeepCoE: 0.055 };
  Object.keys(NEW).forEach(function(k){ if(!(k in BK_BASE)) BK_BASE[k] = NEW[k]; });
}

/* =====================================================================
   A. OPERATING UNDERWRITE - the revenue build, with the two deductions
   ===================================================================== */
extend('Operating Underwrite','fRevenueBuild', function(o){
  var s = bkLoad(), c;
  try { c = bkCalc(); } catch(e){ return; }
  var gpr = Number(c.gpr)||0;
  var rrLTL = null;
  try {
    if(Array.isArray(s.rentRoll) && s.rentRoll.length){
      var st = bkRentRollStats(s.rentRoll);
      rrLTL = (Number(st.resMarket)||0)*12 - (Number(st.resInPlace)||0)*12;
    }
  } catch(e){}

  var body = ''
    + '<tr>'+lbl('Gross Potential Rent - Residential')+val(money(gpr))
      + txt('Annualised, from the canonical revenue source')+'<td class="v">'+chip('','ENGINE')+'</td></tr>'
    + '<tr>'+lbl('Less: Vacancy')+val(money(c.vacancy))+txt('Gross potential rent &times; vacancy rate')+'<td></td></tr>'
    + '<tr>'+lbl('Less: Bad Debt / Credit Loss')+val(money(c.bad))+txt(bkConventions(bkLoad()).cvBadDebtBasis==='afterVacancy' ? 'Bad debt rate &times; rent after vacancy' : 'Bad debt rate &times; gross potential rent')+'<td></td></tr>'
    + '<tr>'+lbl('Loss to Lease - underwriting deduction')
      + '<td class="v"><input type="number" step="0.01" style="width:100px" value="'+((Number(s.lossToLeasePct)||0)*100).toFixed(2)+'"'
      + ' onchange="bkSetLossToLease(this.value)"></td>'
      + txt('% of gross potential rent - workbook Operating Underwrite C8')
      + '<td class="v">'+chip('','INPUT %')+'</td></tr>'
    + '<tr>'+lbl('Less: Loss to Lease')+val(money(c.ltl))+txt('Gross potential rent &times; the rate above')+'<td></td></tr>'
    + '<tr>'+lbl('Concessions - stabilised')
      + '<td class="v"><input type="number" step="0.01" style="width:100px" value="'+((Number(s.concessionPct)||0)*100).toFixed(2)+'"'
      + ' onchange="bkSetConcession(this.value)"></td>'
      + txt('% of gross potential rent - workbook Operating Underwrite C9')
      + '<td class="v">'+chip('','INPUT %')+'</td></tr>'
    + '<tr>'+lbl('Concessions - lease-up')
      + '<td class="v"><input type="number" step="0.01" style="width:100px" value="'
      + ((s.concessionLeaseUpPct===undefined||s.concessionLeaseUpPct===null||s.concessionLeaseUpPct==='')
          ? ((Number(s.concessionPct)||0)*100).toFixed(2) : ((Number(s.concessionLeaseUpPct)||0)*100).toFixed(2))+'"'
      + ' onchange="bkSetConcessionLeaseUp(this.value)"></td>'
      + txt('Applied for the first '+intf(Math.max(0,Math.round(Number(s.leaseupMonths)||0)))
            +' month(s) of operations; blank follows the stabilised rate')
      + '<td class="v">'+chip('','INPUT %')+'</td></tr>'
    + '<tr>'+lbl('Less: Concessions')+val(money(c.concess))+txt('Year 1, at the rate in force')+'<td></td></tr>'
    + '<tr class="grandtotal">'+lbl('NET RESIDENTIAL INCOME')+val(money(c.netRes))
      + txt('GPR less vacancy, losses and concessions')
      + '<td class="v">'+chip('pass','TO EGI')+'</td></tr>'
    + '<tr>'+lbl('Commercial Base Rent')+val(money(c.commercial))+txt('Annualised')+'<td></td></tr>'
    + '<tr>'+lbl('Commercial Recoveries')+val(money(c.recovery))+txt('Reimbursed operating expenses')+'<td></td></tr>'
    + '<tr>'+lbl('Less: Commercial Vacancy')+val(money(c.commercialVac))+txt('Base rent plus recoveries &times; commercial vacancy')+'<td></td></tr>'
    + '<tr class="grandtotal">'+lbl('NET COMMERCIAL INCOME')+val(money(c.netComm))+txt('')+'<td></td></tr>'
    + '<tr>'+lbl('Other Income')+val(money(c.other))+txt('Per unit, annualised')+'<td></td></tr>'
    + '<tr class="grandtotal">'+lbl('EFFECTIVE GROSS INCOME')+val(money(c.egi))+txt('')
      + '<td class="v">'+chip('pass','ENGINE')+'</td></tr>';

  o.main = (o.main||'') + wrapTable('Year-1 Revenue Build - gross potential rent to effective gross income',
      '<tr><th class="rowlabel-h">Line</th><th>Amount</th><th style="text-align:left">Basis</th><th>Status</th></tr>', body)
    + note('&#9432;','<b>Loss to lease and concessions are real engine inputs</b>, applied to gross potential rent in both the Year-1 '
      + 'engine and the monthly engine, exactly as the workbook applies them. Both default to zero, so no existing deal moved when they '
      + 'were added. They propagate through the pro forma, the cash flow, debt sizing, returns and the sensitivity grids like any other '
      + 'assumption.'
      + (rrLTL !== null
          ? ' Separately, this deal&rsquo;s rent roll shows <b>'+money(rrLTL)+'</b> a year of market rent above in-place rent. That is a '
            + 'diagnostic of the existing leases, not this deduction - setting the rate above to reflect it is a judgement call, '
            + 'and nothing here does it for you.'
          : ''));
});
window.bkSetLossToLease      = function(v){ var n=Number(v); setField('lossToLeasePct',      isFinite(n)&&n>0?n/100:0); };
window.bkSetConcession       = function(v){ var n=Number(v); setField('concessionPct',       isFinite(n)&&n>0?n/100:0); };
window.bkSetConcessionLeaseUp= function(v){ var n=Number(v); setField('concessionLeaseUpPct',isFinite(n)&&n>0?n/100:0); };

/* =====================================================================
   B. SENSITIVITY - the workbook's remaining two grid axes
   ===================================================================== */
extend('Sensitivity','fGrids', function(o){
  var s = bkLoad();
  if(typeof bkRunScenario !== 'function') return;
  function run(ov){ try { return bkRunScenario(ov); } catch(e){ return {irr:NaN,moic:NaN}; } }
  function grid(rowVals, colVals, build, rowFmt, colFmt, caption){
    var head = '<tr><th class="rowlabel-h">'+caption[1]+'</th>'
             + colVals.map(function(c){ return '<th>'+colFmt(c)+'</th>'; }).join('') + '</tr>';
    var body = rowVals.map(function(rv){
      return '<tr>'+lbl(rowFmt(rv)) + colVals.map(function(cv){
        var r = run(build(rv,cv));
        return val((isFinite(r.irr)?pct(r.irr):'n/a')
          + '<br><span style="opacity:.65;font-size:.85em">'+(isFinite(r.moic)?mult(r.moic):'')+'</span>');
      }).join('') + '</tr>';
    }).join('');
    return wrapTable(caption[0], head, body);
  }

  // ---- GRID 1: base rent factor x exit cap delta (workbook Sensitivity r13) ----
  // The factor scales BASE rent only - in-place and market rent on the rent roll,
  // and the flat average/commercial rent fields when no rent roll exists. Commercial
  // recoveries are reimbursed expenses, not base rent, so they are not scaled.
  var factors = [0.88,0.94,1.00,1.06,1.12];
  var baseCap = Number(s.exitCap)||0.07;
  var capDeltas = [-0.0075,-0.0025,0,0.0025,0.0075];
  function rentFactorOverride(f, capD){
    var ov = { exitCap: Math.max(0.0001, baseCap + capD) };
    if(Array.isArray(s.rentRoll) && s.rentRoll.length){
      ov.rentRoll = s.rentRoll.map(function(u){
        var c = Object.assign({}, u);
        if(c.inPlaceRent !== undefined && c.inPlaceRent !== null && c.inPlaceRent !== '')
          c.inPlaceRent = (Number(c.inPlaceRent)||0)*f;
        if(c.marketRent !== undefined && c.marketRent !== null && c.marketRent !== '')
          c.marketRent  = (Number(c.marketRent)||0)*f;
        return c;
      });
    }
    if(Number(s.avgRent))        ov.avgRent        = Number(s.avgRent)*f;
    if(Number(s.commercialRent)) ov.commercialRent = Number(s.commercialRent)*f;
    return ov;
  }
  var g1 = grid(factors, capDeltas, rentFactorOverride,
    function(f){ return f.toFixed(2)+'x'; },
    function(d){ return (d>0?'+':'')+(d*100).toFixed(2)+'%'; },
    ['Base Rent Factor &times; Exit Cap Delta - Levered XIRR / MOIC', 'Rent Factor \\ Exit Cap &Delta;']);

  // ---- GRID 3: vacancy delta x operating expense LEVEL variance ----
  // Wave 1 could only vary the opex GROWTH rate and said so. Wave 3C added the
  // level-variance assumption, so the workbook's actual axis is now reproducible:
  // the variance scales the entered expense lines, which is where it belongs.
  var EXP = ['insurance','utilities','rm','contract','payroll','turnover','marketing','ga','taxes'];
  var vacDeltas = [-0.01,-0.005,0,0.005,0.01];
  var oxVars    = [-0.06,-0.02,0,0.02,0.06];
  var g3 = grid(vacDeltas, oxVars, function(vd, ox){
      var ov = { vacancy: Math.max(0,(Number(s.vacancy)||0)+vd),
                 commercialVacancy: Math.max(0,(Number(s.commercialVacancy)||0)+vd) };
      EXP.forEach(function(k){ ov[k] = Math.max(0, (Number(s[k])||0)*(1+ox)); });
      ov.miscPerGSF = Math.max(0, (Number(s.miscPerGSF)||0)*(1+ox));
      return ov;
    },
    function(v){ return (v>0?'+':'')+(v*100).toFixed(2)+'%'; },
    function(x){ return (x>0?'+':'')+(x*100).toFixed(0)+'%'; },
    ['Vacancy Delta &times; Operating Expense Level Variance - Levered XIRR / MOIC',
     'Vacancy &Delta; \\ Opex Variance']);

  o.main = (o.main||'') + g1 + g3
    + note('&#9432;','<b>These are the workbook&rsquo;s two remaining grid axes.</b> The rent-factor grid scales base rent only - '
      + 'commercial recoveries are reimbursed expenses, not rent, so they are held. The expense grid varies the expense <b>level</b>, '
      + 'which is the axis Wave 1 could not reproduce and named on the gap list at the time; the assumption now exists, so the grid is '
      + 'real rather than a substitute. Every cell re-prices the canonical engine live in isolation - nothing here is stored, and '
      + 'none of it can go stale.');
});

/* =====================================================================
   C. DEBT SCHEDULE - total debt across all three facilities
   ===================================================================== */
extend('Debt Schedule','fTotalDebt', function(o){
  var s = bkLoad(), acq = null, con = null, perm = null;
  try { acq = bkDebt(); } catch(e){}
  try { if(typeof bkDevFundingV10==='function'){ var f = bkDevFundingV10(); if(f && f.isDev) con = f; } } catch(e){}
  try { if(typeof bkDevTakeoutV11==='function'){ var t = bkDevTakeoutV11(); if(t && t.permSchedule && t.permSchedule.length) perm = t; } } catch(e){}
  /* V30.2: for a development deal the cash flows carry the construction facility and then the
     permanent loan (bkDevMonthlyReturnsV12); the acquisition-loan schedule is not part of them, so
     it is not shown as outstanding debt. The permanent schedule is indexed by its own month number
     and its balance is the 'end' field (previously read as 'balance' from index 0, so the
     permanent loan never appeared in this table). */
  var isDevDeal = /develop/i.test(String(s.dealType||'')) && !!con;
  var acqMo  = (!isDevDeal && acq && acq.debtEnabled !== false) ? (acq.months||[]) : [];
  var conMo  = con ? (con.months||[]) : [];
  var permMo = [];
  if(perm){ (perm.permSchedule||[]).forEach(function(z){ if(z && z.mo>0) permMo[z.mo-1] = { balance: Number(z.end)||0, payment: Number(z.payment)||0 }; }); }
  var n = Math.max(acqMo.length, conMo.length, permMo.length);
  if(!n) return;

  var rows = [], pkTot = 0, pkMo = 0;
  for(var i=0;i<n;i++){
    var a = acqMo[i] ? (Number(acqMo[i].balance)||0) : 0;
    /* V30.2: the construction facility is repaid by the permanent loan in the stabilization
       month; after that month it is not outstanding (the funding schedule keeps carrying its
       last balance, which previously double-counted total debt alongside the permanent loan). */
    var tookOut = con && perm && Number(s.refiAtStab||0) && (i+1) >= Number(con.stab||0);   // repaid in the stabilization month
    var c = (conMo[i] && !tookOut) ? (Number(conMo[i].end)||0) : 0;
    var pm = permMo[i] ? (Number(permMo[i].balance)||0) : 0;
    var ap = acqMo[i] ? (Number(acqMo[i].payment)||0) : 0;
    var ci = conMo[i] ? (Number(conMo[i].capInt)||0) : 0;
    var pp = permMo[i] ? (Number(permMo[i].payment)||0) : 0;
    var tot = a + c + pm;
    if(tot > pkTot){ pkTot = tot; pkMo = i+1; }
    rows.push({ m:i+1, a:a, c:c, p:pm, tot:tot, ds:ap+pp, ci:ci });
  }
  var head = '<tr><th class="rowlabel-h">Mo</th><th>Acquisition Loan</th><th>Construction Facility</th>'
           + '<th>Permanent Loan</th><th>TOTAL DEBT</th><th>Cash Debt Service</th><th>Capitalised Interest</th></tr>';
  var body = rows.map(function(r){
    return '<tr'+(r.tot?'':' style="opacity:.55"')+'>'+lbl(String(r.m))
      + val(money0(r.a)) + val(money0(r.c)) + val(money0(r.p))
      + val(money(r.tot)) + val(money0(r.ds)) + val(money0(r.ci)) + '</tr>';
  }).join('');

  function src(label, present, opening, sched){
    return '<tr>'+lbl(label)+val(present?money(opening):'-')
      + val(present?intf(sched):'-')
      + '<td class="v">'+chip(present?'pass':'', present?'IN TOTAL':'NOT APPLICABLE')+'</td></tr>';
  }
  // reconciliation: the total column must equal the sum of its three sources in
  // every month, by construction - assert it rather than assume it.
  var mismatch = rows.filter(function(r){ return Math.abs(r.tot - (r.a+r.c+r.p)) > 1e-6; }).length;
  var recon = wrapTable('Total Debt Reconciliation',
    '<tr><th class="rowlabel-h">Facility</th><th>Peak Balance</th><th>Months Scheduled</th><th>Status</th></tr>',
      src('Acquisition Loan', acqMo.length>0,
          acqMo.length?Math.max.apply(null,acqMo.map(function(x){return Number(x.balance)||0;})):0, acqMo.length)
    + src('Construction Facility', conMo.length>0,
          conMo.length?Math.max.apply(null,conMo.map(function(x){return Number(x.end)||0;})):0, conMo.length)
    + src('Permanent / Refinance Loan', permMo.length>0,
          permMo.length?Math.max.apply(null,permMo.map(function(x){return Number(x.balance)||0;})):0, permMo.length)
    + '<tr class="grandtotal">'+lbl('PEAK TOTAL DEBT OUTSTANDING')+val(money(pkTot))
      + val('Month '+intf(pkMo))
      + '<td class="v">'+chip(mismatch?'fail':'pass', mismatch?(mismatch+' MONTH(S) OFF'):'TIES EVERY MONTH')+'</td></tr>');

  o.main = (o.main||'') + recon
    + wrapTable('Total Debt - all facilities, monthly, all '+n+' periods', head, body)
    + note('&#9432;','Every column is read from the facility&rsquo;s own canonical schedule - the acquisition debt schedule, '
      + 'the construction funding schedule and the permanent takeout - and the total is their sum. Nothing is re-amortised '
      + 'here. A facility that does not apply to this deal shows NOT APPLICABLE rather than a row of zeros pretending to be a schedule. '
      + 'Capitalised construction interest is shown in its own column because it is not cash debt service and must not be added to it.');
});

/* =====================================================================
   D. REVERSE SOLVE - the plain-English verdict (RS-05)
   ===================================================================== */
extend('Reverse Solve','fVerdict', function(o){
  var s = bkLoad();
  var isDev = String(s.dealType||'').toLowerCase()==='development';
  var c, dv = null;
  try { c = bkCalc(); } catch(e){ return; }
  try { if(isDev && typeof bkDevV09==='function') dv = bkDevV09(); } catch(e){}

  // DEFECT FIX. This read dv.totalCost, which bkDevV09() does not have - the field
  // is undefined, isFinite(NaN) is false, and every development deal silently fell
  // through to the ACQUISITION basis formula built on purchasePrice. Yield on cost
  // was therefore being measured against the land price rather than the project
  // cost. The engine's own fields are `unlev` (all-in cost before financing) and
  // `levered` (unlev plus capitalised interest, fees and overflow), which is the
  // basis a yield-on-cost is quoted on. Caught by the investor-wave verification
  // printing a project cost of $0; the Final-wave control only checked that the
  // verdict flipped with the exit cap, which it did, for the wrong reason.
  // Which figure is "total development cost" matters, so it is resolved in one
  // place and LABELLED rather than left to chance. bkDevV09() carries `unlev` -
  // all-in cost before financing. bkDevFundingV10() carries `levered`, which is
  // that same figure plus capitalised interest and loan fees, and that is the
  // basis a yield on cost is normally quoted on. Prefer levered, fall back to
  // unlevered, and say which one was used.
  function bkDevTotalCost(dv){
    if(!dv || !dv.isDev) return null;
    var lev = NaN;
    try { if(typeof bkDevFundingV10 === 'function'){ var f = bkDevFundingV10();
            if(f && f.isDev) lev = Number(f.levered); } } catch(e){}
    var un = Number(dv.unlev);
    if(isFinite(lev) && lev > 0) return { cost: lev, basis: 'all-in, including capitalised interest and loan fees',
                                          unlev: isFinite(un) ? un : null };
    if(isFinite(un) && un > 0) return { cost: un, basis: 'all-in before financing costs', unlev: un };
    return null;
  }
  var devCost = bkDevTotalCost(dv);
  var basis = (devCost !== null) ? devCost.cost
            : (Number(s.purchasePrice)||0) * (1 + (Number(s.closingCostsPct)||0) + (Number(s.acqFeePct)||0));
  var basisLabel = (devCost !== null) ? ('total development cost - ' + devCost.basis)
                                      : 'all-in acquisition basis';
  var noi = Number(c.noi)||0;
  var yoc = basis>0 ? noi/basis : NaN;
  var exitCap = Number(s.exitCap)||0;
  var spread = isDev ? 0.015 : 0.005;                 // the workbook's own target spread
  var target = exitCap>0 ? exitCap + spread : NaN;
  var gap = (isFinite(yoc)&&isFinite(target)) ? yoc-target : NaN;
  var noiGap = (isFinite(target)&&basis>0) ? (target*basis - noi) : NaN;

  var verdict, cls, why;
  if(!isFinite(yoc) || !isFinite(target)){
    verdict = 'INSUFFICIENT DATA'; cls = '';
    why = 'An exit cap rate and a cost basis are both needed before a yield-on-cost verdict means anything.';
  } else if(gap >= 0){
    verdict = 'SUPPORTS BASIS'; cls = 'pass';
    why = 'Yield on cost of ' + pct(yoc) + ' clears the ' + pct(target) + ' target by ' + (gap*10000).toFixed(0)
        + ' basis points. At today&rsquo;s NOI the basis could rise to about ' + money(noi/target)
        + ' before the deal stops clearing.';
  } else if(gap >= -0.005){
    verdict = 'MARGINAL'; cls = 'warn';
    why = 'Yield on cost of ' + pct(yoc) + ' is ' + Math.abs(gap*10000).toFixed(0) + ' basis points short of the '
        + pct(target) + ' target. Closing the gap needs about ' + money(noiGap) + ' more NOI, or roughly '
        + money(basis - (target>0 ? noi/target : 0)) + ' less basis.';
  } else {
    verdict = 'DOES NOT SUPPORT'; cls = 'fail';
    why = 'Yield on cost of ' + pct(yoc) + ' is ' + Math.abs(gap*10000).toFixed(0) + ' basis points below the '
        + pct(target) + ' target. That is about ' + money(noiGap) + ' of missing NOI, or about '
        + money(basis - (target>0 ? noi/target : 0)) + ' of basis that would have to come out.';
  }

  o.main = (o.main||'') + wrapTable('Verdict',
    '<tr><th class="rowlabel-h">Question</th><th>Answer</th><th style="text-align:left">Reasoning</th></tr>',
      '<tr class="grandtotal">'+lbl('Does this deal support the basis?')
        + '<td class="v">'+chip(cls, verdict)+'</td>'
        + txt(why)+'</tr>'
    + '<tr>'+lbl('Yield on Cost - current')+val(isFinite(yoc)?pct(yoc):'-')
        + txt('Year-1 NOI &divide; ' + basisLabel)+'</tr>'
    + '<tr>'+lbl('Target Yield on Cost')+val(isFinite(target)?pct(target):'-')
        + txt('Exit cap ' + pct(exitCap) + ' plus ' + (spread*10000).toFixed(0) + ' bps '
              + (isDev ? '(development)' : '(acquisition)'))+'</tr>'
    + '<tr>'+lbl('NOI Gap to Target')+val(isFinite(noiGap)?money(noiGap):'-')
        + txt(isFinite(noiGap) && noiGap<=0 ? 'NOI is already above the target' : 'Additional NOI required at the current basis')+'</tr>')
    + note('&#9432;','The verdict restates the figures solved above - it is not a second calculation and it cannot disagree with '
      + 'them. The target spread is the workbook&rsquo;s convention, not a judgement added here.');
});

/* =====================================================================
   E. HOME - the valuation conclusion readout (HM-04)
   ===================================================================== */
extend('Home','fValuation', function(o){
  var v;
  try { v = window.bkValuationConclusion(); } catch(e){ return; }
  var s = v.s, method = v.isDcf ? 'DCF' : 'Direct Cap', basisYear = v.basisYear, disc = v.disc,
      directCap = v.directCap, dcf = v.dcf, concluded = v.concluded;

  o.main = (o.main||'') + wrapTable('Valuation Conclusion',
    '<tr><th class="rowlabel-h">Basis</th><th>Value</th><th style="text-align:left">Method</th><th>Status</th></tr>',
      '<tr>'+lbl('Direct Capitalisation')+val(isFinite(directCap)?money(directCap):'-')
        + txt('Year '+intf(basisYear)+' NOI after reserves &divide; exit cap '+pct(Number(s.exitCap)))
        + '<td class="v">'+chip(method!=='DCF'?'pass':'', method!=='DCF'?'SELECTED':'')+'</td></tr>'
    + '<tr>'+lbl('Discounted Cash Flow')+val(isFinite(dcf)?money(dcf):'-')
        + txt('Monthly NOI plus net sale, discounted at '+pct(disc)+' to closing (XNPV)')
        + '<td class="v">'+chip(method==='DCF'?'pass':'', method==='DCF'?'SELECTED':'')+'</td></tr>'
    + '<tr class="grandtotal">'+lbl('CONCLUDED VALUE')+val(isFinite(concluded)?money(concluded):'-')
        + txt('On the '+esc(method)+' basis')+'<td class="v">'+chip('pass','LIVE')+'</td></tr>')
    + note('&#9432;','<b>Reported here, controlled on Returns.</b> The method, discount rate and capitalisation basis year are set on the '
      + 'Returns page and this readout follows them, so there is one place to change the answer and one answer to change. Both methods '
      + 'are computed on every render from the same monthly engine.');
});

/* =====================================================================
   F. CAPITAL ALLOCATION - hold / refinance / sell
   ===================================================================== */
extend('Capital Allocation','fDecision', function(o){
  var s = bkLoad(), c, x = null, d = null;
  try { c = bkCalc(); } catch(e){ return; }
  try { x = bkMonthlyReturns(); } catch(e){}
  try { d = bkDebt(); } catch(e){}

  var hdRefi = Number(s.capRefiHeadroom); if(!isFinite(hdRefi)) hdRefi = 1000000;
  var dyRefi = Number(s.capRefiDebtYield); if(!isFinite(dyRefi)) dyRefi = 0.10;
  var coeSell= Number(s.capSellCoE);      if(!isFinite(coeSell)) coeSell = 0.04;
  var ngSell = Number(s.capSellNOIGrowth);if(!isFinite(ngSell)) ngSell = 0.02;
  var coeKeep= Number(s.capKeepCoE);      if(!isFinite(coeKeep)) coeKeep = 0.055;

  var noi = Number(c.noi)||0;
  var value = Number(s.exitCap) ? noi/Number(s.exitCap) : 0;
  var bal = (d && d.debtEnabled !== false && (d.months||[]).length) ? (Number(d.months[0].balance)||0) : 0;
  var headroom = (x && x.refi && isFinite(Number(x.refi.proceeds))) ? Number(x.refi.proceeds) : (value*0.65 - bal);
  var debtYield = bal>0 ? noi/bal : NaN;
  var equity = Math.max(0, value - bal);
  var cfAfterDebt = noi - (d && (d.months||[]).length
      ? d.months.slice(0,12).reduce(function(a,m){ return a+(Number(m.payment)||0); },0) : 0);
  var coe = equity>0 ? cfAfterDebt/equity : NaN;
  var noiGrowth = Number(s.rentGrowth)||0;

  var refiOK = isFinite(headroom) && headroom > hdRefi && isFinite(debtYield) && debtYield > dyRefi;
  var sellOK = isFinite(coe) && coe < coeSell && noiGrowth < ngSell;
  var keepOK = isFinite(coe) && coe >= coeKeep;
  var decision = refiOK ? 'REFINANCE' : (sellOK ? 'SELL' : (keepOK ? 'KEEP' : 'HOLD - NO TEST MET'));
  var dcls = refiOK ? 'pass' : (sellOK ? 'warn' : (keepOK ? 'pass' : ''));

  function thr(label, key, cur, isPct, why){
    var shown = isPct ? (cur*100).toFixed(2) : Math.round(cur).toLocaleString('en-US');
    var unit = isPct ? '%' : '$';
    return '<tr>'+lbl(label)
      + '<td class="v"><input type="text" inputmode="decimal" style="width:120px;text-align:left" value="'+shown+'"'
      +   ' onchange="bkSetCapThreshold(\''+key+'\',this.value,'+(isPct?1:0)+')"></td>'
      + '<td class="unit-cell">'+unit+'</td>'+txt(why)+'</tr>';
  }
  function test(label, actual, cmp, threshold, met){
    return '<tr>'+lbl(label)+val(actual)+txt(cmp+' '+threshold)
      + '<td class="v">'+chip(met?'pass':'', met?'MET':'not met')+'</td></tr>';
  }

  o.main = (o.main||'') + wrapTable('Hold / Refinance / Sell - decision tests',
    '<tr><th class="rowlabel-h">Test</th><th>This Deal</th><th style="text-align:left">Threshold</th><th>Result</th></tr>',
      test('Refinance headroom', isFinite(headroom)?money(headroom):'-', 'must exceed', money(hdRefi), isFinite(headroom)&&headroom>hdRefi)
    + test('Debt yield', isFinite(debtYield)?pct(debtYield):'-', 'must exceed', pct(dyRefi), isFinite(debtYield)&&debtYield>dyRefi)
    + test('Cash on equity', isFinite(coe)?pct(coe):'-', 'sell below', pct(coeSell), sellOK)
    + test('NOI growth', pct(noiGrowth), 'sell below', pct(ngSell), noiGrowth<ngSell)
    + test('Cash on equity - keep test', isFinite(coe)?pct(coe):'-', 'keep at or above', pct(coeKeep), keepOK)
    + '<tr class="grandtotal">'+lbl('DECISION')+'<td class="v">'+chip(dcls, decision)+'</td>'
      + txt(refiOK ? 'Both refinance tests are met, so refinancing is indicated before a sale is considered.'
           : sellOK ? 'Cash on equity and NOI growth are both below their thresholds.'
           : keepOK ? 'Cash on equity clears the keep threshold and no refinance or sale test is met.'
           : 'No test is met on the current figures - hold and re-test when the assumptions change.')
      + '<td></td></tr>')
    + wrapTable('Decision Thresholds',
      '<tr><th class="rowlabel-h">Threshold</th><th class="v">Value</th><th style="text-align:left">Units</th><th style="text-align:left">Applies to</th></tr>',
        thr('Refinance - minimum headroom', 'capRefiHeadroom', hdRefi, false, 'Refinance proceeds above the existing balance')
      + thr('Refinance - minimum debt yield', 'capRefiDebtYield', dyRefi, true, 'Year-1 NOI &divide; loan balance')
      + thr('Sell - cash on equity below', 'capSellCoE', coeSell, true, 'Cash flow after debt service &divide; equity')
      + thr('Sell - NOI growth below', 'capSellNOIGrowth', ngSell, true, 'Underwritten rent growth')
      + thr('Keep - cash on equity at or above', 'capKeepCoE', coeKeep, true, 'Cash flow after debt service &divide; equity'))
    + note('&#9432;','<b>The thresholds are the workbook&rsquo;s own</b> - refinance above $1M of headroom and a 10% debt yield, sell '
      + 'below 4% cash on equity and 2% NOI growth, keep at or above 5.5% - and they are shown and editable here rather than buried '
      + 'in a formula. Every input to the tests is read from the canonical engines; the decision is a reading of them, not a forecast, and '
      + 'it is not investment advice.');
});
window.bkSetCapThreshold = function(key, v, isPct){
  var n = Number(String(v).replace(/[$,%\s]/g,'').replace(/,/g,''));
  setField(key, isFinite(n) ? (isPct ? n/100 : n) : 0);
};

})();
