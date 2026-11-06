
/* V32.5-CR consumer/readiness layer (candidate). Appended block; no existing text is modified. */
(function(){
"use strict";
/* ---- CR common (read-only helpers shared by P-C1..P-C7, F17). No engine function is wrapped here. ---- */
var CR = window.__BK_CR = {version:'V32.5-CR-candidate', patches:[], errors:[]};
CR.esc = function(v){ return (typeof bkEsc==='function') ? bkEsc(v) : String(v==null?'':v); };
CR.money = function(n){
  if(n===null||n===undefined||n==='') return '-';
  var x=Number(n); if(!isFinite(x)) return '-'; if(Object.is(x,-0)) x=0;
  var a=Math.abs(x), body = a<100 ? a.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : a.toLocaleString('en-US',{maximumFractionDigits:0});
  return x<0 ? '($'+body+')' : '$'+body;
};
CR.chip = function(cls,t){ return '<span class="status-chip '+(cls||'')+'">'+CR.esc(t)+'</span>'; };
CR.note = function(sym,html){ return '<div class="note-flag" style="margin-top:10px;"><span>'+sym+'</span><div>'+html+'</div></div>'; };
CR.lbl = function(t){ return '<td class="rowlabel" data-bk-align="text">'+t+'</td>'; };
CR.val = function(t){ return '<td class="v">'+t+'</td>'; };
CR.txt = function(t){ return '<td data-bk-align="text">'+t+'</td>'; };
CR.table = function(caption, head, body){ return '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>'+caption+'</caption>'+(head?'<thead>'+head+'</thead>':'')+'<tbody>'+body+'</tbody></table></div>'; };
CR.isDevSnap = function(s){ return /develop/i.test(String((s||{}).dealType||'')); };
CR.activeDev = function(){
  try{
    if(typeof bkIsProvisioned==='function' && !bkIsProvisioned()) return false;
    if(typeof window.bkProductionCounts==='function' && !window.bkProductionCounts().activeDeal) return false;
    return CR.isDevSnap(bkLoad());
  }catch(e){ return false; }
};
/* Read-only development state. Every figure is read from the V32.4 engines' own outputs; nothing is recomputed. */
CR.state = function(){
  var x = bkDevTakeoutV11(), s = x.s, r = bkMonthlyReturns();
  var hold = x.hold, stab = x.stab, co = x.co, refi = Number(s.refiAtStab||0) > 0;
  var last = (r.rows && r.rows[r.rows.length-1]) || {};
  return {x:x, s:s, r:r, hold:hold, stab:stab, co:co, refi:refi,
    saleBeforeStab: hold < stab,            // same predicate as the V32.4 lifecycle flag saleBeforeTakeout (read from engine outputs hold/stab)
    holdAtOrBeforeCO: co > 0 && hold <= co,
    payoffAtSale: Number(last.payoff||0),
    irrUndefined: !isFinite(r.irr)};
};
/* Wrap a renderer so acquisition deals (and blank-slate/withheld pages) pass through byte-identically. */
CR.wrapDev = function(sheet, fn){
  if(typeof RENDERERS==='undefined' || typeof RENDERERS[sheet]!=='function') { CR.errors.push('no renderer '+sheet); return false; }
  var prev = RENDERERS[sheet];
  var w = function(){
    var o = prev.apply(this, arguments);
    try{
      if(!CR.activeDev()) return o;
      if(/no deal loaded|there is no active deal|withheld|calculation blocked/i.test(String(o && o.main || ''))) return o;
      fn(o);
    }catch(e){ o.main = (o.main||'') + CR.note('&#9888;','<b>'+CR.esc(sheet)+' consumer-layer error:</b> '+CR.esc(e.message)); }
    return o;
  };
  w.__bkOriginal = prev.__bkOriginal || prev; w.__crWrapped = true;
  if(typeof window.bkRegisterRenderer==='function') window.bkRegisterRenderer(sheet, w); else RENDERERS[sheet] = w;
  return true;
};
CR.splitBefore = function(main, caption){
  var i = main.indexOf('<caption>'+caption); if(i<0) return -1;
  return main.lastIndexOf('<div class="tbl-wrap"', i);
};
CR.details = function(summary, inner){ return '<details class="cr-acq-block" style="margin-top:16px"><summary style="cursor:pointer;font-weight:600">'+summary+'</summary>'+inner+'</details>'; };

try{
/* ---- P-C1  After-Tax is NOT SUPPORTED for development deals (Phase A, D-C2). Acquisition deals pass through untouched. ---- */
(function(){
  CR.wrapDev('After-Tax', function(o){
    var s = bkLoad(), c = CR;
    o.main = c.table('After-Tax Returns - Development Deals','<tr><th class="rowlabel-h">Item</th><th>Status</th><th style="text-align:left">Reason</th></tr>',
      '<tr>'+c.lbl('After-tax IRR / MOIC / tax schedule')+'<td class="v">'+c.chip('fail','NOT SUPPORTED')+'</td>'+c.txt('The after-tax engine reads the acquisition path (purchase price as tax basis, annual operating cash flow, acquisition loan). It has no development basis, construction-period, takeout or lease-up logic.')+'</tr>')
      + c.note('&#9888;','<b>Not supported for development deals in this release.</b> No after-tax figures are shown, rather than figures computed from the wrong engine. Enabling this needs convention rulings on tax basis, depreciation start, construction-interest treatment and the sale source. Pre-tax development returns are on the Returns page.');
    o.meta = {Property:s.name, 'Deal Type':s.dealType||'Development', Status:'NOT SUPPORTED - development'};
    if(typeof sidebarShell==='function') o.sidebar = sidebarShell('<div class="card"><div class="card-head">After-Tax</div><div class="metric-list"><div class="metric-row"><span class="k">Development deal</span><span class="v">'+c.chip('fail','NOT SUPPORTED')+'</span></div></div></div>'+(typeof colorKeyCard==='function'?colorKeyCard():''));
  });
  CR.patches.push('P-C1');
})();

}catch(e){ CR.errors.push("pc1: "+e.message); }
try{
/* ---- P-C2  Sources & Uses. Development: built from the funding engine (D-C5: total uses include interest funded by equity beyond the commitment).
        Acquisition: per-unit table 3 gains a rate-cap premium use and a post-closing equity use ONLY when those amounts exist; otherwise byte-identical. ---- */
(function(){
  var M = CR.money, pct = function(v){ var n=Number(v); return isFinite(n)?(n*100).toFixed(2)+'%':'-'; }, intf = function(v){ return Math.round(Number(v)||0).toLocaleString('en-US'); };
  function sum(arr,k){ return (arr||[]).reduce(function(a,m){ return a+(Number(m[k])||0); },0); }
  function r5(label, amt, total, units, gsf, cls){
    return '<tr'+(cls?' class="'+cls+'"':'')+'>'+CR.lbl(label)+CR.val(M(amt))+CR.val(units?M(amt/units):'-')+CR.val(gsf?M(amt/gsf):'-')+CR.val(total?pct(amt/total):'-')+'</tr>';
  }
  var HEAD5 = function(first){ return '<tr><th class="rowlabel-h">'+first+'</th><th class="v">Total ($)</th><th class="v">$/unit</th><th class="v">$/SF</th><th class="v">% of Uses</th></tr>'; };

  /* ---------- the four capital measures, laid out once for both deal types (the calculation is bkFundingSummary().measures, src/184; BK_CAPITAL_TERMS names them) ----------
     Four different questions with four different numbers. They are reconciled to the cash flows they are made of and never forced to equal one another. */
  function capTables(F){
    var m = F.measures; if(!m) return '';
    var lb = function(t){ return '<td class="rowlabel bk-wrap" data-bk-align="text">' + t + '</td>'; };
    var wt = function(t){ return '<td class="bk-wrap" data-bk-align="text">' + t + '</td>'; };   /* long text columns wrap inside the card instead of widening the table past it */
    var M = function(v){ v = Math.round(Number(v) || 0); return (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US'); };   /* whole dollars, in the text as in the cells */
    var T = window.BK_CAPITAL_TERMS || {}, nm = function(k, d){ return (T[k] && T[k].name) || d; }, dev = !!F.dev;
    var ce = m.closingEquity, tc = m.totalContributedEquity, oc = m.operatingCashRequirement, tp = m.totalProjectCapitalization, cl = (typeof bkCapName === 'function' ? bkCapName('closingEquity', dev) : 'Closing equity'), ct = nm('totalContributedEquity', 'Total contributed equity'), co = nm('operatingCashRequirement', 'Operating cash requirement'), cp = nm('totalProjectCapitalization', 'Total project capitalization'), cu = nm('unfundedInterimCashRequirement', 'Unfunded interim cash requirement'), cc = nm('postClosingCapitalCalls', 'Post-closing capital calls'), ui = m.unfundedInterimCashRequirement || { amount:0 };
    var mo = function(a, b){ return !a ? '' : (b && b !== a ? 'months ' + a + ' to ' + b : 'month ' + a); };
    var good = function(ids){ return !(F.ties || []).some(function(t){ return ids.indexOf(t.id) >= 0 && !t.ok; }); };
    var st = function(ids){ var g = good(ids); return '<td>' + CR.chip(g ? 'pass' : 'fail', g ? 'TIES' : 'VARIANCE') + '</td>'; };
    var x = F.x || {}, months = x.months || [], span = function(k){ var q = months.filter(function(z){ return (Number(z[k]) || 0) > 0.5; }); return q.length ? mo(q[0].mo, q[q.length - 1].mo) : ''; };
    var who = function(lp, gp){ return CR.val(M(lp)) + CR.val(M(gp)); };
    /* 1. the four measures, each with the question it answers and what it reconciles to */
    var t1 = CR.table('Capital Measures - four different questions, four different numbers, and two disclosures', '<tr><th class="rowlabel-h">Measure</th><th class="v">Amount</th><th style="text-align:left">The question it answers</th><th style="text-align:left">What it reconciles to</th><th>Status</th></tr>',
        '<tr>' + lb(cl) + CR.val(M(ce.amount)) + wt(dev ? 'Equity required to initially fund the development: the equity in Sources &amp; Uses, called from the start through the funding schedule (' + mo(ce.from, ce.to) + (ce.month1 ? '; ' + M(ce.month1) + ' in month 1' : '') + ').' : 'Equity required at closing: price, closing costs, fees and any rate cap premium, less the loan.')
          + wt(dev ? 'The equity lines of Sources &amp; Uses, the funding engine\'s closing equity and the equity drawn in the returns cash flow.' : 'Total uses at closing less the acquisition loan.') + st(dev ? ['eqEngine', 'eqReturns'] : ['su']) + '</tr>'
      + '<tr>' + lb(ct) + CR.val(M(tc.amount)) + wt('All GP and LP capital actually contributed over the hold: ' + cl.toLowerCase() + ' plus every post-closing capital call.')
          + wt(M(ce.amount) + ' ' + cl.toLowerCase() + ' + ' + M(m.callsTotal) + ' ' + cc.toLowerCase() + '. The waterfall\'s LP ' + M(tc.lp) + ' + GP ' + M(tc.gp) + ' contributions.') + st(['capContrib', 'wfReturns']) + '</tr>'
      + '<tr>' + lb(co) + CR.val(M(oc.amount)) + wt('Net interim cash needed to fund operating shortfalls' + (dev ? ': the lease-up deficit the funding schedule carries, after later income offsets the early losses.' : ': the operating shortfalls called from the partners after closing (an acquisition has no funding schedule).'))
          + wt(dev ? M(oc.inFunding) + ' funded in Sources &amp; Uses (the net lease-up deficit). The ' + cu.toLowerCase() + ' is disclosed on its own below and is not added to it.' : M(oc.amount) + ' called from the partners after closing' + (oc.months ? ' (' + mo(oc.from, oc.to) + ')' : '') + '. Nothing is funded in Sources &amp; Uses.') + (dev ? st(['opFunding']) : '<td></td>') + '</tr>'
      + (dev ? '<tr>' + lb(cu) + CR.val(M(ui.amount)) + wt('Operating cash needed after closing, outside the funding schedule' + (ui.months ? ' (' + mo(ui.from, ui.to) + ')' : '') + ', before operating cash flow arrives. Disclosed beside the ' + co.toLowerCase() + ', never added to it.')
          + wt(M(ui.byPartners) + ' called from the partners' + (ui.byReserve > 0.5 ? ', ' + M(ui.byReserve) + ' from the operating reserve' : '') + (ui.nettedFromDistributions > 0.5 ? ', ' + M(ui.nettedFromDistributions) + ' netted against later distributions' : '') + '; peak cumulative deficit ' + M(ui.peakCumulative) + '.') + st(['capOperating']) + '</tr>' : '')
      + '<tr>' + lb(cc) + CR.val(M(m.callsTotal)) + wt('Capital called from the partners after closing: ' + (dev ? 'the takeout equity and the ' + cu.toLowerCase() + ' called.' : 'the refinance shortfall, balloon equity and operating shortfalls.') + ' Included in ' + ct.toLowerCase() + '.')
          + wt(M(ce.amount) + ' ' + cl.toLowerCase() + ' + ' + M(m.callsTotal) + ' = ' + M(tc.amount) + ' ' + ct.toLowerCase() + '.') + st(['capContrib']) + '</tr>'
      + '<tr>' + lb(cp) + CR.val(M(tp.amount)) + wt('All sources of capital over the investment life: the closing sources plus every post-closing capital call.')
          + wt(M(tp.closingSources) + ' closing sources + ' + M(tp.laterCalls) + ' ' + cc.toLowerCase() + ' = ' + M(tp.debt) + ' ' + (dev ? 'construction facility' : 'loan') + (tp.reserves > 0.5 ? ' + ' + M(tp.reserves) + ' reserves drawn' : '') + ' + ' + M(tp.contributedEquity) + ' ' + ct.toLowerCase() + '.') + st(['capTotal']) + '</tr>');
    /* 2. when each dollar is needed and who supplies it */
    var rows = '<tr>' + lb(dev ? 'Construction facility (draws + capitalized interest)' : 'Acquisition loan') + CR.val(M(F.loan)) + wt(dev ? span('loanDraw') : mo(1, 1)) + CR.val('') + CR.val('') + wt('Lender') + '</tr>';
    if(dev && F.reserveDraws > 0.5) rows += '<tr>' + lb('Initial reserves drawn') + CR.val(M(F.reserveDraws)) + wt(span('resLease') || span('resInt')) + CR.val('') + CR.val('') + wt('Reserves funded at closing') + '</tr>';
    rows += '<tr>' + lb(cl) + CR.val(M(ce.amount)) + wt(mo(ce.from, ce.to)) + who(F.lpEquity, F.gpEquity) + wt('Partners (LP and GP)') + '</tr>'
          + '<tr class="grandtotal">' + lb('Closing sources (total sources in Sources &amp; Uses)') + CR.val(M(tp.closingSources)) + wt('') + CR.val('') + CR.val('') + wt('') + '</tr>';
    var lpC = 0, gpC = 0;
    (m.calls || []).forEach(function(c){ lpC += c.lp; gpC += c.gp;
      var note = c.kind === 'takeout' ? (F.takeoutShortfall > 1 ? 'The permanent loan ' + M(x.permLoan) + ' is short of the facility payoff ' + M(x.conPayoff) + ' plus the permanent fee ' + M(x.permFee) + '.' : '')
        : c.kind === 'operating' ? (dev ? 'Operating shortfall outside the funding schedule' + (ui.byReserve > 0.5 ? '; a further ' + M(ui.byReserve) + ' was covered by the operating reserve' : '') + (ui.nettedFromDistributions > 0.5 ? '; ' + M(ui.nettedFromDistributions) + ' more was netted against later distributions (an operating-reserve draw repaid from a month with surplus cash)' : '') + '.' : 'Operating and capital shortfalls after closing.')
        : c.kind === 'refinance' ? 'The refinance loan does not repay the old loan and its fee.' : c.kind === 'balloon' ? 'The loan matures without a refinance.' : '';
      rows += '<tr>' + lb(c.name) + CR.val(M(c.amount)) + wt(mo(c.from, c.to)) + who(c.lp, c.gp) + wt('Partners (LP and GP)' + (note ? '. ' + note : '')) + '</tr>'; });
    if(!(m.calls || []).length) rows += '<tr>' + lb(cc) + CR.val(M(0)) + wt('None') + CR.val('') + CR.val('') + wt('No capital is called after closing, so ' + cp.toLowerCase() + ' equals the closing sources.') + '</tr>';
    else rows += '<tr class="grandtotal">' + lb(cc) + CR.val(M(m.callsTotal)) + wt('') + who(lpC, gpC) + wt('') + '</tr>';
    rows += '<tr class="grandtotal">' + lb(cp.toUpperCase()) + CR.val(M(tp.amount)) + wt('') + CR.val('') + CR.val('') + wt('') + '</tr>'
          + '<tr>' + lb('of which ' + ct.toLowerCase()) + CR.val(M(tc.amount)) + wt(cl + ' plus the ' + cc.toLowerCase()) + who(tc.lp, tc.gp) + wt('Included in the levered IRR, the equity multiple and the waterfall') + '</tr>';
    var t2 = CR.table('Capitalization Over the Life of the Deal - when each dollar is needed and who supplies it', '<tr><th class="rowlabel-h">Source of capital</th><th class="v">Amount</th><th style="text-align:left">When</th><th class="v">LP</th><th class="v">GP</th><th style="text-align:left">Supplied by</th></tr>', rows);
    /* 3. the net view the funding schedule carries and the unfunded interim view the partners supply: two measures, never added */
    var t3 = '';
    if(dev && (oc.amount > 0.5 || oc.leaseUpMonths || ui.amount > 0.5)) t3 = CR.table(co + ' and the ' + cu.toLowerCase() + ' - the net view in the funding schedule and the interim view the partners supply', '<tr><th class="rowlabel-h">View</th><th class="v">Amount</th><th style="text-align:left">What it means</th></tr>',
        '<tr>' + lb('Net lease-up deficit funded in Sources &amp; Uses') + CR.val(M(oc.inFunding)) + wt('This is the ' + co.toLowerCase() + '. The lease-up result after later income offsets the early losses: the ' + oc.leaseUpMonths + ' lease-up months lose ' + M(-oc.leaseUpLoss) + ' and then earn ' + M(oc.leaseUpGain) + ' (net ' + (oc.leaseUpNet >= 0 ? '+' : '-') + M(Math.abs(oc.leaseUpNet)) + '). It is the deficit the funding schedule carries and it is not raised to the peak.') + '</tr>'
      + '<tr>' + lb(cu) + CR.val(M(ui.amount)) + wt('Disclosed beside the ' + co.toLowerCase() + ' and never added to it' + (ui.months ? ' (' + mo(ui.from, ui.to) + ')' : '') + ': cash the partners' + (ui.byReserve > 0.5 ? ' and the operating reserve' : '') + ' must supply as shortfalls fall, before operating cash flow arrives. It is outside Sources &amp; Uses: funding the peak there would change the timing and amount of contributed capital, and with it the returns and the waterfall. It is included in ' + ct.toLowerCase() + '.') + '</tr>'
      + '<tr>' + lb('Funded by') + CR.val('') + wt((ui.byReserve > 0.5 ? 'Operating reserve ' + M(ui.byReserve) + '; ' : '') + (ui.nettedFromDistributions > 0.5 ? 'Netted against later distributions ' + M(ui.nettedFromDistributions) + '; ' : '') + 'Partners ' + M(ui.byPartners) + ' (LP ' + M(ui.lp) + ', GP ' + M(ui.gp) + ').') + '</tr>'
      + '<tr>' + lb('Peak cumulative operating cash deficit outside the funding schedule') + CR.val(M(ui.peakCumulative)) + wt('The most cash outstanding at any month before later operating cash flow repays it.') + '</tr>');
    return t1 + t2 + t3;
  }

  /* ---------- development ---------- */
  CR.wrapDev('Sources & Uses', function(o){
    var q = CR.state(), x = q.x, s = q.s, r = q.r;
    var F = bkFundingSummary();   /* the one shared funding calculation (src/184); this page only lays it out */
    var uses = F.uses, srcs = F.sources, totalUses = F.totalUses, totalSrc = F.totalSources;
    var delta = totalSrc - totalUses, ok = Math.abs(delta) < 1, facility = F.loan, equity = F.equity;
    var units = Number(s.units)||0, gsf = Number(s.gsf)||0;
    var retEq = F.returnsEquityDraws, eqVsRet = equity - retEq;
    /* every status chip below reads the shared tie of the same name (src/184), so this page and the ALL INPUTS TIE indicator can never disagree */
    var ceN = (typeof bkCapName === 'function' ? bkCapName('closingEquity', true) : 'Closing equity'), tieOk = function(id){ var t = (F.ties||[]).filter(function(q){ return q.id===id; })[0]; return t ? !!t.ok : true; };
    function two(list,total,cap){ return CR.table(cap,'<tr><th class="rowlabel-h" colspan="2">'+(cap.indexOf('Uses')===0||/Uses/.test(cap)?'Uses':'Sources')+'</th></tr>', list.map(function(u){ return '<tr>'+CR.lbl(u[0])+CR.val(M(u[1]))+'</tr>'; }).join('')); }
    var main = '<div class="tbl-wrap"><table class="fin"><caption>Sources &amp; Uses - Active Deal (Development)</caption><thead><tr><th class="rowlabel-h" colspan="2">Uses</th></tr></thead><tbody>'
      + uses.map(function(u){ return '<tr>'+CR.lbl(u[0])+CR.val(M(u[1]))+'</tr>'; }).join('')
      + '<tr class="grandtotal">'+CR.lbl('TOTAL USES')+CR.val(M(totalUses))+'</tr></tbody></table></div>'
      + CR.table('Sources','<tr><th class="rowlabel-h" colspan="2">Sources</th></tr>',
          srcs.map(function(u){ return '<tr>'+CR.lbl(u[0])+CR.val(M(u[1]))+'</tr>'; }).join('')
          + '<tr class="grandtotal">'+CR.lbl('TOTAL SOURCES')+CR.val(M(totalSrc))+'</tr>')
      + CR.note('&#10003;','<b>Development Sources &amp; Uses -</b> read from the development funding engine (<code>bkDevV09()</code> cost lines, <code>bkDevFundingV10()</code> monthly facility and equity schedule). Uses are the unlevered cost, facility upfront fees, capitalized interest, interest paid currently beyond the facility limit and any initial reserves funded; sources are the facility draws, the capitalized interest, the equity (equity-first, cost overflow, and interest after any interest reserve) and any initial reserves drawn. The two sides are built from different fields, so the tie below is a check, not a construction.');
    var chip2 = function(good, a, b){ return '<td>'+CR.chip(good?'pass':'fail', good?a:b)+'</td>'; };
    var checks = CR.table('Funding Order &amp; Control Checks','<tr><th class="rowlabel-h">Check</th><th>Value</th><th style="text-align:left">Basis</th><th>Status</th></tr>',
        '<tr>'+CR.lbl('Total Uses')+CR.val(M(totalUses))+CR.txt('Unlevered cost + upfront fees + capitalized interest + interest paid currently beyond the facility limit + initial reserves funded')+'<td></td></tr>'
      + '<tr>'+CR.lbl('Total Sources')+CR.val(M(totalSrc))+CR.txt('Facility draws + capitalized interest + equity + initial reserves drawn')+'<td></td></tr>'
      + '<tr class="grandtotal">'+CR.lbl('Sources less Uses')+CR.val(M(delta))+CR.txt('Must reconcile to zero')+'<td>'+CR.chip(ok?'pass':'fail', ok?'TIES':'VARIANCE')+'</td></tr>'
      + '<tr>'+CR.lbl('Principal drawn does not exceed the committed loan amount')+CR.val(M(F.principal))+CR.txt('Committed amount '+M(F.commit))+chip2(tieOk('commit'),'WITHIN COMMITMENT','OVER COMMITMENT')+'</tr>'
      + '<tr>'+CR.lbl('Facility balance (principal plus capitalized interest) does not exceed the permitted ceiling')+CR.val(M(facility))
        + CR.txt(F.ceiling > (Number(F.commit)||0)+1 ? 'Ceiling '+M(F.ceiling)+', above the committed amount '+M(F.commit)+': interest may capitalize up to the ceiling' : 'No separate ceiling: the balance is limited to the committed amount '+M(F.commit))
        + chip2(tieOk('ceiling'),'WITHIN CEILING','OVER CEILING')+'</tr>'
      + '<tr>'+CR.lbl(ceN+' per Sources equals the funding engine\'s '+ceN.toLowerCase())+CR.val(M(equity))+CR.txt('Funding engine '+ceN.toLowerCase()+' '+M(x.equityTotal))+chip2(tieOk('eqEngine'),'TIES','VARIANCE')+'</tr>'
      + '<tr>'+CR.lbl('Equity drawn in the monthly returns cash flow')+CR.val(M(retEq))+CR.txt('Sum of the monthly equity draws used by the Returns page (excludes post-closing capital calls)')+'<td></td></tr>'
      + '<tr>'+CR.lbl(ceN+' per Sources less equity drawn in the returns')+CR.val(M(eqVsRet))
        + CR.txt(tieOk('eqReturns') ? 'Equity in the funding schedule and in the returns cash flow agree' : 'The funding schedule and the returns cash flow charge different equity - review.')
        + chip2(tieOk('eqReturns'),'AGREES','REVIEW')+'</tr>'
      + '<tr>'+CR.lbl('Figures belong to the active deal')+CR.val(CR.esc(s.dealId||'-')+' - '+CR.esc(s.name||''))+CR.txt('Guards against stale cached values')+'<td>'+CR.chip(s.dealId?'pass':'warn', s.dealId?'PASS':'NO DEAL ID')+'</td></tr>');
    var caps = CR.table('Capitalization Metrics','<tr><th class="rowlabel-h">Metric</th><th>Value</th><th style="text-align:left">Basis</th></tr>',
        '<tr>'+CR.lbl('Construction Facility Commitment')+CR.val(M(x.commit))+CR.txt('Sized commitment')+'</tr>'
      + '<tr>'+CR.lbl('Facility Funded to Total Uses')+CR.val(totalUses?pct(facility/totalUses):'-')+CR.txt('Facility draws + capitalized interest &divide; total uses')+'</tr>'
      + '<tr>'+CR.lbl(ceN+' as % of Total Uses')+CR.val(totalUses?pct(equity/totalUses):'-')+CR.txt(ceN+' &divide; total uses')+'</tr>'
      + '<tr>'+CR.lbl(ceN)+CR.val(M(equity))+CR.txt('Equity in Sources &amp; Uses, called through the funding schedule')+'</tr>'
      + '<tr>'+CR.lbl('Facility per Unit')+CR.val(units?M(facility/units):'-')+CR.txt(units?intf(units)+' units':'No unit count')+'</tr>'
      + '<tr>'+CR.lbl('Facility per SF')+CR.val(gsf?M(facility/gsf):'-')+CR.txt(gsf?intf(gsf)+' GSF':'No GSF')+'</tr>');
    var perUse = CR.table('Uses - total, per unit, per SF, and as a share', HEAD5('Use'),
        uses.map(function(u){ return r5(u[0],u[1],totalUses,units,gsf); }).join('') + r5('TOTAL USES',totalUses,totalUses,units,gsf,'grandtotal'));
    var perSrc = CR.table('Sources - total, per unit, per SF, and as a share', HEAD5('Source'),
        srcs.map(function(u){ return r5(u[0],u[1],totalUses,units,gsf); }).join('') + r5('TOTAL SOURCES',totalSrc,totalUses,units,gsf,'grandtotal'));
    o.main = main + checks + capTables(F) + caps + perUse + perSrc;
    o.meta = {Property:s.name,'Total Uses':intf(totalUses),Currency:'USD'};
    if(typeof sidebarShell==='function'){
      o.sidebar = sidebarShell('<div class="card"><div class="card-head">S&amp;U Check</div><div class="metric-list"><div class="metric-row"><span class="k">Total Uses</span><span class="v">'+M(totalUses)+'</span></div><div class="metric-row"><span class="k">Total Sources</span><span class="v">'+M(totalSrc)+'</span></div><div class="metric-row"><span class="k">Facility / '+ceN+'</span><span class="v">'+M(facility)+' / '+M(equity)+'</span></div></div></div>'
        + (typeof modelInfoCard==='function' ? modelInfoCard('<div class="metric-row"><span class="k">Tab Group</span><span class="v">Portfolio Database</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>') : '')
        + (typeof colorKeyCard==='function' ? colorKeyCard() : ''));
    }
  });

  /* ---------- acquisition: two different views, never forced to equal one another ----------
     Closing Sources & Uses = the capital and debt required at closing (the rate cap premium included). Total project capitalization = the closing sources plus every capital call after closing (refinance shortfall, balloon equity,
     operating cash requirement). Both are legitimate, so the page shows the closing tables with closing totals, then the calls as separate rows, then the total capitalization (capTables). */
  (function(){
    if(typeof RENDERERS==='undefined' || typeof RENDERERS['Sources & Uses']!=='function') return;
    var prev = RENDERERS['Sources & Uses'];
    var w = function(){
      var o = prev.apply(this, arguments);
      try{
        if(typeof bkIsProvisioned==='function' && !bkIsProvisioned()) return o;
        var s = bkLoad(); if(CR.isDevSnap(s)) return o;
        var m = String(o && o.main || ''); var iu = m.indexOf('<caption>Uses - total, per unit, per SF'), is = m.indexOf('<caption>Sources - total, per unit, per SF');
        if(iu<0 || is<0) return o;
        var F = bkFundingSummary();   /* shared funding calculation (src/184) */
        var units = Number(s.units)||0, gsf = Number(s.gsf)||0, uses = F.uses, tu = F.totalUses;
        var srcs = [['Acquisition Loan',F.loan],['LP Equity (closing)',F.lpEquity],['GP Equity (closing)',F.gpEquity]], ts = F.totalSources;
        var tU = CR.table('Uses at closing - total, per unit, per SF, and as a share', HEAD5('Use'), uses.map(function(u){ return r5(u[0],u[1],tu,units,gsf); }).join('') + r5('TOTAL USES AT CLOSING',tu,tu,units,gsf,'grandtotal'));
        var tS = CR.table('Sources at closing - total, per unit, per SF, and as a share', HEAD5('Source'), srcs.map(function(u){ return r5(u[0],u[1],tu,units,gsf); }).join('') + r5('TOTAL SOURCES AT CLOSING',ts,tu,units,gsf,'grandtotal'));
        var a = m.lastIndexOf('<div class="tbl-wrap"', iu), b0 = m.indexOf('</table></div>', is) + 14;
        if(a<0 || b0<14) return o;
        o.main = m.slice(0,a) + tU + tS + capTables(F) + m.slice(b0);
      }catch(e){ if(CR.errors.indexOf('P-C2 acq: '+e.message)<0) CR.errors.push('P-C2 acq: '+e.message); }
      return o;
    };
    w.__bkOriginal = prev.__bkOriginal || prev; w.__crWrapped = true;
    if(typeof window.bkRegisterRenderer==='function') window.bkRegisterRenderer('Sources & Uses', w); else RENDERERS['Sources & Uses'] = w;
  })();
  CR.patches.push('P-C2');
})();

}catch(e){ CR.errors.push("pc2: "+e.message); }
try{
/* ---- P-C3  Export fixes (D-C4). Replaces the builder field of registry entries; existing export functions are not edited.
        (a) Monthly CF: acquisition gains Disposition Fee / Refi Proceeds / Refi Equity Shortfall / Balloon Equity (appended after the existing columns);
            development gains Disposition Fee (appended). No arithmetic changes.
        (b) Development annual and debt exports read the development engines (monthly returns aggregated to years; facility + permanent schedule).
        (c) Dev Draws keeps the funding engine's ending balance (no zeroing after takeout) and appends a Facility Payoff at Takeout column. ---- */
(function(){
  if(typeof BK_EXPORT_REGISTRY==='undefined' || !Array.isArray(BK_EXPORT_REGISTRY)){ CR.errors.push('P-C3: no BK_EXPORT_REGISTRY'); return; }
  function reg(key){ for(var i=0;i<BK_EXPORT_REGISTRY.length;i++) if(BK_EXPORT_REGISTRY[i].key===key) return BK_EXPORT_REGISTRY[i]; return null; }
  function sum(a,f){ return a.reduce(function(z,r){ return z+(Number(f(r))||0); },0); }
  function irrCell(v){ return isFinite(v) ? v : 'Undefined - no sign change'; }

  /* ---- Monthly CF ---- */
  (function(){ var R = reg('monthlycf'); if(!R) return; var orig = R.builder;
    R.builder = function(){
      var b = orig();
      if(!b || !b.available) return b;
      var x = bkMonthlyReturns(), dev = !!(x.rows[0] && 'equityDraw' in x.rows[0]);
      var extra = dev ? ['Disposition Fee'] : ['Disposition Fee','Refi Proceeds','Refi Equity Shortfall','Balloon Equity'];
      var headers = b.headers.concat(extra);
      var n = x.rows.length, rows = b.rows.map(function(r,i){
        if(i>=n || r.length<b.headers.length) return r;           // blank spacer and summary rows are left as they are
        var q = x.rows[i];
        return r.concat(dev ? [q.dispoFee] : [q.dispoFee, q.refi, q.refiEq, q.balloonEq]);
      });
      if(dev && !isFinite(x.irr)) rows = rows.map(function(r){ return (r.length===2 && r[0]==='Levered IRR') ? [r[0], irrCell(x.irr)] : r; });
      return Object.assign({}, b, {headers:headers, rows:rows});
    }; })();

  /* ---- Annual CF (development only) ---- */
  (function(){ var R = reg('annualcf'); if(!R) return; var orig = R.builder;
    R.builder = function(){
      if(!CR.activeDev()) return orig();
      var s = bkLoad(), x = bkMonthlyReturns(), ny = Math.ceil(x.rows.length/12);
      var headers = ['Year','EGI','NOI After Reserves','Asset Mgmt Fee','Debt Service','Disposition Fee','Refi Proceeds','Refi Equity Shortfall','Equity Draws','Net Sale Proceeds','Debt Payoff','Net Cash Flow'];
      var rows = [];
      for(var y=0;y<ny;y++){
        var rr = x.rows.slice(y*12, y*12+12);
        rows.push([y+1, sum(rr,function(r){return r.egi;}), sum(rr,function(r){return r.noi-(r.reserve||0);}), sum(rr,function(r){return r.assetFee;}), sum(rr,function(r){return r.ds;}), sum(rr,function(r){return r.dispoFee;}),
          sum(rr,function(r){return r.refi;}), sum(rr,function(r){return r.refiEq;}), sum(rr,function(r){return r.equityDraw;}), sum(rr,function(r){return r.sale;}), sum(rr,function(r){return r.payoff;}), sum(rr,function(r){return r.cf;})]);
      }
      var last = x.rows[x.rows.length-1] || {}, gross = Number(last.grossSale)||0, net = Number(last.sale)||0;
      rows.push([]); rows.push(['--- SUMMARY ---']);
      rows.push(['Gross Sale Price', gross]); rows.push(['Cost of Sale', net-gross]); rows.push(['Net Sale Proceeds', net]);
      rows.push(['Levered IRR', irrCell(x.irr)]); rows.push(['Levered MOIC', x.moic]);
      return {name:'Annual Property CF', filename:bkSlug(s.name)+'_Annual_PropertyCF.csv', headers:headers, rows:rows, count:ny, available:true};
    }; })();

  /* ---- Debt Schedule (development only) ---- */
  (function(){ var R = reg('debt'); if(!R) return; var orig = R.builder;
    R.builder = function(){
      if(!CR.activeDev()) return orig();
      var q = CR.state(), x = q.x, s = q.s, r = q.r, M = x.months || [], sch = {}; (x.permSchedule||[]).forEach(function(z){ sch[z.mo] = z; });
      var headers = ['Month','Beginning Balance','Payment','Interest','Principal','Ending Balance','Facility Draw','Facility Payoff at Takeout','Phase'];
      var rows = [], takeoutMo = (q.refi && q.stab <= q.hold) ? q.stab : Infinity, prevEnd = 0;
      for(var i=0;i<r.rows.length;i++){
        var m = i+1, rw = r.rows[i], f = M[i] || {beg:0,end:0,capInt:0,excess:0,loanDraw:0}, beg, end, interest, principal = 0, draw = Number(f.loanDraw)||0, payoffTk = 0, phase;
        if(m >= takeoutMo && sch[m]){
          var p = sch[m];
          beg = (m===takeoutMo) ? Number(f.beg)||0 : prevEnd;
          end = Number(p.end)||0;
          interest = (m===takeoutMo) ? (Number(f.capInt)||0)+(Number(f.excess)||0) : Number(p.interest)||0;
          principal = (m===takeoutMo) ? 0 : Number(p.principal)||0;
          if(m===takeoutMo){ payoffTk = Number(x.conPayoff)||0; draw = Number(f.loanDraw)||0; }
          phase = (m===takeoutMo) ? 'Takeout (facility repaid, permanent loan funded)' : 'Permanent loan';
        } else {
          beg = Number(f.beg)||0; end = Number(f.end)||0;
          interest = (Number(f.capInt)||0)+(Number(f.excess)||0);
          if(!interest && q.x.conHeldToSale && m>q.stab) interest = Number(rw.ds)||0;     // cash-pay interest on a facility held to sale (no takeout)
          phase = (q.x.conHeldToSale && m>q.stab) ? 'Construction facility held to sale' : 'Construction facility';
        }
        prevEnd = end;
        rows.push([m, beg, rw.ds, interest, principal, end, draw, payoffTk, phase]);
      }
      var last = r.rows[r.rows.length-1] || {};
      rows.push([]); rows.push(['--- SUMMARY ---']);
      rows.push(['Construction Commitment', x.commit]); rows.push(['Permanent Loan', takeoutMo<Infinity ? x.permLoan : 0]);
      rows.push(['Permanent Rate', s.permRate]); rows.push(['Permanent Amortization (yrs)', s.permAmort]);
      rows.push(['Binding Constraint', bkBindingName(x.bindingTest)]); rows.push(['Debt at Sale', last.payoff||0]);
      return {name:'Debt Schedule', filename:bkSlug(s.name)+'_Debt_Schedule.csv', headers:headers, rows:rows, count:rows.length-4, available:true};
    }; })();

  /* ---- Dev Draws (development only) ---- */
  (function(){ var R = reg('devdraws'); if(!R) return; var orig = R.builder;
    R.builder = function(){
      var b = orig();
      if(!b || !b.available || !CR.activeDev()) return b;
      var q = CR.state(), x = q.x, takeoutMo = (q.refi && q.stab <= q.hold) ? q.stab : Infinity, M = x.months || [];
      var headers = ['Month','Land','Hard Cost','Soft Cost','Lease Deficit','Fees','Funding Need','Equity','Beginning Balance','Capitalized Interest','Excess Interest','Facility Draw','Overflow','Ending Balance','Cumulative Need','Facility Payoff at Takeout'];
      var rows = M.map(function(m){ return [m.mo, m.land, m.hard, m.soft, m.lease, m.fees, m.need, m.eq, m.beg, m.capInt, m.excess, m.loanDraw, m.overflow, m.end, m.cumNeed, m.mo===takeoutMo ? (Number(x.conPayoff)||0) : 0]; });
      rows.push([]); rows.push(['--- SUMMARY ---']);
      rows.push(['Construction Commitment', x.commit]); rows.push(['Upfront Fees', x.upfrontFees]);
      rows.push(['Actual Capitalized Interest', x.actualCapInt]); rows.push(['Levered All-In Cost', x.levered]);
      rows.push(['Ending Balance note', 'Engine facility balance; not reduced after takeout. Repayment is shown in Facility Payoff at Takeout.']);
      return Object.assign({}, b, {headers:headers, rows:rows, count:M.length});
    }; })();
  CR.patches.push('P-C3');
})();

}catch(e){ CR.errors.push("pc3: "+e.message); }
try{
/* ---- P-C4  Portfolio rollup (D-C3). Development deals contribute development debt, equity and price/value; undefined IRRs never poison weighted aggregates.
        Companion anchored edits (pc4.anchors in mk_v325.js) replace only the five IRR-weighting expressions in the Portfolio, Dashboard and Rollup renderers
        with calls to the helpers below; with all IRRs finite the helpers return exactly the original expression's value. ---- */
(function(){
  var M = CR.money;
  function fin(v){ return typeof v==='number' && isFinite(v); }
  window.__BK_CR_wIRR = function(ms){
    var f = ms.filter(function(m){ return fin(m.irr); });
    if(f.length===ms.length){ var te = ms.reduce(function(z,m){ return z+m.equity; },0); return te ? ms.reduce(function(z,m){ return z+m.irr*m.equity; },0)/te : 0; }   // = original expression
    var te2 = f.reduce(function(z,m){ return z+m.equity; },0);
    return (f.length && te2) ? f.reduce(function(z,m){ return z+m.irr*m.equity; },0)/te2 : NaN;                                                                       // undefined IRRs excluded, never counted as zero
  };
  window.__BK_CR_pick = function(arr, best){
    var f = arr.filter(function(r){ return fin(r.m.irr); });
    if(!f.length) return null;
    return f.reduce(best ? function(a,b){ return a.m.irr>b.m.irr?a:b; } : function(a,b){ return a.m.irr<b.m.irr?a:b; });
  };

  var prev = window.bkPortfolioMetricsFor;
  if(typeof prev!=='function'){ CR.errors.push('P-C4: no bkPortfolioMetricsFor'); return; }
  window.bkPortfolioMetricsFor = function(snapshot){
    if(!CR.isDevSnap(snapshot)) return prev.apply(this, arguments);
    var origLoad = window.bkLoad, origSave = window.bkSave, scratch = JSON.parse(JSON.stringify(snapshot)), out;
    window.bkLoad = function(){ return scratch; };
    window.bkSave = function(d){ Object.assign(scratch, d); };
    try{
      var q = CR.state(), x = q.x, r = q.r, mo = x.months || [];
      var facilityPeak = mo.reduce(function(a,m){ return Math.max(a, Number(m.end)||0); }, 0);
      var permFunded = (q.refi && q.stab <= q.hold) ? (Number(x.permLoan)||0) : 0;
      var rows = r.rows || [], last = rows[rows.length-1] || {};
      out = { ok:true, isDev:true,
        irr:r.irr, moic:r.moic,
        equity:Number(r.contrib)||0,                                   // equity contributed in the returns cash flow (the stream the IRR/MOIC are computed on)
        loan:Math.max(facilityPeak, permFunded),                       // peak funded development debt: construction facility peak, or the permanent loan when it is funded within the hold
        purchasePrice:Number(x.unlev)||0,                              // development cost basis (unlevered all-in cost)
        y1noi:rows.slice(0,12).reduce(function(z,q2){ return z+(Number(q2.noi)||0); },0),
        exitCap:Number(scratch.exitCap)||0, holdYears:Number(scratch.holdYears)||0,
        grossSale:Number(last.grossSale)||0 };
    }catch(e){ out = { ok:false, error:String((e&&e.message)||e) }; }
    finally{ window.bkLoad = origLoad; window.bkSave = origSave; }
    return out;
  };

  /* labelled notes on the aggregate pages, only when a dev deal or an undefined IRR is present (otherwise the page is untouched) */
  function wrapAny(sheet, fn){
    if(typeof RENDERERS==='undefined' || typeof RENDERERS[sheet]!=='function') return;
    var p0 = RENDERERS[sheet];
    var w = function(){ var o = p0.apply(this, arguments); try{ fn(o); }catch(e){} return o; };
    w.__bkOriginal = p0.__bkOriginal || p0; w.__crWrapped = true;
    if(typeof window.bkRegisterRenderer==='function') window.bkRegisterRenderer(sheet, w); else RENDERERS[sheet] = w;
  }
  function note(o){
    var saved = (typeof bkPortfolioLoad==='function') ? bkPortfolioLoad() : [];
    var ms = saved.map(function(sn){ return {snap:sn, m:window.bkPortfolioMetricsFor(sn)}; }).filter(function(x){ return x.m && x.m.ok; });
    var und = ms.filter(function(x){ return !fin(x.m.irr); }), devs = ms.filter(function(x){ return x.m.isDev; });
    var h = '';
    if(und.length) h += CR.note('&#9888;','<b>'+und.length+' deal(s) have no IRR of their own:</b> '+und.map(function(x){ return CR.esc(x.snap.name||'Deal'); }).join(', ')+'. That means the deal\'s equity cash flow has no sign change. Their dated cash flows still count in the combined portfolio cash flow, and they remain in the equity, debt, price and NOI totals.');
    if(devs.length) h += CR.note('&#9432;','<b>Development deals in this portfolio ('+devs.length+')</b> contribute peak funded development debt, equity contributed in the returns cash flow, and total development cost in place of purchase price; Year 1 NOI is the first 12 months of the development monthly returns.');
    if(h) o.main = (o.main||'') + h;
  }
  ['Portfolio','Portfolio Dashboard','Portfolio Rollup'].forEach(function(n){ wrapAny(n, note); });
  CR.patches.push('P-C4');
})();

}catch(e){ CR.errors.push("pc4: "+e.message); }
try{
/* ---- P-C5  Returns page: undefined IRR is stated, MOIC is shown with an explicit annotation (D-C6) ---- */
(function(){
  CR.wrapDev('Returns', function(o){
    var q = CR.state(); if(!q.irrUndefined) return;
    var m = String(o.main||'');
    var n0 = m.length;
    m = m.replace(/(<td class="rowlabel">Development Levered XIRR<\/td><td>)[^<]*(<\/td><td>)Live(<\/td>)/,
      '$1IRR: Undefined &mdash; no sign change$2Not decision-grade$3');
    m = m.replace(/(<td class="rowlabel">Development Levered MOIC<\/td><td>)([^<]*)(<\/td><td>)Live(<\/td>)/,
      '$1MOIC: $2 &mdash; IRR unavailable$3Reference only$4');
    var note = CR.note('&#9888;','<b>Equity IRR is undefined for this hold.</b> The monthly equity cash flow has no sign change: no month returns positive cash to equity (net sale proceeds do not cover the debt payoff at month '+q.hold+'). This describes the shape of the cash flow; it is not a zero return and it is not a statement that the economics are invalid. MOIC is shown for reference only. The cash flows below are the unchanged engine output.');
    var k = m.indexOf('</table></div>'); if(k>=0) m = m.slice(0,k+14)+note+m.slice(k+14);
    o.main = m;
  });
  CR.patches.push('P-C5');
})();

}catch(e){ CR.errors.push("pc5: "+e.message); }
try{
/* ---- P-C6  Pre-takeout sale presentation (refinance on, exit month < stabilization month). Hold >= stabilization: byte-identical. ---- */
(function(){
  function applies(q){ return q.refi && q.saleBeforeStab; }
  function rowRe(label){ return new RegExp('<tr><td class="rowlabel" data-bk-align="text">'+label+'</td>[\\s\\S]*?</tr>'); }
  CR.wrapDev('Debt', function(o){
    var q = CR.state(); if(!applies(q)) return;
    var m = String(o.main||''), M = CR.money;
    m = m.replace('Permanent / Takeout Loan Sizing - three constraints','Permanent / Takeout Loan Sizing - PRO FORMA, NOT DRAWN (exit precedes stabilization)');
    m = m.replace('<td class="rowlabel" data-bk-align="text">PERMANENT LOAN</td>','<td class="rowlabel" data-bk-align="text">PERMANENT LOAN (pro forma - not drawn)</td>');
    m = m.replace('Debt service after takeout','Pro forma only - no takeout occurs before the sale');
    m = m.replace('Balance retired at takeout','Pro forma - the actual payoff is at the sale, below');
    m = m.replace(/(Net Refinance Proceeds<\/td>[\s\S]*?<span class="status-chip )[a-z]*(">)(FUNDS PAYOFF|SHORTFALL)/,'$1$2PRO FORMA');
    var re = rowRe('Permanent Debt at Sale');
    if(!re.test(m)) throw new Error('P-C6: Permanent Debt at Sale row not found');
    m = m.replace(re, '<tr>'+CR.lbl('Construction Balance Repaid at Sale')+CR.val(M(q.payoffAtSale))+CR.txt('Facility balance repaid from sale proceeds at month '+q.hold+'; no permanent loan is drawn')+'<td></td></tr>');
    var i = m.indexOf('Construction Balance Repaid at Sale'), k = m.indexOf('</table></div>', i);
    if(i>=0 && k>=0) m = m.slice(0,k+14) + CR.note('&#9432;','<b>Pro forma permanent sizing.</b> The exit is at month '+q.hold+', before stabilization at month '+q.stab+'. No permanent loan is drawn and no takeout occurs; the construction facility balance of '+M(q.payoffAtSale)+' is repaid from sale proceeds. The permanent figures above show what the loan would be at stabilization and do not enter the returns.') + m.slice(k+14);
    o.main = m;
  });
  CR.wrapDev('Debt Schedule', function(o){
    var q = CR.state(); if(!applies(q)) return;
    var m = String(o.main||''), M = CR.money;
    var i = m.indexOf('<caption>Permanent Loan Schedule');
    if(i>=0){
      var j = m.lastIndexOf('<div class="tbl-wrap"', i), k = m.indexOf('</table></div>', i);
      if(j>=0 && k>=0) m = m.slice(0,j) + CR.note('&#9432;','<b>No permanent loan schedule.</b> The exit is at month '+q.hold+', before stabilization at month '+q.stab+'; no permanent loan is drawn. The construction facility balance of '+M(q.payoffAtSale)+' is repaid from sale proceeds at month '+q.hold+' (it is not a scheduled repayment in the table above).') + m.slice(k+14);
    }
    /* Total Debt Reconciliation + monthly Total Debt table: rebuilt from the same engine arrays, months 1..hold, no permanent loan */
    var a = m.indexOf('<caption>Total Debt Reconciliation'), t2 = m.indexOf('<caption>Total Debt - all facilities');
    if(a>=0 && t2>a){
      var j0 = m.lastIndexOf('<div class="tbl-wrap"', a), k0 = m.indexOf('</table></div>', t2) + 14;
      var mo = (q.x.months || []).slice(0, q.hold), rowsD = q.r.rows || [], peak = 0, peakMo = 0;
      mo.forEach(function(z,i){ var e = Number(z.end)||0; if(e > peak){ peak = e; peakMo = i+1; } });
      var recon = CR.table('Total Debt Reconciliation','<tr><th class="rowlabel-h">Facility</th><th>Peak Balance</th><th>Months Scheduled</th><th>Status</th></tr>',
          '<tr>'+CR.lbl('Acquisition Loan')+CR.val('-')+CR.val('-')+'<td class="v">'+CR.chip('','NOT APPLICABLE')+'</td></tr>'
        + '<tr>'+CR.lbl('Construction Facility')+CR.val(M(peak))+CR.val(String(mo.length))+'<td class="v">'+CR.chip('pass','IN TOTAL')+'</td></tr>'
        + '<tr>'+CR.lbl('Permanent / Refinance Loan')+CR.val('-')+CR.val('-')+'<td class="v">'+CR.chip('warn','NOT DRAWN - EXIT PRECEDES STABILIZATION')+'</td></tr>'
        + '<tr class="grandtotal">'+CR.lbl('PEAK TOTAL DEBT OUTSTANDING')+CR.val(M(peak))+CR.val('Month '+peakMo)+'<td class="v">'+CR.chip('pass','TIES EVERY MONTH')+'</td></tr>');
      var body = mo.map(function(z,i){ var e = Number(z.end)||0, ci = Number(z.capInt)||0, ds = Number((rowsD[i]||{}).ds)||0;
        return '<tr'+(e?'':' style="opacity:.55"')+'>'+CR.lbl(String(i+1))+CR.val('-')+CR.val(e?M(e):'-')+CR.val('-')+CR.val(M(e))+CR.val(ds?M(ds):'-')+CR.val(ci?M(ci):'-')+'</tr>'; }).join('');
      var tbl = CR.table('Total Debt - all facilities, monthly, all '+mo.length+' periods','<tr><th class="rowlabel-h">Mo</th><th>Acquisition Loan</th><th>Construction Facility</th><th>Permanent Loan</th><th>TOTAL DEBT</th><th>Cash Debt Service</th><th>Capitalized Interest</th></tr>', body);
      if(j0>=0) m = m.slice(0,j0) + recon + tbl + m.slice(k0);
    }
    o.main = m;
  });
  CR.wrapDev('Returns', function(o){
    var q = CR.state(); if(!applies(q)) return;
    var m = String(o.main||''), M = CR.money;
    var re = /<tr><td class="rowlabel">Permanent Loan<\/td><td>[^<]*<\/td><td>Takeout at stabilization<\/td><\/tr>/;
    if(!re.test(m)) throw new Error('P-C6: Returns Permanent Loan row not found');
    o.main = m.replace(re, '<tr><td class="rowlabel">Permanent Loan</td><td>-</td><td>Not drawn - exit (month '+q.hold+') precedes stabilization (month '+q.stab+'); construction balance of '+M(q.payoffAtSale)+' repaid at sale</td></tr>');
    /* sidebar "Development Return Bridge": permanent loan and refinance proceeds are not realized */
    if(o.sidebar){
      o.sidebar = String(o.sidebar)
        .replace(/(<span class="k">Permanent Loan<\/span><span class="v">)[^<]*(<\/span>)/,'$1Not drawn$2')
        .replace(/(<span class="k">Net Refi Proceeds<\/span><span class="v">)[^<]*(<\/span>)/,'$1None$2');
    }
  });
  CR.patches.push('P-C6');
})();

}catch(e){ CR.errors.push("pc6: "+e.message); }
try{
/* ---- P-C7  model controls CR-C1 / CR-C2 / CR-C3; development return replaces the acquisition-path IRR check ---- */
(function(){
  if(typeof window.bkModelControls!=='function'){ CR.errors.push('P-C7: no bkModelControls'); return; }
  var prev = window.bkModelControls;
  window.bkModelControls = function(){
    var out = prev.apply(this, arguments);
    try{
      if(!Array.isArray(out) || !CR.activeDev()) return out;
      /* the existing check reads bkAnnualCF() (acquisition path); for a development deal it never tests the development return */
      out = out.filter(function(c){ return !/^Unlevered IRR is not defined for these cash flows/.test(String(c.msg||'')); });
      var q = CR.state(), M = CR.money;
      if(q.saleBeforeStab)
        out.push({level:'WARN', area:'Exit', msg:'CR-C1: Exit month '+q.hold+' is before stabilization (month '+q.stab+'). No permanent takeout occurs; the construction facility balance ('+M(q.payoffAtSale)+') is repaid from sale proceeds, and any permanent-loan sizing shown is pro forma only.'});
      if(q.holdAtOrBeforeCO)
        out.push({level:'WARN', area:'Exit', msg:'CR-C3: Exit month '+q.hold+' is at or before completion of construction (CO month '+q.co+'). The sale is valued on forward lease-up/operating NOI.'});
      if(q.irrUndefined)
        out.push({level:'FAIL', area:'Returns', msg:'CR-C2: Development equity IRR is undefined - the monthly equity cash flow has no sign change (no month returns positive cash to equity). MOIC is shown for reference only; the result is not decision-grade.'});
    }catch(e){ /* controls must never throw into readiness */ }
    return out;
  };
  CR.patches.push('P-C7');
})();

}catch(e){ CR.errors.push("pc7: "+e.message); }
try{
/* ---- F17 (D-C7)  Development Debt / Debt Schedule pages: acquisition-loan block is collapsed and labelled, development tables first ---- */
(function(){
  var SUM = 'Acquisition-loan analysis &mdash; not used by this development deal (collapsed; reference only)';
  CR.wrapDev('Debt', function(o){
    var m = String(o.main||''), j = CR.splitBefore(m,'Construction Facility Sizing');
    if(j<0) throw new Error('F17: development block not found on Debt page');
    o.main = m.slice(j) + CR.details(SUM, m.slice(0,j));
    /* the sidebar summarises the debt this deal actually has (the construction facility and the takeout), with the closing equity by its name - not the acquisition loan sized off the land price */
    if(typeof sidebarShell==='function'){ try{ var t = bkDevTakeoutV11(), F = bkFundingSummary(), D = function(v){ return '$'+bkFmt(Number(v)||0); }, kv = function(k,v){ return '<div class="metric-row"><span class="k">'+k+'</span><span class="v">'+v+'</span></div>'; };
      o.sidebar = sidebarShell('<div class="card"><div class="card-head">Development Debt Summary</div><div class="metric-list">'
        + kv('Construction Commitment', D(t.commit)) + kv('Capitalized Interest', D(t.actualCapInt)) + kv('Permanent Loan', t.conHeldToSale ? 'None' : D(t.permLoan)) + kv('Construction Balance at Takeout', D(t.conPayoff))
        + kv('Takeout Equity', D(F.takeoutEquity)) + kv((typeof bkCapName==='function' ? bkCapName('closingEquity', true) : 'Closing equity'), D(F.equity)) + '</div></div>' + (typeof colorKeyCard==='function' ? colorKeyCard() : '')); }catch(e){} }
  });
  CR.wrapDev('Debt Schedule', function(o){
    var m = String(o.main||''), j = CR.splitBefore(m,'Construction Facility Schedule');
    if(j<0) throw new Error('F17: development block not found on Debt Schedule page');
    var dev = m.slice(j).replace('The acquisition schedule above remains the acquisition loan','The acquisition schedule below (collapsed) remains the acquisition loan');
    o.main = dev + CR.details(SUM, m.slice(0,j));
  });
  CR.patches.push('F17');
})();

}catch(e){ CR.errors.push("f17: "+e.message); }
})();
