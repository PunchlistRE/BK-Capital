
/* V29.10.4 - PORTFOLIO / MASTER DATA IMPORT
   The deliberate path by which properties enter the application. A Yardi T-12 or
   other OPERATING source can never create a property; master data can. Importing
   establishes MASTER records (identity, type, units, SF, ownership) - it does not
   create active deals and does not write underwriting assumptions. */
(function(){
'use strict';
var msg = null;
function esc(v){ return (typeof bkEsc==='function') ? bkEsc(v) : String(v==null?'':v); }
function note(kind,text){ msg={kind:kind,text:text}; if(typeof currentSheet!=='undefined') showSheet(currentSheet); }

window.bkImportMasterFile = function(){
  var f = document.getElementById('bkMasterFile');
  if(!f || !f.files || !f.files.length){ note('err','No file selected.'); return; }
  var file = f.files[0];
  bkLoadSheetJs().then(function(){
    var rd = new FileReader();
    rd.onload = function(e){
      bkXlsxPrepare(new Uint8Array(e.target.result)).then(function(wb){
      try{
        var sheet = wb.SheetNames.filter(function(n){ return /property summary/i.test(n); })[0];
        if(!sheet){ note('err','No "Property Summary" sheet found. Sheets: '+wb.SheetNames.join(', ')); return; }
        var rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], {header:1, raw:true, defval:null});
        var p = bkHpmParsePropertySummary(rows);
        if(p.errors.length){ note('err','Import refused: '+p.errors.join('; ')); return; }
        if(!p.owned.length){ note('err','No property rows found in Property Summary.'); return; }
        p.owned.forEach(function(r){ r.sourceWorkbook = file.name; r.importedAt = new Date().toISOString(); });
        bkMasterSave(p.owned);
        note('ok','Imported '+p.owned.length+' master properties ('+p.targets.length+' targets recorded separately) from '
             +file.name+'. No deals were created and no underwriting assumptions were written.');
      }catch(err){ note('err','Could not read workbook: '+String(err.message||err)); }
      }).catch(function(err){ note('err','Could not read workbook: '+String(err.message||err)); });
    };
    rd.onerror=function(){ note('err','Could not read the file.'); };
    rd.readAsArrayBuffer(file);
  }).catch(function(err){ note('err',String(err.message||err)); });
};

function sheetPortfolioImport(){
  var master = (typeof bkMasterLoad==='function') ? bkMasterLoad() : [];
  var rows = master.map(function(p){
    return '<tr><td class="rowlabel">'+esc(p.propertyName)+'</td>'
      + '<td data-bk-align="text">'+esc(p.type||'-')+'</td>'
      + '<td>'+(p.units==null?'-':p.units)+'</td>'
      + '<td>'+(p.sf==null?'-':Number(p.sf).toLocaleString('en-US'))+'</td>'
      + '<td>'+(p.t12noi==null?'-':'$'+Number(p.t12noi).toLocaleString('en-US'))+'</td>'
      + '<td>'+(p.ownership==null?'-':(p.ownership*100).toFixed(0)+'%')+'</td>'
      + '<td data-bk-align="text">'+(p.yardiCode?esc(p.yardiCode):'<span class="status-chip">no code</span>')+'</td></tr>';
  }).join('');

  var main =
    '<div class="tbl-wrap"><table class="fin"><caption>Import Portfolio / Master Data</caption>'
    + '<thead><tr><th class="rowlabel-h">Step</th><th style="text-align:left">Action</th></tr></thead><tbody>'
    + '<tr><td class="rowlabel">Master workbook</td><td data-bk-align="text">'
    + '<input id="bkMasterFile" type="file" accept=".xlsx,.xlsm,.xls" style="font:inherit"></td></tr>'
    + '<tr><td class="rowlabel">Import</td><td data-bk-align="text">'
    + '<button type="button" class="status-chip pass" onclick="bkImportMasterFile()">IMPORT MASTER DATA</button></td></tr>'
    + '</tbody></table></div>'
    + (msg ? '<div class="note-flag"><span>'+(msg.kind==='ok'?'&#10003;':'&#9888;')+'</span><div>'+esc(msg.text)+'</div></div>' : '')
    + '<div class="tbl-wrap" style="margin-top:16px;"><table class="fin"><caption>Master Properties ('+master.length+')</caption>'
    + '<thead><tr><th class="rowlabel-h">Property</th><th style="text-align:left">Type</th><th>Units</th><th>SF</th>'
    + '<th>T-12 NOI</th><th>Ownership</th><th style="text-align:left">Yardi Code</th></tr></thead><tbody>'
    + (rows || '<tr><td class="rowlabel" colspan="7">No master properties. Import a master workbook to establish the portfolio.</td></tr>')
    + '</tbody></table></div>'
    + '<div class="note-flag" style="margin-top:12px;"><span>&#9432;</span><div>'
    + '<b>Master data establishes identity, not underwriting.</b> Importing records which properties exist, their type, '
    + 'unit count, SF and ownership. It creates no active deal and writes no underwriting assumption. '
    + 'Operating documents (a Yardi T-12, a rent roll) can never create a property - they are reconciled against '
    + 'properties that already exist here.</div></div>'
    + '<div class="note-flag"><span>&#9888;</span><div>'
    + '<b>Identifier limitation.</b> The supplied master workbook provides property NAME only - no Deal ID, Property ID, '
    + 'address or Yardi property code. The crosswalk is therefore name-keyed. Adding a Yardi property code column to the '
    + 'master workbook would make source-to-property resolution deterministic rather than name-dependent.</div></div>';

  return { title:'Portfolio Import', crumbs:'Portfolio & Investors',
    desc:'Establish recognised properties from a master workbook. Identity only - no underwriting is written.',
    meta:{ 'Master Properties':master.length, 'Active Deal': (typeof bkProductionCounts==='function' ? (bkProductionCounts().activeDeal||'None') : '-') },
    main:main,
    sidebar:(typeof sidebarShell==='function') ? sidebarShell(
      '<div class="card"><div class="card-head">Master Data</div><div class="metric-list">'
      +'<div class="metric-row"><span class="k">Properties</span><span class="v">'+master.length+'</span></div>'
      +'<div class="metric-row"><span class="k">Write Authority</span><span class="v"><span class="status-chip">Identity only</span></span></div>'
      +'</div></div>') : '' };
}

if(typeof window.bkRegisterRenderer==='function') window.bkRegisterRenderer('Portfolio Import', sheetPortfolioImport);
else if(typeof RENDERERS!=='undefined') RENDERERS['Portfolio Import']=sheetPortfolioImport;
if(typeof GROUPS!=='undefined'){
  var g=GROUPS.filter(function(x){return x.id==='portfolio';})[0];
  if(g && g.sheets.indexOf('Portfolio Import')===-1) g.sheets.unshift('Portfolio Import');
}
})();
