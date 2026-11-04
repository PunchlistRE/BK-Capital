// Harbor Point Residences — the user's full development test deal, mapped onto BK Capital's inputs as closely as the model allows.
// Where the model has fewer lines than the brief (13 hard trades vs 16 categories, 16 soft lines vs 19) the brief's lines are merged and the merge is listed in REPORT.md.
const GSF = 132000, psf = (d) => d / GSF;
module.exports = {
  dealId: 'HARBOR-POINT', name: 'Harbor Point Residences', dealType: 'Development', propertyType: 'Multifamily', location: 'Stamford, CT', closing: '1/1/2027',
  units: 120, gsf: GSF, avgRent: 3310, otherIncomePerUnit: 2100, vacancy: 0.05, purchasePrice: 7000000, closingPct: 250000 / 7000000, acqFeePct: 0,
  taxes: 400000, insurance: 120000, utilities: 150000, rm: 144000, payroll: 180000, contract: 0, turnover: 0, marketing: 0, ga: 0, reserves: 36000, mgmtPct: 0.04,
  // the brief has no asset-management or disposition fee: BK Capital's defaults (1% of EGI, 0.5% of sale) are switched off rather than silently charged
  assetMgmtPct: 0, dispositionFeePct: 0,
  devHurdleBasis: 'lp',   // the brief: hurdles are tested on the LP's own dated cash flows (the development default tests them on total equity)
  // contingency register ($2.0M, ten categories, all forecast to be used) and the four initial reserves ($2.0M)
  _contingency: { items: [['Unforeseen subsurface conditions', 350000], ['Material price escalation', 300000], ['Labor cost escalation', 250000], ['Design development changes', 250000], ['Utility and infrastructure surprises', 200000], ['Scope gaps and coordination issues', 200000], ['Weather and schedule-related costs', 150000], ['Code and regulatory changes', 100000], ['Owner-directed changes', 100000], ['Other unforeseen conditions', 100000]].map(([name, budget]) => ({ name, budget, changeOrders: 0, used: 0, forecast: '' })) },
  _reserves: [{ name: 'Operating and lease-up reserve', amount: 750000, month: 26, purpose: 'operating' }, { name: 'Debt service and interest reserve', amount: 750000, month: 1, purpose: 'interest' }, { name: 'General liquidity reserve', amount: 300000, month: 1, purpose: 'general' }, { name: 'Insurance and tax reserve', amount: 200000, month: 1, purpose: 'general' }],
  rentGrowth: 0.03, opexGrowth: 0.03, taxGrowth: 0.03, exitCap: 0.05, saleCostPct: 0.02, holdYears: 4,
  predevMonths: 2, constructionMonths: 24, leaseupMonths: 17, predevCarry: 750000,
  devBudgetMode: 'PARAMETRIC',
  // hard trades ($ per GSF). Merged: 6 enclosure accessories into envelope; 7-10 mechanical/plumbing/electrical/fire into one MEP line.
  hc_demo: 0, hc_sitework: psf(1750000), hc_excavation: psf(2000000), hc_parking: 0, hc_podium: psf(3650000), hc_envelope: psf(2350000 + 600000), hc_roofing: psf(550000),
  hc_mep: psf(2000000 + 1150000 + 850000 + 500000), hc_elevators: psf(500000), hc_partitions: 0, hc_unitint: psf(4550000), hc_amenity: psf(1000000), hc_commshell: 0, hc_landscape: psf(800000),
  hardGCPct: 1300000 / 22250000, hardContractorFeePct: 1400000 / (22250000 + 1300000), hardRiskBondsPct: 0, hardContPct: 0,   // the $2.0M contingency is the register below, not a % inside the ladder
  // soft lines. A&E ($/hard cost) = architecture + structural + MEP engineering + interior design; the others are $/GSF. Merges are listed in REPORT.md.
  sc_ae: 1480000 / 24950000, sc_civil: psf(250000 + 120000), sc_environmental: psf(120000 + 80000), sc_permits: psf(700000), sc_legal: psf(250000 + 100000), sc_ocip: psf(300000),
  sc_testing: psf(150000 + 100000), sc_marketing: psf(250000), sc_retaxconst: psf(450000), cmFeePct: 350000 / 24950000, sc_entitlement: psf(150000 + 150000),
  devFeePct: 0, softContPct: 0, sc_sustainability: 0, sc_technology: 0, sc_ti: 0, sc_ffe: 0, sc_title: 0,
  // the brief's facility: $27.3M initial principal, $34M ceiling (principal + capitalised interest), equity funds the first $14.7M of cost, 1% fee ($273k) from equity, 0.5% unused fee, interest capitalised to the sale
  conSizing: 'fixed', conFixedCommit: 27300000, conCeiling: 34000000, conEquityFirst: 14700000, conUnusedFee: 0.005, conCapToExit: 1,
  conLTC: 0.65, conRate: 0.0725, conOrigFee: 0.01, conUtil: 0.6, conCapCost: 0, lenderLegal: 0,
  // the brief's refinance terms (used by the refinance illustration)
  refiAtStab: 0, permRate: 0.0625, permAmort: 30, permOrigFee: 0.01, permLTV: 0.65,
  // the waterfall: 90 / 10 equity, 8% preferred return to the LP only (capital back first), 50% GP catch-up to a 20% promote, then 80/20 to 12%, 70/30 to 18%, 60/40 above
  gpShare: 0.10, pref: 0.08, hurdle2: 0.12, hurdle3: 0.18, hurdleBasis: 1, gpCatchup: 1, gpCatchupTarget: 0.20, gpCatchupRate: 0.50, prefHolder: 'lp', t2LP: 0.80, t3LP: 0.70, t4LP: 0.60,
};
