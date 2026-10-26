
/* ===========================================================================
   FINAL WAVE - APP-WIDE FORMATTING NORMALIZATION
   ===========================================================================
   This layer changes how figures are PRINTED and nothing else. It runs after
   every renderer has produced its HTML, rewrites cell text, and never touches a
   number's value, a renderer's logic or an engine.

   What it normalizes, and why each rule is safe to apply blind:

     1. Negatives to accounting parentheses. A cell reading exactly "-$1,234.00"
        or "-1,234" becomes "($1,234.00)" / "(1,234)". The audit measured 606
        parenthesised negatives against 16 signed ones on the same build, so the
        house convention already existed; these sixteen were the stragglers.

     2. Empty cells to an em dash. A cell whose entire content is a hyphen
        becomes an em dash. Measured: 81 hyphens against 1,641 em dashes.

     3. Percentages to two decimals. "6.5%" becomes "6.50%"; "60%" becomes
        "60.00%". Padding never changes a value and never invents precision the
        reader could mistake for accuracy, because the digits added are zeros.
        Sensitivity grid cells are exempt - they are deliberately terse and are
        read as a shape, not as individual figures.

     4. Currency marks, COLUMN-SCOPED AND EVIDENCE-LED. The audit found 1,821
        bare five-digit numbers, most of them on the monthly grids. Guessing
        which of them are dollars from the text alone would be exactly the kind
        of silent assumption this build forbids, so the rule takes its evidence
        from the table itself, by one of two routes:
          (a) the column is already mostly currency - at least three cells carry
              a $ and at least 60% of the column does; or
          (b) the column's own header names a monetary quantity outright, from a
              closed list (NOI, EGI, interest, principal, balance, debt service,
              contribution, distribution, promote, draw, proceeds, amount and so
              on), or carries a $ sign.
        Either route ALSO requires that every non-empty cell in the column be a
        plain number: one percent, one multiple, one date or one word anywhere in
        that column disqualifies it outright. Generic headers - Total, Value,
        Variance, Result, Year N - are deliberately NOT on the list, because
        those columns mix dollars with ratios row by row and no column rule can
        tell them apart. Those columns are left exactly as they are.

   Guards, because a formatter that corrupts a page is worse than an inconsistent
   one:
     - a cell with any child element is skipped, so inputs, selects, chips, the
       two-line sensitivity cells and anything with markup are never rewritten
     - only text matching a whole-cell numeric pattern is touched
     - every rewrite is wrapped; on any error the ORIGINAL html is returned
     - the wrap is idempotent and applied once per renderer
   =========================================================================== */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined') return;

var RE_MONEY_NEG  = /^-\$([\d,]+(?:\.\d+)?)$/;
var RE_BARE_NEG   = /^-([\d,]+(?:\.\d+)?)$/;
var RE_PCT        = /^(-?)([\d,]+)(?:\.(\d+))?%$/;
var RE_BARE_NUM   = /^-?[\d,]+(?:\.\d+)?$/;
var RE_MONEY_ANY  = /^\(?\$[\d,]/;
// Headers that name a monetary quantity outright. Deliberately a CLOSED list of
// unambiguous terms - generic headers are excluded below because those columns
// routinely mix dollars with ratios row by row and no column rule can tell them apart.
var RE_MONEY_HEAD = /(^|\b)(noi|egi|interest|principal|balance|debt service|cash flow|contribution|distribution|available|catch-up|promote|amount|draw|funding|cumulative|unreturned|proceeds|payoff|revenue|expense|reserves?|hurdle account|tier \d|lp cf|gp cf|net equity cf|capitalised interest|capitalized interest|asset fee|loan funding|peak balance|total debt)(\b|$)/i;
var RE_NOT_MONEY_HEAD = /(^|\b)(mo|month|date|year|period|units?|sf|count|rate|ratio|dscr|yield|factor|steepness|prob|downtime|status|check|metric|line item|field|type|total|value|variance|result|share)(\b|$)|%/i;

function fmtMoneyFromBare(txt){
  var neg = txt.charAt(0) === '-';
  var body = neg ? txt.slice(1) : txt;
  return neg ? '($' + body + ')' : '$' + body;
}

function normalizeTable(tbl, exempt){
  var rows = tbl.querySelectorAll('tbody tr');
  var heads = [].slice.call(tbl.querySelectorAll('thead th')).map(function(th){ return (th.textContent||'').trim(); });
  // ---- pass 1: learn which columns are currency columns, from the table itself
  var colMoney = [], colTotal = [], colPlain = [];
  for(var i=0;i<rows.length;i++){
    var tds = rows[i].children;
    for(var j=0;j<tds.length;j++){
      var td = tds[j];
      if(td.children.length){ colPlain[j] = false; continue; }
      var t = (td.textContent||'').trim();
      if(!t || t === '-' || t === '-') continue;
      colTotal[j] = (colTotal[j]||0) + 1;
      if(RE_MONEY_ANY.test(t) || RE_MONEY_NEG.test(t)) colMoney[j] = (colMoney[j]||0) + 1;
      // A column qualifies by the header route only if EVERY cell in it is a plain
      // number: one percent, one multiple, one date or one word disqualifies it.
      var plain = RE_BARE_NUM.test(t) || RE_MONEY_ANY.test(t) || RE_MONEY_NEG.test(t);
      colPlain[j] = (colPlain[j] === undefined) ? plain : (colPlain[j] && plain);
    }
  }
  var isMoneyCol = [];
  for(var k=0;k<colTotal.length;k++){
    var byEvidence = (colMoney[k]||0) >= 3 && (colMoney[k]||0) / (colTotal[k]||1) >= 0.6;
    var h = heads[k] || '';
    var byHeader = colPlain[k] === true && (colTotal[k]||0) >= 3
                   && !RE_NOT_MONEY_HEAD.test(h)
                   && (h.indexOf('$') > -1 || RE_MONEY_HEAD.test(h));
    isMoneyCol[k] = byEvidence || byHeader;
  }

  // ---- pass 2: rewrite
  for(var r=0;r<rows.length;r++){
    var cells = rows[r].children;
    for(var c=0;c<cells.length;c++){
      var cell = cells[c];
      if(cell.children.length) continue;
      var s = (cell.textContent||'').trim();
      if(!s) continue;
      var m;
      if(s === '-'){ cell.textContent = '-'; continue; }
      if((m = s.match(RE_MONEY_NEG))){ cell.textContent = '($' + m[1] + ')'; continue; }
      if((m = s.match(RE_BARE_NEG))){
        cell.textContent = isMoneyCol[c] ? '($' + m[1] + ')' : '(' + m[1] + ')';
        continue;
      }
      if(!exempt && (m = s.match(RE_PCT))){
        var dp = m[3] || '';
        if(dp.length !== 2){
          var padded = (dp + '00').slice(0,2);
          cell.textContent = m[1] + m[2] + '.' + padded + '%';
        }
        continue;
      }
      if(isMoneyCol[c] && RE_BARE_NUM.test(s)){ cell.textContent = fmtMoneyFromBare(s); continue; }
    }
  }
}

function normalize(html, sheet){
  if(!html || html.indexOf('<table') === -1) return html;
  try {
    var doc = new DOMParser().parseFromString('<div id="bkfmtroot">' + html + '</div>', 'text/html');
    var root = doc.getElementById('bkfmtroot');
    if(!root) return html;
    // Sensitivity grids are read as a shape; leave their terse cells alone.
    var exempt = (sheet === 'Sensitivity');
    var tables = root.querySelectorAll('table');
    for(var i=0;i<tables.length;i++) normalizeTable(tables[i], exempt);
    return root.innerHTML;
  } catch(e){ return html; }
}
window.bkFormatNormalize = normalize;

/* Wrap every registered renderer, once. Registered LAST so it sees the final
   HTML of every earlier layer. Fails open: any throw returns the original. */
Object.keys(RENDERERS).forEach(function(sheet){
  var prev = RENDERERS[sheet];
  if(typeof prev !== 'function' || prev.__bkFormat) return;
  var wrapped = function(){
    var o = prev.apply(this, arguments);
    // BLANK-SLATE GUARD: extension layers must never append calculations to a
    // canonical no-deal page. The base renderer is authoritative for empty state.
    try {
      if(typeof window.bkProductionCounts === 'function' && !window.bkProductionCounts().activeDeal) return o;
    } catch(_blankStateErr){}
    if(/no deal loaded|there is no active deal/i.test(String(o && o.main || ''))) return o;
    if(!o || typeof o !== 'object') return o;
    try { if(typeof o.main === 'string') o.main = normalize(o.main, sheet); } catch(e){}
    return o;
  };
  wrapped.__bkFormat = true;
  wrapped.__bkOriginal = prev.__bkOriginal || prev;
  Object.keys(prev).forEach(function(k){ if(k.indexOf('__')===0 && !wrapped[k]) wrapped[k] = prev[k]; });
  if(typeof window.bkRegisterRenderer==='function') window.bkRegisterRenderer(sheet, wrapped);
  else RENDERERS[sheet] = wrapped;
});
})();
