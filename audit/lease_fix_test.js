// Regression tests for four lease-model defects found in review of #33.
//   node audit/lease_fix_test.js index.html [reference.html]
// reference.html (optional) is a build from before the rollover change; when given, rollover results are compared
// against it month by month to prove that merging branches changed no figure.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
const T = (o) => Object.assign({ tenant: 'Shop', suite: '101', sf: 10000, status: 'Occupied', start: '2024-01-01', end: '2028-06-30', rent: 30, bump: 0.03, mkt: 40, recType: 'NNN', recFixed: 0 }, o);
const MKT = (o) => Object.assign({ bump: 0.03, termNew: 60, termRenew: 60, freeNew: 3, freeRenew: 0, renewPct: 1, creditLoss: 0 }, o);
const RA = { renewalProbability: 0.65, downtimeMonths: 6, tiNewPerSF: 20, tiRenewalPerSF: 5, lcNewPct: 0.06, lcRenewalPct: 0.03 };
const deal = (o) => Object.assign({}, A, { commLeaseModel: true, commercialRentGrowth: 0.03, commercialVacancy: 0, rolloverAssumptions: RA }, o);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const open = async (file) => { const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
    await p.goto('file://' + path.resolve(file)); await p.waitForTimeout(700);
    await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok')); p.errs = errs; return p; };
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? '  [' + d + ']' : '')); };
  const near = (x, y, t) => Math.abs(x - y) <= (t || 1e-9) * Math.max(1, Math.abs(y));
  const p = await open(process.argv[2]);
  const evalDeal = (pg, d) => pg.evaluate(d => { bkCreateNewDeal(d); const t0 = performance.now(), a = bkAnnualCF(), t1 = performance.now(), c = bkCalc();
    return { ms: t1 - t0, segs: a.lease ? a.lease.struct.segs.length : 0, rent: a.lease ? a.lease.rent : [], rec: a.lease ? a.lease.rec : [], ti: a.lease ? a.lease.ti : [], lc: a.lease ? a.lease.lc : [],
             noi: a.monthly.map(x => x.noi), comm: a.monthly.map(x => x.comm), commVac: a.monthly.map(x => x.commVac), irr: a.irr, calc: { commercial: c.commercial, recovery: c.recovery, commercialVac: c.commercialVac, noi: c.noi },
             issues: a.lease ? a.lease.issues.map(i => i.msg) : [] }; }, d);

  /* 1. Rollover: identical branches are merged, so short lease terms no longer blow up, and results are unchanged */
  const ref = process.argv[3] ? await open(process.argv[3]) : null;
  for (const term of [24, 12]) {
    const d = deal({ leases: [T({}), T({ tenant: 'Shop B', suite: '102', end: '2029-03-31' })], leaseMkt: MKT({ termNew: term, termRenew: term }) });
    const now = await evalDeal(p, d);
    if (ref) { const old = await evalDeal(ref, d);
      const same = k => old[k].every((v, i) => near(now[k][i], v, 1e-9));
      check(`${term}-month terms: rent, recoveries, TI, LC and NOI identical to the unmerged build in every month`, ['rent', 'rec', 'ti', 'lc', 'noi'].every(same), `segments ${old.segs} -> ${now.segs}`);
      check(`${term}-month terms: IRR identical to the unmerged build`, near(now.irr, old.irr, 1e-12), `${old.irr} vs ${now.irr}`); }
    else check(`${term}-month terms evaluate`, now.noi.length > 0, now.segs + ' segments');
  }
  for (const term of [3, 1]) {
    const now = await evalDeal(p, deal({ leases: [T({}), T({ tenant: 'Shop B', suite: '102', end: '2029-03-31' })], leaseMkt: MKT({ termNew: term, termRenew: term, freeNew: 0 }) }));
    check(`${term}-month terms evaluate quickly (before: ${term === 3 ? '1.5M segments, ~11 s' : '1.6M segments, ~8 s'})`, now.ms < 1000 && now.segs < 1000, `${now.segs} segments, ${now.ms.toFixed(0)} ms`);
  }

  /* 2. Market Leasing inputs show the default in use, clearing a box reverts to it, and a term below one month is rejected */
  await p.evaluate(d => { bkCreateNewDeal(d); bkEdGo('Market', 'Market', 'lease'); }, deal({ leases: [T({})], leaseMkt: {} }));
  await p.waitForTimeout(200);
  const box = async id => p.$eval('#' + id, e => ({ v: e.value, unit: e.closest('tr, .ae-r, div').parentElement.textContent }));
  const ids = { 'ae-leaseMkt-termNew': '60', 'ae-leaseMkt-renewPct': '100', 'ae-leaseMkt-freeNew': '3', 'ae-rolloverAssumptions-renewalProbability': '65' };
  for (const [id, want] of Object.entries(ids)) { const x = await box(id); check(`${id.replace('ae-', '')} shows the default in use (${want}) and says so`, x.v === want && /\(default\)/.test(x.unit), x.v); }
  const setBox = async (id, v) => { await p.fill('#' + id, v); await p.dispatchEvent('#' + id, 'change'); await p.waitForTimeout(200); };
  await setBox('ae-leaseMkt-renewPct', '90');
  check('typing a value saves it', await p.evaluate(() => bkLoad().leaseMkt.renewPct) === 0.9);
  await setBox('ae-leaseMkt-renewPct', '');
  const rp = await p.evaluate(() => ({ saved: bkLoad().leaseMkt.renewPct, used: bkLeaseMarket(bkLoad()).M.renewPct }));
  check('clearing Renewal Rent as % of Market reverts to the default instead of saving 0 (renewals no longer earn $0)', rp.saved === undefined && rp.used === 1, JSON.stringify(rp));
  for (const v of ['0', '-5', '']) {
    await setBox('ae-leaseMkt-termNew', v);
    const tn = await p.evaluate(() => ({ saved: bkLoad().leaseMkt.termNew, used: bkLeaseMarket(bkLoad()).M.termNew }));
    check(`New Lease Term "${v}" never becomes a 0- or 1-month term`, tn.used === 60 && tn.saved === undefined, JSON.stringify(tn));
  }
  await p.evaluate(() => { const s = bkLoad(); s.leases[0].over = {}; bkSave(s); window.bkLeaseOver(0, 'termNew', '0', 'int'); });
  check('a per-tenant override term of 0 is rejected too', await p.evaluate(() => !(bkLoad().leases[0].over || {}).termNew));

  /* 3. Stress: the commercial vacancy rate is a general vacancy allowance on the lease schedule, net of the schedule's own vacancy */
  const flatGrowth = { commercialRentGrowth: 0, opexGrowth: 0, taxGrowth: 0, otherGrowth: 0, rentGrowth: 0 };
  const full = [T({ end: '2040-12-31', bump: 0 })];
  const b0 = await evalDeal(p, deal(Object.assign({ leases: full, commercialVacancy: 0 }, flatGrowth)));
  const b10 = await evalDeal(p, deal(Object.assign({ leases: full, commercialVacancy: 0.10 }, flatGrowth)));
  const pot = b0.calc.commercial + b0.calc.recovery;
  check('fully leased schedule: a 10% commercial vacancy rate takes 10% of retail rent and recoveries off Year 1', near(b10.calc.commercialVac, -0.10 * pot, 1e-9), `${b10.calc.commercialVac.toFixed(0)} vs ${(-0.10 * pot).toFixed(0)}`);
  check('the Year-1 statement and the monthly cash flow agree on that loss', near(b10.commVac.slice(0, 12).reduce((t, v) => t + v, 0), b10.calc.commercialVac, 1e-9));
  check('NOI falls in every month, and IRR falls', b10.noi.every((v, i) => v < b0.noi[i]) && b10.irr < b0.irr, `${(b0.irr * 100).toFixed(2)}% -> ${(b10.irr * 100).toFixed(2)}%`);
  const half = [T({ end: '2040-12-31', bump: 0 }), T({ tenant: 'Vacant', suite: '102', status: 'Vacant', rent: 0, end: '', start: '', bump: 0 })];
  const v0 = await evalDeal(p, deal(Object.assign({ leases: half, commercialVacancy: 0 }, flatGrowth)));
  const v5 = await evalDeal(p, deal(Object.assign({ leases: half, commercialVacancy: 0.05 }, flatGrowth)));
  check('a schedule already carrying more vacancy than the rate is not reduced again (no double count)', v5.comm.slice(0, 6).every((x, i) => near(x, v0.comm[i], 1e-12)));
  const sc = await p.evaluate(d => { bkCreateNewDeal(d); const base = bkRunScenario({}), down = bkRunScenario({ commercialVacancy: 0.10 }); return { base: base.irr, down: down.irr }; }, deal(Object.assign({ leases: full }, flatGrowth)));
  check('a downside scenario that raises the commercial vacancy rate now lowers a lease-model deal\'s IRR', sc.down < sc.base - 1e-4, `${(sc.base * 100).toFixed(2)}% -> ${(sc.down * 100).toFixed(2)}%`);
  const nz = await evalDeal(p, deal({ leases: [T({})], commercialVacancy: 0 }));
  const nzRef = ref ? await evalDeal(ref, deal({ leases: [T({})], commercialVacancy: 0 })) : null;
  if (nzRef) check('with no commercial vacancy rate, results are identical to the build before this change', nz.noi.every((v, i) => near(v, nzRef.noi[i], 1e-12)) && near(nz.irr, nzRef.irr, 1e-12));

  /* 4. No lease start date: annual bumps fall on closing anniversaries (closing 1/1/2027, so month 13), not month 9 */
  const nb = await evalDeal(p, deal({ leases: [T({ start: '', end: '2040-12-31', rent: 30, bump: 0.10, recType: 'Gross' })] }));
  const m = 10000 * 30 / 12;
  check('no start date: $25,000 a month through month 12, the 10% bump in month 13, the next in month 25', near(nb.rent[8], m) && near(nb.rent[11], m) && near(nb.rent[12], m * 1.1) && near(nb.rent[23], m * 1.1) && near(nb.rent[24], m * 1.21),
    [8, 11, 12, 24].map(i => nb.rent[i].toFixed(0)).join(' / '));
  check('and the schedule says so', nb.issues.some(x => /No lease start date/.test(x)));
  const ws = await evalDeal(p, deal({ leases: [T({ start: '2019-07-01', end: '2040-12-31', rent: 30, bump: 0.10, recType: 'Gross' })] }));
  check('with a start date, bumps still fall on the lease anniversary (July)', near(ws.rent[5], m) && near(ws.rent[6], m * 1.1) && near(ws.rent[18], m * 1.21), [5, 6, 18].map(i => ws.rent[i].toFixed(0)).join(' / '));

  check('no page errors', p.errs.length === 0 && (!ref || ref.errs.length === 0), p.errs.concat(ref ? ref.errs : []).join(' | '));
  await b.close(); console.log(checks + ' checks, ' + fails + ' failures'); process.exit(fails ? 1 : 0);
})();
