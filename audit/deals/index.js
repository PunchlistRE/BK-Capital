// The sample deal book. Each deal is a complete, self-describing input set, built through the app's own
// bkCreateNewDeal(). `purpose` says what the deal is there to exercise. Acquisition deals are checked
// against the independent model (model.py); development deals against dev_audit.py.
const path = require('path');
const A = require(path.join(__dirname, '..', 'deal.js')), B = require(path.join(__dirname, '..', 'dealB.js'));
const DEV = require(path.join(__dirname, '..', 'devdeal.js'));
const STD = { cvRentGrowthStart: 'year2', cvOpexVariablePct: 0, cvLtvBasis: 'price', cvHurdleBasis: 'lp', cvBadDebtBasis: 'afterVacancy' };
const LEGACY = { cvRentGrowthStart: 'month1', cvOpexVariablePct: 0.4, cvLtvBasis: 'value', cvHurdleBasis: 'deal', cvBadDebtBasis: 'legacy' };
const acq = (id, purpose, ov) => ({ id, kind: 'acq', purpose, deal: Object.assign({}, A, STD, { gpShare: 0.10 }, ov, { dealId: id }) });
const dev = (id, purpose, ov) => ({ id, kind: 'dev', purpose, deal: Object.assign({}, DEV, ov, { dealId: id }) });
// Real properties from the Yardi benchmark workbook (audit/real/build_real_deals.py): price = T-12 NOI / market cap,
// Year-1 statement NOI = T-12 NOI. Financing, growth and the JV terms are the app's standard assumptions.
const REAL = require(path.join(__dirname, '..', 'real', 'real_deals.json')).map(r => ({ id: r.id, kind: 'acq', real: r,
  purpose: 'Real property ' + r.property + ': T-12 NOI $' + Math.round(r.targets.t12noi).toLocaleString('en-US') + ' at ' + (r.targets.capRate * 100).toFixed(2) + '% cap',
  deal: Object.assign({}, A, STD, { gpShare: 0.10, location: '', parking: 0, siteArea: 0 }, r.deal) }));
module.exports = [
  acq('ACQ-1', 'Base case: 120-unit garden, standard conventions, GP 10% (promote tiers unpaid)', {}),
  acq('ACQ-2', 'Upside: 6% rent growth, 5.0% exit cap - pushes cash through every waterfall tier', { rentGrowth: 0.06, exitCap: 0.05, purchasePrice: 21000000 }),
  acq('ACQ-3', 'Debt-service bound: 8% coupon, 75% LTV asked, DSCR is the binding constraint', { acqRate: 0.08, acqLTV: 0.75, acqLTC: 0.85, name: 'DSCR Bound' }),
  acq('ACQ-4', 'Small 24-unit, loss-to-lease + concessions, bad debt on gross rent, 7-year hold', { units: 24, gsf: 21600, purchasePrice: 4300000, taxes: 48000, insurance: 19200, payroll: 60000, rm: 18000, turnover: 9600, utilities: 26400, contract: 12000, marketing: 4800, ga: 7200, reserves: 7200, t12noi: 255000, holdYears: 7, lossToLeasePct: 0.015, concessionPct: 0.01, cvBadDebtBasis: 'gross' }),
  acq('ACQ-5', 'Large 300-unit, LTC-bound (80% LTC, 70% LTV), 25% variable opex, 10-year hold, no bad debt', { units: 300, gsf: 270000, purchasePrice: 52000000, taxes: 600000, insurance: 240000, payroll: 600000, rm: 225000, turnover: 120000, utilities: 330000, contract: 150000, marketing: 60000, ga: 90000, reserves: 90000, t12noi: 3300000, holdYears: 10, badDebtPct: 0, acqLTV: 0.7, acqLTC: 0.8, acqDSCR: 1.0, cvOpexVariablePct: 0.25 }),
  acq('ACQ-6', 'Downside: flat rents, 4% expense growth, 7% exit cap - negative cash flow and equity calls', { rentGrowth: 0, otherGrowth: 0, opexGrowth: 0.04, taxGrowth: 0.04, exitCap: 0.07, holdYears: 6 }),
  acq('ACQ-7', 'Legacy methodology: every convention at its pre-CV-2026.10 value (what saved deals still run)', Object.assign({ gpShare: 0.5 }, LEGACY)),
  dev('DEV-1', 'Ground-up 150 units, 65% LTC construction loan, permanent takeout at stabilisation', {}),
  dev('DEV-2', 'Same project, no refinance at stabilisation - construction loan held to sale', { refiAtStab: 0 }),
  ...REAL,
  dev('DEV-3', 'Same project, all equity (no construction loan), 20-month construction', { conLTC: 0, constructionMonths: 20, holdYears: 7 })
];
