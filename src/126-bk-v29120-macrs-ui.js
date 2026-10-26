
/* ===========================================================================
   V29.12.0 - TAX-GRADE DEPRECIATION: CONTROLS AND DISCLOSURE
   Wraps the Depreciation and After-Tax renderers (same pattern as the
   underwriting-conventions panel). All numbers come from bkMacrsSchedule(),
   bkAfterTaxV18() and bkCostSegBenefit(); nothing is calculated here.
   =========================================================================== */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof window.bkMacrs !== 'function' && typeof window.bkMacrs !== 'object') return;
function n0(v){ var x = Number(v) || 0, a = Math.abs(x); var b = a.toLocaleString('en-US', {maximumFractionDigits:0}); return x < 0 ? '($' + b + ')' : '$' + b; }
function pc(v, d){ return isFinite(v) ? (v * 100).toFixed(d == null ? 2 : d) + '%' : '-'; }
function chip(cls, t){ return '<span class="status-chip ' + (cls || '') + '">' + t + '</span>'; }
function hasDeal(){ try { return typeof window.bkHasActiveDeal === 'function' ? !!window.bkHasActiveDeal() : true; } catch(e){ return false; } }
function raw(){ var s = bkLoad(); return (s._depr && s._depr.settings) || {}; }
function sel(key, opts, cur, conv){
  return '<select onchange="bkDeprSet(\'' + key + '\',' + (conv || 'this.value') + ')">' + opts.map(function(o){
    return '<option value="' + o[0] + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>';
}
function row(label, ctl, why, status){ return '<tr><td class="rowlabel">' + label + '</td><td class="v">' + ctl + '</td><td data-bk-align="text">' + why + '</td><td>' + (status || '') + '</td></tr>'; }
function input(key, val, conv, w){ return '<input type="text" value="' + val + '" style="width:' + (w || 110) + 'px;text-align:left" onchange="bkDeprSet(\'' + key + '\',' + conv + ')">'; }

function controls(){
  var r = raw(), macrs = r.depMethod === 'macrs', e = window.bkDepreciation();
  var legacy = !macrs
    ? '<div class="note-flag" style="margin-bottom:12px"><span>&#9888;</span><div><b>This deal uses the simplified straight-line schedule.</b> It was set up before tax-grade depreciation, so it recovers every class straight-line with no MACRS tables or conventions and keeps its numbers until you change it.'
      + '<div style="margin-top:8px"><button type="button" class="status-chip pass" onclick="bkDeprSet(\'depMethod\',\'macrs\')">SWITCH TO TAX-GRADE MACRS</button></div></div></div>'
    : '';
  var elect = r.bonusMode === 'elect';
  var rows = row('Depreciation Method', sel('depMethod', [['macrs', 'Tax-grade MACRS (Pub. 946)'], ['simplified', 'Simplified straight-line (legacy)']], macrs ? 'macrs' : 'simplified'),
      'MACRS applies the IRS recovery tables with half-year, mid-quarter and mid-month conventions, the disposal-year rule and class-by-class recapture.', macrs ? chip('pass', 'TAX-GRADE') : chip('warn', 'LEGACY'));
  if(macrs){
    rows += row('Placed in Service', input('placedInService', r.placedInService || r.closeDate || '', 'this.value.trim()', 120), 'YYYY-MM-DD. Defaults to the closing date. Drives the first-year convention (month or quarter).', chip('', 'INPUT'))
      + row('Bonus Depreciation', sel('bonusMode', [['statutory', 'Statutory rate for the in-service date'], ['elect', 'Elect a rate']], elect ? 'elect' : 'statutory'),
            'Statutory: 100% for property acquired after 19 Jan 2025 (P.L. 119-21), the TCJA phase-down before that. Applies to recovery periods of 20 years or less only.', chip('', 'INPUT'))
      + (elect ? row('Elected Bonus %', input('bonusPct', ((Number(r.bonusPct) || 0) * 100).toFixed(0), '(parseFloat(this.value)||0)/100', 70), 'Percent of eligible basis expensed in the first year.', chip('', 'INPUT')) : '')
      + row('Cost Segregation Fee', input('costSegFee', (Number(r.costSegFee) || 0).toLocaleString('en-US'), 'parseFloat(this.value.replace(/[$,]/g,\'\'))||0'), 'Paid at closing and deducted in the first tax year. Used for the payback ratio.', chip('', 'INPUT'))
      + row('Tax Losses', sel('lossMode', [['suspend', 'Suspended until income or sale (passive)'], ['usable', 'Usable against other income']], r.lossMode === 'usable' ? 'usable' : 'suspend'),
            'Suspended is conservative and matches the legacy engine: a cost-seg loss only pays off at sale. Usable assumes the investor can absorb the loss (real estate professional, or passive income elsewhere) and saves tax at the tax rate each year.', chip('', 'INPUT'))
      + row('PV Discount Rate', input('pvRate', (((Number(r.pvRate) || 0.08) * 100)).toFixed(1), '(parseFloat(this.value)||8)/100', 70), 'Used only to present the present value of cost-seg tax savings.', chip('', 'INPUT'));
  }
  return legacy + '<div class="tbl-wrap"><table class="fin"><caption>Tax-Grade Depreciation Settings</caption><thead><tr><th class="rowlabel-h">Setting</th><th>Value</th><th style="text-align:left">What it does</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function scheduleByClass(x){
  var sch = x.deprSchedule; if(!sch) return '';
  var rows = sch.rows.slice(0, 11), classes = [5, 7, 15, 27.5, 39].filter(function(c){ return rows.some(function(r){ return r.byClass[c]; }); });
  var head = rows.map(function(r){ return '<th>' + r.taxYear + '</th>'; }).join('');
  var body = classes.map(function(c){ return '<tr><td class="rowlabel">' + c + '-Year Property</td>' + rows.map(function(r){ return '<td>' + n0(r.byClass[c] || 0) + '</td>'; }).join('') + '</tr>'; }).join('')
    + '<tr><td class="rowlabel">of which Bonus</td>' + rows.map(function(r){ return '<td>' + n0(r.bonus) + '</td>'; }).join('') + '</tr>'
    + '<tr class="grandtotal"><td class="rowlabel">Total Depreciation</td>' + rows.map(function(r){ return '<td>' + n0(r.total) + '</td>'; }).join('') + '</tr>'
    + '<tr><td class="rowlabel">Accumulated</td>' + rows.map(function(r){ return '<td>' + n0(r.accum) + '</td>'; }).join('') + '</tr>';
  var mq = sch.midQuarterYears.length ? 'Mid-quarter convention applies to short-life property placed in service in ' + sch.midQuarterYears.join(', ') + ' (more than 40% of that year’s short-life basis was placed in service in the fourth quarter).'
          : 'Half-year convention applies to short-life property (the mid-quarter test is not triggered).';
  var lines = sch.lines.slice().sort(function(a, b){ return a.life - b.life; }), by = {};
  lines.forEach(function(l){ var k = l.life + '|' + l.conv + '|' + l.meth + '|' + l.bonusRate; by[k] = by[k] || { life:l.life, conv:l.conv, meth:l.meth, bonusRate:l.bonusRate, basis:0, n:0 }; by[k].basis += l.basis; by[k].n++; });
  var cls = Object.keys(by).map(function(k){ var g = by[k]; return '<tr><td class="rowlabel">' + g.life + '-Year' + (g.n > 1 ? ' (' + g.n + ' assets)' : '') + '</td><td>' + n0(g.basis) + '</td><td>' + ({HY:'Half-year', MQ:'Mid-quarter', MM:'Mid-month'})[g.conv] + '</td><td>' + ({'200DB':'200% DB', '150DB':'150% DB', SL:'Straight line'})[g.meth] + '</td><td>' + pc(g.bonusRate, 0) + '</td></tr>'; }).join('');
  return '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Recovery Classes - Convention, Method and Bonus Applied</caption><thead><tr><th class="rowlabel-h">Class</th><th>Basis</th><th>Convention</th><th>Method</th><th>Bonus</th></tr></thead><tbody>' + cls + '</tbody></table></div>'
    + '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>MACRS Depreciation by Recovery Class (calendar tax years, through the year of sale)</caption><thead><tr><th class="rowlabel-h">Class</th>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>'
    + '<div class="note-flag" style="margin-top:12px"><span>&#9432;</span><div><b>Tax-grade schedule.</b> ' + mq + ' Real property uses the mid-month convention. The year of sale takes only the convention’s partial year. '
    + 'Dollar amounts come straight from the IRS recovery percentages; the independent audit checks them against Pub. 946 Appendix A.</div></div>';
}

function benefit(){
  var b; try { b = window.bkCostSegBenefit(); } catch(e){ b = null; }
  if(!b) return '';
  var rows = [
    ['Year-1 depreciation with cost segregation', n0(b.yearOneDeduction), 'Bonus plus first-year regular depreciation'],
    ['Year-1 depreciation, straight-line only', n0(b.baselineYearOne), 'Same basis over ' + (window.bkDepreciation().baseLife) + ' years, mid-month'],
    ['Year-1 tax savings (incremental)', n0(b.yearOneTaxSavings), 'Extra depreciation × tax rate, if the loss can be used'],
    ['Workbook-style savings (accelerated basis × rate)', n0(b.workbookStyleSavings), 'Basis in 5/7/15-year classes × tax rate, as in the cost seg study'],
    ['Payback ratio on the study fee', b.workbookPayback == null ? '-' : b.workbookPayback.toFixed(1) + ' : 1', 'Savings ÷ fee of ' + n0(b.fee)],
    ['Tax savings over the hold (nominal)', n0(b.holdTaxSavings), 'Incremental depreciation × rate, every year'],
    ['Present value of those savings @ ' + pc(b.discount, 1), n0(b.pvTaxSavings), ''],
    ['Extra tax at sale (more recapture)', n0(-b.extraSaleTax), 'Short-life depreciation recaptures as ordinary income'],
    ['Net nominal benefit', n0(b.netNominalBenefit), 'Savings less extra sale tax less fee'],
    ['After-tax IRR with / without cost seg', pc(b.irrWith) + ' / ' + pc(b.irrWithout), 'Under the “' + (b.lossMode === 'usable' ? 'losses usable' : 'losses suspended') + '” setting; the realised benefit depends on it']
  ].map(function(r, i){ return '<tr' + (i === 8 ? ' class="grandtotal"' : '') + '><td class="rowlabel">' + r[0] + '</td><td class="v">' + r[1] + '</td><td data-bk-align="text">' + r[2] + '</td></tr>'; }).join('');
  return '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>What Cost Segregation Adds - Versus Straight-Line on the Same Basis</caption><tbody>' + rows + '</tbody></table></div>';
}

function wrap(sheet, fn){
  var prev = RENDERERS[sheet]; if(typeof prev !== 'function' || prev.__bkMacrsUi) return;
  var w = function(){
    var o = prev.apply(this, arguments);
    try { if(hasDeal() && o && typeof o === 'object' && !/no deal loaded|there is no active deal/i.test(String(o.main || ''))) fn(o); } catch(e){ if(window.console) console.warn('macrs ui', e); }
    return o;
  };
  w.__bkMacrsUi = true;
  Object.keys(prev).forEach(function(k){ if(k.indexOf('__') === 0) w[k] = prev[k]; });
  if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer(sheet, w); else RENDERERS[sheet] = w;
}
wrap('Depreciation', function(o){
  var macrs = raw().depMethod === 'macrs', x = null;
  if(macrs){ try { x = window.bkAfterTaxV18(); } catch(e){} if(x && x.deprSource !== 'macrs-tax-grade') x = null; }
  /* the simplified-schedule disclaimer no longer applies to a tax-grade deal */
  if(macrs) o.main = o.main.replace(/<div class="note-flag"[^>]*><span>&#9432;<\/span><div>\s*<b>Simplified underwriting convention\.<\/b>[\s\S]*?<\/div><\/div>/, '');
  o.main = controls() + '<div style="height:16px"></div>' + o.main + (x ? scheduleByClass(x) + benefit() : '');
  if(o.meta) o.meta = Object.assign({}, o.meta, { Method: macrs ? 'Tax-grade MACRS' : 'Simplified' });
});
wrap('After-Tax', function(o){
  var x; try { x = window.bkAfterTaxV18(); } catch(e){ return; }
  if(!x || x.deprSource !== 'macrs-tax-grade') return;
  var cg = x.classGain || {};
  o.main += '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Sale Tax by Character - Tax-Grade Depreciation</caption><thead><tr><th class="rowlabel-h">Component</th><th>Gain</th><th>Rate</th><th>Tax</th></tr></thead><tbody>'
    + '<tr><td class="rowlabel">Short-life gain, Sec. 1245 recapture (ordinary)</td><td>' + n0(x.ordinaryRecaptureBase) + '</td><td>' + pc(x.ordinaryRecaptureRate) + '</td><td>' + n0(x.ordinaryRecaptureTax) + '</td></tr>'
    + '<tr><td class="rowlabel">Real-property gain, unrecaptured Sec. 1250</td><td>' + n0(x.recaptureBase) + '</td><td>' + pc(Number(x.s.depRecaptureRate)) + '</td><td>' + n0(x.recaptureTax) + '</td></tr>'
    + '<tr><td class="rowlabel">Remaining capital gain</td><td>' + n0(x.capGainBase) + '</td><td>' + pc(Number(x.s.capGainsRate)) + '</td><td>' + n0(x.capGainTax) + '</td></tr>'
    + '<tr class="grandtotal"><td class="rowlabel">Total sale-year tax</td><td>' + n0(x.totalGain) + '</td><td></td><td>' + n0(x.saleTax) + '</td></tr></tbody></table></div>'
    + '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Sale Proceeds Allocated by Class (pro rata to original basis)</caption><tbody>'
    + '<tr><td class="rowlabel">Short-life property: gain over adjusted basis</td><td class="v">' + n0(cg.personal) + '</td></tr>'
    + '<tr><td class="rowlabel">Real property: gain over adjusted basis</td><td class="v">' + n0(cg.real) + '</td></tr>'
    + '<tr><td class="rowlabel">Land and other non-depreciable basis: gain</td><td class="v">' + n0(cg.landOther) + '</td></tr>'
    + '<tr><td class="rowlabel">Accumulated depreciation: short-life / real</td><td class="v">' + n0(x.accumPersonal) + ' / ' + n0(x.accumReal) + '</td></tr></tbody></table></div>'
    + '<div class="note-flag"><span>&#10003;</span><div><b>Tax-grade depreciation -</b> taxable income is built by calendar year from the monthly NOI, reserves and interest; depreciation follows MACRS with the in-service convention and the disposal-year rule; recapture is split by character. Not modelled: Sec. 179, NIIT, AMT, state decoupling from bonus.</div></div>';
});
})();
