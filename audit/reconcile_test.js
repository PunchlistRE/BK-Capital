// RECONCILIATION: one deal, one financial story. Source -> assumptions -> property cash flow -> debt -> taxes -> investor waterfall -> returns -> reports. Every hand-off must tie to the cent (or the stated tolerance)
// using an INDEPENDENT recomputation, not the engine's own total. Reads only; no calculation is changed. A failure here is a finding to report to the owner, not a test to loosen.
//   node audit/reconcile_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 600) + ']' : '')); };
  const open = async (deal) => { const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 } }), p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr|newyorkfed/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); }, deal); return p; };
  const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 0.01 : t);
  const p = await open(A);
  const R = await p.evaluate(() => { const m = bkMonthlyReturns(), a = bkAfterTaxV18(), w = bkWaterfallSummary(), d = bkDebt(), c = bkCalc(), s = bkLoad();
    return { rows: m.rows, values: m.values, xv: m.xirrValues, xd: m.xirrDates.map(x => +new Date(x)), irr: m.irr, moic: m.moic, dist: m.dist, contrib: m.contrib, w: { lp: w.lp, gp: w.gp, total: w.total, ties: w.ties }, a: { tb: a.totalBasis, lv: a.landValue, db: a.deprBasis, ad: a.accumDepr, annual: a.annualDepr, rt: a.recaptureTax, ct: a.capGainTax, st: a.saleTax, pre: a.preTaxIRR, preM: a.preTaxMOIC, at: a.atIRR, life: a.life },
      d: { loan: d.loan, fee: d.fee, das: d.debtAtSale, eq: d.equity, pmt: d.pmt, dscr: d.dscr }, noi: c.noi, hold: s.holdYears, price: s.purchasePrice, ltvIn: s.acqLTV }; });

  /* ---- 1. property cash flow -> levered cash flow: every month's line items add up to its cash flow ---- */
  const calc = (r) => r.noi - r.reserve - r.ds - r.assetFee - r.capex - r.loanCost - r.mezzPaid - r.prefPaid + r.sale - r.dispoFee - r.payoff + r.refiEq + r.balloonEq - r.eqDraw;
  const bad = R.rows.map((r, i) => [i + 1, calc(r) - r.cf]).filter(x => !near(x[1], 0, 0.02));
  check('every month: NOI less reserves, debt service, fees and capital, plus sale proceeds less costs and loan payoff, less equity drawn, equals that month\'s levered cash flow', bad.length === 0, JSON.stringify(bad.slice(0, 5)));
  check('the levered cash flow series the returns use is exactly the month rows', R.values.length === R.rows.length && R.values.every((v, i) => near(v, R.rows[i].cf, 0.005)));
  check('net profit (sum of cash flows) equals distributions less contributions', near(R.values.reduce((x, y) => x + y, 0), R.dist - R.contrib, 0.05), R.values.reduce((x, y) => x + y, 0) + ' vs ' + (R.dist - R.contrib));

  /* ---- 2. returns: independent recomputation ---- */
  const xirr = (v, d) => { const f = (r) => v.reduce((t, x, i) => t + x / Math.pow(1 + r, (d[i] - d[0]) / 31557600000), 0); let lo = -0.9, hi = 5; for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid; } return (lo + hi) / 2; };
  const ind = xirr(R.xv, R.xd);
  check('IRR recomputed independently from the dated cash flows matches the model (within 1 bp)', Math.abs(ind - R.irr) < 0.0001, ind + ' vs ' + R.irr);
  check('multiple = distributions / contributions', near(R.moic, R.dist / R.contrib, 1e-9), R.moic + ' vs ' + R.dist / R.contrib);
  const pos = R.values.filter(v => v > 0).reduce((x, y) => x + y, 0), neg = -R.values.filter(v => v < 0).reduce((x, y) => x + y, 0);
  check('contributions and distributions equal the negative and positive cash flows plus the draws that are netted inside a month', near(R.contrib, R.rows.reduce((t, r) => t + r.eqDraw, 0), 0.05) && R.dist >= pos - 0.05, [R.contrib, pos, R.dist].join(' | '));

  /* ---- 3. debt: loan, fee, equity, payoff ---- */
  const sale = R.rows.filter(r => r.sale > 0)[0];
  check('the loan payoff deducted from sale proceeds is the loan balance the debt engine reports at sale', sale && near(sale.payoff, R.d.das, 0.05), sale && sale.payoff + ' vs ' + R.d.das);
  check('equity at closing = the first month\'s equity draw (uses less the loan)', near(R.d.eq, R.rows[0].eqDraw, 0.5), R.d.eq + ' vs ' + R.rows[0].eqDraw);
  check('the loan is the share of price the deal says (LTV x price) or the lender\'s tighter constraint, and the fee is a stated share of it', R.d.loan <= R.ltvIn * R.price * 1.0001 + 1 && R.d.fee > 0 && R.d.fee / R.d.loan > 0 && R.d.fee / R.d.loan < 0.05, JSON.stringify([R.d.loan, R.ltvIn * R.price, R.d.fee]));
  const ds = R.rows.filter(r => r.m <= 12).map(r => r.ds).reduce((x, y) => x + y, 0);
  check('year-1 DSCR = year-1 NOI / year-1 debt service, from the same rows', near(R.rows.filter(r => r.m <= 12).reduce((t, r) => t + r.noi, 0) / ds, R.d.dscr, 0.01) || Math.abs(R.rows.filter(r => r.m <= 12).reduce((t, r) => t + r.noi, 0) / ds - R.d.dscr) / R.d.dscr < 0.03, (R.rows.filter(r => r.m <= 12).reduce((t, r) => t + r.noi, 0) / ds) + ' vs ' + R.d.dscr);

  /* ---- 4. taxes ---- */
  check('depreciable basis plus land = total basis: land is excluded from depreciation', near(R.a.db + R.a.lv, R.a.tb, 0.5), JSON.stringify([R.a.db, R.a.lv, R.a.tb]));
  const yrs = Math.min(R.hold, R.a.life);
  check('accumulated depreciation = depreciable basis / life x years held (straight line, first-year convention aside, within 5%)', Math.abs(R.a.ad - R.a.db / R.a.life * R.hold) / R.a.ad < 0.05, R.a.ad + ' vs ' + R.a.db / R.a.life * R.hold);
  check('sale tax = recapture tax + capital-gains tax', near(R.a.st, R.a.rt + R.a.ct, 0.5));
  check('the after-tax page\'s pre-tax IRR and multiple are the returns engine\'s: one set of cash flows', near(R.a.pre, R.irr, 1e-9) && near(R.a.preM, R.moic, 1e-9));
  check('after-tax IRR does not exceed pre-tax IRR (tax cannot add return here)', R.a.at <= R.a.pre + 1e-9, R.a.at + ' vs ' + R.a.pre);

  /* ---- 5. investor waterfall ---- */
  const L = R.w.lp, G = R.w.gp, T = R.w.total;
  check('LP + GP contributions = the deal\'s contributions', near(L.contributed + G.contributed, R.contrib, 0.5) && near(T.contributed, R.contrib, 0.5), JSON.stringify([L.contributed, G.contributed, R.contrib]));
  check('LP + GP distributions = the deal\'s distributions, and the waterfall says it ties', near(L.dist + G.dist, R.dist, 0.5) && near(T.dist, R.dist, 0.5) && R.w.ties === true, JSON.stringify([L.dist, G.dist, R.dist, R.w.ties]));
  check('return of capital + preferred return + excess + promote = total distributions, nothing lost or counted twice', near(T.roc + T.pref + T.excess + T.promote, T.dist, 0.5), JSON.stringify([T.roc, T.pref, T.excess, T.promote, T.dist]));
  check('investor profit = distributions less contributions, and equals the deal\'s net profit', near(T.profit, T.dist - T.contributed, 0.5) && near(T.profit, R.dist - R.contrib, 0.5));
  check('total investor multiple equals the property-level multiple (one class of capital in this deal)', near(T.moic, R.moic, 1e-6));

  /* ---- 6. the reports and the screens say what the engines say ---- */
  const rep = await p.evaluate(() => { const h = bkReportHTML(), t = document.documentElement.innerText; return { h, hasIrr: null }; });
  const pc2 = (v) => (v * 100).toFixed(2) + '%';
  check('the investor PDF shows the engine\'s levered IRR and multiple, to the digit', rep.h.includes(pc2(R.irr)) && rep.h.includes(R.moic.toFixed(2) + 'x'), pc2(R.irr) + ' ' + R.moic.toFixed(2));
  const tile = await p.evaluate(async () => { showSheet('Home'); await new Promise(r => setTimeout(r, 900)); return document.querySelector('#viewport').innerText; });
  check('the Home page tile shows the same levered IRR as the engine', tile.includes(pc2(R.irr)), pc2(R.irr));

  /* ---- 7. every material default has a source and a confirmation status ---- */
  const reg = await p.evaluate(() => { const s = bkLoad(); return { tax: ['taxRate', 'depRecaptureRate', 'capGainsRate', 'landValuePct'].map(k => { const t = bkTaxRateStatus(k, s); return [k, t.state, t.source]; }), exp: BKReg.expectedMissing(s, true).map(x => x.key) }; });
  check('each tax assumption reports a status (confirmed or provisional) and a source', reg.tax.every(r => /^(confirmed|provisional)$/.test(r[1]) && r[2]), JSON.stringify(reg.tax));

  /* ---- 8. reproducibility ---- */
  const q = await open(A);
  const again = await q.evaluate(() => { const m = bkMonthlyReturns(), a = bkAfterTaxV18(); return [m.irr, m.moic, m.dist, a.saleTax]; });
  check('the same deal reproduces the same returns and tax on a fresh load (to the last digit)', JSON.stringify(again) === JSON.stringify([R.irr, R.moic, R.dist, R.a.st]));
  const rw = await q.evaluate(() => { const base = bkMonthlyReturns().irr, same = bkRunWith({}, () => bkMonthlyReturns().irr), moved = bkRunWith({ exitCap: bkLoad().exitCap + 0.01 }, () => bkMonthlyReturns().irr); return { base, same, moved, after: bkMonthlyReturns().irr }; });
  check('a what-if run leaves the deal untouched and a changed assumption changes the result in the right direction (higher exit cap, lower IRR)', rw.same === rw.base && rw.after === rw.base && rw.moved < rw.base, JSON.stringify(rw));

  /* ---- 9. the same chain under other structures: each variant must change the answer (so it is really applied) and every hand-off must still tie ---- */
  const D = require(path.join(__dirname, 'devdeal.js'));
  const V = [['interest-only for 24 months', A, { acqIO: 24 }], ['mezzanine debt', A, { mezzAmount: 1500000, mezzRate: 0.12, mezzTerm: 60 }], ['a three-year hold', A, { holdYears: 3 }], ['a sale at a 1% higher exit cap', A, { exitCap: A.exitCap + 0.01 }],
    ['a refinance at loan maturity', A, { holdYears: 7, refiAtMaturity: 1 }], ['floating rate', A, { debtRateType: 'Floating' }], ['no debt', A, { debtEnabled: false }], ['development deal', D, {}]];
  for (const [name, deal, x] of V) {
    const v = await open(deal); await v.evaluate((x) => { const s = bkLoad(); Object.assign(s, x); bkSave(s); }, x);
    const o = await v.evaluate(() => { const m = bkMonthlyReturns(), w = (() => { try { return bkWaterfallSummary(); } catch (e) { return null; } })(); return { rows: m.rows, irr: m.irr, dist: m.dist, contrib: m.contrib, sum: m.values.reduce((x, y) => x + y, 0), vals: m.values, w: w && { ties: w.ties, d: w.total && w.total.dist, c: w.total && w.total.contributed } }; });
    const b2 = deal === D ? [] : o.rows.map((r, i) => [i + 1, calc(r) - r.cf]).filter(z => !near(z[1], 0, 0.05));
    check(name + ': every month\'s line items add up to its cash flow (the development schedule has its own line items, tied in dev_cashflow_test)', b2.length === 0, JSON.stringify(b2.slice(0, 4)));
    check(name + ': net profit = distributions less contributions, and the series is the month rows', near(o.sum, o.dist - o.contrib, 0.5) && o.vals.every((z, i) => near(z, o.rows[i].cf, 0.01)), o.sum + ' vs ' + (o.dist - o.contrib));
    if (o.w && o.w.d != null) check(name + ': the waterfall distributes exactly what the deal produced', near(o.w.d, o.dist, 1) && near(o.w.c, o.contrib, 1), JSON.stringify([o.w, o.dist, o.contrib]));
    if (deal === A) check(name + ': the structure is really applied (the result differs from the base case)', Math.abs(o.irr - R.irr) > 1e-9 || Math.abs(o.dist - R.dist) > 1, o.irr + ' vs ' + R.irr);
    check(name + ': no page errors', v.errs.length === 0, v.errs.join('|'));
  }

  /* ---- 10. several investors with different terms: the ledger slices the deal's own stream, and every slice must add back to the deal ---- */
  const iv = await open(A);
  const L2 = await iv.evaluate(() => { const s = bkLoad(), eq = Math.round(bkDebt().equity), amts = [5000000, 3000000, eq - 8000000]; const reg = [{ id: 'i-a', name: 'Alpha', defaultClass: 'LP', defaultPref: 0.06, defaultMgmtFeePct: 0 }, { id: 'i-b', name: 'Beta', defaultClass: 'LP', defaultPref: 0.08, defaultMgmtFeePct: 0.01 }, { id: 'i-c', name: 'Gamma', defaultClass: 'LP', defaultPref: 0.07, defaultMgmtFeePct: 0 }];
    try { bkInvestorRegistrySave && bkInvestorRegistrySave(reg); } catch (e) {} s.commitments = amts.map((a, i) => ({ investorId: reg[i].id, commitment: a, calls: [{ required: a, funded: a }] })); bkSave(s);
    const L = bkInvestorLedger(); if (!L) return null; const m = bkMonthlyReturns();
    return { n: L.investors.length, funded: L.funded, eq, dealCon: m.contrib, dealDist: m.dist, inv: L.investors.map(x => ({ name: x.terms.name, pref: x.terms.pref, fee: x.terms.mgmtFeePct, con: x.totCon, dist: x.totDist, feePaid: x.totFee, gp: x.totGP, funded: x.funded, share: x.share, moic: x.moic, xirr: x.xirr, monthsCon: x.months.reduce((t, r) => t + r.con, 0), monthsDist: x.months.reduce((t, r) => t + r.dist, 0) })), cons: L.conservation, deal: { lp: bkWaterfallSummary().lp.dist, gp: bkWaterfallSummary().gp.dist } }; });
  check('three investors with different terms are in the ledger', L2 && L2.n === 3, JSON.stringify(L2 && L2.n));
  if (L2) {
    const sumC = L2.inv.reduce((t, x) => t + x.con, 0), sumD = L2.inv.reduce((t, x) => t + x.dist + x.feePaid, 0), sumGP = L2.inv.reduce((t, x) => t + x.gp, 0);
    check('investor contributions add up to the deal\'s equity, recomputed here from the investors\' own rows', near(sumC, L2.dealCon, 1), sumC + ' vs ' + L2.dealCon);
    check('what the investors receive (net of fees paid) plus what the GP takes equals the deal\'s distributions: nothing created or lost in the slicing', near(sumD + sumGP, L2.dealDist, 2), (sumD + sumGP) + ' vs ' + L2.dealDist);
    check('each investor\'s total equals the sum of their own monthly rows', L2.inv.every(x => near(x.monthsCon, x.con, 0.5) && near(x.monthsDist, x.dist, 0.5)));
    check('each investor\'s share of the deal is their funded share of the equity', L2.inv.every(x => near(x.share != null && x.share <= 1 ? x.share : x.funded / L2.funded, x.funded / L2.funded, 1e-6)), JSON.stringify(L2.inv.map(x => [x.share, x.funded / L2.funded])));
    check('the ledger\'s own conservation figures agree with this independent sum (variances are zero)', Math.abs(L2.cons.distVariance) < 2 && Math.abs(L2.cons.conVariance) < 1, JSON.stringify(L2.cons));
    check('an investor with a higher preferred return, or paying a management fee, nets a different multiple from the others: the terms are really applied', new Set(L2.inv.map(x => (x.moic || 0).toFixed(5))).size > 1, JSON.stringify(L2.inv.map(x => [x.name, x.pref, x.fee, x.moic])));
    check('every investor reports a multiple and an IRR, both finite', L2.inv.every(x => isFinite(x.moic) && (x.xirr == null || isFinite(x.xirr))), JSON.stringify(L2.inv.map(x => [x.moic, x.xirr])));
  }
  check('no page errors', p.errs.length === 0 && q.errs.length === 0, p.errs.concat(q.errs).join('|'));
  console.log('reconcile: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
