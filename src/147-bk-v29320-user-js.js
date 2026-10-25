
/* Header sign-in / sign-out. Signing out goes through the app's own sign-out (flush pending cloud writes, clear local data, return to the sign-in screen). */
(function(){
'use strict';
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function paint(){
  var el = document.getElementById('pl-user'); if(!el) return;
  var u = typeof window.bkAuthUser === 'function' ? window.bkAuthUser() : null, signed = typeof window.bkAuthSignedIn === 'function' && window.bkAuthSignedIn();
  var html = signed ? (u && u.email ? '<span class="who" title="' + esc(u.email) + '">' + esc(u.email) + '</span>' : '') + '<button type="button" onclick="bkHeaderSignOut()">Sign out</button>' : '<button type="button" onclick="bkHeaderSignIn()">Sign in</button>';
  if(el.getAttribute('data-h') !== html){ el.setAttribute('data-h', html); el.innerHTML = html; }
}
window.bkHeaderSignOut = function(){
  var pend = window.BK_SYNC && window.BK_SYNC.pending ? Object.keys(window.BK_SYNC.pending).length : 0;
  if(!window.confirm('Sign out of Punchlist Capital?' + (pend ? ' Unsaved changes will be saved to the cloud first.' : '') + ' Deals stay in your account.')) return;
  var p = typeof window.bkAuthSignOut === 'function' ? window.bkAuthSignOut() : Promise.resolve();
  Promise.resolve(p).then(function(){ paint(); });
};
window.bkHeaderSignIn = function(){ document.documentElement.classList.remove('bk-auth-ok'); var e = document.getElementById('bk-production-email'); if(e) setTimeout(function(){ e.focus(); }, 50); };
window.bkHeaderUserPaint = paint;
var prev = window.showSheet; if(typeof prev === 'function'){ window.showSheet = function(){ var r = prev.apply(this, arguments); try { paint(); } catch(e){} return r; }; try { showSheet = window.showSheet; } catch(e){} }
document.addEventListener('DOMContentLoaded', paint); paint();
})();
