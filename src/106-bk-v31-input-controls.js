
/* V30.1 INPUT VALIDATION + MODEL CONTROLS (read-only; never changes an input or a result).
   Each check is independent of the engine's own formula for the thing it checks. Results
   are shown on Home and Deal Underwrite as PASS / WARN / FAIL and are available to QA via
   bkModelControls(). Invalid required inputs are flagged, never silently accepted. */
(function(){
  function num(v){ return (typeof v==='number') ? v : (v===''||v==null ? NaN : Number(v)); }
  /* V30.2: dates are validated with the SAME parser the engine uses (bkParseDealDate, which
     accepts YYYY-MM-DD and M/D/YYYY). The previous private check rejected M/D/YYYY, so Home could
     report "closing date invalid" while Deal Underwrite showed a valid 10/15/2026. */
  function pdate(d){ try{ return (typeof bkParseDealDate==='function') ? bkParseDealDate(d, null) : null; }catch(e){ return null; } }
  function validDate(d){ return !!pdate(d); }
  window.bkModelControls=function(){
    if(typeof bkIsProvisioned==='function' && !bkIsProvisioned()) return [];
    var s=bkLoad(), out=[], add=function(level,area,msg){ out.push({level:level,area:area,msg:msg}); };
    var dev=/develop/i.test(String(s.dealType||''));
    var pp=num(s.purchasePrice), cap=num(s.exitCap), hold=num(s.holdYears), vac=num(s.vacancy);
    if(!(pp>0) && !dev) add('FAIL','Purchase','Purchase price must be greater than zero.');
    if(pp<0) add('FAIL','Purchase','Purchase / land price is negative.');
    if(!validDate(s.closing)) add('FAIL','Timing','Acquisition / closing date is missing or invalid.');
    if(!(hold>=1)) add('FAIL','Exit','Hold period must be at least 1 year.');
    else if(hold>15) add('WARN','Exit','Hold period of '+hold+' years exceeds the engine\'s 15-year horizon - cash flows, sale and returns are calculated on a 15-year hold.');
    else if(Math.round(hold)!==hold) add('WARN','Exit','Hold period of '+hold+' years is not a whole number - the engine rounds it to '+Math.round(hold)+' years.');
    if(!(cap>0)) add('FAIL','Exit','Exit cap rate must be greater than zero - no sale value can be calculated.');
    else if(cap<0.03 || cap>0.15) add('WARN','Exit','Exit cap rate of '+(cap*100).toFixed(2)+'% is outside a typical 3%-15% range.');
    if(!(vac>=0 && vac<=1)) add('FAIL','Revenue','Vacancy must be between 0% and 100%.');
    else if(vac>=0.5) add('WARN','Revenue','Vacancy of '+(vac*100).toFixed(1)+'% is very high.');
    if(!(num(s.units)>0) && !(num(s.commercialArea)>0) && !(num(s.gsf)>0)) add('WARN','Property','No units, commercial area or GSF entered - per-unit and per-SF metrics cannot be calculated.');
    [['acqLTV','Acquisition LTV'],['acqLTC','Acquisition LTC'],['permLTV','Permanent LTV']].forEach(function(k){
      var v=num(s[k[0]]); if(isFinite(v) && (v<0 || v>1)) add('FAIL','Debt',k[1]+' must be between 0% and 100%.'); else if(v>0.85) add('WARN','Debt',k[1]+' of '+(v*100).toFixed(1)+'% is very high leverage.'); });
    ['acqRate','permRate','conRate','refiRate'].forEach(function(k){ var v=num(s[k]); if(isFinite(v) && (v<0 || v>0.25)) add('FAIL','Debt',k+' of '+(v*100).toFixed(2)+'% is outside 0%-25%.'); });
    if(isFinite(num(s.acqAmort)) && num(s.acqAmort)<0) add('FAIL','Debt','Amortization cannot be negative.');
    ['pref','hurdle2','hurdle3'].forEach(function(k){ var v=num(s[k]); if(isFinite(v) && (v<0 || v>1)) add('FAIL','Waterfall',k+' hurdle must be between 0% and 100%.'); });
    ['gpShare','t2LP','t3LP','t4LP'].forEach(function(k){ var v=num(s[k]); if(isFinite(v) && (v<0 || v>1)) add('FAIL','Waterfall',k+' split must be between 0% and 100%.'); });
    if(num(s.hurdle2)<num(s.pref) || num(s.hurdle3)<num(s.hurdle2)) add('WARN','Waterfall','Hurdles are not ascending (pref <= tier 2 <= tier 3).');
    var rr=Array.isArray(s.rentRoll)?s.rentRoll:[], ids={};
    rr.forEach(function(u,i){
      var id=String(u.unitId||'').trim(), tag=id||('row '+(i+1));
      if(id){ if(ids[id]) add('WARN','Rent Roll','Duplicate unit ID "'+id+'".'); ids[id]=true; }
      if(num(u.sf)<0 || num(u.inPlaceRent)<0 || num(u.marketRent)<0) add('FAIL','Rent Roll',tag+': negative SF or rent.');
      if(u.leaseStart && !validDate(u.leaseStart)) add('FAIL','Rent Roll',tag+': lease start is not a valid date.');
      if(u.leaseEnd && !validDate(u.leaseEnd)) add('FAIL','Rent Roll',tag+': lease end is not a valid date.');
      if(validDate(u.leaseStart) && validDate(u.leaseEnd) && pdate(u.leaseEnd) < pdate(u.leaseStart)) add('FAIL','Rent Roll',tag+': lease ends before it starts.');
    });
    if(/rent roll/i.test(String(s.revenueBasis||'')) && !rr.length) add('WARN','Rent Roll','Revenue basis is Rent Roll but the rent roll is empty.');
    (Array.isArray(s.commitments)?s.commitments:[]).forEach(function(c,i){
      var funded=(c.calls||[]).reduce(function(a,x){ return a+(num(x.funded)||0); },0);
      if(num(c.commitment)<0) add('FAIL','Investors','Commitment '+(i+1)+' is negative.');
      if(funded>num(c.commitment)+0.01) add('FAIL','Investors','Commitment '+(i+1)+' is funded beyond its commitment.');
      (c.calls||[]).forEach(function(x){ if(num(x.funded)>num(x.required)+0.01) add('WARN','Investors','A capital call for commitment '+(i+1)+' is funded beyond the amount called.'); });
    });
    if(dev){
      try{
        var f=bkDevFundingV10();
        if(f && f.isDev){
          if(num(f.commit)>0 && !Number(s.refiAtStab||0)){
            if(!(num(s.conRate)>0)) add('FAIL','Construction Debt','Construction loan is held to sale (no permanent takeout) but has no construction interest rate.');
            else add('WARN','Construction Debt','No permanent takeout: the construction loan is modeled as interest-only at '+(num(s.conRate)*100).toFixed(2)+'% after stabilization and repaid from sale proceeds. There is no construction-loan maturity input - confirm the loan term covers the hold.');
          }
          var extra=num(f.equityTotal)-num(f.eqTarget);
          if(isFinite(extra) && extra>0.5){
            var cap=num(s.maxEquityCommitment);
            if(isFinite(cap) && cap>0 && num(f.equityTotal)>cap+0.5) add('FAIL','Capitalization','Additional equity required: $'+Math.round(extra).toLocaleString()+' above planned equity; total equity $'+Math.round(num(f.equityTotal)).toLocaleString()+' exceeds the maximum equity commitment of $'+Math.round(cap).toLocaleString()+'.');
            else add('WARN','Capitalization','Additional equity required: $'+Math.round(extra).toLocaleString()+' above planned equity funding (the construction loan commitment is fully drawn).');
          }
        }
      }catch(e){}
    }
    // independent result checks (recomputed here, not read from the engine's own reconciliation)
    try{
      var u=bkAnnualCF();
      if(!isFinite(u.irr)) add('WARN','Returns','Unlevered IRR is not defined for these cash flows (no sign change) - shown as N/A.');
      var d=bkDebt();
      if(d && d.months && d.months.length){
        var prev=d.loan, bad=0;
        d.months.forEach(function(m){ if(typeof m.balance==='number' && Math.abs(prev-(m.principal||0)-m.balance)>0.01 && !m.refi) bad++; if(typeof m.balance==='number') prev=m.balance; });
        if(bad) add('FAIL','Debt','Debt balance does not roll forward in '+bad+' month(s) (beginning - principal != ending).');
      }
    }catch(e){ add('FAIL','Engine','The engine could not calculate this deal: '+(e&&e.message||e)); }
    return out;
  };
  window.bkControlsBanner=function(){
    var c=[]; try{ c=window.bkModelControls(); }catch(e){ return ''; }
    if(!c.length) return '';
    var f=c.filter(function(x){return x.level==='FAIL';}).length, w=c.length-f;
    return '<div class="note-flag bk-controls-flag"><span>&#9888;</span><div><b>Model controls: '+(f?f+' FAIL':'')+(f&&w?', ':'')+(w?w+' WARN':'')+'.</b> '
      +(f?'Results that depend on a failed input are not reliable until it is corrected.':'Review before relying on the results.')
      +'<ul>'+c.map(function(x){ var p=String(x.msg).split(' Why it matters: '), why=p.length>1?p.slice(1).join(' Why it matters: '):'';
        return '<li><span class="bk-ctl-'+x.level+'">'+x.level+'</span> - '+bkEsc(x.area)+': '+bkEsc(p[0])
          +(why?'<details style="margin-top:3px"><summary style="cursor:pointer;font-size:12px;opacity:.8">Why it matters</summary><div style="font-size:12.5px;margin-top:4px">'+bkEsc(why)+'</div></details>':'')+'</li>'; }).join('')+'</ul></div></div>';
  };
  ['Home','Deal Underwrite'].forEach(function(name){
    var prev=RENDERERS[name]; if(typeof prev!=='function') return;
    var g=function(){ var o=prev.apply(this,arguments); if(o && typeof o==='object' && typeof o.main==='string'){ var b=window.bkControlsBanner(); if(b) o.main=b+o.main; } return o; };
    Object.keys(prev).forEach(function(k){ g[k]=prev[k]; });
    RENDERERS[name]=g;
  });
})();
