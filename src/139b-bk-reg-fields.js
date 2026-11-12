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
  F('units', 'Units', 'int', { help:'Residential units (apartments), or the suites of a building with none. Per-unit figures divide by this. Commercial suites of a mixed-use building go in Commercial units.', ex:'120' }),
  F('gsf', 'Gross building area (GBA), SF', 'int', { help:'Everything inside the building envelope: corridors, lobbies, mechanical and amenity space as well as rentable space. Construction costs per SF and the building size divide by this.', ex:'108,000' }),
  F('gla', 'Leasable area (GLA / NRA), SF', 'int', { help:'The area tenants pay rent on. Always the same as or smaller than the gross building area; the difference is the building\'s inefficiency. Rent per SF and efficiency use it. Leave blank if unknown: nothing is estimated.', ex:'96,000' }),
  F('commercialArea', 'Commercial area, SF', 'int', { help:'Retail or office space, if any.' }),
  F('commercialUnits', 'Commercial units (suites)', 'int', { help:'The retail or office suites in a mixed-use building. Shown with the commercial area and added to the residential units for the total; per-unit figures still divide by the residential units. Leave blank if there are none.', ex:'6' }),
  F('commercialRent', 'Commercial base rent, $ per SF a year', 'money', { help:'What the shops or offices pay per square foot per year before recoveries. Tenant by tenant rent, bumps and expiry go on the Tenants page.', ex:'$24' }),
  F('recovery', 'Commercial expense recoveries, $ per SF a year', 'money', { help:'What tenants repay toward taxes, insurance and common-area costs (NNN). Leave blank if the leases are gross.', ex:'$6' }),
  F('commercialVacancy', 'Commercial vacancy and credit loss', 'pct', { help:'The share of commercial rent not collected. Retail and office usually run higher than apartments.', ex:'10%', sug:function(){ return { v:0.10, why:'Small-shop retail and office are usually underwritten at about 10% vacancy and credit loss, more than apartments.' }; } }),
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
  F('oiLaundry', 'Laundry income per unit, per year', 'money', { zeroOk:true, sheet:'Revenues' }), F('oiLateFees', 'Late fees per unit, per year', 'money', { zeroOk:true, sheet:'Revenues' }), F('oiPetRent', 'Pet rent per unit, per year', 'money', { zeroOk:true, sheet:'Revenues' }), F('oiPetFees', 'Pet fees per unit, per year', 'money', { zeroOk:true, sheet:'Revenues' }), F('oiParking', 'Parking / garage income per unit, per year', 'money', { zeroOk:true, sheet:'Revenues' }), F('oiStorage', 'Storage income per unit, per year', 'money', { zeroOk:true, sheet:'Revenues' }), F('oiRubsPct', 'RUBS: share of utilities billed back', 'pct', { zeroOk:true, sheet:'Revenues' }),
  F('renoUnitsPerYear', 'Units renovated per year', 'num', { zeroOk:true, help:'The unit renovation program.', sheet:'Investment' }), F('renoDownMonths', 'Months a renovated unit is down', 'num', { zeroOk:true, sheet:'Investment' }), F('renoPremium', 'Rent premium after renovation, per unit per month', 'money', { zeroOk:true, sheet:'Investment' }), F('renoCapexPerUnit', 'Renovation capex per unit', 'money', { zeroOk:true, sheet:'Investment' }),
  F('vacancy', 'Vacancy', 'pct', { zeroOk:true, sug:sug(0.05, 'Stabilized multifamily is usually underwritten at 5%. Use more if the building is not full.') }),
  F('badDebtPct', 'Credit loss', 'pct', { zeroOk:true, sug:sug(0.01, 'About 1% of rent for a stabilized building.') }),
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
  F('acqAmort', 'Amortization, years', 'int', { sug:sug(30, '30 years is standard.') }),
  F('acqIO', 'Interest-only years', 'num', { zeroOk:true, help:'0 if none.' }),
  F('acqOrigFee', 'Origination fee, %', 'pct', { zeroOk:true, sug:sug(0.01, '1% is typical.') }),
  F('acqDSCR', 'Lender minimum DSCR', 'num'),
  /* hold and exit */
  F('holdYears', 'Hold period, years', 'int', { sug:sug(5, 'Five years is the usual base case.') }),
  F('exitCap', 'Exit cap rate', 'pct', { help:'The cap rate a buyer pays when you sell, applied to next year\'s income. Compare it with the going-in cap rate (year-1 NOI divided by the purchase price): an exit cap below the going-in cap assumes the market improves; above it is the cautious case.', sug:function(s){ var c = safe(function(){ return bkCalc(); }, {}), p = Number(s.purchasePrice) || 0; return c.noi && p ? { v:Math.round((c.noi / p + 0.0025) * 10000) / 10000, why:'The going-in cap rate (' + (c.noi / p * 100).toFixed(2) + '%) plus 0.25%, so the sale is not assumed to be better than the purchase.' } : { v:0.06, why:'No price or income yet; 6% is a placeholder.' }; } }),
  F('rentGrowth', 'Annual rent growth', 'pct', { zeroOk:true, sug:sug(0.03, '3% is a common long-run assumption; use less in a soft market.') }),
  F('opexGrowth', 'Annual expense growth', 'pct', { zeroOk:true, sug:sug(0.03, 'Expenses usually grow at about 3% a year.') }),
  F('saleCostPct', 'Cost of sale, % of price', 'pct', { zeroOk:true, sug:sug(0.02, 'Broker and closing costs on a sale are about 2%.') }),
  /* partnership */
  F('gpShare', 'GP equity contribution (% of total equity)', 'pct', { zeroOk:true, help:'How much of the equity cheque the GP puts in; the LPs put in the rest. This is money in, not profit out: the GP\'s share of the profits is set by the preferred return, catch-up and promote tiers below. Type 10 for 10%. Blank or 0% means one investor puts in all of it.' }), F('pref', 'Preferred return', 'pct', { zeroOk:true, help:'The yearly return LPs receive first, before the GP shares in profit. Type 8 for 8%. Typical: 6% to 10%.' }),
  F('hurdle2', 'Second hurdle (IRR)', 'pct', { zeroOk:true, help:'The IRR LPs must reach before the split changes. Type 12 for 12%. Must be above the preferred return. Typical: 10% to 15%.' }), F('hurdle3', 'Third hurdle (IRR)', 'pct', { zeroOk:true, help:'A higher IRR where the split changes again. Type 18 for 18%. Must be above the second hurdle. Typical: 15% to 20%.' }),
  F('t2LP', 'LP share above the preferred return', 'pct', { zeroOk:true, help:'Of each extra dollar of profit above the preferred return, the LP keeps this share and the GP gets the rest (the promote). Type 80 for an 80/20 split. Typical: 70% to 90%.' }), F('t3LP', 'LP share above the second hurdle', 'pct', { zeroOk:true, help:'The LP share once the second hurdle is passed. Usually lower than the share before it. Typical: 60% to 80%.' }), F('t4LP', 'LP share above the third hurdle', 'pct', { zeroOk:true, help:'The LP share once the third hurdle is passed. Usually the lowest. Typical: 50% to 70%.' }),
  /* decision thresholds: the lines the Hold / Refinance / Sell tests are measured against */
  F('capRefiHeadroom', 'Refinance: minimum headroom, $', 'money', { zeroOk:true, help:'How much cash a refinance must free up above the loan you have now before the test says refinance. Typical: $500,000 to $1,000,000 on a small deal.', sug:sug(1000000, 'The workbook default is $1,000,000; set it to what is worth the cost and effort of a refinance for you.') }),
  F('capRefiDebtYield', 'Refinance: minimum debt yield', 'pct', { zeroOk:true, help:'Year-1 NOI divided by the new loan. Lenders want at least this much income per dollar lent. Type 10 for 10%. Typical: 8% to 11%.', sug:sug(0.1, 'The workbook default is 10%.') }),
  F('capSellCoE', 'Sell: cash-on-equity below', 'pct', { zeroOk:true, help:'If yearly cash flow after debt service divided by equity falls below this, the test says sell. Type 4 for 4%. Typical: 3% to 6%.', sug:sug(0.04, 'The workbook default is 4%.') }),
  F('capSellNOIGrowth', 'Sell: NOI growth below', 'pct', { zeroOk:true, help:'If underwritten growth falls below this, the test says sell. Type 2 for 2%. Typical: 1% to 3%.', sug:sug(0.02, 'The workbook default is 2%.') }),
  F('capKeepCoE', 'Keep: cash-on-equity at or above', 'pct', { zeroOk:true, help:'At or above this cash-on-equity the test says keep holding. It must not be lower than the sell level. Type 5.5 for 5.5%. Typical: 5% to 8%.', sug:sug(0.055, 'The workbook default is 5.5%.') }),
  F('sourcesUses', 'Sources and uses', 'derived'),
  /* development */
  F('sourceConstruction', 'Construction budget (hard + soft)', 'money', { help:'Hard and soft costs together; the cost ladder is scaled to it. To enter the budget by $ per SF or as line items in dollars, use Investment > Budget (that replaces this total).' }),
  F('predevMonths', 'Pre-development, months', 'int', { zeroOk:true, sug:sug(6, 'Permits and bidding usually take 3 to 9 months.') }),
  F('constructionMonths', 'Construction, months', 'int', { sug:sug(18, 'Mid-rise multifamily usually builds in 16 to 24 months.') }),
  F('leaseupMonths', 'Lease-up, months', 'int', { zeroOk:true, sug:sug(12, 'New buildings usually lease up in 10 to 16 months.') }),
  F('hardContPct', 'Hard-cost contingency', 'pct', { zeroOk:true }),
  F('conLTC', 'Construction loan, % of cost', 'pct', { sug:sug(0.65, 'Construction lenders usually lend 60% to 70% of cost.') }),
  F('conRate', 'Construction loan rate', 'pct', { sug:sug(0.075, 'A placeholder until you have a quote.') }),
  F('conFixedAmt', 'Fixed facility amount', 'money', { zeroOk:true, help:'Blank sizes the loan from loan to cost.' }),
  F('permRate', 'Permanent loan rate', 'pct', { sug:sug(0.0675, 'A placeholder until you have a quote.') }),
  F('permAmort', 'Permanent amortization, years', 'int', { sug:sug(30, '30 years is standard.') }),
  F('initReserves', 'Initial reserves', 'table', { sheet:'Investment' }),
  /* tax (exists today for acquisitions) */
  F('_depr', 'Depreciation and cost segregation', 'table', { sheet:'Depreciation', help:'Land allocation, components and recovery periods.' }),
  /* calculated figures a step shows */
  F('noi', 'Net operating income', 'derived'), F('value', 'Estimated value', 'derived'),
  /* planned: Property Valuation */
  F('valAdjustments', 'Normalizing adjustments to NOI', 'table', { sheet:'Property Valuation' }), F('valStabilizedNoi', 'Stabilized NOI', 'money', { sheet:'Property Valuation' }),
  F('valCapRate', 'Market cap rate', 'pct', { sheet:'Property Valuation' }), F('valComps', 'Comparable sales', 'table', { sheet:'Property Valuation' }), F('valDate', 'Valuation date', 'text', { sheet:'Property Valuation' }),
  F('valCapInPlace', 'Cap rate for in-place NOI', 'pct', { sheet:'Property Valuation' }), F('valCapStab', 'Cap rate for stabilized NOI', 'pct', { sheet:'Property Valuation' }),
  F('valMarketRent', 'Market rent per unit, per month', 'money', { sheet:'Property Valuation' }), F('valStabVacancy', 'Stabilized vacancy', 'pct', { sheet:'Property Valuation', zeroOk:true }),
  F('valStabCost', 'Cost to stabilize', 'money', { sheet:'Property Valuation', zeroOk:true }), F('valConclusion', 'Value concluded on', 'text', { sheet:'Property Valuation' }),
  /* planned: refinancing and hold */
  F('exLoanBalance', 'Existing loan balance', 'money', {  }), F('exLoanRate', 'Existing interest rate', 'pct', {  }), F('exLoanMaturity', 'Existing maturity date', 'text', {  }),
  F('exLoanAmort', 'Existing amortization, years', 'int', {  }), F('exPrepay', 'Prepayment penalty', 'money', { zeroOk:true }),
  F('newLoanAmount', 'Proposed loan amount', 'money', {  }), F('newLoanRate', 'Proposed interest rate', 'pct', {  }), F('newLoanTerm', 'Proposed term, years', 'int', {  }),
  F('newLoanAmort', 'Proposed amortization, years', 'int', {  }), F('newLoanIO', 'Interest-only years', 'num', { zeroOk:true }), F('newLoanCosts', 'Points and closing costs', 'money', { zeroOk:true }),
  F('lenderMaxLTV', 'Lender maximum LTV', 'pct', {  }), F('lenderMinDSCR', 'Lender minimum DSCR', 'num', {  }), F('lenderMinDY', 'Lender minimum debt yield', 'pct', {  }),
  F('refiScenarios', 'Alternative financing structures', 'table', {  }),
  F('currentValue', 'Current property value', 'money', {  }), F('ownedBasis', 'Original basis and accumulated depreciation', 'table', { planned:true }),
  F('capitalProjects', 'Capital improvement program', 'table', { planned:true }), F('taxProfile', 'Tax profile and rule set', 'table', { planned:true }),
  /* planned: portfolio */
  F('holdings', 'Portfolio holdings', 'table', { planned:true }), F('portfolioScenarios', 'Portfolio scenarios', 'table', { planned:true }),
  /* planned: operating business */
  F('bizRevenue', 'Revenue and its drivers', 'table', { planned:true }), F('bizCosts', 'Cost of revenue and operating expenses', 'table', { planned:true }),
  F('bizWorkingCapital', 'Working capital', 'table', { planned:true }), F('bizCapex', 'Business capital expenditures', 'table', { planned:true }), F('bizMultiple', 'Valuation multiples', 'table', { planned:true })
]);
})();
