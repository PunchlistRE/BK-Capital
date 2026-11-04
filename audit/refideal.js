// A refinance test deal: a 40-unit building with an existing 4.25% loan, refinanced at 6.50% / 30-year amortization, lender limits 70% LTV, 1.25x DSCR, 8% debt yield.
module.exports = {
  dealId: 'TEST-REFI', name: 'Audit Refinance Apartments', location: 'Hartford, CT', analysisType: 'refinance', dealType: 'Acquisition', propertyType: 'Multifamily', closing: '1/1/2027',
  units: 40, gsf: 36000, avgRent: 1800, otherIncomePerUnit: 600, vacancy: 0.05, badDebtPct: 0, taxes: 60000, insurance: 20000, utilities: 15000, rm: 25000, payroll: 0, contract: 8000, marketing: 0, ga: 6000, turnover: 0, reserves: 12000, mgmtPct: 0.04,
  valCapRate: 0.06, exLoanBalance: 4500000, exLoanRate: 0.0425, exLoanMaturity: '6/30/2027', exLoanAmort: 25, exPrepay: 45000,
  newLoanRate: 0.065, newLoanTerm: 10, newLoanAmort: 30, newLoanIO: 0, newLoanCosts: 60000, lenderMaxLTV: 0.70, lenderMinDSCR: 1.25, lenderMinDY: 0.08,
  refiScenarios: [{ name: 'Bank, 5-yr IO-free', newLoanRate: 0.0625, newLoanAmort: 25, lenderMaxLTV: 0.65, lenderMinDSCR: 1.30, newLoanCosts: 40000 }, { name: 'Agency, 2 yrs IO', newLoanRate: 0.0595, newLoanIO: 2, lenderMaxLTV: 0.75, lenderMinDSCR: 1.25, newLoanCosts: 85000 }]
};
