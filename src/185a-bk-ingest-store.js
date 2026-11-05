/* DOCUMENT INGESTION, store (Phase 2). Where ingestion keeps what it knows: documents, the text of their pages, extracted facts, and the audit history. Two implementations with one contract:
   an IndexedDB store (the default: it survives a reload, so a half-processed batch resumes) and an in-memory store (tests, and the fallback when IndexedDB is unavailable).
   The file bytes are NOT kept here: they stay in Deal Documents (see the blob adapter in the intake). This store holds records about them.

   The audit history is APPEND-ONLY. There is no call that changes or removes an event, in either implementation; a correction is a new event.

   BKIngest.createStore({ kind: 'indexeddb' | 'memory', name }) -> Promise<store>. Every call returns a promise; every object handed out is a copy, so changing it changes nothing stored.
     putDocument(doc) / getDocument(id) / listDocuments({ dealId, includeDeleted }) / updateDocument(id, patchOrFn)     listed in the order added: received time, then the order within the batch
     putPages(documentId, pages) / getPages(documentId)                      pages: [{ page, text, ... }], replaced as a set
     putFacts(facts) / listFacts({ dealId, documentId, field }) / updateFact(id, patchOrFn)
     appendEvent(ev) -> ev with seq and at / listEvents({ dealId, documentId, afterSeq })
     purgeDeal(dealId)   removes a deal's documents, pages and facts (never its events) and records that it did */
(function(){
'use strict';
var I = window.BKIngest = window.BKIngest || {};
function clone(x){ return x === undefined ? x : JSON.parse(JSON.stringify(x)); }
function applyPatch(cur, patchOrFn){ var next = typeof patchOrFn === 'function' ? patchOrFn(clone(cur)) : Object.assign(clone(cur), clone(patchOrFn)); return next === undefined ? cur : next; }
function matches(o, f){ f = f || {}; return Object.keys(f).every(function(k){ return k === 'includeDeleted' || k === 'afterSeq' || f[k] === undefined || o[k] === f[k]; }); }
function evOf(ev, at){ var e = clone(ev) || {}; e.at = at; return e; }

/* ---------------------------------------------------------------- memory */
function memoryStore(){
  var docs = {}, pages = {}, facts = {}, events = [], seq = 0, ok = function(v){ return Promise.resolve(v); };
  return { kind:'memory',
    putDocument:function(d){ if(!d || !d.id) return Promise.reject(new Error('A document needs an id.')); docs[d.id] = clone(d); return ok(clone(d)); },
    getDocument:function(id){ return ok(clone(docs[id] || null)); },
    listDocuments:function(f){ f = f || {}; return ok(Object.keys(docs).map(function(k){ return docs[k]; }).filter(function(d){ return matches(d, { dealId:f.dealId }) && (f.includeDeleted || !d.deletedAt); }).sort(function(a, b){ return String(a.receivedAt).localeCompare(String(b.receivedAt)) || ((a.seq || 0) - (b.seq || 0)) || String(a.id).localeCompare(String(b.id)); }).map(clone)); },
    updateDocument:function(id, p){ if(!docs[id]) return Promise.reject(new Error('No document ' + id)); docs[id] = clone(applyPatch(docs[id], p)); return ok(clone(docs[id])); },
    putPages:function(did, list){ pages[did] = clone(list || []).map(function(p){ return Object.assign({ documentId:did }, p); }); return ok(true); },
    getPages:function(did){ return ok(clone((pages[did] || []).slice().sort(function(a, b){ return a.page - b.page; }))); },
    putFacts:function(list){ (list || []).forEach(function(f){ if(!f || !f.id) throw new Error('A fact needs an id.'); facts[f.id] = clone(f); }); return ok(true); },
    listFacts:function(f){ return ok(Object.keys(facts).map(function(k){ return facts[k]; }).filter(function(x){ return matches(x, f); }).sort(function(a, b){ return String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)); }).map(clone)); },
    updateFact:function(id, p){ if(!facts[id]) return Promise.reject(new Error('No fact ' + id)); facts[id] = clone(applyPatch(facts[id], p)); return ok(clone(facts[id])); },
    appendEvent:function(ev){ var e = evOf(ev, I.clock()); e.seq = ++seq; events.push(Object.freeze(clone(e))); return ok(clone(e)); },
    listEvents:function(f){ f = f || {}; return ok(events.filter(function(e){ return matches(e, { dealId:f.dealId, documentId:f.documentId }) && (f.afterSeq == null || e.seq > f.afterSeq); }).map(clone)); },
    purgeDeal:function(dealId){ var n = { documents:0, facts:0 }; Object.keys(docs).forEach(function(k){ if(docs[k].dealId === dealId){ delete pages[k]; delete docs[k]; n.documents++; } }); Object.keys(facts).forEach(function(k){ if(facts[k].dealId === dealId){ delete facts[k]; n.facts++; } });
      var e = { dealId:dealId, documentId:null, stage:null, type:'purged', detail:n, actor:'system' }; e = evOf(e, I.clock()); e.seq = ++seq; events.push(Object.freeze(clone(e))); return ok(n); } };
}

/* ---------------------------------------------------------------- IndexedDB */
function idbStore(name){
  var dbp = null;
  function open(){ if(dbp) return dbp; dbp = new Promise(function(res, rej){ var r = indexedDB.open(name, 1);
    r.onupgradeneeded = function(){ var db = r.result, d = db.createObjectStore('documents', { keyPath:'id' }); d.createIndex('dealId', 'dealId'); d.createIndex('sha256', 'sha256');
      var p = db.createObjectStore('pages', { keyPath:['documentId', 'page'] }); p.createIndex('documentId', 'documentId');
      var f = db.createObjectStore('facts', { keyPath:'id' }); f.createIndex('documentId', 'documentId'); f.createIndex('dealId', 'dealId'); f.createIndex('field', 'field');
      var e = db.createObjectStore('events', { keyPath:'seq', autoIncrement:true }); e.createIndex('dealId', 'dealId'); e.createIndex('documentId', 'documentId'); };
    r.onsuccess = function(){ res(r.result); }; r.onerror = function(){ rej(r.error || new Error('IndexedDB could not be opened.')); }; r.onblocked = function(){ rej(new Error('IndexedDB is blocked by another tab.')); }; }); return dbp; }
  /* one transaction, one result: fn(stores) may return a request or a value; the promise settles when the transaction commits */
  function tx(names, mode, fn){ return open().then(function(db){ return new Promise(function(res, rej){ var t = db.transaction(names, mode), st = {}; names.forEach(function(n){ st[n] = t.objectStore(n); }); var out; try { out = fn(st, t); } catch(e){ try { t.abort(); } catch(x){} return rej(e); }
    t.oncomplete = function(){ res(out && typeof out === 'object' && 'result' in out ? out.result : out); }; t.onerror = function(){ rej(t.error || new Error('IndexedDB transaction failed.')); }; t.onabort = function(){ rej(t.error || new Error('IndexedDB transaction aborted.')); }; }); }); }
  function getAll(store, indexName, key){ return new Promise(function(res, rej){ var src = indexName ? store.index(indexName) : store, r = key === undefined ? src.getAll() : src.getAll(key); r.onsuccess = function(){ res(r.result || []); }; r.onerror = function(){ rej(r.error); }; }); }
  function readAll(name, indexName, key){ return open().then(function(db){ return getAll(db.transaction([name], 'readonly').objectStore(name), indexName, key); }); }
  function rmw(storeName, id, p, label){ return open().then(function(db){ return new Promise(function(res, rej){ var t = db.transaction([storeName], 'readwrite'), st = t.objectStore(storeName), g = st.get(id), next;
    g.onsuccess = function(){ if(!g.result){ t.abort(); return rej(new Error('No ' + label + ' ' + id)); } try { next = clone(applyPatch(g.result, p)); } catch(e){ t.abort(); return rej(e); } st.put(next); };
    t.oncomplete = function(){ res(clone(next)); }; t.onerror = function(){ rej(t.error); }; t.onabort = function(){ rej(t.error || new Error('aborted')); }; }); }); }
  var byTime = function(a, b){ return String(a.receivedAt || a.createdAt).localeCompare(String(b.receivedAt || b.createdAt)) || ((a.seq || 0) - (b.seq || 0)) || String(a.id).localeCompare(String(b.id)); };
  return { kind:'indexeddb',
    putDocument:function(d){ if(!d || !d.id) return Promise.reject(new Error('A document needs an id.')); var c = clone(d); return tx(['documents'], 'readwrite', function(s){ s.documents.put(c); }).then(function(){ return clone(c); }); },
    getDocument:function(id){ return open().then(function(db){ return new Promise(function(res, rej){ var r = db.transaction(['documents'], 'readonly').objectStore('documents').get(id); r.onsuccess = function(){ res(clone(r.result || null)); }; r.onerror = function(){ rej(r.error); }; }); }); },
    listDocuments:function(f){ f = f || {}; return (f.dealId !== undefined ? readAll('documents', 'dealId', f.dealId) : readAll('documents')).then(function(a){ return a.filter(function(d){ return f.includeDeleted || !d.deletedAt; }).sort(byTime).map(clone); }); },
    updateDocument:function(id, p){ return rmw('documents', id, p, 'document'); },
    putPages:function(did, list){ var rows = clone(list || []).map(function(p){ return Object.assign({}, p, { documentId:did }); }); return tx(['pages'], 'readwrite', function(s){ var q = s.pages.index('documentId').openKeyCursor(IDBKeyRange.only(did)); q.onsuccess = function(){ var c = q.result; if(c){ s.pages.delete(c.primaryKey); c.continue(); } else rows.forEach(function(r){ s.pages.put(r); }); }; }).then(function(){ return true; }); },
    getPages:function(did){ return readAll('pages', 'documentId', did).then(function(a){ return a.sort(function(x, y){ return x.page - y.page; }).map(clone); }); },
    putFacts:function(list){ var rows = clone(list || []); rows.forEach(function(f){ if(!f || !f.id) throw new Error('A fact needs an id.'); }); return tx(['facts'], 'readwrite', function(s){ rows.forEach(function(f){ s.facts.put(f); }); }).then(function(){ return true; }); },
    listFacts:function(f){ f = f || {}; var src = f.documentId !== undefined ? readAll('facts', 'documentId', f.documentId) : f.dealId !== undefined ? readAll('facts', 'dealId', f.dealId) : f.field !== undefined ? readAll('facts', 'field', f.field) : readAll('facts');
      return src.then(function(a){ return a.filter(function(x){ return matches(x, f); }).sort(byTime).map(clone); }); },
    updateFact:function(id, p){ return rmw('facts', id, p, 'fact'); },
    appendEvent:function(ev){ var e = evOf(ev, I.clock()); delete e.seq; return open().then(function(db){ return new Promise(function(res, rej){ var t = db.transaction(['events'], 'readwrite'), r = t.objectStore('events').add(e); r.onsuccess = function(){ e.seq = r.result; }; t.oncomplete = function(){ res(clone(e)); }; t.onerror = function(){ rej(t.error); }; t.onabort = function(){ rej(t.error || new Error('aborted')); }; }); }); },
    listEvents:function(f){ f = f || {}; var src = f.documentId !== undefined ? readAll('events', 'documentId', f.documentId) : f.dealId !== undefined ? readAll('events', 'dealId', f.dealId) : readAll('events');
      return src.then(function(a){ return a.filter(function(e){ return matches(e, { dealId:f.dealId, documentId:f.documentId }) && (f.afterSeq == null || e.seq > f.afterSeq); }).sort(function(x, y){ return x.seq - y.seq; }).map(clone); }); },
    purgeDeal:function(dealId){ var self = this; return Promise.all([readAll('documents', 'dealId', dealId), readAll('facts', 'dealId', dealId)]).then(function(r){ var docs = r[0], facts = r[1];
      return tx(['documents', 'pages', 'facts'], 'readwrite', function(s){ docs.forEach(function(d){ s.documents.delete(d.id); var q = s.pages.index('documentId').openKeyCursor(IDBKeyRange.only(d.id)); q.onsuccess = function(){ var c = q.result; if(c){ s.pages.delete(c.primaryKey); c.continue(); } }; }); facts.forEach(function(f){ s.facts.delete(f.id); }); })
        .then(function(){ var n = { documents:docs.length, facts:facts.length }; return self.appendEvent({ dealId:dealId, documentId:null, stage:null, type:'purged', detail:n, actor:'system' }).then(function(){ return n; }); }); }); } };
}

I.createStore = function(opts){ opts = opts || {}; var kind = opts.kind || (typeof indexedDB !== 'undefined' ? 'indexeddb' : 'memory');
  if(kind === 'memory') return Promise.resolve(memoryStore());
  var s; try { s = idbStore(opts.name || 'bkcapital-ingest'); } catch(e){ return Promise.resolve(memoryStore()); }
  /* open now, so a store that cannot open is found out here and falls back to memory, with the reason kept */
  return s.listDocuments({ dealId:'__probe__' }).then(function(){ return s; }, function(err){ var m = memoryStore(); m.fellBackFrom = 'indexeddb'; m.fallbackReason = String(err && err.message || err); return m; }); };
})();
