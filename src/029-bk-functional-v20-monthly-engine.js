
/* Punchlist Capital V2.0 - Monthly Engine group. Every sheet here reuses the already-verified engine
   (bkMonthlyReturns/bkWaterfallV07/bkAnnualCF/bkDebt) at its native monthly grain -- no separate
   or approximated calculation anywhere in this block. */

// ---- Waterfall (M): the same live bkWaterfallV07() engine Equity Waterfall already uses,
// shown in full (every month), where Equity Waterfall itself only shows the last 18 active months. ----
RENDERERS['Waterfall (M)'] = function(){
  const w = bkWaterfallV07(), s = w.s, m = n=>n<0?'('+bkFmt(-n)+')':bkFmt(n);
  const rr = w.rows.map(r=>`<tr><td class="rowlabel">${r.m}</td><td>${r.dt.toISOString().slice(0,7)}</td><td>${m(r.con)}</td><td>${m(r.dist)}</td><td>${m(r.t1)}</td><td>${m(r.catchup)}</td><td>${m(r.t2)}</td><td>${m(r.t3)}</td><td>${m(r.t4)}</td><td>${m(r.promote)}</td><td>${m(r.lpCF)}</td><td>${m(r.gpCF)}</td></tr>`).join('');
  const main = `<div class="tbl-wrap" style="max-height:640px;overflow:auto"><table class="fin"><caption>Waterfall (M) - Full Monthly Hurdle-Account Detail, All ${w.rows.length} Months</caption><thead><tr><th class="rowlabel-h">Mo</th><th>Date</th><th>Contribution</th><th>Available</th><th>Tier 1</th><th>Catch-Up</th><th>Tier 2</th><th>Tier 3</th><th>Tier 4</th><th>Promote</th><th>LP CF</th><th>GP CF</th></tr></thead><tbody>${rr}</tbody></table></div>
    <div class="note-flag"><span>&#10003;</span><div><b>Live -</b> every row is the waterfall engine's real per-month output, the same engine Equity Waterfall summarises to its last 18 active months. This is the full, unabridged monthly detail.</div></div>`;
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">Totals</div><div class="metric-list">
    <div class="metric-row"><span class="k">LP XIRR</span><span class="v">${isFinite(w.lpIRR)?bkPct(w.lpIRR):'-'}</span></div>
    <div class="metric-row"><span class="k">GP XIRR</span><span class="v">${isFinite(w.gpIRR)?bkPct(w.gpIRR):'-'}</span></div>
    <div class="metric-row"><span class="k">Total Promote</span><span class="v">${m(w.promote)}</span></div>
  </div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Monthly Engine</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
  return {title:'Waterfall (M)', crumbs:'Monthly Engine', desc:'Full monthly hurdle-account waterfall detail, every month of the hold.', meta:{Property:s.name,Months:w.rows.length,'LP XIRR':isFinite(w.lpIRR)?bkPct(w.lpIRR):'-',Currency:'USD'}, main, sidebar};
};

// ---- Lease Cohort CF: a real, formula-driven rollover projection built on V16's lease dates
// and global/per-unit rollover assumptions -- probability-weighted blend of renew-at-market vs.
// downtime-then-re-lease, since this app has no per-lease "decided outcome" field (nor should it
// fabricate one). Explicitly NOT wired into bkAnnualCF's core NOI -- that stays flat-growth and
// Excel-verified, unchanged. This is a supplemental lens on rollover risk, clearly labeled as such. ----
function bkCohortMonthEntry(unit, month, closing, dealState){
  const sf = Number(unit.sf)||0;
  const marketRentMo = Number(unit.marketRent)||0, inPlaceMo = Number(unit.inPlaceRent)||0;
  const eff = bkRolloverFor(unit, dealState);
  const p = Math.max(0, Math.min(1, Number(eff.renewalProbability)||0));
  const downtime = Math.max(0, Math.round(Number(eff.downtimeMonths)||0));

  if(!unit.leaseStart && !unit.leaseEnd){
    const luMonths = Math.max(1, downtime||6);
    if(month <= luMonths) return {status:'Lease-Up', rent:0, oneTime: month===1 ? (Number(eff.tiNewPerSF)*sf + Number(eff.lcNewPct)*marketRentMo*12) : 0};
    return {status:'Leased (New)', rent:marketRentMo, oneTime:0};
  }

  const rollMonth = bkLeaseRolloverMonth(unit.leaseEnd, closing);
  if(rollMonth===null || month < rollMonth) return {status:'In-Place', rent:inPlaceMo, oneTime:0};

  const monthsPast = month - rollMonth;
  const nonRenewRent = monthsPast < downtime ? 0 : marketRentMo;
  const blendedRent = p*marketRentMo + (1-p)*nonRenewRent;
  let oneTime = 0;
  if(month===rollMonth){
    const renewCost = Number(eff.tiRenewalPerSF)*sf + Number(eff.lcRenewalPct)*marketRentMo*12;
    const newCost = Number(eff.tiNewPerSF)*sf + Number(eff.lcNewPct)*marketRentMo*12;
    oneTime = p*renewCost + (1-p)*newCost;
  }
  return {status: monthsPast<downtime?'Rollover (blended)':'Rolled / Re-Leased (blended)', rent:blendedRent, oneTime};
}
function bkLeaseCohortCFV20(){
  const s = bkEnsureV16();
  const rr = Array.isArray(s.rentRoll) ? s.rentRoll : [];
  const holdMonths = Math.max(1, Math.round(Number(s.holdYears||10)*12));
  const n = Math.ceil(holdMonths/12);
  const perUnit = rr.map(u=>({u, rollMonth:bkLeaseRolloverMonth(u.leaseEnd, s.closing), eff:bkRolloverFor(u, s), overridden: !!(u.rolloverOverride && typeof u.rolloverOverride==='object')}));
  const annual = [];
  for(let y=1;y<=n;y++){
    let rent=0, oneTime=0;
    for(let mm=1; mm<=12; mm++){
      const month=(y-1)*12+mm; if(month>holdMonths) break;
      rr.forEach(u=>{ const e = bkCohortMonthEntry(u, month, s.closing, s); rent += e.rent; oneTime += e.oneTime; });
    }
    annual.push({y, rent, oneTime, net: rent-oneTime});
  }
  return {s, rr, perUnit, annual, holdMonths};
}
RENDERERS['Lease Cohort CF'] = function(){
  const x = bkLeaseCohortCFV20(), s = x.s, money = n=>n<0?'('+bkFmt(-n)+')':bkFmt(n);
  const unitRows = x.perUnit.map(({u,rollMonth,eff,overridden})=>`<tr><td class="rowlabel">${bkEsc(u.unitId||'-')}</td><td>${u.sf||0}</td><td>${u.leaseEnd||(u.leaseStart?'-':'Vacant at acq.')}</td><td>${rollMonth!==null?rollMonth:'-'}</td><td>${bkPct(Number(eff.renewalProbability)||0)}</td><td>${Number(eff.downtimeMonths)||0} mo</td><td>${overridden?'<span class="status-chip warn">Override</span>':'Global'}</td></tr>`).join('');
  const shown = x.annual.slice(0,10), heads = shown.map(r=>`<th>Year ${r.y}</th>`).join('');
  const main = `<div class="tbl-wrap"><table class="fin"><caption>Per-Unit Rollover Summary</caption><thead><tr><th class="rowlabel-h">Unit</th><th>SF</th><th>Lease End</th><th>Rollover Mo.</th><th>Renewal Prob.</th><th>Downtime</th><th>Assumptions</th></tr></thead><tbody>${unitRows||'<tr><td class="rowlabel" colspan="7">No rent roll units.</td></tr>'}</tbody></table></div>
    <div class="tbl-wrap" style="margin-top:16px;"><table class="fin"><caption>Blended Annual Lease Cohort Cash Flow - Projection</caption><thead><tr><th class="rowlabel-h">Line Item</th>${heads}</tr></thead><tbody>
    <tr><td class="rowlabel">Blended Rent (renewal/re-lease probability-weighted)</td>${shown.map(r=>`<td>${money(r.rent)}</td>`).join('')}</tr>
    <tr><td class="rowlabel">Blended TI/LC (rollover months only)</td>${shown.map(r=>`<td>${money(-r.oneTime)}</td>`).join('')}</tr>
    <tr class="grandtotal"><td class="rowlabel">Net Cohort Cash Flow</td>${shown.map(r=>`<td>${money(r.net)}</td>`).join('')}</tr>
    </tbody></table></div>
    <div class="note-flag"><span>&#9888;</span><div><b>Projection - not part of the core NOI or IRR -</b> this blends each lease's renewal-probability-weighted outcome (renew at market with a lighter TI/LC, or downtime and re-lease with fuller TI/LC) using each unit's lease dates and the rollover assumptions on Rent Roll. The operating statement and returns still use flat rent-roll growth; this page is a supplemental view of rollover risk. A unit that is vacant at acquisition uses the global downtime months as a lease-up period from month 1.</div></div>`;
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">Cohort Summary</div><div class="metric-list">
    <div class="metric-row"><span class="k">Units Tracked</span><span class="v">${x.rr.length}</span></div>
    <div class="metric-row"><span class="k">Year 1 Blended Rent</span><span class="v">${x.annual[0]?money(x.annual[0].rent):'-'}</span></div>
  </div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Monthly Engine</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip warn">Projection</span></span></div>`)}${colorKeyCard()}`);
  return {title:'Lease Cohort CF', crumbs:'Monthly Engine', desc:'Per-lease rollover projection: renewal-probability-weighted rent and TI/LC, not yet wired into core NOI.', meta:{Property:s.name,Units:x.rr.length,Currency:'USD',Status:'Projection'}, main, sidebar};
};

// ---- Shared helper: full monthly bkMonthlyReturns() for a portfolio snapshot, via the same
// safe scratch-copy swap bkPortfolioMetricsFor (Portfolio) already uses. ----
function bkPortfolioMonthlyFor(snapshot){
  const origLoad = window.bkLoad, origSave = window.bkSave;
  const scratch = JSON.parse(JSON.stringify(snapshot));
  window.bkLoad = function(){ return scratch; };
  window.bkSave = function(d){ Object.assign(scratch, d); };
  let out;
  try{ out = { ok:true, r: bkMonthlyReturns() }; }
  catch(e){ out = { ok:false, error:String((e&&e.message)||e) }; }
  finally{ window.bkLoad = origLoad; window.bkSave = origSave; }
  return out;
}

// ---- Portfolio M: calendar-aligned monthly cash flow combined across every saved deal ----
RENDERERS['Portfolio M'] = function(){
  const saved = bkPortfolioLoad(), money = n=>n<0?'('+bkFmt(-n)+')':bkFmt(n);
  const perDeal = saved.map(snap=>({snap, res:bkPortfolioMonthlyFor(snap)})).filter(x=>x.res.ok);
  const byYear = {};
  perDeal.forEach(({res})=>{ res.r.rows.forEach(row=>{ const yr=row.dt.getFullYear(); if(!byYear[yr]) byYear[yr]={cf:0,noi:0,ds:0}; byYear[yr].cf+=row.cf; byYear[yr].noi+=row.noi; byYear[yr].ds+=row.ds; }); });
  const years = Object.keys(byYear).map(Number).sort((a,b)=>a-b).slice(0,15);
  const heads = years.map(y=>`<th>${y}</th>`).join('');
  const main = `<div class="tbl-wrap"><table class="fin"><caption>Portfolio M - Calendar-Year Aggregated Monthly Equity Cash Flow (${perDeal.length} Deal(s))</caption><thead><tr><th class="rowlabel-h">Line Item</th>${heads}</tr></thead><tbody>
    <tr><td class="rowlabel">Combined NOI</td>${years.map(y=>`<td>${money(byYear[y].noi)}</td>`).join('')}</tr>
    <tr><td class="rowlabel">Combined Debt Service</td>${years.map(y=>`<td>${money(-byYear[y].ds)}</td>`).join('')}</tr>
    <tr class="grandtotal"><td class="rowlabel">Combined Net Equity Cash Flow</td>${years.map(y=>`<td>${money(byYear[y].cf)}</td>`).join('')}</tr>
    </tbody></table></div>
    <div class="note-flag"><span>&#10003;</span><div><b>Live -</b> each deal's real monthly return output is bucketed by actual calendar year and summed -- deals with different closing dates line up on the calendar, not on deal-relative month number.</div></div>`;
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">Portfolio M Summary</div><div class="metric-list">
    <div class="metric-row"><span class="k">Deals Included</span><span class="v">${perDeal.length}</span></div>
    <div class="metric-row"><span class="k">Calendar Years Shown</span><span class="v">${years.length}</span></div>
  </div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Monthly Engine</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
  return {title:'Portfolio M', crumbs:'Monthly Engine', desc:'Calendar-aligned monthly cash flow aggregated across every saved portfolio deal.', meta:{Deals:perDeal.length,Years:years.length,Currency:'USD'}, main, sidebar};
};

// ---- Deal Vectors (M): raw per-month vectors for the active deal -- what every other
// annual-summarized sheet in this app derives from. ----
RENDERERS['Deal Vectors (M)'] = function(){
  const s = bkLoad(), d = bkDebt(), r = bkMonthlyReturns(), money = n=>n<0?'('+bkFmt(-n)+')':bkFmt(n);
  const shown = r.rows; // WAVE 2C: display cap lifted from 24 to the full monthly vector
  const rows = shown.map((row,i)=>{ const dr = d.months[i]||{interest:0,principal:0,balance:0}; return `<tr><td class="rowlabel">${row.m}</td><td>${row.dt.toISOString().slice(0,7)}</td><td>${money(row.egi)}</td><td>${money(row.noi)}</td><td>${money(dr.interest)}</td><td>${money(dr.principal)}</td><td>${money(dr.balance)}</td><td>${money(row.ds)}</td><td>${money(row.assetFee)}</td><td>${money(row.cf)}</td></tr>`; }).join('');
  const main = `<div class="tbl-wrap" style="max-height:640px;overflow:auto"><table class="fin"><caption>Deal Vectors (M) - Raw Monthly Engine Output, All ${r.rows.length} Months</caption><thead><tr><th class="rowlabel-h">Mo</th><th>Date</th><th>EGI</th><th>NOI</th><th>Interest</th><th>Principal</th><th>Loan Balance</th><th>Debt Service</th><th>Asset Fee</th><th>Net Equity CF</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="note-flag"><span>&#10003;</span><div><b>Live -</b> the unaggregated monthly operating, debt and equity cash-flow vectors for the active deal - the figures every annual summary in the app is built from. Useful for exporting or spot-checking a specific month.</div></div>`;
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">Vector Lengths</div><div class="metric-list">
    <div class="metric-row"><span class="k">Months</span><span class="v">${r.rows.length}</span></div>
    <div class="metric-row"><span class="k">Hold</span><span class="v">${s.holdYears} yrs</span></div>
  </div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Monthly Engine</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
  return {title:'Deal Vectors (M)', crumbs:'Monthly Engine', desc:'Raw monthly EGI/NOI/debt/cash-flow vectors for the active deal.', meta:{Property:s.name,Months:r.rows.length,Currency:'USD'}, main, sidebar};
};

// ---- Ledger (M): the same verified monthly figures, broken into discrete transaction lines ----
RENDERERS['Ledger (M)'] = function(){
  const s = bkLoad(), u = bkAnnualCF(), r = bkMonthlyReturns(), money = n=>n<0?'('+bkFmt(-n)+')':bkFmt(n);
  const shown = r.rows; // WAVE 2C: display cap lifted from 24 to the full monthly vector
  const entries = [];
  shown.forEach((row,i)=>{
    const mo = u.monthly[i] || {egi:row.egi, noiBeforeReserves:row.noi, noi:row.noi};
    const opex = -(mo.egi - mo.noiBeforeReserves), reserve = -(mo.noiBeforeReserves - mo.noi), label = row.dt.toISOString().slice(0,7);
    entries.push({m:row.m, dt:label, item:'Revenue (EGI)', amt: mo.egi});
    entries.push({m:row.m, dt:label, item:'Operating Expenses', amt: opex});
    if(Math.abs(reserve)>0.005) entries.push({m:row.m, dt:label, item:'Reserves', amt: reserve});
    entries.push({m:row.m, dt:label, item:'Debt Service', amt: -row.ds});
    if(row.assetFee) entries.push({m:row.m, dt:label, item:'Asset Management Fee', amt: -row.assetFee});
    if(row.m===1) entries.push({m:row.m, dt:label, item:'Equity Contribution', amt: -Number(r.d.equity)});
    if(row.sale) entries.push({m:row.m, dt:label, item:'Sale Proceeds (Net)', amt: row.sale});
    if(row.dispoFee) entries.push({m:row.m, dt:label, item:'Disposition Fee', amt: -row.dispoFee});
    if(row.payoff) entries.push({m:row.m, dt:label, item:'Debt Payoff at Sale', amt: -row.payoff});
  });
  const rows = entries.map(e=>`<tr><td class="rowlabel">${e.m}</td><td>${e.dt}</td><td>${bkEsc(e.item)}</td><td>${money(e.amt)}</td></tr>`).join('');
  const main = `<div class="tbl-wrap" style="max-height:640px;overflow:auto"><table class="fin"><caption>Ledger (M) - Monthly Transaction Detail, All ${shown.length} Months</caption><thead><tr><th class="rowlabel-h">Mo</th><th>Date</th><th>Line Item</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="note-flag"><span>&#10003;</span><div><b>Live -</b> the same verified monthly figures as Property CF/Debt Schedule/Returns, broken into discrete per-month transaction lines rather than annual columns -- no separate calculation.</div></div>`;
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">Ledger</div><div class="metric-list">
    <div class="metric-row"><span class="k">Entries Shown</span><span class="v">${entries.length}</span></div>
    <div class="metric-row"><span class="k">Months Shown</span><span class="v">${shown.length} / ${r.rows.length}</span></div>
  </div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Monthly Engine</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
  return {title:'Ledger (M)', crumbs:'Monthly Engine', desc:'Discrete monthly transaction ledger for the active deal.', meta:{Property:s.name,Months:shown.length,Currency:'USD'}, main, sidebar};
};

bkRefreshRailStatus();
