/* The one-page waterfall summary (US Letter portrait): a button on the Equity Waterfall pages opens it for print / PDF.
   The page itself is built in src/145 from the same monthly waterfall the investor summary uses (bkWaterfallSummaryHTML). */
(function(){
function wrap(sheet){
  var prev = RENDERERS[sheet]; if(typeof prev !== 'function') return;
  RENDERERS[sheet] = function(){ var o = prev.apply(this, arguments); if(!o || typeof o.main !== 'string') return o;
    o.main = '<div class="ae-row" style="margin:0 0 10px"><button type="button" class="ae-btn pri" onclick="bkWaterfallSummaryOpen(true)">Waterfall report (full tier breakdown)</button><button type="button" class="ae-btn" onclick="bkWaterfallSummaryOpen()">Waterfall summary (1 page)</button><span class="ae-unit">The report shows every tier by year: balance, return required, distributions to LP and GP, total and cash flow remaining. The summary is one Letter page.</span></div>' + o.main; return o; };
}
wrap('Equity Waterfall'); wrap('Waterfall (M)');
})();
