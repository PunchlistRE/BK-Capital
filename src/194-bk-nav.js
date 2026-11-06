/* NAVIGATION, ONE DEFINITION (2.1, owner's November 2026 regrouping). Tab -> groups -> sheets, defined once here, drives all three: the top tabs (NAV_TABS), the sub-tab row under them and the side menu (the vertical version of the same tabs,
   with the same groups and sheets in the same order and the same names). Presentation only: no sheet, renderer or calculation changes. A sheet is in exactly one place; a sheet that exists but is not listed lands in Model & Data > Other so none vanishes.
   Conditional: the Development group (Operations) shows on development deals, the Business tab on deals with an operating business; both menus follow together. The SYS_ sheets stay hidden in both.
   GROUPS and NAV_TABS are rebuilt IN PLACE from this definition (other parts hold references to them), once, after every part has registered its sheets. Renames are display names (BK_NAV_LABELS): the sheet keys the engine and tests use do not change. */
(function(){
'use strict';
if(typeof GROUPS === 'undefined' || typeof NAV_TABS === 'undefined' || typeof RENDERERS === 'undefined') return;
window.BK_NAV = [
  { id:'overview', label:'Overview', q:'Where does the deal stand?', color:'#7a8da1', groups:[ { label:'Overview', sheets:['Home'] } ] },
  { id:'editor', label:'Property', q:'What are we buying?', color:'#3E9AE6', groups:[
      { label:'Inputs', sheets:['Property', 'Market', 'Revenues', 'Expenses', 'Tenants', 'Investment', 'Valuation', 'Deal Underwrite'] },
      { label:'Rent roll', sheets:['Rent Roll'] },
      { label:'Documents & import', sheets:['Import', 'Deal Documents', 'Source Ingestion', 'Source Data'] },
      { label:'Tax', sheets:['Depreciation'] },
      { label:'Market', sheets:['Market Benchmarks'] } ] },
  { id:'operations', label:'Operations', q:'What does it earn?', color:'#163a62', groups:[
      { label:'Operations', sheets:['Operating Underwrite', 'Property CF', 'Property Valuation'] },
      { id:'dev', label:'Development', cond:'development', sheets:['Development', 'Dev Schedule', 'Dev Lease-Up', 'Dev Draws', 'Residual Land'] } ] },
  { id:'debt', label:'Debt', q:'Can we finance it, and is the loan safe?', color:'#2E6E6E', groups:[
      { label:'Capital stack', sheets:['Sources & Uses'] },
      { label:'Loan', sheets:['Debt', 'Debt Schedule', 'Covenant Monitor'] },
      { label:'Refinance', sheets:['Refinancing', 'Refi / Recap'] },
      { label:'Compare', sheets:['Financing Lab', 'Financing Compare'] } ] },
  { id:'returns', label:'Returns', q:'What do the investors earn?', color:'#3F6B4A', groups:[
      { label:'Returns', sheets:['Returns', 'Equity Waterfall', 'Waterfall (M)', 'Sponsor CF', 'After-Tax'] },
      { label:'Investors', sheets:['Investors', 'Investor Schedules', 'Liquidity'] },
      { label:'Risk & pricing', sheets:['Sensitivity', 'Reverse Solve', 'Probability-Weighted', 'Pre-Offer Bid'] } ] },
  { id:'credit', label:'Credit & IC', q:'Does it meet house policy?', color:'#7A3E4D', groups:[ { label:'Credit & IC', sheets:['IC Memo', 'Credit Policy', 'Debt Capacity', 'Deal Remedies'] } ] },
  { id:'business', label:'Business', q:'Operating-business deals only', color:'#6B4E71', cond:'business', groups:[ { label:'Operating business', sheets:['Business Model', 'Business Valuation', 'Sell vs Hold'] } ] },
  { id:'reports', label:'Reports', q:'Documents to send out', color:'#B0592A', groups:[ { label:'Reports', sheets:['Cash Flow Report', 'Sources and Uses Report', 'Valuation Report', 'Property Valuation Report', 'Present Value Report', 'Tenant Report', 'Lease Schedule', 'Lease Audit Report', 'Refinance Report', 'Audit Report'] } ] },
  { id:'portfolio', label:'Portfolio', q:'Across all deals', color:'#5A6B7A', groups:[ { label:'Portfolio', sheets:['Portfolio', 'Portfolio Dashboard', 'Property DB', 'Portfolio CF', 'Portfolio M', 'Portfolio Rollup', 'Capital Allocation', 'Capital Calls', 'Equity Partners', 'Investor Summary', 'Benchmarks'] } ] },
  { id:'model', label:'Model & Data', q:'Can we trust the model? Admin', color:'#A93B2C', groups:[
      { label:'Checks', sheets:['Model Checks', 'QA', 'Version History', 'Source Lineage', 'Storage Lifecycle'] },
      { label:'Data', sheets:['Portfolio Import', 'Data Export', 'Cloud Sync'] },
      { label:'Monthly detail', sheets:['Deal Vectors (M)', 'Ledger (M)', 'Lease Cohort CF'] } ] }
];
/* display names (the keys stay) */
window.BK_NAV_LABELS = { 'Benchmarks':'Deal Targets', 'Refinancing':'Refinance Analysis', 'Valuation Report':'Valuation and Return Summary', 'Property Valuation Report':'Property Value Report', 'Audit Report':'Input Audit Report' };
var label = function(s){ return window.BK_NAV_LABELS[s] || s; };
window.bkNavLabel = label;
function slug(t){ return String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
function isDev(){ try { return /develop/i.test(String((bkLoad() || {}).dealType || '')); } catch(e){ return false; } }
function hasBiz(){ try { return typeof window.bkBizInputs === 'function' && !!window.bkBizInputs(); } catch(e){ return false; } }
function tabOf(sheet){ for(var i = 0; i < NAV_TABS.length; i++){ var t = NAV_TABS[i]; for(var j = 0; j < t.groups.length; j++){ var g = GROUPS.filter(function(x){ return x.id === t.groups[j]; })[0]; if(g && g.sheets.indexOf(sheet) > -1) return t; } } return null; }
/* is a conditional group or tab showing right now? (the open sheet always shows, so a page you are on never disappears from its own menu) */
function groupShown(g, sheet){ if(!g.cond) return true; if(g.sheets.indexOf(sheet) > -1) return true; return g.cond === 'development' ? isDev() : g.cond === 'business' ? hasBiz() : true; }
window.bkNavTabHidden = function(t, sheet){ var d = window.BK_NAV.filter(function(x){ return x.id === t.id; })[0]; if(!d || !d.cond) return false;
  var gs = t.groups.map(function(id){ return GROUPS.filter(function(x){ return x.id === id; })[0]; }).filter(Boolean); if(gs.some(function(g){ return g.sheets.indexOf(sheet) > -1; })) return false; return !(d.cond === 'business' ? hasBiz() : true); };
window.bkNavGroupShown = groupShown;

/* rebuild GROUPS and NAV_TABS in place from the definition */
var old = GROUPS.slice(), placed = {}, fresh = [], tabs = [];
window.BK_NAV.forEach(function(t){ var ids = [];
  t.groups.forEach(function(g){ var id = g.id || (t.id + '-' + slug(g.label)), sheets = g.sheets.filter(function(s){ return RENDERERS[s]; }); sheets.forEach(function(s){ placed[s] = 1; });
    if(!sheets.length) return; ids.push(id); fresh.push({ id:id, label:g.label, color:t.color, sheets:sheets, tab:t.id, cond:g.cond || null }); });
  tabs.push({ id:t.id, label:t.label, groups:ids }); });
var other = []; old.forEach(function(g){ if(g.hidden) return; g.sheets.forEach(function(s){ if(!placed[s] && RENDERERS[s]){ other.push(s); placed[s] = 1; } }); });
if(RENDERERS['Source Ingestion'] && !placed['Source Ingestion']){ other.push('Source Ingestion'); }
if(other.length){ fresh.push({ id:'model-other', label:'Other', color:'#A93B2C', sheets:other, tab:'model', cond:null }); tabs[tabs.length - 1].groups.push('model-other'); window.BK_NAV_UNPLACED = other.slice(); }
var sys = old.filter(function(g){ return g.hidden; });
GROUPS.length = 0; fresh.concat(sys).forEach(function(g){ GROUPS.push(g); });
NAV_TABS.length = 0; tabs.forEach(function(t){ NAV_TABS.push(t); });

/* the side menu: the vertical version of the top tabs. One heading per tab (a count of its sheets), under it the same groups and sheets in the same order. */
function railBuild(){
  var rail = document.getElementById('rail-groups'); if(!rail) return; rail.innerHTML = '';
  var cur = null; try { cur = currentSheet; } catch(e){}
  NAV_TABS.forEach(function(t){
    if(window.bkNavTabHidden(t, cur)) return;
    var gs = t.groups.map(function(id){ return GROUPS.filter(function(x){ return x.id === id; })[0]; }).filter(function(g){ return g && !g.hidden && groupShown(g, cur); });
    var n = gs.reduce(function(a, g){ return a + g.sheets.length; }, 0); if(!n) return;
    var wrap = document.createElement('div'); wrap.className = 'rail-group'; wrap.setAttribute('data-nav-tab', t.id);
    var lab = document.createElement('div'); lab.className = 'rail-group-label'; lab.innerHTML = '<span>' + t.label + '</span><span class="grp-tag">' + n + '</span>'; wrap.appendChild(lab);
    gs.forEach(function(g, gi){
      if(gs.length > 1){ var sub = document.createElement('div'); sub.className = 'rail-sub'; sub.textContent = g.label; wrap.appendChild(sub); }
      g.sheets.forEach(function(s){ var item = document.createElement('div'); item.className = 'rail-item' + (cur === s ? ' active' : ''); item.style.setProperty('--gid-color', g.color); item.dataset.sheet = s;
        item.innerHTML = '<span class="dot"></span><span class="name">' + label(s) + '</span>'; item.addEventListener('click', function(){ showSheet(s); }); wrap.appendChild(item); }); });
    rail.appendChild(wrap); });
  var sg = GROUPS.filter(function(g){ return g.hidden; }); /* the SYS_ sheets stay hidden in both menus */
}
window.bkBuildRail = railBuild; try { bkBuildRail = railBuild; } catch(e){}
railBuild();

/* after every page: the names, the breadcrumb (the page's tab) and the side menu follow the open page and the deal */
function decorate(){
  var cs = null; try { cs = currentSheet; } catch(e){} if(!cs) return;
  var t = tabOf(cs), nm = window.BK_NAV_LABELS[cs];
  document.querySelectorAll('#viewport .rb-t[data-goto-sheet2]').forEach(function(b){ var k = b.getAttribute('data-goto-sheet2'); if(window.BK_NAV_LABELS[k]) b.textContent = label(k); });
  var cr = document.querySelector('#viewport .title-block .crumbs'); if(cr && t) cr.textContent = t.label;
  if(nm){ var h = document.querySelector('#viewport .title-block h2'); if(h) h.textContent = nm; var cu = document.querySelector('#viewport .tabnav .cur'); if(cu) cu.textContent = nm; }
  railBuild();
}
var prev = window.showSheet;
if(typeof prev === 'function'){ window.showSheet = function(sheet){ var r = prev.apply(this, arguments); try { decorate(); } catch(e){} return r; }; try { showSheet = window.showSheet; } catch(e){} }
var css = document.createElement('style'); css.id = 'bk-nav-css';
css.textContent = '.rail-sub{font:600 10.5px Inter,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--ae-dim,#8a98a8);padding:6px 14px 2px 22px;opacity:.85}.rb-t.rb-gs{margin-left:10px;box-shadow:-6px 0 0 -5px var(--ae-line,#c9d1dc)}';
document.head.appendChild(css);
})();
