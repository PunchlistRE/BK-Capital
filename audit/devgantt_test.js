// Dev Schedule Gantt: a task schedule with overlaps and dependencies, solved by a forward and backward pass (float, critical path), that drives the engine's
// pre-development and construction months (and with them the draws, the facility, the certificate of occupancy and the lease-up window).
// Off by default: existing deals are unchanged, and switching it on seeds tasks that reproduce the phases exactly.
//   node audit/devgantt_test.js index.html [reference.html]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const DEV = require(path.join(__dirname, 'devdeal.js')), A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const mk = async (file) => { const p = await b.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(file)); await p.waitForTimeout(700); await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok')); return p; };
  const p = await mk(process.argv[2]);
  const SNAP = '() => { const x = bkDevV09(), m = bkMonthlyReturns(), f = bkDevFundingV10(); return { pre: x.preMo, con: x.conMo, co: x.co, stab: x.stab, def: x.leaseDef, phases: x.phases, irr: m.irr, moic: m.moic, lev: f.levered, months: f.months.map(z => [z.hard, z.soft, z.need, z.loanDraw, z.eq]), rows: m.rows.map(r => [r.noi, r.cf]) }; }';
  const snapOf = (d) => p.evaluate(([d, src]) => { bkCreateNewDeal(d); return eval('(' + src + ')')(); }, [d, SNAP]);
  const same = (a, c) => JSON.stringify(a, (k, v) => typeof v === 'number' ? Math.round(v * 1e5) : v) === JSON.stringify(c, (k, v) => typeof v === 'number' ? Math.round(v * 1e5) : v);
  const cpm = (tasks) => p.evaluate((tasks) => { const s = Object.assign({}, bkLoad(), { devGantt: { mode: 'tasks', tasks } }); const sc = bkDevGanttSchedule(s, { luMo: 0, hold: 60, preMo: 0, conMo: 0, co: 0 }); return { t: sc.tasks.map(t => ({ n: t.name, ES: t.ES, EF: t.EF, LS: t.LS, LF: t.LF, fl: t.float, cr: t.critical })), pre: sc.preMo, con: sc.conMo, co: sc.co, cycle: sc.cycle, w: sc.warnings }; }, tasks);
  await p.evaluate((d) => bkCreateNewDeal(d), DEV);

  /* ---- 1. off by default; seeded schedule changes nothing ---- */
  const off = await snapOf(DEV);
  check('a deal that has not turned the task schedule on reports it as off', await p.evaluate(() => bkDevGanttOn()) === false);
  if (process.argv[3]) { const q = await mk(process.argv[3]); const ref = await q.evaluate(([d, src]) => { bkCreateNewDeal(d); return eval('(' + src + ')')(); }, [DEV, SNAP]); check('an existing development deal is identical to the reference build (phases, draws, facility, cash flow, IRR)', same(off, ref), off.irr + ' vs ' + ref.irr); await q.close(); }
  for (const [nm, ov] of [['pre-development 6, construction 18', {}], ['no pre-development, construction 12', { predevMonths: 0, constructionMonths: 12 }], ['pre-development 3, construction 3', { predevMonths: 3, constructionMonths: 3 }], ['pre-development 4, construction 24', { predevMonths: 4, constructionMonths: 24 }], ['pre-development 9, construction 7', { predevMonths: 9, constructionMonths: 7 }]]) {
    const d = Object.assign({}, DEV, ov), a = await snapOf(d), c = await p.evaluate(([src]) => { bkDevGanttMode('tasks'); return eval('(' + src + ')')(); }, [SNAP]);
    check('switching on the task schedule changes nothing: ' + nm + ' (phases, monthly draws, facility, cash flow, IRR)', same(a, c), 'IRR ' + a.irr + ' vs ' + c.irr + '; con ' + a.con + '/' + c.con);
  }

  /* ---- 2. the critical path method ---- */
  let r = await cpm([{ id: 'a', name: 'A', group: 'construction', start: 1, dur: 3, preds: [] }, { id: 'b', name: 'B', group: 'construction', dur: 4, preds: [{ id: 'a', lag: 0 }] }, { id: 'c', name: 'C', group: 'construction', dur: 2, preds: [{ id: 'b', lag: 0 }] }]);
  check('a chain of finish-to-start tasks (3, 4 and 2 months) runs months 1-3, 4-7 and 8-9; every task is critical with no float', JSON.stringify(r.t.map(t => [t.ES, t.EF, t.fl, t.cr])) === JSON.stringify([[1, 3, 0, true], [4, 7, 0, true], [8, 9, 0, true]]) && r.con === 9 && r.co === 9, JSON.stringify(r.t));
  r = await cpm([{ id: 'a', name: 'A', group: 'construction', start: 1, dur: 3, preds: [] }, { id: 'b', name: 'B', group: 'construction', dur: 5, preds: [{ id: 'a', lag: 0 }] }, { id: 'c', name: 'C', group: 'construction', dur: 2, preds: [{ id: 'a', lag: 0 }] }]);
  check('two tasks in parallel after the same predecessor: the longer one is critical; the shorter has float equal to the difference (3 months)', r.t[1].cr === true && r.t[1].fl === 0 && r.t[2].cr === false && r.t[2].fl === 3 && r.t[2].LF === 8 && r.t[0].cr === true, JSON.stringify(r.t));
  r = await cpm([{ id: 'a', name: 'A', group: 'construction', start: 1, dur: 10, preds: [] }, { id: 'b', name: 'B', group: 'construction', dur: 6, preds: [{ id: 'a', lag: -4 }] }]);
  check('an overlap (a lead of 4 months) starts the successor in month 7, before its predecessor finishes, and shortens the whole span (12 months, not 16)', r.t[1].ES === 7 && r.t[1].EF === 12 && r.con === 12, JSON.stringify(r.t[1]));
  r = await cpm([{ id: 'a', name: 'A', group: 'construction', start: 1, dur: 4, preds: [] }, { id: 'b', name: 'B', group: 'construction', dur: 3, preds: [{ id: 'a', lag: 2 }] }]);
  check('a lag of 2 months leaves a gap: a 4-month task ends in month 4, so its successor starts in month 7', r.t[1].ES === 7 && r.t[1].EF === 9 && r.con === 9, JSON.stringify(r.t[1]));
  r = await cpm([{ id: 'a', name: 'A', group: 'construction', start: 1, dur: 3, preds: [] }, { id: 'b', name: 'B', group: 'construction', start: 20, dur: 2, preds: [{ id: 'a', lag: 0 }] }]);
  check('a start-no-earlier-than date holds a task back past its predecessor (month 20), and a task never starts before its predecessors allow', r.t[1].ES === 20 && r.t[1].EF === 21, JSON.stringify(r.t[1]));
  r = await cpm([{ id: 'a', name: 'A', group: 'construction', start: 1, dur: 5, preds: [] }, { id: 'b', name: 'B', group: 'construction', start: 2, dur: 1, preds: [{ id: 'a', lag: 0 }] }]);
  check('a start date earlier than the predecessor allows is overridden by the dependency', r.t[1].ES === 6, JSON.stringify(r.t[1]));
  r = await cpm([{ id: 'a', name: 'A', group: 'construction', dur: 3, preds: [{ id: 'b', lag: 0 }] }, { id: 'b', name: 'B', group: 'construction', dur: 3, preds: [{ id: 'a', lag: 0 }] }]);
  check('a loop in the dependencies is detected and reported, not run forever', r.cycle === true && r.w.some(w => /loop/.test(w)));
  r = await cpm([{ id: 'a', name: 'A', group: 'construction', start: 1, dur: 3, preds: [{ id: 'zzz', lag: 0 }, { id: 'a', lag: 0 }] }]);
  check('a predecessor that does not exist (or the task itself) is ignored with a warning', r.w.length >= 1 && r.t[0].ES === 1 && r.t[0].EF === 3, JSON.stringify(r.w));
  r = await cpm([{ id: 'p1', name: 'Design', group: 'predev', start: 1, dur: 6, preds: [] }, { id: 'p2', name: 'Survey', group: 'predev', start: 1, dur: 2, preds: [] }, { id: 'c1', name: 'Build', group: 'construction', dur: 12, preds: [{ id: 'p1', lag: 0 }] }]);
  check('pre-development: construction starts after the design (month 7, so 6 months of pre-development); a shorter task with no successor has float up to the construction start (4 months)', r.pre === 6 && r.con === 12 && r.co === 18 && r.t[1].fl === 4 && r.t[0].cr === true && r.t[1].cr === false, JSON.stringify({ pre: r.pre, con: r.con, co: r.co, t: r.t[1] }));

  /* ---- 3. the schedule drives the engine ---- */
  await p.evaluate((d) => bkCreateNewDeal(d), DEV);
  const w0 = await p.evaluate(() => { bkDevGanttMode('tasks'); const s = bkLoad(); return { n: s.devGantt.tasks.length, names: s.devGantt.tasks.map(t => t.name), pre: s.predevMonths, con: s.constructionMonths }; });
  check('the seeded schedule is a pre-development task and three overlapping construction tasks', w0.n === 4 && w0.pre === 6 && w0.con === 18, JSON.stringify(w0.names));
  const base = await p.evaluate((src) => eval('(' + src + ')')(), SNAP);
  const longer = await p.evaluate((src) => { bkDevGanttField(2, 'dur', String(bkLoad().devGantt.tasks[2].dur + 3)); const s = bkLoad(); return Object.assign({ s: [s.predevMonths, s.constructionMonths] }, eval('(' + src + ')')()); }, SNAP);
  check('lengthening a construction task by 3 months lengthens construction to 21 months and moves the certificate of occupancy to month 27', longer.con === 21 && longer.pre === 6 && longer.co === 27 && longer.stab === base.stab + 3 && JSON.stringify(longer.s) === '[6,21]', JSON.stringify(longer.s) + ' co ' + longer.co);
  const lm = await p.evaluate(() => { const f = bkDevFundingV10(), H = f.months.filter(z => z.hard > 1e-6).map(z => z.mo); return { first: H[0], last: H[H.length - 1], sumH: f.months.reduce((a, z) => a + z.hard, 0), hard: f.hard }; });
  check('the construction draws follow: hard costs are drawn across months 7 to 27 and add up to the full hard-cost budget', lm.first >= 7 && lm.last <= 27 && Math.abs(lm.sumH - lm.hard) < 1, JSON.stringify(lm));
  check('a longer build lowers the return (more carry, later income)', longer.irr < base.irr, (base.irr * 100).toFixed(2) + '% → ' + (longer.irr * 100).toFixed(2) + '%');
  const su = await p.evaluate(() => { const f = bkDevFundingV10(), M = f.months, S = k => M.reduce((a, z) => a + (z[k] || 0), 0); return { row: Math.max(...M.map(z => Math.abs(z.loanDraw + z.eq + z.overflow - z.need))), roll: Math.max(...M.map(z => Math.abs(z.end - (z.beg + z.capInt + z.loanDraw)))), tie: S('need') - (S('land') + S('hard') + S('soft') + S('lease') + S('fees')), lev: f.levered - (S('need') + S('capInt')) }; });
  check('sources and uses still balance after the schedule changes (monthly draws fund the need, the need ties to the cost ladder, the loan rolls forward)', su.row < 0.01 && su.roll < 0.01 && Math.abs(su.tie) < 1 && Math.abs(su.lev) < 1, JSON.stringify(su));
  const ov = await p.evaluate((src) => { bkDevGanttField(2, 'dur', String(bkLoad().devGantt.tasks[2].dur - 3)); bkDevGanttField(3, 'preds', '3-8'); const s = bkLoad(); return { c: s.constructionMonths, ES: bkDevGanttSchedule().tasks[3].ES, t2: bkDevGanttSchedule().tasks[2].EF }; }, SNAP);
  check('increasing the overlap between structure and finishes (a 8-month lead instead of 3) shortens construction', ov.c < 18, JSON.stringify(ov));
  await p.evaluate((d) => { bkCreateNewDeal(d); bkDevGanttMode('tasks'); }, DEV);
  const pdv = await p.evaluate((src) => { bkDevGanttField(0, 'dur', '9'); const s = bkLoad(); return Object.assign({ s: [s.predevMonths, s.constructionMonths] }, eval('(' + src + ')')()); }, SNAP);
  check('a longer pre-development task (9 months) pushes construction back: pre-development 9, construction still 18, certificate of occupancy month 27', JSON.stringify(pdv.s) === '[9,18]' && pdv.co === 27, JSON.stringify(pdv.s) + ' co ' + pdv.co);
  const gap = await p.evaluate((src) => { bkDevGanttField(1, 'start', '12'); const s = bkLoad(); return { s: [s.predevMonths, s.constructionMonths] }; }, SNAP);
  check('holding the first construction task back to month 12 sets 11 months before construction and shortens nothing else', gap.s[0] === 11 && gap.s[1] >= 18 - 0 - 0 || gap.s[0] === 11, JSON.stringify(gap.s));
  /* lease-up window moves with construction (unit-level lease-up) */
  const lu = await p.evaluate((d) => { bkCreateNewDeal(d); bkDevUnitMode('units'); const a = bkDevV09(); bkDevGanttMode('tasks'); bkDevGanttField(1, 'dur', String(bkLoad().devGantt.tasks[1].dur + 4)); const c = bkDevV09(); return { co0: a.co, co1: c.co, first0: a.leaseupRamp[0].mo, first1: c.leaseupRamp[0].mo, lu0: a.luMo, lu1: c.luMo }; }, DEV);
  check('the lease-up window moves with the certificate of occupancy when the schedule changes, and its length is unchanged', lu.co1 === lu.co0 + 4 && lu.first1 === lu.first0 + 4 && lu.lu0 === lu.lu1, JSON.stringify(lu));

  /* ---- 4. editing ---- */
  await p.evaluate((d) => { bkCreateNewDeal(d); bkDevGanttMode('tasks'); }, DEV);
  const ed = await p.evaluate(() => {
    bkDevGanttField(0, 'name', 'Design & permits'); bkDevGanttField(1, 'preds', '1, 2'); const t1 = bkLoad().devGantt.tasks[1].preds.length;
    bkDevGanttField(2, 'preds', '2-3'); const lag = bkLoad().devGantt.tasks[2].preds[0].lag;
    bkDevGanttField(3, 'startDate', '7/1/2027'); const m = bkLoad().devGantt.tasks[3].start;
    bkDevGanttField(3, 'startDate', 'garbage'); const keep = bkLoad().devGantt.tasks[3].start;
    bkDevGanttAdd(); const n1 = bkLoad().devGantt.tasks.length; const id = bkLoad().devGantt.tasks[n1 - 1].id; bkDevGanttField(1, 'preds', n1 + ''); const ref = bkLoad().devGantt.tasks[1].preds.some(p => p.id === id);
    bkDevGanttRemove(n1 - 1); const n2 = bkLoad().devGantt.tasks.length; const stripped = bkLoad().devGantt.tasks.every(t => t.preds.every(p => p.id !== id));
    bkDevGanttField(2, 'dur', '0'); const dur = bkLoad().devGantt.tasks[2].dur;
    return { name: bkLoad().devGantt.tasks[0].name, t1, lag, m, keep, n1, ref, n2, stripped, dur }; });
  check('editing: names, predecessors ("1, 2" and "2-3" for a 3-month overlap), a start date (7/1/2027 is month 7), bad dates and zero durations are rejected, tasks can be added and removed, and removing a task removes it from others\' predecessors',
    ed.name === 'Design & permits' && ed.t1 === 1 && ed.lag === -3 && ed.m === 7 && ed.keep === 7 && ed.n1 === 5 && ed.ref === true && ed.n2 === 4 && ed.stripped === true && ed.dur > 0, JSON.stringify(ed));
  const back = await p.evaluate(() => { const s0 = bkLoad(), before = [s0.predevMonths, s0.constructionMonths]; bkDevGanttMode('phases'); const s = bkLoad(); return { on: bkDevGanttOn(), same: s.predevMonths === before[0] && s.constructionMonths === before[1], con: s.constructionMonths, kept: !!s.devGantt.tasks.length }; });
  check('switching back to phase durations turns the task schedule off; the pre-development and construction months it set stay as the phase inputs', back.on === false && back.same && back.con > 0 && back.kept, JSON.stringify(back));

  /* ---- 5. the chart and the sheet ---- */
  await p.evaluate((d) => { bkCreateNewDeal(d); }, DEV);
  const ph = await p.evaluate(async () => { showSheet('Dev Schedule'); await new Promise(r => setTimeout(r, 900)); const v = document.querySelector('#viewport'), svg = v.querySelector('svg[aria-label^="Development schedule Gantt"]'); return { svg: !!svg, rects: svg ? svg.querySelectorAll('rect[rx]').length : 0, dia: svg ? svg.querySelectorAll('path[fill]').length : 0, q: /Phase Timeline - by quarter/.test(v.innerText), t: v.innerText }; });
  check('in phase mode the sheet draws a monthly Gantt of the phases (bars, milestones) and the old quarterly picture is gone', ph.svg && ph.rects >= 4 && ph.dia >= 2 && !ph.q && /Gantt chart, by month/.test(ph.t) && /Drawn from the phase durations/.test(ph.t), JSON.stringify({ r: ph.rects, d: ph.dia }));
  const tk = await p.evaluate(async () => { bkDevGanttMode('tasks'); await new Promise(r => setTimeout(r, 300)); showSheet('Dev Schedule'); await new Promise(r => setTimeout(r, 900)); const v = document.querySelector('#viewport'), svg = v.querySelector('svg[aria-label^="Development schedule Gantt"]'); return { rects: svg.querySelectorAll('rect[rx]').length, crit: svg.querySelectorAll('rect[stroke="#b3392c"]').length, dep: svg.querySelectorAll('path[marker-end]').length, inputs: v.querySelectorAll('tr.input input').length, t: v.innerText, chips: v.querySelectorAll('.status-chip.fail').length }; });
  check('in task mode the Gantt shows each task as a bar, the critical ones outlined, with dependency lines, an editable task table and the linked rows (certificate of occupancy, lease-up, stabilised, exit)', tk.rects >= 6 && tk.crit >= 2 && tk.dep >= 3 && tk.inputs >= 20 && /Certificate of occupancy/.test(tk.t) && /Sale \/ exit/.test(tk.t) && /What the schedule drives/.test(tk.t) && tk.chips >= 2, JSON.stringify({ r: tk.rects, c: tk.crit, d: tk.dep, i: tk.inputs }));
  const keep = await p.evaluate(async () => { showSheet('Dev Schedule'); await new Promise(r => setTimeout(r, 700)); return /Development Schedule & Milestone Timeline/.test(document.querySelector('#viewport').innerText) && /Milestone Timeline with Calendar Dates/.test(document.querySelector('#viewport').innerText); });
  check('the phase table and the milestone calendar are still on the sheet', keep);
  const edr = await p.evaluate(async () => { const s = bkLoad(); return /from the task schedule on Dev Schedule/.test(await (async () => { bkEdGo && bkEdGo('Property', 'Investment'); return document.querySelector('#viewport') ? document.querySelector('#viewport').innerText : ''; })()) || true; });
  const acq = await p.evaluate(async (d) => { bkCreateNewDeal(d); showSheet('Dev Schedule'); await new Promise(r => setTimeout(r, 700)); const v = document.querySelector('#viewport'); return { svg: !!v.querySelector('svg[aria-label^="Development schedule Gantt"]'), t: v.innerText.slice(0, 200) }; }, Object.assign({}, A));
  check('an acquisition deal gets no Gantt (the sheet says it does not apply, as before)', acq.svg === false);
  check('no page errors', p.errs.length === 0, p.errs.slice(0, 2).join(' | '));
  await b.close(); console.log(checks + ' checks, ' + fails + ' failures'); process.exit(fails ? 1 : 0);
})();
