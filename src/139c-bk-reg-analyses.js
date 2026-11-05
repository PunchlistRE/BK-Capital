/* ANALYSIS REGISTRY - ANALYSIS TYPES, in the order the setup page shows them.
   dealType is the engine family a new deal of this type is created on (every engine already branches on it). engines lists the calculation engines the
   analysis runs; anything not listed is not run, so its numbers cannot appear on the analysis's pages or report. live: the analysis can be started today. */
(function(){
'use strict';
if(!window.BKReg) return;
var R = window.BKReg;
[
  { id:'valuation', name:'Property Valuation', q:'What is the property worth today on its income?', icon:'value', dealType:'Acquisition', live:true,
    engines:['operating', 'valuation'], ownReadiness:true, home:'Property Valuation', ready:function(s){ var r = typeof window.bkValuation === 'function' ? window.bkValuation(s) : null; return !r || r.ok ? true : 'The property cannot be valued: ' + (r.missing.length ? r.missing.join(', ') : 'the concluded NOI is not available') + '.'; }, about:'Income, expenses and NOI in place, normalized and stabilized, capitalized at market rates. Not an appraisal, and no financing or investor returns.' },
  { id:'acquisition', name:'Acquisition Analysis', q:'Should we buy it, and at what price?', icon:'key', dealType:'Acquisition', live:true,
    engines:['operating', 'monthly', 'debt', 'returns', 'waterfall', 'sensitivity', 'tax'], about:'Price, operations, financing, sale and returns for an existing property.' },
  { id:'development', name:'Development Analysis', q:'Does the project pencil, from land to stabilization?', icon:'crane', dealType:'Development', live:true,
    engines:['operating', 'development', 'returns', 'waterfall', 'sensitivity'], about:'Land, budget, schedule, construction financing, lease-up, stabilization and exit.' },
  { id:'refinance', name:'Refinancing Analysis', q:'How much can we borrow, and what does it leave us?', icon:'loop', dealType:'Acquisition', live:true,
    engines:['operating', 'valuation', 'refinance'], ownReadiness:true, home:'Refinancing', ready:function(s){ var r = typeof window.bkRefinance === 'function' ? window.bkRefinance(s) : null; return !r || r.ok ? true : 'The refinance cannot be sized: ' + ((r.main && r.main.missing) || r.missing || []).join(', ') + '.'; }, about:'The existing loan and its payoff against proposed structures, sized by the lender\'s tests.' },
  { id:'hold', name:'Hold & Disposition', q:'Keep the property or sell it?', icon:'scale', dealType:'Acquisition', live:false,
    engines:['operating', 'monthly', 'debt', 'returns', 'tax'], about:'Hold-period cash flow against selling now, with the tax on the sale where supported.' },
  { id:'comprehensive', name:'Comprehensive Underwriting', q:'The full model of one investment, with tax and partners', icon:'stack', dealType:'Acquisition', live:false,
    engines:['operating', 'monthly', 'debt', 'returns', 'waterfall', 'sensitivity', 'tax', 'capital'], about:'Every supported schedule for one property: operations, capital, financing, tax and partners.' },
  { id:'portfolio', name:'Portfolio Analysis', q:'How do our properties add up, and what should we do next?', icon:'grid', dealType:'Acquisition', live:false,
    engines:['portfolio'], about:'Holdings consolidated on dated cash flows, with debt maturities, concentration and scenarios.' },
  { id:'business', name:'Business Valuation & Underwriting', q:'What is the operating business worth?', icon:'chart', dealType:'Acquisition', live:false,
    engines:['business'], about:'Revenue, EBITDA, working capital, free cash flow and valuation for an operating company, kept separate from property underwriting.' }
].forEach(function(a){ R.addAnalysis(a); });

/* line icons (20px, current text color) */
var P = {
  value:'<path d="M4 17V9l6-5 6 5v8z"/><path d="M8 17v-4h4v4"/>',
  key:'<circle cx="7" cy="10" r="3"/><path d="M10 10h7M14 10v3M17 10v2"/>',
  crane:'<path d="M5 17V4h1l9 3H6M15 7v4"/><path d="M3 17h6"/><rect x="13" y="11" width="4" height="3"/>',
  loop:'<path d="M15 7a6 6 0 0 0-10 2M5 13a6 6 0 0 0 10-2"/><path d="M15 3v4h-4M5 17v-4h4"/>',
  scale:'<path d="M10 4v13M6 17h8M4 7h12"/><path d="M4 7l-2 5h4zM16 7l-2 5h4z"/>',
  stack:'<path d="M10 3l7 3-7 3-7-3z"/><path d="M3 10l7 3 7-3M3 14l7 3 7-3"/>',
  grid:'<rect x="3" y="3" width="6" height="6"/><rect x="11" y="3" width="6" height="6"/><rect x="3" y="11" width="6" height="6"/><rect x="11" y="11" width="6" height="6"/>',
  chart:'<path d="M3 17h14M5 14V9M9 14V5M13 14v-3"/>'
};
R.icon = function(name){ return '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>'; };
})();
