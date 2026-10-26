
(function(){
  'use strict';

  /* DISPLAY ONLY. This pass never reads from or writes to deal state. It normalizes
     the visible Units/Basis cells after a renderer has produced its table. */
  function canonicalUnit(raw){
    var s=String(raw==null?'':raw).trim();
    if(!s) return s;
    var key=s.toLowerCase().replace(/\s+/g,' ').trim();
    var exact={
      '$':'$', '%':'%', 'x':'x', 'bps':'bps',
      'unit':'units','units':'units',
      'sf':'SF','gsf':'GSF','nrsf':'NRSF','acres':'acres',
      'month':'months','months':'months','year':'years','years':'years',
      '$/sf':'$/SF', '$/sf/yr':'$/SF/yr', '$/sf/year':'$/SF/yr', '$/sf/mo':'$/SF/mo', '$/sf/month':'$/SF/mo',
      '$/gsf':'$/GSF', '$/gsf/yr':'$/GSF/yr', '$/gsf/year':'$/GSF/yr', '$/gsf/mo':'$/GSF/mo', '$/gsf/month':'$/GSF/mo',
      '$/unit':'$/unit', '$/unit/yr':'$/unit/yr', '$/unit/year':'$/unit/yr', '$/unit/mo':'$/unit/mo', '$/unit/month':'$/unit/mo',
      '$/building/yr':'$/building/yr', '$/building/year':'$/building/yr', '$/building/mo':'$/building/mo', '$/building/month':'$/building/mo',
      '$/acre':'$/acre', '$/retail sf':'$/Retail SF',
      '% of price':'% of Price', '% of purchase price':'% of Price',
      '% of cost':'% of Cost Basis', '% of cost basis':'% of Cost Basis',
      '% of value':'% of Value', '% of underwritten value':'% of Underwritten Value', '% of stabilized value':'% of Stabilized Value',
      '% of egi':'% of EGI', '% of gpr':'% of GPR', '% of noi':'% of NOI',
      '% of hard cost':'% of Hard Costs', '% of hard costs':'% of Hard Costs',
      '% of hard + soft':'% of Hard + Soft Costs', '% of hard + soft costs':'% of Hard + Soft Costs',
      '% of hard + soft subtotal':'% of Hard + Soft Costs',
      '% of loan':'% of Loan', '% of gross':'% of Gross', '% of gross sale':'% of Gross Sale',
      '% of gross potential rent':'% of GPR', '% of lease value':'% of Lease Value',
      '% of basis':'% of Basis', '% of equity':'% of Equity', '% of uses':'% of Uses',
      '% of portfolio':'% of Portfolio', '% of units':'% of Units', '% of occupied rent':'% of Occupied Rent',
      '% of budget / status':'% of Budget / Status',
      'toggle':'Toggle','date':'Date','text':'Text','currency':'Currency'
    };
    if(Object.prototype.hasOwnProperty.call(exact,key)) return exact[key];

    /* Safe structural aliases. */
    var t=s
      .replace(/\$\s*\/\s*/g,'$/')
      .replace(/\s*\/\s*/g,'/')
      .replace(/\/year\b/ig,'/yr')
      .replace(/\/month\b/ig,'/mo')
      .replace(/\bgsf\b/ig,'GSF')
      .replace(/\bnrsf\b/ig,'NRSF')
      .replace(/\bsf\b/ig,'SF');
    return exact[t.toLowerCase()] || t;
  }

  function isUnitHeader(t){
    return /^(units?|uom|basis|units\s*\/\s*basis)$/i.test(String(t||'').trim());
  }

  function normalizeTable(table){
    var heads=Array.from(table.querySelectorAll('thead th')).map(function(th){return (th.textContent||'').trim();});
    var unitCols=[];
    heads.forEach(function(h,i){ if(isUnitHeader(h)) unitCols.push(i); });

    /* Canonical Field | Value | Units[/Status] input tables. */
    if(!unitCols.length && heads.length>=3 && /^field$/i.test(heads[0]||'') && /^value$/i.test(heads[1]||'')) unitCols=[2];

    unitCols.forEach(function(idx){
      table.querySelectorAll('tbody tr').forEach(function(tr){
        var td=tr.children[idx]; if(!td || td.querySelector('input,select,textarea')) return;
        var old=(td.textContent||'').trim(); if(!old) return;
        var neu=canonicalUnit(old); if(neu!==old) td.textContent=neu;
      });
    });
  }

  function normalizeVisibleUnits(root){
    root=root||document;
    root.querySelectorAll('#viewport table').forEach(normalizeTable);
  }

  var pending=false;
  function schedule(){
    if(pending) return; pending=true;
    requestAnimationFrame(function(){ pending=false; try{normalizeVisibleUnits(document);}catch(e){} });
  }

  window.bkDisplayPass(schedule);   /* runs after every render via the single viewport watcher */
  schedule();
})();
