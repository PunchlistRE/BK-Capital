
/* V30.2: the Source Lineage findings are a fixed audit of the original ShorePointe / HPM
   portfolio workbook. They were shown for EVERY active deal, presenting another property's
   source findings as if they belonged to the user's deal. They now appear only for that
   reference property; every other deal gets an explicit "no findings recorded" state. */
(function(){
  var prev = RENDERERS['Source Lineage']; if(typeof prev!=='function') return;
  var g = function(){
    var s = bkLoad();
    if(/shore\s*pointe/i.test(String(s.name||'')+' '+String(s.dealId||''))) return prev.apply(this, arguments);
    return { title:'Source Lineage', crumbs:'System', desc:'Where each source value came from and which underwriting decision it supports.',
      meta:{ Property:s.name||'-', Findings:0, Status:'No findings recorded' },
      main:'<div class="tbl-wrap"><table class="fin"><caption>Source Reconciliation Findings - Active Deal</caption>'
        + '<thead><tr><th class="rowlabel-h">Source</th><th>Severity</th><th style="text-align:left">Finding</th><th style="text-align:left">Effect on Import</th></tr></thead>'
        + '<tbody><tr><td class="rowlabel" colspan="4">No source reconciliation findings are recorded for this deal. Findings appear here when a source package is ingested and reviewed on Source Ingestion.</td></tr></tbody></table></div>',
      sidebar: sidebarShell(modelInfoCard('<div class="metric-row"><span class="k">Tab Group</span><span class="v">System</span></div>') + colorKeyCard()) };
  };
  Object.keys(prev).forEach(function(k){ g[k]=prev[k]; });
  g.__bkBlankSlate = prev.__bkBlankSlate;
  RENDERERS['Source Lineage'] = g;
})();
