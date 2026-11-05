/* DOCUMENT INGESTION, pipeline (Phase 2). Each document moves through the same stages, one at a time, and every step is recorded: started, done, skipped, failed (with the reason), retried.
     intake > classify > read > extract > normalize > validate > reconcile > propose
   A stage is a function registered by name. In this phase classify, read and validate do real work; extract runs only when a provider is explicitly configured; normalize, reconcile and propose are
   registered as skipped with the reason, so the machinery (status, retry, resume, audit) is exercised end to end now and the later phases fill in stages without changing it.

     BKIngest.stage(name, fn, { timeoutMs })          fn(ctx, doc) -> Promise<{ status?: 'done' | 'skipped', note?, result?, docPatch? }>; throwing fails the stage
     BKIngest.run(ctx, { documentIds, until })       runs the pending stages of each document, one document at a time; a failed stage stops that document and leaves the rest pending
     BKIngest.retry(ctx, docId, stage)               a failed stage goes back to pending (and the stages after it), with an event
     BKIngest.resume(ctx)                            stages left "running" by a closed or reloaded page are marked failed (interrupted) so they can be retried
     BKIngest.skip(ctx, docId, stage, reason)        a person skips a stage
     BKIngest.docStatus(doc)                         rejected | duplicate | failed | processing | complete | pending
   ctx = { store, blobs, dealId, actor, provider?, onProgress?, cache? } */
(function(){
'use strict';
var I = window.BKIngest = window.BKIngest || {};
I.stages = I.stages || {};
I.stage = function(name, fn, opts){ I.stages[name] = { fn:fn, timeoutMs:(opts && opts.timeoutMs) || 120000 }; };

I.docStatus = function(d){
  if(!d) return 'pending'; if(d.status === 'rejected' || d.status === 'duplicate') return d.status; var s = d.stages || {}, v = I.STAGES.map(function(n){ return (s[n] || {}).status; });
  if(v.indexOf('failed') >= 0) return 'failed'; if(v.indexOf('running') >= 0) return 'processing'; if(v.every(function(x){ return x === 'done' || x === 'skipped'; })) return 'complete'; return 'pending';
};
function ev(ctx, doc, stage, type, detail){ return ctx.store.appendEvent({ dealId:ctx.dealId, documentId:doc.id, stage:stage, type:type, detail:detail || {}, actor:ctx.actor || 'system' }); }
function patchStage(ctx, id, name, p, docPatch){ return ctx.store.updateDocument(id, function(d){ d.stages[name] = Object.assign({}, d.stages[name], p); if(docPatch) Object.keys(docPatch).forEach(function(k){ d[k] = docPatch[k]; }); return d; }); }
function withTimeout(promise, ms, label){ var t; return Promise.race([promise, new Promise(function(_, rej){ t = setTimeout(function(){ rej(new Error(label + ' timed out after ' + (ms < 1000 ? ms + ' ms' : Math.round(ms / 1000) + ' s'))); }, ms); })]).then(function(v){ clearTimeout(t); return v; }, function(e){ clearTimeout(t); throw e; }); }

function runStage(ctx, doc, name){
  var reg = I.stages[name], now = I.clock();
  if(!reg){ return patchStage(ctx, doc.id, name, { status:'skipped', finishedAt:now, note:'no ' + name + ' stage is registered in this version' }).then(function(d){ return ev(ctx, d, name, 'stage-skipped', { reason:'not registered' }).then(function(){ return d; }); }); }
  return patchStage(ctx, doc.id, name, { status:'running', startedAt:now, finishedAt:null, error:null, attempts:((doc.stages[name] || {}).attempts || 0) + 1 }).then(function(d){
    if(ctx.onProgress) try { ctx.onProgress(d, name, 'running'); } catch(e){}
    return ev(ctx, d, name, 'stage-start', { attempt:d.stages[name].attempts }).then(function(){
      return withTimeout(Promise.resolve().then(function(){ return reg.fn(ctx, d); }), reg.timeoutMs, name).then(function(r){ r = r || {}; var st = r.status === 'skipped' ? 'skipped' : 'done';
        return patchStage(ctx, d.id, name, { status:st, finishedAt:I.clock(), note:r.note || '', error:null, result:r.result === undefined ? null : r.result }, r.docPatch).then(function(d2){ return ev(ctx, d2, name, st === 'skipped' ? 'stage-skipped' : 'stage-done', { note:r.note || '', result:r.result === undefined ? null : r.result }).then(function(){ if(ctx.onProgress) try { ctx.onProgress(d2, name, st); } catch(e){} return d2; }); });
      }, function(err){ var msg = String(err && err.message || err);
        return patchStage(ctx, d.id, name, { status:'failed', finishedAt:I.clock(), error:msg }).then(function(d2){ return ev(ctx, d2, name, 'stage-failed', { error:msg }).then(function(){ if(ctx.onProgress) try { ctx.onProgress(d2, name, 'failed'); } catch(e){} return d2; }); }); }); }); });
}
function runDoc(ctx, doc, until){
  var names = I.STAGES.slice(1), i = 0;
  function next(d){
    if(i >= names.length) return Promise.resolve(d); var n = names[i++], st = d.stages[n] || { status:'pending' };
    if(st.status === 'done' || st.status === 'skipped') return n === until ? Promise.resolve(d) : next(d);
    if(st.status === 'failed' || st.status === 'running') return Promise.resolve(d);
    return runStage(ctx, d, n).then(function(d2){ if(d2.stages[n].status === 'failed' || n === until) return d2; return next(d2); });
  }
  return next(doc);
}
I.run = function(ctx, opts){
  opts = opts || {};
  return ctx.store.listDocuments({ dealId:ctx.dealId }).then(function(docs){
    var todo = docs.filter(function(d){ return d.status !== 'rejected' && d.status !== 'duplicate' && (!opts.documentIds || opts.documentIds.indexOf(d.id) >= 0); });
    return todo.reduce(function(p, d){ return p.then(function(acc){ return runDoc(ctx, d, opts.until).then(function(d2){ acc.push({ documentId:d2.id, name:d2.name, status:I.docStatus(d2), stages:I.STAGES.reduce(function(o, n){ o[n] = (d2.stages[n] || {}).status; return o; }, {}) }); return acc; }); }); }, Promise.resolve([]));
  });
};
/* reset a stage, and every stage after it, to pending */
function reset(ctx, docId, name, why){ var from = I.STAGES.indexOf(name); if(from < 1) return Promise.reject(new Error('Intake cannot be run again; add the file again.'));
  return ctx.store.updateDocument(docId, function(d){ I.STAGES.slice(from).forEach(function(n){ var s = d.stages[n] || {}; d.stages[n] = { status:'pending', attempts:s.attempts || 0, startedAt:null, finishedAt:null, error:null, note:'' }; }); return d; }).then(function(d){ return ev(ctx, d, name, 'retry', { reason:why }).then(function(){ return d; }); }); }
I.retry = function(ctx, docId, name){ return ctx.store.getDocument(docId).then(function(d){ if(!d) throw new Error('No such document.'); if(!d.stages[name] || d.stages[name].status !== 'failed') throw new Error('Only a failed stage is retried (this one is ' + ((d.stages[name] || {}).status || 'unknown') + ').'); return reset(ctx, docId, name, 'retry after failure'); }); };
I.rerun = function(ctx, docId, name){ return reset(ctx, docId, name, 're-run requested'); };
I.skip = function(ctx, docId, name, reason){ return ctx.store.getDocument(docId).then(function(d){ if(!d) throw new Error('No such document.'); if(!reason) throw new Error('A skipped stage says why.'); return patchStage(ctx, docId, name, { status:'skipped', finishedAt:I.clock(), note:'skipped by a person: ' + reason, error:null }).then(function(d2){ return ev(ctx, d2, name, 'stage-skipped', { reason:reason, by:'person' }).then(function(){ return d2; }); }); }); };
I.resume = function(ctx){ return ctx.store.listDocuments({ dealId:ctx.dealId }).then(function(docs){ var out = []; return docs.reduce(function(p, d){ return p.then(function(){ var run = I.STAGES.filter(function(n){ return (d.stages[n] || {}).status === 'running'; }); return run.reduce(function(q, n){ return q.then(function(){ return patchStage(ctx, d.id, n, { status:'failed', finishedAt:I.clock(), error:'interrupted: the page was closed or reloaded while this stage ran' }).then(function(d2){ out.push({ documentId:d.id, stage:n }); return ev(ctx, d2, n, 'resume-interrupted', {}); }); }); }, Promise.resolve()); }); }, Promise.resolve()).then(function(){ return out; }); }); };

/* ---------------------------------------------------------------- reading a stored file with the existing readers */
function getFile(ctx, doc){ return ctx.blobs.get(doc.fileId).then(function(r){ if(!r || !r.blob) throw new Error('The file is no longer stored (it was removed from Deal Documents).'); var b = r.blob; return (typeof File !== 'undefined' && b instanceof File) ? b : new File([b], doc.name, { type:doc.mime || b.type }); }); }
function lines(rows){ return (rows || []).map(function(r){ return (r || []).filter(function(c){ return c != null && String(c).trim() !== ''; }).map(function(c){ return String(c).trim(); }).join('  '); }).filter(Boolean).join('\n'); }
I.pagesFromParsed = function(parsed){ return (parsed.sheets || []).map(function(sh, i){ return { page:i + 1, text:lines(sh.rows), source:parsed.kind === 'pdf' ? 'text' : 'sheet', sheet:sh.name || null }; }); };
var SHEET_KINDS = { xlsx:1, xlsm:1, csv:1, txt:1 };
function parseWith(ctx, doc){ ctx.cache = ctx.cache || {}; if(ctx.cache[doc.id]) return Promise.resolve(ctx.cache[doc.id]);
  if(typeof window.bkImportParseFile !== 'function') return Promise.reject(new Error('The file reader is not available.'));
  return getFile(ctx, doc).then(function(f){ return window.bkImportParseFile(f); }).then(function(parsed){ ctx.cache[doc.id] = parsed; return parsed; }); }
function unreadable(doc){ if(doc.kind === 'xls') return 'legacy .xls is not read; save it as .xlsx'; if(doc.kind === 'docx' || doc.kind === 'doc') return 'Word documents are read in a later phase'; if(/^(png|jpeg|gif|webp|tiff|bmp|heic)$/.test(doc.kind)) return 'images are read with text recognition in a later phase'; if(doc.kind === 'pptx') return 'PowerPoint files are not read'; return ''; }

/* classify: a peek at the content (sheets, or the text layer of a PDF), never text recognition */
I.stage('classify', function(ctx, doc){
  var why = unreadable(doc), peek;
  if(SHEET_KINDS[doc.kind] || doc.kind === 'pdf') peek = parseWith(ctx, doc).then(function(parsed){ return { parsed:parsed }; }, function(err){ return { error:String(err && err.message || err) }; }); else peek = Promise.resolve({});
  return peek.then(function(p){
    var parsed = p.parsed, pages = parsed && parsed.kind === 'pdf' ? I.pagesFromParsed(parsed).filter(function(x){ return x.text.trim(); }) : null, sheets = parsed && parsed.kind !== 'pdf' ? parsed.sheets : null;
    var c = I.classifyDocument({ name:doc.name, kind:doc.kind, pages:pages, sheets:sheets }), note = c.type + ' (' + Math.round(c.confidence * 100) + '%)' + (p.error ? '; the content could not be peeked: ' + p.error : '') + (why ? '; ' + why : '');
    return { status:'done', note:note, result:{ type:c.type, confidence:c.confidence, reasons:c.reasons.slice(0, 4), needsOcr:c.needsOcr }, docPatch:{ docType:c.type, classification:{ confidence:c.confidence, reasons:c.reasons, alternatives:c.alternatives, needsOcr:c.needsOcr }, period:c.period, property:c.property, propertyKey:c.property ? c.property.key : null } };
  });
}, { timeoutMs:120000 });

/* read: every page or sheet becomes a page record with its text (kept in the store for the stages after); the PDF.js reader (with text recognition for image pages) is used when it can load, the in-app text reader otherwise */
I.stage('read', function(ctx, doc){
  var why = unreadable(doc); if(why) return Promise.resolve({ status:'skipped', note:why });
  var pagesP;
  if(SHEET_KINDS[doc.kind]) pagesP = parseWith(ctx, doc).then(function(parsed){ return { pages:I.pagesFromParsed(parsed), method:'sheet' }; });
  else if(doc.kind === 'pdf'){
    var viaPdfJs = (ctx.allowPdfJs !== false && typeof window.bkOMPageText === 'function') ? getFile(ctx, doc).then(function(f){ return window.bkOMPageText(f); }).then(function(arr){ if(!arr || !arr.length) throw new Error('PDF.js returned no pages'); return { pages:arr.map(function(t, i){ return { page:i + 1, text:String(t || ''), source:'text' }; }), method:'pdfjs' }; }) : Promise.reject(new Error('PDF.js reader not available'));
    pagesP = viaPdfJs.catch(function(e1){ return parseWith(ctx, doc).then(function(parsed){ return { pages:I.pagesFromParsed(parsed), method:'text-decoder', fallbackFrom:String(e1 && e1.message || e1) }; }); });
  } else return Promise.resolve({ status:'skipped', note:'nothing to read for a ' + doc.kind + ' file' });
  return pagesP.then(function(r){
    var empty = r.pages.filter(function(p){ return !p.text.trim(); }).length;
    return ctx.store.putPages(doc.id, r.pages).then(function(){
      var res = { pages:r.pages.length, emptyPages:empty, method:r.method }, patch = { pageCount:r.pages.length };
      /* a document the peek could not place is placed again from every page */
      return ctx.store.getDocument(doc.id).then(function(cur){ var c = cur.classification || {}; if(doc.kind === 'pdf' && (!cur.docType || cur.docType === 'unknown' || (c.confidence != null && c.confidence < 0.6))){
        var cl = I.classifyDocument({ name:doc.name, kind:doc.kind, pages:r.pages.filter(function(p){ return p.text.trim(); }) });
        if(cl.type !== 'unknown' && cl.confidence > (c.confidence || 0)){ patch.docType = cl.type; patch.classification = { confidence:cl.confidence, reasons:cl.reasons, alternatives:cl.alternatives, needsOcr:cl.needsOcr }; patch.period = cl.period || cur.period; patch.property = cl.property || cur.property; patch.propertyKey = cl.property ? cl.property.key : cur.propertyKey; res.reclassified = cl.type; } }
        return { status:'done', note:r.pages.length + ' ' + (doc.kind === 'pdf' ? 'page' : 'sheet') + (r.pages.length === 1 ? '' : 's') + ' read (' + r.method + ')' + (empty ? '; ' + empty + ' with no text (needs text recognition)' : '') + (r.fallbackFrom ? '; PDF.js unavailable: ' + r.fallbackFrom : ''), result:res, docPatch:patch }; }); });
  });
}, { timeoutMs:900000 });

/* extract: only when a provider has been configured for this run (nothing is sent anywhere otherwise) */
I.stage('extract', function(ctx, doc){
  if(!ctx.provider) return Promise.resolve({ status:'skipped', note:'no extraction provider is configured, so nothing is extracted or sent anywhere' });
  return ctx.store.getPages(doc.id).then(function(pages){ var withText = pages.filter(function(p){ return p.text && p.text.trim(); }); if(!withText.length) return { status:'skipped', note:'no readable text on any page' };
    return I.extractWith(ctx.provider, { document:doc, pages:withText, schema:I.schemaFor(doc.docType), budget:ctx.budget, dealId:ctx.dealId }).then(function(r){
      var facts = r.accepted.map(function(f){ return Object.assign({}, f, { dealId:ctx.dealId, documentId:doc.id }); });
      return ctx.store.putFacts(facts).then(function(){ return { status:'done', note:facts.length + ' fact' + (facts.length === 1 ? '' : 's') + ' extracted' + (r.rejected.length ? ', ' + r.rejected.length + ' rejected' : '') + (r.overBudget ? '; stopped at the budget' : ''), result:{ accepted:facts.length, rejected:r.rejected.length, usage:r.usage, overBudget:!!r.overBudget } }; }); }); });
}, { timeoutMs:600000 });

['normalize', 'reconcile', 'propose'].forEach(function(n){ var why = { normalize:'units, periods and sign conventions are normalized in the reader phases', reconcile:'cross-document reconciliation is built in a later phase', propose:'proposing values to the model is built in a later phase' }[n]; I.stage(n, function(){ return Promise.resolve({ status:'skipped', note:why }); }); });

/* validate: every fact the document has is checked again here: well formed, and its quoted line must be on the page it names. A fact that fails is marked Low with the reason; none is dropped silently. */
I.stage('validate', function(ctx, doc){
  return Promise.all([ctx.store.listFacts({ documentId:doc.id }), ctx.store.getPages(doc.id)]).then(function(r){
    var facts = r[0], pages = r[1]; if(!facts.length) return { status:'skipped', note:'no facts to validate' };
    var bad = 0, low = 0; return facts.reduce(function(p, f){ return p.then(function(){
      var probs = I.validateFact(f), checks = f.checks.filter(function(c){ return !/^(source-page|quote-on-page|raw-in-quote|schema)$/.test(c.id); }).concat(I.checkSource(f, pages)); checks.push({ id:'schema', ok:probs.length === 0, detail:probs.length ? probs.map(function(x){ return x.code; }).join(', ') : 'well formed' });
      var failed = checks.some(function(c){ return !c.ok; }), next = failed && f.status !== 'missing' && f.status !== 'conflict' ? 'low' : f.status; if(failed) bad++; if(next === 'low' && f.status !== 'low') low++;
      return ctx.store.updateFact(f.id, { checks:checks, status:next }); }); }, Promise.resolve()).then(function(){ return { status:'done', note:facts.length + ' facts checked; ' + bad + ' failed a check' + (low ? ' (' + low + ' marked Low)' : ''), result:{ facts:facts.length, failed:bad, markedLow:low } }; });
  });
});
})();
