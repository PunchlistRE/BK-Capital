
/* Punchlist Capital V1.7 - three sheets that were "Queued for a later batch" but need no new
   calc engine, only a new view over bkAnnualCF()/bkDebt()/bkMonthlyReturns(), which are
   already verified exact against Excel: Covenant Monitor, Sensitivity, Reverse Solve.
   Also fixes a real bug: the sidebar's Rendered/Queued status was computed once, at page
   load, from a 5-item DONE array that was never updated as later patches (V4-V16) added
   real RENDERERS entries for Debt, Debt Schedule, Development, Dev Schedule, Dev Draws,
   Residual Land, Returns, Equity Waterfall, Sponsor CF and QA -- so all of those showed
   "Queued" in the rail even though they render real content. Fixed to check RENDERERS
   live instead of a stale snapshot. */

function bkRefreshRailStatus(){ bkBuildRail(); }

// ---- Covenant Monitor ----
// Ongoing DSCR / Debt Yield test, year by year, against the deal's minimum DSCR
// (acqDSCR -- already used to size the loan at close) and a minimum Debt Yield covenant
// (new field, minDebtYield, defaulted to 8% -- typical of a lender's ongoing covenant,
// distinct from the LTV/LTC/DSCR constraints used only at origination).
function bkEnsureV17(){
  const s = bkLoad(); let dirty=false;
  if(s.minDebtYield===undefined){ s.minDebtYield=0.08; dirty=true; }
  if(dirty) bkSave(s);
  return s;
}
RENDERERS['Covenant Monitor'] = function(){
  const s = bkEnsureV17(), u = bkAnnualCF(), d = bkDebt();
  const money = n => n<0?'($'+bkFmt(-n)+')':'$'+bkFmt(n);
  const minDSCR = Number(s.acqDSCR)||0, minDY = Number(s.minDebtYield)||0;
  const rows = u.arr.map((a,i)=>{
    const ds = d.annual[i] || {payment:0, ending:d.debtAtSale};
    const dscr = ds.payment ? a.after/ds.payment : Infinity;
    const dy = ds.ending ? a.after/ds.ending : Infinity;
    const dscrPass = dscr>=minDSCR-0.0001, dyPass = dy>=minDY-0.0001;
    return {y:a.y, noi:a.after, ds:ds.payment, ending:ds.ending, dscr, dy, dscrPass, dyPass};
  });
  const heads = rows.map(r=>`<th>Year ${r.y}</th>`).join('');
  const cell = (r,ok)=>`<td class="${ok?'':'fail-cell'}">${ok?'<span class="status-chip pass">PASS</span>':'<span class="status-chip fail">FAIL</span>'}</td>`;
  const main = `<div class="tbl-wrap"><table class="fin"><caption>Covenant Monitor - DSCR &amp; Debt Yield, tested annually against the acquisition loan</caption>
    <thead><tr><th class="rowlabel-h">Line Item</th>${heads}</tr></thead><tbody>
    <tr><td class="rowlabel">NOI After Reserves</td>${rows.map(r=>`<td>${money(r.noi)}</td>`).join('')}</tr>
    <tr><td class="rowlabel">Annual Debt Service</td>${rows.map(r=>`<td>${money(-r.ds)}</td>`).join('')}</tr>
    <tr><td class="rowlabel">Ending Loan Balance</td>${rows.map(r=>`<td>${money(r.ending)}</td>`).join('')}</tr>
    <tr class="grandtotal"><td class="rowlabel">DSCR (min ${minDSCR.toFixed(2)}x)</td>${rows.map(r=>`<td>${isFinite(r.dscr)?r.dscr.toFixed(2)+'x':'-'}</td>`).join('')}</tr>
    <tr>${(()=>`<td class="rowlabel">DSCR Test</td>`)()}${rows.map(r=>cell(r,r.dscrPass)).join('')}</tr>
    <tr class="grandtotal"><td class="rowlabel">Debt Yield (min ${bkPct(minDY)})</td>${rows.map(r=>`<td>${isFinite(r.dy)?bkPct(r.dy):'-'}</td>`).join('')}</tr>
    <tr><td class="rowlabel">Debt Yield Test</td>${rows.map(r=>cell(r,r.dyPass)).join('')}</tr>
    </tbody></table></div>
    <div class="tbl-wrap" style="margin-top:16px;"><table class="fin"><caption>Covenant Inputs</caption><thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr></thead><tbody>
    ${bkInput('Minimum Debt Yield Covenant','minDebtYield','%','pct')}
    </tbody></table></div>
    <div class="note-flag"><span>&#10003;</span><div><b>Live covenant monitor -</b> pulled from the same exact monthly-verified NOI (<code>bkAnnualCF</code>) and amortization schedule (<code>bkDebt</code>) used everywhere else in this app; no separate calculation. Minimum DSCR reuses the acquisition loan's underwriting DSCR input.</div></div>`;
  const allPass = rows.every(r=>r.dscrPass && r.dyPass);
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">Covenant Status</div><div class="metric-list">
    <div class="metric-row"><span class="k">Overall</span><span class="v"><span class="status-chip ${allPass?'pass':'fail'}">${allPass?'All Years Pass':'Breach Detected'}</span></span></div>
    <div class="metric-row"><span class="k">Min DSCR</span><span class="v">${minDSCR.toFixed(2)}x</span></div>
    <div class="metric-row"><span class="k">Min Debt Yield</span><span class="v">${bkPct(minDY)}</span></div>
  </div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Debt</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
  return {title:'Covenant Monitor', crumbs:'Debt', desc:'Annual DSCR and Debt Yield covenant tests against the acquisition loan.', meta:{Property:s.name,Loan:money(d.loan),Rate:bkPct(s.acqRate),Amort:s.acqAmort+' yrs',Currency:'USD'}, main, sidebar};
};

// ---- Sensitivity ----
// 2-variable grid (Exit Cap x Market Rent Growth), each cell a genuine re-run of the
// verified bkMonthlyReturns()/bkAnnualCF() chain with that scenario's inputs substituted
// -- not an approximation. bkLoad/bkSave are swapped to an in-memory copy of the current
// deal for the duration of the sweep so nothing touches the real saved deal or needs a
// page reload per cell.
function bkRunScenario(overrides){
  // bkSave() writes straight to localStorage, independent of bkLoad -- swapping only
  // bkLoad would still let a nested bkEnsureVxx() "dirty" default-fill permanently
  // overwrite the REAL saved deal with this scenario's values. Both must be swapped to
  // no-ops for the scenario call, or a sensitivity/reverse-solve run could silently
  // corrupt whatever deal is actually saved.
  const real = bkLoad();
  const scenario = Object.assign({}, real, overrides);
  const origLoad = window.bkLoad, origSave = window.bkSave;
  window.bkLoad = function(){ return scenario; };
  window.bkSave = function(d){ Object.assign(scenario, d); }; // mutate the scratch copy only
  let out;
  try{ const x = bkMonthlyReturns(); out = {irr:x.irr, moic:x.moic}; }
  finally{ window.bkLoad = origLoad; window.bkSave = origSave; }
  return out;
}
RENDERERS['Sensitivity'] = function(){
  const s = bkLoad();
  const baseCap = Number(s.exitCap)||0.07, baseGrowth = Number(s.commercialRentGrowth)||0.025;
  const capSteps = [-0.01,-0.005,0,0.005,0.01].map(d=>baseCap+d);
  const growthSteps = [-0.01,-0.005,0,0.005,0.01].map(d=>baseGrowth+d);
  const grid = capSteps.map(cap => growthSteps.map(gr => {
    try{ return bkRunScenario({exitCap:cap, commercialRentGrowth:gr, rentGrowth:gr}); }
    catch(e){ return {irr:NaN, moic:NaN}; }
  }));
  const headRow = `<tr><th class="rowlabel-h">Exit Cap \\ Rent Growth</th>${growthSteps.map(g=>`<th>${bkPct(g)}</th>`).join('')}</tr>`;
  const bodyRows = capSteps.map((cap,i)=>`<tr><td class="rowlabel">${bkPct(cap)}${cap===baseCap?' (base)':''}</td>${grid[i].map((c,j)=>{
    const isBase = cap===baseCap && growthSteps[j]===baseGrowth;
    return `<td class="${isBase?'grandtotal':''}">${isFinite(c.irr)?bkPct(c.irr):'n/a'}<br><span style="opacity:.65;font-size:.85em">${isFinite(c.moic)?c.moic.toFixed(2)+'x':''}</span></td>`;
  }).join('')}</tr>`).join('');
  const main = `<div class="tbl-wrap"><table class="fin"><caption>Levered IRR / MOIC Sensitivity - Exit Cap Rate × Market Rent Growth (live re-run of the verified engine per cell)</caption><thead>${headRow}</thead><tbody>${bodyRows}</tbody></table></div>
    <div class="note-flag"><span>&#10003;</span><div><b>Live sensitivity -</b> every cell re-runs the full monthly engine with Exit Cap and Rent Growth swapped for that scenario's values, on a scratch copy of the deal (the saved deal and every other sheet are untouched). It is not a lookup table or a linear approximation.</div></div>`;
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">Base Case</div><div class="metric-list">
    <div class="metric-row"><span class="k">Exit Cap</span><span class="v">${bkPct(baseCap)}</span></div>
    <div class="metric-row"><span class="k">Rent Growth</span><span class="v">${bkPct(baseGrowth)}</span></div>
  </div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Tools</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
  return {title:'Sensitivity', crumbs:'Tools', desc:'Levered IRR/MOIC across Exit Cap and Rent Growth scenarios, each a live re-run of the real engine.', meta:{Property:s.name,Base_IRR:'-',Currency:'USD'}, main, sidebar};
};

// ---- Reverse Solve ----
// Bisection search for the Purchase Price that hits a target Levered IRR, re-running the
// real bkMonthlyReturns()/bkDebt() chain each iteration (same bkRunScenario harness as
// Sensitivity above) rather than a closed-form approximation.
function bkReverseSolvePrice(targetIRR, s){
  s = s || bkLoad();
  let lo = Number(s.purchasePrice)*0.5, hi = Number(s.purchasePrice)*2.0;
  const irrAt = p => { try{ return bkRunScenario({purchasePrice:p}).irr; } catch(e){ return NaN; } };
  let fLo = irrAt(lo)-targetIRR, fHi = irrAt(hi)-targetIRR;
  if(!isFinite(fLo)||!isFinite(fHi)||fLo*fHi>0) return {solved:false};
  let mid=lo, fMid=fLo;
  for(let k=0;k<60;k++){
    mid = (lo+hi)/2; fMid = irrAt(mid)-targetIRR;
    if(Math.abs(fMid)<1e-7) break;
    if(fLo*fMid<=0){ hi=mid; } else { lo=mid; fLo=fMid; }
  }
  return {solved:true, price:mid, irr:irrAt(mid)};
}
// V2.6 fix: a reverse-solve target must be an EXPLICIT user input. Blank/unset must never silently
// become a fabricated default (this used to fall back to 13%, then briefly to 0% with an "OK" chip --
// both are the same bug: treating "nothing entered" as if it were a real, solved-for target). Clearing
// the box removes the key entirely (true "unset"), not a stored 0 -- so a deliberately-entered 0% (a
// genuine break-even target) still reads as a real input, distinct from never having entered one.
window.bkSetReverseSolveTarget = function(el){
  const s = bkLoad();
  const t = (el && el.textContent!==undefined ? el.textContent : '').trim().replace(/[%,]/g,'');
  if(t===''){ delete s.reverseSolveTargetIRR; }
  else { const v = parseFloat(t); if(isNaN(v)) delete s.reverseSolveTargetIRR; else s.reverseSolveTargetIRR = v/100; }
  bkSave(s); showSheet(currentSheet);
};
RENDERERS['Reverse Solve'] = function(){
  const s = bkLoad();
  const hasTarget = s.reverseSolveTargetIRR!=null && isFinite(Number(s.reverseSolveTargetIRR));
  const targetIRR = hasTarget ? Number(s.reverseSolveTargetIRR) : null;
  const result = hasTarget ? bkReverseSolvePrice(targetIRR, s) : {solved:false};
  const money = n=>'$'+bkFmt(n);
  const targetCell = hasTarget ? bkPct(targetIRR) : '-';
  const targetChip = hasTarget ? '<span class="status-chip pass">OK</span>' : '<span class="status-chip warn">INPUT REQUIRED</span>';
  const main = `<div class="tbl-wrap"><table class="fin"><caption>Reverse Solve - Purchase Price for a Target Levered IRR</caption><tbody>
    <tr><td class="rowlabel">Target Levered IRR</td><td class="v">${targetCell}</td></tr>
    <tr><td class="rowlabel">Current Purchase Price</td><td class="v">${money(s.purchasePrice)}</td></tr>
    <tr class="grandtotal"><td class="rowlabel">Solved Purchase Price</td><td class="v">${!hasTarget?'-':(result.solved?money(result.price):'No solution in search range')}</td></tr>
    <tr><td class="rowlabel">Levered IRR at Solved Price</td><td class="v">${result.solved?bkPct(result.irr):'-'}</td></tr>
    <tr><td class="rowlabel">Implied Change vs. Current Price</td><td class="v">${result.solved?bkPct(result.price/Number(s.purchasePrice)-1)+' ('+money(result.price-Number(s.purchasePrice))+')':'-'}</td></tr>
    </tbody></table></div>
    <div class="tbl-wrap" style="margin-top:16px;"><table class="fin"><caption>Reverse Solve Input</caption><thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th></th></tr></thead><tbody>
    <tr class="input"><td class="rowlabel">Target Levered IRR</td><td class="v" contenteditable="true" spellcheck="false" onblur="bkSetReverseSolveTarget(this)">${hasTarget?(targetIRR*100).toFixed(2)+'%':''}</td><td>%</td><td>${targetChip}</td></tr>
    </tbody></table></div>
    <div class="note-flag"><span>&#10003;</span><div><b>Live reverse solve -</b> bisection search over Purchase Price, re-running the full monthly return and debt calculation (debt resizes with basis at each trial price, same as it would live on Deal Underwrite) until Levered IRR matches the target to within 0.01 bps. Not a closed-form estimate. ${hasTarget?'':'No target has been entered yet -- enter one below to run the solve.'}</div></div>`;
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">Result</div><div class="metric-list">
    <div class="metric-row"><span class="k">Solved Price</span><span class="v">${result.solved?money(result.price):(hasTarget?'n/a':'-')}</span></div>
    <div class="metric-row"><span class="k">Target IRR</span><span class="v">${targetCell}</span></div>
  </div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Tools</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
  return {title:'Reverse Solve', crumbs:'Tools', desc:'Solves Purchase Price for a target Levered IRR by bisection against the real engine.', meta:{Property:s.name,Target:bkPct(targetIRR),Currency:'USD'}, main, sidebar};
};

bkRefreshRailStatus();
