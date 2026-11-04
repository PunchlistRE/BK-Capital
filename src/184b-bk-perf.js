/* Speed. The model is a set of pure functions of the saved deal, called many times while one page is drawn (every input row asks whether it is required, and each answer re-ran the whole model).
   Each heavy function is remembered against the deal it was computed for: the key is the deal as it is right now (including any temporary what-if overrides) plus a counter that moves when
   any app setting in browser storage changes. Same answer, computed once. Nothing is cached across a change to the deal, a setting or the arguments.
   A remembered answer is handed back as it is, so callers must treat results as read-only (the tests that tamper with a result restore the function and clear this cache). */
(function(){
  var ver = 0, MAX = 12;
  try { var S = Storage.prototype, si = S.setItem, ri = S.removeItem, ci = S.clear;
    S.setItem = function(k){ if(/^bkcapital/i.test(String(k))) ver++; return si.apply(this, arguments); };
    S.removeItem = function(k){ if(/^bkcapital/i.test(String(k))) ver++; return ri.apply(this, arguments); };
    S.clear = function(){ ver++; return ci.apply(this, arguments); }; } catch(e){}
  function stateKey(){ try { return ver + '|' + (typeof bkIsProvisioned === 'function' ? (bkIsProvisioned() ? 1 : 0) : '') + '|' + JSON.stringify(bkLoad()); } catch(e){ return null; } }
  var NAMES = ['bkDealReadiness', 'bkModelControls', 'bkRequiredRows', 'bkIntegrity', 'bkMonthlyReturns', 'bkWaterfallV07', 'bkDevTakeoutV11', 'bkDevFundingV10', 'bkDevV09', 'bkDebt', 'bkAnnualCF', 'bkAllInputsTie', 'bkFundingSummary'];
  var stores = {};
  function wrap(name){
    var f = window[name]; if(typeof f !== 'function' || f.__bkMemo) return;
    var store = stores[name] = new Map();
    var w = function(){
      var k = stateKey(); if(k === null) return f.apply(this, arguments);
      var a; try { a = arguments.length ? JSON.stringify(Array.prototype.slice.call(arguments)) : ''; } catch(e){ return f.apply(this, arguments); }
      k += '|' + a; if(store.has(k)) return store.get(k);
      var r = f.apply(this, arguments); store.set(k, r); if(store.size > MAX) store.delete(store.keys().next().value); return r; };
    w.__bkMemo = true; w.__bkOriginal = f.__bkOriginal || f; try { window[name] = w; } catch(e){} }
  window.bkPerfInstall = function(){ NAMES.forEach(wrap); };
  window.bkPerfClear = function(){ ver++; Object.keys(stores).forEach(function(n){ stores[n].clear(); }); };
  window.bkPerfInstall();
})();
