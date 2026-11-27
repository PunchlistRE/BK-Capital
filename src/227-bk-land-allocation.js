/* LAND ALLOCATION REVIEW. Land is generally not depreciable. When the allocation in effect is 0% of the purchase price, the whole price is depreciated, which can overstate depreciation, taxable-income relief, recapture
   basis, after-tax cash flow, after-tax proceeds and the after-tax IRR. The Model Check dep.land-zero (src/129) asks for the allocation to be reviewed, using what this part reads.

   This part changes no calculation, sets no minimum percentage (the right allocation comes from a defensible valuation and the applicable tax treatment, not from the model) and does not overwrite an allocation.
     bkLandAllocation(s)   the allocation IN EFFECT: the land value and total basis the active depreciation path used (the engine's own landValue / totalBasis), and which path that was. Read on a copy of the deal.
     the review            a treatment the user selects and explains on the Depreciation page. A 0% land allocation is a legitimate treatment in some structures (a leasehold or ground lease, land owned or leased separately,
                           another documented treatment); those are documented here instead of being forced to a percentage. The check stays quiet once a treatment is selected AND explained. */
(function(){
'use strict';
if(typeof bkLoad !== 'function') return;
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
var TREAT = ['Reviewed: 0% land is correct for this deal', 'Leasehold or ground lease', 'Land owned or leased separately', 'Other treatment'];
window.BK_LAND_TREATMENTS = TREAT;

/* the allocation the depreciation actually used (read inside bkRunWith: the after-tax engine saves defaults into a deal the first time it runs, and a check must never change the deal) */
window.bkLandAllocation = function(s){ s = s || bkLoad(); var r = safe(function(){ return window.bkRunWith({}, function(){ var a = window.bkAfterTaxV18(); return { land:num(a.landValue), basis:num(a.totalBasis), dep:num(a.deprBasis), src:String(a.deprSource || ''), at:a.atIRR }; }); }, null);
  if(!r) return null; var canon = /canonical|macrs-tax-grade/.test(r.src);
  return { land:r.land, basis:r.basis, depreciable:r.dep, pct:r.basis > 0 ? r.land / r.basis : 0, path:canon ? 'the Depreciation page' : 'the after-tax default schedule', source:r.src, at:r.at, isDefault:!canon && (s.landValuePct === undefined || s.landValuePct === null || s.landValuePct === '') }; };
/* has the user selected a treatment and explained it */
window.bkLandReview = function(s){ s = s || bkLoad(); var t = String(s.landReviewTreatment || ''), n = String(s.landReviewNote || '').trim(); return { treatment:t, note:n, selected:TREAT.indexOf(t) > -1, documented:TREAT.indexOf(t) > -1 && n.length > 0 }; };
/* what the allocation is worth, shown as an illustration only: the after-tax IRR if 10% of the price were land, against the current one. 10% is a step for illustration, never a recommendation. */
window.bkLandIllustration = function(s){ s = s || bkLoad(); var cur = window.bkLandAllocation(s); if(!cur) return null;
  /* like for like: change only the path that produced the allocation in effect (the default schedule's land share, or the Depreciation page's land setting), so no other depreciation setting switches */
  var alt = safe(function(){ var over = { landValuePct:0.1 }; if(/Depreciation page/.test(cur.path)){ var d = Object.assign({}, s._depr || {}); d.settings = Object.assign({}, d.settings || {}, { landMethod:'percent', landPct:0.1 }); over = { _depr:d }; }
    return window.bkRunWith(over, function(){ return window.bkAfterTaxV18().atIRR; }); }, null);
  return { current:cur.at, withTen:alt }; };

/* the review on the Depreciation page */
function panel(s){ var a = window.bkLandAllocation(s), r = window.bkLandReview(s); if(!a) return '';
  var opts = TREAT.map(function(t){ return '<option value="' + esc(t) + '"' + (t === r.treatment ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('');
  return '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Land allocation: review</caption><tbody>'
    + '<tr><td class="rowlabel" data-bk-align="text">Allocation in effect<span class="bk-sub">What the after-tax figures use now, from ' + esc(a.path) + (a.isDefault ? ' (the model\'s default, not an allocation you entered)' : '') + '.</span></td><td class="v" data-bk-align="text">$' + Math.round(a.land).toLocaleString('en-US') + ' of $' + Math.round(a.basis).toLocaleString('en-US') + ' (' + (a.pct * 100).toFixed(1) + '%)</td></tr>'
    + '<tr><td class="rowlabel" data-bk-align="text">Treatment<span class="bk-sub">Only needed when the allocation is 0%. A leasehold or ground lease, land owned or leased separately, or another structure can be a legitimate reason; say which.</span></td><td class="v"><select onchange="bkSetField(\'landReviewTreatment\',this.value)"><option value="">Select…</option>' + opts + '</select></td></tr>'
    + '<tr><td class="rowlabel" data-bk-align="text">Explanation<span class="bk-sub">What supports this treatment (the lease, the appraisal or assessor split, the structure). It is kept with the deal.</span></td><td class="v"><input type="text" value="' + esc(r.note) + '" placeholder="e.g. 99-year ground lease; land is leased" onchange="bkSetField(\'landReviewNote\',this.value)" style="width:100%"></td></tr>'
    + '</tbody></table></div><div class="note-flag"><span>&#9432;</span><div>Land is generally not depreciable. The model does not set a land percentage: it comes from a defensible valuation (an appraisal, the assessor\'s land-to-total ratio or a cost study) and the tax treatment that applies to this property and investor. Enter the allocation above, or document why none applies.</div></div>'; }
var orig = typeof RENDERERS !== 'undefined' ? RENDERERS['Depreciation'] : null;
if(typeof orig === 'function' && !orig.__bkLandReview){ var w = function(){ var o = orig.apply(this, arguments); try { if(o && typeof o.main === 'string' && !/develop/i.test(String(bkLoad().dealType || ''))) o.main = panel(bkLoad()) + o.main; } catch(e){} return o; };
  w.__bkLandReview = true; w.__bkOriginal = orig.__bkOriginal || orig; if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Depreciation', w); else RENDERERS['Depreciation'] = w; }
})();
