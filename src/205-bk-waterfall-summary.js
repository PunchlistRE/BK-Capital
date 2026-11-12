/* The one-page waterfall summary (US Letter portrait): a button on the Equity Waterfall pages opens it for print / PDF.
   The page itself is built in src/145 from the same monthly waterfall the investor summary uses (bkWaterfallSummaryHTML). */
(function(){
function wrap(sheet){
  var prev = RENDERERS[sheet]; if(typeof prev !== 'function') return;
  RENDERERS[sheet] = function(){ var o = prev.apply(this, arguments); if(!o || typeof o.main !== 'string') return o;
    o.main = '<div class="ae-row" style="margin:0 0 10px"><button type="button" class="ae-btn pri" onclick="bkWaterfallSummaryOpen()">Waterfall summary (1 page)</button><button type="button" class="ae-btn" onclick="bkWaterfallSummaryOpen(true)">Waterfall report (every tier, by year)</button><span class="ae-unit">The report shows every tier by year: balance, return required, distributions to LP and GP, total and cash flow remaining. The summary is one Letter page.</span></div>' + o.main; return o; };
}
/* the Waterfall Report page on the Reports tab: the one-page summary shown in place, with the full tier report one click away */
(function(){
var rep = GROUPS.find(function(g){ return g.id === 'reports'; }); if(rep && rep.sheets.indexOf('Waterfall Report') < 0){ var i = rep.sheets.indexOf('Sources and Uses Report'); rep.sheets.splice(i < 0 ? rep.sheets.length : i + 1, 0, 'Waterfall Report'); }
var render = function(){ var s = bkLoad() || {}, html = '';
  try { html = typeof window.bkWaterfallSummaryHTML === 'function' ? window.bkWaterfallSummaryHTML() : ''; } catch(e){}
  var btn = '<div class="ae-row" style="margin:0 0 10px"><button type="button" class="ae-btn pri" onclick="bkWaterfallSummaryOpen()">Print / PDF: waterfall summary (1 page)</button><button type="button" class="ae-btn" onclick="bkWaterfallSummaryOpen(true)">Print / PDF: every tier, by year</button></div>';
  var body = html ? '<iframe title="Waterfall summary" style="width:100%;height:1080px;border:1px solid var(--ae-line,#c9d2db);background:#fff" srcdoc="' + String(html).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"></iframe>' : '<div class="note-flag"><span>&#9432;</span><div>The waterfall report needs a deal with equity and a hurdle structure. Set the partners on Investment &gt; Partnership.</div></div>';
  return { title:'Waterfall Report', crumbs:'Reports', desc:'Who gets paid what, tier by tier: contributions, hurdles, the split under each tier, each partner\'s cash flow by year and the cash left for the next tier.', meta:{ Property:s.name || 'Untitled' }, main:btn + body, sidebar:'' }; };
if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Waterfall Report', function(){ if(typeof window.bkHasActiveDeal === 'function' && !window.bkHasActiveDeal() && typeof window.bkEmptyState === 'function') return window.bkEmptyState('Waterfall Report'); return render(); }); else RENDERERS['Waterfall Report'] = render;
})();
wrap('Equity Waterfall'); wrap('Waterfall (M)');
})();
