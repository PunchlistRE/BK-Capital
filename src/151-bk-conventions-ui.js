
/* ===========================================================================
   UNDERWRITING CONVENTIONS - controls and disclosure (CV-2026.10)
   ---------------------------------------------------------------------------
   The four methodology settings resolved by bkConventions() are edited here,
   on Deal Underwrite, with the GP / LP ownership split and its validation.
   A deal that predates the settings shows LEGACY and keeps its original
   methodology until someone applies the current standard to it on purpose.
   =========================================================================== */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof bkConventions !== 'function') return;
function esc(v){ return (typeof bkEsc === 'function') ? bkEsc(v) : String(v == null ? '' : v); }
function pct(v){ return isFinite(v) ? (v*100).toFixed(2) + '%' : '—'; }
function chip(cls, t){ return '<span class="status-chip ' + (cls || '') + '">' + esc(t) + '</span>'; }
function hasDeal(){ try { return typeof window.bkProductionCounts === 'function' ? !!window.bkProductionCounts().activeDeal : true; } catch(e){ return false; } }
function rerender(){ try { if(currentSheet) showSheet(currentSheet); } catch(e){} }

var DEF = [
  { key:'cvRentGrowthStart', label:'Rent & Expense Growth Start',
    opts:[['year2','Year 2'],['month1','Month 1']],
    why:{ year2:'Year 1 equals the underwritten rents and expenses; growth steps once a year from Year 2.',
          month1:'Every line compounds monthly from month 1, so Year 1 is above the underwritten figures. Use for explicit monthly escalations.' } },
  { key:'cvOpexVariablePct', label:'Occupancy-Variable Share of Controllable Opex', num:true,
    opts:[[0,'0% (all fixed)'],[0.1,'10%'],[0.2,'20%'],[0.25,'25%'],[0.3,'30%'],[0.4,'40% (workbook)'],[0.5,'50%'],[0.75,'75%'],[1,'100%']],
    why:{ _:'Share of controllable expenses that falls with occupancy. Vacancy is always applied to rent; at 0% expenses are not reduced by vacancy.' } },
  { key:'cvLtvBasis', label:'Acquisition LTV Basis',
    opts:[['price','Purchase price'],['lesser','Lesser of price / value'],['value','Underwritten value']],
    why:{ price:'Standard for an acquisition loan. LTC and DSCR still apply; the loan is the lowest constraint.',
          lesser:'Lender-conservative: the lower of what you paid and what the income supports.',
          value:'Year-1 NOI ÷ exit cap. For refinance or value-based lending; the exit cap then drives the loan size.' } },
  { key:'cvHurdleBasis', label:'Waterfall Hurdles Measured On',
    opts:[['lp','LP cash flows'],['deal','Total deal equity']],
    why:{ lp:'Each tier opens only when the LP itself has reached that IRR. Splits and catch-up are the deal’s own terms.',
          deal:'Tiers clear on total distributions (including GP catch-up and promote). Use only if the partnership agreement says so.' } },
  { key:'cvBadDebtBasis', label:'Bad Debt Basis',
    opts:[['afterVacancy','Rent after vacancy'],['gross','Gross potential rent'],['legacy','Legacy (statement gross, monthly after vacancy)']],
    why:{ afterVacancy:'Standard. Vacancy is deducted first, then bad debt on the rent actually billed. Operating Underwrite, monthly cash flow, valuation, sale and sensitivities all use it.',
          gross:'Bad debt on gross potential rent everywhere. Use only if the underwriting policy specifies a gross basis.',
          legacy:'Original behaviour: Operating Underwrite charges gross rent while the monthly cash flow charges rent after vacancy, so Year-1 NOI differs between them.' } }
];

function statusChip(s, k){
  var v = s[k];
  if(v === undefined || v === null || v === '') return chip('warn', 'LEGACY');
  return (String(v) === String(window.BK_CV_STANDARD[k])) ? chip('pass', 'STANDARD') : chip('', 'CUSTOM');
}
function gpBody(s){
  var gp = Number(s.gpShare), ok = isFinite(gp) && gp >= 0 && gp <= 1;
  return bkInput('GP Equity Share', 'gpShare', '% of equity - template default 10%', 'pct')
       + '<tr><td class="rowlabel">LP Equity Share</td><td class="v">' + (ok ? pct(1 - gp) : '—') + '</td><td data-bk-align="text">100% less GP share</td><td>'
       + (ok ? chip('pass', 'GP + LP = 100%') : chip('fail', 'GP MUST BE 0-100%')) + '</td></tr>';
}
function gpRows(s){
  return '<div class="tbl-wrap"><table class="fin"><caption>Ownership</caption><thead><tr><th class="rowlabel-h">Setting</th><th>Value</th><th style="text-align:left">Note</th><th>Status</th></tr></thead><tbody>' + gpBody(s) + '</tbody></table></div>';
}
function devPanel(){
  var rows = DEF.map(function(d){
    return '<tr><td class="rowlabel">' + d.label + '</td><td class="v">Not applicable</td><td data-bk-align="text">Development underwriting uses its own methodology.</td><td>' + chip('', 'DEV METHOD') + '</td></tr>';
  }).join('');
  return '<div class="note-flag" style="margin-bottom:12px"><span>&#9432;</span><div><b>Development deal: acquisition conventions do not apply.</b> '
    + 'Construction-loan sizing, construction-period cash flows, lease-up and annual growth follow the development methodology and are not affected by these settings. '
    + 'Configurable conventions for development deals would be a separate extension.</div></div>'
    + '<div class="tbl-wrap"><table class="fin"><caption>Underwriting Conventions - Acquisition Deals Only</caption><thead><tr><th class="rowlabel-h">Setting</th><th>Value</th>'
    + '<th style="text-align:left">Applies to this deal</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}
function panel(){
  var s = bkLoad(), cv = bkConventions(s);
  if(cv.isDevelopment) return devPanel() + '<div style="height:16px"></div>' + gpRows(s);
  var rows = DEF.map(function(d){
    var cur = cv[d.key], opts = d.opts.slice();
    if(d.num && !opts.some(function(o){ return Number(o[0]) === Number(cur); })) opts.push([cur, pct(cur)]);
    var sel = '<select onchange="bkSetConvention(\'' + d.key + '\',this.value)">' + opts.map(function(o){
      var on = d.num ? Number(o[0]) === Number(cur) : String(o[0]) === String(cur);
      return '<option value="' + esc(o[0]) + '"' + (on ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
    var why = d.why[cur] || d.why._ || '';
    return '<tr><td class="rowlabel">' + d.label + '</td><td class="v">' + sel + '</td><td data-bk-align="text">' + esc(why) + '</td><td>' + statusChip(s, d.key) + '</td></tr>';
  }).join('');
  rows += gpBody(s);
  var legacy = cv.legacyFields.length;
  var banner = legacy
    ? '<div class="note-flag" style="margin-bottom:12px"><span>&#9888;</span><div><b>This deal keeps its original methodology.</b> It was created before the '
      + 'CV-2026.10 conventions, so ' + legacy + ' setting' + (legacy > 1 ? 's are' : ' is') + ' marked LEGACY and calculated exactly as before. '
      + 'Nothing changes unless you change it.<div style="margin-top:8px"><button type="button" class="status-chip pass" onclick="bkApplyStandardConventions()">'
      + 'APPLY CURRENT STANDARD CONVENTIONS</button></div></div></div>'
    : '';
  return banner + '<div class="tbl-wrap"><table class="fin"><caption>Underwriting Conventions</caption><thead><tr><th class="rowlabel-h">Setting</th><th>Value</th>'
    + '<th style="text-align:left">What it does</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}
window.bkSetConvention = function(k, v){
  var s = bkLoad();
  s[k] = (k === 'cvOpexVariablePct') ? Math.max(0, Math.min(1, Number(v) || 0)) : String(v);
  if(!s._conventions) s._conventions = { version:'custom', appliedAt:new Date().toISOString() };
  bkSave(s); rerender();
};
window.bkApplyStandardConventions = function(){
  var s = bkLoad();
  Object.keys(window.BK_CV_STANDARD).forEach(function(k){ s[k] = window.BK_CV_STANDARD[k]; });
  s._conventions = { version:'CV-2026.10', appliedAt:new Date().toISOString(), appliedTo:'existing deal' };
  bkSave(s); rerender();     // one save = one undo step
};

function wrap(sheet, fn){
  var prev = RENDERERS[sheet]; if(typeof prev !== 'function') return;
  var w = function(){
    var o = prev.apply(this, arguments);
    try { if(hasDeal() && o && typeof o === 'object' && !/no deal loaded|there is no active deal/i.test(String(o.main || ''))) fn(o); } catch(e){}
    return o;
  };
  Object.keys(prev).forEach(function(k){ if(k.indexOf('__') === 0) w[k] = prev[k]; });
  if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer(sheet, w); else RENDERERS[sheet] = w;
}
wrap('Deal Underwrite', function(o){ o.main = panel() + '<div style="height:16px"></div>' + (o.main || ''); });
function cvLabel(){ var cv = bkConventions(bkLoad()); return cv.isDevelopment ? 'Development method' : cv.isStandard ? 'Standard' : cv.isLegacy ? 'Legacy' : 'Custom'; }
wrap('Property CF', function(o){ if(bkConventions(bkLoad()).isDevelopment) return; o.meta = Object.assign({}, o.meta || {}, { 'Growth Start': bkConventions(bkLoad()).cvRentGrowthStart === 'year2' ? 'Year 2' : 'Month 1' }); });
wrap('Debt', function(o){ if(bkConventions(bkLoad()).isDevelopment) return; o.meta = Object.assign({}, o.meta || {}, { 'LTV Basis': window.bkLtvBasisLabel(bkLoad(), true).replace(/^./, function(c){ return c.toUpperCase(); }) }); });
wrap('Equity Waterfall', function(o){ if(bkConventions(bkLoad()).isDevelopment) return; o.meta = Object.assign({}, o.meta || {}, { 'Hurdles On': bkConventions(bkLoad()).cvHurdleBasis === 'lp' ? 'LP cash flows' : 'Deal equity' }); });
wrap('Returns', function(o){ o.meta = Object.assign({}, o.meta || {}, { Conventions: cvLabel() }); });

/* GP / LP ownership must total 100%: an out-of-range GP share is a FAIL control, which the readiness
   state machine already turns into NOT DECISION-GRADE. */
var prevCtl = window.bkModelControls;
if(typeof prevCtl === 'function'){
  window.bkModelControls = function(){
    var out = prevCtl.apply(this, arguments);
    try {
      var s = bkLoad(), gp = Number(s.gpShare);
      if(Array.isArray(out) && hasDeal() && !(isFinite(gp) && gp >= 0 && gp <= 1))
        out.push({ level:'FAIL', area:'Equity', msg:'GP equity share must be between 0% and 100% so GP + LP ownership totals 100% (entered: ' + pct(gp) + ').' });
    } catch(e){}
    return out;
  };
}
window.bkConventionsLabel = cvLabel;
})();
