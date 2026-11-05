/* LOAN SIZING. The one rule that turns a lender's ratio tests into a loan amount, so that no analysis carries its own copy of it.
   Used today by Refi / Recap (a refinance inside an acquisition's hold) and by the Refinancing Analysis (a property already owned); written to be called by any
   analysis that has to say how much a lender will lend.

   A loan is the lowest of what each test allows:
     ltv        value x maximum LTV
     dscr       the loan whose annual debt service uses up NOI / minimum DSCR: that amount divided by the annual debt service per $1 of loan. The caller
                either supplies that figure (debtConstant: the Refinancing Analysis already has it, amortizing or interest-only) or gives the rate and the
                amortization and it is derived as the present value of the level monthly payments (Refi / Recap)
     dy         NOI / minimum debt yield
     extra      any other cap the caller adds, already in dollars (the amount requested)

   bkSizeLoan({ tests, noi, value, maxLTV, minDSCR, minDY, debtConstant | rate + amortYears + roundMonths, extra }) returns
     { caps:[{ id, loan }], loan, binding }
   caps are in the order asked (the tests, then extra); loan is the lowest cap, unrounded; binding is the id of the first cap that equals it (so a tie goes to
   ltv, then dscr, then dy, then extra). With no caps, loan and binding are null.

   What this does not do, on purpose: it applies exactly the tests it is asked for, with the numbers it is given. Whether a blank, zero or negative limit means
   "not tested", an error or a limit of zero is the caller's decision (Refi / Recap always applies all three, as given; the Refinancing Analysis applies only
   the limits the lender has stated and says what is missing). Rounding the result (to $1,000, say) and everything after the loan amount (payment, balance,
   proceeds, returns) also stay with the caller. A figure that is not a number gives a loan that is not a number; nothing is guessed.

   The two ways of stating the debt-service test are the same quantity, and they differ only in the last digits of a floating-point number. They are both kept
   so that extracting this rule moves no number in either tool (the Refinancing Analysis rounds its loan down to $1,000, where a last-digit difference could in
   principle tip a loan sized exactly on a boundary). Bringing them to one form is a separate step with its own review. For the same reason roundMonths exists:
   true takes years x 12 to whole months (Refi / Recap), false uses the term as entered. */
(function(){
'use strict';

/* present value of a level monthly payment stream whose payments total `annual` a year */
function pvLevel(annual, rate, years, roundMonths){
  var i = rate / 12, n = roundMonths ? Math.round(years * 12) : years * 12;
  return i > 0 ? annual / 12 * (1 - Math.pow(1 + i, -n)) / i : annual * years;
}

window.bkSizeLoan = function(o){
  o = o || {};
  var ask = o.tests || ['ltv', 'dscr', 'dy'], caps = [];
  ask.forEach(function(id){
    if(id === 'ltv') caps.push({ id:'ltv', loan:o.value * o.maxLTV });
    else if(id === 'dscr'){ var annual = o.noi / o.minDSCR; caps.push({ id:'dscr', loan:o.debtConstant !== undefined ? annual / o.debtConstant : pvLevel(annual, o.rate, o.amortYears, o.roundMonths) }); }
    else if(id === 'dy') caps.push({ id:'dy', loan:o.noi / o.minDY });
  });
  (o.extra || []).forEach(function(c){ caps.push({ id:c.id, loan:c.loan }); });
  if(!caps.length) return { caps:caps, loan:null, binding:null };
  var loan = Math.min.apply(null, caps.map(function(c){ return c.loan; })), hit = caps[caps.length - 1];
  for(var k = 0; k < caps.length; k++){ if(caps[k].loan === loan){ hit = caps[k]; break; } }
  return { caps:caps, loan:loan, binding:hit.id };
};
})();
