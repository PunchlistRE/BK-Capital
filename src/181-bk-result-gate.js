/* RESULT GATE for sheets that show returns-derived figures. A deal with its core inputs missing has no meaningful IRR: a sensitivity grid, a cash flow, an IC memo or a valuation report built on a blank deal prints
   figures such as 450.00% that a reader could mistake for an answer. These sheets take the same rule as Returns and the waterfall: they show the list of missing inputs (units, price, revenue, exit cap ...) instead.
   Input sheets are never gated. This part loads last so it wraps each sheet's final renderer. It decides only whether a result may be displayed; no calculation changes. */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof window.bkDealReadiness !== 'function' || typeof window.bkNotReadyPanel !== 'function') return;
['Sensitivity', 'Property CF', 'Probability-Weighted', 'Valuation Report', 'Financing Compare', 'IC Memo', 'Returns'].forEach(function(name){
  var orig = RENDERERS[name]; if(typeof orig !== 'function' || orig.__bkResultGate) return;
  var gated = function(){
    try { var r = window.bkDealReadiness(); if(r && r.state !== 'NO DEAL' && !r.canCalculate) return window.bkNotReadyPanel(name); } catch(e){}
    return orig.apply(this, arguments);
  };
  gated.__bkResultGate = true; gated.__bkOriginal = orig.__bkOriginal || orig;
  if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer(name, gated); else RENDERERS[name] = gated;
});
})();
