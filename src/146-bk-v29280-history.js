
/* Version history and change log. Every input change on the active deal is recorded (field, old value, new value, time); named versions snapshot the whole deal
   with its headline return, can be compared with the current inputs and restored. The record lives in the deal itself (_history) so it travels with the deal. */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof window.bkSave !== 'function' || typeof window.bkLoad !== 'function') return;
var MAXLOG = 400, MAXVER = 30, busy = false, sel = null;
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function active(){ return typeof window.bkHasActiveDeal !== 'function' || window.bkHasActiveDeal(); }
function pretty(k){ return String(k).replace(/^_/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, function(c){ return c.toUpperCase(); }); }
function fmt(k, v){
  if(v === undefined || v === null || v === '') return '(blank)';
  if(typeof v === 'boolean') return v ? 'Yes' : 'No';
  if(typeof v === 'object') return Array.isArray(v) ? v.length + ' items' : 'changed';
  if(typeof v === 'number'){
    if(/(pct|rate|cap|growth|vacancy|ltv|ltc|occupancy|pref|share|fee|hurdle|catchup)/i.test(k) && !/(dscr|amort|month|year|sf|count)/i.test(k) && Math.abs(v) <= 1.5) return (v * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
    return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 10000) / 10000);
  }
  return String(v).length > 40 ? String(v).slice(0, 40) + '…' : String(v);
}
function eq(a, b){ return a === b || JSON.stringify(a) === JSON.stringify(b); }
function hist(s){ var h = s && s._history; return { log:(h && h.log) || [], versions:(h && h.versions) || [] }; }
function when(t){ var d = new Date(t); return d.toLocaleDateString('en-US', { month:'short', day:'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }); }
function headline(){ return safe(function(){ var m = bkMonthlyReturns(); return { irr:isFinite(m.irr) ? m.irr : null, moic:isFinite(m.moic) ? m.moic : null }; }, { irr:null, moic:null }); }

var prevSave = window.bkSave;
function write(s){ busy = true; try { return prevSave.call(window, s); } finally { busy = false; } }
function record(old, d){
  if(!old || !d || !active() || String(old.dealId) !== String(d.dealId)) return;
  var ch = [], k; for(k in d){ if(k.charAt(0) === '_' || old[k] === undefined || old[k] === null) continue; if(!eq(old[k], d[k])) ch.push([k, old[k], d[k]]); }
  if(!ch.length) return;
  var s2 = safe(function(){ return bkLoad(); }, null); if(!s2) return;
  var h = hist(s2), t = Date.now(), last = h.log[h.log.length - 1];
  if(ch.length > 40) h.log.push({ t:t, k:'*', note:'Bulk update (' + ch.length + ' fields)' });
  else ch.forEach(function(c){ var l = h.log[h.log.length - 1]; if(l && l.k === c[0] && t - l.t < 300000){ l.to = c[2]; l.t = t; if(eq(l.from, l.to)) h.log.pop(); } else h.log.push({ t:t, k:c[0], from:c[1], to:c[2] }); });
  if(h.log.length > MAXLOG) h.log = h.log.slice(-MAXLOG);
  s2._history = { log:h.log, versions:h.versions }; write(s2);
}
var wrapper = function(d){
  if(busy) return prevSave.apply(this, arguments);
  var old = safe(function(){ return bkLoad(); }, null), r;
  /* the layers below test `window.bkSave === their own hook` to tell a real save from a scenario run, so they must see themselves in place */
  window.bkSave = prevSave; try { r = prevSave.apply(this, arguments); } finally { window.bkSave = wrapper; try { bkSave = wrapper; } catch(e){} }
  if(r !== false){ queue.push([old, d]); if(!timer) timer = setTimeout(flush, 150); }
  return r;
};
var queue = [], timer = null;
/* the log is written just after the edit, off the path that redraws the page and restores focus */
function flush(){ if(timer){ clearTimeout(timer); timer = null; } var q = queue; queue = []; q.forEach(function(e){ safe(function(){ record(e[0], e[1]); }); }); }
window.bkHistoryFlush = flush;
window.bkSave = wrapper;
try { bkSave = wrapper; } catch(e){}

function snapshot(){ var s = bkLoad(), o = {}, k; for(k in s){ if(k !== '_history') o[k] = s[k]; } return o; }
window.bkHistorySaveVersion = function(note, auto){
  flush(); if(!active()) return null;
  var s = bkLoad(), h = hist(s), snap = snapshot(), j = JSON.stringify(snap), last = h.versions[h.versions.length - 1];
  if(auto && last && last.j === j) return last.id;
  var hl = headline(), v = { id:'v' + Date.now().toString(36), t:Date.now(), note:String(note || 'Version ' + (h.versions.length + 1)).slice(0, 80), auto:!!auto, irr:hl.irr, moic:hl.moic, j:j };
  h.versions.push(v);
  while(h.versions.length > MAXVER){ var i = h.versions.findIndex(function(x){ return x.auto; }); h.versions.splice(i >= 0 ? i : 0, 1); }
  s._history = { log:h.log, versions:h.versions }; write(s); return v.id;
};
window.bkHistoryDiff = function(vid){
  flush();
  var s = bkLoad(), v = hist(s).versions.filter(function(x){ return x.id === vid; })[0]; if(!v) return null;
  var a = JSON.parse(v.j), rows = [], seen = {}, k;
  for(k in a){ seen[k] = 1; if(!eq(a[k], s[k])) rows.push({ k:k, from:a[k], to:s[k] }); }
  for(k in s){ if(!seen[k] && k !== '_history' && !eq(undefined, s[k])) rows.push({ k:k, from:undefined, to:s[k] }); }
  return { v:v, rows:rows, now:headline() };
};
window.bkHistoryRestore = function(vid){
  flush();
  var s = bkLoad(), h = hist(s), v = h.versions.filter(function(x){ return x.id === vid; })[0]; if(!v) return false;
  bkHistorySaveVersion('Before restoring "' + v.note + '"', true);
  var s2 = bkLoad(), h2 = hist(s2), snap = JSON.parse(v.j);
  h2.log.push({ t:Date.now(), k:'*', note:'Restored version "' + v.note + '"' });
  snap._history = { log:h2.log, versions:h2.versions }; write(snap); sel = null;
  if(typeof showSheet === 'function') showSheet('Version History'); return true;
};
window.bkHistoryRestoreAsk = function(vid){ var v = hist(bkLoad()).versions.filter(function(x){ return x.id === vid; })[0]; if(v && window.confirm('Restore "' + v.note + '"? Your current inputs are saved as a version first, so you can come back.')) bkHistoryRestore(vid); };
window.bkHistoryCompare = function(vid){ sel = sel === vid ? null : vid; showSheet('Version History'); };
window.bkHistorySaveFromForm = function(){ var e = document.getElementById('bk-ver-name'); bkHistorySaveVersion(e && e.value.trim() ? e.value.trim() : '', false); showSheet('Version History'); };

function box(h){ return '<div style="background:var(--surface,#fff);border:1px solid var(--line,#dbe4ec);border-radius:8px;padding:14px 16px;margin-top:12px;font-size:13px;line-height:1.55;max-width:1000px">' + h + '</div>'; }
function render(){
  flush();
  var s = safe(function(){ return bkLoad(); }, null), h = hist(s), cur = headline(), hdr = { title:'Version History', crumbs:'QA', desc:'Every input change on this deal, and named versions you can compare and restore.', meta:{ Property:s && s.name, Versions:h.versions.length, Changes:h.log.length }, sidebar:'' };
  var T = 'width:100%;border-collapse:collapse;font-size:12.5px', TH = 'text-align:left;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;padding:6px 8px;border-bottom:2px solid #0e2a4a;opacity:.75', TD = 'padding:6px 8px;border-bottom:1px solid var(--line,#dbe4ec);vertical-align:top';
  var main = box('<div style="font-weight:700;margin-bottom:6px">Save a version</div><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="bk-ver-name" type="text" maxlength="80" placeholder="Name this version, e.g. Sent to lender, or After rent-roll import" style="flex:1;min-width:240px;padding:8px 10px;border:1px solid var(--line,#dbe4ec);border-radius:6px;font:inherit;text-align:left !important"><button type="button" class="pl-hbtn primary" onclick="bkHistorySaveFromForm()">Save version</button></div><div style="font-size:12px;opacity:.7;margin-top:6px">A version stores every input and the returns at that moment (' + (cur.irr == null ? 'n/a' : (cur.irr * 100).toFixed(2) + '% IRR, ' + (cur.moic || 0).toFixed(2) + 'x') + ' now). Creating a PDF summary saves one automatically.</div>');
  var vs = h.versions.slice().reverse();
  main += box('<div style="font-weight:700;margin-bottom:6px">Versions</div>' + (vs.length ? '<table style="' + T + '"><thead><tr><th style="' + TH + '">Version</th><th style="' + TH + '">Saved</th><th style="' + TH + ';text-align:right">IRR</th><th style="' + TH + ';text-align:right">Multiple</th><th style="' + TH + '"></th></tr></thead><tbody>' + vs.map(function(v){
    return '<tr' + (sel === v.id ? ' style="background:rgba(62,154,230,.12)"' : '') + '><td style="' + TD + '"><b>' + esc(v.note) + '</b>' + (v.auto ? ' <span style="font-size:10px;opacity:.6">auto</span>' : '') + '</td><td style="' + TD + '">' + when(v.t) + '</td><td style="' + TD + ';text-align:right">' + (v.irr == null ? '—' : (v.irr * 100).toFixed(2) + '%') + '</td><td style="' + TD + ';text-align:right">' + (v.moic == null ? '—' : v.moic.toFixed(2) + 'x') + '</td><td style="' + TD + ';text-align:right;white-space:nowrap"><button type="button" class="pl-hbtn" onclick="bkHistoryCompare(\'' + v.id + '\')">' + (sel === v.id ? 'Hide' : 'Compare') + '</button> <button type="button" class="pl-hbtn" onclick="bkHistoryRestoreAsk(\'' + v.id + '\')">Restore</button></td></tr>'; }).join('') + '</tbody></table>' : '<div style="opacity:.7">No versions yet. Save one before a big change.</div>'));
  var df = sel ? bkHistoryDiff(sel) : null;
  if(df){ var dI = df.v.irr != null && df.now.irr != null ? (df.now.irr - df.v.irr) * 100 : null;
    main += box('<div style="font-weight:700;margin-bottom:6px">"' + esc(df.v.note) + '" compared with now</div><div style="margin-bottom:8px">' + (dI == null ? '' : 'Levered IRR ' + (df.v.irr * 100).toFixed(2) + '% then, ' + (df.now.irr * 100).toFixed(2) + '% now (' + (dI >= 0 ? '+' : '') + dI.toFixed(2) + ' points). ') + df.rows.length + ' input' + (df.rows.length === 1 ? '' : 's') + ' differ.</div>' + (df.rows.length ? '<table style="' + T + '"><thead><tr><th style="' + TH + '">Input</th><th style="' + TH + '">Then</th><th style="' + TH + '">Now</th></tr></thead><tbody>' + df.rows.slice(0, 80).map(function(r){ return '<tr><td style="' + TD + '">' + esc(pretty(r.k)) + '</td><td style="' + TD + '">' + esc(fmt(r.k, r.from)) + '</td><td style="' + TD + '">' + esc(fmt(r.k, r.to)) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div style="opacity:.7">Identical inputs.</div>')); }
  var lg = h.log.slice(-120).reverse();
  main += box('<div style="font-weight:700;margin-bottom:6px">Change log</div>' + (lg.length ? '<table style="' + T + '"><thead><tr><th style="' + TH + '">When</th><th style="' + TH + '">What</th><th style="' + TH + '">From</th><th style="' + TH + '">To</th></tr></thead><tbody>' + lg.map(function(l){ return l.note ? '<tr><td style="' + TD + '">' + when(l.t) + '</td><td style="' + TD + '" colspan="3">' + esc(l.note) + '</td></tr>' : '<tr><td style="' + TD + '">' + when(l.t) + '</td><td style="' + TD + '">' + esc(pretty(l.k)) + '</td><td style="' + TD + '">' + esc(fmt(l.k, l.from)) + '</td><td style="' + TD + '">' + esc(fmt(l.k, l.to)) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div style="opacity:.7">No changes recorded yet. Edits you make from now on appear here.</div>'));
  hdr.main = main; return hdr;
}
var g = function(){ if(!active() && typeof window.bkEmptyState === 'function') return window.bkEmptyState('Version History'); return render(); };
if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Version History', g); else RENDERERS['Version History'] = g;
})();
