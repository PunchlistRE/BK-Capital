/* Report pages that were built on the card tables (After-Tax Report, Refinance Report) take the statement style of the Cash Flow, Sources and Uses and Valuation reports.
   The renderers are wrapped only to mark their output with a class; the CSS lives in src/186 (.rp-stmt). Nothing here changes a figure. */
(function(){
function wrap(sheet){ var prev = RENDERERS[sheet]; if(typeof prev !== 'function') return;
  RENDERERS[sheet] = function(){ var o = prev.apply(this, arguments); if(!o || typeof o.main !== 'string') return o; o.main = '<div class="rp-stmt">' + o.main + '</div>'; return o; }; }
wrap('After-Tax Report'); wrap('Refinance Report');
})();
