
/* ===========================================================================
   PUNCHLIST CAPITAL CRE - SUPABASE PERSISTENCE ADAPTER (V29.7)
   ===========================================================================
   SUPABASE STORES STATE. V29.6/V29.7 CALCULATES RESULTS.

   Nothing in this file computes an underwriting number. It maps the existing
   in-memory/localStorage deal state to and from the four Supabase tables and
   back again. The calculation engine is not touched, imported, wrapped or
   duplicated here. localStorage remains the live store the engine reads from:
   loading from Supabase writes the reconstructed state into that same single
   active-deal slot and then lets the unmodified engine recalculate.

   NO EXTERNAL DEPENDENCY. This talks to Supabase's PostgREST endpoint with
   plain fetch() rather than pulling supabase-js from a CDN, because the app is
   a single self-contained file and a blocked/failed CDN would otherwise take
   the whole page down. Every request is visible in this file.

   SECURITY: only the PUBLIC anon/publishable key is ever used. There is no
   service-role key and no database password anywhere in this file, and neither
   must ever be pasted into it - the anon key ships to every visitor's browser
   by design, a service-role key would hand them the entire database.
   =========================================================================== */
(function(){
'use strict';

/* -------------------------------------------------------------------------
   1. CONFIGURATION  --  BROWSER-SAFE PLACEHOLDERS
   -------------------------------------------------------------------------
   Replace the two strings below with the values from:
       Supabase Dashboard -> Project Settings -> API
         * Project URL            e.g. https://abcdefghijklm.supabase.co
         * anon / public key      (also labelled "publishable")
   BOTH ARE PUBLIC VALUES. They are safe in frontend JavaScript and safe to
   commit. Do NOT paste the service_role key, the JWT secret, or the database
   password here - those grant full unrestricted access and must never reach
   the browser.

   Alternatively, leave the placeholders alone and set the config at runtime
   without editing this file:
       bkCloudConfigure('https://xxxx.supabase.co', 'eyJhbGciOi...')
   which persists to localStorage under BK_SUPABASE_CFG_STORE below.
   ------------------------------------------------------------------------- */
var BK_SUPABASE_URL      = 'https://klgamvfjhgpxwhnrztrx.supabase.co';
var BK_SUPABASE_ANON_KEY = 'sb_publishable_Z5BCISii2xOw5XErlQ4JvA_pr39Nlrt';

var BK_SUPABASE_CFG_STORE = 'bkcapital.supabase.cfg.v01';
var BK_ENGINE_VERSION     = 'V32.2';

/* V30: the project URL and publishable key are fixed in the build. The former
   runtime override (localStorage 'bkcapital.supabase.cfg.v01', set from the Cloud
   Sync sheet) is no longer read: a stale override silently sent sign-in to the
   wrong project or key, and anything able to write localStorage could have pointed
   credentials at another endpoint. */
function bkCloudCfg(){
  return { url: String(BK_SUPABASE_URL||'').replace(/\/+$/,''), anonKey: String(BK_SUPABASE_ANON_KEY||'') };
}
function bkCloudConfigured(){
  var c = bkCloudCfg();
  return !!(c.url && c.anonKey
    && c.url.indexOf('REPLACE_WITH') === -1
    && c.anonKey.indexOf('REPLACE_WITH') === -1
    && /^https?:\/\//.test(c.url));
}
window.bkCloudConfigure = function(){
  throw new Error('The Supabase connection is fixed in the V30 production build and cannot be changed from the browser.');
};
window.bkCloudStatus = function(){
  var c = bkCloudCfg();
  return { configured: bkCloudConfigured(), url: c.url,
           keyPreview: c.anonKey ? (c.anonKey.slice(0,6)+'...'+c.anonKey.slice(-4)) : '' };
};


/* ===========================================================================
   SUPABASE AUTH  (V29.7.6-auth)
   ===========================================================================
   Adds authentication only. The financial engine, the Input Basis System, the
   frozen C/D persistence mapping, and every renderer are untouched.

   ONE REQUIRED CHANGE to the frozen adapter, and only one: the Authorization
   header. PostgREST derives auth.uid() from the bearer token, so ownership RLS
   cannot work while the adapter sends the publishable key as the bearer. The
   change is additive - signed out, it sends exactly what it sent before - and
   no request path, verb order, table, column or mapping function is altered.

   CREDENTIALS: only the publishable/anon key and the user's own session token
   are ever used. There is no service-role key anywhere, and bkCloudConfigure()
   refuses one. The publishable key is designed to ship in frontend JS; the
   session token belongs to the signed-in user and is stored only in their own
   browser.
   =========================================================================== */
(function(){
'use strict';

var AUTH_STORE = 'bkcapital.supabase.auth.v01';

// SINGLE CANONICAL CONFIG SOURCE.
// An earlier version of this module re-derived the configuration itself, reading a
// hard-coded 'bkcapital.supabase.cfg.v01' key directly. That created a SECOND
// lookup path, and it was wrong in two ways at once:
//   * it duplicated a storage key that belongs to the adapter (BK_SUPABASE_CFG_STORE)
//   * it read ONLY the localStorage override, never the baked-in
//     BK_SUPABASE_ANON_KEY constant - so with shipped credentials and no
//     "Save Connection" press, bkCloudConfigured() was true while auth saw an
//     empty key and reported "Supabase is not configured".
// This module is nested inside the adapter's IIFE, so the adapter's own
// bkCloudCfg() is already in lexical scope. Auth now consumes exactly that, and
// there is one configuration source for the whole app. No second key, no copy of
// the lookup, and no change to the frozen adapter.

function loadSession(){
  try{ return JSON.parse(localStorage.getItem(AUTH_STORE)||'null'); }catch(e){ return null; }
}
function saveSession(s){
  if(s) localStorage.setItem(AUTH_STORE, JSON.stringify(s));
  else   localStorage.removeItem(AUTH_STORE);
}

/* The token the adapter should present. Null when signed out, in which case the
   adapter falls back to its previous behaviour (publishable key as bearer). */
window.bkAuthToken = function(){
  var s = loadSession();
  return (s && s.access_token) ? s.access_token : null;
};
window.bkAuthUser = function(){
  var s = loadSession();
  return (s && s.user) ? { id:s.user.id, email:s.user.email } : null;
};
window.bkAuthSignedIn = function(){ return !!window.bkAuthToken(); };

function authFetch(path, body, extraHeaders){
  var c = bkCloudCfg();
  if(!c.url || !c.anonKey){ var ce=new Error('Supabase is not configured.'); ce.kind='config'; return Promise.reject(ce); }
  var h = { 'Content-Type':'application/json', 'apikey': c.anonKey };
  if(extraHeaders) Object.keys(extraHeaders).forEach(function(k){ h[k]=extraHeaders[k]; });
  return fetch(c.url + '/auth/v1/' + path, {
    method:'POST', headers:h, body: body ? JSON.stringify(body) : undefined
  }).catch(function(e){ var ne=new Error('network: '+(e&&e.message||e)); ne.kind='network'; throw ne; })
  .then(function(res){
    return res.text().then(function(txt){
      var data=null; if(txt){ try{ data=JSON.parse(txt); }catch(e){ data=txt; } }
      if(!res.ok){
        var msg = (data && (data.error_description || data.msg || data.message)) || ('HTTP '+res.status);
        var he = new Error(String(msg).slice(0,200)); he.status = res.status;
        he.code = (data && (data.error_code || data.error || data.code)) || '';
        throw he;
      }
      return data;
    });
  });
}

function adopt(d){
  if(!d || !d.access_token) return null;
  var s = { access_token:d.access_token, refresh_token:d.refresh_token,
            expires_at: Date.now() + ((d.expires_in||3600)*1000), user:d.user||null };
  saveSession(s);
  return s;
}

window.bkAuthSignUp = function(email, password){
  return authFetch('signup', {email:email, password:password}).then(function(d){
    // With email confirmation enabled Supabase returns a user but no session.
    var s = adopt(d);
    return { needsConfirmation: !s, user: d && d.user ? {id:d.user.id, email:d.user.email} : null };
  });
};
window.bkAuthSignIn = function(email, password){
  return authFetch('token?grant_type=password', {email:email, password:password}).then(function(d){
    var s = adopt(d);
    if(!s) throw new Error('Sign-in returned no session.');
    return window.bkAuthUser();
  });
};
window.bkAuthSignOut = function(){
  var tok = window.bkAuthToken();
  var done = function(){ saveSession(null);
    if(typeof currentSheet!=='undefined') showSheet(currentSheet); return true; };
  if(!tok) return Promise.resolve(done());
  return authFetch('logout', null, {'Authorization':'Bearer '+tok}).then(done).catch(done);
};
window.bkAuthRefresh = function(){
  var s = loadSession();
  if(!s || !s.refresh_token) return Promise.reject(new Error('No refresh token.'));
  return authFetch('token?grant_type=refresh_token', {refresh_token:s.refresh_token})
    .then(function(d){ var n=adopt(d); if(!n) throw new Error('Refresh returned no session.'); return n; })
    .catch(function(e){ saveSession(null); throw e; });
};
/* V30: ask the server whether the stored session is real. The previous boot only checked
   the locally stored expires_at, so any string placed in localStorage revealed the app. */
window.bkAuthVerify = function(){
  var c = bkCloudCfg(), tok = window.bkAuthToken();
  if(!tok) return Promise.reject(new Error('No session.'));
  return fetch(c.url + '/auth/v1/user', { method:'GET', headers:{ 'apikey':c.anonKey, 'Authorization':'Bearer '+tok } })
    .catch(function(e){ var ne=new Error('network: '+(e&&e.message||e)); ne.kind='network'; throw ne; })
    .then(function(res){ if(!res.ok){ var ve=new Error('Session rejected by server (HTTP '+res.status+').'); ve.status=res.status; throw ve; }
      return res.json(); })
    .then(function(u){ if(!u || !u.id) throw new Error('Session rejected by server.');
      var s = loadSession(); if(s && s.user && s.user.id && s.user.id !== u.id) throw new Error('Session user mismatch.');
      return { id:u.id, email:u.email }; });
};
/* Refresh slightly early so a long save never lands on an expired token. */
window.bkAuthEnsureFresh = function(){
  var s = loadSession();
  if(!s) return Promise.resolve(null);
  if(s.expires_at && Date.now() > (s.expires_at - 60000)) return window.bkAuthRefresh();
  return Promise.resolve(s);
};
})();

/* -------------------------------------------------------------------------
   2. PostgREST transport
   ------------------------------------------------------------------------- */
function bkSb(pathAndQuery, opts){
  opts = opts || {};
  return bkSbOnce(pathAndQuery, opts).catch(function(err){
    // V30: an expired/revoked session is not an RLS outcome. Refresh once and retry; if that
    // fails, fail closed (hide the app, purge local deal data, return to sign-in).
    if(err && err.status === 401 && !opts.__retried && typeof bkAuthSignedIn==='function' && bkAuthSignedIn()){
      return bkAuthRefresh().then(function(){ opts.__retried = true; return bkSbOnce(pathAndQuery, opts); })
        .catch(function(e2){
          if(typeof window.bkAuthFailClosed === 'function') window.bkAuthFailClosed('Your session expired. Sign in again.');
          throw (e2 && e2.status) ? e2 : err;
        });
    }
    throw err;
  });
}
function bkSbOnce(pathAndQuery, opts){
  if(typeof bkAuthSignedIn === 'function' && !bkAuthSignedIn()){
    var se = new Error('Supabase: not signed in.'); se.status = 401; return Promise.reject(se);
  }
  if(!bkCloudConfigured()){
    return Promise.reject(new Error('Supabase is not configured. Set the Project URL and anon key on the Cloud Sync sheet.'));
  }
  var c = bkCloudCfg();
  // V29.7.6-auth - THE ONE REQUIRED CHANGE to the frozen adapter.
  // PostgREST derives auth.uid() from the BEARER token, so ownership RLS cannot
  // work while the publishable key is the bearer. Signed in, we present the
  // user's session token; signed out, this is byte-for-byte the previous
  // behaviour. 'apikey' remains the publishable key either way, which is what
  // Supabase's gateway authenticates the project with.
  // No request path, verb order, table, column or mapping function is changed.
  var bearer = bkAuthToken();
  var headers = {
    'apikey'        : c.anonKey,
    'Authorization' : 'Bearer ' + bearer,
    'Content-Type'  : 'application/json',
    'Accept'        : 'application/json'
  };
  if(opts.prefer) headers['Prefer'] = opts.prefer;
  return fetch(c.url + '/rest/v1/' + pathAndQuery, {
    method  : opts.method || 'GET',
    headers : headers,
    body    : opts.body ? JSON.stringify(opts.body) : undefined
  }).catch(function(e){ var ne=new Error('Supabase unreachable ('+(e&&e.message||e)+')'); ne.kind='network'; throw ne; })
  .then(function(res){
    return res.text().then(function(txt){
      var data = null;
      if(txt){ try{ data = JSON.parse(txt); }catch(e){ data = txt; } }
      if(!res.ok){
        var msg = (data && data.message) ? data.message : ('HTTP ' + res.status);
        var hint = (data && data.hint) ? (' - ' + data.hint) : '';
        if(res.status === 401 || res.status === 403){
          var who = (typeof bkAuthSignedIn === 'function' && bkAuthSignedIn())
            ? (res.status === 401 ? 'Your session is no longer valid.'
               : 'Signed in, but the server refused this request (row-level security).')
            : 'Not signed in. Deal data is private to its owner - sign in on the Cloud Sync sheet.';
          msg = msg + ' - ' + who;
        }
        var err = new Error('Supabase: ' + msg + hint);
        err.status = res.status; err.detail = data;
        throw err;
      }
      return data;
    });
  });
}

/* -------------------------------------------------------------------------
   3. PURE MAPPING  (no network, no engine calls - unit-testable in isolation)
   ------------------------------------------------------------------------- */

// Keys that live somewhere OTHER than input_data.
var BK_NON_INPUT_KEYS = ['rentRoll','_src','_srcSeeded'];

// ---------------------------------------------------------------------------
// DATE-COLUMN SERIALISER  --  the ONLY way this adapter writes a date cell.
// ---------------------------------------------------------------------------
// PostgreSQL rejects '' for a date column ("invalid input syntax for type date").
// The app's lease dates and closing date are free-text fields that are legitimately
// BLANK (a vacant shell with no lease has leaseStart === ''), so a blank must be
// sent as SQL NULL - the correct representation of "no date" - never as ''.
//
// Rules, applied to every date-bearing column without exception:
//   blank / null / undefined / whitespace-only  ->  null   (SQL NULL)
//   anything else                               ->  the value EXACTLY as stored
// No date is invented, defaulted, reformatted or inferred. A value the user typed
// is passed through byte-for-byte; only the absence of a value becomes NULL.
function bkDateCell(v){
  if(v === undefined || v === null) return null;
  var t = String(v).trim();
  if(t === '') return null;
  return String(v);
}

// deals row. Identity/index layer ONLY - never the engine's source of truth.
function bkStateToDealRow(s){
  // closing_date is a denormalised convenience column for sorting/filtering deal
  // lists. The engine only ever reads input_data.closing (the original string,
  // untouched). If the string is not one of the two shapes the app actually
  // produces we store NULL rather than guessing - blank is preferable to wrong.
  var d = (typeof bkParseDealDate==='function') ? bkParseDealDate(s.closing, null) : null;
  var iso = null;
  if(d && !isNaN(d.getTime())){
    iso = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  return {
    deal_code       : s.dealId || null,
    investment_name : s.name || null,
    location        : s.location || null,
    deal_type       : s.dealType || null,
    property_type   : s.propertyType || null,
    status          : s.status || null,
    closing_date    : bkDateCell(iso)
    // scenario is intentionally NOT written. It stays at its 'BASE CASE'
    // default as forward-looking metadata; the live engine has no scenario
    // concept and this adapter does not invent one.
  };
}

// input_data: the complete RESOLVED engine state minus rentRoll/_src.
// Storing the resolved object (not bkSave's sparse form) makes the row
// self-describing and pins every value, so a future change to BK_BASE
// defaults cannot silently move a saved deal's economics.
function bkStateToInputData(s){
  var out = {};
  for(var k in s){
    if(!Object.prototype.hasOwnProperty.call(s,k)) continue;
    if(BK_NON_INPUT_KEYS.indexOf(k) !== -1) continue;
    out[k] = s[k];
  }
  return out;
}

// source_data: the _src source/basis tag map, preserved verbatim.
function bkStateToSourceData(s){
  return { _src: s._src || {}, _srcSeeded: s._srcSeeded === true };
}

// rent_roll_units rows. sort_order preserves array position, which is what the
// live UI indexes into via bkRRSet(idx,...). unit_id is a free-text label the
// user can rename or duplicate, so it is never used as a key.
function bkStateToRentRollRows(s, dealUuid){
  var rr = Array.isArray(s.rentRoll) ? s.rentRoll : [];
  return rr.map(function(u, i){
    return {
      deal_id           : dealUuid,
      sort_order        : i,
      unit_id           : (u.unitId === undefined || u.unitId === null) ? '' : String(u.unitId),
      sf                : Number(u.sf) || 0,
      tenant_type       : (u.tenantType === 'Residential') ? 'Residential' : 'Commercial',
      status            : (u.status === 'Vacant') ? 'Vacant' : 'Occupied',
      in_place_rent     : Number(u.inPlaceRent) || 0,
      market_rent       : Number(u.marketRent) || 0,
      recovery          : Number(u.recovery) || 0,
      // Proof Point 2: stored EXACTLY as a boolean. Nothing in SQL interprets
      // it; bkRecoveryActive() in the engine remains the single definition of
      // when a recovery counts.
      recovery_override : u.recoveryOverride === true,
      // Blank -> SQL NULL, otherwise the user's exact string. Sending '' here is
      // what produced: invalid input syntax for type date: "" -- a vacant unit with
      // no lease legitimately has leaseStart === ''. NULL is the correct encoding of
      // "no lease date"; it round-trips back to '' in bkRentRollRowsToState below.
      lease_start       : bkDateCell(u.leaseStart),
      lease_end         : bkDateCell(u.leaseEnd),
      rollover_override : (u.rolloverOverride && typeof u.rolloverOverride === 'object')
                            ? u.rolloverOverride : null
    };
  });
}

function bkRentRollRowsToState(rows){
  if(!Array.isArray(rows)) return [];
  return rows.slice().sort(function(a,b){ return (a.sort_order|0) - (b.sort_order|0); })
    .map(function(r){
      var u = {
        unitId      : r.unit_id === null ? '' : r.unit_id,
        sf          : Number(r.sf) || 0,
        tenantType  : r.tenant_type,
        status      : r.status,
        inPlaceRent : Number(r.in_place_rent) || 0,
        marketRent  : Number(r.market_rent) || 0,
        recovery    : Number(r.recovery) || 0,
        leaseStart  : r.lease_start === null ? '' : r.lease_start,
        leaseEnd    : r.lease_end === null ? '' : r.lease_end
      };
      // The app writes recoveryOverride as a real boolean; mirror that exactly.
      u.recoveryOverride = (r.recovery_override === true);
      // The app DELETES rolloverOverride when cleared, so absence must
      // round-trip as absence rather than as an empty object.
      if(r.rollover_override && typeof r.rollover_override === 'object'
         && Object.keys(r.rollover_override).length){
        u.rolloverOverride = r.rollover_override;
      }
      return u;
    });
}

// Rebuild a complete active-deal state object.
// PRECEDENCE: input_data is authoritative. The deals row is an identity/index
// layer for querying and only fills a field that input_data does not carry -
// Source/identity tables must never override approved underwriting inputs.
function bkReconstructState(dealRow, inputRow, rrRows){
  var st = {};
  var input = (inputRow && inputRow.input_data) ? inputRow.input_data : {};
  for(var k in input){ if(Object.prototype.hasOwnProperty.call(input,k)) st[k] = input[k]; }

  if(dealRow){
    var fill = {
      dealId      : dealRow.deal_code,
      name        : dealRow.investment_name,
      location    : dealRow.location,
      dealType    : dealRow.deal_type,
      propertyType: dealRow.property_type,
      status      : dealRow.status
    };
    for(var f in fill){
      if(st[f] === undefined && fill[f] !== null && fill[f] !== undefined) st[f] = fill[f];
    }
    // NOTE: deals.closing_date is deliberately NOT used to repopulate
    // state.closing. input_data.closing holds the user's original string and is
    // the only value the engine reads; the date column is a lossy convenience.
  }

  var src = (inputRow && inputRow.source_data) ? inputRow.source_data : null;
  if(src){
    if(src._src && typeof src._src === 'object') st._src = src._src;
    if(src._srcSeeded === true) st._srcSeeded = true;
  }

  st.rentRoll = bkRentRollRowsToState(rrRows || []);
  return st;
}

// Expose the pure mappers for the offline round-trip test harness.
window.bkCloudCfg = bkCloudCfg; window.bkCloudConfigured = bkCloudConfigured;
window.bkSb = bkSb;   /* V30: shared authenticated transport for the persistence layer */
window.bkMap = {
  stateToDealRow      : bkStateToDealRow,
  stateToInputData    : bkStateToInputData,
  stateToSourceData   : bkStateToSourceData,
  stateToRentRollRows : bkStateToRentRollRows,
  rentRollRowsToState : bkRentRollRowsToState,
  reconstructState    : bkReconstructState
};

/* -------------------------------------------------------------------------
   4. NETWORK OPERATIONS
   ------------------------------------------------------------------------- */
function q(v){ return encodeURIComponent(v); }

/* -------------------------------------------------------------------------
   deal_snapshots COLUMN DISCOVERY
   -------------------------------------------------------------------------
   The canonical snapshot JSON column is snapshot_data. There is exactly ONE
   snapshot JSON column - the adapter never writes a second one.

   This project's deal_snapshots table predates schema.sql, so schema.sql's
   CREATE TABLE IF NOT EXISTS skipped it and only its ALTER ... ADD COLUMN IF
   NOT EXISTS statements applied. That means the set of columns actually present
   can differ from the file. Rather than assume (which is what produced
   "Could not find the 'payload' column"), the adapter probes the live table
   once and writes only columns that genuinely exist, reporting anything it had
   to omit instead of failing the whole save.
   ------------------------------------------------------------------------- */
var BK_SNAP_COLS = null;   // cached probe result
window.bkSnapshotColumns = function(force){
  if(BK_SNAP_COLS && !force) return Promise.resolve(BK_SNAP_COLS);
  var candidates = ['snapshot_data','deal_id','snapshot_label','engine_version','created_at','id'];
  // Probe each column with a zero-row select; PostgREST errors on an unknown column.
  return Promise.all(candidates.map(function(c){
    return bkSb('deal_snapshots?select=' + q(c) + '&limit=1')
      .then(function(){ return c; })
      .catch(function(){ return null; });
  })).then(function(found){
    BK_SNAP_COLS = found.filter(Boolean);
    if(BK_SNAP_COLS.indexOf('snapshot_data') === -1){
      // Nothing to write the state into - surface it rather than silently no-op.
      throw new Error('deal_snapshots has no snapshot_data column. Present: ' +
        (BK_SNAP_COLS.join(', ') || '(none detected)') +
        '. Add it with:  alter table public.deal_snapshots add column if not exists snapshot_data jsonb;');
    }
    return BK_SNAP_COLS;
  });
};


function bkFindDealByCode(code){
  return bkSb('deals?deal_code=eq.' + q(code) + '&select=*&limit=1')
    .then(function(rows){ return (rows && rows.length) ? rows[0] : null; });
}

// SAVE the active deal. Writes deals -> underwriting_inputs -> rent_roll_units.
window.bkCloudSaveDeal = function(){
  // A save is several sequential requests; refresh a near-expired token first so
  // it cannot expire between the deals insert and the rent-roll insert.
  if(typeof bkAuthEnsureFresh === 'function' && typeof bkAuthSignedIn === 'function' && bkAuthSignedIn()){
    return bkAuthEnsureFresh().then(function(){ return bkCloudSaveDealInner(); });
  }
  return bkCloudSaveDealInner();
};
/* V30: one atomic RPC (bk_save_deal). The old sequence (upsert deal -> upsert inputs
   -> DELETE rent roll -> INSERT rent roll) could leave a deal with no rent roll if the
   final insert failed. The previous saved version now survives any failure intact. */
function bkCloudSaveDealInner(){
  return window.BK_SYNC.saveActiveDeal();
}

// LOAD a deal from Supabase into the single active slot, atomically.
window.bkCloudLoadDeal = function(dealCode){
  return (window.BK_SYNC ? window.BK_SYNC.flush(5000) : Promise.resolve()).then(function(){ return bkFindDealByCode(dealCode); }).then(function(deal){
    if(!deal) throw new Error('No deal in Supabase with code "' + dealCode + '".');
    return Promise.all([
      bkSb('underwriting_inputs?deal_id=eq.' + q(deal.id) + '&select=*&limit=1'),
      bkSb('rent_roll_units?deal_id=eq.' + q(deal.id) + '&select=*&order=sort_order.asc')
    ]).then(function(res){
      var inputRow = (res[0] && res[0].length) ? res[0][0] : null;
      var st = bkReconstructState(deal, inputRow, res[1] || []);
      // ATOMIC SWAP into the single active slot, then record it as the last active deal.
      window.BK_SYNC.activateCloudDeal(deal, st, 'cloud-load');
      var after = window.BK_SYNC.lastMigration && window.BK_SYNC.lastMigration.migrated
        ? window.BK_SYNC.saveActiveDeal() : window.BK_SYNC.putAppState();
      return after.then(function(){
        if(typeof currentSheet!=='undefined') showSheet(currentSheet);
        return { dealCode: deal.deal_code, units: st.rentRoll.length, engineVersion: inputRow ? inputRow.engine_version : null };
      });
    });
  });
};

window.bkCloudListDeals = function(){
  return bkSb('deals?select=id,deal_code,investment_name,property_type,status,updated_at&order=deal_code.asc');
};

// SNAPSHOT: frozen, self-contained copy. Mirrors bkPortfolioAddCurrent().
window.bkCloudSaveSnapshot = function(label){
  if(typeof bkIsProvisioned==='function' && !bkIsProvisioned())
    return Promise.reject(new Error('No active deal to snapshot.'));
  var s = bkLoad();
  var key = label || String(s.dealId || s.name || 'untitled');
  return bkSnapshotColumns().then(function(cols){
    return bkFindDealByCode(s.dealId || s.name).then(function(deal){
      // Deep clone of the WHOLE state, exactly like the Portfolio array.
      var full = {
        deal_id        : deal ? deal.id : null,
        snapshot_label : key,
        snapshot_data  : JSON.parse(JSON.stringify(s)),
        engine_version : BK_ENGINE_VERSION
      };
      var row = {}, omitted = [];
      Object.keys(full).forEach(function(k){
        if(cols.indexOf(k) !== -1) row[k] = full[k]; else omitted.push(k);
      });
      return bkSb('deal_snapshots', { method:'POST', body:row, prefer:'return=representation' })
        .then(function(r){
          var made = r[0] || {};
          made.__omittedColumns = omitted;   // reported, never silently dropped
          return made;
        });
    });
  });
};

window.bkCloudListSnapshots = function(){
  return bkSnapshotColumns().then(function(cols){
    var want = ['id','deal_id','snapshot_label','engine_version','created_at']
                 .filter(function(c){ return cols.indexOf(c) !== -1; });
    var order = cols.indexOf('created_at') !== -1 ? '&order=created_at.desc' : '';
    return bkSb('deal_snapshots?select=' + want.join(',') + order + '&limit=100');
  });
};

// Loading a snapshot is an EXPLICIT load: it replaces the active slot wholesale.
// A snapshot is otherwise inert - merely existing never makes it active.
window.bkCloudLoadSnapshot = function(id){
  return bkSb('deal_snapshots?id=eq.' + q(id) + '&select=*&limit=1').then(function(rows){
    if(!rows || !rows.length) throw new Error('Snapshot not found.');
    var snap = rows[0].snapshot_data;
    if(!snap || typeof snap !== 'object') throw new Error('Snapshot snapshot_data is empty.');
    // ATOMIC: one write of the frozen state into the single active slot. A snapshot
    // is inert until this explicit load; merely existing never makes it active.
    var loadedSnap=JSON.parse(JSON.stringify(snap));
    if(typeof window.bkProvision==='function') window.bkProvision('cloud-snapshot-load', loadedSnap);
    else bkSave(loadedSnap);
    if(typeof currentSheet!=='undefined') showSheet(currentSheet);
    return { label: rows[0].snapshot_label, units: (snap.rentRoll||[]).length };
  });
};

// Connectivity probe.
window.bkCloudPing = function(){
  var t0 = Date.now();
  return bkSb('deals?select=id&limit=1').then(function(){
    return { ok:true, ms: Date.now()-t0 };
  });
};

/* -------------------------------------------------------------------------
   5. CLOUD SYNC SHEET  (reuses the existing Punchlist Capital design system only)
   ------------------------------------------------------------------------- */
var bkCloudMsg = null;
function note(kind, text){ bkCloudMsg = { kind:kind, text:text }; if(typeof currentSheet!=='undefined') showSheet(currentSheet); }
window.bkCloudNote = note;
function esc(v){ return (typeof bkEsc==='function') ? bkEsc(v) : String(v==null?'':v); }

var bkCloudDeals = null, bkCloudSnaps = null;

window.bkCloudRefresh = function(){
  if(!bkCloudConfigured()){ note('warn','Not configured yet - enter the Project URL and anon key above.'); return; }
  Promise.all([bkCloudListDeals(), bkCloudListSnapshots()]).then(function(r){
    bkCloudDeals = r[0]||[]; bkCloudSnaps = r[1]||[];
    note('ok','Connected. ' + bkCloudDeals.length + ' deal(s), ' + bkCloudSnaps.length + ' snapshot(s).');
  }).catch(function(e){ note('err', e.message); });
};
window.bkCloudSaveClick = function(){
  bkCloudSaveDeal().then(function(r){
    note('ok','Saved "'+r.dealCode+'" to Supabase ('+r.units+' rent-roll unit(s)).');
    bkCloudRefresh();
  }).catch(function(e){ note('err', e.message); });
};
window.bkCloudLoadClick = function(code){
  bkCloudLoadDeal(code).then(function(r){
    note('ok','Loaded "'+r.dealCode+'" from Supabase ('+r.units+' rent-roll unit(s)). This is now the active deal.');
  }).catch(function(e){ note('err', e.message); });
};
window.bkCloudSnapClick = function(){
  bkCloudSaveSnapshot().then(function(r){
    note('ok','Snapshot "'+r.snapshot_label+'" saved.'); bkCloudRefresh();
  }).catch(function(e){ note('err', e.message); });
};
window.bkCloudLoadSnapClick = function(id){
  bkCloudLoadSnapshot(id).then(function(r){
    note('ok','Snapshot "'+r.label+'" loaded into the active deal slot.');
  }).catch(function(e){ note('err', e.message); });
};
window.bkAuthSignInClick = function(){
  var e=document.getElementById('bk-auth-email'), w=document.getElementById('bk-auth-pw');
  if(!e||!w) return;
  note('ok','Signing in...');
  bkAuthSignIn(e.value.trim(), w.value).then(function(u){
    note('ok','Signed in as '+u.email+'. Deal data is now scoped to your account.');
    bkCloudDeals=null; bkCloudSnaps=null; bkCloudRefresh();
  }).catch(function(err){ note('err','Sign-in failed: '+err.message); });
};
window.bkAuthSignUpClick = function(){
  var e=document.getElementById('bk-auth-email'), w=document.getElementById('bk-auth-pw');
  if(!e||!w) return;
  note('ok','Creating account...');
  bkAuthSignUp(e.value.trim(), w.value).then(function(r){
    if(r.needsConfirmation) note('ok','Account created. Confirm the email, then sign in.');
    else { note('ok','Account created and signed in.'); bkCloudRefresh(); }
  }).catch(function(err){ note('err','Sign-up failed: '+err.message); });
};
window.bkAuthSignOutClick = function(){
  bkAuthSignOut().then(function(){
    bkCloudDeals=null; bkCloudSnaps=null;
    note('ok','Signed out. Deal data is no longer accessible until you sign in again.');
  });
};

function cloudSheet(){
  var st = bkCloudStatus();
  var s  = (typeof bkIsProvisioned!=='function'||bkIsProvisioned()) ? bkLoad() : {};
  var activeKey = String(s.dealId || s.name || '');

  var chip = st.configured
    ? '<span class="status-chip pass">Configured</span>'
    : '<span class="status-chip">Not configured</span>';

  var user = (typeof bkAuthUser==='function') ? bkAuthUser() : null;
  var authChip = user
    ? '<span class="status-chip pass">Signed in</span>'
    : '<span class="status-chip">Signed out</span>';
  var authBlock = '<div class="tbl-wrap"><table class="fin"><caption>Account</caption>'
    + '<thead><tr><th class="rowlabel-h">Field</th><th>Value</th><th style="text-align:left">Notes</th></tr></thead><tbody>'
    + (user
        ? '<tr><td class="rowlabel">Signed in as</td><td class="v" data-bk-align="text">'+esc(user.email||'-')+'</td>'
          + '<td data-bk-align="text">Deal data is scoped to this account</td></tr>'
          + '<tr><td class="rowlabel">User ID</td><td class="v" data-bk-align="text"><code>'+esc(user.id)+'</code></td>'
          + '<td data-bk-align="text">This is the owner_id on your deals</td></tr>'
        : '<tr><td class="rowlabel">Email</td>'
          + '<td class="v" data-bk-align="text"><input id="bk-auth-email" type="email" autocomplete="username" '
          + 'style="width:100%;font:inherit;padding:2px 4px;"></td>'
          + '<td data-bk-align="text">Deal data is private to its owner</td></tr>'
          + '<tr><td class="rowlabel">Password</td>'
          + '<td class="v" data-bk-align="text"><input id="bk-auth-pw" type="password" autocomplete="current-password" '
          + 'style="width:100%;font:inherit;padding:2px 4px;"></td>'
          + '<td data-bk-align="text">Handled by Supabase Auth; never stored by this app</td></tr>')
    + '<tr><td class="rowlabel">Status</td><td class="v" data-bk-align="text">'+authChip+'</td>'
    + '<td data-bk-align="text">Publishable key only - no service-role credential</td></tr>'
    + '</tbody></table></div>'
    + '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">'
    + (user
        ? '<button type="button" class="status-chip" onclick="bkAuthSignOutClick()">Sign Out</button>'
        : '<button type="button" class="status-chip pass" onclick="bkAuthSignInClick()">Sign In</button>'
          + '<button type="button" class="status-chip" onclick="bkAuthSignUpClick()">Create Account</button>')
    + '</div>';

  var sync = window.BK_SYNC || {};
  var syncTxt = sync.mode === 'migration-required' ? '<span class="status-chip warn">MIGRATION / CONFIGURATION REQUIRED</span>'
              : sync.mode === 'live' ? (sync.lastError ? '<span class="status-chip warn">NOT SAVED</span>' : '<span class="status-chip pass">Live</span>')
              : '<span class="status-chip">'+esc(sync.mode||'-')+'</span>';
  var cfg = '<div class="tbl-wrap" style="margin-top:16px;"><table class="fin"><caption>Supabase Connection</caption>'
    + '<thead><tr><th class="rowlabel-h">Setting</th><th>Value</th><th style="text-align:left">Notes</th></tr></thead><tbody>'
    + '<tr><td class="rowlabel">Project URL</td><td class="v" data-bk-align="text">'+esc(st.url)+'</td>'
    + '<td data-bk-align="text">Fixed in the production build</td></tr>'
    + '<tr><td class="rowlabel">Publishable key</td><td class="v" data-bk-align="text">'+esc(st.keyPreview)+'</td>'
    + '<td data-bk-align="text">Public browser key only - never a service-role key</td></tr>'
    + '<tr><td class="rowlabel">Cloud Persistence</td><td class="v" data-bk-align="text">'+syncTxt+'</td>'
    + '<td data-bk-align="text">'+(sync.mode==='migration-required'
        ? 'Run BK_Capital_V30_Supabase_Migration.sql, then sign in again'
        : 'Deal, rent roll, portfolio, investors, master data and approvals save automatically')+'</td></tr>'
    + (sync.lastError ? '<tr><td class="rowlabel">Last Error</td><td class="v" data-bk-align="text" colspan="2">'+esc(sync.lastError)+'</td></tr>' : '')
    + (Array.isArray(sync.restoreNotes) && sync.restoreNotes.length ? '<tr><td class="rowlabel">Restore Notes</td><td class="v" data-bk-align="text" colspan="2">'+esc(sync.restoreNotes.join(' '))+'</td></tr>' : '')
    + '<tr><td class="rowlabel">Engine</td><td class="v" data-bk-align="text">'+esc(BK_ENGINE_VERSION)+'</td><td data-bk-align="text">Application build</td></tr>'
    + '</tbody></table></div>'
    + '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">'
    + '<button type="button" class="status-chip" onclick="bkCloudRefresh()">Refresh</button>'
    + '</div>';

  var msg = '';
  if(bkCloudMsg){
    var cls = bkCloudMsg.kind==='ok' ? 'pass' : '';
    msg = '<div class="note-flag"><span>'+(bkCloudMsg.kind==='ok'?'&#10003;':'&#9888;')+'</span><div>'
        + esc(bkCloudMsg.text)+'</div></div>';
  }

  var actions = '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">'
    + ((typeof bkIsProvisioned!=='function'||bkIsProvisioned())
        ? '<button type="button" class="status-chip pass" onclick="bkCloudSaveClick()">Save Active Deal ('+esc(activeKey||'untitled')+') to Supabase</button>'
          + '<button type="button" class="status-chip" onclick="bkCloudSnapClick()">Save Snapshot</button>'
        : '<span class="status-chip">No active deal to save</span>')
    + '</div>'
    ;

  var dealRows = '';
  if(bkCloudDeals === null){
    dealRows = '<tr><td class="rowlabel" colspan="5">Not loaded yet - press Test / Refresh.</td></tr>';
  } else if(!bkCloudDeals.length){
    dealRows = '<tr><td class="rowlabel" colspan="5">No deals saved to Supabase yet.</td></tr>';
  } else {
    dealRows = bkCloudDeals.map(function(d){
      var isActive = String(d.deal_code||'') === activeKey;
      return '<tr><td class="rowlabel">'+esc(d.deal_code||'-')+'</td>'
        + '<td style="text-align:left">'+esc(d.investment_name||'-')+'</td>'
        + '<td style="text-align:left">'+esc(d.property_type||'-')+'</td>'
        + '<td style="text-align:left">'
        + (isActive ? '<span class="status-chip pass">ACTIVE</span>' : '<span class="status-chip">Saved</span>')
        + '</td>'
        + '<td style="text-align:center"><button type="button" class="status-chip" '
        + 'onclick="bkCloudLoadClick('+JSON.stringify(String(d.deal_code)).replace(/"/g,'&quot;')+')">Load</button> '
        + '<button type="button" class="status-chip" data-bk-delete="'+esc(d.deal_code)+'" '
        + 'onclick="bkCloudDeleteClick('+JSON.stringify(String(d.id)).replace(/"/g,'&quot;')+','+JSON.stringify(String(d.deal_code)).replace(/"/g,'&quot;')+')">Delete</button></td></tr>';
    }).join('');
  }

  var dealTbl = '<div class="tbl-wrap" style="margin-top:16px;"><table class="fin">'
    + '<caption>Deals in Supabase</caption><thead><tr>'
    + '<th class="rowlabel-h">Deal</th><th style="text-align:left">Property</th>'
    + '<th style="text-align:left">Type</th><th style="text-align:left">State</th>'
    + '<th style="text-align:center">Action</th></tr></thead><tbody>'+dealRows+'</tbody></table></div>';

  var snapRows = '';
  if(bkCloudSnaps === null){ snapRows = '<tr><td class="rowlabel" colspan="4">Not loaded yet.</td></tr>'; }
  else if(!bkCloudSnaps.length){ snapRows = '<tr><td class="rowlabel" colspan="4">No snapshots saved yet.</td></tr>'; }
  else {
    snapRows = bkCloudSnaps.map(function(sn){
      return '<tr><td class="rowlabel">'+esc(sn.snapshot_label||'-')+'</td>'
        + '<td style="text-align:left">'+esc((sn.created_at||'').slice(0,19).replace('T',' '))+'</td>'
        + '<td style="text-align:left">'+esc(sn.engine_version||'-')+'</td>'
        + '<td style="text-align:center"><button type="button" class="status-chip" '
        + 'onclick="bkCloudLoadSnapClick('+JSON.stringify(String(sn.id)).replace(/"/g,'&quot;')+')">Load</button></td></tr>';
    }).join('');
  }
  var snapTbl = '<div class="tbl-wrap" style="margin-top:16px;"><table class="fin">'
    + '<caption>Frozen Snapshots</caption><thead><tr>'
    + '<th class="rowlabel-h">Label</th><th style="text-align:left">Created</th>'
    + '<th style="text-align:left">Engine</th><th style="text-align:center">Action</th>'
    + '</tr></thead><tbody>'+snapRows+'</tbody></table></div>';

  var arch = '<div class="note-flag"><span>&#8505;</span><div>'
    + '<b>Supabase stores state; the engine calculates results.</b> Loading a deal writes the reconstructed '
    + 'state into the same single active-deal slot the engine already reads, then lets the unmodified '
    + 'engine recalculate. Every change is saved automatically and the last active deal is restored at sign-in; '
    + 'the browser copy is only a working cache. A saved snapshot is not the active deal until you press Load. '
    + 'Only the public anon key is used - never a service_role key.</div></div>';

  var gate = user ? '' :
      '<div class="note-flag"><span>&#9888;</span><div><b>Signed out.</b> Deal data in Supabase is private to '
    + 'its owner, so saving and loading are unavailable until you sign in. The local (browser) store and the '
    + 'calculation engine are unaffected and continue to work exactly as before.</div></div>';
  var main = authBlock + gate + cfg + msg + (user ? actions : '') + (user ? dealTbl + snapTbl : '') + arch;
  var sidebar = sidebarShell(
      '<div class="card"><div class="card-head">Cloud Sync</div><div class="metric-list">'
    + '<div class="metric-row"><span class="k">Connection</span><span class="v">'+chip+'</span></div>'
    + '<div class="metric-row"><span class="k">Deals</span><span class="v">'+(bkCloudDeals?bkCloudDeals.length:'-')+'</span></div>'
    + '<div class="metric-row"><span class="k">Snapshots</span><span class="v">'+(bkCloudSnaps?bkCloudSnaps.length:'-')+'</span></div>'
    + '<div class="metric-row"><span class="k">Account</span><span class="v">'+authChip+'</span></div>'
    + '<div class="metric-row"><span class="k">Cloud Persistence</span><span class="v">'+syncTxt+'</span></div>'
    + '</div></div>'
    + modelInfoCard('<div class="metric-row"><span class="k">Tab Group</span><span class="v">Portfolio &amp; Investors</span></div>'
                  + '<div class="metric-row"><span class="k">Persistence</span><span class="v">Supabase + localStorage</span></div>')
    + colorKeyCard());

  return { title:'Cloud Sync', crumbs:'Portfolio & Investors',
           desc:'Save and load the active deal and frozen snapshots to Supabase. Persistence only - no calculation happens here.',
           meta:{ Account: user ? (user.email||'Signed in') : 'Signed out',
                  Connection: st.configured?'Configured':'Not configured',
                  'Active Deal': activeKey||'-',
                  Deals: bkCloudDeals?bkCloudDeals.length:'-',
                  Engine: BK_ENGINE_VERSION },
           main:main, sidebar:sidebar };
}

// Direct assignment into RENDERERS (NOT via a bare function name) so the sheet
// is genuinely reachable - the pattern that previously left After-Tax detached.
if(typeof RENDERERS !== 'undefined'){ RENDERERS['Cloud Sync'] = cloudSheet; }

// Register in the real navigation structure so it is a normal clickable sheet.
if(typeof GROUPS !== 'undefined'){
  var g = GROUPS.filter(function(x){ return x.id==='portfolio'; })[0];
  if(g && g.sheets.indexOf('Cloud Sync') === -1) g.sheets.push('Cloud Sync');
}

})();

/* V30: the live round-trip self-test that wrote Harvard (BK-001) / ShorePointe (BK-002)
   test deals into the signed-in user's real account was removed. The equivalent
   coverage runs in the offline regression harness against a stand-in project. */

