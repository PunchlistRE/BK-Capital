// Pre-Offer Bid: the maximum supportable purchase price, found by re-running the engine at each candidate price.
// Each answer is checked here with the engine run DIRECTLY (not through the sheet) just below and just above the reported price,
// and the per-constraint limits are re-derived by a separate bisection written in this file.
//   node audit/prebid_test.js index.html
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
  const load = (bid) => p.evaluate(([d, bid]) => { bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); if (bid) s._bid = bid; bkSave(s); }, [A, bid]);
  /* the engine, run directly at a price (and in a case) */
  const eng = (price, down) => p.evaluate(([price, down]) => { const ov = { purchasePrice: price }; if (down) Object.assign(ov, bkScenarioOverrides(bkLoad(), 'Downside')); return bkRunWith(ov, () => { const m = bkMonthlyReturns(), d = m.d; return { irr: m.irr, moic: m.moic, equity: d.equity, loan: d.loan, fee: d.fee, ltv: d.ltv, ltc: d.ltc, dscr: d.dscrAmortizing, dy: d.dscrNoi / d.loan }; }); }, [price, down]);
  const solveRaw = () => p.evaluate(() => { const R = bkBidSolve(); return R.error ? { error: R.error } : { status: R.all.status, max: R.all.max, mono: R.all.monotone, binding: R.binding, per: R.per, below: R.belowOk, above: R.aboveViolates, step: R.step, tol: R.tol, asking: R.asking, scen: R.scen.map(z => ({ key: z.key, price: z.price, irr: z.r.irr, irrDown: z.r.irrDown, equity: z.r.equity, loan: z.r.loan, ok: z.pass.ok, bad: z.pass.bad })), why: R.all.why }; });
  const OFF = ['irr', 'em', 'lpIrr', 'dscr', 'dscrS', 'dy', 'ltv', 'ltc', 'maxEq', 'dIrr'];
  const only = (id, val) => { const on = {}; OFF.forEach(k => on[k] = k === id); const v = {}; if (val !== undefined) v[id] = val; return { on, val: v }; };

  /* 1. default constraints (credit policy: IRR 12%, multiple 2.25x, DSCR 1.25x, debt yield 8.5%, LTV 65%, LTC 70%) */
  await load();
  const before = await p.evaluate(() => JSON.stringify(bkLoad(), (k, v) => k === '_bid' ? undefined : v));
  const R = await solveRaw();
  const after = await p.evaluate(() => JSON.stringify(bkLoad(), (k, v) => k === '_bid' ? undefined : v));
  check('solving changes nothing on the deal', before === after);
  check('a feasible bid is found, as one unbroken range of prices', R.status === 'solved' && R.mono === true, R.status);
  const lo = await eng(R.max - R.step), hi = await eng(R.max + R.step);
  check('engine run directly just BELOW the bid: every active constraint is met (IRR >= 12%, multiple >= 2.25x, DSCR, debt yield, LTV, LTC)', lo.irr >= 0.12 && lo.moic >= 2.25 && lo.dscr >= 1.25 - 1e-6 && lo.dy >= 0.085 && lo.ltv <= 0.65 + 1e-9 && lo.ltc <= 0.70 + 1e-9, `irr ${lo.irr.toFixed(4)} moic ${lo.moic.toFixed(4)}`);
  check('engine run directly just ABOVE the bid: the equity multiple has dropped below 2.25x', hi.moic < 2.25 && hi.irr >= 0.12, `moic ${hi.moic.toFixed(4)} at $${M(R.max + R.step)}`);
  check('the binding constraint is the equity multiple (it is the one the engine violates above the bid)', R.binding.length === 1 && R.binding[0] === 'em', R.binding.join());
  check('the sheet reports its own verification as passed', R.below === true && R.above === true);
  /* an independent bisection on the multiple and on the IRR, written here */
  const bis = async (key, target) => { let l = R.asking * 0.25, h = R.asking * 1.5; for (let i = 0; i < 40; i++) { const m = (l + h) / 2, r = await eng(m); (r[key] >= target ? l = m : h = m); } return l; };
  const emMax = await bis('moic', 2.25), irrMax = await bis('irr', 0.12);
  const perEm = R.per.find(q => q.id === 'em'), perIrr = R.per.find(q => q.id === 'irr');
  check('the multiple\'s own limit equals an independent bisection of the engine', Math.abs(perEm.max - emMax) <= R.tol * 3, `${M(perEm.max)} vs ${M(emMax)}`);
  check('the IRR\'s own limit equals an independent bisection of the engine, and is higher than the multiple\'s', Math.abs(perIrr.max - irrMax) <= R.tol * 3 && perIrr.max > perEm.max, `${M(perIrr.max)} vs ${M(irrMax)}`);
  check('the overall bid is the lowest of the individual limits', Math.abs(R.max - Math.min(...R.per.filter(q => q.max != null && q.status === 'solved').map(q => q.max))) <= R.tol * 3);
  check('constraints that loan sizing already enforces (DSCR, debt yield, LTV, LTC) do not limit the price and say so', ['dscr', 'dy', 'ltv', 'ltc'].every(id => R.per.find(q => q.id === id).status === 'unbounded'), R.per.map(q => q.id + ':' + q.status).join(' '));

  /* 2. the three offer-price scenarios are fresh engine runs */
  await load({ offer: 21500000 });
  const R2 = await solveRaw(), sc = Object.fromEntries(R2.scen.map(z => [z.key, z]));
  check('asking, maximum bid and the proposed offer are all shown', !!sc.ask && !!sc.max && !!sc.offer && sc.offer.price === 21500000);
  const e1 = await eng(21500000), e2 = await eng(24000000), e3 = await eng(21500000, true);
  check('the offer scenario matches an engine run at that price (IRR, equity, loan) and its downside case', Math.abs(sc.offer.irr - e1.irr) < 1e-9 && Math.abs(sc.offer.equity - e1.equity) < 1 && Math.abs(sc.offer.loan - e1.loan) < 1 && Math.abs(sc.offer.irrDown - e3.irr) < 1e-9, `${sc.offer.irr.toFixed(4)} down ${sc.offer.irrDown.toFixed(4)}`);
  check('equity and loan move with the price (debt is re-sized, fees and closing costs re-calculated)', sc.ask.equity !== sc.offer.equity && sc.ask.loan !== sc.offer.loan && Math.abs(sc.ask.equity - e2.equity) < 1);
  check('at asking the active constraints fail, at the maximum bid they all pass', sc.ask.ok === false && sc.max.ok === true && sc.ask.bad.includes('irr'));
  check('the offer above the bid fails the multiple constraint', sc.offer.ok === false && sc.offer.bad.includes('em'));

  /* 3. other constraint types, each checked against the engine directly */
  await load(only('maxEq', 8000000));
  const R3 = await solveRaw(), q3a = await eng(R3.max - R3.step), q3b = await eng(R3.max + R3.step);
  check('maximum equity $8,000,000: solved, binding on equity; engine equity at the bid is just under and just over the cap above it', R3.status === 'solved' && R3.binding[0] === 'maxEq' && q3a.equity <= 8000000 + 1e-6 && q3b.equity > 8000000, `${M(R3.max)}; equity ${M(q3a.equity)} / ${M(q3b.equity)}`);
  await load(only('dIrr', 0.08));
  const R4 = await solveRaw(), d4a = await eng(R4.max - R4.step, true), d4b = await eng(R4.max + R4.step, true);
  check('downside-case IRR >= 8%: the engine\'s own downside case is >= 8% just below and < 8% just above', R4.status === 'solved' && d4a.irr >= 0.08 && d4b.irr < 0.08 && R4.binding[0] === 'dIrr', `${M(R4.max)}; ${d4a.irr.toFixed(4)} / ${d4b.irr.toFixed(4)}`);
  await load(only('lpIrr', 0.10));
  const R5 = await solveRaw();
  check('LP IRR (after the waterfall) >= 10%: a bid is found and reported with its own verification', (R5.status === 'solved' || R5.status === 'not-monotone') && R5.max > 0 && R5.below === true, R5.status + ' ' + M(R5.max));
  await load(only('irr', 0.12));
  const R6 = await solveRaw(), i6 = await eng(R6.max - R6.step), i6b = await eng(R6.max + R6.step);
  check('IRR >= 12% alone: the engine\'s IRR is >= 12% just below and < 12% just above the bid', i6.irr >= 0.12 && i6b.irr < 0.12 && R6.binding[0] === 'irr', `${i6.irr.toFixed(5)} / ${i6b.irr.toFixed(5)}`);

  /* 4. the answers the sheet must not fake */
  await load(only('dscr', 5));
  const R7 = await solveRaw();
  check('an unmeetable constraint (DSCR >= 5.0x) reports no feasible bid, not a price', R7.status === 'infeasible' && R7.max == null, R7.why);
  await load(only('ltv', 1));
  const R8 = await solveRaw();
  check('a constraint that never binds (LTV <= 100%) is reported as not bounding the price, not a made-up maximum', R8.status === 'unbounded', R8.status);
  await load({ on: Object.fromEntries(OFF.map(k => [k, false])) });
  const R9 = await solveRaw();
  check('with no constraint active it says so', !!R9.error && /No constraint/.test(R9.error), R9.error);

  /* 5. the sheet and persistence */
  await load({ offer: 21500000 });
  const ui = await p.evaluate(async () => { showSheet('Pre-Offer Bid'); await new Promise(r => setTimeout(r, 600)); return document.querySelector('#viewport').innerText; });
  check('the sheet shows the bid, the binding constraint, the verification, each constraint alone and the scenarios', /Maximum supportable bid/.test(ui) && /Binding constraint/.test(ui) && /Verified/.test(ui) && /Each constraint on its own/.test(ui) && /Offer-price scenarios/.test(ui) && /At your proposed offer/.test(ui));
  await p.evaluate(() => { bkBidVal('em', '2.0'); }); await p.waitForTimeout(500);
  const sv = await p.evaluate(() => ({ v: bkLoad()._bid.val.em, price: bkLoad().purchasePrice }));
  check('editing a target stores it in the bid settings, never on the deal\'s own inputs', sv.v === 2 && sv.price === 24000000);
  const R10 = await solveRaw(); check('relaxing the multiple to 2.0x raises the bid', R10.max > R.max, `${M(R10.max)} > ${M(R.max)}`);
  const dev = await p.evaluate(() => { bkCreateNewDeal({ name: 'Dev', dealId: 'DEV', dealType: 'Development' }); showSheet('Pre-Offer Bid'); return document.querySelector('#viewport').innerText; });
  check('a development deal is told the land value is solved on Residual Land', /covers acquisition deals/.test(dev));
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
