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
const HARV = require(path.join(__dirname, '..', 'real', 'harvard_assets.json'));
// Cost segregation scenarios. `setup` runs inside the app after the deal is created, through the app's own actions.
const SEG_BUCKETS = "bkDeprSet('landMethod','percent'); bkDeprSet('landPct',0.20); bkDeprSet('costSeg',true); bkDeprSet('detailMode','buckets'); bkDeprBucketSet(5, 0.12*0.80*bkLoad().purchasePrice); bkDeprBucketSet(15, 0.07*0.80*bkLoad().purchasePrice);";
const withTax = (id, purpose, ov, setup) => Object.assign(acq(id, purpose, ov), { setup });
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
  dev('DEV-4', 'Same project with opex growing faster than rent (4.5% vs 3%): replacement reserves must grow at the OPEX rate, NOI before reserves at the NOI rate', { opexGrowth: 0.045, reserves: 90000 }),
  ...REAL,
  withTax('CRD-1', 'Credit layer: custom policy (min DSCR 1.20x, stress 200 bps), gate weights/severity edits, risk register, conditions, and a valid credit override - all must survive save and reopen', {},
    "bkPolicySet('minDSCR',1.2); bkPolicySet('stressBps',200); bkPolicySet('maxLTV',0.7); bkPolicyGate('lpEM','severity','HARD'); bkPolicyGate('lpEM','weight',0.10); bkPolicyGate('goingIn','weight',0.08); bkICSet('thesis.0','Value-add multifamily'); bkICSet('risks.0.risk','Exit cap expansion'); bkICSet('risks.0.prob',4); bkICSet('risks.0.impact',4); bkICSet('risks.1.risk','Insurance escalation'); bkICSet('risks.1.prob',2); bkICSet('risks.1.impact',2); bkICSet('conditions.0','Third-party PCA'); bkICSet('override.on','YES'); bkICSet('override.reason','Committee accepted DSCR on stabilised basis'); bkICSet('override.approvedBy','CCO');"),
  withTax('REF-1', 'Refinance / recap: 10-year hold, 5% rent growth, custom refinance (year 4, 60% LTV, 5.75% coupon, 2% prepayment)', { holdYears: 10, rentGrowth: 0.05, exitCap: 0.055 }, "bkRefiSet('year',4); bkRefiSet('maxLTV',0.6); bkRefiSet('rate',0.0575); bkRefiSet('prepayPct',0.02);"),
  withTax('TAX-1', 'Cost seg (bucket mode: 12% 5-yr, 7% 15-yr, 20% land) on the base deal, statutory bonus, MACRS', {}, SEG_BUCKETS + " bkDeprSet('costSegFee',15000);"),
  withTax('TAX-2', 'Same deal, cost seg off: straight-line 27.5-yr mid-month on price less land', {}, "bkDeprSet('landMethod','percent'); bkDeprSet('landPct',0.20);"),
  withTax('TAX-3', 'Cost seg with an ELECTED 60% bonus and a mid-year (June) closing - half-year convention, no mid-quarter', { closing: '6/15/2027' }, SEG_BUCKETS + " bkDeprSet('bonusMode','elect'); bkDeprSet('bonusPct',0.6);"),
  withTax('TAX-4', 'Cost seg, all short-life assets placed in service in Q4 (October closing): mid-quarter convention applies', { closing: '10/20/2027' }, SEG_BUCKETS + " bkDeprSet('bonusMode','elect'); bkDeprSet('bonusPct',0);"),
  withTax('TAX-5', 'Legacy deal (no depMethod): depreciation configured under the V29.11 simplified schedule keeps its numbers', {}, "bkDeprSet('landMethod','percent'); bkDeprSet('landPct',0.20); bkDeprSet('costSeg',true); bkDeprSet('detailMode','buckets'); bkDeprBucketSet(5, 0.12*0.80*bkLoad().purchasePrice); bkDeprSet('bonusPct',1); bkDeprSet('bonusYear',2027); (function(){var s=bkLoad(); delete s._depr.settings.depMethod; delete s._depr.settings.bonusMode; bkSave(s);})();"),
  withTax('TAX-6', 'Same as TAX-1 but losses usable against the investor\'s other income (real estate professional / passive income): the cost seg tax saving is realised each year', {}, SEG_BUCKETS + " bkDeprSet('lossMode','usable'); bkDeprSet('costSegFee',15000);"),
  Object.assign(acq('HARVARD', '180-200 Harvard Ave: itemised 169-asset cost seg study (Dec 2025 in service, 100% bonus, mid-quarter); price $10.2M, T-12 NOI $899,039', {
    name: '180-200 Harvard Avenue', propertyType: 'Industrial', units: 5, gsf: 63447, purchasePrice: 10200000, closing: '12/11/2025', holdYears: 5, t12noi: 899039, avgRent: 1019536 / 5 / 12, otherIncomePerUnit: 0, vacancy: 0, badDebtPct: 0,
    mgmtPct: 0, taxes: 0, insurance: 0, utilities: 0, rm: 0, contract: 0, payroll: 0, turnover: 0, marketing: 0, ga: 1019536 - 899039, reserves: 0, exitCap: 0.07, taxRate: 0.37 }), { setup: "bkDeprSeedHarvard(); bkDeprSet('lossMode','usable');" }),
  withTax('BIZ-1', 'Operating business (Punchlist seed, base DCF at the workbook discounting) beside a $22.5M-class property: market rent $24,000, rent normalisation, four sale choices', { gpShare: 0.10 },
    "bkBizSeedPunchlist(); bkBizSet('place.marketRent',24000); bkBizSet('place.rentIncludedInNOI',0); bkBizSet('place.bizBasis',150000); bkBizSet('place.bundlePct',0.03);"),
  withTax('BIZ-2', 'Same business, BEAR case, exit multiple discounted at end of year 5 (standard convention), appraised property $18M, 12% broker', { gpShare: 0.10 },
    "bkBizSeedPunchlist(); bkBizSet('dcf.case',1); bkBizSet('dcf.tvDiscount','standard'); bkBizSet('place.marketRent',30000); bkBizSet('place.propertyValue',18000000); bkBizSet('place.brokerPct',0.12); bkBizSet('place.propTaxRate',0.30);"),
  dev('DEV-3', 'Same project, all equity (no construction loan), 20-month construction', { conLTC: 0, constructionMonths: 20, holdYears: 7 })
];
