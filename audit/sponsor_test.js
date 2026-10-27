// Sponsor CF: the two sponsor all-in returns the page shows (the summary and the fee-income section) are the same
// calculation, dated the same way, and the fee toggles move only what they should.
//   node audit/sponsor_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), B = require(path.join(__dirname, 'dealB.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + d + ']' : '')); };
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok'));
  for (const [tag, deal] of [['5-year deal', A], ['upside deal', B]]) {
    const r = await p.evaluate(d => { bkCreateNewDeal(d); const v = bkSponsorV08(), e = bkSponsorEconomics();
      const s = bkLoad(); s.sponsorFeeIncome = 'Excluded'; bkSave(s); const x = bkSponsorEconomics(); s.sponsorFeeIncome = 'Included'; bkSave(s);
      return { v: v.sponsorIRR, e: e.sponsorXIRR, vm: v.sponsorMOIC, em: e.sponsorMOIC, fees: e.totalFeeIncome, vf: v.totalFees, xIRR: x.sponsorXIRR, xm: x.sponsorMOIC, gpIRR: v.gpIRR }; }, deal);
    check(tag + ': both sponsor all-in XIRRs are the same number (to 0.01%)', Math.abs(r.v - r.e) < 0.0001, (r.v * 100).toFixed(2) + '% vs ' + (r.e * 100).toFixed(2) + '%');
    check(tag + ': both sponsor equity multiples agree', Math.abs(r.vm - r.em) < 1e-9);
    check(tag + ': fee income equals the summary\'s fees', Math.abs(r.fees - r.vf) < 1);
    check(tag + ': excluding fee income lowers the sponsor XIRR and multiple, and lands on the GP\'s own return', r.xIRR < r.e && r.xm < r.em && Math.abs(r.xIRR - r.gpIRR) < 0.0001, (r.xIRR * 100).toFixed(2) + '% vs GP ' + (r.gpIRR * 100).toFixed(2) + '%');
  }
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); console.log(checks + ' checks, ' + fails + ' failures'); process.exit(fails ? 1 : 0);
})();
