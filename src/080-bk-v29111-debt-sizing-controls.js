
/* ===========================================================================
   V29.11.1 - DEBT SIZING CONTROLS + BINDING CONSTRAINT DISPLAY
   ===========================================================================
   The engine already carries acqDebtYield and debtEnabled and already returns
   byLTV / byLTC / byDSCR / byDebtYield / binding. This layer is the remaining
   half: the controls and the constraint panel. Nothing here calculates.

   TYPED SETTERS, NOT bkSetField. bkSetField stores the raw value, so a <select>
   would persist the STRING 'false'. debtEnabled is tested with `s.debtEnabled
   === false`, and 'false' !== false - the control would look wired and do
   nothing. That is exactly the placebo control section BN forbids, so these
   two fields get setters that coerce to the type the engine actually reads.

   FINANCIAL LOGIC CHANGES: NONE.
   =========================================================================== */
(function(){
'use strict';

/* ---------------------------------------------------------------- setters */
window.bkSetDebtEnabled = function(v){
  var on = (v === true || v === 'true' || v === 1 || v === '1');
  var s = bkLoad(); s.debtEnabled = on; bkSave(s);
  if(typeof showSheet === 'function') showSheet(typeof currentSheet !== 'undefined' ? currentSheet : 'Debt');
};
/* Entered as a percentage, stored as a decimal, consistent with acqLTV/acqDSCR. */
window.bkSetLenderNoiBasis = function(v){
  var s = bkLoad(); s.lenderNoiBasis = (v === 'after') ? 'after' : ''; bkSave(s);
  if(typeof showSheet === 'function') showSheet(typeof currentSheet !== 'undefined' ? currentSheet : 'Debt');
};
window.bkSetAcqDebtYield = function(pctText){
  var n = Number(pctText);
  var s = bkLoad(); s.acqDebtYield = (isFinite(n) && n > 0) ? n/100 : 0; bkSave(s);
  if(typeof showSheet === 'function') showSheet(typeof currentSheet !== 'undefined' ? currentSheet : 'Debt');
};

/* ---------------------------------------------------------------- render */
function esc(v){ return (typeof bkEsc==='function') ? bkEsc(v) : String(v==null?'':v); }
function money(n){
  if(!isFinite(n)) return 'No limit';
  var x=Number(n)||0, neg=x<0, a=Math.abs(x);
  var body = a<100 ? a.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
                   : a.toLocaleString('en-US',{maximumFractionDigits:0});
  return neg ? '($'+body+')' : '$'+body;
}
function pct(n){ return ((Number(n)||0)*100).toFixed(2)+'%'; }
function chip(cls,txt){ /* .status-chip::before already draws the dot - do not add one */
  return '<span class="status-chip '+(cls||'')+'">'+esc(txt)+'</span>'; }

function panel(){
  var d = bkDebt(), s = bkLoad();
  var off = d.debtEnabled === false;

  /* --- controls, using the house input pattern --- */
  var controls =
      '<div class="tbl-wrap" style="margin-top:16px"><table class="fin">'
    + '<caption>Acquisition Debt Sizing Controls</caption>'
    + '<thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr></thead><tbody>'
    + '<tr><td class="rowlabel" data-bk-align="text">Debt<span class="bk-sub">Global levered / unlevered switch</span></td>'
    +   '<td class="v"><select onchange="bkSetDebtEnabled(this.value)">'
    +     '<option value="true"'  + (off?'':' selected') + '>On</option>'
    +     '<option value="false"' + (off?' selected':'') + '>Off - unlevered</option>'
    +   '</select></td>'
    +   '<td data-bk-align="text">-</td>'
    +   '<td>' + chip('', 'INPUT') + '</td></tr>'
    + '<tr><td class="rowlabel" data-bk-align="text">Minimum Debt Yield - Origination<span class="bk-sub">Blank or 0 disables this constraint</span></td>'
    +   '<td class="v"><input type="number" step="0.01" style="width:118px"'
    +     ' value="' + (Number(s.acqDebtYield)>0 ? (Number(s.acqDebtYield)*100).toFixed(2) : '') + '"'
    +     ' placeholder="off"'
    +     ' onchange="bkSetAcqDebtYield(this.value)"></td>'
    +   '<td data-bk-align="text">%</td>'
    +   '<td>' + (Number(s.acqDebtYield)>0 ? chip('','INPUT') : chip('','NOT APPLIED')) + '</td></tr>'
    + '<tr><td class="rowlabel" data-bk-align="text">Lender Tests Use<span class="bk-sub">NOI before or after replacement reserves (DSCR, and LTV on value)</span></td>'
    +   '<td class="v"><select onchange="bkSetLenderNoiBasis(this.value)">'
    +     '<option value=""'  + (s.lenderNoiBasis === 'after' ? '' : ' selected') + '>NOI before reserves</option>'
    +     '<option value="after"' + (s.lenderNoiBasis === 'after' ? ' selected' : '') + '>NOI after reserves</option>'
    +   '</select></td>'
    +   '<td data-bk-align="text">-</td>'
    +   '<td>' + chip('', 'INPUT') + '</td></tr>'
    + '</tbody></table></div>'
    + '<div class="note-flag" style="margin-top:10px;"><span>&#9432;</span><div>'
    + 'This is the <b>origination</b> minimum debt yield, used to size the loan at close. It is a '
    + 'separate assumption from the <b>ongoing</b> Minimum Debt Yield Covenant on Covenant Monitor, '
    + 'which tests the loan year by year after closing. Changing one does not change the other.'
    + '</div></div>';

  /* --- constraint panel --- */
  var rows = [
    ['Maximum LTV',          d.byLTV,        'acqLTV '   + pct(s.acqLTV) + ' \u00d7 ' + window.bkLtvBasisLabel(s, true), 'LTV'],
    ['Maximum LTC',          d.byLTC,        'acqLTC '   + pct(s.acqLTC),        'LTC'],
    ['Minimum DSCR',         d.byDSCR,       'acqDSCR '  + (Number(s.acqDSCR)||0).toFixed(2)+'x', 'DSCR'],
    ['Minimum Debt Yield',   d.byDebtYield,  Number(s.acqDebtYield)>0 ? 'acqDebtYield '+pct(s.acqDebtYield) : 'not applied', 'DEBT YIELD']
  ];
  var body = rows.map(function(r){
    var isBinding = !off && d.binding === r[3];
    return '<tr' + (isBinding ? ' class="grandtotal"' : '') + '>'
      + '<td class="rowlabel" data-bk-align="text">' + r[0] + '</td>'
      + '<td class="v">' + money(r[1]) + '</td>'
      + '<td data-bk-align="text">' + esc(r[2]) + '</td>'
      + '<td>' + (isBinding ? chip('warn','BINDING') : (isFinite(r[1]) ? chip('','capacity') : chip('','n/a'))) + '</td>'
      + '</tr>';
  }).join('');

  var constraints =
      '<div class="tbl-wrap" style="margin-top:16px"><table class="fin">'
    + '<caption>Sizing Constraints - Which One Binds</caption>'
    + '<thead><tr><th class="rowlabel-h">Constraint</th><th>Maximum Loan</th>'
    + '<th style="text-align:left">Assumption</th><th>Test</th></tr></thead><tbody>'
    + body
    + '<tr class="grandtotal"><td class="rowlabel" data-bk-align="text">Sized Loan</td>'
    +   '<td class="v">' + money(d.loan) + '</td>'
    +   '<td data-bk-align="text">' + (off
          ? 'Debt is switched off'
          : 'Lowest capacity, rounded down to the nearest $1,000') + '</td>'
    +   '<td>' + (off ? chip('fail','DEBT OFF') : chip('pass', d.binding)) + '</td></tr>'
    + '</tbody></table></div>'
    + (off
        ? '<div class="note-flag" style="margin-top:10px;"><span>&#9888;</span><div>'
          + '<b>Debt is OFF.</b> The capacities above are shown for reference only - they cannot fund '
          + 'this deal. Loan, fee, debt service and balance are zero, equity equals the full acquisition '
          + 'basis (' + money(d.equity) + '), and refinance at maturity is suppressed so an unlevered deal '
          + 'cannot become levered part-way through the hold.'
          + '</div></div>'
        : '')
    + '<div class="tbl-wrap" style="margin-top:16px"><table class="fin">'
    + '<caption>Resulting Capital Structure</caption><tbody>'
    + '<tr><td class="rowlabel" data-bk-align="text">Loan Amount</td><td class="v">'+money(d.loan)+'</td></tr>'
    + '<tr><td class="rowlabel" data-bk-align="text">Origination Fee</td><td class="v">'+money(d.fee)+'</td></tr>'
    + '<tr><td class="rowlabel" data-bk-align="text">Equity Requirement</td><td class="v">'+money(d.equity)+'</td></tr>'
    + '<tr><td class="rowlabel" data-bk-align="text">Loan to Value</td><td class="v">'+pct(d.ltv)+'</td></tr>'
    + '<tr><td class="rowlabel" data-bk-align="text">Loan to Cost</td><td class="v">'+pct(d.ltc)+'</td></tr>'
    + '<tr><td class="rowlabel" data-bk-align="text">Debt Service Coverage</td><td class="v">'+(Number(d.dscr)||0).toFixed(2)+'x</td></tr>'
    + '<tr><td class="rowlabel" data-bk-align="text">Debt Yield at Close</td><td class="v">'
    +   (d.loan>0 ? pct(d.op.noi/d.loan) : 'n/a') + '</td></tr>'
    + '</tbody></table></div>';

  return controls + constraints;
}

/* One wrapper, registered through the canonical registry. */
if(typeof RENDERERS !== 'undefined' && typeof RENDERERS['Debt'] === 'function'){
  var prev = RENDERERS['Debt'];
  if(!prev.__bkDebtControls){
    var wrapped = function(){
      var o = prev.apply(this, arguments);
    // BLANK-SLATE GUARD: extension layers must never append calculations to a
    // canonical no-deal page. The base renderer is authoritative for empty state.
    try {
      if(typeof window.bkProductionCounts === 'function' && !window.bkProductionCounts().activeDeal) return o;
    } catch(_blankStateErr){}
    if(/no deal loaded|there is no active deal/i.test(String(o && o.main || ''))) return o;
      try { o.main = panel() + o.main; } catch(e){}
      try {
        var d = bkDebt();
        o.meta = Object.assign({}, o.meta, {
          Debt: d.debtEnabled === false ? 'Off' : 'On',
          Binding: d.binding
        });
      } catch(e){}
      return o;
    };
    wrapped.__bkDebtControls = true;
    wrapped.__bkOriginal = prev.__bkOriginal || prev;
    if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Debt', wrapped);
    else RENDERERS['Debt'] = wrapped;
  }
}

})();
