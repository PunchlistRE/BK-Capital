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
  /* the same figures as the one-page summary, laid out as a native report page in the Cash Flow Report style (no paper preview) */
  var body = '';
  if(html){ try {
    var doc = new DOMParser().parseFromString(html, 'text/html'), tbls = [].slice.call(doc.querySelectorAll('section.page .bd table, .page .bd table')), mk = function(t, extra){
      t.className = 'rp-tbl' + (extra ? ' ' + extra : ''); [].forEach.call(t.querySelectorAll('tr'), function(tr){ [].forEach.call(tr.children, function(c, i){ c.removeAttribute('class'); if(i) c.className = 'r'; }); });
      [].forEach.call(t.querySelectorAll('td'), function(c){ if(/^\(.*\)$/.test(c.textContent.trim()) || /^-/.test(c.textContent.trim())) c.className += ' neg'; }); return t.outerHTML; };
    var kv = tbls.filter(function(t){ return t.classList.contains('kv'); }), cft = tbls.filter(function(t){ return t.classList.contains('cft'); })[0], yrs = cft ? cft.querySelectorAll('thead th').length - 2 : 0;
    if(kv.length >= 4 && cft){
      body = '<div class="ae rp"><div class="rp-sec">Partners and structure</div><div class="bk-wf3">' + mk(kv[0]) + mk(kv[1]) + mk(kv[2]) + '</div>'
        + '<div class="rp-sec">What each tier paid</div>' + mk(kv[3])
        + '<div class="rp-sec">Partner cash flow by year</div><div class="' + (yrs > 10 ? 'bk-scrollyrs' : '') + '" style="--yrs:' + yrs + '">' + mk(cft, 'bk-wf-cf') + '</div>'
        + (function(){ var rh = ''; try { rh = typeof window.bkWaterfallReportHTML === 'function' ? window.bkWaterfallReportHTML() : ''; } catch(e){} if(!rh) return '';
            var d2 = new DOMParser().parseFromString(rh, 'text/html'), ts = [].slice.call(d2.querySelectorAll('.page .bd table.cft')); if(!ts.length) return '';
            return '<div class="rp-sec">Hurdle by hurdle: every step, by year</div><div class="rp-s" style="margin:4px 0 8px">For each tier: the balance the LP must be paid back (beginning balance), the return that accrues on it, contributions, what earlier tiers already paid, the distributions applied against it and the ending balance; then what the tier pays the LP and the GP, its total and the cash flow left for the next tier.</div>'
              + ts.map(function(t){ var y = t.querySelectorAll('thead th').length - 1; return '<div class="' + (y > 10 ? 'bk-scrollyrs' : '') + '" style="--yrs:' + y + ';margin-bottom:10px">' + mk(t, 'bk-wf-cf') + '</div>'; }).join(''); })()
        + '<div class="rp-s" style="margin-top:8px">' + ((doc.querySelector('.note') || {}).innerHTML || '') + '</div></div>'; }
  } catch(e){} }
  if(!body) body = html ? '<iframe title="Waterfall summary" style="width:100%;height:1080px;border:1px solid var(--ae-line,#c9d2db);background:#fff" srcdoc="' + String(html).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"></iframe>' : '<div class="note-flag"><span>&#9432;</span><div>The waterfall report needs a deal with equity and a hurdle structure. Set the partners on Investment &gt; Partnership.</div></div>';
  return { title:'Waterfall Report', crumbs:'Reports', desc:'Who gets paid what, tier by tier: contributions, hurdles, the split under each tier, each partner\'s cash flow by year and the cash left for the next tier.', meta:{ Property:s.name || 'Untitled' }, main:btn + body, sidebar:'' }; };
if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Waterfall Report', function(){ if(typeof window.bkHasActiveDeal === 'function' && !window.bkHasActiveDeal() && typeof window.bkEmptyState === 'function') return window.bkEmptyState('Waterfall Report'); return render(); }); else RENDERERS['Waterfall Report'] = render;
})();
wrap('Equity Waterfall'); wrap('Waterfall (M)');
})();
