/* ===========================================================================
   DEVELOPMENT LEASE-UP BY UNIT TYPE. A development deal can lease up two ways:
     "Simple ramp" (the default, and every existing deal): one occupancy line for the whole project, from the pre-leased share to 100% over the lease-up months.
     "By unit type": each unit type has its own units, rent, delivery pattern (when units are completed and handed over), marketing start, absorption (units
     signed a month), sign-to-move-in lag and free rent. Deliveries, leases signed, leases commenced (units occupied) and units paying rent are tracked month by
     month for each type; the project's occupancy is the units occupied over all units, and its income is the rent-weighted share of units paying.
   Nothing here replaces the engine. The monthly schedule is turned into the SAME ramp the engine already consumes (bkDevLeaseupRamp: month, occupancy, EGI,
   NOI, NOI after reserves), so the lease-up operating deficit that is funded in the cost ladder, the monthly NOI earned during lease-up in the development
   cash flow, the stabilisation month and the exit all follow from the unit schedule. Stabilised income is untouched: it is still the deal's stabilised EGI
   (units x average rent less vacancy and the rest), and in this mode the units and the average rent come from the unit mix, so the two always agree.
   Switching to "By unit type" seeds one unit type that reproduces the simple ramp exactly, so nothing moves until a schedule is edited.
   =========================================================================== */
(function(){
'use strict';
if(typeof bkLoad !== 'function' || typeof RENDERERS === 'undefined') return;
var MAXJ = 240;   /* months after completion searched for stabilisation */
function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
function has(v){ return v !== null && v !== undefined && v !== '' && isFinite(Number(v)); }
function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function isDev(s){ return /develop/i.test(String((s && s.dealType) || '')); }
function money(v){ return (v < 0 ? '($' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US') + (v < 0 ? ')' : ''); }
function pct(v, d){ return isFinite(v) ? (v * 100).toFixed(d === undefined ? 2 : d) + '%' : '-'; }
function cur(){ return typeof currentSheet !== 'undefined' ? currentSheet : 'Dev Lease-Up'; }

window.bkDevUnitOn = function(s){ s = s || bkLoad(); var d = s && s.devLeaseup; return !!(s && isDev(s) && d && d.mode === 'units' && Array.isArray(d.types) && d.types.some(function(t){ return num(t && t.units) > 0; })); };

function norm(t){
  var U = Math.max(0, num(t.units));
  return { name:String(t.name || 'Unit type'), units:U, rent:Math.max(0, num(t.rent)),
    dStart:Math.round(num(t.deliverStart)), dPer:num(t.deliverPerMo) > 0 ? num(t.deliverPerMo) : U,
    mStart:has(t.marketStart) ? Math.round(num(t.marketStart)) : Math.round(num(t.deliverStart)), aPer:Math.max(0, num(t.absorbPerMo)),
    pre:Math.max(0, Math.min(U, num(t.preleased))), lag:Math.max(0, Math.round(num(t.commenceLag))), free:Math.max(0, Math.round(num(t.freeMonths))) };
}

/* One pass of the schedule at a given absorption time-stretch (lambda 1 = as entered). */
function run(T, U, stabTarget, lambda){
  var out = [], stabJ = null, rentW = T.reduce(function(a, t){ return a + t.units * t.rent; }, 0);
  for(var j = 0; j <= MAXJ; j++){
    var row = { j:j, byType:[], delivered:0, signed:0, commenced:0, paying:0 }, payRent = 0;
    T.forEach(function(t, ti){
      var delivered = j >= t.dStart ? Math.min(t.units, t.dPer * (j - t.dStart + 1)) : 0;
      var signedAt = function(k){ var after = k > t.mStart ? (k - t.mStart) / lambda : 0; return Math.min(t.units, t.pre + t.aPer * after); };
      var commencedAt = function(k){ return k < 0 ? 0 : Math.min(t.units, Math.min(t.units, t.dPer * Math.max(0, k - t.dStart + 1)) * (k >= t.dStart ? 1 : 0), signedAt(k - t.lag)); };
      var signed = signedAt(j), commenced = commencedAt(j), paying = commencedAt(j - t.free);
      row.byType.push({ delivered:delivered, signed:signed, commenced:commenced, paying:paying });
      row.delivered += delivered; row.signed += signed; row.commenced += commenced; row.paying += paying; payRent += paying * t.rent;
    });
    row.occ = U > 0 ? row.commenced / U : 0;
    row.delShare = U > 0 ? row.delivered / U : 0;
    row.payOcc = rentW > 0 ? payRent / rentW : (U > 0 ? row.paying / U : 0);
    out.push(row);
    if(stabJ === null && row.occ >= stabTarget - 1e-9){ stabJ = j; break; }
  }
  return { months:out, stabJ:stabJ };
}

/* The schedule for the active deal (or a scratch copy). Returns null when there are no units. */
window.bkDevUnitSchedule = function(s){
  s = s || bkLoad(); var d = (s && s.devLeaseup) || {}, T = (Array.isArray(d.types) ? d.types : []).map(norm).filter(function(t){ return t.units > 0; });
  if(!T.length) return null;
  var U = T.reduce(function(a, t){ return a + t.units; }, 0), stabTarget = has(d.stabTarget) && num(d.stabTarget) > 0 ? Math.min(1, num(d.stabTarget)) : 1;
  var base = run(T, U, stabTarget, 1), baseLu = base.stabJ === null ? MAXJ : base.stabJ, lambda = 1, res = base;
  /* a lease-up scenario (slower or faster) is applied through leaseupMonths: the absorption is stretched in time so the period is that long */
  var lm = Math.round(num(s.leaseupMonths));
  if(lm > 0 && baseLu > 0 && lm !== baseLu && base.stabJ !== null){ lambda = lm / baseLu; res = run(T, U, stabTarget, lambda); }
  var warnings = [], luMo = res.stabJ === null ? MAXJ : res.stabJ;
  if(res.stabJ === null) warnings.push('At these absorption rates the project never reaches ' + pct(stabTarget, 0) + ' occupied within ' + MAXJ + ' months. Check each type has units leased per month above zero.');
  T.forEach(function(t){ if(t.units - t.pre > 1e-9 && !(t.aPer > 0)) warnings.push(t.name + ': no units are leased per month, so its ' + (t.units - t.pre) + ' unpre-leased units never lease.'); });
  return { types:T, units:U, months:res.months, luMo:luMo, baseLuMo:baseLu, lambda:lambda, stabTarget:stabTarget, incomplete:res.stabJ === null, warnings:warnings };
};
/* lease-up months implied by the unit schedule (the engine reads this in place of leaseupMonths) */
window.bkDevUnitLeaseupMonths = function(s){ var sc = window.bkDevUnitSchedule(s); return sc ? sc.luMo : 0; };

/* the engine's lease-up ramp, built from the unit schedule when the deal uses it, otherwise the simple ramp exactly as before */
var legacyRamp = window.bkDevLeaseupRamp;
window.bkDevLeaseupRamp = function(s, co, stab, luMo){
  if(!window.bkDevUnitOn(s)) return legacyRamp(s, co, stab, luMo);
  if(luMo <= 0) return { months:[], leaseDef:0 };
  var sc = window.bkDevUnitSchedule(s); if(!sc) return legacyRamp(s, co, stab, luMo);
  var c = bkCalc(), mgmtPct = num(s.mgmtPct), fixedAnnual = c.total - c.mgmt, resAnnual = num(s.reserves), byDel = (s.devLeaseup && s.devLeaseup.opexBasis) === 'delivered', months = [];
  for(var j = 0; j < luMo; j++){
    var r = sc.months[Math.min(j, sc.months.length - 1)], f = Math.min(1, sc.stabTarget > 0 ? r.payOcc / sc.stabTarget : 0), share = byDel ? r.delShare : 1;
    var egi = c.egi * f / 12, mgmt = egi * mgmtPct, noi = egi - fixedAnnual * share / 12 - mgmt, after = noi - resAnnual * share / 12;
    months.push({ mo:co + j, f:f, occ:r.occ, payOcc:r.payOcc, delivered:r.delivered, signed:r.signed, commenced:r.commenced, paying:r.paying, egi:egi, noi:noi, after:after });
  }
  return { months:months, leaseDef:Math.max(0, -months.reduce(function(a, m){ return a + m.after; }, 0)) };
};

/* ------------------------------ editing ------------------------------ */
var FIELDS = { name:'text', units:'int', rent:'num', deliverStart:'int', deliverPerMo:'num', marketStart:'int', absorbPerMo:'num', preleased:'num', commenceLag:'int', freeMonths:'int' };
function defaults(){ return { name:'', units:0, rent:0, deliverStart:0, deliverPerMo:0, marketStart:0, absorbPerMo:0, preleased:0, commenceLag:0, freeMonths:0 }; }
function save(s){ window.bkDevUnitSync(s); bkSave(s); if(typeof showSheet === 'function') showSheet(cur()); }
/* the unit mix is the source of the project's unit count and average rent, and the schedule is the source of the lease-up period */
window.bkDevUnitSync = function(s){
  var d = s.devLeaseup; if(!d || d.mode !== 'units') return s; var T = (d.types || []).filter(function(t){ return num(t.units) > 0; }), U = T.reduce(function(a, t){ return a + num(t.units); }, 0);
  if(U > 0){ s.units = U; s.avgRent = T.reduce(function(a, t){ return a + num(t.units) * num(t.rent); }, 0) / U; }
  var tmp = Object.assign({}, s, { leaseupMonths:0 }), sc = window.bkDevUnitSchedule(tmp); if(sc) s.leaseupMonths = sc.baseLuMo; return s;
};
window.bkDevUnitMode = function(mode){
  var s = bkLoad(); s.devLeaseup = Object.assign({}, s.devLeaseup || {});
  if(mode === 'units'){
    if(!Array.isArray(s.devLeaseup.types) || !s.devLeaseup.types.some(function(t){ return num(t.units) > 0; })){
      var U = Math.max(0, Math.round(num(s.units))), lu = Math.max(0, Math.round(num(s.leaseupMonths))), pre = Math.max(0, Math.min(1, num(s.preleasedPct)));
      s.devLeaseup.types = [{ name:'All units', units:U, rent:num(s.avgRent), deliverStart:0, deliverPerMo:0, marketStart:0, absorbPerMo:lu > 0 ? U * (1 - pre) / lu : U, preleased:lu > 0 ? U * pre : U, commenceLag:0, freeMonths:0 }];
    }
    s.devLeaseup.mode = 'units'; if(!s.devLeaseup.opexBasis) s.devLeaseup.opexBasis = 'full';
  } else { s.devLeaseup.mode = 'simple'; }
  save(s);
};
window.bkDevUnitField = function(i, key, raw){
  var s = bkLoad(), d = s.devLeaseup = Object.assign({}, s.devLeaseup || {}), T = d.types = (d.types || []).map(function(t){ return Object.assign({}, t); }), t = T[i]; if(!t || !FIELDS[key]) return;
  if(FIELDS[key] === 'text') t[key] = String(raw || '').trim(); else { var txt = String(raw == null ? '' : raw).replace(/[$,\s]/g, ''), n = txt === '' ? 0 : Number(txt); if(!isFinite(n)){ showSheet(cur()); return; } t[key] = FIELDS[key] === 'int' ? Math.round(n) : n; }
  save(s);
};
window.bkDevUnitAdd = function(){ var s = bkLoad(), d = s.devLeaseup = Object.assign({}, s.devLeaseup || {}); d.types = (d.types || []).slice(); var n = defaults(); n.name = 'Type ' + (d.types.length + 1); d.types.push(n); save(s); };
window.bkDevUnitRemove = function(i){ var s = bkLoad(), d = s.devLeaseup = Object.assign({}, s.devLeaseup || {}); d.types = (d.types || []).filter(function(t, k){ return k !== i; }); if(!d.types.length) d.mode = 'simple'; save(s); };
window.bkDevUnitOpex = function(v){ var s = bkLoad(); s.devLeaseup = Object.assign({}, s.devLeaseup || {}, { opexBasis:v === 'delivered' ? 'delivered' : 'full' }); save(s); };
window.bkDevUnitStab = function(raw){ var n = Number(String(raw).replace(/[%\s,]/g, '')) / 100, s = bkLoad(); s.devLeaseup = Object.assign({}, s.devLeaseup || {}); if(isFinite(n) && n > 0 && n <= 1) s.devLeaseup.stabTarget = n; else delete s.devLeaseup.stabTarget; save(s); };

/* ------------------------------ the sheet ------------------------------ */
function inp(i, key, v, w){ return '<td class="v"><input type="' + (FIELDS[key] === 'text' ? 'text' : 'number') + '" step="any" style="' + (w ? 'width:' + w + 'px;' : '') + (FIELDS[key] === 'text' ? 'text-align:left !important' : '') + '"' + ' value="' + esc(v === 0 && FIELDS[key] !== 'text' && key !== 'deliverStart' && key !== 'marketStart' && key !== 'commenceLag' && key !== 'freeMonths' && key !== 'preleased' ? '' : v) + '" onchange="bkDevUnitField(' + i + ',\'' + key + '\',this.value)"></td>'; }
function chart(sc){
  var W = 760, H = 250, L = 70, R = 130, top = 12, bottom = 30, n = sc.months.length, last = Math.max(1, n - 1), X = function(j){ return L + (j / last) * (W - L - R); }, Y = function(v){ return top + (1 - v) * (H - top - bottom); };
  var COL = ['#2f5f9a', '#c0702b', '#3f7a52', '#7a4e8a', '#9a7b1f', '#a3453a', '#2a7f86'], g = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Lease-up: share of units delivered and occupied, by unit type and for the project">';
  [0, .25, .5, .75, 1].forEach(function(v){ g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="var(--ae-line,#c9d1dc)" stroke-width="1"/><text x="' + (L - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end" font-size="11" fill="var(--ae-dim,#5a6877)">' + Math.round(v * 100) + '%</text>'; });
  var step = Math.max(1, Math.ceil(n / 8)); for(var j = 0; j < n; j += step) g += '<text x="' + X(j) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11" fill="var(--ae-dim,#5a6877)">' + (j === 0 ? 'CO' : '+' + j) + '</text>';
  var line = function(vals, col, w, dash){ var d = ''; vals.forEach(function(v, k){ d += (k ? 'L' : 'M') + X(k).toFixed(1) + ',' + Y(Math.max(0, Math.min(1, v))).toFixed(1); }); return '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + w + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' stroke-linejoin="round"/>'; };
  g += line(sc.months.map(function(r){ return r.delShare; }), 'var(--ae-dim,#8a97a5)', 1.5, '4 3');
  sc.types.forEach(function(t, ti){ g += line(sc.months.map(function(r){ return t.units > 0 ? r.byType[ti].commenced / t.units : 0; }), COL[ti % COL.length], 1.6); });
  g += line(sc.months.map(function(r){ return r.occ; }), 'var(--ae-ink,#1b2733)', 2.8);
  var ly = top + 4; g += '<text x="' + (W - R + 10) + '" y="' + (ly += 14) + '" font-size="11" font-weight="700" fill="var(--ae-ink,#1b2733)">Project occupied</text>';
  sc.types.forEach(function(t, ti){ g += '<text x="' + (W - R + 10) + '" y="' + (ly += 15) + '" font-size="11" fill="' + COL[ti % COL.length] + '">&#9632; ' + esc(t.name).slice(0, 16) + '</text>'; });
  g += '<text x="' + (W - R + 10) + '" y="' + (ly += 15) + '" font-size="11" fill="var(--ae-dim,#5a6877)">- - Delivered</text>';
  return g + '</svg>';
}
function render(){
  var s = bkLoad(), dev = isDev(s);
  var title = 'Dev Lease-Up', crumbs = 'Development', desc = 'Lease-up by unit type: deliveries, absorption, move-ins, occupancy and the income and cash flow they drive.';
  if(!dev) return { title:title, crumbs:crumbs, desc:desc, meta:{ Property:s.name, Status:'Acquisition - N/A' }, main:'<div class="note-flag"><span>&#9432;</span><div>Lease-up by unit type applies to development deals. Open a development deal to use it.</div></div>', sidebar:'' };
  var on = window.bkDevUnitOn(s), d = s.devLeaseup || {}, sc = on ? window.bkDevUnitSchedule(s) : null, x = bkDevV09();
  var head = '<div class="ae-form" style="margin:0 0 10px"><label style="font-weight:600">Lease-up method</label> <select onchange="bkDevUnitMode(this.value)"><option value="simple"' + (on ? '' : ' selected') + '>Simple ramp (one line for the whole project)</option><option value="units"' + (on ? ' selected' : '') + '>By unit type (deliveries and absorption for each type)</option></select></div>';
  var main = '<div class="tbl-wrap"><div style="padding:10px 12px">' + head
    + (on ? '' : '<div class="note-flag"><span>&#9432;</span><div><b>Simple ramp is in use.</b> ' + (num(s.leaseupMonths) > 0 ? 'The project goes from ' + pct(num(s.preleasedPct), 0) + ' pre-leased to fully leased over ' + Math.round(num(s.leaseupMonths)) + ' months, in a straight line. ' : 'No lease-up period is set. ') + 'Choose <b>By unit type</b> to model each unit type separately. It starts as one type that reproduces this ramp exactly, so nothing changes until you edit it.</div></div>') + '</div></div>';
  if(!on) return { title:title, crumbs:crumbs, desc:desc, meta:{ Property:s.name, Method:'Simple ramp', 'Lease-Up':x.luMo + ' mo' }, main:main, sidebar:'' };
  var hdr = '<tr><th class="rowlabel-h">Unit type</th><th>Units</th><th>Rent $ / mo</th><th>First delivery<br><small>mo after CO</small></th><th>Delivered<br><small>per month (blank: all)</small></th><th>Marketing starts<br><small>mo after CO</small></th><th>Leased<br><small>per month</small></th><th>Pre-leased<br><small>units</small></th><th>Sign to move-in<br><small>months</small></th><th>Free rent<br><small>months</small></th><th></th></tr>';
  var rows = (d.types || []).map(function(t, i){ return '<tr class="input">' + inp(i, 'name', t.name || '', 120) + inp(i, 'units', num(t.units), 70) + inp(i, 'rent', num(t.rent), 80) + inp(i, 'deliverStart', num(t.deliverStart), 70) + inp(i, 'deliverPerMo', num(t.deliverPerMo), 80) + inp(i, 'marketStart', has(t.marketStart) ? num(t.marketStart) : num(t.deliverStart), 70) + inp(i, 'absorbPerMo', num(t.absorbPerMo), 70) + inp(i, 'preleased', num(t.preleased), 70) + inp(i, 'commenceLag', num(t.commenceLag), 60) + inp(i, 'freeMonths', num(t.freeMonths), 60) + '<td><button type="button" class="bk-btn" onclick="bkDevUnitRemove(' + i + ')">Remove</button></td></tr>'; }).join('');
  var gpr = (d.types || []).reduce(function(a, t){ return a + num(t.units) * num(t.rent) * 12; }, 0);
  var mix = '<div class="tbl-wrap" style="margin-top:12px"><table class="fin bk-m-scroll" style="table-layout:auto !important;width:max-content !important;min-width:1000px !important;max-width:none !important"><caption>Unit mix and lease-up schedule</caption><thead>' + hdr + '</thead><tbody>' + rows
    + '<tr class="grandtotal"><td class="rowlabel">TOTAL / AVERAGE</td><td>' + Math.round(sc.units).toLocaleString('en-US') + ' units</td><td>' + money(sc.units > 0 ? gpr / 12 / sc.units : 0) + '</td><td colspan="8">Units and average rent are taken from this mix. Annual potential rent ' + money(gpr) + '.</td></tr></tbody></table></div>'
    + '<div style="margin:8px 0"><button type="button" class="bk-btn" onclick="bkDevUnitAdd()">+ Add unit type</button></div>';
  var last = sc.months[sc.months.length - 1], settings = '<div class="tbl-wrap" style="margin-top:12px"><table class="fin"><caption>Lease-up settings and result</caption><thead><tr><th class="rowlabel-h">Setting</th><th>Value</th><th style="text-align:left">What it does</th></tr></thead><tbody>'
    + '<tr class="input"><td class="rowlabel">Operating costs during lease-up</td><td class="v"><select onchange="bkDevUnitOpex(this.value)"><option value="full"' + (d.opexBasis === 'delivered' ? '' : ' selected') + '>Full from completion</option><option value="delivered"' + (d.opexBasis === 'delivered' ? ' selected' : '') + '>Follow units delivered</option></select></td><td data-bk-align="text">Whether fixed costs run in full from the certificate of occupancy (the simple ramp does), or grow with the share of units delivered. The management fee always follows income.</td></tr>'
    + '<tr class="input"><td class="rowlabel">Stabilised when occupied reaches</td><td class="v"><input type="number" step="any" value="' + ((sc.stabTarget * 100).toFixed(2)) + '" onchange="bkDevUnitStab(this.value)"></td><td data-bk-align="text">% of all units. Stabilised income starts that month. 100% means every unit is leased and moved in.</td></tr>'
    + '<tr><td class="rowlabel">Lease-up period</td><td class="v">' + sc.luMo + ' months' + (sc.lambda !== 1 ? ' (' + sc.baseLuMo + ' as entered)' : '') + '</td><td data-bk-align="text">From the certificate of occupancy (month ' + x.co + ') to stabilisation (month ' + x.stab + '). It replaces the lease-up months input.</td></tr>'
    + '<tr><td class="rowlabel">Lease-up operating shortfall</td><td class="v">' + money(x.leaseDef) + '</td><td data-bk-align="text">The cumulative negative NOI during lease-up, added to the project cost and funded with it.</td></tr>'
    + '<tr><td class="rowlabel">Occupied at stabilisation</td><td class="v">' + pct(last.occ, 1) + '</td><td data-bk-align="text">Units moved in, over all units. Free-rent units count as occupied but pay no rent yet.</td></tr></tbody></table></div>';
  var warn = sc.warnings.length ? '<div class="note-flag"><span>&#9888;</span><div>' + sc.warnings.map(esc).join('<br>') + '</div></div>' : '';
  var ramp = x.leaseupRamp || [], rampBy = {}; ramp.forEach(function(r){ rampBy[r.mo] = r; });
  var tb = '<div class="tbl-wrap" style="margin-top:12px"><div style="overflow-x:auto"><table class="fin bk-m-scroll"><caption>Month by month</caption><thead><tr><th class="rowlabel-h">Month</th><th>Delivered</th><th>Leases signed</th><th>Moved in</th><th>Paying rent</th><th>Occupied</th><th>Income share</th><th>EGI</th><th>NOI after reserves</th></tr></thead><tbody>'
    + sc.months.slice(0, Math.min(sc.months.length, 60)).map(function(r, j){ var rr = rampBy[x.co + j]; return '<tr><td class="rowlabel" style="white-space:nowrap">' + (j === 0 ? 'CO (month ' + x.co + ')' : 'Month ' + (x.co + j) + ' (+' + j + ')') + (j === sc.luMo ? ' &middot; stabilised' : '') + '</td><td>' + r.delivered.toFixed(1) + '</td><td>' + r.signed.toFixed(1) + '</td><td>' + r.commenced.toFixed(1) + '</td><td>' + r.paying.toFixed(1) + '</td><td>' + pct(r.occ, 1) + '</td><td>' + pct(Math.min(1, r.payOcc / sc.stabTarget), 1) + '</td><td>' + (rr ? money(rr.egi) : '-') + '</td><td>' + (rr ? money(rr.after) : '-') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
  var ch = '<div class="tbl-wrap" style="margin-top:12px"><div style="padding:10px 12px"><b>Occupancy by unit type</b><div style="font-size:12px;opacity:.8;margin:2px 0 6px">Share of each type\'s units moved in, the project total, and the share of units delivered.</div><div class="bk-sx-svgwrap">' + chart(sc) + '</div></div></div>';
  var side = typeof sidebarShell === 'function' ? sidebarShell('<div class="card"><div class="card-head">Lease-Up</div><div class="metric-list"><div class="metric-row"><span class="k">Method</span><span class="v">By unit type</span></div><div class="metric-row"><span class="k">Unit types</span><span class="v">' + sc.types.length + '</span></div><div class="metric-row"><span class="k">Units</span><span class="v">' + Math.round(sc.units) + '</span></div><div class="metric-row"><span class="k">Lease-up</span><span class="v">' + sc.luMo + ' mo</span></div><div class="metric-row"><span class="k">Shortfall</span><span class="v">' + money(x.leaseDef) + '</span></div></div></div>') : '';
  return { title:title, crumbs:crumbs, desc:desc, meta:{ Property:s.name, Method:'By unit type', 'Unit types':sc.types.length, Units:Math.round(sc.units), 'Lease-Up':sc.luMo + ' mo' }, main:main + mix + settings + warn + ch + tb, sidebar:side };
}
RENDERERS['Dev Lease-Up'] = render;
})();
