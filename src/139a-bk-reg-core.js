/* ANALYSIS REGISTRY - CORE. An analysis type (Property Valuation, Acquisition Analysis, ...) is described by six parts, each kept in its own file:
     analyses   what the analysis is, the question it answers, the engine family it runs on, whether it is live   (139c)
     fields     one dictionary of every input: label, kind, help, an example, a suggestion; shared by all analyses   (139b)
     workflows  the steps of each analysis, the fields each step asks for and how each is required             (139d)
     summaries  the metrics each analysis leads with, from one metric dictionary                                (139e)
     reports    the PDF sections of each analysis                                                                (139f)
     checks     which validation rules apply to each analysis; the rest read N/A                                  (139g)
   This file only stores and reads them. The engines are not here and are never duplicated: a deal's analysisType chooses what is shown, asked and checked;
   its dealType (kept for every saved deal) still chooses the engine family. A deal with no analysisType is read from its dealType. */
(function(){
'use strict';
var R = { analyses:{}, order:[], fields:{}, workflows:{}, metrics:{}, summaries:{}, sections:{}, reports:{}, rules:{}, checks:{} };
function put(map, id, v){ if(map[id]) throw new Error('BKReg: ' + id + ' is defined twice'); map[id] = v; return v; }
var REQ = ['required', 'optional', 'conditional', 'na', 'derived'];
var BKReg = {
  REQ:REQ,
  addAnalysis:function(a){ put(R.analyses, a.id, a); R.order.push(a.id); return a; },
  addFields:function(list){ list.forEach(function(f){ put(R.fields, f.k, f); }); },
  addWorkflow:function(id, steps){ return put(R.workflows, id, steps); },
  addMetrics:function(list){ list.forEach(function(m){ put(R.metrics, m.id, m); }); },
  addSummary:function(id, spec){ return put(R.summaries, id, spec); },
  addSections:function(list){ list.forEach(function(x){ put(R.sections, x.id, x); }); },
  addReport:function(id, ids){ return put(R.reports, id, ids); },
  addRules:function(list){ list.forEach(function(x){ put(R.rules, x.id, x); }); },
  addChecks:function(id, ids){ return put(R.checks, id, ids); },
  analyses:function(){ return R.order.map(function(id){ return R.analyses[id]; }); },
  analysis:function(id){ return R.analyses[id] || null; },
  /* the analysis a deal is: its own analysisType, or the one its dealType implies (every deal saved before analysis types existed) */
  of:function(s){ s = s || (typeof bkLoad === 'function' ? bkLoad() : {}) || {}; return R.analyses[s.analysisType] || R.analyses[/develop/i.test(String(s.dealType || '')) ? 'development' : 'acquisition']; },
  field:function(k){ return R.fields[k] || null; },
  workflow:function(id){ return R.workflows[id] || []; },
  metric:function(id){ return R.metrics[id] || null; },
  summary:function(id){ return R.summaries[id] || null; },
  section:function(id){ return R.sections[id] || null; },
  report:function(id){ return (R.reports[id] || []).map(function(x){ return R.sections[x]; }); },
  rule:function(id){ return R.rules[id] || null; },
  checks:function(id){ return R.checks[id] || []; },
  /* is a field required, optional, not applicable ... in this step, for this deal. Conditional fields resolve against the deal. */
  requirement:function(entry, s){ var q = entry.req || 'optional'; if(q === 'conditional') return (typeof entry.when === 'function' && entry.when(s || {})) ? 'required' : 'na'; return q; },
  /* a value is present when it was entered: blank and null are missing; zero is missing for amounts that cannot be zero (a price, a unit count) */
  present:function(k, s){ var f = R.fields[k] || {}, v = (s || {})[k];
    if(f.kind === 'table') return Array.isArray(v) && v.length > 0;
    if(f.kind === 'text' || f.kind === 'date' || f.kind === 'choice') return v != null && String(v).trim() !== '';
    if(f.kind === 'bool') return v === true || v === false;
    if(v === null || v === undefined || v === '') return false;
    var n = Number(v); if(!isFinite(n)) return false; return f.zeroOk ? true : n !== 0; },
  /* each step's state for a deal, computed from the deal (never stored), so editing anywhere updates it */
  stepState:function(step, s){ var need = (step.fields || []).filter(function(e){ return BKReg.requirement(e, s) === 'required'; }), miss = need.filter(function(e){ return !BKReg.present(e.k, s); });
    return { required:need.length, missing:miss.map(function(e){ return e.k; }), complete:miss.length === 0 }; },
  /* consistency of the registry itself: every reference resolves, and a live analysis never asks for a field, metric or section that is not built */
  lint:function(){ var bad = [];
    R.order.forEach(function(id){ var a = R.analyses[id];
      if(!R.workflows[id]) bad.push(id + ': no workflow'); if(!R.summaries[id]) bad.push(id + ': no summary'); if(!R.reports[id]) bad.push(id + ': no report'); if(!R.checks[id]) bad.push(id + ': no checks');
      (R.workflows[id] || []).forEach(function(st){ if(!st.id || !st.title) bad.push(id + ': a step without an id or title');
        (st.fields || []).forEach(function(e){ var f = R.fields[e.k]; if(!f) bad.push(id + '/' + st.id + ': unknown field ' + e.k); else if(a.live && f.planned) bad.push(id + '/' + st.id + ': live analysis asks for planned field ' + e.k);
          if(REQ.indexOf(e.req || 'optional') < 0) bad.push(id + '/' + st.id + ': bad requirement ' + e.req); if(e.req === 'conditional' && typeof e.when !== 'function') bad.push(id + '/' + st.id + ': conditional ' + e.k + ' without a condition'); }); });
      var sm = R.summaries[id]; if(sm){ (sm.metrics || []).concat([sm.primary]).forEach(function(m){ var d = R.metrics[m]; if(!d) bad.push(id + ': unknown metric ' + m); else if(a.live && d.planned) bad.push(id + ': live analysis leads with planned metric ' + m); }); }
      (R.reports[id] || []).forEach(function(x){ var d = R.sections[x]; if(!d) bad.push(id + ': unknown report section ' + x); else if(a.live && d.planned) bad.push(id + ': live analysis reports planned section ' + x); });
      (R.checks[id] || []).forEach(function(x){ if(!R.rules[x]) bad.push(id + ': unknown rule ' + x); }); });
    return bad; },
  _raw:R
};
window.BKReg = BKReg;
})();
