
/* V29.9.5 - regression hardening discovered by full browser regression. No property operating formula changes. */
(function(){
  // Floating debt: a purchased rate cap is an INDEX strike. Legacy debtCap remains an optional all-in coupon cap.
  const _rate=bkDebtRateForMonth;
  const bkIdx95=(s,m)=>{const y=Math.min(10,Math.max(1,Math.ceil(m/12))),v=s['debtIndexY'+y];return (v===null||v===undefined||v==='')?Math.max(0,Number(s.debtIndexRate)||0):Math.max(0,Number(v)||0);};
  window.bkDebtRateForMonth=function(s,m){
    if(String(s.debtRateType||'Fixed')!=='Floating') return Math.max(0,Number(s.acqRate)||0);
    let idx=bkIdx95(s,m), strike=Math.max(0,Number(s.rateCapStrike)||0); if(strike>0) idx=Math.min(idx,strike);
    const spread=Math.max(0,Number(s.debtSpread)||0), floor=Math.max(0,Number(s.debtFloor)||0), cap=Math.max(0,Number(s.debtCap)||0);
    let r=Math.max(idx+spread,floor); if(cap>0)r=Math.min(r,cap); return r;
  };

  /* V32.2: the floating-only schedule override that lived here is REMOVED. bkDebtLifecycleCore (v2992 layer) is the single schedule authority for fixed and floating loans. */

  // Scenario debt-rate deltas shift the entire saved floating curve, not only the fallback index.
  const _sc=bkScenarioOverrides;
  window.bkScenarioOverrides=function(s,which){const ov=_sc(s,which),delta=which==='Upside'?Number(s.upDebtRateDelta||0):which==='Downside'?Number(s.downDebtRateDelta||0):0;if(delta&&String(s.debtRateType||'Fixed')==='Floating'){for(let y=1;y<=10;y++){const k='debtIndexY'+y;if(s[k]!==null&&s[k]!==undefined&&s[k]!=='')ov[k]=Math.max(0,Number(s[k])+delta);}}return ov;};

  // Selected scenario is a non-destructive VIEW across economic output sheets. Base inputs remain canonical.
  const /* V29.11.1: 'Dashboard', 'Levered CF', 'Sponsor Economics' and 'Sale Analysis' were
     removed - no renderer of those names exists, so those four entries silently
     no-opped. The remaining seven are the renderers that actually consume the
     scenario scratch-state view. */
  scenarioSheets=['Operating Underwrite','Property CF','Debt','Debt Schedule','Returns','Equity Waterfall','Covenant Monitor'];
  scenarioSheets.forEach(name=>{const fn=RENDERERS[name];if(!fn||fn.__bkScenarioWrapped)return;const wrapped=function(){const base=bkLoad(),c=String(base.scenarioCase||'Base');if(c==='Base')return fn();const scratch=Object.assign({},base,bkScenarioOverrides(base,c),{_scenarioView:c}),ol=window.bkLoad,os=window.bkSave;window.bkLoad=()=>scratch;window.bkSave=d=>{Object.assign(scratch,d);return d;};try{const o=fn();o.meta=Object.assign({},o.meta||{},{Scenario:c});o.desc=(o.desc||'')+' Scenario view: '+c+'. Base assumptions remain unchanged.';return o;}finally{window.bkLoad=ol;window.bkSave=os;}};wrapped.__bkScenarioWrapped=true;RENDERERS[name]=wrapped;});

  // Correct waterfall QA sign convention: partner contribution CFs are negative by design.
  window.bkWaterfallAuditV2994=function(){const s=bkEnsureV04(),w=bkWaterfallV07(),tol=.02;let con=0,dist=0,lpCon=0,gpCon=0,lpDist=0,gpDist=0;w.rows.forEach(r=>{con+=Number(r.con||0);dist+=Number(r.dist||0);lpCon+=Number(r.lpCon||0);gpCon+=Number(r.gpCon||0);lpDist+=Number(r.lpDist||0);gpDist+=Number(r.gpDist||0);});const checks=[['Contribution conservation',Math.abs(con-(-lpCon-gpCon))<=tol],['Distribution conservation',Math.abs(dist-(lpDist+gpDist))<=tol],['EM hurdles monotonic',Number(s.em1||0)<=Number(s.em2||0)&&Number(s.em2||0)<=Number(s.em3||0)],['Finite LP MOIC',isFinite(w.lp.moic)],['Finite GP MOIC',isFinite(w.gp.moic)]];return{pass:checks.every(x=>x[1]),checks};};

  // Refinance valuation cannot be negative.
  const _mr=bkMonthlyReturns;
  window.bkMonthlyReturns=function(){const x=_mr();if(x.refi&&x.refi.value<0)x.refi.value=0;return x;};

  // Expense-growth sensitivity must target the live engine key (opexGrowth).
  const sens=RENDERERS['Sensitivity'];
  RENDERERS['Sensitivity']=function(){const o=sens();o.main=o.main.replace(/Expense Growth Sensitivity/g,'Operating Expense Growth Sensitivity').replace(/\[key\]:v/g,'[key]:v');return o;};
})();
