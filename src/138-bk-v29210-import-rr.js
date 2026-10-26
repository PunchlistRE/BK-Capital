
/* V29.21.0 - IMPORT RENT ROLL. Upload a unit-level rent roll (Excel, CSV or a text PDF), confirm how its columns map to the app's rent-roll fields,
   review every unit and the warnings, then replace or add to the active deal's Rent Roll. Nothing is written until you press the button. */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof window.bkImportParseFile !== 'function') return;
var FIELDS = [
  ['unit', 'Unit / suite', /^(unit|suite|space|apt|apartment|unit\s*(#|no\.?|number|id|name))$|^unit\b(?!.*(type|sq|sf|area))/i],
  ['type', 'Unit type / use', /^(unit\s*type|type|floor\s*plan|floorplan|use|category|space\s*type)/i],
  ['sf', 'Square feet', /(sq\.?\s*f|square|^sf$|\bsf\b|^area|rsf|nra)/i],
  ['tenant', 'Tenant / resident', /^(tenant|resident|name|lessee|occupant|tenant\s*name|resident\s*name|customer)/i],
  ['status', 'Status', /^(status|occupancy|occupied|lease\s*status|unit\s*status)/i],
  ['inplace', 'In-place rent', /(annual\s*rent|lease\s*rent|actual\s*rent|current\s*rent|in[- ]?place|contract\s*rent|monthly\s*rent|billed|base\s*rent|^rent$|^rent\b(?!.*market))/i],
  ['market', 'Market rent', /(market|asking|pro\s*forma)/i],
  ['start', 'Lease start', /(lease\s*(from|start|begin)|^start|commenc|move[- ]?in)/i],
  ['end', 'Lease end', /(lease\s*(to|end|exp)|expir|^end|maturity)/i],
  ['recovery', 'Recoveries (monthly)', /(recover|\bcam\b|\bnnn\b|reimburs)/i]
];
var COMM = /retail|office|commercial|industrial|warehouse|storage|restaurant|medical|flex|suite\b/i;
var S = { file:'', kind:'', rows:[], head:-1, map:{}, basis:'monthly', typeMode:'auto', fromPdf:false, msg:'', msgOk:false };
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function $(v){ var x = Number(v); if(!isFinite(x)) return 'n/a'; var b = Math.abs(x).toLocaleString('en-US', {maximumFractionDigits:0}); return x < 0 ? '($' + b + ')' : '$' + b; }
function P(v, d){ return (v == null || !isFinite(v)) ? 'n/a' : (v * 100).toFixed(d == null ? 1 : d) + '%'; }
function box(h){ return '<div style="background:var(--surface,#fff);border:1px solid var(--line,#dbe4ec);border-radius:8px;padding:14px 16px;margin-top:12px;font-size:13px;line-height:1.55;max-width:1000px">' + h + '</div>'; }
function txt(c){ return c == null ? '' : String(c).trim(); }
function num(c){ if(typeof c === 'number') return isFinite(c) ? c : null; var s = txt(c).replace(/[$,\s]/g, ''); if(!s || s === '-') return s === '-' ? 0 : null; var neg = /^\(.*\)$/.test(s); s = s.replace(/[()]/g, ''); return /^-?\d*\.?\d+$/.test(s) ? (neg ? -parseFloat(s) : parseFloat(s)) : null; }
function iso(y, m, d){ return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }
function toDate(c){
  if(c == null || c === '') return '';
  if(typeof c === 'number'){ if(c > 20000 && c < 80000){ var dt = new Date(Date.UTC(1899, 11, 30) + Math.round(c) * 86400000); return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()); } return ''; }
  var s = txt(c), m;
  if((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return iso(m[1], +m[2], +m[3]);
  if((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s))){ var y = +m[3]; if(y < 100) y += y < 70 ? 2000 : 1900; return iso(y, +m[1], +m[2]); }
  var t = Date.parse(s + ' UTC'); if(isFinite(t)){ var d2 = new Date(t); return iso(d2.getUTCFullYear(), d2.getUTCMonth() + 1, d2.getUTCDate()); } return '';
}
function detectHeader(rows){
  var best = -1, bs = 0;
  for(var i = 0; i < Math.min(rows.length, 60); i++){ var r = rows[i] || [], sc = 0, used = {};
    FIELDS.forEach(function(f){ for(var c = 0; c < r.length; c++){ if(typeof r[c] === 'string' && !used[c] && f[2].test(r[c].trim())){ used[c] = 1; sc++; break; } } });
    if(sc > bs){ bs = sc; best = i; } }
  return bs >= 3 ? best : -1;
}
function guessMap(hdr){
  var map = {}, used = {};
  var order = ['unit', 'market', 'start', 'end', 'recovery', 'type', 'sf', 'tenant', 'status', 'inplace'];
  order.forEach(function(k){ var f = FIELDS.filter(function(x){ return x[0] === k; })[0];
    for(var c = 0; c < hdr.length; c++){ if(used[c]) continue; var h = txt(hdr[c]); if(h && f[2].test(h)){ map[k] = c; used[c] = 1; break; } } });
  return map;
}
function guessBasis(hdr, map){ var h = txt(hdr[map.inplace]) + ' ' + txt(hdr[map.market]); if(/(psf|\/\s*sf|per\s*sf|per\s*square)/i.test(h)) return 'annualPsf'; if(/(annual|yearly|\/\s*yr|per\s*year)/i.test(h)) return 'annual'; return 'monthly'; }
function parseUnits(){
  var rows = S.rows, hdr = rows[S.head] || [], map = S.map, out = [], warn = [], seen = {}, dup = 0, totalRow = null, skipped = 0;
  var scale = function(v, sf){ if(v == null) return 0; return S.basis === 'annual' ? v / 12 : S.basis === 'annualPsf' ? v * (sf || 0) / 12 : v; };
  for(var i = S.head + 1; i < rows.length; i++){ var r = rows[i] || [];
    var get = function(k){ return map[k] != null && map[k] >= 0 ? r[map[k]] : null; };
    var first = txt(r[0]); var uid = txt(get('unit'));
    if(/^(grand\s*)?(sub)?total/i.test(first) || /^(grand\s*)?(sub)?total/i.test(uid)){ totalRow = r; continue; }
    if(!uid){ if(r.some(function(c){ return c != null && c !== ''; })) skipped++; continue; }
    if(seen[uid]){ dup++; continue; } seen[uid] = 1;
    var sf = num(get('sf')) || 0, tenant = txt(get('tenant')), stx = txt(get('status')), typ = txt(get('type'));
    var vacant = /vacan|available|unrented|down|model/i.test(stx) || (/vacan/i.test(tenant)) || (!tenant && !/occup|current|notice|mtm|month|lease|renew|future/i.test(stx) && map.tenant != null && !stx);
    var occupied = !vacant;
    if(map.status != null && stx && /occup|current|notice|mtm|month|renew|future/i.test(stx)) occupied = true;
    var inp = scale(num(get('inplace')), sf), mk = map.market != null ? scale(num(get('market')), sf) : null, rec = map.recovery != null ? (num(get('recovery')) || 0) : 0;
    var comm = S.typeMode === 'Commercial' ? true : S.typeMode === 'Residential' ? false : (COMM.test(typ) || COMM.test(uid));
    var w = [];
    if(occupied && !(inp > 0)) w.push('occupied with no rent');
    if(mk === null){ mk = occupied ? inp : 0; } else if(!(mk > 0) && !occupied) w.push('vacant with no market rent');
    if(occupied && mk > 0 && inp > mk * 1.5) w.push('in-place rent is >150% of market');
    if(!occupied) inp = 0;
    if(!(sf > 0)) w.push('no square feet');
    var ls = toDate(get('start')), le = toDate(get('end'));
    if(ls && le && le < ls) w.push('lease ends before it starts');
    out.push({ unitId:uid, sf:sf, tenantType:comm ? 'Commercial' : 'Residential', status:occupied ? 'Occupied' : 'Vacant', inPlaceRent:Math.round(inp * 100) / 100, marketRent:Math.round(mk * 100) / 100, recovery:rec, leaseStart:ls, leaseEnd:le, _w:w });
  }
  if(dup) warn.push(dup + ' repeated unit row' + (dup === 1 ? '' : 's') + ' ignored (the first row of each unit is used; Yardi prints extra rows for charge detail).');
  if(map.market == null) warn.push('No market-rent column mapped: occupied units use their in-place rent as market (no loss to lease); vacant units have no rent.');
  if(map.start == null && map.end == null) warn.push('No lease dates mapped: the Lease Cohort and rollover views will have nothing to work with.');
  if(S.fromPdf) warn.push('PDF columns are read by position: check the preview carefully (a vacant unit with a blank tenant cell can shift its row).');
  var flagged = out.filter(function(u){ return u._w.length; }).length; if(flagged) warn.push(flagged + ' unit' + (flagged === 1 ? ' has' : 's have') + ' a warning (see the Notes column).');
  var stats = summarise(out), recon = null;
  if(totalRow){ var tin = map.inplace != null ? num(totalRow[map.inplace]) : null, tsf = map.sf != null ? num(totalRow[map.sf]) : null;
    var sumIn = out.reduce(function(a, u){ return a + (u.status === 'Occupied' ? u.inPlaceRent : 0) * (S.basis === 'monthly' ? 1 : 1); }, 0), sumSF = out.reduce(function(a, u){ return a + u.sf; }, 0);
    recon = { rentPrinted:tin, rentSum:sumIn, sfPrinted:tsf, sfSum:sumSF, rentOk:tin == null || S.basis !== 'monthly' ? null : Math.abs(tin - out.reduce(function(a, u){ return a + u.inPlaceRent; }, 0)) < 1, sfOk:tsf == null ? null : Math.abs(tsf - sumSF) < 1 }; }
  return { units:out, warnings:warn, stats:stats, recon:recon, skipped:skipped };
}
function summarise(us){
  var res = us.filter(function(u){ return u.tenantType === 'Residential'; }), com = us.filter(function(u){ return u.tenantType === 'Commercial'; });
  var s = function(a, k){ return a.reduce(function(t, u){ return t + (Number(u[k]) || 0); }, 0); }, occ = function(a, k){ return s(a.filter(function(u){ return u.status === 'Occupied'; }), k); }, vac = function(a, k){ return s(a.filter(function(u){ return u.status !== 'Occupied'; }), k); };
  var occN = us.filter(function(u){ return u.status === 'Occupied'; }).length;
  return { n:us.length, resUnits:res.length, commSuites:com.length, resSF:s(res, 'sf'), commSF:s(com, 'sf'), occupied:occN, occPct:us.length ? occN / us.length : 0,
    resInPlace:occ(res, 'inPlaceRent') + vac(res, 'marketRent'), resMarket:s(res, 'marketRent'), commInPlace:occ(com, 'inPlaceRent') + vac(com, 'marketRent'), commMarket:s(com, 'marketRent') };
}
function alignPdf(sh){
  var rows = sh.rows, xs = sh.xs; if(!xs) return rows; var h = detectHeader(rows); if(h < 0) return rows; var hx = xs[h];
  return rows.map(function(r, i){ if(i === h) return r; var o = new Array(hx.length).fill(null);
    r.forEach(function(c, j){ var x = xs[i][j], col = 0; for(var k = 0; k < hx.length; k++){ if(hx[k] <= x + 4) col = k; } o[col] = o[col] == null ? c : (typeof o[col] === 'string' && typeof c === 'string' ? o[col] + ' ' + c : o[col]); }); return o; });
}
window.bkRRSheets = function(parsed){ return parsed.sheets.map(function(sh){ return { name:sh.name, rows:parsed.kind === 'pdf' ? alignPdf(sh) : sh.rows }; }); };
window.bkRRParse = function(rows, opts){ var keep = S; S = Object.assign({}, S, { rows:rows, head:detectHeader(rows), basis:'monthly', typeMode:'auto', fromPdf:false }, opts || {}); S.map = guessMap(rows[S.head] || []); var r = S.head < 0 ? null : parseUnits(); var head = S.head, map = S.map; S = keep; return r && Object.assign(r, { head:head, map:map }); };

window.bkRRRun = async function(inp){
  var f = inp && inp.files && inp.files[0]; if(!f) return;
  S = { file:f.name, kind:'', rows:[], head:-1, map:{}, basis:'monthly', typeMode:'auto', fromPdf:false, msg:'Reading ' + f.name + '...', msgOk:false }; showSheet('Import Rent Roll');
  try { var parsed = await window.bkImportParseFile(f); S.kind = parsed.kind; S.fromPdf = parsed.kind === 'pdf';
    if(parsed.unreadable){ S.msg = 'This PDF has no readable text (scanned, or its fonts use an encoding this reader cannot decode). Use the spreadsheet or CSV export of the rent roll.'; }
    else { var best = null; window.bkRRSheets(parsed).forEach(function(sh){ var h = detectHeader(sh.rows); if(h >= 0 && (!best || sh.rows.length > best.rows.length)) best = { rows:sh.rows, head:h, name:sh.name }; });
      if(!best) S.msg = 'No rent-roll header row found (looked for columns such as Unit, Sq Ft, Tenant, Lease Rent, Market Rent, Lease From / To). Rename the headers or use a different export.';
      else { S.rows = best.rows; S.head = best.head; S.map = guessMap(best.rows[best.head]); S.basis = guessBasis(best.rows[best.head], S.map); S.msgOk = true; S.msg = 'Read ' + (best.rows.length - best.head - 1) + ' rows from ' + f.name + (parsed.sheets.length > 1 ? ' (sheet "' + best.name + '")' : '') + '. Check the column mapping, then apply.'; } }
  } catch(e){ S.msg = 'Could not read ' + f.name + ': ' + (e && e.message || e); }
  showSheet('Import Rent Roll');
};
window.bkRRMap = function(k, v){ S.map[k] = v === '' ? null : +v; showSheet('Import Rent Roll'); };
window.bkRROpt = function(k, v){ S[k] = v; showSheet('Import Rent Roll'); };
window.bkRRApply = function(mode, setUnits){
  if(S.head < 0) return; var R = parseUnits(), s = bkLoad(); if(!s || !R.units.length) return;
  var rows = R.units.map(function(u){ return { unitId:u.unitId, sf:u.sf, tenantType:u.tenantType, status:u.status, inPlaceRent:u.inPlaceRent, marketRent:u.marketRent, recovery:u.recovery, leaseStart:u.leaseStart, leaseEnd:u.leaseEnd }; });
  var old = Array.isArray(s.rentRoll) ? s.rentRoll : [];
  s.rentRoll = mode === 'add' ? old.concat(rows) : rows;
  s.revenueBasis = 'RENT ROLL'; var C = confRR(R); s._impRR = window.bkConf.stamp({}, C, S.file)._imp;
  if(setUnits){ var st = bkRentRollStats(s.rentRoll); if(st.resUnits > 0) s.units = st.resUnits; }
  bkSave(s); showSheet('Rent Roll');
};
/* confidence in what the roll will load: totals the report prints are the strongest check; mapped-by-guess columns are only Check until you confirm them */
function confRR(R){ var F = {}, set = function(k, l, why){ F[k] = { l:l, why:why }; }, rc = R.recon, us = R.units, map = S.map, n = function(rx){ return us.filter(function(u){ return u._w.some(function(w){ return rx.test(w); }); }).length; };
  var s = bkLoad(), want = s && Number(s.units) > 0 ? Number(s.units) : 0;
  if(!us.length) return { fields:F, sum:window.bkConf.summary(F) };
  var dup = R.warnings.filter(function(w){ return /repeated unit row/.test(w); })[0];
  set('unit', dup ? 'check' : 'verified', dup ? dup : us.length + ' unit IDs, none repeated.');
  if(want && R.stats.resUnits && R.stats.resUnits !== want) set('unitCount', 'low', 'The deal has ' + want + ' units; the rent roll has ' + R.stats.resUnits + ' residential. The option below can set the deal to the roll.'); else if(want) set('unitCount', 'verified', 'The residential count matches the deal\'s ' + want + ' units.');
  if(map.sf == null) set('sf', 'low', 'No square-feet column is mapped.'); else if(rc && rc.sfOk === true) set('sf', 'verified', 'The imported square feet add up to the report\'s printed total (' + rc.sfPrinted.toLocaleString('en-US') + ').'); else if(rc && rc.sfOk === false) set('sf', 'low', 'Imported square feet (' + rc.sfSum.toLocaleString('en-US') + ') differ from the printed total (' + rc.sfPrinted.toLocaleString('en-US') + ').'); else set('sf', n(/no square feet/) ? 'low' : 'check', n(/no square feet/) ? n(/no square feet/) + ' units have no square feet.' : 'No printed total to check against.');
  var occ = us.filter(function(u){ return u.status === 'Occupied' && u.tenantType === 'Residential' && u.inPlaceRent > 0; }), avg = occ.length ? occ.reduce(function(t, u){ return t + u.inPlaceRent; }, 0) / occ.length : null;
  if(map.inplace == null) set('inplace', 'low', 'No in-place rent column is mapped.'); else if(avg != null && (avg < 200 || avg > 15000)) set('inplace', 'low', 'Occupied residential units average ' + $(avg) + ' a month, which looks wrong. Check whether the rents are monthly, annual or per square foot.'); else if(rc && rc.rentOk === true) set('inplace', 'verified', 'Imported in-place rents add up to the report\'s printed total.'); else if(rc && rc.rentOk === false) set('inplace', 'low', 'Imported in-place rents do not add up to the report\'s printed total. Check the rent basis (monthly, annual, per SF).'); else set('inplace', n(/occupied with no rent/) ? 'low' : 'check', n(/occupied with no rent/) ? n(/occupied with no rent/) + ' occupied units show no rent.' : 'No printed total to check against. Confirm the rent basis (monthly, annual, per SF).');
  if(map.market == null) set('market', 'assumed', 'No market-rent column: occupied units use their in-place rent, so there is no loss to lease.'); else set('market', n(/>150%/) ? 'check' : 'check', n(/>150%/) ? n(/>150%/) + ' units have in-place rent above 150% of market.' : 'Mapped by header name; nothing in the report corroborates it.');
  var bad = n(/ends before it starts/);
  if(map.start == null && map.end == null) set('dates', 'low', 'No lease dates are mapped, so rollover has nothing to work with.'); else set('dates', bad ? 'low' : 'check', bad ? bad + ' leases end before they start.' : 'Dates read from the mapped columns.');
  set('type', S.typeMode === 'auto' ? 'check' : 'verified', S.typeMode === 'auto' ? 'Residential or commercial is guessed from the unit type wording.' : 'You set every unit\'s type.');
  set('status', map.status != null ? 'check' : 'check', map.status != null ? 'From the status column.' : 'Occupied or vacant is inferred from the tenant name and rent.');
  return { fields:F, sum:window.bkConf.summary(F) }; }
window.bkRRConf = function(){ return S.head >= 0 ? confRR(parseUnits()) : null; };
var RR_ROWS = { unit:['unit', 'unitCount'], type:['type'], sf:['sf'], tenant:['status'], status:['status'], inplace:['inplace'], market:['market'], start:['dates'], end:['dates'] };
function sel(k){ var hdr = S.rows[S.head] || [], cur = S.map[k]; var o = '<option value="">(none)</option>'; hdr.forEach(function(h, c){ var t = txt(h); if(t) o += '<option value="' + c + '"' + (cur === c ? ' selected' : '') + '>' + esc(t) + '</option>'; });
  return '<select onchange="bkRRMap(\'' + k + '\',this.value)">' + o + '</select>'; }
function render(){
  var s = bkLoad(), body = box('<b>Upload a unit-level rent roll.</b> Excel, CSV, or a PDF with a text layer. The importer finds the header row, proposes which column is which, and shows every unit it will create. A populated Rent Roll becomes the deal’s revenue source (monthly in-place rent for occupied units, market rent for vacant ones). Nothing is changed until you press a button below.'
    + '<div style="margin-top:10px"><input id="bkRRFile" type="file" accept=".xlsx,.xlsm,.csv,.pdf" onchange="bkRRRun(this)"></div>');
  if(S.msg) body += box((S.msgOk ? '&#10003; ' : '&#9888; ') + esc(S.msg));
  if(S.head >= 0){
    var R = parseUnits(), st = R.stats, CR = confRR(R), maprows = FIELDS.map(function(f){ var ck = (RR_ROWS[f[0]] || []).map(function(k){ return CR.fields[k]; }).filter(Boolean); return '<tr><td class="rowlabel">' + f[1] + '</td><td>' + sel(f[0]) + '</td><td style="white-space:nowrap">' + ck.map(function(c){ return window.bkConf.chip(c); }).join(' ') + '</td></tr>'; }).join('');
    body += window.bkConf.bar(CR, 'report') + '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Column Mapping</caption><thead><tr><th class="rowlabel-h">App field</th><th style="text-align:left">Column in the file</th><th style="text-align:left">Confidence</th></tr></thead><tbody>' + maprows
      + '<tr><td class="rowlabel">Rent amounts are</td><td style="text-align:left"><select onchange="bkRROpt(\'basis\',this.value)">' + [['monthly', 'monthly $ per unit'], ['annual', 'annual $ per unit'], ['annualPsf', 'annual $ per SF']].map(function(o){ return '<option value="' + o[0] + '"' + (S.basis === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></td></tr>'
      + '<tr><td class="rowlabel">Treat every unit as</td><td style="text-align:left"><select onchange="bkRROpt(\'typeMode\',this.value)">' + [['auto', 'detect from unit type'], ['Residential', 'residential'], ['Commercial', 'commercial']].map(function(o){ return '<option value="' + o[0] + '"' + (S.typeMode === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></td></tr></tbody></table></div>';
    var rc = R.recon, rcTxt = '';
    if(rc){ rcTxt = '<div style="margin-top:8px;font-size:12px">Report totals: ' + (rc.sfPrinted != null ? 'SF printed ' + rc.sfPrinted.toLocaleString('en-US') + ' vs ' + rc.sfSum.toLocaleString('en-US') + ' imported ' + (rc.sfOk ? '<span class="status-chip pass">TIES</span>' : '<span class="status-chip warn">DIFFERS</span>') : '') + (rc.rentPrinted != null && rc.rentOk !== null ? ' &nbsp; In-place rent printed ' + $(rc.rentPrinted) + ' vs ' + $(R.units.reduce(function(a, u){ return a + u.inPlaceRent; }, 0)) + ' imported ' + (rc.rentOk ? '<span class="status-chip pass">TIES</span>' : '<span class="status-chip warn">DIFFERS</span>') : '') + '</div>'; }
    body += '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>What Will Be Imported</caption><thead><tr><th class="rowlabel-h">Measure</th><th>Residential</th><th>Commercial</th></tr></thead><tbody>'
      + '<tr><td class="rowlabel">Units / suites</td><td>' + st.resUnits + '</td><td>' + st.commSuites + '</td></tr><tr><td class="rowlabel">Square feet</td><td>' + st.resSF.toLocaleString('en-US') + ' sf</td><td>' + st.commSF.toLocaleString('en-US') + ' sf</td></tr>'
      + '<tr><td class="rowlabel">In-place rent ($/mo, vacant at market)</td><td>' + $(st.resInPlace) + '</td><td>' + $(st.commInPlace) + '</td></tr><tr><td class="rowlabel">Market rent ($/mo)</td><td>' + $(st.resMarket) + '</td><td>' + $(st.commMarket) + '</td></tr>'
      + '<tr><td class="rowlabel">Loss to lease</td><td>' + (st.resMarket ? P(1 - st.resInPlace / st.resMarket) : 'n/a') + '</td><td>' + (st.commMarket ? P(1 - st.commInPlace / st.commMarket) : 'n/a') + '</td></tr>'
      + '<tr class="grandtotal"><td class="rowlabel">Occupied</td><td colspan="2">' + st.occupied + ' of ' + st.n + ' (' + P(st.occPct) + ')</td></tr></tbody></table>' + rcTxt + '</div>';
    if(R.warnings.length) body += box('<b>Review before applying</b><ul style="margin:6px 0 0 18px">' + R.warnings.map(function(w){ return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>');
    var prev = R.units.slice(0, 30).map(function(u){ return '<tr><td class="rowlabel">' + esc(u.unitId) + '</td><td>' + u.tenantType + '</td><td>' + u.sf.toLocaleString('en-US') + '</td><td>' + u.status + '</td><td>' + $(u.inPlaceRent) + '</td><td>' + $(u.marketRent) + '</td><td>' + esc(u.leaseStart) + '</td><td>' + esc(u.leaseEnd) + '</td><td style="text-align:left;font-size:11px">' + esc(u._w.join('; ')) + '</td></tr>'; }).join('');
    body += '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Preview - first ' + Math.min(30, R.units.length) + ' of ' + R.units.length + ' units</caption><thead><tr><th class="rowlabel-h">Unit</th><th>Type</th><th>SF</th><th>Status</th><th>In-place</th><th>Market</th><th>Lease start</th><th>Lease end</th><th>Notes</th></tr></thead><tbody>' + prev + '</tbody></table></div>';
    var have = s && Array.isArray(s.rentRoll) ? s.rentRoll.length : 0;
    body += '<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center"><label style="font-size:12px"><input type="checkbox" id="bkRRSetUnits" checked> also set the deal’s Units to the residential count (' + st.resUnits + ')</label>'
      + '<button type="button" class="status-chip pass" onclick="bkRRApply(\'replace\',document.getElementById(\'bkRRSetUnits\').checked)">' + (have ? 'REPLACE THE EXISTING ' + have + ' UNITS WITH THESE ' + R.units.length : 'ADD THESE ' + R.units.length + ' UNITS TO THE RENT ROLL') + '</button>'
      + (have ? '<button type="button" class="status-chip" onclick="bkRRApply(\'add\',document.getElementById(\'bkRRSetUnits\').checked)">ADD TO THE EXISTING ' + have + '</button>' : '') + '</div>'
      + '<div style="margin-top:6px;font-size:11px;opacity:.75">Undo restores the previous rent roll.</div>';
  }
  return { title:'Import Rent Roll', crumbs:'Inputs', desc:'Upload a unit-level rent roll, map its columns, review every unit, then apply it to the deal.', meta:{ Source:S.file || 'none', Format:S.kind ? S.kind.toUpperCase() : 'xlsx / csv / pdf', Units:S.head >= 0 ? parseUnits().units.length : 0 }, sidebar:'', main:body };
}
var g = function(){ if(typeof window.bkHasActiveDeal === 'function' && !window.bkHasActiveDeal() && typeof window.bkEmptyState === 'function') return window.bkEmptyState('Import Rent Roll'); return render(); };
if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Import Rent Roll', g); else RENDERERS['Import Rent Roll'] = g;
})();
