
/* V29.10.0 - live-source ingestion hardening discovered during real Yardi T-12 smoke test.
   UI/report-classification/QA only. No financial calculation formulas are changed. */
(function(){
'use strict';
const BK_V2910='V29.10.0';
function esc(v){return (typeof bkEsc==='function'?bkEsc(v):String(v==null?'':v));}
function loadPkg(){try{return JSON.parse(localStorage.getItem(BK_SOURCE_STORE)||'null')}catch(e){return null}}
function savePkg(p){try{localStorage.setItem(BK_SOURCE_STORE,JSON.stringify(p));return true}catch(e){return false}}
function canon(v){return String(v==null?'':v).toUpperCase().replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function classify(pkg){
  if(!pkg)return null;
  const fn=canon(pkg.fileName), facts=Array.isArray(pkg.normalizedFacts)?pkg.normalizedFacts:[], labels=facts.map(f=>canon(f.label)).join(' | ');
  let type='EXCEL / UNKNOWN';
  if(/TRAILING 12|TRAILING12|T 12|T12/.test(fn)||(/EFFECTIVE GROSS INCOME/.test(labels)&&/NET OPERATING INCOME|NOI/.test(labels))) type='YARDI T-12';
  else if((pkg.rentRollRows||[]).length>0||/RENT ROLL/.test(fn)) type='YARDI RENT ROLL';
  else if(/GENERAL LEDGER|\bGL\b/.test(fn)) type='YARDI GL';
  const inv=Array.isArray(pkg.sheetInventory)?pkg.sheetInventory:[], matched=inv.filter(x=>x.propertyMatched);
  let scope='REVIEW', reason='Active property is not explicitly identified by worksheet/header evidence.';
  if(matched.length===1){scope='PROPERTY';reason='One worksheet/header explicitly identifies the active property.';}
  else if(matched.length>1){scope='PROPERTY';reason='Multiple worksheets explicitly identify the active property.';}
  else if(facts.some(f=>f.scope==='PORTFOLIO/GROUP')){scope='PORTFOLIO/GROUP';reason='Source contains portfolio/group sections and no explicit active-property identity.';}
  pkg.reportClassification={version:BK_V2910,type,scope,reason,propertyMatchedSheets:matched.map(x=>x.sheetName),classifiedAt:new Date().toISOString()};
  return pkg;
}
function refreshControls(){
  const staged=!!loadPkg();
  const selectors=[
    ['button[onclick="bkRenderStoredSource()"]','SHOW STAGED'],
    ['button[onclick="bkRenderSourceDecisions()"]','DECISION LOG'],
    ['button[onclick="bkRunIngestionQA()"]','RUN INGESTION QA']
  ];
  selectors.forEach(([sel,label])=>{const b=document.querySelector(sel);if(!b)return;b.disabled=!staged;b.style.opacity=staged?'1':'.48';b.style.cursor=staged?'pointer':'not-allowed';b.style.color=staged?'white':'var(--ink-400)';b.style.background=staged?'var(--navy-900)':'var(--surface)';b.style.borderColor=staged?'var(--navy-900)':'var(--line)';b.setAttribute('aria-disabled',staged?'false':'true');b.title=staged?(label==='RUN INGESTION QA'?'Next recommended step after staging':'Available because a source package is staged'):'Read a source file first';});
}
const oldRender=window.bkRenderSourcePackage;
window.bkRenderSourcePackage=function(pkg){
  pkg=classify(pkg)||pkg; if(pkg)savePkg(pkg);
  const r=oldRender(pkg);
  const sum=document.getElementById('bkIngestSummary'), c=pkg&&pkg.reportClassification;
  if(sum&&c){
    const box=document.createElement('div');box.className='tbl-wrap';box.style.marginBottom='16px';
    box.innerHTML=`<table class="fin"><caption>Report Classification - V29.10 live gate</caption><thead><tr><th class="rowlabel-h">Metric</th><th data-bk-align="left">Result</th></tr></thead><tbody><tr><td class="rowlabel">Detected report type</td><td data-bk-align="left">${esc(c.type)}</td></tr><tr><td class="rowlabel">Source scope</td><td data-bk-align="left"><span class="status-chip ${c.scope==='PROPERTY'?'pass':'warn'}">${esc(c.scope)}</span></td></tr><tr><td class="rowlabel">Property evidence</td><td data-bk-align="left">${esc(c.reason)}</td></tr><tr><td class="rowlabel">Write authority</td><td data-bk-align="left">${c.scope==='PROPERTY'?'Approval gates still required':'NONE - REVIEW ONLY'}</td></tr></tbody></table>`;
    sum.insertBefore(box,sum.firstChild);
  }
  refreshControls(); return r;
};
const oldIngest=window.bkIngestSourceFile;
window.bkIngestSourceFile=async function(){
  await oldIngest();
  let pkg=loadPkg(); if(pkg){pkg=classify(pkg);savePkg(pkg);window.bkRenderSourcePackage(pkg);const msg=document.getElementById('bkIngestMsg');if(msg){const c=pkg.reportClassification;msg.textContent+=` Report: ${c.type}; scope: ${c.scope}.`;}}
  refreshControls();
};
window.bkRunIngestionQA=function(){
  const out=document.getElementById('bkIngestQA'),pkg=loadPkg(),tests=[],t=(name,pass,detail)=>tests.push({name,pass:!!pass,detail:detail||''});
  t('Frozen engine boundary',typeof bkCalc==='function','Existing bkCalc calculation entry point remains present');
  t('Staged package available',!!pkg,pkg?`${(pkg.sheetNames||[]).length} worksheet(s)`:'Read a source file first');
  if(pkg){
    const facts=pkg.normalizedFacts||[],cs=pkg.candidates||[],rr=pkg.rentRollRows||[],c=pkg.reportClassification||classify(pkg).reportClassification;
    t('Raw rows preserved',Array.isArray(pkg.rawRows)&&pkg.rawRows.length>0,`${(pkg.rawRows||[]).length} raw row(s)`);
    t('All worksheets preserved',Array.isArray(pkg.sheetInventory)&&pkg.sheetInventory.length===(pkg.sheetNames||[]).length,`${(pkg.sheetInventory||[]).length}/${(pkg.sheetNames||[]).length}`);
    t('Report type classified',!!c&&c.type!=='EXCEL / UNKNOWN',c?c.type:'missing');
    t('Active identity captured',!!pkg.activeIdentity&&typeof pkg.activeIdentity==='object',pkg.activeIdentity?`${pkg.activeIdentity.dealId||'-'} / ${pkg.activeIdentity.name||'-'}`:'missing');
    t('Every normalized fact has lineage',facts.every(f=>f.sourceRow&&f.sourceRef&&f.label),`${facts.length} fact(s)`);
    t('Rent-roll staging is non-writing',rr.every(x=>!Object.prototype.hasOwnProperty.call(x,'writeback')),`${rr.length} rent-roll row(s)`);
    t('Group candidates cannot approve',cs.filter(x=>x.scope==='PORTFOLIO/GROUP').every(x=>!x.eligible),'group facts are review-only');
    t('Unresolved candidates cannot approve',cs.filter(x=>x.scope==='UNRESOLVED').every(x=>!x.eligible),'unresolved facts are review-only');
    t('Reconciliation outputs cannot approve',cs.filter(x=>x.targetKind==='RECONCILIATION').every(x=>!x.eligible),'EGI / OpEx / NOI are checks only');
    t('Eligible candidates require PROPERTY scope',cs.filter(x=>x.eligible).every(x=>x.scope==='PROPERTY'),`${cs.filter(x=>x.eligible).length} eligible candidate(s)`);
    t('No approval when report scope is not PROPERTY',c.scope==='PROPERTY'||cs.every(x=>!x.eligible),`${c.scope}; ${cs.filter(x=>x.eligible).length} eligible`);
    t('No automatic underwriting writes',!pkg.writeback&&cs.every(x=>x.disposition!=='AUTO'),'automatic writes = 0');
    t('Candidate lineage preserved',cs.every(x=>x.sourceRef&&x.sourceRow),`${cs.length} candidate(s)`);
    const decisions=(typeof bkSourceDecisions==='function'?bkSourceDecisions():[]),ids=decisions.map(x=>x.candidateId);
    t('Decision log de-duplicated',ids.length===new Set(ids).size,`${decisions.length} decision(s)`);
  }
  const pass=tests.filter(x=>x.pass).length;
  if(out)out.innerHTML=`<div class="tbl-wrap"><table class="fin"><caption>Ingestion QA - ${pass}/${tests.length} PASS</caption><thead><tr><th class="rowlabel-h">Test</th><th data-bk-align="left">Status</th><th data-bk-align="left">Detail</th></tr></thead><tbody>${tests.map(x=>`<tr><td class="rowlabel">${esc(x.name)}</td><td data-bk-align="left"><span class="status-chip ${x.pass?'pass':'fail'}">${x.pass?'PASS':'FAIL'}</span></td><td data-bk-align="left">${esc(x.detail)}</td></tr>`).join('')}</tbody></table></div>`;
  return {passed:pass,total:tests.length,tests};
};
const oldSheet=window.sheetSourceIngestion;
if(typeof oldSheet==='function'){
  const wrapped=function(){const o=oldSheet();o.meta=Object.assign({},o.meta||{},{Status:'Live Ingestion Gate'});setTimeout(refreshControls,0);return o;};
  window.sheetSourceIngestion=wrapped; if(window.RENDERERS)window.RENDERERS['Source Ingestion']=wrapped;
}
setTimeout(refreshControls,0);
})();
