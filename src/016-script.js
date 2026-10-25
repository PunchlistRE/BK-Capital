
/* Punchlist Capital V0.7 - monthly hurdle-account waterfall ported from CRE Master Waterfall (M) */
// ARCHITECTURE EXTENSION (investor model). The signature gains ONE optional argument
// and nothing else changes. Called with no argument - which is every pre-existing call
// site - x and s resolve exactly as before and the function is byte-identical.
//
// Called with {x, s} it runs the SAME tier arithmetic over an injected stream. That is
// what lets an individual investor's funded slice run through THE canonical waterfall on
// their own preferred return and promote, instead of a second waterfall written beside
// it. One engine, many scopes - the same pattern bkPortfolioMetricsFor() and bkSolve()
// already use. If this had been done by copying the tier loop, the two copies would
// drift the first time a hurdle convention changed.
function bkWaterfallV07(opts){
 const x=(opts&&opts.x)?opts.x:bkMonthlyReturns(),s=(opts&&opts.s)?opts.s:x.s,n=x.rows.length;
 const mr=a=>Math.pow(1+Number(a||0),1/12)-1;
 const r1=mr(s.pref),r2=mr(s.hurdle2),r3=mr(s.hurdle3);
 let b1=0,b2=0,b3=0,cumCon=0,cumDist=0,cumProm=0;
 const rows=[];
 /* CONVENTION cvHurdleBasis. 'lp': every hurdle account accrues on the LP's own contributions and is
    reduced only by what the LP actually receives, so a tier opens only once the LP has reached that
    IRR. 'deal' (legacy): accounts run on total equity and are reduced by total distributions. Tier
    rates, splits and the catch-up definition are the deal's own terms in both modes. */
 const lpMode=bkConventions(s).cvHurdleBasis==='lp', lpS=1-Number(s.gpShare||0);
 for(let i=0;i<n;i++){
   // SYS_CF rows 107-108: equity draw is always a contribution; only a shortfall in the
   // OTHER monthly components (NOI-after-debt-service, asset fee, sale) adds to it, and any
   // surplus in those is a distribution -- they are split, never netted then clamped.
   const con=(x.rows[i].wfContrib!=null?x.rows[i].wfContrib:Math.max(0,-x.rows[i].cf)), dist=(x.rows[i].wfDist!=null?x.rows[i].wfDist:Math.max(0,x.rows[i].cf));
   if(lpMode){
     const lc=con*lpS, gs=Number(s.gpShare||0);
     let a1=b1+lc+(b1+lc)*r1, a2=b2+lc+(b2+lc)*r2, a3=b3+lc+(b3+lc)*r3;
     // Tier 1: pari passu until the LP's preferred-return account is cleared
     const t1=lpS>0?Math.min(dist,a1/lpS):dist, lp1=t1*lpS;
     cumCon+=con; const preCatchProfit=Math.max(0,(cumDist+t1)-cumCon);
     const rem1=Math.max(0,dist-t1);
     const catchup=Number(s.gpCatchup)?Math.min(rem1,Math.max(0,(Number(s.gpCatchupTarget)*preCatchProfit-cumProm)/(1-Number(s.gpCatchupTarget)))):0;
     // Tier 2 / 3: the deal's own split until the LP's own account for that hurdle is cleared
     const need2=Math.max(0,a2-lp1), t2=Number(s.t2LP)>0?Math.min(Math.max(0,dist-t1-catchup),need2/Number(s.t2LP)):0, lp2=t2*Number(s.t2LP);
     const need3=Math.max(0,a3-lp1-lp2), t3=Number(s.t3LP)>0?Math.min(Math.max(0,dist-t1-catchup-t2),need3/Number(s.t3LP)):0, lp3=t3*Number(s.t3LP);
     const t4=Math.max(0,dist-t1-catchup-t2-t3), lp4=t4*Number(s.t4LP);
     const lpRecv=lp1+lp2+lp3+lp4;
     b1=Math.max(0,a1-lpRecv); b2=Math.max(0,a2-lpRecv); b3=Math.max(0,a3-lpRecv);
     const lpCon=-con*lpS, gpCon=-con*gs;
     const lpDist=lpRecv, gpDist=t1*gs+catchup+t2*(1-Number(s.t2LP))+t3*(1-Number(s.t3LP))+t4*(1-Number(s.t4LP));
     const promote=Math.max(0,gpDist-gs*(t1+catchup+t2+t3+t4));
     cumProm+=promote; cumDist+=t1+catchup+t2+t3+t4;
     rows.push({m:i+1,dt:x.rows[i].dt,con,dist,t1,catchup,t2,t3,t4,lpCon,gpCon,lpDist,gpDist,promote,lpCF:lpCon+lpDist,gpCF:gpCon+gpDist,b1,b2,b3});
     continue;
   }
   const beg1=b1, acc1=(beg1+con)*r1, req1=beg1+con+acc1, t1=Math.min(dist,req1); b1=req1-t1;
   cumCon+=con; const preCatchProfit=Math.max(0,(cumDist+t1)-cumCon);
   const rem1=Math.max(0,dist-t1);
   const catchup=Number(s.gpCatchup)?Math.min(rem1,Math.max(0,(Number(s.gpCatchupTarget)*preCatchProfit-cumProm)/(1-Number(s.gpCatchupTarget)))):0;
   const beg2=b2,acc2=(beg2+con)*r2,req2=beg2+con+acc2;
   const t2=Math.min(Math.max(0,dist-t1-catchup),Math.max(0,req2-t1-catchup)); b2=Math.max(0,req2-t1-catchup-t2);
   const beg3=b3,acc3=(beg3+con)*r3,req3=beg3+con+acc3;
   const t3=Math.min(Math.max(0,dist-t1-catchup-t2),Math.max(0,req3-t1-catchup-t2)); b3=Math.max(0,req3-t1-catchup-t2-t3);
   const t4=Math.max(0,dist-t1-catchup-t2-t3);
   const lpCon=-con*(1-Number(s.gpShare)), gpCon=-con*Number(s.gpShare);
   const lpDist=t1*(1-Number(s.gpShare))+t2*Number(s.t2LP)+t3*Number(s.t3LP)+t4*Number(s.t4LP);
   const gpDist=t1*Number(s.gpShare)+catchup+t2*(1-Number(s.t2LP))+t3*(1-Number(s.t3LP))+t4*(1-Number(s.t4LP));
   const promote=Math.max(0,gpDist-Number(s.gpShare)*(t1+catchup+t2+t3+t4));
   cumProm+=promote; cumDist+=t1+catchup+t2+t3+t4;
   rows.push({m:i+1,dt:x.rows[i].dt,con,dist,t1,catchup,t2,t3,t4,lpCon,gpCon,lpDist,gpDist,promote,lpCF:lpCon+lpDist,gpCF:gpCon+gpDist,b1,b2,b3});
 }
 const lpVals=rows.map(r=>r.lpCF),gpVals=rows.map(r=>r.gpCF),dates=rows.map(r=>r.dt);
 const _eq0=Number(x.rows[0]&&x.rows[0].eqDraw)||0,_gs=Number(s.gpShare||0);
 const lpIRR=bkXirrClose(lpVals,dates,x.closeDt,-_eq0*(1-_gs)),gpIRR=bkXirrClose(gpVals,dates,x.closeDt,-_eq0*_gs);
 // SYS_CF rows 149/... : LP/GP equity multiple sums Contributions and Distributions as SEPARATE
 // rows (133/134, 136/137), never netted per month then clamped -- same split as WF Contributions/
 // Distributions Available above. Netting lpCF=lpCon+lpDist first (as a plain metric(lpVals) would)
 // understates contributions whenever a tier distributes in the same month equity is drawn.
 const lpDistTot=rows.reduce((z,r)=>z+r.lpDist,0), lpConTot=rows.reduce((z,r)=>z-r.lpCon,0);
 const gpDistTot=rows.reduce((z,r)=>z+r.gpDist,0), gpConTot=rows.reduce((z,r)=>z-r.gpCon,0);
 const lp={dist:lpDistTot,contrib:lpConTot,moic:lpConTot?lpDistTot/lpConTot:0};
 const gp={dist:gpDistTot,contrib:gpConTot,moic:gpConTot?gpDistTot/gpConTot:0};
 return{x,s,rows,lpIRR,gpIRR,lp,gp,promote:cumProm};
}
function sheetEquityWaterfallV07(){const w=bkWaterfallV07(),s=w.s,m=n=>n<0?'('+bkFmt(-n)+')':bkFmt(n);const active=w.rows.filter(r=>r.dist>0||r.con>0).slice(-18);const rr=active.map(r=>`<tr><td>${r.m}</td><td>${m(r.con)}</td><td>${m(r.dist)}</td><td>${m(r.t1)}</td><td>${m(r.catchup)}</td><td>${m(r.t2)}</td><td>${m(r.t3)}</td><td>${m(r.t4)}</td><td>${m(r.promote)}</td></tr>`).join('');const main=`<div class="tbl-wrap"><table class="fin"><caption>Monthly Hurdle Waterfall - Live Engine</caption><thead><tr><th class="rowlabel-h">Metric</th><th>LP</th><th>GP</th><th>Total / Target</th></tr></thead><tbody><tr><td class="rowlabel">Equity Share</td><td>${bkPct(1-Number(s.gpShare))}</td><td>${bkPct(Number(s.gpShare))}</td><td>100.0%</td></tr><tr><td class="rowlabel">Contributions</td><td>${m(w.lp.contrib)}</td><td>${m(w.gp.contrib)}</td><td>${m(w.lp.contrib+w.gp.contrib)}</td></tr><tr><td class="rowlabel">Distributions</td><td>${m(w.lp.dist)}</td><td>${m(w.gp.dist)}</td><td>${m(w.lp.dist+w.gp.dist)}</td></tr><tr class="grandtotal"><td class="rowlabel">Partner XIRR</td><td>${isFinite(w.lpIRR)?bkPct(w.lpIRR):'-'}</td><td>${isFinite(w.gpIRR)?bkPct(w.gpIRR):'-'}</td><td>Excel baseline: 6.10%</td></tr><tr class="grandtotal"><td class="rowlabel">Equity Multiple</td><td>${w.lp.moic.toFixed(3)}x</td><td>${w.gp.moic.toFixed(3)}x</td><td>Excel baseline: 1.726x</td></tr><tr><td class="rowlabel">GP Promote</td><td>-</td><td>${m(w.promote)}</td><td>Excess over pro-rata</td></tr></tbody></table></div><div class="tbl-wrap" style="margin-top:16px;overflow:auto"><table class="fin"><caption>Waterfall Distribution Detail - Active Months</caption><thead><tr><th class="rowlabel-h">Month</th><th>Contribution</th><th>Available</th><th>Tier 1</th><th>Catch-Up</th><th>Tier 2</th><th>Tier 3</th><th>Tier 4</th><th>Promote</th></tr></thead><tbody>${rr}</tbody></table></div><div class="note-flag"><span>&#10003;</span><div><b>Waterfall engine -</b> monthly Tier 1 preferred return, GP catch-up, second and third IRR hurdles, residual split, LP/GP cash flows and promote are now calculated in-browser using the same hurdle-account sequence as the Excel Waterfall (M) engine. Claude's visual system is unchanged.</div></div>`;const sidebar=sidebarShell(`<div class="card"><div class="card-head">Live Waterfall</div><div class="metric-list"><div class="metric-row"><span class="k">Tier 1 Pref</span><span class="v">${bkPct(Number(s.pref))}</span></div><div class="metric-row"><span class="k">Tier 2 Hurdle</span><span class="v">${bkPct(Number(s.hurdle2))}</span></div><div class="metric-row"><span class="k">Tier 3 Hurdle</span><span class="v">${bkPct(Number(s.hurdle3))}</span></div><div class="metric-row"><span class="k">GP Promote</span><span class="v">${m(w.promote)}</span></div></div></div>${colorKeyCard()}`);return{title:'Equity Waterfall',crumbs:'Returns & Equity',desc:'Live monthly IRR-hurdle waterfall and partner economics.',meta:{Property:s.name,'GP Equity':bkPct(Number(s.gpShare)),Pref:bkPct(Number(s.pref)),Engine:'Monthly',Status:'Live'},main,sidebar};}
RENDERERS['Equity Waterfall']=sheetEquityWaterfallV07;
