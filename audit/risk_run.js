// Dumps the Probability-Weighted Returns results for two deals with non-default inputs, for audit/risk_ref.py to check against the independent model.
//   node audit/risk_run.js index.html out.json
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs');
const A = require(path.join(__dirname, 'deal.js')), B = require(path.join(__dirname, 'dealB.js'));
const SETUPS = [[A, { p: { Downside: 0.30, Base: 0.50, Upside: 0.20 }, n: 120, seed: 777, corr: -0.4, sd: { exitCap: 0.006, vacancy: 0.02 } }], [B, { p: { Downside: 0.20, Base: 0.60, Upside: 0.20 }, n: 80, seed: 20260101, corr: 0.2, sd: {} }]];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const out = [], errs = [];
  for (const [deal, risk] of SETUPS) {
    const p = await b.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
    await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(600);
    const r = await p.evaluate(([d, rk]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d);
      Object.keys(rk).forEach(k => { if (k === 'p') Object.keys(rk.p).forEach(n => bkRiskSet('p.' + n, rk.p[k === 'p' ? n : n])); else if (k === 'sd') Object.keys(rk.sd).forEach(n => bkRiskSet('sd.' + n, rk.sd[n])); else bkRiskSet(k, rk[k]); });
      const s = bkLoad(), clean = Object.fromEntries(Object.entries(s).filter(([k]) => k.charAt(0) !== '_' && k !== 'seededAt'));
      const sc = bkRiskScenarios(), mc = bkRiskRunSync(), dr = bkRiskDraws(rk.n), pol = bkPolicy();
      return { s: clean, risk: bkRiskInputs(), policy: { targetIRR: pol.targetIRR, minDSCR: pol.minDSCR },
        scenarios: { cases: sc.cases.map(c => ({ name: c.name, p: c.p, ov: c.ov, irr: c.irr, moic: c.moic, profit: c.profit, dscr: c.dscr })), expProfit: sc.expProfit, expMoic: sc.expMoic, avgIRR: sc.avgIRR, irrOfExpectedCF: sc.irrOfExpectedCF, pLoss: sc.pLoss, pMiss: sc.pMiss, pDscr: sc.pDscr, hurdle: sc.hurdle, minDSCR: sc.minDSCR },
        draws: dr.map(x => ({ shifts: x.shifts, ov: x.ov })), runs: mc.runs.map(x => ({ irr: x.irr, moic: x.moic, profit: x.profit, dscr: x.dscr })),
        summary: { n: mc.summary.n, pLoss: mc.summary.pLoss, pMiss: mc.summary.pMiss, pDscr: mc.summary.pDscr, irr: Object.fromEntries(['mean', 'sd', 'p5', 'p10', 'p25', 'p50', 'p75', 'p90', 'p95', 'min', 'max'].map(k => [k, mc.summary.irr[k]])),
          moic: Object.fromEntries(['mean', 'p10', 'p50', 'p90'].map(k => [k, mc.summary.moic[k]])), profit: Object.fromEntries(['mean', 'p10', 'p50', 'p90'].map(k => [k, mc.summary.profit[k]])) } }; }, [deal, risk]);
    out.push(r); await p.close();
  }
  fs.writeFileSync(process.argv[3], JSON.stringify({ deals: out, pageErrors: errs })); await b.close(); console.log(out.length + ' deals, ' + errs.length + ' page errors');
})();
