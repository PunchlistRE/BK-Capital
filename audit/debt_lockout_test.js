// Prepayment lockout, flag-only (owner-approved, November 2026). A lockout generally means the loan cannot be prepaid during the period. The model flags a modeled sale or refinance inside it, says it may be prohibited or
// restricted, names when the lockout ends and asks for the actual loan documents. It never prices a fee as if that made a locked-out prepayment permissible, never invents a cost, and says when an exit cost rests on terms that
// are not entered (a fallback or a zero) rather than on the loan's own provision.
//   node audit/debt_lockout_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 500) + ']' : '')); };
  const p = await (await b.newContext({ viewport: { width: 1300, height: 1000 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr|newyorkfed/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  await p.evaluate(a => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(a); }, A);
  const patch = (x) => p.evaluate((x) => { const s = bkLoad(); Object.assign(s, x); bkSave(s); }, x);
  const rule = (id) => p.evaluate((id) => { const c = bkConflicts().find(x => x.id === id); return c ? { level: c.level, msg: c.message, why: c.why } : null; }, id);
  const run = (o) => p.evaluate((o) => bkRunWith(o, () => { const d = bkDebt(), r = bkMonthlyReturns(); return JSON.stringify([d.loan, d.lifecycle.combined.map(z => [z.payment, z.principal, z.balance, z.fees]), r.irr, d.debtAtSale]); }), o);

  /* ---- a sale inside the lockout ---- */
  await patch({ debtTerm: 10, holdYears: 3, prepayType: 'Yield maintenance', prepayTreasury: 0.04, prepayLockoutMonths: 36, closing: '1/1/2027' });
  const s = await rule('debt.sale-in-lockout');
  check('a modeled sale inside the lockout is an ERROR that names the lockout\'s last day (the closing plus 36 months, less a day)', s && s.level === 'ERROR' && /months 1 to 36, through Dec 31, 2029/.test(s.msg), s && s.msg);
  check('it says the sale may be prohibited or restricted, that paying a fee does not by itself make a locked-out prepayment permissible, and that the model does not price that', /may be prohibited or restricted/.test(s.why) && /Paying a fee does not by itself make a locked-out prepayment permissible/.test(s.why) && /does not price that/.test(s.why), s && s.why.slice(0, 240));
  check('it requires review of the actual loan documents', /Review the actual loan documents/.test(s.why));
  const sm = await p.evaluate(() => bkPrepaySummary(bkLoad()));
  check('the maturity-and-sale line on the Debt page states the lockout, its last day and the review of the loan documents', /falls inside the lockout \(months 1 to 36, through Dec 31, 2029\)/.test(sm) && /review the loan documents/.test(sm), sm);
  const noClose = await p.evaluate(() => { const s = bkLoad(); s.closing = ''; return bkLockoutExpiry(s); });
  check('with no closing date it says the end of month 36 from closing, never an invented date', noClose === 'the end of month 36 from closing', noClose);

  /* ---- no cost is invented or removed by a lockout ---- */
  const l0 = await run({ prepayLockoutMonths: 0 }), l1 = await run({ prepayLockoutMonths: 36 }), l2 = await run({ prepayLockoutMonths: 120 });
  check('a lockout changes no number: no defeasance or fee is added, and none is dropped', l0 === l1 && l1 === l2);
  const lo = await run({ prepayType: 'Open', prepayLockoutMonths: 0 }), lo2 = await run({ prepayType: 'Open', prepayLockoutMonths: 36 });
  check('an open loan with a lockout adds no exit cost either', lo === lo2);

  /* ---- a refinance inside the lockout ---- */
  await patch({ holdYears: 5, prepayLockoutMonths: 48, debtTerm: 10 });
  await p.evaluate(() => bkRefiSet('year', 3));
  const r = await rule('debt.refi-in-lockout');
  check('a modeled refinance inside the lockout is flagged the same way (it repays the existing loan): ERROR, the last day, prohibited or restricted, review the documents', r && r.level === 'ERROR' && /refinance \(month 36\)/.test(r.msg) && /through Dec 31, 2030/.test(r.msg) && /may be prohibited or restricted/.test(r.why) && /Review the actual loan documents/.test(r.why), r && r.msg);
  await p.evaluate(() => bkRefiSet('year', 5));
  check('and not when the refinance is after the lockout', (await rule('debt.refi-in-lockout')) === null);

  /* ---- an exit cost only from the loan's own terms ---- */
  await patch({ prepayLockoutMonths: 0, holdYears: 5, debtTerm: 10 });
  const gap = async (x) => { await patch(Object.assign({ prepayType: 'Open', prepayPct: '', prepaySteps: '', prepayTreasury: '' }, x)); return rule('debt.prepay-terms-incomplete'); };
  const ym = await gap({ prepayType: 'Yield maintenance' }), df = await gap({ prepayType: 'Defeasance' }), sd = await gap({ prepayType: 'Step-down' }), fx = await gap({ prepayType: 'Fixed prepayment penalty' });
  check('yield maintenance or defeasance with no Treasury yield entered is flagged: the model falls back to the index, the published SOFR or 4%, which is not the loan\'s own provision', ym && df && /falls back to the index rate, else the published SOFR, else 4%/.test(ym.msg) && /Treasury yield/.test(ym.msg) && /not the loan's own/.test(ym.msg), ym && ym.msg);
  check('a step-down with no schedule, or a penalty with no percentage, is flagged: the exit cost is counted as zero', sd && /step-down schedule/.test(sd.msg) && /counted as zero/.test(sd.msg) && fx && /penalty percentage/.test(fx.msg) && /counted as zero/.test(fx.msg), JSON.stringify([sd && sd.msg, fx && fx.msg]));
  check('and says why it matters: an early payoff is priced only from the contractual provision, so the exit may be overstated; enter it from the loan documents', /priced only from the loan's contractual provision/.test(ym.why) && /Enter it from the loan documents/.test(ym.why));
  check('entered terms silence it, an open loan is never flagged, and nothing is flagged when the loan is repaid at maturity', (await gap({ prepayType: 'Yield maintenance', prepayTreasury: 0.04 })) === null && (await gap({ prepayType: 'Step-down', prepaySteps: '5,4,3,2,1' })) === null && (await gap({ prepayType: 'Open' })) === null && (await gap({ prepayType: 'Defeasance', holdYears: 10 })) === null);
  const t0 = await run({ prepayType: 'Yield maintenance', prepayTreasury: '' });
  check('flagging changes no number (the fallback pricing is as it always was)', t0 === (await run({ prepayType: 'Yield maintenance', prepayTreasury: '' })));

  /* ---- the debt lens carries the same flags ---- */
  await patch({ prepayType: 'Yield maintenance', prepayTreasury: '', prepayLockoutMonths: 0, holdYears: 5 });
  const lens = await p.evaluate(() => bkLens('debt').rows.find(r => r.label === 'Prepayment and exit costs'));
  check('the debt lens\'s prepayment row shows the incomplete-terms flag from the same Model Check', lens.status === 'look' && lens.rules.includes('debt.prepay-terms-incomplete'), JSON.stringify([lens.status, lens.rules]));
  check('no page errors', errs.length === 0, errs.join('|'));
  console.log('debt lockout: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
