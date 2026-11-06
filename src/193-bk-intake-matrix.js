/* INTAKE COMPATIBILITY MATRIX (1.5). What the importers have actually been proven on, with exactly four statuses:
     Validated  read correctly on real documents, by a check that compares the figures with the document's own;
     Partial    read, with gaps named, or proven only on synthetic files or on files that are not in the repository;
     Failed     a known case the reader cannot read (it says so);
     Untested   no evidence either way.
   The evidence column names the test or benchmark. A status is only ever raised by adding the real document and its check; audit/INTAKE_COMPATIBILITY.md carries the same table. */
(function(){
'use strict';
window.BK_INTAKE_STATUSES = ['Validated', 'Partial', 'Failed', 'Untested'];
window.BK_INTAKE_MATRIX = [
  { source:'LoopNet listing, printed or saved page (PDF)', status:'Validated', evidence:'Two real listings: 52 Hoyt St, Stamford (priced, unit mix, financial summary) and 743-751 Arctic St, Bridgeport (priced, no rents, no financials). audit/loopnet_import_test.js, audit/intake_test.js' },
  { source:'LoopNet favorites list', status:'Validated', evidence:'One real list: 12 rows equal the 12 the list states; price, size and printed cap equal each property\'s own listing page. audit/intake_test.js' },
  { source:'Facts-only flyer (no income)', status:'Validated', evidence:'One real flyer: facts read, nothing invented, address from its heading. audit/intake_test.js' },
  { source:'Offering memorandum, text PDF', status:'Partial', evidence:'Five real OMs: 30 of 35 fields correct (86%); financial 19 of 20, descriptive 11 of 15. audit/ingest_bench (baseline 2026-11-05)' },
  { source:'Owner worksheet (spreadsheet), statement found by its arithmetic', status:'Partial', evidence:'One real workbook read correctly (NOI and six expense lines tie); other layouts are synthetic. audit/intake_test.js, audit/sheet_ingest_test.js' },
  { source:'Yardi T-12 (workbook and PDF print)', status:'Partial', evidence:'Compared with an independent build on the owner\'s files, which are not in the repository, so the audit cannot re-run it. audit/import_test.js' },
  { source:'Rent roll (CSV, XLSX, PDF)', status:'Partial', evidence:'Synthetic Yardi-style rolls, every unit and the apply / replace / add behavior checked; no real rent roll yet. audit/import_rr_test.js, audit/nnn_import_test.js' },
  { source:'Development pro forma and development OM', status:'Partial', evidence:'Layouts that differ from each other, synthetic. audit/import_hub_test.js' },
  { source:'Offering memorandum, scanned (image-only) PDF', status:'Untested', evidence:'Reads through OCR when the OCR libraries load; not part of the audit.' },
  { source:'LoopNet listing, live (URL)', status:'Untested', evidence:'The reader takes a saved or printed page; a live listing has not been fetched.' },
  { source:'LoopNet multi-building listing, land listing, cover photo', status:'Untested', evidence:'No real example yet.' },
  { source:'PDF with no readable text and no OCR', status:'Failed', evidence:'Reads nothing and says so ("This PDF has no readable text"); use the spreadsheet or CSV export.' }
];
var esc = function(v){ return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
var prev = window.RENDERERS && window.RENDERERS['Import'];
if(typeof prev === 'function') window.RENDERERS['Import'] = function(){ var o = prev.apply(this, arguments);
  try { if(o && typeof o.main === 'string') o.main += '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>What the importers have been proven on</caption><thead><tr><th class="rowlabel-h">Source</th><th>Status</th><th style="text-align:left">Evidence</th></tr></thead><tbody>'
    + window.BK_INTAKE_MATRIX.map(function(r){ var cls = r.status === 'Validated' ? 'pass' : r.status === 'Failed' ? 'fail' : r.status === 'Partial' ? 'warn' : 'na'; return '<tr><td class="rowlabel bk-wrap" data-bk-align="text">' + esc(r.source) + '</td><td><span class="status-chip ' + cls + '">' + r.status.toUpperCase() + '</span></td><td class="bk-wrap" data-bk-align="text">' + esc(r.evidence) + '</td></tr>'; }).join('')
    + '</tbody></table></div><div class="note-flag"><span>&#9432;</span><div>Four statuses only: <b>Validated</b> (read correctly on real documents), <b>Partial</b> (gaps named, or synthetic files, or files not in the repository), <b>Failed</b> (a known case it cannot read) and <b>Untested</b>. A status is raised only by adding the real document and its check.</div></div>'; } catch(e){}
  return o; };
})();
