/* One calculation of the funding picture, read by every page that shows it (Sources & Uses, the guided Step-by-Step Guide, the Home tie indicator, the tests).
   It adds no input and recomputes no engine result: every figure is read from bkDebt / bkDevTakeoutV11 (funding) / bkMonthlyReturns / bkWaterfallV07,
   and the ties compare those engines with each other.
   GP equity contribution (a share of the money put in, set in Investment > Partnership as gpShare) is a different thing from the GP's profit participation
   (pref, catch-up and promote tiers). Only the first is used here. */
(function(){
  if(typeof BK_BASE === 'object' && BK_BASE && !('gla' in BK_BASE)) BK_BASE.gla = 0;   /* leasable area (GLA / NRA): separate from the gross building area, blank until entered */
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
      /* Initial reserves are paid in as a use (Initial Reserves Funded) and drawn back as a source, each in its own line. Interest beyond the facility limit is ONE use; the interest reserve pays the first part of it and equity pays the rest,
         so the equity line is the interest NET of the reserve draw - the reserve draw is shown once, as a reserve source, never again inside equity. */
      var resInt = sum(x.months, 'resInt'), resOp = sum(x.months, 'resLease'), eqInt = excess - resInt;
      var uses = [['Land / Purchase Price', x.land], ['Closing / Diligence Costs', x.close], ['Acquisition Fee', x.acq]];
      if(n(x.pre) > 0.5) uses.push(['Predevelopment Carry', x.pre]);
      uses.push(['Hard Costs', x.hard], ['Soft Costs', x.soft]);
      if(n(x.leaseDef) > 0.5) uses.push(['Lease-Up Operating Deficit', x.leaseDef]);
      uses.push(['Construction Facility Fees (origination and unused commitment)', x.upfrontFees], ['Capitalized Construction Interest', x.actualCapInt], ['Interest Beyond the Facility Limit (paid currently)', excess]);
      if(n(x.resFunded) > 0.5) uses.push(['Initial Reserves Funded', x.resFunded]);
      var srcs = [['Construction Facility - draws', draws], ['Construction Facility - capitalized interest', capInt], ['Equity - equity-first funding', eqPlan]];
      if(Math.abs(eqOver) > 0.5) srcs.push(['Equity - cost overflow beyond the commitment', eqOver]);
      if(Math.abs(eqInt) > 0.5) srcs.push([resInt > 0.5 ? 'Equity - interest beyond the facility limit, after the interest reserve' : 'Equity - interest beyond the facility limit', eqInt]);
      if(resOp > 0.5) srcs.push(['Initial reserves - drawn for the lease-up operating shortfall', resOp]);
      if(resInt > 0.5) srcs.push(['Initial reserves - drawn for interest beyond the facility limit', resInt]);
      var totalUses = uses.reduce(function(t, u){ return t + n(u[1]); }, 0), totalSrc = srcs.reduce(function(t, u){ return t + n(u[1]); }, 0);
      /* equity at funding is the sum of ITS lines (equity-first, overflow, interest after the reserve), not what is left of the total once the facility is taken out: a plug could never fail to tie */
      var facility = draws + capInt, equity = eqPlan + eqOver + eqInt, reserveDraws = resOp + resInt, ceiling = n(x.balCap) || n(x.commit);
      var retEq = r ? sum(r.rows, 'equityDraw') : 0, takeEq = r ? sum(r.rows, 'refiEq') : 0, opShort = r ? sum(r.rows, 'opShort') : 0, contrib = r ? n(r.contrib) : 0;
      var opRows = r ? r.rows.filter(function(q){ return n(q.opShort) > 0.5; }) : [];
      Object.assign(out, { x:x, uses:uses, sources:srcs, totalUses:totalUses, totalSources:totalSrc, loan:facility, principal:draws, capInt:capInt, commit:n(x.commit), ceiling:ceiling, equity:equity, engineEquity:n(x.equityTotal), returnsEquityDraws:retEq, excess:excess,
        reserveDraws:reserveDraws, reserveDrawOperating:resOp, reserveDrawInterest:resInt, takeoutEquity:takeEq, takeoutInHold:!!x.takeoutInHold, takeoutShortfall:n(x.refiShortfall), operatingShortfall:opShort, operatingShortfallFrom:opRows.length ? opRows[0].m : 0, operatingShortfallTo:opRows.length ? opRows[opRows.length - 1].m : 0, otherPostFunding:opShort, contributed:contrib, postClosing:contrib - equity });
      ties.push(tie('su', 'Total sources equal total uses', totalSrc, totalUses, 1));
      /* two different limits: the COMMITMENT caps the principal that can be drawn; the CEILING caps the balance, which is principal plus the interest capitalized into it. With no ceiling set the two are the same figure. */
      ties.push({ id:'commit', label:'Principal drawn on the facility is within the committed loan amount', a:draws, b:n(x.commit), ok:draws <= n(x.commit) + 1, note:'' });
      ties.push({ id:'ceiling', label:'Facility balance (principal plus capitalized interest) is within the permitted ceiling', a:facility, b:ceiling, ok:facility <= ceiling + 1, note:ceiling > n(x.commit) + 1 ? 'Ceiling ' + Math.round(ceiling).toLocaleString('en-US') + ' above the committed amount ' + Math.round(n(x.commit)).toLocaleString('en-US') + ' lets interest capitalize' : '' });
      ties.push(tie('eqEngine', 'Equity per Sources equals the funding engine\'s total equity requirement', equity, x.equityTotal, 1));
      ties.push(tie('eqReturns', 'Equity in the funding schedule equals the equity drawn in the returns cash flow', equity, retEq, 1));
      /* the returns charge the partners for three things and the funding schedule only for the first: equity at funding, the equity called at takeout (the permanent loan is short of the facility payoff and fee) and the lease-up months'
         operating shortfall. Each is read from its own engine, so the contributions are reconciled to their parts rather than left as a remainder. */
      ties.push(tie('takeout', 'Takeout equity in the returns equals the permanent-loan shortfall (called only if the hold reaches stabilization)', takeEq, x.takeoutInHold ? n(x.refiShortfall) : 0, 1));
      ties.push(tie('contrib', 'Equity contributed in the returns equals equity at funding + takeout equity + lease-up operating shortfall', contrib, retEq + takeEq + opShort, 1));
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
