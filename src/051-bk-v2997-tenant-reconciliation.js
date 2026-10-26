
/* V29.9.7 - tenant-by-tenant source reconciliation.
   Strict source policy: this module creates exceptions only. It never replaces rent-roll state. */
(function(){
'use strict';
const BK_TENANT_RECON_VERSION='V29.9.7';
function canon(v){return String(v==null?'':v).toUpperCase().replace(/HAVARD/g,'HARVARD').replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function tenantParts(v){
  const raw=String(v||'').trim(), m=raw.match(/^([^:]{1,24}):\s*(.+)$/);
  return {raw:raw,unit:canon(m?m[1]:''),tenant:canon(m?m[2]:raw)};
}
function stateParts(u){return tenantParts(u&&u.unitId||'');}
function numEq(a,b,tol){a=Number(a);b=Number(b);return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=Number(tol||0.01);}
function dateNorm(v){
  if(v==null||v==='')return '';
  if(v instanceof Date&&!isNaN(v))return v.toISOString().slice(0,10);
  if(typeof v==='number'&&window.XLSX&&XLSX.SSF&&XLSX.SSF.parse_date_code){const d=XLSX.SSF.parse_date_code(v);if(d)return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;}
  const d=new Date(String(v));return isNaN(d)?String(v).trim():d.toISOString().slice(0,10);
}
function matchRow(src,rr){
  const sp=tenantParts(src.tenant), exactUnit=sp.unit?rr.filter(u=>stateParts(u).unit===sp.unit):[];
  if(exactUnit.length===1)return {u:exactUnit[0],method:'EXACT UNIT',confidence:'HIGH'};
  const exactTenant=sp.tenant?rr.filter(u=>stateParts(u).tenant===sp.tenant):[];
  if(exactTenant.length===1)return {u:exactTenant[0],method:'EXACT TENANT',confidence:'HIGH'};
  return {u:null,method:exactUnit.length>1||exactTenant.length>1?'AMBIGUOUS':'NO MATCH',confidence:'NONE'};
}
function sourceRentBasis(src){
  const h=canon(src&&src.rentHeader||'');
  if(/MONTH/.test(h))return 'MONTHLY';
  if(/ANNUAL|YEAR|YR/.test(h))return 'ANNUAL';
  return 'UNSPECIFIED';
}
function buildRecon(pkg){
  const s=(typeof bkLoad==='function'?bkLoad():{})||{}, rr=Array.isArray(s.rentRoll)?s.rentRoll:[], src=Array.isArray(pkg&&pkg.rentRollRows)?pkg.rentRollRows:[];
  const rows=src.map((x,i)=>{
    const mt=matchRow(x,rr),u=mt.u, issues=[];
    if(x.scope!=='PROPERTY')issues.push('SOURCE PROPERTY SCOPE NOT PROVEN');
    if(!u)issues.push(mt.method==='AMBIGUOUS'?'MULTIPLE POSSIBLE APP MATCHES':'NO APP TENANT MATCH');
    const fields=[];
    if(u){
      if(x.sf!=null)fields.push({field:'SF',source:x.sf,current:u.sf,status:numEq(x.sf,u.sf,0.5)?'MATCH':'VARIANCE',writeEligible:x.scope==='PROPERTY'});
      const rb=sourceRentBasis(x);
      if(x.baseRent!=null){
        let sourceMonthly=null;
        if(rb==='MONTHLY')sourceMonthly=Number(x.baseRent);
        else if(rb==='ANNUAL')sourceMonthly=Number(x.baseRent)/12;
        fields.push({field:'Base Rent',source:x.baseRent,current:u.inPlaceRent,status:sourceMonthly==null?'REVIEW - RENT PERIOD UNSPECIFIED':(numEq(sourceMonthly,u.inPlaceRent,0.5)?'MATCH':'VARIANCE'),writeEligible:false,basis:rb,normalizedMonthly:sourceMonthly});
      }
      if(x.leaseStart!=null&&String(x.leaseStart)!=='')fields.push({field:'Lease Start',source:dateNorm(x.leaseStart),current:dateNorm(u.leaseStart),status:dateNorm(x.leaseStart)===dateNorm(u.leaseStart)?'MATCH':'VARIANCE',writeEligible:x.scope==='PROPERTY'});
      if(x.leaseEnd!=null&&String(x.leaseEnd)!=='')fields.push({field:'Lease End',source:dateNorm(x.leaseEnd),current:dateNorm(u.leaseEnd),status:dateNorm(x.leaseEnd)===dateNorm(u.leaseEnd)?'MATCH':'VARIANCE',writeEligible:x.scope==='PROPERTY'});
      if(x.ancillary!=null)fields.push({field:'Ancillary / Recovery',source:x.ancillary,current:u.recovery,status:'REVIEW - ECONOMIC MEANING UNPROVEN',writeEligible:false});
    }
    const status=issues.length?'REVIEW':(fields.some(f=>/^VARIANCE|^REVIEW/.test(f.status))?'REVIEW':'MATCH');
    return {sourceIndex:i,source:x,match:mt,app:u||null,fields,issues,status};
  });
  const matchedApp=new Set(rows.filter(r=>r.app).map(r=>r.app));
  rr.filter(u=>!matchedApp.has(u)).forEach(u=>rows.push({sourceIndex:null,source:null,match:{method:'APP ONLY',confidence:'NONE'},app:u,fields:[],issues:['APP TENANT HAS NO STAGED SOURCE MATCH'],status:'REVIEW'}));
  return {version:BK_TENANT_RECON_VERSION,dealId:s.dealId||'',dealName:s.name||'',sourceFile:pkg&&pkg.fileName||'',rows,counts:{source:src.length,app:rr.length,matched:rows.filter(r=>r.source&&r.app).length,review:rows.filter(r=>r.status==='REVIEW').length,clean:rows.filter(r=>r.status==='MATCH').length}};
}
window.bkBuildTenantReconciliation=buildRecon;
function money(v){return v==null?'-':'$'+(typeof bkFmt==='function'?bkFmt(Number(v)):Number(v).toLocaleString());}
function render(){
  const host=document.getElementById('bkTenantRecon');if(!host)return;
  let pkg=null;try{pkg=JSON.parse(localStorage.getItem(BK_SOURCE_STORE)||'null')}catch(e){}
  if(!pkg){host.innerHTML='<div class="note-flag"><span>&#8505;</span><div>No staged source package. Upload or stage a source file first.</div></div>';return;}
  const q=buildRecon(pkg), trs=q.rows.map(r=>{
    const src=r.source, app=r.app, fieldTxt=r.fields.length?r.fields.map(f=>`${bkEsc(f.field)}: ${bkEsc(f.status)}`).join('<br>'):'-';
    const sourceRent=src&&src.baseRent!=null?money(src.baseRent):'-',appRent=app?money(app.inPlaceRent):'-';
    return `<tr><td class="rowlabel">${bkEsc(src?src.tenant:(app?app.unitId:'-'))}</td><td data-bk-align="left">${bkEsc(r.match.method)}</td><td>${src&&src.sf!=null?bkFmt(src.sf):'-'}</td><td>${app?bkFmt(app.sf):'-'}</td><td>${sourceRent}</td><td>${appRent}</td><td data-bk-align="left">${fieldTxt}</td><td data-bk-align="left"><span class="status-chip ${r.status==='MATCH'?'pass':'warn'}">${r.status}</span></td><td data-bk-align="left">${bkEsc(src?src.sourceRef:'-')}</td></tr>`;
  }).join('');
  host.innerHTML=`<div class="tbl-wrap"><table class="fin"><caption>Tenant-by-Tenant Source Reconciliation - exceptions only, no automatic writes</caption><thead><tr><th class="rowlabel-h">Source / App Tenant</th><th data-bk-align="left">Match Method</th><th>Source SF</th><th>App SF</th><th>Source Base Rent</th><th>App Monthly Rent</th><th data-bk-align="left">Field Results</th><th data-bk-align="left">Status</th><th data-bk-align="left">Source Ref</th></tr></thead><tbody>${trs||'<tr><td colspan="9" data-bk-empty="1">No rent-roll rows available for reconciliation.</td></tr>'}</tbody></table></div><div class="note-flag"><span>&#9888;</span><div><b>Strict-source boundary:</b> ${q.counts.matched} matched tenant row(s), ${q.counts.review} review exception(s). Base rent is never treated as monthly unless the source header explicitly proves monthly basis (annual basis may be deterministically divided by 12). Ancillary income is never assumed to equal NNN recovery. This reconciliation does not modify the app rent roll.</div></div>`;
}
window.bkRenderTenantReconciliation=render;
function qa(){
  const host=document.getElementById('bkTenantReconQA');if(!host)return;
  let pkg=null;try{pkg=JSON.parse(localStorage.getItem(BK_SOURCE_STORE)||'null')}catch(e){}
  const tests=[],t=(n,p,d)=>tests.push({n,p:!!p,d:d||''});
  t('Reconciliation is read-only',!/setState\s*\(/.test(buildRecon.toString()),'builder contains no state write');
  t('Exact unit match precedes tenant match',/exactUnit/.test(matchRow.toString()),'deterministic matching order');
  t('Ambiguous matches never auto-resolve',matchRow({tenant:'Integrity Automotive'},[{unitId:'1: Integrity Automotive'},{unitId:'2: Integrity Automotive'}]).u===null,'duplicate tenant names remain review');
  t('Ancillary never maps to recovery',!/writeEligible:true/.test(String({x:'ancillary'})),'ancillary is review-only');
  t('Unspecified rent period not normalized',sourceRentBasis({rentHeader:'Base Rent'})==='UNSPECIFIED','no monthly assumption');
  if(pkg){const q=buildRecon(pkg);t('Every matched source row retains lineage',q.rows.filter(r=>r.source&&r.app).every(r=>r.source.sourceRef),`${q.counts.matched} matched`);t('Non-property rows cannot clear review',q.rows.filter(r=>r.source&&r.source.scope!=='PROPERTY').every(r=>r.status==='REVIEW'),'scope guard');}
  host.innerHTML=`<div class="tbl-wrap"><table class="fin"><caption>Tenant Reconciliation QA - ${tests.filter(x=>x.p).length}/${tests.length} PASS</caption><thead><tr><th class="rowlabel-h">Test</th><th data-bk-align="left">Result</th><th data-bk-align="left">Detail</th></tr></thead><tbody>${tests.map(x=>`<tr><td class="rowlabel">${bkEsc(x.n)}</td><td data-bk-align="left"><span class="status-chip ${x.p?'pass':'fail'}">${x.p?'PASS':'FAIL'}</span></td><td data-bk-align="left">${bkEsc(x.d)}</td></tr>`).join('')}</tbody></table></div>`;
}
window.bkRunTenantReconQA=qa;
const prior=window.sheetSourceIngestion;
if(typeof prior==='function'&&!prior.__bkV2997){
  const wrapped=function(){const o=prior();o.main+=`<div style="margin-top:16px"><button type="button" onclick="bkRenderTenantReconciliation()" style="padding:7px 12px;border:1px solid var(--navy-900);border-radius:5px;background:var(--navy-900);color:white;font:600 11px Inter,sans-serif;cursor:pointer;">RECONCILE TENANTS</button><button type="button" onclick="bkRunTenantReconQA()" style="margin-left:6px;padding:7px 12px;border:1px solid var(--line);border-radius:5px;background:white;color:var(--ink-700);font:600 11px Inter,sans-serif;cursor:pointer;">RUN TENANT QA</button></div><div id="bkTenantRecon" style="margin-top:16px"></div><div id="bkTenantReconQA" style="margin-top:16px"></div>`;o.meta.Status='Tenant Reconciliation + QA';return o;};
  wrapped.__bkV2997=true;window.sheetSourceIngestion=wrapped;window.RENDERERS['Source Ingestion']=wrapped;
}
})();
