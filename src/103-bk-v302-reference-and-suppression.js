
/* V30.2 (1) SOURCE DATA: the Yardi portfolio table (ShorePointe, Harvard Avenue and the rest of the
   reference portfolio) is benchmark material, not the active deal's source data. For any deal that
   is not itself one of those reference properties it is shown under an explicit REFERENCE /
   BENCHMARK heading, and the page states that no deal-specific source data is recorded.
   (2) RETURNS SUPPRESSION (decision surfaces): with any model-control FAIL, Home's headline returns
   read "Suppressed - resolve N FAIL item(s)" and every other deal page carries a red FAIL banner;
   the detailed numbers stay visible for diagnosis. WARN never suppresses. */
(function(){
  function fails(){ try{ return (typeof bkModelControls==='function') ? bkModelControls().filter(function(c){return c.level==='FAIL';}).length : 0; }catch(e){ return 0; } }
  var REF=/shore\s*pointe|harvard|havard|glenbrook|wall street manor|elmcrest|rowayton|haviland|lenox|southfield|seaview|soule|sellick|testa/i;
  var sd=RENDERERS['Source Data'];
  if(typeof sd==='function'){
    var g=function(){
      var o=sd.apply(this,arguments); var s=bkLoad();
      if(!o || typeof o!=='object' || REF.test(String(s.name||'')+' '+String(s.dealId||'')+' '+String(s.location||''))) return o;
      o.desc='Reference / benchmark data from the Yardi portfolio workbook. It does not belong to this deal.';
      o.meta=Object.assign({'Active-Deal Source Data':'None recorded','Section Below':'Reference / Benchmark'}, o.meta||{});
      delete o.meta['Deep Detail']; delete o.meta['Status']; delete o.meta['Yardi Source'];
      o.main='<div class="note-flag" style="border-left:4px solid #8A6212"><span>&#9432;</span><div><b>REFERENCE / BENCHMARK ONLY - not this deal\'s source data.</b> '
        + 'No deal-specific source data is recorded for this deal (use Source Ingestion). The tables below are the reference portfolio, '
        + 'shown only for comparison.</div></div>'+String(o.main||'').replace(/<caption>/g,'<caption>Reference / Benchmark - ');
      return o;
    };
    Object.keys(sd).forEach(function(k){ g[k]=sd[k]; }); RENDERERS['Source Data']=g;
  }
  var home=RENDERERS['Home'];
  if(typeof home==='function'){
    var h=function(){
      var o=home.apply(this,arguments), n=fails();
      if(n && o && typeof o==='object'){
        var sup='Suppressed - resolve '+n+' FAIL item'+(n===1?'':'s');
        o.main=String(o.main||'').replace(/(Levered IRR \/ MOIC<\/td>\s*<td[^>]*>)[^<]*(<\/td>)/g,'$1'+sup+'$2');
        if(o.meta){ Object.keys(o.meta).forEach(function(k){ if(/irr|moic|return/i.test(k)) o.meta[k]=sup; }); }
      }
      return o;
    };
    Object.keys(home).forEach(function(k){ h[k]=home[k]; }); RENDERERS['Home']=h;
  }
  var show=window.showSheet;
  var wrapped=function(name){
    var r=show.apply(this,arguments);
    try{
      var sheet=(typeof currentSheet!=='undefined')?currentSheet:name;
      var deal=(window.BK_DEAL_SHEETS||[]).concat(['Data Export','QA']).indexOf(sheet)>=0;
      if(deal && sheet!=='Home' && sheet!=='Deal Underwrite' && typeof bkIsProvisioned==='function' && bkIsProvisioned()){
        var n=fails(), vp=document.getElementById('viewport'), mc=vp && vp.querySelector('.main-col');
        if(n && mc && !mc.querySelector('.bk-fail-banner')){
          var d=document.createElement('div'); d.className='note-flag bk-fail-banner';
          d.innerHTML='<span>&#9888;</span><div><b class="bk-ctl-FAIL">FAIL - '+n+' model-control failure'+(n===1?'':'s')+'.</b> Figures on this page are diagnostic and are not decision-grade until resolved. See Home or Deal Underwrite for the list.</div>';
          mc.insertBefore(d, mc.firstChild);
        }
      }
    }catch(e){}
    return r;
  };
  window.showSheet=wrapped; try{ showSheet=wrapped; }catch(e){}
})();
