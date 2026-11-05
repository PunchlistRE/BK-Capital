/* DOCUMENT INGESTION, core (Phase 2). Nothing here changes what the app does today: it defines the pieces every later ingestion phase stands on, and it has no screen of its own.
   Behind a flag (BKIngest.enabled(): localStorage 'bk-ingest' = '1', or ?ingest=1); off by default.

     the fact record     one schema for every extracted value, whichever reader or model produced it: the field it is for, the value, exactly what was printed, WHERE (page, or sheet and cell,
                         and the quoted line), how it was read, how sure, what checks it passed, and what a person decided. Values that disagree are separate records, never one winner.
     validateFact        a fact that cannot say where it came from, or whose value does not match what was printed, is rejected with a reason. Nothing is accepted because it is valid JSON.
     verifyQuote         the quoted line must really be on the page it names, and must contain what was printed. A model that cites a page it did not read is caught here, in our code.
     parseNumber         the one parser for printed figures: "$11,131", "(5,493)", "5.00%", "14,985 SF", "$3.6M", "0.29 Acres". It says what a lone dash means by an explicit rule.
                         (The T-12, rent-roll, OM and hub readers each still carry their own parser; they move to this one in the reader phases, each with a parity test.)
     sha256              content hash for duplicate detection (WebCrypto, with a pure-JS fallback that is tested against it). */
(function(){
'use strict';
var I = window.BKIngest = window.BKIngest || {};
I.VERSION = '2.0.0';

I.enabled = function(){ try { if(/[?&]ingest=1\b/.test(String(location.search || ''))) return true; return localStorage.getItem('bk-ingest') === '1'; } catch(e){ return false; } };

/* clock and ids: replaceable, so a test can be deterministic */
I.clock = function(){ return new Date().toISOString(); };
I.newId = function(prefix){
  var u; try { if(window.crypto && crypto.randomUUID) u = crypto.randomUUID(); } catch(e){}
  if(!u){ var a = new Uint8Array(16); try { crypto.getRandomValues(a); } catch(e){ for(var i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256); } u = Array.prototype.map.call(a, function(b){ return ('0' + b.toString(16)).slice(-2); }).join(''); }
  return (prefix ? prefix + '_' : '') + u;
};

/* ---------------------------------------------------------------- sha-256 */
var K256 = null, H256 = null;
function primes(n){ var p = [], k = 2; while(p.length < n){ var ok = true; for(var i = 0; i < p.length; i++){ if(k % p[i] === 0){ ok = false; break; } } if(ok) p.push(k); k++; } return p; }
function frac32(x){ return Math.floor((x - Math.floor(x)) * 4294967296) >>> 0; }
function tables(){ if(K256) return; var p = primes(64); K256 = p.map(function(q){ return frac32(Math.cbrt(q)); }); H256 = p.slice(0, 8).map(function(q){ return frac32(Math.sqrt(q)); }); }
I.sha256js = function(u8){
  tables(); var H = H256.slice(), len = u8.length, bits = len * 8, padded = ((len + 9 + 63) >> 6) << 6, m = new Uint8Array(padded); m.set(u8); m[len] = 0x80;
  var dv = new DataView(m.buffer); dv.setUint32(padded - 8, Math.floor(bits / 4294967296)); dv.setUint32(padded - 4, bits >>> 0);
  var w = new Uint32Array(64); function rotr(x, n){ return (x >>> n) | (x << (32 - n)); }
  for(var off = 0; off < padded; off += 64){
    for(var t = 0; t < 16; t++) w[t] = dv.getUint32(off + t * 4);
    for(t = 16; t < 64; t++){ var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3), s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10); w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0; }
    var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for(t = 0; t < 64; t++){ var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K256[t] + w[t]) >>> 0, S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0; }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0; H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return H.map(function(x){ return ('00000000' + x.toString(16)).slice(-8); }).join('');
};
/* bytes: a Uint8Array, an ArrayBuffer, a Blob / File, or a string (UTF-8) */
I.sha256 = function(bytes){
  var get = typeof bytes === 'string' ? Promise.resolve(new TextEncoder().encode(bytes)) : (bytes && typeof bytes.arrayBuffer === 'function') ? bytes.arrayBuffer().then(function(b){ return new Uint8Array(b); }) : Promise.resolve(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes);
  return get.then(function(u8){
    try { if(window.crypto && crypto.subtle && crypto.subtle.digest) return crypto.subtle.digest('SHA-256', u8).then(function(d){ return Array.prototype.map.call(new Uint8Array(d), function(b){ return ('0' + b.toString(16)).slice(-2); }).join(''); }, function(){ return I.sha256js(u8); }); } catch(e){}
    return I.sha256js(u8); });
};

/* ---------------------------------------------------------------- the stages every document passes through, in order */
I.STAGES = ['intake', 'classify', 'read', 'extract', 'normalize', 'validate', 'reconcile', 'propose'];
/* a document's stages when it arrives: intake is done; a document that will not be processed (a duplicate, a rejection) has every later stage skipped with the reason */
I.freshStages = function(skipReason){ var o = {}, now = I.clock(); I.STAGES.forEach(function(n, i){ o[n] = i === 0 ? { status:'done', attempts:1, startedAt:now, finishedAt:now, error:null, note:'' } : skipReason ? { status:'skipped', attempts:0, startedAt:null, finishedAt:now, error:null, note:skipReason } : { status:'pending', attempts:0, startedAt:null, finishedAt:null, error:null, note:'' }; }); return o; };

/* ---------------------------------------------------------------- printed figures */
var NIL = /^(?:[-–—−]{1,3}|\$\s*[-–—−]{1,3})$/, NOT_A_NUMBER = /^(?:n\/?a|na|tbd|tba|none|nil|null|unknown|not (?:stated|available|provided)|call (?:for|broker)(?: price)?|price (?:upon|on) request|upon request|\?+)$/i;
var UNIT_RX = [[/^(?:%|percent)$/i, 'pct'], [/^(?:sf|s\.f\.|sq\.?\s*ft\.?|sqft|square\s+f(?:ee|oo)t)$/i, 'sf'], [/^(?:acres?|ac)$/i, 'acres'], [/^(?:units?|doors?|apts?|apartments?|suites?|beds?|keys?)$/i, 'count'], [/^(?:months?|mos?)$/i, 'months'], [/^(?:years?|yrs?)$/i, 'years'], [/^x$/i, 'x']];
/* parseNumber(raw, { dash: 'null' | 'zero' }) -> { ok, value, unit, raw, negative, reason }
   dash: what a lone dash means. 'null' (the default) is "no value": a descriptive field or an unknown. 'zero' is for a financial statement, which prints a dash for nil. Never guessed from context.
   unit: '' (a bare number), 'usd', 'pct' (value is the fraction: "5%" -> 0.05), 'sf', 'acres', 'count', 'months', 'years', 'x'.
   Not a number, and never forced into one: a range ("613-615"), a date, text, "N/A", "Call for price", a figure with unreadable leftovers. */
I.parseNumber = function(raw, opts){
  opts = opts || {}; var out = function(ok, value, unit, why, neg){ return ok ? { ok:true, value:value, unit:unit || '', raw:raw, negative:!!neg } : { ok:false, value:null, unit:'', raw:raw, negative:false, reason:why }; };
  if(typeof raw === 'number') return isFinite(raw) ? out(true, raw, '', '', raw < 0) : out(false, null, '', 'not-finite');
  if(raw == null) return out(false, null, '', 'empty');
  var s = String(raw).replace(/[   ]/g, ' ').trim(); if(!s) return out(false, null, '', 'empty');
  if(/^#+$/.test(s)) return out(false, null, '', 'column-too-narrow');
  if(NIL.test(s)) return opts.dash === 'zero' ? out(true, 0, /\$/.test(s) ? 'usd' : '', '', false) : out(false, null, '', 'dash');
  if(NOT_A_NUMBER.test(s)) return out(false, null, '', 'not-a-number');
  var neg = false, t = s;
  var wrapped = /^\(\s*(.*?)\s*\)$/.exec(t); if(wrapped){ neg = true; t = wrapped[1]; }
  if(/^[-−]/.test(t)){ neg = !neg ? true : neg; t = t.replace(/^[-−]\s*/, ''); } if(/[-−]$/.test(t) && /\d[-−]$/.test(t)){ neg = true; t = t.replace(/[-−]$/, ''); }
  var usd = false; if(/^(?:US)?\$\s*/i.test(t)){ usd = true; t = t.replace(/^(?:US)?\$\s*/i, ''); } else if(/\s*(?:USD|dollars?)$/i.test(t)){ usd = true; t = t.replace(/\s*(?:USD|dollars?)$/i, ''); }
  if(/^[-−]/.test(t)){ neg = true; t = t.replace(/^[-−]\s*/, ''); }
  var m = /^(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)\s*([A-Za-z%][A-Za-z.%\s]*)?$/.exec(t);
  if(!m) return out(false, null, '', /\d\s*[-–—\/]\s*\d/.test(t) ? 'range-or-date' : 'residue');
  var v = parseFloat(m[1].replace(/,/g, '')), suf = (m[2] || '').trim(), unit = usd ? 'usd' : '';
  if(suf){ var scale = /^([KkMmBb])$/.exec(suf);
    if(scale){ v *= { k:1e3, m:1e6, b:1e9 }[scale[1].toLowerCase()]; }
    else { var hit = null; for(var i = 0; i < UNIT_RX.length; i++) if(UNIT_RX[i][0].test(suf)){ hit = UNIT_RX[i][1]; break; } if(!hit) return out(false, null, '', 'residue'); if(usd && hit !== 'usd') return out(false, null, '', 'residue'); unit = hit; if(hit === 'pct') v = v / 100; } }
  if(!isFinite(v)) return out(false, null, '', 'not-finite');
  return out(true, neg ? -v : v, unit, '', neg);
};

/* ---------------------------------------------------------------- the fact record */
I.FACT_STATUS = ['verified', 'check', 'low', 'assumed', 'missing', 'conflict'];
I.FACT_METHOD = ['text', 'ocr', 'sheet', 'vision', 'manual'];
I.FACT_DECISION = ['proposed', 'accepted', 'rejected', 'edited'];
I.FACT_UNITS = ['', 'usd', 'usd/yr', 'usd/mo', 'usd/sf', 'pct', 'count', 'sf', 'acres', 'years', 'months', 'x', 'date', 'text', 'bool'];
I.PERIOD_BASIS = ['current', 't12', 'proforma', 'year1', 'asof', 'annual', 'monthly', 'unknown'];
/* what a registry field kind accepts as a unit; a field that is a table or a derived figure is not a single fact */
var KIND_UNITS = { money:['usd', 'usd/yr', 'usd/mo', 'usd/sf'], pct:['pct'], int:['count', 'years', 'months', 'sf', ''], num:['', 'x', 'count', 'years', 'months', 'pct', 'sf', 'acres'], text:['text', 'date'], choice:['text'], bool:['bool'] };
function isoDate(s){ return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)); }

/* makeFact: fills what has a sensible default (id, time, an undecided decision) and nothing else; it never invents a value, a source or a confidence */
I.makeFact = function(p){
  p = p || {}; var f = { id:p.id || I.newId('fact'), dealId:p.dealId == null ? null : p.dealId, documentId:p.documentId == null ? null : p.documentId, field:p.field, label:p.label == null ? '' : p.label, raw:p.raw == null ? '' : p.raw,
    value:p.value === undefined ? null : p.value, unit:p.unit == null ? '' : p.unit, period:p.period == null ? null : p.period, source:p.source || null, method:p.method, extractor:p.extractor || '', model:p.model || null,
    confidence:p.confidence, status:p.status || 'check', checks:Array.isArray(p.checks) ? p.checks.slice() : [], decision:p.decision || { state:'proposed', by:null, at:null, value:null }, createdAt:p.createdAt || I.clock() };
  return f;
};

/* validateFact(f) -> [{ code, message }]; empty means the record is well formed. It says nothing about whether the value is RIGHT: that is what verification and the benchmark are for. */
I.validateFact = function(f){
  var bad = [], add = function(code, message){ bad.push({ code:code, message:message }); };
  if(!f || typeof f !== 'object') return [{ code:'not-an-object', message:'A fact is an object.' }];
  var reg = (window.BKReg && window.BKReg.field) ? window.BKReg.field(f.field) : null, isExtra = typeof f.field === 'string' && /^extra:[a-z0-9][a-z0-9_.-]*$/i.test(f.field);
  if(typeof f.field !== 'string' || !f.field) add('field-missing', 'A fact names the field it is for (a registry field, or extra:<name> for a fact the model has no field for).');
  else if(window.BKReg && !reg && !isExtra) add('field-unknown', 'The field "' + f.field + '" is not in the field registry. Use a registry field, or extra:<name>.');
  if(reg && (reg.kind === 'table' || reg.kind === 'derived')) add('field-not-a-single-fact', 'The field "' + f.field + '" is a ' + reg.kind + ', not a single value; its rows or inputs are facts of their own.');
  if(typeof f.label !== 'string') add('label-type', 'label is the text as printed, a string.');
  if(typeof f.raw !== 'string') add('raw-type', 'raw is exactly what was printed, a string.');
  if(I.FACT_STATUS.indexOf(f.status) < 0) add('status-invalid', 'status is one of ' + I.FACT_STATUS.join(', ') + '.');
  if(I.FACT_METHOD.indexOf(f.method) < 0) add('method-invalid', 'method is one of ' + I.FACT_METHOD.join(', ') + '.');
  if(I.FACT_UNITS.indexOf(f.unit) < 0) add('unit-invalid', 'unit "' + f.unit + '" is not a known unit.');
  var missing = f.status === 'missing';
  if(missing){ if(f.value !== null) add('missing-has-value', 'A missing fact has no value; blank means blank.'); }
  else {
    if(f.value === null || f.value === undefined || (typeof f.value === 'number' && !isFinite(f.value))) add('value-missing', 'A fact that is not marked missing has a value.');
    if(typeof f.raw === 'string' && !f.raw.trim() && f.method !== 'manual') add('raw-missing', 'A fact says what was printed (raw); an empty raw cannot be checked.');
  }
  if(reg && KIND_UNITS[reg.kind] && I.FACT_UNITS.indexOf(f.unit) >= 0 && !missing && KIND_UNITS[reg.kind].indexOf(f.unit) < 0) add('unit-kind', 'A ' + reg.kind + ' field ("' + f.field + '") takes ' + KIND_UNITS[reg.kind].map(function(u){ return u || '(none)'; }).join(' / ') + ', not "' + f.unit + '".');
  if(reg && reg.kind === 'pct' && typeof f.value === 'number' && (f.value > 1.5 || f.value < -1.5) && !missing) add('pct-not-a-fraction', 'A percent is stored as a fraction (5% is 0.05); ' + f.value + ' looks like a percentage point.');
  /* where it came from */
  var s = f.source;
  if(!s || typeof s !== 'object') { if(!missing) add('source-missing', 'A fact says where it came from.'); }
  else {
    if(f.documentId != null && s.documentId != null && s.documentId !== f.documentId) add('source-document-mismatch', 'source.documentId differs from the fact\'s documentId.');
    var page = s.page != null && s.page !== '', sheet = !!s.sheet, cell = !!s.cell || s.row != null;
    if(page && !(Number.isInteger(s.page) && s.page >= 1)) add('page-invalid', 'page is a whole number from 1.');
    if(!missing && !(page || (sheet && cell))) add('locator-missing', 'A fact names a page, or a sheet and a cell or row.');
    if(!missing && (f.method === 'text' || f.method === 'ocr' || f.method === 'vision') && !(typeof s.quote === 'string' && s.quote.trim())) add('quote-missing', 'A fact read from text, OCR or a model quotes the line it came from, so the line can be checked against the page.');
    if(typeof s.quote === 'string' && s.quote.length > 400) add('quote-too-long', 'A quote is the line the value sits on (400 characters at most).');
  }
  if(typeof f.confidence !== 'number' || !(f.confidence >= 0 && f.confidence <= 1)) add('confidence-invalid', 'confidence is a number from 0 to 1, stated by the reader (never filled in for it).');
  if(f.period != null){ var p = f.period; if(typeof p !== 'object' || I.PERIOD_BASIS.indexOf(p.basis) < 0) add('period-invalid', 'period.basis is one of ' + I.PERIOD_BASIS.join(', ') + '.'); else { if(p.from != null && !isoDate(p.from)) add('period-from', 'period.from is an ISO date (yyyy-mm-dd).'); if(p.to != null && !isoDate(p.to)) add('period-to', 'period.to is an ISO date (yyyy-mm-dd).'); if(p.from && p.to && p.from > p.to) add('period-order', 'period.from is after period.to.'); } }
  if(!Array.isArray(f.checks)) add('checks-type', 'checks is a list.'); else f.checks.forEach(function(c, i){ if(!c || typeof c.id !== 'string' || typeof c.ok !== 'boolean') add('check-shape', 'checks[' + i + '] is { id, ok, detail }.'); });
  var d = f.decision; if(!d || I.FACT_DECISION.indexOf(d.state) < 0) add('decision-invalid', 'decision.state is one of ' + I.FACT_DECISION.join(', ') + '.'); else if(d.state === 'edited' && (d.value === null || d.value === undefined)) add('decision-edit-value', 'An edited decision carries the value the person entered.');
  /* what was printed must agree with the number stored: this catches a transposed digit between the page and the record */
  if(!missing && typeof f.raw === 'string' && f.raw.trim() && typeof f.value === 'number' && isFinite(f.value) && (!reg || ['money', 'pct', 'int', 'num'].indexOf(reg.kind) >= 0)){
    var pr = I.parseNumber(f.raw, { dash:'zero' }); if(pr.ok && pr.value !== f.value) add('raw-value-mismatch', 'The printed "' + f.raw + '" reads as ' + pr.value + ', but the fact stores ' + f.value + '. (A fact stores the figure as printed; annualizing or per-unit conversion is a separate, derived fact.)'); }
  return bad;
};

/* ---------------------------------------------------------------- the quoted line must be on the page */
function squash(s){ return String(s == null ? '' : s).replace(/[   ]/g, ' ').replace(/[‘’‚‛]/g, "'").replace(/[“”„]/g, '"').replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase(); }
I.squash = squash;
/* verifyQuote(quote, pageText) -> { ok, index }: the line, ignoring case, spacing and typographic quotes and dashes, appears in the page text */
I.verifyQuote = function(quote, pageText){ var q = squash(quote), t = squash(pageText); if(!q) return { ok:false, index:-1, reason:'empty-quote' }; var i = t.indexOf(q); return i >= 0 ? { ok:true, index:i } : { ok:false, index:-1, reason:'not-on-page' }; };
/* checkSource(fact, pages) -> checks[]: pages is { 1: 'text of page 1', ... } or an array of { page, text }. The page must exist, the quote must be on it, and what was printed must be in the quote. */
I.checkSource = function(f, pages){
  var by = {}; if(Array.isArray(pages)) pages.forEach(function(p){ by[p.page] = p.text; }); else if(pages) by = pages;
  var checks = [], s = f.source || {}, pg = s.page;
  if(pg == null){ checks.push({ id:'source-page', ok:true, detail:'not a page source (' + (s.sheet ? 'sheet ' + s.sheet : 'no page') + '); quote not checked against page text' }); return checks; }
  if(by[pg] == null){ checks.push({ id:'source-page', ok:false, detail:'page ' + pg + ' was not read' }); return checks; }
  checks.push({ id:'source-page', ok:true, detail:'page ' + pg });
  var q = I.verifyQuote(s.quote, by[pg]); checks.push({ id:'quote-on-page', ok:q.ok, detail:q.ok ? 'the quoted line is on page ' + pg : 'the quoted line is not on page ' + pg });
  if(f.raw && typeof s.quote === 'string' && s.quote.trim()){ var inQ = squash(s.quote).indexOf(squash(f.raw)) >= 0; checks.push({ id:'raw-in-quote', ok:inQ, detail:inQ ? 'what was printed ("' + f.raw + '") is in the quote' : '"' + f.raw + '" is not in the quoted line' }); }
  return checks;
};
})();
