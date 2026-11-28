/* LEASE ROLLOVER ASSUMPTIONS (owner-approved, November 2026), treated like the tax-rate and land defaults. When a deal has no rollover assumptions the lease engine (src/025) uses its own: 65% renewal probability,
   6 months of downtime, TI of $20 / $5 per SF (new / renewal) and leasing commissions of 6% / 3% (new / renewal). Opening the Tenants page (bkEnsureV16, src/024) saves those same values into the deal, after which
   they look as if the user had entered them.
   This part labels them: each is the MODEL'S DEFAULT and unconfirmed until the user confirms it or enters their own; the commercial lease cash flows that roll over are PROVISIONAL meanwhile. It applies only when
   the deal has commercial tenant leases (the only leases these assumptions touch).
   It does not change a calculation (the engine already used these values whether or not they were saved), overwrite an entered value, or stop the engine running. */
(function(){
'use strict';
if(typeof bkLoad !== 'function') return;
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
var RA = {
  renewalProbability:{ short:'renewal probability', label:'Renewal probability', def:0.65, fmt:'pct', affects:'The share of expiring leases expected to renew. The rest are re-let after downtime, at new-lease TI and commission cost.' },
  downtimeMonths:{ short:'downtime', label:'Downtime on non-renewal, months', def:6, fmt:'mo', affects:'Months a suite earns nothing between a tenant leaving and a new one paying.' },
  tiNewPerSF:{ short:'new-lease TI', label:'Tenant improvements, new lease ($/SF)', def:20, fmt:'usd', affects:'Capital spent to re-let a suite to a new tenant.' },
  tiRenewalPerSF:{ short:'renewal TI', label:'Tenant improvements, renewal ($/SF)', def:5, fmt:'usd', affects:'Capital spent when a tenant renews.' },
  lcNewPct:{ short:'new-lease commission', label:'Leasing commission, new lease', def:0.06, fmt:'pct', affects:'Broker commission on a new lease, as a share of the lease\'s rent.' },
  lcRenewalPct:{ short:'renewal commission', label:'Leasing commission, renewal', def:0.03, fmt:'pct', affects:'Broker commission on a renewal, as a share of the lease\'s rent.' }
};
var KEYS = Object.keys(RA);
var CAUTION = 'Rollover assumptions depend on the market, the property, the suite and the tenant. The model\'s defaults are a starting point, not a market study; confirm them against leasing comparables, broker opinions or the business plan.';
window.BK_ROLLOVER_DEFAULTS = RA;
function fmt(k, v){ var f = RA[k].fmt; return f === 'pct' ? (v * 100).toFixed(2) + '%' : f === 'mo' ? String(v) + ' months' : '$' + Number(v).toFixed(2) + ' / SF'; }
function brief(k, v){ var f = RA[k].fmt; return f === 'pct' ? Math.round(v * 1000) / 10 + '%' : f === 'mo' ? String(v) + ' months' : '$' + Number(v) + '/SF'; }

/* does this deal have leases the rollover assumptions touch: the commercial lease model with leases, or commercial rows on the rent roll */
window.bkRolloverApplies = function(s){ s = s || bkLoad(); return safe(function(){ return window.bkLeaseOn(s); }, false) || (Array.isArray(s.rentRoll) && s.rentRoll.some(function(u){ return u && u.tenantType === 'Commercial'; })); };
/* where an assumption stands: { state:'confirmed'|'provisional', value, source } */
window.bkRolloverStatus = function(k, s){ s = s || bkLoad(); var R = RA[k]; if(!R) return null; var o = s.rolloverAssumptions && typeof s.rolloverAssumptions === 'object' ? s.rolloverAssumptions : null, conf = !!(s._rolloverConfirmed && s._rolloverConfirmed[k]);
  var has = !!o && o[k] !== undefined && o[k] !== null && o[k] !== '' && isFinite(Number(o[k]));
  if(o && !has) return { key:k, label:R.label, state:'confirmed', value:0, def:R.def, affects:R.affects, source:'Left blank by you: none assumed' };   /* a blank the user left (or a deal started blank): the engine assumes nothing, and says so */
  var state = conf ? 'confirmed' : has && Math.abs(Number(o[k]) - R.def) > 1e-12 ? 'confirmed' : 'provisional';
  return { key:k, label:R.label, state:state, value:has ? Number(o[k]) : R.def, def:R.def, affects:R.affects,
    source:conf ? 'Confirmed by you' : state === 'confirmed' ? 'Entered by you' : has ? 'Model default (saved earlier), not yet confirmed by you' : 'Model default, not entered' }; };
window.bkRolloverProvisional = function(s){ s = s || bkLoad(); if(!window.bkRolloverApplies(s)) return []; return KEYS.filter(function(k){ return window.bkRolloverStatus(k, s).state === 'provisional'; }); };
/* the user adopts the model's value as their own: the same value is saved (no calculation changes) and marked confirmed */
window.bkRolloverConfirm = function(k){ var s = bkLoad(), todo = (k ? [k] : KEYS).filter(function(x){ return RA[x] && window.bkRolloverStatus(x, s).state === 'provisional'; });   /* only what is provisional now, judged before anything is saved */
  if(!todo.length) return; var had = s.rolloverAssumptions && typeof s.rolloverAssumptions === 'object';
  /* with none saved the engine was using all six defaults; saving only one would turn the other five into blanks (none assumed) and change the cash flow, so all six are saved as they were used and only the chosen ones are marked confirmed */
  s.rolloverAssumptions = had ? Object.assign({}, s.rolloverAssumptions) : KEYS.reduce(function(o, x){ o[x] = RA[x].def; return o; }, {}); s._rolloverConfirmed = Object.assign({}, s._rolloverConfirmed || {});
  todo.forEach(function(x){ var v = s.rolloverAssumptions[x]; if(v === undefined || v === null || v === '') s.rolloverAssumptions[x] = RA[x].def; s._rolloverConfirmed[x] = true; });
  bkSave(s); if(typeof showSheet === 'function' && typeof currentSheet !== 'undefined') showSheet(currentSheet); };

/* the Model Check: flagged, never blocking */
if(typeof window.bkAddConflictRule === 'function') window.bkAddConflictRule('lease.rollover-provisional', 'WARN', 'Leasing', 'Tenants', function(s){ var p = window.bkRolloverProvisional(s); if(!p.length) return null;
  return { msg:'Lease rollover assumptions are the model\'s defaults, not confirmed: ' + p.map(function(k){ return RA[k].short + ' ' + brief(k, RA[k].def); }).join(', ') + '.',
    why:'They set what happens when a commercial lease expires: whether it renews, how long the suite sits empty, and the tenant improvements and commissions paid to re-let it. The commercial cash flow, NOI, capital costs and returns after the first expiry are provisional until they are confirmed or replaced. ' + CAUTION + ' Confirm or change them on Property > Tenants.' }; });

/* the panel on the Tenants page */
function panel(s){ if(!window.bkRolloverApplies(s)) return ''; var rows = KEYS.map(function(k){ return window.bkRolloverStatus(k, s); }), prov = rows.filter(function(r){ return r.state === 'provisional'; });
  return '<div class="tbl-wrap bk-ro-panel" style="margin:0 0 16px"><table class="fin"><caption>Lease rollover assumptions: where each comes from</caption><thead><tr><th class="rowlabel-h">Assumption</th><th>Value</th><th>Status</th><th></th></tr></thead><tbody>'
    + rows.map(function(r){ return '<tr data-bk-ro="' + r.key + '"><td class="rowlabel" data-bk-align="text">' + esc(r.label) + '<span class="bk-sub">' + esc(r.affects) + '</span></td><td class="v">' + esc(fmt(r.key, r.value)) + '</td><td data-bk-align="text"><span class="status-chip ' + (r.state === 'provisional' ? 'warn' : 'ok') + '">' + (r.state === 'provisional' ? 'Provisional' : 'Confirmed') + '</span><span class="bk-sub">' + esc(r.source) + '</span></td><td data-bk-align="text">' + (r.state === 'provisional' ? '<button type="button" class="bk-btn" onclick="bkRolloverConfirm(\'' + r.key + '\')">Confirm</button>' : '') + '</td></tr>'; }).join('')
    + '</tbody></table></div><div class="note-flag"><span>&#9432;</span><div>' + esc(CAUTION) + (prov.length ? ' Until they are confirmed, the commercial cash flow after the first lease expiry is provisional. <button type="button" class="bk-btn" onclick="bkRolloverConfirm()">Confirm all ' + prov.length + '</button>' : '') + '</div></div>'; }
var orig = typeof RENDERERS !== 'undefined' ? RENDERERS['Tenants'] : null;
if(typeof orig === 'function' && !orig.__bkRollover){ var w = function(){ var o = orig.apply(this, arguments); try { var s = bkLoad(), h = panel(s); if(h){ if(o && typeof o.main === 'string') o.main = h + o.main; else if(typeof o === 'string') o = h + o; } } catch(e){} return o; };
  w.__bkRollover = true; w.__bkOriginal = orig.__bkOriginal || orig; if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Tenants', w); else RENDERERS['Tenants'] = w; }
})();
