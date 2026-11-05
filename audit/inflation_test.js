// Market > Inflation tells the truth about what the model reads. On an acquisition: an entered year looks entered, an inherited year looks inherited, and an Average column shows the
// compound average of the rates the model actually uses. On a development deal the grid shows only what the development engine reads (the engine ignores year-by-year rates,
// other-income, tax and retail growth: proved here by moving them and watching the returns).
//   node audit/inflation_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), V = require(path.join(__dirname, 'devdeal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 420) + ']' : '')); };
  const open = async (deal, over) => { const p = await (await b.newContext({ viewport: { width: 1300, height: 1000 } })).newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate(([d, o]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d, o || {}); bkSave(s); }, [deal, over]); return p; };
  const goInfl = (p) => p.evaluate(async () => { bkEdSub('Market', 'infl'); await new Promise(r => setTimeout(r, 400)); });
  const g = (a, k) => Math.pow(k.reduce((t, r) => t * (1 + r), 1), 1 / k.length) - 1;
  const fmt = (v) => (v * 100).toFixed(2) + '%';

  /* acquisition: rent entered for years 2 and 3 (5% and 7%), opex for year 3 (4%); hold 5 years, annual steps */
  let p = await open(A, { holdYears: 5, growthCurves: { rent: [null, 0.05, 0.07], opex: [null, null, 0.04] } }); await goInfl(p);
  const t = await p.evaluate(() => { const rows = {}; document.querySelectorAll('#viewport table.ae-curves tbody tr').forEach(tr => { const c = [...tr.children]; rows[c[0].textContent.trim()] = { cells: c.slice(2, -1).map(td => ({ cls: td.className, txt: td.textContent.trim(), v: (td.querySelector('input') || {}).value, ph: (td.querySelector('input') || {}).placeholder })), avg: c[c.length - 1].textContent.trim() }; });
    const ent = document.getElementById('ae-cv-rent-2'), inh = document.getElementById('ae-cv-rent-4'); const cs = (e, ps) => { const c = getComputedStyle(e, ps || null); return { bg: c.backgroundColor, fw: c.fontWeight, fs: c.fontStyle, color: c.color }; };
    return { rows, ent: cs(ent), inh: cs(inh), inhPh: cs(inh, '::placeholder'), head: [...document.querySelectorAll('#viewport table.ae-curves thead th')].map(h => h.textContent.trim()), text: document.querySelector('#viewport').textContent }; });
  check('acquisition: the grid has an Average column after the years', t.head[0] === 'Name' && t.head[1] === 'Default' && t.head[t.head.length - 1] === 'Average', t.head.join(' | '));
  const rentAvg = fmt(g(0, [0.05, 0.07, 0.03, 0.03])), opexAvg = fmt(g(0, [0.03, 0.04, 0.03, 0.03]));
  check('Average is the compound average of the rates the model uses (years 2 to 5): rent (5%, 7%, then the 3% Default twice) = ' + rentAvg + ', expense = ' + opexAvg + '; a stream with no entries equals its Default', t.rows['Market Rent Growth'].avg === rentAvg && t.rows['Expense Inflation'].avg === opexAvg && t.rows['Other Income Growth'].avg === '2.00%' && t.rows['Real Estate Tax Growth'].avg === '2.00%', JSON.stringify([t.rows['Market Rent Growth'].avg, t.rows['Expense Inflation'].avg, t.rows['Other Income Growth'].avg]));
  check('an entered year is marked entered (yellow, bold) and an inherited year is marked inherited (a different ground, gray italic placeholder), so the two cannot be mistaken', t.rows['Market Rent Growth'].cells[1].cls === 'ent' && t.rows['Market Rent Growth'].cells[3].cls === 'inh' && t.ent.bg !== t.inh.bg && Number(t.ent.fw) >= 600 && t.inhPh.fs === 'italic' && Number(t.inhPh.fw) < 600 && t.inhPh.color !== t.ent.color, JSON.stringify([t.ent, t.inh, t.inhPh]));
  check('the page explains it: entered versus inherited, a blank year uses the Default (not zero), and what Average is', /you entered it/.test(t.text) && /inherited from the Default/.test(t.text) && /not zero/.test(t.text) && /compound average/.test(t.text));
  check('taxes step once a year from year 2, so the tax row has no year-1 box', t.rows['Real Estate Tax Growth'].cells[0].txt === '-' && t.rows['Real Estate Tax Growth'].cells[0].v === undefined, JSON.stringify(t.rows['Real Estate Tax Growth'].cells[0]));
  const before = await p.evaluate(() => JSON.stringify(bkLoad())); await p.evaluate(() => { const s = bkLoad(); s.cvRentGrowthStart = 'month1'; bkSave(s); }); await goInfl(p);
  const t2 = await p.evaluate(() => { const o = {}; document.querySelectorAll('#viewport table.ae-curves tbody tr').forEach(tr => { o[tr.children[0].textContent.trim()] = [tr.children[2].textContent.trim(), !!tr.children[2].querySelector('input')]; }); return o; });
  check('with continuous growth year 1 grows too (a year-1 box for rent, other income, expense and retail), but not for taxes', t2['Market Rent Growth'][1] && t2['Expense Inflation'][1] && !t2['Real Estate Tax Growth'][1], JSON.stringify(t2));
  await p.close();

  /* development: only what the development engine reads is offered; and the claim on the page is proved by moving the rates */
  p = await open(V, {}); await goInfl(p);
  const d = await p.evaluate(() => { const rows = {}; document.querySelectorAll('#viewport table.ae-curves tbody tr').forEach(tr => { const c = [...tr.children]; rows[c[0].textContent.trim()] = { input: !!tr.querySelector('input'), cls: tr.className, what: c[c.length - 1].textContent.trim() }; }); return { rows, perYear: document.querySelectorAll('#viewport [id^="ae-cv-"]').length, head: [...document.querySelectorAll('#viewport table.ae-curves thead th')].map(h => h.textContent.trim()), text: document.querySelector('#viewport').textContent }; });
  check('development: Market Rent Growth and Expense Inflation are the two editable rows; other income, taxes and retail say "Not used by a development deal"; no year-by-year boxes at all',
    d.rows['Market Rent Growth'].input && d.rows['Expense Inflation'].input && ['Other Income Growth', 'Real Estate Tax Growth', 'Retail Rent Growth'].every(k => !d.rows[k].input && /Not used by a development deal/.test(d.rows[k].what)) && d.perYear === 0 && d.head.join('|') === 'Name|Rate|What it does on a development deal', JSON.stringify(d.rows).slice(0, 300));
  check('development: the page says a development deal grows its stabilized NOI as a whole', /grows its stabilized NOI as a whole/.test(d.text));
  const dev = async (over) => { const q = await open(V, over); const r = await q.evaluate(() => { const x = bkMonthlyReturns(); return x.irr; }); await q.close(); return r; };
  const base = await dev({}), moved = {}; for (const [k, v] of [['rentGrowth', 0.06], ['opexGrowth', 0.06], ['otherGrowth', 0.08], ['taxGrowth', 0.08], ['commercialRentGrowth', 0.08]]) moved[k] = Math.abs((await dev({ [k]: v })) - base) > 1e-12;
  const curve = Math.abs((await dev({ growthCurves: { rent: [null, 0.1, 0.1, 0.1], opex: [null, 0.08, 0.08], other: [null, 0.1], tax: [null, 0.1] } })) - base) > 1e-12;
  check('what the page says is true of the engine: on a development deal Market Rent Growth and Expense Inflation move the returns; other income, tax and retail growth and year-by-year rates do not (if the development engine ever reads them, this fails and the page must change with it)', moved.rentGrowth && moved.opexGrowth && !moved.otherGrowth && !moved.taxGrowth && !moved.commercialRentGrowth && !curve, JSON.stringify(Object.assign({ curves: curve }, moved)));
  await p.close();
  p = await open(V, { commLeaseModel: true, leases: [{ tenant: 'Cafe', suite: '1', sf: 2000, status: 'Occupied', start: '2028-01-01', end: '2033-12-31', rent: 30, bump: 0.03, mkt: 32, recType: 'NNN' }] }); await goInfl(p);
  const lease = await p.evaluate(() => { const o = {}; document.querySelectorAll('#viewport table.ae-curves tbody tr').forEach(tr => { o[tr.children[0].textContent.trim()] = !!tr.querySelector('input'); }); return o; });
  check('development with a tenant schedule: Retail Rent Growth is offered too (the lease engine reads it)', lease['Retail Rent Growth'] === true && lease['Other Income Growth'] === false, JSON.stringify(lease)); await p.close();

  /* looking at the tab changes nothing */
  p = await open(A, { growthCurves: { rent: [null, 0.05] } }); const s0 = await p.evaluate(() => JSON.stringify(bkLoad()) + '|' + bkMonthlyReturns().irr); await goInfl(p); const s1 = await p.evaluate(() => JSON.stringify(bkLoad()) + '|' + bkMonthlyReturns().irr);
  check('opening Market > Inflation writes nothing and moves no figure', s0 === s1); const errs = p.errs.slice(); await p.close();
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
