
/* Punchlist Capital V1.8 - After-Tax engine. Reuses the verified pre-tax chain (bkAnnualCF/bkDebt/
   bkMonthlyReturns) unchanged; this only layers straight-line depreciation, ordinary income tax,
   and sale-year depreciation recapture + capital gains tax on top of the real monthly levered CF
   stream, property-level and pre-waterfall (same basis Returns/Debt/Covenant Monitor already show --
   an LP-specific after-tax view would need per-investor tax assumptions this app doesn't model yet).

   Simplifications, stated plainly rather than silently:
   - Depreciable basis reuses the app's existing acquisition basis (purchase price + closing costs%
     + acquisition fee%, the same "basis" bkDebt() already sizes the loan against), split into land
     vs. building by a single landValuePct input. A more granular cost-segregation split isn't modeled.
   - Every year in the hold gets a full year of straight-line depreciation (holdYears is always a
     whole number of years in this app, so there's no stub first/last year to prorate).
   - Passive-activity losses (common in early years once depreciation exceeds NOI-after-interest)
     are suspended and carried forward, then released against the gain at sale -- real IRC 469(g)
     treatment for a fully taxable disposition, not just a same-year loss/tax floor of zero.
   - Ordinary tax is applied once per year (in that year's December cash flow); sale-year recapture
     (25% default, Sec. 1250 unrecaptured gain) and remaining long-term capital gain (20% default)
     are applied in the final month alongside the real sale proceeds already in bkMonthlyReturns(). */

function bkEnsureV18(){
  const s = bkLoad(); let dirty=false;
  const isRes = /resident|multifamily|apartment/i.test(String(s.propertyType||''));
  if(s.taxRate===undefined){ s.taxRate=0.37; dirty=true; }
  if(s.capGainsRate===undefined){ s.capGainsRate=0.20; dirty=true; }
  if(s.depRecaptureRate===undefined){ s.depRecaptureRate=0.25; dirty=true; }
  if(s.landValuePct===undefined){ s.landValuePct=0.20; dirty=true; }
  if(s.deprLife===undefined){ s.deprLife=isRes?27.5:39; dirty=true; }
  if(dirty) bkSave(s);
  return s;
}

function bkAfterTaxV18(){
  const s = bkEnsureV18();
  const u = bkAnnualCF(), d = bkDebt(), r = bkMonthlyReturns();
  const n = u.arr.length;

  const totalBasis = Math.abs(u.initial);
  const landValue = totalBasis * Number(s.landValuePct||0);
  const deprBasis = Math.max(0, totalBasis - landValue);
  const life = Number(s.deprLife||39);
  const annualDepr = life>0 ? deprBasis/life : 0;

  let accumDepr = 0, lossCF = 0;
  const rows = [];
  for(let y=0; y<n; y++){
    const noi = u.arr[y].after;
    const interest = (d.annual[y]||{interest:0}).interest;
    const depr = Math.min(annualDepr, Math.max(0, deprBasis-accumDepr));
    accumDepr += depr;
    let taxableIncome = noi - interest - depr, taxDue = 0;
    if(taxableIncome > 0){
      const offset = Math.min(lossCF, taxableIncome);
      lossCF -= offset; taxableIncome -= offset;
      taxDue = taxableIncome * Number(s.taxRate||0);
    } else {
      lossCF += -taxableIncome; taxableIncome = 0;
    }
    rows.push({y:y+1, noi, interest, depr, accumDepr, taxableIncome, taxDue, lossCF});
  }

  const adjustedBasis = totalBasis - accumDepr;
  const totalGain = Math.max(0, u.netSale - adjustedBasis);
  const lossUsedAtSale = Math.min(lossCF, totalGain);
  const gainAfterCarryforward = Math.max(0, totalGain - lossUsedAtSale);
  const recaptureBase = Math.min(gainAfterCarryforward, accumDepr);
  const recaptureTax = recaptureBase * Number(s.depRecaptureRate||0);
  const capGainBase = Math.max(0, gainAfterCarryforward - recaptureBase);
  const capGainTax = capGainBase * Number(s.capGainsRate||0);
  const saleTax = recaptureTax + capGainTax;

  const values=[], dates=[];
  for(let i=0; i<r.rows.length; i++){
    const row = r.rows[i];
    let cf = row.cf;
    const y = Math.floor(i/12);
    if((i+1)%12===0 && rows[y]) cf -= rows[y].taxDue;
    if(i===r.rows.length-1) cf -= saleTax;
    values.push(cf); dates.push(row.dt);
  }
  const atIRR = bkXirrClose(values, dates, r.closeDt, -(Number(r.rows[0]&&r.rows[0].eqDraw)||0));
  const inflows = values.reduce((a,v)=>a+Math.max(0,v),0), outflows = values.reduce((a,v)=>a+Math.max(0,-v),0);
  const atMOIC = outflows ? inflows/outflows : 0;

  return {s, u, d, r, rows, totalBasis, landValue, deprBasis, life, annualDepr, accumDepr,
    adjustedBasis, totalGain, lossCFAtSale:lossCF, lossUsedAtSale, recaptureBase, recaptureTax,
    capGainBase, capGainTax, saleTax, values, dates, atIRR, atMOIC,
    preTaxIRR:r.irr, preTaxMOIC:r.moic};
}

const _dealV18 = sheetDealUnderwrite;
sheetDealUnderwrite = function(){
  const o = _dealV18();
  o.main += `<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>After-Tax Assumptions</caption><thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr></thead><tbody>${bkInput('Ordinary Income Tax Rate','taxRate','%','pct')}${bkInput('Land Value (% of Basis)','landValuePct','%','pct')}${bkInput('Depreciable Life','deprLife','years')}${bkInput('Depreciation Recapture Rate','depRecaptureRate','% (Sec. 1250)','pct')}${bkInput('Long-Term Capital Gains Rate','capGainsRate','%','pct')}</tbody></table></div>`;
  return o;
};

RENDERERS['After-Tax'] = function(){
  const x = bkAfterTaxV18(), s = x.s;
  const money = n => n<0 ? '($'+bkFmt(-n)+')' : '$'+bkFmt(n);
  const shown = x.rows.slice(0,10), heads = shown.map(r=>`<th>Year ${r.y}</th>`).join('');
  const cell = k => shown.map(r=>`<td>${money(r[k])}</td>`).join('');
  const main = `<div class="tbl-wrap"><table class="fin"><caption>After-Tax Cash Flow - Depreciation, Taxable Income &amp; Ordinary Tax</caption>
    <thead><tr><th class="rowlabel-h">Line Item</th>${heads}</tr></thead><tbody>
    <tr><td class="rowlabel">NOI After Reserves</td>${cell('noi')}</tr>
    <tr><td class="rowlabel">Less: Interest Expense</td>${shown.map(r=>`<td>${money(-r.interest)}</td>`).join('')}</tr>
    <tr><td class="rowlabel">Less: Depreciation</td>${shown.map(r=>`<td>${money(-r.depr)}</td>`).join('')}</tr>
    <tr class="grandtotal"><td class="rowlabel">Taxable Income</td>${cell('taxableIncome')}</tr>
    <tr><td class="rowlabel">Suspended Loss Carryforward</td>${cell('lossCF')}</tr>
    <tr class="grandtotal"><td class="rowlabel">Ordinary Income Tax</td>${shown.map(r=>`<td>${money(-r.taxDue)}</td>`).join('')}</tr>
    </tbody></table></div>
    <div class="tbl-wrap" style="margin-top:16px;"><table class="fin"><caption>Sale-Year Tax - Depreciation Recapture &amp; Capital Gains</caption><tbody>
    <tr><td class="rowlabel">Total Acquisition Basis</td><td class="v">${bkFmt(x.totalBasis)}</td></tr>
    <tr><td class="rowlabel">Land Value</td><td class="v">${bkFmt(x.landValue)}</td></tr>
    <tr><td class="rowlabel">Accumulated Depreciation</td><td class="v">${bkFmt(x.accumDepr)}</td></tr>
    <tr><td class="rowlabel">Adjusted Basis at Sale</td><td class="v">${bkFmt(x.adjustedBasis)}</td></tr>
    <tr><td class="rowlabel">Net Sale Proceeds</td><td class="v">${bkFmt(x.u.netSale)}</td></tr>
    <tr class="grandtotal"><td class="rowlabel">Total Taxable Gain</td><td class="v">${bkFmt(x.totalGain)}</td></tr>
    <tr><td class="rowlabel">Suspended Losses Released at Sale</td><td class="v">(${bkFmt(x.lossUsedAtSale)})</td></tr>
    <tr><td class="rowlabel">Unrecaptured Sec. 1250 Gain</td><td class="v">${bkFmt(x.recaptureBase)}</td></tr>
    <tr><td class="rowlabel">Depreciation Recapture Tax (${bkPct(Number(s.depRecaptureRate))})</td><td class="v">(${bkFmt(x.recaptureTax)})</td></tr>
    <tr><td class="rowlabel">Remaining Capital Gain</td><td class="v">${bkFmt(x.capGainBase)}</td></tr>
    <tr><td class="rowlabel">Capital Gains Tax (${bkPct(Number(s.capGainsRate))})</td><td class="v">(${bkFmt(x.capGainTax)})</td></tr>
    <tr class="grandtotal"><td class="rowlabel">TOTAL SALE-YEAR TAX</td><td class="v">(${bkFmt(x.saleTax)})</td></tr>
    </tbody></table></div>
    <div class="tbl-wrap" style="margin-top:16px;"><table class="fin"><caption>Pre-Tax vs. After-Tax Returns - Levered, Property-Level</caption><thead><tr><th class="rowlabel-h">Metric</th><th>Pre-Tax</th><th>After-Tax</th></tr></thead><tbody>
    <tr><td class="rowlabel">Levered IRR</td><td>${bkPct(x.preTaxIRR)}</td><td class="v pos">${bkPct(x.atIRR)}</td></tr>
    <tr><td class="rowlabel">Levered Equity Multiple</td><td>${x.preTaxMOIC.toFixed(3)}x</td><td class="v pos">${x.atMOIC.toFixed(3)}x</td></tr>
    </tbody></table></div>
    <div class="note-flag"><span>&#10003;</span><div><b>Live after-tax engine -</b> straight-line depreciation (${x.life}-yr life on a ${bkFmt(x.deprBasis)} depreciable basis), passive-loss carryforward released at sale, Sec. 1250 recapture and long-term capital gains tax layered onto the real, already-verified monthly levered cash flow (<code>bkMonthlyReturns</code>) -- no separate/approximated cash flow. Property-level, pre-waterfall; an LP-specific after-tax figure would need per-investor tax elections this app doesn't model yet.</div></div>`;
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">After-Tax Summary</div><div class="metric-list">
    <div class="metric-row"><span class="k">After-Tax IRR</span><span class="v pos">${bkPct(x.atIRR)}</span></div>
    <div class="metric-row"><span class="k">After-Tax Multiple</span><span class="v pos">${x.atMOIC.toFixed(3)}x</span></div>
    <div class="metric-row"><span class="k">Total Sale-Year Tax</span><span class="v">${bkFmt(x.saleTax)}</span></div>
    <div class="metric-row"><span class="k">Depreciable Life</span><span class="v">${x.life} yrs</span></div>
  </div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Returns &amp; Equity</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
  return {title:'After-Tax', crumbs:'Returns & Equity', desc:'Depreciation, ordinary income tax, and sale-year recapture/capital gains tax on the real levered cash flow.', meta:{Property:s.name,'Tax Rate':bkPct(Number(s.taxRate)),'Depr. Life':x.life+' yrs',Currency:'USD'}, main, sidebar};
};

bkRefreshRailStatus();
