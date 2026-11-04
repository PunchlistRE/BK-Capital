/* ANALYSIS REGISTRY - STAGES. The step bar across the top of every sheet: each analysis's stages, the sheets that belong to each, and how each stage's
   status is judged. 'judge' names a status rule in the step bar (src/124): identity, inputs, operations, debt, returns and review are the rules the
   Acquisition and Development stages have always used; 'steps' marks a stage done when the listed workflow steps (src/139d) are complete, which is how
   the analyses that are not built yet will be judged. Acquisition and Development reproduce today's step bar exactly. Also: the tiles the Overview leads with. */
(function(){
'use strict';
if(!window.BKReg) return;
var R = window.BKReg, ST = {}, TILES = {};
function G(id, label, sheets, judge, steps){ return { id:id, label:label, sheets:sheets, judge:judge, steps:steps || [] }; }
var CORE = [
  G('setup', 'Setup', ['Home'], 'identity'),
  G('inputs', 'Inputs', ['Deal Underwrite', 'Rent Roll', 'Import', 'Depreciation', 'Source Data'], 'inputs'),
  G('ops', 'Operations', ['Operating Underwrite', 'Property CF'], 'operations'),
  G('debt', 'Debt', ['Debt', 'Debt Schedule', 'Covenant Monitor'], 'debt'),
  G('returns', 'Returns', ['Returns', 'Equity Waterfall', 'After-Tax'], 'returns'),
  G('review', 'Review', ['Sensitivity', 'Reverse Solve', 'QA'], 'review')];
ST.acquisition = CORE; ST.development = CORE;
ST.valuation = [G('setup', 'Property', ['Home', 'Property'], 'steps', ['property', 'mix']), G('income', 'Income', ['Rent Roll', 'Revenues'], 'steps', ['inplace', 'market', 'vacancy']),
  G('expenses', 'Expenses', ['Expenses'], 'steps', ['expenses']), G('value', 'Value', ['Valuation'], 'steps', ['noi', 'caprate', 'value']), G('review', 'Report', ['Valuation Report'], 'steps', ['review'])];
ST.refinance = [G('setup', 'Property', ['Home', 'Property', 'Revenues', 'Expenses'], 'steps', ['property', 'ops']), G('value', 'Value', [], 'steps', ['value']), G('existing', 'Existing loan', [], 'steps', ['existing']),
  G('proposed', 'New loan', ['Refinancing'], 'steps', ['proposed', 'lender', 'sizing', 'costs']), G('proceeds', 'Proceeds', [], 'steps', ['proceeds', 'alts']), G('review', 'Report', ['Refinance Report'], 'steps', ['review'])];
ST.hold = [G('setup', 'Property', ['Home', 'Property'], 'steps', ['property', 'ops', 'value']), G('forward', 'Hold case', ['Market', 'Expenses', 'Debt'], 'steps', ['forward', 'capex', 'debt', 'period']),
  G('exit', 'Sale case', ['Valuation', 'Depreciation'], 'steps', ['exit', 'tax']), G('compare', 'Hold vs sell', ['Returns', 'Sensitivity'], 'steps', ['compare', 'sens']), G('review', 'Report', ['Reports'], 'steps', ['review'])];
ST.comprehensive = [G('setup', 'Setup', ['Home', 'Property'], 'steps', ['property', 'acq']), G('ops', 'Operations', ['Rent Roll', 'Market', 'Expenses'], 'steps', ['mix', 'revenue', 'vacancy', 'expenses', 'capital']),
  G('capital', 'Capital and debt', ['Investment', 'Sources & Uses', 'Debt Schedule'], 'steps', ['financing', 'su', 'debtsched', 'reserves']), G('tax', 'Tax', ['Depreciation', 'After-Tax'], 'steps', ['depr', 'aftertax']),
  G('returns', 'Partners and returns', ['Investors', 'Equity Waterfall', 'Returns'], 'steps', ['refi', 'exit', 'investors', 'waterfall', 'returns']), G('review', 'Review', ['Sensitivity', 'Reports'], 'steps', ['sens', 'review'])];
ST.portfolio = [G('setup', 'Holdings', ['Portfolio'], 'steps', ['overview', 'select', 'assets']), G('perf', 'Performance', ['Portfolio Dashboard'], 'steps', ['values', 'ops', 'capital', 'debt', 'tax']),
  G('consolidate', 'Consolidation', ['Portfolio M', 'Portfolio Rollup'], 'steps', ['consolidate', 'compare', 'risk']), G('scenarios', 'Scenarios', ['Portfolio'], 'steps', ['scenarios']), G('review', 'Report', ['Reports'], 'steps', ['review'])];
ST.business = [G('setup', 'Company', ['Business Model'], 'steps', ['company']), G('ops', 'Operations', ['Business Model'], 'steps', ['revenue', 'costs', 'ebitda', 'wc', 'capex']),
  G('value', 'Value', ['Business Valuation'], 'steps', ['fcf', 'valuation', 'financing']), G('review', 'Review', ['Business Valuation', 'Reports'], 'steps', ['sens', 'review'])];
/* the Overview tiles: the figures each analysis leads with (metric ids from src/139e) */
TILES.acquisition = ['leveredIRR', 'moic', 'yieldOnCost', 'dscr', 'loan', 'equity'];
TILES.development = ['leveredIRR', 'moic', 'yieldOnCost', 'dscr', 'loan', 'equity'];
TILES.valuation = ['marketValue', 'noiInPlace', 'capRate', 'valuePerUnit', 'valuePerSF', 'egi'];
TILES.refinance = ['netProceeds', 'newLoan', 'newLTV', 'newDSCR', 'existingPayoff', 'equityRetained'];
TILES.hold = ['holdIRR', 'netSaleNow', 'currentValue', 'forwardNOI', 'capitalRequired', 'saleTax'];
TILES.comprehensive = ['leveredIRR', 'moic', 'afterTaxIRR', 'dscr', 'loan', 'equity'];
TILES.portfolio = ['portfolioIRR', 'gav', 'portfolioDebt', 'portfolioEquity', 'portfolioNOI', 'maturityExposure'];
TILES.business = ['bizValue', 'bizRevenue', 'bizEBITDA', 'bizFCF', 'bizMultiple'];
R.stages = function(id){ return ST[id] || CORE; };
R.tiles = function(id){ return TILES[id] || TILES.acquisition; };
/* a 'steps' stage's status, from the deal: done when every listed workflow step is complete */
R.stageFromSteps = function(stage, s){ var wf = R.workflow(R.of(s).id), miss = [];
  stage.steps.forEach(function(sid){ var st = wf.filter(function(x){ return x.id === sid; })[0]; if(st){ var x = R.stepState(st, s); miss = miss.concat(x.missing); } });
  return miss.length ? { st:'warn', tip:'Missing: ' + miss.map(function(k){ var f = R.field(k); return f ? f.label : k; }).join(', ') } : { st:'done', tip:'Complete' }; };
/* the workflow's completion, step by step: the same figures the guide shows */
R.workflowState = function(s){ var a = R.of(s); return R.workflow(a.id).map(function(st){ var x = R.stepState(st, s); return { id:st.id, title:st.title, complete:x.complete, missing:x.missing, skippable:!!st.skippable }; }); };
/* readiness carries the analysis and its workflow completion. Whether results are shown is still decided by the readiness rules themselves (the engine's critical inputs); the workflow adds the analysis-specific steps on top, for the guide and the step bar. */
if(typeof window.bkDealReadiness === 'function' && !window.bkDealReadiness.__reg){ var rd0 = window.bkDealReadiness, rd = function(){ var r = rd0.apply(this, arguments); try { if(r && typeof r === 'object'){ var d = bkLoad(); r.analysis = R.of(d).id; r.workflow = R.workflowState(d); r.workflowMissing = r.workflow.reduce(function(t, x){ return t + (x.skippable ? 0 : x.missing.length); }, 0);
      /* an analysis with its own engine (not the acquisition or development engine) is ready when its own workflow is: its required fields decide, not the acquisition's */
      var an = R.analysis(r.analysis); if(an && an.live && an.ownReadiness && r.state !== 'NO DEAL'){ var miss = [], met = [];
        R.workflow(an.id).forEach(function(st){ if(st.skippable) return; (st.fields || []).forEach(function(e){ var f = R.field(e.k); if(!f || f.kind === 'derived') return; if(R.requirement(e, d) !== 'required') return; var row = { key:e.k, label:e.label || f.label, group:st.title, ok:R.present(e.k, d) }; (row.ok ? met : miss).push(row); }); });
        var seen = {}; miss = miss.filter(function(m){ if(seen[m.key]) return false; seen[m.key] = 1; return true; });
        var eng = an.ready ? an.ready(d) : true; r.missing = miss; r.met = met; r.investMissing = []; r.blockers = eng === true ? [] : [String(eng)];
        r.canCalculate = !miss.length && eng === true; r.state = !miss.length ? (eng === true ? 'ANALYSIS READY' : 'BLOCKED') : 'DRAFT'; } } } catch(e){} return r; }; rd.__reg = true; window.bkDealReadiness = rd; }
var lint0 = R.lint;
R.lint = function(){ var bad = lint0.call(R), JUDGE = ['identity', 'inputs', 'operations', 'debt', 'returns', 'review', 'steps'];
  R.analyses().forEach(function(a){ var wf = R.workflow(a.id).map(function(x){ return x.id; });
    R.stages(a.id).forEach(function(g){ if(JUDGE.indexOf(g.judge) < 0) bad.push(a.id + ': stage ' + g.id + ' has no status rule');
      g.steps.forEach(function(sid){ if(wf.indexOf(sid) < 0) bad.push(a.id + ': stage ' + g.id + ' lists unknown step ' + sid); }); });
    R.tiles(a.id).forEach(function(m){ var d = R.metric(m); if(!d) bad.push(a.id + ': unknown tile ' + m); else if(a.live && d.planned) bad.push(a.id + ': live analysis shows planned tile ' + m); }); });
  return bad; };
})();
