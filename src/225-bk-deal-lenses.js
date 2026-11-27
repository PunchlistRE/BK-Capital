/* DEAL LENSES (Guide 2.0, phase 2b): the debt lens and the tax lens of the deal review. Debt and tax change financing, cash flow, valuation and the after-tax return most, so after "what deserves attention first" the review
   goes through each as a short structured list: what the model has, where it comes from, and whether anything about it needs a look. They are lenses on the whole investment, not a help center.

   The guide is a presentation layer over the underwriting model, so a lens has no rule of its own. Each row:
     reads    a figure the model already calculates (bkDebt, its lifecycle, bkAllInRate, bkDepreciation, bkAfterTaxV18, the development funding and takeout), shown as the model shows it;
     reports  its status from signals the model already raises: a Model Check that is firing (the rule ids named on the row, src/129), a required, needed or expected input that is blank (the registry classes), or an
              error the depreciation engine returns. A row is "ok" when none of those fire, "look" when a Model Check or an engine error does, "missing" when an input is blank, "info" when it is only a fact;
     opens    the real box (the input, or its page) through the same navigation as every other finding.
   Nothing is written to the deal and nothing is calculated here that the model does not already calculate. The debt and tax findings the lenses show are the same findings the review ranks (src/223), never a second list. */
(function(){
'use strict';
if(typeof bkLoad !== 'function' || !window.BKReg) return;
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
function money(v){ var x = Math.abs(num(v)); return (v < 0 ? '-' : '') + '$' + (x >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : Math.round(x).toLocaleString('en-US')); }
function pct(v, d){ return (num(v) * 100).toFixed(d == null ? 2 : d) + '%'; }
function isDev(s){ return /develop/i.test(String((s || {}).dealType || '')); }

/* the Model Checks firing now, by rule id */
function firing(){ var out = {}; (safe(function(){ return window.bkConflicts(); }, []) || []).forEach(function(c){ if(!c.acknowledged) out[c.id] = c; }); return out; }
/* a row: label, what the model has, the rules that speak to it, the inputs behind it (blank ones make it 'missing'), and where to open it */
function row(F, label, value, rules, inputs, open, note){
  var hits = (rules || []).filter(function(id){ return F[id]; }).map(function(id){ return F[id]; });
  var blank = (inputs || []).filter(function(k){ var q = window.BKReg.field(k); return q && !window.BKReg.present(k, bkLoad()) && /^(required|needed|expected)$/.test(String(window.BKLensReq ? window.BKLensReq(k) : '')); });
  var status = hits.length ? 'look' : blank.length ? 'missing' : (note === 'fact' ? 'info' : 'ok');
  return { label:label, value:value, status:status, rules:hits.map(function(c){ return c.id; }), messages:hits.map(function(c){ return c.message; }), blank:blank, open:open || null, why:hits.length ? hits.map(function(c){ return c.why || ''; }).filter(Boolean).join(' ') : '' };
}
/* the requirement class of an input for this deal, from the registry (the model's own list decides required; the rest is as the registry says) */
window.BKLensReq = function(k){ var s = bkLoad(), a = window.BKReg.of(s), out = ''; window.BKReg.workflow(a.id).forEach(function(st){ (st.fields || []).forEach(function(e){ if(e.k === k && !out){ var q = window.BKReg.requirement(e, s); if(q !== 'na') out = q; } }); }); return out; };

function debtRows(s, F){
  var R = [];
  if(isDev(s)){
    var t = safe(function(){ return window.bkDevTakeoutV11(); }, null), f = safe(function(){ return window.bkDevFundingV10(); }, null); if(!t) return [{ label:'Construction financing', value:'Not available for this deal yet.', status:'info', rules:[], messages:[], blank:[], open:null, why:'' }];
    R.push(row(F, 'Construction facility', money(t.commit) + ' commitment, ' + pct(t.commitLTC, 1) + ' of cost, at ' + pct(s.conRate) + '; interest during construction ' + money(t.actualCapInt || t.estInt), ['dev.con-loan-zero-rate', 'dev.no-construction'], ['conLTC', 'conRate'], 'conLTC'));
    R.push(row(F, 'Permanent loan after takeout', t.permLoan > 0 ? money(t.permLoan) + ' at ' + pct(s.permRate) + ', sized by ' + (t.bindingTest || 'the lender tests') + (t.refiShortfall > 0 ? '; shortfall of ' + money(t.refiShortfall) + ' at takeout' : '') : 'No permanent loan: the construction loan is held to the sale.', ['dev.takeout-shortfall'], ['permRate', 'permAmort'], 'permRate'));
    R.push(row(F, 'Timing', 'Takeout ' + (t.takeoutInHold ? 'inside' : 'outside') + ' the hold; hold ends before completion is flagged by Model Checks.', ['dev.hold-before-completion'], [], 'holdYears'));
    return R;
  }
  if(s.debtEnabled === false) return [{ label:'Debt', value:'Switched off: the deal is all-cash, so there is no loan to review.', status:'info', rules:[], messages:[], blank:[], open:'debtEnabled', why:'' }];
  var d = safe(function(){ return window.bkDebt(); }, null); if(!d || !(d.loan > 0)) return [{ label:'Debt', value:'No loan is sized for this deal yet.', status:'info', rules:[], messages:[], blank:[], open:'acqLTV', why:'' }];
  var L = d.lifecycle || {}, a = safe(function(){ return window.bkAllInRate(s); }, null), g = safe(function(){ return window.bkIndexDateGap(s); }, null), p = safe(function(){ return window.bkLoanLabel(s); }, '');
  R.push(row(F, 'The loan', money(d.loan) + (p ? ', ' + p : ', purpose and lender not chosen') + '; origination fee ' + money(d.fee), [], ['loanPurpose', 'lenderType'], 'loanPurpose', 'fact'));
  R.push(row(F, 'How it was sized', 'Sized by ' + d.binding + '. Loan-to-value ' + pct(d.ltv, 1) + ' (limit ' + pct(s.acqLTV, 1) + '), lender DSCR ' + num(d.dscr).toFixed(2) + 'x (minimum ' + num(s.acqDSCR).toFixed(2) + 'x)' + (num(s.acqDebtYield) > 0 ? ', debt yield limit ' + pct(s.acqDebtYield, 1) : ''), ['debt.dscr-below-one', 'debt.sizing-looser-than-policy', 'debt.loan-above-cost'], ['acqLTV', 'acqDSCR'], 'acqLTV'));
  var rt = a && a.type !== 'Fixed' ? (a.type === 'Floating' ? 'Floating: ' + (a.indexName === 'SOFR' ? a.tenor : a.indexName) + ' ' + pct(a.index) + ' plus ' + pct(a.spread) + ' = ' + pct(a.rate) : 'Fixed from a benchmark: ' + pct(a.index) + ' plus ' + pct(a.spread) + ' = ' + pct(a.rate)) : 'Fixed at ' + pct(d.coupon);
  var rr = row(F, 'Interest rate', rt + (g && g.stale ? '. The benchmark is dated ' + g.date + ', ' + Math.abs(g.days) + ' days ' + (g.days > 0 ? 'before' : 'after') + ' the closing' : ''), ['debt.floating-unhedged', 'debt.floating-zero-index'], ['acqRate'], a && a.type !== 'Fixed' ? 'debtIndexRate' : 'acqRate');
  if(g && g.stale){ rr.status = 'look'; rr.messages.push('The benchmark rate is dated ' + g.date + ', ' + Math.abs(g.days) + ' days from the closing (' + g.closing + ').'); rr.rules.push('bkIndexDateGap'); rr.why = (rr.why ? rr.why + ' ' : '') + 'The loan is priced from that rate. Enter the rate expected on the closing or lock date, or the lender\'s quote.'; }
  R.push(rr);
  R.push(row(F, 'How it is repaid', (function(){ var x = safe(function(){ return window.bkRepaySummary(s); }, '') || String(s.repayType || 'Amortizing on the stated schedule'); return /[.]$/.test(x) ? x : x + '.'; })() + ' Balance repaid at the sale: ' + money(d.debtAtSale) + ' (' + pct(d.loan > 0 ? d.debtAtSale / d.loan : 0, 0) + ' of the loan).', ['debt.io-longer-than-term', 'debt.io-covers-term', 'debt.partial-io-no-period', 'debt.partial-io-basis'], ['acqAmort', 'repayType'], 'repayType'));
  R.push(row(F, 'Maturity and the modeled sale', safe(function(){ return window.bkPrepaySummary(s); }, ''), ['debt.term-before-hold', 'debt.sale-in-lockout'], ['debtTerm'], 'debtTerm'));
  var notes = (L.costNotes || []).map(function(n){ return typeof n === 'string' ? n : (n && n.text) || ''; }).filter(Boolean);
  R.push(row(F, 'Prepayment and exit costs', (String(s.prepayType || 'Open') + (num(s.prepayLockoutMonths) > 0 ? ', lockout ' + num(s.prepayLockoutMonths) + ' months' : '') + (notes.length ? '. ' + notes.join(' ') : '. No prepayment cost at the modeled sale.')), ['debt.sale-in-lockout'], [], 'prepayType', 'fact'));
  return R;
}

function taxRows(s, F){
  var dep = safe(function(){ return window.bkDepreciation(); }, null), at = safe(function(){ return window.bkAfterTaxV18(); }, null), R = [];
  if(!dep || !at) return [{ label:'Tax', value:'The tax picture is available once the deal can be calculated.', status:'info', rules:[], messages:[], blank:[], open:null, why:'' }];
  s = bkLoad();   /* the after-tax engine writes its default rates into the deal the first time it runs: read the deal as it is now, so the rates shown are the ones the returns used */
  var errs = (dep.errors || []).map(function(e){ return e.msg; });
  var basis = row(F, 'Depreciable basis', money(dep.depreciableBasis) + ' of ' + money(dep.purchasePrice) + ' purchase price; land ' + money(dep.landValue) + ' (' + pct(dep.landPct, 0) + ')' + (dep.capex ? '; capital items ' + money(dep.capex) : ''), ['dep.land-zero', 'dep.land-extreme'], [], 'Depreciation');
  if(errs.length){ basis.status = 'look'; basis.messages = basis.messages.concat(errs); basis.rules.push('bkDepreciation errors'); }
  R.push(basis);
  R.push(row(F, 'Recovery period', num(at.life || dep.baseLife) + ' years, ' + String((dep.settings && dep.settings.depMethod) || 'straight-line').toUpperCase() + (at.deprSource ? ' (' + at.deprSource + ')' : ''), ['dep.mid-month-on-short-life', 'dep.explicit-hy-with-q4', 'dep.placed-vs-closing', 'dep.placed-after-sale'], [], 'Depreciation'));
  var st = dep.settings || {};
  R.push(row(F, 'Cost segregation and bonus', (st.costSeg ? 'Cost segregation on' : 'Cost segregation off') + '; bonus depreciation ' + pct(dep.bonusPct || 0, 0) + (dep.bonusDeduction ? ' (' + money(dep.bonusDeduction) + ' in year 1)' : ''), ['dep.bonus-on-real-property', 'dep.bonus-elect-above-statutory', 'dep.simplified-costseg', 'tax.costseg-payback'], [], 'Depreciation', 'fact'));
  var rates = [['taxRate', 'ordinary ' + pct(s.taxRate, 1)], ['depRecaptureRate', 'recapture ' + pct(s.depRecaptureRate, 1)], ['capGainsRate', 'capital gains ' + pct(s.capGainsRate, 1)]], blankRates = [];
  var tr = row(F, 'Tax rates', rates.map(function(r){ return r[1]; }).join(', '), ['tax.rate-order', 'tax.rate-percent-typo'], [], 'taxRate');
  if(blankRates.length && tr.status === 'ok'){ tr.status = 'missing'; tr.blank = blankRates.map(function(r){ return r[0]; }); tr.value += '. Not entered: ' + blankRates.map(function(r){ return r[0] === 'taxRate' ? 'ordinary rate' : r[0] === 'depRecaptureRate' ? 'recapture rate' : 'capital gains rate'; }).join(', ') + '.'; }
  var prov = safe(function(){ return window.bkTaxRatesProvisional(s); }, []);
  if(prov.length){ tr.status = 'look'; tr.blank = []; tr.rules.push('Expected input: unconfirmed'); tr.messages.push('The ' + prov.map(function(k){ return window.BK_TAX_RATES[k].label.toLowerCase(); }).join(', ') + ' ' + (prov.length === 1 ? 'is' : 'are') + ' the model\'s default' + (prov.length === 1 ? '' : 's') + ', not confirmed by you, so the after-tax figures are provisional.'); tr.why = window.BK_TAX_RATES_CAUTION; }
  R.push(tr);
  R.push(row(F, 'What tax does to the return', 'Levered IRR ' + pct(at.preTaxIRR) + ' before tax, ' + pct(at.atIRR) + ' after tax. Tax at the sale ' + money(at.saleTax) + ' (recapture ' + money(at.recaptureTax) + ', capital gains ' + money(at.capGainTax) + '); accumulated depreciation ' + money(at.accumDepr), [], [], 'After-Tax', 'fact'));
  R.push(row(F, 'Losses', at.lossCFAtSale > 0 ? money(at.lossUsedAtSale) + ' of ' + money(at.lossCFAtSale) + ' of losses carried to the sale are used' : 'No losses carried to the sale.', ['tax.losses-usable'], [], 'After-Tax', 'fact'));
  return R;
}

/* the two lenses, as data: { title, rows:[{ label, value, status, rules, messages, blank, open, why }] } */
/* the engines are read inside bkRunWith (a copy of the deal): some of them write their defaults into the deal the first time they run (the after-tax rates), and a review must never change the deal */
window.bkLens = function(name, s){ s = s || bkLoad(); var rows = safe(function(){ return window.bkRunWith({}, function(){ var F = firing(), c = window.bkLoad(); return name === 'debt' ? debtRows(c, F) : taxRows(c, F); }); }, []);
  return { name:name, title:name === 'debt' ? 'Debt' : 'Tax', rows:rows }; };
var CHIP = { ok:['pass', 'Nothing flagged'], look:['warn', 'Look at this'], missing:['fail', 'Missing'], info:['', 'For reference'] };
function openBtn(r){ return r.open ? (/^[A-Z]/.test(r.open) && typeof RENDERERS !== 'undefined' && RENDERERS[r.open] ? '<button type="button" class="bk-btn" onclick="bkGuideDetail(\'' + esc(r.open) + '\')">Open</button>' : '<button type="button" class="bk-btn" onclick="bkGuideField(\'' + esc(r.open) + '\')">Open</button>') : ''; }
window.bkLensHtml = function(s){ s = s || bkLoad(); var h = ''; ['debt', 'tax'].forEach(function(n){ var L = window.bkLens(n, s), look = L.rows.filter(function(r){ return r.status === 'look' || r.status === 'missing'; }).length;
  h += '<details class="bk-rv-lens" data-lens="' + n + '"' + (look ? ' open' : '') + '><summary><b>' + L.title + '</b> <span class="status-chip ' + (look ? 'warn' : 'pass') + '">' + (look ? look + ' to look at' : 'nothing flagged') + '</span></summary>'
    + L.rows.map(function(r){ var c = CHIP[r.status]; return '<div class="bk-rv-i bk-rv-l' + r.status + '"><div><b>' + esc(r.label) + '</b><small>' + esc(r.value) + '</small>'
      + (r.messages.length ? '<small class="bk-rv-flag">' + r.messages.map(esc).join(' ') + (r.why ? ' ' + esc(r.why) : '') + '</small>' : '') + (r.blank.length ? '<small class="bk-rv-flag">Not entered: ' + r.blank.map(function(k){ var f = window.BKReg.field(k); return esc(f ? String(f.label).replace(/,.*$/, '') : k); }).join(', ') + '.</small>' : '')
      + (r.rules.length ? '<small class="bk-rv-why">From: ' + r.rules.map(esc).join(', ') + '</small>' : '') + '</div><div class="bk-rv-act"><span class="status-chip ' + c[0] + '">' + c[1] + '</span>' + openBtn(r) + '</div></div>'; }).join('') + '</details>'; });
  return '<div class="bk-rv-sec"><b>Debt and tax</b><small>Each row is a figure the model already calculates and the Model Checks that speak to it. Nothing here is a rule of the guide\'s own.</small>' + h + '</div>'; };
})();
