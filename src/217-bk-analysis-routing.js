/* EACH ANALYSIS SENDS ITS OWN REPORT. The investor summary (cover, sources and uses, annual cash flow to equity, waterfall, returns by exit year) is the
   report of an acquisition or a development. An analysis that runs no financing or investor returns has its own report instead: a Property Valuation
   sends the Property Value Report (executive summary, income, expenses, NOI reconciliation, cap rate, value conclusion, sensitivity), a Refinancing
   Analysis the Refinance Report. "Create PDF summary", the guide's last step and the Home toolbar open the analysis's report; the investor summary is
   never built for a deal it does not describe. */
(function(){
'use strict';
var OWN = { valuation:{ sheet:'Property Valuation Report', label:'Property value report', what:'What the property is worth today on its income: executive summary, income and expenses, NOI in place, normalized and stabilized, the cap rate, the value conclusion and its sensitivity. No financing or investor returns.' },
  hold:{ sheet:'Hold vs Sell Report', label:'Hold vs sell report', what:'Whether to keep the property or sell it today: the net cash from selling now, the hold case year by year, its IRR and NPV, when to sell, and the tax on each sale.' },
  refinance:{ sheet:'Refinance Report', label:'Refinance report', what:'The existing loan and its payoff, the proposed structures sized by the lender\'s tests, cash out and the new debt service.' } };
function analysis(){ try { var R = window.BKReg; return R && R.of ? R.of(bkLoad() || {}) : null; } catch(e){ return null; } }
/* the report this deal's analysis sends, or null for the investor summary */
window.bkAnalysisReport = function(){ var a = analysis(); var r = a && OWN[a.id]; return r && typeof RENDERERS !== 'undefined' && RENDERERS[r.sheet] ? Object.assign({ analysis:a.name, id:a.id }, r) : null; };
window.bkAnalysisHasReturns = function(){ var a = analysis(); return !a || !a.engines || a.engines.indexOf('returns') >= 0; };
var open = window.bkReportOpen;
if(typeof open === 'function' && !open.__bkRouted){
  var w = function(){ var r = window.bkAnalysisReport(); if(r){ if(typeof showSheet === 'function') showSheet(r.sheet); return Promise.resolve(r); } return open.apply(this, arguments); };
  w.__bkRouted = true; window.bkReportOpen = w; try { bkReportOpen = w; } catch(e){}
}
/* the toolbar button names what it builds */
function relabel(){ var r = window.bkAnalysisReport(); document.querySelectorAll('button[onclick="bkReportOpen()"]').forEach(function(b){ var t = r ? 'Open ' + r.label : 'Create PDF summary'; if(b.textContent !== t && /PDF summary|^Open .* report$/.test(b.textContent)) b.textContent = t; }); }
if(typeof window.bkDisplayPass === 'function') window.bkDisplayPass(relabel); else document.addEventListener('click', function(){ setTimeout(relabel, 0); });
})();
