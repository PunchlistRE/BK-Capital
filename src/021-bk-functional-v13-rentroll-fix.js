
// Punchlist Capital CRE App V13 - deal-isolation fix + rent-roll revenue basis.
// Two Excel tie-out defects fixed here:
//  1) bkCalc() was scaling GPR/vacancy/bad-debt/misc off the hardcoded ShorePointe demo
//     deal's constants (BK_BASE.gpr/badDebtPct/misc) instead of the loaded deal's own
//     fields, and commercial vacancy used the residential vacancy rate instead of the
//     deal's own "Commercial Vacancy / Credit Loss" input.
//  2) Commercial (and residential) revenue was always a flat area x $/SF rate. Excel
//     drives Commercial/Residential Base Rent off the unit-level Rent Roll tab (in-place
//     vs market rent, occupied vs vacant) whenever a deal's Revenue Basis = "RENT ROLL".
//     That case had no equivalent here at all. All new fields default in a way that keeps
//     every existing saved deal computing exactly as it did before this patch.
//
// App-wide RENDERERS fix (separate from the two defects above): RENDERERS is a plain
// object literal built once, early in the file, from the *then-current* values of
// sheetDealUnderwrite / sheetOperatingUnderwrite / sheetPropertyCF. Every later patch in
// this file that did `sheetDealUnderwrite = function(){...}` (the pattern almost all of
// the app's own version history used) only ever reassigned that free-standing variable --
// it never touched the RENDERERS object, so showSheet() (which calls RENDERERS[sheet]())
// kept calling the very first version of each of those three pages, no matter how many
// patches ran afterward. Concretely, before this fix: Deal Underwrite was stuck on its
// original two-table mockup (8 of the app's own patches -- Growth & Sale, Acquisition
// Debt, JV Structure, Sponsor Economics, Development, Construction, Permanent Debt --
// never rendered), and Operating Underwrite / Property CF were each stuck one patch
// behind their "live" V0.2/V0.3 versions. Re-pointing RENDERERS at the current value of
// each variable (which, by this point in file load, already reflects every patch that
// ran before this script block) makes all of that existing work actually visible, with
// no change to any calc logic. This runs before the V13 additions below so those layer
// on top of the fully-patched pages, not the stale ones.
RENDERERS['Deal Underwrite'] = sheetDealUnderwrite;
// Operating Underwrite's newly-visible V0.2 page ends in a hardcoded note quoting a
// specific "current Excel file" EGI/expenses/NOI baseline (from whatever demo deal was
// loaded when that patch was written) as fixed text -- accurate for no other deal,
// including Havard, and actively misleading once other deals are loaded, since it never
// changes. Swap it for the same claim computed live from the current deal, so it's either
// correct or, for a value that just doesn't tie, visibly says so instead of quoting a
// stale number.
const _opUwV13 = sheetOperatingUnderwrite;
RENDERERS['Operating Underwrite'] = function(){
  const o = _opUwV13(); const c = bkCalc();
  const money = n => '$'+Math.round(n).toLocaleString('en-US');
  o.main = o.main.replace(
    /<b>V0\.2 workbook tie-out baseline -<\/b>[\s\S]*?<\/div><\/div>/,
    `<b>Live -</b> this page recalculates from the loaded deal's own Deal Underwrite / Rent Roll inputs. Current Year-1 figures: EGI ${money(c.egi)}, total expenses ${money(c.total)}, NOI ${money(c.noi)}.</div></div>`
  );
  return o;
};
RENDERERS['Property CF'] = sheetPropertyCF;

// bkVal() display fix: a handful of the newly-visible input rows above (Development
// Budget Mode, Hard/Soft Construction Curve) are enum/text fields (values like
// 'PARAMETRIC' or 'S-Curve') but were wired through bkInput() without its 4th 'fmt'
// argument, so bkVal() took its default fmt='num' branch and rendered Number('S-Curve')
// -> NaN -> the literal text "NaN". bkVal already has a clean text fallback (bkEsc(v)) for
// any fmt outside 'money'/'pct'/'num' -- it just never got used because 'num' is the
// default. Patched so the 'num' branch only formats values that are actually numeric and
// falls through to the existing text fallback otherwise, with no change for any field
// that was already numeric.
const _bkValV13 = bkVal;
bkVal = function(key,fmt){
  const s=bkLoad(), v=s[key];
  if(fmt==='num' && v!==undefined && v!==null && v!=='' && isNaN(Number(v))) return bkEsc(v);
  return _bkValV13(key,fmt);
};

function bkEnsureV13(){
  const s=bkLoad(); let dirty=false;
  if(s.commercialVacancy===undefined){ s.commercialVacancy=Number(s.vacancy)||0; dirty=true; }
  if(s.miscPerGSF===undefined){ s.miscPerGSF = BK_BASE.gsf ? (BK_BASE.misc/BK_BASE.gsf) : 0.25; dirty=true; }
  if(s.revenueBasis===undefined){ s.revenueBasis='AVERAGE RENT'; dirty=true; }
  if(s.rentAppliedBasis===undefined){ s.rentAppliedBasis='In-Place'; dirty=true; }
  if(s.commercialRentGrowth===undefined){ s.commercialRentGrowth=0.025; dirty=true; }
  if(!Array.isArray(s.rentRoll)){ s.rentRoll=[]; dirty=true; }
  if(dirty) bkSave(s);
  return s;
}
// V28 fix (Proof Point 2, confirmed by BK): a commercial unit's expense recovery/reimbursement
// must not keep flowing through NOI once that SAME unit no longer has an active contractual
// rent -- a populated 'recovery' field alone is not sufficient. Before this fix, commRecoveries
// summed every commercial unit's recovery field unconditionally, so a unit whose inPlaceRent had
// been zeroed out (lease terminated) kept its full reimbursement in EGI/NOI with no gate or
// warning. Gate is: Occupied status AND inPlaceRent>0 ("active lease"), OR an explicit
// unit.recoveryOverride===true set by BK to model a reimbursement that legitimately continues
// independent of base rent (e.g. a holdover tenant paying CAM/insurance/taxes only). The override
// is opt-in and per-unit -- never inferred from a populated recovery field -- and is surfaced in
// the Rent Roll UI (Lease Dates & Per-Unit Override table), never applied silently.
window.bkRecoveryActive = function(u){
  return !!(u && ((u.status==='Occupied' && (Number(u.inPlaceRent)||0) > 0) || u.recoveryOverride===true));
};
function bkRentRollStats(rr){
  rr = Array.isArray(rr) ? rr : [];
  const num = v => Number(v)||0;
  const res = rr.filter(u=>u.tenantType==='Residential'), comm = rr.filter(u=>u.tenantType==='Commercial');
  const sum = (arr,k) => arr.reduce((a,u)=>a+num(u[k]),0);
  const occ = (arr,k) => sum(arr.filter(u=>u.status==='Occupied'),k);
  const vac = (arr,k) => sum(arr.filter(u=>u.status!=='Occupied'),k);
  const commRecoveryActive = comm.filter(bkRecoveryActive);
  const commRecoveryGated = comm.filter(u => !bkRecoveryActive(u) && num(u.recovery)>0);
  return {
    resSF: sum(res,'sf'), resUnits: res.length,
    resInPlace: occ(res,'inPlaceRent')+vac(res,'marketRent'),
    resMarket: sum(res,'marketRent'),
    commSF: sum(comm,'sf'), commSuites: comm.length,
    commInPlace: occ(comm,'inPlaceRent')+vac(comm,'marketRent'),
    commMarket: sum(comm,'marketRent'),
    commRecoveries: sum(commRecoveryActive,'recovery')*12,
    commRecoveriesGatedCount: commRecoveryGated.length,
    commRecoveriesGatedAnnual: sum(commRecoveryGated,'recovery')*12,
  };
}
window.bkRentRollStats = bkRentRollStats;
window.bkCalc = function(){
  const s = bkEnsureV13();
  // V2.6 fix: a populated Rent Roll is always the canonical revenue source -- it must not require a
  // SEPARATE, easy-to-forget "Revenue Basis" toggle to also be flipped to "RENT ROLL" or the engine
  // silently falls back to the (usually blank/zero) flat Average Rent inputs while still picking up
  // stray flat-rate fields like the fallback commercial recovery rate, producing an internally
  // inconsistent operating statement (real recoveries against zero commercial rent). The dropdown is
  // now purely a fallback for when no rent roll exists; a real rent roll always wins.
  const useRR = Array.isArray(s.rentRoll) && s.rentRoll.length>0;
  const applyMarket = (s.rentAppliedBasis==='Market');
  const rrs = useRR ? bkRentRollStats(s.rentRoll) : null;

  const gpr = useRR ? (applyMarket?rrs.resMarket:rrs.resInPlace)*12 : Number(s.avgRent)*Number(s.units)*12;
  const vacancy = -gpr*Number(s.vacancy);
  // CONVENTION cvBadDebtBasis: 'afterVacancy' charges bad debt on rent after vacancy, matching the
  // monthly cash flow; 'gross' and the legacy statement charge it on gross potential rent.
  const bad = bkConventions(s).cvBadDebtBasis==='afterVacancy' ? -(gpr+vacancy)*Number(s.badDebtPct) : -gpr*Number(s.badDebtPct);
  // FINAL WAVE - loss to lease and concessions. These are the workbook's own Operating
  // Underwrite revenue-build lines (C8 =-o_GPR*g_ltl, C9 =-o_GPR*g_concess): a percentage
  // of GROSS potential rent, on the same base the bad-debt line above already uses. Both
  // default to zero, so every existing figure in every existing deal is unchanged until a
  // user sets one - asserted by the Final regression baseline, not assumed.
  // The rent roll's own loss-to-lease statistic (market rent less in-place rent) is a
  // DIAGNOSTIC of the existing leases and is not this deduction; nothing is double counted.
  const ltl = -gpr*(Number(s.lossToLeasePct)||0);
  const concess = -gpr*(Number(s.concessionPct)||0);
  const netRes = gpr+vacancy+bad+ltl+concess;
  const other = Number(s.otherIncomePerUnit)*Number(s.units);

  const commercial = useRR ? (applyMarket?rrs.commMarket:rrs.commInPlace)*12 : Number(s.commercialArea)*Number(s.commercialRent);
  const recovery = useRR ? rrs.commRecoveries : Number(s.commercialArea)*Number(s.recovery);
  const commVacRate = Math.max(0,Math.min(1,Number(s.commercialVacancy)));
  const commercialVac = -(commercial+recovery)*commVacRate;
  const netComm = commercial+recovery+commercialVac;

  const egi = netRes+netComm+other;
  const mgmt = egi*Number(s.mgmtPct);
  const misc = Number(s.gsf)*Number(s.miscPerGSF);
  const total = Number(s.taxes)+Number(s.insurance)+Number(s.utilities)+Number(s.rm)+Number(s.contract)+Number(s.payroll)+Number(s.turnover)+Number(s.marketing)+Number(s.ga)+mgmt+misc;
  const noi = egi-total, after = noi-Number(s.reserves), value = Number(s.exitCap)?noi/Number(s.exitCap):0;
  return {gpr,vacancy,bad,ltl,concess,netRes,commercial,recovery,commercialVac,netComm,other,egi,mgmt,misc,total,noi,after,value,expenseRatio:egi?total/egi:0,noiMargin:egi?after/egi:0,goingIn:Number(s.purchasePrice)?Number(s.t12noi)/Number(s.purchasePrice):0};
};
window.bkAnnualCF = function(){
  const s=bkEnsureV13(), y1=bkCalc(), n=Math.max(1,Math.min(15,Math.round(Number(s.holdYears)||10))), arr=[];
  const fixedY1=Number(s.insurance)+Number(s.utilities)+Number(s.rm)+Number(s.contract)+Number(s.payroll)+Number(s.turnover)+Number(s.marketing)+Number(s.ga)+y1.misc;
  for(let y=1;y<=n;y++){
    const rg=Math.pow(1+Number(s.rentGrowth),y-1), og=Math.pow(1+Number(s.otherGrowth),y-1), eg=Math.pow(1+Number(s.opexGrowth),y-1), tg=Math.pow(1+Number(s.taxGrowth),y-1);
    const cg=Math.pow(1+Number(s.commercialRentGrowth),y-1);
    const res=(y1.netRes)*rg, comm=(y1.netComm)*cg, other=y1.other*og, egi=res+comm+other;
    const mgmt=egi*Number(s.mgmtPct);
    const expenses=Number(s.taxes)*tg+fixedY1*eg+mgmt;
    const noi=egi-expenses, after=noi-Number(s.reserves)*eg;
    arr.push({y,egi,expenses,noi,after});
  }
  const terminalNOI=arr[n-1].noi*(1+Number(s.rentGrowth));
  const grossSale=Number(s.exitCap)?terminalNOI/Number(s.exitCap):0, saleCost=grossSale*Number(s.saleCostPct), netSale=grossSale-saleCost;
  const initial=-(Number(s.purchasePrice)*(1+Number(s.closingCostsPct)));
  const cfs=[initial,...arr.map((a,i)=>a.after+(i===n-1?netSale:0))];
  const irr=bkIrr(cfs);
  const inflows=cfs.slice(1).reduce((a,b)=>a+b,0), moic=Math.abs(initial)?inflows/Math.abs(initial):0;
  return {s,arr,terminalNOI,grossSale,saleCost,netSale,initial,cfs,irr,moic};
};

window.bkSetField = function(key,val){ const s=bkLoad(); s[key]=val; bkSave(s); showSheet(currentSheet); };
window.bkRRSet = function(idx,key,el){
  const s=bkLoad(); const rr=Array.isArray(s.rentRoll)?s.rentRoll.slice():[];
  if(!rr[idx]) return;
  let v = (el && el.value!==undefined) ? el.value : (el?el.textContent:'');
  if(['sf','inPlaceRent','marketRent','recovery'].includes(key)) v = parseFloat(String(v).replace(/[$,]/g,''))||0;
  if(key==='recoveryOverride') v = (v===true || v==='true');
  rr[idx] = Object.assign({},rr[idx],{[key]:v});
  s.rentRoll = rr; bkSave(s); showSheet(currentSheet);
};
window.bkRRAdd = function(){
  const s=bkLoad(); const rr=Array.isArray(s.rentRoll)?s.rentRoll.slice():[];
  rr.push({unitId:'New Unit',sf:0,tenantType:'Commercial',status:'Occupied',inPlaceRent:0,marketRent:0,recovery:0});
  s.rentRoll=rr; bkSave(s); showSheet(currentSheet);
};
window.bkRRRemove = function(idx){
  const s=bkLoad(); const rr=Array.isArray(s.rentRoll)?s.rentRoll.slice():[];
  rr.splice(idx,1); s.rentRoll=rr; bkSave(s); showSheet(currentSheet);
};

// NOTE: RENDERERS['Deal Underwrite'] was captured as a value when RENDERERS was built
// (see const RENDERERS={...} above), so reassigning the *variable* sheetDealUnderwrite
// (as several earlier patches in this file already did) never reaches the live page --
// showSheet() calls RENDERERS[sheet](), not the current value of the sheetDealUnderwrite
// variable. Assigning RENDERERS['Deal Underwrite'] directly, as done here, is the only
// form of this patch that actually renders.
const _dealV13 = RENDERERS['Deal Underwrite'];
RENDERERS['Deal Underwrite'] = function(){
  const o=_dealV13(); const s=bkEnsureV13();
  o.main += `<div class="tbl-wrap" style="margin-top:16px;"><table class="fin"><caption>Revenue Basis &amp; Rent Roll Assumptions</caption><thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr></thead><tbody>
    <tr><td class="rowlabel">Revenue Basis</td><td class="v"><select onchange="bkSetField('revenueBasis',this.value)">
      <option value="AVERAGE RENT" ${s.revenueBasis==='AVERAGE RENT'?'selected':''}>Average Rent</option>
      <option value="RENT ROLL" ${s.revenueBasis==='RENT ROLL'?'selected':''}>Rent Roll</option>
    </select></td><td style="text-align:left"></td><td><span class="status-chip pass">OK</span></td></tr>
    <tr><td class="rowlabel">Rent Applied Under Rent Roll Basis</td><td class="v"><select onchange="bkSetField('rentAppliedBasis',this.value)">
      <option value="In-Place" ${s.rentAppliedBasis==='In-Place'?'selected':''}>In-Place</option>
      <option value="Market" ${s.rentAppliedBasis==='Market'?'selected':''}>Market</option>
    </select></td><td style="text-align:left"></td><td><span class="status-chip pass">OK</span></td></tr>
    ${bkInput('Commercial Vacancy / Credit Loss','commercialVacancy','%','pct')}
    ${bkInput('Miscellaneous Other Expenses','miscPerGSF','$/GSF/yr','num')}
    ${bkInput('Commercial Rent Growth','commercialRentGrowth','%/yr','pct')}
  </tbody></table></div>`;
  return o;
};

function sheetRentRollLive(){
  const s=bkEnsureV13(); const rr=s.rentRoll; const stats=bkRentRollStats(rr);
  const money=n=>'$'+Math.round(Number(n)||0).toLocaleString('en-US');
  const rows = rr.map((u,i)=>`<tr>
    <td class="input v" contenteditable="true" spellcheck="false" style="text-align:left" onblur="bkRRSet(${i},'unitId',this)">${bkEsc(u.unitId||'')}</td>
    <td class="input v" contenteditable="true" spellcheck="false" onblur="bkRRSet(${i},'sf',this)">${(Number(u.sf)||0).toLocaleString('en-US')}</td>
    <td><select onchange="bkRRSet(${i},'tenantType',this)">
      <option value="Commercial" ${u.tenantType==='Commercial'?'selected':''}>Commercial</option>
      <option value="Residential" ${u.tenantType==='Residential'?'selected':''}>Residential</option>
    </select></td>
    <td><select onchange="bkRRSet(${i},'status',this)">
      <option value="Occupied" ${u.status==='Occupied'?'selected':''}>Occupied</option>
      <option value="Vacant" ${u.status==='Vacant'?'selected':''}>Vacant</option>
    </select></td>
    <td class="input v" contenteditable="true" spellcheck="false" onblur="bkRRSet(${i},'inPlaceRent',this)">${(Number(u.inPlaceRent)||0).toLocaleString('en-US')}</td>
    <td class="input v" contenteditable="true" spellcheck="false" onblur="bkRRSet(${i},'marketRent',this)">${(Number(u.marketRent)||0).toLocaleString('en-US')}</td>
    <td class="input v" contenteditable="true" spellcheck="false" onblur="bkRRSet(${i},'recovery',this)">${(Number(u.recovery)||0).toLocaleString('en-US')}</td>
    <td><button type="button" class="status-chip" onclick="bkRRRemove(${i})">Remove</button></td>
  </tr>`).join('') || `<tr><td colspan="8" class="rowlabel">No rent roll rows yet - add one below, or leave empty and set Revenue Basis to "Average Rent" to use the flat Deal Underwrite rate instead.</td></tr>`;
  const main = `
    <div class="tbl-wrap"><table class="fin"><caption>Rent Roll Summary - live, computed from the rows below</caption><tbody>
      <tr><td class="rowlabel">Units / Suites in Rent Roll</td><td class="v">${rr.length}</td></tr>
      <tr><td class="rowlabel">Residential SF / Commercial SF</td><td class="v">${stats.resSF.toLocaleString('en-US')} / ${stats.commSF.toLocaleString('en-US')}</td></tr>
      <tr><td class="rowlabel">Residential In-Place / Market ($/mo)</td><td class="v">${money(stats.resInPlace)} / ${money(stats.resMarket)}</td></tr>
      <tr><td class="rowlabel">Commercial In-Place / Market ($/mo)</td><td class="v">${money(stats.commInPlace)} / ${money(stats.commMarket)}</td></tr>
      <tr><td class="rowlabel">Commercial Expense Recoveries (annual)</td><td class="v">${money(stats.commRecoveries)}</td></tr>
      ${stats.commRecoveriesGatedCount>0 ? `<tr><td class="rowlabel">- of which GATED (no active lease, excluded above)</td><td class="v"><span class="status-chip warn">${stats.commRecoveriesGatedCount} unit${stats.commRecoveriesGatedCount>1?'s':''}, ${money(stats.commRecoveriesGatedAnnual)}/yr excluded</span></td></tr>` : ''}
      <tr class="subtotal"><td class="rowlabel">Revenue Basis In Use</td><td class="v" style="text-align:left">${bkEsc(s.revenueBasis)} (${bkEsc(s.rentAppliedBasis)})</td></tr>
    </tbody></table></div>
    <div class="tbl-wrap" style="margin-top:16px;">
      <table class="fin">
        <caption>Rent Roll Detail - live, feeds the calc engine when Revenue Basis = "Rent Roll"</caption>
        <thead><tr><th class="rowlabel-h">Unit / Tenant</th><th>SF</th><th>Type</th><th>Status</th><th>In-Place $/mo</th><th>Market $/mo</th><th>Recovery $/mo</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="bk-addrow"><button type="button" class="status-chip pass" onclick="bkRRAdd()">+ Add Unit</button></div>
    </div>
    <div class="note-flag"><span>&#10003;</span><div><b>Live rent roll -</b> this table now drives Commercial (and Residential) Base Rent and Expense Recoveries whenever Revenue Basis on Deal Underwrite is set to "Rent Roll". With Revenue Basis = "Average Rent" this data is display-only and the flat Deal Underwrite $/SF rate is used instead, exactly as before this patch.</div></div>
    <div class="note-flag"><span>&#10003;</span><div><b>Fix -</b> a unit's Expense Recovery only counts toward Commercial Expense Recoveries when that same unit has an active lease (Occupied status + in-place rent &gt; 0). A recovery figure left on a unit whose rent has been zeroed out (e.g. a terminated lease) is now excluded automatically and called out above, rather than silently continuing to flow into NOI. Set "Recovery Override" to Yes on the Lease Dates &amp; Per-Unit Override table below to explicitly keep a unit's recovery active independent of its rent state (e.g. a legitimate holdover CAM-only obligation) - this is opt-in per unit, never automatic.</div></div>`;
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">Key Metrics</div><div class="metric-list">
    <div class="metric-row"><span class="k">Units in Roll</span><span class="v">${rr.length}</span></div>
    <div class="metric-row"><span class="k">Total SF</span><span class="v">${(stats.resSF+stats.commSF).toLocaleString('en-US')}</span></div>
    <div class="metric-row"><span class="k">Revenue Basis</span><span class="v">${bkEsc(s.revenueBasis)}</span></div>
  </div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Inputs</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>`)}${colorKeyCard()}`);
  return {title:'Rent Roll', crumbs:'Inputs', desc:'Unit-level rent roll - live and editable, drives Commercial/Residential Base Rent when Revenue Basis = "Rent Roll".', meta:{Property:s.name,'Asset Class':s.propertyType,Location:s.location,Units:rr.length+' rows',SF:(stats.resSF+stats.commSF).toLocaleString('en-US'),Currency:'USD'}, main, sidebar};
}
RENDERERS['Rent Roll'] = sheetRentRollLive;

bkEnsureV13();
showSheet(currentSheet||'Deal Underwrite');
