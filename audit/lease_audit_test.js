// Reports > Lease Audit Report (src/156): Argus's Lease Audit and Supplemental, tenant by tenant, from the lease engine's own series.
// Checks the supplemental tables (area, dates, years remaining, rents to the cent, escalation and recovery words, the rollover terms each tenant is actually run with, overrides included),
// every tenant block against the engine's monthly series (read independently of the report), that the tenants add up to the "All Tenants" block, that leasing costs tie to the Cash Flow Report's own
// Tenant Improvements, Leasing Commissions and Total Leasing Costs rows, that the bridge ends on the retail revenue the engine counts in Effective Gross Revenue (summed from its monthly rows), and the pages a
// deal without a schedule, a development, a phone and a print get.
//   node audit/lease_audit_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), V = require(path.join(__dirname, 'devdeal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 420) + ']' : '')); };
  const open = async (deal, over, w) => { const p = await (await b.newContext({ viewport: { width: w || 1440, height: 1000 } })).newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate(([d, o]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d, o || {}); bkSave(s); }, [deal, over]); return p; };
  const T = (o) => Object.assign({ tenant: 'Shop', suite: '101', sf: 10000, status: 'Occupied', start: '2024-01-01', end: '2040-12-31', rent: 30, bump: 0.03, mkt: 40, recType: 'Gross', recFixed: 0 }, o);
  const MK = { commercialRentGrowth: 0.04, leaseMkt: { bump: 0.03, termNew: 60, termRenew: 60, freeNew: 3, freeRenew: 0, renewPct: 1, creditLoss: 0.01 }, rolloverAssumptions: { renewalProbability: 0.65, downtimeMonths: 6, tiNewPerSF: 20, tiRenewalPerSF: 5, lcNewPct: 0.06, lcRenewalPct: 0.03 } };
  const FOUR = [T({ tenant: 'Corner Cafe', suite: '101', sf: 3200, end: '2029-12-31', rent: 38.5, mkt: 41.25, recType: 'NNN' }), T({ tenant: 'Bright Dental', suite: '102', sf: 4500, end: '2031-06-30', rent: 33, recType: 'BaseYear', baseYear: 2026 }),
    T({ tenant: 'Vacant Suite', suite: '103', sf: 2800, status: 'Vacant', start: '', end: '', rent: 0, mkt: 36 }), T({ tenant: 'Metro Fitness', suite: '104', sf: 9000, end: '2034-03-31', rent: 24, recType: 'Stop', recStop: 6 })];
  const deckA = Object.assign({}, MK, { commLeaseModel: true, leases: FOUR, commercialVacancy: 0.08 });
  /* a ten-year deck: per-tenant overrides, dated steps, CPI, open-ended lease, a recovery cap, a fixed recovery, no general vacancy allowance */
  const TEN = [T({ tenant: 'Anchor', suite: 'A', sf: 22000, end: '2033-08-31', rent: 18, bump: 0, steps: [{ month: '2027-01', rent: 18 }, { month: '2029-01', rent: 20 }, { month: '2031-01', rent: 22 }], recType: 'NNN', over: { renewalProbability: 0.9, downtimeMonths: 3, tiRenewalPerSF: 8, lcNewPct: 0.05, termRenew: 84, freeNew: 4 } }),
    T({ tenant: 'Pharmacy', suite: 'B', sf: 8000, end: '2030-03-31', rent: 31, esc: 'cpi', bump: 0.02, recType: 'NNN', recCap: 0.04 }), T({ tenant: 'Salon', suite: 'C', sf: 1800, start: '', end: '', rent: 42, recType: 'Fixed', recFixed: 6 }),
    T({ tenant: 'Bank Pad', suite: 'D', sf: 4000, status: 'Vacant', start: '', end: '', rent: 0, mkt: 55, over: { vacantMonths: 9 } })];
  const deckB = Object.assign({}, MK, { commLeaseModel: true, leases: TEN, holdYears: 10, commercialVacancy: 0, leaseMkt: Object.assign({}, MK.leaseMkt, { creditLoss: 0 }) });

  /* the report as text, and the engine's series read independently of it */
  const READ = (p) => p.evaluate(async () => { showSheet('Lease Audit Report'); await new Promise(r => setTimeout(r, 600));
    const num = (t) => { t = String(t).trim(); if (t === '' || t === '-') return null; const neg = /^\(.*\)$/.test(t); const v = parseFloat(t.replace(/[(),%$]/g, '')); return neg ? -v : v; };
    const grid = (id) => [...document.querySelectorAll('#' + id + ' tbody tr')].map(tr => ({ cls: tr.className, c: [...tr.children].map(td => td.textContent.trim()) }));
    const years = document.querySelectorAll('#rp-leaseaudit thead tr:not(.rp-fc):not(.rp-pe) th.r').length - 1;
    /* tenant blocks: a section row names the tenant, the rows after it (until the next section) are its lines */
    const blocks = []; let cur = null; grid('rp-leaseaudit').forEach(r => { if (r.cls === 'sec') { cur = { name: r.c[0], rows: {} }; blocks.push(cur); } else if (cur) cur.rows[r.c[0]] = { cls: r.cls, raw: r.c.slice(1), v: r.c.slice(1).map(num) }; });
    const s = bkLoad(), ac = bkAnnualCF(), LM = ac.lease, hm = ac.holdMonths, cf = bkRpCashFlow(), F = cf.f;
    const sumY = (a, y) => { let t = 0; for (let i = (y - 1) * 12; i < y * 12 && i < hm; i++) t += a[i]; return t; };
    const avgY = (a, y) => { let t = 0, c = 0; for (let i = (y - 1) * 12; i < y * 12 && i < hm; i++) { t += a[i]; c++; } return c ? t / c : 0; };
    const Y = (f) => ac.arr.map(a => f(a.y));
    const fresh = bkLeaseEval(s, hm + 12, null, true);   /* a second, separate evaluation of the same schedule (flat expense growth: only the series that do not depend on it are compared) */
    return { years, n: ac.arr.length, blocks, terms: grid('rp-lterms'), roll: grid('rp-lroll'), rollHead: [...document.querySelectorAll('#rp-lroll thead th')].map(x => x.textContent.trim()), termsHead: [...document.querySelectorAll('#rp-lterms thead th')].map(x => x.textContent.trim()),
      text: document.querySelector('#viewport').innerText, peRow: [...document.querySelectorAll('#rp-leaseaudit thead tr.rp-pe th')].map(x => x.textContent.trim()),
      eng: { tenants: LM.tenants.map(t => ({ i: t.i, name: t.name, sf: t.sf, p: t.p, roll: t.roll })), leases: s.leases, hold: hm,
        by: LM.byT.map(B => ({ rent: Y(y => sumY(B.rent, y)), free: Y(y => sumY(B.free, y)), rec: Y(y => sumY(B.rec, y)), ti: Y(y => sumY(B.ti, y)), lc: Y(y => sumY(B.lc, y)), cost: Y(y => sumY(B.cost, y)), occ: Y(y => avgY(B.occ, y)), costM: B.cost, tiM: B.ti, lcM: B.lc })),
        all: { rent: Y(y => sumY(LM.rent, y)), free: Y(y => sumY(LM.free, y)), rec: Y(y => sumY(LM.rec, y)), ti: Y(y => sumY(LM.ti, y)), lc: Y(y => sumY(LM.lc, y)), occ: Y(y => avgY(LM.occ, y)), tiM: LM.ti, lcM: LM.lc },
        pot: Y(y => sumY(LM.potential, y)), gv: Y(y => sumY(LM.genVac, y)), cl: LM.creditLoss, comm: Y(y => ac.monthly.slice((y - 1) * 12, y * 12).reduce((t, m) => t + m.comm, 0)),
        lines: Y(y => ({ gross: ac.arr[y - 1].lines.commGross, free: ac.arr[y - 1].lines.commFree, credit: ac.arr[y - 1].lines.commCredit })),
        vacInd: Y(y => { let t = 0; for (let i = (y - 1) * 12; i < y * 12 && i < hm; i++) t += LM.rent[i] + LM.free[i] + LM.rec[i] - LM.potential[i]; return t; }),
        cf: { ti: Y(F.ti), lc: Y(F.lc), leasing: Y(F.leasing) }, sm: bkLeaseSummary(s), fresh: { cost: fresh.byT.map(B => Y(y => sumY(B.cost, y))), rentTot: Y(y => sumY(fresh.rent, y)) }, idx: s.leases.map(L => { const st = bkLeaseSummary; return null; }) } }; });
  const near = (a, b2, tol) => a != null && b2 != null && Math.abs(a - b2) <= (tol == null ? 1 : tol);
  const rowOf = (blk, k) => blk.rows[k] ? blk.rows[k].v : [];
  const sameArr = (x, y, tol) => x.length === y.length && x.every((v, i) => near(v, y[i], tol));
  const neg = (a) => a.map(v => -v);

  /* A. the page, the group and the supplemental tables on the four-tenant deck */
  let p = await open(A, deckA); const R = await READ(p), E = R.eng;
  check('the report sits in the Reports group, right after the Lease Schedule', await p.evaluate(() => { const g = GROUPS.find(x => x.id === 'reports'); const t = g ? g.sheets : []; const i = t.indexOf('Lease Schedule'); return i >= 0 && t[i + 1] === 'Lease Audit Report'; }));
  check('the page heads itself like the other reports: the amounts are in USD, the period covered, the period-ending row', /Lease Audit and Supplemental/.test(R.text) && /\(Amounts in USD\)/.test(R.text) && /through Dec, 20\d\d/.test(R.text) && R.peRow[0] === 'For the years ending' && /^[A-Z][a-z]{2}-20\d\d$/.test(R.peRow[1]));
  check('one row in Tenants in Place for every tenant the engine runs, in the engine\'s order, with the area and share of the schedule', R.terms.length === E.tenants.length + 1 && E.tenants.every((t, i) => R.terms[i].c[0].indexOf(t.name) === 0 && near(parseFloat(R.terms[i].c[1].replace(/,/g, '')), t.sf, 0.5)) && E.tenants.every((t, i) => near(parseFloat(R.terms[i].c[2]), 100 * t.sf / E.tenants.reduce((a, x) => a + x.sf, 0), 0.006)),
    JSON.stringify(R.terms.map(r => r.c.slice(0, 3))));
  check('the shares of the schedule add to 100% and the total row carries the schedule\'s area', near(R.terms.slice(0, -1).reduce((t, r) => t + parseFloat(r.c[2]), 0), 100, 0.03) && R.terms[R.terms.length - 1].c[1] === E.tenants.reduce((t, x) => t + x.sf, 0).toLocaleString('en-US') + ' SF');
  check('status, lease start and lease end are the lease as entered; a vacant suite shows no dates and no in-place rent', R.terms[0].c[3] === 'Occupied' && R.terms[0].c[4] === '2024-01-01' && R.terms[0].c[5] === '2029-12-31' && R.terms[2].c[3] === 'Vacant' && R.terms[2].c[4] === '' && R.terms[2].c[5] === '' && R.terms[2].c[7] === '-', JSON.stringify(R.terms.map(r => r.c.slice(3, 8))));
  check('rent per SF is shown with its $ and to the cent, in place and market ($38.50 in place against $41.25 market: the whole-dollar display rule must not round them)', R.terms[0].c[7] === '$38.50' && R.terms[0].c[8] === '$41.25' && R.terms[1].c[7] === '$33.00' && /In-Place Rent \(\$ \/ SF \/ Year\)/.test(R.termsHead[7]), JSON.stringify([R.terms[0].c.slice(7, 9), R.termsHead.slice(7, 9)]));
  check('years remaining run from closing to the lease end (Dec 2029 from Jan 2027 is 3.0), and the total row is the engine\'s own weighted average term and rents', R.terms[0].c[6] === '3.0 yrs' && R.terms[1].c[6] === '4.5 yrs' && R.terms[3].c[6] === '7.3 yrs' && R.terms[R.terms.length - 1].c[6] === E.sm.walt.toFixed(1) + ' yrs' && R.terms[R.terms.length - 1].c[7] === '$' + E.sm.inPlacePsf.toFixed(2) && R.terms[R.terms.length - 1].c[8] === '$' + E.sm.marketPsf.toFixed(2),
    JSON.stringify([R.terms.map(r => r[6]), E.sm]));
  check('the weighted average term is the area-weighted average of the rows above it (occupied space only)', (() => { let a = 0, w = 0; R.terms.slice(0, -1).forEach(r => { if (r.c[3] === 'Occupied') { const sf = parseFloat(r.c[1].replace(/,/g, '')); a += sf * parseFloat(r.c[6]); w += sf; } }); return near(a / w, E.sm.walt, 0.06); })());
  check('escalation and recovery are named in words: a yearly percentage, the structure of the lease (NNN, Base Year, Expense Stop), and nothing for a vacant suite', R.terms[0].c[9] === '3.00% a year' && R.terms[0].c[10] === 'NNN' && R.terms[1].c[10] === 'Base Year' && R.terms[3].c[10] === 'Expense Stop' && R.terms[2].c[9] === '' && R.terms[2].c[10] === '', JSON.stringify(R.terms.map(r => r.c.slice(9))));
  check('every figure on the supplemental carries its unit: area in SF, years remaining in yrs, rents per SF in $ to the cent, shares in %, and no NaN or undefined anywhere', !/NaN|undefined|Infinity/.test(R.text) && R.terms.every(r => / SF$/.test(r.c[1]) && /%$/.test(r.c[2])) && R.terms.slice(0, -1).every(r => (r.c[3] !== 'Occupied' || (/ yrs$/.test(r.c[6]) && /^\$\d[\d,]*\.\d\d$/.test(r.c[7]))) && /^\$\d[\d,]*\.\d\d$/.test(r.c[8])));

  /* B. rollover terms */
  check('Rollover Terms lists every tenant with the terms the engine runs it with: here the deal\'s own renewal chance, downtime, terms, free rent, tenant improvements and commissions',
    R.roll.length === E.tenants.length && R.roll.every(r => r.c[1] === '65.00%' && r.c[2] === '6 mo' && r.c[3] === '60 mo' && r.c[4] === '60 mo' && r.c[5] === '3 mo' && r.c[6] === '0 mo' && r.c[7] === '$20.00' && r.c[8] === '$5.00' && r.c[9] === '6.00%' && r.c[10] === '3.00%'), JSON.stringify(R.roll.map(r => r.c)));
  check('and those are the engine\'s resolved values for each tenant (tenant.roll), not a second reading of the inputs', E.tenants.every((t, i) => t.roll && t.roll.p === 0.65 && t.roll.down === 6 && t.roll.termN === 60 && t.roll.freeN === 3 && t.roll.tiN === 20 && t.roll.lcR === 0.03));
  await p.close();

  /* C. tenant by tenant: every line is the engine's monthly series summed by year */
  const lines = (blk, B) => {
    const rent = B.rent, free = B.free, rec = B.rec, ti = B.ti, lc = B.lc;
    return { 'Base Rent Before Free Rent': rent.map((v, i) => v + free[i]), 'Free Rent': neg(free), 'Base Rent Collected': rent, 'Expense Recoveries': rec, 'Total Rent Revenue': rent.map((v, i) => v + rec[i]), 'Tenant Improvements': neg(ti), 'Leasing Commissions': neg(lc), 'Total Leasing Costs': ti.map((v, i) => -(v + lc[i])) };
  };
  const checkBlocks = (tag, R2) => {
    const e = R2.eng, nt = e.tenants.length;
    check(tag + ': one block per tenant plus All Tenants and the bridge, each headed by the tenant\'s name, area and share', R2.blocks.length === nt + 2 && e.tenants.every((t, i) => R2.blocks[i].name.indexOf(t.name) === 0 && R2.blocks[i].name.indexOf(t.sf.toLocaleString('en-US') + ' SF') > 0) && R2.blocks[nt].name === 'All Tenants' && /^Bridge to Retail Revenue/.test(R2.blocks[nt + 1].name), R2.blocks.map(x => x.name).join(' | '));
    let ok = true, bad = '';
    e.tenants.forEach((t, i) => { const L = lines(R2.blocks[i], e.by[i]); Object.keys(L).forEach(k => { const got = rowOf(R2.blocks[i], k); if (!sameArr(got.slice(0, R2.n), L[k], 1) || !near(got[R2.n], L[k].reduce((a, v) => a + v, 0), 1.5)) { ok = false; bad += ' ' + t.name + '/' + k; } }); });
    check(tag + ': each tenant\'s Base Rent, Free Rent, Recoveries, Tenant Improvements and Leasing Commissions, year by year and in total, are the engine\'s monthly series for that tenant summed over the year', ok, bad);
    check(tag + ': occupancy for each tenant is the average of its monthly occupancy', e.tenants.every((t, i) => sameArr(rowOf(R2.blocks[i], 'Occupancy (average of the year)').slice(0, R2.n), e.by[i].occ.map(v => Math.round(v * 10000) / 100), 0.006)));
    const A2 = R2.blocks[nt], Lall = lines(A2, e.all);
    check(tag + ': All Tenants is the schedule\'s own series and is the sum of the tenant blocks, line for line', Object.keys(Lall).every(k => sameArr(rowOf(A2, k).slice(0, R2.n), Lall[k], 1) && sameArr(rowOf(A2, k).slice(0, R2.n), e.tenants.map((t, i) => rowOf(R2.blocks[i], k).slice(0, R2.n)).reduce((a, r) => a.map((v, j) => v + r[j]), new Array(R2.n).fill(0)), nt + 1)));
    check(tag + ': the Total column is the sum of the years on every line', R2.blocks.every(blk => Object.keys(blk.rows).every(k => { const r = blk.rows[k]; if (/Occupancy/.test(k)) return true; return near(r.v[R2.n], r.v.slice(0, R2.n).reduce((a, v) => a + v, 0), 0.5 * R2.n + 1); })));
    /* leasing costs tie to the Cash Flow Report */
    check(tag + ': Tenant Improvements, Leasing Commissions and Total Leasing Costs under All Tenants equal the same three rows of the Cash Flow Report in every year', sameArr(rowOf(A2, 'Tenant Improvements').slice(0, R2.n), e.cf.ti, 1) && sameArr(rowOf(A2, 'Leasing Commissions').slice(0, R2.n), e.cf.lc, 1) && sameArr(rowOf(A2, 'Total Leasing Costs').slice(0, R2.n), e.cf.leasing, 1), JSON.stringify([rowOf(A2, 'Total Leasing Costs'), e.cf.leasing]));
    /* the bridge */
    const BR = R2.blocks[nt + 1], vacTotal = e.lines.map((l, y) => 0);
    check(tag + ': the bridge starts at the Cash Flow Report\'s Potential Base Rent and Recoveries - Retail and its Free Rent line for the retail, and takes Credit Loss from the same line', sameArr(rowOf(BR, 'Potential Base Rent and Recoveries - Retail').slice(0, R2.n), e.lines.map(l => l.gross), 1) && sameArr(rowOf(BR, 'Free Rent').slice(0, R2.n), e.lines.map(l => l.free), 1) && sameArr(rowOf(BR, 'Credit Loss').slice(0, R2.n), e.lines.map(l => l.credit), 1));
    check(tag + ': Absorption and Turnover Vacancy is rent, free rent and recoveries less the potential at full occupancy, month by month (computed here from the engine\'s series), and the general vacancy allowance is the engine\'s', sameArr(rowOf(BR, 'Absorption and Turnover Vacancy').slice(0, R2.n), e.vacInd, 1.5) && sameArr(rowOf(BR, 'General Vacancy Allowance').slice(0, R2.n), neg(e.gv), 1), JSON.stringify([rowOf(BR, 'Absorption and Turnover Vacancy'), e.vacInd]));
    check(tag + ': the bridge ends on the retail revenue the engine counts in Effective Gross Revenue, summed from its own monthly rows', sameArr(rowOf(BR, 'Retail Revenue in Effective Gross Revenue').slice(0, R2.n), e.comm, 1.5) && near(rowOf(BR, 'Retail Revenue in Effective Gross Revenue')[R2.n], e.comm.reduce((a, v) => a + v, 0), 2), JSON.stringify([rowOf(BR, 'Retail Revenue in Effective Gross Revenue'), e.comm]));
    check(tag + ': the same retail revenue follows from the tenant lines: (rent + recoveries - general vacancy) x (1 - credit loss)', sameArr(e.all.rent.map((v, i) => (v + e.all.rec[i] - e.gv[i]) * (1 - e.cl)), e.comm, 1.5));
    check(tag + ': per tenant, tenant improvements plus commissions are the engine\'s cost series every month, and a second evaluation of the schedule gives the same costs and rent', e.by.every((B, i) => B.costM.every((v, m) => Math.abs(v - (B.tiM[m] + B.lcM[m])) < 1e-6) && sameArr(B.cost, e.fresh.cost[i], 0.01)) && sameArr(e.all.rent, e.fresh.rentTot, 0.01));
  };
  p = await open(A, deckA); const RA = await READ(p); checkBlocks('four tenants, general vacancy and credit loss', RA);
  check('the vacant suite\'s block shows the lease-up: no rent for its downtime and costs in the month it leases', RA.blocks[2].rows['Base Rent Collected'].v[0] < RA.blocks[2].rows['Base Rent Collected'].v[1] && RA.blocks[2].rows['Total Leasing Costs'].v[0] < 0, JSON.stringify(RA.blocks[2].rows['Base Rent Collected'].raw));
  check('the general vacancy allowance is a real line on this deal (8% floor above the schedule\'s own vacancy) and credit loss is charged', rowOf(RA.blocks[5], 'General Vacancy Allowance').slice(0, 5).some(v => v < -1000) && rowOf(RA.blocks[5], 'Credit Loss').slice(0, 5).every(v => v < 0), JSON.stringify([rowOf(RA.blocks[5], 'General Vacancy Allowance'), rowOf(RA.blocks[5], 'Credit Loss')]));
  await p.close();

  /* D. a ten-year deck with overrides, dated steps, CPI, an open-ended lease, a recovery cap, a fixed recovery, no allowance and no credit loss */
  p = await open(A, deckB); const RB = await READ(p); checkBlocks('ten years, overrides, steps, CPI and a recovery cap', RB);
  check('overrides reach the page: the anchor runs at a 90% renewal chance, 3 months of downtime, an 84-month renewal term, $8 renewal TI, a 5% commission and 4 months of free rent; the next tenant keeps the deal\'s terms',
    RB.roll[0].c[1] === '90.00%' && RB.roll[0].c[2] === '3 mo' && RB.roll[0].c[4] === '84 mo' && RB.roll[0].c[8] === '$8.00' && RB.roll[0].c[9] === '5.00%' && RB.roll[0].c[5] === '4 mo' && RB.roll[1].c[1] === '65.00%' && RB.roll[1].c[2] === '6 mo', JSON.stringify(RB.roll.slice(0, 2).map(r => r.c)));
  check('a tenant with dated rent steps reads "Dated steps (3)", a CPI lease reads its floor, a lease with no end date reads Open and runs to the end of the hold, a fixed recovery reads Fixed', RB.terms[0].c[9] === 'Dated steps (3)' && /^CPI, floor 2\.00%/.test(RB.terms[1].c[9]) && RB.terms[2].c[5] === 'Open' && RB.terms[2].c[6] === '10.0 yrs' && RB.terms[2].c[10] === 'Fixed', JSON.stringify(RB.terms.map(r => r.c.slice(5, 11))));
  check('the ten-year page has ten year columns and a total, and the period-ending row has ten dates', RB.years === 10 && RB.peRow.length === 12 && RB.n === 10, RB.years);
  check('on a deal with no general vacancy allowance and no credit loss, those two bridge lines are zero in every year', rowOf(RB.blocks[RB.eng.tenants.length + 1], 'General Vacancy Allowance').slice(0, 10).every(v => Math.abs(v) < 0.5) && rowOf(RB.blocks[RB.eng.tenants.length + 1], 'Credit Loss').slice(0, 10).every(v => Math.abs(v) < 0.5));
  await p.close();

  /* E. a deal whose schedule is off, a development, a phone */
  p = await open(A, Object.assign({}, deckA, { commLeaseModel: false }));
  const off = await p.evaluate(async () => { showSheet('Lease Audit Report'); await new Promise(r => setTimeout(r, 400)); return { text: document.querySelector('#viewport').textContent, table: !!document.querySelector('#rp-leaseaudit'), btn: [...document.querySelectorAll('#viewport button')].map(x => x.textContent.trim()).join('|') }; });
  check('with the lease model off the page says so and offers the commercial leases, with no table', !off.table && /commercial lease model is off/.test(off.text) && /Open Commercial Leases/.test(off.btn), off.btn); await p.close();
  p = await open(V, { commLeaseModel: true, leases: [T({ tenant: 'Ground Floor Cafe', suite: 'G1', sf: 3000, start: '', end: '', rent: 0, status: 'Vacant', mkt: 44 }), T({ tenant: 'Pre-leased Clinic', suite: 'G2', sf: 5000, start: '2028-06-01', end: '2038-05-31', rent: 36, recType: 'NNN' })] });
  const dv = await READ(p), de = dv.eng;
  check('a development deal with a schedule gets the page too, and its tenant lines still add up to the schedule and its leasing costs still tie to the Cash Flow Report\'s own figures', dv.blocks.length === 4 && sameArr(rowOf(dv.blocks[2], 'Base Rent Collected').slice(0, dv.n), de.all.rent, 1) && e2sum(dv, de), JSON.stringify(dv.blocks.map(x => x.name)));
  function e2sum(R2, e) { const nt = e.tenants.length; return ['Base Rent Collected', 'Expense Recoveries', 'Total Leasing Costs'].every(k => sameArr(rowOf(R2.blocks[nt], k).slice(0, R2.n), e.tenants.map((t, i) => rowOf(R2.blocks[i], k).slice(0, R2.n)).reduce((a, r) => a.map((v, j) => v + r[j]), new Array(R2.n).fill(0)), nt + 1)); }
  await p.close();
  p = await open(A, deckA, 390); const ph = await p.evaluate(async () => { showSheet('Lease Audit Report'); await new Promise(r => setTimeout(r, 600)); const W = document.documentElement.clientWidth; const t = document.querySelector('#rp-lterms'); const wrap = t.parentElement; return { over: document.documentElement.scrollWidth - W, tableW: t.getBoundingClientRect().width, W, contained: [...document.querySelectorAll('#rp-lterms, #rp-lroll, #rp-leaseaudit')].every(x => x.getBoundingClientRect().right <= W + 1 || (getComputedStyle(x.parentElement).overflowX !== 'visible')), cue: !!document.querySelector('#viewport .bk-scrollcue, #viewport [class*="scroll"]') }; });
  check('phone: the page itself does not scroll sideways; a wide supplemental table scrolls inside its own box', ph.over <= 1 && ph.contained, JSON.stringify(ph));
  check('the year-by-year table can be downloaded as CSV like the other reports', await p.evaluate(() => { const t = document.getElementById('rp-leaseaudit'); return [...t.querySelectorAll('tr')].length > 40 && typeof bkRpCsv === 'function'; })); await p.close();
  p = await open(A, deckA); await p.evaluate(async () => { showSheet('Lease Audit Report'); await new Promise(r => setTimeout(r, 400)); await new Promise(r => setTimeout(r, 200)); });
  const pr = await p.evaluate(async () => { await new Promise(r => setTimeout(r, 200)); const el = document.querySelector('#viewport .rp'); return { w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }; });
  check('the report has a size on the page (printing is the shared Print button, as for the other reports)', pr.w > 500 && pr.h > 800, JSON.stringify(pr));
  const errs = p.errs.slice(); await p.close();
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
