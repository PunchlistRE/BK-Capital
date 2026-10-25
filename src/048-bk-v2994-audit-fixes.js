
/* V29.9.4 - audit remediation: contractual balloon, refinance valuation, rate-cap uses,
   scenario view semantics, waterfall conservation QA, and expanded institutional sensitivity. */
(function(){
  Object.assign(BK_BASE,{refiCapRate:0.07,rateCapStrike:0,rateCapCost:0,scenarioCase:'Base'});
  const _ensure=bkEnsureV04;
  window.bkEnsureV04=function(){const s=_ensure();let dirty=false;({refiCapRate:Number(s.exitCap||.07),rateCapStrike:0}).constructor===Object&&Object.entries({refiCapRate:Number(s.exitCap||.07),rateCapStrike:0}).forEach(([k,v])=>{if(s[k]===undefined){s[k]=v;dirty=true;}});if(dirty)bkSave(s);return s;};

  // Keep Base canonical. This helper supplies a non-destructive selected-case view to renderers/tests.
  window.bkSelectedCaseState=function(){const s=bkEnsureV04(),c=String(s.scenarioCase||'Base');return Object.assign({},s,(typeof bkScenarioOverrides==='function'?bkScenarioOverrides(s,c):{}),{_scenarioView:c});};
  window.bkRunSelectedCase=function(){const s=bkEnsureV04();return bkRunScenario(typeof bkScenarioOverrides==='function'?bkScenarioOverrides(s,String(s.scenarioCase||'Base')):{});};

  // Deal-underwrite addendum: separate refi valuation and true cap-strike metadata.
  const _du=sheetDealUnderwrite;
  window.sheetDealUnderwrite=function(){const o=_du(),s=bkEnsureV04();o.main+=`<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Audit-Fixed Debt Risk Inputs</caption><thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr></thead><tbody>${Number(s.refiAtMaturity)?bkInput('Refinance Valuation Cap Rate','refiCapRate','%','pct'):''}${String(s.debtRateType||'Fixed')==='Floating'?bkInput('Rate Cap Index Strike','rateCapStrike','%','pct'):''}</tbody></table></div>`;return o;};

  // Contractual maturity: old loan is paid at maturity. If no refi, equity funds balloon then.
  // If refi, new proceeds fund old balance + fee; shortfall is equity, excess is distribution.
  window.bkMonthlyReturns=function(){
    const s=bkEnsureV04(); if(String(s.dealType||'').toLowerCase()==='development'&&typeof bkDevMonthlyReturnsV12==='function')return bkDevMonthlyReturnsV12();
    const u=bkAnnualCF(),d=bkDebt(),months=Math.max(1,Math.round(Number(s.holdYears)*12)),start=bkParseDealDate(s.closing,'2027-01-01'),values=[],dates=[],rows=[];
    const L=d.lifecycle,maturity=L.maturityMonth,preExit=L.preExit,refi=L.refi,oldBalloon=L.balloon;   /* V32.2: lifecycle is the single debt authority */
    /* V32.1: Month 0 (closing date) carries the acquisition equity; month m cash flows are dated the last day of month m.
       Monthly operations are the EXACT monthly engine (bkAnnualCF().monthly), not each year's total spread evenly over 12 months.
       The disposition fee is a real cash cost at sale, alongside the cost of sale already netted in u.netSale. */
    const eqDraw=Number(d.equity||0)+Number(s.rateCapCost||0), dispPct=Number(s.dispositionFeePct||0);
    const xv=[-eqDraw], xd=[new Date(start)];
    for(let m=1;m<=months;m++){const y=Math.ceil(m/12),a=u.arr[Math.min(y-1,u.arr.length-1)],mo=(u.monthly&&u.monthly[m-1])||null,
        egi=mo?mo.egi:a.egi/12,noi=mo?mo.noiBeforeReserves:a.noi/12,reserve=mo?(mo.noiBeforeReserves-mo.noi):(a.noi-a.after)/12,
        assetFee=egi*Number(s.assetMgmtPct||0),sale=m===months?u.netSale:0,dispoFee=m===months?u.grossSale*dispPct:0;const ds=L.flows.ds[m-1],payoff=(m===months)?L.payoffAtSale:0,refiProceeds=L.flows.refiProceeds[m-1],refiShortfall=L.flows.refiShortfall[m-1],balloonEq=L.flows.balloonEquity[m-1];
      const other=noi-reserve-ds-assetFee+sale-dispoFee-payoff+refiProceeds-refiShortfall-balloonEq;
      const draw=(m===1)?eqDraw:0,cf=other-draw,dt=bkMonthEnd(start,m);
      values.push(cf);dates.push(dt);xv.push(other);xd.push(dt);
      rows.push({m,y,dt,egi,noi,reserve,ds,assetFee,sale,dispoFee,payoff,refi:refiProceeds,refiEq:refiShortfall,balloonEq,eqDraw:draw,cf,wfContrib:draw+Math.max(0,-other),wfDist:Math.max(0,other)});}
    const irr=bkXirr(xv,xd),dist=rows.reduce((z,r)=>z+r.wfDist,0),contrib=rows.reduce((z,r)=>z+r.wfContrib,0),moic=contrib?dist/contrib:0;
    return{s,u,d,rows,values,dates,irr,moic,dist,contrib,refi,oldBalloon,closeDt:new Date(start),eqDraw,xirrValues:xv,xirrDates:xd};
  };

  // S&U reconciliation: cap premium is a closing use/equity requirement.
  const _su=RENDERERS['Sources & Uses']; if(_su)RENDERERS['Sources & Uses']=function(){const o=_su(),s=bkEnsureV04();if(Number(s.rateCapCost||0)>0)o.main+=`<div class="note-flag"><span>✓</span><div><b>Rate cap premium:</b> $${bkFmt(Number(s.rateCapCost||0))} is funded as additional Month-1 equity in levered returns. It is not included in loan sizing basis.</div></div>`;return o;};

  // Waterfall regression: conservation and monotonic EM hurdles.
  window.bkWaterfallAuditV2994=function(){const s=bkEnsureV04(),w=bkWaterfallV07(),tol=.02;let con=0,dist=0,lpCon=0,gpCon=0,lpDist=0,gpDist=0;w.rows.forEach(r=>{con+=Number(r.con||0);dist+=Number(r.dist||0);lpCon+=Number(r.lpCon||0);gpCon+=Number(r.gpCon||0);lpDist+=Number(r.lpDist||0);gpDist+=Number(r.gpDist||0);});const checks=[['Contribution conservation',Math.abs(Math.abs(con)-Math.abs(lpCon+gpCon))<=tol],['Distribution conservation',Math.abs(dist-(lpDist+gpDist))<=tol],['EM hurdles monotonic',Number(s.em1||0)<=Number(s.em2||0)&&Number(s.em2||0)<=Number(s.em3||0)],['Finite LP MOIC',isFinite(w.lp.moic)],['Finite GP MOIC',isFinite(w.gp.moic)]];return{pass:checks.every(x=>x[1]),checks};};

  // Expanded sensitivity addendum using real scratch-engine reruns.
  const _sens=RENDERERS['Sensitivity'];RENDERERS['Sensitivity']=function(){const o=_sens(),s=bkEnsureV04();function rr(ov){try{return bkRunScenario(ov)}catch(e){return{irr:NaN,moic:NaN,d:null}}}function tbl(label,key,vals,fmt){return`<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>${label}</caption><thead><tr><th class="rowlabel-h">Metric</th>${vals.map(v=>`<th>${fmt(v)}</th>`).join('')}</tr></thead><tbody><tr><td class="rowlabel">Levered XIRR</td>${vals.map(v=>{const r=rr({[key]:v});return`<td>${isFinite(r.irr)?bkPct(r.irr):'n/a'}</td>`}).join('')}</tr><tr><td class="rowlabel">Levered MOIC</td>${vals.map(v=>{const r=rr({[key]:v});return`<td>${isFinite(r.moic)?r.moic.toFixed(2)+'x':'n/a'}</td>`}).join('')}</tr></tbody></table></div>`}const vac=Number(s.vacancy||s.vacancyPct||0),eg=Number(s.expenseGrowth||0),hold=Number(s.holdYears||10),ltv=Number(s.maxLTV||s.acqLTV||.65),spread=Number(s.debtSpread||0),rc=Number(s.refiCapRate||s.exitCap||.07),rrate=Number(s.refiRate||.065);o.main+=tbl('Vacancy Sensitivity','vacancy',[vac-.02,vac-.01,vac,vac+.01,vac+.02].map(x=>Math.max(0,x)),bkPct)+tbl('Operating Expense Growth Sensitivity','opexGrowth',[eg-.01,eg-.005,eg,eg+.005,eg+.01],bkPct)+tbl('Hold Period Sensitivity','holdYears',[Math.max(1,hold-2),Math.max(1,hold-1),hold,hold+1,hold+2],v=>Number(v).toFixed(0)+' yrs')+tbl('Refinance Cap Rate Sensitivity','refiCapRate',[rc-.01,rc-.005,rc,rc+.005,rc+.01].map(x=>Math.max(.001,x)),bkPct)+tbl('Refinance Rate Sensitivity','refiRate',[rrate-.01,rrate-.005,rrate,rrate+.005,rrate+.01].map(x=>Math.max(0,x)),bkPct);return o;};

  RENDERERS['Deal Underwrite']=sheetDealUnderwrite;
})();
