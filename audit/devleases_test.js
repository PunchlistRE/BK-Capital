// Tenant-level commercial leases in a development deal. The lease clock starts the month after completion; the schedule's retail replaces the retail inside the stabilised
// NOI path from stabilisation, replaces it inside the lease-up ramp, and its TI and LC are capital in the month they fall. A development without a tenant schedule is unchanged.
//   node audit/devleases_test.js index.html [reference.html]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const DEV = require(path.join(__dirname, 'devdeal.js')), A = require(path.join(__dirname, 'deal.js'));
const LEASES = [
  { tenant: 'Cafe', suite: 'R1', sf: 2000, status: 'Occupied', start: '7/1/2029', end: '6/30/2036', rent: 36, bump: 0.03, mkt: 38, recType: 'NNN', recFixed: 0 },
  { tenant: 'Salon', suite: 'R2', sf: 1500, status: 'Occupied', start: '1/1/2029', end: '12/31/2034', rent: 30, bump: 0.03, mkt: 32, recType: 'Gross', recFixed: 0 },
  { tenant: '', suite: 'R3', sf: 1800, status: 'Vacant', start: '', end: '', rent: 0, bump: 0.03, mkt: 35, recType: 'NNN', recFixed: 0 }];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const mk = async (file) => { const p = await b.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(file)); await p.waitForTimeout(700); await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok')); return p; };
  const p = await mk(process.argv[2]);
  const SNAP = '() => { const m = bkMonthlyReturns(), x = bkDevV09(), f = bkDevFundingV10(), c = bkCalc(); return { irr: m.irr, moic: m.moic, def: x.leaseDef, co: x.co, stab: x.stab, noi: c.noi, ramp: x.leaseupRamp.map(r => [r.mo, r.egi, r.after]), rows: m.rows.map(r => [r.noi, r.cf]), need: f.months.map(z => z.need) }; }';
  const same = (a, c) => JSON.stringify(a, (k, v) => typeof v === 'number' ? Math.round(v * 1e5) : v) === JSON.stringify(c, (k, v) => typeof v === 'number' ? Math.round(v * 1e5) : v);
  const on = (leases, extra) => p.evaluate(([l, e]) => { const s = bkLoad(); s.commLeaseModel = true; s.leases = l; Object.assign(s, e || {}); bkSave(s); return true; }, [leases, extra]);
  const ev = (src) => p.evaluate((src) => eval('(' + src + ')')(), src);
  await p.evaluate((d) => bkCreateNewDeal(d), DEV);
  const base = await ev(SNAP);

  /* ---- 1. unchanged without a schedule ---- */
  if (process.argv[3]) { const q = await mk(process.argv[3]); const ref = await q.evaluate(([d, src]) => { bkCreateNewDeal(d); return eval('(' + src + ')')(); }, [DEV, SNAP]); check('a development deal with no tenant schedule is identical to the reference build (ramp, funding, cash flow, IRR)', same(base, ref), base.irr + ' vs ' + ref.irr); await q.close(); }
  await p.evaluate((d) => { bkCreateNewDeal(d); const s = bkLoad(); s.commLeaseModel = true; s.leases = []; bkSave(s); }, DEV);
  check('the lease model switched on with no tenants changes nothing', same(await ev(SNAP), base));
  const acq = await p.evaluate(([d, L]) => { bkCreateNewDeal(Object.assign({}, d, { purchasePrice: 19800000 })); const a = bkMonthlyReturns().irr; const s = bkLoad(); s.commLeaseModel = true; s.leases = L; bkSave(s); return { a, b: bkMonthlyReturns().irr, shift: bkLeaseDevShift(bkLoad()) }; }, [A, LEASES]);
  check('an acquisition deal keeps its own clock (month 1 is the closing month, no shift) and still uses its tenant schedule', acq.shift === 0 && acq.b !== acq.a, JSON.stringify(acq));

  /* ---- 2. the clock ---- */
  await p.evaluate((d) => bkCreateNewDeal(d), DEV); await on(LEASES);
  const clk = await p.evaluate(() => { const s = bkLoad(), x = bkDevV09(), LM = bkLeaseEval(s, 40, null, true); return { shift: bkLeaseDevShift(s), co: x.co, rent: LM.rent.slice(0, 14).map(v => Math.round(v)), occ: LM.occ.slice(0, 3) }; });
  check('the lease clock starts the month after completion: month 1 is month 25 (completion is month 24)', clk.shift === clk.co && clk.shift === 24, JSON.stringify([clk.shift, clk.co]));
  check('a lease starting on the first day of the first operating month (1/1/2029, a 1,500 SF salon at $30) pays from lease month 1; a lease starting 6 months later (7/1/2029, the cafe) pays from month 7', clk.rent[0] === 3750 && clk.rent[5] === 3750 && clk.rent[6] === 9750, clk.rent.join(','));
  const mv = await p.evaluate(() => { const r1 = bkRunWith({ constructionMonths: 24 }, () => bkLeaseEval(bkLoad(), 40, null, true).rent.slice(0, 14).map(v => Math.round(v))); return r1; });
  check('lengthening construction by 6 months moves the same calendar dates 6 lease months earlier: the salon\'s 1/1/2029 start is now before the clock starts (it is already paying in lease month 1) and the cafe starts in month 1', mv[0] > 3750 && mv[0] === mv[5], mv.join(','));

  /* ---- 3. stabilised income ---- */
  const calc = await p.evaluate(() => { const c = bkCalc(), LM = bkLeaseEval(bkLoad(), 12, null, false), t = a => a.reduce((x, y) => x + y, 0); return { commercial: c.commercial, rec: c.recovery, rentY1: t(LM.rent), recY1: t(LM.rec), noi: c.noi }; });
  check('stabilised retail rent and recoveries in the deal\'s first-year statement are the tenant schedule\'s first twelve months (after completion)', Math.abs(calc.commercial - calc.rentY1) < 1e-6 && Math.abs(calc.rec - calc.recY1) < 1e-6 && calc.commercial > 0 && calc.rec > 0, JSON.stringify(calc));
  const rec = await p.evaluate(() => { const LM = bkLeaseEval(bkLoad(), 24, null, true); return { gross: LM.byT[1].rec.reduce((a, v) => a + v, 0), nnn: LM.byT[0].rec.reduce((a, v) => a + v, 0) }; });
  check('NNN recoveries work in a development: the NNN tenant recovers a share of the expense pool, the gross tenant recovers nothing', rec.nnn > 0 && rec.gross === 0, JSON.stringify(rec));
  const wl = await ev(SNAP);
  check('the schedule changes the deal\'s return and stabilised NOI', wl.irr !== base.irr && wl.noi > base.noi, (base.irr * 100).toFixed(2) + '% → ' + (wl.irr * 100).toFixed(2) + '%');

  /* ---- 4. the development cash flow ---- */
  const noiChk = await p.evaluate(() => { const s = bkLoad(), x = bkDevV09(), m = bkMonthlyReturns(), c = bkCalc(), N = 50, tg = +s.taxGrowth || 0, og = +s.opexGrowth || 0, cvS = bkConventions(s).cvRentGrowthStart, gE = mo => cvS === 'month1' ? mo / 12 : Math.ceil(mo / 12) - 1;
    const LM = bkLeaseEval(s, N, { tax: y => Math.pow(1 + tg, y - 1), opex: mo => Math.pow(1 + og, gE(mo)) }, true), g = +s.noiGrowth || +s.rentGrowth || 0, reserves0 = +s.stabilizedNOI ? 0 : Math.max(0, +s.reserves || 0), baseNOI = Math.max(0, +s.stabilizedNOI || 0 || c.after);
    let worst = 0, n = 0; for (let mo = x.stab; mo <= x.stab + 30 && mo <= m.rows.length; mo++) { const yr = Math.max(1, Math.ceil((mo - x.stab + 1) / 12)), k = mo - x.co;
      const growth = ((baseNOI + reserves0) * Math.pow(1 + g, yr - 1) - reserves0 * Math.pow(1 + og, yr - 1)) / 12, lease = (LM.rent[k - 1] + LM.rec[k - 1] - LM.genVac[k - 1]) * (1 - LM.creditLoss), want = growth + (lease - c.netComm * Math.pow(1 + g, yr - 1) / 12) * (1 - (+s.mgmtPct || 0)); worst = Math.max(worst, Math.abs(m.rows[mo - 1].noi - want)); n++; }
    return { worst, n }; });
  check('from stabilisation each month\'s NOI = the growth path less the retail it assumes plus what the tenants pay (net of the management fee): independent recomputation matches to the cent', noiChk.n >= 24 && noiChk.worst < 0.01, JSON.stringify(noiChk));
  const ramp = await p.evaluate(() => { const s = bkLoad(), x = bkDevV09(), c = bkCalc(), LM = bkLeaseEval(s, 40, { tax: y => Math.pow(1 + (+s.taxGrowth || 0), y - 1), opex: mo => Math.pow(1 + (+s.opexGrowth || 0), bkConventions(s).cvRentGrowthStart === 'month1' ? mo / 12 : Math.ceil(mo / 12) - 1) }, true); let worst = 0;
    x.leaseupRamp.forEach(r => { const k = r.mo - x.co, net = k >= 1 ? (LM.rent[k - 1] + LM.rec[k - 1] - LM.genVac[k - 1]) * (1 - LM.creditLoss) : 0, resid = (c.egi - c.netComm) * r.occ / 12; worst = Math.max(worst, Math.abs(r.egi - resid - net)); });
    return { worst, n: x.leaseupRamp.length, first: Math.round(x.leaseupRamp[0].egi), lu: x.luMo }; });
  check('during lease-up each month\'s income = the rest of the project\'s income scaled by occupancy plus what the tenants pay that month (none in the completion month): independent recomputation matches', ramp.n === ramp.lu && ramp.n > 0 && ramp.worst < 0.01, JSON.stringify(ramp));
  const cap = await p.evaluate(() => { const s = bkLoad(), x = bkDevV09(), m = bkMonthlyReturns(), LC = bkLeaseCosts(s, 60), H = bkDevLeaseHooks(s, x); const rows = m.rows.map(r => r.leaseCap || 0); const tot = rows.reduce((a, v) => a + v, 0), want = LC.ti.concat([]).reduce((a, v) => a + v, 0) + LC.lc.reduce((a, v) => a + v, 0); const first = rows.findIndex(v => v > 0) + 1; return { tot, want: Math.min(want, tot), first, k: first - x.co, tiMonths: LC.ti.map((v, i) => v + LC.lc[i] > 0 ? i + 1 : null).filter(Boolean).slice(0, 3), n: rows.filter(v => v > 0).length }; });
  check('the vacant suite\'s tenant improvements and commissions are capital in the month they fall (leased after its downtime, counted from completion), and appear in the development cash flow', cap.tot > 0 && cap.first > 0 && cap.tiMonths.includes(cap.k), JSON.stringify(cap));
  const su = await p.evaluate(() => { const f = bkDevFundingV10(), M = f.months, S = k => M.reduce((a, z) => a + (z[k] || 0), 0); return { row: Math.max(...M.map(z => Math.abs(z.loanDraw + z.eq + z.overflow - z.need))), roll: Math.max(...M.map(z => Math.abs(z.end - (z.beg + z.capInt + z.loanDraw)))), tie: S('need') - (S('land') + S('hard') + S('soft') + S('lease') + S('fees')), irr: bkMonthlyReturns().irr }; });
  check('sources and uses still balance, and the return is a number', su.row < 0.01 && su.roll < 0.01 && Math.abs(su.tie) < 1 && isFinite(su.irr), JSON.stringify(su));
  const ex = await p.evaluate(() => { const m = bkMonthlyReturns(), last = m.rows[m.rows.length - 1], x = bkDevV09(), c = bkCalc(); return { gross: last.grossSale, sale: last.sale, ok: last.grossSale > 0 }; });
  const exWith = ex.gross, exBase = await p.evaluate((d) => { bkRunWith({ commLeaseModel: false }, () => 0); return bkRunWith({ commLeaseModel: false }, () => bkMonthlyReturns().rows.slice(-1)[0].grossSale); }, null);
  check('the exit value reads the same NOI: the sale price with the tenant schedule differs from the flat-retail sale price', exWith > 0 && Math.abs(exWith - exBase) > 1, Math.round(exBase) + ' → ' + Math.round(exWith));
  /* ---- 5. with unit-level lease-up and a schedule together ---- */
  const both = await p.evaluate(() => { bkDevUnitMode('units'); const x = bkDevV09(), m = bkMonthlyReturns(); return { lu: x.luMo, irr: m.irr, n: x.leaseupRamp.length, retail: x.leaseupRamp.some(r => r.retail > 0) }; });
  check('unit-level lease-up and the tenant schedule work together (ramp carries both, return is finite)', both.n === both.lu && isFinite(both.irr) && both.retail, JSON.stringify(both));
  check('no page errors', p.errs.length === 0, p.errs.slice(0, 2).join(' | '));
  await b.close(); console.log(checks + ' checks, ' + fails + ' failures'); process.exit(fails ? 1 : 0);
})();
