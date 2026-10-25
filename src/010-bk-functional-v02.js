
// Punchlist Capital CRE App V0.2 - first workbook-grounded operating engine slice.
// Visual master is intentionally untouched.
const BK_STORE='bkcapital.cre.v02';
const BK_BASE={
  dealId:'BK-002',name:'ShorePointe',location:'Stamford, CT',dealType:'Acquisition',propertyType:'Multifamily',status:'Pipeline',closing:'1/1/2027',
  // RC3 item 4: avgUnitSize removed. It was never read - not by any calculation,
  // not by any renderer, and not as BK_BASE.avgUnitSize. The Physical sheet
  // DERIVES average unit size inline from gsf/units, so a stored assumption of
  // the same name could only ever disagree with what the sheet displays.
  // parking and siteArea are KEPT: they are rendered as editable inputs, but no
  // calculation reads either one. See the NON-OPERATIVE register below.
  units:38,gsf:30482,commercialArea:0,parking:50,siteArea:1.25,
  purchasePrice:10325000,t12noi:515307.92,taxes:215831.36,avgRent:36.64,commercialRent:0,recovery:0,otherIncomePerUnit:1692,
  closingCostsPct:0.05,vacancy:0.025,mgmtPct:0.01,insurance:25080,payroll:72438.67,rm:41497,turnover:32436.79,utilities:37926.96,contract:139,marketing:10200,ga:149017,reserves:0,occupancy:0.98,exitCap:0.05,holdYears:10,
  // cached workbook engine baseline, used to preserve exact current workbook economics while editable drivers are introduced
  gpr:1086996,badDebtPct:0.005,misc:7620.5
};
/* UNDERWRITING CONVENTIONS (CV-2026.10). Each is a per-deal setting. A deal that does not carry
   the field resolves to the LEGACY behaviour it was underwritten with, so no saved deal changes
   unless someone changes its setting. New deals are stamped with the current standard by
   bkCreateNewDeal(). This is the only place the fallbacks are defined.
     cvRentGrowthStart  'year2'  Year 1 at underwritten rents/expenses, annual step growth from Year 2
                        'month1' (legacy) continuous monthly compounding from month 1
     cvOpexVariablePct  share of controllable opex that varies with occupancy (0 = all fixed);
                        legacy 0.40 (the workbook's 0.6 fixed + 0.4 x occupancy split)
     cvLtvBasis         'price' purchase price | 'value' (legacy) Year-1 NOI / exit cap | 'lesser'
     cvHurdleBasis      'lp' hurdles tested on LP contributions and distributions
                        'deal' (legacy) hurdles tested on total deal equity cash flows
     cvBadDebtBasis     'afterVacancy' bad debt is charged on rent after vacancy, in the Operating
                        Underwrite statement and the monthly cash flow alike
                        'gross' bad debt on gross potential rent, in both
                        'legacy' original split: gross in the statement, after vacancy monthly
   SCOPE: these conventions govern ACQUISITION deals. A Development deal keeps its own methodology
   (construction-loan sizing, construction-period cash flows, annual growth), so bkConventions()
   always resolves it to the legacy values and reports scope 'development'. */
var BK_CV_STANDARD = { cvRentGrowthStart:'year2', cvOpexVariablePct:0, cvLtvBasis:'price', cvHurdleBasis:'lp', cvBadDebtBasis:'afterVacancy' };
var BK_CV_LEGACY   = { cvRentGrowthStart:'month1', cvOpexVariablePct:0.4, cvLtvBasis:'value', cvHurdleBasis:'deal', cvBadDebtBasis:'legacy' };
function bkConventions(s){
  s = s || {};
  var out = { legacyFields:[] };
  Object.keys(BK_CV_LEGACY).forEach(function(k){
    var v = s[k];
    if(v === undefined || v === null || v === ''){ out[k] = BK_CV_LEGACY[k]; out.legacyFields.push(k); }
    else out[k] = (k === 'cvOpexVariablePct') ? Math.max(0, Math.min(1, Number(v) || 0)) : String(v);
  });
  if(['year2','month1'].indexOf(out.cvRentGrowthStart) < 0) out.cvRentGrowthStart = BK_CV_LEGACY.cvRentGrowthStart;
  if(['price','value','lesser'].indexOf(out.cvLtvBasis) < 0) out.cvLtvBasis = BK_CV_LEGACY.cvLtvBasis;
  if(['lp','deal'].indexOf(out.cvHurdleBasis) < 0) out.cvHurdleBasis = BK_CV_LEGACY.cvHurdleBasis;
  if(['afterVacancy','gross','legacy'].indexOf(out.cvBadDebtBasis) < 0) out.cvBadDebtBasis = BK_CV_LEGACY.cvBadDebtBasis;
  out.isDevelopment = /develop/i.test(String(s.dealType || ''));
  out.scope = out.isDevelopment ? 'development' : 'acquisition';
  if(out.isDevelopment){
    Object.keys(BK_CV_LEGACY).forEach(function(k){ out[k] = BK_CV_LEGACY[k]; });
    out.legacyFields = Object.keys(BK_CV_LEGACY);
  }
  out.isLegacy = out.legacyFields.length === Object.keys(BK_CV_LEGACY).length;
  out.isStandard = Object.keys(BK_CV_STANDARD).every(function(k){ return out[k] === BK_CV_STANDARD[k]; });
  return out;
}
window.bkConventions = bkConventions; window.BK_CV_STANDARD = BK_CV_STANDARD; window.BK_CV_LEGACY = BK_CV_LEGACY;
/* What the acquisition LTV test is measured against, in words, for labels. */
window.bkLtvBasisLabel = function(s, short){
  var b = bkConventions(s || bkLoad()).cvLtvBasis;
  if(b === 'price')  return 'purchase price';
  if(b === 'lesser') return short ? 'lesser of price / value' : 'lesser of purchase price and underwritten value';
  return short ? 'underwritten value' : 'underwritten value (Year-1 NOI \u00f7 exit cap)';
};
function bkLoad(){try{const st=JSON.parse(localStorage.getItem(BK_STORE)||'{}');return Object.assign({},BK_BASE,(st&&st._template&&st._template.values)||{},st)}catch(e){return {...BK_BASE}}}
// bkSave strips any field that is still exactly equal to its current BK_BASE default before
// writing to storage. This matters because every bkEnsureVxx()/blur-handler save pattern in this
// file does `const s=bkLoad(); ...one field...; bkSave(s)` -- and bkLoad() ALREADY merges every
// accumulated BK_BASE default into `s` in memory. Without this guard, the first save after ANY
// unrelated single-field edit (a rollover-assumption tweak, a brand-new ensure field like
// minDebtYield, a plain cell edit) permanently bakes dozens of irrelevant BK_BASE defaults --
// including whole Development-module fields on a pure Acquisition deal -- into the saved record.
// That never changes a computed result (bkLoad() would re-derive the identical default anyway),
// but it silently freezes those fields to today's BK_BASE snapshot, immune to any future default
// change, and pollutes the saved JSON with fields the deal never actually uses. Stripping
// still-at-default fields keeps the persisted record sparse -- exactly the fields a user (or a
// deliberate app default like rentRoll/rolloverAssumptions, which aren't BK_BASE keys) actually
// set -- with zero effect on any read path, since bkLoad() fills the same default back in either way.
function bkSave(d){
  const out={};
  /* A field is omitted only when it equals the default bkLoad() would restore for THIS deal: the
     deal's own template value when it has one, otherwise BK_BASE. Comparing against BK_BASE alone
     would drop, e.g., a 50% GP share typed onto a deal whose template default is 10%, and bkLoad()
     would then bring back 10%. For deals whose template values equal BK_BASE this is unchanged. */
  const tv=(d && d._template && d._template.values) || {};
  for(const k in d){
    const hasDef = Object.prototype.hasOwnProperty.call(tv,k) || (k in BK_BASE);
    const def = Object.prototype.hasOwnProperty.call(tv,k) ? tv[k] : BK_BASE[k];
    if(!hasDef || d[k]!==def) out[k]=d[k];
  }
  localStorage.setItem(BK_STORE,JSON.stringify(out));
}
// V26 global numeric-display rule: a rendered calculation must never show NaN/Infinity/undefined,
// and negative zero (-0) must normalize to 0. bkFmt/bkPct/bkVal are the near-universal choke points
// every sheet's money()/pct display routes through (directly or via a local `money=n=>bkFmt(n)`
// wrapper), so fixing them here fixes the display defect app-wide without touching per-sheet code.
// This is a DISPLAY-layer fix only - it never changes a stored value or an upstream calculation;
// a genuinely non-finite result still indicates a real engine/input problem upstream, it's just no
// longer rendered as literal garbage text.
function bkNormZero(n){ return n===0 ? 0 : n; } // collapses -0 to +0 without touching any other value
function bkFmt(n){ n=Number(n); if(!isFinite(n)) return '-'; return bkNormZero(Math.round(n)+0).toLocaleString('en-US'); }
function bkPct(n){ n=Number(n); if(!isFinite(n)) return '-'; return (bkNormZero(n+0)*100).toFixed(2)+'%'; } // two decimals: a 6.75% coupon must never read 6.8% (or, once the table normalizer pads it, 6.80%)
function bkEsc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function bkVal(key,fmt){const s=bkLoad(),v=s[key];
  if(fmt==='money'||fmt==='pct'||fmt==='num'){
    const n=Number(v);
    if(v==null || v==='' || !isFinite(n)) return fmt==='pct' ? '-' : '-';
    if(fmt==='money') return '$'+bkNormZero(n+0).toLocaleString('en-US');
    if(fmt==='pct') return (bkNormZero(n+0)*100).toFixed(2)+'%';
    return bkNormZero(n+0).toLocaleString('en-US');
  }
  return bkEsc(v);
}
function bkInput(label,key,unit,fmt='num'){const a=(fmt==='text')?((key==='closing')?'num':'text'):'num'; return `<tr class="input" data-bk-key="${key}" data-bk-fmt="${fmt}"><td class="rowlabel" data-bk-align="text">${label}</td><td class="v" data-bk-align="${a}">${bkVal(key,fmt)}</td><td data-bk-align="text">${unit||''}</td><td data-bk-align="text">${bkTemplateChip(key)}</td></tr>`}
/* V32.1: a value that was pre-filled from an assumption template (not entered for this property) is labelled as such until it is edited. */
function bkTemplateChip(key){try{const s=bkLoad(),t=s._template;if(t&&t.values&&Object.prototype.hasOwnProperty.call(t.values,key)&&s[key]===t.values[key])return '<span class="status-chip warn">TEMPLATE</span>';}catch(e){}return '<span class="status-chip pass">OK</span>';}
// V29 Deal Underwrite input-control audit: three small, additive helpers that replicate the
// EXACT safe dropdown pattern already used by Revenue Basis / Rent Applied Basis (a plain <select
// onchange="bkSetField(...)">, deliberately NOT class="input" data-bk-key=... + td.v, so bkWire()'s
// generic contentEditable auto-wiring never double-attaches to these rows). No calculation logic
// changes -- these only change how an existing, already-engine-supported field is edited.
function bkSelect(label,key,options,unit){
  const s=bkLoad(); const cur=s[key];
  const opts=options.map(([val,txt])=>`<option value="${bkEsc(val)}" ${String(cur)===String(val)?'selected':''}>${bkEsc(txt)}</option>`).join('');
  return `<tr><td class="rowlabel">${label}</td><td class="v"><select onchange="bkSetField('${key}',this.value)">${opts}</select></td><td style="text-align:left">${unit||''}</td><td><span class="status-chip pass">OK</span></td></tr>`;
}
// Yes/No toggle for a field the engine already reads as a truthy/falsy 1-or-0 number (GP Catch-Up,
// Refinance at Stabilization) -- was previously a numeric bkInput requiring the user to know that
// typing "1" or "0" means Yes/No.
function bkYesNo(label,key,unit){
  const s=bkLoad(); const on=!!Number(s[key]);
  return `<tr><td class="rowlabel">${label}</td><td class="v"><select onchange="bkSetField('${key}',this.value)">
    <option value="0" ${!on?'selected':''}>No</option>
    <option value="1" ${on?'selected':''}>Yes</option>
  </select></td><td style="text-align:left">${unit||''}</td><td><span class="status-chip pass">OK</span></td></tr>`;
}
// Interest-Only No/Yes toggle for a field the engine already reads as a continuous IO-period year
// count where 0 means "no IO" (Acq/Permanent Loan IO) -- was previously a bare "years" numeric
// field forcing the user to understand that 0 years means "No". Selecting "Yes" reveals a
// conditional numeric years field (defaulting to defaultYears the first time, never overwriting an
// existing nonzero value); selecting "No" zeroes it. The underlying field and its unit convention
// are unchanged -- this is purely a display/entry convenience over the same stored number.
window.bkIOToggleSet=function(key,val,defaultYears){
  const s=bkLoad();
  if(String(val)==='1'){ if(!(Number(s[key])>0)) s[key]=defaultYears; }
  else { s[key]=0; }
  bkSave(s); showSheet(currentSheet);
};
function bkIOToggle(label,key,defaultYears){
  const s=bkLoad(); const yrs=Number(s[key])||0; const on=yrs>0;
  let html=`<tr><td class="rowlabel">${label}</td><td class="v"><select onchange="bkIOToggleSet('${key}',this.value,${defaultYears})">
    <option value="0" ${!on?'selected':''}>No</option>
    <option value="1" ${on?'selected':''}>Yes</option>
  </select></td><td style="text-align:left"></td><td><span class="status-chip pass">OK</span></td></tr>`;
  if(on) html+=bkInput(label+' Period',key,'years');
  return html;
}
const _origDeal=sheetDealUnderwrite;
sheetDealUnderwrite=function(){const s=bkLoad(); const main=`
<div class="tbl-wrap"><table class="fin deal-underwrite-grid"><colgroup><col><col><col><col></colgroup><caption>Identity</caption><thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Data Type</th><th>Status</th></tr></thead><tbody>
${bkInput('Deal ID','dealId','Text','text')}${bkInput('Investment Name','name','Text','text')}${bkInput('Location','location','Text','text')}${bkSelect('Deal Type','dealType',[['Acquisition','Acquisition'],['Development','Development']],'Investment Type')}${bkSelect('Property Type','propertyType',[['Multifamily','Multifamily'],['Office','Office'],['Retail','Retail'],['Industrial','Industrial'],['Mixed-Use','Mixed-Use'],['Hospitality','Hospitality'],['Self-Storage','Self-Storage'],['Senior Housing','Senior Housing'],['Medical Office','Medical Office'],['Land','Land']],'Property Type')}${bkSelect('Status','status',[['Pipeline','Pipeline'],['Under Contract','Under Contract'],['Owned','Owned'],['Sold','Sold'],['Dead','Dead']],'Deal Status')}${bkInput('Acquisition / Land Closing Date','closing','Date','text')}
</tbody></table></div>
<div class="tbl-wrap" style="margin-top:16px;"><table class="fin deal-underwrite-grid"><colgroup><col><col><col><col></colgroup><caption>Program</caption><thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr></thead><tbody>
${bkInput('Rentable Units','units','units')}${bkInput('Gross Building Area','gsf','GSF')}${bkInput('Commercial Area','commercialArea','NRSF')}${bkInput('Parking Spaces','parking','spaces')}${bkInput('Site Area','siteArea','acres')}<tr><td class="rowlabel">Average Unit Size</td><td class="v" style="background:#f7f7f5;color:#333;">${(Number(s.units)>0 && Number(s.gsf)>0) ? (Number(s.gsf)/Number(s.units)).toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:1}) : '-'}</td><td style="text-align:left">GSF / unit</td><td><span class="status-chip">CALC</span></td></tr>
</tbody></table></div>
<div class="tbl-wrap" style="margin-top:16px;"><table class="fin deal-underwrite-grid"><colgroup><col><col><col><col></colgroup><caption>Source Economics</caption><thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr></thead><tbody>
${bkInput('Purchase / Land Price','purchasePrice','$','money')}${bkInput('T-12 NOI (verified)','t12noi','$/yr','money')}${bkInput('Real Estate Taxes - Actual','taxes','$/yr','money')}${bkInput('Average Residential Rent','avgRent','$/unit/mo')}${bkInput('Commercial Base Rent','commercialRent','$/SF/yr')}${bkInput('Default Commercial Recovery','recovery','$/SF/yr')}${bkInput('Other Income','otherIncomePerUnit','$/unit/yr')}
</tbody></table></div>
<div class="tbl-wrap" style="margin-top:16px;"><table class="fin deal-underwrite-grid"><colgroup><col><col><col><col></colgroup><caption>Operating Assumptions</caption><thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr></thead><tbody>
${bkInput('Closing / Diligence Costs','closingCostsPct','% of price','pct')}${bkInput('Stabilized Vacancy - Residential','vacancy','%','pct')}${bkInput('Management Fees','mgmtPct','% of EGI','pct')}${bkInput('Insurance','insurance','$/building/yr','money')}${bkInput('Payroll & Benefits','payroll','$/building/yr','money')}${bkInput('Repairs & Maintenance','rm','$/building/yr','money')}${bkInput('Turnover / Make-Ready','turnover','$/building/yr','money')}${bkInput('Utilities (net of RUBS)','utilities','$/building/yr','money')}${bkInput('Contract Services','contract','$/building/yr','money')}${bkInput('Marketing & Advertising','marketing','$/building/yr','money')}${bkInput('General & Administrative','ga','$/building/yr','money')}${bkInput('Replacement Reserves','reserves','$/building/yr','money')}${bkInput('Pre-Leased / In-Place Occupancy','occupancy','%','pct')}
</tbody></table></div>
<div class="tbl-wrap" style="margin-top:16px;"><table class="fin deal-underwrite-grid"><colgroup><col><col><col><col></colgroup><caption>Exit & Hold</caption><thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr></thead><tbody>${bkInput('Exit Capitalization Rate','exitCap','%','pct')}${bkInput('Hold Period - TOTAL YEARS FROM ACQUISITION','holdYears','years')}</tbody></table></div>`;
const sidebar=sidebarShell(`${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Inputs</span></div>`)}${colorKeyCard()}`);
return {title:'Deal Underwrite',crumbs:'Inputs',desc:'All deal inputs - the single authoritative source. Workbook-grounded V0.2 input slice.',meta:{Property:s.name,'Asset Class':s.propertyType,Location:s.location,'Start Date':s.closing,Stabilization:'Year 1',Currency:'USD'},main,sidebar};};

sheetOperatingUnderwrite=function(){const s=bkLoad(),c=bkCalc(); const money=n=>n<0?'($'+bkFmt(-n)+')':'$'+bkFmt(n); const main=`
<div class="tbl-wrap"><table class="fin"><caption>Revenue - Year 1 Stabilized</caption><thead><tr><th class="rowlabel-h">Line Item</th><th>Annual ($)</th><th>% of GPR</th></tr></thead><tbody>
<tr><td class="rowlabel">Gross Potential Rent - Residential</td><td>${money(c.gpr)}</td><td>100.0%</td></tr><tr><td class="rowlabel">Less: Vacancy - Residential</td><td>${money(c.vacancy)}</td><td>${bkPct(Number(s.vacancy))}</td></tr><tr><td class="rowlabel">Less: Bad Debt / Credit Loss</td><td>${money(c.bad)}</td><td>${bkPct(c.gpr?-c.bad/c.gpr:0)}</td></tr><tr class="subtotal"><td class="rowlabel">Net Residential Income</td><td>${money(c.netRes)}</td><td>-</td></tr><tr><td class="rowlabel">Commercial Base Rent</td><td>${money(c.commercial)}</td><td>-</td></tr><tr><td class="rowlabel">Expense Recoveries (NNN)</td><td>${money(c.recovery)}</td><td>-</td></tr><tr><td class="rowlabel">Other Income / Reimbursements</td><td>${money(c.other)}</td><td>-</td></tr><tr class="grandtotal"><td class="rowlabel">Effective Gross Income</td><td>${money(c.egi)}</td><td>100.0%</td></tr></tbody></table></div>
<div class="tbl-wrap" style="margin-top:16px;"><table class="fin"><caption>Expenses</caption><thead><tr><th class="rowlabel-h">Line Item</th><th>Annual ($)</th><th style="text-align:left">Basis</th></tr></thead><tbody>
<tr><td class="rowlabel">Real Estate Taxes</td><td>${money(Number(s.taxes))}</td><td style="text-align:left">Workbook input</td></tr><tr><td class="rowlabel">Insurance</td><td>${money(Number(s.insurance))}</td><td style="text-align:left">Workbook input</td></tr><tr><td class="rowlabel">Utilities</td><td>${money(Number(s.utilities))}</td><td style="text-align:left">Workbook input</td></tr><tr><td class="rowlabel">Repairs & Maintenance</td><td>${money(Number(s.rm))}</td><td style="text-align:left">Workbook input</td></tr><tr><td class="rowlabel">Contract Services</td><td>${money(Number(s.contract))}</td><td style="text-align:left">Workbook input</td></tr><tr><td class="rowlabel">Payroll & Benefits</td><td>${money(Number(s.payroll))}</td><td style="text-align:left">Workbook input</td></tr><tr><td class="rowlabel">Turnover & Make-Ready</td><td>${money(Number(s.turnover))}</td><td style="text-align:left">Workbook input</td></tr><tr><td class="rowlabel">Marketing & Advertising</td><td>${money(Number(s.marketing))}</td><td style="text-align:left">Workbook input</td></tr><tr><td class="rowlabel">General & Administrative</td><td>${money(Number(s.ga))}</td><td style="text-align:left">Workbook input</td></tr><tr><td class="rowlabel">Management Fee</td><td>${money(c.mgmt)}</td><td style="text-align:left">${bkPct(Number(s.mgmtPct))} of EGI</td></tr><tr><td class="rowlabel">Miscellaneous</td><td>${money(c.misc)}</td><td style="text-align:left">Engine</td></tr><tr class="grandtotal"><td class="rowlabel">Total Expenses</td><td>${money(c.total)}</td><td style="text-align:left">-</td></tr></tbody></table></div>
<div class="tbl-wrap" style="margin-top:16px;"><table class="fin"><tbody><tr class="subtotal"><td class="rowlabel">Net Operating Income</td><td>${money(c.noi)}</td></tr><tr><td class="rowlabel">Less: Replacement Reserves</td><td>${money(-Number(s.reserves))}</td></tr><tr class="grandtotal"><td class="rowlabel">NOI After Reserves</td><td>${money(c.after)}</td></tr></tbody></table></div>
<div class="note-flag"><span>&#10003;</span><div><b>V0.2 workbook tie-out baseline -</b> the current Excel file calculates Year-1 EGI of $1,118,682, total expenses of $603,374 and NOI of $515,308. With untouched V0.2 inputs, this page reproduces that baseline; edits recalculate locally in the browser.</div></div>`;
const sidebar=sidebarShell(`<div class="card"><div class="card-head">Key Metrics</div><div class="metric-list"><div class="metric-row"><span class="k">EGI</span><span class="v">$${bkFmt(c.egi)}</span></div><div class="metric-row"><span class="k">Total Expenses</span><span class="v">$${bkFmt(c.total)}</span></div><div class="metric-row"><span class="k">Expense Ratio</span><span class="v">${bkPct(c.expenseRatio)}</span></div><div class="metric-row"><span class="k">NOI (Y1)</span><span class="v pos">$${bkFmt(c.noi)}</span></div><div class="metric-row"><span class="k">Implied Value</span><span class="v">$${bkFmt(c.value)}</span></div></div></div>${modelInfoCard(`<div class="metric-row"><span class="k">Tab Group</span><span class="v">Property Ops</span></div>`)}${colorKeyCard()}`);
return {title:'Operating Underwrite',crumbs:'Property Operations',desc:'Year-1 stabilized operating statement - first live workbook-grounded calculation chain.',meta:{Property:s.name,'Asset Class':s.propertyType,Location:s.location,Basis:'Year 1 $',Currency:'USD',Status:'Live'},main,sidebar};};

// V30 strict input parse. Previously parseFloat(t)||0 silently turned any typo into 0 and
// accepted trailing junk ("10000000$0" -> 100000000). Now a malformed entry returns NaN and the
// blur handler rejects it (cell reverts to the stored value). Blank still means 0, as before.
// Accepted: optional $, thousands commas, decimals, leading '-' or accounting parentheses, trailing %.
function bkParse(el){const raw=el.textContent.replace(/\u00a0/g,' ').trim(); const fmt=el.closest('tr')?.dataset.bkFmt;
  if(fmt==='text')return raw;
  if(raw==='')return 0;
  const m=raw.match(/^(\()?\s*(-)?\s*\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)\s*(%)?\s*(\))?$/);
  if(!m || (!!m[1]!==!!m[5])) return NaN;
  let n=parseFloat(m[3].replace(/,/g,'')); if(m[1]||m[2]) n=-n;
  return fmt==='pct' ? n/100 : n;}
function bkWire(){document.querySelectorAll('#viewport tr.input[data-bk-key] td.v').forEach(el=>{if(el.dataset.bkWired==='1')return;el.dataset.bkWired='1';el.contentEditable='true';el.spellcheck=false;
  // V30: spreadsheet behaviour - entering a cell selects its contents, so typing replaces the
  // displayed value instead of being prepended to it ("$0" + "5000" used to become "5000$0").
  const selAll=()=>{const r=document.createRange();r.selectNodeContents(el);const sel=getSelection();sel.removeAllRanges();sel.addRange(r);};
  el.addEventListener('mousedown',e=>{if(document.activeElement!==el){e.preventDefault();el.focus();selAll();}});
  el.addEventListener('focus',selAll);
  el.addEventListener('blur',()=>{const row=el.closest('tr'),s=bkLoad(),v=bkParse(el);
    if(typeof v==='number'&&!isFinite(v)){el.dataset.bkInvalid='1';el.title='Not a valid number - entry rejected, value unchanged';showSheet(currentSheet);return;}
    s[row.dataset.bkKey]=v;bkSave(s);showSheet(currentSheet);});
  el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();el.blur();}if(e.key==='Escape'){e.preventDefault();el.dataset.bkEsc='1';showSheet(currentSheet);}})});}
const _showV02=showSheet;showSheet=function(sheet){_showV02(sheet);setTimeout(bkWire,0)};
showSheet(currentSheet||'Deal Underwrite');
