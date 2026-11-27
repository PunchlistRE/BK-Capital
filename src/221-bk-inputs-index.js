/* INPUTS INDEX. One page that answers "what do I still need to enter, and where do I enter it?". It is an index into the model's own input pages, not
   another place to type: it has no input boxes, and every row opens the real box on the real page (the Property editor sub-tab, or the Debt, Deal Underwrite
   ... page that holds it). Nothing here calculates or stores a value.

   Where the rows come from (nothing is listed twice and nothing is invented):
     what the analysis asks for      BKReg.workflow(analysis): its steps and the fields in each (src/139d), with each field's requirement for THIS deal
                                     (BKReg.requirement: required / optional / not applicable, and the step's own condition), so a value-add deal shows the
                                     renovation inputs and a stabilized one lists them under "do not apply";
     whether it is entered           BKReg.present(key, deal), the same test the guide and the readiness check use, so the three cannot disagree;
     where the box is                bkEdFieldIndex() (src/154), read from the editor's own panels; a field kept on another page opens that page (the step's sheet).
   The inputs are grouped as Property, Market, Revenue, Expenses, Debt, Tax, Investors and Returns by the step they belong to (STEP_GROUP below).
   Progressive: the group that still needs something opens first, the optional inputs and those that do not apply to this deal sit behind a fold. */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof bkLoad !== 'function' || !window.BKReg) return;
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }

var GROUPS_ORDER = ['Property', 'Market', 'Revenue', 'Expenses', 'Debt', 'Tax', 'Investors', 'Returns'];
/* the step an input belongs to decides its group; a step this table does not know goes under Property */
var STEP_GROUP = {
  property:'Property', price:'Property', acq:'Property', land:'Property', select:'Property', company:'Property', assets:'Property', overview:'Property', consolidate:'Property',
  market:'Market', caprate:'Market', forward:'Market', value:'Market', values:'Market', valuation:'Market',
  income:'Revenue', vacancy:'Revenue', revenue:'Revenue', inplace:'Revenue', valueadd:'Revenue', mix:'Revenue',
  expenses:'Expenses', capex:'Expenses', capital:'Expenses', reserves:'Expenses', noi:'Expenses', opcf:'Expenses', fcf:'Expenses', ebitda:'Expenses', ops:'Expenses', wc:'Expenses',
  debt:'Debt', proposed:'Debt', financing:'Debt', lender:'Debt', sizing:'Debt', existing:'Debt', debtsched:'Debt', alts:'Debt', refi:'Debt', proceeds:'Debt', su:'Debt',
  tax:'Tax', depr:'Tax', aftertax:'Tax',
  partners:'Investors', investors:'Investors', waterfall:'Investors',
  exit:'Returns', returns:'Returns', period:'Returns', decision:'Returns', sens:'Returns', compare:'Returns', scenarios:'Returns', risk:'Returns', review:'Returns'
};
function groupOf(step, analysisId){ if(step.id === 'costs') return analysisId === 'business' ? 'Expenses' : 'Debt'; return STEP_GROUP[step.id] || 'Property'; }
var RANK = { required:5, needed:4, expected:3, optional:2, na:1 };

/* every input the open deal's analysis asks for, once each, with its state for this deal */
function collect(s){
  var a = window.BKReg.of(s), steps = window.BKReg.workflow(a.id), by = {}, list = [];
  steps.forEach(function(st){
    var stepOn = typeof st.when !== 'function' || safe(function(){ return !!st.when(s); }, true), grp = groupOf(st, a.id);
    (st.fields || []).forEach(function(e){
      var f = window.BKReg.field(e.k); if(!f || f.planned || f.kind === 'derived') return;
      var r = window.BKReg.requirement(e, s); if(!stepOn) r = 'na';
      var depends = e.req === 'conditional' || typeof e.when === 'function' || typeof st.when === 'function';
      var row = by[e.k];
      if(row){ if(RANK[r] > RANK[row.req]){ row.req = r; } row.depends = row.depends || depends; return; }
      row = by[e.k] = { k:e.k, f:f, label:e.label || f.label, help:e.help || f.help || '', req:r, depends:depends, group:grp, sheet:st.sheet, step:st.title, stepId:st.id };
      list.push(row);
    });
  });
  list.forEach(function(r){
    r.present = window.BKReg.present(r.k, s); r.value = window.bkKindFmt ? window.bkKindFmt(r.f, s[r.k]) : null;
    r.status = r.req === 'na' ? 'na' : r.present ? 'entered' : r.req === 'required' ? 'missing' : r.req === 'needed' ? 'needed' : r.req === 'expected' ? 'expected' : 'optional';   /* a value saved for something this deal does not use is listed as not needed, with its value */
    /* a unit-by-unit rent roll with fewer residential rows than units is entered but not finished */
    if(r.k === 'rentRoll' && r.present){ var u = Number(s.units) || 0, n = (s.rentRoll || []).filter(function(x){ return x && x.tenantType !== 'Commercial'; }).length;
      if(u > 0 && n > 0 && n < u){ r.status = 'incomplete'; r.note = n + ' of ' + u + ' units listed'; } }
  });
  return { analysis:a, rows:list };
}

/* where the box is: the editor's own sub-tab when it draws the field, otherwise the page the step names */
var TARGET = {};
function targetOf(r){
  var ix = window.bkEdFieldIndex ? safe(function(){ return window.bkEdFieldIndex(); }, null) : null, e = ix && ix['ae-' + r.k];
  if(e) return { sheet:e.tab, tab:e.tab, sub:e.sub, field:'ae-' + r.k, key:r.k, path:['Property', e.tab, e.subLabel] };
  var sh = r.sheet && RENDERERS[r.sheet] ? r.sheet : 'Deal Underwrite';
  return { sheet:sh, panel:null, field:null, key:r.k, step:r.stepId, path:[sh] };
}
/* the box for an input that is not an editor field: a keyed row (data-bk-key), or any control whose change handler names the key, on the page the step names or the pages that hold the loan, capital and rent-roll boxes */
function locate(k){ var v = document.getElementById('viewport'); if(!v) return null; var K = k.charAt(0).toUpperCase() + k.slice(1); return v.querySelector('#ae-' + k + ', [data-bk-key="' + k + '"], [onchange*="\'' + k + '\'"], [onchange*="Set' + K + '("]'); }   /* the last form is a typed setter (bkSetDebtEnabled for debtEnabled) */
var SEARCH = ['Deal Underwrite', 'Debt', 'Capital Allocation', 'Rent Roll', 'Tenants'];
function flashEl(el){ var box = el.closest('tr, label, div') || el; try { box.scrollIntoView({ block:'center' }); } catch(e){} box.classList.add('bk-ask-flash'); setTimeout(function(){ box.classList.remove('bk-ask-flash'); }, 3200); }
window.bkInputsGo = function(k){
  var go = TARGET[k]; if(!go){ var row = collect(bkLoad()).rows.filter(function(r){ return r.k === k; })[0]; if(row) go = TARGET[k] = targetOf(row); } if(!go) return;
  if(go.field){ if(typeof window.bkAskGo === 'function') window.bkAskGo(go); return; }
  var list = [go.sheet].concat(SEARCH).filter(function(x, i, a){ return RENDERERS[x] && a.indexOf(x) === i; }), i = 0;
  (function next(){
    if(i >= list.length){   /* no page draws it: an input that is only asked in the guide (the plan for the property) opens there, at its step */
      if(typeof window.bkGuideOn === 'function' && typeof window.bkGuideGo === 'function' && go.step){ window.bkGuideOn(); setTimeout(function(){ window.bkGuideGo(go.step); }, 250); } return; }
    showSheet(list[i++]); setTimeout(function(){ var el = locate(k); if(el){ flashEl(el); setTimeout(function(){ var e2 = locate(k), b2 = e2 && (e2.closest('tr, label, div') || e2); if(b2 && !b2.classList.contains('bk-ask-flash')) flashEl(e2); }, 900); } else next(); }, 260);   /* a page that finishes drawing after the first look replaces its rows: highlight again */
  })();
};
window.bkInputsJump = function(g){ var d = document.querySelector('#viewport details[data-ix-g="' + g + '"]'); if(!d) return; d.open = true; try { d.scrollIntoView({ block:'start', behavior:'smooth' }); } catch(e){} };

function chip(status){
  var m = { entered:['pass', 'Entered'], missing:['fail', 'Required'], needed:['warn', 'Needed for investment-ready'], expected:['warn', 'Expected'], incomplete:['warn', 'Incomplete'], optional:['', 'Optional'], na:['', 'Not needed'] }[status];
  return '<span class="status-chip ' + m[0] + '">' + m[1] + '</span>';
}
function rowHtml(r){
  var val = r.present ? esc(r.value || 'Entered') : '<span class="bk-ix-none">Not entered</span>';
  var sub = [r.note, r.help ? String(r.help).split(/(?<=[.!?])\s/)[0] : ''].filter(Boolean).join(' · ');
  if(sub.length > 120) sub = sub.slice(0, 117) + '…';
  return '<tr class="bk-ix-r bk-ix-' + r.status + '" data-ix-k="' + esc(r.k) + '"><td class="rowlabel" data-bk-align="text">' + esc(r.label) + (sub ? '<span class="bk-sub">' + esc(sub) + '</span>' : '') + '</td>'
    + '<td data-bk-align="text">' + val + '</td><td data-bk-align="text">' + chip(r.status) + (r.depends && r.status !== 'na' ? '<span class="bk-ix-dep">depends on your choices</span>' : '') + '</td>'
    + '<td data-bk-align="text">' + (r.status === 'na' ? '<span class="bk-ix-none">not on this deal</span>' : '<button type="button" class="bk-btn" onclick="bkInputsGo(\'' + esc(r.k) + '\')">' + (r.present ? 'Change' : 'Enter') + '</button>') + '</td></tr>';
}
function tableHtml(rows, cap){
  return '<div class="tbl-wrap"><table class="fin bk-ix-t"><caption>' + esc(cap) + '</caption><thead><tr><th class="rowlabel-h">Input</th><th>On this deal</th><th>Status</th><th>Where</th></tr></thead><tbody>' + rows.map(rowHtml).join('') + '</tbody></table></div>';
}
function fold(label, rows, cap){ return rows.length ? '<details class="bk-ix-fold"><summary>' + esc(label) + ' (' + rows.length + ')</summary>' + tableHtml(rows, cap) + '</details>' : ''; }

function page(){
  var s = bkLoad();
  if(typeof window.bkHasActiveDeal === 'function' && !window.bkHasActiveDeal()){
    return { title:'Inputs', crumbs:'Inputs', desc:'Every input the analysis uses, grouped, with what is still missing.', meta:{}, sidebar:'',
      main:'<div class="note-flag"><span>&#9432;</span><div>There is no open deal. Start one with <b>New analysis</b> on the bar above and this page lists what to enter.</div></div>' };
  }
  var c = collect(s), rows = c.rows, byG = {}; GROUPS_ORDER.forEach(function(g){ byG[g] = []; }); rows.forEach(function(r){ byG[r.group].push(r); });
  TARGET = {}; rows.forEach(function(r){ TARGET[r.k] = targetOf(r); });
  var need = rows.filter(function(r){ return r.req === 'required'; }), done = need.filter(function(r){ return r.present; });
  var needInv = rows.filter(function(r){ return r.status === 'needed'; }), expMiss = rows.filter(function(r){ return r.status === 'expected'; });
  var pctDone = need.length ? Math.round(done.length / need.length * 100) : 100;
  var firstMiss = null; GROUPS_ORDER.forEach(function(g){ if(!firstMiss) firstMiss = byG[g].filter(function(r){ return r.status === 'missing'; })[0] || null; });
  var firstAny = firstMiss; if(!firstAny) GROUPS_ORDER.forEach(function(g){ if(!firstAny) firstAny = byG[g].filter(function(r){ return r.status === 'needed' || r.status === 'expected'; })[0] || null; });
  var openG = firstAny ? firstAny.group : null;
  /* the model's own gate: what it needs before it will show results (the readiness check, src/081). It is a shorter list than the analysis asks for, so it is shown on its own rather than folded into the counts. */
  var rd = safe(function(){ return window.bkDealReadiness(); }, null), ALIAS = { dealId:'name', revenue:'avgRent' };
  var gate = rd && rd.canCalculate === false && rd.missing && rd.missing.length ? rd.missing.map(function(m){ var k = ALIAS[m.key] || m.key; return { label:m.label, k:TARGET[k] ? k : null }; }) : [];
  var top = '<div class="bk-ix-top"><div class="bk-ix-sum"><b>' + done.length + ' of ' + need.length + '</b> required inputs are entered' + (needInv.length ? ', ' + needInv.length + ' more needed to be investment-ready' : '') + (expMiss.length ? ', ' + expMiss.length + ' expected input' + (expMiss.length === 1 ? '' : 's') + ' not entered' : '') + '.'+ (firstMiss ? ' Next: <b>' + esc(firstMiss.label) + '</b> <button type="button" class="bk-btn" onclick="bkInputsGo(\'' + esc(firstMiss.k) + '\')">Enter it</button>' : firstAny ? ' Next: <b>' + esc(firstAny.label) + '</b> <button type="button" class="bk-btn" onclick="bkInputsGo(\'' + esc(firstAny.k) + '\')">Enter it</button>' : ' Everything the model asks for is in.') + '</div>'
    + '<div class="bk-ix-bar" role="img" aria-label="' + pctDone + ' percent of the required inputs are entered"><i style="width:' + pctDone + '%"></i></div><div class="bk-ix-chips">'
    + GROUPS_ORDER.filter(function(g){ return byG[g].length; }).map(function(g){ var miss = byG[g].filter(function(r){ return r.status === 'missing'; }).length, soft = byG[g].filter(function(r){ return r.status === 'needed' || r.status === 'expected'; }).length;
        return '<button type="button" class="bk-ix-chip' + (miss ? ' has' : '') + '" onclick="bkInputsJump(\'' + g + '\')">' + g + (miss ? ' <em>' + miss + ' required</em>' : soft ? ' <em class="soft">' + soft + ' to add</em>' : '') + '</button>'; }).join('') + '</div></div>';
  var gateHtml = gate.length ? '<div class="note-flag bk-ix-gate"><span>&#9888;</span><div><b>Results are withheld until ' + gate.length + (gate.length === 1 ? ' input is' : ' inputs are') + ' entered:</b> '
    + gate.map(function(g){ return g.k ? '<button type="button" class="bk-ix-link" onclick="bkInputsGo(\'' + esc(g.k) + '\')">' + esc(g.label) + '</button>' : esc(g.label); }).join(', ') + '.</div></div>' : '';
  /* expected inputs not entered, most material first (BKReg.expectedMissing): the model shows results without them, but states what a blank line does to the numbers */
  var xm = safe(function(){ return window.BKReg.expectedMissing(s); }, []) || [];
  var expHtml = xm.length ? '<div class="note-flag bk-ix-gate"><span>&#9888;</span><div><b>Expected inputs not entered, most material first.</b> The model shows results without them, but ' + xm.map(function(m){ return '<div class="bk-ix-xrow"><button type="button" class="bk-ix-link" onclick="bkInputsGo(\'' + esc(m.key) + '\')">' + esc(String(m.label).replace(/,.*$/, '')) + '</button>: ' + esc(m.effect) + '.</div>'; }).join('').replace(/^/, '') + '</div></div>' : '';
  var body = GROUPS_ORDER.filter(function(g){ return byG[g].length; }).map(function(g){
    var gr = byG[g], req = gr.filter(function(r){ return r.req === 'required'; }), miss = gr.filter(function(r){ return r.status === 'missing'; }), inc = gr.filter(function(r){ return r.status === 'incomplete'; });
    var main = gr.filter(function(r){ return r.req === 'required' || r.req === 'needed' || r.req === 'expected' || (r.present && r.req !== 'na'); }).sort(function(a, b){ var o = { missing:0, needed:1, expected:2, incomplete:3, entered:4, optional:5, na:6 }; return o[a.status] - o[b.status]; });
    var opt = gr.filter(function(r){ return r.req === 'optional' && !r.present; }), na = gr.filter(function(r){ return r.req === 'na'; });
    var softN = gr.filter(function(r){ return r.status === 'needed'; }).length, expN = gr.filter(function(r){ return r.status === 'expected'; }).length;
    var state = miss.length ? '<span class="status-chip fail">' + miss.length + ' required</span>' : softN ? '<span class="status-chip warn">' + softN + ' needed for investment-ready</span>' : expN ? '<span class="status-chip warn">' + expN + ' expected</span>' : inc.length ? '<span class="status-chip warn">Incomplete</span>' : req.length ? '<span class="status-chip pass">Complete</span>' : '<span class="status-chip">Nothing required</span>';
    var enteredN = gr.filter(function(r){ return r.present; }).length;
    return '<details class="bk-ix-g" data-ix-g="' + g + '"' + (g === openG ? ' open' : '') + '><summary><span class="bk-ix-gn">' + g + '</span>' + state + '<span class="bk-ix-gc">' + enteredN + ' of ' + gr.length + ' entered</span></summary>'
      + (main.length ? tableHtml(main, g + ': required and entered inputs') : '')
      + fold('Optional inputs you can add', opt, g + ': optional inputs') + fold('Do not apply to this deal', na, g + ': not needed with the current choices') + '</details>';
  }).join('');
  var note = '<div class="note-flag bk-ix-note"><span>&#9432;</span><div>This page lists inputs; it does not take them. <b>Enter</b> and <b>Change</b> open the box on its own page, with the box highlighted. '
    + 'An input marked <i>depends on your choices</i> appears or disappears with the deal structure (the strategy, the loan type, whether there is commercial space). The values here are the deal as it is saved.</div></div>';
  return { title:'Inputs', crumbs:'Inputs', desc:'Every input this analysis uses, grouped, with what is entered, what is still needed and where to enter it.',
    meta:{ Analysis:String(c.analysis.name || c.analysis.id), Required:done.length + ' of ' + need.length }, sidebar:'', main:top + gateHtml + expHtml + body + note };
}
window.bkInputsIndex = function(){ var s = bkLoad(); return collect(s); };   /* the data behind the page, for the tests and for search */
if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Inputs Index', page); else RENDERERS['Inputs Index'] = page;
})();
