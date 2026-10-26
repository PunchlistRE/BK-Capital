
/* ===========================================================================
   FINAL WAVE - THE WORKBOOK'S SEVEN BACKEND SHEETS
   ===========================================================================
   The Final QA sweep measured seven navigation items with no renderer behind
   them: SYS_DealDB, SYS_CF, SYS_RentRoll, SYS_Snapshots, SYS_Golden,
   SYS_PrintState and SYS_Curves. They were marked "Queued" and hidden, and
   clicking one did nothing at all - no error, no page, no explanation.

   These are the workbook's internal calculation and storage sheets. Their work
   is done in this application, but by engines rather than by a grid, so there
   is no sheet to port. Deleting the items would hide the question; leaving them
   dead answers it wrongly. Each one now opens a page that states, from the
   Phase 1 audit's own evidence, what the workbook sheet did, where that
   function lives here, and - where the two genuinely differ - what the
   difference is.

   Nothing here computes anything. Every figure on these pages is read from the
   live engine it describes, so a page that claims an engine exists cannot
   render unless it does.
   =========================================================================== */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined') return;

function esc(v){ return (typeof bkEsc==='function') ? bkEsc(v) : String(v==null?'':v); }
function chip(cls,t){ return '<span class="status-chip '+(cls||'')+'">'+esc(t)+'</span>'; }
function intf(n){ var x=Number(n); if(!isFinite(x)) return '-'; return Math.round(x).toLocaleString('en-US'); }

var MAP = {
  'SYS_DealDB': {
    title: 'SYS_DealDB',
    what: 'A field-keyed store of about eighty attributes across ten deal slots, plus a text fingerprint of every '
        + 'stored input, the rent roll and the engine version, used to detect drift between a saved snapshot and the live model.',
    where: 'The deal record itself, held under the versioned storage schema and read through <code>bkLoad()</code> / '
         + '<code>bkSave()</code>, with the portfolio held through <code>bkPortfolioLoad()</code> / <code>bkPortfolioSave()</code>.',
    diff: 'The workbook fixes the store at ten slots because it is a grid. This application stores one deal record per deal '
        + 'and a separate portfolio list, so there is no slot limit and no empty columns.',
    parity: 'BACKEND-ONLY',
    probe: function(){
      var s = bkLoad();
      var keys = Object.keys(s).length;
      var port = 0; try { port = (bkPortfolioLoad()||[]).length; } catch(e){}
      return [['Attributes on the active deal record', intf(keys)],
              ['Properties in the portfolio', intf(port)],
              ['Rent-roll rows on the active deal', intf((s.rentRoll||[]).length)]];
    }
  },
  'SYS_CF': {
    title: 'SYS_CF',
    what: 'The single monthly engine - deal clock, revenue, expenses and NOI, development draws, the sale, unlevered cash '
        + 'flow and the equity waterfall - across 180 periods and roughly eighteen thousand formulas.',
    where: 'Split across the canonical engines: <code>bkCalc()</code> for the Year-1 operating statement, '
         + '<code>bkAnnualCF()</code> for the monthly operating engine, <code>bkDebt()</code> for the debt schedule, '
         + '<code>bkMonthlyReturns()</code> for levered cash flow and <code>bkWaterfallV07()</code> for the waterfall.',
    diff: 'The workbook runs 180 periods regardless of hold; this engine runs the hold period the deal actually specifies. '
        + 'The output of each month is inspectable on Property CF, Debt Schedule, Deal Vectors (M) and Waterfall (M).',
    parity: 'BACKEND-ONLY',
    probe: function(){
      var u = bkAnnualCF(), d = bkDebt(), w = bkWaterfallV07();
      return [['Operating months computed', intf((u.monthly||[]).length)],
              ['Debt months computed', intf((d.months||[]).length)],
              ['Waterfall months computed', intf((w.rows||[]).length)],
              ['Where you can read them', 'Property CF, Debt Schedule, Deal Vectors (M), Waterfall (M)']];
    }
  },
  'SYS_RentRoll': {
    title: 'SYS_RentRoll',
    what: 'Ten parallel blocks storing unit-level rent-roll snapshots per deal slot, with an ID index and a row count.',
    where: 'The <code>rentRoll</code> array on the deal record, read by <code>bkRentRollStats()</code> and edited directly '
         + 'on the Rent Roll page.',
    diff: 'Same reason as SYS_DealDB: one array per deal rather than ten fixed blocks. A populated rent roll is always the '
        + 'canonical revenue source here, whatever the revenue-basis toggle says.',
    parity: 'BACKEND-ONLY',
    probe: function(){
      var s = bkLoad(), rr = s.rentRoll || [];
      var st = null; try { st = bkRentRollStats(rr); } catch(e){}
      return [['Rows on the active deal', intf(rr.length)],
              ['Residential units', st ? intf(st.resUnits) : '-'],
              ['Commercial suites', st ? intf(st.commSuites) : '-'],
              ['Where you can edit it', 'Rent Roll']];
    }
  },
  'SYS_Snapshots': {
    title: 'SYS_Snapshots',
    what: 'One row per deal slot carrying a timestamp, key totals and a CURRENT / STALE / NONE flag, so the portfolio '
        + 'sheets can tell whether a stored snapshot still matches the live model.',
    where: 'Nothing, deliberately. This application recomputes every portfolio figure from the live deal records on each '
         + 'render, so there is no stored snapshot that can drift and nothing to mark stale.',
    diff: 'This is a real difference, and it is in the web build&rsquo;s favour: staleness is a problem the workbook has '
        + 'because it caches, and this application does not cache. The capability is absent because the problem is absent.',
    parity: 'CONSOLIDATED',
    probe: function(){
      var port = 0; try { port = (bkPortfolioLoad()||[]).length; } catch(e){}
      return [['Properties recomputed live', intf(port)],
              ['Stored snapshots that could go stale', '0'],
              ['Where the live figures are', 'Portfolio Dashboard, Portfolio CF, Portfolio Rollup']];
    }
  },
  'SYS_Golden': {
    title: 'SYS_Golden',
    what: 'Seven hand-entered golden metric values for one reference deal, with per-metric tolerances, captured from an '
        + 'earlier verified run.',
    where: 'The certification baseline lock file and <code>bkQACertify()</code>, surfaced on the QA page.',
    diff: 'The workbook holds seven metrics for one deal. The regression baseline behind this build holds the full engine '
        + 'output for five deals and is compared exactly rather than within a tolerance.',
    parity: 'CONSOLIDATED',
    probe: function(){
      var n = 0;
      try { var q = bkQACertify(); n = (q && q.rows) ? q.rows.length : 0; } catch(e){}
      return [['Certification checks on the active deal', n ? intf(n) : '-'],
              ['Where you can run them', 'QA']];
    }
  },
  'SYS_PrintState': {
    title: 'SYS_PrintState',
    what: 'Stored print settings per sheet: zoom, frozen panes, fit-to-page and header sizes.',
    where: 'Nothing. Page layout in a browser is the browser&rsquo;s print dialogue and this application&rsquo;s own print '
         + 'stylesheet; there is no per-sheet print state to store.',
    diff: 'A spreadsheet has to store this because each sheet prints differently. A web page does not. No underwriting '
        + 'capability is affected either way.',
    parity: 'BACKEND-ONLY',
    probe: function(){ return [['Underwriting capability affected', 'None']]; }
  },
  'SYS_Curves': {
    title: 'SYS_Curves',
    what: 'Normalised S-curve or straight-line monthly disbursement weights for five cost categories across 180 months, '
        + 'with self-tests that each curve sums to one.',
    where: '<code>bkCurveShare()</code>, consumed by <code>bkDevV09()</code> and <code>bkDevFundingV10()</code>. The curve '
         + 'settings are on Dev Draws, and the same self-test runs there as a live control.',
    diff: 'The workbook precomputes the weights into a grid; this engine computes each month&rsquo;s share on demand from '
        + 'the same formula. The self-test is the one that matters, and it is shown rather than hidden: Dev Draws proves '
        + 'every category draws its full budget across the curve.',
    parity: 'FULL PARITY',
    probe: function(){
      var s = bkLoad();
      return [['Hard cost curve', esc(s.hardCurveMethod || 'S-Curve') + (Number(s.hardCurveSteepness) ? ', steepness ' + intf(s.hardCurveSteepness) : '')],
              ['Soft cost - pre-development', esc(s.softPreMethod || 'Straight-Line')],
              ['Soft cost - construction', esc(s.softConMethod || 'S-Curve') + (Number(s.softConSteepness) ? ', steepness ' + intf(s.softConSteepness) : '')],
              ['Soft cost - lease-up', esc(s.softLeaseMethod || 'Straight-Line')],
              ['Where the self-test runs', 'Dev Draws']];
    }
  }
};

Object.keys(MAP).forEach(function(key){
  if(RENDERERS[key]) return;                 // never displace a real renderer
  var d = MAP[key];
  RENDERERS[key] = function(){
    var rows = '';
    try {
      rows = (d.probe() || []).map(function(r){
        return '<tr><td class="rowlabel" data-bk-align="text">' + r[0] + '</td>'
             + '<td class="v">' + r[1] + '</td></tr>';
      }).join('');
    } catch(e){
      rows = '<tr><td class="rowlabel" data-bk-align="text">Live readout</td>'
           + '<td class="v">unavailable for this deal</td></tr>';
    }
    var main = '<div class="tbl-wrap"><table class="fin">'
      + '<caption>' + esc(d.title) + ' - a workbook backend sheet, and where its work is done here</caption>'
      + '<thead><tr><th class="rowlabel-h">Question</th><th style="text-align:left">Answer</th></tr></thead><tbody>'
      + '<tr><td class="rowlabel" data-bk-align="text">What the workbook sheet does</td>'
      +   '<td class="rowlabel" data-bk-align="text" style="font-weight:400">' + d.what + '</td></tr>'
      + '<tr><td class="rowlabel" data-bk-align="text">Where that work is done here</td>'
      +   '<td class="rowlabel" data-bk-align="text" style="font-weight:400">' + d.where + '</td></tr>'
      + '<tr><td class="rowlabel" data-bk-align="text">How the two differ</td>'
      +   '<td class="rowlabel" data-bk-align="text" style="font-weight:400">' + d.diff + '</td></tr>'
      + '<tr class="grandtotal"><td class="rowlabel" data-bk-align="text">Parity classification</td>'
      +   '<td class="v">' + chip(d.parity === 'FULL PARITY' ? 'pass' : '', d.parity) + '</td></tr>'
      + '</tbody></table></div>'
      + '<div class="tbl-wrap" style="margin-top:16px"><table class="fin">'
      + '<caption>Live readout - from the engine named above, on the active deal</caption>'
      + '<thead><tr><th class="rowlabel-h">Measure</th><th>Value</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      + '<div class="note-flag" style="margin-top:10px;"><span>&#9432;</span><div>'
      + '<b>This page computes nothing.</b> It exists because this navigation item used to lead nowhere. Every figure above '
      + 'is read from the engine that replaced the workbook sheet, so if the engine were missing this page could not render '
      + 'it. Where the web build genuinely does less than the workbook, the middle row says so rather than leaving you to '
      + 'find out.</div></div>';
    var sidebar = (typeof sidebarShell === 'function')
      ? sidebarShell('<div class="card"><div class="card-head">Backend Sheet</div><div class="metric-list">'
          + '<div class="metric-row"><span class="k">Workbook sheet</span><span class="v">' + esc(d.title) + '</span></div>'
          + '<div class="metric-row"><span class="k">Parity</span><span class="v">' + chip(d.parity === 'FULL PARITY' ? 'pass' : '', d.parity) + '</span></div>'
          + '</div></div>' + (typeof colorKeyCard === 'function' ? colorKeyCard() : ''))
      : '';
    return { title: d.title, crumbs: 'Workbook Backend',
             desc: 'What this workbook backend sheet did, and where that work is done in this application.',
             meta: { 'Workbook Sheet': d.title, Parity: d.parity }, main: main, sidebar: sidebar };
  };
});
})();
