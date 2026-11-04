// A deal started by a person is ALL CASH with ONE investor: financing, closing and sale costs, fees and the partner structure start blank; the debt sections and the debt-rate case deltas appear only once financing is added.
// Programmatic callers (every audit deck, saved deals) keep the named template. A development deal with no phase months shows an empty schedule, not a made-up chart.
//   node audit/blank_start_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); let checks = 0, fails = 0;
  const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  await p.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); });
  const text = async (sheet) => { await p.evaluate((s) => showSheet(s), sheet); await p.waitForTimeout(500); return p.evaluate(() => document.querySelector('#viewport').innerText); };

  await p.evaluate(() => bkCreateNewDeal({ name: 'Cash Test', dealId: 'CT', dealType: 'Acquisition', propertyType: 'Multifamily', blankStructure: true }));
  const s0 = await p.evaluate(() => { const s = bkLoad(); return { ltv: s.acqLTV, ltc: s.acqLTC, rate: s.acqRate, fee: s.acqOrigFee, cc: s.closingCostsPct, sc: s.saleCostPct, af: s.acqFeePct, gp: s.gpShare, t2: s.t2LP, t3: s.t3LP, t4: s.t4LP, inv: (s.investors || []).length, tpl: !!s._template, up: s.upDebtRateDelta, refi: s.refiLTV, flag: 'blankStructure' in s }; });
  check('a new deal starts with no financing: loan-to-value, loan-to-cost, rate, origination fee and refinance terms are all blank', !s0.ltv && !s0.ltc && !s0.rate && !s0.fee && !s0.refi, JSON.stringify(s0));
  check('closing costs, sale costs and the acquisition fee start blank', !s0.cc && !s0.sc && !s0.af, JSON.stringify([s0.cc, s0.sc, s0.af]));
  check('one investor: no GP share, and every split tier goes to the LP (100%); no investors listed; no template stamped', (s0.gp === 0 || s0.gp === '') && s0.t2 === 1 && s0.t3 === 1 && s0.t4 === 1 && s0.inv === 0 && !s0.tpl && !s0.flag, JSON.stringify(s0));
  const r = await p.evaluate(() => { const s = bkLoad(); Object.assign(s, { units: 10, gsf: 9000, purchasePrice: 2000000, avgRent: 2000, vacancy: 0.05, taxes: 40000, insurance: 12000, exitCap: 0.06, holdYears: 5, rentGrowth: 0.03, opexGrowth: 0.03, taxGrowth: 0.03 }); bkSave(s);
    const m = bkMonthlyReturns(), w = bkWaterfallSummary(), f = bkCalc(); return { irr: m.irr, uirr: m.u && m.u.irr, contrib: m.contrib, dist: m.dist, lp: w.lp.irr, lpC: w.lp.contributed, gpC: w.gp.contributed, gpD: w.gp.dist, noi: f.noi, hard: bkIntegrity().hard.length }; });
  check('all cash: equity contributed equals the price (no costs, no loan), the levered IRR equals the unlevered IRR, and the LP IRR equals the deal IRR', Math.abs(r.contrib - 2000000) < 1 && Math.abs(r.irr - r.uirr) < 5e-5 && Math.abs(r.lp - r.irr) < 1e-9, JSON.stringify([r.contrib, r.irr, r.uirr, r.lp]));
  check('single investor: the GP contributes nothing and receives nothing; every distribution goes to the LP; no failed integrity check', r.gpC === 0 && r.gpD === 0 && Math.abs(r.dist - (r.lpC ? r.dist : 0)) < 1 && r.hard === 0, JSON.stringify([r.gpC, r.gpD, r.hard]));
  let t = await text('Deal Underwrite');
  check('no debt sections on an all-cash deal: no Max LTV / LTC / DSCR constraint table, no debt-rate case deltas, no empty "Audit-Fixed Debt Risk Inputs" table; a note says the deal is all cash', !/Max LTV - /.test(t) && !/Debt Rate Delta/.test(t) && !/Audit-Fixed Debt Risk/i.test(t) && /no financing: it is all cash/i.test(t), t.slice(t.indexOf('Underwriting Cases'), t.indexOf('Underwriting Cases') + 150));
  await p.evaluate(() => { const s = bkLoad(); s.acqLTV = 0.65; s.acqLTC = 0.6; s.acqRate = 0.065; s.acqDSCR = 1.25; bkSave(s); });
  t = await text('Deal Underwrite');
  check('once financing is added, the debt constraint table and the debt-rate case deltas appear', /Max LTV - /.test(t) && /Debt Rate Delta/.test(t) && !/no financing: it is all cash/i.test(t));
  /* a blank deal shows no returns-derived figures: the missing inputs, units first, are listed instead */
  await p.evaluate(() => bkCreateNewDeal({ name: 'Blank', dealId: 'BL2', dealType: 'Acquisition', blankStructure: true }));
  for (const sh of ['Sensitivity', 'Property CF', 'Probability-Weighted', 'Valuation Report', 'Financing Compare', 'IC Memo', 'Returns']) { const tx = await text(sh);
    check(sh + ': a blank deal shows "Results Withheld" with the missing inputs (Units, Purchase Price, Revenue Basis, Hold Period, Exit Capitalization Rate), and no IRR figure', /Results Withheld/i.test(tx) && /Units/.test(tx) && /Purchase Price/.test(tx) && /Revenue Basis/.test(tx) && /Exit Capitalization Rate/.test(tx) && !/\b\d{3,}\.\d\d%/.test(tx), tx.slice(0, 120)); }
  await p.evaluate(() => { const s = bkLoad(); Object.assign(s, { propertyType: 'Multifamily', closing: '1/1/2027', gsf: 9000, purchasePrice: 2000000, avgRent: 2000, vacancy: 0.05, taxes: 40000, insurance: 12000, exitCap: 0.06, holdYears: 5 }); bkSave(s); });
  let tx2 = await text('Sensitivity');
  check('with building area but NO unit count the deal is still not ready, and Units is named as missing', /Results Withheld/i.test(tx2) && /Units/.test(tx2), tx2.slice(0, 80));
  await p.evaluate(() => { const s = bkLoad(); s.units = 10; bkSave(s); });
  tx2 = await text('Sensitivity');
  check('once units and the other key inputs are in, the sensitivity sheet shows results (no "Results Withheld")', !/Results Withheld/i.test(tx2) && /Tornado|Spider|Break-even/i.test(tx2), tx2.slice(0, 80));
  /* programmatic callers keep the template */
  const tp = await p.evaluate(() => { bkCreateNewDeal({ name: 'T', dealId: 'T1', dealType: 'Acquisition' }); const s = bkLoad(); return { ltv: s.acqLTV, cc: s.closingCostsPct, gp: s.gpShare, tpl: !!s._template }; });
  check('a deal created without the flag keeps the named template (financing, costs and GP share as before), so saved deals and audit decks are unchanged', tp.ltv > 0 && tp.cc > 0 && tp.gp > 0 && tp.tpl, JSON.stringify(tp));
  /* clear inputs */
  await p.evaluate(() => { bkCreateNewDeal({ name: 'Old', dealId: 'OLD1', dealType: 'Development', analysisType: 'development', purchasePrice: 1000000, location: 'X, CT' }); const s = bkLoad(); s.acqLTV = 0.6; bkSave(s); });
  await p.evaluate(() => { showSheet('Home'); }); await p.waitForTimeout(300);
  const cl = await p.evaluate(() => { bkClearInputsGo(); const s = bkLoad(); return { name: s.name, loc: s.location, price: s.purchasePrice, ltv: s.acqLTV, cc: s.closingCostsPct, id: s.dealId, type: s.dealType, an: s.analysisType, saved: ((s._history || {}).versions || []).some(v => /Before clearing/.test(v.note) && JSON.parse(v.j).name === 'Old' && JSON.parse(v.j).purchasePrice === 1000000) }; });
  check('Clear inputs removes everything (name, location, price, financing, closing costs), restarts all cash, KEEPS the kind of analysis (a Development stays a Development), and the old deal stays saved in Version History', !cl.name && !cl.loc && !cl.price && !cl.ltv && !cl.cc && cl.saved && cl.type === 'Development' && cl.an === 'development', JSON.stringify(cl));
  /* development schedule empty state */
  await p.evaluate(() => bkCreateNewDeal({ name: 'Dev Blank', dealId: 'DB', dealType: 'Development', blankStructure: true }));
  t = await text('Dev Schedule');
  check('a development deal with no phase months shows "No schedule to draw yet" instead of a chart or invented key dates, and the hold total is consistent (60 months = 5.0 years, no 120-month stand-in)', /No schedule to draw yet/.test(t) && !/TO STABILISATION/.test(t) && !/Stabilized · Jan/.test(t) && /60 months\s+5\.0 yrs/.test(t) && !/\b120\b/.test(t), t.slice(t.indexOf('TOTAL HOLD'), t.indexOf('TOTAL HOLD') + 100));
  check('no page errors', errs.length === 0, errs.join('|'));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
