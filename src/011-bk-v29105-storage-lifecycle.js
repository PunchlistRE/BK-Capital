
/* ===========================================================================
   V29.10.5 - VERSIONED STORAGE LIFECYCLE, LEGACY CLASSIFICATION & QUARANTINE
   ===========================================================================
   WHAT WENT WRONG IN V29.10.4.2 (measured, not assumed)

   Instrumenting localStorage.setItem before any application script ran showed
   TWO unconditional writes on every single cold load, with no user action:

       [1] WRITE bkcapital.cre.v02  <- bkSave <- bkEnsureV13()          (module scope)
       [2] WRITE bkcapital.cre.v02  <- bkSave <- bkEnsureSourceTagsV27() (module scope)

   So the application MANUFACTURED a stored deal on first open. Any "blank
   slate" gate that consults storage was therefore arguing with state the app
   itself had just written. bkResetToFactoryState() could not hold either - the
   very next load re-created the key.

   Separately, bkActiveDeal() returned bkLoad() unconditionally, and bkLoad()
   is Object.assign({}, BK_BASE, stored). With nothing stored that yields the
   DEVELOPMENT identity BK-002 / ShorePointe, presented as an active deal.

   THE THREE RULES THIS LAYER ENFORCES

   1. NO AUTOMATIC WRITES. Until a deal is deliberately provisioned, bkSave()
      is inert. Every bkEnsureVxx() still runs and still returns a fully
      populated object, because bkLoad() merges BK_BASE in memory regardless -
      only the PERSISTENCE is withheld. Zero engine behaviour changes.

   2. NEVER DESTROY. This layer never calls localStorage.clear() and never
      deletes a user value. Legacy state is QUARANTINED - copied to a
      bkcapital.quarantine.* key, indexed with its classification, and
      restorable from the UI. Quarantine is reversible; deletion is not.

   3. MIGRATE ONCE. The whole lifecycle is gated behind a schema stamp. After
      the first boot the stamp exists, migration never runs again, and real
      user data persists across reloads exactly like any other application.

   FINANCIAL LOGIC CHANGES: NONE. No formula, denominator, growth rate, or
   engine function is touched. This layer governs persistence and identity
   only.
   =========================================================================== */
(function(){
'use strict';

var SCHEMA_KEY  = 'bkcapital.app.schema.v01';
var SCHEMA      = 29105;
var PROV_KEY    = 'bkcapital.cre.provisioned.v01';
var QUAR_PREFIX = 'bkcapital.quarantine.';
var QUAR_INDEX  = 'bkcapital.quarantine.index.v01';

/* Deal-bearing stores the lifecycle governs. */
var DEAL_KEYS = [
  'bkcapital.cre.v02',
  'bkcapital.cre.portfolio.v01',
  'bkcapital.source.staging.v02',
  'bkcapital.source.approvals.v02',
  'bkcapital.tenant.approvals.v01',
  'bkcapital.master.properties.v01'
];

/* Connection configuration and the user's auth session are NEVER touched by
   the lifecycle. Quarantining a Supabase session would log the user out on
   upgrade, which is a regression, not a safeguard. */
var NEVER_TOUCH = ['bkcapital.supabase.cfg.v01','bkcapital.supabase.auth.v01'];

function get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function set(k,v){ try{ localStorage.setItem(k,v); return true; }catch(e){ return false; } }
function del(k){ try{ localStorage.removeItem(k); }catch(e){} }
function parse(s){ try{ return JSON.parse(s); }catch(e){ return undefined; } }

/* ---------------------------------------------------------------- 1. WRITE GATE */
/* bkSave is replaced, not deleted. The original is retained and is what every
   deliberate provisioning path calls. */
var _origSave = window.bkSave || bkSave;
var _allowWrite = false;            // set true only inside bkWithWriteAuthority()
var _suppressed = 0;                // counted so QA can assert "zero writes"

function provisioned(){ return get(PROV_KEY) === '1'; }

function gatedSave(d){
  if(!provisioned() && !_allowWrite){ _suppressed++; return false; }
  _origSave(d);
  return true;
}
window.bkSave = gatedSave;
try { bkSave = gatedSave; } catch(e){}   /* rebind the lexical const/function if permitted */

/* The ONLY way to write while unprovisioned. Deliberate, explicit, auditable. */
window.bkWithWriteAuthority = function(reason, fn){
  var prev = _allowWrite;
  _allowWrite = true;
  try { return fn(); }
  finally { _allowWrite = prev; bkAuditWrite(reason); }
};
window.bkSuppressedWriteCount = function(){ return _suppressed; };

var _audit = [];
function bkAuditWrite(reason){
  _audit.push({ at:new Date().toISOString(), reason:String(reason||'unspecified') });
  if(_audit.length > 200) _audit.shift();
}
window.bkWriteAudit = function(){ return _audit.slice(); };

/* ---------------------------------------------------------------- 2. CLASSIFY */
/* Three outcomes, and only three. Anything not positively identifiable as
   legitimate production data FAILS CLOSED into quarantine.

   PRODUCTION    the value carries a _provenance stamp written by one of this
                 build's deliberate provisioning paths. Only V29.10.5+ data can
                 carry it, which is the point: provenance is the evidence.
   DEVELOPMENT   the value is one of the two fixture identities this codebase
                 has always shipped (BK-001 Harvard/Havard, BK-002 ShorePointe),
                 or carries _srcSeeded, the dev-fixture seeding marker.
   UNKNOWN       anything else, including unparseable values.

   DEVELOPMENT and UNKNOWN are both quarantined. They differ only in what the
   user is told, because "this is our old demo data" and "we cannot identify
   this" deserve different messages. */
var DEV_DEAL_IDS = ['BK-001','BK-002'];
var DEV_NAMES    = ['shorepointe','harvard avenue','havard avenue'];

function classifyDeal(raw){
  if(raw === null || raw === undefined) return { cls:'ABSENT', why:'no value stored' };
  var o = parse(raw);
  if(o === undefined) return { cls:'UNKNOWN', why:'value is not valid JSON' };
  if(o && typeof o === 'object' && o._provenance && o._provenance.schema)
    return { cls:'PRODUCTION', why:'carries a provenance stamp (' + o._provenance.createdBy + ')' };
  if(o && typeof o === 'object'){
    var id = String(o.dealId||'');
    var nm = String(o.name||'').toLowerCase();
    if(DEV_DEAL_IDS.indexOf(id) >= 0)
      return { cls:'DEVELOPMENT', why:'deal id ' + id + ' is a shipped development fixture' };
    if(DEV_NAMES.indexOf(nm) >= 0)
      return { cls:'DEVELOPMENT', why:'deal name "' + (o.name) + '" is a shipped development fixture' };
    if(o._srcSeeded === true)
      return { cls:'DEVELOPMENT', why:'carries _srcSeeded, the development source-tag seeding marker' };
  }
  return { cls:'UNKNOWN', why:'no provenance stamp and no recognised development signature' };
}
window.bkClassifyLegacyDeal = classifyDeal;

/* ---------------------------------------------------------------- 3. QUARANTINE */
function quarantineIndex(){
  var a = parse(get(QUAR_INDEX));
  return Array.isArray(a) ? a : [];
}
function quarantine(keys, classification, why){
  var stamp = new Date().toISOString().replace(/[:.]/g,'-');
  var idx = quarantineIndex();
  var moved = [];
  keys.forEach(function(k){
    var v = get(k);
    if(v === null) return;
    var qk = QUAR_PREFIX + stamp + '.' + k;
    if(set(qk, v)){ del(k); moved.push({ key:k, quarantineKey:qk, bytes:v.length }); }
  });
  if(moved.length){
    idx.push({ at:new Date().toISOString(), stamp:stamp, classification:classification,
               reason:why, entries:moved, restored:false });
    set(QUAR_INDEX, JSON.stringify(idx));
  }
  return moved;
}
window.bkQuarantineIndex = quarantineIndex;

/* Restore is a deliberate user action and therefore carries write authority.
   It puts the values back exactly as they were and marks the batch restored;
   nothing is re-classified or re-interpreted on the way back in. */
window.bkQuarantineRestore = function(stamp){
  var idx = quarantineIndex(), hit = null;
  idx.forEach(function(b){ if(b.stamp === stamp) hit = b; });
  if(!hit) return { ok:false, error:'no quarantine batch with stamp ' + stamp };
  return window.bkWithWriteAuthority('quarantine restore ' + stamp, function(){
    var back = [];
    hit.entries.forEach(function(e){
      var v = get(e.quarantineKey);
      if(v !== null){ set(e.key, v); back.push(e.key); }
    });
    hit.restored = true; hit.restoredAt = new Date().toISOString();
    set(QUAR_INDEX, JSON.stringify(idx));
    /* Restoring deal data means the user has asserted it is theirs. */
    if(back.indexOf('bkcapital.cre.v02') >= 0) set(PROV_KEY,'1');
    return { ok:true, restored:back };
  });
};

/* Permanent discard is available, but only when the user asks for it by name.
   Nothing in the boot path calls this. */
window.bkQuarantineDiscard = function(stamp){
  var idx = quarantineIndex(), keep = [], n = 0;
  idx.forEach(function(b){
    if(b.stamp === stamp){ b.entries.forEach(function(e){ del(e.quarantineKey); n++; }); }
    else keep.push(b);
  });
  set(QUAR_INDEX, JSON.stringify(keep));
  return { ok:true, discarded:n };
};

/* ---------------------------------------------------------------- 4. BOOT */
/* Runs exactly once per browser, before any bkEnsureVxx() executes. */
var _boot = null;
function boot(){
  var stampRaw = get(SCHEMA_KEY);
  var stamp = parse(stampRaw);

  /* Already migrated. Do nothing at all - this is the path every reload after
     the first one takes, and it must be completely inert so that genuine user
     data survives. */
  if(stamp && stamp.v >= SCHEMA){
    return { action:'none', schema:stamp.v, firstBoot:false,
             note:'schema current; lifecycle inert' };
  }

  /* Is there any legacy deal state at all? */
  var present = DEAL_KEYS.filter(function(k){ return get(k) !== null; });

  if(!present.length){
    set(SCHEMA_KEY, JSON.stringify({ v:SCHEMA, firstBoot:new Date().toISOString() }));
    return { action:'first-production-boot', schema:SCHEMA, firstBoot:true,
             quarantined:[], note:'clean browser; nothing to migrate' };
  }

  /* There is legacy state. Classify by the active-deal store, which is the one
     that determines whether an identity gets presented to the user. */
  var c = classifyDeal(get('bkcapital.cre.v02'));

  if(c.cls === 'PRODUCTION'){
    /* Carry it forward untouched, and keep the user provisioned so their
       portfolio is exactly where they left it. */
    set(PROV_KEY,'1');
    set(SCHEMA_KEY, JSON.stringify({ v:SCHEMA, firstBoot:new Date().toISOString(),
                                     migratedFrom:'pre-'+SCHEMA, outcome:'carried-forward' }));
    return { action:'migrated-forward', schema:SCHEMA, firstBoot:false, classification:c,
             quarantined:[], note:'legitimate production data preserved and left active' };
  }

  /* DEVELOPMENT or UNKNOWN -> fail closed. Quarantine every governed key that
     is present, leave the application blank, and tell the user plainly. */
  var moved = quarantine(present, c.cls, c.why);
  del(PROV_KEY);
  set(SCHEMA_KEY, JSON.stringify({ v:SCHEMA, firstBoot:new Date().toISOString(),
                                   migratedFrom:'pre-'+SCHEMA, outcome:'quarantined',
                                   classification:c.cls }));
  return { action:'quarantined', schema:SCHEMA, firstBoot:false, classification:c,
           quarantined:moved, note:'legacy state set aside, recoverable from Storage Lifecycle' };
}

try { _boot = boot(); } catch(e){ _boot = { action:'error', error:String(e && e.message) }; }
window.bkBootReport = function(){ return _boot; };

/* ---------------------------------------------------------------- 5. IDENTITY */
/* BK_BASE stays exactly as it is and keeps its job as the engine's units and
   defaults template. What changes is that it is no longer allowed to ANSWER
   THE QUESTION "what deal is loaded?". With nothing provisioned the honest
   answer is "none", and every canonical accessor now gives that answer. */
window.bkActiveDeal = function(){
  if(!provisioned()) return null;
  try { return (typeof bkLoad === 'function') ? bkLoad() : null; } catch(e){ return null; }
};
/* The engine's own template accessor, for code that legitimately needs the
   defaults (units, growth curves) rather than a deal identity. */
window.bkEngineTemplate = function(){
  try { return Object.assign({}, BK_BASE); } catch(e){ return {}; }
};

/* ---------------------------------------------------------------- 6. PROVISIONING */
/* Every deliberate path that brings a deal into existence stamps provenance
   and takes write authority explicitly. These are the only four doors. */
function stampProvenance(obj, how){
  obj._provenance = { createdBy:how, createdAt:new Date().toISOString(), schema:SCHEMA };
  return obj;
}
window.bkProvision = function(how, dealObj){
  return window.bkWithWriteAuthority('provision:' + how, function(){
    set(PROV_KEY,'1');
    if(dealObj && typeof dealObj === 'object'){
      _origSave(stampProvenance(dealObj, how));
    } else {
      var s = bkLoad();
      _origSave(stampProvenance(s, how));
    }
    return true;
  });
};
window.bkIsProvisioned = provisioned;
window.bkHasActiveDeal  = provisioned;
window.bkDeprovision = function(){ del(PROV_KEY); };

})();
