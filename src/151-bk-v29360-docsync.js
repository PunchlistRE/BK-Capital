
/* Deal Documents sync. The photo and source files are still stored in this browser first (instant, works offline). When you are signed in they are also copied to a private
   storage bucket in your account, listed on the deal (deal._files, which the deal sync already saves), and fetched back on another computer. Needs the one-time migration
   BK_Capital_V35_Documents_Migration.sql; until it is run the files simply stay in this browser and the page says so. */
(function(){
'use strict';
if(typeof window.bkDocsAdd !== 'function' || typeof window.bkCloudCfg !== 'function') return;
var BUCKET = 'deal-documents', MAX = 45 * 1048576, state = {}, note = '', synced = {};
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function user(){ return safe(function(){ return window.bkAuthSignedIn && window.bkAuthSignedIn() ? window.bkAuthUser() : null; }, null); }
function enabled(){ return !!(user() && safe(function(){ return window.bkCloudConfigured ? window.bkCloudConfigured() : true; }, true)); }
function dealCode(){ var s = safe(function(){ return bkLoad(); }, null); return s ? String(s.dealId || s.name || '') : ''; }
function seg(v){ return String(v).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'file'; }
function pathFor(rec){ return user().id + '/' + seg(rec.dealId) + '/' + rec.id + '-' + seg(rec.name); }
function call(method, p, body, type){ var c = window.bkCloudCfg(), go = function(){ return fetch(c.url + '/storage/v1/object/' + BUCKET + '/' + p.split('/').map(encodeURIComponent).join('/'), { method:method, headers:Object.assign({ apikey:c.anonKey, Authorization:'Bearer ' + window.bkAuthToken() }, type ? { 'Content-Type':type, 'x-upsert':'true' } : {}), body:body }); };
  return (typeof window.bkAuthEnsureFresh === 'function' ? window.bkAuthEnsureFresh().catch(function(){}).then(go) : go()).catch(function(e){ var ne = new Error('unreachable'); ne.kind = 'network'; throw ne; }); }
function failure(res){ return res.text().then(function(t){ var m = ''; try { m = (JSON.parse(t) || {}).message || (JSON.parse(t) || {}).error || ''; } catch(e){ m = t; } if(res.status === 404 || /bucket not found/i.test(m)) note = 'setup'; var e = new Error(m || ('HTTP ' + res.status)); e.status = res.status; return e; }); }
function manifest(fn){ var s = safe(function(){ return bkLoad(); }, null); if(!s) return; s._files = s._files || {}; fn(s._files); bkSave(s); }
function refresh(){ if(window.bkDocsInvalidate) window.bkDocsInvalidate(); if(typeof showSheet === 'function' && typeof currentSheet !== 'undefined' && /^(Deal Documents|Home)$/.test(currentSheet)) showSheet(currentSheet); }
function push(rec){
  if(!enabled()){ state[rec.id] = 'local'; return Promise.resolve(false); }
  if(rec.size > MAX){ state[rec.id] = 'large'; return Promise.resolve(false); }
  state[rec.id] = 'syncing'; var p = pathFor(rec);
  return call('POST', p, rec.blob, rec.type || 'application/octet-stream').then(function(res){ if(!res.ok) return failure(res).then(function(e){ throw e; });
    if(dealCode() === rec.dealId) manifest(function(m){ Object.keys(m).forEach(function(k){ if(m[k].slot === 'photo' && rec.slot === 'photo' && k !== rec.id){ call('DELETE', m[k].path).catch(function(){}); delete m[k]; } }); m[rec.id] = { slot:rec.slot, name:rec.name, type:rec.type, size:rec.size, t:rec.t, path:p }; });
    state[rec.id] = 'synced'; note = note === 'setup' ? '' : note; return true; })
  .catch(function(e){ state[rec.id] = note === 'setup' ? 'setup' : 'error:' + (e && e.message || e); return false; });
}
function drop(fid){ var m = safe(function(){ return bkLoad()._files; }, null), e = m && m[fid]; if(!e || !enabled()) return Promise.resolve(); return call('DELETE', e.path).then(function(){ manifest(function(mm){ delete mm[fid]; }); }).catch(function(){}); }
function put(rec){ return window.bkDocsPut(rec); }
function pull(id){ var m = safe(function(){ return bkLoad()._files; }, null) || {}, ids = Object.keys(m); if(!ids.length) return Promise.resolve(0);
  return list0(id).then(function(local){ var have = {}; local.forEach(function(f){ have[f.id] = 1; }); var need = ids.filter(function(k){ return !have[k]; }); var n = 0;
    return need.reduce(function(chain, k){ return chain.then(function(){ var e = m[k]; return call('GET', e.path).then(function(res){ if(!res.ok) return failure(res).then(function(er){ throw er; }); return res.blob(); }).then(function(blob){ return put({ id:k, dealId:id, slot:e.slot, name:e.name, type:e.type, size:e.size, t:e.t, blob:new Blob([blob], { type:e.type || blob.type }) }); }).then(function(){ state[k] = 'synced'; n++; }).catch(function(er){ state[k] = 'error:' + (er && er.message || er); }); }); }, Promise.resolve()).then(function(){ return n; }); }); }
function reconcile(id){ return list0(id).then(function(local){ var m = safe(function(){ return bkLoad()._files; }, null) || {}; local.forEach(function(f){ if(m[f.id]) state[f.id] = state[f.id] || 'synced'; });
  return local.filter(function(f){ return !m[f.id] && state[f.id] !== 'syncing' && state[f.id] !== 'large'; }).reduce(function(chain, f){ return chain.then(function(){ return push(f); }); }, Promise.resolve()); }); }
/* once per deal and sign-in: restore what the account has, then upload what only this browser has */
function syncDeal(){ var id = safe(function(){ return String(bkLoad().dealId || ''); }, ''); if(!id || !enabled()) return Promise.resolve(); var key = id + '|' + user().id; if(synced[key]) return synced[key];
  synced[key] = pull(id).then(function(n){ return reconcile(id).then(function(){ if(n) { delete window.bkDocsPhotoCache[id]; } refresh(); }); }).catch(function(){ delete synced[key]; });
  return synced[key]; }
var add0 = window.bkDocsAdd; window.bkDocsAdd = function(){ return add0.apply(this, arguments).then(function(rec){ push(rec).then(refresh); return rec; }); };
var rm0 = window.bkDocsRemove; window.bkDocsRemove = function(fid){ var d = drop(fid); return rm0.apply(this, arguments).then(function(r){ delete state[fid]; return d.then(function(){ return r; }); }); };
var warm0 = window.bkDocsWarm; window.bkDocsWarm = function(){ var p = warm0.apply(this, arguments); syncDeal(); return p; };
var list0 = window.bkDocsList; window.bkDocsList = function(){ var p = list0.apply(this, arguments); syncDeal(); return p; };
window.bkDocsSyncNow = function(){ synced = {}; note = ''; return syncDeal(); };
window.bkDocsSyncLabel = function(fid){ var st = state[fid], on = safe(function(){ return bkLoad()._files && bkLoad()._files[fid]; }, null);
  if(on && !st) st = 'synced'; if(!st) return ''; var t = st === 'synced' ? 'saved to your account' : st === 'syncing' ? 'saving to your account...' : st === 'large' ? 'this browser only (over 45 MB)' : st === 'setup' ? 'this browser only (account storage not set up)' : st === 'local' ? 'this browser only (sign in to keep it)' : 'not saved: ' + st.slice(6);
  return ' · <span style="' + (st === 'synced' ? 'color:#1F7A45' : st === 'syncing' ? '' : 'color:#8A6212') + '">' + esc(t) + '</span>'; };
window.bkDocsSyncNote = function(){ return note === 'setup' ? '<div class="note-flag" style="margin-bottom:12px"><span>&#9432;</span><div>Your files are kept in this browser only. To keep them in your account and open them on another computer, run <b>BK_Capital_V35_Documents_Migration.sql</b> once in your Supabase project, then press <a href="#" onclick="bkDocsSyncNow();return false">Try again</a>.</div></div>' : ''; };
})();
