// Refinancing Analysis: the first analysis with its own engine on the registry. Sizing, payoff and proceeds against an independent model (audit/refi2_ref.py);
// alternatives; missing inputs; readiness, step bar, Overview tiles and the guide from the registry; the report built section by section in the registry's order.
//   node audit/refinance_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'); const fs = require('fs'); const os = require('os'); const cp = require('child_process');
const D = require(path.join(__dirname, 'refideal.js')), A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok'));
  const open = (d) => p.evaluate((x) => { bkCreateNewDeal(x); const s = bkLoad(); Object.assign(s, x); bkSave(s); return JSON.parse(JSON.stringify(bkLoad())); }, d);
  const eng = () => p.evaluate(() => { const r = bkRefinance(); const m = r.main || {}; return { ok: r.ok, noi: r.noi, value: r.value, payoff: r.payoff, exDS: r.exDS, main: m.ok ? { loan: m.loan, binding: m.binding, ds1: m.ds1, dscr: m.dscr, dy: m.dy, ltv: m.ltv, net: m.net } : null, alts: r.alts.map(a => ({ loan: a.loan, binding: a.binding, ds1: a.ds1, dscr: a.dscr, net: a.net })), checks: r.checks, missing: r.missing.concat(m.missing || []) }; });
  const ref = (s) => { const f = path.join(os.tmpdir(), 'bk-refi-' + process.pid + '.json'); fs.writeFileSync(f, JSON.stringify(s)); return JSON.parse(cp.execSync('python3 ' + JSON.stringify(path.join(__dirname, 'refi2_ref.py')) + ' ' + JSON.stringify(f)).toString()); };
  const near = (a, b2, t) => Math.abs(a - b2) <= (t || 0.01) * Math.max(1, Math.abs(b2));

  let s = await open(D), e = await eng(), r = ref(s);
  check('the registry is consistent with Refinancing live', await p.evaluate(() => BKReg.lint().length === 0 && BKReg.analysis('refinance').live), await p.evaluate(() => BKReg.lint().join(' | ')));
  check('independent model: NOI, value (NOI / cap rate), payoff and existing debt service agree', near(e.noi, r.noi, 1e-9) && near(e.value, r.value, 1e-9) && near(e.payoff, r.payoff, 1e-12) && near(e.exDS, r.exDS, 1e-9), JSON.stringify([e.noi, r.noi, e.value, r.value, e.exDS, r.exDS]));
  check('independent model: the new loan, its binding test, year-1 debt service, DSCR, debt yield, LTV and net proceeds agree', e.main && e.main.loan === r.main.loan && e.main.binding === r.main.binding && near(e.main.ds1, r.main.ds1, 1e-9) && near(e.main.dscr, r.main.dscr, 1e-9) && near(e.main.dy, r.main.dy, 1e-9) && near(e.main.ltv, r.main.ltv, 1e-9) && near(e.main.net, r.main.net, 1e-12), JSON.stringify([e.main, r.main]));
  check('independent model: both alternatives agree (one with an interest-only period: year-1 debt service is interest only)', e.alts.length === 2 && e.alts.every((a, i) => a.loan === r.alts[i].loan && a.binding === r.alts[i].binding && near(a.ds1, r.alts[i].ds1, 1e-9) && near(a.net, r.alts[i].net, 1e-12)) && Math.abs(e.alts[1].ds1 - e.alts[1].loan * 0.0595) < 1e-6, JSON.stringify([e.alts, r.alts]));
  check('the internal checks tie (NOI, payoff, sizing, proceeds)', e.checks.length === 4 && e.checks.every(c => c.ok), JSON.stringify(e.checks));
  /* the lowest test binds; asking for less gives less; the lender NOI basis changes the NOI */
  { s = await open(Object.assign({}, D, { newLoanAmount: 5000000 })); const x = await eng(); check('asking for $5,000,000 gives a $5,000,000 loan, bound by the request', x.main.loan === 5000000 && x.main.binding === 'Amount requested'); }
  { s = await open(Object.assign({}, D, { lenderMinDSCR: 1.0 })); const x = await eng(), y = ref(s); check('relaxing DSCR to 1.00x lets the LTV test bind, as the independent model says', x.main.binding === 'Loan to value' && x.main.loan === y.main.loan, JSON.stringify([x.main, y.main])); }
  { s = await open(Object.assign({}, D, { lenderNoiBasis: 'after' })); const x = await eng(), y = ref(s); check('lenders sizing on NOI after reserves: NOI falls by the reserves and the loan follows', near(x.noi, e.noi - 12000, 1e-9) && x.main.loan === y.main.loan && x.main.loan < e.main.loan, JSON.stringify([x.noi, x.main.loan, y.main.loan])); }
  { s = await open(Object.assign({}, D, { valCapRate: null, currentValue: 10000000 })); const x = await eng(); check('an entered value is used in place of the cap-rate value', x.value === 10000000); }
  { s = await open(Object.assign({}, D, { exLoanBalance: 9000000 })); const x = await eng(); check('a payoff larger than the new loan shows the equity needed (negative proceeds)', x.main.net < 0, x.main.net); }
  /* missing inputs: no number is shown, the gaps are named, nothing becomes zero */
  { s = await open(Object.assign({}, D, { exLoanBalance: null, newLoanRate: null })); const x = await eng(); const rd = await p.evaluate(() => { const r = bkDealReadiness(); return { can: r.canCalculate, state: r.state, miss: r.missing.map(m => m.key) }; });
    check('with the existing balance and the new rate blank, nothing is sized and readiness lists exactly what is missing', !x.ok && x.main === null && !rd.can && rd.state === 'DRAFT' && rd.miss.includes('exLoanBalance') && rd.miss.includes('newLoanRate'), JSON.stringify([x.missing, rd])); }
  /* readiness, step bar, tiles, guide */
  s = await open(D);
  const ui = await p.evaluate(() => { const rd = bkDealReadiness(); showSheet('Home'); const tiles = [...document.querySelectorAll('.pl-kpi .k')].map(x => x.textContent); const steps = [...document.querySelectorAll('.bk-step')].map(x => x.textContent.replace(/^[^A-Za-z]+/, '')); const guide = bkGuideSections(bkLoad()).map(x => x.id).join(); return { rd: [rd.analysis, rd.state, rd.canCalculate], tiles, steps, guide }; });
  check('a complete refinance is ANALYSIS READY by its own required inputs (no purchase price, hold or exit cap needed)', ui.rd[0] === 'refinance' && ui.rd[1] === 'ANALYSIS READY' && ui.rd[2] === true, JSON.stringify(ui.rd));
  check('the step bar shows the refinance stages', ui.steps.join() === 'Property,Value,Existing loan,New loan,Proceeds,Report', ui.steps.join());
  check('the Overview leads with net proceeds, then the loan, LTV, lender DSCR, payoff and remaining equity', ui.tiles.join('|') === 'Net proceeds|Proposed loan|LTV|Lender DSCR|Existing loan payoff|Remaining equity', ui.tiles.join('|'));
  check('the guide walks the refinance workflow', /^property,ops,value,existing,proposed,lender,sizing,costs,proceeds,alts/.test(ui.guide), ui.guide);
  /* the sheet and the report */
  const sh = await p.evaluate(() => { showSheet('Refinancing'); const t = document.querySelector('#viewport').innerText; return { bad: /undefined|NaN/.test(t), compare: !!document.getElementById('rf-compare'), tests: document.querySelectorAll('#rf-tests tbody tr').length, inputs: document.querySelectorAll('#viewport input.rf-in').length }; });
  check('the Refinancing sheet shows the inputs, how the loan is sized (three tests), the side-by-side comparison and no undefined or NaN', !sh.bad && sh.compare && sh.tests === 3 && sh.inputs >= 17, JSON.stringify(sh));
  await p.fill('#rf-lenderMinDSCR', '1.4'); await p.dispatchEvent('#rf-lenderMinDSCR', 'change'); await p.waitForTimeout(300);
  check('typing a lender test on the sheet writes it and re-sizes the loan', await p.evaluate((l) => bkLoad().lenderMinDSCR === 1.4 && bkRefinance().main.loan < l, e.main.loan));
  s = await open(D);
  const rp = await p.evaluate(() => { showSheet('Refinance Report'); return { secs: [...document.querySelectorAll('.rf-sec')].map(x => x.dataset.section), want: BKReg.report('refinance').map(x => x.id), txt: document.querySelector('#viewport').innerText, print: !!document.querySelector('.bk-print-btn, [onclick*="bkPrintSection"]') }; });
  check('the report is built section by section in the registry\'s order', rp.secs.join() === rp.want.join() && rp.secs.length === 7, JSON.stringify(rp.secs));
  check('the report states the loan, the payoff and the proceeds the engine computed, and its limitations', rp.txt.includes('$' + Math.round(e.main.loan).toLocaleString('en-US')) && rp.txt.includes('$' + Math.round(e.payoff).toLocaleString('en-US')) && /not a loan commitment or an appraisal/.test(rp.txt) && rp.print, rp.txt.slice(0, 200));
  /* starting one from the setup page */
  await p.evaluate(() => { localStorage.removeItem('bkcapital.cre.v02'); }); await p.reload(); await p.waitForTimeout(900); await p.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); showSheet('Home'); }); await p.waitForTimeout(300);
  check('the Refinancing card is live on the setup page', await p.evaluate(() => { const c = document.querySelector('.pl-an[data-analysis="refinance"]'); return !!c && !c.classList.contains('off'); }));
  await p.click('.pl-an[data-analysis="refinance"]'); await p.waitForTimeout(250); await p.fill('#pl-nm', 'Elm Court'); await p.click('#pl-modal button:has-text("Create")'); await p.waitForTimeout(500);
  const nd = await p.evaluate(() => { const s = bkLoad(), r = bkDealReadiness(), x = bkRefinance(); return { a: s.analysisType, t: s.dealType, n: s.name, state: r.state, can: r.canCalculate, sized: x.ok }; });
  check('a new Refinancing Analysis starts blank: nothing sized, readiness DRAFT', nd.a === 'refinance' && nd.t === 'Acquisition' && nd.n === 'Elm Court' && nd.state === 'DRAFT' && !nd.can && !nd.sized, JSON.stringify(nd));
  /* acquisitions are unaffected */
  await open(A); check('an acquisition deal keeps its own readiness (unchanged)', await p.evaluate(() => { const r = bkDealReadiness(); return r.analysis === 'acquisition' && r.canCalculate === true && /READY/.test(r.state); }));
  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
