/* Report pages that were built on the card tables (After-Tax Report, Refinance Report) take the statement style of the Cash Flow, Sources and Uses and Valuation reports.
   The renderers are wrapped only to mark their output with a class; the CSS lives in src/186 (.rp-stmt). Nothing here changes a figure. */
(function(){
function wrap(sheet){ var prev = RENDERERS[sheet]; if(typeof prev !== 'function') return;
  RENDERERS[sheet] = function(){ var o = prev.apply(this, arguments); if(!o || typeof o.main !== 'string') return o; if(sheet === 'After-Tax Report' && !/<table/.test(o.main)){ var s0 = (typeof bkLoad === 'function' && bkLoad()) || {}; if(String(s0.dealType || '').toLowerCase() === 'development') o.main = '<div class="note-flag"><span>&#9432;</span><div>After-tax returns are for acquisitions. A development deal is not supported by the after-tax engine yet; see Returns for its pre-tax levered returns.</div></div>'; }
    o.main = '<div class="rp-stmt">' + o.main + '</div>'; return o; }; }
/* Cash Flow Report: the equity actually invested at close (Year 0) and what the levered IRR is calculated on */
(function(){ var prev = RENDERERS['Cash Flow Report']; if(typeof prev !== 'function') return;
  RENDERERS['Cash Flow Report'] = function(){ var o = prev.apply(this, arguments); if(!o || typeof o.main !== 'string') return o;
    try { var K = window.bkProFormaKit, D = K && K.build && K.build(); if(!D || !D.Y || !D.Y.length) return o;
      var M = function(v){ var a = Math.abs(v || 0), t = '$' + Math.round(a).toLocaleString('en-US'); return v < -0.5 ? '(' + t + ')' : t; }, close = -(Number(D.eq) || 0), yv = function(r, i){ return (r.cf || 0) + (i === 0 ? (Number(D.eq) || 0) : 0); }, tot = D.Y.reduce(function(t, r){ return t + (r.cf || 0); }, 0);   /* the kit's Year 1 carries the closing equity, shown here as Year 0 */
      var head = '<th class="r">Year 0</th>' + D.Y.map(function(r){ return '<th class="r">Year ' + r.y + '</th>'; }).join('') + '<th class="r">Total</th>';
      var row = '<td>Net cash flow to equity</td><td class="r">' + M(close) + '</td>' + D.Y.map(function(r, i){ return '<td class="r">' + M(yv(r, i)) + '</td>'; }).join('') + '<td class="r">' + M(tot) + '</td>';
      var irr = isFinite(D.irr) ? (D.irr * 100).toFixed(2) + '%' : 'n/a';
      o.main += '<div class="ae rp"><div class="rp-sec">Year 0 and the levered IRR</div><table class="rp-tbl" id="rp-year0"><thead><tr><th>Equity cash flow</th>' + head + '</tr></thead><tbody><tr class="tot">' + row + '</tr></tbody></table>'
        + '<div class="note" style="margin-top:6px">Year 0 is the equity paid at closing (price, closing costs and fees less the loan). The levered IRR (' + irr + ') is the XIRR of the dated monthly equity cash flows <b>including that Year 0 outflow on the closing date</b>; the years above are those months added up.</div></div>';
    } catch(e){}
    return o; }; })();
/* the statement is always whole dollars; when the widest figure cannot fit its year column at the normal size, the type steps down (or the table scrolls) so every figure shows in full */
function thousands(sheet){ var prev = RENDERERS[sheet]; if(typeof prev !== 'function') return;
  RENDERERS[sheet] = function(){ var o = prev.apply(this, arguments); if(!o || typeof o.main !== 'string') return o; var first = o.main.slice(0, o.main.indexOf('</table>') + 8), yrs = (first.match(/<th class="r">Year \d+<\/th>/g) || []).length, wid = 0; (o.main.match(/<td[^>]*class="[^"]*\br\b[^"]*"[^>]*>[($\-\d,)]+<\/td>/g) || []).forEach(function(t){ var x = t.replace(/<[^>]*>/g, ''); if(x.length > wid) wid = x.length; });
    if(yrs > 10){ o.main = '<div class="bk-scrollyrs" style="--yrs:' + yrs + ';--colw:' + Math.max(100, Math.ceil((wid + 1) * 7.6 + 8)) + 'px">' + o.main + '</div>'; return o; }   /* more than ten years: whole dollars, the statement scrolls sideways */
    if(!yrs) return o;
    /* whole dollars always. The type steps down so the widest figure (up to ten digits, with its $ , and brackets) fits its year column; below 7px it keeps 7px and the statement scrolls sideways instead */
    var avail = 1124 - 170, per = avail / (yrs + 2), fs = Math.floor(((per - 6) / ((wid + 1) * 0.6)) * 10) / 10;
    if(fs >= 12.5) return o;
    var scroll = fs < 7; fs = Math.max(7, fs);   /* 10 years or fewer fit down to 7px; only an extreme statement scrolls */
    o.main = '<div class="bk-wideyrs' + (scroll ? ' bk-scrollyrs' : '') + '" style="--fs:' + fs + 'px;--yrs:' + yrs + '">' + o.main + '</div>';
    return o; }; }
thousands('Cash Flow Report'); thousands('Sources and Uses Report');
wrap('After-Tax Report'); wrap('Refinance Report');
})();
