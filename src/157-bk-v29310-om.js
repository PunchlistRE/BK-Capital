
/* Import OM: an offering memorandum (PDF, text or page images) becomes a deal. Page images are read with Tesseract.js (loaded on first use, runs in this browser). */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined') return;
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
/* RENT-ROLL OM LAYOUT. Many small-building OMs print a unit-by-unit rent roll, a list of expenses and the totals (gross
   income, expenses, NOI) instead of an income and expense statement; a two-building offering prints one rent roll and one
   expense column per building and a combined NOI. This reads that layout into the same shape as the statement parser
   (ie.exp, ie.noi, ...) plus the rent roll itself (o.rr) and its other income lines (o.misc). */
var RR_MONEY = /\$\s?\d[\d,]*(?:\.\d+)?|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+\.\d{2}\b/g;
var RR_LONE = /^\s*\$?\s?\d[\d,]*(?:\.\d+)?\.?\s*$/;
function rrNum(s){ var v = parseFloat(String(s).replace(/[^0-9.]/g, '')); return isFinite(v) ? v : null; }
/* money figures in a segment; an area ("1,070 SF") is not money */
function rrMoney(seg){ var out = [], m; RR_MONEY.lastIndex = 0; while((m = RR_MONEY.exec(seg))){ if(/^\s*SF\b/i.test(seg.slice(m.index + m[0].length))) continue; out.push({ v:rrNum(m[0]), i:m.index, e:m.index + m[0].length }); } return out; }
/* label / amount pairs in one segment ("Consulting $5,333.00 Accounting $3,125.00 Legal $2,060.00") */
function rrPairs(seg){ var ms = rrMoney(seg), out = [], from = 0; ms.forEach(function(m){ var lab = seg.slice(from, m.i).replace(/^[\s|:]+|[\s|:$]+$/g, '').trim(); if(/[A-Za-z]/.test(lab)) out.push({ label:lab, v:m.v }); from = m.e; }); return out; }
function rrISO(d){ var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(d || '')); return m ? m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2) : ''; }
var RR_OTHER = /^(storage|parking|cam\b|cam charges|laundry|avg laundry|property\s*tax|re tax|real estate tax|tax reimb|utility reimb|water reimb|late fees?|pet|antenna|roof|signage)/i;
var RR_COMM = /^(c\d+\b|suite\b|retail\b|store\b|shop\b|smoke|comm|office\b|restaurant|bodega|deli|salon)/i;
var RR_UNIT = /^((?:Apt|Unit|Suite|Retail|Store|Shop)\s+[\w-]+(?:\s*&\s*\w+)?|[A-Z]{0,2}\d+[A-Z]?|[A-Z]{1,2}\d*)(?:\s*-\s*Free\s*Market(?:\s*\d{4})?)?(?:\s+(.*))?$/;
function parseRR(txt, o){
  var pages = txt.map(function(t){ return String(t || '').split(/\n/); });
  var rrPages = [], expPages = [];
  pages.forEach(function(L, i){ var t = L.join('\n'); if(/rent\s*roll|rentroll/i.test(t)) rrPages.push(i); if(/\bEXPENSES\b/.test(t)) expPages.push(i); });
  if(!rrPages.length || !expPages.length) return false;
  var rows = [], misc = [], exp = [], expTotals = [], noiTot = null, noiList = [], incList = [], incTot = null, building = null;
  var monthly = /monthly|x\s*12/i.test(rrPages.map(function(i){ return txt[i]; }).join('\n'));
  pages.forEach(function(L, pi){
    var inRR = false, inExp = false, isRR = rrPages.indexOf(pi) >= 0, afterTotal = false, secMisc = [];
    for(var li = 0; li < L.length; li++){
      var line = L[li];
      var bh = /^\s*(\d[\d-]*\s+[A-Za-z][A-Za-z .]*?\b(?:AV|AVE|AVENUE|ST|STREET|RD|ROAD|BLVD|PL|PLACE|DR|DRIVE|LN|LANE|WAY))\b.*?(?:INCOME|Rent\s*roll)/i.exec(line); if(bh) building = bh[1].replace(/\s+/g, ' ').trim();
      if(/rent\s*roll|rentroll/i.test(line)){ inRR = true; afterTotal = false; secMisc = []; }
      if(/\bEXPENSES\b/.test(line)) inExp = true;
      /* a figure broken up by the layout ("$ 5 2 9 , 7 8 7 ." with "60" on the next line) is rejoined */
      var fixed = line.replace(/\$\s((?:\d\s?|,\s?)+(?:\.\s?\d?\s?\d?)?)/g, function(m, g){ return '$' + g.replace(/\s+/g, ''); });
      if(/\d\.\s*$/.test(fixed) && /^\s*\d{2}\s*$/.test(L[li + 1] || '')){ fixed = fixed.replace(/\.\s*$/, '.' + L[li + 1].trim()); li++; }
      var segs = fixed.split(/\s{2,}/).filter(function(x){ return x.trim(); });
      /* a figure printed apart from its label ("Annual Income (...)    $445,856.76") belongs to the segment before it */
      for(var sj = segs.length - 1; sj > 0; sj--){ if(RR_LONE.test(segs[sj]) && !RR_LONE.test(segs[sj - 1])){ segs[sj - 1] += ' ' + segs[sj]; segs.splice(sj, 1); } }
      for(var si = 0; si < segs.length; si++){
        var seg = segs[si].trim(), ms = rrMoney(seg); if(!ms.length) continue;
        var lab = seg.slice(0, ms[0].i).trim();
        /* totals and NOI (the last figure on the segment) */
        if(/^(total\s+)?noi\b|net\s+operating\s+income|^noi for/i.test(lab)){ var nv = ms[ms.length - 1].v; if(/^total\s+noi/i.test(lab)) noiTot = nv; else noiList.push(nv); inExp = false; continue; }
        if(/^gross\s+revenue|^total\s+(annual\s+)?income|^effective\s+gross/i.test(lab)){ incTot = ms[ms.length - 1].v; inExp = false; continue; }
        if(/^annual\s+income/i.test(lab)){ incList.push(ms[ms.length - 1].v); continue; }
        if(/^monthly\s+total|^operating\s+income|^annual\s+operating|^total\s+expenses\s*\(/i.test(lab)) continue;
        /* a rent-roll row: unit label, then the monthly rent (and an annual figure 12x it, or parking / tax columns) */
        var ratio = ms.length >= 2 && ms[0].v > 0 && Math.abs(ms[1].v / ms[0].v - 12) < 0.05;
        if((inRR && isRR && !inExp) || ratio){
          if(/^totals?:?$/i.test(lab)){ afterTotal = true; continue; }
          if(/^total\b/i.test(lab)) continue;
          if(!lab || /^rent income\b/i.test(lab) || /^unit\b/i.test(lab)) continue;
          var mon = monthly || ratio ? ms[0].v : ms[0].v / 12, dates = (seg.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g) || []).map(rrISO);
          /* other income: a row of the roll (storage, CAM, laundry) or, after the roll's total, its column totals (parking, tax) */
          if(RR_OTHER.test(lab)){ var key = lab.split(/\s+/)[0].toLowerCase(); if(afterTotal && secMisc.indexOf(key) >= 0) continue; secMisc.push(key);
            misc.push({ name:lab.replace(/^avg\s+/i, '').replace(/\s+N\/A$/i, '').trim(), amount:Math.round(mon * 100) / 100, freq:'Monthly' }); continue; }
          if(afterTotal) continue;
          var sfm = /([\d,]{3,})\s*SF\b/i.exec(lab), sf = sfm ? rrNum(sfm[1]) : 0;
          var base = lab.replace(/\s+[\d,]+\s*SF\b.*$/i, '').replace(/\s+N\/A$/i, '').replace(/\s+(\d\s*BR|JR\s*1|STUDIO|1BR|2BR|3BR)\b.*$/i, '').trim();
          /* the unit code apart from the tenant name: "C1 Clarity and Wellness ...", "Suite 4 & 5 TS Spa Corp", "3A -Free Market 2024 Bryan D. Hujsak" */
          var um = RR_UNIT.exec(base), unit = um ? um[1] : base, name = um ? (um[2] || '') : '', vacant = /\bvacant\b/i.test(seg);
          var comm = !!sf || RR_COMM.test(unit) || /\b(LLC|L\.L\.C|INC|CORP|PLLC|LTD)\b/i.test(lab);
          rows.push({ unitId:unit, tenant:vacant ? 'Vacant' : name.replace(/^-\s*/, ''), tenantType:comm ? 'Commercial' : 'Residential', sf:sf, status:vacant ? 'Vacant' : 'Occupied',
            inPlaceRent:vacant ? 0 : Math.round(mon * 100) / 100, marketRent:Math.round(mon * 100) / 100, recovery:0, leaseStart:dates[0] || '', leaseEnd:dates[1] || '',
            building:building || '', spaces:comm ? 1 + (unit.match(/&/g) || []).length : 1, unitType:((/\b(\d\s*BR|JR\s*1|STUDIO)\b/i.exec(lab) || [])[1] || '').toUpperCase() });
          continue;
        }
        if(inExp) rrPairs(seg).forEach(function(p){ if(/^total/i.test(p.label)) expTotals.push(p.v); else exp.push({ label:p.label.replace(/\s+/g, ' '), cur:p.v, pf:p.v }); });
      }
    }
  });
  if(!rows.length || !exp.length) return false;
  misc = misc.map(function(x){ return { name:/tax/i.test(x.name) ? 'Real estate tax reimbursements' : x.name.replace(/^cam charges$/i, 'CAM charges'), amount:x.amount, freq:x.freq }; });
  /* one NOI per building (printed twice is still one): the total if the OM prints one, else their sum */
  var uniq = noiList.filter(function(v, i){ return noiList.indexOf(v) === i; }), noi = noiTot != null ? noiTot : uniq.length ? uniq.reduce(function(t, v){ return t + v; }, 0) : null;
  var inc = incTot != null ? incTot : incList.length ? incList.reduce(function(t, v){ return t + v; }, 0) : null, expT = expTotals.length ? expTotals.reduce(function(t, v){ return t + v; }, 0) : exp.reduce(function(t, e){ return t + e.cur; }, 0);
  /* income less expenses when the printed NOI is missing, or matches it but lost its cents to the layout */
  if(inc != null && (noi == null || !(noi > 0) || Math.abs(inc - expT - noi) < 1)) noi = Math.round((inc - expT) * 100) / 100;
  if(noi == null) return false;
  var res = rows.filter(function(r){ return r.tenantType === 'Residential'; }), com = rows.filter(function(r){ return r.tenantType === 'Commercial'; }), sum = function(a, k){ return a.reduce(function(t, r){ return t + (Number(r[k]) || 0); }, 0); };
  var resGross = sum(res, 'marketRent') * 12, comGross = sum(com, 'marketRent') * 12, miscAnn = misc.reduce(function(t, x){ return t + x.amount * 12; }, 0);
  o.layout = 'rentroll'; o.rr = rows; o.misc = misc; o.unitsOM = o.units || null; o.units = res.length || o.units; o.commSpaces = com.reduce(function(t, r){ return t + r.spaces; }, 0); o.commSF = sum(com, 'sf');
  o.buildings = rows.reduce(function(a, r){ if(r.building && a.indexOf(r.building) < 0) a.push(r.building); return a; }, []);
  o.incOM = inc; o.expOM = expT;
  o.ie = { addl:misc.map(function(x){ return { label:x.name, cur:x.amount * 12, pf:x.amount * 12 }; }), exp:exp, expTot:{ cur:expT, pf:expT }, noi:{ cur:noi, pf:noi }, gsr:{ cur:resGross, pf:resGross }, comm:{ cur:comGross, pf:comGross },
    addTot:{ cur:miscAnn, pf:miscAnn }, egi:{ cur:resGross + comGross + miscAnn, pf:resGross + comGross + miscAnn }, noVacancy:true };
  o.sources.income = expPages[0] + 1; o.sources.noi = o.sources.income; o.sources.rentRoll = rrPages[0] + 1; o.sources.units = o.sources.rentRoll;
  o.curNOI = noi; o.pfNOI = noi;
  return true;
}
/* PRICE AND CAP RATE. Every price-like figure in the OM is collected with what it is (an asking price, a sold price, an assessed
   value, a loan balance), where it came from and how it was found. Only an unambiguous ASKING price becomes the deal's price; a
   sold or assessed value is never taken as one. Two different asking prices leave the price unset for the user to choose. */
var PR_MONEY = '\\$\\s?(\\d{1,3}\\.\\d{3},\\d{3}|\\d{1,3}(?:,\\d{3}){1,}|\\d{6,})(?![\\d,]*\\s*%)';
function prVal(s){ s = String(s || ''); var ty = /^(\d{1,3})\.(\d{3}),(\d{3})$/.exec(s); if(ty) return { v:Number(ty[1] + ty[2] + ty[3]), typo:'$' + s }; var v = parseFloat(s.replace(/,/g, '')); return isFinite(v) ? { v:v } : null; }
function prKind(label, pageText){
  var s = String(label || '').toLowerCase(), soldCtx = /\b(sold|sale date|sale type|comp status|research complete|last sale)\b/i.test(pageText);
  if(/assess|apprais|total value|market value|improvements|tax value|valuation/.test(s)) return 'assessed';
  if(/loan|mortgage|origination|debt|financ|balance/.test(s)) return 'loan';
  if(/\bsold\b|last\s*sale|prior\s*sale|sale\s*date/.test(s)) return 'sold';
  if(/asking|offering|list|purchase|guidance|to sell|\bask\b/.test(s)) return 'asking';
  if(/sale\s*price/.test(s)) return soldCtx ? 'sold' : 'asking';
  if(/^\s*price\s*$/.test(s)) return soldCtx ? 'sold' : 'asking';
  return null;
}
function findPrices(txt){
  var cands = [], add = function(c){ var key = c.value + '|' + c.kind + '|' + c.page; if(!cands.some(function(x){ return x.key === key; })){ c.key = key; cands.push(c); } };
  txt.forEach(function(pg, pi){ var L = String(pg || '').split(/\n/);
    L.forEach(function(line, li){ var m;
      /* A: the label and the figure on one line ("Price:   $4,500,000", "Sold Price $4,500,000 ($75.00/SF)", "Price $1,480,000") */
      var reA = new RegExp('(?:\\b(asking|offering|list(?:ing)?|purchase|guidance|sale|sold|last\\s*sale|assessed|appraised|total|market|contract)\\s+)?\\b(price|value|assessment)\\b([^\\d$\\n]{0,8})' + PR_MONEY, 'ig');
      while((m = reA.exec(line))){ if(/\bper\b|\/|%/i.test(m[3] || '')) continue; var lab = ((m[1] || '') + ' ' + m[2]).trim(), kind = prKind(lab, pg), pv = prVal(m[4]);
        if(kind && pv && pv.v >= 100000) add({ value:pv.v, kind:kind, page:pi + 1, label:lab, method:'label and figure on one line', typo:pv.typo || null, snippet:line.trim().slice(0, 110) }); }
      /* B: the label on a line of its own, the figure on one of the next two ("Price to Sell:" then "$6,250,000") */
      var lb = /(price\s*to\s*sell|asking\s*price(?:\s*for[^:\n]*)?|offering\s*price|list(?:ing)?\s*price|purchase\s*price|sale\s*price)\s*:?\s*$/i.exec(line);
      if(lb){ var nxt = [L[li + 1], L[li + 2]].filter(Boolean).join('  '), rm = new RegExp(PR_MONEY).exec(nxt); if(rm){ var pv2 = prVal(rm[1]), k2 = prKind(lb[1], pg); if(k2 && pv2 && pv2.v >= 100000) add({ value:pv2.v, kind:k2, page:pi + 1, label:lb[1].replace(/\s+/g, ' ').trim(), method:'figure on the line after its label', typo:pv2.typo || null, snippet:(line + ' / ' + (L[li + 1] || '')).trim().slice(0, 110) }); } }
      /* D: a row of labels with the figures in the row beneath, in the same order ("Listing Price   Total Rentable SF" over "$775,000   4,047") */
      var cellsD = line.trim().split(/\s{2,}/);
      if(cellsD.length >= 2 && cellsD.length <= 6){ var pj = -1; cellsD.forEach(function(c, q){ if(pj < 0 && /^(?:asking|offering|list(?:ing)?|purchase|guidance)\s+price$|^price$/i.test(c.trim())) pj = q; });
        if(pj >= 0){ var valsD = (L[li + 1] || '').trim().split(/\s{2,}/); if(valsD.length === cellsD.length){ var dmx = new RegExp('^' + PR_MONEY).exec(valsD[pj]); if(dmx){ var pvD = prVal(dmx[1]), kD = prKind(cellsD[pj], pg); if(kD && pvD && pvD.v >= 100000) add({ value:pvD.v, kind:kD, page:pi + 1, label:cellsD[pj].trim().toLowerCase(), method:'figure under its label', typo:pvD.typo || null, snippet:(line.trim() + ' / ' + (L[li + 1] || '').trim()).slice(0, 110) }); } } } }
      /* C: a spaced-letter heading with several labels ("P R I C E  C A P R A T E"), the figures on the next line in the same order */
      if(/^\s*(?:[A-Z] ){3,}[A-Z](?:\s{2,}(?:[A-Z] ){2,}[A-Z])*\s*$/.test(line)){ var hs = line.trim().split(/\s{2,}/).map(function(g){ return g.replace(/ /g, '').toUpperCase(); }), pi2 = -1; hs.forEach(function(w, q){ if(/^(ASKING|OFFERING|LIST|LISTING)?PRICE$/.test(w)) pi2 = q; });
        if(pi2 >= 0){ var vals = (L[li + 1] || '').trim().split(/\s{2,}/); if(vals.length === hs.length){ var cm = new RegExp('^' + PR_MONEY).exec(vals[pi2]); if(cm){ var pv3 = prVal(cm[1]); if(pv3 && pv3.v >= 100000) add({ value:pv3.v, kind:'asking', page:pi + 1, label:hs[pi2].toLowerCase(), method:'column heading and its figure', typo:pv3.typo || null, snippet:(line.trim() + ' / ' + (L[li + 1] || '').trim()).slice(0, 110) }); } } } } }); });
  var asking = cands.filter(function(c){ return c.kind === 'asking'; }), vs = []; asking.forEach(function(c){ if(vs.indexOf(c.value) < 0) vs.push(c.value); });
  var out = { candidates:cands, price:null, conflict:null, picked:null };
  if(vs.length === 1){ out.price = vs[0]; out.picked = asking.filter(function(c){ return c.value === vs[0]; }).sort(function(a, b){ return (a.method === 'label and figure on one line' ? 0 : 1) - (b.method === 'label and figure on one line' ? 0 : 1); })[0]; }
  else if(vs.length > 1) out.conflict = vs.slice();
  return out;
}
/* Printed cap rates (current and pro forma), kept separately from any rate calculated from NOI and price. */
function findCapRates(txt){
  var cur = null, pf = null, pages = {}, setv = function(k, v, pi){ if(v > 0.005 && v < 0.2){ if(k === 'pf'){ if(pf == null){ pf = v; pages.pf = pi + 1; } } else if(cur == null){ cur = v; pages.cur = pi + 1; } } };
  txt.forEach(function(pg, pi){ var L = String(pg || '').split(/\n/), m;
    L.forEach(function(line, li){
      var two = /Cap\s*Rate\s+([\d.]+)\s*%\s+([\d.]+)\s*%/i.exec(line); if(two){ setv('cur', parseFloat(two[1]) / 100, pi); setv('pf', parseFloat(two[2]) / 100, pi); }
      var re = /\b(pro\s*-?\s*forma|projected|stabili[sz]ed|in-?place|current|going-?in)?\s*cap(?:italization)?\s*rate\s*(?:of|is|:)?\s*:?\s*([\d.]+)\s*%/ig;
      while((m = re.exec(line))){ var pfx = (m[1] || '').toLowerCase(); setv(/pro|proj|stabil/.test(pfx) ? 'pf' : 'cur', parseFloat(m[2]) / 100, pi); }
      if(/^\s*(?:[A-Z] ){3,}[A-Z](?:\s{2,}(?:[A-Z] ){2,}[A-Z])*\s*$/.test(line)){ var hs = line.trim().split(/\s{2,}/).map(function(g){ return g.replace(/ /g, '').toUpperCase(); }), vals = (L[li + 1] || '').trim().split(/\s{2,}/);
        if(vals.length === hs.length) hs.forEach(function(w, q){ var pm = /^([\d.]+)\s*%$/.exec(vals[q]); if(pm && /^(PROFORMA|PROJECTED)?CAPRATE$/.test(w)) setv(/PRO|PROJ/.test(w) ? 'pf' : 'cur', parseFloat(pm[1]) / 100, pi); }); } }); });
  return { cur:cur, pf:pf, pages:pages };
}
/* OM text parser: pure function of the page texts. Works on OCR output or a PDF text layer. */
function parseOM(pages){
  var txt = pages.map(function(p){ return p || ''; });
  var all = txt.join('\n\f\n'), src = {};
  function num(s){ if(s == null) return null; var neg = /^\(/.test(s) || /^-/.test(s); var v = parseFloat(String(s).replace(/[^0-9.]/g, '')); return isFinite(v) ? (neg ? -v : v) : null; }
  function find(re, group, field, pageHint){ for(var i = 0; i < txt.length; i++){ var m = re.exec(txt[i]); if(m){ if(field) src[field] = i + 1; return m[group || 1]; } } return null; }
  var o = { sources:src, items:[] };
  /* identity: the running footer "FOR SALE - Name - 48 Street, City, ST" repeats on every page */
  var f = null, votes = {}, best = 0; for(var i = 0; i < txt.length; i++){ var fm = /FOR SALE\s*[-·•|]\s*(.+?)\s*[-·•|]\s*(\d+(?:\s*-\s*\d+)?\s+[^,\n]+?)\s*[-·•|,]\s*([A-Za-z .]+?),\s*([A-Z]{2})\b/i.exec(txt[i]); if(!fm) continue; var kk = fm.slice(1, 5).join('|'); votes[kk] = (votes[kk] || 0) + 1; if(votes[kk] > best){ best = votes[kk]; f = fm; src.name = i + 1; } }
  if(f){ o.name = f[1].trim(); o.street = f[2].trim(); o.city = f[3].trim(); o.state = f[4]; }
  /* no running footer: a street address line followed by "City, ST 12345" on the first pages (cover text often loses its
     spaces: "6 EastSidneyAvenue" / "MtVernon, NY10550") */
  if(!o.name){ var dc = function(x){ return String(x || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2').replace(/\s+/g, ' ').trim(); };
    for(i = 0; i < Math.min(3, txt.length) && !o.name; i++){ var NL = txt[i].split(/\n/); for(var nq = 0; nq < NL.length - 1; nq++){
      var st = dc(NL[nq]), ct = /^([A-Za-z .]+?),\s*([A-Z]{2})\s*(\d{5})\b/.exec(dc(NL[nq + 1]));
      if(ct && /^\d+(?:-\d+)?\s+[A-Za-z].*\b(Avenue|Ave|Street|St|Road|Rd|Boulevard|Blvd|Place|Pl|Drive|Dr|Lane|Ln|Way|Parkway|Pkwy|Court|Ct|Terrace)\.?$/i.test(st)){ o.name = st; o.street = st; o.city = ct[1].trim(); o.state = ct[2]; o.zip = ct[3]; src.name = i + 1; break; } } } }
  var z = /\b([A-Z]{2})\s*[-·]?\s*(\d{5})\b/.exec(all); if(z){ o.zip = z[2]; if(!o.state) o.state = z[1]; }
  /* price: every price-like figure with its kind; only an unambiguous asking price is taken (see findPrices) */
  var PRC = findPrices(txt); o.priceCandidates = PRC.candidates; o.priceConflict = PRC.conflict; o.price = null;
  if(PRC.price){ o.price = PRC.price; src.price = PRC.picked.page; o.priceMethod = PRC.picked.method; if(PRC.picked.method !== 'label and figure on one line') o.priceFallback = true; if(PRC.picked.typo) o.priceTypo = PRC.picked.typo; }
  var noiM = null; for(i = 0; i < txt.length && !noiM; i++){ noiM = /\bNOI\s+\$?\s?([\d,]{5,})\s+\$?\s?([\d,]{5,})/.exec(txt[i]); if(noiM) src.noi = i + 1; }
  if(noiM){ o.curNOI = num(noiM[1]); o.pfNOI = num(noiM[2]); }
  /* the broker's printed cap rates, kept as printed: they check the price below and never stand in for a calculated rate */
  var CRT = findCapRates(txt); if(CRT.cur != null || CRT.pf != null){ o.capPrinted = true; o.capRates = CRT; if(CRT.cur != null) o.curCap = CRT.cur; if(CRT.pf != null) o.pfCap = CRT.pf; }
  o.units = num(find(/\bTotal\s+(\d{1,4})\s+Units\b/i, 1, 'units')) || num(find(/\bUNITS\s+(\d{1,4})\b/i, 1, 'units')) || num(find(/Total\s+Units\s+(\d{1,4})\b/i, 1, 'units')) || num(find(/(\d{1,4})\s*[- ]?\s*units?\b/i, 1, 'units'));
  o.sf = num(find(/\bTotal\s+\d{1,4}\s+Units\s+([\d,]{4,})\s*SF/i, 1, 'sf')) || num(find(/(?:RENTABLE|LIVING|BUILDING)[^\n]{0,20}AREA\s+([\d,]{3,})\s*SF/i, 1, 'sf'))
    || num(find(/([\d,]{4,})\s*Total\s*SF\b/i, 1, 'sf')) || (function(){ var bm = /Building\s*SF\s+([\d,]{3,})\s*SF(?:\s*\|\s*([\d,]{3,})\s*SF)?/i.exec(all); return bm ? num(bm[1]) + (bm[2] ? num(bm[2]) : 0) : null; })() || num(find(/\bTotal\s+(?:Rentable\s+|Building\s+|Gross\s+)?SF\s*:?\s+([\d,]{4,})\b/i, 1, 'sf')) || num(find(/([\d,]{4,})\s*SF\b/i, 1, 'sf'));
  o.yearBuilt = num(find(/YEAR BUILT\s+(\d{4})/i, 1, 'yearBuilt'));
  o.lotAcres = num(find(/LOT SIZE[^\n]{0,30}?([\d.]+)\s*Acres/i, 1, 'lot')) || num(find(/\b(\d?\.\d+)\s*Acres/i, 1));
  o.stories = num(find(/STORIES\s+(\d+)/i, 1));
  o.parking = num(find(/PARKING\s+(\d+)\s*Spaces/i, 1, 'parking'));
  o.zoning = find(/ZONING\s+([A-Za-z0-9-]+)/i, 1);
  o.propertyType = find(/PROPERTY TYPE\s+(Multi-?family|Mixed[- ]Use|Retail|Office|Industrial|Student Housing|Senior Housing)/i, 1);
  /* unit mix */
  var mix = [], avgCur = null, avgPf = null;
  for(i = 0; i < txt.length; i++){ if(!/Unit\s*Mix/i.test(txt[i]) || !/UNIT TYPE|FLOOR\s*PLAN/i.test(txt[i])) continue; src.unitMix = i + 1;
    var hdr = null, hdrAt = -1; txt[i].split(/\n/).forEach(function(l, lq){ var hm = /^\s*(?:Unit\s*Type|Floor\s*Plan|Unit\s*Types?)\s{2,}(.+)$/i.exec(l); if(!hdr && hm){ var cl = hm[1].trim().split(/\s{2,}/).map(function(nm){ return /pro\s*-?\s*forma|projected/i.test(nm) ? 'pf' : /\b(?:high|achiev|market|asking)/i.test(nm) ? 'high' : /current|in-?place|actual/i.test(nm) ? 'cur' : /\bsf\b|sq/i.test(nm) ? 'sf' : /#|units?/i.test(nm) ? 'units' : 'x'; }); if(cl.indexOf('units') >= 0 && cl.indexOf('cur') >= 0){ hdr = cl; hdrAt = lq; } } });
    txt[i].split(/\n/).forEach(function(line, lq){ var m = /^\s*(.*?[A-Za-z].*?)\s+(\d{1,3})\s+([\d.]+)\s*%\s+\$([\d,]+)\s+(?:\$([\d,]+)\s+)?\$([\d,]+)\s*$/.exec(line);
      if(!m){
        /* No percent column: read the row by the table's own column headings ("Unit Type   # of Units   SF   Current Rent   Highest Achieved   Pro Forma Rent"), so a square-foot column is
           not mistaken for the unit count. Its totals are an annual row (skipped) and an Average row. */
        if(!hdr || lq <= hdrAt) return; var parts = line.trim().split(/\s{2,}/), lab = parts[0], vals = parts.slice(1);
        if(/^(?:annual\s+)?total/i.test(lab) || !/[A-Za-z]/.test(lab) || !vals.length || !vals.every(function(v){ return /^\$?\s?[\d,]+(?:\.\d+)?$/.test(v); })) return;
        var isAvg = /^average/i.test(lab), cols = hdr; if(isAvg){ var noU = hdr.filter(function(c){ return c !== 'units'; }), noUS = noU.filter(function(c){ return c !== 'sf'; }); cols = vals.length === hdr.length ? hdr : vals.length === noU.length ? noU : vals.length === noUS.length ? noUS : hdr; } if(vals.length !== cols.length) return;
        var rec = {}; cols.forEach(function(c, q){ if(c !== 'x') rec[c] = num(vals[q]); });
        if(isAvg){ avgCur = rec.cur || null; avgPf = rec.pf || null; return; }
        if(rec.units > 0 && rec.units < 1000 && rec.cur > 0) mix.push({ type:lab.replace(/^1BR$/i, '1 BR'), units:rec.units, cur:rec.cur, high:rec.high || null, pf:rec.pf || rec.cur, sf:rec.sf || null }); return; }
      var label = m[1].trim(); if(/^total/i.test(label)){ avgCur = num(m[4]); avgPf = num(m[6]); return; }
      mix.push({ type:label.replace(/^1BR$/i, '1 BR'), units:num(m[2]), cur:num(m[4]), high:m[5] ? num(m[5]) : null, pf:num(m[6]) }); }); break; }
  o.unitMix = mix; o.avgCur = avgCur; o.avgPf = avgPf;
  /* income and expense */
  /* Some OMs print letter-spaced section headings ("I N C O M E S U M M A R Y"). A run of five or more single capital letters
     separated by single spaces AT THE START OF A LINE is closed up (heading detection only); a label inside a row, digits and
     lower-case text are never touched. */
  var deLS = function(t){ return String(t || '').replace(/^([ \t]*)((?:[A-Z] ){4,}[A-Z])(?![A-Za-z])/gm, function(m, pre, run){ return pre + run.replace(/ /g, ''); }); };
  var IE_HEAD = function(t){ return (/OPERATING INCOME/i.test(t) && /OPERATING EXPENSES/i.test(t)) || (/INCOME ?SUMMARY/i.test(t) && /EXPENSE ?SUMMARY/i.test(t)); };
  var ie = null; for(i = 0; i < txt.length; i++){ var nt = deLS(txt[i]); if(IE_HEAD(nt)){ ie = nt; src.income = i + 1; break; } }
  if(ie){
    var sec = 'inc', sub = '', I = { addl:[], exp:[], aligned:[], twoFigure:[] }, done = false;
    /* Which period columns the table has, in the order printed ("Trailing 12", "Current", "Pro Forma"). Read from the column
       heading lines, before the first figure. The classic two-column layout (Current, Pro Forma) keeps the original reading. */
    var LINES = ie.split(/\n/), hi0 = -1; LINES.forEach(function(l, q){ if(hi0 < 0 && (/INCOME ?SUMMARY/i.test(l) || /^\s*OPERATING INCOME/i.test(l))) hi0 = q; });
    var SETS = [], PER = /(trailing\s*(?:12|twelve)(?:\s*months?)?|\bt-?12\b|\bttm\b|\bactuals?\b|\bhistorical\b)|(\bcurrent\b|\bin-?place\b|\bas-?is\b)|(pro\s*-?\s*forma|\bproforma\b|\bprojected\b|\bstabili[sz]ed\b|\byear\s*1\b)/ig;
    for(var hq = Math.max(0, hi0); hq < Math.min(LINES.length, Math.max(0, hi0) + 3); hq++){ if(/\$\s?\d{2,}|\b\d{1,3},\d{3}\b/.test(LINES[hq])) break; var pm; PER.lastIndex = 0; while((pm = PER.exec(LINES[hq]))){ var pk = pm[1] ? 't12' : pm[2] ? 'cur' : 'pf'; if(SETS.indexOf(pk) < 0) SETS.push(pk); } }
    var LEGACY = SETS.length < 2 || (SETS.length === 2 && SETS[0] === 'cur' && SETS[1] === 'pf');
    /* a row's figures, assigned to the period columns. Rows may print fewer columns than the table has (a blank period); the
       figures then belong to the LAST periods (right-aligned), which is recorded and checked against the page's own totals. */
    var rowVals = function(money){ var N = SETS.length, n = money.length, w, k;
      if(n === N){ w = 1; k = N; } else if(n === 2 * N){ w = 2; k = N; } else if(n < N){ w = 1; k = n; } else if(n % 2 === 0 && n / 2 < N){ w = 2; k = n / 2; } else { w = 1; k = N; }
      var out = {}, off = N - k; for(var j = 0; j < k; j++) out[SETS[off + j]] = money[j * w]; out.__aligned = k < N; out.__k = k; return out; };
    /* The table's own unit divisor: rows that print amount, per-unit, amount, per-unit have amount / per-unit equal to the unit
       count. It is used only to tell a two-figure other-income row (Current, Projected) from (amount, per-unit). */
    var ratios = []; LINES.forEach(function(l){ var f = (l.match(/\$?\s?\d[\d,]*(?:\.\d+)?(?!\d*%)/g) || []).filter(function(x){ return !/%$/.test(x.trim()); }); var nums = f.map(function(x){ return num(x.replace('%', '')); }).filter(function(v){ return v > 0; });
      if(/^[A-Za-z]/.test(l) && nums.length === 4 && nums[0] > nums[1] && nums[2] > nums[3] && !/%/.test(l)) ratios.push(nums[0] / nums[1]); });
    ratios.sort(function(a, b){ return a - b; }); var UDIV = null; if(ratios.length >= 3){ var med = ratios[Math.floor(ratios.length / 2)]; if(ratios.filter(function(r){ return Math.abs(r - med) <= 0.02 * med; }).length >= Math.max(3, Math.ceil(ratios.length * 0.6))) UDIV = med; }
    LINES.forEach(function(line){ if(done || /^\s*FOR SALE/i.test(line)){ done = true; return; }
      if(/^\s*ADDITIONAL INCOME/i.test(line)){ sec = 'add'; return; } if(/^\s*OPERATING EXPENSES/i.test(line) || /^\s*EXPENSE ?SUMMARY/i.test(line)){ sec = 'exp'; return; }
      var re = /\(?\$?\s?\d[\d,]*(?:\.\d+)?\)?\s*%?/g, toks = [], m, cut = -1; while((m = re.exec(line))){ if(cut < 0) cut = m.index; var t = m[0].trim(); toks.push({ pct:/%$/.test(t), v:num(t.replace('%', '')), neg:/^\(/.test(t) }); }
      if(cut < 0) return; var label = line.slice(0, cut).replace(/[\s:|]+$/, '').trim(); if(!label || /^(current|pro forma|%|\$ ?\/ ?unit)/i.test(label) || /SUMMARY\b/i.test(label)) return;
      var money = toks.filter(function(t){ return !t.pct; }).map(function(t){ return Math.abs(t.v); }), pcts = toks.filter(function(t){ return t.pct; }).map(function(t){ return t.v; });
      if(!money.length) return;
      /* "- Commercial" / "- Residential" in a label starts that sub-section; an unlabelled row (a vacancy allowance) belongs to the one before it */
      if(sec === 'inc'){ if(/\bcommercial\b/i.test(label)) sub = 'comm'; else if(/\bresidential\b/i.test(label)) sub = 'res'; }
      var put = function(key, val){ I[key] = val; if(sec === 'inc' && sub){ (I[sub] = I[sub] || {})[key] = val; } };
      /* A printed dash in the Current column ("Garage   -   $8,400   $12.00") is a nil, not a missing cell: the figures after it belong to the Pro Forma column. Without this the
         Pro Forma amount slid into Current and the page's own other income looked like it did not add up. */
      var dashLead = /(?:\s+[-\u2013\u2014])+\s*$/.exec(label);
      if(dashLead){ label = label.slice(0, dashLead.index).trim();
        if(LEGACY && sec !== 'exp' && /^(?:total additional|[A-Za-z])/.test(label) && !/net operating|effective|gross|^vacancy|loss to lease|below market/i.test(label)){
          I.nil = (I.nil || 0) + 1; var nilV = { cur:0, pf:money[0], nilCur:true };
          if(/^total additional/i.test(label)) I.addTot = nilV; else I.addl.push(Object.assign({ label:label }, nilV)); return; }
        if(LEGACY && sec === 'exp' && /^[A-Za-z]/.test(label)){ I.nil = (I.nil || 0) + 1; var nilE = { cur:0, pf:money[0], nilCur:true }; if(/^total/i.test(label)) I.expTot = nilE; else I.exp.push(Object.assign({ label:label }, nilE)); return; } }
      /* mk(fallback): the row's values per period. Legacy layouts return the original {cur, pf}; others carry every period found. */
      var V = null, mk = function(fb){ return fb; };
      if(!LEGACY){ V = rowVals(money); mk = function(fb){ var c = {}; SETS.forEach(function(s){ if(V[s] != null) c[s] = V[s]; }); return c; }; if(V.__aligned && /[A-Za-z]/.test(label) && !/^\d/.test(label)) I.aligned.push(label.replace(/[\s\-\u2013]+$/, '')); }
      var vacOf = function(base){ if(LEGACY) return base; var c = mk(), idx = 0; SETS.forEach(function(s){ if(c[s] != null){ c[s + 'Pct'] = pcts[idx] != null ? pcts[idx] / 100 : null; idx++; } }); return c; };
      if(sec === 'inc'){
        if(/gross potential/i.test(label)) put('gpr', mk({ cur:money[0], pf:money[1] }));
        else if(/loss to lease|below market/i.test(label)) put('ltl', mk({ cur:money[0], pf:money[1] }));
        else if(/gross scheduled/i.test(label)) put('gsr', mk({ cur:money[0], pf:money[1] }));
        else if(/^vacancy/i.test(label)) put('vac', vacOf({ cur:money[0], pf:money[1], curPct:pcts[0] != null ? pcts[0] / 100 : null, pfPct:pcts[1] != null ? pcts[1] / 100 : null }));
        else if(/effective rental/i.test(label)) put('eri', mk({ cur:money[0], pf:money[1] }));
        else if(/effective gross/i.test(label)) I.egi = mk({ cur:money[0], pf:money[1] });
        else if(/net operating/i.test(label)) I.noi = mk({ cur:money[0], pf:money[1] });
        else if(/^total additional/i.test(label)) I.addTot = mk({ cur:money[0], pf:money[2] != null ? money[2] : money[1] });
        else if(/\$/.test(line) && !/^(total|below|loss)/i.test(label) && /^[A-Za-z]/.test(label) && money.length >= 2){
          var addP = money[2] != null ? money[2] : (money[1] != null && money.length > 2 ? money[1] : money[0]);
          /* two figures: Current and Projected, unless the second is this table's own per-unit figure */
          if(LEGACY && money.length === 2 && UDIV && Math.abs(money[1] - money[0] / UDIV) > Math.max(1, 0.02 * money[1])){ addP = money[1]; I.twoFigure.push(label); }
          I.addl.push(Object.assign({ label:label }, mk({ cur:money[0], pf:addP }))); }
      } else if(/effective gross/i.test(label)) I.egi = mk({ cur:money[0], pf:money[1] });
      else if(/net operating/i.test(label)){ I.noi = mk({ cur:money[0], pf:money[1] }); done = true; }
      else if(sec === 'add'){ if(/^total/i.test(label)) I.addTot = mk({ cur:money[0], pf:money[2] != null ? money[2] : money[1] }); else I.addl.push(Object.assign({ label:label }, mk({ cur:money[0], pf:money[2] != null ? money[2] : money[0] }))); }
      else if(sec === 'exp'){ if(/^total/i.test(label)) I.expTot = mk({ cur:money[0], pf:money[2] != null ? money[2] : money[1] }); else I.exp.push(Object.assign({ label:label }, mk({ cur:money[0], pf:money[2] != null ? money[2] : money[0] }))); }
    });
    var PK = LEGACY ? ['cur', 'pf'] : SETS, sumP = function(a, p){ return a.reduce(function(t, e){ return t + (e[p] || 0); }, 0); };
    if(!I.egi && I.eri){ I.egi = {}; PK.forEach(function(p){ I.egi[p] = (I.eri[p] || 0) + (I.addTot ? (I.addTot[p] || 0) : 0); }); I.egi.derived = true; }
    if(!I.addTot && I.addl.length){ I.addTot = {}; PK.forEach(function(p){ I.addTot[p] = sumP(I.addl, p); }); }
    /* the periods the table carries, and for each one whether the page's own figures hold together */
    I.periods = PK.slice(); I.legacyColumns = LEGACY; I.udiv = UDIV;
    I.missing = []; PK.forEach(function(p){ var miss = I.exp.filter(function(e){ return e[p] == null; }).length; if(miss) I.missing.push({ period:p, lines:miss }); });
    I.recon = {}; PK.forEach(function(p){ var C = [], near = function(a, b){ return Math.abs(a - b) <= Math.max(2, Math.abs(b) * 0.0005); }, push = function(id, label, a, b){ C.push({ id:id, label:label, a:a, b:b, ok:near(a, b) }); };
      if(I.expTot && I.expTot[p] != null && I.exp.length && I.exp.every(function(e){ return e[p] != null; })) push('exp', 'Expense lines add to Total Expense', sumP(I.exp, p), I.expTot[p]);
      if(I.egi && I.egi[p] != null && I.expTot && I.expTot[p] != null && I.noi && I.noi[p] != null) push('noi', 'Effective Gross Income less Total Expense equals NOI', I.egi[p] - I.expTot[p], I.noi[p]);
      if(I.eri && I.eri[p] != null && I.addTot && I.addTot[p] != null && I.egi && I.egi[p] != null && !I.egi.derived) push('egi', 'Effective rental income plus other income equals Effective Gross Income', I.eri[p] + I.addTot[p], I.egi[p]);
      if(C.length) I.recon[p] = C; });
    /* a table that carries a commercial and a residential rent build */
    I.mixed = !!(I.comm && I.comm.gsr && I.res && I.res.gsr);
    /* Component totals that disagree with the printed Effective Gross Income. Nothing is decided here: the printed figures stay
       as the source's, the listed lines are kept as listed, and the combinations of lines that WOULD account for the printed
       figure are shown so the user can decide. */
    I.conflicts = {}; PK.forEach(function(p){ var rc = (I.recon[p] || []).filter(function(c){ return c.id === 'egi' && !c.ok; })[0]; if(!rc || !I.eri || I.eri[p] == null || !I.egi || I.egi[p] == null || !I.addl.length) return;
      var implied = I.egi[p] - I.eri[p], lines = I.addl.filter(function(e){ return e[p] != null; }), matches = [];
      if(lines.length <= 12){ for(var mask = 1; mask < (1 << lines.length); mask++){ var s = 0, names = []; for(var q = 0; q < lines.length; q++) if(mask & (1 << q)){ s += lines[q][p]; names.push(lines[q].label); } if(Math.abs(s - implied) <= 2 && names.length <= 4) matches.push(names); } }
      I.conflicts[p] = { listed:lines.reduce(function(tt, e){ return tt + e[p]; }, 0), implied:implied, eri:I.eri[p], egi:I.egi[p], lines:lines.map(function(e){ return { label:e.label, value:e[p] }; }), matches:matches }; });
    o.ie = I; o.periods = PK.slice();
    if(I.noi){ o.curNOI = o.curNOI || I.noi.cur; o.pfNOI = o.pfNOI || I.noi.pf; if(I.noi.t12 != null) o.t12NOI = I.noi.t12; }
  }
  /* every place the OM states a commercial area, so a conflicting statement is visible (the area changes $/SF, not income) */
  o.commSFMentions = []; txt.forEach(function(pg, pi){ var add = function(sf, why){ sf = num(sf); if(sf >= 100 && sf < 500000) o.commSFMentions.push({ sf:sf, page:pi + 1, why:why }); }, m, re1 = /([\d,]{3,7})\s*(?:square|sq\.?)\s*f(?:oo|ee)?t[^.\n]{0,40}(?:street[- ]level|ground[- ]floor|retail|commercial)/ig, re2 = /commercial[^\n]{0,40}?(?:with|:)?\s*([\d,]{3,7})\s*(?:SF|sq)/ig;
    while((m = re1.exec(pg))) add(m[1], 'stated in the description'); while((m = re2.exec(pg))) add(m[1], 'stated beside "Commercial"');
    /* a commercial rent roll table headed Tenant / SF / Rent: its Total row (or, with no total, each tenant's SF) */
    if(/^\s*Tenant\s+SF\b/im.test(pg)){ var rows = [], tot = null; pg.split(/\n/).forEach(function(l){ var r = /^\s*(.{2,60}?)\s+([\d,]{3,6})\s+\$[\d,]+(?:\.\d+)?\s+\$[\d,]+/.exec(l); if(!r || /^tenant\b/i.test(r[1])) return; if(/^total\b/i.test(r[1].trim())) tot = r; else rows.push(r); });
      if(tot) add(tot[2], 'commercial rent roll total'); else rows.forEach(function(r){ add(r[2], 'commercial rent roll: ' + r[1].trim()); }); }
    var inC = false; pg.split(/\n/).forEach(function(l){ if(/^\s*Commercial\s*$/i.test(l)) inC = true; else if(inC){ var r = /^(.{2,60}?)\s+(?:Ground Floor|Basement|\d+\w{0,2} Floor|Suite \w+|Unit \w+)\s+([\d,]{3,6})\s+\$[\d,]+\s+\$[\d,]+/i.exec(l); if(r) add(r[2], 'tenant table: ' + r[1].trim()); else if(/^\s*(total|residential)/i.test(l)) inC = false; } }); });
  if(!(o.ie && o.ie.noi && o.ie.exp && o.ie.exp.length)) parseRR(txt, o);
  if(o.price && o.curNOI && !o.curCap) o.curCap = o.curNOI / o.price;
  return o;
}


var S = { busy:false, msg:'', mode:'', result:null, basis:'cur', file:null, target:'new' };
function box(h){ return '<div style="background:var(--surface,#fff);border:1px solid var(--line,#dbe4ec);border-radius:8px;padding:14px 16px;margin-top:12px;font-size:13px;line-height:1.55;max-width:1000px">' + h + '</div>'; }
function $(n){ return n == null || !isFinite(n) ? '—' : '$' + Math.round(n).toLocaleString('en-US'); }
function pct(n, d){ return n == null || !isFinite(n) ? '—' : (n * 100).toFixed(d == null ? 2 : d) + '%'; }
function slug(s){ return String(s || 'deal').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase().slice(0, 28); }
function lat(u8){ var s = ''; for(var k = 0; k < u8.length; k += 65536) s += String.fromCharCode.apply(null, u8.subarray(k, k + 65536)); return s; }

/* page images: scanned and designed OMs are one large JPEG per page */
function pageJpegs(buf){
  var u8 = new Uint8Array(buf), s = lat(u8), out = [], re = /(\d+)\s+\d+\s+obj\s*<<([\s\S]*?)>>\s*stream\r?\n/g, m;
  while((m = re.exec(s))){ var d = m[2]; if(!/\/Subtype\s*\/Image/.test(d) || !/DCTDecode/.test(d)) continue; var w = +((/\/Width\s+(\d+)/.exec(d) || [])[1] || 0), h = +((/\/Height\s+(\d+)/.exec(d) || [])[1] || 0); if(w < 1000 || h < 700) continue;
    var a = m.index + m[0].length, b = s.indexOf('endstream', a); if(b < 0) continue; var e = b; while(e > a && (u8[e - 1] === 10 || u8[e - 1] === 13)) e--; out.push({ w:w, h:h, blob:new Blob([u8.subarray(a, e)], { type:'image/jpeg' }) }); }
  return out;
}
var CDN = 'https://cdn.jsdelivr.net/npm/', TV = '5.1.1', worker = null;
function loadScript(src){ return new Promise(function(res, rej){ var t = document.createElement('script'); t.src = src; t.onload = res; t.onerror = function(){ rej(new Error('Could not load the text-recognition engine. It needs an internet connection the first time (about 6 MB, then cached).')); }; document.head.appendChild(t); }); }
function poolSize(){ return Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)); }
function getWorker(){ if(worker) return worker;
  worker = (window.Tesseract ? Promise.resolve() : loadScript(CDN + 'tesseract.js@' + TV + '/dist/tesseract.min.js')).then(function(){
    var sch = window.Tesseract.createScheduler(), n = poolSize(), opts = { workerPath:CDN + 'tesseract.js@' + TV + '/dist/worker.min.js', corePath:CDN + 'tesseract.js-core@' + TV + '/', langPath:CDN + '@tesseract.js-data/eng@1.0.0/4.0.0_best_int', gzip:true, logger:function(){} };
    var made = []; for(var k = 0; k < n; k++) made.push(window.Tesseract.createWorker('eng', 1, opts).then(function(w){ sch.addWorker(w); }));
    return Promise.all(made).then(function(){ return sch; }); });
  worker.catch(function(){ worker = null; }); return worker; }
/* page images are read at their own resolution up to 2700 px wide: shrinking to 1900 px drops fine print such as a white-on-dark NOI bar */
function shrink(blob, maxW){ return createImageBitmap(blob).then(function(bm){ var sc = Math.min(1, (maxW || 2700) / bm.width); if(sc >= 0.98) return blob; var c = document.createElement('canvas'); c.width = Math.round(bm.width * sc); c.height = Math.round(bm.height * sc); c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height); return new Promise(function(res){ c.toBlob(function(b){ res(b || blob); }, 'image/jpeg', 0.92); }); }).catch(function(){ return blob; }); }
/* the top fifth of a page at a modest size: enough to read its heading, and a fraction of the work of reading the whole page */
function topStrip(blob){ return createImageBitmap(blob).then(function(bm){ var sc = Math.min(1, 1300 / bm.width), sh = Math.round(bm.height * 0.24), c = document.createElement('canvas'); c.width = Math.round(bm.width * sc); c.height = Math.round(sh * sc); c.getContext('2d').drawImage(bm, 0, 0, bm.width, sh, 0, 0, c.width, c.height); return new Promise(function(res){ c.toBlob(function(b){ res(b || blob); }, 'image/jpeg', 0.9); }); }).catch(function(){ return blob; }); }
function ocr(blob, maxW){ return Promise.all([getWorker(), shrink(blob, maxW)]).then(function(a){ return a[0].addJob('recognize', a[1]); }).then(function(r){ return r.data.text; }); }
/* a second opinion for tables: one worker told to treat the page as a single block of text, which keeps table rows together */
var worker6 = null;
function ocrBlock(blob, maxW){ if(!worker6) worker6 = (window.Tesseract ? Promise.resolve() : loadScript(CDN + 'tesseract.js@' + TV + '/dist/tesseract.min.js')).then(function(){ return window.Tesseract.createWorker('eng', 1, { workerPath:CDN + 'tesseract.js@' + TV + '/dist/worker.min.js', corePath:CDN + 'tesseract.js-core@' + TV + '/', langPath:CDN + '@tesseract.js-data/eng@1.0.0/4.0.0_best_int', gzip:true, logger:function(){} }); }).then(function(w){ return w.setParameters({ tessedit_pageseg_mode:'6' }).then(function(){ return w; }); });
  worker6.catch(function(){ worker6 = null; }); return Promise.all([worker6, shrink(blob, maxW)]).then(function(a){ return a[0].recognize(a[1]); }).then(function(r){ return r.data.text; }); }
/* warm the engines while the user is choosing a file, so the first scan does not wait for the download and start-up */
window.bkOMPrewarm = function(){ if(window.__bkOMWarm) return; window.__bkOMWarm = true; setTimeout(function(){ try { loadPdfJs().catch(function(){}); getWorker().catch(function(){}); } catch(e){} }, 300); };
var CK = 'bkcapital.omocr.';
function cacheKey(f){ return CK + [f.name, f.size, f.lastModified || 0].join('|'); }
function cacheGet(f){ try { var v = JSON.parse(localStorage.getItem(cacheKey(f)) || 'null'); return v && Array.isArray(v.pages) ? v : null; } catch(e){ return null; } }
function cachePut(f, info){ try { Object.keys(localStorage).filter(function(k){ return k.indexOf(CK) === 0; }).slice(0, -7).forEach(function(k){ localStorage.removeItem(k); }); localStorage.setItem(cacheKey(f), JSON.stringify({ pages:info.pages, n:info.n })); } catch(e){} }

function setMsg(t){ S.msg = t; if(typeof showSheet === 'function') showSheet('Import OM'); }
var NEED = function(o){ return o.price && o.units && o.ie && o.ie.noi && o.ie.exp && o.ie.exp.length; };
var NEEDMIN = function(o){ return o.ie && o.ie.noi && o.ie.exp && o.ie.exp.length; };
/* read the OM: text layer if it has one, otherwise OCR the pages that matter (the contents page says which) */
function readOMLegacy(file){
  var info = { method:'', pages:[], cover:null };
  return file.arrayBuffer().then(function(buf){
    var ext = typeof window.bkImportParseFile === 'function' ? window.bkImportParseFile(file).catch(function(){ return null; }) : Promise.resolve(null);
    return ext.then(function(parsed){
      var rows = parsed && !parsed.unreadable && parsed.sheets && parsed.sheets[0] ? parsed.sheets[0].rows : null;
      var tl = rows ? rows.map(function(r){ return (r || []).filter(function(c){ return c != null && c !== ''; }).join('  '); }).join('\n') : '';
      if(tl.replace(/\s+/g, '').length > 1500){ info.method = 'text'; info.pages = [tl]; return info; }
      var imgs = pageJpegs(buf); if(!imgs.length) throw new Error('This PDF has no readable text and no page images this reader can use. Export it again from the source, or use the T-12 and rent roll importers.');
      info.method = 'ocr'; info.n = imgs.length; var hit = cacheGet(file); if(hit){ info.pages = hit.pages; info.cover = coverIsPhoto(hit.pages[0]) ? imgs[0].blob : null; info.cached = true; return info; } var texts = new Array(imgs.length).fill(''), done = {};
      var step = function(i){ if(done[i] || i < 0 || i >= imgs.length) return Promise.resolve(); done[i] = 1; setMsg('Reading page ' + (i + 1) + ' of ' + imgs.length + '...'); return ocr(imgs[i].blob).then(function(t){ texts[i] = t; }); };
      var seq = function(list){ return Promise.all(list.map(step)); };
      return seq([0, 1].filter(function(i){ return i < imgs.length; })).then(function(){
        var toc = texts[1] || '', want = []; [/Executive Summary/, /Property Summary/, /Property Overview/, /Building Overview/, /Unit Mix/, /Income\s*(?:&|and)\s*Expense/, /Rent Roll/].forEach(function(re){ var m = new RegExp(re.source + '[^\\n\\d]{0,60}?(\\d{1,2})\\b[^\\n\\d]{0,30}$', 'im').exec(toc); if(m){ var p = +m[1] - 1; if(p > 1 && p < imgs.length) want.push(p); } });
        var first = want.length ? want : imgs.map(function(_, i){ return i; }).slice(2);
        return seq(first).then(function(){ var rest = imgs.map(function(_, i){ return i; }).filter(function(i){ return !done[i]; }); var go = function(){ var o = parseOM(texts); if(NEED(o) || !rest.length) return Promise.resolve(); return seq(rest.splice(0, poolSize())).then(go); }; return go(); }); }).then(function(){
        info.pages = texts; info.cover = coverIsPhoto(texts[0]) ? imgs[0].blob : null; cachePut(file, info); return info; });
    });
  });
}
var PV = '3.11.174';
function loadPdfJs(){ if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib); return loadScript(CDN + 'pdfjs-dist@' + PV + '/build/pdf.min.js').then(function(){ window.pdfjsLib.GlobalWorkerOptions.workerSrc = CDN + 'pdfjs-dist@' + PV + '/build/pdf.worker.min.js'; return window.pdfjsLib; }); }
/* one page's text content, rebuilt into lines (items on the same baseline, left to right, wide gaps kept as two spaces) */
function pageText(tc){ var rows = []; tc.items.forEach(function(it){ if(!it.str || !it.transform) return; var y = it.transform[5], fs = Math.abs(it.transform[3]) || 10, row = rows.filter(function(r){ return Math.abs(r.y - y) < fs * 0.45; })[0]; if(!row){ row = { y:y, its:[] }; rows.push(row); } row.its.push({ x:it.transform[4], w:it.width, s:it.str, fs:fs }); });
  rows.sort(function(a, b){ return b.y - a.y; });
  return rows.map(function(r){ r.its.sort(function(a, b){ return a.x - b.x; }); var out = '', end = null; r.its.forEach(function(t){ if(end != null){ var gap = t.x - end; out += gap > t.fs * 1.2 ? '  ' : gap > t.fs * 0.12 ? ' ' : ''; } out += t.s; end = t.x + t.w; }); return out.replace(/\s+$/, ''); }).filter(Boolean).join('\n'); }
function renderPage(page, width){ var v1 = page.getViewport({ scale:1 }), vp = page.getViewport({ scale:width / v1.width }), c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height); var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  return page.render({ canvasContext:ctx, viewport:vp }).promise.then(function(){ return new Promise(function(res){ c.toBlob(function(b){ res(b); }, 'image/jpeg', 0.92); }); }); }
/* image-only pages: take the picture itself at its own resolution (re-drawing the page smooths away fine print) */
function pageImage(page){ var lib = window.pdfjsLib, OPS = lib.OPS;
  return page.getOperatorList().then(function(ol){ var ids = []; for(var i = 0; i < ol.fnArray.length; i++){ var f = ol.fnArray[i]; if(f === OPS.paintImageXObject || f === OPS.paintJpegXObject) ids.push(ol.argsArray[i][0]); }
    return Promise.all(ids.map(function(id){ return new Promise(function(res){ var done = false, fin = function(o){ if(!done){ done = true; res(o); } }; try { (/^g_/.test(id) ? page.commonObjs : page.objs).get(id, fin); } catch(e){ fin(null); } setTimeout(function(){ fin(null); }, 4000); }); }));
  }).then(function(imgs){ var best = null; imgs.forEach(function(o){ if(o && o.width >= 1000 && (!best || o.width * o.height > best.width * best.height)) best = o; }); if(!best) return null;
    var c = document.createElement('canvas'); c.width = best.width; c.height = best.height; var ctx = c.getContext('2d');
    if(best.bitmap) ctx.drawImage(best.bitmap, 0, 0); else if(best.data){ var d = best.data, n = best.width * best.height, rgba = new Uint8ClampedArray(n * 4), k;
      if(d.length === n * 4) rgba.set(d); else if(d.length === n * 3){ for(k = 0; k < n; k++){ rgba[k * 4] = d[k * 3]; rgba[k * 4 + 1] = d[k * 3 + 1]; rgba[k * 4 + 2] = d[k * 3 + 2]; rgba[k * 4 + 3] = 255; } } else return null;
      ctx.putImageData(new ImageData(rgba, best.width, best.height), 0, 0); } else return null;
    return new Promise(function(res){ c.toBlob(function(b){ res(b); }, 'image/png'); }); }).catch(function(){ return null; }); }
/* read the OM with PDF.js: real text where the PDF has it (Canva, InDesign, Word), page images read by text recognition where it does not (scanned or image-only OMs, any image format) */
function readOMPdfjs(file){
  var info = { method:'', pages:[], cover:null, t:{ start:Date.now() } };
  var jpegs = null;
  return Promise.all([file.arrayBuffer(), loadPdfJs()]).then(function(a){ info.t.libs = Date.now() - info.t.start; jpegs = safe(function(){ return pageJpegs(a[0]); }, []); info.t.jpegs = Date.now() - info.t.start - info.t.libs; return a[1].getDocument({ data:new Uint8Array(a[0]) }).promise; }).then(function(doc){
    var n = doc.numPages, texts = new Array(n).fill(''), pending = [], pages = [];
    var getPage = function(i){ return pages[i] ? Promise.resolve(pages[i]) : doc.getPage(i + 1).then(function(p){ pages[i] = p; return p; }); };
    var readAll = function(i){ if(i >= n) return Promise.resolve(); setMsg('Reading page ' + (i + 1) + ' of ' + n + '...'); return getPage(i).then(function(p){ return p.getTextContent(); }).then(function(tc){ var t = pageText(tc); if(t.replace(/\s+/g, '').length >= 60) texts[i] = t; else pending.push(i); return readAll(i + 1); }); };
    return readAll(0).then(function(){
      info.t.text = Date.now() - info.t.start;
      var pendingAll = pending.slice(); info.ocrPages = pendingAll.map(function(i){ return i + 1; }); info.dbg = { pending:pending.length, jpegs:jpegs.length, n:n }; info.n = n; info.method = pending.length === 0 ? 'text' : pending.length === n ? 'ocr' : 'mixed';
      var hit = pending.length ? cacheGet(file) : null; if(hit && hit.pages.length === n){ pending.forEach(function(i){ texts[i] = hit.pages[i] || ''; }); pending = []; info.cached = true; }
      if(!pending.length) return;
      /* Faster and more accurate than reading every page at full size: (1) scan every image page small, which is quick and still finds the headings; (2) read only the pages that look like the summary, unit mix and income table at a moderate size; (3) if the income table does not add up to the OM's own NOI, read just those pages again at full size, then as a single block of text. */
      var blobs = {}, lows = {}, hi = {}, WS = window.bkOMWidths || [], W1 = WS[0] || 1800, W2 = WS[1] || 2700;
      var imgFor = function(i){ if(blobs[i]) return blobs[i];
        var jp = jpegs.length === n ? jpegs[i] : jpegs.length === pendingAll.length ? jpegs[pendingAll.indexOf(i)] : null;
        blobs[i] = jp ? Promise.resolve(jp.blob) : getPage(i).then(function(p){ return pageImage(p).then(function(b){ return b || renderPage(p, 2640); }); }); return blobs[i]; };
      var readAt = function(i, w, label){ setMsg(label + ' (page ' + (i + 1) + ' of ' + n + ')...'); return imgFor(i).then(function(b){ return ocr(b, w); }).then(function(t){ texts[i] = t; hi[i] = w; }); };
      var batches = function(list, w, label, stop){ var rest = list.slice(), go = function(){ if(!rest.length || (stop && stop())) return Promise.resolve(); return Promise.all(rest.splice(0, poolSize()).map(function(i){ return readAt(i, w, label); })).then(go); }; return go(); };
      var score = function(i){ var t = lows[i] || '', s = 0; if(/OPERATING\s+(INCOME|EXPENSES?)|NET\s+OPERATING|INCOME\s*(?:&|AND)\s*EXPENSE|\bNOI\b/i.test(t)) s += 5; if(/UNIT\s*MIX|RENT\s*ROLL/i.test(t)) s += 2; if(/OFFERING|ASKING|LIST(?:ING)?\s+PRICE|EXECUTIVE\s+SUMMARY|PROPERTY\s+(?:SUMMARY|OVERVIEW)|INVESTMENT\s+(?:SUMMARY|HIGHLIGHTS)/i.test(t)) s += 2; if(/\$\s?\d[\d,]{4,}/.test(t)) s += 1; return s; };
      var tieDiff = function(){ var o = parseOM(texts); if(!NEEDMIN(o)) return null; var r = safe(function(){ return buildDeal(Object.assign({}, o, { price:o.price || 1, units:o.units || 1 }), 'cur', 'tie'); }, null); return r && r.tie != null && r.want != null ? Math.abs(r.tie - r.want) : null; };
      var tied = function(){ var d = tieDiff(); if(d == null) return false; var o = parseOM(texts), want = o.ie && o.ie.noi ? o.ie.noi.cur : 0; return d <= Math.max(5, want * 0.002); };
      var pickRel = [], ok = function(){ return NEED(parseOM(texts)) && tied(); }, unread = function(){ return pending.filter(function(i){ return !hi[i]; }); };
      /* step 1: read each page's heading (the top strip, cheap), step 2: read in full only the pages whose headings say summary, unit mix or income and expense */
      var rest = pending.slice(), scan = rest.length > 3 ? (setMsg('Scanning ' + rest.length + ' pages...'), Promise.all(rest.map(function(i){ return imgFor(i).then(topStrip).then(function(b){ return getWorker().then(function(w){ return w.addJob('recognize', b); }); }).then(function(r){ lows[i] = r.data.text; }).catch(function(){ lows[i] = ''; }); }))) : Promise.resolve();
      return scan.then(function(){ info.t.scan = Date.now() - info.t.start;
        var order = rest.sort(function(x, y){ return (score(y) - score(x)) || ((lows[y] || '').length - (lows[x] || '').length) || (x - y); });
        var relevant = pickRel = order.filter(function(i){ return score(i) > 0 || rest.length <= 3; }), others = order.filter(function(i){ return relevant.indexOf(i) < 0; });
        return batches(relevant, W1, 'Reading the income and unit pages', ok).then(function(){ return batches(others, W1, 'Reading page', function(){ return NEED(parseOM(texts)); }); });
      }).then(function(){ info.t.read = Date.now() - info.t.start; if(!hi[0] && pending.indexOf(0) >= 0 && !texts[0]) texts[0] = lows[0] || '';
        if(tied()) return;
        var o = parseOM(texts), s = o.sources || {}, again = []; [s.income, s.noi, s.unitMix, s.price].forEach(function(p){ if(p && pending.indexOf(p - 1) >= 0 && again.indexOf(p - 1) < 0) again.push(p - 1); }); if(!NEEDMIN(o)) pickRel.slice(0, 4).forEach(function(i){ if(again.indexOf(i) < 0) again.push(i); }); if(!again.length) return;
        var best = tieDiff(), attempt = function(read){ var prev = {}; again.forEach(function(i){ prev[i] = texts[i]; }); return read().then(function(){ var d = tieDiff(); if(d != null && (best == null || d <= best)) best = d; else again.forEach(function(i){ texts[i] = prev[i]; }); }); };
        return attempt(function(){ return batches(again, W2, 'Checking the figures at full size'); }).then(function(){ if(tied()) return; return attempt(function(){ return Promise.all(again.map(function(i){ return imgFor(i).then(function(b){ return ocrBlock(b, W2); }).then(function(t){ texts[i] = t; }); })); }); });
      }).then(function(){ info.t.ocr = Date.now() - info.t.start; info.t.total = info.t.ocr; info.fullPages = Object.keys(hi).length; cachePut(file, { pages:texts, n:n }); })
      /* picture pages could not be read (no recognition engine, offline): keep the pages that have text rather than giving up on them */
      .catch(function(e){ if(pendingAll.length >= n) throw e; info.ocrError = (e && e.message) || String(e); info.ocrSkipped = pendingAll.map(function(i){ return i + 1; }); pendingAll.forEach(function(i){ if(!texts[i]) texts[i] = ''; }); });
    }).then(function(){
      info.pages = texts; if(!coverIsPhoto(texts[0])) return info;
      return getPage(0).then(function(p){ return renderPage(p, 1800); }).then(function(b){ info.cover = b; return info; }).catch(function(){ return info; }); });
  });
}
function readOM(file){ return readOMPdfjs(file).catch(function(e){ return readOMLegacy(file).catch(function(e2){ throw e2 && /no readable text/.test(e2.message || '') && e ? new Error('Could not read this PDF: ' + (e.message || e) + ' ' + e2.message) : e2; }); }); }
/* a cover page is mostly picture: no dollar figures in it. A first page of rent roll or income table is not a photo. */
function coverIsPhoto(t){ return !/\$\s?\d/.test(t || ''); }
/* the cover's photo, without the title text along its bottom */
function coverPhoto(blob){ return createImageBitmap(blob).then(function(bm){ var h = Math.round(bm.height * 0.70), c = document.createElement('canvas'); c.width = bm.width; c.height = h; c.getContext('2d').drawImage(bm, 0, 0, bm.width, h, 0, 0, bm.width, h); return new Promise(function(res){ c.toBlob(function(b){ res(new File([b], 'cover-photo.jpg', { type:'image/jpeg' })); }, 'image/jpeg', 0.9); }); }); }

function sumBy(list, rx, key){ return list.filter(function(e){ return rx.test(e.label); }).reduce(function(t, e){ return t + (e[key] || 0); }, 0); }
var CAT_RX = [['mgmt', /manag/i], ['taxes', /tax/i], ['insurance', /insur/i], ['utilities', /electric|gas|heat|water|sewer|trash|refuse|utilit/i], ['rm', /repair|maint|plumb|hvac|appliance|key\/?lock|lock(?:smith)?\b/i], ['contract', /contract|landscap|snow|janitor|pest|exterminat|cleaning|elevator|alarm|security/i], ['payroll', /payroll|salar|on-?site|super|labor/i], ['marketing', /market|advert|leasing/i]];
function autoCat(label){ for(var q = 0; q < CAT_RX.length; q++){ if(CAT_RX[q][1].test(label)) return CAT_RX[q][0]; } return 'ga'; }
function catOf(label){ return window.bkLearn.get(label) || autoCat(label); }
function buildDeal(om0, basis, fileName){
  var om = Object.assign({}, om0, { price:om0.price || S.mPrice || 0, units:om0.units || S.mUnits || 0 });
  if(!om.curCap && om.price && om.curNOI) om.curCap = om.curNOI / om.price;
  var I = om.ie, k = basis, u = om.units || 1, notes = [];
  /* a period the table does not have is an error, never a silent substitute for another column */
  if(I && I.periods && I.periods.indexOf(basis) < 0) throw new Error('This OM\'s income and expense table has no ' + basis + ' column (it has: ' + I.periods.join(', ') + ').');
  var useERI = false, gsr;
  if(basis === 't12'){
    /* a trailing-12 column often prints only the net rent: use what it prints, never another period's gross */
    gsr = I.gsr && I.gsr.t12 != null ? I.gsr.t12 : (I.gpr && I.gpr.t12 != null ? I.gpr.t12 : null);
    if(gsr == null && I.eri && I.eri.t12 != null){ gsr = I.eri.t12; useERI = true; }
  } else gsr = basis === 'cur' ? (I.gsr ? I.gsr.cur : I.gpr && I.gpr.cur) : (I.gpr ? I.gpr.pf : I.gsr && I.gsr.pf);
  var egi = I.egi ? I.egi[k] : null;
  var vacPct = useERI ? 0 : I.vac && I.vac[k + 'Pct'] != null ? I.vac[k + 'Pct'] : (I.vac && gsr && isFinite(I.vac[k] / gsr) ? I.vac[k] / gsr : 0.05);
  var other = I.addTot ? I.addTot[k] : sumBy(I.addl, /./, k), ex = I.exp, sums = {}, needs = [], decisions = {};
  /* component other-income lines that disagree with the printed EGI: the build waits for the user's decision */
  var cf0 = I.conflicts && I.conflicts[k];
  if(cf0){ var dec = (S.dec && S.dec[k]) || null;
    if(!dec){ needs.push({ key:'otherIncome', why:'The OM\'s other-income lines (' + $(cf0.listed) + ') and its printed Effective Gross Income (which implies ' + $(cf0.implied) + ') disagree.' }); other = 0; }
    else if(dec.mode === 'printed'){ other = cf0.implied; decisions.otherIncome = { mode:'printed', amount:other, note:'Other income = printed Effective Gross Income less effective rental income' }; }
    else if(dec.mode === 'lines'){ other = cf0.listed; decisions.otherIncome = { mode:'lines', amount:other, note:'All listed other-income lines, as listed' }; }
    else { var pk = (dec.picks || []); other = cf0.lines.filter(function(l){ return pk.indexOf(l.label) >= 0; }).reduce(function(tt, l){ return tt + l.value; }, 0); decisions.otherIncome = { mode:'pick', amount:other, lines:pk.slice(), note:'Lines chosen by the user' }; if(!pk.length) needs.push({ key:'otherIncome', why:'Choose which other-income lines to count.' }); } }
  ex.forEach(function(e){ var c = catOf(e.label); sums[c] = (sums[c] || 0) + (e[k] || 0); });
  var mgmt = sums.mgmt || 0, taxes = sums.taxes || 0, ins = sums.insurance || 0, util = sums.utilities || 0, rm = sums.rm || 0, con = sums.contract || 0, pay = sums.payroll || 0, mkt = sums.marketing || 0, turn = sums.turnover || 0, excl = sums.exclude || 0, has = function(c){ return !!sums[c]; };
  var lines = ex.map(function(e){ return { label:e.label, amount:e[k] || 0, cat:catOf(e.label), auto:autoCat(e.label), learned:!!window.bkLearn.get(e.label) }; });
  var used = mgmt + taxes + ins + util + rm + con + pay + mkt + turn, totExp = (I.expTot ? I.expTot[k] : ex.reduce(function(t, e){ return t + e[k]; }, 0)) - excl, ga = Math.max(0, Math.round((totExp - used) * 100) / 100);
  /* exit cap starts at the cap rate CALCULATED from the OM's in-place NOI and the price; a printed rate is used only when that cannot be calculated */
  var cap = (om.price && I.noi && I.noi.cur) ? I.noi.cur / om.price : (om.curCap || 0.06);
  var name = om.name || String(fileName || 'Imported deal').replace(/\.pdf$/i, '').replace(/\s*[-–—]\s*(offering memorandum|om|listing).*$/i, '').trim();
  var d = { dealId:'OM-' + slug(name), name:name, location:[om.city, om.state].filter(Boolean).join(', '), dealType:'Acquisition', propertyType:/multi/i.test(om.propertyType || 'Multifamily') ? 'Multifamily' : (om.propertyType || 'Multifamily'), status:'Pipeline', closing:'1/1/2027',
    units:u, gsf:om.sf || 0, commercialArea:0, parking:om.parking || 0, siteArea:om.lotAcres || 0, purchasePrice:om.price, t12noi:(I.noi && I.noi.t12 != null ? I.noi.t12 : (om.curNOI || (I.noi && I.noi.cur) || 0)),
    avgRent:Math.round(gsr / u / 12 * 100) / 100, otherIncomePerUnit:Math.round(other / u * 100) / 100, vacancy:Math.round(vacPct * 10000) / 10000, occupancy:Math.round((1 - vacPct) * 10000) / 10000, badDebtPct:0, mgmtPct:egi ? Math.round(mgmt / egi * 100000) / 100000 : 0.03,
    taxes:taxes, insurance:ins, utilities:util, rm:rm, contract:con, payroll:pay, turnover:turn, marketing:mkt, ga:ga, reserves:0,
    exitCap:Math.round(cap * 10000) / 10000, holdYears:5, rentGrowth:0.03, otherGrowth:0.02, opexGrowth:0.03, taxGrowth:0.02, commercialRentGrowth:0, closingCostsPct:0.02, saleCostPct:0.02, miscPerGSF:0 };
  if(om.layout === 'rentroll'){
    /* the OM's own rent roll is the revenue: every unit at its rent (a vacant one at its asking rent, as the OM counts it), the
       roll's parking, storage, CAM and tax lines as other income, and no vacancy, because the OM's NOI carries none */
    var multi = (om.buildings || []).length > 1;
    d.rentRoll = om.rr.map(function(r){ return { unitId:(multi && r.building ? r.building.replace(/\s+(AV|AVE|AVENUE|ST|STREET|RD|ROAD)$/i, '') + ' ' : '') + r.unitId, tenantType:r.tenantType, unitType:r.unitType, tenant:r.tenant, sf:r.sf, status:r.status, inPlaceRent:r.inPlaceRent, marketRent:r.marketRent, recovery:0, leaseStart:r.leaseStart, leaseEnd:r.leaseEnd }; });
    d.miscIncome = (om.misc || []).map(function(x){ return { name:x.name, amount:x.amount, freq:x.freq }; });
    d.otherIncomePerUnit = 0; d.vacancy = 0; d.occupancy = 1; d.commercialVacancy = 0; d.commercialArea = om.commSF || 0; d.commLeaseModel = false; d.leases = [];
    d.lossToLeasePct = 0; d.concessionPct = 0; d.rentAppliedBasis = 'In-Place';
    if(om.commSpaces) d.propertyType = 'Mixed-Use';
    var nRes = om.rr.filter(function(r){ return r.tenantType === 'Residential'; }).length, vacR = om.rr.filter(function(r){ return r.status === 'Vacant'; });
    notes.unshift('Revenue is the OM\'s unit rent roll: ' + nRes + ' apartments' + (om.commSpaces ? ' and ' + om.commSpaces + ' commercial space' + (om.commSpaces === 1 ? '' : 's') + (om.commSF ? ' (' + om.commSF.toLocaleString('en-US') + ' SF)' : '') : '') + (multi ? ' in ' + om.buildings.length + ' buildings (' + om.buildings.join(', ') + '), combined into one deal' : '') + '. The units count is apartments only.');
    notes.push('The OM\'s NOI carries no vacancy or credit loss, so vacancy starts at 0% to match it. Set your own residential and commercial vacancy on Deal Underwrite.');
    if(vacR.length) notes.push(vacR.map(function(r){ return r.unitId; }).join(', ') + ' ' + (vacR.length === 1 ? 'is' : 'are') + ' vacant; the OM counts ' + (vacR.length === 1 ? 'it' : 'them') + ' at the asking rent (' + vacR.map(function(r){ return $(r.marketRent) + '/mo'; }).join(', ') + '), and so does the deal.');
    var stale = om.rr.filter(function(r){ return r.leaseEnd && r.leaseEnd < '2026-01-01'; });
    if(stale.length) notes.push(stale.length + ' of the ' + om.rr.length + ' leases in the rent roll expired before 2026. Ask the broker for a current rent roll.');
    if(om.priceTypo) notes.push('The OM prints the price as "' + om.priceTypo + '"; it is read as ' + $(om.price) + '. Confirm it with the broker.');
    if(om.misc && om.misc.length) notes.push('Other income from the rent roll: ' + om.misc.map(function(x){ return x.name + ' ' + $(x.amount * 12) + '/yr'; }).join(', ') + '.');
  }
  /* mixed-use table: commercial rent and vacancy go to the engine's own commercial inputs. The area is the user's to state:
     it changes $/SF, not the income. Recoveries are not printed in the table, so they stay 0. */
  if(I.mixed && I.comm && I.comm.gsr && I.comm.gsr[k] != null){
    var cg = I.comm.gsr[k], cvp = I.comm.vac && I.comm.vac[k + 'Pct'] != null ? I.comm.vac[k + 'Pct'] : (I.comm.vac && I.comm.vac[k] != null && cg ? I.comm.vac[k] / cg : 0);
    if(!(S.mCommSF > 0)) needs.push({ key:'commSF', why:'The table has a commercial rent build (' + $(cg) + ' a year). Its area is needed to express that as rent per SF; the income is the same at any area.' });
    d.commercialArea = S.mCommSF > 0 ? S.mCommSF : 0; d.commercialRent = S.mCommSF > 0 ? Math.round(cg / S.mCommSF * 1e6) / 1e6 : 0; d.recovery = 0; d.commercialVacancy = Math.round(cvp * 10000) / 10000; d.propertyType = 'Mixed-Use';
    notes.push('Mixed use: residential rent ' + $(I.res.gsr[k]) + ' and commercial rent ' + $(cg) + ' a year are separate lines in the OM. Commercial rent' + (S.mCommSF > 0 ? ' is entered as ' + S.mCommSF.toLocaleString('en-US') + ' SF at $' + (cg / S.mCommSF).toFixed(2) + '/SF' : ' needs its area') + ' with the OM\'s ' + pct(cvp, 1) + ' allowance; expense recoveries are not printed and are 0.');
  }
  if(om.capRates && om.price && I.noi && I.noi.cur){ var calcCap = I.noi.cur / om.price; if(om.capRates.cur != null && Math.abs(calcCap - om.capRates.cur) > 0.0006) notes.push('The OM prints a ' + pct(om.capRates.cur) + ' cap rate, but in-place NOI divided by the price is ' + pct(calcCap) + '. The deal uses the calculated rate for its starting exit cap; the printed rate is kept only as the check.'); }
  if(decisions.otherIncome) notes.push('Other income uses your decision: ' + decisions.otherIncome.note + ' (' + $(decisions.otherIncome.amount) + ' a year).');
  d._omReported = { basis:k, noi:I.noi ? I.noi[k] : null, egi:I.egi ? I.egi[k] : null, effectiveRent:I.eri ? I.eri[k] : null, totalExpense:I.expTot ? I.expTot[k] : null };
  if(Object.keys(decisions).length) d._omDecisions = decisions;
  /* Only the commercial area outstanding: the income is the same at any area, so the NOI tie-out can still run on a stand-in area. The deal itself is not created until the area is chosen. */
  var onlyArea = needs.length && needs.every(function(x){ return x.key === 'commSF'; }), dTie = d;
  if(onlyArea && I.comm && I.comm.gsr && I.comm.gsr[k] > 0){ dTie = Object.assign({}, d, { commercialArea:1000, commercialRent:I.comm.gsr[k] / 1000 }); }
  var tie = needs.length && !(onlyArea && dTie !== d) ? null : safe(function(){ return window.bkRunWith(dTie, function(){ return bkCalc().noi; }); }, null), want = I.noi ? I.noi[k] : null;
  var PN = { t12:'Trailing 12', cur:'Current', pf:'Pro Forma' };
  if(I.periods && !I.legacyColumns) notes.push('The income and expense table has ' + I.periods.length + ' period columns (' + I.periods.map(function(p){ return PN[p]; }).join(', ') + '). This deal is underwritten on the ' + PN[basis] + ' column; the others are kept in the reconciliation below and are never substituted.');
  if(I.twoFigure && I.twoFigure.length) notes.push('Other-income rows with two figures (' + I.twoFigure.slice(0, 4).join(', ') + (I.twoFigure.length > 4 ? ', …' : '') + ') are read as Current and Projected, because the second figure is not this table\'s own per-unit figure (amount ÷ ' + (I.udiv ? I.udiv.toFixed(1) : '?') + ' units).');
  if(useERI) notes.push('The Trailing 12 column prints Effective Rental Income and Effective Gross Income but no gross potential rent, so rent is the effective rental income and vacancy is 0% (vacancy and loss are already out of it).');
  if(I.aligned && I.aligned.length && !I.legacyColumns) notes.push('Rows with fewer figures than period columns (' + I.aligned.slice(0, 5).join(', ') + (I.aligned.length > 5 ? ', …' : '') + ') were assigned to the last periods, because a blank earlier period prints nothing. Each period\'s totals are checked against the page below.');
  if(I.missing && I.missing.some(function(x){ return x.period === basis; })) notes.push('Some expense lines have no ' + PN[basis] + ' figure on the page; they are counted as not stated, and the NOI tie-out shows whether the totals still agree.');
  if(!has('mgmt')) notes.push('The OM shows no management fee. Underwriting normally includes 3% to 5% of income for management, even when the owner self-manages. Set it on Deal Underwrite.');
  if(!has('rm')) notes.push('The OM shows no repairs and maintenance line. Add an allowance on Deal Underwrite.');
  if(!om0.price) notes.push('The OM does not state a price. The price above is the one you entered.');
  notes.push('Replacement reserves are not in the OM, so they start at $0. Set them on Deal Underwrite (about $250 to $300 a unit is usual).');
  notes.push('Exit cap rate starts at the going-in cap (' + pct(cap) + ') and hold at 5 years. Growth and closing costs are the app standards. Change them to your view.');
  if(basis === 'pf') notes.push('This uses the broker pro forma. It assumes every unit reaches the rents the OM calls achievable, so treat the returns as the broker case.');
  if(om.layout !== 'rentroll' && om.unitMix && om.unitMix.length) notes.push('Rents use the average across ' + om.unitMix.map(function(m){ return m.units + ' ' + m.type; }).join(' and ') + ' (a unit-level rent roll was not extracted).');
  if(I.ltl && I.ltl.cur && basis === 'cur') notes.push('The OM shows ' + $(I.ltl.cur) + ' a year of loss to lease. In-place rents are below the rents it calls achievable.');
  return { deal:d, tie:tie, want:want, notes:notes, cap:cap, lines:lines, needs:needs };
}
/* the commercial area when the OM states one figure, however many times (the income is the same at any area; it only sets rent per SF). Two different figures leave it for you. */
function autoCommSF(om){ var v = {}; ((om && om.commSFMentions) || []).forEach(function(x){ v[x.sf] = 1; }); var k = Object.keys(v); return k.length === 1 ? Number(k[0]) : null; }
function run(file, target){
  S = { busy:true, msg:'Starting...', mode:'om', result:null, basis:S.basis || 'cur', file:file, target:target || 'new' }; showSheet('Import OM');
  return readOM(file).then(function(info){ var om = parseOM(info.pages); S.info = info; window.__bkOMState = S;
    if(!NEEDMIN(om) && looksDev(info.pages)){ S.om = om; S.info = info; S.mode = 'dev'; S.dev = { om:parseDevOM(info.pages), taxBasis:'pf' }; S.result = true; S.busy = false; S.msg = 'Read ' + file.name + '.'; showSheet('Import OM'); return; }
    if(!NEEDMIN(om) && /land for development|available parcels|sites (?:are )?available/i.test(info.pages.join('\n')) && !om.price){ S.msg = 'Read ' + file.name + '. It is a land listing with no price, unit count or financials, so there is nothing to underwrite from it yet. Keep it with the deal in Deal Documents, and use Import OM again once you have a priced offering or a pro forma.'; S.busy = false; S.result = null; S.om = om; showSheet('Import OM'); return; }
    if(!NEEDMIN(om)){ S.msg = 'Read ' + file.name + ' but could not find an income and expense table with its net operating income (found: ' + [om.price && 'price', om.units && 'units', om.ie && om.ie.noi && 'NOI'].filter(Boolean).join(', ') + '). Use Import Deal for a T-12, or Source Ingestion for other layouts.'; S.busy = false; S.result = null; S.om = om; showSheet('Import OM'); return; }
    if(om.periods && om.periods.indexOf(S.basis) < 0) S.basis = om.periods.indexOf('cur') >= 0 ? 'cur' : om.periods[0];
    S.om = om; S.info = info; S.result = true; S.busy = false; S.mPrice = null; S.mPriceFrom = null; S.mUnits = null; S.mCommSF = autoCommSF(om); S.dec = {}; S.msg = 'Read ' + file.name + ' (' + (info.ocrError ? 'text layer; ' + info.ocrSkipped.length + ' picture page' + (info.ocrSkipped.length === 1 ? '' : 's') + ' skipped, the text recognition engine did not load' : info.method === 'text' ? 'text layer' : info.method === 'mixed' ? 'text layer, and page images read by text recognition' : (info.cached ? 'text recognised from page images earlier on this computer' : 'text recognised from page images')) + (om.layout === 'rentroll' ? '; unit rent roll and expense list' + ((om.buildings || []).length > 1 ? ' for ' + om.buildings.length + ' buildings' : '') : '') + ').'; showSheet('Import OM'); }).catch(function(e){ S.busy = false; S.result = null; S.msg = (e && e.message) || String(e); showSheet('Import OM'); });
}
window.bkOMRun = function(inp){ var f = inp && inp.files && inp.files[0]; if(!f) return; if(/\.(xlsx|xlsm|csv)$/i.test(f.name)){ S = { busy:true, msg:'', mode:'dev', result:null, basis:'cur', file:null, target:'new', dev:{ om:{}, taxBasis:'pf' } }; devRun(inp); return; } run(f, 'new'); };
window.bkOMBasis = function(b){ S.basis = b; showSheet('Import OM'); };
/* the user's decision on conflicting other income, per period: 'printed', 'lines' or 'pick' (with the lines chosen) */
window.bkOMDecide = function(mode, label){ var k = S.basis; S.dec = S.dec || {}; var d0 = S.dec[k] || { mode:mode, picks:[] };
  if(mode === 'pick'){ d0.mode = 'pick'; d0.picks = d0.picks || []; if(label !== undefined){ var q = d0.picks.indexOf(label); if(q >= 0) d0.picks.splice(q, 1); else d0.picks.push(label); } } else { d0.mode = mode; }
  S.dec[k] = d0; showSheet('Import OM'); };
window.bkOMManual = function(k, v){ v = parseFloat(String(v).replace(/[^0-9.]/g, '')); S[k] = isFinite(v) && v > 0 ? v : null; if(k === 'mPrice') S.mPriceFrom = null; showSheet('Import OM'); };
/* the user takes one of the OM's own price-like figures as the price: recorded with what it is, so it is never mistaken for an asking price */
window.bkOMPricePick = function(i){ var c = S.om && S.om.priceCandidates && S.om.priceCandidates[i]; if(!c) return; S.mPrice = c.value; S.mPriceFrom = { kind:c.kind, page:c.page, label:c.label }; showSheet('Import OM'); };
window.__bkOMDbg = { ocr:ocr, shrink:shrink, pageJpegs:pageJpegs, getWorker:getWorker };
window.bkOMParse = parseOM; window.bkOMBuild = buildDeal; window.bkOMPageJpegs = pageJpegs; window.bkOMConf = confOM; window.bkOMState = function(){ return S; };   /* read access for the audit tests */
window.bkOMCreate = function(){ if(!S.om || !((S.om.price || S.mPrice) && (S.om.units || S.mUnits))) return; window.__bkOMLast = { sources:S.om.sources || null }; var b = buildDeal(S.om, S.basis, S.file && S.file.name), file = S.file, info = S.info;
  if(b.needs && b.needs.length) return;   /* a decision the OM cannot make for you is still open */
  stampImp(b.deal, confOM(S.om, b, info, S.basis), S.file && S.file.name);
  if(typeof bkCreateNewDeal === 'function') bkCreateNewDeal(b.deal);
  /* the OM's printed figures and the user's decisions travel with the deal (bkCreateNewDeal keeps only the deal fields) */
  if(b.deal._imp || b.deal._omReported || b.deal._omDecisions){ var si = bkLoad(); if(b.deal._imp) si._imp = b.deal._imp; if(b.deal._omReported) si._omReported = b.deal._omReported; if(b.deal._omDecisions) si._omDecisions = b.deal._omDecisions; bkSave(si); }
  var id = String(b.deal.dealId), jobs = [];
  if(file && typeof window.bkDocsAdd === 'function') jobs.push(window.bkDocsAdd('om', file, id));
  if(info && info.cover && typeof window.bkDocsSetPhoto === 'function') jobs.push(coverPhoto(info.cover).then(function(f){ return window.bkDocsSetPhoto(f, id); }).catch(function(){}));
  Promise.all(jobs).catch(function(){}).then(function(){ if(window.bkDocsInvalidate) window.bkDocsInvalidate(); if(typeof window.bkGuideAfterImport === 'function') window.bkGuideAfterImport('OM'); else showSheet('Home'); }); };
var KEEP = ['dealId', 'closing', 'holdYears', 'rentGrowth', 'otherGrowth', 'opexGrowth', 'taxGrowth', 'commercialRentGrowth', 'closingCostsPct', 'saleCostPct', 'miscPerGSF'];
window.bkOMApply = function(){ if(!S.om) return; var b = buildDeal(S.om, S.basis, S.file && S.file.name), cur = bkLoad(), nd = Object.assign({}, b.deal);
  if(b.needs && b.needs.length) return;
  KEEP.forEach(function(k){ delete nd[k]; }); if(cur.name && !/^(untitled|-)?$/i.test(String(cur.name))){ delete nd.name; delete nd.location; }
  if(!window.confirm('Apply these figures to "' + (cur.name || 'this deal') + '"? Price, units, rents, other income, vacancy and every expense line are replaced. The previous values stay in Version History.')) return;
  if(typeof window.bkHistorySaveVersion === 'function') window.bkHistorySaveVersion('Before applying OM figures', true);
  stampImp(nd, confOM(S.om, b, S.info, S.basis), S.file && S.file.name);
  bkSave(Object.assign(cur, nd)); showSheet('Home'); };
window.bkDocsExtractHook = function(fid){ window.bkDocsGet(fid).then(function(r){ if(!r) return; var f = new File([r.blob], r.name, { type:r.type }); if(r.slot === 't12') return t12(f); S.basis = 'cur'; run(f, 'apply'); }); };

/* T-12 stored with a deal: extract with the Import Deal reader and apply to this deal */
function t12(file){
  S = { busy:true, msg:'Reading ' + file.name + '...', mode:'t12', result:null, basis:'cur', file:file, target:'apply' }; showSheet('Import OM');
  if(typeof window.bkImportParseFile !== 'function'){ S.busy = false; S.msg = 'The T-12 reader is not available.'; showSheet('Import OM'); return; }
  window.bkImportParseFile(file).then(function(parsed){ if(parsed.unreadable) throw new Error('This PDF has no readable text. Use the spreadsheet source.'); var props = window.bkImportExtract(parsed); if(!props.length) throw new Error('No Yardi-format T-12 line items found in ' + file.name + '.');
    S.t12 = props; S.result = true; S.busy = false; S.msg = 'Found ' + props.length + ' propert' + (props.length === 1 ? 'y' : 'ies') + ' with line items.'; showSheet('Import OM'); }).catch(function(e){ S.busy = false; S.result = null; S.msg = (e && e.message) || String(e); showSheet('Import OM'); });
}
window.bkT12Apply = function(i){ var p = S.t12 && S.t12[i]; if(!p) return; var cur = bkLoad(), price = Number(cur.purchasePrice) || 0, cap = price ? p.noi / price : 0.06, nd = window.bkImportDeal(p, cap, Number(cur.units) || p.units || 1);
  ['dealId', 'name', 'closing', 'holdYears', 'rentGrowth', 'otherGrowth', 'opexGrowth', 'taxGrowth', 'closingCostsPct', 'saleCostPct', 'exitCap', 'purchasePrice', 'location'].forEach(function(k){ delete nd[k]; });
  if(!window.confirm('Replace this deal\'s income and expense lines with the T-12 for ' + p.name + '? Price, financing and growth stay as they are. The previous values stay in Version History.')) return;
  if(typeof window.bkHistorySaveVersion === 'function') window.bkHistorySaveVersion('Before applying T-12', true);
  bkSave(Object.assign(cur, nd)); showSheet('Home'); };

/* ------------------------------------------------------------ development sites: the OM (facts) plus the developer's pro forma workbook (numbers) */
function looksDev(pages){ var t = (pages || []).join('\n'); return /development site|shovel[- ]ready|approved\s+\d+[- ]unit|land for development|zoning\s*(?:&|and)\s*coastal approved/i.test(t); }
function parseDevOM(pages){
  var t = pages.join('\n'), o = {}, m;
  o.price = (m = /\bPrice\s+\$\s?([\d,]{6,})/i.exec(t)) ? +m[1].replace(/,/g, '') : null;
  o.units = (m = /Approved Units\s+(\d{1,4})/i.exec(t)) ? +m[1] : (m = /(\d{1,4})[- ]unit/i.exec(t)) ? +m[1] : null;
  o.acres = (m = /\bAcres\s+([\d.]+)/i.exec(t)) ? +m[1] : (m = /([\d.]+)\s*Acres/i.exec(t)) ? +m[1] : null;
  o.zoning = (m = /\bZoning\s+([A-Za-z0-9-]+)/.exec(t)) ? m[1] : null;
  o.stories = (m = /Number of Stories\s+(\d+)/i.exec(t)) ? +m[1] : null;
  if((m = /Address\s+(\d+[^,\n]+?),\s*([A-Za-z .]+?),\s*([A-Z]{2})\b/.exec(t))){ o.street = m[1].trim(); o.city = m[2].trim(); o.state = m[3]; }
  else if((m = /^\s*(\d+\s+[A-Z][A-Za-z ]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Boulevard|Blvd|Lane|Way))\b/m.exec(t))) o.street = m[1].trim();
  o.mix = {}; var re = /(\d)\s*Bedroom Units\s+(\d+)/gi; while((m = re.exec(t))) o.mix[m[1] + 'BR'] = +m[2];
  o.commercialSuites = (m = /Commercial Suites?\s+(\d+)/i.exec(t)) ? +m[1] : 0;
  o.statedYield = (m = /year[- ]one yield of ([\d.]+)%/i.exec(t)) ? +m[1] / 100 : null;
  o.sellerFinancing = /short-term land purchase financing for up to (\d+)% of the purchase price at ([\d.]+)%/i.exec(t);
  o.tax = /tax abatement|tax fix/i.test(t);
  return o;
}
function parseDevPF(parsed){
  var sh = parsed.sheets.filter(function(s){ return (s.rows || []).some(function(r){ return r && r.some(function(c){ return /^RENTAL INCOME$/i.test(String(c || '').trim()); }); }); })[0] || parsed.sheets[0], R = (sh && sh.rows) || [], out = { rent:[], other:[], exp:[], caps:[] };
  function lab(r){ for(var i = 0; i < r.length; i++){ if(typeof r[i] === 'string' && r[i].trim()) return { i:i, s:r[i].trim() }; } return null; }
  function nums(r, i){ var o = []; for(var k = i + 1; k < r.length; k++){ if(typeof r[k] === 'number') o.push(r[k]); else if(typeof r[k] === 'string' && r[k].trim() && o.length) break; } return o; }
  var sec = '';
  R.forEach(function(r, ri){ if(!r) return; var l = lab(r); if(!l) { if(sec === 'land'){ var n = r.filter(function(c){ return typeof c === 'number'; }); if(n.length >= 2){ out.land = n[1]; out.totalProject = n[2]; sec = ''; } } return; }
    var s = l.s, n = nums(r, l.i);
    if(/^construction costs?$/i.test(s) && n.length) out.construction = n[0];
    else if(/^land cost\/unit$/i.test(s)) sec = 'land';
    else if(/^gross building size$/i.test(s) && n.length) out.gsf = n[0];
    else if(/^net rentable$/i.test(s) && n.length) out.nsf = n[0];
    else if(/^unit type$/i.test(s) && sec !== 'exp') sec = 'rent';
    else if(/^gross rent$/i.test(s)){ sec = ''; out.grossRent = n[n.length - 1] !== undefined ? n[4] : null; }
    else if(sec === 'rent' && n.length >= 5) out.rent.push({ type:s, units:n[0], sf:n[1], rentSF:n[2], rentUnit:n[3], annual:n[4] });
    else if(/^other income$/i.test(s) && r.filter(function(c){ return typeof c === 'string' && /amount|unit/i.test(c); }).length){ sec = 'other'; }
    else if(/^total other income$/i.test(s)){ sec = ''; out.otherTotal = n[1] != null ? n[1] : n[0]; }
    else if(sec === 'other' && n.length >= 2) out.other.push({ label:s, amount:n[1] });
    else if(/^vacancy$/i.test(s) && n.length){ out.vacPct = n[0]; out.vacAmt = n[n.length - 1]; }
    else if(/^effective gross income$/i.test(s) && n.length) out.egi = n[0];
    else if(/^gross income$/i.test(s) && n.length) out.gross = n[0];
    else if(/^operating expenses$/i.test(s)) sec = 'exp';
    else if(/^total operating expenses$/i.test(s)){ sec = ''; out.totalExp = n[1] != null ? n[1] : n[0]; }
    else if(sec === 'exp' && n.length >= 2){ if(/management/i.test(s) && n.length >= 3){ out.mgmtPct = n[0]; out.exp.push({ label:s, amount:n[2] }); } else out.exp.push({ label:s, amount:n[1] }); }
    else if(/^net operating income$/i.test(s) && n.length) out.noi = n[0];
    else if(/^valuation range$/i.test(s)){ sec = 'caps'; }
    else if(sec === 'caps' && r.length && typeof r[0] === 'number' && r[0] > 0 && r[0] < 0.2){ out.caps.push(r[0]); } });
  R.forEach(function(r){ if(!r) return; if(typeof r[0] === 'number' && r[0] > 0.03 && r[0] < 0.2 && typeof r[1] === 'number' && r[1] > 10000) out.caps.push(r[0]); });
  var tx = parsed.sheets.filter(function(s){ return /tax|pilot/i.test(s.name); })[0];
  if(tx) (tx.rows || []).forEach(function(r){ if(r && /^Projected Taxes$/i.test(String(r[0] || '').trim())){ out.taxSchedule = r.slice(1).filter(function(c){ return typeof c === 'number'; }); } });
  out.caps = out.caps.filter(function(v, i, a){ return a.indexOf(v) === i; });
  return out;
}
var DEV_STD = { hc_demo:1, hc_sitework:9, hc_excavation:8, hc_parking:14, hc_podium:24, hc_envelope:17, hc_roofing:4, hc_mep:25, hc_elevators:4, hc_partitions:8, hc_unitint:12, hc_amenity:5, hc_landscape:3, hardGCPct:0.06, hardContractorFeePct:0.03, hardRiskBondsPct:0.015, hardContPct:0.05,
  sc_ae:0.07, sc_civil:1.2, sc_entitlement:1.5, sc_environmental:0.4, sc_ffe:3500, sc_legal:1, sc_marketing:1.8, sc_ocip:2.2, sc_permits:3.5, sc_retaxconst:1.5, sc_sustainability:0.5, sc_technology:0.8, sc_testing:0.9, sc_title:0.008, devFeePct:0.03, cmFeePct:0.015, softContPct:0.05, predevCarry:150000,
  conLTC:0.65, conRate:0.075, conUtil:0.6, conOrigFee:0.01 };
function buildDevDeal(dev){
  var om = dev.om || {}, pf = dev.pf, notes = [], res = pf.rent.filter(function(r){ return !/commercial|retail/i.test(r.type); }), com = pf.rent.filter(function(r){ return /commercial|retail/i.test(r.type); })[0];
  var units = res.reduce(function(t, r){ return t + r.units; }, 0) || om.units || 0, resRent = res.reduce(function(t, r){ return t + r.annual; }, 0), vac = pf.vacPct != null ? pf.vacPct : 0.05;
  var E = function(rx){ return pf.exp.filter(function(e){ return rx.test(e.label); }).reduce(function(t, e){ return t + e.amount; }, 0); };
  var taxPF = E(/tax/i), taxFull = pf.taxSchedule && pf.taxSchedule.length ? pf.taxSchedule[pf.taxSchedule.length - 1] : taxPF, taxes = dev.taxBasis === 'full' ? taxFull : taxPF;
  var mgmt = E(/manag/i), ins = E(/insur/i), util = E(/utilit/i), rm = E(/repair|maint/i), con = E(/contract/i), pay = E(/payroll/i), mkt = E(/market/i), turn = E(/make ready|turn/i), ga = E(/general|admin/i);
  var used = taxPF + mgmt + ins + util + rm + con + pay + mkt + turn + ga, other = pf.exp.reduce(function(t, e){ return t + e.amount; }, 0) - used;
  var street = om.street || 'Development site', name = String(street).replace(/\s+/g, ' ') + ' (development)', exitCap = pf.caps.length ? Math.max.apply(null, pf.caps) : 0.065, price = om.price || pf.land || 0;
  var egi = pf.egi || ((resRent + (com ? com.annual : 0) + (pf.otherTotal || 0)) * (1 - vac));
  var d = Object.assign({ dealId:'DEV-' + slug(street), name:name, location:[om.city, om.state].filter(Boolean).join(', '), dealType:'Development', propertyType:'Multifamily', status:'Pipeline', closing:'1/1/2027',
    units:units, gsf:Math.round(pf.gsf || 0), commercialArea:com ? com.sf * com.units : 0, commercialRent:com ? Math.round((com.rentSF || (com.rentUnit / com.sf)) * 12 * 100) / 100 : 0, parking:0, siteArea:om.acres || 0, purchasePrice:price,
    avgRent:Math.round(resRent / units / 12 * 100) / 100, otherIncomePerUnit:Math.round((pf.otherTotal || 0) * (1 - vac) / units * 100) / 100, vacancy:vac, commercialVacancy:vac, occupancy:1 - vac, badDebtPct:0, mgmtPct:pf.mgmtPct != null ? pf.mgmtPct : (egi ? mgmt / egi : 0.03),
    taxes:Math.round(taxes), insurance:ins, utilities:util, rm:rm, contract:con, payroll:pay, turnover:turn, marketing:mkt, ga:Math.round((ga + Math.max(0, other)) * 100) / 100, reserves:0,
    devBudgetMode:'SOURCE', sourceConstruction:pf.construction || 0, predevMonths:3, constructionMonths:21, leaseupMonths:12, holdYears:6,
    exitCap:exitCap, rentGrowth:0.03, otherGrowth:0.02, opexGrowth:0.03, taxGrowth:0.02, commercialRentGrowth:0.025, closingCostsPct:0.02, saleCostPct:0.02, miscPerGSF:0, gpShare:0.10 }, DEV_STD);
  var tie = safe(function(){ return window.bkRunWith(d, function(){ return bkCalc().noi; }); }, null), want = pf.noi;
  notes.push('Construction cost of ' + $(pf.construction) + ' is taken as the total hard and soft budget (the pro forma\'s own total project is ' + $(pf.totalProject) + ' with land). The cost ladder inside it is the app\'s standard split.');
  notes.push('Timeline is not in the files: 3 months pre-development, 21 months construction, 12 months lease-up, 6-year hold. The workbook mentions a 2-year construction period. Change these on the development sheets.');
  notes.push('Exit cap rate ' + pct(exitCap) + ' is the top of the pro forma\'s own valuation range' + (pf.caps.length ? ' (' + pct(Math.min.apply(null, pf.caps)) + ' to ' + pct(exitCap) + ')' : '') + '. Replacement reserves are not in the pro forma, so they start at $0.');
  notes.push('Other income is entered net of the ' + pct(vac, 0) + ' vacancy the pro forma also applies to it, so Year-1 NOI matches the workbook.');
  if(pf.taxSchedule && pf.taxSchedule.length > 1) notes.push('Real estate taxes follow a phased tax-abatement schedule in the workbook (' + $(pf.taxSchedule[0]) + ' now, ' + $(taxPF) + ' in the pro forma year, ' + $(taxFull) + ' fully assessed). The engine takes one tax figure, so it uses ' + (dev.taxBasis === 'full' ? 'the fully assessed amount' : 'the pro forma year') + '. ' + (dev.taxBasis === 'full' ? '' : 'Fully assessed taxes would cut NOI by ' + $(taxFull - taxPF) + ' a year.'));
  if(om.sellerFinancing) notes.push('The seller offers land financing up to ' + om.sellerFinancing[1] + '% of price at ' + om.sellerFinancing[2] + '% interest-only. That is not modelled; the engine uses its standard construction loan.');
  return { deal:d, tie:tie, want:want, notes:notes, taxPF:taxPF, taxFull:taxFull };
}
function devRun(inp){ var f = inp && inp.files && inp.files[0]; if(!f) return; S.devFile = f; S.busy = true; S.msg = 'Reading ' + f.name + '...'; showSheet('Import OM');
  Promise.resolve(window.bkImportParseFile(f)).then(function(parsed){ var pf = parseDevPF(parsed); if(!pf.noi || !pf.rent.length || !pf.exp.length) throw new Error('Could not find the rental income table, operating expenses and net operating income in ' + f.name + '. This importer reads a one-sheet development pro forma (unit types with rents, other income, expenses, NOI).'); S.dev = S.dev || { om:{} }; S.dev.pf = pf; S.dev.taxBasis = S.dev.taxBasis || 'pf'; S.mode = 'dev'; S.result = true; S.busy = false; S.msg = 'Read ' + f.name + '.'; showSheet('Import OM'); })
    .catch(function(e){ S.busy = false; S.msg = (e && e.message) || String(e); showSheet('Import OM'); }); }
window.bkOMDevPF = devRun; window.bkOMDevTax = function(b){ if(S.dev){ S.dev.taxBasis = b; showSheet('Import OM'); } };
window.bkOMDevCreate = function(){ if(!S.dev || !S.dev.pf) return; var b = buildDevDeal(S.dev), id = String(b.deal.dealId), files = [S.file, S.devFile].filter(Boolean);
  stampImp(b.deal, confDev(S.dev, b, S.info), S.devFile && S.devFile.name);
  if(typeof bkCreateNewDeal === 'function') bkCreateNewDeal(b.deal);
  if(b.deal._imp){ var si = bkLoad(); si._imp = b.deal._imp; bkSave(si); }
  var jobs = []; if(S.file && /\.pdf$/i.test(S.file.name)) jobs.push(window.bkDocsAdd('om', S.file, id)); if(S.devFile) jobs.push(window.bkDocsAdd('other', S.devFile, id));
  if(S.info && S.info.cover && typeof window.bkDocsSetPhoto === 'function') jobs.push(coverPhoto(S.info.cover).then(function(f){ return window.bkDocsSetPhoto(f, id); }).catch(function(){}));
  Promise.all(jobs).catch(function(){}).then(function(){ if(window.bkDocsInvalidate) window.bkDocsInvalidate(); if(typeof window.bkGuideAfterImport === 'function') window.bkGuideAfterImport('OM'); else showSheet('Home'); }); };
function renderDev(body){
  var dv = S.dev || { om:{} }, om = dv.om || {};
  if(!dv.pf){ return body + box('<b>This looks like a development site.</b> The OM gives the facts' + (om.price ? ' (price ' + $(om.price) + (om.units ? ', ' + om.units + ' approved units' : '') + (om.acres ? ', ' + om.acres + ' acres' : '') + ')' : '') + ', but not the income and cost figures. Add the developer\'s pro forma workbook (Excel) to build the deal.'
    + '<div style="margin-top:10px"><input id="bkOMDevFile" type="file" accept=".xlsx,.xlsm,.csv" onchange="bkOMDevPF(this)"></div>'); }
  var b = buildDevDeal(dv), d = b.deal, pf = dv.pf, ok = b.tie != null && b.want != null && Math.abs(b.tie - b.want) <= Math.max(5, b.want * 0.002);
  var C = confDev(dv, b, S.info), cf = C.fields;
  var tb = function(k, t){ return '<button type="button" class="pl-hbtn' + (dv.taxBasis === k ? ' primary' : '') + '" onclick="bkOMDevTax(\'' + k + '\')">' + t + '</button>'; };
  body += box('<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><b style="margin-right:6px">Real estate taxes</b>' + tb('pf', 'As the pro forma (' + $(b.taxPF) + ')') + tb('full', 'Fully assessed (' + $(b.taxFull) + ')') + '</div>');
  body += confBar(C);
  body += box('<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px"><b>' + esc(d.name) + '</b><span style="opacity:.7">' + esc(d.location) + '</span>' + (b.tie == null ? '' : '<span class="status-chip ' + (ok ? 'pass' : 'warn') + '">' + (ok ? 'TIES TO PRO FORMA NOI' : 'NOI DIFFERS') + ' · engine ' + $(b.tie) + ' vs workbook ' + $(b.want) + '</span>') + '</div><table style="width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums"><thead><tr><th style="text-align:left;padding:5px 8px"></th><th style="text-align:right;padding:5px 8px">Value</th><th style="text-align:left;padding:5px 8px">Source</th><th style="text-align:left;padding:5px 8px">Confidence</th></tr></thead><tbody>'
    + row('Land price', $(d.purchasePrice), 'OM', 'raw', cf.purchasePrice) + row('Construction budget (hard and soft)', $(d.sourceConstruction), 'workbook', 'raw', cf.sourceConstruction) + row('Residential units', d.units, 'OM / workbook', 'raw', cf.units) + row('Commercial', d.commercialArea ? d.commercialArea.toLocaleString('en-US') + ' SF at $' + d.commercialRent + '/SF/yr' : 'none', 'workbook', 'raw') + row('Gross building area', d.gsf ? d.gsf.toLocaleString('en-US') + ' SF' : '—', 'workbook', 'raw')
    + row('Average monthly rent', $(d.avgRent), 'workbook', 'raw', cf.avgRent) + row('Other income per unit (year, net of vacancy)', $(d.otherIncomePerUnit), 'workbook', 'raw', cf.otherIncomePerUnit) + row('Vacancy', pct(d.vacancy, 1), 'workbook', 'raw', cf.vacancy) + row('Management fee', pct(d.mgmtPct, 2) + ' of income', 'workbook', 'raw', cf.mgmtPct)
    + row('Real estate taxes', $(d.taxes), 'workbook', 'raw', cf.taxes) + row('Insurance', $(d.insurance), 'workbook', 'raw', cf.insurance) + row('Utilities', $(d.utilities), 'workbook', 'raw', cf.utilities) + row('Payroll', $(d.payroll), 'workbook', 'raw', cf.payroll) + row('Repairs, contract, make-ready, marketing, G&A', $(d.rm + d.contract + d.turnover + d.marketing + d.ga), 'workbook', 'raw')
    + row('Exit cap rate', pct(d.exitCap), 'workbook range', 'raw', cf.exitCap) + row('Timeline (months): pre-dev / construction / lease-up', d.predevMonths + ' / ' + d.constructionMonths + ' / ' + d.leaseupMonths, '', 'assumed', cf.constructionMonths) + row('Replacement reserves', '$0', '', 'assumed', cf.reserves) + '</tbody></table>');
  body += box('<b>Before you rely on it</b><ul style="margin:6px 0 0 18px;padding:0">' + b.notes.map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>');
  body += '<div style="margin-top:14px"><button type="button" class="pl-hbtn primary" onclick="bkOMDevCreate()">Create development deal</button></div><div style="font-size:12px;opacity:.7;margin-top:6px">The OM, the workbook and the OM\'s cover picture are kept in the deal\'s Deal Documents.</div>';
  return body;
}

/* Confidence: every imported figure gets a level and a one-line reason, so a bad parse is visible before it reaches the engine.
   verified = reconciled against another number in the document; check = read directly but nothing corroborates it (or it came off a page image); low = does not reconcile or is missing; assumed = the app's default, not from the document. */
var CONF_LABEL = window.bkConf.LABEL, confSummary = window.bkConf.summary;
function confOM(om, b, info, basis){
  var d = b.deal, I = om.ie || {}, F = {}, s = om.sources || {}, ocr = function(p){ return !!(info && info.ocrPages && p && info.ocrPages.indexOf(p) >= 0); };
  var tieOK = b.tie != null && b.want != null && Math.abs(b.tie - b.want) <= Math.max(5, b.want * 0.002), diff = b.tie != null && b.want != null ? Math.round(Math.abs(b.tie - b.want)) : null;
  var set = function(k, l, why){ F[k] = { l:l, why:why }; };
  var line = function(k, v, what){ if(tieOK) set(k, 'verified', 'The deal\'s NOI recomputes to the OM\'s NOI (within $' + diff + '), so this ' + what + ' reconciles.'); else if(b.tie == null) set(k, 'check', 'Read from the OM; the NOI tie-out could not run.'); else set(k, 'low', 'The deal\'s NOI is ' + $(b.tie) + ' against the OM\'s ' + $(b.want) + '. One of the income or expense lines is probably misread; compare this one with the OM page.'); };
  /* price */
  var KN = { sold:'a sold price', assessed:'an assessed or market value', loan:'a loan figure', asking:'an asking price' }, listC = function(){ return (om.priceCandidates || []).filter(function(c){ return c.kind !== 'loan'; }).slice(0, 4).map(function(c){ return KN[c.kind] + ' of ' + $(c.value) + ' (page ' + c.page + ')'; }).join('; '); };
  if(S.mPrice && !om.price){ if(S.mPriceFrom) set('purchasePrice', 'check', 'You chose ' + KN[S.mPriceFrom.kind] + ' of ' + $(S.mPrice) + ' from page ' + S.mPriceFrom.page + ' as the price' + (S.mPriceFrom.kind === 'sold' ? '. That is what the property sold for, not what the seller is asking now.' : S.mPriceFrom.kind === 'assessed' ? '. That is an assessment or estimate, not an asking price.' : '.')); else set('purchasePrice', 'verified', 'You entered it; the OM states no asking price.'); }
  else if(!om.price && om.priceConflict) set('purchasePrice', 'low', 'The OM states more than one asking price (' + om.priceConflict.map($).join(', ') + '). Choose one above.');
  else if(!om.price) set('purchasePrice', 'low', (om.priceCandidates || []).some(function(c){ return c.kind !== 'loan'; }) ? 'The OM states no asking price. Its price figures are ' + listC() + '. Enter the asking price above.' : 'The OM states no price. Enter one above.');
  else if(om.priceTypo) set('purchasePrice', 'check', 'The OM prints "' + om.priceTypo + '"; read as ' + $(om.price) + '. Confirm it.');
  else if(om.capRates && I && I.noi && (om.capRates.cur != null || om.capRates.pf != null)){
    var chk = [], bad = [];
    [['cur', 'in-place', I.noi.cur], ['pf', 'pro forma', I.noi.pf]].forEach(function(r){ var pr = om.capRates[r[0]]; if(pr == null || !r[2]) return; var imp = r[2] / om.price; (Math.abs(imp - pr) <= 0.0006 ? chk : bad).push(r[1] + ' NOI ÷ price = ' + pct(imp) + ' (printed ' + pct(pr) + ', page ' + (om.capRates.pages[r[0]] || '?') + ')'); });
    if(bad.length) set('purchasePrice', 'low', 'The price and the OM\'s own cap rate disagree: ' + bad.join('; ') + '. The price or the NOI is misread, or the broker\'s rate is on another basis.');
    else if(chk.length) set('purchasePrice', 'verified', 'Checked against the cap rate the OM prints: ' + chk.join('; ') + '.');
    else set('purchasePrice', 'check', 'Read from the text; no printed cap rate could be compared.'); }
  else if(om.capPrinted && om.curNOI && om.price){ var imp = om.curNOI / om.price; if(Math.abs(imp - om.curCap) <= 0.0006) set('purchasePrice', 'verified', 'In-place NOI divided by this price gives ' + pct(imp) + ', the cap rate the OM prints.'); else set('purchasePrice', 'low', 'NOI divided by this price is ' + pct(imp) + ' but the OM prints a ' + pct(om.curCap) + ' cap rate. The price or the NOI is misread.'); }
  else if(om.priceFallback || ocr(s.price)) set('purchasePrice', 'check', (ocr(s.price) ? 'Read from a page image' : 'Found ' + (om.priceMethod === 'column heading and its figure' ? 'under the heading "Price"' : 'near the words "asking price"')) + '; no printed cap rate to check it against. Confirm it on page ' + (s.price || '?') + '.');
  else set('purchasePrice', 'check', 'Read directly from the text; nothing in the OM corroborates it.');
  /* units, area */
  var mixU = (om.unitMix || []).reduce(function(t, m){ return t + (m.units || 0); }, 0);
  if(S.mUnits && !om.units) set('units', 'verified', 'You entered it.');
  else if(mixU && om.units) set('units', mixU === om.units ? 'verified' : 'low', mixU === om.units ? 'Matches the ' + mixU + ' units in the unit mix table.' : 'The OM says ' + om.units + ' units but its unit mix adds to ' + mixU + '.');
  else if(om.layout === 'rentroll'){ var spaces = d.units + (om.commSpaces || 0); if(om.unitsOM && spaces === om.unitsOM) set('units', 'verified', d.units + ' apartments in the rent roll' + (om.commSpaces ? ' plus ' + om.commSpaces + ' commercial spaces' : '') + ' = the ' + om.unitsOM + ' units the OM states.'); else set('units', 'check', 'Counted from the rent roll: ' + d.units + ' apartments' + (om.commSpaces ? ' and ' + om.commSpaces + ' commercial spaces' : '') + (om.unitsOM ? '; the OM states ' + om.unitsOM + ' units.' : '.')); }
  else set('units', 'check', ocr(s.units) ? 'Read from a page image with no unit mix to check it against.' : 'No unit mix table to check it against.');
  if(!d.gsf) set('gsf', 'low', 'No building area found.');
  else { var cSF = (om.commSFMentions && om.commSFMentions[0] && om.commSFMentions[0].sf) || 0, rSF = cSF && cSF < d.gsf ? d.gsf - cSF : d.gsf, spu = rSF / (d.units || 1), roomy = (om.unitMix || []).some(function(r){ return /\b(room|sro|studio|micro)\b/i.test(r.type); });
    /* the building area includes the shop; a rooming house legitimately averages well under 350 SF a unit */
    if(spu < (roomy ? 150 : 350) || spu > 2500) set('gsf', 'low', 'That is ' + Math.round(spu) + ' SF per unit' + (cSF ? ' after taking out the ' + cSF.toLocaleString('en-US') + ' SF commercial space' : '') + ', which is outside the usual range. The area or the unit count is misread.'); else set('gsf', ocr(s.sf) ? 'check' : 'verified', ocr(s.sf) ? 'Read from a page image; ' + Math.round(spu) + ' SF per unit is plausible.' : Math.round(spu) + ' SF per unit is plausible.'); }
  /* income and expenses */
  line('avgRent', d.avgRent, 'rent'); line('otherIncomePerUnit', d.otherIncomePerUnit, 'other income');
  if(d._omDecisions && d._omDecisions.otherIncome) set('otherIncomePerUnit', 'check', 'The OM\'s other-income lines and printed EGI disagree. You decided: ' + d._omDecisions.otherIncome.note + '.');
  (b.needs || []).forEach(function(x){ if(x.key === 'otherIncome') set('otherIncomePerUnit', 'low', x.why); });
  if(I.vac && (I.vac[basis + 'Pct'] != null || I.vac[basis] != null)) line('vacancy', d.vacancy, 'vacancy'); else if(I.noVacancy) set('vacancy', 'check', 'The OM\'s NOI has no vacancy allowance, so this starts at 0% to match it. Set your own.'); else set('vacancy', 'assumed', 'The OM shows no vacancy line; 5% is the app default.');
  if(om.ie && I.exp && I.exp.some(function(e){ return catOf(e.label) === 'mgmt'; })) line('mgmtPct', d.mgmtPct, 'management fee'); else set('mgmtPct', 'assumed', 'The OM shows no management fee; 3% of income is the app default.');
  [['taxes', 'taxes', 'taxes'], ['insurance', 'insurance', 'insurance'], ['rm', 'rm', 'repairs and maintenance']].forEach(function(r){ if(!d[r[0]]) set(r[0], 'low', 'No ' + r[2] + ' line was found in the OM, so this is $0.'); else line(r[0], d[r[0]], r[2]); });
  ['utilities', 'contract', 'payroll', 'marketing', 'turnover', 'ga'].forEach(function(k){ if(d[k]) line(k, d[k], 'expense line'); });
  set('t12noi', om.curNOI ? (tieOK ? 'verified' : 'check') : 'low', om.curNOI ? 'The OM\'s own in-place NOI.' : 'Not found.');
  ['exitCap', 'reserves', 'holdYears', 'rentGrowth', 'otherGrowth', 'opexGrowth', 'taxGrowth', 'closingCostsPct', 'saleCostPct'].forEach(function(k){ set(k, 'assumed', k === 'exitCap' ? 'Starts at the going-in cap rate. Your view, not the OM\'s.' : 'App default; the OM does not provide it.'); });
  return { fields:F, tieOK:tieOK, sum:confSummary(F) };
}
function confDev(dev, b, info){
  var d = b.deal, om = dev.om || {}, pf = dev.pf, F = {}, set = function(k, l, why){ F[k] = { l:l, why:why }; };
  var tieOK = b.tie != null && b.want != null && Math.abs(b.tie - b.want) <= Math.max(5, b.want * 0.002), diff = b.tie != null && b.want != null ? Math.round(Math.abs(b.tie - b.want)) : null;
  var line = function(k, what){ if(tieOK) set(k, 'verified', 'The deal\'s NOI recomputes to the workbook\'s NOI (within $' + diff + '), so this ' + what + ' reconciles.'); else set(k, b.tie == null ? 'check' : 'low', b.tie == null ? 'Read from the workbook; the NOI tie-out could not run.' : 'Deal NOI ' + $(b.tie) + ' against the workbook\'s ' + $(b.want) + '; one line is probably misread.'); };
  if(om.price) set('purchasePrice', pf && pf.land && Math.abs(pf.land - om.price) < 1 ? 'verified' : 'check', pf && pf.land && Math.abs(pf.land - om.price) < 1 ? 'The OM price equals the land cost in the workbook.' : 'Read from the OM; the workbook does not repeat it.'); else set('purchasePrice', pf && pf.land ? 'check' : 'low', pf && pf.land ? 'Taken from the workbook land line; the OM states no price.' : 'No price found.');
  var wu = pf.rent.filter(function(r){ return !/commercial|retail/i.test(r.type); }).reduce(function(t, r){ return t + r.units; }, 0);
  if(om.units && wu) set('units', om.units === wu ? 'verified' : 'low', om.units === wu ? 'The OM\'s approved units equal the workbook\'s unit count.' : 'The OM approves ' + om.units + ' units; the workbook has ' + wu + '.'); else set('units', 'check', 'Only one document gives the unit count.');
  set('siteArea', om.acres ? 'check' : 'low', om.acres ? 'Read from the OM.' : 'No site area found.');
  line('avgRent', 'rent'); line('otherIncomePerUnit', 'other income'); line('vacancy', 'vacancy'); line('taxes', 'tax figure'); line('insurance', 'insurance'); line('utilities', 'utilities'); line('payroll', 'payroll');
  set('mgmtPct', pf.mgmtPct != null ? (tieOK ? 'verified' : 'check') : 'assumed', pf.mgmtPct != null ? 'The workbook\'s management percentage.' : 'Derived from the workbook\'s fee dollars.');
  set('sourceConstruction', pf.construction ? 'check' : 'low', pf.construction ? 'The workbook\'s construction total (' + $(pf.construction) + '). The split into hard and soft costs is the app\'s standard.' : 'No construction total found.');
  set('exitCap', pf.caps && pf.caps.length ? 'check' : 'assumed', pf.caps && pf.caps.length ? 'The top of the workbook\'s own valuation range. A judgement call, so set your own.' : 'No cap rate in the workbook; 6.5% default.');
  ['predevMonths', 'constructionMonths', 'leaseupMonths', 'holdYears', 'reserves', 'rentGrowth', 'opexGrowth'].forEach(function(k){ set(k, 'assumed', 'App default; the files do not provide it.'); });
  return { fields:F, tieOK:tieOK, sum:confSummary(F) };
}
var confChip = window.bkConf.chip, confBar = function(C){ return window.bkConf.bar(C, 'document'); }, stampImp = window.bkConf.stamp;
/* every expense line and where it was put; change one and the importer remembers that wording */
function classBox(lines){ if(!lines || !lines.length) return '';
  var rows = lines.map(function(l, i){ var opts = window.bkLearn.options(l.auto)(l.learned ? l.cat : ''); return '<tr><td style="padding:4px 8px">' + esc(l.label) + (l.learned ? ' <span style="font-size:10.5px;color:#12609f;font-weight:700">LEARNED</span>' : '') + '</td><td style="padding:4px 8px;text-align:right">' + $(l.amount) + '</td><td style="padding:4px 8px"><select onchange="bkOMClass(' + i + ',this.value)" style="font:inherit;font-size:12px">' + opts + '</select></td></tr>'; }).join('');
  return box('<details><summary style="cursor:pointer"><b>How each expense line was classified</b> <span style="opacity:.7;font-size:12px">(' + lines.length + ' lines; change one and it is remembered for the next import)</span></summary><table style="width:100%;border-collapse:collapse;margin-top:8px"><tbody>' + rows + '</tbody></table></details>'); }
window.bkOMClass = function(i, cat){ var e = S.om && S.om.ie && S.om.ie.exp[i]; if(!e) return; if(!cat || cat === autoCat(e.label)) window.bkLearn.remove(e.label); else window.bkLearn.set(e.label, cat); showSheet('Import OM'); };
function row(label, val, src, kind, c){ return '<tr><td style="padding:5px 8px">' + label + whyLine(c) + '</td><td style="padding:5px 8px;text-align:right;font-weight:600">' + val + '</td><td style="padding:5px 8px;font-size:11px;opacity:.65">' + (kind === 'assumed' ? 'app default' : kind === 'raw' ? src : src ? 'OM page ' + src : 'OM') + '</td><td style="padding:5px 8px;white-space:nowrap">' + confChip(c) + '</td></tr>'; }
function whyLine(c){ return c && (c.l === 'low' || c.l === 'check') ? '<div style="font-size:11px;font-weight:400;opacity:.75">' + esc(c.why) + '</div>' : ''; }
function render(){
  if(typeof window.bkOMPrewarm === 'function') window.bkOMPrewarm();
  var hdr = { title:'Import OM', crumbs:'Inputs', desc:'Upload an offering memorandum (PDF) and load its price, units, rents, income and expenses into the engine.', sidebar:'', meta:{ Source:S.file ? S.file.name : 'none', Method:S.info ? S.info.method + (S.info.t && S.info.t.total ? ', read in ' + (S.info.t.total / 1000).toFixed(1) + 's' : '') : 'PDF' } };
  var body = box('<b>Upload an offering memorandum.</b> The importer reads the PDF (including designed OMs that are page images, using text recognition in your browser), finds the price, unit mix and the income and expense table, and builds a deal from the in-place (current) figures or the broker pro forma. Nothing is sent to a server. The first scan downloads the recognition engine (about 6 MB, then cached).'
    + '<div style="margin-top:10px"><input id="bkOMFile" type="file" accept=".pdf,.xlsx,.xlsm" onchange="bkOMRun(this)"' + (S.busy ? ' disabled' : '') + '></div>');
  if(S.msg) body += box((S.busy ? '&#8987; ' : S.result ? '&#10003; ' : '&#9888; ') + esc(S.msg));
  if(S.mode === 't12' && S.t12){ body += box('<table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:5px 8px">Property</th><th style="text-align:right;padding:5px 8px">NOI</th><th></th></tr></thead><tbody>' + S.t12.map(function(p, i){ return '<tr><td style="padding:5px 8px">' + esc(p.name) + '</td><td style="padding:5px 8px;text-align:right"><b>' + $(p.noi) + '</b></td><td style="text-align:right"><button type="button" class="pl-hbtn primary" onclick="bkT12Apply(' + i + ')">Apply to this deal</button></td></tr>'; }).join('') + '</tbody></table>'); }
  if(S.mode === 'dev' && S.result) body = renderDev(body);
  if(S.mode === 'om' && S.result && S.om){
    var om = S.om, b = buildDeal(om, S.basis, S.file && S.file.name), d = b.deal, I = om.ie, s = om.sources || {}, ok = b.tie != null && b.want != null && Math.abs(b.tie - b.want) <= Math.max(5, b.want * 0.002);
    var C = confOM(om, b, S.info, S.basis), cf = C.fields, need = '';
    if(!om.price){ var KNm = { asking:'asking price', sold:'SOLD price (what it sold for, not an asking price)', assessed:'assessed / estimated value (not an asking price)', loan:'loan figure (not a price)' }, pcs = om.priceCandidates || [];
      need += '<div style="margin-bottom:8px;font-size:13px">' + (om.priceConflict ? '<b>The OM states more than one asking price:</b> ' + om.priceConflict.map(function(v){ return $(v); }).join(' and ') + '. Choose the one you mean, or enter another.' : (pcs.some(function(c){ return c.kind !== 'loan'; }) ? '<b>The OM states no asking price.</b> It does mention:' : '<b>The OM states no price.</b>'))
        + (pcs.length ? '<div style="margin-top:6px">' + pcs.map(function(c, i){ return '<div style="margin:3px 0"><button type="button" class="pl-hbtn" onclick="bkOMPricePick(' + i + ')">Use ' + $(c.value) + '</button> <span style="font-size:12.5px">' + KNm[c.kind] + ' · page ' + c.page + ' · "' + esc(c.snippet) + '"</span></div>'; }).join('') + '</div>' : '') + '</div>';
      need += '<label style="display:inline-flex;flex-direction:column;gap:3px;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;margin-right:14px">Asking price (not found in the OM)<input type="text" value="' + (S.mPrice || '') + '" placeholder="e.g. 3,600,000" onchange="bkOMManual(\'mPrice\',this.value)" style="width:150px;padding:7px 9px;border:1px solid var(--line,#dbe4ec);border-radius:6px;font:inherit;font-size:14px;text-align:right"></label>'; }
    if(!om.units) need += '<label style="display:inline-flex;flex-direction:column;gap:3px;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;font-weight:700">Units (not found)<input type="text" value="' + (S.mUnits || '') + '" onchange="bkOMManual(\'mUnits\',this.value)" style="width:90px;padding:7px 9px;border:1px solid var(--line,#dbe4ec);border-radius:6px;font:inherit;font-size:14px;text-align:right"></label>';
    var ready = (om.price || S.mPrice) && (om.units || S.mUnits) && !(b.needs && b.needs.length);
    var inS = 'padding:7px 9px;border:1px solid var(--line,#dbe4ec);border-radius:6px;font:inherit;font-size:14px;text-align:right';
    /* the commercial area: the OM's own statements are listed (never picked for you) and you enter the one you use */
    if(b.needs && b.needs.some(function(x){ return x.key === 'commSF'; })){
      var mm = om.commSFMentions || [], byV = {}; mm.forEach(function(x){ (byV[x.sf] = byV[x.sf] || []).push('p' + x.page); });
      body += box('<b>Commercial area needed.</b> ' + esc(b.needs.filter(function(x){ return x.key === 'commSF'; })[0].why)
        + (mm.length ? '<div style="margin-top:6px;font-size:12.5px">The OM states: ' + Object.keys(byV).map(function(v){ return '<button type="button" class="pl-hbtn" onclick="bkOMManual(\'mCommSF\',' + v + ')">' + Number(v).toLocaleString('en-US') + ' SF (' + byV[v].filter(function(x, i, a){ return a.indexOf(x) === i; }).join(', ') + ')</button>'; }).join(' ') + (Object.keys(byV).length > 1 ? ' <b>These differ</b>: choose the one you want to use.' : '') + '</div>' : '<div style="margin-top:6px;font-size:12.5px">The OM states no commercial area.</div>')
        + '<div style="margin-top:8px"><label style="font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;font-weight:700">Commercial area (SF)<br><input type="text" value="' + (S.mCommSF || '') + '" onchange="bkOMManual(\'mCommSF\',this.value)" style="width:140px;' + inS + '"></label></div>'); }
    /* conflicting other income: both sets of figures are shown as printed, and nothing is decided until you choose */
    var cfl = I && I.conflicts && I.conflicts[S.basis];
    if(cfl){ var dc = (S.dec && S.dec[S.basis]) || null, pickd = dc && dc.mode === 'pick' ? dc.picks : [];
      var opt = function(m, title, sub, amt){ var on = dc && dc.mode === m; return '<div style="margin-top:6px"><button type="button" class="pl-hbtn' + (on ? ' primary' : '') + '" onclick="bkOMDecide(\'' + m + '\')">' + title + '</button> <span style="font-size:12.5px">' + sub + ' <b>' + amt + '</b></span></div>'; };
      body += box('<b>Decision required: the OM\'s other income does not add up.</b> <span style="font-size:12px;opacity:.7">(' + ({ t12:'Trailing 12', cur:'Current', pf:'Pro Forma' }[S.basis]) + ' column, page ' + (s.income || '?') + ')</span>'
        + '<table style="width:100%;border-collapse:collapse;margin-top:6px;font-variant-numeric:tabular-nums"><tbody><tr><td style="padding:3px 8px">Effective rental income (printed)</td><td style="padding:3px 8px;text-align:right">' + $(cfl.eri) + '</td></tr>'
        + cfl.lines.map(function(l){ return '<tr><td style="padding:3px 8px 3px 22px">' + esc(l.label) + '</td><td style="padding:3px 8px;text-align:right">' + $(l.value) + '</td></tr>'; }).join('')
        + '<tr><td style="padding:3px 8px"><b>The lines add to</b></td><td style="padding:3px 8px;text-align:right"><b>' + $(cfl.listed) + '</b></td></tr>'
        + '<tr><td style="padding:3px 8px">Effective Gross Income (printed)</td><td style="padding:3px 8px;text-align:right">' + $(cfl.egi) + '</td></tr>'
        + '<tr><td style="padding:3px 8px"><b>So the printed figures imply other income of</b></td><td style="padding:3px 8px;text-align:right"><b>' + $(cfl.implied) + '</b></td></tr></tbody></table>'
        + (cfl.matches.length ? '<div style="font-size:12.5px;margin-top:6px">Lines that would add to the implied figure: ' + cfl.matches.map(function(mm2){ return esc(mm2.join(' + ')); }).join('; or ') + '. ' + (cfl.matches.length > 1 ? 'More than one combination fits, so the figures alone cannot say which lines the broker counted.' : '') + '</div>' : '<div style="font-size:12.5px;margin-top:6px">No combination of the listed lines adds to the implied figure.</div>')
        + '<div style="margin-top:8px"><b>What should the deal use?</b> Nothing is chosen for you.</div>'
        + opt('printed', 'Use the printed totals', 'Other income = printed EGI less effective rental income:', $(cfl.implied))
        + opt('lines', 'Use every listed line', 'Other income = the lines as listed:', $(cfl.listed))
        + opt('pick', 'Choose the lines', 'Other income = the lines ticked below:', $(cfl.lines.filter(function(l){ return pickd.indexOf(l.label) >= 0; }).reduce(function(tt, l){ return tt + l.value; }, 0)))
        + (dc && dc.mode === 'pick' ? '<div style="margin:6px 0 0 14px">' + cfl.lines.map(function(l){ return '<label style="display:block;font-size:12.5px"><input type="checkbox"' + (pickd.indexOf(l.label) >= 0 ? ' checked' : '') + ' onchange="bkOMDecide(\'pick\', ' + JSON.stringify(l.label).replace(/"/g, '&quot;') + ')"> ' + esc(l.label) + ' ' + $(l.value) + '</label>'; }).join('') + '</div>' : '')
        + '<div style="font-size:12px;opacity:.75;margin-top:8px">Your choice is saved on the deal with the OM\'s printed figures, so the decision can be reviewed later.</div>'); }
    if(need) body += box('<b>Needed to continue.</b> The OM did not state it clearly enough to use.<div style="margin-top:8px">' + need + '</div>');
    var basisBtn = function(k, t){ return '<button type="button" class="pl-hbtn' + (S.basis === k ? ' primary' : '') + '" onclick="bkOMBasis(\'' + k + '\')">' + t + '</button>'; };
    /* a rent-roll OM has no broker pro forma to switch to */
    var PLAB = { t12:['t12', 'Trailing 12'], cur:['cur', 'In-place (current)'], pf:['pf', 'Broker pro forma'] }, plist = (om.periods && !(I && I.legacyColumns) ? om.periods : ['cur', 'pf']);
    if(om.layout !== 'rentroll') body += box('<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><b style="margin-right:6px">Underwrite on</b>' + plist.map(function(p){ return basisBtn(PLAB[p][0], PLAB[p][1]); }).join('') + '</div><div style="font-size:12px;opacity:.7;margin-top:6px">' + (plist.length > 2 ? 'This OM prints ' + plist.length + ' period columns: choose which one the deal is built from. ' : '') + 'In-place uses current scheduled rents and today\'s expenses. The pro forma uses the rents the OM calls achievable' + (om.pfNOI ? ' (' + $(om.pfNOI) + ' NOI)' : '') + '.' + (plist.indexOf('t12') >= 0 && om.t12NOI != null ? ' Trailing 12 NOI is ' + $(om.t12NOI) + '.' : '') + '</div>');
    /* does each period's own page hold together? */
    if(I && I.recon && Object.keys(I.recon).length){ var PNm = { t12:'Trailing 12', cur:'Current', pf:'Pro Forma' }; body += box('<b>Reconciliation to the OM page</b> <span style="font-size:12px;opacity:.7">(page ' + (s.income || '?') + '; each column checked against its own printed totals)</span><table style="width:100%;border-collapse:collapse;margin-top:6px;font-variant-numeric:tabular-nums"><thead><tr><th style="text-align:left;padding:4px 8px">Period</th><th style="text-align:left;padding:4px 8px">Check</th><th style="text-align:right;padding:4px 8px">Computed</th><th style="text-align:right;padding:4px 8px">Printed</th><th style="padding:4px 8px"></th></tr></thead><tbody>' + Object.keys(I.recon).map(function(p){ return I.recon[p].map(function(c){ return '<tr><td style="padding:4px 8px">' + PNm[p] + '</td><td style="padding:4px 8px">' + esc(c.label) + '</td><td style="padding:4px 8px;text-align:right">' + $(c.a) + '</td><td style="padding:4px 8px;text-align:right">' + $(c.b) + '</td><td style="padding:4px 8px"><span class="status-chip ' + (c.ok ? 'pass' : 'warn') + '">' + (c.ok ? 'TIES' : 'DIFFERS') + '</span></td></tr>'; }).join(''); }).join('') + '</tbody></table>' + (Object.keys(I.recon).some(function(p){ return I.recon[p].some(function(c){ return !c.ok; }); }) ? '<div style="font-size:12px;opacity:.75;margin-top:6px">A check that DIFFERS means the page\'s own figures do not agree (a subtotal listed as a line, a mis-read figure, or a broker error). Nothing has been adjusted to make it agree: compare it with the OM page.</div>' : '')); }
    body += confBar(C);
    body += box('<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px"><b>' + esc(d.name) + '</b><span style="opacity:.7">' + esc(d.location) + '</span>' + (b.tie == null ? '' : '<span class="status-chip ' + (ok ? 'pass' : 'warn') + '">' + (ok ? 'TIES TO OM NOI' : 'NOI DIFFERS') + ' · engine ' + $(b.tie) + ' vs OM ' + $(b.want) + '</span>') + '</div>'
      + '<table style="width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums"><thead><tr><th style="text-align:left;padding:5px 8px"></th><th style="text-align:right;padding:5px 8px">Value</th><th style="text-align:left;padding:5px 8px">Source</th><th style="text-align:left;padding:5px 8px">Confidence</th></tr></thead><tbody>'
      + row('Purchase price (asking)', $(d.purchasePrice), s.price, '', cf.purchasePrice) + row(om.layout === 'rentroll' ? 'Apartments' : 'Units', d.units, s.units, '', cf.units) + row('Building area', d.gsf ? d.gsf.toLocaleString('en-US') + ' SF' : '—', s.sf, '', cf.gsf)
      + (om.layout === 'rentroll' ? row('Residential rent (year)', $(I.gsr.cur) + ' · ' + $(d.avgRent) + ' avg/mo', s.rentRoll, '', cf.avgRent) + (I.comm.cur ? row('Commercial rent (year)', $(I.comm.cur), s.rentRoll, '', cf.avgRent) : '') + row('Other income (year)', $(I.addTot.cur), s.rentRoll, '', cf.avgRent)
        : row('Average monthly rent', $(d.avgRent), s.unitMix || s.income, '', cf.avgRent) + (I.mixed ? row('Commercial rent (year)', d.commercialArea > 0 ? $(d.commercialArea * d.commercialRent) : 'area needed', s.income, '', cf.avgRent) : '') + row('Other income per unit (year)', $(d.otherIncomePerUnit), s.income, '', cf.otherIncomePerUnit)) + row('Vacancy', pct(d.vacancy, 1), s.income, '', cf.vacancy) + row('Management fee', pct(d.mgmtPct, 2) + ' of income', s.income, '', cf.mgmtPct)
      + row('Real estate taxes', $(d.taxes), s.income, '', cf.taxes) + row('Insurance', $(d.insurance), s.income, '', cf.insurance) + row('Utilities (electric, gas, water, trash)', $(d.utilities), s.income, '', cf.utilities) + row('Repairs and maintenance', $(d.rm), s.income, '', cf.rm) + row('Contract services and landscaping', $(d.contract), s.income, '', cf.contract) + (d.ga ? row('Other expenses', $(d.ga), s.income, '', cf.ga) : '')
      + row('Going-in cap rate on in-place NOI', pct(b.cap), s.noi, '', cf.t12noi) + row('Exit cap rate', pct(d.exitCap), '', 'assumed', cf.exitCap) + row('Replacement reserves', '$0', '', 'assumed', cf.reserves) + '</tbody></table>'
      + (om.yearBuilt || om.zoning ? '<div style="font-size:12px;opacity:.7;margin-top:8px">Also in the OM: ' + [om.yearBuilt && 'built ' + om.yearBuilt, om.lotAcres && om.lotAcres + ' acres', om.stories && om.stories + ' stories', om.parking && om.parking + ' parking spaces', om.zoning && 'zoned ' + om.zoning].filter(Boolean).join(', ') + '.</div>' : ''));
    body += classBox(b.lines);
    body += box('<b>Before you rely on it</b><ul style="margin:6px 0 0 18px;padding:0">' + b.notes.map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>');
    body += window.bkLearn.panel();
    body += '<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="pl-hbtn primary" onclick="bkOMCreate()"' + (ready ? '' : ' disabled') + '>Create new deal from this OM</button>' + (S.target === 'apply' ? '<button type="button" class="pl-hbtn" onclick="bkOMApply()">Apply to the current deal instead</button>' : '') + '</div>'
      + '<div style="font-size:12px;opacity:.7;margin-top:6px">A new deal keeps the OM in its Deal Documents and uses the OM\'s cover picture as its photo (replace it there with your own).</div>';
  }
  hdr.main = body; return hdr;
}
var g = function(){ return render(); };
if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Import OM', g); else RENDERERS['Import OM'] = g;

})();
