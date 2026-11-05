// Development budget by $ per SF or by line items in dollars. ONE budget: the hard and soft totals, the monthly draws, Sources & Uses, the Gantt and the returns all read it.
//  1 line items: hard (with contingency) and soft (with FF&E) totals equal the sum of the lines; the monthly funding rows add to the same totals; Sources & Uses and ALL INPUTS TIE still tie
//  2 a line follows the schedule until it is given its own start and length; a task schedule that lengthens construction moves the lines that have no timing of their own
//  3 a steeper curve puts more of a line's cash in the middle months, every line's months add to its amount, and a line that runs past the sale is charged by the sale month (nothing is lost)
//  4 $ per SF by category: hard = rate x GSF, contingency = % of hard, soft = rate x GSF, FF&E = rate x units; empty boxes are zero (nothing is assumed)
//  5 the panel: the "Add" box adds exactly that many blank rows, Remove removes one, an edit changes the totals; "copy the current budget" keeps every dollar
//  6 the Dev Schedule page shows each line as a row with its cost and a cash-by-month row that adds up to the budget
//   node audit/budget_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const V = require(path.join(__dirname, 'devdeal.js')), A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); let checks = 0, fails = 0;
  const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const open = async (deal) => { const p = await b.newPage({ viewport: { width: 1500, height: 1000 } }); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); bkSave(s); }, deal); return p; };
  const LINES = [
    { cls: 'hard', name: 'Site work and foundations', amount: 6000000, start: '', len: '' },
    { cls: 'hard', name: 'Structure and envelope', amount: 9000000, start: '', len: '', method: 'S-Curve', rate: 7 },
    { cls: 'hard', name: 'Mechanical, electrical, plumbing', amount: 4500000, start: 12, len: 10, method: 'Straight-Line' },
    { cls: 'cont', name: 'Hard cost contingency', amount: 1200000 },
    { cls: 'soft', name: 'Design and engineering', amount: 900000 },
    { cls: 'soft', name: 'Permits and fees', amount: 700000, start: 2, len: 4 },
    { cls: 'ffe', name: 'FF&E', amount: 300000 }];
  const HARD = 6000000 + 9000000 + 4500000 + 1200000, SOFT = 900000 + 700000 + 300000;

  /* 1 line items tie everywhere */
  let p = await open(V);
  const a = await p.evaluate((L) => { const s = bkLoad(); s.devBudgetMode = 'LINES'; s.budgetLines = L; bkSave(s); const x = bkDevV09(), f = bkDevFundingV10(), sm = (k) => f.months.reduce((t, m) => t + m[k], 0), fs = bkFundingSummary(), pl = bkDevBudgetPlan(x, bkLoad());
    return { mode: x.budgetMode, hard: x.hard, soft: x.soft, mHard: sm('hard'), mSoft: sm('soft'), uses: fs.totalUses, srcs: fs.totalSources, ties: fs.ties.every(t => t.ok), all: bkAllInputsTie(), integ: bkIntegrity().checks.filter(c => ['budget', 'unlev', 'su'].includes(c.id)).map(c => c.id + ':' + c.status).join(), planTotal: Object.keys(pl.all).reduce((t, k) => t + pl.all[k], 0), unlev: x.unlev, land: x.land + x.close + x.acq + x.pre, ladder: x.hardLadder.total + x.softLadder.total }; }, LINES);
  check('line items: the hard total (with contingency) and the soft total (with FF&E) are the sum of the lines', a.mode === 'LINES' && Math.abs(a.hard - HARD) < 0.5 && Math.abs(a.soft - SOFT) < 0.5, [a.hard, a.soft]);
  check('the monthly funding rows add up to the same hard and soft totals', Math.abs(a.mHard - HARD) < 1 && Math.abs(a.mSoft - SOFT) < 1, [a.mHard, a.mSoft]);
  check('the cash plan (what the Gantt draws) adds up to the budget', Math.abs(a.planTotal - (HARD + SOFT)) < 1, a.planTotal);
  check('Sources & Uses, the funding ties and ALL INPUTS TIE still agree; the budget integrity checks pass', Math.abs(a.uses - a.srcs) < 1 && a.ties && a.all.ok === true && !/hard|fail/.test(a.integ) && /budget:pass/.test(a.integ), a.integ + ' ' + JSON.stringify(a.all.failed));
  check('cost before financing = land and closing + the line items', Math.abs(a.unlev - (a.land + HARD + SOFT)) < 1, [a.unlev, a.land + HARD + SOFT]);

  /* 2 the schedule moves the lines that follow it */
  const c = await p.evaluate(() => { const pl = bkDevBudgetPlan(bkDevV09(), bkLoad()), by = n => pl.rows.filter(r => r.name === n)[0], x = bkDevV09(); const before = { site: [by('Site work and foundations').start, by('Site work and foundations').end], mep: [by('Mechanical, electrical, plumbing').start, by('Mechanical, electrical, plumbing').end], co: x.co };
    bkDevGanttMode('tasks'); const s0 = bkLoad(), T = s0.devGantt.tasks, last = T.map((t, i) => [t, i]).filter(o => o[0].group === 'construction').pop();
    bkDevGanttField(last[1], 'dur', String(Number(last[0].dur) + 3)); const x2 = bkDevV09(), pl2 = bkDevBudgetPlan(x2, bkLoad()), by2 = n => pl2.rows.filter(r => r.name === n)[0];
    return { before, after: { site: [by2('Site work and foundations').start, by2('Site work and foundations').end], mep: [by2('Mechanical, electrical, plumbing').start, by2('Mechanical, electrical, plumbing').end], co: x2.co }, hard: x2.hard, soft: x2.soft }; });
  check('a line with no timing follows the schedule: lengthening construction by 3 months moves its end by 3', c.after.co === c.before.co + 3 && c.after.site[1] === c.before.site[1] + 3 && c.after.site[0] === c.before.site[0], JSON.stringify(c));
  check('a line with its own start and length does not move (MEP months 12 to 21)', c.after.mep[0] === 12 && c.after.mep[1] === 21 && c.before.mep[0] === 12, JSON.stringify([c.before.mep, c.after.mep]));
  check('moving the schedule does not change what the budget costs', Math.abs(c.hard - HARD) < 0.5 && Math.abs(c.soft - SOFT) < 0.5, [c.hard, c.soft]);
  await p.close();

  /* 3 curves, sums and the sale */
  p = await open(V);
  const d = await p.evaluate(() => { const s = bkLoad(); s.devBudgetMode = 'LINES'; s.budgetLines = [{ cls: 'hard', name: 'steep', amount: 1000000, start: 7, len: 12, method: 'S-Curve', rate: 9 }, { cls: 'hard', name: 'flat', amount: 1000000, start: 7, len: 12, method: 'S-Curve', rate: 1 }, { cls: 'hard', name: 'straight', amount: 1000000, start: 7, len: 12, method: 'Straight-Line' }, { cls: 'soft', name: 'past the sale', amount: 500000, start: 70, len: 12, method: 'Straight-Line' }]; bkSave(s);
    const x = bkDevV09(), pl = bkDevBudgetPlan(x, bkLoad()), f = bkDevFundingV10(); const mid = r => [10, 11, 12, 13].reduce((t, m) => t + (r.monthly[m] || 0), 0), sum = r => Object.keys(r.monthly).reduce((t, k) => t + r.monthly[k], 0), by = n => pl.rows.filter(r => r.name === n)[0];
    return { steep: mid(by('steep')), flat: mid(by('flat')), straight: mid(by('straight')), sums: pl.rows.map(r => Math.round(sum(r) / r.amount * 1e6) / 1e6), hold: x.hold, mHard: f.months.reduce((t, m) => t + m.hard, 0), mSoft: f.months.reduce((t, m) => t + m.soft, 0), lastMonthSoft: f.months[f.months.length - 1].soft }; });
  check('steepness: a steep curve puts far more cash in the middle months than a flat one; Flat (1) is close to a straight line', d.steep > 2 * d.flat && d.flat >= d.straight && d.flat < d.straight * 1.1, [d.steep, d.straight, d.flat].map(Math.round));
  check('every line\'s months add up to its amount (before the sale)', d.sums.slice(0, 3).every(v => Math.abs(v - 1) < 1e-6), d.sums);
  check('a line that runs past the sale (month ' + d.hold + ') is charged by the sale month: the funding rows still add up to the budget', Math.abs(d.mHard - 3000000) < 1 && Math.abs(d.mSoft - 500000) < 1, [d.mHard, d.mSoft, d.lastMonthSoft]);
  await p.close();

  /* 4 $ per SF by category */
  p = await open(V);
  const e = await p.evaluate(() => { const s = bkLoad(); s.devBudgetMode = 'PSF'; s.hardPsf = 160; s.hardContPct = 0.05; s.softPsf = 40; s.ffePerUnit = 2000; bkSave(s); const x = bkDevV09(), gsf = Number(bkLoad().gsf), u = Number(bkLoad().units); const f = bkDevFundingV10();
    const s2 = bkLoad(); delete s2.softPsf; delete s2.ffePerUnit; delete s2.hardPsf; bkSave(s2); const z = bkDevV09();
    return { gsf, u, hard: x.hard, soft: x.soft, mHard: f.months.reduce((t, m) => t + m.hard, 0), zero: [z.hard, z.soft] }; });
  check('$ per SF: hard = $160 x GSF + 5% contingency, soft = $40 x GSF + $2,000 x units', Math.abs(e.hard - e.gsf * 160 * 1.05) < 1 && Math.abs(e.soft - (e.gsf * 40 + e.u * 2000)) < 1, [e.hard, e.soft, e.gsf, e.u]);
  check('$ per SF: the monthly funding rows add up to the hard total; with the boxes emptied the budget is zero (nothing is assumed)', Math.abs(e.mHard - e.hard) < 1 && e.zero[0] === 0 && e.zero[1] === 0, JSON.stringify(e.zero));
  await p.close();

  /* 5 the panel */
  p = await open(V);
  await p.evaluate((L) => { const s = bkLoad(); s.devBudgetMode = 'LINES'; s.budgetLines = L; bkSave(s); bkEdGo('Investment', 'Investment', 'bud'); }, LINES); await p.waitForTimeout(600);
  const f1 = await p.evaluate(() => ({ rows: document.querySelectorAll('#viewport .ae-grid tbody tr').length, hasBox: !!document.getElementById('ae-bud-n'), totals: document.getElementById('viewport').innerText.replace(/\s+/g, ' ').match(/Total hard and soft cost \$([\d,]+)/) }));
  check('the Budget panel lists the lines, has the "Add N lines" box, and shows the total that ties to the engine', f1.hasBox && f1.totals && Number(f1.totals[1].replace(/,/g, '')) === HARD + SOFT && /ties to the funding engine/.test(await p.evaluate(() => document.getElementById('viewport').innerText)), JSON.stringify(f1));
  await p.evaluate(() => { document.getElementById('ae-bud-n').value = '4'; document.getElementById('ae-bud-c').value = 'soft'; bkEdBudAdd(document.getElementById('ae-bud-n').value, document.getElementById('ae-bud-c').value); }); await p.waitForTimeout(400);
  const f2 = await p.evaluate(() => ({ n: bkLoad().budgetLines.length, blanks: bkLoad().budgetLines.filter(l => !l.name && !Number(l.amount)).length, soft: bkDevV09().soft }));
  check('"Add 4 soft cost lines" adds exactly 4 blank rows and changes no total', f2.n === LINES.length + 4 && f2.blanks === 4 && Math.abs(f2.soft - SOFT) < 0.5, JSON.stringify(f2));
  const f3 = await p.evaluate(() => { bkEdBud(4, 'amount', '$1,000,000'); const x = bkDevV09(); bkEdBudDel(bkLoad().budgetLines.length - 1); return { soft: x.soft, n: bkLoad().budgetLines.length }; });
  check('editing an amount changes the soft total by that amount; Remove takes one row away', Math.abs(f3.soft - (SOFT - 900000 + 1000000)) < 0.5 && f3.n === LINES.length + 3, JSON.stringify(f3));
  await p.close();
  p = await open(V);
  const g = await p.evaluate(() => { const x0 = bkDevV09(), f0 = bkDevFundingV10(); const before = { hard: x0.hard, soft: x0.soft, unlev: x0.unlev }; bkEdBudCopy(); const x1 = bkDevV09(); return { before, after: { hard: x1.hard, soft: x1.soft, unlev: x1.unlev }, mode: bkLoad().devBudgetMode, n: bkLoad().budgetLines.length, tie: bkAllInputsTie().ok }; });
  check('"Copy the current budget into line items" keeps every dollar (hard, soft and cost before financing) and everything still ties', Math.abs(g.before.hard - g.after.hard) < 0.5 && Math.abs(g.before.soft - g.after.soft) < 0.5 && Math.abs(g.before.unlev - g.after.unlev) < 0.5 && g.mode === 'LINES' && g.n > 10 && g.tie, JSON.stringify(g));
  await p.close();

  /* 6 the Gantt page */
  p = await open(V);
  await p.evaluate((L) => { const s = bkLoad(); s.devBudgetMode = 'LINES'; s.budgetLines = L; bkSave(s); showSheet('Dev Schedule'); }, LINES); await p.waitForTimeout(1000);
  const h = await p.evaluate(() => { const v = document.querySelector('#viewport .bk-gx'); if (!v) return null; const rows = [...v.querySelectorAll('tbody tr')], txt = v.innerText.replace(/\s+/g, ' '), bars = [...v.querySelectorAll('td div[title^="Month"]')].map(d => Number(d.title.replace(/.*: \$/, '').replace(/,/g, ''))), M = bkDevGanttModel(); return { hasBudget: /Budget lines/.test(txt), cash: /Cash spent by month/.test(txt), lineRows: M.plan.rows.length, tot: (txt.match(/Budget lines[^$]*\$([\d,]+)/) || [])[1], bars: bars.reduce((t, v) => t + v, 0), nBars: bars.length, hdr: /Cost/.test(v.querySelector('thead').innerText) }; });
  check('Dev Schedule shows the budget lines as rows with a Cost column and a cash-by-month row', h && h.hasBudget && h.cash && h.hdr && h.lineRows === LINES.length, JSON.stringify(h));
  check('the Gantt cash bars add up to the budget (within the dollars each bar is rounded to)', h && Math.abs(h.bars - (HARD + SOFT)) < h.nBars + 1 && Number(String(h.tot).replace(/,/g, '')) === HARD + SOFT, JSON.stringify(h));
  await p.close();

  /* an acquisition deck is untouched, and a deal on the old methods is byte-for-byte what it was */
  p = await open(A); const k = await p.evaluate(() => { showSheet('Dev Schedule'); return { dev: !!bkDevV09().isDev, rows: bkDevV09().budgetRows }; }); check('an acquisition deal has no development budget lines', k.dev === false && !k.rows, JSON.stringify(k)); await p.close();
  p = await open(V); const m = await p.evaluate(() => { const x = bkDevV09(); return { mode: x.budgetMode, rows: x.budgetRows, hard: Math.round(x.hard), soft: Math.round(x.soft) }; }); check('a deal on the one-total method is unchanged (no budget rows, same hard and soft)', m.mode === 'SOURCE' && !m.rows && m.hard === 20299756 && m.soft === 5200244, JSON.stringify(m)); check('no page errors', p.errs.length === 0, p.errs.join('|')); await p.close();
  console.log('budget: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
