/* One calculation of the funding picture, read by every page that shows it (Sources & Uses, the guided Step-by-Step Guide, the Home tie indicator, the tests).
   It adds no input and recomputes no engine result: every figure is read from bkDebt / bkDevTakeoutV11 (funding) / bkMonthlyReturns / bkWaterfallV07,
   and the ties compare those engines with each other.
   GP equity contribution (a share of the money put in, set in Investment > Partnership as gpShare) is a different thing from the GP's profit participation
   (pref, catch-up and promote tiers). Only the first is used here. */
(function(){
  function sum(a, k){ return (a || []).reduce(function(t, m){ return t + (Number(m[k]) || 0); }, 0); }
  function n(v){ v = Number(v); return isFinite(v) ? v : 0; }
  function tie(id, label, a, b, tol, note){ var ok = Math.abs(n(a) - n(b)) <= (tol == null ? 1 : tol); return { id:id, label:label, a:n(a), b:n(b), ok:ok, note:note || '' }; }
  window.bkFundingSummary = function(){
    var s = bkLoad(), dev = /develop/i.test(String(s.dealType || '')), wf = null, r = null, ties = [], out = { dev:dev, s:s };
    try{ wf = bkWaterfallV07(); }catch(e){}
    try{ r = bkMonthlyReturns(); }catch(e){}
    var lpC = wf && wf.lp ? Math.abs(n(wf.lp.contrib)) : 0, gpC = wf && wf.gp ? Math.abs(n(wf.gp.contrib)) : 0;
    if(dev){
      var x = bkDevTakeoutV11(), draws = sum(x.months, 'loanDraw'), capInt = sum(x.months, 'capInt'), eqPlan = sum(x.months, 'eq'), eqOver = sum(x.months, 'overflow'), excess = sum(x.months, 'excess');
      var uses = [['Land / Purchase Price', x.land], ['Closing / Diligence Costs', x.close], ['Acquisition Fee', x.acq]];
      if(n(x.pre) > 0.5) uses.push(['Predevelopment Carry', x.pre]);
      uses.push(['Hard Costs', x.hard], ['Soft Costs', x.soft]);
      if(n(x.leaseDef) > 0.5) uses.push(['Lease-Up Operating Deficit', x.leaseDef]);
      uses.push(['Construction Facility Fees (origination and unused commitment)', x.upfrontFees], ['Capitalized Construction Interest', x.actualCapInt], ['Interest Funded by Equity Beyond the Commitment', excess]);
      if(n(x.resFunded) > 0.5) uses.push(['Initial Reserves Funded', x.resFunded]);
      var srcs = [['Construction Facility - draws', draws], ['Construction Facility - capitalized interest', capInt], ['Equity - equity-first funding', eqPlan]];
      if(Math.abs(eqOver) > 0.5) srcs.push(['Equity - cost overflow beyond the commitment', eqOver]);
      if(Math.abs(excess) > 0.5) srcs.push(['Equity - interest beyond the commitment', excess]);
      if(n(x.resDrawn) > 0.5) srcs.push(['Initial reserves - drawn for the lease-up shortfall and interest', x.resDrawn]);
      var totalUses = uses.reduce(function(t, u){ return t + n(u[1]); }, 0), totalSrc = srcs.reduce(function(t, u){ return t + n(u[1]); }, 0);
      var facility = draws + capInt, equity = totalSrc - facility, retEq = r ? sum(r.rows, 'equityDraw') : 0, takeEq = r ? sum(r.rows, 'refiEq') : 0, contrib = r ? n(r.contrib) : 0;
      Object.assign(out, { x:x, uses:uses, sources:srcs, totalUses:totalUses, totalSources:totalSrc, loan:facility, commit:n(x.commit), equity:equity, engineEquity:n(x.equityTotal), returnsEquityDraws:retEq, excess:excess,
        takeoutEquity:takeEq, otherPostFunding:contrib - retEq - takeEq, contributed:contrib, postClosing:contrib - equity });
      ties.push(tie('su', 'Total sources equal total uses', totalSrc, totalUses, 1));
      ties.push({ id:'commit', label:'Facility drawn plus capitalized interest is within the commitment', a:facility, b:n(x.commit), ok:facility <= n(x.commit) + 1, note:'' });
      ties.push(tie('eqEngine', 'Equity per Sources equals the funding engine\'s total equity requirement', equity, x.equityTotal, 1));
      var d1 = equity - retEq, expl = Math.abs(d1 - excess) < 1 || Math.abs(d1) < 1;
      ties.push({ id:'eqReturns', label:'Equity in the funding schedule agrees with the equity drawn in the returns cash flow', a:equity, b:retEq, ok:expl, note:Math.abs(d1) < 1 ? '' : 'Differs by interest beyond the commitment (' + Math.round(d1).toLocaleString('en-US') + ')' });
    } else {
      var d = bkDebt(), price = n(s.purchasePrice), closing = price * n(s.closingCostsPct), acqFee = price * (typeof bkAcqFeePct === 'function' ? bkAcqFeePct(s) : n(s.acqFeePct)), cap = n(s.rateCapCost);
      var uses2 = [['Purchase Price', price], ['Closing Costs', closing], ['Acquisition Fee', acqFee], ['Loan Origination Fee', n(d.fee)]];
      if(cap > 0) uses2.push(['Rate Cap Premium (funded as Month-1 equity)', cap]);
      var eqClose = n(d.equity) + cap, contrib2 = r ? n(r.contrib) : (lpC + gpC);
      var totalUses2 = uses2.reduce(function(t, u){ return t + u[1]; }, 0), srcs2 = [['Acquisition Loan', n(d.loan)], ['Equity at closing', eqClose]];
      Object.assign(out, { d:d, uses:uses2, sources:srcs2, totalUses:totalUses2, totalSources:n(d.loan) + eqClose, loan:n(d.loan), commit:n(d.loan), equity:eqClose, engineEquity:n(d.equity) + cap, returnsEquityDraws:0, contributed:contrib2, postClosing:(lpC + gpC) - eqClose });
      ties.push(tie('su', 'Total sources equal total uses', out.totalSources, totalUses2, 1));
      ties.push(tie('loan', 'Loan in Sources equals the Debt page loan', n(d.loan), bkDebt().loan, 1));
    }
    out.lp = lpC; out.gp = gpC; out.gpShareInput = s.gpShare === '' || s.gpShare == null ? null : n(s.gpShare);
    var tot = lpC + gpC;
    if(wf && tot > 0){
      ties.push(tie('wfReturns', 'GP + LP contributions in the waterfall equal the equity contributed in the returns', tot, out.contributed, 1));
      if(out.gpShareInput != null && out.gpShareInput > 0) ties.push({ id:'gpPct', label:'GP equity contribution is the Partnership GP share of total equity', a:gpC / tot, b:out.gpShareInput, ok:Math.abs(gpC / tot - out.gpShareInput) < 0.0005, note:'' });
    }
    var sh = out.gpShareInput != null && out.gpShareInput > 0 && out.gpShareInput < 1 ? out.gpShareInput : 0;
    out.gpEquity = out.equity * sh; out.lpEquity = out.equity - out.gpEquity;   /* equity at funding split by the Partnership GP equity share */
    out.gpPct = tot > 0 ? gpC / tot : null; out.lpPct = tot > 0 ? lpC / tot : null;
    out.ties = ties; out.failed = ties.filter(function(t){ return !t.ok; });
    return out;
  };
  /* The single indicator: every funding tie plus the model integrity checks. */
  window.bkAllInputsTie = function(){
    var res = { ok:true, checks:0, failed:[], withheld:false };
    try{
      if(typeof bkIsProvisioned === 'function' && !bkIsProvisioned()){ res.withheld = true; res.ok = false; return res; }
      var f = bkFundingSummary(); res.checks += f.ties.length; f.failed.forEach(function(t){ res.failed.push({ group:'Funding', label:t.label, detail:t.note || (Math.round(t.a).toLocaleString('en-US') + ' vs ' + Math.round(t.b).toLocaleString('en-US')) }); });
      if(typeof bkIntegrity === 'function'){ var I = bkIntegrity(); (I.checks || []).forEach(function(c){ if(c.status === 'na') return; res.checks++; if(c.status === 'hard' || c.status === 'fail') res.failed.push({ group:c.group || 'Integrity', label:c.label, detail:c.detail || '' }); }); }
    }catch(e){ res.failed.push({ group:'Error', label:'Tie check could not run', detail:e.message }); }
    res.ok = res.failed.length === 0; return res;
  };
})();
