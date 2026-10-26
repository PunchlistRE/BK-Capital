
/* Punchlist Capital V2.7 -- Source/Basis tagging infrastructure (V27 point 5) + Yardi portfolio
   reference dataset (V27 points 3/4) + a new read-only "Source Data" sheet under the Inputs
   group that surfaces the Yardi workbook's real property/tenant/historical data next to the
   app's current active-deal assumptions, with variances explicitly flagged rather than silently
   resolved. Per the sponsor's instruction, no active-deal field is silently overwritten by this block --
   ingesting the Yardi workbook only ADDS a reference layer and a variance report; the app's
   existing baselines (including the previously-approved $0.25/GSF Miscellaneous Other Expenses
   figure and Havard's current $914,092.20 rent-roll total) remain authoritative until the sponsor says
   otherwise.

   SOURCE LABELS -- the seven basis tags the sponsor asked for verbatim: YARDI RENT ROLL, YARDI T12,
   YARDI GL, ACQUISITION DD, USER INPUT, EXCEL MASTER, CALCULATED. bkSetSource/bkGetSource attach
   these to arbitrary field names on the active-deal state object under a `_src` map, which rides
   through bkLoad()/bkSave() automatically -- bkSave() only strips keys that are still exactly
   equal to a BK_BASE default, and `_src` is never a BK_BASE key, so it always persists untouched.
   bkEnsureSourceTagsV27() seeds real tags onto Havard's key fields the first time the app loads
   with Havard active, proving the read/write path is live rather than a cosmetic label. */
const BK_SOURCE_LABELS = ['YARDI RENT ROLL','YARDI T12','YARDI GL','ACQUISITION DD','USER INPUT','EXCEL MASTER','CALCULATED'];
function bkSetSource(state, field, source, note){
  if(!state._src) state._src = {};
  state._src[field] = {source: source, note: note||'', ts: Date.now()};
  return state;
}
function bkGetSource(state, field){
  return (state && state._src && state._src[field]) || null;
}
function bkSourceChip(state, field, fallback){
  const m = bkGetSource(state, field);
  const label = m ? m.source : (fallback||null);
  if(!label) return '';
  const cls = label==='CALCULATED' ? 'pass' : (label==='USER INPUT' ? 'warn' : 'pass');
  const title = (m && m.note) ? ` title="${String(m.note).replace(/"/g,'&quot;')}"` : '';
  return `<span class="status-chip ${cls}"${title}>${label}</span>`;
}
window.bkSetSource = bkSetSource;
window.bkGetSource = bkGetSource;
window.bkSourceChip = bkSourceChip;
window.BK_SOURCE_LABELS = BK_SOURCE_LABELS;

function bkEnsureSourceTagsV27(){
  const s = bkLoad();
  if(s._srcSeeded) return;
  if(String(s.dealId||'')==='BK-001'){
    bkSetSource(s,'rentRoll','EXCEL MASTER','Havard commercial rent roll as originally entered from the CRE Master Excel workbook. The Yardi source workbook carries a different, higher total plus a separate Ancillary Income component -- see Source Data sheet variance report. Not auto-swapped.');
    bkSetSource(s,'taxes','EXCEL MASTER','Real estate taxes per CRE Master Excel workbook.');
    bkSetSource(s,'purchasePrice','ACQUISITION DD','Matches Cost Segregation purchase price in Yardi source ($10,200,000).');
    bkSetSource(s,'miscPerGSF','USER INPUT','$0.25/GSF generic template default, kept as the approved baseline over Excel’s stale $10/GSF g_retail_opex named range per the sponsor’s explicit V26 decision.');
    bkSetSource(s,'rm','USER INPUT','App assumption ($11,900/yr). The 2025 Yardi GL actual (full itemized ledger) totals $164,058.39/yr -- see Source Data sheet variance report. Not auto-swapped.');
  }
  s._srcSeeded = true;
  bkSave(s);
}
bkEnsureSourceTagsV27();

/* BK_SOURCE_DATA -- figures transcribed directly from
   Yardi_Portfolio_Master_Source_Benchmark_FULL_DATA_v2_1.xlsx (the sponsor's upload), read with openpyxl
   in data_only mode, so every number below is the workbook's own last-calculated value -- nothing
   here is re-derived, rounded, or estimated. This object feeds no calculation automatically; it
   is rendered read-only on the new Source Data sheet and cross-checked there against the active
   deal's own assumptions. Data layers are kept separate on purpose (current rent roll vs.
   historical seller P&L vs. T-12 NOI vs. acquisition/DD detail vs. cost segregation) per V27
   point 3 -- none of these are merged into one blended number anywhere in this object. */
const BK_SOURCE_DATA = {
  asOf: 'Yardi_Portfolio_Master_Source_Benchmark_FULL_DATA_v2_1.xlsx',
  portfolio: [
    {property:'ShorePointe', type:'Residential', units:38, sf:30482, annualRent:1137042, rentPSF:37.30, t12noi:507780, expenseRatio:0.5534, capRate:0.05, vacancy:0, ownership:1, impliedValue:10155600},
    {property:'Glenbrook Commons', type:'Residential', units:17, sf:14325, annualRent:503796, rentPSF:35.17, t12noi:180568, expenseRatio:0.6416, capRate:0.0525, vacancy:0, ownership:1, impliedValue:3439390},
    {property:'Wall Street Manor', type:'Residential', units:26, sf:19520, annualRent:681300, rentPSF:34.90, t12noi:233612, expenseRatio:0.6571, capRate:0.055, vacancy:0.0385, ownership:1, impliedValue:4247491},
    {property:'Elmcrest Manor', type:'Residential', units:19, sf:17050, annualRent:573300, rentPSF:33.62, t12noi:243533, expenseRatio:0.5752, capRate:0.055, vacancy:0, ownership:1, impliedValue:4427873},
    {property:'Rowayton Gardens', type:'Residential', units:23, sf:14800, annualRent:522696, rentPSF:35.32, t12noi:166562, expenseRatio:0.6813, capRate:0.0625, vacancy:0, ownership:1, impliedValue:2664992},
    {property:'71 Haviland', type:'Residential', units:1, sf:2718, annualRent:114000, rentPSF:41.94, t12noi:58292, expenseRatio:0.4887, capRate:0.06, vacancy:0, ownership:1, impliedValue:971533},
    {property:'180-200 Harvard', type:'Industrial', units:5, sf:63447, annualRent:1019536, rentPSF:16.07, t12noi:899039, expenseRatio:0.1182, capRate:0.07, vacancy:0, ownership:0.5, impliedValue:12843414, dealId:'BK-001'},
    {property:'331 Selleck', type:'Industrial', units:1, sf:15280, annualRent:302386, rentPSF:19.79, t12noi:201050, expenseRatio:0.3351, capRate:0.07, vacancy:0, ownership:0.5, impliedValue:2872143},
    {property:'Lenox Partners', type:'Industrial', units:1, sf:1115, annualRent:37944, rentPSF:34.03, t12noi:21135, expenseRatio:0.443, capRate:0.0675, vacancy:0, ownership:0.5, impliedValue:313111},
    {property:'81 Southfield', type:'Industrial', units:1, sf:17900, annualRent:256865, rentPSF:14.35, t12noi:198365, expenseRatio:0.2277, capRate:0.0675, vacancy:0, ownership:1, impliedValue:2938741},
    {property:'1363 Seaview', type:'Industrial', units:1, sf:10000, annualRent:100447, rentPSF:10.04, t12noi:86416, expenseRatio:0.1397, capRate:0.0725, vacancy:0, ownership:1, impliedValue:1191945},
    {property:'1387 Seaview', type:'Office / Yard', units:1, sf:15000, annualRent:187500, rentPSF:12.50, t12noi:161300, expenseRatio:0.1397, capRate:0.0725, vacancy:0, ownership:1, impliedValue:2224955},
  ],
  targets: [
    {property:'1 Selleck St', type:'Office - Target Buy', sf:60000},
    {property:'Testa Assemblage', type:'Industrial / Development Target', sf:57820},
  ],
  harvard: {
    dealId: 'BK-001',
    asOfDate: '2026-03-17',
    rentRoll: [
      {tenant:'Integrity Automotive, LLC (#1)', unit:'180-1', type:'Industrial', sf:10447, monthlyRent:15761, ancillary:1741, annualRent:210024, leaseStart:'2025-11-01', leaseEnd:'2033-10-31', rentPSF:20.10},
      {tenant:'Integrity Automotive, LLC (#2)', unit:'180-2', type:'Industrial', sf:15000, monthlyRent:20000, ancillary:2500, annualRent:270000, leaseStart:'2026-03-01', leaseEnd:'2033-10-31', rentPSF:18.00},
      {tenant:'Soule, Blake & Wechsler, Inc.', unit:'180-3', type:'Office', sf:5000, monthlyRent:8053, ancillary:833, annualRent:106642, leaseStart:'2026-02-01', leaseEnd:'2027-01-31', rentPSF:21.33},
      {tenant:'ServiceMaster, TRS', unit:'200-1', type:'Industrial', sf:16500, monthlyRent:17385, ancillary:2750, annualRent:241624, leaseStart:'2026-02-01', leaseEnd:'2028-01-31', rentPSF:14.64},
      {tenant:'Torqmaster, Inc.', unit:'200-2', type:'Industrial', sf:16500, monthlyRent:15662, ancillary:275, annualRent:191246, leaseStart:'2026-02-01', leaseEnd:'2028-01-31', rentPSF:11.59},
    ],
    rentRollTotals: {sf:63447, monthlyRent:76862, ancillary:8100, annualRent:1019536, rentPSF:16.07},
    t12noi: 899039, expenseRatio:0.1182, capRate:0.07, vacancy:0, ownership:0.5, impliedValue:12843414,
    sellerPL: {
      note: '200 Harvard Corp. Profit & Loss, seller-prepared, pre-acquisition ownership (DD source pages 6-7). Includes several one-time/non-operating lines (Depreciation, Amortization, CT Income Tax, Synetra Loan interest, and a $442,289.60 2023 Professional Fees line that reads as a legal/transaction cost, not recurring opex) -- shown exactly as supplied, not reclassified or netted out.',
      y2022: {totalIncome:1043341.37, totalExpense:634160.95, netIncome:369280.42},
      y2023: {totalIncome:1076712.65, totalExpense:1024138.07, netIncome:52574.58},
    },
    rm2025Total: 164058.39,
    rm2025Note: '200 Harvard Corp. Transaction Detail By Account -- Repairs & Maintenance, Jan-Dec 2025, full itemized vendor/date ledger (DD source page 14). Exact source total.',
    costSeg: {
      purchasePrice:10200000, landValue:4780515.60, landPct:0.468678, depreciableBasis:5419484.4013,
      fiveYear:601581.5105, fiveYearPct:0.1110034583, fifteenYear:605477.3797, fifteenYearPct:0.1117223217,
      thirtyNineYear:4212425.5111, thirtyNineYearPct:0.77727422, netAccDep2025:1207058.8902,
      estTaxSavings2025:446611.7894, costSegFee:5000, paybackRatio:'89:1',
    },
    janFeb2026Reimbursement: {
      note: 'Native Yardi commercial reconciliation rows for Jan/Feb 2026 (real estate tax, insurance, gas, water, electric, snow, pest, management-fee recoveries). Source explicitly flags: "do not allocate 100% to Harvard unless property-level support identifies Harvard" -- these are portfolio-level commercial reconciliation rows, not confirmed Harvard-only cash flow, and are NOT included in any Harvard total on this sheet.',
      jan2026Total: 82266.08, feb2026Total: 25835.66,
    },
    capexHistory: [
      {period:'2019-2020', item:'Roof replacement', amount:288238},
      {period:'2020-2021', item:'Brick wall veneer demo, waterproofing & roof extension', amount:302528},
      {period:'2021-2023', item:'Building painting / improvements', amount:115191},
      {period:'2022-2023', item:'New windows', amount:298910},
      {period:'2023', item:'Other capex', amount:83505},
      {period:'2023-2024', item:'Windows / loading dock on 180 building', amount:55000},
      {period:'2023-2024', item:'2nd floor bathrooms in 200 building', amount:139000},
      {period:'2023-2024', item:'New bath on 1st floor 200 building', amount:112000},
      {period:'2023-2024', item:'Air-conditioning replacement in S&W space', amount:35000},
    ],
    capexHistoryTotal: 1424952,
    costSegExtra: {
      note: 'Confirmed against the dedicated Cost_Segregation_Harvard.xlsx workbook (the sponsor’s separate upload) -- a standalone tax/fixed-asset source layer, deliberately NOT mixed into property NOI or operating cash flow anywhere in this app.',
      datePlacedInService: '2025-12-11',
      capitalImprovements: 0,
      streetAddress: '180-200 Harvard Avenue, Stamford, CT 06902',
    },
    depreciationAnnualSchedule: {
      note: 'From Cost_Segregation_Harvard.xlsx, "Depreciation by Asset" tab -- annual depreciation by recovery-period category. Reference only for a future After-Tax wire-up; not applied to any NOI/CF figure on this sheet or elsewhere in the app.',
      rows: [
        {period:'5-Year Property', y2025:601581.5105427032, y2026:0, thereafter:0},
        {period:'7-Year Property (FF&E)', y2025:0, y2026:0, thereafter:0},
        {period:'15-Year Property', y2025:605477.3796771151, y2026:0, thereafter:0},
        {period:'39-Year Property', y2025:0, y2026:108010.91054052017, thereafter:108010.91054052017},
      ],
    },
    lease: {
      note: 'Tenant-level contractual lease abstracts (Hathaway property-management lease summaries + amendments, from Harvard_Summary.pdf) -- a SEPARATE source layer from the Yardi property-management setup. the sponsor personally built the Yardi Harvard rent roll and reimbursement setup, so Yardi here is treated as a deliberate structured implementation of these lease economics, not generic third-party data -- but the two layers are still kept distinct and reconciled explicitly below, never merged. Contractual lease terms (base rent, escalation mechanics) are the forward-looking source of truth for projections; Yardi GL remains the historical-actuals source; any underwriting override of either must be explicit and source-labeled (V27 point 3).',
      tenants: [
        {
          yardiTenant:'Integrity Automotive, LLC (#1)', unit:'180-1',
          leaseTenant:'Integrity Greenwich, LLC (Jeffrey M. Weiner)', leaseDate:'2023-10-31',
          premises:'10,447 SF of the 1st floor, 180 Harvard Ave', term:'11/1/2023 - 10/31/2033 (10-yr)',
          leaseBaseRentMonthly:14910.91, leaseBaseRentAsOf:'2023 lease commencement (First Space)',
          escalation:'Annual adjustment per Consumer Price Index (CPI-U less food & energy, Dec-over-Dec change)', leaseType:'NNN',
          reimbursementPct:'16.5% of snow/grounds/PM/insurance/taxes/water/sewer; 34.3% of gas & electric',
          securityDeposit:44400, renewalOptions:'None stated for First Space',
          specialProvisions:['Non-structural alterations under $10k allowed without LL consent','Demo clause: LL may terminate with 24-month notice to redevelop','Surrender fee 20% of Base + Additional Rent (incl. taxes) for balance of lease term'],
          yardiBaseRentMonthly:15761, yardiAncillaryMonthly:1741, yardiLeaseStart:'2025-11-01', yardiLeaseEnd:'2033-10-31',
          nameVariance:'Lease names the tenant "Integrity Greenwich, LLC"; the Yardi rent roll names it "Integrity Automotive, LLC" - same premises/economics, entity name not reconciled from source. Flagged, not resolved.',
        },
        {
          yardiTenant:'Integrity Automotive, LLC (#2)', unit:'180-2',
          leaseTenant:'Integrity Greenwich, LLC (Jeffrey M. Weiner) - Second Space of the same lease', leaseDate:'2023-10-31',
          premises:'15,000 SF of the 1st floor, 180 Harvard Ave (contiguous with First Space)', term:'Second Space: tentatively 3/1/2025 - 10/31/2033',
          leaseBaseRentMonthly:20000, leaseBaseRentAsOf:'2023 lease (tentative Second Space occupancy rate)',
          escalation:'Annual adjustment per Consumer Price Index (CPI-U less food & energy, Dec-over-Dec change)', leaseType:'NNN',
          reimbursementPct:'24% of snow/grounds/PM/insurance/taxes/water/sewer; 49.2% of gas & electric',
          securityDeposit:60000, renewalOptions:'None stated',
          specialProvisions:['Predecessor tenant (Rollease Acmeda, Inc.) occupied this space through its 1/31/2025 extension'],
          yardiBaseRentMonthly:20000, yardiAncillaryMonthly:2500, yardiLeaseStart:'2026-03-01', yardiLeaseEnd:'2033-10-31',
          dateVariance:'Lease abstract shows Integrity taking the Second Space "tentatively 3/1/25"; the Yardi setup shows actual commencement 3/1/2026 - a full year later than the lease abstract’s tentative date. Flagged as a timing slip, not corrected.',
        },
        {
          yardiTenant:'Torqmaster, Inc.', unit:'200-2',
          leaseTenant:'Torqmaster, Inc. (Garrett Bebell)', leaseDate:'2017-12-18',
          premises:'16,500 SF, entire 2nd floor, 200 Harvard Ave', term:'2/1/2018 orig.; 1st Amendment (5/6/2022) extended 1/31/2023-1/31/2028; (1) 5-yr renewal option',
          leaseBaseRentMonthly:14729.58, leaseBaseRentAsOf:'1st Amendment rate, through 1/31/2025',
          escalation:'No less than 3% or CPI, whichever is greater, annually', leaseType:'NNN (tenant pays own utilities + share of operating costs)',
          reimbursementPct:'Not separately itemized in this abstract (Additional Rent as defined in the Lease)',
          securityDeposit:null, renewalOptions:'(1) 5-year extension option',
          specialProvisions:['LL to renovate large men’s/women’s restrooms per 1st Amendment'],
          yardiBaseRentMonthly:15662, yardiAncillaryMonthly:275, yardiLeaseStart:'2026-02-01', yardiLeaseEnd:'2028-01-31',
        },
        {
          yardiTenant:'ServiceMaster, TRS', unit:'200-1',
          leaseTenant:'Kleen Sweep Ventures, Inc. dba ServiceMaster (Steve R. Willis)', leaseDate:'2018-01-08',
          premises:'16,500 SF, entire 1st floor, 200 Harvard Ave', term:'2/1/2018 - 1/31/2028 (10-yr)',
          leaseBaseRentMonthly:16387.35, leaseBaseRentAsOf:'through 1/31/2025 (a handwritten source annotation suggests a further step to roughly $17,385)',
          escalation:'Annual Base Rent amounts defined per year directly in the lease (not a flat CPI formula in this abstract)', leaseType:'NNN',
          reimbursementPct:'26% of snow/PM/insurance/taxes/sewer/water; 50% of gas & electric',
          securityDeposit:27500, renewalOptions:'Not stated in this abstract',
          specialProvisions:['Tenant holds a Right of First Refusal (ROFR) to purchase 180-200 Harvard Ave on 30 days’ notice of intent to sell, with a 20-day window to enter a PSA','LL has the right to review tenant financials annually'],
          yardiBaseRentMonthly:17385, yardiAncillaryMonthly:2750, yardiLeaseStart:'2026-02-01', yardiLeaseEnd:'2028-01-31',
        },
        {
          yardiTenant:'Soule, Blake & Wechsler, Inc.', unit:'180-3',
          leaseTenant:'Soule, Blake & Wechsler, Inc. (R. Steven Soule)', leaseDate:'2018-01-19',
          premises:'5,000 SF, 2nd floor, 180 Harvard Ave', term:'2/1/2018 orig. 5-yr; 1st Amendment (9/29/2022) extended 1/31/2023-1/31/2025; (2) 2-yr renewal options',
          leaseBaseRentMonthly:7383.00, leaseBaseRentAsOf:'1st Amendment rate (a separate CPI recalculation letter dated 1/18/2023 computed $7,292.07 for 2/1/23-1/31/24 - the two source documents disagree by $90.93/mo; both shown as-supplied, not reconciled to one number)',
          escalation:'No less than 3% or CPI (CPI-U less food & energy, Dec-over-Dec), whichever is larger, annually', leaseType:'Base rent + proportionate share (not stated as strict NNN)',
          reimbursementPct:'8% of snow/PM/insurance/taxes/sewer/water; 16.4% of gas/electric/other operating costs',
          securityDeposit:12500, renewalOptions:'(2) 2-year extension options',
          specialProvisions:['LL provided a $75k improvement allowance, credited as a rent abatement over the first 12 months (historical, fully realized)'],
          yardiBaseRentMonthly:8053, yardiAncillaryMonthly:833, yardiLeaseStart:'2026-02-01', yardiLeaseEnd:'2027-01-31',
        },
      ],
    },
  },
  t12Consolidated: {
    note: 'Yardi_Trailing-12_March_2026.xlsx - a PORTFOLIO-CONSOLIDATED (entity-level) trailing-12 P&L covering ALL commercial properties (180-200 Harvard, 331 Selleck, Lenox Partners, 81 Southfield, 1363 Seaview, 1387 Seaview) blended into single commercial line items, plus all residential properties blended separately. It cannot be decomposed to a Harvard-only figure from this file alone, and is NOT allocated to Harvard anywhere in this app -- shown for portfolio-level context only, consistent with the DD source’s own "do not allocate 100% to Harvard" caution.',
    periodEnd: '2026-03-31',
    totalCommercialRentalIncomeT12: 1201317.13,
    totalResidentialRentalIncomeT12: 3703892.66,
    totalOtherIncomeT12: 179185.41,
    effectiveGrossIncomeT12: 5084395.20,
    totalNonRecoverableExpensesT12: 155440.60,
    totalOperatingExpensesT12: 1815828.86,
    totalOtherExpensesT12: 499952.40,
    totalExpensesFeesT12: 2471221.86,
    netOperatingIncomeT12: 2613173.34,
  },
};
window.BK_SOURCE_DATA = BK_SOURCE_DATA;

// V29 -- Harvard NNN / reimbursement GROSS-vs-NET reconciliation (BK's explicit ask).
// INVESTIGATION FINDING (before any change was made, per BK's instruction to inspect first):
// the live engine (bkCalc/bkAnnualCF) already presents Havard on a GROSS NNN basis --
// EGI = ... + Commercial Base Rent + Pass-Through Recoveries + ... ; Expenses = the full
// landlord-paid GROSS bill (RE Taxes, Insurance, Utilities, R&M, etc., unreduced); NOI = EGI -
// Gross Expenses. Recoveries are added to revenue exactly once and are NEVER also subtracted a
// second time from the expense side -- there is no mechanical double-count in the current
// formula. RE Taxes in particular is unambiguous: a landlord always pays a property's full tax
// bill and separately bills tenants for their share, so $145,000 cannot be anything but gross.
// This function does NOT change bkCalc()/bkAnnualCF() -- Havard's live NOI, debt sizing, IRR and
// MOIC are byte-identical to the V26/V27/V28 baseline. What it adds is the NET LANDLORD EXPENSE
// restatement BK asked to see, proven algebraically (not assumed) to tie to the exact same NOI:
// Net Landlord Expenses := Gross Expenses - Recoveries, so
//   NET:   Base Rent + Other Income - Net Landlord Expenses
//   GROSS: Base Rent + Recoveries + Other Income - Gross Expenses
// are the same expression re-parenthesized -- they cancel to an identical NOI by construction,
// confirmed numerically below (bkTie) rather than taken on faith.
// "Reimbursable Expenses" is reported as EQUAL TO Recoveries (i.e., what's actually billed/
// collected), not rebuilt bottom-up from the expense ledger -- the lease abstracts define
// reimbursement pools ("16.5% of snow/grounds/PM/insurance/taxes/water/sewer; 34.3% of gas &
// electric", etc.) that don't map 1:1 onto this app's own expense line items (RE Taxes/
// Insurance/Utilities/R&M/Contract/Payroll/... are Excel Source-Economics categories, not the
// lease's own reimbursement-pool categories), so a clean line-by-line gross/reimbursable split
// is not determinable from the available source documents. That gap is disclosed, not guessed.
// Two further items are explicitly flagged REVIEW rather than silently classified either way:
//   - Utilities ($106,951/yr): the Excel Deal Underwrite label is "Utilities (net of RUBS)" --
//     RUBS (Ratio Utility Billing System) is a RESIDENTIAL submetering mechanism. Havard is 100%
//     commercial, so this label may just be inherited template boilerplate rather than an
//     accurate description of what this figure represents for Havard. Whether $106,951 is the
//     full gross building utility bill or already net of some billback is NOT determinable from
//     the source documents supplied -- flagged, not assumed either way.
//   - Ancillary Income ($8,100/mo Yardi rent roll, $97,200/yr, not modeled anywhere in the app):
//     no source document defines what this line actually is (parking/storage/late fees = genuine
//     income; a NNN reimbursement bucket booked separately from "recovery" = pass-through). Left
//     entirely out of both the gross and net NOI figures below (as it already was before this
//     patch) and flagged REVIEW rather than guessed into either bucket.
function bkHarvardNNNReconciliationV29(){
  const c = bkCalc();
  const rrs = bkRentRollStats(bkLoad().rentRoll);
  const baseRent = c.commercial;                 // contractual base rent (rent-roll driven)
  const recoveries = c.recovery;                 // pass-through recoveries -- already gated to
                                                  // active-lease units only (V28.1 Proof Point 2 fix
                                                  // lives in bkRentRollStats/bkRecoveryActive, which
                                                  // c.recovery reads through unchanged here)
  const vacCredit = c.commercialVac;              // commercial vacancy/credit loss allowance (contra-revenue, negative)
  const otherIncome = c.other;                    // non-pass-through other income (Ancillary Income excluded -- see note above)
  const grossExpenses = c.total;                  // full landlord-paid gross expense bundle
  const reimbursableExpenses = recoveries;        // implied = what's actually billed back (see note above)
  const netLandlordExpenses = grossExpenses - reimbursableExpenses;
  const noiGross = baseRent + recoveries + vacCredit + otherIncome - grossExpenses;
  const noiNet = baseRent + vacCredit + otherIncome - netLandlordExpenses;
  const tie = Math.abs(noiGross - noiNet) < 0.005 && Math.abs(noiGross - c.noi) < 0.005;
  return {baseRent, recoveries, vacCredit, otherIncome, grossExpenses, reimbursableExpenses,
    netLandlordExpenses, noiGross, noiNet, tie, engineNOI:c.noi,
    gatedCount: rrs.commRecoveriesGatedCount||0, gatedAnnual: rrs.commRecoveriesGatedAnnual||0};
}
window.bkHarvardNNNReconciliationV29 = bkHarvardNNNReconciliationV29;

// Shared Harvard lease-vs-Yardi reconciliation, computed once and consumed by both the Source
// Data sheet and the QA sheet's new "Harvard Lease vs. Yardi Setup" test block below, so the two
// views can never drift from each other. Each row carries the exact LEASE SOURCE / YARDI SETUP /
// VARIANCE / STATUS shape BK asked for.
function bkHarvardLeaseReconciliationV27(){
  const hv = BK_SOURCE_DATA.harvard;
  return hv.lease.tenants.map(t=>{
    const varDollar = t.yardiBaseRentMonthly - t.leaseBaseRentMonthly;
    const varPct = t.leaseBaseRentMonthly ? varDollar/t.leaseBaseRentMonthly : 0;
    const flags = [];
    if(t.nameVariance) flags.push('NAME VARIANCE');
    if(t.dateVariance) flags.push('DATE VARIANCE');
    const bigVar = Math.abs(varPct) > 0.10;
    const cls = bigVar ? 'fail' : (flags.length ? 'warn' : 'pass');
    const label = bigVar ? 'REVIEW' : (flags.length ? flags.join(' + ') : 'PASS - within escalation range');
    const notes = [t.nameVariance, t.dateVariance].filter(Boolean).join(' ');
    return {tenant:t, varDollar, varPct, cls, label, notes, bigVar, flagged: flags.length>0};
  });
}
window.bkHarvardLeaseReconciliationV27 = bkHarvardLeaseReconciliationV27;

function sheetSourceDataV27(){
  const s = bkLoad();
  const rrStats = bkRentRollStats(s.rentRoll);
  const appRentRollAnnual = (rrStats.commInPlace||0) + (rrStats.resInPlace||0);
  let appNOIy1 = null;
  try{ appNOIy1 = bkAnnualCF().arr[0].after; }catch(e){ appNOIy1 = null; }

  const isHarvard = String(s.dealId||'')==='BK-001';
  const hv = BK_SOURCE_DATA.harvard;

  const portRows = BK_SOURCE_DATA.portfolio.map(p=>`<tr><td class="rowlabel">${p.property}${p.dealId?` <span style="opacity:.6">(${p.dealId})</span>`:''}</td><td>${p.type}</td><td>${p.units}</td><td>${bkFmt(p.sf)}</td><td>$${bkFmt(p.annualRent)}</td><td>$${p.rentPSF.toFixed(2)}</td><td>$${bkFmt(p.t12noi)}</td><td>${bkPct(p.expenseRatio)}</td><td>${bkPct(p.capRate)}</td><td>${bkPct(p.vacancy)}</td><td>${bkPct(p.ownership)}</td><td>$${bkFmt(p.impliedValue)}</td></tr>`).join('');
  const targetRows = BK_SOURCE_DATA.targets.map(p=>`<tr><td class="rowlabel">${p.property}</td><td>${p.type}</td><td>-</td><td>${bkFmt(p.sf)}</td><td colspan="8" style="text-align:left;opacity:.7">Target acquisition - no operating history yet.</td></tr>`).join('');

  const portfolioTable = `<div class="tbl-wrap"><table class="fin"><caption>Yardi Portfolio Reference - Property Summary (source: ${BK_SOURCE_DATA.asOf})</caption>
    <thead><tr><th class="rowlabel-h">Property</th><th>Type</th><th>Units</th><th>SF</th><th>Annual Rent</th><th>Rent/SF</th><th>T-12 NOI</th><th>Exp. Ratio</th><th>Cap Rate</th><th>Vacancy</th><th>Ownership</th><th>Implied Value</th></tr></thead>
    <tbody>${portRows}${targetRows}</tbody></table></div>
    <div class="note-flag"><span>&#8505;</span><div><b>Read-only reference layer.</b> Transcribed from the Yardi portfolio workbook the sponsor supplied. It does not feed any calculation automatically -- it exists so every assumption in this app can be checked against real portfolio data, with an explicit source/basis tag on every comparison (V27 point 5).</div></div>`;

  let harvardBlock;
  if(isHarvard){
    const rrVarDollar = appRentRollAnnual - hv.rentRollTotals.annualRent;
    const rrVarPct = hv.rentRollTotals.annualRent ? rrVarDollar/hv.rentRollTotals.annualRent : 0;
    const rrStatus = Math.abs(rrVarPct) <= 0.02 ? 'pass' : 'warn';
    const noiVarDollar = (appNOIy1!=null ? appNOIy1 : 0) - hv.t12noi;
    const noiVarPct = hv.t12noi ? noiVarDollar/hv.t12noi : 0;
    const noiStatus = appNOIy1==null ? 'fail' : (Math.abs(noiVarPct)<=0.02 ? 'pass':'warn');
    const rmVarDollar = Number(s.rm||0) - hv.rm2025Total;
    const rmVarPct = hv.rm2025Total ? rmVarDollar/hv.rm2025Total : 0;
    const rmStatus = Math.abs(rmVarPct)<=0.05 ? 'pass' : 'fail';
    const nnn = bkHarvardNNNReconciliationV29();

    const rrRows = hv.rentRoll.map(t=>`<tr><td class="rowlabel">${t.tenant}</td><td>${t.unit}</td><td>${t.type}</td><td>${bkFmt(t.sf)}</td><td>$${bkFmt(t.monthlyRent)}</td><td>$${bkFmt(t.ancillary)}</td><td>$${bkFmt(t.annualRent)}</td><td>${t.leaseStart} - ${t.leaseEnd}</td></tr>`).join('');

    const leaseRecon = bkHarvardLeaseReconciliationV27();
    const leaseRows = leaseRecon.map(({tenant:t, varDollar, varPct, cls, label, notes})=>{
      return `<tr><td class="rowlabel">${t.yardiTenant}<div style="font-size:11px;opacity:.7;margin-top:2px">Lease: ${t.leaseTenant}</div></td><td>${t.unit}</td><td>$${bkFmt(t.leaseBaseRentMonthly)}/mo<div style="font-size:10px;opacity:.65">${t.leaseBaseRentAsOf}</div></td><td>$${bkFmt(t.yardiBaseRentMonthly)}/mo + $${bkFmt(t.yardiAncillaryMonthly)} anc.<div style="font-size:10px;opacity:.65">${t.yardiLeaseStart} - ${t.yardiLeaseEnd}</div></td><td>${bkFmt(varDollar)} (${bkPct(varPct)})</td><td><span class="status-chip ${cls}">${label}</span>${notes?`<div style="font-size:10px;opacity:.75;margin-top:3px;max-width:220px">${notes}</div>`:''}</td></tr>`;
    }).join('');

    const leaseDetailCards = hv.lease.tenants.map(t=>`<div class="card" style="margin-bottom:10px"><div class="card-head">${t.yardiTenant} - ${t.unit}</div><div class="metric-list">
      <div class="metric-row"><span class="k">Premises</span><span class="v" style="text-align:left">${t.premises}</span></div>
      <div class="metric-row"><span class="k">Term</span><span class="v" style="text-align:left">${t.term}</span></div>
      <div class="metric-row"><span class="k">Escalation</span><span class="v" style="text-align:left">${t.escalation}</span></div>
      <div class="metric-row"><span class="k">Lease Type</span><span class="v">${t.leaseType}</span></div>
      <div class="metric-row"><span class="k">Reimbursement %</span><span class="v" style="text-align:left">${t.reimbursementPct}</span></div>
      <div class="metric-row"><span class="k">Security Deposit</span><span class="v">${t.securityDeposit!=null?'$'+bkFmt(t.securityDeposit):'Not stated'}</span></div>
      <div class="metric-row"><span class="k">Renewal Options</span><span class="v" style="text-align:left">${t.renewalOptions}</span></div>
      ${t.specialProvisions&&t.specialProvisions.length?`<div class="metric-row"><span class="k">Special Provisions</span><span class="v" style="text-align:left">${t.specialProvisions.join('; ')}</span></div>`:''}
    </div></div>`).join('');

    harvardBlock = `
    <div class="tbl-wrap" style="margin-top:20px"><table class="fin"><caption>Havard Avenue - Yardi Current Rent Roll (as of ${hv.asOfDate}) ${bkSourceChip(s,'_yardiRentRoll','YARDI RENT ROLL')}</caption>
      <thead><tr><th class="rowlabel-h">Tenant</th><th>Unit</th><th>Type</th><th>SF</th><th>Monthly Rent</th><th>Ancillary Income</th><th>Annual Rent</th><th>Lease Term</th></tr></thead>
      <tbody>${rrRows}<tr class="grandtotal"><td class="rowlabel">TOTAL / WEIGHTED</td><td>${bkFmt(hv.rentRollTotals.sf)}</td><td></td><td></td><td>$${bkFmt(hv.rentRollTotals.monthlyRent)}</td><td>$${bkFmt(hv.rentRollTotals.ancillary)}</td><td>$${bkFmt(hv.rentRollTotals.annualRent)}</td><td></td></tr></tbody></table></div>
    <div class="note-flag"><span>&#9888;</span><div><b>Ancillary Income is not yet modeled as its own field.</b> The Yardi rent roll carries a separate Ancillary Income component ($${bkFmt(hv.rentRollTotals.ancillary)}/mo, $${bkFmt(hv.rentRollTotals.ancillary*12)}/yr) alongside base rent that this app's current Rent Roll data model has no dedicated line for. It is NOT included in the app's commercial base rent figure below. Flagged per V27 point 7 -- not silently added to any total.</div></div>

    <div class="tbl-wrap" style="margin-top:20px"><table class="fin"><caption>Havard Avenue - App vs. Yardi Source Variance Report</caption>
      <thead><tr><th class="rowlabel-h">Metric</th><th>App (current baseline)</th><th>Yardi Source</th><th>Variance $</th><th>Variance %</th><th>Basis</th><th>Status</th></tr></thead>
      <tbody>
        <tr><td class="rowlabel">Commercial Base Rent (annual)</td><td>$${bkFmt(appRentRollAnnual)}</td><td>$${bkFmt(hv.rentRollTotals.annualRent)}</td><td>${rrVarDollar<0?'($'+bkFmt(-rrVarDollar)+')':'$'+bkFmt(rrVarDollar)}</td><td>${bkPct(rrVarPct)}</td><td>EXCEL MASTER vs YARDI RENT ROLL</td><td><span class="status-chip ${rrStatus}">${rrStatus==='pass'?'PASS':'REVIEW'}</span></td></tr>
        <tr><td class="rowlabel">Ancillary Income (annual)</td><td>$0 (not modeled)</td><td>$${bkFmt(hv.rentRollTotals.ancillary*12)}</td><td>-</td><td>-</td><td>YARDI RENT ROLL</td><td><span class="status-chip warn">NOT YET INGESTED</span></td></tr>
        <tr><td class="rowlabel">Year-1 NOI (after reserves)</td><td>${appNOIy1!=null?'$'+bkFmt(appNOIy1):'n/a'}</td><td>$${bkFmt(hv.t12noi)}</td><td>${appNOIy1!=null?(noiVarDollar<0?'($'+bkFmt(-noiVarDollar)+')':'$'+bkFmt(noiVarDollar)):'-'}</td><td>${appNOIy1!=null?bkPct(noiVarPct):'-'}</td><td>CALCULATED vs YARDI T12</td><td><span class="status-chip ${noiStatus}">${noiStatus==='pass'?'PASS':'REVIEW'}</span></td></tr>
        <tr><td class="rowlabel">Repairs &amp; Maintenance (annual)</td><td>$${bkFmt(Number(s.rm||0))}</td><td>$${bkFmt(hv.rm2025Total)}</td><td>${rmVarDollar<0?'($'+bkFmt(-rmVarDollar)+')':'$'+bkFmt(rmVarDollar)}</td><td>${bkPct(rmVarPct)}</td><td>USER INPUT vs YARDI GL (2025 actual)</td><td><span class="status-chip ${rmStatus}">${rmStatus==='pass'?'PASS':'REVIEW'}</span></td></tr>
        <tr><td class="rowlabel">Miscellaneous Other Expenses ($/GSF)</td><td>$${Number(s.miscPerGSF||0).toFixed(2)}/GSF</td><td>$10.00/GSF (Excel named range g_retail_opex)</td><td>-</td><td>-</td><td>USER INPUT vs EXCEL MASTER</td><td><span class="status-chip warn">INTENTIONAL DIVERGENCE - kept per the sponsor decision (V26)</span></td></tr>
      </tbody></table></div>
    <div class="note-flag"><span>&#9888;</span><div><b>No baseline changed as a result of this table.</b> Both the Commercial Base Rent and Repairs &amp; Maintenance rows show a material variance against real Yardi/GL source data. Per V27 point 5 ("prevent stale source data from silently overriding current underwriting assumptions"), this app does NOT auto-swap either figure - Havard's regression-locked baseline stays exactly as verified in V24-V26 until the sponsor reviews this table and decides which figure should govern.</div></div>

    <div class="tbl-wrap" style="margin-top:20px"><table class="fin"><caption>Harvard - NNN / Reimbursement GROSS vs. NET Reconciliation (Year-1 stabilized)</caption>
      <thead><tr><th class="rowlabel-h">Line</th><th>Amount</th><th>Basis / Note</th></tr></thead>
      <tbody>
        <tr><td class="rowlabel">Base Rent (contractual, rent-roll driven)</td><td>$${bkFmt(nnn.baseRent)}</td><td>Not reimbursement income - never mixed with recoveries</td></tr>
        <tr><td class="rowlabel">Pass-Through Recoveries</td><td>$${bkFmt(nnn.recoveries)}</td><td>Gated to units with an active lease (V28.1 fix)${nnn.gatedCount>0?` - ${nnn.gatedCount} unit(s), $${bkFmt(nnn.gatedAnnual)}/yr currently excluded`:''}</td></tr>
        <tr><td class="rowlabel">Commercial Vacancy / Credit Loss</td><td>${nnn.vacCredit<0?'($'+bkFmt(-nnn.vacCredit)+')':'$'+bkFmt(nnn.vacCredit)}</td><td>Contra-revenue allowance applied to (Base Rent + Recoveries)</td></tr>
        <tr><td class="rowlabel">Other Income (non-pass-through)</td><td>$${bkFmt(nnn.otherIncome)}</td><td>Ancillary Income ($97,200/yr, Yardi) is NOT included - nature undetermined, see flag below</td></tr>
        <tr class="section"><td colspan="3">GROSS Presentation</td></tr>
        <tr><td class="rowlabel">Gross Expenses (full landlord-paid bundle)</td><td>$${bkFmt(nnn.grossExpenses)}</td><td>RE Taxes + Insurance + Utilities + R&amp;M + Contract + Payroll + Turnover + Marketing + GA + Mgmt Fee + Misc - unreduced</td></tr>
        <tr class="grandtotal"><td class="rowlabel">NOI - GROSS (Base Rent + Recoveries + Vac/Credit + Other - Gross Expenses)</td><td>$${bkFmt(nnn.noiGross)}</td><td>Matches the live engine's Year-1 NOI exactly</td></tr>
        <tr class="section"><td colspan="3">NET Presentation (the sponsor's requested restatement)</td></tr>
        <tr><td class="rowlabel">Reimbursable Expenses (implied = Recoveries collected)</td><td>$${bkFmt(nnn.reimbursableExpenses)}</td><td>Not separately determinable line-by-line from source (see note below) - taken as what's actually billed</td></tr>
        <tr><td class="rowlabel">Net Landlord Expenses (Gross - Reimbursable)</td><td>$${bkFmt(nnn.netLandlordExpenses)}</td><td>Gross Expenses net of Recoveries</td></tr>
        <tr class="grandtotal"><td class="rowlabel">NOI - NET (Base Rent + Vac/Credit + Other - Net Landlord Expenses)</td><td>$${bkFmt(nnn.noiNet)}</td><td>${nnn.tie?'TIES EXACTLY to GROSS and to the live engine NOI':'DOES NOT TIE - investigate'}</td></tr>
      </tbody></table></div>
    <div class="note-flag"><span>${nnn.tie?'&#10003;':'&#9888;'}</span><div><b>${nnn.tie?'No double-count found.':'DISCREPANCY FOUND - do not trust this NOI until resolved.'}</b> The live engine (<code>bkCalc</code>/<code>bkAnnualCF</code>) was inspected before any change was made, per the sponsor's instruction. It already presents Havard on a GROSS NNN basis - Recoveries are added to revenue exactly once and are never separately subtracted from expenses - so there is no mechanical double-count today. RE Taxes ($145,000) in particular cannot be net of anything: a landlord always pays the full tax bill and bills tenants separately. The NET restatement above is proven algebraically to tie to the identical NOI (Net Landlord Expenses is defined as Gross Expenses minus Recoveries, so the Recoveries term cancels the same way in both formulations) - this is not assumed, it is confirmed numerically every time this sheet renders (currently: ${nnn.tie?'TIES':'DOES NOT TIE'}). <b>Two items remain flagged REVIEW, not resolved:</b> (1) Utilities ($106,951/yr) carries an Excel label of "net of RUBS" - a residential submetering concept that may not accurately describe an all-commercial deal like Havard; whether this figure is fully gross or already net of some billback is not determinable from the source documents supplied. (2) Ancillary Income ($97,200/yr, Yardi rent roll) has no source document defining whether it is a true NNN pass-through or genuine landlord income (parking, storage, late fees, etc.) - it is excluded from both the gross and net NOI above, exactly as it already was, rather than guessed into either bucket. Neither of these was resolved automatically; both require the sponsor's decision.</div></div>

    <div class="tbl-wrap" style="margin-top:20px"><table class="fin"><caption>Harvard - Lease Source vs. Yardi Setup Reconciliation (LEASE SOURCE / YARDI SETUP / VARIANCE / STATUS)</caption>
      <thead><tr><th class="rowlabel-h">Tenant / Unit</th><th>Unit</th><th>LEASE SOURCE (base rent)</th><th>YARDI SETUP (base rent)</th><th>VARIANCE $ (%)</th><th>STATUS</th></tr></thead>
      <tbody>${leaseRows}</tbody></table></div>
    <div class="note-flag"><span>&#8505;</span><div>${hv.lease.note}</div></div>
    <div class="note-flag"><span>&#9888;</span><div><b>Executed lease and Yardi are kept as two separate source layers, on purpose.</b> Every dollar variance above is within the range explained by each lease's own contractual escalation clause (3%/CPI, compounded over the 1-3 years between the last documented lease-abstract rent step and the Yardi setup date) - none is silently resolved into one number. The two non-dollar flags (a tenant-name difference on 180-1/180-2, and a one-year commencement slip on 180-2) are structural discrepancies, not rent variances, and are also left for the sponsor's review rather than corrected here.</div></div>
    <div class="body-grid source-lease-grid" style="margin-top:14px">${leaseDetailCards}</div>

    <div class="body-grid" style="margin-top:20px">
      <div class="tbl-wrap"><table class="fin"><caption>Seller Historical P&amp;L (200 Harvard Corp., pre-acquisition ownership) ${bkSourceChip(s,'_sellerPL','ACQUISITION DD')}</caption>
        <thead><tr><th class="rowlabel-h">Line</th><th>2022</th><th>2023</th></tr></thead>
        <tbody><tr><td class="rowlabel">Total Income</td><td>$${bkFmt(hv.sellerPL.y2022.totalIncome)}</td><td>$${bkFmt(hv.sellerPL.y2023.totalIncome)}</td></tr>
        <tr><td class="rowlabel">Total Expense</td><td>$${bkFmt(hv.sellerPL.y2022.totalExpense)}</td><td>$${bkFmt(hv.sellerPL.y2023.totalExpense)}</td></tr>
        <tr class="grandtotal"><td class="rowlabel">Net Income</td><td>$${bkFmt(hv.sellerPL.y2022.netIncome)}</td><td>$${bkFmt(hv.sellerPL.y2023.netIncome)}</td></tr></tbody></table>
        <div class="note-flag"><span>&#8505;</span><div>${hv.sellerPL.note}</div></div>
      </div>
      <div class="tbl-wrap"><table class="fin"><caption>Cost Segregation Summary ${bkSourceChip(s,'_costSeg','ACQUISITION DD')}</caption>
        <thead><tr><th class="rowlabel-h">Item</th><th>Value</th></tr></thead>
        <tbody>
        <tr><td class="rowlabel">Purchase Price</td><td>$${bkFmt(hv.costSeg.purchasePrice)}</td></tr>
        <tr><td class="rowlabel">Land Value</td><td>$${bkFmt(hv.costSeg.landValue)} (${bkPct(hv.costSeg.landPct)})</td></tr>
        <tr><td class="rowlabel">Depreciable Basis</td><td>$${bkFmt(hv.costSeg.depreciableBasis)}</td></tr>
        <tr><td class="rowlabel">5-Year Recovery</td><td>$${bkFmt(hv.costSeg.fiveYear)} (${bkPct(hv.costSeg.fiveYearPct)})</td></tr>
        <tr><td class="rowlabel">15-Year Recovery</td><td>$${bkFmt(hv.costSeg.fifteenYear)} (${bkPct(hv.costSeg.fifteenYearPct)})</td></tr>
        <tr><td class="rowlabel">39-Year Commercial</td><td>$${bkFmt(hv.costSeg.thirtyNineYear)} (${bkPct(hv.costSeg.thirtyNineYearPct)})</td></tr>
        <tr><td class="rowlabel">2025 Est. Tax Savings</td><td>$${bkFmt(hv.costSeg.estTaxSavings2025)}</td></tr>
        <tr><td class="rowlabel">Date Placed In-Service</td><td>${hv.costSegExtra.datePlacedInService}</td></tr>
        <tr><td class="rowlabel">Capital Improvements</td><td>$${bkFmt(hv.costSegExtra.capitalImprovements)}</td></tr>
        </tbody></table>
        <div class="note-flag"><span>&#8505;</span><div>${hv.costSegExtra.note}</div></div>
      </div>
    </div>

    <div class="tbl-wrap" style="margin-top:20px"><table class="fin"><caption>Annual Depreciation by Recovery Period (tax layer - not applied to NOI/CF) ${bkSourceChip(s,'_depSchedule','ACQUISITION DD')}</caption>
      <thead><tr><th class="rowlabel-h">Recovery Period</th><th>2025</th><th>2026</th><th>2027+ (steady state)</th></tr></thead>
      <tbody>${hv.depreciationAnnualSchedule.rows.map(r=>`<tr><td class="rowlabel">${r.period}</td><td>$${bkFmt(r.y2025)}</td><td>$${bkFmt(r.y2026)}</td><td>$${bkFmt(r.thereafter)}</td></tr>`).join('')}</tbody></table></div>
    <div class="note-flag"><span>&#8505;</span><div>${hv.depreciationAnnualSchedule.note}</div></div>

    <div class="note-flag"><span>&#9888;</span><div><b>Jan/Feb 2026 commercial reimbursement activity - not allocated.</b> ${hv.janFeb2026Reimbursement.note} (Jan 2026: $${bkFmt(hv.janFeb2026Reimbursement.jan2026Total)}; Feb 2026: $${bkFmt(hv.janFeb2026Reimbursement.feb2026Total)}.)</div></div>
    <div class="note-flag"><span>&#8505;</span><div><b>Historical CapEx (seller-supplied, pre-acquisition ownership):</b> $${bkFmt(hv.capexHistoryTotal)} total across ${hv.capexHistory.length} projects, 2019-2024 (roof replacement, envelope/waterproofing, window replacement, tenant build-outs). Reference only - not applied to any app CapEx assumption.</div></div>

    <div class="tbl-wrap" style="margin-top:20px"><table class="fin"><caption>Yardi Trailing-12 (Mar 2026) - Portfolio-Consolidated, NOT Harvard-Isolated ${bkSourceChip(s,'_t12Consolidated','YARDI T12')}</caption>
      <thead><tr><th class="rowlabel-h">Line</th><th>Trailing-12 Total</th></tr></thead>
      <tbody>
        <tr><td class="rowlabel">Total Commercial Rental Income (6 properties incl. Harvard)</td><td>$${bkFmt(BK_SOURCE_DATA.t12Consolidated.totalCommercialRentalIncomeT12)}</td></tr>
        <tr><td class="rowlabel">Total Residential Rental Income (6 properties)</td><td>$${bkFmt(BK_SOURCE_DATA.t12Consolidated.totalResidentialRentalIncomeT12)}</td></tr>
        <tr><td class="rowlabel">Effective Gross Income</td><td>$${bkFmt(BK_SOURCE_DATA.t12Consolidated.effectiveGrossIncomeT12)}</td></tr>
        <tr><td class="rowlabel">Total Expenses &amp; Fees</td><td>$${bkFmt(BK_SOURCE_DATA.t12Consolidated.totalExpensesFeesT12)}</td></tr>
        <tr class="grandtotal"><td class="rowlabel">Net Operating Income (portfolio-wide)</td><td>$${bkFmt(BK_SOURCE_DATA.t12Consolidated.netOperatingIncomeT12)}</td></tr>
      </tbody></table></div>
    <div class="note-flag"><span>&#9888;</span><div>${BK_SOURCE_DATA.t12Consolidated.note}</div></div>
    `;
  } else {
    harvardBlock = `<div class="note-flag"><span>&#8505;</span><div>The active deal (${s.name||s.dealId||'current deal'}) has no Havard-level Yardi source detail ingested yet - BK-001 (Havard Avenue) is the only property with full tenant-level source data extracted so far. The portfolio reference table above still applies.</div></div>`;
  }

  const main = `<div class="source-data-clean">${portfolioTable + harvardBlock}</div>`;
  const sidebar = sidebarShell(`<div class="card"><div class="card-head">Source Data</div><div class="metric-list">
    <div class="metric-row"><span class="k">Reference File</span><span class="v" style="font-size:11px">${BK_SOURCE_DATA.asOf}</span></div>
    <div class="metric-row"><span class="k">Properties</span><span class="v">${BK_SOURCE_DATA.portfolio.length} owned + ${BK_SOURCE_DATA.targets.length} target</span></div>
    <div class="metric-row"><span class="k">Deep Detail</span><span class="v">Havard Avenue (BK-001)</span></div>
  </div></div>${colorKeyCard()}`);

  return {
    title: 'Source Data',
    crumbs: 'Inputs · Source Data',
    desc: "Read-only Yardi portfolio + Havard Avenue acquisition due-diligence reference data, cross-checked against the active deal's current assumptions. Nothing here overwrites a live baseline automatically -- every material variance is flagged for the sponsor's review (V27 point 5).",
    meta: {Property: s.name||s.dealId, 'Yardi Source': 'Ingested', 'Deep Detail': isHarvard?'Havard (active)':'Not active', Status:'Reference'},
    main, sidebar,
  };
}
RENDERERS['Source Data'] = sheetSourceDataV27;

// V27 point 9 / BK's explicit QA ask: "Add a Harvard lease-vs-Yardi reconciliation test to V27
// QA." Appended to the existing QA sheet (sheetQAV13) rather than replacing it -- the Excel<->web
// engine certification table above is untouched; this only adds a second, independent
// certification block below it when the active deal is Harvard. Uses the exact same
// bkHarvardLeaseReconciliationV27() data the Source Data sheet renders, so the two can't disagree.
const _qaV27 = RENDERERS['QA'];
RENDERERS['QA'] = function(){
  const o = _qaV27();
  const s = bkLoad();
  if(String(s.dealId||'')==='BK-001'){
    const recon = bkHarvardLeaseReconciliationV27();
    const passCount = recon.filter(r=>!r.bigVar && !r.flagged).length;
    const rows = recon.map(({tenant:t, varDollar, varPct, cls, label})=>
      `<tr><td class="rowlabel">${t.yardiTenant} (${t.unit})</td><td>$${bkFmt(t.leaseBaseRentMonthly)}/mo</td><td>$${bkFmt(t.yardiBaseRentMonthly)}/mo</td><td>${bkFmt(varDollar)} (${bkPct(varPct)})</td><td><span class="status-chip ${cls}">${label}</span></td></tr>`
    ).join('');
    o.main += `<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Harvard Lease-vs-Yardi Reconciliation Test (V27)</caption><thead><tr><th class="rowlabel-h">Tenant</th><th>LEASE SOURCE</th><th>YARDI SETUP</th><th>VARIANCE</th><th>STATUS</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="note-flag"><span>&#8505;</span><div><b>${passCount} / ${recon.length} tenants</b> reconcile within escalation-explained range with no structural flag. Every discrepancy (rent variance, tenant-name difference, commencement-date slip) is reported here and on the Source Data sheet -- none is silently resolved. See Source Data for full lease-term detail per tenant.</div></div>`;
  }
  return o;
};

// Register the new sheet in the Inputs nav group and inject its rail item, without touching any
// other sheet's visual design.
(function(){
  const inputsGroup = GROUPS.find(g=>g.id==='inputs');
  if(inputsGroup && !inputsGroup.sheets.includes('Source Data')){
    inputsGroup.sheets.push('Source Data');
  }
})();
