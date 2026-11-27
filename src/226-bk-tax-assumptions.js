/* TAX-RATE ASSUMPTIONS. The after-tax engine (src/027) supplies a rate when none is entered: 37% ordinary income, 25% depreciation recapture, 20% capital gains, and saves it into the deal. Left alone that reads
   as if the investor had chosen those rates. They are the model's suggested starting assumptions, and they depend on the investor's circumstances, jurisdiction, ownership structure and the transaction, so they
   are never presented as universally applicable tax treatment, and never as confirmed until the user confirms them.

   What this part does, and does not do:
     does     classify the three rates as EXPECTED inputs (the model can run on them, so nothing is blocked, but they are flagged while unconfirmed); say where each came from (model default or the user);
              explain what each one affects; label the after-tax figures PROVISIONAL while any of them is unconfirmed; let the user confirm them explicitly.
     does not change a tax calculation, overwrite a rate the user entered, stop the engine running on its defaults, or touch the depreciation methodology. The engine's numbers are exactly what they were.
   Status of a rate (bkTaxRateStatus): CONFIRMED when the user confirmed it, or when it is not the model's default value (a figure the model could not have supplied); PROVISIONAL when it is blank or equals the
   model's default and has not been confirmed (it may be the engine's own, saved earlier, and cannot be told apart from a typed one: so it asks for confirmation). */
(function(){
'use strict';
if(typeof bkLoad !== 'function' || !window.BKReg) return;
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
var RATES = {
  taxRate:{ label:'Ordinary income tax rate', def:0.37, affects:'Applied each year to taxable operating income (rent less operating costs, interest and depreciation), and to the ordinary-income part of the gain on sale. It moves the after-tax cash flow every year.' },
  depRecaptureRate:{ label:'Depreciation recapture rate', def:0.25, affects:'Applied at the sale to the gain that comes from depreciation already taken (unrecaptured Section 1250 gain), never above the ordinary rate. It moves the tax at the sale and the after-tax proceeds.' },
  capGainsRate:{ label:'Capital gains rate', def:0.20, affects:'Applied at the sale to the remaining long-term gain after recapture. It moves the tax at the sale and the after-tax IRR and multiple.' }
};
var KEYS = Object.keys(RATES);
var CAUTION = 'Tax rates depend on the investor\'s circumstances, the jurisdiction, the ownership structure and the transaction. The model\'s defaults are a starting point for a first look, not tax advice and not a rate that applies to every investor.';
window.BK_TAX_RATES = RATES; window.BK_TAX_RATES_CAUTION = CAUTION;

/* where a rate stands: { state:'confirmed'|'provisional', value, source, def } */
window.bkTaxRateStatus = function(k, s){ s = s || bkLoad(); var R = RATES[k]; if(!R) return null; var v = s[k], has = v !== undefined && v !== null && v !== '' && isFinite(Number(v)), conf = !!(s._taxConfirmed && s._taxConfirmed[k]);
  var state = conf ? 'confirmed' : (has && Math.abs(Number(v) - R.def) > 1e-12 ? 'confirmed' : 'provisional');
  return { key:k, label:R.label, state:state, value:has ? Number(v) : R.def, entered:has, def:R.def, affects:R.affects,
    source:conf ? 'Confirmed by you' : state === 'confirmed' ? 'Entered by you' : has ? 'Model default (saved earlier), not yet confirmed by you' : 'Model default, not entered' }; };
window.bkTaxRatesProvisional = function(s){ s = s || bkLoad(); return KEYS.filter(function(k){ return window.bkTaxRateStatus(k, s).state === 'provisional'; }); };
/* the user confirms the rates as their own (the model's default value is saved as theirs only when they say so) */
window.bkTaxRateConfirm = function(k){ var s = bkLoad(); s._taxConfirmed = Object.assign({}, s._taxConfirmed || {}); (k ? [k] : KEYS).forEach(function(x){ if(!RATES[x]) return; if(s[x] === undefined || s[x] === null || s[x] === '') s[x] = RATES[x].def; s._taxConfirmed[x] = true; }); bkSave(s);
  if(typeof showSheet === 'function' && typeof currentSheet !== 'undefined') showSheet(currentSheet); };

/* the registry: the rates are present only when confirmed, so they are Expected (flagged, never blocking) until then */
KEYS.forEach(function(k){ var f = window.BKReg.field(k); if(f) f.has = function(s){ return window.bkTaxRateStatus(k, s).state === 'confirmed'; }; });

/* the banner and the panel on the after-tax pages */
function banner(s){ var p = window.bkTaxRatesProvisional(s); if(!p.length) return '';
  return '<div class="note-flag bk-tx-prov"><span>&#9888;</span><div><b>After-tax figures are provisional.</b> They use the model\'s default for the ' + p.map(function(k){ return esc(RATES[k].label.toLowerCase()); }).join(', ')
    + ' (' + p.map(function(k){ return (RATES[k].def * 100).toFixed(0) + '%'; }).join(', ') + '). ' + esc(CAUTION) + ' <button type="button" class="bk-btn" onclick="bkTaxRateConfirm()">Confirm these rates as mine</button></div></div>'; }
window.bkTaxProvisionalBanner = banner;
function panel(s){ var rows = KEYS.map(function(k){ var t = window.bkTaxRateStatus(k, s); return '<tr><td class="rowlabel" data-bk-align="text">' + esc(t.label) + '<span class="bk-sub">' + esc(t.affects) + '</span></td><td data-bk-align="text">' + (t.value * 100).toFixed(2) + '%</td>'
    + '<td data-bk-align="text"><span class="status-chip ' + (t.state === 'confirmed' ? 'pass' : 'warn') + '">' + (t.state === 'confirmed' ? 'Confirmed' : 'Provisional') + '</span><span class="bk-sub">' + esc(t.source) + '</span></td>'
    + '<td data-bk-align="text">' + (t.state === 'provisional' ? '<button type="button" class="bk-btn" onclick="bkTaxRateConfirm(\'' + k + '\')">Confirm</button>' : '') + '</td></tr>'; }).join('');
  return '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Tax rates: where they come from</caption><thead><tr><th class="rowlabel-h">Rate</th><th>Used</th><th>Source</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    + '<div class="note-flag"><span>&#9432;</span><div>' + esc(CAUTION) + ' Change a rate in the After-Tax Assumptions below; a rate that is not the model\'s default is treated as yours.</div></div>'; }
['After-Tax', 'After-Tax Report'].forEach(function(name){ var orig = typeof RENDERERS !== 'undefined' ? RENDERERS[name] : null; if(typeof orig !== 'function' || orig.__bkTaxProv) return;
  var w = function(){ var o = orig.apply(this, arguments); try { if(o && typeof o.main === 'string'){ var s = bkLoad(); if(!(typeof window.bkDealReadiness === 'function' && window.bkDealReadiness().canCalculate === false)){ o.main = banner(s) + (name === 'After-Tax' ? panel(s) : '') + o.main; } } } catch(e){} return o; };
  w.__bkTaxProv = true; w.__bkOriginal = orig.__bkOriginal || orig; if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer(name, w); else RENDERERS[name] = w; });
})();
