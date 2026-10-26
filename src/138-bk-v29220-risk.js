
/* V29.22.0 - PROBABILITY-WEIGHTED RETURNS. Two views of the same deal, both driven by the live engine on scratch copies (the saved deal is never touched):
   1. Scenario-weighted: Downside / Base / Upside with your probabilities -> expected profit, expected return, probability of loss and of missing the hurdle.
   2. Monte Carlo: the main drivers drawn from normal distributions around your assumptions (seeded, so a run is repeatable) -> distribution of IRR, multiple and profit. */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof window.bkRunWith !== 'function' || typeof window.bkSensDrivers !== 'function') return;
var MAXZ = 2.5, ORDER = ['exitCap', 'rentGrowth', 'rentLevel', 'vacancy', 'opexLevel', 'opexGrowth', 'rate'];
var SD0 = { exitCap:0.005, rentGrowth:0.01, rentLevel:0.03, vacancy:0.015, opexLevel:0.03, opexGrowth:0.0075, rate:0.005 };
var LABEL = { exitCap:'Exit cap rate', rentGrowth:'Rent growth', rentLevel:'Starting rent level', vacancy:'Vacancy', opexLevel:'Operating expense level', opexGrowth:'Opex growth', rate:'Debt coupon' };
var UNIT = { exitCap:'pp', rentGrowth:'pp', rentLevel:'rel', vacancy:'pp', opexLevel:'rel', opexGrowth:'pp', rate:'pp' };
var MC = { sig:'', runs:null, running:false, done:0, total:0 };
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function $(v){ var x = Number(v); if(!isFinite(x)) return 'n/a'; var b = Math.abs(x).toLocaleString('en-US', {maximumFractionDigits:0}); return x < 0 ? '($' + b + ')' : '$' + b; }
function P(v, d){ return (v == null || !isFinite(v)) ? 'n/a' : (v * 100).toFixed(d == null ? 1 : d) + '%'; }
function X(v){ return (v == null || !isFinite(v)) ? 'n/a' : v.toFixed(2) + 'x'; }
function box(h){ return '<div style="background:var(--surface,#fff);border:1px solid var(--line,#dbe4ec);border-radius:8px;padding:14px 16px;margin-top:12px;font-size:13px;line-height:1.55;max-width:1000px">' + h + '</div>'; }
function chip(cls, t){ return '<span class="status-chip ' + (cls || '') + '">' + t + '</span>'; }
function isAcq(s){ return !/develop/i.test(String(s.dealType || '')); }

/* ---------------------------------------------------------------- inputs (stored on the deal) */
function defaults(){ return { p:{ Downside:0.25, Base:0.5, Upside:0.25 }, n:500, seed:20260101, corr:-0.3, sd:Object.assign({}, SD0) }; }
function risk(s){ var d = defaults(), r = (s && s._risk) || {}; return { p:Object.assign(d.p, r.p || {}), n:r.n || d.n, seed:r.seed != null ? r.seed : d.seed, corr:r.corr != null ? r.corr : d.corr, sd:Object.assign(d.sd, r.sd || {}) }; }
window.bkRiskInputs = function(){ var s = bkLoad(); return s ? risk(s) : null; };
window.bkRiskSet = function(path, v){ var s = bkLoad(); if(!s) return; var r = risk(s), k = path.split('.');
  if(k[0] === 'p') r.p[k[1]] = v; else if(k[0] === 'sd') r.sd[k[1]] = v; else r[k[0]] = v;
  s._risk = r; bkSave(s); MC.runs = null; MC.sig = ''; if(typeof showSheet === 'function') showSheet('Probability-Weighted'); };

/* ---------------------------------------------------------------- the engine on a scratch copy */
function metrics(ov){
  return window.bkRunWith(ov || {}, function(){
    var r = bkMonthlyReturns(), d = bkDebt(), cf = (r.xirrValues || r.values || r.rows.map(function(q){ return q.cf; })).map(function(v){ return Number(v) || 0; }), profit = cf.reduce(function(a, v){ return a + v; }, 0);
    return { irr:r.irr, moic:r.moic, profit:profit, dscr:d && d.dscr ? d.dscr : null, loan:d ? d.loan : null, cf:cf, dates:r.xirrDates || r.dates };
  });
}
function scenarioRun(s){
  var r = risk(s), names = ['Downside', 'Base', 'Upside'], pol = bkPolicy ? bkPolicy() : {}, out = [];
  names.forEach(function(n){ var ov = n === 'Base' ? {} : bkScenarioOverrides(s, n), m = metrics(ov); out.push(Object.assign({ name:n, p:r.p[n], ov:ov }, m)); });
  var tot = out.reduce(function(a, x){ return a + x.p; }, 0), W = function(f){ return out.reduce(function(a, x){ return a + x.p * f(x); }, 0) / (tot || 1); };
  var len = out[0].cf.length, wcf = []; for(var i = 0; i < len; i++) wcf.push(W(function(x){ return x.cf[i] || 0; }));
  var eirr = null; try { eirr = bkXirr(wcf, out[0].dates); } catch(e){}
  var hurdle = Number(pol.targetIRR) || 0.12;
  return { cases:out, probTotal:tot, expProfit:W(function(x){ return x.profit; }), expMoic:W(function(x){ return x.moic; }), avgIRR:W(function(x){ return x.irr; }), irrOfExpectedCF:eirr, hurdle:hurdle,
    pLoss:out.filter(function(x){ return x.profit < 0; }).reduce(function(a, x){ return a + x.p; }, 0) / (tot || 1), pMiss:out.filter(function(x){ return !(x.irr >= hurdle); }).reduce(function(a, x){ return a + x.p; }, 0) / (tot || 1),
    pDscr:out.filter(function(x){ return x.dscr != null && x.dscr < (Number(pol.minDSCR) || 1.25); }).reduce(function(a, x){ return a + x.p; }, 0) / (tot || 1), minDSCR:Number(pol.minDSCR) || 1.25 };
}
window.bkRiskScenarios = function(){ var s = bkLoad(); return s && isAcq(s) ? scenarioRun(s) : null; };

/* ---------------------------------------------------------------- Monte Carlo */
function rng(seed){ var a = seed >>> 0; return function(){ a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function normals(r, n){ var out = []; while(out.length < n){ var u = Math.max(1e-12, r()), v = r(), m = Math.sqrt(-2 * Math.log(u)); out.push(m * Math.cos(2 * Math.PI * v), m * Math.sin(2 * Math.PI * v)); } return out.slice(0, n); }
var clampZ = function(z){ return Math.max(-MAXZ, Math.min(MAXZ, z)); };
/* the deal's inputs for run k: one draw per driver, rent growth correlated with the exit cap */
function draws(s, R, count){
  var r = rng(R.seed), D = window.bkSensDrivers(s), by = {}; D.forEach(function(d){ by[d.id] = d; }), out = [];
  var out = [];
  for(var k = 0; k < count; k++){ var z = normals(r, ORDER.length), zs = {};
    zs.exitCap = z[0]; zs.rentGrowth = R.corr * z[0] + Math.sqrt(Math.max(0, 1 - R.corr * R.corr)) * z[1];
    ['rentLevel', 'vacancy', 'opexLevel', 'opexGrowth', 'rate'].forEach(function(id, i){ zs[id] = z[2 + i]; });
    var ov = {}, shifts = {};
    ORDER.forEach(function(id){ var d = by[id]; if(!d) return; var shift = clampZ(zs[id]) * (R.sd[id] || 0); shifts[id] = shift; Object.assign(ov, d.ov(shift)); });
    out.push({ ov:ov, shifts:shifts }); }
  return out;
}
window.bkRiskDraws = function(count){ var s = bkLoad(); return draws(s, risk(s), count || 10); };
function pct(sorted, p){ var n = sorted.length; if(!n) return null; var i = (n - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
function stats(arr){ var a = arr.filter(function(v){ return isFinite(v); }).sort(function(x, y){ return x - y; }), n = a.length; if(!n) return null;
  var mean = a.reduce(function(t, v){ return t + v; }, 0) / n, sd = Math.sqrt(a.reduce(function(t, v){ return t + (v - mean) * (v - mean); }, 0) / Math.max(1, n - 1));
  return { n:n, mean:mean, sd:sd, min:a[0], max:a[n - 1], p5:pct(a, 0.05), p10:pct(a, 0.10), p25:pct(a, 0.25), p50:pct(a, 0.50), p75:pct(a, 0.75), p90:pct(a, 0.90), p95:pct(a, 0.95), sorted:a }; }
function summarise(runs, hurdle, minDSCR){
  var n = runs.length, share = function(f){ return runs.filter(f).length / (n || 1); };
  return { n:n, irr:stats(runs.map(function(x){ return x.irr; })), moic:stats(runs.map(function(x){ return x.moic; })), profit:stats(runs.map(function(x){ return x.profit; })), dscr:stats(runs.map(function(x){ return x.dscr; })),
    pLoss:share(function(x){ return x.profit < 0; }), pMiss:share(function(x){ return !(x.irr >= hurdle); }), pDscr:share(function(x){ return x.dscr != null && x.dscr < minDSCR; }), pIrrDefined:share(function(x){ return isFinite(x.irr); }), hurdle:hurdle, minDSCR:minDSCR };
}
window.bkRiskSummarise = summarise;
function sigOf(s){ var o = {}; Object.keys(s).forEach(function(k){ if(k.charAt(0) !== '_' && k !== 'seededAt') o[k] = s[k]; }); return JSON.stringify(o) + JSON.stringify(risk(s)); }
window.bkRiskRunSync = function(n){ var s = bkLoad(), R = risk(s); n = n || R.n; var dr = draws(s, R, n), pol = bkPolicy(), runs = dr.map(function(d){ var m = metrics(d.ov); return { irr:m.irr, moic:m.moic, profit:m.profit, dscr:m.dscr, shifts:d.shifts }; });
  return { runs:runs, summary:summarise(runs, Number(pol.targetIRR) || 0.12, Number(pol.minDSCR) || 1.25) }; };
window.bkRiskRun = function(){
  var s = bkLoad(); if(!s || !isAcq(s) || MC.running) return; var R = risk(s), pol = bkPolicy(), dr = draws(s, R, R.n), runs = [], i = 0, sig = sigOf(s);
  MC = { sig:sig, runs:null, running:true, done:0, total:R.n };
  function tick(){ var t0 = Date.now();
    while(i < dr.length && Date.now() - t0 < 40){ var m = metrics(dr[i].ov); runs.push({ irr:m.irr, moic:m.moic, profit:m.profit, dscr:m.dscr, shifts:dr[i].shifts }); i++; }
    MC.done = i; var el = document.getElementById('bkRiskProg'); if(el) el.textContent = 'Running: ' + i + ' of ' + dr.length + ' draws';
    if(i < dr.length) setTimeout(tick, 0); else { MC.running = false; MC.runs = runs; MC.summary = summarise(runs, Number(pol.targetIRR) || 0.12, Number(pol.minDSCR) || 1.25); MC.R = R; if(typeof showSheet === 'function') showSheet('Probability-Weighted'); } }
  var el0 = document.getElementById('bkRiskProg'); if(el0) el0.textContent = 'Running: 0 of ' + dr.length + ' draws'; setTimeout(tick, 0);
};

/* ---------------------------------------------------------------- view */
function numIn(path, val, pct_, w){ var shown = pct_ ? (val * 100).toFixed(2).replace(/\.?0+$/, '') : String(val); return '<input type="text" value="' + shown + '" style="width:' + (w || 64) + 'px;text-align:left" onchange="bkRiskSet(\'' + path + '\',' + (pct_ ? '(parseFloat(this.value)||0)/100' : '(parseFloat(String(this.value).replace(/,/g,\'\'))||0)') + ')">' + (pct_ ? '<span style="font-size:11px"> %</span>' : ''); }
function histogram(sm, kind){
  var st = sm[kind]; if(!st) return ''; var a = st.sorted, lo = pct(a, 0.005), hi = pct(a, 0.995); if(!(hi > lo)){ lo -= 0.01; hi += 0.01; }
  var B = 28, bins = new Array(B).fill(0), w = (hi - lo) / B; a.forEach(function(v){ var k = Math.min(B - 1, Math.max(0, Math.floor((v - lo) / w))); bins[k]++; });
  var mx = Math.max.apply(null, bins), W = 760, H = 220, L = 40, Rm = 20, T = 14, Bm = 34, X_ = function(v){ return L + (v - lo) / (hi - lo) * (W - L - Rm); }, bh = H - T - Bm, g = '';
  var thr = kind === 'irr' ? sm.hurdle : kind === 'moic' ? 1 : 0;
  bins.forEach(function(c, i){ var x0 = lo + i * w, mid = x0 + w / 2, h = mx ? c / mx * bh : 0, col = mid < (kind === 'moic' ? 1 : 0) ? 'var(--sx-dn,#C0392B)' : (kind === 'irr' && mid < thr) ? '#D9A441' : 'var(--sx-up,#2E6EB8)';
    g += '<rect x="' + (X_(x0) + 0.5) + '" y="' + (T + bh - h) + '" width="' + Math.max(1, X_(x0 + w) - X_(x0) - 1) + '" height="' + h + '" fill="' + col + '" opacity="0.9"><title>' + c + ' of ' + a.length + ' draws</title></rect>'; });
  var fmt = kind === 'irr' ? function(v){ return P(v, 0); } : kind === 'moic' ? function(v){ return v.toFixed(2) + 'x'; } : function(v){ return (v < 0 ? '-' : '') + '$' + Math.abs(v / 1e6).toFixed(1) + 'M'; };
  for(var t = 0; t <= 4; t++){ var v = lo + (hi - lo) * t / 4; g += '<text x="' + X_(v) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7">' + fmt(v) + '</text>'; }
  [['p10', 'P10'], ['p50', 'P50'], ['p90', 'P90']].forEach(function(m){ var v = st[m[0]]; if(v >= lo && v <= hi) g += '<line x1="' + X_(v) + '" x2="' + X_(v) + '" y1="' + (T - 4) + '" y2="' + (T + bh) + '" stroke="currentColor" stroke-width="1.5" stroke-dasharray="' + (m[0] === 'p50' ? '0' : '4 3') + '"/><text x="' + X_(v) + '" y="' + (T - 6) + '" text-anchor="middle" font-size="10" fill="currentColor">' + m[1] + ' ' + fmt(v) + '</text>'; });
  if(thr > lo && thr < hi) g += '<line x1="' + X_(thr) + '" x2="' + X_(thr) + '" y1="' + T + '" y2="' + (T + bh) + '" stroke="#C0392B" stroke-width="1.5"/><text x="' + (X_(thr) + 4) + '" y="' + (T + 12) + '" font-size="10" fill="#C0392B">' + (kind === 'irr' ? 'hurdle ' + P(thr, 0) : kind === 'moic' ? 'break-even' : 'loss') + '</text>';
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Distribution of ' + kind + ' across ' + a.length + ' draws" style="width:100%;max-width:' + W + 'px;height:auto;display:block">' + g + '</svg>';
}
function render(){
  var s = bkLoad(), main = '', r = s ? risk(s) : null;
  if(!s || !isAcq(s)) return { title:'Probability-Weighted Returns', crumbs:'Returns & Equity', desc:'Expected returns and the odds of missing the hurdle.', meta:{}, sidebar:'', main:box('Probability-weighted returns apply to acquisition deals. Open an acquisition deal to use this sheet.') };
  var S_ = scenarioRun(s), ok = Math.abs(S_.probTotal - 1) < 1e-9;
  var rows = S_.cases.map(function(c){ return '<tr><td class="rowlabel">' + c.name + '</td><td>' + numIn('p.' + c.name, c.p, true, 56) + '</td><td>' + P(c.irr) + '</td><td>' + X(c.moic) + '</td><td>' + $(c.profit) + '</td><td>' + (c.dscr != null ? X(c.dscr) : 'n/a') + '</td></tr>'; }).join('');
  main += '<div class="tbl-wrap" style="margin-top:4px"><table class="fin"><caption>Scenario-Weighted Returns - Your Probabilities</caption><thead><tr><th class="rowlabel-h">Case</th><th>Probability</th><th>Levered IRR</th><th>Equity multiple</th><th>Equity profit</th><th>Year-1 DSCR</th></tr></thead><tbody>' + rows
    + '<tr class="grandtotal"><td class="rowlabel">Probability-weighted</td><td>' + P(S_.probTotal, 0) + ' ' + (ok ? chip('pass', 'OK') : chip('fail', 'MUST BE 100%')) + '</td><td>' + P(S_.avgIRR) + '</td><td>' + X(S_.expMoic) + '</td><td>' + $(S_.expProfit) + '</td><td></td></tr></tbody></table></div>'
    + '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>What The Weighting Says</caption><thead><tr><th class="rowlabel-h">Measure</th><th>Result</th><th style="text-align:left">Meaning</th></tr></thead><tbody>'
    + '<tr><td class="rowlabel">Expected equity profit</td><td><b>' + $(S_.expProfit) + '</b></td><td style="text-align:left">Probability-weighted profit across the three cases.</td></tr>'
    + '<tr><td class="rowlabel">IRR of the expected cash flow</td><td><b>' + P(S_.irrOfExpectedCF) + '</b></td><td style="text-align:left">The return on the probability-weighted monthly equity cash flow. This is the honest expected return.</td></tr>'
    + '<tr><td class="rowlabel">Weighted average of the three IRRs</td><td>' + P(S_.avgIRR) + '</td><td style="text-align:left">Not the same thing: an IRR is not a linear measure, so the average of the IRRs is not the return on the expected cash flow. Use the cash-flow figure above.</td></tr>'
    + '<tr><td class="rowlabel">Probability of losing money</td><td>' + P(S_.pLoss, 0) + '</td><td style="text-align:left">Total probability of the cases with negative equity profit.</td></tr>'
    + '<tr><td class="rowlabel">Probability of missing the ' + P(S_.hurdle, 1) + ' hurdle</td><td>' + P(S_.pMiss, 0) + '</td><td style="text-align:left">Hurdle is the target levered IRR on Credit Policy.</td></tr>'
    + '<tr><td class="rowlabel">Probability Year-1 DSCR is below ' + X(S_.minDSCR) + '</td><td>' + P(S_.pDscr, 0) + '</td><td style="text-align:left">Policy minimum DSCR, with each case’s own rate and rent.</td></tr></tbody></table></div>'
    + box('Three cases are coarse: the probability of loss can only move in steps of one case’s weight. The Monte Carlo below spreads the main drivers continuously for a smoother answer. Case definitions (exit-cap, rent-growth and rate shifts) are edited under Deal Underwrite, Underwriting Cases.');
  /* Monte Carlo */
  var drv = window.bkSensDrivers(s), by = {}; drv.forEach(function(d){ by[d.id] = d; });
  var sdRows = ORDER.filter(function(id){ return by[id]; }).map(function(id){ var d = by[id], sd = r.sd[id], isRel = UNIT[id] === 'rel';
    return '<tr><td class="rowlabel">' + LABEL[id] + '</td><td>' + d.show(0) + '</td><td>' + numIn('sd.' + id, sd, true, 56) + '</td><td>' + d.show(-2 * sd) + ' to ' + d.show(2 * sd) + '</td></tr>'; }).join('');
  main += '<div class="tbl-wrap" style="margin-top:24px"><table class="fin"><caption>Monte Carlo - How Far Each Driver Can Move</caption><thead><tr><th class="rowlabel-h">Driver</th><th>Base</th><th>Std deviation</th><th>About 95% of draws fall in</th></tr></thead><tbody>' + sdRows
    + '<tr><td class="rowlabel">Correlation: rent growth vs exit cap</td><td colspan="3" style="text-align:left">' + numIn('corr', r.corr, false, 56) + ' <span style="font-size:11px">(−1 to 1; a negative number means faster rent growth tends to come with a lower exit cap)</span></td></tr>'
    + '<tr><td class="rowlabel">Number of draws</td><td colspan="3" style="text-align:left">' + numIn('n', r.n, false, 64) + '</td></tr>'
    + '<tr><td class="rowlabel">Random seed</td><td colspan="3" style="text-align:left">' + numIn('seed', r.seed, false, 90) + '</td></tr></tbody></table></div>'
    + '<div style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button type="button" class="status-chip pass" onclick="bkRiskRun()"' + (MC.running ? ' disabled' : '') + '>RUN ' + r.n + ' DRAWS</button><span id="bkRiskProg" style="font-size:12px">' + (MC.running ? 'Running: ' + MC.done + ' of ' + MC.total + ' draws' : '') + '</span></div>'
    + '<div style="margin-top:6px;font-size:11px;opacity:.75;max-width:1000px">Correlation runs from \u22121 to 1: a negative number means faster rent growth tends to come with a lower exit cap. Each draw re-runs the full engine (about 10 ms). The same seed and inputs always give the same answer.</div>';
  var sig = sigOf(s), stale = MC.runs && MC.sig !== sig;
  if(MC.runs && !stale){
    var sm = MC.summary, row = function(lab, st, f){ return '<tr><td class="rowlabel">' + lab + '</td><td>' + f(st.mean) + '</td><td>' + f(st.p50) + '</td><td>' + f(st.p10) + '</td><td>' + f(st.p90) + '</td><td>' + f(st.p5) + '</td><td>' + f(st.p95) + '</td><td>' + f(st.sd) + '</td></tr>'; };
    main += '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Monte Carlo Results - ' + sm.n + ' Draws, Seed ' + MC.R.seed + '</caption><thead><tr><th class="rowlabel-h">Measure</th><th>Mean</th><th>Median</th><th>P10 (bad)</th><th>P90 (good)</th><th>P5</th><th>P95</th><th>Std dev</th></tr></thead><tbody>'
      + row('Levered IRR', sm.irr, function(v){ return P(v); }) + row('Equity multiple', sm.moic, X) + row('Equity profit', sm.profit, $) + (sm.dscr ? row('Year-1 DSCR', sm.dscr, X) : '') + '</tbody></table></div>'
      + '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Odds</caption><thead><tr><th class="rowlabel-h">Question</th><th>Probability</th></tr></thead><tbody>'
      + '<tr><td class="rowlabel">Lose money (equity profit below zero)</td><td><b>' + P(sm.pLoss) + '</b></td></tr><tr><td class="rowlabel">Miss the ' + P(sm.hurdle, 1) + ' levered IRR hurdle</td><td><b>' + P(sm.pMiss) + '</b></td></tr>'
      + '<tr><td class="rowlabel">Year-1 DSCR below the ' + X(sm.minDSCR) + ' policy minimum</td><td>' + P(sm.pDscr) + '</td></tr></tbody></table></div>'
      + '<div style="margin-top:16px"><div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.7;margin-bottom:6px">Levered IRR across ' + sm.n + ' draws</div>' + histogram(sm, 'irr') + '</div>'
      + '<div style="margin-top:16px"><div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.7;margin-bottom:6px">Equity profit across ' + sm.n + ' draws</div>' + histogram(sm, 'profit') + '</div>'
      + box('Each draw moves the drivers above together and re-runs the full underwriting engine (debt resizes, taxes and the waterfall follow). Draws are limited to ±2.5 standard deviations. The spread comes only from the drivers you list: it says how sensitive this deal is to those assumptions, not how likely they are in your market. Change a standard deviation to your own view.');
  } else if(stale) main += box('&#9888; The deal or these inputs have changed since the last run. Run the draws again.');
  var hdr = { title:'Probability-Weighted Returns', crumbs:'Returns & Equity', desc:'Expected returns, odds of loss and of missing the hurdle - by scenario weights and by Monte Carlo.', meta:{ Property:s.name, 'Expected IRR (cash flow)':P(S_.irrOfExpectedCF), 'P(loss)':P(S_.pLoss, 0), Hurdle:P(S_.hurdle, 1) }, sidebar:'', main:main };
  return hdr;
}
var g = function(){ if(typeof window.bkHasActiveDeal === 'function' && !window.bkHasActiveDeal() && typeof window.bkEmptyState === 'function') return window.bkEmptyState('Probability-Weighted'); return render(); };
if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Probability-Weighted', g); else RENDERERS['Probability-Weighted'] = g;
if(typeof window.bkAddConflictRule === 'function'){
  window.bkAddConflictRule('risk.prob-not-100', 'ERROR', 'Risk', 'Probability-Weighted', function(s){ var r = risk(s), t = r.p.Downside + r.p.Base + r.p.Upside; if(isAcq(s) && s._risk && Math.abs(t - 1) > 1e-9) return { msg:'The scenario probabilities add up to ' + P(t, 1) + ', not 100%.', why:'Every probability-weighted figure (expected profit, expected IRR, the odds of loss) divides by the total, so probabilities that do not sum to 100% are silently rescaled. Make them sum to 100% so the weights mean what you typed.', fix:'Probability-Weighted', data:{ total:t } }; });
}
})();
