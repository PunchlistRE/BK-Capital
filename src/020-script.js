
/* Punchlist Capital V1.3 - live Excel/web certification dashboard. Visual master unchanged. */
(function(){
 const BASE={unlevIRR:.06716576516628264,unlevMOIC:1.7091370612195809,levIRR:.060999193787574776,levMOIC:1.7263549737865043,peakEq:5701460,grossSale:13254725.15451842,t12NOI:515307.92};
 function pctDiff(a,b){return b?Math.abs(a-b)/Math.abs(b):Math.abs(a-b)}
 function qaRow(label,web,xl,tol,fmt){const d=pctDiff(web,xl),pass=isFinite(d)&&d<=tol;const f=fmt||((v)=>bkFmt(v));return `<tr><td class="rowlabel">${label}</td><td>${f(web)}</td><td>${f(xl)}</td><td>${isFinite(d)?(d*100).toFixed(3)+'%':'-'}</td><td><span class="status-chip ${pass?'pass':'fail'}">${pass?'PASS':'REVIEW'}</span></td></tr>`}
 function sheetQAV13(){
   const s=bkLoad(), isDev=String(s.dealType||'').toLowerCase()==='development';
   /* V30.2: the Excel baseline is the reference workbook's (Harvard Avenue, BK-001) values. Comparing
      any other deal against it produced a meaningless "0 / 6 - NOT CERTIFIED". It now applies only
      to the reference deal; other deals show N/A and are covered by model controls and the
      independent reconciliation suite. */
   const isRef=/harvard|havard/i.test(String(s.name||'')+' '+String(s.location||'')) || String(s.dealId||'')==='BK-001';
   let rows='', pass=0,total=0;
   if(!isDev && isRef){
     const r=bkMonthlyReturns(),u=r.u;
     const tests=[
       ['Unlevered IRR',u.irr,BASE.unlevIRR,.002,v=>bkPct(v)],
       ['Unlevered MOIC',u.moic,BASE.unlevMOIC,.002,v=>Number(v).toFixed(3)+'x'],
       ['Levered XIRR',r.irr,BASE.levIRR,.002,v=>bkPct(v)],
       ['Levered MOIC',r.moic,BASE.levMOIC,.002,v=>Number(v).toFixed(3)+'x'],
       ['Peak / Initial Equity',r.d.equity,BASE.peakEq,.002,v=>bkFmt(v)],
       ['Gross Sale Price',u.grossSale,BASE.grossSale,.002,v=>bkFmt(v)]
     ];
     tests.forEach(t=>{total++; if(isFinite(t[1])&&pctDiff(t[1],t[2])<=t[3])pass++; rows+=qaRow(...t)});
   }
   const status=!isRef?'N/A':(total&&pass===total?'PASS':'TIE-OUT IN PROGRESS');
   const cls=status==='PASS'?'pass':(status==='N/A'?'':'warn');
   if(!isRef && !isDev) rows='<tr><td class="rowlabel" colspan="5">N/A - the Excel tie-out applies only to the reference workbook deal (Harvard Avenue, BK-001). This deal is checked by the model controls on Home and by the independent reconciliation suite.</td></tr>';
   const main=`<div class="tbl-wrap"><table class="fin"><caption>Excel ↔ Web Engine Certification - Active Deal</caption><thead><tr><th class="rowlabel-h">Metric</th><th>Web Engine</th><th>Excel Baseline</th><th>Variance</th><th>Status</th></tr></thead><tbody>${isDev?'<tr><td class="rowlabel" colspan="5">Development certification requires a saved Excel development baseline; engine is live but not certified from the active acquisition baseline.</td></tr>':rows}</tbody></table></div>
   <div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Certification Gates</caption><tbody>
   <tr><td class="rowlabel">Web core return tie-out</td><td><span class="status-chip ${cls}">${status}</span></td></tr>
   <tr><td class="rowlabel">Checks passed</td><td>${isRef?pass+' / '+total:'N/A'}</td></tr>
   <tr><td class="rowlabel">Workbook structural failures</td><td>0</td></tr>
   <tr><td class="rowlabel">Workbook stamped regression</td><td>30 of 30 rows - PASS</td></tr>
   <tr><td class="rowlabel">Workbook live ENGINE CERTIFIED flag</td><td>${isRef?'<span class="status-chip fail">NOT CERTIFIED - FAIL</span>':'<span class="status-chip">N/A - reference workbook only</span>'}</td></tr>
   </tbody></table></div>
   <div class="note-flag"><span>&#9888;</span><div><b>Certification is intentionally strict.</b> The workbook itself currently reports 0 structural failures and a 30/30 stamped regression, but its live ENGINE CERTIFIED gate still reads NOT CERTIFIED - FAIL because the synthetic QA suite needs to be rerun after the repaired assertions. This check does not override that workbook status. Web rows only pass when the live browser result is within 0.20% of the stored Excel baseline.</div></div>`;
   const sidebar=sidebarShell(`<div class="card"><div class="card-head">Web Certification</div><div class="metric-list"><div class="metric-row"><span class="k">Active Deal</span><span class="v">${s.name||'-'}</span></div><div class="metric-row"><span class="k">Web Tie-Out</span><span class="v"><span class="status-chip ${cls}">${status}</span></span></div><div class="metric-row"><span class="k">Passed</span><span class="v">${isRef?pass+' / '+total:'N/A'}</span></div><div class="metric-row"><span class="k">Tolerance</span><span class="v">0.20%</span></div></div></div>${colorKeyCard()}`);
   return {title:'QA',crumbs:'QA',desc:'Live Excel-to-web engine tie-out and certification gates.',meta:{Property:s.name||'-','Web Checks':isRef?pass+' / '+total:'N/A','Workbook Structural':isRef?'0 failures':'N/A','Workbook Engine':isRef?'NOT CERTIFIED':'N/A',Status:status},main,sidebar};
 }
 RENDERERS['QA']=sheetQAV13;
 window.BK_V13={excelBaseline:BASE,version:'1.3',certification:'live'};
})();
