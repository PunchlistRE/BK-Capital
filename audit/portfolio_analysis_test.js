// Portfolio Analysis: the saved deals added up, from the existing per-deal and consolidated engines.
//   node audit/portfolio_analysis_test.js [index.html]
const { chromium } = require('playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), V = require(path.join(__dirname, 'devdeal.js'));
const html = path.resolve(process.argv[2] || 'index.html');
let n = 0, fails = 0; const check = (name, ok, detail) => { n++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : '')); };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr|newyorkfed/, r => r.abort()); await p.goto('file://' + html); await p.waitForTimeout(700);
  const empty = await p.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); localStorage.removeItem(BK_PORTFOLIO_STORE); bkCreateNewDeal({ name: 'Core Fund I', dealId: 'PF-1', dealType: 'Acquisition', analysisType: 'portfolio', blankStructure: true }); const r = bkPortfolioAnalysis(); showSheet('Portfolio Analysis'); return { ok: r.ok, t: document.getElementById('viewport').innerText }; });
  check('with nothing saved, the analysis says how to add holdings', !empty.ok && /No holdings yet/.test(empty.t) && /Save Active Deal/.test(empty.t));
  const r = await p.evaluate(([A, V]) => { bkCreateNewDeal(A); bkPortfolioAddCurrent();
    bkCreateNewDeal(Object.assign({}, A, { dealId: 'ACQ-2', name: 'Harbor View', location: 'Boston, MA', purchasePrice: 14000000, avgRent: 1900, units: 60, closing: '1/1/2027', debtTerm: 1.5 })); bkPortfolioAddCurrent();
    bkCreateNewDeal(V); bkPortfolioAddCurrent();
    bkCreateNewDeal({ name: 'Core Fund I', dealId: 'PF-1', dealType: 'Acquisition', analysisType: 'portfolio', blankStructure: true });
    const x = bkPortfolioAnalysis(), C = bkPortfolioConsolidated(), saved = bkPortfolioLoad(), m = saved.map(s => bkPortfolioMetricsFor(s));
    return { x: JSON.parse(JSON.stringify(Object.assign({}, x, { C: null, saved: null }))), cIrr: C.irr, m: m.map(q => ({ loan: q.loan, noi: q.y1noi, irr: q.irr })), tie: bkAllInputsTie(), own: bkAnalysisReport() }; }, [A, V]);
  const x = r.x;
  check('three holdings, each run by the engine', x.ok && x.count === 3, x.count);
  check('debt and NOI are the sums of the holdings\' own figures', Math.abs(x.debt - r.m.reduce((a, q) => a + q.loan, 0)) < 1 && Math.abs(x.noi - r.m.reduce((a, q) => a + q.noi, 0)) < 1);
  check('the portfolio IRR is the consolidated cash flow\'s IRR (not an average)', Math.abs(x.irr - r.cIrr) < 1e-12 && Math.abs(x.irr - r.m.reduce((a, q) => a + q.irr, 0) / 3) > 1e-4, [x.irr, r.cIrr]);
  check('LTV is debt over value; the cap rate leaves out holdings with no income yet', Math.abs(x.ltv - x.debt / x.gav) < 1e-12 && x.capRate > x.noi / x.gav, [x.ltv, x.capRate]);
  check('a loan maturing within 24 months is counted as exposure (Harbor View, 18-month term)', x.maturing > 0 && x.holdings.find(h => h.name === 'Harbor View').maturesSoon, x.maturing);
  check('concentration by type and location adds to 100%', Math.abs(x.byType.reduce((a, t) => a + t.share, 0) - 1) < 1e-9 && Math.abs(x.byLoc.reduce((a, t) => a + t.share, 0) - 1) < 1e-9 && x.byLoc.some(l => l.name === 'MA'));
  check('scenarios: the portfolio IRR without each holding, and what each adds', x.scenarios.length === 3 && x.scenarios.every(s => s.irr === null || Math.abs(s.delta - (x.irr - s.irr)) < 1e-12), x.scenarios);
  check('every check ties, including the registry\'s portfolio reconciliation', x.checks.every(c => c.ok) && r.tie.ok, [x.checks, r.tie.failed]);
  check('its report is the Portfolio Report', r.own && r.own.sheet === 'Portfolio Report');
  await p.evaluate(() => showSheet('Home')); await p.waitForTimeout(500);
  const h = await p.evaluate(() => ({ t: document.getElementById('viewport').innerText, rail: [...document.querySelectorAll('#rail-groups [data-sheet]')].map(e => e.dataset.sheet) }));
  check('Home leads with the portfolio IRR, value and debt', /PORTFOLIO IRR[\s\S]{0,20}\d+\.\d\d%/i.test(h.t) && /GROSS ASSET VALUE/i.test(h.t));
  check('the menu shows the portfolio pages and none of a single property\'s inputs, debt, returns or reports', ['Portfolio Analysis', 'Portfolio', 'Portfolio Report'].every(s => h.rail.includes(s)) && !h.rail.some(s => /^(Property|Revenues|Expenses|Debt|Returns|Tenant Report|Audit Report|Waterfall Report|Property CF)$/.test(s)), h.rail);
  await p.evaluate(() => bkReportOpen()); await p.waitForTimeout(600);
  const rep = await p.evaluate(() => ({ sheet: currentSheet, secs: [...document.querySelectorAll('#viewport [data-section]')].map(e => e.getAttribute('data-section')) }));
  check('"Create PDF summary" opens the Portfolio Report with every registry section', rep.sheet === 'Portfolio Report' && rep.secs.length === 12, rep);
  const acq = await p.evaluate(A => { bkCreateNewDeal(A); showSheet('Home'); return [...document.querySelectorAll('#rail-groups [data-sheet]')].map(e => e.dataset.sheet); }, A);
  check('an acquisition still has its property pages, and the Portfolio Analysis page sits under Portfolio', ['Property', 'Revenues', 'Debt', 'Returns', 'Portfolio Analysis'].every(s => acq.includes(s)) && !acq.includes('Portfolio Report'));
  check('no page errors', errs.length === 0, errs.slice(0, 2));
  console.log('portfolio analysis: ' + n + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
