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
/* A detailed starting schedule for the task view. Each task is placed by a fraction of its phase (start fraction, end fraction) and linked to the task it follows, with the lead or lag that reproduces that placement, so the span of the
   pre-development tasks and of the construction tasks is exactly the phase months already in the deal: switching to tasks moves nothing in the engine. The sequencing is a conventional one for mid-rise multifamily and is an
   ASSUMPTION to edit (it is not read from any document); the engine times costs on its own draw curves, not on these dates. */
var DETAIL_PRE = [['Site assessment and due diligence', 0, .25, null], ['Entitlements and approvals', .10, .70, 0], ['Design development', .20, .65, 0], ['Construction documents', .50, .90, 2], ['Permits and GMP pricing', .70, 1, 3]];
var DETAIL_CON = [['Mobilisation and site clearing', 0, .06, null], ['Excavation and shoring', .04, .20, 0], ['Foundations', .15, .32, 1], ['Structure: podium and frame', .28, .62, 2], ['Envelope, glazing and roofing', .45, .75, 3], ['MEP rough-in', .42, .78, 3],
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
/* the Punchlist colour scale: slate violet, olive gold (dark to light), cream with a gold outline */
var COL = { predev:'#8a8fb0', construction:'#8c7a28', other:'#a99136', leaseup:'#c9b25f', ops:'#efe6cb', opsLine:'#c4a94a', crit:'#b3392c', ms:'#1b2733' };
function onCol(c){ var h = String(c).replace('#', ''), r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16), L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; return L > 0.62 ? '#4a3f12' : '#fff'; }
function dtx(d){ return d.toLocaleDateString('en-US', { month:'short', year:'numeric' }); }
function monthsText(n){ return n + (n === 1 ? ' month' : ' months'); }

/* The chart. Calendar years and month numbers across the top, the three milestones flagged above the grid, a band for each section (pre-development, construction, other tasks, lease-up and
   operations), the task number and name on the left, each bar labelled with its duration, float as a dashed tail, dependencies as arrows, the critical path outlined in red.
   o.print draws it in fixed colours for paper; o.W is the width in drawing units (it scales to the space it is put in). */
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
  var segs = [['Pre-development', 1, num(sc.preMo), COL.predev], ['Construction', num(sc.preMo) + 1, num(sc.co), COL.construction], ['Lease-up', num(sc.co) + 1, num(sc.stab) - 1 > num(sc.co) ? num(sc.stab) - 1 : num(sc.co), COL.leaseup], ['Stabilised operations', num(sc.stab), hold, COL.ops]];
  if(num(sc.luMo) <= 0) segs.splice(2, 1);
  segs.forEach(function(sg){ if(sg[2] < sg[1]) return; var x0 = X(sg[1]), w = (sg[2] - sg[1] + 1) * pxm; g += '<rect x="' + x0 + '" y="6" width="' + w + '" height="18" fill="' + sg[3] + '"' + (sg[3] === COL.ops ? ' stroke="' + COL.opsLine + '" stroke-width="1.2"' : '') + ' opacity=".95"><title>' + esc(sg[0]) + ': months ' + sg[1] + ' to ' + sg[2] + '</title></rect>';
    var cnt = sg[0] === 'Lease-up' ? num(sc.luMo) : (sg[2] - sg[1] + 1), full = sg[0] + ' · ' + cnt + ' mo', short = sg[0].replace('Pre-development', 'Pre-dev').replace('Stabilised operations', 'Stabilised') + ' · ' + cnt;
    if(w > full.length * 6.4 + 10) g += '<text x="' + (x0 + w / 2) + '" y="19" text-anchor="middle" font-size="11" font-weight="700" fill="' + onCol(sg[3]) + '">' + esc(full) + '</text>'; else if(w > short.length * 6.4 + 8) g += '<text x="' + (x0 + w / 2) + '" y="19" text-anchor="middle" font-size="10" font-weight="700" fill="' + onCol(sg[3]) + '">' + esc(short) + '</text>'; });
  g += '<text x="' + (Lw - 10) + '" y="19" text-anchor="end" font-size="10.5" font-weight="700" fill="' + dim + '" letter-spacing=".06em">PHASES</text>';
  /* milestone flags (Closing is month 1) */
  var ms = [['Certificate of occupancy', num(sc.co), COL.crit], ['Stabilised', num(sc.stab), COL.leaseup], ['Sale / exit', num(sc.hold), COL.ms]].filter(function(m){ return m[1] > 0; }).sort(function(a, b){ return a[1] - b[1]; });
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
    var cy = it.y + it.h / 2, nm = String(it.name || ''), lim = Math.floor((Lw - 34) / 6.5), shown = nm.length > lim ? nm.slice(0, lim - 1) + '…' : nm;
    g += '<line x1="6" x2="' + (W - 6) + '" y1="' + (it.y + it.h) + '" y2="' + (it.y + it.h) + '" stroke="' + line + '" stroke-width=".6"/>';
    if(it.idx) g += '<text x="12" y="' + (cy + 4) + '" font-size="10.5" fill="' + dim + '">' + it.idx + '</text>';
    g += '<text x="' + (it.idx ? 30 : 12) + '" y="' + (cy + 4) + '" font-size="12" fill="' + ink + '" font-weight="' + (it.linked ? 400 : 600) + '">' + esc(shown) + (shown !== nm ? '<title>' + esc(nm) + '</title>' : '') + '</text>';
    if(it.critical && !it.linked) g += '<rect x="6" y="' + (cy - 7) + '" width="3" height="14" fill="' + COL.crit + '"/>';
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
   grid across the top with the calendar year above it, milestone call-outs, and a vertical line at the certificate of occupancy and at stabilisation. It draws the same rows the chart does; it adds no schedule of its own. */
var GX = { crit:'#b3392c', band:'#c9ced8', head:'#cfd3db', sum:'#00b050', task:'#92d050', cell:'#f1f3f6', cellAlt:'#e6e9ee', line:'#b9bfca', ink:'#10213a', ms:'#2f7d32' };
function ganttSheet(M, o){
  o = o || {}; var s = M.s, sc = M.sc, rows = M.rows, N = Math.max(sc.hold || 0, sc.stab || 0, 12), cw = N > 72 ? 11 : N > 48 ? 14 : 18, y0 = startYear(s);
  var yr = function(m){ return monthStart(s, m).getFullYear(); }, yearRuns = [], last = null;
  for(var m = 1; m <= N; m++){ var y = yr(m); if(last && last.y === y) last.n++; else { last = { y:y, n:1 }; yearRuns.push(last); } }
  var vline = function(m){ return m === sc.co ? 'border-right:2px solid ' + GX.ms : m === sc.stab ? 'border-right:2px dashed ' + GX.ms : ''; };
  var yi = {}; var yk = 0; yearRuns.forEach(function(r){ r.alt = (yk++ % 2) === 1; });
  var colAlt = function(m){ var k = 0, acc = 0; for(var i = 0; i < yearRuns.length; i++){ acc += yearRuns[i].n; if(m <= acc) return yearRuns[i].alt; } return false; };
  var th = 'background:' + GX.head + ';color:' + GX.ink + ';font-weight:600;border:1px solid ' + GX.line + ';padding:3px 6px;font-size:11px;white-space:nowrap';
  var h = '<div class="bk-gx" style="overflow-x:auto;border:1px solid ' + GX.line + ';border-radius:4px;background:#fff;margin-top:8px"><table style="border-collapse:collapse;table-layout:fixed;width:100%;min-width:' + (496 + N * 8) + 'px;font-size:12px;color:' + GX.ink + ';font-variant-numeric:tabular-nums"><colgroup><col style="width:36px"><col style="width:190px"><col style="width:78px"><col style="width:78px"><col style="width:48px"><col style="width:54px">';
  for(var c = 1; c <= N; c++) h += '<col>';
  h += '</colgroup><thead><tr><th style="' + th + ';text-align:center" rowspan="2">#</th><th style="' + th + ';text-align:left" rowspan="2">Task</th><th style="' + th + ';text-align:right" rowspan="2">Start</th><th style="' + th + ';text-align:right" rowspan="2">End</th><th style="' + th + ';text-align:right" rowspan="2">Months</th><th style="' + th + ';text-align:left" rowspan="2" title="Predecessor rows; +n / -n is a lag / overlap in months">Pred.</th>';
  yearRuns.forEach(function(r){ h += '<th colspan="' + r.n + '" style="' + th + ';text-align:center">' + (r.n >= 3 ? r.y : '') + '</th>'; });
  h += '</tr><tr>'; for(var c2 = 1; c2 <= N; c2++) h += '<th style="' + th + ';text-align:center;font-size:9px;padding:2px 0;font-weight:500;overflow:hidden">' + (N <= 18 || (N <= 36 && c2 % 3 === 1) || (N > 36 && c2 % 6 === 1) ? c2 : '') + '</th>'; h += '</tr></thead><tbody>';
  var cellsFor = function(rowBars, ms, bold, crit){
    var out = ''; for(var m2 = 1; m2 <= N; m2++){ var inBar = rowBars && m2 >= rowBars.a && m2 <= rowBars.b, edge = (inBar ? '' : ''), bg = inBar ? rowBars.col : (bold ? GX.band : (colAlt(m2) ? GX.cellAlt : GX.cell));
      var mark = ms && m2 === ms.m ? '<span title="' + esc(ms.label) + '" style="display:block;width:11px;height:11px;margin:0 auto;background:' + GX.ms + ';transform:rotate(45deg)"></span>' : '';
      out += '<td' + (inBar ? ' data-bar="' + (bold ? 'sum' : 'task') + '"' + (crit ? ' data-crit="1"' : '') : '') + (ms && m2 === ms.m ? ' data-ms="1"' : '') + ' style="padding:0;height:22px;background:' + bg + ';border:1px solid ' + (inBar ? (crit ? GX.crit : rowBars.col) : '#d9dde4') + ';' + vline(m2) + '">' + mark + '</td>'; }
    return out; };
  var tdl = function(txt, al, b){ return '<td style="padding:3px 6px;border:1px solid ' + GX.line + ';text-align:' + al + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:' + (al === 'right' ? 11.5 : 12) + 'px;' + (b ? 'font-weight:700;background:' + GX.band : 'background:#fff') + '">' + txt + '</td>'; };
  var secs = []; rows.forEach(function(r){ if(!secs.length || secs[secs.length - 1].name !== r.sec) secs.push({ name:r.sec, rows:[] }); secs[secs.length - 1].rows.push(r); });
  var idxById = {}; rows.forEach(function(r){ if(r.id) idxById[r.id] = r.idx; });
  var predText = function(r){ return (r.preds || []).map(function(pd){ return (idxById[pd.id] || '?') + (pd.lag ? (pd.lag > 0 ? '+' : '') + pd.lag : ''); }).join(', '); };
  var n = 0;
  secs.forEach(function(g){
    var bars = g.rows.filter(function(r){ return !r.milestone && r.ES && r.EF; }), a = bars.length ? Math.min.apply(null, bars.map(function(r){ return r.ES; })) : null, b2 = bars.length ? Math.max.apply(null, bars.map(function(r){ return r.EF; })) : null;
    h += '<tr>' + tdl('', 'center', true) + tdl(esc(g.name), 'left', true) + tdl(a ? esc(dtx(monthStart(s, a))) : '', 'right', true) + tdl(b2 ? esc(dtx(monthEnd(s, b2))) : '', 'right', true) + tdl(a ? String(b2 - a + 1) : '', 'right', true) + tdl('', 'left', true) + cellsFor(a ? { a:a, b:b2, col:GX.sum } : null, null, true, false) + '</tr>';
    g.rows.forEach(function(r){ n++; var ms = r.milestone ? { m:r.ES, label:r.name + ': ' + dtx(monthEnd(s, r.ES)) } : null, dur = r.EF - r.ES + 1;
      h += '<tr>' + tdl(r.idx ? String(r.idx) : '', 'center') + tdl((r.milestone ? '&#9670; ' : '') + esc(r.name), 'left') + tdl(r.ES ? esc(dtx(monthStart(s, r.ES))) : '', 'right') + tdl(r.EF ? esc(dtx(monthEnd(s, r.EF))) : '', 'right') + tdl(r.milestone ? '' : String(dur), 'right') + tdl(predText(r), 'left')
        + cellsFor(r.milestone ? null : { a:r.ES, b:r.EF, col:GX.task }, ms, false, !!r.critical && !r.milestone) + '</tr>'; }); });
  h += '</tbody></table></div><div style="font-size:11px;opacity:.8;margin-top:5px"><span style="display:inline-block;width:14px;height:9px;background:' + GX.sum + ';margin-right:4px"></span>Phase &nbsp; <span style="display:inline-block;width:14px;height:9px;background:' + GX.task + ';margin-right:4px"></span>Task &nbsp; <span style="display:inline-block;width:14px;height:9px;background:' + GX.task + ';border:2px solid ' + GX.crit + ';box-sizing:border-box;margin-right:4px"></span>Critical path &nbsp; <span style="display:inline-block;width:9px;height:9px;background:' + GX.ms + ';transform:rotate(45deg);margin:0 6px 0 2px"></span>Milestone &nbsp; <span style="display:inline-block;width:0;height:11px;border-right:2px solid ' + GX.ms + ';margin:0 6px 0 2px;vertical-align:-2px"></span>Certificate of occupancy &nbsp; <span style="display:inline-block;width:0;height:11px;border-right:2px dashed ' + GX.ms + ';margin:0 6px 0 2px;vertical-align:-2px"></span>Stabilisation</div>';
  return h;
}
function startYear(s){ return startDate(s).getFullYear(); }
function legendHtml(P){ var c = function(col){ return '<span style="display:inline-block;width:10px;height:10px;background:' + col + ';' + (col === COL.ops ? 'outline:1px solid ' + COL.opsLine + ';outline-offset:-1px;' : '') + 'margin-right:4px;vertical-align:-1px"></span>'; }; return '<div class="bk-gs-legend" style="font-size:' + (P ? 10.5 : 12) + 'px;margin-top:6px;opacity:.9"><span style="display:inline-block;width:10px;height:10px;border:2px solid ' + COL.crit + ';margin-right:4px;vertical-align:-3px"></span>Critical path (no float) &nbsp; ' + c(COL.predev) + 'Pre-development &nbsp; ' + c(COL.construction) + 'Construction &nbsp; ' + c(COL.other) + 'Other task &nbsp; ' + c(COL.leaseup) + 'Lease-up &nbsp; ' + c(COL.ops) + 'Stabilised operations &nbsp; &#9670; Milestone &nbsp; <span style="opacity:.8">- - float (months of slack)</span> &nbsp; &#8594; dependency</div>'; }
function rowsFor(s, sc, x){
  var rows = [], secName = { predev:'Pre-development', construction:'Construction', other:'Other tasks' }, order = ['predev', 'construction', 'other'];
  order.forEach(function(gp){ sc.tasks.forEach(function(t, i){ if((t.group || 'construction') !== gp) return; rows.push({ id:t.id, idx:i + 1, sec:secName[gp], name:t.name, ES:t.ES, EF:t.EF, float:t.float, critical:t.critical, milestone:t.milestone, preds:t.preds, color:COL[t.group] || COL.construction, group:t.group }); }); });
  rows.push({ sec:'Lease-up and operations', name:'Certificate of occupancy', ES:sc.co, EF:sc.co, milestone:true, critical:true, linked:true, float:0 });
  if(sc.luMo > 0) rows.push({ id:'lu', sec:'Lease-up and operations', name:'Lease-up (from the lease-up method)', ES:sc.co + 1, EF:sc.co + sc.luMo, critical:true, linked:true, float:0, color:COL.leaseup, preds:[] });
  rows.push({ sec:'Lease-up and operations', name:'Stabilised operations', ES:sc.stab, EF:Math.max(sc.stab, sc.hold), linked:true, float:0, color:COL.ops });
  rows.push({ sec:'Lease-up and operations', name:'Sale / exit', ES:sc.hold, EF:sc.hold, milestone:true, linked:true, float:0 });
  return rows;
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
  return { s:s, x:x, on:on, indicative:indicative, sc:sc, warnings:warnings, rows:rowsFor(s, sc, x), svg:ganttSvg, legend:legendHtml, monthStart:function(m){ return monthStart(s, m); }, monthEnd:function(m){ return monthEnd(s, m); }, fmt:dtx };
};
function tilesHtml(M){
  var sc = M.sc, s = M.s, crit = sc.tasks.filter(function(t){ return t.critical; }).length, T = function(k, v, sub){ return '<div class="bk-gs-tile"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div>' + (sub ? '<div class="d">' + esc(sub) + '</div>' : '') + '</div>'; };
  return '<div class="bk-gs-tiles">' + T('To stabilisation', monthsText(sc.stab), dtx(monthStart(s, 1)) + ' to ' + dtx(monthEnd(s, sc.stab)))
    + T('Pre-development', monthsText(sc.preMo || 0), sc.preMo ? dtx(monthStart(s, 1)) + ' to ' + dtx(monthEnd(s, sc.preMo)) : 'none')
    + T('Construction', monthsText(sc.conMo || 0), sc.conMo ? dtx(monthStart(s, sc.preMo + 1)) + ' to ' + dtx(monthEnd(s, sc.co)) : 'none')
    + T('Certificate of occupancy', dtx(monthEnd(s, sc.co)), 'month ' + sc.co)
    + T('Lease-up', monthsText(sc.luMo || 0), sc.luMo ? dtx(monthStart(s, sc.co + 1)) + ' to ' + dtx(monthEnd(s, sc.stab)) : 'none')
    + T('Stabilised', dtx(monthStart(s, sc.stab)), 'month ' + sc.stab)
    + T(M.on ? 'Critical tasks' : 'Schedule from', M.on ? crit + ' of ' + sc.tasks.length : 'phase durations', M.on ? 'zero float to the CO' : 'switch to a task schedule for float') + '</div>'; }
var css = document.createElement('style'); css.id = 'bk-gs-css'; css.textContent = '.bk-gs-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:10px 0}.bk-gs-tile{border:1px solid var(--ae-line,#d3dae2);padding:7px 10px;background:var(--ae-cell-ro,transparent)}.bk-gs-tile .k{font-size:10px;letter-spacing:.09em;text-transform:uppercase;opacity:.7;font-weight:700}.bk-gs-tile .v{font-size:16px;font-weight:700;margin:2px 0}.bk-gs-tile .d{font-size:11px;opacity:.75}.bk-gs-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0 10px}'; document.head.appendChild(css);

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
      + ((!on && !(num(x.preMo) + num(x.conMo) + num(x.luMo) > 0)) ? '' : tilesHtml(M)) + '<div class="bk-gs-bar"><button type="button" class="bk-btn primary" onclick="bkDevScheduleReport()">Schedule summary (PDF)</button><span style="font-size:12px;opacity:.8">A full printable summary: key dates, the Gantt chart, the task schedule, the funding timeline and what a delay costs.</span></div>'
      + ((!on && !(num(x.preMo) + num(x.conMo) + num(x.luMo) > 0)) ? '<div class="note-flag" style="margin-top:10px"><span>&#9432;</span><div><b>No schedule to draw yet.</b> Pre-development, construction and lease-up months are all blank, so there are no phases to chart. Enter them under the development inputs (or choose Task schedule) and the Gantt chart appears here.</div></div>' : ganttSheet(M))
      + (on ? '' : '<div class="note-flag" style="margin-top:8px"><span>&#9432;</span><div><b>Drawn from the phase durations.</b> ' + (M.indicative ? 'The tasks inside each phase are an <b>indicative breakdown</b> with assumed sequencing (same start and finish as the phases, nothing moves). ' : '') + '<button type="button" class="bk-btn" style="margin:0 6px" onclick="bkDevGanttMode(\'tasks\')">Edit as a task schedule</button> to change task durations, overlaps and dependencies. It starts as tasks that reproduce these phases exactly, so nothing moves until you edit them.</div></div>') + '</div></div>';
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
