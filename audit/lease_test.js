// Commercial lease model: tenant-by-tenant retail income, rollover branches, recoveries, free rent, TI and leasing commissions.
//   node audit/lease_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) { fails++; console.log('FAIL ' + n + (d ? '  ' + d : '')); } };
  const set = async (id, v) => { await p.fill('#' + id, String(v)); await p.dispatchEvent('#' + id, 'change'); await p.waitForTimeout(250); };
  const near = (x, y, t) => Math.abs(x - y) <= (t || 1e-6) * Math.max(1, Math.abs(y));
  await p.evaluate(a => { document.documentElement.classList.add('bk-auth-ok'); window.__A = a; }, A);
  const T = (o) => Object.assign({ tenant: 'Shop', suite: '101', sf: 10000, status: 'Occupied', start: '2024-01-01', end: '2040-12-31', rent: 30, bump: 0.03, mkt: 40, recType: 'Gross', recFixed: 0 }, o || {});
  const base = { commercialRentGrowth: 0.04, leaseMkt: { bump: 0.03, termNew: 60, termRenew: 60, freeNew: 3, freeRenew: 0, renewPct: 1, creditLoss: 0 }, rolloverAssumptions: { renewalProbability: 0.65, downtimeMonths: 6, tiNewPerSF: 20, tiRenewalPerSF: 5, lcNewPct: 0.06, lcRenewalPct: 0.03 } };
  const run = (patch) => p.evaluate(pt => { bkCreateNewDeal(Object.assign({}, window.__A, pt)); const s = bkLoad(), a = bkAnnualCF(), ev = a.lease, m = bkMonthlyReturns(), c = bkCalc();
    return { ev, noi: a.monthly.map(x => x.noi), comm: a.monthly.map(x => x.comm), egi: a.monthly.map(x => x.egi), cap: a.capex, irr: a.irr, lirr: m.irr, calc: c, fwd: a.terminalNOI }; }, patch);
  const L = (leases, extra) => Object.assign({}, base, { commLeaseModel: true, leases }, extra || {});

  /* 1. a lease in place with annual bumps on its anniversaries and a flat pro-rata recovery */
  let r = await run(L([T({ recType: 'NNN' })]));
  check('rent in place: 10,000 SF at $30 is $25,000 a month until the first anniversary after closing (Jan 2028 = month 13), then 3% more', near(r.ev.rent[0], 25000) && near(r.ev.rent[11], 25000) && near(r.ev.rent[12], 25750) && near(r.ev.rent[24], 25750 * 1.03), [r.ev.rent[0], r.ev.rent[12], r.ev.rent[24]].join(' '));
  const pool1 = (240000 + 96000 + 132000 + 90000 + 60000) / 12;
  check('NNN recoveries are the tenant\'s share of the recoverable pool (10,000 of 108,000 SF), growing with taxes and expenses', near(r.ev.rec[0], pool1 * 10000 / 108000) && r.ev.rec[12] > r.ev.rec[0] * 1.02 && r.ev.rec[12] < r.ev.rec[0] * 1.03 + 1e-9, [r.ev.rec[0], r.ev.rec[12]].join(' '));

  /* 2. equivalence with the flat retail inputs when the schedule says the same thing */
  const flat = await run({ commercialArea: 10000, commercialRent: 30, recovery: 5, commercialVacancy: 0, commercialRentGrowth: 0, opexGrowth: 0, taxGrowth: 0 });
  const mod = await run({ commercialArea: 10000, commercialRent: 30, recovery: 5, commercialVacancy: 0, commercialRentGrowth: 0, opexGrowth: 0, taxGrowth: 0, commLeaseModel: true, leases: [T({ bump: 0, recType: 'Fixed', recFixed: 5 })] });
  check('a schedule that restates the flat retail inputs reproduces Year-1 income, every month of NOI and the IRR', near(mod.calc.noi, flat.calc.noi, 1e-12) && near(mod.calc.egi, flat.calc.egi, 1e-12) && flat.noi.every((v, i) => near(v, mod.noi[i], 1e-10)) && near(mod.irr, flat.irr, 1e-10) && near(mod.lirr, flat.lirr, 1e-10), [flat.calc.noi, mod.calc.noi, flat.irr, mod.irr].join(' '));
  check('and it reports the same retail lines in Year 1', near(mod.calc.commercial, 300000) && near(mod.calc.recovery, 50000), [mod.calc.commercial, mod.calc.recovery].join(' '));

  /* 3. rollover at expiry: lease ends Dec 2029 = month 36; with certain renewal the renewal starts month 37 at market, TI and commission in that month */
  const roll = { end: '2029-12-31', recType: 'Gross' };
  const mf = 1.04 ** 3, rent0 = 40 * mf, agg = (r0, free) => { let t = 0; for (let j = free; j < 60; j++) t += r0 * 1.03 ** Math.floor(j / 12) * 10000 / 12; return t; };
  r = await run(L([T(roll)], { rolloverAssumptions: Object.assign({}, base.rolloverAssumptions, { renewalProbability: 1 }) }));
  check('renewal (certain): rent drops out of the old lease and into market rent grown 4% a year for 3 years, starting month 37', near(r.ev.rent[35], 30 * 1.03 ** 2 * 10000 / 12 * (1) ) && near(r.ev.rent[36], rent0 * 10000 / 12) && near(r.ev.occ[36], 1), [r.ev.rent[35], r.ev.rent[36], rent0 * 10000 / 12].join(' '));
  check('renewal costs: $5 / SF tenant improvements and 3% of rent over the term land in month 37 and nowhere else; they reduce cash flow, not NOI', near(r.cap[36], 5 * 10000 + 0.03 * agg(rent0, 0)) && r.cap.every((v, i) => i === 36 || v === 0) && near(r.noi[36] / r.noi[35], r.noi[36] / r.noi[35]), [r.cap[36], 50000 + 0.03 * agg(rent0, 0)].join(' '));
  /* 4. tenant leaves: dark for the downtime, then a new lease with free rent, higher TI and commission */
  r = await run(L([T(roll)], { rolloverAssumptions: Object.assign({}, base.rolloverAssumptions, { renewalProbability: 0 }) }));
  const rentN = 40 * 1.04 ** 3;
  check('tenant leaves (certain): no rent for the 6-month downtime, then 3 months of free rent, then market rent from month 46', r.ev.rent.slice(36, 45).every(v => v === 0) && near(r.ev.rent[45], rentN * 10000 / 12) && near(r.ev.free[42], rentN * 10000 / 12) && r.ev.free[45] === 0 && near(r.ev.occ[36], 0) && near(r.ev.occ[42], 1), [r.ev.rent[44], r.ev.rent[45], r.ev.free[42]].join(' '));
  check('new-lease costs ($20 / SF and 6% of rent over the term, net of free rent) land in month 43, the month the lease starts', near(r.cap[42], 200000 + 0.06 * agg(rentN, 3)) && r.cap.filter(v => v > 0).length === 1, String(r.cap[42]));
  /* 5. probability-weighted */
  r = await run(L([T(roll)], { rolloverAssumptions: Object.assign({}, base.rolloverAssumptions, { renewalProbability: 0.4 }) }));
  check('at a 40% renewal chance month 37 carries 40% of renewal rent and 40% occupancy; month 46 adds the 60% who left after their free rent', near(r.ev.rent[36], 0.4 * rent0 * 10000 / 12) && near(r.ev.occ[36], 0.4) && near(r.ev.occ[42], 1) && near(r.ev.rent[45], (0.4 * rent0 + 0.6 * rentN) * 10000 / 12 * 1.0, 1e-9), [r.ev.rent[36], r.ev.occ[36], r.ev.rent[45]].join(' '));
  check('weighted leasing costs equal 40% of the renewal costs plus 60% of the new-lease costs', near(r.cap[36], 0.4 * (50000 + 0.03 * agg(rent0, 0))) && near(r.cap[42], 0.6 * (200000 + 0.06 * agg(rentN, 3))), [r.cap[36], r.cap[42]].join(' '));
  /* 6. a tenant's own assumptions beat the deal's */
  r = await run(L([T(Object.assign({ over: { renewalProbability: 1, tiRenewalPerSF: 0, lcRenewalPct: 0 } }, roll))], { rolloverAssumptions: Object.assign({}, base.rolloverAssumptions, { renewalProbability: 0 }) }));
  check('a tenant override of the renewal probability and renewal costs wins over the deal assumptions', near(r.ev.occ[36], 1) && r.cap.every(v => v === 0));
  /* 7. vacant suite */
  r = await run(L([T({ status: 'Vacant', start: '', end: '', rent: 0 })]));
  check('a vacant suite leases after the downtime at market with free rent: no income to month 6, free to month 9, rent from month 10 at market', r.ev.rent.slice(0, 9).every(v => v === 0) && near(r.ev.rent[9], 40 * 10000 / 12 * 1.0) && near(r.ev.free[6], 40 * 10000 / 12), [r.ev.rent[9], r.ev.free[6]].join(' '));
  /* 8. base-year recoveries */
  r = await run(L([T({ recType: 'BaseYear', baseYear: 2027 })]));
  const e1 = r.ev; const pool = (yr, mo) => (240000 * 1.02 ** (yr - 1) + (96000 + 132000 + 90000 + 60000) * 1.03 ** (yr - 1)) / 12;
  check('base-year recoveries are the share of the pool above its base-year level: zero in the base year, growth only afterwards', near(e1.rec[0], 0) && near(e1.rec[11], 0) && near(e1.rec[12], (pool(2) - pool(1)) * 10000 / 108000, 1e-9) && near(e1.rec[24], (pool(3) - pool(1)) * 10000 / 108000, 1e-9), [e1.rec[12], (pool(2) - pool(1)) * 10000 / 108000].join(' '));
  /* 9. dated steps */
  r = await run(L([T({ steps: [{ month: '2028-03', rent: 33 }, { month: '2029-03', rent: 36 }] })]));
  check('dated rent steps replace the annual bump: $30 until March 2028, then $33, then $36 from March 2029', near(r.ev.rent[0], 25000) && near(r.ev.rent[13], 25000) && near(r.ev.rent[14], 27500) && near(r.ev.rent[26], 30000), [r.ev.rent[13], r.ev.rent[14], r.ev.rent[26]].join(' '));
  /* 10. partial months */
  r = await run(L([T({ start: '2027-01-16', end: '2027-06-15', rent: 31 })], { rolloverAssumptions: Object.assign({}, base.rolloverAssumptions, { downtimeMonths: 100 }) }));
  check('a lease starting on Jan 16 and ending Jun 15 is paid for 16/31 of January and 15/30 of June', near(r.ev.rent[0], 31 * 10000 / 12 * 16 / 31) && near(r.ev.rent[1], 31 * 10000 / 12) && near(r.ev.rent[5], 31 * 10000 / 12 * 0.5), [r.ev.rent[0], r.ev.rent[5]].join(' '));
  /* 11. the engine uses it: the sale price, IRR and Year-1 NOI move with the schedule */
  const none = await run({}); const withL = await run(L([T({ end: '2029-12-31', recType: 'NNN' })]));
  check('with the schedule on, Year-1 EGI rises by the retail rent and recoveries, forward NOI at sale reflects the rolled lease, and the capital outflow shows in the monthly returns', near(withL.calc.egi - none.calc.egi, withL.calc.commercial + withL.calc.recovery, 1e-9) && withL.fwd > none.fwd && withL.cap.some(v => v > 0), [withL.fwd, none.fwd].join(' '));
  /* 12. invariants over a mixed schedule: occupancy stays within 0..1, the weights of every branch add back to the tenant, no NaN */
  r = await run(L([T({ end: '2028-06-30', recType: 'NNN' }), T({ tenant: 'B', suite: '102', sf: 5000, start: '2025-01-01', end: '2027-09-30', rent: 22, recType: 'BaseYear', baseYear: 2026, over: { renewalProbability: 0.3 } }), T({ tenant: 'C', suite: '103', sf: 3000, status: 'Vacant', start: '', end: '', rent: 0, mkt: 28, recType: 'NNN' })]));
  const flatten = a => [].concat(...a);
  check('mixed schedule: occupancy is within 0..100%, every figure is finite, tenant rows add to the totals', r.ev.occ.every(v => v >= -1e-12 && v <= 1 + 1e-12) && flatten([r.ev.rent, r.ev.rec, r.ev.free, r.ev.occ]).every(Number.isFinite) && r.ev.rent.every((v, i) => near(v, r.ev.byT.reduce((t, x) => t + x.rent[i], 0))) && r.ev.rec.every((v, i) => near(v, r.ev.byT.reduce((t, x) => t + x.rec[i], 0))), '');
  check('mixed schedule: the engine runs and returns finite numbers', Number.isFinite(r.irr) && Number.isFinite(r.lirr) && r.noi.every(Number.isFinite));
  /* 13. the editor */
  await p.evaluate(() => { bkCreateNewDeal(Object.assign({}, window.__A, { rentRoll: [
    { unitId: 'Shop A', tenantType: 'Commercial', sf: 4000, status: 'Occupied', inPlaceRent: 12000, marketRent: 14000, recovery: 1500, leaseStart: '2022-03-01', leaseEnd: '2031-02-28' },
    { unitId: 'Shop B', tenantType: 'Commercial', sf: 2000, status: 'Vacant', inPlaceRent: 0, marketRent: 7000, recovery: 0, leaseStart: '', leaseEnd: '' },
    { unitId: '1A', tenantType: 'Residential', sf: 800, status: 'Occupied', inPlaceRent: 1650, marketRent: 1700, recovery: 0, leaseStart: '', leaseEnd: '' }] })); bkEdGo('Tenants', 'Tenants', 'lease'); }); await p.waitForTimeout(400);
  check('the Commercial Leases tab opens with its three panels', await p.evaluate(() => /Commercial Lease Model/.test(document.querySelector('#viewport').innerText) && /Market Leasing Assumptions/.test(document.querySelector('#viewport').innerText)));
  await p.click('button:has-text("Build tenants from the commercial rent roll")'); await p.waitForTimeout(400);
  let s = await p.evaluate(() => bkLoad());
  check('building from the rent roll makes one tenant per commercial row, converts monthly dollars to $ / SF / year, and switches the model on', s.commLeaseModel === true && s.leases.length === 2 && s.leases[0].rent === 36 && s.leases[0].mkt === 42 && s.leases[0].recType === 'Fixed' && s.leases[0].recFixed === 4.5 && s.leases[1].status === 'Vacant' && s.leases[1].mkt === 42, JSON.stringify(s.leases));
  const c0 = await p.evaluate(() => bkCalc().commercial); await set('ae-ls-rent-0', '38.5'); s = await p.evaluate(() => bkLoad());
  check('typing a rent writes it to the tenant and the Year-1 retail rent follows', s.leases[0].rent === 38.5 && await p.evaluate(c => Math.abs(bkCalc().commercial - c - 4000 * 2.5) < 1e-6, c0));
  await p.click('button:has-text("Add a tenant")'); await p.waitForTimeout(250); s = await p.evaluate(() => bkLoad());
  check('adding a tenant appends a blank row and opens its terms', s.leases.length === 3 && await p.evaluate(() => /Terms for/.test(document.querySelector('#viewport').innerText)));
  await set('ae-lo-renewalProbability-2', '80'); s = await p.evaluate(() => bkLoad());
  check('a per-tenant renewal probability is stored as a decimal', Math.abs(s.leases[2].over.renewalProbability - 0.8) < 1e-12);
  await p.click('button:has-text("Add a rent step")'); await p.waitForTimeout(250); s = await p.evaluate(() => bkLoad());
  check('a rent step can be added to the tenant', s.leases[2].steps.length === 1);
  await p.evaluate(() => bkLeaseDel(2)); await p.waitForTimeout(250); s = await p.evaluate(() => bkLoad());
  check('removing a tenant removes it', s.leases.length === 2);
  await p.evaluate(() => bkLeaseOnSet('false')); await p.waitForTimeout(250);
  check('switching the model off returns retail income to the flat inputs', await p.evaluate(() => !bkLeaseOn() && Math.abs(bkCalc().commercial - (12000 + 7000) * 12) < 1e-6));
  /* 14. the Reports and the rest of the app still run with the model on */
  await p.evaluate(() => { bkLeaseOnSet('true'); });
  for (const sh of ['Property CF', 'Returns', 'Cash Flow Report', 'Tenant Report', 'Lease Cohort CF', 'Sensitivity']) { await p.evaluate(n => showSheet(n), sh); await p.waitForTimeout(200); }
  /* 15. reports */
  await p.evaluate((pt) => { bkCreateNewDeal(Object.assign({}, window.__A, pt)); showSheet('Lease Schedule'); }, L([T({ end: '2029-12-31', recType: 'NNN' }), T({ tenant: 'B', suite: '102', sf: 5000, status: 'Vacant', start: '', end: '', rent: 0, mkt: 28 })], { rolloverAssumptions: Object.assign({}, base.rolloverAssumptions, { renewalProbability: 0.5 }) })); await p.waitForTimeout(400);
  const ls = await p.evaluate(() => { const t = document.getElementById('rp-lease'), rows = [...t.querySelectorAll('tbody tr')].map(r => [...r.children].map(c => c.textContent)), rec = rows.find(r => /^Retail income in the cash flow/.test(r[0])), a = bkAnnualCF(); const f = n => Math.round(n).toLocaleString('en-US');
    const y = k => a.monthly.slice(k * 12, k * 12 + 12).reduce((t, m) => t + m.comm, 0); return { r1: rec[1].replace('$', ''), e1: f(y(0)), r3: rec[3].replace('$', ''), e3: f(y(2)), tot: rec[rec.length - 1].replace('$', ''), et: f(a.monthly.reduce((t, m) => t + m.comm, 0)), bad: (t.innerText.match(/undefined|NaN/g) || []).length }; });
  check('Lease Schedule: retail income by year reconciles to the engine\'s retail revenue line', ls.r1 === ls.e1 && ls.r3 === ls.e3 && ls.tot === ls.et && ls.bad === 0, JSON.stringify(ls));
  await p.evaluate(() => showSheet('Cash Flow Report')); await p.waitForTimeout(300);
  const cfr = await p.evaluate(() => { const t = document.getElementById('rp-cashflow'), rows = [...t.querySelectorAll('tbody tr')].map(r => [...r.children].map(c => c.textContent)), lc = rows.find(r => /^Leasing Costs/.test(r[0])), a = bkAnnualCF(), k = bkLeaseCosts(bkLoad(), a.holdMonths), tot = k.ti.reduce((x, v) => x + v, 0) + k.lc.reduce((x, v) => x + v, 0); return { has: !!lc, shown: lc && lc[lc.length - 2].replace('$', ''), exp: '(' + Math.round(tot).toLocaleString('en-US') + ')' }; });
  check('Cash Flow Report shows leasing costs on their own line, equal to the engine\'s TI and commissions', cfr.has && cfr.shown === cfr.exp, JSON.stringify(cfr));
  check('no page errors with the model on', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails || errs.length ? 1 : 0);
})();
