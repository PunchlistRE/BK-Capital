/* ANALYSIS REGISTRY - WORKFLOWS. Each analysis's own steps, in order. A step names the fields it asks for and, for each, whether it is required,
   optional, conditional (with its condition), not applicable or derived; label and suggestion can be specialized for the step. 'sheet' is where the
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
  S('property', 'The property', 'The basics that size everything else.', 'Deal Underwrite', [q('name', 'required'), q('location'), q('propertyType'), q('acqStrategy'), q('units', 'required'), q('gsf'), q('gla')]),
  S('price', 'Price and closing', 'What you pay and what it costs to close.', 'Deal Underwrite', [q('purchasePrice', 'required'), q('closingCostsPct', 'required'), q('closing', 'optional', { help:'For example 3/1/2027.' })]),
  INCOME, EXPENSES,
  /* deal-type paths: a step that only some deals walk (value-add, commercial space); the guide shows it when its test passes */
  S('valueadd', 'Value-add programme', 'A renovation programme: how many units a year, the rent lost while a unit is down, the premium afterwards and the capex per unit. Other income by line (laundry, parking, pet, storage, RUBS) is the other usual source of upside.', 'Revenues',
    [q('renoUnitsPerYear'), q('renoDownMonths'), q('renoPremium'), q('renoCapexPerUnit'), q('oiLaundry'), q('oiLateFees'), q('oiPetRent'), q('oiPetFees'), q('oiParking'), q('oiStorage'), q('oiRubsPct')],
    { skippable:true, when:function(s){ return /value-add|opportunistic|redevelopment|lease-up/i.test(String(s.acqStrategy || '')) || Number(s.renoUnitsPerYear) > 0; } }),
  S('commercial', 'Commercial space', 'Retail or office space in the building: its area and suites here; tenant by tenant rent, bumps, expiry and rollover on the Tenants page.', 'Tenants',
    [q('commercialArea'), q('commercialUnits')], { skippable:true, when:function(s){ return Number(s.commercialArea) > 0 || Number(s.commercialUnits) > 0 || /mixed|retail|office|industrial/i.test(String(s.propertyType || '')); } }),
  S('debt', 'Financing', 'The loan changes the return and the risk. Skip it and the returns shown are all-cash.', 'Debt', [q('debtEnabled'), q('acqLTV', 'required'), q('acqRate', 'required'), q('acqAmort'), q('acqIO'), q('acqOrigFee')], { skippable:true }),
  S('sources', 'Sources and uses', 'What the deal costs, what the loan covers, and how much equity the GP and the LPs put up. Everything on this step is read from the model and shown for checking; nothing is entered here.', 'Sources & Uses', [], { skippable:true }),
  S('partners', 'Investors and LP / GP economics', 'How profit is shared once the equity is in: the preferred return LPs get first, then the hurdles where the split changes. Skip it to keep one investor who owns all of it.', 'Deal Underwrite',
    [q('gpShare', 'optional'), q('pref'), q('hurdle2'), q('hurdle3'), q('t2LP'), q('t3LP'), q('t4LP')], { skippable:true }),
  EXIT,
  S('decision', 'Decision thresholds', 'The lines the hold, refinance or sell tests are measured against. Without them the decision test has nothing to compare to. Skip to keep the standard ones.', 'Capital Allocation', [q('capRefiHeadroom'), q('capRefiDebtYield'), q('capSellCoE'), q('capSellNOIGrowth'), q('capKeepCoE')], { skippable:true }) ]);

R.addWorkflow('development', [
  S('property', 'The project', 'What is being built.', 'Deal Underwrite', [q('name', 'required'), q('location'), q('units', 'required', { label:'Residential units' }), q('gsf', 'optional', { label:'Gross building area, SF' }), q('gla')]),
  S('land', 'Land and budget', 'The two big costs. Land is the price; the construction budget is hard and soft costs together.', 'Deal Underwrite',
    [q('purchasePrice', 'required', { label:'Land price' }), q('sourceConstruction', 'required'), q('closing'), q('predevMonths'), q('constructionMonths', 'required'), q('leaseupMonths')]),
  INCOME, EXPENSES,
  S('debt', 'Financing', 'A construction loan, then a permanent loan once the building is stabilized.', 'Debt', [q('conLTC', 'required'), q('conRate', 'required'), q('permRate'), q('permAmort')], { skippable:true }),
  S('sources', 'Sources and uses', 'What the deal costs, what the loan covers, and how much equity the GP and the LPs put up. Everything on this step is read from the model and shown for checking; nothing is entered here.', 'Sources & Uses', [], { skippable:true }),
  S('partners', 'Investors and LP / GP economics', 'How profit is shared once the equity is in: the preferred return LPs get first, then the hurdles where the split changes. Skip it to keep one investor who owns all of it.', 'Deal Underwrite',
    [q('gpShare', 'optional'), q('pref'), q('hurdle2'), q('hurdle3'), q('t2LP'), q('t3LP'), q('t4LP')], { skippable:true }),
  EXIT ]);

R.addWorkflow('valuation', [
  S('property', 'Property information', 'Identifies the property and sizes the per-unit and per-SF value.', 'Property', [q('name', 'required'), q('location'), q('propertyType'), q('units', 'required'), q('gsf')]),
  S('mix', 'Unit mix / tenant schedule', 'A rent roll with market rents builds the stabilized income; without one, the average rent is used.', 'Rent Roll', [q('rentRoll'), q('leases', 'conditional', { when:function(s){ return Number(s.commercialArea) > 0; } })], { skippable:true }),
  S('inplace', 'In-place income', 'Rent the property collects today, before any upside.', 'Revenues', [q('avgRent', 'required'), q('otherIncomePerUnit')]),
  S('market', 'Market rent assumptions', 'Market rent and the stabilized vacancy set the stabilized income (or enter a stabilized NOI).', 'Property Valuation', [q('valMarketRent'), q('valStabVacancy')], { skippable:true }),
  S('vacancy', 'Vacancy and other income', 'Vacancy, credit loss and concessions reduce income before expenses.', 'Revenues', [q('vacancy', 'required'), q('badDebtPct'), q('concessionPct')]),
  EXPENSES,
  S('noi', 'NOI calculation', 'In-place, normalized and stabilized NOI, each stated with what it includes.', 'Property Valuation', [q('noi', 'derived'), q('valAdjustments'), q('valStabilizedNoi', 'optional')]),
  S('caprate', 'Market cap rate and comparables', 'The cap rate converts NOI into value; comparables support it.', 'Property Valuation', [q('valCapRate', 'required'), q('valCapInPlace'), q('valCapStab'), q('valComps'), q('valDate', 'required')]),
  S('value', 'Estimated property value', 'Value = NOI / cap rate for each NOI, with value per unit and per SF.', 'Property Valuation', [q('value', 'derived'), q('valConclusion'), q('valStabCost')]),
  S('review', 'Review and generate the valuation report', 'Check the result and print the report.', 'Property Valuation Report', []) ]);

R.addWorkflow('refinance', [
  S('property', 'Property information', 'Identifies the asset and its size.', 'Property', [q('name', 'required'), q('location'), q('units', 'required'), q('gsf')]),
  S('ops', 'Current operating performance', 'Lenders size on the NOI the property earns today: rent, vacancy and the expenses.', 'Revenues', [q('avgRent', 'required'), q('otherIncomePerUnit'), q('vacancy', 'required'), q('taxes', 'required'), q('insurance', 'required'), q('rm', 'required'), q('mgmtPct', 'required'), q('utilities'), q('payroll'), q('reserves')]),
  S('value', 'Current property valuation', 'The LTV test uses this value: enter it, or a market cap rate to value the NOI.', 'Refinancing', [q('currentValue', 'conditional', { when:function(s){ return !(Number(s.valCapRate) > 0); } }), q('valCapRate')]),
  S('existing', 'Existing debt and payoff', 'What has to be repaid before any cash comes out.', 'Refinancing', [q('exLoanBalance', 'required'), q('exLoanRate', 'required'), q('exLoanMaturity'), q('exLoanAmort'), q('exPrepay')]),
  S('proposed', 'Proposed financing', 'The terms of the new loan.', 'Refinancing', [q('newLoanRate', 'required'), q('newLoanTerm'), q('newLoanAmort'), q('newLoanIO')]),
  S('lender', 'Lender constraints', 'The tests that size the loan, kept apart from your own assumptions.', 'Refinancing', [q('lenderMaxLTV', 'required'), q('lenderMinDSCR', 'required'), q('lenderMinDY')]),
  S('sizing', 'Debt sizing', 'The loan is the lowest the tests allow, or less if you ask for less.', 'Refinancing', [q('newLoanAmount', 'optional')]),
  S('costs', 'Refinance costs', 'Points, legal and lender fees reduce the proceeds. The prepayment penalty is entered with the existing loan.', 'Refinancing', [q('newLoanCosts', 'required')]),
  S('proceeds', 'Proceeds and equity extraction', 'Net cash out after payoff and costs, and the equity left in.', 'Refinancing', [q('value', 'derived')]),
  S('alts', 'Alternative financing scenarios', 'Compare structures side by side.', 'Refinancing', [q('refiScenarios')], { skippable:true }),
  S('review', 'Review and generate the refinance report', 'Check the result and print the report.', 'Refinance Report', []) ]);

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
