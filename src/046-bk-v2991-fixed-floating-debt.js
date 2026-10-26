
// V29.9.1 - selectable Fixed / Floating acquisition debt.
// Fixed is the exact legacy path. Floating uses an explicit index assumption + spread,
// subject to floor/cap. No live market rate is hard-coded, so saved deals remain reproducible.
(function(){
  Object.assign(BK_BASE,{debtRateType:'Fixed',debtIndexName:'SOFR',debtIndexRate:0.05,debtSpread:0.025,debtFloor:0,debtCap:0});
  const _ensure=bkEnsureV04;
  window.bkEnsureV04=function(){
    const s=_ensure(); let dirty=false;
    const defs={debtRateType:'Fixed',debtIndexName:'SOFR',debtIndexRate:0.05,debtSpread:0.025,debtFloor:0,debtCap:0};
    Object.keys(defs).forEach(k=>{if(s[k]===undefined){s[k]=defs[k];dirty=true;}});
    if(dirty) bkSave(s); return s;
  };
  function rateType(s){return String(s.debtRateType||'Fixed').toLowerCase()==='floating'?'Floating':'Fixed'}
  window.bkDebtCoupon=function(s){
    s=s||bkEnsureV04();
    if(rateType(s)==='Fixed') return Math.max(0,Number(s.acqRate)||0);
    let r=Math.max(0,(Number(s.debtIndexRate)||0)+(Number(s.debtSpread)||0));
    const floor=Math.max(0,Number(s.debtFloor)||0), cap=Math.max(0,Number(s.debtCap)||0);
    r=Math.max(r,floor); if(cap>0) r=Math.min(r,cap); return r;
  };
  /* V29.11.1 CLEANUP: this layer's window.bkDebt reimplementation was REMOVED.
     It was completely superseded by bk-v2992-floating-rate-curve, which redefines
     bkDebt, bkDebtCoupon, bkEnsureV04 and bkDebtRateForMonth a few blocks later.
     The two call sites in this block (sheetDebt / sheetDebtSchedule) resolve bkDebt
     at CALL time, so they now reach the v2992 implementation - verified: there were
     no module-scope bkDebt() calls between this point and v2992.
     The REST of this layer is live and must stay: it supplies the bkEnsureV04
     floating-debt field defaults and defines sheetDebt / sheetDebtSchedule. */

  const _du=sheetDealUnderwrite;
  window.sheetDealUnderwrite=function(){
    const o=_du(),s=bkEnsureV04(),floating=rateType(s)==='Floating';
    o.main=o.main.replace('Acq Loan - Rate','Acq Loan - Fixed Rate');
    const rows=`${bkSelect('Acq Loan - Rate Type','debtRateType',[['Fixed','Fixed'],['Floating','Floating']],'-')}
      ${floating?bkSelect('Floating Index','debtIndexName',[['SOFR','SOFR'],['Prime','Prime'],['Other','Other']],'-'):''}
      ${floating?bkInput('Index Rate Assumption','debtIndexRate','%','pct'):''}
      ${floating?bkInput('Credit Spread','debtSpread','bps','pct'):''}
      ${floating?bkInput('Coupon Floor','debtFloor','%','pct'):''}
      ${floating?bkInput('Coupon Cap (0 = none)','debtCap','%','pct'):''}`;
    o.main=o.main.replace('<tbody><tr class="input" data-bk-key="acqLTV"',`<tbody>${rows}<tr class="input" data-bk-key="acqLTV"`);
    o.desc='All deal inputs - including selectable fixed or floating acquisition financing.'; return o;
  };

  window.sheetDebt=function(){const d=bkDebt(),money=n=>n<0?'('+bkFmt(-n)+')':bkFmt(n),s=d.s;
    const floating=d.rateType==='Floating';
    const rateDetail=floating?`${bkEsc(s.debtIndexName||'Index')} ${bkPct(Number(s.debtIndexRate)||0)} + ${Math.round((Number(s.debtSpread)||0)*10000)} bps${Number(s.debtFloor)>0?' | floor '+bkPct(Number(s.debtFloor)):''}${Number(s.debtCap)>0?' | cap '+bkPct(Number(s.debtCap)):''}`:`Fixed ${bkPct(d.coupon)}`;
    const main=`<div class="tbl-wrap"><table class="fin"><caption>Acquisition Loan - Constraint Sizing</caption><thead><tr><th class="rowlabel-h">Sizing Constraint</th><th>Amount ($)</th><th>Result</th></tr></thead><tbody><tr><td class="rowlabel">Max LTV × Stabilized Value</td><td>${money(d.byLTV)}</td><td>${d.binding==='LTV'?'<span class="status-chip warn">BINDING</span>':'-'}</td></tr><tr><td class="rowlabel">Max LTC × Acquisition Basis</td><td>${money(d.byLTC)}</td><td>${d.binding==='LTC'?'<span class="status-chip warn">BINDING</span>':'-'}</td></tr><tr><td class="rowlabel">Min DSCR Constraint</td><td>${money(d.byDSCR)}</td><td>${d.binding==='DSCR'?'<span class="status-chip warn">BINDING</span>':'-'}</td></tr><tr class="grandtotal"><td class="rowlabel">ACQUISITION LOAN AMOUNT</td><td>${money(d.loan)}</td><td><span class="status-chip pass">LIVE</span></td></tr><tr><td class="rowlabel">Rate Type</td><td>${d.rateType}</td><td>${rateDetail}</td></tr><tr><td class="rowlabel">Effective Coupon</td><td>${bkPct(d.coupon)}</td><td>${floating?'Index + spread, bounded by floor/cap':'Fixed coupon'}</td></tr><tr><td class="rowlabel">Origination Fee</td><td>${money(d.fee)}</td><td>${bkPct(Number(s.acqOrigFee))}</td></tr><tr><td class="rowlabel">Monthly Payment</td><td>${money(d.pmt)}</td><td>${Number(s.acqIO)>0?'IO then amortizing':'Amortizing'}</td></tr><tr><td class="rowlabel">Going-In DSCR</td><td>${d.dscr.toFixed(2)}x</td><td>Y1 NOI / Annual DS</td></tr><tr><td class="rowlabel">Actual LTV / LTC</td><td>${bkPct(d.ltv)} / ${bkPct(d.ltc)}</td><td>LTV / LTC</td></tr></tbody></table></div><div class="note-flag"><span>&#10003;</span><div><b>Selectable debt rate structure -</b> Fixed preserves the legacy acquisition debt calculation. Floating uses the saved index-rate assumption plus spread, subject to the entered floor and cap. The index is an explicit deal assumption rather than a live market feed, so saved underwriting remains reproducible.</div></div>`;
    const sidebar=sidebarShell(`<div class="card"><div class="card-head">Debt Summary</div><div class="metric-list"><div class="metric-row"><span class="k">Rate Type</span><span class="v">${d.rateType}</span></div><div class="metric-row"><span class="k">Effective Coupon</span><span class="v">${bkPct(d.coupon)}</span></div><div class="metric-row"><span class="k">Loan Amount</span><span class="v pos">$${bkFmt(d.loan)}</span></div><div class="metric-row"><span class="k">Binding Constraint</span><span class="v">${d.binding}</span></div><div class="metric-row"><span class="k">Equity Requirement</span><span class="v">$${bkFmt(d.equity)}</span></div><div class="metric-row"><span class="k">Debt at Sale</span><span class="v">$${bkFmt(d.debtAtSale)}</span></div></div></div>${colorKeyCard()}`);
    return{title:'Debt',crumbs:'Debt',desc:'Live acquisition debt sizing with fixed or floating rate structure.',meta:{Property:s.name,'Debt Type':d.rateType+' Acquisition Loan','Binding':d.binding,'Rate':bkPct(d.coupon),Amortization:s.acqAmort+' years',Status:'Live'},main,sidebar};};

  window.sheetDebtSchedule=function(){const d=bkDebt(),shown=d.annual.slice(0,10),money=n=>n<0?'('+bkFmt(-n)+')':bkFmt(n),heads=shown.map(a=>`<th>Year ${a.y}</th>`).join(''),cells=k=>shown.map(a=>`<td>${money(a[k])}</td>`).join('');
    const main=`<div class="tbl-wrap"><table class="fin"><caption>Acquisition Debt Schedule - Annual Summary</caption><thead><tr><th class="rowlabel-h">Line Item</th>${heads}</tr></thead><tbody><tr><td class="rowlabel">Beginning Balance</td>${shown.map((a,i)=>`<td>${money(i?shown[i-1].ending:d.loan)}</td>`).join('')}</tr><tr><td class="rowlabel">Effective Coupon</td>${shown.map(()=>`<td>${bkPct(d.coupon)}</td>`).join('')}</tr><tr><td class="rowlabel">Debt Service</td>${cells('payment')}</tr><tr><td class="rowlabel">Interest Expense</td>${cells('interest')}</tr><tr><td class="rowlabel">Principal Amortization</td>${cells('principal')}</tr><tr class="grandtotal"><td class="rowlabel">Ending Balance</td>${cells('ending')}</tr></tbody></table></div>`;
    const sidebar=sidebarShell(`<div class="card"><div class="card-head">Schedule Metrics</div><div class="metric-list"><div class="metric-row"><span class="k">Rate Type</span><span class="v">${d.rateType}</span></div><div class="metric-row"><span class="k">Effective Coupon</span><span class="v">${bkPct(d.coupon)}</span></div><div class="metric-row"><span class="k">Initial Balance</span><span class="v">$${bkFmt(d.loan)}</span></div><div class="metric-row"><span class="k">Monthly Payment</span><span class="v">$${bkFmt(d.pmt)}</span></div><div class="metric-row"><span class="k">Debt at Sale</span><span class="v">$${bkFmt(d.debtAtSale)}</span></div></div></div>${colorKeyCard()}`);
    return{title:'Debt Schedule',crumbs:'Debt',desc:'Live amortization schedule using the selected fixed or floating coupon.',meta:{Property:d.s.name,'Rate Type':d.rateType,Rate:bkPct(d.coupon),Amortization:d.s.acqAmort+' years',Hold:d.s.holdYears+' years',Currency:'USD',Status:'Live'},main,sidebar};};

  RENDERERS['Deal Underwrite']=sheetDealUnderwrite; RENDERERS['Debt']=sheetDebt; RENDERERS['Debt Schedule']=sheetDebtSchedule;
})();
