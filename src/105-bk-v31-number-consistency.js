
/* V30.1 NUMBER PRESENTATION (display only; no stored or computed value is touched).
   1. A currency figure printed without "$" in a table whose same column or same row
      already shows currency is given the "$" ("Debt Service 290,935" beside
      "$3,738,000"; "Gross Sale Price 7,046,775"). Rows and columns about area, counts,
      time, ratios or rates are never touched.
   2. Negative zero produced by rounding ("(0)", "($0)", "-$0", "-0.0%") shows as zero.
   Writes only when the text actually changes, so the page stays idle. */
(function(){
  var PLAIN=/^(\()?(-)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?)(\))?$/;
  var NOT_MONEY=/\b(sf|gsf|nrsf|rsf|nsf|sq\.?\s?ft|square|units?|months?|mo|years?|yrs?|days?|count|acres|spaces|keys|beds|rows|periods?|ratio|dscr|multiple|moic|shares?|iterations|bps|basis points|headcount|parking|population|index|tenants?|leases?|properties|property|suites?|deals?|snapshots?|entries|records?|attributes)\b|%/i;
  var MONEY_WORD=/promote|fee|income|proceeds|distribution|equity|cost|price|value|noi|rent|cash|loan|debt|interest|profit|tax|amount|balance|payment|revenue|expense|capital|called|committed|funded|contributed|loss|gain|depreciation|recapture|basis|ti\/lc/i;
  var HEAD_MONEY_WORD=/equity|called|price|amount|cost|proceeds|distribution|contribution|\bnoi\b|fee|promote|profit|draw|funding/i;
  var HEAD_NOT_MONEY=/%|irr|moic|multiple|rate|share|yield|cap\b|growth|split|pref|date|period|status|basis/i;
  /* column headers that always denote currency */
  var HEAD_MONEY=/^(amount|contribution|contributions|distribution|distributions|distribution \(gross\)|distribution \(net\)|net cash flow|cash flow|equity|debt service|interest|principal|payment|balance|beginning balance|ending balance|noi|egi|draw|hard cost draw|total funding need|cumulative|funded|committed|called|required)$/i;
  function txt(e){ return (e.textContent||'').replace(/\u00a0/g,' ').trim(); }
  /* a period column ("Year 3", "Month 12", "Total") is not an area/count/time column */
  function headNot(h){ h=String(h||'').trim(); return !/^(year|yr|month|mo\.?|q|quarter|period)\s*\d+$/i.test(h) && NOT_MONEY.test(h); }
  function isMoney(t){ return /^\(?-?\$/.test(t); }
  function setT(e,v){ if(e.textContent!==v) e.textContent=v; }
  function negZero(e){
    var t=txt(e), m=t.match(/^(?:\(\$?0(?:\.0+)?%?\)|-\$0(?:\.0+)?|-0(?:\.0+)?%?)$/);
    if(!m) return;
    setT(e, t.replace(/[()\-]/g,''));
  }
  function run(){
    var vp=document.getElementById('viewport'); if(!vp) return;
    vp.querySelectorAll('table.fin').forEach(function(t){
      var heads=[].map.call(t.querySelectorAll('thead th'),function(h){return txt(h);});
      var rows=[].slice.call(t.querySelectorAll('tbody tr'));
      var colMoney={};
      rows.forEach(function(r){ [].forEach.call(r.children,function(c,i){ if(isMoney(txt(c))) colMoney[i]=true; }); });
      var headMoney={};
      heads.forEach(function(h,i){ if((/\(\$\)|^\$|\$\s*$/.test(h) && !/\$\s*\/|per\s/i.test(h)) || ((HEAD_MONEY.test(h) || (HEAD_MONEY_WORD.test(h) && !HEAD_NOT_MONEY.test(h))) && !headNot(h))){ colMoney[i]=true; headMoney[i]=true; } });
      rows.forEach(function(r){
        var cells=[].slice.call(r.children); if(!cells.length) return;
        var label=txt(cells[0]).replace(/\([^)]*\)/g,' '); var rowMoney=cells.some(function(c,i){ return i>0 && isMoney(txt(c)); });
        cells.forEach(function(c,i){
          if(i===0 || c.children.length || c.isContentEditable || c.closest('tr.input')) return;
          negZero(c);
          var t=txt(c);
          if(t==='0' && (colMoney[i]||rowMoney) && (MONEY_WORD.test(label)||headMoney[i]) && !NOT_MONEY.test(label) && !headNot(heads[i])){ setT(c,'$0'); return; }
          var m=t.match(PLAIN); if(!m) return;
          if(NOT_MONEY.test(label) || headNot(heads[i])) return;
          if(!(colMoney[i] || rowMoney)) return;
          var inner='$'+(m[2]?'':'')+m[3];
          var out = (m[1]&&m[4]) ? '('+inner+')' : (m[2] ? '($'+m[3]+')' : inner);
          setT(c,out);
        });
      });
    });
  }
  /* sidebar / KPI metric rows: a bare 0 or a plain thousands figure next to a currency label */
  function runMetrics(){
    var vp=document.getElementById('viewport'); if(!vp) return;
    vp.querySelectorAll('.metric-row, .meta-strip .cell').forEach(function(r){
      var k=r.querySelector('.k'), v=r.querySelector('.v'); if(!k||!v||v.children.length) return;
      var label=txt(k), t=txt(v);
      if(!MONEY_WORD.test(label) || NOT_MONEY.test(label) || /irr|moic|multiple|rate|yield|%|deals?|count|calls$|properties|units|months|years/i.test(label)) return;
      if(t==='0') setT(v,'$0');
      else { var m=t.match(PLAIN); if(m) setT(v, m[2]||(m[1]&&m[4]) ? '($'+m[3]+')' : '$'+m[3]); }
    });
  }
  var q=false; function schedule(){ if(q) return; q=true; requestAnimationFrame(function(){ q=false; try{ run(); runMetrics(); }catch(e){} }); }
  if(typeof window.bkDisplayPass==='function') window.bkDisplayPass(schedule);
  window.bkNumberConsistencyRun=run;
})();
