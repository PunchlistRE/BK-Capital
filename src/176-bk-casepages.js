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
var st = document.createElement('style'); st.id = 'bk-casenote-css'; st.textContent = '.bk-casenote{margin:0 0 12px;padding:9px 12px;border:1px solid var(--line,#c5ced7);border-left:4px solid #d9a02f;background:var(--surface,#fff);color:var(--ink-900,#14202b);font-size:12.5px;line-height:1.45}@media print{.bk-casenote{border-color:#999}}.bk-casenote2{margin:8px 0;padding:9px 12px;border:1px solid var(--line,#c5ced7);border-left:4px solid #2f6fb5;background:var(--surface,#fff);color:var(--ink-900,#14202b);font-size:12.5px;line-height:1.5}.bk-casenote2.warn{border-left-color:#d9a02f}.bk-casenote2 a{color:var(--gold-500,#2f6fb5);text-decoration:underline;cursor:pointer}.bk-snap-what{padding:6px 10px 8px;font-size:11.5px;line-height:1.4;opacity:.85}'; document.head.appendChild(st);
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
    try { var s = bkLoad(); if(s && /develop/i.test(String(s.dealType || ''))){ var given = d || {}, changed = false; Object.keys(DEV_CASE).forEach(function(key){ if(!(Number(s[key]) || 0) && !(key in given)){ s[key] = DEV_CASE[key]; changed = true; } }); if(changed){ s._caseDefaults = { keys:Object.keys(DEV_CASE).reduce(function(o, key){ if(!(key in given)) o[key] = DEV_CASE[key]; return o; }, {}), source:'new development', at:new Date().toISOString() }; bkSave(s); } } } catch(e){}
    return r; };
  wrappedCnd.__bkCases = true; window.bkCreateNewDeal = wrappedCnd; try { bkCreateNewDeal = wrappedCnd; } catch(e){}
}

/* ---- transparency: what each case does, in plain sight on Deal Underwrite, and where the development defaults came from ---- */
var DEV_KEYS = Object.keys(DEV_CASE);
function devDefaultsState(s){
  if(!/develop/i.test(String(s.dealType || ''))) return null;
  var rec = s._caseDefaults && s._caseDefaults.keys, vals = DEV_KEYS.map(function(k){ return Number(s[k]) || 0; });
  if(vals.every(function(v){ return v === 0; })) return 'none';
  if(rec && DEV_KEYS.every(function(k){ return (k in rec) ? Number(s[k]) === rec[k] : true; })) return 'auto';
  return 'edited';
}
window.bkCaseApplyDevDefaults = function(){ var s = bkLoad(), keys = {}; DEV_KEYS.forEach(function(k){ if(!(Number(s[k]) || 0)){ s[k] = DEV_CASE[k]; keys[k] = DEV_CASE[k]; } }); s._caseDefaults = { keys:keys, source:'applied by you', at:new Date().toISOString() }; bkSave(s); if(typeof showSheet === 'function') showSheet(typeof currentSheet !== 'undefined' ? currentSheet : 'Deal Underwrite'); };
function devText(s){ var n = function(k){ return Number(s[k]) || 0; }, d = [], u = []; if(n('downHardCostVariance')) d.push('+' + (n('downHardCostVariance') * 100).toFixed(0) + ' points of hard-cost contingency'); if(n('downConstructionMoDelta')) d.push('+' + n('downConstructionMoDelta') + ' months of construction'); if(n('downAbsorptionFactor')) d.push('lease-up ' + Math.abs(n('downAbsorptionFactor') * 100).toFixed(0) + '% ' + (n('downAbsorptionFactor') > 0 ? 'slower' : 'faster')); if(n('upAbsorptionFactor')) u.push('lease-up ' + Math.abs(n('upAbsorptionFactor') * 100).toFixed(0) + '% ' + (n('upAbsorptionFactor') > 0 ? 'slower' : 'faster')); return 'Downside: ' + d.join(', ') + (u.length ? '; Upside: ' + u.join(', ') : ''); }
function casePanel(s){
  var st = devDefaultsState(s), chip = function(t, c){ return '<span class="status-chip ' + (c || '') + '">' + t + '</span>'; }, dev = st !== null;
  var rows = ['Base', 'Upside', 'Downside'].map(function(c){ return '<tr><td class="rowlabel">' + c + '</td><td style="text-align:left">' + esc((function(t){ return t.charAt(0).toUpperCase() + t.slice(1); })(window.bkCaseSummary(s, c).replace(/^[A-Za-z]+: /, ''))) + '</td><td>' + (String(s.scenarioCase || 'Base') === c ? chip('SELECTED', 'pass') : '') + '</td></tr>'; }).join('');
  var note = '';
  if(st === 'auto') note = '<div class="bk-casenote2"><b>Set automatically.</b> The construction risk in this development\'s Upside and Downside was filled in when the deal was created (' + devText(s) + ') because a development case with nothing about cost, schedule or lease-up is not a real downside. Change or clear any of them on <a onclick="showSheet(\'Sensitivity\')">Sensitivity &gt; Scenario Drivers</a>.</div>';
  else if(st === 'edited') note = '<div class="bk-casenote2"><b>Edited by you.</b> The development case drivers (hard-cost contingency, construction months, lease-up speed) differ from the standard starting values. They are on <a onclick="showSheet(\'Sensitivity\')">Sensitivity &gt; Scenario Drivers</a>.</div>';
  else if(st === 'none') note = '<div class="bk-casenote2 warn"><b>This development\'s Downside has no construction risk.</b> Hard-cost contingency, construction months and lease-up speed are all zero, so the Downside moves only the exit cap, rent growth and the loan rate. <button type="button" class="ae-btn pri" onclick="bkCaseApplyDevDefaults()">Apply the standard development stress</button> (+5 points hard-cost contingency, +3 months of construction, lease-up 25% slower; Upside 10% faster). Nothing changes until you press it.</div>';
  return '<div class="tbl-wrap bk-casepanel"><table class="fin"><caption>What each case changes</caption><colgroup><col style="width:14%"><col style="width:68%"><col style="width:18%"></colgroup><thead><tr><th class="rowlabel-h">Case</th><th style="text-align:left">What it does to this deal</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + note
    + '<div style="margin:6px 0 14px"><button type="button" class="ae-btn" onclick="showSheet(\'Sensitivity\')">Edit all case drivers</button></div>';
}
(function(){
  var fn = RENDERERS['Deal Underwrite']; if(typeof fn !== 'function' || fn.__bkCasePanel) return;
  var w = function(){ var o = fn.apply(this, arguments); try { if(o && typeof o.main === 'string'){ var i = o.main.indexOf('Underwriting Cases'); if(i >= 0){ var j = o.main.indexOf('</table></div>', i); if(j >= 0){ j += '</table></div>'.length; o.main = o.main.slice(0, j) + casePanel(bkLoad()) + o.main.slice(j); } } } } catch(e){} return o; };
  w.__bkCasePanel = true; RENDERERS['Deal Underwrite'] = w; })();
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
