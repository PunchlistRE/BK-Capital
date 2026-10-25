
(function(){
  function nfmt(n, decimals){
    return Math.abs(n).toLocaleString('en-US',{
      minimumFractionDigits:decimals,
      maximumFractionDigits:decimals
    });
  }
  function dollarDecimals(n, unit){
    var a=Math.abs(n);
    /* Rate / per-unit dollar fields keep cents below $100; large values suppress cents. */
    return a < 100 ? 2 : 0;
  }
  function formatAccountingNumber(n, unit){
    unit=String(unit||'').trim();
    var money=unit.charAt(0)==='$';
    var pct=unit==='%';
    if(money){
      var d=dollarDecimals(n,unit);
      var body='$'+nfmt(n,d);
      return n < 0 ? '('+body+')' : body;
    }
    if(pct){
      var body=nfmt(n,2)+'%';
      return n < 0 ? '('+body+')' : body;
    }
    return null;
  }
  function parseDisplayedNumber(t){
    t=String(t||'').trim();
    if(!t || t==='-' || t==='-') return null;
    var neg=/^\(.*\)$/.test(t) || /^-/.test(t);
    var cleaned=t.replace(/[,$%()]/g,'').replace(/^\-/,'').trim();
    if(!/^\d+(\.\d+)?$/.test(cleaned)) return null;
    var n=Number(cleaned);
    return isFinite(n) ? (neg ? -n : n) : null;
  }
  function apply(){
    document.querySelectorAll('#viewport table.fin tbody tr').forEach(function(tr){
      if(tr.children.length < 3) return;
      var value=tr.children[1], units=tr.children[2];
      var unit=(units.textContent||'').trim();
      var select=value.querySelector(':scope > select');
      if(select){
        var vals=Array.from(select.options||[]).map(function(o){return (o.textContent||'').trim().toLowerCase();});
        if(vals.length && vals.every(function(v){return ['yes','no','on','off'].indexOf(v)>=0;})){
          select.setAttribute('data-short-select','1');
        }
        return;
      }
      if(value.querySelector('input')) return;
      if(!(unit.charAt(0)==='$' || unit==='%')) return;
      var n=parseDisplayedNumber(value.textContent);
      if(n===null) return;
      var formatted=formatAccountingNumber(n,unit);
      if(formatted!==null) value.textContent=formatted;
    });
  }

  /* Apply after every sheet render without touching engine/state. */
  var oldShow=window.showSheet;
  if(typeof oldShow==='function' && !oldShow.__bkV291012){
    var wrapped=function(){
      var r=oldShow.apply(this,arguments);
      try{apply();}catch(e){}
      return r;
    };
    wrapped.__bkV291012=true;
    window.showSheet=wrapped;
    try{ showSheet=wrapped; }catch(e){}
  }
  try{apply();}catch(e){}
})();
