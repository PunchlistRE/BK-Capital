/* FIELD SEARCH. The search box (Ctrl/Cmd+K, or "/") finds individual inputs as well as pages and actions. It is the Inputs index (src/221) made searchable, not another list:
   the same inputs, filtered to what the open deal uses, with the same status (entered / missing / needed / expected / incomplete / optional) and value. Choosing one opens the real box on its own page
   through the same jump the Inputs index and the review use (bkInputsGo). Nothing is written. Inputs that do not apply to this deal are not offered. */
(function(){
'use strict';
if(typeof bkLoad !== 'function') return;
/* the words people use for an input that its label does not contain */
var ALIAS = {
  acqLTV:'ltv leverage loan to value', acqLTC:'ltc loan to cost', conLTC:'ltc loan to cost construction', exitCap:'cap rate exit cap terminal cap reversion cap', acqRate:'coupon interest rate fixed rate',
  debtIndexName:'sofr index floating benchmark', debtIndexTenor:'sofr term sofr tenor', debtIndexRate:'sofr index rate benchmark', debtSpread:'spread margin sofr plus', debtRateType:'floating fixed sofr rate type',
  acqIO:'io interest only', acqAmort:'amortization amortisation', debtTerm:'maturity term', acqOrigFee:'points origination lender fee', prepayLockoutMonths:'lockout prepayment penalty defeasance yield maintenance',
  rm:'r&m r and m repairs maintenance', mgmtPct:'management fee mgmt', vacancy:'vacancy occupancy credit loss economic vacancy', taxes:'property tax real estate tax re taxes', insurance:'insurance premium',
  closingCostsPct:'closing costs acquisition costs transaction costs', avgRent:'rent average rent monthly rent', purchasePrice:'price acquisition price purchase', holdYears:'hold period exit year sale year',
  gsf:'gba gross square feet sf building size', gla:'nra gla rentable square feet leasable', saleCostPct:'disposition broker commission sale costs', rentGrowth:'rent growth escalation', opexGrowth:'expense growth opex growth inflation',
  reserves:'capex reserves replacement reserves', pref:'preferred return pref hurdle', gpShare:'gp co-invest sponsor equity', t2LP:'promote split waterfall', t3LP:'promote split waterfall', t4LP:'promote split waterfall',
  taxRate:'income tax ordinary tax', depRecaptureRate:'recapture section 1250', capGainsRate:'capital gains ltcg', landValuePct:'land allocation land value depreciable basis', closing:'closing date acquisition date', dealId:'deal id',
  units:'unit count doors', otherIncomePerUnit:'other income', utilities:'utilities water electric gas', payroll:'payroll staff salaries', ga:'g&a general administrative', contract:'contract services landscaping'
};
var STATUS = { entered:'Entered', missing:'Missing, required', needed:'Needed', expected:'Expected, not entered', incomplete:'Incomplete', optional:'Optional, blank' };
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
/* the inputs the search offers: every input the open deal uses, as the Inputs index lists it */
window.bkFieldSearchItems = function(){ var ix = safe(function(){ return window.bkInputsIndex(); }, null); if(!ix || !ix.rows) return [];
  return ix.rows.filter(function(r){ return r.status !== 'na'; }).map(function(r){ var st = STATUS[r.status] || r.status, val = r.present && r.value != null && r.value !== '' ? String(r.value) : '';
    return { kind:'input', key:r.k, label:String(r.label), alias:ALIAS[r.k] || '', status:r.status, value:val, group:r.group + ' · ' + (r.status === 'entered' && val ? val : st) + (r.note ? ' (' + r.note + ')' : ''),
      run:function(){ if(typeof window.bkInputsGo === 'function') window.bkInputsGo(r.k); } }; }); };
window.BK_FIELD_ALIASES = ALIAS;
})();
