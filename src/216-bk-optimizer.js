/* DEAL OPTIMIZER. Five steps on one page, every figure a full run of the underwriting engine on a scratch copy of the deal (bkRunWith), so nothing on the
   deal changes until "Apply" is pressed:
     01 Baseline              the deal as entered: price, NOI, capital, returns and the financing it has
     02 Investment hurdles    the targets (IRR, equity multiple, NPV at a discount rate, year-1 cash-on-cash, DSCR) and the gap to each
     03 Deal levers           price, rent, operating expenses, capital spending, hold period and exit cap, one at a time; where an IRR target is set, the level
                              of price, rent and exit cap that reaches it
     04 Financing optimization  alternative financing on the same deal: leverage, fixed or floating, SOFR spreads, interest-only or amortizing, term,
                              bank / agency / bridge terms, mezzanine and preferred equity: proceeds, debt service, cash flow, refinancing exposure and returns
     05 Recommendations       the combinations of price and financing that meet every hurdle, ranked by the least concession and risk, with what each
                              requires and the tradeoffs it brings
   The financing alternatives use the same debt engine and loan types as the inputs (src/047, src/214, src/215). */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof window.bkRunWith !== 'function') return;
var SHEET = 'Deal Optimizer';
function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
function esc(x){ return String(x == null ? '' : x).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
function pct(v, d){ return isFinite(v) && v !== null ? (v * 100).toFixed(d == null ? 2 : d) + '%' : '-'; }
function money(v){ return isFinite(v) ? (v < 0 ? '(' : '') + '$' + Math.round(Math.abs(v)).toLocaleString('en-US') + (v < 0 ? ')' : '') : '-'; }
function mx(v){ return isFinite(v) && v ? v.toFixed(2) + 'x' : '-'; }
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function bind(b){ b = String(b || ''); b = window.bkBindingName ? bkBindingName(b) : b; return /^(Lender DSCR|LTV|LTC)$/.test(b) ? b : b.toLowerCase(); }
function dev(s){ return /develop/i.test(String((s || {}).dealType || '')); }

/* ---------- one run: every measure the optimizer reads ---------- */
function measure(){ var s = bkLoad(), d = bkDebt(), r = bkMonthlyReturns(), c = safe(function(){ return bkCalc(); }, {});
  var eq = num(r.eqDraw) || num(d.equity), y1 = (r.rows || []).filter(function(z){ return z.m <= 12; }).reduce(function(a, z){ return a + num(z.cf) + num(z.eqDraw); }, 0);
  var ds1 = (r.rows || []).filter(function(z){ return z.m <= 12; }).reduce(function(a, z){ return a + num(z.ds) + num(z.mezzPaid); }, 0);
  var K = d.stack || {}, L = d.lifecycle || {}, gross = safe(function(){ return bkAnnualCF().grossSale; }, 0);
  var disc = num(s.hurdleNPVRate), npv = null;
  if(disc > 0 && r.xirrValues && r.xirrDates){ var t0 = r.xirrDates[0]; npv = r.xirrValues.reduce(function(a, v, i){ return a + v / Math.pow(1 + disc, (r.xirrDates[i] - t0) / (365.25 * 864e5)); }, 0); }
  return { irr:r.irr, em:r.moic, eq:eq, coc:eq > 0 ? y1 / eq : null, y1cf:y1, ds1:ds1, dscr:K.active && K.mezz ? K.combinedDscr : d.dscr, seniorDscr:d.dscr, loan:num(d.loan), mezz:num(K.mezz), pref:num(K.pref),
    proceeds:num(d.loan) + num(K.mezz) + num(K.pref), coupon:d.coupon, noi:num(c.noi), price:num(s.purchasePrice), npv:npv, exitLtv:gross > 0 ? (num(d.debtAtSale) + num((K.rows || []).slice(-1)[0] && K.rows.slice(-1)[0].mezzPayoff)) / gross : null,
    preExit:!!L.preExit, loanCosts:(L.costNotes || []).reduce(function(a, c){ return a + num(c.amount); }, 0), costKinds:(L.costNotes || []).map(function(c){ return c.kind; }).filter(function(v, i, a){ return a.indexOf(v) === i; }), balloon:num(L.balloon), maturity:num(L.maturityMonth), hold:Math.round(num(s.holdYears) * 12), floating:String(s.debtRateType || '') === 'Floating', binding:d.binding }; }
function run(ov){ return safe(function(){ return bkRunWith(ov || {}, measure); }, null); }

/* ---------- hurdles ---------- */
var HURDLES = [['irr', 'reverseSolveTargetIRR', 'Levered IRR', 'pct', 0.15], ['em', 'hurdleEM', 'Equity multiple', 'x', 1.8], ['coc', 'hurdleCoC', 'Year-1 cash-on-cash', 'pct', 0.06], ['dscr', 'hurdleDSCR', 'Lender DSCR (year 1)', 'x', 1.25], ['npv', 'hurdleNPVRate', 'NPV at the discount rate', 'rate', 0.12]];
function hurdlesOf(s){ return HURDLES.filter(function(h){ return num(s[h[1]]) > 0; }); }
function meets(h, m){ if(!m) return false; if(h[0] === 'npv') return m.npv !== null && m.npv >= 0; var v = m[h[0]]; return isFinite(v) && v !== null && v >= num(bkLoad()[h[1]]) - 1e-9; }
function meetsAll(s, m){ var H = hurdlesOf(s); return H.length > 0 && H.every(function(h){ return meets(h, m); }); }
function shortOf(s, m){ return hurdlesOf(s).filter(function(h){ return !meets(h, m); }).map(function(h){ return h[2]; }); }
window.bkOptHurdlesFill = function(){ var s = bkLoad(); HURDLES.forEach(function(h){ if(!(num(s[h[1]]) > 0)) s[h[1]] = h[4]; }); bkSave(s); showSheet(SHEET); };

/* ---------- levers ---------- */
var OPEX = ['taxes', 'insurance', 'utilities', 'rm', 'contract', 'payroll', 'turnover', 'marketing', 'ga', 'miscPerGSF'];
function scaleRent(s, f){ var o = { avgRent:num(s.avgRent) * f, commercialRent:num(s.commercialRent) * f };
  if(Array.isArray(s.rentRoll) && s.rentRoll.length) o.rentRoll = s.rentRoll.map(function(u){ var c = Object.assign({}, u); Object.keys(c).forEach(function(k){ if(/rent/i.test(k) && typeof c[k] === 'number') c[k] = c[k] * f; }); return c; });
  return o; }
function scaleOpex(s, f){ var o = {}; OPEX.forEach(function(k){ if(num(s[k]) > 0) o[k] = num(s[k]) * f; }); return o; }
function scaleCapex(s, f){ var o = {}; if(Array.isArray(s.capex) && s.capex.length) o.capex = s.capex.map(function(l){ return Object.assign({}, l, { amount:num(l.amount) * f }); }); if(num(s.renoCapexPerUnit) > 0) o.renoCapexPerUnit = num(s.renoCapexPerUnit) * f; return o; }
function levers(s){ var P = num(s.purchasePrice), H = num(s.holdYears), X = num(s.exitCap), L = [];
  L.push(['Purchase price', '5% lower (' + money(P * 0.95) + ')', { purchasePrice:P * 0.95 }], ['Purchase price', '10% lower (' + money(P * 0.9) + ')', { purchasePrice:P * 0.9 }]);
  L.push(['Rental income', 'rents 3% higher', scaleRent(s, 1.03)], ['Rental income', 'rents 5% higher', scaleRent(s, 1.05)]);
  L.push(['Operating expenses', 'expenses 5% lower', scaleOpex(s, 0.95)], ['Operating expenses', 'expenses 10% lower', scaleOpex(s, 0.9)]);
  var cx = scaleCapex(s, 0.8); if(Object.keys(cx).length) L.push(['Capital expenditures', 'capital spending 20% lower', cx]);
  if(H > 2) L.push(['Hold period', (H - 2) + ' years', { holdYears:H - 2 }]); L.push(['Hold period', (H + 2) + ' years', { holdYears:H + 2 }]);
  if(X > 0) L.push(['Exit assumptions', 'exit cap 0.25% lower (' + pct(X - 0.0025) + ')', { exitCap:X - 0.0025 }], ['Exit assumptions', 'exit cap 0.25% higher (' + pct(X + 0.0025) + ')', { exitCap:X + 0.0025 }]);
  return L; }
/* the level of one input that reaches the target IRR (bisection on full runs), or null when it is out of a sensible range */
function solve(mk, lo, hi, target){ var f = function(x){ var m = run(mk(x)); return m && isFinite(m.irr) && m.irr !== null ? m.irr - target : NaN; }, a = f(lo), b = f(hi); if(!isFinite(a) || !isFinite(b) || a * b > 0) return null;
  for(var i = 0; i < 40; i++){ var m = (lo + hi) / 2, v = f(m); if(!isFinite(v)) return null; if(a * v <= 0){ hi = m; b = v; } else { lo = m; a = v; } } return (lo + hi) / 2; }

/* ---------- financing alternatives ---------- */
function sofrNow(s){ var p = window.bkSofrFor ? window.bkSofrFor(s.debtIndexTenor || 'Overnight SOFR') : null; return p ? p.rate : (num(s.debtIndexRate) > 0 ? num(s.debtIndexRate) : 0.04); }
function typed(s, name, extra){ var T = (window.BK_LOAN_TYPES || {})[name]; if(!T) return null; var o = Object.assign({ loanType:name }, T.typ, extra || {}), idx = sofrNow(s);
  if(o.debtRateType === 'Floating'){ o.debtIndexRate = idx; o.debtIndexName = 'SOFR'; }
  if(o.debtRateType === 'Fixed (SOFR-based)'){ o.debtIndexRate = idx; o.acqRate = Math.max(idx + num(o.debtSpread), num(o.debtFloor)); }
  if(o.debtRateType === 'Fixed' && !('acqRate' in o)) o.acqRate = num(s.acqRate) || 0.0675;
  return o; }
function financing(s){ var idx = sofrNow(s), r0 = num(s.acqRate) || 0.0675, F = [];
  [0.55, 0.60, 0.70, 0.75].forEach(function(l){ F.push(['Leverage', pct(l, 0) + ' LTV, ' + (num(s.acqLTV) > l ? 'lower' : 'higher') + ' leverage', { acqLTV:l, acqLTC:0 }, l > 0.65 ? ['more leverage'] : []]); });
  F.push(['Fixed vs floating', 'Floating: SOFR ' + pct(idx) + ' + 2.75%', { debtRateType:'Floating', debtIndexName:'SOFR', debtIndexRate:idx, debtSpread:0.0275, debtResetMonths:1 }, ['floating rate']]);
  [0.0225, 0.0325].forEach(function(sp){ F.push(['SOFR spread', 'SOFR + ' + pct(sp), { debtRateType:'Floating', debtIndexName:'SOFR', debtIndexRate:idx, debtSpread:sp }, ['floating rate']]); });
  F.push(['Interest-only vs amortizing', 'Interest only for the term', { repayType:'Interest only' }, ['no principal paid down']]);
  F.push(['Interest-only vs amortizing', '3 years interest only, then amortizing', { repayType:'Interest only then amortizing', acqIO:3 }, []]);
  F.push(['Term', '5-year term', { debtTerm:5 }, num(s.holdYears) > 5 ? ['refinance before the sale'] : []]);
  F.push(['Term', '10-year term', { debtTerm:10 }, []]);
  [['Bank / Credit Union', 'Bank: SOFR-based fixed, 5-year, recourse', ['recourse', 'shorter term']], ['Agency', 'Agency: fixed, 10-year, non-recourse', ['yield maintenance']], ['Bridge', 'Bridge: floating, interest only, 3-year', ['floating rate', 'short term', 'refinance risk']]].forEach(function(x){ var o = typed(s, x[0]); if(o) F.push(['Lender program', x[1], o, x[2]]); });
  F.push(['Senior vs mezzanine / preferred', 'Senior + mezzanine to 75% combined LTV at 10%', { mezzCLTV:0.75, mezzRate:0.10, mezzOrigFee:0.01 }, ['mezzanine behind the senior loan']]);
  F.push(['Senior vs mezzanine / preferred', 'Preferred equity for 30% of the equity at 9% current + 3% accruing', { prefPct:0.30, prefCurrentRate:0.09, prefAccrualRate:0.03 }, ['preferred equity ahead of yours']]);
  return F; }
function exposure(m, lev){ var e = []; if(!m) return e; if(lev && m.binding && !/LTV/.test(m.binding)) e.push('sized by ' + bind(m.binding) + ', not the LTV'); if(m.preExit) e.push('loan matures in month ' + m.maturity + ', before the sale: ' + money(m.balloon) + ' to refinance'); if(m.floating) e.push('rate resets with SOFR'); if(m.loanCosts > 0.5) e.push(m.costKinds.join(' and ') + ' ' + money(m.loanCosts)); if(m.exitLtv !== null && m.exitLtv > 0.65) e.push('exit LTV ' + pct(m.exitLtv, 0)); return e; }

/* ---------- the page ---------- */
var cache = { key:'', data:null };
function compute(){ var s = bkLoad(), key = safe(function(){ var c = Object.assign({}, s); delete c._history; return JSON.stringify(c); }, String(Math.random()));   /* any change to the deal recomputes */
  if(cache.key === key && cache.data) return cache.data;
  var base = run({}), L = levers(s).map(function(x){ return { group:x[0], label:x[1], ov:x[2], m:run(x[2]) }; }), F = financing(s).map(function(x){ return { group:x[0], label:x[1], ov:x[2], risk:x[3], m:run(x[2]) }; });
  var tIrr = num(s.reverseSolveTargetIRR), solves = [], solvedPf = null;
  if(tIrr > 0){ var P = num(s.purchasePrice), X = num(s.exitCap);
    var sp = solve(function(x){ return { purchasePrice:x }; }, P * 0.5, P * 1.3, tIrr); if(sp !== null && sp < P && sp > P * 0.8) solvedPf = Math.floor(sp / P * 1000) / 1000; solves.push(['Purchase price', sp === null ? 'not within 50% to 130% of the price' : money(sp) + ' (' + pct(sp / P - 1, 1) + ')']);
    var sr = solve(function(x){ return scaleRent(s, x); }, 0.7, 1.5, tIrr); solves.push(['Rental income', sr === null ? 'not within -30% to +50% of rents' : 'rents ' + pct(sr - 1, 1) + (sr >= 1 ? ' higher' : ' lower')]);
    if(X > 0){ var sx = solve(function(x){ return { exitCap:x }; }, Math.max(0.02, X - 0.03), X + 0.03, tIrr); solves.push(['Exit cap rate', sx === null ? 'not within 3% of the current exit cap' : pct(sx) + ' (' + (sx < X ? '' : '+') + Math.round((sx - X) * 10000) + ' bps)']); } }
  /* 05: price concessions crossed with every financing alternative (and the deal's own financing) */
  var prices = [1, 0.95, 0.9], combos = [], P0 = num(s.purchasePrice); if(solvedPf && prices.indexOf(solvedPf) < 0) prices.push(solvedPf);   /* the exact price that reaches the IRR target with the current financing */
  prices.forEach(function(pf){ [{ group:'Current financing', label:'Current financing', ov:{}, risk:[] }].concat(F).forEach(function(f){ var ov = Object.assign({}, f.ov); if(pf < 1) ov.purchasePrice = P0 * pf; var m = (pf === 1 && f.m) ? f.m : (pf === 1 ? base : run(ov));
      if(!m) return; var risk = (f.risk || []).length + (pf < 1 ? (1 - pf) * 20 : 0); combos.push({ pf:pf, f:f, m:m, ov:ov, ok:meetsAll(s, m), score:risk + (m.irr ? -m.irr : 0) }); }); });
  var winners = combos.filter(function(c){ return c.ok; }).sort(function(a, b){ return a.score - b.score || (a.f.group === 'Current financing' ? -1 : b.f.group === 'Current financing' ? 1 : 0); });
  /* the same result from a different label (a 10-year term on a 5-year hold changes nothing) is shown once, as its simplest structure */
  var seen = {}; winners = winners.filter(function(c){ var k = [c.pf, Math.round(c.m.irr * 1e5), Math.round(c.m.em * 1e3), Math.round(c.m.dscr * 1e3), Math.round(c.m.proceeds)].join('|'); if(seen[k]) return false; seen[k] = 1; return true; });
  cache = { key:key, data:{ s:s, base:base, L:L, F:F, solves:solves, combos:combos, winners:winners } }; return cache.data; }
window.bkOptApply = function(i){ var D = cache.data; if(!D) return; var c = D.winners[i]; if(!c) return; var s = bkLoad(); Object.keys(c.ov).forEach(function(k){ s[k] = c.ov[k]; });
  if(typeof window.bkHistorySaveVersion === 'function') safe(function(){ window.bkHistorySaveVersion('Before applying a Deal Optimizer recommendation', true); });
  bkSave(s); cache.key = ''; showSheet(SHEET); };

function cap(t, letter){ return '<caption>' + t + '</caption>'; }
function th(cols){ return '<thead><tr>' + cols.map(function(c, i){ return '<th' + (i ? ' class="v"' : ' class="rowlabel-h"') + '>' + c + '</th>'; }).join('') + '</tr></thead>'; }
function chip(ok, yes, no){ return '<span class="status-chip ' + (ok ? 'pass' : 'fail') + '">' + (ok ? yes || 'MEETS' : no || 'BELOW') + '</span>'; }
function delta(v, b, f){ if(!isFinite(v) || !isFinite(b) || v === null || b === null) return ''; var d = v - b; if(Math.abs(d) < 1e-9) return ''; return ' <span class="bk-opt-d ' + (d > 0 ? 'up' : 'dn') + '">' + (d > 0 ? '+' : '') + (f === 'pct' ? (d * 100).toFixed(2) + ' pts' : f === 'x' ? d.toFixed(2) + 'x' : money(d)) + '</span>'; }
function render(){
  var s = bkLoad() || {}, o = { title:SHEET, crumbs:'Returns', desc:'Find the combination of price, operations and financing that meets your investment hurdles.', meta:{ Property:s.name || '' }, sidebar:'' };
  if(dev(s)){ o.main = '<div class="note-flag"><span>i</span><div>The Deal Optimizer works on acquisitions. For a development, use Residual Land and the Development pages.</div></div>'; return o; }
  if(!(num(s.purchasePrice) > 0)){ o.main = '<div class="note-flag"><span>i</span><div>Enter the purchase price and the income first: the optimizer starts from the baseline deal.</div></div>'; return o; }
  var D = compute(), b = D.base || {}, H = hurdlesOf(s), html = '';
  /* 01 */
  html += '<div class="tbl-wrap"><table class="fin bk-opt">' + cap('Baseline deal') + th(['Measure', 'Baseline']) + '<tbody>'
    + [['Purchase price', money(b.price)], ['Net operating income, year 1', money(b.noi)], ['Going-in cap rate', b.price ? pct(b.noi / b.price) : '-'], ['Financing', esc((s.loanType ? s.loanType + ', ' : '') + (window.bkRateType ? bkRateType(s) : 'Fixed') + ' ' + pct(b.coupon) + ', ' + money(b.loan) + ' (' + (b.price ? pct(b.loan / b.price, 1) : '-') + ' of price), sized by ' + bind(b.binding))],
      ['Equity at closing', money(b.eq)], ['Levered IRR', pct(b.irr)], ['Equity multiple', mx(b.em)], ['Year-1 cash-on-cash', pct(b.coc)], ['Lender DSCR, year 1', mx(b.dscr)]].map(function(r){ return '<tr><td class="rowlabel">' + r[0] + '</td><td class="v">' + r[1] + '</td></tr>'; }).join('') + '</tbody></table></div>';
  /* 02 */
  var hr = HURDLES.map(function(h){ var set = num(s[h[1]]) > 0, cur = h[0] === 'npv' ? b.npv : b[h[0]];
    return bkInput(h[2] + (h[0] === 'npv' ? ' (discount rate)' : ' target'), h[1], h[3] === 'x' ? 'x' : '%', h[3] === 'x' ? 'num' : 'pct').replace(/<td data-bk-align="text">(<span class="status-chip[^<]*<\/span>)<\/td><\/tr>$/, '<td data-bk-align="text">' + (set ? (meets(h, b) ? chip(true) : chip(false)) + ' <span class="bk-opt-gap">' + (h[0] === 'npv' ? 'NPV ' + money(b.npv) : 'now ' + (h[3] === 'x' ? mx(cur) : pct(cur))) + '</span>' : '<span class="status-chip">NOT SET</span>') + '</td></tr>'); }).join('');
  html += '<div class="tbl-wrap" style="margin-top:16px"><table class="fin bk-input-grid">' + cap('Investment hurdles') + '<thead><tr><th class="rowlabel-h">Hurdle</th><th>Target</th><th style="text-align:left">Units</th><th>Baseline</th></tr></thead><tbody>' + hr + '</tbody></table></div>'
    + '<div class="bk-ds-note">' + (H.length ? (meetsAll(s, b) ? '<b>The baseline meets every hurdle.</b> The scenarios below show where there is room to spare.' : '<b>The baseline falls short on ' + esc(shortOf(s, b).join(', ')) + '.</b> The levers and financing below show what closes the gap.') : 'Set at least one hurdle to see which scenarios meet it.') + ' <button type="button" class="bk-btn" onclick="bkOptHurdlesFill()">' + (H.length ? 'Fill the blank hurdles with typical targets' : 'Use typical targets (15% IRR, 1.8x, 6% cash-on-cash, 1.25x lender DSCR, NPV at 12%)') + '</button></div>';
  /* 03 */
  var lr = D.L.map(function(x){ var m = x.m || {}; return '<tr><td class="rowlabel">' + esc(x.group) + ': ' + esc(x.label) + '</td><td class="v">' + pct(m.irr) + delta(m.irr, b.irr, 'pct') + '</td><td class="v">' + mx(m.em) + '</td><td class="v">' + pct(m.coc) + '</td><td class="v">' + mx(m.dscr) + '</td><td>' + (H.length ? chip(meetsAll(s, m), 'MEETS ALL', shortOf(s, m).length + ' SHORT') : '') + '</td></tr>'; }).join('');
  html += '<div class="tbl-wrap" style="margin-top:16px"><table class="fin bk-opt">' + cap('Deal levers, one at a time') + th(['Lever', 'Levered IRR', 'Multiple', 'Cash-on-cash', 'Lender DSCR', 'Hurdles']) + '<tbody>' + lr + '</tbody></table></div>'
    + (D.solves.length ? '<div class="bk-ds-note"><b>To reach the ' + pct(num(s.reverseSolveTargetIRR)) + ' IRR target on its own:</b> ' + D.solves.map(function(x){ return esc(x[0]) + ' ' + esc(x[1]); }).join(' · ') + '. Each holds everything else as entered.</div>' : '');
  /* 04 */
  var fr = D.F.map(function(x){ var m = x.m || {}; var ex = exposure(m, x.group === 'Leverage'); return '<tr><td class="rowlabel">' + esc(x.group) + ': ' + esc(x.label) + '</td><td class="v">' + money(m.proceeds) + '</td><td class="v">' + money(m.ds1) + '</td><td class="v">' + money(m.y1cf) + '</td><td class="v">' + mx(m.dscr) + '</td><td class="v">' + pct(m.irr) + delta(m.irr, b.irr, 'pct') + '</td><td class="v">' + mx(m.em) + '</td><td>' + esc(ex.join('; ') || '-') + '</td></tr>'; }).join('');
  html += '<div class="tbl-wrap" style="margin-top:16px"><table class="fin bk-opt">' + cap('Financing alternatives') + th(['Structure', 'Proceeds', 'Debt service, yr 1', 'Cash flow, yr 1', 'Lender DSCR', 'Levered IRR', 'Multiple', 'Refinancing and rate exposure']) + '<tbody>'
    + '<tr class="grandtotal"><td class="rowlabel">Baseline: current financing</td><td class="v">' + money(b.proceeds) + '</td><td class="v">' + money(b.ds1) + '</td><td class="v">' + money(b.y1cf) + '</td><td class="v">' + mx(b.dscr) + '</td><td class="v">' + pct(b.irr) + '</td><td class="v">' + mx(b.em) + '</td><td>' + esc(exposure(b).join('; ') || '-') + '</td></tr>' + fr + '</tbody></table></div>'
    + '<div class="bk-ds-note">Floating structures use the latest SOFR on record (' + pct(sofrNow(s)) + ') held flat: a rising rate outlook lowers their returns. Each loan is sized by the same tests as the deal\'s own (LTV, cost, lender DSCR, debt yield).</div>';
  /* 05 */
  var W = D.winners.slice(0, 6), rows = '<tr class="grandtotal"><td class="rowlabel">Baseline</td><td>' + esc((s.loanType || 'Current') + ', ' + pct(num(s.acqLTV), 0) + ' LTV, ' + ((window.bkRateType ? bkRateType(s) : 'Fixed')).toLowerCase()) + '</td><td>' + (H.length ? chip(meetsAll(s, b), 'MEETS HURDLES', 'BELOW TARGET') : '-') + '</td><td>' + pct(b.irr) + ' IRR · ' + mx(b.em) + '</td><td>-</td><td>-</td><td></td></tr>';
  rows += W.map(function(c, i){ var L2 = String.fromCharCode(65 + i), req = (c.pf < 1 ? 'buy at ' + money(num(s.purchasePrice) * c.pf) + ' (' + pct(c.pf - 1, 1) + ')' : 'no price change') + (c.f.group !== 'Current financing' ? '; ' + c.f.label.charAt(0).toLowerCase() + c.f.label.slice(1) : '');
    var trade = (c.f.risk || []).concat(c.pf < 1 ? ['the seller must accept ' + pct(1 - c.pf, 1) + ' less'] : []).concat(exposure(c.m));
    return '<tr><td class="rowlabel">' + L2 + '</td><td>' + esc((c.pf < 1 ? 'Price ' + pct(c.pf - 1, 1) + ' + ' : '') + c.f.label) + '</td><td>' + chip(true, 'MEETS HURDLES') + '</td><td>' + pct(c.m.irr) + ' IRR · ' + mx(c.m.em) + ' · ' + pct(c.m.coc) + ' CoC · ' + mx(c.m.dscr) + ' lender DSCR</td><td>' + esc(req) + '</td><td>' + esc(trade.join('; ') || 'none beyond the baseline') + '</td><td><button type="button" class="bk-btn" onclick="bkOptApply(' + i + ')">Apply</button></td></tr>'; }).join('');
  var none = H.length && !W.length ? '<div class="bk-ds-note"><b>No combination tested meets every hurdle.</b> The closest are a ' + pct(0.10, 0) + ' lower price with ' + esc((D.combos.filter(function(c){ return c.pf === 0.9; }).sort(function(a, b2){ return shortOf(s, a.m).length - shortOf(s, b2.m).length || (b2.m.irr - a.m.irr); })[0] || { f:{ label:'-' } }).f.label.toLowerCase()) + '. Revisit the hurdles or the operating plan (rent and expense levers above).</div>' : '';
  html += '<div class="tbl-wrap" style="margin-top:16px"><table class="fin bk-opt bk-m-cards">' + cap('Recommendations: combinations that meet the hurdles') + th(['Scenario', 'Financing strategy', 'Result', 'Returns', 'What it requires', 'Tradeoffs', '']) + '<tbody>' + rows + '</tbody></table></div>' + none
    + '<div class="bk-ds-note">Ranked by the least price concession and the fewest added risks. "Apply" writes that price and financing to the deal (a version is saved first, so it can be undone from Version History). Every figure is a full run of the underwriting engine.</div>';
  o.main = html; return o;
}
RENDERERS[SHEET] = render;
if(typeof window.bkRegisterRenderer === 'function') try { window.bkRegisterRenderer(SHEET, render); } catch(e){}
var css = '.bk-opt-d{font-size:11px;font-weight:600;margin-left:4px}.bk-opt-d.up{color:var(--bk-link-ink,#1f6b45)}.bk-opt-d.dn{color:var(--bk-tier-fail-ink,#A32F24)}.bk-opt-gap{font-size:11.5px;color:var(--ae-dim,#56616c);margin-left:4px}';
var st = document.createElement('style'); st.id = 'bk-optimizer-css'; st.textContent = css; document.head.appendChild(st);
})();
