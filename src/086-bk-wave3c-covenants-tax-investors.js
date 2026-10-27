
/* ===========================================================================
   WAVE 3C - COVENANTS, TAX, INVESTOR ALLOCATION, HURDLE BRANCH, DRIVERS
   ===========================================================================
   What is EXPOSURE here (engine already computes it, verified):
     - the equity-multiple hurdle branch: setting hurdleBasis='2' was measured to
       change the waterfall tier balances, so the branch exists and only lacked a
       control
     - all six draw-curve fields (hard method/steepness, soft pre/con/lease
       methods, soft con steepness) exist and drive the monthly draw profile
     - monthly T-12 covenant series is a REDUCTION over bkAnnualCF().monthly and
       bkDebt().months, both of which already run monthly
     - per-investor allocation is a pro-rata share of the canonical waterfall's
       own lpCon/gpCon/lpDist/gpDist monthly rows

   What is genuinely NEW, and why it is not an invented convention:
     - the six missing scenario drivers are added the SAME way the three existing
       ones work (an up/down delta consumed by bkScenarioOverrides), default 0 so
       Base behaviour and every existing figure are unchanged until a user sets one
     - the tax reassessment estimator uses the workbook's stated formula
       (Operating Underwrite C37:C40) and is DISPLAY ONLY - it never overwrites
       the entered tax, exactly as the workbook's own C40 falls back to the input

   DELIBERATELY NOT RESOLVED - see the blocker list in the report:
     - sponsor fee treatment (workbook books the development and CM fee as income
       AND cost; this engine capitalises them only). Reconciling that is a policy
       choice, so it is documented, not invented.
   =========================================================================== */
(function(){
'use strict';

function esc(v){ return (typeof bkEsc==='function') ? bkEsc(v) : String(v==null?'':v); }
function money(n){
  if(n===null||n===undefined||n==='') return '-';
  var x=Number(n); if(!isFinite(x)) return '-';
  if(Object.is(x,-0)) x=0;
  var neg=x<0, a=Math.abs(x);
  var body = a<100 ? a.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
                   : a.toLocaleString('en-US',{maximumFractionDigits:0});
  return neg ? '($'+body+')' : '$'+body;
}
function money0(n){ var x=Number(n); return (!isFinite(x)||x===0) ? '-' : money(x); }
function pct(n,dp){ var x=Number(n); if(!isFinite(x)) return '-'; return (x*100).toFixed(dp===undefined?2:dp)+'%'; }
function mult(n){ var x=Number(n); if(!isFinite(x)) return '-'; return x.toFixed(2)+'x'; }
function intf(n){ var x=Number(n); if(!isFinite(x)) return '-'; return Math.round(x).toLocaleString('en-US'); }
function chip(cls,t){ return '<span class="status-chip '+(cls||'')+'">'+esc(t)+'</span>'; }
function note(sym,html){ return '<div class="note-flag" style="margin-top:10px;"><span>'+sym+'</span><div>'+html+'</div></div>'; }
function wrapTable(caption, headHtml, bodyHtml){
  return '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>'+caption+'</caption>'
       + (headHtml?'<thead>'+headHtml+'</thead>':'') + '<tbody>'+bodyHtml+'</tbody></table></div>';
}
function lbl(t){ return '<td class="rowlabel" data-bk-align="text">'+t+'</td>'; }
function val(t){ return '<td class="v">'+t+'</td>'; }
function txt(t){ return '<td data-bk-align="text">'+t+'</td>'; }
function extend(sheet, tag, fn){
  if(typeof RENDERERS==='undefined' || typeof RENDERERS[sheet] !== 'function') return false;
  var prev = RENDERERS[sheet];
  if(prev['__'+tag]) return true;
  var wrapped = function(){
    var o = prev.apply(this, arguments);
    // BLANK-SLATE GUARD: extension layers must never append calculations to a
    // canonical no-deal page. The base renderer is authoritative for empty state.
    try {
      if(typeof window.bkProductionCounts === 'function' && !window.bkProductionCounts().activeDeal) return o;
    } catch(_blankStateErr){}
    if(/no deal loaded|there is no active deal/i.test(String(o && o.main || ''))) return o;
    if(/withheld|calculation blocked/i.test(String(o && o.main || ''))) return o;
    try { fn(o); } catch(e){
      o.main = (o.main||'') + note('&#9888;','<b>'+esc(sheet)+' 3C error:</b> '+esc(e.message));
    }
    return o;
  };
  wrapped['__'+tag] = true;
  wrapped.__bkOriginal = prev.__bkOriginal || prev;
  if(typeof window.bkRegisterRenderer==='function') window.bkRegisterRenderer(sheet, wrapped);
  else RENDERERS[sheet] = wrapped;
  return true;
}
function setField(k, v){ var s = bkLoad(); s[k] = v; bkSave(s);
  if(typeof showSheet==='function') showSheet(typeof currentSheet!=='undefined'?currentSheet:'Home'); }

/* =====================================================================
   NEW ASSUMPTIONS - added to BK_BASE so they persist, default to inert
   ===================================================================== */
if(typeof BK_BASE !== 'undefined'){
  var NEW_DEFAULTS = {
    // tax reassessment - display-only estimator
    assessmentRatio: 0, millageRate: 0,
    // the six scenario drivers the workbook has and this engine did not.
    // Every default is 0, so Base and both existing cases are unchanged.
    upVacancyDelta: 0,        downVacancyDelta: 0,
    upOpexVariance: 0,        downOpexVariance: 0,
    upHardCostVariance: 0,    downHardCostVariance: 0,
    upSoftCostVariance: 0,    downSoftCostVariance: 0,
    upConstructionMoDelta: 0, downConstructionMoDelta: 0,
    upAbsorptionFactor: 0,    downAbsorptionFactor: 0
  };
  Object.keys(NEW_DEFAULTS).forEach(function(k){ if(!(k in BK_BASE)) BK_BASE[k] = NEW_DEFAULTS[k]; });
}

/* =====================================================================
   SCENARIO DRIVERS - extend bkScenarioOverrides additively.
   The existing three deltas are untouched; the six new ones default to 0,
   so no existing scenario figure can move until a user sets one.
   ===================================================================== */
(function(){
  var prev = window.bkScenarioOverrides;
  if(typeof prev !== 'function' || prev.__bkW3C) return;
  var wrapped = function(s, which){
    var ov = prev.call(this, s, which) || {};
    if(which !== 'Upside' && which !== 'Downside') return ov;
    var up = which === 'Upside';
    function d(k){ var v = Number(s[(up?'up':'down')+k]); return isFinite(v) ? v : 0; }

    var vac = d('VacancyDelta');
    if(vac){
      ov.vacancy = Math.max(0, Number(s.vacancy||0) + vac);
      ov.commercialVacancy = Math.max(0, Number(s.commercialVacancy||0) + vac);
    }
    // Operating expense LEVEL variance - the axis the workbook varies and this
    // engine lacked. Applied as a scenario multiplier on the entered expense
    // lines, which is where the workbook applies it too. bkCalc is untouched.
    var ox = d('OpexVariance');
    if(ox){
      ['insurance','utilities','rm','contract','payroll','turnover','marketing','ga','taxes']
        .forEach(function(k){ ov[k] = Math.max(0, Number(s[k]||0) * (1+ox)); });
      ov.miscPerGSF = Math.max(0, Number(s.miscPerGSF||0) * (1+ox));
    }
    var hc = d('HardCostVariance');
    if(hc) ov.hardContPct = Math.max(0, Number(s.hardContPct||0) + hc);
    var sc = d('SoftCostVariance');
    if(sc) ov.softContPct = Math.max(0, Number(s.softContPct||0) + sc);
    var cm = d('ConstructionMoDelta');
    if(cm) ov.constructionMonths = Math.max(1, Math.round(Number(s.constructionMonths||0) + cm));
    var ab = d('AbsorptionFactor');
    if(ab) ov.leaseupMonths = Math.max(1, Math.round(Number(s.leaseupMonths||0) * (1+ab)));
    return ov;
  };
  wrapped.__bkW3C = true;
  window.bkScenarioOverrides = wrapped;
})();

/* =====================================================================
   A. MONTHLY TRAILING-TWELVE COVENANT TEST
   A reduction over the monthly NOI and monthly debt arrays the engine
   already produces. The four-state convention is the workbook's.
   ===================================================================== */
window.bkCovenantMonthlyT12 = function(){
  var s = bkLoad(), u, d;
  try { u = bkAnnualCF(); d = bkDebt(); } catch(e){ return null; }
  if(!d || d.debtEnabled === false || !(d.months||[]).length) return null;
  var mo = u.monthly || [], dm = d.months || [];
  var n = Math.min(mo.length, dm.length);
  if(!n) return null;

  var covDSCR = Number(s.acqDSCR)||0, covDY = Number(s.minDebtYield)||0, covLev = Number(s.acqLTC)||0;
  var basis = Number(s.purchasePrice)||0;
  // Stabilisation: a development deal stabilises at the engine's stab month; an
  // acquisition is stabilised from month 1. Sale is the final modelled month.
  var stabMo = 1;
  try { if(String(s.dealType||'').toLowerCase()==='development' && typeof bkDevV09==='function'){
          var dv = bkDevV09(); if(dv && dv.isDev) stabMo = Math.max(1, Number(dv.stab)||1); } } catch(e){}
  var saleMo = n;

  var rows = [], watch = 0, tested = 0;
  for(var i=0;i<n;i++){
    var m = i+1;
    var t12noi = 0, t12ds = 0, have = Math.min(12, i+1);
    for(var k=i-have+1;k<=i;k++){ t12noi += (mo[k] ? mo[k].noi : 0); t12ds += (dm[k] ? dm[k].payment : 0); }
    var bal = dm[i] ? dm[i].balance : 0;
    var dscr = t12ds > 0 ? t12noi/t12ds : NaN;
    var dy = bal > 0 ? t12noi/bal : NaN;
    var lev = basis > 0 ? bal/basis : NaN;
    var inPeriod = (m >= stabMo) && (have >= 12) && (m <= saleMo) && (bal > 0);
    var state;
    if(!inPeriod){
      state = (m < stabMo) ? 'PRE-STAB' : (have < 12 ? 'RAMP' : (bal > 0 ? 'RAMP' : 'REPAID'));
    } else {
      tested++;
      var bad = (covDSCR && isFinite(dscr) && dscr < covDSCR) || (covDY && isFinite(dy) && dy < covDY);
      if(bad) watch++;
      state = bad ? 'WATCH' : 'PASS';
    }
    rows.push({ m:m, t12noi:t12noi, t12ds:t12ds, bal:bal, dscr:dscr, dy:dy, lev:lev,
                inPeriod:inPeriod, state:state, history:have });
  }
  var inP = rows.filter(function(r){ return r.inPeriod; });
  var minD = inP.length ? Math.min.apply(null, inP.map(function(r){ return isFinite(r.dscr)?r.dscr:Infinity; })) : NaN;
  var minY = inP.length ? Math.min.apply(null, inP.map(function(r){ return isFinite(r.dy)?r.dy:Infinity; })) : NaN;
  var maxL = rows.length ? Math.max.apply(null, rows.map(function(r){ return isFinite(r.lev)?r.lev:0; })) : NaN;
  return { rows:rows, tested:tested, watch:watch, minDSCR:minD, minDY:minY, maxLev:maxL,
           covDSCR:covDSCR, covDY:covDY, covLev:covLev, stabMo:stabMo, saleMo:saleMo,
           status: !tested ? 'NOT TESTED' : (watch ? 'WATCH - '+watch+' month(s) below' : 'PASS') };
};

extend('Covenant Monitor','w3cT12', function(o){
  var t = bkCovenantMonthlyT12();
  if(!t){ return; }
  var head = '<tr><th class="rowlabel-h">Mo</th><th>T-12 NOI</th><th>T-12 Debt Service</th><th>DSCR</th>'
           + '<th>Debt Balance</th><th>Debt Yield</th><th>Leverage</th><th>Status</th></tr>';
  var body = t.rows.map(function(r){
    var cls = r.state==='WATCH' ? 'warn' : r.state==='PASS' ? 'pass' : '';
    return '<tr'+(r.inPeriod?'':' style="opacity:.55"')+'>'+lbl(String(r.m))
      + val(money(r.t12noi)) + val(money(r.t12ds))
      + val(isFinite(r.dscr)?mult(r.dscr):'-')
      + val(money(r.bal))
      + val(isFinite(r.dy)?pct(r.dy):'-')
      + val(isFinite(r.lev)?pct(r.lev):'-')
      + '<td class="v">'+chip(cls, r.state)+'</td></tr>';
  }).join('');

  var summary = wrapTable('Monthly Covenant Period Summary - trailing-twelve basis',
    '<tr><th class="rowlabel-h">Metric</th><th>Value</th><th style="text-align:left">Basis</th></tr>',
      '<tr>'+lbl('Minimum DSCR Observed')+val(isFinite(t.minDSCR)?mult(t.minDSCR):'-')
        + txt('Covenant '+(t.covDSCR?mult(t.covDSCR):'not set')+', tested only inside the covenant period')+'</tr>'
    + '<tr>'+lbl('Minimum Debt Yield Observed')+val(isFinite(t.minDY)?pct(t.minDY):'-')
        + txt('Covenant '+(t.covDY?pct(t.covDY):'not set'))+'</tr>'
    + '<tr>'+lbl('Maximum Leverage Observed')+val(isFinite(t.maxLev)?pct(t.maxLev):'-')
        + txt('Debt balance &divide; acquisition basis')+'</tr>'
    + '<tr>'+lbl('Months Inside the Covenant Period')+val(intf(t.tested))
        + txt('Stabilised, twelve months of history, before sale, debt outstanding')+'</tr>'
    + '<tr>'+lbl('Months on Watch')+val(intf(t.watch))+txt('Below a set covenant')+'</tr>'
    + '<tr class="grandtotal">'+lbl('OVERALL MONTHLY COVENANT STATUS')
        + '<td class="v">'+chip(t.watch?'warn':(t.tested?'pass':''), t.status)+'</td>'
        + txt('Stabilisation at month '+intf(t.stabMo)+'; sale at month '+intf(t.saleMo))+'</tr>');

  o.main = (o.main||'') + summary
    + wrapTable('Monthly Covenant Test - trailing twelve months, all '+t.rows.length+' periods', head, body)
    + note('&#9432;','<b>Two covenant tests are shown, deliberately.</b> The annual test above is the one this application has always '
      + 'run; this is the workbook&rsquo;s monthly trailing-twelve test with its four states. They answer slightly different questions and '
      + 'can disagree - PRE-STAB and RAMP months are excluded here precisely so a lease-up period is not reported as a breach. '
      + 'Neither has been removed, so you can see both and decide which governs. '
      + '<b>One thing to know about the DSCR line:</b> the DSCR you enter sizes the loan as well as testing it, so at close the test is '
      + 'satisfied by construction - raising the covenant shrinks the loan rather than producing a breach. The debt-yield covenant is '
      + 'a genuinely independent ongoing test, which is why a breach normally shows up there first.');
});

/* =====================================================================
   B. REAL-ESTATE-TAX REASSESSMENT ESTIMATOR - display only
   ===================================================================== */
extend('Operating Underwrite','w3cTaxReassess', function(o){
  var s = bkLoad(), c;
  try { c = bkCalc(); } catch(e){ return; }
  var ar = Number(s.assessmentRatio)||0, mill = Number(s.millageRate)||0;
  var exitCap = Number(s.exitCap)||0;
  var enteredTax = Number(s.taxes)||0;
  var noiBeforeTax = (Number(c.noi)||0) + enteredTax;
  var denom = exitCap + ar*mill;
  var assessed = (ar>0 && mill>0 && denom>0) ? noiBeforeTax/denom : NaN;
  var adValorem = isFinite(assessed) ? assessed*ar*mill : NaN;

  var body = ''
    + '<tr>'+lbl('Assessment Ratio')
      + '<td class="v"><input type="number" step="0.01" style="width:110px" value="'+(ar*100).toFixed(2)+'"'
      + ' onchange="bkSetAssessmentRatio(this.value)"></td>'
      + txt('% of value assessed (0 = off)')
      + '<td class="v">'+chip('','INPUT')+'</td></tr>'
    + '<tr>'+lbl('Effective Millage Rate')
      + '<td class="v"><input type="number" step="0.01" style="width:110px" value="'+(mill*100).toFixed(2)+'"'
      + ' onchange="bkSetMillageRate(this.value)"></td>'
      + txt('% applied to assessed value')+'<td class="v">'+chip('','INPUT')+'</td></tr>'
    + '<tr>'+lbl('NOI Before Real Estate Taxes')+val(money(noiBeforeTax))+txt('Year 1 NOI with the entered tax added back')+'<td></td></tr>'
    + '<tr>'+lbl('Implied Assessed Value')+val(isFinite(assessed)?money(assessed):'-')
      + txt(isFinite(assessed)?('NOI before taxes &divide; (exit cap '+pct(exitCap)+' + ratio &times; millage)'):'Set a ratio and a millage rate')
      + '<td></td></tr>'
    + '<tr>'+lbl('Ad Valorem Tax - estimated')+val(isFinite(adValorem)?money(adValorem):'-')
      + txt('Assessed value &times; ratio &times; millage')+'<td></td></tr>'
    + '<tr class="grandtotal">'+lbl('Real Estate Taxes Used by the Engine')+val(money(enteredTax))
      + txt('Entered figure; never overwritten')
      + '<td class="v">'+chip('pass','ENTERED')+'</td></tr>'
    + '<tr>'+lbl('Estimate versus Entered')+val(isFinite(adValorem)?money(adValorem-enteredTax):'-')
      + txt(isFinite(adValorem)?(Math.abs(adValorem-enteredTax) > Math.max(1000, enteredTax*0.1)
            ? 'Material difference - worth checking the reassessment risk' : 'In line with the entered figure'):'')
      + '<td class="v">'+(isFinite(adValorem)
          ? (Math.abs(adValorem-enteredTax) > Math.max(1000, enteredTax*0.1) ? chip('warn','REVIEW') : chip('pass','IN LINE'))
          : chip('','NOT APPLIED'))+'</td></tr>';

  o.main = (o.main||'') + wrapTable('Post-Acquisition Tax Reassessment Estimator',
      '<tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Basis</th><th>Status</th></tr>', body)
    + note('&#9888;','<b>This is an estimator, not an input to the engine.</b> It reproduces the workbook&rsquo;s reassessment calculation so '
      + 'you can see what a post-sale reassessment might imply, but the engine keeps using the tax figure you entered - exactly as the '
      + 'workbook&rsquo;s own output cell falls back to the entered value. Nothing here silently changes NOI.');
});
window.bkSetAssessmentRatio = function(v){ var n=Number(v); setField('assessmentRatio', isFinite(n)&&n>0?n/100:0); };
window.bkSetMillageRate    = function(v){ var n=Number(v); setField('millageRate',    isFinite(n)&&n>0?n/100:0); };

/* V30: section C (legacy per-investor monthly allocation over s.investors) retired - superseded by the
   canonical investor ledger layer on Investor Schedules. */


/* =====================================================================
   D. HURDLE BASIS CONTROL - the equity-multiple branch, verified live
   ===================================================================== */
extend('Equity Waterfall','w3cHurdleBasis', function(o){
  var s = bkLoad();
  var basis = String(s.hurdleBasis||'1');
  o.main = (o.main||'') + wrapTable('Waterfall Structure Controls',
    '<tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr>',
      '<tr>'+lbl('Hurdle Basis')
      + '<td class="v"><select onchange="bkSetHurdleBasis(this.value)">'
      +   '<option value="1"'+(basis==='2'||basis==='3'?'':' selected')+'>IRR - compounding preferred return</option>'
      +   '<option value="2"'+(basis==='2'?' selected':'')+'>Equity Multiple</option>'
      +   '<option value="3"'+(basis==='3'?' selected':'')+'>IRR and Equity Multiple</option>'
      + '</select></td>'
      + txt('Which test each tier hurdle applies')+'<td class="v">'+chip('','INPUT')+'</td></tr>'
    + (basis==='3' ? '<tr>'+lbl('IRR and Multiple Combine')
      + '<td class="v"><select onchange="bkSetHurdleBoth(this.value)"><option value="all"'+(String(s.hurdleBoth)==='either'?'':' selected')+'>Both must be met</option><option value="either"'+(String(s.hurdleBoth)==='either'?' selected':'')+'>Either is enough</option></select></td>'
      + txt('A tier opens when the LP has reached the IRR AND the multiple (or either, if set)')+'<td class="v">'+chip('','INPUT')+'</td></tr>' : '')
    + '<tr>'+lbl('Tier 1 Preferred Return')+val(pct(Number(s.pref)))+txt('Tier 1 hurdle rate')+'<td class="v">'+chip('','LINKED')+'</td></tr>'
    + '<tr>'+lbl('Tier 2 Hurdle')+val(pct(Number(s.hurdle2)))+txt('Second hurdle')+'<td class="v">'+chip('','LINKED')+'</td></tr>'
    + '<tr>'+lbl('Tier 3 Hurdle')+val(pct(Number(s.hurdle3)))+txt('Third hurdle')+'<td class="v">'+chip('','LINKED')+'</td></tr>'
    + '<tr>'+lbl('GP Catch-Up')+val(Number(s.gpCatchup)?'On':'Off')
      + txt(Number(s.gpCatchup)?('Target '+pct(Number(s.gpCatchupTarget))+' of cumulative profit'):'No catch-up tier')
      + '<td class="v">'+chip('','LINKED')+'</td></tr>')
    + note('&#9432;','<b>The equity-multiple branch exists in the canonical waterfall engine and was verified to change the tier balances</b> '
      + '- it simply had no control. Switching the basis re-runs the same engine; it does not select a different one. '
      + 'Under the equity-multiple basis the tier hurdles are applied as multiples rather than as compounding annual rates.');
});
window.bkSetHurdleBasis = function(v){ setField('hurdleBasis', String(v)==='2' ? '2' : String(v)==='3' ? '3' : '1'); };
window.bkSetHurdleBoth = function(v){ setField('hurdleBoth', String(v)==='either' ? 'either' : 'all'); };

/* =====================================================================
   E. SCENARIO DRIVER CONTROLS - all nine, on Sensitivity
   ===================================================================== */
extend('Sensitivity','w3cDrivers', function(o){
  var s = bkLoad();
  var DRIVERS = [
    ['Market Rent Growth',      'RentGrowthDelta',      'pct', 'Added to the rent growth rate'],
    ['Exit Cap Rate',           'ExitCapDelta',         'pct', 'Added to the exit cap'],
    ['Debt Coupon',             'DebtRateDelta',        'pct', 'Added to the acquisition rate or the floating index'],
    ['Vacancy',                 'VacancyDelta',         'pct', 'Added to residential and commercial vacancy'],
    ['Operating Expense Level', 'OpexVariance',         'pct', 'Scales every entered expense line'],
    ['Hard Cost',               'HardCostVariance',     'pct', 'Added to the hard cost contingency'],
    ['Soft Cost',               'SoftCostVariance',     'pct', 'Added to the soft cost contingency'],
    ['Construction Duration',   'ConstructionMoDelta',  'mo',  'Added to the construction period'],
    ['Absorption',              'AbsorptionFactor',     'pct', 'Scales the lease-up period']
  ];
  var body = DRIVERS.map(function(d){
    var upK = 'up'+d[1], dnK = 'down'+d[1];
    var up = Number(s[upK])||0, dn = Number(s[dnK])||0;
    var fmt = function(v){ return d[2]==='pct' ? (v*100).toFixed(2) : String(v); };
    return '<tr>'+lbl(d[0])
      + '<td class="v"><input type="number" step="0.01" style="width:96px" value="'+fmt(dn)+'"'
      +   ' onchange="bkSetScenarioDriver(\''+dnK+'\',this.value,\''+d[2]+'\')"></td>'
      + '<td class="v">-</td>'
      + '<td class="v"><input type="number" step="0.01" style="width:96px" value="'+fmt(up)+'"'
      +   ' onchange="bkSetScenarioDriver(\''+upK+'\',this.value,\''+d[2]+'\')"></td>'
      + txt(d[3] + (d[2]==='pct' ? ' (%)' : ' (months)'))
      + '<td class="v">'+((up||dn)?chip('pass','ACTIVE'):chip('','INERT'))+'</td></tr>';
  }).join('');
  o.main = (o.main||'') + wrapTable('Scenario Drivers - Downside and Upside deltas against Base',
      '<tr><th class="rowlabel-h">Driver</th><th>Downside</th><th>Base</th><th>Upside</th>'
      + '<th style="text-align:left">Effect</th><th>Status</th></tr>', body)
    + note('&#9432;','All nine workbook drivers are now present. The three that existed are unchanged; the six added default to zero, so '
      + 'Base and both existing cases produce exactly the figures they did before until you set one. A driver reading INERT is not a '
      + 'broken control - it is a delta of zero.');
});
window.bkSetScenarioDriver = function(key, v, kind){
  var n = Number(v);
  setField(key, isFinite(n) ? (kind==='pct' ? n/100 : n) : 0);
};

/* =====================================================================
   F. PER-CATEGORY DRAW CURVE CONTROLS + CURVE SUM CONTROL
   ===================================================================== */
extend('Dev Draws','w3cCurveControls', function(o){
  var s = bkLoad();
  if(String(s.dealType||'').toLowerCase() !== 'development') return;
  var x; try { x = (typeof bkDevFundingV10==='function') ? bkDevFundingV10() : null; } catch(e){}
  if(!x || !x.isDev) return;

  function sel(key, cur){
    return '<td class="v"><select onchange="bkSetCurveField(\''+key+'\',this.value)">'
      + ['S-Curve','Straight-Line'].map(function(m){
          return '<option'+(String(cur)===m?' selected':'')+'>'+m+'</option>'; }).join('')
      + '</select></td>';
  }
  function steep(key, cur){
    return '<td class="v"><input type="number" step="1" min="1" max="20" style="width:86px" value="'+(Number(cur)||1)
      + '" onchange="bkSetCurveField(\''+key+'\',this.value,1)"></td>';
  }
  var rows = ''
    + '<tr>'+lbl('Hard Costs')+sel('hardCurveMethod', s.hardCurveMethod)+steep('hardCurveSteepness', s.hardCurveSteepness)
      + txt('Spread across the construction period')+'</tr>'
    + '<tr>'+lbl('Soft Costs - Pre-Development')+sel('softPreMethod', s.softPreMethod)+'<td class="v">-</td>'
      + txt('28% of soft costs, across the pre-development period')+'</tr>'
    + '<tr>'+lbl('Soft Costs - Construction')+sel('softConMethod', s.softConMethod)+steep('softConSteepness', s.softConSteepness)
      + txt('62% of soft costs, across construction')+'</tr>'
    + '<tr>'+lbl('Soft Costs - Lease-Up')+sel('softLeaseMethod', s.softLeaseMethod)+'<td class="v">-</td>'
      + txt('10% of soft costs, across lease-up')+'</tr>'
    + '<tr>'+lbl('Lease-Up Operating Deficit')+'<td class="v">Straight-Line</td><td class="v">-</td>'
      + txt('Fixed straight-line across lease-up in this engine')+'</tr>';

  // curve-sum control: each category's monthly shares must sum to its total
  var m = x.months || [];
  var sums = m.reduce(function(a,z){ a.hard+=Number(z.hard)||0; a.soft+=Number(z.soft)||0; a.lease+=Number(z.lease)||0; return a; },
                      {hard:0,soft:0,lease:0});
  function ctl(label, drawn, target){
    var d = drawn-target, ok = Math.abs(d) < Math.max(1, Math.abs(target)*1e-9);
    return '<tr>'+lbl(label)+val(money(drawn))+val(money(target))+val(money(d))
      + '<td class="v">'+chip(ok?'pass':'fail', ok?'100% DRAWN':'VARIANCE')+'</td></tr>';
  }
  var control = wrapTable('Draw Curve Control - every curve must draw its category in full',
    '<tr><th class="rowlabel-h">Category</th><th>Drawn Across the Curve</th><th>Category Total</th><th>Variance</th><th>Status</th></tr>',
      ctl('Hard Costs', sums.hard, Number(x.hard)||0)
    + ctl('Soft Costs', sums.soft, Number(x.soft)||0)
    + ctl('Lease-Up Operating Deficit', sums.lease, Number(x.leaseDef)||0));

  o.main = (o.main||'') + wrapTable('Draw Curve Settings by Cost Category',
      '<tr><th class="rowlabel-h">Category</th><th>Curve Shape</th><th>S-Curve Steepness</th>'
      + '<th style="text-align:left">Window</th></tr>', rows)
    + control;
});
window.bkSetCurveField = function(key, v, numeric){
  if(numeric){ var n = Number(v); setField(key, isFinite(n)&&n>0 ? Math.round(n) : 1); }
  else setField(key, String(v));
};

/* =====================================================================
   G. PER-PARTNER UNRETURNED CAPITAL - a reduction over the canonical rows
   ===================================================================== */
extend('Waterfall (M)','w3cCapitalAccounts', function(o){
  var w; try { w = bkWaterfallV07(); } catch(e){ return; }
  var rows = (w && w.rows) || [];
  if(!rows.length) return;
  var lpRun = 0, gpRun = 0;
  var body = rows.map(function(r){
    lpRun += Math.abs(Number(r.lpCon)||0) - (Number(r.lpDist)||0);
    gpRun += Math.abs(Number(r.gpCon)||0) - (Number(r.gpDist)||0);
    var live = (Number(r.con)||0) || (Number(r.dist)||0);
    return '<tr'+(live?'':' style="opacity:.55"')+'>'+lbl(String(r.m))
      + val(money0(Math.abs(Number(r.lpCon)||0))) + val(money0(r.lpDist)) + val(money(Math.max(0,lpRun)))
      + val(money0(Math.abs(Number(r.gpCon)||0))) + val(money0(r.gpDist)) + val(money(Math.max(0,gpRun)))
      + '</tr>';
  }).join('');
  o.main = (o.main||'') + wrapTable('Partner Capital Accounts - unreturned capital, month by month',
    '<tr><th class="rowlabel-h">Mo</th><th>LP Contribution</th><th>LP Distribution</th><th>LP Unreturned</th>'
    + '<th>GP Contribution</th><th>GP Distribution</th><th>GP Unreturned</th></tr>', body)
    + note('&#9432;','Unreturned capital is cumulative contributions less cumulative distributions, floored at zero, from the canonical '
      + 'waterfall&rsquo;s own monthly partner rows. It is a reporting memo on the same figures shown above, not a second allocation.');
});

})();
