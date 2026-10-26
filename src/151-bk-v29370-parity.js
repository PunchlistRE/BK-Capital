
/* Model parity options. Three optional settings that let this engine reproduce another model's conventions exactly, e.g. the owner's master workbook:
   year-1 rent growth (a different rate for the first twelve months), the NOI the sale price is based on (forward NOI before or after replacement reserves),
   and, on the Debt sheet, whether lender tests use NOI before or after reserves. All are off by default, so no existing deal changes. */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined') return;
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function set(k, v){ var s = bkLoad(); s[k] = v; bkSave(s); if(typeof showSheet === 'function') showSheet(typeof currentSheet !== 'undefined' ? currentSheet : 'Operating Underwrite'); }
window.bkSetRentGrowthY1 = function(t){ var n = Number(t); set('rentGrowthY1', isFinite(n) && n > 0 ? n / 100 : 0); };
window.bkSetExitNoiBasis = function(v){ set('exitNoiBasis', v === 'before' ? 'before' : ''); };
function card(){ var s = bkLoad(), cont = typeof bkConventions === 'function' ? bkConventions(s).cvRentGrowthStart === 'month1' : true, y1 = Number(s.rentGrowthY1) > 0, before = s.exitNoiBasis === 'before';
  var chip = function(t){ return '<span class="status-chip">' + t + '</span>'; };
  return '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Model Parity Options</caption><thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Basis</th><th>Status</th></tr></thead><tbody>'
    + '<tr><td class="rowlabel" data-bk-align="text">Year-1 Rent Growth<span class="bk-sub">Blank = the rent growth rate throughout</span></td><td class="v"><input type="number" step="0.01" style="width:110px" value="' + (y1 ? (Number(s.rentGrowthY1) * 100).toFixed(2) : '') + '" placeholder="same" onchange="bkSetRentGrowthY1(this.value)"></td><td data-bk-align="text">% a year, first 12 months' + (cont ? '' : '; applies only with continuous (legacy) growth') + '</td><td>' + (y1 && cont ? chip('INPUT') : chip('NOT APPLIED')) + '</td></tr>'
    + '<tr><td class="rowlabel" data-bk-align="text">Exit Price Based On<span class="bk-sub">Forward 12 months of NOI at sale</span></td><td class="v"><select onchange="bkSetExitNoiBasis(this.value)"><option value=""' + (before ? '' : ' selected') + '>NOI after reserves</option><option value="before"' + (before ? ' selected' : '') + '>NOI before reserves</option></select></td><td data-bk-align="text">sale price = forward NOI &divide; exit cap</td><td>' + (before ? chip('INPUT') : chip('DEFAULT')) + '</td></tr>'
    + '</tbody></table></div><div class="note-flag" style="margin-top:10px"><span>&#9432;</span><div>These settings exist so this model can reproduce another model\'s numbers. They are off by default and change nothing until you set them.</div></div>'; }
['Operating Underwrite'].forEach(function(name){ var prev = RENDERERS[name]; if(typeof prev !== 'function') return;
  var wrapped = function(){ var o = prev.apply(this, arguments);
    try { if(typeof window.bkProductionCounts === 'function' && !window.bkProductionCounts().activeDeal) return o; } catch(e){}
    if(/no deal loaded|there is no active deal|withheld|calculation blocked/i.test(String(o && o.main || ''))) return o;
    try { o.main = (o.main || '') + card(); } catch(e){} return o; };
  wrapped.__bkOriginal = prev.__bkOriginal || prev;
  if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer(name, wrapped); else RENDERERS[name] = wrapped; });
})();
