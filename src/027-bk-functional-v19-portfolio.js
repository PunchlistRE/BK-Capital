
/* Punchlist Capital V1.9 - Portfolio. This app holds exactly one active deal at a time (a single
   localStorage key), so a real multi-deal view needs its own separate store of deal snapshots
   rather than pretending the app is multi-deal underneath. bkLoad/bkSave are still the only way
   any calc function reads a deal, so per-deal metrics here are computed by swapping them to a
   scratch copy of that one saved snapshot -- the exact same safe swap bkRunScenario (Sensitivity)
   already uses -- run the real bkAnnualCF/bkDebt/bkMonthlyReturns chain, then restore. Nothing here
   is a parallel/approximate calculation or a hand-entered number. */

const BK_PORTFOLIO_STORE = 'bkcapital.cre.portfolio.v01';
function bkPortfolioLoad(){ try{ return JSON.parse(localStorage.getItem(BK_PORTFOLIO_STORE)||'[]'); }catch(e){ return []; } }
function bkPortfolioSave(arr){ localStorage.setItem(BK_PORTFOLIO_STORE, JSON.stringify(arr)); }
function bkPortfolioKey(d){ return String(d.dealId || d.name || 'untitled'); }

window.bkPortfolioAddCurrent = function(){
  if(typeof bkIsProvisioned==='function' && !bkIsProvisioned()) return false;   // V30: never snapshot the engine template
  const cur = bkLoad(), key = bkPortfolioKey(cur);
  const arr = bkPortfolioLoad();
  const idx = arr.findIndex(d=>bkPortfolioKey(d)===key);
  const snap = JSON.parse(JSON.stringify(cur));
  if(idx>=0) arr[idx]=snap; else arr.push(snap);
  bkPortfolioSave(arr);
  showSheet(currentSheet);
};
window.bkPortfolioRemove = function(key){
  bkPortfolioSave(bkPortfolioLoad().filter(d=>bkPortfolioKey(d)!==key));
  showSheet(currentSheet);
};
window.bkPortfolioLoadActive = function(key){
  const found = bkPortfolioLoad().find(d=>bkPortfolioKey(d)===key);
  if(found){ var loaded=JSON.parse(JSON.stringify(found)); if(typeof window.bkProvision==='function') window.bkProvision('portfolio-load',loaded); else bkSave(loaded); showSheet('Deal Underwrite'); }
};

// Same swap-bkLoad/bkSave-to-a-scratch-copy pattern bkRunScenario uses, so a per-deal metrics
// run can never touch the real active deal's saved state, however many fields it dirties.
function bkPortfolioMetricsFor(snapshot){
  const origLoad = window.bkLoad, origSave = window.bkSave;
  const scratch = JSON.parse(JSON.stringify(snapshot));
  window.bkLoad = function(){ return scratch; };
  window.bkSave = function(d){ Object.assign(scratch, d); };
  let out;
  try{
    const u = bkAnnualCF(), d = bkDebt(), r = bkMonthlyReturns();
    out = { ok:true, irr:r.irr, moic:r.moic, equity:d.equity, purchasePrice:Number(scratch.purchasePrice)||0,
      y1noi:(u.arr[0]?u.arr[0].after:0), exitCap:Number(scratch.exitCap)||0, holdYears:Number(scratch.holdYears)||0,
      grossSale:u.grossSale, loan:d.loan };
  } catch(e){
    out = { ok:false, error:String((e&&e.message)||e) };
  } finally {
    window.bkLoad = origLoad; window.bkSave = origSave;
  }
  return out;
}

const _showV19 = showSheet;
showSheet = function(sheet){
  _showV19(sheet);
  viewport.querySelectorAll('[data-portfolio-remove]').forEach(el=>el.addEventListener('click',()=>bkPortfolioRemove(el.dataset.portfolioRemove)));
  viewport.querySelectorAll('[data-portfolio-load]').forEach(el=>el.addEventListener('click',()=>bkPortfolioLoadActive(el.dataset.portfolioLoad)));
  viewport.querySelectorAll('[data-portfolio-add]').forEach(el=>el.addEventListener('click',bkPortfolioAddCurrent));
};

RENDERERS['Portfolio'] = function(){
  // V30: with no provisioned deal there is no active deal - never present the engine template (ShorePointe) as one.
  const hasDeal = (typeof bkIsProvisioned!=='function') || bkIsProvisioned();
  const cur = hasDeal ? bkLoad() : {}, curKey = hasDeal ? bkPortfolioKey(cur) : null;
  const saved = bkPortfolioLoad();
  const money = n => n<0 ? '($'+bkFmt(-n)+')' : '$'+bkFmt(n);
  const computed = saved.map(snap=>({snap, key:bkPortfolioKey(snap), m:bkPortfolioMetricsFor(snap)}));
  const rows = computed.map(({snap,key,m})=>`<tr${key===curKey?' class="grandtotal"':''}>
    <td class="rowlabel">${bkEsc(snap.name||key)}${key===curKey?' <span class="status-chip pass">ACTIVE</span>':''}</td>
    <td>${bkEsc(snap.dealType||'-')}</td><td>${bkEsc(snap.propertyType||'-')}</td>
    <td>${m.ok?money(m.purchasePrice):'-'}</td><td>${m.ok?money(m.equity):'-'}</td>
    <td>${m.ok?bkPct(m.irr):'engine error'}</td><td>${m.ok?m.moic.toFixed(2)+'x':'-'}</td>
    <td><button type="button" class="status-chip" data-portfolio-load="${bkEsc(key)}">Load</button> <button type="button" class="status-chip" data-portfolio-remove="${bkEsc(key)}">Remove</button></td></tr>`).join('');
  const ok = computed.filter(r=>r.m.ok);
  const totalEquity = ok.reduce((z,r)=>z+r.m.equity,0), totalPrice = ok.reduce((z,r)=>z+r.m.purchasePrice,0);
  const wIRR = window.__BK_CR_wIRR(ok.map(r=>r.m));
  const main = `<div class="tbl-wrap"><table class="fin"><caption>Portfolio - Saved Deals (${saved.length})</caption><thead><tr><th class="rowlabel-h">Deal</th><th>Type</th><th>Property</th><th>Purchase Price</th><th>Equity</th><th>Levered IRR</th><th>MOIC</th><th>Actions</th></tr></thead><tbody>${rows||'<tr><td class="rowlabel" colspan="8">No deals saved to the portfolio yet.</td></tr>'}<tr class="grandtotal"><td class="rowlabel">Portfolio Total / Wtd. Avg</td><td></td><td></td><td>${money(totalPrice)}</td><td>${money(totalEquity)}</td><td>${bkPct(wIRR)}</td><td></td><td></td></tr></tbody></table></div>
    ${hasDeal?`<div style="margin-top:12px;"><button type="button" class="status-chip pass" data-portfolio-add="1">+ Save Active Deal (${bkEsc(cur.name||'Untitled')}) to Portfolio</button></div>`:`<div class="note-flag" style="margin-top:12px;"><span>&#9432;</span><div>No deal is active, so there is nothing to add. Create or load a deal first.</div></div>`}
    <div class="note-flag"><span>&#10003;</span><div><b>Live portfolio -</b> each row re-runs the real, already-verified engine (<code>bkAnnualCF</code>/<code>bkDebt</code>/<code>bkMonthlyReturns</code>) against that deal's own saved snapshot, the same safe scratch-copy swap Sensitivity uses -- not a static copy of numbers. "Load" swaps a saved deal into the active slot (this app holds one active deal at a time); "Save Active Deal" snapshots whatever's currently loaded. The equity-weighted total only includes deals whose engine run succeeded.</div></div>`;
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">Portfolio Summary</div><div class="metric-list">
    <div class="metric-row"><span class="k">Deals Saved</span><span class="v">${saved.length}</span></div>
    <div class="metric-row"><span class="k">Total Purchase Price</span><span class="v">${money(totalPrice)}</span></div>
    <div class="metric-row"><span class="k">Total Equity</span><span class="v">${money(totalEquity)}</span></div>
    <div class="metric-row"><span class="k">Equity-Wtd. IRR</span><span class="v">${bkPct(wIRR)}</span></div>
  </div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Portfolio &amp; Investors</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
  return {title:'Portfolio', crumbs:'Portfolio & Investors', desc:'Saved deals, each re-computed live from its own snapshot through the real engine.', meta:{'Saved Deals':saved.length,'Active Deal':hasDeal?(cur.name||'-'):'None','Total Equity':money(totalEquity),Currency:'USD'}, main, sidebar};
};

RENDERERS['Portfolio Dashboard'] = function(){
  const saved = bkPortfolioLoad();
  const money = n => n<0 ? '($'+bkFmt(-n)+')' : '$'+bkFmt(n);
  const computed = saved.map(snap=>({snap, m:bkPortfolioMetricsFor(snap)})).filter(r=>r.m.ok);
  const totalEquity = computed.reduce((z,r)=>z+r.m.equity,0), totalPrice = computed.reduce((z,r)=>z+r.m.purchasePrice,0);
  const wIRR = window.__BK_CR_wIRR(computed.map(r=>r.m));
  const wMOIC = totalEquity ? computed.reduce((z,r)=>z+r.m.moic*r.m.equity,0)/totalEquity : 0;
  const best = window.__BK_CR_pick(computed,1);
  const worst = window.__BK_CR_pick(computed,0);
  const byType = {}; computed.forEach(r=>{ const t=r.snap.propertyType||'Other'; byType[t]=(byType[t]||0)+r.m.purchasePrice; });
  const typeRows = Object.entries(byType).map(([t,v])=>`<tr><td class="rowlabel">${bkEsc(t)}</td><td>${money(v)}</td><td>${totalPrice?bkPct(v/totalPrice):'-'}</td></tr>`).join('');
  const main = `<div class="tbl-wrap"><table class="fin"><caption>Portfolio Dashboard - ${computed.length} Deal(s)</caption><tbody>
    <tr><td class="rowlabel">Total Purchase Price</td><td class="v">${money(totalPrice)}</td></tr>
    <tr><td class="rowlabel">Total Equity Invested</td><td class="v">${money(totalEquity)}</td></tr>
    <tr class="grandtotal"><td class="rowlabel">Equity-Weighted Levered IRR</td><td class="v">${bkPct(wIRR)}</td></tr>
    <tr class="grandtotal"><td class="rowlabel">Equity-Weighted MOIC</td><td class="v">${wMOIC.toFixed(2)}x</td></tr>
    <tr><td class="rowlabel">Best Performer</td><td class="v">${best?bkEsc(best.snap.name)+' - '+bkPct(best.m.irr):'-'}</td></tr>
    <tr><td class="rowlabel">Weakest Performer</td><td class="v">${worst?bkEsc(worst.snap.name)+' - '+bkPct(worst.m.irr):'-'}</td></tr>
    </tbody></table></div>
    <div class="tbl-wrap" style="margin-top:16px;"><table class="fin"><caption>Purchase Price by Property Type</caption><thead><tr><th class="rowlabel-h">Property Type</th><th>Total Price</th><th>% of Portfolio</th></tr></thead><tbody>${typeRows||'<tr><td class="rowlabel" colspan="3">No deals saved yet.</td></tr>'}</tbody></table></div>
    <div class="note-flag"><span>&#10003;</span><div><b>Live dashboard -</b> every figure here comes from the same per-deal engine runs as the Portfolio page (equity-weighted across deals whose engine run succeeded); nothing is hard-coded. Save deals from the Portfolio page to populate this.</div></div>`;
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">At a Glance</div><div class="metric-list">
    <div class="metric-row"><span class="k">Deals</span><span class="v">${computed.length}</span></div>
    <div class="metric-row"><span class="k">Total Equity</span><span class="v">${money(totalEquity)}</span></div>
    <div class="metric-row"><span class="k">Wtd. IRR</span><span class="v">${bkPct(wIRR)}</span></div>
  </div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Portfolio &amp; Investors</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
  return {title:'Portfolio Dashboard', crumbs:'Portfolio & Investors', desc:"Aggregate KPIs across every saved deal, computed live from each deal's own snapshot.", meta:{Deals:computed.length,'Wtd IRR':bkPct(wIRR),'Wtd MOIC':wMOIC.toFixed(2)+'x',Currency:'USD'}, main, sidebar};
};

bkRefreshRailStatus();
