/* DEVELOPMENT DEBT VIEW. The debt a development deal actually has, month by month, from the engines' own series: the construction facility (bkDevFundingV10().months) until the takeout,
   the permanent loan (bkDevTakeoutV11().permSchedule) after it, and the cash debt service the cash flows carry (bkMonthlyReturns().rows[].ds). The acquisition loan (bkDebt) is sized off the
   land price and is not part of a development's cash flows, so the pages that test or list a loan read this view on a development deal and keep bkDebt for every other deal.
   Nothing here is calculated beyond sums and ratios of those series: the view is for reading, not for sizing. Returns null for a deal that is not a development. */
(function(){
'use strict';
function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
window.bkDevDebtView = function(){
  var s = bkLoad(); if(!/develop/i.test(String(s.dealType || ''))) return null;
  var f, t, mr; try { f = bkDevFundingV10(); t = bkDevTakeoutV11(); mr = bkMonthlyReturns(); } catch(e){ return null; }
  if(!f || !f.isDev || !t || !mr || !Array.isArray(mr.rows)) return null;
  var rows = mr.rows, n = rows.length, stab = num(f.stab), perm = {}, hasPerm = false;
  (t.permSchedule || []).forEach(function(z){ if(z && z.mo > 0){ perm[z.mo] = z; hasPerm = true; } });
  var takeout = hasPerm && !t.conHeldToSale && num(t.permLoan) > 0 && stab >= 1 && stab <= n;   /* the permanent loan funds inside the hold */
  var monthly = [], i, m, r, pz, conEnd, permEnd, pay, prin;
  for(i = 0; i < n; i++){
    m = i + 1; r = rows[i]; pz = perm[m];
    /* the permanent loan repays the construction facility in the stabilization month; after that month only the permanent loan is outstanding */
    conEnd = (f.months && f.months[i] && !(takeout && m >= stab)) ? num(f.months[i].end) : 0;
    permEnd = pz ? num(pz.end) : 0; pay = pz ? num(pz.payment) : 0; prin = pz && pay > 0 ? num(pz.principal) : 0;
    monthly.push({ m:m, y:r.y, noi:num(r.noi), ds:num(r.ds), principal:prin, interest:num(r.ds) - prin, perm:permEnd, con:conEnd, bal:conEnd + permEnd, pay:pay, hasDs:pay > 0 });
  }
  var years = [], ny = n ? monthly[n - 1].y : 0, y, k, a;
  for(y = 1; y <= ny; y++){
    a = { y:y, months:0, noi:0, ds:0, ending:0, ends:0 };
    for(k = 0; k < n; k++){ if(monthly[k].y !== y) continue; if(monthly[k].hasDs){ a.months++; a.noi += monthly[k].noi; a.ds += monthly[k].ds; } a.ending = monthly[k].perm; a.ends = monthly[k].bal; }
    a.tested = takeout && a.months > 0;
    years.push(a);
  }
  var out = { isDev:true, takeout:takeout, takeoutMo:stab, hold:n, monthly:monthly, years:years, commit:num(f.commit), conRate:num(f.rate), permLoan:num(t.permLoan), permRate:num(s.permRate), permAmort:num(s.permAmort), permPmt:num(t.permPmt),
    atSale:takeout ? num(t.permDebtAtSale) : num(f.months && f.months[n - 1] ? f.months[n - 1].end : 0), conPayoff:num(t.conPayoff), basis:num(f.levered),
    covDSCR:num(s.permDSCR) || num(s.acqDSCR), covDY:num(s.minDebtYield) };
  out.reason = takeout ? '' : (Number(s.refiAtStab || 0) ? 'The sale (month ' + n + ') comes before the permanent takeout (month ' + stab + '), so the construction loan is repaid at the sale and there is no permanent loan to test.'
    : 'This development has no permanent takeout (refinance at stabilization is off), so the construction loan is held to the sale and there is no permanent loan to test.');
  return out;
};
/* the Debt Schedule's sidebar summarizes the debt the deal has, not the acquisition loan sized off the land price */
(function(){
  var CR = window.__BK_CR; if(!CR || typeof CR.wrapDev !== 'function') return;
  var D = function(v){ return '$' + bkFmt(num(v)); }, kv = function(k, v){ return '<div class="metric-row"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>'; };
  CR.wrapDev('Debt Schedule', function(o){
    var v = window.bkDevDebtView(); if(!v || typeof o.sidebar !== 'string') return;
    var card = '<div class="card"><div class="card-head">Schedule Metrics</div><div class="metric-list">' + kv('Construction Commitment', D(v.commit)) + kv('Construction Rate', bkPct(v.conRate)) + kv('Permanent Loan', v.takeout ? D(v.permLoan) : 'None')
      + (v.takeout ? kv('Permanent Rate', bkPct(v.permRate)) + kv('Amortization', v.permAmort + ' years') : '') + kv(v.takeout ? 'Permanent Debt at Sale' : 'Construction Debt at Sale', D(v.atSale)) + '</div></div>';
    var re = /<div class="card"><div class="card-head">Schedule Metrics<\/div><div class="metric-list">(?:<div class="metric-row">[\s\S]*?<\/div>)*<\/div><\/div>/;
    if(re.test(o.sidebar)) o.sidebar = o.sidebar.replace(re, card);
  });
})();
/* Covenant Monitor on a development deal: annual DSCR and Debt Yield tests against the permanent loan from the takeout. Before it the construction facility's interest is capitalized and there is no debt
   service to test, so those years read N/A with no pass or fail. The takeout year is tested on the months the permanent loan has payments, with NOI over the same months; the debt yield annualizes that NOI. */
window.bkDevCovenantSheet = function(s, dv){
  var money = function(n){ return n < 0 ? '($' + bkFmt(-n) + ')' : '$' + bkFmt(n); }, minDSCR = dv.covDSCR, minDY = dv.covDY, na = '<span class="status-chip na">N/A</span>';
  var meta = { Property:s.name, Loan:dv.takeout ? money(dv.permLoan) : 'None', Rate:dv.takeout ? bkPct(dv.permRate) : '-', Amort:dv.takeout ? dv.permAmort + ' yrs' : '-', Currency:'USD' };
  var sidebarOf = function(card){ return sidebarShell(card + modelInfoCard('<div class="metric-row"><span class="k">Tab Group</span><span class="v">Debt</span></div><div class="metric-row"><span class="k">Engine</span><span class="v"><span class="status-chip pass">Live</span></span></div>') + colorKeyCard()); };
  var inputs = '<div class="tbl-wrap" style="margin-top:16px;"><table class="fin"><caption>Covenant Inputs</caption><thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr></thead><tbody>' + bkInput('Minimum Debt Yield Covenant', 'minDebtYield', '%', 'pct') + '</tbody></table></div>';
  var desc = 'Annual DSCR and Debt Yield covenant tests against the permanent loan after takeout.';
  if(!dv.takeout) return { title:'Covenant Monitor', crumbs:'Debt', desc:desc, meta:meta,
    main:'<div class="note-flag"><span>&#9432;</span><div><b>Not applicable -</b> ' + dv.reason + '</div></div>' + inputs,
    sidebar:sidebarOf('<div class="card"><div class="card-head">Covenant Status</div><div class="metric-list"><div class="metric-row"><span class="k">Overall</span><span class="v">' + na + '</span></div></div></div>') };
  var rows = dv.years.map(function(a){
    var dscr = a.tested ? a.noi / a.ds : NaN, dy = a.tested && a.ending > 0 ? (a.noi * 12 / a.months) / a.ending : NaN;
    return { y:a.y, n:a.months, noi:a.noi, ds:a.ds, ending:a.ending, tested:a.tested, dscr:dscr, dy:dy, dscrPass:!a.tested || dscr >= minDSCR - 0.0001, dyPass:!a.tested || !isFinite(dy) || dy >= minDY - 0.0001 };
  });
  var cell = function(r, ok){ return '<td class="' + (r.tested && !ok ? 'fail-cell' : '') + '">' + (!r.tested ? na : ok ? '<span class="status-chip pass">PASS</span>' : '<span class="status-chip fail">FAIL</span>') + '</td>'; };
  var v = function(r, x){ return '<td>' + (r.tested ? x : '-') + '</td>'; };
  var main = '<div class="tbl-wrap"><table class="fin"><caption>Covenant Monitor - DSCR &amp; Debt Yield, tested annually against the permanent loan after takeout</caption>'
    + '<thead><tr><th class="rowlabel-h">Line Item</th>' + rows.map(function(r){ return '<th>Year ' + r.y + '</th>'; }).join('') + '</tr></thead><tbody>'
    + '<tr><td class="rowlabel">Months with Permanent Debt Service</td>' + rows.map(function(r){ return v(r, r.n); }).join('') + '</tr>'
    + '<tr><td class="rowlabel">NOI After Reserves (those months)</td>' + rows.map(function(r){ return v(r, money(r.noi)); }).join('') + '</tr>'
    + '<tr><td class="rowlabel">Debt Service (those months)</td>' + rows.map(function(r){ return v(r, money(-r.ds)); }).join('') + '</tr>'
    + '<tr><td class="rowlabel">Ending Loan Balance</td>' + rows.map(function(r){ return v(r, money(r.ending)); }).join('') + '</tr>'
    + '<tr class="grandtotal"><td class="rowlabel">DSCR (min ' + minDSCR.toFixed(2) + 'x)</td>' + rows.map(function(r){ return v(r, isFinite(r.dscr) ? r.dscr.toFixed(2) + 'x' : '-'); }).join('') + '</tr>'
    + '<tr><td class="rowlabel">DSCR Test</td>' + rows.map(function(r){ return cell(r, r.dscrPass); }).join('') + '</tr>'
    + '<tr class="grandtotal"><td class="rowlabel">Debt Yield (min ' + bkPct(minDY) + ')</td>' + rows.map(function(r){ return v(r, isFinite(r.dy) ? bkPct(r.dy) : '-'); }).join('') + '</tr>'
    + '<tr><td class="rowlabel">Debt Yield Test</td>' + rows.map(function(r){ return cell(r, r.dyPass); }).join('') + '</tr></tbody></table></div>' + inputs
    + '<div class="note-flag"><span>&#9432;</span><div><b>Tested against the permanent loan.</b> The permanent loan funds at the takeout (month ' + dv.takeoutMo + '). Before it the construction facility&rsquo;s interest is capitalized and there is no debt service to test, so those years read N/A, with no pass or fail. '
    + 'The takeout year is tested on the months the permanent loan has payments, with NOI over the same months; the debt yield annualizes that NOI over the ending balance. Minimum DSCR is the permanent loan&rsquo;s underwriting DSCR. Debt service and NOI are the monthly cash-flow figures (<code>bkMonthlyReturns</code>) and the takeout schedule (<code>bkDevTakeoutV11</code>), the same ones the Debt Schedule and Returns pages use.</div></div>';
  var tested = rows.filter(function(r){ return r.tested; }), allPass = tested.every(function(r){ return r.dscrPass && r.dyPass; });
  var sidebar = sidebarOf('<div class="card"><div class="card-head">Covenant Status</div><div class="metric-list"><div class="metric-row"><span class="k">Overall</span><span class="v">' + (!tested.length ? na : '<span class="status-chip ' + (allPass ? 'pass' : 'fail') + '">' + (allPass ? 'All Tested Years Pass' : 'Breach Detected') + '</span>') + '</span></div>'
    + '<div class="metric-row"><span class="k">Min DSCR</span><span class="v">' + minDSCR.toFixed(2) + 'x</span></div><div class="metric-row"><span class="k">Min Debt Yield</span><span class="v">' + bkPct(minDY) + '</span></div></div></div>');
  return { title:'Covenant Monitor', crumbs:'Debt', desc:desc, meta:meta, main:main, sidebar:sidebar };
};
})();
