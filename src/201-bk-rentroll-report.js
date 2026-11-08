/* RENT ROLL REPORT (Reports). The tenant rent roll as a report: a summary (units, occupancy, in-place and market rent, by tenant type) and the roll unit by unit with lease dates. Read from the deal's rent roll (s.rentRoll); nothing is recalculated beyond sums and ratios.
   It is a view of the Tenant Report, so it has its own PDF summary and is part of the full property report. */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof bkLoad !== 'function') return;
function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function M(v){ v = Math.round(Number(v) || 0); return v < 0 ? '($' + Math.abs(v).toLocaleString('en-US') + ')' : '$' + v.toLocaleString('en-US'); }
function N(v){ v = Number(v); return isFinite(v) && v ? Math.round(v).toLocaleString('en-US') : '—'; }
RENDERERS['Rent Roll Report'] = function(){
  var s = bkLoad() || {}, rr = Array.isArray(s.rentRoll) ? s.rentRoll : [], o = { title:'Rent Roll Report', crumbs:'Reports', desc:'The tenant rent roll: occupancy, rent in place against market, and every unit with its lease dates.', meta:{ Property:s.name || '' }, sidebar:'' };
  if(!rr.length){ o.main = '<div class="note-flag"><span>&#9432;</span><div>No rent roll is loaded. Import one on the Rent Roll page (or enter units there) and this report fills in.</div></div>'; return o; }
  var rent = function(u){ return Number(u.status === 'Occupied' ? u.inPlaceRent : 0) || 0; }, mk = function(u){ return Number(u.marketRent) || 0; };
  var types = {}; rr.forEach(function(u){ var k = u.tenantType || 'Residential'; (types[k] = types[k] || []).push(u); });
  var tot = { n:rr.length, occ:rr.filter(function(u){ return u.status === 'Occupied'; }).length, sf:rr.reduce(function(a, u){ return a + (Number(u.sf) || 0); }, 0), inp:rr.reduce(function(a, u){ return a + rent(u); }, 0), mkt:rr.reduce(function(a, u){ return a + mk(u); }, 0) };
  var sumRows = Object.keys(types).sort().map(function(k){ var a = types[k], oc = a.filter(function(u){ return u.status === 'Occupied'; }).length; return '<tr><td class="rowlabel">' + esc(k) + '</td><td>' + a.length + '</td><td>' + oc + '</td><td>' + (a.length ? (oc / a.length * 100).toFixed(1) + '%' : '—') + '</td><td>' + N(a.reduce(function(t, u){ return t + (Number(u.sf) || 0); }, 0)) + '</td><td>' + M(a.reduce(function(t, u){ return t + rent(u); }, 0)) + '</td><td>' + M(a.reduce(function(t, u){ return t + mk(u); }, 0)) + '</td><td>' + M(a.reduce(function(t, u){ return t + rent(u); }, 0) * 12) + '</td></tr>'; }).join('');
  var main = '<div class="tbl-wrap"><table class="fin"><caption>Rent Roll Summary</caption><thead><tr><th class="rowlabel-h">Tenant type</th><th>Units</th><th>Occupied</th><th>Occupancy</th><th>SF</th><th>In-place rent / mo</th><th>Market rent / mo</th><th>In-place rent / yr</th></tr></thead><tbody>' + sumRows
    + '<tr class="grandtotal"><td class="rowlabel">Total</td><td>' + tot.n + '</td><td>' + tot.occ + '</td><td>' + (tot.n ? (tot.occ / tot.n * 100).toFixed(1) + '%' : '—') + '</td><td>' + N(tot.sf) + '</td><td>' + M(tot.inp) + '</td><td>' + M(tot.mkt) + '</td><td>' + M(tot.inp * 12) + '</td></tr></tbody></table></div>';
  main += '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Rent Roll, Unit by Unit</caption><thead><tr><th class="rowlabel-h">Unit / tenant</th><th>Type</th><th>Status</th><th>SF</th><th>In-place / mo</th><th>Market / mo</th><th>Lease start</th><th>Lease end</th></tr></thead><tbody>'
    + rr.map(function(u){ return '<tr><td class="rowlabel">' + esc(u.unitId || u.unit || u.tenant || '') + '</td><td data-bk-align="text">' + esc(u.tenantType || 'Residential') + '</td><td data-bk-align="text">' + esc(u.status || '') + '</td><td>' + N(u.sf) + '</td><td>' + (u.status === 'Occupied' ? M(u.inPlaceRent) : '—') + '</td><td>' + M(u.marketRent) + '</td><td data-bk-align="text">' + esc(u.leaseStart || '') + '</td><td data-bk-align="text">' + esc(u.leaseEnd || '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
  o.main = main; o.meta.Units = String(tot.n); o.meta.Occupancy = tot.n ? (tot.occ / tot.n * 100).toFixed(1) + '%' : '—'; o.meta['In-place rent / yr'] = M(tot.inp * 12); return o;
};
})();
