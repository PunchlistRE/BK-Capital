/* CAPITAL STACK: mezzanine debt and preferred equity between the senior loan and the common equity (acquisitions).
     Mezzanine loan   subordinate to the senior mortgage, secured by the ownership interest in the property-owning entity. Sized as a fixed amount, or up to a
                      combined loan-to-value (senior + mezzanine) on the same value the senior LTV test uses. Interest only: a current-pay rate paid monthly
                      after senior debt service, and an optional accruing (PIK) rate added to its balance. Repaid with what accrued at its maturity or the sale.
     Preferred equity not a loan: contractual return and priority ahead of the common equity. Sized as a fixed amount or a share of the equity the deal still
                      needs after the loans. A current-pay return paid monthly, an accruing return compounded into what it is owed; redeemed (capital plus
                      what accrued) at the sale, ahead of the common equity, with an optional minimum multiple.
   Both are sources at closing, so the common (sponsor / LP) equity is smaller by their proceeds; the mezzanine origination fee is a use. Their payments come
   out of the cash flow before the common equity, so the returns, the waterfall and every page that reads bkDebt().equity see the common equity only.
   A deal with neither is calculated exactly as before. */
(function(){
'use strict';
function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
function esc(x){ return String(x == null ? '' : x).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
function dev(s){ return /develop/i.test(String((s || {}).dealType || '')); }
/* the sizes, from the senior loan's figures */
function size(s, d){
  var out = { mezz:0, mezzFee:0, pref:0, active:false };
  if(dev(s) || !d) return out;
  var mz = num(s.mezzAmount) > 0 ? num(s.mezzAmount) : (num(s.mezzCLTV) > 0 ? Math.max(0, num(s.mezzCLTV) * num(d.ltvValue) - num(d.loan)) : 0);
  mz = Math.floor(mz / 1000) * 1000;
  var fee = mz * Math.max(0, num(s.mezzOrigFee));
  var need = Math.max(0, num(d.basis) + num(d.fee) + fee - num(d.loan) - mz);   /* the equity the deal still needs after both loans */
  var pf = num(s.prefAmount) > 0 ? Math.min(num(s.prefAmount), need) : (num(s.prefPct) > 0 ? need * Math.min(1, num(s.prefPct)) : 0);
  pf = Math.floor(pf / 1000) * 1000;
  out.mezz = mz; out.mezzFee = fee; out.pref = pf; out.active = mz > 0 || pf > 0; out.need = need; return out;
}
/* month by month: what each is paid currently, what accrues, and the payoff */
function schedule(s, K, holdM){
  var mz = K.mezz, pf = K.pref, mTerm = num(s.mezzTerm) > 0 ? Math.min(holdM, Math.round(num(s.mezzTerm) * 12)) : holdM;
  var cur = Math.max(0, num(s.mezzRate)), pik = Math.max(0, num(s.mezzPikRate)), pc = Math.max(0, num(s.prefCurrentRate)), pa = Math.max(0, num(s.prefAccrualRate));
  var rows = [], mb = mz, owed = pf, paidPref = 0;
  for(var m = 1; m <= holdM; m++){
    var r = { m:m, mezzInterest:0, mezzPik:0, mezzPayoff:0, mezzBal:0, prefPaid:0, prefAccrued:0, prefRedeem:0, prefOwed:0 };
    if(mb > 0 && m <= mTerm){ r.mezzInterest = mb * cur / 12; r.mezzPik = mb * pik / 12; mb += r.mezzPik; if(m === mTerm){ r.mezzPayoff = mb; mb = 0; } }
    if(owed > 0){ r.prefPaid = pf * pc / 12; r.prefAccrued = owed * pa / 12; owed += r.prefAccrued; paidPref += r.prefPaid;
      if(m === holdM){ var minM = num(s.prefMinMultiple) > 0 ? num(s.prefMinMultiple) * pf - paidPref : 0; r.prefRedeem = Math.max(owed, minM); owed = 0; } }
    r.mezzBal = mb; r.prefOwed = owed; rows.push(r);
  }
  return rows;
}
var _debt = window.bkDebt;
if(typeof _debt === 'function' && !_debt.__bkStack){
  var w = function(){ var d = _debt.apply(this, arguments); if(!d || d.__bkStackDone) return d;   /* results are cached (src/184b): apply once per result */
    try { d.__bkStackDone = true; var s = d.s || bkLoad(), K = size(s, d);
      d.stack = K; d.seniorEquity = d.equity;
      if(K.active){ d.equity = d.equity + K.mezzFee - K.mezz - K.pref;   /* the common equity: the rest of the basis after both loans and the preferred equity */
        var hold = Math.max(1, Math.round(num(s.holdYears) * 12)); K.rows = schedule(s, K, hold);
        var m1 = K.rows[0] || {}; K.combinedDscr = d.pmt > 0 ? num(d.dscrNoi) / ((num(d.pmt) + num(m1.mezzInterest)) * 12) : 0; K.cltv = num(d.ltvValue) > 0 ? (num(d.loan) + K.mezz) / num(d.ltvValue) : 0; }
    } catch(e){} return d; };
  w.__bkStack = true; window.bkDebt = w; try { bkDebt = w; } catch(e){}
}
window.bkCapitalStack = function(){ var d = bkDebt(); return d.stack || { active:false }; };

/* the inputs, after the senior loan's groups on Deal Underwrite */
function groupHtml(s){ var K = window.bkCapitalStack(), d = bkDebt();
  var rows = bkInput('Mezzanine loan amount', 'mezzAmount', '$ (or size by combined LTV below)', 'money') + bkInput('Mezzanine: max combined LTV', 'mezzCLTV', '% senior + mezzanine', 'pct')
    + bkInput('Mezzanine current-pay rate', 'mezzRate', '% a year, paid monthly', 'pct') + bkInput('Mezzanine accruing (PIK) rate', 'mezzPikRate', '% a year, added to the balance', 'pct')
    + bkInput('Mezzanine origination fee', 'mezzOrigFee', '% of the mezzanine loan', 'pct') + bkInput('Mezzanine term', 'mezzTerm', 'years (blank = the hold)', 'num')
    + bkInput('Preferred equity amount', 'prefAmount', '$ (or a share below)', 'money') + bkInput('Preferred equity: share of the equity need', 'prefPct', '% of the equity after the loans', 'pct')
    + bkInput('Preferred current-pay return', 'prefCurrentRate', '% a year on its capital, paid monthly', 'pct') + bkInput('Preferred accruing return', 'prefAccrualRate', '% a year, compounded, paid at redemption', 'pct')
    + bkInput('Preferred minimum multiple', 'prefMinMultiple', 'x its capital (blank = none)', 'num');
  rows = rows.replace(/>undefined</g, '><').replace(/>null</g, '><');
  var note = K.active ? '<div class="bk-ds-note">Capital stack at closing: senior loan $' + bkFmt(d.loan) + (K.mezz ? ' · mezzanine $' + bkFmt(K.mezz) + ' (combined LTV ' + (K.cltv * 100).toFixed(1) + '%)' : '') + (K.pref ? ' · preferred equity $' + bkFmt(K.pref) : '') + ' · common equity $' + bkFmt(d.equity) + '.'
      + (K.mezz ? ' Combined DSCR (senior and mezzanine current pay), year 1: ' + K.combinedDscr.toFixed(2) + 'x.' : '') + ' Both are paid before the common equity, monthly and at the sale.</div>'
    : '<div class="bk-ds-note">Optional. Mezzanine debt sits behind the senior mortgage; preferred equity is not a loan but is paid a contractual return ahead of the common equity. Both reduce the common equity needed at closing.</div>';
  return '<div class="tbl-wrap" style="margin-top:16px;"><table class="fin bk-input-grid bk-debt-grp"><caption>Mezzanine &amp; Preferred Equity</caption><thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + note; }
function wrapR(name, fn){ if(!window.RENDERERS || typeof RENDERERS[name] !== 'function' || RENDERERS[name]['__bkStack']) return; var prev = RENDERERS[name], w2 = function(){ return fn(prev.apply(this, arguments)); }; w2.__bkStack = true; Object.keys(prev).forEach(function(k){ if(!(k in w2)) w2[k] = prev[k]; }); RENDERERS[name] = w2; if(typeof window.bkRegisterRenderer === 'function') try { window.bkRegisterRenderer(name, w2); } catch(e){} }
wrapR('Deal Underwrite', function(o){ try { var s = bkLoad(); if(!o || typeof o.main !== 'string' || dev(s)) return o; var m = o.main, i = m.indexOf('<caption>Underwriting &amp; Covenants</caption>'); if(i < 0) return o;
    var e = m.indexOf('</table></div>', i); if(e < 0) return o; e += '</table></div>'.length; var nx = m.indexOf('<div class="bk-ds-note">', e); if(nx === e) e = m.indexOf('</div>', nx) + 6;
    o.main = m.slice(0, e) + groupHtml(s) + m.slice(e); } catch(x){} return o; });
/* Sources & Uses: the mezzanine loan and the preferred equity are sources, the mezzanine fee a use */
var _fs = window.bkFundingSummary;
if(typeof _fs === 'function' && !_fs.__bkStack){
  var fw = function(){ var F = _fs.apply(this, arguments); if(!F || F.__bkStackDone) return F; try { F.__bkStackDone = true; if(!F.dev){ var K = window.bkCapitalStack(); if(K.active){
        if(K.mezzFee > 0.5){ F.uses.push(['Mezzanine Origination Fee', K.mezzFee]); F.totalUses += K.mezzFee; }
        var i = F.sources.findIndex(function(x){ return /^Equity/.test(x[0]); }), add = []; if(K.mezz > 0) add.push(['Mezzanine Loan', K.mezz]); if(K.pref > 0) add.push(['Preferred Equity', K.pref]);
        F.sources.splice(i < 0 ? F.sources.length : i, 0, add[0], add[1]); F.sources = F.sources.filter(Boolean);
        F.mezz = K.mezz; F.pref = K.pref; F.totalSources = F.sources.reduce(function(t, x){ return t + num(x[1]); }, 0);
        var su = (F.ties || []).find(function(t){ return t.id === 'su'; }); if(su){ su.a = F.totalSources; su.b = F.totalUses; su.ok = Math.abs(su.a - su.b) <= 1; }
        if(F.measures && F.measures.totalProjectCapitalization){ var tp = F.measures.totalProjectCapitalization; tp.amount += K.mezz + K.pref; tp.closingSources = F.totalSources; tp.mezzanine = K.mezz; tp.preferred = K.pref;
          var ct = (F.ties || []).find(function(t){ return t.id === 'capTotal'; }); if(ct){ ct.a = tp.amount; ct.b = F.totalSources + num(F.measures.callsTotal); ct.ok = Math.abs(ct.a - ct.b) <= 1; } }
        F.failed = (F.ties || []).filter(function(t){ return !t.ok; }); } } } catch(e){} return F; };
  fw.__bkStack = true; window.bkFundingSummary = fw; try { bkFundingSummary = fw; } catch(e){}
}
})();
