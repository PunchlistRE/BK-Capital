/* BUSINESS VALUATION & UNDERWRITING. What the operating business is worth. Every figure is read from the business engine (src/132, bkBizModel): the
   driver-based P&L, the three-case DCF (bear / base / bull) with owner compensation normalised out, capex and working capital, the terminal value, the
   sensitivity grids and the market-multiple scenarios. This file adds the analysis's summary figures, its checks and its report; nothing is recalculated.
     revenue, EBITDA, FCF   the DCF's first year (EBITDA is after a market salary for the owner; the P&L's earnings line before it is SDE)
     value                  the base case's enterprise value: the discounted free cash flow plus the discounted terminal value
     EV / EBITDA            that value over the first year's EBITDA */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof bkLoad !== 'function') return;
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function n(v){ v = Number(v); return isFinite(v) ? v : 0; }
var $ = function(v){ if(v === null || v === undefined || !isFinite(v)) return '-'; var a = Math.round(Math.abs(v)).toLocaleString('en-US'); return v < 0 ? '($' + a + ')' : '$' + a; };
var P = function(v, d){ return v === null || v === undefined || !isFinite(v) ? '-' : (v * 100).toFixed(d == null ? 1 : d) + '%'; };
var X = function(v){ return v === null || v === undefined || !isFinite(v) ? '-' : v.toFixed(2) + 'x'; };

window.bkBusinessAnalysis = function(){
  var m = safe(function(){ return typeof window.bkBizModel === 'function' ? window.bkBizModel() : null; }, null);
  var r = { m:m, missing:[] };
  if(!m){ r.missing.push('An operating business: load the Punchlist model or start a blank one on Business Model'); r.ok = false; return r; }
  var d = m.dcf, y1 = d && d.rows && d.rows[0];
  if(!y1 || !(n(y1.revenue) > 0)) r.missing.push('Revenue (the business model\'s pricing and volume)');
  if(!(n(d && d.rate) > 0)) r.missing.push('A discount rate');
  r.ok = !r.missing.length;
  if(!r.ok) return r;
  r.revenue = y1.revenue; r.ebitda = y1.ebitda; r.sde = y1.sde; r.fcf = y1.fcf; r.ev = d.ev; r.equity = d.equity; r.multiple = n(y1.ebitda) > 0 ? d.ev / y1.ebitda : null;
  r.cases = ['bear', 'base', 'bull'].map(function(k){ var c = m.cases[k]; return { name:k.charAt(0).toUpperCase() + k.slice(1), rate:c.rate, g:c.g, mult:c.mult, comp:c.comp, ev:c.ev, equity:c.equity }; });
  r.checks = [
    { id:'bizFcf', label:'Each year\'s free cash flow = EBITDA - capex - the change in working capital', ok:d.rows.every(function(x){ return Math.abs(x.fcf - (x.ebitda - x.capex - x.nwc)) < 0.01; }) },
    { id:'bizEbitda', label:'EBITDA = owner-benefit earnings (SDE) - the owner\'s market salary', ok:d.rows.every(function(x){ return Math.abs(x.ebitda - (x.sde - x.owner)) < 0.01; }) },
    { id:'bizPV', label:'Each year\'s present value = free cash flow x its discount factor', ok:d.rows.every(function(x){ return Math.abs(x.pv - x.fcf * x.df) < 0.01; }) },
    { id:'bizEV', label:'Enterprise value = the discounted free cash flow + the discounted terminal value', ok:Math.abs(d.ev - (d.rows.reduce(function(a, x){ return a + x.pv; }, 0) + d.pvTV)) < 1 } ];
  r.tiesOk = r.checks.every(function(c){ return c.ok; });
  return r;
};

function tbl(cap, rows, head){ return '<div class="tbl-wrap" style="margin-top:14px;overflow-x:auto"><table class="fin">' + (cap ? '<caption>' + esc(cap) + '</caption>' : '') + (head || '') + '<tbody>' + rows.join('') + '</tbody></table></div>'; }
function row(l, v, note, cls){ return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td class="rowlabel">' + esc(l) + '</td><td class="v">' + v + '</td><td class="u">' + esc(note || '') + '</td></tr>'; }
function head(cols){ return '<thead><tr>' + cols.map(function(c, i){ return '<th' + (i ? '' : ' class="rowlabel-h"') + '>' + c + '</th>'; }).join('') + '</tr></thead>'; }
function yearsTable(r, cap, lines){ var R = r.m.dcf.rows; return tbl(cap, lines.map(function(l){ return '<tr' + (l[2] ? ' class="' + l[2] + '"' : '') + '><td class="rowlabel">' + esc(l[0]) + '</td>' + R.map(function(x){ return '<td class="v">' + $(l[1](x)) + '</td>'; }).join('') + '</tr>'; }), head(['Year'].concat(R.map(function(x){ return String(x.year); })))); }
function grid(cap, rowsL, colsL, data, fr, fc){ return tbl(cap, data.map(function(rw, i){ return '<tr><td class="rowlabel">' + fr(rowsL[i]) + '</td>' + rw.map(function(v){ return '<td class="v">' + $(v) + '</td>'; }).join('') + '</tr>'; }), head([''].concat(colsL.map(fc)))); }
var SECT = {
  bizExec:function(r){ return '<h2>What the business is worth</h2><p>Base case enterprise value <b>' + $(r.ev) + '</b>: ' + X(r.multiple) + ' first-year EBITDA of ' + $(r.ebitda) + ' (after a ' + $(r.m.dcf.comp) + ' market salary for the owner), at a ' + P(r.m.dcf.rate) + ' discount rate and ' + P(r.m.dcf.g) + ' terminal growth. The terminal value is ' + P(r.m.dcf.tvShare, 0) + ' of it.</p>'
    + tbl('Three cases', r.cases.map(function(c){ return '<tr' + (c.name === 'Base' ? ' class="grandtotal"' : '') + '><td class="rowlabel">' + c.name + '</td><td class="v">' + $(c.ev) + '</td><td class="v">' + P(c.rate) + '</td><td class="v">' + P(c.g) + '</td><td class="v">' + X(c.mult) + '</td><td class="v">' + $(c.comp) + '</td></tr>'; }), head(['Case', 'Enterprise value', 'Discount rate', 'Terminal growth', 'Exit multiple', 'Owner salary'])); },
  bizOps:function(r){ return '<h2>Revenue, costs and EBITDA</h2>' + yearsTable(r, 'Base case by year', [['Revenue', function(x){ return x.revenue; }], ['Operating costs', function(x){ return -x.opex; }], ['Owner-benefit earnings (SDE)', function(x){ return x.sde; }, 'total'], ['Owner\'s market salary', function(x){ return -x.owner; }], ['EBITDA', function(x){ return x.ebitda; }, 'grandtotal']]); },
  bizCash:function(r){ return '<h2>Working capital and free cash flow</h2>' + yearsTable(r, 'From EBITDA to free cash flow', [['EBITDA', function(x){ return x.ebitda; }], ['Capital expenditure', function(x){ return -x.capex; }], ['Change in working capital', function(x){ return -x.nwc; }], ['Free cash flow', function(x){ return x.fcf; }, 'grandtotal'], ['Present value', function(x){ return x.pv; }]]); },
  bizValue:function(r){ var d = r.m.dcf, sc = (r.m.valuation && r.m.valuation.scenarios) || []; return '<h2>Valuation and multiples</h2>' + tbl('Base case DCF', [row('Discounted free cash flow', $(d.sumPV), 'years ' + d.rows[0].year + ' to ' + d.rows[d.rows.length - 1].year + ', mid-year'), row('Terminal value', $(d.tvSel), 'perpetuity ' + $(d.tvPerp) + ', exit multiple ' + $(d.tvMult)), row('Discounted terminal value', $(d.pvTV), P(d.tvShare, 0) + ' of the value'), row('Enterprise value', $(d.ev), '', 'grandtotal'), row('EV / first-year EBITDA', X(r.multiple), '')])
    + (sc.length ? tbl('Market-multiple scenarios', sc.map(function(x){ return '<tr><td class="rowlabel">' + esc(x.name) + '</td><td class="v">' + $(x.revenue) + '</td><td class="v">' + P(x.margin, 0) + '</td><td class="v">' + $(x.ebitda) + '</td><td class="v">' + X(x.mult) + '</td><td class="v">' + $(x.ev) + '</td></tr>'; }), head(['Scenario', 'Revenue', 'Margin', 'EBITDA', 'Multiple', 'Value'])) : ''); },
  bizSens:function(r){ var S = r.m.sens; return '<h2>Sensitivity</h2>' + grid('Equity value: discount rate (down) by terminal growth (across)', S.rates, S.gs, S.s1, function(x){ return P(x); }, function(x){ return P(x); })
    + grid('Equity value: discount rate (down) by exit multiple (across)', S.rates, S.mults, S.s2, function(x){ return P(x); }, function(x){ return X(x); }) + grid('Equity value: owner salary (down) by discount rate (across)', S.comps, S.rates, S.s3, function(x){ return $(x); }, function(x){ return P(x); }); },
  disclosures:function(r){ return '<h2>Assumptions and limitations</h2><ul><li>Revenue is built from the business model\'s pricing tiers and job volume; EBITDA is after a market salary for the owner, so it is what a buyer who hires a manager would earn.</li><li>The DCF uses mid-year discounting; the terminal value is ' + esc(r.m.dcf.method === 3 ? 'the average of the perpetuity and exit-multiple values' : 'as selected on Business Valuation') + '.</li><li>This is an estimate of the business\'s value, not a fairness opinion; the real estate it uses is valued separately.</li></ul>'; } };
function report(){ var s = bkLoad(), r = window.bkBusinessAnalysis(), secs = window.BKReg ? window.BKReg.report('business') : [];
  var body = r.ok ? secs.map(function(x){ var f = SECT[x.id]; return f ? '<section class="rf-sec" data-section="' + x.id + '">' + f(r) + '</section>' : ''; }).join('')
    + tbl('Checks', r.checks.map(function(c){ return '<tr><td class="rowlabel">' + esc(c.label) + '</td><td><span class="status-chip ' + (c.ok ? 'pass' : 'fail') + '">' + (c.ok ? 'Ties' : 'Does not tie') + '</span></td></tr>'; }))
    : '<div class="note-flag"><span>&#9888;</span><div><b>Not calculated yet.</b> Still needed: ' + esc(r.missing.join('; ')) + '. <a href="#" onclick="showSheet(\'Business Model\');return false">Open Business Model</a></div></div>';
  return { title:'Business Report', crumbs:'Reports', desc:'Built from the business valuation, one section per part of the report. Print / PDF prints it.', meta:{ Business:esc((r.m && r.m.name) || s.name || 'Untitled'), Value:r.ok ? $(r.ev) : '-' }, main:'<div class="rf rf-report">' + body + '</div>', sidebar:'' }; }
window.bkBusinessReportSections = function(){ return Object.keys(SECT); };
if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Business Report', report); else RENDERERS['Business Report'] = report;
})();
