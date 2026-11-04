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
  P('valExec', 'Executive valuation summary'), P('propDesc', 'Property description'), P('rentRollMix', 'Rent roll / unit mix'), P('incomeAnalysis', 'Income analysis'), P('opexAnalysis', 'Operating expense analysis'),
  P('noiRecon', 'NOI reconciliation'), P('capRateAnalysis', 'Capitalization rate analysis'), P('valueConclusion', 'Estimated market value'), P('valSens', 'Valuation sensitivity'),
  P('capitalBudget', 'Capital improvement budget'), P('taxAnalysis', 'Tax analysis', { when:'tax analysis selected' }),
  P('refiExec', 'Executive refinance summary'), P('existingDebt', 'Existing debt and payoff'), P('proposedDebt', 'Proposed financing and lender tests'), P('refiProceeds', 'Proceeds and equity'), P('refiCompare', 'Alternative structures'),
  P('holdExec', 'Executive hold / sell summary'), P('holdCompare', 'Hold vs. sell'), P('saleTax', 'Disposition tax estimate', { when:'tax analysis selected' }),
  P('afterTaxCF', 'After-tax cash flow'), P('investorSchedules', 'Investor contributions and distributions'),
  P('pfExec', 'Executive portfolio summary'), P('pfComposition', 'Portfolio composition'), P('pfValues', 'Asset-level valuations'), P('pfOps', 'Operating performance'), P('pfConsolidation', 'Portfolio consolidation'),
  P('pfDebt', 'Debt and maturity schedule'), P('pfCapital', 'Capital improvement requirements'), P('pfTax', 'Depreciation and tax profiles'), P('pfCompare', 'Asset-level comparisons'), P('pfRisk', 'Portfolio risk'), P('pfScenarios', 'Scenario comparison'),
  P('bizExec', 'Executive business summary'), P('bizOps', 'Revenue, costs and EBITDA'), P('bizCash', 'Working capital and free cash flow'), P('bizValue', 'Valuation and multiples'), P('bizSens', 'Sensitivity')
]);
R.addReport('acquisition', ['cover', 'dashboard', 'acqFinancial', 'acqCashFlow', 'waterfall', 'performance', 'credit', 'portfolioImpact', 'disclosures']);
R.addReport('development', ['cover', 'dashboard', 'devBudget', 'devDraws', 'schedule', 'devRisk', 'devSens', 'performance', 'waterfall', 'credit', 'integrity', 'portfolioImpact', 'disclosures']);
R.addReport('valuation', ['valExec', 'propDesc', 'rentRollMix', 'incomeAnalysis', 'opexAnalysis', 'noiRecon', 'capRateAnalysis', 'valueConclusion', 'valSens', 'disclosures']);
R.addReport('refinance', ['refiExec', 'propDesc', 'existingDebt', 'proposedDebt', 'refiProceeds', 'refiCompare', 'disclosures']);
R.addReport('hold', ['holdExec', 'propDesc', 'acqCashFlow', 'capitalBudget', 'holdCompare', 'saleTax', 'disclosures']);
R.addReport('comprehensive', ['cover', 'dashboard', 'acqFinancial', 'capitalBudget', 'acqCashFlow', 'afterTaxCF', 'taxAnalysis', 'investorSchedules', 'waterfall', 'performance', 'credit', 'disclosures']);
R.addReport('portfolio', ['pfExec', 'pfComposition', 'pfValues', 'pfOps', 'pfConsolidation', 'pfDebt', 'pfCapital', 'pfTax', 'pfCompare', 'pfRisk', 'pfScenarios', 'disclosures']);
R.addReport('business', ['bizExec', 'bizOps', 'bizCash', 'bizValue', 'bizSens', 'disclosures']);
})();
