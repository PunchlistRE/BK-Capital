
/* ===========================================================================
   V30.0 - DURABLE PERSISTENCE (Supabase is the source of truth)
   ===========================================================================
   localStorage is the engine's working cache. Every material store is mirrored
   to Supabase and restored from it after server-validated sign-in:

     active deal (+ rent roll, commitments, capital calls, depreciation, source
     tags)  -> deals / underwriting_inputs / rent_roll_units via bk_save_deal()
              (ONE database transaction - a failed save never touches the
               previous saved version)
     every other store below -> user_documents via bk_put_document()
              (owner-scoped, typed, schema-versioned)

   Mirroring happens at the storage boundary, so no engine or renderer code
   changed. Sync is only live between a successful restore and sign-out; the
   purge on sign-out/sign-in can therefore never delete cloud data.

   If the V30 database migration is not installed the app still runs, restore
   is skipped, cloud writes are refused (never attempted with the old
   non-atomic path) and the status reads MIGRATION / CONFIGURATION REQUIRED.
   =========================================================================== */
(function(){
'use strict';

var DEAL_KEY = 'bkcapital.cre.v02';
var ENGINE_VERSION = 'V30.0';
var DOCS = {
  'bkcapital.cre.portfolio.v01'     : { type:'portfolio',         v:1, label:'Portfolio' },
  'bkcapital.cre.investors.v01'     : { type:'investor_registry', v:1, label:'Investor Registry' },
  'bkcapital.master.properties.v01' : { type:'master_properties', v:1, label:'Master / Property Data' },
  'bkcapital.property.aliases.v01'  : { type:'property_aliases',  v:1, label:'Property Aliases' },
  'bkcapital.source.staging.v02'    : { type:'source_package',    v:1, label:'Source Package' },
  'bkcapital.source.approvals.v02'  : { type:'source_approvals',  v:1, label:'Source Approvals' },
  'bkcapital.tenant.approvals.v01'  : { type:'tenant_approvals',  v:1, label:'Tenant Approvals' }
};
var APP_STATE = { type:'app_state', v:1 };
var KNOWN_TYPES = {}; Object.keys(DOCS).forEach(function(k){ KNOWN_TYPES[DOCS[k].type] = k; });

var S = window.BK_SYNC = {
  mode: 'signed-out',        // signed-out | restoring | live | migration-required | error
  live: false, suspend: 0,
  activeDealId: null, activeDealCode: null,
  pending: {}, lastError: null, lastSavedAt: null, needsId: false, restoreNotes: []
};

var rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;
function lsSet(k, v){ S.suspend++; try{ localStorage.setItem(k, v); } finally { S.suspend--; } }
function lsDel(k){ S.suspend++; try{ localStorage.removeItem(k); } finally { S.suspend--; } }
window.bkSyncQuiet = function(fn){ S.suspend++; try{ return fn(); } finally { S.suspend--; } };

/* ---------------------------------------------------------------- status UI */
function statusText(){
  if(S.mode === 'migration-required') return ['warn','MIGRATION / CONFIGURATION REQUIRED - cloud persistence is off. Run BK_Capital_V30_Supabase_Migration.sql. Work in this session is not saved to the cloud.'];
  if(S.mode === 'error') return ['err','CLOUD ERROR - '+(S.lastError||'unknown')];
  if(S.mode !== 'live') return ['', ''];
  var pend = Object.keys(S.pending).length;
  if(S.lastError) return ['err','NOT SAVED - '+S.lastError+' (will retry on next change; use Cloud Sync to retry now)'];
  if(pend) return ['', 'Saving to cloud...'];
  if(S.needsId) return ['warn','Deal not saved to cloud - give it a Deal ID or Investment Name.'];
  return ['ok', S.lastSavedAt ? 'All changes saved to cloud' : 'Cloud sync on'];
}
function paint(){
  var rail = document.getElementById('rail'); if(!rail) return;
  var el = document.getElementById('bk-sync-status');
  if(!el){ el = document.createElement('div'); el.id = 'bk-sync-status'; rail.appendChild(el); }
  var t = statusText();
  el.className = 'bk-sync-' + (t[0]||'none');
  el.textContent = t[1];
  el.style.display = t[1] ? '' : 'none';
}
S.paint = paint;

/* ---------------------------------------------------------------- transport */
function isMigrationMissing(e){
  var d = e && e.detail || {};
  return e && (e.status === 404) && /PGRST20[25]|42P01|42883/.test(String(d.code||'') + ' ' + String(d.message||''));
}
function rpc(name, args){
  return bkSb('rpc/' + name, { method:'POST', body: args }).catch(function(e){
    if(isMigrationMissing(e)){ S.mode = 'migration-required'; S.live = false; paint(); var m = new Error('Database migration required (V30).'); m.migration = true; throw m; }
    throw e;
  });
}
S.rpc = rpc;

/* ---------------------------------------------------------------- deal save (atomic) */
function dealPayload(){
  var s = bkLoad();
  var code = String(s.dealId || s.name || '').trim();
  var row = window.bkMap.stateToDealRow(s);
  row.deal_code = code;
  var rr = window.bkMap.stateToRentRollRows(s, null).map(function(r){ delete r.deal_id; return r; });
  return { code: code, args: {
    p_deal_id: S.activeDealId || null, p_deal: row,
    p_input_data: window.bkMap.stateToInputData(s), p_source_data: window.bkMap.stateToSourceData(s),
    p_engine_version: ENGINE_VERSION, p_rent_roll: rr } };
}
var chain = Promise.resolve();
function serial(fn){ var p = chain.then(fn, fn); chain = p.catch(function(){}); return p; }

S.saveActiveDeal = function(opts){
  opts = opts || {};
  return serial(function(){
    if(S.mode === 'migration-required') return Promise.reject(new Error('Cloud save unavailable: the V30 database migration has not been installed.'));
    if(typeof bkIsProvisioned === 'function' && !bkIsProvisioned())
      return Promise.reject(new Error('No active deal. Create or load a deal before saving - the engine template is never saved as a deal.'));
    var p = dealPayload();
    if(!p.code){ S.needsId = true; paint(); return Promise.reject(new Error('The active deal has no Deal ID or Investment Name to save under.')); }
    S.needsId = false;
    var go = function(){ return rpc('bk_save_deal', p.args); };
    var run = (typeof bkAuthEnsureFresh === 'function') ? bkAuthEnsureFresh().then(go) : go();
    return run.then(function(r){
      S.activeDealId = r.id; S.activeDealCode = r.deal_code;
      delete S.pending.deal; S.lastError = null; S.lastSavedAt = new Date().toISOString(); paint();
      return putAppState().then(function(){ return { dealUuid:r.id, dealCode:r.deal_code, units:r.units, savedAt:S.lastSavedAt }; });
    }, function(e){
      S.lastError = 'deal save failed: ' + (e && e.message || e); paint();
      throw e;
    });
  });
};

/* ---------------------------------------------------------------- documents */
function readLocal(key){ var raw = localStorage.getItem(key); if(raw === null) return null; try{ return JSON.parse(raw); }catch(e){ return raw; } }
function putDoc(type, v, payload){
  return rpc('bk_put_document', { p_document_type:type, p_document_key:'default', p_schema_version:v, p_payload:payload });
}
function putAppState(){
  return putDoc(APP_STATE.type, APP_STATE.v, { activeDealId: S.activeDealId, activeDealCode: S.activeDealCode });
}
S.putAppState = putAppState;
function flushDoc(key){
  var d = DOCS[key];
  return serial(function(){
    return putDoc(d.type, d.v, readLocal(key)).then(function(){
      delete S.pending[key]; S.lastError = null; S.lastSavedAt = new Date().toISOString(); paint();
    }, function(e){ S.lastError = d.label + ' save failed: ' + (e && e.message || e); paint(); throw e; });
  });
}

/* ---------------------------------------------------------------- change capture */
var timers = {};
function schedule(key, fn, ms){
  S.pending[key] = true; paint();
  clearTimeout(timers[key]);
  timers[key] = setTimeout(function(){ fn().catch(function(){}); }, ms);
}
function onLocalWrite(key, value){
  if(!S.live || S.suspend) return;
  if(key === DEAL_KEY){
    if(value === null){
      // the active slot was emptied (new deal being created, factory reset, deal deleted)
      clearTimeout(timers.deal); delete S.pending.deal;
      S.activeDealId = null; S.activeDealCode = null;
      serial(putAppState).catch(function(e){ S.lastError = 'app state save failed: ' + e.message; paint(); });
      return;
    }
    schedule('deal', function(){ return S.saveActiveDeal().catch(function(e){ if(/Deal ID|No active deal/.test(e.message)) delete S.pending.deal; paint(); throw e; }); }, 700);
    return;
  }
  if(DOCS[key]) schedule(key, function(){ return flushDoc(key); }, 500);
}
Storage.prototype.setItem = function(k, v){ rawSet.call(this, k, v); if(this === window.localStorage) onLocalWrite(k, v); };
Storage.prototype.removeItem = function(k){ rawRemove.call(this, k); if(this === window.localStorage) onLocalWrite(k, null); };

/* A different deal entering the active slot (new deal, portfolio load, snapshot
   load) must not be written over the previously active cloud deal. */
var provision = window.bkProvision;
window.bkProvision = function(how, obj){
  if(how !== 'cloud-load' && how !== 'cloud-restore'){ S.activeDealId = null; S.activeDealCode = null; }
  var r = provision.apply(this, arguments);
  S.lastMigration = null;
  try { if(typeof window.bkMigrateLegacyInvestors === 'function') S.lastMigration = window.bkMigrateLegacyInvestors('provision:' + how); } catch(e){}
  return r;
};

S.flush = function(timeoutMs){
  Object.keys(timers).forEach(function(k){
    if(S.pending[k]){ clearTimeout(timers[k]);
      (k === 'deal' ? S.saveActiveDeal() : flushDoc(k)).catch(function(){}); }
  });
  var done = chain.then(function(){});
  return Promise.race([done, new Promise(function(r){ setTimeout(r, timeoutMs || 6000); })]);
};
window.addEventListener('beforeunload', function(e){
  if(S.live && Object.keys(S.pending).length){ e.preventDefault(); e.returnValue = ''; }
});

/* ---------------------------------------------------------------- restore */
function loadDealById(id){
  return Promise.all([
    bkSb('deals?id=eq.' + encodeURIComponent(id) + '&select=*&limit=1'),
    bkSb('underwriting_inputs?deal_id=eq.' + encodeURIComponent(id) + '&select=*&limit=1'),
    bkSb('rent_roll_units?deal_id=eq.' + encodeURIComponent(id) + '&select=*&order=sort_order.asc')
  ]).then(function(r){
    var deal = r[0] && r[0][0]; if(!deal) return null;
    var st = window.bkMap.reconstructState(deal, (r[1]||[])[0] || null, r[2] || []);
    return { deal: deal, state: st };
  });
}
S.activateCloudDeal = function(deal, st, how){
  S.suspend++;
  try {
    lsDel(DEAL_KEY);
    window.bkProvision(how || 'cloud-load', st);
    S.activeDealId = deal.id; S.activeDealCode = deal.deal_code;
  } finally { S.suspend--; }
};

S.restore = function(){
  S.mode = 'restoring'; S.live = false; S.restoreNotes = []; S.lastError = null; paint();
  return bkSb('user_documents?select=document_type,document_key,schema_version,payload,updated_at')
    .then(function(rows){
      var appState = null;
      S.suspend++;
      try {
        (rows || []).forEach(function(r){
          if(r.document_key !== 'default') return;
          if(r.document_type === APP_STATE.type){ appState = r.payload || null; return; }
          var key = KNOWN_TYPES[r.document_type];
          if(!key) return;                                   // unknown type: newer app wrote it; leave it alone
          if(r.schema_version > DOCS[key].v){
            S.restoreNotes.push(DOCS[key].label + ' was saved by a newer schema (v' + r.schema_version + ') and was not loaded.');
            return;
          }
          if(r.payload === null || r.payload === undefined) lsDel(key);
          else lsSet(key, JSON.stringify(r.payload));
        });
      } finally { S.suspend--; }
      if(!appState || !appState.activeDealId) return null;
      return loadDealById(appState.activeDealId).then(function(x){
        if(!x){ S.restoreNotes.push('The last active deal no longer exists in the cloud.'); return null; }
        S.activateCloudDeal(x.deal, x.state, 'cloud-restore');
        return x.deal;
      });
    })
    .then(function(deal){ S.mode = 'live'; S.live = true; paint();
      if(deal && S.lastMigration && S.lastMigration.migrated) S.saveActiveDeal().catch(function(){});
      return { restoredDeal: deal ? deal.deal_code : null }; },
          function(e){
            if(isMigrationMissing(e)){ S.mode = 'migration-required'; S.live = false; paint(); return { migrationRequired:true }; }
            throw e;
          });
};
S.stop = function(){ S.live = false; S.mode = 'signed-out'; S.pending = {}; S.activeDealId = null; S.activeDealCode = null;
  S.lastError = null; S.lastSavedAt = null; S.needsId = false;
  Object.keys(timers).forEach(function(k){ clearTimeout(timers[k]); }); paint(); };

/* ---------------------------------------------------------------- delete */
window.bkCloudDeleteDeal = function(id, code){
  return rpc('bk_delete_deal', { p_deal_id: id }).then(function(){
    if(S.activeDealId === id){
      S.suspend++;
      try { lsDel(DEAL_KEY); if(typeof bkDeprovision === 'function') bkDeprovision(); } finally { S.suspend--; }
      S.activeDealId = null; S.activeDealCode = null;
      return putAppState().then(function(){ return { deleted:code, wasActive:true }; });
    }
    return { deleted:code, wasActive:false };
  });
};
window.bkCloudDeleteClick = function(id, code){
  if(!window.confirm('Permanently delete deal "' + code + '" from the cloud?\n\nThis removes its assumptions, rent roll and snapshots. It cannot be undone.')) return;
  window.bkCloudDeleteDeal(id, code).then(function(r){
    if(typeof window.bkCloudNote === 'function') window.bkCloudNote('ok', 'Deleted "' + r.deleted + '" from the cloud.' + (r.wasActive ? ' It was the active deal, so no deal is active now.' : ''));
    if(typeof bkCloudRefresh === 'function') bkCloudRefresh();
  }).catch(function(e){ if(typeof window.bkCloudNote === 'function') window.bkCloudNote('err', 'Delete failed: ' + e.message + ' Nothing was deleted.'); });
};
})();
