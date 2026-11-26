// Property Valuation as its own analysis: no financing or returns pages, checks or reports; its own report from every "send" button.
//   node audit/valuation_analysis_test.js [index.html]
const { chromium } = require('playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
const html = path.resolve(process.argv[2] || 'index.html');
let n = 0, fails = 0; const check = (name, ok, detail) => { n++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : '')); };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr|newyorkfed/, r => r.abort()); await p.goto('file://' + html); await p.waitForTimeout(700);
  const mk = (kind) => p.evaluate(([A, kind]) => { document.documentElement.classList.add('bk-auth-ok');
    if (kind === 'valuation') { bkCreateNewDeal({ name: 'ShorePointe', location: 'Stamford, CT', dealId: 'SP', dealType: 'Acquisition', analysisType: 'valuation', blankStructure: true }); const s = bkLoad(); ['units', 'avgRent', 'vacancy', 'taxes', 'insurance', 'utilities', 'rm', 'payroll', 'contract', 'ga', 'gsf'].forEach(k => { if (A[k] !== undefined) s[k] = A[k]; }); s.valCapRate = 0.055; s.valDate = '11/26/2026'; bkSave(s); }
    else bkCreateNewDeal(A); showSheet('Home'); }, [A, kind]);
  const rail = () => p.evaluate(() => [...document.querySelectorAll('#rail-groups [data-sheet]')].map(e => e.dataset.sheet));
  await mk('valuation'); await p.waitForTimeout(500);
  const rv = await rail(), tie = await p.evaluate(() => bkAllInputsTie());
  check('valuation: no Debt, Returns or Credit & IC pages in the menu', !rv.some(s => /^(Debt|Returns|Equity Waterfall|IC Memo|Sources & Uses|Financing Lab|Deal Optimizer)$/.test(s)), rv);
  check('valuation: the reports menu lists the Property Value Report and none built from financing or returns', rv.includes('Property Valuation Report') && !rv.some(s => /^(Cash Flow Report|After-Tax Report|Sources and Uses Report|Waterfall Report|Valuation Report|Refinance Report)$/.test(s)), rv.filter(s => /Report/.test(s)));
  check('valuation: every check ties (waterfall checks read N/A, not "do not tie")', tie.ok && tie.failed.length === 0, tie.failed);
  await p.evaluate(() => bkReportOpen()); await p.waitForTimeout(600);
  check('valuation: "Create PDF summary" opens the Property Value Report, not the investor summary', await p.evaluate(() => currentSheet === 'Property Valuation Report' && !document.querySelector('.rp-overlay, #rp-wrap .page')));
  const rep = await p.evaluate(() => ({ t: document.getElementById('viewport').innerText, views: [...document.querySelectorAll('#viewport .bk-views button')].map(b => b.textContent.trim()), empty3: [...document.querySelectorAll('#viewport table')].filter(t => [...t.rows].length && [...t.rows].every(r => r.cells.length === 3 && !r.cells[2].textContent.trim())).length }));
  check('the Property Value Report has its value conclusion, income, expenses, NOI reconciliation, cap rate, sensitivity and limitations', ['Estimated market value', 'Income', 'NOI reconciliation', 'Capitalization rate', 'Valuation sensitivity', 'Assumptions and limitations'].every(k => rep.t.indexOf(k) >= 0) && /Estimated market value\s*\$[\d,]{9,} as of 11\/26\/2026/.test(rep.t));
  check('the report reads cleanly: no "is needs", no empty notes column, no return-summary or present-value views', !/is needs/.test(rep.t) && rep.empty3 === 0 && !rep.views.some(v => /Return summary|Present value/.test(v)), [rep.views, rep.empty3]);
  check('the toolbar button names the valuation report', await p.evaluate(() => { showSheet('Home'); return [...document.querySelectorAll('button[onclick="bkReportOpen()"]')].every(b => /Property value report/i.test(b.textContent)); }));
  await p.evaluate(() => { bkGuideOn(); bkGuideGo('review'); }); await p.waitForTimeout(500);
  const pk = await p.evaluate(() => [...document.querySelectorAll('.gd-pk b')].map(e => e.textContent));
  check('the guide\'s last step offers the property value report, with no investor PDF, waterfall or committee', pk.includes('Property value report') && !pk.some(x => /Investor PDF|Waterfall|committee/i.test(x)), pk);
  await p.evaluate(() => bkGuideOff()).catch(() => {});
  /* an acquisition is unchanged */
  await mk('acq'); await p.waitForTimeout(500); const ra = await rail();
  check('acquisition: the Debt, Returns and Credit pages and every report are still there', ['Debt', 'Returns', 'IC Memo', 'Deal Optimizer', 'Waterfall Report', 'Valuation Report', 'Sources and Uses Report'].every(s => ra.includes(s)), ra.length);
  check('acquisition: "Create PDF summary" still builds the investor summary', await p.evaluate(() => window.bkAnalysisReport() === null && /Create PDF summary/.test([...document.querySelectorAll('button[onclick="bkReportOpen()"]')].map(b => b.textContent).join(' ') || 'Create PDF summary')));
  const it = await p.evaluate(() => { const d = document.createElement('div'); d.innerHTML = bkReportHTML(); return d.textContent; });
  check('investor summary: capital items are the capital spending, not a remainder (no "other cash flow" on the audit deal)', !/Other cash flow/.test(it));
  check('no page errors', errs.length === 0, errs.slice(0, 2));
  console.log('valuation analysis: ' + n + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
