/* DEBT STRUCTURE. The acquisition loan's inputs in four groups, each answering one question:
     01 Loan type                  what kind of loan it is (and how the kinds relate: an acquisition loan can be a bridge loan, an agency loan is permanent financing)
     02 Interest rate structure    Fixed rate, Fixed rate (SOFR-based), or SOFR + spread (floating), with the benchmark, its source and date, floor, cap and conventions
     03 Repayment and loan terms   how principal is repaid, the term, recourse, prepayment, fees and extensions
     04 Underwriting and covenants what the lender sizes and tests the loan on
   The loan type is a description with typical terms: it fills nothing on its own and never changes the calculation. The one debt engine (src/047,
   bkDebt / bkDebtLifecycleCore) calculates every loan, so the acquisition model, DCF, financing comparison, refinance analysis and reports read the same loan.
   The benchmark: the latest published SOFR (overnight) and the 30, 90 and 180-day SOFR averages come from the Federal Reserve Bank of New York's public
   rates API, read in the browser. Term SOFR (1, 3 and 6-month) is published by CME under licence and is not available free: it is entered by hand.
   Whatever the rate, its source, effective date and whether it was typed over the published figure are recorded on the deal. */
(function(){
'use strict';
function esc(x){ return String(x == null ? '' : x).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
function pct(v, d){ return (num(v) * 100).toFixed(d == null ? 2 : d) + '%'; }
function load(){ try { return bkLoad() || {}; } catch(e){ return {}; } }

/* ---------- 01 loan types ---------- */
/* kind: 'purpose' (what the money is for) or 'product' (who lends it and on what terms). A loan has one of each in practice; the list is one menu because
   people name loans either way. 'often' lists the other names the same loan commonly also carries. typ: typical terms, offered as suggestions only. */
var LOAN_TYPES = [
  ['Permanent / Term', 'product', 'Long-term financing on a stabilized property.', ['Acquisition', 'Refinance', 'Agency', 'CMBS', 'Life Company', 'Bank / Credit Union'],
    { debtRateType:'Fixed', repayType:'Interest only then amortizing', acqAmort:30, debtTerm:10, acqIO:2, recourse:'Non-recourse', prepayType:'Step-down', prepaySteps:'5,4,3,2,1', acqDSCR:1.25, acqLTV:0.70, acqOrigFee:0.01 }],
  ['Acquisition', 'purpose', 'Financing the purchase of a property.', ['Bridge', 'Bank / Credit Union', 'Agency', 'CMBS', 'Permanent / Term'],
    { repayType:'Balloon', acqAmort:30, debtTerm:5, acqDSCR:1.25, acqLTV:0.65, acqOrigFee:0.01 }],
  ['Refinance', 'purpose', 'Replacing existing debt on a property you own.', ['Permanent / Term', 'Agency', 'CMBS', 'Bank / Credit Union'],
    { repayType:'Balloon', acqAmort:30, debtTerm:10, acqDSCR:1.25, acqLTV:0.65 }],
  ['Cash-Out Refinance', 'purpose', 'Refinancing for more than the existing debt and taking equity out.', ['Permanent / Term', 'Agency', 'Bank / Credit Union'],
    { repayType:'Balloon', acqAmort:30, debtTerm:10, acqDSCR:1.30, acqLTV:0.65 }],
  ['Bridge', 'product', 'Short-term transitional financing while a property is leased up or repositioned.', ['Acquisition', 'Refinance', 'Renovation / Rehabilitation'],
    { debtRateType:'Floating', debtIndexName:'SOFR', debtIndexTenor:'1-month Term SOFR', debtSpread:0.035, repayType:'Interest only', debtTerm:3, debtExtCount:2, debtExtMonths:12, debtExtFeePct:0.0025, recourse:'Limited / carve-out guaranty', prepayType:'Open', debtExitFeePct:0.005, debtDayCount:'Actual/360', debtResetMonths:1, acqLTV:0.75, acqOrigFee:0.01 }],
  ['Construction', 'purpose', 'Ground-up development. Use a Development Analysis: it draws the loan with the budget and capitalizes interest.', ['Construction-to-Permanent', 'Bank / Credit Union'],
    { debtRateType:'Floating', debtIndexName:'SOFR', debtSpread:0.035, repayType:'Interest only', debtTerm:3, recourse:'Full recourse', debtDayCount:'Actual/360' }],
  ['Renovation / Rehabilitation', 'purpose', 'Capital improvements and repositioning, often with future funding for the work.', ['Bridge', 'Bank / Credit Union', 'Hard Money'],
    { debtRateType:'Floating', debtIndexName:'SOFR', debtSpread:0.0375, repayType:'Interest only', debtTerm:3, recourse:'Limited / carve-out guaranty', debtDayCount:'Actual/360' }],
  ['Construction-to-Permanent', 'product', 'One loan that funds construction and then converts to permanent debt.', ['Construction', 'Permanent / Term', 'Bank / Credit Union'],
    { repayType:'Interest only then amortizing', acqIO:3, acqAmort:30, debtTerm:10, recourse:'Full recourse' }],
  ['Agency', 'product', 'Fannie Mae or Freddie Mac multifamily lending: permanent, usually fixed and non-recourse.', ['Permanent / Term', 'Acquisition', 'Refinance', 'Cash-Out Refinance'],
    { debtRateType:'Fixed', repayType:'Interest only then amortizing', acqIO:2, acqAmort:30, debtTerm:10, recourse:'Non-recourse', prepayType:'Yield maintenance', prepayOpenMonths:6, acqDSCR:1.25, acqLTV:0.75, acqOrigFee:0.01, debtDayCount:'Actual/360' }],
  ['CMBS', 'product', 'Commercial mortgage-backed securities: a pooled, fixed-rate, non-recourse loan, usually defeased if repaid early.', ['Permanent / Term', 'Acquisition', 'Refinance'],
    { debtRateType:'Fixed', repayType:'Balloon', acqAmort:30, debtTerm:10, recourse:'Non-recourse', prepayType:'Defeasance', prepayOpenMonths:3, acqDSCR:1.25, acqLTV:0.70, acqDebtYield:0.08, debtDayCount:'Actual/360' }],
  ['Bank / Credit Union', 'product', 'Balance-sheet lending by a bank: shorter terms, often recourse, step-down prepayment.', ['Acquisition', 'Refinance', 'Construction', 'Renovation / Rehabilitation'],
    { debtRateType:'Fixed (SOFR-based)', debtIndexName:'SOFR', debtSpread:0.0225, repayType:'Balloon', acqAmort:25, debtTerm:5, recourse:'Full recourse', prepayType:'Step-down', prepaySteps:'3,2,1', acqDSCR:1.25, acqLTV:0.65, acqOrigFee:0.0075 }],
  ['Life Company', 'product', 'Insurance-company lending: low leverage, long fixed rates, yield maintenance.', ['Permanent / Term', 'Acquisition', 'Refinance'],
    { debtRateType:'Fixed', repayType:'Balloon', acqAmort:30, debtTerm:15, recourse:'Non-recourse', prepayType:'Yield maintenance', acqDSCR:1.35, acqLTV:0.60, acqOrigFee:0.005 }],
  ['SBA', 'product', 'Small Business Administration lending for owner-occupied commercial property.', ['Acquisition', 'Refinance'],
    { debtRateType:'Fixed', repayType:'Fully amortizing', acqAmort:25, debtTerm:25, recourse:'Full recourse', prepayType:'Step-down', prepaySteps:'5,3,1', acqDSCR:1.15, acqLTV:0.85 }],
  ['Hard Money', 'product', 'Short-term, asset-based financing at a high rate, priced on the property rather than the borrower.', ['Acquisition', 'Renovation / Rehabilitation', 'Bridge'],
    { debtRateType:'Fixed', acqRate:0.11, repayType:'Interest only', debtTerm:1, recourse:'Full recourse', prepayType:'Open', acqLTV:0.65, acqOrigFee:0.02 }]
];
var LT = {}; LOAN_TYPES.forEach(function(t){ LT[t[0]] = { name:t[0], kind:t[1], what:t[2], often:t[3], typ:t[4] }; });
window.BK_LOAN_TYPES = LT;
/* LOAN PURPOSE and LENDER TYPE are two different questions (a bank can lend to acquire or to build; an acquisition can be financed by a bank, an agency or a debt fund), so they are two fields:
     loanPurpose   what the money is for and how it is structured: acquisition, refinance, construction, bridge, permanent ...
     lenderType    who lends it: bank, credit union, agency, CMBS conduit, life company, debt fund, SBA, private lender, seller financing
   A deal saved with the earlier single "Loan type" is read through LEGACY (loanType never changed a calculation, so reading it as the two new fields changes none). The terms each suggests are starting
   points only: the purpose supplies the structure (repayment, term, extensions), the lender supplies the lender's usual terms (rate, prepayment, recourse, coverage and leverage limits, fee). */
var PURPOSES = ['Acquisition', 'Refinance', 'Cash-Out Refinance', 'Bridge', 'Permanent / Term', 'Construction', 'Construction-to-Permanent', 'Renovation / Rehabilitation'];
var LENDERS = ['Bank', 'Credit union', 'Agency (Fannie Mae / Freddie Mac)', 'CMBS conduit', 'Life company', 'Debt fund', 'SBA', 'Private lender / hard money', 'Seller financing'];
var LEGACY = { 'Permanent / Term':['Permanent / Term', ''], 'Acquisition':['Acquisition', ''], 'Refinance':['Refinance', ''], 'Cash-Out Refinance':['Cash-Out Refinance', ''], 'Bridge':['Bridge', ''], 'Construction':['Construction', ''],
  'Renovation / Rehabilitation':['Renovation / Rehabilitation', ''], 'Construction-to-Permanent':['Construction-to-Permanent', ''], 'Agency':['', 'Agency (Fannie Mae / Freddie Mac)'], 'CMBS':['', 'CMBS conduit'], 'Bank / Credit Union':['', 'Bank'],
  'Life Company':['', 'Life company'], 'SBA':['', 'SBA'], 'Hard Money':['', 'Private lender / hard money'] };
var LENDER_LEGACY_TYP = { 'Bank':'Bank / Credit Union', 'Credit union':'Bank / Credit Union', 'Agency (Fannie Mae / Freddie Mac)':'Agency', 'CMBS conduit':'CMBS', 'Life company':'Life Company', 'SBA':'SBA', 'Private lender / hard money':'Hard Money' };
/* only a rate type and the usual shape: no rate, spread or fee is suggested for these two */
var LENDER_NEW_TYP = { 'Debt fund':{ debtRateType:'Floating', debtIndexName:'SOFR', recourse:'Limited / carve-out guaranty' }, 'Seller financing':{ debtRateType:'Fixed', repayType:'Balloon', prepayType:'Open' } };
var LENDER_KEYS = { debtRateType:1, debtIndexName:1, debtIndexTenor:1, debtSpread:1, recourse:1, prepayType:1, prepaySteps:1, prepayOpenMonths:1, acqDSCR:1, acqLTV:1, acqOrigFee:1, acqDebtYield:1, debtDayCount:1, debtResetMonths:1, acqRate:1 };
function legacyOf(s){ return LEGACY[String((s || {}).loanType || '')] || ['', '']; }
window.bkLoanPurpose = function(s){ s = s || {}; var v = String(s.loanPurpose || ''); return v ? v : (s.lenderType ? '' : legacyOf(s)[0]); };
window.bkLenderType = function(s){ s = s || {}; var v = String(s.lenderType || ''); return v ? v : (s.loanPurpose ? '' : legacyOf(s)[1]); };
function typicalSets(s){ var pn = window.bkLoanPurpose(s), ln = window.bkLenderType(s), P = pn && LT[pn] ? LT[pn].typ : null, L = ln ? (LENDER_NEW_TYP[ln] || (LT[LENDER_LEGACY_TYP[ln]] ? LT[LENDER_LEGACY_TYP[ln]].typ : null)) : null; return { purpose:pn, lender:ln, P:P, L:L }; }
/* the suggested value for one term: the lender's for the lender's own terms, the purpose's for the structure; whichever is chosen supplies what the other does not */
window.bkLoanTypeTypical = function(s, k){ var x = typicalSets(s), a = x.L && x.L[k] !== undefined ? x.L[k] : undefined, b = x.P && x.P[k] !== undefined ? x.P[k] : undefined; return LENDER_KEYS[k] ? (a !== undefined ? a : b) : (b !== undefined ? b : a); };
function typicalAll(s){ var x = typicalSets(s), keys = {}; [x.P, x.L].forEach(function(o){ if(o) Object.keys(o).forEach(function(k){ keys[k] = 1; }); }); var out = {}; Object.keys(keys).forEach(function(k){ out[k] = window.bkLoanTypeTypical(s, k); }); return out; }
window.bkLoanLabel = function(s){ var p = window.bkLoanPurpose(s), l = window.bkLenderType(s); return p && l ? p + ' loan, ' + l : p ? p + ' loan' : l ? l + ' loan' : ''; };
/* a deal saved with the single Loan type is given the two new fields once, from the same words; no calculation reads either */
function migrateLoan(s){ if(s && s.loanType && !s.loanPurpose && !s.lenderType && LEGACY[s.loanType]){ var x = LEGACY[s.loanType]; s.loanPurpose = x[0]; s.lenderType = x[1]; try { bkSave(s); } catch(e){} } return s; }

var RATE_TYPES = [['Fixed', 'Fixed rate'], ['Fixed (SOFR-based)', 'Fixed rate (SOFR-based)'], ['Floating', 'Floating: index + spread']];
var TENORS = ['Overnight SOFR', '30-day SOFR average', '90-day SOFR average', '180-day SOFR average', '1-month Term SOFR', '3-month Term SOFR', '6-month Term SOFR'];
var REPAY = ['Fully amortizing', 'Interest only', 'Partial interest only', 'Interest only then amortizing', 'Balloon'];
var RECOURSE = ['Full recourse', 'Non-recourse', 'Limited / carve-out guaranty'];
var PREPAY = ['Open', 'Fixed prepayment penalty', 'Step-down', 'Yield maintenance', 'Defeasance', 'Custom'];
function rateType(s){ var t = String(s.debtRateType || ''); return t === 'Floating' ? 'Floating' : t === 'Fixed (SOFR-based)' ? 'Fixed (SOFR-based)' : 'Fixed'; }
window.bkRateType = rateType;

/* ---------- 02 the benchmark: published figures, the rate for each month ---------- */
var CACHE = 'bk.sofr.v1';
function cached(){ try { var c = JSON.parse(localStorage.getItem(CACHE) || 'null'); return c && c.rate > 0 ? c : null; } catch(e){ return null; } }
window.bkSofrLatest = function(){ return window.__bkSofr || cached(); };
/* the published figure for a tenor, or null when it is not published free (Term SOFR) or not fetched yet */
window.bkSofrFor = function(tenor){ var p = window.bkSofrLatest(); if(!p) return null; var t = String(tenor || 'Overnight SOFR');
  var v = t === 'Overnight SOFR' ? p.rate : t === '30-day SOFR average' ? p.avg30 : t === '90-day SOFR average' ? p.avg90 : t === '180-day SOFR average' ? p.avg180 : null;
  return v > 0 ? { rate:v, date:t === 'Overnight SOFR' ? p.date : (p.avgDate || p.date), source:'Federal Reserve Bank of New York (' + t + ')', fetched:p.fetched } : null; };
var inflight = null;
window.bkSofrFetch = function(force){
  var c = window.bkSofrLatest(); if(!force && c && c.fetched && Date.now() - c.fetched < 6 * 3600 * 1000) return Promise.resolve(c);
  if(inflight) return inflight;
  var base = 'https://markets.newyorkfed.org/api/rates/secured/';
  function get(u){ return fetch(u, { cache:'no-store' }).then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  inflight = get(base + 'sofr/last/1.json').then(function(j){ var x = (j.refRates || [])[0]; if(!x || !(Number(x.percentRate) > 0)) throw new Error('no rate in the response');
      var out = { rate:Number(x.percentRate) / 100, date:String(x.effectiveDate || ''), fetched:Date.now() };
      return get(base + 'sofrai/last/1.json').then(function(j2){ var a = (j2.refRates || [])[0] || {}; out.avg30 = Number(a.average30day) / 100 || null; out.avg90 = Number(a.average90day) / 100 || null; out.avg180 = Number(a.average180day) / 100 || null; out.avgDate = String(a.effectiveDate || ''); return out; }, function(){ return out; }); })
    .then(function(out){ window.__bkSofr = out; try { localStorage.setItem(CACHE, JSON.stringify(out)); } catch(e){} inflight = null; return out; },
      function(err){ inflight = null; window.__bkSofrErr = String(err && err.message || err); throw err; });
  return inflight;
};
/* use the published figure for the deal's benchmark: the rate, its source and date are recorded and the override flag cleared */
window.bkSofrApply = function(){ var s = load(), p = window.bkSofrFor(s.debtIndexTenor);
  if(!p){ window.bkSofrFetch(true).then(function(){ var q = window.bkSofrFor(load().debtIndexTenor); if(q) window.bkSofrApply(); else refresh(); }, function(){ refresh(); }); return; }
  s.debtIndexRate = Math.round(p.rate * 1e6) / 1e6; s.debtIndexSource = p.source; s.debtIndexDate = p.date; s._idxPublished = s.debtIndexRate; s.debtIndexOverride = 0;
  bkSave(s); refresh(); };
/* re-draw only a page that shows the loan inputs: never the guide, whose answers in progress would be lost (it re-draws its own step) */
function refresh(){ try { if(typeof showSheet === 'function' && typeof currentSheet !== 'undefined' && /^(Deal Underwrite|Debt|Debt Schedule)$/.test(currentSheet) && !document.querySelector('#viewport .gd')) showSheet(currentSheet); } catch(e){} }
/* a benchmark typed over the published figure is recorded as a manual override, with the date it was entered; the published figure stays on record */
var _save = window.bkSave;
if(typeof _save === 'function' && !_save.__bkDebtStructure){
  var hooked = function(s){ try { if(s && s.debtIndexRate !== undefined && s.debtIndexRate !== null && s.debtIndexRate !== ''){ var v = Number(s.debtIndexRate);
        if(isFinite(v) && s._idxPublished != null && Math.abs(v - Number(s._idxPublished)) > 1e-9 && !Number(s.debtIndexOverride)){ s.debtIndexOverride = 1; s.debtIndexOverrideOn = new Date().toISOString().slice(0, 10); }
        else if(isFinite(v) && s._idxPublished == null && !s.debtIndexSource){ s.debtIndexSource = 'Entered by user'; s.debtIndexDate = s.debtIndexDate || new Date().toISOString().slice(0, 10); } }
      /* Fixed rate (SOFR-based): the coupon is the benchmark at the lock plus the spread (never below the floor), kept in the fixed-rate field every page reads */
      if(s && rateType(s) === 'Fixed (SOFR-based)' && num(s.debtIndexRate) > 0 && s.debtSpread !== undefined && s.debtSpread !== ''){ s.acqRate = Math.round(Math.max(num(s.debtIndexRate) + num(s.debtSpread), num(s.debtFloor)) * 1e6) / 1e6; }
    } catch(e){}
    /* the history layer (src/146) puts its own wrapper back after each save; this hook stays outermost so every save passes through it */
    try { return _save.apply(this, arguments); } finally { if(window.bkSave !== hooked && window.bkSave === _save){ window.bkSave = hooked; try { bkSave = hooked; } catch(e){} } } };
  hooked.__bkDebtStructure = true; window.bkSave = hooked;
}
/* the index for a month: the saved annual curve where a year is entered, otherwise today's benchmark moved by the rate outlook (bps a year);
   a SOFR floor and a purchased cap (its strike) bound it. The reset frequency holds each rate for its reset period. */
function idxYear(s, y){ var v = s['debtIndexY' + y]; if(v !== null && v !== undefined && v !== '' && isFinite(Number(v))) return Math.max(0, Number(v));
  return Math.max(0, num(s.debtIndexRate) + num(s.debtIndexDrift) * (y - 1)); }
window.bkDebtIndexForMonth = function(s, m){ var R = Math.max(1, Math.round(num(s.debtResetMonths)) || 1), m0 = Math.floor((Math.max(1, m) - 1) / R) * R + 1, y = Math.min(10, Math.max(1, Math.ceil(m0 / 12)));
  var idx = idxYear(s, y); if(num(s.debtIndexFloor) > 0) idx = Math.max(idx, num(s.debtIndexFloor)); return idx; };
window.bkDebtRateForMonth = function(s, m){
  if(String(s.debtRateType || 'Fixed') !== 'Floating') return Math.max(0, num(s.acqRate));
  if(s.debtIndexRate === undefined || s.debtIndexRate === null || s.debtIndexRate === '') return Math.max(0, num(s.acqRate));   /* no index entered yet: the loan keeps its last rate rather than pricing at the spread alone */
  var idx = window.bkDebtIndexForMonth(s, m), strike = Math.max(0, num(s.rateCapStrike)); if(strike > 0) idx = Math.min(idx, strike);
  var r = Math.max(idx + Math.max(0, num(s.debtSpread)), Math.max(0, num(s.debtFloor))), cap = Math.max(0, num(s.debtCap)); if(cap > 0) r = Math.min(r, cap); return r; };

/* ---------- the all-in rate, explained ---------- */
window.bkAllInRate = function(s){ s = s || load(); var t = rateType(s), out = { type:t };
  if(t === 'Fixed'){ out.rate = num(s.acqRate); return out; }
  out.index = num(s.debtIndexRate); out.spread = num(s.debtSpread); out.floor = num(s.debtFloor); out.idxFloor = num(s.debtIndexFloor); out.strike = num(s.rateCapStrike);
  var idx = out.index; if(out.idxFloor > 0) idx = Math.max(idx, out.idxFloor); if(t === 'Floating' && out.strike > 0) idx = Math.min(idx, out.strike);
  out.rate = Math.max(idx + out.spread, out.floor); out.source = s.debtIndexSource || ''; out.date = s.debtIndexDate || ''; out.override = !!Number(s.debtIndexOverride); out.published = s._idxPublished;
  out.tenor = s.debtIndexTenor || 'Overnight SOFR'; out.indexName = s.debtIndexName || 'SOFR'; return out; };
/* The benchmark is one rate on one date. When the loan closes on a different date, say so (no number changes): a fixed coupon is set at the lock, a floating loan starts from this index. */
/* how far the benchmark's effective date is from the closing (days; positive = the benchmark is older). One definition: the rate card and the deal review's debt lens both read it. */
window.bkIndexDateGap = function(s){ s = s || load(); var a = window.bkAllInRate(s); if(!a || a.type === 'Fixed') return null; var c = Date.parse(String(s.closing || '').slice(0, 10)), e = Date.parse(String(a.date || '').slice(0, 10)); if(!isFinite(c) || !isFinite(e)) return null;
  var d = Math.round((c - e) / 86400000); return { days:d, stale:Math.abs(d) > 30, date:a.date, closing:String(s.closing).slice(0, 10), index:a.indexName === 'SOFR' ? a.tenor : a.indexName }; };
function staleNote(s, a, lock){ var g = window.bkIndexDateGap(s); if(!g || !g.stale) return ''; var d = g.days;
  return '<div class="bk-ds-n bk-ds-warn">The ' + esc(a.indexName === 'SOFR' ? a.tenor : a.indexName) + ' shown is effective ' + esc(a.date) + ', ' + Math.abs(d) + ' days ' + (d > 0 ? 'before' : 'after') + ' the closing on ' + esc(String(s.closing).slice(0, 10)) + '. The loan is priced from this rate'
    + (lock ? ' as the benchmark at the lock' : ' at the start, then moved by the rate outlook') + '. Enter the rate expected on the closing or lock date, or the lender\'s quote.</div>'; }
function allInCard(s){ var a = window.bkAllInRate(s); if(a.type === 'Fixed') return '';
  var name = a.indexName === 'SOFR' ? a.tenor : a.indexName, p = a.indexName === 'SOFR' ? window.bkSofrFor(a.tenor) : null;
  var prov = a.override ? 'Manual override, entered ' + esc(s.debtIndexOverrideOn || '') + (a.published != null ? ' (the published figure was ' + pct(a.published) + ')' : '') + '.'
    : a.source ? esc(a.source) + (a.date ? ', effective ' + esc(a.date) : '') + '.' : 'Not sourced yet: enter the rate or use the latest published figure.';
  var live = p ? '<div class="bk-ds-pub">Latest published ' + esc(a.tenor) + ': <b>' + pct(p.rate) + '</b>, effective ' + esc(p.date) + ' (New York Fed). ' + (Math.abs(p.rate - a.index) > 1e-9 ? '<button type="button" class="bk-btn" onclick="bkSofrApply()">Use the latest</button>' : '<span class="bk-ds-ok">In use.</span>') + '</div>'
    : (a.indexName === 'SOFR' ? (/Term SOFR/.test(a.tenor) ? '<div class="bk-ds-pub">Term SOFR is published by CME under licence and is not available free: enter it from your lender\'s quote or a licensed source. The New York Fed\'s 30, 90 and 180-day SOFR averages are free alternatives.</div>'
      : '<div class="bk-ds-pub">' + (window.__bkSofrErr ? 'The New York Fed rates could not be reached from this browser (' + esc(window.__bkSofrErr) + '). Enter the rate by hand. ' : '') + '<button type="button" class="bk-btn" onclick="bkSofrApply()">Get the latest published SOFR</button></div>') : '');
  var lock = a.type === 'Fixed (SOFR-based)';
  return '<div class="bk-ds-card"><div class="bk-ds-h">' + esc(name) + ' + spread' + (lock ? ', locked at closing' : '') + '</div>'
    + '<div class="bk-ds-sum"><div><span>' + esc(lock ? name + ' at the lock' : 'Current ' + name) + '</span><b>' + pct(a.index) + '</b></div><div><span>Lender spread</span><b>+ ' + pct(a.spread) + '</b></div><div class="t"><span>' + (lock ? 'Fixed coupon' : 'All-in rate today') + '</span><b>' + pct(a.rate) + '</b></div></div>'
    + (a.idxFloor > 0 && a.index < a.idxFloor ? '<div class="bk-ds-n">The ' + esc(a.indexName) + ' floor of ' + pct(a.idxFloor) + ' applies.</div>' : '') + (a.floor > 0 && a.index + a.spread < a.floor ? '<div class="bk-ds-n">The coupon floor of ' + pct(a.floor) + ' applies.</div>' : '')
    + '<div class="bk-ds-n">Source: ' + prov + '</div>' + live
    + staleNote(s, a, lock)
    + (lock ? '<div class="bk-ds-n">The coupon is fixed for the term at the benchmark on the lock date plus the spread: later moves in SOFR do not change it.</div>'
      : '<div class="bk-ds-n">Later months do not use today\'s rate: each reset (every ' + (Math.max(1, Math.round(num(s.debtResetMonths)) || 1)) + ' month' + ((Math.round(num(s.debtResetMonths)) || 1) > 1 ? 's' : '') + ') takes the index from the rate outlook' + (num(s.debtIndexDrift) ? ' (' + (num(s.debtIndexDrift) > 0 ? '+' : '') + Math.round(num(s.debtIndexDrift) * 10000) + ' bps a year)' : ' (flat unless you set one)') + ' or the annual index curve on the Debt page, which are forecasts, not published rates.</div>')
    + '</div>'; }

/* ---------- the four groups on Deal Underwrite ---------- */
function sel(label, key, opts, unit){ return bkSelect(label, key, opts.map(function(o){ return Array.isArray(o) ? o : [o, o]; }), unit || ''); }
function calcRow(label, val, unit){ return '<tr><td class="rowlabel">' + esc(label) + '</td><td class="v" data-bk-kind="calc">' + val + '</td><td style="text-align:left">' + esc(unit || '') + '</td><td><span class="status-chip">CALC</span></td></tr>'; }
function table(cap, rows, note){ rows = rows.replace(/>undefined</g, '><').replace(/>null</g, '><'); return '<div class="tbl-wrap" style="margin-top:16px;"><table class="fin bk-input-grid bk-debt-grp"><caption>' + cap + '</caption><thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + (note || ''); }
function typeNote(s){ var x = typicalSets(s), all = typicalAll(s), keys = Object.keys(all);
  if(!x.purpose && !x.lender) return '<div class="bk-ds-note">Choose the loan purpose (what the money is for) and the lender type (who lends it) to see typical terms. They are descriptions: they never change the calculation on their own.</div>';
  var blank = keys.filter(function(k){ var v = s[k]; return v === undefined || v === null || v === '' || (typeof all[k] === 'number' && !(num(v) > 0) && k !== 'acqIO'); });
  var lab = { debtRateType:'rate', debtIndexName:'index', debtIndexTenor:'benchmark', debtSpread:'spread', repayType:'repayment', acqAmort:'amortization', debtTerm:'term', acqIO:'interest-only', recourse:'recourse', prepayType:'prepayment', prepaySteps:'step-down', prepayOpenMonths:'open window', acqDSCR:'min DSCR', acqLTV:'max LTV', acqOrigFee:'origination fee', debtExtCount:'extensions', debtExtMonths:'extension length', debtExtFeePct:'extension fee', debtExitFeePct:'exit fee', debtDayCount:'day count', debtResetMonths:'reset', acqDebtYield:'debt yield', acqRate:'rate' };
  function show(k){ var v = all[k]; return /Pct$|LTV|Fee$|Spread|Yield|Rate$/.test(k) && typeof v === 'number' && v < 1 ? pct(v) : String(v) + (k === 'acqAmort' || k === 'debtTerm' || k === 'acqIO' ? ' yrs' : k === 'acqDSCR' ? 'x' : k === 'debtExtMonths' || k === 'prepayOpenMonths' ? ' mo' : k === 'debtResetMonths' ? ' mo' : ''); }
  var who = [x.purpose && LT[x.purpose] ? '<b>' + esc(x.purpose) + '</b>: ' + esc(LT[x.purpose].what) : '', x.lender ? '<b>' + esc(x.lender) + '</b>' + (LT[LENDER_LEGACY_TYP[x.lender]] ? ': ' + esc(LT[LENDER_LEGACY_TYP[x.lender]].what) : '') : ''].filter(Boolean).join(' ');
  return '<div class="bk-ds-note">' + who + ' The purpose sets the structure and the lender sets its usual terms; the same engine calculates it either way.'
    + (keys.length ? '<div class="bk-ds-typ">Typical: ' + keys.map(function(k){ return esc(lab[k] || k) + ' ' + esc(show(k)); }).join(' · ') + '. These are starting points, not a quote.</div>' : '')
    + (blank.length ? '<button type="button" class="bk-btn" onclick="bkLoanTypeFill()">Fill the ' + blank.length + ' blank term' + (blank.length > 1 ? 's' : '') + ' with these</button>' : '') + '</div>'; }
window.bkLoanTypeFill = function(){ var s = load(), all = typicalAll(s); if(!Object.keys(all).length) return; Object.keys(all).forEach(function(k){ var v = s[k]; if(v === undefined || v === null || v === '' || (typeof all[k] === 'number' && !(num(v) > 0) && k !== 'acqIO')) s[k] = all[k]; }); if(s.debtIndexName === 'SOFR' && !s.debtIndexTenor) s.debtIndexTenor = 'Overnight SOFR'; bkSave(s); refresh(); };

function groups(s){ var t = rateType(s), floating = t === 'Floating', sofrBased = t !== 'Fixed', idxName = s.debtIndexName || 'SOFR', isSofr = idxName === 'SOFR', rp = String(s.repayType || ''), pp = String(s.prepayType || '');
  s = migrateLoan(s);
  var g1 = table('Loan Purpose and Lender', sel('Loan purpose', 'loanPurpose', PURPOSES) + sel('Lender type', 'lenderType', LENDERS), typeNote(s));
  var r2 = sel('Interest rate structure', 'debtRateType', RATE_TYPES);
  if(t === 'Fixed') r2 += bkInput('Fixed rate', 'acqRate', '%', 'pct');
  else {
    if(floating) r2 += sel('Index', 'debtIndexName', ['SOFR', 'Prime', 'Treasury', 'Other']);
    if(isSofr) r2 += sel('Benchmark', 'debtIndexTenor', TENORS);
    r2 += bkInput(sofrBased && !floating ? 'Benchmark at the rate lock' : 'Current index rate', 'debtIndexRate', '%', 'pct') + bkInput('Effective date', 'debtIndexDate', 'published or quoted', 'text') + bkInput('Lender spread', 'debtSpread', '% over the index', 'pct');
    if(floating) r2 += bkInput(isSofr ? 'SOFR floor' : 'Index floor', 'debtIndexFloor', '%', 'pct') + bkInput(isSofr ? 'SOFR cap (purchased rate cap strike)' : 'Index cap (strike)', 'rateCapStrike', '%', 'pct') + bkInput('Rate cap cost', 'rateCapCost', '$', 'money')
      + sel('Reset frequency', 'debtResetMonths', [['1', 'Monthly'], ['3', 'Quarterly'], ['6', 'Semi-annual'], ['12', 'Annual']], s.debtResetMonths ? '' : 'monthly until set') + bkInput('Rate outlook', 'debtIndexDrift', '% a year (+ rising, - falling)', 'pct') + bkInput('Rate lookback / observation shift', 'debtLookbackDays', 'business days (recorded)', 'num');
    r2 += bkInput('Coupon floor (all-in)', 'debtFloor', '%', 'pct');
    r2 += calcRow(floating ? 'All-in rate today' : 'Fixed coupon', pct(window.bkAllInRate(s).rate), floating ? 'index + spread' : 'benchmark at lock + spread');
  }
  r2 += sel('Day-count convention', 'debtDayCount', ['Actual/360', '30/360', 'Actual/365'], 'Actual/360 accrues 365/360 of the rate');
  var g2 = table('Interest Rate Structure', r2, allInCard(s));
  var r3 = sel('Repayment structure', 'repayType', REPAY);
  if(rp !== 'Interest only') r3 += bkInput('Amortization', 'acqAmort', 'years' + (rp === 'Fully amortizing' && num(s.debtTerm) > 0 ? ' (the term is used)' : ''), 'num');
  if(rp === 'Partial interest only' || rp === 'Interest only then amortizing' || (!rp && num(s.acqIO) > 0)) r3 += bkInput('Interest-only period', 'acqIO', 'years', 'num');
  if(rp === 'Partial interest only') r3 += sel('After the interest-only period, amortize over', 'ioBasis', [['Stated schedule', 'The stated amortization schedule (a balloon is left at maturity)'], ['Remaining term', 'The remaining loan term (paid off at maturity)']], s.ioBasis ? '' : 'not chosen: the stated schedule is used, as before');
  if(/^(Interest only|Interest only then amortizing|Partial interest only)$/.test(rp)) r3 += calcRow('Payment schedule', esc(window.bkRepaySummary(s)), '');
  r3 += bkInput('Loan term (maturity)', 'debtTerm', 'years from closing (blank = the hold)', 'num') + sel('Recourse', 'recourse', RECOURSE) + sel('Prepayment', 'prepayType', PREPAY);
  if(pp === 'Fixed prepayment penalty' || pp === 'Custom') r3 += bkInput('Prepayment penalty', 'prepayPct', '% of the balance repaid', 'pct');
  if(pp === 'Step-down') r3 += bkInput('Step-down schedule', 'prepaySteps', '% by loan year, e.g. 5,4,3,2,1', 'text');
  if(pp === 'Yield maintenance' || pp === 'Defeasance') r3 += bkInput('Treasury yield for the calculation', 'prepayTreasury', '% (blank = the index rate, else SOFR, else 4%)', 'pct') + (pp === 'Yield maintenance' ? bkInput('Minimum premium', 'prepayPct', '% of the balance (blank = 1%)', 'pct') : bkInput('Defeasance transaction cost', 'defeaseCostPct', '% of the balance (blank = 0.5%)', 'pct'));
  r3 += bkInput('Prepayment lockout', 'prepayLockoutMonths', 'months from closing with no voluntary prepayment (blank = none)', 'num');
  if(pp && pp !== 'Open') r3 += bkInput('Open window before maturity', 'prepayOpenMonths', 'months', 'num');
  r3 += calcRow('Maturity and the modeled sale', esc(window.bkPrepaySummary(s)), '');
  r3 += bkInput('Origination fee', 'acqOrigFee', '% of the loan', 'pct') + bkInput('Commitment fee', 'debtCommitFeePct', '% of the loan, at closing', 'pct') + bkInput('Exit fee', 'debtExitFeePct', '% of the balance repaid', 'pct')
    + bkInput('Extension options', 'debtExtCount', 'number', 'num');
  if(num(s.debtExtCount) > 0) r3 += bkInput('Extension length', 'debtExtMonths', 'months each', 'num') + bkInput('Extension fee', 'debtExtFeePct', '% of the balance at each', 'pct') + bkYesNo('Model the extensions as exercised', 'debtExtUse', 'moves maturity out');
  var g3 = table('Repayment &amp; Loan Terms', r3, costNote(s));
  var r4 = bkInput('Maximum loan-to-value', 'acqLTV', '% of ' + (typeof bkLtvBasisLabel === 'function' ? bkLtvBasisLabel(s, true) : 'value'), 'pct') + bkInput('Maximum loan-to-cost', 'acqLTC', '% of total cost', 'pct') + bkInput('Lender minimum DSCR', 'acqDSCR', 'x', 'num') + bkInput('Minimum debt yield', 'acqDebtYield', '% (NOI over the loan)', 'pct') + bkInput('Loan covenants', 'debtCovenants', 'recorded on the deal', 'text');
  var g4 = table('Underwriting &amp; Covenants', r4, '<div class="bk-ds-note">The loan is the lowest of what these tests allow. Interest-rate floors and caps are set with the rate, under Interest Rate Structure.</div>');
  return '<div class="bk-debt-structure">' + g1 + g2 + g3 + g4 + '</div>'; }
function costNote(s){ var L = null; try { L = bkDebt().lifecycle; } catch(e){} if(!L || !L.costNotes || !L.costNotes.length) return '';
  return '<div class="bk-ds-note">In the cash flow: ' + L.costNotes.map(function(c){ return esc(c.kind) + ' $' + bkFmt(Math.round(c.amount)) + ' in month ' + c.m; }).join(' · ') + '.' + (L.extensionMonths ? ' Maturity is ' + Math.round(L.maturityMonth / 12 * 10) / 10 + ' years with the extensions.' : '') + '</div>'; }

/* replace the old single "Acquisition Debt" table (and the loan term row it kept elsewhere) with the four groups, in the same place */
function wrapDU(o){ try { var s = load(); if(!o || typeof o.main !== 'string' || /develop/i.test(String(s.dealType || ''))) return o;
      var m = o.main, a = m.indexOf('<caption>Acquisition Debt</caption>'); if(a < 0) return o;
      var start = m.lastIndexOf('<div class="tbl-wrap"', a), end = m.indexOf('</table></div>', a); if(start < 0 || end < 0) return o; end += '</table></div>'.length;
      var old = m.slice(start, end), fee = /<tr[^>]*data-bk-key="acqFeePct"[\s\S]*?<\/tr>/.exec(old);
      var strip = function(x){ return x.replace(/<tr[^>]*data-bk-key="debtTerm"[\s\S]*?<\/tr>/g, ''); };   /* the term lives under Repayment & Loan Terms now */
      m = strip(m.slice(0, start)) + groups(s) + strip(m.slice(end));
      if(fee){ var j = m.indexOf('<caption>JV Structure'); var e2 = j >= 0 ? m.indexOf('</tbody>', j) : -1; if(e2 >= 0) m = m.slice(0, e2) + fee[0] + m.slice(e2); else m += table('Sponsor Fee', fee[0]); }
      o.main = m; } catch(e){} return o; }
if(window.RENDERERS && typeof RENDERERS['Deal Underwrite'] === 'function' && !RENDERERS['Deal Underwrite'].__bkDebtGroups){
  var _du = RENDERERS['Deal Underwrite'], w = function(){ return wrapDU(_du.apply(this, arguments)); }; w.__bkDebtGroups = true;
  Object.keys(_du).forEach(function(k){ w[k] = _du[k]; }); RENDERERS['Deal Underwrite'] = w;
  if(typeof window.bkRegisterRenderer === 'function') try { window.bkRegisterRenderer('Deal Underwrite', w); } catch(e){}
}
/* the published SOFR is read once a session, in the background, when a SOFR-based loan is open */
setTimeout(function(){ try { var s = load(); if(rateType(s) !== 'Fixed' && (s.debtIndexName || 'SOFR') === 'SOFR') window.bkSofrFetch().then(refresh, function(){}); } catch(e){} }, 1500);

/* the payment structure in words: which months are interest only, which amortize, over how long, and what is left at maturity. Read from the same shape the engine uses (bkLoanShape) and its own first payments. */
window.bkRepaySummary = function(s){ s = s || load(); var t = String(s.repayType || ''), sh = typeof window.bkLoanShape === 'function' ? window.bkLoanShape(s) : null; if(!sh) return '';
  var term = sh.term, io = Math.min(sh.io, term), yrs = function(m){ return m % 12 === 0 ? (m / 12) + ' year' + (m === 12 ? '' : 's') : m + ' months'; };
  var d = safe(function(){ return window.bkDebt(); }, null), rows = d && d.months ? d.months : [], pay = function(i){ var r = rows[i]; return r && r.payment > 0 ? ' (' + money(r.payment) + ' a month)' : ''; };
  function safe(f, x){ try { var v = f(); return v === undefined ? x : v; } catch(e){ return x; } }
  function money(v){ return '$' + Math.round(v).toLocaleString('en-US'); }
  if(t === 'Interest only') return 'Interest only for the whole term (months 1 to ' + term + ')' + pay(0) + '; the full loan is repaid at maturity.';
  if(t !== 'Interest only then amortizing' && t !== 'Partial interest only') return '';
  if(!(sh.io > 0)) return 'No interest-only period entered: the loan amortizes from month 1.';
  if(sh.io >= term) return 'Interest only for ' + yrs(io) + ' (months 1 to ' + term + '), which is the whole term: nothing amortizes before maturity.';
  var amEnd = sh.io + sh.amort, tail = amEnd > term ? 'a balloon is left at maturity (month ' + term + ')' : 'paid off by month ' + amEnd;
  return 'Interest only for ' + yrs(io) + ' (months 1 to ' + io + ')' + pay(0) + ', then amortizing over ' + yrs(sh.amort) + ' from month ' + (io + 1) + pay(io) + '; ' + tail + '.'; };
/* contractual maturity, the modeled sale and the lockout, in words. The loan's maturity is its term (and any extensions); the sale is the end of the hold. They are different dates, and a sale before maturity is not free: the
   loan is prepaid on its prepayment terms, or assumed by the buyer, and during a lockout it cannot be prepaid at all. */
/* the last day of the lockout: the closing date plus the lockout months, less a day, or the month number when there is no closing date */
window.bkLockoutExpiry = function(s){ s = s || load(); var lock = Math.max(0, Math.round(num(s.prepayLockoutMonths))), c = typeof bkParseDealDate === 'function' ? bkParseDealDate(s.closing, null) : null; if(!c) return 'the end of month ' + lock + ' from closing';
  var d = new Date(c.getFullYear(), c.getMonth() + lock, c.getDate() - 1); return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }); };
/* the early-payoff cost is priced only from the loan's contractual terms. When the terms it needs are not entered, the model counts no cost or falls back to a default: say which, so it is never mistaken for the loan's actual provision. */
window.bkPrepayTermsGap = function(s){ s = s || load(); if(s.debtEnabled === false) return null; var t = String(s.prepayType || 'Open'); if(t === 'Open') return null;
  if(/^(Fixed prepayment penalty|Custom)$/.test(t) && !(num(s.prepayPct) > 0)) return { type:t, what:'the penalty percentage', effect:'The exit cost is counted as zero.' };
  if(t === 'Step-down'){ var st = String(s.prepaySteps || '').split(/[^0-9.]+/).filter(Boolean); if(!st.length) return { type:t, what:'the step-down schedule', effect:'The exit cost is counted as zero.' }; }
  if(/^(Yield maintenance|Defeasance)$/.test(t) && !(num(s.prepayTreasury) > 0)) return { type:t, what:'the Treasury yield for the calculation', effect:'The model falls back to the index rate, else the published SOFR, else 4%: not the loan\'s own terms.' };
  return null; };
window.bkPrepaySummary = function(s){ s = s || load(); if(s.debtEnabled === false) return 'Debt is switched off.'; var hold = Math.max(1, Math.round(num(s.holdYears) * 12)), mat = typeof window.bkLoanMaturityMonths === 'function' ? window.bkLoanMaturityMonths(s) : 0, lock = Math.max(0, Math.round(num(s.prepayLockoutMonths))), t = String(s.prepayType || 'Open');
  if(!mat) return '';
  var out = 'The loan matures in month ' + mat + '; the modeled sale is in month ' + hold + '.';
  if(hold >= mat) return out + ' The loan is repaid at maturity, so no prepayment terms apply.';
  if(lock > 0 && hold <= lock) return out + ' The sale falls inside the lockout (months 1 to ' + lock + ', through ' + window.bkLockoutExpiry(s) + '): the loan may not be prepayable then, or only with the lender\'s consent. The model does not price that; review the loan documents.';
  return out + ' The loan is repaid early' + (lock > 0 ? ', after the lockout ended in month ' + lock : '') + ': ' + (t === 'Open' ? 'prepayment is open, so there is no premium.' : t === 'Yield maintenance' ? 'yield maintenance applies.' : t === 'Defeasance' ? 'defeasance applies.' : t === 'Step-down' ? 'the step-down penalty for that year applies.' : 'the prepayment penalty applies.'); };
/* checks that the payment structure is complete and fits the term */
if(typeof window.bkAddConflictRule === 'function'){
  window.bkAddConflictRule('debt.partial-io-no-period', 'WARN', 'Debt', 'Debt', function(s){ if(String(s.repayType || '') === 'Partial interest only' && !(num(s.acqIO) > 0) && s.debtEnabled !== false) return { msg:'Partial interest only is chosen but no interest-only period is entered.', why:'The loan amortizes from month 1, as if it were not interest only. Enter how long the interest-only period lasts.' }; });
  window.bkAddConflictRule('debt.io-covers-term', 'WARN', 'Debt', 'Debt', function(s){ var t = String(s.repayType || ''); if((t === 'Partial interest only' || t === 'Interest only then amortizing') && num(s.acqIO) > 0 && s.debtEnabled !== false){ var sh = typeof window.bkLoanShape === 'function' ? window.bkLoanShape(s) : null; if(sh && sh.io >= sh.term) return { msg:'The interest-only period (' + num(s.acqIO) + ' years) is as long as the loan term (' + sh.term / 12 + ' years).', why:'Nothing amortizes before maturity, so this is an interest-only loan. Shorten the interest-only period or lengthen the term.' }; } });
  window.bkAddConflictRule('debt.sale-in-lockout', 'ERROR', 'Debt', 'Debt', function(s){ var lock = Math.max(0, Math.round(num(s.prepayLockoutMonths))); if(s.debtEnabled === false || !(lock > 0) || typeof window.bkLoanMaturityMonths !== 'function') return; var hold = Math.max(1, Math.round(num(s.holdYears) * 12)), mat = window.bkLoanMaturityMonths(s);
    if(hold < mat && hold <= lock) return { msg:'The modeled sale (month ' + hold + ') falls inside the loan\'s prepayment lockout (months 1 to ' + lock + ', through ' + window.bkLockoutExpiry(s) + ').', why:'A lockout generally means the loan cannot be prepaid during the period, so the sale may be prohibited or restricted: it may need the lender\'s consent, a buyer assuming the loan, or a negotiated payoff. Paying a fee does not by itself make a locked-out prepayment permissible, and the model does not price that. Review the actual loan documents for the lockout and what they allow, then move the sale, shorten the lockout, or model the assumption or payoff.' }; });
  window.bkAddConflictRule('debt.refi-in-lockout', 'ERROR', 'Debt', 'Refi / Recap', function(s){ var lock = Math.max(0, Math.round(num(s.prepayLockoutMonths))); if(s.debtEnabled === false || !(lock > 0) || !s._refi || typeof window.bkRefiInputs !== 'function') return; var i = window.bkRefiInputs(), m = Math.round(num(i && i.year) * 12);
    if(m > 0 && m <= lock) return { msg:'The modeled refinance (month ' + m + ') falls inside the existing loan\'s prepayment lockout (months 1 to ' + lock + ', through ' + window.bkLockoutExpiry(s) + ').', why:'A refinance repays the existing loan, and a lockout generally means it cannot be prepaid during the period, so the refinance may be prohibited or restricted. Paying a fee does not by itself make a locked-out prepayment permissible, and the model does not price that. Review the actual loan documents, then move the refinance to after the lockout or model what the documents allow.' }; });
  window.bkAddConflictRule('debt.prepay-terms-incomplete', 'WARN', 'Debt', 'Debt', function(s){ var g = window.bkPrepayTermsGap(s); if(!g || typeof window.bkLoanMaturityMonths !== 'function') return; var hold = Math.max(1, Math.round(num(s.holdYears) * 12)); if(!(hold < window.bkLoanMaturityMonths(s))) return;
    return { msg:'The prepayment type is ' + g.type + ' but ' + g.what + ' is not entered. ' + g.effect, why:'An early payoff is priced only from the loan\'s contractual provision. Without ' + g.what + ' the exit cost shown is not the loan\'s own, so the returns may overstate what the exit nets. Enter it from the loan documents.' }; });
  window.bkAddConflictRule('debt.partial-io-basis', 'INFO', 'Debt', 'Debt', function(s){ if(String(s.repayType || '') === 'Partial interest only' && num(s.acqIO) > 0 && !s.ioBasis && s.debtEnabled !== false) return { msg:'Partial interest only does not say what the loan amortizes over after the interest-only period.', why:'The stated amortization schedule is used (a balloon is left at maturity). Choose the remaining loan term if the payment should pay the loan off by maturity.' }; });
}
var css = '.bk-ds-card,.bk-ds-note{margin:10px 0 4px;padding:12px 14px;border:1px solid var(--ae-line,#d6dde5);border-radius:8px;background:var(--surface,#fff);color:inherit;font-size:13px;line-height:1.5}'
  + '.bk-ds-h{font-weight:700;margin-bottom:8px}.bk-ds-sum{display:flex;flex-wrap:wrap;gap:10px 28px;align-items:flex-end}.bk-ds-sum div{display:flex;flex-direction:column}.bk-ds-sum span{font-size:11.5px;color:var(--ae-dim,#56616c)}.bk-ds-sum b{font-size:20px;font-variant-numeric:tabular-nums}'
  + '.bk-ds-sum .t{padding-left:20px;border-left:2px solid var(--ae-line,#d6dde5)}.bk-ds-n,.bk-ds-pub,.bk-ds-typ{margin-top:8px;color:var(--ae-dim,#56616c);font-size:12.5px}.bk-ds-pub .bk-btn,.bk-ds-note .bk-btn{margin-left:6px}.bk-ds-note .bk-btn{margin:8px 0 0}.bk-ds-ok{color:var(--bk-link-ink,#1f6b45);font-weight:600}';
var st = document.createElement('style'); st.id = 'bk-debt-structure-css'; st.textContent = css; document.head.appendChild(st);
})();
