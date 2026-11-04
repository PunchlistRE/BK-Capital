/* ANALYSIS REGISTRY - FIELD DICTIONARY. Every input any analysis asks for, defined once: the deal key, label, kind, why it is needed, an example and,
   where there is a sensible default, a suggestion with its reason. Workflows refer to these keys and only say whether a field is required in their step.
   kind: money, pct, int, num, text, bool, choice, table (a list such as the rent roll), derived (a calculated figure shown, never typed).
   planned: the input belongs to an analysis that is not built yet; no live analysis may ask for it (BKReg.lint enforces this). */
(function(){
'use strict';
if(!window.BKReg) return;
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function F(k, label, kind, o){ return Object.assign({ k:k, label:label, kind:kind }, o || {}); }
function sug(v, why){ return function(){ return { v:v, why:why }; }; }
window.BKReg.addFields([
  /* property */
  F('name', 'Name', 'text', { help:'What the deal is called on every page and report.', ex:'14 Main Street' }),
  F('location', 'City, state', 'text', { ex:'Stamford, CT' }),
  F('propertyType', 'Property type', 'choice', { options:['Multifamily', 'Mixed-Use', 'Industrial', 'Retail', 'Office', 'Hospitality', 'Land', 'Other'] }),
  F('units', 'Units', 'int', { help:'Residential units, or suites for a commercial building. Per-unit figures divide by this.', ex:'120' }),
  F('gsf', 'Building area, SF', 'int', { help:'Gross building area. Per-SF figures divide by this.', ex:'108,000' }),
  F('commercialArea', 'Commercial area, SF', 'int', { help:'Retail or office space, if any.' }),
  F('rentRoll', 'Rent roll', 'table', { help:'Unit by unit: rent in place, market rent, lease dates. Import it or enter it on the Rent Roll sheet.', sheet:'Rent Roll' }),
  F('leases', 'Commercial tenant schedule', 'table', { help:'Tenant by tenant: rent, bumps, expiry and recoveries.', sheet:'Tenants' }),
  /* acquisition */
  F('purchasePrice', 'Purchase price', 'money', { help:'What you pay for the property.', ex:'$24,000,000' }),
  F('closingCostsPct', 'Closing costs, % of price', 'pct', { zeroOk:true, sug:sug(0.02, 'Legal, title, lender fees and inspections are typically 1.5% to 3%.') }),
  F('closing', 'Closing date', 'text', { help:'Dates the cash flows. For example 3/1/2027.', ex:'3/1/2027' }),
  F('acqStrategy', 'Investment strategy', 'choice', { options:['Stabilized', 'Value-add', 'Opportunistic', 'Lease-up', 'Redevelopment', 'Portfolio acquisition'], help:'Changes which steps apply: lease-up and renovation steps appear only where they matter.' }),
  /* income */
  F('avgRent', 'Average rent per unit, per month', 'money', { help:'Total monthly scheduled rent divided by units.', ex:'$1,650' }),
  F('otherIncomePerUnit', 'Other income per unit, per year', 'money', { zeroOk:true, help:'Laundry, parking, fees, utility bill-back.' }),
  F('vacancy', 'Vacancy', 'pct', { zeroOk:true, sug:sug(0.05, 'Stabilised multifamily is usually underwritten at 5%. Use more if the building is not full.') }),
  F('badDebtPct', 'Credit loss', 'pct', { zeroOk:true, sug:sug(0.01, 'About 1% of rent for a stabilised building.') }),
  F('concessionPct', 'Concessions', 'pct', { zeroOk:true }),
  F('lossToLeasePct', 'Loss to lease', 'pct', { zeroOk:true }),
  /* expenses */
  F('taxes', 'Real estate taxes, per year', 'money'), F('insurance', 'Insurance, per year', 'money'),
  F('utilities', 'Utilities the owner pays, per year', 'money', { zeroOk:true }), F('rm', 'Repairs and maintenance, per year', 'money'),
  F('mgmtPct', 'Management fee, % of income', 'pct', { sug:sug(0.03, 'Third-party managers charge about 3% to 5% of collected income. Include a fee even if you self-manage.') }),
  F('payroll', 'On-site payroll, per year', 'money', { zeroOk:true }), F('contract', 'Contract services (landscaping, snow, pest), per year', 'money', { zeroOk:true }), F('ga', 'General, admin and other, per year', 'money', { zeroOk:true }),
  F('reserves', 'Replacement reserves, per year', 'money', { zeroOk:true, sug:function(s){ var u = Number(s.units) || 0; return u ? { v:u * 300, why:'Reserves are usually $250 to $300 a unit a year (' + u + ' units).' } : null; } }),
  F('capex', 'Capital items', 'table', { help:'Dated one-off capital spending below NOI (roof, HVAC, renovations).', sheet:'Expenses' }),
  /* financing (acquisition loan) */
  F('debtEnabled', 'Use acquisition debt', 'bool'),
  F('acqLTV', 'Loan-to-value, max', 'pct', { sug:sug(0.65, 'Most lenders cap multifamily at 65% to 75%; 65% is a safe starting point.') }),
  F('acqRate', 'Interest rate', 'pct', { sug:sug(0.0675, 'A placeholder until you have a lender quote.') }),
  F('acqAmort', 'Amortisation, years', 'int', { sug:sug(30, '30 years is standard.') }),
  F('acqIO', 'Interest-only years', 'num', { zeroOk:true, help:'0 if none.' }),
  F('acqOrigFee', 'Origination fee, %', 'pct', { zeroOk:true, sug:sug(0.01, '1% is typical.') }),
  F('acqDSCR', 'Minimum DSCR', 'num'),
  /* hold and exit */
  F('holdYears', 'Hold period, years', 'int', { sug:sug(5, 'Five years is the usual base case.') }),
  F('exitCap', 'Exit cap rate', 'pct', { sug:function(s){ var c = safe(function(){ return bkCalc(); }, {}), p = Number(s.purchasePrice) || 0; return c.noi && p ? { v:Math.round((c.noi / p + 0.0025) * 10000) / 10000, why:'The going-in cap rate (' + (c.noi / p * 100).toFixed(2) + '%) plus 0.25%, so the sale is not assumed to be better than the purchase.' } : { v:0.06, why:'No price or income yet; 6% is a placeholder.' }; } }),
  F('rentGrowth', 'Annual rent growth', 'pct', { zeroOk:true, sug:sug(0.03, '3% is a common long-run assumption; use less in a soft market.') }),
  F('opexGrowth', 'Annual expense growth', 'pct', { zeroOk:true, sug:sug(0.03, 'Expenses usually grow at about 3% a year.') }),
  F('saleCostPct', 'Cost of sale, % of price', 'pct', { zeroOk:true, sug:sug(0.02, 'Broker and closing costs on a sale are about 2%.') }),
  /* partnership */
  F('gpShare', 'GP / sponsor equity share', 'pct', { zeroOk:true }), F('pref', 'Preferred return', 'pct', { zeroOk:true }),
  /* development */
  F('sourceConstruction', 'Construction budget (hard + soft)', 'money', { help:'Hard and soft costs together; the cost ladder is scaled to it.' }),
  F('predevMonths', 'Pre-development, months', 'int', { zeroOk:true, sug:sug(6, 'Permits and bidding usually take 3 to 9 months.') }),
  F('constructionMonths', 'Construction, months', 'int', { sug:sug(18, 'Mid-rise multifamily usually builds in 16 to 24 months.') }),
  F('leaseupMonths', 'Lease-up, months', 'int', { zeroOk:true, sug:sug(12, 'New buildings usually lease up in 10 to 16 months.') }),
  F('hardContPct', 'Hard-cost contingency', 'pct', { zeroOk:true }),
  F('conLTC', 'Construction loan, % of cost', 'pct', { sug:sug(0.65, 'Construction lenders usually lend 60% to 70% of cost.') }),
  F('conRate', 'Construction loan rate', 'pct', { sug:sug(0.075, 'A placeholder until you have a quote.') }),
  F('conFixedAmt', 'Fixed facility amount', 'money', { zeroOk:true, help:'Blank sizes the loan from loan to cost.' }),
  F('permRate', 'Permanent loan rate', 'pct', { sug:sug(0.0675, 'A placeholder until you have a quote.') }),
  F('permAmort', 'Permanent amortisation, years', 'int', { sug:sug(30, '30 years is standard.') }),
  F('initReserves', 'Initial reserves', 'table', { sheet:'Investment' }),
  /* tax (exists today for acquisitions) */
  F('_depr', 'Depreciation and cost segregation', 'table', { sheet:'Depreciation', help:'Land allocation, components and recovery periods.' }),
  /* calculated figures a step shows */
  F('noi', 'Net operating income', 'derived'), F('value', 'Estimated value', 'derived'),
  /* planned: Property Valuation */
  F('valNormalizeAdj', 'Normalizing adjustments to NOI', 'money', { planned:true, zeroOk:true }), F('valStabilizedNoi', 'Stabilized NOI', 'money', { planned:true }),
  F('valCapRate', 'Market cap rate', 'pct', { planned:true }), F('valComps', 'Comparable sales', 'table', { planned:true }), F('valDate', 'Valuation date', 'text', { planned:true }),
  /* planned: refinancing and hold */
  F('exLoanBalance', 'Existing loan balance', 'money', { planned:true }), F('exLoanRate', 'Existing interest rate', 'pct', { planned:true }), F('exLoanMaturity', 'Existing maturity date', 'text', { planned:true }),
  F('exLoanAmort', 'Existing amortization, years', 'int', { planned:true }), F('exPrepay', 'Prepayment penalty', 'money', { planned:true, zeroOk:true }),
  F('newLoanAmount', 'Proposed loan amount', 'money', { planned:true }), F('newLoanRate', 'Proposed interest rate', 'pct', { planned:true }), F('newLoanTerm', 'Proposed term, years', 'int', { planned:true }),
  F('newLoanAmort', 'Proposed amortization, years', 'int', { planned:true }), F('newLoanIO', 'Interest-only years', 'num', { planned:true, zeroOk:true }), F('newLoanCosts', 'Points and closing costs', 'money', { planned:true, zeroOk:true }),
  F('lenderMaxLTV', 'Lender maximum LTV', 'pct', { planned:true }), F('lenderMinDSCR', 'Lender minimum DSCR', 'num', { planned:true }), F('lenderMinDY', 'Lender minimum debt yield', 'pct', { planned:true }),
  F('refiScenarios', 'Alternative financing structures', 'table', { planned:true }),
  F('currentValue', 'Current property value', 'money', { planned:true }), F('ownedBasis', 'Original basis and accumulated depreciation', 'table', { planned:true }),
  F('capitalProjects', 'Capital improvement program', 'table', { planned:true }), F('taxProfile', 'Tax profile and rule set', 'table', { planned:true }),
  /* planned: portfolio */
  F('holdings', 'Portfolio holdings', 'table', { planned:true }), F('portfolioScenarios', 'Portfolio scenarios', 'table', { planned:true }),
  /* planned: operating business */
  F('bizRevenue', 'Revenue and its drivers', 'table', { planned:true }), F('bizCosts', 'Cost of revenue and operating expenses', 'table', { planned:true }),
  F('bizWorkingCapital', 'Working capital', 'table', { planned:true }), F('bizCapex', 'Business capital expenditures', 'table', { planned:true }), F('bizMultiple', 'Valuation multiples', 'table', { planned:true })
]);
})();
