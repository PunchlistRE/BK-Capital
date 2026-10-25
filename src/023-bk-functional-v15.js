
/* Punchlist Capital V1.5 - exact monthly levered equity cash flow (SYS_CF rows 87-104).
   Reconciled against Havard Avenue: previous bkMonthlyReturns() (a) split annual NOI/EGI
   evenly across 12 months instead of using the true monthly-compounding figure, and
   (b) never applied the Disposition Fee at sale. Both are fixed here by reusing
   bkAnnualCF()'s exact per-month array (added in V14) and bkDebt()'s exact per-month
   amortization schedule -- no formulas are re-derived, only wired together as Excel does.
   This is the ACQUISITION-ONLY implementation. Renamed in V2.4 from window.bkMonthlyReturns
   to this dedicated name -- body below is byte-for-byte unchanged -- so a single final router
   (added at the end of the file in V2.4) can dispatch acquisition vs. development deals to their
   own dedicated engines instead of one implementation silently overwriting the other. */
window.bkAcquisitionMonthlyReturnsV15 = function(){
  const s = bkLoad();
  const u = bkAnnualCF();   // u.monthly[i] = {m,y,egi,noiBeforeReserves,noi} exact per-month
  const d = bkDebt();       // d.months[i] = {m,payment,interest,principal,balance} exact per-month
  const months = u.holdMonths;
  const start = u.acqDate;
  const assetMgmtPct = Number(s.assetMgmtPct||0);
  const dispositionFeePct = Number(s.dispositionFeePct||0);

  const rows=[], values=[], dates=[];
  let dist=0, contrib=0;
  for(let m=1; m<=months; m++){
    const mo = u.monthly[m-1];
    const ds = d.months[m-1] || {payment:0, interest:0, principal:0, balance:d.debtAtSale};
    const assetFee = mo.egi * assetMgmtPct;                 // SYS_CF row 99, gated m<=SaleMo (always true here)
    const isLast = (m===months);
    const sale = isLast ? u.netSale : 0;                     // row 70, only at sale month
    const grossSaleAtExit = isLast ? u.grossSale : 0;
    const dispoFee = isLast ? grossSaleAtExit*dispositionFeePct : 0; // row 102's "-G68*in_dispo_fee" term
    const payoff = isLast ? d.debtAtSale : 0;                 // row 92, ending balance retired at sale
    const opCF = mo.noi - ds.payment;                         // row 100 (Op CF after Debt Service)
    const equityDraw = (m===1) ? d.equity : 0;                // row 97 (Equity Contributions)
    const other = -assetFee + opCF + (sale - dispoFee - payoff); // row 98+99+100+101+102 (98,101 = 0, no refi/dev here)
    const cf = other - equityDraw;                            // row 103 (net, used for XIRR -- ties Excel exactly)
    // MOIC uses Excel's separate WF Contributions / WF Distributions Available split (rows 107-108):
    // the equity draw is ALWAYS a contribution; only a shortfall in the OTHER components adds to it,
    // and any surplus in the other components is a distribution -- the two are never netted together.
    const wfContrib = equityDraw + Math.max(0, -other);
    const wfDist = Math.max(0, other);
    dist += wfDist; contrib += wfContrib;
    const dt = new Date(start); dt.setMonth(dt.getMonth()+(m-1));
    values.push(cf); dates.push(dt);
    rows.push({m, y:mo.y, dt, egi:mo.egi, noi:mo.noi, reserve:0, ds:ds.payment, assetFee, sale, dispoFee, payoff, cf, wfContrib, wfDist});
  }
  const irr = bkXirr(values, dates);
  const moic = contrib ? dist/contrib : 0;
  return {s, u, d, rows, values, dates, irr, moic, dist, contrib};
};
