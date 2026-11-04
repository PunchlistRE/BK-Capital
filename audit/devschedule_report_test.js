// Development schedule: the Gantt chart and its printable summary. The chart carries a calendar axis, the milestones, section bands, duration labels, dependency arrows and the critical path; the
// summary (Print / Save PDF) is cover, Gantt, task table, funding timeline and delay sensitivity, built only from the engine's own figures and checked here against independent engine calls
// and against a real PDF (letter, landscape, every page, no application chrome).
//   node audit/devschedule_report_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs'), os = require('os'), { execFileSync } = require('child_process');
const A = require(path.join(__dirname, 'deal.js')), D = require(path.join(__dirname, 'devdeal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const open = async (deal, w, scheme) => { const ctx = await b.newContext({ viewport: { width: w || 1280, height: 900 }, colorScheme: scheme || 'light' }), p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); localStorage.setItem('bk-pt-all', '1'); bkCreateNewDeal(d); }, deal); return p; };
  const tasksMode = (p) => p.evaluate(async () => { showSheet('Dev Schedule'); await new Promise(r => setTimeout(r, 700)); bkDevGanttMode('tasks'); await new Promise(r => setTimeout(r, 800)); });
  const pc = (x) => (x * 100).toFixed(2) + '%', money = (x) => (x < 0 ? '-$' : '$') + Math.abs(Math.round(x)).toLocaleString('en-US');
  const mon = (d) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  const p = await open(D); await tasksMode(p);
  const E = await p.evaluate(() => { const s = bkLoad(), x = bkDevV09(), f = bkDevFundingV10(), m = bkMonthlyReturns(), sc = bkDevGanttSchedule(s, x), con = Math.round(Number(s.constructionMonths));
    const run = (ov) => bkRunWith(ov, () => { const mm = bkMonthlyReturns(), ff = bkDevFundingV10(), xx = bkDevV09(); return { irr: mm.irr, eq: ff.equityTotal, co: xx.co, stab: xx.stab }; });
    return { co: x.co, stab: x.stab, hold: x.hold, pre: x.preMo, con: x.conMo, lu: x.luMo, irr: m.irr, moic: m.moic, ntask: sc.tasks.length, ncrit: sc.tasks.filter(t => t.critical).length, names: sc.tasks.map(t => t.name), npreds: sc.tasks.reduce((n, t) => n + t.preds.length, 0),
      needStab: f.months.slice(0, x.stab).reduce((t, r) => t + r.need, 0), levered: f.levered, equity: f.equityTotal, commit: f.commit, d3: run({ constructionMonths: con + 3 }), d1: run({ constructionMonths: con + 1 }), base: run({}),
      coDate: new Date(new Date(2027, 0, 1).getFullYear(), 0 + x.co, 0).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) }; });

  /* ---- the chart on the Dev Schedule page ---- */
  /* the Dev Schedule PAGE is the Smartsheet-style HTML sheet (.bk-gx); the printable summary still draws the SVG chart, so the chart checks below read that SVG, built from the same model */
  const pg = await p.evaluate(async () => { showSheet('Dev Schedule'); await new Promise(r => setTimeout(r, 900)); const gx = document.querySelector('.bk-gx'); if (!gx) return null;
    const M = bkDevGanttModel(); const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:-9999px;top:0'; host.innerHTML = M.svg(M.rows, M.sc, M.s, { print: true, W: 931, id: 'tst' }); document.body.appendChild(host);
    const svg = host.querySelector('svg'); const texts = [...svg.querySelectorAll('text')].map(t => ({ t: t.textContent, y: Math.round(+t.getAttribute('y')), x: Math.round(+t.getAttribute('x')) })), rects = [...svg.querySelectorAll('rect')];
    const out = { gx: true, wide: gx.scrollWidth, vb: svg.getAttribute('viewBox'), w: svg.getAttribute('width'), texts, crit: rects.filter(r => /b3392c/i.test(r.getAttribute('stroke') || '')).length, arrows: [...svg.querySelectorAll('path[marker-end]')].length,
      tiles: document.querySelectorAll('.bk-gs-tile').length, btn: !!document.querySelector('#viewport button[onclick*="bkDevScheduleReport"]'), legend: !!M.legend(true), tileText: [...document.querySelectorAll('.bk-gs-tile')].map(e => e.innerText.replace(/\s+/g, ' ')).join(' | ') };
    host.remove(); return out; });
  check('the Dev Schedule page has the summary tiles (7), the Gantt sheet and a "Schedule summary (PDF)" button', pg && pg.tiles === 7 && pg.gx && pg.btn && pg.legend, pg && pg.tileText);
  check('the Gantt sheet is present and has width', pg && pg.wide > 300);
  check('the summary chart scales to its space (viewBox) rather than a fixed size', pg && /^0 0 \d+ \d+$/.test(pg.vb));
  check('every task name is on the chart, with its number', E.names.every(n => pg.texts.some(t => t.t.indexOf(n.slice(0, 20)) === 0)) && E.names.every((n, i) => pg.texts.some(t => t.t === String(i + 1))));
  check('the calendar years are across the top and the three milestones are flagged with their dates', ['2027', '2028', '2029', '2030', '2031', '2032'].every(y => pg.texts.some(t => t.t === y)) && pg.texts.some(t => /^Certificate of occupancy · /.test(t.t)) && pg.texts.some(t => /^Stabilized · /.test(t.t)) && pg.texts.some(t => /^Sale \/ exit · /.test(t.t)) && pg.texts.some(t => t.t.endsWith(E.coDate)), JSON.stringify(pg.texts.filter(t => / · /.test(t.t))));
  const flags = pg.texts.filter(t => / · (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/.test(t.t) && t.y < 60);
  check('the milestone flags do not sit on top of each other', flags.length === 3 && !flags.some((a, i) => flags.some((c, j) => j > i && Math.abs(a.y - c.y) < 10 && Math.abs(a.x - c.x) < 150)), JSON.stringify(flags));
  check('each duration is labelled on its bar ("6 mo"), and the dependency arrows match the task links (' + E.npreds + ')', pg.texts.some(t => t.t === '6 mo') && pg.arrows === E.npreds, 'arrows ' + pg.arrows);
  check('the critical path is outlined in red (' + E.ncrit + ' tasks and the lease-up)', pg.crit === E.ncrit + 1, pg.crit);

  /* ---- the summary ---- */
  await p.evaluate(() => bkDevScheduleReport()); await p.waitForTimeout(700);
  const rp = await p.evaluate(() => { const pages = [...document.querySelectorAll('#bk-sr .sr-page')]; return { n: pages.length, text: pages.map(e => e.innerText), foot: pages.map(e => (e.querySelector('.sr-f') || { innerText: '' }).innerText), over: pages.map(e => { const b = e.querySelector('.sr-body'); return b.scrollHeight - b.clientHeight; }), bg: getComputedStyle(pages[0]).backgroundColor, bar: !!document.querySelector('#bk-sr .sr-bar .pri') }; });
  const rows = E.ntask + 3 + (E.lu > 0 ? 1 : 0), ganttRows = E.ntask + 3 + (E.lu > 0 ? 1 : 0), ganttPages = ganttRows <= 12 ? 1 : 2, expectN = 1 + ganttPages + Math.ceil(rows / 15) + 2;
  check('the summary is ' + expectN + ' pages (cover, Gantt, task table, funding, delay cost) with a Print / Save PDF button', rp.n === expectN && rp.bar, rp.n);
  check('every page says "Page i of N"', rp.foot.every((f, i) => f.indexOf('Page ' + (i + 1) + ' of ' + rp.n) >= 0));
  check('nothing runs off the bottom of any page', rp.over.every(v => v <= 1), rp.over.join());
  const cover = rp.text[0];
  check('cover: months to stabilization, the certificate of occupancy date and the key-date months are the engine\'s (' + E.stab + ' months, CO month ' + E.co + ')', new RegExp(E.stab + ' months').test(cover) && cover.includes(E.coDate) && new RegExp('Certificate of occupancy\\s+\\w{3} \\d{4}\\s+' + E.co + '\\s').test(cover.replace(/\n/g, ' ')) && new RegExp('Stabilized\\s+\\w{3} \\d{4}\\s+' + E.stab + '\\s').test(cover.replace(/\n/g, ' ')) && new RegExp('Sale / exit\\s+\\w{3} \\d{4}\\s+' + E.hold + '\\s').test(cover.replace(/\n/g, ' ')), cover.slice(0, 120).replace(/\n/g, ' '));
  check('cover: levered IRR and multiple are the engine\'s (' + pc(E.irr) + ')', cover.includes(pc(E.irr)) && cover.includes(E.moic.toFixed(2) + 'x'));
  check('cover: all-in cost, equity and the construction loan are the funding engine\'s', cover.includes('$' + (E.levered / 1e6).toFixed(2) + 'M') && cover.includes('$' + (E.equity / 1e6).toFixed(2) + 'M') && cover.includes('$' + (E.commit / 1e6).toFixed(2) + 'M'));
  check('cover: the critical path lists the critical tasks in order, then the CO and the lease-up', E.names.every(n => cover.includes(n)) && cover.indexOf(E.names[0]) < cover.indexOf(E.names[E.names.length - 1]) && /Certificate of occupancy/.test(cover) && /Lease-up/.test(cover));
  const tbl = rp.text.slice(1 + ganttPages, 1 + ganttPages + Math.ceil(rows / 15)).join('\n');
  check('task table: every task, its predecessors and CRITICAL on each critical row', E.names.every(n => tbl.includes(n)) && (tbl.match(/CRITICAL/g) || []).length >= E.ncrit && /\t\d+ -\d+\t/.test(tbl));
  const fund = rp.text[rp.n - 2].replace(/\n/g, ' ');
  const need = fund.match(/Through stabilization\s+\$([\d,]+)\s+\$([\d,]+)\s+\$([\d,]+)\s+\$([\d,]+)/);
  check('funding: uses through stabilization equal the engine\'s monthly need, and equity + loan draws = uses', need && Math.abs(+need[1].replace(/,/g, '') - Math.round(E.needStab)) <= 1 && Math.abs(+need[2].replace(/,/g, '') + +need[3].replace(/,/g, '') - +need[1].replace(/,/g, '')) <= 2, need && need.slice(1).join(' | '));
  const dl = rp.text[rp.n - 1].replace(/\n/g, ' ');
  check('delay table: as underwritten is the engine\'s IRR (' + pc(E.base.irr) + ') and +3 months is an independent engine run (' + pc(E.d3.irr) + ', CO month ' + E.d3.co + ')', dl.includes('As underwritten') && dl.includes(pc(E.base.irr)) && dl.includes(pc(E.d3.irr)) && dl.includes(pc(E.d1.irr)) && E.d3.co === E.co + 3 && dl.includes(money(E.d3.eq)), dl.slice(0, 160));
  check('delay table: more delay always costs more IRR (monotonic) and the sentence names the cost of one month', E.d1.irr < E.base.irr && E.d3.irr < E.d1.irr && /Each month of construction delay costs about \d+ bps/.test(dl));
  check('the summary is white paper, not themed (hard-coded colors)', /rgb\(255, 255, 255\)/.test(rp.bg));

  /* ---- a real PDF ---- */
  await p.emulateMedia({ media: 'print' }); const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bksr-')), f = path.join(tmp, 'schedule.pdf');
  await p.pdf({ path: f, preferCSSPageSize: true, printBackground: true });
  const info = execFileSync('pdfinfo', [f]).toString(), txt = execFileSync('pdftotext', ['-layout', f, '-']).toString();
  const pages = +(/Pages:\s+(\d+)/.exec(info) || [])[1], size = (/Page size:\s+([\d.]+) x ([\d.]+)/.exec(info) || []);
  check('the PDF has exactly the summary\'s pages (' + rp.n + ') on letter landscape (792 x 612 pt)', pages === rp.n && Math.round(+size[1]) === 792 && Math.round(+size[2]) === 612, info.match(/Pages:.*|Page size:.*/g).join(' / '));
  check('the PDF carries the title, every task, the dates and "Page 1 of ' + rp.n + '", and none of the application', /Development schedule summary/.test(txt) && E.names.every(n => txt.includes(n)) && txt.includes('Page 1 of ' + rp.n) && txt.includes(E.coDate) && !/Deal Snapshot|Local only|Color key|Undo/.test(txt));
  check('printing did not add the generic print header (the summary prints its own pages)', await p.evaluate(() => !document.getElementById('bk-print-head')));
  await p.emulateMedia({ media: 'screen' });
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  check('Escape closes the summary and leaves nothing behind', await p.evaluate(() => !document.getElementById('bk-sr') && !document.getElementById('bk-sr-page') && !document.documentElement.classList.contains('bk-sr-open')));
  check('no page errors', p.errs.length === 0, p.errs.join(' | ')); await p.context().close();

  /* ---- a long schedule: the table paginates and the Gantt still fits its page ---- */
  const q = await open(D); await tasksMode(q);
  await q.evaluate(async () => { const s = bkLoad(), T = s.devGantt.tasks.slice(), last = T[T.length - 1]; for (let i = 0; i < 18; i++) T.push({ id: 'x' + i, name: 'Extra trade package number ' + (i + 1), group: i % 5 === 0 ? 'other' : 'construction', start: 8 + i, dur: 3, preds: i ? [{ id: 'x' + (i - 1), lag: -2 }] : [{ id: T[1].id, lag: 0 }] }); s.devGantt.tasks = T; bkDevGanttSync(s); bkSave(s); showSheet('Dev Schedule'); await new Promise(r => setTimeout(r, 900)); bkDevScheduleReport(); await new Promise(r => setTimeout(r, 900)); });
  const lg = await q.evaluate(() => { const pages = [...document.querySelectorAll('#bk-sr .sr-page')], gp = pages.filter(e => e.querySelector('svg[aria-label*="Gantt"]')), fit = gp.every(e => { const g = e.querySelector('svg').getBoundingClientRect(), bb = e.querySelector('.sr-body').getBoundingClientRect(); return g.bottom - bb.top <= bb.height; }), g = pages[1].querySelector('svg').getBoundingClientRect(), body = pages[1].querySelector('.sr-body').getBoundingClientRect(); return { n: pages.length, gantts: gp.length, fit, over: pages.map(e => { const bb = e.querySelector('.sr-body'); return bb.scrollHeight - bb.clientHeight; }), svgBottom: Math.round(g.bottom - body.top), bodyH: Math.round(body.height), tbl: pages.filter(e => /Task schedule/.test(e.innerText)).length, names: pages.map(e => e.innerText).join('\n') }; });
  check('22 tasks: the task table runs to several pages and every task is in it', lg.tbl >= 2 && [...Array(18).keys()].every(i => lg.names.includes('Extra trade package number ' + (i + 1))), lg.tbl);
  check('22 tasks: the Gantt runs over several pages, each fits its page, and nothing runs off any page', lg.gantts >= 2 && lg.fit && lg.over.every(v => v <= 1), JSON.stringify({ gantts: lg.gantts, fit: lg.fit, over: lg.over }));
  await q.context().close();

  /* ---- a phase-only schedule, an acquisition, a phone, night mode ---- */
  const r = await open(D); await r.evaluate(async () => { showSheet('Dev Schedule'); await new Promise(res => setTimeout(res, 700)); bkDevScheduleReport(); await new Promise(res => setTimeout(res, 800)); });
  const ph = await r.evaluate(() => { const t = [...document.querySelectorAll('#bk-sr .sr-page')].map(e => e.innerText).join('\n'); return { n: document.querySelectorAll('#bk-sr .sr-page').length, t }; });
  check('with no task schedule the summary still builds from the phase durations and says so', ph.n >= 5 && /phase durations/.test(ph.t) && /Pre-development/.test(ph.t) && /Construction/.test(ph.t), ph.n); check('phase-only: no page errors', r.errs.length === 0, r.errs.join(' | ')); await r.context().close();
  const a = await open(A); const acq = await a.evaluate(async () => { showSheet('Dev Schedule'); await new Promise(res => setTimeout(res, 700)); bkDevScheduleReport(); await new Promise(res => setTimeout(res, 300)); return { overlay: !!document.getElementById('bk-sr'), btn: !!document.querySelector('#viewport button[onclick*="bkDevScheduleReport"]') }; });
  check('an acquisition has no schedule summary and no button for it', !acq.overlay && !acq.btn, JSON.stringify(acq)); await a.context().close();
  const ph1 = await open(D, 390); await tasksMode(ph1); await ph1.evaluate(async () => { bkDevScheduleReport(); await new Promise(res => setTimeout(res, 700)); });
  const sm = await ph1.evaluate(() => ({ z: +(document.querySelector('#bk-sr .sr-pages').style.zoom || 1), sw: document.getElementById('bk-sr').scrollWidth, cw: document.getElementById('bk-sr').clientWidth }));
  check('on a phone the summary is scaled to fit the screen width, with its own toolbar', sm.z < 0.5 && sm.sw <= sm.cw + 2, JSON.stringify(sm)); await ph1.context().close();
  const nt = await open(D, 1280, 'dark'); await tasksMode(nt); await nt.evaluate(async () => { bkDevScheduleReport(); await new Promise(res => setTimeout(res, 700)); });
  const dk = await nt.evaluate(() => ({ bg: getComputedStyle(document.querySelector('#bk-sr .sr-page')).backgroundColor, ink: getComputedStyle(document.querySelector('#bk-sr h1')).color }));
  check('in night mode the printed pages are still dark ink on white', dk.bg === 'rgb(255, 255, 255)' && /^rgb\(20, 40, 61\)$/.test(dk.ink), JSON.stringify(dk)); await nt.context().close();

  console.log('devschedule_report: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
