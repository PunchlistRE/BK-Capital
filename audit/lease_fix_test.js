// Regression tests for the ten lease-model findings from the review of #33.
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

  /* 5. Year-1 recoveries: statement and monthly Year 1 agree under the standard growth convention (base-year tenants included) */
  const recDeal = (cv) => deal({ cvRentGrowthStart: cv, opexGrowth: 0.03, taxGrowth: 0.03, leases: [T({ end: '2040-12-31', recType: 'NNN' }), T({ tenant: 'Base', suite: '102', end: '2040-12-31', recType: 'BaseYear', start: '2026-01-01' })] });
  const ry2 = await evalDeal(p, recDeal('year2')), rm1 = await evalDeal(p, recDeal('month1'));
  const sum12 = a => a.slice(0, 12).reduce((t, v) => t + v, 0);
  check('growth from Year 2: Year-1 recoveries in the statement equal the monthly Year 1 exactly', near(ry2.calc.recovery, sum12(ry2.rec), 1e-12), `${ry2.calc.recovery.toFixed(2)} vs ${sum12(ry2.rec).toFixed(2)}`);
  check('legacy month-1 growth: monthly Year-1 recoveries sit above the flat statement, like every other line under that setting', sum12(rm1.rec) > rm1.calc.recovery);

  /* 6. Retail bridge: gross potential at full occupancy, then free rent, credit loss and vacancy in their own rows */
  const brDeal = deal({ commercialRentGrowth: 0, opexGrowth: 0, taxGrowth: 0, leases: [T({ end: '2028-12-31', recType: 'Gross', bump: 0, mkt: 30 }), T({ tenant: 'Stay', suite: '102', end: '2040-12-31', recType: 'Gross', bump: 0, mkt: 30 })],
    leaseMkt: MKT({ creditLoss: 0.02, renewPct: 1, bump: 0 }), rolloverAssumptions: Object.assign({}, RA, { renewalProbability: 0 }) });
  const br = await p.evaluate(d => { bkCreateNewDeal(d); const a = bkAnnualCF(); showSheet('Cash Flow Report');
    const rows = {}; document.querySelectorAll('#rp-cashflow tbody tr').forEach(r => { const c = [...r.cells].map(x => x.textContent.trim()); if (c.length > 3) rows[c[0]] = c.slice(1, a.arr.length + 1).map(v => { const n = Number(v.replace(/[$,()\s]/g, '')); return /\(/.test(v) ? -n : n; }); });
    return { lines: a.arr.map(x => x.lines), egi: a.arr.map(x => x.egi), rows }; }, brDeal);
  const y3 = br.lines[2];
  check('a suite dark for the downtime: retail gross potential stays at full-occupancy rent (both suites x $30 x 10,000 SF)', near(y3.commGross, 2 * 300000, 1e-9), y3.commGross.toFixed(0));
  check('the bridge sums exactly: potential + vacancy = collected retail income, every year', br.lines.every(L => near(L.commGross + L.commVac, L.comm, 1e-9)));
  check('free rent and credit loss are separated out of vacancy', y3.commFree < 0 && y3.commCredit < 0 && near(y3.commCredit, -0.02 * (y3.comm / 0.98), 1e-9), `free ${y3.commFree.toFixed(0)}, credit ${y3.commCredit.toFixed(0)}`);
  const r3 = k => br.rows[k] ? br.rows[k][2] : NaN;
  check('Cash Flow report: the retail potential row shows full-occupancy potential', Math.abs(r3('Gross Potential Rent and Recoveries - Retail') - y3.commGross) < 1, `${r3('Gross Potential Rent and Recoveries - Retail')}`);
  check('Cash Flow report: retail credit loss is in the Credit Loss row and free rent in Concessions', Math.abs(r3('Credit Loss') - (y3.bad + y3.commCredit)) < 1 && Math.abs(r3('Concessions') - (y3.concess + y3.commFree)) < 1);
  check('Cash Flow report: effective gross revenue still equals the engine, every year', br.egi.every((v, i) => Math.abs(br.rows['Effective Gross Revenue'][i] - v) < 1));

  /* 7. Occupancy weighting: retail dark at closing that leases up later carries its weight in occupancy-variable expenses */
  const ow = await p.evaluate(d => { bkCreateNewDeal(d); const s = bkLoad(), a = bkAnnualCF(), LM = a.lease, cv = bkConventions(s), v = cv.cvOpexVariablePct, res = 1 - s.vacancy;
    const k = ['rm','payroll','turnover','utilities','contract','marketing','ga'].reduce((t, x) => t + Number(s[x] || 0), 0) + Number(s.gsf) * Number(s.miscPerGSF || 0);
    const m = 30, mo = a.monthly[m - 1], resW = bkCalc().gpr / 12, retW = LM.potential[m - 1], blend = (resW * res + retW * LM.occ[m - 1]) / (resW + retW);
    return { engine: mo.ctrlOpex, expect: -(k / 12) * ((1 - v) + v * blend), occ: LM.occ[m - 1], y1Retail: a.arr[0].lines.comm }; },
    deal({ cvOpexVariablePct: 0.4, opexGrowth: 0, rentGrowth: 0, leases: [T({ status: 'Vacant', rent: 0, start: '', end: '', over: { vacantMonths: 18 } })] }));
  check('retail vacant until month 19: in month 30 controllable opex uses the leased-up retail weight', near(ow.engine, ow.expect, 1e-12) && ow.occ > 0.99, `${ow.engine.toFixed(2)} vs ${ow.expect.toFixed(2)}`);

  /* 8. WALT counts a lease with no end date to the end of the hold, not 9999 months */
  const wl = await p.evaluate(d => { bkCreateNewDeal(d); const sm = bkLeaseSummary(bkLoad()); showSheet('Lease Schedule'); return { walt: sm.walt, open: sm.openEnded, text: document.getElementById('viewport').innerText }; },
    deal({ holdYears: 5, leases: [T({ end: '2027-12-31' }), T({ tenant: 'Open', suite: '102', end: '' })] }));
  check('WALT with one lease ending in 12 months and one open-ended over a 5-year hold is (1 + 5) / 2 = 3.0 years', near(wl.walt, 3, 1e-9) && wl.open === 1, wl.walt.toFixed(2));
  check('and the Lease Schedule says how open-ended leases were counted', /no end date counted to the end of the hold/.test(wl.text));

  /* 9. Lease warnings name the right tenant when an earlier row has no area */
  const nt = await p.evaluate(d => { bkCreateNewDeal(d); showSheet('Lease Schedule'); return [...document.querySelectorAll('#viewport .rp-ul li')].map(x => x.textContent); },
    deal({ leases: [T({ tenant: 'Blank Row', sf: 0 }), T({ tenant: 'Open Tenant', suite: '102', end: '' }), T({ tenant: 'Third', suite: '103', end: '' })] }));
  check('the no-end-date warnings name Open Tenant and Third, not a neighbour or "Tenant"', nt.some(x => /^Open Tenant: No lease end date/.test(x)) && nt.some(x => /^Third: No lease end date/.test(x)) && !nt.some(x => /^Tenant: /.test(x)), nt.filter(x => /end date/.test(x)).join(' | '));

  /* 10. The Cash Flow report reuses the cash flow's leasing costs instead of recomputing them */
  const cf = await p.evaluate(d => { bkCreateNewDeal(d); const a = bkAnnualCF(); showSheet('Cash Flow Report');
    const row = [...document.querySelectorAll('#rp-cashflow tbody tr')].find(r => /^Leasing Costs/.test(r.cells[0].textContent));
    const y1 = -a.lease.ti.slice(0, 12).concat(a.lease.lc.slice(0, 12)).reduce((t, v) => t + v, 0), shown = Number(row.cells[1].textContent.replace(/[$,()\s]/g, '')) * (/\(/.test(row.cells[1].textContent) ? -1 : 1);
    return { y1, shown }; }, deal({ leases: [T({ end: '2027-06-30' })] }));
  check('Cash Flow report: the leasing-cost row equals the cash flow\'s own TI and commissions', Math.abs(cf.shown - cf.y1) < 1, `${cf.shown} vs ${cf.y1.toFixed(0)}`);

  check('no page errors', p.errs.length === 0 && (!ref || ref.errs.length === 0), p.errs.concat(ref ? ref.errs : []).join(' | '));
  await b.close(); console.log(checks + ' checks, ' + fails + ' failures'); process.exit(fails ? 1 : 0);
})();
