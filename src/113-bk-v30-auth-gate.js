
/* ===========================================================================
   V30.0 AUTHENTICATION GATE - the only path into the application
   ===========================================================================
   OPEN -> gate -> (existing session: refresh if near expiry -> VALIDATE WITH
   SUPABASE) or (sign-in -> VALIDATE WITH SUPABASE) -> purge any local state
   left by a previous browser user -> restore this user's cloud state ->
   reveal -> Home.

   The app is revealed only after the server has accepted the session. A token
   fabricated or left in localStorage never reveals anything. A session that
   stops working mid-use is refreshed once; if that fails the gate closes,
   local data is purged and the sign-in screen explains why.
   =========================================================================== */
(function(){
'use strict';
var AUTH_KEY = 'bkcapital.supabase.auth.v01';
/* Kept across purge: only the schema stamp and the auth session itself. The old
   connection-override key (bkcapital.supabase.cfg.v01) is deliberately NOT kept:
   a stale override silently pointed sign-in at the wrong project/key. */
/* bkcapital.sensitivity.view.v01 (Sensitivity Explorer view settings) and bkcapital.ui.prefs.v01
   (navigation preferences) hold UI preferences only - no deal data - so they survive sign-in/reload. */
var KEEP_KEYS = ['bkcapital.app.schema.v01', AUTH_KEY, 'bkcapital.sensitivity.view.v01', 'bkcapital.ui.prefs.v01'];
function purgeUserData(){
  if(window.BK_SYNC) window.BK_SYNC.stop();          // never propagate a purge to the cloud
  try{ Object.keys(localStorage).forEach(function(k){
    if(k.indexOf('bkcapital.')===0 && KEEP_KEYS.indexOf(k)===-1){ try{ localStorage.removeItem(k); }catch(e){} } }); }catch(e){}
}
function wipeViewport(){
  var v=document.getElementById('viewport'); if(v) v.innerHTML='';
  var f=document.getElementById('bkRailFoot'); if(f) f.textContent='No active deal.';
}
function reveal(){ document.documentElement.classList.add('bk-auth-ok'); }
function conceal(){ document.documentElement.classList.remove('bk-auth-ok'); }
function err(msg){ var el=document.getElementById('bk-auth-error'); if(el) el.textContent=msg||''; }
function busy(on, label){
  var btn=document.getElementById('bk-production-login-btn'); if(!btn) return;
  btn.disabled=!!on; btn.textContent=on?(label||'Signing In...'):'Sign In';
}

/* Safe, specific explanations. Never echoes tokens or raw server bodies. */
function explain(e, phase){
  var st = e && e.status, code = String(e && e.code || ''), m = String(e && e.message || '');
  var fileCtx = location.protocol === 'file:';
  if(e && e.kind === 'network'){
    return fileCtx
      ? 'Could not reach the Punchlist Capital sign-in service. This copy was opened as a local file (file://), and some browsers - Safari in particular - block network sign-in from local files. Open Punchlist Capital from its web address (https) or a local web server and sign in there.'
      : 'Could not reach the Punchlist Capital sign-in service (Supabase). Check the internet connection; if it persists, a network filter or the service itself may be unavailable.';
  }
  if(e && e.kind === 'config') return 'This build has no valid Supabase project configured. The Project URL and publishable key must be set in the build.';
  if(st === 400 && /invalid_grant|invalid login credentials/i.test(code + ' ' + m)) return 'Email or password is incorrect.';
  if(/email not confirmed/i.test(m)) return 'This account\'s email address has not been confirmed. Use the confirmation link from Supabase, then sign in.';
  if(st === 429) return 'Too many sign-in attempts. Wait a minute and try again.';
  if(st === 401 || st === 403){
    if(/api key|apikey/i.test(m)) return 'The sign-in service rejected this build\'s project key (configuration error).';
    return phase === 'verify' ? 'Your session is no longer valid. Sign in again.' : 'The sign-in service refused the request (HTTP ' + st + ').';
  }
  if(st === 404) return 'The sign-in service address is not valid for this build (configuration error, HTTP 404).';
  if(st >= 500) return 'The sign-in service is temporarily unavailable (HTTP ' + st + '). Try again shortly.';
  if(phase === 'restore') return 'Signed in, but your saved data could not be loaded: ' + (m || 'unknown error') + '. Nothing was changed. Try again.';
  if(phase === 'start') return 'Signed in, but the application failed to start: ' + (m || 'unknown error');
  return 'Sign-in failed: ' + (m || 'unknown error') + (st ? ' (HTTP ' + st + ')' : '');
}
window.bkAuthExplain = explain;

window.bkAuthFailClosed = function(msg){
  try{ localStorage.removeItem(AUTH_KEY); }catch(e){}
  purgeUserData(); conceal(); wipeViewport(); err(msg || 'Your session expired. Sign in again.');
};

/* Validated session -> purge previous-user residue -> restore -> reveal. */
function enter(){
  purgeUserData();
  var restore = Promise.resolve().then(function(){
    return (window.BK_SYNC && typeof window.BK_SYNC.restore === 'function') ? window.BK_SYNC.restore() : {};
  });
  return restore.then(function(r){
    reveal();
    try { if(typeof showSheet==='function') showSheet('Home'); }
    catch(e){ e.phase = 'start'; throw e; }
    return r;
  }, function(e){ e.phase = e.phase || 'restore'; throw e; });
}

function boot(){
  conceal();
  var note = document.getElementById('bk-auth-context');
  if(note && location.protocol === 'file:'){
    note.textContent = 'Opened as a local file. Supported contexts are the deployed https address or a local web server; some browsers block sign-in from file://.';
    note.style.display = '';
  }
  if(typeof bkAuthSignedIn!=='function'){ err('Authentication failed to initialize.'); return; }
  if(!bkAuthSignedIn()){ purgeUserData(); return; }
  busy(true, 'Restoring session...');
  bkAuthEnsureFresh()
    .then(function(){ return bkAuthVerify(); })
    .catch(function(e){ e.phase = 'verify'; throw e; })
    .then(enter)
    .catch(function(e){
      if(e.phase === 'restore' || e.phase === 'start'){ conceal(); wipeViewport(); err(explain(e, e.phase)); return; }
      try{ localStorage.removeItem(AUTH_KEY); }catch(x){}
      purgeUserData(); conceal(); wipeViewport();
      err(e && e.kind === 'network' ? explain(e, 'verify') : 'Your session has expired or is no longer valid. Sign in again.');
    })
    .then(function(){ busy(false); });
}
window.bkAuthBoot = boot;

var form=document.getElementById('bk-production-login-form');
if(form) form.addEventListener('submit', function(ev){
  ev.preventDefault(); err('');
  var email=document.getElementById('bk-production-email'), pw=document.getElementById('bk-production-password');
  if(!email||!pw||typeof bkAuthSignIn!=='function') return err('Authentication is unavailable.');
  busy(true);
  bkAuthSignIn(email.value.trim(), pw.value)
    .then(function(){ return bkAuthVerify().catch(function(e){ e.phase='verify'; throw e; }); })
    .then(function(){ pw.value=''; return enter(); })
    .catch(function(e){
      conceal(); wipeViewport();
      if(e.phase === 'verify'){ try{ localStorage.removeItem(AUTH_KEY); }catch(x){} err('Signed in, but the session could not be validated with the server. ' + explain(e,'verify')); }
      else err(explain(e, e.phase));
    })
    .then(function(){ busy(false); });
});

/* Every sign-out path: flush pending cloud writes, hide, purge, wipe. */
var oldOut=window.bkAuthSignOut;
if(typeof oldOut==='function' && !oldOut.__bkProductionGate){
  var wrappedOut=function(){
    var self=this, args=arguments;
    var flush = (window.BK_SYNC && window.BK_SYNC.live) ? window.BK_SYNC.flush(5000) : Promise.resolve();
    return flush.catch(function(){}).then(function(){
      conceal(); purgeUserData();
      return Promise.resolve(oldOut.apply(self,args)).finally(function(){ purgeUserData(); conceal(); wipeViewport(); });
    });
  };
  wrappedOut.__bkProductionGate=true; window.bkAuthSignOut=wrappedOut;
}
boot();
})();
