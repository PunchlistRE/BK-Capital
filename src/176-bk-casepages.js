/* ===========================================================================
   THE SELECTED CASE ON EVERY OUTPUT PAGE. The header's Base / Upside / Downside control is a non-destructive VIEW: the deal's own assumptions never change, the page is drawn
   on a scratch copy with the case's deltas applied. Seven pages did this (Returns, Debt, Debt Schedule, Equity Waterfall, Operating Underwrite, Property CF, Covenant Monitor).
   The Cash Flow Report, the Valuation Report and After-Tax did not: they showed Base figures under a "Case: Downside" label, and a Downside report printed from them carried Base
   numbers. They now follow the case the same way. A page that deliberately judges the Base case (the investment-committee memo, deal remedies, the pre-offer bid, sell versus hold)
   says so at the top whenever another case is selected, so it can't be read as the selected case.
   =========================================================================== */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof window.bkInCase !== 'function') return;
var st = document.createElement('style'); st.id = 'bk-casenote-css'; st.textContent = '.bk-casenote{margin:0 0 12px;padding:9px 12px;border:1px solid var(--line,#c5ced7);border-left:4px solid #d9a02f;background:var(--surface,#fff);color:var(--ink-900,#14202b);font-size:12.5px;line-height:1.45}@media print{.bk-casenote{border-color:#999}}'; document.head.appendChild(st);
var FOLLOW = ['Cash Flow Report', 'Valuation Report', 'After-Tax'], BASE_ONLY = ['IC Memo', 'Deal Remedies', 'Pre-Offer Bid', 'Sell vs Hold'];
function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function caseNow(){ try { return String(bkLoad().scenarioCase || 'Base'); } catch(e){ return 'Base'; } }
FOLLOW.forEach(function(name){
  var fn = RENDERERS[name]; if(typeof fn !== 'function' || fn.__bkCasePage) return;
  var wrapped = function(){ var c = caseNow(); if(c === 'Base') return fn.apply(this, arguments); var self = this, args = arguments;
    return window.bkInCase(function(){ var o = fn.apply(self, args); if(o){ o.meta = Object.assign({}, o.meta || {}, { Scenario:c }); o.desc = (o.desc ? o.desc + ' ' : '') + 'Scenario view: ' + c + '. Base assumptions remain unchanged.'; } return o; }); };
  wrapped.__bkCasePage = true; RENDERERS[name] = wrapped; });
BASE_ONLY.forEach(function(name){
  var fn = RENDERERS[name]; if(typeof fn !== 'function' || fn.__bkCasePage) return;
  var wrapped = function(){ var o = fn.apply(this, arguments), c = caseNow(); if(c === 'Base' || !o || typeof o.main !== 'string') return o;
    o.main = '<div class="bk-casenote" role="note"><b>This page judges the Base case.</b> The case selected in the header is ' + esc(c) + '. Its figures are on Returns, Debt, the Cash Flow Report and the Valuation Report; switch the case to Base to match this page.</div>' + o.main; return o; };
  wrapped.__bkCasePage = true; RENDERERS[name] = wrapped; });
})();
