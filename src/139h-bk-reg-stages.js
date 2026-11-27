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
  G('expenses', 'Expenses', ['Expenses'], 'steps', ['expenses']), G('value', 'Value', ['Property Valuation'], 'steps', ['noi', 'caprate', 'value']), G('review', 'Report', ['Property Valuation Report'], 'steps', ['review'])];
ST.refinance = [G('setup', 'Property', ['Home', 'Property', 'Revenues', 'Expenses'], 'steps', ['property', 'ops']), G('value', 'Value', [], 'steps', ['value']), G('existing', 'Existing loan', [], 'steps', ['existing']),
  G('proposed', 'New loan', ['Refinancing'], 'steps', ['proposed', 'lender', 'sizing', 'costs']), G('proceeds', 'Proceeds', [], 'steps', ['proceeds', 'alts']), G('review', 'Report', ['Refinance Report'], 'steps', ['review'])];
ST.hold = [G('setup', 'Property', ['Home', 'Property', 'Revenues', 'Expenses'], 'steps', ['property', 'ops', 'value']), G('forward', 'Hold case', ['Market'], 'steps', ['forward', 'capex', 'debt', 'period']),
  G('exit', 'Sale case', [], 'steps', ['exit', 'tax']), G('compare', 'Hold vs sell', ['Hold vs Sell'], 'steps', ['compare', 'sens']), G('review', 'Report', ['Hold vs Sell Report'], 'steps', ['review'])];
ST.comprehensive = [G('setup', 'Setup', ['Home', 'Property'], 'steps', ['property', 'acq']), G('ops', 'Operations', ['Rent Roll', 'Market', 'Expenses'], 'steps', ['mix', 'revenue', 'vacancy', 'expenses', 'capital']),
  G('capital', 'Capital and debt', ['Investment', 'Sources & Uses', 'Debt Schedule'], 'steps', ['financing', 'su', 'debtsched', 'reserves']), G('tax', 'Tax', ['Depreciation', 'After-Tax'], 'steps', ['depr', 'aftertax']),
  G('returns', 'Partners and returns', ['Investors', 'Equity Waterfall', 'Returns'], 'steps', ['refi', 'exit', 'investors', 'waterfall', 'returns']), G('review', 'Review', ['Sensitivity', 'Reports'], 'steps', ['sens', 'review'])];
ST.portfolio = [G('setup', 'Holdings', ['Home', 'Portfolio'], 'steps', ['overview', 'select', 'assets']), G('perf', 'Analysis', ['Portfolio Analysis', 'Portfolio Dashboard'], 'steps', ['values', 'ops', 'capital', 'debt', 'tax', 'compare', 'risk']), G('consolidate', 'Consolidation', ['Portfolio M', 'Portfolio Rollup'], 'steps', ['consolidate', 'scenarios']), G('review', 'Report', ['Portfolio Report'], 'steps', ['review'])];
ST.business = [G('setup', 'Company', ['Business Model'], 'steps', ['company']), G('ops', 'Operations', ['Business Model'], 'steps', ['revenue', 'costs', 'ebitda', 'wc', 'capex']),
  G('value', 'Value', ['Business Valuation'], 'steps', ['fcf', 'valuation', 'financing']), G('review', 'Report', ['Business Report'], 'steps', ['sens', 'review'])];
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
  if(miss.length) return { st:'warn', tip:'Missing: ' + miss.map(function(k){ var f = R.field(k); return f ? f.label : k; }).join(', ') };
  /* nothing required is missing, but an expected input is blank: not 'done' (a blank expense counts as zero, so the figures may be overstated) */
  var xm = []; stage.steps.forEach(function(sid){ var st = wf.filter(function(x){ return x.id === sid; })[0]; if(st) xm = xm.concat(R.stepState(st, s).expectedMissing || []); });
  return xm.length ? { st:'warn', tip:'Expected, not entered (results may be overstated): ' + xm.map(function(k){ var f = R.field(k); return f ? String(f.label).replace(/,.*$/, '') : k; }).join(', ') } : { st:'done', tip:'Complete' }; };
/* the workflow's completion, step by step: the same figures the guide shows */
R.workflowState = function(s){ var a = R.of(s); return R.workflow(a.id).map(function(st){ var x = R.stepState(st, s); return { id:st.id, title:st.title, complete:x.complete, missing:x.missing, skippable:!!st.skippable }; }); };
/* readiness carries the analysis and its workflow completion. Whether results are shown is still decided by the readiness rules themselves (the engine's critical inputs); the workflow adds the analysis-specific steps on top, for the guide and the step bar. */
if(typeof window.bkDealReadiness === 'function' && !window.bkDealReadiness.__reg){ var rd0 = window.bkDealReadiness, rd = function(){ var r = rd0.apply(this, arguments); try { if(r && typeof r === 'object'){ var d = bkLoad(); r.analysis = R.of(d).id; r.workflow = R.workflowState(d); r.workflowMissing = r.workflow.reduce(function(t, x){ return t + (x.skippable ? 0 : x.missing.length); }, 0); r.expectedMissing = R.expectedMissing(d);   /* expected, not required: never changes the state or canCalculate */
      /* an analysis with its own engine (not the acquisition or development engine) is ready when its own workflow is: its required fields decide, not the acquisition's */
      var an = R.analysis(r.analysis); if(an && an.live && an.ownReadiness && r.state !== 'NO DEAL'){ var miss = [], met = [];
        R.workflow(an.id).forEach(function(st){ if(st.skippable) return; (st.fields || []).forEach(function(e){ var f = R.field(e.k); if(!f || f.kind === 'derived') return; if(R.requirement(e, d) !== 'required') return; var row = { key:e.k, label:e.label || f.label, group:st.title, ok:R.present(e.k, d) }; (row.ok ? met : miss).push(row); }); });
        var seen = {}; miss = miss.filter(function(m){ if(seen[m.key]) return false; seen[m.key] = 1; return true; });
        var eng = an.ready ? an.ready(d) : true; r.missing = miss; r.met = met; r.investMissing = []; r.blockers = eng === true ? [] : [String(eng)];
        r.canCalculate = !miss.length && eng === true; r.state = !miss.length ? (eng === true ? 'ANALYSIS READY' : 'BLOCKED') : 'DRAFT'; } } } catch(e){} return r; }; rd.__reg = true; window.bkDealReadiness = rd; }
/* EXPECTED inputs still blank, most material first. The order is fixed and deterministic (taxes move NOI most, then vacancy, insurance, repairs, management, the loan-to-value, closing costs);
   the effect is stated as it is: a blank line is counted as zero, never silently assumed, and the results below it may be overstated. */
var EXPECTED_ORDER = ['taxes', 'vacancy', 'insurance', 'rm', 'mgmtPct', 'acqLTV', 'conLTC', 'closingCostsPct', 'taxRate', 'capGainsRate', 'depRecaptureRate'];
var AFTER_TAX = { taxRate:1, capGainsRate:1, depRecaptureRate:1 };   /* these affect the after-tax figures only, never NOI or the pre-tax returns */
var EXPECTED_EFFECT = { taxes:'counted as $0, so NOI and returns are overstated', insurance:'counted as $0, so NOI and returns are overstated', rm:'counted as $0, so NOI and returns are overstated', mgmtPct:'counted as 0%, so NOI and returns are overstated',
  vacancy:'counted as 0% (a full building), so income and returns are overstated', acqLTV:'no loan-to-value limit entered, so the loan size and the returns rest on the model\'s fallback', conLTC:'no loan-to-cost limit entered, so the construction loan and the returns rest on the model\'s fallback',
  closingCostsPct:'counted as 0%, so the cash needed at closing is understated',
  taxRate:'the model\'s default (37%) is used and has not been confirmed, so the after-tax figures are provisional', depRecaptureRate:'the model\'s default (25%) is used and has not been confirmed, so the tax at the sale is provisional', capGainsRate:'the model\'s default (20%) is used and has not been confirmed, so the tax at the sale is provisional' };
/* all:true includes the after-tax rates (provisional, not a distortion of NOI); the default list is the inputs whose blank overstates NOI and the pre-tax returns */
R.expectedMissing = function(s, all){ s = s || (typeof bkLoad === 'function' ? bkLoad() : {}); if(!R.governed(s)) return [];
  var seen = {}, out = []; R.workflow(R.of(s).id).forEach(function(st){ if(typeof st.when === 'function' && !st.when(s)) return; (st.fields || []).forEach(function(e){ if(seen[e.k]) return; var f = R.field(e.k); if(!f || f.kind === 'derived') return;
    if(R.requirement(e, s) !== 'expected' || R.present(e.k, s)) return; seen[e.k] = 1; out.push({ key:e.k, label:e.label || f.label, effect:EXPECTED_EFFECT[e.k] || 'left blank: the results use the model\'s fallback, not a figure you chose', rank:EXPECTED_ORDER.indexOf(e.k) < 0 ? 99 : EXPECTED_ORDER.indexOf(e.k), sheet:st.sheet, scope:AFTER_TAX[e.k] ? 'aftertax' : 'noi' }); }); });
  if(!all) out = out.filter(function(x){ return x.scope !== 'aftertax'; });
  return out.sort(function(a, b){ return a.rank - b.rank; }); };
var lint0 = R.lint;
R.lint = function(){ var bad = lint0.call(R), JUDGE = ['identity', 'inputs', 'operations', 'debt', 'returns', 'review', 'steps'];
  R.analyses().forEach(function(a){ var wf = R.workflow(a.id).map(function(x){ return x.id; });
    R.stages(a.id).forEach(function(g){ if(JUDGE.indexOf(g.judge) < 0) bad.push(a.id + ': stage ' + g.id + ' has no status rule');
      g.steps.forEach(function(sid){ if(wf.indexOf(sid) < 0) bad.push(a.id + ': stage ' + g.id + ' lists unknown step ' + sid); }); });
    R.tiles(a.id).forEach(function(m){ var d = R.metric(m); if(!d) bad.push(a.id + ': unknown tile ' + m); else if(a.live && d.planned) bad.push(a.id + ': live analysis shows planned tile ' + m); }); });
  return bad; };
})();
