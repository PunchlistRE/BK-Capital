
/* ===========================================================================
   V29.11.0 - DEPRECIATION RENDERER (canonical, state-driven)
   ===========================================================================
   Renders bkDepreciation() / bkDepreciationSchedule(). Contains no property
   identity, no purchase price and no cost-segregation figures of its own -
   every value on the page is read from the active deal. With no active deal
   this sheet is gated to the standard empty state like every other
   deal-reporting sheet.
   =========================================================================== */
(function(){
'use strict';

function esc(v){ return (typeof bkEsc==='function') ? bkEsc(v) : String(v==null?'':v); }
function money(n){
  var x = Number(n)||0, neg = x < 0, a = Math.abs(x);
  var body = a < 100 ? a.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
                     : a.toLocaleString('en-US',{maximumFractionDigits:0});
  return neg ? '($'+body+')' : '$'+body;
}
function money2(n){
  var x = Number(n)||0, neg = x < 0, a = Math.abs(x);
  var body = a.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  return neg ? '($'+body+')' : '$'+body;
}
function pct(n){ return ((Number(n)||0)*100).toFixed(2)+'%'; }
function chip(kind, text){
  var cls = {OK:'pass', TIE:'pass', INPUT:'', SOURCE:'', LINKED:'', CALC:'',
             REVIEW:'warn', BLOCKED:'fail', MISSING:'fail'}[kind];
  /* .status-chip::before already draws the dot - do not add one */
  return '<span class="status-chip '+(cls||'')+'">'+esc(text||kind)+'</span>';
}

function render(){
  var e = bkDepreciation();
  var st = e.settings;
  var s  = bkActiveDeal() || {};
  var sch = bkDepreciationSchedule();

  /* ---------------------------------------------------- assumptions */
  var propName = (typeof bkActiveDealLabel==='function') ? bkActiveDealLabel() : (s.name||'-');
  var loc = s.location || '';

  var landRow = st.landMethod === 'dollar'
    ? '<td class="v"><input class="dep-money" type="number" step="0.01" value="'+Number(st.landDollar||0).toFixed(2)+'" onchange="bkDeprSet(\'landDollar\',Number(this.value))"></td><td data-bk-align="text">Direct assessed / supported value</td><td>'+chip('INPUT','INPUT')+'</td>'
    : '<td class="v">'+money2(e.landValue)+'</td><td data-bk-align="text">Calculated from % of Purchase Price</td><td>'+chip('CALC','CALC')+'</td>';
  var landPctRow = st.landMethod === 'percent'
    ? '<td class="v"><input class="dep-input" type="number" step="0.01" value="'+(Number(st.landPct||0)*100).toFixed(2)+'" onchange="bkDeprSet(\'landPct\',Number(this.value)/100)"></td><td data-bk-align="text">% of Purchase Price</td><td>'+chip('INPUT','INPUT')+'</td>'
    : '<td class="v">'+pct(e.landPct)+'</td><td data-bk-align="text">Calculated from $ land value</td><td>'+chip('CALC','CALC')+'</td>';

  var sel = function(key, opts, cur, xform){
    return '<select class="dep-input" onchange="bkDeprSet(\''+key+'\','+(xform||'this.value')+')">'
      + opts.map(function(o){
          var v = (o && typeof o === 'object') ? o.v : o;
          var l = (o && typeof o === 'object') ? o.l : o;
          return '<option value="'+esc(v)+'"'+(String(cur)===String(v)?' selected':'')+'>'+esc(l)+'</option>';
        }).join('') + '</select>';
  };

  var assumptions =
    '<div class="tbl-wrap"><table class="fin"><caption>Depreciation Assumptions</caption>'
    + '<thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Basis / Timing</th><th>Status</th></tr></thead><tbody>'
    + '<tr><td class="rowlabel">Property</td><td class="v" data-bk-align="text">'+esc(propName)+'</td><td data-bk-align="text">'+esc(loc)+'</td><td>'+chip('LINKED','LINKED')+'</td></tr>'
    + '<tr><td class="rowlabel">Acquisition / Closing Date</td><td class="v"><input type="date" value="'+esc(st.closeDate)+'" onchange="bkDeprSet(\'closeDate\',this.value)"></td><td data-bk-align="text">Actual closing</td><td>'+chip('INPUT','INPUT')+'</td></tr>'
    + '<tr><td class="rowlabel">First Rent Receipt</td><td class="v"><input type="date" value="'+esc(st.firstRentDate)+'" onchange="bkDeprSet(\'firstRentDate\',this.value)"></td><td data-bk-align="text">First actual cash rent</td><td>'+chip('INPUT','INPUT')+'</td></tr>'
    + '<tr><td class="rowlabel">NNN Reimbursement Lag</td><td class="v">'+sel('nnnLag',[{v:0,l:'0 Months'},{v:1,l:'1 Month'},{v:2,l:'2 Months'},{v:3,l:'3 Months'}],st.nnnLag,'Number(this.value)')+'</td><td data-bk-align="text">Recoverable expenses billed in arrears</td><td>'+chip('INPUT','INPUT')+'</td></tr>'
    + '<tr><td class="rowlabel">Purchase Price</td><td class="v">'+money2(e.purchasePrice)+'</td><td data-bk-align="text">Linked from acquisition</td><td>'+chip('LINKED','LINKED')+'</td></tr>'
    + '<tr><td class="rowlabel">Capital Improvements</td><td class="v"><input class="dep-money" type="number" step="0.01" value="'+Number(st.capex||0).toFixed(2)+'" onchange="bkDeprSet(\'capex\',Number(this.value))"></td><td data-bk-align="text">Qualifying additions to basis</td><td>'+chip('INPUT','INPUT')+'</td></tr>'
    + '<tr><td class="rowlabel">Land Value Method</td><td class="v">'+sel('landMethod',[{v:'percent',l:'% of Purchase Price'},{v:'dollar',l:'$ Assessed / Supported'}],st.landMethod)+'</td><td data-bk-align="text">Chooses which side is authoritative</td><td>'+chip('INPUT','INPUT')+'</td></tr>'
    + '<tr><td class="rowlabel">Land Value</td>'+landRow+'</tr>'
    + '<tr><td class="rowlabel">Land Value %</td>'+landPctRow+'</tr>'
    + '<tr><td class="rowlabel">Land Value Source</td><td class="v">'+sel('landSource',['Cost Seg Study','Tax Assessment','Appraisal','Purchase Allocation','Underwriting Assumption','Other'],st.landSource)+'</td><td data-bk-align="text">Support for the land allocation</td><td>'+chip('INPUT','INPUT')+'</td></tr>'
    + '<tr class="grandtotal"><td class="rowlabel">Depreciable Basis</td><td class="v">'+money2(e.depreciableBasis)+'</td><td data-bk-align="text">Purchase Price &minus; Land + Capital Improvements</td><td>'+chip('CALC','CALC')+'</td></tr>'
    + '<tr><td class="rowlabel">Cost Segregation</td><td class="v">'+sel('costSeg',[{v:'1',l:'Yes'},{v:'0',l:'No'}],st.costSeg?'1':'0','this.value===\'1\'')+'</td><td data-bk-align="text">Study-based allocation available</td><td>'+chip('INPUT','INPUT')+'</td></tr>'
    + (st.costSeg
        ? '<tr><td class="rowlabel">Component Detail Mode</td><td class="v">'+sel('detailMode',[{v:'detailed',l:'Detailed Cost Seg'},{v:'buckets',l:'Recovery Buckets'}],st.detailMode)+'</td><td data-bk-align="text">'+(e.detailMode==='detailed'?'Actual component rows':'Underwriting allocation by class')+'</td><td>'+chip('INPUT','INPUT')+'</td></tr>'
        : '')
    + '<tr><td class="rowlabel">Base Recovery Period</td><td class="v">'+sel('baseLife',[{v:27.5,l:'27.5 Year (Residential)'},{v:39,l:'39 Year (Commercial)'}],st.baseLife,'Number(this.value)')+'</td><td data-bk-align="text">Base building / residual class</td><td>'+chip('INPUT','INPUT')+'</td></tr>'
    + '<tr><td class="rowlabel">Bonus Depreciation</td><td class="v">'+sel('bonusPct',[{v:0,l:'0%'},{v:0.2,l:'20%'},{v:0.4,l:'40%'},{v:0.6,l:'60%'},{v:0.8,l:'80%'},{v:1,l:'100%'}],st.bonusPct,'Number(this.value)')+'</td><td data-bk-align="text">Applied to eligible short-life property only</td><td>'+chip('INPUT','INPUT')+'</td></tr>'
    + '<tr><td class="rowlabel">Bonus Applied Tax Year</td><td class="v">'+sel('bonusYear',[{v:'',l:'Not elected'}].concat([2024,2025,2026,2027,2028,2029,2030].map(function(y){return {v:y,l:String(y)};})),st.bonusYear===null?'':st.bonusYear,'(this.value===\'\'?null:Number(this.value))')+'</td><td data-bk-align="text">Year the bonus deduction is taken</td><td>'+chip('INPUT','INPUT')+'</td></tr>'
    + '</tbody></table></div>';

  /* ---------------------------------------------------- validation */
  var errBlock = e.errors.length
    ? '<div class="note-flag" style="margin-top:14px;"><span>&#9888;</span><div><b>Validation failed - depreciation is BLOCKED.</b><ul style="margin:6px 0 0 16px;">'
      + e.errors.map(function(x){ return '<li>'+esc(x.msg)+'</li>'; }).join('')
      + '</ul>Nothing is calculated from invalid inputs.</div></div>'
    : '';

  /* ---------------------------------------------------- components / buckets */
  var detail = e.detailMode === 'detailed' && st.costSeg;
  var body;
  if(!st.costSeg){
    body = '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Allocation Without Cost Segregation</caption>'
      + '<thead><tr><th class="rowlabel-h">Recovery Period</th><th>Basis</th><th style="text-align:left">Treatment</th></tr></thead><tbody>'
      + '<tr><td class="rowlabel">'+e.baseLife+' Year '+(Number(e.baseLife)===27.5?'(Residential)':'(Commercial)')+'</td>'
      + '<td class="v">'+money2(e.depreciableBasis)+'</td>'
      + '<td data-bk-align="text">Entire depreciable basis to the base building class</td></tr>'
      + '</tbody></table></div>'
      + '<div class="note-flag" style="margin-top:12px;"><span>&#9432;</span><div>Cost Segregation is set to <b>No</b>, so no short-life allocation is required and the full depreciable basis flows to the '+e.baseLife+'-year class. Set Cost Segregation to <b>Yes</b> to enter component detail or underwriting buckets.</div></div>';
  } else if(detail){
    var rows = e.components.map(function(c, i){
      var life = Number(c.recovery);
      var bonusLocked = life > 20;
      return '<tr>'
        + '<td><input value="'+esc(c.component)+'" onchange="bkDeprCompSet('+i+',\'component\',this.value)"></td>'
        + '<td><input value="'+esc(c.description)+'" onchange="bkDeprCompSet('+i+',\'description\',this.value)"></td>'
        + '<td class="v"><input class="dep-money" type="number" step="0.01" value="'+Number(c.basis||0).toFixed(2)+'" onchange="bkDeprCompSet('+i+',\'basis\',this.value)"></td>'
        + '<td class="v"><select class="dep-input" onchange="bkDeprCompSet('+i+',\'recovery\',this.value)">'
        +   [5,7,15,27.5,39].map(function(v){ return '<option value="'+v+'"'+(life===v?' selected':'')+'>'+v+' Year</option>'; }).join('')
        + '</select></td>'
        + '<td><input value="'+esc(c.convention)+'" onchange="bkDeprCompSet('+i+',\'convention\',this.value)"></td>'
        + '<td><input value="'+esc(c.method)+'" onchange="bkDeprCompSet('+i+',\'method\',this.value)"></td>'
        + '<td class="v">'+(bonusLocked
            ? '<span class="dep-readonly" title="Real property over 20 years is never bonus-eligible">No</span>'
            : '<select class="dep-input" onchange="bkDeprCompSet('+i+',\'bonus\',this.value===\'1\')"><option value="1"'+(c.bonus?' selected':'')+'>Yes</option><option value="0"'+(!c.bonus?' selected':'')+'>No</option></select>')
        + '</td>'
        + '<td><input value="'+esc(c.source)+'" onchange="bkDeprCompSet('+i+',\'source\',this.value)"></td>'
        + '<td>'+chip(c.status==='SOURCE'?'SOURCE':(c.status==='BUCKET'?'CALC':'INPUT'), c.status||'INPUT')+'</td>'
        + '<td style="text-align:center"><button class="dep-del" onclick="bkDeprCompDel('+i+')">&times;</button></td>'
        + '</tr>';
    }).join('');
    body = '<div class="tbl-wrap" style="margin-top:16px"><table class="fin">'
      + '<caption>Depreciation Component Detail - Live, Feeds the Depreciation Engine</caption>'
      + '<thead><tr><th class="rowlabel-h">Component</th><th style="text-align:left">Description</th><th>Depreciable Basis</th>'
      + '<th>Recovery Period</th><th style="text-align:left">Convention</th><th style="text-align:left">Method</th>'
      + '<th>Bonus Eligible</th><th style="text-align:left">Source</th><th>Status</th><th></th></tr></thead>'
      + '<tbody>'+(rows || '<tr><td class="rowlabel" colspan="10">No component rows yet. Add one below, or switch Component Detail Mode to Recovery Buckets.</td></tr>')+'</tbody>'
      + '</table><div class="dep-addbar"><button class="dep-addbtn" onclick="bkDeprCompAdd()">&#9679; + ADD COMPONENT</button></div></div>';
  } else {
    var bucketRow = function(life, label){
      var v = e.buckets[life] || 0, isBase = Number(life) === Number(e.baseLife);
      return '<tr><td class="rowlabel">'+label+'</td>'
        + '<td class="v">'+(isBase
            ? '<span class="dep-readonly">'+money2(v)+'</span>'
            : '<input class="dep-money" type="number" step="0.01" value="'+Number(v).toFixed(2)+'" onchange="bkDeprBucketSet('+life+',Number(this.value))">')
        + '</td>'
        + '<td>'+pct(e.depreciableBasis ? v/e.depreciableBasis : 0)+'</td>'
        + '<td data-bk-align="text">'+(isBase?'Calculated residual':'Underwriting input')+'</td>'
        + '<td>'+chip(isBase?'CALC':'INPUT', isBase?'CALC':'INPUT')+'</td></tr>';
    };
    body = '<div class="tbl-wrap" style="margin-top:16px"><table class="fin">'
      + '<caption>Recovery Bucket Assumptions - Live, Feeds the Same Depreciation Engine</caption>'
      + '<thead><tr><th class="rowlabel-h">Recovery Period</th><th>Basis</th><th>Ratio to Basis</th><th style="text-align:left">Treatment</th><th>Status</th></tr></thead><tbody>'
      + bucketRow(5,'5 Year Recovery Period')
      + bucketRow(7,'7 Year Recovery Period (FF&amp;E)')
      + bucketRow(15,'15 Year Recovery Period')
      + bucketRow(27.5,'27.5 Year Recovery Period (Residential)')
      + bucketRow(39,'39 Year Recovery Period (Commercial)')
      + '</tbody></table></div>';
  }

  /* ---------------------------------------------------- allocation control */
  var alloc = '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Allocation Control</caption><tbody>'
    + '<tr><td class="rowlabel">Depreciable Basis</td><td class="v">'+money2(e.depreciableBasis)+'</td></tr>'
    + '<tr><td class="rowlabel">'+(detail?'Component Basis':'Allocated Basis')+'</td><td class="v">'+money2(e.allocated)+'</td></tr>'
    + '<tr><td class="rowlabel">Variance</td><td class="v">'+money2(e.variance)+'</td></tr>'
    + '<tr class="depr-control-row"><td class="rowlabel">Allocation Check</td><td class="v">'
    +   (e.tie ? chip('TIE','TIE') : chip('BLOCKED','OUT OF BALANCE '+money2(e.variance)))
    + '</td></tr></tbody></table></div>'
    + (!e.tie && detail
        ? '<div class="note-flag" style="margin-top:12px;"><span>&#9888;</span><div><b>Detailed cost-seg allocation does not tie to depreciable basis.</b> Nothing is plugged. Correct the component rows, or switch to Recovery Buckets where the base-building class carries an explicit calculated residual.</div></div>'
        : '');

  /* ---------------------------------------------------- bonus */
  var bonus = '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Bonus Depreciation</caption><tbody>'
    + '<tr><td class="rowlabel">Bonus-Eligible Basis</td><td class="v">'+money2(e.bonusEligibleBasis)+'</td><td data-bk-align="text">Short-life property only (recovery &le; 20 years)</td></tr>'
    + '<tr><td class="rowlabel">Bonus Percentage</td><td class="v">'+pct(e.bonusPct)+'</td><td data-bk-align="text">Elected</td></tr>'
    + '<tr><td class="rowlabel">Bonus Applied Tax Year</td><td class="v">'+(st.bonusYear===null||st.bonusYear===undefined?'Not elected':esc(st.bonusYear))+'</td><td data-bk-align="text">Deduction taken in this year</td></tr>'
    + '<tr class="depr-control-row"><td class="rowlabel">Bonus Deduction</td><td class="v">'+money2(e.bonusDeduction)+'</td><td data-bk-align="text">Eligible basis &times; bonus %</td></tr>'
    + '<tr><td class="rowlabel">Remaining Depreciable Basis</td><td class="v">'+money2(e.remainingAfterBonus)+'</td><td data-bk-align="text">Recovered over the remaining class lives</td></tr>'
    + '</tbody></table></div>';

  /* ---------------------------------------------------- schedule */
  var schedRows = sch.rows.map(function(r){
    return '<tr><td class="rowlabel">'+r.taxYear+'</td>'
      + '<td>'+money(r.beginBasis)+'</td><td>'+money(r.regular)+'</td><td>'+money(r.bonus)+'</td>'
      + '<td class="v">'+money(r.total)+'</td><td>'+money(r.accum)+'</td><td>'+money(r.remaining)+'</td></tr>';
  }).join('');
  var schedule = '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Annual Depreciation Schedule</caption>'
    + '<thead><tr><th class="rowlabel-h">Tax Year</th><th>Beginning Basis</th><th>Regular Depreciation</th>'
    + '<th>Bonus Depreciation</th><th>Total Depreciation</th><th>Accumulated</th><th>Remaining Tax Basis</th></tr></thead>'
    + '<tbody>'+schedRows+'</tbody></table></div>'
    + '<div class="note-flag" style="margin-top:12px;"><span>&#9432;</span><div>'
    + '<b>Simplified underwriting convention.</b> Each class recovers straight-line over its life, with the elected bonus taken in full in the elected year on eligible basis only. '
    + 'MACRS declining-balance tables and half-year / mid-quarter / mid-month conventions are <b>not</b> applied, so this is an underwriting projection rather than a tax-return schedule. '
    + 'The source study\'s own method and convention are preserved on each component row.'
    + '</div></div>';

  /* ---------------------------------------------------- actions */
  var actions = '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">'
    + '<button type="button" class="status-chip" onclick="bkDeprCompAdd()">&#9679; + ADD COMPONENT</button>'
    + '<button type="button" class="status-chip" onclick="if(confirm(\'Replace this deal\\u2019s depreciation assumptions with the Harvard cost-segregation study?\'))bkDeprSeedHarvard()">SEED HARVARD COST SEG STUDY</button>'
    + '<button type="button" class="status-chip" onclick="if(confirm(\'Clear all depreciation assumptions for this deal?\'))bkDeprClear()">CLEAR DEPRECIATION</button>'
    + '</div>';

  var side = (typeof sidebarShell === 'function')
    ? sidebarShell('<div class="card"><div class="card-head">Depreciation Summary</div><div class="metric-list">'
        + '<div class="metric-row"><span class="k">Purchase Price</span><span class="v">'+money(e.purchasePrice)+'</span></div>'
        + '<div class="metric-row"><span class="k">Land Value</span><span class="v">'+money(e.landValue)+'</span></div>'
        + '<div class="metric-row"><span class="k">Land %</span><span class="v">'+pct(e.landPct)+'</span></div>'
        + '<div class="metric-row"><span class="k">Depreciable Basis</span><span class="v">'+money(e.depreciableBasis)+'</span></div>'
        + '<div class="metric-row"><span class="k">Bonus Deduction</span><span class="v">'+money(e.bonusDeduction)+'</span></div>'
        + '<div class="metric-row"><span class="k">Allocation</span><span class="v">'+(e.tie?chip('TIE','TIE'):chip('BLOCKED','OUT'))+'</span></div>'
        + '</div></div>' + (typeof colorKeyCard==='function'?colorKeyCard():''))
    : '';

  return {
    title:'Depreciation', crumbs:'Inputs',
    desc:'Land allocation, cost segregation, component detail, recovery buckets, bonus depreciation and the annual schedule.',
    meta:{ Property: propName, 'Depreciable Basis': money(e.depreciableBasis),
           Mode: !st.costSeg ? 'No Cost Seg' : (detail?'Detailed Cost Seg':'Recovery Buckets'),
           Status: e.errors.length ? 'BLOCKED' : (e.tie?'TIE':'OUT OF BALANCE') },
    main: assumptions + errBlock + body + alloc + bonus + schedule + actions,
    sidebar: side
  };
}

if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Depreciation', render);
else if(typeof RENDERERS !== 'undefined') RENDERERS['Depreciation'] = render;

/* Depreciation reports the ACTIVE DEAL, so it is gated exactly like every other
   deal-reporting sheet: with no deal it shows the standard empty state rather
   than a form full of zeros that looks like underwriting. */
(function gate(){
  if(typeof RENDERERS === 'undefined' || typeof window.bkEmptyState !== 'function') return;
  var orig = RENDERERS['Depreciation'];
  if(typeof orig !== 'function' || orig.__bkBlankSlate) return;
  var gated = function(){
    if(!window.bkHasActiveDeal()) return window.bkEmptyState('Depreciation');
    return orig.apply(this, arguments);
  };
  gated.__bkBlankSlate = true; gated.__bkOriginal = orig;
  RENDERERS['Depreciation'] = gated;
})();

})();
