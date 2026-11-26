// Debt structure: loan type, rate structure (fixed, fixed SOFR-based, floating), repayment and terms, covenants, all calculated by the one debt engine.
//   node audit/debt_structure_test.js [index.html]
// The New York Fed rates API is answered with fixed figures (SOFR 3.94%, effective 2026-11-25), so the test does not depend on the network.
const { chromium } = require('playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
const html = path.resolve(process.argv[2] || 'index.html');
let n = 0, fails = 0; const check = (name, ok, detail) => { n++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : '')); };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort());
  await p.route(/newyorkfed/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: /sofrai/.test(r.request().url()) ? JSON.stringify({ refRates: [{ effectiveDate: '2026-11-25', average30day: 4.02, average90day: 4.10, average180day: 4.18 }] }) : JSON.stringify({ refRates: [{ effectiveDate: '2026-11-25', type: 'SOFR', percentRate: 3.94 }] }) }));
  await p.goto('file://' + html); await p.waitForTimeout(700);
  await p.evaluate(A => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(A); }, A);
  const run = (x) => p.evaluate(x => { const base = bkLoad(); return bkRunWith(x, () => { const d = bkDebt(), L = d.lifecycle, r = bkMonthlyReturns(); return { loan: d.loan, coupon: d.coupon, fee: d.fee, pmt: d.pmt, m1: L.combined[0], rows: L.combined.map(z => [z.annualRate, z.interest, z.principal, z.balance]), sale: d.debtAtSale, maturity: L.maturityMonth, costs: L.costNotes, irr: r.irr, cfLast: r.rows[r.rows.length - 1].cf, loanCost: r.rows.reduce((a, z) => a + (z.loanCost || 0), 0) }; }); }, x);

  /* 1. a deal that sets none of the new terms is calculated exactly as before */
  const base = await run({}), same = await run({ loanType: 'Acquisition', recourse: 'Non-recourse', debtCovenants: 'none', debtLookbackDays: 5 });
  check('descriptive terms (loan type, recourse, covenants, lookback) never change the calculation', base.loan === same.loan && base.irr === same.irr && base.pmt === same.pmt, [base.irr, same.irr]);
  const balloon = await run({ repayType: 'Balloon' });
  check('Balloon with no interest-only years is the loan as calculated before', balloon.irr === base.irr && balloon.pmt === base.pmt);

  /* 2. rate structures */
  await p.evaluate(() => { const s = bkLoad(); Object.assign(s, { debtRateType: 'Fixed (SOFR-based)', debtIndexRate: 0.0394, debtSpread: 0.0175 }); bkSave(s); });
  const lock = await p.evaluate(() => ({ r: bkLoad().acqRate, c: bkDebt().coupon }));
  check('Fixed rate (SOFR-based): the coupon is SOFR at the lock plus the spread (3.94% + 1.75% = 5.69%), kept in the fixed-rate field every page reads', Math.abs(lock.r - 0.0569) < 1e-9 && Math.abs(lock.c - 0.0569) < 1e-9, lock);
  await p.evaluate(() => { const s = bkLoad(); s.debtFloor = 0.06; bkSave(s); });
  check('a coupon floor above SOFR + spread sets the fixed coupon', Math.abs(await p.evaluate(() => bkLoad().acqRate) - 0.06) < 1e-9);
  await p.evaluate(A => bkCreateNewDeal(A), A);
  const fl = await run({ debtRateType: 'Floating', debtIndexName: 'SOFR', debtIndexRate: 0.04, debtSpread: 0.025, debtResetMonths: 6, debtIndexDrift: 0.005 });
  check('Floating: month 1 is index + spread (6.50%)', Math.abs(fl.rows[0][0] - 0.065) < 1e-9, fl.rows[0][0]);
  check('Floating: later years follow the rate outlook (+0.50% a year), not today\'s rate', Math.abs(fl.rows[24][0] - 0.075) < 1e-9 && Math.abs(fl.rows[12][0] - 0.07) < 1e-9, [fl.rows[12][0], fl.rows[24][0]]);
  check('Floating: a 6-month reset holds each rate for six months', fl.rows.slice(12, 18).every(r => Math.abs(r[0] - fl.rows[12][0]) < 1e-12));
  const flr = await run({ debtRateType: 'Floating', debtIndexRate: 0.01, debtSpread: 0.025, debtIndexFloor: 0.02, rateCapStrike: 0.05, debtIndexDrift: 0.02 });
  check('Floating: the SOFR floor and the purchased cap bound the index (floor 2%, cap 5%)', Math.abs(flr.rows[0][0] - 0.045) < 1e-9 && Math.abs(flr.rows[48][0] - 0.075) < 1e-9, [flr.rows[0][0], flr.rows[48][0]]);
  const noIdx = await run({ debtRateType: 'Floating', debtSpread: 0.025, debtIndexRate: '' });
  check('Floating with no index entered yet keeps the last rate (it never prices at the spread alone)', Math.abs(noIdx.rows[0][0] - base.coupon) < 1e-9);

  /* 3. conventions and repayment */
  const a360 = await run({ debtDayCount: 'Actual/360' });
  check('Actual/360 accrues 365/360 of the quoted rate; the payment is unchanged, so less of it is principal', Math.abs(a360.m1.interest - base.m1.interest * 365 / 360) < 0.01 && Math.abs(a360.m1.payment - base.m1.payment) < 0.01 && a360.m1.principal < base.m1.principal, [base.m1.interest, a360.m1.interest]);
  const io = await run({ repayType: 'Interest only' });
  check('Interest only: no principal is ever repaid and the whole loan is owed at sale', io.rows.every(r => r[2] === 0) && Math.abs(io.sale - io.loan) < 1, [io.loan, io.sale]);
  const fa = await run({ repayType: 'Fully amortizing', debtTerm: 5 });
  check('Fully amortizing over a 5-year term: nothing is owed at the 5-year sale', fa.sale < 1, fa.sale);
  const pio = await run({ repayType: 'Partial interest only', acqIO: 2 });
  check('Partial interest only: interest only for two years, then amortizing', pio.rows.slice(0, 24).every(r => r[2] === 0) && pio.rows[24][2] > 0);

  /* 4. loan costs */
  const sd = await run({ debtTerm: 10, prepayType: 'Step-down', prepaySteps: '5,4,3,2,1' });
  const sdExp = base.sale * 0.01;
  check('Step-down 5-4-3-2-1: a sale in loan year 5 pays 1% of the balance, in the sale month, and the levered return falls', Math.abs(sd.loanCost - sdExp) < 1 && sd.costs.some(c => c.kind === 'prepayment premium' && c.m === 60) && sd.irr < base.irr, [sd.loanCost, sdExp]);
  const open = await run({ debtTerm: 10, prepayType: 'Step-down', prepaySteps: '5,4,3,2,1', prepayOpenMonths: 60 });
  check('no premium inside the open window before maturity', open.loanCost === 0);
  const ym = await run({ debtTerm: 10, prepayType: 'Yield maintenance', prepayTreasury: 0.07 });
  check('Yield maintenance with the Treasury above the coupon still charges the 1% minimum', Math.abs(ym.loanCost - base.sale * 0.01) < 1, ym.loanCost);
  const ym2 = await run({ debtTerm: 10, prepayType: 'Yield maintenance', prepayTreasury: 0.04 });
  check('Yield maintenance with the Treasury below the coupon is the present value of the rate difference (more than 1%)', ym2.loanCost > base.sale * 0.01, ym2.loanCost);
  const atMat = await run({ debtTerm: 5, prepayType: 'Step-down', prepaySteps: '5,4,3,2,1' });
  check('no prepayment premium when the loan is repaid at its maturity', atMat.loanCost === 0);
  const fees = await run({ debtCommitFeePct: 0.005, debtExitFeePct: 0.01 });
  check('commitment fee is paid at closing with the origination fee; exit fee is a percent of the balance repaid at sale', Math.abs(fees.fee - base.fee - base.loan * 0.005) < 1 && Math.abs(fees.loanCost - base.sale * 0.01) < 1, [fees.fee, fees.loanCost]);
  const ext = await run({ debtTerm: 3, debtExtCount: 2, debtExtMonths: 12, debtExtFeePct: 0.0025, debtExtUse: 1 });
  check('two 12-month extensions move a 3-year maturity to 5 years and charge 0.25% of the balance at each', ext.maturity === 60 && ext.costs.filter(c => c.kind === 'extension fee').length === 2, [ext.maturity, ext.costs]);
  const noExt = await run({ debtTerm: 3, debtExtCount: 2, debtExtMonths: 12, debtExtFeePct: 0.0025 });
  check('extensions that are not exercised change nothing', noExt.maturity === 36 && !noExt.costs.some(c => c.kind === 'extension fee'));
  const ioSize = await run({ repayType: 'Interest only', acqDSCR: 1.25, acqLTV: 0.9, acqLTC: 0 });
  const amSize = await run({ acqDSCR: 1.25, acqLTV: 0.9, acqLTC: 0 });
  check('an interest-only loan is sized on its interest-only payment, so the DSCR allows more', ioSize.loan > amSize.loan, [amSize.loan, ioSize.loan]);

  /* 5. the benchmark: published figure, provenance, override */
  await p.evaluate(A => { bkCreateNewDeal(A); const s = bkLoad(); Object.assign(s, { debtRateType: 'Floating', debtIndexName: 'SOFR', debtIndexTenor: 'Overnight SOFR', debtSpread: 0.0275 }); bkSave(s); }, A);
  await p.evaluate(() => bkSofrFetch(true)); await p.evaluate(() => bkSofrApply()); await p.waitForTimeout(300);
  const pv = await p.evaluate(() => { const s = bkLoad(); return { r: s.debtIndexRate, src: s.debtIndexSource, date: s.debtIndexDate, ovr: s.debtIndexOverride, all: bkAllInRate(s).rate }; });
  check('"Use the latest" records the published SOFR with its source and effective date; all-in = 3.94% + 2.75% = 6.69%', Math.abs(pv.r - 0.0394) < 1e-9 && /New York/.test(pv.src) && pv.date === '2026-11-25' && !pv.ovr && Math.abs(pv.all - 0.0669) < 1e-9, pv);
  await p.evaluate(() => { const s = bkLoad(); s.debtIndexRate = 0.041; bkSave(s); });
  const ov = await p.evaluate(() => { const s = bkLoad(); return { ovr: s.debtIndexOverride, on: s.debtIndexOverrideOn, pub: s._idxPublished }; });
  check('a rate typed over the published figure is recorded as an override with its date; the published figure stays on record', ov.ovr === 1 && /^\d{4}-\d\d-\d\d$/.test(ov.on) && Math.abs(ov.pub - 0.0394) < 1e-9, ov);
  check('Term SOFR is not offered as a published figure (it is licensed by CME)', await p.evaluate(() => bkSofrFor('1-month Term SOFR') === null && Math.abs(bkSofrFor('90-day SOFR average').rate - 0.041) < 1e-12));

  /* 6. the four groups on Deal Underwrite */
  await p.evaluate(() => showSheet('Deal Underwrite')); await p.waitForTimeout(800);
  const ui = await p.evaluate(() => { const caps = [...document.querySelectorAll('#viewport table caption')].map(c => c.textContent.trim()); const keys = [...document.querySelectorAll('#viewport [data-bk-key="debtTerm"]')].length;
    const card = (document.querySelector('.bk-ds-card') || {}).innerText || ''; return { caps, keys, card, old: caps.includes('Acquisition Debt'), fee: [...document.querySelectorAll('#viewport [data-bk-key="acqFeePct"]')].length }; });
  check('Deal Underwrite shows the four groups in place of the single Acquisition Debt table', ['Loan Type', 'Interest Rate Structure', 'Repayment & Loan Terms', 'Underwriting & Covenants'].every(c => ui.caps.includes(c)) && !ui.old, ui.caps.filter(c => /Loan|Rate|Repay|Underwriting/.test(c)));
  check('the loan term appears once, under Repayment & Loan Terms; the sponsor acquisition fee is kept', ui.keys === 1 && ui.fee === 1, [ui.keys, ui.fee]);
  check('the SOFR + spread card shows the index, spread, all-in rate, source and date, and that later months follow the outlook', /4\.10%/.test(ui.card) && /2\.75%/.test(ui.card) && /6\.85%/.test(ui.card) && /Manual override/.test(ui.card) && /3\.94%/.test(ui.card) && /outlook/.test(ui.card), ui.card.slice(0, 300));

  /* 7. the guide asks the right questions and sources the benchmark */
  await p.evaluate(A => { bkCreateNewDeal(A); bkGuideOn(); try { bkGuideDepth('standard'); } catch (e) {} bkGuideGo('debt'); }, A); await p.waitForTimeout(400);
  const g0 = await p.evaluate(() => [...document.querySelectorAll('[id^="gdf-"]')].map(e => e.id.slice(4)));
  await p.evaluate(() => { bkGuideDraft('loanType', 'Bridge'); bkGuideDraft('debtRateType', 'Floating'); }); await p.waitForTimeout(600);
  const g1 = await p.evaluate(() => ({ f: [...document.querySelectorAll('[id^="gdf-"]')].map(e => e.id.slice(4)), sug: [...document.querySelectorAll('.gd-sug[data-k]')].map(e => e.getAttribute('data-k') + '|' + e.textContent.replace(/\s+/g, ' ')) }));
  check('guide, fixed rate: asks the rate, not the index', g0.includes('acqRate') && !g0.includes('debtIndexRate'));
  check('guide, floating: the index, benchmark, rate and spread questions appear at once, and the fixed rate goes', ['debtIndexName', 'debtIndexTenor', 'debtIndexRate', 'debtSpread'].every(k => g1.f.includes(k)) && !g1.f.includes('acqRate'), g1.f);
  check('guide: suggests the latest published SOFR with its date and source, and the loan type\'s typical spread and repayment', g1.sug.some(x => /^debtIndexRate\|.*3\.94%.*2026-11-25.*New York/.test(x)) && g1.sug.some(x => /^debtSpread\|.*3\.50%.*Bridge/.test(x)) && g1.sug.some(x => /^repayType\|.*Interest only/.test(x)), g1.sug.map(x => x.slice(0, 80)));
  /* 8. capital stack: mezzanine and preferred equity between the senior loan and the common equity */
  const st = await p.evaluate(A => { bkCreateNewDeal(A); const d0 = bkDebt(), r0 = bkMonthlyReturns(), eq0 = d0.equity, loan0 = d0.loan; const s = bkLoad();
    Object.assign(s, { mezzCLTV: 0.75, mezzRate: 0.09, mezzPikRate: 0.02, mezzOrigFee: 0.01, prefAmount: 1000000, prefCurrentRate: 0.06, prefAccrualRate: 0.04, prefMinMultiple: 1.2 }); bkSave(s);
    const d = bkDebt(), K = d.stack, r = bkMonthlyReturns(), F = bkFundingSummary(), hold = K.rows.length, last = K.rows[hold - 1];
    const pik = K.rows.reduce((a, z) => a + z.mezzPik, 0), cur = K.rows.reduce((a, z) => a + z.mezzInterest, 0), prefCur = K.rows.reduce((a, z) => a + z.prefPaid, 0);
    bkDebt(); bkDebt(); bkFundingSummary(); bkFundingSummary();   /* repeated calls must not stack the adjustment twice (results are cached) */
    const d2 = bkDebt(), F2 = bkFundingSummary();
    return { loan0, eq0, loan: d.loan, ltvValue: d.ltvValue, mezz: K.mezz, fee: K.mezzFee, pref: K.pref, eq: d.equity, eq2: d2.equity, ts: F.totalSources, tu: F.totalUses, ts2: F2.totalSources, failed: (F.failed || []).map(t => t.id), srcs: F.sources.map(x => x[0]),
      mezzPayoff: last.mezzPayoff, pik, cur, prefRedeem: last.prefRedeem, prefCur, mezzPaid: r.rows.reduce((a, z) => a + z.mezzPaid, 0), prefPaid: r.rows.reduce((a, z) => a + z.prefPaid, 0), dscr: K.combinedDscr, senDscr: d.dscr, irr0: r0.irr, irr: r.irr, contrib: r.contrib }; }, A);
  check('mezzanine sized to a 75% combined LTV on the senior LTV value, rounded to $1,000; the senior loan is unchanged', st.loan === st.loan0 && Math.abs(st.mezz - Math.floor((0.75 * st.ltvValue - st.loan) / 1000) * 1000) < 1, [st.loan0, st.loan, st.mezz]);
  check('common equity is the basis less both loans and the preferred equity, plus the mezzanine fee; repeated calls do not apply it twice', Math.abs(st.eq - (st.eq0 + st.fee - st.mezz - st.pref)) < 1 && st.eq2 === st.eq && Math.abs(st.ts2 - st.ts) < 1, [st.eq0, st.eq, st.eq2]);
  check('Sources & Uses: senior loan, mezzanine, preferred and common equity; sources equal uses and every funding tie passes', st.srcs.join('|') === 'Acquisition Loan|Mezzanine Loan|Preferred Equity|Equity at closing' && Math.abs(st.ts - st.tu) < 1 && st.failed.length === 0, [st.srcs, st.ts, st.tu, st.failed]);
  check('mezzanine: current interest is paid monthly, the PIK accrues, and the balance with the PIK is repaid at the sale', Math.abs(st.mezzPayoff - st.mezz - st.pik) < 1 && Math.abs(st.mezzPaid - st.cur - st.mezzPayoff) < 1, [st.mezzPayoff, st.mezz, st.pik]);
  check('preferred equity: current return paid monthly; redeemed at the sale for the greater of capital plus the compounded accrual and the minimum multiple', st.prefRedeem >= st.pref && Math.abs(st.prefPaid - st.prefCur - st.prefRedeem) < 1 && st.prefRedeem >= 1.2 * st.pref - st.prefCur - 1, [st.prefRedeem, st.prefCur]);
  check('combined DSCR (senior plus mezzanine current pay) is below the senior DSCR', st.dscr > 0 && st.dscr < st.senDscr, [st.senDscr, st.dscr]);
  check('the common equity\'s contributions are its own (the returns see the smaller cheque)', Math.abs(st.contrib - st.eq) < 1 || st.contrib >= st.eq, [st.contrib, st.eq]);
  await p.evaluate(() => showSheet('Deal Underwrite')); await p.waitForTimeout(700);
  check('Deal Underwrite shows the Mezzanine & Preferred Equity group with the capital stack', await p.evaluate(() => [...document.querySelectorAll('#viewport caption')].some(c => /Mezzanine & Preferred Equity/.test(c.textContent)) && /Capital stack at closing/.test(document.getElementById('viewport').innerText)));
  await p.evaluate(() => showSheet('Sources & Uses')); await p.waitForTimeout(700);
  check('the Sources & Uses page lists the mezzanine loan and preferred equity and its sources total the uses', await p.evaluate(() => { const t = document.getElementById('viewport').innerText; return /Mezzanine Loan/.test(t) && /Preferred Equity/.test(t) && /Mezzanine Origination Fee/.test(t) && !/Does not tie/i.test(t); }));
  check('no page errors', errs.length === 0, errs.slice(0, 2));
  console.log('debt structure: ' + n + ' checks, ' + fails + ' failures');
  await b.close(); process.exit(fails ? 1 : 0);
})();
