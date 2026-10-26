
/* V29.25.0 - FLOW. (1) Size the loan to policy capacity in one step; (2) plain-English hints on the terms underwriters argue about, and a glossary in the search;
   (3) the methodology table on Deal Underwrite moves to the end so the deal's own inputs come first. */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined') return;
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function M(v){ if(v == null || !isFinite(v)) return '—'; var a = Math.abs(v); return (v < 0 ? '(' : '') + '$' + Math.round(a).toLocaleString('en-US') + (v < 0 ? ')' : ''); }
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }

/* ---------------------------------------------------------------- 1. size the loan to policy */
function plan(){
  var s = safe(function(){ return bkLoad(); }, null); if(!s || /develop/i.test(String(s.dealType || ''))) return null;
  var g = safe(function(){ return bkDealGate(); }, null), cap = g && g.capacity; if(!cap || !(cap.overage > 0)) return null;
  var loanAt = function(ov){ return window.bkRunWith(ov, function(){ return bkDebt().loan; }); };
  var target = cap.capacity * 0.9995, cur = Number(s.acqDSCR) || 1.25, now = loanAt({});
  var lo = cur, hi = cur + 3; if(!(loanAt({ acqDSCR:hi }) <= target)) return { s:s, cap:cap, now:now, ok:false };
  for(var i = 0; i < 60; i++){ var m = (lo + hi) / 2; if(loanAt({ acqDSCR:m }) > target) lo = m; else hi = m; }
  var d = Math.ceil(hi * 1000) / 1000;
  return { s:s, cap:cap, now:now, ok:true, dscr:d, from:cur, loan:loanAt({ acqDSCR:d }) };
}
window.bkSizeLoanPlan = plan;
window.bkSizeLoanDialog = function(){
  var p = plan(), modal = window.bkModal; if(!modal) return;
  if(!p){ modal('<h3>Loan is within policy</h3><p>The loan the engine sized is not above what house credit policy supports, so there is nothing to resize.</p><div class="btns"><button type="button" class="pl-hbtn primary" onclick="bkModalClose()">Close</button></div>'); return; }
  if(!p.ok){ modal('<h3>Raising the DSCR will not reach policy</h3><p>The loan is ' + M(p.cap.overage) + ' above what policy supports (' + M(p.cap.capacity) + ', binding on ' + esc(p.cap.binding && p.cap.binding.name || 'policy') + '), but the engine’s DSCR sizing is not what is setting it. Lower the maximum LTV or LTC on Deal Underwrite, or change the price.</p><div class="btns"><button type="button" class="pl-hbtn" onclick="bkModalClose()">Close</button><button type="button" class="pl-hbtn primary" onclick="bkModalClose();showSheet(\'Debt Capacity\')">Open Debt Capacity</button></div>'); return; }
  modal('<h3>Size the loan to policy</h3><p>The loan the engine sized is <b>' + M(p.now) + '</b>, which is ' + M(p.cap.overage) + ' above what house policy supports (<b>' + M(p.cap.capacity) + '</b>, binding on ' + esc(p.cap.binding && p.cap.binding.name || 'policy') + ').</p>'
    + '<p>This raises the minimum DSCR the loan is sized to from <b>' + p.from.toFixed(2) + 'x</b> to <b>' + p.dscr.toFixed(3) + 'x</b>. The engine then sizes the loan at <b>' + M(p.loan) + '</b>; debt service, returns, tax and the credit gate all recompute. Undo restores the old DSCR.</p>'
    + '<div class="btns"><button type="button" class="pl-hbtn" onclick="bkModalClose()">Cancel</button><button type="button" class="pl-hbtn primary" onclick="bkSizeLoanGo()">Apply</button></div>');
};
window.bkSizeLoanGo = function(){
  var p = plan(); if(!p || !p.ok){ bkModalClose(); return; } var s = bkLoad(); s.acqDSCR = p.dscr; bkSave(s); bkModalClose(); showSheet('Home'); try { window.scrollTo(0, 0); } catch(e){}
};

/* ---------------------------------------------------------------- 2. glossary */
var G = [
  ['DSCR', /\bDSCR\b|debt service coverage/i, 'Debt service coverage ratio: net operating income divided by the year’s loan payments. 1.25x means income covers the payment 1.25 times. Lenders set a minimum.'],
  ['Stressed DSCR', /stressed (underwriting )?(DSCR|coupon|rate)/i, 'DSCR recalculated with the interest rate raised by a cushion (here the policy’s stress, e.g. 150 bps), to see whether the loan still works if rates are worse than the quote.'],
  ['LTV', /\bLTV\b|loan[- ]to[- ]value/i, 'Loan-to-value: the loan as a share of the property’s value. Higher means more leverage and less equity cushion.'],
  ['LTC', /\bLTC\b|loan[- ]to[- ]cost/i, 'Loan-to-cost: the loan as a share of total project cost (price plus closing costs and fees; for development, all costs).'],
  ['Debt yield', /debt yield/i, 'Year-1 NOI divided by the loan. It ignores the interest rate, so it shows how fast the income alone would repay the loan.'],
  ['Cap rate', /cap(italisation|italization)? rate|going-in cap|exit cap/i, 'Capitalisation rate: NOI divided by value. Going-in cap is NOI over the purchase price; exit cap is the rate used to value the property when it is sold.'],
  ['NOI', /\bNOI\b|net operating income/i, 'Net operating income: rent and other income less operating expenses, before debt service, taxes on income and capital costs.'],
  ['Levered IRR', /levered IRR|\bIRR\b|XIRR/i, 'Internal rate of return on the equity cash flows after debt. It is the annualised return that makes the cash flows’ present value equal the equity put in. Unlevered IRR ignores the loan.'],
  ['Equity multiple', /equity multiple|\bMOIC\b/i, 'Total cash returned to equity divided by the cash invested. 1.5x means $1.50 back for every $1.00 in, over the whole hold.'],
  ['Hurdle', /hurdle/i, 'The return a deal must clear: the target IRR on Credit Policy, or the preferred return tiers in the waterfall.'],
  ['Yield on cost', /yield on cost/i, 'Stabilised NOI divided by total cost. For development, compare it to the exit cap: the gap is the profit margin for taking construction risk.'],
  ['Loss to lease', /loss to lease/i, 'The gap between what units could rent for at market and what in-place leases pay. Closing it is the upside; it is not extra vacancy.'],
  ['Binding constraint', /binding/i, 'The one sizing test (LTV, LTC, DSCR, debt yield) that allows the smallest loan. Loosening any other test changes nothing.'],
  ['Preferred return', /preferred return|\bpref\b/i, 'The return investors earn first, before the sponsor shares in profit.'],
  ['Promote', /promote/i, 'The sponsor’s share of profit above the preferred return, paid in tiers as the deal clears higher hurdles.'],
  ['Catch-up', /catch-?up/i, 'A tier that pays the sponsor extra until it has received its promote share of all profit so far.'],
  ['Waterfall', /waterfall/i, 'The order in which cash is paid to investors and the sponsor: return of capital, preferred return, then tiered splits.'],
  ['Replacement reserves', /reserves/i, 'Money set aside each year for replacing roofs, appliances and other capital items. Deducted from NOI to give NOI after reserves.'],
  ['Bad debt', /bad debt/i, 'Rent billed but never collected, taken as a percentage of rent.'],
  ['TI / LC', /\bTI\b|\bLC\b|leasing commission/i, 'Tenant improvements and leasing commissions: the costs of re-leasing a commercial space when a lease rolls.'],
  ['T-12', /T-?12|trailing[- ]12/i, 'Trailing twelve months: the last year of actual income and expenses, month by month, from the seller’s accounting.'],
  ['Bonus depreciation', /bonus/i, 'Writing off a large share of short-life assets in the first year instead of spreading it. The share depends on the placed-in-service date.'],
  ['Cost segregation', /cost seg/i, 'An engineering study that splits a building into short-life parts (5, 7, 15 years) and 27.5/39-year structure, so more depreciation comes sooner.'],
  ['Mid-quarter convention', /mid-?quarter/i, 'A depreciation rule that applies when more than 40% of the year’s short-life basis is placed in service in the last quarter. It cuts first-year deductions.'],
  ['Recapture', /recapture|1250|1245/i, 'Tax paid on depreciation already deducted when the property is sold: ordinary rates for short-life assets, up to 25% for building depreciation.'],
  ['P10 / P90', /\bP10\b|\bP90\b|percentile/i, 'In the Monte Carlo, P10 is the result that 10% of draws fall below (a bad case) and P90 the result 90% fall below (a good case).'],
  ['Standard deviation', /std\.? dev|standard deviation/i, 'How far a driver typically moves from its base value. About two thirds of draws fall within one standard deviation and 95% within two.'],
  ['Break-even occupancy', /break-?even occ/i, 'The occupancy at which NOI just covers debt service. Lower is safer.']
];
window.BK_GLOSSARY = G.map(function(g){ return [g[0], g[2]]; });
window.bkGlossaryShow = function(term){ var g = G.filter(function(x){ return x[0] === term; })[0]; if(!g || !window.bkModal) return; window.bkModal('<h3>' + esc(g[0]) + '</h3><p>' + esc(g[2]) + '</p><div class="btns"><button type="button" class="pl-hbtn primary" onclick="bkModalClose()">Close</button></div>'); };
/* hints appear on hover in a floating tip, without writing anything into the sheet (writing attributes there makes other layers re-render and drops the focus you are editing in) */
var TIP = null;
function tipEl(){ if(TIP) return TIP; TIP = document.createElement('div'); TIP.id = 'pl-tip'; TIP.setAttribute('role', 'tooltip'); document.body.appendChild(TIP); return TIP; }
function matchTerm(el){ var t = (el.textContent || '').trim(); if(!t || t.length > 90) return null; for(var i = 0; i < G.length; i++){ if(G[i][1].test(t)) return G[i]; } return null; }
document.addEventListener('mouseover', function(e){
  var el = e.target.closest && e.target.closest('#viewport td.rowlabel, #viewport th, #viewport caption, #viewport .pl-kpi .k, #viewport .pl-row .l, #viewport .metric-row .k, #viewport .bk-sx-title'); if(!el){ return; }
  if(el._plTerm === undefined) el._plTerm = matchTerm(el); var g = el._plTerm; if(!g) return;
  var t = tipEl(); t.innerHTML = '<b>' + esc(g[0]) + '</b>' + esc(g[2]); var r = el.getBoundingClientRect(); t.style.display = 'block';
  var w = Math.min(320, window.innerWidth - 16); t.style.width = w + 'px'; t.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px'; t.style.top = (r.bottom + 6 + t.offsetHeight > window.innerHeight ? Math.max(8, r.top - t.offsetHeight - 6) : r.bottom + 6) + 'px';
});
document.addEventListener('mouseout', function(e){ if(TIP && e.target.closest && e.target.closest('#viewport td.rowlabel, #viewport th, #viewport caption, #viewport .pl-kpi .k, #viewport .pl-row .l, #viewport .metric-row .k, #viewport .bk-sx-title')) TIP.style.display = 'none'; });
document.addEventListener('scroll', function(){ if(TIP) TIP.style.display = 'none'; }, true);
var CSS = '#pl-tip{position:fixed;z-index:2200;display:none;background:#0e2a4a;color:#fff;border-radius:8px;padding:10px 12px;font:12.5px/1.45 Inter,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3);pointer-events:none}#pl-tip b{display:block;color:#3E9AE6;font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:3px}';
var st = document.createElement('style'); st.id = 'pl-flow-css'; st.textContent = CSS; document.head.appendChild(st);
})();
