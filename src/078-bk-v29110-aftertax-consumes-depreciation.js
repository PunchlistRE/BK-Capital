
/* ===========================================================================
   V29.11.0 - AFTER-TAX CONSUMES THE CANONICAL DEPRECIATION ENGINE
   ===========================================================================
   bkAfterTaxV18 carried its own straight-line depreciation:

       landValue  = totalBasis * s.landValuePct      (default 20%)
       deprBasis  = totalBasis - landValue
       annualDepr = deprBasis / s.deprLife           (default 39)

   That is a second depreciation engine. With the Depreciation module now
   authoritative, After-Tax must consume it - including bonus, which the old
   calculation had no concept of at all.

   HOW THIS IS WIRED SAFELY

   bkAfterTaxV18 is NOT rewritten. It is wrapped. The wrapper asks the
   canonical engine for a schedule and, when the deal actually has
   depreciation configured, substitutes the depreciation stream and everything
   downstream of it (taxable income, loss carryforward, tax, accumulated
   depreciation, adjusted basis, recapture, after-tax IRR/MOIC).

   When a deal has NO depreciation configured, the legacy calculation is left
   exactly as it was. That is deliberate: it keeps every existing deal's
   After-Tax numbers unchanged unless the user has actually entered
   depreciation assumptions, so this change cannot silently move economics on
   deals nobody has touched.

   ECONOMIC CHANGE: yes, and intentionally, for deals WITH depreciation
   configured. Documented in the Economic Delta Report. bkCalc, bkAnnualCF,
   bkMonthlyReturns, bkDebt, bkRentRollStats, bkSponsorV08 and the recovery
   gate are untouched - test_parity.js still reports EXACT.
   =========================================================================== */
(function(){
'use strict';

if(typeof bkAfterTaxV18 !== 'function') return;
var _legacy = bkAfterTaxV18;

function canonical(){
  try {
    if(typeof window.bkDepreciation !== 'function') return null;
    var e = window.bkDepreciation();
    /* Only take over when the user has genuinely configured depreciation and
       it is valid. An out-of-balance or invalid allocation must not silently
       feed a tax calculation. */
    if(!e || e.errors.length || e.allocated <= 0) return null;
    if(!e.settings.costSeg && !(e.landValue > 0) && !(e.capex > 0)) return null;   /* nothing entered yet: a 0% land default is a blank, not an assumption */
    return e;
  } catch(err){ return null; }
}

window.bkAfterTaxV18 = function(){
  var base = _legacy();
  var e = canonical();
  if(!e) { base.deprSource = 'legacy-straight-line'; base.deprTie = null; return base; }

  var sch;
  try { sch = window.bkDepreciationSchedule(base.rows.length + 1); }
  catch(err){ base.deprSource = 'legacy-straight-line'; return base; }

  var s = base.s, u = base.u, d = base.d, r = base.r;
  var n = base.rows.length;

  /* Map the schedule's TAX YEARS onto the model's hold years. Year 1 of the
     model is the first full year following the schedule's start year, which is
     the acquisition/closing year. */
  var startYear = sch.startYear;
  var byYear = {};
  sch.rows.forEach(function(row){ byYear[row.taxYear] = row; });

  var rows = [], accumDepr = 0, lossCF = 0;
  for(var y = 0; y < n; y++){
    var taxYear = startYear + y + 1;          /* model year 1 = first full year */
    var srow = byYear[taxYear] || {regular:0, bonus:0, total:0};
    var noi = u.arr[y].after;
    var interest = (d.annual[y] || {interest:0}).interest;

    var room = Math.max(0, e.allocated - accumDepr);
    var regular = Math.min(srow.regular, room);
    var bonus   = Math.min(srow.bonus, Math.max(0, room - regular));
    var depr    = regular + bonus;
    accumDepr += depr;

    var taxableIncome = noi - interest - depr, taxDue = 0;
    if(taxableIncome > 0){
      var offset = Math.min(lossCF, taxableIncome);
      lossCF -= offset; taxableIncome -= offset;
      taxDue = taxableIncome * (Number(s.taxRate) || 0);
    } else {
      lossCF += -taxableIncome; taxableIncome = 0;
    }
    rows.push({ y:y+1, taxYear:taxYear, noi:noi, interest:interest,
                depr:depr, regularDepr:regular, bonusDepr:bonus,
                accumDepr:accumDepr, taxableIncome:taxableIncome, taxDue:taxDue, lossCF:lossCF });
  }

  /* Sale-year tax. Total acquisition basis still includes capitalised closing
     costs (u.initial) - depreciation runs off the building basis, but the
     basis recovered at sale is what the buyer actually paid in. */
  var totalBasis = base.totalBasis;
  var adjustedBasis = totalBasis - accumDepr;
  var totalGain = Math.max(0, u.netSale - adjustedBasis);
  var lossUsedAtSale = Math.min(lossCF, totalGain);
  var gainAfterCarryforward = Math.max(0, totalGain - lossUsedAtSale);
  var recaptureBase = Math.min(gainAfterCarryforward, accumDepr);
  var recaptureTax = recaptureBase * (Number(s.depRecaptureRate) || 0);
  var capGainBase = Math.max(0, gainAfterCarryforward - recaptureBase);
  var capGainTax = capGainBase * (Number(s.capGainsRate) || 0);
  var saleTax = recaptureTax + capGainTax;

  var values = [], dates = [];
  for(var i = 0; i < r.rows.length; i++){
    var row = r.rows[i], cf = row.cf, yy = Math.floor(i/12);
    if((i+1) % 12 === 0 && rows[yy]) cf -= rows[yy].taxDue;
    if(i === r.rows.length - 1) cf -= saleTax;
    values.push(cf); dates.push(row.dt);
  }
  var atIRR = bkXirrClose(values, dates, r.closeDt, -(Number(r.rows[0]&&r.rows[0].eqDraw)||0));
  var inflows  = values.reduce(function(a,v){ return a + Math.max(0,v); }, 0);
  var outflows = values.reduce(function(a,v){ return a + Math.max(0,-v); }, 0);
  var atMOIC = outflows ? inflows/outflows : 0;

  return {
    s:s, u:u, d:d, r:r, rows:rows,
    totalBasis:totalBasis,
    landValue:e.landValue, landPct:e.landPct,
    deprBasis:e.depreciableBasis, allocatedBasis:e.allocated,
    life:e.baseLife, annualDepr:null,
    bonusPct:e.bonusPct, bonusEligibleBasis:e.bonusEligibleBasis, bonusDeduction:e.bonusDeduction,
    accumDepr:accumDepr, adjustedBasis:adjustedBasis, totalGain:totalGain,
    lossCFAtSale:lossCF, lossUsedAtSale:lossUsedAtSale,
    recaptureBase:recaptureBase, recaptureTax:recaptureTax,
    capGainBase:capGainBase, capGainTax:capGainTax, saleTax:saleTax,
    values:values, dates:dates, atIRR:atIRR, atMOIC:atMOIC,
    preTaxIRR:r.irr, preTaxMOIC:r.moic,
    deprSource:'canonical-depreciation-engine',
    deprTie:e.tie, deprSchedule:sch
  };
};

/* ---------------------------------------------------------------- renderer */
/* The existing After-Tax renderer stays. It is extended with the rows section
   16 requires: regular vs bonus depreciation split, and an explicit statement
   of which engine produced the numbers. */
if(typeof RENDERERS !== 'undefined' && typeof RENDERERS['After-Tax'] === 'function'){
  var _r = RENDERERS['After-Tax'];
  if(!_r.__bkDeprWired){
    var wrapped = function(){
      var o = _r.apply(this, arguments);
      var x;
      try { x = bkAfterTaxV18(); } catch(err){ return o; }
      var money = function(n){
        var v = Number(n)||0, neg = v<0, a = Math.abs(v);
        var body = a < 100 ? a.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
                           : a.toLocaleString('en-US',{maximumFractionDigits:0});
        return neg ? '($'+body+')' : '$'+body;
      };

      if(x.deprSource === 'canonical-depreciation-engine'){
        var shown = x.rows.slice(0,10);
        var heads = shown.map(function(r){ return '<th>Year '+r.y+'</th>'; }).join('');
        var split = '<div class="tbl-wrap" style="margin-top:16px;"><table class="fin">'
          + '<caption>Depreciation Detail - From the Canonical Depreciation Engine</caption>'
          + '<thead><tr><th class="rowlabel-h">Line Item</th>'+heads+'</tr></thead><tbody>'
          + '<tr><td class="rowlabel">Tax Year</td>'+shown.map(function(r){return '<td>'+r.taxYear+'</td>';}).join('')+'</tr>'
          + '<tr><td class="rowlabel">Regular Depreciation</td>'+shown.map(function(r){return '<td>'+money(r.regularDepr)+'</td>';}).join('')+'</tr>'
          + '<tr><td class="rowlabel">Bonus Depreciation</td>'+shown.map(function(r){return '<td>'+money(r.bonusDepr)+'</td>';}).join('')+'</tr>'
          + '<tr class="grandtotal"><td class="rowlabel">Total Depreciation</td>'+shown.map(function(r){return '<td>'+money(r.depr)+'</td>';}).join('')+'</tr>'
          + '<tr><td class="rowlabel">Accumulated Depreciation</td>'+shown.map(function(r){return '<td>'+money(r.accumDepr)+'</td>';}).join('')+'</tr>'
          + '</tbody></table></div>'
          + '<div class="tbl-wrap" style="margin-top:16px;"><table class="fin">'
          + '<caption>Depreciation Inputs - Linked From Inputs &rsaquo; Depreciation</caption><tbody>'
          + '<tr><td class="rowlabel">Land Value</td><td class="v">'+money(x.landValue)+'</td><td data-bk-align="text">Set on the Depreciation sheet</td></tr>'
          + '<tr><td class="rowlabel">Land Value %</td><td class="v">'+((x.landPct||0)*100).toFixed(2)+'%</td><td data-bk-align="text">Derived</td></tr>'
          + '<tr><td class="rowlabel">Depreciable Basis</td><td class="v">'+money(x.deprBasis)+'</td><td data-bk-align="text">Purchase Price &minus; Land + Capital Improvements</td></tr>'
          + '<tr><td class="rowlabel">Bonus-Eligible Basis</td><td class="v">'+money(x.bonusEligibleBasis)+'</td><td data-bk-align="text">Short-life property only</td></tr>'
          + '<tr><td class="rowlabel">Bonus Percentage</td><td class="v">'+((x.bonusPct||0)*100).toFixed(0)+'%</td><td data-bk-align="text">Elected</td></tr>'
          + '<tr class="grandtotal"><td class="rowlabel">Bonus Deduction</td><td class="v">'+money(x.bonusDeduction)+'</td><td data-bk-align="text">Taken in the elected tax year</td></tr>'
          + '</tbody></table></div>'
          + '<div class="note-flag" style="margin-top:12px;"><span>&#10003;</span><div>'
          + '<b>Depreciation is supplied by the canonical Depreciation engine</b> (Inputs &rsaquo; Depreciation). '
          + 'After-Tax no longer computes its own straight-line depreciation, so land value, depreciable basis, '
          + 'recovery classes and bonus are controlled in exactly one place.'
          + '</div></div>';
        o.main = o.main + split;
      } else {
        o.main = o.main + '<div class="note-flag" style="margin-top:12px;"><span>&#9432;</span><div>'
          + '<b>No depreciation assumptions configured for this deal.</b> After-Tax is using its simplified '
          + 'straight-line fallback (land % and depreciation life from the After-Tax assumptions). '
          + 'Open <b>Inputs &rsaquo; Depreciation</b> to set land allocation, cost segregation and bonus, and this '
          + 'page will consume those instead.</div></div>';
      }
      return o;
    };
    wrapped.__bkDeprWired = true;
    RENDERERS['After-Tax'] = wrapped;
  }
}

})();
