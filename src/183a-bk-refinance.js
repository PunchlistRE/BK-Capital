/* REFINANCING ANALYSIS. For an owner with an existing loan: what a new loan can be, what it costs to get out of the old one, and what is left.
     NOI         the operating statement the rest of the app uses (bkCalc): before reserves, or after them when the lender basis says so (lenderNoiBasis)
     value       the current value entered, or NOI / the cap rate entered (each stated)
     payoff      the existing balance plus the prepayment penalty (accrued interest is not modelled and is said so)
     new loan    the lowest of: value x maximum LTV, the loan whose debt service the NOI covers at the minimum DSCR, NOI / minimum debt yield,
                 and the amount requested (the arithmetic is bkSizeLoan, src/130a, shared with Refi / Recap); rounded down to $1,000. DSCR sizing uses the amortizing payment (lenders size on it even with an
                 interest-only period); year-1 debt service is interest-only when there is an interest-only period
     proceeds    new loan - payoff - refinance costs: cash out when positive, equity needed when negative
   Alternatives are the same calculation with their own terms. Lender tests (the bank's limits) are kept apart from the owner's own figures.
   Nothing here changes the acquisition or development engines. */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof bkLoad !== 'function') return;
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function n(v){ if(v === null || v === undefined || v === '') return null; v = Number(v); return isFinite(v) ? v : null; }
function pos(v){ v = n(v); return v !== null && v > 0 ? v : null; }
var $ = function(v){ v = n(v); if(v === null) return '-'; var a = Math.round(Math.abs(v)).toLocaleString('en-US'); return v < 0 ? '($' + a + ')' : '$' + a; };
var P = function(v, d){ v = n(v); return v === null ? '-' : (v * 100).toFixed(d == null ? 2 : d) + '%'; };
var X = function(v){ v = n(v); return v === null ? '-' : v.toFixed(2) + 'x'; };
function pmt(r, months){ if(!(months > 0)) return null; return r ? r / (1 - Math.pow(1 + r, -months)) : 1 / months; }   /* monthly payment per $1 */

/* one loan structure on the property's NOI and value */
function size(t, noi, value, payoff){
  var rate = pos(t.rate), amort = n(t.amort), io = n(t.io) || 0, term = n(t.term);
  var out = { name:t.name || 'Proposed loan', rate:rate, amort:amort, io:io, term:term, maxLTV:pos(t.maxLTV), minDSCR:pos(t.minDSCR), minDY:pos(t.minDY), costs:n(t.costs), requested:pos(t.amount), tests:[], missing:[] };
  if(rate === null) out.missing.push('interest rate'); if(out.costs === null) out.missing.push('refinance costs');
  if(!out.maxLTV && !out.minDSCR && !out.minDY && !out.requested) out.missing.push('a lender test or a loan amount');
  var fullIO = !(amort > 0), amortF = fullIO ? (rate || 0) : 12 * pmt((rate || 0) / 12, amort * 12);   /* annual debt service per $1 used for sizing */
  /* which tests apply is decided here (a limit the lender has not stated is not a test); the capacities and the lowest of them are the shared rule */
  var run = [out.maxLTV && value ? 'ltv' : null, out.minDSCR && noi > 0 && amortF > 0 ? 'dscr' : null, out.minDY && noi > 0 ? 'dy' : null].filter(Boolean);
  if(out.maxLTV && !value) out.missing.push('a current value or cap rate (for the LTV test)');
  var z = window.bkSizeLoan({ tests:run, noi:noi, value:value, debtConstant:amortF, maxLTV:out.maxLTV, minDSCR:out.minDSCR, minDY:out.minDY, extra:out.requested ? [{ id:'requested', loan:out.requested }] : [] });
  var NAME = { ltv:'Loan to value', dscr:'Debt service coverage', dy:'Debt yield', requested:'Amount requested' };
  var SAY = { ltv:function(){ return [out.maxLTV, P(out.maxLTV, 1) + ' of ' + $(value)]; }, dscr:function(){ return [out.minDSCR, $(noi) + ' NOI / ' + X(out.minDSCR) + ' / ' + (amortF).toFixed(5) + ' debt service per $']; },
    dy:function(){ return [out.minDY, $(noi) + ' NOI / ' + P(out.minDY, 2)]; }, requested:function(){ return [null, 'the amount asked for']; } };
  z.caps.forEach(function(c){ var w = SAY[c.id](); out.tests.push({ name:NAME[c.id], limit:w[0], loan:c.loan, why:w[1] }); });
  if(out.missing.length || !out.tests.length || !(noi > 0)){ if(!(noi > 0)) out.missing.push('a positive NOI'); out.ok = false; return out; }
  out.binding = NAME[z.binding]; out.raw = z.loan; out.loan = Math.max(0, Math.floor(z.loan / 1000) * 1000);
  out.ds1 = io > 0 || fullIO ? out.loan * rate : out.loan * amortF;   /* year-1 debt service */
  out.dsAmort = out.loan * amortF;
  out.dscr = out.ds1 > 0 ? noi / out.ds1 : null; out.dy = out.loan > 0 ? noi / out.loan : null; out.ltv = value ? out.loan / value : null;
  out.net = out.loan - payoff - out.costs; out.cashOut = Math.max(0, out.net); out.equityNeeded = Math.max(0, -out.net); out.equityAfter = value ? value - out.loan : null;
  out.ok = true; return out;
}
window.bkRefinance = function(s){
  s = s || bkLoad(); var c = safe(function(){ return bkCalc(); }, null) || {};
  var noi = s.lenderNoiBasis === 'after' ? n(c.after) : n(c.noi), cap = pos(s.valCapRate), cv = pos(s.currentValue);
  var value = cv || (cap && noi > 0 ? noi / cap : null), valueSrc = cv ? 'entered' : (value ? 'NOI / ' + P(cap, 2) + ' cap rate' : null);
  var bal = n(s.exLoanBalance), prepay = n(s.exPrepay) || 0, exRate = pos(s.exLoanRate), exAm = n(s.exLoanAmort);
  var payoff = bal === null ? null : bal + prepay;
  var exDS = bal === null || exRate === null ? null : (exAm > 0 ? bal * 12 * pmt(exRate / 12, exAm * 12) : bal * exRate);
  var base = { name:'Proposed loan', rate:s.newLoanRate, amort:s.newLoanAmort, io:s.newLoanIO, term:s.newLoanTerm, maxLTV:s.lenderMaxLTV, minDSCR:s.lenderMinDSCR, minDY:s.lenderMinDY, costs:s.newLoanCosts, amount:s.newLoanAmount };
  var missing = []; if(!(noi > 0)) missing.push('Operating income and expenses (a positive NOI)'); if(bal === null) missing.push('Existing loan balance'); if(exRate === null) missing.push('Existing interest rate');
  var main = payoff === null ? null : size(base, noi, value, payoff);
  var alts = (Array.isArray(s.refiScenarios) ? s.refiScenarios : []).map(function(a, i){ return payoff === null ? null : size(Object.assign({}, base, { name:a.name || 'Alternative ' + (i + 1) }, pick(a)), noi, value, payoff); }).filter(Boolean);
  var r = { noi:noi, noiBasis:s.lenderNoiBasis === 'after' ? 'after reserves' : 'before reserves', calc:c, value:value, valueSrc:valueSrc, cap:cap, payoff:payoff, balance:bal, prepay:prepay, exRate:exRate, exAmort:exAm, exDS:exDS, exMaturity:s.exLoanMaturity || '', main:main, alts:alts, missing:missing };
  r.ok = !missing.length && main && main.ok;
  if(r.ok){ r.dsChange = exDS === null ? null : main.ds1 - exDS; r.cfChange = exDS === null ? null : exDS - main.ds1; }
  /* checks: each figure recomputed another way */
  r.checks = [];
  if(c && isFinite(c.egi) && isFinite(c.total)) r.checks.push({ id:'noiTies', label:'NOI = effective gross income less operating expenses', ok:Math.abs((s.lenderNoiBasis === 'after' ? c.egi - c.total - (c.noi - c.after) : c.egi - c.total) - (noi || 0)) < 0.5 });
  if(payoff !== null) r.checks.push({ id:'payoffTies', label:'Payoff = existing balance + prepayment penalty', ok:Math.abs(payoff - (bal + prepay)) < 0.005 });
  if(main && main.ok){ var mn = Math.min.apply(null, main.tests.map(function(t){ return t.loan; })); r.checks.push({ id:'sizingTies', label:'Loan = the lowest test, rounded down to $1,000', ok:main.loan <= mn + 1e-6 && mn - main.loan < 1000 });
    r.checks.push({ id:'proceedsTie', label:'Net proceeds = new loan - payoff - costs', ok:Math.abs(main.net - (main.loan - payoff - main.costs)) < 0.005 }); }
  return r;
};
function pick(a){ var o = {}; [['rate', 'newLoanRate'], ['amort', 'newLoanAmort'], ['io', 'newLoanIO'], ['term', 'newLoanTerm'], ['maxLTV', 'lenderMaxLTV'], ['minDSCR', 'lenderMinDSCR'], ['minDY', 'lenderMinDY'], ['costs', 'newLoanCosts'], ['amount', 'newLoanAmount']].forEach(function(p){ if(a[p[1]] !== undefined && a[p[1]] !== null && a[p[1]] !== '') o[p[0]] = a[p[1]]; }); return o; }

/* ---------- the sheet ---------- */
var cur = function(){ return typeof currentSheet !== 'undefined' ? currentSheet : 'Refinancing'; };
function fv(v, kind){ if(v === null || v === undefined || v === '') return ''; var x = Number(v); if(!isFinite(x)) return String(v); return kind === 'pct' ? String(+(x * 100).toFixed(4)) : kind === 'text' ? String(v) : x.toLocaleString('en-US', { maximumFractionDigits:4 }); }
function inp(key, kind, s, unit, ph){ return '<tr><td class="rowlabel">' + esc(LABEL[key] || key) + '</td><td class="v"><input type="text" class="rf-in" id="rf-' + key + '" value="' + esc(fv(s[key], kind)) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + ' autocomplete="off" onchange="bkEdSet(\'' + key + '\',\'' + kind + '\',this.value,\'null\')"></td><td class="u">' + esc(unit || '') + '</td></tr>'; }
var LABEL = { currentValue:'Current property value', valCapRate:'Or: market cap rate', exLoanBalance:'Existing loan balance', exLoanRate:'Existing interest rate', exLoanMaturity:'Existing maturity date', exLoanAmort:'Remaining amortization', exPrepay:'Prepayment penalty',
  newLoanRate:'Proposed interest rate', newLoanTerm:'Proposed term', newLoanAmort:'Amortization', newLoanIO:'Interest-only period', newLoanCosts:'Points and closing costs', newLoanAmount:'Amount requested (optional)', lenderMaxLTV:'Maximum loan to value', lenderMinDSCR:'Lender minimum DSCR', lenderMinDY:'Minimum debt yield' };
function tbl(cap, rows, id){ return '<div class="tbl-wrap" style="margin-top:14px"><table class="fin"' + (id ? ' id="' + id + '"' : '') + '>' + (cap ? '<caption>' + esc(cap) + '</caption>' : '') + '<tbody>' + rows.join('') + '</tbody></table></div>'; }
function row(l, v, note, cls){ return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td class="rowlabel">' + esc(l) + '</td><td class="v">' + v + '</td><td class="u">' + esc(note || '') + '</td></tr>'; }
window.bkRefiAlt = function(i, key, kind, raw){ var s = bkLoad(); s.refiScenarios = Array.isArray(s.refiScenarios) ? s.refiScenarios : []; var a = s.refiScenarios[i]; if(!a) return; var t = String(raw).trim(); if(kind === 'text') a[key] = t; else if(t === '') delete a[key]; else { var v = Number(t.replace(/[$,%\s]/g, '')); if(!isFinite(v)) { showSheet(cur()); return; } a[key] = kind === 'pct' ? v / 100 : v; } bkSave(s); showSheet(cur()); };
window.bkRefiAltAdd = function(){ var s = bkLoad(); s.refiScenarios = Array.isArray(s.refiScenarios) ? s.refiScenarios : []; s.refiScenarios.push({ name:'Alternative ' + (s.refiScenarios.length + 1) }); bkSave(s); showSheet(cur()); };
window.bkRefiAltDel = function(i){ var s = bkLoad(); if(!Array.isArray(s.refiScenarios)) return; s.refiScenarios.splice(i, 1); if(!s.refiScenarios.length) delete s.refiScenarios; bkSave(s); showSheet(cur()); };
function resultRows(r){ var m = r.main; return [row('Current value', $(r.value), r.valueSrc || 'enter a value or a cap rate'), row('NOI used by the lender', $(r.noi), r.noiBasis), row('Existing payoff', $(r.payoff), 'balance ' + $(r.balance) + ' + prepayment ' + $(r.prepay)),
  row('New loan', $(m.loan), 'binding: ' + m.binding, 'grandtotal'), row('Loan to value', P(m.ltv, 1), m.maxLTV ? 'limit ' + P(m.maxLTV, 1) : ''), row('Lender DSCR, year 1 (' + bkDscrBasis('lender') + ')', X(m.dscr), m.minDSCR ? 'minimum ' + X(m.minDSCR) : ''), row('Debt yield', P(m.dy, 2), m.minDY ? 'minimum ' + P(m.minDY, 2) : ''),
  row('New annual debt service (year 1)', $(m.ds1), m.io > 0 ? 'interest-only for ' + m.io + ' year' + (m.io === 1 ? '' : 's') : 'amortizing'), row('Existing annual debt service', $(r.exDS), ''), row('Change in annual cash flow', $(r.cfChange), 'existing less new debt service'),
  row('Refinance costs', $(m.costs), ''), row(m.net >= 0 ? 'Net cash out' : 'Equity needed to refinance', $(Math.abs(m.net)), 'new loan - payoff - costs', 'grandtotal'), row('Equity left in the property', $(m.equityAfter), 'value - new loan')]; }
function compareTable(r){ var L = [r.main].concat(r.alts); var line = function(l, f){ return '<tr><td class="rowlabel">' + esc(l) + '</td>' + L.map(function(x){ return '<td class="v">' + (x.ok ? f(x) : '-') + '</td>'; }).join('') + '</tr>'; };
  return '<div class="tbl-wrap" style="margin-top:14px;overflow-x:auto"><table class="fin" id="rf-compare"><caption>Financing structures side by side</caption><thead><tr><th class="rowlabel-h">Structure</th>' + L.map(function(x){ return '<th>' + esc(x.name) + '</th>'; }).join('') + '</tr></thead><tbody>'
    + line('Interest rate', function(x){ return P(x.rate, 2); }) + line('Amortization', function(x){ return x.amort > 0 ? x.amort + ' yrs' : 'interest only'; }) + line('New loan', function(x){ return $(x.loan); }) + line('Binding test', function(x){ return esc(x.binding); })
    + line('LTV', function(x){ return P(x.ltv, 1); }) + line('Lender DSCR, year 1', function(x){ return X(x.dscr); }) + line('Debt yield', function(x){ return P(x.dy, 2); }) + line('Year-1 debt service', function(x){ return $(x.ds1); })
    + line('Costs', function(x){ return $(x.costs); }) + line('Net cash out (equity needed)', function(x){ return $(x.net); }) + '</tbody></table></div>'; }
function altsEditor(s){ var a = Array.isArray(s.refiScenarios) ? s.refiScenarios : [], K = [['name', 'text', 'Name'], ['newLoanRate', 'pct', 'Rate %'], ['newLoanAmort', 'num', 'Amort. yrs'], ['newLoanIO', 'num', 'IO yrs'], ['lenderMaxLTV', 'pct', 'Max LTV %'], ['lenderMinDSCR', 'num', 'Lender min DSCR'], ['lenderMinDY', 'pct', 'Min DY %'], ['newLoanCosts', 'num', 'Costs $']];
  return '<div class="tbl-wrap" style="margin-top:14px;overflow-x:auto"><table class="fin"><caption>Alternative structures (blank uses the proposed loan\'s term)</caption><thead><tr>' + K.map(function(k){ return '<th>' + k[2] + '</th>'; }).join('') + '<th></th></tr></thead><tbody>'
    + (a.length ? a.map(function(x, i){ return '<tr>' + K.map(function(k){ return '<td><input type="text" class="rf-in" id="rf-alt-' + i + '-' + k[0] + '" value="' + esc(fv(x[k[0]], k[1])) + '" autocomplete="off" onchange="bkRefiAlt(' + i + ',\'' + k[0] + '\',\'' + k[1] + '\',this.value)"></td>'; }).join('') + '<td><button type="button" class="bk-btn" onclick="bkRefiAltDel(' + i + ')">Remove</button></td></tr>'; }).join('') : '<tr><td colspan="' + (K.length + 1) + '">No alternatives yet.</td></tr>')
    + '</tbody></table></div><div style="margin-top:8px"><button type="button" class="bk-btn" onclick="bkRefiAltAdd()">Add an alternative</button></div>'; }
function checksTable(r){ return r.checks.length ? '<div class="tbl-wrap" style="margin-top:14px"><table class="fin" id="rf-checks"><caption>Checks</caption><tbody>' + r.checks.map(function(c){ return '<tr><td class="rowlabel">' + esc(c.label) + '</td><td><span class="status-chip ' + (c.ok ? 'pass' : 'fail') + '">' + (c.ok ? 'Ties' : 'Does not tie') + '</span></td></tr>'; }).join('') + '</tbody></table></div>' : ''; }
function sheet(){
  var s = bkLoad(), r = window.bkRefinance(s), m = r.main;
  var inputs = tbl('Current value', [inp('currentValue', 'num', s, '$'), inp('valCapRate', 'pct', s, '% (used when no value is entered)')])
    + tbl('Existing loan and payoff', [inp('exLoanBalance', 'num', s, '$'), inp('exLoanRate', 'pct', s, '%'), inp('exLoanMaturity', 'text', s, 'date', 'e.g. 6/30/2028'), inp('exLoanAmort', 'num', s, 'years left (blank = interest only)'), inp('exPrepay', 'num', s, '$ (0 if none)')])
    + tbl('Proposed loan', [inp('newLoanRate', 'pct', s, '%'), inp('newLoanTerm', 'num', s, 'years'), inp('newLoanAmort', 'num', s, 'years (blank = interest only)'), inp('newLoanIO', 'num', s, 'years'), inp('newLoanCosts', 'num', s, '$'), inp('newLoanAmount', 'num', s, '$ (blank = the most the tests allow)')])
    + tbl('Lender tests (the bank\'s limits, not your assumptions)', [inp('lenderMaxLTV', 'pct', s, '%'), inp('lenderMinDSCR', 'num', s, 'x'), inp('lenderMinDY', 'pct', s, '% (blank = not tested)')]);
  var need = r.missing.concat(m && !m.ok ? m.missing.map(function(x){ return 'Proposed loan: ' + x; }) : []);
  var res = r.ok ? tbl('Result', resultRows(r), 'rf-result') + '<div class="tbl-wrap" style="margin-top:14px"><table class="fin" id="rf-tests"><caption>How the loan is sized</caption><thead><tr><th class="rowlabel-h">Test</th><th>Loan it allows</th><th>From</th></tr></thead><tbody>' + m.tests.map(function(t){ return '<tr' + (t.name === m.binding ? ' class="grandtotal"' : '') + '><td class="rowlabel">' + esc(t.name) + '</td><td class="v">' + $(t.loan) + '</td><td class="u">' + esc(t.why) + '</td></tr>'; }).join('') + '</tbody></table></div>'
    : '<div class="note-flag" style="margin-top:14px"><span>&#9888;</span><div><b>Not calculated yet.</b> Still needed: ' + esc(need.join('; ')) + '. Income and expenses are entered on Property &gt; Revenues and Expenses.</div></div>';
  var main = '<div class="rf">' + inputs + res + (r.ok ? compareTable(r) : '') + altsEditor(s) + (r.ok ? checksTable(r) : '') + '<div class="note-flag" style="margin-top:14px"><span>&#9432;</span><div>Accrued interest at payoff, defeasance and yield maintenance formulas, and lender reserves are not modelled; enter the payoff penalty quoted by the servicer.</div></div></div>';
  return { title:'Refinancing', crumbs:'Debt', desc:'The existing loan and its payoff against a new loan sized by the lender\'s tests, and what is left.', meta:{ Property:esc(s.name || 'Untitled'), 'New loan':r.ok ? $(m.loan) : '-', 'Net proceeds':r.ok ? $(m.net) : '-' }, main:main, sidebar:'' };
}
/* ---------- the report: one section per registry section, in the registry's order ---------- */
var SECT = {
  refiExec:function(s, r){ var m = r.main; return '<h2>Refinance summary</h2><p>' + (r.ok ? 'A new loan of <b>' + $(m.loan) + '</b> (' + esc(m.binding) + ' binds) against a payoff of <b>' + $(r.payoff) + '</b> and ' + $(m.costs) + ' of costs ' + (m.net >= 0 ? 'returns <b>' + $(m.net) + '</b> of cash' : 'needs <b>' + $(-m.net) + '</b> of new equity') + '. Year-1 lender DSCR is ' + X(m.dscr) + ', LTV ' + P(m.ltv, 1) + ', debt yield ' + P(m.dy, 2) + '.' : 'Not calculated: ' + esc(r.missing.join('; ')) + '.') + '</p>'; },
  propDesc:function(s, r){ return '<h2>Property</h2>' + tbl('', [row('Property', esc(s.name || '-')), row('Location', esc(s.location || '-')), row('Type', esc(s.propertyType || '-')), row('Units', s.units ? String(s.units) : '-'), row('NOI used by the lender', $(r.noi), r.noiBasis), row('Current value', $(r.value), r.valueSrc || '')]); },
  existingDebt:function(s, r){ return '<h2>Existing debt and payoff</h2>' + tbl('', [row('Balance', $(r.balance)), row('Interest rate', P(r.exRate, 2)), row('Maturity', esc(r.exMaturity || '-')), row('Annual debt service', $(r.exDS)), row('Prepayment penalty', $(r.prepay)), row('Payoff', $(r.payoff), '', 'grandtotal')]); },
  proposedDebt:function(s, r){ var m = r.main; return '<h2>Proposed financing and lender tests</h2>' + (m && m.ok ? '<div class="tbl-wrap"><table class="fin"><thead><tr><th class="rowlabel-h">Test</th><th>Lender limit</th><th>Loan it allows</th></tr></thead><tbody>' + m.tests.map(function(t){ return '<tr' + (t.name === m.binding ? ' class="grandtotal"' : '') + '><td class="rowlabel">' + esc(t.name) + '</td><td class="v">' + (t.limit == null ? 'requested' : t.name === 'Debt service coverage' ? X(t.limit) + ' minimum' : t.name === 'Loan to value' ? P(t.limit, 1) + ' maximum' : P(t.limit, 2) + ' minimum') + '</td><td class="v">' + $(t.loan) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p>Not calculated.</p>'); },
  refiProceeds:function(s, r){ return '<h2>Proceeds and equity</h2>' + (r.ok ? tbl('', resultRows(r)) : '<p>Not calculated.</p>'); },
  refiCompare:function(s, r){ return '<h2>Alternative structures</h2>' + (r.ok && r.alts.length ? compareTable(r) : '<p>No alternatives were entered.</p>'); },
  disclosures:function(s, r){ return '<h2>Assumptions and limitations</h2><ul><li>NOI is the app\'s operating statement ' + esc(r.noiBasis) + '; value is ' + esc(r.valueSrc || 'not set') + '.</li><li>The loan is the lowest of the lender tests entered, rounded down to $1,000. Lender DSCR sizing uses the amortizing payment.</li><li>Accrued interest, defeasance and yield maintenance, and lender reserves are not modelled; the prepayment penalty is as entered.</li><li>This is an analysis, not a loan commitment or an appraisal.</li></ul>'; }
};
function report(){
  var s = bkLoad(), r = window.bkRefinance(s), secs = window.BKReg ? window.BKReg.report('refinance') : [];
  var body = secs.map(function(x){ var f = SECT[x.id]; return f ? '<section class="rf-sec" data-section="' + x.id + '">' + f(s, r) + '</section>' : ''; }).join('');
  return { title:'Refinance Report', crumbs:'Reports', desc:'Built from the refinancing analysis, one section per part of the report. Print / PDF prints it.', meta:{ Property:esc(s.name || 'Untitled') }, main:'<div class="rf rf-report">' + body + '</div>', sidebar:'' };
}
window.bkRefiReportSections = function(){ return Object.keys(SECT); };
var reg = function(name, fn){ var w = function(){ if(typeof window.bkHasActiveDeal === 'function' && !window.bkHasActiveDeal() && typeof window.bkEmptyState === 'function') return window.bkEmptyState(name); return fn(); }; if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer(name, w); else RENDERERS[name] = w; };
reg('Refinancing', sheet); reg('Refinance Report', report);
var dbt = GROUPS.find(function(g){ return g.id === 'debt'; }); if(dbt && dbt.sheets.indexOf('Refinancing') < 0) dbt.sheets.splice(Math.max(0, dbt.sheets.indexOf('Refi / Recap')), 0, 'Refinancing');
var rep = GROUPS.find(function(g){ return g.id === 'reports'; }); if(rep && rep.sheets.indexOf('Refinance Report') < 0) rep.sheets.push('Refinance Report');
if(typeof bkBuildRail === 'function') try { bkBuildRail(); } catch(e){}
var st = document.createElement('style'); st.textContent = '.rf .rf-in{width:100%;min-width:110px;box-sizing:border-box;text-align:right;padding:4px 6px;border:1px solid var(--ae-line,#c8d3de);background:var(--ae-in,#fffde8)}.rf td.u{color:var(--ink-500,#566a80);font-size:12px}.rf-report .rf-sec{margin:0 0 18px}.rf-report h2{font-size:17px;margin:18px 0 6px}';
document.head.appendChild(st);
})();
