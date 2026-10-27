/* ===========================================================================
   DEAL REMEDIES - what it would take for a deal that fails the credit policy to pass it, from the real underwriting engine.
   Four interventions are each quantified against the deal as underwritten, then compared side by side:
     1. Resize debt          the senior loan is cut to a stated amount (default: the house debt capacity); the engine re-runs with that loan.
     2. Renegotiate price    the highest purchase price at which the credit gate passes, searched by re-running the engine and the gate at each price.
     3. Rent required        the rent increase (all residential rents, today) at which the gate passes.
     4. Occupancy required   the vacancy rate at which the gate passes (it may not exist even at 100% occupancy).
   Every figure is the engine's and the credit gate's (bkDealGate) on a scratch copy of the deal. The required improvements are what the numbers
   require; nothing here assumes they are achievable, and the sheet says so. "Pass" is selectable: no HARD exception, or no exception at all.
   =========================================================================== */
(function(){
'use strict';
if(typeof bkLoad !== 'function' || typeof bkSave !== 'function' || typeof window.bkDealGate !== 'function' || typeof window.bkRunWith !== 'function' || typeof RENDERERS === 'undefined') return;
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function num(x){ var v = Number(x); return isFinite(v) ? v : NaN; }
function M(v){ return v == null || !isFinite(v) ? '—' : (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US'); }
function P(v, d){ return v == null || !isFinite(v) ? '—' : (v * 100).toFixed(d == null ? 2 : d) + '%'; }
function X(v){ return v == null || !isFinite(v) ? '—' : v.toFixed(2) + 'x'; }
function isDev(s){ return /develop/i.test(String(s.dealType || '')); }
function active(){ return typeof window.bkHasActiveDeal !== 'function' || window.bkHasActiveDeal(); }
function runWith(ov, f){ return window.bkInCase ? window.bkInCase(function(){ return window.bkRunWith(ov, f); }) : window.bkRunWith(ov, f); }

/* ------------------------------------------------------------------ settings (on the deal) */
function cfgOf(s){ var r = (s && s._rem) || {}; return { debt:(isFinite(num(r.debt)) && num(r.debt) > 0) ? num(r.debt) : null, mode:r.mode === 'all' ? 'all' : 'hard' }; }
function commit(mut){ var s = bkLoad(); if(!s) return; s._rem = s._rem || {}; mut(s._rem); bkSave(s); STATE.res = null; setTimeout(function(){ if(typeof showSheet === 'function') showSheet('Deal Remedies'); }, 0); }
window.bkRemDebt = function(v){ commit(function(r){ var n = num(String(v).replace(/[$,]/g, '')); if(isFinite(n) && n > 0) r.debt = n; else delete r.debt; }); };
window.bkRemMode = function(m){ commit(function(r){ r.mode = m === 'all' ? 'all' : 'hard'; }); };
var STATE = { key:null, res:null, running:false, progress:'' };

/* ------------------------------------------------------------------ one engine + gate run on a scratch copy */
function snap(ov){
  return runWith(ov || {}, function(){
    var g = window.bkDealGate(), s = bkLoad(), m = bkMonthlyReturns(), d = m.d, cap = g.capacity, u = bkAnnualCF(), rr = Array.isArray(s.rentRoll) && s.rentRoll.length ? window.bkRentRollStats(s.rentRoll) : null;
    return { price:num(s.purchasePrice), loan:num(d.loan), ltvValue:num(d.ltvValue), equity:num(d.equity) + (num(s.rateCapCost) || 0), ltv:num(d.ltv), ltc:num(d.ltc), dscr:cap ? num(cap.box.dscr) : NaN, dy:cap ? num(cap.box.debtYield) : NaN, noi:u.arr[0].after,
      irr:m.irr, moic:m.moic, profit:m.dist - m.contrib, lpIrr:g.waterfall ? num(g.waterfall.lpIRR) : NaN, capacity:cap ? cap.capacity : NaN, units:num(s.units), vacancy:num(s.vacancy),
      rent:rr ? (rr.resUnits > 0 ? rr.resInPlace / rr.resUnits : NaN) : num(s.avgRent), hard:g.hard, soft:g.soft, verdict:g.verdict,
      fails:g.rows.filter(function(r){ return r.applicable && !r.pass; }).map(function(r){ return { id:r.id, label:r.label, sev:r.severity, value:r.value, threshold:r.threshold, type:r.type, dir:r.dir }; }) };
  });
}
function passes(sn, mode){ return !!sn && sn.hard === 0 && (mode === 'all' ? sn.soft === 0 : true); }
function failIds(sn){ return sn ? sn.fails.map(function(f){ return f.id; }) : []; }

/* the boundary between a feasible and an infeasible value, by bisection; both ends have been evaluated */
function boundary(good, bad, at, mode, tol){ var lo = good, hi = bad, sLo = at(good), sHi = at(bad), it = 0;
  while(Math.abs(hi - lo) > tol && it < 40){ var mid = (lo + hi) / 2, sm = at(mid); if(passes(sm, mode)){ lo = mid; sLo = sm; } else { hi = mid; sHi = sm; } it++; }
  return { good:lo, bad:hi, sGood:sLo, sBad:sHi, iterations:it }; }

/* a monotone search from the failing value toward a better one: coarse scan first, so a non-monotone gate is reported, not hidden */
function search(opts){
  var mode = opts.mode, at = opts.at, xs = opts.scan, snaps = xs.map(function(x){ return { x:x, s:at(x) }; });
  var okFlags = snaps.map(function(z){ return passes(z.s, mode); });
  if(!okFlags.some(Boolean)) return { status:'unreachable', scan:snaps, last:snaps[snaps.length - 1].s };
  var firstOk = okFlags.indexOf(true), monotone = okFlags.slice(firstOk).every(Boolean);   /* once feasible, stays feasible toward the good end */
  var good = snaps[firstOk].x, bad = firstOk > 0 ? snaps[firstOk - 1].x : opts.bad;
  var b = boundary(good, bad, at, mode, opts.tol);
  return { status:monotone ? 'solved' : 'not-monotone', x:b.good, atX:b.sGood, beyond:b.sBad, beyondX:b.bad, scan:snaps };
}

/* the whole analysis; each step is returned as a function so the sheet can show progress between them */
function plan(){
  var s = bkLoad(), cfg = cfgOf(s), res = { cfg:cfg, steps:[] }, mode = cfg.mode, asking = num(s.purchasePrice);
  var base = null;
  res.steps.push(['Underwriting the deal as it stands', function(){ base = snap({}); res.base = base; }]);
  res.steps.push(['Resizing the senior debt', function(){
    var target = cfg.debt != null ? cfg.debt : Math.floor(base.capacity), out = { target:target, defaulted:cfg.debt == null };
    if(!(base.loan > 0)){ out.status = 'no-debt'; res.resize = out; return; }
    if(base.loan <= target){ out.status = 'already-within'; res.resize = out; return; }
    var ltv = target * (1 - 1e-9) / base.ltvValue, sn = null;
    for(var i = 0; i < 30; i++){ sn = snap({ acqLTV:ltv }); if(sn.loan <= target) break; ltv *= 0.9995; }
    out.status = sn && sn.loan <= target ? 'solved' : 'failed'; out.ov = { acqLTV:ltv }; out.s = sn; res.resize = out; }]);
  res.steps.push(['Solving the maximum price', function(){
    if(passes(base, mode)){ res.price = { status:'passes-today' }; return; }
    var at = function(p){ return snap({ purchasePrice:p }); }, r = search({ mode:mode, at:at, scan:[0.9, 0.75, 0.6, 0.45, 0.3].map(function(f){ return asking * f; }), bad:asking, tol:Math.max(1, asking * 5e-4) });
    res.price = r; if(r.x != null) res.price.ov = { purchasePrice:r.x }; }]);
  var rrOn = Array.isArray(s.rentRoll) && s.rentRoll.length > 0;
  var rentOv = function(u){ if(rrOn) return { rentRoll:s.rentRoll.map(function(r){ if(r.tenantType !== 'Residential') return r; var c = Object.assign({}, r); ['inPlaceRent', 'marketRent'].forEach(function(k){ if(num(c[k])) c[k] = num(c[k]) * (1 + u); }); return c; }) }; return { avgRent:num(s.avgRent) * (1 + u) }; };
  res.steps.push(['Solving the rent required', function(){
    if(passes(base, mode)){ res.rent = { status:'passes-today' }; return; }
    var r = search({ mode:mode, at:function(u){ return snap(rentOv(u)); }, scan:[0.05, 0.1, 0.25, 0.5, 1.0], bad:0, tol:0.0005 });
    res.rent = r; if(r.last) res.rent.last = r.last; if(r.x != null){ res.rent.u = r.x; res.rent.ov = rentOv(r.x); } }]);
  res.steps.push(['Solving the occupancy required', function(){
    if(passes(base, mode)){ res.occ = { status:'passes-today' }; return; }
    var v0 = base.vacancy; if(!(v0 > 0)){ res.occ = { status:'none-to-recover', note:'The deal already assumes no vacancy.' }; return; }
    var r = search({ mode:mode, at:function(v){ return snap({ vacancy:v }); }, scan:[0.75, 0.5, 0.25, 0].map(function(f){ return v0 * f; }), bad:v0, tol:0.0002 });
    res.occ = r; if(r.x != null){ res.occ.v = r.x; res.occ.ov = { vacancy:r.x }; } }]);
  return res;
}
function dealKey(){ var s = safe(function(){ return bkLoad(); }, null); return s ? JSON.stringify(s, function(k, v){ return k === '_rem' ? undefined : v; }) + JSON.stringify(cfgOf(s)) : null; }

window.bkRemRun = function(done){
  if(STATE.running) return; var s = bkLoad(); if(!s || isDev(s)) return;
  STATE.running = true; STATE.key = dealKey(); var P0 = plan(), i = 0;
  var tick = function(){ var el = document.getElementById('bk-rem-prog');
    if(i >= P0.steps.length){ STATE.res = P0; STATE.running = false; STATE.progress = ''; if(typeof done === 'function') done(P0); else if(typeof showSheet === 'function') showSheet('Deal Remedies'); return; }
    STATE.progress = 'Step ' + (i + 1) + ' of ' + P0.steps.length + ': ' + P0.steps[i][0] + '…'; if(el) el.textContent = STATE.progress;
    setTimeout(function(){ try { P0.steps[i][1](); } catch(e){ P0.error = (P0.steps[i][0] || '') + ': ' + e.message; i = P0.steps.length; } i++; tick(); }, 30); };
  tick();
};
/* synchronous form, for tests and reports */
window.bkRemSolve = function(){ var s = bkLoad(); if(!s || isDev(s)) return null; var P0 = plan(); P0.steps.forEach(function(st){ st[1](); }); P0.steps = null; return P0; };

/* ------------------------------------------------------------------ the sheet */
function box(h){ return '<div style="background:var(--surface,#fff);border:1px solid var(--line,#dbe4ec);border-radius:8px;padding:14px 16px;margin-bottom:14px">' + h + '</div>'; }
function fv(f){ return f.type === 'pct' ? P(f.value, 2) + ' vs ' + (f.dir === '>=' ? '≥ ' : '≤ ') + P(f.threshold, 2) : f.type === 'x' ? X(f.value) + ' vs ' + (f.dir === '>=' ? '≥ ' : '≤ ') + X(f.threshold) : f.type === 'usd' ? M(f.value) + ' vs ≤ ' + M(f.threshold) : f.type === 'bps' ? Math.round(f.value) + ' vs ≥ ' + Math.round(f.threshold) + ' bps' : String(Math.round(f.value)); }
function render(){
  var s = safe(function(){ return bkLoad(); }, null), hdr = { title:'Deal Remedies', crumbs:'Credit & IC', desc:'What it would take for this deal to clear the credit policy: debt, price, rent and occupancy, each solved with the real engine.', sidebar:'', meta:{ Property:s && s.name } };
  if(!s || isDev(s)){ hdr.main = box('Deal Remedies covers acquisition deals.'); return hdr; }
  var cfg = cfgOf(s), T = 'width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums', cell = 'padding:6px 8px;border-bottom:1px solid var(--line,#e5ecf2)';
  var cur = STATE.res && STATE.key === dealKey() ? STATE.res : null;
  var ctl = box('<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-end"><label style="font-size:12px;display:flex;flex-direction:column;gap:3px">Resize senior debt to no more than ($)<input type="text" value="' + (cfg.debt ? Math.round(cfg.debt).toLocaleString('en-US') : '') + '" placeholder="blank = the house debt capacity" onchange="bkRemDebt(this.value)" style="width:230px;text-align:right;padding:7px;border:1px solid var(--line,#dbe4ec);border-radius:5px"></label>'
    + '<label style="font-size:12px;display:flex;flex-direction:column;gap:3px">The deal passes when<select onchange="bkRemMode(this.value)" style="padding:7px;border:1px solid var(--line,#dbe4ec);border-radius:5px"><option value="hard"' + (cfg.mode === 'hard' ? ' selected' : '') + '>no HARD credit exception</option><option value="all"' + (cfg.mode === 'all' ? ' selected' : '') + '>no credit exception at all</option></select></label>'
    + '<button type="button" class="pl-hbtn primary" onclick="bkRemRun()"' + (STATE.running ? ' disabled' : '') + '>' + (cur ? 'Re-run' : 'Run the analysis') + '</button><span id="bk-rem-prog" style="font-size:13px">' + esc(STATE.progress) + '</span></div><div style="font-size:12px;opacity:.8;margin-top:8px">Each solve re-runs the underwriting engine and the credit gate many times, so the analysis takes a little while. Nothing here changes the deal.</div>');
  if(!cur){ hdr.main = ctl + box('Press <b>Run the analysis</b>. The four interventions will be solved and compared with the deal as underwritten.' + (STATE.res ? ' <i>The deal or the settings changed since the last run.</i>' : '')); return hdr; }
  var R = cur; if(R.error){ hdr.main = ctl + box('<span style="color:#b42318">' + esc(R.error) + '</span>'); return hdr; }
  var base = R.base, mode = R.cfg.mode;
  /* columns */
  var cols = [{ k:'base', head:'As underwritten', sn:base, what:'The deal as it stands' }];
  var z = R.resize; if(z && z.s) cols.push({ k:'debt', head:'Resize debt', sn:z.s, what:'Senior loan cut to ' + M(z.target) + (z.defaulted ? ' (the house debt capacity)' : ''), delta:'Loan ' + M(z.s.loan - base.loan) + '; equity ' + (z.s.equity - base.equity >= 0 ? '+' : '') + M(z.s.equity - base.equity) });
  z = R.price; if(z && z.atX) cols.push({ k:'price', head:'Maximum price', sn:z.atX, what:'Highest price at which the deal passes', delta:'Price ' + M(z.atX.price - base.price) + ' (' + P((z.atX.price - base.price) / base.price, 1) + ')' });
  else if(z && z.last) cols.push({ k:'price', head:'Maximum price', sn:z.last, what:'Best case tried: 30% of asking. Still fails', delta:'Price ' + M(z.last.price - base.price) + ' (best case tried, still fails)' });
  z = R.rent; if(z && z.atX) cols.push({ k:'rent', head:'Rent required', sn:z.atX, what:'Residential rents raised across the board', delta:'Rents +' + P(z.u, 1) + ' (' + M(z.atX.rent - base.rent) + '/unit/month)' });
  else if(z && z.last) cols.push({ k:'rent', head:'Rent required', sn:z.last, what:'Rents +100%. Still fails', delta:'Rents +100% (best case tried, still fails)' });
  z = R.occ; if(z && z.atX) cols.push({ k:'occ', head:'Occupancy required', sn:z.atX, what:'Vacancy reduced', delta:'Occupancy ' + P(1 - base.vacancy, 1) + ' → ' + P(1 - z.v, 1) });
  else if(z && z.last) cols.push({ k:'occ', head:'Occupancy required', sn:z.last, what:'100% occupancy. Still fails', delta:'Occupancy ' + P(1 - base.vacancy, 1) + ' → 100% (best case, still fails)' });
  var row = function(l, f, em){ return '<tr><td style="' + cell + (em ? ';font-weight:700' : '') + '">' + l + '</td>' + cols.map(function(c){ return '<td style="' + cell + ';text-align:right' + (em ? ';font-weight:700' : '') + '">' + f(c.sn, c) + '</td>'; }).join('') + '</tr>'; };
  var rows = row('What changes', function(sn, c){ return '<span style="font-size:12px">' + esc(c.delta || c.what) + '</span>'; })
    + row('Credit verdict', function(sn){ var col = sn.verdict === 'APPROVE' ? '#1a7f37' : sn.verdict === 'DECLINE' ? '#b42318' : '#b26a00'; return '<span style="color:' + col + ';font-weight:700">' + esc(sn.verdict) + '</span>'; }, true)
    + row('HARD / SOFT exceptions', function(sn){ return sn.hard + ' / ' + sn.soft; })
    + row('Purchase price', function(sn){ return M(sn.price); }) + row('Price per unit', function(sn){ return sn.units > 0 ? M(sn.price / sn.units) : '—'; })
    + row('Senior loan', function(sn){ return M(sn.loan); }) + row('Equity at closing', function(sn){ return M(sn.equity); }) + row('Additional equity vs today', function(sn){ return sn === base ? '—' : (sn.equity - base.equity >= 0 ? '+' : '') + M(sn.equity - base.equity); })
    + row('LTV / LTC', function(sn){ return P(sn.ltv, 1) + ' / ' + P(sn.ltc, 1); }) + row('Year-1 DSCR', function(sn){ return X(sn.dscr); }) + row('Debt yield', function(sn){ return P(sn.dy, 2); })
    + row('Year-1 NOI after reserves', function(sn){ return M(sn.noi); }) + row('NOI change vs today', function(sn){ return sn === base ? '—' : (sn.noi - base.noi >= 0 ? '+' : '') + M(sn.noi - base.noi) + ' (' + P((sn.noi - base.noi) / base.noi, 1) + ')'; })
    + row('Average rent per unit per month', function(sn){ return M(sn.rent); }) + row('Occupancy', function(sn){ return P(1 - sn.vacancy, 1); })
    + row('Levered IRR', function(sn){ return P(sn.irr, 2); }, true) + row('LP IRR', function(sn){ return P(sn.lpIrr, 2); }) + row('Equity multiple', function(sn){ return X(sn.moic); }) + row('Profit', function(sn){ return M(sn.profit); })
    + row('Still failing', function(sn){ return sn.fails.length ? sn.fails.map(function(f){ return '<div style="font-size:11.5px;color:' + (f.sev === 'HARD' ? '#b42318' : '#b26a00') + '">' + esc(f.label.replace(/ \(.*/, '')) + ' (' + f.sev.toLowerCase() + ')</div>'; }).join('') : '<span style="color:#1a7f37;font-weight:700">None</span>'; });
  var main = ctl + box('<b>Side by side</b><div style="overflow-x:auto;margin-top:8px"><table style="' + T + ';min-width:640px"><thead><tr><th style="' + cell + '"></th>' + cols.map(function(c){ return '<th style="' + cell + ';text-align:right">' + c.head + '</th>'; }).join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>');
  /* the answers in words, each with its numbers; the ones that do not exist are said plainly */
  var say = [];
  say.push(base.fails.length ? '<b>Today:</b> ' + esc(base.verdict) + ' with ' + base.hard + ' hard and ' + base.soft + ' soft exception' + (base.hard + base.soft === 1 ? '' : 's') + ': ' + base.fails.map(function(f){ return esc(f.label.replace(/ \(.*/, '')) + ' (' + fv(f) + ')'; }).join('; ') + '.' : '<b>Today:</b> the deal has no credit exceptions.');
  z = R.resize; if(z){ say.push(z.status === 'solved' ? '<b>Resize debt:</b> cutting the loan from ' + M(base.loan) + ' to ' + M(z.s.loan) + ' requires <b>' + M(z.s.equity - base.equity) + '</b> more equity, takes year-1 DSCR from ' + X(base.dscr) + ' to ' + X(z.s.dscr) + ', and moves the levered IRR from ' + P(base.irr, 2) + ' to ' + P(z.s.irr, 2) + ' (multiple ' + X(base.moic) + ' to ' + X(z.s.moic) + '). ' + (passes(z.s, mode) ? 'On its own this <b>clears</b> the policy.' : 'On its own this <b>does not clear</b> the policy; still failing: ' + (z.s.fails.map(function(f){ return esc(f.label.replace(/ \(.*/, '')); }).join(', ') || 'none') + '.') : z.status === 'already-within' ? '<b>Resize debt:</b> the loan (' + M(base.loan) + ') is already within ' + M(z.target) + '.' : z.status === 'no-debt' ? '<b>Resize debt:</b> the deal has no senior debt.' : '<b>Resize debt:</b> the engine could not size a loan at or under ' + M(z.target) + '.'); }
  z = R.price; if(z){ if(z.status === 'passes-today') say.push('<b>Price:</b> the deal already passes at ' + M(base.price) + '.');
    else if(z.status === 'unreachable') say.push('<b>Price:</b> <b>no price from ' + M(base.price * 0.3) + ' to ' + M(base.price) + ' (30% to 100% of asking) clears the policy.</b> At 30% of asking the engine still shows: ' + (z.last.fails.map(function(f){ return esc(f.label.replace(/ \(.*/, '')); }).join(', ') || '—') + '. Price alone cannot rescue this deal on the stated terms.');
    else say.push('<b>Price:</b> the highest price that passes is <b>' + M(z.atX.price) + '</b>, <b>' + M(base.price - z.atX.price) + ' (' + P((base.price - z.atX.price) / base.price, 1) + ') below</b> the asking price (' + M(z.atX.price / Math.max(1, z.atX.units)) + ' per unit). Just above it (' + M(z.beyondX) + ') the engine fails: ' + (failIds(z.beyond).map(function(id){ var f = z.beyond.fails.filter(function(q){ return q.id === id; })[0]; return esc(f.label.replace(/ \(.*/, '')); }).join(', ')) + '.' + (z.status === 'not-monotone' ? ' <b style="color:#b42318">Passing is not one unbroken range of prices, so this is the lowest-price boundary found, not a proven maximum.</b>' : '')); }
  z = R.rent; if(z){ if(z.status === 'passes-today') say.push('<b>Rent:</b> not needed; the deal passes today.');
    else if(z.status === 'unreachable') say.push('<b>Rent:</b> <b>no rent increase up to +100% clears the policy</b>; at +100% the engine still shows: ' + (z.last.fails.map(function(f){ return esc(f.label.replace(/ \(.*/, '')); }).join(', ') || '—') + '.');
    else say.push('<b>Rent:</b> residential rents must rise <b>' + P(z.u, 1) + '</b> (' + M(base.rent) + ' to ' + M(z.atX.rent) + ' per unit per month) for the deal to pass, lifting year-1 NOI after reserves from ' + M(base.noi) + ' to ' + M(z.atX.noi) + ' (<b>+' + M(z.atX.noi - base.noi) + ', ' + P((z.atX.noi - base.noi) / base.noi, 1) + '</b>). Just below that, the engine fails: ' + (z.beyond.fails.map(function(f){ return esc(f.label.replace(/ \(.*/, '')); }).join(', ')) + '. This is what the numbers require, not a forecast; check it against comparable rents.'); }
  z = R.occ; if(z){ if(z.status === 'passes-today') say.push('<b>Occupancy:</b> not needed; the deal passes today.'); else if(z.status === 'none-to-recover') say.push('<b>Occupancy:</b> ' + esc(z.note));
    else if(z.status === 'unreachable') say.push('<b>Occupancy:</b> <b>even at 100% occupancy the deal does not pass</b> (still failing: ' + (z.last.fails.map(function(f){ return esc(f.label.replace(/ \(.*/, '')); }).join(', ') || '—') + '). Occupancy alone cannot fix it.');
    else say.push('<b>Occupancy:</b> vacancy must fall from ' + P(base.vacancy, 1) + ' to <b>' + P(z.v, 1) + '</b> (occupancy ' + P(1 - base.vacancy, 1) + ' to ' + P(1 - z.v, 1) + '), lifting year-1 NOI after reserves by ' + M(z.atX.noi - base.noi) + ' (' + P((z.atX.noi - base.noi) / base.noi, 1) + ').'); }
  main += box('<b>What each intervention requires</b><ul style="margin:8px 0 0 18px;line-height:1.7;font-size:13.5px">' + say.map(function(t){ return '<li>' + t + '</li>'; }).join('') + '</ul>');
  main += box('<b>Basis and limits</b><ul style="margin:8px 0 0 18px;line-height:1.6;font-size:13px"><li>The credit gate is the one on the Credit Policy and IC Memo sheets (' + (mode === 'all' ? 'every exception must clear' : 'every HARD exception must clear') + '). Its targets are the deal\'s credit policy.</li><li>Debt is resized by capping the engine\'s loan-to-value so the engine sizes the loan at or below the amount (the engine rounds loans down to $1,000); fees, equity, debt service and returns are the engine\'s at that loan.</li><li>Price, rent and occupancy are searched on a grid and then by bisection (price to ' + P(5e-4, 2) + ' of asking, rent to 0.05 points, vacancy to 0.02 points); the sheet shows what fails just beyond each answer. If passing is not one unbroken range, it says so.</li><li>Each intervention is solved on its own against today\'s deal; they are not combined. The required rent and occupancy are not assumed to be achievable; the model has no market-rent evidence, so compare them with the rent roll and comparables.</li><li>The engine re-sizes the loan to the improved NOI in the rent and occupancy columns (a higher NOI supports a larger loan), so equity falls there; that is the engine\'s own sizing, not an assumption of this sheet.</li><li>Rent raises every residential rent (in-place and market on a rent roll, or the average rent) immediately and grows at the deal\'s rent growth; commercial rent, expenses and the exit cap are unchanged.</li></ul>');
  hdr.main = main; hdr.meta = { Property:s.name, Verdict:base.verdict, Standard:mode === 'all' ? 'no exceptions' : 'no hard exceptions' }; return hdr;
}
var g = function(){ if(!active() && typeof window.bkEmptyState === 'function') return window.bkEmptyState('Deal Remedies'); return render(); };
if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Deal Remedies', g); else RENDERERS['Deal Remedies'] = g;
})();
