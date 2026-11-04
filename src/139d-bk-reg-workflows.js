/* ANALYSIS REGISTRY - WORKFLOWS. Each analysis's own steps, in order. A step names the fields it asks for and, for each, whether it is required,
   optional, conditional (with its condition), not applicable or derived; label and suggestion can be specialised for the step. 'sheet' is where the
   detail lives in the full model. Completion is computed from the deal itself (BKReg.stepState), so the guide and the full model never disagree.
   Acquisition and Development reproduce today's guide exactly; their longer workflows come with Phase 10. The other six are their full workflows;
   their steps that need inputs not yet built use planned fields and open once those analyses are built. */
(function(){
'use strict';
if(!window.BKReg) return;
var R = window.BKReg;
function q(k, req, o){ return Object.assign({ k:k, req:req || 'optional' }, o || {}); }
function S(id, title, why, sheet, fields, o){ return Object.assign({ id:id, title:title, why:why, sheet:sheet, fields:fields || [] }, o || {}); }
var isDevSug = function(v, why){ return function(){ return { v:v, why:why }; }; };

/* shared step blocks (the same objects are used, so the two analyses that share a step cannot drift apart) */
var INCOME = S('income', 'Rents and other income', 'Income is what everything else rests on. Use the rent the units earn today; add the upside later, on purpose.', 'Deal Underwrite',
  [q('avgRent', 'required'), q('otherIncomePerUnit'), q('vacancy', 'required')]);
var EXPENSES = S('expenses', 'Operating expenses', 'Use the last twelve months where you have them. A missing line (management, repairs, reserves) is the most common way an NOI looks better than it is.', 'Deal Underwrite',
  [q('taxes', 'required'), q('insurance', 'required'), q('utilities'), q('rm', 'required'), q('mgmtPct', 'required'), q('payroll'), q('contract'), q('ga'), q('reserves')]);
var EXIT = S('exit', 'Hold and exit', 'How long you keep it and what you assume it sells for. The exit cap rate moves the answer more than anything else here.', 'Deal Underwrite',
  [q('holdYears', 'required'), q('exitCap', 'required'), q('rentGrowth'), q('opexGrowth'), q('saleCostPct')]);

R.addWorkflow('acquisition', [
  S('property', 'The property', 'The basics that size everything else.', 'Deal Underwrite', [q('name', 'required'), q('location'), q('units', 'required'), q('gsf')]),
  S('price', 'Price and closing', 'What you pay and what it costs to close.', 'Deal Underwrite', [q('purchasePrice', 'required'), q('closingCostsPct', 'required'), q('closing', 'optional', { help:'For example 3/1/2027.' })]),
  INCOME, EXPENSES,
  S('debt', 'Financing', 'The loan changes the return and the risk. Skip it and the returns shown are all-cash.', 'Debt', [q('debtEnabled'), q('acqLTV', 'required'), q('acqRate', 'required'), q('acqAmort'), q('acqIO'), q('acqOrigFee')], { skippable:true }),
  S('sources', 'Sources and uses', 'What the deal costs in total and where the money comes from: your equity and the loan. It is read from the model, not typed; check that sources equal uses.', 'Sources & Uses', [q('sourcesUses', 'derived')], { skippable:true }),
  S('partners', 'Investors and LP / GP economics', 'A new deal has one investor who owns all of it. If there are other partners, enter the GP share, the preferred return and how profit splits above each hurdle. Skip it to keep one investor.', 'Deal Underwrite',
    [q('gpShare'), q('pref'), q('hurdle2'), q('hurdle3'), q('t2LP'), q('t3LP'), q('t4LP')], { skippable:true }),
  EXIT ]);

R.addWorkflow('development', [
  S('property', 'The project', 'What is being built.', 'Deal Underwrite', [q('name', 'required'), q('location'), q('units', 'required', { label:'Residential units' }), q('gsf', 'optional', { label:'Gross building area, SF' })]),
  S('land', 'Land and budget', 'The two big costs. Land is the price; the construction budget is hard and soft costs together.', 'Deal Underwrite',
    [q('purchasePrice', 'required', { label:'Land price' }), q('sourceConstruction', 'required'), q('closing'), q('predevMonths'), q('constructionMonths', 'required'), q('leaseupMonths')]),
  INCOME, EXPENSES,
  S('debt', 'Financing', 'A construction loan, then a permanent loan once the building is stabilised.', 'Debt', [q('conLTC', 'required'), q('conRate', 'required'), q('permRate'), q('permAmort')], { skippable:true }),
  S('sources', 'Sources and uses', 'What the deal costs in total and where the money comes from: your equity and the loan. It is read from the model, not typed; check that sources equal uses.', 'Sources & Uses', [q('sourcesUses', 'derived')], { skippable:true }),
  S('partners', 'Investors and LP / GP economics', 'A new deal has one investor who owns all of it. If there are other partners, enter the GP share, the preferred return and how profit splits above each hurdle. Skip it to keep one investor.', 'Deal Underwrite',
    [q('gpShare'), q('pref'), q('hurdle2'), q('hurdle3'), q('t2LP'), q('t3LP'), q('t4LP')], { skippable:true }),
  EXIT ]);

R.addWorkflow('valuation', [
  S('property', 'Property information', 'Identifies the property and sizes the per-unit and per-SF value.', 'Property', [q('name', 'required'), q('location', 'required'), q('propertyType', 'required'), q('units', 'required'), q('gsf', 'required')]),
  S('mix', 'Unit mix / tenant schedule', 'Value rests on what each unit or tenant pays.', 'Rent Roll', [q('rentRoll', 'required'), q('leases', 'conditional', { when:function(s){ return Number(s.commercialArea) > 0; } })]),
  S('inplace', 'In-place income', 'Rent the property collects today, before any upside.', 'Deal Underwrite', [q('avgRent', 'required'), q('otherIncomePerUnit')]),
  S('market', 'Market rent assumptions', 'Market rent sets the normalized and stabilized income.', 'Rent Roll', [q('rentRoll', 'required')]),
  S('vacancy', 'Vacancy and other income', 'Vacancy, credit loss and concessions reduce income before expenses.', 'Deal Underwrite', [q('vacancy', 'required'), q('badDebtPct'), q('concessionPct')]),
  EXPENSES,
  S('noi', 'NOI calculation', 'Current, normalized and stabilized NOI, each stated with what it includes.', 'Operating Underwrite', [q('noi', 'derived'), q('valNormalizeAdj'), q('valStabilizedNoi', 'optional')]),
  S('caprate', 'Market cap rate and comparables', 'The cap rate converts NOI into value; comparables support it.', 'Valuation', [q('valCapRate', 'required'), q('valComps'), q('valDate', 'required')]),
  S('value', 'Estimated property value', 'Value = NOI / cap rate for each NOI, with value per unit and per SF.', 'Valuation', [q('value', 'derived')]),
  S('review', 'Review and generate the valuation report', 'Check what is missing and what is estimated, then produce the report.', 'Valuation Report', []) ]);

R.addWorkflow('refinance', [
  S('property', 'Property information', 'Identifies the asset and its size.', 'Property', [q('name', 'required'), q('location'), q('units', 'required'), q('gsf')]),
  S('ops', 'Current operating performance', 'Lenders size on the NOI the property earns today.', 'Deal Underwrite', [q('avgRent', 'required'), q('vacancy', 'required'), q('taxes', 'required'), q('insurance', 'required'), q('rm', 'required'), q('mgmtPct', 'required')]),
  S('value', 'Current property valuation', 'The LTV test uses this value.', 'Valuation', [q('currentValue', 'required'), q('valCapRate')]),
  S('existing', 'Existing debt and payoff', 'What has to be repaid before any cash comes out.', 'Debt', [q('exLoanBalance', 'required'), q('exLoanRate', 'required'), q('exLoanMaturity', 'required'), q('exLoanAmort'), q('exPrepay')]),
  S('proposed', 'Proposed financing', 'The terms of the new loan.', 'Debt', [q('newLoanRate', 'required'), q('newLoanTerm', 'required'), q('newLoanAmort'), q('newLoanIO')]),
  S('lender', 'Lender constraints', 'The tests that size the loan, kept apart from your own assumptions.', 'Debt', [q('lenderMaxLTV', 'required'), q('lenderMinDSCR', 'required'), q('lenderMinDY')]),
  S('sizing', 'Debt sizing', 'The loan is the lowest the tests allow.', 'Debt', [q('newLoanAmount', 'optional')]),
  S('costs', 'Refinance costs', 'Points, legal and the prepayment penalty reduce the proceeds.', 'Debt', [q('newLoanCosts', 'required')]),
  S('proceeds', 'Proceeds and equity extraction', 'Net cash out after payoff and costs, and the equity left in.', 'Debt', [q('value', 'derived')]),
  S('alts', 'Alternative financing scenarios', 'Compare structures side by side.', 'Financing Compare', [q('refiScenarios')]),
  S('review', 'Review and generate the refinance report', '', 'Reports', []) ]);

R.addWorkflow('hold', [
  S('property', 'Property information', '', 'Property', [q('name', 'required'), q('location'), q('units', 'required'), q('gsf')]),
  S('ops', 'Current operating performance', 'Where the property stands today.', 'Deal Underwrite', [q('avgRent', 'required'), q('vacancy', 'required'), q('taxes', 'required'), q('insurance', 'required'), q('rm', 'required'), q('mgmtPct', 'required')]),
  S('value', 'Current property valuation', 'What it would sell for today.', 'Valuation', [q('currentValue', 'required')]),
  S('forward', 'Forward operating assumptions', 'Growth that drives the hold case.', 'Market', [q('rentGrowth', 'required'), q('opexGrowth', 'required')]),
  S('capex', 'Capital expenditure requirements', 'What holding will cost in capital.', 'Expenses', [q('capitalProjects'), q('reserves')]),
  S('debt', 'Existing financing', 'The loan to be repaid at a sale.', 'Debt', [q('exLoanBalance', 'required'), q('exLoanRate', 'required'), q('exLoanMaturity', 'required')]),
  S('period', 'Hold period assumptions', '', 'Deal Underwrite', [q('holdYears', 'required')]),
  S('exit', 'Disposition assumptions', '', 'Deal Underwrite', [q('exitCap', 'required'), q('saleCostPct', 'required')]),
  S('tax', 'Tax and adjusted basis', 'Optional. Recapture and gain on a sale, flagged for professional review.', 'Depreciation', [q('ownedBasis'), q('taxProfile')], { skippable:true }),
  S('compare', 'Hold vs. sell comparison', '', 'Returns', [q('value', 'derived')]),
  S('sens', 'Sensitivity analysis', '', 'Sensitivity', []),
  S('review', 'Review and generate the report', '', 'Reports', []) ]);

R.addWorkflow('comprehensive', [
  S('property', 'Property and ownership information', '', 'Property', [q('name', 'required'), q('location', 'required'), q('propertyType', 'required'), q('units', 'required'), q('gsf', 'required')]),
  S('acq', 'Acquisition assumptions', '', 'Investment', [q('purchasePrice', 'required'), q('closingCostsPct', 'required'), q('closing', 'required'), q('acqStrategy', 'required')]),
  S('mix', 'Unit mix and rent roll', '', 'Rent Roll', [q('rentRoll', 'required')]),
  S('revenue', 'Revenue projections', '', 'Market', [q('rentGrowth', 'required'), q('otherIncomePerUnit')]),
  S('vacancy', 'Vacancy and credit loss', '', 'Market', [q('vacancy', 'required'), q('badDebtPct', 'required')]),
  EXPENSES,
  S('capital', 'Capital improvement program', '', 'Expenses', [q('capitalProjects', 'required')]),
  S('financing', 'Financing structure', '', 'Investment', [q('acqLTV', 'required'), q('acqRate', 'required'), q('acqAmort', 'required'), q('acqDSCR')]),
  S('su', 'Sources and uses', '', 'Sources & Uses', [q('value', 'derived')]),
  S('debtsched', 'Debt schedules', '', 'Debt Schedule', []),
  S('opcf', 'Operating cash flow', '', 'Property CF', []),
  S('reserves', 'Capital expenditure and reserve schedules', '', 'Expenses', [q('reserves', 'required')]),
  S('depr', 'Depreciation and cost segregation', '', 'Depreciation', [q('taxProfile', 'required')]),
  S('aftertax', 'After-tax cash flow', '', 'After-Tax', []),
  S('refi', 'Refinancing scenarios', '', 'Refi / Recap', [q('refiScenarios')], { skippable:true }),
  S('exit', 'Disposition assumptions', '', 'Valuation', [q('holdYears', 'required'), q('exitCap', 'required'), q('saleCostPct', 'required')]),
  S('investors', 'Investor contributions and distributions', '', 'Investors', [q('gpShare', 'required')]),
  S('waterfall', 'Waterfall and preferred returns', '', 'Equity Waterfall', [q('pref', 'required')]),
  S('returns', 'Investment returns', '', 'Returns', []),
  S('sens', 'Sensitivity and downside analysis', '', 'Sensitivity', []),
  S('review', 'Review and generate the comprehensive report', '', 'Reports', []) ]);

R.addWorkflow('portfolio', [
  S('overview', 'Portfolio overview', '', 'Portfolio', [q('name', 'required')]),
  S('select', 'Property selection / import', 'Link saved models or enter owned properties.', 'Portfolio', [q('holdings', 'required')]),
  S('assets', 'Asset-level information', '', 'Portfolio', [q('holdings', 'required')]),
  S('values', 'Property valuations', '', 'Portfolio', []), S('ops', 'Operating performance', '', 'Portfolio', []),
  S('capital', 'Capital improvement requirements', '', 'Portfolio', [q('capitalProjects')]), S('debt', 'Debt and maturity schedule', '', 'Portfolio', []),
  S('tax', 'Depreciation and tax profiles', '', 'Portfolio', [q('taxProfile')], { skippable:true }), S('consolidate', 'Portfolio consolidation', 'Dated cash flows added together; nothing counted twice.', 'Portfolio M', []),
  S('compare', 'Asset-level comparisons', '', 'Portfolio', []), S('risk', 'Portfolio risk analysis', '', 'Portfolio', []),
  S('scenarios', 'Portfolio scenarios', 'Sell, refinance, change operations, invest capital, and compare the results side by side.', 'Portfolio', [q('portfolioScenarios')]),
  S('review', 'Review and generate the portfolio report', '', 'Reports', []) ]);

R.addWorkflow('business', [
  S('company', 'Company information', '', 'Business Model', [q('name', 'required')]),
  S('revenue', 'Revenue and growth', '', 'Business Model', [q('bizRevenue', 'required')]),
  S('costs', 'Cost of revenue and operating expenses', '', 'Business Model', [q('bizCosts', 'required')]),
  S('ebitda', 'EBITDA', '', 'Business Model', []),
  S('wc', 'Working capital', '', 'Business Model', [q('bizWorkingCapital')]),
  S('capex', 'Capital expenditures', '', 'Business Model', [q('bizCapex')]),
  S('fcf', 'Free cash flow', '', 'Business Valuation', []),
  S('valuation', 'Valuation and multiples', '', 'Business Valuation', [q('bizMultiple', 'required')]),
  S('financing', 'Financing and investor returns', '', 'Business Valuation', [], { skippable:true }),
  S('sens', 'Sensitivity analysis', '', 'Business Valuation', []),
  S('review', 'Review and generate the business report', '', 'Reports', []) ]);
})();
