/* ANALYSIS REGISTRY - REPORT SECTIONS. Each analysis's PDF is an ordered list of sections from one section dictionary; shared sections (cover,
   assumptions and disclosures) are defined once. 'builder' names the existing page builder a live section is produced by today (the Create PDF summary
   in src/145, src/177, src/179); a planned section belongs to an analysis not built yet. 'when' marks an optional section (shown only when its data exists). */
(function(){
'use strict';
if(!window.BKReg) return;
var R = window.BKReg;
function X(id, title, o){ return Object.assign({ id:id, title:title }, o || {}); }
function P(id, title, o){ return X(id, title, Object.assign({ planned:true }, o || {})); }
R.addSections([
  /* built today */
  X('cover', 'Cover', { builder:'report.cover' }), X('dashboard', 'Dashboard', { builder:'report.dashboard' }),
  X('acqFinancial', 'Financial summary: sources and uses, loan, exit, returns', { builder:'report.financial' }), X('acqCashFlow', 'Annual cash flow', { builder:'report.cashflow' }),
  X('waterfall', 'Distribution waterfall', { builder:'report.waterfall' }), X('performance', 'Performance and sensitivity', { builder:'report.performance' }),
  X('credit', 'Credit and market', { builder:'report.credit' }), X('portfolioImpact', 'Impact to portfolio', { builder:'report.portfolioImpact', when:'portfolio has other deals' }),
  X('devBudget', 'Budget and funding', { builder:'report.devBudget' }), X('devDraws', 'Draw schedule', { builder:'report.devDraws' }),
  X('devRisk', 'Risk and break-evens', { builder:'devreport.risk' }), X('devSens', 'Sensitivities', { builder:'devreport.sens' }), X('integrity', 'Model integrity', { builder:'devreport.integrity' }),
  X('schedule', 'Construction schedule', { builder:'devschedule.summary', when:'a task schedule exists' }),
  X('disclosures', 'Assumptions and disclosures', { builder:'report.disclosures' }),
  /* planned */
  X('valExec', 'Executive valuation summary', { builder:'valuation.report' }), X('propDesc', 'Property description', { builder:'refinance.report / valuation.report' }), X('rentRollMix', 'Rent roll / unit mix', { builder:'valuation.report' }), X('incomeAnalysis', 'Income analysis', { builder:'valuation.report' }), X('opexAnalysis', 'Operating expense analysis', { builder:'valuation.report' }),
  X('noiRecon', 'NOI reconciliation', { builder:'valuation.report' }), X('capRateAnalysis', 'Capitalization rate analysis', { builder:'valuation.report' }), X('valueConclusion', 'Estimated market value', { builder:'valuation.report' }), X('valSens', 'Valuation sensitivity', { builder:'valuation.report' }),
  X('capitalBudget', 'Capital improvement budget', { builder:'hold.report / report.cashflow' }), X('taxAnalysis', 'Tax analysis', { builder:'report.afterTax', when:'tax inputs entered' }),
  X('refiExec', 'Executive refinance summary', { builder:'refinance.report' }), X('existingDebt', 'Existing debt and payoff', { builder:'refinance.report' }), X('proposedDebt', 'Proposed financing and lender tests', { builder:'refinance.report' }), X('refiProceeds', 'Proceeds and equity', { builder:'refinance.report' }), X('refiCompare', 'Alternative structures', { builder:'refinance.report' }),
  X('holdExec', 'Executive hold / sell summary', { builder:'hold.report' }), X('holdCompare', 'Hold vs. sell', { builder:'hold.report' }), X('saleTax', 'Disposition tax estimate', { builder:'hold.report', when:'a cost basis is entered' }),
  X('afterTaxCF', 'After-tax cash flow', { builder:'report.afterTax' }), P('investorSchedules', 'Investor contributions and distributions'),
  X('pfExec', 'Executive portfolio summary', { builder:'portfolio.report' }), X('pfComposition', 'Portfolio composition', { builder:'portfolio.report' }), X('pfValues', 'Asset-level valuations', { builder:'portfolio.report' }), X('pfOps', 'Operating performance', { builder:'portfolio.report' }), X('pfConsolidation', 'Portfolio consolidation', { builder:'portfolio.report' }),
  X('pfDebt', 'Debt and maturity schedule', { builder:'portfolio.report' }), X('pfCapital', 'Capital improvement requirements', { builder:'portfolio.report' }), X('pfTax', 'Depreciation and tax profiles', { builder:'portfolio.report' }), X('pfCompare', 'Asset-level comparisons', { builder:'portfolio.report' }), X('pfRisk', 'Portfolio risk', { builder:'portfolio.report' }), X('pfScenarios', 'Scenario comparison', { builder:'portfolio.report' }),
  X('bizExec', 'Executive business summary', { builder:'business.report' }), X('bizOps', 'Revenue, costs and EBITDA', { builder:'business.report' }), X('bizCash', 'Working capital and free cash flow', { builder:'business.report' }), X('bizValue', 'Valuation and multiples', { builder:'business.report' }), X('bizSens', 'Sensitivity', { builder:'business.report' })
]);
R.addReport('acquisition', ['cover', 'dashboard', 'acqFinancial', 'acqCashFlow', 'waterfall', 'performance', 'credit', 'portfolioImpact', 'disclosures']);
R.addReport('development', ['cover', 'dashboard', 'devBudget', 'devDraws', 'schedule', 'devRisk', 'devSens', 'performance', 'waterfall', 'credit', 'integrity', 'portfolioImpact', 'disclosures']);
R.addReport('valuation', ['valExec', 'propDesc', 'rentRollMix', 'incomeAnalysis', 'opexAnalysis', 'noiRecon', 'capRateAnalysis', 'valueConclusion', 'valSens', 'disclosures']);
R.addReport('refinance', ['refiExec', 'propDesc', 'existingDebt', 'proposedDebt', 'refiProceeds', 'refiCompare', 'disclosures']);
R.addReport('hold', ['holdExec', 'propDesc', 'acqCashFlow', 'capitalBudget', 'holdCompare', 'saleTax', 'disclosures']);
R.addReport('comprehensive', ['cover', 'dashboard', 'acqFinancial', 'capitalBudget', 'acqCashFlow', 'afterTaxCF', 'taxAnalysis', 'waterfall', 'performance', 'credit', 'disclosures']);
R.addReport('portfolio', ['pfExec', 'pfComposition', 'pfValues', 'pfOps', 'pfConsolidation', 'pfDebt', 'pfCapital', 'pfTax', 'pfCompare', 'pfRisk', 'pfScenarios', 'disclosures']);
R.addReport('business', ['bizExec', 'bizOps', 'bizCash', 'bizValue', 'bizSens', 'disclosures']);
})();
