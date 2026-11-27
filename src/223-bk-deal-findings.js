/* DEAL FINDINGS (Guide 2.0, phase 2a). A deterministic review of the deal as it is entered: what is known, what is missing, what is inconsistent, which assumptions matter, and what deserves attention first.
   It reads the model and adds nothing to it: the requirement classes (the registry and bkModelNeeds, src/081 and src/139a), the Model Checks (bkConflicts, src/129), the Inputs index rows (src/221)
   and the engine itself (bkRunWith re-runs the deal on a copy). It writes nothing to the deal, calls no AI and keeps no requirement or financial rule of its own. Every finding names the rule that made it.

   How findings are ranked (the same on every deal, shown on the page, never hidden):
     tier 0  a required input is missing (the model withholds results)       tier 3  an expected input is not entered (results show, and may be overstated)
     tier 1  a Model Check is an ERROR                                       tier 4  a Model Check is a WARNING
     tier 2  an input is needed before the deal is investment-ready          tier 5  an entered assumption the returns are sensitive to (measured), tier 6 a note
   Within a tier, debt and tax findings come first (they change financing, cash flow and the after-tax return most), then the larger measured effect, then a fixed order.

   Measured effects are engine runs, not estimates: each assumption is moved by the fixed step stated on the page (STEPS below; a convention, never a change to the deal) and the deal re-run on a copy; the
   effect is the change in levered IRR (net operating income when there is no IRR yet). An expected input that is blank is measured against the guide's own suggestion for it (BKReg field sug), where there is one. */
(function(){
'use strict';
if(typeof bkLoad !== 'function' || !window.BKReg || typeof bkRunWith !== 'function') return;
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
function pct(v, d){ return (v * 100).toFixed(d == null ? 2 : d) + '%'; }

/* the fixed steps (a convention shown on the page): rel = a share of the entered figure, abs = added to it */
var STEPS = {
  acq:[['exitCap', 'abs', 0.005, 'Exit cap rate', '50 bps'], ['rentGrowth', 'abs', 0.01, 'Rent growth', '1 point'], ['opexGrowth', 'abs', 0.01, 'Expense growth', '1 point'], ['vacancy', 'abs', 0.02, 'Vacancy', '2 points'],
       ['avgRent', 'rel', 0.05, 'Average rent', '5%'], ['purchasePrice', 'rel', 0.05, 'Purchase price', '5%'], ['taxes', 'rel', 0.10, 'Real estate taxes', '10%'], ['insurance', 'rel', 0.10, 'Insurance', '10%'],
       ['rm', 'rel', 0.10, 'Repairs and maintenance', '10%'], ['mgmtPct', 'abs', 0.01, 'Management fee', '1 point'], ['holdYears', 'abs', 1, 'Hold period', '1 year'], ['saleCostPct', 'abs', 0.01, 'Cost of sale', '1 point'],
       ['acqRate', 'abs', 0.01, 'Interest rate', '100 bps', 'debt'], ['acqLTV', 'abs', 0.05, 'Loan-to-value', '5 points', 'debt']],
  dev:[['exitCap', 'abs', 0.005, 'Exit cap rate', '50 bps'], ['sourceConstruction', 'rel', 0.10, 'Construction cost', '10%'], ['constructionMonths', 'abs', 3, 'Construction period', '3 months'], ['avgRent', 'rel', 0.05, 'Average rent', '5%'],
       ['vacancy', 'abs', 0.02, 'Vacancy', '2 points'], ['rentGrowth', 'abs', 0.01, 'Rent growth', '1 point'], ['holdYears', 'abs', 1, 'Hold period', '1 year'], ['conRate', 'abs', 0.01, 'Construction loan rate', '100 bps', 'debt'], ['conLTC', 'abs', 0.05, 'Loan-to-cost', '5 points', 'debt']]
};
window.BK_FINDING_STEPS = STEPS;
var TIER = ['blocks results', 'a Model Check is failing', 'needed before the deal is investment-ready', 'expected input not entered', 'a Model Check warns', 'assumption the returns are sensitive to', 'note'];
var EXPECTED_ORDER = ['taxes', 'vacancy', 'insurance', 'rm', 'mgmtPct', 'acqLTV', 'conLTC', 'closingCostsPct'];
function isDev(s){ return /develop/i.test(String((s || {}).dealType || '')); }
function groupOfArea(a){ var t = String(a || ''); return /debt|loan|financ|refin|covenant/i.test(t) ? 'Debt' : /tax|deprec|macrs|cost seg/i.test(t) ? 'Tax' : t; }

/* one engine run on a copy of the deal: the figures the effects are measured in */
function run(over){ return safe(function(){ return bkRunWith(over || {}, function(){ var m = bkMonthlyReturns(), c = bkCalc(), d = bkDebt(); return { irr: m.irr, noi: c.noi, dscr: d && d.dscr, moic: m.moic }; }); }, null); }
function metric(base, x){ if(!base || !x) return null; if(isFinite(base.irr) && isFinite(x.irr)) return { v:x.irr - base.irr, kind:'irr', from:base.irr, to:x.irr }; if(isFinite(base.noi) && isFinite(x.noi) && base.noi) return { v:(x.noi - base.noi) / Math.abs(base.noi), kind:'noi', from:base.noi, to:x.noi }; return null; }
function show(m){ return m ? (m.kind === 'irr' ? 'levered IRR ' + pct(m.from) + ' to ' + pct(m.to) : 'NOI ' + (m.v >= 0 ? '+' : '') + (m.v * 100).toFixed(1) + '%') : ''; }

/* the assumptions the deal is sensitive to, measured (entered assumptions only; sorted by the size of the effect) */
window.bkMeasureAssumptions = function(s){ s = s || bkLoad(); var base = run({}); if(!base) return { base:null, rows:[] }; var list = isDev(s) ? STEPS.dev : STEPS.acq, out = [];
  list.forEach(function(st){ var k = st[0], kind = st[1], step = st[2], val = num(s[k]); if(!window.BKReg.present(k, s) || (st[5] === 'debt' && s.debtEnabled === false)) return;
    var up = kind === 'rel' ? val * (1 + step) : val + step, dn = kind === 'rel' ? val * (1 - step) : val - step; if(dn < 0) dn = 0;
    var a = metric(base, run(Object.assign({}, { [k]: up }))), b = metric(base, run(Object.assign({}, { [k]: dn })));
    var effect = Math.max(Math.abs(a ? a.v : 0), Math.abs(b ? b.v : 0)); if(!(effect > 0)) return;
    var worst = (a && b) ? (a.v < b.v ? { m:a, dir:'higher' } : { m:b, dir:'lower' }) : a ? { m:a, dir:'higher' } : { m:b, dir:'lower' };
    out.push({ k:k, label:st[3], step:st[4], effect:effect, kind:(a || b).kind, worst:worst.m, worstDir:worst.dir, debt:st[5] === 'debt' }); });
  out.sort(function(x, y){ return y.effect - x.effect; }); return { base:base, rows:out }; };

/* what an expected input that is blank costs, measured against the guide's own suggestion for it (null when there is none) */
function blankEffect(k, s, base){ var f = window.BKReg.field(k), sg = f && typeof f.sug === 'function' ? safe(function(){ return f.sug(s); }, null) : null; if(!sg || sg.v == null || !base) return null;
  var m = metric(base, run({ [k]: sg.v })); return m ? { m:m, sug:sg.v, why:sg.why || '' } : null; }

var CACHE = { key:'', out:null };
/* the findings. measure:false skips the engine runs (the quick, synchronous part); measure:true adds the measured effects and the assumption table */
window.bkDealFindings = function(s, o){ s = s || bkLoad(); o = o || {}; var key = JSON.stringify(s) + '|' + (o.measure ? 1 : 0); if(CACHE.key === key && CACHE.out) return CACHE.out;
  var ix = safe(function(){ return window.bkInputsIndex(); }, { rows:[], analysis:{} }), rd = safe(function(){ return window.bkDealReadiness(); }, null), F = [], rows = ix.rows || [];
  var can = rd && rd.canCalculate !== false && rd.state !== 'NO DEAL', base = can && o.measure ? run({}) : null;
  function add(f){ f.rule = f.rule || ''; F.push(f); }
  rows.forEach(function(r){
    var g = r.group, lab = r.label;
    if(r.status === 'missing') add({ kind:'missing', tier:0, group:g, field:r.k, title:lab + ' is not entered', detail:'The model withholds results until it is in.', rule:'bkModelNeeds: required' });
    else if(r.status === 'needed') add({ kind:'missing', tier:2, group:g, field:r.k, title:lab + ' is needed for the deal to be investment-ready', detail:'Results show without it, but the deal is not investment-ready.', rule:'bkModelNeeds: investment' });
    else if(r.status === 'expected'){ var eff = o.measure ? blankEffect(r.k, s, base) : null, ex = window.BKReg.expectedMissing ? (window.BKReg.expectedMissing(s, true).filter(function(x){ return x.key === r.k; })[0] || {}) : {};
      add({ kind:'missing', tier:3, group:g, field:r.k, title:String(lab).replace(/,.*$/, '') + ' is not entered', detail:ex.effect ? ex.effect.charAt(0).toUpperCase() + ex.effect.slice(1) + '.' : 'Counted as zero or left to the model\'s fallback.', measured:eff, impact:eff ? Math.abs(eff.m.v) : null,
        impactText:eff ? 'with the guide\'s suggestion (' + (eff.sug < 1 ? pct(eff.sug) : '$' + Math.round(eff.sug).toLocaleString('en-US')) + '): ' + show(eff.m) : 'no benchmark to measure it against', rule:'BKReg.requirement: expected' }); }
    else if(r.status === 'incomplete') add({ kind:'missing', tier:3, group:g, field:r.k, title:lab + ' is incomplete', detail:r.note || '', rule:'Inputs index: incomplete' });
  });
  var cfl = safe(function(){ return window.bkConflicts(); }, []) || [];
  cfl.forEach(function(c){ var tier = c.acknowledged ? 6 : c.level === 'ERROR' ? 1 : c.level === 'WARN' ? 4 : 6; add({ kind:'inconsistent', tier:tier, group:groupOfArea(c.area), sheet:c.sheet, fieldsOf:c.fields || null, title:(c.acknowledged ? 'Acknowledged: ' : '') + c.message, detail:c.why || '', rule:'Model Checks: ' + c.id, level:c.level }); });
  /* ONE UNDERLYING ISSUE, ONE FINDING. A Model Check that names the input it is about (its rule's `fields`) and an input finding for the same input are one issue seen twice (a blank or zero management fee is
     "not entered" and "the fee is zero"). The input finding is the primary one (it has the action and the measured effect); the check is folded into it as a related note, and the more severe tier of the two applies. */
  F = F.filter(function(f){ if(f.kind !== 'inconsistent' || !f.fieldsOf || !f.fieldsOf.length) return true;
    var p = F.filter(function(x){ return x.kind === 'missing' && f.fieldsOf.indexOf(x.field) > -1; })[0]; if(!p) return true;
    p.related = (p.related || []).concat([{ rule:f.rule, title:f.title, detail:f.detail }]); p.tier = Math.min(p.tier, f.tier); p.rule += ' + ' + f.rule; p.detail = (p.detail ? p.detail + ' ' : '') + (f.detail || ''); return false; });
  var meas = null; if(o.measure && can){ meas = window.bkMeasureAssumptions(s); meas.rows.forEach(function(m, i){ if(i >= 8) return;
    add({ kind:'consequential', tier:5, group:m.debt ? 'Debt' : (ix.rows.filter(function(r){ return r.k === m.k; })[0] || {}).group || 'Returns', field:m.k, title:m.label + ' matters: ' + m.step + ' ' + m.worstDir + ' moves ' + show(m.worst), detail:'Measured by re-running the deal with ' + m.label.toLowerCase() + ' ' + m.step + ' higher and lower; this is the worse side.', impact:m.effect, rule:'engine re-run (bkRunWith)' }); }); }
  var pri = function(f){ return f.group === 'Debt' || f.group === 'Tax' ? 0 : 1; };
  F.forEach(function(f, i){ f.id = f.kind + ':' + (f.field || f.rule) + ':' + i; });
  F.sort(function(a, b){ if(a.tier !== b.tier) return a.tier - b.tier; if(pri(a) !== pri(b)) return pri(a) - pri(b); var ia = a.impact == null ? -1 : a.impact, ib = b.impact == null ? -1 : b.impact; if(ia !== ib) return ib - ia;
    var oa = EXPECTED_ORDER.indexOf(a.field), ob = EXPECTED_ORDER.indexOf(b.field); oa = oa < 0 ? 99 : oa; ob = ob < 0 ? 99 : ob; if(oa !== ob) return oa - ob; return String(a.title).localeCompare(String(b.title)); });
  F.forEach(function(f){ f.why = 'Ranked here because ' + TIER[f.tier] + (pri(f) === 0 ? ' (debt and tax come first within a tier)' : '') + (f.impact != null ? '; measured effect ' + (f.impact * 100).toFixed(1) + (f.measured && f.measured.m.kind === 'noi' ? '% of NOI' : ' IRR points') : '') + '.'; });
  var KEYS = ['purchasePrice', 'units', 'avgRent', 'holdYears', 'exitCap', 'acqLTV', 'acqRate'], known = rows.filter(function(r){ return r.present && KEYS.indexOf(r.k) > -1; }).sort(function(a, b){ return KEYS.indexOf(a.k) - KEYS.indexOf(b.k); })
    .map(function(r){ return { label:String(r.label).replace(/,.*$/, ''), value:r.value }; });
  var byGroup = {}; rows.forEach(function(r){ var g = byGroup[r.group] = byGroup[r.group] || { group:r.group, entered:0, total:0 }; if(r.status !== 'na'){ g.total++; if(r.present) g.entered++; } });
  var out = { analysis:(ix.analysis && (ix.analysis.name || ix.analysis.id)) || '', state:rd ? rd.state : '', can:!!can, findings:F, attention:F.filter(function(f){ return f.tier <= 5; }).slice(0, 5), known:known, groups:Object.keys(byGroup).map(function(g){ return byGroup[g]; }), measured:meas, measuredRun:!!o.measure };
  CACHE.key = key; CACHE.out = out; return out; };

/* the review as the guide shows it. The quick part paints at once; the measured part (engine re-runs) fills in a moment later. */
function openBtn(f){ return f.field ? '<button type="button" class="bk-btn bk-rv-open" onclick="bkGuideField(\'' + esc(f.field) + '\')">Open</button>' : f.sheet && typeof RENDERERS !== 'undefined' && RENDERERS[f.sheet] ? '<button type="button" class="bk-btn bk-rv-open" onclick="bkGuideDetail(\'' + esc(f.sheet) + '\')">Open</button>' : ''; }
function item(f){ return '<div class="bk-rv-i bk-rv-t' + f.tier + '"><div><b>' + esc(f.title) + '</b><small>' + esc(f.detail || '') + (f.impactText ? ' ' + esc(f.impactText.charAt(0).toUpperCase() + f.impactText.slice(1)) + '.' : '') + '</small><small class="bk-rv-why">' + esc(f.why) + '</small></div>' + openBtn(f) + '</div>'; }
window.bkReviewHtml = function(s){ s = s || bkLoad(); var q = window.bkDealFindings(s, { measure:false }); if(!q.findings.length && !q.known.length) return '';
  var by = function(k){ return q.findings.filter(function(f){ return f.kind === k; }); };
  var h = '<div class="bk-rv" id="bk-rv"><div class="bk-rv-h">Review of the deal</div>';
  h += '<div class="bk-rv-sec"><b>What deserves attention first</b><div id="bk-rv-att">' + (q.attention.length ? q.attention.map(item).join('') : '<small>Nothing is missing and no Model Check is failing.</small>') + '</div></div>';
  h += (typeof window.bkLensHtml === 'function' ? window.bkLensHtml(s) : '');   /* the debt and tax lenses (src/225) come right after what deserves attention first */
  h += '<div class="bk-rv-sec"><b>What is known</b><div class="bk-rv-known">' + (q.known.length ? q.known.map(function(k){ return '<span><em>' + esc(k.label) + '</em> ' + esc(k.value) + '</span>'; }).join('') : '<small>Nothing entered yet.</small>') + '</div><div class="bk-rv-groups">' + q.groups.filter(function(g){ return g.total; }).map(function(g){ return '<span>' + esc(g.group) + ' ' + g.entered + ' of ' + g.total + '</span>'; }).join('') + '</div></div>';
  var miss = by('missing'); h += '<div class="bk-rv-sec"><b>What is missing</b>' + (miss.length ? miss.map(item).join('') : '<small>Every required and expected input is entered.</small>') + '</div>';
  var inc = by('inconsistent'); h += '<div class="bk-rv-sec"><b>What is inconsistent</b>' + (inc.length ? inc.map(item).join('') : '<small>No Model Check is flagging this deal.</small>') + '</div>';
  h += '<div class="bk-rv-sec"><b>Assumptions that matter most</b><div id="bk-rv-meas"><small>' + (q.can ? 'Measuring: re-running the deal with each assumption moved by a fixed step.' : 'Shown once the model can calculate this deal: it is withholding results until the required inputs are in.') + '</small></div></div></div>';
  if(q.can) setTimeout(function(){ paintMeasured(); }, 60);
  return h; };
function paintMeasured(){ var el = document.getElementById('bk-rv-meas'); if(!el) return; var s = bkLoad(), q = window.bkDealFindings(s, { measure:true }), m = q.measured;
  var att = document.getElementById('bk-rv-att'); if(att && q.attention.length) att.innerHTML = q.attention.map(item).join('');
  if(!m || !m.rows.length){ el.innerHTML = '<small>No entered assumption moves the result.</small>'; return; }
  el.innerHTML = '<table class="fin bk-rv-t"><thead><tr><th class="rowlabel-h">Assumption</th><th>Moved by</th><th>Worse side</th><th></th></tr></thead><tbody>' + m.rows.slice(0, 8).map(function(r){ return '<tr><td class="rowlabel" data-bk-align="text">' + esc(r.label) + '</td><td data-bk-align="text">' + esc(r.step) + '</td><td data-bk-align="text">' + esc(r.worstDir + ': ' + show(r.worst)) + '</td><td data-bk-align="text"><button type="button" class="bk-btn" onclick="bkGuideField(\'' + esc(r.k) + '\')">Open</button></td></tr>'; }).join('') + '</tbody></table>'
    + '<small class="bk-rv-why">Each assumption is moved by the fixed step shown, one at a time, and the deal is re-run on a copy. Nothing is changed in the deal.</small>'; }
window.bkReviewPaint = paintMeasured;
})();
