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

/* what a case does, in words, from the deltas actually on the deal (used for the header buttons' hover text) */
window.bkCaseSummary = function(s, c){
  if(c !== 'Upside' && c !== 'Downside') return 'Base: the deal exactly as entered.';
  var up = c === 'Upside', k = up ? 'up' : 'down', sg = function(v){ return v > 0 ? '+' : '−'; }, pc = function(v){ return sg(v) + Math.abs(v * 100).toFixed(2) + '%'; }, n = function(key){ var v = Number(s[k + key]); return isFinite(v) ? v : 0; }, parts = [], v;
  if((v = n('ExitCapDelta'))) parts.push('exit cap ' + pc(v)); if((v = n('RentGrowthDelta'))) parts.push('rent growth ' + pc(v)); if((v = n('DebtRateDelta'))) parts.push('loan rate ' + pc(v));
  if((v = n('VacancyDelta'))) parts.push('vacancy ' + pc(v)); if((v = n('OpexVariance'))) parts.push('operating expenses ' + pc(v));
  if((v = n('HardCostVariance'))) parts.push('hard-cost contingency ' + pc(v)); if((v = n('SoftCostVariance'))) parts.push('soft-cost contingency ' + pc(v));
  if((v = n('ConstructionMoDelta'))) parts.push('construction ' + sg(v) + Math.abs(v) + ' months'); if((v = n('AbsorptionFactor'))) parts.push('lease-up ' + (v > 0 ? 'slower by ' : 'faster by ') + Math.abs(v * 100).toFixed(0) + '%');
  return c + ': ' + (parts.length ? parts.join(', ') : 'no changes set') + '.';
};
/* A development's Downside with nothing about construction in it is not a downside: a new development starts with +5 points of hard-cost contingency, 3 extra months of construction and a
   lease-up 25% slower (Upside: lease-up 10% faster). Acquisitions, and every deal that already exists, are left exactly as they are; all of it is editable on Sensitivity. */
var DEV_CASE = { downHardCostVariance:0.05, downConstructionMoDelta:3, downAbsorptionFactor:0.25, upAbsorptionFactor:-0.10 };
var cnd = window.bkCreateNewDeal;
if(typeof cnd === 'function' && !cnd.__bkCases){
  var wrappedCnd = function(d){ var r = cnd.apply(this, arguments);
    try { var s = bkLoad(); if(s && /develop/i.test(String(s.dealType || ''))){ var given = d || {}, changed = false; Object.keys(DEV_CASE).forEach(function(key){ if(!(Number(s[key]) || 0) && !(key in given)){ s[key] = DEV_CASE[key]; changed = true; } }); if(changed) bkSave(s); } } catch(e){}
    return r; };
  wrappedCnd.__bkCases = true; window.bkCreateNewDeal = wrappedCnd; try { bkCreateNewDeal = wrappedCnd; } catch(e){}
}
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
