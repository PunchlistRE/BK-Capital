// Development deals keep their own methodology: the acquisition conventions (growth start, variable
// opex, LTV basis, hurdle basis, bad-debt basis) must not change construction financing, the
// development cost basis, the permanent takeout or development returns. The same development deal is
// run on a reference build (the commit before the conventions) and on this build under the standard,
// the legacy and a deliberately different convention set; every figure must be identical.
//   git show <ref>:index.html > ref.html
//   node audit/dev_scope_test.js ref.html index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
const DEV = Object.assign({}, A, { dealId: 'TEST-DEV', name: 'Audit Test Development', dealType: 'Development',
  predevMonths: 6, constructionMonths: 18, leaseupMonths: 12, holdYears: 6, purchasePrice: 4000000, gpShare: 0.10,
  devBudgetMode: 'SOURCE', sourceConstruction: 12000000, conLTC: 0.65, conRate: 0.075, conUtil: 0.6, exitCap: 0.055, rentGrowth: 0.03 });
const STD = { cvRentGrowthStart: 'year2', cvOpexVariablePct: 0, cvLtvBasis: 'price', cvHurdleBasis: 'lp', cvBadDebtBasis: 'afterVacancy' };
const ODD = { cvRentGrowthStart: 'year2', cvOpexVariablePct: 1, cvLtvBasis: 'lesser', cvHurdleBasis: 'lp', cvBadDebtBasis: 'gross' };
const LEGACY = {};   // no fields at all: a deal saved before the conventions existed

async function metrics(file, ov) {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
  await p.goto('file://' + path.resolve(file)); await p.waitForTimeout(800);
  const r = await p.evaluate(opts => {
    bkCreateNewDeal(opts);
    const s = bkLoad();
    if (!opts.cvBadDebtBasis && !opts.cvRentGrowthStart) ['cvRentGrowthStart','cvOpexVariablePct','cvLtvBasis','cvHurdleBasis','cvBadDebtBasis'].forEach(k => delete s[k]);
    bkSave(s);
    const dv = bkDevV09(), f = bkDevFundingV10(), t = bkDevTakeoutV11(), m = bkDevMonthlyReturnsV12(), w = bkWaterfallV07(), c = bkCalc();
    const o = { isDev: dv.isDev, noi: c.noi, bad: c.bad, hard: dv.hard, soft: dv.soft, unlev: dv.unlev, commit: f.commit, capInt: f.actualCapInt,
      equityTotal: f.equityTotal, permLoan: t.permLoan, irr: m.irr, moic: m.moic, contrib: m.contrib, dist: m.dist,
      lpIRR: w.lpIRR, gpIRR: w.gpIRR, lpDist: w.lp.dist, gpDist: w.gp.dist };
    if (typeof bkConventions === 'function') o.scope = bkConventions(bkLoad()).scope;
    return o;
  }, Object.assign({}, DEV, ov));
  await b.close(); return { r, errs };
}

(async () => {
  const [ref, cur] = [process.argv[2], process.argv[3]];
  const base = await metrics(ref, LEGACY);
  let fails = 0, checks = 0;
  if (!base.r.isDev || !(base.r.commit > 0)) { console.log('FAIL fixture is not a funded development deal', base.r); process.exit(1); }
  for (const [name, ov] of [['legacy (no fields)', LEGACY], ['standard conventions', STD], ['different conventions', ODD]]) {
    const got = await metrics(cur, ov);
    fails += got.errs.length;
    if (got.r.scope !== 'development') { fails++; console.log('FAIL scope for', name, got.r.scope); }
    for (const k of Object.keys(base.r)) {
      if (k === 'scope') continue;
      checks++;
      const a = base.r[k], b = got.r[k];
      const same = (typeof a === 'number' && typeof b === 'number') ? (Object.is(a, b) || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a))) : a === b;
      if (!same) { fails++; console.log(`FAIL ${name}: ${k} reference ${a} vs now ${b}`); }
    }
  }
  console.log(`dev scope: ${checks} checks, ${fails} failures; reference IRR ${(base.r.irr * 100).toFixed(2)}%, construction commitment ${Math.round(base.r.commit).toLocaleString()}, perm loan ${Math.round(base.r.permLoan).toLocaleString()}`);
  process.exit(fails ? 1 : 0);
})();
