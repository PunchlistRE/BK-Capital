
/* ===========================================================================
   V29.14.0 - CONFLICTING-INPUT CHECKS
   ===========================================================================
   The existing model controls catch out-of-range numbers (vacancy of 150%, a
   hold of zero). This layer catches combinations that are each valid on their
   own but contradict one another - or that quietly create an accounting, tax or
   credit discrepancy - and says WHY, in plain terms, with the deal's own
   numbers.

   Severity
     ERROR  the inputs contradict each other or are impossible; results are
            wrong. Counts as a FAIL control (deal is not decision-grade).
     WARN   legal and calculable, but likely to mislead or to disagree with
            another figure, a lender, a tax return or a JV agreement.
     INFO   a stated assumption worth knowing; never blocks anything.

   bkConflicts()     every rule that fires, with message, why, where to fix it.
   bkAckConflict()   acknowledge a WARN / INFO for this deal (kept on the deal).
   toast             when an edit CREATES a new ERROR / WARN, a card explains it
                     at once. Turned off under automation unless
                     window.BK_CONFLICT_TOASTS === true.
   Rules read the deal and the engines; they never change a number.
   =========================================================================== */
(function(){
'use strict';
if(typeof bkLoad !== 'function' || typeof bkSave !== 'function') return;

var num = function(x){ var v = Number(x); return isFinite(v) ? v : NaN; };
var $ = function(v){ var x = Math.abs(Number(v) || 0).toLocaleString('en-US', {maximumFractionDigits:0}); return (v < 0 ? '-$' : '$') + x; };
var pc = function(v, d){ return isFinite(v) ? (v * 100).toFixed(d == null ? 1 : d) + '%' : 'n/a'; };
function isDev(s){ return /develop/i.test(String(s.dealType || '')); }
function dep(s){ return (s._depr && s._depr.settings) || {}; }
function comps(s){ return (s._depr && Array.isArray(s._depr.components)) ? s._depr.components : []; }
function parseD(v){
  if(v instanceof Date) return v; v = String(v == null ? '' : v);
  var a = /^(\d{4})-(\d{2})-(\d{2})/.exec(v); if(a) return new Date(+a[1], +a[2] - 1, +a[3]);
  var b = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v); if(b) return new Date(+b[3], +b[1] - 1, +b[2]); return null;
}
function safe(f, dflt){ try { return f(); } catch(e){ return dflt; } }

var RULES = [];
function rule(id, level, area, sheet, fn){ RULES.push({ id:id, level:level, area:area, sheet:sheet, fn:fn }); }

/* ===================================================== TAX / DEPRECIATION */
rule('dep.simplified-costseg', 'WARN', 'Depreciation', 'Depreciation', function(s){
  var d = dep(s); if(d.costSeg && d.depMethod !== 'macrs')
    return { msg:'Cost segregation is on, but this deal still uses the simplified straight-line schedule.',
      why:'The simplified schedule recovers every class straight-line and ignores MACRS declining-balance tables, the half-year / mid-quarter / mid-month conventions and the disposal-year rule. A cost-seg study is built on those rules, so Year-1 deductions, tax savings and sale-year recapture will not match the study or the tax return. Switch the deal to tax-grade MACRS.' };
});
rule('dep.bonus-on-real-property', 'WARN', 'Depreciation', 'Depreciation', function(s){
  var bad = comps(s).filter(function(c){ return c.bonus === true && num(c.recovery) > 20; });
  if(bad.length) return { msg:bad.length + ' component' + (bad.length > 1 ? 's are' : ' is') + ' flagged for bonus depreciation but recover over more than 20 years (27.5 / 39-year real property).',
    why:'Bonus depreciation is only available for property with a recovery period of 20 years or less. The engine ignores the flag, so the figure you expect to deduct up front is not deducted - the schedule will look lower than the flag suggests.' };
});
rule('dep.land-zero', 'WARN', 'Depreciation', 'Depreciation', function(s){
  var d = dep(s), hasDep = comps(s).length > 0 || d.costSeg;
  if(!hasDep) return;
  var pp = num(s.purchasePrice), land = d.landMethod === 'percent' ? pp * (num(d.landPct) || 0) : (num(d.landDollar) || 0);
  if(pp > 0 && !(land > 0)) return { msg:'Depreciation is configured but the land value is zero - the whole purchase price would be depreciated.',
    why:'Land is never depreciable. Depreciating it overstates every year’s deduction and tax saving, and understates the taxable gain at sale because the adjusted basis falls too far. Typical allocations are 10-40% of price, set by the assessor’s land-to-total ratio or an appraisal.' };
});
rule('dep.land-extreme', 'WARN', 'Depreciation', 'Depreciation', function(s){
  var d = dep(s); if(!(comps(s).length > 0 || d.costSeg) && !(num(d.landPct) > 0 || num(d.landDollar) > 0)) return;
  var pp = num(s.purchasePrice); if(!(pp > 0)) return;
  var pct = d.landMethod === 'percent' ? num(d.landPct) : (num(d.landDollar) || 0) / pp;
  if(pct > 0.6) return { msg:'Land is ' + pc(pct, 0) + ' of the purchase price - unusually high for an improved property.',
    why:'A high land share leaves little depreciable basis, so the tax shield is small. If the figure is a typo (for example 46.9 entered for 46.9%), the depreciation and after-tax returns are badly understated; if it is right, the property is largely a land play.' };
});
rule('dep.placed-vs-closing', 'WARN', 'Depreciation', 'Depreciation', function(s){
  var d = dep(s), p = parseD(d.placedInService || d.closeDate), c = parseD(s.closing); if(!p || !c) return;
  var days = (p - c) / 86400000;
  if(days < -1) return { msg:'Placed-in-service date (' + (d.placedInService || d.closeDate) + ') is before the closing date (' + s.closing + ').',
    why:'Depreciation starts when the property is placed in service by its owner. A date before closing puts deductions in a tax year (or on an owner) that does not hold the asset, shifts the mid-quarter / mid-month convention, and the first-year amount will not agree with the return.' };
  if(days > 366) return { msg:'Placed-in-service date is more than a year after closing.',
    why:'A stabilised acquisition is normally in service at closing. A long gap is only right for property under construction or renovation; otherwise the first year of depreciation is deferred and early taxable income is overstated.' };
});
rule('dep.placed-after-sale', 'ERROR', 'Depreciation', 'Depreciation', function(s){
  var d = dep(s), p = parseD(d.placedInService || d.closeDate), c = parseD(s.closing), h = num(s.holdYears); if(!p || !c || !(h > 0)) return;
  var sale = new Date(c.getFullYear() + Math.round(h), c.getMonth(), c.getDate());
  if(p > sale) return { msg:'Placed-in-service date is after the planned sale date.', why:'The property would be sold before it is ever depreciated. The depreciation schedule is empty or wrong and the whole gain at sale is mischaracterised.' };
});
rule('dep.bonus-elect-above-statutory', 'WARN', 'Depreciation', 'Depreciation', function(s){
  var d = dep(s); if(d.bonusMode !== 'elect') return;
  var p = parseD(d.placedInService || d.closeDate) || parseD(s.closing); if(!p) return;
  var y = p.getFullYear(), stat = p >= new Date(2025, 0, 20) ? 1 : y <= 2017 ? 0.5 : y <= 2022 ? 1 : y === 2023 ? 0.8 : y === 2024 ? 0.6 : y === 2025 ? 0.4 : y === 2026 ? 0.2 : 0;
  var el = num(d.bonusPct) || 0;
  if(el > stat + 1e-9) return { msg:'Elected bonus of ' + pc(el, 0) + ' is above the statutory rate of ' + pc(stat, 0) + ' for property placed in service ' + (d.placedInService || d.closeDate || s.closing) + '.',
    why:'The law sets the maximum bonus rate by placed-in-service date (and acquisition date). Claiming more than that overstates the first-year deduction and tax saving; a return would not support it.' };
  if(el < stat - 1e-9) return { level:'INFO', msg:'Bonus is elected at ' + pc(el, 0) + ', below the statutory ' + pc(stat, 0) + '.',
    why:'Electing out of (or below) bonus is allowed by class and defers deductions. Make sure it is intentional: the first-year tax saving, and the recapture at sale, are both smaller than at the statutory rate.' };
});
rule('dep.explicit-hy-with-q4', 'WARN', 'Depreciation', 'Depreciation', function(s){
  var cs = comps(s).filter(function(c){ return num(c.recovery) > 0 && num(c.recovery) < 27.5; });
  if(!cs.length) return;
  var d = dep(s), dflt = parseD(d.placedInService || d.closeDate) || parseD(s.closing); if(!dflt) return;
  var tot = 0, q4 = 0, hy = false;
  cs.forEach(function(c){ var p = parseD(c.placed) || dflt, b = num(c.basis) || 0; tot += b; if(p.getMonth() >= 9) q4 += b; if(/half|^hy$/i.test(String(c.convention || ''))) hy = true; });
  if(hy && tot > 0 && q4 / tot > 0.4) return { msg:'Short-life assets are set to the half-year convention, but ' + pc(q4 / tot, 0) + ' of their basis is placed in service in the fourth quarter.',
    why:'The IRS requires the mid-quarter convention when more than 40% of short-life basis is placed in service in the last quarter. Half-year gives a larger first-year deduction than the law allows; the return would be corrected and the schedule here would overstate Year 1. Use AUTO (the engine applies the test).' };
});
rule('dep.mid-month-on-short-life', 'WARN', 'Depreciation', 'Depreciation', function(s){
  var bad = comps(s).filter(function(c){ return num(c.recovery) > 0 && num(c.recovery) < 27.5 && /month|^mm$/i.test(String(c.convention || '')); });
  if(bad.length) return { msg:bad.length + ' short-life component' + (bad.length > 1 ? 's use' : ' uses') + ' the mid-month convention.',
    why:'Mid-month applies only to residential rental (27.5-year) and nonresidential real property (39-year). Personal property (5-, 7-, 15-year) must use half-year or mid-quarter, so the first-year amount here does not match what can be claimed.' };
});
rule('tax.rate-order', 'WARN', 'Tax', 'After-Tax', function(s){
  var t = num(s.taxRate), cg = num(s.capGainsRate), rc = num(s.depRecaptureRate);
  if(isFinite(t) && isFinite(rc) && rc > t + 1e-9) return { msg:'Depreciation recapture rate (' + pc(rc) + ') is higher than the ordinary tax rate (' + pc(t) + ').',
    why:'Unrecaptured Section 1250 gain is taxed at the lesser of the ordinary rate and 25%. A recapture rate above the ordinary rate cannot occur, so sale-year tax is overstated.' };
  if(isFinite(t) && isFinite(cg) && cg > t + 1e-9) return { msg:'Capital-gains rate (' + pc(cg) + ') is higher than the ordinary tax rate (' + pc(t) + ').',
    why:'Long-term capital gains are taxed at or below the ordinary rate. The inputs contradict each other, so the after-tax return is understated.' };
});
rule('tax.rate-percent-typo', 'ERROR', 'Tax', 'After-Tax', function(s){
  var bad = ['taxRate', 'capGainsRate', 'depRecaptureRate'].filter(function(k){ return num(s[k]) > 1; });
  if(bad.length) return { msg:'Tax rate input(s) above 100%: ' + bad.map(function(k){ return k + ' = ' + s[k]; }).join(', ') + '.',
    why:'Rates are stored as decimals (0.37 = 37%). An entry such as 37 is read as 3,700% and wipes out after-tax cash flow.' };
});
rule('tax.losses-usable', 'INFO', 'Tax', 'Depreciation', function(s){
  if(dep(s).lossMode === 'usable') return { msg:'Tax losses are treated as usable against the investor’s other income.',
    why:'That is true for a real estate professional or an investor with passive income elsewhere, and false for most others. If it is not true for the investor, tax savings from depreciation (especially cost segregation) are overstated until the property has income or is sold. This is a property-level view, not an investor tax return.' };
});
rule('tax.costseg-payback', 'WARN', 'Tax', 'Depreciation', function(s){
  var d = dep(s); if(!d.costSeg || d.depMethod !== 'macrs' || !(num(d.costSegFee) > 0) || typeof window.bkCostSegBenefit !== 'function') return;
  var b = safe(function(){ return window.bkCostSegBenefit(); }, null); if(!b) return;
  if(b.netNominalBenefit < 0) return { msg:'Cost segregation costs more than it saves over the hold: net nominal benefit ' + $(b.netNominalBenefit) + ' after the ' + $(b.fee) + ' fee and the extra tax at sale.',
    why:'Accelerated depreciation is recaptured when the property is sold, so the gain from timing can be smaller than the study fee plus the extra recapture tax. On this deal the study does not pay for itself within the modelled hold.' };
});

/* ==================================== ACCOUNTING / STATEMENT CONSISTENCY */
rule('acct.statement-vs-cashflow', 'WARN', 'Reconciliation', 'Deal Underwrite', function(s){
  if(isDev(s)) return;
  var c = safe(function(){ return bkCalc(); }, null), u = safe(function(){ return bkAnnualCF(); }, null); if(!c || !u || !u.arr || !u.arr[0]) return;
  var stmt = c.after, cf = u.arr[0].after, gap = cf - stmt;
  if(!(Math.abs(stmt) > 0) || Math.abs(gap) / Math.abs(stmt) < 0.005) return;
  var cv = typeof bkConventions === 'function' ? bkConventions(s) : {}, why = [];
  if(cv.cvRentGrowthStart === 'month1') why.push('growth compounds from month 1, so Year 1 of the cash flow is above the underwritten rents and expenses');
  if(cv.cvOpexVariablePct > 0) why.push(pc(cv.cvOpexVariablePct, 0) + ' of controllable expenses are treated as varying with occupancy in the cash flow but fixed in the statement');
  if(cv.cvBadDebtBasis === 'legacy') why.push('bad debt is charged on gross rent in the statement but on rent after vacancy in the cash flow');
  return { msg:'Year-1 NOI in the Operating Underwrite (' + $(stmt) + ') does not equal Year-1 NOI in the monthly cash flow (' + $(cf) + '): a gap of ' + $(gap) + ' (' + pc(gap / stmt, 1) + ').',
    why:'The loan is sized, and DSCR and going-in yield are quoted, off one NOI; returns, the sale price and the waterfall run off the other. Reasons here: ' + (why.length ? why.join('; ') + '.' : 'rent-roll or lease timing differences between the statement and the monthly build.') + ' The two should agree in Year 1 unless you intend a difference - otherwise lenders, investors and your own return summary will quote different NOIs.',
    data:{ statement:stmt, cashflow:cf, gap:gap } };
});
rule('acct.ltv-on-value', 'WARN', 'Debt', 'Deal Underwrite', function(s){
  if(isDev(s)) return; var cv = typeof bkConventions === 'function' ? bkConventions(s) : {};
  if(cv.cvLtvBasis === 'value' && !cv.legacyFields.length) return { msg:'Acquisition LTV is measured on underwritten value (Year-1 NOI ÷ exit cap).',
    why:'The loan then depends on your exit cap: tightening the exit cap increases the loan you "qualify" for. Lenders size on appraised value or price, not on your sale assumption, so the loan and equity cheque can be overstated and the debt quote circular. Price or the lesser of price and value is the usual basis.' };
});
rule('acct.legacy-methodology', 'INFO', 'Reconciliation', 'Deal Underwrite', function(s){
  if(isDev(s)) return; var cv = typeof bkConventions === 'function' ? bkConventions(s) : null;
  if(cv && cv.legacyFields.length && !cv.isLegacy) return { msg:'Some underwriting conventions are at legacy values and others at the current standard (' + cv.legacyFields.join(', ') + ' are legacy).',
    why:'Mixing methodologies makes results hard to compare with other deals and with the independent audit. Move all five to the standard, or all to legacy, unless you have a specific reason.' };
});
rule('acct.hurdle-on-deal-equity', 'WARN', 'Waterfall', 'Equity Waterfall', function(s){
  if(typeof bkConventions !== 'function') return; var cv = bkConventions(s); if(isDev(s) || cv.cvHurdleBasis !== 'deal' || cv.legacyFields.indexOf('cvHurdleBasis') >= 0) return;
  return { msg:'Waterfall hurdles are tested on total deal equity cash flows rather than the LP’s own.',
    why:'Most JV agreements measure the preferred return and IRR hurdles on the LP’s contributions and distributions. Testing on total equity (including the GP’s catch-up and promote) can move promote tiers earlier than the LP has actually earned its return, so the GP promote is overstated relative to the agreement.' };
});
rule('acct.occupancy-vs-vacancy', 'WARN', 'Revenue', 'Deal Underwrite', function(s){
  var o = num(s.occupancy), v = num(s.vacancy); if(!isFinite(o) || !isFinite(v) || o <= 0) return;
  if(Math.abs(o - (1 - v)) > 0.01) return { msg:'Occupancy (' + pc(o) + ') and vacancy (' + pc(v) + ') do not add to 100%.',
    why:'Only vacancy drives the engine; the occupancy field is carried for display. Two inputs for the same thing that disagree mean someone reading the sheet sees a different occupancy from the one that produced the numbers.' };
});
rule('acct.rentroll-vs-flat', 'WARN', 'Revenue', 'Rent Roll', function(s){
  var rr = Array.isArray(s.rentRoll) ? s.rentRoll : []; if(!rr.length || !(num(s.avgRent) > 0) || !(num(s.units) > 0) || typeof bkRentRollStats !== 'function') return;
  var st = safe(function(){ return bkRentRollStats(rr); }, null); if(!st) return;
  var rrG = (/market/i.test(String(s.rentAppliedBasis || '')) ? st.resMarket : st.resInPlace) * 12, flat = num(s.avgRent) * num(s.units) * 12;
  if(rrG > 0 && Math.abs(flat - rrG) / rrG > 0.02) return { msg:'A rent roll is loaded (' + $(rrG) + ' a year) and it differs from the flat rent inputs (' + $(flat) + ') by ' + pc((flat - rrG) / rrG) + '.',
    why:'When a rent roll exists it silently overrides the flat Average Rent and Units inputs. Anything still reading the flat inputs - a quick check, an offering memo, the break-even rent - will disagree with the model’s revenue.' };
});
rule('acct.reserves-zero', 'WARN', 'Operations', 'Deal Underwrite', function(s){
  if(isDev(s) || !(num(s.units) > 0) || /office|retail|industrial|land/i.test(String(s.propertyType || ''))) return;
  if(!(num(s.reserves) > 0)) return { msg:'Replacement reserves are zero on a residential property.',
    why:'NOI after reserves is what lenders size on and what buyers capitalise. Typical underwriting uses $250-$350 per unit a year. Zero reserves overstates NOI, the loan, the exit value and every return.' };
});
rule('acct.mgmt-zero', 'WARN', 'Operations', 'Deal Underwrite', function(s){
  if(isDev(s)) return; if(num(s.mgmtPct) === 0 && num(s.units) > 0) return { msg:'Management fee is zero.',
    why:'Even when the sponsor self-manages, lenders and buyers impute a fee (typically 2-4% of EGI). Excluding it overstates NOI and the exit value by roughly the fee divided by the cap rate.' };
});
rule('acct.exit-below-going-in', 'WARN', 'Exit', 'Deal Underwrite', function(s){
  if(isDev(s)) return; var u = safe(function(){ return bkAnnualCF(); }, null), pp = num(s.purchasePrice), cap = num(s.exitCap); if(!u || !(pp > 0) || !(cap > 0)) return;
  var gi = u.arr[0].after / pp;
  if(cap < gi - 0.0005) return { msg:'Exit cap (' + pc(cap, 2) + ') is below the going-in yield (' + pc(gi, 2) + ').',
    why:'That assumes the market prices the property more richly when you sell than when you buy (cap-rate compression). Institutional underwriting normally holds the exit cap at or above going-in, adding 25-50 bps for age. Part of the return then comes from the assumption, not from operations.' };
});
rule('acct.units-vs-gsf', 'WARN', 'Property', 'Deal Underwrite', function(s){
  var u = num(s.units), g = num(s.gsf); if(!(u > 0) || !(g > 0) || /office|retail|industrial|land/i.test(String(s.propertyType || ''))) return;
  var a = g / u; if(a < 300 || a > 3000) return { msg:'Average unit size of ' + Math.round(a).toLocaleString('en-US') + ' SF (GSF ÷ units) is outside a plausible 300-3,000 SF.',
    why:'Units or gross SF is probably wrong. Per-unit and per-SF metrics, the reserve and miscellaneous expense lines scaled by GSF, and the break-even rent per unit will all be off.' };
});
rule('acct.noi-not-positive', 'WARN', 'Operations', 'Operating Underwrite', function(s){
  if(isDev(s)) return; var c = safe(function(){ return bkCalc(); }, null);
  if(c && !(c.after > 0)) return { msg:'Year-1 NOI after reserves is ' + $(c.after) + '.', why:'With no positive NOI there is no loan, no valuation and no meaningful return. Check expenses, rent and units for an entry error before reading any result.' };
});
rule('acct.expense-ratio', 'WARN', 'Operations', 'Operating Underwrite', function(s){
  if(isDev(s)) return; var c = safe(function(){ return bkCalc(); }, null); if(!c || !(c.egi > 0)) return;
  var r = c.total / c.egi;
  if(r < 0.2 || r > 0.75) return { msg:'Operating expense ratio is ' + pc(r, 0) + ' of EGI.', why:'Multifamily typically runs 35-55% (higher with heavy taxes). A ratio this far outside suggests missing or duplicated expense lines, which flows straight into NOI, loan size and value.' };
});

/* ============================================================ DEBT */
rule('debt.loan-above-cost', 'ERROR', 'Debt', 'Debt', function(s){
  if(isDev(s) || s.debtEnabled === false) return; var d = safe(function(){ return bkDebt(); }, null); if(!d || !(d.loan > 0) || !(d.basis > 0)) return;
  if(d.loan > d.basis * 1.0001) return { msg:'The sized loan (' + $(d.loan) + ') exceeds total acquisition cost (' + $(d.basis) + ').', why:'Lending more than 100% of cost returns cash to the buyer at closing; equity would be negative. One of price, LTV, LTC or the value basis is wrong.' };
});
rule('debt.term-before-hold', 'WARN', 'Debt', 'Debt', function(s){
  if(isDev(s) || s.debtEnabled === false) return; var t = num(s.debtTerm), h = num(s.holdYears);
  if(t > 0 && h > t && !num(s.refiAtMaturity)) return { msg:'Loan term is ' + t + ' years but the hold is ' + h + ' years, with no refinance at maturity.',
    why:'The balance falls due before the planned sale. The engine repays it from equity at maturity as a balloon; a real refinance would carry new fees, a new rate and its own DSCR test, none of which are modelled unless you turn on refinance at maturity.' };
});
rule('debt.floating-unhedged', 'WARN', 'Debt', 'Debt', function(s){
  if(isDev(s) || s.debtEnabled === false) return;
  if(/float/i.test(String(s.debtRateType || '')) && !(num(s.rateCapStrike) > 0)) return { msg:'Debt is floating-rate with no interest rate cap.',
    why:'A floating loan without a cap has unbounded rate risk, and most lenders require a cap. The cap cost is also missing from sources and uses, which understates the equity cheque.' };
});
rule('debt.floating-zero-index', 'ERROR', 'Debt', 'Debt', function(s){
  if(isDev(s) || s.debtEnabled === false) return;
  if(/float/i.test(String(s.debtRateType || '')) && !(num(s.debtIndexRate) > 0) && !(num(s.debtSpread) > 0)) return { msg:'Floating-rate debt has a zero index and a zero spread.',
    why:'The coupon would be 0% (or silently fall back to the fixed-rate input). Debt service, DSCR and returns are all wrong until an index rate and spread are entered.' };
});
rule('debt.io-longer-than-term', 'WARN', 'Debt', 'Debt', function(s){
  if(isDev(s) || s.debtEnabled === false) return; var io = num(s.acqIO), t = num(s.debtTerm);
  if(io > 0 && t > 0 && io > t + 1e-9) return { msg:'Interest-only period (' + io + ' years) is longer than the loan term (' + t + ' years).', why:'The interest-only period is entered in years. If it exceeds the term the loan never amortises, the balloon equals the full loan, and the amortisation and DSCR you see are not what a lender would underwrite.' };
});
rule('debt.dscr-below-one', 'WARN', 'Debt', 'Covenant Monitor', function(s){
  if(isDev(s) || s.debtEnabled === false) return; var u = safe(function(){ return bkAnnualCF(); }, null), d = safe(function(){ return bkDebt(); }, null);
  if(!u || !d || !d.annual || !d.annual[0] || !(d.annual[0].payment > 0)) return; var x = u.arr[0].after / d.annual[0].payment;
  if(x < 1) return { msg:'Year-1 DSCR is ' + x.toFixed(2) + 'x - NOI does not cover debt service.', why:'The property does not pay its own debt. Equity funds the shortfall every period (an equity call in the waterfall), and any lender covenant would be in default from day one.' };
});
rule('debt.sizing-looser-than-policy', 'WARN', 'Debt', 'Debt Capacity', function(s){
  if(isDev(s) || s.debtEnabled === false || typeof window.bkDebtCapacity !== 'function') return; var c = safe(function(){ return window.bkDebtCapacity(); }, null);
  if(c && c.overage > (c.policy.maxDebtOverage || 0)) return { msg:'The loan the engine sized (' + $(c.requested) + ') is ' + $(c.overage) + ' above what house credit policy supports (' + $(c.capacity) + ', binding: ' + c.binding.name + ').',
    why:'Deal loan terms (LTV / DSCR at the actual coupon) are looser than the house policy tests (including a stressed coupon). The returns assume debt the credit committee would not approve; see Debt Capacity and the IC gate.' };
});

/* ====================================================== REFINANCE */
rule('refi.year-out-of-range', 'ERROR', 'Refinance', 'Refi / Recap', function(s){
  if(!s._refi || isDev(s) || typeof window.bkRefiInputs !== 'function') return; var i = window.bkRefiInputs(), h = Math.round(num(s.holdYears) || 0);
  if(h >= 2 && (i.year < 1 || i.year > h - 1)) return { msg:'Refinance year ' + i.year + ' is outside the hold (valid: 1 to ' + (h - 1) + ').', why:'A refinance at or after the sale date repays a loan that is repaid anyway, and one before closing does not exist. The cash-out, new debt service and exit payoff in the refinance analysis are meaningless until the year is inside the hold.' };
});
rule('refi.post-dscr-below-policy', 'WARN', 'Refinance', 'Refi / Recap', function(s){
  if(!s._refi || isDev(s) || typeof window.bkRefi !== 'function' || typeof window.bkPolicy !== 'function') return; var R = safe(function(){ return window.bkRefi(); }, null), p = window.bkPolicy();
  if(R && R.selected && R.selected.postDSCR < p.minDSCR - 1e-9) return { msg:'The refinanced loan covers debt service ' + R.selected.postDSCR.toFixed(2) + 'x, below the house policy minimum of ' + p.minDSCR.toFixed(2) + 'x.', why:'The refinance is sized to its own DSCR input (' + R.inputs.minDSCR.toFixed(2) + 'x), which is looser than house credit policy. The cash-out shown is more than the credit committee would approve, so the recap return is overstated relative to what could actually be financed.' };
});
rule('refi.cash-out-negative', 'WARN', 'Refinance', 'Refi / Recap', function(s){
  if(!s._refi || isDev(s) || typeof window.bkRefi !== 'function') return; var R = safe(function(){ return window.bkRefi(); }, null);
  if(R && R.selected && R.selected.netCashOut < 0) return { msg:'The refinance in year ' + R.selected.year + ' needs ' + $(-R.selected.netCashOut) + ' of new equity: the new loan does not repay the existing one plus costs.', why:'A "refinance" that requires equity is a paydown, not a cash-out. The return impact treats it as an equity contribution, which lowers IRR; check the appraisal cap, coupon and constraints before presenting it as a recap.' };
});

/* ========================================================= WATERFALL */
rule('wf.promote-decreasing', 'WARN', 'Waterfall', 'Equity Waterfall', function(s){
  var a = num(s.t2LP), b = num(s.t3LP), c = num(s.t4LP);
  if(isFinite(a) && isFinite(b) && isFinite(c) && (b > a + 1e-9 || c > b + 1e-9)) return { msg:'LP share of distributions rises at higher tiers (' + pc(a, 0) + ' → ' + pc(b, 0) + ' → ' + pc(c, 0) + ').',
    why:'A promote normally gives the GP a larger share as returns rise, so the LP share falls tier by tier. A rising LP share means the GP is paid less for outperformance, which is almost certainly a transposed entry and changes the promote materially.' };
});
rule('wf.gp-share-extreme', 'WARN', 'Waterfall', 'Equity Waterfall', function(s){
  var g = num(s.gpShare); if(g >= 0.5 && g <= 1) return { msg:'GP co-investment is ' + pc(g, 0) + ' of equity.', why:'GP co-invest is usually 5-20%. At this level the LP is the minority owner; check that GP and LP were not swapped, since it changes both contributions and the promote base.' };
});

/* =================================================== DEVELOPMENT */
rule('dev.no-construction', 'ERROR', 'Development', 'Development', function(s){
  if(isDev(s) && !(num(s.constructionMonths) > 0)) return { msg:'Development deal with a construction period of zero months.', why:'There is nothing to build: no costs are drawn on a schedule, no construction interest accrues, and lease-up starts at closing. Set the construction months, or change the deal type to Acquisition.' };
});
rule('dev.con-loan-zero-rate', 'ERROR', 'Development', 'Development', function(s){
  if(isDev(s) && num(s.conLTC) > 0 && !(num(s.conRate) > 0)) return { msg:'A construction loan is sized (' + pc(num(s.conLTC), 0) + ' LTC) with a 0% interest rate.', why:'Capitalised construction interest, which is a major cost line, would be zero. Total cost, the loan commitment and the equity requirement are all understated.' };
});
rule('dev.no-leaseup', 'WARN', 'Development', 'Development', function(s){
  if(isDev(s) && num(s.constructionMonths) > 0 && !(num(s.leaseupMonths) > 0)) return { msg:'No lease-up period after construction.', why:'The building is assumed fully income-producing the day it is completed. New buildings take months to fill; this overstates early NOI, skips the lease-up operating deficit and moves stabilisation (and the refinance) too early.' };
});
rule('dev.takeout-shortfall', 'WARN', 'Development', 'Debt', function(s){
  if(!isDev(s) || !num(s.refiAtStab) || typeof bkDevTakeoutV11 !== 'function') return; var t = safe(function(){ return bkDevTakeoutV11(); }, null);
  if(t && t.refiShortfall > 1) return { msg:'The permanent loan is ' + $(t.refiShortfall) + ' short of repaying the construction loan at takeout.', why:'Equity must be added at conversion to retire the construction loan. The returns include that late equity call, but the sources and uses at closing will not show it - an investor may be surprised by a second capital call.' };
});
rule('dev.conventions-ignored', 'INFO', 'Development', 'Deal Underwrite', function(s){
  if(isDev(s) && typeof bkConventions === 'function' && Object.keys(window.BK_CV_STANDARD || {}).some(function(k){ return s[k] !== undefined && s[k] !== null && s[k] !== '' && String(s[k]) !== String(window.BK_CV_STANDARD[k]); }))
    return { msg:'Acquisition underwriting conventions are set on a development deal.', why:'They do not apply: development deals use their own methodology (construction-loan sizing, construction-period cash flows, annual growth). The settings are stored but have no effect, so they should not be quoted as part of the deal’s methodology.' };
});

/* ================================================ POLICY / IC */
rule('pol.thresholds-inverted', 'ERROR', 'Credit Policy', 'Credit Policy', function(s){
  if(typeof window.bkPolicy !== 'function') return; var p = window.bkPolicy();
  if(p.advanceScore < p.conditionalScore) return { msg:'The gate score to APPROVE (' + pc(p.advanceScore, 0) + ') is below the score for CONDITIONAL (' + pc(p.conditionalScore, 0) + ').', why:'A deal could never be conditional-but-not-approved; the verdict logic is contradictory until the thresholds are in order.' };
});
rule('pol.dscr-below-one', 'ERROR', 'Credit Policy', 'Credit Policy', function(s){
  if(typeof window.bkPolicy !== 'function') return; var p = window.bkPolicy();
  if(p.minDSCR < 1) return { msg:'Policy minimum DSCR is ' + p.minDSCR.toFixed(2) + 'x, below 1.00x.', why:'A minimum below 1.0x approves loans whose income does not cover payments, so the debt-capacity limit stops constraining anything.' };
});
rule('pol.weights', 'WARN', 'Credit Policy', 'Credit Policy', function(s){
  var g = (s._policy && s._policy.gates) || null; if(!g || !window.BK_GATES) return;
  var w = window.BK_GATES.reduce(function(a, x){ var o = g[x[0]] || {}; return a + ((o.weight !== undefined && isFinite(Number(o.weight))) ? Number(o.weight) : x[5]); }, 0);
  if(Math.abs(w - 1) > 1e-9) return { msg:'IC gate weights total ' + pc(w, 1) + ', not 100%.', why:'The weighted gate score is a share of the weights that pass. If they do not total 100% the score is mis-scaled and the APPROVE / CONDITIONAL thresholds mean something different from what the policy intended.' };
});
rule('pol.override-incomplete', 'WARN', 'Credit Policy', 'IC Memo', function(s){
  var o = (s._ic && s._ic.override) || {}; if(o.on === 'YES' && (!String(o.reason || '').trim() || !String(o.approvedBy || '').trim()))
    return { msg:'A credit override is switched on without ' + (!String(o.reason || '').trim() ? 'a reason' : 'an approver') + '.', why:'An override only takes effect with YES, a documented reason and a named approver. As entered it does nothing, so the debt-capacity exception still blocks the deal - but anyone reading the switch alone would assume it was waived.' };
});
rule('pol.override-unneeded', 'INFO', 'Credit Policy', 'IC Memo', function(s){
  var o = (s._ic && s._ic.override) || {}; if(o.on !== 'YES' || !String(o.reason || '').trim() || !String(o.approvedBy || '').trim() || typeof window.bkDebtCapacity !== 'function') return;
  var c = safe(function(){ return window.bkDebtCapacity(); }, null); if(c && c.overage <= (c.policy.maxDebtOverage || 0)) return { msg:'A credit override is recorded, but the loan is within house capacity.', why:'The override has no effect on this deal. Remove it so an old waiver does not carry over if the structure changes later.' };
});

/* ==================================================== evaluation */
var LEVEL_ORDER = { ERROR:0, WARN:1, INFO:2 };
function conflicts(){
  var s = bkLoad(); if(!s || (typeof bkIsProvisioned === 'function' && !bkIsProvisioned())) return [];
  var ack = s._ack || {}, out = [];
  RULES.forEach(function(r){
    var res; try { res = r.fn(s); } catch(e){ res = null; }
    if(res) out.push({ id:r.id, level:res.level || r.level, area:r.area, sheet:r.sheet, message:res.msg, why:res.why, data:res.data || null, acknowledged:!!ack[r.id] });
  });
  out.sort(function(a, b){ return (LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]) || a.area.localeCompare(b.area); });
  return out;
}
window.bkConflicts = conflicts;
window.BK_CONFLICT_RULES = RULES.map(function(r){ return { id:r.id, level:r.level, area:r.area }; });
/* other modules (the operating-business model) register their own rules */
window.bkAddConflictRule = function(id, level, area, sheet, fn){ rule(id, level, area, sheet, fn); window.BK_CONFLICT_RULES = RULES.map(function(r){ return { id:r.id, level:r.level, area:r.area }; }); };
window.bkConflictHelpers = { $:$, pc:pc, safe:safe };
window.bkAckConflict = function(id, on){
  var s = bkLoad(); if(!s) return; s._ack = s._ack || {};
  if(on === false) delete s._ack[id]; else s._ack[id] = { at:new Date().toISOString() };
  bkSave(s); setTimeout(function(){ if(typeof showSheet === 'function' && typeof currentSheet !== 'undefined') showSheet(currentSheet); }, 0);
  if(on !== false) queue = queue.filter(function(q){ return q.id !== id; });        /* the card goes at once, not at the next re-check */
  renderToast();
};

/* ---- feed the existing readiness controls: ERROR blocks decision-grade, WARN is listed */
var prevCtl = window.bkModelControls;
if(typeof prevCtl === 'function' && !prevCtl.__bkConflicts){
  var wrapped = function(){
    var out = prevCtl.apply(this, arguments);
    try {
      if(Array.isArray(out)) conflicts().forEach(function(c){
        if(c.level === 'INFO') return;
        out.push({ level:c.level === 'ERROR' ? 'FAIL' : 'WARN', area:c.area, msg:c.message + ' Why it matters: ' + c.why, conflictId:c.id });
      });
    } catch(e){}
    return out;
  };
  wrapped.__bkConflicts = true; window.bkModelControls = wrapped;
}

/* ---- pop-up when an edit creates a new conflict */
var seen = null, seenKey = null, queue = [], timer = null;
function dealKey(){ var s = bkLoad(); return s ? String(s.dealId || '') + '|' + String((s._provenance && s._provenance.createdAt) || '') : ''; }
function enabled(){ return window.BK_CONFLICT_TOASTS === true || (window.BK_CONFLICT_TOASTS !== false && !navigator.webdriver); }
function check(){
  timer = null; var key = dealKey(); if(!key) return;
  var now = conflicts().filter(function(c){ return c.level !== 'INFO'; }), ids = {};
  now.forEach(function(c){ ids[c.id] = c; });
  if(seen === null || key !== seenKey){ seen = {}; Object.keys(ids).forEach(function(k){ seen[k] = true; }); seenKey = key; queue = []; renderToast(); return; }   /* a new deal: baseline, no pop-up */
  var fresh = now.filter(function(c){ return !seen[c.id] && !c.acknowledged; });
  Object.keys(seen).forEach(function(k){ if(!ids[k]) delete seen[k]; });          /* resolved conflicts can warn again later */
  now.forEach(function(c){ seen[c.id] = true; });
  fresh.forEach(function(c){ if(!queue.some(function(q){ return q.id === c.id; })) queue.push(c); });
  queue = queue.filter(function(q){ return ids[q.id] && !ids[q.id].acknowledged; });
  renderToast();
}
function renderToast(){
  if(!enabled() || typeof document === 'undefined') return;
  var el = document.getElementById('bk-conflict-toast');
  if(!queue.length){ if(el) el.remove(); return; }
  if(!el){
    el = document.createElement('div'); el.id = 'bk-conflict-toast';
    el.style.cssText = 'position:fixed;right:18px;bottom:18px;width:400px;max-width:calc(100vw - 36px);z-index:99999;font:13px/1.45 system-ui,sans-serif;display:flex;flex-direction:column;gap:10px';
    document.body.appendChild(el);
  }
  var esc = function(v){ return String(v).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
  el.innerHTML = queue.slice(0, 3).map(function(c){
    var col = c.level === 'ERROR' ? '#A93B2C' : '#B8860B';
    return '<div class="bk-conflict-card" data-id="' + c.id + '" style="background:#fff;border:1px solid #d9d4c8;border-left:5px solid ' + col + ';border-radius:6px;box-shadow:0 6px 24px rgba(0,0,0,.18);padding:12px 14px;color:#222">'
      + '<div style="font-weight:700;color:' + col + ';margin-bottom:4px">' + (c.level === 'ERROR' ? 'Conflict: results will be wrong' : 'Check this selection') + ' · ' + esc(c.area) + '</div>'
      + '<div style="margin-bottom:6px">' + esc(c.message) + '</div>'
      + '<div style="font-size:12px;color:#444;background:#f7f5ef;border-radius:4px;padding:7px 9px"><b>Why it matters.</b> ' + esc(c.why) + '</div>'
      + '<div style="display:flex;gap:8px;margin-top:9px;justify-content:flex-end">'
      + '<button type="button" onclick="bkConflictDismiss(\'' + c.id + '\')" style="cursor:pointer;border:1px solid #bbb;background:#fff;border-radius:4px;padding:4px 10px">Dismiss</button>'
      + (c.level === 'ERROR' ? '' : '<button type="button" onclick="bkAckConflict(\'' + c.id + '\')" style="cursor:pointer;border:1px solid #bbb;background:#fff;border-radius:4px;padding:4px 10px">Acknowledge</button>')
      + '<button type="button" onclick="bkConflictDismiss(\'' + c.id + '\');showSheet(\'Model Checks\')" style="cursor:pointer;border:0;background:#163a62;color:#fff;border-radius:4px;padding:4px 10px">All checks</button></div></div>';
  }).join('') + (queue.length > 3 ? '<div style="text-align:right;font-size:12px"><a href="#" onclick="showSheet(\'Model Checks\');return false" style="color:#163a62">+' + (queue.length - 3) + ' more on Model Checks</a></div>' : '');
}
window.bkConflictDismiss = function(id){ queue = queue.filter(function(q){ return q.id !== id; }); renderToast(); };
var origSave = window.bkSave;
if(!origSave.__bkConflicts){
  var hooked = function(d){
    var r = origSave.apply(this, arguments);
    if(window.bkSave === hooked){ if(timer) clearTimeout(timer); timer = setTimeout(check, 350); }    /* not inside a scenario run, which swaps bkSave */
    return r;
  };
  hooked.__bkConflicts = true; window.bkSave = hooked;
  try { bkSave = hooked; } catch(e){}
}
window.bkConflictsCheckNow = check;
})();
