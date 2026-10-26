// Engine support behind the Property Editor: year-by-year growth curves, miscellaneous income lines and dated capital items.
//   node audit/editor_engine_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) { fails++; console.log('FAIL ' + n + (d ? '  ' + d : '')); } };
  await p.evaluate(a => { document.documentElement.classList.add('bk-auth-ok'); window.__A = a; }, A);
  const run = (conv, patch) => p.evaluate(([c, pt]) => { bkCreateNewDeal(Object.assign({}, window.__A, c === 'legacy' ? BK_CV_LEGACY : {}, pt)); const a = bkAnnualCF(), m = bkMonthlyReturns(); return { noi: a.monthly.map(x => x.noi), egi: a.monthly.map(x => x.egi), res: a.monthly.map(x => x.resRev), taxes: a.monthly.map(x => x.taxes), irr: a.irr, lirr: m.irr, cf: m.rows.map(r => r.cf), uv: a.cfs, calc: bkCalc(), capex: a.capex, rows: m.rows.length }; }, [conv, patch || {}]);
  const maxd = (x, y) => x.reduce((t, v, i) => Math.max(t, Math.abs(v - y[i])), 0);
  for (const conv of ['legacy', 'standard']) {
    const base = await run(conv, {});
    const flat = await run(conv, { growthCurves: { rent: [0.03, 0.03, 0.03], other: [0.02], opex: [0.03], tax: [0.02, 0.02] } });
    check(conv + ': a curve that repeats the single rates changes nothing', maxd(base.noi, flat.noi) < 1e-6 && maxd(base.cf, flat.cf) < 1e-4, String(maxd(base.noi, flat.noi)));
    const y1 = await run(conv, { rentGrowthY1: 0.035 }), cur = await run(conv, { growthCurves: { rent: [0.035] } });
    if (conv === 'legacy') check('legacy: a year-1 entry in the rent curve equals the year-1 trend setting', maxd(y1.noi, cur.noi) < 1e-6 && Math.abs(y1.irr - cur.irr) < 1e-9, String(maxd(y1.noi, cur.noi)));
    const c2 = await run(conv, { growthCurves: { rent: [null, 0.06] } });
    const f = i => base.res[i] > 0 ? c2.res[i] / base.res[i] : 1;
    if (conv === 'standard') check('standard: a year-2 rent growth of 6% against 3% lifts year-2 rent by 2.9% and carries it forward', Math.abs(f(12) - 1.06 / 1.03) < 1e-9 && Math.abs(f(30) - 1.06 / 1.03) < 1e-9 && Math.abs(f(5) - 1) < 1e-12, [f(5), f(12), f(30)].join(' '));
    else check('legacy: a year-2 rent growth of 6% moves months of year 2 only gradually and year 3 by the full step', Math.abs(f(5) - 1) < 1e-12 && f(18) > 1 && f(18) < 1.06 / 1.03 && Math.abs(f(30) - 1.06 / 1.03) < 1e-9, [f(5), f(18), f(30)].join(' '));
    const t2 = await run(conv, { growthCurves: { tax: [null, 0.1] } });
    check(conv + ': a year-2 tax step of 10% (against 2%) moves taxes from year 2 on, steps once a year', Math.abs(t2.taxes[11] / base.taxes[11] - 1) < 1e-12 && Math.abs(t2.taxes[12] / base.taxes[12] - 1.1 / 1.02) < 1e-9, [t2.taxes[12] / base.taxes[12]].join());
    const mi = await run(conv, { miscIncome: [{ name: 'Roof Antenna', amount: 15000, freq: 'Annually' }, { name: 'Storage', amount: 500, freq: 'Monthly' }] });
    check(conv + ': miscellaneous income lines add $21,000 to other income and flow through the management fee', Math.abs(mi.calc.other - base.calc.other - 21000) < 1e-6 && Math.abs(mi.calc.egi - base.calc.egi - 21000) < 1e-6 && Math.abs((mi.calc.noi - base.calc.noi) - 21000 * (1 - A.mgmtPct)) < 1e-6, [mi.calc.other - base.calc.other, mi.calc.noi - base.calc.noi].join(' '));
    const cx = await run(conv, { closing: '1/1/2024', capex: [{ name: 'Roof repair', month: '2026-07', amount: 55000 }, { name: 'Outside the hold', month: '2040-01', amount: 99999 }, { name: 'Before closing', month: '2023-06', amount: 7777 }] });
    const cb = await run(conv, { closing: '1/1/2024' });
    const k = 31 - 1;
    check(conv + ': a $55,000 repair in July 2026 lowers exactly that month\'s cash flow, nothing else, and never touches NOI', Math.abs(cb.cf[k] - cx.cf[k] - 55000) < 1e-6 && cx.cf.every((v, i) => i === k || Math.abs(v - cb.cf[i]) < 1e-6) && maxd(cx.noi, cb.noi) === 0 && Math.abs(cx.calc.noi - cb.calc.noi) < 1e-9 && cx.capex[k] === 55000, [cb.cf[k] - cx.cf[k]].join());
    check(conv + ': capital items outside the hold are ignored', cx.capex.reduce((t, v) => t + v, 0) === 55000);
    check(conv + ': the capital item lowers both the levered and the unlevered return', cx.lirr < cb.lirr && cx.irr < cb.irr, [cx.lirr, cb.lirr].join());
    /* the levered IRR reproduces from the monthly cash flows with a separate, plain XIRR */
    const xirr = await p.evaluate(() => { const m = bkMonthlyReturns(), v = [-Number(bkDebt().equity) - Number(bkLoad().rateCapCost || 0), ...m.rows.map(r => r.cf + (r.m === 1 ? Number(bkDebt().equity) + Number(bkLoad().rateCapCost || 0) : 0))], d = [m.dates ? m.dates[0] : null]; const dates = m.xirrDates || null, vals = m.xirrValues || null; if(!dates || !vals) return null; const t0 = new Date(dates[0]).getTime(); const f = r => vals.reduce((s, c, i) => s + c / Math.pow(1 + r, (new Date(dates[i]).getTime() - t0) / 86400000 / 365), 0); let lo = -0.9, hi = 5; for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid; } return { mine: (lo + hi) / 2, engine: m.irr }; });
    if (xirr) check(conv + ': the engine\'s levered IRR (with the capital item) matches a separate XIRR of its own cash flows', Math.abs(xirr.mine - xirr.engine) < 1e-6, JSON.stringify(xirr));
  }
  /* upside and downside cases move explicitly entered rent years too */
  const sc = await p.evaluate(() => { bkCreateNewDeal(Object.assign({}, window.__A, { growthCurves: { rent: [0.03, 0.03, 0.03] }, upRentGrowthDelta: 0.01, downRentGrowthDelta: -0.01 })); const g = c => bkRunWith({ scenarioCase: c }, () => 0); const up = bkRunWith(bkScenarioOverrides ? bkScenarioOverrides(bkLoad(), 'Upside') : {}, () => bkAnnualCF().monthly[30].resRev), base = bkAnnualCF().monthly[30].resRev; return { up, base, has: typeof bkScenarioOverrides }; });
  if (sc.has === 'function') check('an upside case lifts rent in years entered explicitly in the curve', sc.up > sc.base, JSON.stringify(sc));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); console.log(checks + ' checks, ' + fails + ' failures'); process.exit(fails ? 1 : 0);
})();
