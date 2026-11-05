// Analysis registry, part 2: the step bar, the readiness workflow, the Overview tiles and the integrity checks read the deal's analysis from the registry.
// Acquisition and Development reproduce what they showed before; an analysis judged by its workflow steps gets its own stages.
//   node audit/registry2_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), V = require(path.join(__dirname, 'devdeal.js'));
const OLD = [['setup', 'Setup', 'Home'], ['inputs', 'Inputs', 'Deal Underwrite,Rent Roll,Import,Depreciation,Source Data'], ['ops', 'Operations', 'Operating Underwrite,Property CF'], ['debt', 'Debt', 'Debt,Debt Schedule,Covenant Monitor'], ['returns', 'Returns', 'Returns,Equity Waterfall,After-Tax'], ['review', 'Review', 'Sensitivity,Reverse Solve,QA']];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok'));
  const open = (d) => p.evaluate((x) => { bkCreateNewDeal(x); const s = bkLoad(); Object.assign(s, x); bkSave(s); }, d);
  check('the registry, with its stages and tiles, is consistent', await p.evaluate(() => BKReg.lint().length === 0), await p.evaluate(() => BKReg.lint().join(' | ')));
  for (const [tag, deal] of [['acquisition', A], ['development', V]]) {
    await open(deal);
    const st = await p.evaluate(() => BKReg.stages(BKReg.of(bkLoad()).id).map(g => [g.id, g.label, g.sheets.join(',')]));
    check(tag + ': the step bar stages are the six it always had (ids, labels, sheets)', JSON.stringify(st) === JSON.stringify(OLD), JSON.stringify(st));
    const bar = await p.evaluate(() => { showSheet('Deal Underwrite'); return [...document.querySelectorAll('.bk-step')].map(x => x.textContent.replace(/^[^A-Za-z]+/, '').trim()); });
    check(tag + ': the step bar on the page shows those six', bar.join() === 'Setup,Inputs,Operations,Debt,Returns,Review', bar.join());
    const rd = await p.evaluate(() => { const r = bkDealReadiness(); return { a: r.analysis, n: (r.workflow || []).length, can: r.canCalculate, wf: r.workflow.map(x => x.id).join() }; });
    check(tag + ': readiness names the analysis and carries its workflow; results are still shown (gating unchanged)', rd.a === tag && rd.n >= 6 && rd.can === true, JSON.stringify(rd));
    const tiles = await p.evaluate((tag) => { showSheet('Home'); const t = [...document.querySelectorAll('.pl-kpi')].map(x => x.querySelector('.k').textContent); const h = bkHeadline(), x = BKReg.summarize(); const g = id => (x.metrics.concat([x.primary]).find(m => m.id === id) || {}).value; return { t, irr: [h.levIRR, g('leveredIRR')], eq: [h.equity, g(tag === 'development' ? 'devEquity' : 'equity')] }; }, tag);
    check(tag + ': the Overview tiles are the registry\'s, in its order, and the summary reads the same figures as the tiles', tiles.t.join('|') === 'Levered IRR|Equity multiple|Yield on cost|Year-1 DSCR|Loan|Equity' && tiles.irr[0] === tiles.irr[1] && tiles.eq[0] === tiles.eq[1], JSON.stringify(tiles));
    const ig = await p.evaluate(() => { const with1 = bkIntegrity().checks.map(c => c.id + ':' + c.status); const keep = BKReg.mapsCheck; BKReg.mapsCheck = () => false; const without = bkIntegrity().checks.map(c => c.id + ':' + c.status); BKReg.mapsCheck = keep; return { same: JSON.stringify(with1) === JSON.stringify(without), na: with1.filter(x => /:na$/.test(x)) }; });
    check(tag + ': every integrity check that ran before still runs with the same result (none of its checks is outside its analysis)', ig.same, JSON.stringify(ig));
  }
  /* a check outside the analysis reads N/A */
  const na = await p.evaluate(() => { const s = bkLoad(); const keep = BKReg.of; BKReg.of = () => BKReg.analysis('valuation'); const c = bkIntegrity().checks; BKReg.of = keep; return c.filter(x => ['budget', 'su', 'draws', 'capint', 'facility', 'irr'].includes(x.id)).map(x => x.id + ':' + x.status); });
  check('read as a Property Valuation, construction and IRR checks read N/A instead of failing', na.length > 0 && na.every(x => /:na$/.test(x)), na.join());
  /* an analysis judged by its workflow steps gets its own stages, done when its steps are */
  const val = await p.evaluate(() => { const s = { analysisType: 'valuation', name: 'X', location: 'Y', propertyType: 'Multifamily', gsf: 9000, rentRoll: [] }; const g = BKReg.stages('valuation'); return { labels: g.map(x => x.label).join(), first: BKReg.stageFromSteps(g[0], s), done: BKReg.stageFromSteps(g[0], Object.assign({}, s, { units: 10 })) }; });
  check('Property Valuation has its own stages; its first stage waits for the unit count (the rent roll is optional) and is done once it is entered', val.labels === 'Property,Income,Expenses,Value,Report' && val.first.st === 'warn' && /[Uu]nits/.test(val.first.tip) && val.done.st === 'done', JSON.stringify(val));
  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
