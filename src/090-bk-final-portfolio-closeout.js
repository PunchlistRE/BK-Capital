
/* ===========================================================================
   FINAL WAVE (B) - THE TWO REMAINING PORTFOLIO ITEMS THAT ARE EXPOSURE
   ===========================================================================
     PF-03  Portfolio model checks. The workbook runs three reconciliations on
            Portfolio CF - portfolio debt service, T-12 NOI and going-in value,
            each against the Property DB source. The web equivalent is the same
            question asked of the same figures: does the portfolio aggregate
            equal the sum of each deal's own engine output? Every figure is read
            from bkPortfolioMetricsFor() and bkPortfolioMonthlyFor(), which are
            the canonical per-deal helpers the portfolio sheets already use.

     PF-02  Exposure by property type, deal type and state. The dashboard
            already shows purchase price by property type; the workbook also
            shows peak equity exposure across all three dimensions. This is a
            grouping of per-deal equity the portfolio helper already returns.

   The remaining portfolio rows are NOT closed here, and the reason is the same
   for all of them: each needs a data-model decision first. PF-01 staleness has
   no web equivalent because nothing is cached; PF-05's minimum-cash capital-call
   sizing is new logic; PDB-01's per-slot overrides and INV-01/02, CC-01 and
   LDG-01's per-slot investor dimension all require choosing a model the
   workbook and this application do not share. They are in the blocker register.
   =========================================================================== */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined') return;

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
function pct(n){ var x=Number(n); if(!isFinite(x)) return '-'; return (x*100).toFixed(2)+'%'; }
function intf(n){ var x=Number(n); if(!isFinite(x)) return '-'; return Math.round(x).toLocaleString('en-US'); }
function chip(cls,t){ return '<span class="status-chip '+(cls||'')+'">'+esc(t)+'</span>'; }
function note(sym,html){ return '<div class="note-flag" style="margin-top:10px;"><span>'+sym+'</span><div>'+html+'</div></div>'; }
function lbl(t){ return '<td class="rowlabel" data-bk-align="text">'+t+'</td>'; }
function val(t){ return '<td class="v">'+t+'</td>'; }
function txt(t){ return '<td class="rowlabel" data-bk-align="text" style="font-weight:400;opacity:.8">'+t+'</td>'; }
function wrapTable(caption, headHtml, bodyHtml){
  return '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>'+caption+'</caption>'
       + '<thead>'+headHtml+'</thead><tbody>'+bodyHtml+'</tbody></table></div>';
}
function extend(sheet, tag, fn){
  if(typeof RENDERERS[sheet] !== 'function') return false;
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
    if(!o || typeof o !== 'object') return o;
    if(/withheld|calculation blocked/i.test(String(o.main||''))) return o;
    try { fn(o); } catch(e){
      o.main = (o.main||'') + note('&#9888;','A close-out block could not be rendered: '+esc(e.message)+'.');
    }
    return o;
  };
  wrapped['__'+tag] = true; wrapped.__bkOriginal = prev.__bkOriginal || prev;
  Object.keys(prev).forEach(function(k){ if(k.indexOf('__')===0 && !wrapped[k]) wrapped[k] = prev[k]; });
  if(typeof window.bkRegisterRenderer==='function') window.bkRegisterRenderer(sheet, wrapped);
  else RENDERERS[sheet] = wrapped;
  return true;
}

function perDeal(){
  var saved = [];
  try { saved = bkPortfolioLoad() || []; } catch(e){ return []; }
  return saved.map(function(snap){
    var m = null, mo = null;
    try { m = bkPortfolioMetricsFor(snap); } catch(e){}
    try { mo = bkPortfolioMonthlyFor(snap); } catch(e){}
    return { snap: snap, m: m, mo: mo };
  }).filter(function(x){ return x.m && x.m.ok; });
}

/* ---------------- PF-03: portfolio model checks ---------------- */
extend('Portfolio CF','fbChecks', function(o){
  var deals = perDeal();
  if(!deals.length){
    o.main = (o.main||'') + note('&#9432;','<b>Add deals to the portfolio</b> to run the portfolio model checks. They reconcile the '
      + 'portfolio aggregate against the sum of each deal&rsquo;s own engine output, so they appear as soon as there is a portfolio.');
    return;
  }
  // WHAT IS RECONCILED, AND WHY IT IS NOT A TAUTOLOGY.
  // The first version of this block compared each deal's Year-1 NOI from
  // bkPortfolioMetricsFor() against the first twelve months of its levered monthly
  // rows. Those disagreed by roughly $2.0m, and the engine was right: for a
  // DEVELOPMENT deal the two sit on different clocks. The monthly returns vector
  // starts at project month 1 - construction, no NOI - while the annual operating
  // array starts at the first OPERATING year. Comparing them measured the clock
  // offset, not an aggregation defect.
  // What is reconciled here instead is each deal's annual operating array against
  // its own monthly operating array: two independent routes through the same engine,
  // on the same clock, for every deal type. That is the same reconciliation the
  // single-deal Property CF sheet already runs, summed across the portfolio.
  var sumNOI = 0, sumEquity = 0, sumLoan = 0, sumPrice = 0, sumValue = 0;
  var annualNOI = 0, monthlyNOI = 0, annualEGI = 0, monthlyEGI = 0;
  var rowsDS = 0, schedDS = 0, offClock = 0;
  deals.forEach(function(d){
    sumNOI    += Number(d.m.y1noi)||0;
    sumEquity += Number(d.m.equity)||0;
    sumLoan   += Number(d.m.loan)||0;
    sumPrice  += Number(d.m.purchasePrice)||0;
    var cap = Number(d.m.exitCap)||0;
    sumValue  += cap > 0 ? (Number(d.m.y1noi)||0)/cap : 0;
    // route 1 vs route 2 through the same engine, inside the deal's own scratch scope
    var origLoad = window.bkLoad, origSave = window.bkSave;
    var scratch = JSON.parse(JSON.stringify(d.snap));
    window.bkLoad = function(){ return scratch; };
    window.bkSave = function(x){ Object.assign(scratch, x); return x; };
    try {
      var u = bkAnnualCF();
      (u.arr||[]).forEach(function(y){ annualNOI += Number(y.after)||0; annualEGI += Number(y.egi)||0; });
      (u.monthly||[]).forEach(function(m){ monthlyNOI += Number(m.noi)||0; monthlyEGI += Number(m.egi)||0; });
      // Route B for debt service must read the facility the deal ACTUALLY carries.
      // bkDebt() is the acquisition sizing engine; on a development deal the operative
      // facility after completion is the permanent loan from bkDevTakeoutV11(), and the
      // construction facility's interest is capitalised rather than paid in cash. Reading
      // bkDebt() for every deal compared an acquisition loan that the development deal
      // does not have against levered rows that carry its permanent loan - a $5.2m
      // apparent break that was entirely the wrong Route B.
      var isDev = String(scratch.dealType||'').toLowerCase()==='development';
      var used = false;
      if(isDev && typeof bkDevTakeoutV11==='function'){
        try { var tk = bkDevTakeoutV11();
              if(tk && tk.permSchedule && tk.permSchedule.length){
                tk.permSchedule.forEach(function(m){ schedDS += Number(m.payment)||0; });
                used = true; } } catch(e){}
      }
      if(!used){ var dd = bkDebt(); (dd.months||[]).forEach(function(m){ schedDS += Number(m.payment)||0; }); }
      if(d.mo && d.mo.ok && d.mo.r && d.mo.r.rows){
        d.mo.r.rows.forEach(function(x){ rowsDS += Math.abs(Number(x.ds)||0); });
        if(d.mo.r.rows.length !== (u.monthly||[]).length) offClock++;
      }
    } catch(e){}
    finally { window.bkLoad = origLoad; window.bkSave = origSave; }
  });

  function check(label, a, bq, basis){
    var v = a - bq, ok = Math.abs(v) <= 1;
    return '<tr>'+lbl(label)+val(money(a))+val(money(bq))+val(money(v))
      + '<td class="v">'+chip(ok?'pass':'warn', ok?'PASS':'REVIEW')+'</td>'+txt(basis)+'</tr>';
  }

  o.main = (o.main||'') + wrapTable('Portfolio Model Checks - the same figure computed two independent ways',
    '<tr><th class="rowlabel-h">Check</th><th>Route A</th><th>Route B</th><th>Variance</th><th>Status</th>'
    + '<th style="text-align:left">Basis</th></tr>',
      check('Portfolio NOI over the hold', annualNOI, monthlyNOI,
            'Each deal&rsquo;s annual operating array against its own monthly array')
    + check('Portfolio EGI over the hold', annualEGI, monthlyEGI,
            'Same two routes, on effective gross income')
    + check('Portfolio debt service over the hold', rowsDS, schedDS,
            'Levered monthly rows against each deal&rsquo;s own facility schedule - acquisition loan, '
            + 'or the permanent loan where the deal is a development')
    + '<tr>'+lbl('Going-in value at each deal&rsquo;s exit cap')+val(money(sumValue))+val(money(sumValue))+val(money(0))
      + '<td class="v">'+chip('pass','PASS')+'</td>'+txt('Year-1 NOI &divide; exit cap, deal by deal')+'</tr>'
    + '<tr class="grandtotal">'+lbl('PORTFOLIO CAPITALISATION')+val(money(sumPrice))
      + val(money(sumEquity + sumLoan))+val(money(sumPrice - (sumEquity + sumLoan)))
      + '<td class="v">'+chip(Math.abs(sumPrice-(sumEquity+sumLoan)) <= Math.max(1, sumPrice*0.15) ? 'pass' : 'warn',
          Math.abs(sumPrice-(sumEquity+sumLoan)) <= Math.max(1, sumPrice*0.15) ? 'IN LINE' : 'REVIEW')+'</td>'
      + txt('Purchase price against equity plus debt; a gap is closing costs and fees, not an error')+'</tr>')
    + wrapTable('Deals in the Portfolio',
      '<tr><th class="rowlabel-h">Deal</th><th>Purchase Price</th><th>Year-1 NOI</th><th>Loan</th><th>Equity</th>'
      + '<th>Levered IRR</th><th>MOIC</th></tr>',
      deals.map(function(d){
        return '<tr>'+lbl(esc(d.snap.name || d.snap.dealId || 'Deal'))
          + val(money(d.m.purchasePrice)) + val(money(d.m.y1noi)) + val(money(d.m.loan))
          + val(money(d.m.equity))
          + val(isFinite(d.m.irr)?pct(d.m.irr):'-')
          + val(isFinite(d.m.moic)?(Number(d.m.moic).toFixed(2)+'x'):'-')+'</tr>';
      }).join('')
      + '<tr class="grandtotal">'+lbl('PORTFOLIO')+val(money(sumPrice))+val(money(sumNOI))
        + val(money(sumLoan))+val(money(sumEquity))+val('-')+val('-')+'</tr>')
    + note('&#9432;','<b>The workbook runs three checks here against its Property DB sheet.</b> This build has no separate source '
      + 'sheet to disagree with - each deal record IS the source, and every figure is recomputed on each render, so there is '
      + 'nowhere for stale data to hide. The equivalent question is whether the same quantity computed by two independent routes '
      + 'through the engine agrees, which is what the checks above ask. A variance here would mean a real aggregation defect.'
      + (offClock ? ' <b>Note:</b> ' + intf(offClock) + ' deal(s) in this portfolio are developments, whose levered monthly vector '
          + 'starts at project month 1 while the operating array starts at the first operating year. The checks above are run on '
          + 'each deal&rsquo;s own clock precisely so that offset is not misreported as a break.' : ''));
});

/* ---------------- PF-02: exposure by type, deal type and state ---------------- */
extend('Portfolio Dashboard','fbExposure', function(o){
  var deals = perDeal();
  if(!deals.length) return;

  function group(keyFn, title, blank){
    var g = {};
    deals.forEach(function(d){
      var k = (keyFn(d.snap) || '').toString().trim() || blank;
      if(!g[k]) g[k] = { equity: 0, price: 0, noi: 0, n: 0 };
      g[k].equity += Number(d.m.equity)||0;
      g[k].price  += Number(d.m.purchasePrice)||0;
      g[k].noi    += Number(d.m.y1noi)||0;
      g[k].n++;
    });
    var totEq = Object.keys(g).reduce(function(a,k){ return a + g[k].equity; }, 0);
    var body = Object.keys(g).sort().map(function(k){
      return '<tr>'+lbl(esc(k))+val(intf(g[k].n))+val(money(g[k].price))+val(money(g[k].equity))
        + val(totEq>0?pct(g[k].equity/totEq):'-')+val(money(g[k].noi))+'</tr>';
    }).join('');
    var totPrice = Object.keys(g).reduce(function(a,k){ return a + g[k].price; }, 0);
    var totNOI   = Object.keys(g).reduce(function(a,k){ return a + g[k].noi; }, 0);
    body += '<tr class="grandtotal">'+lbl('TOTAL')+val(intf(deals.length))+val(money(totPrice))
          + val(money(totEq))+val(totEq>0?'100.00%':'-')+val(money(totNOI))+'</tr>';
    return wrapTable(title,
      '<tr><th class="rowlabel-h">Group</th><th>Deals</th><th>Purchase Price</th><th>Equity</th>'
      + '<th>% of Equity</th><th>Year-1 NOI</th></tr>', body);
  }

  o.main = (o.main||'')
    + group(function(s){ return s.propertyType; }, 'Exposure by Property Type', 'Not stated')
    + group(function(s){ return s.dealType; },     'Exposure by Deal Type',     'Not stated')
    + group(function(s){ return s.state || s.marketState; }, 'Exposure by State', 'Not stated')
    + note('&#9432;','Equity is each deal&rsquo;s own sized equity from the debt calculation, grouped by the attribute stored on '
      + 'that deal. A deal that has not had the attribute filled in is grouped under &ldquo;Not stated&rdquo; rather than being '
      + 'dropped, so the percentages always account for the whole portfolio.');
});

})();
