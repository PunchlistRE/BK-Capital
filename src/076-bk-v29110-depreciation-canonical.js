
/* ===========================================================================
   V29.11.0 - CANONICAL DEPRECIATION ENGINE
   Supersedes and REPLACES: bk-harvard-depreciation, bk-depreciation-v2
   ===========================================================================
   WHAT WAS WRONG, MEASURED IN A BROWSER (not inferred):

   1. Two script blocks both registered RENDERERS['Depreciation'].
      bk-depreciation-v2 loaded later and won, so bk-harvard-depreciation was
      dead code that still shipped.

   2. The Property row was the string literal "180-200 Harvard Avenue /
      Stamford, CT" with status SOURCE. It rendered on a COMPLETELY BLANK
      browser with no deal, and on unrelated deals. This is the identical
      failure mode as the V29.10.4 static Home card.

   3. loadComponents() returned HARVARD_DEFAULTS whenever storage was empty,
      so every new deal silently inherited Harvard's cost-segregation study.

   4. pp() fell back to a hard-coded 10200000.

   5. Storage keys bkcapital.depreciation.{components,settings}.v02 were
      GLOBAL, not deal-scoped: Deal B showed Deal A's land value. They were
      also outside DEAL_KEYS, so they survived bkResetToFactoryState(), were
      never quarantined, and never migrated.

   6. saveSettings/saveComponents called localStorage.setItem directly,
      bypassing the V29.10.5 write-authority gate entirely.

   7. There was no engine. bonusPct and bonusYear were stored but nothing
      computed a bonus deduction, and there was no annual schedule at all.

   8. bkAfterTaxV18 carried its OWN straight-line depreciation off
      s.landValuePct / s.deprLife - a second depreciation engine.

   THE FIX

   Depreciation assumptions ARE deal assumptions, so they live in the deal
   state under s._depr. That single decision resolves 3, 5, 6, quarantine,
   factory reset, migration and persistence at once, because bkLoad/bkSave
   already govern all of it. No new storage keys, no new lifecycle
   registration, no new write path.

   Harvard becomes an EXPLICIT SEED ACTION, never a default.

   FINANCIAL LOGIC: this ADDS a depreciation engine and re-points After-Tax at
   it. bkCalc / bkAnnualCF / bkMonthlyReturns / bkDebt / bkRentRollStats /
   bkSponsorV08 and the recovery gate are NOT touched - parity with V29.10.5
   stays exact and is asserted by test_parity.js.
   =========================================================================== */
(function(){
'use strict';

/* ---------------------------------------------------------------- defaults */
/* Deliberately property-neutral. A new deal gets no land, no components and
   no cost-seg study - it gets a blank form. */
var DEF = {
  landMethod   : 'percent',
  landPct      : 0,
  landDollar   : 0,
  landSource   : 'Underwriting Assumption',
  costSeg      : false,
  detailMode   : 'detailed',
  bonusPct     : 0,
  bonusYear    : null,
  baseLife     : null,      /* null => derived from property type */
  closeDate    : '',
  firstRentDate: '',
  nnnLag       : 1,
  capex        : 0
};

/* The real Harvard cost-segregation study. Available only through an explicit
   user action (bkDeprSeedHarvard), never as a default. */
var HARVARD_STUDY = {
  settings: {
    landMethod:'dollar', landDollar:4780515.60, landSource:'Cost Seg Study',
    costSeg:true, detailMode:'detailed', bonusPct:1, bonusYear:2026, baseLife:39,
    closeDate:'2025-12-20', firstRentDate:'2026-01-05', nnnLag:1,
    studyDate:'', sourceDoc:'Harvard Cost Segregation Study'
  },
  components: [
    {component:'Site / Personal Property', description:'5-Year Cost Seg Assets',
     basis:601581.51,  recovery:5,  convention:'HY',  method:'200DB',
     bonus:true,  source:'Harvard Cost Seg Study', status:'SOURCE'},
    {component:'Land Improvements',        description:'15-Year Cost Seg Assets',
     basis:605477.38,  recovery:15, convention:'HY',  method:'150DB',
     bonus:true,  source:'Harvard Cost Seg Study', status:'SOURCE'},
    {component:'Building',                 description:'39-Year Commercial Building',
     basis:4212425.51, recovery:39, convention:'MM',  method:'SL',
     bonus:false, source:'Harvard Cost Seg Study', status:'SOURCE'}
  ]
};

/* ---------------------------------------------------------------- state */
function deal(){
  try { return (typeof bkActiveDeal==='function') ? bkActiveDeal() : null; } catch(e){ return null; }
}
function settings(){
  var s = deal();
  var raw = (s && s._depr && s._depr.settings) ? s._depr.settings : {};
  var out = Object.assign({}, DEF, raw);
  if(out.baseLife === null || out.baseLife === undefined){
    out.baseLife = /resident|multifamily|apartment/i.test(String(s && s.propertyType || '')) ? 27.5 : 39;
  }
  return out;
}
function components(){
  var s = deal();
  var a = (s && s._depr && Array.isArray(s._depr.components)) ? s._depr.components : [];
  return a.map(function(x){ return Object.assign({}, x); });
}

/* Every mutation goes through bkSave, so it inherits the write-authority gate,
   quarantine, factory reset and reload persistence automatically. */
function commit(mut){
  if(!deal()) return false;
  var s = bkLoad();
  s._depr = s._depr || {};
  s._depr.settings   = Object.assign({}, DEF, s._depr.settings || {});
  s._depr.components = Array.isArray(s._depr.components) ? s._depr.components : [];
  mut(s._depr);
  bkSave(s);
  return true;
}

/* ---------------------------------------------------------------- inputs */
function purchasePrice(){ var s = deal(); return Number(s && s.purchasePrice) || 0; }
function capex(){ return Number(settings().capex) || 0; }

function landValue(st){
  st = st || settings();
  var pp = purchasePrice();
  return st.landMethod === 'percent' ? pp * (Number(st.landPct)||0) : (Number(st.landDollar)||0);
}
function landPct(st){
  st = st || settings();
  var pp = purchasePrice();
  if(st.landMethod === 'percent') return Number(st.landPct)||0;
  return pp ? (Number(st.landDollar)||0) / pp : 0;
}
/* CANONICAL: Purchase Price - Land Value + Qualifying Capital Improvements */
function depreciableBasis(st){
  st = st || settings();
  return Math.max(0, purchasePrice() - landValue(st) + capex());
}

/* ---------------------------------------------------------------- validation */
function validate(st, comps){
  st = st || settings(); comps = comps || components();
  var pp = purchasePrice(), lv = landValue(st), errs = [];
  if(lv < 0)                 errs.push({code:'LAND_NEGATIVE',  msg:'Land value cannot be negative.'});
  if(pp > 0 && lv > pp)      errs.push({code:'LAND_OVER_PP',   msg:'Land value ($'+lv.toLocaleString()+') exceeds purchase price ($'+pp.toLocaleString()+').'});
  if((Number(st.landPct)||0) < 0) errs.push({code:'LANDPCT_NEGATIVE', msg:'Land value % cannot be negative.'});
  if((Number(st.landPct)||0) > 1 && st.landMethod==='percent') errs.push({code:'LANDPCT_OVER_100', msg:'Land value % cannot exceed 100%.'});
  comps.forEach(function(c,i){
    if(Number(c.basis) < 0) errs.push({code:'COMP_NEGATIVE', msg:'Component '+(i+1)+' ("'+(c.component||'untitled')+'") has a negative basis.'});
  });
  if(capex() < 0) errs.push({code:'CAPEX_NEGATIVE', msg:'Capital improvements cannot be negative.'});
  return errs;
}

/* ---------------------------------------------------------------- allocation */
var CLASSES = [5, 7, 15, 27.5, 39];

function buckets(st, comps){
  st = st || settings(); comps = comps || components();
  var b = {5:0, 7:0, 15:0, 27.5:0, 39:0};
  comps.forEach(function(c){
    var k = Number(c.recovery);
    if(b[k] !== undefined) b[k] += Number(c.basis) || 0;
  });
  /* Recovery-bucket mode: the base-building class carries the residual, which
     is why it is the only class that is never independently editable. Detailed
     mode never plugs anything - an imbalance is reported, not absorbed. */
  if(st.detailMode === 'buckets'){
    var base = Number(st.baseLife);
    var other = 0;
    CLASSES.forEach(function(k){ if(k !== base) other += b[k]; });
    b[base] = Math.max(0, depreciableBasis(st) - other);
  }
  return b;
}

/* ---------------------------------------------------------------- bonus */
/* Bonus eligibility is a property of the COMPONENT, not of the deal. Only
   short-life property (<= 20-year recovery) may be bonus-eligible; 27.5 and 39
   year real property never receives bonus treatment automatically, whatever
   the component row claims. */
function bonusEligible(c, st){
  var life = Number(c.recovery);
  if(!(life > 0) || life > 20) return false;
  return c.bonus === true;
}

/* ---------------------------------------------------------------- engine */
function engine(){
  var st = settings(), comps = components();
  var pp = purchasePrice(), lv = landValue(st), lp = landPct(st), B = depreciableBasis(st);
  var bkt = buckets(st, comps);
  var detail = st.detailMode === 'detailed';

  /* The line items the schedule actually depreciates. In detailed mode those
     are the component rows; in bucket mode they are one synthetic row per
     class, so BOTH modes normalise into the same structure and the same
     engine. There is no second code path. */
  var lines;
  if(!st.costSeg){
    /* No cost segregation: the page states that the entire depreciable basis flows to the base
       building class, so the engine must allocate it there too. Previously this fell through to
       the (empty) detailed-component path and reported the full basis as OUT OF BALANCE. */
    lines = B > 0 ? [{ label:st.baseLife+' Year Recovery', basis:B, life:Number(st.baseLife), bonus:false,
                       convention:'Underwriting', method:'Straight-line', source:'Underwriting Assumption', status:'CALC' }] : [];
  } else if(detail){
    lines = comps.map(function(c){
      return { label:c.component||c.description||'Component', basis:Number(c.basis)||0, placed:c.placed||'',
               life:Number(c.recovery)||0, bonus:bonusEligible(c, st),
               convention:c.convention||'', method:c.method||'', source:c.source||'', status:c.status||'INPUT' };
    });
  } else {
    lines = CLASSES.filter(function(k){ return (bkt[k]||0) > 0; }).map(function(k){
      return { label:k+' Year Recovery', basis:bkt[k], life:k,
               bonus: k <= 20, convention:'Underwriting', method:'Class default',
               source:'Underwriting Assumption',
               status: Number(k)===Number(st.baseLife) ? 'CALC' : 'INPUT' };
    });
  }

  var componentTotal = comps.reduce(function(a,c){ return a + (Number(c.basis)||0); }, 0);
  var allocated = !st.costSeg ? (B > 0 ? B : 0)
                : detail ? componentTotal : CLASSES.reduce(function(a,k){ return a + (bkt[k]||0); }, 0);
  var variance = allocated - B;
  var tie = Math.abs(variance) < 0.01;

  var bonusPct = Math.max(0, Math.min(1, Number(st.bonusPct)||0));
  var bonusEligibleBasis = lines.reduce(function(a,l){ return a + (l.bonus ? l.basis : 0); }, 0);
  var bonusDeduction = bonusEligibleBasis * bonusPct;

  return {
    settings:st, components:comps, lines:lines,
    purchasePrice:pp, capex:capex(),
    landValue:lv, landPct:lp,
    depreciableBasis:B,
    buckets:bkt, detailMode:st.detailMode,
    componentTotal:componentTotal, allocated:allocated, variance:variance, tie:tie,
    bonusPct:bonusPct, bonusEligibleBasis:bonusEligibleBasis, bonusDeduction:bonusDeduction,
    remainingAfterBonus: Math.max(0, allocated - bonusDeduction),
    baseLife:Number(st.baseLife),
    errors: validate(st, comps),
    hasData: !!(comps.length || lv > 0 || B > 0)
  };
}

/* ---------------------------------------------------------------- schedule */
/* SIMPLIFIED UNDERWRITING CONVENTION - stated plainly rather than implied.
   Each line depreciates straight-line over its recovery period, with bonus
   taken in full in the elected bonus year on eligible basis only. Real MACRS
   declining-balance tables and half-year / mid-quarter / mid-month conventions
   are NOT applied. The source study's stated method and convention are carried
   through as metadata so nothing about the source is lost, but this schedule
   is an underwriting projection, not a tax return.
   Cumulative depreciation can never exceed allocated basis. */
function schedule(years){
  var e = engine();
  var st = e.settings;
  var startYear = (function(){
    var d = String(st.closeDate||'');
    var m = /^(\d{4})-/.exec(d);
    if(m) return Number(m[1]);
    var s = deal();
    var c = s && (typeof bkParseDealDate==='function' ? bkParseDealDate(s.closing, null) : null);
    return c ? c.getFullYear() : new Date().getFullYear();
  })();
  var hold = Math.max(1, Math.round(Number((deal()||{}).holdYears) || 10));
  var n = Math.max(1, Number(years) || (hold + 1));
  var bonusYear = (st.bonusYear === null || st.bonusYear === undefined) ? null : Number(st.bonusYear);

  /* Per-line remaining basis, so nothing over-depreciates. */
  var state = e.lines.map(function(l){
    var bonusAmt = (l.bonus && bonusYear !== null) ? l.basis * e.bonusPct : 0;
    return { life:l.life, total:l.basis, bonusAmt:bonusAmt,
             depreciable: Math.max(0, l.basis - bonusAmt), taken:0, bonusTaken:false };
  });

  var rows = [], accum = 0;
  var totalBasis = e.allocated;
  for(var i = 0; i < n; i++){
    var taxYear = startYear + i;
    var regular = 0, bonus = 0;
    state.forEach(function(ln){
      if(bonusYear !== null && taxYear === bonusYear && !ln.bonusTaken && ln.bonusAmt > 0){
        var b = Math.min(ln.bonusAmt, Math.max(0, ln.total - ln.taken));
        bonus += b; ln.taken += b; ln.bonusTaken = true;
      }
      if(ln.life > 0){
        var annual = ln.depreciable / ln.life;
        var room = Math.max(0, ln.total - ln.taken);
        var r = Math.min(annual, room);
        regular += r; ln.taken += r;
      }
    });
    var begin = Math.max(0, totalBasis - accum);
    var total = regular + bonus;
    if(total > begin) { total = begin; }
    accum += total;
    rows.push({ taxYear:taxYear, beginBasis:begin, regular:regular, bonus:bonus,
                total:total, accum:accum, remaining: Math.max(0, totalBasis - accum) });
  }
  return { startYear:startYear, totalBasis:totalBasis, rows:rows,
           convention:'Simplified underwriting straight-line with elected bonus',
           isTaxGrade:false };
}

/* ---------------------------------------------------------------- public API */
window.bkDepreciation         = engine;
window.bkDepreciationSchedule = schedule;
window.bkDeprSettings         = settings;
window.bkDeprComponents       = components;
window.bkDeprValidate         = function(){ return validate(); };
window.bkDeprBasis            = function(){ return depreciableBasis(); };

window.bkDeprSet = function(k, v){
  var ok = commit(function(d){
    d.settings[k] = v;
    /* Exactly one of land $ / land % is authoritative at any moment; the other
       is derived. They are never independently editable simultaneously. */
    if(k === 'landDollar'){ var pp = purchasePrice(); d.settings.landPct = pp ? Number(v)/pp : 0; }
    if(k === 'landPct'){ d.settings.landDollar = purchasePrice() * Number(v); }
    if(k === 'landMethod'){
      /* Switching basis preserves the CURRENT economic value, so the
         calculated counterpart simply swaps roles. */
      var pp2 = purchasePrice();
      if(v === 'percent') d.settings.landPct = pp2 ? (Number(d.settings.landDollar)||0)/pp2 : 0;
      else                d.settings.landDollar = pp2 * (Number(d.settings.landPct)||0);
    }
  });
  if(ok && typeof showSheet === 'function') showSheet('Depreciation');
  return ok;
};
window.bkDeprCompSet = function(i, k, v){
  var ok = commit(function(d){
    if(!d.components[i]) return;
    d.components[i][k] = (k==='basis'||k==='recovery') ? Number(v) : (k==='bonus' ? !!v : v);
  });
  if(ok && typeof showSheet === 'function') showSheet('Depreciation');
  return ok;
};
window.bkDeprCompAdd = function(){
  var ok = commit(function(d){
    d.components.push({component:'', description:'', basis:0, recovery:5,
                       convention:'', method:'', bonus:true, source:'Manual', status:'INPUT'});
  });
  if(ok && typeof showSheet === 'function') showSheet('Depreciation');
  return ok;
};
window.bkDeprCompDel = function(i){
  var ok = commit(function(d){ d.components.splice(i, 1); });
  if(ok && typeof showSheet === 'function') showSheet('Depreciation');
  return ok;
};
/* Bucket edits write ONE synthetic component per class, so bucket mode and
   detailed mode share the same storage and the same engine. */
window.bkDeprBucketSet = function(life, v){
  var ok = commit(function(d){
    var idx = -1;
    d.components.forEach(function(c, i){
      if(c.status === 'BUCKET' && Number(c.recovery) === Number(life)) idx = i;
    });
    if(idx < 0){
      d.components.push({component:life+' Year Bucket', description:'Underwriting bucket assumption',
        basis:Number(v), recovery:Number(life), convention:'Underwriting', method:'Class default',
        bonus:Number(life) <= 20, source:'Underwriting Assumption', status:'BUCKET'});
    } else d.components[idx].basis = Number(v);
  });
  if(ok && typeof showSheet === 'function') showSheet('Depreciation');
  return ok;
};

/* Explicit fixture seed. Never automatic. Records its own provenance and
   deliberately keeps the study date SEPARATE from the acquisition closing
   date and from the model's tax assumption. */
window.bkDeprSeedHarvard = function(){
  var ok = commit(function(d){
    d.settings   = Object.assign({}, DEF, HARVARD_STUDY.settings, {seededAt:new Date().toISOString()});
    d.components = HARVARD_STUDY.components.map(function(c){ return Object.assign({}, c); });
  });
  if(ok && typeof showSheet === 'function') showSheet('Depreciation');
  return ok;
};
window.bkDeprClear = function(){
  var ok = commit(function(d){ d.settings = Object.assign({}, DEF); d.components = []; });
  if(ok && typeof showSheet === 'function') showSheet('Depreciation');
  return ok;
};

})();
