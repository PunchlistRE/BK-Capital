// Debt refinements (owner-approved, November 2026):
//   1 loan purpose and lender type are two fields (a bank can lend for an acquisition or for construction); an earlier single "Loan type" is read as the two, and no number changes
//   2 partial interest only is defined: an interest-only period, then amortizing over a stated basis (the stated schedule, or the remaining term); the schedule says which months are which
//   3 a prepayment lockout (no voluntary prepayment) is its own term, distinct from the penalty / yield maintenance / defeasance, and the contractual maturity is not the modeled sale
//   node audit/debt_refinements_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 500) + ']' : '')); };
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr|newyorkfed/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  await p.evaluate(a => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(a); }, A);
  const run = (x) => p.evaluate(x => bkRunWith(x, () => { const d = bkDebt(), L = d.lifecycle.combined, r = bkMonthlyReturns(); return { loan: d.loan, rows: L.map(z => [z.payment, z.interest, z.principal, z.balance]), irr: r.irr, summary: bkRepaySummary(bkLoad()), prepay: bkPrepaySummary(bkLoad()), rate: L[0].annualRate, maturity: d.lifecycle.maturityMonth }; }), x);
  const rules = () => p.evaluate(() => bkConflicts().map(c => c.level + ':' + c.id));
  const pmt = (r, n, pv) => r === 0 ? pv / n : pv * r / (1 - Math.pow(1 + r, -n));

  /* ---- 1 loan purpose and lender type ---- */
  const pg = await p.evaluate(async () => { showSheet('Deal Underwrite'); await new Promise(r => setTimeout(r, 500)); const sel = k => { const tr = document.querySelector('#viewport tr[data-bk-key="' + k + '"] select'); return tr ? [...tr.options].map(o => o.value).filter(Boolean) : null; }; return { P: sel('loanPurpose'), L: sel('lenderType'), old: !!document.querySelector('#viewport tr[data-bk-key="loanType"]') }; });
  check('the Deal Underwrite page has two selects, Loan purpose and Lender type, in place of the single Loan type', pg.P && pg.L && !pg.old, JSON.stringify([pg.P, pg.L]));
  check('purposes are about what the money is for (acquisition, refinance, construction, bridge, permanent) and lenders are about who lends (bank, credit union, agency, debt fund, private lender, seller financing)', ['Acquisition', 'Refinance', 'Construction', 'Bridge', 'Permanent / Term'].every(x => pg.P.includes(x)) && ['Bank', 'Credit union', 'Debt fund', 'Private lender / hard money', 'Seller financing'].every(x => pg.L.includes(x)) && pg.P.every(x => !pg.L.includes(x)) && !pg.L.some(x => /^(Bridge|Construction|Refinance|Acquisition)$/.test(x)), JSON.stringify([pg.P.length, pg.L.length]));
  await p.evaluate(() => { const s = bkLoad(); s.loanPurpose = 'Construction'; s.lenderType = 'Bank'; bkSave(s); showSheet('Deal Underwrite'); });
  const a1 = await p.evaluate(() => [bkLoanPurpose(bkLoad()), bkLenderType(bkLoad())]);
  await p.evaluate(() => { const s = bkLoad(); s.loanPurpose = 'Acquisition'; bkSave(s); });
  const a2 = await p.evaluate(() => [bkLoanPurpose(bkLoad()), bkLenderType(bkLoad())]);
  check('a bank can lend for construction or for an acquisition: changing the purpose leaves the lender alone', a1.join() === 'Construction,Bank' && a2.join() === 'Acquisition,Bank', JSON.stringify([a1, a2]));
  const typ = await p.evaluate(() => { const s = Object.assign(bkLoad(), { loanPurpose: 'Acquisition', lenderType: 'Agency (Fannie Mae / Freddie Mac)' }); const t = k => bkLoanTypeTypical(s, k); return { rate: t('debtRateType'), prepay: t('prepayType'), recourse: t('recourse'), term: t('debtTerm'), repay: t('repayType'), label: bkLoanLabel(s) }; });
  check('typical terms combine the two: the lender supplies rate type, prepayment and recourse; the purpose supplies the structure (term, repayment)', typ.rate === 'Fixed' && typ.prepay === 'Yield maintenance' && typ.recourse === 'Non-recourse' && typ.term === 5 && typ.repay === 'Balloon' && typ.label === 'Acquisition loan, Agency (Fannie Mae / Freddie Mac)', JSON.stringify(typ));
  const base = await run({}), tagged = await run({ loanPurpose: 'Refinance', lenderType: 'Life company' });
  check('choosing a purpose and a lender changes no calculation (they describe the loan and suggest terms)', JSON.stringify(base.rows) === JSON.stringify(tagged.rows) && base.irr === tagged.irr);
  const legacy = [['Agency', '', 'Agency (Fannie Mae / Freddie Mac)'], ['Bridge', 'Bridge', ''], ['Bank / Credit Union', '', 'Bank'], ['Hard Money', '', 'Private lender / hard money'], ['Construction-to-Permanent', 'Construction-to-Permanent', '']];
  for (const [lt, wp, wl] of legacy) {
    const r = await p.evaluate(async (lt) => { const s = bkLoad(); delete s.loanPurpose; delete s.lenderType; s.loanType = lt; bkSave(s); const before = bkMonthlyReturns().irr; showSheet('Deal Underwrite'); await new Promise(r => setTimeout(r, 400)); const x = bkLoad(); return { p: bkLoanPurpose(x), l: bkLenderType(x), sp: x.loanPurpose || '', sl: x.lenderType || '', before, after: bkMonthlyReturns().irr, shown: (document.querySelector('#viewport tr[data-bk-key="lenderType"] select') || {}).value + '|' + (document.querySelector('#viewport tr[data-bk-key="loanPurpose"] select') || {}).value }; }, lt);
    check('a deal saved with Loan type "' + lt + '" is read as purpose "' + wp + '" and lender "' + wl + '", shown on the page, and its returns do not move', r.p === wp && r.l === wl && r.sp === wp && r.sl === wl && r.before === r.after && r.shown === wl + '|' + wp, JSON.stringify(r));
  }
  await p.evaluate(() => { const s = bkLoad(); delete s.loanType; s.loanPurpose = ''; s.lenderType = ''; bkSave(s); });

  /* ---- 2 partial interest only ---- */
  const T = { debtEnabled: true, debtTerm: 10, holdYears: 10, acqIO: 2, acqAmort: 30, debtRateType: 'Fixed', acqRate: 0.06, debtDayCount: '30/360', prepayType: 'Open', debtExtUse: 0 };
  const thenAm = await run(Object.assign({}, T, { repayType: 'Interest only then amortizing' }));
  const legacyPartial = await run(Object.assign({}, T, { repayType: 'Partial interest only' }));
  check('a saved "Partial interest only" deal (no basis chosen) is calculated exactly as it always was: payment for payment the same as interest only then amortizing', JSON.stringify(legacyPartial.rows) === JSON.stringify(thenAm.rows) && legacyPartial.irr === thenAm.irr);
  const L0 = thenAm.loan, r = 0.06 / 12, io = 24;
  check('stated schedule: interest only for 24 months, then the payment of a 30-year amortization (independent PMT), and a balloon is left at maturity', thenAm.rows.slice(0, io).every(z => z[2] === 0 && Math.abs(z[0] - L0 * r) < 0.01) && Math.abs(thenAm.rows[io][0] - pmt(r, 360, L0)) < 0.01 && thenAm.rows[119][3] > L0 * 0.8, thenAm.rows[io][0].toFixed(2) + ' vs ' + pmt(r, 360, L0).toFixed(2));
  const remaining = await run(Object.assign({}, T, { repayType: 'Partial interest only', ioBasis: 'Remaining term' }));
  check('partial interest only over the remaining term: 24 months interest only, then the payment that pays the loan off by month 120 (independent PMT over 96 months), nothing left at maturity', remaining.rows.slice(0, io).every(z => z[2] === 0) && Math.abs(remaining.rows[io][0] - pmt(r, 96, remaining.loan)) < 0.01 && remaining.rows[119][3] < 1, remaining.rows[io][0].toFixed(2) + ' vs ' + pmt(r, 96, remaining.loan).toFixed(2) + ', balance ' + remaining.rows[119][3].toFixed(2) + ' (the loan is sized on its own payment, so it differs from the stated-schedule loan: ' + Math.round(remaining.loan) + ' vs ' + Math.round(L0) + ')');
  check('the IO and amortization periods are told apart in the schedule: months 1 to 24 interest only, amortizing from month 25', /Interest only for 2 years \(months 1 to 24\)/.test(remaining.summary) && /amortizing over 8 years from month 25/.test(remaining.summary) && /paid off by month 120/.test(remaining.summary) && /balloon is left at maturity \(month 120\)/.test(thenAm.summary), remaining.summary + ' || ' + thenAm.summary);
  await p.evaluate((x) => { const s = bkLoad(); Object.assign(s, x); bkSave(s); showSheet('Deal Underwrite'); }, Object.assign({}, T, { repayType: 'Partial interest only', ioBasis: 'Remaining term' }));
  await p.waitForTimeout(500);
  const ui = await p.evaluate(() => ({ basis: !!document.querySelector('#viewport tr[data-bk-key="ioBasis"] select'), io: !!document.querySelector('#viewport tr[data-bk-key="acqIO"]'), txt: [...document.querySelectorAll('#viewport tr')].filter(t => /Payment schedule/.test(t.innerText)).map(t => t.innerText.replace(/\s+/g, ' ')).join('|') }));
  check('the repayment group asks for the interest-only period and what the rest amortizes over, and shows the payment schedule', ui.basis && ui.io && /Interest only for 2 years/.test(ui.txt), ui.txt.slice(0, 200));
  await p.evaluate(() => { const s = bkLoad(); s.acqIO = 0; bkSave(s); }); const r1 = await rules();
  check('partial interest only with no interest-only period is flagged', r1.includes('WARN:debt.partial-io-no-period'), r1.join());
  await p.evaluate(() => { const s = bkLoad(); s.acqIO = 12; bkSave(s); }); const r2 = await rules();
  check('an interest-only period as long as the term is flagged (nothing amortizes)', r2.includes('WARN:debt.io-covers-term'), r2.join());
  await p.evaluate(() => { const s = bkLoad(); s.acqIO = 2; s.ioBasis = ''; bkSave(s); }); const r3 = await rules();
  check('a partial interest-only loan that does not say what it amortizes over is flagged (the stated schedule is used)', r3.includes('INFO:debt.partial-io-basis') && !r3.includes('WARN:debt.io-covers-term'), r3.join());

  /* ---- 3 lockout, penalty, maturity and sale ---- */
  const lk0 = await run({ debtEnabled: true, debtTerm: 10, holdYears: 5, prepayType: 'Yield maintenance', prepayTreasury: 0.04 });
  const lk1 = await run({ debtEnabled: true, debtTerm: 10, holdYears: 5, prepayType: 'Yield maintenance', prepayTreasury: 0.04, prepayLockoutMonths: 24 });
  check('a lockout is not a penalty: it changes no number (the premium after the lockout is the yield maintenance it always was)', JSON.stringify(lk0.rows) === JSON.stringify(lk1.rows) && lk0.irr === lk1.irr);
  const sale = async (x) => { await p.evaluate((x) => { const s = bkLoad(); Object.assign(s, { debtEnabled: true, debtTerm: 10, prepayType: 'Yield maintenance' }, x); bkSave(s); }, x); return { r: await rules(), t: await p.evaluate(() => bkPrepaySummary(bkLoad())) }; };
  const inside = await sale({ holdYears: 3, prepayLockoutMonths: 36 }), after = await sale({ holdYears: 5, prepayLockoutMonths: 36 }), atMat = await sale({ holdYears: 10, prepayLockoutMonths: 36 }), none = await sale({ holdYears: 3, prepayLockoutMonths: 0 });
  check('a modeled sale inside the lockout is an ERROR: the loan cannot be prepaid then, and the model says it does not price that', inside.r.includes('ERROR:debt.sale-in-lockout') && /falls inside the lockout \(months 1 to 36\)/.test(inside.t) && /does not price that/.test(inside.t), inside.t);
  check('a sale after the lockout is not flagged, and the summary names the lockout end and the prepayment terms', !after.r.includes('ERROR:debt.sale-in-lockout') && /matures in month 120; the modeled sale is in month 60/.test(after.t) && /after the lockout ended in month 36/.test(after.t) && /yield maintenance applies/.test(after.t), after.t);
  check('a sale at maturity needs no prepayment, and with no lockout nothing is flagged', !atMat.r.includes('ERROR:debt.sale-in-lockout') && /no prepayment terms apply/.test(atMat.t) && !none.r.includes('ERROR:debt.sale-in-lockout'), atMat.t + ' / ' + none.t);
  const ed = await p.evaluate(async () => { const s = bkLoad(); s.holdYears = 5; s.prepayLockoutMonths = 24; bkSave(s); showSheet('Deal Underwrite'); await new Promise(r => setTimeout(r, 500)); return { lock: !!document.querySelector('#viewport tr[data-bk-key="prepayLockoutMonths"]'), pen: !!document.querySelector('#viewport tr[data-bk-key="prepayType"]'), txt: [...document.querySelectorAll('#viewport tr')].filter(t => /Maturity and the modeled sale/.test(t.innerText)).map(t => t.innerText.replace(/\s+/g, ' ')).join('|') }; });
  check('the page keeps the lockout, the prepayment type and the maturity-versus-sale line as separate rows', ed.lock && ed.pen && /matures in month 120; the modeled sale is in month 60/.test(ed.txt), ed.txt.slice(0, 200));
  const reg = await p.evaluate(() => ['loanPurpose', 'lenderType', 'ioBasis', 'prepayLockoutMonths'].map(k => !!BKReg.field(k)).join());
  check('the registry knows the new inputs (the guide and the Inputs index list them)', reg === 'true,true,true,true', reg);
  check('no page errors', errs.length === 0, errs.join('|'));
  console.log('debt refinements: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
