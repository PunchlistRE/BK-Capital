
/* ===========================================================================
   WAVE 2C - PRESENTATION AND COMPLETENESS
   ===========================================================================
   Closes the discrete presentation defects on the register and the remaining
   completeness items that need no engine change. Still exposure only: every
   figure comes from a canonical engine output or from data already in state.

   NOT in scope here, deliberately: the app-wide formatting normalisation. That
   was sequenced to follow functional parity and functional parity is not
   complete. Everything rendered here follows the interim convention.
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
      o.main = (o.main||'') + note('&#9888;','<b>'+esc(sheet)+' presentation error:</b> '+esc(e.message));
    }
    return o;
  };
  wrapped['__'+tag] = true;
  wrapped.__bkOriginal = prev.__bkOriginal || prev;
  if(typeof window.bkRegisterRenderer==='function') window.bkRegisterRenderer(sheet, wrapped);
  else RENDERERS[sheet] = wrapped;
  return true;
}

/* =====================================================================
   1. DEBT - ONE SIZING SURFACE
   The page carried the same sizing twice: "Sizing Constraints - Which One
   Binds" and the older "Acquisition Loan - Constraint Sizing". This keeps
   ONE sizing table and ONE capital-structure table, and reduces the older
   table to the three facts neither of them carries - rate type, effective
   coupon and monthly payment - retitled so it no longer reads as a second
   sizing. Nothing about bkDebt() changes; this is presentation only.
   ===================================================================== */
extend('Debt','w2cDebtConsolidate', function(o){
  if(!o.main) return;
  var doc = new DOMParser().parseFromString('<div id="r">'+o.main+'</div>','text/html');
  var root = doc.getElementById('r');
  var tables = [].slice.call(root.querySelectorAll('table'));
  var dup = tables.filter(function(t){
    var c = t.querySelector('caption');
    return c && /Acquisition Loan\s*[--]\s*Constraint Sizing/i.test(c.textContent);
  })[0];
  if(!dup) return;
  // rows whose content is already presented by the two canonical tables
  var REDUNDANT = /Max LTV|Max LTC|Min DSCR Constraint|ACQUISITION LOAN AMOUNT|Origination Fee|Going-In DSCR|Actual LTV/i;
  var kept = 0;
  [].slice.call(dup.querySelectorAll('tbody tr')).forEach(function(tr){
    var label = (tr.querySelector('td') || {}).textContent || '';
    if(REDUNDANT.test(label)) tr.parentNode.removeChild(tr); else kept++;
  });
  var cap = dup.querySelector('caption');
  if(kept === 0){ dup.parentNode.removeChild(dup); }
  else if(cap){ cap.textContent = 'Acquisition Loan Terms'; var hh=dup.querySelectorAll('thead th'); if(hh.length===3){ hh[0].textContent='Term'; hh[1].textContent='Amount ($)'; hh[2].textContent='Basis'; } }
  o.main = root.innerHTML
    + note('&#9432;','<b>Sizing presentation consolidated.</b> The loan is sized once, on <b>Sizing Constraints - Which One Binds</b>, '
      + 'and its result is presented once, on <b>Resulting Capital Structure</b>. The rows that used to repeat that sizing a second time have '
      + 'been removed; only the loan terms neither table carried are retained. No sizing logic changed.');
});

/* =====================================================================
   2. HOME - MODULE STATUS READOUT
   ===================================================================== */
extend('Home','w2cModuleStatus', function(o){
  var s = bkLoad(), d = null, rdy = null;
  try { d = bkDebt(); } catch(e){}
  try { rdy = (typeof bkDealReadiness==='function') ? bkDealReadiness() : null; } catch(e){}
  var isDev = String(s.dealType||'').toLowerCase()==='development';
  var refi  = !!(Number(s.refiAtMaturity) || Number(s.refiAtStab));
  var hasRR = Array.isArray(s.rentRoll) && s.rentRoll.length>0;
  var basis = String(s.hurdleBasis||'1')==='2' ? 'Equity Multiple' : 'IRR';
  function row(label, on, detail){
    return '<tr>'+lbl(label)+'<td class="v">'+chip(on?'pass':'', on?'ON':'OFF')+'</td>'+txt(detail)+'</tr>';
  }
  o.main = (o.main||'') + wrapTable('Module Status',
    '<tr><th class="rowlabel-h">Module</th><th>State</th><th style="text-align:left">Detail</th></tr>',
      '<tr>'+lbl('Deal Type')+'<td class="v">'+chip('', isDev?'DEVELOPMENT':'ACQUISITION')+'</td>'
        + txt(isDev?'Development engine, draws and schedule apply':'Acquisition basis; development pages are not applicable')+'</tr>'
    + row('Development Engine', isDev, isDev?'Cost ladder, draw schedule and milestones active':'Not applicable to an acquisition')
    + row('Acquisition Debt', !!(d && d.debtEnabled !== false && d.loan > 0), d ? ('Sized at '+money(d.loan)+', binding on '+esc(d.binding||'-')) : 'Debt engine unavailable')
    + row('Refinance / Permanent', refi, refi?'A refinance is modelled during the hold':'Loan held to sale')
    + row('Revenue from Rent Roll', hasRR, hasRR?(s.rentRoll.length+' unit(s) drive revenue'):'Flat average-rent inputs drive revenue')
    + '<tr>'+lbl('Waterfall Hurdle Basis')+'<td class="v">'+chip('', basis)+'</td>'
        + txt('Tier hurdles are tested on '+(basis==='IRR'?'compounding IRR':'equity multiple'))+'</tr>'
    + row('After-Tax Module', !!(s.deprSettings || s.depreciation), 'Depreciation, recapture and capital gains')
    + '<tr>'+lbl('Cash-Flow Engine')+'<td class="v">'
        + chip(rdy && rdy.state==='INVESTMENT READY' ? 'pass' : 'warn', rdy ? esc(rdy.state) : 'UNKNOWN')+'</td>'
        + txt(rdy && rdy.blockers && rdy.blockers.length ? esc(rdy.blockers.slice(0,2).join('; ')) : 'All required inputs present')+'</tr>');
});

/* =====================================================================
   3. DEV SCHEDULE - QUARTERLY PHASE BAR
   ===================================================================== */
extend('Dev Schedule','w2cGantt', function(o){
  var dv, s = bkLoad();
  try { dv = (typeof bkDevV09==='function') ? bkDevV09() : null; } catch(e){}
  if(!dv || !dv.isDev || !Array.isArray(dv.phases) || !dv.phases.length) return;
  var holdMo = Math.round((Number(s.holdYears)||10)*12);
  var lastMo = dv.phases.reduce(function(m,p){ return Math.max(m, Number(p[2])||0); }, holdMo);
  var quarters = Math.min(60, Math.ceil(lastMo/3));
  var head = '<tr><th class="rowlabel-h">Phase</th>';
  for(var q=1;q<=quarters;q++){
    var y = Math.ceil(q/4), qq = ((q-1)%4)+1;
    head += '<th style="padding:2px 3px;font-size:9px">'+(qq===1?('Y'+y+'<br>'):'')+'Q'+qq+'</th>';
  }
  head += '</tr>';
  var body = dv.phases.map(function(p){
    var a = Number(p[1])||1, b = Number(p[2])||1;
    var cells = '';
    for(var q=1;q<=quarters;q++){
      var qs = (q-1)*3+1, qe = q*3;
      var on = (b >= qs && a <= qe);
      cells += '<td class="v" style="padding:2px 3px;color:'+(on?'var(--gid-color,#2E6E6E)':'transparent')+'">&#9608;</td>';
    }
    return '<tr>'+lbl(esc(p[0]))+cells+'</tr>';
  }).join('');
  o.main = (o.main||'') + wrapTable('Phase Timeline - by quarter', head, body)
    + note('&#9432;','Drawn from the same phase months shown above - a picture of the schedule, not a second calculation.');
});

/* =====================================================================
   4. SOURCES & USES - PER UNIT AND PER SF, AND THE LP / GP EQUITY SPLIT
   ===================================================================== */
extend('Sources & Uses','w2cPerUnit', function(o){
  var s = bkLoad(), d, w = null;
  try { d = bkDebt(); } catch(e){ return; }
  try { w = bkWaterfallV07(); } catch(e){}
  var units = Number(s.units)||0, gsf = Number(s.gsf)||0;
  var price = Number(s.purchasePrice)||0;
  var closing = price*Number(s.closingCostsPct||0);
  var acqFee = price*(typeof bkAcqFeePct==='function' ? bkAcqFeePct(s) : Number(s.acqFeePct||0));
  var uses = [['Purchase Price', price], ['Closing / Diligence Costs', closing],
              ['Acquisition Fee', acqFee], ['Loan Origination Fee', Number(d.fee)||0]];
  var totalUses = uses.reduce(function(t,u){ return t+u[1]; },0);
  function r3(label, amt, cls){
    return '<tr'+(cls?' class="'+cls+'"':'')+'>'+lbl(label)+val(money(amt))
      + val(units?money(amt/units):'-') + val(gsf?money(amt/gsf):'-')
      + val(totalUses?pct(amt/totalUses):'-')+'</tr>';
  }
  var usesBody = uses.map(function(u){ return r3(u[0], u[1]); }).join('')
               + r3('TOTAL USES', totalUses, 'grandtotal');

  var lpEq = null, gpEq = null;
  if(w && w.lp && w.gp){
    lpEq = Math.abs(Number(w.lp.contrib) || 0) || null;
    gpEq = Math.abs(Number(w.gp.contrib) || 0) || null;
  }
  if(lpEq === null || gpEq === null){
    var share = Number(s.gpShare); if(!isFinite(share)) share = 0.5;
    gpEq = (Number(d.equity)||0) * share; lpEq = (Number(d.equity)||0) - gpEq;
  }
  var srcBody = r3('Acquisition Loan', Number(d.loan)||0)
              + r3('LP Equity', lpEq)
              + r3('GP Equity', gpEq)
              + r3('TOTAL SOURCES', (Number(d.loan)||0)+lpEq+gpEq, 'grandtotal');

  o.main = (o.main||'') + wrapTable('Uses - total, per unit, per SF, and as a share',
      '<tr><th class="rowlabel-h">Use</th><th class="v">Total ($)</th><th class="v">$/unit</th><th class="v">$/SF</th><th class="v">% of Uses</th></tr>', usesBody)
    + wrapTable('Sources - total, per unit, per SF, and as a share',
      '<tr><th class="rowlabel-h">Source</th><th class="v">Total ($)</th><th class="v">$/unit</th><th class="v">$/SF</th><th class="v">% of Uses</th></tr>', srcBody)
    + note('&#9432;','The LP and GP equity split comes from the canonical waterfall engine&rsquo;s partner contributions where a waterfall '
      + 'is modelled, and otherwise from the GP equity share assumption. It is not a new calculation.');
});

/* =====================================================================
   5. OPERATING UNDERWRITE - the commercial vacancy line bkCalc already returns
   ===================================================================== */
extend('Operating Underwrite','w2cCommVac', function(o){
  var c = bkCalc();
  if(!o.main) return;
  if(!isFinite(c.commercialVac)) return;
  // Insert immediately after the recoveries row in the Year-1 revenue table.
  var doc = new DOMParser().parseFromString('<div id="r">'+o.main+'</div>','text/html');
  var root = doc.getElementById('r');
  var rows = [].slice.call(root.querySelectorAll('tbody tr'));
  var anchor = rows.filter(function(tr){ return /Expense Recoveries/i.test(tr.textContent); })[0];
  if(!anchor) return;
  if(/Commercial Vacancy/i.test(root.textContent)) return;
  var cells = anchor.children.length;
  var tr = doc.createElement('tr');
  var html = '<td class="rowlabel" data-bk-align="text">Less: Commercial Vacancy / Credit Loss</td>'
           + '<td class="v">'+money(c.commercialVac)+'</td>';
  for(var i=2;i<cells;i++) html += '<td class="v">'+(c.gpr?pct(Math.abs(c.commercialVac)/c.gpr):'-')+'</td>';
  tr.innerHTML = html;
  anchor.parentNode.insertBefore(tr, anchor.nextSibling);
  o.main = root.innerHTML;
});

/* =====================================================================
   6. RENT ROLL - loss to lease, WALT, rent per SF, physical occupancy
   All derived from the rent roll rows already in state, exactly as the
   lease-expiration table is.
   ===================================================================== */
extend('Rent Roll','w2cRRStats', function(o){
  var s = bkLoad(), rr = Array.isArray(s.rentRoll) ? s.rentRoll : [];
  if(!rr.length) return;
  var stats; try { stats = bkRentRollStats(rr); } catch(e){ return; }
  var start = (typeof bkParseDealDate==='function') ? bkParseDealDate(s.closing,'2026-01-01') : new Date();
  var occ = rr.filter(function(u){ return u.status==='Occupied'; });
  var occSF = occ.reduce(function(t,u){ return t + (Number(u.sf)||0); },0);
  var allSF = rr.reduce(function(t,u){ return t + (Number(u.sf)||0); },0);
  var inPlaceAnn = occ.reduce(function(t,u){ return t + (Number(u.inPlaceRent)||0)*12; },0);
  var marketAnn  = occ.reduce(function(t,u){ return t + (Number(u.marketRent)||0)*12; },0);
  var ltl = marketAnn - inPlaceAnn;
  // WALT weighted by in-place rent, in years from the deal start
  var wsum = 0, wden = 0;
  occ.forEach(function(u){
    if(!u.leaseEnd) return;
    var e = new Date(u.leaseEnd); if(isNaN(e.getTime())) return;
    var mo = (e.getFullYear()-start.getFullYear())*12 + (e.getMonth()-start.getMonth());
    var wgt = (Number(u.inPlaceRent)||0)*12;
    if(mo > 0 && wgt > 0){ wsum += mo*wgt; wden += wgt; }
  });
  var walt = wden ? (wsum/wden)/12 : NaN;
  o.main = (o.main||'') + wrapTable('Rent Roll Analytics - derived from the rows above',
    '<tr><th class="rowlabel-h">Metric</th><th>Value</th><th style="text-align:left">Basis</th></tr>',
      '<tr>'+lbl('Physical Occupancy - by unit')+val(rr.length?pct(occ.length/rr.length):'-')
        + txt(intf(occ.length)+' of '+intf(rr.length)+' units or suites occupied')+'</tr>'
    + '<tr>'+lbl('Physical Occupancy - by area')+val(allSF?pct(occSF/allSF):'-')
        + txt(intf(occSF)+' of '+intf(allSF)+' SF occupied')+'</tr>'
    + '<tr>'+lbl('In-Place Rent - occupied, annual')+val(money(inPlaceAnn))+txt('Contract rent on occupied space')+'</tr>'
    + '<tr>'+lbl('Market Rent - occupied, annual')+val(money(marketAnn))+txt('Market rent on the same space')+'</tr>'
    + '<tr class="grandtotal">'+lbl('Loss to Lease')+val(money(ltl))
        + txt(marketAnn ? pct(ltl/marketAnn)+' of market rent' : 'No market rents entered')+'</tr>'
    + '<tr>'+lbl('Average In-Place Rent per SF - annual')+val(occSF?money(inPlaceAnn/occSF):'-')+txt('Occupied area basis')+'</tr>'
    + '<tr>'+lbl('Average Market Rent per SF - annual')+val(occSF?money(marketAnn/occSF):'-')+txt('Occupied area basis')+'</tr>'
    + '<tr>'+lbl('WALT - weighted average lease term remaining')+val(isFinite(walt)?walt.toFixed(2)+' yrs':'-')
        + txt('Weighted by in-place rent, from the acquisition date')+'</tr>'
    + '<tr>'+lbl('Commercial Recoveries - gated out')+val(money(stats.commRecoveriesGatedAnnual))
        + txt(intf(stats.commRecoveriesGatedCount)+' suite(s) with no active lease')+'</tr>')
    + note('&#9432;','Loss to lease here is an observed rent-roll statistic - in-place against market on occupied space. It is <b>not</b> '
      + 'an assumption in the cash-flow engine, which does not model a loss-to-lease adjustment.');
});

/* =====================================================================
   7. LIQUIDITY - LP and GP capital calls and distributions by year
   ===================================================================== */
extend('Liquidity','w2cPartnerSeries', function(o){
  var w; try { w = bkWaterfallV07(); } catch(e){ return; }
  var rows = (w && w.rows) || [];
  if(!rows.length) return;
  var yrs = Math.ceil(rows.length/12);
  function agg(fn){
    var out=[];
    for(var y=0;y<yrs;y++){ var t=0; for(var k=y*12;k<Math.min((y+1)*12,rows.length);k++) t+=fn(rows[k]); out.push(t); }
    return out;
  }
  var lpC = agg(function(r){ return Math.abs(Number(r.lpCon)||0); });
  var gpC = agg(function(r){ return Math.abs(Number(r.gpCon)||0); });
  var lpD = agg(function(r){ return Number(r.lpDist)||0; });
  var gpD = agg(function(r){ return Number(r.gpDist)||0; });
  var head = '<tr><th class="rowlabel-h">Line Item</th><th>Total</th>';
  for(var y=1;y<=yrs;y++) head += '<th>Year '+y+'</th>';
  head += '</tr>';
  function row(label, series, cls){
    var tot = series.reduce(function(a,b){return a+b;},0);
    return '<tr'+(cls?' class="'+cls+'"':'')+'>'+lbl(label)+val(money(tot))
         + series.map(function(z){ return val(money(z)); }).join('')+'</tr>';
  }
  var lpTot = lpC.reduce(function(a,b){return a+b;},0), gpTot = gpC.reduce(function(a,b){return a+b;},0);
  o.main = (o.main||'') + wrapTable('Capital Calls &amp; Distributions by Partner', head,
      row('LP Contributions', lpC)
    + row('GP Contributions', gpC)
    + row('LP Distributions', lpD)
    + row('GP Distributions', gpD)
    + '<tr class="grandtotal">'+lbl('LP Share of Contributions')
      + val((lpTot+gpTot)?pct(lpTot/(lpTot+gpTot)):'-')
      + lpC.map(function(v,i){ var d=v+gpC[i]; return val(d?pct(v/d):'-'); }).join('')+'</tr>');
});

/* =====================================================================
   8. DEV DRAWS - budget versus drawn reconciliation
   ===================================================================== */
extend('Dev Draws','w2cBudgetVsDrawn', function(o){
  var s = bkLoad();
  if(String(s.dealType||'').toLowerCase() !== 'development') return;
  var dv; try { dv = (typeof bkDevV09==='function') ? bkDevV09() : null; } catch(e){}
  if(!dv || !dv.isDev) return;
  var landAcq = (Number(dv.land)||0)+(Number(dv.close)||0)+(Number(dv.acq)||0)+(Number(dv.pre)||0);
  var parts = [['Land &amp; Acquisition', landAcq], ['Hard Costs', Number(dv.hard)||0],
               ['Soft Costs', Number(dv.soft)||0], ['Lease-Up Operating Deficit', Number(dv.leaseDef)||0]];
  var tot = parts.reduce(function(t,p){ return t+p[1]; },0);
  var body = parts.map(function(p){
    return '<tr>'+lbl(p[0])+val(money(p[1]))+val(tot?pct(p[1]/tot):'-')+'</tr>';
  }).join('')
  + '<tr class="grandtotal">'+lbl('TOTAL BUDGET TO DRAW')+val(money(tot))+val(tot?'100.00%':'-')+'</tr>'
  + '<tr>'+lbl('Unlevered All-In Cost (cost ladder)')+val(money(dv.unlev))+val('-')+'</tr>'
  + (function(){
      var d = tot-(Number(dv.unlev)||0), ok = Math.abs(d) < 1;
      return '<tr class="grandtotal">'+lbl('Budget less Cost Ladder')+val(money(d))
           + '<td class="v">'+chip(ok?'pass':'fail', ok?'TIES':'VARIANCE')+'</td></tr>';
    })();
  o.main = (o.main||'') + wrapTable('Budget versus Drawn - reconciliation',
    '<tr><th class="rowlabel-h">Cost Bucket</th><th>Amount</th><th>% of Budget / Status</th></tr>', body);
});

/* =====================================================================
   9. PORTFOLIO DASHBOARD - Year 1 NOI and weighted average yield
   ===================================================================== */
extend('Portfolio Dashboard','w2cDashYield', function(o){
  var deals = [];
  try { deals = (typeof bkPortfolioLoad==='function' ? bkPortfolioLoad() : []) || []; } catch(e){}
  if(!deals.length) return;
  var totNOI = 0, totPrice = 0, totEq = 0, n = 0;
  deals.forEach(function(d){
    var m = null; try { m = (typeof bkPortfolioMetricsFor==='function') ? bkPortfolioMetricsFor(d) : null; } catch(e){}
    var st = d.state || d;
    var noi = m && isFinite(m.noi) ? Number(m.noi) : NaN;
    var price = Number(st.purchasePrice)||0;
    if(isFinite(noi)){ totNOI += noi; n++; }
    totPrice += price; totEq += (m && Number(m.equity)) || 0;
  });
  o.main = (o.main||'') + wrapTable('Portfolio Yield',
    '<tr><th class="rowlabel-h">Metric</th><th>Value</th><th style="text-align:left">Basis</th></tr>',
      '<tr>'+lbl('Year 1 Combined NOI')+val(n?money(totNOI):'-')+txt(n?(intf(n)+' of '+intf(deals.length)+' deal(s) reporting NOI'):'No deal reports NOI')+'</tr>'
    + '<tr>'+lbl('Weighted Average Going-In Yield')+val((n&&totPrice)?pct(totNOI/totPrice):'-')+txt('Combined NOI &divide; combined purchase price')+'</tr>'
    + '<tr>'+lbl('Total Equity Invested')+val(money(totEq))+txt('Across included deals')+'</tr>');
});

/* =====================================================================
  10. NAVIGATION - applicability, without losing reachability
   The workbook auto-hides the Development and Debt tab groups by deal
   type. Hiding them here would make destinations unreachable, which the
   Wave 1 gate forbids, so the groups are DIMMED and labelled instead:
   the applicability signal without the loss.
   ===================================================================== */
(function(){
  function applyApplicability(){
    try {
      var s = bkLoad();
      var isDev = String(s.dealType||'').toLowerCase()==='development';
      var debtOn = true;
      try { var d = bkDebt(); debtOn = !(d && d.debtEnabled === false); } catch(e){}
      var map = { 'dev': isDev, 'debt': debtOn };
      if(typeof GROUPS === 'undefined') return;
      var wraps = document.querySelectorAll('#rail-groups .rail-group');
      GROUPS.forEach(function(g, i){
        if(!(g.id in map)) return;
        var wrap = wraps[i];
        if(!wrap) return;
        var applies = map[g.id];
        wrap.style.opacity = applies ? '' : '.5';
        var label = wrap.querySelector('.rail-group-label > span');
        if(!label) return;
        var base = g.label;
        label.textContent = applies ? base : base + ' - n/a';
        label.title = applies ? '' :
          (g.id==='dev' ? 'This deal is an acquisition, so the development pages do not apply. They remain open for inspection.'
                        : 'Debt is switched off for this deal. These pages remain open for inspection.');
      });
    } catch(e){}
  }
  var orig = window.showSheet;
  if(typeof orig === 'function'){
    window.showSheet = function(){
      var r = orig.apply(this, arguments);
      try { applyApplicability(); } catch(e){}
      return r;
    };
  }
  if(document.readyState !== 'loading') setTimeout(applyApplicability, 0);
  else document.addEventListener('DOMContentLoaded', function(){ setTimeout(applyApplicability, 0); });
})();

})();
