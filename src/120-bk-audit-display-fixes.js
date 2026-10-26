
/* ===========================================================================
   AUDIT DISPLAY FIXES (sample-deal audit)
   ---------------------------------------------------------------------------
   1. Returns: the meta strip still read "Excel IRR 13.0% / Excel MOIC 2.74x /
      Verified" and the sidebar carried a "Workbook Tie-Out - Verified" card on
      EVERY deal. Those were literals from one historical reference workbook (the
      comparison column was already removed for the same reason). They now show
      the active deal's own live figures.
   2. Residual Land: "Workbook Stored Solve $5,288,519" was a literal from the
      reference workbook shown on every deal. Removed.
   3. Key-metric rows (see the CSS above) and plain-text status words in
      Status / Lineage columns rendered as the same pill every other status uses.
   No engine, input or calculated figure is changed by anything here.
   =========================================================================== */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined') return;
function wrap(sheet, fn){
  var prev = RENDERERS[sheet]; if(typeof prev !== 'function') return;
  var w = function(){
    var o = prev.apply(this, arguments);
    try {
      if(typeof window.bkProductionCounts === 'function' && !window.bkProductionCounts().activeDeal) return o;
      if(!o || typeof o !== 'object' || /no deal loaded|there is no active deal/i.test(String(o.main || ''))) return o;
      fn(o);
    } catch(e){}
    return o;
  };
  Object.keys(prev).forEach(function(k){ if(k.indexOf('__') === 0) w[k] = prev[k]; });
  if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer(sheet, w); else RENDERERS[sheet] = w;
}

wrap('Returns', function(o){
  var x = null; try { x = bkMonthlyReturns(); } catch(e){}
  if(o.meta){
    var m = {};
    Object.keys(o.meta).forEach(function(k){
      if(k === 'Excel IRR'){ m['Levered IRR'] = x && isFinite(x.irr) ? bkPct(x.irr) : '-'; return; }
      if(k === 'Excel MOIC'){ m['Levered MOIC'] = x && isFinite(x.moic) ? x.moic.toFixed(2)+'x' : '-'; return; }
      m[k] = (k === 'Status' && o.meta[k] === 'Verified') ? 'Live' : o.meta[k];
    });
    o.meta = m;
  }
  if(o.sidebar){
    o.sidebar = String(o.sidebar)
      .replace(/<div class="card"><div class="card-head">Workbook Tie-Out - Verified<\/div>[\s\S]*?<\/div><\/div><\/div>/, '')
      .replace(/<span class="status-chip ok">Verified exact<\/span>/, '<span class="status-chip pass">Live</span>');
  }
  if(o.desc) o.desc = String(o.desc).replace(', verified against the workbook engine', ' from the live monthly engine');
});

wrap('Residual Land', function(o){
  o.main = String(o.main || '').replace(/<tr><td class="rowlabel">Workbook Stored Solve<span class="bk-sub">Reference value from Residual Land C20<\/span><\/td><td>\$5,288,519<\/td>[\s\S]*?<\/tr>/, '');
  if(o.meta && o.meta['Effective Land'] && String(o.meta['Effective Land']).charAt(0) !== '$') o.meta['Effective Land'] = '$' + o.meta['Effective Land'];
});

/* ---- display pass: key rows + status words as pills (idempotent; writes only on change) ---- */
var STATUS_HEAD = /^(status|lineage|test|state|result|note)$/i;
var STATUS_WORD = /^[A-Z][A-Z0-9 \/&+\-]{1,26}$/;
function chipClass(w){
  if(/^(PASS|OK|MET|TIE|TIES|LIVE|ON|SELECTED|CONCLUDED|ACTIVE|ENGINE|VERIFIED)$/.test(w)) return 'pass';
  if(/^(WARN|REVIEW|STALE|WATCH|MARGINAL|RAMP|NOT MET|BINDING|NOT REACHABLE)$/.test(w)) return 'warn';
  if(/^(FAIL|FAILED|BLOCKED|OUT|BREACH|OUT OF BALANCE)$/.test(w)) return 'fail';
  return '';
}
function run(){
  var vp = document.getElementById('viewport'); if(!vp) return;
  vp.querySelectorAll('table.fin').forEach(function(tb){
    // key vs closing totals, per tbody
    tb.querySelectorAll('tbody').forEach(function(body){
      var rows = [].slice.call(body.children).filter(function(r){ return r.tagName === 'TR'; });
      var closing = true;
      for(var i = rows.length - 1; i >= 0; i--){
        var r = rows[i], tot = r.classList.contains('grandtotal') || r.classList.contains('total');
        if(!tot){ closing = false; if(r.hasAttribute('data-bk-emph')) r.removeAttribute('data-bk-emph'); continue; }
        if(closing){ if(r.hasAttribute('data-bk-emph')) r.removeAttribute('data-bk-emph'); }
        else if(r.getAttribute('data-bk-emph') !== 'key') r.setAttribute('data-bk-emph', 'key');
      }
    });
    // status words -> pills
    var hr = tb.querySelector('thead tr:last-child'); if(!hr) return;
    var cols = []; var ci = 0;
    [].forEach.call(hr.children, function(th){ if(STATUS_HEAD.test((th.textContent || '').trim())) cols.push(ci); ci += Number(th.getAttribute('colspan') || 1); });
    if(!cols.length) return;
    tb.querySelectorAll('tbody tr').forEach(function(tr){
      var i = 0;
      [].forEach.call(tr.children, function(td){
        var span = Number(td.getAttribute('colspan') || 1);
        if(span === 1 && cols.indexOf(i) > -1 && !td.children.length){
          var w = (td.textContent || '').trim();
          if(STATUS_WORD.test(w)) td.innerHTML = '<span class="status-chip ' + chipClass(w) + '">' + w.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</span>';
        }
        i += span;
      });
    });
  });
}
var q = false; function schedule(){ if(q) return; q = true; requestAnimationFrame(function(){ q = false; try { run(); } catch(e){} }); }
if(typeof window.bkDisplayPass === 'function') window.bkDisplayPass(schedule);
window.bkAuditDisplayRun = run;
schedule();
})();
