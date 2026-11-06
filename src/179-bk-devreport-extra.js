/* ===========================================================================
   DEVELOPMENT INVESTMENT SUMMARY - the pages that explain the investment: returns and what they rest on, operations and lease-up, financing and coverage, what breaks the deal
   (break-evens, single-variable and combined-downside sensitivities), and the model's own integrity findings and limits. Every figure is read from the engine's calls or from a rerun of
   the engine with one input changed (bkRunWith); nothing is estimated here. Results are memoised on the deal's contents, so re-opening the summary (or changing the photo) is instant.
   =========================================================================== */
(function(){
'use strict';
if(typeof bkLoad !== 'function' || typeof window.bkRunWith !== 'function') return;
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
function usd(v){ return v == null || !isFinite(v) ? '—' : (v < 0 ? '($' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US') + (v < 0 ? ')' : ''); }
function mil(v){ return v == null || !isFinite(v) ? '—' : (v < 0 ? '($' : '$') + (Math.abs(v) / 1e6).toFixed(2) + 'M' + (v < 0 ? ')' : ''); }
function pct(v, d){ return v == null || !isFinite(v) ? '—' : (v * 100).toFixed(d == null ? 2 : d) + '%'; }
function mult(v){ return v == null || !isFinite(v) || v <= 0 ? '—' : v.toFixed(2) + 'x'; }
var memo = null;

/* one engine run, reduced to what the tables show */
function metrics(){
  var o = {};
  try {
    var m = bkMonthlyReturns(), f = bkDevFundingV10(), t = bkDevTakeoutV11(), s = bkLoad(), w = safe(function(){ return bkWaterfallSummary(); }, null), rows = m.rows, last = rows[rows.length - 1] || {};
    var stabNOI = num(t.stabPointNOI || t.noi), held = !!t.conHeldToSale, bal = held ? num(t.conHeldBalance) : num(t.permLoan), ds = held ? bal * num(s.conRate) : num(t.permPmt) * 12;
    var opDist = rows.reduce(function(a, r, i){ return a + (i < rows.length - 1 ? Math.max(0, num(r.wfDist)) : Math.max(0, num(r.noi) - num(r.ds) - num(r.assetFee))); }, 0);
    var net = num(last.sale) - num(last.dispoFee);
    o = { irr:m.irr, moic:m.moic, uirr:m.u && m.u.irr, umoic:m.u && m.u.moic, uprofit:m.u && m.u.profit, profit:num(m.dist) - num(m.contrib), contrib:num(m.contrib), dist:num(m.dist), grossSale:num(last.grossSale), netSale:net, payoff:num(last.payoff),
      lpIRR:w ? w.lp.irr : null, gpIRR:w ? w.gp.irr : null, lpMOIC:w ? w.lp.moic : null, gpMOIC:w ? w.gp.moic : null, lpDist:w ? w.lp.dist : null, gpDist:w ? w.gp.dist : null, lpContrib:w ? w.lp.contributed : null, gpContrib:w ? w.gp.contributed : null, promote:w ? w.gp.promote : null,
      extraEq:num(f.overflowTotal), dscr:ds > 0 ? stabNOI / ds : null, ds:ds, bal:bal, stabNOI:stabNOI, commit:num(f.commit), capInt:num(f.actualCapInt), unlev:num(f.unlev), levered:num(f.levered), equityTotal:num(f.equityTotal), stabVal:num(t.stabVal), hold:num(f.hold), stab:num(f.stab),
      beSale:(num(last.payoff) + num(m.contrib) - opDist) / (1 - num(s.saleCostPct) - num(s.dispositionFeePct)) };
  } catch(e){ o.err = e.message; }
  return o;
}
function run(ov){ return window.bkRunWith(ov || {}, metrics); }
function irrOf(ov){ return window.bkRunWith(ov, function(){ return safe(function(){ return bkMonthlyReturns().irr; }, NaN); }); }
/* find x in [lo, hi] where f(x) = target; f is monotone over the range. Returns { x } or { bound:'<'|'>' } when the range never reaches the target. */
function solve(f, lo, hi, target){
  /* scan a grid (the IRR solver can fail at the extremes), then bisect inside the first cell the target falls in */
  var N = 12, pts = [], i; for(i = 0; i <= N; i++){ var x = lo + (hi - lo) * i / N, y = f(x); if(isFinite(y)) pts.push([x, y - target]); }
  if(pts.length < 2) return { x:null, bound:'n/a' };
  for(i = 0; i < pts.length - 1; i++){ if(pts[i][1] * pts[i + 1][1] <= 0){ var a = pts[i][0], b = pts[i + 1][0], fa = pts[i][1];
    for(var k = 0; k < 16; k++){ var mid = (a + b) / 2, c = f(mid) - target; if(!isFinite(c)) break; if(fa * c <= 0) b = mid; else { a = mid; fa = c; } } return { x:(a + b) / 2 }; } }
  var lowEnd = Math.abs(pts[0][1]) < Math.abs(pts[pts.length - 1][1]); return { x:null, bound:lowEnd ? 'low' : 'high', at:lowEnd ? pts[0][0] : pts[pts.length - 1][0] };
}

function build(){
  var s = bkLoad(), key = JSON.stringify(s); if(memo && memo.key === key) return memo.d;
  var hurdle = num(safe(function(){ return bkPolicy().targetIRR; }, 0.12)) || 0.12, base = run({}), cm = num(s.constructionMonths), lu = num(s.leaseupMonths), hy = num(s.holdYears), rate = num(s.conRate), rent = num(s.avgRent), cap = num(s.exitCap);
  var D = { s:s, hurdle:hurdle, base:base, tables:[], be:{} };
  var T = function(name, rows){ D.tables.push({ name:name, rows:rows.map(function(r){ return Object.assign({ label:r[0] }, run(r[1])); }) }); };
  T('Exit capitalization rate', [-0.0050, -0.0025, 0, 0.0025, 0.0050, 0.0075, 0.0100].map(function(d){ return [(d === 0 ? 'Base ' : (d > 0 ? '+' : '') + Math.round(d * 10000) + ' bps ') + '(' + pct(cap + d, 2) + ')', { exitCap:cap + d }]; }));
  T('Average monthly rent', [-0.15, -0.10, -0.05, 0, 0.05, 0.10].map(function(d){ return [(d === 0 ? 'Base ' : (d > 0 ? '+' : '') + Math.round(d * 100) + '% ') + '($' + Math.round(rent * (1 + d)).toLocaleString('en-US') + ')', { avgRent:rent * (1 + d) }]; }));
  T('Construction cost (hard, incl. contingency)', [0, 0.05, 0.10, 0.15, 0.20].map(function(d){ return [d === 0 ? 'Base budget' : '+' + Math.round(d * 100) + '%', { scnHardPct:num(s.scnHardPct) + d }]; }));
  T('Construction loan rate', [0, 100, 200, 300].map(function(d){ return [d === 0 ? 'Base (' + pct(rate, 2) + ')' : '+' + d + ' bps', { conRate:rate + d / 10000 }]; }));
  T('Construction delay (exit moves with it)', [0, 3, 6, 12].map(function(n){ return [n === 0 ? 'Base schedule' : n + ' months', { constructionMonths:cm + n, holdYears:hy + n / 12 }]; }));
  T('Lease-up delay (exit moves with it)', [0, 3, 6, 12].map(function(n){ return [n === 0 ? 'Base schedule' : n + ' months', { leaseupMonths:lu + n, holdYears:hy + n / 12 }]; }));
  D.combined = [
    ['1. Cost +10, rent −5, cap +50', { scnHardPct:num(s.scnHardPct) + 0.10, avgRent:rent * 0.95, exitCap:cap + 0.005 }],
    ['2. Cost +15, rate +200, delay 6 mo', { scnHardPct:num(s.scnHardPct) + 0.15, conRate:rate + 0.02, constructionMonths:cm + 6, holdYears:hy + 0.5 }],
    ['3. Rent −10, lease-up +6 mo, cap +100', { avgRent:rent * 0.90, leaseupMonths:lu + 6, holdYears:hy + 0.5, exitCap:cap + 0.01 }],
    ['4. Cost +20, rate +300, rent −10, cap +100', { scnHardPct:num(s.scnHardPct) + 0.20, conRate:rate + 0.03, avgRent:rent * 0.90, exitCap:cap + 0.01 }]].map(function(r){ return Object.assign({ label:r[0] }, run(r[1])); });
  /* what breaks the deal */
  var be = D.be, hit = function(sol, fmt, base0){ return sol.x != null ? fmt(sol.x) : (sol.bound === 'n/a' ? 'not calculable' : (sol.bound === 'low' ? 'still above the hurdle at ' + fmt(sol.at) : 'already below the hurdle at ' + fmt(sol.at))); };
  var capSol = solve(function(c){ return irrOf({ exitCap:c }); }, 0.02, 0.14, hurdle);
  var capMoic = solve(function(c){ return window.bkRunWith({ exitCap:c }, function(){ return safe(function(){ return bkMonthlyReturns().moic; }, NaN); }); }, 0.02, 0.30, 1);
  var rentSol = solve(function(r){ return irrOf({ avgRent:r }); }, rent * 0.4, rent * 1.3, hurdle);
  var costSol = solve(function(d){ return irrOf({ scnHardPct:num(s.scnHardPct) + d }); }, 0, 1.0, hurdle);
  var landSol = solve(function(f){ return irrOf({ purchasePrice:num(s.purchasePrice) * f }); }, 0.3, 3, hurdle);
  var stabNOIAt = function(ov){ return window.bkRunWith(ov, function(){ return safe(function(){ return bkCalc().after; }, NaN); }); }, ds = base.ds || 0;
  var rentDscr = ds > 0 ? solve(function(r){ return stabNOIAt({ avgRent:r }); }, rent * 0.2, rent * 1.5, ds) : { x:null, bound:'n/a' };
  var vacDscr = ds > 0 ? solve(function(v){ return stabNOIAt({ vacancy:v }); }, 0, 0.95, ds) : { x:null, bound:'n/a' };
  var delay = null; for(var n = 0; n <= 36; n += 3){ var r = irrOf({ constructionMonths:cm + n, holdYears:hy + n / 12 }); if(!isFinite(r) || r < hurdle){ delay = n; break; } }
  be.rows = [
    ['Exit cap rate at which the levered IRR equals the ' + pct(hurdle, 1) + ' hurdle', hit(capSol, function(c){ return pct(c, 2) + ' (' + (c >= cap ? '+' : '') + Math.round((c - cap) * 10000) + ' bps)'; })],
    ['Exit cap rate at which equity gets its money back (1.00x)', capMoic.x != null ? pct(capMoic.x, 2) + ' (+' + Math.round((capMoic.x - cap) * 10000) + ' bps)' : 'not reached below ' + pct(0.30, 0) ],
    ['Break-even sale value (equity profit zero)', mil(base.beSale) + ' against ' + mil(base.grossSale) + ' base (' + pct(1 - base.beSale / base.grossSale, 0) + ' cushion)'],
    ['Average rent at which the levered IRR equals the hurdle', hit(rentSol, function(r){ return usd(r) + ' (' + Math.round((r / rent - 1) * 100) + '% vs base)'; })],
    ['Average rent for 1.00x coverage of ' + (base.ds > 0 ? 'the stabilized debt service of ' + usd(base.ds) : 'debt service'), ds > 0 ? hit(rentDscr, function(r){ return usd(r) + ' (' + Math.round((r / rent - 1) * 100) + '% vs base)'; }) : 'no debt service after stabilization'],
    ['Break-even occupancy for 1.00x coverage', ds > 0 ? (vacDscr.x != null ? pct(1 - vacDscr.x, 1) + ' (base ' + pct(1 - num(s.vacancy), 1) + ')' : 'not calculable') : 'no debt service after stabilization'],
    ['Hard-cost overrun at which the levered IRR equals the hurdle', hit(costSol, function(d){ return '+' + Math.round(d * 100) + '%'; })],
    ['Land price at which the levered IRR equals the hurdle', hit(landSol, function(f){ return usd(num(s.purchasePrice) * f) + ' (' + Math.round((f - 1) * 100) + '% vs base)'; })],
    ['Construction delay the deal can absorb before the IRR falls below the hurdle', delay == null ? 'more than 36 months' : (delay === 0 ? 'none: the base case is already below the hurdle' : 'under ' + delay + ' months')]];
  /* operating statement, lease-up and unit economics */
  D.beNum = { cap:capSol.x, capMoic:capMoic.x, rent:rentSol.x, cost:costSol.x, land:landSol.x, rentDscr:rentDscr.x, vacDscr:vacDscr.x };
  D.cush = { capBps:capSol.x != null ? (capSol.x - cap) * 10000 : null, rentPct:rentSol.x != null ? rentSol.x / rent - 1 : null, costPct:costSol.x != null ? costSol.x : null };
  D.calc = safe(function(){ return bkCalc(); }, {});
  D.ramp = safe(function(){ return bkDevV09().leaseupRamp || []; }, []);
  D.dev = safe(function(){ return bkDevV09(); }, {});
  D.fund = safe(function(){ return bkDevFundingV10(); }, {});
  D.tk = safe(function(){ return bkDevTakeoutV11(); }, {});
  D.refi = window.bkRunWith({ refiAtStab:1, permDSCR:0 }, function(){ var t = bkDevTakeoutV11(); return { permLoan:t.permLoan, conPayoff:t.conPayoff, fee:t.permFee, cashOut:t.refiProceeds, shortfall:t.refiShortfall, ds:num(t.permPmt) * 12, noi:num(t.noi), value:num(t.stabVal), rate:num(bkLoad().permRate), amort:num(bkLoad().permAmort), ltvCap:num(t.ltvCap), dscrLoan:num(t.dscrLoan), bind:t.bindingTest }; });
  D.integrity = safe(function(){ return bkIntegrity(); }, null);
  D.gate = safe(function(){ return bkDealGate(); }, null);
  memo = { key:key, d:D }; return D;
}

/* ------------------------------------------------------------ pages (inner HTML; the report wraps them) */
function tbl(head, rows, cls){ return '<table' + (cls ? ' class="' + cls + '"' : '') + '><thead><tr>' + head.map(function(h, i){ return '<th' + (i ? '' : ' class="l"') + '>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>'; }
function trl(cells, cls){ return '<tr' + (cls ? ' class="' + cls + '"' : '') + '>' + cells.map(function(c, i){ return '<td class="' + (i === cells.length - 1 ? '' : 'l') + '">' + c + '</td>'; }).join('') + '</tr>'; }
function tr(cells, cls){ return '<tr' + (cls ? ' class="' + cls + '"' : '') + '>' + cells.map(function(c, i){ return '<td' + (i ? '' : ' class="l"') + '>' + c + '</td>'; }).join('') + '</tr>'; }

function returnsPage(D){
  var b = D.base, s = D.s, hurdle = D.hurdle, units = num(s.units), gsf = num(s.gsf);
  var prop = [['Total development cost (before financing)', usd(b.unlev) + (units ? ' · ' + usd(b.unlev / units) + ' per unit' : '') + (gsf ? ' · $' + Math.round(b.unlev / gsf) + ' per GSF' : '')], ['All-in cost (with fees and interest)', usd(b.levered + (D.fund.months || []).reduce(function(a, z){ return a + num(z.excess); }, 0))],
    ['Stabilized NOI (after reserves)', usd(b.stabNOI)], ['Yield on cost', pct(b.unlev ? b.stabNOI / b.unlev : null)], ['Development spread over exit cap', b.unlev ? Math.round((b.stabNOI / b.unlev - num(s.exitCap)) * 10000) + ' bps' : '—'],
    ['Gross / net sale value', mil(b.grossSale) + ' / ' + mil(b.netSale)], ['Unlevered profit', usd(b.uprofit)], ['Unlevered IRR / multiple', pct(b.uirr) + ' / ' + mult(b.umoic)]];
  var eq = [[bkCapName('closingEquity', true), usd(b.equityTotal)], ['Total contributed equity / distributions', usd(b.contrib) + ' / ' + usd(b.dist)], ['Levered profit', usd(b.profit)], ['Levered IRR / multiple', pct(b.irr) + ' / ' + mult(b.moic)],
    ['Equity beyond the planned amount', usd(b.extraEq)], ['LP: contributed · IRR · multiple', usd(b.lpContrib) + ' · ' + pct(b.lpIRR) + ' · ' + mult(b.lpMOIC)], ['GP: contributed · IRR · multiple', usd(b.gpContrib) + ' · ' + pct(b.gpIRR) + ' · ' + mult(b.gpMOIC)], ['GP promote', usd(b.promote)]];
  var pb = null, cum = 0; safe(function(){ bkMonthlyReturns().rows.forEach(function(r, i){ cum += num(r.cf); if(pb == null && cum > 0 && i > 0) pb = i + 1; }); });
  var where = b.dist > 0 ? [['Return of capital', b.contrib], ['Profit', b.profit]] : [];
  var src = '<div class="note" style="margin-top:6px">Contributions and distributions are gross: equity called, and any month\'s cash shortfall the partners fund, are contributions; the surplus is a distribution. The multiple is total distributions over total contributions. IRRs are XIRR on actual dated cash flows. Equity payback is month ' + (pb || '—') + ' of ' + b.hold + '.</div>';
  var drivers = '<div class="ins"><div>The deal clears its ' + pct(hurdle, 1) + ' hurdle by <b>' + ((b.irr - hurdle) * 100).toFixed(1) + ' points</b> at ' + pct(b.irr, 1) + ' levered (' + pct(b.uirr, 1) + ' unlevered): leverage adds about ' + ((b.irr - b.uirr) * 100).toFixed(1) + ' points, at the cost of ' + usd(b.capInt) + ' of capitalized interest' + (D.fund.months && b.extraEq > 0 ? ' and equity paying ' + usd(b.extraEq) + ' beyond the plan' : '') + '.</div>'
    + '<div>The return is mostly a sale return: ' + mil(b.netSale - b.payoff) + ' comes back at exit after repaying ' + mil(b.payoff) + ' of debt. The stabilized yield on cost of ' + pct(b.unlev ? b.stabNOI / b.unlev : null) + ' against a ' + pct(num(s.exitCap)) + ' exit cap is the whole development spread: each 25 bps of exit cap moves the sale value by about ' + mil(b.grossSale - b.grossSale * num(s.exitCap) / (num(s.exitCap) + 0.0025)) + '.</div></div>';
  return '<h2>Returns and what they rest on</h2><div class="g2"><div><h2 style="font-size:11px">Property</h2><table><tbody>' + prop.map(function(r){ return tr(r); }).join('') + '</tbody></table></div><div><h2 style="font-size:11px">Equity, LP and GP</h2><table><tbody>' + eq.map(function(r){ return tr(r); }).join('') + '</tbody></table></div></div>' + src + drivers;
}

function opsPage(D){
  var s = D.s, c = D.calc, units = num(s.units), ramp = D.ramp, dev = D.dev, mixTbl = '';
  var sch = safe(function(){ return window.bkDevUnitOn && bkDevUnitOn(s) ? s.devLeaseup.types : null; }, null), gsf = num(s.gsf), gpr = num(c.gpr);
  if(sch){ mixTbl = tbl(['Unit type', 'Units', 'Rent / month', 'Annual rent', 'Share'], sch.filter(function(t){ return num(t.units) > 0; }).map(function(t){ return tr([esc(t.name || 'Unit'), num(t.units), usd(num(t.rent)), usd(num(t.units) * num(t.rent) * 12), pct(num(t.units) / units, 0)]); }).concat([tr(['Total / weighted average', units, usd(gpr / 12 / Math.max(1, units)), usd(gpr), '100%'], 'tot')])); }
  else mixTbl = '<table><tbody>' + [['Units', String(units)], ['Average rent / unit / month', usd(num(s.avgRent))], ['Annual potential rent', usd(gpr)], ['Rent per unit per year', usd(gpr / Math.max(1, units))], ['Rent per GSF per month', gsf ? '$' + (gpr / 12 / gsf).toFixed(2) : '—']].map(function(r){ return tr(r); }).join('') + '</tbody></table><div class="note" style="margin-top:4px">The unit mix by type is not entered for this deal; the model uses the units at an average rent. Enter it on Dev Lease-Up (by unit type) to show it here.</div>';
  var neg = function(v){ return v < 0 ? '(' + usd(-v).replace(/[()]/g, '') + ')' : usd(v); };
  var op = [['Gross potential rent', usd(gpr)], ['Vacancy and credit loss', neg(num(c.vacancy) + num(c.bad))], ['Other income', usd(num(c.other))], ['Effective gross income', usd(num(c.egi)), 'sub'],
    ['Operating expenses (incl. management ' + usd(num(c.mgmt)) + ')', neg(-num(c.total))], ['Net operating income (before reserves)', usd(num(c.noi)), 'sub'], ['Replacement reserves', neg(-(num(c.noi) - num(c.after)))], ['Cash flow after reserves', usd(num(c.after)), 'tot']];
  var opTbl = '<table><tbody>' + op.map(function(r){ return tr([r[0], r[1]], r[2]); }).join('') + '</tbody></table><div class="note" style="margin-top:4px">Stabilized NOI is derived from the rent and expense inputs; it is never forced to a target. Expense ratio ' + pct(num(c.expenseRatio), 1) + ' of EGI.</div>';
  var q = [], k = 0; ramp.forEach(function(r){ var qi = Math.floor(k / 3); (q[qi] = q[qi] || []).push(r); k++; });
  var luTbl = ramp.length ? tbl(['Months', 'Occupancy (end)', 'EGI', 'NOI after reserves'], q.map(function(g){ var a = g[0].mo, bz = g[g.length - 1].mo; return tr(['Months ' + a + '–' + bz, pct(g[g.length - 1].occ, 0), usd(g.reduce(function(t, z){ return t + num(z.egi); }, 0)), neg(g.reduce(function(t, z){ return t + num(z.after); }, 0))]); })) : '<div class="note">No lease-up: stabilized at completion.</div>';
  var svg = ''; if(ramp.length){ var W = 330, H = 90, mx = ramp.length; svg = '<svg viewBox="0 0 ' + W + ' ' + (H + 18) + '" style="width:100%;height:auto;color:#0e2a4a"><rect x="0" y="0" width="' + W + '" height="' + H + '" fill="none" stroke="rgba(120,120,120,.35)"/>' + ramp.map(function(r, i){ var h = Math.max(1, r.occ * (H - 6)), x0 = 4 + i * ((W - 8) / mx); return '<rect x="' + x0.toFixed(1) + '" y="' + (H - h).toFixed(1) + '" width="' + Math.max(2, (W - 8) / mx - 2).toFixed(1) + '" height="' + h.toFixed(1) + '" fill="#3E9AE6"/>'; }).join('') + '<text x="4" y="' + (H + 12) + '" font-size="8" fill="currentColor" opacity=".7">month ' + ramp[0].mo + '</text><text x="' + (W - 4) + '" y="' + (H + 12) + '" font-size="8" text-anchor="end" fill="currentColor" opacity=".7">month ' + ramp[mx - 1].mo + ' · ' + pct(ramp[mx - 1].occ, 0) + ' occupied</text></svg>'; }
  return '<h2>Unit economics, operations and lease-up</h2><div class="g2"><div><h2 style="font-size:11px">Units and rent</h2>' + mixTbl + '</div><div><h2 style="font-size:11px">Stabilized operating statement (annual)</h2>' + opTbl + '</div></div>'
    + '<div class="bx mt"><div class="t">Lease-up schedule</div><div class="s">Construction completes in month ' + dev.co + '; leasing runs ' + (dev.luMo || 0) + ' months to stabilization in month ' + dev.stab + '. Occupancy ramps ' + (sch ? 'by unit type as scheduled' : 'in a straight line') + '; fixed costs run in full from completion, so the early months lose money.</div>' + svg + luTbl + '</div>'
    + '<div class="note" style="margin-top:6px">Rent growth ' + pct(num(s.rentGrowth), 1) + ' and expense growth ' + pct(num(s.opexGrowth), 1) + ' a year apply after stabilization. Concessions: ' + (num(s.concessionLeaseUpPct) ? pct(num(s.concessionLeaseUpPct), 1) + ' of lease-up rent' : 'none') + '.</div>';
}

function financePage(D){
  var b = D.base, s = D.s, f = D.fund, t = D.tk, r = D.refi, ms = f.months || [], peak = Math.max.apply(null, ms.map(function(z){ return num(z.end); }).concat([0])), excess = ms.reduce(function(a, z){ return a + num(z.excess); }, 0), draws = ms.reduce(function(a, z){ return a + num(z.loanDraw); }, 0);
  var held = !!t.conHeldToSale, val = b.stabVal, bal = b.bal, noi = b.stabNOI;
  var fixed = !!f.fixedFacility, ceilV = num(f.balCap), unusedV = num(f.unusedFees);
  var fac = [[fixed ? 'Facility commitment (fixed principal entered)' : 'Facility commitment (LTC ' + pct(num(s.conLTC), 0) + ' formula)', usd(b.commit)], ['Interest rate / origination fee', pct(num(s.conRate), 2) + ' / ' + pct(num(s.conOrigFee), 2)]].concat(ceilV > num(f.commit) + 0.5 ? [['Balance ceiling (principal + capitalized interest)', usd(ceilV)]] : []).concat(num(s.conEquityFirst) > 0 ? [['Equity funds the first', usd(num(s.conEquityFirst))]] : []).concat([['Loan draws', usd(draws)], ['Capitalized interest', usd(b.capInt)],
    ['Interest paid by equity once the commitment is full', usd(excess)], ['Peak balance (before sale)', usd(peak)], ['Headroom left in the ' + (ceilV > num(f.commit) + 0.5 ? 'ceiling' : 'commitment'), usd((ceilV > num(f.commit) + 0.5 ? ceilV : b.commit) - peak)], ['Unused-commitment fee' + (num(s.conUnusedFeePct) > 0 ? ' (' + pct(num(s.conUnusedFeePct), 2) + ' a year on undrawn principal)' : ''), num(s.conUnusedFeePct) > 0 ? usd(unusedV) : 'none entered'],
    ['Repayment', held ? 'Held after stabilization (interest paid currently); ' + usd(bal) + ' repaid from the sale' : 'Taken out at stabilization by a ' + usd(t.permLoan) + ' permanent loan']]);
  var cov = [['Loan to cost (all-in)', pct(b.levered ? b.bal / (b.levered + excess) : null)], ['Loan to value (stabilized value ' + mil(val) + ')', pct(val ? bal / val : null)], ['Debt yield (NOI / loan)', pct(bal ? noi / bal : null)], ['Debt service coverage (stabilized NOI / annual debt service)', b.dscr ? mult(b.dscr) : '—'],
    ['Interest coverage', b.dscr ? mult(b.dscr) + (held ? ' (interest only)' : '') : '—'], ['Annual debt service after stabilization', usd(b.ds)]];
  var refi = r && r.permLoan > 0 ? [['Permanent loan (65% LTV, no coverage test)', usd(r.permLoan)], ['Rate / amortization', pct(r.rate, 2) + ' / ' + r.amort + ' years'], ['Repays the construction loan', usd(r.conPayoff)], ['Refinance fees', usd(r.fee)], ['Net cash out to equity', usd(r.cashOut)], ['Takeout shortfall equity must fund', usd(r.shortfall)], ['Annual debt service', usd(r.ds)],
    ['DSCR / debt yield / LTV', mult(r.ds ? r.noi / r.ds : null) + ' / ' + pct(r.permLoan ? r.noi / r.permLoan : null) + ' / ' + pct(r.value ? r.permLoan / r.value : null)], ['Value of the retained property (' + pct(num(s.exitCap)) + ' cap)', usd(r.value)], ['Equity left in the deal', usd(r.value - r.permLoan)]] : [];
  var note = refi.length ? '<div class="note" style="margin-top:4px">Sized at the model\'s permanent-loan LTV with the coverage test switched off, so the coverage shown is what that loan would run at. A lender testing ' + mult(num(s.permDSCR) || 1.25) + ' coverage would lend less. This is a stabilisation-date illustration: the model still values and sells the property at the end of the hold; it does not model holding it afterwards.</div>' : '';
  return '<h2>Financing and debt metrics</h2><div class="g2"><div><h2 style="font-size:11px">Construction facility</h2><table><tbody>' + fac.map(function(x){ return tr(x); }).join('') + '</tbody></table></div><div><h2 style="font-size:11px">Coverage and leverage</h2><table><tbody>' + cov.map(function(x){ return tr(x); }).join('') + '</tbody></table></div></div>'
    + (refi.length ? '<h2 style="margin-top:14px">Refinance alternative at stabilization (month ' + b.stab + ')</h2><table><tbody>' + refi.map(function(x){ return tr(x); }).join('') + '</tbody></table>' + note : '');
}

var COLS = '<colgroup>' + [30, 8.5, 7.5, 8.5, 8, 7.5, 7.5, 6.5, 9.5, 6.5].map(function(w){ return '<col style="width:' + w + '%">'; }).join('') + '</colgroup>';
function riskPage(D){
  var b = D.base, hurdle = D.hurdle, head = ['Case', 'Sale value', 'Profit', 'Unlev. IRR', 'Lev. IRR', 'LP IRR', 'GP IRR', 'LP x', 'Extra equity', 'DSCR'];
  var cell = function(q){ var cls = isFinite(q.irr) && q.irr < hurdle ? ' class="neg"' : ''; return '<tr><td class="l">' + esc(q.label) + '</td><td>' + mil(q.grossSale) + '</td><td>' + mil(q.profit) + '</td><td>' + pct(q.uirr, 1) + '</td><td' + cls + '>' + pct(q.irr, 1) + '</td><td>' + pct(q.lpIRR, 1) + '</td><td>' + pct(q.gpIRR, 0) + '</td><td>' + mult(q.lpMOIC) + '</td><td>' + mil(q.extraEq) + '</td><td>' + (q.dscr ? mult(q.dscr) : '—') + '</td></tr>'; };
  var tables = D.tables.map(function(t){ return '<h2 style="font-size:10px;margin:8px 0 2px">' + esc(t.name) + '</h2><table class="rr" style="table-layout:fixed">' + COLS + '<thead><tr>' + head.map(function(h, i){ return '<th' + (i ? '' : ' class="l"') + ' style="font-size:6.4px;letter-spacing:0;padding:3px 2px">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + t.rows.map(cell).join('') + '</tbody></table>'; });
  var be = '<table><tbody>' + D.be.rows.map(function(r){ return tr(r); }).join('') + '</tbody></table>';
  var a = '<h2>What breaks the deal</h2><div class="note" style="margin:0 0 4px">Each break-even reruns the full model with one input moved until the levered IRR reaches the ' + pct(hurdle, 1) + ' hurdle (or equity just gets its money back). Red = below the hurdle. In the combined cases cost is the hard-cost overrun in %, rent the change in %, rate and cap the change in bps.</div>' + be;
  var comb = '<h2>Combined downside cases</h2><table class="rr" style="table-layout:fixed">' + COLS + '<thead><tr>' + head.map(function(h, i){ return '<th' + (i ? '' : ' class="l"') + ' style="font-size:6.4px;letter-spacing:0;padding:3px 2px">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + cell(Object.assign({ label:'Base case' }, b)) + D.combined.map(cell).join('') + '</tbody></table>';
  return { a:a + '<div class="note" style="margin-top:4px">Delays move the sale by the same number of months. Cost overrun applies to hard cost including contingency. DSCR is stabilized NOI over annual debt service after stabilization.</div>' + comb, b:'<h2>Single-variable sensitivities</h2>' + tables.join('') };
}

/* Development budget, contingency and initial reserves. Every figure is read from the engine (bkDevV09 cost ladder and contingency register, bkDevFundingV10 funding ledger and reserve totals); the only arithmetic here is adding engine
   figures that the page shows as a total, and a by-purpose "released" line that is funded less used (both engine figures), tied to the engine's own released total in the footer. */
function budgetPage(D){
  var f = D.fund || {}, x = D.dev || {}, s = D.s, ms = f.months || [], units = num(s.units), gsf = num(s.gsf), hl = x.hardLadder || { lines:[], contingency:0, total:num(x.hard) }, sl = x.softLadder || { lines:[], total:num(x.soft) }, reg = x.contReg;
  var perU = function(v){ return units ? usd(v / units) : '—'; }, perG = function(v){ return gsf ? '$' + (v / gsf).toFixed(0) : '—'; };
  var line = function(label, v, cls){ return tr([label, usd(v), perU(v), perG(v)], cls); };
  var hardEx = num(x.hard) - num(hl.contingency), resFunded = num(f.resFunded), total = num(x.unlev) + resFunded;
  var bud = '<table><thead><tr><th class="l">Development budget</th><th>Amount</th><th>Per unit</th><th>Per GSF</th></tr></thead><tbody>'
    + line('Land', num(x.land)) + line('Closing costs and acquisition fee', num(x.close) + num(x.acq)) + line('Predevelopment', num(x.pre))
    + line('Hard cost: trades', num(hl.tradeSubtotal)) + line('Hard cost: general conditions, contractor fee and bonds', num(hl.gc) + num(hl.contractorFee) + num(hl.riskBonds)) + line('Hard cost: contingency', num(hl.contingency))
    + line('Hard costs, total', num(x.hard), 'sub') + line('Soft costs', num(x.soft)) + (num(x.leaseDef) ? line('Lease-up deficit', num(x.leaseDef)) : '') + (resFunded ? line('Initial reserves', resFunded) : '')
    + line('Total development budget', total, 'tot') + '</tbody></table>'
    + '<div class="note" style="margin-top:3px">Financing costs come on top and are on the Financing page: loan fee and unused-commitment fees ' + usd(num(f.upfrontFees)) + ', capitalized interest ' + usd(num(f.actualCapInt)) + '. Cost before financing and reserves is ' + usd(num(x.unlev)) + ' (' + perG(num(x.unlev)) + ' a GSF).</div>';
  var softRows = (sl.lines || []).filter(function(l){ return num(l.total) > 0; });
  var hardRows = (hl.lines || []).filter(function(l){ return num(l.total) > 0; });
  var det = '<table class="rr" style="table-layout:auto"><thead><tr><th class="l">Hard cost trade</th><th>Amount</th><th>Per GSF</th></tr></thead><tbody>' + hardRows.map(function(l){ return tr([esc(l.name), usd(l.total), perG(num(l.total))]); }).join('') + '</tbody></table>'
    + '<table class="rr" style="table-layout:auto;margin-top:6px"><thead><tr><th class="l">Soft cost line</th><th>Amount</th><th>Per GSF</th></tr></thead><tbody>' + softRows.map(function(l){ return tr([esc(l.name), usd(l.total), perG(num(l.total))]); }).join('') + '</tbody></table>';
  var ct;
  if(reg){
    var cols = [['Original', reg.original], ['Allocated', reg.allocated], ['Unallocated', reg.unallocated], ['Used', reg.used], ['Remaining', reg.remaining], ['Further use', reg.more], ['Total use', reg.forecast], ['Left', reg.forecastRemaining]].concat(num(reg.overrun) ? [['Overrun', reg.overrun]] : []).concat(num(reg.saved) ? [['Released', reg.saved]] : []);
    ct = '<table class="rr" style="table-layout:fixed"><thead><tr>' + cols.map(function(c, i){ return '<th' + (i ? '' : ' class="l"') + '>' + c[0] + '</th>'; }).join('') + '</tr></thead><tbody><tr>' + cols.map(function(c, i){ return '<td' + (i ? '' : ' class="l"') + '>' + usd(num(c[1])) + '</td>'; }).join('') + '</tr></tbody></table>'
      + '<div class="note" style="margin-top:3px">' + (reg.release === 'saved' ? 'Contingency not forecast to be used is released from the budget.' : 'Contingency is treated as spent in full in the budget.') + ' Used = change orders approved to date; further use is forecast to completion; overruns are added to cost. Allocations: ' + (((D.s.contingency || {}).allocations || []).filter(function(a){ return num(a.amount) > 0; }).map(function(a){ return esc(a.name || 'Unnamed') + ' ' + usd(num(a.amount)); }).join('; ') || 'none entered') + '. Change orders: ' + (((D.s.contingency || {}).changeOrders || []).filter(function(a){ return num(a.amount) > 0; }).map(function(a){ return esc(a.name || 'Unnamed') + ' ' + usd(num(a.amount)); }).join('; ') || 'none') + '.</div>';
  } else ct = '<div class="note">No contingency register is entered. Contingency is the ' + usd(num(hl.contingency)) + ' in the hard-cost ladder and is spent in full in the budget.</div>';
  var list = f.resList || [], sumM = function(k){ return ms.reduce(function(a, z){ return a + num(z[k]); }, 0); }, mr = safe(function(){ return bkMonthlyReturns(); }, { rows:[] }), sumR = function(k){ return (mr.rows || []).reduce(function(a, z){ return a + num(z[k]); }, 0); }, usedOp = sumM('resLease') + sumR('resOp'), usedInt = sumM('resInt'), relSale = sumR('resRelease');
  var byUse = function(u){ return list.filter(function(r){ return r.use === u; }).reduce(function(a, r){ return a + num(r.amount); }, 0); };
  var purposes = [['operating', 'Operating / lease-up', usedOp], ['interest', 'Debt service / interest', usedInt], ['held', 'Held', 0]];
  var rt;
  if(list.length){
    var fundTxt = function(mo){ var z = ms[mo - 1] || {}; return 'month ' + mo + ': equity ' + usd(num(z.eq) + num(z.overflow)) + ', loan ' + usd(num(z.loanDraw)); };
    rt = '<table class="rr" style="table-layout:auto"><thead><tr><th class="l">Reserve</th><th class="l">Purpose</th><th>Funded in month</th><th>Amount</th><th class="l">That month\'s cost was paid by</th></tr></thead><tbody>'
      + list.map(function(r){ return '<tr><td class="l">' + esc(r.name) + '</td><td class="l">' + esc((purposes.filter(function(p){ return p[0] === r.use; })[0] || [0, r.use])[1]) + '</td><td>' + r.mo + '</td><td>' + usd(num(r.amount)) + '</td><td class="l">' + fundTxt(r.mo) + '</td></tr>'; }).join('') + tr(['Total funded', '', '', usd(resFunded), ''], 'tot') + '</tbody></table>'
      + '<table class="rr" style="table-layout:auto;margin-top:6px"><thead><tr><th class="l">By purpose</th><th>Funded</th><th>Used</th><th>Released with the sale</th></tr></thead><tbody>'
      + purposes.filter(function(p){ return byUse(p[0]) > 0; }).map(function(p){ var left = byUse(p[0]) - p[2]; return tr([p[1], usd(byUse(p[0])), usd(p[2]), usd(Math.abs(left) < 0.5 ? 0 : left)]); }).join('')
      + tr(['Total', usd(resFunded), usd(usedOp + usedInt), usd(relSale)], 'tot') + '</tbody></table>'
      + '<div class="note" style="margin-top:3px">Reserves are a use of funds in the month they are funded (they are not an expense). The operating reserve pays the lease-up shortfall before the partners are asked; the interest reserve pays construction interest beyond the facility ceiling before equity does; whatever is left is released to the project with the sale. Funded equals used plus released (' + usd(resFunded) + ' = ' + usd(usedOp + usedInt) + ' + ' + usd(relSale) + ').</div>';
  } else rt = '<div class="note">No initial reserves are entered.</div>';
  return '<h2>Development budget</h2><div class="g2" style="grid-template-columns:1.1fr .9fr"><div>' + bud + '</div><div>' + det + '</div></div><h2 style="font-size:11px;margin-top:8px">Contingency</h2>' + ct + '<h2 style="font-size:11px;margin-top:8px">Initial reserves</h2>' + rt;
}

function integrityPage(D){
  var g = D.integrity, gate = D.gate || {}, s = D.s;
  var rows = g ? g.checks.map(function(c){ var k = c.status === 'pass' ? 'pass' : c.status === 'hard' ? 'fail' : c.status === 'warn' ? 'warn' : ''; return '<tr><td class="l" style="white-space:normal;line-height:1.1">' + esc(c.group) + '</td><td class="l" style="white-space:normal;line-height:1.15">' + esc(c.label) + '</td><td style="white-space:nowrap"><span class="pill ' + k + '">' + (c.status === 'hard' ? 'FAILED' : c.status === 'warn' ? 'WARNING' : c.status === 'na' ? 'N/A' : 'PASS') + '</span></td></tr>'; }).join('') : '';
  var detail = g ? g.hard.concat(g.warn).map(function(c){ return '<div><b>' + (c.status === 'hard' ? 'Failed: ' : 'Warning: ') + '</b>' + esc(c.label) + ' — ' + esc(c.detail) + '</div>'; }).join('') : '';
  var lim = ['Costs are entered as 13 hard-cost trades and 16 soft-cost lines; lines in a brief are merged to fit, and each cannot be escalated or reforecast on its own.',
    'The contingency register tracks allocations, change orders and forecast; it does not post spending against individual cost lines. Initial reserves are tracked in total by purpose, not as separate balances per reserve.',
    'Interest is capitalized only through stabilization; the brief\'s capitalization through the sale is not an option.',
    'Who earns the preferred return and what the GP catch-up runs to are taken from the deal\'s inputs; where the offering documents are silent they are the deal team\'s to confirm.',
    'A refinance is illustrated at stabilization; the property is still sold at the end of the hold.', 'Source citations, extraction confidence and broker-versus-model discrepancy reporting are not part of this summary.'];
  return '<h2>Model integrity and limits</h2><div class="g2" style="grid-template-columns:1.25fr .85fr"><div><div class="note" style="margin:0 0 4px">Every line is recomputed independently of the engine (' + esc(g ? g.text : 'not available') + '). A failed check holds the credit gate; a warning caps it at conditional.</div><table style="table-layout:fixed;font-size:8px"><colgroup><col style="width:15%"><col style="width:67%"><col style="width:18%"></colgroup><thead><tr><th class="l">Area</th><th class="l">Check</th><th>Result</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    + '<div><div class="bx" style="padding:10px 12px"><div class="t">Credit gate: ' + esc(gate.verdict || 'not assessed') + '</div><div class="s">' + esc(gate.status || '') + '</div><div class="ins" style="margin-top:4px">' + detail + '</div></div><h2 style="margin-top:10px">What this model cannot yet do</h2><div class="note">' + lim.map(function(x){ return '• ' + esc(x); }).join('<br>') + '</div></div></div>';
}


/* ------------------------------------------------------------ impact to portfolio (development and acquisition summaries) */
var pmemo = null;
function typeOf(sn){ return String(sn.propertyType || 'Unspecified'); }
function kindOf(sn){ return /develop/i.test(String(sn.dealType || '')) ? 'Development' : 'Acquisition'; }
function portfolioData(){
  var s = bkLoad(), saved = safe(function(){ return bkPortfolioLoad(); }, []), curKey = safe(function(){ return bkPortfolioKey(s); }, ''), key = JSON.stringify([saved, s]);
  if(pmemo && pmemo.key === key) return pmemo.d;
  var one = function(sn, isCur){
    var mt = safe(function(){ return bkPortfolioMetricsFor(sn); }, null), mr = safe(function(){ return bkPortfolioMonthlyFor(sn); }, null);
    if(!mt || !mt.ok || !mr || !mr.ok) return null;
    var r = mr.r, rows = r.rows || [];
    return { name:sn.name || sn.dealId || 'Untitled', type:typeOf(sn), kind:kindOf(sn), location:sn.location || '', equity:num(r.contrib), cost:num(mt.purchasePrice), loan:num(mt.loan), irr:mt.irr, moic:num(r.moic), dist:num(r.dist), profit:num(r.dist) - num(r.contrib), cur:isCur,
      flows:rows.map(function(x){ return { dt:x.dt, cf:num(x.cf) }; }), close:r.closeDt, eq0:num(rows[0] && rows[0].eqDraw) };
  };
  var others = saved.filter(function(sn){ return safe(function(){ return bkPortfolioKey(sn); }, '') !== curKey; }).map(function(sn){ return one(sn, false); }).filter(Boolean), me = one(s, true);
  var D = { me:me, others:others, first:others.length === 0 };
  var agg = function(list){
    var eq = list.reduce(function(a, x){ return a + x.equity; }, 0), cost = list.reduce(function(a, x){ return a + x.cost; }, 0), loan = list.reduce(function(a, x){ return a + x.loan; }, 0), dist = list.reduce(function(a, x){ return a + x.dist; }, 0), prof = list.reduce(function(a, x){ return a + x.profit; }, 0);
    var wirr = eq > 0 ? list.reduce(function(a, x){ return a + (isFinite(x.irr) ? x.irr * x.equity : 0); }, 0) / eq : null;
    var vals = [], dates = []; list.forEach(function(x){ if(x.close && x.eq0){ vals.push(-x.eq0); dates.push(x.close); } x.flows.forEach(function(f, i){ vals.push(f.cf + (i === 0 ? x.eq0 : 0)); dates.push(f.dt); }); });
    var order = dates.map(function(d, i){ return i; }).sort(function(a, b){ return +new Date(dates[a]) - +new Date(dates[b]); }), cirr = list.length ? window.bkIrrIndependent(order.map(function(i){ return vals[i]; }), order.map(function(i){ return dates[i]; })) : null;
    var by = function(f){ var m = {}; list.forEach(function(x){ m[f(x)] = (m[f(x)] || 0) + x.equity; }); return m; };
    var big = list.reduce(function(a, x){ return Math.max(a, x.equity); }, 0);
    return { n:list.length, eq:eq, cost:cost, loan:loan, lev:cost > 0 ? loan / cost : null, wirr:wirr, cirr:isFinite(cirr) ? cirr : null, moic:eq > 0 ? dist / eq : null, profit:prof, dev:eq > 0 ? list.filter(function(x){ return x.kind === 'Development'; }).reduce(function(a, x){ return a + x.equity; }, 0) / eq : null,
      big:eq > 0 ? big / eq : null, byType:by(typeOf_), byKind:by(function(x){ return x.kind; }), types:Object.keys(by(typeOf_)).length };
  };
  function typeOf_(x){ return x.type; }
  D.before = agg(others); D.after = me ? agg(others.concat([me])) : null; pmemo = { key:key, d:D }; return D;
}

function portfolioPage(){
  var D = safe(portfolioData, null); if(!D || !D.me) return '<h2>Impact to portfolio</h2><div class="note">The portfolio comparison could not be calculated for this deal.</div>';
  var me = D.me, b = D.before, a = D.after, own = '<table><tbody>' + [['This deal on its own', me.kind + ' · ' + esc(me.type)], ['Total contributed equity / total cost', usd(me.equity) + ' / ' + usd(me.cost)], ['Levered profit', usd(me.profit)], ['Levered IRR / multiple', pct(me.irr) + ' / ' + mult(me.moic)]].map(function(r){ return tr(r); }).join('') + '</tbody></table>';
  if(D.first){
    return '<h2>Impact to portfolio</h2><div class="bx" style="padding:10px 12px"><div class="t">First deal in the portfolio: N/A</div><div class="s">No other underwritten assets are saved in BK Capital, so there is no portfolio to compare against. This deal would be the first asset; the figures below are the deal on its own.</div></div><div class="mt">' + own + '</div>'
      + '<div class="note" style="margin-top:8px">Once other deals are saved to the portfolio, this page shows the current assets and what adding this one changes: equity and leverage, the equity-weighted and combined (dated cash flow) IRR, the multiple, concentration in the largest asset, and the mix by property type and by development versus acquisition.</div>';
  }
  var asset = function(x){ return tr([esc(x.name) + '<div style="font-size:7px;opacity:.7">' + esc(x.kind + ' · ' + x.type) + '</div>', usd(x.equity), usd(x.cost), pct(x.irr, 1), mult(x.moic), pct(b.eq ? x.equity / b.eq : null, 0)]); };
  var cur = '<table class="rr"><thead><tr><th class="l">Asset on file</th><th>Contributed equity</th><th>Cost</th><th>Lev. IRR</th><th>Multiple</th><th>Share of contributed equity</th></tr></thead><tbody>' + D.others.map(asset).join('') + tr(['Portfolio (' + b.n + ' asset' + (b.n === 1 ? '' : 's') + ')', usd(b.eq), usd(b.cost), pct(b.wirr, 1), mult(b.moic), '100%'], 'tot') + '</tbody></table>';
  var row = function(label, x, y, fmt, delta){ var d = (x == null || y == null || !isFinite(x) || !isFinite(y)) ? '—' : delta(y - x); return tr([label, fmt(x), fmt(y), d]); };
  var pts = function(v){ return (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + ' pts'; }, dm = function(v){ return (v >= 0 ? '+' : '−') + usd(Math.abs(v)).replace(/[()]/g, ''); }, dx = function(v){ return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) + 'x'; }, dn = function(v){ return (v >= 0 ? '+' : '−') + Math.abs(v); };
  var cmp = '<table><thead><tr><th class="l">Portfolio measure</th><th>Before</th><th>With this deal</th><th>Change</th></tr></thead><tbody>'
    + row('Assets', b.n, a.n, String, dn) + row('Total contributed equity', b.eq, a.eq, usd, dm) + row('Total cost', b.cost, a.cost, usd, dm) + row('Debt', b.loan, a.loan, usd, dm) + row('Leverage (debt / cost)', b.lev, a.lev, function(v){ return pct(v, 1); }, pts)
    + row('Levered IRR, equity-weighted', b.wirr, a.wirr, function(v){ return pct(v, 2); }, pts) + row('Levered IRR, combined dated cash flows', b.cirr, a.cirr, function(v){ return pct(v, 2); }, pts) + row('Equity multiple', b.moic, a.moic, mult, dx) + row('Levered profit', b.profit, a.profit, usd, dm)
    + row('Development share of equity', b.dev, a.dev, function(v){ return pct(v, 0); }, pts) + row('Largest single asset, share of equity', b.big, a.big, function(v){ return pct(v, 0); }, pts) + row('Property types held', b.types, a.types, String, dn) + '</tbody></table>';
  var mix = function(m, tot){ return Object.keys(m).sort(function(x, y){ return m[y] - m[x]; }).map(function(k){ return esc(k) + ' ' + pct(tot ? m[k] / tot : null, 0); }).join(' · '); };
  var share = a.eq ? me.equity / a.eq : null, newType = !(b.byType[me.type] > 0), newKind = !(b.byKind[me.kind] > 0);
  var lines = ['Adds <b>' + usd(me.equity) + '</b> of equity, <b>' + pct(share, 0) + '</b> of the combined portfolio, and <b>' + usd(me.profit) + '</b> of levered profit (' + pct(me.irr, 1) + ', ' + mult(me.moic) + ').',
    (a.cirr != null && b.cirr != null ? 'Portfolio levered IRR on combined dated cash flows moves from <b>' + pct(b.cirr, 2) + '</b> to <b>' + pct(a.cirr, 2) + '</b> (' + pts(a.cirr - b.cirr) + '); the equity-weighted figure moves ' + pts(a.wirr - b.wirr) + '. The deal is ' + (me.irr > b.wirr ? 'accretive to' : 'dilutive to') + ' the portfolio\'s return.' : ''),
    'Diversification: ' + (newType ? 'a <b>new property type</b> (' + esc(me.type) + ')' : 'the same property type as existing assets (' + esc(me.type) + ', ' + pct(b.byType[me.type] / b.eq, 0) + ' of current equity)') + '; ' + (newKind ? 'it adds <b>' + me.kind.toLowerCase() + ' exposure</b> the portfolio did not have' : 'it adds more ' + me.kind.toLowerCase() + ' exposure') + '. Development share of equity goes from ' + pct(b.dev, 0) + ' to ' + pct(a.dev, 0) + '.',
    'Concentration: the largest single asset is ' + pct(b.big, 0) + ' of equity before and ' + pct(a.big, 0) + ' with this deal' + (me.equity >= Math.max.apply(null, D.others.map(function(x){ return x.equity; })) ? ' (this deal would be the largest)' : '') + '. Leverage moves from ' + pct(b.lev, 1) + ' to ' + pct(a.lev, 1) + '.'].filter(Boolean);
  return '<h2>Impact to portfolio</h2><div class="g2" style="grid-template-columns:1.2fr 1fr"><div><h2 style="font-size:11px">Current portfolio on file</h2>' + cur + '<div class="note" style="margin-top:3px">Assets are the underwritten deals saved in BK Capital, each shown on its own saved assumptions. Mix by property type: ' + mix(b.byType, b.eq) + '.</div></div><div>' + own + '</div></div>'
    + '<h2 style="margin-top:12px">What adding this asset changes</h2>' + cmp + '<div class="note" style="margin-top:3px">After: ' + mix(a.byType, a.eq) + '. Development ' + pct(a.dev, 0) + ' of equity.</div>'
    + '<div class="ins" style="margin-top:8px">' + lines.map(function(l){ return '<div>' + l + '</div>'; }).join('') + '</div>';
}
window.bkPortfolioImpact = portfolioData;
window.bkPortfolioImpactPage = portfolioPage;

window.bkDevReportData = build;
window.bkDevReportPages = function(){ var D = build(), r = riskPage(D); return { portfolio:portfolioPage(), returns:returnsPage(D), ops:opsPage(D), finance:financePage(D), budget:budgetPage(D), risk:r.a, sens:r.b, integrity:integrityPage(D), data:D }; };
})();
