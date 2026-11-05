// A valuation test deal: a 40-unit building valued in place, normalized (two adjustments) and stabilized (market rent per unit at 4% vacancy), with three comparable sales.
module.exports = {
  dealId: 'TEST-VAL', name: 'Audit Valuation Apartments', location: 'Hartford, CT', analysisType: 'valuation', dealType: 'Acquisition', propertyType: 'Multifamily', closing: '1/1/2027',
  units: 40, gsf: 36000, avgRent: 1800, otherIncomePerUnit: 600, vacancy: 0.06, badDebtPct: 0.01, taxes: 60000, insurance: 20000, utilities: 15000, rm: 25000, payroll: 0, contract: 8000, marketing: 0, ga: 6000, turnover: 0, reserves: 12000, mgmtPct: 0.04,
  valDate: '11/1/2026', valCapRate: 0.06, valCapStab: 0.0575, valMarketRent: 1950, valStabVacancy: 0.04, valStabCost: 250000, valConclusion: 'normalized',
  valAdjustments: [{ name: 'One-off roof repair removed from R&M', amount: 9000 }, { name: 'Payroll a buyer would carry', amount: -18000 }],
  valComps: [{ name: '12 Oak St', date: '6/2026', price: 7200000, units: 42, sf: 38000, capRate: 0.059 }, { name: '88 Main St', date: '3/2026', price: 6100000, units: 36, sf: 33000, noi: 372000 }, { name: '5 Elm Ct', date: '1/2026', price: 8000000, units: 48, sf: 44000, capRate: 0.0625 }]
};
