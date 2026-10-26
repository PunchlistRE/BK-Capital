
/* ===========================================================================
   V29.12.0 - TAX-GRADE DEPRECIATION (MACRS) AND COST SEGREGATION
   ===========================================================================
   The canonical depreciation engine (V29.11.0) held the cost-segregation inputs
   (components, bonus, land) but recovered every class straight-line with no
   MACRS tables, no half-year / mid-quarter / mid-month convention and no
   disposal-year rule, and After-Tax taxed all recapture at one 25% rate.

   This module makes it tax-grade, per deal, in the same layered style:

   * bkMacrs.rates()      IRS GDS recovery percentages (200% / 150% declining
                          balance switching to straight line, or straight line)
                          under the half-year, mid-quarter (Q1-Q4) and mid-month
                          conventions, generated from the Pub. 946 rules.
   * mid-quarter test     per placed-in-service year: if more than 40% of the
                          short-life basis is placed in service in Q4, every
                          AUTO-convention short-life asset uses mid-quarter.
   * bonus depreciation   statutory rate by placed-in-service date (100% for
                          property acquired after 19 Jan 2025) or an elected %.
   * disposal year        depreciation in the year of sale follows the convention
                          (half-year / mid-quarter / mid-month) - no full year.
   * calendar-year tax    taxable income is built from the MONTHLY NOI, reserves
                          and interest, by calendar year, so a December closing
                          really gets a stub year.
   * sale-year tax        proceeds are allocated across short-life, real
                          property and land/other; Sec. 1245 recapture is taxed
                          as ordinary income, unrecaptured Sec. 1250 gain at the
                          recapture rate (25% cap), the rest as capital gain;
                          suspended passive losses release against the highest-
                          taxed gain first.

   PER-DEAL SWITCH, like the underwriting conventions: a deal whose depreciation
   settings carry no depMethod keeps the V29.11 simplified schedule exactly; new
   deals are stamped depMethod='macrs'. Nothing moves unless someone changes it.

   NOT MODELLED (stated, not hidden): Sec. 179, state decoupling from bonus,
   Sec. 1231 look-back, NIIT, AMT, passive-loss limits other than full
   suspension, capitalised closing costs in the depreciable basis (the canonical
   definition - price less land plus capex - is kept), and replacement-reserve
   spend as capital (reserves are treated as deductible, as the legacy engine did).
   =========================================================================== */
(function(){
'use strict';
if(typeof window.bkDepreciation !== 'function' || typeof window.bkAfterTaxV18 !== 'function') return;
var prevSchedule = window.bkDepreciationSchedule, prevAfterTax = window.bkAfterTaxV18;

/* ------------------------------------------------------------- MACRS rates */
function firstYearFraction(conv, q, m){
  if(conv === 'MQ') return (4 - q + 0.5) / 4;          /* Q1 .875 Q2 .625 Q3 .375 Q4 .125 */
  if(conv === 'MM') return (12 - m + 0.5) / 12;        /* month placed in service */
  return 0.5;                                          /* half-year */
}
/* Fractions of depreciable basis, recovery year 1..N. Pub. 946: declining balance
   at factor/life on the remaining basis, switching to straight line over the
   remaining recovery period once that is larger; first year is rate x fraction. */
function macrsRates(life, method, conv, q, m){
  var fy = firstYearFraction(conv, q, m);
  var factor = method === '200DB' ? 2 : method === '150DB' ? 1.5 : 0;
  var out = [], rem = 1;
  for(var t = 1; t <= Math.ceil(life) + 2 && rem > 1e-12; t++){
    var dep;
    if(t === 1){ dep = (factor ? factor : 1) / life * fy; }
    else {
      var remLife = life - fy - (t - 2);
      var dbAmt = factor ? rem * factor / life : 0;
      var slAmt = remLife > 0 ? rem / remLife : rem;
      dep = Math.max(dbAmt, slAmt);
    }
    dep = Math.min(dep, rem); out.push(dep); rem -= dep;
  }
  return out;
}
/* depreciation in the year of disposal: the convention's partial year */
function disposalFraction(conv, q, m){
  if(conv === 'MQ') return (q - 0.5) / 4;
  if(conv === 'MM') return (m - 0.5) / 12;
  return 0.5;
}
window.bkMacrs = { rates:macrsRates, firstYearFraction:firstYearFraction, disposalFraction:disposalFraction };

/* ----------------------------------------------------------------- helpers */
function parseD(v){
  if(v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  v = String(v == null ? '' : v);
  var a = /^(\d{4})-(\d{2})-(\d{2})/.exec(v); if(a) return new Date(+a[1], +a[2] - 1, +a[3]);
  var b = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v); if(b) return new Date(+b[3], +b[1] - 1, +b[2]);
  return null;
}
function rawSettings(){ var s = bkLoad(); return (s._depr && s._depr.settings) || {}; }
function method(){ return rawSettings().depMethod === 'macrs' ? 'macrs' : 'simplified'; }
function defaultPlaced(){
  var s = bkLoad(), raw = rawSettings();
  var d = parseD(raw.placedInService) || parseD(raw.closeDate);
  if(!d && typeof bkParseDealDate === 'function') d = parseD(bkParseDealDate(s.closing, '2027-01-01'));
  return d || new Date();
}
/* Statutory bonus rate for property placed in service on d. Property acquired after
   19 Jan 2025 is 100% (P.L. 119-21); earlier acquisitions follow the TCJA phase-down. */
function statutoryBonus(d){
  var y = d.getFullYear();
  if(d >= new Date(2025, 0, 20)) return 1;
  if(y <= 2017) return 0.5; if(y <= 2022) return 1; if(y === 2023) return 0.8;
  if(y === 2024) return 0.6; if(y === 2025) return 0.4; if(y === 2026) return 0.2; return 0;
}
function classDefault(life){ return life <= 10 ? '200DB' : life < 27.5 ? '150DB' : 'SL'; }
function normConv(c, life){
  if(life >= 27.5) return 'MM';
  c = String(c || '');
  if(/quarter|^mq$/i.test(c)) return 'MQ';
  if(/half|^hy$/i.test(c)) return 'HY';
  if(/month|^mm$/i.test(c)) return 'MM';
  return 'AUTO';
}
function normMethod(m, life){
  if(life >= 27.5) return 'SL';
  m = String(m || '');
  if(/200/.test(m)) return '200DB'; if(/150/.test(m)) return '150DB';
  if(/^sl$|straight/i.test(m)) return 'SL';
  return classDefault(life);
}

/* ------------------------------------------------------------ the schedule */
function buildSchedule(o){
  o = o || {};
  var e = window.bkDepreciation(), st = e.settings, raw = rawSettings();
  var defP = defaultPlaced();
  var srcLines = o.baseOnly
    ? (e.depreciableBasis > 0 ? [{ label:e.baseLife + ' Year Recovery', basis:e.depreciableBasis, life:e.baseLife, bonus:false, convention:'MM', method:'SL' }] : [])
    : e.lines;
  var lines = srcLines.filter(function(l){ return l.basis > 0 && l.life > 0; }).map(function(l){
    var life = Number(l.life);
    return { label:l.label, basis:Number(l.basis), life:life, bonusEligible:!!l.bonus && life <= 20,
             placed:parseD(l.placed) || defP, convRaw:normConv(l.convention, life), meth:normMethod(l.method, life) };
  });
  /* mid-quarter test, per placed-in-service year, on short-life basis (before bonus) */
  var all = {}, q4 = {};
  lines.forEach(function(l){
    if(l.life >= 27.5) return;
    var y = l.placed.getFullYear(); all[y] = (all[y] || 0) + l.basis;
    if(l.placed.getMonth() >= 9) q4[y] = (q4[y] || 0) + l.basis;
  });
  var mq = {}; Object.keys(all).forEach(function(y){ mq[y] = all[y] > 0 && (q4[y] || 0) / all[y] > 0.4; });
  var elect = raw.bonusMode === 'elect', electPct = Math.max(0, Math.min(1, Number(raw.bonusPct) || 0));
  var saleDt = o.saleDate ? parseD(o.saleDate) : null;
  var saleY = saleDt ? saleDt.getFullYear() : null;
  var rowsBy = {}, minY = 9999, maxY = 0;
  var out = lines.map(function(l){
    var y0 = l.placed.getFullYear(), qn = Math.floor(l.placed.getMonth() / 3) + 1, mn = l.placed.getMonth() + 1;
    var conv = l.convRaw === 'AUTO' ? (mq[y0] ? 'MQ' : 'HY') : l.convRaw;
    var bRate = l.bonusEligible ? (elect ? electPct : statutoryBonus(l.placed)) : 0;
    var bonus = l.basis * bRate, reg = l.basis - bonus;
    var rates = macrsRates(l.life, l.meth, conv, qn, mn);
    minY = Math.min(minY, y0);
    var put = function(y, kind, amt){
      if(!(amt > 0)) return;
      var r = rowsBy[y] || (rowsBy[y] = { taxYear:y, regular:0, bonus:0, total:0, byClass:{} });
      r[kind] += amt; r.total += amt; r.byClass[l.life] = (r.byClass[l.life] || 0) + amt; maxY = Math.max(maxY, y);
    };
    if(!(saleY !== null && y0 > saleY)) put(y0, 'bonus', bonus);
    var taken = 0;
    for(var t = 1; t <= rates.length; t++){
      var y = y0 + t - 1, amt = reg * rates[t - 1];
      if(saleY !== null){
        if(y > saleY) break;
        if(y === saleY) amt *= disposalFraction(conv, Math.floor(saleDt.getMonth() / 3) + 1, saleDt.getMonth() + 1);
      }
      put(y, 'regular', amt); taken += amt;
    }
    return { label:l.label, life:l.life, conv:conv, meth:l.meth, placed:l.placed, basis:l.basis, bonusRate:bRate, bonus:bonus, mq:conv === 'MQ' };
  });
  var totalBasis = out.reduce(function(a, l){ return a + l.basis; }, 0);
  var startY = lines.length ? minY : defP.getFullYear();
  var endY = Math.max(maxY, o.throughYear || 0, saleY || 0);
  var rows = [], accum = 0;
  for(var y = startY; y <= endY; y++){
    var r = rowsBy[y] || { taxYear:y, regular:0, bonus:0, total:0, byClass:{} };
    r.beginBasis = Math.max(0, totalBasis - accum); accum += r.total; r.accum = accum; r.remaining = Math.max(0, totalBasis - accum);
    rows.push(r);
  }
  return { startYear:startY, totalBasis:totalBasis, rows:rows, lines:out, midQuarterYears:Object.keys(mq).filter(function(y){ return mq[y]; }).map(Number),
           convention:'MACRS GDS (Pub. 946): half-year / mid-quarter / mid-month, bonus, disposal-year rule', isTaxGrade:true };
}
window.bkMacrsSchedule = buildSchedule;

window.bkDepreciationSchedule = function(years){
  if(method() !== 'macrs') return prevSchedule.apply(this, arguments);
  var hold = Math.max(1, Math.round(Number((bkLoad() || {}).holdYears) || 10));
  var n = Math.max(1, Number(years) || (hold + 1));
  var sch = buildSchedule({}); var first = sch.startYear;
  sch = buildSchedule({ throughYear:first + n - 1 });
  sch.rows = sch.rows.slice(0, n);
  return sch;
};

/* ----------------------------------------------------------------- after-tax */
function afterTaxMacrs(base, opts){
  opts = opts || {};
  var s = base.s, u = base.u, d = base.d, r = base.r, e = window.bkDepreciation(), raw = rawSettings();
  var mrows = r.rows, n = mrows.length, saleDt = mrows[n - 1].dt;
  var sch = buildSchedule({ saleDate:saleDt, baseOnly:!!opts.baseOnly });
  var fee = (!opts.baseOnly && e.settings.costSeg) ? (Number(raw.costSegFee) || 0) : 0;
  var byY = {}, order = [], lastIdx = {};
  for(var i = 0; i < n; i++){
    var dt = mrows[i].dt, y = new Date(dt).getFullYear();
    if(!byY[y]){ byY[y] = { noi:0, interest:0 }; order.push(y); }
    byY[y].noi += Number(mrows[i].noi || 0) - Number(mrows[i].reserve || 0);
    byY[y].interest += Number((d.months[i] || {}).interest || 0);
    lastIdx[y] = i;
  }
  var schedBy = {}; sch.rows.forEach(function(x){ schedBy[x.taxYear] = x; });
  var taxRate = Number(s.taxRate) || 0, rows = [], lossCF = 0, accum = 0, accumP = 0, accumR = 0, usable = raw.lossMode === 'usable';
  order.forEach(function(y, idx){
    var sr = schedBy[y] || { regular:0, bonus:0, total:0, byClass:{} };
    var dP = 0, dR = 0; Object.keys(sr.byClass).forEach(function(k){ if(Number(k) < 27.5) dP += sr.byClass[k]; else dR += sr.byClass[k]; });
    accum += sr.total; accumP += dP; accumR += dR;
    var f = idx === 0 ? fee : 0;
    var ti = byY[y].noi - byY[y].interest - sr.total - f, taxDue = 0;
    if(usable){ taxDue = ti * taxRate; }                                  /* losses used against the investor's other income: a loss saves tax */
    else if(ti > 0){ var off = Math.min(lossCF, ti); lossCF -= off; ti -= off; taxDue = ti * taxRate; }
    else { lossCF += -ti; ti = 0; }                                       /* suspended (Sec. 469) until income or sale releases it */
    rows.push({ y:idx + 1, taxYear:y, noi:byY[y].noi, interest:byY[y].interest, depr:sr.total, regularDepr:sr.regular, bonusDepr:sr.bonus,
                personalDepr:dP, realDepr:dR, fee:f, accumDepr:accum, taxableIncome:ti, taxDue:taxDue, lossCF:lossCF, byClass:sr.byClass });
  });
  /* ---- sale: allocate proceeds, split recapture */
  var Bp = 0, Br = 0; sch.lines.forEach(function(l){ if(l.life < 27.5) Bp += l.basis; else Br += l.basis; });
  var totalBasis = base.totalBasis, Bo = Math.max(0, totalBasis - Bp - Br), W = Bp + Br + Bo || 1;
  var net = u.netSale, Gp = net * Bp / W - (Bp - accumP), Gr = net * Br / W - (Br - accumR), Go = net * Bo / W - Bo;
  /* Sec. 1245: gain on short-life property up to the depreciation taken is ordinary; Sec. 1250: gain on real property up to the
     depreciation taken is 'unrecaptured'; everything else (and any class sold at a loss) nets into one capital pool. */
  var ord = Math.max(0, Math.min(Gp, accumP)), unrec = Math.max(0, Math.min(Gr, accumR));
  var cap = (Gp - ord) + (Gr - unrec) + Go;
  if(cap < 0){ var a1 = Math.min(unrec, -cap); unrec -= a1; cap += a1; }
  if(cap < 0){ var a2 = Math.min(ord, -cap); ord -= a2; cap += a2; }
  cap = Math.max(0, cap);
  var gainTotal = ord + unrec + cap;
  var loss = Math.min(lossCF, gainTotal), left = loss;
  var o1 = Math.min(left, ord); ord -= o1; left -= o1;
  var o2 = Math.min(left, unrec); unrec -= o2; left -= o2;
  var o3 = Math.min(left, cap); cap -= o3; left -= o3;
  var unrecRate = Math.min(Number(s.depRecaptureRate) || 0, taxRate);
  var ordTax = ord * taxRate, recTax = unrec * unrecRate, capTax = cap * (Number(s.capGainsRate) || 0);
  var saleTax = ordTax + recTax + capTax;
  var values = [], dates = [];
  for(var k = 0; k < n; k++){
    var row = mrows[k], cf = row.cf, yy = new Date(row.dt).getFullYear();
    if(k === 0) cf -= fee;
    if(lastIdx[yy] === k){ var rr = rows.filter(function(x){ return x.taxYear === yy; })[0]; if(rr) cf -= rr.taxDue; }
    if(k === n - 1) cf -= saleTax;
    values.push(cf); dates.push(row.dt);
  }
  var atIRR = bkXirrClose(values, dates, r.closeDt, -(Number(mrows[0] && mrows[0].eqDraw) || 0));
  var inflows = values.reduce(function(a, v){ return a + Math.max(0, v); }, 0), outflows = values.reduce(function(a, v){ return a + Math.max(0, -v); }, 0);
  var adjusted = totalBasis - accum;
  return { s:s, u:u, d:d, r:r, rows:rows, totalBasis:totalBasis, landValue:e.landValue, landPct:e.landPct, deprBasis:e.depreciableBasis, allocatedBasis:e.allocated,
    life:e.baseLife, annualDepr:null, bonusPct:e.bonusPct, bonusEligibleBasis:e.bonusEligibleBasis, bonusDeduction:sch.lines.reduce(function(a, l){ return a + l.bonus; }, 0),
    accumDepr:accum, accumPersonal:accumP, accumReal:accumR, adjustedBasis:adjusted, totalGain:gainTotal, lossCFAtSale:lossCF, lossUsedAtSale:loss,
    ordinaryRecaptureBase:ord, ordinaryRecaptureTax:ordTax, ordinaryRecaptureRate:taxRate,
    recaptureBase:unrec, recaptureTax:recTax, capGainBase:cap, capGainTax:capTax, saleTax:saleTax,
    classGain:{ personal:Gp, real:Gr, landOther:Go }, costSegFee:fee,
    values:values, dates:dates, atIRR:atIRR, atMOIC:outflows ? inflows / outflows : 0, preTaxIRR:r.irr, preTaxMOIC:r.moic,
    deprSource:'macrs-tax-grade', deprTie:e.tie, deprSchedule:sch };
}
window.bkAfterTaxV18 = function(){
  var base = prevAfterTax();
  if(method() !== 'macrs' || base.deprSource !== 'canonical-depreciation-engine') return base;
  try { return afterTaxMacrs(base); } catch(err){ base.deprSource = 'macrs-failed:' + err.message; return base; }
};

/* what cost segregation adds versus straight-line on the same basis (same everything else) */
window.bkCostSegBenefit = function(rate){
  var base = prevAfterTax();
  if(method() !== 'macrs' || base.deprSource !== 'canonical-depreciation-engine') return null;
  var e = window.bkDepreciation(); if(!e.settings.costSeg) return null;
  var withCS = afterTaxMacrs(base), without = afterTaxMacrs(base, { baseOnly:true });
  var disc = rate === undefined ? (Number(rawSettings().pvRate) || 0.08) : Number(rate);
  var tax = Number(base.s.taxRate) || 0, y0 = withCS.rows[0] ? withCS.rows[0].taxYear : 0, pv = 0, hold = 0;
  var saved = withCS.rows.map(function(r, i){ var w = without.rows[i] || { depr:0 }; var sv = (r.depr - w.depr) * tax; hold += sv; pv += sv / Math.pow(1 + disc, i + 1); return { taxYear:r.taxYear, extraDepr:r.depr - w.depr, taxSaved:sv }; });
  var extraSaleTax = withCS.saleTax - without.saleTax;
  var accel = withCS.deprSchedule.lines.reduce(function(a, l){ return a + (l.life < 27.5 ? l.basis : 0); }, 0), usable = rawSettings().lossMode === 'usable';
  return { withCS:withCS, without:without, rows:saved, yearOneDeduction:withCS.rows[0].depr, baselineYearOne:without.rows[0].depr,
    yearOneTaxSavings:saved[0].taxSaved, holdTaxSavings:hold, pvTaxSavings:pv, discount:disc, extraSaleTax:extraSaleTax, netNominalBenefit:hold - extraSaleTax - withCS.costSegFee,
    fee:withCS.costSegFee, paybackRatio:withCS.costSegFee > 0 ? saved[0].taxSaved / withCS.costSegFee : null,
    acceleratedBasis:accel, workbookStyleSavings:accel * tax, workbookPayback:withCS.costSegFee > 0 ? accel * tax / withCS.costSegFee : null, lossMode:usable ? 'usable' : 'suspended', irrWith:withCS.atIRR, irrWithout:without.atIRR, firstYear:y0 };
};

/* ------------------------------------------------- itemised study import */
var HARVARD_ASSETS = [["Site Clearing",2749,"SQ FT",79.427326,15,"MQ","150DB"],["Site Excavation/Fill/Preparation",66968,"SQ FT",156439.692998,15,"MQ","150DB"],["Asphaltic Concrete, Paving",64976.229999999996,"SQ FT",226462.726796,15,"MQ","150DB"],["Patio, Concrete",510,"SQ FT",3637.845947,15,"MQ","150DB"],["Steps, Concrete",55.47,"LFN",3118.233976,15,"MQ","150DB"],["Landing, Concrete",423,"SQ FT",10674.062868,15,"MQ","150DB"],["Concrete Ramp",410,"SQ FT",5997.617587,15,"MQ","150DB"],["Concrete Curb, no gutter",20.6,"LF",347.407355,15,"MQ","150DB"],["Asphalt Curb",583,"LF",3757.995675,15,"MQ","150DB"],["General Landscaping",1461,"SQ FT",2500.396041,15,"MQ","150DB"],["Garden Bed Edging, Stone",108,"LF",3325.666522,15,"MQ","150DB"],["Stone Mulching",1743,"SQ FT",2199.159761,15,"MQ","150DB"],["Shrubs and Hedges, Small",1,"EA",33.79133,15,"MQ","150DB"],["Trees",1,"EA",358.525389,15,"MQ","150DB"],["Parking Lot Striping, Per Car Space",58,"EA",851.341648,15,"MQ","150DB"],["Parking Lot Striping, Handicap Stall",2,"EA",53.716348,15,"MQ","150DB"],["Metal Guard Rail",140,"LF",5246.713017,15,"MQ","150DB"],["Bollard, Concrete",10,"EA",9331.653866,15,"MQ","150DB"],["Air Conditioning Compressor Pad",3,"EA",1723.919991,15,"MQ","150DB"],["Transformer Pad, Reinforced",2,"EA",4597.119977,15,"MQ","150DB"],["Chain Link 10', Fencing",215,"LF",10944.705814,15,"MQ","150DB"],["Metal, Fencing",220,"LF",4782.00415,15,"MQ","150DB"],["Chain Link Gate",117.60000000000001,"SQ FT",3133.546882,15,"MQ","150DB"],["Cobblestone, Wall",387,"SQ FT",14261.690276,15,"MQ","150DB"],["Metal Painted Sign on Pole",1,"EA",503.434606,15,"MQ","150DB"],["Storm Drain",481,"LF",43112.678087,15,"MQ","150DB"],["Catch Basin",10,"EA",39162.96502,15,"MQ","150DB"],["Exterior Metal Railing",486,"LF",46839.280929,15,"MQ","150DB"],["Flagpole",1,"EA",2000.059494,15,"MQ","150DB"],["Excavation/Fill/Site Preparation",42992,"SQ FT",83244.848415,39,"MM","SL"],["Concrete Slab",42992,"SQ FT",209678.556356,39,"MM","SL"],["Floor Construction, Subfloor",21927,"SQ FT",97787.974875,39,"MM","SL"],["Parking Structure, Elevated Flat Slab and Joists",10762,"SQ FT",208383.201209,39,"MM","SL"],["Exterior Wall Construction, Block, Concrete",25182.57,"SQ FT",896567.370925,39,"MM","SL"],["Exterior Wall Construction, Aluminum or Steel Frame",9726.8,"SQ FT",202616.051737,39,"MM","SL"],["Basement Wall Construction",1800,"SQ FT",29006.82768,39,"MM","SL"],["Exterior Wall Cover, Aluminum or Steel Siding",4390.799999999999,"SQ FT",66561.247927,39,"MM","SL"],["Exterior Wall Finish, Vinyl Siding",466.10000000000014,"SQ FT",3543.053458,39,"MM","SL"],["Exterior Wall Finish, Stucco",23810.76,"SQ FT",192151.50711,39,"MM","SL"],["Roof Structure, Open-Steel System",32527,"SQ FT",216270.706686,39,"MM","SL"],["Roof Cover, Aluminum or Steel, Corrugated, Crimped or Tile Panels",16507,"SQ FT",65780.452084,39,"MM","SL"],["Roof Cover, Built-up Composition",15764,"SQ FT",57994.892114,39,"MM","SL"],["Roof Insulation",32271,"SQ FT",84759.121621,39,"MM","SL"],["Interior Partitions, Gypsum Board Both Sides",1756,"SQ FT",15125.049395,39,"MM","SL"],["Interior Partitions, Gypsum Board One Side",3149.375,"SQ FT",20320.42192,39,"MM","SL"],["Interior, Concrete Block",10742,"SQ FT",118088.019717,39,"MM","SL"],["Toilet Partitions, Metal, Stainless Steel",20,"EA",34978.08678,39,"MM","SL"],["Restroom Privacy Screens, Stainless Steel",3,"EA",4197.370414,39,"MM","SL"],["Water Lateral",168,"LF",4218.357266,39,"MM","SL"],["Gas Lateral",168,"LF",2770.264473,39,"MM","SL"],["Underground, Electric Lateral",333,"LF",7945.397334,39,"MM","SL"],["Telephone Lateral",333,"LF",5574.257815,39,"MM","SL"],["Sewer Lateral",168,"LF",5792.371171,39,"MM","SL"],["Sewer Manhole",5,"EA",23266.673796,39,"MM","SL"],["Interior Stair Construction",11,"EA",34170.259538,39,"MM","SL"],["Exterior Metal, Hollow Core",84,"SQ FT",2938.15929,39,"MM","SL"],["Glass & Aluminum Door",63,"SQ FT",1945.87469,39,"MM","SL"],["Clear Glass, Single Swinging",229.05,"SQ FT",7074.644409,39,"MM","SL"],["Overhead Door, Roll Up",360,"SQ FT",13772.62167,39,"MM","SL"],["Overhead Door, 10' x 10'",1,"EA",2685.817378,39,"MM","SL"],["Glass Window",1799,"SQ FT",35343.199709,39,"MM","SL"],["Aluminum Trim, Storefront",939.0500000000002,"SQ FT",52788.491342,39,"MM","SL"],["Wood, Hollow Wood",2301,"SQ FT",57920.151438,39,"MM","SL"],["Metal, Hollow Core",224,"SQ FT",9374.127257,39,"MM","SL"],["French Door",147,"SQ FT",4361.330195,39,"MM","SL"],["Clear Glass",21,"SQ FT",648.624897,39,"MM","SL"],["Paint, Ceiling",1450,"SQ FT",1132.103255,39,"MM","SL"],["Acoustical Tiles, Ceiling Finish",37980,"SQ FT",312189.917938,39,"MM","SL"],["Gypsum Board, Ceiling Finish",330,"SQ FT",1422.233993,39,"MM","SL"],["Ceramic Wall Tile",112.5,"SQ FT",2513.854797,39,"MM","SL"],["Paint, Wall Finish",18864.65,"SQ FT",14728.780464,39,"MM","SL"],["Plywood Paneling",360,"SQ FT",1128.792829,39,"MM","SL"],["Interior Face Brick, Veneer",180,"SQ FT",7221.772548,39,"MM","SL"],["Ceramic Tile, Flooring",420,"SQ FT",9588.368039,39,"MM","SL"],["Terrazzo, Flooring",340,"SQ FT",15120.527228,39,"MM","SL"],["General Use, Fire Extinguisher, Dry Chemical 10 Pound",14,"EA",4004.990936,39,"MM","SL"],["Restroom Grab Bar",4,"EA",439.72452,39,"MM","SL"],["Bathroom Cabinets",18,"LF",3582.75546,39,"MM","SL"],["Bathroom Vanities",17,"LF",5195.91151,39,"MM","SL"],["Laminate, Countertop, Restroom",13,"LF",2630.851813,39,"MM","SL"],["Janitor, Service Sink",3,"EA",5143.652583,39,"MM","SL"],["Drinking Fountain",3,"EA",4253.585196,39,"MM","SL"],["Sump Pump",2,"EA",1757.232455,39,"MM","SL"],["Restroom Floor Drain",8,"EA",7133.031268,39,"MM","SL"],["Restroom Lavatory, Wall Sink",11,"EA",11955.010374,39,"MM","SL"],["Restroom Rough-in Only",24,"EA",18993.101122,39,"MM","SL"],["Restroom Vanity Mounted Sink",6,"EA",6495.930402,39,"MM","SL"],["Restroom Shower",1,"EA",1465.748398,39,"MM","SL"],["Restroom Urinal",6,"EA",12717.032979,39,"MM","SL"],["Restroom Water Closet",24,"EA",42223.547613,39,"MM","SL"],["Water Heater, 10 Gallon, Specialty Equipment",1,"EA ",149.340403,39,"MM","SL"],["Water Heater, 40 Gallon, Restroom",1,"EA",562.147823,39,"MM","SL"],["Water Heater, 50 Gallon, Restroom",2,"EA",1214.451429,39,"MM","SL"],["Space Heater Blower Type, Gas, Large",6,"EA",25821.323348,39,"MM","SL"],["General HVAC System, Zoned A.C.",33526,"SQ FT",415148.010066,39,"MM","SL"],["Hot Water, Baseboard or Convectors",5164,"SQ FT",63670.961147,39,"MM","SL"],["Restroom Vent Fan",13,"EA",3247.965201,39,"MM","SL"],["Restroom Fan Electric Hook-up",13,"EA",2460.33364,39,"MM","SL"],["Exit Sign",20,"EA",6337.6962,39,"MM","SL"],["General Recessed Incandescent Light",61,"EA",9144.271258,39,"MM","SL"],["General Fluorescent, Strip One Lamp",327,"EA",68627.006262,39,"MM","SL"],["General Fluorescent, Two Lamp",219,"EA",50885.620961,39,"MM","SL"],["General Convenience, 15 - 20 Amp Outlet",75,"EA",7952.049416,39,"MM","SL"],["Lighting Wiring, Romex, General",607,"EA",64358.58661,39,"MM","SL"],["Split Use, Breaker Panels, 60-200 AMPS CAP. General",4,"EA",2371.764386,39,"MM","SL"],["Split Use, Switchgear, 1600 AMP, General",5,"EA",76565.967415,39,"MM","SL"],["Fire Alarm System",1,"EA",41224.173705,39,"MM","SL"],["Chain Link, Interior Fencing",40,"LF",1661.459122,5,"MQ","200DB"],["Add for Electronic Garage Door Opener",1,"EA",704.558605,5,"MQ","200DB"],["Demountable Clear Glass",111,"SQ FT",9654.420408,5,"MQ","200DB"],["Demountable Interior Overhead Door, Roll Up",481.6,"SQ FT",18424.707211,5,"MQ","200DB"],["Crown Molding",26,"LF",114.003579,5,"MQ","200DB"],["Wallpaper",180,"SQ FT",554.277754,5,"MQ","200DB"],["Natural Wood Finish",237,"SQ FT",432.2542,5,"MQ","200DB"],["Slat Wall Panel",594,"SQ FT",38214.809025,5,"MQ","200DB"],["Wood, Baseboard",1738.5972222222222,"LF",2331.157506,5,"MQ","200DB"],["Carpet, Medium Grade",22067,"SQ FT",129700.288564,5,"MQ","200DB"],["Vinyl Composite Tile or Sheet",15703,"SQ FT",59830.20482,5,"MQ","200DB"],["Luxury Vinyl Plank",570,"SQ FT",8024.84756,5,"MQ","200DB"],["Demountable, Mirrors, up to 12 SQ FT",1,"EA",82.760652,5,"MQ","200DB"],["Demountable, Mirrors, over 12 SQ FT",12,"EA",1146.032029,5,"MQ","200DB"],["Locker, Box Type",15,"EA",1630.228687,5,"MQ","200DB"],["Wood, 12\" Shelving",47,"LF",976.792222,5,"MQ","200DB"],["Storage Rack",2160,"SQ FT",14044.701216,5,"MQ","200DB"],["Dock Bumpers, Horizontal",12,"LF",640.848519,5,"MQ","200DB"],["Dock Levelers, Mechanical",2,"EA",11367.878203,5,"MQ","200DB"],["Restroom Soap Dispenser, Surface Mounted",11,"EA",1332.91495,5,"MQ","200DB"],["Restroom Paper Towel Dispenser, Surface Mounted",17,"EA",2697.060334,5,"MQ","200DB"],["Horizontal Blinds",650,"SQ FT",11177.060248,5,"MQ","200DB"],["Shades",375,"SQ FT",880.698256,5,"MQ","200DB"],["Shades, Motorized Operation, Add",10,"EA",142.160938,5,"MQ","200DB"],["Base Cabinets",57,"LF",11345.392291,5,"MQ","200DB"],["Wall/Upper Cabinets",64.5,"LF",19713.899553,5,"MQ","200DB"],["Full Height Cabinets",1.5,"LF",250.468086,5,"MQ","200DB"],["Built-in Desk",88,"LF",14804.058824,5,"MQ","200DB"],["Laminate, Countertop",27.5,"LF",5565.26345,5,"MQ","200DB"],["Concrete/Synthetic Countertop",15,"LF",3860.08172,5,"MQ","200DB"],["Wood, Countertop",18,"LF",2276.698684,5,"MQ","200DB"],["Single Bowl, Kitchen Sink",4,"EA",4909.424323,5,"MQ","200DB"],["Single Bowl, Sink",1,"EA",1227.356081,5,"MQ","200DB"],["Clothes Washer, Plumbing Rough-in",3,"EA",442.222954,5,"MQ","200DB"],["Equipment, Floor Drain",3,"EA",2674.886726,5,"MQ","200DB"],["Equipment Rough-in Only",3,"EA",2374.13764,5,"MQ","200DB"],["Interior, Hose Bib",1,"EA",221.944289,5,"MQ","200DB"],["Water Heater, 10 Gallon, Restroom",1,"EA ",840.039766,5,"MQ","200DB"],["Water Heater, 40 Gallon, Specialty Equipment",1,"EA",99.937391,5,"MQ","200DB"],["Water Heater, 50 Gallon, Specialty Equipment",2,"EA",215.902476,5,"MQ","200DB"],["HVAC System, Mini Split Units",4,"EA",12991.860804,5,"MQ","200DB"],["Keypad, Access Control",2,"EA",524.671302,5,"MQ","200DB"],["Garbage Disposal Electric Hook-up",5,"EA",946.282169,5,"MQ","200DB"],["Microwave Electric Hook-up",7,"EA",1324.795037,5,"MQ","200DB"],["Refrigerator Electric Hook-up",6,"EA",1135.538603,5,"MQ","200DB"],["Clothes Dryer Electric Hook-up",3,"EA",567.769301,5,"MQ","200DB"],["Pass Through AC Wall/Split Electric Hook-up",4,"EA",424.109302,5,"MQ","200DB"],["Overhead Garage Door Operator Electric Hook-up",1,"EA",348.53165,5,"MQ","200DB"],["Specialty Equipment Electric Hook-up",23,"EA",3774.666481,5,"MQ","200DB"],["Motorized Shade Operator Electric Hook-up",10,"EA",1641.15934,5,"MQ","200DB"],["Television, 15 Amp Outlet",27,"EA",2862.73779,5,"MQ","200DB"],["Specialty Lighting, Incandescent Light",21,"EA",3935.034763,5,"MQ","200DB"],["Specialty Lighting, Fluorescent, Strip One Lamp",141,"EA",29591.461416,5,"MQ","200DB"],["Specialty Lighting, Fluorescent, Two Lamp",100,"EA",23235.443361,5,"MQ","200DB"],["High Bay Lights",30,"EA",12816.97037,5,"MQ","200DB"],["Exterior Wall-Pack, Metal Halide",13,"EA",7194.24292,5,"MQ","200DB"],["Special Use, 15 - 20 Amp Outlet",145,"EA",15373.962205,5,"MQ","200DB"],["Coaxial Cable Port",59,"EA",4168.872642,5,"MQ","200DB"],["Telephone/Data Port",5,"EA",284.196955,5,"MQ","200DB"],["Specialty Lighting Wiring, Romex, Specialty",305,"EA",32338.334293,5,"MQ","200DB"],["Split Use, Breaker Panels, 60-200 AMPS CAP. Specialty",4,"EA",1788.129506,5,"MQ","200DB"],["Split Use, Switchgear, 1600 AMP, Specialty",5,"EA",57724.901473,5,"MQ","200DB"]];
window.bkDeprImportAssets = function(list, meta){
  meta = meta || {};
  var comps = list.map(function(a){
    return { component:a[0], description:(a[1] != null ? a[1] + ' ' + (a[2] || '') : '').trim(), basis:Number(a[3]) || 0, recovery:Number(a[4]),
             convention:a[5] || 'AUTO', method:a[6] || '', bonus:Number(a[4]) <= 20, source:meta.source || 'Imported study', status:'SOURCE', placed:meta.placed || '' };
  });
  return comps;
};
window.bkDeprSeedHarvard = function(){
  var s = bkLoad(); if(!s) return false;
  s._depr = s._depr || {};
  s._depr.settings = Object.assign({}, window.bkDeprSettings(), {
    landMethod:'dollar', landDollar:4780515.60, landSource:'Cost Seg Study', costSeg:true, detailMode:'detailed',
    depMethod:'macrs', bonusMode:'statutory', closeDate:'2025-12-11', placedInService:'2025-12-11', baseLife:39, costSegFee:5000,
    sourceDoc:'Cost_Segregation_Harvard.xlsx', seededAt:new Date().toISOString() });
  s._depr.components = window.bkDeprImportAssets(HARVARD_ASSETS, { source:'Harvard Cost Seg Study', placed:'2025-12-11' });
  bkSave(s);
  if(typeof showSheet === 'function') showSheet('Depreciation');
  return true;
};
window.bkDeprMacrsAfterTax = afterTaxMacrs;
/* The Depreciation sheet's setters re-render synchronously, which throws when an input replaces itself from its own change handler.
   Run the edit as before but let the re-render happen once the event has finished. */
(function(){
  var orig = window.bkDeprSet; if(typeof orig !== 'function' || orig.__deferred) return;
  var wrapped = function(k, v){
    var real = window.showSheet, ok;
    window.showSheet = function(n){ setTimeout(function(){ real(n); }, 0); };
    try { ok = orig.call(this, k, v); } finally { window.showSheet = real; }
    return ok;
  };
  wrapped.__deferred = true; window.bkDeprSet = wrapped;
})();
})();
