// Valuation engine (src/202): PV, NPV, FV, break-even rate and the maximum supportable purchase price, over the deal's own dated monthly cash flows.
// Pure functions first (hand-computed values, leap year, invalid rates); then the deal level: Property NPV is zero at the unleveraged IRR, Equity NPV is zero at the levered IRR,
// the leveraged PV never includes the opening loan, a debt-free deal with no disposition fee has equal property and equity values, and the maximum supportable price is the price at which
// NPV is zero with the WHOLE deal re-run at that price (loan, closing equity and costs move with it), compared with a brute-force price scan.
//   node audit/valuation_engine_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), B = require(path.join(__dirname, 'dealB.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 380) + ']' : '')); };
  const open = async (deal, over) => { const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate(([d, o]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d, o || {}); bkSave(s); }, [deal, over]); return p; };
  const near = (a, c, tol) => a != null && c != null && isFinite(a) && isFinite(c) && Math.abs(a - c) <= (tol == null ? 1 : tol);

  let p = await open(A);
  /* ---- pure functions ---- */
  const pure = await p.evaluate(() => {
    const fl = [{ date: '2027-12-31', amount: 500 }, { date: '2028-12-31', amount: 500 }], d0 = '2027-01-01';
    const hand = 500 / Math.pow(1.08, 364 / 365) + 500 / Math.pow(1.08, 730 / 365);
    const leap = bkValDiscount(100, '2028-12-31', '2027-12-31', 0.1) * Math.pow(1.1, 366 / 365);
    const T = '2029-06-30', fv = bkValFV(fl, d0, T, 0.08, 800), pv = bkValPV(fl, d0, 0.08);
    let thrown = false, bad; try { bad = [bkValPV(fl, d0, -1), bkValPV(fl, d0, NaN), bkValNPV(fl, d0, -2, 5)]; } catch (e) { thrown = true; }
    const late = bkValFV(fl, d0, '2028-06-30', 0.08, 0);
    return { pv: bkValPV(fl, d0, 0.08), hand, zero: bkValPV(fl, d0, 0), npv: bkValNPV(fl, d0, 0.08, 800), leap, fv: fv.fv, fvFromPv: pv * Math.pow(1.08, 545 / 365 * 1 + 0) , fvDays: (Date.UTC(2029, 5, 30) - Date.UTC(2027, 0, 1)) / 86400000, pvFor: pv, cagr: bkValCagr(250000, 1000000, 10), cagrBad: [bkValCagr(0, 1, 1), bkValCagr(1, 0, 1), bkValCagr(1, 1, 0)], thrown, bad, late };
  });
  check('PV of dated flows = the sum of flow / (1 + r)^(days / 365) from the valuation date (hand computed at 8%), and 0% gives the plain sum', near(pure.pv, pure.hand, 1e-6) && near(pure.zero, 1000, 1e-9), JSON.stringify([pure.pv, pure.hand]));
  check('NPV = PV less the initial investment', near(pure.npv, pure.hand - 800, 1e-6));
  check('a leap year is 366 days (2028): discounting then accumulating over it returns the amount', near(pure.leap, 100, 1e-9), pure.leap);
  check('FV accumulates every flow to the target date; the FV of a stream equals its PV accumulated over the valuation-to-target days when no flow is after the target', near(pure.fv, pure.pvFor * Math.pow(1.08, pure.fvDays / 365), 1e-6), JSON.stringify([pure.fv, pure.pvFor * Math.pow(1.08, pure.fvDays / 365)]));
  check('a flow dated after the FV target date is left out and counted, not silently accumulated backward', pure.late.excluded === 1 && near(pure.late.fv, 500 * Math.pow(1.08, (Date.UTC(2028, 5, 30) - Date.UTC(2027, 11, 31)) / 86400000 / 365), 1e-6), JSON.stringify(pure.late));
  check('CAGR = (target / start)^(1 / years) - 1; zero or negative capital, target or years give NaN, never a throw', near(pure.cagr, Math.pow(4, 0.1) - 1, 1e-12) && pure.cagrBad.every(Number.isNaN), JSON.stringify([pure.cagr, pure.cagrBad]));
  check('an impossible rate (at or below -100%, or not a number) gives NaN and does not throw', !pure.thrown && pure.bad.every(Number.isNaN), JSON.stringify(pure.bad));

  /* ---- the deal level ---- */
  const D = await p.evaluate(() => { const f = bkValDealFlows(), ac = bkAnnualCF(), mr = bkMonthlyReturns(), d = bkDebt(), rate = 0.0875, v = bkValuate({ rate });
    const d0 = new Date(ac.acqDate), dates = [d0].concat(ac.monthly.map((m, i) => bkMonthEnd(d0, i + 1))), valsL = [0].concat(mr.rows.map(r => r.cf + r.eqDraw));
    const valsU = [0].concat(f.unlevered.slice(0, -1).map(x => x.amount)); valsU[valsU.length - 1] += f.netSale;
    const be = [bkValBreakEvenRate('property'), bkValBreakEvenRate('equity')], vi = bkValuate({ rate: ac.irr, equityRate: mr.irr, accumRate: mr.irr }), vu = bkValuate({ rate: ac.irr, accumRate: ac.irr });
    return { f: { n: f.unlevered.length, basis: f.basis, eq: f.closingEquity, loan: f.loan, vd: f.valuationDate, sd: f.saleDate }, v, xl: bkXnpv(rate, valsL, dates), xu: bkXnpv(rate, valsU, dates), be, irr: [ac.irr, mr.irr], vi, vu, rpt: bkRpNpv(rate) + f.basis, dbasis: -ac.initial, deq: d.equity, dloan: d.loan }; });
  check('the dated flows are the deal\'s own monthly schedule: one flow per month of the hold plus the sale, from the valuation date', D.f.n === 61 && D.f.vd === '2027-01-01' && D.f.sd === '2031-12-31', JSON.stringify(D.f));
  check('Unleveraged PV = the engine\'s XNPV of the property cash flows and the Valuation Report\'s present value at the same rate; Leveraged PV = XNPV of the equity cash flows with NO loan added', near(D.v.unleveragedPV, D.xu, 1) && near(D.v.unleveragedPV, D.rpt, 1) && near(D.v.leveragedPV, D.xl, 1), JSON.stringify([D.v.unleveragedPV, D.xu, D.rpt, D.v.leveragedPV, D.xl]));
  check('Property NPV = unleveraged PV less the acquisition basis; Equity NPV = leveraged PV less the closing equity (the loan is in neither)', near(D.v.propertyNPV, D.v.unleveragedPV - D.dbasis, 1e-6) && near(D.v.equityNPV, D.v.leveragedPV - D.deq, 1e-6) && D.f.loan > 1e6 && Math.abs(D.v.leveragedPV - (D.xl + D.f.loan)) > 1e6, JSON.stringify([D.v.propertyNPV, D.v.equityNPV, D.f.loan]));
  check('Property NPV is zero at the unleveraged IRR and Equity NPV is zero at the levered IRR (break-even rates equal the engine\'s IRRs)', near(D.be[0], D.irr[0], 2e-5) && near(D.be[1], D.irr[1], 2e-5), JSON.stringify([D.be, D.irr]));
  check('FV: accumulating at the levered IRR, the equity FV net of the equity invested is zero; accumulating at the unleveraged IRR, the property FV net of the basis is zero (the same condition as NPV = 0)', near(D.vi.fvEquityNet, 0, 25) && near(D.vu.fvUnleveredNet, 0, 25), JSON.stringify([D.vi.fvEquityNet, D.vu.fvUnleveredNet]));
  check('a higher discount rate lowers every present value and NPV', await p.evaluate(() => { const a = bkValuate({ rate: 0.07 }), c = bkValuate({ rate: 0.10 }); return a.unleveragedPV > c.unleveragedPV && a.leveragedPV > c.leveragedPV && a.propertyNPV > c.propertyNPV && a.equityNPV > c.equityNPV; }));
  check('a bad rate gives NaN results and does not throw', await p.evaluate(() => { try { const v = bkValuate({ rate: -1.5 }); return Number.isNaN(v.unleveragedPV) && Number.isNaN(v.equityNPV); } catch (e) { return false; } }));

  /* ---- no debt, no disposition fee: property and equity values are the same thing ---- */
  await p.close(); p = await open(A, { debtEnabled: false, dispositionFeePct: 0 });
  const Z = await p.evaluate(() => { const v = bkValuate({ rate: 0.08 }), f = bkValDealFlows(), mr = bkMonthlyReturns(), d0 = f.valuationDate; let fees = 0; mr.rows.forEach((r, i) => { fees += bkValDiscount(r.assetFee, bkMonthEnd(new Date(d0 + 'T00:00:00'), i + 1), new Date(d0 + 'T00:00:00'), 0.08); }); return { v, f, fees }; });
  check('debt off and no disposition fee: closing equity = acquisition basis, and the only gap between Unleveraged PV and Leveraged PV is the present value of the asset management fee (an equity-level cost, not a property cost); Equity NPV = Property NPV less that fee', near(Z.f.closingEquity, Z.f.basis, 1) && Z.fees > 1000 && near(Z.v.unleveragedPV - Z.v.leveragedPV, Z.fees, 2) && near(Z.v.propertyNPV - Z.v.equityNPV, Z.fees, 2), JSON.stringify([Z.v.leveragedPV, Z.v.unleveragedPV, Z.fees]));
  await p.close();

  /* ---- maximum supportable price: NPV(P) = 0 with the whole deal re-run at P ---- */
  const movedLoan = [];
  for (const [nm, deal, over] of [['the audit deal, 56% LTV', A, {}], ['a second deal', B, {}], ['a 3 year hold', A, { holdYears: 3 }], ['a 10 year hold', A, { holdYears: 10 }]]) {
    p = await open(deal, over);
    const M = await p.evaluate(() => { const s = bkLoad(), r = bkValMaxPrice('property', 0.075), q = bkValMaxPrice('equity', 0.10, 0.10);
      const at = (P, kind) => bkRunWith({ purchasePrice: P }, () => { const v = bkValuate({ rate: kind === 'equity' ? 0.10 : 0.075, equityRate: 0.10 }); return { npv: kind === 'equity' ? v.equityNPV : v.propertyNPV, loan: bkDebt().loan, eq: bkDebt().equity, basis: v.basis }; });
      const brute = (kind) => { let best = null; for (let P = s.purchasePrice * 0.3; P <= s.purchasePrice * 2.8; P += s.purchasePrice * 0.005) { if (at(P, kind).npv >= 0) best = P; } return best; };
      const out = { entered: s.purchasePrice, r, q };
      if (r.ok) { out.atR = at(r.price, 'property'); out.aboveR = at(r.price * 1.01, 'property'); out.bruteR = brute('property'); }
      if (q.ok) { out.atQ = at(q.price, 'equity'); out.aboveQ = at(q.price * 1.01, 'equity'); out.bruteQ = brute('equity'); out.atEntered = at(s.purchasePrice, 'equity'); }
      return out; });
    check(nm + ': the maximum property price has Property NPV = 0 (to $1) when the whole deal is re-run at it, a price 1% higher has a negative NPV, and a brute-force scan lands within 1% of it', M.r.ok && near(M.atR.npv, 0, 1) && M.aboveR.npv < 0 && Math.abs(M.bruteR - M.r.price) / M.r.price < 0.0101, JSON.stringify([M.r, M.atR, M.bruteR]));
    check(nm + ': the maximum equity price has Equity NPV = 0 with the loan and the closing equity re-sized at that price (the financing moved with the price)', M.q.ok && near(M.atQ.npv, 0, 1) && M.aboveQ.npv < 0 && Math.abs(M.bruteQ - M.q.price) / M.q.price < 0.0101 && Math.abs(M.atQ.eq - M.atEntered.eq) > 1000, JSON.stringify([M.q, M.atQ, M.atEntered])); movedLoan.push(Math.abs(M.atQ.loan - M.atEntered.loan) > 1000); void( JSON.stringify([M.q, M.atQ, M.atEntered]));
    await p.close();
  }
  check('the loan is re-sized with the price in the deals whose sizing depends on it (the audit deal, the second deal and the 3 year hold)', movedLoan.filter(Boolean).length >= 3, JSON.stringify(movedLoan));
  /* a return no price can meet, and an absurdly low one: a clear message, not a number */
  p = await open(A); const NR = await p.evaluate(() => [bkValMaxPrice('property', 0.6), bkValMaxPrice('property', -0.2)]);
  check('when no price can meet the required return (60%), or every price clears it (-20%), the result says so and gives no price', NR[0].ok === false && /negative at every price/.test(NR[0].reason) && NR[0].price === undefined && NR[1].ok === false, JSON.stringify(NR));
  check('no page errors', p.errs.length === 0, JSON.stringify(p.errs)); await p.close();
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
