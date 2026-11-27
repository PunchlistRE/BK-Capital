/* RESULT GATE for sheets that show returns-derived figures. A deal with its core inputs missing has no meaningful IRR: a sensitivity grid, a cash flow, an IC memo or a valuation report built on a blank deal prints
   figures such as 450.00% that a reader could mistake for an answer. These sheets take the same rule as Returns and the waterfall: they show the list of missing inputs (units, price, revenue, exit cap ...) instead.
   Input sheets are never gated. This part loads last so it wraps each sheet's final renderer. It decides only whether a result may be displayed; no calculation changes. */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof window.bkDealReadiness !== 'function' || typeof window.bkNotReadyPanel !== 'function') return;
/* the returns-derived and dated pages: with the closing date (or any other required input) missing there is nothing to show, because a date the model invented would date the cash flows and the returns wrongly.
   The second row is every other report and analysis page that printed returns-type figures on a deal that was still DRAFT (found by opening each page with the closing date blank). */
var FIRST = ['Sensitivity', 'Property CF', 'Probability-Weighted', 'Valuation Report', 'Financing Compare', 'IC Memo', 'Returns'];
var LATER = ['Hold vs Sell', 'Financing Lab', 'Investment Target', 'Deal Optimizer', 'Pre-Offer Bid', 'Cash Flow Report', 'After-Tax Report', 'Sources and Uses Report', 'Waterfall Report', 'Property Valuation Report', 'Present Value Report', 'Hold vs Sell Report'];
function gate(name){
  var orig = RENDERERS[name]; if(typeof orig !== 'function' || orig.__bkResultGate) return;
  var gated = function(){
    try { if((name === 'Financing Compare' || name === 'Probability-Weighted' || name === 'Pre-Offer Bid') && /develop/i.test(String((typeof bkLoad === 'function' && bkLoad() || {}).dealType || ''))) return orig.apply(this, arguments); } catch(e){}
    try { var r = window.bkDealReadiness(); if(r && r.state !== 'NO DEAL' && !r.canCalculate) return window.bkNotReadyPanel(name); } catch(e){}
    return orig.apply(this, arguments);
  };
  gated.__bkResultGate = true; gated.__bkOriginal = orig.__bkOriginal || orig;
  if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer(name, gated); else RENDERERS[name] = gated;
}
FIRST.forEach(gate);
/* LATER: every other report and analysis page that printed returns-type figures on a deal that was still DRAFT (found by opening each page with the closing date blank). With the closing date or any other required
   input missing there is nothing to show: a date the model invented would date the cash flows and the returns wrongly. These register after this part loads, so they are wrapped once the page has finished loading. */
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ LATER.forEach(gate); }); else LATER.forEach(gate);
})();
