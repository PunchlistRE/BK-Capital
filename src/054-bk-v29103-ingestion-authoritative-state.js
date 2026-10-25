
(function(){'use strict';
let currentStage=false;
function el(id){return document.getElementById(id)}
function hasFile(){const f=el('bkSourceFile');return !!(f&&f.files&&f.files.length)}
function decisions(){try{const a=JSON.parse(localStorage.getItem(BK_SOURCE_DECISIONS)||'[]');return Array.isArray(a)&&a.length>0}catch(e){return false}}
function cloud(){try{const p=JSON.parse(localStorage.getItem(BK_SOURCE_STORE)||'null');return !!(currentStage&&p&&(p.cloudLineage||p.cloud||p.lineage))}catch(e){return false}}
function set(id,on,title){const b=el(id);if(!b)return;b.disabled=!on;b.setAttribute('aria-disabled',String(!on));b.title=title||''}
function sync(){
 const selected=hasFile(), f=el('bkSourceFile');
 set('bkReadSourceBtn',selected,selected?'Read selected source':'Choose a source file first');
 set('bkShowStagedBtn',currentStage,currentStage?'Show current staged source':'Read the selected source first');
 set('bkIngestionQABtn',currentStage,currentStage?'Run QA on current staged source':'Read the selected source first');
 set('bkDecisionLogBtn',decisions(),decisions()?'View recorded source decisions':'No source decisions recorded');
 set('bkCloudLineageBtn',cloud(),cloud()?'Verify current cloud lineage':'No current cloud lineage');
 const m=el('bkIngestMsg'); if(m&&!currentStage){
  if(selected)m.textContent='Source selected: '+f.files[0].name+'. Click READ SOURCE to stage it.';
  else m.textContent='No file selected in this session. Choose a source file to begin.';
 }
}
function bind(){const f=el('bkSourceFile');if(f&&!f.__bk29103){f.__bk29103=true;f.addEventListener('change',function(){currentStage=false;sync()});}sync()}
const originalIngest=window.bkIngestSourceFile;
if(typeof originalIngest==='function') window.bkIngestSourceFile=async function(){
 if(!hasFile()){currentStage=false;sync();return;}
 currentStage=false;sync();
 await originalIngest.apply(this,arguments);
 try{const p=JSON.parse(localStorage.getItem(BK_SOURCE_STORE)||'null');currentStage=!!p}catch(e){currentStage=false}
 sync();
};
const originalSheet=window.sheetSourceIngestion;
if(typeof originalSheet==='function'){const wrapped=function(){const o=originalSheet.apply(this,arguments);setTimeout(bind,0);return o};window.sheetSourceIngestion=wrapped;if(window.RENDERERS)window.RENDERERS['Source Ingestion']=wrapped;}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(bind,0));else setTimeout(bind,0);
})();
