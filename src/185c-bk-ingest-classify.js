/* DOCUMENT INGESTION, classification (Phase 2). What kind of document is this, for which period, and which property? Rules first, and every answer carries its reasons, so a person can see WHY.
   A model is asked only when the rules are not sure (a later phase); a document that cannot be recognized is "unknown", never forced into a type.

     BKIngest.classifyDocument({ name, kind, sheets, pages }) -> { type, confidence, reasons[], alternatives[], period, property, needsOcr }
         sheets: [{ name, rows }] as the existing file loader returns them; pages: [{ page, text }]. Spreadsheets also go through the existing, tested Import classifier (bkImportClassify).
     BKIngest.detectPeriod(text) -> { basis, label, from, to, asOf, columns[], evidence } | null
     BKIngest.detectProperty(text) -> { key, address, number, alt, street, suffix, city, state, zip, count } | null     the address the document repeats most is the subject; a broker's office printed once is not
     BKIngest.sameProperty(a, b) -> boolean
   Types: om, rent_roll, operating_statement, pro_forma, property_record, portfolio_master, property_list, package, tax_bill, insurance, loan_document, appraisal, construction_budget,
   development_schedule, partnership_agreement, environmental_report, engineering_report, inspection_report, lease, image, other, unknown. */
(function(){
'use strict';
var I = window.BKIngest = window.BKIngest || {};
I.DOC_TYPES = ['om', 'rent_roll', 'operating_statement', 'pro_forma', 'property_record', 'portfolio_master', 'property_list', 'package', 'tax_bill', 'insurance', 'loan_document', 'appraisal', 'construction_budget', 'development_schedule', 'partnership_agreement', 'environmental_report', 'engineering_report', 'inspection_report', 'lease', 'image', 'other', 'unknown'];

/* [type, pattern, weight, reason, where]. where 'name' tests the file name, otherwise the text. */
var CUES = [
  ['om', /\b(?:offering memorandum|investment (?:summary|highlights|offering)|executive summary|exclusively (?:listed|offered)|for sale|confidentiality (?:and |& )?disclaimer|property overview|listing price|asking price|offering price)\b/i, 3, 'offering-memorandum wording'],
  ['om', /\b(?:cap rate|price per unit|investment sales|deal contacts|broker(?:age)?)\b/i, 1, 'brokerage terms'],
  ['om', /(?:^|[^a-z])(?:om|offering|memorandum|brochure|flyer)(?:[^a-z]|$)/i, 3, 'file name', 'name'],
  ['rent_roll', /\brent[ _-]?roll\b/i, 5, 'the words "rent roll"'],
  ['rent_roll', /\b(?:lease (?:from|to|start|end|expir\w*)|unit sq ?ft|market rent|lease rent|resident|tenant name|move[- ]in)\b/i, 2, 'unit and lease columns'],
  ['rent_roll', /(?:^|[^a-z])(?:rent[ _-]?roll|rr)(?:[^a-z]|$)/i, 4, 'file name', 'name'],
  ['operating_statement', /\b(?:trailing (?:12|twelve)|t-?12|income statement|operating statement|profit (?:and|&) loss|statement of (?:income|operations)|12 months ended|twelve months ended)\b/i, 4, 'income-statement wording'],
  ['operating_statement', /\b(?:net operating income|total operating expenses|effective gross income|gross potential rent|total income|net income)\b/i, 2, 'income and expense lines'],
  ['operating_statement', /(?:^|[^a-z])(?:t-?12|trailing|operating[ _-]?statement|income[ _-]?statement|p&l|profit)(?:[^a-z]|$)/i, 4, 'file name', 'name'],
  ['pro_forma', /\b(?:pro ?forma|development budget|sources (?:and|&) uses|underwriting (?:assumptions|summary)|construction costs?|completed project)\b/i, 4, 'pro-forma wording'],
  ['pro_forma', /(?:pro[ _-]?forma|underwriting|model|budget)/i, 3, 'file name', 'name'],
  ['tax_bill', /\b(?:real estate tax(?:es)? bill|tax bill|mill rate|grand list|assessor|assessed value|taxable value|tax collector|installment (?:due|1|2)|supplemental (?:tax )?bill)\b/i, 4, 'tax-bill wording'],
  ['tax_bill', /(?:tax[ _-]?bill|property[ _-]?tax|assessment)/i, 3, 'file name', 'name'],
  ['insurance', /\b(?:certificate of (?:liability )?insurance|acord|declarations? page|named insured|policy (?:number|period|no\.?)|coverage limit|additional insured|loss payee)\b/i, 5, 'insurance wording'],
  ['insurance', /(?:insurance|acord|coi|policy|binder)/i, 3, 'file name', 'name'],
  ['loan_document', /\b(?:term sheet|loan agreement|promissory note|deed of trust|mortgage note|commitment letter|prepayment (?:penalty|premium)|non-?recourse|extension options?)\b/i, 5, 'loan-document wording'],
  ['loan_document', /\b(?:maturity date|guarant(?:or|y)|origination fee|loan amount|interest[- ]only period|debt service coverage)\b/i, 1, 'loan terms'],
  ['loan_document', /(?:term[ _-]?sheet|loan|promissory|mortgage|commitment)/i, 3, 'file name', 'name'],
  ['appraisal', /\b(?:appraiser|opinion of value|broker opinion|sales comparison approach|income capitalization approach|highest and best use|as[- ]is (?:market )?value|as[- ]stabilized|extraordinary assumptions?|certification of appraiser|appraisal report)\b/i, 5, 'appraisal wording'],
  ['appraisal', /(?:apprais|bov|opinion[ _-]?of[ _-]?value)/i, 4, 'file name', 'name'],
  ['construction_budget', /\b(?:schedule of values|construction budget|hard costs?|soft costs?|general contractor|guaranteed maximum price|gmp|aia g70\d|line[- ]item budget|contingency)\b/i, 3, 'construction-cost wording'],
  ['construction_budget', /(?:construction[ _-]?budget|sov|schedule[ _-]?of[ _-]?values|gmp)/i, 3, 'file name', 'name'],
  ['development_schedule', /\b(?:construction schedule|development schedule|critical path|notice to proceed|substantial completion|gantt|milestones?|permitting|certificate of occupancy)\b/i, 3, 'schedule wording'],
  ['development_schedule', /(?:gantt|timeline|construction[ _-]?schedule|dev[ _-]?schedule)/i, 3, 'file name', 'name'],
  ['partnership_agreement', /\b(?:operating agreement|limited partnership agreement|llc agreement|capital contributions?|preferred return|managing member|general partner|limited partners?|catch-?up|hurdle|promote|waterfall|distributable cash)\b/i, 3, 'partnership terms'],
  ['partnership_agreement', /(?:operating[ _-]?agreement|partnership|lpa|waterfall|subscription)/i, 3, 'file name', 'name'],
  ['environmental_report', /\b(?:phase (?:i|1|ii|2) environmental|environmental site assessment|astm e ?1527|recognized environmental conditions?|\brecs?\b|vapor encroachment)\b/i, 5, 'environmental wording'],
  ['environmental_report', /(?:phase[ _-]?(?:i|1|ii|2)|environmental|esa\b)/i, 4, 'file name', 'name'],
  ['engineering_report', /\b(?:property condition (?:assessment|report)|astm e ?2018|immediate repairs|replacement reserve|remaining useful life|deferred maintenance|structural engineer)\b/i, 5, 'engineering wording'],
  ['engineering_report', /(?:pca|property[ _-]?condition|engineering|structural)/i, 4, 'file name', 'name'],
  ['inspection_report', /\b(?:inspection report|inspected by|deficienc(?:y|ies)|inspection date|inspector)\b/i, 4, 'inspection wording'],
  ['inspection_report', /inspection/i, 3, 'file name', 'name'],
  ['property_record', /\b(?:mblu|owner of record|building sub-?areas?|valuation history|ownership history|parcel (?:id|number)|land use|outbuildings?|current assessment|assessment year)\b/i, 4, 'assessor record-card wording'],
  ['pro_forma', /\b(?:asking|resale rate|cap rate|dwelling units|offer price|purchase price|apartment count|net rentable area|exit cap|loan to value|hold period)\b/i, 2, 'deal assumptions'],
  ['package', /(?:^|[^a-z])(?:package|data[ _-]?room|bundle)(?:[^a-z]|$)/i, 4, 'file name', 'name'],
  ['package', /\b(?:owner package|property package|information package)\b/i, 4, 'package wording'],
  ['lease', /\b(?:lease agreement|landlord|tenant|term of (?:the )?lease|commencement date|premises|security deposit|rent commencement|guarantor of (?:the )?lease|demised)\b/i, 3, 'lease wording'],
  ['lease', /(?:^|[^a-z])lease(?:[^a-z]|$)/i, 2, 'file name', 'name']
];

/* ---------------------------------------------------------------- dates */
var MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12 };
function pad(n){ return (n < 10 ? '0' : '') + n; }
function eom(y, m){ return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
/* parseDate(text, wantEnd): ISO date from "December 31, 2024", "12/31/2024", "6/30/26", "Dec 2024" (the last day of the month when wantEnd, else the first), "12/2024" */
function mon(w){ return MONTHS[w.slice(0, 4).toLowerCase()] || MONTHS[w.slice(0, 3).toLowerCase()] || 0; }
I.parseDate = function(t, wantEnd){ t = String(t || '').trim().replace(/\./g, ''); var m, mo, y;
  if((m = /^([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(t)) && (mo = mon(m[1]))) return m[3] + '-' + pad(mo) + '-' + pad(+m[2]);
  if((m = /^([A-Za-z]{3,9})\s+(\d{4})$/.exec(t)) && (mo = mon(m[1]))){ y = +m[2]; return y + '-' + pad(mo) + '-' + pad(wantEnd ? eom(y, mo) : 1); }
  if((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t))){ y = +m[3]; if(y < 100) y += y < 70 ? 2000 : 1900; if(+m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31) return y + '-' + pad(+m[1]) + '-' + pad(+m[2]); }
  if((m = /^(\d{1,2})\/(\d{4})$/.exec(t)) && +m[1] >= 1 && +m[1] <= 12){ y = +m[2]; return y + '-' + pad(+m[1]) + '-' + pad(wantEnd ? eom(y, +m[1]) : 1); }
  return null; };
var DATE_RX = '([A-Za-z]{3,9}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}|[A-Za-z]{3,9}\\.?\\s+\\d{4}|\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}|\\d{1,2}\\/\\d{4})';
/* detectPeriod: the reporting period a document states. basis: t12 (twelve months ending a date), annual (a calendar or fiscal year), asof (a snapshot: rent roll, balance), proforma, current, unknown */
I.detectPeriod = function(text){
  var t = String(text || ''), m, out = { basis:'unknown', label:'', from:null, to:null, asOf:null, columns:[], evidence:'' };
  if(/\bpro ?forma\b/i.test(t)) out.columns.push('proforma'); if(/\b(?:current|in-?place|year 1|year one)\b/i.test(t)) out.columns.push('current'); if(/\b(?:t-?12|trailing)\b/i.test(t)) out.columns.push('t12');
  if((m = new RegExp('(?:trailing\\s*(?:12|twelve)\\s*months?|t[- ]?12)[^\\n]{0,40}?(?:ending|ended|through|thru|as of|to)\\s+' + DATE_RX, 'i').exec(t)) || (m = new RegExp('(?:for the\\s+)?(?:twelve|12)\\s*months?\\s+(?:ended|ending)\\s+' + DATE_RX, 'i').exec(t))){
    var to = I.parseDate(m[1], true); if(to){ var tp = to.split('-').map(Number), fd = new Date(Date.UTC(tp[0] - 1, tp[1] - 1, tp[2] + 1)); out.basis = 't12'; out.to = to; out.from = fd.getUTCFullYear() + '-' + pad(fd.getUTCMonth() + 1) + '-' + pad(fd.getUTCDate()); out.label = 'trailing 12 months ending ' + to; out.evidence = m[0].replace(/\s+/g, ' ').slice(0, 120); return out; } }
  if((m = new RegExp('(?:period|from|for|statement period)?:?\\s*' + DATE_RX + '\\s*(?:-|\\u2013|\\u2014|to|through|thru)\\s*' + DATE_RX, 'i').exec(t))){ var f = I.parseDate(m[1], false), e = I.parseDate(m[2], true);
    if(f && e && f < e){ var months = (+e.slice(0, 4) - +f.slice(0, 4)) * 12 + (+e.slice(5, 7) - +f.slice(5, 7)) + 1; if(months >= 11 && months <= 13){ out.basis = f.slice(5, 7) === '01' && e.slice(5, 7) === '12' ? 'annual' : 't12'; out.from = f; out.to = e; out.label = (out.basis === 'annual' ? 'calendar year ' + f.slice(0, 4) : '12 months ' + f + ' to ' + e); out.evidence = m[0].replace(/\s+/g, ' ').slice(0, 120); return out; } } }
  if((m = /\b(?:fy|fiscal year|calendar year|year ended)\s*(?:ending|ended)?\s*(?:[A-Za-z]+\s+\d{1,2},?\s+)?(\d{4})\b/i.exec(t))){ out.basis = 'annual'; out.from = m[1] + '-01-01'; out.to = m[1] + '-12-31'; out.label = 'year ' + m[1]; out.evidence = m[0].slice(0, 80); return out; }
  if((m = new RegExp('\\bas of(?: date)?:?\\s*' + DATE_RX, 'i').exec(t))){ var a = I.parseDate(m[1], true); if(a){ out.basis = 'asof'; out.asOf = a; out.label = 'as of ' + a; out.evidence = m[0].replace(/\s+/g, ' ').slice(0, 80); return out; } }
  if(out.columns.length){ out.basis = out.columns.indexOf('current') >= 0 ? 'current' : out.columns[0]; out.label = out.columns.join(' / ') + ' columns'; out.evidence = 'column headings'; return out; }
  return null;
};

/* ---------------------------------------------------------------- which property */
var SUFFIX = { st:'street', street:'street', ave:'avenue', av:'avenue', avenue:'avenue', rd:'road', road:'road', blvd:'boulevard', boulevard:'boulevard', dr:'drive', drive:'drive', ln:'lane', lane:'lane', ct:'court', court:'court', pl:'place', place:'place', way:'way', pkwy:'parkway', parkway:'parkway', ter:'terrace', terrace:'terrace', hwy:'highway', highway:'highway', cir:'circle', circle:'circle' };
var NOT_STREET = /^(?:acres?|sf|units?|floors?|stor(?:y|ies)|miles?|minutes?|mins?|bedrooms?|br|ba|years?|months?|parking|spaces?|rooms?|suites?|buildings?|lots?|parcels?|apartments?|total|per|of|and|the)$/i;
var ADDR = /(?<![\d.,$])\b(\d{1,5})(?:[ \t]*[-–][ \t]*(\d{1,5}))?[ \t]+((?:[NSEW]\.?[ \t]+)?[A-Z][A-Za-z0-9'.-]*(?:[ \t]+[A-Z][A-Za-z0-9'.-]*){0,2})[ \t]+(Street|St|Avenue|Ave|Av|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Way|Parkway|Pkwy|Terrace|Ter|Highway|Hwy|Circle|Cir)\b\.?(?:\s*,?\s*([A-Z][A-Za-z .'-]{2,30}?),?\s+([A-Z]{2})\b(?:\s+(\d{5})(?:-\d{4})?)?)?/g;
I.detectProperty = function(text){
  var t = String(text || '').replace(/\b[A-Z]{3,}\b/g, function(w){ return w.charAt(0) + w.slice(1).toLowerCase(); }), by = {}, m; ADDR.lastIndex = 0;   /* ALL-CAPS addresses read as Title Case; two-letter state codes stay */
  while((m = ADDR.exec(t))){ if(m[3].split(' ').every(function(w){ return NOT_STREET.test(w); }) || NOT_STREET.test(m[3].split(' ')[0])) continue; var street = m[3].replace(/\./g, '').replace(/\s+/g, ' ').trim().toLowerCase(), suf = SUFFIX[m[4].toLowerCase()] || m[4].toLowerCase(), key = m[1] + ' ' + street + ' ' + suf, e = by[key] || (by[key] = { key:key, address:'', number:m[1], alt:m[2] || null, street:street, suffix:suf, city:null, state:null, zip:null, count:0, first:m.index });
    e.count++; if(m[5] && !e.city){ e.city = m[5].trim(); e.state = m[6]; e.zip = m[7] || null; } if(!e.address) e.address = m[0].replace(/\s+/g, ' ').trim(); }
  var list = Object.keys(by).map(function(k){ return by[k]; }); if(!list.length) return null;
  list.sort(function(a, b){ return b.count - a.count || a.first - b.first; });
  return list[0];
};
I.sameProperty = function(a, b){ if(!a || !b) return false; var nums = function(p){ var s = [+p.number]; if(p.alt) for(var n = +p.number; n <= +p.alt && n - +p.number < 40; n += 2) s.push(n); return s; }; var na = nums(a), nb = nums(b);
  return a.street === b.street && a.suffix === b.suffix && na.some(function(x){ return nb.indexOf(x) >= 0; }); };

/* ---------------------------------------------------------------- classification */
/* one statement repeated for each property: several sheets whose first column carries the same line labels (and are not simply twelve months) */
function layoutSig(sh){ var L = {}, n = 0; (sh.rows || []).slice(0, 60).forEach(function(r){ var c = (r || []).filter(function(x){ return x != null && String(x).trim() !== ''; })[0]; if(typeof c === 'string' && /[A-Za-z]{3}/.test(c)){ L[c.toLowerCase().replace(/[^a-z]+/g, ' ').trim()] = 1; n++; } }); return n >= 8 ? L : null; }
function repeatedLayout(sheets){ sheets = sheets || []; var months = sheets.filter(function(sh){ return /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(String(sh.name || '').trim()); }).length; if(months >= 6) return false;
  var sigs = sheets.map(layoutSig).filter(Boolean); if(sigs.length < 4) return false; var best = 0;
  sigs.forEach(function(a, i){ var group = 1; sigs.forEach(function(b, j){ if(i === j) return; var inter = 0, ua = Object.keys(a).length, ub = Object.keys(b).length; Object.keys(a).forEach(function(k){ if(b[k]) inter++; }); if(inter / (ua + ub - inter) >= 0.6) group++; }); if(group > best) best = group; });
  return best >= 4 && best >= sheets.length * 0.25; }
function looksLikePropertyList(sheets){ return (sheets || []).some(function(sh){ var rows = sh.rows || []; for(var i = 0; i < Math.min(rows.length, 12); i++){ var h = (rows[i] || []).map(function(c){ return String(c == null ? '' : c).toLowerCase(); }), hit = 0;
  [/^(property|address|building|asset)( name)?$/, /^(city|town|market)$/, /^state$/, /(asking|list(ing)?|sale)?\s*price/, /^(sf|sq ?ft|square f\w+|units?)$/].forEach(function(rx){ if(h.some(function(x){ return rx.test(x.trim()); })) hit++; }); if(hit >= 3 && rows.length - i >= 4) return true; } return false; }); }
function sheetText(sheets){ var o = []; (sheets || []).forEach(function(sh){ o.push(String(sh.name || '')); (sh.rows || []).slice(0, 60).forEach(function(r){ var c = (r || []).filter(function(x){ return x != null && String(x).trim() !== ''; }).map(function(x){ return String(x).trim(); }); if(c.length) o.push(c.join('  ')); }); }); return o.join('\n'); }
I.classifyDocument = function(d){
  d = d || {}; var kind = d.kind || '', name = String(d.name || ''), pages = d.pages || [], sheets = d.sheets || null, text = pages.length ? pages.map(function(p){ return p.text; }).join('\n') : sheets ? sheetText(sheets) : '';
  var score = {}, why = {}, add = function(type, w, reason){ score[type] = (score[type] || 0) + w; (why[type] = why[type] || []).push(reason); };
  CUES.forEach(function(c){ var hay = c[4] === 'name' ? name : text; if(!hay) return; var re = new RegExp(c[1].source, c[1].flags.replace('g', '') + 'g'), n = (hay.match(re) || []).length; if(n) add(c[0], c[2] * (1 + 0.25 * (Math.min(n, 5) - 1)), c[3] + (n > 1 ? ' (x' + n + ')' : '')); });
  /* spreadsheets and page text also go through the existing, tested Import classifier */
  var hub = null; if(typeof window.bkImportClassify === 'function' && (sheets || pages.length)){ try { var parsed = sheets ? { kind:kind, sheets:sheets } : { kind:'pdf', sheets:pages.map(function(p){ return { name:'Page ' + p.page, rows:String(p.text).split(/\r?\n/).map(function(l){ return l.split(/\s{2,}|\t/); }) }; }) }; hub = window.bkImportClassify(parsed); } catch(e){ hub = null; } }
  if(hub){ if(hub.record) add('property_record', 8, 'an assessor property record card'); if(hub.portfolio) add('portfolio_master', 8, 'several properties in one workbook'); if(hub.rentRoll) add('rent_roll', 8, 'unit and rent columns (Import classifier)'); if(hub.statement) add('operating_statement', 4, 'income, expenses and NOI lines (Import classifier)');
    if(hub.dev && kind !== 'pdf') add('pro_forma', 6, 'development budget and financing content (Import classifier)'); if(hub.listing && kind === 'pdf') add('om', 6, 'listing / offering wording (Import classifier)'); }
  if(sheets && looksLikePropertyList(sheets)) add('property_list', 9, 'a table with one property per row (address, city, price, size)');
  if(sheets && repeatedLayout(sheets)) add('portfolio_master', 14, 'several sheets with the same layout: one statement for each property');
  var imageKind = /^(png|jpeg|gif|webp|tiff|bmp|heic)$/.test(kind), noText = !text.replace(/\s+/g, '').length;
  var rank = Object.keys(score).map(function(k){ return { type:k, score:Math.round(score[k] * 100) / 100 }; }).sort(function(a, b){ return b.score - a.score; });
  var out = { type:'unknown', confidence:0, reasons:[], alternatives:rank.slice(1, 4), period:null, property:null, needsOcr:false };
  if(imageKind){ out.type = 'image'; out.confidence = 0.9; out.reasons = ['an image file: reading it takes text recognition or a model']; out.needsOcr = true; return out; }
  if(noText && !sheets){ out.reasons = [kind === 'pdf' ? 'no readable text: the pages are images and need text recognition' : 'nothing to read']; out.needsOcr = kind === 'pdf'; if(rank.length && rank[0].score >= 3){ out.type = rank[0].type; out.confidence = 0.35; out.reasons.push('guessed from the file name only: ' + why[rank[0].type].join('; ')); } return out; }
  var top = rank[0], second = rank[1];
  if(!top || top.score < 3){ out.reasons = ['no wording or structure matched a known document type']; return out; }
  /* a rent roll or statement inside an OM does not make the whole file one: when an OM's wording is as strong, the OM wins (the OM reader reads the pages inside it) */
  if(top.type !== 'om' && score.om && score.om >= top.score * 0.8 && kind === 'pdf') { top = rank.filter(function(r){ return r.type === 'om'; })[0]; second = rank.filter(function(r){ return r.type !== 'om'; })[0]; why.om.push('the OM carries pages of ' + (second ? second.type.replace(/_/g, ' ') : 'detail') + ', and is still one OM'); }
  var margin = second ? (top.score - second.score) / top.score : 1; out.type = top.type; out.confidence = Math.max(0.2, Math.min(0.98, (0.45 + 0.55 * margin) * (top.score >= 6 ? 1 : 0.75))); out.confidence = Math.round(out.confidence * 100) / 100;
  out.reasons = why[top.type].slice(); out.alternatives = rank.filter(function(r){ return r.type !== top.type; }).slice(0, 3);
  out.period = I.detectPeriod(text); out.property = (out.type === 'property_list' || out.type === 'portfolio_master') ? null : I.detectProperty(text);
  return out;
};
})();
