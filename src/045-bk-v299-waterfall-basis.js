
/* V29.9.0 - selectable waterfall hurdle basis. Existing IRR branch is preserved verbatim;
   EM branch uses cumulative LP distributions / cumulative LP contributions to clear EM tiers.
   Pari-passu equity contribution and Tier-1 distribution shares remain unchanged. */
(function(){
  BK_BASE.hurdleBasis = BK_BASE.hurdleBasis===undefined ? 1 : BK_BASE.hurdleBasis; // 1=IRR, 2=EM
  BK_BASE.em1 = BK_BASE.em1===undefined ? 1.97 : BK_BASE.em1;
  BK_BASE.em2 = BK_BASE.em2===undefined ? 2.59 : BK_BASE.em2;
  BK_BASE.em3 = BK_BASE.em3===undefined ? 4.05 : BK_BASE.em3;

  function bkWfBasis(s){ return String(s.hurdleBasis)==='2' ? 'EM' : 'IRR'; }
  window.bkWfBasis=bkWfBasis;

  // Add the selector + EM hurdle inputs without replacing any existing JV inputs.
  const priorDeal=RENDERERS['Deal Underwrite'];
  if(priorDeal && !priorDeal.__bkV299){
    const wrapped=function(){
      const o=priorDeal();
      o.main += `<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Waterfall Hurdle Basis</caption><thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr></thead><tbody>
        ${bkSelect('Hurdle Basis','hurdleBasis',[['1','IRR'],['2','Equity Multiple']])}
        ${bkInput('Tier 1 Hurdle - Equity Multiple','em1','x')}
        ${bkInput('Tier 2 Hurdle - Equity Multiple','em2','x')}
        ${bkInput('Tier 3 Hurdle - Equity Multiple','em3','x')}
      </tbody></table></div>`;
      return o;
    };
    wrapped.__bkV299=true; RENDERERS['Deal Underwrite']=wrapped;
  }

  const bkWaterfallIRR=bkWaterfallV07;
  // ARCHITECTURE EXTENSION (investor model). This V29.9 wrapper - not the V07
  // definition - is what window.bkWaterfallV07 actually resolves to, because it
  // adds the equity-multiple hurdle branch. The optional stream argument has to
  // be threaded through HERE as well, or a per-investor slice silently falls back
  // to the whole deal. That is exactly what happened on the first attempt: the
  // conservation check came back with investor distributions of $26.6m against a
  // deal total of $20.2m, because every slice had run the full deal. Passing no
  // argument leaves both paths byte-identical.
  function bkWaterfallV299(opts){
    const x=(opts&&opts.x)?opts.x:bkMonthlyReturns(),s=(opts&&opts.s)?opts.s:x.s;
    if(bkWfBasis(s)==='IRR') return bkWaterfallIRR(opts); // exact pre-existing behavior

    const n=x.rows.length, gpShare=Number(s.gpShare||0), lpShare=1-gpShare;
    const em1=Math.max(0,Number(s.em1||0)), em2=Math.max(em1,Number(s.em2||0)), em3=Math.max(em2,Number(s.em3||0));
    let cumCon=0,cumDist=0,cumProm=0,cumLPDist=0;
    const rows=[];
    for(let i=0;i<n;i++){
      const con=(x.rows[i].wfContrib!=null?x.rows[i].wfContrib:Math.max(0,-x.rows[i].cf));
      const dist=(x.rows[i].wfDist!=null?x.rows[i].wfDist:Math.max(0,x.rows[i].cf));
      cumCon+=con;
      const lpCumCon=cumCon*lpShare;
      let rem=dist;

      // Tier 1: pari passu until LP cumulative distributions reach EM1 on cumulative LP contributions.
      const needLP1=Math.max(0,lpCumCon*em1-cumLPDist);
      const t1=lpShare>0?Math.min(rem,needLP1/lpShare):0; rem-=t1;
      let lpDist=t1*lpShare, gpDist=t1*gpShare;
      cumLPDist+=t1*lpShare;

      // Existing GP catch-up convention retained after Tier 1.
      const preCatchProfit=Math.max(0,(cumDist+t1)-cumCon);
      const target=Math.max(0,Math.min(.999999,Number(s.gpCatchupTarget||0)));
      const catchup=Number(s.gpCatchup)&&target<1 ? Math.min(rem,Math.max(0,(target*preCatchProfit-cumProm)/(1-target))) : 0;
      rem-=catchup; gpDist+=catchup;

      // Tier 2 / 3: allocate at the selected promote split until LP reaches each EM threshold.
      const t2LP=Number(s.t2LP||0), t3LP=Number(s.t3LP||0), t4LP=Number(s.t4LP||0);
      const needLP2=Math.max(0,lpCumCon*em2-cumLPDist);
      const t2=t2LP>0?Math.min(rem,needLP2/t2LP):0; rem-=t2; lpDist+=t2*t2LP; gpDist+=t2*(1-t2LP); cumLPDist+=t2*t2LP;
      const needLP3=Math.max(0,lpCumCon*em3-cumLPDist);
      const t3=t3LP>0?Math.min(rem,needLP3/t3LP):0; rem-=t3; lpDist+=t3*t3LP; gpDist+=t3*(1-t3LP); cumLPDist+=t3*t3LP;
      const t4=Math.max(0,rem); lpDist+=t4*t4LP; gpDist+=t4*(1-t4LP); cumLPDist+=t4*t4LP;

      const lpCon=-con*lpShare, gpCon=-con*gpShare;
      const promote=Math.max(0,gpDist-gpShare*(t1+catchup+t2+t3+t4));
      cumProm+=promote; cumDist+=t1+catchup+t2+t3+t4;
      rows.push({m:i+1,dt:x.rows[i].dt,con,dist,t1,catchup,t2,t3,t4,lpCon,gpCon,lpDist,gpDist,promote,lpCF:lpCon+lpDist,gpCF:gpCon+gpDist,b1:Math.max(0,lpCumCon*em1-cumLPDist),b2:Math.max(0,lpCumCon*em2-cumLPDist),b3:Math.max(0,lpCumCon*em3-cumLPDist)});
    }
    const dates=rows.map(r=>r.dt), lpVals=rows.map(r=>r.lpCF), gpVals=rows.map(r=>r.gpCF);
    const _eq0=Number(x.rows[0]&&x.rows[0].eqDraw)||0,_gs=Number(s.gpShare||0);
    const lpIRR=bkXirrClose(lpVals,dates,x.closeDt,-_eq0*(1-_gs)),gpIRR=bkXirrClose(gpVals,dates,x.closeDt,-_eq0*_gs);
    const lpDistTot=rows.reduce((z,r)=>z+r.lpDist,0), lpConTot=rows.reduce((z,r)=>z-r.lpCon,0);
    const gpDistTot=rows.reduce((z,r)=>z+r.gpDist,0), gpConTot=rows.reduce((z,r)=>z-r.gpCon,0);
    return {x,s,rows,lpIRR,gpIRR,lp:{dist:lpDistTot,contrib:lpConTot,moic:lpConTot?lpDistTot/lpConTot:0},gp:{dist:gpDistTot,contrib:gpConTot,moic:gpConTot?gpDistTot/gpConTot:0},promote:cumProm};
  }
  window.bkWaterfallV07=bkWaterfallV299;

  function sheetEquityWaterfallV299(){
    const w=bkWaterfallV07(),s=w.s,basis=bkWfBasis(s),m=n=>n<0?'('+bkFmt(-n)+')':bkFmt(n);
    const h1=basis==='IRR'?bkPct(Number(s.pref)):Number(s.em1).toFixed(2)+'x';
    const h2=basis==='IRR'?bkPct(Number(s.hurdle2)):Number(s.em2).toFixed(2)+'x';
    const h3=basis==='IRR'?bkPct(Number(s.hurdle3)):Number(s.em3).toFixed(2)+'x';
    const active=w.rows.filter(r=>r.dist>0||r.con>0).slice(-18);
    const rr=active.map(r=>`<tr><td>${r.m}</td><td>${m(r.con)}</td><td>${m(r.dist)}</td><td>${m(r.t1)}</td><td>${m(r.catchup)}</td><td>${m(r.t2)}</td><td>${m(r.t3)}</td><td>${m(r.t4)}</td><td>${m(r.promote)}</td></tr>`).join('');
    const main=`<div class="tbl-wrap"><table class="fin"><caption>Monthly Hurdle Waterfall - ${basis} Basis</caption><thead><tr><th class="rowlabel-h">Metric</th><th>LP</th><th>GP</th><th>Total / Target</th></tr></thead><tbody>
      <tr><td class="rowlabel">Hurdle Basis</td><td colspan="2">${basis==='IRR'?'IRR':'Equity Multiple'}</td><td>${basis}</td></tr>
      <tr><td class="rowlabel">Equity Share</td><td>${bkPct(1-Number(s.gpShare))}</td><td>${bkPct(Number(s.gpShare))}</td><td>100.0%</td></tr>
      <tr><td class="rowlabel">Tier 1 Hurdle</td><td colspan="2">Pari passu</td><td>${h1}</td></tr>
      <tr><td class="rowlabel">Tier 2 Hurdle / Split</td><td>${bkPct(Number(s.t2LP))}</td><td>${bkPct(1-Number(s.t2LP))}</td><td>${h2}</td></tr>
      <tr><td class="rowlabel">Tier 3 Hurdle / Split</td><td>${bkPct(Number(s.t3LP))}</td><td>${bkPct(1-Number(s.t3LP))}</td><td>${h3}</td></tr>
      <tr><td class="rowlabel">Tier 4 Residual Split</td><td>${bkPct(Number(s.t4LP))}</td><td>${bkPct(1-Number(s.t4LP))}</td><td>Above Tier 3</td></tr>
      <tr><td class="rowlabel">Contributions</td><td>${m(w.lp.contrib)}</td><td>${m(w.gp.contrib)}</td><td>${m(w.lp.contrib+w.gp.contrib)}</td></tr>
      <tr><td class="rowlabel">Distributions</td><td>${m(w.lp.dist)}</td><td>${m(w.gp.dist)}</td><td>${m(w.lp.dist+w.gp.dist)}</td></tr>
      <tr class="grandtotal"><td class="rowlabel">Partner XIRR</td><td>${isFinite(w.lpIRR)?bkPct(w.lpIRR):'-'}</td><td>${isFinite(w.gpIRR)?bkPct(w.gpIRR):'-'}</td><td>${basis} waterfall</td></tr>
      <tr class="grandtotal"><td class="rowlabel">Equity Multiple</td><td>${w.lp.moic.toFixed(3)}x</td><td>${w.gp.moic.toFixed(3)}x</td><td>${basis} waterfall</td></tr>
      <tr><td class="rowlabel">GP Promote</td><td>-</td><td>${m(w.promote)}</td><td>Excess over pro-rata</td></tr>
      </tbody></table></div>
      <div class="tbl-wrap" style="margin-top:16px;overflow:auto"><table class="fin"><caption>Waterfall Distribution Detail - Active Months</caption><thead><tr><th class="rowlabel-h">Month</th><th>Contribution</th><th>Available</th><th>Tier 1</th><th>Catch-Up</th><th>Tier 2</th><th>Tier 3</th><th>Tier 4</th><th>Promote</th></tr></thead><tbody>${rr}</tbody></table></div>
      <div class="note-flag"><span>&#10003;</span><div><b>Selectable hurdle basis -</b> IRR preserves the existing monthly hurdle-account engine exactly. Equity Multiple uses cumulative LP distributions divided by cumulative LP contributions to clear the 1 / 2 / 3 EM hurdles. Equity contributions remain pari passu in both modes.</div></div>`;
    const sidebar=sidebarShell(`<div class="card"><div class="card-head">Live Waterfall</div><div class="metric-list"><div class="metric-row"><span class="k">Hurdle Basis</span><span class="v">${basis}</span></div><div class="metric-row"><span class="k">Tier 1</span><span class="v">${h1}</span></div><div class="metric-row"><span class="k">Tier 2</span><span class="v">${h2}</span></div><div class="metric-row"><span class="k">Tier 3</span><span class="v">${h3}</span></div><div class="metric-row"><span class="k">GP Promote</span><span class="v">${m(w.promote)}</span></div></div></div>${colorKeyCard()}`);
    return{title:'Equity Waterfall',crumbs:'Returns & Equity',desc:'Live monthly waterfall with selectable IRR or Equity Multiple hurdles.',meta:{Property:s.name,'GP Equity':bkPct(Number(s.gpShare)),'Hurdle Basis':basis,Engine:'Monthly',Status:'Live'},main,sidebar};
  }
  RENDERERS['Equity Waterfall']=sheetEquityWaterfallV299;
})();
