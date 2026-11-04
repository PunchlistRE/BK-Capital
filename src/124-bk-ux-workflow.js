
/* ===========================================================================
   UX / WORKFLOW LAYER
   ---------------------------------------------------------------------------
   1. Workflow stepper (Setup > Inputs > Operations > Debt > Returns > Review)
      with live completion status, previous/next step buttons, and an
      "Advanced" area for Monthly Engine, Portfolio Database and - on
      acquisitions - Development.
   2. Deal snapshot card replaces the photo placeholder; the color key is a
      pop-up instead of a card on every page.
   3. Deal Underwrite: sticky section index and required-input highlights.
   4. Base / Upside / Downside case switcher (writes the deal's existing
      scenarioCase field - the same control as on Deal Underwrite).
   5. Developer / change-log notes collected into a "Model notes" drawer.
   6. Save status, fields changed this session, undo / redo.
   7. Returns headline KPI tiles.
   Display and navigation only: no engine function is changed, and every
   figure shown is read from the canonical engine.
   =========================================================================== */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof GROUPS === 'undefined') return;

var UI_KEY = 'bkcapital.ui.prefs.v01';
function uiPrefs(){ try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch(e){ return {}; } }
function setUiPref(k, v){ var p = uiPrefs(); p[k] = v; try { localStorage.setItem(UI_KEY, JSON.stringify(p)); } catch(e){} }
function esc(v){ return (typeof bkEsc === 'function') ? bkEsc(v) : String(v == null ? '' : v); }
function pct(v){ return isFinite(v) ? (v*100).toFixed(2) + '%' : '—'; }
function mult(v){ return isFinite(v) ? v.toFixed(2) + 'x' : '—'; }
function money(v){ if(!isFinite(v)) return '—'; var a = Math.abs(v); var s = a >= 1e6 ? '$' + (a/1e6).toFixed(2) + 'M' : '$' + Math.round(a).toLocaleString('en-US'); return v < 0 ? '(' + s + ')' : s; }
function hasDeal(){ try { return typeof window.bkProductionCounts === 'function' ? !!window.bkProductionCounts().activeDeal : true; } catch(e){ return false; } }
function cur(){ try { return currentSheet; } catch(e){ return null; } }
function rerender(){ var c = cur(); if(c) showSheet(c); }
function readiness(){ try { return window.bkDealReadiness ? window.bkDealReadiness() : null; } catch(e){ return null; } }
function isDev(s){ return /develop|redevelop/i.test(String((s || {}).dealType || '')); }

/* Run fn against the SELECTED case (scratch state, never saved), as the seven scenario pages do. */
window.bkInCase = function(fn){ return inCase(fn); };
function inCase(fn){
  var base = bkLoad(), c = String(base.scenarioCase || 'Base');
  if(c === 'Base' || typeof window.bkScenarioOverrides !== 'function') return fn(base, c);
  var scratch = Object.assign({}, base, window.bkScenarioOverrides(base, c)), oL = window.bkLoad, oS = window.bkSave;
  window.bkLoad = function(){ return scratch; }; window.bkSave = function(d){ Object.assign(scratch, d); return d; };
  try { return fn(scratch, c); } finally { window.bkLoad = oL; window.bkSave = oS; }
}
window.bkHeadline = function(){ return headline(); };
function headline(){
  return inCase(function(s, c){
    var x = bkMonthlyReturns(), d = bkDebt(), w = null, calc = bkCalc();
    try { w = bkWaterfallV07(); } catch(e){}
    var basis = Number(d.basis) || 0, dv = null;
    /* a development deal is financed by the construction facility, not the acquisition loan bkDebt() sizes: loan, equity, coverage and yield come from the development funding engine */
    if(isDev(s)){ try { var t = bkDevTakeoutV11(), ds = t.conHeldToSale ? Number(t.conHeldBalance || 0) * Math.max(0, Number(s.conRate || 0)) : Number(t.permPmt || 0) * 12, bal = t.conHeldToSale ? Number(t.conHeldBalance || 0) : Number(t.permLoan || 0), stabNOI = Number(t.stabPointNOI || t.noi || 0);
      dv = { loan:Number(t.commit || 0), binding:'construction facility', equity:Number(t.equityTotal || 0), dscr:ds > 0 ? stabNOI / ds : NaN, yoc:Number(t.unlev) ? stabNOI / Number(t.unlev) : NaN, debtAtSale:bal, cost:Number(t.unlev || 0) }; } catch(e){ dv = null; } }
    return { c:c, s:s, levIRR:x.irr, levMOIC:x.moic, unlevIRR:x.u ? x.u.irr : NaN, unlevMOIC:x.u ? x.u.moic : NaN,
      lpIRR:w ? w.lpIRR : NaN, gpIRR:w ? w.gpIRR : NaN, lpMOIC:w ? w.lp.moic : NaN, gpMOIC:w ? w.gp.moic : NaN,
      loan:dv ? dv.loan : d.loan, binding:dv ? dv.binding : d.binding, equity:dv ? dv.equity : d.equity, dscr:dv ? dv.dscr : d.dscr, yoc:dv ? dv.yoc : (basis ? calc.noi/basis : NaN),
      profit:(x.dist||0) - (x.contrib||0), peak:(dv ? dv.equity : Number(d.equity)) + Number(s.rateCapCost || 0), noi:calc.noi };
  });
}

/* ---------------------------------------------------------------- 1. workflow */
/* the step bar's stages come from the analysis registry (src/139h): the deal's analysis decides them. STEPS0 is the fallback with no registry. */
var STEPS0 = [
  { id:'setup', label:'Setup',      sheets:['Home'] },
  { id:'inputs', label:'Inputs',    sheets:['Deal Underwrite','Rent Roll','Import','Depreciation','Source Data'] },
  { id:'ops', label:'Operations',   sheets:['Operating Underwrite','Property CF'] },
  { id:'debt', label:'Debt',        sheets:['Debt','Debt Schedule','Covenant Monitor'] },
  { id:'returns', label:'Returns',  sheets:['Returns','Equity Waterfall','After-Tax'] },
  { id:'review', label:'Review',    sheets:['Sensitivity','Reverse Solve','QA'] }
];
function stagesNow(){ var R = window.BKReg; try { if(R && typeof R.stages === 'function'){ var d = hasDeal() ? bkLoad() : {}; return R.stages(R.of(d).id); } } catch(e){} return STEPS0.map(function(x){ return Object.assign({ judge:{ setup:'identity', inputs:'inputs', ops:'operations', debt:'debt', returns:'returns', review:'review' }[x.id] }, x); }); }
function stepOf(sheet){ var S = stagesNow(); for(var i = 0; i < S.length; i++) if(S[i].sheets.indexOf(sheet) > -1) return i; return -1; }
/* each stage's status, by its rule: the six rules below (as they have always been), or 'steps' (the registry's workflow steps are complete) */
function stepStatus(){
  var S = stagesNow(), J = judges(), out = {}, R = window.BKReg, d = hasDeal() ? bkLoad() : null;
  S.forEach(function(g){ out[g.id] = g.judge === 'steps' ? (J.none ? J.none : (R ? R.stageFromSteps(g, d) : { st:'', tip:'' })) : (J[g.judge] || { st:'', tip:'' }); });
  return out;
}
function judges(){
  var r = readiness(), out = {};
  if(!r || r.state === 'NO DEAL'){ return { none:{ st:'', tip:'No deal loaded' } }; }
  var s = bkLoad();
  var idMiss = r.missing.filter(function(m){ return m.group === 'Identity'; });
  out.identity = idMiss.length ? { st:'warn', tip:'Missing: ' + idMiss.map(function(m){ return m.label; }).join(', ') } : { st:'done', tip:'Deal identity complete' };
  out.inputs = r.missing.length ? { st:'warn', tip:r.missing.length + ' required input' + (r.missing.length > 1 ? 's' : '') + ' missing' } : { st:'done', tip:'All required inputs entered' };
  var noi = NaN; try { noi = bkCalc().noi; } catch(e){}
  out.operations = (r.canCalculate && isFinite(noi)) ? (noi > 0 ? { st:'done', tip:'Year-1 NOI ' + money(noi) } : { st:'warn', tip:'Year-1 NOI is not positive' }) : { st:'', tip:'Needs complete inputs' };
  var debtMiss = r.investMissing.some(function(m){ return m.key === 'debt'; });
  var gate = null, pol = {}, ctls = [];
  if(r.canCalculate){
    if(!isDev(s)){ try { gate = window.bkDealGatePeek ? window.bkDealGatePeek() : null; } catch(e){}
      if(!gate && window.bkDealGate && !judges.__pending){ judges.__pending = true; setTimeout(function(){ judges.__pending = false; try { window.bkDealGate(); } catch(e){} patchSteps(); }, 60); } }
    try { pol = window.bkPolicy ? window.bkPolicy() : {}; } catch(e){} try { ctls = window.bkModelControls ? window.bkModelControls() : []; } catch(e){} }
  var over = gate && gate.capacity && gate.capacity.overage > 0 ? gate.capacity.overage : 0;
  out.debt = !r.canCalculate ? { st:'', tip:'Needs complete inputs' } : debtMiss ? { st:'warn', tip:'Debt rate / amortization missing' } : over ? { st:'warn', tip:'Loan is ' + money(over) + ' above what policy supports' } : { st:'done', tip:s.debtEnabled === false ? 'Unlevered (debt off)' : 'Loan sized, within policy' };
  var irr = NaN; if(r.canCalculate){ try { irr = bkMonthlyReturns().irr; } catch(e){} }
  var hur = Number(pol.targetIRR) || 0;
  out.returns = !r.canCalculate ? { st:'', tip:'Results withheld until inputs are complete' } : !isFinite(irr) ? { st:'warn', tip:'Levered IRR not finite' } : (hur && irr < hur) ? { st:'warn', tip:'Levered IRR ' + pct(irr) + ' is below the ' + pct(hur) + ' hurdle' } : { st:'done', tip:'Levered IRR ' + pct(irr) };
  var nFail = ctls.filter(function(c){ return c.level === 'FAIL'; }).length;
  out.review = nFail ? { st:'fail', tip:nFail + ' model error' + (nFail > 1 ? 's' : '') + ' to fix' }
             : (gate && /^(DECLINE|HOLD)$/.test(gate.verdict)) ? { st:'fail', tip:'Credit gate: ' + String(gate.status || 'decline') }
             : r.state === 'INVESTMENT READY' && !r.sourceReview ? { st:'done', tip:'Investment ready' }
             : r.state === 'NOT DECISION-GRADE' || r.sourceReview || r.state === 'BLOCKED' ? { st:'warn', tip:r.state + (r.sourceReview ? ' - source review' : '') }
             : { st:'', tip:r.state };
  return out;
}
/* the credit gate takes about half a second, so a render shows the step bar from what is already known and this refreshes it once the gate has been worked out */
function patchSteps(){
  var st = stepStatus();
  [].forEach.call(document.querySelectorAll('.bk-step'), function(btn){ var i = +btn.getAttribute('data-bk-step'), x = stagesNow()[i]; if(!x) return; var o = st[x.id] || {}, cur = btn.classList.contains('cur');
    btn.className = 'bk-step ' + (o.st || '') + (cur ? ' cur' : ''); btn.title = o.tip || ''; var n = btn.querySelector('.n'); if(n) n.textContent = o.st === 'done' ? '\u2713' : o.st === 'fail' ? '\u2715' : o.st === 'warn' ? '!' : String(i + 1); });
}
function saveStatus(){
  var S = window.BK_SYNC || {};
  if(!hasDeal()) return ['', 'No deal'];
  if(S.mode === 'migration-required') return ['err', 'Cloud save off'];
  if(S.mode === 'error' || (S.live && S.lastError)) return ['err', 'Not saved'];
  if(S.mode === 'restoring') return ['', 'Restoring…'];
  if(S.live){
    if(Object.keys(S.pending || {}).length) return ['', 'Saving…'];
    if(S.needsId) return ['warn', 'Needs a Deal ID to save'];
    if(S.lastSavedAt){ var t = new Date(S.lastSavedAt); return ['ok', 'Saved ' + t.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })]; }
    return ['ok', 'Cloud sync on'];
  }
  return ['warn', 'Local only — sign in to save'];
}
function flowBar(sheet){
  var st = stepStatus(), si = stepOf(sheet), s = hasDeal() ? bkLoad() : {};
  var steps = stagesNow().map(function(x, i){
    var o = st[x.id] || {}, cls = (o.st || '') + (i === si ? ' cur' : '');
    var mark = o.st === 'done' ? '✓' : o.st === 'fail' ? '✕' : o.st === 'warn' ? '!' : String(i + 1);
    return (i ? '<span class="bk-step-sep"></span>' : '') + '<button type="button" class="bk-step ' + cls + '" data-bk-step="' + i + '" title="' + esc(o.tip || '') + '"><span class="n">' + mark + '</span>' + x.label + '</button>';
  }).join('');
  var c = String(s.scenarioCase || 'Base');
  var caseCtl = hasDeal() ? '<span class="bk-case" title="The case the output pages show: Operating Underwrite, Property CF, Debt, Debt Schedule, Covenant Monitor, Returns, Equity Waterfall, After-Tax, the Cash Flow Report and the Valuation Report. It is a view; the deal itself never changes. Hover a button for what it does; edit the deltas on Sensitivity or Deal Underwrite.">Case <span class="bk-seg">'
    + ['Downside','Base','Upside'].map(function(n){ var tip = typeof window.bkCaseSummary === 'function' ? window.bkCaseSummary(s, n) : ''; return '<button type="button" data-bk-case="' + n + '" aria-pressed="' + (c === n) + '"' + (tip ? ' title="' + esc(tip) + '"' : '') + '>' + n + '</button>'; }).join('') + '</span></span>' : '';
  var sv = saveStatus(), changed = changedCount();
  var undo = (hasDeal() || U.stack.length || U.redo.length) ? '<button type="button" class="bk-btn" data-bk-undo="1" title="' + esc(U.stack.length ? 'Undo: ' + U.stack[U.stack.length - 1].label + ' (Ctrl+Z)' : 'Nothing to undo') + '"' + (U.stack.length ? '' : ' disabled') + '>&#8630; Undo</button>'
    + '<button type="button" class="bk-btn" data-bk-redo="1" title="' + esc(U.redo.length ? 'Redo: ' + U.redo[U.redo.length - 1].label + ' (Ctrl+Shift+Z)' : 'Nothing to redo') + '"' + (U.redo.length ? '' : ' disabled') + '>&#8631;</button>' : '';
  return '<div class="bk-flow"><button type="button" class="bk-btn bk-menu-btn" data-bk-menu="1">&#9776; Sheets</button><div class="bk-steps" role="navigation" aria-label="Underwriting workflow">' + steps + '</div>'
    + '<div class="bk-flow-right">' + caseCtl + '<span class="bk-save ' + sv[0] + '" title="' + (changed ? changed + ' field' + (changed > 1 ? 's' : '') + ' changed this session' : 'No changes this session') + '">' + esc(sv[1]) + (changed ? ' · ' + changed + ' changed' : '') + '</span>' + undo + '</div></div>';
}
function stepNav(sheet){
  var si = stepOf(sheet); if(si < 0) return '';
  var SG = stagesNow(), prev = si > 0 ? SG[si-1] : null, next = si < SG.length - 1 ? SG[si+1] : null;
  // within a step, "next" walks the step's own sheets first
  var inStep = SG[si].sheets.filter(function(x){ return RENDERERS[x]; }), k = inStep.indexOf(sheet);
  var nextSheet = k > -1 && k < inStep.length - 1 ? inStep[k+1] : (next ? next.sheets[0] : null);
  var prevSheet = k > 0 ? inStep[k-1] : (prev ? prev.sheets[0] : null);
  return '<div class="bk-stepnav">'
    + (prevSheet ? '<button type="button" class="bk-btn" data-goto-sheet2="' + esc(prevSheet) + '">&larr; ' + esc(prevSheet) + '</button>' : '<span></span>')
    + (nextSheet ? '<button type="button" class="bk-btn primary" data-goto-sheet2="' + esc(nextSheet) + '">Next: ' + esc(nextSheet) + ' &rarr;</button>' : '')
    + '</div>';
}

/* Advanced grouping: rail + top navigation */
function advancedIds(){ var s = hasDeal() ? bkLoad() : {}; var a = ['monthly','db','sys']; if(!isDev(s)) a.unshift('dev'); return a; }
function decorateRail(){
  var rail = document.getElementById('rail-groups'); if(!rail) return;
  var adv = advancedIds(), groups = [].slice.call(rail.querySelectorAll('.rail-group'));
  var open = !!uiPrefs().advOpen, c = cur();
  var curGroup = (GROUPS.find(function(g){ return g.sheets.indexOf(c) > -1; }) || {}).id;
  if(adv.indexOf(curGroup) > -1) open = true;
  var head = rail.querySelector('.bk-adv-head');
  if(!head){ head = document.createElement('div'); head.className = 'bk-adv-head'; head.setAttribute('role','button'); head.tabIndex = 0;
    head.addEventListener('click', function(){ setUiPref('advOpen', !uiPrefs().advOpen); decorateRail(); }); }
  var first = null;
  groups.forEach(function(el){
    var lab = (el.querySelector('.rail-group-label span') || {}).textContent || '';
    var g = GROUPS.find(function(x){ return x.label === lab || lab.indexOf(x.label) === 0; });
    var isAdv = g && adv.indexOf(g.id) > -1;
    el.classList.toggle('bk-adv', !!isAdv);
    el.classList.toggle('bk-adv-hidden', !!isAdv && !open);
    if(isAdv && !first) first = el;
  });
  /* Advanced groups are moved to the end VISUALLY (flex order), never in the DOM: other layers
     address rail groups by their DOM position, and reordering the nodes mislabels them. */
  if(first){ if(!head.parentNode) rail.appendChild(head); head.style.order = 900;
    var n = 0; groups.forEach(function(el, i){ el.style.order = el.classList.contains('bk-adv') ? 901 + (n++) : i; }); }
  head.innerHTML = '<span>Advanced · ' + adv.map(function(id){ return (GROUPS.find(function(g){ return g.id === id; }) || {}).label; }).join(', ') + '</span><span>' + (open ? '▾' : '▸') + '</span>';
}
function decorateTopNav(frame){
  var strip = frame.querySelector('.tabnav-primary'); if(!strip || strip.querySelector('.bk-more')) return;
  var adv = advancedIds(), items = [], active = false;
  [].slice.call(strip.querySelectorAll('[data-goto-group]')).forEach(function(b){
    if(adv.indexOf(b.dataset.gotoGroup) > -1){ items.push(b); if(b.classList.contains('on')) active = true; }
  });
  if(!items.length) return;
  var wrap = document.createElement('div'); wrap.className = 'bk-more';
  wrap.innerHTML = '<div class="grp-btn' + (active ? ' on' : '') + '" data-bk-more="1">Advanced &#9662;</div><div class="bk-more-pop"><div class="lab">Advanced</div>'
    + items.map(function(b){ var g = GROUPS.find(function(x){ return x.id === b.dataset.gotoGroup; }) || {};
        return '<div data-bk-more-group="' + g.id + '"><span class="sw" style="background:' + g.color + '"></span>' + esc(g.label) + '</div>'; }).join('') + '</div>';
  items.forEach(function(b){ b.remove(); });
  var qa = strip.querySelector('[data-goto-group="qa"]');
  if(qa) strip.insertBefore(wrap, qa.nextSibling); else strip.appendChild(wrap);
}

/* ---------------------------------------------------------------- 2. snapshot + key */
function snapshotCard(){
  if(!hasDeal()) return '';
  var r = readiness(), s = bkLoad();
  var head = '<div class="card bk-snap"><div class="card-head">Deal Snapshot' + (String(s.scenarioCase || 'Base') !== 'Base' ? '<span class="bk-snap-case">' + esc(String(s.scenarioCase).toUpperCase()) + ' CASE</span>' : '') + '</div>'
    + (String(s.scenarioCase || 'Base') !== 'Base' && typeof window.bkCaseSummary === 'function' ? '<div class="bk-snap-what">' + esc(window.bkCaseSummary(s, String(s.scenarioCase))) + '</div>' : '');
  if(!r || !r.canCalculate){
    var n = r ? r.missing.length : 0;
    return head + '<div class="metric-list"><div class="metric-row"><span class="k">Status</span><span class="v">' + (window.bkReadinessChip ? window.bkReadinessChip() : '') + '</span></div></div>'
      + '<div class="bk-snap-foot">Results are withheld until ' + n + ' required input' + (n === 1 ? ' is' : 's are') + ' entered. <a data-goto-sheet2="Deal Underwrite">Go to Deal Underwrite</a></div></div>';
  }
  var h; try { h = headline(); } catch(e){ return ''; }
  var row = function(k, v, cls){ return '<div class="metric-row"><span class="k">' + k + '</span><span class="v ' + (cls || '') + '">' + v + '</span></div>'; };
  return head + '<div class="metric-list">'
    + row('Levered IRR', pct(h.levIRR), 'big') + row('Equity Multiple', mult(h.levMOIC))
    + row('Unlevered IRR', pct(h.unlevIRR)) + row('LP / GP IRR', pct(h.lpIRR) + ' / ' + pct(h.gpIRR))
    + row('Loan', money(h.loan) + (h.binding ? ' <span style="opacity:.6;font-weight:400">' + esc(h.binding) + '</span>' : ''))
    + row('Equity', money(h.equity)) + row('Going-in DSCR', isFinite(h.dscr) && h.dscr ? h.dscr.toFixed(2) + 'x' : '—')
    + row('Yield on Cost', pct(h.yoc))
    + (window.bkConventionsLabel ? row('Conventions', window.bkConventionsLabel()) : '')
    + (function(){ var m = null; try { m = window.bkMarketCompare && window.bkMarketCompare(); } catch(e){}
        if(!m || !m.rows) return ''; var out = m.rows.filter(function(x){ return x.status === 'ABOVE RANGE' || x.status === 'BELOW RANGE'; }).length;
        return '<div class="metric-row"><span class="k">Vs market</span><span class="v"><a data-goto-sheet2="Market Benchmarks" style="cursor:pointer">' + (out ? out + ' of ' + m.rows.length + ' outside range' : 'all in range') + '</a></span></div>'; })()
    + '</div>'
    + '<div class="bk-snap-foot">Live from the underwriting engine. <a data-goto-sheet2="Returns">Open Returns</a></div></div>';
}
function decorateSide(frame){
  var side = frame.querySelector('.side-col'); if(!side || side.getAttribute('data-bk-ux') === '1') return;
  side.setAttribute('data-bk-ux','1');
  var keyHtml = '';
  [].slice.call(side.children).forEach(function(card){
    if(card.querySelector('.photo')) card.remove();
    else { var h = card.querySelector('.card-head'); if(h && /color\s*&(amp;)?\s*formatting key/i.test(h.textContent)){ keyHtml = card.outerHTML; card.remove(); } }
  });
  var snap = snapshotCard();
  if(snap) side.insertAdjacentHTML('afterbegin', snap);
  if(keyHtml){
    var tb = frame.querySelector('.title-block');
    if(tb && !tb.querySelector('.bk-key-wrap')) tb.insertAdjacentHTML('beforeend', '<div class="bk-key-wrap"><button type="button" class="bk-btn" data-bk-key-toggle="1" aria-expanded="false">Color key</button><div class="bk-key-pop">' + keyHtml + '</div></div>');
  }
  if(!side.children.length) side.style.display = 'none';
}

/* ---------------------------------------------------------------- 5. notes drawer */
var DEV_NOTE = /^\W*(fix|live)\s*[-\u2013\u2014]|legacy|consolidated|mechanics|recalculates|read straight|verif|workbook|excel|havard|harvard|\bV\d|SYS_CF|bk[A-Z]\w+\(|patch|was removed|were removed|previously|regression|canonical|engine|port(ed)?\b|tie-out|byte|baseline|reference|convention|wired|scratch|frozen/i;
function decorateNotes(frame){
  var main = frame.querySelector('.main-col'); if(!main || main.querySelector('.bk-notes')) return;
  var notes = [].slice.call(main.querySelectorAll('.note-flag')).filter(function(n){
    if(n.closest('.bk-sx') || n.closest('.bk-notes')) return false;
    var icon = ((n.querySelector('span') || {}).textContent || '').trim();
    if(/⚠/.test(icon)) return false;                                   // warnings always stay in place
    return DEV_NOTE.test(n.textContent || '');
  });
  if(!notes.length) return;
  var d = document.createElement('details'); d.className = 'bk-notes';
  d.innerHTML = '<summary>Model notes (' + notes.length + ')</summary><div class="bk-notes-body"></div>';
  var body = d.querySelector('.bk-notes-body');
  notes.forEach(function(n){ body.appendChild(n); });
  var nav = main.querySelector('.bk-stepnav');
  if(nav) main.insertBefore(d, nav); else main.appendChild(d);
}

/* ---------------------------------------------------------------- 3. Deal Underwrite */
/* the Deal Underwrite tab bar: which group is open, kept for the session; "Show all" shares the panel-tab switch (and starts on under automated test) */
var DU_KEY = 'bk-du-tab';
function duShowAll(){ var v = null; try { v = localStorage.getItem('bk-pt-all'); } catch(e){} if(v === '1') return true; if(v === '0') return false; return !!(navigator && navigator.webdriver); }
function duStick(){ var f = document.querySelector('.bk-flow'), px = 0; try { if(window.innerWidth <= 900) px = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bk-tabh'), 10) || 0; else if(f && getComputedStyle(f).position === 'sticky') px = Math.round(f.getBoundingClientRect().height); } catch(e){} document.documentElement.style.setProperty('--bk-stick', px + 'px'); }
function duOpen(main, groups, k, opts){
  opts = opts || {}; var all = duShowAll(), bar = main.querySelector('.bk-dui'); if(!bar) return;
  groups.forEach(function(g, i){ g.panels.forEach(function(w){ w.classList.toggle('bk-grp-hide', !all && i !== k); }); });
  bar.querySelectorAll('.bk-dt').forEach(function(b, i){ var on = i === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.setAttribute('tabindex', on ? '0' : '-1'); });
  var tg = bar.querySelector('.bk-dt-all'); if(tg){ tg.textContent = all ? 'Show as tabs' : 'Show all'; tg.setAttribute('aria-pressed', all ? 'true' : 'false'); }
  bar.classList.toggle('bk-showall', all);
  if(opts.user){ try { localStorage.setItem(DU_KEY, String(k)); } catch(e){} }   /* remembered only when the person chose it */
  var on = bar.querySelector('.bk-dt.on'); if(on){ var bl = bar.getBoundingClientRect(), ol = on.getBoundingClientRect(); if(ol.left < bl.left + 4) bar.scrollLeft += ol.left - bl.left - 12; else if(ol.right > bl.right - 4) bar.scrollLeft += ol.right - bl.right + 12; }
  if(opts.scroll){ var first = groups[k].panels[0]; if(first){ var top = first.getBoundingClientRect().top, stick = bar.getBoundingClientRect().bottom + 6; if(top < stick - 1 || all) window.scrollBy({ top:top - stick, behavior:'smooth' }); } }
}
window.bkDuShowFor = function(el){   /* make sure the panel that holds this element is showing (a "Missing: ..." jump, a guide pointer) */
  var main = document.querySelector('#viewport .main-col'), w = el && el.closest ? el.closest('.tbl-wrap[data-bk-grp]') : null; if(!main || !w || !w.classList.contains('bk-grp-hide')) return false;
  var g = main.__bkDuGroups; if(!g) return false; duOpen(main, g, Number(w.getAttribute('data-bk-grp')), {}); return true; };
function duTabs(main, groups){
  main.__bkDuGroups = groups; duStick();
  if(!main.__bkDuBound){ main.__bkDuBound = true; window.addEventListener('resize', duStick); }
  var saved = NaN; try { var sv = localStorage.getItem(DU_KEY); saved = sv === null || sv === '' ? NaN : Number(sv); } catch(e){}
  var k = isFinite(saved) && saved >= 0 && saved < groups.length && groups[saved].panels.length ? saved : -1;
  if(k < 0){ groups.some(function(g, i){ if(g.miss){ k = i; return true; } return false; }); }
  if(k < 0) k = 0;
  duOpen(main, groups, k, {});
  var bar = main.querySelector('.bk-dui');
  bar.addEventListener('click', function(e){ var b = e.target.closest('button'); if(!b) return;
    if(b.hasAttribute('data-bk-all')){ try { localStorage.setItem('bk-pt-all', duShowAll() ? '0' : '1'); } catch(x){} var cur = Number(bar.querySelector('.bk-dt.on') ? bar.querySelector('.bk-dt.on').getAttribute('data-bk-grp') : 0); duOpen(main, groups, cur, { user:true }); return; }
    var i = Number(b.getAttribute('data-bk-grp')); if(!isFinite(i)) return; duOpen(main, groups, i, { scroll:true, user:true }); });
  bar.addEventListener('keydown', function(e){ var tabs = [].slice.call(bar.querySelectorAll('.bk-dt')), i = tabs.indexOf(document.activeElement); if(i < 0) return; var j = i;
    if(e.key === 'ArrowRight') j = (i + 1) % tabs.length; else if(e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length; else if(e.key === 'Home') j = 0; else if(e.key === 'End') j = tabs.length - 1; else return;
    e.preventDefault(); tabs[j].focus(); duOpen(main, groups, j, { user:true }); });
}

var REQ_KEYS = { size:'units', revenue:'avgRent' };
function decorateUnderwrite(frame){
  var main = frame.querySelector('.main-col'); if(!main || main.querySelector('.bk-dui')) return;
  var r = readiness(); if(!r || r.state === 'NO DEAL') return;
  var missKeys = typeof window.bkRequiredRows === 'function' ? Object.keys(window.bkRequiredRows().core) : r.missing.map(function(m){ return REQ_KEYS[m.key] || m.key; });
  main.querySelectorAll('tr[data-bk-key]').forEach(function(tr){ var k = tr.getAttribute('data-bk-key'); tr.classList.toggle('bk-req-missing', missKeys.indexOf(k) > -1);
    /* amber: the value is a template default, or is not required to calculate but is needed for returns */
    var st = null; try { st = typeof window.bkFieldStatus === 'function' ? window.bkFieldStatus(k) : null; } catch(e){} tr.classList.toggle('bk-attn', !!(st && st.cls === 'warn' && st.state === 'needed' && missKeys.indexOf(k) < 0));   /* amber is for a value the returns need; a template default already says so in its chip */ });
  /* Rows that do not apply to this kind of deal say so: the development tables on an acquisition, the acquisition-only conventions on a development. A row whose field is also
     used in a table that does apply (building area) is left alone. */
  (function(){ var dev = isDev(bkLoad()), NA_DEV = /^(Development\b|Construction Facility|Permanent \/ Stabilized Debt)/, NA_ACQ = /Acquisition Deals Only/, shared = {}, na = [];
    main.querySelectorAll('.tbl-wrap').forEach(function(w){ var c = w.querySelector('caption'); if(!c) return; var t = c.textContent.replace(/\s+/g, ' ').trim(), notApplies = dev ? NA_ACQ.test(t) : NA_DEV.test(t);
      if(notApplies) na.push(w); else w.querySelectorAll('tr[data-bk-key]').forEach(function(tr){ shared[tr.getAttribute('data-bk-key')] = 1; }); });
    na.forEach(function(w){ w.setAttribute('data-bk-na', '1'); w.querySelectorAll('tbody tr').forEach(function(tr){ var k = tr.getAttribute('data-bk-key'); if(k && shared[k]) return; var chip = tr.querySelector('.status-chip'), td = chip && chip.closest('td'); if(!td) return;
      td.innerHTML = '<span class="status-chip na" title="' + (dev ? 'Applies to acquisition deals only' : 'Applies to development deals only') + '">N/A</span>'; tr.classList.add('bk-na'); tr.classList.remove('bk-req-missing'); }); }); })();
  var total = r.missing.length + r.met.length, done = r.met.length;
  var req = '<div class="bk-req"><b>Required inputs: ' + done + ' of ' + total + '</b><span class="bar"><i style="width:' + (total ? Math.round(done/total*100) : 0) + '%"></i></span>'
    + (r.missing.length ? '<span>Missing:</span>' + r.missing.map(function(m){ return '<button type="button" data-bk-jump-key="' + esc(REQ_KEYS[m.key] || m.key) + '">' + esc(m.label) + '</button>'; }).join('')
                         : '<span style="color:#1F7A45;font-weight:600">All required inputs entered</span>') + '</div>';
  /* The section index: every panel on this long page, grouped under a coloured label and named in a few words (three panels were all called "Development"),
     with the section you are reading marked as you scroll. */
  var DUG = [['Setup', '#2f6fb5', /^(Identity|Ownership|Program)\b/], ['Income & costs', '#2e7d5b', /^(Source Economics|Operating Assumptions)/], ['Exit', '#a8641c', /^(Exit & Hold|Growth & Sale)/],
    ['Financing', '#2e6e6e', /^(Acquisition Debt|Permanent|Construction Facility|Debt Maturity|Audit-Fixed|What Each Debt)/], ['Partnership', '#7a4a8c', /^(JV Structure|Sponsor Economics)/],
    ['Development', '#b0592a', /^Development\b/], ['Tax & rules', '#6a7480', /^(After-Tax|Underwriting Cases|Underwriting Conventions)/]];
  var SHORT = [[/^Operating Assumptions/, 'Operating'], [/^Source Economics/, 'Source economics'], [/^Growth & Sale/, 'Growth & sale'], [/^Permanent/, 'Permanent debt'], [/^Construction Facility/, 'Construction loan'], [/^Debt Maturity/, 'Maturity & refi'],
    [/^Audit-Fixed/, 'Risk inputs'], [/^What Each Debt/, 'Constraint basis'], [/^JV Structure/, 'JV & fees'], [/^Underwriting Cases/, 'Cases'], [/^Underwriting Conventions/, 'Conventions'], [/^Exit & Hold/, 'Exit & hold']];
  /* THE TAB BAR: one row of seven group tabs, sticky under the header. A tab opens its panels directly below; nothing is navigated away from. A red count marks a group with required
     inputs missing; a group that does not apply to this kind of deal reads N/A. "Show all" puts every panel on the page again (and a printed page always carries every panel). */
  var groups = DUG.map(function(g){ return { name:g[0], color:g[1], rx:g[2], panels:[], miss:0, na:0 }; });
  main.querySelectorAll('.tbl-wrap').forEach(function(w, i){
    var cap = w.querySelector('caption'); if(!cap) return;
    var id = 'bk-du-' + i; w.id = id;
    var full = cap.textContent.replace(/\s+/g, ' ').trim(), head = full.replace(/\s+-\s+.*$/, '').trim();
    var gi = -1; groups.forEach(function(g, k){ if(gi < 0 && g.rx.test(head)) gi = k; }); if(gi < 0) gi = groups.length - 1;
    var g = groups[gi]; g.panels.push(w); w.setAttribute('data-bk-grp', String(gi)); w.setAttribute('role', 'tabpanel'); w.setAttribute('aria-labelledby', 'bk-dtab-' + gi);
    g.miss += w.querySelectorAll('tr.bk-req-missing').length; if(w.hasAttribute('data-bk-na')) g.na++;
  });
  var tabsHtml = groups.map(function(g, k){ var allNA = g.panels.length > 0 && g.na === g.panels.length, empty = !g.panels.length;
    return '<button type="button" role="tab" id="bk-dtab-' + k + '" class="bk-dt' + (allNA ? ' na' : '') + (empty ? ' empty' : '') + '" data-bk-grp="' + k + '" aria-selected="false" tabindex="-1" style="--g:' + g.color + '" title="' + esc(g.name + ' - ' + g.panels.length + ' panel' + (g.panels.length === 1 ? '' : 's') + (allNA ? ' (does not apply to this deal)' : '') + (g.miss ? ' - ' + g.miss + ' required input' + (g.miss === 1 ? '' : 's') + ' missing' : '')) + '"><span class="nm">' + esc(g.name) + '</span>'
      + (g.miss ? '<span class="bk-dt-n" aria-label="' + g.miss + ' required missing">' + g.miss + '</span>' : '') + (allNA ? '<span class="bk-dt-na">N/A</span>' : '') + '</button>'; }).join('');
  main.insertAdjacentHTML('afterbegin', '<div class="bk-dui bk-tabs" role="tablist" aria-label="Deal Underwrite sections">' + tabsHtml + '<button type="button" class="bk-dt-all" data-bk-all="1" title="Put every panel on one page">Show all</button></div>' + req);
  duTabs(main, groups);
  // fields changed this session
  var base = U.baseline && U.baseline.id === dealKey() ? U.baseline.s : null;
  if(base){
    var s = bkLoad();
    main.querySelectorAll('tr[data-bk-key]').forEach(function(tr){
      var k = tr.getAttribute('data-bk-key'), td = tr.querySelector('td.v') || tr.children[1]; if(!td) return;
      var was = base[k], now = s[k], diff = JSON.stringify(was) !== JSON.stringify(now);
      td.classList.toggle('bk-changed', diff);
      if(diff) td.title = 'Changed this session (was ' + (was === undefined || was === '' ? 'blank' : String(was)) + ')';
    });
  }
}

/* ---------------------------------------------------------------- 6. save / undo
   UNDO AND REDO FOR EVERY FUNCTION. Every change to anything the app keeps for you (the open deal, the portfolio, the investor registry, master properties, source packages and
   approvals, tenant approvals, property aliases, saved templates, the importer's learned wording) is seen where it is written, so no function has to remember to register itself: a
   change made in one go (one click, one import) is one step, and Undo / Redo put every one of those stores back exactly as it was, or exactly as it became. Writes the app makes on
   its own (a page filling in a missing default, the cloud sync pulling a copy down) are not steps. Fifty steps are kept. Each step has a plain-words label, shown on the button.
   Before an Undo or Redo that would change the model drastically is carried out, the person is told what it will change and asked to confirm (see drastic()). */
var U = { stack:[], redo:[], baseline:null, busy:false, rendering:0, quiet:0 };
var TRACKED = [(typeof BK_STORE !== 'undefined') ? BK_STORE : 'bkcapital.cre.v02', 'bkcapital.cre.portfolio.v01', 'bkcapital.cre.investors.v01', 'bkcapital.master.properties.v01', 'bkcapital.source.staging.v02', 'bkcapital.source.approvals.v02',
  'bkcapital.tenant.approvals.v01', 'bkcapital.property.aliases.v01', 'bkcapital.templates.v1', 'bkcapital.learn.rules.v1', 'bkcapital.learn.rules.v1.rm', 'bkcapital.learn.log.v1'];
var DEAL_KEY = TRACKED[0], NAMES = { 'bkcapital.cre.portfolio.v01':'the portfolio', 'bkcapital.cre.investors.v01':'the investor registry', 'bkcapital.master.properties.v01':'master properties', 'bkcapital.source.staging.v02':'the source package', 'bkcapital.source.approvals.v02':'source approvals',
  'bkcapital.tenant.approvals.v01':'tenant approvals', 'bkcapital.property.aliases.v01':'property aliases', 'bkcapital.templates.v1':'saved templates', 'bkcapital.learn.rules.v1':'learned expense wording', 'bkcapital.learn.rules.v1.rm':'learned expense wording', 'bkcapital.learn.log.v1':'learned expense wording' };
function dealKey(){ try { var s = bkLoad(); return String(s.dealId || s.name || ''); } catch(e){ return ''; } }
function rawDeal(){ try { return localStorage.getItem(DEAL_KEY); } catch(e){ return null; } }
function snap(){ var o = {}; TRACKED.forEach(function(k){ try { o[k] = localStorage.getItem(k); } catch(e){ o[k] = null; } }); return o; }
function sameSnap(a, b){ return TRACKED.every(function(k){ return a[k] === b[k]; }); }
function ensureBaseline(){
  if(!hasDeal()) return;
  var k = dealKey();
  if(!U.baseline || U.baseline.id !== k){ U.baseline = { id:k, s:bkLoad() }; }   /* the steps are kept: opening another deal is itself a step you can undo */
}
function changedCount(){
  if(!hasDeal() || !U.baseline || U.baseline.id !== dealKey()) return 0;
  var a = U.baseline.s, b = bkLoad(), n = 0;
  Object.keys(Object.assign({}, a, b)).forEach(function(k){ if(k.charAt(0) !== '_' && JSON.stringify(a[k]) !== JSON.stringify(b[k])) n++; });
  return n;
}

/* ---- words for a step ---- */
var FLABEL = { exitCap:'Exit cap', purchasePrice:'Purchase price', holdYears:'Hold period', avgRent:'Average rent', vacancy:'Vacancy', rentGrowth:'Rent growth', opexGrowth:'Expense growth', acqLTV:'Max LTV', acqLTC:'Max LTC', acqRate:'Loan rate', acqAmort:'Amortization', acqDSCR:'Min DSCR',
  units:'Units', gsf:'Building area', closing:'Closing date', name:'Name', dealId:'Deal ID', location:'Location', propertyType:'Property type', dealType:'Deal type', scenarioCase:'Case', gpShare:'GP share', pref:'Preferred return', saleCostPct:'Cost of sale', mgmtPct:'Management fee',
  constructionMonths:'Construction months', predevMonths:'Pre-development months', leaseupMonths:'Lease-up months', conLTC:'Construction loan LTC', conRate:'Construction loan rate', taxes:'Real estate taxes', insurance:'Insurance', reserves:'Reserves', rentRoll:'Rent roll', devGantt:'Development schedule',
  investors:'Investors', leases:'Tenant leases', devUnits:'Unit lease-up', _template:'Assumption template', _conv:'Conventions' };
function pretty(k){ return FLABEL[k] || String(k).replace(/^_+/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, function(c){ return c.toUpperCase(); }); }
function fv(k, v){ if(v === undefined || v === null || v === '') return 'blank'; if(typeof v === 'number'){ if(/Pct|Rate|Cap|Growth|acqLTV|acqLTC|Share|^pref|hurdle|Vacancy|vacancy|Delta|Variance|Factor|LTC|LTV/.test(k) && Math.abs(v) <= 1.5) return (v * 100).toFixed(2) + '%'; return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 1e4) / 1e4); }
  if(typeof v === 'string') return v.length > 26 ? v.slice(0, 25) + '…' : v; if(typeof v === 'boolean') return v ? 'on' : 'off'; return '(changed)'; }
function parse(raw){ try { return raw ? JSON.parse(raw) : null; } catch(e){ return null; } }
function describe(a, b){
  var parts = [], da = parse(a[DEAL_KEY]), db = parse(b[DEAL_KEY]);
  if(a[DEAL_KEY] !== b[DEAL_KEY]){
    if(!da && db) parts.push('Open deal “' + (db.name || db.dealId || 'untitled') + '”');
    else if(da && !db) parts.push('Remove deal “' + (da.name || da.dealId || 'untitled') + '”');
    else if(da && db && String(da.dealId || '') !== String(db.dealId || '') && String(da.name || '') !== String(db.name || '')) parts.push('Switch to deal “' + (db.name || db.dealId || 'untitled') + '”');
    else if(da && db){ var ks = Object.keys(Object.assign({}, da, db)).filter(function(k){ return JSON.stringify(da[k]) !== JSON.stringify(db[k]); }), vis = ks.filter(function(k){ return k.charAt(0) !== '_'; }), use = vis.length ? vis : ks;
      var one = function(k){ var x = da[k], y = db[k], simple = function(v){ return v === undefined || v === null || typeof v !== 'object'; }; return simple(x) && simple(y) ? pretty(k) + ' ' + fv(k, x) + ' → ' + fv(k, y) : pretty(k); };
      parts.push(use.length <= 2 ? use.map(one).join('; ') : use.slice(0, 2).map(function(k){ return pretty(k); }).join(', ') + ' and ' + (use.length - 2) + ' more'); } }
  TRACKED.slice(1).forEach(function(k){ if(a[k] !== b[k]){ var n = NAMES[k]; if(parts.indexOf(n) < 0 && parts.indexOf('Changes to ' + n) < 0) parts.push('Changes to ' + n); } });
  var out = parts.join('; '); return out || 'Change';
}

/* ---- seeing every write ---- */
var rawSet = Storage.prototype.setItem, rawRem = Storage.prototype.removeItem, batch = null;
function noHist(raw){ var o = parse(raw); if(!o) return raw; delete o._history; return JSON.stringify(o); }
function onlyHistory(a, b){ return TRACKED.every(function(k){ return k === DEAL_KEY ? noHist(a[k]) === noHist(b[k]) : a[k] === b[k]; }); }
function closeBatch(){ var bt = batch; batch = null; if(!bt) return; var after = snap(); if(sameSnap(bt.before, after) || U.busy) return;
  /* the deal's own change log is bookkeeping: it rides along with the step before it instead of being a step of its own */
  if(onlyHistory(bt.before, after)){ var top = U.stack[U.stack.length - 1]; if(top && onlyHistory(top.after, bt.before)) top.after = after; return; }
  U.stack.push({ before:bt.before, after:after, label:describe(bt.before, after), at:Date.now() }); if(U.stack.length > 50) U.stack.shift(); U.redo = []; }
function recording(k){ return U.busy ? false : !U.rendering && !U.quiet && TRACKED.indexOf(k) >= 0 && !(window.BK_SYNC && window.BK_SYNC.suspend > 0); }
function afterRenderWrite(k){
  /* a renderer filling a missing default is not a user edit: no step, and a field that was blank in the session baseline takes the filled value so it is not reported as changed */
  if(k === DEAL_KEY && U.baseline && U.baseline.id === dealKey()){ var now = bkLoad(), b = U.baseline.s; Object.keys(now).forEach(function(x){ if(b[x] === undefined) b[x] = now[x]; }); }
}
Storage.prototype.setItem = function(k, v){
  var mine = this === window.localStorage && TRACKED.indexOf(k) >= 0, rec = mine && recording(k), before = rec && !batch ? snap() : null;
  var r = rawSet.apply(this, arguments);
  if(before){ batch = { before:before }; Promise.resolve().then(closeBatch); } if(mine && U.rendering) afterRenderWrite(k); return r; };
Storage.prototype.removeItem = function(k){
  var mine = this === window.localStorage && TRACKED.indexOf(k) >= 0, rec = mine && recording(k), before = rec && !batch ? snap() : null;
  var r = rawRem.apply(this, arguments);
  if(before){ batch = { before:before }; Promise.resolve().then(closeBatch); } return r; };
window.bkUndoQuiet = function(fn){ U.quiet++; try { return fn(); } finally { U.quiet--; } };   /* for the app's own housekeeping writes */
function restore(target){
  U.busy = true;
  try { TRACKED.forEach(function(k){ var v = target[k]; if(v === null || v === undefined) rawRem.call(window.localStorage, k); else rawSet.call(window.localStorage, k, v); }); } finally { U.busy = false; }
  U.baseline = null; ensureBaseline(); rerender();
}

/* ---- is it drastic? the engine is run on both states; nothing is saved ---- */
function withState(st, fn){   /* the deal is put in storage for a moment, the engine reads it exactly as the app does, and the real one is put back; nothing renders and nothing is recorded */
  var real = rawDeal(), was = U.busy; U.busy = true;
  try { rawSet.call(window.localStorage, DEAL_KEY, JSON.stringify(st)); return fn(bkLoad()); }
  finally { try { if(real === null) rawRem.call(window.localStorage, DEAL_KEY); else rawSet.call(window.localStorage, DEAL_KEY, real); } catch(e){} U.busy = was; } }
function metrics(raw){
  var st = parse(raw); if(!st) return null;
  return withState(st, function(s){ var m = { id:String(s.dealId || ''), name:String(s.name || ''), type:String(s.dealType || ''), price:num0(s.purchasePrice) }, rd = null;
    try { rd = window.bkDealReadiness ? window.bkDealReadiness() : null; } catch(e){} m.state = rd ? rd.state : ''; m.calc = !!(rd && rd.canCalculate);
    if(m.calc){ try { var r = bkMonthlyReturns(), d = bkDebt(), c = bkCalc(); m.irr = r.irr; m.moic = r.moic; m.equity = num0(d.equity); m.loan = num0(d.loan); m.noi = num0(c.noi); } catch(e){ m.calc = false; } }
    return m; });
}
function num0(v){ var n = Number(v); return isFinite(n) ? n : 0; }
var THRESH = { irr:0.01, rel:0.10 };   /* a point of levered IRR; a tenth of price, NOI, loan or equity */
function drastic(target){
  var cur = snap(), lines = [], flag = false, a = metrics(cur[DEAL_KEY]), b = metrics(target[DEAL_KEY]), mo = function(v){ return '$' + Math.round(v).toLocaleString('en-US'); };
  if(cur[DEAL_KEY] !== target[DEAL_KEY]){
    if(a && !b){ flag = true; lines.push('There will be no open deal: “' + (a.name || a.id || 'untitled') + '” is taken away.'); }
    else if(!a && b){ flag = true; lines.push('“' + (b.name || b.id || 'untitled') + '” becomes the open deal.'); }
    else if(a && b){
      if((a.id !== b.id) && (a.name !== b.name)){ flag = true; lines.push('It switches the open deal from “' + (a.name || a.id) + '” to “' + (b.name || b.id) + '”.'); }
      if(a.type !== b.type){ flag = true; lines.push('The deal type changes from ' + (a.type || 'blank') + ' to ' + (b.type || 'blank') + '.'); }
      if(a.calc !== b.calc){ flag = true; lines.push(b.calc ? 'Results that are withheld now (' + a.state + ') will show again.' : 'The deal becomes ' + b.state + ' and its results are withheld.'); }
      if(a.calc && b.calc){
        if(isFinite(a.irr) && isFinite(b.irr) && Math.abs(a.irr - b.irr) >= THRESH.irr){ flag = true; lines.push('Levered IRR goes from ' + (a.irr * 100).toFixed(2) + '% to ' + (b.irr * 100).toFixed(2) + '% (' + (b.irr >= a.irr ? '+' : '−') + (Math.abs(b.irr - a.irr) * 100).toFixed(2) + ' points).'); }
        [['price', 'Purchase price'], ['noi', 'Year-1 NOI'], ['loan', 'The loan'], ['equity', 'Equity required']].forEach(function(p){ var x = a[p[0]], y = b[p[0]], base = Math.max(Math.abs(x), 1); if(Math.abs(y - x) / base >= THRESH.rel && Math.abs(y - x) > 1000){ flag = true; lines.push(p[1] + ' goes from ' + mo(x) + ' to ' + mo(y) + ' (' + (y >= x ? '+' : '−') + Math.round(Math.abs(y - x) / base * 100) + '%).'); } });
      } } }
  var cp = parse(cur['bkcapital.cre.portfolio.v01']) || [], tp = parse(target['bkcapital.cre.portfolio.v01']) || [], ci = parse(cur['bkcapital.cre.investors.v01']) || [], ti = parse(target['bkcapital.cre.investors.v01']) || [];
  if(Array.isArray(cp) && Array.isArray(tp) && tp.length < cp.length){ flag = true; lines.push('It removes ' + (cp.length - tp.length) + ' saved deal' + (cp.length - tp.length === 1 ? '' : 's') + ' from the portfolio.'); }
  if(Array.isArray(ci) && Array.isArray(ti) && ti.length < ci.length){ flag = true; lines.push('It removes ' + (ci.length - ti.length) + ' investor' + (ci.length - ti.length === 1 ? '' : 's') + ' from the registry.'); }
  return flag ? lines : null;
}

/* ---- the buttons, the question and the confirmation ---- */
function toast(txt, redoable){
  var t = document.getElementById('bk-undo-toast'); if(!t){ t = document.createElement('div'); t.id = 'bk-undo-toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.appendChild(t); }
  t.innerHTML = esc(txt) + (redoable ? ' <button type="button" data-bk-redo="1">Redo</button>' : ''); t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(function(){ t.classList.remove('on'); }, 5000); }
function ask(kind, step, lines, go){
  closeAsk(); var o = document.createElement('div'); o.id = 'bk-undo-ask'; o.setAttribute('role', 'alertdialog'); o.setAttribute('aria-label', 'Confirm ' + kind);
  o.innerHTML = '<div class="box"><h3>' + (kind === 'undo' ? 'Undo' : 'Redo') + ' this? It changes the model a lot.</h3><div class="step">' + esc(step.label) + '</div><ul>' + lines.map(function(l){ return '<li>' + esc(l) + '</li>'; }).join('') + '</ul><div class="btns"><button type="button" class="bk-btn" data-ask="cancel">Cancel</button><button type="button" class="bk-btn primary" data-ask="go">' + (kind === 'undo' ? 'Undo anyway' : 'Redo anyway') + '</button></div></div>';
  document.body.appendChild(o); o._go = go; var c = o.querySelector('[data-ask="cancel"]'); if(c) c.focus(); }
function closeAsk(){ var o = document.getElementById('bk-undo-ask'); if(o) o.remove(); }
function perform(kind, step, target){
  if(kind === 'undo'){ U.stack.pop(); U.redo.push(step); } else { U.redo.pop(); U.stack.push(step); }
  restore(target); toast((kind === 'undo' ? 'Undone: ' : 'Redone: ') + step.label, kind === 'undo');
}
function go(kind, opts){
  var from = kind === 'undo' ? U.stack : U.redo; if(!from.length) return false;
  var step = from[from.length - 1], target = kind === 'undo' ? step.before : step.after, lines = opts && opts.confirmed ? null : safeDrastic(target);
  if(lines){ ask(kind, step, lines, function(){ perform(kind, step, target); }); return false; }
  perform(kind, step, target); return true;
}
function safeDrastic(t){ try { return drastic(t); } catch(e){ window.__dErr = e.stack; return null; } }
function undo(opts){ return go('undo', opts); }
function redo(opts){ return go('redo', opts); }
window.bkUndo = undo; window.bkRedo = redo;
window.bkUndoState = function(){ return { undo:U.stack.map(function(x){ return x.label; }), redo:U.redo.map(function(x){ return x.label; }), pending:!!document.getElementById('bk-undo-ask') }; };
window.bkUndoSnapshot = snap;
document.addEventListener('click', function(e){ var t = e.target && e.target.closest ? e.target.closest('#bk-undo-ask [data-ask]') : null; if(!t) return; var o = document.getElementById('bk-undo-ask'), fn = o && o._go; closeAsk(); if(t.getAttribute('data-ask') === 'go' && fn) fn(); }, true);
document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && document.getElementById('bk-undo-ask')){ e.preventDefault(); e.stopPropagation(); closeAsk(); } }, true);

/* ---------------------------------------------------------------- 7. Returns KPI tiles */
(function(){
  var prev = RENDERERS['Returns']; if(typeof prev !== 'function') return;
  var w = function(){
    var o = prev.apply(this, arguments);
    try {
      if(!hasDeal() || !o || /no deal loaded|results withheld|there is no active deal/i.test(String(o.main || ''))) return o;
      var r = readiness(); if(r && !r.canCalculate) return o;
      var h = headline();
      var tile = function(k, v, sub, hero){ return '<div class="bk-tile' + (hero ? ' hero' : '') + '"><div class="kk">' + k + '</div><div class="kv">' + v + '</div>' + (sub ? '<div class="ks">' + sub + '</div>' : '') + '</div>'; };
      o.main = '<div class="bk-tiles">'
        + tile('Levered IRR', pct(h.levIRR), (h.c !== 'Base' ? h.c + ' case · ' : '') + 'deal level', true)
        + tile('Equity Multiple', mult(h.levMOIC), money(h.profit) + ' profit', true)
        + tile('Unlevered IRR', pct(h.unlevIRR), mult(h.unlevMOIC) + ' multiple')
        + tile('LP IRR', pct(h.lpIRR), mult(h.lpMOIC) + ' LP multiple')
        + tile('GP IRR', pct(h.gpIRR), mult(h.gpMOIC) + ' GP multiple')
        + tile('Peak Equity', money(h.peak), 'funded at close')
        + '</div>' + (o.main || '');
    } catch(e){}
    return o;
  };
  Object.keys(prev).forEach(function(k){ if(k.indexOf('__') === 0) w[k] = prev[k]; });
  if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Returns', w); else RENDERERS['Returns'] = w;
})();

/* ---------------------------------------------------------------- render hook */
function decorate(sheet){
  var vp = document.getElementById('viewport'); if(!vp) return;
  var frame = vp.querySelector('.sheet-frame'); if(!frame) return;
  ensureBaseline();
  if(!frame.querySelector('.bk-flow')){
    var nav = frame.querySelector('.tabnav');
    if(nav) nav.insertAdjacentHTML('afterend', flowBar(sheet));
  }
  decorateTopNav(frame);
  var main = frame.querySelector('.main-col');
  if(main && hasDeal() && !main.querySelector('.bk-stepnav')) main.insertAdjacentHTML('beforeend', stepNav(sheet));
  decorateSide(frame);
  if(sheet === 'Deal Underwrite' && hasDeal()) decorateUnderwrite(frame);
  decorateNotes(frame);
  decorateRail();
  ribbon(frame, sheet);
  noGpSplits(frame);
  kpiBar(sheet);
}
/* with no GP partner the tier splits are not inputs: the LP takes every tier (kept at 100% for the engine). They read "Not set (no GP)" and cannot be edited until a GP share is entered. */
function noGpSplits(frame){ if(!hasDeal()) return; var s; try { s = bkLoad(); } catch(e){ return; } if(Number(s.gpShare) > 0) return;
  ['t2LP', 't3LP', 't4LP'].forEach(function(k){
    [].forEach.call(frame.querySelectorAll('tr[data-bk-key="' + k + '"] td.v'), function(td){ td.removeAttribute('contenteditable'); td.innerHTML = '<span class="bk-nogp">Not set (no GP)</span>'; td.title = 'Enter a GP share to set the splits.'; var tr = td.parentNode; tr.classList.remove('input'); tr.classList.add('bk-nogp-row'); });
    var el = frame.querySelector('#ae-' + k); if(el){ el.value = ''; el.placeholder = 'Not set (no GP)'; el.disabled = true; el.title = 'Enter a GP share to set the splits.'; } }); }
/* RIBBON: the command bar under the group tabs. It only carries existing commands (open a sheet, new analysis, import, clear, print, key, guide, sidebar); nothing new is calculated. */
var RB = { doc:'M6 3h9l4 4v14H6z M15 3v4h4 M9 12h7 M9 16h7', grid:'M4 5h16v14H4z M4 10h16 M4 15h16 M10 5v14', chart:'M4 20V4 M4 20h16 M8 16v-5 M12 16V8 M16 16v-8', bank:'M3 9l9-5 9 5 M5 9v9 M10 9v9 M14 9v9 M19 9v9 M3 20h18', key:'M8 14a4 4 0 1 1 3-6.5L21 17v3h-3v-2h-2v-2h-2l-1.5-1.5', plus:'M12 5v14 M5 12h14', up:'M12 16V5 M7 10l5-5 5 5 M5 19h14', trash:'M5 7h14 M9 7V4h6v3 M7 7l1 13h8l1-13', print:'M7 9V3h10v6 M7 17H4v-7h16v7h-3 M7 14h10v7H7z', book:'M5 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H5z M19 4h-6 M19 4v14h-6', side:'M4 5h16v14H4z M9 5v14', swatch:'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z', people:'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20v-2a5 5 0 0 1 10 0v2 M16 6a3 3 0 0 1 0 6 M21 20v-2a5 5 0 0 0-3-4.5', cal:'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4', calc:'M6 3h12v18H6z M9 7h6 M9 12h2 M13 12h2 M9 16h2 M13 16h2' };
var RB_OF = { overview:'grid', inputs:'doc', editor:'grid', reports:'doc', propops:'chart', dev:'cal', debt:'bank', returns:'chart', biz:'calc', credit:'bank', tools:'calc', portfolio:'people', qa:'doc' };
var RB_SHEET = {"Home":"home","Property":"pin","Market":"trend","Revenues":"dollar","Expenses":"receipt","Tenants":"idcard","Investment":"case","Valuation":"tag","Cash Flow Report":"cashflow","Valuation Report":"doc","Tenant Report":"clip","Lease Schedule":"cal","Audit Report":"magnify","Deal Underwrite":"sliders","Deal Documents":"folder","Rent Roll":"list","Source Ingestion":"funnel","Import Deal":"download","Import OM":"docin","Import Rent Roll":"tablein","Depreciation":"decline","Market Benchmarks":"bench","Operating Underwrite":"calc","Property CF":"bars","Development":"crane","Dev Schedule":"gantt","Dev Lease-Up":"key","Dev Draws":"stairs","Residual Land":"hill","Debt":"bank","Debt Schedule":"sched","Covenant Monitor":"gauge","Refi / Recap":"refresh","Financing Lab":"flask","Financing Compare":"balance","Returns":"rise","Equity Waterfall":"wfall","After-Tax":"percent","Probability-Weighted":"bell","Pre-Offer Bid":"flag","Business Model":"layers","Business Valuation":"pie","Sell vs Hold":"swap","IC Memo":"memo","Debt Capacity":"battery","Credit Policy":"shield","Deal Remedies":"wrench","Model Checks":"checkc","Sensitivity":"tornado","Reverse Solve":"undo","Portfolio":"brief2","Investors":"people","Investor Schedules":"cal","Liquidity":"drop","Portfolio Dashboard":"dash","Data Export":"upload","Waterfall (M)":"steps","Sponsor CF":"person","Lease Cohort CF":"wave","Portfolio M":"dash","Deal Vectors (M)":"vector","Ledger (M)":"book","Property DB":"dbcyl","Portfolio CF":"gantt","Equity Partners":"person","Investor Summary":"partners","Capital Calls":"intobox","Capital Allocation":"pie","Portfolio Rollup":"brief2","Benchmarks":"bench","Sources & Uses":"srcuse","QA":"bug","Version History":"clock","SYS_DealDB":"dbcyl","SYS_CF":"cashflow","SYS_RentRoll":"list","SYS_Snapshots":"camera","SYS_Golden":"star","SYS_PrintState":"print","SYS_Curves":"wave"};
var RB2 = {"home":"M3 11l9-8 9 8 M5 10v10h5v-6h4v6h5V10","pin":"M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z M12 8.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z","trend":"M3 17l6-6 4 4 8-8 M15 7h6v6","dollar":"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v10 M14.5 9.5c0-1-1-1.5-2.5-1.5S9.5 8.7 9.5 9.8s1 1.4 2.5 1.7 2.5.7 2.5 1.8-1 1.7-2.5 1.7-2.5-.6-2.5-1.5","receipt":"M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6","case":"M4 8h16v12H4z M9 8V5h6v3 M4 13h16","tag":"M3 12l9-9h8v8l-9 9z M16 8h.01","cashflow":"M3 8h15 M14 4l4 4-4 4 M21 16H6 M10 12l-4 4 4 4","idcard":"M3 6h18v12H3z M7 12a2 2 0 1 0 0-.01 M12 10h6 M12 14h6","magnify":"M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12z M15 15l5 5","sliders":"M4 7h10 M18 7h2 M14 5v4 M4 17h2 M10 17h10 M6 15v4 M4 12h16","folder":"M3 6h6l2 2h10v11H3z","list":"M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01","funnel":"M3 5h18l-7 8v6l-4 2v-8z","download":"M12 4v11 M7 10l5 5 5-5 M5 20h14","docin":"M6 3h9l4 4v14H6z M12 10v7 M9 14l3 3 3-3","tablein":"M3 4h18v6H3z M3 14h12v6H3z M18 13v7 M15 17l3 3 3-3","decline":"M3 5v14h18 M6 8l4 4 3-2 5 7","bench":"M4 20h16 M6 20v-6 M11 20v-10 M16 20v-4 M4 8h16","calc":"M6 3h12v18H6z M9 7h6 M9 12h2 M13 12h2 M9 16h2 M13 16h2","steps":"M4 20h16 M6 20v-6h4v-4h4V6h4","crane":"M4 21h16 M7 21V6h8 M7 10h8 M15 6l5 4 M15 10v6 M13 16h4v3h-4z","gantt":"M4 4v16 M8 6h8 M10 11h10 M14 16h6","key":"M8 14a4 4 0 1 1 3-6.5L21 17v3h-3v-2h-2v-2h-2l-1.5-1.5","stairs":"M3 20h5v-5h5v-5h5V5h3","hill":"M3 19l6-10 4 6 3-4 5 8z","bank":"M3 9l9-5 9 5 M5 9v9 M10 9v9 M14 9v9 M19 9v9 M3 20h18","sched":"M4 5h16v15H4z M4 10h16 M8 3v4 M16 3v4 M8 14h3 M13 14h3 M8 17h3","gauge":"M4 17a8 8 0 1 1 16 0 M12 17l4-5 M4 17h16","refresh":"M20 11a8 8 0 0 0-14-4 M6 3v4h4 M4 13a8 8 0 0 0 14 4 M18 21v-4h-4","flask":"M9 3h6 M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3","balance":"M12 4v16 M5 8h14 M5 8l-3 7h6z M19 8l-3 7h6z M8 20h8","rise":"M3 20h18 M5 16l5-5 3 3 6-7","wfall":"M4 5h5v5h5v5h6","percent":"M6 18L18 6 M7 8a1.5 1.5 0 1 0 0-.01 M17 16a1.5 1.5 0 1 0 0-.01","bell":"M3 18c3 0 4-12 9-12s6 12 9 12 M3 18h18","flag":"M5 21V4 M5 5h12l-2 4 2 4H5","layers":"M12 4l9 5-9 5-9-5z M3 14l9 5 9-5","pie":"M12 3v9h9 M20 15a9 9 0 1 1-8-12","swap":"M4 8h14 M14 4l4 4-4 4 M20 16H6 M10 12l-4 4 4 4","memo":"M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5","battery":"M4 8h15v8H4z M19 10h2v4h-2z M7 11v2 M10 11v2 M13 11v2","shield":"M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z","wrench":"M14 6a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3l9-9a4 4 0 0 1-2-2z","checkc":"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M8 12l3 3 5-6","tornado":"M12 3v18 M5 6h7 M12 10h7 M8 14h4 M12 18h5","undo":"M9 7H4V2 M4 7a9 9 0 1 1-1 7","brief2":"M3 7h18v13H3z M8 7V4h8v3","people":"M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20v-2a5 5 0 0 1 10 0v2 M16 6a3 3 0 0 1 0 6 M21 20v-2a5 5 0 0 0-3-4.5","cal":"M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4","drop":"M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z","dash":"M3 4h8v8H3z M13 4h8v5h-8z M13 11h8v9h-8z M3 14h8v6H3z","upload":"M12 15V4 M7 9l5-5 5 5 M5 20h14","person":"M12 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M5 20c0-4 3-6 7-6s7 2 7 6","bars":"M3 20h18 M6 20v-8 M10 20V6 M14 20v-10 M18 20V9","vector":"M4 20L10 6l4 8 2-4 4 10","book":"M5 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H5z M19 4h-6 M19 4v14h-6","dbcyl":"M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3z M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6 M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3","partners":"M8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M16 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M2 20c0-3 2.5-5 6-5 M22 20c0-3-2.5-5-6-5 M8 20c0-3 1.5-5 4-5s4 2 4 5","clip":"M8 4h8v3H8z M6 5h12v16H6z M9 12h6 M9 16h6","intobox":"M12 3v10 M8 9l4 4 4-4 M4 15v5h16v-5","srcuse":"M7 4v16 M3 8l4-4 4 4 M17 20V4 M13 16l4 4 4-4","bug":"M8 8h8v8a4 4 0 0 1-8 0z M9 4l-2-2 M15 4l2-2 M4 12h4 M16 12h4","clock":"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2","camera":"M4 8h4l2-3h4l2 3h4v11H4z M12 11a3 3 0 1 0 0 6 3 3 0 0 0 0-6z","star":"M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.2 6.5 20.2l1-6.2L3 9.6l6.2-.9z","print":"M7 9V3h10v6 M7 17H4v-7h16v7h-3 M7 14h10v7H7z","wave":"M3 16c3-8 6-8 9 0s6 8 9 0","grid":"M4 5h16v14H4z M4 10h16 M4 15h16 M10 5v14","doc":"M6 3h9l4 4v14H6z M15 3v4h4 M9 12h7 M9 16h7"};
function rbIcon(k){ return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (RB2[k] || RB[k] || RB.doc) + '"/></svg>'; }
function rbBtn(icon, label, attrs, on){ return '<button type="button" class="rb-b' + (on ? ' on' : '') + '" ' + attrs + '>' + rbIcon(icon) + '<span>' + esc(label) + '</span></button>'; }
function tabHeight(frame){ var n = frame && frame.querySelector('.tabnav'); if(n) document.documentElement.style.setProperty('--bk-tabh', Math.round(n.getBoundingClientRect().height) + 'px'); }
window.addEventListener('resize', function(){ tabHeight(document.querySelector('.sheet-frame.active')); });
function ribbon(frame, sheet){
  tabHeight(frame);
  if(!frame || frame.querySelector('.bk-ribbon')) return;
  var nav = frame.querySelector('.tabnav'); if(!nav) return;
  /* the sub-tabs: every page of the current section tab (all its groups), the one way to a page together with the section tabs and the sidebar */
  var dev = false; try { var d = bkLoad(); dev = !!d && /develop/i.test(String(d.dealType || '')); } catch(e){}
  var tab = (typeof NAV_TABS !== 'undefined' ? NAV_TABS : []).find(function(t){ return t.groups.some(function(id){ var x = GROUPS.find(function(y){ return y.id === id; }); return x && x.sheets.indexOf(sheet) > -1; }); });
  var gs = tab ? tab.groups.map(function(id){ return GROUPS.find(function(x){ return x.id === id; }); }).filter(function(x){ return x && !x.hidden && (x.id !== 'dev' || dev || x.sheets.indexOf(sheet) > -1); }) : [];
  var sub = gs.map(function(g){ return g.sheets.filter(function(n){ return typeof RENDERERS[n] === 'function'; }).map(function(n){ return '<button type="button" class="rb-t' + (n === sheet ? ' on' : '') + '" data-goto-sheet2="' + esc(n) + '"' + (n === sheet ? ' aria-current="page"' : '') + '>' + esc(n) + '</button>'; }).join(''); }).filter(Boolean).join('<span class="rb-sep" aria-hidden="true"></span>');
  var cmd = function(icon, label, attrs){ return '<button type="button" class="rb-c" ' + attrs + '>' + rbIcon(icon) + '<span>' + esc(label) + '</span></button>'; };
  var h = '<div class="bk-ribbon" role="toolbar" aria-label="Pages and commands"><div class="rb-tabs" role="navigation" aria-label="Pages">' + (gs.length > 1 || (gs[0] && gs[0].sheets.length > 1) ? sub : '') + '</div>'
    + '<div class="rb-cmds">' + cmd('plus', 'New analysis', 'onclick="bkNewDealDialog()"') + cmd('up', 'Import', 'data-goto-sheet2="Import"') + cmd('print', 'Print / PDF', 'onclick="bkPrintSection()"') + '</div></div>';
  nav.insertAdjacentHTML('afterend', h);
}
/* KEY-FIGURE BAR: the headline figures stay at the foot of every deal sheet, read from the same headline() as the Deal Snapshot, so they cannot differ from it. */
function kpiBar(sheet){
  var el = document.getElementById('bk-kpibar');
  if(!hasDeal() || sheet === 'Guide'){ if(el) el.hidden = true; document.body.classList.remove('bk-has-kpibar'); return; }
  if(!el){ el = document.createElement('div'); el.id = 'bk-kpibar'; el.setAttribute('role', 'status'); el.setAttribute('aria-label', 'Key figures'); document.body.appendChild(el); }
  var r = readiness(), cell = function(k, v, sub){ return '<div class="kb-c"><div class="kb-k">' + k + '</div><div class="kb-v">' + v + '</div>' + (sub ? '<div class="kb-s">' + sub + '</div>' : '') + '</div>'; };
  var html;
  if(!r || !r.canCalculate){ html = cell('Status', esc(r ? r.state : 'DRAFT'), 'results withheld until ' + (r ? r.missing.length : 0) + ' required input' + (r && r.missing.length === 1 ? ' is' : 's are') + ' entered'); }
  else if(window.BKReg && (function(){ try { return window.BKReg.of(bkLoad()).ownReadiness; } catch(e){ return false; } })()){ /* an analysis with its own engine shows its own figures: the registry's tiles from its summary */
    var R = window.BKReg, sm = R.summarize(bkLoad()), all = [sm.primary].concat(sm.metrics), f = function(m){ var v = m.value; if(v === null || v === undefined || !isFinite(v)) return '—'; return m.fmt === 'pct' ? pct(v) : m.fmt === 'x' ? v.toFixed(2) + 'x' : money(v); };
    html = R.tiles(sm.analysis.id).map(function(id){ var m = all.filter(function(x){ return x.id === id; })[0]; return m ? cell(esc(m.label), f(m)) : ''; }).join(''); }
  else { var h; try { h = headline(); } catch(e){ h = null; }
    html = h ? cell('Levered IRR', pct(h.levIRR)) + cell('Equity Multiple', mult(h.levMOIC)) + cell('Unlevered IRR', pct(h.unlevIRR)) + cell('Yield on Cost', pct(h.yoc))
      + cell('Going-in DSCR', isFinite(h.dscr) && h.dscr ? h.dscr.toFixed(2) + 'x' : '—') + cell('Loan', money(h.loan), h.binding ? esc(h.binding) : '') + cell('Equity', money(h.equity)) + cell('Net Profit', money(h.profit))
      + cell('Case', esc(String(h.s.scenarioCase || 'Base')).toUpperCase()) : ''; }
  el.innerHTML = html; el.hidden = !html; document.body.classList.toggle('bk-has-kpibar', !!html);
}
function refreshFlow(){
  var vp = document.getElementById('viewport'), bar = vp && vp.querySelector('.bk-flow'); if(!bar) return;
  var c = cur(); var tmp = document.createElement('div'); tmp.innerHTML = flowBar(c);
  bar.replaceWith(tmp.firstChild);
}
var priorShow = window.showSheet;
window.showSheet = function(sheet){
  ensureBaseline();
  U.rendering++;
  var r; try { r = priorShow.apply(this, arguments); } finally { U.rendering--; }
  try { decorate(sheet); } catch(e){ if(window.console) console.warn('UX layer:', e); }
  return r;
};
try { showSheet = window.showSheet; } catch(e){}

/* ---------------------------------------------------------------- events */
document.addEventListener('click', function(e){
  var t = e.target && e.target.closest ? e.target : null; if(!t) return;
  var el;
  if((el = t.closest('[data-bk-step]'))){ var st = stagesNow()[+el.getAttribute('data-bk-step')]; var first = st.sheets.find(function(x){ return RENDERERS[x]; }); if(first) showSheet(first); return; }
  if((el = t.closest('[data-goto-sheet2]'))){ showSheet(el.getAttribute('data-goto-sheet2')); window.scrollTo(0, 0); return; }
  if((el = t.closest('[data-bk-case]'))){ var s = bkLoad(), c = el.getAttribute('data-bk-case'); if(String(s.scenarioCase || 'Base') !== c){ s.scenarioCase = c; bkSave(s); } rerender(); return; }
  if((el = t.closest('[data-bk-undo]'))){ undo(); return; }
  if((el = t.closest('[data-bk-redo]'))){ redo(); return; }
  if((el = t.closest('[data-bk-menu]'))){ var rail = document.getElementById('rail'); if(rail) rail.classList.toggle('open'); return; }
  if((el = t.closest('[data-bk-key-toggle]'))){ var w = el.closest('.bk-key-wrap') || document.querySelector('.bk-key-wrap'); if(!w) return; var o = w.classList.toggle('open'); el.setAttribute('aria-expanded', String(o)); return; }
  if((el = t.closest('[data-bk-more]'))){ var mw = el.closest('.bk-more'), pop = mw.querySelector('.bk-more-pop'), rc = el.getBoundingClientRect();
    /* the nav strip scrolls horizontally, so the menu is positioned against the window to avoid being clipped */
    pop.style.position = 'fixed'; pop.style.top = (rc.bottom + 4) + 'px'; pop.style.left = Math.max(8, Math.min(rc.left, window.innerWidth - 236)) + 'px'; pop.style.right = 'auto';
    mw.classList.toggle('open'); return; }
  if((el = t.closest('[data-bk-more-group]'))){ var g = GROUPS.find(function(x){ return x.id === el.getAttribute('data-bk-more-group'); }); if(g) showSheet(g.sheets[0]); return; }
  if((el = t.closest('[data-bk-jump]'))){ var tgt = document.getElementById(el.getAttribute('data-bk-jump')); if(tgt){ tgt.scrollIntoView({ behavior:'smooth', block:'start' }); } return; }
  if((el = t.closest('[data-bk-jump-key]'))){ var row = document.querySelector('#viewport tr[data-bk-key="' + el.getAttribute('data-bk-jump-key') + '"]');
    if(row){ if(typeof window.bkDuShowFor === 'function') window.bkDuShowFor(row); row.scrollIntoView({ behavior:'smooth', block:'center' }); row.classList.add('bk-flash'); setTimeout(function(){ row.classList.remove('bk-flash'); }, 1700);
      var cell = row.querySelector('td.v'); if(cell && cell.isContentEditable) setTimeout(function(){ cell.focus(); }, 350); } return; }
  // close pop-ups on outside click
  document.querySelectorAll('.bk-more.open').forEach(function(m){ if(!m.contains(t)) m.classList.remove('open'); });
  document.querySelectorAll('.bk-key-wrap.open').forEach(function(m){ if(!m.contains(t)) m.classList.remove('open'); });
  var railEl = document.getElementById('rail');
  if(railEl && railEl.classList.contains('open') && !railEl.contains(t)) railEl.classList.remove('open');
  if(t.closest('.rail-item') && railEl) railEl.classList.remove('open');
});
document.addEventListener('keydown', function(e){
  var a = document.activeElement;
  var editing = a && (a.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName));
  if(e.key === 'Escape'){ document.querySelectorAll('.bk-more.open,.bk-key-wrap.open').forEach(function(m){ m.classList.remove('open'); }); return; }
  if(editing || !(e.ctrlKey || e.metaKey) || String(e.key).toLowerCase() !== 'z') return;
  e.preventDefault(); if(e.shiftKey) redo(); else undo();
});
/* live save status: repaint the chip whenever the sync layer repaints its own status */
setInterval(function(){
  var chip = document.querySelector('#viewport .bk-save'); if(!chip) return;
  var sv = saveStatus(), n = changedCount(), txt = sv[1] + (n ? ' · ' + n + ' changed' : '');
  if(chip.textContent !== txt){ chip.textContent = txt; chip.className = 'bk-save ' + sv[0]; }
  var ub = document.querySelector('#viewport [data-bk-undo]'), rb = document.querySelector('#viewport [data-bk-redo]');
  if(ub){ ub.disabled = !U.stack.length; ub.title = U.stack.length ? 'Undo: ' + U.stack[U.stack.length - 1].label + ' (Ctrl+Z)' : 'Nothing to undo'; } if(rb){ rb.disabled = !U.redo.length; rb.title = U.redo.length ? 'Redo: ' + U.redo[U.redo.length - 1].label + ' (Ctrl+Shift+Z)' : 'Nothing to redo'; }
}, 1000);

window.bkUxRefresh = refreshFlow;
try { decorateRail(); } catch(e){}
})();
