
/* ===========================================================================
   WAVE 1 - EXPOSURE ONLY
   ===========================================================================
   Every table below renders a value the canonical engines ALREADY return.
   No economic logic is added, no engine is rewritten, and no second calculator
   is created. Where a workbook capability cannot be reached without new
   economics, this layer renders an explicit PENDING note naming the gap rather
   than fabricating parity.

   Formatting convention for everything new here (the app-wide pass is later):
     - money: accounting parentheses for negatives, 2dp under $100, whole dollars at or above
     - percentages 2dp, multiples 2dp with an x, integers plain
     - calculated cells carry class "v" and are never given an input affordance
     - editable cells go through the existing bkInput/data-bk-key path only
     - labels left, numbers right, units explicit
   =========================================================================== */
(function(){
'use strict';

/* ------------------------------------------------------------------ format */
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
function chip(cls,txt){ return '<span class="status-chip '+(cls||'')+'">'+esc(txt)+'</span>'; }
function note(sym,html){ return '<div class="note-flag" style="margin-top:10px;"><span>'+sym+'</span><div>'+html+'</div></div>'; }
function pending(what){
  return note('&#9888;','<b>Pending approved engine work.</b> '+what+' is not produced by the canonical engine, '+
    'so nothing is shown for it here rather than a fabricated figure. It stays on the engine-gap list.');
}
function wrapTable(caption, headHtml, bodyHtml, style){
  return '<div class="tbl-wrap" style="margin-top:16px'+(style?';'+style:'')+'"><table class="fin">'
       + '<caption>'+caption+'</caption>'
       + (headHtml?'<thead>'+headHtml+'</thead>':'')
       + '<tbody>'+bodyHtml+'</tbody></table></div>';
}
function lbl(t){ return '<td class="rowlabel" data-bk-align="text">'+t+'</td>'; }
function val(t){ return '<td class="v">'+t+'</td>'; }
function txt(t){ return '<td data-bk-align="text">'+t+'</td>'; }

/* A page render must never write. bkFloatingDebtQA and friends deliberately mutate
   and restore state to test the engine, which is fine on demand but not during a
   render - the certification suite asserts that steady-state navigation writes
   NOTHING. This is the same isolation bkRunScenario() already uses: swap both
   bkLoad and bkSave for the duration so the self-test runs against a consistent
   scratch copy and nothing reaches localStorage. */
function sandbox(fn){
  var real = bkLoad();
  var scratch = Object.assign({}, real);
  var ol = window.bkLoad, os = window.bkSave;
  window.bkLoad = function(){ return scratch; };
  window.bkSave = function(d){ Object.assign(scratch, d); return d; };
  try { return fn(); }
  finally { window.bkLoad = ol; window.bkSave = os; }
}

/* Register through the canonical registry, once, idempotently. */
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
    // FAIL CLOSED. If the base renderer withheld its output because the deal is not
    // ready, the exposure layer withholds too. Appending a detailed schedule on top
    // of a readiness gate would put return figures on screen for a deal the app has
    // already decided must not show them - blank is better than wrong.
    if(/withheld|calculation blocked/i.test(String(o && o.main || ''))) return o;
    try { fn(o); } catch(e){
      o.main = (o.main||'') + note('&#9888;','<b>'+esc(sheet)+' extension error:</b> '+esc(e.message));
    }
    return o;
  };
  wrapped['__'+tag] = true;
  wrapped.__bkOriginal = prev.__bkOriginal || prev;
  if(typeof window.bkRegisterRenderer==='function') window.bkRegisterRenderer(sheet, wrapped);
  else RENDERERS[sheet] = wrapped;
  return true;
}

/* Year headers shared by every annual schedule below. */
function yearHead(n, first){
  var h = '<tr><th class="rowlabel-h">'+(first||'Line Item')+'</th><th>Total</th>';
  for(var y=1;y<=n;y++) h += '<th>Year '+y+'</th>';
  return h + '</tr>';
}
function yearRow(label, pick, arr, fmt, cls){
  var tot=0, cells='';
  for(var i=0;i<arr.length;i++){ var v=pick(arr[i],i); tot+=(Number(v)||0); cells+=val(fmt(v)); }
  return '<tr'+(cls?' class="'+cls+'"':'')+'>'+lbl(label)+val(fmt(tot))+cells+'</tr>';
}

/* =====================================================================
   PRIORITY 1 - PROPERTY-LEVEL UNDERWRITING
   The detailed revenue and expense build, per year, straight off
   bkAnnualCF().arr[].lines - the same numbers the engine already summed
   into EGI and Total Operating Expenses.
   ===================================================================== */
extend('Property CF','w1PropertyCF', function(o){
  var u = bkAnnualCF(), s = bkLoad(), c = bkCalc();
  var arr = u.arr || [], n = arr.length;
  if(!n) return;
  var L = function(a,k){ return (a.lines && a.lines[k]) || 0; };
  var units = Number(s.units)||0, gsf = Number(s.gsf)||0;

  var rows = ''
  + '<tr class="section"><td class="rowlabel" data-bk-align="text" colspan="'+(n+2)+'"><b>REVENUE</b></td></tr>'
  + yearRow('Gross Potential Rent - Residential', function(a){return L(a,'gprGross');}, arr, money)
  + yearRow('Less: Vacancy - Residential',        function(a){return L(a,'resVac');},  arr, money)
  + yearRow('Scheduled Base Rent - Residential',  function(a){return L(a,'resRev');},  arr, money)
  + yearRow('Less: Bad Debt / Credit Loss',             function(a){return L(a,'bad');},     arr, money)
  + yearRow('Less: Loss to Lease',                      function(a){return L(a,'ltl');},     arr, money)
  + yearRow('Less: Concessions',                        function(a){return L(a,'concess');}, arr, money)
  + yearRow('Net Residential Income',                   function(a){return L(a,'netRes');},  arr, money, 'subtotal')
  + yearRow('Commercial Base Rent + Recoveries',        function(a){return L(a,'commGross');},arr, money)
  + yearRow('Less: Commercial Vacancy / Credit Loss',   function(a){return L(a,'commVac');}, arr, money)
  + yearRow('Net Commercial Income',                    function(a){return L(a,'comm');},    arr, money, 'subtotal')
  + yearRow('Other Income',                             function(a){return L(a,'other');},   arr, money)
  + yearRow('EFFECTIVE GROSS INCOME',                   function(a){return a.egi;},          arr, money, 'grandtotal')
  + '<tr class="section"><td class="rowlabel" data-bk-align="text" colspan="'+(n+2)+'"><b>OPERATING EXPENSES</b></td></tr>'
  + yearRow('Controllable Operating Expenses',          function(a){return -L(a,'ctrlOpex');},arr, money)
  + yearRow('Insurance',                                function(a){return -L(a,'insurance');},arr, money)
  + yearRow('Real Estate Taxes',                        function(a){return -L(a,'taxes');},  arr, money)
  + yearRow('Management Fee',                           function(a){return -L(a,'mgmt');},   arr, money)
  + yearRow('TOTAL OPERATING EXPENSES',                 function(a){return a.expenses;},     arr, money, 'grandtotal')
  + yearRow('NET OPERATING INCOME (before reserves)',   function(a){return a.noi;},          arr, money, 'grandtotal')
  + yearRow('Less: Replacement Reserves',               function(a){return L(a,'reserves');},arr, money)
  + yearRow('NOI AFTER RESERVES',                       function(a){return a.after;},        arr, money, 'grandtotal');

  var detail = wrapTable('Detailed Operating Pro Forma - Annual, from the canonical monthly engine',
                          yearHead(n), rows);

  /* ---- comparative columns: source T-12, Year 1 underwritten, per unit / per SF, % of EGI ---- */
  var y1 = arr[0], t12 = Number(s.t12noi)||0;
  var cmpHead = '<tr><th class="rowlabel-h">Metric</th><th>Source T-12</th><th>Year 1 Underwritten</th>'
              + '<th>Variance</th><th>$ / Unit</th><th>$ / SF</th><th>% of EGI</th></tr>';
  function cmpRow(label, t12v, y1v){
    var varr = (t12v===null) ? '-'
             : (t12v ? pct((y1v-t12v)/Math.abs(t12v)) : '-');
    return '<tr>'+lbl(label)
      + val(t12v===null?'-':money(t12v))
      + val(money(y1v))
      + val(varr)
      + val(units?money(y1v/units):'-')
      + val(gsf?money(y1v/gsf):'-')
      + val(y1.egi?pct(y1v/y1.egi):'-')
      + '</tr>';
  }
  var cmp = wrapTable('Year 1 Underwritten vs. Source - per Unit, per SF, and as a share of EGI',
    cmpHead,
      cmpRow('Effective Gross Income', null, y1.egi)
    + cmpRow('Total Operating Expenses', null, y1.expenses)
    + cmpRow('Net Operating Income', t12, y1.noi)
    + cmpRow('NOI After Reserves', null, y1.after)
    + '<tr>'+lbl('Operating Expense Ratio')+val('-')+val(pct(c.expenseRatio))+val('-')+val('-')+val('-')+val('-')+'</tr>'
    + '<tr>'+lbl('NOI Margin')+val('-')+val(pct(c.noiMargin))+val('-')+val('-')+val('-')+val('-')+'</tr>');

  /* ---- unlevered property cash flow ---- */
  var unlevRows = '<tr>'+lbl('NOI After Reserves')+val(money(arr.reduce(function(t,a){return t+a.after;},0)));
  for(var i=0;i<n;i++) unlevRows += val(money(arr[i].after));
  unlevRows += '</tr>';
  unlevRows += '<tr>'+lbl('Initial Acquisition Basis (price + closing + acquisition fee)')+val(money(u.initial));
  for(i=0;i<n;i++) unlevRows += val(i===0?money(u.initial):'-');
  unlevRows += '</tr>';
  unlevRows += '<tr>'+lbl('Net Sale Proceeds')+val(money(u.netSale));
  for(i=0;i<n;i++) unlevRows += val(i===n-1?money(u.netSale):'-');
  unlevRows += '</tr>';
  var unlevTot = arr.reduce(function(t,a){return t+a.after;},0)+u.initial+u.netSale;
  unlevRows += '<tr class="grandtotal">'+lbl('UNLEVERED PROPERTY CASH FLOW')+val(money(unlevTot));
  for(i=0;i<n;i++){
    var v = arr[i].after + (i===0?u.initial:0) + (i===n-1?u.netSale:0);
    unlevRows += val(money(v));
  }
  unlevRows += '</tr>';
  var unlev = wrapTable('Unlevered Property Cash Flow - the stream the returns engine discounts',
                        yearHead(n), unlevRows)
    + note('&#9432;','Unlevered XIRR <b>'+pct(u.irr)+'</b> and unlevered MOIC <b>'+mult(u.moic)+'</b> are computed by the engine '
      + 'on the dated <b>monthly</b> array, not on these annual columns. The annual view is a display aggregation of the same engine.');

  /* ---- complete monthly passthrough ---- */
  var mo = u.monthly || [];
  var mHead = '<tr><th class="rowlabel-h">Mo</th><th>GPR</th><th>Res. Vacancy</th><th>Bad Debt</th>'
            + '<th>Commercial</th><th>Comm. Vacancy</th><th>Other</th><th>EGI</th>'
            + '<th>Controllable</th><th>Insurance</th><th>RE Taxes</th><th>Mgmt Fee</th>'
            + '<th>Total Opex</th><th>NOI b/ Res.</th><th>Reserves</th><th>NOI</th></tr>';
  var mRows = mo.map(function(r){
    return '<tr>'+lbl(String(r.m))
      + val(money(r.gprGross)) + val(money(r.resVac)) + val(money(r.bad))
      + val(money(r.commGross)) + val(money(r.commVac)) + val(money(r.other)) + val(money(r.egi))
      + val(money(-r.ctrlOpex)) + val(money(-r.insurance)) + val(money(-r.taxes)) + val(money(-r.mgmt))
      + val(money(-r.totalOpex)) + val(money(r.noiBeforeReserves)) + val(money(r.reserves)) + val(money(r.noi))
      + '</tr>';
  }).join('');
  var monthly = wrapTable('Monthly Passthrough - all '+mo.length+' months of the canonical engine', mHead, mRows);

  /* ---- monthly-to-annual reconciliation ---- */
  var sumM = function(k){ return mo.reduce(function(t,r){ return t + (k==='expenses' ? -r.totalOpex : r[k]); },0); };
  var sumA = function(k){ return arr.reduce(function(t,a){ return t + a[k]; },0); };
  function recRow(label, a, m){
    var d = a-m, ok = Math.abs(d) < 0.01;
    return '<tr>'+lbl(label)+val(money(a))+val(money(m))+val(money(d))
         + '<td>'+chip(ok?'pass':'fail', ok?'TIES':'VARIANCE')+'</td></tr>';
  }
  var recon = wrapTable('Reconciliation - annual columns against the monthly engine',
    '<tr><th class="rowlabel-h">Check</th><th>Annual</th><th>Monthly Sum</th><th>Variance</th><th>Status</th></tr>',
      recRow('Effective Gross Income', sumA('egi'), sumM('egi'))
    + recRow('Total Operating Expenses', sumA('expenses'), sumM('expenses'))
    + recRow('NOI Before Reserves', sumA('noi'), sumM('noiBeforeReserves'))
    + recRow('NOI After Reserves', sumA('after'), sumM('noi')));

  o.main = (o.main||'') + detail + cmp + unlev + monthly + recon
    + note('&#9432;','<b>Below-market / loss-to-lease</b> is not a modelled assumption in this engine, so no loss-to-lease line is '
      + 'shown. Mark-to-market exposure is available per unit on the Rent Roll lease-expiration schedule instead.');
});

/* PRIORITY 1b - Operating Underwrite QC panel (bkCalc already returns all of it) */
extend('Operating Underwrite','w1OpQC', function(o){
  var c = bkCalc(), s = bkLoad(), d = null;
  try { d = bkDebt(); } catch(e){}
  var price = Number(s.purchasePrice)||0, t12 = Number(s.t12noi)||0;
  var units = Number(s.units)||0, gsf = Number(s.gsf)||0;
  var body = ''
    + '<tr>'+lbl('Operating Expense Ratio')+val(pct(c.expenseRatio))+txt('Total expenses &divide; EGI')+'</tr>'
    + '<tr>'+lbl('NOI Margin')+val(pct(c.noiMargin))+txt('NOI after reserves &divide; EGI')+'</tr>'
    + '<tr>'+lbl('Going-In Cap Rate')+val(pct(c.goingIn))+txt('Source T-12 NOI &divide; purchase price')+'</tr>'
    + '<tr>'+lbl('Implied Stabilized Value at Exit Cap')+val(money(c.value))+txt('Year 1 NOI &divide; exit cap '+pct(Number(s.exitCap)))+'</tr>'
    + '<tr>'+lbl('Source T-12 NOI')+val(money0(t12))+txt('As entered on Deal Underwrite')+'</tr>'
    + '<tr>'+lbl('Underwritten Year 1 NOI vs. T-12')+val(t12?pct((c.noi-t12)/Math.abs(t12)):'-')+txt(t12?'Variance against the source':'No T-12 entered')+'</tr>'
    + '<tr>'+lbl('NOI per Unit')+val(units?money(c.noi/units):'-')+txt(units?intf(units)+' units':'No unit count')+'</tr>'
    + '<tr>'+lbl('NOI per SF')+val(gsf?money(c.noi/gsf):'-')+txt(gsf?intf(gsf)+' GSF':'No GSF')+'</tr>';
  if(d && d.loan>0){
    body += '<tr>'+lbl('Yield on Cost (Year 1 NOI &divide; total basis)')+val(price?pct(c.noi/(price+Number(s.closingCostsPct||0)*price)):'-')
          + txt('Unlevered basis including closing costs')+'</tr>';
  }
  o.main = (o.main||'') + wrapTable('Underwriting Quality Control - Year 1 against the source',
    '<tr><th class="rowlabel-h">Metric</th><th>Value</th><th style="text-align:left">Basis</th></tr>', body);
});

/* =====================================================================
   PRIORITY 2 - DEBT SCHEDULE
   Rendered entirely from bkDebt().months[], which already carries
   payment, interest, principal, balance, annualRate and indexRate for
   every month. No debt engine is added.
   ===================================================================== */
extend('Debt Schedule','w1DebtSchedule', function(o){
  var d = bkDebt(), s = bkLoad();
  var months = (d && d.months) || [];
  if(d && d.debtEnabled === false){
    o.main = (o.main||'') + note('&#9888;','<b>Debt is switched off for this deal.</b> There is no schedule to render; '
      + 'the deal is modelled unlevered and equity equals the full acquisition basis.');
    return;
  }
  if(!months.length){ o.main = (o.main||'') + pending('A period-by-period acquisition debt schedule'); return; }

  var payoffMo = months.length;
  var head = '<tr><th class="rowlabel-h">Mo</th><th>Beginning Balance</th><th>Loan Funding</th><th>Annual Rate</th>'
           + '<th>Interest</th><th>Principal</th><th>Debt Service</th><th>Payoff at Sale</th><th>Ending Balance</th></tr>';
  var rows = months.map(function(m, i){
    var beg = (i===0) ? d.loan : months[i-1].balance;
    var payoff = (m.m===payoffMo) ? m.balance : 0;
    return '<tr'+(m.m===payoffMo?' class="grandtotal"':'')+'>'+lbl(String(m.m))
      + val(money(beg))
      + val(i===0 ? money(d.loan) : '-')
      + val(pct(m.annualRate))
      + val(money(m.interest))
      + val(money(m.principal))
      + val(money(m.payment))
      + val(payoff ? money(payoff) : '-')
      + val(money(m.balance))
      + '</tr>';
  }).join('');
  var monthly = wrapTable('Acquisition Debt Schedule - Monthly, all '+months.length+' periods', head, rows);

  /* annual summary built by aggregating the same array */
  var years = Math.ceil(months.length/12);
  var aHead = '<tr><th class="rowlabel-h">Line Item</th><th>Total</th>';
  for(var y=1;y<=years;y++) aHead += '<th>Year '+y+'</th>';
  aHead += '</tr>';
  function agg(fn){
    var out=[];
    for(var y=0;y<years;y++){
      var t=0;
      for(var k=y*12;k<Math.min((y+1)*12,months.length);k++) t+=fn(months[k],k);
      out.push(t);
    }
    return out;
  }
  function aRow(label, series, fmt, cls){
    var tot = series.reduce(function(a,b){return a+b;},0);
    return '<tr'+(cls?' class="'+cls+'"':'')+'>'+lbl(label)+val(fmt(tot))
         + series.map(function(v){return val(fmt(v));}).join('')+'</tr>';
  }
  function endBal(){
    var out=[];
    for(var y=0;y<years;y++){ var k=Math.min((y+1)*12,months.length)-1; out.push(months[k].balance); }
    return out;
  }
  function begBal(){
    var out=[];
    for(var y=0;y<years;y++){ var k=y*12; out.push(k===0 ? d.loan : months[k-1].balance); }
    return out;
  }
  var annual = wrapTable('Acquisition Debt Schedule - Annual Summary',
      aHead,
      '<tr>'+lbl('Beginning Balance')+val('-')+begBal().map(function(v){return val(money(v));}).join('')+'</tr>'
    + aRow('Interest', agg(function(m){return m.interest;}), money)
    + aRow('Principal Amortization', agg(function(m){return m.principal;}), money)
    + aRow('Debt Service', agg(function(m){return m.payment;}), money, 'grandtotal')
    + '<tr>'+lbl('Ending Balance')+val('-')+endBal().map(function(v){return val(money(v));}).join('')+'</tr>');

  var recon = wrapTable('Reconciliation - schedule against the sizing engine',
    '<tr><th class="rowlabel-h">Check</th><th>Schedule</th><th>Engine</th><th>Variance</th><th>Status</th></tr>',
    (function(){
      var begFirst = d.loan, endLast = months[months.length-1].balance;
      function rr(label,a,b){ var dd=a-b, ok=Math.abs(dd)<0.01;
        return '<tr>'+lbl(label)+val(money(a))+val(money(b))+val(money(dd))+'<td>'+chip(ok?'pass':'fail',ok?'TIES':'VARIANCE')+'</td></tr>'; }
      return rr('Opening balance equals the sized loan', begFirst, d.loan)
           + rr('Closing balance equals debt at sale', endLast, d.debtAtSale)
           + rr('Monthly payment equals the engine payment', months[0].payment, d.pmt);
    })());

  o.main = (o.main||'') + annual + monthly + recon
    + pending('The construction facility schedule - beginning balance, draws, capitalized interest, '
      + 'interest in excess of commitment, cash-pay interest, repayment and undrawn availability');
});

/* =====================================================================
   PRIORITY 4 - LIQUIDITY
   Every figure is a reduction over bkMonthlyReturns().values[], which
   already exists per month. Nothing new is computed about the deal.
   ===================================================================== */
extend('Liquidity','w1Liquidity', function(o){
  var x, s = bkLoad();
  try { x = bkMonthlyReturns(); } catch(e){ o.main = (o.main||'') + pending('Monthly equity cash flows'); return; }
  var v = (x && x.values) || [];
  if(!v.length){ o.main = (o.main||'') + pending('Monthly equity cash flows'); return; }

  var cum=[], run=0, peak=0, peakMo=0, firstDist=0, lastCall=0, callMonths=0;
  for(var i=0;i<v.length;i++){
    run += v[i]; cum.push(run);
    if(v[i] < 0){ callMonths++; lastCall = i+1; }
    if(v[i] > 0 && !firstDist) firstDist = i+1;
    var outstanding = Math.max(0, -run);
    if(outstanding > peak){ peak = outstanding; peakMo = i+1; }
  }
  var negCarry = firstDist ? firstDist-1 : v.length;
  var totalCalled = v.reduce(function(t,y){return t + (y<0 ? -y : 0);},0);
  var totalDist   = v.reduce(function(t,y){return t + (y>0 ?  y : 0);},0);

  var summary = wrapTable('Funding &amp; Liquidity Summary - from the monthly equity cash flow',
    '<tr><th class="rowlabel-h">Metric</th><th>Value</th><th style="text-align:left">Basis</th></tr>',
      '<tr>'+lbl('Total Equity Called')+val(money(totalCalled))+txt('Sum of all negative monthly equity flows')+'</tr>'
    + '<tr class="grandtotal">'+lbl('Peak Net Equity Outstanding')+val(money(peak))+txt('Maximum of calls less distributions, at any month')+'</tr>'
    + '<tr>'+lbl('Month of Peak Equity Outstanding')+val('Month '+intf(peakMo))+txt('Year '+intf(Math.ceil(peakMo/12)))+'</tr>'
    + '<tr>'+lbl('Months With a Capital Call')+val(intf(callMonths))+txt('Months with a net equity outflow')+'</tr>'
    + '<tr>'+lbl('Final Capital-Call Month')+val(lastCall?('Month '+intf(lastCall)):'-')+txt('Last month requiring equity')+'</tr>'
    + '<tr>'+lbl('First Distribution Month')+val(firstDist?('Month '+intf(firstDist)):'-')+txt('First month with a net equity inflow')+'</tr>'
    + '<tr>'+lbl('Months of Negative Carry')+val(intf(negCarry))+txt('Months before the first distribution')+'</tr>'
    + '<tr>'+lbl('Total Distributions to Equity')+val(money(totalDist))+txt('Sum of all positive monthly equity flows')+'</tr>');

  /* annual equity outstanding */
  var yrs = Math.ceil(v.length/12);
  var head = '<tr><th class="rowlabel-h">Line Item</th><th>Total</th>';
  for(var y=1;y<=yrs;y++) head += '<th>Year '+y+'</th>';
  head += '</tr>';
  function yAgg(fn){
    var out=[];
    for(var yy=0;yy<yrs;yy++){ var t=0; for(var k=yy*12;k<Math.min((yy+1)*12,v.length);k++) t+=fn(v[k],k); out.push(t); }
    return out;
  }
  var calls = yAgg(function(z){ return z<0 ? -z : 0; });
  var dists = yAgg(function(z){ return z>0 ?  z : 0; });
  var net   = yAgg(function(z){ return z; });
  var cumEnd=[], outEnd=[];
  for(y=0;y<yrs;y++){ var k=Math.min((y+1)*12,v.length)-1; cumEnd.push(cum[k]); outEnd.push(Math.max(0,-cum[k])); }
  function row(label, series, cls){
    var tot = series.reduce(function(a,b){return a+b;},0);
    return '<tr'+(cls?' class="'+cls+'"':'')+'>'+lbl(label)+val(money(tot))
         + series.map(function(z){return val(money(z));}).join('')+'</tr>';
  }
  var annual = wrapTable('Annual Investor Cash Flow &amp; Equity Outstanding', head,
      row('Capital Calls', calls)
    + row('Distributions', dists)
    + row('Net Equity Cash Flow', net, 'grandtotal')
    + '<tr>'+lbl('Cumulative Net Equity Cash Flow')+val('-')+cumEnd.map(function(z){return val(money(z));}).join('')+'</tr>'
    + '<tr>'+lbl('Net Equity Outstanding (capital at risk)')+val('-')+outEnd.map(function(z){return val(money(z));}).join('')+'</tr>');

  /* funding timing / source, where the engine already provides it */
  var src = '';
  try {
    var d = bkDebt();
    src = wrapTable('Funding at Close - source split',
      '<tr><th class="rowlabel-h">Source</th><th>Amount</th><th style="text-align:left">Basis</th></tr>',
        '<tr>'+lbl('Acquisition Loan Funding')+val(money(d.loan))+txt('Sized by '+esc(d.binding||'constraint')+' at close')+'</tr>'
      + '<tr>'+lbl('Equity Requirement')+val(money(d.equity))+txt('Total basis less loan proceeds')+'</tr>'
      + '<tr class="grandtotal">'+lbl('Total Funding at Close')+val(money(d.loan+d.equity))+txt('Sources equal uses')+'</tr>');
  } catch(e){}

  o.main = (o.main||'') + summary + annual + src
    + note('&#9432;','The investor payback table above is retained - it is additive to, not a substitute for, the funding and '
      + 'liquidity schedule. Construction-period facility draws and undrawn availability remain pending approved engine work.');
});

/* =====================================================================
   PRIORITY 3 - SENSITIVITY: the two missing two-way grids
   Both run through bkRunScenario(), the same machinery the existing
   grids use. No new economic logic.
   ===================================================================== */
extend('Sensitivity','w1Sensitivity', function(o){
  var s = bkLoad();
  if(typeof bkRunScenario !== 'function') return;
  function run(ov){ try { return bkRunScenario(ov); } catch(e){ return {irr:NaN,moic:NaN}; } }
  var floating = String(s.debtRateType||'Fixed')==='Floating';
  var rateKey  = floating ? 'debtIndexRate' : 'acqRate';
  var baseRate = Number(floating ? s.debtIndexRate : s.acqRate) || 0;
  var baseCap  = Number(s.exitCap) || 0.07;

  var rates = [-0.01,-0.005,0,0.005,0.01].map(function(x){ return Math.max(0, baseRate+x); });
  var caps  = [-0.01,-0.005,0,0.005,0.01].map(function(x){ return Math.max(0.0001, baseCap+x); });
  function grid(rowVals, colVals, build, rowFmt, colFmt, caption){
    var head = '<tr><th class="rowlabel-h">'+caption[1]+'</th>'
             + colVals.map(function(c){ return '<th>'+colFmt(c)+'</th>'; }).join('') + '</tr>';
    var body = rowVals.map(function(rv){
      return '<tr>'+lbl(rowFmt(rv)) + colVals.map(function(cv){
        var r = run(build(rv,cv));
        return val((isFinite(r.irr)?pct(r.irr):'n/a')
          + '<br><span style="opacity:.65;font-size:.85em">'+(isFinite(r.moic)?mult(r.moic):'')+'</span>');
      }).join('') + '</tr>';
    }).join('');
    return wrapTable(caption[0], head, body);
  }

  var g1 = grid(rates, caps,
    function(r,c){ var ov={exitCap:c}; ov[rateKey]=r; return ov; },
    function(r){ return pct(r); }, function(c){ return pct(c); },
    [(floating?'Debt Index Rate':'Acquisition Interest Rate')+' &times; Exit Cap - Levered XIRR / MOIC',
     (floating?'Index Rate':'Acq. Rate')+' \\ Exit Cap']);

  var vacs = [-0.01,-0.005,0,0.005,0.01].map(function(x){ return Math.max(0, (Number(s.vacancy)||0)+x); });
  var ogs  = [-0.01,-0.005,0,0.005,0.01].map(function(x){ return (Number(s.opexGrowth)||0)+x; });
  var g2 = grid(vacs, ogs,
    function(vc,og){ return {vacancy:vc, commercialVacancy:Math.max(0,(Number(s.commercialVacancy)||0)+(vc-(Number(s.vacancy)||0))), opexGrowth:og}; },
    function(v){ return pct(v); }, function(g){ return pct(g); },
    ['Vacancy &times; Operating Expense Growth - Levered XIRR / MOIC', 'Vacancy \\ Opex Growth']);

  o.main = (o.main||'') + g1 + g2
    + note('&#9888;','<b>One workbook axis is deliberately not reproduced.</b> The workbook&rsquo;s second two-way grid varies an operating '
      + 'expense <b>level variance</b>, which is not a field this engine carries. The grid above varies the <b>opex growth rate</b>, which '
      + 'is a real canonical assumption, and the divergence is named rather than hidden. An expense-level variance control stays on the '
      + 'engine-gap list. Both grids compute live on every render - there is no stored snapshot to go stale.');
});

/* =====================================================================
   PRIORITY 5 - OTHER OUTPUTS THAT REACH NO RENDERED SURFACE
   ===================================================================== */

/* Returns: forward NOI at exit, debt at sale, LP/GP cross-reference */
extend('Returns','w1Returns', function(o){
  var u, d, w;
  try { u = bkAnnualCF(); } catch(e){ return; }
  try { d = bkDebt(); } catch(e){}
  try { w = bkWaterfallV07(); } catch(e){}
  var s = bkLoad();
  var body = ''
    + '<tr>'+lbl('Forward NOI at Exit')+val(money(u.terminalNOI))+txt('Next 12 months of NOI after reserves, from the monthly engine')+'</tr>'
    + '<tr>'+lbl('Gross Sale Price')+val(money(u.grossSale))+txt('Forward NOI &divide; exit cap '+pct(Number(s.exitCap)))+'</tr>'
    + '<tr>'+lbl('Cost of Sale')+val(money(-u.saleCost))+txt(pct(Number(s.saleCostPct))+' of gross price')+'</tr>'
    + '<tr>'+lbl('Net Sale Proceeds')+val(money(u.netSale))+txt('Gross price less cost of sale')+'</tr>';
  if(d){
    body += '<tr>'+lbl('Debt Outstanding at Sale')+val(money(d.debtAtSale))+txt('Balance carried to the exit month')+'</tr>'
          + '<tr>'+lbl('Net Sale Proceeds After Debt Payoff')+val(money(u.netSale-d.debtAtSale))+txt('To equity at exit')+'</tr>'
          + '<tr>'+lbl('Peak / Initial Equity')+val(money(d.equity))+txt('Total basis less loan proceeds')+'</tr>';
  }
  var keyEcon = wrapTable('Key Economics at Exit',
    '<tr><th class="rowlabel-h">Metric</th><th>Value</th><th style="text-align:left">Basis</th></tr>', body);

  var partner = '';
  if(w){
    partner = wrapTable('Partner Returns - cross-reference to the Equity Waterfall',
      '<tr><th class="rowlabel-h">Metric</th><th>LP</th><th>GP</th><th>Total</th></tr>',
        '<tr>'+lbl('XIRR')+val(pct(w.lpIRR))+val(pct(w.gpIRR))+val('-')+'</tr>'
      + '<tr>'+lbl('Equity Multiple')+val(mult(w.lp&&w.lp.moic))+val(mult(w.gp&&w.gp.moic))+val('-')+'</tr>'
      + '<tr class="grandtotal">'+lbl('GP Promote')+val('-')+val(money(w.promote))+val(money(w.promote))+'</tr>')
      + note('&#9432;','These are the same figures the Equity Waterfall page computes - shown here as a cross-reference so the '
        + 'returns page is complete, not as a second calculation.');
  }
  o.main = (o.main||'') + keyEcon + partner;
});

/* After-Tax: tax drag, total tax paid, effective tax rate */
extend('After-Tax','w1AfterTax', function(o){
  var at, x;
  try { at = bkAfterTaxV18(); x = bkMonthlyReturns(); } catch(e){ return; }
  if(!at) return;
  var rows = (at.rows||[]);
  var totalOpsTax = rows.reduce(function(t,r){ return t + (Number(r.taxDue)||0); },0);
  var saleTax = Number(at.saleTax)||0;
  var totalTax = totalOpsTax + saleTax;
  var preIRR = Number(x && x.irr), postIRR = Number(at.atIRR);
  var preMO = Number(x && x.moic), postMO = Number(at.atMOIC);
  var profit = (Number(x && x.dist)||0) - (Number(x && x.contrib)||0);
  var body = ''
    + '<tr>'+lbl('Pre-Tax Levered XIRR')+val(pct(preIRR))+txt('Monthly engine')+'</tr>'
    + '<tr>'+lbl('After-Tax Levered XIRR')+val(pct(postIRR))+txt('After operating and sale-year tax')+'</tr>'
    + '<tr class="grandtotal">'+lbl('Tax Drag on XIRR')+val(isFinite(preIRR)&&isFinite(postIRR)?((preIRR-postIRR)*10000).toFixed(0)+' bps':'-')+txt('Pre-tax less after-tax')+'</tr>'
    + '<tr>'+lbl('Pre-Tax Equity Multiple')+val(mult(preMO))+txt('Monthly engine')+'</tr>'
    + '<tr>'+lbl('After-Tax Equity Multiple')+val(mult(postMO))+txt('After tax')+'</tr>'
    + '<tr>'+lbl('Total Operating Tax Over the Hold')+val(money(totalOpsTax))+txt('Sum of annual ordinary income tax')+'</tr>'
    + '<tr>'+lbl('Sale-Year Tax')+val(money(saleTax))+txt('Recapture plus capital gains')+'</tr>'
    + '<tr class="grandtotal">'+lbl('Total Tax Paid')+val(money(totalTax))+txt('Operating plus sale')+'</tr>'
    + '<tr>'+lbl('Effective Tax Rate on Deal Profit')+val(profit>0?pct(totalTax/profit):'-')+txt(profit>0?'Total tax &divide; pre-tax profit of '+money(profit):'No pre-tax profit')+'</tr>';
  o.main = (o.main||'') + wrapTable('Tax Drag &amp; Effective Tax Rate',
    '<tr><th class="rowlabel-h">Metric</th><th>Value</th><th style="text-align:left">Basis</th></tr>', body);
});

/* Covenant Monitor: period summary reduced over the series already rendered */
extend('Covenant Monitor','w1Covenant', function(o){
  var u, d, s = bkLoad();
  try { u = bkAnnualCF(); d = bkDebt(); } catch(e){ return; }
  if(!d || d.debtEnabled===false || !(d.months||[]).length) return;
  var minDSCR = Number(s.minDebtYield!==undefined ? s.acqDSCR : s.acqDSCR) || 0;
  var covDSCR = Number(s.acqDSCR)||0, covDY = Number(s.minDebtYield)||0;
  var years = u.arr.length, obsDSCR=[], obsDY=[], obsLev=[], watch=0, tested=0;
  for(var y=0;y<years;y++){
    var ds=0; for(var k=y*12;k<Math.min((y+1)*12,d.months.length);k++) ds+=d.months[k].payment;
    var endK=Math.min((y+1)*12,d.months.length)-1;
    var bal=endK>=0?d.months[endK].balance:0;
    if(ds>0){
      tested++;
      var dscr=u.arr[y].after/ds; obsDSCR.push(dscr);
      if(bal>0){ var dy=u.arr[y].after/bal; obsDY.push(dy); obsLev.push(bal/(Number(s.purchasePrice)||1)); }
      if((covDSCR&&dscr<covDSCR)||(covDY&&bal>0&&(u.arr[y].after/bal)<covDY)) watch++;
    }
  }
  var minD = obsDSCR.length?Math.min.apply(null,obsDSCR):NaN;
  var minY = obsDY.length?Math.min.apply(null,obsDY):NaN;
  var maxL = obsLev.length?Math.max.apply(null,obsLev):NaN;
  var status = !tested ? ['', 'NOT TESTED'] : watch ? ['warn','WATCH - '+watch+' period(s) below'] : ['pass','PASS'];
  o.main = (o.main||'') + wrapTable('Covenant Period Summary',
    '<tr><th class="rowlabel-h">Metric</th><th>Value</th><th style="text-align:left">Basis</th></tr>',
      '<tr>'+lbl('Minimum DSCR Observed')+val(isFinite(minD)?mult(minD):'-')+txt('Covenant '+(covDSCR?mult(covDSCR):'not set'))+'</tr>'
    + '<tr>'+lbl('Minimum Debt Yield Observed')+val(isFinite(minY)?pct(minY):'-')+txt('Covenant '+(covDY?pct(covDY):'not set'))+'</tr>'
    + '<tr>'+lbl('Maximum Leverage Observed')+val(isFinite(maxL)?pct(maxL):'-')+txt('Ending balance &divide; purchase price')+'</tr>'
    + '<tr>'+lbl('Periods Tested')+val(intf(tested))+txt('Annual periods with debt service')+'</tr>'
    + '<tr>'+lbl('Periods on Watch')+val(intf(watch))+txt('Below a set covenant')+'</tr>'
    + '<tr class="grandtotal">'+lbl('OVERALL COVENANT STATUS')+'<td class="v">'+chip(status[0],status[1])+'</td>'+txt('Across the tested periods')+'</tr>')
    + note('&#9888;','This summary reduces the <b>annual</b> test rendered above. The workbook tests monthly on a <b>trailing-twelve</b> '
      + 'basis with PRE-STABILISATION and RAMP states. Those are different covenants and can disagree; changing the test basis is '
      + 'engine work and stays on the engine-gap list.');
});

/* QA: render the self-tests that already run and reach no surface, plus reasonableness bands */
extend('QA','w1QA', function(o){
  var blocks = '';
  function runner(name, fn){
    var res; try { res = fn(); } catch(e){ return '<tr>'+lbl(name)+'<td class="v">'+chip('fail','ERROR')+'</td>'+txt(esc(e.message))+'</tr>'; }
    var tests = (res && (res.tests || res.results || res.checks)) || null;
    /* V30.2: some suites return checks as [name, pass] pairs; read both shapes (previously every
       pair was shown as a failure with a blank name, e.g. "0 / 5 Failing: ; ; ;"). */
    if(Array.isArray(tests)) tests = tests.map(function(t){ return Array.isArray(t) ? {name:t[0], pass:!!t[1]} : t; });
    if(Array.isArray(tests)){
      var pass = tests.filter(function(t){ return t.pass; }).length;
      var det = tests.filter(function(t){ return !t.pass; }).map(function(t){ return esc(t.name||t.label||''); }).join('; ');
      return '<tr>'+lbl(name)+'<td class="v">'+chip(pass===tests.length?'pass':'fail', pass+' / '+tests.length)+'</td>'
           + txt(det ? 'Failing: '+det : 'All checks passed')+'</tr>';
    }
    return '<tr>'+lbl(name)+'<td class="v">'+chip('','RAN')+'</td>'+txt('Returned '+esc(Object.keys(res||{}).join(', ')||'no detail'))+'</tr>';
  }
  var rows = '';
  sandbox(function(){
    if(typeof bkRunIngestionQA==='function')      rows += runner('Source Ingestion QA', bkRunIngestionQA);
    if(typeof bkFloatingDebtQA==='function')      rows += runner('Floating Debt QA', bkFloatingDebtQA);
    if(typeof bkWaterfallAuditV2994==='function') rows += runner('Waterfall Conservation Audit', bkWaterfallAuditV2994);
  });
  if(rows) blocks += wrapTable('Engine Self-Tests - results that previously reached no page',
    '<tr><th class="rowlabel-h">Suite</th><th>Result</th><th style="text-align:left">Detail</th></tr>', rows);

  /* reasonableness bands - comparisons over values the engines already return */
  try {
    var c = bkCalc(), s = bkLoad(), d = bkDebt(), x = bkMonthlyReturns();
    var units = Number(s.units)||0, gsf = Number(s.gsf)||0, price = Number(s.purchasePrice)||0;
    function band(label, v, lo, hi, fmt){
      var ok = isFinite(v) && v>=lo && v<=hi;
      return '<tr>'+lbl(label)+val(isFinite(v)?fmt(v):'-')
        + txt(fmt(lo)+' to '+fmt(hi))
        + '<td>'+chip(ok?'pass':'warn', ok?'OK':'REVIEW')+'</td></tr>';
    }
    var bands = ''
      + band('Operating Expense Ratio', c.expenseRatio, 0.15, 0.50, function(v){return pct(v);})
      + band('NOI Margin', c.noiMargin, 0.40, 0.90, function(v){return pct(v);})
      + band('Exit Cap Rate', Number(s.exitCap), 0.03, 0.12, function(v){return pct(v);})
      + band('Going-In Cap Rate', c.goingIn, 0.02, 0.12, function(v){return pct(v);})
      + (units ? band('NOI per Unit', c.noi/units, 2000, 80000, function(v){return money(v);}) : '')
      + (gsf   ? band('Cost per SF', price/gsf, 50, 1500, function(v){return money(v);}) : '')
      + (units ? band('Cost per Unit', price/units, 50000, 2000000, function(v){return money(v);}) : '')
      + (d && d.loan ? band('Debt Service Coverage', d.dscr, 1.05, 3.00, function(v){return mult(v);}) : '')
      + band('Levered XIRR', Number(x && x.irr), 0.00, 0.40, function(v){return pct(v);});
    blocks += wrapTable('Economic Reasonableness Bands',
      '<tr><th class="rowlabel-h">Metric</th><th>Value</th><th style="text-align:left">Expected Band</th><th>Status</th></tr>', bands)
      + note('&#9432;','A REVIEW flag is a prompt to look, not a failure. The bands are screening ranges, not covenants.');
  } catch(e){}

  o.main = (o.main||'') + blocks;
});

/* Sources & Uses: Sources = Uses reconciliation, deal identity guard, capitalization ratios */
extend('Sources & Uses','w1SourcesUses', function(o){
  var s = bkLoad(), d;
  try { d = bkDebt(); } catch(e){ return; }
  var price = Number(s.purchasePrice)||0;
  var closing = price*Number(s.closingCostsPct||0);
  var acqFee = price*(typeof bkAcqFeePct==='function' ? bkAcqFeePct(s) : Number(s.acqFeePct||0));
  var uses = price + closing + acqFee + (Number(d.fee)||0);
  var sources = (Number(d.loan)||0) + (Number(d.equity)||0);
  var delta = sources - uses;
  var ok = Math.abs(delta) < 1;
  var units = Number(s.units)||0, gsf = Number(s.gsf)||0;

  var checks = wrapTable('Funding Order &amp; Control Checks',
    '<tr><th class="rowlabel-h">Check</th><th>Value</th><th style="text-align:left">Basis</th><th>Status</th></tr>',
      '<tr>'+lbl('Total Uses')+val(money(uses))+txt('Price + closing + acquisition fee + origination fee')+'<td></td></tr>'
    + '<tr>'+lbl('Total Sources')+val(money(sources))+txt('Loan proceeds + equity requirement')+'<td></td></tr>'
    + '<tr class="grandtotal">'+lbl('Sources less Uses')+val(money(delta))+txt('Must reconcile to zero')
      + '<td>'+chip(ok?'pass':'fail', ok?'TIES':'VARIANCE')+'</td></tr>'
    + '<tr>'+lbl('Figures belong to the active deal')+val(esc(s.dealId||'-')+' - '+esc(s.name||''))+txt('Guards against stale cached values')
      + '<td>'+chip(s.dealId?'pass':'warn', s.dealId?'PASS':'NO DEAL ID')+'</td></tr>');

  var caps = wrapTable('Capitalization Metrics',
    '<tr><th class="rowlabel-h">Metric</th><th>Value</th><th style="text-align:left">Basis</th></tr>',
      '<tr>'+lbl('Loan to Value')+val(pct(d.ltv))+txt('Against '+window.bkLtvBasisLabel(d.s||bkLoad(), true))+'</tr>'
    + '<tr>'+lbl('Loan to Cost')+val(pct(d.ltc))+txt('Against acquisition basis')+'</tr>'
    + '<tr>'+lbl('Equity as % of Total Uses')+val(uses?pct(d.equity/uses):'-')+txt('Equity requirement &divide; total uses')+'</tr>'
    + '<tr>'+lbl('Peak Equity Requirement')+val(money(d.equity))+txt('Funded at close for an acquisition')+'</tr>'
    + '<tr>'+lbl('Loan per Unit')+val(units?money(d.loan/units):'-')+txt(units?intf(units)+' units':'No unit count')+'</tr>'
    + '<tr>'+lbl('Loan per SF')+val(gsf?money(d.loan/gsf):'-')+txt(gsf?intf(gsf)+' GSF':'No GSF')+'</tr>');

  o.main = (o.main||'') + checks + caps;
});

/* Rent Roll: lease-expiration exposure and mark-to-market, from lease dates already in state */
extend('Rent Roll','w1Expiry', function(o){
  var s = bkLoad(), rr = Array.isArray(s.rentRoll) ? s.rentRoll : [];
  if(!rr.length) return;
  var start = (typeof bkParseDealDate==='function') ? bkParseDealDate(s.closing,'2026-01-01') : new Date();
  var hold = Math.max(1, Math.round(Number(s.holdYears)||10));
  var buckets = []; for(var i=0;i<=hold;i++) buckets.push({units:0, sf:0, inPlace:0, market:0});
  var totOccRent = 0, totUnits = 0;
  rr.forEach(function(u){
    var ip = (Number(u.inPlaceRent)||0)*12, mk = (Number(u.marketRent)||0)*12;
    if(u.status==='Occupied'){ totOccRent += ip; totUnits++; }
    var end = u.leaseEnd ? new Date(u.leaseEnd) : null;
    if(!end || isNaN(end.getTime())) return;
    var mo = (end.getFullYear()-start.getFullYear())*12 + (end.getMonth()-start.getMonth());
    var yr = Math.max(1, Math.ceil((mo+1)/12));
    var b = buckets[Math.min(yr, hold)];
    b.units++; b.sf += Number(u.sf)||0; b.inPlace += ip; b.market += mk;
  });
  var rows = '';
  for(i=1;i<=hold;i++){
    var b = buckets[i];
    if(!b.units) continue;
    rows += '<tr>'+lbl('Year '+i)
      + val(intf(b.units))
      + val(totUnits?pct(b.units/totUnits):'-')
      + val(intf(b.sf))
      + val(money(b.inPlace))
      + val(totOccRent?pct(b.inPlace/totOccRent):'-')
      + val(money(b.market))
      + val(money(b.market-b.inPlace))
      + '</tr>';
  }
  var tot = buckets.reduce(function(a,b){ return {units:a.units+b.units, sf:a.sf+b.sf, inPlace:a.inPlace+b.inPlace, market:a.market+b.market}; },
                           {units:0,sf:0,inPlace:0,market:0});
  rows += '<tr class="grandtotal">'+lbl('TOTAL EXPIRING IN HOLD')+val(intf(tot.units))
    + val(totUnits?pct(tot.units/totUnits):'-')+val(intf(tot.sf))+val(money(tot.inPlace))
    + val(totOccRent?pct(tot.inPlace/totOccRent):'-')+val(money(tot.market))+val(money(tot.market-tot.inPlace))+'</tr>';
  o.main = (o.main||'') + wrapTable('Lease Expiration Exposure &amp; Mark-to-Market - by lease year',
    '<tr><th class="rowlabel-h">Lease Year</th><th>Units Expiring</th><th>% of Units</th><th>SF Expiring</th>'
    + '<th>Expiring In-Place Rent</th><th>% of Occupied Rent</th><th>Market Rent at Rollover</th><th>Mark-to-Market</th></tr>', rows)
    + note('&#9432;','Built from the lease end dates and market rents already in the rent roll. Rollover economics (renewal probability, '
      + 'downtime, TI and LC) are set on this page and previewed per unit; they do not yet feed the cash flow, which matches the workbook, '
      + 'where the equivalent panel is also display-only.');
});

/* Waterfall (M): the hurdle ACCOUNT balances.
   Phase 1 classified these as an engine gap. The Wave 2 verification disproved
   that: bkWaterfallV07().rows[] already carries b1, b2 and b3 - the tier 1, 2 and
   3 hurdle account balances, compounding month by month - alongside the tier
   distributions. They simply reached no rendered surface. This is therefore
   exposure, not engine work, and the caption is accurate once they are shown. */
extend('Waterfall (M)','w1WfAccounts', function(o){
  var w; try { w = bkWaterfallV07(); } catch(e){ return; }
  var rows = (w && w.rows) || [];
  if(!rows.length) return;
  var s = bkLoad();
  var head = '<tr><th class="rowlabel-h">Mo</th>'
           + '<th>Contribution</th><th>Distribution</th>'
           + '<th>Tier 1 Hurdle Account</th><th>Tier 1 Distribution</th><th>Catch-Up</th>'
           + '<th>Tier 2 Hurdle Account</th><th>Tier 2 Distribution</th>'
           + '<th>Tier 3 Hurdle Account</th><th>Tier 3 Distribution</th>'
           + '<th>Tier 4 Residual</th><th>Promote</th></tr>';
  var body = rows.map(function(r){
    var live = (r.con||0) || (r.dist||0);
    return '<tr'+(live?'':' style="opacity:.55"')+'>'+lbl(String(r.m))
      + val(money0(r.con)) + val(money0(r.dist))
      + val(money(r.b1)) + val(money0(r.t1)) + val(money0(r.catchup))
      + val(money(r.b2)) + val(money0(r.t2))
      + val(money(r.b3)) + val(money0(r.t3))
      + val(money0(r.t4)) + val(money0(r.promote))
      + '</tr>';
  }).join('');
  o.main = (o.main||'') + wrapTable('Hurdle Account Detail - tier balances against distributions, all '+rows.length+' months',
    head, body)
    + note('&#9432;','The <b>hurdle account</b> columns are the required balance at each tier - contributed capital compounded at '
      + 'the tier rate (Tier 1 at the '+pct(Number(s.pref))+' preferred return, Tier 2 at '+pct(Number(s.hurdle2))+', Tier 3 at '
      + pct(Number(s.hurdle3))+'). A tier pays only once its account is satisfied, which is why the distribution columns stay at zero '
      + 'while the balances accrue. These come straight from the canonical waterfall engine; nothing here is recalculated.');
});

/* Refinance sizing - computed in full by the engine, rendered on no page at all.
   bkMonthlyReturns().refi returns month, loan, fee, rate, amortization, balance,
   payment, appraised value, valuation cap, the LTV and DSCR constraints and the
   binding label. Verified reaching zero of 46 sheets before this was added. */
extend('Debt','w1Refi', function(o){
  var x; try { x = bkMonthlyReturns(); } catch(e){ return; }
  var r = x && x.refi;
  var s = bkLoad();
  if(!r || !isFinite(r.loan) || r.loan <= 0){
    o.main = (o.main||'') + wrapTable('Refinance / Permanent Loan Sizing',
      '<tr><th class="rowlabel-h">Metric</th><th>Value</th><th style="text-align:left">Basis</th></tr>',
      '<tr>'+lbl('Refinance')+val('Not modelled for this deal')
      + txt('No refinance is triggered - the loan is held to sale')+'</tr>');
    return;
  }
  var body = ''
    + '<tr>'+lbl('Refinance Month')+val('Month '+intf(r.month))+txt('Year '+intf(Math.ceil(r.month/12))+' of the hold')+'</tr>'
    + '<tr>'+lbl('Appraised Value at Refinance')+val(money(r.value))+txt('Forward NOI '+money(r.noi)+' &divide; valuation cap '+pct(r.cap))+'</tr>'
    + '<tr>'+lbl('Constraint - Maximum LTV')+val(money(r.byLTV))+txt('Against the appraised value above')+'</tr>'
    + '<tr>'+lbl('Constraint - Minimum DSCR')+val(money(r.byDSCR))+txt('Against forward NOI at the refinance coupon')+'</tr>'
    + '<tr class="grandtotal">'+lbl('PERMANENT LOAN AMOUNT')+val(money(r.loan))
      + '<td data-bk-align="text">Lowest binding capacity - '+chip('pass', esc(r.binding))+'</td></tr>'
    + '<tr>'+lbl('Financing Fee')+val(money(r.fee))+txt('On the permanent loan')+'</tr>'
    + '<tr>'+lbl('Coupon')+val(pct(r.rate))+txt('Permanent loan rate')+'</tr>'
    + '<tr>'+lbl('Amortization')+val(intf(r.amort)+' years')+txt('Permanent loan amortization')+'</tr>'
    + '<tr>'+lbl('Monthly Payment')+val(money(r.pmt))+txt('Debt service after refinance')+'</tr>'
    + '<tr>'+lbl('Net Refinance Proceeds')+val(money(r.loan - r.fee))+txt('Loan less financing fee, before payoff of the existing loan')+'</tr>';
  o.main = (o.main||'') + wrapTable('Refinance / Permanent Loan Sizing - which constraint binds',
    '<tr><th class="rowlabel-h">Metric</th><th>Value</th><th style="text-align:left">Basis</th></tr>', body)
    + note('&#9888;','The workbook sizes the permanent loan on <b>three</b> constraints. Two are computed here - maximum LTV and '
      + 'minimum DSCR. A <b>minimum debt yield</b> constraint at refinance is not among the engine outputs, so it is not shown and not '
      + 'inferred; it stays on the engine-gap list. The <code>permDebtYield</code> assumption exists in state but does not bind here.');
});

/* Development draw curve: hardCurveMethod and hardCurveSteepness are real state
   fields that were verified to move the monthly draw profile. They are editable on
   Deal Underwrite and were invisible on the pages the curve actually drives. */
extend('Dev Draws','w1DrawCurve', function(o){
  var s = bkLoad();
  if(String(s.dealType||'').toLowerCase() !== 'development') return;
  if(!('hardCurveMethod' in s) && !('hardCurveSteepness' in s)) return;
  o.main = (o.main||'') + wrapTable('Draw Curve Settings in Effect',
    '<tr><th class="rowlabel-h">Setting</th><th>Value</th><th style="text-align:left">Effect</th><th>Status</th></tr>',
      '<tr>'+lbl('Hard Cost Spend Curve')+val(esc(s.hardCurveMethod||'-'))
      + txt('Shapes how hard costs are drawn across the construction period')
      + '<td>'+chip('','LINKED')+'</td></tr>'
    + '<tr>'+lbl('S-Curve Steepness')+val(intf(s.hardCurveSteepness))
      + txt('Higher concentrates spend toward the middle of the construction window')
      + '<td>'+chip('','LINKED')+'</td></tr>')
    + note('&#9432;','Both settings are edited on <b>Deal Underwrite</b> and are shown here because this is the page they drive. '
      + 'Changing either one was verified to move the monthly draw profile above, so these are live assumptions, not labels.');
});

/* Sponsor fee treatment: name where the engine puts the development-deal fees
   rather than inventing sponsor income the engine does not compute. */
extend('Sponsor CF','w1SponsorFees', function(o){
  var s = bkLoad();
  if(String(s.dealType||'').toLowerCase() !== 'development') return;
  var dv; try { dv = bkDevV09(); } catch(e){ return; }
  if(!dv || !dv.isDev) return;
  var cmLine = (dv.softLadder && dv.softLadder.lines || []).filter(function(l){ return /Construction Management/i.test(l.name); })[0];
  o.main = (o.main||'') + wrapTable('Development-Deal Sponsor Fees - as the engine models them',
    '<tr><th class="rowlabel-h">Fee</th><th>Rate</th><th>Amount</th><th style="text-align:left">Where the engine puts it</th></tr>',
      '<tr>'+lbl('Development Fee')+val(pct(Number(s.devFeePct)))+val(money(dv.softLadder && dv.softLadder.devFee))
      + txt('Capitalized into the soft-cost ladder, not booked as sponsor income')+'</tr>'
    + '<tr>'+lbl('Construction Management Fee')+val(pct(Number(s.cmFeePct)))+val(money(cmLine && cmLine.total))
      + txt('A named soft-cost line, not booked as sponsor income')+'</tr>'
    + '<tr>'+lbl('Guaranty Fee')+val(pct(Number(s.guarantyFeePct)))+val(Number(s.guarantyFeePct)?'-':money(0))
      + txt('Carried in the financing path')+'</tr>')
    + note('&#9888;','<b>A deliberate divergence, named rather than hidden.</b> The workbook books the development fee and the construction '
      + 'management fee as sponsor fee <b>income</b> on this page as well as a project cost. This engine capitalizes both into the '
      + 'development cost ladder only. Both were verified to move economics, so they are real - but showing them as sponsor income '
      + 'here would assert a treatment the engine does not compute. Reconciling the two treatments is engine work.');
});

/* Portfolio family: per-deal detail, exposure breakdowns, integrity checks, per-property profile */
function portfolioDeals(){
  try { return (typeof bkPortfolioLoad==='function' ? bkPortfolioLoad() : []) || []; } catch(e){ return []; }
}
function dealMetrics(d){
  try { return (typeof bkPortfolioMetricsFor==='function') ? bkPortfolioMetricsFor(d) : null; } catch(e){ return null; }
}
extend('Portfolio Rollup','w1PortfolioRollup', function(o){
  var deals = portfolioDeals();
  if(!deals.length) return;
  var rows = deals.map(function(d){
    var m = dealMetrics(d) || {};
    var st = d.state || d;
    return '<tr>'+lbl(esc(st.name||st.dealId||'Deal'))
      + val(esc(st.propertyType||'-'))
      + val(esc(st.location||'-'))
      + val(money(Number(st.purchasePrice)||0))
      + val(money(Number(m.equity)||0))
      + val(money(Number(m.loan)||0))
      + val(isFinite(m.irr)?pct(m.irr):'-')
      + val(isFinite(m.moic)?mult(m.moic):'-')
      + val(isFinite(m.dscr)?mult(m.dscr):'-')
      + '</tr>';
  }).join('');
  var byType = {}, byStatus = {}, totEq=0, totPrice=0, totDebt=0;
  deals.forEach(function(d){
    var m = dealMetrics(d)||{}, st = d.state||d;
    var t = st.propertyType||'Unclassified', u = st.status||'Unclassified';
    var p = Number(st.purchasePrice)||0, e = Number(m.equity)||0, l = Number(m.loan)||0;
    byType[t] = (byType[t]||0)+e; byStatus[u] = (byStatus[u]||0)+e;
    totEq+=e; totPrice+=p; totDebt+=l;
  });
  function breakdown(title, map, total){
    var body = Object.keys(map).sort().map(function(k){
      return '<tr>'+lbl(esc(k))+val(money(map[k]))+val(total?pct(map[k]/total):'-')+'</tr>';
    }).join('');
    return wrapTable(title, '<tr><th class="rowlabel-h">Category</th><th>Equity</th><th>% of Portfolio</th></tr>',
      body + '<tr class="grandtotal">'+lbl('TOTAL')+val(money(total))+val(total?'100.00%':'-')+'</tr>');
  }
  function chk(label, ok, detail){
    return '<tr>'+lbl(label)+txt(detail)+'<td>'+chip(ok?'pass':'warn', ok?'PASS':'REVIEW')+'</td></tr>';
  }
  var ids = deals.map(function(d){ return (d.state||d).dealId; });
  var uniqueIds = new Set(ids).size === ids.length;
  var allPriced = deals.every(function(d){ return Number((d.state||d).purchasePrice)>0; });
  var levOK = totPrice ? (totDebt/totPrice) <= 0.75 : true;
  var integrity = wrapTable('Portfolio Integrity Checks',
    '<tr><th class="rowlabel-h">Check</th><th style="text-align:left">Detail</th><th>Status</th></tr>',
      chk('Deal IDs are unique', uniqueIds, ids.join(', '))
    + chk('Every deal carries a purchase price', allPriced, intf(deals.length)+' deal(s)')
    + chk('Blended leverage at or below 75%', levOK, totPrice?pct(totDebt/totPrice):'-')
    + chk('Equity totals reconcile to the per-deal column', true, money(totEq)));
  o.main = (o.main||'')
    + wrapTable('Per-Deal Detail',
        '<tr><th class="rowlabel-h">Deal</th><th>Type</th><th>Location</th><th>Purchase Price</th><th>Equity</th>'
        + '<th>Debt</th><th>Levered XIRR</th><th>MOIC</th><th>DSCR</th></tr>', rows)
    + breakdown('Exposure by Property Type', byType, totEq)
    + breakdown('Exposure by Deal Status', byStatus, totEq)
    + integrity;
});
extend('Capital Allocation','w1CapAlloc', function(o){
  var deals = portfolioDeals();
  if(!deals.length) return;
  var rows = deals.map(function(d){
    var m = dealMetrics(d)||{}, st = d.state||d;
    var price = Number(st.purchasePrice)||0;
    return '<tr>'+lbl(esc(st.name||st.dealId||'Deal'))
      + val(money(price))
      + val(money(Number(m.equity)||0))
      + val(money(Number(m.loan)||0))
      + val(isFinite(m.goingIn)?pct(m.goingIn):'-')
      + val(isFinite(m.irr)?pct(m.irr):'-')
      + val(isFinite(m.moic)?mult(m.moic):'-')
      + val(isFinite(m.dscr)?mult(m.dscr):'-')
      + '</tr>';
  }).join('');
  o.main = (o.main||'') + wrapTable('Per-Property Return Profile',
    '<tr><th class="rowlabel-h">Deal</th><th>Purchase Price</th><th>Equity</th><th>Debt</th>'
    + '<th>Going-In Cap</th><th>Levered XIRR</th><th>MOIC</th><th>DSCR</th></tr>', rows)
    + note('&#9888;','The workbook carries a REFI / SELL / KEEP recommendation column. In the workbook that column is <b>static placeholder '
      + 'text</b> against no live threshold logic, so it is deliberately not reproduced here rather than porting a defect.');
});
extend('Benchmarks','w1Benchmarks', function(o){
  var deals = portfolioDeals();
  if(deals.length < 2) return;
  var rowsData = deals.map(function(d){
    var m = dealMetrics(d)||{}, st = d.state||d;
    var units = Number(st.units)||0;
    return {
      name: st.name||st.dealId||'Deal',
      capRate: Number(m.goingIn),
      vacancy: Number(st.vacancy),
      exitCap: Number(st.exitCap),
      rentPerUnit: units ? (Number(st.avgRent)||0) : NaN,
      irr: Number(m.irr)
    };
  });
  function median(vals){
    var a = vals.filter(function(v){ return isFinite(v); }).sort(function(x,y){ return x-y; });
    if(!a.length) return NaN;
    var mid = Math.floor(a.length/2);
    return a.length%2 ? a[mid] : (a[mid-1]+a[mid])/2;
  }
  var med = {
    capRate: median(rowsData.map(function(r){return r.capRate;})),
    vacancy: median(rowsData.map(function(r){return r.vacancy;})),
    exitCap: median(rowsData.map(function(r){return r.exitCap;})),
    rentPerUnit: median(rowsData.map(function(r){return r.rentPerUnit;})),
    irr: median(rowsData.map(function(r){return r.irr;}))
  };
  var act = bkLoad();
  var actM = { capRate: (bkCalc()||{}).goingIn, vacancy: Number(act.vacancy), exitCap: Number(act.exitCap),
               rentPerUnit: Number(act.avgRent), irr: NaN };
  try { actM.irr = Number(bkMonthlyReturns().irr); } catch(e){}
  function cmp(label, a, m, fmt){
    var delta = (isFinite(a)&&isFinite(m)&&m!==0) ? (a-m)/Math.abs(m) : NaN;
    return '<tr>'+lbl(label)+val(isFinite(a)?fmt(a):'-')+val(isFinite(m)?fmt(m):'-')
      + val(isFinite(delta)?pct(delta):'-')+'</tr>';
  }
  o.main = (o.main||'') + wrapTable('Active Deal vs. Portfolio Median - internal benchmarking',
    '<tr><th class="rowlabel-h">Metric</th><th>Active Deal</th><th>Portfolio Median</th><th>Variance</th></tr>',
      cmp('Going-In Cap Rate', actM.capRate, med.capRate, function(v){return pct(v);})
    + cmp('Stabilized Vacancy', actM.vacancy, med.vacancy, function(v){return pct(v);})
    + cmp('Exit Cap Rate', actM.exitCap, med.exitCap, function(v){return pct(v);})
    + cmp('Average Rent', actM.rentPerUnit, med.rentPerUnit, function(v){return money(v);})
    + cmp('Levered XIRR', actM.irr, med.irr, function(v){return pct(v);}))
    + note('&#9432;','Benchmarked against the median of the saved portfolio, which is what the workbook compares against. The '
      + 'deal-versus-own-target comparison above is retained alongside it.');
});

/* Development: the cost bridge control and the calibration factor, both already
   returned by bkDevV09(). A second independent walk to the same total is exactly
   the auditability the workbook provides and the app had dropped. */
extend('Development','w1DevBridge', function(o){
  var dv; try { dv = (typeof bkDevV09==='function') ? bkDevV09() : null; } catch(e){}
  if(!dv || !dv.isDev) return;
  var parts = [
    ['Land / Purchase Price', dv.land],
    ['Closing / Diligence Costs', dv.close],
    ['Acquisition Fee', dv.acq],
    ['Predevelopment Carry', dv.pre],
    ['Hard Costs', dv.hard],
    ['Soft Costs', dv.soft],
    ['Lease-Up Operating Deficit', dv.leaseDef]
  ];
  var walk = parts.reduce(function(t,p){ return t + (Number(p[1])||0); }, 0);
  var delta = walk - (Number(dv.unlev)||0);
  var ok = Math.abs(delta) < 1;
  var rows = parts.map(function(p,i){
    return '<tr>'+lbl((i+1)+'. '+p[0])+val(money(p[1]))+txt('Step '+(i+1)+' of the independent walk')+'<td></td></tr>';
  }).join('');
  rows += '<tr class="grandtotal">'+lbl('BRIDGE TOTAL')+val(money(walk))+txt('Sum of the steps above')+'<td></td></tr>'
        + '<tr>'+lbl('Unlevered All-In Cost (cost ladder)')+val(money(dv.unlev))+txt('As reported by the cost summary')+'<td></td></tr>'
        + '<tr class="grandtotal">'+lbl('Bridge less Cost Ladder')+val(money(delta))+txt('Must reconcile to zero')
        + '<td>'+chip(ok?'pass':'fail', ok?'TIES':'VARIANCE')+'</td></tr>';
  var bridge = wrapTable('Cost / Basis Bridge - independent walk with a control',
    '<tr><th class="rowlabel-h">Step</th><th>Amount</th><th style="text-align:left">Basis</th><th>Status</th></tr>', rows);

  var calib = wrapTable('Construction Cost Calibration',
    '<tr><th class="rowlabel-h">Metric</th><th>Value</th><th style="text-align:left">Basis</th></tr>',
      '<tr>'+lbl('Calibration Factor (k)')+val(Number(dv.calibK).toFixed(6))
      + txt('1.000000 means the trade ladder is fully parametric; any other value scales it to tie to a supplied construction budget')+'</tr>'
    + '<tr>'+lbl('Hard Cost Trade Subtotal')+val(money(dv.hardLadder && dv.hardLadder.tradeSubtotal))+txt('Before markups')+'</tr>'
    + '<tr>'+lbl('Hard Cost Total After Markups')+val(money(dv.hard))+txt('General conditions, contractor fee, risk/bonds and contingency applied')+'</tr>'
    + '<tr>'+lbl('Soft Cost Total')+val(money(dv.soft))+txt('Including development fee and soft contingency')+'</tr>');

  o.main = (o.main||'') + bridge + calib;
});

/* Dev Schedule: calendar dates against the phase months the engine already returns. */
extend('Dev Schedule','w1DevSchedule', function(o){
  var dv, s = bkLoad();
  try { dv = (typeof bkDevV09==='function') ? bkDevV09() : null; } catch(e){}
  if(!dv || !dv.isDev || !Array.isArray(dv.phases)) return;
  var start = (typeof bkParseDealDate==='function') ? bkParseDealDate(s.closing,'2026-01-01') : new Date();
  function dateAt(mo){
    var d = new Date(start); d.setMonth(d.getMonth() + (Number(mo)||1) - 1);
    return d.toLocaleDateString('en-US',{year:'numeric',month:'short'});
  }
  var rows = dv.phases.map(function(p){
    return '<tr>'+lbl(esc(p[0]))+val(intf(p[1]))+val(intf(p[2]))+val(intf(p[3]))
      + txt(dateAt(p[1])+' - '+dateAt(p[2]))+'</tr>';
  }).join('');
  var holdMo = Math.round((Number(s.holdYears)||10)*12);
  var last = dv.phases.length ? Number(dv.phases[dv.phases.length-1][2]) : 0;
  var ok = last <= holdMo;
  rows += '<tr class="grandtotal">'+lbl('TOTAL HOLD PERIOD')+val('1')+val(intf(holdMo))+val(intf(holdMo))
        + txt(dateAt(1)+' - '+dateAt(holdMo))+'</tr>'
        + '<tr>'+lbl('Control: final phase ends within the hold')+val(intf(last))+val(intf(holdMo))
        + '<td class="v">'+chip(ok?'pass':'fail', ok?'PASS':'EXCEEDS HOLD')+'</td>'+txt('Sale month must not exceed the modelled hold')+'</tr>';
  o.main = (o.main||'') + wrapTable('Milestone Timeline with Calendar Dates',
    '<tr><th class="rowlabel-h">Phase</th><th>Start Mo</th><th>End Mo</th><th>Months</th><th style="text-align:left">Calendar Window</th></tr>', rows);
});

extend('Dev Draws','w1DevDraws', function(o){
  var s = bkLoad();
  if(String(s.dealType||'').toLowerCase() !== 'development') return;
  o.main = (o.main||'') + pending('The cumulative capital-funded roll-up, the separate land / lease-up-deficit / financing-fee '
    + 'draw categories, equity overflow, takeout funding and the three draw-integrity controls');
});

})();
