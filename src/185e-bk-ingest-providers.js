/* DOCUMENT INGESTION, providers (Phase 2). The ingestion never talks to a model directly. It talks to a PROVIDER, an object with one job (read these pages, return facts), so the model behind it can change
   without rewriting anything, and so tests can use a scripted fake. No real provider is included in this phase: using one is a decision about where documents go (see the architecture assessment).

   A provider: { name, capabilities: { vision, pdf, maxPages }, extract(input) -> Promise<{ facts, usage: { inputTokens, outputTokens, costUsd }, model, promptVersion }> }
   input: { document, pages: [{ page, text }], schema, budget, dealId }

   BKIngest.extractWith(provider, input) is the ONLY way provider output enters the ingestion, and it does not trust it:
     - every fact is built into the fact record and validated; one that is malformed is REJECTED with the reasons and kept in the result, never dropped silently
     - the quoted line must be on the page the fact names, and the printed value must be in the quote; a fact that fails is kept but marked Low
     - a provider cannot grant its own Verified status: that is capped at Check (only our own checks and cross-document agreement can verify)
     - cost is counted against a budget; once it is spent, no further calls are made
   BKIngest.schemaFor(docType) -> { docType, fields: [{ field, label, kind }], allowExtra: true } from the field registry (the single list of what the model can receive). */
(function(){
'use strict';
var I = window.BKIngest = window.BKIngest || {};

I.providers = { _p:{}, register:function(name, p){ if(!p || typeof p.extract !== 'function') throw new Error('A provider has an extract() function.'); this._p[name] = p; return p; }, get:function(name){ return this._p[name] || null; }, list:function(){ return Object.keys(this._p); }, unregister:function(name){ delete this._p[name]; } };

I.schemaFor = function(docType){
  var reg = (window.BKReg && window.BKReg._raw && window.BKReg._raw.fields) || {}, fields = Object.keys(reg).filter(function(k){ var f = reg[k]; return f && f.kind !== 'table' && f.kind !== 'derived' && k[0] !== '_'; }).map(function(k){ return { field:k, label:reg[k].label, kind:reg[k].kind }; });
  return { docType:docType || 'unknown', fields:fields, allowExtra:true };
};

function pagesMap(pages){ var m = {}; (pages || []).forEach(function(p){ m[p.page] = p.text; }); return m; }
I.extractWith = function(provider, input){
  input = input || {}; var budget = input.budget || null, doc = input.document || {}, out = { accepted:[], rejected:[], usage:{ inputTokens:0, outputTokens:0, costUsd:0 }, model:null, promptVersion:null, overBudget:false };
  if(budget && budget.maxUsd != null && (budget.spentUsd || 0) >= budget.maxUsd){ out.overBudget = true; return Promise.resolve(out); }
  return Promise.resolve().then(function(){ return provider.extract({ document:doc, pages:input.pages || [], schema:input.schema || I.schemaFor(doc.docType), budget:budget, dealId:input.dealId }); }).then(function(res){
    res = res || {}; var u = res.usage || {}; out.usage = { inputTokens:+u.inputTokens || 0, outputTokens:+u.outputTokens || 0, costUsd:+u.costUsd || 0 }; out.model = res.model || null; out.promptVersion = res.promptVersion || null;
    if(budget){ budget.spentUsd = (budget.spentUsd || 0) + out.usage.costUsd; if(budget.maxUsd != null && budget.spentUsd > budget.maxUsd) out.overBudget = true; }
    if(!Array.isArray(res.facts)){ out.rejected.push({ fact:null, problems:[{ code:'provider-returned-no-facts', message:'The provider returned no list of facts.' }] }); return out; }
    var by = pagesMap(input.pages), seen = {};
    res.facts.forEach(function(raw){
      var f = I.makeFact(Object.assign({}, raw, { dealId:input.dealId != null ? input.dealId : raw && raw.dealId, documentId:doc.id != null ? doc.id : raw && raw.documentId, model:(raw && raw.model) || res.model || null, extractor:(raw && raw.extractor) || (provider.name || 'provider') + (res.promptVersion ? '@' + res.promptVersion : '') }));
      if(f.source && doc.id != null && f.source.documentId == null) f.source = Object.assign({}, f.source, { documentId:doc.id });
      var probs = I.validateFact(f); if(probs.length){ out.rejected.push({ fact:raw, problems:probs }); return; }
      var k = [f.field, f.value, f.source && f.source.page, f.source && f.source.quote].join('|'); if(seen[k]) return; seen[k] = 1;
      if(f.status === 'verified') { f.status = 'check'; f.checks.push({ id:'status-capped', ok:true, detail:'a provider cannot mark its own output Verified; it is Check until our checks or another document agree' }); }
      var checks = I.checkSource(f, by); checks.forEach(function(c){ f.checks.push(c); });
      if(checks.some(function(c){ return !c.ok; }) && f.status !== 'missing'){ f.status = 'low'; }
      out.accepted.push(f); });
    return out; });
};

/* a scripted provider for tests and rehearsals: script is { facts: [...] } or a function(input) -> { facts, usage?, model? }; every call is recorded in .calls */
I.providers.fake = function(script, opts){
  opts = opts || {}; var p = { name:opts.name || 'fake', capabilities:{ vision:false, pdf:false, maxPages:opts.maxPages || 200 }, calls:[],
    extract:function(input){ p.calls.push({ document:input.document && input.document.id, pages:(input.pages || []).map(function(x){ return x.page; }), schemaFields:(input.schema && input.schema.fields || []).length });
      if(opts.fail) return Promise.reject(new Error(opts.fail)); var r = typeof script === 'function' ? script(input) : script; r = r || { facts:[] };
      var chars = (input.pages || []).reduce(function(n, x){ return n + (x.text || '').length; }, 0), usage = r.usage || { inputTokens:Math.ceil(chars / 4), outputTokens:(r.facts || []).length * 60, costUsd:opts.costUsd == null ? 0.01 : opts.costUsd };
      return Promise.resolve({ facts:r.facts, usage:usage, model:r.model || 'fake-model', promptVersion:r.promptVersion || 'fake-1' }); } };
  return p;
};
})();
