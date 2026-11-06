/* One calculation of the funding picture, read by every page that shows it (Sources & Uses, the guided Step-by-Step Guide, the Home tie indicator, the tests).
   It adds no input and recomputes no engine result: every figure is read from bkDebt / bkDevTakeoutV11 (funding) / bkMonthlyReturns / bkWaterfallV07,
   and the ties compare those engines with each other.
   GP equity contribution (a share of the money put in, set in Investment > Partnership as gpShare) is a different thing from the GP's profit participation
   (pref, catch-up and promote tiers). Only the first is used here.

   CAPITAL MEASURES (the modeling convention, see audit/CAPITAL_MEASURES.md). Four different questions, four different numbers, never forced to equal one another:
     Closing equity              equity required at closing (the equity in Sources & Uses). A development's is called INITIAL FUNDING EQUITY: it is called through the funding schedule, not at one closing
     Total contributed equity    all GP and LP capital actually contributed (closing equity plus every later capital call)
     Operating cash requirement  the NET interim cash needed to fund operating shortfalls: what the funding schedule carries (the net lease-up deficit); never added to the unfunded interim requirement
     Total project capitalization  all sources of capital over the investment life: closing sources plus later capital calls
   Two named disclosures sit beside them: the UNFUNDED INTERIM CASH REQUIREMENT (the operating cash needed after closing, outside the funding schedule, with its peak and who supplies it) and the POST-CLOSING CAPITAL CALLS (the calls after closing).
   Each is reconciled to the cash flows it is made of by the ties capContrib, capTotal and (development) capOperating. A page that shows one of them uses its name from BK_CAPITAL_TERMS. */
(function(){
  if(typeof BK_BASE === 'object' && BK_BASE && !('gla' in BK_BASE)) BK_BASE.gla = 0;   /* leasable area (GLA / NRA): separate from the gross building area, blank until entered */
  function sum(a, k){ return (a || []).reduce(function(t, m){ return t + (Number(m[k]) || 0); }, 0); }
  function n(v){ v = Number(v); return isFinite(v) ? v : 0; }
  function tie(id, label, a, b, tol, note){ var ok = Math.abs(n(a) - n(b)) <= (tol == null ? 1 : tol); return { id:id, label:label, a:n(a), b:n(b), ok:ok, note:note || '' }; }
  /* the names (one place); pages read them so a measure is never called by two names */
  var TERMS = window.BK_CAPITAL_TERMS = {
    closingEquity:              { name:'Closing equity',               devName:'Initial funding equity', short:'Equity required at closing', devShort:'Equity required to initially fund the development' },
    totalContributedEquity:     { name:'Total contributed equity',     short:'All GP and LP capital actually contributed' },
    operatingCashRequirement:   { name:'Operating cash requirement',   short:'Net interim cash needed to fund operating shortfalls' },
    totalProjectCapitalization: { name:'Total project capitalization', short:'All sources of capital over the investment life' },
    unfundedInterimCashRequirement: { name:'Unfunded interim cash requirement', short:'Operating cash needed after closing, outside the funding schedule' },
    postClosingCapitalCalls:    { name:'Post-closing capital calls',   short:'Capital called from the partners after closing' }
  };
  /* a measure's name for the kind of deal (a development's closing equity is its initial funding equity); pages read this, never a literal */
  window.bkCapName = function(key, dev){ var t = TERMS[key]; return t ? (dev && t.devName ? t.devName : t.name) : ''; };
  /* the months a list of returns rows spans, for the pages that say when */
  function span(rows, pred){ var q = (rows || []).filter(pred); return { from:q.length ? q[0].m : 0, to:q.length ? q[q.length - 1].m : 0, n:q.length }; }
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
      /* ---- the four capital measures (development) ---- */
      var resOpUsed = r ? sum(r.rows, 'resOp') : 0, gpW = (lpC + gpC) > 0 ? gpC / (lpC + gpC) : 0, cumO = 0, peakO = 0, needO = 0, nettedO = 0, luLoss = 0, luGain = 0;
      /* Month by month, outside the funding schedule: X is the month's operating cash before the operating reserve and before any call. A negative X is a requirement; the cumulative X gives the peak the partners and the reserve must carry before later cash arrives.
         The returns engine lets the operating reserve be drawn in one month and repaid (a negative draw) when the funding schedule later draws the same reserve; a repayment taken out of a month that has surplus cash is not a call, the partners simply receive that much less. */
      if(r) r.rows.forEach(function(q){ var other = n(q.cf) + n(q.equityDraw) + n(q.refiEq), X = other - n(q.resOp) - n(q.resRelease);
        cumO -= X; if(cumO > peakO) peakO = cumO; needO += Math.max(0, -X); if(other >= 0 && n(q.resOp) < 0) nettedO -= n(q.resOp); });
      (x.leaseupRamp || []).forEach(function(z){ var v = n(z.after); if(v < 0) luLoss += v; else luGain += v; });
      var needSpan = span(r ? r.rows : [], function(q){ return n(q.opShort) + n(q.resOp) > 0.5; }), eqSpan = span(r ? r.rows : [], function(q){ return n(q.equityDraw) > 0.5; });
      var callsTotal = takeEq + opShort, tpc = facility + reserveDraws + contrib;
      var callList = [];
      if(takeEq > 0.5) callList.push({ kind:'takeout', name:'Takeout equity', amount:takeEq, from:x.stab, to:x.stab, source:'Partners (LP and GP)' });
      if(opShort > 0.5) callList.push({ kind:'operating', name:TERMS.unfundedInterimCashRequirement.name + ' called after closing', amount:opShort, from:opRows.length ? opRows[0].m : 0, to:opRows.length ? opRows[opRows.length - 1].m : 0, source:'Partners (LP and GP)' });
      callList.forEach(function(c){ c.gp = c.amount * gpW; c.lp = c.amount - c.gp; });
      out.measures = {
        closingEquity:{ name:bkCapName('closingEquity', true), amount:equity, from:eqSpan.from, to:eqSpan.to, month1:r && r.rows[0] ? n(r.rows[0].equityDraw) : 0 },
        totalContributedEquity:{ name:TERMS.totalContributedEquity.name, amount:contrib, lp:lpC, gp:gpC },
        /* the NET view: what the funding schedule carries (the lease-up result after later income offsets the early losses). The interim cash needed after closing is its own measure below and is never added to this one. */
        operatingCashRequirement:{ name:TERMS.operatingCashRequirement.name, amount:n(x.leaseDef), inFunding:n(x.leaseDef), leaseUpLoss:luLoss, leaseUpGain:luGain, leaseUpNet:luLoss + luGain, leaseUpMonths:(x.leaseupRamp || []).length },
        unfundedInterimCashRequirement:{ name:TERMS.unfundedInterimCashRequirement.name, amount:needO, byReserve:resOpUsed, byPartners:opShort, nettedFromDistributions:nettedO, lp:opShort * (1 - gpW), gp:opShort * gpW,
          from:needSpan.from, to:needSpan.to, months:needSpan.n, peakCumulative:peakO },
        totalProjectCapitalization:{ name:TERMS.totalProjectCapitalization.name, amount:tpc, closingSources:totalSrc, debt:facility, reserves:reserveDraws, contributedEquity:contrib, laterCalls:callsTotal },
        postClosingCapitalCalls:{ name:TERMS.postClosingCapitalCalls.name, amount:callsTotal, calls:callList },
        calls:callList, callsTotal:callsTotal };
      ties.push(tie('su', 'Total sources equal total uses', totalSrc, totalUses, 1));
      /* two different limits: the COMMITMENT caps the principal that can be drawn; the CEILING caps the balance, which is principal plus the interest capitalized into it. With no ceiling set the two are the same figure. */
      ties.push({ id:'commit', label:'Principal drawn on the facility is within the committed loan amount', a:draws, b:n(x.commit), ok:draws <= n(x.commit) + 1, note:'' });
      ties.push({ id:'ceiling', label:'Facility balance (principal plus capitalized interest) is within the permitted ceiling', a:facility, b:ceiling, ok:facility <= ceiling + 1, note:ceiling > n(x.commit) + 1 ? 'Ceiling ' + Math.round(ceiling).toLocaleString('en-US') + ' above the committed amount ' + Math.round(n(x.commit)).toLocaleString('en-US') + ' lets interest capitalize' : '' });
      ties.push(tie('eqEngine', bkCapName('closingEquity', true) + ' per Sources equals the funding engine\'s ' + bkCapName('closingEquity', true).toLowerCase(), equity, x.equityTotal, 1));
      ties.push(tie('eqReturns', 'Equity in the funding schedule equals the equity drawn in the returns cash flow', equity, retEq, 1));
      /* the returns charge the partners for three things and the funding schedule only for the first: equity at funding, the equity called at takeout (the permanent loan is short of the facility payoff and fee) and the lease-up months'
         operating shortfall. Each is read from its own engine, so the contributions are reconciled to their parts rather than left as a remainder. */
      ties.push(tie('takeout', 'Takeout equity in the returns equals the permanent-loan shortfall (called only if the hold reaches stabilization)', takeEq, x.takeoutInHold ? n(x.refiShortfall) : 0, 1));
      ties.push(tie('contrib', 'Equity contributed in the returns equals equity at funding + takeout equity + lease-up operating shortfall', contrib, retEq + takeEq + opShort, 1));
      /* the four measures reconcile to the cash flows they are made of: contributed equity = closing equity + the capital called after closing; total project capitalization is the debt, the reserve draws and all contributed equity, and also the closing sources plus the same calls */
      ties.push(tie('capContrib', TERMS.totalContributedEquity.name + ' equals ' + bkCapName('closingEquity', true).toLowerCase() + ' plus the ' + TERMS.postClosingCapitalCalls.name.toLowerCase(), contrib, equity + callsTotal, 1));
      ties.push(tie('capTotal', TERMS.totalProjectCapitalization.name + ' equals the closing sources plus the ' + TERMS.postClosingCapitalCalls.name.toLowerCase(), tpc, totalSrc + callsTotal, 1));
      var om = out.measures.operatingCashRequirement, ui = out.measures.unfundedInterimCashRequirement;
      ties.push(tie('capOperating', TERMS.unfundedInterimCashRequirement.name + ' (the monthly shortfall re-derived from the cash flow) equals the partners\' calls plus the operating reserve plus any reserve repaid out of later cash', ui.amount, ui.byPartners + ui.byReserve + ui.nettedFromDistributions, 1));
      ties.push(tie('opFunding', TERMS.operatingCashRequirement.name + ' equals the lease-up deficit the funding ledger carries (summed from its months)', om.amount, sum(x.months, 'lease'), 1));
    } else {
      var d = bkDebt(), price = n(s.purchasePrice), closing = price * n(s.closingCostsPct), acqFee = price * (typeof bkAcqFeePct === 'function' ? bkAcqFeePct(s) : n(s.acqFeePct)), cap = n(s.rateCapCost);
      var uses2 = [['Purchase Price', price], ['Closing Costs', closing], ['Acquisition Fee', acqFee], ['Loan Origination Fee', n(d.fee)]];
      if(cap > 0) uses2.push(['Rate Cap Premium (funded as Month-1 equity)', cap]);
      var eqClose = n(d.equity) + cap, contrib2 = r ? n(r.contrib) : (lpC + gpC);
      var totalUses2 = uses2.reduce(function(t, u){ return t + u[1]; }, 0), srcs2 = [['Acquisition Loan', n(d.loan)], ['Equity at closing', eqClose]];
      Object.assign(out, { d:d, uses:uses2, sources:srcs2, totalUses:totalUses2, totalSources:n(d.loan) + eqClose, loan:n(d.loan), commit:n(d.loan), equity:eqClose, engineEquity:n(d.equity) + cap, returnsEquityDraws:0, contributed:contrib2, postClosing:(lpC + gpC) - eqClose });
      ties.push(tie('su', 'Total sources equal total uses', out.totalSources, totalUses2, 1));
      ties.push(tie('loan', 'Loan in Sources equals the Debt page loan', n(d.loan), bkDebt().loan, 1));
      /* ---- the four capital measures (acquisition) ----
         Capital called after closing is each month's shortfall of the other cash (the returns charge it as a contribution). Where the month also carries a refinance shortfall or balloon equity, the call is attributed to those events first,
         pro rata between them; what is left is the operating cash requirement (operating and capital shortfalls). */
      var rowsA = r ? r.rows : [], cRefi = 0, cBalloon = 0, cOper = 0, opMonths = [], refiMonths = [], balloonMonths = [], gpWa = (lpC + gpC) > 0 ? gpC / (lpC + gpC) : 0;
      rowsA.forEach(function(q){ var call = Math.max(0, n(q.wfContrib) - n(q.eqDraw)); if(call <= 0.005) return;
        var ev = n(q.refiEq) + n(q.balloonEq), evCall = Math.min(call, ev), opCall = call - evCall;
        if(ev > 0){ cRefi += evCall * n(q.refiEq) / ev; cBalloon += evCall * n(q.balloonEq) / ev; if(n(q.refiEq) > 0) refiMonths.push(q.m); if(n(q.balloonEq) > 0) balloonMonths.push(q.m); }
        if(opCall > 0.005){ cOper += opCall; opMonths.push(q.m); } });
      var callsTotalA = cRefi + cBalloon + cOper, callListA = [];
      if(cRefi > 0.5) callListA.push({ kind:'refinance', name:'Refinance shortfall', amount:cRefi, from:refiMonths[0], to:refiMonths[refiMonths.length - 1], source:'Partners (LP and GP)' });
      if(cBalloon > 0.5) callListA.push({ kind:'balloon', name:'Balloon equity at loan maturity', amount:cBalloon, from:balloonMonths[0], to:balloonMonths[balloonMonths.length - 1], source:'Partners (LP and GP)' });
      if(cOper > 0.5) callListA.push({ kind:'operating', name:TERMS.operatingCashRequirement.name + ' called after closing', amount:cOper, from:opMonths[0], to:opMonths[opMonths.length - 1], source:'Partners (LP and GP)' });
      callListA.forEach(function(c){ c.gp = c.amount * gpWa; c.lp = c.amount - c.gp; });
      var tpcA = n(d.loan) + contrib2;
      out.measures = {
        closingEquity:{ name:bkCapName('closingEquity', false), amount:eqClose, from:1, to:1, month1:eqClose },
        totalContributedEquity:{ name:TERMS.totalContributedEquity.name, amount:contrib2, lp:lpC, gp:gpC },
        /* an acquisition has no funding schedule, so its operating shortfalls are met by calls on the partners after closing: that is the net requirement, and nothing is left unfunded */
        operatingCashRequirement:{ name:TERMS.operatingCashRequirement.name, amount:cOper, inFunding:0, byPartners:cOper, lp:cOper * (1 - gpWa), gp:cOper * gpWa, from:opMonths[0] || 0, to:opMonths[opMonths.length - 1] || 0, months:opMonths.length, leaseUpLoss:0, leaseUpGain:0, leaseUpNet:0, leaseUpMonths:0 },
        unfundedInterimCashRequirement:{ name:TERMS.unfundedInterimCashRequirement.name, amount:0, byReserve:0, byPartners:0, nettedFromDistributions:0, lp:0, gp:0, from:0, to:0, months:0, peakCumulative:0 },
        totalProjectCapitalization:{ name:TERMS.totalProjectCapitalization.name, amount:tpcA, closingSources:out.totalSources, debt:n(d.loan), reserves:0, contributedEquity:contrib2, laterCalls:callsTotalA },
        postClosingCapitalCalls:{ name:TERMS.postClosingCapitalCalls.name, amount:callsTotalA, calls:callListA },
        calls:callListA, callsTotal:callsTotalA };
      ties.push(tie('capContrib', TERMS.totalContributedEquity.name + ' equals ' + bkCapName('closingEquity', false).toLowerCase() + ' plus the ' + TERMS.postClosingCapitalCalls.name.toLowerCase(), contrib2, eqClose + callsTotalA, 1));
      ties.push(tie('capTotal', TERMS.totalProjectCapitalization.name + ' equals the closing sources plus the ' + TERMS.postClosingCapitalCalls.name.toLowerCase(), tpcA, out.totalSources + callsTotalA, 1));
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
