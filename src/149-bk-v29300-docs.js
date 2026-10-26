
/* Deal Documents: every deal can hold its source documents (offering memorandum, T-12, CoStar report, listing summary, other) and a property photo. Files live in this
   browser (IndexedDB, keyed by the deal id), not in the deal's saved inputs, so the saved deal stays small. The photo is used on the Overview and the PDF summaries. */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof window.bkLoad !== 'function') return;
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function active(){ return typeof window.bkHasActiveDeal !== 'function' || window.bkHasActiveDeal(); }
function dealId(){ var s = safe(function(){ return bkLoad(); }, null); return s && s.dealId != null ? String(s.dealId) : ''; }
var SLOTS = [['om', 'Offering memorandum', 'The broker\'s OM. Extract its price, units, rents, income and expenses into this deal.', '.pdf'], ['t12', 'T-12 / operating statement', 'Yardi or any trailing-12 statement.', '.pdf,.xlsx,.xlsm,.csv'],
  ['costar', 'CoStar report', 'Market, comps or property report. Stored with the deal.', '.pdf,.xlsx,.csv'], ['listing', 'Listing summary', 'A one- or two-page listing or flyer.', '.pdf'], ['other', 'Other documents', 'Leases, inspections, appraisals, anything else.', '']];
var db = null, cache = {};
function open(){ if(db) return Promise.resolve(db); return new Promise(function(res, rej){ var r = indexedDB.open('punchlist-docs', 1); r.onupgradeneeded = function(){ r.result.createObjectStore('files', { keyPath:'id' }); }; r.onsuccess = function(){ db = r.result; res(db); }; r.onerror = function(){ rej(r.error); }; }); }
function tx(mode, fn){ return open().then(function(d){ return new Promise(function(res, rej){ var t = d.transaction('files', mode), st = t.objectStore('files'), out = fn(st); t.oncomplete = function(){ res(out && out.result !== undefined ? out.result : undefined); }; t.onerror = function(){ rej(t.error); }; }); }); }
function all(){ return open().then(function(d){ return new Promise(function(res, rej){ var r = d.transaction('files', 'readonly').objectStore('files').getAll(); r.onsuccess = function(){ res(r.result || []); }; r.onerror = function(){ rej(r.error); }; }); }); }
window.bkDocsList = function(id){ id = id == null ? dealId() : String(id); return all().then(function(a){ return a.filter(function(f){ return f.dealId === id; }).sort(function(x, y){ return y.t - x.t; }); }); };
window.bkDocsAdd = function(slot, file, id){ id = id == null ? dealId() : String(id); var rec = { id:'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), dealId:id, slot:slot, name:file.name || (slot + '.bin'), type:file.type || '', size:file.size, t:Date.now(), blob:file }; return tx('readwrite', function(st){ if(slot === 'photo'){ var q = st.getAll(); q.onsuccess = function(){ q.result.filter(function(f){ return f.dealId === id && f.slot === 'photo'; }).forEach(function(f){ st.delete(f.id); }); st.put(rec); }; return q; } return st.put(rec); }).then(function(){ return rec; }); };
window.bkDocsGet = function(fid){ return open().then(function(d){ return new Promise(function(res, rej){ var r = d.transaction('files', 'readonly').objectStore('files').get(fid); r.onsuccess = function(){ res(r.result); }; r.onerror = function(){ rej(r.error); }; }); }); };
window.bkDocsRemove = function(fid){ return tx('readwrite', function(st){ return st.delete(fid); }); };
function toDataURL(blob){ return new Promise(function(res){ var fr = new FileReader(); fr.onload = function(){ res(fr.result); }; fr.onerror = function(){ res(''); }; fr.readAsDataURL(blob); }); }
/* the photo: scaled to 1800 px on its long side and stored as a JPEG */
window.bkDocsPrepPhoto = function(file){ return createImageBitmap(file).then(function(bm){ var sc = Math.min(1, 1800 / Math.max(bm.width, bm.height)), w = Math.round(bm.width * sc), h = Math.round(bm.height * sc), c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(bm, 0, 0, w, h); return new Promise(function(res){ c.toBlob(function(b){ res(new File([b], (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg', { type:'image/jpeg' })); }, 'image/jpeg', 0.88); }); }); };
window.bkDocsSetPhoto = function(file, id){ id = id == null ? dealId() : String(id); return window.bkDocsPrepPhoto(file).then(function(f){ return window.bkDocsAdd('photo', f, id); }).then(function(rec){ return toDataURL(rec.blob).then(function(u){ cache[id] = u; return rec; }); }); };
window.bkDocsWarm = function(){ var id = dealId(); if(!id) return Promise.resolve(''); if(cache[id] !== undefined) return Promise.resolve(cache[id]); return window.bkDocsList(id).then(function(a){ var p = a.filter(function(f){ return f.slot === 'photo'; })[0]; return p ? toDataURL(p.blob) : ''; }).then(function(u){ cache[id] = u || ''; return cache[id]; }).catch(function(){ cache[id] = ''; return ''; }); };
window.bkDealPhotoURL = function(){ var id = dealId(); return (id && cache[id]) || ''; };
window.bkDocsPhotoCache = cache;

var busy = '';
function fmtSize(n){ return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
window.bkDocsUpload = function(slot, input){ listing = null; var files = input && input.files ? Array.prototype.slice.call(input.files) : []; if(!files.length) return; busy = 'Saving ' + files[0].name + '...'; showSheet('Deal Documents');
  Promise.all(files.map(function(f){ return slot === 'photo' ? window.bkDocsSetPhoto(f) : window.bkDocsAdd(slot, f); })).catch(function(e){ busy = 'Could not save: ' + (e && e.message || e); }).then(function(){ if(/^Saving/.test(busy)) busy = ''; listing = null; showSheet('Deal Documents'); }); };
window.bkDocsDownload = function(fid){ window.bkDocsGet(fid).then(function(r){ if(!r) return; var a = document.createElement('a'); a.href = URL.createObjectURL(r.blob); a.download = r.name; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000); }); };
window.bkDocsDelete = function(fid){ if(!window.confirm('Remove this file from the deal?')) return; window.bkDocsGet(fid).then(function(r){ if(r && r.slot === 'photo') delete cache[r.dealId]; return window.bkDocsRemove(fid); }).then(function(){ listing = null; showSheet('Deal Documents'); }); };
var listing = null;
function render(){
  var s = safe(function(){ return bkLoad(); }, null), hdr = { title:'Deal Documents', crumbs:'Inputs', desc:'The photo and source documents for this deal. They are kept in this browser with the deal and feed the data intake and the PDF summaries.', sidebar:'', meta:{ Property:s && s.name } };
  var id = dealId(); if(!id){ hdr.main = '<div class="card" style="padding:16px">Open or create a deal first.</div>'; return hdr; }
  if(listing === null || listing.id !== id){ listing = { id:id, files:null }; window.bkDocsList(id).then(function(a){ listing = { id:id, files:a }; window.bkDocsWarm().then(function(){ if(typeof showSheet === 'function' && document.querySelector('#bk-docs-root')) showSheet('Deal Documents'); }); }); }
  var files = listing.files || [], photo = files.filter(function(f){ return f.slot === 'photo'; })[0], pu = window.bkDealPhotoURL();
  var main = '<div id="bk-docs-root" style="max-width:1000px">' + (busy ? '<div class="note-flag" style="margin-bottom:12px"><span>&#9432;</span><div>' + esc(busy) + '</div></div>' : '')
    + '<div class="card" style="padding:16px;display:grid;grid-template-columns:minmax(220px,340px) 1fr;gap:18px;align-items:center"><div style="aspect-ratio:4/3;border-radius:10px;overflow:hidden;background:#eef2f6;display:flex;align-items:center;justify-content:center;color:#7a8da1;font-size:12px;text-align:center">' + (pu ? '<img alt="Property photo" src="' + pu + '" style="width:100%;height:100%;object-fit:cover">' : 'No photo yet') + '</div><div><div style="font-weight:700;font-size:15px;margin-bottom:4px">Property photo</div><div style="font-size:13px;opacity:.75;margin-bottom:10px">Shown on the Overview and on the cover of the PDF summary. A landscape exterior shot works best.' + (photo ? '<br>' + esc(photo.name) + ' · ' + fmtSize(photo.size) : '') + '</div><label class="pl-hbtn primary" style="display:inline-block;cursor:pointer">' + (photo ? 'Replace photo' : 'Upload photo') + '<input type="file" accept="image/*" style="display:none" onchange="bkDocsUpload(\'photo\',this)"></label>' + (photo ? ' <button type="button" class="pl-hbtn" onclick="bkDocsDelete(\'' + photo.id + '\')">Remove</button>' : '') + '</div></div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-top:12px">' + SLOTS.map(function(sl){
      var fs = files.filter(function(f){ return f.slot === sl[0]; });
      var rows = fs.map(function(f){ var ex = (sl[0] === 'om' || sl[0] === 'listing') && /\.pdf$/i.test(f.name) ? '<button type="button" class="pl-hbtn" onclick="bkDocsExtract(\'' + f.id + '\')">Extract into this deal</button>' : sl[0] === 't12' ? '<button type="button" class="pl-hbtn" onclick="bkDocsExtract(\'' + f.id + '\')">Extract into this deal</button>' : '';
        return '<div style="display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:7px 0;border-top:1px solid var(--line,#dbe4ec);font-size:12.5px"><span style="flex:1;min-width:140px;word-break:break-word"><b>' + esc(f.name) + '</b><br><span style="opacity:.65">' + fmtSize(f.size) + ' · ' + new Date(f.t).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) + '</span></span>' + ex + '<button type="button" class="pl-hbtn" onclick="bkDocsDownload(\'' + f.id + '\')">Download</button><button type="button" class="pl-hbtn" onclick="bkDocsDelete(\'' + f.id + '\')">Remove</button></div>'; }).join('');
      return '<div class="card" style="padding:14px 16px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div style="font-weight:700">' + sl[1] + '</div><label class="pl-hbtn" style="cursor:pointer">Upload<input type="file" ' + (sl[3] ? 'accept="' + sl[3] + '"' : '') + ' multiple style="display:none" onchange="bkDocsUpload(\'' + sl[0] + '\',this)"></label></div><div style="font-size:12px;opacity:.7;margin:3px 0 6px">' + sl[2] + '</div>' + (rows || '<div style="font-size:12px;opacity:.55;padding-top:6px;border-top:1px solid var(--line,#dbe4ec)">Nothing uploaded</div>') + '</div>'; }).join('') + '</div>'
    + '<div id="bk-docs-extract"></div></div>';
  hdr.main = main; hdr.meta = { Property:s && s.name, Files:files.filter(function(f){ return f.slot !== 'photo'; }).length, Photo:photo ? 'Yes' : 'No' }; return hdr;
}
var g = function(){ if(!active() && typeof window.bkEmptyState === 'function') return window.bkEmptyState('Deal Documents'); return render(); };
window.bkDocsInvalidate = function(){ listing = null; };
if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Deal Documents', g); else RENDERERS['Deal Documents'] = g;
window.bkDocsExtract = function(fid){ if(typeof window.bkDocsExtractHook === 'function') window.bkDocsExtractHook(fid); else alert('Extraction is not available.'); };

/* Overview: a photo beside the deal name */
(function(){ var prev = RENDERERS['Home']; if(typeof prev !== 'function') return;
  RENDERERS['Home'] = function(){ var o = prev.apply(this, arguments); if(!o || typeof o.main !== 'string') return o; var id = dealId(); if(!id || !active()) return o;
    var u = window.bkDealPhotoURL(); if(cache[id] === undefined) window.bkDocsWarm().then(function(x){ if(x && document.querySelector('.pl-home') && typeof showSheet === 'function' && /Home|Overview/i.test(String(window.__bkSheet || 'Home'))) showSheet('Home'); });
    if(!u) return o; var tag = '<div class="pl-hero">'; if(o.main.indexOf(tag) < 0) return o;
    return Object.assign({}, o, { main:o.main.replace(tag, '<div class="pl-hero" style="position:relative;min-height:150px;padding-right:220px"><img alt="" src="' + u + '" style="position:absolute;right:0;top:0;width:200px;height:150px;object-fit:cover;border-radius:10px;box-shadow:0 6px 18px rgba(14,42,74,.25)">') }); };
  if(typeof window.bkRegisterRenderer === 'function') try { window.bkRegisterRenderer('Home', RENDERERS['Home']); } catch(e){}
})();
})();
