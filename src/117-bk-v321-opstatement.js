
/* V32.1 - Operating Underwrite: the three separate tables (Revenue, Expenses, NOI) become ONE statement on one column grid:
   Line Item | Annual ($) | % of GPR | Basis. Every % is computed against GPR (EGI is its true % of GPR, not a hard-coded 100%).
   The bad-debt % previously read the template default (BK_BASE) instead of the deal - fixed by computing it from the amounts.
   Zero line items show an en dash; totals always show a number. Numbers are read from bkCalc(); no calculation is changed. */
(function(){
  if(typeof RENDERERS === 'undefined' || !RENDERERS['Operating Underwrite']) return;
  var prev = RENDERERS['Operating Underwrite'];
  RENDERERS['Operating Underwrite'] = function(){
    var o = prev(); var s = bkLoad(), c = bkCalc();
    var div = document.createElement('div'); div.innerHTML = o.main || '';
    var kids = [].slice.call(div.children);
    function cap(e){ var x = e.querySelector && e.querySelector('caption'); return x ? x.textContent.trim() : ''; }
    if(kids.length < 3 || cap(kids[0]) !== 'Revenue - Year 1 Stabilized' || cap(kids[1]) !== 'Expenses' || cap(kids[2]) !== '') return o;
    var DASH = '<span class="bk-nil">\u2013</span>';
    var fm = function(n){ return n < 0 ? '($' + bkFmt(-n) + ')' : '$' + bkFmt(n); };
    var line = function(n){ return (isFinite(n) && Math.abs(n) >= 0.5) ? fm(n) : DASH; };
    var tot  = function(n){ return isFinite(n) ? fm(n) : DASH; };
    var gpr = Number(c.gpr) || 0;
    var pg = function(n){ if(!(gpr > 0) || !isFinite(n) || Math.abs(n) < 0.5) return DASH; var v = Math.abs(n) / gpr * 100; return n < 0 ? '(' + v.toFixed(2) + '%)' : v.toFixed(2) + '%'; };
    var pgTot = function(n){ return (gpr > 0 && isFinite(n)) ? (n / gpr * 100).toFixed(2) + '%' : DASH; };
    var row = function(label, a, p, b, cls){ return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td class="rowlabel">' + label + '</td><td>' + a + '</td><td>' + p + '</td><td>' + (b || '') + '</td></tr>'; };
    var egi = Number(c.egi) || 0, ratio = egi ? c.total / egi : 0, margin = egi ? c.noi / egi : 0, pct1 = function(x){ return (x * 100).toFixed(2) + '%'; };
    var reserves = Number(s.reserves) || 0;
    var rows = ''
      + row('Gross Potential Rent - Residential', line(c.gpr), gpr > 0 ? '100.0%' : DASH, '')
      + row('Less: Vacancy - Residential', line(c.vacancy), pg(c.vacancy), '')
      + row('Less: Bad Debt / Credit Loss', line(c.bad), pg(c.bad), '')
      + ((Number(c.ltl) || 0) ? row('Less: Loss to Lease', line(c.ltl), pg(c.ltl), '') : '')
      + ((Number(c.concess) || 0) ? row('Less: Concessions', line(c.concess), pg(c.concess), '') : '')
      + row('Net Residential Income', line(c.netRes), gpr > 0 ? pgTot(c.netRes) : DASH, '', 'subtotal')
      + row('Commercial Base Rent', line(c.commercial), pg(c.commercial), '')
      + row('Expense Recoveries (NNN)', line(c.recovery), pg(c.recovery), '')
      + row('Less: Commercial Vacancy / Credit Loss', line(c.commercialVac), pg(c.commercialVac), '')
      + row('Other Income / Reimbursements', line(c.other), pg(c.other), '')
      + row('Effective Gross Income', tot(c.egi), pgTot(c.egi), '', 'grandtotal')
      + row('Real Estate Taxes', line(Number(s.taxes)), '', '')
      + row('Insurance', line(Number(s.insurance)), '', '')
      + row('Utilities', line(Number(s.utilities)), '', '')
      + row('Repairs &amp; Maintenance', line(Number(s.rm)), '', '')
      + row('Contract Services', line(Number(s.contract)), '', '')
      + row('Payroll &amp; Benefits', line(Number(s.payroll)), '', '')
      + row('Turnover &amp; Make-Ready', line(Number(s.turnover)), '', '')
      + row('Marketing &amp; Advertising', line(Number(s.marketing)), '', '')
      + row('General &amp; Administrative', line(Number(s.ga)), '', '')
      + row('Management Fee', line(c.mgmt), '', Number(s.mgmtPct) ? (Number(s.mgmtPct) * 100).toFixed(2) + '% of EGI' : '')
      + row('Miscellaneous', line(c.misc), '', Number(s.miscPerGSF) ? '$' + Number(s.miscPerGSF).toFixed(2) + ' / GSF' : '')
      + row('Total Operating Expenses', tot(c.total), '', egi ? pct1(ratio) + ' of EGI' : '', 'grandtotal')
      + row('Net Operating Income', tot(c.noi), '', egi ? pct1(margin) + ' of EGI' : '', 'grandtotal')
      + row('Less: Replacement Reserves', line(-reserves), '', '')
      + row('NOI After Reserves', tot(c.after), '', '', 'subtotal');
    var table = '<div class="tbl-wrap"><table class="fin bk-opstmt"><caption>Year-1 Stabilized Operating Statement</caption>'
      + '<thead><tr><th class="rowlabel-h">Line Item</th><th>Annual ($)</th><th>% of GPR</th><th>Basis</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    var k = function(l, v, sub, hero){ return '<div class="k' + (hero ? ' hero' : '') + '"><div class="l">' + l + '</div><div class="v">' + v + '</div>' + (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>'; };
    var strip = '<div class="bk-kpi">' + k('Effective Gross Income', tot(c.egi), gpr > 0 ? pgTot(c.egi) + ' of GPR' : '')
      + k('Operating Expenses', tot(c.total), egi ? pct1(ratio) + ' of EGI' : '')
      + k('Net Operating Income', tot(c.noi), egi ? pct1(margin) + ' margin' : '', true)
      + k('NOI After Reserves', tot(c.after), '')
      + k('Implied Value', Number(s.exitCap) > 0 ? tot(c.value) : DASH, Number(s.exitCap) > 0 ? '@ ' + (Number(s.exitCap) * 100).toFixed(2) + '% exit cap' : 'exit cap not set') + '</div>';
    kids[0].remove(); kids[1].remove(); kids[2].remove();
    div.insertAdjacentHTML('afterbegin', strip + table);
    o.main = div.innerHTML;
    return o;
  };
})();
