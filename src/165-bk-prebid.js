/* ===========================================================================
   PRE-OFFER BID - the maximum purchase price the active acquisition can support under the user's investment constraints.
   The price is SEARCHED, never estimated: at every candidate price the underwriting engine is re-run on a scratch copy of the deal (bkRunWith with
   purchasePrice), so closing costs, debt sizing, fees, equity, debt service, cash flows, exit proceeds and the investor waterfall all move with the
   price. This layer only chooses prices and reads the engine's results. It reports the binding constraint, verifies the answer by re-running the
   engine just below and just above it, says so when no price is feasible or the price is not bounded, and refuses a precise answer when feasibility
   is not monotone in price (a discontinuity from loan sizing or the waterfall).
   =========================================================================== */
(function(){
'use strict';
if(typeof bkLoad !== 'function' || typeof bkSave !== 'function' || typeof bkMonthlyReturns !== 'function' || typeof window.bkRunWith !== 'function' || typeof RENDERERS === 'undefined') return;
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function num(x){ var v = Number(x); return isFinite(v) ? v : NaN; }
function M(v){ return v == null || !isFinite(v) ? '—' : (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US'); }
function P(v){ return v == null || !isFinite(v) ? '—' : (v * 100).toFixed(2) + '%'; }
function X(v){ return v == null || !isFinite(v) ? '—' : v.toFixed(2) + 'x'; }
function isDev(s){ return /develop/i.test(String(s.dealType || '')); }
function active(){ return typeof window.bkHasActiveDeal !== 'function' || window.bkHasActiveDeal(); }

/* the constraints a bid can be solved against: [id, label, metric, direction, policy key or null, unit, on by default] */
var CONS = [
  ['irr',      'Minimum levered IRR (property)',        'irr',       '>=', 'targetIRR',   'pct', true],
  ['em',       'Minimum equity multiple (property)',    'moic',      '>=', 'targetEM',    'x',   true],
  ['lpIrr',    'Minimum LP IRR (after the waterfall)',  'lpIrr',     '>=', 'targetLpIRR', 'pct', false],
  ['dscr',     'Minimum DSCR, base',                    'dscr',      '>=', 'minDSCR',     'x',   true],
  ['dscrS',    'Minimum DSCR, stressed',                'dscrS',     '>=', null,          'x',   false],
  ['dy',       'Minimum debt yield',                    'dy',        '>=', 'minDebtYield','pct', true],
  ['ltv',      'Maximum loan-to-value',                 'ltv',       '<=', 'maxLTV',      'pct', true],
  ['ltc',      'Maximum loan-to-cost',                  'ltc',       '<=', 'maxLTC',      'pct', true],
  ['maxEq',    'Maximum equity at closing ($)',         'equity',    '<=', null,          'usd', false],
  ['dIrr',     'Minimum levered IRR, downside case',    'irrDown',   '>=', null,          'pct', false]
];
var STRESS_DEFAULT = 0.10, DEFAULTS = { dscrS:1.0, maxEq:null, dIrr:0.0 };
var SEARCH_LO = 0.25, SEARCH_HI = 1.5, GRID = 33;

/* ------------------------------------------------------------------ state, on the deal like the credit policy */
function raw(s){ return (s && s._bid) || {}; }
function conCfg(s){
  var r = raw(s), pol = safe(function(){ return window.bkPolicy(); }, {}) || {}, on = r.on || {}, vals = r.val || {};
  return CONS.map(function(c){
    var v = vals[c[0]]; v = (v !== undefined && v !== '' && isFinite(Number(v))) ? Number(v) : (c[4] && isFinite(Number(pol[c[4]])) ? Number(pol[c[4]]) : DEFAULTS[c[0]]);
    return { id:c[0], label:c[1], metric:c[2], dir:c[3], unit:c[5], value:v, on:on[c[0]] !== undefined ? !!on[c[0]] : c[6] && v != null && isFinite(v), custom:vals[c[0]] !== undefined && vals[c[0]] !== '' };
  });
}
function noiStress(s){ var v = num(raw(s).noiStress); return isFinite(v) ? v : STRESS_DEFAULT; }
function offerOf(s){ var v = num(raw(s).offer); return isFinite(v) && v > 0 ? v : null; }
function commit(mut){ var s = bkLoad(); if(!s) return; s._bid = s._bid || {}; s._bid.on = s._bid.on || {}; s._bid.val = s._bid.val || {}; mut(s._bid); bkSave(s); setTimeout(function(){ if(typeof showSheet === 'function') showSheet('Pre-Offer Bid'); }, 0); }
window.bkBidOn = function(id, on){ commit(function(b){ b.on[id] = !!on; }); };
window.bkBidVal = function(id, v){ commit(function(b){ var c = CONS.filter(function(q){ return q[0] === id; })[0], n = num(v); if(!c) return; if(v === '' || !isFinite(n)){ delete b.val[id]; return; } b.val[id] = c[5] === 'pct' ? n / 100 : n; if(b.on[id] === undefined) b.on[id] = true; }); };
window.bkBidOffer = function(v){ commit(function(b){ var n = num(String(v).replace(/[$,]/g, '')); if(isFinite(n) && n > 0) b.offer = n; else delete b.offer; }); };
window.bkBidStress = function(v){ commit(function(b){ var n = num(v); if(isFinite(n) && n >= 0 && n < 100) b.noiStress = n / 100; }); };
window.bkBidReset = function(){ var s = bkLoad(); if(!s) return; delete s._bid; bkSave(s); setTimeout(function(){ if(typeof showSheet === 'function') showSheet('Pre-Offer Bid'); }, 0); };

/* ------------------------------------------------------------------ everything at one price: the engine's own outputs */
function runAt(price, ov){
  return window.bkRunWith(Object.assign({ purchasePrice:price }, ov || {}), function(){
    var s = bkLoad(), m = bkMonthlyReturns(), d = m.d, w = safe(function(){ return window.bkWaterfallV07(); }, null);
    var annDS = num(d.pmtAmortizing) * 12, noi = num(d.dscrNoi);
    return { price:price, irr:m.irr, moic:m.moic, profit:m.dist - m.contrib, lpIrr:w ? num(w.lpIRR) : NaN, equity:num(d.equity) + (num(s.rateCapCost) || 0), loan:num(d.loan), ltv:num(d.ltv), ltc:num(d.ltc), binding:d.binding, fee:num(d.fee),
      dscr:num(d.dscrAmortizing), dscrNoi:noi, annDS:annDS, dy:num(d.loan) > 0 ? noi / num(d.loan) : NaN, debtEnabled:d.debtEnabled !== false, units:num(s.units), gsf:num(s.gsf), closingEq:num(d.equity) };
  });
}
function atCase(price, caseName){
  var base = bkLoad(), ov = (typeof window.bkScenarioOverrides === 'function') ? window.bkScenarioOverrides(base, caseName) : {};
  return runAt(price, ov);
}
function withDerived(r, stress){ if(!r) return r; r.dscrS = r.annDS > 0 ? r.dscrNoi * (1 - stress) / r.annDS : NaN; return r; }
function full(price, stress, needDown){ var r = withDerived(runAt(price), stress); if(r && needDown){ var d = safe(function(){ return atCase(price, 'Downside'); }, null); r.irrDown = d ? d.irr : NaN; r.downside = d; } return r; }
function ok(c, r){ var v = r[c.metric]; if(v == null || !isFinite(v)) return null; var tol = 1e-9 * Math.max(1, Math.abs(c.value)); return c.dir === '>=' ? v >= c.value - tol : v <= c.value + tol; }
function allOk(cons, r){ var bad = []; for(var i = 0; i < cons.length; i++){ var o = ok(cons[i], r); if(o === null) return { ok:null, bad:[cons[i].id] }; if(!o) bad.push(cons[i].id); } return { ok:bad.length === 0, bad:bad }; }

/* bisection on a boolean that is true at lo and false at hi (the caller has bracketed it), to a price tolerance */
function bisect(feas, lo, hi, tol){ var it = 0; while(hi - lo > tol && it < 60){ var mid = (lo + hi) / 2; if(feas(mid)) lo = mid; else hi = mid; it++; } return { lo:lo, hi:hi, it:it }; }

/* the maximum supportable price for a set of constraints; grid scan to find where feasibility ends, then bisection */
function solve(cons, stress, asking, tol){
  var needDown = cons.some(function(c){ return c.metric === 'irrDown'; }), lo = asking * SEARCH_LO, hi = asking * SEARCH_HI, pts = [], cache = {};
  var at = function(p){ var k = Math.round(p * 100); if(!cache[k]) cache[k] = full(p, stress, needDown); return cache[k]; };
  for(var i = 0; i < GRID; i++){ var p = lo + (hi - lo) * i / (GRID - 1), r = at(p); pts.push({ p:p, r:r, f:r ? allOk(cons, r) : { ok:null, bad:[] } }); }
  var out = { cons:cons, lo:lo, hi:hi, grid:pts.map(function(z){ return { p:z.p, ok:z.f.ok, bad:z.f.bad }; }), status:null, max:null, runs:0 };
  if(pts.some(function(z){ return z.f.ok === null; })){ out.status = 'unreliable'; out.why = 'The engine returned no value for a constrained metric at some prices in the search range (for example the loan is switched off or the waterfall could not run).'; return out; }
  var feasIdx = pts.map(function(z, i){ return z.f.ok ? i : -1; }).filter(function(i){ return i >= 0; });
  if(!feasIdx.length){ out.status = 'infeasible'; out.why = 'No price from ' + M(lo) + ' to ' + M(hi) + ' satisfies every active constraint.'; out.bindingAtLow = pts[0].f.bad; return out; }
  var first = feasIdx[0], k = first; while(k + 1 < pts.length && pts[k + 1].f.ok) k++;
  out.monotone = feasIdx.length === (k - first + 1);   /* feasible prices form one unbroken run */
  out.lowestFeasibleGrid = pts[first].p;
  if(k === pts.length - 1){ out.status = 'unbounded'; out.max = hi; out.why = 'Every price up to ' + M(hi) + ' (' + Math.round(SEARCH_HI * 100) + '% of asking) satisfies the active constraints; the search stops there.'; return out; }
  var feas = function(p){ var r = at(p); return r ? allOk(cons, r).ok === true : false; };
  var b = bisect(feas, pts[k].p, pts[k + 1].p, tol); out.max = b.lo; out.status = out.monotone ? 'solved' : 'not-monotone';
  if(!out.monotone) out.why = 'Feasibility is not a single range of prices (it switches on and off as the price moves, from loan sizing or the waterfall), so the figure shown is the top of the first feasible range, not a proven global maximum.';
  return out;
}

/* the whole analysis for the active deal */
window.bkBidSolve = function(){
  var s = safe(function(){ return bkLoad(); }, null); if(!s || isDev(s)) return null;
  var asking = num(s.purchasePrice); if(!(asking > 0)) return { error:'The deal has no purchase price to search around.' };
  var cons = conCfg(s), act = cons.filter(function(c){ return c.on && c.value != null && isFinite(c.value); }), stress = noiStress(s), tol = Math.max(1, asking * 1e-5);
  var base = safe(function(){ return runAt(asking); }, null); if(!base || !base.debtEnabled) return { error:base ? 'Debt is switched off on this deal, so the debt constraints cannot be solved.' : 'The engine could not run this deal.' };
  if(!act.length) return { error:'No constraint is active.', cons:cons };
  var all = solve(act, stress, asking, tol), per = act.map(function(c){ var r = solve([c], stress, asking, tol); return { id:c.id, label:c.label, status:r.status, max:r.max, why:r.why }; });
  var needDown = act.some(function(c){ return c.metric === 'irrDown'; }), res = { s:s, asking:asking, cons:cons, active:act, stress:stress, all:all, per:per, tol:tol };
  /* verification: the engine just below and just above the answer */
  if(all.max != null && (all.status === 'solved' || all.status === 'not-monotone')){
    var step = Math.max(1, asking * 1e-4);
    res.below = full(all.max - step, stress, needDown); res.above = full(all.max + step, stress, needDown);
    res.belowOk = res.below && allOk(act, res.below).ok === true; var ab = res.above ? allOk(act, res.above) : { ok:null, bad:[] }; res.aboveViolates = ab.ok === false; res.aboveBad = ab.bad; res.step = step;
    /* the binding constraint: the one whose own limit is the lowest, confirmed by what the engine violates just above the answer */
    res.binding = ab.bad.slice();
  }
  /* the three scenarios: asking, the maximum supportable bid, the user's offer; every one a fresh engine run, with its downside case */
  var offer = offerOf(s), scen = [{ key:'ask', label:'At the asking price', price:asking }];
  if(all.max != null) scen.push({ key:'max', label:'At the maximum supportable bid', price:all.max });
  if(offer) scen.push({ key:'offer', label:'At your proposed offer', price:offer });
  res.scen = scen.map(function(z){ var r = full(z.price, stress, true); return Object.assign(z, { r:r, pass:r ? allOk(act, r) : { ok:null, bad:[] } }); });
  return res;
};

/* ------------------------------------------------------------------ the sheet */
function box(h){ return '<div class="bk-box">' + h + '</div>'; }
function fmtC(c, v){ return c.unit === 'pct' ? P(v, 2) : c.unit === 'x' ? X(v) : M(v); }
function render(){
  var s = safe(function(){ return bkLoad(); }, null), hdr = { title:'Pre-Offer Bid', crumbs:'Returns & Equity', desc:'The highest price this deal can support under your constraints, found by re-running the underwriting engine at each candidate price.', sidebar:'', meta:{ Property:s && s.name } };
  if(!s || isDev(s)){ hdr.main = box('Pre-Offer Bid covers acquisition deals. A development deal\'s land value is solved on the Residual Land sheet.'); return hdr; }
  var R = window.bkBidSolve(); if(!R || R.error){ hdr.main = box(esc(R && R.error || 'Could not run.')); return hdr; }
  var T = 'width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums', cell = 'padding:6px 8px;border-bottom:1px solid var(--line,#e5ecf2)';
  var rowsC = R.cons.map(function(c){ var shown = c.value == null ? '' : (c.unit === 'pct' ? +(c.value * 100).toFixed(4) : c.value);
    return '<tr><td style="' + cell + '"><label><input type="checkbox"' + (c.on ? ' checked' : '') + ' onchange="bkBidOn(\'' + c.id + '\',this.checked)"> ' + esc(c.label) + '</label></td><td style="' + cell + ';text-align:right"><input type="number" step="any" value="' + shown + '" onchange="bkBidVal(\'' + c.id + '\',this.value)" style="width:110px;text-align:right;padding:5px;border:1px solid var(--line,#dbe4ec);border-radius:5px' + (c.custom ? ';background:#fff7e0' : '') + '"> <span style="font-size:11px;opacity:.7">' + (c.unit === 'pct' ? '%' : c.unit === 'x' ? 'x' : '$') + '</span></td><td style="' + cell + ';font-size:12px;opacity:.75">' + (c.custom ? 'your value' : (c.id === 'dscrS' || c.id === 'maxEq' || c.id === 'dIrr') ? 'enter a value to activate' : 'credit policy') + '</td></tr>'; }).join('');
  var main = box('<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;align-items:flex-end"><b>Active constraints</b><span><label style="font-size:12px">Stressed DSCR: NOI decline % <input type="number" step="1" value="' + (R.stress * 100) + '" onchange="bkBidStress(this.value)" style="width:70px;text-align:right;padding:5px;border:1px solid var(--line,#dbe4ec);border-radius:5px"></label> <button type="button" class="pl-hbtn" onclick="bkBidReset()">Reset</button></span></div>'
    + '<div style="overflow-x:auto;margin-top:8px"><table class="bk-stk" style="' + T + ';min-width:520px"><tbody>' + rowsC + '</tbody></table></div><div style="font-size:12px;opacity:.8;margin-top:6px">Targets start from the credit policy (Credit &amp; IC). Nothing here changes the deal.</div>');
  /* the answer */
  var A = R.all, headline;
  if(A.status === 'solved' || A.status === 'not-monotone'){
    var gap = R.asking - A.max;
    headline = '<div style="font-size:13px;opacity:.8">Maximum supportable bid</div><div style="font-size:30px;font-weight:700;letter-spacing:-.01em">' + M(A.max) + '</div><div style="font-size:14px;margin-top:4px">' + (gap > 0 ? '<b>' + M(gap) + '</b> (' + P(gap / R.asking, 1) + ') below the asking price of ' + M(R.asking) : '<b>' + M(-gap) + '</b> (' + P(-gap / R.asking, 1) + ') above the asking price of ' + M(R.asking)) + '</div>';
    var bn = (R.binding || []).map(function(id){ return R.cons.filter(function(c){ return c.id === id; })[0]; }).filter(Boolean);
    headline += '<div style="margin-top:8px;font-size:14px"><b>Binding constraint' + (bn.length > 1 ? 's' : '') + ':</b> ' + (bn.length ? bn.map(function(c){ return esc(c.label) + ' (' + (c.dir === '>=' ? '≥ ' : '≤ ') + fmtC(c, c.value) + ')'; }).join('; ') : 'not identified') + '</div>';
    if(A.status === 'not-monotone') headline += '<div style="margin-top:8px;color:#b42318;font-size:13px"><b>Not a proven maximum.</b> ' + esc(A.why) + '</div>';
    headline += '<div style="margin-top:8px;font-size:13px">' + (R.belowOk && R.aboveViolates ? '<span style="color:#1a7f37;font-weight:700">Verified:</span> the engine satisfies every constraint at ' + M(A.max - R.step) + ' and violates ' + (R.aboveBad || []).map(function(id){ var c = R.cons.filter(function(q){ return q.id === id; })[0]; return esc(c ? c.label : id); }).join(' and ') + ' at ' + M(A.max + R.step) + '.' : '<span style="color:#b42318;font-weight:700">Verification did not hold</span> (below passes: ' + !!R.belowOk + '; above violates: ' + !!R.aboveViolates + '). Do not rely on this figure.') + '</div>';
  } else if(A.status === 'infeasible'){
    headline = '<div style="font-size:18px;font-weight:700;color:#b42318">No feasible bid</div><div style="margin-top:6px;font-size:14px">' + esc(A.why) + (A.bindingAtLow && A.bindingAtLow.length ? ' At the lowest price searched, the constraint(s) failing are: ' + A.bindingAtLow.map(function(id){ var c = R.cons.filter(function(q){ return q.id === id; })[0]; return esc(c ? c.label : id); }).join('; ') + '.' : '') + ' Relax a constraint or change the deal\'s assumptions.</div>';
  } else if(A.status === 'unbounded'){
    headline = '<div style="font-size:18px;font-weight:700">Not bounded by these constraints</div><div style="margin-top:6px;font-size:14px">' + esc(A.why) + ' Add a constraint that limits price (a return, an equity cap).</div>';
  } else headline = '<div style="font-size:18px;font-weight:700;color:#b42318">Not reliable for this deal</div><div style="margin-top:6px;font-size:14px">' + esc(A.why) + '</div>';
  main = box(headline) + main;
  /* each constraint on its own */
  main += box('<b>Each constraint on its own</b><div style="font-size:12.5px;opacity:.8;margin:4px 0 8px">The price at which that constraint alone stops being met. The lowest is the binding one.</div><table class="bk-stk" style="' + T + '"><tbody>' + R.per.map(function(q){ var c = R.cons.filter(function(z){ return z.id === q.id; })[0];
    var t = q.status === 'solved' || q.status === 'not-monotone' ? M(q.max) : q.status === 'unbounded' ? 'does not limit the price in the range' : q.status === 'infeasible' ? 'not met at any price in the range' : 'not reliable';
    return '<tr><td style="' + cell + '">' + esc(q.label) + ' <span style="opacity:.6">(' + (c.dir === '>=' ? '≥ ' : '≤ ') + fmtC(c, c.value) + ')</span></td><td style="' + cell + ';text-align:right;font-weight:' + (A.max != null && q.max != null && Math.abs(q.max - A.max) <= R.tol * 3 ? '700' : '400') + '">' + t + '</td></tr>'; }).join('') + '</tbody></table>');
  /* scenarios */
  var cols = R.scen, hs = '<tr><th style="' + cell + ';text-align:left"></th>' + cols.map(function(z){ return '<th style="' + cell + ';text-align:right">' + esc(z.label) + '</th>'; }).join('') + '</tr>';
  var sr = function(l, f, b){ return '<tr><td style="' + cell + '">' + l + '</td>' + cols.map(function(z){ return '<td style="' + cell + ';text-align:right">' + (z.r ? f(z.r, z) : '—') + '</td>'; }).join('') + '</tr>'; };
  var srows = sr('Price', function(r){ return '<b>' + M(r.price) + '</b>'; }) + sr('Price per unit', function(r){ return r.units > 0 ? M(r.price / r.units) : '—'; }) + sr('Price per SF', function(r){ return r.gsf > 0 ? '$' + (r.price / r.gsf).toFixed(0) : '—'; })
    + sr('Required equity at closing', function(r){ return M(r.equity); }) + sr('Loan', function(r){ return M(r.loan) + ' <span style="opacity:.6">(' + esc(r.binding) + ')</span>'; }) + sr('LTV / LTC', function(r){ return P(r.ltv, 1) + ' / ' + P(r.ltc, 1); })
    + sr('DSCR, base / stressed', function(r){ return X(r.dscr) + ' / ' + X(r.dscrS); }) + sr('Debt yield', function(r){ return P(r.dy, 2); })
    + sr('Levered IRR', function(r){ return '<b>' + P(r.irr, 2) + '</b>'; }) + sr('LP IRR', function(r){ return P(r.lpIrr, 2); }) + sr('Equity multiple', function(r){ return X(r.moic); }) + sr('Profit', function(r){ return M(r.profit); })
    + sr('Levered IRR, downside case', function(r){ return P(r.irrDown, 2); }) + sr('Downside case: equity multiple', function(r){ return r.downside ? X(r.downside.moic) : '—'; })
    + sr('Active constraints', function(r, z){ return z.pass.ok === true ? '<span style="color:#1a7f37;font-weight:700">All met</span>' : z.pass.ok === false ? '<span style="color:#b42318;font-weight:700">Fails: ' + z.pass.bad.map(function(id){ var c = R.cons.filter(function(q){ return q.id === id; })[0]; return esc(c ? c.label.replace(/^(Minimum|Maximum) /, '') : id); }).join(', ') + '</span>' : '—'; });
  main += box('<div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:10px"><b>Offer-price scenarios</b><label style="font-size:12px">Your proposed offer <input type="text" value="' + (offerOf(s) ? Math.round(offerOf(s)).toLocaleString('en-US') : '') + '" placeholder="e.g. 22,500,000" onchange="bkBidOffer(this.value)" style="width:150px;text-align:right;padding:6px;border:1px solid var(--line,#dbe4ec);border-radius:5px"></label></div><div style="overflow-x:auto;margin-top:8px"><table class="bk-stk" style="' + T + ';min-width:520px"><thead>' + hs + '</thead><tbody>' + srows + '</tbody></table></div><div style="font-size:12px;opacity:.8;margin-top:6px">Every column is a fresh engine run at that price; assumptions, financing and the case selected on the deal are the deal\'s own.</div>');
  main += box('<b>Basis and limits</b><ul style="margin:8px 0 0 18px;line-height:1.6;font-size:13px"><li>The price is searched over ' + M(R.all.lo) + ' to ' + M(R.all.hi) + ' (' + Math.round(SEARCH_LO * 100) + '% to ' + Math.round(SEARCH_HI * 100) + '% of asking), first on a ' + GRID + '-price grid to find where feasibility ends, then by bisection to ' + M(R.tol) + '. The engine re-sizes the loan, fees, equity and the waterfall at every price.</li><li>Stressed DSCR applies the NOI decline above to the engine\'s DSCR income and amortising debt service; it does not re-run a floating index (use Financing Compare for that).</li><li>The downside case is the deal\'s own downside scenario inputs.</li><li>A constraint that loan sizing already enforces (for example minimum DSCR when DSCR sizes the loan) does not move with price and will not limit the bid.</li><li>The loan terms, exit cap and operating assumptions are held at the deal\'s values; changing them changes the answer.</li></ul>');
  hdr.main = main; hdr.meta = { Property:s.name, Asking:M(R.asking), 'Max bid':A.max != null ? M(A.max) : A.status }; return hdr;
}
var g = function(){ if(!active() && typeof window.bkEmptyState === 'function') return window.bkEmptyState('Pre-Offer Bid'); return render(); };
if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Pre-Offer Bid', g); else RENDERERS['Pre-Offer Bid'] = g;
})();
