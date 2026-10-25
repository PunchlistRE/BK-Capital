
/* ===========================================================================
   WAVE 3B - VALUATION AND SOLVERS
   ===========================================================================
   This wave DOES add engine surface, and every addition is built to one rule:
   a solver may only SEARCH over the canonical engine, never re-implement it.

   bkSolve() below is a single bisection utility. It sets one field on a scratch
   copy of state, calls the canonical engines through bkRunScenario(), reads the
   metric, and narrows. No cash flow, NOI, debt or return figure is recomputed
   here - the engines produce every number and the solver only chooses inputs.

   That choice also avoids inventing a convention. The workbook's rent solve
   grosses an NOI gap up through a management fee and a "blended base-rent
   collection factor". Reproducing that formula would mean guessing at a
   derivation the workbook does not state in one place. Searching the real
   engine for the rent that produces the required NOI gives the same answer
   without inventing anything.

   The one convention taken from the workbook verbatim, because it IS stated
   there: the target yield-on-cost spread over the exit cap is 150bp for a
   development deal and 50bp for an acquisition (Reverse Solve!C7).
   =========================================================================== */
(function(){
'use strict';

function esc(v){ return (typeof bkEsc==='function') ? bkEsc(v) : String(v==null?'':v); }
function money(n){
  if(n===null||n===undefined||n==='') return '-';
  var x=Number(n); if(!isFinite(x)) return '-';
  if(Object.is(x,-0)) x=0;
  var neg=x<0, a=Math.abs(x);
  var body = a<100 ? a.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
                   : a.toLocaleString('en-US',{maximumFractionDigits:0});
  return neg ? '($'+body+')' : '$'+body;
}
function pct(n,dp){ var x=Number(n); if(!isFinite(x)) return '-'; return (x*100).toFixed(dp===undefined?2:dp)+'%'; }
function bps(n){ var x=Number(n); if(!isFinite(x)) return '-'; return Math.round(x*10000)+' bps'; }
function mult(n){ var x=Number(n); if(!isFinite(x)) return '-'; return x.toFixed(2)+'x'; }
function intf(n){ var x=Number(n); if(!isFinite(x)) return '-'; return Math.round(x).toLocaleString('en-US'); }
function chip(cls,t){ return '<span class="status-chip '+(cls||'')+'">'+esc(t)+'</span>'; }
function note(sym,html){ return '<div class="note-flag" style="margin-top:10px;"><span>'+sym+'</span><div>'+html+'</div></div>'; }
function wrapTable(caption, headHtml, bodyHtml){
  return '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>'+caption+'</caption>'
       + (headHtml?'<thead>'+headHtml+'</thead>':'') + '<tbody>'+bodyHtml+'</tbody></table></div>';
}
function lbl(t){ return '<td class="rowlabel" data-bk-align="text">'+t+'</td>'; }
function val(t){ return '<td class="v">'+t+'</td>'; }
function txt(t){ return '<td data-bk-align="text">'+t+'</td>'; }
function extend(sheet, tag, fn){
  if(typeof RENDERERS==='undefined' || typeof RENDERERS[sheet] !== 'function') return false;
  var prev = RENDERERS[sheet];
  if(prev['__'+tag]) return true;
  var wrapped = function(){
    var o = prev.apply(this, arguments);
    // BLANK-SLATE GUARD: extension layers must never append calculations to a
    // canonical no-deal page. The base renderer is authoritative for empty state.
    try {
      if(typeof window.bkProductionCounts === 'function' && !window.bkProductionCounts().activeDeal) return o;
    } catch(_blankStateErr){}
    if(/no deal loaded|there is no active deal/i.test(String(o && o.main || ''))) return o;
    if(/withheld|calculation blocked/i.test(String(o && o.main || ''))) return o;
    try { fn(o); } catch(e){
      o.main = (o.main||'') + note('&#9888;','<b>'+esc(sheet)+' 3B error:</b> '+esc(e.message));
    }
    return o;
  };
  wrapped['__'+tag] = true;
  wrapped.__bkOriginal = prev.__bkOriginal || prev;
  if(typeof window.bkRegisterRenderer==='function') window.bkRegisterRenderer(sheet, wrapped);
  else RENDERERS[sheet] = wrapped;
  return true;
}

/* =====================================================================
   XNPV over the canonical dated monthly cash flows.
   Mirrors the app's own bkXirr convention: actual/365 from the first date.
   ===================================================================== */
window.bkXnpv = function(rate, values, dates){
  if(!Array.isArray(values) || !Array.isArray(dates) || !values.length) return NaN;
  var r = Number(rate); if(!isFinite(r) || r <= -1) return NaN;
  var sum = 0;
  for(var i=0;i<values.length;i++){
    var days = bkDays(dates[0], dates[i]);
    sum += Number(values[i]) / Math.pow(1+r, days/365);
  }
  return sum;
};

/* =====================================================================
   bkSolve - ONE bisection utility over the canonical engine.
   field:   the state field to search on
   metric:  a function of the scenario result -> number
   target:  the value the metric must reach
   Returns {x, value, iterations, converged}. Never recomputes economics.
   ===================================================================== */
window.bkSolve = function(field, metric, target, opts){
  opts = opts || {};
  var lo = (opts.lo !== undefined) ? opts.lo : 0;
  var hi = (opts.hi !== undefined) ? opts.hi : 1;
  var tol = opts.tol || 1e-7, maxIt = opts.maxIt || 60;
  // The metric must be evaluated INSIDE the scenario scope, not against
  // bkRunScenario's return value - an NOI or yield metric calls bkCalc()/
  // bkDevV09() itself, and those read bkLoad(). So the solver applies the same
  // isolation bkRunScenario uses and runs the metric while it is in force.
  // Nothing is written: bkSave is a no-op onto the scratch copy.
  function probe(x){
    var real = bkLoad();
    var scratch = Object.assign({}, real); scratch[field] = x;
    var ol = window.bkLoad, os = window.bkSave;
    window.bkLoad = function(){ return scratch; };
    window.bkSave = function(dd){ Object.assign(scratch, dd); return dd; };
    try { var m = metric(); return isFinite(m) ? m : NaN; }
    catch(e){ return NaN; }
    finally { window.bkLoad = ol; window.bkSave = os; }
  }
  function f(x){ return probe(x); }
  var flo = f(lo), fhi = f(hi);
  if(!isFinite(flo) || !isFinite(fhi)) return { converged:false, why:'metric not finite at the bracket' };
  // widen once if the target is not bracketed
  if((flo-target)*(fhi-target) > 0){
    var span = hi-lo;
    var lo2 = Math.max(opts.floor===undefined?-1e12:opts.floor, lo-span*4), hi2 = hi+span*4;
    var flo2 = f(lo2), fhi2 = f(hi2);
    if(isFinite(flo2) && isFinite(fhi2) && (flo2-target)*(fhi2-target) <= 0){ lo=lo2; hi=hi2; flo=flo2; fhi=fhi2; }
    else return { converged:false, why:'target not reachable within the search range', lo:lo, hi:hi, flo:flo, fhi:fhi };
  }
  var mid=lo, fm=flo, it=0;
  for(; it<maxIt; it++){
    mid = (lo+hi)/2; fm = f(mid);
    if(!isFinite(fm)) return { converged:false, why:'metric went non-finite mid-search', x:mid };
    if(Math.abs(fm-target) <= Math.abs(target)*1e-9 + tol) break;
    if((flo-target)*(fm-target) <= 0){ hi=mid; fhi=fm; } else { lo=mid; flo=fm; }
  }
  return { x:mid, value:fm, iterations:it, converged:Math.abs(fm-target) <= Math.abs(target)*1e-6 + tol*10 };
};

/* Target yield on cost - the ONE workbook convention carried over verbatim. */
function targetYoC(s){
  var isDev = String(s.dealType||'').toLowerCase()==='development';
  var spread = isDev ? 0.015 : 0.005;
  var exitCap = Number(s.exitCap)||0;
  return { isDev:isDev, spread:spread, exitCap:exitCap, target:exitCap+spread };
}
/* Total basis the yield is measured against - levered all-in for a development
   deal (the engine's own `levered`), acquisition basis otherwise. */
function totalBasis(s){
  var isDev = String(s.dealType||'').toLowerCase()==='development';
  if(isDev){
    try { var x = (typeof bkDevTakeoutV11==='function') ? bkDevTakeoutV11() : bkDevFundingV10();
          if(x && isFinite(x.levered)) return x.levered; } catch(e){}
  }
  var price = Number(s.purchasePrice)||0;
  var acqFee = (typeof bkAcqFeePct==='function') ? bkAcqFeePct(s) : Number(s.acqFeePct||0);
  return price * (1 + Number(s.closingCostsPct||0) + acqFee);
}

/* =====================================================================
   RETURNS - VALUATION CONCLUSION: DIRECT CAP vs DCF
   ===================================================================== */
/* ONE valuation calculator. Returns renders it in full and Home reads the same object, so the
   two pages can never disagree (Home previously ran its own copy: NOI before reserves, a Year-10
   basis on any hold, a DCF dated from today and with no sale proceeds). */
window.bkValuationConclusion = function(){
  var s = bkLoad(), u = bkAnnualCF();
  var basisYear = Math.max(1, Math.min(u.arr.length, Math.round(Number(s.capBasisYear)|| u.arr.length)));
  var basisNOI = u.arr[basisYear-1] ? u.arr[basisYear-1].after : NaN;
  var exitCap = Number(s.exitCap)||0;
  var directCap = exitCap ? basisNOI/exitCap : NaN;

  var disc = Number(s.dcfDiscountRate);
  if(!isFinite(disc) || disc <= 0) disc = 0.07;      // BK_BASE default, surfaced as an input below
  // DCF over the canonical dated monthly unlevered stream, with the sale in its own month.
  var dates = [], vals = [];
  var acq = u.acqDate ? new Date(u.acqDate) : new Date();
  for(var m=1;m<=u.holdMonths;m++){
    var mo = u.monthly[m-1];
    var cf = mo ? mo.noi : 0;
    if(m===u.holdMonths) cf += u.netSale;
    vals.push(cf);
    dates.push(bkMonthEnd(acq, m));
  }
  var dcf = bkXnpv(disc, [0].concat(vals), [new Date(acq)].concat(dates));   // valued as of the closing date

  var method = String(s.valuationMethod||'Direct Cap');
  var concluded = /dcf/i.test(method) ? dcf : directCap;
  var basis = totalBasis(s);
  return { s:s, u:u, basisYear:basisYear, basisNOI:basisNOI, exitCap:exitCap, directCap:directCap,
           disc:disc, dcf:dcf, method:method, isDcf:/dcf/i.test(method), concluded:concluded, basis:basis,
           impliedCap: concluded ? basisNOI/concluded : NaN };
};
extend('Returns','w3bValuation', function(o){
  var v;
  try { v = window.bkValuationConclusion(); } catch(e){ return; }
  var s = v.s, u = v.u, basisYear = v.basisYear, basisNOI = v.basisNOI, exitCap = v.exitCap, directCap = v.directCap,
      disc = v.disc, dcf = v.dcf, method = v.method, concluded = v.concluded, basis = v.basis, impliedCap = v.impliedCap;
  var units = Number(s.units)||0, gsf = Number(s.gsf)||0;

  var body = ''
    + '<tr>'+lbl('Direct Cap Value')+val(money(directCap))
      + txt('Year '+basisYear+' NOI after reserves '+money(basisNOI)+' &divide; exit cap '+pct(exitCap))
      + '<td class="v">'+(/dcf/i.test(method)?chip('','alternative'):chip('pass','CONCLUDED'))+'</td></tr>'
    + '<tr>'+lbl('Discounted Cash Flow Value')+val(money(dcf))
      + txt('XNPV at '+pct(disc)+' of the monthly unlevered NOI stream plus net sale proceeds')
      + '<td class="v">'+(/dcf/i.test(method)?chip('pass','CONCLUDED'):chip('','alternative'))+'</td></tr>'
    + '<tr class="grandtotal">'+lbl('CONCLUDED VALUE')+val(money(concluded))
      + txt('Method: '+esc(method))+'<td></td></tr>'
    + '<tr>'+lbl('Concluded Value per Unit')+val(units?money(concluded/units):'-')+txt(intf(units)+' units')+'<td></td></tr>'
    + '<tr>'+lbl('Concluded Value per SF')+val(gsf?money(concluded/gsf):'-')+txt(intf(gsf)+' GSF')+'<td></td></tr>'
    + '<tr>'+lbl('Spread over Total Basis')+val(money(concluded-basis))
      + txt('Against a total basis of '+money(basis))
      + '<td class="v">'+((concluded-basis)>=0?chip('pass','VALUE CREATED'):chip('warn','BELOW BASIS'))+'</td></tr>'
    + '<tr>'+lbl('Implied Cap Rate at the Concluded Value')+val(pct(impliedCap))+txt('Basis-year NOI &divide; concluded value')+'<td></td></tr>';

  o.main = (o.main||'') + wrapTable('Valuation Conclusion - Direct Cap versus DCF',
      '<tr><th class="rowlabel-h">Metric</th><th>Value</th><th style="text-align:left">Basis</th><th>Status</th></tr>', body)
    + wrapTable('Valuation Method Controls',
      '<tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Units</th><th>Status</th></tr>',
        '<tr>'+lbl('Concluded Value Method')
        + '<td class="v"><select onchange="bkSetValuationMethod(this.value)">'
        +   '<option value="Direct Cap"'+(/dcf/i.test(method)?'':' selected')+'>Direct Cap</option>'
        +   '<option value="DCF"'+(/dcf/i.test(method)?' selected':'')+'>DCF</option>'
        + '</select></td>'+txt('Which value the conclusion uses')+'<td class="v">'+chip('','INPUT')+'</td></tr>'
      + '<tr>'+lbl('DCF Discount Rate')
        + '<td class="v"><input type="number" step="0.01" style="width:110px" value="'+(disc*100).toFixed(2)+'"'
        +   ' onchange="bkSetDcfDiscountRate(this.value)"></td>'
        + txt('% - applied to the monthly unlevered stream')+'<td class="v">'+chip('','INPUT')+'</td></tr>'
      + '<tr>'+lbl('Direct Cap Basis Year')
        + '<td class="v"><select onchange="bkSetCapBasisYear(this.value)">'
        +   u.arr.map(function(a){ return '<option value="'+a.y+'"'+(a.y===basisYear?' selected':'')+'>Year '+a.y+'</option>'; }).join('')
        + '</select></td>'+txt('Which year’s NOI the direct cap uses')+'<td class="v">'+chip('','INPUT')+'</td></tr>');
});

/* Typed setters - the engine reads a string method and numeric rate/year, so a
   raw bkSetField would persist the wrong type and the control would be a placebo. */
window.bkSetValuationMethod = function(v){
  var s = bkLoad(); s.valuationMethod = (/dcf/i.test(String(v)) ? 'DCF' : 'Direct Cap'); bkSave(s);
  if(typeof showSheet==='function') showSheet(typeof currentSheet!=='undefined'?currentSheet:'Returns');
};
window.bkSetDcfDiscountRate = function(v){
  var n = Number(v); var s = bkLoad();
  s.dcfDiscountRate = (isFinite(n) && n > 0) ? n/100 : 0.07; bkSave(s);
  if(typeof showSheet==='function') showSheet(typeof currentSheet!=='undefined'?currentSheet:'Returns');
};
window.bkSetCapBasisYear = function(v){
  var n = Math.round(Number(v)); var s = bkLoad();
  s.capBasisYear = (isFinite(n) && n > 0) ? n : 10; bkSave(s);
  if(typeof showSheet==='function') showSheet(typeof currentSheet!=='undefined'?currentSheet:'Returns');
};

/* =====================================================================
   REVERSE SOLVE - YIELD ON COST: required rent, and supportable cost
   ===================================================================== */
extend('Reverse Solve','w3bYoC', function(o){
  var s = bkLoad();
  var T = targetYoC(s);
  var basis = totalBasis(s);
  var c; try { c = bkCalc(); } catch(e){ return; }
  var noi = Number(c.noi)||0;
  var currentYoC = basis ? noi/basis : NaN;
  var requiredNOI = T.target * basis;
  var gap = requiredNOI - noi;

  var position = wrapTable('Yield on Cost - target and current position',
    '<tr><th class="rowlabel-h">Metric</th><th>Value</th><th style="text-align:left">Basis</th></tr>',
      '<tr>'+lbl('Exit Cap Rate')+val(pct(T.exitCap))+txt('Scenario-adjusted exit cap')+'</tr>'
    + '<tr>'+lbl('Target Spread over Exit Cap')+val(bps(T.spread))
      + txt(T.isDev ? '150 bps for a development deal' : '50 bps for an acquisition')+'</tr>'
    + '<tr class="subtotal">'+lbl('TARGET YIELD ON COST')+val(pct(T.target))+txt('Exit cap plus target spread')+'</tr>'
    + '<tr>'+lbl('Total All-In Cost Basis')+val(money(basis))
      + txt(T.isDev ? 'Levered all-in cost from the development engine' : 'Price plus closing costs and acquisition fee')+'</tr>'
    + '<tr>'+lbl('Stabilized NOI Before Reserves')+val(money(noi))+txt('Year 1 from the canonical operating engine')+'</tr>'
    + '<tr class="subtotal">'+lbl('CURRENT YIELD ON COST')+val(pct(currentYoC))+txt('NOI &divide; total basis')+'</tr>'
    + '<tr>'+lbl('Spread versus Exit Cap')+val(bps(currentYoC - T.exitCap))
      + txt((currentYoC>=T.target?'Above':'Below')+' the target spread')+'</tr>'
    + '<tr class="grandtotal">'+lbl('Surplus / (Shortfall) versus Target')+val(pct(currentYoC - T.target))
      + '<td data-bk-align="text">'+(currentYoC>=T.target?chip('pass','CLEARS TARGET'):chip('warn','BELOW TARGET'))+'</td></tr>'
    + '<tr>'+lbl('Required NOI at the Target Yield')+val(money(requiredNOI))+txt('Target yield &times; total basis')+'</tr>'
    + '<tr>'+lbl('NOI Gap')+val(money(gap))+txt(gap>0?'Additional NOI required':'NOI headroom above target')+'</tr>');

  /* ---- Solve A: required rent, holding cost constant ---- */
  var useRR = Array.isArray(s.rentRoll) && s.rentRoll.length>0;
  var rentField = useRR ? null : (Number(s.commercialRent)>0 ? 'commercialRent' : 'avgRent');
  var solveRent = '';
  if(rentField){
    var cur = Number(s[rentField])||0;
    var r = bkSolve(rentField, function(){
      try { return Number(bkCalc().noi); } catch(e){ return NaN; }
    }, requiredNOI, { lo: 0, hi: Math.max(cur*4, cur+1000, 1000), tol: 0.5, maxIt: 80 });
    solveRent = wrapTable('Solve A - required rent, holding cost constant',
      '<tr><th class="rowlabel-h">Metric</th><th>Value</th><th style="text-align:left">Basis</th></tr>',
        '<tr>'+lbl('Rent Assumption Being Solved')+val(esc(rentField))+txt('The canonical rent field this deal uses')+'</tr>'
      + '<tr>'+lbl('Current Rent')+val(money(cur))+txt('As underwritten')+'</tr>'
      + (r.converged
          ? '<tr class="grandtotal">'+lbl('REQUIRED RENT AT THE TARGET YIELD')+val(money(r.x))
              + txt('Solved on the canonical engine in '+intf(r.iterations)+' iterations')+'</tr>'
            + '<tr>'+lbl('Change versus Current')+val(cur?pct((r.x-cur)/cur):'-')
              + '<td data-bk-align="text">'+((r.x<=cur)?chip('pass','ACHIEVABLE AT OR BELOW CURRENT'):chip('warn','RENT MUST RISE'))+'</td></tr>'
          : '<tr>'+lbl('Required Rent')+val('-')
              + '<td data-bk-align="text">'+chip('warn','NOT REACHABLE')+' - '+esc(r.why||'the target is outside the search range')+'</td></tr>'));
  } else {
    solveRent = note('&#9432;','<b>Solve A is not offered for a rent-roll-driven deal.</b> Revenue comes from '+intf(s.rentRoll.length)
      + ' individual leases, so there is no single rent assumption to solve for. Scaling every lease by one factor would be a new '
      + 'assumption this model does not carry. Solve B below is unaffected.');
  }

  /* ---- Solve B: maximum supportable cost, holding rent constant ---- */
  var maxCost = T.target ? noi/T.target : NaN;
  var gsf = Number(s.gsf)||0;
  var solveCost = wrapTable('Solve B - maximum supportable cost, holding rent constant',
    '<tr><th class="rowlabel-h">Metric</th><th>Value</th><th style="text-align:left">Basis</th></tr>',
      '<tr class="grandtotal">'+lbl('MAXIMUM SUPPORTABLE ALL-IN COST')+val(money(maxCost))
        + txt('Stabilized NOI &divide; target yield on cost')+'</tr>'
    + '<tr>'+lbl('Current All-In Cost')+val(money(basis))+txt('As underwritten')+'</tr>'
    + '<tr>'+lbl('Cost Reduction Required / (Headroom)')+val(money(basis-maxCost))
      + '<td data-bk-align="text">'+((basis<=maxCost)?chip('pass','HEADROOM'):chip('warn','REDUCTION REQUIRED'))+'</td></tr>'
    + '<tr>'+lbl('Maximum Cost per GSF')+val(gsf?money(maxCost/gsf):'-')+txt(intf(gsf)+' GSF')+'</tr>'
    + '<tr>'+lbl('Current Cost per GSF')+val(gsf?money(basis/gsf):'-')+txt('As underwritten')+'</tr>');

  /* ---- Verdict ---- */
  var clears = currentYoC >= T.target;
  var verdict = note(clears?'&#10003;':'&#9888;',
    clears
      ? '<b>The deal clears its yield-on-cost target.</b> Current yield on cost is '+pct(currentYoC)+' against a target of '+pct(T.target)
        + ' - a cushion of '+bps(currentYoC-T.target)+'. Cost could rise to '+money(maxCost)+' ('+money(maxCost-basis)
        + ' of headroom) before the target is missed'+(rentField?', or rent could fall to '+money(bkSolve(rentField,function(){try{return Number(bkCalc().noi);}catch(e){return NaN;}},requiredNOI,{lo:0,hi:Math.max((Number(s[rentField])||0)*4,1000),tol:0.5,maxIt:80}).x || 0):'')+'.'
      : '<b>The deal is below its yield-on-cost target.</b> Current yield on cost is '+pct(currentYoC)+' against a target of '+pct(T.target)
        + ' - short by '+bps(T.target-currentYoC)+'. Closing the gap needs '+money(gap)+' more NOI, or the all-in cost cut to '
        + money(maxCost)+' ('+money(basis-maxCost)+' less than underwritten).');

  o.main = (o.main||'') + position + solveRent + solveCost + verdict
    + note('&#9432;','The 150 bps development / 50 bps acquisition target spread is the workbook&rsquo;s own convention, carried over as-is. '
      + 'The rent solve searches the canonical engine for the rent that produces the required NOI rather than reproducing the workbook&rsquo;s '
      + 'gross-up formula, so no collection-factor convention is invented. The existing purchase-price-for-target-IRR solve above is retained - '
      + 'it answers a different question and is additive.');
});

/* =====================================================================
   RESIDUAL LAND - a LIVE solve over the canonical engine
   ===================================================================== */
extend('Residual Land','w3bResidualSolve', function(o){
  var s = bkLoad();
  var metricKey = String(s.rlvTargetMetric || 'Levered IRR');
  var targetVal = Number(s.rlvTargetValue);
  if(!isFinite(targetVal) || targetVal <= 0) targetVal = (/multiple|moic|equity/i.test(metricKey) ? 2.0 : 0.15);

  var METRICS = {
    'Unlevered IRR':          function(){ try { return bkAnnualCF().irr; } catch(e){ return NaN; } },
    'Unlevered MOIC':         function(){ try { return bkAnnualCF().moic; } catch(e){ return NaN; } },
    'Levered IRR':            function(){ try { return bkMonthlyReturns().irr; } catch(e){ return NaN; } },
    'Levered Equity Multiple':function(){ try { return bkMonthlyReturns().moic; } catch(e){ return NaN; } },
    'Development Yield on Cost': function(){ try { var st=bkLoad(); return (bkCalc().noi)/totalBasis(st); } catch(e){ return NaN; } }
  };
  var metricFn = METRICS[metricKey] || METRICS['Levered IRR'];

  var price = Number(s.purchasePrice)||0;
  var sol = bkSolve('purchasePrice', function(){ return metricFn(); }, targetVal,
                    { lo: 1, hi: Math.max(price*3, price+1000000, 1000000), tol: 1e-6, maxIt: 70 });

  var stored = Number(s.residualLandValue)||0;
  var overrideOn = !!Number(s.landOverrideOn);
  var effective = overrideOn ? stored : price;
  var solvedStillHits = null;
  if(stored > 0){
    try {
      var realS = bkLoad(), scr = Object.assign({}, realS, { purchasePrice: stored });
      var ol2 = window.bkLoad, os2 = window.bkSave;
      window.bkLoad = function(){ return scr; }; window.bkSave = function(d2){ Object.assign(scr, d2); return d2; };
      var m2; try { m2 = metricFn(); } finally { window.bkLoad = ol2; window.bkSave = os2; }
      solvedStillHits = isFinite(m2) ? Math.abs(m2 - targetVal) <= Math.abs(targetVal)*0.001 : null;
    } catch(e){}
  }

  var body = ''
    + '<tr>'+lbl('Target Metric')
      + '<td class="v"><select onchange="bkSetRlvMetric(this.value)">'
      +   Object.keys(METRICS).map(function(k){ return '<option'+(k===metricKey?' selected':'')+'>'+esc(k)+'</option>'; }).join('')
      + '</select></td>'+txt('Which return the land value is solved to')+'<td class="v">'+chip('','INPUT')+'</td></tr>'
    + '<tr>'+lbl('Target Value')
      + '<td class="v"><input type="number" step="0.01" style="width:110px" value="'
      +   (/multiple|moic|equity/i.test(metricKey) ? targetVal.toFixed(2) : (targetVal*100).toFixed(2))
      + '" onchange="bkSetRlvTarget(this.value)"></td>'
      + txt(/multiple|moic|equity/i.test(metricKey) ? 'x - equity multiple' : '% - annual return')
      + '<td class="v">'+chip('','INPUT')+'</td></tr>'
    + '<tr>'+lbl('Current Purchase Price')+val(money(price))+txt('As underwritten')+'<td></td></tr>'
    + (sol.converged
        ? '<tr class="grandtotal">'+lbl('SOLVED RESIDUAL LAND VALUE')+val(money(sol.x))
            + txt('Price at which '+esc(metricKey)+' equals '
              + (/multiple|moic|equity/i.test(metricKey)?mult(targetVal):pct(targetVal))
              + ' - '+intf(sol.iterations)+' iterations on the canonical engine')
            + '<td class="v">'+chip('pass','SOLVED LIVE')+'</td></tr>'
          + '<tr>'+lbl('Metric at the Solved Price')
            + val(/multiple|moic|equity/i.test(metricKey)?mult(sol.value):pct(sol.value))
            + txt('Verification of the solve')+'<td></td></tr>'
          + '<tr>'+lbl('Implied Change versus Current Price')+val(money(sol.x-price))
            + txt(price?pct((sol.x-price)/price)+' versus the underwritten price':'')+'<td></td></tr>'
        : '<tr>'+lbl('Solved Residual Land Value')+val('-')
            + txt(esc(sol.why||'the target is not reachable within the search range'))
            + '<td class="v">'+chip('warn','NOT REACHABLE')+'</td></tr>')
    + '<tr>'+lbl('Stored Workbook Solve')+val(stored?money(stored):'-')
      + txt(overrideOn?'Currently applied as the effective land price':'Stored but not applied')
      + '<td class="v">'+(overrideOn?chip('pass','APPLIED'):chip('','NOT APPLIED'))+'</td></tr>'
    + (stored>0 && solvedStillHits!==null
        ? '<tr>'+lbl('Stored Solve Still Hits Its Target')+val(solvedStillHits?'Yes':'No')
            + txt('Re-evaluated against the live engine')
            + '<td class="v">'+(solvedStillHits?chip('pass','CURRENT'):chip('warn','STALE'))+'</td></tr>'
        : '')
    + '<tr>'+lbl('Effective Land / Purchase Price Used by the Model')+val(money(effective))
      + txt(overrideOn?'The override is on':'The underwritten purchase price')+'<td></td></tr>';

  o.main = (o.main||'') + wrapTable('Residual Land Value - live solve',
      '<tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Basis</th><th>Status</th></tr>', body)
    + note('&#9432;','This solve runs <b>live</b> against the canonical engine every time the page renders, so it cannot go stale. '
      + 'The workbook&rsquo;s equivalent is a macro that stamps a constant, which is why the workbook needs a staleness check at all. '
      + 'The stored workbook value is still shown, and still re-tested against the live engine, so an imported deal can be audited.');
});

window.bkSetRlvMetric = function(v){
  var s = bkLoad(); s.rlvTargetMetric = String(v||'Levered IRR'); bkSave(s);
  if(typeof showSheet==='function') showSheet(typeof currentSheet!=='undefined'?currentSheet:'Residual Land');
};
window.bkSetRlvTarget = function(v){
  var n = Number(v), s = bkLoad();
  var isMult = /multiple|moic|equity/i.test(String(s.rlvTargetMetric||''));
  s.rlvTargetValue = isFinite(n) && n>0 ? (isMult ? n : n/100) : (isMult ? 2 : 0.15);
  bkSave(s);
  if(typeof showSheet==='function') showSheet(typeof currentSheet!=='undefined'?currentSheet:'Residual Land');
};

})();
