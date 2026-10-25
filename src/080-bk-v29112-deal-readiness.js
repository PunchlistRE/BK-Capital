
/* ===========================================================================
   V29.11.2 - DEAL READINESS STATE MACHINE + OUTPUT SUPPRESSION
   ===========================================================================
   The problem this closes: a deal missing critical inputs could still render a
   confident-looking IRR, MOIC and promote. The shipped SHOREPOINTE fixture is
   the standing example - no purchase price, no exit cap, no hold, no rent roll,
   and it produces a -$513,888 NOI that looks like underwriting.

   STATES

     NO DEAL             nothing provisioned (already handled by the empty-state gate)
     BLOCKED             a hard failure - non-finite economics, or a validation
                         error that makes downstream numbers meaningless
     DRAFT               core underwriting inputs incomplete -> OUTPUTS SUPPRESSED
     UNDERWRITING READY  core inputs complete; operating economics are meaningful
     INVESTMENT READY    core + debt + exit + equity complete and nothing blocking
     SOURCE REVIEW       an overlay on a ready deal: unresolved source exceptions

   SOURCE REVIEW is deliberately an OVERLAY, not a downgrade. Outstanding source
   exceptions mean "a number may be superseded", not "this cannot be computed",
   so it is surfaced without suppressing results.

   Requirements are DEAL-TYPE AWARE (section AM): a stabilised acquisition is
   not asked for construction inputs, and a ground-up development is.

   WHAT SUPPRESSION MEANS. Only RESULT sheets are suppressed, and only in DRAFT
   or BLOCKED. Input sheets stay reachable and editable - you cannot complete a
   deal you are locked out of. The engine itself is untouched: this layer never
   changes a calculation, it decides whether a result may be displayed.

   FINANCIAL LOGIC CHANGES: NONE.
   =========================================================================== */
(function(){
'use strict';

function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
function has(v){ return v !== undefined && v !== null && String(v).trim() !== ''; }

/* ---------------------------------------------------------------- requirements */
function requirements(s){
  var isDev = /develop|redevelop/i.test(String(s.dealType||''));
  var core = [
    {key:'dealId',       label:'Deal ID',                group:'Identity',    ok:has(s.dealId)},
    {key:'name',         label:'Property / Deal Name',   group:'Identity',    ok:has(s.name)},
    {key:'propertyType', label:'Property Type',          group:'Identity',    ok:has(s.propertyType)},
    {key:'closing',      label:'Closing / Start Date',   group:'Identity',
       ok:(typeof bkParseDealDate==='function') ? !!bkParseDealDate(s.closing,null) : has(s.closing)},
    {key:'purchasePrice',label:isDev?'Land Basis':'Purchase Price', group:'Basis', ok:num(s.purchasePrice)>0},
    {key:'size',         label:'Building Size (units, GSF or commercial area)', group:'Basis',
       ok:(num(s.units)>0 || num(s.gsf)>0 || num(s.commercialArea)>0)},
    {key:'revenue',      label:'Revenue Basis (rent roll, average rent or commercial rent)', group:'Operations',
       ok:((s.rentRoll||[]).length>0 || num(s.avgRent)>0 || num(s.commercialRent)>0)},
    {key:'holdYears',    label:'Hold Period',            group:'Exit',        ok:num(s.holdYears)>0},
    {key:'exitCap',      label:'Exit Capitalisation Rate',group:'Exit',       ok:num(s.exitCap)>0}
  ];
  if(isDev){
    core.push({key:'constructionMonths', label:'Construction Period', group:'Development',
               ok:num(s.constructionMonths)>0});
    core.push({key:'devCost', label:'Development Cost (trade ladder or source construction cost)',
               group:'Development',
               ok:(function(){
                 try { var d = bkDevV09(); return (num(d.hard)+num(d.soft))>0; } catch(e){ return false; }
               })()});
  }
  /* Investment-ready adds financing, exit mechanics and promote structure. */
  var invest = [
    {key:'debt', label:'Debt Assumptions (rate and amortisation, or Debt switched off)', group:'Debt',
       ok:(s.debtEnabled === false) || (num(s.acqRate)>0 && num(s.acqAmort)>0)},
    {key:'saleCostPct', label:'Cost of Sale', group:'Exit', ok:s.saleCostPct !== undefined},
    {key:'gpShare', label:'GP / LP Equity Split', group:'Equity', ok:s.gpShare !== undefined},
    {key:'pref',    label:'Preferred Return',     group:'Equity', ok:s.pref !== undefined}
  ];
  return {isDev:isDev, core:core, invest:invest};
}

/* ---------------------------------------------------------------- blockers */
function blockers(s){
  var out = [];
  try {
    var u = bkAnnualCF();
    if(!u || !u.arr || !u.arr.length) out.push('The annual cash flow engine returned no periods.');
    else if(!isFinite(u.arr[0].noi)) out.push('Year-1 NOI is not a finite number.');
  } catch(e){ out.push('Cash flow engine error: ' + (e && e.message)); }
  try {
    if(typeof bkDepreciation === 'function'){
      var d = bkDepreciation();
      if(d && d.errors && d.errors.length)
        d.errors.forEach(function(x){ out.push('Depreciation: ' + x.msg); });
    }
  } catch(e){}
  return out;
}

/* ---------------------------------------------------------------- source exceptions */
function sourceExceptions(){
  try {
    if(typeof bkSourceFindings !== 'function') return 0;
    return bkSourceFindings().filter(function(f){ return f.severity === 'BLOCKING'; }).length;
  } catch(e){ return 0; }
}

/* ---------------------------------------------------------------- state machine */
function readiness(){
  if(typeof window.bkHasActiveDeal === 'function' && !window.bkHasActiveDeal()){
    return { state:'NO DEAL', canCalculate:false, missing:[], met:[], blockers:[],
             sourceExceptions:0, isDev:false, investMissing:[] };
  }
  var s = bkLoad();
  var req = requirements(s);
  var missing = req.core.filter(function(r){ return !r.ok; });
  var met     = req.core.filter(function(r){ return r.ok; });
  var investMissing = req.invest.filter(function(r){ return !r.ok; });
  var blk = blockers(s);
  var srcEx = sourceExceptions();

  var state, canCalculate;
  if(blk.length){ state = 'BLOCKED'; canCalculate = false; }
  else if(missing.length){ state = 'DRAFT'; canCalculate = false; }
  else if(investMissing.length){ state = 'UNDERWRITING READY'; canCalculate = true; }
  else { state = 'INVESTMENT READY'; canCalculate = true; }
  /* V30.2: readiness and model controls must agree - a FAIL control means the deal is not
     decision-grade even when every required input is present. */
  var ctlFails = 0;
  try { ctlFails = (typeof window.bkModelControls==='function') ? window.bkModelControls().filter(function(c){ return c.level==='FAIL'; }).length : 0; } catch(e){}
  if(ctlFails && (state==='INVESTMENT READY' || state==='UNDERWRITING READY')) state = 'NOT DECISION-GRADE';

  return { state:state, canCalculate:canCalculate, missing:missing, met:met,
           investMissing:investMissing, blockers:blk, sourceExceptions:srcEx,
           isDev:req.isDev,
           /* SOURCE REVIEW is an overlay flag, never a downgrade of canCalculate. */
           sourceReview: canCalculate && srcEx > 0 };
}
window.bkDealReadiness = readiness;

/* ---------------------------------------------------------------- presentation */
function esc(v){ return (typeof bkEsc==='function') ? bkEsc(v) : String(v==null?'':v); }
window.bkReadinessChip = function(){
  var r = readiness();
  var cls = {'INVESTMENT READY':'pass','UNDERWRITING READY':'pass','NOT DECISION-GRADE':'fail','DRAFT':'warn',
             'BLOCKED':'fail','NO DEAL':''}[r.state] || '';
  var label = r.state + (r.sourceReview ? ' · SOURCE REVIEW' : '');
  return '<span class="status-chip '+cls+'">'+esc(label)+'</span>';
};

function groupList(items){
  var by = {};
  items.forEach(function(i){ (by[i.group] = by[i.group] || []).push(i.label); });
  return Object.keys(by).map(function(g){
    return '<tr><td class="rowlabel" data-bk-align="text">'+esc(g)+'</td>'
         + '<td data-bk-align="text">'+by[g].map(esc).join('<br>')+'</td></tr>';
  }).join('');
}

function notReadyPanel(sheet){
  var r = readiness();
  var isBlocked = r.state === 'BLOCKED';
  var main =
      '<div class="tbl-wrap"><table class="fin wrap"><caption>'
    +   (isBlocked ? 'Calculation Blocked' : 'Deal Not Ready - Results Withheld')
    + '</caption><tbody>'
    + '<tr><td class="rowlabel" data-bk-align="text">Readiness</td><td data-bk-align="text">'+window.bkReadinessChip()+'</td></tr>'
    + '<tr><td class="rowlabel" colspan="2" data-bk-align="text">'
    +   (isBlocked
        ? 'This deal cannot be calculated. Results are withheld rather than shown as zeros or '
          + 'placeholder numbers that could be mistaken for underwriting.'
        : 'This deal is missing inputs that <b>'+esc(sheet)+'</b> depends on. Returns are withheld '
          + 'rather than displayed against incomplete assumptions - a plausible-looking IRR on a '
          + 'half-built deal is worse than no IRR.')
    + '</td></tr></tbody></table></div>';

  if(isBlocked && r.blockers.length){
    main += '<div class="tbl-wrap" style="margin-top:14px"><table class="fin wrap">'
      + '<caption>Blocking Failures</caption><tbody>'
      + r.blockers.map(function(b){ return '<tr><td class="rowlabel" colspan="2" data-bk-align="text">'+esc(b)+'</td></tr>'; }).join('')
      + '</tbody></table></div>';
  }
  if(r.missing.length){
    main += '<div class="tbl-wrap" style="margin-top:14px"><table class="fin wrap">'
      + '<caption>Required Inputs Still Missing</caption>'
      + '<thead><tr><th class="rowlabel-h">Area</th><th style="text-align:left">Input</th></tr></thead>'
      + '<tbody>'+groupList(r.missing)+'</tbody></table></div>';
  }
  if(r.met.length){
    main += '<div class="tbl-wrap" style="margin-top:14px"><table class="fin wrap">'
      + '<caption>Inputs Already Complete</caption>'
      + '<thead><tr><th class="rowlabel-h">Area</th><th style="text-align:left">Input</th></tr></thead>'
      + '<tbody>'+groupList(r.met)+'</tbody></table></div>';
  }
  main += '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">'
    + '<button type="button" class="status-chip" onclick="showSheet(\'Deal Underwrite\')">GO TO DEAL UNDERWRITE</button>'
    + '<button type="button" class="status-chip" onclick="showSheet(\'Rent Roll\')">GO TO RENT ROLL</button>'
    + '<button type="button" class="status-chip" onclick="showSheet(\'Debt\')">GO TO DEBT</button>'
    + '</div>';

  return {
    title: sheet, crumbs: 'Returns &amp; Equity',
    desc: 'Results are withheld until the deal has the inputs this page depends on.',
    meta: { Readiness:r.state, 'Missing Inputs':r.missing.length,
            'Blocking Failures':r.blockers.length, Status: isBlocked?'BLOCKED':'DRAFT' },
    main: main,
    sidebar: (typeof sidebarShell==='function')
      ? sidebarShell('<div class="card"><div class="card-head">Deal Readiness</div><div class="metric-list">'
        + '<div class="metric-row"><span class="k">State</span><span class="v">'+window.bkReadinessChip()+'</span></div>'
        + '<div class="metric-row"><span class="k">Required Inputs Met</span><span class="v">'+r.met.length+' / '+(r.met.length+r.missing.length)+'</span></div>'
        + '<div class="metric-row"><span class="k">Blocking Failures</span><span class="v">'+r.blockers.length+'</span></div>'
        + '</div></div>')
      : ''
  };
}

/* ---------------------------------------------------------------- suppression */
/* RESULT sheets only. Input sheets stay reachable so the deal can be completed. */
var RESULT_SHEETS = ['Returns','Equity Waterfall','After-Tax','Sponsor CF','Waterfall (M)'];

if(typeof RENDERERS !== 'undefined'){
  RESULT_SHEETS.forEach(function(name){
    var orig = RENDERERS[name];
    if(typeof orig !== 'function' || orig.__bkReadinessGated) return;
    var gated = function(){
      try {
        var r = readiness();
        if(r.state !== 'NO DEAL' && !r.canCalculate) return notReadyPanel(name);
      } catch(e){}
      return orig.apply(this, arguments);
    };
    gated.__bkReadinessGated = true;
    gated.__bkOriginal = orig.__bkOriginal || orig;
    if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer(name, gated);
    else RENDERERS[name] = gated;
  });
}

/* ---------------------------------------------------------------- Home surfacing */
if(typeof RENDERERS !== 'undefined' && typeof RENDERERS['Home'] === 'function'){
  var h = RENDERERS['Home'];
  if(!h.__bkReadinessSurfaced){
    var wrappedHome = function(){
      var o = h.apply(this, arguments);
      try {
        var r = readiness();
        if(r.state === 'NO DEAL') return o;
        o.meta = Object.assign({}, o.meta, {Readiness:r.state});
        var banner = '<div class="tbl-wrap" style="margin-bottom:16px"><table class="fin wrap">'
          + '<caption>Deal Readiness</caption><tbody>'
          + '<tr><td class="rowlabel" data-bk-align="text">State</td><td data-bk-align="text">'+window.bkReadinessChip()+'</td></tr>'
          + '<tr><td class="rowlabel" data-bk-align="text">Required Inputs</td><td data-bk-align="text">'
          +   r.met.length+' of '+(r.met.length+r.missing.length)+' complete'
          +   (r.missing.length ? ' - missing: '+r.missing.map(function(m){return esc(m.label);}).join(', ') : '')
          + '</td></tr>'
          + (r.investMissing.length
              ? '<tr><td class="rowlabel" data-bk-align="text">For Investment Ready</td><td data-bk-align="text">'
                + r.investMissing.map(function(m){return esc(m.label);}).join(', ') + '</td></tr>'
              : '')
          + (r.blockers.length
              ? '<tr><td class="rowlabel" data-bk-align="text">Blocking</td><td data-bk-align="text">'
                + r.blockers.map(esc).join('<br>') + '</td></tr>'
              : '')
          + (r.sourceReview
              ? '<tr><td class="rowlabel" data-bk-align="text">Source Review</td><td data-bk-align="text">'
                + r.sourceExceptions + ' blocking source finding(s) - results are shown but a figure may be superseded.</td></tr>'
              : '')
          + '</tbody></table></div>';
        o.main = banner + o.main;
      } catch(e){}
      return o;
    };
    wrappedHome.__bkReadinessSurfaced = true;
    wrappedHome.__bkOriginal = h.__bkOriginal || h;
    if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Home', wrappedHome);
    else RENDERERS['Home'] = wrappedHome;
  }
}

})();
