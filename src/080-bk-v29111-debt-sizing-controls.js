
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
/* ONE definition of the NOI behind every debt test (owner's decision, November 2026). The loan sizing (src/047, dscrNoi) uses the deal's lender basis: NOI before capital
   reserves unless "Lender tests use" is set to after reserves. Every coverage ratio and debt yield the app, the guide, the reports and the investor PDF show reads it here, so no
   page can show a DSCR on a different NOI. The engine's rows come in two shapes: an annual row carries noi (before reserves) and after; a monthly row carries noiBeforeReserves and
   noi (after reserves). The exit has its own setting (exitNoiBasis, forward 12-month NOI, after reserves unless set to before) and its own label here. */
window.bkLenderNoiBasis = function(s){ s = s || bkLoad(); return s.lenderNoiBasis === 'after' ? 'after' : 'before'; };
window.bkLenderNoi = function(row, s){ if(!row) return 0; var after = window.bkLenderNoiBasis(s) === 'after', monthly = Object.prototype.hasOwnProperty.call(row, 'noiBeforeReserves');
  var before = monthly ? row.noiBeforeReserves : row.noi, aft = monthly ? row.noi : (row.after != null ? row.after : row.noiAfter); return Number(after ? aft : before) || 0; };
window.bkNoiBasisLabel = function(kind, s, short){ s = s || bkLoad(); var b = kind === 'exit' ? (s.exitNoiBasis === 'before' ? 'before' : 'after') : window.bkLenderNoiBasis(s); return 'NOI ' + b + (short ? ' reserves' : ' capital reserves'); };   /* short: for a narrow print column */
/* TWO DSCRs, and the platform never prints a bare "DSCR" (owner's decision, November 2026). They answer different questions and are not interchangeable:
     House DSCR   the firm's own credit-policy tests (Credit Policy, the credit gate, Debt Capacity's credit box and ladder): NOI after capital reserves, as the certified
                  Capital Markets model (audit/credit_ref.py). It does not move when a lender uses a different NOI.
     Lender DSCR  the loan's coverage as its lender tests it (the loan sizing, the covenants, the pro forma, the investor PDF): the deal's lender NOI (lenderNoiBasis, above).
   A lender test that divides its own fixed NOI (the permanent loan's forward 12 months, a refinance tool) passes that NOI as basis, so its label says what it divides.
   bkDscrName gives the full name, bkDscrShort the two words for a narrow column whose caption or note gives the basis. */
window.bkDscrBasis = function(kind, s, basis){ return kind === 'house' ? 'NOI after reserves' : (basis || 'lender NOI, ' + window.bkLenderNoiBasis(s) + ' reserves'); };
window.bkDscrShort = function(kind){ return kind === 'house' ? 'House DSCR' : 'Lender DSCR'; };
window.bkDscrName = function(kind, s, basis){ return window.bkDscrShort(kind) + ' (' + window.bkDscrBasis(kind, s, basis) + ')'; };
/* the sizing engines keep 'DSCR' as the binding test's key (the deal book and the independent models compare on it); a page shows it as the lender DSCR it is */
window.bkBindingName = function(b){ return /^dscr$/i.test(String(b == null ? '' : b)) ? 'Lender DSCR' : b; };
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
    + '<tr class="input"><td class="rowlabel" data-bk-align="text">Debt<span class="bk-sub">Global levered / unlevered switch</span></td>'
    +   '<td class="v"><select onchange="bkSetDebtEnabled(this.value)">'
    +     '<option value="true"'  + (off?'':' selected') + '>On</option>'
    +     '<option value="false"' + (off?' selected':'') + '>Off - unlevered</option>'
    +   '</select></td>'
    +   '<td data-bk-align="text">-</td>'
    +   '<td>' + chip('', 'INPUT') + '</td></tr>'
    + '<tr class="input"><td class="rowlabel" data-bk-align="text">Minimum Debt Yield - Origination<span class="bk-sub">Blank or 0 disables this constraint</span></td>'
    +   '<td class="v"><input type="number" step="0.01" style="width:118px"'
    +     ' value="' + (Number(s.acqDebtYield)>0 ? (Number(s.acqDebtYield)*100).toFixed(2) : '') + '"'
    +     ' placeholder="off"'
    +     ' onchange="bkSetAcqDebtYield(this.value)"></td>'
    +   '<td data-bk-align="text">%</td>'
    +   '<td>' + (Number(s.acqDebtYield)>0 ? chip('','INPUT') : chip('','NOT APPLIED')) + '</td></tr>'
    + '<tr class="input"><td class="rowlabel" data-bk-align="text">Lender Tests Use<span class="bk-sub">NOI before or after replacement reserves (lender DSCR, and LTV on value)</span></td>'
    +   '<td class="v"><select onchange="bkSetLenderNoiBasis(this.value)">'
    +     '<option value=""'  + (s.lenderNoiBasis === 'after' ? '' : ' selected') + '>Before reserves</option>'
    +     '<option value="after"' + (s.lenderNoiBasis === 'after' ? ' selected' : '') + '>After reserves</option>'
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
    ['Lender Minimum DSCR',  d.byDSCR,       'acqDSCR '  + (Number(s.acqDSCR)||0).toFixed(2)+'x', 'DSCR'],
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
    +   '<td>' + (off ? chip('fail','DEBT OFF') : chip('pass', bkBindingName(d.binding))) + '</td></tr>'
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
    + '<tr><td class="rowlabel" data-bk-align="text">Closing equity</td><td class="v">'+money((Number(d.equity)||0)+(Number((d.s||{}).rateCapCost)||0))+'</td></tr>'
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
          Binding: bkBindingName(d.binding)
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
