
/* V29.10.8 consolidated human-browser lifecycle fix.
   The original document renders Home before the late V29.10.5 lifecycle/gating layer
   is installed. Re-render once after every layer is registered so the first usable
   frame reflects canonical provisioning/quarantine state. Navigation remains
   observational; this does not provision or restore anything. */
(function(){
  try {
    var target = (typeof currentSheet !== 'undefined' && currentSheet) ? currentSheet : 'Home';
    if(typeof showSheet === 'function') showSheet(target);
    if(typeof window.bkSyncShell === 'function') window.bkSyncShell();
  } catch(e) { console.error('V29.10.8 final lifecycle paint failed', e); }
})();
