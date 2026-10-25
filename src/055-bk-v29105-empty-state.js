
/* ===========================================================================
   V29.10.5 - EMPTY-STATE ARCHITECTURE  (supersedes bk-v29104-production-blank-slate)
   ===========================================================================
   The V29.10.4 blank slate gated 26 deal sheets on a provisioning flag. That
   was necessary and it was not sufficient, for a reason that only a real
   browser could reveal.

   MEASURED, on a browser with localStorage COMPLETELY EMPTY:

       "BK-001 - Havard Avenue" present on Home : true
       "(1.03%) / 0.92x"        present on Home : true
       "BASE CASE"              present on Home : true
       bkIsProvisioned()                        : false
       bkHasActiveDeal()                        : false

   The Home "Active Deal & Certification" card never read state at all. It was
   static HTML left over from the V7.2 design prototype - the deal name, the
   scenario, the IRR, the MOIC and the certification chips were string
   literals in sheetHome(). No storage migration could ever have fixed it,
   because there was no storage involved. The same prototype residue sits in
   the app shell rail and in four other renderers' meta strips.

   Note the tell that identifies it beyond argument: the literal is spelled
   "Havard Avenue" while the live accessor spells it "Harvard Avenue". Both
   spellings appear on the same screenshot - static text above, live state in
   the sidebar.

   This layer replaces those literals with state-derived values, adds Home to
   the gate, and states the empty case honestly.

   FINANCIAL LOGIC CHANGES: NONE.
   =========================================================================== */
(function(){
'use strict';

var QA_KEY = 'bkcapital.qa.fixture.active.v01';

function provisioned(){ return window.bkIsProvisioned(); }

window.bkQAFixtureActive = function(){
  try { return localStorage.getItem(QA_KEY) === '1'; } catch(e){ return false; }
};

/* ---------------------------------------------------------------- counts */
function safeArr(key){
  try { var a = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(a) ? a : []; }
  catch(e){ return []; }
}
window.bkProductionCounts = function(){
  var s = null;
  try { s = window.bkActiveDeal(); } catch(e){ s = null; }
  var staged = null;
  try { staged = JSON.parse(localStorage.getItem('bkcapital.source.staging.v02') || 'null'); } catch(e){}
  var boot = (typeof window.bkBootReport === 'function') ? window.bkBootReport() : null;
  return {
    properties      : safeArr('bkcapital.cre.portfolio.v01').length,
    activeDeal      : s ? (s.dealId || s.name || null) : null,
    tenants         : s && Array.isArray(s.rentRoll) ? s.rentRoll.length : 0,
    investors       : s && Array.isArray(s.investors) ? s.investors.length : 0,
    sourcePackages  : safeArr('bkcapital.source.approvals.v02').length,
    currentStage    : staged ? (staged.sourceFile || 'staged') : null,
    qaFixtureActive : window.bkQAFixtureActive(),
    quarantined     : (typeof window.bkQuarantineIndex === 'function')
                        ? window.bkQuarantineIndex().filter(function(b){ return !b.restored; }).length : 0,
    bootAction      : boot ? boot.action : 'unknown',
    suppressedWrites: (typeof window.bkSuppressedWriteCount === 'function')
                        ? window.bkSuppressedWriteCount() : 0
  };
};

/* ---------------------------------------------------------------- provisioning actions */
/* A brand-new deal is BLANK. It deliberately does not inherit BK_BASE's
   development identity, so a new deal can never be confused with ShorePointe.
   Engine defaults still resolve through BK_BASE as they always did. */
/* V32.1 - NEW-DEAL ASSUMPTIONS. Nothing is inherited from the engine's ShorePointe base deal.
   (a) Property- and market-specific assumptions start BLANK and are required before the deal is ready.
   (b) Deal-STRUCTURE conventions (financing terms, fee rates, waterfall terms, scenario deltas) come from a NAMED template,
       stamped on the deal; every such field shows TEMPLATE until the user changes it. Choose template:'Blank' to zero them too. */
window.BK_TEMPLATE_NAME = 'Institutional Standard v2';
/* v2 (CV-2026.10): template values that differ from the engine's BK_BASE defaults. They are stamped
   onto NEW deals only. BK_BASE itself is NOT changed: bkSave() omits any field equal to its BK_BASE
   default, so changing BK_BASE.gpShare would silently move every existing 50% deal to the new value. */
window.BK_TEMPLATE_OVERRIDES = { gpShare: 0.10 };
window.BK_TEMPLATE_KEYS = ['acqLTV','acqLTC','acqDSCR','acqRate','acqAmort','acqOrigFee','acqIO','debtTerm','permLTV','permDSCR','permRate','permAmort','permOrigFee','permIO','refiRate','refiLTV','refiDSCR','refiAmort','refiOrigFee','acqFeePct','acquisitionFeePct','assetMgmtPct','dispositionFeePct','saleCostPct','closingCostsPct','closingPct','gpShare','pref','hurdle2','hurdle3','t2LP','t3LP','t4LP','gpCatchup','gpCatchupTarget','upRentGrowthDelta','upExitCapDelta','upDebtRateDelta','downRentGrowthDelta','downExitCapDelta','downDebtRateDelta'];
window.BK_MARKET_BLANK = ['gpr','misc','occupancy','residualLandValue','conRate','holdYears','exitCap','vacancy','commercialVacancy','badDebtPct','mgmtPct','miscPerGSF','rentGrowth','otherGrowth','opexGrowth','taxGrowth','commercialRentGrowth','refiCapRate','em1','em2','em3','capKeepCoE','capSellCoE','capRefiHeadroom','capRefiDebtYield','capSellNOIGrowth','debtIndexRate','debtSpread'];
window.bkClearTemplateValues = function(){
  var s = bkLoad(), t = s._template; if(!t) return false;
  Object.keys(t.values||{}).forEach(function(k){ s[k] = 0; });
  delete s._template; bkSave(s); if(typeof currentSheet !== 'undefined') showSheet(currentSheet); return true;
};
window.bkCreateNewDeal = function(opts){
  opts = opts || {};
  var blank = {
    dealId       : opts.dealId       || '',
    name         : opts.name         || '',
    location     : opts.location     || '',
    dealType     : opts.dealType     || 'Acquisition',
    propertyType : opts.propertyType || '',
    status       : opts.status       || 'Pipeline',
    closing      : opts.closing      || '',
    units: 0, gsf: 0, commercialArea: 0, parking: 0, siteArea: 0,
    purchasePrice: 0, t12noi: 0, taxes: 0,
    avgRent: 0, commercialRent: 0, recovery: 0, otherIncomePerUnit: 0,
    insurance: 0, payroll: 0, rm: 0, turnover: 0, utilities: 0,
    contract: 0, marketing: 0, ga: 0, reserves: 0,
    rentRoll: [], investors: [], _src: {}
  };
  window.BK_MARKET_BLANK.forEach(function(k){ blank[k] = 0; });
  var tplName = opts.template === undefined ? window.BK_TEMPLATE_NAME : opts.template;
  if(tplName && tplName !== 'Blank'){
    var tv = {};
    window.BK_TEMPLATE_KEYS.forEach(function(k){ if(typeof BK_BASE[k] === 'number'){ tv[k] = BK_BASE[k]; blank[k] = BK_BASE[k]; } });
    Object.keys(window.BK_TEMPLATE_OVERRIDES || {}).forEach(function(k){ tv[k] = window.BK_TEMPLATE_OVERRIDES[k]; blank[k] = window.BK_TEMPLATE_OVERRIDES[k]; });
    blank._template = { name: tplName, values: tv, appliedAt: new Date().toISOString() };
  } else {
    window.BK_TEMPLATE_KEYS.forEach(function(k){ if(typeof BK_BASE[k] === 'number') blank[k] = 0; });
  }
  /* New deals carry the current underwriting conventions explicitly (methodology, not template
     values, so they apply whichever template is chosen). A caller may still pass its own. */
  Object.keys(BK_CV_STANDARD).forEach(function(k){ blank[k] = BK_CV_STANDARD[k]; });
  blank._conventions = { version:'CV-2026.10', appliedAt:new Date().toISOString() };
  /* depreciation: new deals use tax-grade MACRS; a saved deal with no depMethod keeps the V29.11 simplified schedule */
  blank._depr = { settings:{ depMethod:'macrs', bonusMode:'statutory' }, components:[] };
  /* Any further field the caller supplies is honoured, so a creation wizard can
     provision a deal in one step instead of creating a blank and then editing
     it. Identity and economic fields are applied AFTER the zeroed template, so
     nothing the caller asked for is silently discarded. */
  Object.keys(opts).forEach(function(k){
    if(k.charAt(0) === '_' || k === 'template') return;
    blank[k] = opts[k];
  });
  try { localStorage.removeItem('bkcapital.cre.v02'); } catch(e){}
  window.bkProvision('new-deal', Object.assign({}, bkLoad(), blank));
  if(typeof currentSheet !== 'undefined') showSheet('Deal Underwrite');
  return window.bkProductionCounts();
};

window.bkMarkProvisioned = function(how){ window.bkProvision(how || 'manual'); };

/* Returns the application to a genuine factory state. Deal data is
   QUARANTINED rather than deleted, so this is reversible like every other
   lifecycle action. */
window.bkResetToFactoryState = function(){
  return window.bkWithWriteAuthority('factory reset', function(){
    ['bkcapital.cre.v02','bkcapital.cre.portfolio.v01','bkcapital.source.staging.v02',
     'bkcapital.source.approvals.v02','bkcapital.tenant.approvals.v01']
      .forEach(function(k){ try{ localStorage.removeItem(k); }catch(e){} });
    window.bkDeprovision();
    try { localStorage.removeItem(QA_KEY); } catch(e){}
    if(typeof currentSheet !== 'undefined') showSheet('Home');
    return window.bkProductionCounts();
  });
};

/* ---------------------------------------------------------------- QA fixture isolation */
var __qaBackup = null;
var QA_STORES = ['bkcapital.cre.v02','bkcapital.cre.portfolio.v01','bkcapital.source.staging.v02',
                 'bkcapital.source.approvals.v02','bkcapital.tenant.approvals.v01',
                 'bkcapital.cre.provisioned.v01'];
window.bkQAFixtureBegin = function(fixture){
  if(__qaBackup) throw new Error('A QA fixture is already active.');
  return window.bkWithWriteAuthority('qa fixture begin', function(){
    __qaBackup = {};
    QA_STORES.forEach(function(k){ try{ __qaBackup[k] = localStorage.getItem(k); }catch(e){} });
    QA_STORES.forEach(function(k){ try{ localStorage.removeItem(k); }catch(e){} });
    try { localStorage.setItem(QA_KEY,'1'); } catch(e){}
    if(fixture && typeof fixture === 'object'){
      window.bkProvision('qa-fixture', Object.assign({}, bkLoad(), fixture));
    }
    return true;
  });
};
window.bkQAFixtureEnd = function(){
  if(!__qaBackup) return false;
  return window.bkWithWriteAuthority('qa fixture end', function(){
    QA_STORES.forEach(function(k){
      try {
        var v = __qaBackup[k];
        if(v === null || v === undefined) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      } catch(e){}
    });
    try { localStorage.removeItem(QA_KEY); } catch(e){}
    __qaBackup = null;
    return true;
  });
};

/* ---------------------------------------------------------------- empty states */
var DEAL_SHEETS = ['Home','Deal Underwrite','Rent Roll','Operating Underwrite','Property CF','Debt',
  'Debt Schedule','Covenant Monitor','Returns','Equity Waterfall','After-Tax','Sensitivity',
  'Reverse Solve','Development','Dev Schedule','Dev Draws','Residual Land','Sources & Uses',
  'Investors','Investor Schedules','Liquidity','Waterfall (M)','Sponsor CF','Lease Cohort CF',
  'Deal Vectors (M)','Ledger (M)','Source Data'];

function quarantineNotice(){
  var idx = (typeof window.bkQuarantineIndex === 'function') ? window.bkQuarantineIndex() : [];
  var open = idx.filter(function(b){ return !b.restored; });
  if(!open.length) return '';
  var b = open[open.length-1];
  var what = b.entries.map(function(e){ return e.key; }).join(', ');
  return '<div class="note-flag" style="margin-top:12px;"><span>&#9888;</span><div>'
    + '<b>Previous browser state was set aside on upgrade.</b> It was classified <b>'
    + b.classification + '</b> - ' + b.reason + '. '
    + 'Nothing was deleted: ' + b.entries.length + ' store(s) (' + what + ') were copied to quarantine '
    + 'and can be put back exactly as they were.'
    + '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">'
    + '<button type="button" class="status-chip" onclick="bkQuarantineRestore(\'' + b.stamp + '\');showSheet(currentSheet);">RESTORE PREVIOUS STATE</button>'
    + '<button type="button" class="status-chip" onclick="showSheet(\'Storage Lifecycle\')">REVIEW IN STORAGE LIFECYCLE</button>'
    + '</div></div></div>';
}

function emptyState(sheet){
  var c = window.bkProductionCounts();
  return {
    title: sheet,
    crumbs: 'No Deal Loaded',
    desc: 'This page reports the active deal. No deal is loaded.',
    meta: { 'Active Deal':'None', Properties: c.properties, Status:'Empty' },
    main:
      '<div class="tbl-wrap"><table class="fin"><caption>No Deal Loaded</caption><tbody>'
      + '<tr><td class="rowlabel" colspan="2">'
      + 'There is no active deal, so this page has nothing to calculate. Numbers are deliberately '
      + 'not shown rather than displaying defaults that could be mistaken for underwriting.'
      + '</td></tr></tbody></table></div>'
      + '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">'
      + '<button type="button" class="status-chip pass" onclick="bkCreateNewDeal()">CREATE NEW DEAL</button>'
      + '<button type="button" class="status-chip" onclick="showSheet(\'Portfolio Import\')">IMPORT PORTFOLIO / MASTER DATA</button>'
      + '<button type="button" class="status-chip" onclick="showSheet(\'Source Ingestion\')">INGEST A SOURCE PACKAGE</button>'
      + '</div>'
      + quarantineNotice()
      + '<div class="note-flag" style="margin-top:12px;"><span>&#9432;</span><div>'
      + 'A clean installation starts with zero properties, zero deals and no active deal. '
      + 'Create a deal manually, or establish a portfolio from a master workbook.'
      + '</div></div>',
    sidebar: (typeof sidebarShell === 'function')
      ? sidebarShell('<div class="card"><div class="card-head">Application State</div><div class="metric-list">'
          + '<div class="metric-row"><span class="k">Active Deal</span><span class="v">None</span></div>'
          + '<div class="metric-row"><span class="k">Properties</span><span class="v">'+c.properties+'</span></div>'
          + '<div class="metric-row"><span class="k">Quarantined Batches</span><span class="v">'+c.quarantined+'</span></div>'
          + '<div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Ready</span></span></div>'
          + '</div></div>')
      : ''
  };
}
window.bkEmptyState = emptyState;
window.BK_DEAL_SHEETS = DEAL_SHEETS;

/* ---------------------------------------------------------------- Home, rebuilt from state */
/* Every value below is derived. Nothing is a literal. When there is no deal
   this renderer is never reached, because Home is gated like every other
   deal-reporting sheet. */
function liveHome(){
  var s = window.bkActiveDeal();
  var label = (typeof bkActiveDealLabel === 'function') ? bkActiveDealLabel() : '-';
  var scenario = (s && s.scenarioCase) ? String(s.scenarioCase) : 'Not set';

  /* Deal-data completeness/readiness is established BEFORE the returns engine.
     A finite number from an incomplete draft is not an investment result. */
  var irrTxt = 'Not calculated', moicTxt = 'Required inputs missing', retChip = 'warn';

  /* Deal-data completeness is counted, not asserted. */
  var REQUIRED = ['dealId','name','location','propertyType','units','gsf','purchasePrice','exitCap','holdYears'];
  var missing = REQUIRED.filter(function(k){
    var v = s ? s[k] : undefined;
    if(v === undefined || v === null || v === '' || (typeof v === 'number' && !isFinite(v))) return true;
    /* Economic readiness is stricter than JavaScript finiteness. A zero acquisition
       basis is a blank draft, not a deal that should produce investment returns. */
    if(k === 'purchasePrice' && !(Number(v) > 0)) return true;
    return false;
  });
  var dataChip = missing.length
    ? '<span class="status-chip warn">' + missing.length + ' field(s) missing</span>'
    : '<span class="status-chip pass">Complete</span>';

  if(!missing.length){
    try {
      var x = bkMonthlyReturns();
      var irr = x && x.irr, moic = x && x.moic;
      if(isFinite(irr)){ irrTxt = bkPct(irr); retChip = 'pass'; }
      if(isFinite(moic)){ moicTxt = moic.toFixed(2) + 'x'; }
    } catch(e){ irrTxt = 'Engine error'; moicTxt = 'Engine error'; retChip = 'fail'; }
  }

  /* Portfolio currency: compare each snapshot's stored identity against the
     live deal rather than trusting a counter. */
  var stale = 0, snaps = [];
  try { snaps = JSON.parse(localStorage.getItem('bkcapital.cre.portfolio.v01') || '[]') || []; } catch(e){}
  if(Array.isArray(snaps)) snaps.forEach(function(r){
    if(String(r && r.dealId) === String(s && s.dealId)){
      if(JSON.stringify(r.purchasePrice) !== JSON.stringify(s.purchasePrice)) stale++;
    }
  });
  var portChip = !snaps.length ? '<span class="status-chip">No snapshots</span>'
    : stale ? '<span class="status-chip warn">' + stale + ' stale snapshot' + (stale>1?'s':'') + '</span>'
            : '<span class="status-chip pass">Current</span>';

  var main =
    '<div class="title-block" style="padding-left:0;padding-right:0;border:none;">'
    + '<div class="crumbs">Overview &middot; Navigation</div>'
    + '<h2>CRE Master</h2>'
    + '<p class="desc">Institutional acquisition &amp; development underwriting engine. '
    + 'This tab orients every user: active deal status, certification, the workflow, and the sheet map.</p>'
    + '</div>'
    + '<div class="tbl-wrap" style="margin-bottom:18px;"><table class="fin">'
    + '<caption>Active Deal &amp; Certification</caption><tbody>'
    + '<tr><td class="rowlabel">Deal</td><td class="v" style="text-align:left;">' + label + '</td></tr>'
    + '<tr><td class="rowlabel">Scenario</td><td class="v" style="text-align:left;">' + scenario + '</td></tr>'
    + '<tr><td class="rowlabel">Deal Data</td><td style="text-align:left;">' + dataChip + '</td></tr>'
    + '<tr><td class="rowlabel">Levered IRR / MOIC</td><td class="v" style="text-align:left;">'
    +   irrTxt + ' / ' + moicTxt + '</td></tr>'
    + '<tr class="section"><td colspan="2">Certification</td></tr>'
    + '<tr><td class="rowlabel">Returns Engine</td><td style="text-align:left;">'
    +   '<span class="status-chip ' + retChip + '">' + (retChip==='pass'?'Producing finite results':(missing.length?'Not calculated - required inputs missing':'See Returns')) + '</span></td></tr>'
    + '<tr><td class="rowlabel">Portfolio Current</td><td style="text-align:left;">' + portChip + '</td></tr>'
    + '</tbody></table></div>'
    + (missing.length
        ? '<div class="note-flag"><span>&#9888;</span><div><b>Incomplete deal data -</b> '
          + missing.join(', ') + ' not set. Nothing is invented to fill these; sheets that depend '
          + 'on them will report the gap rather than compute around it.</div></div>'
        : '');

  var sidebar = (typeof sidebarShell === 'function')
    ? sidebarShell('<div class="card"><div class="card-head">Application State</div><div class="metric-list">'
        + '<div class="metric-row"><span class="k">Active Deal</span><span class="v">' + label + '</span></div>'
        + '<div class="metric-row"><span class="k">Properties</span><span class="v">' + window.bkProductionCounts().properties + '</span></div>'
        + '<div class="metric-row"><span class="k">Rent Roll Units</span><span class="v">' + window.bkProductionCounts().tenants + '</span></div>'
        + '</div></div>'
        + (typeof modelInfoCard === 'function' ? modelInfoCard('') : ''))
    : '';

  return { title:'Home', crumbs:'Overview',
           desc:'Active deal status and certification, derived from live state.',
           meta:{ 'Active Deal':label, Scenario:scenario, Status: missing.length?'Incomplete':'Complete' },
           main:main, sidebar:sidebar };
}

if(typeof RENDERERS !== 'undefined'){ RENDERERS['Home'] = liveHome; }

/* ---------------------------------------------------------------- persistent shell */
/* .rail-foot lives OUTSIDE the region showSheet() rewrites, so a literal there
   survives every navigation forever. That is exactly how "Havard Avenue ·
   BK-001" stayed on screen in a browser whose localStorage was empty. It is
   now derived on every render like everything else. */
function syncShell(){
  var el = document.getElementById('bkRailFoot');
  if(!el) return;
  var c = window.bkProductionCounts();
  if(!provisioned()){
    el.textContent = c.quarantined
      ? 'No active deal · ' + c.quarantined + ' quarantined state batch(es) recoverable'
      : 'No active deal · ' + c.properties + ' propert' + (c.properties===1?'y':'ies') + ' in portfolio';
  } else {
    el.textContent = bkActiveDealLabel() + ' · ' + c.tenants + ' rent-roll unit(s) · live values, nothing invented.';
  }
}
window.bkSyncShell = syncShell;
if(typeof showSheet === 'function' && !showSheet.__bkShellSync){
  var _showSheet = showSheet;
  var wrapped = function(){
    var r = _showSheet.apply(this, arguments);
    try { syncShell(); } catch(e){}
    return r;
  };
  wrapped.__bkShellSync = true;
  window.showSheet = wrapped;
  try { showSheet = wrapped; } catch(e){}
}
try { syncShell(); } catch(e){}

/* Gate every deal-dependent renderer through the canonical registry. */
if(typeof RENDERERS !== 'undefined'){
  DEAL_SHEETS.forEach(function(name){
    var orig = RENDERERS[name];
    if(typeof orig !== 'function' || orig.__bkBlankSlate) return;
    var gated = function(){
      if(!provisioned()) return emptyState(name);
      return orig.apply(this, arguments);
    };
    gated.__bkBlankSlate = true;
    gated.__bkOriginal   = orig;
    RENDERERS[name] = gated;
  });
}
})();
