/* AI EXPLANATION LAYER (Guide 2.0 phase 3). OFF BY DEFAULT, and NO provider is included: with none registered this part adds nothing to any page and makes no request of any kind.
   It explains the review's own findings in plain words. It never calculates, never decides, and never writes to the deal.

   The boundary:
     provider   an object { id, label, explain(payload) -> Promise<{ explanations:[{ id, text }] }> }, registered with bkAiRegisterProvider. The scripted fake below (bkAiScriptedProvider) is the only one that exists here, for tests.
     payload    bkAiPayload(): STRUCTURED FINDINGS ONLY (class, tier, group, input key, rule, the finding's own wording and measured effect). Names, locations, deal ID, investors, lenders and the like are removed from the text
                before it leaves this part (the deal's own identifying fields are removed wherever they appear). The payload is shown to the user on request, exactly as it would be sent.
     response   TEXT ONLY, validated before it is shown: it must answer a finding that was sent, contain no markup or link, be short, and carry no figure that is not already in that finding (no new financial facts).
                Anything else is withheld and logged; the deterministic finding is shown alone. The text is rendered as text, never as HTML.
     audit      each explanation is shown BELOW the unchanged finding, labelled "AI explanation", with its provider and a note that it is not part of the model. bkAiAudit() keeps what was sent, to whom and what happened.
   The deal, the Base Case and every engine are never touched: this part has no call to bkSave and keeps its results in memory only. */
(function(){
'use strict';
if(typeof bkLoad !== 'function') return;
var ON_KEY = 'bk_ai_explain_on', PROVIDERS = [], CACHE = {}, AUDIT = [], PENDING = {}, MAXLEN = 600, TIMEOUT = 8000;
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function hash(str){ var h = 2166136261; for(var i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ('00000000' + (h >>> 0).toString(16)).slice(-8); }

/* ---- the switch and the provider ---- */
window.bkAiRegisterProvider = function(p){ if(!p || typeof p.explain !== 'function' || !p.id) return false; PROVIDERS = PROVIDERS.filter(function(x){ return x.id !== p.id; }); PROVIDERS.push({ id:String(p.id), label:String(p.label || p.id), explain:p.explain, scripted:!!p.scripted }); return true; };
window.bkAiUnregisterAll = function(){ PROVIDERS = []; CACHE = {}; PENDING = {}; };
window.bkAiProvider = function(){ return PROVIDERS[0] || null; };
window.bkAiEnabled = function(){ return !!PROVIDERS.length && safe(function(){ return localStorage.getItem(ON_KEY) === '1'; }, false); };   /* both: a provider exists AND the user turned it on */
window.bkAiSet = function(on){ if(!PROVIDERS.length) return; safe(function(){ localStorage.setItem(ON_KEY, on ? '1' : '0'); }); if(on) window.bkAiRun(); repaint(); };

/* ---- the findings that may be explained, and the payload that describes them ---- */
function explainable(s){ var q = safe(function(){ return window.bkDealFindings(s, { measure:false }); }, null); return q ? q.findings.filter(function(f){ return f.kind !== 'consequential' && f.tier <= 6; }).slice(0, 12) : []; }
function fkey(f){ return hash(String(f.rule) + '|' + String(f.field || '') + '|' + String(f.title)); }
window.bkAiFindingId = function(f){ return 'f-' + fkey(f); };
function dealKey(s){ return hash(JSON.stringify(s, function(k, v){ return k === '_guide' || k === '_hist' || k === '_imp' ? undefined : v; })); }
/* every identifying value the deal holds, to be removed from the text before it is sent */
function identifiers(s){ var out = []; Object.keys(s || {}).forEach(function(k){ var v = s[k]; if(typeof v === 'string' && v.trim().length >= 3 && /name|address|location|sponsor|lender|tenant|email|phone|dealid|market|city|contact/i.test(k)) out.push(v.trim()); });
  safe(function(){ (window.bkInvestorRegistryLoad() || []).forEach(function(r){ if(r && r.name && String(r.name).length >= 3) out.push(String(r.name)); }); }, 0);
  safe(function(){ (s.commitments || []).forEach(function(c){ if(c && c.nameOverride) out.push(String(c.nameOverride)); }); }, 0);
  out.sort(function(a, b){ return b.length - a.length; }); return out.filter(function(v, i){ return out.indexOf(v) === i; }); }
function scrub(text, ids){ var t = String(text == null ? '' : text); ids.forEach(function(id){ t = t.split(id).join('[withheld]'); t = t.replace(new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '[withheld]'); }); return t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[withheld]'); }
window.bkAiPayload = function(s){ s = s || bkLoad(); var ids = identifiers(s), list = explainable(s);
  return { schema:'bk-findings-v1', purpose:'Explain each finding in plain words for an investment professional.',
    rules:['Use only the facts in the finding you are explaining.', 'Do not add any figure, assumption, risk or accounting or tax conclusion that is not in the finding.', 'Do not propose changes to the deal.', 'Reply with text only.'],
    findings:list.map(function(f){ return { id:'f-' + fkey(f), class:f.cls, tier:f.tier, group:f.group || '', input:f.field || '', rule:String(f.rule || ''), finding:scrub(f.title, ids), detail:scrub(f.detail || '', ids), measured:scrub(f.impactText || '', ids), proposal:f.fix ? scrub(f.fix.label, ids) : '' }; }) }; };

/* ---- what a reply must satisfy to be shown ---- */
function numbers(t){ var m = String(t).match(/\$?\d[\d,]*(?:\.\d+)?/g) || []; return m.map(function(x){ return x.replace(/[$,]/g, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''); }); }
function groundedIn(text, p){ var allowed = {}; [p.finding, p.detail, p.measured, p.proposal].forEach(function(src){ numbers(src).forEach(function(n){ allowed[n] = 1; }); }); return numbers(text).filter(function(n){ return !allowed[n]; }); }
function check(item, sent){ if(!item || typeof item !== 'object' || Array.isArray(item)) return 'not a finding explanation';
  if(typeof item.id !== 'string' || !sent[item.id]) return 'it answers a finding that was not sent';
  if(typeof item.text !== 'string') return 'the explanation is not text'; var t = item.text.trim(); if(!t) return 'the explanation is empty'; if(t.length > MAXLEN) return 'the explanation is too long';
  if(/[<>]/.test(t) || /https?:|www\.|javascript:|data:/i.test(t)) return 'it contains markup or a link';
  var extra = groundedIn(t, sent[item.id]); if(extra.length) return 'it states a figure that is not in the finding (' + extra.slice(0, 3).join(', ') + ')';
  return ''; }

/* ---- asking, validating, remembering (memory only) ---- */
function note(e){ AUDIT.push(Object.assign({ at:new Date().toISOString() }, e)); if(AUDIT.length > 200) AUDIT.shift(); }
window.bkAiAudit = function(){ return AUDIT.slice(); };
window.bkAiRun = function(){ var prov = window.bkAiProvider(); if(!prov || !window.bkAiEnabled()) return Promise.resolve(false); var s = bkLoad(), dk = dealKey(s), payload = window.bkAiPayload(s); if(!payload.findings.length) return Promise.resolve(false);
  var todo = payload.findings.filter(function(p){ return !CACHE[dk + p.id]; }); if(!todo.length || PENDING[dk]) return Promise.resolve(false);
  PENDING[dk] = 1; var sent = {}; todo.forEach(function(p){ sent[p.id] = p; }); var out = Object.assign({}, payload, { findings:todo }), ph = hash(JSON.stringify(out));
  var asked = new Promise(function(res, rej){ var done = false, tm = setTimeout(function(){ if(!done){ done = true; rej(new Error('no answer in time')); } }, Number(window.BK_AI_TIMEOUT_MS) || TIMEOUT); Promise.resolve().then(function(){ return prov.explain(JSON.parse(JSON.stringify(out))); }).then(function(r){ if(!done){ done = true; clearTimeout(tm); res(r); } }, function(e){ if(!done){ done = true; clearTimeout(tm); rej(e); } }); });
  return asked.then(function(r){ var list = r && typeof r === 'object' && Array.isArray(r.explanations) ? r.explanations : null;
    if(!list){ todo.forEach(function(p){ CACHE[dk + p.id] = { status:'withheld', why:'the reply was not in the expected form', provider:prov.label }; note({ finding:p.id, rule:p.rule, provider:prov.id, payload:ph, status:'withheld', why:'malformed reply' }); }); return; }
    var seen = {}; list.slice(0, 40).forEach(function(it){ var why = check(it, sent); if(why){ if(it && typeof it.id === 'string' && sent[it.id] && !seen[it.id]){ seen[it.id] = 1; CACHE[dk + it.id] = { status:'withheld', why:why, provider:prov.label }; } note({ finding:it && typeof it.id === 'string' ? String(it.id).slice(0, 20) : '?', rule:it && sent[it.id] ? sent[it.id].rule : '', provider:prov.id, payload:ph, status:'withheld', why:why }); return; }
      if(seen[it.id]) return; seen[it.id] = 1; CACHE[dk + it.id] = { status:'shown', text:it.text.trim(), provider:prov.label }; note({ finding:it.id, rule:sent[it.id].rule, provider:prov.id, payload:ph, status:'shown', why:'' }); });
    todo.forEach(function(p){ if(!CACHE[dk + p.id]){ CACHE[dk + p.id] = { status:'none', why:'the provider gave no explanation for this finding', provider:prov.label }; note({ finding:p.id, rule:p.rule, provider:prov.id, payload:ph, status:'none', why:'no answer' }); } }); },
    function(e){ todo.forEach(function(p){ CACHE[dk + p.id] = { status:'unavailable', why:'the provider did not answer', provider:prov.label }; }); note({ finding:'*', rule:'', provider:prov.id, payload:ph, status:'unavailable', why:String(e && e.message || e).slice(0, 80) }); })
    .then(function(){ delete PENDING[dk]; repaint(); return true; }); };

/* the scripted provider (for tests and demonstrations): no model, no network, only what its script says. script = function(payload) -> reply, or { findingId: text }. It records every payload it is given. */
window.bkAiScriptedProvider = function(script, label){ var calls = [];
  return { id:'scripted', label:label || 'Scripted test provider', scripted:true, calls:calls, explain:function(payload){ calls.push(payload);
    return Promise.resolve(typeof script === 'function' ? script(payload) : { explanations:payload.findings.filter(function(f){ return script && script[f.id]; }).map(function(f){ return { id:f.id, text:script[f.id] }; }) }); } }; };

/* ---- the page: a switch above the findings (only when a provider exists) and the explanation under each finding ---- */
window.bkAiBarHtml = function(){ var p = window.bkAiProvider(); if(!p) return ''; var on = window.bkAiEnabled();
  return '<div class="bk-ai-bar" id="bk-ai-bar"><span><b>AI explanations: ' + (on ? 'On' : 'Off') + '</b> <small>' + esc(p.label) + '. It explains the findings below in words; it adds no figures, changes nothing and is not part of the model.</small></span>'
    + '<span><button type="button" class="bk-btn" onclick="bkAiSet(' + (on ? 'false' : 'true') + ')">' + (on ? 'Turn off' : 'Turn on') + '</button> <button type="button" class="bk-btn" onclick="bkAiShowSent()">Show what is sent</button></span><pre class="bk-ai-sent" id="bk-ai-sent" hidden></pre></div>'; };
window.bkAiShowSent = function(){ var el = document.getElementById('bk-ai-sent'); if(!el) return; if(!el.hidden){ el.hidden = true; return; } el.textContent = JSON.stringify(window.bkAiPayload(bkLoad()), null, 2); el.hidden = false; };
window.bkAiPaint = function(){ var bar = document.getElementById('bk-ai-bar'); if(bar){ var fresh = window.bkAiBarHtml(); if(fresh){ var keep = document.getElementById('bk-ai-sent'), open = keep && !keep.hidden, tmp = document.createElement('div'); tmp.innerHTML = fresh; var nb = tmp.firstChild; if(open){ nb.querySelector('#bk-ai-sent').textContent = keep.textContent; nb.querySelector('#bk-ai-sent').hidden = false; } bar.replaceWith(nb); } }
  [].forEach.call(document.querySelectorAll('.bk-ai-x'), function(e){ e.remove(); }); if(!window.bkAiEnabled()) return;
  var s = bkLoad(), dk = dealKey(s), by = {}; explainable(s).forEach(function(f){ by['f-' + fkey(f)] = f; });
  [].forEach.call(document.querySelectorAll('.bk-rv-i[data-fid]'), function(el){ var r = CACHE[dk + el.getAttribute('data-fid')]; if(!r) return; var box = document.createElement('div'); box.className = 'bk-ai-x bk-ai-' + r.status;
    box.innerHTML = '<em class="bk-ai-tag">AI explanation</em>' + (r.status === 'shown' ? '<span>' + esc(r.text) + '</span><small>Explains the finding above, in words only. Written by ' + esc(r.provider) + ' from that finding; it is not part of the model and changes nothing.</small>' : '<small>No AI explanation is shown for this finding: ' + esc(r.why) + '. The finding above stands on its own.</small>');
    var body = el.firstElementChild; if(body) body.appendChild(box); }); };
function repaint(){ safe(function(){ window.bkAiPaint(); }); }
})();
