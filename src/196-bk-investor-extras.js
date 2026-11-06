/* AFTER-TAX AND EXIT-YEAR PAGES FOR THE INVESTOR PDF, and the After-Tax Report (2.2). Nothing is calculated here: the after-tax figures are read from the after-tax engine (src/027, bkAfterTaxV18, with the recovery period and its basis
   from bkRecoveryPeriod) and the exit-year rows from bkExitYearTable (src/192). The same figures feed the investor PDF pages (src/145) and the page in Reports. */
(function(){
'use strict';
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function M(v){ v = Math.round(Number(v) || 0); return v < 0 ? '($' + Math.abs(v).toLocaleString('en-US') + ')' : '$' + v.toLocaleString('en-US'); }
function P(v){ return isFinite(v) ? (v * 100).toFixed(2) + '%' : '\u2014'; }
function X(v){ return isFinite(v) ? v.toFixed(2) + 'x' : '\u2014'; }
function isDev(s){ return /develop/i.test(String((s || {}).dealType || '')); }
function data(){ var s = safe(function(){ return bkLoad(); }, null); if(!s || isDev(s)) return null; var x = safe(function(){ return bkAfterTaxV18(); }, null); if(!x || !x.rows || !x.rows.length) return null; x.life2 = safe(function(){ return bkRecoveryPeriod(s); }, null); return x; }
/* the figures, as rows: [label, value, class] */
function parts(x){
  var yrs = x.rows.slice(0, 10), life = x.life2;
  return {
    yrs: yrs,
    sale: [['Total acquisition basis', M(x.totalBasis)], ['Land value', M(x.landValue)], ['Accumulated depreciation', M(x.accumDepr)], ['Adjusted basis at sale', M(x.adjustedBasis)], ['Net sale proceeds', M(x.u.netSale)], ['Total taxable gain', M(x.totalGain), 'tot'],
      ['Suspended losses released at sale', M(-x.lossUsedAtSale)], ['Unrecaptured Sec. 1250 gain', M(x.recaptureBase)], ['Depreciation recapture tax', M(-x.recaptureTax)], ['Remaining capital gain', M(x.capGainBase)], ['Capital gains tax', M(-x.capGainTax)], ['Total sale-year tax', M(-x.saleTax), 'tot']],
    ret: [['Levered IRR', P(x.preTaxIRR), P(x.atIRR)], ['Equity multiple', X(x.preTaxMOIC), X(x.atMOIC)]],
    basis: life ? ('Recovery period ' + life.years + ' years. ' + life.basis + (life.override ? ' (entered by the user)' : '')) : (x.life + '-year recovery period')
  };
}
function tbl(head, rows){ return '<table><thead><tr>' + head.map(function(h, i){ return '<th' + (i ? '' : ' style="text-align:left"') + '>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>'; }
window.bkAfterTaxPdfHtml = function(){
  var x = data(); if(!x) return null; var p = parts(x), line = function(l, k, cls){ return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td class="l">' + l + '</td>' + p.yrs.map(function(r){ return '<td>' + M(k(r)) + '</td>'; }).join('') + '</tr>'; };
  var cf = tbl(['After-tax cash flow'].concat(p.yrs.map(function(r){ return 'Yr ' + r.y; })), [line('NOI after reserves', function(r){ return r.noi; }), line('Less: interest', function(r){ return -r.interest; }), line('Less: depreciation', function(r){ return -r.depr; }),
    line('Taxable income', function(r){ return r.taxableIncome; }, 'tot'), line('Suspended loss carryforward', function(r){ return r.lossCF; }), line('Ordinary income tax', function(r){ return -r.taxDue; }, 'tot')]);
  var sale = '<table><tbody>' + p.sale.map(function(a){ return '<tr' + (a[2] ? ' class="' + a[2] + '"' : '') + '><td class="l">' + a[0] + '</td><td>' + a[1] + '</td></tr>'; }).join('') + '</tbody></table>';
  var ret = tbl(['Levered, property level', 'Pre-tax', 'After-tax'], p.ret.map(function(a){ return '<tr><td class="l">' + a[0] + '</td><td>' + a[1] + '</td><td><b>' + a[2] + '</b></td></tr>'; }));
  return '<h2>After-tax returns</h2>' + cf + '<div class="g2 mt" style="grid-template-columns:1.2fr .8fr"><div><h2>Sale-year tax</h2>' + sale + '</div><div><h2>Pre-tax and after-tax</h2>' + ret + '</div></div>'
    + '<div class="note" style="margin-top:8px"><b>Depreciation basis.</b> ' + esc(p.basis) + '. Straight-line on a ' + M(x.deprBasis) + ' depreciable basis; passive losses carried forward and released at sale; Sec. 1250 recapture and long-term capital gains at the entered rates. Ordinary tax at ' + P(Number(x.s.taxRate)) + '.</div>';
};
window.bkExitYearPdfHtml = function(){
  var rows = safe(function(){ return window.bkExitYearTable ? window.bkExitYearTable() : null; }, null); if(!rows || !rows.length) return null;
  return '<h2>Returns by exit year</h2>' + tbl(['If sold at the end of', 'Levered IRR', 'Equity multiple', 'Equity profit'], rows.map(function(r){ return '<tr' + (r.sel ? ' class="tot"' : '') + '><td class="l">Year ' + r.y + (r.sel ? ' (the hold)' : '') + '</td><td>' + P(r.irr) + '</td><td>' + X(r.moic) + '</td><td>' + M(r.profit) + '</td></tr>'; }))
    + '<div class="note" style="margin-top:8px">Each row sells the property at the end of that year, at the same exit cap rate and selling costs, and runs the monthly returns engine for that hold. The row marked (the hold) is the deal\'s own result.</div>';
};
/* the page in Reports */
function reportTable(cap, head, rows){ return '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>' + cap + '</caption><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table></div>'; }
if(typeof RENDERERS !== 'undefined') RENDERERS['After-Tax Report'] = function(){
  var x = data(), s = safe(function(){ return bkLoad(); }, {}) || {};
  if(!x) return { title:'After-Tax Report', crumbs:'Reports', desc:'Depreciation, ordinary income tax and the sale-year tax on the levered cash flow.', meta:{ Property:s.name || '' }, sidebar:'', main:'<div class="note-flag"><span>&#9432;</span><div>The after-tax report applies to acquisitions with a deal entered. Open or create one first.</div></div>' };
  var p = parts(x), r0 = function(l, k, cls){ return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td class="rowlabel">' + l + '</td>' + p.yrs.map(function(r){ return '<td>' + M(k(r)) + '</td>'; }).join('') + '</tr>'; };
  var main = reportTable('After-Tax Cash Flow', '<th class="rowlabel-h">Line Item</th>' + p.yrs.map(function(r){ return '<th>Year ' + r.y + '</th>'; }).join(''),
      r0('NOI After Reserves', function(r){ return r.noi; }) + r0('Less: Interest Expense', function(r){ return -r.interest; }) + r0('Less: Depreciation', function(r){ return -r.depr; }) + r0('Taxable Income', function(r){ return r.taxableIncome; }, 'grandtotal') + r0('Suspended Loss Carryforward', function(r){ return r.lossCF; }) + r0('Ordinary Income Tax', function(r){ return -r.taxDue; }, 'grandtotal'))
    + reportTable('Sale-Year Tax', '<th class="rowlabel-h">Line Item</th><th>Amount</th>', p.sale.map(function(a){ return '<tr' + (a[2] ? ' class="grandtotal"' : '') + '><td class="rowlabel">' + a[0] + '</td><td>' + a[1] + '</td></tr>'; }).join(''))
    + reportTable('Pre-Tax vs. After-Tax Returns', '<th class="rowlabel-h">Metric</th><th>Pre-Tax</th><th>After-Tax</th>', p.ret.map(function(a){ return '<tr><td class="rowlabel">' + a[0] + '</td><td>' + a[1] + '</td><td>' + a[2] + '</td></tr>'; }).join(''))
    + '<div class="note-flag"><span>&#9432;</span><div><b>Depreciation basis.</b> ' + esc(p.basis) + '. Read from the After-Tax page; nothing is recalculated here.</div></div>';
  return { title:'After-Tax Report', crumbs:'Reports', desc:'Depreciation, ordinary income tax and the sale-year tax on the levered cash flow, with the recovery period and why.', meta:{ Property:s.name || '', 'Recovery':x.life + ' yrs', 'After-tax IRR':P(x.atIRR), 'After-tax multiple':X(x.atMOIC) }, sidebar:'', main:main };
};
})();
