// Financing Compare: the complete, dated economics of loan alternatives, reconciled to the underwriting engine.
// The loan SIZE is the engine's (it is a sizing result); the payment, interest, balance, fees, dated discounting and the all-in cost are
// worked out below from the closed-form loan formulas, independently of the sheet.
//   node audit/fincompare_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok'));
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + d + ']' : '')); };
  const near = (a, b, t) => Math.abs(a - b) <= t;

  const alts = [
    { id: 'A', name: 'Fixed', ov: {}, other: 0, prepay: 0 },
    { id: 'B', name: 'Floating + cap', ov: { debtRateType: 'Floating', debtIndexRate: 0.04, debtSpread: 0.03, debtIndexY2: 0.05, debtIndexY3: 0.06, rateCapCost: 50000 }, other: 20000, prepay: 0 },
    { id: 'C', name: '3-year loan, refinanced', ov: { refiAtMaturity: 1, debtTerm: 3 }, other: 0, prepay: 0.01 },
    { id: 'D', name: 'Interest-only, higher points', ov: { acqIO: 24, acqOrigFee: 0.015 }, other: 15000, prepay: 0.02 },
    { id: 'E', name: '3-year loan, balloon, no refinance', ov: { refiAtMaturity: 0, debtTerm: 3 }, other: 0, prepay: 0 }
  ];
  const load = (alts, cfg) => p.evaluate(([d, alts, cfg]) => { bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); s._finAlts = alts; if (cfg) s._finCfg = cfg; bkSave(s); }, [A, alts, cfg]);
  await load(alts, { disc: 0.12 });
  const before = await p.evaluate(() => JSON.stringify(bkLoad(), (k, v) => (k === '_finAlts' || k === '_finCfg') ? undefined : v));
  const engIrr = await p.evaluate(() => bkMonthlyReturns().irr);
  const D = await p.evaluate(() => { const d = bkFinCompareData(); return { consistent: d.consistent, cfg: d.cfg, res: d.results.map(x => x.error ? { error: x.error } : { id: x.alt.id, loan: x.lev.loan, fee: x.lev.fee, eq: x.equityAtClose, upfront: x.upfront, int: x.interest, fees: x.fees, pen: x.penalty, pvInt: x.pvInterest, pvFees: x.pvFees, pvPen: x.pvPenalty, pvCost: x.pvCost, net: x.netPV, allIn: x.allIn, irr: x.lev.irr, irrAdj: x.irrAdj, rec: x.reconciled, diff: x.maxDiff, sd: x.stressDscr, dscr: x.lev.dscrAm, dscrNoi: x.lev.dscrNoi, pmtAm: x.lev.pmtAm, debtAtSale: x.lev.debtAtSale, events: x.events, n: x.n, maturityInHold: x.maturityInHold, hold: x.lev.hold, refi: x.lev.refi }), sens: d.sens.map(z => ({ r: z.r, n: z.rows.map(q => q.netPV) })) }; });
  const after = await p.evaluate(() => JSON.stringify(bkLoad(), (k, v) => (k === '_finAlts' || k === '_finCfg') ? undefined : v));

  /* 1. the deal itself is untouched, and alternative A (no overrides) is the deal as underwritten */
  check('running the alternatives changes nothing on the deal', before === after);
  check('alternative A (no overrides) has exactly the engine\'s levered IRR for the deal', near(D.res[0].irr, engIrr, 1e-12), D.res[0].irr + ' vs ' + engIrr);
  check('every alternative runs and covers the same dated months (60)', D.consistent && D.res.every(r => !r.error && r.n === 60));

  /* 2. alternative A against closed-form loan mathematics, dated like the engine (month-end dates from 31 Jan 2027, closing funds in month 1, actual days / 365) */
  const a = D.res[0], L = a.loan, c = 0.0675 / 12, N = 360, pmt = L * c / (1 - Math.pow(1 + c, -N));
  const dates = []; for (let m = 0; m < 60; m++) dates.push(Date.UTC(2027, m + 1, 0));
  const yrs = i => (dates[i] - dates[0]) / 86400000 / 365;
  let bal = L, intr = [], prin = [];
  for (let m = 0; m < 60; m++) { const i = bal * c; intr.push(i); prin.push(pmt - i); bal -= pmt - i; }
  const flows = new Array(60).fill(0); flows[0] += L - a.fee; for (let m = 0; m < 60; m++) flows[m] -= pmt; flows[59] -= bal;
  const pvf = (f, r) => f.reduce((t, v, i) => t + v / Math.pow(1 + r, yrs(i)), 0);
  check('A: the loan\'s fee is 1% of the loan, as stated', near(a.fee, L * 0.01, 1), a.fee);
  check('A: the balance repaid at sale equals the closed-form balance after 60 payments', near(a.debtAtSale, bal, 1), a.debtAtSale + ' vs ' + Math.round(bal));
  check('A: total interest equals the closed-form interest', near(a.int, intr.reduce((x, y) => x + y, 0), 1), Math.round(a.int) + ' vs ' + Math.round(intr.reduce((x, y) => x + y, 0)));
  check('A: net PV of the financing cash flows at 12% (actual days / 365) equals the independent figure', near(a.net, pvf(flows, 0.12), 1), Math.round(a.net) + ' vs ' + Math.round(pvf(flows, 0.12)));
  const feeF = new Array(60).fill(0); feeF[0] = a.fee;
  check('A: PV of interest and PV of fees are the independent discounted sums', near(a.pvInt, pvf(intr, 0.12), 1) && near(a.pvFees, pvf(feeF, 0.12), 1), Math.round(a.pvInt) + ' / ' + Math.round(a.pvFees));
  let lo = 0, hi = 1; for (let k = 0; k < 100; k++) { const mid = (lo + hi) / 2; (pvf(flows, mid) > 0 ? hi = mid : lo = mid); }
  check('A: the all-in cost of the loan equals the independent IRR of its flows', near(a.allIn, lo, 1e-6), (a.allIn * 100).toFixed(4) + '% vs ' + (lo * 100).toFixed(4) + '%');
  check('A: the all-in cost is above the stated 6.75% coupon (fees and monthly compounding are in it)', a.allIn > 0.0675 + 0.002, (a.allIn * 100).toFixed(3));
  check('A: stressed DSCR = DSCR NOI less 10% over amortising debt service', near(a.sd, a.dscrNoi * 0.9 / (a.pmtAm * 12), 1e-9) && near(a.pmtAm, pmt, 0.01), a.sd.toFixed(4));

  /* 3. every alternative reconciles to the engine: levered cash flow = unlevered cash flow + financing cash flows, in every month */
  D.res.forEach(r => check(r.id + ': financing cash flows reconcile to the engine\'s levered less unlevered cash flow in all 60 months', r.rec && r.diff < 1, r.diff));

  /* 4. the items the engine does not carry are charged here and only here */
  const B = D.res[1], C = D.res[2], Dd = D.res[3], E = D.res[4];
  check('B: the rate cap and other upfront costs are in upfront costs, and required equity = price + costs - loan + fee + cap + other', near(B.upfront, B.fee + 50000 + 20000, 0.5) && near(B.eq, 24720000 - B.loan + B.fee + 70000, 1), M2(B.eq));
  function M2(v) { return Math.round(v).toLocaleString('en-US'); }
  check('B: a floating loan\'s all-in cost is above the fixed loan\'s here, with its higher coupon path', B.allIn > a.allIn, (B.allIn * 100).toFixed(2) + ' vs ' + (a.allIn * 100).toFixed(2));
  check('B: with the 150 bps index shock the stressed DSCR is below the base-NOI stress alone', B.sd < B.dscrNoi * 0.9 / (B.pmtAm * 12) - 1e-6, B.sd.toFixed(3));
  check('D: the interest-only loan, 1.5% points: fee = 1.5% of the loan; upfront = fee + $15,000', near(Dd.fee, Dd.loan * 0.015, 1) && near(Dd.upfront, Dd.fee + 15000, 0.5));
  check('D: a 2% prepayment penalty on the balance repaid at sale inside the term (an interest-only loan owes the whole loan)', near(Dd.pen, 0.02 * Dd.loan, 1) && near(Dd.debtAtSale, Dd.loan, 1), Math.round(Dd.pen));
  check('D: the engine IRR excludes the penalty and other upfront cost; the adjusted IRR includes them and is lower', Dd.irrAdj < Dd.irr - 1e-4, (Dd.irr * 100).toFixed(2) + ' -> ' + (Dd.irrAdj * 100).toFixed(2));
  check('A and C: with no other charges the adjusted IRR is the engine IRR', near(a.irrAdj, a.irr, 1e-12));
  check('C: refinanced at maturity - the original loan is repaid in month 36 from the refinance; a repayment AT maturity carries no penalty, and the refinance loan\'s own prepayment terms are not an engine input', C.events.some(e => e.m === 36 && /refinance/.test(e.kind)) && C.pen === 0, JSON.stringify(C.events.map(e => [e.m, Math.round(e.amount)])));
  check('C: two fees over the hold (origination, then refinance fee) so fees exceed the first loan\'s fee', C.fees > C.fee * 1.5, Math.round(C.fees));
  check('C: the engine\'s refinance event is read (month 36); E (balloon, no refinance) is flagged as a maturity inside the hold', C.refi && C.refi.month === 36 && E.maturityInHold && E.events.some(e => e.m === 36 && /balloon/.test(e.kind)));
  check('E: the balloon at maturity carries no prepayment penalty (repaid at maturity)', E.pen === 0);

  /* 5. discount-rate convention */
  check('a higher discount rate raises the net PV of every alternative (the loans cost less than the money they replace)', D.sens[0].n.every((v, i) => v < D.sens[1].n[i] && D.sens[1].n[i] < D.sens[2].n[i]), JSON.stringify(D.sens.map(z => z.r)));
  check('default discount rate is disclosed as the credit policy target, 12%, until set', D.cfg.disc === 0.12);

  /* 6. the sheet: states, persistence, no page errors */
  const ui = await p.evaluate(async () => { showSheet('Financing Compare'); await new Promise(r => setTimeout(r, 500)); return document.querySelector('#viewport').innerText; });
  check('the sheet shows the comparison, the winners by separate measure, the discount sensitivity and the limits', /PV financing cost/.test(ui) && /All-in cost of the loan/.test(ui) && /Each measure on its own/.test(ui) && /Sensitivity to the discount rate/.test(ui) && /Tax effects/.test(ui) && /Reconciles to the engine/i.test(ui));
  check('the sheet flags the unrefinanced balloon', /matures in year 3, before the 5-year hold/.test(ui));
  await p.evaluate(() => { bkFCSet('A', 'acqRate', '7.5'); }); await p.waitForTimeout(400);
  const st = await p.evaluate(() => ({ ov: bkLoad()._finAlts[0].ov, dealRate: bkLoad().acqRate }));
  check('editing a term stores it on the alternative only (7.5% as 0.075), never on the deal', st.ov.acqRate === 0.075 && st.dealRate === 0.0675, JSON.stringify(st));
  const hr = await p.evaluate(() => { const x = bkFinCompareData().results[0]; return { allIn: x.allIn, pvCost: x.pvCost }; });
  check('the higher rate raises financing cost and all-in cost', hr.allIn > a.allIn + 0.005 && hr.pvCost > a.pvCost);
  await p.evaluate(() => { bkFCSet('A', 'acqRate', ''); bkFCCfg('disc', 8); }); await p.waitForTimeout(400);
  const c8 = await p.evaluate(() => ({ cfg: bkFinCompareData().cfg.disc, net: bkFinCompareData().results[0].netPV }));
  check('clearing a term returns to the deal\'s value; the discount rate can be set (8%)', c8.cfg === 0.08 && c8.net < a.net, M2(c8.net));
  await p.evaluate(() => { bkFCAdd(); }); await p.waitForTimeout(300);
  const n6 = await p.evaluate(() => bkLoad()._finAlts.length); check('an alternative can be added (copy of the last) and removed', n6 === 6);
  await p.evaluate(() => { bkFCDel('F'); }); await p.waitForTimeout(300);
  check('removing returns to five alternatives', await p.evaluate(() => bkLoad()._finAlts.length) === 5);
  /* development deals are not compared here */
  const dev = await p.evaluate(() => { bkCreateNewDeal({ name: 'Dev', dealId: 'DEV', dealType: 'Development' }); showSheet('Financing Compare'); return document.querySelector('#viewport').innerText; });
  check('a development deal is told this sheet is for acquisitions', /covers acquisition deals/.test(dev));
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
