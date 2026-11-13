/* THE ONE PDF / PRINT STYLE. Every printed table, heading and chip in the sheets, the browser print and the full report reads from this, so a Debt sheet, a Depreciation sheet and the
   Cash Flow Report cannot drift apart. It is the Cash Flow Report look: section names in blue, a plain header over one rule, hairline rows, the label column ruled off,
   no fills, figures right-aligned on one line, text left-aligned and wrapping, every table the full printable width.
   BK_PDF_STYLE(scope) returns the rules for a page whose content sits under `scope` (the document for the browser print, .pg-body for the report pack).
   Specificity: the scope already holds an id; one :not(#bk-pdf) adds another, so these win over every older screen rule without !important races. */
(function(){
var INK = '#0e2a4a', HEAD = '#2c4a6b', DIM = '#566a80', HAIR = '#e3e8ee';
window.BK_PDF_TOKENS = { ink:INK, head:HEAD, dim:DIM, hair:HAIR };
window.BK_PDF_STYLE = function(scope){
  var X = ':not(#bk-pdf)', T = scope + ' table.fin' + X, C = scope + ' .tbl-wrap' + X, R = [];
  /* frames and fills go: the page is the frame */
  R.push(C + '{background:transparent !important;border:0 !important;box-shadow:none !important;width:100% !important;max-width:100% !important;overflow:visible !important}');
  R.push(scope + ' .main-col' + X + ',' + scope + ' .body-grid' + X + '{padding-left:0 !important;padding-right:0 !important;margin-left:0 !important;margin-right:0 !important}');
  /* section name */
  R.push(T + '>caption{caption-side:top;width:100% !important;max-width:none !important;text-align:left !important;background:transparent !important;border:0 !important;box-shadow:none !important;color:' + HEAD + ' !important;font-size:11px !important;font-weight:700 !important;letter-spacing:.02em !important;text-transform:none !important;padding:10px 0 4px !important}');
  R.push(T + '>caption:before,' + T + '>caption i{display:none !important}');
  /* the table */
  R.push(T + '{width:100% !important;max-width:100% !important;min-width:0 !important;border-collapse:collapse !important;border:0 !important;background:transparent !important;table-layout:auto}');
  R.push(T + ' thead th,' + T + ' th{background:transparent !important;color:' + INK + ' !important;font-size:9.4px !important;font-weight:600 !important;letter-spacing:0 !important;text-transform:none !important;border:0 !important;border-bottom:1px solid ' + INK + ' !important;border-radius:0 !important;box-shadow:none !important;padding:4px 6px !important;vertical-align:bottom}');
  R.push(T + ' td{background:transparent !important;border:0 !important;border-bottom:1px solid ' + HAIR + ' !important;box-shadow:none !important;padding:4px 6px !important;vertical-align:middle;font-size:9.4px !important;min-width:0}');
  /* the label divider is a shadow, not a border: a border breaks at every row's hairline, a shadow runs unbroken the full height of the table (as in the Cash Flow Report) */
  R.push(T + ' tr>:first-child{border-right:0 !important;box-shadow:1px 0 0 ' + INK + ' !important}');
  R.push(T + ':not(.bk-yrs) tr>:first-child{width:30% !important;min-width:30% !important;max-width:30% !important}' + T + '.bk-yrs tr>:first-child{width:22% !important;min-width:22% !important;max-width:22% !important}');
  /* figures right, on one line; text left, wrapping (text last so a text cell never inherits the figure rule) */
  R.push(T + ' td[data-bk-kind="num"],' + T + ' td.v[data-bk-kind="num"]{text-align:right !important;white-space:nowrap !important}');
  R.push(T + ' td[data-bk-kind="text"],' + T + ' td[data-bk-kind="input-text"],' + T + ' td:first-child{text-align:left !important;white-space:normal !important;overflow-wrap:anywhere !important;word-break:normal !important}');
  R.push(T + ' td:first-child{color:' + INK + ' !important}');
  /* subtotals and totals */
  R.push(T + ' tr.grandtotal td,' + T + ' tr.total td,' + T + ' tr.subtotal td{font-weight:700 !important;border-top:1px solid ' + INK + ' !important}');
  /* inputs print as text, never as boxes or yellow cells */
  R.push(scope + ' input' + X + ',' + scope + ' select' + X + ',' + scope + ' textarea' + X + '{background:transparent !important;border:0 !important;box-shadow:none !important;font:inherit !important;color:inherit !important}');
  /* chips: small, one line, never wider than their cell */
  R.push(T + ' .status-chip{display:inline-block !important;white-space:nowrap !important;max-width:100% !important;box-sizing:border-box;min-width:0 !important;padding:1px 5px !important;font-size:7.4px !important;overflow:hidden}');
  /* cards with a title (Property CF, sensitivity, summaries) use the same section name */
  R.push(scope + ' .pf-card' + X + '>.t,' + scope + ' .bk-sx-card' + X + ' .bk-sx-title{background:transparent !important;color:' + HEAD + ' !important;border:0 !important;font-size:11px !important;font-weight:700 !important;padding:10px 0 4px !important;box-shadow:none !important;break-after:avoid}');
  R.push(scope + ' .pf-card' + X + ',' + scope + ' .bk-sx-card' + X + '{border:0 !important;box-shadow:none !important;background:transparent !important;break-inside:avoid}');
  R.push(scope + ' .pf-card' + X + '>.t:before,' + scope + ' .pf-card' + X + '>.t i,' + scope + ' .bk-sx-card' + X + ' .bk-sx-title:before{display:none !important}');
  return R.join('');
};
})();
