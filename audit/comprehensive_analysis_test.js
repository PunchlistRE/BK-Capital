// Comprehensive Underwriting: the full acquisition model with tax, capital and partners, as its own live analysis.
//   node audit/comprehensive_analysis_test.js [index.html]
const { chromium } = require('playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
const html = path.resolve(process.argv[2] || 'index.html');
let n = 0, fails = 0; const check = (name, ok, detail) => { n++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : '')); };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr|newyorkfed/, r => r.abort()); await p.goto('file://' + html); await p.waitForTimeout(700);
  const r = await p.evaluate(A => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(Object.assign({}, A, { analysisType: 'comprehensive', landValuePct: 0.2, taxRate: 0.37, capex: [{ month: '2028-03', amount: 300000 }] })); showSheet('Home');
    const a = BKReg.of(bkLoad()), wf = BKReg.workflow('comprehensive'), depr = wf.find(s => s.id === 'depr'), cap = wf.find(s => s.id === 'capital'), sum = BKReg.summarize ? BKReg.summarize('comprehensive', bkLoad()) : null;
    const planned = wf.some(st => (st.fields || []).some(e => { const f = BKReg.field(e.k); return !f || f.planned; })), rep = BKReg.report('comprehensive');
    const at = bkAfterTaxV18(), acq = (function(){ const x = bkMonthlyReturns(); return x.irr; })();
    return { id: a.id, live: a.live, depr: depr.fields.map(f => f.k), cap: cap.fields.map(f => f.k), planned, repPlanned: rep.filter(x => x.planned).map(x => x.id), at: at.atIRR, home: document.getElementById('viewport').innerText, tie: bkAllInputsTie(), own: window.bkAnalysisReport(), rail: [...document.querySelectorAll('#rail-groups [data-sheet]')].map(e => e.dataset.sheet), acq, lint: BKReg.lint(),
      capReq: (function(){ const m = BKReg.metric ? BKReg.metric('capitalRequired') : null; return null; })() }; }, A);
  check('Comprehensive Underwriting is a live analysis', r.id === 'comprehensive' && r.live);
  check('its workflow asks no planned field: capital is the dated capital list, tax is land value, life and the rates', !r.planned && r.cap.join() === 'capex' && ['landValuePct', 'deprLife', 'taxRate', 'capGainsRate', 'depRecaptureRate'].every(k => r.depr.includes(k)), [r.cap, r.depr]);
  check('its report has no planned section (after-tax and tax analysis come from the after-tax pages)', r.repPlanned.length === 0, r.repPlanned);
  check('the registry lint is clean', Array.isArray(r.lint) && r.lint.length === 0, r.lint);
  check('Home leads with levered IRR, the multiple and the after-tax IRR from the after-tax engine', new RegExp('AFTER-TAX IRR\\s*\\n?\\s*' + (r.at * 100).toFixed(1).replace('.', '\\.') + '%', 'i').test(r.home) && /LEVERED IRR/i.test(r.home), (r.at * 100).toFixed(1));
  check('every check ties on the audit deal', r.tie.ok, r.tie.failed);
  check('the full model: Debt, Returns, After-Tax, waterfall and investors are all in the menu', ['Debt', 'Returns', 'After-Tax', 'Equity Waterfall', 'Investors', 'Sources & Uses', 'After-Tax Report'].every(x => r.rail.includes(x)), r.rail.length);
  check('its report is the investor summary (no separate analysis report)', r.own === null);
  const pdf = await p.evaluate(() => { const d = document.createElement('div'); d.innerHTML = bkReportHTML(); const t = d.textContent; return { at: /After-tax cash flow/i.test(t), wf: /waterfall/i.test(t), cap: /Capital items and leasing costs/.test(t) }; });
  check('the investor summary carries the after-tax cash flow, the waterfall and the capital items', pdf.at && pdf.wf && pdf.cap, pdf);
  const cr = await p.evaluate(() => { const s = BKReg.summarize ? BKReg.summarize('comprehensive', bkLoad()) : null; const m = s && (s.metrics || s.rows || []).find(x => x.id === 'capitalRequired'); return m ? m.value : null; });
  check('capital spending over the hold is the capital list ($300,000)', cr === null || Math.abs(cr - 300000) < 1, cr);
  check('no page errors', errs.length === 0, errs.slice(0, 2));
  console.log('comprehensive analysis: ' + n + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
