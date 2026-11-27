// Hold & Disposition: sell today vs hold, from the hold engine; its page, report, menus, summary tiles and checks.
//   node audit/hold_analysis_test.js [index.html]
const { chromium } = require('playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
const html = path.resolve(process.argv[2] || 'index.html');
let n = 0, fails = 0; const check = (name, ok, detail) => { n++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : '')); };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr|newyorkfed/, r => r.abort()); await p.goto('file://' + html); await p.waitForTimeout(700);
  const r = await p.evaluate(A => { document.documentElement.classList.add('bk-auth-ok');
    bkCreateNewDeal({ name: 'Maple Court', location: 'Stamford, CT', dealId: 'MC', dealType: 'Acquisition', analysisType: 'hold', blankStructure: true });
    const s = bkLoad(); ['units', 'avgRent', 'vacancy', 'taxes', 'insurance', 'utilities', 'rm', 'payroll', 'contract', 'ga', 'gsf', 'mgmtPct', 'propertyType'].forEach(k => { if (A[k] !== undefined) s[k] = A[k]; });
    Object.assign(s, { valDate: '1/1/2027', currentValue: 22000000, saleCostPct: 0.02, exLoanBalance: 11000000, exLoanRate: 0.045, exLoanAmort: 25, exLoanMaturity: '6/30/2033', exPrepay: 110000, holdYears: 5, rentGrowth: 0.03, opexGrowth: 0.03, exitCap: 0.06, holdTaxBasis: 15000000, holdAccumDep: 3000000, holdAnnualDep: 450000 }); bkSave(s);
    const h = bkHold(), c = bkCalc(); return { h: JSON.parse(JSON.stringify({ ok: h.ok, now: h.now, irr: h.hold && h.hold.irr, npv: h.hold && h.hold.npv, flows: h.hold && h.hold.flows, call: h.call, checks: h.checks, yrs: h.yrs, exit: h.hold && h.hold.exit, byYear: h.byYear && h.byYear.map(x => x.irr), N: h.N })), noi: c.noi, egi: c.egi, opex: c.total, tie: bkAllInputsTie() }; }, A);
  const h = r.h, now = h.now;
  check('selling today: value less 2% costs, the payoff ($11M + $110K prepayment) and the tax', h.ok && Math.abs(now.net - (22000000 - 440000 - 11110000 - now.tax)) < 1, now);
  check('tax estimate: gain over the adjusted basis, recapture at 25% up to the depreciation, the rest at 20%', Math.abs(now.tax - (3000000 * 0.25 + (22000000 - 440000 - 12000000 - 3000000) * 0.20)) < 1, now.tax);
  check('year-1 NOI is the app\'s operating statement, and later years grow at the entered rates', Math.abs(h.yrs[0].noi - r.noi) < 1 && Math.abs(h.yrs[1].egi - r.egi * 1.03) < 1 && Math.abs(h.yrs[1].opex - r.opex * 1.03) < 1);
  check('existing loan debt service is the amortizing payment on $11M at 4.5% over 25 years', Math.abs(h.yrs[0].ds - 11000000 * 12 * (0.045 / 12) / (1 - Math.pow(1 + 0.045 / 12, -300))) < 2, h.yrs[0].ds);
  check('exit: year-6 NOI at the 6% exit cap, less costs, the loan balance and the year-5 tax (with five more years of depreciation)', Math.abs(h.exit.price - h.yrs[5].noi / 0.06) < 1 && Math.abs(h.exit.taxInfo.acc - (3000000 + 5 * 450000)) < 1, h.exit);
  const npvAt = (cf, rr) => cf.reduce((a, v, t) => a + v / Math.pow(1 + rr, t), 0);
  check('the hold IRR is measured on the cash given up today and discounts the flows to zero', Math.abs(h.flows[0] + now.net) < 1 && Math.abs(npvAt(h.flows, h.irr)) < 1, h.irr);
  check('the call: hold, since the IRR clears the 8% required return, and the NPV at 8% is positive', h.call === 'HOLD' && h.irr > 0.08 && h.npv > 0 && Math.abs(h.npv - npvAt(h.flows, 0.08)) < 1);
  check('each engine check ties', h.checks.length === 5 && h.checks.every(c => c.ok), h.checks.filter(c => !c.ok));
  check('the year-by-year table ends with the full hold', h.byYear.length === h.N && Math.abs(h.byYear[h.N - 1] - h.irr) < 1e-9);
  check('ALL INPUTS TIE on a hold deal (acquisition-only checks read N/A)', r.tie.ok, r.tie.failed);
  /* a loan maturing inside the hold is repaid by the owner that year */
  const mat = await p.evaluate(() => { const h = bkHold(null, { exLoanMaturity: '12/31/2029' }); const y = h.yrs.find(x => x.balloon > 0); return { y: y && y.y, b: y && y.balloon, exitPayoff: h.hold.exit.payoff }; });
  check('a loan maturing inside the hold is repaid by the owner that year, and nothing is owed at the sale', mat.y === 3 && mat.b > 9000000 && mat.exitPayoff === 0, mat);
  const higher = await p.evaluate(() => bkHold(null, { exitCap: 0.075 }).hold.irr);
  check('a higher exit cap lowers the hold IRR', higher < h.irr, [h.irr, higher]);
  const noTax = await p.evaluate(() => { const h = bkHold(null, { holdTaxBasis: '' }); return [h.now.tax, h.now.net]; });
  check('without a cost basis the comparison is before tax and says so', noTax[0] === null && Math.abs(noTax[1] - (22000000 - 440000 - 11110000)) < 1);
  /* the page, the report, the menu and Home */
  await p.evaluate(() => showSheet('Hold vs Sell')); await p.waitForTimeout(700);
  const pg = await p.evaluate(() => ({ caps: [...document.querySelectorAll('#viewport caption')].map(c => c.textContent), t: document.getElementById('viewport').innerText }));
  check('Hold vs Sell page: the call, the comparison, the cash flow by year, when to sell, sensitivity, tax and checks', ['Hold vs sell', 'Hold case: cash flow by year', 'When to sell: holding to each year', 'Hold-case IRR: exit cap (across) by rent growth (down)', 'Tax on a sale', 'Checks'].every(c => pg.caps.includes(c)) && /Hold\. Holding 5 more years earns 13\.\d\d%/.test(pg.t), pg.caps);
  await p.evaluate(() => bkReportOpen()); await p.waitForTimeout(600);
  const rep = await p.evaluate(() => ({ sheet: currentSheet, secs: [...document.querySelectorAll('#viewport [data-section]')].map(e => e.getAttribute('data-section')) }));
  check('"Create PDF summary" opens the Hold vs Sell Report with every registry section', rep.sheet === 'Hold vs Sell Report' && ['holdExec', 'propDesc', 'acqCashFlow', 'capitalBudget', 'holdCompare', 'saleTax', 'disclosures'].every(x => rep.secs.includes(x)), rep);
  const nav = await p.evaluate(() => { showSheet('Home'); return { rail: [...document.querySelectorAll('#rail-groups [data-sheet]')].map(e => e.dataset.sheet), home: document.getElementById('viewport').innerText }; });
  check('menu: the hold page and report, no Debt, Returns, Credit or acquisition reports', nav.rail.includes('Hold vs Sell') && nav.rail.includes('Hold vs Sell Report') && !nav.rail.some(x => /^(Debt|Returns|IC Memo|Waterfall Report|After-Tax Report|Sources and Uses Report|Cash Flow Report)$/.test(x)), nav.rail);
  check('Home leads with the hold-case IRR and the net cash if sold today', /HOLD-CASE IRR[\s\S]{0,40}13\.\d\d%/i.test(nav.home) && /NET CASH IF SOLD TODAY/i.test(nav.home));
  /* an acquisition does not show the hold pages */
  const acq = await p.evaluate(A => { bkCreateNewDeal(A); showSheet('Home'); return [...document.querySelectorAll('#rail-groups [data-sheet]')].map(e => e.dataset.sheet); }, A);
  check('an acquisition does not list the hold pages', !acq.includes('Hold vs Sell') && !acq.includes('Hold vs Sell Report') && acq.includes('Returns'));
  check('no page errors', errs.length === 0, errs.slice(0, 2));
  console.log('hold analysis: ' + n + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
