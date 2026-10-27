/* ===========================================================================
   WATERFALL VERIFICATION. For every hurdle the waterfall is re-tested from the engine's own distribution rows: does what the partners actually received
   satisfy the hurdle math? Nothing here changes a distribution; it reads bkWaterfallV07() and says whether its output is consistent with the deal's terms.
   IRR basis, per hurdle: the hurdle account is replayed from the contributions and the amounts applied against it (accrued balance less the ending balance),
   and the IRR of those dated flows is compared with the hurdle rate. A hurdle that was reached must come out at its rate; one that was not reached must come
   out below it with a balance left. Equity-multiple basis, per hurdle: the LP's multiple against the hurdle multiple, in the same two cases.
   Also checked: no distribution reaches a tier before the tiers below it were cleared, distributions and contributions are conserved, and the promote is
   the GP's distributions in excess of its pro-rata share.
   =========================================================================== */
(function(){
'use strict';
if(typeof bkLoad !== 'function' || typeof window.bkWaterfallV07 !== 'function' || typeof RENDERERS === 'undefined') return;
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function num(x){ var v = Number(x); return isFinite(v) ? v : NaN; }
function M(v){ return !isFinite(v) ? '—' : (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US'); }
function P2(v){ return !isFinite(v) ? '—' : (v * 100).toFixed(2) + '%'; }
var TOL_IRR = 0.0005, TOL_USD = 1;          /* the IRR is dated (actual days / 365) while the accounts accrue monthly: 5 bps; money to the dollar */

function run(opts){
  var w = (opts && opts.w) || window.bkWaterfallV07(), s = w.s, rows = w.rows, x = w.x, n = rows.length, gs = num(s.gpShare) || 0, lpS = 1 - gs;
  var em = String(s.hurdleBasis) === '2', lpMode = safe(function(){ return bkConventions(s).cvHurdleBasis === 'lp'; }, true);
  var out = { basis:em ? 'EM' : 'IRR', lpMode:lpMode, hurdles:[], other:[], rows:n };
  var last = rows[n - 1] || {}, bal = function(k){ return num(last['b' + k]) || 0; };
  var eq0 = num(x.rows[0] && x.rows[0].eqDraw) || 0, closeDt = x.closeDt, dates = rows.map(function(r){ return r.dt; });
  var rates = [num(s.pref), num(s.hurdle2), num(s.hurdle3)], ems = [num(s.em1), num(s.em2), num(s.em3)];
  var xirr = function(v, closeAmt){ return typeof bkXirrClose === 'function' ? bkXirrClose(v, dates, closeDt, closeAmt) : (typeof bkXirr === 'function' ? bkXirr(v, dates) : NaN); };
  for(var k = 1; k <= 3; k++){
    var h = { k:k, name:k === 1 ? 'Tier 1 · preferred return' : 'Tier ' + k + ' hurdle', balance:bal(k) }, cleared = h.balance <= TOL_USD;
    if(!em){
      var rate = rates[k - 1], mr = Math.pow(1 + rate, 1 / 12) - 1, b = 0, flows = [], applied = 0, contrib = 0;
      for(var i = 0; i < n; i++){ var r = rows[i], inflow = lpMode ? (-r.lpCon) : r.con, a = (b + inflow) * (1 + mr), bk = num(r['b' + k]) || 0, ap = a - bk; flows.push(-inflow + ap); applied += ap; contrib += inflow; b = bk; }
      var irr = xirr(flows, -eq0 * (lpMode ? lpS : 1));
      Object.assign(h, { rate:rate, measured:irr, target:rate, unit:'irr', applied:applied, contributed:contrib, cleared:cleared });
      if(!isFinite(rate) || rate <= 0){ h.status = 'na'; h.detail = 'This hurdle has no rate.'; }
      else if(cleared){ var d = irr - rate; h.status = isFinite(irr) && Math.abs(d) <= TOL_IRR ? 'pass' : 'fail'; h.detail = h.status === 'pass' ? 'Reached: the replayed IRR is ' + P2(irr) + ', ' + (Math.abs(d) * 10000).toFixed(1) + ' bps from the ' + P2(rate) + ' hurdle.' : 'The account is cleared but the replayed IRR is ' + P2(irr) + ', not ' + P2(rate) + '.'; }
      else if(!isFinite(irr)){ h.status = applied > TOL_USD ? 'fail' : 'pass'; h.detail = applied > TOL_USD ? 'A balance remains and the IRR cannot be solved.' : 'Not reached: nothing was distributed against this hurdle; ' + M(h.balance) + ' is still owed.'; }
      else { h.status = irr < rate + 1e-9 ? 'pass' : 'fail'; h.detail = h.status === 'pass' ? 'Not reached: the replayed IRR is ' + P2(irr) + ', below the ' + P2(rate) + ' hurdle, with ' + M(h.balance) + ' still owed.' : 'A balance of ' + M(h.balance) + ' remains although the replayed IRR (' + P2(irr) + ') is above the hurdle.'; }
    } else {
      var hm = ems[k - 1], lpCon = w.lp ? w.lp.contrib : NaN, cumLP = rows.reduce(function(t, r){ return t + r.lpDist; }, 0);
      Object.assign(h, { name:k === 1 ? 'Tier 1 · multiple' : 'Tier ' + k + ' multiple', rate:hm, target:hm, measured:lpCon > 0 ? cumLP / lpCon : NaN, unit:'x', cleared:cleared });
      if(!(hm > 0)){ h.status = 'na'; h.detail = 'This hurdle has no multiple.'; }
      else if(cleared){ h.status = h.measured >= hm - 1e-6 ? 'pass' : 'fail'; h.detail = h.status === 'pass' ? 'Reached: the LP multiple is ' + h.measured.toFixed(3) + 'x against the ' + hm.toFixed(2) + 'x hurdle.' : 'The account is cleared but the LP multiple is ' + h.measured.toFixed(3) + 'x, below ' + hm.toFixed(2) + 'x.'; }
      else { h.status = h.measured < hm + 1e-9 ? 'pass' : 'fail'; h.detail = h.status === 'pass' ? 'Not reached: the LP multiple is ' + (isFinite(h.measured) ? h.measured.toFixed(3) : '—') + 'x, below the ' + hm.toFixed(2) + 'x hurdle, with ' + M(h.balance) + ' still owed.' : 'A balance remains although the LP multiple is above the hurdle.'; }
    }
    out.hurdles.push(h);
  }
  /* sequencing: a tier receives cash only after the tiers below it are cleared */
  var seqBad = [], eps = TOL_USD;
  rows.forEach(function(r){ var b1 = num(r.b1) || 0, b2 = num(r.b2) || 0, b3 = num(r.b3) || 0;
    if(r.t2 > eps && b1 > eps) seqBad.push('month ' + r.m + ': Tier 2 paid while Tier 1 owed ' + M(b1));
    if(r.t3 > eps && (b1 > eps || b2 > eps)) seqBad.push('month ' + r.m + ': Tier 3 paid while a lower hurdle was open');
    if(r.t4 > eps && (b1 > eps || b2 > eps || b3 > eps)) seqBad.push('month ' + r.m + ': Tier 4 paid while a hurdle was open');
    if(r.catchup > eps && b1 > eps) seqBad.push('month ' + r.m + ': catch-up paid while Tier 1 owed ' + M(b1)); });
  out.other.push({ id:'seq', label:'Tiers are paid in order', status:seqBad.length ? 'fail' : 'pass', detail:seqBad.length ? seqBad.slice(0, 3).join('; ') + (seqBad.length > 3 ? ' (+' + (seqBad.length - 3) + ' more)' : '') : 'No tier received cash while a tier below it was still owed.' });
  /* conservation */
  var sum = function(f){ return rows.reduce(function(t, r){ return t + (num(f(r)) || 0); }, 0); };
  var dist = sum(function(r){ return r.dist; }), tiers = sum(function(r){ return r.t1 + r.catchup + r.t2 + r.t3 + r.t4; }), partner = sum(function(r){ return r.lpDist + r.gpDist; }), con = sum(function(r){ return r.con; }), pcon = -sum(function(r){ return r.lpCon + r.gpCon; });
  var eng = x.rows.reduce(function(t, r){ return t + (num(r.wfDist != null ? r.wfDist : Math.max(0, r.cf)) || 0); }, 0);
  var okC = Math.abs(dist - tiers) <= TOL_USD * Math.max(1, n / 12) && Math.abs(dist - partner) <= TOL_USD * Math.max(1, n / 12) && Math.abs(con - pcon) <= TOL_USD && Math.abs(dist - eng) <= TOL_USD * Math.max(1, n / 12);
  out.other.push({ id:'cons', label:'Every dollar is distributed once', status:okC ? 'pass' : 'fail', detail:'Distributable ' + M(dist) + '; paid through the tiers ' + M(tiers) + '; to LP and GP ' + M(partner) + '; the engine\'s own distributions ' + M(eng) + '. Contributions ' + M(con) + ' vs ' + M(pcon) + ' to the partners.' });
  /* promote */
  var gpDist = sum(function(r){ return r.gpDist; }), prorata = gs * sum(function(r){ return r.t1 + r.catchup + r.t2 + r.t3 + r.t4; }), promote = num(w.promote);
  var okP = promote >= -TOL_USD && Math.abs(promote - Math.max(0, gpDist - prorata)) <= TOL_USD * Math.max(1, n / 12) + 1 && (out.hurdles[0].cleared || promote <= TOL_USD);
  out.other.push({ id:'promote', label:'Promote is the GP\'s excess over its pro-rata share', status:okP ? 'pass' : 'fail', detail:'GP distributions ' + M(gpDist) + ' less its pro-rata share ' + M(prorata) + ' = ' + M(gpDist - prorata) + '; promote reported ' + M(promote) + '.' + (out.hurdles[0].cleared ? '' : ' Tier 1 was not cleared, so no promote is due.') });
  out.pass = out.hurdles.concat(out.other).filter(function(c){ return c.status === 'pass'; }).length; out.fail = out.hurdles.concat(out.other).filter(function(c){ return c.status === 'fail'; }).length;
  out.ok = out.fail === 0; return out;
}
window.bkWaterfallChecks = function(opts){ return safe(function(){ return run(opts); }, null); };

function box(h){ return '<div style="background:var(--surface,#fff);border:1px solid var(--line,#dbe4ec);border-radius:8px;padding:14px 16px;margin:16px 0 14px">' + h + '</div>'; }
function chip(st){ return '<span class="status-chip ' + (st === 'pass' ? 'pass' : st === 'fail' ? 'fail' : '') + '">' + (st === 'pass' ? 'Pass' : st === 'fail' ? 'Fail' : 'N/A') + '</span>'; }
function panel(){
  var c = window.bkWaterfallChecks(); if(!c) return '';
  var cell = 'padding:6px 8px;border-bottom:1px solid var(--line,#e5ecf2)', T = 'width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums';
  var rows = c.hurdles.map(function(h){ return '<tr><td style="' + cell + ';white-space:nowrap">' + esc(h.name) + '</td><td style="' + cell + ';text-align:right">' + (h.unit === 'x' ? (isFinite(h.target) ? h.target.toFixed(2) + 'x' : '—') : P2(h.target)) + '</td><td style="' + cell + ';text-align:right">' + (h.unit === 'x' ? (isFinite(h.measured) ? h.measured.toFixed(3) + 'x' : '—') : P2(h.measured)) + '</td><td style="' + cell + ';text-align:right">' + M(h.balance) + '</td><td style="' + cell + ';text-align:center">' + chip(h.status) + '</td><td style="' + cell + ';font-size:12px">' + esc(h.detail) + '</td></tr>'; }).join('');
  var oth = c.other.map(function(o){ return '<tr><td style="' + cell + '" colspan="4">' + esc(o.label) + '</td><td style="' + cell + ';text-align:center">' + chip(o.status) + '</td><td style="' + cell + ';font-size:12px">' + esc(o.detail) + '</td></tr>'; }).join('');
  return box('<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><b>Waterfall verification</b><span style="font-size:12.5px">' + (c.ok ? '<span style="color:#3F6B52;font-weight:700">All ' + c.pass + ' checks pass</span>' : '<span style="color:#8C3B34;font-weight:700">' + c.fail + ' of ' + (c.pass + c.fail) + ' checks fail</span>') + ' · ' + (c.basis === 'EM' ? 'equity-multiple basis' : 'IRR basis') + ', hurdles tested on ' + (c.lpMode ? 'the LP\'s own contributions and distributions' : 'total deal equity (legacy convention)') + '</span></div>'
    + '<div style="font-size:12px;opacity:.8;margin:4px 0 8px">Each hurdle is re-tested from what the partners actually received. A reached hurdle must come out at its rate; one not reached must come out below it with a balance left. The replayed IRR is dated (actual days / 365) against monthly accrual, so it is held to ' + (TOL_IRR * 10000).toFixed(0) + ' bps.</div>'
    + '<div style="overflow-x:auto"><table style="' + T + ';min-width:640px"><thead><tr><th style="' + cell + ';text-align:left">Hurdle</th><th style="' + cell + ';text-align:right">' + (c.basis === 'EM' ? 'Hurdle multiple' : 'Hurdle IRR') + '</th><th style="' + cell + ';text-align:right">' + (c.basis === 'EM' ? 'LP multiple' : 'Replayed IRR') + '</th><th style="' + cell + ';text-align:right">Still owed</th><th style="' + cell + ';text-align:center">Result</th><th style="' + cell + ';text-align:left">Detail</th></tr></thead><tbody>' + rows + oth + '</tbody></table></div>');
}
var prev = RENDERERS['Equity Waterfall'];
if(typeof prev === 'function'){
  var wrapped = function(){ var o = prev.apply(this, arguments); try { if(o && typeof o.main === 'string' && !/no deal loaded|there is no active deal/i.test(o.main)) o.main += panel(); } catch(e){} return o; };
  wrapped.__bkWfChecks = true; wrapped.__bkOriginal = prev.__bkOriginal || prev;
  if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Equity Waterfall', wrapped); else RENDERERS['Equity Waterfall'] = wrapped;
}
})();
