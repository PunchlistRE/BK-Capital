// Ties this app's engine to the owner's Excel master model (CRE_MASTER_V7_2_GOLD.xlsm): the ten deals stored in the workbook's SYS_DealDB are loaded into the app and each result is
// compared with the workbook's own stored snapshot (Y1 NOI, all-in cost, loan, peak equity, unlevered and levered IRR and multiple).
//   node audit/gold_tieout.js [index.html] [--json out.json]     data: audit/real/gold_v72.json (extracted from the workbook)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const fs = require('fs'), path = require('path');
const G = JSON.parse(fs.readFileSync(path.join(__dirname, 'real', 'gold_v72.json'), 'utf8')); const app = path.resolve(process.argv[2] && !/^--/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'index.html'));
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }), p = await b.newPage(); await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
  await p.goto('file://' + app); await p.waitForTimeout(700);
  const MODEARG = process.argv.includes('--standard') ? 'standard' : 'legacy';
  const rows = await p.evaluate(([G, MODE]) => {
    document.documentElement.classList.add('bk-auth-ok'); const out = [], gl = G.globals, v = k => gl[k][3 - 0] === undefined ? null : gl[k]; const one = k => gl[k][0];
    const base = { rentGrowthY1: gl['Rent Growth - Operating Year 1 Trend'][0], exitNoiBasis: 'before', rentGrowth: gl['Market Rent Growth - Stabilized'][3], otherGrowth: one('Other Income Growth'), opexGrowth: one('Operating Expense Growth'), taxGrowth: one('Assessed Value / Tax Growth'), badDebtPct: one('Bad Debt / Credit Loss'), concessionPct: one('Concessions - Stabilized'), concessionLeaseUpPct: one('Concessions - Lease-Up'), lossToLeasePct: one('Loss to Lease'), saleCostPct: one('Cost of Sale'), commercialVacancy: one('Retail Vacancy / Credit Loss'), commercialRentGrowth: one('Retail Rent Growth'), assessmentRatio: one('Assessment Ratio'), millageRate: one('Effective Millage / Tax Rate') };
    const coupon = gl['Permanent / Acq Loan Coupon'][3];
    G.deals.forEach((d, i) => { const u = d.units, dt = d.acq_date.split('-'), e = G.expected[i], dev = d.deal_type === 'Development', n = x => x == null ? 0 : x;
      const s = Object.assign({ dealId: d.deal_id, name: d.name, location: d.location, dealType: d.deal_type, propertyType: d.prop_type, closing: (+dt[1]) + '/' + (+dt[2]) + '/' + dt[0], units: u, gsf: d.gsf, commercialArea: n(d.retail_sf), parking: n(d.parking), siteArea: d.acres,
        purchasePrice: d.purchase_price, t12noi: n(d.t12_noi), taxes: d.re_tax_actual || 0, avgRent: d.rent_mo, commercialRent: n(d.retail_rent_sf), recovery: n(d.retail_recov_sf), otherIncomePerUnit: d.other_inc_u, closingCostsPct: d.closing_pct, vacancy: d.vacancy, mgmtPct: d.mgmt_pct,
        insurance: d.ins_u * u, payroll: d.payroll_u * u, rm: d.rm_u * u, turnover: d.turn_u * u, utilities: d.util_u * u, contract: d.contract_u * u, marketing: d.mktg_u * u, ga: d.ga_u * u, reserves: d.reserves_u * u,
        occupancy: d.preleased, exitCap: d.exit_cap, holdYears: d.hold_yrs, gpShare: d.gp_share, pref: d.pref, hurdle2: d.hurdle2, hurdle3: d.hurdle3, t2LP: d.t2_lp, t3LP: d.t3_lp, t4LP: d.t4_lp, gpCatchup: d.catchup, gpCatchupTarget: d.catchup_tgt, hurdleBasis: d.hurdle_basis, em1: d.em_h1, em2: d.em_h2, em3: d.em_h3,
        acqFeePct: d.acq_fee, acquisitionFeePct: d.acq_fee, assetMgmtPct: d.am_fee, dispositionFeePct: d.dispo_fee, devFeePct: n(d.dev_fee), cmFeePct: n(d.cm_fee), guarantyFeePct: n(d.guaranty_fee) }, base);
      if (!dev) Object.assign(s, { leaseupMonths: 1, acqLTV: d.a_ltv, acqLTC: d.a_ltc, acqDSCR: d.a_dscr, acqRate: d.a_rate, lenderNoiBasis: 'after', acqAmort: d.a_amort, acqIO: d.a_io, acqOrigFee: d.a_fee });
      if (MODE === 'legacy') Object.assign(s, BK_CV_LEGACY);
      bkCreateNewDeal(s);
      /* taxes left blank in the workbook are estimated ad valorem: assessed value = NOI before tax / (exit cap + ratio x millage) */
      if (!d.re_tax_actual) { const ar = gl['Assessment Ratio'][0], ml = gl['Effective Millage / Tax Rate'][0], st = bkLoad(); st.taxes = Math.round(bkCalc().noi * ar * ml / (d.exit_cap + ar * ml)); bkSave(st); }
      const c = bkCalc(), m = bkMonthlyReturns(), db = dev ? null : bkDebt();
      const ac = bkAnnualCF(), unlev = { irr: ac.irr, moic: ac.moic }; /* property-level, no financing, no sponsor fees: what the workbook calls unlevered */
      out.push({ i: i + 1, id: d.deal_id, type: d.deal_type, y1NOI: c.after, expY1: e['Y1 NOI (after reserves)'], loan: db ? db.loan : null, expLoan: e['Debt (commitment / loan)'], eq: m.contrib, expEq: e['Peak Equity'], unlevIRR: unlev.irr, expUnlevIRR: e['Unlevered IRR'], unlevMOIC: unlev.moic, expUnlevMOIC: e['Unlevered MOIC'], levIRR: m.irr, expLevIRR: e['Levered IRR'], levMOIC: m.moic, expLevMOIC: e['Levered MOIC'] }); });
    return out; }, [G, MODEARG]);
  const f = (x, d) => x == null || !isFinite(x) ? '   n/a' : x.toFixed(d), pc = (a, e) => a == null || e == null || typeof e !== 'number' ? '   n/a' : ((a / e - 1) * 100).toFixed(2) + '%', pp = (a, e) => a == null || typeof e !== 'number' ? '   n/a' : ((a - e) * 100).toFixed(2) + ' pts';
  console.log('Deal       Type         Y1 NOI diff    Loan diff     Equity diff   Unlev IRR diff   Lev IRR diff   Lev MOIC diff');
  rows.forEach(r => console.log((r.id).padEnd(10), r.type.padEnd(12), pc(r.y1NOI, r.expY1).padStart(10), pc(r.loan, r.expLoan).padStart(12), pc(r.eq, r.expEq).padStart(12), pp(r.unlevIRR, r.expUnlevIRR).padStart(16), pp(r.levIRR, r.expLevIRR).padStart(14), pc(r.levMOIC, r.expLevMOIC).padStart(14)));
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
  await b.close();
})();
