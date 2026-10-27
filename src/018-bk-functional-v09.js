
/* Punchlist Capital V0.9 - Development module shell ported from CRE Master V7.2 logic. Claude visual master unchanged. */
/* ---------------------------------------------------------------------------
   RC3 ITEM 4 - ORPHANED / NON-OPERATIVE ASSUMPTION REGISTER
   ---------------------------------------------------------------------------
   REMOVED here: hardCostPSF, softCostPSF, retailSF (and avgUnitSize, at the
   BK_BASE declaration). Each was declared once and read by nothing: no
   calculation, no renderer, no BK_BASE.<field> reference. retailSF was the
   worst of them - bkDevSoftCosts declares its OWN local `retailSF`
   (const retailSF = Number(s.commercialArea||0) || gsf), so the Commercial TI
   line already ignored the assumption that appeared to drive it.
   hardCostPSF / softCostPSF were never editable and never multiplied by gsf.

   KEPT, deliberately, and NOT orphans:
     sourceConstruction   read at bkDevV09 but ONLY when devBudgetMode==='SOURCE'
     residualLandValue    read at bkDevV09 but ONLY when landOverrideOn is truthy
     BK_BASE.gpr          read by the legacy bkCalc rent derivation
     BK_BASE.misc         read by the legacy bkCalc AND by the live miscPerGSF
                          default seeding - removing it yields NaN
     _provenance          storage-lifecycle stamp, not an economic assumption

   NON-OPERATIVE but retained (rendered as editable inputs that no calculation
   reads - occupancy, parking, siteArea). They are classified, not deleted:
   deleting a visible input is a UI change, and RC3 adds no features.

   Method, and why the earlier answer was wrong: a "+777" sensitivity probe had
   called debtIndexY3 inert, which direct mutation disproved. The replacement is
   two independent, self-validating probes - a Proxy read-set with call-site
   attribution (orphan_classify.js) and a perturbation differential over a
   mechanically-derived gate matrix (orphan_perturb2.js). Both carry positive
   controls that must move and a ghost field that must not. Gate coverage is the
   part that matters: without it, residualLandValue and sourceConstruction both
   looked like orphans.
   --------------------------------------------------------------------------- */
Object.assign(BK_BASE,{devBudgetMode:'PARAMETRIC',predevMonths:0,constructionMonths:0,leaseupMonths:0,sourceConstruction:0,predevCarry:0,closingPct:.05,devFeePct:0,cmFeePct:0,gsf:30482,units:38,hardContPct:0,softContPct:0,landOverrideOn:0,residualLandValue:5288518.801970812,preleasedPct:0});
function bkDevLeaseupRamp(s,co,stab,luMo){
 // Faithful port of Excel Development!C78: lease-up operating deficit = MAX(0, -SUM(monthly NOI, CO..Stab-1)).
 // Excel derives monthly occupancy from a constant absorption rate (in_absorb_mo); this app exposes the
 // equivalent lease-up DURATION directly (leaseupMonths) plus a pre-leased starting occupancy (preleasedPct),
 // which together imply the same linear (straight-line) absorption rate: occ(mo)=preleased+(1-preleased)*j/luMo.
 // Fixed operating costs (taxes, insurance, payroll, R&M, turnover, utilities, contract, marketing, G&A, misc,
 // reserves) run at full rate through lease-up; revenue (and the management fee, which scales with EGI) ramps
 // with occupancy -- this is what produces the negative-NOI "burn" during lease-up that C78 captures.
 if(luMo<=0) return{months:[],leaseDef:0};
 const c=bkCalc();
 const preleased=Math.max(0,Math.min(1,Number(s.preleasedPct||0)));
 const fixedExpAnnual=c.total-c.mgmt, mgmtPct=Number(s.mgmtPct||0), reservesAnnual=Number(s.reserves||0);
 const months=[];
 for(let j=0;j<luMo;j++){
   const mo=co+j;
   const occ=Math.min(1,preleased+(1-preleased)*j/luMo);
   const egi=c.egi*occ/12, mgmt=egi*mgmtPct, noi=egi-fixedExpAnnual/12-mgmt, after=noi-reservesAnnual/12;
   months.push({mo,occ,egi,noi,after});
 }
 const leaseDef=Math.max(0,-months.reduce((a,m)=>a+m.after,0));
 return{months,leaseDef};
}
// V26 Excel parity #2: the workbook's actual Development sheet cost ladder is 14 individually-rated
// hard-cost trade lines (rows 25-38) cascaded through 4 markup layers (General Conditions -> Contractor
// Fee -> Risk/Payment Bonds -> Hard Cost Contingency, each applied to the running subtotal, row 40-43),
// plus 16 individually-rated soft-cost lines (rows 48-63, each on its OWN basis: GSF for 11 of them,
// hard-cost basis for Architecture & Engineering and the Construction Management Fee, retail-SF basis
// for Commercial TI & Leasing Commissions, per-unit basis for FF&E, and purchase-price basis for
// Title/Escrow), cascaded through Development Fee then Soft Cost Contingency (rows 64-67).
// IMPORTANT / FLAGGED FINDING: neither the CRE Master workbook nor the Yardi portfolio benchmark
// (the only two source files with real deal data) contains a populated DEVELOPMENT deal -- Havard is
// an acquisition and the Yardi file covers only acquired/operating properties. So the exact per-trade
// $/GSF and per-line reference RATES for a real development deal do not exist in any source available
// this session. Every hc_*/sc_* rate below therefore defaults to 0, exactly matching Excel's own blank
// state for an unpopulated deal -- this is the real formula structure, wired and ready, but it needs
// real trade-level cost assumptions (from the user, a GC estimate, or another benchmark) before a
// development deal's cost ladder produces a non-zero total. "Big Red" throughout this session has been
// a synthetic test fixture (not a real workbook deal) and its test-only placeholder rates live in the
// verification scripts, never in the app's own defaults.
Object.assign(BK_BASE,{
  // Hard cost -- 14 trade lines, all $/GSF (Development!F25:F38)
  hc_demo:0, hc_sitework:0, hc_excavation:0, hc_parking:0, hc_podium:0, hc_envelope:0, hc_roofing:0,
  hc_mep:0, hc_elevators:0, hc_partitions:0, hc_unitint:0, hc_amenity:0, hc_commshell:0, hc_landscape:0,
  // Hard cost -- 4 cascading markups (Development!F40:F43); hardContPct already existed pre-V26.
  hardGCPct:0, hardContractorFeePct:0, hardRiskBondsPct:0,
  // Soft cost -- 16 line items, each on its Excel basis (Development!F48:F63)
  sc_ae:0,        // Architecture & Engineering -- basis: TOTAL HARD COST (row48)
  sc_civil:0, sc_environmental:0, sc_entitlement:0, sc_permits:0, sc_legal:0, sc_retaxconst:0,
  sc_ocip:0, sc_marketing:0, sc_testing:0, sc_sustainability:0, sc_technology:0, // 11 lines, basis: GSF (49-59)
  sc_ti:0,        // Commercial TI & Leasing Commissions -- basis: retail/commercial SF (row60)
  sc_ffe:0,       // FF&E and Amenity Furnishings -- basis: units (row61)
  sc_title:0,     // Title, Escrow, Transfer & Recording -- basis: purchase price (row62)
  scnHardPct:0, scnSoftPct:0, // Excel's scn_hard/scn_soft scenario overlay -- 0 in the base case
});
// Cascading hard-cost markup stack (Development!F39-F44): GC -> Contractor Fee -> Risk/Bonds -> Contingency,
// each applied to the running subtotal so far. Algebraically this collapses to tradeSubtotal*(1+g)*(1+f)*(1+b)*(1+c),
// but is kept as an explicit cascade here to mirror the workbook's own row-by-row structure exactly.
function bkDevHardCostLadder(s,gsf,kScale){
  const rate=(k)=>Number(s[k]||0);
  const scn=1+Number(s.scnHardPct||0);
  const trades={
    'Demolition, Abatement & Site Clearing':rate('hc_demo'),'Site Work, Utilities & Off-Sites':rate('hc_sitework'),
    'Excavation, Shoring & Foundations':rate('hc_excavation'),'Structured Parking - Below Grade':rate('hc_parking'),
    'Concrete Podium & Superstructure':rate('hc_podium'),'Exterior Envelope, Glazing & Balconies':rate('hc_envelope'),
    'Roofing, Waterproofing & Membrane':rate('hc_roofing'),'MEP & Fire Protection':rate('hc_mep'),
    'Elevators & Conveying':rate('hc_elevators'),'Interior Partitions & Common Finishes':rate('hc_partitions'),
    'Unit Interiors - Cabinets, Appliances, Fixtures':rate('hc_unitint'),'Amenity & Common Area Fit-Out':rate('hc_amenity'),
    'Commercial Shell / Fit-Out':rate('hc_commshell'),'Landscape, Hardscape & Streetscape':rate('hc_landscape'),
  };
  const lines=Object.entries(trades).map(([name,r])=>({name,rate:r,total:gsf*r*scn*kScale}));
  const tradeSubtotal=lines.reduce((a,l)=>a+l.total,0);
  const gc=tradeSubtotal*Number(s.hardGCPct||0);
  const contractorFee=(tradeSubtotal+gc)*Number(s.hardContractorFeePct||0);
  const riskBonds=(tradeSubtotal+gc+contractorFee)*Number(s.hardRiskBondsPct||0);
  const contingency=(tradeSubtotal+gc+contractorFee+riskBonds)*Number(s.hardContPct||0);
  const total=tradeSubtotal+gc+contractorFee+riskBonds+contingency;
  return{lines,tradeSubtotal,gc,contractorFee,riskBonds,contingency,total};
}
// Soft-cost ladder (Development!F48-F67): 16 individually-based line items -> Dev Fee -> Contingency.
function bkDevSoftCostLadder(s,gsf,hardTotal,price,kScale){
  const rate=(k)=>Number(s[k]||0), scn=1+Number(s.scnSoftPct||0);
  const retailSF=Number(s.commercialArea||0)||gsf, units=Number(s.units||0);
  const gsfLines={
    'Civil, Landscape & Specialty Consultants':rate('sc_civil'),'Environmental, Geotech & Survey':rate('sc_environmental'),
    'Entitlement, Zoning & Community':rate('sc_entitlement'),'Permits, Impact, Utility & Housing Fees':rate('sc_permits'),
    'Legal, Accounting & Organizational':rate('sc_legal'),'Real Estate Taxes During Construction':rate('sc_retaxconst'),
    'Owner-Controlled Insurance Program':rate('sc_ocip'),'Marketing, Branding & Leasing Center':rate('sc_marketing'),
    'Testing, Inspection & Commissioning':rate('sc_testing'),'Sustainability, LEED & Energy Modeling':rate('sc_sustainability'),
    'Technology, Security & Low Voltage':rate('sc_technology'),
  };
  const lines=[{name:'Architecture & Engineering',basis:'Hard Cost',rate:rate('sc_ae'),total:hardTotal*rate('sc_ae')}];
  Object.entries(gsfLines).forEach(([name,r])=>lines.push({name,basis:'GSF',rate:r,total:gsf*r*scn*kScale}));
  lines.push({name:'Commercial TI & Leasing Commissions',basis:'Retail SF',rate:rate('sc_ti'),total:retailSF*rate('sc_ti')*scn*kScale});
  lines.push({name:'FF&E and Amenity Furnishings',basis:'Units',rate:rate('sc_ffe'),total:units*rate('sc_ffe')*scn*kScale});
  lines.push({name:'Title, Escrow, Transfer & Recording',basis:'Price',rate:rate('sc_title'),total:price*rate('sc_title')});
  lines.push({name:'Construction Management Fee to Sponsor',basis:'Hard Cost',rate:Number(s.cmFeePct||0),total:hardTotal*Number(s.cmFeePct||0)});
  const softSubtotal=lines.reduce((a,l)=>a+l.total,0);
  // Excel order (F64-F67): subtotal -> + Development Fee (on hard + subtotal) -> + Soft Cost Contingency
  // (on subtotal + dev fee) -> TOTAL. Contingency wraps the dev fee, not the other way around.
  const devFee=Number(s.devFeePct||0)*(hardTotal+softSubtotal);
  const contingency=(softSubtotal+devFee)*Number(s.softContPct||0);
  const total=softSubtotal+devFee+contingency;
  return{lines,softSubtotal,devFee,contingency,total};
}
function bkDevV09(){
 const s=bkEnsureV06(), isDev=String(s.dealType||'').toLowerCase().includes('develop');
 const land=Number(s.landOverrideOn)?Number(s.residualLandValue||0):Number(s.purchasePrice||0);
 const gsf=Number(s.gsf||0), close=land*Number(s.closingPct||0), acq=land*bkAcqFeePct(s), pre=isDev?Number(s.predevCarry||0):0;
 const preMo=isDev?Math.max(0,Math.round(Number(s.predevMonths||0))):0, conMo=isDev?Math.max(0,Math.round(Number(s.constructionMonths||0))):0, luMo=isDev?((typeof bkDevUnitOn==='function'&&bkDevUnitOn(s))?bkDevUnitLeaseupMonths(s):Math.max(0,Math.round(Number(s.leaseupMonths||0)))):0;
 const co=preMo+conMo, stab=Math.max(isDev?co+luMo:1,1), hold=Math.max(1,Math.round(Number(s.holdYears||5)*12));
 let hard=0,soft=0,hardLadder=null,softLadder=null,k=1;
 // Total cost (hard+soft) is an affine function of the calibration factor k (Development!C70-C75): the
 // A&E line, CM fee, dev fee and both contingency layers are all proportional derivatives of the k-scaled
 // hard/GSF/retail/unit-based lines plus the one line (Title/Escrow) that never scales with k. So evaluating
 // the ladder at k=0 and k=1 and solving linearly reproduces Excel's closed-form SOURCE-mode calibration
 // exactly, without needing iteration.
 function costAtK(kk){
   const h=bkDevHardCostLadder(s,gsf,kk);
   const sf=bkDevSoftCostLadder(s,gsf,h.total,land,kk);
   return {hard:h,soft:sf,total:h.total+sf.total};
 }
 if(isDev){
   if(String(s.devBudgetMode).toUpperCase()==='SOURCE' && Number(s.sourceConstruction)>0){
     const c0=costAtK(0), c1=costAtK(1), target=Number(s.sourceConstruction);
     k=(c1.total-c0.total)!==0 ? (target-c0.total)/(c1.total-c0.total) : 1;
     const c=costAtK(k); hard=c.hard.total; soft=c.soft.total; hardLadder=c.hard; softLadder=c.soft;
   } else {
     const c=costAtK(1); hard=c.hard.total; soft=c.soft.total; hardLadder=c.hard; softLadder=c.soft; k=1;
   }
 }
 const ramp=isDev?bkDevLeaseupRamp(s,co,stab,luMo):{months:[],leaseDef:0};
 const leaseDef=ramp.leaseDef, unlev=land+close+acq+pre+hard+soft+leaseDef;
 const phases=[['Pre-Development',preMo?1:'-',preMo||'-',preMo],['Construction',conMo?preMo+1:'-',conMo?co:'-',conMo],['Certificate of Occupancy',isDev&&co?co:'-',isDev&&co?co:'-',isDev&&co?1:0],['Lease-Up / Absorption',luMo?co+1:(isDev?'-':1),luMo?stab:(isDev?'-':1),luMo],['Stabilized Operations',stab,hold,Math.max(0,hold-stab+1)],['Sale / Exit',hold,hold,1]];
 return{s,isDev,land,close,acq,pre,hard,soft,hardLadder,softLadder,calibK:k,leaseDef,leaseupRamp:ramp.months,unlev,preMo,conMo,luMo,co,stab,hold,phases};
}
const _dealV09=sheetDealUnderwrite;sheetDealUnderwrite=function(){const o=_dealV09();o.main+=`<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Development - Workbook Inputs</caption><thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr></thead><tbody>${bkSelect('Development Budget Mode','devBudgetMode',[['SOURCE','SOURCE'],['PARAMETRIC','PARAMETRIC']])}${bkInput('Gross Building Area','gsf','GSF')}${bkInput('Source Construction Budget','sourceConstruction','$')}${bkInput('Pre-Development Period','predevMonths','months')}${bkInput('Construction Period','constructionMonths','months')}${bkInput('Lease-Up Period','leaseupMonths','months')}${bkInput('Pre-Leased Occupancy at CO','preleasedPct','%','pct')}${bkInput('Predevelopment Carry','predevCarry','$')}</tbody></table></div>
<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Development - Hard Cost Trade Lines ($ / GSF, Development!F25:F38)</caption><thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr></thead><tbody>${bkInput('Demolition, Abatement & Site Clearing','hc_demo','$/GSF')}${bkInput('Site Work, Utilities & Off-Sites','hc_sitework','$/GSF')}${bkInput('Excavation, Shoring & Foundations','hc_excavation','$/GSF')}${bkInput('Structured Parking - Below Grade','hc_parking','$/GSF')}${bkInput('Concrete Podium & Superstructure','hc_podium','$/GSF')}${bkInput('Exterior Envelope, Glazing & Balconies','hc_envelope','$/GSF')}${bkInput('Roofing, Waterproofing & Membrane','hc_roofing','$/GSF')}${bkInput('MEP & Fire Protection','hc_mep','$/GSF')}${bkInput('Elevators & Conveying','hc_elevators','$/GSF')}${bkInput('Interior Partitions & Common Finishes','hc_partitions','$/GSF')}${bkInput('Unit Interiors - Cabinets, Appliances, Fixtures','hc_unitint','$/GSF')}${bkInput('Amenity & Common Area Fit-Out','hc_amenity','$/GSF')}${bkInput('Commercial Shell / Fit-Out','hc_commshell','$/GSF')}${bkInput('Landscape, Hardscape & Streetscape','hc_landscape','$/GSF')}${bkInput('General Conditions & Requirements','hardGCPct','%','pct')}${bkInput('Contractor Fee','hardContractorFeePct','%','pct')}${bkInput('Risk, Payment & Bonds','hardRiskBondsPct','%','pct')}${bkInput('Hard Cost Contingency','hardContPct','%','pct')}</tbody></table></div>
<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Development - Soft Cost Line Items (Development!F48:F63, each on its own basis)</caption><thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr></thead><tbody>${bkInput('Architecture & Engineering (% of Hard Cost)','sc_ae','%','pct')}${bkInput('Civil, Landscape & Specialty Consultants','sc_civil','$/GSF')}${bkInput('Environmental, Geotech & Survey','sc_environmental','$/GSF')}${bkInput('Entitlement, Zoning & Community','sc_entitlement','$/GSF')}${bkInput('Permits, Impact, Utility & Housing Fees','sc_permits','$/GSF')}${bkInput('Legal, Accounting & Organizational','sc_legal','$/GSF')}${bkInput('Real Estate Taxes During Construction','sc_retaxconst','$/GSF')}${bkInput('Owner-Controlled Insurance Program','sc_ocip','$/GSF')}${bkInput('Marketing, Branding & Leasing Center','sc_marketing','$/GSF')}${bkInput('Testing, Inspection & Commissioning','sc_testing','$/GSF')}${bkInput('Sustainability, LEED & Energy Modeling','sc_sustainability','$/GSF')}${bkInput('Technology, Security & Low Voltage','sc_technology','$/GSF')}${bkInput('Commercial TI & Leasing Commissions','sc_ti','$/Retail SF')}${bkInput('FF&E and Amenity Furnishings','sc_ffe','$/Unit')}${bkInput('Title, Escrow, Transfer & Recording (% of Price)','sc_title','%','pct')}${bkInput('Construction Management Fee to Sponsor (% of Hard Cost)','cmFeePct','%','pct')}${bkInput('Development Fee (% of Hard + Soft Subtotal)','devFeePct','%','pct')}${bkInput('Soft Cost Contingency','softContPct','%','pct')}</tbody></table></div>`;return o;};
function sheetDevelopmentV09(){
 const x=bkDevV09(),m=(v)=>'$'+bkFmt(v),gsf=Number(x.s.gsf||0);
 const psf=(v)=>gsf?'$'+bkFmt(v/gsf):'-';
 let ladderHtml='';
 if(x.isDev && x.hardLadder && x.softLadder){
   const hl=x.hardLadder, sl=x.softLadder;
   const hardRows=hl.lines.map(l=>`<tr><td class="rowlabel">${bkEsc(l.name)}</td><td>${m(l.total)}</td><td>${psf(l.total)}</td><td>PARAMETRIC - $${l.rate.toFixed(2)}/GSF</td></tr>`).join('');
   const softRows=sl.lines.map(l=>`<tr><td class="rowlabel">${bkEsc(l.name)}</td><td>${m(l.total)}</td><td>${psf(l.total)}</td><td>${l.basis?'Basis: '+l.basis:'PARAMETRIC'}</td></tr>`).join('');
   ladderHtml=`
   <div class="tbl-wrap"><table class="fin"><caption>Hard Cost - Trade Lines (Development!F25:F38)</caption><thead><tr><th class="rowlabel-h">Trade</th><th>Total</th><th>$ / GSF</th><th>Basis</th></tr></thead><tbody>${hardRows}
   <tr><td class="rowlabel">SUBTOTAL - DIRECT TRADE COSTS</td><td>${m(hl.tradeSubtotal)}</td><td>${psf(hl.tradeSubtotal)}</td><td>SUM</td></tr>
   <tr><td class="rowlabel">General Conditions & Requirements</td><td>${m(hl.gc)}</td><td>${psf(hl.gc)}</td><td>${bkPct(Number(x.s.hardGCPct||0))} of trade subtotal</td></tr>
   <tr><td class="rowlabel">Contractor Fee</td><td>${m(hl.contractorFee)}</td><td>${psf(hl.contractorFee)}</td><td>${bkPct(Number(x.s.hardContractorFeePct||0))} of subtotal + GC</td></tr>
   <tr><td class="rowlabel">Risk, Payment & Bonds</td><td>${m(hl.riskBonds)}</td><td>${psf(hl.riskBonds)}</td><td>${bkPct(Number(x.s.hardRiskBondsPct||0))} of subtotal + GC + fee</td></tr>
   <tr><td class="rowlabel">Hard Cost Contingency</td><td>${m(hl.contingency)}</td><td>${psf(hl.contingency)}</td><td>${bkPct(Number(x.s.hardContPct||0))} of subtotal + GC + fee + bonds</td></tr>
   <tr class="grandtotal"><td class="rowlabel">TOTAL HARD COSTS</td><td>${m(hl.total)}</td><td>${psf(hl.total)}</td><td>CALCULATED</td></tr>
   </tbody></table></div>
   <div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Soft Cost - Line Items (Development!F48:F63)</caption><thead><tr><th class="rowlabel-h">Line Item</th><th>Total</th><th>$ / GSF</th><th>Basis</th></tr></thead><tbody>${softRows}
   <tr><td class="rowlabel">SUBTOTAL - SOFT COSTS</td><td>${m(sl.softSubtotal)}</td><td>${psf(sl.softSubtotal)}</td><td>SUM</td></tr>
   <tr><td class="rowlabel">Development Fee to Sponsor</td><td>${m(sl.devFee)}</td><td>${psf(sl.devFee)}</td><td>${bkPct(Number(x.s.devFeePct||0))} of Hard + Soft Subtotal</td></tr>
   <tr><td class="rowlabel">Soft Cost Contingency</td><td>${m(sl.contingency)}</td><td>${psf(sl.contingency)}</td><td>${bkPct(Number(x.s.softContPct||0))} of Subtotal + Dev Fee</td></tr>
   <tr class="grandtotal"><td class="rowlabel">TOTAL SOFT COSTS</td><td>${m(sl.total)}</td><td>${psf(sl.total)}</td><td>CALCULATED</td></tr>
   </tbody></table></div>
   ${String(x.s.devBudgetMode||'').toUpperCase()==='SOURCE'?`<div class="note-flag"><span>&#8505;</span><div><b>SOURCE budget mode -</b> the line items above are scaled by a calibration factor k = ${x.calibK.toFixed(4)} so total hard + soft cost ties exactly to the Source Construction Budget (Development!C75's closed-form k, since cost is linear in k).</div></div>`:''}
   ${(hl.tradeSubtotal===0 && sl.softSubtotal===0)?`<div class="note-flag"><span>&#9888;</span><div><b>No trade-level cost rates entered.</b> Every hard-cost trade line and soft-cost line item defaults to $0, exactly like an unpopulated Excel deal - neither source file available this session (the CRE Master workbook or the Yardi portfolio benchmark) contains a real, populated development deal to pull real per-trade rates from. Enter real $/GSF (or %) assumptions for each line above to produce a real cost basis.</div></div>`:''}
   `;
 }
 const main=`<div class="tbl-wrap"><table class="fin"><caption>Development - Cost Basis Summary</caption><thead><tr><th class="rowlabel-h">Cost Concept</th><th>Total</th><th>$ / GSF</th><th>Lineage</th></tr></thead><tbody><tr><td class="rowlabel">Land / Purchase Price</td><td>${m(x.land)}</td><td>${psf(x.land)}</td><td>SOURCE</td></tr><tr><td class="rowlabel">Closing / Diligence Costs</td><td>${m(x.close)}</td><td>${psf(x.close)}</td><td>UNDERWRITING</td></tr><tr><td class="rowlabel">Acquisition Fee</td><td>${m(x.acq)}</td><td>${psf(x.acq)}</td><td>UNDERWRITING</td></tr><tr><td class="rowlabel">Predevelopment Carry</td><td>${m(x.pre)}</td><td>${psf(x.pre)}</td><td>UNDERWRITING</td></tr><tr><td class="rowlabel">Hard Costs (itemized below)</td><td>${m(x.hard)}</td><td>${psf(x.hard)}</td><td>CALCULATED</td></tr><tr><td class="rowlabel">Soft Costs (itemized below)</td><td>${m(x.soft)}</td><td>${psf(x.soft)}</td><td>CALCULATED</td></tr><tr><td class="rowlabel">Lease-Up Operating Deficit</td><td>${m(x.leaseDef)}</td><td>${psf(x.leaseDef)}</td><td>CALCULATED</td></tr><tr class="grandtotal"><td class="rowlabel">UNLEVERED ALL-IN COST</td><td>${m(x.unlev)}</td><td>${psf(x.unlev)}</td><td>CALCULATED</td></tr></tbody></table></div>${ladderHtml}<div class="note-flag"><span>&#10003;</span><div><b>Development engine -</b> the workbook's actual 14-trade hard-cost ladder (with General Conditions -> Contractor Fee -> Risk/Bonds -> Contingency cascading exactly as Development!F39-F44) and 16-line soft-cost ladder (each on its own basis, Development!F48-F63) are now itemized in-browser instead of a blended $/GSF proxy. Acquisition deals correctly suppress development-only costs.</div></div>`;return{title:'Development',crumbs:'Development',desc:'Budget, itemized cost ladder and development capitalization.',meta:{Property:x.s.name,'Deal Type':x.s.dealType||'Acquisition',Mode:x.isDev?x.s.devBudgetMode:'N/A',Status:x.isDev?'Live - itemized ladder':'Acquisition - N/A'},main,sidebar:sidebarShell(`<div class="card"><div class="card-head">Cost Ladder</div><div class="metric-list"><div class="metric-row"><span class="k">Land</span><span class="v">${m(x.land)}</span></div><div class="metric-row"><span class="k">Hard Costs</span><span class="v">${m(x.hard)}</span></div><div class="metric-row"><span class="k">Soft Costs</span><span class="v">${m(x.soft)}</span></div><div class="metric-row"><span class="k">Unlevered All-In</span><span class="v">${m(x.unlev)}</span></div></div></div>${colorKeyCard()}`)};}
function sheetDevScheduleV09(){const x=bkDevV09();const rows=x.phases.map(p=>`<tr><td class="rowlabel">${p[0]}</td><td>${p[1]}</td><td>${p[2]}</td><td>${p[3]||'-'}</td></tr>`).join('');const main=`<div class="tbl-wrap"><table class="fin"><caption>Development Schedule & Milestone Timeline</caption><thead><tr><th class="rowlabel-h">Phase</th><th>Start Mo</th><th>End Mo</th><th>Months</th></tr></thead><tbody>${rows}<tr class="grandtotal"><td class="rowlabel">TOTAL HOLD PERIOD</td><td colspan="2">${x.hold} months</td><td>${Number(x.s.holdYears||0).toFixed(1)} yrs</td></tr></tbody></table></div>`;return{title:'Dev Schedule',crumbs:'Development',desc:'Pre-development, construction, CO, lease-up, stabilization and exit timeline.',meta:{Property:x.s.name,'Pre-Dev':x.preMo+' mo','Construction':x.conMo+' mo','Lease-Up':x.luMo+' mo',Status:x.isDev?'Live':'Acquisition - N/A'},main,sidebar:sidebarShell(`<div class="card"><div class="card-head">Milestones</div><div class="metric-list"><div class="metric-row"><span class="k">CO Month</span><span class="v">${x.co||'-'}</span></div><div class="metric-row"><span class="k">Stabilization</span><span class="v">${x.stab}</span></div><div class="metric-row"><span class="k">Exit</span><span class="v">${x.hold}</span></div></div></div>${colorKeyCard()}`)};}
function sheetResidualLandV09(){const x=bkDevV09(),s=x.s;const main=`<div class="tbl-wrap"><table class="fin"><caption>Residual Land Value</caption><thead><tr><th class="rowlabel-h">Item</th><th>Value</th><th style="text-align:left">Units</th><th style="text-align:left">Note</th></tr></thead><tbody>${bkYesNo('Use Residual Land Value','landOverrideOn','')}${Number(s.landOverrideOn)?bkInput('Land value used (override)','residualLandValue','$'):''}<tr><td class="rowlabel">Effective Land / Purchase Price<span class="bk-sub">Used by development cost ladder</span></td><td>$${bkFmt(x.land)}</td><td data-bk-align="text">$</td><td><span class="status-chip">CALC</span></td></tr><tr><td class="rowlabel">Workbook Stored Solve<span class="bk-sub">Reference value from Residual Land C20</span></td><td>$5,288,519</td><td data-bk-align="text">$</td><td><span class="status-chip">STORED</span></td></tr></tbody></table></div>`;return{title:'Residual Land',crumbs:'Development',desc:'Residual land override and effective land basis.',meta:{Property:s.name,Override:Number(s.landOverrideOn)?'On':'Off','Effective Land':bkFmt(x.land),Status:'Mapped'},main,sidebar:sidebarShell(colorKeyCard())};}
function sheetDevDrawsV09(){const x=bkDevV09(), months=Math.max(1,x.conMo||1), draw=x.isDev?x.hard/months:0, rows=Array.from({length:Math.min(months,36)},(_,i)=>`<tr><td class="rowlabel">${i+1+x.preMo}</td><td>${bkFmt(draw)}</td><td>${bkFmt(draw)}</td><td>${bkFmt(draw*(i+1))}</td></tr>`).join('');const main=`<div class="tbl-wrap"><table class="fin"><caption>Development Draws - Monthly Schedule</caption><thead><tr><th class="rowlabel-h">Month</th><th>Hard Cost Draw</th><th>Total Funding Need</th><th>Cumulative</th></tr></thead><tbody>${rows||'<tr><td class="rowlabel">N/A</td><td colspan="3">Acquisition deal - no development draws.</td></tr>'}</tbody></table></div><div class="note-flag"><span>&#9888;</span><div><b>Simplified draw schedule -</b> hard costs are spread evenly across the construction period. Curve-weighted (S-curve) draws, soft-cost slices, lease-up deficit and capitalised construction interest are not modelled on this page yet, so treat the monthly figures as indicative.</div></div>`;return{title:'Dev Draws',crumbs:'Development',desc:'Monthly development funding schedule.',meta:{Property:x.s.name,Months:x.conMo,Curve:'Initial / flat',Status:x.isDev?'Live / expanding':'Acquisition - N/A'},main,sidebar:sidebarShell(colorKeyCard())};}
RENDERERS['Development']=sheetDevelopmentV09;RENDERERS['Dev Schedule']=sheetDevScheduleV09;RENDERERS['Dev Draws']=sheetDevDrawsV09;RENDERERS['Residual Land']=sheetResidualLandV09;

/* Punchlist Capital V1.0 - monthly development curves + construction facility funding. Claude visual master remains locked. */
Object.assign(BK_BASE,{hardCurveMethod:'S-Curve',hardCurveSteepness:7,softPreMethod:'Straight-Line',softConMethod:'S-Curve',softConSteepness:5,softLeaseMethod:'Straight-Line',conLTC:0,conLTV:0,conOrigFee:0,conCapCost:0,conUtil:0,conRate:0.0363,lenderLegal:0,guarantyFeePct:0});
/* leaseDeficit (manual input) removed in V2.5 -- Lease-Up Operating Deficit is now always computed from the
   real occupancy ramp (bkDevLeaseupRamp), matching Excel Development!C78. */
function bkErf(x){const sg=x<0?-1:1,a=Math.abs(x),t=1/(1+.3275911*a),y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-a*a);return sg*y;}
function bkNormCdf(x){return .5*(1+bkErf(x/Math.SQRT2));}
function bkCurveShare(month,start,len,method,steep){start=Math.round(Number(start||0));len=Math.round(Number(len||0));if(len<=0||month<start||month>start+len-1)return 0;if(String(method||'').toLowerCase().startsWith('s-')){const d=Math.max(.0001,Number(steep||1)),sig=len/d,k=month-start+1,den=1-2*bkNormCdf(0-len/2/sig);return den?Math.max(0,(bkNormCdf((k-len/2)/sig)-bkNormCdf((k-1-len/2)/sig))/den):1/len;}return 1/len;}
/* V32.4 single-source development lifecycle (F13 + F15 + F16). One authority for: construction window, close-out month,
   where unscheduled cost lands at exit, whether a lease-up deficit is funded capital, and whether the sale precedes the takeout. */
function bkDevLifecycleV13(x){
 return {conStart:x.preMo+1,
  conLen:Math.max(1,x.conMo),                                   // F13: a 0-month construction window is one month at the first construction month, never zero
  closeoutMo:(x.luMo>0)?-1:(x.conMo>0?x.co:x.preMo+1),         // 10% close-out share lands in exactly one month when there is no lease-up
  sweepMo:x.hold,                                              // F13: cost scheduled beyond the sale is funded no later than the sale month
  deficitFunded:Number(x.leaseDef||0)>0,                       // F15: a lease-up deficit is funded capital; its negative NOI is NOT charged again in returns
  saleBeforeTakeout:x.hold<x.stab};                            // F16: before stabilisation there is no permanent loan to repay
}
function bkDevFundingV10(){
 const x=bkDevV09(),s=x.s;if(!x.isDev)return Object.assign(x,{months:[],commit:0,actualCapInt:0,upfrontFees:0,levered:x.unlev,equityTotal:x.unlev});
 // x.leaseDef / x.unlev are already the real, ramp-computed values from bkDevV09() -- no longer a flat manual
 // input, so nothing to overwrite here.
 const stabVal=Number(s.exitCap||0)>0?Number(bkCalc().noi||0)/Number(s.exitCap):0, rate=Math.max(0,Number(s.conRate||0)), feeFac=Math.max(0,Number(s.conOrigFee||0)+Number(s.conCapCost||0)+Number(s.guarantyFeePct||0));
 // Excel Debt!C23/C33: the facility's payoff/accrual-window endpoint is the REFINANCE month (~stabilization)
 // when the deal refinances, and only the sale/exit month when it never does -- not always the full hold period.
 /* interest is capitalised only through stabilisation (see the draw loop below), so the interest reserve that
    sizes the commitment must stop there too, with or without a takeout; otherwise a no-takeout loan exceeds its LTC. */
 const payoff=Number(s.refiAtStab||0)?x.stab:x.hold, accr=Math.max(3,Math.round((Math.min(payoff,x.stab)-(x.preMo+1)+1)*.7)), intFac=Math.max(0,Number(s.conUtil||0))*rate*accr/12, U0=x.unlev+Number(s.lenderLegal||0), ltc=Number(s.conLTC||0), ltv=Number(s.conLTV||0);
 const commitLTC=ltc>0&&ltc*(feeFac+intFac)<1?ltc*U0/(1-ltc*(feeFac+intFac)):0,commitLTV=ltv>0?ltv*stabVal:Number.POSITIVE_INFINITY,commit=(()=>{const a=ltc>0?(commitLTC||0):Number.POSITIVE_INFINITY,raw=Math.min(a,commitLTV);return isFinite(raw)?Math.max(0,Math.floor(raw/1000)*1000):0;})(),upfront=commit*feeFac+Number(s.lenderLegal||0),estInt=commit*intFac,eqTarget=commit>0?Math.max(0,x.unlev+upfront+estInt-commit):9.9e14;
 /* unit-level lease-up: the operating shortfall is funded in the months it actually occurs (the unit schedule's negative NOI), not spread evenly */
 let leaseShares=null;if(typeof bkDevUnitOn==='function'&&bkDevUnitOn(s)&&x.leaseDef>0){const sf={};let tot=0;(x.leaseupRamp||[]).forEach(r=>{const v=Math.max(0,-Number(r.after||0));if(v>0){sf[r.mo]=v;tot+=v;}});if(tot>0){leaseShares={};Object.keys(sf).forEach(k=>{leaseShares[k]=sf[k]/tot;});}}
 let bal=0,cumEq=0,cumNeed=0,actualCapInt=0,overflowTotal=0;const months=[];const LC=bkDevLifecycleV13(x);let cumHard=0,cumSoft=0,cumLease=0,cumFees=0;
 for(let mo=1;mo<=x.hold;mo++){
   const land=mo===1?x.land+x.close+x.acq+x.pre:0;
   let hard=x.hard*bkCurveShare(mo,LC.conStart,LC.conLen,s.hardCurveMethod,s.hardCurveSteepness);
   const preShare=x.preMo>0?bkCurveShare(mo,1,x.preMo,s.softPreMethod,1):0;
   const conShare=bkCurveShare(mo,LC.conStart,LC.conLen,s.softConMethod,s.softConSteepness);
   const luShare=x.luMo>0?bkCurveShare(mo,x.co+1,x.luMo,s.softLeaseMethod,1):0;
   let soft=x.soft*(.28*preShare+(.62+(x.preMo===0?.28:0))*conShare+.10*luShare);if(x.luMo===0&&mo===LC.closeoutMo)soft+=x.soft*.10;
   let lease=x.leaseDef*(leaseShares?(leaseShares[mo]||0):bkCurveShare(mo,x.co+1,x.luMo,'Straight-Line',1)),fees=mo===x.preMo+1?upfront:0;
   cumHard+=hard;cumSoft+=soft;cumLease+=lease;cumFees+=fees;
   if(mo===LC.sweepMo){const rh=x.hard-cumHard,rs=x.soft-cumSoft,rl=x.leaseDef-cumLease,rf=upfront-cumFees;if(rh>.01)hard+=rh;if(rs>.01)soft+=rs;if(rl>.01)lease+=rl;if(rf>.01)fees+=rf;}
   const need=land+hard+soft+lease+fees;
   const eq=Math.min(need,Math.max(0,eqTarget-cumEq));cumEq+=eq;
   const beg=bal,interest=(commit>0&&mo<=x.stab&&mo<payoff)?beg*rate/12:0,capInt=Math.min(interest,Math.max(0,commit-beg)),excess=Math.max(0,interest-capInt),loanDraw=(commit>0&&mo<payoff)?Math.min(Math.max(0,need-eq),Math.max(0,commit-beg-capInt)):0,overflow=Math.max(0,need-eq-loanDraw);bal=beg+capInt+loanDraw;actualCapInt+=capInt;overflowTotal+=overflow+excess;cumNeed+=need;
   months.push({mo,land,hard,soft,lease,fees,need,eq,beg,capInt,excess,loanDraw,overflow,end:bal,cumNeed});
 }
 return Object.assign(x,{stabVal,rate,feeFac,commitLTC,commitLTV,commit,upfrontFees:upfront,estInt,eqTarget,actualCapInt,overflowTotal,levered:x.unlev+upfront+actualCapInt,equityTotal:cumEq+overflowTotal,months});
}
const _dealV10=sheetDealUnderwrite;sheetDealUnderwrite=function(){const o=_dealV10();const xv10=bkDevV09();o.main+=`<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Construction Facility & Draw Curves - Workbook Inputs</caption><thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr></thead><tbody>${bkSelect('Hard Cost Curve','hardCurveMethod',[['Straight-Line','Straight-Line'],['S-Curve','S-Curve']])}${bkInput('Hard Cost Curve Steepness','hardCurveSteepness','x')}${bkSelect('Soft Construction Curve','softConMethod',[['Straight-Line','Straight-Line'],['S-Curve','S-Curve']])}${bkInput('Soft Construction Steepness','softConSteepness','x')}<tr><td class="rowlabel">Lease-Up Operating Deficit<span class="bk-sub">Cumulative negative NOI, CO to Stab-1 (see Pre-Leased Occupancy / Lease-Up Period above)</span></td><td>${bkFmt(xv10.leaseDef)}</td><td style="text-align:left">$</td><td><span class="status-chip">CALC</span></td></tr>${bkInput('Construction Max LTC','conLTC','%','pct')}${bkInput('Construction Max LTSV','conLTV','%','pct')}${bkInput('Construction Rate','conRate','%','pct')}${bkInput('Construction Origination Fee','conOrigFee','%','pct')}${bkInput('Rate Cap Cost','conCapCost','%','pct')}${bkInput('Sizing Utilization','conUtil','%','pct')}${bkInput('Guaranty Fee','guarantyFeePct','%','pct')}${bkInput('Lender Legal','lenderLegal','$')}</tbody></table></div>`;return o;};
function sheetDevDrawsV10(){const x=bkDevFundingV10();if(!x.isDev)return sheetDevDrawsV09();const rows=x.months.filter(z=>z.need||z.capInt||z.loanDraw||z.eq||z.overflow).slice(0,60).map(z=>`<tr><td class="rowlabel">${z.mo}</td><td>${bkFmt(z.hard)}</td><td>${bkFmt(z.soft)}</td><td>${bkFmt(z.need)}</td><td>${bkFmt(z.eq)}</td><td>${bkFmt(z.loanDraw)}</td><td>${bkFmt(z.capInt)}</td><td>${bkFmt(z.end)}</td></tr>`).join('');const main=`<div class="tbl-wrap"><table class="fin"><caption>Development Draws - Monthly Engine</caption><thead><tr><th class="rowlabel-h">Month</th><th>Hard</th><th>Soft</th><th>Funding Need</th><th>Equity</th><th>Facility Draw</th><th>Cap. Interest</th><th>Ending Balance</th></tr></thead><tbody>${rows}</tbody></table></div><div class="note-flag"><span>&#10003;</span><div><b>Monthly development engine -</b> hard-cost S-curves, the workbook's 28% / 62% / 10% soft-cost timing, equity-first funding, construction-facility draws, commitment caps, and monthly capitalized interest are now running in-browser.</div></div>`;return{title:'Dev Draws',crumbs:'Development',desc:'Monthly development funding schedule and construction facility interaction.',meta:{Property:x.s.name,Curve:x.s.hardCurveMethod||'S-Curve','Commitment':bkFmt(x.commit),'Cap. Interest':bkFmt(x.actualCapInt)},main,sidebar:sidebarShell(`<div class="card"><div class="card-head">Construction Facility</div><div class="metric-list"><div class="metric-row"><span class="k">Commitment</span><span class="v">${bkFmt(x.commit)}</span></div><div class="metric-row"><span class="k">Upfront Fees</span><span class="v">${bkFmt(x.upfrontFees)}</span></div><div class="metric-row"><span class="k">Actual Cap. Interest</span><span class="v">${bkFmt(x.actualCapInt)}</span></div><div class="metric-row"><span class="k">Levered All-In</span><span class="v">${bkFmt(x.levered)}</span></div></div></div>${colorKeyCard()}`)};}
function sheetDevelopmentV10(){const o=sheetDevelopmentV09(),x=bkDevFundingV10();if(x.isDev){o.main=o.main.replace('Detailed trade-line calibration and construction-interest circularity remain for the next development pass.','Monthly draw curves and construction-interest funding are now active in V1.0; detailed trade-line calibration remains a later pass.');o.sidebar=sidebarShell(`<div class="card"><div class="card-head">Cost Ladder</div><div class="metric-list"><div class="metric-row"><span class="k">Unlevered All-In</span><span class="v">${bkFmt(x.unlev)}</span></div><div class="metric-row"><span class="k">Construction Commitment</span><span class="v">${bkFmt(x.commit)}</span></div><div class="metric-row"><span class="k">Actual Cap. Interest</span><span class="v">${bkFmt(x.actualCapInt)}</span></div><div class="metric-row"><span class="k">Levered All-In</span><span class="v">${bkFmt(x.levered)}</span></div></div></div>${colorKeyCard()}`);}return o;}
RENDERERS['Development']=sheetDevelopmentV10;RENDERERS['Dev Draws']=sheetDevDrawsV10;


/* Punchlist Capital V1.1 - development stabilization / permanent takeout bridge. Claude visual master remains locked. */
Object.assign(BK_BASE,{permLTV:.65,permDSCR:1.25,permRate:.0675,permAmort:30,permIO:0,permOrigFee:.01,refiAtStab:1,stabilizedNOI:0,permDebtYield:0});
function bkPmtV11(rate,n,pv){if(!n)return 0;if(!rate)return pv/n;return pv*rate/(1-Math.pow(1+rate,-n));}
// V26 Excel parity #1: Excel (Debt!C39, d_FwdNOI) sizes the permanent loan off the actual forward
// 12-month NOI starting the month AFTER refinance/stabilization -- not a flat stabilized run-rate.
// Ported using the SAME monthly growth-year stepping bkDevMonthlyReturnsV12 already uses for the
// post-stabilization operating curve, so the sizing NOI and the cash-flow NOI are one consistent
// source rather than two different proxies for the same thing.
function bkDevForwardNOI(x){
  const s=x.s, baseNOI=Math.max(0,Number(s.stabilizedNOI||0)||Number(bkCalc().noi||0));   // CV-DV1/D1: permanent sizing NOI BEFORE reserves
  const noiGrowth=Number(s.noiGrowth||s.rentGrowth||0);
  let fwdNOI=0;
  for(let mo=x.stab+1; mo<=x.stab+12; mo++){
    const opYear=Math.max(1,Math.ceil((mo-x.stab+1)/12));
    fwdNOI += baseNOI*Math.pow(1+noiGrowth,opYear-1)/12;
  }
  return {fwdNOI, baseNOI, noiGrowth};
}
function bkDevTakeoutV11(){
 const x=bkDevFundingV10(),s=x.s;if(!x.isDev)return Object.assign(x,{permLoan:0,permDebtAtSale:0,refiProceeds:0,devEquity:x.equityTotal||0});
 const op=bkOperatingV02(), fwd=bkDevForwardNOI(x);
 // noi (the figure that actually SIZES the permanent loan below) is now the true forward 12-month
 // NOI at refinance -- matching Excel d_FwdNOI -- rather than the point-in-time stabilized run-rate.
 // stabPointNOI is kept only for display/reference (what the operating engine shows AT stabilization).
 const noi=Math.max(0,fwd.fwdNOI), stabPointNOI=Math.max(0,Number(s.stabilizedNOI||0)||Number(op.noi||0));
 const stabVal=Math.max(0,noi/Math.max(.0001,Number(s.exitCap||.06)));
 const ltvCap=Math.max(0,stabVal*Number(s.permLTV||0));
 const r=Number(s.permRate||0)/12,n=Math.max(1,Math.round(Number(s.permAmort||30)*12)),io=Math.max(0,Math.round(Number(s.permIO||0)*12));
 const dscrCap=Number(s.permDSCR||0)>0?noi/Number(s.permDSCR)/12:1e99;
 const dscrLoan=r>0?dscrCap*(1-Math.pow(1+r,-n))/r:dscrCap*n;
 // Excel Debt!C43/C44: permanent loan sizes to the LESSER of LTV, DSCR, AND minimum Debt Yield (NOI / loan).
 const dyLoan=Number(s.permDebtYield||0)>0?noi/Number(s.permDebtYield):1e99;
 const permRaw=Math.max(0,Math.min(ltvCap,dscrLoan,dyLoan)), permLoan=Math.floor(permRaw/1000)*1000;   // CV-DV5/D3: round down to $1,000
 // Excel Debt!C45 priority: DSCR, then Debt Yield, else LTV.
 const bindingTest=permRaw===dscrLoan?'DSCR':(permRaw===dyLoan?'Debt Yield':'LTV');
 const fee=permLoan*Number(s.permOrigFee||0), conPayoff=(x.months.find(z=>z.mo===x.stab)||x.months[x.months.length-1]||{end:0}).end||0;
 const refiProceeds=Math.max(0,permLoan-conPayoff-fee), refiShortfall=Math.max(0,conPayoff+fee-permLoan);
 let bal=permLoan; const sched=[]; const pmt=bkPmtV11(r,n,permLoan); const start=Math.max(1,x.stab), end=Math.max(start,x.hold);
 for(let mo=start;mo<=end;mo++){let interest=bal*r,principal=0,payment=0;if(mo>start){if(mo-start<=io){payment=interest;}else{payment=Math.min(bal+interest,pmt);principal=Math.max(0,payment-interest);bal=Math.max(0,bal-principal);}}sched.push({mo,interest,principal,payment,end:bal});}
 const devEquity=Math.max(0,(x.equityTotal||0)+refiShortfall-refiProceeds);
 /* V30.2 DEFECT FIX - construction loan WITHOUT permanent takeout (refiAtStab off).
    Previously a permanent loan was still sized, its debt service charged and its balance paid off
    at sale, while the construction balance was never repaid. Now: no permanent loan exists; the
    construction loan stays outstanding after stabilization, interest-only at the construction rate
    (interest capitalized through stabilization exactly as before, paid currently afterwards), and
    is repaid in full from sale proceeds. Model controls state this assumption as a WARN. The
    takeout path (refiAtStab on) is unchanged. */
 if(!Number(s.refiAtStab||0) && Number(x.commit||0)>0){
   const conBal=Number(conPayoff||0);
   return Object.assign(x,{noi,stabPointNOI,noiGrowth:fwd.noiGrowth,stabVal,ltvCap,dscrLoan,dyLoan,bindingTest:'No takeout',permLoan:0,permFee:0,conPayoff:0,refiProceeds:0,refiShortfall:0,permPmt:0,permDebtAtSale:0,permSchedule:[],devEquity:Math.max(0,x.equityTotal||0),
     conHeldToSale:true,conHeldBalance:conBal,conIOPayment:conBal*Math.max(0,Number(s.conRate||0))/12});
 }
 return Object.assign(x,{noi,stabPointNOI,noiGrowth:fwd.noiGrowth,stabVal,ltvCap,dscrLoan,dyLoan,bindingTest,permLoan,permFee:fee,conPayoff,refiProceeds,refiShortfall,permPmt:pmt,permDebtAtSale:bal,permSchedule:sched,devEquity});
}
const _dealV11=sheetDealUnderwrite;sheetDealUnderwrite=function(){const o=_dealV11();o.main+=`<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Permanent / Stabilized Debt - Workbook Bridge</caption><thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr></thead><tbody>${bkYesNo('Refinance at Stabilization','refiAtStab')}${bkInput('Stabilized NOI Override','stabilizedNOI','$')}${bkInput('Permanent Max LTV','permLTV','%','pct')}${bkInput('Permanent Min DSCR','permDSCR','x')}${bkInput('Permanent Min Debt Yield','permDebtYield','%','pct')}${bkInput('Permanent Interest Rate','permRate','%','pct')}${bkInput('Permanent Amortization','permAmort','years')}${bkIOToggle('Permanent Loan - Interest-Only','permIO',2)}${bkInput('Permanent Origination Fee','permOrigFee','%','pct')}</tbody></table></div>`;return o;};
const _debtV11=RENDERERS['Debt'];RENDERERS['Debt']=function(){const s=bkLoad();if(String(s.dealType||'').toLowerCase()!=='development')return _debtV11();const x=bkDevTakeoutV11();const main=`<div class="tbl-wrap"><table class="fin"><caption>Development Debt - Construction to Permanent Takeout</caption><thead><tr><th class="rowlabel-h">Sizing / Takeout</th><th>Amount</th><th>Constraint</th></tr></thead><tbody><tr><td class="rowlabel">Construction Commitment</td><td>${bkFmt(x.commit)}</td><td>Construction facility</td></tr><tr><td class="rowlabel">Construction Balance at Stabilization</td><td>${bkFmt(x.conPayoff)}</td><td>Takeout requirement</td></tr><tr><td class="rowlabel">Stabilized NOI (point-in-time)</td><td>${bkFmt(x.stabPointNOI)}</td><td>Operating engine at stabilization month</td></tr><tr class="grandtotal"><td class="rowlabel">Forward 12-Month NOI at Refinance</td><td>${bkFmt(x.noi)}</td><td>Sizing basis - Excel d_FwdNOI (12 months from month after stabilization, ${bkPct(x.noiGrowth||0)}/yr growth)</td></tr><tr><td class="rowlabel">Permanent LTV Capacity</td><td>${bkFmt(x.ltvCap)}</td><td>${bkPct(Number(x.s.permLTV||0))} LTV</td></tr><tr><td class="rowlabel">Permanent DSCR Capacity</td><td>${bkFmt(x.dscrLoan)}</td><td>${Number(x.s.permDSCR||0).toFixed(2)}x DSCR</td></tr><tr><td class="rowlabel">Permanent Debt Yield Capacity</td><td>${isFinite(x.dyLoan)?bkFmt(x.dyLoan):'-'}</td><td>${Number(x.s.permDebtYield||0)?bkPct(Number(x.s.permDebtYield||0))+' Debt Yield':'Not constrained'}</td></tr><tr class="grandtotal"><td class="rowlabel">PERMANENT LOAN</td><td>${bkFmt(x.permLoan)}</td><td>${x.bindingTest} binding</td></tr><tr><td class="rowlabel">Permanent Loan Fee</td><td>${bkFmt(x.permFee)}</td><td>At stabilization</td></tr><tr><td class="rowlabel">Net Refinance Proceeds</td><td>${bkFmt(x.refiProceeds)}</td><td>After construction payoff + fee</td></tr><tr><td class="rowlabel">Refinance Equity Shortfall</td><td>${bkFmt(x.refiShortfall)}</td><td>Additional equity if any</td></tr></tbody></table></div><div class="note-flag"><span>&#10003;</span><div><b>Development takeout bridge -</b> stabilized NOI now sizes permanent debt by the lesser of LTV, DSCR and Debt Yield, repays the construction facility, deducts origination fees, and carries the permanent balance forward through the remaining hold.</div></div>`;return{title:'Debt',crumbs:'Debt',desc:'Construction facility takeout and permanent debt sizing.',meta:{Property:x.s.name,'Deal Type':'Development','Stabilized Value':bkFmt(x.stabVal),Status:'Live'},main,sidebar:sidebarShell(`<div class="card"><div class="card-head">Takeout Summary</div><div class="metric-list"><div class="metric-row"><span class="k">Fwd 12-Mo NOI (sizing)</span><span class="v">${bkFmt(x.noi)}</span></div><div class="metric-row"><span class="k">Permanent Loan</span><span class="v">${bkFmt(x.permLoan)}</span></div><div class="metric-row"><span class="k">Construction Payoff</span><span class="v">${bkFmt(x.conPayoff)}</span></div><div class="metric-row"><span class="k">Net Refi Proceeds</span><span class="v">${bkFmt(x.refiProceeds)}</span></div></div></div>${colorKeyCard()}`)};};
const _dsV11=RENDERERS['Debt Schedule'];RENDERERS['Debt Schedule']=function(){const s=bkLoad();if(String(s.dealType||'').toLowerCase()!=='development')return _dsV11();const x=bkDevTakeoutV11(),rows=x.permSchedule.slice(0,120).map(z=>`<tr><td class="rowlabel">${z.mo}</td><td>${bkFmt(z.payment)}</td><td>${bkFmt(z.interest)}</td><td>${bkFmt(z.principal)}</td><td>${bkFmt(z.end)}</td></tr>`).join('');return{title:'Debt Schedule',crumbs:'Debt',desc:'Permanent debt amortization after development stabilization.',meta:{Property:x.s.name,Rate:bkPct(Number(x.s.permRate||0)),Amortization:(x.s.permAmort||0)+' years',Status:'Live'},main:`<div class="tbl-wrap"><table class="fin"><caption>Permanent Debt Schedule - Post Stabilization</caption><thead><tr><th class="rowlabel-h">Month</th><th>Debt Service</th><th>Interest</th><th>Principal</th><th>Ending Balance</th></tr></thead><tbody>${rows}</tbody></table></div>`,sidebar:sidebarShell(`<div class="card"><div class="card-head">Permanent Debt</div><div class="metric-list"><div class="metric-row"><span class="k">Initial Balance</span><span class="v">${bkFmt(x.permLoan)}</span></div><div class="metric-row"><span class="k">Monthly Payment</span><span class="v">${bkFmt(x.permPmt)}</span></div><div class="metric-row"><span class="k">Debt at Exit</span><span class="v">${bkFmt(x.permDebtAtSale)}</span></div></div></div>${colorKeyCard()}`)};};

