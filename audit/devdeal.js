// Realistic ground-up multifamily development: 150 units / 150,000 GSF, $5.5M land, ~$31M total budget
// (≈ $190/GSF hard + soft), 6 months pre-development, 18 months construction, 14 months lease-up,
// 65% LTC construction loan at 7.5%, exit 5.25%. Stabilised yield on cost lands near 6.4%.
module.exports = Object.assign({}, require(__dirname + '/deal.js'), {
  dealId: 'TEST-DEV', name: 'Audit Test Development', dealType: 'Development', closing: '1/1/2027',
  units: 150, gsf: 150000, avgRent: 2050, otherIncomePerUnit: 1500, vacancy: 0.06, purchasePrice: 5500000,
  taxes: 520000, insurance: 150000, utilities: 90000, rm: 90000, contract: 80000, payroll: 330000, turnover: 40000, marketing: 45000, ga: 90000, reserves: 45000, mgmtPct: 0.03,
  predevMonths: 6, constructionMonths: 18, leaseupMonths: 14, holdYears: 6,
  // $/GSF trade lines (hard ≈ $136/GSF before GC, fee and contingency) and soft-cost lines; SOURCE mode then
  // scales the ladder so the total hard + soft budget equals sourceConstruction.
  hc_demo: 1, hc_sitework: 9, hc_excavation: 8, hc_parking: 14, hc_podium: 24, hc_envelope: 17, hc_roofing: 4, hc_mep: 25, hc_elevators: 4,
  hc_partitions: 8, hc_unitint: 12, hc_amenity: 5, hc_landscape: 3, hardGCPct: 0.06, hardContractorFeePct: 0.03, hardRiskBondsPct: 0.015, hardContPct: 0.05,
  sc_ae: 0.07, sc_civil: 1.2, sc_entitlement: 1.5, sc_environmental: 0.4, sc_ffe: 3500, sc_legal: 1, sc_marketing: 1.8, sc_ocip: 2.2, sc_permits: 3.5,
  sc_retaxconst: 1.5, sc_sustainability: 0.5, sc_technology: 0.8, sc_testing: 0.9, sc_title: 0.008, devFeePct: 0.03, cmFeePct: 0.015, softContPct: 0.05, predevCarry: 150000,
  devBudgetMode: 'SOURCE', sourceConstruction: 25500000, conLTC: 0.65, conRate: 0.075, conUtil: 0.6, conOrigFee: 0.01,
  exitCap: 0.0525, rentGrowth: 0.03, opexGrowth: 0.03, taxGrowth: 0.02, saleCostPct: 0.02, gpShare: 0.10 });
