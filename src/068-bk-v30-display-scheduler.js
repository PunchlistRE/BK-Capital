
/* V30 CONSOLIDATION - ONE viewport watcher.
   Ten display-normalisation passes each installed their own MutationObserver on
   #viewport, and eight of them also wrapped showSheet() just to schedule themselves
   after a render. Together they rewrote each other's output forever (measured in
   V29: ~30,000 DOM mutations per second on an idle page). Now each pass registers
   its own rAF-debounced scheduler here; a single observer notifies every pass, in
   registration order, whenever the viewport changes (which includes every render).
   Passes only write when a value actually changes, so an idle page stays idle. */
(function(){
  var passes=[];
  window.bkDisplayPass=function(fn){ if(typeof fn==='function') passes.push(fn); return fn; };
  var vp=document.getElementById('viewport');
  if(vp && typeof MutationObserver==='function'){
    new MutationObserver(function(){ for(var i=0;i<passes.length;i++){ try{ passes[i](); }catch(e){} } })
      .observe(vp,{childList:true,subtree:true});
  }
})();
