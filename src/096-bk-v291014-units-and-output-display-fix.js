
(function(){
  function canon(s){
    s=String(s||'').trim(); var k=s.toLowerCase().replace(/\s+/g,' ');
    var m={'% of price':'% of Price','% of purchase price':'% of Price','% of egi':'% of EGI','% of gpr':'% of GPR','% of noi':'% of NOI','% of cost':'% of Cost Basis','% of cost basis':'% of Cost Basis','% of value':'% of Value','% of underwritten value':'% of Underwritten Value','% of stabilized value':'% of Stabilized Value','% of hard cost':'% of Hard Costs','% of hard costs':'% of Hard Costs','% of hard + soft':'% of Hard + Soft Costs','% of hard + soft costs':'% of Hard + Soft Costs','% of loan':'% of Loan','% of gross':'% of Gross','% of gross sale':'% of Gross Sale','% of gross potential rent':'% of GPR','$/sf':'$/SF','$/sf/yr':'$/SF/yr','$/sf/year':'$/SF/yr','$/sf/mo':'$/SF/mo','$/sf/month':'$/SF/mo','$/gsf':'$/GSF','$/gsf/yr':'$/GSF/yr','$/gsf/year':'$/GSF/yr','$/gsf/mo':'$/GSF/mo','$/gsf/month':'$/GSF/mo','$/unit/year':'$/unit/yr','$/unit/month':'$/unit/mo','$/building/year':'$/building/yr','$/building/month':'$/building/mo','gsf / unit':'GSF/unit','nrsf / unit':'NRSF/unit'};
    if(m[k]) return m[k];
    return s.replace(/\$\s*\/\s*/g,'$/').replace(/\s*\/\s*/g,'/').replace(/\/year\b/ig,'/yr').replace(/\/month\b/ig,'/mo').replace(/\bsf\b/g,'SF').replace(/\bgsf\b/ig,'GSF').replace(/\bnrsf\b/ig,'NRSF');
  }
  var moneyWords=/purchase price|gross assets|total debt|total equity|combined noi|loan|equity|uses|sources|closing costs|acquisition fee|origination fee|development cost|hard costs|soft costs|land|value|proceeds|cash flow|noi|egi|gpr|income|expense|fee|balance|basis|cost|rent|revenue|capital|distribution|contribution|payoff|reserve/i;
  var excludeMoney=/cap rate|ltv|ltc|dscr|debt yield|irr|moic|occupancy|vacancy|rate|margin|multiple|months|years|units|sf|gsf|nrsf|count|deals|rows|entries|properties|suites|snapshots|records|attributes/i;   /* V30.2: counts of rows/properties are not money ("Rent-roll rows ... $5") */
  function fmtMoneyCell(td){
    if(bkIsEditing(td)) return;
    var txt=(td.textContent||'').trim();
    if(!/^[-+]?\(?[\d,]+(?:\.\d+)?\)?$/.test(txt)) return;
    if(txt.indexOf('$')>=0) return;
    var neg=/^-|^\(/.test(txt); var raw=txt.replace(/[(),+\-]/g,''); var n=Number(raw.replace(/,/g,'')); if(!isFinite(n)) return;
    var decimals=(Math.abs(n)<100 && n!==Math.round(n))?2:0;
    var out='$'+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
    td.textContent=neg?'('+out+')':out;
  }
  function normalize(root){
    root=root||document;
    root.querySelectorAll('#viewport table').forEach(function(t){
      var heads=Array.from(t.querySelectorAll('thead th')).map(x=>(x.textContent||'').trim().toLowerCase());
      var uidx=heads.findIndex(h=>/^(units?|basis|units\s*\/\s*basis)$/.test(h));
      if(uidx<0 && heads[0]==='field' && heads[1]==='value' && heads.length>=3) uidx=2;
      t.querySelectorAll('tbody tr').forEach(function(tr){
        var cells=Array.from(tr.children); if(!cells.length) return;
        if(uidx>=0 && cells[uidx] && !cells[uidx].querySelector('input,select,textarea') && !bkIsEditing(cells[uidx])){ var cu=canon(cells[uidx].textContent); if(cu!==cells[uidx].textContent) cells[uidx].textContent=cu; }
        var label=(cells[0].textContent||'').trim();
        /* V30: the Units column is authoritative. A row whose unit is years/months/x/%/etc.
           is never money, whatever its label says ("Acq Loan - Amortization" was shown as $30). */
        var unitTxt=(uidx>=0 && cells[uidx]) ? (cells[uidx].textContent||'').trim() : '';
        var unitSaysNotMoney = unitTxt && unitTxt!=='-' && unitTxt.indexOf('$')===-1;
        /* V30.2: tables without a Units header carry the unit in the cell after the value
           ("Loan Term | 10 | years" was shown as $10). */
        if(!unitSaysNotMoney && uidx<0 && cells[2]){ var nxt=(cells[2].textContent||'').trim().toLowerCase();
          if(/^(years?|yrs?|months?|mo|days?|x|%|sf|gsf|nrsf|units?|bps|acres|spaces)\b/.test(nxt)) unitSaysNotMoney=true; }
        if(moneyWords.test(label) && !excludeMoney.test(label) && !unitSaysNotMoney){
          for(var i=1;i<cells.length;i++){
            if(i===uidx || cells[i].querySelector('input,select,textarea,.status-chip')) continue;
            if(/^(months?|months scheduled|term \(months\)|count|units?|years?)$|%|ratio|dscr/.test(heads[i]||'')) continue;   /* V30: a count column is never money */
            fmtMoneyCell(cells[i]);
          }
        }
      });
    });
  }
  var busy=false; function go(){if(busy)return; busy=true; requestAnimationFrame(function(){busy=false;normalize(document);});}
  window.bkDisplayPass(go);
  go();
})();
