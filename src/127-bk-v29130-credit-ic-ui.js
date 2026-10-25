
/* ===========================================================================
   V29.13.0 - CREDIT & IC SHEETS: Credit Policy, Debt Capacity, IC Memo
   Presentation only. Every figure comes from bkPolicy(), bkDebtCapacity(),
   bkRiskCushions() and bkDealGate(); nothing is calculated here.
   =========================================================================== */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof window.bkDealGate !== 'function') return;
function $(v, d){ var x = Number(v); if(!isFinite(x)) return 'n/a'; var a = Math.abs(x), b = a.toLocaleString('en-US', {maximumFractionDigits:d || 0}); return x < 0 ? '($' + b + ')' : '$' + b; }
function P(v, d){ return (v == null || !isFinite(v)) ? 'n/a' : (v * 100).toFixed(d == null ? 2 : d) + '%'; }
function X(v){ return (v == null || !isFinite(v)) ? 'n/a' : v.toFixed(2) + 'x'; }
function B(v){ return (v == null || !isFinite(v)) ? 'n/a' : Math.round(v).toLocaleString('en-US') + ' bps'; }
function esc(v){ return (typeof bkEsc === 'function') ? bkEsc(v) : String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function chip(cls, t){ return '<span class="status-chip ' + (cls || '') + '">' + t + '</span>'; }
function res(r){ return r === 'PASS' ? chip('pass', 'PASS') : r === 'FAIL' ? chip('fail', 'FAIL') : chip('', 'N/A'); }
function verdictChip(v){ return chip(v === 'APPROVE' ? 'pass' : v === 'CONDITIONAL' ? 'warn' : 'fail', v); }
function fmt(v, t){ return t === 'pct' ? P(v) : t === 'x' ? X(v) : t === 'usd' ? $(v) : t === 'bps' ? B(v) : (v == null ? 'n/a' : String(Math.round(v))); }
function table(caption, head, body, cls){ return '<div class="tbl-wrap" style="margin-top:16px"><table class="fin' + (cls ? ' ' + cls : '') + '"><caption>' + caption + '</caption>' + (head ? '<thead><tr>' + head + '</tr></thead>' : '') + '<tbody>' + body + '</tbody></table></div>'; }
function th(a){ return a.map(function(h, i){ return i === 0 ? '<th class="rowlabel-h">' + h + '</th>' : '<th>' + h + '</th>'; }).join(''); }
function inp(js, val, w, align){ return '<input type="text" value="' + esc(val) + '" style="width:' + (w || 110) + 'px;text-align:' + (align || 'left') + '" onchange="' + js + '">'; }
function note(t, ok){ return '<div class="note-flag" style="margin-top:12px"><span>' + (ok === false ? '&#9888;' : '&#9432;') + '</span><div>' + t + '</div></div>'; }
function side(rows, group){
  return (typeof sidebarShell === 'function') ? sidebarShell('<div class="card"><div class="card-head">' + group + '</div><div class="metric-list">' + rows.map(function(r){ return '<div class="metric-row"><span class="k">' + r[0] + '</span><span class="v">' + r[1] + '</span></div>'; }).join('') + '</div></div>' + (typeof colorKeyCard === 'function' ? colorKeyCard() : '')) : '';
}
function gated(name, fn){
  return function(){
    if(typeof window.bkHasActiveDeal === 'function' && !window.bkHasActiveDeal() && typeof window.bkEmptyState === 'function') return window.bkEmptyState(name);
    return fn.apply(this, arguments);
  };
}
function register(name, fn){ var g = gated(name, fn); if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer(name, g); else RENDERERS[name] = g; }

/* ---------------------------------------------------------- Credit Policy */
var POLICY_ROWS = [
  ['targetIRR', 'Target gross levered IRR', 'pct'], ['targetEM', 'Target gross equity multiple', 'x'], ['targetLpIRR', 'Target net LP IRR', 'pct'], ['targetLpEM', 'Target net LP equity multiple', 'x'],
  ['minDSCR', 'Minimum DSCR', 'x'], ['minDebtYield', 'Minimum debt yield', 'pct'], ['maxLTV', 'Maximum senior LTV', 'pct'], ['maxLTC', 'Maximum senior LTC', 'pct'],
  ['stressBps', 'Stressed underwriting rate premium (bps)', 'n'], ['minGoingInCap', 'Minimum going-in cap rate', 'pct'], ['minDevSpreadBps', 'Minimum development spread (bps)', 'n'],
  ['maxBreakEvenOcc', 'Maximum break-even economic occupancy', 'pct'], ['minNOITolerance', 'Minimum stabilised NOI decline tolerance', 'pct'], ['minRentCushion', 'Minimum rent cushion vs. break-even', 'pct'],
  ['maxHighRisks', 'Maximum high or critical risks', 'n'], ['maxDebtOverage', 'Maximum debt overage vs. supportable debt ($)', 'usd'],
  ['advanceScore', 'Gate score to APPROVE', 'pct'], ['conditionalScore', 'Gate score for CONDITIONAL', 'pct'], ['exitCapStressBps', 'Exit-cap stress for upside / downside IRR (bps)', 'n']
];
register('Credit Policy', function(){
  var p = window.bkPolicy(), D = window.BK_POLICY_DEFAULTS, custom = (bkLoad()._policy || {});
  var rows = POLICY_ROWS.map(function(r){
    var k = r[0], t = r[2], pct = t === 'pct';
    var val = pct ? (p[k] * 100).toFixed(2) : t === 'x' ? p[k].toFixed(2) : String(p[k]);
    var conv = pct ? '(parseFloat(this.value)||0)/100' : 'parseFloat(this.value.replace(/[$,]/g,\'\'))||0';
    var isCustom = Math.abs(p[k] - D[k]) > 1e-12;
    return '<tr><td class="rowlabel">' + r[1] + '</td><td class="v">' + inp('bkPolicySet(\'' + k + '\',' + conv + ')', val, 90) + (pct ? ' %' : '') + '</td><td data-bk-align="text">Default ' + fmt(D[k], t) + '</td><td>' + (isCustom ? chip('', 'CUSTOM') : chip('pass', 'DEFAULT')) + '</td></tr>';
  }).join('');
  var gw = 0;
  var gates = window.BK_GATES.map(function(g){
    var c = {weight:0, severity:g[4]}, o = (custom.gates || {})[g[0]] || {};
    c.weight = (o.weight !== undefined && isFinite(Number(o.weight))) ? Number(o.weight) : g[5]; c.severity = (o.severity === 'HARD' || o.severity === 'SOFT') ? o.severity : g[4]; gw += c.weight;
    return '<tr><td class="rowlabel">' + g[1] + '</td><td>' + g[3].replace('>=', '≥').replace('<=', '≤') + '</td>'
      + '<td class="v"><select onchange="bkPolicyGate(\'' + g[0] + '\',\'severity\',this.value)"><option' + (c.severity === 'HARD' ? ' selected' : '') + '>HARD</option><option' + (c.severity === 'SOFT' ? ' selected' : '') + '>SOFT</option></select></td>'
      + '<td class="v">' + inp('bkPolicyGate(\'' + g[0] + '\',\'weight\',(parseFloat(this.value)||0)/100)', (c.weight * 100).toFixed(1), 70) + ' %</td></tr>';
  }).join('');
  var wOk = Math.abs(gw - 1) < 1e-9;
  return { title:'Credit Policy', crumbs:'Credit & IC', desc:'House underwriting policy for this deal: the limits and weights the IC gate tests against.',
    meta:{ Property:bkLoad().name, Source:'CMM v3 house policy defaults', Weights: wOk ? 'Sum to 100%' : 'DO NOT SUM TO 100%' },
    main: table('House Underwriting Policy', th(['Policy', 'Value', 'Default', 'Status']), rows)
      + table('Gate Weights and Severity', th(['Gate', 'Test', 'Severity', 'Weight']), gates + '<tr class="grandtotal"><td class="rowlabel">Total weight (must be 100%)</td><td></td><td></td><td class="v">' + (gw * 100).toFixed(1) + '% ' + (wOk ? chip('pass', 'OK') : chip('fail', 'FIX')) + '</td></tr>')
      + note('A HARD failure blocks APPROVE whatever the score. Gates that do not apply to a deal (the debt tests on a development deal, for example) are dropped and the remaining weights re-based. These limits test the deal; they never change a return or a loan.')
      + '<div style="margin-top:14px"><button type="button" class="status-chip" onclick="if(confirm(\'Reset this deal\\u2019s credit policy to the house defaults?\'))bkPolicyReset()">RESET TO HOUSE DEFAULTS</button></div>',
    sidebar: side([['Gate weights', wOk ? 'Sum to 100%' : 'Not 100%'], ['Min DSCR', X(p.minDSCR)], ['Max LTV', P(p.maxLTV, 0)], ['Stress premium', p.stressBps + ' bps']], 'Policy') };
});

/* ----------------------------------------------------------- Debt Capacity */
register('Debt Capacity', function(){
  var s = bkLoad(), c = window.bkDebtCapacity();
  if(!c) return { title:'Debt Capacity', crumbs:'Credit & IC', desc:'What the property supports against house credit policy.', meta:{Property:s.name}, main:note('Debt capacity applies to acquisition deals with a sized senior loan. This deal is a development deal or has no loan.'), sidebar:'' };
  var p = c.policy, b = c.box;
  var box = [
    ['Loan-to-value (senior)', P(b.ltv), P(p.maxLTV), '≤', b.ltv <= p.maxLTV], ['Loan-to-cost (senior)', P(b.ltc), P(p.maxLTC), '≤', b.ltc <= p.maxLTC],
    ['DSCR, first operating year', X(b.dscr), X(p.minDSCR), '≥', b.dscr >= p.minDSCR], ['Debt yield', P(b.debtYield), P(p.minDebtYield), '≥', b.debtYield >= p.minDebtYield],
    ['Stressed DSCR (coupon + ' + p.stressBps + ' bps, amortizing)', X(b.stressedDscr), X(p.minDSCR), '≥', b.stressedDscr >= p.minDSCR],
    ['Senior loan vs. house capacity', $(c.requested), $(c.capacity + p.maxDebtOverage), '≤', c.overage <= p.maxDebtOverage]
  ].map(function(r){ return '<tr><td class="rowlabel">' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[3] + ' ' + r[2] + '</td><td>' + res(r[4] ? 'PASS' : 'FAIL') + '</td></tr>'; }).join('');
  var bridge = '<tr class="subtotal"><td class="rowlabel">Senior loan requested (sized by the engine)</td><td>Underwriting terms</td><td>' + $(c.requested) + '</td><td>' + P(c.requested / c.value) + '</td><td></td><td></td></tr>'
    + c.rows.map(function(r){ var bind = r === c.binding; return '<tr' + (bind ? ' class="grandtotal"' : '') + '><td class="rowlabel">' + r.name + '</td><td data-bk-align="text">' + r.basis + '</td><td>' + $(r.max) + '</td><td>' + P(r.ltv) + '</td><td>' + $(r.vsRequest) + '</td><td>' + (bind ? chip('fail', 'BINDING') : '') + '</td></tr>'; }).join('')
    + '<tr class="grandtotal"><td class="rowlabel">Maximum supportable senior debt</td><td data-bk-align="text">Lowest of the constraints</td><td>' + $(c.capacity) + '</td><td>' + P(c.capacity / c.value) + '</td><td>' + $(c.capacity - c.requested) + '</td><td>' + (c.overage > p.maxDebtOverage ? chip('fail', 'EXCEEDS CAPACITY') : chip('pass', 'WITHIN CAPACITY')) + '</td></tr>';
  var ladder = c.ladder.map(function(r){ return '<tr><td class="rowlabel">' + P(r.ltv, 0) + '</td><td>' + $(r.loan) + '</td><td>' + P(r.ltc) + '</td><td>' + $(r.ds) + '</td><td>' + X(r.dscr) + '</td><td>' + X(r.stabDscr) + '</td><td>' + (r.dscr >= p.minDSCR ? chip('pass', 'OK') : chip('fail', 'BELOW MIN')) + '</td></tr>'; }).join('');
  var rate = table('Interest Rate Headroom', null,
      '<tr><td class="rowlabel">All-in coupon in force</td><td class="v">' + P(c.coupon) + '</td></tr><tr><td class="rowlabel">Stressed underwriting rate</td><td class="v">' + P(c.stressedRate) + '</td></tr>'
    + '<tr><td class="rowlabel">Highest coupon at which Year-1 DSCR holds the minimum</td><td class="v">' + P(c.maxCoupon) + '</td></tr><tr class="grandtotal"><td class="rowlabel">Cushion to that coupon</td><td class="v">' + B(c.couponCushionBps) + '</td></tr>');
  return { title:'Debt Capacity', crumbs:'Credit & IC', desc:'The largest senior loan the property supports under each house constraint, and how the loan in force compares.',
    meta:{ Property:s.name, Binding:c.binding.name, Capacity:$(c.capacity), Request:$(c.requested) },
    main: table('Credit Box - Loan in Force vs. House Policy', th(['Metric', 'Underwritten', 'House limit', 'Status']), box)
      + table('Sizing Bridge - Requested Debt to Constraint Capacity', th(['Constraint', 'Basis', 'Maximum loan', 'Implied LTV', 'vs. requested', 'Binding']), bridge)
      + '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Binding Capacity</caption><tbody>'
      + '<tr><td class="rowlabel">Binding constraint</td><td class="v">' + c.binding.name + '</td></tr><tr><td class="rowlabel">Headroom to the next-tightest constraint</td><td class="v">' + $(c.headroom) + '</td></tr>'
      + '<tr class="grandtotal"><td class="rowlabel">Debt overage / (unused capacity) vs. request</td><td class="v">' + $(c.overage) + '</td></tr></tbody></table></div>'
      + table('Proceeds Ladder - Tested Leverage Range', th(['Target LTV', 'Loan', 'LTC', 'Annual debt service', 'DSCR', 'Stabilised DSCR', 'vs. minimum']), ladder) + rate
      + note('Capacity uses <b>house policy</b> limits (Credit Policy), which can be tighter than the loan terms the deal was underwritten with. The stressed-rate test sizes the loan as if the coupon were ' + p.stressBps + ' bps higher, so the loan still works if rates move. Year-3 NOI is the stabilised NOI.'),
    sidebar: side([['Supportable debt', $(c.capacity)], ['Requested', $(c.requested)], ['Overage', $(c.overage)], ['Binding', c.binding.name]], 'Debt Capacity') };
});

/* ---------------------------------------------------------------- IC Memo */
function listEditor(list, label, placeholder){
  var items = (ic().list || []);
}
function ic(){ return bkLoad()._ic || {}; }
register('IC Memo', function(){
  var s = bkLoad(), g = window.bkDealGate(), I = ic(), c = g.cushions, cap = g.capacity, ret = g.ret, w = g.waterfall;
  var banner = '<div class="note-flag" style="margin-top:0;border-left:4px solid ' + (g.verdict === 'APPROVE' ? '#3F6B4A' : g.verdict === 'CONDITIONAL' ? '#B8860B' : '#A93B2C') + '"><span>' + (g.verdict === 'APPROVE' ? '&#10003;' : '&#9888;') + '</span><div><b>' + esc(g.status) + '</b><br>' + esc(g.action) + '</div></div>';
  var thesis = (I.thesis || []).concat(['', '', '']).slice(0, Math.max(3, (I.thesis || []).length + 1));
  var thesisHtml = thesis.map(function(t, i){ return '<tr><td class="rowlabel">' + (i + 1) + '</td><td data-bk-align="text" colspan="3"><input type="text" style="width:100%" value="' + esc(t) + '" placeholder="Thesis point" onchange="bkICSet(\'thesis.' + i + '\',this.value)"></td></tr>'; }).join('');
  var dealRows = [
    ['Asset', esc(s.name) + ' · ' + esc(s.propertyType) + ' · ' + esc(s.location || '')], ['Deal type', esc(s.dealType)], ['Price / basis', $(s.purchasePrice) + (cap ? ' / ' + $(cap.cost) : '')],
    ['Year-1 NOI after reserves / going-in yield', cap ? $(cap.noi) + ' · ' + P(cap.noi / s.purchasePrice) : 'n/a'], ['Hold / exit cap', (Number(s.holdYears) || '') + ' years · ' + P(Number(s.exitCap))]
  ].map(function(r){ return '<tr><td class="rowlabel">' + r[0] + '</td><td data-bk-align="text">' + r[1] + '</td></tr>'; }).join('');
  var retRows = [
    ['Unlevered IRR / multiple', ret.u ? P(ret.u.irr) + ' / ' + X(ret.u.moic) : 'n/a'], ['Gross levered IRR / multiple', P(ret.irr) + ' / ' + X(ret.moic)],
    ['Net LP IRR / multiple', w ? P(w.lpIRR) + ' / ' + X(w.lp && w.lp.contrib > 0 ? w.lp.dist / w.lp.contrib : null) : 'n/a'], ['GP IRR / promote', w ? P(w.gpIRR) + ' / ' + $(w.promote) : 'n/a'],
    ['Upside / downside IRR (exit cap ±' + (c ? c.stressBps : 75) + ' bps)', c ? P(c.irrUpside, 1) + ' / ' + P(c.irrDownside, 1) : 'n/a']
  ].map(function(r){ return '<tr><td class="rowlabel">' + r[0] + '</td><td class="v">' + r[1] + '</td></tr>'; }).join('');
  var fin = cap ? [
    ['Requested / supportable', $(cap.requested) + ' / ' + $(cap.capacity)], ['Binding constraint', cap.binding.name], ['Year-1 DSCR / debt yield / LTV', X(cap.box.dscr) + ' / ' + P(cap.box.debtYield) + ' / ' + P(cap.box.ltv)],
    ['Stressed DSCR (+' + cap.policy.stressBps + ' bps)', X(cap.box.stressedDscr)], ['Highest coupon holding minimum DSCR', P(cap.maxCoupon) + ' (' + B(cap.couponCushionBps) + ' cushion)']
  ].map(function(r){ return '<tr><td class="rowlabel">' + r[0] + '</td><td class="v">' + r[1] + '</td></tr>'; }).join('') : '<tr><td class="rowlabel">Financing</td><td class="v">n/a for this deal</td></tr>';
  var cush = c ? [
    ['Year-1 break-even economic occupancy', P(c.breakEvenOccupancy), 'Occupancy at which NOI covers debt service'], ['Occupancy cushion', B(c.occupancyCushionBps), 'Underwritten occupancy over break-even'],
    ['Year-1 / stabilised NOI decline tolerance', P(c.noiTolerance1, 1) + ' / ' + P(c.noiTolerance3, 1), 'NOI fall before DSCR reaches the minimum'], ['Break-even rent (per unit per month)', c.breakEvenRent ? $(c.breakEvenRent) : 'n/a', 'Rent at which DSCR equals the minimum'],
    ['Rent cushion vs. break-even', P(c.rentCushion, 1), 'Underwritten rent over break-even rent'],
    ['Break-even exit cap at target IRR', c.exitCapBreakeven == null ? (c.exitCapBound ? c.exitCapBound + ' ' + P(Number(s.exitCap) + c.exitCapCushionBps / 10000) : 'n/a') : P(c.exitCapBreakeven), 'Exit cap at which levered IRR equals the target'],
    ['Exit cap cushion', (c.exitCapBound ? c.exitCapBound + ' ' : '') + B(c.exitCapCushionBps), 'Positive: room for the cap rate to widen']
  ].map(function(r){ return '<tr><td class="rowlabel">' + r[0] + '</td><td class="v">' + r[1] + '</td><td data-bk-align="text">' + r[2] + '</td></tr>'; }).join('') : '<tr><td class="rowlabel" colspan="3">Break-even and stress cushions apply to acquisition deals.</td></tr>';
  var gateRows = g.rows.map(function(r){
    return '<tr><td class="rowlabel">' + r.label + '</td><td>' + (r.applicable ? fmt(r.value, r.type) : '—') + '</td><td>' + (r.threshold != null && isFinite(r.threshold) && r.threshold < 1e90 ? fmt(r.threshold, r.type) : '—') + '</td><td>' + r.dir.replace('>=', '≥').replace('<=', '≤') + '</td><td>' + res(r.result) + '</td><td>' + chip(r.severity === 'HARD' ? 'fail' : '', r.severity) + '</td><td>' + (r.weight * 100).toFixed(0) + '%</td><td>' + (r.applicable && r.pass ? (r.weight * 100).toFixed(0) + '%' : r.applicable ? '0%' : '—') + '</td></tr>';
  }).join('') + '<tr class="grandtotal"><td class="rowlabel">Weighted gate score</td><td colspan="5"></td><td>' + (g.weightsOk ? '100%' : (g.weightTotal * 100).toFixed(0) + '%') + '</td><td>' + (g.score * 100).toFixed(0) + '%</td></tr>';
  var exc = g.exceptions.length ? g.exceptions.map(function(e, i){ return '<tr><td class="rowlabel">' + (i + 1) + '</td><td data-bk-align="text">' + esc(e.message) + '</td><td>' + chip(e.severity === 'HARD' ? 'fail' : '', e.severity) + '</td></tr>'; }).join('') : '<tr><td class="rowlabel"></td><td data-bk-align="text">No exceptions.</td><td></td></tr>';
  var reg = (I.risks || []).concat([{}]);
  var regRows = reg.map(function(r, i){
    var sc = (Number(r.prob) || 0) * (Number(r.impact) || 0), has = (r.risk || '').trim();
    return '<tr><td class="rowlabel"><input type="text" style="width:100%" value="' + esc(r.risk || '') + '" placeholder="Risk" onchange="bkICSet(\'risks.' + i + '.risk\',this.value)"></td><td>' + inp('bkICSet(\'risks.' + i + '.category\',this.value)', r.category || '', 90, 'left') + '</td>'
      + '<td>' + inp('bkICSet(\'risks.' + i + '.prob\',parseFloat(this.value)||0)', r.prob == null ? '' : r.prob, 40) + '</td><td>' + inp('bkICSet(\'risks.' + i + '.impact\',parseFloat(this.value)||0)', r.impact == null ? '' : r.impact, 40) + '</td>'
      + '<td>' + (has ? sc : '') + '</td><td>' + (has ? chip(sc >= 12 ? 'fail' : sc >= 6 ? 'warn' : '', (sc >= 20 ? 'Critical' : sc >= 12 ? 'High' : sc >= 6 ? 'Moderate' : 'Low')) : '') + '</td><td data-bk-align="text">' + inp('bkICSet(\'risks.' + i + '.mitigant\',this.value)', r.mitigant || '', 260, 'left') + '</td></tr>';
  }).join('');
  var cps = (I.conditions || []).concat(['']);
  var cpRows = cps.map(function(t, i){ return '<tr><td class="rowlabel">' + (i + 1) + '</td><td data-bk-align="text"><input type="text" style="width:100%" value="' + esc(t) + '" placeholder="Condition precedent" onchange="bkICSet(\'conditions.' + i + '\',this.value)"></td></tr>'; }).join('');
  var ov = g.override;
  var ovRows = '<tr><td class="rowlabel">Credit override</td><td class="v"><select onchange="bkICSet(\'override.on\',this.value)"><option' + (ov.on === 'YES' ? '' : ' selected') + '>NO</option><option' + (ov.on === 'YES' ? ' selected' : '') + '>YES</option></select></td></tr>'
    + '<tr><td class="rowlabel">Reason</td><td data-bk-align="text">' + inp('bkICSet(\'override.reason\',this.value)', ov.reason || '', 380, 'left') + '</td></tr>'
    + '<tr><td class="rowlabel">Approved by</td><td data-bk-align="text">' + inp('bkICSet(\'override.approvedBy\',this.value)', ov.approvedBy || '', 220, 'left') + '</td></tr>'
    + '<tr class="grandtotal"><td class="rowlabel">Override in effect</td><td class="v">' + (g.overrideValid ? chip('warn', 'YES — lifts the debt-capacity limit') : chip('', 'NO') + (ov.on === 'YES' ? ' needs a reason and an approver' : '')) + '</td></tr>';
  var sign = '<tr><td class="rowlabel">Prepared by</td><td data-bk-align="text">' + inp('bkICSet(\'preparedBy\',this.value)', I.preparedBy || '', 220, 'left') + '</td></tr><tr><td class="rowlabel">Reviewed by</td><td data-bk-align="text">' + inp('bkICSet(\'reviewedBy\',this.value)', I.reviewedBy || '', 220, 'left') + '</td></tr>';
  return { title:'IC Memo', crumbs:'Credit & IC', desc:'Investment committee summary: the deal gate against house policy, cushions, exceptions, risks and conditions.',
    meta:{ Property:s.name, Verdict:g.verdict, Score:(g.score * 100).toFixed(0) + '%', Exceptions:g.hard + ' hard / ' + g.soft + ' soft' },
    main: banner
      + table('Investment Thesis', null, thesisHtml)
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:0 24px">' + table('Deal Snapshot', null, dealRows) + table('Returns', null, retRows) + table('Financing', null, fin) + '</div>'
      + table('Policy Test Table - Every Gate in One Place', th(['Gate', 'Underwritten', 'Threshold', 'Test', 'Result', 'Severity', 'Weight', 'Score']), gateRows)
      + table('Ranked Exceptions', th(['#', 'Exception', 'Severity']), exc)
      + table('Break-Even and Stress Cushions', th(['Metric', 'Value', 'Meaning']), cush)
      + table('Risk Register (probability × impact, 1–5 each)', th(['Risk', 'Category', 'Prob.', 'Impact', 'Score', 'Severity', 'Mitigant']), regRows)
      + table('Conditions Precedent', null, cpRows) + table('Credit Override Governance', null, ovRows) + table('Sign-off', null, sign)
      + note('The gate tests the deal the engines produced against the house policy on <b>Credit Policy</b>. Verdict: DECLINE if the loan exceeds capacity with no valid override; APPROVE with no hard exceptions and a score at or above ' + (g.policy.advanceScore * 100).toFixed(0) + '%; CONDITIONAL at or above ' + (g.policy.conditionalScore * 100).toFixed(0) + '% (or no hard exceptions and at most two soft); otherwise DECLINE. Break-evens are bisections against the live engine.'),
    sidebar: side([['Verdict', verdictChip(g.verdict)], ['Gate score', (g.score * 100).toFixed(0) + '%'], ['Gates passed', g.passed + ' of ' + g.applicable], ['Hard / soft', g.hard + ' / ' + g.soft], ['High risks', String(g.register.high)]], 'IC Gate') };
});
})();
