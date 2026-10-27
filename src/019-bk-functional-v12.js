
/* Punchlist Capital V1.2 - development-to-returns bridge. Claude visual master remains locked. */
const _bkMonthlyReturnsAcqV12 = bkMonthlyReturns;
function bkDevMonthlyReturnsV12(){
 const x=bkDevTakeoutV11(), s=x.s, op=bkOperatingV02();
 if(!x.isDev) return _bkMonthlyReturnsAcqV12();
 const months=Math.max(1,x.hold), start=bkParseDealDate(s.closing,'2027-01-01'), y1EGI=Number(bkCalc().egi||0);   // F11: Year-1 EGI (bkOperatingV02 returns no egi)
 const baseNOI=Math.max(0,Number(s.stabilizedNOI||0)||Number(op.noi||0));
 /* Replacement reserves are a COST: they grow at the opex rate, like the acquisition engine, not at the NOI growth rate. op.noi is NOI AFTER reserves, so
    NOI before reserves = baseNOI + reserves; each grows on its own rate. A user-entered stabilizedNOI cannot be split, so it keeps the single-rate path. */
 const reserves0=Number(s.stabilizedNOI||0)?0:Math.max(0,Number(s.reserves||0)), opexGrowthDev=Number(s.opexGrowth||0);
 const noiAtYear=yr=>(baseNOI+reserves0)*Math.pow(1+Number(s.noiGrowth||s.rentGrowth||0),yr-1)-reserves0*Math.pow(1+opexGrowthDev,yr-1);
 const noiGrowth=Number(s.noiGrowth||s.rentGrowth||0), exitCap=Math.max(.0001,Number(s.exitCap||.06)), saleCost=Number(s.saleCostPct||0);
 const rows=[],values=[],dates=[]; let permBal=x.permLoan||0;
 const permByMo={}; (x.permSchedule||[]).forEach(z=>permByMo[z.mo]=z);
 // Real lease-up ramp: CO through Stab-1 run at partial (ramping) occupancy -- not a flat $0-then-full cliff.
 // Same source as the Development cost ladder's Lease-Up Operating Deficit (bkDevV09/bkDevLeaseupRamp), so the
 // cash actually funded during lease-up (via the construction facility / equity) and the cash actually earned
 // by the property during that same window come from one consistent monthly occupancy curve.
 const LCR=bkDevLifecycleV13(x);
 const rampByMo={}; (x.leaseupRamp||[]).forEach(z=>rampByMo[z.mo]=z);
 // F12: one monthly NOI curve (operating months step by operating year; lease-up months read the ramp). Exit value = NOI of months H+1..H+12 on this same curve.
 /* tenant-level commercial leases (when on): the retail the lease schedule earns, in place of the retail inside the growth path, and its leasing capital */
 const LH=(typeof bkDevLeaseHooks==='function')?bkDevLeaseHooks(s,x):null, leaseDelta=k=>LH?LH.delta(k):0, leaseCap=k=>LH?LH.cap(k):0;
 const curveNOI=k=>k>=x.stab?noiAtYear(Math.max(1,Math.ceil((k-x.stab+1)/12)))/12+leaseDelta(k):Number((rampByMo[k]||{after:0}).after||0);
 for(let mo=1;mo<=months;mo++){
   const dt=bkMonthEnd(start,mo);   // V32.1: month-end
   const funding=x.months[mo-1]||{eq:0,overflow:0};
   const equityDraw=Number(funding.eq||0)+Number(funding.overflow||0);
   const isOperating=mo>=x.stab;
   const ramp=rampByMo[mo];
   const opYear=Math.max(1,Math.ceil((mo-x.stab+1)/12));
   const annualNOI=isOperating?noiAtYear(opYear):0;
   const noi=isOperating?annualNOI/12+leaseDelta(mo):((ramp&&!LCR.deficitFunded)?ramp.after:0);
   const egiMo=isOperating?y1EGI/12:(ramp?ramp.egi:0);
   const assetFee=egiMo*Number(s.assetMgmtPct||0);
   const pd=permByMo[mo]||{payment:0,end:permBal}; let ds=Number(pd.payment||0); permBal=Number(pd.end===undefined?permBal:pd.end);
   if(x.conHeldToSale && mo>x.stab) ds+=Number(x.conIOPayment||0);   // V30.2: construction interest paid currently after stabilization
   const refi=(mo===x.stab&&Number(s.refiAtStab||0))?Number(x.refiProceeds||0):0;
   const refiEq=(mo===x.stab&&Number(s.refiAtStab||0))?Number(x.refiShortfall||0):0;
   let sale=0,payoff=0,grossSale=0,dispoFee=0;
   if(mo===months){let fwdExitNOI=0;for(let k=months+1;k<=months+12;k++)fwdExitNOI+=curveNOI(k);grossSale=fwdExitNOI/exitCap;sale=grossSale*(1-saleCost);dispoFee=grossSale*Number(s.dispositionFeePct||0);payoff=LCR.saleBeforeTakeout?Number((x.months[months-1]||{end:0}).end||0):permBal+(x.conHeldToSale?Number(x.conHeldBalance||0):0);}
   const leaseCapMo=leaseCap(mo);
   const cf=-equityDraw-refiEq+noi-assetFee-ds+refi+sale-dispoFee-payoff-leaseCapMo;
   rows.push({m:mo,y:Math.ceil(mo/12),dt,egi:egiMo,noi,leaseCap:leaseCapMo,reserve:0,ds,assetFee,sale,dispoFee,payoff,refi,refiEq,equityDraw,eqDraw:(mo===1?equityDraw:0),cf,grossSale});
   values.push(cf);dates.push(dt);
 }
 const irr=bkXirrClose(values,dates,start,-(rows[0]?Number(rows[0].eqDraw)||0:0)),dist=values.reduce((z,v)=>z+Math.max(0,v),0),contrib=values.reduce((z,v)=>z+Math.max(0,-v),0),moic=contrib?dist/contrib:0;
 const grossSale=(rows[rows.length-1]||{}).grossSale||0;
 return {s,u:{irr:NaN,moic:0,grossSale,netSale:(rows[rows.length-1]||{}).sale||0},d:{equity:contrib,debtAtSale:(rows[rows.length-1]||{}).payoff||0},x,rows,values,dates,irr,moic,dist,contrib,isDevelopment:true,closeDt:new Date(start)};
}
// NOTE: this block's own bkMonthlyReturns() router was removed in V2.4 -- it was always overridden
// anyway by V1.5's later reassignment (last assignment wins in this file), so it was dead weight
// even before V2.4. bkDevMonthlyReturnsV12 above is untouched and is now reached through the one
// final router added at the end of the file in V2.4, alongside the restored bkOperatingV02().
const _returnsV12=RENDERERS['Returns'];
RENDERERS['Returns']=function(){const s=bkLoad();if(String(s.dealType||'').toLowerCase()!=='development')return _returnsV12();const r=bkDevMonthlyReturnsV12(),x=r.x,m=n=>n<0?'('+bkFmt(-n)+')':bkFmt(n);const active=r.rows.filter(z=>z.equityDraw||z.refi||z.refiEq||z.noi||z.ds||z.sale).slice(-36);const rr=active.map(z=>`<tr><td class="rowlabel">${z.m}</td><td>${m(-z.equityDraw-z.refiEq)}</td><td>${m(z.noi)}</td><td>${m(-z.ds)}</td><td>${m(z.refi)}</td><td>${m(z.sale)}</td><td>${m(-z.payoff)}</td><td>${m(z.cf)}</td></tr>`).join('');const main=`<div class="tbl-wrap"><table class="fin"><caption>Development Return Summary - Monthly Dated Engine</caption><thead><tr><th class="rowlabel-h">Metric</th><th>Result</th><th>Engine Status</th></tr></thead><tbody><tr><td class="rowlabel">Total Equity Contributions</td><td>${m(r.contrib)}</td><td>Monthly funding + refi shortfall</td></tr><tr><td class="rowlabel">Total Distributions</td><td>${m(r.dist)}</td><td>Operations + refi + sale</td></tr><tr class="grandtotal"><td class="rowlabel">Development Levered XIRR</td><td>${isFinite(r.irr)?bkPct(r.irr):'-'}</td><td>Live</td></tr><tr class="grandtotal"><td class="rowlabel">Development Levered MOIC</td><td>${r.moic.toFixed(3)}x</td><td>Live</td></tr><tr><td class="rowlabel">Permanent Loan</td><td>${m(x.permLoan)}</td><td>Takeout at stabilization</td></tr><tr><td class="rowlabel">Gross Exit Value</td><td>${m(r.u.grossSale)}</td><td>Forward NOI / exit cap</td></tr></tbody></table></div><div class="tbl-wrap" style="margin-top:16px;overflow:auto"><table class="fin"><caption>Development Equity Cash Flow - Active Months</caption><thead><tr><th class="rowlabel-h">Month</th><th>Equity Funding</th><th>NOI</th><th>Debt Service</th><th>Refi Proceeds</th><th>Net Sale</th><th>Debt Payoff</th><th>Net Equity CF</th></tr></thead><tbody>${rr}</tbody></table></div><div class="note-flag"><span>&#10003;</span><div><b>Development return bridge -</b> construction equity draws, stabilization, permanent-loan takeout, operating NOI, permanent debt service and exit proceeds now feed one dated monthly equity cash-flow stream. That same stream feeds the existing Waterfall engine.</div></div>`;return{title:'Returns',crumbs:'Returns & Equity',desc:'Development cash flow from construction through stabilization, refinance and exit.',meta:{Property:s.name,'Deal Type':'Development',XIRR:isFinite(r.irr)?bkPct(r.irr):'-',MOIC:r.moic.toFixed(3)+'x',Status:'Live'},main,sidebar:sidebarShell(`<div class="card"><div class="card-head">Development Return Bridge</div><div class="metric-list"><div class="metric-row"><span class="k">Stabilization Month</span><span class="v">${x.stab}</span></div><div class="metric-row"><span class="k">Construction Commitment</span><span class="v">${bkFmt(x.commit)}</span></div><div class="metric-row"><span class="k">Permanent Loan</span><span class="v">${bkFmt(x.permLoan)}</span></div><div class="metric-row"><span class="k">Net Refi Proceeds</span><span class="v">${bkFmt(x.refiProceeds)}</span></div></div></div>${colorKeyCard()}`)};};
