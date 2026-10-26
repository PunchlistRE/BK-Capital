
/* ===========================================================================
   V29.10.5 - SOURCE GOVERNANCE
   Storage Lifecycle | PDF capability | property identity | source lineage
   ===========================================================================
   Three things live here, and they share one principle: DETECTION HAS ZERO
   AUTOMATIC WRITE AUTHORITY. Everything below can observe, classify, compare
   and recommend. Nothing below can change an underwriting number. The only
   thing that changes an underwriting number is a human pressing a button that
   names the specific field and the specific value.

   FINANCIAL LOGIC CHANGES: NONE.
   =========================================================================== */
(function(){
'use strict';

function esc(v){ return (typeof bkEsc==='function') ? bkEsc(v) : String(v==null?'':v); }
function reg(name, fn, groupId){
  if(typeof window.bkRegisterRenderer==='function') window.bkRegisterRenderer(name, fn);
  else if(typeof RENDERERS!=='undefined') RENDERERS[name]=fn;
  if(typeof GROUPS!=='undefined'){
    var g=GROUPS.filter(function(x){return x.id===groupId;})[0];
    if(g && g.sheets.indexOf(name)===-1) g.sheets.push(name);
  }
}
function card(head, body){ return '<div class="card"><div class="card-head">'+head+'</div>'+body+'</div>'; }
function shell(x){ return (typeof sidebarShell==='function') ? sidebarShell(x) : ''; }

/* =======================================================================
   1. STORAGE LIFECYCLE SHEET
   The user-facing half of the migration architecture. Everything the boot
   path decided is visible here, and every quarantined batch is recoverable
   with one click. This is what replaces "open DevTools and clear storage".
   ======================================================================= */
function sheetStorageLifecycle(){
  var boot = (typeof bkBootReport==='function') ? bkBootReport() : {};
  var idx  = (typeof bkQuarantineIndex==='function') ? bkQuarantineIndex() : [];
  var c    = (typeof bkProductionCounts==='function') ? bkProductionCounts() : {};

  var bootRows =
      '<tr><td class="rowlabel">Boot Action</td><td data-bk-align="text">'+esc(boot.action||'-')+'</td></tr>'
    + '<tr><td class="rowlabel">Storage Schema</td><td>'+esc(boot.schema||'-')+'</td></tr>'
    + '<tr><td class="rowlabel">Classification</td><td data-bk-align="text">'
    +   esc(boot.classification ? boot.classification.cls : 'n/a')+'</td></tr>'
    + '<tr><td class="rowlabel">Reason</td><td data-bk-align="text">'
    +   esc(boot.classification ? boot.classification.why : (boot.note||'-'))+'</td></tr>'
    + '<tr><td class="rowlabel">Active Deal</td><td data-bk-align="text">'
    +   esc(c.activeDeal || 'None')+'</td></tr>'
    + '<tr><td class="rowlabel">Automatic Writes Suppressed</td><td>'+esc(c.suppressedWrites||0)+'</td></tr>';

  var qRows = idx.length ? idx.map(function(b){
    var keys = b.entries.map(function(e){ return e.key; }).join('<br>');
    var bytes = b.entries.reduce(function(a,e){ return a+e.bytes; },0);
    return '<tr>'
      + '<td class="rowlabel">'+esc(new Date(b.at).toLocaleString())+'</td>'
      + '<td data-bk-align="text">'+esc(b.classification)+'</td>'
      + '<td data-bk-align="text">'+keys+'</td>'
      + '<td>'+bytes.toLocaleString()+'</td>'
      + '<td data-bk-align="text">'+(b.restored?'<span class="status-chip pass">Restored</span>':'<span class="status-chip warn">Held</span>')+'</td>'
      + '<td style="text-align:center;">'
      +   (b.restored ? '-'
          : '<button type="button" class="status-chip" onclick="bkQuarantineRestore(\''+esc(b.stamp)+'\');showSheet(\'Storage Lifecycle\');">RESTORE</button> '
          + '<button type="button" class="status-chip" onclick="bkGovConfirmDiscard(\''+esc(b.stamp)+'\')">DISCARD</button>')
      + '</td></tr>';
  }).join('') : '<tr><td class="rowlabel" colspan="6">Nothing is in quarantine.</td></tr>';

  var main =
      '<div class="tbl-wrap"><table class="fin"><caption>This Browser\'s Startup Decision</caption><tbody>'
    + bootRows + '</tbody></table></div>'
    + '<div class="tbl-wrap" style="margin-top:18px;"><table class="fin">'
    + '<caption>Quarantined State</caption><thead><tr>'
    + '<th class="rowlabel-h">Set Aside</th><th style="text-align:left">Classification</th>'
    + '<th style="text-align:left">Stores</th><th>Bytes</th>'
    + '<th style="text-align:left">Status</th><th style="text-align:center">Action</th>'
    + '</tr></thead><tbody>'+qRows+'</tbody></table></div>'
    + '<div class="note-flag" style="margin-top:14px;"><span>&#9432;</span><div>'
    + '<b>Nothing here was deleted.</b> On upgrade, state that could not be positively identified as '
    + 'yours is copied aside rather than activated, so the application never opens showing a deal you '
    + 'did not create. RESTORE puts a batch back byte-for-byte and makes it the active deal. DISCARD is '
    + 'permanent and is the only destructive action in the application; it is never taken automatically.'
    + '</div></div>'
    + '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">'
    + '<button type="button" class="status-chip" onclick="bkGovConfirmFactory()">RESET TO FACTORY STATE</button>'
    + '</div>';

  return { title:'Storage Lifecycle', crumbs:'System',
           desc:'How this browser\'s stored state was classified on startup, and what is recoverable.',
           meta:{ 'Boot Action':boot.action||'-', Schema:boot.schema||'-',
                  'Quarantined Batches':idx.filter(function(b){return !b.restored;}).length,
                  Status:'System' },
           main:main,
           sidebar: shell(card('Storage Keys In Use',
             '<div class="metric-list">'
             + Object.keys(localStorage).sort().map(function(k){
                 return '<div class="metric-row"><span class="k">'+esc(k.replace('bkcapital.',''))
                      + '</span><span class="v">'+((localStorage.getItem(k)||'').length).toLocaleString()+' B</span></div>';
               }).join('')
             + '</div>')) };
}
window.bkGovConfirmDiscard = function(stamp){
  if(!window.confirm('Permanently delete this quarantined state?\n\nThis cannot be undone.')) return;
  bkQuarantineDiscard(stamp); showSheet('Storage Lifecycle');
};
window.bkGovConfirmFactory = function(){
  if(!window.confirm('Reset to factory state?\n\nDeal data is moved aside, not deleted, and your connection settings are untouched.')) return;
  bkResetToFactoryState(); showSheet('Storage Lifecycle');
};
reg('Storage Lifecycle', sheetStorageLifecycle, 'qa');

/* =======================================================================
   2. PDF CAPABILITY - STATED HONESTLY, NOT FAKED
   ======================================================================= */
/* SPRR.pdf was examined directly. Measured facts:

     4 pages, 3,413,519 bytes
     pdftotext -layout extracted 4 BYTES of text across all four pages
     every page is a single full-page 2544x3296 RGB JPEG at 300 dpi

   There is no text layer. The document is a photograph of paper. Extracting
   it requires OCR, and OCR of a skewed scan of a dense financial table is
   exactly the operation that produces a plausible-looking wrong number.

   That is not hypothetical here. HPM_Portfolio_Master.xlsx's ShorePointe
   sheet IS a transcription of this document, and it is measurably defective:
   its own line items fail to sum to its own stated totals in 6 of 14 months,
   with four dropped decimal points (375.00 read as 37500) and four digit
   errors (92,044 read as 82,044; 94,362 read as 4,362). The same test run
   against the PDF itself ties in 14 of 14 months.

   So the application does NOT claim to read PDFs. It identifies the file,
   explains precisely why it will not guess, and routes the user to the path
   that produces a correct number: transcribe the figures that matter, with
   the page reference recorded alongside them. */
window.bkPdfCapability = function(){
  return {
    canExtract      : false,
    reason          : 'PDF source packages in this portfolio are scanned images with no text layer. '
                    + 'Automated extraction would require OCR, and OCR of scanned financial tables '
                    + 'produces silent numeric errors rather than visible failures.',
    evidence        : 'SPRR.pdf: 4 pages, 0 extractable characters, 4 full-page 300dpi JPEGs. '
                    + 'The existing spreadsheet transcription of this same document fails its own '
                    + 'internal arithmetic in 6 of 14 months.',
    supportedFormats: ['.xlsx','.xlsm','.csv'],
    path            : 'Record the package as a source document, then enter the figures you intend to '
                    + 'use with their page reference. Every entry keeps its citation.'
  };
};

/* Refuse PDFs by name at the ingestion door, rather than returning an empty
   parse that looks like "the file had nothing in it". */
window.bkGuardSourceFile = function(file){
  var n = String(file && file.name || '').toLowerCase();
  if(/\.pdf$/.test(n)){
    var c = window.bkPdfCapability();
    return { ok:false, kind:'PDF', message:
      'This application cannot read ' + (file.name) + ' automatically. ' + c.reason + ' ' + c.path };
  }
  if(/\.(xls|xlsb)$/.test(n)){
    return { ok:false, kind:'LEGACY-BINARY', message:
      'This is a legacy binary Excel format. Re-save it as .xlsx and ingest again.' };
  }
  return { ok:true };
};

/* =======================================================================
   3. PROPERTY IDENTITY - EXPLICIT ALIASES, NEVER A GLOBAL RULE
   ======================================================================= */
/* BK's instruction was specific: do not change the global matcher to strip
   neighbourhood suffixes, and do not implement "anything before a hyphen is
   the property". Both would silently merge properties that merely share a
   prefix, and this portfolio contains 1363 Seaview and 1387 Seaview.

   So identity stays exact-after-normalisation, and a mismatch is resolved by
   recording ONE specific pair, with its evidence, approved by name. The alias
   below is proposed, not applied: bkAliasProposals() computes it,
   bkAliasApprove() is a human action, and nothing reads an unapproved alias.

   THE SHOREPOINTE EVIDENCE CHAIN, as measured:

     HPM Property Summary row 2 .......... "ShorePointe"
     Yardi T-12 section header ........... "SHOREPOINTE - SHIPPAN"  (one of six
                                           properties named in that one header)
     SPRR.pdf p1 rent roll header ........ "ShorePointe - Stamford"
     SPRR.pdf p2-4 cash flow header ...... "ShorePointe - Shippan"

   Names alone would not settle it. Twelve independent numbers do. Every field
   on HPM's ShorePointe row is identical to SPRR.pdf page 1:

     units 38 | SF 30,482 | annual rent 1,137,042 | rent/SF 37.30
     T-12 NOI 507,780 | expense ratio 55.34% | cap 5.00% | vacancy 0%
     ownership 100% | implied value 10,155,600 (= 507,780 / 5.00%)

   Shippan is a peninsula neighbourhood OF Stamford, Connecticut, so the two
   suffixes are a system-of-record difference (Yardi's property code vs the
   manager's mailing city), not two assets. */
var ALIAS_KEY = 'bkcapital.property.aliases.v01';

var SHOREPOINTE_EVIDENCE = [
  ['HPM Property Summary, row 2',              'ShorePointe'],
  ['Yardi T-12 Mar-2026, residential header',  'SHOREPOINTE - SHIPPAN'],
  ['SPRR.pdf p1, rent roll header',            'ShorePointe - Stamford'],
  ['SPRR.pdf p2-4, cash flow header',          'ShorePointe - Shippan'],
  ['Units',                'HPM 38 = SPRR 38'],
  ['Building SF',          'HPM 30,482 = SPRR 30,482'],
  ['Annual rent roll',     'HPM $1,137,042 = SPRR $1,137,042'],
  ['Rent per SF',          'HPM $37.30 = SPRR $37.30'],
  ['Trailing-12 NOI',      'HPM $507,780 = SPRR $507,780'],
  ['Expense ratio',        'HPM 55.34% = SPRR 55.34%'],
  ['Cap rate',             'HPM 5.00% = SPRR 5.00%'],
  ['Implied value',        'HPM $10,155,600 = SPRR $10,155,600']
];

function aliasLoad(){
  try{ var a=JSON.parse(localStorage.getItem(ALIAS_KEY)||'[]'); return Array.isArray(a)?a:[]; }catch(e){ return []; }
}
window.bkAliasList = aliasLoad;

/* Proposals are computed, never stored, and never consulted by the matcher. */
window.bkAliasProposals = function(){
  var master = (typeof bkMasterLoad==='function') ? bkMasterLoad() : [];
  var have = aliasLoad().map(function(a){ return a.from; });
  var out = [];
  if(have.indexOf('SHOREPOINTE - SHIPPAN') < 0 &&
     master.some(function(p){ return bkNormPropertyName(p.propertyName)==='SHOREPOINTE'; })){
    out.push({
      from:'SHOREPOINTE - SHIPPAN', to:'ShorePointe',
      confidence:'CORROBORATED',
      basis:'12 independent field agreements between HPM Property Summary and SPRR.pdf, plus a '
          + 'shared source package that uses both suffixes for the same asset.',
      evidence: SHOREPOINTE_EVIDENCE
    });
  }
  return out;
};

/* The only way an alias becomes real. Records who, when, and on what basis. */
window.bkAliasApprove = function(from, to, basis){
  return window.bkWithWriteAuthority('alias approve '+from, function(){
    var a = aliasLoad();
    if(a.some(function(x){ return x.from===from; })) return { ok:false, error:'alias already recorded' };
    a.push({ from:from, to:to, basis:basis||'', approvedAt:new Date().toISOString(),
             approvedBy:'user', evidence:SHOREPOINTE_EVIDENCE });
    localStorage.setItem(ALIAS_KEY, JSON.stringify(a));
    return { ok:true, count:a.length };
  });
};
window.bkAliasRevoke = function(from){
  return window.bkWithWriteAuthority('alias revoke '+from, function(){
    var a = aliasLoad().filter(function(x){ return x.from!==from; });
    localStorage.setItem(ALIAS_KEY, JSON.stringify(a));
    return { ok:true, count:a.length };
  });
};

/* Resolution: exact-after-normalisation FIRST, approved aliases SECOND, and
   nothing else ever. An approved alias is a lookup in a table the user wrote;
   it is not a pattern, so it cannot generalise to a property nobody approved. */
/* NOTE: bkResolveProperty returns {matched, reason} and is NEVER null, so the
   match must be read off .matched. Treating the wrapper as truthy would make
   every lookup "succeed" - including a bare "Seaview" against a portfolio that
   holds both 1363 Seaview and 1387 Seaview. Caught by the negative control in
   the identity regression. */
window.bkResolvePropertyWithAliases = function(name, list){
  var direct = (typeof bkResolveProperty==='function') ? bkResolveProperty(name, list) : null;
  if(direct && direct.matched) return { match:direct.matched, via:'exact' };
  var n = bkNormPropertyName(name);
  var hit = aliasLoad().filter(function(a){ return bkNormPropertyName(a.from)===n; })[0];
  if(!hit) return { match:null, via:'unresolved', reason:(direct && direct.reason) || 'no match' };
  var viaAlias = (typeof bkResolveProperty==='function') ? bkResolveProperty(hit.to, list) : null;
  return (viaAlias && viaAlias.matched)
    ? { match:viaAlias.matched, via:'alias', alias:hit }
    : { match:null, via:'unresolved', reason:'alias target "'+hit.to+'" does not resolve' };
};

/* =======================================================================
   4. SOURCE RECONCILIATION FINDINGS - OBSERVED, BLOCKING, NOT APPLIED
   ======================================================================= */
/* Each finding below was produced by comparing sources to each other. None of
   them writes anything. Their only power is to mark an import path BLOCKED so
   a defective number cannot be ingested silently. */
window.bkSourceFindings = function(){
  return [
    { id:'HPM-SHOREPOINTE-TRANSCRIPTION',
      severity:'BLOCKING',
      subject:'HPM_Portfolio_Master.xlsx -> ShorePointe sheet, monthly line items',
      finding:'The sheet\'s Residential Rent Income line items do not sum to its own stated monthly '
            + 'totals in 6 of 14 months. Four values carry a dropped decimal point (Mar-25 Extra '
            + 'Parking 37,500 for 375.00; Mar-25 Underground Parking 82,500 for 825.00; May-25 Extra '
            + 'Parking 23,468 for 234.68; Sep-25 Pet Rent 22,500 for 225.00) and four are digit '
            + 'errors (Jan-25 total 82,044 for 92,044; Aug-25 total 87,063.61 for 87,663.61; Oct-25 '
            + 'total 4,362 for 94,362; Jan-25 Rent-Residential 90,368 for 90,369). The same test '
            + 'against SPRR.pdf ties in 14 of 14 months.',
      effect :'HPM\'s 14-month residential rent total understates the primary source by exactly '
            + '$100,600.00 (1,202,879.73 vs 1,303,479.73).',
      action :'Monthly line items from HPM property detail sheets are BLOCKED from import. '
            + 'HPM Property Summary (the portfolio roster) is unaffected and remains importable.' },

    { id:'YARDI-T12-SCOPE',
      severity:'BLOCKING',
      subject:'Yardi_Trailing-12_March_2026.xlsx',
      finding:'The workbook\'s own section headers name six properties in a single residential header '
            + 'and six in a single commercial header. HPM\'s Source Register independently declares '
            + 'its scope "Portfolio-wide".',
      effect :'Every figure in it is an aggregate across named properties.',
      action :'PROPERTY scope is impossible by construction, not merely unproven. No figure from this '
            + 'workbook may be written to a single property, regardless of further evidence.' },

    { id:'SPRR-PERIOD-14-MONTHS',
      severity:'BLOCKING',
      subject:'SPRR.pdf pages 2-4, "12 Months Cash Flow Statement"',
      finding:'The statement is titled "12 Months" but its period is stated as Jan 2025 - Feb 2026 and '
            + 'it carries FOURTEEN monthly columns. Its Total column is therefore a 14-month total. '
            + 'It also contains three semi-annual property tax payments rather than two.',
      effect :'Treating the Total column as a trailing twelve months overstates by a factor of 14/12 '
            + '(16.7%). The statement was printed 10 Feb 2026, so the final column is also incomplete.',
      action :'The Total column is BLOCKED from use as a T-12. Reconciliation must select twelve '
            + 'specific columns explicitly.' },

    { id:'SPRR-NOI-DERIVATION',
      severity:'REVIEW',
      subject:'SPRR.pdf page 1, Investment Summary "Trailing-12 NOI $507,780"',
      finding:'This NOI is not derivable from the cash flow statement on pages 2-4. It equals the '
            + 'annualised rent roll times (1 - 55.34%), i.e. 1,137,042 - 629,262. The 629,262 expense '
            + 'figure does not appear on pages 1-4; the package is 4 of 24 pages.',
      effect :'The headline NOI is rent-roll-derived, not GL-derived, and the two bases differ.',
      action :'Held REVIEW. The remaining 20 pages would settle it. Not used as a T-12 NOI input.' },

    { id:'AVGRENT-UNIT-CONFLICT',
      severity:'REVIEW',
      subject:'BK_BASE.avgRent = 36.64',
      finding:'The workbook labels this $/unit/month in three places. The primary source contradicts '
            + 'that: ShorePointe\'s base residential rent of $93,062/month over 30,482 SF is '
            + '$36.6362/SF/year, which rounds to exactly 36.64. Including ancillary income the same '
            + 'calculation gives 37.30, the figure both HPM and SPRR print as "Rent - $ PSF". '
            + 'The per-unit-per-month figure for this property is $2,494.',
      effect :'The stored value appears to be dollars per square foot per year carrying a per-unit-'
            + 'per-month label.',
      action :'NOT CHANGED. the sponsor instructed that avgRent stay at 36.64 and that the Rent Roll is the '
            + 'authoritative basis. This finding is raised because it is new primary-source evidence '
            + 'that contradicts the workbook label, and the decision is the sponsor\'s, not the application\'s.' },

    { id:'OTHERINCOME-UNIT-CONFLICT',
      severity:'REVIEW',
      subject:'BK_BASE.otherIncomePerUnit = 1692',
      finding:'SPRR.pdf page 1\'s rent roll totals Ancillary Income at exactly $1,692 - a '
            + 'PROPERTY-LEVEL MONTHLY total across all 38 units, being the sum of 14 individual unit '
            + 'charges. The field name asserts it is per-unit.',
      effect :'If consumed as dollars per unit per year, the figure is overstated by roughly 38x '
            + 'relative to its source meaning.',
      action :'NOT CHANGED, and flagged REVIEW. This is the figure the sponsor specifically instructed must '
            + 'not be guessed at; it is now traced to a primary document rather than inferred.' }
  ];
};

/* The findings are consulted by the import guard. A BLOCKING finding cannot be
   clicked past - it is not a warning banner. */
window.bkImportBlocked = function(pathId){
  var map = { 'HPM-DETAIL':'HPM-SHOREPOINTE-TRANSCRIPTION',
              'YARDI-T12-PROPERTY':'YARDI-T12-SCOPE',
              'SPRR-TOTAL-AS-T12':'SPRR-PERIOD-14-MONTHS' };
  var id = map[pathId];
  if(!id) return null;
  return window.bkSourceFindings().filter(function(f){ return f.id===id && f.severity==='BLOCKING'; })[0] || null;
};

/* =======================================================================
   5. SOURCE LINEAGE SHEET
   ======================================================================= */
function sheetSourceLineage(){
  var findings = window.bkSourceFindings();
  var aliases  = aliasLoad();
  var proposals= window.bkAliasProposals();
  var pdf      = window.bkPdfCapability();

  var fRows = findings.map(function(f){
    var chip = f.severity==='BLOCKING' ? '<span class="status-chip fail">Blocking</span>'
                                       : '<span class="status-chip warn">Review</span>';
    return '<tr><td class="rowlabel">'+esc(f.subject)+'</td>'
      + '<td data-bk-align="text">'+chip+'</td>'
      + '<td data-bk-align="text">'+esc(f.finding)+'</td>'
      + '<td data-bk-align="text">'+esc(f.action)+'</td></tr>';
  }).join('');

  var aRows = aliases.length ? aliases.map(function(a){
      return '<tr><td class="rowlabel">'+esc(a.from)+'</td><td data-bk-align="text">'+esc(a.to)+'</td>'
        + '<td data-bk-align="text">'+esc(a.basis)+'</td>'
        + '<td data-bk-align="text">'+esc(new Date(a.approvedAt).toLocaleString())+'</td>'
        + '<td style="text-align:center;"><button type="button" class="status-chip" onclick="bkAliasRevoke(\''+esc(a.from)+'\');showSheet(\'Source Lineage\');">REVOKE</button></td></tr>';
    }).join('')
    : '<tr><td class="rowlabel" colspan="5">No aliases have been approved. Property identity is exact-match only.</td></tr>';

  var pRows = proposals.map(function(p){
    return '<div class="note-flag" style="margin-top:12px;"><span>&#9432;</span><div>'
      + '<b>Proposed alias - not applied.</b> <code>'+esc(p.from)+'</code> &rarr; <code>'+esc(p.to)+'</code><br>'
      + esc(p.basis)
      + '<div class="tbl-wrap" style="margin-top:10px;"><table class="fin wrap"><caption>Evidence</caption><tbody>'
      + p.evidence.map(function(e){ return '<tr><td class="rowlabel">'+esc(e[0])+'</td><td data-bk-align="text">'+esc(e[1])+'</td></tr>'; }).join('')
      + '</tbody></table></div>'
      + '<div style="margin-top:10px;"><button type="button" class="status-chip pass" '
      + 'onclick="bkAliasApprove(\''+esc(p.from)+'\',\''+esc(p.to)+'\',\''+esc(p.basis).replace(/'/g,'&#39;')+'\');showSheet(\'Source Lineage\');">'
      + 'APPROVE THIS ALIAS</button></div>'
      + '</div></div>';
  }).join('');

  var main =
      '<div class="tbl-wrap"><table class="fin wrap"><caption>Source Reconciliation Findings</caption>'
    + '<thead><tr><th class="rowlabel-h">Source</th><th style="text-align:left">Severity</th>'
    + '<th style="text-align:left">Finding</th><th style="text-align:left">Effect On Import</th></tr></thead>'
    + '<tbody>'+fRows+'</tbody></table></div>'

    + '<div class="tbl-wrap" style="margin-top:20px;"><table class="fin wrap"><caption>File Formats This Application Reads</caption>'
    + '<thead><tr><th class="rowlabel-h">Format</th><th style="text-align:left">Status</th><th style="text-align:left">Notes</th></tr></thead><tbody>'
    + '<tr><td class="rowlabel">.xlsx / .xlsm</td><td data-bk-align="text"><span class="status-chip pass">Read natively</span></td>'
    +   '<td data-bk-align="text">Embedded reader. No internet connection required. Verified cell-for-cell against an independent reader across 42,417 cells of the two real portfolio workbooks.</td></tr>'
    + '<tr><td class="rowlabel">.csv</td><td data-bk-align="text"><span class="status-chip pass">Read natively</span></td><td data-bk-align="text">Text parse.</td></tr>'
    + '<tr><td class="rowlabel">.xls / .xlsb</td><td data-bk-align="text"><span class="status-chip warn">Refused by name</span></td>'
    +   '<td data-bk-align="text">Legacy binary formats. Re-save as .xlsx.</td></tr>'
    + '<tr><td class="rowlabel">.pdf</td><td data-bk-align="text"><span class="status-chip fail">Not extracted</span></td>'
    +   '<td data-bk-align="text">'+esc(pdf.reason)+' '+esc(pdf.evidence)+'</td></tr>'
    + '</tbody></table></div>'

    + '<div class="tbl-wrap" style="margin-top:20px;"><table class="fin wrap"><caption>Approved Property Aliases</caption>'
    + '<thead><tr><th class="rowlabel-h">Source Name</th><th style="text-align:left">Resolves To</th>'
    + '<th style="text-align:left">Basis</th><th style="text-align:left">Approved</th><th style="text-align:center">Action</th></tr></thead>'
    + '<tbody>'+aRows+'</tbody></table></div>'
    + pRows
    + '<div class="note-flag" style="margin-top:14px;"><span>&#9888;</span><div>'
    + '<b>Identity is exact-match plus an explicit table.</b> The matcher was not loosened: no '
    + 'neighbourhood-suffix stripping, no "text before the hyphen" rule. Either would merge '
    + '1363 Seaview and 1387 Seaview. An approved alias resolves one named pair and nothing else.'
    + '</div></div>';

  return { title:'Source Lineage', crumbs:'System',
           desc:'What each source is, what it may write, and every identity decision made about it.',
           meta:{ Findings:findings.length,
                  Blocking:findings.filter(function(f){return f.severity==='BLOCKING';}).length,
                  Aliases:aliases.length, Status:'Reference' },
           main:main,
           sidebar: shell(card('Write Authority',
             '<div class="metric-list">'
             + '<div class="metric-row"><span class="k">Automatic Writes</span><span class="v"><span class="status-chip pass">None</span></span></div>'
             + '<div class="metric-row"><span class="k">Blocking Findings</span><span class="v">'+findings.filter(function(f){return f.severity==='BLOCKING';}).length+'</span></div>'
             + '<div class="metric-row"><span class="k">Open Reviews</span><span class="v">'+findings.filter(function(f){return f.severity==='REVIEW';}).length+'</span></div>'
             + '<div class="metric-row"><span class="k">PDF Extraction</span><span class="v"><span class="status-chip fail">Not claimed</span></span></div>'
             + '</div>')) };
}
reg('Source Lineage', sheetSourceLineage, 'qa');

})();
