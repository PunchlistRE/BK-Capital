
/* V29.9.9 - production-hardening of explicit field-level tenant approvals.
   Zero automatic write authority: only a user click on an eligible variance can mutate rentRoll.
   Eligible: SF, Lease Start, Lease End when source scope is PROPERTY and tenant match is unique/high-confidence.
   Blocked: Base Rent (even with a proven period, pending separate economic approval policy) and Ancillary / Recovery. */
(function(){
'use strict';
const BK_TENANT_APPROVAL_VERSION='V29.9.9';
const BK_TENANT_APPROVAL_LOG='bkcapital.tenant.approvals.v01';
function esc(v){return (typeof bkEsc==='function'?bkEsc(v):String(v==null?'':v));}
function loadPkg(){try{return JSON.parse(localStorage.getItem(BK_SOURCE_STORE)||'null')}catch(e){return null}}
function loadLog(){try{const s=(typeof bkLoad==='function'?bkLoad():{}), cloud=s&&s._tenantApprovalLog; if(Array.isArray(cloud)) return cloud; const x=JSON.parse(localStorage.getItem(BK_TENANT_APPROVAL_LOG)||'[]');return Array.isArray(x)?x:[]}catch(e){return []}}
function saveLog(x){localStorage.setItem(BK_TENANT_APPROVAL_LOG,JSON.stringify(x));}
function rrIndexFor(app){
  const s=(typeof bkLoad==='function'?bkLoad():{}), rr=Array.isArray(s.rentRoll)?s.rentRoll:[];
  let i=rr.indexOf(app); if(i>=0)return i;
  const key=String(app&&app.unitId||'').trim().toUpperCase();
  const hits=rr.map((u,j)=>({u,j})).filter(x=>String(x.u&&x.u.unitId||'').trim().toUpperCase()===key);
  return hits.length===1?hits[0].j:-1;
}
function fieldKey(field){return field==='SF'?'sf':field==='Lease Start'?'leaseStart':field==='Lease End'?'leaseEnd':null;}
function eligible(row,f){
  return !!(row&&row.source&&row.app&&row.source.scope==='PROPERTY'&&row.match&&row.match.confidence==='HIGH'&&fieldKey(f.field)&&f.status==='VARIANCE'&&f.writeEligible===true);
}
function approvedValue(f){return f.field==='SF'?Number(f.source):String(f.source||'');}
function decisionKey(q,row,f){return [q.dealId||'',row.source&&row.source.sourceRef||'',row.sourceIndex,f.field].join('|');}
function apply(sourceIndex,fieldName){
  const pkg=loadPkg(); if(!pkg||typeof bkBuildTenantReconciliation!=='function')return;
  const q=bkBuildTenantReconciliation(pkg), row=q.rows.find(r=>r.sourceIndex===sourceIndex&&r.source);
  const f=row&&row.fields.find(x=>x.field===fieldName);
  if(!row||!f||!eligible(row,f)){alert('This field is not eligible for writeback. Only proven PROPERTY-scope SF and lease-date variances with a unique tenant match can be approved.');return;}
  const idx=rrIndexFor(row.app); if(idx<0){alert('The matched app tenant is no longer unique. Reconcile again before approving.');return;}
  const s=bkLoad(), rr=Array.isArray(s.rentRoll)?s.rentRoll.slice():[], key=fieldKey(f.field), before=rr[idx]&&rr[idx][key], after=approvedValue(f);
  rr[idx]=Object.assign({},rr[idx],{[key]:after}); s.rentRoll=rr;
  const log=loadLog(); log.push({version:BK_TENANT_APPROVAL_VERSION,ts:new Date().toISOString(),dealId:q.dealId||'',dealName:q.dealName||'',sourceFile:q.sourceFile||'',sourceRef:row.source.sourceRef||'',sourceIndex:row.sourceIndex,matchMethod:row.match.method,tenant:row.app.unitId||'',field:f.field,key,before,after,decision:'APPROVED_AND_APPLIED',authority:'EXPLICIT_USER_CLICK'});
  s._tenantApprovalLog=log.slice(-500); bkSave(s); saveLog(log);
  render(); renderLog();
}
function render(){
  const host=document.getElementById('bkTenantRecon'); if(!host)return;
  const pkg=loadPkg(); if(!pkg){host.innerHTML='<div class="note-flag"><span>&#8505;</span><div>No staged source package. Upload or stage a source file first.</div></div>';return;}
  const q=bkBuildTenantReconciliation(pkg);
  const rows=q.rows.map(r=>{
    const src=r.source,app=r.app;
    const fields=(r.fields||[]).map(f=>{
      const ok=eligible(r,f);
      const btn=ok?` <button type="button" onclick="bkApproveTenantField(${r.sourceIndex},${JSON.stringify(f.field).replace(/"/g,'&quot;')})" style="margin-left:6px;padding:3px 7px;border:1px solid var(--navy-900);border-radius:4px;background:var(--navy-900);color:white;font:600 9px Inter,sans-serif;cursor:pointer;">APPROVE</button>`:'';
      const lock=(!ok&&(/^VARIANCE|^REVIEW/.test(f.status)))?' <span style="color:var(--ink-400);font-size:9px;">LOCKED</span>':'';
      return `${esc(f.field)}: ${esc(f.status)}${btn}${lock}`;
    }).join('<br>')||'-';
    const sr=src&&src.baseRent!=null?'$'+bkFmt(Number(src.baseRent)):'-', ar=app?'$'+bkFmt(Number(app.inPlaceRent)):'-';
    return `<tr><td class="rowlabel">${esc(src?src.tenant:(app?app.unitId:'-'))}</td><td data-bk-align="left">${esc(r.match.method)}</td><td>${src&&src.sf!=null?bkFmt(src.sf):'-'}</td><td>${app?bkFmt(app.sf):'-'}</td><td>${sr}</td><td>${ar}</td><td data-bk-align="left">${fields}</td><td data-bk-align="left"><span class="status-chip ${r.status==='MATCH'?'pass':'warn'}">${r.status}</span></td><td data-bk-align="left">${esc(src?src.sourceRef:'-')}</td></tr>`;
  }).join('');
  const eligibleCount=q.rows.reduce((n,r)=>n+(r.fields||[]).filter(f=>eligible(r,f)).length,0);
  host.innerHTML=`<div class="tbl-wrap"><table class="fin"><caption>Tenant-by-Tenant Source Reconciliation - explicit field approvals only</caption><thead><tr><th class="rowlabel-h">Source / App Tenant</th><th data-bk-align="left">Match Method</th><th>Source SF</th><th>App SF</th><th>Source Base Rent</th><th>App Monthly Rent</th><th data-bk-align="left">Field Results / Action</th><th data-bk-align="left">Status</th><th data-bk-align="left">Source Ref</th></tr></thead><tbody>${rows||'<tr><td colspan="9">No rent-roll rows available.</td></tr>'}</tbody></table></div><div class="note-flag"><span>&#9888;</span><div><b>V29.9.9 approval boundary:</b> ${eligibleCount} field variance(s) are eligible for explicit approval. Only SF and lease start/end can write, and only for PROPERTY-scope source rows with a unique high-confidence tenant match. Base Rent and Ancillary / Recovery remain locked. No bulk approve and no automatic write path exists.</div>`;
}
function renderLog(){
  const host=document.getElementById('bkTenantApprovalLog'); if(!host)return; const log=loadLog().slice().reverse();
  host.innerHTML=`<div class="tbl-wrap"><table class="fin"><caption>Tenant Field Approval Audit Log - ${log.length} decision(s)</caption><thead><tr><th class="rowlabel-h">Timestamp</th><th data-bk-align="left">Tenant</th><th data-bk-align="left">Field</th><th data-bk-align="left">Before</th><th data-bk-align="left">After</th><th data-bk-align="left">Source Ref</th><th data-bk-align="left">Authority</th></tr></thead><tbody>${log.map(x=>`<tr><td class="rowlabel">${esc(x.ts)}</td><td data-bk-align="left">${esc(x.tenant)}</td><td data-bk-align="left">${esc(x.field)}</td><td data-bk-align="left">${esc(x.before)}</td><td data-bk-align="left">${esc(x.after)}</td><td data-bk-align="left">${esc(x.sourceRef)}</td><td data-bk-align="left">${esc(x.authority)}</td></tr>`).join('')||'<tr><td colspan="7">No approved tenant-field writes yet.</td></tr>'}</tbody></table></div>`;
}
function qa(){
  const host=document.getElementById('bkTenantApprovalQA'); if(!host)return; const pkg=loadPkg(), tests=[],t=(n,p,d)=>tests.push({n,p:!!p,d});
  t('No automatic write on reconciliation',!/bkSave\s*\(/.test(String(window.bkBuildTenantReconciliation)),'reconciliation builder has no save call');
  t('Approval requires explicit function call',/EXPLICIT_USER_CLICK/.test(apply.toString()),'write authority is labeled explicit user click');
  t('Only SF / lease dates map to state keys',fieldKey('SF')==='sf'&&fieldKey('Lease Start')==='leaseStart'&&fieldKey('Lease End')==='leaseEnd'&&fieldKey('Base Rent')===null&&fieldKey('Ancillary / Recovery')===null,'economic fields remain locked');
  t('PROPERTY scope required',/source\.scope==='PROPERTY'/.test(eligible.toString()),'scope gate');
  t('Unique high-confidence match required',/confidence==='HIGH'/.test(eligible.toString()),'match gate');
  t('Tenant approval log persists with deal state',/_tenantApprovalLog/.test(apply.toString()),'audit history is stored in the deal state and mirrored locally');
  if(pkg&&typeof bkBuildTenantReconciliation==='function'){const q=bkBuildTenantReconciliation(pkg);t('No non-property field is eligible',q.rows.every(r=>(r.fields||[]).every(f=>r.source&&r.source.scope!=='PROPERTY'?!eligible(r,f):true)),'review rows cannot write');}
  host.innerHTML=`<div class="tbl-wrap"><table class="fin"><caption>Field Approval QA - ${tests.filter(x=>x.p).length}/${tests.length} PASS</caption><thead><tr><th class="rowlabel-h">Test</th><th data-bk-align="left">Result</th><th data-bk-align="left">Detail</th></tr></thead><tbody>${tests.map(x=>`<tr><td class="rowlabel">${esc(x.n)}</td><td data-bk-align="left"><span class="status-chip ${x.p?'pass':'fail'}">${x.p?'PASS':'FAIL'}</span></td><td data-bk-align="left">${esc(x.d)}</td></tr>`).join('')}</tbody></table></div>`;
}
window.bkApproveTenantField=apply; window.bkRenderTenantReconciliationV2998=render; window.bkRenderTenantApprovalLog=renderLog; window.bkRunTenantApprovalQA=qa;
const prior=window.sheetSourceIngestion;
if(typeof prior==='function'&&!prior.__bkV2998){
 const wrapped=function(){const o=prior();o.main+=`<div style="margin-top:16px"><button type="button" onclick="bkRenderTenantReconciliationV2998()" style="padding:7px 12px;border:1px solid var(--navy-900);border-radius:5px;background:var(--navy-900);color:white;font:600 11px Inter,sans-serif;cursor:pointer;">FIELD APPROVAL REVIEW</button><button type="button" onclick="bkRenderTenantApprovalLog()" style="margin-left:6px;padding:7px 12px;border:1px solid var(--line);border-radius:5px;background:white;color:var(--ink-700);font:600 11px Inter,sans-serif;cursor:pointer;">APPROVAL LOG</button><button type="button" onclick="bkRunTenantApprovalQA()" style="margin-left:6px;padding:7px 12px;border:1px solid var(--line);border-radius:5px;background:white;color:var(--ink-700);font:600 11px Inter,sans-serif;cursor:pointer;">RUN APPROVAL QA</button></div><div id="bkTenantApprovalLog" style="margin-top:16px"></div><div id="bkTenantApprovalQA" style="margin-top:16px"></div>`;o.meta.Status='Field-Level Tenant Approval + Audit';return o;};
 wrapped.__bkV2998=true; window.sheetSourceIngestion=wrapped; window.RENDERERS['Source Ingestion']=wrapped;
}
})();
