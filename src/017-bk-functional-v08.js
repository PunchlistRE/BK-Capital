
/* Punchlist Capital V0.8 - Sponsor CF / sponsor economics port from CRE Master Sponsor CF. Visual master unchanged. */
BK_BASE.acquisitionFeePct = BK_BASE.acquisitionFeePct===undefined ? .01 : BK_BASE.acquisitionFeePct;
function bkSponsorV08(){
 const w=bkWaterfallV07(), s=bkEnsureV06(), rows=[];
 const acqFeePct=bkAcqFeePct(s), dispPct=Number(s.dispositionFeePct||0);
 const purchase=Number(s.purchasePrice||0), acqFee=purchase*acqFeePct;
 let totalAM=0,totalDisp=0,totalFees=0;
 for(let i=0;i<w.rows.length;i++){
   const base=w.rows[i], mr=w.x.rows[i];
   const am=Number(mr.assetFee||0), disp=(i===w.rows.length-1?Number(w.x.u.grossSale||0)*dispPct:0), acq=(i===0?acqFee:0);
   const fees=acq+am+disp, sponsorCF=base.gpCF+fees;
   totalAM+=am; totalDisp+=disp; totalFees+=fees;
   rows.push({...base,acqFee:acq,amFee:am,dispFee:disp,fees,sponsorCF});
 }
 const dates=rows.map(r=>r.dt), sponsorVals=rows.map(r=>r.sponsorCF), gpVals=rows.map(r=>r.gpCF);
 const _eq0=Number(w.x.rows[0]&&w.x.rows[0].eqDraw)||0,_gs=Number(s.gpShare||0);
 const sponsorIRR=bkXirrClose(sponsorVals,dates,w.x.closeDt,-_eq0*_gs+acqFee), gpIRR=bkXirrClose(gpVals,dates,w.x.closeDt,-_eq0*_gs);
 const gpContrib=rows.reduce((z,r)=>z+Math.max(0,-r.gpCon),0), gpDist=rows.reduce((z,r)=>z+r.gpDist,0);
 const sponsorProfit=rows.reduce((z,r)=>z+r.sponsorCF,0), sponsorMOIC=gpContrib?(gpDist+totalFees)/gpContrib:0;
 return {w,s,rows,acqFee,totalAM,totalDisp,totalFees,gpContrib,gpDist,promote:w.promote,gpIRR,sponsorIRR,sponsorMOIC,sponsorProfit};
}
const _dealV08=sheetDealUnderwrite; sheetDealUnderwrite=function(){const o=_dealV08();o.main+=`<div class="tbl-wrap" style="margin-top:16px;"><table class="fin"><caption>Sponsor Economics - Additional Workbook Input</caption><thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr></thead><tbody>${bkAcqFeeMirrorRow()}</tbody></table></div>`;return o;};
function sheetSponsorCFV08(){
 const x=bkSponsorV08(), m=n=>n<0?'('+bkFmt(-n)+')':bkFmt(n);
 const annual=[]; for(let y=1;y<=Math.ceil(x.rows.length/12);y++){const rr=x.rows.filter((r,i)=>Math.ceil((i+1)/12)===y);annual.push({y,acq:rr.reduce((z,r)=>z+r.acqFee,0),am:rr.reduce((z,r)=>z+r.amFee,0),disp:rr.reduce((z,r)=>z+r.dispFee,0),equity:rr.reduce((z,r)=>z+r.gpCF,0),cf:rr.reduce((z,r)=>z+r.sponsorCF,0)});} const shown=annual.slice(0,10), heads=shown.map(r=>`<th>Year ${r.y}</th>`).join(''), cells=k=>shown.map(r=>`<td>${m(r[k])}</td>`).join('');
 const main=`<div class="tbl-wrap"><table class="fin"><caption>Sponsor Economics Summary - Live Engine</caption><thead><tr><th class="rowlabel-h">Metric</th><th>Web Engine</th><th>Workbook Baseline</th></tr></thead><tbody><tr><td class="rowlabel">GP Co-Investment</td><td>${m(x.gpContrib)}</td><td>$2,850,730</td></tr><tr><td class="rowlabel">GP Distributions (co-invest + promote)</td><td>${m(x.gpDist)}</td><td>$4,921,372</td></tr><tr><td class="rowlabel">Total Promote</td><td>${m(x.promote)}</td><td>$0</td></tr><tr><td class="rowlabel">Acquisition Fee</td><td>${m(x.acqFee)}</td><td>$103,250</td></tr><tr><td class="rowlabel">Asset Management Fee</td><td>${m(x.totalAM)}</td><td>$126,709</td></tr><tr><td class="rowlabel">Disposition Fee</td><td>${m(x.totalDisp)}</td><td>$66,274</td></tr><tr class="grandtotal"><td class="rowlabel">Total Fee Income</td><td>${m(x.totalFees)}</td><td>$296,232</td></tr><tr><td class="rowlabel">GP Co-Investment XIRR</td><td>${isFinite(x.gpIRR)?bkPct(x.gpIRR):'-'}</td><td>6.10%</td></tr><tr class="grandtotal"><td class="rowlabel">Sponsor All-In XIRR</td><td>${isFinite(x.sponsorIRR)?bkPct(x.sponsorIRR):'-'}</td><td>7.08%</td></tr><tr class="grandtotal"><td class="rowlabel">Sponsor Equity Multiple</td><td>${x.sponsorMOIC.toFixed(3)}x</td><td>1.830x</td></tr><tr class="grandtotal"><td class="rowlabel">Total Sponsor Profit</td><td>${m(x.sponsorProfit)}</td><td>$2,366,874</td></tr></tbody></table></div><div class="tbl-wrap" style="margin-top:16px;overflow:auto"><table class="fin"><caption>Annual Sponsor Cash Flow - Monthly Engine Aggregated for Display</caption><thead><tr><th class="rowlabel-h">Line Item</th>${heads}</tr></thead><tbody><tr><td class="rowlabel">Acquisition Fee</td>${cells('acq')}</tr><tr><td class="rowlabel">Asset Management Fee</td>${cells('am')}</tr><tr><td class="rowlabel">Disposition Fee</td>${cells('disp')}</tr><tr><td class="rowlabel">GP Net Equity Cash Flow</td>${cells('equity')}</tr><tr class="grandtotal"><td class="rowlabel">Sponsor Net Cash Flow</td>${cells('cf')}</tr></tbody></table></div><div class="note-flag"><span>&#10003;</span><div><b>Sponsor CF engine -</b> sponsor co-investment, GP distributions, promote and contemporaneous acquisition, asset-management and disposition fees now combine into a dated sponsor cash-flow stream. The Excel baseline is shown beside the live web result for tie-out.</div></div>`;
 const sidebar=sidebarShell(`<div class="card"><div class="card-head">Sponsor Economics</div><div class="metric-list"><div class="metric-row"><span class="k">All-In XIRR</span><span class="v">${isFinite(x.sponsorIRR)?bkPct(x.sponsorIRR):'-'}</span></div><div class="metric-row"><span class="k">Equity Multiple</span><span class="v">${x.sponsorMOIC.toFixed(3)}x</span></div><div class="metric-row"><span class="k">Fee Income</span><span class="v">${m(x.totalFees)}</span></div><div class="metric-row"><span class="k">Promote</span><span class="v">${m(x.promote)}</span></div><div class="metric-row"><span class="k">Sponsor Profit</span><span class="v">${m(x.sponsorProfit)}</span></div></div></div>${colorKeyCard()}`);
 return {title:'Sponsor CF',crumbs:'Monthly Engine',desc:'GP fees, co-investment, promote and sponsor all-in economics.',meta:{Property:x.s.name,'GP Share':bkPct(Number(x.s.gpShare)),Engine:'Monthly / dated',Currency:'USD',Status:'Live'},main,sidebar};
}
RENDERERS['Sponsor CF']=sheetSponsorCFV08; bkEnsureV06();
