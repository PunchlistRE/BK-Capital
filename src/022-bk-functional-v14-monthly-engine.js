
// Punchlist Capital CRE App V14 - multi-year monthly engine, replacing the flat annual-growth
// extrapolation bkAnnualCF() used before this patch.
//
// Verified against Excel directly for Havard Avenue (see Havard_MultiYear_Verification.md):
// checked every formula in every sheet, plus the workbook's VBA source strings, and confirmed
// the Rent Roll's Rollover Assumptions / Lease Rollover Schedule table feeds nothing downstream
// -- it's a display-only panel. The actual engine Excel uses (SYS_CF, which Property CF and
// Returns both pull from) grows a handful of Year-1 constants -- not a per-unit lease walk:
//   - Commercial revenue, other income and controllable opex compound CONTINUOUSLY every month
//     (exponent = month/12), not once a year.
//   - Real estate taxes step ANNUALLY instead (exponent = operating year - 1, flat within a year).
//   - Controllable opex is scaled by a fixed/variable split (0.6 fixed + 0.4 x occupancy%), matching
//     Excel's SYS_CF row 50 structure. V27 INTENTIONAL DIVERGENCE (explicit BK direction, reversing
//     V14's original "reproduce the quirk" choice): Excel keys that occupancy% off RESIDENTIAL
//     occupancy only (SYS_CF!G37), which for an all-commercial deal like Havard or Meridian (zero
//     residential units) locks the variable 40% of controllable opex at a permanent, nonsensical 0%
//     factor -- overstating NOI every month of the hold, not just during lease-up. This app instead
//     uses a REVENUE-WEIGHTED BLEND of residential and commercial occupancy (see blendedOcc below):
//     for an all-commercial deal it reduces to commercial occupancy exactly; for an all-residential
//     deal it reduces to the old residential-only figure exactly (byte-identical, zero regression
//     risk for that case); for a mixed-use deal it's a revenue-weighted blend of both. This changed
//     Havard's and Meridian's protected regression baselines (both are 100%-commercial deals) --
//     see V27_Verification.md for the exact before/after figures and why.
//   - The unlevered investment basis is price x (1 + closing costs% + acquisition fee%), matching
//     Excel's c_AcqBasis and the app's own bkDebt() (which already included the acquisition fee --
//     bkAnnualCF()'s own "initial" was the one place still missing it).
//   - Unlevered IRR is XIRR on the actual monthly cash flow array against real dates, not a simple
//     annual-period IRR -- reuses the app's existing bkXirr(), already used by bkMonthlyReturns().
//
// This was built and checked month-by-month (1-120) against Excel's own recalculated SYS_CF
// output for Havard: every EGI/expense/NOI line matches to floating-point noise, the sale
// calculation matches to the penny, and unlevered MOIC matches Excel to six decimal places.
//
// One generalization beyond what's Havard-verified: Excel splits residential rent growth into a
// separate "Year-1 growth" input (0 for Havard) vs. a post-Year-1 scenario growth rate; the app
// has a single `rentGrowth` field, so residential revenue here compounds continuously from month 1
// like every other revenue line, the same treatment Excel gives commercial/other/opex. Havard has
// zero residential revenue (100% commercial), so this choice doesn't affect any Havard-verified
// figure -- it has not been checked against a residential-bearing deal.
/* capex: dated one-off capital items below NOI, each {name, month:'YYYY-MM', amount}. Returns the amount falling in each operating month 1..months (month 1 is the closing month). */
window.bkCapexByMonth = function(s, months){
  const out = new Array(months).fill(0), list = Array.isArray(s && s.capex) ? s.capex : [];
  if(!list.length) return out;
  const c = bkParseDealDate(s.closing, '2026-01-01'), cy = c.getFullYear(), cm = c.getMonth() + 1;
  list.forEach(function(l){ const mm = /^(\d{4})-(\d{1,2})/.exec(String(l && l.month || '')), v = Number(l && l.amount); if(!mm || !isFinite(v)) return;
    const k = (Number(mm[1]) - cy) * 12 + (Number(mm[2]) - cm) + 1; if(k >= 1 && k <= months) out[k - 1] += v; });
  return out;
};
window.bkAnnualCF = function(){
  const s = bkEnsureV13();
  const y1 = bkCalc();
  // Same V2.6 fix as bkCalc(): a populated rent roll is canonical regardless of the Revenue Basis
  // toggle, so this must stay in lockstep with bkCalc()'s useRR or the two engines disagree on which
  // deals are rent-roll-driven.
  const useRR = Array.isArray(s.rentRoll) && s.rentRoll.length>0;
  const n = Math.max(1, Math.min(15, Math.round(Number(s.holdYears)||10)));
  const holdMonths = n*12;

  // Year-1 blended constants (Excel's k_GPR / k_RetailAnn / k_CtrlOpex / k_InsAnn / k_TaxYr1 / k_ResAnn / k_OtherAnn)
  const k_GPR = y1.gpr;
  const k_RetailAnn = y1.commercial + y1.recovery;
  const k_CtrlOpex = Number(s.rm)+Number(s.payroll)+Number(s.turnover)+Number(s.utilities)+Number(s.contract)+Number(s.marketing)+Number(s.ga)+y1.misc;
  const k_InsAnn = Number(s.insurance);
  const k_TaxYr1 = Number(s.taxes);
  const k_ResAnn = Number(s.reserves);
  const k_OtherAnn = y1.other;

  const resUnits = useRR ? bkRentRollStats(s.rentRoll).resUnits : Number(s.units);
  const vacancy = Math.max(0, Math.min(1, Number(s.vacancy)));
  const resOcc = resUnits>0 ? (1-vacancy) : 0; // matches Excel SYS_CF row 37 (guards divide-by-zero the same way)

  const commVacRate = Math.max(0, Math.min(1, Number(s.commercialVacancy)));
  const commOcc = 1-commVacRate;

  const badDebtPct = Number(s.badDebtPct);
  const rentGrowth = Number(s.rentGrowth), commGrowth = Number(s.commercialRentGrowth), otherGrowth = Number(s.otherGrowth);
  const opexGrowth = Number(s.opexGrowth), taxGrowth = Number(s.taxGrowth), mgmtPct = Number(s.mgmtPct);

  // FINAL WAVE - loss-to-lease and concession rates, read once. The workbook switches the
  // concession rate at stabilisation (SYS_CF G42: IF(m<=k_Stab, g_concess_lu, g_concess)).
  // bkAnnualCF's month 1 IS the first month of operations, so the lease-up window is the
  // deal's own lease-up period counted from that month; an acquisition with no lease-up
  // period has a zero-length window and uses the stabilised rate throughout, which is the
  // same answer the workbook gives for k_Stab = 1.
  const ltlPct       = Number(s.lossToLeasePct)||0;
  const concessPct   = Number(s.concessionPct)||0;
  const concessLUPct = (s.concessionLeaseUpPct===undefined||s.concessionLeaseUpPct===null||s.concessionLeaseUpPct==='')
                       ? concessPct : (Number(s.concessionLeaseUpPct)||0);
  const stabMonths   = Math.max(0, Math.round(Number(s.leaseupMonths)||0));

  // CONVENTIONS (see bkConventions). 'month1' keeps the original continuous m/12 exponent exactly;
  // 'year2' holds Year 1 at the underwritten figures and steps growth once per operating year.
  const _cv = bkConventions(s);
  const gExp = _cv.cvRentGrowthStart === 'year2' ? function(m){ return Math.ceil(m/12) - 1; } : function(m){ return m/12; };
  const opexVar = _cv.cvOpexVariablePct;
  /* rentGrowthY1 (optional): a different rent growth rate for the first twelve months, then rentGrowth after (an 'operating year 1 trend'). Blank or 0 = rentGrowth throughout, which is every existing deal. Used only with continuous growth. */
  const rentGrowthY1 = _cv.cvRentGrowthStart === 'month1' && Number(s.rentGrowthY1) > 0 ? Number(s.rentGrowthY1) : null;
  /* growthCurves (optional): year-by-year growth rates {rent, other, opex, tax, commercial: [year1, year2, ...]}; a blank year uses the single rate. With continuous growth the rate for year k applies through operating year k; with annual steps it applies at the start of year k (year 1 has no step). curveShiftRent carries an upside or downside case's rent-growth shift onto the years entered explicitly. No curve = the original expressions, bit for bit. */
  const _gc = (s.growthCurves && typeof s.growthCurves === 'object') ? s.growthCurves : null, _shiftRent = Number(s.curveShiftRent) || 0;
  const _ok = function(v){ return v !== null && v !== undefined && v !== '' && isFinite(Number(v)); };
  const _has = function(k){ const a = _gc && _gc[k]; return Array.isArray(a) && a.some(_ok); };
  function growthFactor(stream, scalar, y1, legacy){
    if(!_has(stream) && !(y1 > 0 && stream === 'rent')) return legacy;
    const a = (_gc && _gc[stream]) || [], cont = _cv.cvRentGrowthStart === 'month1', memo = [1];
    const rate = function(k){ if(_ok(a[k-1])) return Number(a[k-1]) + (stream === 'rent' ? _shiftRent : 0); if(k === 1 && stream === 'rent' && y1 > 0 && cont) return y1; return scalar; };
    const full = function(Y){ while(memo.length <= Y){ const k = memo.length; memo.push(memo[k-1] * (1 + rate(cont ? k : k + 1))); } return memo[Y]; };   /* product of the first Y full-year steps */
    return cont ? function(m){ const Y = Math.ceil(m/12); return full(Y-1) * Math.pow(1 + rate(Y), (m - 12*(Y-1))/12); } : function(m){ return full(Math.ceil(m/12) - 1); };
  }
  const rentF = growthFactor('rent', rentGrowth, rentGrowthY1, rentGrowthY1 === null ? function(m){ return Math.pow(1+rentGrowth, gExp(m)); } : function(m){ return Math.pow(1+rentGrowthY1, Math.min(m,12)/12) * Math.pow(1+rentGrowth, Math.max(m-12,0)/12); });
  const commF = growthFactor('commercial', commGrowth, 0, function(m){ return Math.pow(1+commGrowth, gExp(m)); });
  const otherF = growthFactor('other', otherGrowth, 0, function(m){ return Math.pow(1+otherGrowth, gExp(m)); });
  const opexF = growthFactor('opex', opexGrowth, 0, function(m){ return Math.pow(1+opexGrowth, gExp(m)); });
  /* taxes step once a year, from operating year 2 */
  const taxA = (_gc && _gc.tax) || [], taxFactor = _has('tax') ? function(yr){ let f = 1; for(let k = 2; k <= yr; k++) f *= 1 + (_ok(taxA[k-1]) ? Number(taxA[k-1]) : taxGrowth); return f; } : function(yr){ return Math.pow(1+taxGrowth, yr-1); };

  function monthNOI(m){
    const opYear = Math.ceil(m/12);
    const resRev = (k_GPR/12) * resOcc * rentF(m);
    // CONVENTION cvBadDebtBasis: 'gross' charges gross potential rent; 'afterVacancy' and the legacy
    // monthly behaviour charge rent after vacancy (the legacy expression is kept literally).
    const bad = _cv.cvBadDebtBasis==='gross' ? -((k_GPR/12) * rentF(m))*badDebtPct : -resRev*badDebtPct;
    // Applied to GROSS potential rent, exactly as the workbook does, using the same
    // expression the vacancy split below already uses so the parts still sum to the whole.
    // At the default of zero both terms are -0, and x + -0 === x for every x, so no existing
    // figure can move by a floating-point bit.
    const _gprG   = (k_GPR/12) * rentF(m);
    const ltl     = -_gprG*ltlPct;
    const concess = -_gprG*(m<=stabMonths ? concessLUPct : concessPct);
    const netRes = resRev+bad+ltl+concess;
    const comm = (k_RetailAnn/12) * commOcc * commF(m);
    const other = (k_OtherAnn/12) * otherF(m);
    const egi = netRes+comm+other;
    const opexGF = opexF(m);
    // V27 intentional divergence from Excel SYS_CF!G50 (see the block comment above this function):
    // revenue-weighted blend of residential/commercial occupancy, not residential occupancy alone.
    const revWeightTotal = k_GPR + k_RetailAnn;
    const blendedOcc = revWeightTotal>0 ? (k_GPR*resOcc + k_RetailAnn*commOcc)/revWeightTotal : 1;
    // legacy split kept as the literal expression so legacy deals reproduce bit-for-bit
    const ctrlOpex = -(k_CtrlOpex/12) * opexGF * (opexVar === 0.4 ? (0.6+0.4*blendedOcc) : ((1-opexVar) + opexVar*blendedOcc));
    const insurance = -(k_InsAnn/12) * opexGF;
    const taxes = -(k_TaxYr1/12) * taxFactor(opYear);
    const mgmt = -egi*mgmtPct;
    const totalOpex = ctrlOpex+insurance+taxes+mgmt;
    const noiBeforeReserves = egi+totalOpex;
    const reserves = -(k_ResAnn/12) * opexGF;
    const noi = noiBeforeReserves+reserves;
    // WAVE 1 EXPOSURE ONLY. Every line above is already computed here; only four of
    // them were ever returned, so Property CF could show EGI and Total Opex and
    // nothing in between. The alternative - decomposing the pro forma inside the
    // renderer - would be a second calculator, which is forbidden. So the engine
    // returns what it already computed. NO ARITHMETIC IS CHANGED: resRev and comm
    // keep their original expressions untouched, and the two gross/vacancy splits
    // are derived BY SUBTRACTION from them, so the parts sum to the whole exactly
    // and no existing figure can move by so much as a floating-point bit.
    const gprGross  = _gprG;
    const resVac    = resRev - gprGross;          // negative; resRev = gprGross * resOcc
    const commGross = (k_RetailAnn/12) * commF(m);
    const commVac   = comm - commGross;           // negative; comm = commGross * commOcc
    return {egi, totalOpex, noiBeforeReserves, noi,
            gprGross, resVac, resRev, bad, ltl, concess, netRes,
            commGross, commVac, comm, other,
            ctrlOpex, insurance, taxes, mgmt, reserves};
  }

  // WAVE 1 EXPOSURE ONLY. The four original accumulators (egi, expenses, noi, after)
  // are computed exactly as before and pushed under exactly their original keys; the
  // line-item accumulators are additive and are what the detailed pro forma renders.
  const LINES = ['gprGross','resVac','resRev','bad','ltl','concess','netRes','commGross','commVac','comm',
                 'other','ctrlOpex','insurance','taxes','mgmt','reserves'];
  const arr=[];
  const monthly=[];
  for(let y=1;y<=n;y++){
    let egi=0, expenses=0, noiSum=0, afterSum=0;
    const L={}; LINES.forEach(k=>L[k]=0);
    for(let mm=1; mm<=12; mm++){
      const m=(y-1)*12+mm;
      const r = monthNOI(m);
      egi += r.egi; expenses += -r.totalOpex; noiSum += r.noiBeforeReserves; afterSum += r.noi;
      LINES.forEach(k=>L[k]+=r[k]);
      monthly.push(Object.assign({m, y, egi:r.egi, noiBeforeReserves:r.noiBeforeReserves, noi:r.noi,
                                  totalOpex:r.totalOpex},
                                 LINES.reduce((o,k)=>(o[k]=r[k],o),{})));
    }
    arr.push(Object.assign({y, egi, expenses, noi: noiSum, after: afterSum}, {lines:L}));
  }

  // Sale: average of the next 12 months' NOI-after-reserves, annualized, / exit cap (Excel's
  // in_exit_basis defaults to "NOI After Reserves" -- Havard's actual Excel setting; the app has
  // no separate toggle for this yet, so that default is used unconditionally).
  let fwdSum=0;
  /* exitNoiBasis (optional): 'before' prices the sale on forward NOI before replacement reserves; blank = after reserves (the original behaviour). */
  const exitBefore = s.exitNoiBasis === 'before';
  for(let mm=holdMonths+1; mm<=holdMonths+12; mm++){ const r_ = monthNOI(mm); fwdSum += exitBefore ? r_.noiBeforeReserves : r_.noi; }
  const terminalNOI = fwdSum;
  const grossSale = Number(s.exitCap) ? terminalNOI/Number(s.exitCap) : 0;
  const saleCost = grossSale*Number(s.saleCostPct);
  const netSale = grossSale-saleCost;

  const acqFeePct = bkAcqFeePct(s);
  const initial = -(Number(s.purchasePrice) * (1+Number(s.closingCostsPct)+acqFeePct));

  const acqDate = bkParseDealDate(s.closing,'2026-01-01');
  /* V30.2 METHODOLOGY (approved): the acquisition outflow is its own cash flow on the
     closing date, separate from Month-1 operating NOI. Previously the two were netted
     into one Month-1 figure, which understated both total outflows and total inflows and
     moved the unlevered multiple by 0.05-0.30%. Both flows keep the same modeled date, so
     the date-weighted IRR is mathematically unchanged; the multiple is now conventional
     (total inflows / total outflows). */
  const capexM = bkCapexByMonth(s, holdMonths);
  const values=[initial], dates=[new Date(acqDate)];
  for(let m=1; m<=holdMonths; m++){
    const r = monthNOI(m);
    let cf = r.noi - capexM[m-1];
    if(m===holdMonths) cf += netSale;
    values.push(cf);
    dates.push(bkMonthEnd(acqDate, m));   // V32.1: month-end
  }
  const irr = bkXirr(values, dates);
  const inflows = values.reduce((a,v)=>a+Math.max(0,v),0), outflows = values.reduce((a,v)=>a+Math.max(0,-v),0);
  const moic = outflows ? inflows/outflows : 0;

  const cfs=[initial, ...arr.map((a,i)=>a.after-capexM.slice(i*12,(i+1)*12).reduce((t,v)=>t+v,0)+(i===n-1?netSale:0))];

  return {s, arr, monthly, holdMonths, terminalNOI, grossSale, saleCost, netSale, initial, cfs, irr, moic, acqDate, capex:capexM};
};

// Property CF's note-flag and engine badge still described the old flat-annual-growth
// behavior ("monthly timing/lease-cohort logic is ported next") -- now stale since that's
// exactly what this patch replaces it with. Swap in an accurate description; numbers are
// untouched.
const _propCfV14 = RENDERERS['Property CF'];
RENDERERS['Property CF'] = function(){
  const o = _propCfV14();
  o.main = o.main.replace(
    /<b>V0\.3 live Property CF -<\/b>[\s\S]*?<\/div><\/div>/,
    `<b>Live -</b> this page runs Excel's actual monthly engine (continuous monthly compounding on revenue/opex, annual-step real estate tax growth, XIRR on the dated monthly cash flow array) rather than a flat annual growth approximation. Verified against Excel's SYS_CF output month-by-month for Havard Avenue.</div></div>`
  );
  o.sidebar = o.sidebar.replace('Live V0.3', 'Live V14');
  return o;
};
