// Field search (owner-approved, November 2026): the search box (Ctrl/Cmd+K, "/") finds individual inputs as well as pages and actions. It is the Inputs index made searchable, not another list:
// the same inputs (only those the open deal uses), the same status and value, and choosing one opens the real box through the same jump (bkInputsGo). Nothing is written; pages and actions still come back.
//   node audit/field_search_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), D = require(path.join(__dirname, 'devdeal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const failed = []; const check = (n, ok, d) => { checks++; if (!ok){ fails++; failed.push(n.slice(0, 90) + (d !== undefined ? ' [' + String(d).slice(0, 200) + ']' : '')); } console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 500) + ']' : '')); };
  const open = async (deal, x) => { const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 } }), p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr|newyorkfed/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate(([d, x]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); if (x) { const s = bkLoad(); Object.assign(s, x); bkSave(s); } }, [deal, x || null]); return p; };
  const search = (p, q) => p.evaluate(async (q) => { bkPalette.open(); const i = document.getElementById('pl-pq'); i.value = q; i.dispatchEvent(new Event('input')); await new Promise(r => setTimeout(r, 60));
    const out = []; let sec = ''; document.querySelectorAll('#pl-pl .sec, #pl-pl .it').forEach(e => { if (e.classList.contains('sec')) sec = e.innerText.trim(); else out.push({ sec, i: +e.dataset.i, t: e.innerText.replace(/\n/g, ' | ') }); }); return out; }, q);
  const snap = (p) => p.evaluate(() => JSON.stringify(bkLoad(), (k, v) => k === '_hist' ? undefined : v));
  const p = await open(A);

  /* every input the deal uses can be found by its own name, as the first input result */
  const rows = await p.evaluate(() => bkInputsIndex().rows.filter(r => r.status !== 'na').map(r => ({ k: r.k, label: r.label, status: r.status })));
  const miss = [];
  for (const r of rows) { const res = await search(p, r.label); const first = res.filter(x => /^INPUTS$/i.test(x.sec))[0]; if (!first || !first.t.startsWith(r.label)) miss.push(r.label + ' -> ' + (first ? first.t : 'none')); }
  check('every input the open deal uses (' + rows.length + ') is found by its own name, as the top input result', rows.length > 40 && miss.length === 0, miss.slice(0, 5).join(' || '));

  /* the words people use */
  const al = [['ltv', 'Loan-to-value'], ['cap rate', 'Exit cap rate'], ['r&m', 'Repairs and maintenance'], ['management fee', 'Management fee'], ['occupancy', 'Vacancy'], ['property tax', 'Real estate taxes'], ['io', 'Interest-only'], ['land allocation', 'Land allocation'], ['pref', 'Preferred return'], ['hold period', 'Hold period']];
  const bad = []; for (const [q, want] of al) { const res = (await search(p, q)).filter(x => /^INPUTS$/i.test(x.sec)); if (!res[0] || !res[0].t.startsWith(want)) bad.push(q + ' -> ' + (res[0] ? res[0].t : 'none')); }
  check('common terms find the input they mean, first (LTV, cap rate, R&M, management fee, occupancy, property tax, IO, land allocation, pref, hold period)', bad.length === 0, bad.join(' || '));

  /* status and value come from the Inputs index */
  const v = (await search(p, 'vacancy')).find(x => /^Vacancy \|/.test(x.t)), t = (await search(p, 'capital gains rate')).find(x => /^Capital gains rate/.test(x.t));
  check('a result shows its group and, when entered, its value as the Inputs index formats it (Vacancy: Revenue, 5.00%)', v && /Revenue · 5\.00%/.test(v.t), v && v.t);
  check('a blank expected input says so (capital gains rate: Expected, not entered), the same status the Inputs index gives it', t && /Tax · Expected, not entered/.test(t.t) && rows.find(r => r.k === 'capGainsRate').status === 'expected', t && t.t);

  /* only what applies to this deal */
  const fx = await search(p, 'spread'), sofr = (await search(p, 'sofr')).filter(x => /^INPUTS$/i.test(x.sec)).map(x => x.t);
  check('inputs this deal does not use are not offered: on a fixed-rate loan the SOFR index and spread boxes are not listed', !fx.some(x => /Lender spread over the index/.test(x.t)) && !sofr.some(x => /Benchmark rate today|Which SOFR/.test(x)), sofr.join(' || '));
  const q = await open(A, { debtRateType: 'Floating' });
  const fl = (await search(q, 'sofr')).filter(x => /^INPUTS$/i.test(x.sec)).map(x => x.t);
  check('on a floating-rate loan they are: "sofr" finds the index, which SOFR, today\'s rate and the spread', ['Floating index', 'Which SOFR the loan uses', 'Benchmark rate today', 'Lender spread over the index'].every(w => fl.some(x => x.startsWith(w))), fl.join(' || '));
  const fr = (await search(q, 'interest rate')).filter(x => /^INPUTS$/i.test(x.sec)).map(x => x.t);
  check('and the fixed "Interest rate" box, which a floating loan does not use, is not offered', !fr.some(x => /^Interest rate \|/.test(x)), fr.join(' || '));

  /* searching writes nothing; choosing a result writes nothing beyond what the Inputs index's own jump to that page does */
  const pre = await snap(p); for (const qq of ['insurance', 'cap rate', 'sofr', 'land']) await search(p, qq); await p.evaluate(() => bkPalette.close());
  check('typing searches writes nothing to the deal', (await snap(p)) === pre);
  const ref = await open(A), r0 = await snap(ref); await ref.evaluate(async () => { bkInputsGo('insurance'); await new Promise(r => setTimeout(r, 1500)); }); const r1 = await snap(ref);
  const changed = (a, b) => { a = JSON.parse(a); b = JSON.parse(b); return [...new Set(Object.keys(a).concat(Object.keys(b)))].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map(k => k + '=' + JSON.stringify(b[k])).sort().join(';'); };
  const before = await snap(p);
  const land = await p.evaluate(async () => { bkPalette.open(); const i = document.getElementById('pl-pq'); i.value = 'insurance'; i.dispatchEvent(new Event('input')); await new Promise(r => setTimeout(r, 60));
    const it = [...document.querySelectorAll('#pl-pl .it')].find(e => /^Insurance, per year/.test(e.innerText)); it.click(); await new Promise(r => setTimeout(r, 1500));
    const box = document.querySelector('#viewport #ae-insurance, #viewport [data-bk-key="insurance"]'); return { open: document.getElementById('pl-palette').classList.contains('open'), box: !!box, vis: box ? box.getBoundingClientRect().height > 0 : false, flash: !!document.querySelector('.bk-ask-flash') }; });
  check('choosing "Insurance, per year" closes the search and opens the real insurance box on its own page, highlighted (as the Inputs index does)', !land.open && land.box && land.vis && land.flash, JSON.stringify(land));
  const jump = await p.evaluate(() => { const calls = []; const g = window.bkInputsGo; window.bkInputsGo = (k) => calls.push(k); const it = bkFieldSearchItems().find(x => x.key === 'exitCap'); it.run(); window.bkInputsGo = g; return calls; });
  check('the jump is the Inputs index\'s own (bkInputsGo), not a second way of finding boxes', jump.join() === 'exitCap');
  const mine = changed(before, await snap(p)), theirs = changed(r0, r1);
  check('opening an input from the search changes the deal exactly as the Inputs index\'s own jump to that box does (the search adds no write of its own)', mine === theirs, 'search: ' + mine + ' | index jump: ' + theirs);

  /* pages and actions still come back as before */
  const pg = await search(p, 'debt'), ac = await search(p, 'new deal'), none = await p.evaluate(async () => { bkPalette.open(); const i = document.getElementById('pl-pq'); i.value = ''; i.dispatchEvent(new Event('input')); await new Promise(r => setTimeout(r, 50)); return [...document.querySelectorAll('#pl-pl .sec')].map(e => e.innerText.trim()); });
  check('pages and actions are still found (Debt sheet; "Start a new deal")', pg.some(x => /^SHEETS$/i.test(x.sec) && /^Debt/.test(x.t)) && ac.some(x => /Start a new deal/.test(x.t)));
  check('with nothing typed the search opens as before (recent sheets and actions, no list of inputs)', !none.some(x => /^INPUTS$/i.test(x)), none.join());
  const hd = []; for (const qq of ['cap rate', 'debt', 'tax', 'rent']) { const r = await search(p, qq); const secs = r.map(x => x.sec); const runs = secs.filter((s, i) => i === 0 || s !== secs[i - 1]); if (new Set(runs).size !== runs.length) hd.push(qq); }
  check('headings are grouped: each kind appears once in a result list', hd.length === 0, hd.join());
  const ph = await p.evaluate(() => document.getElementById('pl-pq').placeholder);
  check('the search box says what it finds', /inputs/.test(ph), ph);

  /* a development deal */
  const d = await open(D); const dv = (await search(d, 'construction')).filter(x => /^INPUTS$/i.test(x.sec)).map(x => x.t);
  check('on a development deal its own inputs are found (construction)', dv.length > 0, dv.slice(0, 4).join(' || '));
  check('no page errors', p.errs.length === 0 && q.errs.length === 0 && d.errs.length === 0, p.errs.concat(q.errs, d.errs).join('|'));
  console.log('field search: ' + checks + ' checks, ' + fails + ' failures' + (fails ? ' -- failed: ' + failed.join(' || ') : ''));   /* the runner prints only the last line: name what failed there */ await b.close(); process.exit(fails ? 1 : 0);
})();
