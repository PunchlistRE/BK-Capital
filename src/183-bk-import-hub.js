/* IMPORT: one tab for every document that starts a deal (offering memorandum, listing, T-12, pro forma, rent roll, source package), Excel, CSV or PDF.
   The reader never looks for a template. For each file it
     1. reads every sheet / page into rows of cells (the existing file loader),
     2. decides what kind of document it is from its CONTENT (rent roll columns, a dated income statement, development content),
     3. for rent rolls and plain operating statements / listings hands the file to the existing, tested reader for that kind,
     4. for everything else (pro formas, budgets, financing and return assumptions, development offering memoranda) reads FACTS: any label next to a value, a row of
        headings over a row of values, and tables recognized by their column headings (unit mix, budget lines, waterfall tiers, draw timing). Labels are matched by meaning
        (many wordings per field), values by kind (money, percent, area, months), and nothing depends on a sheet name, a cell position or a file name.
   Each value found is shown with where it came from and how sure the reader is. Values that disagree are kept side by side and marked Low, never silently merged. Values that two
   places agree on are Verified. Nothing is invented: a field with no source stays empty and the Guide lists it as missing. Facts that have no input yet are listed, not dropped. */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof window.bkImportParseFile !== 'function') return;
var S = { files:[], facts:[], cand:null, msg:'', busy:false, routed:'' };
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function safe(f, d){ try { return f(); } catch(e){ return d; } }
var $ = function(n){ return n == null ? '' : (n < 0 ? '(' : '') + '$' + Math.round(Math.abs(n)).toLocaleString('en-US') + (n < 0 ? ')' : ''); };

/* ---------- what the reader has learned: a label you assigned (or ignored) is applied to every later file ---------- */
var LK = 'bkcapital.learn.fields.v1';
function lload(){ try { return JSON.parse(localStorage.getItem(LK) || '{}') || {}; } catch(e){ return {}; } }
function lsave(o){ try { localStorage.setItem(LK, JSON.stringify(o)); } catch(e){} try { if(typeof bkLoad === 'function' && typeof bkHasActiveDeal === 'function' && bkHasActiveDeal()){ var d = bkLoad(); d._learnFields = o; bkSave(d); } } catch(e){} }
function lmerge(){ try { var d = typeof bkLoad === 'function' ? bkLoad() : null, o = d && d._learnFields; if(o){ var cur = lload(), ch = false; Object.keys(o).forEach(function(k){ if(!cur[k] || (cur[k].t || 0) < (o[k].t || 0)){ cur[k] = o[k]; ch = true; } }); if(ch) try { localStorage.setItem(LK, JSON.stringify(cur)); } catch(e){} } } catch(e){} }
function lnorm(l){ return String(l || '').toLowerCase().replace(/[^a-z0-9% ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
window.bkImportLearn = { all:function(){ lmerge(); return lload(); }, set:function(label, k){ var o = lload(), n = lnorm(label); if(!n) return; o[n] = { k:k, label:String(label).slice(0, 80), t:Date.now(), at:new Date().toISOString().slice(0, 10) }; lsave(o); }, forget:function(){ lsave({}); try { localStorage.removeItem(LK); } catch(e){} } };

/* ---------- values ---------- */
function parseVal(raw){
  if(raw == null || raw === '') return null;
  if(typeof raw === 'number') return { n:raw, unit:'', text:String(raw) };
  var t = String(raw).trim(); if(!t) return null;
  var m = /^\(?\s*(-?)\s*\$?\s*(-?[\d,]*\.?\d+)\s*(%|x|sf|sq\.?\s*ft\.?|acres?|ac|months?|mos?|yrs?|years?|units?|[kKmMbB])?(?![A-Za-z0-9])/.exec(t);
  if(!m || /^[A-Za-z]/.test(t)) return { n:null, unit:'', text:t };
  var n = parseFloat(m[2].replace(/,/g, '')), neg = /^\(/.test(t) || m[1] === '-'; if(!isFinite(n)) return { n:null, unit:'', text:t };
  var u = (m[3] || '').toLowerCase(), unit = u === '%' ? 'pct' : /^(sf|sq)/.test(u) ? 'sf' : /^ac/.test(u) ? 'acres' : /^(mo|month)/.test(u) ? 'months' : /^(y)/.test(u) ? 'years' : u === 'x' ? 'x' : '';
  if(u === 'k') n *= 1e3; else if(u === 'm') n *= 1e6; else if(u === 'b') n *= 1e9;
  if(/\$/.test(t) && !unit) unit = 'money';
  return { n:neg ? -Math.abs(n) : n, unit:unit, text:t };
}
function nl(s){ return String(s == null ? '' : s).toLowerCase().replace(/\(([^)]*)\)/g, ' $1 ').replace(/[^a-z0-9%&#\/ .-]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function isLabel(c){ return typeof c === 'string' && /[A-Za-z]{3}/.test(c) && c.length <= 90 && !/^[-\d$%.,\s()]+$/.test(c); }
function pct(v){ if(!v || v.n == null) return null; if(v.unit === 'pct') return v.n / 100; return Math.abs(v.n) <= 1 ? v.n : v.n / 100; }

/* ---------- what each model input is called (by meaning, many wordings) ---------- */
var W = function(){ return Array.prototype.slice.call(arguments).map(function(g){ return '(?=.*\\b(?:' + g + ')\\b)'; }).join(''); };
var F = {
  name:{ lab:'Property / deal name', kind:'text', rx:[/^(property|project|deal|investment|asset|building) name$/, /^name$/, /^(property|project) title$/] },
  location:{ lab:'Address / location', kind:'text', rx:[/^(property |site |street |subject )?address$/, /^(property )?location$/, /^city( and state)?$/] },
  propertyType:{ lab:'Property type', kind:'text', rx:[/^(asset|property|building|project|product) (type|class)$/, /^(proposed )?use$/] },
  purchasePrice:{ lab:'Purchase / land price', kind:'money', min:10000, rx:[new RegExp('^' + W('offer|offering|asking|purchase|purchasing|list|listing|guidance|contract|acquisition|sale|seller|land|bid|buy', 'price|cost|basis|amount|value')), /^price$/, /^(asking|offer|bid|list)$/, /^acquisition$/], no:/per |\/|psf|implied|unit|\bsf\b|cap |closing|capital|cost of sale|fee|cost basis per|reserve|tax|assess/ },
  units:{ lab:'Units', kind:'int', min:1, max:20000, rx:[/^(total |proposed |planned |approved |residential |apartment |dwelling |rental |number of |no\.? of |# of |#)?(apartments?|units?|doors?|dwellings?|unit count|apartment count)( count| total)?$/, /^(number|count|total|no\.?|#)( of)? (apartments?|units?|doors?|dwellings?)/, /^units? \(?total\)?$/], no:/per |mix|type|vacant|occupied|rent|sf|size/ },
  gsf:{ lab:'Gross building area (SF)', kind:'area', min:500, rx:[/gross (building |floor |buildable )?(area|sf|square f)/, /^gba$/, /^gross sf$/, /^building (size|area|sf)\b/, /^total (building )?(sf|square f)/, /^building sq ?(ft|feet)/], no:/rentable|net|existing/ },
  siteArea:{ lab:'Site area (acres)', kind:'acres', rx:[/(site|land|lot|parcel) (area|size)\b/, /^acreage$/, /^acres$/, /^gross land area$/, /^lot$/] },
  conLTC:{ lab:'Construction loan-to-cost', kind:'pct', rx:[/loan.to.cost/, /\bltc\b/], no:/max|ceiling/ },
  conRate:{ lab:'Construction loan rate (all-in)', kind:'pct', rx:[/all.in (interest )?rate/, /construction (loan )?(interest )?rate/] },
  acqRate:{ lab:'Loan interest rate', kind:'pct', max:0.25, rx:[/^(loan |note |mortgage |senior |debt |permanent |perm )?(interest )?rate$/, /\bcoupon\b/, /interest rate/, /^(loan|debt|mortgage) rate/], no:/index|sofr|spread|cap\b|growth|exit|discount|tax|inflation|vacancy|escalat/ },
  acqAmort:{ lab:'Loan amortization (years)', kind:'years', rx:[/amorti[sz]ation/, /\bamort\b/], no:/construction|interest.only|io\b/ },
  debtIndexRate:{ lab:'Index rate (e.g. SOFR)', kind:'pct', rx:[/^(sofr|libor|index( rate)?|base rate)\b/] },
  debtSpread:{ lab:'Spread over index', kind:'pct', rx:[/^(credit )?spread\b/, /spread over/] },
  conOrigFee:{ lab:'Loan origination fee', kind:'pct', rx:[/^(loan )?(origination|financing|closing|lender) fee$/, /^origination fee$/, /^points$/], no:/unused|commitment/ },
  acqLTV:{ lab:'Loan-to-value', kind:'pct', rx:[/loan.to.value/, /\bltv\b/], no:/max|construction/ },
  exitCap:{ lab:'Exit cap rate', kind:'pct', max:0.2, rx:[new RegExp('^' + W('exit|terminal|reversion|residual|going.out|disposition|sale|resale|reversionary|out', 'cap|capitali[sz]ation|yield')), /^cap(italization|italisation)? rate (at )?(exit|sale|reversion)/, /^exit cap/, /^terminal cap/, /^reversion(ary)? (rate|yield|cap)/] },
  saleCostPct:{ lab:'Cost of sale (%)', kind:'pct', max:0.2, rx:[new RegExp('^' + W('disposition|selling|sale|sales|exit|transaction|brokerage|reversion', 'cost|costs|fee|fees|expense|expenses|commission')), /^cost of sale/], no:/price|proceeds|gross/ },
  holdYears:{ lab:'Hold period (years)', kind:'years', rx:[/^(hold|holding|investment|analysis|projection|ownership) (period|term|horizon|length)\b/, /^hold \(?(years|yrs)/, /^(years|yrs) (held|hold)/, /^term \(?years/, /^(hold|holding)$/, /^exit year$/, /^(sale|disposition) (year|timing)$/] },
  rentGrowth:{ lab:'Annual rent growth', kind:'pct', max:0.2, rx:[/^(annual )?(rent|revenue|income|rental) (growth|increase|escalation|inflation)/, /^(annual )?(growth|increase|escalation|inflation|bumps?) (in|of|on) (rents?|revenue|income)/, /^rent (increase|escalation)/, /^annual rent growth/] },
  opexGrowth:{ lab:'Annual expense growth', kind:'pct', max:0.2, rx:[/^(annual )?(operating )?(expense|expenses|opex|cost|costs) (growth|inflation|increase|escalation)/, /^(annual )?(growth|increase|inflation) (in|of|on) (operating )?(expenses?|opex|costs?)/, /^expense growth/] },
  vacancy:{ lab:'Vacancy and credit loss (%)', kind:'pct', max:0.9, rx:[/^(general |economic |stabili[sz]ed |physical )?vacancy( rate| allowance| factor| loss)?( ?[&\/]? ?(and )?(credit|collection|bad debt) loss)?$/, /^vacancy$/, /^(vacancy|credit) (allowance|factor)$/] },
  occupancy:{ lab:'Stabilized occupancy', kind:'pct', min:0.3, rx:[/^(stabili[sz]ed|target|underwritten|economic|projected)( physical| economic)? occupancy$/, /^occupancy (at )?stabili[sz]ation$/], derived:true },
  taxes:{ lab:'Real estate taxes (annual $)', kind:'money', rx:[/^((real estate|property|re) )?tax(es)?$/, /^real estate taxes?$/, /^property tax(es)?$/], no:/growth|rate|%|assess|millage|reserve/ },
  insurance:{ lab:'Insurance (annual $)', kind:'money', rx:[/^(property |hazard |liability )?insurance( premium| premiums| cost)?$/], no:/reserve|growth/ },
  utilities:{ lab:'Utilities (annual $)', kind:'money', rx:[/^(common |house |owner )?utilit(y|ies)( expense| costs?)?$/], no:/reimb|recover/ },
  rm:{ lab:'Repairs and maintenance (annual $)', kind:'money', rx:[/^repairs?( (&|and) maintenance)?$/, /^maintenance( (&|and) repairs?)?$/, /^r ?& ?m$/, /^(repairs|maintenance)( and| &)? ?(repairs|maintenance)?$/], no:/reserve|capital|cap ?ex/ },
  payroll:{ lab:'Payroll / administration (annual $)', kind:'money', rx:[/^payroll/, /^(general )?(&|and)? ?admin(istration|istrative)?$/, /^(on.?site )?(staff|personnel|salaries)/] },
  mgmtPct:{ lab:'Management fee (% of income)', kind:'pct', max:0.2, rx:[/^(property |asset )?(management|mgmt|manager)( fee)?$/] },
  sourceConstruction:{ lab:'Construction budget (hard + soft)', kind:'money', min:10000, rx:[/^(total )?hard (costs?|construction( costs?)?)$/, /^construction (hard )?costs?$/, /^hard construction$/, /^base building (cost|construction)$/, /^(total )?construction (budget|cost)$/], no:/contingen|per |psf/ },
  predevMonths:{ lab:'Pre-development period (months)', kind:'months', rx:[/pre.?development (period|duration|months|term)/, /entitlement (period|duration|months)/] },
  constructionMonths:{ lab:'Construction period (months)', kind:'months', rx:[/construction (period|duration|months|term|schedule)\b/, /^months of construction/, /^build.?out (period|months)/] },
  leaseupMonths:{ lab:'Lease-up period (months)', kind:'months', rx:[/lease.?up (period|duration|months|term)/, /absorption (period|months)/] },
  pref:{ lab:'Preferred return', kind:'pct', max:0.5, rx:[/^(lp |investor )?(cumulative )?(preferred return|pref(erred)? (return|rate)|pref)/] },
  gpShare:{ lab:'GP / sponsor equity share', kind:'pct', max:0.9, rx:[/^(gp|sponsor)( co.?invest(ment)?)?( equity)?( share| %| percent| contribution)?$/, /^gp co.?invest/] }
};
/* facts with no model input yet: kept and listed */
var NOINPUT = [ ['Total development budget', /^total (project |development )?(budget|cost)\b|^total development budget|^all.in (project )?cost/], ['Soft costs', /^(total )?soft (development )?costs?$/], ['Contingency', /^(hard[- ]costs? |hard |soft |total |project )?contingency$/],
  ['Initial / debt reserves', /^(initial )?reserves?$|interest reserve|operating reserve|lease.?up reserve|liquidity reserve/], ['Loan commitment / facility', /(facility|loan) (ceiling|cap|commitment|amount|principal)|initial (construction )?loan principal|loan amount/],
  ['Net operating income', /^(net operating income|noi)\b|^cash flow after reserves/], ['Effective gross income', /^effective gross (income|revenue)|^egi$/], ['Gross potential rent', /^gross potential (base )?rent|^potential gross (revenue|rent)/],
  ['Other income', /^other income\b/], ['Replacement reserves', /^replacement reserves?/], ['Target NOI / validation', /target (stabili[sz]ed )?noi|validation target/], ['Parcel ID', /^parcel (id|number)/], ['Existing improvements', /existing (building|improvements)/],
  ['Rentable area (SF)', /^rentable (area|sf)/], ['Parking', /^(proposed )?parking( spaces)?$/], ['Equity-first threshold', /equity.first/], ['Unused commitment fee', /unused (commitment )?fee/] ];

function labelKey(L){ var lr = lload()[lnorm(L)]; if(lr) return lr.k === 'ignore' ? '__ignore' : lr.k; for(var k in F){ var d = F[k]; if(d.no && d.no.test(L)) continue; for(var i = 0; i < d.rx.length; i++) if(d.rx[i].test(L)) return k; } return null; }

/* ---------- facts from one sheet ---------- */
function sheetFacts(sh, file, out, ctx){
  var rows = sh.rows || [], r, j;
  function add(label, v, row, note){ if(!v) return; out.push({ label:String(label).trim(), v:v, file:file, sheet:sh.name, row:row + 1, note:note || '' }); }
  for(r = 0; r < rows.length; r++){
    var row = rows[r] || [], cells = []; for(j = 0; j < row.length; j++) if(row[j] != null && String(row[j]).trim() !== '') cells.push({ j:j, v:row[j] });
    if(!cells.length) continue;
    /* sentences: a few facts are stated in words ("a five-story, 120-unit community", "65% LTC", "90% LP / 10% GP"); they count as low-confidence unless another place agrees */
    cells.forEach(function(c){ if(typeof c.v === 'string' && c.v.length > 30){ var t = c.v, m2;
      if((m2 = /\b(\d[\d,]*)[- ]units?\b(?!\s*(mix|type))/i.exec(t)) && +m2[1].replace(/,/g, '') >= 2) out.push({ label:'units', v:{ n:+m2[1].replace(/,/g, ''), unit:'', text:m2[0] }, file:file, sheet:sh.name, row:r + 1, note:'Stated in a sentence', derived:true, direct:'units', prose:true });
      if((m2 = /\b(\d+(?:\.\d+)?)[- ]acres?\b/i.exec(t))) out.push({ label:'siteArea', v:{ n:parseFloat(m2[1]), unit:'acres', text:m2[0] }, file:file, sheet:sh.name, row:r + 1, note:'Stated in a sentence', derived:true, direct:'siteArea', prose:true });
      if((m2 = /(guidance|asking|purchase|offering|list|seller)\s+price[:\s]+\$\s?([\d,]+(?:\.\d+)?)/i.exec(t))) out.push({ label:'purchasePrice', v:{ n:+m2[2].replace(/,/g, ''), unit:'money', text:m2[0] }, file:file, sheet:sh.name, row:r + 1, note:'Stated in a sentence', derived:true, direct:'purchasePrice', prose:true });
      if((m2 = /(\d+(?:\.\d+)?)\s*%\s*LTC\b/i.exec(t))) out.push({ label:'conLTC', v:{ n:parseFloat(m2[1]) / 100, unit:'pct', text:m2[0] }, file:file, sheet:sh.name, row:r + 1, note:'Stated in a sentence: ' + t.slice(0, 60), derived:true, direct:'conLTC', prose:true });
      if((m2 = /(\d+(?:\.\d+)?)\s*%\s*LP\s*[\/,&]\s*(\d+(?:\.\d+)?)\s*%\s*GP/i.exec(t))) out.push({ label:'gpShare', v:{ n:parseFloat(m2[2]) / 100, unit:'pct', text:m2[0] }, file:file, sheet:sh.name, row:r + 1, note:'Equity split stated as ' + m2[0], derived:true, direct:'gpShare', prose:true }); } });
    /* "Label: value" inside one cell (prose lines, text from a PDF) */
    cells.forEach(function(c){ if(typeof c.v === 'string'){ var m = /^([A-Za-z][A-Za-z0-9 &\/.#()'-]{2,60}?)\s*[:–-]\s+(\S.*)$/.exec(c.v.trim()); if(m && !/^\d/.test(m[1]) && m[2].length < 160) add(m[1], parseVal(m[2]), r, ''); } });
    /* a label cell followed by a value cell (any column, any layout); the cells after the value are its notes */
    for(var q = 0; q < cells.length; q++){ var c = cells[q]; if(!isLabel(c.v) || q === cells.length - 1) continue;
      var nxt = cells[q + 1], pv = parseVal(nxt.v); if(!pv) continue;
      var note = cells.slice(q + 2).filter(function(x){ return typeof x.v === 'string'; }).map(function(x){ return x.v; }).join(' ; ');
      if(pv.n == null && !isLabel(nxt.v)) continue; add(c.v, pv, r, note); }
    /* a row of headings over a row of values: pair them by position */
    var nr = rows[r + 1];
    if(nr && cells.length >= 2 && cells.every(function(c){ return isLabel(c.v); })){
      var vals = cells.map(function(c){ return nr[c.j]; });
      if(vals.filter(function(x){ return x != null && String(x).trim() !== '' && parseVal(x) && parseVal(x).n != null || (x != null && /\d/.test(String(x))); }).length >= Math.ceil(cells.length / 2) && !isTableHeader(cells.map(function(c){ return c.v; })))
        cells.forEach(function(c, i){ var pv = parseVal(vals[i]); if(pv && vals[i] != null) add(c.v, pv, r + 1, ''); });
    }
  }
  tables(sh, file, out, ctx);
}
var HEAD = { units:/^(units?|# ?units|#|no\.?|number|no\.? of units|count|qty|quantity|# of units|apts?)$/, sf:/^((avg|average|unit|net|rentable)\.? )?(unit )?(sf|sq\.? ?ft\.?|square (feet|footage)|size)$|^avg unit sf$/, rent:/(monthly|market|asking|in.?place|proforma|pro forma|contract|scheduled)?\s*rent( ?\/ ?(unit|mo|month))?( per (unit|month))?$|^monthly (market )?rent$/, type:/^(unit )?(type|mix|plan|name|description|floor ?plan|category|line item|item)$/, amount:/^(budget|amount|cost|total|total cost|\$|annual amount|annual|value)$/, grp:/^(cost )?(group|type|class|classification|category)$/,
  start:/(draw|start|begin)( start)?( month)?$|^start( month)?$/, end:/(draw|end|finish)( end)?( month)?$|^end( month)?$/, lp:/^lp( split| %| share)?$/, gp:/^gp( split| %| share)?$/, tier:/^(tier|priority|hurdle|description|waterfall tier)/, timing:/timing( month)?/, klass:/^classification$|^class$/ };
function isTableHeader(a){ var n = a.map(nl), hit = 0; Object.keys(HEAD).forEach(function(k){ if(n.some(function(x){ return HEAD[k].test(x); })) hit++; }); return hit >= 2; }
function findCols(hdr){ var o = {}, n = hdr.map(function(h){ return nl(h); }); Object.keys(HEAD).forEach(function(k){ for(var i = 0; i < n.length; i++) if(n[i] && HEAD[k].test(n[i]) && o[k] == null){ o[k] = i; break; } }); return o; }
function tables(sh, file, out, ctx){
  var rows = sh.rows || [];
  for(var r = 0; r < rows.length - 2; r++){
    var hdr = rows[r] || [], cells = hdr.filter(function(x){ return x != null && String(x).trim() !== ''; });
    if(cells.length < 3 || !cells.every(function(x){ return typeof x === 'string'; })) continue;
    var col = findCols(hdr), body = [], k = r + 1;
    for(; k < rows.length; k++){ var rr = rows[k] || []; if(!rr.some(function(x){ return x != null && String(x).trim() !== ''; })) break; if(rr.filter(function(x){ return x != null && String(x).trim() !== ''; }).length < 2) break; body.push({ row:k, cells:rr }); }
    if(body.length < 2) continue;
    var num = function(x){ var p = parseVal(x); return p && p.n != null ? p.n : null; };
    /* unit mix: a type column, a units column and a rent column (size optional) */
    if(col.units != null && col.rent != null && col.type == null) col.type = 0;
    if(col.units != null && col.rent != null && col.type != null){
      var u = 0, sfT = 0, rentT = 0, n = 0, lines = [];
      body.forEach(function(b){ var t = String(b.cells[col.type] == null ? '' : b.cells[col.type]); if(/^(total|subtotal|sum|average|avg)/i.test(t.trim())) return; var un = num(b.cells[col.units]), rn = num(b.cells[col.rent]); if(un == null || un <= 0 || rn == null || rn <= 0) return;
        u += un; rentT += un * rn; n++; if(col.sf != null && num(b.cells[col.sf]) > 0) sfT += un * num(b.cells[col.sf]); lines.push(t.trim() + ' ' + un + ' @ ' + $(rn)); });
      /* a total or average row that prints its own figures: kept beside the computed ones, so a difference is shown, not hidden */
      body.forEach(function(b){ var t = String(b.cells[col.type] == null ? '' : b.cells[col.type]).trim(); if(!/^(total|subtotal|average|avg)/i.test(t)) return; var pu = num(b.cells[col.units]), pr = num(b.cells[col.rent]);
        if(pr != null && pr > 0 && n >= 2) out.push({ label:'avgRent', v:{ n:pr, unit:'money', text:String(pr) }, file:file, sheet:sh.name, row:b.row + 1, note:'Printed on the "' + t + '" row of the same table', derived:true, direct:'avgRent', printed:true });
        if(pu != null && pu > 0 && n >= 2) out.push({ label:'units', v:{ n:pu, unit:'', text:String(pu) }, file:file, sheet:sh.name, row:b.row + 1, note:'Printed on the "' + t + '" row of the same table', derived:true, direct:'units', printed:true }); });
      if(n >= 2){ add2('units', u, 'units', 'Sum of ' + n + ' unit-mix rows: ' + lines.join('; ')); add2('avgRent', Math.round(rentT / u * 100) / 100, 'money', 'Unit-weighted monthly rent over ' + n + ' rows'); if(sfT) ctx.rentableSF = Math.round(sfT);
        function add2(label, val, unit, why){ out.push({ label:label, v:{ n:val, unit:unit, text:String(val) }, file:file, sheet:sh.name, row:r + 2, note:why, direct:label, derived:true }); } }
    }
    /* budget lines: an amount column and a group/type text; summed by what the line is */
    if(col.amount != null && (col.grp != null || col.type != null)){
      var gi = col.grp != null ? col.grp : col.type, sums = {}, cnt = {}, detail = [];
      body.forEach(function(b){ var a = num(b.cells[col.amount]); if(a == null || a <= 0) return; var g = nl(b.cells[gi]);
        var kind = /hard/.test(g) ? 'hard' : /soft/.test(g) ? 'soft' : /contingen/.test(g) ? 'contingency' : /reserve/.test(g) ? 'reserve' : /financ|interest/.test(g) ? 'financing' : /land|acqui/.test(g) ? 'land' : /predev/.test(g) ? 'predev' : ''; if(!kind || /^total/.test(nl(b.cells[col.type != null ? col.type : 0]))) return;
        sums[kind] = (sums[kind] || 0) + a; cnt[kind] = (cnt[kind] || 0) + 1; });
      Object.keys(sums).forEach(function(kd){ if(cnt[kd] < 2 && kd !== 'land') return; out.push({ label:'budget:' + kd, v:{ n:sums[kd], unit:'money', text:String(sums[kd]) }, file:file, sheet:sh.name, row:r + 2, note:'Sum of ' + cnt[kd] + ' budget lines classed ' + kd, derived:true }); });
      if(col.start != null && col.end != null){ var s0 = null, e0 = null; body.forEach(function(b){ var a = num(b.cells[col.start]), e = num(b.cells[col.end]), g = nl(b.cells[gi]); if(a == null || e == null || !/hard/.test(g)) return; s0 = s0 == null ? a : Math.min(s0, a); e0 = e0 == null ? e : Math.max(e0, e); });
        if(s0 != null && e0 != null) out.push({ label:'draw window', v:{ n:e0 - s0 + 1, unit:'months', text:(e0 - s0 + 1) + ' months' }, file:file, sheet:sh.name, row:r + 2, note:'Hard-cost draws run from month ' + s0 + ' to month ' + e0, derived:true, direct:'constructionMonths' }); }
    }
    /* timing of pre-development lines: negative months before closing */
    if(col.timing != null && col.klass != null){ var mn = 0, c2 = 0; body.forEach(function(b){ var tm = num(b.cells[col.timing]); if(tm != null && tm < 0 && /predev/.test(nl(b.cells[col.klass]))){ mn = Math.min(mn, tm); c2++; } }); if(c2) out.push({ label:'predev window', v:{ n:-mn, unit:'months', text:(-mn) + ' months' }, file:file, sheet:sh.name, row:r + 2, note:'Pre-development lines are timed from month ' + mn + ' to closing', derived:true, direct:'predevMonths' }); }
    /* waterfall tiers: rows with an LP split and a GP split */
    if(col.lp != null && col.gp != null){ body.forEach(function(b){ var strs = b.cells.map(function(x){ return x == null ? '' : String(x); }), desc = strs.filter(function(t){ return /[A-Za-z]{2}/.test(t) && /irr|prefer|catch|return of|capital|residual|pro.?rata|tier/i.test(t); }).sort(function(a, c){ return c.length - a.length; })[0] || '', full = strs.join(' | '), L = nl(desc), lpv = pct(parseVal(b.cells[col.lp])), gpv = pct(parseVal(b.cells[col.gp]));
      var m;
      if(/preferred return|pref\b/.test(L) && (m = /(\d+(?:\.\d+)?)\s*%/.exec(desc))) out.push({ label:'pref', v:{ n:parseFloat(m[1]) / 100, unit:'pct', text:m[1] + '%' }, file:file, sheet:sh.name, row:b.row + 1, note:full.slice(0, 90), derived:true, direct:'pref' });
      if(/catch.?up/.test(L) && gpv != null) out.push({ label:'gpCatchup', v:{ n:gpv, unit:'pct', text:(gpv * 100) + '%' }, file:file, sheet:sh.name, row:b.row + 1, note:'GP share during catch-up: ' + full.slice(0, 80), derived:true, direct:'gpCatchup' });
      if(strs.some(function(x){ return /return of (contributed )?capital|pro.?rata/.test(nl(x)); }) && gpv != null && gpv > 0) out.push({ label:'gpShare', v:{ n:gpv, unit:'pct', text:(gpv * 100) + '%' }, file:file, sheet:sh.name, row:b.row + 1, note:'GP share of capital: ' + full.slice(0, 80), derived:true, direct:'gpShare' });
      var tiers = /irr/.test(L) ? desc.match(/(\d+(?:\.\d+)?)\s*%/g) : null; if(tiers && lpv != null){ var hi = parseFloat(tiers[tiers.length - 1]) / 100, key = /above|over|exceed|>/.test(L) ? 'tier4' : /\bfrom\b|between/.test(L) && tiers.length > 1 ? 'tier3' : 'tier2'; out.push({ label:'tier:' + key, v:{ n:hi, unit:'pct', text:(hi * 100) + '%' }, lp:lpv, file:file, sheet:sh.name, row:b.row + 1, note:desc.slice(0, 100), derived:true }); } }); }
    r = k - 1;
  }
}

/* ---------- choose the value for each model input ---------- */
function resolve(facts, ctx){
  var cand = {}, extra = [], used = {}, res0 = { rentable:null }, unknown = [];
  function put(k, val, f, why, conf){ (cand[k] = cand[k] || []).push({ k:k, val:val, f:f, why:why || '', conf:conf || 'check' }); }
  facts.forEach(function(f){
    var L = f.direct ? nl(f.direct) : nl(f.label), v = f.v, k = f.direct && F[f.direct] ? f.direct : labelKey(L); if(k === '__ignore') return; if(k && !F[k] && !/^(avgRent|hurdle2|hurdle3|gpCatchup|t[234]LP|hardContPct)$/.test(k)) k = null; var learned = !!(lload()[lnorm(f.label)]);
    if(f.label === 'units' && f.derived){ put('units', v.n, f, f.note, 'check'); return; } if(f.label === 'avgRent'){ put('avgRent', v.n, f, f.note, 'check'); return; }
    if(/^budget:/.test(f.label)){ var bk = f.label.slice(7); if(bk === 'hard') put('sourceConstruction', v.n, f, f.note); else extra.push({ label:{ soft:'Soft costs', contingency:'Contingency', reserve:'Reserves', financing:'Financing costs', land:'Land / acquisition', predev:'Pre-development' }[bk] || bk, text:$(v.n), f:f, note:f.note, key:bk }); return; }
    if(f.label === 'draw window'){ put('constructionMonths', v.n, f, f.note, 'low'); return; } if(f.label === 'predev window'){ put('predevMonths', v.n, f, f.note, 'low'); return; }
    if(/^tier:/.test(f.label)){ (ctx.tiers = ctx.tiers || {})[f.label.slice(5)] = { hi:v.n, lp:f.lp, f:f }; return; }
    if(f.derived && f.direct){ put(f.direct, v.n, f, f.note, f.prose ? 'low' : 'check'); return; }
    if(k){ var d = F[k], val = null, why = '';
      if(d.kind === 'text'){ if(v.n == null || /[A-Za-z]/.test(v.text)) val = v.text; if(k === 'propertyType' && /^\d/.test(v.text)) val = null; }
      else if(d.kind === 'money'){ val = v.n != null && (v.unit === 'money' || v.unit === '' || v.unit === 'x') ? v.n : null; if(val != null && /%/.test(v.text)) val = null; if(val != null && /\/\s*(unit|apt|apartment)/i.test(v.text + ' ' + (f.note || ''))){ (cand[k] = cand[k] || []).push({ k:k, val:val, perUnit:true, f:f, why:'Stated per unit (' + v.text.slice(0, 40) + '); multiplied by the unit count', conf:'low' }); return; } }
      else if(d.kind === 'int'){ val = v.n != null && v.n === Math.round(v.n) ? v.n : null; }
      else if(d.kind === 'area'){ val = v.n != null && (v.unit === 'sf' || v.unit === '' || /sf|sq/.test(L)) ? v.n : null; }
      else if(d.kind === 'acres'){ if(v.n != null){ val = v.unit === 'sf' || (v.unit === '' && v.n > 1000) ? v.n / 43560 : v.n; val = Math.round(val * 100) / 100; if(v.unit === 'sf') why = 'Converted from square feet'; } }
      else if(d.kind === 'pct' && v.n == null && v.text){ var eq = /=\s*(\d+(?:\.\d+)?)\s*%/.exec(v.text), allp = v.text.match(/(\d+(?:\.\d+)?)\s*%/g); if(eq) val = parseFloat(eq[1]) / 100; else if(allp && allp.length === 1) val = parseFloat(allp[0]) / 100; if(val != null) why = 'Read from "' + v.text.slice(0, 60) + '"'; }
      else if(d.kind === 'pct'){ val = v.n == null ? null : v.unit === 'pct' ? v.n / 100 : (Math.abs(v.n) <= 1 ? v.n : (Math.abs(v.n) <= 100 && !/\$/.test(v.text) ? v.n / 100 : null)); if(v.unit === 'money' && /\$/.test(v.text)) val = null;
        if(val == null && v.n != null && f.note){ var nm = /(\d+(?:\.\d+)?)\s*%\s*of\b/.exec(f.note); if(nm && (k === 'vacancy' || k === 'mgmtPct')){ val = parseFloat(nm[1]) / 100; why = 'Read from the note "' + f.note.slice(0, 60) + '" (the amount beside it is the dollar result)'; } } }
      else if(d.kind === 'months'){ val = v.n != null ? (v.unit === 'years' ? Math.round(v.n * 12) : v.n) : null; if(val == null && v.text){ var mm = /(\d+)\s*months?/.exec(v.text); if(mm) val = +mm[1]; } }
      else if(d.kind === 'years'){ if(v.n != null) val = v.unit === 'months' || /months?/.test(v.text) ? v.n / 12 : v.n; if(val == null){ var m2 = /(\d+(?:\.\d+)?)\s*(months?|years?|yrs?)/.exec(v.text); if(m2) val = /^m/.test(m2[2]) ? +m2[1] / 12 : +m2[1]; } }
      if(val != null && d.min != null && val < d.min) val = null; if(val != null && d.max != null && val > d.max) val = null;
      if(val != null && d.kind === 'text' && !val) val = null;
      if(val != null){ put(k, val, f, learned ? 'Mapped by a label you taught the reader' : why, learned ? 'check' : 'check'); return; } }
    if(k && !F[k]){ var lv = parseVal(f.v.text); if(f.v.n != null){ put(k, PCTK[k] ? pct(f.v) : f.v.n, f, 'Mapped by a label you taught the reader', 'check'); return; } }
    if(/^(net )?rentable (area|sf|square f)|^nra\b|^net rentable/.test(L) && v.n != null && v.n >= 500 && !res0.rentable){ res0.rentable = { val:v.n, f:f }; }
    for(var i = 0; i < NOINPUT.length; i++) if(NOINPUT[i][1].test(L) && v){ extra.push({ label:NOINPUT[i][0], text:v.n != null ? (v.unit === 'pct' ? (v.n).toFixed(2) + '%' : (Math.abs(v.n) <= 1 && !v.unit ? (v.n * 100).toFixed(2) + '%' : (v.unit === 'money' || Math.abs(v.n) > 999 ? $(v.n) : String(v.n)))) : v.text, f:f, note:f.note }); return; }
    if(v && v.n != null && isLabel(f.label) && !f.derived && !/^(total|sum|subtotal|page|row|item|no\.?|#|tier|test)$/i.test(f.label.trim())) unknown.push(f);
  });
  var seen = {}; extra = extra.filter(function(e){ var k2 = e.label + '|' + e.text; if(seen[k2]) return false; seen[k2] = 1; return true; });
  var seenU = {}; unknown = unknown.filter(function(u){ var k3 = lnorm(u.label); if(seenU[k3] || lload()[k3]) return false; seenU[k3] = 1; return true; }).slice(0, 80);
  return { cand:cand, extra:extra, rentable:res0.rentable, unknown:unknown };
}
function choose(res, ctx){
  var cand = res.cand, out = {}, conflicts = [];
  Object.keys(cand).forEach(function(k){
    var list = cand[k].map(function(c){ if(!c.perUnit) return c; var un = cand.units && cand.units[0] && cand.units[0].val; return un ? Object.assign({}, c, { val:Math.round(c.val * un * 100) / 100, perUnit:false }) : null; }).filter(Boolean), groups = [];
    if(!list.length) return;
    /* a sheet that lists many different values for one input is a range of cases (a sensitivity grid), not a competing statement of the input */
    var per = {}; list.forEach(function(c){ var key = c.f.file + '|' + c.f.sheet; (per[key] = per[key] || {})[typeof c.val === 'number' ? Math.round(c.val * 1e6) : c.val] = 1; });
    var rangeSheets = Object.keys(per).filter(function(key){ return Object.keys(per[key]).length >= 3; });
    if(rangeSheets.length && rangeSheets.length < Object.keys(per).length){ var dropped = list.filter(function(c){ return rangeSheets.indexOf(c.f.file + '|' + c.f.sheet) >= 0; }); list = list.filter(function(c){ return rangeSheets.indexOf(c.f.file + '|' + c.f.sheet) < 0; }); (ctx.ranges = ctx.ranges || []).push({ k:k, n:dropped.length, sheet:dropped[0].f.sheet, lo:Math.min.apply(null, dropped.map(function(c){ return c.val; })), hi:Math.max.apply(null, dropped.map(function(c){ return c.val; })) }); }
    list.forEach(function(c){ var g = groups.filter(function(x){ return typeof c.val === 'number' ? Math.abs(x.val - c.val) <= Math.max(1e-9, Math.abs(x.val) * 0.001) : (function(a, b){ a = String(a).toLowerCase().replace(/[^a-z0-9]+/g, ''); b = String(b).toLowerCase().replace(/[^a-z0-9]+/g, ''); return a === b || (a.length > 8 && b.length > 8 && (a.indexOf(b) === 0 || b.indexOf(a) === 0)); })(x.val, c.val); })[0]; if(g) g.items.push(c); else groups.push({ val:c.val, items:[c] }); });
    groups.sort(function(a, b){ var wa = a.items.reduce(function(t, i){ return t + (i.conf === 'low' ? 0.5 : 1); }, 0), wb = b.items.reduce(function(t, i){ return t + (i.conf === 'low' ? 0.5 : 1); }, 0); return wb - wa; });
    var best = groups[0], places = {}; best.items.forEach(function(i){ places[i.f.file + '|' + i.f.sheet + '|' + i.f.row] = 1; });
    var n = Object.keys(places).length, conf = n >= 2 ? 'verified' : (best.items[0].conf === 'low' ? 'low' : 'check'), why = best.items[0].why || (n >= 2 ? 'Stated in ' + n + ' places that agree' : 'Read from a labelled value');
    if(groups.length > 1){ conf = 'low'; why = 'Sources disagree: ' + groups.map(function(g){ return fmt(k, g.val) + ' (' + g.items[0].f.sheet + ', row ' + g.items[0].f.row + ')'; }).join(' vs '); conflicts.push(k); }
    out[k] = { val:best.val, conf:conf, why:why, src:best.items.map(function(i){ return i.f; }) };
  });
  /* occupancy is the complement of vacancy: it fills vacancy only when vacancy was not stated, and confirms it when they agree */
  if(out.occupancy){ var vac = 1 - out.occupancy.val; if(out.vacancy){ if(Math.abs(out.vacancy.val - vac) < 0.0006){ out.vacancy.conf = 'verified'; out.vacancy.why = 'Vacancy ' + (out.vacancy.val * 100).toFixed(1) + '% agrees with stabilized occupancy ' + (out.occupancy.val * 100).toFixed(1) + ' % (complementary, not additive)'; } } else out.vacancy = { val:Math.round(vac * 10000) / 10000, conf:'low', why:'Derived as 1 - stabilized occupancy', src:out.occupancy.src }; delete out.occupancy; }
  /* a loan rate on a development deal is the construction rate; LTV / LTC stay as stated */
  if(ctx.dev && out.acqRate && !out.conRate){ out.conRate = out.acqRate; } if(ctx.dev) delete out.acqRate; if(ctx.dev) delete out.acqAmort;
  /* only the building size the document states: net rentable area stands in for building size when no gross area was found, and says so */
  if(!out.gsf && res.rentable){ out.gsf = { val:res.rentable.val, conf:'low', why:'Net rentable area used as building size: no gross building area was stated', src:[res.rentable.f] }; }
  /* all-in rate from index plus spread when no all-in rate was stated */
  if(!out.conRate && out.debtIndexRate && out.debtSpread){ out.conRate = { val:Math.round((out.debtIndexRate.val + out.debtSpread.val) * 1e6) / 1e6, conf:'check', why:'Index ' + (out.debtIndexRate.val * 100).toFixed(2) + '% + spread ' + (out.debtSpread.val * 100).toFixed(2) + '%', src:out.debtIndexRate.src }; }
  delete out.debtIndexRate; delete out.debtSpread;
  if(out.acqLTV && ctx.dev){ delete out.acqLTV; }
  /* waterfall tiers: hurdles from the tier rows */
  if(ctx.tiers){ var t = ctx.tiers; if(t.tier2){ out.hurdle2 = { val:t.tier2.hi, conf:'check', why:'Tier read from "' + t.tier2.f.note.slice(0, 60) + '"', src:[t.tier2.f] }; out.t2LP = { val:t.tier2.lp, conf:'check', why:'LP split of that tier', src:[t.tier2.f] }; }
    if(t.tier3){ out.hurdle3 = { val:t.tier3.hi, conf:'check', why:'Tier read from "' + t.tier3.f.note.slice(0, 60) + '"', src:[t.tier3.f] }; out.t3LP = { val:t.tier3.lp, conf:'check', why:'LP split of that tier', src:[t.tier3.f] }; }
    if(t.tier4){ out.t4LP = { val:t.tier4.lp, conf:'check', why:'LP split above the top hurdle', src:[t.tier4.f] }; } }
  /* units cross-check, hard cost and contingency */
  if(out.units && cand.units && cand.units.length > 1) { /* resolved above */ }
  var cont = res.extra.filter(function(e){ return e.key === 'contingency' || e.label === 'Contingency'; })[0];
  if(cont && out.sourceConstruction){ var cv = parseFloat(String(cont.text).replace(/[^0-9.]/g, '')); if(cv > 0 && out.sourceConstruction.val > 0){ out.hardContPct = { val:Math.round(cv / out.sourceConstruction.val * 10000) / 10000, conf:'low', why:'Contingency ' + cont.text + ' over hard cost ' + $(out.sourceConstruction.val) + '; the document does not say which costs contingency applies to', src:[cont.f] }; } }
  /* the engine's construction budget is hard AND soft together (the ladder is scaled to it): add the soft costs when the documents give them, and say so */
  if(out.sourceConstruction){ var sf = res.extra.filter(function(e){ return e.key === 'soft' || /^soft costs?$/i.test(e.label); })[0], sv = sf ? parseFloat(String(sf.text).replace(/[^0-9.]/g, '')) : 0, hv = out.sourceConstruction.val;
    if(sv > 0 && hv > 0){ out.sourceConstruction = { val:hv + sv, conf:out.sourceConstruction.conf === 'verified' ? 'check' : out.sourceConstruction.conf, why:'Hard costs ' + $(hv) + ' + soft costs ' + $(sv) + ' (the budget input is hard and soft together; contingency and reserves are separate)', src:(out.sourceConstruction.src || []).concat([sf.f]) }; }
    else out.sourceConstruction.why = (out.sourceConstruction.why || '') + ' - hard costs only: no soft-cost total was found, so add the soft costs to this budget'; }
  return { fields:out, conflicts:conflicts };
}
var PCT = { acqRate:1, conLTC:1, conRate:1, conOrigFee:1, acqLTV:1, exitCap:1, saleCostPct:1, rentGrowth:1, opexGrowth:1, vacancy:1, mgmtPct:1, pref:1, gpShare:1, hurdle2:1, hurdle3:1, t2LP:1, t3LP:1, t4LP:1, hardContPct:1, gpCatchup:1 };
var LAB = { avgRent:'Average monthly rent / unit', hurdle2:'Second hurdle (IRR)', hurdle3:'Third hurdle (IRR)', t2LP:'Tier 2 split to LP', t3LP:'Tier 3 split to LP', t4LP:'Tier 4 split to LP', hardContPct:'Hard-cost contingency (%)', gpCatchup:'GP catch-up share' };
var PCTK = { hurdle2:1, hurdle3:1, gpCatchup:1, t2LP:1, t3LP:1, t4LP:1, hardContPct:1 };
function fmt(k, v){ if(typeof v !== 'number') return String(v); if(PCT[k]) return (v * 100).toFixed(2) + '%'; if(k === 'units') return Math.round(v).toLocaleString('en-US') + ' units'; if(k === 'gsf') return Math.round(v).toLocaleString('en-US') + ' SF'; if(/Months$/.test(k)) return v + ' mo'; if(k === 'holdYears' || k === 'acqAmort') return (Math.round(v * 100) / 100) + ' yrs'; if(k === 'siteArea') return v + ' acres'; return $(v); }
function label(k){ return LAB[k] || (F[k] && F[k].lab) || k; }

/* ---------- classify a file by its content, then read it ---------- */
function allLabels(parsed){ var o = []; parsed.sheets.forEach(function(sh){ (sh.rows || []).forEach(function(r){ (r || []).forEach(function(c){ if(typeof c === 'string') o.push(nl(c)); }); }); }); return o; }
function stmt0(L){ var has = function(rx){ return L.filter(function(x){ return rx.test(x); }).length; }; return has(/^(total )?(operating )?expenses?$|total operating expenses/) >= 1 && has(/^net operating income|^noi$/) >= 1 && has(/^(effective gross|total (income|revenue)|gross potential)/) >= 1; }
function classify(parsed){
  var L = allLabels(parsed), has = function(rx){ return L.filter(function(x){ return rx.test(x); }).length; };
  var dev = has(/\bhard costs?\b|\bsoft costs?\b|construction loan|\bdraw(s)?\b|contingency|waterfall|development budget|entitlement|ground.up|predevelopment|pre-development/) >= 3 || has(/development (opportunity|site|program)|proposed development|ground.up/) >= 2;
  var rr = parsed.sheets.some(function(sh){ var rows = sh.rows || []; for(var i = 0; i < Math.min(rows.length, 40); i++){ var h = (rows[i] || []).map(nl); if(h.some(function(x){ return /^(unit|apt|apartment|suite|space)( ?(#|no\.?|number|id))?$/.test(x); }) && h.some(function(x){ return /\brent\b/.test(x); }) && h.length >= 3 && rows.length - i > 5) return true; } return false; });   /* 'rent' as a word: 'Current' is a column heading in a unit mix, not a rent column */
  /* an offering memorandum or listing usually carries a rent roll or unit mix page; the whole document is still an OM, read by the OM reader */
  var listing = parsed.kind === 'pdf' && (has(/listing price|asking price|offering price|purchase price|executive summary|property overview|investment (summary|highlights)|offering memorandum|\bcap rate\b|for sale|exclusively (listed|offered)/) >= 1 || stmt0(L));
  var stmt = has(/^(total )?(operating )?expenses?$|total operating expenses/) >= 1 && has(/^net operating income|^noi$/) >= 1 && has(/^(effective gross|total (income|revenue)|gross potential)/) >= 1;
  var portfolio = parsed.sheets.length >= 4 && parsed.sheets.some(function(sh){ var rows = sh.rows || []; for(var i = 0; i < Math.min(rows.length, 12); i++){ var h = (rows[i] || []).map(nl); if(h.some(function(x){ return /^(property|asset|building)( name)?$/.test(x); }) && h.some(function(x){ return /^units?$|^sf$|^square f/.test(x); }) && rows.length - i >= 4) return true; } return false; });
  if(listing) rr = false;
  return { portfolio:portfolio, dev:dev, listing:!!listing, rentRoll:rr && !dev && !portfolio, statement:stmt && !dev && !portfolio, kind:portfolio ? 'portfolio of several properties (master workbook)' : listing && !dev ? 'offering memorandum / listing' : rr && !dev ? 'rent roll' : stmt && !dev ? 'income statement / operating statement' : dev ? 'development pro forma / offering' : 'document with labelled facts' };
}
window.bkImportClassify = function(parsed){ return classify(parsed); };
/* PDFs are read with PDF.js (text where there is a text layer, text recognition where there is not), one sheet of rows per page, cells split where the page leaves a gap */
var NOUN = null;
function knownLabel(t){ var L = nl(t); if(!L) return false; if(labelKey(L)) return true; for(var i = 0; i < NOINPUT.length; i++) if(NOINPUT[i][1].test(L)) return true; return false; }
function valTokens(line){ var m = line.match(/\$\s?[\d,]+(?:\.\d+)?[KMB]?|\(?-?\d[\d,]*(?:\.\d+)?\)?\s?(?:%|SF|sq\.? ?ft\.?|acres?|units?|months?|mo\b|years?|yrs?|x\b)?/gi); return m ? m.map(function(x){ return x.trim(); }) : []; }
function bestSplit(words, n, score){ var best = null, bs = -1; (function rec(i, parts){ if(parts.length === n - 1){ var last = words.slice(i).join(' '); if(!last) return; var all = parts.concat([last]), sc = all.reduce(function(t, g){ return t + (score(g) ? Math.min(3, g.split(/\s+/).length) : 0); }, 0); if(sc > bs){ bs = sc; best = all; } return; } for(var j = i + 1; j <= words.length - (n - 1 - parts.length); j++) rec(j, parts.concat([words.slice(i, j).join(' ')])); })(0, []); return best; }
function headerLike(line){ var w = line.split(/\s+/); if(w.length < 2 || w.length > 14 || /\d/.test(line)) return false; var cap = w.filter(function(x){ return /^[A-Z]/.test(x) || /^[A-Z.&\/-]+$/.test(x); }).length; return cap / w.length >= 0.7; }
function isHeadScore(g){ var n = nl(g); return Object.keys(HEAD).some(function(k){ return HEAD[k].test(n); }) || knownLabel(g); }
function pdfRows(text){
  var lines = String(text || '').split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean), rows = [], i = 0;
  while(i < lines.length){ var line = lines[i], next = lines[i + 1] || '', toks = valTokens(next);
    /* a row of headings over a row of values */
    if(headerLike(line) && toks.length >= 2 && toks.length <= 8 && next.replace(/\$?[\d,.]+\s?(%|SF|acres?|units?)?/gi, '').trim().length < 3){ var parts = bestSplit(line.split(/\s+/), toks.length, knownLabel); if(parts && parts.filter(knownLabel).length >= 2){ rows.push(parts); rows.push(toks); i += 2; continue; } }
    /* a small table: a heading line, then rows that are a label followed by figures */
    var dataRe = /^([A-Za-z0-9][A-Za-z0-9 &\/.\-]*?)\s+((?:\(?\$?-?[\d,]+(?:\.\d+)?%?\)?[KkMm]?\s*(?:weighted avg\.?)?\s*){2,})$/, d1 = dataRe.exec(next), d2 = dataRe.exec(lines[i + 2] || '');
    if(d1 && d2 && !dataRe.test(line) && w2(line) >= 2 && w2(line) <= 14){ var nc = 1 + valTokens(d1[2]).length, hp = bestSplit(line.split(/\s+/), nc, isHeadScore); if(hp){ rows.push(hp); i++; while(i < lines.length && dataRe.test(lines[i])){ var dm = dataRe.exec(lines[i]); rows.push([dm[1].trim()].concat(valTokens(dm[2]))); i++; } continue; } }
    /* "Label  value": a known label at the start of the line */
    var w = line.split(/\s+/), done = false;
    for(var n = Math.min(6, w.length - 1); n >= 1 && !done; n--){ var pre = w.slice(0, n).join(' '); if(knownLabel(pre) && !/[:]$/.test(pre)){ rows.push([pre, w.slice(n).join(' ')]); done = true; } }
    if(!done) rows.push([line]); i++; }
  return rows; }
window.bkImportPdfRows = function(text){ return pdfRows(text); };
function w2(l){ return l.split(/\s+/).length; }
function pdfParsed(f){ if(typeof window.bkOMPageText !== 'function') return Promise.resolve(null);
  return window.bkOMPageText(f).then(function(pages){ var sheets = pages.map(function(t, i){ return { name:'page ' + (i + 1), rows:pdfRows(t) }; }); return sheets.length ? { kind:'pdf', sheets:sheets } : null; }).catch(function(){ return null; }); }
function readOne(f){
  var first = /\.pdf$/i.test(f.name) ? pdfParsed(f) : Promise.resolve(null);
  return first.then(function(pp){ return pp || window.bkImportParseFile(f); }).then(function(parsed){
    var cls = classify(parsed), info = { name:f.name, kind:cls.kind, cls:cls, parsed:parsed };
    if(parsed.unreadable) info.note = 'The text in this PDF could not be read (it may be a scanned image). Use the Offering memorandum reader on a text PDF, or upload the Excel version.';
    return { f:f, info:info };
  });
}
function ingest(files){
  S.busy = true; S.msg = 'Reading ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '...'; S.routed = ''; showSheet('Import');
  Promise.all(Array.prototype.map.call(files, function(f){ return readOne(f).catch(function(e){ return { f:f, info:{ name:f.name, kind:'unreadable', err:String(e && e.message || e) } }; }); })).then(function(rs){
    /* a lone rent roll or plain operating statement goes to the existing, tested reader for it */
    if(rs.length === 1 && rs[0].info.cls){ var c = rs[0].info.cls, f0 = rs[0].f;
      if(c.portfolio){ S.busy = false; S.routed = 'portfolio'; S.files.push(rs[0]); showSheet('Portfolio Import'); setTimeout(function(){ var inp = document.getElementById('bkMasterFile'); if(inp && window.DataTransfer){ var dt = new DataTransfer(); dt.items.add(f0); inp.files = dt.files; if(typeof window.bkImportMasterFile === 'function') window.bkImportMasterFile(); } }, 250); return; }
      if(c.rentRoll && typeof window.bkRRRun === 'function'){ S.busy = false; S.routed = 'rent roll'; window.bkRRRun({ files:[f0] }); return; }
      if(c.statement && !/\.pdf$/i.test(f0.name) && typeof window.bkImportRun === 'function'){ S.busy = false; S.routed = 'operating statement'; window.bkImportRun({ files:[f0] }); return; }
      if(!c.dev && /\.pdf$/i.test(f0.name) && typeof window.bkOMRun === 'function'){ S.busy = false; S.routed = 'offering memorandum / listing'; window.bkOMRun({ files:[f0] }); return; } }
    var facts = [], ctx = { dev:false };
    rs.forEach(function(x){ S.files.push(x); if(!x.info.parsed) return; if(x.info.cls.dev) ctx.dev = true; x.info.parsed.sheets.forEach(function(sh){ sheetFacts(sh, x.f.name, facts, ctx); }); });
    var all = S.facts.concat(facts); S.facts = all;
    var res = resolve(all, ctx); S.res = res; S.pick = choose(res, ctx); S.dev = ctx.dev || S.dev;
    /* name fallback: the title at the top of the first sheet or page */
    if(!S.pick.fields.name){ var first = rs.filter(function(x){ return x.info.parsed; })[0]; if(first){ var rows = first.info.parsed.sheets[0].rows || [], t = ''; for(var i = 0; i < Math.min(6, rows.length) && !t; i++) (rows[i] || []).forEach(function(c){ if(!t && typeof c === 'string' && c.length > 5 && c.length < 70 && /[A-Za-z]/.test(c)) t = c.trim(); });
        t = t.replace(/\s*[—–-]\s*(\w+\s+){0,2}(pro forma|offering memorandum|budget|summary|model|analysis|underwriting)\b.*$/i, '').replace(/\b(development|pro forma|offering memorandum)\b.*$/i, '').trim(); if(t) S.pick.fields.name = { val:t.replace(/\b([A-Z])([A-Z]+)\b/g, function(m, a, b){ return a + b.toLowerCase(); }), conf:'low', why:'No name was labelled; this is the title at the top of "' + first.f.name + '"', src:[] }; } }
    S.busy = false; S.msg = ''; showSheet('Import');
  });
}
window.bkImportHubRun = function(inp){ var fs = inp && inp.files ? inp.files : []; if(!fs.length) return; ingest(fs); };
window.bkImportHubReset = function(){ S = { files:[], facts:[], cand:null, msg:'', busy:false, routed:'' }; showSheet('Import'); };
window.bkImportHubTeach = function(i, k){ var list = S.teach || []; var lab = list[i]; if(!lab || !k) return; window.bkImportLearn.set(lab, k); var ctx = { dev:!!S.dev }; S.res = resolve(S.facts, ctx); S.pick = choose(S.res, ctx); S.msg = 'Learned: "' + lab + '" is ' + (k === 'ignore' ? 'ignored' : label(k)) + '. It will be applied to every file from now on.'; showSheet('Import'); };
function teachSelect(lab){ S.teach = S.teach || []; var i = S.teach.indexOf(lab); if(i < 0){ S.teach.push(lab); i = S.teach.length - 1; }
  return '<select onchange="bkImportHubTeach(' + i + ', this.value)" style="max-width:150px;font-size:11px"><option value="">Use as...</option>' + Object.keys(F).filter(function(k){ return k !== 'occupancy'; }).map(function(k){ return '<option value="' + k + '">' + esc(F[k].lab) + '</option>'; }).join('') + '<option value="avgRent">Average monthly rent / unit</option><option value="ignore">Ignore this label</option></select>'; }
window.bkImportHubSkip = function(k){ if(S.pick && S.pick.fields[k]){ S.pick.fields[k].skip = !S.pick.fields[k].skip; showSheet('Import'); } };
function dealFields(){ var o = {}; Object.keys(S.pick.fields).forEach(function(k){ var f = S.pick.fields[k]; if(!f.skip) o[k] = f.val; }); return o; }
window.bkImportHubCreate = function(){
  if(!S.pick) return; var fl = dealFields(), nm = (document.getElementById('bkImpName') || {}).value || fl.name || 'Imported deal', slug = String(nm).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase().slice(0, 24) || 'IMPORT';
  var dev = S.dev || fl.sourceConstruction != null || fl.constructionMonths != null, d = Object.assign({}, fl); delete d.name;
  var loc = fl.location || ''; var m = /,\s*([A-Za-z .]+?),?\s*([A-Z]{2})\b\s*\d{0,5}/.exec(loc); if(m) d.location = m[1].trim() + ', ' + m[2];
  if(dev){ d.devBudgetMode = 'SOURCE'; } if(fl.propertyType){ d.propertyType = /apart|multi|residential|mf/i.test(fl.propertyType) ? 'Multifamily' : /office/i.test(fl.propertyType) ? 'Office' : /industrial|flex|warehouse/i.test(fl.propertyType) ? 'Industrial' : /retail|shop/i.test(fl.propertyType) ? 'Retail' : fl.propertyType; } else if(/multifamily|apartment/i.test(JSON.stringify(fl))) { /* not inferred */ }
  var shape = (dev && fl.sourceConstruction != null && typeof window.bkDevLadderShape === 'function') ? window.bkDevLadderShape() : {};   /* a total budget with no trade lines: the cost ladder takes the app's standard split, scaled to that total */
  var deal = Object.assign({ name:nm, dealId:'IMP-' + slug, dealType:dev ? 'Development' : 'Acquisition', analysisType:dev ? 'development' : 'acquisition', blankStructure:true }, shape, d);
  if(fl.propertyType && /multi|apart/i.test(fl.propertyType + ' ' + (fl.name || ''))) deal.propertyType = 'Multifamily';
  if(typeof bkCreateNewDeal === 'function') bkCreateNewDeal(deal);
  var C = { fields:{} }; Object.keys(S.pick.fields).forEach(function(k){ var f = S.pick.fields[k]; if(!f.skip) C.fields[k] = { l:f.conf, why:f.why }; });
  var s = bkLoad(); if(window.bkConf){ window.bkConf.stamp(s, C, S.files.map(function(x){ return x.f.name; }).join(', ')); } bkSave(s);
  var jobs = S.files.map(function(x){ return typeof window.bkDocsAdd === 'function' ? window.bkDocsAdd(/\.pdf$/i.test(x.f.name) ? 'om' : 'other', x.f, 'IMP-' + slug) : null; }).filter(Boolean);
  Promise.all(jobs).catch(function(){}).then(function(){ if(typeof window.bkGuideAfterImport === 'function') window.bkGuideAfterImport('OM'); else showSheet('Deal Underwrite'); });
};
window.bkImportHubFill = function(){
  if(!S.pick) return; var fl = dealFields(), s = bkLoad(), n = 0, kept = [];
  Object.keys(fl).forEach(function(k){ if(k === 'name' || k === 'avgRent' || k === 'location') { if(!(s[k] === '' || s[k] == null)) return; } var cur = s[k]; if(cur === '' || cur == null || cur === 0){ s[k] = fl[k]; n++; } else if(cur !== fl[k]) kept.push(k); });
  bkSave(s); S.msg = 'Filled ' + n + ' empty input' + (n === 1 ? '' : 's') + (kept.length ? '. Left ' + kept.length + ' filled input' + (kept.length === 1 ? '' : 's') + ' unchanged (' + kept.map(label).join(', ') + ').' : '.'); showSheet('Import'); };

/* ---------- the tab ---------- */
function uploadBox(){ var box = window.bkConf ? window.bkConf.box : function(h){ return '<div class="note-flag">' + h + '</div>'; };
  return box('<b>Upload</b><div style="margin:8px 0"><input id="bkImportHubFile" type="file" multiple accept=".pdf,.xlsx,.xlsm,.csv" onchange="bkImportHubRun(this)"' + (S.busy ? ' disabled' : '') + '></div>'
    + '<div style="font-size:12px;opacity:.75">PDF, Excel (.xlsx, .xlsm) or CSV; add several together (an OM and its pro forma, say). The reader works out what each file is from what is in it, finds the inputs wherever they sit, and shows where each came from. A rent roll, an operating statement or a listing is read by its dedicated reader; pro formas, budgets and development offerings are read for labelled facts and tables; a workbook of several properties goes to Portfolio Import. Nothing is sent to a server.</div>'
    + (S.busy ? '<div style="margin-top:8px"><b>' + esc(S.msg) + '</b></div>' : '') + (S.msg && !S.busy ? '<div style="margin-top:8px">' + esc(S.msg) + '</div>' : '') + learnedLine()); }
function learnedLine(){ var n = Object.keys(window.bkImportLearn.all()).length; return n ? '<div style="font-size:12px;margin-top:8px"><b>' + n + ' label' + (n === 1 ? '' : 's') + ' learned from your corrections</b> are applied to every file. <a style="cursor:pointer" onclick="if(confirm(\'Forget everything the reader has learned from your corrections?\')){ bkImportLearn.forget(); showSheet(currentSheet); }">Forget them</a></div>' : ''; }
function render(){
  var hdr = { title:'Import', crumbs:'Inputs', desc:'Drop any document that describes a deal: an offering memorandum or listing, a T-12 or operating statement, a pro forma, a rent roll, or several together. The reader works out what each one is.', meta:{ Files:S.files.length || 'none', Found:S.pick ? Object.keys(S.pick.fields).length + ' inputs' : '-', Kind:S.dev ? 'Development' : (S.files.length ? 'Acquisition / other' : '-') }, sidebar:'' };
  var box = window.bkConf ? window.bkConf.box : function(h){ return '<div class="note-flag">' + h + '</div>'; };
  var main = uploadBox();
  if(S.files.length){ main += box('<b>What was read</b><table class="fin" style="margin-top:6px"><thead><tr><th>File</th><th>Recognized as</th><th>Sheets / pages</th></tr></thead><tbody>' + S.files.map(function(x){ return '<tr><td>' + esc(x.f.name) + '</td><td>' + esc(x.info.kind) + (x.info.note ? '<br><span style="color:#B23A2C">' + esc(x.info.note) + '</span>' : '') + (x.info.err ? '<br><span style="color:#B23A2C">' + esc(x.info.err) + '</span>' : '') + '</td><td>' + (x.info.parsed ? x.info.parsed.sheets.length : '') + '</td></tr>'; }).join('') + '</tbody></table>'); }
  if(S.pick){ var ks = Object.keys(S.pick.fields), order = Object.keys(F).concat(['avgRent', 'hardContPct', 'hurdle2', 'hurdle3', 'gpCatchup', 't2LP', 't3LP', 't4LP']);
    ks.sort(function(a, b){ return order.indexOf(a) - order.indexOf(b); });
    var cnt = { verified:0, check:0, low:0, assumed:0 }; ks.forEach(function(k){ cnt[S.pick.fields[k].conf]++; });
    main += box('<b>What the deal will start with</b> <span style="opacity:.7;font-size:12px">' + cnt.verified + ' verified · ' + cnt.check + ' check · ' + cnt.low + ' low. Untick anything you do not want. Everything not listed stays empty and shows as missing.</span>'
      + '<table class="fin" style="margin-top:6px"><thead><tr><th>Use</th><th>Input</th><th class="r">Value</th><th>Where it came from</th><th>Confidence</th><th>Not right?</th></tr></thead><tbody>' + ks.map(function(k){ var f = S.pick.fields[k], src = f.src && f.src[0] ? esc(f.src[0].file) + ' · ' + esc(f.src[0].sheet) + ' · row ' + f.src[0].row + (f.src.length > 1 ? ' (+' + (f.src.length - 1) + ' more)' : '') : 'document title';
        return '<tr' + (f.skip ? ' style="opacity:.45"' : '') + '><td><input type="checkbox"' + (f.skip ? '' : ' checked') + ' onchange="bkImportHubSkip(\'' + k + '\')"></td><td>' + esc(label(k)) + '</td><td class="r">' + esc(fmt(k, f.val)) + '</td><td style="font-size:12px">' + src + '<br><span style="opacity:.7">' + esc(f.why) + '</span></td><td>' + (window.bkConf ? window.bkConf.chip({ l:f.conf, why:f.why }) : f.conf) + '</td><td>' + (f.src && f.src[0] && f.src[0].label && !f.src[0].derived ? teachSelect(f.src[0].label) : '') + '</td></tr>'; }).join('') + '</tbody></table>'
      + '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><label style="font-size:12px">Deal name <input id="bkImpName" type="text" value="' + esc(S.pick.fields.name ? S.pick.fields.name.val : '') + '" style="width:260px"></label><button type="button" class="pl-hbtn primary" onclick="bkImportHubCreate()">Create a new deal from these</button><button type="button" class="pl-hbtn" onclick="bkImportHubFill()">Add to the open deal (empty inputs only)</button><button type="button" class="pl-hbtn" onclick="bkImportHubReset()">Start over</button></div>');
    if(S.res && S.res.unknown && S.res.unknown.length){ main += box('<details><summary style="cursor:pointer"><b>Not recognized yet (' + S.res.unknown.length + ')</b> <span style="opacity:.7;font-size:12px">labels with a number the reader could not place; teach it and it will know them in every later file</span></summary><table class="fin" style="margin-top:6px"><thead><tr><th>Label</th><th class="r">Value</th><th>Where</th><th>Teach</th></tr></thead><tbody>' + S.res.unknown.map(function(e){ return '<tr><td>' + esc(e.label) + '</td><td class="r">' + esc(e.v.unit === 'pct' ? e.v.n.toFixed(2) + '%' : (Math.abs(e.v.n) > 999 ? $(e.v.n) : e.v.text)) + '</td><td style="font-size:12px">' + esc(e.file) + ' · ' + esc(e.sheet) + ' · row ' + e.row + '</td><td>' + teachSelect(e.label) + '</td></tr>'; }).join('') + '</tbody></table></details>'); }
    if(S.res && S.res.extra.length){ main += box('<details><summary style="cursor:pointer"><b>Also found, with no input to put it in yet (' + S.res.extra.length + ')</b></summary><table class="fin" style="margin-top:6px"><thead><tr><th>Item</th><th class="r">Value</th><th>Where</th><th>Teach</th></tr></thead><tbody>' + S.res.extra.map(function(e){ return '<tr><td>' + esc(e.label) + '</td><td class="r">' + esc(e.text) + '</td><td style="font-size:12px">' + esc(e.f.file) + ' · ' + esc(e.f.sheet) + ' · row ' + e.f.row + (e.note ? '<br><span style="opacity:.7">' + esc(String(e.note).slice(0, 110)) + '</span>' : '') + '</td><td>' + (e.f && e.f.label && !e.f.derived ? teachSelect(e.f.label) : '') + '</td></tr>'; }).join('') + '</tbody></table><div style="font-size:12px;opacity:.7;margin-top:6px">These are kept with the document. They are not entered into the model because it has no input for them or they are results the model works out itself.</div></details>'); }
  }
  main += '<div style="font-size:12px;opacity:.7;margin-top:12px">Multi-property Yardi / Excel source packages with staged review: <a data-goto-sheet2="Source Ingestion" style="cursor:pointer">Source ingestion</a>.</div>';
  hdr.main = main; return hdr;
}
if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Import', render); else RENDERERS['Import'] = render;
/* one place to import: the four old entries leave the navigation (their pages stay reachable for saved links and tests) */
safe(function(){ var g = GROUPS.filter(function(x){ return x.id === 'inputs'; })[0]; if(g){ g.sheets = g.sheets.filter(function(n){ return ['Source Ingestion', 'Import Deal', 'Import OM', 'Import Rent Roll'].indexOf(n) < 0; }); var i = g.sheets.indexOf('Rent Roll'); g.sheets.splice(i < 0 ? g.sheets.length : i + 1, 0, 'Import'); } if(typeof bkBuildRail === 'function') bkBuildRail(); });
/* the older review pages (offering memorandum, statement, rent roll, source ingestion) now open inside this tab: same readers, one place */
var EMB = ['Import OM', 'Import Deal', 'Import Rent Roll', 'Source Ingestion'];
EMB.forEach(function(n){ var orig = RENDERERS[n]; if(typeof orig !== 'function' || orig.__hub) return;
  var w = function(){ var h = orig.apply(this, arguments); if(h && typeof h === 'object' && h.title){ h = Object.assign({}, h, { title:'Import', crumbs:'Inputs' }); h.main = '<div class="bk-hub-top">' + uploadBox() + '</div>' + (h.main || ''); } try { currentSheet = 'Import'; } catch(e){} return h; };
  w.__hub = true; w.__bkOriginal = orig.__bkOriginal || orig; if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer(n, w); else RENDERERS[n] = w; });
window.bkImportHubPdfRows = pdfRows;
window.bkImportHubClassify = function(parsed){ return classify(parsed); };
window.bkImportHubRead = function(parsed, name){ var facts = [], ctx = { dev:false }; ctx.dev = classify(parsed).dev; parsed.sheets.forEach(function(sh){ sheetFacts(sh, name || 'file', facts, ctx); }); var res = resolve(facts, ctx); return { facts:facts, res:res, pick:choose(res, ctx), cls:classify(parsed) }; };
})();
