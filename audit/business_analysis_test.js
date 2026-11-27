// Business Valuation & Underwriting: summary, checks and report read from the business engine (bkBizModel).
//   node audit/business_analysis_test.js [index.html]
const { chromium } = require('playwright'); const path = require('path');
const html = path.resolve(process.argv[2] || 'index.html');
let n = 0, fails = 0; const check = (name, ok, detail) => { n++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : '')); };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr|newyorkfed/, r => r.abort()); await p.goto('file://' + html); await p.waitForTimeout(700);
  const pre = await p.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal({ name: 'Punchlist RE', dealId: 'BIZ-1', dealType: 'Acquisition', analysisType: 'business', blankStructure: true }); showSheet('Home');
    return { ok: bkBusinessAnalysis().ok, t: document.getElementById('viewport').innerText, rail: [...document.querySelectorAll('#rail-groups [data-sheet]')].map(e => e.dataset.sheet), st: BKReg.workflow('business').map(s => BKReg.stepState(s, bkLoad())) }; });
  check('before a business is loaded: not ready, and every step says the business model is missing', !pre.ok && /Operating business model/.test(pre.t) && pre.st.filter(x => x && x.missing && x.missing.length).length >= 8, pre.st.map(x => x && x.missing && x.missing.length));
  check('the Business tab and Business Report show before a model is loaded, so it can be loaded; no property pages', ['Business Model', 'Business Valuation', 'Business Report'].every(s => pre.rail.includes(s)) && !pre.rail.some(s => /^(Property|Revenues|Debt|Returns)$/.test(s)), pre.rail);
  const r = await p.evaluate(() => { bkBizSeedPunchlist(); const x = bkBusinessAnalysis(), m = bkBizModel(), d = m.dcf; showSheet('Home');
    return { x: { ok: x.ok, ev: x.ev, rev: x.revenue, ebitda: x.ebitda, fcf: x.fcf, mult: x.multiple, cases: x.cases, checks: x.checks }, d: { ev: d.ev, rows: d.rows, pvTV: d.pvTV }, bear: m.cases.bear.ev, bull: m.cases.bull.ev, t: document.getElementById('viewport').innerText, tie: bkAllInputsTie(), own: bkAnalysisReport() }; });
  const x = r.x, d = r.d;
  check('the summary is the base-case DCF: year-1 revenue, EBITDA, FCF and the enterprise value', x.ok && x.ev === d.ev && x.rev === d.rows[0].revenue && x.ebitda === d.rows[0].ebitda && x.fcf === d.rows[0].fcf && Math.abs(x.mult - d.ev / d.rows[0].ebitda) < 1e-12);
  check('three cases in order: bear below base below bull', x.cases.map(c => c.name).join() === 'Bear,Base,Bull' && x.cases[0].ev === r.bear && x.cases[2].ev === r.bull && r.bear < x.ev && x.ev < r.bull);
  check('the business checks tie: FCF, EBITDA, present values and the enterprise value each rebuilt', x.checks.length === 4 && x.checks.every(c => c.ok), x.checks);
  check('EV = the discounted FCF + the discounted terminal value (recomputed here)', Math.abs(d.ev - (d.rows.reduce((a, q) => a + q.pv, 0) + d.pvTV)) < 1);
  check('ALL INPUTS TIE on a business deal', r.tie.ok, r.tie.failed);
  check('Home leads with the enterprise value', /ENTERPRISE VALUE[\s\S]{0,20}\$\d/i.test(r.t) && /EV \/ EBITDA/i.test(r.t));
  check('its report is the Business Report', r.own && r.own.sheet === 'Business Report');
  await p.evaluate(() => bkReportOpen()); await p.waitForTimeout(600);
  const rep = await p.evaluate(() => ({ sheet: currentSheet, secs: [...document.querySelectorAll('#viewport [data-section]')].map(e => e.getAttribute('data-section')), t: document.getElementById('viewport').innerText }));
  check('"Create PDF summary" opens the Business Report with every registry section and its checks', rep.sheet === 'Business Report' && ['bizExec', 'bizOps', 'bizCash', 'bizValue', 'bizSens', 'disclosures'].every(s => rep.secs.includes(s)) && !/Does not tie/.test(rep.t), rep.secs);
  check('the registry lint is clean with every analysis live', await p.evaluate(() => BKReg.lint().length === 0 && BKReg.analyses().every(a => a.live)));
  check('no page errors', errs.length === 0, errs.slice(0, 2));
  console.log('business analysis: ' + n + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
