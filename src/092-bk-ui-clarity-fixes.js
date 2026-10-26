
/* ===========================================================================
   UI CLARITY FIXES - three defects found by the MAPLE-TEST-01 validation
   ===========================================================================

   FIX 1 - STATIC REFERENCE BASELINES PRESENTED AS THE ACTIVE DEAL'S.
   The validation found this on THREE surfaces, not one, each carrying a
   DIFFERENT captured reference deal:

     Returns    "Excel (SYS_CF, recalculated)"  9.82% / 2.05x / 13.04% / 2.74x
                                                / $3,723,600 / $13,820,088
     Sponsor CF "Workbook Baseline"             $2,850,730 / $4,921,372 / ...
     QA         "Excel Baseline"                6.70% / 1.709x / 6.10% / 1.726x
                                                / 5,701,460 / 13,254,725

   All three were byte-identical on MAPLE-TEST-01, Harvard and ShorePointe.
   None of them varies with the active deal, and none carries any record of
   WHICH deal it was captured from - so it cannot be matched to the deal on
   screen even in principle.

   The QA one was the dangerous one: its caption reads "Active Deal", it has
   Variance and Status columns, and on MAPLE it stamped REVIEW on all six
   metrics against an unrelated property. A correct engine was being reported
   as suspect.

   What this fix does:
     - Returns and Sponsor CF: the comparison column is REMOVED. It was never a
       gate, it never varied, and it cannot be attributed to any deal.
     - QA: the comparison is put behind an explicit control, default OFF. With
       it off the page shows the live engine and its own self-tests and gates,
       which is what actually certifies this build. With it on, the caption and
       every row say plainly that the figures belong to a fixed historical
       reference and not to the active deal.
   No engine, no figure and no reconciliation is touched by any of this.

   FIX 2 - BAD DEBT HAD NO INPUT ROW.
   badDebtPct defaults to 0.50% and is read by both bkCalc() and the monthly
   engine, but there was no way to see or change it on Deal Underwrite. On
   MAPLE that silently removed $5,000 of Year-1 NOI. The field already existed
   and already propagated; it simply had no control. One is added next to
   vacancy, which is where it belongs.

   FIX 3 - "LTV" DID NOT SAY WHAT THE V WAS.
   The engine is right and is doing something sensible: it sizes LTV against
   UNDERWRITTEN VALUE (Year-1 NOI capitalised at the exit cap), which is how a
   lender sizes. But a user typing 65% against a $10,000,000 purchase price
   reasonably expects $6,500,000 and gets $6,136,000, because the app valued
   the property at $9,440,000. The labels now say which basis each constraint
   uses, and the Debt page shows the value the LTV test is actually applied to
   alongside the cost the LTC test uses.
   =========================================================================== */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined') return;

function esc(v){ return (typeof bkEsc==='function') ? bkEsc(v) : String(v==null?'':v); }
function money(n){
  var x=Number(n); if(!isFinite(x)) return '-';
  if(Object.is(x,-0)) x=0;
  var neg=x<0, a=Math.abs(x);
  var body = a<100 ? a.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
                   : a.toLocaleString('en-US',{maximumFractionDigits:0});
  return neg ? '($'+body+')' : '$'+body;
}
function pct(n){ var x=Number(n); if(!isFinite(x)) return '-'; return (x*100).toFixed(2)+'%'; }
function chip(cls,t){ return '<span class="status-chip '+(cls||'')+'">'+esc(t)+'</span>'; }
function note(sym,html){ return '<div class="note-flag" style="margin-top:10px;"><span>'+sym+'</span><div>'+html+'</div></div>'; }

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
    try { fn(o); } catch(e){
      o.main = (o.main||'') + note('&#9888;','A clarity fix could not be applied: '+esc(e.message)
        + '. The figures above are unaffected.');
    }
    return o;
  };
  wrapped['__'+tag] = true; wrapped.__bkOriginal = prev.__bkOriginal || prev;
  Object.keys(prev).forEach(function(k){ if(k.indexOf('__')===0 && !wrapped[k]) wrapped[k] = prev[k]; });
  if(typeof window.bkRegisterRenderer==='function') window.bkRegisterRenderer(sheet, wrapped);
  else RENDERERS[sheet] = wrapped;
  return true;
}

/* Parse the renderer's HTML, hand the caller a live document, serialise back.
   Every transform below is a DOM edit on already-rendered output - no figure is
   recomputed anywhere in this file. */
function transform(html, fn){
  if(!html || html.indexOf('<table') === -1) return html;
  var doc = new DOMParser().parseFromString('<div id="bkroot">' + html + '</div>', 'text/html');
  var root = doc.getElementById('bkroot');
  if(!root) return html;
  fn(root, doc);
  return root.innerHTML;
}
function tableByCaption(root, re){
  var ts = root.querySelectorAll('table');
  for(var i=0;i<ts.length;i++){
    var cap = ts[i].querySelector('caption');
    if(cap && re.test(cap.textContent)) return ts[i];
  }
  return null;
}
/* Drop one column, header and body, from a table. */
function dropColumn(tbl, index){
  if(!tbl) return false;
  var hrow = tbl.querySelector('thead tr');
  if(hrow && hrow.children[index]) hrow.removeChild(hrow.children[index]);
  var rows = tbl.querySelectorAll('tbody tr');
  for(var i=0;i<rows.length;i++){
    var cells = rows[i].children;
    // a colspan row (an empty-state message) has no per-column cell to drop
    if(cells.length > index && !cells[index].hasAttribute('colspan')) rows[i].removeChild(cells[index]);
  }
  return true;
}

/* =====================================================================
   FIX 1a - RETURNS: remove the unattributable comparison column
   ===================================================================== */
extend('Returns','clarityReturns', function(o){
  var removed = false;
  o.main = transform(o.main, function(root){
    var t = tableByCaption(root, /Return Summary/);
    if(!t) return;
    var hrow = t.querySelector('thead tr');
    if(!hrow) return;
    var idx = -1;
    for(var i=0;i<hrow.children.length;i++){
      if(/Excel|Workbook|Baseline/i.test(hrow.children[i].textContent)) { idx = i; break; }
    }
    if(idx < 0) return;
    removed = dropColumn(t, idx);
  });
  if(removed){
    o.main = (o.main||'') + note('&#9432;','<b>A static comparison column was removed from this table.</b> It read '
      + '&ldquo;Excel (SYS_CF, recalculated)&rdquo; and showed 9.82% / 2.05x / 13.04% / 2.74x / $3,723,600 / $13,820,088 on '
      + '<i>every</i> deal, because those six figures were literal text rather than anything read from the active deal. It '
      + 'carried no record of which property it was captured from, so it could not be matched to this one even in principle. '
      + 'The figures above are live and unchanged. Engine certification lives in the regression harness, which compares the '
      + 'full engine output across five deals on every build.');
  }
});

/* =====================================================================
   FIX 1b - SPONSOR CF: same column, same treatment, plus a degenerate-
   return guard the validation also surfaced
   ===================================================================== */
extend('Sponsor CF','claritySponsor', function(o){
  var removed = false, gpZero = false;
  try {
    var sp = bkSponsorV08();
    gpZero = !(Math.abs(Number(sp.gpContrib)||0) > 1);
  } catch(e){}
  o.main = transform(o.main, function(root){
    var t = tableByCaption(root, /Sponsor Economics Summary/);
    if(t){
      var hrow = t.querySelector('thead tr');
      if(hrow){
        var idx = -1;
        for(var i=0;i<hrow.children.length;i++){
          if(/Workbook|Excel|Baseline/i.test(hrow.children[i].textContent)) { idx = i; break; }
        }
        if(idx >= 0) removed = dropColumn(t, idx);
      }
      // A sponsor return computed on zero sponsor capital is not a return. The
      // validation deal has no GP co-investment and this table reported a
      // 450.00% XIRR, which is an artefact of dividing by nothing.
      if(gpZero){
        var rows = t.querySelectorAll('tbody tr');
        for(var r=0;r<rows.length;r++){
          var label = rows[r].children[0] ? rows[r].children[0].textContent : '';
          if(/XIRR|Multiple/i.test(label) && rows[r].children[1]){
            rows[r].children[1].innerHTML = '<span class="status-chip">NO SPONSOR CAPITAL</span>';
          }
        }
      }
    }
  });
  var msg = '';
  if(removed) msg += '<b>A static &ldquo;Workbook Baseline&rdquo; column was removed from the summary above.</b> It showed the '
    + 'same $2,850,730 / $4,921,372 / $296,232 on every deal - a captured reference with no recorded deal identity. ';
  if(gpZero) msg += '<b>This deal has no GP co-investment</b>, so a sponsor return on sponsor capital has no denominator. Those '
    + 'rows now say so instead of reporting a figure derived from dividing by zero. Fee income and promote, where they exist, '
    + 'are still shown in full.';
  if(msg) o.main = (o.main||'') + note('&#9432;', msg);
});

/* =====================================================================
   FIX 1c - QA: the comparison becomes explicit and opt-in
   ===================================================================== */
if(typeof BK_BASE !== 'undefined' && !('qaReferenceCompare' in BK_BASE)) BK_BASE.qaReferenceCompare = 'Off';

extend('QA','clarityQA', function(o){
  var s = bkLoad();
  var on = String(s.qaReferenceCompare || 'Off') === 'On';
  o.main = transform(o.main, function(root){
    var t = tableByCaption(root, /Certification/);
    if(!t) return;
    var cap = t.querySelector('caption');
    if(!on){
      if(cap) cap.textContent = 'Live Engine Results - Active Deal';
      var hrow = t.querySelector('thead tr');
      // drop Status, Variance, Excel Baseline - highest index first so the
      // earlier indices stay valid while removing
      if(hrow){
        var kill = [];
        for(var i=0;i<hrow.children.length;i++){
          if(/Excel|Baseline|Variance|Status/i.test(hrow.children[i].textContent)) kill.push(i);
        }
        kill.sort(function(a,b){ return b-a; }).forEach(function(i){ dropColumn(t, i); });
      }
    } else if(cap){
      cap.textContent = 'Comparison against a FIXED HISTORICAL REFERENCE - not the active deal';
    }
  });
  o.main = (o.main||'')
    + '<div class="tbl-wrap" style="margin-top:16px"><table class="fin">'
    + '<caption>Reference Comparison</caption>'
    + '<thead><tr><th class="rowlabel-h">Setting</th><th>Value</th>'
    + '<th style="text-align:left">What it does</th><th>Status</th></tr></thead><tbody>'
    + '<tr><td class="rowlabel" data-bk-align="text">Compare against the stored reference deal</td>'
    + '<td class="v"><select onchange="bkSetQAReferenceCompare(this.value)">'
    +   '<option'+(on?'':' selected')+'>Off</option>'
    +   '<option'+(on?' selected':'')+'>On</option></select></td>'
    + '<td class="rowlabel" data-bk-align="text" style="font-weight:400;opacity:.8">'
    +   'Shows a set of figures captured once from one reference property, with variance and a status chip</td>'
    + '<td class="v">'+chip(on?'warn':'pass', on?'REFERENCE SHOWN':'LIVE ENGINE ONLY')+'</td></tr>'
    + '</tbody></table></div>'
    + note(on ? '&#9888;' : '&#9432;', on
        ? '<b>The reference figures are NOT this deal.</b> They were captured once from one property and carry no record of '
          + 'which one, so the Variance and Status columns are comparing your deal against a different property. A REVIEW chip '
          + 'here means the two properties differ, which they will. Turn this off unless you are deliberately looking at the '
          + 'historical reference.'
        : '<b>This page shows the live engine for the active deal.</b> The comparison column that used to sit here was a fixed '
          + 'set of figures captured from one reference property - identical on every deal, with no record of which '
          + 'property it came from. On a correct deal it stamped REVIEW on all six metrics, which is exactly backwards. It is '
          + 'available above if you want it, clearly labelled. <b>Real certification is the regression harness:</b> full engine '
          + 'output compared across five deals, plus the workbook reader checked cell by cell, on every build. The Certification '
          + 'Gates and Engine Self-Tests below are live and unaffected.');
});
window.bkSetQAReferenceCompare = function(v){
  var s = bkLoad(); s.qaReferenceCompare = (String(v) === 'On') ? 'On' : 'Off'; bkSave(s);
  if(typeof showSheet==='function') showSheet(typeof currentSheet!=='undefined'?currentSheet:'QA');
};

/* =====================================================================
   FIX 2 + FIX 3 - DEAL UNDERWRITE: a bad-debt control, and labels that
   say which basis each debt constraint uses
   ===================================================================== */
extend('Deal Underwrite','clarityInputs', function(o){
  var added = false, relabelled = 0;
  o.main = transform(o.main, function(root, doc){
    // ---- FIX 2: insert a bad-debt row immediately after vacancy ----
    if(!root.querySelector('tr.input[data-bk-key="badDebtPct"]')){
      var vac = root.querySelector('tr.input[data-bk-key="vacancy"]');
      if(vac && vac.parentNode){
        var v = 0;
        try { v = Number(bkLoad().badDebtPct) || 0; } catch(e){}
        var tr = doc.createElement('tr');
        tr.className = 'input';
        tr.setAttribute('data-bk-key', 'badDebtPct');
        tr.setAttribute('data-bk-fmt', 'pct');
        tr.innerHTML = '<td class="rowlabel" data-bk-align="text">Bad Debt / Credit Loss</td>'
          + '<td class="v" data-bk-align="num">' + (v*100).toFixed(2) + '%</td>'
          + '<td data-bk-align="text">' + (bkConventions(bkLoad()).cvBadDebtBasis === 'afterVacancy' ? '% of rent after vacancy' : '% of gross potential rent') + '</td>'
          + '<td data-bk-align="text"><span class="status-chip pass">OK</span></td>';
        vac.parentNode.insertBefore(tr, vac.nextSibling);
        added = true;
      }
    }
    // ---- FIX 3: say what the V and the C are ----
    // MEASURED, not assumed: acqLTC is applied to the TOTAL COST BASIS, not to the
    // purchase price. At 65% with a $10,000,000 price it returns $6,500,000 with no
    // closing costs, $6,695,000 at 3% closing costs, and $6,760,000 at 3% closing plus
    // a 1% acquisition fee - 65% of price x (1 + closing% + fee%) every time. Labelling
    // it "% of purchase price" would have been a new mislabel replacing the old one,
    // correct only on a deal with no acquisition costs.
    var relabel = { acqLTV: 'Acq Loan - Max LTV (% of ' + window.bkLtvBasisLabel(bkLoad(), true).replace(/^./, function(c){ return c.toUpperCase(); }) + ')',
                    acqLTC: 'Acq Loan - Max LTC (% of Total Cost Basis)',
                    conLTC: 'Construction Max LTC (% of Cost)',
                    conLTV: 'Construction Max LTSV (% of Stabilized Value)',
                    permLTV:'Permanent Max LTV (% of Stabilized Value)' };
    Object.keys(relabel).forEach(function(k){
      var row = root.querySelector('tr.input[data-bk-key="'+k+'"]');
      if(row && row.children[0]){ row.children[0].textContent = relabel[k]; relabelled++; }
    });
  });
  if(added || relabelled){
    var s = bkLoad(), c = null;
    try { c = bkCalc(); } catch(e){}
    var noi = c ? (Number(c.noi)||0) : 0;
    var cap = Number(s.exitCap)||0;
    var price = Number(s.purchasePrice)||0;
    var _lb = bkConventions(s).cvLtvBasis, _uv = cap > 0 ? noi/cap : NaN;
    var uwValue = _lb === 'price' ? price : _lb === 'lesser' ? (isFinite(_uv) ? Math.min(price, _uv) : price) : _uv;
    // total cost basis = price plus closing costs plus the acquisition fee, which is
    // what the LTC constraint is measured against
    var basisCost = price * (1 + (Number(s.closingCostsPct)||0) + (Number(s.acqFeePct)||0));
    o.main = (o.main||'')
      + '<div class="tbl-wrap" style="margin-top:16px"><table class="fin bk-constraint-grid">'
      + '<caption>What Each Debt Constraint Is Measured Against</caption>'
      + '<thead><tr><th class="rowlabel-h">Constraint</th><th>Basis</th><th>Rate</th>'
      + '<th>Maximum Loan It Allows</th></tr></thead><tbody>'
      + '<tr><td class="rowlabel" data-bk-align="text">Max LTV - ' + window.bkLtvBasisLabel(s, true).toUpperCase() + '</td>'
      +   '<td class="v">'+(isFinite(uwValue)?money(uwValue):'-')+'</td>'
      +   '<td class="v" data-bk-align="num">'+pct(Number(s.acqLTV))+'</td>'
      +   '<td class="v">'+(isFinite(uwValue)?money(uwValue*(Number(s.acqLTV)||0)):'-')+'</td></tr>'
      + '<tr><td class="rowlabel" data-bk-align="text">Max LTC - total COST BASIS</td>'
      +   '<td class="v">'+money(basisCost)+'</td>'
      +   '<td class="v" data-bk-align="num">'+pct(Number(s.acqLTC))+'</td>'
      +   '<td class="v">'+money(basisCost*(Number(s.acqLTC)||0))+'</td></tr>'
      + '<tr><td class="rowlabel" data-bk-align="text">Min DSCR</td>'
      +   '<td class="v">Year-1 NOI '+money(noi)+'</td>'
      +   '<td class="v" data-bk-align="num">'+(Number(s.acqDSCR)||0).toFixed(2)+'x</td>'
      +   '<td class="v">'+chip('','sized by coverage')+'</td></tr>'
      + '</tbody></table></div>'
      + (_lb === 'price' ? note('&#9432;','<b>LTV is measured against the purchase price</b> (this deal&rsquo;s LTV basis setting). '
        + 'LTC is measured against the total cost basis and DSCR against Year-1 NOI; the loan is the lowest of them.') :
        note('&#9432;','<b>Underwritten value is not the purchase price.</b> It is Year-1 NOI capitalised at the exit cap - '
        + (isFinite(_uv) ? (money(noi)+' &divide; '+pct(cap)+' = '+money(_uv)) : 'NOI &divide; exit cap')
        + ' - which is how a lender sizes against value rather than against what you paid. '
        + (isFinite(uwValue) && price > 0 && Math.abs(uwValue-price) > price*0.005
            ? 'On this deal the two differ by ' + money(Math.abs(uwValue-price)) + ', so an LTV percentage and an LTC '
              + 'percentage of the same number give different loans. '
            : '')
        + 'The loan is sized at the <b>lowest</b> of the three constraints above. If you mean a percentage of what the '
        + 'deal <b>costs you</b>, that is <b>Max LTC</b> - note that it is measured against the total cost basis '
        + '(price plus closing costs plus acquisition fee'
        + (Math.abs(basisCost - price) > 1 ? ' = ' + money(basisCost) + ' here, not the ' + money(price) + ' price'
                                           : ', which equals the price on this deal because both are zero')
        + '), so 65% of basis is only 65% of price when there are no acquisition costs.'
        + (added ? ' <b>Bad debt / credit loss is now editable above</b>, next to vacancy. It defaults to 0.50% and it does '
                 + 'affect NOI, so it was reducing revenue with no way to see or change it.' : '')));
  }
});

})();
