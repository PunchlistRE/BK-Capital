
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
 + '#pl-modal input[type=text],#pl-modal select{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid var(--line,#dbe4ec);border-radius:8px;font:14px Inter,system-ui,sans-serif;background:#fff;text-align:right;text-align-last:right}#pl-modal .chk{display:flex;gap:8px;align-items:flex-start;font-size:13px;margin:12px 0 2px}#pl-modal .btns{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}';
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

window.bkNewDealDialog = function(){
  modal('<h3>Start a new deal</h3><p>This opens a blank deal. Nothing is calculated until the required inputs are in.</p>'
    + '<label class="f" for="pl-nm">Deal name</label><input type="text" id="pl-nm" placeholder="e.g. 14 Main Street" autocomplete="off">'
    + '<label class="f" for="pl-ty">Deal type</label><select id="pl-ty"><option value="Acquisition">Acquisition</option><option value="Development">Development</option></select>'
    + saveFirstBox('Save the current deal') + '<div class="btns"><button type="button" class="pl-hbtn" onclick="bkModalClose()">Cancel</button><button type="button" class="pl-hbtn" onclick="bkNewDealImport()">Import a T-12 instead</button><button type="button" class="pl-hbtn" onclick="bkModalClose();showSheet(\'Import OM\')">Import an OM instead</button><button type="button" class="pl-hbtn primary" onclick="bkNewDealGo()">Create blank deal</button></div>');
  var nm = document.getElementById('pl-nm'); if(nm) nm.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); bkNewDealGo(); } });
};
window.bkNewDealGo = function(){
  var nm = (document.getElementById('pl-nm') || {}).value || '', ty = (document.getElementById('pl-ty') || {}).value || 'Acquisition';
  snapshot(); closeModal();
  var id = nm.trim() ? nm.trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase().slice(0, 24) : '';
  if(typeof bkCreateNewDeal === 'function') bkCreateNewDeal({ name:nm.trim(), dealId:id, dealType:ty });
};
window.bkNewDealImport = function(){ snapshot(); closeModal(); showSheet('Import Deal'); };

window.bkClearInputsDialog = function(){
  var s = safe(function(){ return bkLoad(); }, {}), keep = [s.name, s.dealType, s.propertyType, s.closing].filter(Boolean).join(' · ');
  modal('<h3>Clear all inputs?</h3><p>Every input on this deal goes back to blank or zero: income, expenses, debt, rent roll, tax and the saved cases.' + (keep ? ' The deal’s identity (<b>' + esc(keep) + '</b>) is kept.' : '') + ' Nothing is calculated again until the required inputs are re-entered.</p>'
    + saveFirstBox('Save a copy of') + '<div class="btns"><button type="button" class="pl-hbtn" onclick="bkModalClose()">Cancel</button><button type="button" class="pl-hbtn danger" onclick="bkClearInputsGo()">Clear inputs</button></div>');
};
window.bkClearInputsGo = function(){
  var s = safe(function(){ return bkLoad(); }, null); if(!s) return; snapshot(); closeModal();
  if(typeof bkCreateNewDeal === 'function') bkCreateNewDeal({ dealId:s.dealId, name:s.name, location:s.location, dealType:s.dealType, propertyType:s.propertyType, status:s.status, closing:s.closing });
};

RENDERERS['Home'] = function(){
  var o = prev.apply(this, arguments); if(!o || typeof o.main !== 'string') return o;
  var has = active(), bar = '<div class="pl-toolbar"><button type="button" class="pl-hbtn primary" onclick="bkNewDealDialog()">+ New deal</button><button type="button" class="pl-hbtn" onclick="showSheet(\'Import OM\')">Import OM</button>' + (has ? '<button type="button" class="pl-hbtn" onclick="bkReportOpen()" style="border-color:#3E9AE6;color:#12609f;font-weight:700">Create PDF summary</button>' : '') + (has ? '<button type="button" class="pl-hbtn danger" onclick="bkClearInputsDialog()">Clear inputs</button>' : '') + '</div>';
  return Object.assign({}, o, { main:o.main.replace('<div class="pl-home">', '<div class="pl-home">' + bar) });
};
if(typeof window.bkRegisterRenderer === 'function') try { window.bkRegisterRenderer('Home', RENDERERS['Home']); } catch(e){}
/* the command palette gets the same two actions */
if(window.bkPalette && typeof window.bkPalette.extra !== 'function'){ /* palette actions are built in nav2; added there */ }
})();
