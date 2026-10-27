// Lease terms: CPI rent increases, expense stops, recovery caps, gross-up and per-tenant recovery shares.
// Every expected figure is worked out here from the deal inputs, independently of the engine.
//   node audit/lease_terms_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
const T = (o) => Object.assign({ tenant: 'Shop', suite: '101', sf: 10000, status: 'Occupied', start: '2024-02-01', end: '2033-01-31', rent: 20, bump: 0.03, mkt: 20, recType: 'NNN', recFixed: 0 }, o);
const deal = (o) => Object.assign({}, A, { commLeaseModel: true, commercialRentGrowth: 0, commercialVacancy: 0, opexGrowth: 0, taxGrowth: 0 }, o);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok'));
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? '  [' + d + ']' : '')); };
  const near = (x, y, t) => Math.abs(x - y) <= (t || 1e-9) * Math.max(1, Math.abs(y));
  /* rent and recoveries by month (flat expense factors unless given), plus the inputs the expected figures need */
  const run = (d, months, opexStep) => p.evaluate(([d, months, opexStep]) => { bkCreateNewDeal(d); const s = bkLoad();
    const fac = opexStep ? { tax: () => 1, opex: m => Math.pow(1 + opexStep, Math.floor((m - 1) / 12)) } : null;
    const e = bkLeaseEval(s, months, fac, true), c = bkCalc(), a = bkAnnualCF();
    return { rent: e.byT[0].rent, rec: e.byT[0].rec, issues: e.issues.map(x => x.msg), occ: e.occ, s: { taxes: +s.taxes, insurance: +s.insurance, utilities: +s.utilities, rm: +s.rm, contract: +s.contract, gsf: +s.gsf },
             stmtRec: c.recovery, cfRec: a.lease ? a.lease.rec.slice(0, 12).reduce((t, v) => t + v, 0) : NaN }; }, [d, months, opexStep]);
  const share = 10000 / A.gsf;

  /* 1. CPI: on each anniversary the rent rises by the greater of the floor and the CPI change measured to the month before the lease year */
  const cpiDeal = (L, mk) => deal({ leases: [T(Object.assign({ esc: 'cpi' }, L))], leaseMkt: Object.assign({ cpiForecast: 0.02 }, mk) });
  const ratio = r => r.rent[1] / r.rent[0];   // closing is January 2027, so month 2 is the February anniversary
  let r = await run(cpiDeal({}, {}), 24);
  check('CPI forecast 2% under a 3% floor: the February increase is the 3% floor', near(ratio(r), 1.03, 1e-12), ratio(r).toFixed(6));
  r = await run(cpiDeal({}, { cpiForecast: 0.05 }), 24);
  check('CPI forecast 5% over a 3% floor: the increase is the 5% CPI change', near(ratio(r), 1.05, 1e-12), ratio(r).toFixed(6));
  const IDX = [{ month: '2026-01', value: 300 }, { month: '2027-01', value: 312 }];
  r = await run(cpiDeal({}, { cpiIndex: IDX }), 24);
  check('index Jan-2026 300 to Jan-2027 312 (+4.0%): the Feb-2027 increase is 4.0%', near(ratio(r), 1.04, 1e-12), ratio(r).toFixed(6));
  check('the next anniversary, past the known index, uses the 2% forecast, so the 3% floor applies', near(r.rent[13] / r.rent[12], 1.03, 1e-12), (r.rent[13] / r.rent[12]).toFixed(6));
  check('rent is flat between anniversaries', near(r.rent[11], r.rent[1], 1e-12) && near(r.rent[0], 10000 * 20 / 12, 1e-12));
  r = await run(cpiDeal({ cpiCap: 0.035 }, { cpiIndex: IDX }), 24);
  check('with a 3.5% ceiling the 4.0% CPI change is held to 3.5%', near(ratio(r), 1.035, 1e-12), ratio(r).toFixed(6));
  r = await run(cpiDeal({ cpiLag: 2 }, { cpiIndex: IDX.concat([{ month: '2025-12', value: 200 }, { month: '2026-12', value: 211 }]) }), 24);
  check('measured Dec-over-Dec (2 months before a February anniversary): 200 to 211 gives 5.5%', near(ratio(r), 1.055, 1e-12), ratio(r).toFixed(6));
  r = await run(cpiDeal({ bump: 0 }, { cpiIndex: [{ month: '2026-01', value: 312 }, { month: '2027-01', value: 300 }] }), 24);
  check('straight CPI (0% floor) with a falling index: the rent does not fall', near(ratio(r), 1, 1e-12), ratio(r).toFixed(6));
  r = await run(deal({ leases: [T({ esc: 'cpi', steps: [{ month: '2028-02', rent: 25 }] })], leaseMkt: { cpiForecast: 0.05 } }), 24);
  check('dated rent steps take precedence over CPI', near(r.rent[1], r.rent[0], 1e-12) && near(r.rent[13], 10000 * 25 / 12, 1e-12));

  /* 2. Expense stop: the tenant pays its share of recoverable expenses above the stop */
  r = await run(deal({ leases: [T({ recType: 'Stop', recStop: 5 })] }), 12);
  let pool = (r.s.taxes + r.s.insurance + r.s.utilities + r.s.rm + r.s.contract) / 12;
  check('expense stop $5 / SF: recovery = share x expenses - $5 x 10,000 SF / 12', near(r.rec[0], Math.max(0, share * pool - 10000 * 5 / 12), 1e-12), `${r.rec[0].toFixed(2)} vs ${Math.max(0, share * pool - 10000 * 5 / 12).toFixed(2)}`);
  r = await run(deal({ leases: [T({ recType: 'Stop', recStop: 1000 })] }), 12);
  check('a stop above the expenses recovers nothing', r.rec.every(v => v === 0));

  /* 3. Recovery cap: controllable expenses (not taxes, insurance or utilities) grow at most at the cap, cumulatively */
  r = await run(deal({ leases: [T({ start: '2027-01-01', recCap: 0.03 })] }), 36, 0.10);
  const tx = r.s.taxes / 12, ins = r.s.insurance / 12, ut = r.s.utilities / 12, ctl = (r.s.rm + r.s.contract) / 12;   // taxes held flat here; insurance grows with opex
  const capExp = y => share * (tx + (ins + ut) * Math.pow(1.1, y) + Math.min(ctl * Math.pow(1.1, y), ctl * Math.pow(1.03, y)));
  check('cap 3% with expenses growing 10%: year 1 is uncapped', near(r.rec[0], capExp(0), 1e-12));
  check('year 2: controllable expenses held to +3%, taxes, insurance and utilities pass through', near(r.rec[12], capExp(1), 1e-12), `${r.rec[12].toFixed(2)} vs ${capExp(1).toFixed(2)}`);
  check('year 3: the cap compounds (1.03^2)', near(r.rec[24], capExp(2), 1e-12), `${r.rec[24].toFixed(2)} vs ${capExp(2).toFixed(2)}`);
  const nocap = await run(deal({ leases: [T({ start: '2027-01-01' })] }), 36, 0.10);
  check('without a cap the same lease recovers the full growth', near(nocap.rec[24], share * (tx + (ins + ut + ctl) * 1.21), 1e-12) && nocap.rec[24] > r.rec[24]);

  /* 4. Gross-up: half the space is vacant and every expense but taxes and insurance is fully variable */
  const gu = (g, v) => deal({ leases: [T({}), T({ tenant: 'Dark', suite: '102', status: 'Vacant', rent: 0, over: { vacantMonths: 400 } })], leaseMkt: Object.assign({}, g === undefined ? {} : { grossUp: g }, v === undefined ? {} : { grossVar: v }) });
  const fx = (r.s.taxes + r.s.insurance) / 12, vr = (r.s.utilities + r.s.rm + r.s.contract) / 12;
  r = await run(gu(undefined, 1), 12);
  check('occupancy is 50%', near(r.occ[0], 0.5, 1e-12));
  check('default gross-up (100%): recoveries on full-occupancy costs, as before this change', near(r.rec[0], share * (fx + vr), 1e-12));
  r = await run(gu(0.95, 1), 12);
  check('gross-up to 95%: variable costs billed as if 95% occupied', near(r.rec[0], share * (fx + 0.95 * vr), 1e-12), `${r.rec[0].toFixed(2)} vs ${(share * (fx + 0.95 * vr)).toFixed(2)}`);
  r = await run(gu(0, 1), 12);
  check('no gross-up: variable costs at the actual 50% occupancy', near(r.rec[0], share * (fx + 0.5 * vr), 1e-12));
  r = await run(gu(0.95, 0.4), 12);
  check('40% variable: billed costs = fixed + variable x (0.6 + 0.4 x 95%)', near(r.rec[0], share * (fx + vr * (0.6 + 0.4 * 0.95)), 1e-12));
  r = await run(gu(0.95), 12);
  check('with the deal\'s convention (new deals: expenses do not vary with occupancy) gross-up changes nothing', near(r.rec[0], share * (fx + vr), 1e-12));

  /* 5. Recovery shares stated in the lease */
  r = await run(deal({ leases: [T({ recShares: { utilities: 0.1 } })] }), 12);
  check('a tenant paying only a 10% share of utilities (water) recovers exactly 10% of utilities', near(r.rec[0], 0.1 * r.s.utilities / 12, 1e-12), `${r.rec[0].toFixed(2)} vs ${(0.1 * r.s.utilities / 12).toFixed(2)}`);
  const H = { taxes: 0.165, insurance: 0.165, contract: 0.165, utilities: 0.343 };
  r = await run(deal({ leases: [T({ recShares: H })] }), 12);
  check('stated shares (16.5% taxes, insurance, services; 34.3% utilities) are applied line by line', near(r.rec[0], (0.165 * (r.s.taxes + r.s.insurance + r.s.contract) + 0.343 * r.s.utilities) / 12, 1e-12));
  check('the Year-1 statement agrees with the monthly cash flow', near(r.stmtRec, r.cfRec, 1e-9), `${r.stmtRec.toFixed(2)} vs ${r.cfRec.toFixed(2)}`);

  /* 6. Editor: the new inputs write to the deal, and clearing them restores the default */
  const ed = await p.evaluate((d) => { bkCreateNewDeal(d); bkEdGo('Tenants', 'Tenants', 'lease'); const out = {};
    const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('change')); };
    out.panels = ['Recovery Shares', 'CPI Index', 'Gross-Up Occupancy', 'CPI Forecast', 'Recovery Cap', 'Rent Increases'].every(x => document.getElementById('viewport').innerText.includes(x));
    set('ae-ls-esc-0', 'cpi'); out.esc = bkLoad().leases[0].esc;
    set('ae-ls-cpiCap-0', '3.5'); out.cap = bkLoad().leases[0].cpiCap; set('ae-ls-cpiCap-0', ''); out.capCleared = !('cpiCap' in bkLoad().leases[0]);
    set('ae-ls-recCap-0', '5'); out.recCap = bkLoad().leases[0].recCap;
    set('ae-lsh-utilities-0', '10'); out.share = bkLoad().leases[0].recShares; set('ae-lsh-utilities-0', ''); out.shareCleared = !('recShares' in bkLoad().leases[0]);
    bkLeaseSet(0, 'recType', 'Stop'); set('ae-ls-recStop-0', '5'); out.stop = bkLoad().leases[0].recStop;
    set('ae-leaseMkt-grossUp', '95'); out.gu = bkLoad().leaseMkt.grossUp; set('ae-leaseMkt-grossUp', ''); out.guCleared = !('grossUp' in (bkLoad().leaseMkt || {}));
    bkLeaseCpiAdd(); set('ae-cpi-0', '312'); out.idx = bkLoad().leaseMkt.cpiIndex;
    const s = bkLoad(), st = bkMap.reconstructState(bkMap.stateToDealRow(s), { input_data: bkMap.stateToInputData(s), source_data: {} }, []);
    out.saved = JSON.stringify([st.leases[0].esc, st.leases[0].recCap, st.leases[0].recStop, st.leaseMkt.cpiIndex]);
    return out; }, deal({ leases: [T({})] }));
  check('the Commercial Leases tab shows the new inputs', ed.panels);
  check('Rent Increases switches the lease to CPI', ed.esc === 'cpi');
  check('CPI ceiling 3.5 saves 0.035, and clearing it removes it', near(ed.cap, 0.035, 1e-12) && ed.capCleared);
  check('Recovery cap 5 saves 0.05', near(ed.recCap, 0.05, 1e-12));
  check('a stated utilities share of 10 saves 0.10, and clearing the last share returns the tenant to its area share', ed.share && near(ed.share.utilities, 0.1, 1e-12) && ed.shareCleared);
  check('Expense stop 5 saves $5 / SF', ed.stop === 5);
  check('Gross-up 95 saves 0.95, and clearing it goes back to the 100% default', near(ed.gu, 0.95, 1e-12) && ed.guCleared);
  check('a CPI index value can be added', ed.idx && ed.idx.length === 1 && ed.idx[0].value === 312 && /^\d{4}-\d{2}$/.test(ed.idx[0].month));
  check('the new terms survive the save and reopen mapping', ed.saved === JSON.stringify(['cpi', 0.05, 5, ed.idx]), ed.saved);
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(`${checks} checks, ${fails} failures`); process.exit(fails ? 1 : 0);
})();
