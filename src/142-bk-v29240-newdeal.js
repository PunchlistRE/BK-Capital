
/* V29.24.0 - START A NEW DEAL / CLEAR INPUTS, on Overview. Both ask first, say what they will do, and offer to save the current deal to the portfolio so nothing is lost. */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof RENDERERS['Home'] !== 'function') return;
var prev = RENDERERS['Home'];
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
var CSS = '.pl-toolbar{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin:0 0 6px}.pl-hbtn{background:var(--surface,#fff);border:1px solid #3E9AE6;color:#0e2a4a;border-radius:999px;padding:9px 16px;font:700 11.5px/1 Inter,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}'
 + '.pl-hbtn.primary{background:#0e2a4a;color:#fff;border-color:#0e2a4a}.pl-hbtn:hover{box-shadow:0 3px 10px rgba(16,25,34,.18)}.pl-hbtn.danger{border-color:#C0392B;color:#B23A2C}'
 + '#pl-modal{position:fixed;inset:0;z-index:2100;background:rgba(10,16,22,.55);display:none;align-items:center;justify-content:center;padding:16px}#pl-modal.open{display:flex}#pl-modal .box{width:min(520px,100%);background:var(--surface,#fff);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.35);border:1px solid var(--line,#dbe4ec);padding:22px 22px 18px}'
 + '#pl-modal h3{font:700 22px/1.2 "Schibsted Grotesk","Inter","Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;margin:0 0 6px;color:var(--ink-900,#10233a)}#pl-modal p{font-size:13px;line-height:1.55;color:var(--ink-500,#566a80);margin:0 0 12px}#pl-modal label.f{display:block;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;font-weight:700;color:var(--ink-500,#566a80);margin:10px 0 4px}'
 + '#pl-modal input.left,#pl-modal select.left{text-align:left!important;text-align-last:left!important}#pl-modal input[type=text],#pl-modal select{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid var(--line,#dbe4ec);border-radius:8px;font:14px Inter,system-ui,sans-serif;background:#fff;text-align:right;text-align-last:right}#pl-modal .chk{display:flex;gap:8px;align-items:flex-start;font-size:13px;margin:12px 0 2px}#pl-modal .btns{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}';
var st = document.createElement('style'); st.id = 'pl-newdeal-css'; st.textContent = CSS; document.head.appendChild(st);
function modal(html){ var m = document.getElementById('pl-modal'); if(!m){ m = document.createElement('div'); m.id = 'pl-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); document.body.appendChild(m);
    m.addEventListener('mousedown', function(e){ if(e.target === m) closeModal(); }); m.addEventListener('keydown', function(e){ if(e.key === 'Escape'){ e.stopPropagation(); closeModal(); } }); }
  m.innerHTML = '<div class="box">' + html + '</div>'; m.classList.add('open'); var f = m.querySelector('input[type=text],button.primary,button'); if(f) setTimeout(function(){ f.focus(); }, 0); }
function closeModal(){ var m = document.getElementById('pl-modal'); if(m) m.classList.remove('open'); }
window.bkModal = modal;
window.bkModalClose = closeModal;
function active(){ return typeof window.bkHasActiveDeal === 'function' ? window.bkHasActiveDeal() : true; }
function saveFirstBox(label){ var s = active() ? safe(function(){ return bkLoad(); }, null) : null; if(!s || !(s.name || s.dealId)) return ''; return '<label class="chk"><input type="checkbox" id="pl-save1" checked> <span>' + label + ' <b>' + esc(s.name || s.dealId) + '</b> to the portfolio first</span></label>'; }
function snapshot(){ var cb = document.getElementById('pl-save1'); if(cb && cb.checked && typeof bkPortfolioAddCurrent === 'function'){ try { bkPortfolioAddCurrent(); } catch(e){} } }

/* New deal: the analysis is picked on the front door's cards (or here, from the registry's live analyses); the dialog asks for the name only */
function analysisOptions(sel){ var R = window.BKReg; return (R ? R.analyses() : []).map(function(a){ return '<option value="' + a.id + '"' + (a.live ? '' : ' disabled') + (a.id === sel ? ' selected' : '') + '>' + esc(a.name) + (a.live ? '' : ' (in development)') + '</option>'; }).join(''); }
window.bkStartAnalysis = function(id){ var R = window.BKReg, a = R && R.analysis(id); if(!a || !a.live) return; window.bkNewDealDialog(id); };
window.bkNewDealDialog = function(id){
  var R = window.BKReg, a = R && id ? R.analysis(id) : null;
  modal('<h3>' + (a ? 'New ' + esc(a.name) : 'Start a new analysis') + '</h3><p>' + (a ? esc(a.q) + ' ' : '') + 'Nothing is calculated until the required inputs are in.</p>'
    + (a ? '<input type="hidden" id="pl-an" value="' + a.id + '">' : '<label class="f" for="pl-an">Analysis</label><select id="pl-an" class="left">' + analysisOptions('acquisition') + '</select>')
    + '<label class="f" for="pl-nm">Name</label><input type="text" id="pl-nm" class="left" placeholder="e.g. 14 Main Street" autocomplete="off">'
    + '<label class="chk"><input type="checkbox" id="pl-guide"> <span>Guide me step by step</span></label>'
    + '<div class="pl-from"><span>Or start from a document</span><div><button type="button" class="pl-hbtn" onclick="bkNewDealFrom(\'Import\')">Listing summary</button><button type="button" class="pl-hbtn" onclick="bkNewDealFrom(\'Import\')">Offering memorandum</button><button type="button" class="pl-hbtn" onclick="bkNewDealFrom(\'Import\')">T-12</button><button type="button" class="pl-hbtn" onclick="bkNewDealFrom(\'Import\')">Rent roll</button></div></div>'
    + saveFirstBox('Save the current deal') + '<div class="btns"><button type="button" class="pl-hbtn" onclick="bkModalClose()">Cancel</button><button type="button" class="pl-hbtn primary" onclick="bkNewDealGo()">Create</button></div>');
  var nm = document.getElementById('pl-nm'); if(nm){ nm.focus(); nm.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); bkNewDealGo(); } }); }
};
window.bkNewDealGo = function(){
  var R = window.BKReg, nm = ((document.getElementById('pl-nm') || {}).value || '').trim(), aid = (document.getElementById('pl-an') || {}).value || 'acquisition', guide = !!(document.getElementById('pl-guide') || {}).checked;
  var a = (R && R.analysis(aid)) || { id:'acquisition', dealType:'Acquisition', live:true }; if(!a.live) return;
  snapshot(); closeModal();
  var id = nm ? nm.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase().slice(0, 24) : 'NEW-' + Date.now().toString(36).toUpperCase();
  if(typeof bkCreateNewDeal === 'function') bkCreateNewDeal({ name:nm, dealId:id, dealType:a.dealType, analysisType:a.id, blankStructure:true });
  if(guide && typeof window.bkGuideBegin === 'function') window.bkGuideBegin();
};
window.bkNewDealFrom = function(sheet){ snapshot(); closeModal(); showSheet(sheet); };
window.bkNewDealImport = function(){ snapshot(); closeModal(); showSheet('Import'); };

window.bkClearInputsDialog = function(){
  var s = safe(function(){ return bkLoad(); }, {}), was = [s.name, s.location].filter(Boolean).join(' · ');
  modal('<h3>Clear all inputs?</h3><p>Everything on this deal is removed' + (was ? ' (<b>' + esc(was) + '</b>)' : '') + ': its name, location and type, income, expenses, debt, rent roll, tax, partners and the saved cases. The deal goes back to a blank one of the same kind of analysis (' + esc(s.dealType || 'Acquisition') + '). <b>Nothing is lost:</b> the deal as it is now is saved to Version History first, and you can restore it from there.</p>'
    + saveFirstBox('Also save a copy of') + '<div class="btns"><button type="button" class="pl-hbtn" onclick="bkModalClose()">Cancel</button><button type="button" class="pl-hbtn danger" onclick="bkClearInputsGo()">Clear inputs</button></div>');
};
window.bkClearInputsGo = function(){
  var s = safe(function(){ return bkLoad(); }, null); if(!s) return; snapshot();
  /* the data stays saved: a version of the deal as it was is kept before anything is removed */
  try { if(typeof window.bkHistorySaveVersion === 'function') window.bkHistorySaveVersion('Before clearing all inputs', true); } catch(e){}
  var h = safe(function(){ return bkLoad()._history; }, null);
  closeModal();
  if(typeof bkCreateNewDeal === 'function') bkCreateNewDeal({ dealId:s.dealId, dealType:s.dealType, analysisType:s.analysisType, blankStructure:true });   /* the kind of analysis is kept (a Development stays a Development); everything about the property and its terms is removed */
  /* the cleared deal keeps the record of what it was: its version history comes with it */
  if(h) safe(function(){ var n = bkLoad(); n._history = h; bkSave(n); });
};

RENDERERS['Home'] = function(){
  var o = prev.apply(this, arguments); if(!o || typeof o.main !== 'string') return o;
  var has = active(); if(!has) return o;
  var bar = '<div class="pl-toolbar"><button type="button" class="pl-hbtn primary" onclick="bkNewDealDialog()">+ New analysis</button><button type="button" class="pl-hbtn" onclick="showSheet(\'Import\')">Import OM</button>' + (has ? '<button type="button" class="pl-hbtn" onclick="bkReportOpen()" style="border-color:#3E9AE6;color:#12609f;font-weight:700">Create PDF summary</button>' : '') + (has ? '<button type="button" class="pl-hbtn danger" onclick="bkClearInputsDialog()">Clear inputs</button>' : '') + '</div>';
  return Object.assign({}, o, { main:o.main.replace('<div class="pl-home">', '<div class="pl-home">' + bar) });
};
if(typeof window.bkRegisterRenderer === 'function') try { window.bkRegisterRenderer('Home', RENDERERS['Home']); } catch(e){}
/* the command palette gets the same two actions */
if(window.bkPalette && typeof window.bkPalette.extra !== 'function'){ /* palette actions are built in nav2; added there */ }
})();
