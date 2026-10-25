
/* ===========================================================================
   UX / WORKFLOW LAYER
   ---------------------------------------------------------------------------
   1. Workflow stepper (Setup > Inputs > Operations > Debt > Returns > Review)
      with live completion status, previous/next step buttons, and an
      "Advanced" area for Monthly Engine, Portfolio Database and - on
      acquisitions - Development.
   2. Deal snapshot card replaces the photo placeholder; the colour key is a
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
    var basis = Number(d.basis) || 0;
    return { c:c, s:s, levIRR:x.irr, levMOIC:x.moic, unlevIRR:x.u ? x.u.irr : NaN, unlevMOIC:x.u ? x.u.moic : NaN,
      lpIRR:w ? w.lpIRR : NaN, gpIRR:w ? w.gpIRR : NaN, lpMOIC:w ? w.lp.moic : NaN, gpMOIC:w ? w.gp.moic : NaN,
      loan:d.loan, binding:d.binding, equity:d.equity, dscr:d.dscr, yoc: basis ? calc.noi/basis : NaN,
      profit:(x.dist||0) - (x.contrib||0), peak:Number(d.equity) + Number(s.rateCapCost || 0), noi:calc.noi };
  });
}

/* ---------------------------------------------------------------- 1. workflow */
var STEPS = [
  { id:'setup', label:'Setup',      sheets:['Home'] },
  { id:'inputs', label:'Inputs',    sheets:['Deal Underwrite','Rent Roll','Source Ingestion','Depreciation','Source Data'] },
  { id:'ops', label:'Operations',   sheets:['Operating Underwrite','Property CF'] },
  { id:'debt', label:'Debt',        sheets:['Debt','Debt Schedule','Covenant Monitor'] },
  { id:'returns', label:'Returns',  sheets:['Returns','Equity Waterfall','After-Tax'] },
  { id:'review', label:'Review',    sheets:['Sensitivity','Reverse Solve','QA'] }
];
function stepOf(sheet){ for(var i = 0; i < STEPS.length; i++) if(STEPS[i].sheets.indexOf(sheet) > -1) return i; return -1; }
function stepStatus(){
  var r = readiness(), out = {};
  if(!r || r.state === 'NO DEAL'){ STEPS.forEach(function(st){ out[st.id] = { st:'', tip:'No deal loaded' }; }); return out; }
  var s = bkLoad();
  var idMiss = r.missing.filter(function(m){ return m.group === 'Identity'; });
  out.setup = idMiss.length ? { st:'warn', tip:'Missing: ' + idMiss.map(function(m){ return m.label; }).join(', ') } : { st:'done', tip:'Deal identity complete' };
  out.inputs = r.missing.length ? { st:'warn', tip:r.missing.length + ' required input' + (r.missing.length > 1 ? 's' : '') + ' missing' } : { st:'done', tip:'All required inputs entered' };
  var noi = NaN; try { noi = bkCalc().noi; } catch(e){}
  out.ops = (r.canCalculate && isFinite(noi)) ? (noi > 0 ? { st:'done', tip:'Year-1 NOI ' + money(noi) } : { st:'warn', tip:'Year-1 NOI is not positive' }) : { st:'', tip:'Needs complete inputs' };
  var debtMiss = r.investMissing.some(function(m){ return m.key === 'debt'; });
  var gate = null, pol = {}, ctls = [];
  if(r.canCalculate){
    if(!isDev(s)){ try { gate = window.bkDealGatePeek ? window.bkDealGatePeek() : null; } catch(e){}
      if(!gate && window.bkDealGate && !stepStatus.__pending){ stepStatus.__pending = true; setTimeout(function(){ stepStatus.__pending = false; try { window.bkDealGate(); } catch(e){} patchSteps(); }, 60); } }
    try { pol = window.bkPolicy ? window.bkPolicy() : {}; } catch(e){} try { ctls = window.bkModelControls ? window.bkModelControls() : []; } catch(e){} }
  var over = gate && gate.capacity && gate.capacity.overage > 0 ? gate.capacity.overage : 0;
  out.debt = !r.canCalculate ? { st:'', tip:'Needs complete inputs' } : debtMiss ? { st:'warn', tip:'Debt rate / amortisation missing' } : over ? { st:'warn', tip:'Loan is ' + money(over) + ' above what policy supports' } : { st:'done', tip:s.debtEnabled === false ? 'Unlevered (debt off)' : 'Loan sized, within policy' };
  var irr = NaN; if(r.canCalculate){ try { irr = bkMonthlyReturns().irr; } catch(e){} }
  var hur = Number(pol.targetIRR) || 0;
  out.returns = !r.canCalculate ? { st:'', tip:'Results withheld until inputs are complete' } : !isFinite(irr) ? { st:'warn', tip:'Levered IRR not finite' } : (hur && irr < hur) ? { st:'warn', tip:'Levered IRR ' + pct(irr) + ' is below the ' + pct(hur) + ' hurdle' } : { st:'done', tip:'Levered IRR ' + pct(irr) };
  var nFail = ctls.filter(function(c){ return c.level === 'FAIL'; }).length;
  out.review = nFail ? { st:'fail', tip:nFail + ' model error' + (nFail > 1 ? 's' : '') + ' to fix' }
             : (gate && gate.verdict === 'DECLINE') ? { st:'fail', tip:'Credit gate: ' + String(gate.status || 'decline') }
             : r.state === 'INVESTMENT READY' && !r.sourceReview ? { st:'done', tip:'Investment ready' }
             : r.state === 'NOT DECISION-GRADE' || r.sourceReview || r.state === 'BLOCKED' ? { st:'warn', tip:r.state + (r.sourceReview ? ' - source review' : '') }
             : { st:'', tip:r.state };
  return out;
}
/* the credit gate takes about half a second, so a render shows the step bar from what is already known and this refreshes it once the gate has been worked out */
function patchSteps(){
  var st = stepStatus();
  [].forEach.call(document.querySelectorAll('.bk-step'), function(btn){ var i = +btn.getAttribute('data-bk-step'), x = STEPS[i]; if(!x) return; var o = st[x.id] || {}, cur = btn.classList.contains('cur');
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
  var steps = STEPS.map(function(x, i){
    var o = st[x.id] || {}, cls = (o.st || '') + (i === si ? ' cur' : '');
    var mark = o.st === 'done' ? '✓' : o.st === 'fail' ? '✕' : o.st === 'warn' ? '!' : String(i + 1);
    return (i ? '<span class="bk-step-sep"></span>' : '') + '<button type="button" class="bk-step ' + cls + '" data-bk-step="' + i + '" title="' + esc(o.tip || '') + '"><span class="n">' + mark + '</span>' + x.label + '</button>';
  }).join('');
  var c = String(s.scenarioCase || 'Base');
  var caseCtl = hasDeal() ? '<span class="bk-case" title="Analysis case for Operating Underwrite, Property CF, Debt, Debt Schedule, Covenant Monitor, Returns and Equity Waterfall. Edit the case deltas on Sensitivity or Deal Underwrite.">Case <span class="bk-seg">'
    + ['Downside','Base','Upside'].map(function(n){ return '<button type="button" data-bk-case="' + n + '" aria-pressed="' + (c === n) + '">' + n + '</button>'; }).join('') + '</span></span>' : '';
  var sv = saveStatus(), changed = changedCount();
  var undo = hasDeal() ? '<button type="button" class="bk-btn" data-bk-undo="1" title="Undo last change (Ctrl+Z)"' + (U.stack.length ? '' : ' disabled') + '>&#8630; Undo</button>'
    + '<button type="button" class="bk-btn" data-bk-redo="1" title="Redo (Ctrl+Shift+Z)"' + (U.redo.length ? '' : ' disabled') + '>&#8631;</button>' : '';
  return '<div class="bk-flow"><button type="button" class="bk-btn bk-menu-btn" data-bk-menu="1">&#9776; Sheets</button><div class="bk-steps" role="navigation" aria-label="Underwriting workflow">' + steps + '</div>'
    + '<div class="bk-flow-right">' + caseCtl + '<span class="bk-save ' + sv[0] + '" title="' + (changed ? changed + ' field' + (changed > 1 ? 's' : '') + ' changed this session' : 'No changes this session') + '">' + esc(sv[1]) + (changed ? ' · ' + changed + ' changed' : '') + '</span>' + undo + '</div></div>';
}
function stepNav(sheet){
  var si = stepOf(sheet); if(si < 0) return '';
  var prev = si > 0 ? STEPS[si-1] : null, next = si < STEPS.length - 1 ? STEPS[si+1] : null;
  // within a step, "next" walks the step's own sheets first
  var inStep = STEPS[si].sheets.filter(function(x){ return RENDERERS[x]; }), k = inStep.indexOf(sheet);
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
  var head = '<div class="card bk-snap"><div class="card-head">Deal Snapshot' + (String(s.scenarioCase || 'Base') !== 'Base' ? '<span class="bk-snap-case">' + esc(String(s.scenarioCase).toUpperCase()) + ' CASE</span>' : '') + '</div>';
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
    if(tb && !tb.querySelector('.bk-key-wrap')) tb.insertAdjacentHTML('beforeend', '<div class="bk-key-wrap"><button type="button" class="bk-btn" data-bk-key-toggle="1" aria-expanded="false">Colour key</button><div class="bk-key-pop">' + keyHtml + '</div></div>');
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
var REQ_KEYS = { size:'units', revenue:'avgRent' };
function decorateUnderwrite(frame){
  var main = frame.querySelector('.main-col'); if(!main || main.querySelector('.bk-dui')) return;
  var r = readiness(); if(!r || r.state === 'NO DEAL') return;
  var missKeys = r.missing.map(function(m){ return REQ_KEYS[m.key] || m.key; });
  main.querySelectorAll('tr[data-bk-key]').forEach(function(tr){ tr.classList.toggle('bk-req-missing', missKeys.indexOf(tr.getAttribute('data-bk-key')) > -1); });
  var total = r.missing.length + r.met.length, done = r.met.length;
  var req = '<div class="bk-req"><b>Required inputs: ' + done + ' of ' + total + '</b><span class="bar"><i style="width:' + (total ? Math.round(done/total*100) : 0) + '%"></i></span>'
    + (r.missing.length ? '<span>Missing:</span>' + r.missing.map(function(m){ return '<button type="button" data-bk-jump-key="' + esc(REQ_KEYS[m.key] || m.key) + '">' + esc(m.label) + '</button>'; }).join('')
                         : '<span style="color:#1F7A45;font-weight:600">All required inputs entered</span>') + '</div>';
  var caps = [];
  main.querySelectorAll('.tbl-wrap').forEach(function(w, i){
    var cap = w.querySelector('caption'); if(!cap) return;
    var id = 'bk-du-' + i; w.id = id;
    var miss = !!w.querySelector('tr.bk-req-missing');
    caps.push('<button type="button" data-bk-jump="' + id + '" class="' + (miss ? 'miss' : '') + '">' + esc(cap.textContent.replace(/\s+-\s+.*$/, '').trim()) + '</button>');
  });
  main.insertAdjacentHTML('afterbegin', '<div class="bk-dui" role="navigation" aria-label="Deal Underwrite sections">' + caps.join('') + '</div>' + req);
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

/* ---------------------------------------------------------------- 6. save / undo */
var U = { stack:[], redo:[], baseline:null, busy:false, rendering:0 };
function dealKey(){ try { var s = bkLoad(); return String(s.dealId || s.name || ''); } catch(e){ return ''; } }
function storeKey(){ return (typeof BK_STORE !== 'undefined') ? BK_STORE : 'bkcapital.cre.v02'; }
function rawDeal(){ try { return localStorage.getItem(storeKey()); } catch(e){ return null; } }
function ensureBaseline(){
  if(!hasDeal()) return;
  var k = dealKey();
  if(!U.baseline || U.baseline.id !== k){ U.baseline = { id:k, s:bkLoad() }; U.stack = []; U.redo = []; }
}
function changedCount(){
  if(!hasDeal() || !U.baseline || U.baseline.id !== dealKey()) return 0;
  var a = U.baseline.s, b = bkLoad(), n = 0;
  Object.keys(Object.assign({}, a, b)).forEach(function(k){ if(k.charAt(0) !== '_' && JSON.stringify(a[k]) !== JSON.stringify(b[k])) n++; });
  return n;
}
var innerSave = window.bkSave;
function trackedSave(d){
  var before = rawDeal(), out = innerSave.apply(this, arguments), after = rawDeal();
  if(after === before) return out;
  if(U.rendering){
    /* a renderer filling a missing default is not a user edit: no undo step, and a field that
       was blank in the session baseline takes the filled value so it is not reported as changed */
    if(U.baseline && U.baseline.id === dealKey()){ var now = bkLoad(), b = U.baseline.s;
      Object.keys(now).forEach(function(k){ if(b[k] === undefined) b[k] = now[k]; }); }
    return out;
  }
  if(!U.busy && before !== null){ U.stack.push(before); if(U.stack.length > 50) U.stack.shift(); U.redo = []; }
  return out;
}
window.bkSave = trackedSave;
function restore(raw){
  if(raw == null) return;
  U.busy = true;
  try { innerSave(JSON.parse(raw)); } finally { U.busy = false; }
  rerender();
}
function undo(){ if(!U.stack.length) return; var now = rawDeal(); var prev = U.stack.pop(); U.redo.push(now); restore(prev); }
function redo(){ if(!U.redo.length) return; var now = rawDeal(); var nxt = U.redo.pop(); U.stack.push(now); restore(nxt); }
window.bkUndo = undo; window.bkRedo = redo;

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
  if((el = t.closest('[data-bk-step]'))){ var st = STEPS[+el.getAttribute('data-bk-step')]; var first = st.sheets.find(function(x){ return RENDERERS[x]; }); if(first) showSheet(first); return; }
  if((el = t.closest('[data-goto-sheet2]'))){ showSheet(el.getAttribute('data-goto-sheet2')); window.scrollTo(0, 0); return; }
  if((el = t.closest('[data-bk-case]'))){ var s = bkLoad(), c = el.getAttribute('data-bk-case'); if(String(s.scenarioCase || 'Base') !== c){ s.scenarioCase = c; bkSave(s); } rerender(); return; }
  if((el = t.closest('[data-bk-undo]'))){ undo(); return; }
  if((el = t.closest('[data-bk-redo]'))){ redo(); return; }
  if((el = t.closest('[data-bk-menu]'))){ var rail = document.getElementById('rail'); if(rail) rail.classList.toggle('open'); return; }
  if((el = t.closest('[data-bk-key-toggle]'))){ var w = el.closest('.bk-key-wrap'); var o = w.classList.toggle('open'); el.setAttribute('aria-expanded', String(o)); return; }
  if((el = t.closest('[data-bk-more]'))){ var mw = el.closest('.bk-more'), pop = mw.querySelector('.bk-more-pop'), rc = el.getBoundingClientRect();
    /* the nav strip scrolls horizontally, so the menu is positioned against the window to avoid being clipped */
    pop.style.position = 'fixed'; pop.style.top = (rc.bottom + 4) + 'px'; pop.style.left = Math.max(8, Math.min(rc.left, window.innerWidth - 236)) + 'px'; pop.style.right = 'auto';
    mw.classList.toggle('open'); return; }
  if((el = t.closest('[data-bk-more-group]'))){ var g = GROUPS.find(function(x){ return x.id === el.getAttribute('data-bk-more-group'); }); if(g) showSheet(g.sheets[0]); return; }
  if((el = t.closest('[data-bk-jump]'))){ var tgt = document.getElementById(el.getAttribute('data-bk-jump')); if(tgt){ tgt.scrollIntoView({ behavior:'smooth', block:'start' }); } return; }
  if((el = t.closest('[data-bk-jump-key]'))){ var row = document.querySelector('#viewport tr[data-bk-key="' + el.getAttribute('data-bk-jump-key') + '"]');
    if(row){ row.scrollIntoView({ behavior:'smooth', block:'center' }); row.classList.add('bk-flash'); setTimeout(function(){ row.classList.remove('bk-flash'); }, 1700);
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
  if(editing || !(e.ctrlKey || e.metaKey) || String(e.key).toLowerCase() !== 'z' || !hasDeal()) return;
  e.preventDefault(); if(e.shiftKey) redo(); else undo();
});
/* live save status: repaint the chip whenever the sync layer repaints its own status */
setInterval(function(){
  var chip = document.querySelector('#viewport .bk-save'); if(!chip) return;
  var sv = saveStatus(), n = changedCount(), txt = sv[1] + (n ? ' · ' + n + ' changed' : '');
  if(chip.textContent !== txt){ chip.textContent = txt; chip.className = 'bk-save ' + sv[0]; }
  var ub = document.querySelector('#viewport [data-bk-undo]'), rb = document.querySelector('#viewport [data-bk-redo]');
  if(ub) ub.disabled = !U.stack.length; if(rb) rb.disabled = !U.redo.length;
}, 1000);

window.bkUxRefresh = refreshFlow;
try { decorateRail(); } catch(e){}
})();
