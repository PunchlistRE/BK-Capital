// Runs every underwriting-convention setting on the sample deals inside the real app and writes the
// engine results plus in-app waterfall reconciliation checks to JSON for conventions_test.py.
//   node audit/conventions_run.js index.html /tmp/cv.json
// Set PLAYWRIGHT_MODULE / CHROMIUM_PATH if playwright or the browser are not on the default paths.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path'), fs = require('fs');
const A = require(path.join(__dirname, 'deal.js')), B = require(path.join(__dirname, 'dealB.js'));

const LEGACY = { cvRentGrowthStart: 'month1', cvOpexVariablePct: 0.4, cvLtvBasis: 'value', cvHurdleBasis: 'deal', cvBadDebtBasis: 'legacy' };
const STD = { cvRentGrowthStart: 'year2', cvOpexVariablePct: 0, cvLtvBasis: 'price', cvHurdleBasis: 'lp', cvBadDebtBasis: 'afterVacancy' };
const LTV_BINDS = { acqDSCR: 1.0, acqLTC: 0.8 };   // loosen DSCR / LTC so the LTV constraint binds
const SCEN = [];
for (const [dn, deal, oldGp] of [['A', A, 0.5], ['B', B, B.gpShare]]) {
  const add = (name, ov) => SCEN.push({ deal: dn, name, opts: Object.assign({}, deal, ov) });
  add('legacy (before)', Object.assign({}, LEGACY, { gpShare: oldGp }));
  add('growth starts Year 2', Object.assign({}, LEGACY, { gpShare: oldGp, cvRentGrowthStart: 'year2' }));
  add('opex all fixed', Object.assign({}, LEGACY, { gpShare: oldGp, cvOpexVariablePct: 0 }));
  add('opex 25% variable', Object.assign({}, LEGACY, { gpShare: oldGp, cvOpexVariablePct: 0.25 }));
  add('LTV on price', Object.assign({}, LEGACY, { gpShare: oldGp, cvLtvBasis: 'price' }));
  add('hurdles on LP cash', Object.assign({}, LEGACY, { gpShare: oldGp, cvHurdleBasis: 'lp' }));
  add('bad debt: after vacancy', Object.assign({}, LEGACY, { gpShare: oldGp, cvBadDebtBasis: 'afterVacancy' }));
  add('bad debt: gross', Object.assign({}, LEGACY, { gpShare: oldGp, cvBadDebtBasis: 'gross' }));
  add('aligned: growth Y2 + bad debt after vacancy', Object.assign({}, LEGACY, { gpShare: oldGp, cvRentGrowthStart: 'year2', cvBadDebtBasis: 'afterVacancy' }));
  add('aligned: growth Y2 + bad debt gross', Object.assign({}, LEGACY, { gpShare: oldGp, cvRentGrowthStart: 'year2', cvBadDebtBasis: 'gross' }));
  // Year-1 statement NOI must equal the monthly cash flow's Year-1 NOI once growth timing and the
  // occupancy-variable opex share are aligned, for either bad-debt basis (flagged in `reconcile`).
  for (const bd of ['afterVacancy', 'gross']) {
    add('reconciled: ' + bd, Object.assign({}, STD, { gpShare: oldGp, cvBadDebtBasis: bd }));
    SCEN[SCEN.length - 1].reconcile = true;
  }
  add('GP 10%', Object.assign({}, LEGACY, { gpShare: 0.10 }));
  add('all standard (after)', Object.assign({}, STD, { gpShare: 0.10 }));
  add('all standard, GP 50%', Object.assign({}, STD, { gpShare: 0.5 }));
  add('LTV binds: value', Object.assign({}, STD, LTV_BINDS, { gpShare: 0.10, cvLtvBasis: 'value' }));
  add('LTV binds: price', Object.assign({}, STD, LTV_BINDS, { gpShare: 0.10, cvLtvBasis: 'price' }));
  add('LTV binds: lesser', Object.assign({}, STD, LTV_BINDS, { gpShare: 0.10, cvLtvBasis: 'lesser' }));
}

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(1000);
  const out = [];
  for (const sc of SCEN) {
    const r = await p.evaluate(opts => {
      bkCreateNewDeal(opts);
      const s = bkLoad(), u = bkAnnualCF(), d = bkDebt(), x = bkMonthlyReturns(), w = bkWaterfallV07();
      let maxMonthGap = 0, conSum = 0, lpgpCon = 0, distSum = 0, lpgpDist = 0, splitErr = 0;
      const tiers = { t1: 0, catchup: 0, t2: 0, t3: 0, t4: 0 }, gs = Number(s.gpShare);
      w.rows.forEach(q => {
        Object.keys(tiers).forEach(k => tiers[k] += q[k]);
        // each month: LP receives exactly its contractual share of each tier, GP the rest plus the catch-up
        const lpWant = q.t1 * (1 - gs) + q.t2 * s.t2LP + q.t3 * s.t3LP + q.t4 * s.t4LP;
        splitErr = Math.max(splitErr, Math.abs(q.lpDist - lpWant), Math.abs(q.gpDist - (q.t1 + q.catchup + q.t2 + q.t3 + q.t4 - lpWant)));
        maxMonthGap = Math.max(maxMonthGap, Math.abs(q.lpDist + q.gpDist - q.dist));
        conSum += q.con; lpgpCon += -(q.lpCon + q.gpCon); distSum += q.dist; lpgpDist += q.lpDist + q.gpDist;
      });
      const posCF = x.rows.reduce((z, q) => z + Math.max(0, q.wfDist != null ? q.wfDist : q.cf), 0);
      return {
        s, conv: bkConventions(s), stmtNOI: bkCalc().after,
        y1NOI: u.arr[0].after, loan: d.loan, equity: d.equity, ltvValue: d.ltvValue, binding: d.binding, grossSale: u.grossSale,
        levIRR: x.irr, levMOIC: x.moic, unlevIRR: u.irr, unlevMOIC: u.moic,
        lpIRR: w.lpIRR, gpIRR: w.gpIRR, lpDist: w.lp.dist, gpDist: w.gp.dist, lpContrib: w.lp.contrib, gpContrib: w.gp.contrib, promote: w.promote,
        recon: { maxMonthGap, conSum, lpgpCon, distSum, lpgpDist, posCF, equity: d.equity, splitErr, tiers }
      };
    }, sc.opts);
    out.push(Object.assign({ deal: sc.deal, name: sc.name, reconcile: !!sc.reconcile }, r));
  }
  fs.writeFileSync(process.argv[3], JSON.stringify({ scenarios: out, pageErrors: errs }));
  await b.close();
  console.log(out.length + ' scenarios, ' + errs.length + ' page errors');
})();
