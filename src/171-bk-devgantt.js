/* ===========================================================================
   DEVELOPMENT SCHEDULE AS A GANTT. Tasks with a start and a duration in months, overlaps, and finish-to-start dependencies with a lead or lag. A forward and a
   backward pass give each task its earliest and latest dates, its float and whether it is on the critical path. The critical path runs to stabilisation:
   the construction tasks feed the certificate of occupancy, lease-up follows it, and stabilised operations follow lease-up.
   What the engine supports, the schedule drives: the first construction task's start sets the pre-development months, and the span of the construction tasks
   sets the construction months, so the draw curves, the construction facility, the certificate of occupancy and the lease-up all move with the tasks. The lease-up
   period itself still comes from the lease-up method (simple ramp or unit types), so it is shown as a linked row, not edited here.
   Until a schedule is switched on nothing changes: the chart is drawn from the engine's own phases. Switching it on seeds tasks that reproduce the phases exactly.
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
function normTasks(g){ return (g.tasks || []).map(function(t, i){ return { id:String(t.id || ('t' + (i + 1))), name:String(t.name || 'Task ' + (i + 1)), group:t.group === 'predev' || t.group === 'other' ? t.group : 'construction', start:has(t.start) && num(t.start) >= 1 ? Math.round(num(t.start)) : null, dur:Math.max(1, Math.round(num(t.dur) || 1)), milestone:!!t.milestone, preds:(Array.isArray(t.preds) ? t.preds : []).map(function(p){ return { id:String(p.id), lag:Math.round(num(p.lag)) }; }) }; }); }

/* Forward and backward pass over the task network. Months are 1-based and inclusive: a task that starts in month 4 with a 3-month duration finishes in month 6, and a
   finish-to-start successor with no lag starts in month 7 (a negative lag overlaps it with its predecessor). */
window.bkDevGanttSchedule = function(s, ov){
  s = s || bkLoad(); var g = s.devGantt || {}, T = normTasks(g), byId = {}, warnings = [], n = T.length;
  T.forEach(function(t){ byId[t.id] = t; });
  T.forEach(function(t){ t.preds = t.preds.filter(function(p){ if(!byId[p.id] || p.id === t.id){ warnings.push(t.name + ': a predecessor that does not exist was ignored.'); return false; } return true; }); t.succ = []; });
  T.forEach(function(t){ t.preds.forEach(function(p){ byId[p.id].succ.push({ id:t.id, lag:p.lag }); }); });
  /* forward pass, in dependency order (a cycle is reported and its tasks keep their manual starts) */
  var state = {}, order = [], cycle = false;
  (function visit(){ var tmp = {}; function dfs(t){ if(state[t.id] === 2) return; if(state[t.id] === 1){ cycle = true; return; } state[t.id] = 1; t.preds.forEach(function(p){ dfs(byId[p.id]); }); state[t.id] = 2; order.push(t); } T.forEach(dfs); })();
  if(cycle) warnings.push('The dependencies form a loop, so the schedule cannot be ordered. Remove one of them.');
  order.forEach(function(t){ var es = t.start || 1; if(!cycle) t.preds.forEach(function(p){ var q = byId[p.id]; if(q.EF !== undefined) es = Math.max(es, q.EF + 1 + p.lag); }); t.ES = Math.max(1, es); t.EF = t.ES + t.dur - 1; });
  T.forEach(function(t){ if(t.ES === undefined){ t.ES = t.start || 1; t.EF = t.ES + t.dur - 1; } });
  var cons = T.filter(function(t){ return t.group === 'construction'; }), pre = T.filter(function(t){ return t.group === 'predev'; });
  var conStart = cons.length ? Math.min.apply(null, cons.map(function(t){ return t.ES; })) : null, conEnd = cons.length ? Math.max.apply(null, cons.map(function(t){ return t.EF; })) : null;
  var x = ov || (typeof bkDevV09 === 'function' ? bkDevV09() : { luMo:0, hold:60 });
  var preMo = cons.length ? Math.max(0, conStart - 1) : num(x.preMo), conMo = cons.length ? conEnd - conStart + 1 : num(x.conMo), co = cons.length ? conEnd : num(x.co), luMo = num(x.luMo), stab = co + luMo, hold = Math.max(1, Math.round(num(x.hold) || num(s.holdYears) * 12));
  if(cons.length && pre.some(function(t){ return t.EF >= conStart; }) && false) warnings.push('');
  if(stab > hold) warnings.push('Stabilisation (month ' + stab + ') falls after the end of the analysis (month ' + hold + '). Lengthen the hold or shorten the schedule.');
  /* backward pass to stabilisation: construction tasks must finish by the certificate of occupancy; pre-development tasks without a successor must finish before construction starts */
  var finish = Math.max(co + luMo, T.reduce(function(a, t){ return Math.max(a, t.EF); }, 0)), project = cons.length ? co : finish;
  var LF = {}, LS = {};
  (function(){ var rev = order.slice().reverse(); rev.forEach(function(t){ var lf = Infinity; t.succ.forEach(function(sc){ if(LS[sc.id] !== undefined) lf = Math.min(lf, LS[sc.id] - 1 - sc.lag); });
    if(lf === Infinity) lf = t.group === 'construction' ? project : t.group === 'predev' ? (cons.length ? conStart - 1 : project) : t.EF;
    LF[t.id] = lf; LS[t.id] = lf - t.dur + 1; }); })();
  T.forEach(function(t){ t.LF = LF[t.id] !== undefined ? LF[t.id] : t.EF; t.LS = LS[t.id] !== undefined ? LS[t.id] : t.ES; t.float = t.LS - t.ES; t.critical = Math.abs(t.float) < 1e-9 && (t.group === 'construction' || t.succ.length > 0 || t.group === 'predev'); });
  /* only tasks that actually drive the end of construction (or the start of it) are on the critical path: a zero-float task with no relation to either is just on time */
  T.forEach(function(t){ if(t.critical && t.group === 'other' && !t.succ.length) t.critical = false; });
  T.forEach(function(t){ t.startDate = monthStart(s, t.ES); t.endDate = monthEnd(s, t.EF); });
  return { tasks:T, conStart:conStart, conEnd:conEnd, preMo:preMo, conMo:conMo, co:co, luMo:luMo, stab:stab, hold:hold, project:project, cycle:cycle, warnings:warnings, hasConstruction:cons.length > 0 };
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
window.bkDevGanttMode = function(mode){
  var s = bkLoad(); s.devGantt = Object.assign({}, s.devGantt || {});
  if(mode === 'tasks'){
    if(!Array.isArray(s.devGantt.tasks) || !s.devGantt.tasks.length){
      var x = bkDevV09(), pre = Math.max(0, Math.round(num(s.predevMonths))), con = Math.max(0, Math.round(num(s.constructionMonths))), T = [];
      if(pre > 0) T.push({ id:'t1', name:'Entitlements, design and permits', group:'predev', start:1, dur:pre, preds:[] });
      if(con > 0){
        var base = pre > 0 ? [{ id:'t1', lag:0 }] : [], st = pre > 0 ? null : 1, id = function(){ return 't' + (T.length + 1); };
        if(con < 4){ T.push({ id:id(), name:'Construction', group:'construction', start:st, dur:con, preds:base }); }
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
  if(key === 'name') t.name = txt || t.name;
  else if(key === 'group') t.group = txt === 'predev' || txt === 'other' ? txt : 'construction';
  else if(key === 'dur'){ var d = Math.round(Number(txt.replace(/[,\s]/g, ''))); if(!isFinite(d) || d < 1){ showSheet(cur()); return; } t.dur = d; }
  else if(key === 'start'){ if(txt === ''){ t.start = null; } else { var m = Math.round(Number(txt.replace(/[,\s]/g, ''))); if(!isFinite(m) || m < 1){ showSheet(cur()); return; } t.start = m; } }
  else if(key === 'startDate'){ var dt = typeof bkParseDealDate === 'function' ? bkParseDealDate(txt, null) : null; if(!dt || isNaN(dt.getTime())){ showSheet(cur()); return; } var sd = startDate(s), mo = (dt.getFullYear() - sd.getFullYear()) * 12 + (dt.getMonth() - sd.getMonth()) + 1; if(mo < 1){ showSheet(cur()); return; } t.start = mo; }
  else if(key === 'preds'){ t.preds = parsePreds(txt, T.map(function(q){ return { id:q.id }; }), t.id); }
  else if(key === 'milestone'){ t.milestone = txt === 'true'; if(t.milestone) t.dur = 1; }
  save(s);
};
window.bkDevGanttAdd = function(){ var s = bkLoad(), g = s.devGantt = Object.assign({}, s.devGantt || {}); g.tasks = (g.tasks || []).slice(); g.tasks.push({ id:nextId(g.tasks), name:'New task', group:'construction', start:1, dur:3, preds:[] }); save(s); };
window.bkDevGanttRemove = function(i){ var s = bkLoad(), g = s.devGantt = Object.assign({}, s.devGantt || {}), T = g.tasks || [], id = T[i] && T[i].id; g.tasks = T.filter(function(t, k){ return k !== i; }).map(function(t){ return Object.assign({}, t, { preds:(t.preds || []).filter(function(p){ return p.id !== id; }) }); }); if(!g.tasks.length) g.mode = 'phases'; save(s); };

/* ------------------------------------------------------------------ the chart ------------------------------------------------------------------ */
var COL = { predev:'#7a8da1', construction:'#2E6E6E', other:'#8a6d2f', leaseup:'#2f5f9a', ops:'#9aa7b4', crit:'#b3392c' };
function gantt(rows, x, s){
  var hold = Math.max(x.hold, x.stab + 1), pxm = Math.max(5, Math.min(14, Math.floor(640 / hold))), L = 250, rowH = 26, top = 44, W = L + hold * pxm + 24, H = top + rows.length * rowH + 12;
  var X = function(m){ return L + (m - 1) * pxm; };
  var g = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Development schedule Gantt chart, by month" style="max-width:none">';
  for(var y = 1; y <= Math.ceil(hold / 12); y++){ var m0 = (y - 1) * 12 + 1, w = Math.min(12, hold - m0 + 1) * pxm; g += '<rect x="' + X(m0) + '" y="6" width="' + w + '" height="' + (H - 12) + '" fill="' + (y % 2 ? 'rgba(120,140,160,.07)' : 'transparent') + '"/><text x="' + (X(m0) + w / 2) + '" y="20" text-anchor="middle" font-size="11" font-weight="700" fill="var(--ae-dim,#5a6877)">Year ' + y + '</text>'; }
  var step = pxm >= 9 ? 1 : pxm >= 6 ? 3 : 6; for(var m = 1; m <= hold; m += step){ if(m === 1 || m % (step === 1 ? 3 : step) === 0 || step > 1) g += '<text x="' + (X(m) + pxm / 2) + '" y="36" text-anchor="middle" font-size="9" fill="var(--ae-dim,#5a6877)">' + m + '</text>'; }
  g += '<line x1="' + L + '" x2="' + (W - 14) + '" y1="' + (top - 4) + '" y2="' + (top - 4) + '" stroke="var(--ae-line,#c9d1dc)"/>';
  rows.forEach(function(r, i){ var y0 = top + i * rowH, cy = y0 + rowH / 2;
    g += '<text x="8" y="' + (cy + 4) + '" font-size="12" fill="var(--ae-ink,#1b2733)" font-weight="' + (r.linked ? 400 : 600) + '">' + esc(String(r.name).slice(0, 36)) + '</text>';
    g += '<line x1="' + L + '" x2="' + (W - 14) + '" y1="' + (y0 + rowH) + '" y2="' + (y0 + rowH) + '" stroke="var(--ae-line,#e1e6ec)" stroke-width=".5"/>';
    if(r.milestone){ var cx = X(r.ES) + pxm / 2; g += '<path d="M' + cx + ',' + (cy - 8) + ' L' + (cx + 8) + ',' + cy + ' L' + cx + ',' + (cy + 8) + ' L' + (cx - 8) + ',' + cy + ' Z" fill="' + (r.critical ? COL.crit : '#1b2733') + '"><title>' + esc(r.name) + ': month ' + r.ES + '</title></path>'; }
    else { var w2 = Math.max(pxm, (r.EF - r.ES + 1) * pxm); g += '<rect x="' + X(r.ES) + '" y="' + (cy - 7) + '" width="' + w2 + '" height="14" rx="2" fill="' + r.color + '"' + (r.critical ? ' stroke="' + COL.crit + '" stroke-width="2"' : '') + '><title>' + esc(r.name) + ': months ' + r.ES + ' to ' + r.EF + (r.float > 0 ? ' (float ' + r.float + ')' : '') + '</title></rect>'; }
    if(r.float > 0 && !r.linked){ g += '<line x1="' + (X(r.EF) + pxm) + '" x2="' + (X(r.EF) + pxm + r.float * pxm) + '" y1="' + cy + '" y2="' + cy + '" stroke="var(--ae-dim,#8a97a5)" stroke-dasharray="2 2"/>'; } });
  /* dependency lines: from the end of a predecessor to the start of its successor */
  var idx = {}; rows.forEach(function(r, i){ if(r.id) idx[r.id] = i; });
  rows.forEach(function(r, i){ (r.preds || []).forEach(function(p){ var j = idx[p.id]; if(j === undefined) return; var q = rows[j], x1 = X(q.EF) + pxm, y1 = top + j * rowH + rowH / 2, x2 = X(r.ES), y2 = top + i * rowH + rowH / 2, mx = Math.max(x1, x2 - 4);
    g += '<path d="M' + x1 + ',' + y1 + ' H' + (x1 + 3) + ' V' + y2 + ' H' + x2 + '" fill="none" stroke="' + ((r.critical && q.critical) ? COL.crit : 'var(--ae-dim,#7d8b99)') + '" stroke-width="1" marker-end=""/>'; }); });
  return g + '</svg>';
}
function rowsFor(s, sc, x){
  var rows = sc.tasks.map(function(t){ return { id:t.id, name:t.name, ES:t.ES, EF:t.EF, float:t.float, critical:t.critical, milestone:t.milestone, preds:t.preds, color:COL[t.group] || COL.construction }; });
  rows.push({ name:'Certificate of occupancy', ES:sc.co, EF:sc.co, milestone:true, critical:true, linked:true, float:0 });
  if(sc.luMo > 0) rows.push({ id:'lu', name:'Lease-up (from the lease-up method)', ES:sc.co + 1, EF:sc.co + sc.luMo, critical:true, linked:true, float:0, color:COL.leaseup, preds:[] });
  rows.push({ name:'Stabilised operations', ES:sc.stab, EF:Math.max(sc.stab, sc.hold), linked:true, float:0, color:COL.ops });
  rows.push({ name:'Sale / exit', ES:sc.hold, EF:sc.hold, milestone:true, linked:true, float:0 });
  return rows;
}
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
    var x = bkDevV09(), on = window.bkDevGanttOn(s), sc, tasks, warnings = [];
    if(on){ sc = window.bkDevGanttSchedule(s, x); tasks = sc.tasks; warnings = sc.warnings; }
    else { tasks = phaseTasks(s, x); sc = { tasks:tasks, co:x.co, luMo:x.luMo, stab:x.stab, hold:x.hold, conStart:x.preMo + 1, preMo:x.preMo, conMo:x.conMo }; }
    var rows = rowsFor(s, sc, x), html;
    var head = '<div class="ae-form" style="margin:0 0 8px"><label style="font-weight:600">Schedule</label> <select onchange="bkDevGanttMode(this.value)"><option value="phases"' + (on ? '' : ' selected') + '>Phase durations (pre-development, construction, lease-up)</option><option value="tasks"' + (on ? ' selected' : '') + '>Task schedule (overlaps, dependencies, critical path)</option></select></div>';
    var chartBox = '<div class="tbl-wrap" style="margin-top:16px"><div style="padding:10px 12px"><b>Gantt chart, by month</b>' + head
      + '<div style="overflow-x:auto" class="bk-scrollable">' + gantt(rows, x, s) + '</div>'
      + '<div style="font-size:12px;margin-top:6px;opacity:.85"><span style="color:' + COL.crit + '">&#9632;</span> Critical path (no float) &nbsp; <span style="color:' + COL.construction + '">&#9632;</span> Construction &nbsp; <span style="color:' + COL.predev + '">&#9632;</span> Pre-development &nbsp; <span style="color:' + COL.leaseup + '">&#9632;</span> Lease-up &nbsp; &#9670; Milestone &nbsp; <span style="opacity:.8">- - float</span></div>'
      + (on ? '' : '<div class="note-flag" style="margin-top:8px"><span>&#9432;</span><div><b>Drawn from the phase durations.</b> Choose <b>Task schedule</b> to break construction into overlapping tasks with dependencies. It starts as tasks that reproduce these phases exactly, so nothing moves until you edit them.</div></div>') + '</div></div>';
    var table = '';
    if(on){
      var T = sc.tasks, hdr = '<tr><th class="rowlabel-h">#</th><th>Task</th><th>Group</th><th>Start no earlier than<br><small>month</small></th><th>or date<br><small>M/D/YYYY</small></th><th>Duration<br><small>months</small></th><th>Predecessors<br><small>e.g. 2, 3-2 (overlap 2)</small></th><th>Start</th><th>Finish</th><th>Float</th><th>Critical</th><th></th></tr>';
      var body = T.map(function(t, i){ var raw = (s.devGantt.tasks[i] || {}), pr = t.preds.map(function(p){ var k = T.findIndex(function(q){ return q.id === p.id; }) + 1; return k + (p.lag ? (p.lag > 0 ? '+' : '') + p.lag : ''); }).join(', ');
        return '<tr class="input"><td class="rowlabel">' + (i + 1) + '</td><td class="v"><input type="text" style="width:190px;text-align:left !important" value="' + esc(t.name) + '" onchange="bkDevGanttField(' + i + ',\'name\',this.value)"></td>'
          + '<td class="v"><select onchange="bkDevGanttField(' + i + ',\'group\',this.value)">' + GROUPS.map(function(gp){ return '<option value="' + gp[0] + '"' + (t.group === gp[0] ? ' selected' : '') + '>' + gp[1] + '</option>'; }).join('') + '</select></td>'
          + '<td class="v"><input type="number" step="1" min="1" style="width:70px" value="' + (has(raw.start) ? raw.start : '') + '" placeholder="auto" onchange="bkDevGanttField(' + i + ',\'start\',this.value)"></td>'
          + '<td class="v"><input type="text" style="width:100px" value="' + esc(has(raw.start) ? monthStart(s, num(raw.start)).toLocaleDateString('en-US') : '') + '" placeholder="auto" onchange="bkDevGanttField(' + i + ',\'startDate\',this.value)"></td>'
          + '<td class="v"><input type="number" step="1" min="1" style="width:70px" value="' + t.dur + '" onchange="bkDevGanttField(' + i + ',\'dur\',this.value)"></td>'
          + '<td class="v"><input type="text" style="width:110px;text-align:left !important" value="' + esc(pr) + '" placeholder="none" onchange="bkDevGanttField(' + i + ',\'preds\',this.value)"></td>'
          + '<td>' + t.ES + ' &middot; ' + fmtD(t.startDate) + '</td><td>' + t.EF + ' &middot; ' + fmtD(t.endDate) + '</td><td>' + t.float + '</td><td>' + (t.critical ? '<span class="status-chip fail">CRITICAL</span>' : '') + '</td>'
          + '<td><button type="button" class="bk-btn" onclick="bkDevGanttRemove(' + i + ')">Remove</button></td></tr>'; }).join('');
      var link = '<tr class="grandtotal"><td class="rowlabel" colspan="2">What the schedule drives</td><td colspan="10" data-bk-align="text">Pre-development ' + sc.preMo + ' months &middot; construction ' + sc.conMo + ' months (months ' + sc.conStart + ' to ' + sc.conEnd + ') &middot; certificate of occupancy month ' + sc.co + ' &middot; lease-up ' + sc.luMo + ' months &middot; stabilised month ' + sc.stab + '. The construction draws, facility and lease-up all move with these.</td></tr>';
      table = '<div class="tbl-wrap" style="margin-top:12px"><div style="overflow-x:auto"><table class="fin bk-m-scroll" style="table-layout:auto !important;width:max-content !important;min-width:1180px !important;max-width:none !important"><caption>Tasks, dependencies and critical path</caption><thead>' + hdr + '</thead><tbody>' + body + link + '</tbody></table></div></div>'
        + '<div style="margin:8px 0"><button type="button" class="bk-btn" onclick="bkDevGanttAdd()">+ Add task</button></div>'
        + (warnings.length ? '<div class="note-flag"><span>&#9888;</span><div>' + warnings.map(esc).join('<br>') + '</div></div>' : '')
        + '<div class="note-flag"><span>&#9432;</span><div>Months count from the analysis start (month 1 is the closing month). A predecessor links finish to start; <b>3-2</b> starts the task two months before task 3 finishes (an overlap) and <b>3+1</b> a month after. The critical path is the chain of tasks with no float to the certificate of occupancy. Pre-development and construction months are set from the first and last construction task; the lease-up months come from the lease-up method.</div></div>';
    }
    /* the quarterly bar picture this replaces */
    o.main = o.main.replace(/<div class="tbl-wrap"[^>]*>\s*<table class="fin"[^>]*>\s*<caption>Phase Timeline - by quarter<\/caption>[\s\S]*?<\/table>\s*<\/div>\s*(?:<div class="note-flag"[^>]*><span>[^<]*<\/span><div>Drawn from the same phase months[^<]*<\/div><\/div>)?/, '');
    o.main += chartBox + table;
  } catch(e){ o.main += '<div class="note-flag"><span>&#9888;</span><div>Gantt chart error: ' + esc(e.message) + '</div></div>'; }
  return o;
};
})();
