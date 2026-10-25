
/* All sheets are registered by now; rebuild the rail once from GROUPS and assert that
   every navigable sheet has a renderer. */
(function(){ bkBuildRail(); var missing=GROUPS.flatMap(function(g){return g.sheets;}).filter(function(x){return !RENDERERS[x];});
 window.BK_NAV_MISSING_RENDERERS=missing;
 /* ONE blank-slate gate, applied after every renderer is registered, so a renderer
    re-registered by a later script can never bypass it. Data Export, QA and Source
    Lineage were ungated and exported/displayed the engine template (ShorePointe). */
 var gated=(window.BK_DEAL_SHEETS||[]).concat(['Data Export','QA','Source Lineage']);
 gated.forEach(function(name){ var orig=RENDERERS[name]; if(typeof orig!=='function'||orig.__bkV30Gate) return;
   var g=function(){ if(typeof bkIsProvisioned==='function' && !bkIsProvisioned()) return window.bkEmptyState(name); return orig.apply(this,arguments); };
   g.__bkV30Gate=true; g.__bkBlankSlate=true; g.__bkOriginal=orig; RENDERERS[name]=g; }); if(missing.length) console.error('BK nav defect - no renderer for: '+missing.join(', ')); })();
