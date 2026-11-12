/* ===========================================================================
   DEVELOPMENT SCHEDULE AS A GANTT. Tasks with a start and a duration in months, overlaps, and finish-to-start dependencies with a lead or lag. A forward and a
   backward pass give each task its earliest and latest dates, its float and whether it is on the critical path. The critical path runs to stabilization:
   the construction tasks feed the certificate of occupancy, lease-up follows it, and stabilized operations follow lease-up.
   What the engine supports, the schedule drives: the first construction task's start sets the pre-development months, and the span of the construction tasks
   sets the construction months, so the draw curves, the construction facility, the certificate of occupancy and the lease-up all move with the tasks. The lease-up
   period itself still comes from the lease-up method (simple ramp or unit types), so it is shown as a linked row, not edited here.
   Until a schedule is switched on nothing changes: the chart is drawn from the engine's own phases. Switching it on seeds tasks that reproduce the phases exactly.
   Tasks can be grouped under SUMMARY tasks (a work breakdown, nested to any depth). A summary has no dates of its own: it takes the earliest start and the latest finish of the tasks inside it, its cost is the budget lines tied to
   them and its % complete is weighted by cost. It adds no logic, so the critical path, the construction months, the draws and the returns all come from the tasks and grouping moves no number. % complete is for tracking only.
   =========================================================================== */
(function(){
'use strict';
if(typeof bkLoad !== 'function' || typeof RENDERERS === 'undefined') return;
function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
function has(v){ return v !== null && v !== undefined && v !== '' && isFinite(Number(v)); }
function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function isDev(s){ return /develop/i.test(String((s && s.dealType) || '')); }
function cur(){ return typeof currentSheet !== 'undefined' ? currentSheet : 'Dev Schedule'; }
var GROUPS = [['predev', 'Pre-development'], ['construction', 'Construction'], ['other', 'Other']];

window.bkDevGanttOn = function(s){ s = s || bkLoad(); var g = s && s.devGantt; return !!(s && isDev(s) && g && g.mode === 'tasks' && Array.isArray(g.tasks) && g.tasks.length); };

function startDate(s){ return (typeof bkParseDealDate === 'function') ? bkParseDealDate(s.closing, '2027-01-01') : new Date(); }
function monthStart(s, m){ var d = startDate(s); return new Date(d.getFullYear(), d.getMonth() + (m - 1), 1); }
function monthEnd(s, m){ var d = startDate(s); return new Date(d.getFullYear(), d.getMonth() + m, 0); }
function fmtD(d){ return d.toLocaleDateString('en-US', { month:'short', year:'numeric' }); }

/* ------------------------------------------------------------------ the schedule (critical path method) ------------------------------------------------------------------ */
/* A task is a leaf (it has dates and a duration of its own) or a SUMMARY task, a heading in the work breakdown that takes its dates from the tasks inside it (task.parent names the summary a task sits in; task.pct is its percent complete, 0 to 100,
   for tracking only). A summary carries no schedule logic: the critical path, the construction months and the draws come from the leaf tasks, so grouping tasks moves no number. */
function normTasks(g){ return (g.tasks || []).map(function(t, i){ var sm = !!t.summary; return { id:String(t.id || ('t' + (i + 1))), name:String(t.name || (sm ? 'Summary ' : 'Task ') + (i + 1)), group:t.group === 'predev' || t.group === 'other' ? t.group : 'construction', summary:sm, auto:sm && t.auto ? String(t.auto) : '', parent:t.parent ? String(t.parent) : '', pct:!sm && has(t.pct) ? Math.min(100, Math.max(0, num(t.pct))) : null, ignoredPreds:sm && Array.isArray(t.preds) ? t.preds.length : 0, start:!sm && has(t.start) && num(t.start) >= 1 ? Math.round(num(t.start)) : null, dur:Math.max(1, Math.round(num(t.dur) || 1)), milestone:!sm && !!t.milestone, preds:sm ? [] : (Array.isArray(t.preds) ? t.preds : []).map(function(p){ return { id:String(p.id), lag:Math.round(num(p.lag)) }; }) }; }); }

/* Forward and backward pass over the task network. Months are 1-based and inclusive: a task that starts in month 4 with a 3-month duration finishes in month 6, and a
   finish-to-start successor with no lag starts in month 7 (a negative lag overlaps it with its predecessor). */
window.bkDevGanttSchedule = function(s, ov){
  s = s || bkLoad(); var g = s.devGantt || {}, A = normTasks(g), byId = {}, warnings = [];
  A.forEach(function(t){ byId[t.id] = t; });
  /* the work breakdown: a task sits in a summary task that is on the schedule, and the chain of summaries must not loop; anything else is shown at the top level */
  A.forEach(function(t){ t.parentEff = ''; if(!t.parent) return; var p = byId[t.parent];
    if(!p || p === t){ warnings.push(t.name + ': the summary task it sits in is not on the schedule, so it is shown at the top level.'); return; }
    if(!p.summary){ warnings.push(t.name + ': ' + p.name + ' is not a summary task, so it is shown at the top level.'); return; }
    t.parentEff = p.id; });
  A.forEach(function(t){ var seen = {}, c = t; while(c && c.parentEff){ seen[c.id] = 1; var nx = byId[c.parentEff]; if(!nx) break; if(seen[nx.id]){ warnings.push(c.name + ': summary tasks sit inside each other in a loop, so it is shown at the top level.'); c.parentEff = ''; break; } c = nx; } });
  A.forEach(function(t){ t.kids = []; t.anc = []; t.depth = 0; });
  A.forEach(function(t){ if(t.parentEff) byId[t.parentEff].kids.push(t); });
  A.forEach(function(t){ var c = t; while(c.parentEff){ t.anc.push(c.parentEff); t.depth++; c = byId[c.parentEff]; } });
  var leavesOf = function(t, acc){ acc = acc || []; if(!t.summary) acc.push(t); else t.kids.forEach(function(k){ leavesOf(k, acc); }); return acc; };
  A.forEach(function(t){ if(t.summary && t.ignoredPreds) warnings.push(t.name + ': a summary task takes its dates from the tasks inside it, so the predecessors on it were ignored.'); });
  /* the schedule itself runs over the leaf tasks only */
  var T = A.filter(function(t){ return !t.summary; });
  T.forEach(function(t){ t.preds = t.preds.filter(function(p){ if(!byId[p.id] || p.id === t.id){ warnings.push(t.name + ': a predecessor that does not exist was ignored.'); return false; } return true; }); t.succ = []; t.cp = []; });
  /* a predecessor that is a summary task means "after the last task inside it finishes": the link goes to every task inside it, with the same lead or lag */
  T.forEach(function(t){ t.preds.forEach(function(p){ var q = byId[p.id]; if(!q.summary){ t.cp.push(p); return; }
    var inside = leavesOf(q); if(!inside.length){ warnings.push(t.name + ': ' + q.name + ' has no tasks inside it yet, so that predecessor was ignored.'); return; }
    if(inside.indexOf(t) >= 0){ warnings.push(t.name + ': it cannot follow ' + q.name + ', the summary task it sits in.'); return; }
    inside.forEach(function(l){ t.cp.push({ id:l.id, lag:p.lag }); }); }); });
  T.forEach(function(t){ t.cp.forEach(function(p){ byId[p.id].succ.push({ id:t.id, lag:p.lag }); }); });
  /* forward pass, in dependency order (a cycle is reported and its tasks keep their manual starts) */
  var state = {}, order = [], cycle = false;
  (function visit(){ var tmp = {}; function dfs(t){ if(state[t.id] === 2) return; if(state[t.id] === 1){ cycle = true; return; } state[t.id] = 1; t.cp.forEach(function(p){ dfs(byId[p.id]); }); state[t.id] = 2; order.push(t); } T.forEach(dfs); })();
  if(cycle) warnings.push('The dependencies form a loop, so the schedule cannot be ordered. Remove one of them.');
  order.forEach(function(t){ var es = t.start || 1; if(!cycle) t.cp.forEach(function(p){ var q = byId[p.id]; if(q.EF !== undefined) es = Math.max(es, q.EF + 1 + p.lag); }); t.ES = Math.max(1, es); t.EF = t.ES + t.dur - 1; });
  T.forEach(function(t){ if(t.ES === undefined){ t.ES = t.start || 1; t.EF = t.ES + t.dur - 1; } });
  var cons = T.filter(function(t){ return t.group === 'construction'; }), pre = T.filter(function(t){ return t.group === 'predev'; });
  var conStart = cons.length ? Math.min.apply(null, cons.map(function(t){ return t.ES; })) : null, conEnd = cons.length ? Math.max.apply(null, cons.map(function(t){ return t.EF; })) : null;
  var x = ov || (typeof bkDevV09 === 'function' ? bkDevV09() : { luMo:0, hold:60 });
  var preMo = cons.length ? Math.max(0, conStart - 1) : num(x.preMo), conMo = cons.length ? conEnd - conStart + 1 : num(x.conMo), co = cons.length ? conEnd : num(x.co), luMo = num(x.luMo), stab = co + luMo, hold = Math.max(1, Math.round(num(x.hold) || num(s.holdYears) * 12));
  if(cons.length && pre.some(function(t){ return t.EF >= conStart; }) && false) warnings.push('');
  if(stab > hold) warnings.push('Stabilization (month ' + stab + ') falls after the end of the analysis (month ' + hold + '). Lengthen the hold or shorten the schedule.');
  /* backward pass to stabilization: construction tasks must finish by the certificate of occupancy; pre-development tasks without a successor must finish before construction starts */
  var finish = Math.max(co + luMo, T.reduce(function(a, t){ return Math.max(a, t.EF); }, 0)), project = cons.length ? co : finish;
  var LF = {}, LS = {};
  (function(){ var rev = order.slice().reverse(); rev.forEach(function(t){ var lf = Infinity; t.succ.forEach(function(sc){ if(LS[sc.id] !== undefined) lf = Math.min(lf, LS[sc.id] - 1 - sc.lag); });
    if(lf === Infinity) lf = t.group === 'construction' ? project : t.group === 'predev' ? (cons.length ? conStart - 1 : project) : t.EF;
    LF[t.id] = lf; LS[t.id] = lf - t.dur + 1; }); })();
  T.forEach(function(t){ t.LF = LF[t.id] !== undefined ? LF[t.id] : t.EF; t.LS = LS[t.id] !== undefined ? LS[t.id] : t.ES; t.float = t.LS - t.ES; t.critical = Math.abs(t.float) < 1e-9 && (t.group === 'construction' || t.succ.length > 0 || t.group === 'predev'); });
  /* only tasks that actually drive the end of construction (or the start of it) are on the critical path: a zero-float task with no relation to either is just on time */
  T.forEach(function(t){ if(t.critical && t.group === 'other' && !t.succ.length) t.critical = false; });
  /* summary tasks roll up from the tasks inside them: the earliest start, the latest finish, the months between. They have no float of their own and are never "critical" (critDesc says a task inside them is). */
  A.forEach(function(t){ if(!t.summary) return; var inside = leavesOf(t); t.leaves = inside; t.float = 0; t.critical = false;
    if(!inside.length){ t.ES = t.EF = null; t.dur = 0; t.empty = true; t.critDesc = false; return; }
    t.ES = Math.min.apply(null, inside.map(function(k){ return k.ES; })); t.EF = Math.max.apply(null, inside.map(function(k){ return k.EF; })); t.dur = t.EF - t.ES + 1; t.critDesc = inside.some(function(k){ return k.critical; });
    var gs = {}; inside.forEach(function(k){ gs[k.group] = 1; }); var gl = Object.keys(gs), pn = { predev:'Pre-development', construction:'Construction', other:'Other' };
    if(gl.length > 1 || gl[0] !== t.group) warnings.push(t.name + ' is listed under ' + pn[t.group] + ' but holds ' + gl.map(function(q){ return pn[q]; }).join(' and ') + ' tasks. Each task keeps its own phase; change the summary\'s phase to list it elsewhere.'); });
  A.forEach(function(t){ if(t.ES == null){ t.startDate = t.endDate = null; return; } t.startDate = monthStart(s, t.ES); t.endDate = monthEnd(s, t.EF); });
  return { tasks:A, conStart:conStart, conEnd:conEnd, preMo:preMo, conMo:conMo, co:co, luMo:luMo, stab:stab, hold:hold, project:project, cycle:cycle, warnings:warnings, hasConstruction:cons.length > 0 };
};

/* the engine's pre-development and construction months follow the schedule (written to the deal's own fields, so every consumer sees the same numbers) */
window.bkDevGanttSync = function(s){
  if(!window.bkDevGanttOn(s)) return s; var sc = window.bkDevGanttSchedule(s, { luMo:0, hold:60, preMo:num(s.predevMonths), conMo:num(s.constructionMonths), co:num(s.predevMonths) + num(s.constructionMonths) });
  if(sc.hasConstruction && !sc.cycle){ s.predevMonths = sc.preMo; s.constructionMonths = sc.conMo; } return s;
};

/* ------------------------------------------------------------------ editing ------------------------------------------------------------------ */
function save(s){ window.bkDevGanttSync(s); bkSave(s); if(typeof showSheet === 'function') showSheet(cur()); }
function nextId(T){ var k = T.length + 1; while(T.some(function(t){ return t.id === 't' + k; })) k++; return 't' + k; }
function parsePreds(raw, T, selfId){
  var out = [], txt = String(raw == null ? '' : raw).trim(); if(!txt) return out;
  txt.split(/[,;]/).forEach(function(part){ var m = /^\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*$/.exec(part); if(!m) return; var row = Number(m[1]) - 1, tk = T[row]; if(!tk || tk.id === selfId) return; out.push({ id:tk.id, lag:m[2] ? (m[2] === '-' ? -1 : 1) * Number(m[3]) : 0 }); });
  return out;
}
/* A detailed starting schedule for the task view. Each task is placed by a fraction of its phase (start fraction, end fraction) and linked to the task it follows, with the lead or lag that reproduces that placement, so the span of the
   pre-development tasks and of the construction tasks is exactly the phase months already in the deal: switching to tasks moves nothing in the engine. The sequencing is a conventional one for mid-rise multifamily and is an
   ASSUMPTION to edit (it is not read from any document); the engine times costs on its own draw curves, not on these dates. */
var DETAIL_PRE = [['Site assessment and due diligence', 0, .25, null], ['Entitlements and approvals', .10, .70, 0], ['Design development', .20, .65, 0], ['Construction documents', .50, .90, 2], ['Permits and GMP pricing', .70, 1, 3]];
var DETAIL_CON = [['Mobilization and site clearing', 0, .06, null], ['Excavation and shoring', .04, .20, 0], ['Foundations', .15, .32, 1], ['Structure: podium and frame', .28, .62, 2], ['Envelope, glazing and roofing', .45, .75, 3], ['MEP rough-in', .42, .78, 3],
  ['Partitions and drywall', .55, .82, 4], ['Unit interiors: cabinets and fixtures', .68, .92, 6], ['Amenity fit-out', .80, .96, 6], ['Landscape and site finishes', .82, .98, 4], ['Testing, commissioning and inspections', .92, 1, 7]];
function detailTasks(pre, con){
  var T = [], idOf = function(){ return 't' + (T.length + 1); };
  var place = function(list, n, group, gate){
    var made = [];
    list.forEach(function(d, i){ var s0 = Math.floor(d[1] * n) + 1, e0 = Math.max(s0, Math.min(n, Math.ceil(d[2] * n))); if(i === 0) s0 = 1; if(i === list.length - 1) e0 = n; if(e0 < s0) e0 = s0;
      var id = idOf(), preds = [], st = s0;
      if(d[3] != null && made[d[3]]){ var pr = made[d[3]]; preds = [{ id:pr.id, lag:s0 - pr.e - 1 }]; st = null; }
      else if(gate){ preds = [{ id:gate.id, lag:s0 - gate.e - 1 + (gate.shift || 0) }]; st = null; }
      T.push({ id:id, name:d[0], group:group, start:st, dur:e0 - s0 + 1, preds:preds }); made.push({ id:id, s:s0, e:e0 }); });
    return made;
  };
  var preMade = pre >= 3 ? place(DETAIL_PRE, pre, 'predev', null) : null;
  if(pre > 0 && !preMade) T.push({ id:'t1', name:'Entitlements, design and permits', group:'predev', start:1, dur:pre, preds:[] });
  var lastPre = T.length ? { id:T[T.length - 1].id, e:pre } : null;
  /* construction starts after pre-development ends: its first task follows the pre-development task that ends last */
  var gate = null; if(pre > 0){ var endsLast = preMade ? preMade[preMade.length - 1] : { id:'t1', e:pre }; gate = { id:endsLast.id, e:endsLast.e }; }
  var conMade = place(DETAIL_CON, con, 'construction', null);
  if(gate){ var first = T.filter(function(x){ return x.name === DETAIL_CON[0][0]; })[0]; first.start = null; first.preds = [{ id:gate.id, lag:0 }]; }
  else { var f0 = T.filter(function(x){ return x.name === DETAIL_CON[0][0]; })[0]; f0.start = 1; }
  return T;
}
window.bkDevGanttMode = function(mode){
  var s = bkLoad(); s.devGantt = Object.assign({}, s.devGantt || {});
  if(mode === 'tasks'){
    if(!Array.isArray(s.devGantt.tasks) || !s.devGantt.tasks.length){
      var x = bkDevV09(), pre = Math.max(0, Math.round(num(s.predevMonths))), con = Math.max(0, Math.round(num(s.constructionMonths))), T = [];
      if(pre > 0) T.push({ id:'t1', name:'Entitlements, design and permits', group:'predev', start:1, dur:pre, preds:[] });
      if(con > 0){
        var base = pre > 0 ? [{ id:'t1', lag:0 }] : [], st = pre > 0 ? null : 1, id = function(){ return 't' + (T.length + 1); };
        if(con >= 6){ T = detailTasks(pre, con); }
        else if(con < 4){ T.push({ id:id(), name:'Construction', group:'construction', start:st, dur:con, preds:base }); }
        else {
          var a = Math.max(1, Math.round(con * 0.2)), b = Math.max(2, Math.round(con * 0.5)), over = Math.min(Math.max(1, Math.round(b * 0.3)), b - 1), c = con - a - b + over;
          while(c < 1){ b--; over = Math.min(over, b - 1); c = con - a - b + over; }
          var ia = id(); T.push({ id:ia, name:'Site work and foundations', group:'construction', start:st, dur:a, preds:base });
          var ib = id(); T.push({ id:ib, name:'Structure and envelope', group:'construction', start:null, dur:b, preds:[{ id:ia, lag:0 }] });
          T.push({ id:id(), name:'MEP, interiors and finishes', group:'construction', start:null, dur:c, preds:[{ id:ib, lag:-over }] });
        }
      }
      s.devGantt.tasks = T;
    }
    s.devGantt.mode = 'tasks';
  } else { s.devGantt.mode = 'phases'; }
  save(s);
};
window.bkDevGanttField = function(i, key, raw){
  var s = bkLoad(), g = s.devGantt = Object.assign({}, s.devGantt || {}), T = g.tasks = (g.tasks || []).map(function(t){ return Object.assign({}, t, { preds:(t.preds || []).map(function(p){ return Object.assign({}, p); }) }); }), t = T[i]; if(!t) return;
  var txt = String(raw == null ? '' : raw).trim();
  /* a summary task has no dates, duration, predecessors or percent of its own: they roll up from the tasks inside it */
  if(t.summary && (key === 'dur' || key === 'start' || key === 'startDate' || key === 'preds' || key === 'milestone' || key === 'pct')){ showSheet(cur()); return; }
  if(key === 'name') t.name = txt || t.name;
  else if(key === 'group') t.group = txt === 'predev' || txt === 'other' ? txt : 'construction';
  else if(key === 'dur'){ var d = Math.round(Number(txt.replace(/[,\s]/g, ''))); if(!isFinite(d) || d < 1){ showSheet(cur()); return; } t.dur = d; }
  else if(key === 'start'){ if(txt === ''){ t.start = null; } else { var m = Math.round(Number(txt.replace(/[,\s]/g, ''))); if(!isFinite(m) || m < 1){ showSheet(cur()); return; } t.start = m; } }
  else if(key === 'startDate'){ var dt = typeof bkParseDealDate === 'function' ? bkParseDealDate(txt, null) : null; if(!dt || isNaN(dt.getTime())){ showSheet(cur()); return; } var sd = startDate(s), mo = (dt.getFullYear() - sd.getFullYear()) * 12 + (dt.getMonth() - sd.getMonth()) + 1; if(mo < 1){ showSheet(cur()); return; } t.start = mo; }
  else if(key === 'preds'){ t.preds = parsePreds(txt, T.map(function(q){ return { id:q.id }; }), t.id); }
  else if(key === 'milestone'){ t.milestone = txt === 'true'; if(t.milestone) t.dur = 1; }
  else if(key === 'parent'){
    if(txt === ''){ t.parent = ''; }
    else {
      var byIdL = {}; T.forEach(function(q){ byIdL[q.id] = q; }); var P = byIdL[txt], bad = !P || !P.summary || P.id === t.id, hops = 0, c = P;
      /* a task cannot be put inside itself, or inside a summary that is inside it */
      while(!bad && c && hops++ <= T.length){ if(c.id === t.id){ bad = true; break; } c = c.parent ? byIdL[c.parent] : null; }
      if(bad){ showSheet(cur()); return; }
      t.parent = txt; g.tasks = moveUnder(T, t.id, txt);
    }
  }
  else if(key === 'pct'){
    if(txt === ''){ delete t.pct; }
    else { var pv = Number(txt.replace(/[%,\s]/g, '')); if(!isFinite(pv)){ showSheet(cur()); return; } t.pct = Math.min(100, Math.max(0, Math.round(pv * 10) / 10)); }
  }
  save(s);
};
/* A task given a summary moves, with everything inside it, to just after the last task already in that summary, so the list in the task table reads as an outline. */
function moveUnder(T, id, parentId){
  var kids = {}; T.forEach(function(t){ if(t.parent) (kids[t.parent] = kids[t.parent] || []).push(t.id); });
  var sub = {}; (function walk(k){ if(sub[k]) return; sub[k] = 1; (kids[k] || []).forEach(walk); })(id);
  var block = T.filter(function(t){ return sub[t.id]; }), rest = T.filter(function(t){ return !sub[t.id]; });
  var pi = -1; rest.forEach(function(t, k){ if(t.id === parentId) pi = k; }); if(pi < 0) return T;
  var inP = {}; (function walk(k){ if(inP[k]) return; inP[k] = 1; (kids[k] || []).forEach(function(c){ if(!sub[c]) walk(c); }); })(parentId);
  var last = pi; rest.forEach(function(t, k){ if(inP[t.id] && k > last) last = k; });
  return rest.slice(0, last + 1).concat(block, rest.slice(last + 1));
}
window.bkDevGanttAdd = function(){ var s = bkLoad(), g = s.devGantt = Object.assign({}, s.devGantt || {}); g.tasks = (g.tasks || []).slice(); g.tasks.push({ id:nextId(g.tasks), name:'New task', group:'construction', start:1, dur:3, preds:[] }); save(s); };
window.bkDevGanttAddSummary = function(){ var s = bkLoad(), g = s.devGantt = Object.assign({}, s.devGantt || {}); g.tasks = (g.tasks || []).slice(); g.tasks.push({ id:nextId(g.tasks), name:'New summary', summary:true, group:'construction', parent:'', preds:[] }); save(s); };
/* Removing a summary task keeps the tasks inside it: they move up to the summary it sat in (or to the top level). Removing any task drops the predecessor links to it. */
window.bkDevGanttRemove = function(i){ var s = bkLoad(), g = s.devGantt = Object.assign({}, s.devGantt || {}), T = g.tasks || [], gone = T[i], id = gone && gone.id;
  if(gone && gone.summary){ var one = {}; one[id] = true; g.tasks = dropSummaries(T, one); }
  else g.tasks = T.filter(function(t, k){ return k !== i; }).map(function(t){ return Object.assign({}, t, { preds:(t.preds || []).filter(function(p){ return p.id !== id; }) }); });
  if(!g.tasks.length) g.mode = 'phases'; save(s); };
/* Take summary tasks out and keep the work: the tasks inside move up a level, and a task that followed a removed summary now follows each task that was inside it (same lead or lag), so no date moves. */
function dropSummaries(T, ids){
  var byId = {}; T.forEach(function(t){ byId[t.id] = t; });
  var inside = function(id, acc, seen){ acc = acc || []; seen = seen || {}; if(seen[id]) return acc; seen[id] = 1; T.forEach(function(t){ if(t.parent === id){ if(t.summary) inside(t.id, acc, seen); else acc.push(t.id); } }); return acc; };
  var map = {}; Object.keys(ids).forEach(function(id){ map[id] = inside(id); });
  return T.filter(function(t){ return !ids[t.id]; }).map(function(t){
    var c = Object.assign({}, t), hops = 0; while(c.parent && ids[c.parent] && hops++ <= T.length) c.parent = (byId[c.parent] && byId[c.parent].parent) || '';
    var np = []; (t.preds || []).forEach(function(p){ if(!ids[p.id]){ np.push(Object.assign({}, p)); return; } (map[p.id] || []).forEach(function(l){ if(l !== t.id && !np.some(function(q){ return q.id === l && q.lag === p.lag; })) np.push({ id:l, lag:p.lag }); }); });
    c.preds = np; return c; });
}

/* Every budget line becomes a Gantt task (a line already tied keeps its task). The task is named after the line and sits where the line sits today (its earliest start and its duration), so nothing moves when it is made; from then on
   the line follows the task: change the task's start, duration or predecessors on Dev Schedule and the line's cash follows. Hard cost and contingency lines are construction tasks (they set the construction months);
   soft cost and FF&E lines are "other" tasks (they run across the project and do not set a phase). The window a line had is kept on the line as the fallback if its task is ever removed. */
window.bkDevBudgetToTasks = function(opts){
  var s = bkLoad(); if(!isDev(s) || !Array.isArray(s.budgetLines) || !s.budgetLines.length || typeof window.bkDevBudgetPlan !== 'function') return null;
  var x = bkDevV09(), plan = window.bkDevBudgetPlan(x, s); if(!plan || !plan.rows.length) return null;
  var byIdx = {}; plan.rows.forEach(function(r){ byIdx[r.idx] = r; });
  var g = s.devGantt = Object.assign({}, s.devGantt || {}), T = (Array.isArray(g.tasks) ? g.tasks : []).map(function(k){ return Object.assign({}, k, { preds:(k.preds || []).map(function(p){ return Object.assign({}, p); }) }); }), exists = {}, made = 0, before = { pre:num(x.preMo), con:num(x.conMo) };
  T.forEach(function(k){ exists[k.id] = k; });
  var L = s.budgetLines.map(function(l){ return Object.assign({}, l); });
  L.forEach(function(l, i){ var r = byIdx[i]; if(!r) return; if(l.task && exists[l.task]) return;
    var k = T.length + 1, id; do { id = 't' + k; k++; } while(exists[id]);
    var tk = { id:id, name:String(l.name || ('Line ' + (i + 1))), group:(l.cls === 'hard' || l.cls === 'cont') ? 'construction' : 'other', start:r.start, dur:r.len, preds:[] }; T.push(tk); exists[id] = tk; l.task = id; l.start = r.start; l.len = r.len; made++; });
  g.tasks = T; g.mode = 'tasks'; s.budgetLines = L; s.devGantt = g;
  window.bkDevGanttSync(s); bkSave(s); var x2 = bkDevV09();
  /* with {wbs:true} the tasks are also put under Hard cost / Contingency / Soft cost / FF&E summaries (the Group-by-cost-class step); no date or dollar changes */
  var grouped = opts && opts.wbs ? window.bkDevWbsByClass() : null;
  return { made:made, tied:L.filter(function(l){ return l.task; }).length, before:before, after:{ pre:num(x2.preMo), con:num(x2.conMo) }, grouped:grouped };
};
/* Gantt first: type a dollar amount on a task and a budget line is added, tied to that task (hard cost for a construction task, soft cost otherwise; change the class in Investment > Budget). Only in the line-item method. */
window.bkDevTaskCost = function(i, raw){
  var s = bkLoad(); if(!isDev(s) || String(s.devBudgetMode || '').toUpperCase() !== 'LINES') return; var g = s.devGantt || {}, T = g.tasks || [], k = T[i]; if(!k || k.summary) return;
  var v = Number(String(raw == null ? '' : raw).replace(/[$,\s]/g, '')); if(!isFinite(v) || v <= 0){ showSheet(cur()); return; }
  var sc = window.bkDevGanttSchedule(s, bkDevV09()), st = sc.tasks.filter(function(q){ return q.id === k.id; })[0] || { ES:1, EF:1 }, L = (s.budgetLines || []).slice();
  L.push({ id:'b' + Date.now().toString(36) + (L.length + 1), cls:k.group === 'construction' ? 'hard' : 'soft', name:k.name, amount:v, start:st.ES, len:Math.max(1, st.EF - st.ES + 1), method:'', rate:'', task:k.id });
  s.budgetLines = L; bkSave(s); showSheet(cur());
};
window.bkDevBudgetUntie = function(){ var s = bkLoad(); if(!Array.isArray(s.budgetLines)) return; s.budgetLines = s.budgetLines.map(function(l){ return Object.assign({}, l, { task:'' }); }); bkSave(s); if(typeof showSheet === 'function') showSheet(cur()); };

/* ------------------------------------------------------------------ the work breakdown (WBS) ------------------------------------------------------------------ */
var CLS_NAME = { hard:'Hard cost', cont:'Contingency', soft:'Soft cost', ffe:'FF&E' };
/* the task list in outline order: the tasks in a summary follow it; a summary created just now sits where its first task was */
function outline(T, fresh){
  var pos = {}, byId = {}, kids = {}; T.forEach(function(t, i){ pos[t.id] = i; byId[t.id] = t; }); T.forEach(function(t){ if(t.parent && byId[t.parent]) (kids[t.parent] = kids[t.parent] || []).push(t); });
  var first = function(t, seen){ seen = seen || {}; if(seen[t.id]) return pos[t.id]; seen[t.id] = 1; var m = pos[t.id]; (kids[t.id] || []).forEach(function(k){ m = Math.min(m, first(k, seen)); }); return m; };
  var anchor = function(t){ return fresh && fresh[t.id] ? first(t) - 0.5 : pos[t.id]; }, cmp = function(a, b){ return anchor(a) - anchor(b); };
  var out = [], done = {}, emit = function(t){ if(done[t.id]) return; done[t.id] = 1; out.push(t); (kids[t.id] || []).slice().sort(cmp).forEach(emit); };
  T.filter(function(t){ return !t.parent || !byId[t.parent]; }).sort(cmp).forEach(emit);
  T.forEach(function(t){ if(!done[t.id]){ done[t.id] = 1; out.push(t); } });
  return out;
}
/* Group the tasks that carry budget lines under summary tasks by cost class (Hard cost, Contingency, Soft cost, FF&E), one set for each phase. Only tasks that are not in a summary yet are moved, so anything already organised is left
   alone and running it again only picks up new tasks. Nothing is renamed or recosted and no date moves: the summary rows add up what is inside them. */
window.bkDevWbsByClass = function(){
  var s = bkLoad(); if(!isDev(s) || !window.bkDevGanttOn(s) || typeof window.bkDevBudgetPlan !== 'function') return null;
  var x = bkDevV09(), plan = window.bkDevBudgetPlan(x, s); if(!plan || !plan.rows.length) return null;
  var g = s.devGantt = Object.assign({}, s.devGantt), T = g.tasks.map(function(k){ return Object.assign({}, k, { preds:(k.preds || []).map(function(p){ return Object.assign({}, p); }) }); }), cost = {};
  plan.rows.forEach(function(r){ if(r.fromTask && r.task){ var e = cost[r.task] || (cost[r.task] = {}); e[r.cls] = (e[r.cls] || 0) + r.amount; } });
  var have = {}, fresh = {}, exists = {}, made = 0, moved = 0; T.forEach(function(k){ exists[k.id] = 1; if(k.summary && k.auto) have[(k.group === 'predev' || k.group === 'other' ? k.group : 'construction') + '|' + k.auto] = k; });
  var nid = function(){ var n = T.length + 1; while(exists['t' + n]) n++; exists['t' + n] = 1; return 't' + n; };
  T.slice().forEach(function(k){ if(k.summary || k.parent || !cost[k.id]) return;
    var best = null; Object.keys(cost[k.id]).forEach(function(c){ if(best === null || cost[k.id][c] > cost[k.id][best]) best = c; });
    var gp = k.group === 'predev' || k.group === 'other' ? k.group : 'construction', key = gp + '|' + best, sm = have[key];
    if(!sm){ sm = { id:nid(), name:CLS_NAME[best] || best, summary:true, auto:best, group:gp, parent:'', preds:[] }; T.push(sm); have[key] = sm; fresh[sm.id] = 1; made++; }
    k.parent = sm.id; moved++; });
  if(!moved) return { made:0, moved:0 };
  g.tasks = outline(T, fresh); window.bkDevGanttSync(s); bkSave(s);
  return { made:made, moved:moved };
};
/* take out the cost-class summaries made above (summaries you made yourself are left); the tasks stay, in order, at the top level */
window.bkDevWbsUngroup = function(){
  var s = bkLoad(), g = s.devGantt; if(!g || !Array.isArray(g.tasks)) return null;
  var ids = {}; g.tasks.forEach(function(t){ if(t.summary && t.auto) ids[t.id] = true; }); var n = Object.keys(ids).length; if(!n) return { removed:0 };
  s.devGantt = Object.assign({}, g, { tasks:dropSummaries(g.tasks, ids) }); window.bkDevGanttSync(s); bkSave(s); return { removed:n };
};
/* Collapse and expand. This is view state, kept in this browser for each deal, so it is not part of the deal and not in the undo history; the rows are hidden or shown in place and every total stays as it is. */
var FOLD_KEY = 'bkcapital.gx.fold', foldMem = {};
function foldKey(s){ return String((s && (s.dealId || s.name)) || 'deal'); }
function foldGet(s){ var k = foldKey(s); if(foldMem[k]) return foldMem[k]; var v = []; try { var o = JSON.parse(window.localStorage.getItem(FOLD_KEY) || '{}'); if(Array.isArray(o[k])) v = o[k]; } catch(e){} foldMem[k] = v; return v; }
function foldSave(s, ids){ var k = foldKey(s); foldMem[k] = ids; try { var o = JSON.parse(window.localStorage.getItem(FOLD_KEY) || '{}'); if(ids.length) o[k] = ids; else delete o[k]; window.localStorage.setItem(FOLD_KEY, JSON.stringify(o)); } catch(e){} }
function foldApply(){
  var root = document.querySelector('.bk-gx'); if(!root) return; var f = foldGet(bkLoad());
  [].forEach.call(root.querySelectorAll('tr[data-id]'), function(tr){ var anc = (tr.getAttribute('data-anc') || '').split(' ').filter(Boolean); tr.style.display = anc.some(function(a){ return f.indexOf(a) >= 0; }) ? 'none' : '';
    var tg = tr.querySelector('.gx-fold'); if(tg){ var c = f.indexOf(tr.getAttribute('data-id')) >= 0; tg.textContent = c ? '+' : '−'; tg.setAttribute('aria-expanded', c ? 'false' : 'true'); tg.setAttribute('aria-label', (c ? 'Expand ' : 'Collapse ') + (tg.getAttribute('data-name') || 'summary task')); } });
}
window.bkGxFold = function(id, force){ var s = bkLoad(), f = foldGet(s).slice(), at = f.indexOf(id), collapse = force == null ? at < 0 : !!force; if(collapse && at < 0) f.push(id); if(!collapse && at >= 0) f.splice(at, 1); foldSave(s, f); foldApply(); };
window.bkGxFoldAll = function(collapse){ var s = bkLoad(); foldSave(s, collapse ? ((s.devGantt && s.devGantt.tasks) || []).filter(function(t){ return t.summary; }).map(function(t){ return String(t.id); }) : []); foldApply(); };

/* ------------------------------------------------------------------ the chart ------------------------------------------------------------------ */
/* the Punchlist color scale: slate violet, olive gold (dark to light), cream with a gold outline */
var COL = { predev:'#8a8fb0', construction:'#8c7a28', other:'#a99136', leaseup:'#c9b25f', ops:'#efe6cb', opsLine:'#c4a94a', crit:'#b3392c', ms:'#1b2733' };
function onCol(c){ var h = String(c).replace('#', ''), r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16), L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; return L > 0.62 ? '#4a3f12' : '#fff'; }
function dtx(d){ return d.toLocaleDateString('en-US', { month:'short', year:'numeric' }); }
function monthsText(n){ return n + (n === 1 ? ' month' : ' months'); }

/* The chart. Calendar years and month numbers across the top, the three milestones flagged above the grid, a band for each section (pre-development, construction, other tasks, lease-up and
   operations), the task number and name on the left, each bar labelled with its duration, float as a dashed tail, dependencies as arrows, the critical path outlined in red.
   o.print draws it in fixed colors for paper; o.W is the width in drawing units (it scales to the space it is put in). */
function ganttSvg(rows, sc, s, o){
  o = o || {}; var P = !!o.print, uid = 'ga' + (o.id || Math.floor(Math.random() * 1e6));
  var ink = P ? '#1b2733' : 'var(--ae-ink,#1b2733)', dim = P ? '#6b7a89' : 'var(--ae-dim,#7d8b99)', line = P ? '#d3dae2' : 'var(--ae-line,#dfe5ec)', band = 'rgba(120,140,160,' + (P ? '.10' : '.07') + ')', sec = P ? '#eaeff4' : 'rgba(120,140,160,.15)';
  var hold = Math.max(num(sc.hold), num(sc.stab) + 1, 12), maxName = rows.reduce(function(m, r){ return Math.max(m, String(r.name || '').length + (r.idx ? 3 : 0)); }, 12), Lw = Math.max(200, Math.min(330, Math.round(maxName * 6.7) + 36));
  var W0 = o.W || 1000, Cw = W0 - Lw - 22, pxm = Math.max(2.2, Cw / hold), W = Lw + hold * pxm + 22, secH = 22, rowH = 27, topY = 112;
  var X = function(m){ return Lw + (m - 1) * pxm; };
  /* section structure: a header row before the first row of each section */
  var items = [], lastSec = null; rows.forEach(function(r){ if(r.sec !== lastSec){ items.push({ header:r.sec }); lastSec = r.sec; } items.push(r); });
  var y = topY; items.forEach(function(it){ it.y = y; it.h = it.header ? secH : rowH; y += it.h; }); var H = y + 14;
  var g = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Development schedule Gantt chart, by month" style="display:block;max-width:100%;height:auto;font-family:inherit"><defs>'
    + '<marker id="' + uid + 'a" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="' + dim + '"/></marker><marker id="' + uid + 'c" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="' + COL.crit + '"/></marker></defs>';
  /* phase strip */
  var segs = [['Pre-development', 1, num(sc.preMo), COL.predev], ['Construction', num(sc.preMo) + 1, num(sc.co), COL.construction], ['Lease-up', num(sc.co) + 1, num(sc.stab) - 1 > num(sc.co) ? num(sc.stab) - 1 : num(sc.co), COL.leaseup], ['Stabilized operations', num(sc.stab), hold, COL.ops]];
  if(num(sc.luMo) <= 0) segs.splice(2, 1);
  segs.forEach(function(sg){ if(sg[2] < sg[1]) return; var x0 = X(sg[1]), w = (sg[2] - sg[1] + 1) * pxm; g += '<rect x="' + x0 + '" y="6" width="' + w + '" height="18" fill="' + sg[3] + '"' + (sg[3] === COL.ops ? ' stroke="' + COL.opsLine + '" stroke-width="1.2"' : '') + ' opacity=".95"><title>' + esc(sg[0]) + ': months ' + sg[1] + ' to ' + sg[2] + '</title></rect>';
    var cnt = sg[0] === 'Lease-up' ? num(sc.luMo) : (sg[2] - sg[1] + 1), full = sg[0] + ' · ' + cnt + ' mo', short = sg[0].replace('Pre-development', 'Pre-dev').replace('Stabilized operations', 'Stabilized') + ' · ' + cnt;
    if(w > full.length * 6.4 + 10) g += '<text x="' + (x0 + w / 2) + '" y="19" text-anchor="middle" font-size="11" font-weight="700" fill="' + onCol(sg[3]) + '">' + esc(full) + '</text>'; else if(w > short.length * 6.4 + 8) g += '<text x="' + (x0 + w / 2) + '" y="19" text-anchor="middle" font-size="10" font-weight="700" fill="' + onCol(sg[3]) + '">' + esc(short) + '</text>'; });
  g += '<text x="' + (Lw - 10) + '" y="19" text-anchor="end" font-size="10.5" font-weight="700" fill="' + dim + '" letter-spacing=".06em">PHASES</text>';
  /* milestone flags (Closing is month 1) */
  var ms = [['Certificate of occupancy', num(sc.co), COL.crit], ['Stabilized', num(sc.stab), COL.leaseup], ['Sale / exit', num(sc.hold), COL.ms]].filter(function(m){ return m[1] > 0; }).sort(function(a, b){ return a[1] - b[1]; });
  ms.forEach(function(m, i){ var mx = X(m[1]) + pxm / 2, txt = m[0] + ' \u00b7 ' + dtx(monthEnd(s, m[1])), w = txt.length * 5.8 + 10, ty = 40 + (i % 2) * 14;
    var anchor = mx + w / 2 > W - 4 ? 'end' : mx - w / 2 < Lw ? 'start' : 'middle'; g += '<text x="' + (anchor === 'end' ? mx + 4 : anchor === 'start' ? mx - 4 : mx) + '" y="' + ty + '" text-anchor="' + anchor + '" font-size="10.5" font-weight="700" fill="' + m[2] + '">' + esc(txt) + '</text>'; m.push(mx); });
  /* calendar years, then month numbers */
  var yearY = 72, monthY = 88, yr0 = 1, curY = monthStart(s, 1).getFullYear(), shade = 0;
  for(var m = 1; m <= hold + 1; m++){ var yy = m <= hold ? monthStart(s, m).getFullYear() : null; if(yy !== curY){ var w = (m - yr0) * pxm, x0 = X(yr0); g += '<rect x="' + x0 + '" y="' + yearY + '" width="' + w + '" height="14" fill="' + sec + '" opacity="' + (shade % 2 ? '.55' : '1') + '"/>';
      if(w > 26) g += '<text x="' + (x0 + w / 2) + '" y="' + (yearY + 11) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="' + ink + '">' + curY + '</text>'; shade++; yr0 = m; curY = yy; } }
  var step = pxm >= 13 ? 1 : pxm >= 6 ? 3 : pxm >= 3.4 ? 6 : 12;
  for(var mm = 1; mm <= hold; mm++){ if((mm - 1) % step === 0 || mm === hold){ if(step > 1 && mm !== 1 && mm === hold && hold - ((hold - 1) - ((hold - 1) % step)) < step * 0.6 && (hold - 1) % step !== 0) continue; g += '<text x="' + (X(mm) + pxm / 2) + '" y="' + (monthY + 11) + '" text-anchor="middle" font-size="9.5" fill="' + dim + '">' + mm + '</text>'; } }
  g += '<text x="' + (Lw - 10) + '" y="' + (yearY + 11) + '" text-anchor="end" font-size="10.5" font-weight="700" fill="' + dim + '" letter-spacing=".06em">YEAR</text><text x="' + (Lw - 10) + '" y="' + (monthY + 11) + '" text-anchor="end" font-size="10.5" font-weight="700" fill="' + dim + '" letter-spacing=".06em">MONTH</text>';
  /* alternating year bands and quarter lines behind the rows */
  var by0 = 1, bcur = monthStart(s, 1).getFullYear(), bs = 0; for(var q = 1; q <= hold + 1; q++){ var qy = q <= hold ? monthStart(s, q).getFullYear() : null; if(qy !== bcur){ if(bs % 2 === 0) g += '<rect x="' + X(by0) + '" y="' + topY + '" width="' + ((q - by0) * pxm) + '" height="' + (H - topY - 14) + '" fill="' + band + '"/>'; bs++; by0 = q; bcur = qy; } }
  /* rows */
  items.forEach(function(it){
    if(it.header){ g += '<rect x="6" y="' + it.y + '" width="' + (W - 12) + '" height="' + it.h + '" fill="' + sec + '" opacity=".75"/><text x="12" y="' + (it.y + 15) + '" font-size="10.5" font-weight="700" fill="' + ink + '" letter-spacing=".08em">' + esc(String(it.header).toUpperCase()) + '</text>'; return; }
    var ind = (it.depth || 0) * 10, cy = it.y + it.h / 2, nm = String(it.name || ''), lim = Math.floor((Lw - 34 - ind) / 6.5), shown = nm.length > lim ? nm.slice(0, lim - 1) + '…' : nm;
    g += '<line x1="6" x2="' + (W - 6) + '" y1="' + (it.y + it.h) + '" y2="' + (it.y + it.h) + '" stroke="' + line + '" stroke-width=".6"/>';
    if(it.idx) g += '<text x="12" y="' + (cy + 4) + '" font-size="10.5" fill="' + dim + '">' + it.idx + '</text>';
    g += '<text x="' + ((it.idx ? 30 : 12) + ind) + '" y="' + (cy + 4) + '" font-size="12" fill="' + ink + '" font-weight="' + (it.summary ? 800 : it.linked ? 400 : 600) + '">' + esc(shown) + (shown !== nm ? '<title>' + esc(nm) + '</title>' : '') + '</text>';
    if(it.critical && !it.linked) g += '<rect x="6" y="' + (cy - 7) + '" width="3" height="14" fill="' + COL.crit + '"/>';
    if(it.summary){
      /* a summary task is the dark bracket over what is inside it: from the earliest start to the latest finish */
      if(it.empty) return; var sx = X(it.ES), sw2 = Math.max(pxm, (it.EF - it.ES + 1) * pxm), sd = it.EF - it.ES + 1;
      g += '<path d="M' + sx + ',' + (cy - 7) + ' H' + (sx + sw2) + ' V' + (cy + 4) + ' L' + (sx + sw2 - 5) + ',' + (cy - 1) + ' H' + (sx + 5) + ' L' + sx + ',' + (cy + 4) + ' Z" fill="' + ink + '"><title>' + esc(it.name) + ' (summary): ' + esc(dtx(monthStart(s, it.ES)) + (it.EF > it.ES ? ' to ' + dtx(monthEnd(s, it.EF)) : '')) + ' · ' + sd + (sd === 1 ? ' month' : ' months') + '</title></path>';
      g += '<text x="' + (sx + sw2 + 5) + '" y="' + (cy + 4) + '" font-size="10.5" fill="' + dim + '">' + sd + ' mo</text>'; return; }
    var dates = dtx(monthStart(s, it.ES)) + (it.EF > it.ES ? ' to ' + dtx(monthEnd(s, it.EF)) : '');
    if(it.milestone){ var cx = X(it.ES) + pxm / 2; g += '<path d="M' + cx + ',' + (cy - 8) + ' L' + (cx + 8) + ',' + cy + ' L' + cx + ',' + (cy + 8) + ' L' + (cx - 8) + ',' + cy + ' Z" fill="' + (it.critical ? COL.crit : COL.ms) + '"><title>' + esc(it.name) + ': ' + esc(dtx(monthEnd(s, it.ES))) + ' (month ' + it.ES + ')</title></path>';
      var left = cx + 70 > W; g += '<text x="' + (left ? cx - 13 : cx + 13) + '" y="' + (cy + 4) + '" text-anchor="' + (left ? 'end' : 'start') + '" font-size="10.5" fill="' + dim + '">' + esc(dtx(monthEnd(s, it.ES))) + '</text>'; return; }
    var bw = Math.max(pxm, (it.EF - it.ES + 1) * pxm), bx = X(it.ES), dur = it.EF - it.ES + 1;
    g += '<rect x="' + bx + '" y="' + (cy - 8) + '" width="' + bw + '" height="16" rx="2.5" fill="' + (it.color || COL.construction) + '"' + (it.critical ? ' stroke="' + COL.crit + '" stroke-width="2"' : '') + '><title>' + esc(it.name) + ': ' + esc(dates) + ' · months ' + it.ES + ' to ' + it.EF + ' · ' + dur + (dur === 1 ? ' month' : ' months') + (it.float > 0 && !it.linked ? ' · float ' + it.float : '') + (it.critical ? ' · critical path' : '') + '</title></rect>';
    if(bw >= 34) g += '<text x="' + (bx + bw / 2) + '" y="' + (cy + 4) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="' + onCol(it.color || COL.construction) + '">' + dur + ' mo</text>';
    else g += '<text x="' + (bx + bw + 5) + '" y="' + (cy + 4) + '" font-size="10.5" fill="' + dim + '">' + dur + ' mo</text>';
    if(it.float > 0 && !it.linked){ var fx = bx + bw; g += '<line x1="' + fx + '" x2="' + (fx + it.float * pxm) + '" y1="' + cy + '" y2="' + cy + '" stroke="' + dim + '" stroke-dasharray="3 2"/><text x="' + (fx + it.float * pxm + 4) + '" y="' + (cy + 4) + '" font-size="10" fill="' + dim + '">+' + it.float + '</text>'; } });
  /* milestone lines through the grid */
  ms.forEach(function(m){ var mx = m[3]; g += '<line x1="' + mx + '" x2="' + mx + '" y1="' + (yearY + 14) + '" y2="' + (H - 14) + '" stroke="' + m[2] + '" stroke-width="1" stroke-dasharray="4 3" opacity=".55"/>'; });
  /* dependency arrows */
  var pos = {}; items.forEach(function(it){ if(it.id) pos[it.id] = it; });
  items.forEach(function(it){ (it.preds || []).forEach(function(pr){ var q = pos[pr.id]; if(!q || it.header) return; var x1 = X(q.EF) + pxm, y1 = q.y + q.h / 2, x2 = X(it.ES), y2 = it.y + it.h / 2, crit = it.critical && q.critical, elbow = Math.min(x1 + 6, Math.max(x1 + 2, x2 - 6));
    g += '<path d="M' + x1 + ',' + y1 + ' H' + elbow + ' V' + y2 + ' H' + (x2 - 1) + '" fill="none" stroke="' + (crit ? COL.crit : dim) + '" stroke-width="' + (crit ? 1.3 : 1) + '" marker-end="url(#' + uid + (crit ? 'c' : 'a') + ')"/>'; }); });
  return g + '</svg>';
}
/* The schedule as a sheet, in the style of a project-management Gantt: a grey band for each phase with its summary bar in dark green, each task beneath it with a light green bar, the task's start, end and months in columns on the left, a month
   grid across the top with the calendar year above it, milestone call-outs, and a vertical line at the certificate of occupancy and at stabilization. It draws the same rows the chart does; it adds no schedule of its own. */
var GX = { crit:'#b3392c', band:'#c9ced8', head:'#cfd3db', sum:'#00b050', task:'#92d050', cell:'#f1f3f6', cellAlt:'#e6e9ee', line:'#b9bfca', ink:'#10213a', ms:'#2f7d32' };
/* More than one green: bars are coloured by what they are. With a budget the colour is the cost class of the lines tied to the task (blue hard cost, amber contingency, teal soft cost, violet FF&E); without one it is the task's phase
   (teal pre-development, green construction, slate other); lease-up is gold and stabilized operations steel. The summary bar of each phase is the deep version of its colour. */
var PAL = { cls:(window.BK_CLASS_COLORS || { hard:'#2f6db5', cont:'#e08a2c', soft:'#2a9d8f', ffe:'#7b5ea7' }), grp:{ predev:'#5fb7ad', construction:'#92d050', other:'#aab6c6' }, lu:'#f2c14e', ops:'#9fb4cc', ph:{ 'Pre-development':'#2a8f85', 'Construction':'#00a050', 'Other tasks':'#51647a', 'Lease-up and operations':'#b9852a' } };
function deep(hex){ var h = String(hex).replace('#', ''), r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16), f = .72; return '#' + [r, g, b].map(function(v){ return ('0' + Math.round(v * f).toString(16)).slice(-2); }).join(''); }
function ganttSheet(M, o){
  o = o || {}; var s = M.s, sc = M.sc, rows = M.rows, plan = M.plan || null, hasCost = !!(plan && plan.rows && plan.rows.length), N = Math.max(sc.hold || 0, sc.stab || 0, 12), cw = N > 72 ? 11 : N > 48 ? 14 : 18, y0 = startYear(s);
  var yr = function(m){ return monthStart(s, m).getFullYear(); }, yearRuns = [], last = null;
  for(var m = 1; m <= N; m++){ var y = yr(m); if(last && last.y === y) last.n++; else { last = { y:y, n:1 }; yearRuns.push(last); } }
  var vline = function(m){ return m === sc.co ? 'border-right:2px solid ' + GX.ms : m === sc.stab ? 'border-right:2px dashed ' + GX.ms : ''; };
  var yi = {}; var yk = 0; yearRuns.forEach(function(r){ r.alt = (yk++ % 2) === 1; });
  var colAlt = function(m){ var k = 0, acc = 0; for(var i = 0; i < yearRuns.length; i++){ acc += yearRuns[i].n; if(m <= acc) return yearRuns[i].alt; } return false; };
  var th = 'background:' + GX.head + ';color:' + GX.ink + ';font-weight:600;border:1px solid ' + GX.line + ';padding:3px 6px;font-size:11px;white-space:nowrap';
  /* the work breakdown: summary rows (indented tasks, a fold box, a WBS number) appear when the schedule has a summary task, and the percent-complete column once a percent has been entered (it is entered in the task table below); otherwise the sheet is as it was */
  var RU = M.roll || { by:{}, any:false, total:{}, weigh:function(){ return { pct:null }; } }, hasWbs = !!M.hasWbs, showPct = !!RU.any, fold = foldGet(s), taskW = hasWbs ? 300 : 256, WB = '#e4e8ef';
  var h = '<div class="bk-gx" style="overflow-x:auto;border:1px solid ' + GX.line + ';border-radius:4px;background:#fff;margin-top:8px"><table style="border-collapse:collapse;table-layout:fixed;width:100%;min-width:' + (496 + (hasWbs ? 46 : 0) + (hasCost ? 96 : 0) + (showPct ? 60 : 0) + N * 8) + 'px;font-size:12px;color:' + GX.ink + ';font-variant-numeric:tabular-nums"><colgroup><col style="width:36px"><col style="width:' + taskW + 'px"><col style="width:78px"><col style="width:78px"><col style="width:48px">' + (hasCost ? '<col style="width:96px">' : '') + '<col style="width:54px">' + (showPct ? '<col style="width:60px">' : '');
  for(var c = 1; c <= N; c++) h += '<col>';
  h += '</colgroup><thead><tr><th style="' + th + ';text-align:center" rowspan="2">#</th><th style="' + th + ';text-align:left" rowspan="2">Task</th><th style="' + th + ';text-align:right" rowspan="2">Start</th><th style="' + th + ';text-align:right" rowspan="2">End</th><th style="' + th + ';text-align:right" rowspan="2">Months</th>' + (hasCost ? '<th style="' + th + ';text-align:right" rowspan="2" title="The dollars of each budget line (Investment > Budget)">Cost</th>' : '') + '<th style="' + th + ';text-align:left" rowspan="2" title="Predecessor rows; +n / -n is a lag / overlap in months">Pred.</th>' + (showPct ? '<th style="' + th + ';text-align:right" rowspan="2" title="Percent complete. A summary task shows the roll-up of the tasks inside it, weighted by cost (by months where no cost is tied). For tracking only: it does not change the schedule, the draws or the returns.">% done</th>' : '');
  yearRuns.forEach(function(r){ h += '<th colspan="' + r.n + '" style="' + th + ';text-align:center">' + (r.n >= 3 ? r.y : '') + '</th>'; });
  h += '</tr><tr>'; for(var c2 = 1; c2 <= N; c2++) h += '<th style="' + th + ';text-align:left;font-size:9px;padding:2px 0 2px 1px;font-weight:500;overflow:visible">' + (N <= 18 || (N <= 36 && c2 % 3 === 1) || (N > 36 && c2 % 6 === 1) ? c2 : '') + '</th>'; h += '</tr></thead><tbody>';
  /* A bar is drawn month by month. With a percent complete the first part of it is the darker colour: whole months are solid, and the month the progress ends in is shaded by the part of it that is done. */
  var cellsFor = function(rowBars, ms, bold, crit, rowBg){
    var out = ''; for(var m2 = 1; m2 <= N; m2++){ var inBar = rowBars && m2 >= rowBars.a && m2 <= rowBars.b, edge = (inBar ? '' : ''), bg = inBar ? rowBars.col : (bold ? (rowBg || GX.band) : (colAlt(m2) ? GX.cellAlt : GX.cell)), prog = '';
      if(inBar && rowBars.pct != null && rowBars.pct > 0 && rowBars.done){ var span = rowBars.b - rowBars.a + 1, f = Math.max(0, Math.min(1, span * Math.min(100, rowBars.pct) / 100 - (m2 - rowBars.a)));
        if(f >= 0.999){ bg = rowBars.done; prog = ' data-done="full"'; } else if(f > 0.001){ bg = 'linear-gradient(to right,' + rowBars.done + ' ' + (f * 100).toFixed(1) + '%,' + rowBars.col + ' ' + (f * 100).toFixed(1) + '%)'; prog = ' data-done="part"'; } }
      var mark = ms && m2 === ms.m ? '<span title="' + esc(ms.label) + '" style="display:block;width:11px;height:11px;margin:0 auto;background:' + GX.ms + ';transform:rotate(45deg)"></span>' : '';
      var bd = 'border:1px solid ' + (inBar ? rowBars.col : '#d9dde4') + ';';
      if(inBar && crit) bd = 'border:1px solid ' + rowBars.col + ';border-top-color:' + GX.crit + ';border-bottom-color:' + GX.crit + ';border-left-color:' + (m2 === rowBars.a ? GX.crit : rowBars.col) + ';border-right-color:' + (m2 === rowBars.b ? GX.crit : rowBars.col) + ';';
      out += '<td' + (inBar ? ' data-bar="' + (rowBars.kind || (bold ? 'sum' : 'task')) + '"' + (crit ? ' data-crit="1"' : '') + prog : '') + (ms && m2 === ms.m ? ' data-ms="1"' : '') + ' style="padding:0;height:22px;background:' + bg + ';' + bd + vline(m2) + '">' + mark + '</td>'; }
    return out; };
  var tdl = function(txt, al, b, bg){ return '<td style="padding:3px 6px;border:1px solid ' + GX.line + ';text-align:' + al + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:' + (al === 'right' ? 11.5 : 12) + 'px;' + (b ? 'font-weight:700;background:' + (bg || GX.band) : 'background:#fff') + '">' + txt + '</td>'; };
  var tint = function(hex, a){ var h2 = String(hex).replace('#', ''); return 'rgba(' + parseInt(h2.slice(0, 2), 16) + ',' + parseInt(h2.slice(2, 4), 16) + ',' + parseInt(h2.slice(4, 6), 16) + ',' + a + ')'; };
  var pctText = function(v){ return pctOnly(v); };
  /* the percent-complete cell has its own bar: the cell is filled to the percent, in the colour of the task */
  var pctCell = function(v, col, bold, bg, tip){ if(!showPct) return ''; if(v == null) return tdl('', 'right', bold, bg); var p = Math.max(0, Math.min(100, v)), base = bg || (bold ? GX.band : '#fff');
    return '<td data-pct="' + p.toFixed(1) + '"' + (tip ? ' title="' + esc(tip) + '"' : '') + ' style="padding:3px 6px;border:1px solid ' + GX.line + ';text-align:right;white-space:nowrap;font-size:11.5px;' + (bold ? 'font-weight:700;' : '') + 'background:linear-gradient(to right,' + tint(col, .45) + ' ' + p + '%,' + base + ' ' + p + '%)">' + pctText(v) + '</td>'; };
  var padPct = function(b){ return showPct ? tdl('', 'left', b) : ''; };
  var tiedCost = {}; if(hasCost) plan.rows.forEach(function(r){ if(r.fromTask && r.task){ var e = tiedCost[r.task] || (tiedCost[r.task] = { amt:0, n:0 }); e.amt += r.amount; e.n++; } });
  var tiedCls = {}; if(hasCost) plan.rows.forEach(function(r){ if(r.fromTask && r.task){ var e = tiedCls[r.task] || (tiedCls[r.task] = {}); e[r.cls] = (e[r.cls] || 0) + r.amount; } });
  var taskCol = function(r){ if(r.linked) return /^Lease-up/.test(r.name || '') ? PAL.lu : PAL.ops; var e = r.id ? (r.summary && RU.by[r.id] ? RU.by[r.id].cls : tiedCls[r.id]) : null; if(e && Object.keys(e).length){ var best = null; Object.keys(e).forEach(function(k){ if(best === null || e[k] > e[best]) best = k; }); if(PAL.cls[best]) return PAL.cls[best]; } return PAL.grp[r.group] || GX.task; };
  var money1 = function(v){ return '$' + Math.round(v).toLocaleString('en-US'); };
  var secs = []; rows.forEach(function(r){ if(!secs.length || secs[secs.length - 1].name !== r.sec) secs.push({ name:r.sec, rows:[] }); secs[secs.length - 1].rows.push(r); });
  var idxById = {}; rows.forEach(function(r){ if(r.id) idxById[r.id] = r.idx; });
  var predText = function(r){ return (r.preds || []).map(function(pd){ return (idxById[pd.id] || '?') + (pd.lag ? (pd.lag > 0 ? '+' : '') + pd.lag : ''); }).join(', '); };
  var n = 0;
  /* the task cell: indent by depth, a fold box on a summary, the WBS number, the name (and how many tasks a summary holds) */
  var nameHtml = function(r){
    var pad = hasWbs && r.depth ? '<span style="display:inline-block;width:' + (r.depth * 14) + 'px"></span>' : '', closed = r.id && fold.indexOf(r.id) >= 0;
    var tg = !hasWbs || r.linked ? '' : r.summary ? '<span class="gx-fold" role="button" tabindex="0" data-name="' + esc(r.name) + '" aria-expanded="' + (closed ? 'false' : 'true') + '" aria-label="' + (closed ? 'Expand ' : 'Collapse ') + esc(r.name) + '" onclick="bkGxFold(\'' + esc(r.id) + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();bkGxFold(\'' + esc(r.id) + '\')}">' + (closed ? '+' : '−') + '</span> ' : '<span class="gx-fold-sp"></span> ';
    var code = hasWbs && r.wbs && !r.linked ? '<span style="opacity:.55;font-weight:400">' + esc(r.wbs) + '</span> ' : '';
    var cnt = r.summary && !r.empty ? '<span style="opacity:.6;font-weight:400"> &middot; ' + r.leafN + (r.leafN === 1 ? ' task' : ' tasks') + '</span>' : '';
    return pad + tg + code + (r.milestone ? '&#9670; ' : '') + esc(r.name) + cnt; };
  var basisText = function(b){ return b === 'cost' ? 'weighted by cost' : b === 'months' ? 'weighted by months' : b === 'average' ? 'average of the tasks with a percent' : ''; };
  secs.forEach(function(g){
    var bars = g.rows.filter(function(r){ return !r.milestone && r.ES && r.EF; }), a = bars.length ? Math.min.apply(null, bars.map(function(r){ return r.ES; })) : null, b2 = bars.length ? Math.max.apply(null, bars.map(function(r){ return r.ES && r.EF ? r.EF : 0; })) : null;
    var phCol = PAL.ph[g.name] || GX.sum, wk = RU.weigh(g.rows.filter(function(r){ return !r.summary && !r.linked && r.id && RU.by[r.id]; }));
    h += '<tr>' + tdl('', 'center', true) + tdl(esc(g.name), 'left', true) + tdl(a ? esc(dtx(monthStart(s, a))) : '', 'right', true) + tdl(b2 ? esc(dtx(monthEnd(s, b2))) : '', 'right', true) + tdl(a ? String(b2 - a + 1) : '', 'right', true) + (hasCost ? (function(){ var sm = g.rows.reduce(function(q, r){ return q + (!r.depth && r.id && !r.linked && RU.by[r.id] ? RU.by[r.id].amt : 0); }, 0); return tdl(sm > 0 ? '<b>' + money1(sm) + '</b>' : '', 'right', true); })() : '') + tdl('', 'left', true) + pctCell(wk.pct, phCol, true, null, wk.pct == null ? '' : g.name + ': ' + pctText(wk.pct) + ' complete, ' + basisText(wk.basis)) + cellsFor(a ? { a:a, b:b2, col:phCol, pct:wk.pct, done:deep(phCol) } : null, null, true, false) + '</tr>';
    g.rows.forEach(function(r){ n++;
      var ms = r.milestone ? { m:r.ES, label:r.name + ': ' + dtx(monthEnd(s, r.ES)) } : null, dur = r.EF - r.ES + 1, task = r.id && !r.linked, e = task ? RU.by[r.id] : null, hid = task && r.anc && r.anc.some(function(q){ return fold.indexOf(q) >= 0; });
      var attr = task ? ' data-id="' + esc(r.id) + '"' + (r.anc && r.anc.length ? ' data-anc="' + esc(r.anc.join(' ')) + '"' : '') + (r.summary ? ' data-wbs="1"' : '') + (hid ? ' style="display:none"' : '') : '', tip = '';
      if(task){ var bits = [r.name]; if(r.ES && r.EF && !r.milestone){ bits.push(dtx(monthStart(s, r.ES)) + (r.EF > r.ES ? ' to ' + dtx(monthEnd(s, r.EF)) : '')); bits.push(monthsText(dur)); }
        if(e && e.amt > 0) bits.push(money1(e.amt)); if(e && e.pct != null) bits.push(pctText(e.pct) + ' complete' + (r.summary && e.basis ? ' (' + basisText(e.basis) + ')' : '')); if(r.critical) bits.push('critical path'); else if(r.critDesc) bits.push('on the critical path'); else if(r.float > 0 && !r.summary) bits.push('float ' + r.float);
        tip = ' title="' + esc(bits.join(' · ')) + '"'; }
      var costTxt = e && e.amt > 0 ? money1(e.amt) + (!r.summary && e.n > 1 ? ' <span style="opacity:.6">(' + e.n + ')</span>' : '') : '', col = taskCol(r);
      if(r.summary){
        var bcol = deep(col);
        h += '<tr' + attr + tip + '>' + tdl(r.idx ? String(r.idx) : '', 'center', true, WB) + tdl(nameHtml(r), 'left', true, WB) + tdl(r.empty ? '' : esc(dtx(monthStart(s, r.ES))), 'right', true, WB) + tdl(r.empty ? '' : esc(dtx(monthEnd(s, r.EF))), 'right', true, WB) + tdl(r.empty ? '' : String(dur), 'right', true, WB) + (hasCost ? tdl(costTxt, 'right', true, WB) : '') + tdl('', 'left', true, WB) + pctCell(e ? e.pct : null, col, true, WB, e && e.pct != null ? r.name + ': ' + pctText(e.pct) + ' complete, ' + basisText(e.basis) : '')
          + cellsFor(r.empty ? null : { a:r.ES, b:r.EF, col:bcol, pct:e ? e.pct : null, done:deep(bcol), kind:'wbs' }, null, true, false, WB) + '</tr>'; return; }
      h += '<tr' + attr + tip + '>' + tdl(r.idx ? String(r.idx) : '', 'center') + tdl(nameHtml(r), 'left') + tdl(r.ES ? esc(dtx(monthStart(s, r.ES))) : '', 'right') + tdl(r.EF ? esc(dtx(monthEnd(s, r.EF))) : '', 'right') + tdl(r.milestone ? '' : String(dur), 'right') + (hasCost ? tdl(costTxt, 'right') : '') + tdl(predText(r), 'left') + pctCell(e ? e.pct : null, col, false, null, e && e.pct != null ? r.name + ': ' + pctText(e.pct) + ' complete' : '')
        + cellsFor(r.milestone ? null : { a:r.ES, b:r.EF, col:col, pct:e ? e.pct : null, done:deep(col) }, ms, false, !!r.critical && !r.milestone) + '</tr>'; }); });
  if(hasCost){
    var BC = PAL.cls, CL = { hard:'Hard cost', cont:'Contingency', soft:'Soft cost', ffe:'FF&E' }, money0 = function(v){ return '$' + Math.round(v).toLocaleString('en-US'); };
    var total = plan.rows.reduce(function(a, r){ return a + r.amount; }, 0), free = plan.rows.filter(function(r){ return !r.fromTask; }), tiedN = plan.rows.length - free.length;
    /* lines that are tied to a task are the Cost column of that task above; only the lines with no task are listed here, by cost class */
    if(free.length){
      var fa = Math.min.apply(null, free.map(function(r){ return r.start; })), fb = Math.max.apply(null, free.map(function(r){ return r.end; })), fsum = free.reduce(function(a, r){ return a + r.amount; }, 0);
      h += '<tr>' + tdl('', 'center', true) + tdl(tiedN ? 'Budget lines not tied to a task' : 'Budget lines', 'left', true) + tdl(esc(dtx(monthStart(s, fa))), 'right', true) + tdl(esc(dtx(monthEnd(s, fb))), 'right', true) + tdl(String(fb - fa + 1), 'right', true) + tdl('<b>' + money0(fsum) + '</b>', 'right', true) + tdl('', 'left', true) + padPct(true) + cellsFor({ a:fa, b:fb, col:PAL.ph['Other tasks'] }, null, true, false) + '</tr>';
      var gi = 0; ['hard', 'cont', 'soft', 'ffe'].forEach(function(c){ var L = free.filter(function(r){ return r.cls === c; }); if(!L.length) return;
        var ga = Math.min.apply(null, L.map(function(r){ return r.start; })), gb = Math.max.apply(null, L.map(function(r){ return r.end; })), gsum = L.reduce(function(a2, r){ return a2 + r.amount; }, 0);
        h += '<tr>' + tdl('', 'center', true) + tdl('<span style="display:inline-block;width:8px;height:8px;background:' + BC[c] + ';margin-right:6px"></span>' + CL[c] + ' &middot; ' + L.length + (L.length === 1 ? ' line' : ' lines'), 'left', true) + tdl(esc(dtx(monthStart(s, ga))), 'right', true) + tdl(esc(dtx(monthEnd(s, gb))), 'right', true) + tdl(String(gb - ga + 1), 'right', true) + tdl('<b>' + money0(gsum) + '</b>', 'right', true) + tdl('', 'left', true) + padPct(true) + cellsFor({ a:ga, b:gb, col:deep(BC[c]) }, null, true, false) + '</tr>';
        L.forEach(function(r){ gi++; var dates = dtx(monthStart(s, r.start)) + (r.end > r.start ? ' to ' + dtx(monthEnd(s, r.end)) : '');
          h += '<tr title="' + esc(r.name + ' - ' + CL[r.cls] + ' - ' + money0(r.amount) + ' - ' + dates + ' - ' + r.method + ', steepness ' + r.rate) + '">' + tdl(String(gi), 'center') + tdl(esc(r.name), 'left') + tdl(esc(dtx(monthStart(s, r.start))), 'right') + tdl(esc(dtx(monthEnd(s, r.end))), 'right') + tdl(String(r.len), 'right') + tdl(money0(r.amount), 'right') + tdl('', 'left') + padPct(false) + cellsFor({ a:r.start, b:r.end, col:BC[r.cls] }, null, false, false) + '</tr>'; }); });
    }
    /* cash spent by month: one bar per month, the same cash the draw schedule funds */
    var mxv = 0; for(var q1 = 1; q1 <= N; q1++) mxv = Math.max(mxv, plan.all[q1] || 0);
    var byC = { hard:{}, cont:{}, soft:{}, ffe:{} }; plan.rows.forEach(function(r){ Object.keys(r.monthly).forEach(function(mm){ byC[r.cls][mm] = (byC[r.cls][mm] || 0) + r.monthly[mm]; }); });
    h += '<tr>' + tdl('', 'center', true) + tdl('Cash spent by month' + (tiedN ? ' <span style="font-weight:400;opacity:.7">(' + tiedN + ' of ' + plan.rows.length + ' lines follow a task)</span>' : ''), 'left', true) + tdl('', 'right', true) + tdl('', 'right', true) + tdl('', 'right', true) + tdl('<b>' + money0(total) + '</b>', 'right', true) + tdl('', 'left', true) + padPct(true);
    for(var q2 = 1; q2 <= N; q2++){ var v2 = plan.all[q2] || 0, hh = v2 > 0 && mxv > 0 ? Math.max(1, Math.round(v2 / mxv * 76)) : 0; h += '<td style="padding:0;height:84px;vertical-align:bottom;background:' + (colAlt(q2) ? GX.cellAlt : GX.cell) + ';border:1px solid #d9dde4;' + vline(q2) + '">' + (hh > 0 ? '<div title="Month ' + q2 + ' - ' + dtx(monthStart(s, q2)) + ': ' + money0(v2) + '" style="display:flex;flex-direction:column-reverse;height:' + hh + 'px;margin:0 1px">' + ['hard', 'cont', 'soft', 'ffe'].map(function(c){ var vv = byC[c][q2] || 0; return vv > 0 ? '<div style="flex:' + vv.toFixed(2) + ' 1 0;min-height:1px;background:' + BC[c] + '"></div>' : ''; }).join('') + '</div>' : '') + '</td>'; }
    h += '</tr>';
  }
  var sw = function(col, lab, extra){ return '<span style="display:inline-block;width:14px;height:9px;background:' + col + ';margin-right:4px;' + (extra || '') + '"></span>' + lab + ' &nbsp; '; };
  var cats = hasCost ? sw(PAL.cls.hard, 'Hard cost') + sw(PAL.cls.cont, 'Contingency') + sw(PAL.cls.soft, 'Soft cost') + sw(PAL.cls.ffe, 'FF&amp;E') : sw(PAL.grp.predev, 'Pre-development task') + sw(PAL.grp.construction, 'Construction task') + sw(PAL.grp.other, 'Other task');
  h += '</tbody></table></div><div style="font-size:11px;opacity:.9;margin-top:5px;line-height:1.9">' + sw(PAL.ph.Construction, 'Phase (deep colour of its tasks)') + (hasWbs ? sw(deep(PAL.cls.hard), 'Summary task (rolls up what is inside it)') : '') + (showPct ? sw('linear-gradient(to right,' + deep(PAL.cls.hard) + ' 50%,' + PAL.cls.hard + ' 50%)', 'Percent complete (the darker part)') : '') + cats + sw(PAL.lu, 'Lease-up') + sw(PAL.ops, 'Stabilized operations') + sw(GX.task, 'Critical path (red outline)', 'border:2px solid ' + GX.crit + ';box-sizing:border-box;background:transparent') + '<span style="display:inline-block;width:9px;height:9px;background:' + GX.ms + ';transform:rotate(45deg);margin:0 6px 0 2px"></span>Milestone &nbsp; <span style="display:inline-block;width:0;height:11px;border-right:2px solid ' + GX.ms + ';margin:0 6px 0 2px;vertical-align:-2px"></span>Certificate of occupancy &nbsp; <span style="display:inline-block;width:0;height:11px;border-right:2px dashed ' + GX.ms + ';margin:0 6px 0 2px;vertical-align:-2px"></span>Stabilization</div>';
  return h;
}
function startYear(s){ return startDate(s).getFullYear(); }
function legendHtml(P){ var c = function(col){ return '<span style="display:inline-block;width:10px;height:10px;background:' + col + ';' + (col === COL.ops ? 'outline:1px solid ' + COL.opsLine + ';outline-offset:-1px;' : '') + 'margin-right:4px;vertical-align:-1px"></span>'; }; return '<div class="bk-gs-legend" style="font-size:' + (P ? 10.5 : 12) + 'px;margin-top:6px;opacity:.9"><span style="display:inline-block;width:10px;height:10px;border:2px solid ' + COL.crit + ';margin-right:4px;vertical-align:-3px"></span>Critical path (no float) &nbsp; ' + c(COL.predev) + 'Pre-development &nbsp; ' + c(COL.construction) + 'Construction &nbsp; ' + c(COL.other) + 'Other task &nbsp; ' + c(COL.leaseup) + 'Lease-up &nbsp; ' + c(COL.ops) + 'Stabilized operations &nbsp; &#9670; Milestone &nbsp; <span style="opacity:.8">- - float (months of slack)</span> &nbsp; &#8594; dependency</div>'; }
function rowsFor(s, sc, x){
  var rows = [], secName = { predev:'Pre-development', construction:'Construction', other:'Other tasks' }, order = ['predev', 'construction', 'other'], A = sc.tasks || [], idxOf = {}, root = 0;
  A.forEach(function(t, i){ idxOf[t.id] = i + 1; });
  /* each section lists its top-level tasks in order; the tasks inside a summary follow it (a summary and what is inside it stay together in the section the summary is in) */
  order.forEach(function(gp){
    var emit = function(t, code){ var kids = t.kids || [];
      rows.push({ id:t.id, idx:idxOf[t.id], sec:secName[gp], name:t.name, ES:t.ES, EF:t.EF, float:t.float, critical:t.critical, milestone:t.milestone, preds:t.preds, color:COL[t.group] || COL.construction, group:t.group, summary:!!t.summary, empty:!!t.empty, critDesc:!!t.critDesc, depth:t.depth || 0, wbs:code, anc:t.anc || [], kids:kids.length, leafN:(t.leaves || []).length, pct:t.pct });
      kids.forEach(function(k, j){ emit(k, code + '.' + (j + 1)); }); };
    A.forEach(function(t){ if(t.parentEff || (t.group || 'construction') !== gp) return; emit(t, String(++root)); });
  });
  rows.push({ sec:'Lease-up and operations', name:'Certificate of occupancy', ES:sc.co, EF:sc.co, milestone:true, critical:true, linked:true, float:0 });
  if(sc.luMo > 0) rows.push({ id:'lu', sec:'Lease-up and operations', name:'Lease-up (from the lease-up method)', ES:sc.co + 1, EF:sc.co + sc.luMo, critical:true, linked:true, float:0, color:COL.leaseup, preds:[] });
  rows.push({ sec:'Lease-up and operations', name:'Stabilized operations', ES:sc.stab, EF:Math.max(sc.stab, sc.hold), linked:true, float:0, color:COL.ops });
  rows.push({ sec:'Lease-up and operations', name:'Sale / exit', ES:sc.hold, EF:sc.hold, milestone:true, linked:true, float:0 });
  return rows;
}
/* Cost and percent complete for every task, rolled up the work breakdown. A task's cost is the budget lines tied to it (the plan rows that follow a task); a summary is the sum of what is inside it. Percent complete is weighted
   by cost, or by months where a summary has no cost tied; a summary has none until a task inside it has one. It is for tracking: nothing here feeds the schedule, the draws or the returns. */
function rollups(sc, plan){
  var own = {}, R = {}, tasks = (sc && sc.tasks) || [];
  if(plan && plan.rows) plan.rows.forEach(function(r){ if(r.fromTask && r.task){ var e = own[r.task] || (own[r.task] = { amt:0, n:0, cls:{} }); e.amt += r.amount; e.n++; e.cls[r.cls] = (e.cls[r.cls] || 0) + r.amount; } });
  var months = function(k){ return k.milestone || k.ES == null ? 0 : k.EF - k.ES + 1; }, pc = function(k){ return has(k.pct) ? k.pct : 0; };
  var weigh = function(L){
    var amt = L.reduce(function(a, k){ return a + (R[k.id] ? R[k.id].amt : 0); }, 0), set = L.filter(function(k){ return has(k.pct); });
    if(!set.length) return { pct:null, basis:'', amt:amt, done:0 };
    var out, mo = L.reduce(function(a, k){ return a + months(k); }, 0);
    if(amt > 0) out = { pct:L.reduce(function(a, k){ return a + R[k.id].amt * pc(k); }, 0) / amt, basis:'cost' };
    else if(mo > 0) out = { pct:L.reduce(function(a, k){ return a + months(k) * pc(k); }, 0) / mo, basis:'months' };
    else out = { pct:set.reduce(function(a, k){ return a + k.pct; }, 0) / set.length, basis:'average' };
    out.amt = amt; out.done = L.reduce(function(a, k){ return a + (R[k.id] ? R[k.id].amt : 0) * pc(k) / 100; }, 0); return out;
  };
  tasks.forEach(function(t){ if(t.summary) return; var o = own[t.id] || { amt:0, n:0, cls:{} }; R[t.id] = { amt:o.amt, n:o.n, cls:Object.assign({}, o.cls), pct:has(t.pct) ? t.pct : null, basis:'', done:o.amt * pc(t) / 100 }; });
  var walk = function(t){
    if(R[t.id]) return R[t.id]; var o = own[t.id] || { amt:0, n:0, cls:{} }, e = R[t.id] = { amt:o.amt, n:o.n, cls:Object.assign({}, o.cls), pct:null, basis:'', done:0 };
    (t.kids || []).forEach(function(k){ var c = walk(k); e.amt += c.amt; e.n += c.n; Object.keys(c.cls).forEach(function(q){ e.cls[q] = (e.cls[q] || 0) + c.cls[q]; }); });
    var w = weigh(t.leaves || []); e.pct = w.pct; e.basis = w.basis; e.done = w.done; return e;
  };
  tasks.forEach(function(t){ if(t.summary) walk(t); });
  var leaves = tasks.filter(function(t){ return !t.summary; }), tot = weigh(leaves);
  return { by:R, weigh:weigh, any:leaves.some(function(k){ return has(k.pct); }), total:{ pct:tot.pct, basis:tot.basis, amt:tot.amt, done:tot.done, plan:(plan && plan.rows) ? plan.rows.reduce(function(a, r){ return a + r.amount; }, 0) : 0 } };
}
/* everything the page and the printed summary draw from, in one place */
window.bkDevGanttModel = function(s){
  s = s || bkLoad(); if(!isDev(s)) return null; var x = bkDevV09(), on = window.bkDevGanttOn(s), sc, warnings = [], indicative = false;
  if(on){ sc = window.bkDevGanttSchedule(s, x); warnings = sc.warnings || []; }
  else { var ph = phaseTasks(s, x); sc = { tasks:ph, co:x.co, luMo:x.luMo, stab:x.stab, hold:x.hold, conStart:x.preMo + 1, preMo:x.preMo, conMo:x.conMo };
    /* drawn from the phase durations only, the chart still shows an INDICATIVE breakdown inside each phase (assumed sequencing, same span, nothing saved and nothing in the engine moves) */
    try { var pre0 = Math.round(num(s.predevMonths)), con0 = Math.round(num(s.constructionMonths));
      if(con0 >= 6){ var tmp = Object.assign({}, s, { devGantt:{ mode:'tasks', tasks:detailTasks(pre0, con0) } }), d2 = window.bkDevGanttSchedule(tmp, x);
        if(d2 && !d2.cycle && d2.preMo === x.preMo && d2.conMo === x.conMo && d2.co === x.co){ d2.tasks = d2.tasks.map(function(k){ return Object.assign({}, k, { critical:false, preds:[], float:0 }); }); sc = d2; indicative = true; } } } catch(e){} }
  var plan = (x.budgetRows && x.budgetRows.length && typeof window.bkDevBudgetPlan === 'function') ? window.bkDevBudgetPlan(x, s) : null;
  return { s:s, x:x, on:on, indicative:indicative, sc:sc, warnings:warnings, plan:plan, roll:rollups(sc, plan), hasWbs:(sc.tasks || []).some(function(t){ return t.summary; }), rows:rowsFor(s, sc, x), svg:ganttSvg, legend:legendHtml, monthStart:function(m){ return monthStart(s, m); }, monthEnd:function(m){ return monthEnd(s, m); }, fmt:dtx };
};
function tilesHtml(M){
  var sc = M.sc, s = M.s, crit = sc.tasks.filter(function(t){ return t.critical; }).length, T = function(k, v, sub){ return '<div class="bk-gs-tile"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div>' + (sub ? '<div class="d">' + esc(sub) + '</div>' : '') + '</div>'; };
  return '<div class="bk-gs-tiles">' + T('To stabilization', monthsText(sc.stab), dtx(monthStart(s, 1)) + ' to ' + dtx(monthEnd(s, sc.stab)))
    + T('Pre-development', monthsText(sc.preMo || 0), sc.preMo ? dtx(monthStart(s, 1)) + ' to ' + dtx(monthEnd(s, sc.preMo)) : 'none')
    + T('Construction', monthsText(sc.conMo || 0), sc.conMo ? dtx(monthStart(s, sc.preMo + 1)) + ' to ' + dtx(monthEnd(s, sc.co)) : 'none')
    + T('Certificate of occupancy', dtx(monthEnd(s, sc.co)), 'month ' + sc.co)
    + T('Lease-up', monthsText(sc.luMo || 0), sc.luMo ? dtx(monthStart(s, sc.co + 1)) + ' to ' + dtx(monthEnd(s, sc.stab)) : 'none')
    + T('Stabilized', dtx(monthStart(s, sc.stab)), 'month ' + sc.stab)
    + T(M.on ? 'Critical tasks' : 'Schedule from', M.on ? crit + ' of ' + sc.tasks.filter(function(t){ return !t.summary; }).length : 'phase durations', M.on ? 'zero float to the CO' : 'switch to a task schedule for float')
    + (M.on && M.roll && M.roll.any && M.roll.total.pct != null ? T('Work complete', pctOnly(M.roll.total.pct), M.roll.total.basis === 'cost' ? money$(M.roll.total.done) + ' of ' + money$(M.roll.total.amt) + ' of the budget tied to tasks' : M.roll.total.basis === 'months' ? 'weighted by task months (no budget tied to tasks)' : 'average of the tasks with a percent') : '') + '</div>'; }
/* the app shows every percentage with two decimals (src/162b), so the figures are written that way here too: the title text and the screen agree */
function pctOnly(v){ return Number(v).toFixed(2) + '%'; }
function money$(v){ var a = Math.abs(v); return (v < 0 ? '-' : '') + '$' + (a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? Math.round(a / 1e3).toLocaleString('en-US') + 'K' : Math.round(a).toLocaleString('en-US')); }
var css = document.createElement('style'); css.id = 'bk-gs-css'; css.textContent = '.bk-gx .gx-fold,.bk-gx .gx-fold-sp{display:inline-block;width:13px;height:13px;margin-right:1px;vertical-align:-2px;box-sizing:border-box}.bk-gx .gx-fold{border:1px solid #6b7a89;border-radius:2px;background:#fff;color:#10213a;text-align:center;font-size:12px;font-weight:700;line-height:10px;cursor:pointer;user-select:none}.bk-gx .gx-fold:hover,.bk-gx .gx-fold:focus-visible{background:#10213a;color:#fff;outline:none}.bk-gs-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:10px 0}.bk-gs-tile{border:1px solid var(--ae-line,#d3dae2);padding:7px 10px;background:var(--ae-cell-ro,transparent)}.bk-gs-tile .k{font-size:10px;letter-spacing:.09em;text-transform:uppercase;opacity:.7;font-weight:700}.bk-gs-tile .v{font-size:16px;font-weight:700;margin:2px 0}.bk-gs-tile .d{font-size:11px;opacity:.75}.bk-gs-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0 10px}'; document.head.appendChild(css);

function phaseTasks(s, x){
  var T = [], preMo = num(x.preMo), conMo = num(x.conMo);
  if(preMo > 0) T.push({ id:'p1', name:'Pre-development', group:'predev', ES:1, EF:preMo, dur:preMo, float:0, critical:true, preds:[], milestone:false, startDate:monthStart(s, 1), endDate:monthEnd(s, preMo) });
  if(conMo > 0) T.push({ id:'p2', name:'Construction', group:'construction', ES:preMo + 1, EF:preMo + conMo, dur:conMo, float:0, critical:true, preds:preMo > 0 ? [{ id:'p1', lag:0 }] : [], milestone:false, startDate:monthStart(s, preMo + 1), endDate:monthEnd(s, preMo + conMo) });
  return T;
}

/* ------------------------------------------------------------------ the section on Dev Schedule ------------------------------------------------------------------ */
var prev = RENDERERS['Dev Schedule'];
RENDERERS['Dev Schedule'] = function(){
  var o = typeof prev === 'function' ? prev.apply(this, arguments) : { main:'' }, s = bkLoad(); if(!o || typeof o.main !== 'string' || !isDev(s)) return o;
  try {
    var M = window.bkDevGanttModel(s), x = M.x, on = M.on, sc = M.sc, tasks = sc.tasks, warnings = M.warnings, rows = M.rows, html;
    var head = '<div class="ae-form" style="margin:0 0 8px"><label style="font-weight:600">Schedule</label> <select onchange="bkDevGanttMode(this.value)"><option value="phases"' + (on ? '' : ' selected') + '>Phase durations (pre-development, construction, lease-up)</option><option value="tasks"' + (on ? ' selected' : '') + '>Task schedule (overlaps, dependencies, critical path)</option></select></div>';
    var chartBox = '<div class="tbl-wrap" style="margin-top:16px"><div style="padding:10px 12px"><b>Gantt chart, by month</b>' + head
      + ((!on && !(num(x.preMo) + num(x.conMo) + num(x.luMo) > 0)) ? '' : tilesHtml(M)) + '<div class="bk-gs-bar"><button type="button" class="bk-btn primary" onclick="bkDevScheduleReport()">Schedule summary (PDF)</button><span style="font-size:12px;opacity:.8">A full printable summary: key dates, the Gantt chart, the task schedule, the funding timeline and what a delay costs.</span></div>@@WBS@@'
      + ((!on && !(num(x.preMo) + num(x.conMo) + num(x.luMo) > 0)) ? '<div class="note-flag" style="margin-top:10px"><span>&#9432;</span><div><b>No schedule to draw yet.</b> Pre-development, construction and lease-up months are all blank, so there are no phases to chart. Enter them under the development inputs (or choose Task schedule) and the Gantt chart appears here.</div></div>' : ganttSheet(M))
      + (on ? '' : '<div class="note-flag" style="margin-top:8px"><span>&#9432;</span><div><b>Drawn from the phase durations.</b> ' + (M.indicative ? 'The tasks inside each phase are an <b>indicative breakdown</b> with assumed sequencing (same start and finish as the phases, nothing moves). ' : '') + '<button type="button" class="bk-btn" style="margin:0 6px" onclick="bkDevGanttMode(\'tasks\')">Edit as a task schedule</button> to change task durations, overlaps and dependencies. It starts as tasks that reproduce these phases exactly, so nothing moves until you edit them.</div></div>') + '</div></div>';
    var table = '', wbsBar = '';
    if(on){
      var budCol = !!M.plan || String(s.devBudgetMode || '').toUpperCase() === 'LINES', hasWbs = !!M.hasWbs, RU = M.roll || { by:{}, any:false, total:{} };
      var T = sc.tasks, summaries = T.filter(function(q){ return q.summary; });
      var money$$ = function(v){ return '$' + Math.round(v).toLocaleString('en-US'); }, pctT = function(v){ return pctOnly(v); };
      /* the work breakdown bar: add a summary task, group the costed tasks by cost class, fold and unfold */
      var ungrouped = T.filter(function(q){ return !q.summary && !q.parentEff && RU.by[q.id] && RU.by[q.id].amt > 0; }).length, autos = summaries.filter(function(q){ return q.auto; }).length;
      wbsBar = '<div class="bk-gs-bar" style="margin:4px 0 2px"><b style="font-size:12px">Work breakdown</b><button type="button" class="bk-btn" onclick="bkDevGanttAddSummary()">+ Summary task</button>'
        + (ungrouped ? '<button type="button" class="bk-btn primary" onclick="bkDevWbsByClass();showSheet(\'Dev Schedule\')" title="Puts each task that carries budget lines under a Hard cost, Contingency, Soft cost or FF&amp;E summary. Nothing is renamed, recosted or moved in time.">Group ' + ungrouped + (ungrouped === 1 ? ' costed task' : ' costed tasks') + ' by cost class</button>' : '')
        + (hasWbs ? '<button type="button" class="bk-btn" onclick="bkGxFoldAll(true)">Collapse all</button><button type="button" class="bk-btn" onclick="bkGxFoldAll(false)">Expand all</button>' : '')
        + (autos ? '<button type="button" class="bk-btn" onclick="bkDevWbsUngroup();showSheet(\'Dev Schedule\')" title="Takes out the cost-class summaries. The tasks stay, at the top level.">Remove cost-class groups</button>' : '')
        + '<span style="font-size:12px;opacity:.8">' + (hasWbs ? 'A summary adds up the tasks inside it: its dates, its cost and its % complete. Folding hides rows; the totals do not change.' : 'Group tasks under summary tasks that add up their dates, cost and % complete.') + '</span></div>';
      var descOf = function(id){ var out = {}; (function w(k){ T.forEach(function(q){ if(q.parentEff === k && !out[q.id]){ out[q.id] = 1; w(q.id); } }); })(id); return out; };
      var tcost = {}; if(M.plan) M.plan.rows.forEach(function(r){ if(r.fromTask && r.task){ var e = tcost[r.task] || (tcost[r.task] = { amt:0, n:0 }); e.amt += r.amount; e.n++; } });
      var hdr = '<tr><th class="rowlabel-h">#</th><th class="gx-lh">Task</th>' + (hasWbs ? '<th class="gx-lh" title="The summary task this task sits in (its place in the work breakdown)">Summary task<br><small>it sits in</small></th>' : '') + '<th class="gx-lh">Group</th><th>Start no earlier than<br><small>month</small></th><th>or date<br><small>M/D/YYYY</small></th><th>Duration<br><small>months</small></th><th>Predecessors<br><small>e.g. 2, 3-2 (overlap 2)</small></th><th title="Percent complete, for tracking. A summary task shows the roll-up of the tasks inside it, weighted by cost (by months where no cost is tied). It does not change the schedule, the draws or the returns.">% done<br><small>0 to 100</small></th><th>Start</th><th>Finish</th><th>Float</th><th>Critical</th>' + (budCol ? '<th title="The dollars of the budget lines tied to the task (Investment > Budget); type an amount to add a line">Budget<br><small>lines tied</small></th>' : '') + '<th></th></tr>';
      var body = T.map(function(t, i){ var raw = (s.devGantt.tasks[i] || {}), e = RU.by[t.id] || {}, pr = t.preds.map(function(p){ var k = T.findIndex(function(q){ return q.id === p.id; }) + 1; return k + (p.lag ? (p.lag > 0 ? '+' : '') + p.lag : ''); }).join(', ');
        var ind = t.depth ? '<span style="display:inline-block;width:' + (t.depth * 16) + 'px"></span>' : '';
        var nameTd = '<td class="v">' + ind + '<input type="text" size="22" class="gx-l" style="width:' + (190 - Math.min(80, t.depth * 16)) + 'px;text-align:left !important' + (t.summary ? ';font-weight:700' : '') + '" value="' + esc(t.name) + '" onchange="bkDevGanttField(' + i + ',\'name\',this.value)"></td>';
        var parTd = hasWbs ? '<td class="v"><select class="gx-l" title="Move this task into a summary task" onchange="bkDevGanttField(' + i + ',\'parent\',this.value)"><option value="">None (top level)</option>' + summaries.filter(function(q){ return q.id !== t.id && !(t.summary && descOf(t.id)[q.id]); }).map(function(q){ return '<option value="' + esc(q.id) + '"' + (t.parentEff === q.id ? ' selected' : '') + '>' + (T.indexOf(q) + 1) + '. ' + esc(q.name) + '</option>'; }).join('') + '</select></td>' : '';
        var grpTd = '<td class="v"><select class="gx-l" onchange="bkDevGanttField(' + i + ',\'group\',this.value)">' + GROUPS.map(function(gp){ return '<option value="' + gp[0] + '"' + (t.group === gp[0] ? ' selected' : '') + '>' + gp[1] + '</option>'; }).join('') + '</select></td>';
        var costTd = budCol ? (t.summary ? '<td style="text-align:right;white-space:nowrap;font-weight:700">' + (e.amt > 0 ? money$$(e.amt) : '') + '</td>' : '<td style="text-align:right;white-space:nowrap">' + (tcost[t.id] ? money$$(tcost[t.id].amt) + (tcost[t.id].n > 1 ? ' (' + tcost[t.id].n + ' lines)' : '') + ' ' : '') + '<input type="text" size="8" style="width:84px;text-align:right" placeholder="+ add $" title="Type an amount to add a budget line tied to this task" onchange="bkDevTaskCost(' + i + ',this.value)"></td>') : '';
        var rm = '<td><button type="button" class="bk-btn" onclick="bkDevGanttRemove(' + i + ')"' + (t.summary ? ' title="Removes the summary only; the tasks inside it stay"' : '') + '>Remove</button></td></tr>';
        if(t.summary){
          return '<tr class="input" data-wbs-row="' + esc(t.id) + '"><td class="rowlabel">' + (i + 1) + '</td>' + nameTd + parTd + grpTd
            + '<td colspan="4" data-bk-align="text" style="text-align:left;opacity:.8"><div style="width:0;min-width:100%;white-space:normal;line-height:1.3">' + (t.empty ? 'No tasks inside it yet. Move tasks in with the Summary task column.' : 'Summary of ' + t.leaves.length + (t.leaves.length === 1 ? ' task' : ' tasks') + ': dates and cost roll up from them.') + '</div></td>'
            + '<td style="text-align:right;font-weight:700"' + (e.pct != null ? ' title="Weighted by ' + (e.basis === 'cost' ? 'cost' : e.basis === 'months' ? 'months' : 'task') + '"' : '') + '>' + (e.pct != null ? pctT(e.pct) : '') + '</td>'
            + '<td>' + (t.empty ? '' : t.ES + ' &middot; ' + fmtD(t.startDate)) + '</td><td>' + (t.empty ? '' : t.EF + ' &middot; ' + fmtD(t.endDate)) + '</td><td></td><td>' + (t.critDesc ? '<span class="status-chip">ON PATH</span>' : '') + '</td>' + costTd + rm; }
        return '<tr class="input"><td class="rowlabel">' + (i + 1) + '</td>' + nameTd + parTd + grpTd
          + '<td class="v"><input type="number" class="gx-n" step="1" min="1" style="width:70px" value="' + (has(raw.start) ? raw.start : '') + '" placeholder="auto" onchange="bkDevGanttField(' + i + ',\'start\',this.value)"></td>'
          + '<td class="v"><input type="text" size="9" style="width:100px" value="' + esc(has(raw.start) ? monthStart(s, num(raw.start)).toLocaleDateString('en-US') : '') + '" placeholder="auto" onchange="bkDevGanttField(' + i + ',\'startDate\',this.value)"></td>'
          + '<td class="v"><input type="number" class="gx-n" step="1" min="1" style="width:70px" value="' + t.dur + '" onchange="bkDevGanttField(' + i + ',\'dur\',this.value)"></td>'
          + '<td class="v"><input type="text" size="10" class="gx-l" style="width:110px;text-align:left !important" value="' + esc(pr) + '" placeholder="none" onchange="bkDevGanttField(' + i + ',\'preds\',this.value)"></td>'
          + '<td class="v"><input type="number" class="gx-n" step="1" min="0" max="100" style="width:64px" value="' + (has(t.pct) ? t.pct : '') + '" placeholder="&ndash;" title="Percent complete (0 to 100), for tracking" onchange="bkDevGanttField(' + i + ',\'pct\',this.value)"></td>'
          + '<td>' + t.ES + ' &middot; ' + fmtD(t.startDate) + '</td><td>' + t.EF + ' &middot; ' + fmtD(t.endDate) + '</td><td>' + t.float + '</td><td>' + (t.critical ? '<span class="status-chip fail">CRITICAL</span>' : '') + '</td>' + costTd + rm; }).join('');
      var link = '<tr class="grandtotal"><td class="rowlabel" colspan="2">What the schedule drives</td><td colspan="' + (11 + (hasWbs ? 1 : 0) + (budCol ? 1 : 0)) + '" data-bk-align="text"><div style="width:0;min-width:100%;white-space:normal;line-height:1.35">Pre-development ' + sc.preMo + ' months &middot; construction ' + sc.conMo + ' months (months ' + sc.conStart + ' to ' + sc.conEnd + ') &middot; certificate of occupancy month ' + sc.co + ' &middot; lease-up ' + sc.luMo + ' months &middot; stabilized month ' + sc.stab + '. The construction draws, facility and lease-up all move with these.</div></td></tr>';
      table = '<div class="tbl-wrap" style="margin-top:12px"><div style="overflow-x:auto"><table class="fin bk-m-scroll" style="table-layout:auto !important;width:max-content !important;min-width:1180px !important;max-width:none !important"><caption>Tasks, dependencies and critical path</caption><thead>' + hdr + '</thead><tbody>' + body + link + '</tbody></table></div></div>'
        + '<div style="margin:8px 0"><button type="button" class="bk-btn" onclick="bkDevGanttAdd()">+ Add task</button> <button type="button" class="bk-btn" onclick="bkDevGanttAddSummary()">+ Add summary task</button></div>'
        + (warnings.length ? '<div class="note-flag"><span>&#9888;</span><div>' + warnings.map(esc).join('<br>') + '</div></div>' : '')
        + '<div class="note-flag"><span>&#9432;</span><div>Months count from the analysis start (month 1 is the closing month). A predecessor links finish to start; <b>3-2</b> starts the task two months before task 3 finishes (an overlap) and <b>3+1</b> a month after. The critical path is the chain of tasks with no float to the certificate of occupancy. Pre-development and construction months are set from the first and last construction task; the lease-up months come from the lease-up method.</div></div>'
        + '<div class="note-flag"><span>&#9432;</span><div><b>Summary tasks and % complete.</b> A summary task groups the tasks inside it and adds nothing of its own to the schedule: its start is the earliest start inside it, its finish the latest finish, and its cost the budget lines tied to those tasks. A predecessor that is a summary task means after the last task inside it finishes. A summary\'s % complete is weighted by cost (by months where no cost is tied). % complete is for tracking: it does not change the dates, the draws or the returns.</div></div>';
    }
    chartBox = chartBox.replace('@@WBS@@', function(){ return wbsBar; });
    /* the quarterly bar picture this replaces */
    o.main = o.main.replace(/<div class="tbl-wrap"[^>]*>\s*<table class="fin"[^>]*>\s*<caption>Phase Timeline - by quarter<\/caption>[\s\S]*?<\/table>\s*<\/div>\s*(?:<div class="note-flag"[^>]*><span>[^<]*<\/span><div>Drawn from the same phase months[^<]*<\/div><\/div>)?/, '');
    var tie = '';
    if(M.plan){ var freeN = M.plan.rows.filter(function(r){ return !r.fromTask; }).length;
      tie = freeN ? '<div class="note-flag" style="margin-top:10px"><span>&#9432;</span><div><b>' + freeN + ' of ' + M.plan.rows.length + ' budget lines are not tied to a Gantt task.</b> Tie them and each line becomes a task (same name, same place, so no number moves), grouped under Hard cost, Contingency, Soft cost and FF&amp;E summaries that add up their dates, cost and % complete; from then on a line follows its task, so changing the task\'s start, duration or predecessors moves the cash. <button type="button" class="bk-btn primary" style="margin:0 6px" onclick="bkDevBudgetToTasks({wbs:true});showSheet(\'Dev Schedule\')">Make every line a task</button><button type="button" class="bk-btn" onclick="bkEdGo(\'Investment\',\'Investment\',\'bud\')">Budget lines</button></div></div>'
        : '<div class="note-flag" style="margin-top:10px"><span>&#10003;</span><div><b>All ' + M.plan.rows.length + ' budget lines follow a Gantt task.</b> Change a task below and its cash moves with it. <button type="button" class="bk-btn" style="margin-left:6px" onclick="bkEdGo(\'Investment\',\'Investment\',\'bud\')">Budget lines</button></div></div>'; }
    o.main += chartBox + tie + table;
  } catch(e){ o.main += '<div class="note-flag"><span>&#9888;</span><div>Gantt chart error: ' + esc(e.message) + '</div></div>'; }
  return o;
};
})();
