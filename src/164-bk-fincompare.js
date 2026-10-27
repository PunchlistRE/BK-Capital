/* ===========================================================================
   FINANCING COMPARISON - the complete economics of each loan alternative, not its stated rate.
   Each alternative is a set of loan-term overrides on the ACTIVE deal. The engine is run on a scratch copy for each one (bkRunWith) and
   this layer only READS its monthly schedule and cash flows; it calculates no NOI, loan sizing, debt service or return of its own.
   From that schedule it builds the dated financing cash flows (proceeds, fees, interest, principal, refinancing, balloon payoff), discounts them
   at a disclosed annual rate on the engine's own day-count (actual days / 365), and reconciles them to the engine: the levered equity cash
   flow must equal the unlevered cash flow plus the financing cash flows, month by month.
   Items the engine does not carry (other upfront costs, a prepayment penalty) are entered per alternative, charged here and labelled.
   Tax effects are not modelled. Financing cost is reported apart from investment performance; no composite score is made.
   =========================================================================== */
(function(){
'use strict';
if(typeof bkLoad !== 'function' || typeof bkSave !== 'function' || typeof bkMonthlyReturns !== 'function' || typeof window.bkRunWith !== 'function' || typeof RENDERERS === 'undefined') return;
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function num(x){ var v = Number(x); return isFinite(v) ? v : NaN; }
function M(v){ return v == null || !isFinite(v) ? '—' : (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US'); }
function P(v, d){ return v == null || !isFinite(v) ? '—' : (v * 100).toFixed(d == null ? 2 : d) + '%'; }
function X(v){ return v == null || !isFinite(v) ? '—' : v.toFixed(2) + 'x'; }
function isDev(s){ return /develop/i.test(String(s.dealType || '')); }
function active(){ return typeof window.bkHasActiveDeal !== 'function' || window.bkHasActiveDeal(); }

/* editable loan terms: [state key, label, kind]. kind: pct (stored as a fraction), x, yrs, mo, usd, sel, flag */
var FIELDS = [
  ['acqLTV', 'Maximum loan-to-value', 'pct'], ['acqDSCR', 'Minimum DSCR', 'x'], ['acqDebtYield', 'Minimum debt yield', 'pct'], ['acqAmort', 'Amortisation (years)', 'yrs'], ['acqIO', 'Interest-only (months)', 'mo'],
  ['debtRateType', 'Rate type', 'sel'], ['acqRate', 'Fixed rate', 'pct'], ['debtIndexRate', 'Floating: index rate (year 1)', 'pct'], ['debtSpread', 'Floating: spread', 'pct'], ['debtFloor', 'Floating: index floor', 'pct'], ['debtCap', 'Floating: rate cap (strike)', 'pct'],
  ['acqOrigFee', 'Origination fee / points', 'pct'], ['rateCapCost', 'Rate cap purchase cost', 'usd'],
  ['debtTerm', 'Loan term (years)', 'yrs'], ['refiAtMaturity', 'Refinance at maturity (1 = yes)', 'flag'], ['refiRate', 'Refinance rate', 'pct'], ['refiAmort', 'Refinance amortisation (years)', 'yrs'], ['refiLTV', 'Refinance LTV', 'pct'], ['refiDSCR', 'Refinance DSCR', 'x'], ['refiOrigFee', 'Refinance fee', 'pct']
];
var CFG_DEFAULT = { disc:null, noiStress:0.10, rateStressBps:150 };

/* ------------------------------------------------------------------ state, kept on the deal like the credit policy and refinance inputs */
function altsOf(s){ var a = (s && s._finAlts) || []; return a.length ? a : [{ id:'A', name:'As underwritten', ov:{}, other:0, prepay:0 }]; }
function cfgOf(s){
  var r = (s && s._finCfg) || {}, pol = safe(function(){ return window.bkPolicy(); }, {}) || {}, c = Object.assign({}, CFG_DEFAULT);
  ['disc', 'noiStress', 'rateStressBps'].forEach(function(k){ if(r[k] !== undefined && r[k] !== '' && isFinite(Number(r[k]))) c[k] = Number(r[k]); });
  c.discDefault = c.disc == null; if(c.disc == null) c.disc = Number(pol.targetIRR) || 0.12;
  return c;
}
function commit(mut){ var s = bkLoad(); if(!s) return; s._finAlts = (s._finAlts && s._finAlts.length) ? s._finAlts : altsOf(s); s._finCfg = s._finCfg || {}; mut(s); bkSave(s); setTimeout(function(){ if(typeof showSheet === 'function') showSheet('Financing Compare'); }, 0); }
window.bkFCSet = function(id, key, val){ commit(function(s){ var a = s._finAlts.filter(function(x){ return x.id === id; })[0]; if(!a) return;
  if(key === 'other' || key === 'prepay'){ var v = num(val); a[key] = isFinite(v) ? (key === 'prepay' ? v / 100 : v) : 0; return; }
  if(val === '' || val == null){ delete a.ov[key]; return; }
  var f = FIELDS.filter(function(q){ return q[0] === key; })[0]; if(!f) return;
  if(f[2] === 'sel'){ a.ov[key] = val; return; } var v2 = num(val); if(isFinite(v2)) a.ov[key] = f[2] === 'pct' ? v2 / 100 : v2; }); };
window.bkFCName = function(id, name){ commit(function(s){ var a = s._finAlts.filter(function(x){ return x.id === id; })[0]; if(a) a.name = String(name || '').slice(0, 40) || a.name; }); };
window.bkFCAdd = function(){ commit(function(s){ var n = s._finAlts.length; if(n >= 6) return; var ids = 'ABCDEF', id = ids.split('').filter(function(c){ return !s._finAlts.some(function(x){ return x.id === c; }); })[0];
  var src = s._finAlts[n - 1]; s._finAlts.push({ id:id, name:'Alternative ' + id, ov:Object.assign({}, src.ov), other:src.other || 0, prepay:src.prepay || 0 }); }); };
window.bkFCDel = function(id){ commit(function(s){ if(s._finAlts.length > 1) s._finAlts = s._finAlts.filter(function(x){ return x.id !== id; }); }); };
window.bkFCCfg = function(k, v){ commit(function(s){ var n = num(v); if(!isFinite(n)) return; s._finCfg[k] = (k === 'disc' || k === 'noiStress') ? n / 100 : n; }); };
window.bkFCReset = function(){ var s = bkLoad(); if(!s) return; delete s._finAlts; delete s._finCfg; bkSave(s); setTimeout(function(){ if(typeof showSheet === 'function') showSheet('Financing Compare'); }, 0); };

/* ------------------------------------------------------------------ the arithmetic that is this layer's own: discounting dated flows */
function days(a, b){ return typeof bkDays === 'function' ? bkDays(a, b) : (b - a) / 86400000; }
function pv(flows, dates, r){ var d0 = dates[0], t = 0; for(var i = 0; i < flows.length; i++) t += flows[i] / Math.pow(1 + r, days(d0, dates[i]) / 365); return t; }
function xirr(flows, dates){ return typeof bkXirr === 'function' ? bkXirr(flows, dates) : NaN; }

/* one run of the engine with the alternative's terms: everything read from the engine's own outputs */
function pack(){
  var m = bkMonthlyReturns(), d = m.d, s = bkLoad();
  return { loan:num(d.loan), fee:num(d.fee), pmt:num(d.pmt), pmtAm:num(d.pmtAmortizing), dscr:num(d.dscr), dscrAm:num(d.dscrAmortizing), dscrNoi:num(d.dscrNoi), ltv:num(d.ltv), ltc:num(d.ltc), binding:d.binding, equity:num(d.equity), debtAtSale:num(d.debtAtSale),
    coupon:num(d.coupon), maxCoupon:num(d.maxCoupon), minCoupon:num(d.minCoupon), rateType:d.rateType, enabled:d.debtEnabled !== false,
    months:(d.months || []).map(function(x){ return { m:x.m, loan:x.loan, draw:num(x.draw) || 0, payment:num(x.payment) || 0, interest:num(x.interest) || 0, principal:num(x.principal) || 0, payoff:num(x.payoff) || 0, fees:num(x.fees) || 0 }; }),
    rows:m.rows.map(function(r){ return { cf:r.cf, noi:r.noi, ds:r.ds, eqDraw:r.eqDraw }; }), dates:m.dates.slice(), irr:m.irr, moic:m.moic, profit:m.dist - m.contrib, refi:m.refi || null,
    hold:num(s.holdYears), term:num(s.debtTerm), rateCapCost:num(s.rateCapCost) || 0, refiAtMaturity:!!num(s.refiAtMaturity), eqDraw:num(m.eqDraw) };
}
function runWith(ov, f){ return window.bkInCase ? window.bkInCase(function(){ return window.bkRunWith(ov, f); }) : window.bkRunWith(ov, f); }

function evalAlt(alt, cfg){
  var lev = safe(function(){ return runWith(alt.ov || {}, pack); }, null);
  if(!lev || !lev.enabled) return { alt:alt, error:lev ? 'Debt is switched off on this deal.' : 'The engine could not run with these terms.' };
  /* the unlevered cash flow on the same deal: the cap premium is a financing cost, so it is taken out of this run */
  var unl = safe(function(){ return runWith(Object.assign({}, alt.ov || {}, { debtEnabled:false, rateCapCost:0 }), function(){ return bkMonthlyReturns().rows.map(function(r){ return r.cf; }); }); }, null);
  var n = lev.rows.length, dates = lev.dates, other = num(alt.other) || 0, prepay = num(alt.prepay) || 0, cap = lev.rateCapCost, last = n - 1, termMo = Math.round((lev.term || 0) * 12);
  /* dated financing cash flows, borrower's view: money in is positive */
  var F = new Array(n).fill(0), I = new Array(n).fill(0), PR = new Array(n).fill(0), FEE = new Array(n).fill(0), PEN = new Array(n).fill(0), events = [];
  F[0] += lev.loan; FEE[0] += lev.fee + cap + other;
  F[0] -= lev.fee + cap + other;
  lev.months.forEach(function(x, i){ if(i >= n) return;
    F[i] += x.draw - x.payment - x.payoff - x.fees; I[i] += x.interest; PR[i] += x.principal; FEE[i] += x.fees;
    if(x.payoff > 0){ var early = termMo > 0 && x.m < termMo; events.push({ m:x.m, kind:lev.refiAtMaturity ? 'original loan repaid from the refinance' + (early ? ', before maturity' : '') : (early ? 'repaid before maturity' : 'balloon at maturity, paid from equity'), amount:x.payoff });
      if(early && prepay > 0){ var pe = prepay * x.payoff; PEN[i] += pe; F[i] -= pe; } } });
  if(lev.debtAtSale > 0){ F[last] -= lev.debtAtSale; var earlyEnd = termMo > 0 && n < termMo; events.push({ m:n, kind:earlyEnd ? 'repaid at sale, before maturity' : 'repaid at sale', amount:lev.debtAtSale });
    if(earlyEnd && prepay > 0){ var pe2 = prepay * lev.debtAtSale; PEN[last] += pe2; F[last] -= pe2; } }
  /* reconciliation to the engine: levered cash flow = unlevered cash flow + financing cash flows (the layer's own charges excluded) */
  var maxDiff = null;
  if(unl && unl.length === n){ maxDiff = 0; for(var i = 0; i < n; i++){ var own = (i === 0 ? other : 0) + PEN[i], eng = lev.rows[i].cf - unl[i], mine = F[i] + own; maxDiff = Math.max(maxDiff, Math.abs(eng - mine)); } }
  var r = cfg.disc, sum = function(a){ return a.reduce(function(t, v){ return t + v; }, 0); };
  var res = { alt:alt, lev:lev, n:n, flows:F, dates:dates, events:events, maxDiff:maxDiff, reconciled:maxDiff != null && maxDiff <= 1,
    interest:sum(I), principal:sum(PR), fees:sum(FEE), penalty:sum(PEN), upfront:lev.fee + cap + other,
    pvInterest:pv(I, dates, r), pvFees:pv(FEE, dates, r), pvPenalty:pv(PEN, dates, r), netPV:pv(F, dates, r), allIn:xirr(F, dates) };
  res.pvCost = res.pvInterest + res.pvFees + res.pvPenalty; res.totalCost = res.interest + res.fees + res.penalty;
  res.equityAtClose = lev.equity + cap + other;
  /* investment effect: the engine's levered return, and the same cash flows with this layer's own charges */
  var vals = lev.rows.map(function(q, k){ return q.cf - (k === 0 ? other : 0) - PEN[k]; });
  res.irrAdj = (other > 0 || res.penalty > 0) ? xirr(vals, dates) : lev.irr;
  /* first-year cash yield on the equity actually invested */
  var y1 = 0; for(var q2 = 0; q2 < Math.min(12, n); q2++) y1 += lev.rows[q2].cf; y1 += lev.rows[0].eqDraw || 0;
  res.coc = res.equityAtClose > 0 ? (y1 - other) / res.equityAtClose : NaN;
  res.debtYield = lev.loan > 0 ? lev.dscrNoi / lev.loan : NaN; res.annualDS = lev.pmtAm * 12;
  /* stressed coverage: the NOI haircut, and for a floating loan the engine re-run with the index shocked */
  var shock = cfg.rateStressBps / 10000, st = null;
  if(lev.rateType === 'Floating'){
    var ov = Object.assign({}, alt.ov || {}); var sv = safe(function(){ return runWith({}, function(){ var s = bkLoad(); return s; }); }, {}) || {};
    var add = function(k){ var base = ov[k] !== undefined ? ov[k] : sv[k]; if(base != null && base !== '' && isFinite(Number(base))) ov[k] = Number(base) + shock; };
    add('debtIndexRate'); for(var y = 1; y <= 10; y++) add('debtIndexY' + y); if(ov.debtCap == null && sv.debtCap > 0) ov.debtCap = Number(sv.debtCap) + shock; else if(ov.debtCap > 0) ov.debtCap += shock;
    /* the loan stays the size it was: only the payment is read from the shocked run */
    st = safe(function(){ return runWith(Object.assign({}, ov, { acqLTV:lev.ltv > 0 ? lev.ltv : (alt.ov || {}).acqLTV }), function(){ var m = bkMonthlyReturns(); return { pmtAm:num(m.d.pmtAmortizing), loan:num(m.d.loan) }; }); }, null);
  }
  var ds = st && st.loan > 0 ? st.pmtAm * 12 * (lev.loan / st.loan) : res.annualDS;
  res.stressDscr = ds > 0 ? lev.dscrNoi * (1 - cfg.noiStress) / ds : NaN; res.stressNote = lev.rateType === 'Floating' ? 'index +' + cfg.rateStressBps + ' bps and NOI -' + (cfg.noiStress * 100).toFixed(0) + '%' : 'NOI -' + (cfg.noiStress * 100).toFixed(0) + '% (a fixed rate does not move during the term)';
  res.maturityInHold = lev.term > 0 && lev.hold > 0 && lev.term < lev.hold;
  return res;
}

window.bkFinCompareData = function(){
  var s = safe(function(){ return bkLoad(); }, null); if(!s || isDev(s)) return null;
  var cfg = cfgOf(s), alts = altsOf(s), R = alts.map(function(a){ return evalAlt(a, cfg); }), ok = R.filter(function(x){ return !x.error; });
  /* a consistent horizon: every alternative must run over the same dated months */
  var ref = ok[0], consistent = ok.every(function(x){ return x.n === ref.n && +x.dates[0] === +ref.dates[0] && +x.dates[x.n - 1] === +ref.dates[ref.n - 1]; });
  var sens = [-0.02, 0, 0.02].map(function(dl){ var rr = Math.max(0.0, cfg.disc + dl); return { r:rr, rows:ok.map(function(x){ var inner = Object.assign({}, cfg, { disc:rr }); return { id:x.alt.id, netPV:pv(x.flows, x.dates, rr) }; }) }; });
  return { s:s, cfg:cfg, alts:alts, results:R, ok:ok, consistent:consistent, sens:sens };
};

/* ------------------------------------------------------------------ the sheet */
function box(h){ return '<div style="background:var(--surface,#fff);border:1px solid var(--line,#dbe4ec);border-radius:8px;padding:14px 16px;margin-bottom:14px">' + h + '</div>'; }
function best(ok, f, dir){ var b = null; ok.forEach(function(x){ var v = f(x); if(v == null || !isFinite(v)) return; if(!b || (dir > 0 ? v > b.v : v < b.v)) b = { id:x.alt.id, name:x.alt.name, v:v }; }); return b; }
function render(){
  var s = safe(function(){ return bkLoad(); }, null), hdr = { title:'Financing Compare', crumbs:'Debt', desc:'Compare loan alternatives on their complete, dated economics over one hold period, not on the stated rate.', sidebar:'', meta:{ Property:s && s.name } };
  if(!s || isDev(s)){ hdr.main = box('Financing Compare covers acquisition deals. A development deal is financed by a construction loan and a takeout, which the Debt sheets model.'); return hdr; }
  var D = window.bkFinCompareData(); if(!D || !D.ok.length){ hdr.main = box('No alternative could be run.' + (D && D.results[0] && D.results[0].error ? ' ' + esc(D.results[0].error) : '')); return hdr; }
  var cfg = D.cfg, ok = D.ok, T = 'width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums', cell = 'padding:6px 8px;border-bottom:1px solid var(--line,#e5ecf2)';
  var inp = function(label, k, val, step){ return '<label style="display:flex;flex-direction:column;gap:3px;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;opacity:.85">' + label + '<input type="number" step="' + step + '" value="' + val + '" onchange="bkFCCfg(\'' + k + '\',this.value)" style="width:120px;padding:7px 9px;border:1px solid var(--line,#dbe4ec);border-radius:6px;font:inherit;font-size:14px;text-align:right"></label>'; };
  var main = box('<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end">' + inp('Discount rate % (annual)', 'disc', (cfg.disc * 100).toFixed(2), 0.25) + inp('Stress: NOI decline %', 'noiStress', (cfg.noiStress * 100).toFixed(1), 1) + inp('Stress: index rise (bps)', 'rateStressBps', cfg.rateStressBps, 25)
    + '<div style="font-size:12.5px;max-width:520px;line-height:1.5">Financing flows are discounted on dated months, actual days / 365 (the engine\'s own XIRR day-count), at <b>' + P(cfg.disc, 2) + '</b>' + (cfg.discDefault ? ' (the credit policy\'s target IRR, until you set one)' : '') + '. Every alternative runs over the same ' + ok[0].n + ' months. Tax effects are not modelled.</div></div>');
  /* editor: one column per alternative */
  var hrow = '<tr><th style="' + cell + ';text-align:left">Loan terms (blank = the deal\'s value)</th>' + D.alts.map(function(a){ return '<th style="' + cell + ';text-align:center"><input type="text" value="' + esc(a.name) + '" onchange="bkFCName(\'' + a.id + '\',this.value)" style="width:150px;text-align:center;font-weight:700;padding:5px;border:1px solid var(--line,#dbe4ec);border-radius:5px">' + (D.alts.length > 1 ? ' <button type="button" class="pl-hbtn" title="Remove" onclick="bkFCDel(\'' + a.id + '\')">&times;</button>' : '') + '</th>'; }).join('') + '</tr>';
  var dealVal = function(k){ var v = s[k]; return v == null ? '' : v; };
  var erows = FIELDS.map(function(f){ return '<tr><td style="' + cell + '">' + f[1] + '</td>' + D.alts.map(function(a){ var v = a.ov[f[0]], ph = dealVal(f[0]);
      if(f[2] === 'sel') return '<td style="' + cell + ';text-align:center"><select onchange="bkFCSet(\'' + a.id + '\',\'' + f[0] + '\',this.value)" style="padding:5px;border:1px solid var(--line,#dbe4ec);border-radius:5px"><option value="">' + esc(ph) + ' (deal)</option><option value="Fixed"' + (v === 'Fixed' ? ' selected' : '') + '>Fixed</option><option value="Floating"' + (v === 'Floating' ? ' selected' : '') + '>Floating</option></select></td>';
      var shown = v == null ? '' : (f[2] === 'pct' ? +(v * 100).toFixed(4) : v), phs = f[2] === 'pct' && ph !== '' ? +(ph * 100).toFixed(4) : ph;
      return '<td style="' + cell + ';text-align:center"><input type="number" step="any" value="' + shown + '" placeholder="' + phs + '" onchange="bkFCSet(\'' + a.id + '\',\'' + f[0] + '\',this.value)" style="width:110px;text-align:right;padding:5px;border:1px solid var(--line,#dbe4ec);border-radius:5px;' + (v != null ? 'background:#fff7e0;' : '') + '"></td>'; }).join('') + '</tr>'; }).join('');
  var extra = [['Other upfront costs ($) &mdash; legal, closing, not in the engine', 'other', function(a){ return a.other || ''; }], ['Prepayment penalty (% of balance repaid before maturity) &mdash; not in the engine', 'prepay', function(a){ return a.prepay ? +(a.prepay * 100).toFixed(4) : ''; }]].map(function(e){ return '<tr><td style="' + cell + '">' + e[0] + '</td>' + D.alts.map(function(a){ return '<td style="' + cell + ';text-align:center"><input type="number" step="any" value="' + e[2](a) + '" onchange="bkFCSet(\'' + a.id + '\',\'' + e[1] + '\',this.value)" style="width:110px;text-align:right;padding:5px;border:1px solid var(--line,#dbe4ec);border-radius:5px"></td>'; }).join('') + '</tr>'; }).join('');
  main += box('<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>Alternatives</b><span>' + (D.alts.length < 6 ? '<button type="button" class="pl-hbtn" onclick="bkFCAdd()">+ Add alternative (copy of the last)</button> ' : '') + '<button type="button" class="pl-hbtn" onclick="bkFCReset()">Reset</button></span></div><div style="overflow-x:auto"><table style="' + T + ';min-width:560px"><thead>' + hrow + '</thead><tbody>' + erows + extra + '</tbody></table></div><div style="margin-top:8px;font-size:12px;opacity:.8">Nothing here changes the deal. Horizon, price, operating assumptions and the exit are the deal\'s own, so every alternative is compared over the same period.</div>');
  /* results */
  var c = function(x, f){ return '<td style="' + cell + ';text-align:right">' + (x.error ? '—' : f(x)) + '</td>'; };
  var sec = function(t){ return '<tr><td colspan="' + (D.results.length + 1) + '" style="padding:8px;background:var(--head,#eef3f8);font-weight:700;font-size:12px;letter-spacing:.06em;text-transform:uppercase">' + t + '</td></tr>'; };
  var row = function(lbl, f, note){ return '<tr><td style="' + cell + '">' + lbl + (note ? '<div style="font-size:11px;opacity:.7">' + note + '</div>' : '') + '</td>' + D.results.map(function(x){ return c(x, f); }).join('') + '</tr>'; };
  var rows = sec('Proceeds and equity') + row('Initial loan proceeds', function(x){ return M(x.lev.loan); }) + row('Required equity at closing', function(x){ return M(x.equityAtClose); }, 'after the loan, fees, rate cap and other upfront costs') + row('Loan-to-value / loan-to-cost', function(x){ return P(x.lev.ltv, 1) + ' / ' + P(x.lev.ltc, 1); }) + row('Binding sizing constraint', function(x){ return esc(x.lev.binding || '—'); })
    + sec('Upfront costs') + row('Origination fee', function(x){ return M(x.lev.fee); }) + row('Rate cap cost', function(x){ return M(x.lev.rateCapCost); }) + row('Other upfront costs', function(x){ return M(num(x.alt.other) || 0); }) + row('Total upfront', function(x){ return '<b>' + M(x.upfront) + '</b>'; })
    + sec('Debt service and coverage') + row('Year-1 debt service (amortising)', function(x){ return M(x.annualDS); }) + row('DSCR, base', function(x){ return X(x.lev.dscrAm); }) + row('DSCR, stressed', function(x){ return '<b>' + X(x.stressDscr) + '</b>'; }, esc(ok[0].stressNote)) + row('Debt yield', function(x){ return P(x.debtYield, 2); }) + row('Highest coupon in the hold', function(x){ return P(x.lev.maxCoupon, 2); }, 'matters for a floating loan')
    + sec('Financing economics over the hold (discounted at ' + P(cfg.disc, 2) + ')') + row('Interest, total', function(x){ return M(x.interest); }) + row('Fees, rate cap, other upfront', function(x){ return M(x.fees); }) + row('Prepayment penalty', function(x){ return M(x.penalty); }) + row('Total financing cost, undiscounted', function(x){ return M(x.totalCost); })
    + row('PV of interest', function(x){ return M(x.pvInterest); }) + row('PV of fees and penalties', function(x){ return M(x.pvFees + x.pvPenalty); }) + row('PV financing cost', function(x){ return '<b>' + M(x.pvCost) + '</b>'; }, 'interest + fees + penalties; principal is returned, not a cost') + row('Net PV of all financing cash flows', function(x){ return M(x.netPV); }, 'proceeds less every payment, fee and payoff; higher is better') + row('All-in cost of the loan (IRR of its cash flows)', function(x){ return P(x.allIn, 2); }, 'includes fees, balloon and prepayment; compare with the stated rate')
    + sec('Obligations at the comparison date') + row('Loan balance repaid at sale', function(x){ return M(x.lev.debtAtSale); }) + row('Loan matures', function(x){ return x.lev.term ? 'year ' + x.lev.term + (x.maturityInHold ? ' (inside the ' + x.lev.hold + '-year hold)' : '') : '—'; }) + row('Refinancing / payoff events', function(x){ return x.events.length ? x.events.map(function(e){ return 'month ' + e.m + ': ' + M(e.amount) + ' ' + esc(e.kind); }).join('<br>') : 'none before sale'; })
    + row('Refinance proceeds (engine)', function(x){ return x.lev.refi ? M(x.lev.refi.loan) + ' at ' + P(x.lev.refi.rate, 2) : '—'; })
    + sec('Effect on the investment (the engine\'s levered cash flows)') + row('Levered IRR', function(x){ return '<b>' + P(x.lev.irr, 2) + '</b>'; }) + row('Levered IRR with this layer\'s own charges', function(x){ return (num(x.alt.other) || x.penalty) ? P(x.irrAdj, 2) : 'same'; }, 'other upfront costs and the prepayment penalty are not in the engine') + row('Equity multiple', function(x){ return X(x.lev.moic); }) + row('Profit', function(x){ return M(x.lev.profit); }) + row('Year-1 cash-on-cash', function(x){ return P(x.coc, 2); })
    + sec('Check') + row('Reconciles to the engine', function(x){ return x.reconciled ? '<span style="color:#1a7f37;font-weight:700">Yes</span> (max difference $' + (x.maxDiff || 0).toFixed(2) + ')' : '<span style="color:#b42318;font-weight:700">No' + (x.maxDiff != null ? ' ($' + x.maxDiff.toFixed(0) + ' off)' : '') + '</span>'; }, 'levered cash flow = unlevered + financing flows, every month');
  main += box('<b>Comparison</b><div style="overflow-x:auto;margin-top:8px"><table style="' + T + ';min-width:560px"><thead><tr><th style="' + cell + ';text-align:left"></th>' + D.results.map(function(x){ return '<th style="' + cell + ';text-align:right">' + esc(x.alt.name) + (x.error ? '<div style="font-weight:400;color:#b42318;font-size:11px">' + esc(x.error) + '</div>' : '') + '</th>'; }).join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>');
  /* winners, each on its own measure; no composite */
  var w = [['Lowest PV financing cost', best(ok, function(x){ return x.pvCost; }, -1), function(v){ return M(v); }], ['Highest net PV of financing', best(ok, function(x){ return x.netPV; }, 1), M], ['Highest levered IRR', best(ok, function(x){ return x.irrAdj; }, 1), function(v){ return P(v, 2); }], ['Highest stressed DSCR', best(ok, function(x){ return x.stressDscr; }, 1), X], ['Least equity at closing', best(ok, function(x){ return x.equityAtClose; }, -1), M], ['Lowest all-in cost of debt', best(ok, function(x){ return x.allIn; }, -1), function(v){ return P(v, 2); }]];
  main += box('<b>Each measure on its own</b><div style="font-size:12.5px;opacity:.85;margin:4px 0 8px">A lower financing cost does not make an alternative the best investment, and the highest IRR is not automatically the best risk-adjusted choice. They are shown separately, with no combined score.</div>'
    + '<table style="' + T + '">' + w.map(function(q){ return '<tr><td style="' + cell + '">' + q[0] + '</td><td style="' + cell + ';font-weight:700">' + (q[1] ? esc(q[1].name) : '—') + '</td><td style="' + cell + ';text-align:right">' + (q[1] ? q[2](q[1].v) : '') + '</td></tr>'; }).join('') + '</table>');
  /* trade-offs against the first alternative, calculated */
  var b0 = ok[0], tr = ok.slice(1).map(function(x){ var dI = (x.irrAdj - b0.irrAdj) * 100, dE = x.equityAtClose - b0.equityAtClose, dC = x.stressDscr - b0.stressDscr, dP = x.pvCost - b0.pvCost, dU = x.upfront - b0.upfront;
    return '<li><b>' + esc(x.alt.name) + '</b> against <b>' + esc(b0.alt.name) + '</b>: levered IRR ' + (dI >= 0 ? '+' : '') + dI.toFixed(2) + ' points; equity at closing ' + (dE >= 0 ? '+' : '-') + M(Math.abs(dE)).replace('-', '') + '; upfront costs ' + (dU >= 0 ? '+' : '-') + M(Math.abs(dU)).replace('-', '') + '; stressed DSCR ' + (dC >= 0 ? '+' : '') + dC.toFixed(2) + 'x; PV financing cost ' + (dP >= 0 ? '+' : '-') + M(Math.abs(dP)).replace('-', '') + '.</li>'; });
  if(tr.length) main += box('<b>Trade-offs, calculated from the engine</b><ul style="margin:8px 0 0 18px;line-height:1.6;font-size:13px">' + tr.join('') + '</ul>');
  /* does the answer depend on the discount rate */
  var sh = D.sens.map(function(z){ var bw = z.rows.slice().sort(function(a, b){ return b.netPV - a.netPV; })[0]; return '<tr><td style="' + cell + '">' + P(z.r, 2) + '</td>' + z.rows.map(function(q){ return '<td style="' + cell + ';text-align:right">' + M(q.netPV) + '</td>'; }).join('') + '<td style="' + cell + ';font-weight:700">' + esc(ok.filter(function(x){ return x.alt.id === bw.id; })[0].alt.name) + '</td></tr>'; });
  var winners = D.sens.map(function(z){ return z.rows.slice().sort(function(a, b){ return b.netPV - a.netPV; })[0].id; }), flips = winners.some(function(x){ return x !== winners[0]; });
  main += box('<b>Sensitivity to the discount rate</b><div style="overflow-x:auto;margin-top:8px"><table style="' + T + '"><thead><tr><th style="' + cell + ';text-align:left">Rate</th>' + ok.map(function(x){ return '<th style="' + cell + ';text-align:right">' + esc(x.alt.name) + '</th>'; }).join('') + '<th style="' + cell + ';text-align:left">Highest net PV</th></tr></thead><tbody>' + sh.join('') + '</tbody></table></div><div style="margin-top:8px;font-size:13px">'
    + (ok.length < 2 ? 'Add a second alternative to compare.' : flips ? '<b>The preferred alternative on net PV changes within &plusmn;2 points of the discount rate.</b> Treat the ranking as dependent on the rate you choose.' : 'The preferred alternative on net PV does not change within &plusmn;2 points of the discount rate.') + '</div>');
  var warn = []; if(!D.consistent) warn.push('The alternatives do not cover the same dated months; they are not comparable.'); ok.forEach(function(x){ if(!x.reconciled) warn.push(esc(x.alt.name) + ' does not reconcile to the engine; its financing figures should not be relied on.'); if(x.maturityInHold && !x.lev.refiAtMaturity) warn.push(esc(x.alt.name) + ': the loan matures in year ' + x.lev.term + ', before the ' + x.lev.hold + '-year hold, with no refinance assumed. The engine pays the balloon from equity in that month.'); if(x.lev.rateType === 'Floating' && !(x.lev.rateCapCost > 0) && !(num(s.debtCap) > 0 || num((x.alt.ov || {}).debtCap) > 0)) warn.push(esc(x.alt.name) + ': floating rate with no cap or hedge entered; its cost is exposed to the index.'); });
  main += box('<b>Basis and limits</b><ul style="margin:8px 0 0 18px;line-height:1.6;font-size:13px"><li>Every figure is read from the underwriting engine run on a scratch copy of the deal; this sheet adds no cash flow of its own except the two charges labelled above.</li><li>Fixed vs floating, forward index path, hedge cost, fees, maturity and refinance terms are the engine\'s inputs; the forward index path is the deal\'s year-by-year index curve unless you change the index rate.</li><li>The prepayment penalty is applied to a balance repaid before maturity (a refinance or a sale inside the term). The refinance loan\'s own prepayment terms are not an engine input, so no penalty is charged on it. Defeasance and yield maintenance are not modelled.</li><li>Tax effects (interest deductibility, depreciation, investor-specific rates) are not modelled here.</li><li>PV financing cost uses the single discount rate shown; a different rate can change the ranking (see the sensitivity above).</li></ul>' + (warn.length ? '<div style="margin-top:10px;color:#b42318;font-size:13px"><b>Review:</b><ul style="margin:4px 0 0 18px">' + warn.map(function(t){ return '<li>' + t + '</li>'; }).join('') + '</ul></div>' : ''));
  hdr.main = main; hdr.meta = { Property:s.name, Alternatives:D.alts.length, 'Discount rate':P(cfg.disc, 2) }; return hdr;
}
var g = function(){ if(!active() && typeof window.bkEmptyState === 'function') return window.bkEmptyState('Financing Compare'); return render(); };
if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Financing Compare', g); else RENDERERS['Financing Compare'] = g;
})();
