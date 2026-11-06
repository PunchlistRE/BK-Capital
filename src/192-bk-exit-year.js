/* EXIT-YEAR RETURNS and INTEREST COVERAGE (1.3). Two read-only tables built from the existing engines; nothing is calculated here beyond a ratio.
   Exit-year table (Returns, acquisitions): the levered IRR, equity multiple and equity profit if the deal were sold at the end of each year of the hold, each year run through the same monthly returns engine with the hold set to that year (bkRunWith).
   Interest coverage (Covenant Monitor, acquisitions): the lender NOI over each year's interest, beside the lender DSCR. */
(function(){
'use strict';
function isDev(s){ return /develop/i.test(String((s || {}).dealType || '')); }
var M = function(v){ v = Math.round(Number(v) || 0); return (v < 0 ? '($' + Math.abs(v).toLocaleString('en-US') + ')' : '$' + v.toLocaleString('en-US')); };
var P = function(v){ return isFinite(v) ? (v * 100).toFixed(2) + '%' : '-'; }, X = function(v){ return isFinite(v) ? v.toFixed(2) + 'x' : '-'; };
window.bkExitYearTable = function(){
  var s = bkLoad(); if(isDev(s)) return null;
  var hold = Math.max(1, Math.min(15, Math.round(Number(s.holdYears) || 10))), rows = [];
  for(var y = 1; y <= hold; y++){
    var r = window.bkInCase(function(){ return bkRunWith({ holdYears:y }, function(){ var x = bkMonthlyReturns(); return { irr:x.irr, moic:x.moic, profit:isFinite(x.profit) ? x.profit : (Number(x.dist) || 0) - (Number(x.contrib) || 0) }; }); }) || {};
    rows.push({ y:y, irr:r.irr, moic:r.moic, profit:r.profit, sel:y === hold });
  }
  return rows;
};
window.bkInterestCoverage = function(){
  var s = bkLoad(); if(isDev(s)) return null;
  var u = bkAnnualCF(), d = bkDebt(); if(!d || !(d.loan > 0)) return null;
  return u.arr.map(function(a, i){ var ds = (d.annual || [])[i] || {}, ln = bkLenderNoi(a, s), int = Number(ds.interest) || 0, pay = Number(ds.payment) || 0; return { y:a.y, noi:ln, interest:int, payment:pay, icr:int > 0 ? ln / int : NaN, dscr:pay > 0 ? ln / pay : NaN }; });
};
function card(title, head, rows){ return '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>' + title + '</caption><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table></div>'; }
function wrap(sheet, build){ var prev = window.RENDERERS && RENDERERS[sheet]; if(typeof prev !== 'function') return;
  RENDERERS[sheet] = function(){ var o = prev.apply(this, arguments); try { var add = build(); if(add && o && typeof o.main === 'string') o.main += add; } catch(e){} return o; }; }
wrap('Returns', function(){
  var rows = window.bkExitYearTable(); if(!rows) return '';
  return card('If Sold at the End of Each Year - levered returns by exit year', '<th class="rowlabel-h">Exit at the end of</th><th>Levered IRR</th><th>Equity Multiple</th><th>Equity Profit</th>',
    rows.map(function(r){ return '<tr' + (r.sel ? ' class="subtotal"' : '') + '><td class="rowlabel">Year ' + r.y + (r.sel ? ' (the hold)' : '') + '</td><td>' + P(r.irr) + '</td><td>' + X(r.moic) + '</td><td>' + M(r.profit) + '</td></tr>'; }).join(''))
    + '<div class="note-flag"><span>&#9432;</span><div>Each row sells the property at the end of that year (same exit cap and costs) and runs the monthly returns engine for that hold. The row marked (the hold) is the deal\'s own result.</div></div>';
});
wrap('Covenant Monitor', function(){
  var rows = window.bkInterestCoverage(); if(!rows) return '';
  return card('Interest Coverage by Year - beside the Lender DSCR', '<th class="rowlabel-h">Year</th><th>' + bkDscrShort('lender') + ' NOI</th><th>Interest</th><th>Interest coverage</th><th>' + bkDscrShort('lender') + '</th>',
    rows.map(function(r){ return '<tr><td class="rowlabel">Year ' + r.y + '</td><td>' + M(r.noi) + '</td><td>' + M(r.interest) + '</td><td>' + X(r.icr) + '</td><td>' + X(r.dscr) + '</td></tr>'; }).join(''))
    + '<div class="note-flag"><span>&#9432;</span><div>Interest coverage is the lender NOI (' + bkDscrBasis('lender') + ') over the year\'s interest; the DSCR is the same NOI over interest plus principal.</div></div>';
});
})();
