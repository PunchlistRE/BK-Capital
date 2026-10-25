
// V29.9.2 - explicit annual floating-rate curve + variable-rate amortization.
// Fixed path remains unchanged. Floating debt uses a saved annual index curve when provided;
// blank years fall back to the base index assumption. No live market feed is used.
(function(){
  const curveKeys=Array.from({length:10},(_,i)=>'debtIndexY'+(i+1));
  curveKeys.forEach(k=>{if(BK_BASE[k]===undefined) BK_BASE[k]=null;});
  const _ensure=bkEnsureV04;
  window.bkEnsureV04=function(){
    const s=_ensure(), dirty=curveKeys.some(k=>s[k]===undefined);
    curveKeys.forEach(k=>{if(s[k]===undefined)s[k]=null;});
    if(dirty) bkSave(s); return s;
  };
  function isFloating(s){return String(s.debtRateType||'Fixed').toLowerCase()==='floating';}
  function indexForMonth(s,m){
    const y=Math.min(10,Math.max(1,Math.ceil(m/12))), raw=s['debtIndexY'+y];
    return (raw!==null && raw!=='' && Number.isFinite(Number(raw)))?Math.max(0,Number(raw)):Math.max(0,Number(s.debtIndexRate)||0);
  }
  window.bkDebtRateForMonth=function(s,m){
    if(!isFloating(s)) return Math.max(0,Number(s.acqRate)||0);
    const idx=indexForMonth(s,m), spread=Math.max(0,Number(s.debtSpread)||0);
    let r=idx+spread, floor=Math.max(0,Number(s.debtFloor)||0), cap=Math.max(0,Number(s.debtCap)||0);
    r=Math.max(r,floor); if(cap>0)r=Math.min(r,cap); return r;
  };
  window.bkDebtCoupon=function(s){return bkDebtRateForMonth(s||bkEnsureV04(),1);};
  /* V32.2 (F01/F09) - AUTHORITATIVE DEBT LIFECYCLE. The ONLY place that builds the acquisition-loan schedule,
     maturity/balloon, refinance sizing/funding, post-refi debt service and the amount repaid from sale proceeds.
     Every consumer (Returns, After-Tax, Exports, Portfolio, Covenants, renderers) reads bkDebt().lifecycle / bkDebt().months.
     Conventions: IO does NOT consume the stated amortization period (approved F09). Row.balance = balance outstanding at month end
     after scheduled payment and any maturity/refinance event, BEFORE repayment from sale proceeds in the final month.
     Row identity: beg + draw - principal - payoff = balance. */
  function bkDebtLifecycleCore(s,loan,holdM,debtOff,noiArrFn){
    const amortMonths=Math.max(1,Math.round(Number(s.acqAmort)*12)),io=Math.max(0,Math.round(Number(s.acqIO)*12));
    const maturity=Math.max(1,Math.round(Number(s.debtTerm||s.holdYears)*12)),preExit=maturity<holdM;
    const zeroRow=m=>({m,loan:'NONE',beg:0,draw:0,payment:0,interest:0,principal:0,payoff:0,fees:0,balance:0,annualRate:0,indexRate:null});
    const orig=[];let bal=loan;
    for(let m=1;m<=holdM;m++){
      if(m>maturity){orig.push(zeroRow(m));continue;}
      const annualRate=bkDebtRateForMonth(s,m),r=annualRate/12,indexRate=isFloating(s)?indexForMonth(s,m):null,beg=bal,interest=bal*r;
      let principal=0,payment=interest;
      if(m>io){const remaining=Math.max(1,amortMonths-(m-io-1));payment=bkPmt(r,remaining,bal);principal=Math.max(0,Math.min(bal,payment-interest));}
      bal=Math.max(0,bal-principal);
      orig.push({m,loan:loan>0?'ORIGINAL':'NONE',beg,draw:0,payment,interest,principal,payoff:0,fees:0,balance:bal,annualRate,indexRate});
    }
    const balloon=orig[Math.min(maturity,holdM)-1]?orig[Math.min(maturity,holdM)-1].balance:0;
    let refi=null;
    if(Number(s.refiAtMaturity||0)&&preExit&&!debtOff){
      const arr=noiArrFn(),y=Math.min(arr.length-1,Math.max(0,Math.ceil(maturity/12)-1)),noi=Number(arr[y]?.noi||0),cap=Math.max(.0001,Number(s.refiCapRate||s.exitCap||.07)),val=noi/cap,
        unit=bkPmt(Number(s.refiRate||0)/12,Math.max(1,Number(s.refiAmort||30)*12),1),byLTV=val*Number(s.refiLTV||0),
        byDSCR=(Number(s.refiDSCR)>0&&unit>0)?(noi/Number(s.refiDSCR))/(unit*12):Infinity,
        rl=Math.max(0,Math.floor(Math.min(byLTV,byDSCR)/1000)*1000),fee=rl*Number(s.refiOrigFee||0);
      refi={month:maturity,loan:rl,fee,rate:Number(s.refiRate||0),amort:Number(s.refiAmort||30),balance:rl,pmt:bkPmt(Number(s.refiRate||0)/12,Math.max(1,Number(s.refiAmort||30)*12),rl),value:val,cap,byLTV,byDSCR,noi,binding:(Math.floor(byDSCR/1000)*1000===rl?'DSCR':'LTV')};
    }
    const refiRows=[];let rb=refi?refi.loan:0;
    if(refi)for(let m=maturity+1;m<=holdM;m++){const beg=rb,interest=rb*(refi.rate/12),principal=Math.max(0,Math.min(rb,refi.pmt-interest)),pay=Math.min(refi.pmt,interest+principal);rb=Math.max(0,rb-principal);
      refiRows.push({m,loan:'REFI',beg,draw:0,payment:pay,interest,principal,payoff:0,fees:0,balance:rb,annualRate:refi.rate,indexRate:null});}
    const combined=[];
    for(let m=1;m<=holdM;m++){
      if(m<maturity||(m===maturity&&!preExit))combined.push(orig[m-1]);
      else if(m===maturity){const o=orig[m-1],draw=refi?refi.loan:0;combined.push(Object.assign({},o,{draw,payoff:balloon,fees:refi?refi.fee:0,balance:o.balance+draw-balloon}));}
      else combined.push(refi?refiRows[m-maturity-1]:zeroRow(m));
    }
    const flows={ds:combined.map(x=>x.payment),interest:combined.map(x=>x.interest),principal:combined.map(x=>x.principal),
      balloonEquity:combined.map(x=>(preExit&&!refi&&x.m===maturity)?balloon:0),
      refiProceeds:combined.map(x=>(refi&&x.m===maturity)?Math.max(0,refi.loan-balloon-refi.fee):0),
      refiShortfall:combined.map(x=>(refi&&x.m===maturity)?Math.max(0,balloon+refi.fee-refi.loan):0)};
    const payoffAtSale=debtOff?0:(refi&&holdM>maturity?(refiRows.length?refiRows[refiRows.length-1].balance:refi.loan):(!preExit?(orig[holdM-1]?orig[holdM-1].balance:0):0));
    const annual=[];for(let y=1;y<=Math.ceil(holdM/12);y++){const ms=combined.slice((y-1)*12,y*12),live=ms.filter(a=>a.loan!=='NONE');
      annual.push({y,payment:ms.reduce((z,a)=>z+a.payment,0),interest:ms.reduce((z,a)=>z+a.interest,0),principal:ms.reduce((z,a)=>z+a.principal,0),draw:ms.reduce((z,a)=>z+a.draw,0),payoff:ms.reduce((z,a)=>z+a.payoff,0),
        ending:ms.length?ms[ms.length-1].balance:0,avgRate:live.length?live.reduce((z,a)=>z+a.annualRate,0)/live.length:0,indexRate:ms.length?ms[0].indexRate:null});}
    return{loan,maturityMonth:maturity,holdMonths:holdM,preExit,balloon,refi,original:orig,refiMonths:refiRows,combined,annual,flows,payoffAtSale,
      fundedBy:preExit?(refi?'REFINANCE':'EQUITY'):'SALE',conventions:{ioConsumesAmort:false}};
  }
  window.bkDebtLifecycle=function(){return bkDebt().lifecycle;};
  window.bkDebt=function(){
    const s=bkEnsureV04(),op=bkCalc(),basis=Number(s.purchasePrice)*(1+Number(s.closingCostsPct)+bkAcqFeePct(s));
    const stab=Number(s.exitCap)>0?op.noi/Number(s.exitCap):0;
    /* CONVENTION cvLtvBasis: the value the acquisition LTV test is applied to. LTC, DSCR and debt
       yield are unchanged and the loan is still the lowest of all constraints. */
    const ltvBasis=bkConventions(s).cvLtvBasis, price=Number(s.purchasePrice)||0;
    const ltvValue=ltvBasis==='price'?price:ltvBasis==='lesser'?(stab>0?Math.min(price,stab):price):stab;
    const byLTV=Number(s.acqLTV)*ltvValue,byLTC=Number(s.acqLTC)>0?Number(s.acqLTC)*basis:Infinity;
    const coupon=bkDebtRateForMonth(s,1),amortMonths=Math.max(1,Math.round(Number(s.acqAmort)*12)),unitPmt=bkPmt(coupon/12,amortMonths,1);
    const byDSCR=(Number(s.acqDSCR)>0&&unitPmt>0)?(op.noi/Number(s.acqDSCR))/(unitPmt*12):Infinity;
    /* V29.11.0 - fourth ORIGINATION constraint. Uses op.noi, the SAME underwriting NOI the
       DSCR test uses, so adding a constraint never changes the debt engine's NOI basis.
       acqDebtYield is the ACQUISITION minimum and is deliberately a DIFFERENT field from
       minDebtYield, the ongoing Covenant Monitor threshold created by bkEnsureV17. */
    const byDebtYield=Number(s.acqDebtYield)>0?op.noi/Number(s.acqDebtYield):Infinity;
    /* debtEnabled is the ONLY way to model an unlevered deal. debtTerm=0 means term-equals-hold
       via a falsy-OR and must never be used to mean no debt. */
    const debtOff=(s.debtEnabled===false);
    const raw=Math.max(0,Math.min(byLTV,byLTC,byDSCR,byDebtYield)),loan=debtOff?0:Math.floor(raw/1000)*1000,fee=debtOff?0:loan*Number(s.acqOrigFee);
    const initialPmt=bkPmt(coupon/12,amortMonths,loan),dscr=initialPmt?op.noi/(initialPmt*12):0,ltv=ltvValue?loan/ltvValue:0,ltc=basis?loan/basis:0;
    let binding=debtOff?'DEBT OFF':'LTV';const rounded=x=>Math.floor(x/1000)*1000;
    if(!debtOff){ if(rounded(byDebtYield)===loan)binding='DEBT YIELD';
      else if(rounded(byDSCR)===loan)binding='DSCR'; else if(rounded(byLTC)===loan)binding='LTC'; }
    const hold=Math.round(Number(s.holdYears)*12);
    const L=bkDebtLifecycleCore(s,loan,hold,debtOff,()=>bkAnnualCF().arr);
    const months=L.combined,annual=L.annual,liveR=months.filter(x=>x.loan!=='NONE');
    /* V32.3 (CV-D2): reported payment and going-in DSCR use the ACTUAL month-1 contractual payment (interest-only during an IO period). The amortizing figures stay available as pmtAmortizing / dscrAmortizing. Debt SIZING is unchanged (still sized on the amortizing constant). */
    const goingInPmt=(L.combined[0]&&L.combined[0].loan!=='NONE')?L.combined[0].payment:0,goingInDscr=goingInPmt?op.noi/(goingInPmt*12):0,pmtBasis=Math.round(Number(s.acqIO)*12)>0?'INTEREST-ONLY':'AMORTIZING';
    const equity=basis+fee-loan,maxCoupon=liveR.length?Math.max(...liveR.map(x=>x.annualRate)):coupon,minCoupon=liveR.length?Math.min(...liveR.map(x=>x.annualRate)):coupon;
    return{s,op,basis,stab,ltvBasis,ltvValue,byLTV,byLTC,byDSCR,byDebtYield,debtEnabled:!debtOff,loan,fee,pmt:debtOff?0:goingInPmt,dscr:debtOff?0:goingInDscr,pmtBasis,pmtAmortizing:debtOff?0:initialPmt,dscrAmortizing:debtOff?0:dscr,ltv:debtOff?0:ltv,ltc:debtOff?0:ltc,binding,months,annual,equity,debtAtSale:debtOff?0:L.payoffAtSale,coupon,rateType:isFloating(s)?'Floating':'Fixed',maxCoupon,minCoupon,lifecycle:L};
  };

  const _du=sheetDealUnderwrite;
  window.sheetDealUnderwrite=function(){
    const o=_du(),s=bkEnsureV04(); if(!isFloating(s)) return o;
    if(o.main.includes('Floating Index Curve')) return o;
    const rows=curveKeys.map((k,i)=>bkInput('Index Rate - Year '+(i+1),k,'%','pct')).join('');
    const panel=`<div class="tbl-wrap" style="margin-top:16px;"><table class="fin"><caption>Floating Index Curve - Saved Deal Assumptions</caption><thead><tr><th class="rowlabel-h">Year</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div><div class="note-flag"><span>&#10003;</span><div><b>Floating-rate curve -</b> enter explicit annual index assumptions when a forward curve is available. A blank year falls back to the base Index Rate Assumption. The credit spread, floor and cap are then applied to each year's index. These are saved underwriting assumptions, not a live market feed.</div></div>`;
    o.main+=panel; return o;
  };

  window.sheetDebtSchedule=function(){
    const d=bkDebt(),shown=d.annual.slice(0,10),money=n=>n<0?'('+bkFmt(-n)+')':bkFmt(n),heads=shown.map(a=>`<th>Year ${a.y}</th>`).join(''),cells=k=>shown.map(a=>`<td>${money(a[k])}</td>`).join('');
    const indexRow=d.rateType==='Floating'?`<tr><td class="rowlabel">Index Rate</td>${shown.map(a=>`<td>${bkPct(a.indexRate||0)}</td>`).join('')}</tr>`:'';
    const main=`<div class="tbl-wrap"><table class="fin"><caption>Acquisition Debt Schedule - Annual Summary</caption><thead><tr><th class="rowlabel-h">Line Item</th>${heads}</tr></thead><tbody><tr><td class="rowlabel">Beginning Balance</td>${shown.map((a,i)=>`<td>${money(i?shown[i-1].ending:d.loan)}</td>`).join('')}</tr>${indexRow}<tr><td class="rowlabel">Effective Coupon</td>${shown.map(a=>`<td>${bkPct(a.avgRate)}</td>`).join('')}</tr><tr><td class="rowlabel">Debt Service</td>${cells('payment')}</tr><tr><td class="rowlabel">Interest Expense</td>${cells('interest')}</tr><tr><td class="rowlabel">Principal Amortization</td>${cells('principal')}</tr><tr class="grandtotal"><td class="rowlabel">Ending Balance</td>${cells('ending')}</tr></tbody></table></div><div class="note-flag"><span>&#10003;</span><div><b>Variable-rate mechanics -</b> floating coupons reprice from the saved annual index curve. During amortization, debt service is recalculated using the current coupon, remaining balance and remaining amortization term. Fixed-rate debt retains the legacy constant-coupon schedule.</div></div>`;
    const sidebar=sidebarShell(`<div class="card"><div class="card-head">Schedule Metrics</div><div class="metric-list"><div class="metric-row"><span class="k">Rate Type</span><span class="v">${d.rateType}</span></div><div class="metric-row"><span class="k">Initial Coupon</span><span class="v">${bkPct(d.coupon)}</span></div><div class="metric-row"><span class="k">Min / Max Coupon</span><span class="v">${bkPct(d.minCoupon)} / ${bkPct(d.maxCoupon)}</span></div><div class="metric-row"><span class="k">Initial Balance</span><span class="v">$${bkFmt(d.loan)}</span></div><div class="metric-row"><span class="k">Debt at Sale</span><span class="v">$${bkFmt(d.debtAtSale)}</span></div></div></div>${colorKeyCard()}`);
    return{title:'Debt Schedule',crumbs:'Debt',desc:'Monthly debt schedule with fixed coupon or saved floating-rate curve repricing.',meta:{Property:d.s.name,'Rate Type':d.rateType,'Initial Rate':bkPct(d.coupon),'Max Rate':bkPct(d.maxCoupon),Amortization:d.s.acqAmort+' years',Hold:d.s.holdYears+' years',Currency:'USD',Status:'Live'},main,sidebar};
  };

  // Floating-rate QA: fixed-path parity and rate mechanics sanity checks.
  window.bkFloatingDebtQA=function(){
    const original=JSON.parse(JSON.stringify(bkLoad())),tests=[]; const add=(n,p,d='')=>tests.push({name:n,pass:!!p,detail:d});
    try{
      let s=bkLoad();s.debtRateType='Fixed';bkSave(s);const f=bkDebt();add('Fixed coupon equals acqRate',Math.abs(f.coupon-(Number(s.acqRate)||0))<1e-12);
      s=bkLoad();s.debtRateType='Floating';s.debtIndexRate=.05;s.debtSpread=.025;s.debtFloor=0;s.debtCap=0;curveKeys.forEach(k=>s[k]=null);bkSave(s);let x=bkDebt();add('Floating base = index + spread',Math.abs(x.coupon-.075)<1e-12);
      s=bkLoad();s.debtFloor=.08;bkSave(s);x=bkDebt();add('Coupon floor enforced',Math.abs(x.coupon-.08)<1e-12);
      s=bkLoad();s.debtFloor=0;s.debtCap=.07;bkSave(s);x=bkDebt();add('Coupon cap enforced',Math.abs(x.coupon-.07)<1e-12);
      s=bkLoad();s.debtCap=0;s.debtIndexY1=.04;s.debtIndexY2=.06;bkSave(s);x=bkDebt();add('Year 1 curve applied',Math.abs(x.months[0].annualRate-.065)<1e-12); if(x.months.length>12)add('Year 2 curve applied',Math.abs(x.months[12].annualRate-.085)<1e-12);
      add('Debt balance never negative',x.months.every(m=>m.balance>=-1e-8));add('Payments finite',x.months.every(m=>Number.isFinite(m.payment)&&Number.isFinite(m.interest)&&Number.isFinite(m.principal)));
    } finally {bkSave(original);}
    return{passed:tests.filter(t=>t.pass).length,failed:tests.filter(t=>!t.pass).length,tests};
  };

  RENDERERS['Deal Underwrite']=sheetDealUnderwrite;RENDERERS['Debt Schedule']=sheetDebtSchedule;
})();
