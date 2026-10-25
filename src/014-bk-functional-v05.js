
// Punchlist Capital CRE App V0.5 - live levered cash flow + deal-level returns.
// Visual system inherited unchanged from Claude master.
function bkLeveredReturns(){
 const u=bkAnnualCF(),d=bkDebt(),n=u.arr.length,rows=[];
 for(let i=0;i<n;i++){
   const ds=d.annual[i]||{payment:0,interest:0,principal:0,ending:d.debtAtSale};
   const sale=i===n-1?u.netSale:0;
   const payoff=i===n-1?d.debtAtSale:0;
   const cf=u.arr[i].after-ds.payment+sale-payoff;
   rows.push({y:i+1,noi:u.arr[i].noi,after:u.arr[i].after,debtService:ds.payment,interest:ds.interest,principal:ds.principal,sale,payoff,cf,ending:ds.ending});
 }
 const initial=-d.equity,cfs=[initial,...rows.map(r=>r.cf)],irr=bkIrr(cfs);
 const dist=rows.reduce((z,r)=>z+Math.max(0,r.cf),0),contrib=Math.abs(initial)+rows.reduce((z,r)=>z+Math.max(0,-r.cf),0);
 const moic=contrib?dist/contrib:0;
 return {u,d,rows,initial,cfs,irr,moic,contrib,dist};
}
function sheetReturns(){
 const x=bkLeveredReturns(),u=x.u,d=x.d,money=n=>n<0?'('+bkFmt(-n)+')':bkFmt(n),shown=x.rows.slice(0,10),heads=shown.map(r=>`<th>Year ${r.y}</th>`).join(''),cells=k=>shown.map(r=>`<td>${money(r[k])}</td>`).join('');
 const main=`<div class="tbl-wrap"><table class="fin"><caption>Return Summary</caption><thead><tr><th class="rowlabel-h">Metric</th><th>Result</th><th>Basis</th></tr></thead><tbody>
 <tr><td class="rowlabel">Unlevered IRR</td><td>${bkPct(u.irr)}</td><td>Property cash flow</td></tr><tr><td class="rowlabel">Unlevered MOIC</td><td>${u.moic.toFixed(2)}x</td><td>Property cash flow</td></tr><tr class="grandtotal"><td class="rowlabel">Levered IRR</td><td>${bkPct(x.irr)}</td><td>Equity cash flow</td></tr><tr class="grandtotal"><td class="rowlabel">Levered MOIC</td><td>${x.moic.toFixed(2)}x</td><td>Equity cash flow</td></tr><tr><td class="rowlabel">Initial Equity Requirement</td><td>${money(x.d.equity)}</td><td>All-in basis + financing fee - loan</td></tr><tr><td class="rowlabel">Gross Sale Price</td><td>${money(u.grossSale)}</td><td>Forward NOI / exit cap</td></tr><tr><td class="rowlabel">Debt Payoff at Sale</td><td>${money(d.debtAtSale)}</td><td>Ending acquisition debt</td></tr></tbody></table></div>
 <div class="tbl-wrap" style="margin-top:16px;"><table class="fin"><caption>Annual Levered Equity Cash Flow</caption><thead><tr><th class="rowlabel-h">Line Item</th>${heads}</tr></thead><tbody><tr><td class="rowlabel">NOI After Reserves</td>${cells('after')}</tr><tr><td class="rowlabel">Cash Debt Service</td>${shown.map(r=>`<td>${money(-r.debtService)}</td>`).join('')}</tr><tr><td class="rowlabel">Net Sale Proceeds</td>${cells('sale')}</tr><tr><td class="rowlabel">Debt Payoff</td>${shown.map(r=>`<td>${money(-r.payoff)}</td>`).join('')}</tr><tr class="grandtotal"><td class="rowlabel">Net Equity Cash Flow</td>${cells('cf')}</tr></tbody></table></div>
 <div class="note-flag"><span>&#10003;</span><div><b>Live levered returns -</b> acquisition debt now flows through to equity cash flow, sale proceeds and debt payoff. The workbook remains the certification source; its monthly XIRR / SYS_CF timing will replace this annual bridge before V1.0 certification.</div></div>`;
 const sidebar=sidebarShell(`<div class="card"><div class="card-head">Key Returns</div><div class="metric-list"><div class="metric-row"><span class="k">Levered IRR</span><span class="v pos">${bkPct(x.irr)}</span></div><div class="metric-row"><span class="k">Levered MOIC</span><span class="v pos">${x.moic.toFixed(2)}x</span></div><div class="metric-row"><span class="k">Unlevered IRR</span><span class="v">${bkPct(u.irr)}</span></div><div class="metric-row"><span class="k">Initial Equity</span><span class="v">$${bkFmt(d.equity)}</span></div><div class="metric-row"><span class="k">Debt at Sale</span><span class="v">$${bkFmt(d.debtAtSale)}</span></div></div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Returns & Equity</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
 return {title:'Returns',crumbs:'Returns & Equity',desc:'Live deal-level levered and unlevered returns driven by property cash flow and acquisition debt.',meta:{Property:u.s.name,'Hold':u.arr.length+' years','Debt Constraint':d.binding,'Exit Cap':bkPct(Number(u.s.exitCap)),Currency:'USD',Status:'Live'},main,sidebar};
}
RENDERERS['Returns']=sheetReturns;
showSheet(currentSheet||'Returns');
