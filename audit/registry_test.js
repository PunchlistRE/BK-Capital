// Analysis registry and the setup page. The registry is consistent; every analysis has its own steps, summary, report and checks; the guide's steps come
// from it; saved deals without an analysisType keep working unchanged; summaries read the engines and show missing inputs as missing; the setup page lists
// the registry's analyses and creates a deal of the analysis picked.
//   node audit/registry_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), V = require(path.join(__dirname, 'devdeal.js'));
/* the guide's steps, written out (ids, keys, which are required, labels): the original steps plus Sources and uses and Investors / LP-GP economics after Financing */
const GUIDE_ACQ = [['property', [['name', 1, 'Name'], ['location', 0, 'City, state'], ['units', 1, 'Units'], ['gsf', 0, 'Building area, SF']]],
  ['price', [['purchasePrice', 1, 'Purchase price'], ['closingCostsPct', 1, 'Closing costs, % of price'], ['closing', 0, 'Closing date']]],
  ['income', [['avgRent', 1, 'Average rent per unit, per month'], ['otherIncomePerUnit', 0, 'Other income per unit, per year'], ['vacancy', 1, 'Vacancy']]],
  ['expenses', [['taxes', 1, 'Real estate taxes, per year'], ['insurance', 1, 'Insurance, per year'], ['utilities', 0, 'Utilities the owner pays, per year'], ['rm', 1, 'Repairs and maintenance, per year'], ['mgmtPct', 1, 'Management fee, % of income'], ['payroll', 0, 'On-site payroll, per year'], ['contract', 0, 'Contract services (landscaping, snow, pest), per year'], ['ga', 0, 'General, admin and other, per year'], ['reserves', 0, 'Replacement reserves, per year']]],
  ['debt', [['debtEnabled', 0, 'Use acquisition debt'], ['acqLTV', 1, 'Loan-to-value, max'], ['acqRate', 1, 'Interest rate'], ['acqAmort', 0, 'Amortisation, years'], ['acqIO', 0, 'Interest-only years'], ['acqOrigFee', 0, 'Origination fee, %']]],
  ['sources', []],
  ['partners', [['gpShare', 0, 'GP / sponsor equity share'], ['pref', 0, 'Preferred return'], ['hurdle2', 0, 'Second hurdle (IRR)'], ['hurdle3', 0, 'Third hurdle (IRR)'], ['t2LP', 0, 'LP share above the preferred return'], ['t3LP', 0, 'LP share above the second hurdle'], ['t4LP', 0, 'LP share above the third hurdle']]],
  ['exit', [['holdYears', 1, 'Hold period, years'], ['exitCap', 1, 'Exit cap rate'], ['rentGrowth', 0, 'Annual rent growth'], ['opexGrowth', 0, 'Annual expense growth'], ['saleCostPct', 0, 'Cost of sale, % of price']]]];
const GUIDE_DEV = [['property', [['name', 1, 'Name'], ['location', 0, 'City, state'], ['units', 1, 'Residential units'], ['gsf', 0, 'Gross building area, SF']]],
  ['land', [['purchasePrice', 1, 'Land price'], ['sourceConstruction', 1, 'Construction budget (hard + soft)'], ['closing', 0, 'Closing date'], ['predevMonths', 0, 'Pre-development, months'], ['constructionMonths', 1, 'Construction, months'], ['leaseupMonths', 0, 'Lease-up, months']]],
  GUIDE_ACQ[2], GUIDE_ACQ[3],
  ['debt', [['conLTC', 1, 'Construction loan, % of cost'], ['conRate', 1, 'Construction loan rate'], ['permRate', 0, 'Permanent loan rate'], ['permAmort', 0, 'Permanent amortisation, years']]],
  GUIDE_ACQ[5], GUIDE_ACQ[6], GUIDE_ACQ[7]];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const p = await b.newPage({ viewport: { width: 1360, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok'));
  const open = (d) => p.evaluate((x) => { bkCreateNewDeal(x); const s = bkLoad(); Object.assign(s, x); bkSave(s); }, d);

  /* 1 the registry itself */
  const reg = await p.evaluate(() => { const R = BKReg, L = R.analyses(); return { lint: R.lint(), names: L.map(a => a.name), live: L.filter(a => a.live).map(a => a.id),
    steps: L.map(a => R.workflow(a.id).map(s => s.id).join('>')), summaries: L.map(a => R.summary(a.id).primary + ':' + R.summary(a.id).metrics.join(',')), reports: L.map(a => R.report(a.id).map(x => x.id).join(',')), checks: L.map(a => R.checks(a.id).join(',')) }; });
  check('the registry is consistent (every field, metric, section and rule resolves; no live analysis uses a planned one)', reg.lint.length === 0, reg.lint.join(' | '));
  check('eight analyses, named as specified, in order', JSON.stringify(reg.names) === JSON.stringify(['Property Valuation', 'Acquisition Analysis', 'Development Analysis', 'Refinancing Analysis', 'Hold & Disposition', 'Comprehensive Underwriting', 'Portfolio Analysis', 'Business Valuation & Underwriting']), reg.names.join());
  check('only Acquisition and Development are live today', JSON.stringify(reg.live) === '["acquisition","development"]', reg.live.join());
  const uniq = a => new Set(a).size === a.length;
  check('every analysis has its own workflow, summary, report and checks (no two identical)', uniq(reg.steps) && uniq(reg.summaries) && uniq(reg.reports) && uniq(reg.checks), '');
  check('the workflows have the brief\'s step counts: Valuation 10, Refinancing 11, Hold 12, Comprehensive 21, Portfolio 13', reg.steps[0].split('>').length === 10 && reg.steps[3].split('>').length === 11 && reg.steps[4].split('>').length === 12 && reg.steps[5].split('>').length === 21 && reg.steps[6].split('>').length === 13, reg.steps.map(x => x.split('>').length).join());
  check('Property Valuation runs no financing or investor-return engine, reports no financing section and leads with market value', await p.evaluate(() => { const a = BKReg.analysis('valuation'); return !a.engines.some(e => /debt|returns|waterfall|development/.test(e)) && BKReg.summary('valuation').primary === 'marketValue' && !BKReg._raw.reports.valuation.some(x => /waterfall|acqFinancial|devBudget/.test(x)); }));
  check('checks that do not apply read N/A: construction checks apply to development only', await p.evaluate(() => !BKReg.applies('acquisition', 'budget') && BKReg.applies('development', 'budget') && BKReg.applies('acquisition', 'irr') && !BKReg.applies('valuation', 'irr')));

  /* 2 the guide reads its steps from the registry, and they are today's steps */
  for (const [tag, deal, want] of [['acquisition', A, GUIDE_ACQ], ['development', V, GUIDE_DEV]]) {
    await open(deal); const g = await p.evaluate(() => bkGuideSections(bkLoad()).map(s => [s.id, s.fields.map(f => [f.k, f.req ? 1 : 0, f.label])]));
    check('guide (' + tag + '): its steps, fields, labels and required flags are exactly today\'s, now from the registry', JSON.stringify(g) === JSON.stringify(want), JSON.stringify(g).slice(0, 300)); }

  /* 3 saved deals without an analysisType */
  const compat = await p.evaluate(([a, v]) => { const out = {}; for (const [k, d] of [['acq', a], ['dev', v]]) { bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); delete s.analysisType; bkSave(s); const r1 = bkMonthlyReturns(); out[k] = { of: BKReg.of(bkLoad()).id, irr: r1.irr, dt: bkLoad().dealType };
      const s2 = bkLoad(); s2.analysisType = k === 'acq' ? 'acquisition' : 'development'; bkSave(s2); out[k].irr2 = bkMonthlyReturns().irr; out[k].dt2 = bkLoad().dealType; } return out; }, [A, V]);
  check('a saved acquisition with no analysisType is read as Acquisition Analysis; adding the field changes no number and not its dealType', compat.acq.of === 'acquisition' && compat.acq.irr === compat.acq.irr2 && compat.acq.dt === compat.acq.dt2, JSON.stringify(compat.acq));
  check('a saved development with no analysisType is read as Development Analysis, unchanged', compat.dev.of === 'development' && compat.dev.irr === compat.dev.irr2 && compat.dev.dt === 'Development', JSON.stringify(compat.dev));

  /* 4 summaries read the engines; missing is missing */
  await open(A); const sa = await p.evaluate(() => { const x = BKReg.summarize(), g = id => (x.metrics.find(m => m.id === id) || {}).value, m = bkMonthlyReturns(), d = bkDebt(), c = bkCalc(); return { a: x.analysis.id, primary: x.primary.value, irr: m.irr, eq: g('equity'), deq: d.equity, noi: g('noiInPlace'), cnoi: c.noi, cap: g('goingInCap'), price: Number(bkLoad().purchasePrice) }; });
  check('acquisition summary: the primary output is the levered IRR and every figure is the engine\'s', sa.a === 'acquisition' && sa.primary === sa.irr && sa.eq === sa.deq && sa.noi === sa.cnoi && Math.abs(sa.cap - sa.cnoi / sa.price) < 1e-15, JSON.stringify(sa));
  await open(V); const sd = await p.evaluate(() => { const x = BKReg.summarize(), g = id => (x.metrics.find(m => m.id === id) || {}).value, f = bkDevFundingV10(), d = bkDevV09(); return { a: x.analysis.id, eq: g('devEquity'), feq: f.equityTotal, cost: g('devCost'), unlev: d.unlev, cap: g('capInt'), fcap: f.actualCapInt, yoc: g('yieldOnCost'), y: bkCalc().noi / d.unlev }; });
  check('development summary: equity, cost, capitalized interest and yield on cost are the engine\'s', sd.a === 'development' && sd.eq === sd.feq && sd.cost === sd.unlev && sd.cap === sd.fcap && Math.abs(sd.yoc - sd.y) < 1e-15, JSON.stringify(sd));
  const blank = await p.evaluate(() => { bkCreateNewDeal({ name: 'Blank', dealId: 'BLANK-1', analysisType: 'acquisition' }); const x = BKReg.summarize(); return { price: x.metrics.find(m => m.id === 'price').value, eq: x.metrics.find(m => m.id === 'equity').value }; });
  check('on a blank deal the purchase price and equity are missing (null), never zero', blank.price === null && blank.eq === null, JSON.stringify(blank));
  const plan = await p.evaluate(() => { const s = bkLoad(); s.analysisType = 'valuation'; return BKReg.summarize(s).metrics.filter(m => m.planned).every(m => m.value === null); });
  check('planned metrics are flagged and never show a number', plan);

  /* 5 step completion is computed from the deal */
  const ss = await p.evaluate(() => { const R = BKReg, st = R.workflow('acquisition')[0]; const s = { name: '', units: 0 }; const a = R.stepState(st, s); const b2 = R.stepState(st, { name: 'X', units: 10 });
    const mix = R.workflow('valuation')[1]; const c1 = R.requirement(mix.fields[1], { commercialArea: 0 }), c2 = R.requirement(mix.fields[1], { commercialArea: 5000 }); return { a, b: b2, c1, c2, zero: R.present('vacancy', { vacancy: 0 }), zeroPrice: R.present('purchasePrice', { purchasePrice: 0 }) }; });
  check('a step is incomplete while a required field is blank and complete once filled', !ss.a.complete && ss.a.missing.join() === 'name,units' && ss.b.complete, JSON.stringify(ss));
  check('a conditional field is required only when its condition holds (tenant schedule when there is commercial space)', ss.c1 === 'na' && ss.c2 === 'required');
  check('zero is a valid vacancy but not a valid purchase price', ss.zero === true && ss.zeroPrice === false);

  /* 6 the setup page */
  await p.evaluate(() => { localStorage.removeItem('bkcapital.cre.v02'); }); await p.reload(); await p.waitForTimeout(900);
  await p.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); showSheet('Home'); }); await p.waitForTimeout(400);
  const fd = await p.evaluate(() => { const c = [...document.querySelectorAll('.pl-an')]; return { n: c.length, names: c.map(x => x.querySelector('b').textContent), live: c.filter(x => !x.classList.contains('off')).map(x => x.dataset.analysis), toolbar: !!document.querySelector('.pl-toolbar'), how: /How it works/.test(document.querySelector('#viewport').innerText), docs: [...document.querySelectorAll('.pl-docs .pl-link')].map(x => x.textContent) }; });
  check('the setup page shows the registry\'s eight analyses, two live, no toolbar, no How it works, and one line of document imports', fd.n === 8 && fd.live.join() === 'acquisition,development' && !fd.toolbar && !fd.how && fd.docs.join('|') === 'Offering memorandum|T-12|Rent roll|Source package', JSON.stringify(fd));
  await p.click('.pl-an[data-analysis="valuation"]', { force: true }); await p.waitForTimeout(200);
  check('an analysis that is not built cannot be started', await p.evaluate(() => !document.getElementById('pl-modal') || !document.getElementById('pl-modal').classList.contains('open')));
  await p.click('.pl-an[data-analysis="acquisition"]'); await p.waitForTimeout(250);
  const dlg = await p.evaluate(() => { const m = document.getElementById('pl-modal'), nm = m.querySelector('#pl-nm'); return { open: m.classList.contains('open'), title: m.querySelector('h3').textContent, typeSelect: !!m.querySelector('select#pl-an'), align: getComputedStyle(nm).textAlign, btns: [...m.querySelectorAll('button')].map(x => x.textContent).join('|') }; });
  check('the dialog is titled for the analysis, asks only for a name (left-aligned), with Cancel and Create', dlg.open && dlg.title === 'New Acquisition Analysis' && !dlg.typeSelect && /left|start/.test(dlg.align) && dlg.btns === 'Cancel|Create', JSON.stringify(dlg));
  await p.fill('#pl-nm', 'Harbor View'); await p.click('#pl-modal button:has-text("Create")'); await p.waitForTimeout(500);
  const made = await p.evaluate(() => { const s = bkLoad(); return { n: s.name, a: s.analysisType, t: s.dealType, id: s.dealId, sheet: currentSheet }; });
  check('Create makes a deal of that analysis on its engine family', made.n === 'Harbor View' && made.a === 'acquisition' && made.t === 'Acquisition' && !!made.id, JSON.stringify(made));
  await p.evaluate(() => { localStorage.removeItem('bkcapital.cre.v02'); }); await p.reload(); await p.waitForTimeout(900);
  await p.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); showSheet('Home'); }); await p.waitForTimeout(400);
  await p.click('.pl-an[data-analysis="development"]'); await p.waitForTimeout(250); await p.check('#pl-guide'); await p.click('#pl-modal button:has-text("Create")'); await p.waitForTimeout(600);
  const gd = await p.evaluate(() => ({ sheet: currentSheet, a: bkLoad().analysisType, t: bkLoad().dealType, id: bkLoad().dealId, steps: bkGuideSections(bkLoad()).map(s => s.id).join(), txt: document.querySelector('#viewport').innerText.slice(0, 400) }));
  check('"Guide me step by step" opens the guide on the new deal (no second deal), with the development steps', gd.sheet === 'Guide' && gd.a === 'development' && gd.t === 'Development' && /^NEW-/.test(gd.id) && gd.steps === 'property,land,income,expenses,debt,sources,partners,exit', JSON.stringify(gd));
  /* 7 theme and phone */
  for (const [w, theme] of [[390, 'dark'], [1360, 'dark'], [390, 'light']]) {
    await p.setViewportSize({ width: w, height: 900 }); await p.evaluate((t) => { localStorage.removeItem('bkcapital.cre.v02'); try { localStorage.setItem('bk-theme', t); } catch (e) {} }, theme); await p.reload(); await p.waitForTimeout(900);
    await p.evaluate((t) => { document.documentElement.classList.add('bk-auth-ok'); bkTheme.set(t); showSheet('Home'); }, theme); await p.waitForTimeout(300);
    const lay = await p.evaluate(() => { const c = document.querySelector('.pl-an'), cs = getComputedStyle(c), bg = cs.backgroundColor, fg = getComputedStyle(c.querySelector('b')).color; return { over: document.documentElement.scrollWidth - window.innerWidth, bg, fg, w: c.getBoundingClientRect().width }; });
    const lum = s => { const n = s.match(/[\d.]+/g).map(Number).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]; };
    const cr = (Math.max(lum(lay.bg), lum(lay.fg)) + 0.05) / (Math.min(lum(lay.bg), lum(lay.fg)) + 0.05);
    check('setup page at ' + w + 'px, ' + theme + ': no sideways scroll and card text is readable (contrast ' + cr.toFixed(1) + ':1)', lay.over <= 1 && cr >= 4.5, JSON.stringify(lay)); }
  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
