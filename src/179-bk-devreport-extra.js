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
  T('Exit capitalisation rate', [-0.0050, -0.0025, 0, 0.0025, 0.0050, 0.0075, 0.0100].map(function(d){ return [(d === 0 ? 'Base ' : (d > 0 ? '+' : '') + Math.round(d * 10000) + ' bps ') + '(' + pct(cap + d, 2) + ')', { exitCap:cap + d }]; }));
  T('Average monthly rent', [-0.15, -0.10, -0.05, 0, 0.05, 0.10].map(function(d){ return [(d === 0 ? 'Base ' : (d > 0 ? '+' : '') + Math.round(d * 100) + '% ') + '($' + Math.round(rent * (1 + d)).toLocaleString('en-US') + ')', { avgRent:rent * (1 + d) }]; }));
  T('Construction cost (hard, incl. contingency)', [0, 0.05, 0.10, 0.15, 0.20].map(function(d){ return [d === 0 ? 'Base budget' : '+' + Math.round(d * 100) + '%', { scnHardPct:num(s.scnHardPct) + d }]; }));
  T('Construction loan rate', [0, 100, 200, 300].map(function(d){ return [d === 0 ? 'Base (' + pct(rate, 2) + ')' : '+' + d + ' bps', { conRate:rate + d / 10000 }]; }));
  T('Construction delay (exit moves with it)', [0, 3, 6, 12].map(function(n){ return [n === 0 ? 'Base schedule' : n + ' months', { constructionMonths:cm + n, holdYears:hy + n / 12 }]; }));
  T('Lease-up delay (exit moves with it)', [0, 3, 6, 12].map(function(n){ return [n === 0 ? 'Base schedule' : n + ' months', { leaseupMonths:lu + n, holdYears:hy + n / 12 }]; }));
  D.combined = [
    ['1. Costs +10%, rents -5%, exit cap +50 bps', { scnHardPct:num(s.scnHardPct) + 0.10, avgRent:rent * 0.95, exitCap:cap + 0.005 }],
    ['2. Costs +15%, rate +200 bps, 6-month construction delay', { scnHardPct:num(s.scnHardPct) + 0.15, conRate:rate + 0.02, constructionMonths:cm + 6, holdYears:hy + 0.5 }],
    ['3. Rents -10%, lease-up 6 months late, exit cap +100 bps', { avgRent:rent * 0.90, leaseupMonths:lu + 6, holdYears:hy + 0.5, exitCap:cap + 0.01 }],
    ['4. Costs +20%, rate +300 bps, rents -10%, exit cap +100 bps', { scnHardPct:num(s.scnHardPct) + 0.20, conRate:rate + 0.03, avgRent:rent * 0.90, exitCap:cap + 0.01 }]].map(function(r){ return Object.assign({ label:r[0] }, run(r[1])); });
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
    ['Average rent for 1.00x coverage of ' + (base.ds > 0 ? 'the stabilised debt service of ' + usd(base.ds) : 'debt service'), ds > 0 ? hit(rentDscr, function(r){ return usd(r) + ' (' + Math.round((r / rent - 1) * 100) + '% vs base)'; }) : 'no debt service after stabilisation'],
    ['Break-even occupancy for 1.00x coverage', ds > 0 ? (vacDscr.x != null ? pct(1 - vacDscr.x, 1) + ' (base ' + pct(1 - num(s.vacancy), 1) + ')' : 'not calculable') : 'no debt service after stabilisation'],
    ['Hard-cost overrun at which the levered IRR equals the hurdle', hit(costSol, function(d){ return '+' + Math.round(d * 100) + '%'; })],
    ['Land price at which the levered IRR equals the hurdle', hit(landSol, function(f){ return usd(num(s.purchasePrice) * f) + ' (' + Math.round((f - 1) * 100) + '% vs base)'; })],
    ['Construction delay the deal can absorb before the IRR falls below the hurdle', delay == null ? 'more than 36 months' : (delay === 0 ? 'none: the base case is already below the hurdle' : 'under ' + delay + ' months')]];
  /* operating statement, lease-up and unit economics */
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
    ['Stabilised NOI (after reserves)', usd(b.stabNOI)], ['Yield on cost', pct(b.unlev ? b.stabNOI / b.unlev : null)], ['Development spread over exit cap', b.unlev ? Math.round((b.stabNOI / b.unlev - num(s.exitCap)) * 10000) + ' bps' : '—'],
    ['Gross / net sale value', mil(b.grossSale) + ' / ' + mil(b.netSale)], ['Unlevered profit', usd(b.uprofit)], ['Unlevered IRR / multiple', pct(b.uirr) + ' / ' + mult(b.umoic)]];
  var eq = [['Equity requirement (peak contributed)', usd(b.equityTotal)], ['Total contributions / distributions', usd(b.contrib) + ' / ' + usd(b.dist)], ['Levered profit', usd(b.profit)], ['Levered IRR / multiple', pct(b.irr) + ' / ' + mult(b.moic)],
    ['Equity beyond the planned amount', usd(b.extraEq)], ['LP: contributed · IRR · multiple', usd(b.lpContrib) + ' · ' + pct(b.lpIRR) + ' · ' + mult(b.lpMOIC)], ['GP: contributed · IRR · multiple', usd(b.gpContrib) + ' · ' + pct(b.gpIRR) + ' · ' + mult(b.gpMOIC)], ['GP promote', usd(b.promote)]];
  var pb = null, cum = 0; safe(function(){ bkMonthlyReturns().rows.forEach(function(r, i){ cum += num(r.cf); if(pb == null && cum > 0 && i > 0) pb = i + 1; }); });
  var where = b.dist > 0 ? [['Return of capital', b.contrib], ['Profit', b.profit]] : [];
  var src = '<div class="note" style="margin-top:6px">Contributions and distributions are gross: equity called, and any month\'s cash shortfall the partners fund, are contributions; the surplus is a distribution. The multiple is total distributions over total contributions. IRRs are XIRR on actual dated cash flows. Equity payback is month ' + (pb || '—') + ' of ' + b.hold + '.</div>';
  var drivers = '<div class="ins"><div>The deal clears its ' + pct(hurdle, 1) + ' hurdle by <b>' + ((b.irr - hurdle) * 100).toFixed(1) + ' points</b> at ' + pct(b.irr, 1) + ' levered (' + pct(b.uirr, 1) + ' unlevered): leverage adds about ' + ((b.irr - b.uirr) * 100).toFixed(1) + ' points, at the cost of ' + usd(b.capInt) + ' of capitalised interest' + (D.fund.months && b.extraEq > 0 ? ' and equity paying ' + usd(b.extraEq) + ' beyond the plan' : '') + '.</div>'
    + '<div>The return is mostly a sale return: ' + mil(b.netSale - b.payoff) + ' comes back at exit after repaying ' + mil(b.payoff) + ' of debt. The stabilised yield on cost of ' + pct(b.unlev ? b.stabNOI / b.unlev : null) + ' against a ' + pct(num(s.exitCap)) + ' exit cap is the whole development spread: each 25 bps of exit cap moves the sale value by about ' + mil(b.grossSale - b.grossSale * num(s.exitCap) / (num(s.exitCap) + 0.0025)) + '.</div></div>';
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
  var opTbl = '<table><tbody>' + op.map(function(r){ return tr([r[0], r[1]], r[2]); }).join('') + '</tbody></table><div class="note" style="margin-top:4px">Stabilised NOI is derived from the rent and expense inputs; it is never forced to a target. Expense ratio ' + pct(num(c.expenseRatio), 1) + ' of EGI.</div>';
  var q = [], k = 0; ramp.forEach(function(r){ var qi = Math.floor(k / 3); (q[qi] = q[qi] || []).push(r); k++; });
  var luTbl = ramp.length ? tbl(['Months', 'Occupancy (end)', 'EGI', 'NOI after reserves'], q.map(function(g){ var a = g[0].mo, bz = g[g.length - 1].mo; return tr(['Months ' + a + '–' + bz, pct(g[g.length - 1].occ, 0), usd(g.reduce(function(t, z){ return t + num(z.egi); }, 0)), neg(g.reduce(function(t, z){ return t + num(z.after); }, 0))]); })) : '<div class="note">No lease-up: stabilised at completion.</div>';
  var svg = ''; if(ramp.length){ var W = 330, H = 90, mx = ramp.length; svg = '<svg viewBox="0 0 ' + W + ' ' + (H + 18) + '" style="width:100%;height:auto;color:#0e2a4a"><rect x="0" y="0" width="' + W + '" height="' + H + '" fill="none" stroke="rgba(120,120,120,.35)"/>' + ramp.map(function(r, i){ var h = Math.max(1, r.occ * (H - 6)), x0 = 4 + i * ((W - 8) / mx); return '<rect x="' + x0.toFixed(1) + '" y="' + (H - h).toFixed(1) + '" width="' + Math.max(2, (W - 8) / mx - 2).toFixed(1) + '" height="' + h.toFixed(1) + '" fill="#3E9AE6"/>'; }).join('') + '<text x="4" y="' + (H + 12) + '" font-size="8" fill="currentColor" opacity=".7">month ' + ramp[0].mo + '</text><text x="' + (W - 4) + '" y="' + (H + 12) + '" font-size="8" text-anchor="end" fill="currentColor" opacity=".7">month ' + ramp[mx - 1].mo + ' · ' + pct(ramp[mx - 1].occ, 0) + ' occupied</text></svg>'; }
  return '<h2>Unit economics, operations and lease-up</h2><div class="g2"><div><h2 style="font-size:11px">Units and rent</h2>' + mixTbl + '</div><div><h2 style="font-size:11px">Stabilised operating statement (annual)</h2>' + opTbl + '</div></div>'
    + '<div class="bx mt"><div class="t">Lease-up schedule</div><div class="s">Construction completes in month ' + dev.co + '; leasing runs ' + (dev.luMo || 0) + ' months to stabilisation in month ' + dev.stab + '. Occupancy ramps ' + (sch ? 'by unit type as scheduled' : 'in a straight line') + '; fixed costs run in full from completion, so the early months lose money.</div>' + svg + luTbl + '</div>'
    + '<div class="note" style="margin-top:6px">Rent growth ' + pct(num(s.rentGrowth), 1) + ' and expense growth ' + pct(num(s.opexGrowth), 1) + ' a year apply after stabilisation. Concessions: ' + (num(s.concessionLeaseUpPct) ? pct(num(s.concessionLeaseUpPct), 1) + ' of lease-up rent' : 'none') + '.</div>';
}

function financePage(D){
  var b = D.base, s = D.s, f = D.fund, t = D.tk, r = D.refi, ms = f.months || [], peak = Math.max.apply(null, ms.map(function(z){ return num(z.end); }).concat([0])), excess = ms.reduce(function(a, z){ return a + num(z.excess); }, 0), draws = ms.reduce(function(a, z){ return a + num(z.loanDraw); }, 0);
  var held = !!t.conHeldToSale, val = b.stabVal, bal = b.bal, noi = b.stabNOI;
  var fac = [['Facility commitment (LTC ' + pct(num(s.conLTC), 0) + ' formula)', usd(b.commit)], ['Interest rate / origination fee', pct(num(s.conRate), 2) + ' / ' + pct(num(s.conOrigFee), 2)], ['Loan draws', usd(draws)], ['Capitalised interest', usd(b.capInt)],
    ['Interest paid by equity once the commitment is full', usd(excess)], ['Peak balance (before sale)', usd(peak)], ['Headroom left in the commitment', usd(b.commit - peak)], ['Unused-commitment fee', 'not modelled'],
    ['Repayment', held ? 'Held after stabilisation (interest paid currently); ' + usd(bal) + ' repaid from the sale' : 'Taken out at stabilisation by a ' + usd(t.permLoan) + ' permanent loan']];
  var cov = [['Loan to cost (all-in)', pct(b.levered ? b.bal / (b.levered + excess) : null)], ['Loan to value (stabilised value ' + mil(val) + ')', pct(val ? bal / val : null)], ['Debt yield (NOI / loan)', pct(bal ? noi / bal : null)], ['Debt service coverage (stabilised NOI / annual debt service)', b.dscr ? mult(b.dscr) : '—'],
    ['Interest coverage', b.dscr ? mult(b.dscr) + (held ? ' (interest only)' : '') : '—'], ['Annual debt service after stabilisation', usd(b.ds)]];
  var refi = r && r.permLoan > 0 ? [['Permanent loan (65% LTV, no coverage test)', usd(r.permLoan)], ['Rate / amortisation', pct(r.rate, 2) + ' / ' + r.amort + ' years'], ['Repays the construction loan', usd(r.conPayoff)], ['Refinance fees', usd(r.fee)], ['Net cash out to equity', usd(r.cashOut)], ['Takeout shortfall equity must fund', usd(r.shortfall)], ['Annual debt service', usd(r.ds)],
    ['DSCR / debt yield / LTV', mult(r.ds ? r.noi / r.ds : null) + ' / ' + pct(r.permLoan ? r.noi / r.permLoan : null) + ' / ' + pct(r.value ? r.permLoan / r.value : null)], ['Value of the retained property (' + pct(num(s.exitCap)) + ' cap)', usd(r.value)], ['Equity left in the deal', usd(r.value - r.permLoan)]] : [];
  var note = refi.length ? '<div class="note" style="margin-top:4px">Sized at the model\'s permanent-loan LTV with the coverage test switched off, so the coverage shown is what that loan would run at. A lender testing ' + mult(num(s.permDSCR) || 1.25) + ' coverage would lend less. This is a stabilisation-date illustration: the model still values and sells the property at the end of the hold; it does not model holding it afterwards.</div>' : '';
  return '<h2>Financing and debt metrics</h2><div class="g2"><div><h2 style="font-size:11px">Construction facility</h2><table><tbody>' + fac.map(function(x){ return tr(x); }).join('') + '</tbody></table></div><div><h2 style="font-size:11px">Coverage and leverage</h2><table><tbody>' + cov.map(function(x){ return tr(x); }).join('') + '</tbody></table></div></div>'
    + (refi.length ? '<h2 style="margin-top:14px">Refinance alternative at stabilisation (month ' + b.stab + ')</h2><table><tbody>' + refi.map(function(x){ return tr(x); }).join('') + '</tbody></table>' + note : '');
}

var COLS = '<colgroup><col style="width:27%"><col style="width:8.5%"><col style="width:8%"><col style="width:8%"><col style="width:8.5%"><col style="width:7.5%"><col style="width:7.5%"><col style="width:7%"><col style="width:10.5%"><col style="width:7.5%"></colgroup>';
function riskPage(D){
  var b = D.base, hurdle = D.hurdle, head = ['Case', 'Gross sale', 'Profit', 'Unlev. IRR', 'Levered IRR', 'LP IRR', 'GP IRR', 'LP mult.', 'Equity beyond plan', 'DSCR'];
  var cell = function(q){ var cls = isFinite(q.irr) && q.irr < hurdle ? ' class="neg"' : ''; return '<tr><td class="l">' + esc(q.label) + '</td><td>' + mil(q.grossSale) + '</td><td>' + mil(q.profit) + '</td><td>' + pct(q.uirr, 1) + '</td><td' + cls + '>' + pct(q.irr, 1) + '</td><td>' + pct(q.lpIRR, 1) + '</td><td>' + pct(q.gpIRR, 0) + '</td><td>' + mult(q.lpMOIC) + '</td><td>' + mil(q.extraEq) + '</td><td>' + (q.dscr ? mult(q.dscr) : '—') + '</td></tr>'; };
  var tables = D.tables.map(function(t){ return '<h2 style="font-size:10px;margin:8px 0 2px">' + esc(t.name) + '</h2><table class="rr" style="table-layout:fixed">' + COLS + '<thead><tr>' + head.map(function(h, i){ return '<th' + (i ? '' : ' class="l"') + '>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + t.rows.map(cell).join('') + '</tbody></table>'; });
  var be = '<table><tbody>' + D.be.rows.map(function(r){ return tr(r); }).join('') + '</tbody></table>';
  var a = '<h2>What breaks the deal</h2><div class="note" style="margin:0 0 4px">Each break-even reruns the full model with one input moved until the levered IRR reaches the ' + pct(hurdle, 1) + ' hurdle (or equity just gets its money back). Red = below the hurdle.</div>' + be;
  var comb = '<h2>Combined downside cases</h2><table class="rr" style="table-layout:fixed">' + COLS + '<thead><tr>' + head.map(function(h, i){ return '<th' + (i ? '' : ' class="l"') + '>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + cell(Object.assign({ label:'Base case' }, b)) + D.combined.map(cell).join('') + '</tbody></table>';
  return { a:a + '<div class="note" style="margin-top:4px">Delays move the sale by the same number of months. Cost overrun applies to hard cost including contingency. DSCR is stabilised NOI over annual debt service after stabilisation.</div>' + comb, b:'<h2>Single-variable sensitivities</h2>' + tables.join('') };
}

function integrityPage(D){
  var g = D.integrity, gate = D.gate || {}, s = D.s;
  var rows = g ? g.checks.map(function(c){ var k = c.status === 'pass' ? 'pass' : c.status === 'hard' ? 'fail' : c.status === 'warn' ? 'warn' : ''; return '<tr><td class="l" style="white-space:nowrap">' + esc(c.group) + '</td><td class="l" style="white-space:normal;line-height:1.15">' + esc(c.label) + '</td><td style="white-space:nowrap"><span class="pill ' + k + '">' + (c.status === 'hard' ? 'FAILED' : c.status === 'warn' ? 'WARNING' : c.status === 'na' ? 'N/A' : 'PASS') + '</span></td></tr>'; }).join('') : '';
  var detail = g ? g.hard.concat(g.warn).map(function(c){ return '<div><b>' + (c.status === 'hard' ? 'Failed: ' : 'Warning: ') + '</b>' + esc(c.label) + ' — ' + esc(c.detail) + '</div>'; }).join('') : '';
  var lim = ['Costs are entered as 13 hard-cost trades and 16 soft-cost lines; lines in a brief are merged to fit, and each cannot be escalated or reforecast on its own.', 'Contingency and initial reserves are not tracked or released as separate balances.', 'The construction loan is sized by an LTC formula; a fixed commitment, a facility ceiling, an equity-first threshold and an unused-commitment fee cannot be entered.',
    'The GP catch-up is a share-of-profit target (100% until the GP holds that share), not a catch-up rate; the preferred return is shared by LP and GP unless hurdles are tested on LP flows.', 'A refinance is illustrated at stabilisation; the property is still sold at the end of the hold.', 'Source citations, extraction confidence and broker-versus-model discrepancy reporting are not part of this summary.'];
  return '<h2>Model integrity and limits</h2><div class="g2" style="grid-template-columns:1.25fr .85fr"><div><div class="note" style="margin:0 0 4px">Every line is recomputed independently of the engine (' + esc(g ? g.text : 'not available') + '). A failed check holds the credit gate; a warning caps it at conditional.</div><table style="table-layout:fixed;font-size:8px"><colgroup><col style="width:15%"><col style="width:67%"><col style="width:18%"></colgroup><thead><tr><th class="l">Area</th><th class="l">Check</th><th>Result</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    + '<div><div class="bx" style="padding:10px 12px"><div class="t">Credit gate: ' + esc(gate.verdict || 'not assessed') + '</div><div class="s">' + esc(gate.status || '') + '</div><div class="ins" style="margin-top:4px">' + detail + '</div></div><h2 style="margin-top:10px">What this model cannot yet do</h2><div class="note">' + lim.map(function(x){ return '• ' + esc(x); }).join('<br>') + '</div></div></div>';
}

window.bkDevReportData = build;
window.bkDevReportPages = function(){ var D = build(), r = riskPage(D); return { returns:returnsPage(D), ops:opsPage(D), finance:financePage(D), risk:r.a, sens:r.b, integrity:integrityPage(D), data:D }; };
})();
