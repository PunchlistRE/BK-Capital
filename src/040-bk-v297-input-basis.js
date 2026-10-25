
/* ===========================================================================
   V29.7 INPUT BASIS SYSTEM
   ===========================================================================
   ONE economic assumption -> ONE canonical stored value -> several selectable
   representations. Switching the representation is a DISPLAY conversion and
   changes nothing the engine reads.

   HOW ZERO ECONOMIC CHANGE IS GUARANTEED (this is the whole design):
   the canonical value stays in its EXISTING state field, byte-for-byte, exactly
   where the engine already reads it (s.mgmtPct, s.insurance, ...). A basis
   switch writes only to state._basis, which no engine function reads. There is
   therefore no conversion path by which switching a basis can move NOI - not
   because the arithmetic round-trips cleanly, but because the number the engine
   uses is never rewritten at all.

   NON-CIRCULARITY (proven from bkCalc, not assumed):
       egi   = netRes + netComm + other
       mgmt  = egi * mgmtPct
       total = taxes + insurance + ... + mgmt + misc
       noi   = egi - total
   egi is fully determined before any expense is computed, so expressing an
   expense as a percentage of EGI introduces no circular dependency. Every
   percentage basis below uses egi and nothing else.

   DENOMINATORS ARE PROVEN, NEVER INFERRED. Only these are used:
       GSF    s.gsf    - the engine's own per-SF expense driver
                        (bkCalc: misc = BK_BASE.misc * (gsf / BK_BASE.gsf))
       UNITS  s.units  - the engine's own per-unit driver
                        (bkCalc: other = otherIncomePerUnit * units)
       EGI             - computed above, independent of every expense
   A basis whose denominator is zero or unavailable for the active deal is not
   offered at all, rather than divided by.
   =========================================================================== */
(function(){
'use strict';

/* --- basis definitions ------------------------------------------------- */
var BASES = {
  DOLLARS_YR:      { id:'DOLLARS_YR',      label:'$/yr',      short:'/yr',   kind:'money' },
  DOLLARS_GSF_YR:  { id:'DOLLARS_GSF_YR',  label:'$/GSF/yr',  short:'/GSF',  kind:'rate'  },
  DOLLARS_UNIT_YR: { id:'DOLLARS_UNIT_YR', label:'$/unit/yr', short:'/unit', kind:'rate'  },
  PCT_EGI:         { id:'PCT_EGI',         label:'% of EGI',  short:' EGI',  kind:'pct'   }
};

/* --- field registry ----------------------------------------------------
   Field-specific by design. There is NO global basis list: each field names the
   bases its own economics support, and nothing else.

   'canonical' is the basis the STORED value is already expressed in - it is the
   existing engine field and is never re-encoded.
   'equivalents' are read-only calculated displays, NOT selectable input bases.

   % of EGI is a selectable INPUT basis only for mgmtPct, because that is how the
   engine and the workbook actually define it (Deal Underwrite!D44 "% of EGI";
   bkCalc: mgmt = egi * mgmtPct). For the flat costs it is offered only as a
   read-only equivalent: those are fixed obligations, and letting a revenue swing
   silently move an insurance premium would be a change in economics, not a
   change in presentation.                                                    */
var FIELDS = {
  mgmtPct: { label:'Management Fees', canonical:'PCT_EGI',
             bases:['PCT_EGI','DOLLARS_YR','DOLLARS_GSF_YR','DOLLARS_UNIT_YR'], equivalents:[] },

  taxes:     { label:'Real Estate Taxes - Actual', canonical:'DOLLARS_YR',
               bases:['DOLLARS_YR','DOLLARS_GSF_YR','DOLLARS_UNIT_YR'], equivalents:['PCT_EGI'] },
  insurance: { label:'Insurance',                  canonical:'DOLLARS_YR',
               bases:['DOLLARS_YR','DOLLARS_GSF_YR','DOLLARS_UNIT_YR'], equivalents:['PCT_EGI'] },
  payroll:   { label:'Payroll & Benefits',         canonical:'DOLLARS_YR',
               bases:['DOLLARS_YR','DOLLARS_GSF_YR','DOLLARS_UNIT_YR'], equivalents:['PCT_EGI'] },
  rm:        { label:'Repairs & Maintenance',      canonical:'DOLLARS_YR',
               bases:['DOLLARS_YR','DOLLARS_GSF_YR','DOLLARS_UNIT_YR'], equivalents:['PCT_EGI'] },
  turnover:  { label:'Turnover / Make-Ready',      canonical:'DOLLARS_YR',
               bases:['DOLLARS_YR','DOLLARS_GSF_YR','DOLLARS_UNIT_YR'], equivalents:['PCT_EGI'] },
  utilities: { label:'Utilities (net of RUBS)',    canonical:'DOLLARS_YR',
               bases:['DOLLARS_YR','DOLLARS_GSF_YR','DOLLARS_UNIT_YR'], equivalents:['PCT_EGI'] },
  contract:  { label:'Contract Services',          canonical:'DOLLARS_YR',
               bases:['DOLLARS_YR','DOLLARS_GSF_YR','DOLLARS_UNIT_YR'], equivalents:['PCT_EGI'] },
  marketing: { label:'Marketing & Advertising',    canonical:'DOLLARS_YR',
               bases:['DOLLARS_YR','DOLLARS_GSF_YR','DOLLARS_UNIT_YR'], equivalents:['PCT_EGI'] },
  ga:        { label:'General & Administrative',   canonical:'DOLLARS_YR',
               bases:['DOLLARS_YR','DOLLARS_GSF_YR','DOLLARS_UNIT_YR'], equivalents:['PCT_EGI'] },
  reserves:  { label:'Replacement Reserves',       canonical:'DOLLARS_YR',
               bases:['DOLLARS_YR','DOLLARS_GSF_YR','DOLLARS_UNIT_YR'], equivalents:['PCT_EGI'] }
};
/* DELIBERATELY EXCLUDED - each for a stated reason, none by oversight:
     devFeePct .................. denominator not independently proven (REVIEW)
     avgRent, commercialRent,
     recovery, rent-roll fields .. Rent Roll is canonical where populated; a
                                   property-level basis control must not override
                                   lease-level economics
     purchasePrice, exitCap, LTV,
     LTC, DSCR, rates, amort,
     IO, hold, dates, growth % ... already have a single natural economic unit
     hc_* / sc_* dev cost lines .. single explicit proven basis each ($/GSF,
                                   $/Retail SF, $/Unit, % of hard cost); adding
                                   alternates is possible but was not required
                                   and is not done speculatively                */

/* --- conversion context (all denominators proven above) ----------------- */
function ctxOf(s){
  var egi = null;
  try { egi = bkCalc().egi; } catch(e) { egi = null; }
  return {
    gsf:   Number(s.gsf)   || 0,
    units: Number(s.units) || 0,
    egi:   (typeof egi === 'number' && isFinite(egi)) ? egi : 0
  };
}
function denomOf(basisId, ctx){
  if(basisId === 'DOLLARS_YR')      return 1;
  if(basisId === 'DOLLARS_GSF_YR')  return ctx.gsf;
  if(basisId === 'DOLLARS_UNIT_YR') return ctx.units;
  if(basisId === 'PCT_EGI')         return ctx.egi;
  return 0;
}
function basisAvailable(basisId, ctx){
  var d = denomOf(basisId, ctx);
  return isFinite(d) && d > 0;
}

/* stored canonical value -> annual dollars */
function annualOf(key, s, ctx){
  var def = FIELDS[key]; if(!def) return null;
  var v = Number(s[key]); if(!isFinite(v)) return null;
  return v * denomOf(def.canonical, ctx);
}
/* annual dollars -> stored canonical value */
function canonicalFromAnnual(key, annual, ctx){
  var def = FIELDS[key]; if(!def) return null;
  var d = denomOf(def.canonical, ctx);
  if(!isFinite(d) || d === 0) return null;
  return annual / d;
}
/* annual dollars -> the number shown under a given basis */
function shownIn(basisId, annual, ctx){
  var d = denomOf(basisId, ctx);
  if(!isFinite(d) || d === 0) return null;
  return annual / d;
}
/* a number typed under a given basis -> annual dollars */
function annualFromShown(basisId, shown, ctx){
  var d = denomOf(basisId, ctx);
  if(!isFinite(d) || d === 0) return null;
  return Number(shown) * d;
}

/* --- selected basis: display state only, per field, per deal ------------
   Lives on the deal state object, so it persists through bkSave/bkLoad and
   rides into Supabase inside input_data with no adapter change. Because it is
   part of the deal state, loading another deal replaces it atomically - basis
   selections cannot leak between deals.                                     */
function selectedBasis(key, s){
  var def = FIELDS[key]; if(!def) return null;
  var sel = (s && s._basis && s._basis[key]) || def.canonical;
  return def.bases.indexOf(sel) === -1 ? def.canonical : sel;
}
window.bkBasisGet = function(key){ return selectedBasis(key, bkLoad()); };

/* Switching basis writes ONLY _basis. The canonical value is not touched, so
   this cannot alter any engine input. */
window.bkBasisSet = function(key, basisId){
  var def = FIELDS[key]; if(!def) return;
  if(def.bases.indexOf(basisId) === -1) return;
  var s = bkLoad();
  s._basis = Object.assign({}, s._basis || {});
  if(basisId === def.canonical) delete s._basis[key]; else s._basis[key] = basisId;
  bkSave(s);
  if(typeof currentSheet !== 'undefined') showSheet(currentSheet);
};

/* Editing under the selected basis IS a legitimate economic change: the typed
   number is converted to annual dollars, then to the canonical stored value. */
window.bkBasisSetValue = function(key, raw){
  var def = FIELDS[key]; if(!def) return;
  var s = bkLoad(), ctx = ctxOf(s);
  var basis = selectedBasis(key, s);
  var num = Number(String(raw).replace(/[^0-9.\-]/g, ''));
  if(!isFinite(num)) return;
  if(BASES[basis].kind === 'pct') num = num / 100;      // typed as 2.76 -> 0.0276
  var annual = annualFromShown(basis, num, ctx);
  if(annual === null || !isFinite(annual)) return;      // unavailable denominator: refuse
  var canon = canonicalFromAnnual(key, annual, ctx);
  if(canon === null || !isFinite(canon)) return;
  s[key] = canon;
  bkSave(s);
  if(typeof currentSheet !== 'undefined') showSheet(currentSheet);
};

/* --- read model for the UI and the tests ------------------------------- */
window.bkBasisInfo = function(key, state){
  var def = FIELDS[key]; if(!def) return null;
  var s = state || bkLoad(), ctx = ctxOf(s);
  var basis  = selectedBasis(key, s);
  var annual = annualOf(key, s, ctx);
  var out = {
    key:key, label:def.label, canonicalBasis:def.canonical,
    canonicalValue:Number(s[key]), annual:annual, basis:basis, ctx:ctx,
    available:def.bases.filter(function(b){ return basisAvailable(b, ctx); }),
    shown: (annual === null) ? null : shownIn(basis, annual, ctx),
    equivalents: []
  };
  def.bases.concat(def.equivalents).forEach(function(b){
    if(b === basis) return;
    if(!basisAvailable(b, ctx)) return;
    var v = (annual === null) ? null : shownIn(b, annual, ctx);
    if(v === null || !isFinite(v)) return;
    out.equivalents.push({ basis:b, label:BASES[b].label, value:v,
                           editable: def.bases.indexOf(b) !== -1 });
  });
  return out;
};
window.bkBasisFields = function(){ return Object.keys(FIELDS); };
window.bkBasisDefs   = function(){ return { FIELDS:FIELDS, BASES:BASES }; };

/* --- rendering ---------------------------------------------------------- */
function fmtIn(basisId, v){
  if(v === null || !isFinite(v)) return '-';
  if(BASES[basisId].kind === 'pct')   return (v*100).toFixed(2) + '%';
  if(BASES[basisId].kind === 'money') return '$' + bkFmt(v);
  return '$' + (Math.round(v*100)/100).toFixed(2);
}
function rowHtml(key){
  var info = window.bkBasisInfo(key); if(!info) return '';
  var sel = '<select class="bk-basis-sel" onchange="bkBasisSet(' + JSON.stringify(key).replace(/"/g,'&quot;') + ',this.value)">'
    + info.available.map(function(b){
        return '<option value="'+b+'"'+(b===info.basis?' selected':'')+'>'+BASES[b].label+'</option>'; }).join('')
    + '</select>';
  // Cap at two equivalents so the column stays inside the existing table width and
  // row height - the same shape as "$0.40/SF | 2.76% EGI". Every remaining basis is
  // still reachable through the dropdown; nothing is hidden, only not duplicated.
  var eq = info.equivalents.slice(0,2).map(function(e){
    // "$0.82/GSF", "2.76% EGI" - the compact form, without repeating the $ twice.
    return '<span class="bk-basis-eq">'+fmtIn(e.basis,e.value)+BASES[e.basis].short+'</span>'; }).join('');
  return '<tr class="input bk-basis-row" data-bk-basis-key="'+key+'">'
    + '<td class="rowlabel">'+info.label+'</td>'
    + '<td class="v bk-a-num" contenteditable="true" spellcheck="false" '
    +   'onblur="bkBasisSetValue('+JSON.stringify(key).replace(/"/g,'&quot;')+',this.textContent)" '
    +   'onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}">'
    +   fmtIn(info.basis, info.shown) + '</td>'
    + '<td data-bk-align="text">'+sel+'</td>'
    + '<td data-bk-align="num"><span class="bk-basis-eqwrap">'+(eq||'<span class="bk-basis-eq">-</span>')+'</span></td>'
    + '</tr>';
}

/* Replace the plain bkInput row for each registered field, in place, keeping the
   existing 4-column layout and row height. Nothing else on the sheet changes. */
function upgrade(html){
  if(typeof html !== 'string') return html;
  Object.keys(FIELDS).forEach(function(key){
    var re = new RegExp('<tr class="input" data-bk-key="'+key+'"[^>]*>[\\s\\S]*?<\\/tr>');
    if(re.test(html)) html = html.replace(re, rowHtml(key));
  });
  return html;
}
var prevDeal = (typeof RENDERERS!=='undefined') ? RENDERERS['Deal Underwrite'] : null;
if(prevDeal && !prevDeal.__bkBasis){
  var wrapped = function(){
    var o = prevDeal();
    try { o.main = upgrade(o.main); } catch(e){}
    return o;
  };
  wrapped.__bkBasis = true;
  RENDERERS['Deal Underwrite'] = wrapped;
}
})();
