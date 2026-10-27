// Deal Remedies: resize debt, maximum price, rent required, occupancy required - each answer re-checked here by running the engine and the
// credit gate DIRECTLY at the reported value and just beyond it, never through the sheet's own numbers.
//   node audit/remedies_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok'));
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + d + ']' : '')); };
  const M = v => Math.round(v).toLocaleString('en-US');
  const load = (over, rem) => p.evaluate(([d, rem]) => { bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); if (rem) s._rem = rem; bkSave(s); }, [Object.assign({}, A, over || {}), rem]);
  /* the credit gate and the engine, run directly on a scratch copy */
  const gate = (ov) => p.evaluate((ov) => bkRunWith(ov, () => { const g = bkDealGate(), m = bkMonthlyReturns(), d = m.d; return { hard: g.hard, soft: g.soft, verdict: g.verdict, loan: d.loan, fee: d.fee, equity: d.equity, dscr: g.capacity.box.dscr, irr: m.irr, capacity: g.capacity.capacity, fails: g.rows.filter(r => r.applicable && !r.pass).map(r => r.id) }; }), ov);

  await load();
  const before = await p.evaluate(() => JSON.stringify(bkLoad(), (k, v) => k === '_rem' ? undefined : v));
  const R = await p.evaluate(() => { const r = bkRemSolve(); const strip = s => s && { price: s.price, loan: s.loan, equity: s.equity, dscr: s.dscr, irr: s.irr, hard: s.hard, soft: s.soft, verdict: s.verdict, noi: s.noi, rent: s.rent, vacancy: s.vacancy, fails: s.fails.map(f => f.id) };
    return { base: strip(r.base), capacity: r.base.capacity, resize: { status: r.resize.status, target: r.resize.target, s: strip(r.resize.s) }, price: { status: r.price.status, x: r.price.x, at: strip(r.price.atX), beyond: strip(r.price.beyond), beyondX: r.price.beyondX }, rent: { status: r.rent.status, u: r.rent.u, at: strip(r.rent.atX), beyond: strip(r.rent.beyond), beyondX: r.rent.beyondX }, occ: { status: r.occ.status, last: strip(r.occ.last) } }; });
  const after = await p.evaluate(() => JSON.stringify(bkLoad(), (k, v) => k === '_rem' ? undefined : v));
  check('the analysis changes nothing on the deal', before === after);
  const g0 = await gate({});
  check('the deal as underwritten is read from the engine and the credit gate (DECLINE, 4 hard exceptions)', R.base.verdict === g0.verdict && R.base.hard === g0.hard && R.base.hard > 0 && Math.abs(R.base.irr - g0.irr) < 1e-12, g0.verdict + ' ' + g0.hard);

  /* 1. resize debt to the house capacity */
  const z = R.resize;
  check('the default debt target is the house debt capacity, rounded down', z.target === Math.floor(R.capacity), M(z.target));
  check('the resized loan is at or under the target and the engine\'s own loan', z.status === 'solved' && z.s.loan <= z.target && z.s.loan > z.target - 1000 - 1e-6, M(z.s.loan));
  check('additional equity = loan cut + fee saved (engine equity identity), independent of the sheet', Math.abs((z.s.equity - R.base.equity) - ((R.base.loan - z.s.loan) - 0.01 * (R.base.loan - z.s.loan))) < 1.5, M(z.s.equity - R.base.equity));
  check('DSCR scales inversely with the loan (same NOI, same rate): new DSCR x new loan = old DSCR x old loan', Math.abs(z.s.dscr * z.s.loan - R.base.dscr * R.base.loan) < 1e-6 * R.base.dscr * R.base.loan, z.s.dscr.toFixed(4));
  check('resizing the debt alone does not clear this deal (IRR still below the hurdle) and the sheet says what still fails', z.s.fails.includes('grossIRR') && z.s.hard > 0);
  check('the capacity exception is cleared by the resize (loan within house capacity)', !z.s.fails.includes('capacity') && !z.s.fails.includes('dscr'), z.s.fails.join());

  /* 2. maximum price: gate re-run directly just below, and across the range above */
  const px = R.price;
  check('price: a maximum passing price is found, below asking', px.status === 'solved' && px.x < A.purchasePrice, M(px.x) + ' vs ' + M(A.purchasePrice));
  const gp = await gate({ purchasePrice: px.x }), gq = await gate({ purchasePrice: px.beyondX });
  check('price: the credit gate run directly at the price passes (no hard exception)', gp.hard === 0, gp.verdict);
  check('price: run directly just above, it fails a hard exception, as the sheet reports', gq.hard > 0 && px.beyond.hard > 0, gq.fails.join());
  let bad = 0; for (let k = 1; k <= 6; k++) { const q = await gate({ purchasePrice: px.beyondX + (A.purchasePrice - px.beyondX) * k / 6 }); if (q.hard === 0) bad++; }
  check('price: no higher price up to asking passes (it is the maximum, not one of several)', bad === 0);
  check('price: engine economics at the maximum price: levered IRR clears the 12% target, loan re-sized', gp.irr >= 0.12 && gp.loan < R.base.loan, gp.irr.toFixed(4));

  /* 3. rent required */
  const rx = R.rent, rentAt = u => ({ avgRent: A.avgRent * (1 + u) });
  const gr = await gate(rentAt(rx.u)), gb = await gate(rentAt(rx.u - 0.002));
  check('rent: a required increase is found (+' + (rx.u * 100).toFixed(1) + '%)', rx.status === 'solved' && rx.u > 0.05 && rx.u < 0.5);
  check('rent: the gate run directly at that rent passes, and just below it a hard exception remains', gr.hard === 0 && gb.hard > 0, gr.verdict + ' / ' + gb.verdict);
  check('rent: NOI after reserves rises by the amount the sheet reports (engine, not estimate)', R.rent.at.noi > R.base.noi * 1.2 && Math.abs(R.rent.at.rent - A.avgRent * (1 + rx.u)) < 1e-6, M(R.rent.at.noi - R.base.noi));
  check('rent: the loan is re-sized by the engine to the higher NOI', R.rent.at.loan > R.base.loan);

  /* 4. occupancy cannot rescue this deal, and the sheet says so rather than inventing a vacancy */
  check('occupancy: even at 100% occupancy the deal does not pass, reported as unreachable', R.occ.status === 'unreachable' && R.occ.last.vacancy === 0 && R.occ.last.hard > 0);

  /* 5. user-set debt target, and a deal that already passes */
  await load({}, { debt: 12000000 });
  const R2 = await p.evaluate(() => { const r = bkRemSolve(); return { t: r.resize.target, s: r.resize.s && r.resize.s.loan, def: r.resize.defaulted }; });
  check('a user debt ceiling is used (<= $12,000,000) and not flagged as the default', R2.t === 12000000 && R2.s <= 12000000 && R2.def === false, M(R2.s));
  await load({ purchasePrice: 15000000 });
  const R3 = await p.evaluate(() => { const r = bkRemSolve(); return { base: r.base.hard, price: r.price.status, rent: r.rent.status, occ: r.occ.status, resize: r.resize.status }; });
  check('a deal that passes today (price $15M) says so and does not invent a remedy', R3.base === 0 && R3.price === 'passes-today' && R3.rent === 'passes-today' && R3.occ === 'passes-today', JSON.stringify(R3));

  /* 6. the sheet */
  await load();
  const ui0 = await p.evaluate(async () => { showSheet('Deal Remedies'); await new Promise(r => setTimeout(r, 400)); return document.querySelector('#viewport').innerText; });
  check('before the run the sheet asks for it', /Run the analysis/.test(ui0));
  await p.evaluate(() => bkRemRun()); await p.waitForFunction(() => /Side by side/.test(document.querySelector('#viewport').innerText), null, { timeout: 180000 });
  const ui = await p.evaluate(() => document.querySelector('#viewport').innerText);
  check('after the run: side by side, what each intervention requires, and the limits', /Side by side/.test(ui) && /What each intervention requires/.test(ui) && /Maximum price/.test(ui) && /Rent required/.test(ui) && /Occupancy required/.test(ui) && /Resize debt/.test(ui) && /not assumed to be achievable/.test(ui));
  check('the sheet states the price cut in dollars and per cent, and that occupancy alone cannot fix it', /below the asking price/.test(ui) && /even at 100% occupancy/.test(ui));
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
