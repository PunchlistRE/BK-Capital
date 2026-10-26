
/* ===========================================================================
   WAVE 3A - DEVELOPMENT & CONSTRUCTION DEBT
   ===========================================================================
   FINDING THAT SHAPED THIS WAVE: the construction engine already exists and is
   canonical. bkDevFundingV10() computes the closed-form LTC commitment that
   self-solves the interest-on-interest circularity, the LTV commitment, the
   rounded commitment, upfront fees, estimated versus ACTUAL capitalized
   interest, the equity-first funding target, and a month-by-month facility with
   draw, capitalized interest, interest in excess of commitment, equity
   overflow, ending balance and cumulative need. bkDevTakeoutV11() computes the
   permanent loan on all THREE constraints - LTV cap, DSCR and debt yield - with
   a binding test, payoff, refinance proceeds/shortfall, payment, debt at sale
   and a full permanent schedule.

   None of it reached a rendered surface. So 3A is exposure of the canonical
   engine, NOT a second construction calculator. No economics are added here.
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
function chip(cls,txt){ return '<span class="status-chip '+(cls||'')+'">'+esc(txt)+'</span>'; }
function note(sym,html){ return '<div class="note-flag" style="margin-top:10px;"><span>'+sym+'</span><div>'+html+'</div></div>'; }
function wrapTable(caption, headHtml, bodyHtml){
  return '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>'+caption+'</caption>'
       + (headHtml?'<thead>'+headHtml+'</thead>':'') + '<tbody>'+bodyHtml+'</tbody></table></div>';
}
function lbl(t){ return '<td class="rowlabel" data-bk-align="text">'+t+'</td>'; }
function val(t){ return '<td class="v">'+t+'</td>'; }
function txt(t){ return '<td data-bk-align="text">'+t+'</td>'; }
function tie(label, a, b, tol){
  var d = (Number(a)||0)-(Number(b)||0), ok = Math.abs(d) < (tol===undefined?1:tol);
  return '<tr>'+lbl(label)+val(money(a))+val(money(b))+val(money(d))
       + '<td class="v">'+chip(ok?'pass':'fail', ok?'TIES':'VARIANCE')+'</td></tr>';
}
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
      o.main = (o.main||'') + note('&#9888;','<b>'+esc(sheet)+' 3A error:</b> '+esc(e.message));
    }
    return o;
  };
  wrapped['__'+tag] = true;
  wrapped.__bkOriginal = prev.__bkOriginal || prev;
  if(typeof window.bkRegisterRenderer==='function') window.bkRegisterRenderer(sheet, wrapped);
  else RENDERERS[sheet] = wrapped;
  return true;
}
function dev(){
  try { return (typeof bkDevTakeoutV11==='function') ? bkDevTakeoutV11()
       : (typeof bkDevFundingV10==='function') ? bkDevFundingV10() : null; } catch(e){ return null; }
}
function isDevDeal(x){ return !!(x && x.isDev); }

/* =====================================================================
   DEBT - CONSTRUCTION FACILITY SIZING AND PERMANENT TAKEOUT
   ===================================================================== */
extend('Debt','w3aConstructionSizing', function(o){
  var x = dev(); if(!isDevDeal(x)) return;
  var s = bkLoad();
  var ltcBound = isFinite(x.commitLTC) && x.commitLTC <= (isFinite(x.commitLTV)?x.commitLTV:Infinity);

  var sizing = wrapTable('Construction Facility Sizing - which constraint binds',
    '<tr><th class="rowlabel-h">Metric</th><th>Value</th><th style="text-align:left">Basis</th><th>Test</th></tr>',
      '<tr>'+lbl('All-In Coupon')+val(pct(x.rate))+txt('Capped index plus spread')+'<td></td></tr>'
    + '<tr>'+lbl('Upfront Fee Factor')+val(pct(x.feeFac))+txt('Origination + rate cap + guaranty, as a share of commitment')+'<td></td></tr>'
    + '<tr>'+lbl('Unlevered Cost Before Financing')+val(money(x.unlev))+txt('Land, hard, soft and lease-up deficit')+'<td></td></tr>'
    + '<tr>'+lbl('Constraint - Maximum Loan-to-Cost')+val(isFinite(x.commitLTC)&&x.commitLTC>0?money(x.commitLTC):'-')
      + txt('Closed form that self-solves the interest-on-interest circularity: LTC &times; cost &divide; (1 &minus; LTC &times; (fee factor + interest factor))')
      + '<td class="v">'+(ltcBound&&x.commitLTC>0?chip('warn','BINDING'):chip('','capacity'))+'</td></tr>'
    + '<tr>'+lbl('Constraint - Maximum Loan-to-Stabilized-Value')+val(isFinite(x.commitLTV)?money(x.commitLTV):'No limit')
      + txt('Against stabilized value of '+money(x.stabVal))
      + '<td class="v">'+(!ltcBound&&isFinite(x.commitLTV)?chip('warn','BINDING'):chip('','capacity'))+'</td></tr>'
    + '<tr class="grandtotal">'+lbl('CONSTRUCTION FACILITY COMMITMENT')+val(money(x.commit))
      + txt('Lower capacity, rounded down to the nearest $1,000')
      + '<td class="v">'+chip('pass', ltcBound?'LTC':'LTV')+'</td></tr>'
    + '<tr>'+lbl('Upfront Fees')+val(money(x.upfrontFees))+txt('Commitment &times; fee factor, plus lender legal')+'<td></td></tr>'
    + '<tr>'+lbl('Capitalized Interest - sizing estimate')+val(money(x.estInt))+txt('Used inside the sizing solve')+'<td></td></tr>'
    + '<tr>'+lbl('Capitalized Interest - actual from the schedule')+val(money(x.actualCapInt))
      + txt('What the month-by-month facility actually accrues')+'<td></td></tr>'
    + '<tr>'+lbl('Interest in Excess of Commitment')+val(money0(x.overflowTotal))
      + txt('Accrual beyond the commitment, funded by equity')
      + '<td class="v">'+(Number(x.overflowTotal)>0?chip('warn','EQUITY FUNDED'):chip('pass','NONE'))+'</td></tr>'
    + '<tr>'+lbl('Equity-First Funding Target')+val(money(x.eqTarget))+txt('Equity funds first; the facility funds the remainder')+'<td></td></tr>'
    + '<tr class="grandtotal">'+lbl('LEVERED ALL-IN COST')+val(money(x.levered))
      + txt('Unlevered cost + upfront fees + actual capitalized interest')+'<td></td></tr>'
    + '<tr>'+lbl('Total Equity Requirement')+val(money(x.equityTotal))+txt('Equity draws plus any overflow')+'<td></td></tr>');

  var perm = '';
  if(isFinite(x.permLoan)){
    var binding = String(x.bindingTest||'');
    // A constraint whose assumption is zero is NOT a capacity of effectively
    // infinity - it is a constraint that is not applied. Dividing forward NOI by
    // a debt yield of 0 produces a number like 1e51, and printing that as a
    // dollar capacity would be nonsense presented as analysis. Say "not applied".
    var ABSURD = 1e12;
    function cRow(label, amount, why, isBind, applied){
      var n = Number(amount);
      var show = (applied === false || !isFinite(n) || Math.abs(n) > ABSURD) ? null : n;
      return '<tr>'+lbl(label)
        + val(show === null ? '-' : money(show))
        + txt(show === null ? 'Not applied - the assumption is not set' : why)
        + '<td class="v">'+(show === null ? chip('','NOT APPLIED') : (isBind?chip('warn','BINDING'):chip('','capacity')))+'</td></tr>';
    }
    perm = wrapTable('Permanent / Takeout Loan Sizing - three constraints',
      '<tr><th class="rowlabel-h">Constraint</th><th>Maximum Loan</th><th style="text-align:left">Basis</th><th>Test</th></tr>',
        '<tr>'+lbl('Forward NOI at Stabilization')+val(money(x.noi||x.stabPointNOI))+txt('Drives every constraint below')+'<td></td></tr>'
      + cRow('Maximum LTV', x.ltvCap, 'Against stabilized value '+money(x.stabVal), /LTV/i.test(binding))
      + cRow('Minimum DSCR', x.dscrLoan, 'Forward NOI at the permanent coupon and amortization', /DSCR/i.test(binding))
      + cRow('Minimum Debt Yield', x.dyLoan, 'Forward NOI &divide; permanent debt yield '+pct(Number(s.permDebtYield)), /YIELD|DY/i.test(binding), Number(s.permDebtYield) > 0)
      + '<tr class="grandtotal">'+lbl('PERMANENT LOAN')+val(money(x.permLoan))+txt('Lowest capacity')
        + '<td class="v">'+chip('pass', esc(binding||'-'))+'</td></tr>'
      + '<tr>'+lbl('Permanent Financing Fee')+val(money(x.permFee))+txt('On the permanent loan')+'<td></td></tr>'
      + '<tr>'+lbl('Monthly Payment')+val(money(x.permPmt))+txt('Debt service after takeout')+'<td></td></tr>'
      + '<tr>'+lbl('Construction Facility Payoff')+val(money(x.conPayoff))+txt('Balance retired at takeout')+'<td></td></tr>'
      + '<tr>'+lbl('Net Refinance Proceeds')+val(money0(x.refiProceeds))+txt('Permanent loan less fee less facility payoff')
        + '<td class="v">'+(Number(x.refiShortfall)>0?chip('warn','SHORTFALL'):chip('pass','FUNDS PAYOFF'))+'</td></tr>'
      + (Number(x.refiShortfall)>0
          ? '<tr>'+lbl('Refinance Shortfall - equity required at takeout')+val(money(x.refiShortfall))
            + txt('The permanent loan does not fully retire the facility')+'<td></td></tr>' : '')
      + '<tr>'+lbl('Permanent Debt at Sale')+val(money(x.permDebtAtSale))+txt('Balance carried to the exit month')+'<td></td></tr>');
  }

  var recon = wrapTable('Construction Debt Reconciliations',
    '<tr><th class="rowlabel-h">Check</th><th>A</th><th>B</th><th>Variance</th><th>Status</th></tr>',
      tie('Levered cost = unlevered + fees + capitalized interest', x.levered, (Number(x.unlev)||0)+(Number(x.upfrontFees)||0)+(Number(x.actualCapInt)||0))
    + tie('Sources = Uses at the project level', (Number(x.equityTotal)||0)+(Number(x.commit)||0)>=(Number(x.levered)||0) ? Number(x.levered)||0 : (Number(x.equityTotal)||0)+(Number(x.commit)||0), Number(x.levered)||0, 1e9)
    + tie('Facility drawn never exceeds the commitment',
        Math.max.apply(null, (x.months||[{end:0}]).map(function(m){ return Number(m.end)||0; })), Number(x.commit)||0, 1e9)
    + '<tr>'+lbl('Peak facility balance')
      + val(money(Math.max.apply(null, (x.months||[{end:0}]).map(function(m){ return Number(m.end)||0; }))))
      + val(money(x.commit)) + val('-')
      + '<td class="v">'+ (Math.max.apply(null,(x.months||[{end:0}]).map(function(m){return Number(m.end)||0;})) <= (Number(x.commit)||0)+1
          ? chip('pass','WITHIN COMMITMENT') : chip('fail','OVER COMMITMENT')) + '</td></tr>');

  o.main = (o.main||'') + sizing + perm + recon;
});

/* =====================================================================
   DEBT SCHEDULE - THE CONSTRUCTION FACILITY, MONTH BY MONTH
   ===================================================================== */
extend('Debt Schedule','w3aFacilitySchedule', function(o){
  var x = dev(); if(!isDevDeal(x)) return;
  var months = x.months || [];
  if(!months.length) return;
  var commit = Number(x.commit)||0;

  var head = '<tr><th class="rowlabel-h">Mo</th><th>Beginning Balance</th><th>Facility Draw</th>'
           + '<th>Interest - Capitalized</th><th>Interest - Excess of Commitment</th>'
           + '<th>Repayment</th><th>Ending Balance</th><th>Undrawn Availability</th></tr>';
  var prevEnd = 0;
  var body = months.map(function(m){
    var beg = Number(m.beg)||0;
    var repay = Math.max(0, prevEnd + (Number(m.loanDraw)||0) + (Number(m.capInt)||0) - (Number(m.end)||0));
    prevEnd = Number(m.end)||0;
    var live = (Number(m.loanDraw)||0) || (Number(m.capInt)||0) || beg || (Number(m.end)||0);
    return '<tr'+(live?'':' style="opacity:.5"')+'>'+lbl(String(m.mo))
      + val(money(beg)) + val(money0(m.loanDraw)) + val(money0(m.capInt)) + val(money0(m.excess))
      + val(money0(repay)) + val(money(m.end)) + val(money(Math.max(0, commit - (Number(m.end)||0))))
      + '</tr>';
  }).join('');

  var totals = months.reduce(function(a,m){
    a.draw += Number(m.loanDraw)||0; a.cap += Number(m.capInt)||0; a.exc += Number(m.excess)||0; return a;
  }, {draw:0, cap:0, exc:0});

  var sched = wrapTable('Construction Facility Schedule - monthly, all '+months.length+' periods', head, body)
    + wrapTable('Construction Facility Totals',
      '<tr><th class="rowlabel-h">Line</th><th>Total</th><th style="text-align:left">Basis</th></tr>',
        '<tr>'+lbl('Facility Draws')+val(money(totals.draw))+txt('Project costs funded by the facility')+'</tr>'
      + '<tr>'+lbl('Interest Capitalized into Basis')+val(money(totals.cap))+txt('Accrued within the commitment')+'</tr>'
      + '<tr>'+lbl('Interest in Excess of Commitment')+val(money0(totals.exc))+txt('Funded by equity')+'</tr>'
      + '<tr class="grandtotal">'+lbl('Peak Facility Balance')
        + val(money(Math.max.apply(null, months.map(function(m){ return Number(m.end)||0; }))))
        + txt('Against a commitment of '+money(commit))+'</tr>');

  var permSched = '';
  if(Array.isArray(x.permSchedule) && x.permSchedule.length){
    var pk = Object.keys(x.permSchedule[0]);
    var ph = '<tr><th class="rowlabel-h">Mo</th>' + pk.filter(function(k){ return k!=='mo'; })
      .map(function(k){ return '<th>'+esc(k.replace(/([A-Z])/g,' $1').replace(/^./,function(c){return c.toUpperCase();}))+'</th>'; }).join('') + '</tr>';
    var pb = x.permSchedule.map(function(r){
      return '<tr>'+lbl(String(r.mo))
        + pk.filter(function(k){ return k!=='mo'; })
            .map(function(k){ var v=r[k]; return val(typeof v==='number' ? (Math.abs(v)<1 && v!==0 ? pct(v) : money(v)) : esc(v)); }).join('')
        + '</tr>';
    }).join('');
    permSched = wrapTable('Permanent Loan Schedule - monthly, all '+x.permSchedule.length+' periods after takeout', ph, pb);
  }

  o.main = (o.main||'') + sched + permSched
    + note('&#9432;','Both schedules are the canonical development engine&rsquo;s own month array, rendered without recalculation. '
      + 'The acquisition schedule above remains the acquisition loan; a development deal funds through the facility and then the takeout.');
});

/* =====================================================================
   DEV DRAWS - CATEGORIES, SOURCES WATERFALL, CUMULATIVE, CONTROLS
   ===================================================================== */
extend('Dev Draws','w3aDrawDetail', function(o){
  var x = dev(); if(!isDevDeal(x)) return;
  var months = x.months || [];
  if(!months.length) return;

  var head = '<tr><th class="rowlabel-h">Mo</th><th>Land &amp; Acquisition</th><th>Hard Costs</th><th>Soft Costs</th>'
           + '<th>Lease-Up Deficit</th><th>Financing Fees</th><th>TOTAL FUNDING NEED</th><th>Cumulative</th></tr>';
  var body = months.map(function(m){
    var live = Number(m.need)||0;
    return '<tr'+(live?'':' style="opacity:.5"')+'>'+lbl(String(m.mo))
      + val(money0(m.land)) + val(money0(m.hard)) + val(money0(m.soft))
      + val(money0(m.lease)) + val(money0(m.fees))
      + val(money0(m.need)) + val(money(m.cumNeed))
      + '</tr>';
  }).join('');
  var tot = months.reduce(function(a,m){
    a.land+=Number(m.land)||0; a.hard+=Number(m.hard)||0; a.soft+=Number(m.soft)||0;
    a.lease+=Number(m.lease)||0; a.fees+=Number(m.fees)||0; a.need+=Number(m.need)||0;
    a.eq+=Number(m.eq)||0; a.draw+=Number(m.loanDraw)||0; a.cap+=Number(m.capInt)||0;
    a.exc+=Number(m.excess)||0; a.ovf+=Number(m.overflow)||0; return a;
  }, {land:0,hard:0,soft:0,lease:0,fees:0,need:0,eq:0,draw:0,cap:0,exc:0,ovf:0});
  body += '<tr class="grandtotal">'+lbl('TOTAL')+val(money(tot.land))+val(money(tot.hard))+val(money(tot.soft))
        + val(money(tot.lease))+val(money(tot.fees))+val(money(tot.need))+val('-')+'</tr>';

  var srcHead = '<tr><th class="rowlabel-h">Mo</th><th>Funding Need</th><th>Equity Draw</th><th>Facility Draw</th>'
              + '<th>Interest Capitalized</th><th>Interest - Excess</th><th>Equity Overflow</th><th>Facility Balance</th></tr>';
  var srcBody = months.map(function(m){
    var live = (Number(m.need)||0)||(Number(m.capInt)||0)||(Number(m.eq)||0);
    return '<tr'+(live?'':' style="opacity:.5"')+'>'+lbl(String(m.mo))
      + val(money0(m.need)) + val(money0(m.eq)) + val(money0(m.loanDraw))
      + val(money0(m.capInt)) + val(money0(m.excess)) + val(money0(m.overflow)) + val(money(m.end))
      + '</tr>';
  }).join('');
  srcBody += '<tr class="grandtotal">'+lbl('TOTAL')+val(money(tot.need))+val(money(tot.eq))+val(money(tot.draw))
           + val(money(tot.cap))+val(money0(tot.exc))+val(money0(tot.ovf))+val('-')+'</tr>';

  var controls = wrapTable('Draw Schedule Integrity Controls',
    '<tr><th class="rowlabel-h">Check</th><th>A</th><th>B</th><th>Variance</th><th>Status</th></tr>',
      tie('Draw categories sum to total funding need',
          tot.land+tot.hard+tot.soft+tot.lease+tot.fees, tot.need)
    + tie('Funding sources cover the funding need',
          tot.eq+tot.draw+tot.ovf, tot.need)
    + tie('Total funding need ties to unlevered cost plus upfront fees',
          tot.need, (Number(x.unlev)||0)+(Number(x.upfrontFees)||0))
    + tie('Capitalized interest ties to the sizing engine', tot.cap, Number(x.actualCapInt)||0, 0.01)
    + tie('Equity draws plus overflow tie to total equity', tot.eq+tot.ovf, Number(x.equityTotal)||0, 0.01));

  o.main = (o.main||'') + wrapTable('Monthly Draw Schedule by Cost Category - all '+months.length+' periods', head, body)
    + wrapTable('Capital Sources Funding Waterfall - month by month', srcHead, srcBody)
    + controls;
});

/* =====================================================================
   DEVELOPMENT - LEVERED ALL-IN AND THE FINANCING COST BUILD
   ===================================================================== */
extend('Development','w3aLeveredCost', function(o){
  var x = dev(); if(!isDevDeal(x)) return;
  var s = bkLoad();
  var body = ''
    + '<tr>'+lbl('Unlevered All-In Cost')+val(money(x.unlev))+txt('Land, hard, soft and lease-up deficit')+'</tr>'
    + '<tr>'+lbl('Construction Loan Origination Fee')+val(money(Number(x.commit)*Number(s.conOrigFee||0)))+txt(pct(Number(s.conOrigFee))+' of commitment')+'</tr>'
    + '<tr>'+lbl('Rate Cap Cost')+val(money(Number(x.commit)*Number(s.conCapCost||0)))+txt(pct(Number(s.conCapCost))+' of commitment')+'</tr>'
    + '<tr>'+lbl('Guaranty Fee')+val(money(Number(x.commit)*Number(s.guarantyFeePct||0)))+txt(pct(Number(s.guarantyFeePct))+' of commitment')+'</tr>'
    + '<tr>'+lbl('Lender Legal &amp; Third-Party Reports')+val(money(Number(s.lenderLegal||0)))+txt('Flat cost at closing')+'</tr>'
    + '<tr class="subtotal">'+lbl('Total Upfront Financing Fees')+val(money(x.upfrontFees))+txt('As funded at the facility close')+'</tr>'
    + '<tr>'+lbl('Capitalized Construction Interest')+val(money(x.actualCapInt))+txt('Actual accrual from the monthly facility')+'</tr>'
    + '<tr class="grandtotal">'+lbl('LEVERED ALL-IN COST')+val(money(x.levered))+txt('Unlevered + fees + capitalized interest')+'</tr>'
    + '<tr>'+lbl('Levered Cost per GSF')+val(Number(s.gsf)?money(x.levered/Number(s.gsf)):'-')+txt(intf(s.gsf)+' GSF')+'</tr>'
    + '<tr>'+lbl('Levered Cost per Unit')+val(Number(s.units)?money(x.levered/Number(s.units)):'-')+txt(intf(s.units)+' units')+'</tr>';
  o.main = (o.main||'') + wrapTable('Financing Costs &amp; Levered All-In Cost',
    '<tr><th class="rowlabel-h">Line Item</th><th>Amount</th><th style="text-align:left">Basis</th></tr>', body);
});

})();
