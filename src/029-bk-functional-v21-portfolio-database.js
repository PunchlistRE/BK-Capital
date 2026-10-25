
/* Punchlist Capital V2.1 - Portfolio Database group. Reuses bkPortfolioLoad/bkPortfolioMetricsFor
   (Portfolio) throughout -- every figure is either a stored field on a real saved deal snapshot,
   or live output from the same verified engine. Individual-investor pages (Investors, Investor
   Schedules, Liquidity) still aren't built: they need a real LP cap-table data model (names,
   commitments, per-investor allocations) this app has never had, and this pass won't fabricate one.
   Equity Partners / Investor Summary below go as far as the REAL data supports: deal-level and
   portfolio-level GP/LP splits, which are genuine stored fields, not individual identities. */

RENDERERS['Property DB'] = function(){
  const saved = bkPortfolioLoad(), money = n=>bkFmt(n);
  const rows = saved.map(d=>`<tr><td class="rowlabel">${bkEsc(d.dealId||'-')}</td><td>${bkEsc(d.name||'-')}</td><td>${bkEsc(d.location||'-')}</td><td>${bkEsc(d.propertyType||'-')}</td><td>${bkEsc(d.dealType||'-')}</td><td>${bkEsc(d.status||'-')}</td><td>${bkEsc(d.closing||'-')}</td><td>${d.gsf?Number(d.gsf).toLocaleString():'-'}</td><td>${d.units||'-'}</td><td>${money(Number(d.purchasePrice)||0)}</td></tr>`).join('');
  const main = `<div class="tbl-wrap"><table class="fin"><caption>Property Database - ${saved.length} Saved Deal(s)</caption><thead><tr><th class="rowlabel-h">Deal ID</th><th>Name</th><th>Location</th><th>Property Type</th><th>Deal Type</th><th>Status</th><th>Closing</th><th>GSF</th><th>Units</th><th>Purchase Price</th></tr></thead><tbody>${rows||'<tr><td class="rowlabel" colspan="10">No deals saved yet -- save one from the Portfolio page.</td></tr>'}</tbody></table></div>
    <div class="note-flag"><span>&#10003;</span><div><b>Live -</b> every field is read straight from each deal's own saved snapshot (the same store Portfolio uses); nothing is invented.</div></div>`;
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">Database</div><div class="metric-list"><div class="metric-row"><span class="k">Deals</span><span class="v">${saved.length}</span></div></div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Portfolio Database</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
  return {title:'Property DB', crumbs:'Portfolio Database', desc:'Static property/deal attributes for every saved portfolio deal.', meta:{Deals:saved.length,Currency:'USD'}, main, sidebar};
};

RENDERERS['Portfolio CF'] = function(){
  const saved = bkPortfolioLoad(), money = n=>n<0?'('+bkFmt(-n)+')':bkFmt(n);
  const perDeal = saved.map(snap=>({snap, res:bkPortfolioMonthlyFor(snap)})).filter(x=>x.res.ok);
  if(perDeal.length===0){
    const emptyReason = saved.length===0 ? 'No saved deals - save an underwritten deal to populate Portfolio CF.' : 'Saved deal(s) exist but none produced a valid cash flow (see Portfolio for per-deal engine errors).';
    const main = `<div class="tbl-wrap"><table class="fin"><caption>Portfolio CF - Combined Annual Cash Flow by Deal-Relative Year (0 Deal(s))</caption><thead><tr><th class="rowlabel-h">Line Item</th></tr></thead><tbody><tr><td class="rowlabel" colspan="1">${emptyReason}</td></tr></tbody></table></div>`;
    const sidebar = sidebarShell(`<div class="card"><div class="card-head">Portfolio CF</div><div class="metric-list"><div class="metric-row"><span class="k">Deals</span><span class="v">0</span></div><div class="metric-row"><span class="k">Status</span><span class="v">NO SAVED DEALS</span></div></div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Portfolio Database</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
    return {title:'Portfolio CF', crumbs:'Portfolio Database', desc:'Combined annual cash flow across the portfolio, by deal-relative year.', meta:{Deals:0,Currency:'USD',Status:'No saved deals'}, main, sidebar};
  }
  // FINAL WAVE DEFECT FIX. This line read x.res.r.u.arr.length, and for a DEVELOPMENT
  // deal bkMonthlyReturns().u is a small summary object with no .arr - so any portfolio
  // containing a development deal made this whole sheet throw. The defect is pre-existing
  // (it reproduces identically on the RC2 build) and went unseen because no earlier QA
  // pass populated a portfolio. Acquisition deals still read u.arr, byte for byte, so no
  // existing portfolio figure moves; a development deal now folds its OWN monthly rows -
  // the same engine's own egi and noi - into deal-relative years instead of crashing.
  const bkPortfolioAnnual = r => {
    if(r && r.u && Array.isArray(r.u.arr)) return r.u.arr;
    const rows = (r && r.rows) || [], out = [];
    rows.forEach((row,i)=>{ const y=Math.floor(i/12);
      if(!out[y]) out[y] = {y:y+1, egi:0, expenses:0, noi:0, after:0};
      const e = Number(row.egi)||0, n = Number(row.noi)||0;
      out[y].egi += e; out[y].noi += n; out[y].after += n; out[y].expenses += (e-n); });
    return out;
  };
  const maxYears = perDeal.reduce((z,x)=>Math.max(z, bkPortfolioAnnual(x.res.r).length), 0);
  const byYear = Array.from({length:Math.min(maxYears,15)}, (_,i)=>({y:i+1, egi:0, expenses:0, noi:0, ds:0, cf:0}));
  perDeal.forEach(({res})=>{
    bkPortfolioAnnual(res.r).forEach((a,i)=>{ if(byYear[i]){ byYear[i].egi+=a.egi; byYear[i].expenses+=a.expenses; byYear[i].noi+=a.after; } });
    res.r.rows.forEach((row,i)=>{ const y=Math.floor(i/12); if(byYear[y]){ byYear[y].ds+=row.ds; byYear[y].cf+=row.cf; } });
  });
  const heads = byYear.map(r=>`<th>Year ${r.y}</th>`).join('');
  const main = `<div class="tbl-wrap"><table class="fin"><caption>Portfolio CF - Combined Annual Cash Flow by Deal-Relative Year (${perDeal.length} Deal(s))</caption><thead><tr><th class="rowlabel-h">Line Item</th>${heads}</tr></thead><tbody>
    <tr><td class="rowlabel">Combined EGI</td>${byYear.map(r=>`<td>${money(r.egi)}</td>`).join('')}</tr>
    <tr><td class="rowlabel">Combined Operating Expenses</td>${byYear.map(r=>`<td>${money(-r.expenses)}</td>`).join('')}</tr>
    <tr class="grandtotal"><td class="rowlabel">Combined NOI</td>${byYear.map(r=>`<td>${money(r.noi)}</td>`).join('')}</tr>
    <tr><td class="rowlabel">Combined Debt Service</td>${byYear.map(r=>`<td>${money(-r.ds)}</td>`).join('')}</tr>
    <tr class="grandtotal"><td class="rowlabel">Combined Net Equity Cash Flow</td>${byYear.map(r=>`<td>${money(r.cf)}</td>`).join('')}</tr>
    </tbody></table></div>
    <div class="note-flag"><span>&#10003;</span><div><b>Live -</b> each deal's real annual arrays (own Year 1, Year 2, ...) are summed by deal-relative year across the portfolio -- complements Portfolio M's calendar-aligned view under Monthly Engine.</div></div>`;
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">Portfolio CF</div><div class="metric-list"><div class="metric-row"><span class="k">Deals</span><span class="v">${perDeal.length}</span></div><div class="metric-row"><span class="k">Year 1 Combined NOI</span><span class="v">${byYear[0]?money(byYear[0].noi):'-'}</span></div></div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Portfolio Database</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
  return {title:'Portfolio CF', crumbs:'Portfolio Database', desc:'Combined annual cash flow across the portfolio, by deal-relative year.', meta:{Deals:perDeal.length,Currency:'USD'}, main, sidebar};
};

RENDERERS['Equity Partners'] = function(){
  const saved = bkPortfolioLoad(), money = n=>bkFmt(n);
  const rows = saved.map(snap=>{
    const m = bkPortfolioMetricsFor(snap);
    if(!m.ok) return `<tr><td class="rowlabel">${bkEsc(snap.name||'-')}</td><td colspan="6">Engine error: ${bkEsc(m.error||'')}</td></tr>`;
    const gpShare = Number(snap.gpShare)||0, lpShare=1-gpShare, gpEq=m.equity*gpShare, lpEq=m.equity*lpShare;
    return `<tr><td class="rowlabel">${bkEsc(snap.name||'-')}</td><td>${money(m.equity)}</td><td>${bkPct(lpShare)}</td><td>${money(lpEq)}</td><td>${bkPct(gpShare)}</td><td>${money(gpEq)}</td><td>${bkPct(Number(snap.pref)||0)}</td></tr>`;
  }).join('');
  const main = `<div class="tbl-wrap"><table class="fin"><caption>Equity Partners - GP / LP Capital Structure by Deal</caption><thead><tr><th class="rowlabel-h">Deal</th><th>Total Equity</th><th>LP %</th><th>LP Equity</th><th>GP %</th><th>GP Equity</th><th>Pref</th></tr></thead><tbody>${rows||'<tr><td class="rowlabel" colspan="7">No deals saved yet.</td></tr>'}</tbody></table></div>
    <div class="note-flag"><span>&#9888;</span><div><b>Deal-level capital structure only -</b> the GP/LP split, equity and preferred return come from each deal. Individual investors and their commitments live on the Investors page, so this page stops at the deal-level split.</div></div>`;
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">Structure</div><div class="metric-list"><div class="metric-row"><span class="k">Deals</span><span class="v">${saved.length}</span></div></div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Portfolio Database</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
  return {title:'Equity Partners', crumbs:'Portfolio Database', desc:'GP/LP equity split and preferred return by deal.', meta:{Deals:saved.length,Currency:'USD'}, main, sidebar};
};

RENDERERS['Investor Summary'] = function(){
  const saved = bkPortfolioLoad(), money = n=>bkFmt(n);
  const rows = saved.map(snap=>({snap, m:bkPortfolioMetricsFor(snap)})).filter(x=>x.m.ok);
  if(rows.length===0){
    const main = `<div class="tbl-wrap"><table class="fin"><caption>Investor Summary - Portfolio-Level GP / LP Rollup</caption><tbody>
      <tr><td class="rowlabel" colspan="2">No saved deals - save an underwritten deal to populate the GP/LP rollup.</td></tr>
      </tbody></table></div>
      <div class="note-flag"><span>&#9888;</span><div><b>Aggregate only, no investor identities -</b> this rolls up the same real per-deal GP/LP equity split (Equity Partners) to a portfolio total. Named investors, individual commitments, and per-investor cash-flow allocation need a real cap-table data model this app doesn't have yet -- flagging rather than fabricating names or amounts.</div></div>`;
    const sidebar = sidebarShell(`<div class="card"><div class="card-head">Rollup</div><div class="metric-list"><div class="metric-row"><span class="k">Deals</span><span class="v">0</span></div><div class="metric-row"><span class="k">Status</span><span class="v">NO SAVED DEALS</span></div></div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Portfolio Database</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
    return {title:'Investor Summary', crumbs:'Portfolio Database', desc:'Portfolio-level GP/LP equity rollup (aggregate, no individual investor data).', meta:{Deals:0,'Total Equity':'-',Currency:'USD',Status:'No saved deals'}, main, sidebar};
  }
  let totalEq=0, totalLP=0, totalGP=0;
  rows.forEach(({snap,m})=>{ const gp=Number(snap.gpShare)||0; totalEq+=m.equity; totalGP+=m.equity*gp; totalLP+=m.equity*(1-gp); });
  const main = `<div class="tbl-wrap"><table class="fin"><caption>Investor Summary - Portfolio-Level GP / LP Rollup</caption><tbody>
    <tr><td class="rowlabel">Total Portfolio Equity</td><td class="v">${money(totalEq)}</td></tr>
    <tr><td class="rowlabel">Total LP Equity</td><td class="v">${money(totalLP)}</td><td>${totalEq?bkPct(totalLP/totalEq):'-'}</td></tr>
    <tr class="grandtotal"><td class="rowlabel">Total GP Equity</td><td class="v">${money(totalGP)}</td><td>${totalEq?bkPct(totalGP/totalEq):'-'}</td></tr>
    </tbody></table></div>
    <div class="note-flag"><span>&#9888;</span><div><b>Aggregate only, no investor identities -</b> this rolls up the same real per-deal GP/LP equity split (Equity Partners) to a portfolio total. Named investors, individual commitments, and per-investor cash-flow allocation need a real cap-table data model this app doesn't have yet -- flagging rather than fabricating names or amounts.</div></div>`;
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">Rollup</div><div class="metric-list"><div class="metric-row"><span class="k">Deals</span><span class="v">${rows.length}</span></div><div class="metric-row"><span class="k">Total Equity</span><span class="v">${money(totalEq)}</span></div></div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Portfolio Database</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
  return {title:'Investor Summary', crumbs:'Portfolio Database', desc:'Portfolio-level GP/LP equity rollup (aggregate, no individual investor data).', meta:{Deals:rows.length,'Total Equity':money(totalEq),Currency:'USD'}, main, sidebar};
};

RENDERERS['Capital Calls'] = function(){
  const saved = bkPortfolioLoad(), money = n=>bkFmt(n);
  const calls = saved.map(snap=>{ const m=bkPortfolioMetricsFor(snap); return {name:snap.name, closing:snap.closing, ok:m.ok, equity:m.ok?m.equity:0}; }).sort((a,b)=>String(a.closing).localeCompare(String(b.closing)));
  const rows = calls.map(c=>`<tr><td class="rowlabel">${bkEsc(c.name||'-')}</td><td>${bkEsc(c.closing||'-')}</td><td>${c.ok?money(c.equity):'engine error'}</td></tr>`).join('');
  const total = calls.reduce((z,c)=>z+(c.ok?c.equity:0),0);
  const main = `<div class="tbl-wrap"><table class="fin"><caption>Capital Calls - Equity Funding Schedule by Deal Closing</caption><thead><tr><th class="rowlabel-h">Deal</th><th>Closing / Call Date</th><th>Equity Called</th></tr></thead><tbody>${rows||'<tr><td class="rowlabel" colspan="3">No deals saved yet.</td></tr>'}<tr class="grandtotal"><td class="rowlabel">Total Called</td><td></td><td>${money(total)}</td></tr></tbody></table></div>
    <div class="note-flag"><span>&#9888;</span><div><b>One call, at closing -</b> each deal draws all of its equity in month 1, so there is a single call per deal for its full equity amount. Phased or multi-tranche equity calls are not modelled for acquisitions (development draws are separate).</div></div>`;
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">Calls</div><div class="metric-list"><div class="metric-row"><span class="k">Deals</span><span class="v">${calls.length}</span></div><div class="metric-row"><span class="k">Total Called</span><span class="v">${money(total)}</span></div></div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Portfolio Database</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
  return {title:'Capital Calls', crumbs:'Portfolio Database', desc:'Equity funding schedule across the portfolio, one call per deal at closing.', meta:{Deals:calls.length,'Total Called':money(total),Currency:'USD'}, main, sidebar};
};

RENDERERS['Capital Allocation'] = function(){
  const saved = bkPortfolioLoad(), money = n=>bkFmt(n);
  const computed = saved.map(snap=>({snap, m:bkPortfolioMetricsFor(snap)})).filter(x=>x.m.ok);
  const totalEq = computed.reduce((z,x)=>z+x.m.equity,0);
  const byDeal = computed.map(({snap,m})=>`<tr><td class="rowlabel">${bkEsc(snap.name||'-')}</td><td class="v">${money(m.equity)}</td><td class="v">${totalEq?bkPct(m.equity/totalEq):'-'}</td></tr>`).join('');
  const byType = {}; computed.forEach(({snap,m})=>{ const t=snap.propertyType||'Other'; byType[t]=(byType[t]||0)+m.equity; });
  const typeRows = Object.entries(byType).map(([t,v])=>`<tr><td class="rowlabel">${bkEsc(t)}</td><td class="v">${money(v)}</td><td class="v">${totalEq?bkPct(v/totalEq):'-'}</td></tr>`).join('');
  const main = `<div class="tbl-wrap"><table class="fin"><caption>Capital Allocation - Equity by Deal</caption><thead><tr><th class="rowlabel-h">Deal</th><th class="v">Equity ($)</th><th class="v">% of Portfolio</th></tr></thead><tbody>${byDeal||'<tr><td class="rowlabel" colspan="3">No deals saved yet.</td></tr>'}<tr class="grandtotal"><td class="rowlabel">Total</td><td class="v">${money(totalEq)}</td><td class="v">${totalEq?'100.00%':'-'}</td></tr></tbody></table></div>
    <div class="tbl-wrap" style="margin-top:16px;"><table class="fin"><caption>Capital Allocation - Equity by Property Type</caption><thead><tr><th class="rowlabel-h">Property Type</th><th class="v">Equity ($)</th><th class="v">% of Portfolio</th></tr></thead><tbody>${typeRows||'<tr><td class="rowlabel" colspan="3">No deals saved yet.</td></tr>'}</tbody></table></div>
    <div class="note-flag"><span>&#10003;</span><div><b>Live -</b> both breakdowns are the same per-deal equity figures as Portfolio/Portfolio Dashboard, just sliced by deal and by property type.</div></div>`;
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">Allocation</div><div class="metric-list"><div class="metric-row"><span class="k">Total Equity</span><span class="v">${money(totalEq)}</span></div><div class="metric-row"><span class="k">Deals</span><span class="v">${computed.length}</span></div></div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Portfolio Database</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
  return {title:'Capital Allocation', crumbs:'Portfolio Database', desc:'Portfolio equity sliced by deal and by property type.', meta:{Deals:computed.length,'Total Equity':money(totalEq),Currency:'USD'}, main, sidebar};
};

RENDERERS['Portfolio Rollup'] = function(){
  const saved = bkPortfolioLoad(), money = n=>bkFmt(n);
  const computed = saved.map(snap=>({snap, m:bkPortfolioMetricsFor(snap)})).filter(x=>x.m.ok);
  const totalPrice = computed.reduce((z,x)=>z+x.m.purchasePrice,0), totalLoan = computed.reduce((z,x)=>z+x.m.loan,0), totalEquity = computed.reduce((z,x)=>z+x.m.equity,0), totalNOI = computed.reduce((z,x)=>z+x.m.y1noi,0);
  const blendedCap = totalPrice? totalNOI/totalPrice : 0, blendedLTV = totalPrice? totalLoan/totalPrice : 0;
  const wIRR = window.__BK_CR_wIRR(computed.map(x=>x.m));
  const main = `<div class="tbl-wrap"><table class="fin"><caption>Portfolio Rollup - Consolidated Snapshot (${computed.length} Deal(s))</caption><tbody>
    <tr><td class="rowlabel">Total Purchase Price (Gross Assets)</td><td class="v">${money(totalPrice)}</td></tr>
    <tr><td class="rowlabel">Total Debt</td><td class="v">${money(totalLoan)}</td></tr>
    <tr class="grandtotal"><td class="rowlabel">Total Equity</td><td class="v">${money(totalEquity)}</td></tr>
    <tr><td class="rowlabel">Blended Loan-to-Value</td><td class="v">${bkPct(blendedLTV)}</td></tr>
    <tr><td class="rowlabel">Year 1 Combined NOI</td><td class="v">${money(totalNOI)}</td></tr>
    <tr><td class="rowlabel">Blended Going-In Cap Rate</td><td class="v">${bkPct(blendedCap)}</td></tr>
    <tr class="grandtotal"><td class="rowlabel">Equity-Weighted Levered IRR</td><td class="v">${bkPct(wIRR)}</td></tr>
    </tbody></table></div>
    <div class="note-flag"><span>&#10003;</span><div><b>Live -</b> a single-period consolidated view (vs. Portfolio CF's multi-year time series): every figure sums or weights the same real per-deal engine output.</div></div>`;
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">Rollup</div><div class="metric-list"><div class="metric-row"><span class="k">Blended Cap Rate</span><span class="v">${bkPct(blendedCap)}</span></div><div class="metric-row"><span class="k">Blended LTV</span><span class="v">${bkPct(blendedLTV)}</span></div><div class="metric-row"><span class="k">Wtd. IRR</span><span class="v">${bkPct(wIRR)}</span></div></div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Portfolio Database</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
  return {title:'Portfolio Rollup', crumbs:'Portfolio Database', desc:'Single-period consolidated balance-sheet-style rollup of the whole portfolio.', meta:{Deals:computed.length,'Blended Cap':bkPct(blendedCap),'Blended LTV':bkPct(blendedLTV),Currency:'USD'}, main, sidebar};
};

RENDERERS['Benchmarks'] = function(){
  const saved = bkPortfolioLoad();
  const rows = saved.map(snap=>{
    const m = bkPortfolioMetricsFor(snap);
    if(!m.ok) return `<tr><td class="rowlabel">${bkEsc(snap.name||'-')}</td><td colspan="5">Engine error</td></tr>`;
    const goingInCap = m.purchasePrice? m.y1noi/m.purchasePrice : 0;
    const targetIRR = snap.reverseSolveTargetIRR!=null ? Number(snap.reverseSolveTargetIRR) : null;
    const irrPass = targetIRR!=null ? (m.irr>=targetIRR-0.0001) : null;
    return `<tr><td class="rowlabel">${bkEsc(snap.name||'-')}</td><td>${bkPct(goingInCap)}</td><td>${m.moic.toFixed(2)}x</td><td>${bkPct(m.irr)}</td><td>${targetIRR!=null?bkPct(targetIRR):'-'}</td><td>${targetIRR!=null?(irrPass?'<span class="status-chip pass">PASS</span>':'<span class="status-chip fail">BELOW</span>'):'-'}</td></tr>`;
  }).join('');
  const main = `<div class="tbl-wrap"><table class="fin"><caption>Benchmarks - Actual vs. Each Deal's Own Underwriting Target</caption><thead><tr><th class="rowlabel-h">Deal</th><th>Going-In Cap Rate</th><th>MOIC</th><th>Levered IRR</th><th>Target IRR</th><th>Status</th></tr></thead><tbody>${rows||'<tr><td class="rowlabel" colspan="6">No deals saved yet.</td></tr>'}</tbody></table></div>
    <div class="note-flag"><span>&#9888;</span><div><b>Against each deal's own targets -</b> this compares each deal's live results with the targets stored on that deal (such as the target IRR from Reverse Solve). For published market ranges - cap rates, expenses and debt terms - see Market Benchmarks under Underwrite.</div></div>`;
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">Benchmarks</div><div class="metric-list"><div class="metric-row"><span class="k">Deals</span><span class="v">${saved.length}</span></div></div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Portfolio Database</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
  return {title:'Benchmarks', crumbs:'Portfolio Database', desc:"Each deal's live metrics against its own stored underwriting targets (no external market data source).", meta:{Deals:saved.length,Currency:'USD'}, main, sidebar};
};

RENDERERS['Sources & Uses'] = function(){
  const s = bkLoad(), d = bkDebt(), money = n=>bkFmt(n);
  const isDev = String(s.dealType||'').toLowerCase().includes('develop');
  let usesRows, totalUses;
  if(isDev && typeof bkDevV09==='function'){
    const x = bkDevV09();
    usesRows = `<tr><td class="rowlabel">Land / Purchase Price</td><td class="v">${money(x.land)}</td></tr><tr><td class="rowlabel">Closing / Diligence Costs</td><td class="v">${money(x.close)}</td></tr><tr><td class="rowlabel">Acquisition Fee</td><td class="v">${money(x.acq)}</td></tr><tr><td class="rowlabel">Hard Costs</td><td class="v">${money(x.hard)}</td></tr><tr><td class="rowlabel">Soft Costs</td><td class="v">${money(x.soft)}</td></tr><tr><td class="rowlabel">Loan Origination Fee</td><td class="v">${money(d.fee)}</td></tr>`;
    totalUses = x.unlev + d.fee;
  } else {
    const price = Number(s.purchasePrice)||0, closing = price*Number(s.closingCostsPct||0), acqFee = price*bkAcqFeePct(s);
    usesRows = `<tr><td class="rowlabel">Purchase Price</td><td class="v">${money(price)}</td></tr><tr><td class="rowlabel">Closing Costs</td><td class="v">${money(closing)}</td></tr><tr><td class="rowlabel">Acquisition Fee</td><td class="v">${money(acqFee)}</td></tr><tr><td class="rowlabel">Loan Origination Fee</td><td class="v">${money(d.fee)}</td></tr>`;
    totalUses = price+closing+acqFee+d.fee;
  }
  const main = `<div class="tbl-wrap"><table class="fin"><caption>Sources &amp; Uses - Active Deal</caption><thead><tr><th class="rowlabel-h" colspan="2">Uses</th></tr></thead><tbody>${usesRows}<tr class="grandtotal"><td class="rowlabel">TOTAL USES</td><td class="v">${money(totalUses)}</td></tr></tbody></table></div>
    <div class="tbl-wrap" style="margin-top:16px;"><table class="fin"><caption>Sources</caption><thead><tr><th class="rowlabel-h" colspan="2">Sources</th></tr></thead><tbody>
    <tr><td class="rowlabel">Acquisition Loan</td><td class="v">${money(d.loan)}</td></tr>
    <tr><td class="rowlabel">Sponsor / LP Equity</td><td class="v">${money(d.equity)}</td></tr>
    <tr class="grandtotal"><td class="rowlabel">TOTAL SOURCES</td><td class="v">${money(d.loan+d.equity)}</td></tr>
    </tbody></table></div>
    <div class="note-flag"><span>&#10003;</span><div><b>Live -</b> Uses and Sources reuse the figures already calculated on Debt and Deal Underwrite${isDev?' and the development budget':''}; this page lays them out in standard Sources &amp; Uses form. Total Uses and Total Sources tie by construction, since equity is defined as basis + fee - loan.</div></div>`;
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">S&amp;U Check</div><div class="metric-list"><div class="metric-row"><span class="k">Total Uses</span><span class="v">${money(totalUses)}</span></div><div class="metric-row"><span class="k">Total Sources</span><span class="v">${money(d.loan+d.equity)}</span></div><div class="metric-row"><span class="k">Loan / Equity</span><span class="v">${money(d.loan)} / ${money(d.equity)}</span></div></div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Portfolio Database</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
  return {title:'Sources & Uses', crumbs:'Portfolio Database', desc:'Standard Sources & Uses table for the active deal.', meta:{Property:s.name,'Total Uses':money(totalUses),Currency:'USD'}, main, sidebar};
};

bkRefreshRailStatus();
