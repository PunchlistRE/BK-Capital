// Interface test: the conventions panel, its explanations, the loan-sizing labels and the readiness
// checks must describe the settings the engine is actually using.
//   node audit/ui_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path');
const B = require(path.join(__dirname, 'dealB.js'));
const A_ = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(1000);
  let fails = 0;
  const check = (name, ok, detail) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); };
  const state = () => p.evaluate(() => {
    showSheet('Deal Underwrite');
    const cv = bkConventions(bkLoad()), d = bkDebt();
    const rows = [...document.querySelectorAll('#viewport table')].find(t => /Underwriting Conventions/.test(t.querySelector('caption')?.textContent || ''));
    const panel = [...rows.querySelectorAll('tbody tr')].map(r => ({ label: r.cells[0].textContent.trim(), value: r.querySelector('select') ? r.querySelector('select').value : r.cells[1].textContent.trim(), why: r.cells[2].textContent.trim(), status: r.cells[3].textContent.trim() }));
    const sizing = [...document.querySelectorAll('#viewport table.bk-constraint-grid tbody tr')].map(r => [...r.cells].map(c => c.textContent.trim()));
    const ltvInput = document.querySelector('#viewport tr.input[data-bk-key="acqLTV"] td')?.textContent.trim();
    const banner = !!document.querySelector('#viewport button[onclick="bkApplyStandardConventions()"]');
    showSheet('Debt'); const debt = document.getElementById('viewport').innerText;
    showSheet('Sources & Uses'); const su = [...document.querySelectorAll('#viewport tr')].find(t => /^Loan to Value/.test(t.cells[0]?.textContent || ''))?.cells[2].textContent.trim();
    showSheet('Equity Waterfall'); const wfMeta = document.querySelector('.meta-strip').innerText;
    showSheet('Property CF'); const cfMeta = document.querySelector('.meta-strip').innerText;
    return { cv, ltvValue: d.ltvValue, price: bkLoad().purchasePrice, stab: d.stab, panel, sizing, ltvInput, banner, debt, su, wfMeta, cfMeta };
  });
  const verify = async (tag) => {
    const s = await state(), c = s.cv;
    const row = l => s.panel.find(r => r.label.indexOf(l) === 0);
    check(`${tag}: panel growth start = engine (${c.cvRentGrowthStart})`, row('Rent & Expense Growth').value === c.cvRentGrowthStart);
    check(`${tag}: panel opex share = engine (${c.cvOpexVariablePct})`, Number(row('Occupancy-Variable').value) === c.cvOpexVariablePct);
    check(`${tag}: panel LTV basis = engine (${c.cvLtvBasis})`, row('Acquisition LTV Basis').value === c.cvLtvBasis);
    check(`${tag}: panel hurdle basis = engine (${c.cvHurdleBasis})`, row('Waterfall Hurdles').value === c.cvHurdleBasis);
    check(`${tag}: growth explanation matches setting`, c.cvRentGrowthStart === 'year2' ? /growth steps once a year from Year 2/.test(row('Rent & Expense Growth').why) : /compounds monthly from month 1/.test(row('Rent & Expense Growth').why));
    check(`${tag}: hurdle explanation matches setting`, c.cvHurdleBasis === 'lp' ? /LP itself has reached/.test(row('Waterfall Hurdles').why) : /total distributions/.test(row('Waterfall Hurdles').why));
    const want = { price: 'purchase price', lesser: 'lesser of price / value', value: 'underwritten value' }[c.cvLtvBasis];
    const sz = s.sizing.find(r => /^Max LTV/.test(r[0]));
    check(`${tag}: loan-sizing row label names the basis`, sz && sz[0].toLowerCase().indexOf(want) > -1, sz && sz[0]);
    check(`${tag}: loan-sizing row value = engine LTV value ${Math.round(s.ltvValue).toLocaleString()}`, sz && Number(sz[1].replace(/[$,]/g, '')) === Math.round(s.ltvValue), sz && sz[1]);
    check(`${tag}: acqLTV input label names the basis`, (s.ltvInput || '').toLowerCase().indexOf(want) > -1, s.ltvInput);
    check(`${tag}: Debt constraint row names the basis`, s.debt.toLowerCase().indexOf('× ' + want) > -1);
    check(`${tag}: Debt meta shows LTV basis`, s.debt.toLowerCase().indexOf(want) > -1);
    check(`${tag}: Sources & Uses LTV basis text`, (s.su || '').toLowerCase().indexOf(want) > -1, s.su);
    check(`${tag}: Equity Waterfall meta shows hurdle basis`, s.wfMeta.indexOf(c.cvHurdleBasis === 'lp' ? 'LP cash flows' : 'Deal equity') > -1);
    check(`${tag}: Property CF meta shows growth start`, s.cfMeta.indexOf(c.cvRentGrowthStart === 'year2' ? 'Year 2' : 'Month 1') > -1);
    return s;
  };
  // 1. new deal: standard conventions
  await p.evaluate(d => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); }, B);
  let s = await verify('standard deal');
  check('standard deal: every setting marked STANDARD', s.panel.slice(0, 5).every(r => r.status === 'STANDARD'));
  check('standard deal: no legacy banner', !s.banner);
  // 2. change each setting through the panel's own controls; engine and labels must follow
  await p.evaluate(() => showSheet('Deal Underwrite'));
  for (const [label, val] of [['Rent & Expense Growth', 'month1'], ['Occupancy-Variable', '0.25'], ['Acquisition LTV Basis', 'lesser'], ['Waterfall Hurdles', 'deal'], ['Bad Debt Basis', 'gross']]) {
    const before = await p.evaluate(() => bkMonthlyReturns().irr);
    await p.evaluate(([l, v]) => { const r = [...document.querySelectorAll('#viewport tr')].find(t => (t.cells[0]?.textContent || '').trim().indexOf(l) === 0); const sel = r.querySelector('select'); sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); }, [label, val]);
    await p.waitForTimeout(150);
    const after = await p.evaluate(() => ({ irr: bkMonthlyReturns().irr, lp: bkWaterfallV07().lpIRR }));
    console.log(`      set ${label} -> ${val}: levered IRR ${(before * 100).toFixed(2)}% -> ${(after.irr * 100).toFixed(2)}%, LP IRR ${(after.lp * 100).toFixed(2)}%`);
  }
  s = await verify('custom deal');
  check('custom deal: changed settings marked CUSTOM', s.panel.slice(0, 5).every(r => r.status === 'CUSTOM'));
  // 3. legacy deal: banner, LEGACY chips, apply-standard, undo
  await p.evaluate(d => { bkCreateNewDeal(d); const st = JSON.parse(localStorage.getItem('bkcapital.cre.v02'));
    ['cvRentGrowthStart', 'cvOpexVariablePct', 'cvLtvBasis', 'cvHurdleBasis', 'cvBadDebtBasis', '_conventions'].forEach(k => delete st[k]);
    localStorage.setItem('bkcapital.cre.v02', JSON.stringify(st)); }, B);
  s = await verify('legacy deal');
  check('legacy deal: settings marked LEGACY and banner shown', s.panel.slice(0, 5).every(r => r.status === 'LEGACY') && s.banner);
  await p.evaluate(() => showSheet('Deal Underwrite'));
  await p.click('#viewport button[onclick="bkApplyStandardConventions()"]'); await p.waitForTimeout(150);
  s = await verify('legacy deal after Apply');
  check('Apply standard: all five now STANDARD', s.panel.slice(0, 5).every(r => r.status === 'STANDARD') && !s.banner);
  await p.evaluate(() => window.bkUndo()); await p.waitForTimeout(150);
  s = await state();
  check('Undo restores the legacy methodology', s.cv.isLegacy, JSON.stringify(s.cv.legacyFields));
  // 4. readiness: GP outside 0-100% is a FAIL control and the deal is not decision-grade
  await p.evaluate(() => { const st = bkLoad(); st.gpShare = 1.5; bkSave(st); showSheet('Deal Underwrite'); });
  const rd = await p.evaluate(() => ({ state: bkDealReadiness().state, ctl: bkModelControls().filter(c => c.level === 'FAIL').map(c => c.msg),
    lpChip: [...document.querySelectorAll('#viewport tr')].find(t => /LP Equity Share/.test(t.textContent))?.cells[3].textContent.trim() }));
  check('GP 150%: readiness NOT DECISION-GRADE', rd.state === 'NOT DECISION-GRADE', rd.state);
  check('GP 150%: FAIL control explains the ownership split', rd.ctl.some(m => /GP equity share must be between 0% and 100%/.test(m)));
  check('GP 150%: LP row flags the error', /GP MUST BE 0-100%/.test(rd.lpChip || ''), rd.lpChip);
  await p.evaluate(() => { const st = bkLoad(); st.gpShare = 0.1; bkSave(st); });
  const rd2 = await p.evaluate(() => bkDealReadiness().state);
  check('GP 10%: readiness restored', rd2 !== 'NOT DECISION-GRADE', rd2);
  // 5. Credit & IC sheets: render, edit through the real inputs, and drive the gate
  await p.evaluate(d => { bkCreateNewDeal(d); }, B);
  const cap = await p.evaluate(() => { const o = {}; ['IC Memo', 'Debt Capacity', 'Credit Policy'].forEach(n => { showSheet(n); o[n] = [...document.querySelectorAll('#viewport caption')].map(c => c.textContent.trim().toUpperCase()); }); return o; });
  check('IC Memo shows the policy test table, exceptions, cushions, risk register and override', ['POLICY TEST TABLE', 'RANKED EXCEPTIONS', 'BREAK-EVEN AND STRESS CUSHIONS', 'RISK REGISTER', 'CREDIT OVERRIDE'].every(k => cap['IC Memo'].some(c => c.includes(k))), cap['IC Memo'].join(' | '));
  check('Debt Capacity shows the credit box, sizing bridge and proceeds ladder', ['CREDIT BOX', 'SIZING BRIDGE', 'PROCEEDS LADDER'].every(k => cap['Debt Capacity'].some(c => c.includes(k))), cap['Debt Capacity'].join(' | '));
  await p.evaluate(() => showSheet('Credit Policy'));
  const before = await p.evaluate(() => bkDealGate().capacity.capacity);
  const inp = p.locator('#viewport tr', { hasText: 'Minimum DSCR' }).first().locator('input');
  await inp.fill('1.10'); await inp.dispatchEvent('change'); await p.waitForTimeout(250);
  const after = await p.evaluate(() => ({ cap: bkDealGate().capacity.capacity, dscr: bkPolicy().minDSCR }));
  check('editing Minimum DSCR on Credit Policy changes the policy and the supportable debt', after.dscr === 1.1 && after.cap > before, JSON.stringify({ before, after }));
  await p.evaluate(() => { bkICSet('override.on', 'YES'); bkICSet('override.reason', 'test'); bkICSet('override.approvedBy', ''); });
  const ov1 = await p.evaluate(() => bkDealGate().overrideValid);
  await p.evaluate(() => bkICSet('override.approvedBy', 'CCO'));
  const ov2 = await p.evaluate(() => bkDealGate().overrideValid);
  check('a credit override is only valid with YES + reason + approver', ov1 === false && ov2 === true, JSON.stringify({ ov1, ov2 }));
  await p.evaluate(d => { bkCreateNewDeal(Object.assign({}, d, { dealType: 'Development', predevMonths: 6, constructionMonths: 18, leaseupMonths: 12 })); showSheet('Debt Capacity'); }, B);
  check('Debt Capacity says acquisition-only on a development deal', /acquisition deals/i.test(await p.evaluate(() => document.querySelector('#viewport').innerText)));
  // 6. Refi / Recap: renders every section, editing the year re-sizes the loan, and a development deal says it does not apply
  await p.evaluate(d => { bkCreateNewDeal(Object.assign({}, d, { holdYears: 10, rentGrowth: 0.05, exitCap: 0.055 })); showSheet('Refi / Recap'); }, B);
  const rcaps = await p.evaluate(() => [...document.querySelectorAll('#viewport caption')].map(c => c.textContent.trim().toUpperCase()));
  check('Refi / Recap shows assumptions, position, sizing, timing, return impact and reconciliation', ['REFINANCE ASSUMPTIONS', 'POSITION AT REFINANCE', 'NEW LOAN SIZING', 'REFINANCE TIMING', 'RETURN IMPACT', 'RECONCILIATION'].every(k => rcaps.some(c => c.includes(k))), rcaps.join(' | '));
  const y0 = await p.evaluate(() => bkRefi().selected.netCashOut);
  const yin = p.locator('#viewport tr', { hasText: 'Refinance year (end of year)' }).first().locator('input');
  await yin.fill('8'); await yin.dispatchEvent('change'); await p.waitForTimeout(250);
  const y1 = await p.evaluate(() => ({ y: bkRefi().selected.year, net: bkRefi().selected.netCashOut }));
  check('editing the refinance year on the sheet re-sizes the refinance', y1.y === 8 && y1.net !== y0, JSON.stringify({ y0, y1 }));
  check('the refinance reconciliation passes', await p.evaluate(() => bkRefi().recon.ok === true));
  await p.evaluate(d => { bkCreateNewDeal(Object.assign({}, d, { dealType: 'Development', predevMonths: 6, constructionMonths: 18, leaseupMonths: 12 })); showSheet('Refi / Recap'); }, B);
  check('Refi / Recap says it applies to acquisition deals on a development deal', /acquisition deals/i.test(await p.evaluate(() => document.querySelector('#viewport').innerText)));
  // 7. Operating Business: empty state, seeding, editing a driver on the sheet flows through, sell-vs-hold renders
  await p.evaluate(d => { bkCreateNewDeal(d); showSheet('Business Model'); }, B);
  check('Business Model shows an empty state before a business is added', /add (an )?operating business|no operating business/i.test(await p.evaluate(() => document.querySelector('#viewport').innerText)));
  await p.evaluate(() => { bkBizSeedPunchlist(); showSheet('Business Valuation'); }); await p.waitForTimeout(250);
  const ev0 = await p.evaluate(() => bkBizModel().dcf.ev);
  const bcaps = await p.evaluate(() => [...document.querySelectorAll('#viewport caption')].length);
  check('Business Valuation renders its tables once seeded', bcaps >= 8, String(bcaps));
  await p.evaluate(() => { bkBizSet('dcf.cases.base.mult', 6); showSheet('Sell vs Hold'); }); await p.waitForTimeout(250);
  const ev1 = await p.evaluate(() => bkBizModel().dcf.ev);
  check('editing the exit multiple changes the business value', ev1 !== ev0, JSON.stringify({ ev0, ev1 }));
  check('Sell vs Hold lists the four choices', await p.evaluate(() => ['Hold both', 'Sell the business, keep the property', 'Sell the property, keep the business', 'Sell both'].every(t => document.querySelector('#viewport').innerText.includes(t))));
  // 8. Market Benchmarks: compares the deal with published ranges, ranges are editable, development deals are told it does not apply
  await p.evaluate(d => { bkCreateNewDeal(d); showSheet('Market Benchmarks'); }, B); await p.waitForTimeout(200);
  const mk1 = await p.evaluate(() => ({ rows: bkMarketCompare().rows, caps: [...document.querySelectorAll('#viewport caption')].map(c => c.textContent.trim().toUpperCase()), exit: bkLoad().exitCap }));
  check('Market Benchmarks lists nine assumptions against their ranges and sources', mk1.rows.length === 9 && mk1.caps.includes('DEAL VS PUBLISHED MARKET RANGE') && mk1.caps.includes('SOURCES AND CAVEATS'), JSON.stringify(mk1.caps));
  check("Market Benchmarks reads the deal's own exit cap", mk1.rows.find(r => r.id === 'exitCap').value === mk1.exit);
  await p.evaluate(() => bkMarketSet('exitCap', 'high', 4)); await p.waitForTimeout(150);
  check('editing a market range changes the position and persists', await p.evaluate(() => bkMarketCompare().rows.find(r => r.id === 'exitCap').status) === 'ABOVE RANGE');
  await p.evaluate(() => bkMarketReset());
  await p.evaluate(d => { bkCreateNewDeal(Object.assign({}, d, { dealType: 'Development', predevMonths: 6, constructionMonths: 18, leaseupMonths: 12 })); showSheet('Market Benchmarks'); }, B);
  check('Market Benchmarks says it applies to stabilised multifamily acquisitions on a development deal', /development deal/i.test(await p.evaluate(() => document.querySelector('#viewport').innerText)));
  // 9. Top navigation: six tabs, dropdowns of sheets, one open at a time, choosing a sheet opens it and closes the menu
  await p.evaluate(d => { bkCreateNewDeal(d); showSheet('Depreciation'); }, B); await p.waitForTimeout(200);
  const nv = await p.evaluate(() => ({ tabs: [...document.querySelectorAll('.tabnav-primary > *')].length, secondary: document.querySelectorAll('.tabnav-secondary').length, cur: document.querySelector('.tabnav-primary .grp-btn.on').innerText }));
  check('top bar has the main tabs and no second row of sheet tabs', nv.tabs >= 6 && nv.secondary === 0, JSON.stringify(nv));
  check('the active tab names the current sheet', /Underwrite/.test(nv.cur) && /Depreciation/.test(nv.cur), nv.cur);
  await p.click('.bk-nav:has-text("Underwrite") > .grp-btn'); await p.click('.bk-nav:has-text("Business") > .grp-btn');
  check('only one dropdown is open at a time', await p.evaluate(() => document.querySelectorAll('.bk-nav.open').length) === 1);
  await p.click('.bk-nav.open .it:has-text("Sell vs Hold")'); await p.waitForTimeout(300);
  check('choosing a sheet from a dropdown opens it and closes the menu', await p.evaluate(() => currentSheet === 'Sell vs Hold' && document.querySelectorAll('.bk-nav.open').length === 0));
  check('every sheet in the navigation is reachable from a dropdown or tab', await p.evaluate(() => { const all = new Set([...document.querySelectorAll('.tabnav-primary [data-goto-sheet]')].map(e => e.dataset.gotoSheet)); return GROUPS.filter(g => !g.hidden && g.id !== 'dev').flatMap(g => g.sheets).every(s => all.has(s)); }));
  // 10. Probability-Weighted Returns: scenario weighting on the sheet, repeatable Monte Carlo, run from the sheet, stale detection
  await p.evaluate(d => { bkCreateNewDeal(d); showSheet('Probability-Weighted'); }, B); await p.waitForTimeout(300);
  const pw = await p.evaluate(() => { const c = [...document.querySelectorAll('#viewport caption')].map(x => x.textContent.trim().toUpperCase()); const r = bkRiskScenarios(); return { c, tot: r.probTotal, w: r.expProfit, mid: r.cases[1].profit, lo: r.cases[0].profit, hi: r.cases[2].profit, p: r.cases.map(x => x.p) }; });
  check('the sheet shows the scenario table, the odds and the Monte Carlo drivers', ['SCENARIO-WEIGHTED RETURNS - YOUR PROBABILITIES', 'WHAT THE WEIGHTING SAYS', 'MONTE CARLO - HOW FAR EACH DRIVER CAN MOVE'].every(t => pw.c.includes(t)), JSON.stringify(pw.c));
  check('default weights are 25 / 50 / 25 and expected profit is their weighted sum', Math.abs(pw.tot - 1) < 1e-12 && Math.abs(pw.w - (0.25 * pw.lo + 0.5 * pw.mid + 0.25 * pw.hi)) < 0.01, JSON.stringify(pw.p));
  await p.evaluate(() => bkRiskSet('p.Downside', 0.5)); await p.waitForTimeout(200);
  check('probabilities that do not sum to 100% raise a Model Checks error', await p.evaluate(() => bkConflicts().some(c => c.id === 'risk.prob-not-100' && c.level === 'ERROR')));
  await p.evaluate(() => bkRiskSet('p.Downside', 0.25));
  const same = await p.evaluate(() => { const a = bkRiskRunSync(60), b2 = bkRiskRunSync(60); bkRiskSet('seed', 5); const c2 = bkRiskRunSync(60); return { eq: JSON.stringify(a.runs) === JSON.stringify(b2.runs), diff: JSON.stringify(a.runs) !== JSON.stringify(c2.runs) }; });
  check('the same seed and inputs reproduce the Monte Carlo exactly; another seed does not', same.eq && same.diff, JSON.stringify(same));
  await p.evaluate(() => { bkRiskSet('seed', 20260101); bkRiskSet('n', 60); }); await p.waitForTimeout(200);
  await p.click('button:has-text("RUN 60 DRAWS")'); await p.waitForTimeout(3500);
  check('running the draws from the sheet shows results and the odds', await p.evaluate(() => { const c = [...document.querySelectorAll('#viewport caption')].map(x => x.textContent); return c.some(x => /Monte Carlo Results - 60 Draws/.test(x)) && c.includes('Odds') && !!document.querySelector('#viewport svg[aria-label^="Distribution of irr"]'); }));
  await p.evaluate(() => { const s = bkLoad(); s.exitCap = Number(s.exitCap) + 0.01; bkSave(s); showSheet('Probability-Weighted'); }); await p.waitForTimeout(300);
  check('results are marked stale once the deal changes', /changed since the last run/.test(await p.evaluate(() => document.querySelector('#viewport').innerText)));
  await p.evaluate(d => { bkCreateNewDeal(Object.assign({}, d, { dealType: 'Development', predevMonths: 6, constructionMonths: 18, leaseupMonths: 12 })); showSheet('Probability-Weighted'); }, B);
  check('Probability-Weighted says it applies to acquisition deals on a development deal', /acquisition deals/i.test(await p.evaluate(() => document.querySelector('#viewport').innerText)));
  // 11. Every editable value is right-aligned, on the sheets that carry inputs
  const algn = {};
  for (const sh of ['Deal Underwrite', 'Probability-Weighted', 'Market Benchmarks', 'Refi / Recap', 'Credit Policy', 'Depreciation', 'Import Deal', 'Import Rent Roll']) {
    await p.evaluate(d => bkCreateNewDeal(d), B); await p.evaluate(s => showSheet(s), sh); await p.waitForTimeout(350);
    algn[sh] = await p.evaluate(() => [...document.querySelectorAll('#viewport input[type=text], #viewport td.input, #viewport td[contenteditable=true], #viewport select')].filter(e => !['right', 'end'].includes(getComputedStyle(e).textAlign)).length); }
  check('every editable value is right-aligned', Object.values(algn).every(n => n === 0), JSON.stringify(algn));
  // 12. Home: front door with no deal, dashboard with one, next step, checklist, command palette, folding rail
  await p.evaluate(() => { localStorage.removeItem('bkcapital.cre.v02'); }); await p.reload(); await p.waitForTimeout(900);
  await p.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); showSheet('Home'); }); await p.waitForTimeout(400);
  check('Home with no deal is a front door with the ways in', await p.evaluate(() => { const t = document.querySelector('#viewport').innerText; return /Underwrite a deal/.test(t) && /Import a T-12/.test(t) && /Import a rent roll/.test(t) && /Start a blank deal/.test(t); }));
  await p.evaluate(d => { bkCreateNewDeal(d); showSheet('Home'); }, B); await p.waitForTimeout(500);
  const hm = await p.evaluate(() => ({ kpis: document.querySelectorAll('.pl-kpi').length, next: (document.querySelector('.pl-next .m') || {}).textContent, rows: document.querySelectorAll('.pl-row').length, name: (document.querySelector('.pl-hero h2') || {}).textContent, detail: !!document.querySelector('details.pl-detail'), obj: /\[object Object\]/.test(document.querySelector('#viewport').innerText) }));
  check('Home with a deal shows the name, six KPI tiles, a next step and the review checklist', hm.kpis === 6 && !!hm.next && hm.rows >= 6 && !!hm.name && hm.detail && !hm.obj, JSON.stringify(hm));
  await p.click('.pl-row:has-text("Model checks")'); await p.waitForTimeout(400);
  check('a checklist row opens its sheet', await p.evaluate(() => currentSheet) === 'Model Checks');
  await p.keyboard.press('Control+k'); await p.waitForTimeout(150);
  check('Ctrl+K opens the command palette', await p.evaluate(() => document.getElementById('pl-palette').classList.contains('open')));
  await p.keyboard.type('refi'); await p.waitForTimeout(150);
  const first = await p.evaluate(() => (document.querySelector('#pl-palette .it span:nth-child(2)') || document.querySelector('#pl-palette .it')).textContent);
  check('the palette filters as you type', /Refi/i.test(first), first);
  await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  check('Enter opens the chosen sheet and closes the palette', await p.evaluate(() => currentSheet === 'Refi / Recap' && !document.getElementById('pl-palette').classList.contains('open')));
  const rail = await p.evaluate(() => [...document.querySelectorAll('#rail-groups .rail-group')].filter(g => !g.classList.contains('bk-adv') && !g.classList.contains('pl-collapsed')).length);
  check('the left rail keeps only the working group open', rail === 1, String(rail));
  await p.keyboard.press('Escape');
  // 13. New deal and Clear inputs on Overview
  await p.evaluate(d => { bkCreateNewDeal(d); showSheet('Home'); }, B); await p.waitForTimeout(400);
  check('Overview offers New deal, Create PDF summary and Clear inputs', await p.evaluate(() => [...document.querySelectorAll('.pl-toolbar button')].map(b => b.textContent.trim()).join('|')) === '+ New deal|Import OM|Create PDF summary|Clear inputs');
  await p.click('.pl-toolbar button:has-text("New deal")'); await p.waitForTimeout(250);
  check('New deal asks for a name and type and offers to save the current deal', await p.evaluate(() => { const m = document.getElementById('pl-modal'); return m.classList.contains('open') && !!m.querySelector('#pl-nm') && !!m.querySelector('#pl-ty') && !!m.querySelector('#pl-save1'); }));
  await p.fill('#pl-nm', 'Test Heights'); await p.selectOption('#pl-ty', 'Development');
  const portBefore = await p.evaluate(() => bkPortfolioLoad().length);
  await p.click('#pl-modal button:has-text("Create blank deal")'); await p.waitForTimeout(500);
  const nd = await p.evaluate(() => ({ n: bkLoad().name, t: bkLoad().dealType, price: bkLoad().purchasePrice, port: bkPortfolioLoad().length, sheet: currentSheet, open: document.getElementById('pl-modal').classList.contains('open') }));
  check('Create blank deal opens an empty deal with that name and type, and saved the previous one', nd.n === 'Test Heights' && nd.t === 'Development' && !(nd.price > 0) && nd.port === portBefore + 1 && !nd.open, JSON.stringify(nd));
  await p.evaluate(d => { bkCreateNewDeal(d); showSheet('Home'); }, B); await p.waitForTimeout(300);
  await p.click('.pl-toolbar button:has-text("Clear inputs")'); await p.waitForTimeout(250);
  check('Clear inputs says what it will do before it does it', await p.evaluate(() => /Clear all inputs/.test(document.getElementById('pl-modal').innerText) && /kept/.test(document.getElementById('pl-modal').innerText)));
  await p.click('#pl-modal button:has-text("Cancel")'); await p.waitForTimeout(150);
  check('Cancel leaves the deal untouched', await p.evaluate(() => bkLoad().purchasePrice > 0 && !document.getElementById('pl-modal').classList.contains('open')));
  const nm0 = await p.evaluate(() => bkLoad().name);
  await p.click('.pl-toolbar button:has-text("Clear inputs")'); await p.waitForTimeout(200); await p.click('#pl-modal button.danger'); await p.waitForTimeout(500);
  const cl = await p.evaluate(() => { const s = bkLoad(); return { name: s.name, price: s.purchasePrice, units: s.units, taxes: s.taxes, rr: (s.rentRoll || []).length, type: s.dealType }; });
  check('Clear inputs blanks the numbers and keeps the deal identity', cl.name === nm0 && cl.price === 0 && cl.taxes === 0 && cl.rr === 0 && cl.type === 'Acquisition', JSON.stringify(cl));
  // 14. Flow: step bar reflects the decision, one-step loan sizing, glossary hints, methodology after the deal's own inputs, import lands on Home
  await p.evaluate(d => { bkCreateNewDeal(d); showSheet('Home'); }, A_); await p.waitForTimeout(600);
  const stp = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.bk-step')].map((x, i) => [i, x.className])));
  check('the step bar shows the debt and returns steps amber and the review step red when policy and the hurdle are missed', /warn/.test(stp[3]) && /warn/.test(stp[4]) && /fail/.test(stp[5]), JSON.stringify(stp));
  const sz = await p.evaluate(() => { const p0 = bkSizeLoanPlan(); return p0 && { ok: p0.ok, over: p0.cap.overage, from: p0.from, to: p0.dscr, loan: p0.loan, cap: p0.cap.capacity }; });
  check('the loan-sizing plan lands the loan just inside policy capacity', sz && sz.ok && sz.loan <= sz.cap && sz.loan > sz.cap * 0.98 && sz.to > sz.from, JSON.stringify(sz));
  await p.click('button:has-text("Size loan to policy")'); await p.waitForTimeout(250); await p.click('#pl-modal button:has-text("Apply")'); await p.waitForTimeout(600);
  const sz2 = await p.evaluate(() => ({ over: bkDealGate().capacity.overage, dscr: bkLoad().acqDSCR, debt: document.querySelector('.bk-step:nth-of-type(4)') && 0 }));
  check('applying it raises the sizing DSCR and removes the policy overage', sz2.over <= 0 && sz2.dscr > 1.25, JSON.stringify(sz2));
  check('the debt step turns green once the loan is within policy', await p.evaluate(() => /done/.test([...document.querySelectorAll('.bk-step')][3].className)));
  await p.evaluate(() => showSheet('Deal Underwrite')); await p.waitForTimeout(700);
  const ord = await p.evaluate(() => { const caps = [...document.querySelectorAll('#viewport .main-col caption')].map(c => c.textContent.trim()); return { first: caps[0], last: caps[caps.length - 1], hint: true }; });
  check('the methodology table is last, after the deal\'s own inputs', ord.first === 'Identity' && ord.last === 'Underwriting Conventions', JSON.stringify(ord));
  const lab = p.locator('#viewport td.rowlabel', { hasText: 'Acquisition LTV Basis' }).first(); await lab.scrollIntoViewIfNeeded(); await p.waitForTimeout(250); await lab.hover(); await p.waitForTimeout(200);
  check('hovering a term shows its plain-English definition', await p.evaluate(() => { const t = document.getElementById('pl-tip'); return !!t && t.style.display === 'block' && /Loan-to-value/.test(t.innerText); }));
  await p.keyboard.press('Control+k'); await p.waitForTimeout(150); await p.keyboard.type('glossary dscr'); await p.waitForTimeout(150);
  check('the search finds glossary entries', await p.evaluate(() => /Glossary: DSCR/.test(document.getElementById('pl-palette').innerText)));
  await p.keyboard.press('Enter'); await p.waitForTimeout(250);
  check('a glossary entry opens its definition', await p.evaluate(() => /Debt service coverage ratio/.test(document.getElementById('pl-modal').innerText)));
  await p.keyboard.press('Escape'); await p.evaluate(() => bkModalClose());
  // 15. Pro-forma / returns presentation
  await p.evaluate(() => showSheet('Property CF')); await p.waitForTimeout(800);
  const pf = await p.evaluate(() => { const v = document.querySelector('#viewport'); const t = v.querySelector('table.pf-tbl'); const rows = t ? [...t.querySelectorAll('tbody tr')].map(r => r.innerText) : []; const noi = rows.find(r => /Net operating income/i.test(r)) || ''; return { svgs: v.querySelectorAll('.pf-card svg').length, cols: t ? t.querySelectorAll('thead th').length : 0, noi, print: !!v.querySelector('.pf-bar button, .pf-bar .btn'), nan: /NaN|undefined/.test(v.innerText) }; });
  check('Property CF shows its charts, a 5-year statement and a print button', pf.svgs >= 2 && pf.cols >= 6 && pf.print && !pf.nan, JSON.stringify({ s: pf.svgs, c: pf.cols, p: pf.print }));
  check('statement NOI line ties to the engine Year-1 NOI', await p.evaluate(() => { const r = [...document.querySelectorAll('table.pf-tbl tbody tr')].find(x => /Net operating income/i.test(x.innerText)); const hs=[...r.closest('table').querySelectorAll('thead th')].map(h=>h.innerText.trim()); const c=hs.findIndex(h=>/^year 1$/i.test(h)); if(!r||c<1)return false; const m=+r.cells[c].innerText.replace(/[^0-9.-]/g,''); return c>0 && Math.abs(m - bkAnnualCF().arr[0].noi) < 1.5; }));
  await p.evaluate(() => showSheet('Returns')); await p.waitForTimeout(800);
  check('Returns shows the hurdle gauge, charts and the three scenarios', await p.evaluate(() => { const v = document.querySelector('#viewport'); return v.querySelectorAll('svg').length >= 3 && v.querySelectorAll('.pf-sc').length === 3 && !/NaN|undefined/.test(v.innerText); }));
  // 16. Create PDF summary
  await p.evaluate(a => { bkCreateNewDeal(a); showSheet('Home'); }, A_); await p.waitForTimeout(600);
  await p.evaluate(() => bkReportOpen()); await p.waitForTimeout(2500);
  const rp = await p.evaluate(() => { const f = document.getElementById('pl-report-frame'); const d = f && f.contentDocument; if (!d) return null; const D = bkProFormaData(); return { pages: d.querySelectorAll('.page').length, svgs: d.querySelectorAll('svg').length, txt: d.body.innerText, irr: (D.irr * 100).toFixed(2) + '%', moic: D.moic.toFixed(2) + 'x', eq: D.eq, nan: /NaN|undefined|\[object/.test(d.body.innerText), save: !!document.querySelector('#pl-report button') }; });
  check('the summary opens with six pages, charts and a save button', rp && rp.pages === 6 && rp.svgs >= 8 && rp.save && !rp.nan, JSON.stringify(rp && { p: rp.pages, s: rp.svgs, nan: rp.nan }));
  check('the summary shows the model\'s levered IRR and multiple', rp && rp.txt.indexOf(rp.irr) >= 0 && rp.txt.indexOf(rp.moic) >= 0, rp && (rp.irr + ' ' + rp.moic));
  check('sources equal uses on the summary', await p.evaluate(() => { const d = document.getElementById('pl-report-frame').contentDocument; const t = [...d.querySelectorAll('tr.tot')].filter(r => /Total (sources|uses)/.test(r.innerText)).map(r => r.cells[1].innerText); return t.length === 2 && t[0] === t[1]; }));
  await p.evaluate(() => bkReportClose());
  check('closing removes the preview', await p.evaluate(() => !document.getElementById('pl-report')));
  // 17. Create PDF summary for a development deal
  await p.evaluate(d => { bkCreateNewDeal(d); showSheet('Home'); }, require(path.join(__dirname, 'devdeal.js'))); await p.waitForTimeout(600);
  await p.evaluate(() => bkReportOpen()); await p.waitForTimeout(3000);
  const rdv = await p.evaluate(() => { const f = document.getElementById('pl-report-frame'); const d = f && f.contentDocument; if (!d) return null; const m = bkMonthlyReturns(); const t = d.body.innerText; const tots = [...d.querySelectorAll('tr.tot')].filter(r => /Total (sources|uses|project)/.test(r.innerText)).map(r => r.cells[1].innerText); return { pages: d.querySelectorAll('.page').length, irr: (m.irr * 100).toFixed(2) + '%', moic: m.moic.toFixed(2) + 'x', t, tots, nan: /NaN|undefined|\[object/.test(t) }; });
  check('a development deal gets a five-page summary', rdv && rdv.pages === 5 && !rdv.nan, JSON.stringify(rdv && { p: rdv.pages, nan: rdv.nan }));
  check('the development summary shows the model\'s IRR and multiple', rdv && rdv.t.indexOf(rdv.irr) >= 0 && rdv.t.indexOf(rdv.moic) >= 0, rdv && (rdv.irr + ' ' + rdv.moic));
  check('development sources equal uses', rdv && rdv.tots.length === 2 && rdv.tots[0] === rdv.tots[1], rdv && JSON.stringify(rdv.tots));
  await p.evaluate(() => bkReportClose());
  // 18. Version history and change log
  await p.evaluate(a => bkCreateNewDeal(a), A_); await p.waitForTimeout(500);
  const vh = await p.evaluate(() => { const o = {}; let s = bkLoad(); s.exitCap = 0.06; bkSave(s); s = bkLoad(); s.exitCap = 0.0625; bkSave(s); bkHistoryFlush(); o.log = bkLoad()._history.log.filter(l => l.k === 'exitCap').map(l => [l.from, l.to]);
    o.id = bkHistorySaveVersion('Baseline'); s = bkLoad(); s.purchasePrice = 23000000; bkSave(s); o.diff = bkHistoryDiff(o.id).rows.map(r => r.k);
    bkHistoryFlush(); const n = bkLoad()._history.log.length; bkReportHTML(); bkRunWith({ exitCap: 0.07 }, () => bkMonthlyReturns().irr); bkHistoryFlush(); o.scratchLogged = bkLoad()._history.log.length !== n;
    bkHistoryRestore(o.id); o.after = [bkLoad().purchasePrice, bkLoad().exitCap]; o.safety = bkLoad()._history.versions.some(v => /Before restoring/.test(v.note)); return o; });
  check('an edit is logged with its old and new value, and repeat edits coalesce', JSON.stringify(vh.log) === JSON.stringify([[0.0575, 0.0625]]), JSON.stringify(vh.log));
  check('comparing a version lists exactly the inputs that changed', JSON.stringify(vh.diff) === '["purchasePrice"]', JSON.stringify(vh.diff));
  check('scratch runs (sensitivity, report) write nothing to the log', !vh.scratchLogged);
  check('restore brings back the inputs and keeps a safety version', vh.after[0] === 24000000 && vh.after[1] === 0.0625 && vh.safety, JSON.stringify(vh.after));
  await p.evaluate(() => showSheet('Version History')); await p.waitForTimeout(600);
  check('the Version History sheet lists versions and changes', await p.evaluate(() => { const t = document.querySelector('#viewport').innerText; return /Baseline/.test(t) && /Purchase Price/.test(t) && !/NaN|undefined/.test(t); }));
  // 19. Financing Lab
  await p.evaluate(a => bkCreateNewDeal(a), A_); await p.waitForTimeout(500);
  const fl = await p.evaluate(() => { const before = JSON.stringify(bkLoad()); const L = bkFinLabData(); const mid = L.grid[3][3]; const direct = bkRunWith({ acqLTV: 0.65, acqLTC: 1, acqDSCR: 0.01, acqDebtYield: 0, acqRate: 0.065, debtEnabled: true, debtRateType: 'Fixed', purchasePrice: L.B.noi / L.B.cap, exitCap: L.B.exit }, () => bkProFormaKit.build().irr);
    showSheet('Financing Lab'); const txt = document.querySelector('#viewport').innerText; return { rows: L.grid.length, cols: L.grid[0].length, nulls: L.grid.flat().filter(c => !c).length, same: Math.abs(mid.irr - direct) < 1e-12, untouched: before === JSON.stringify(bkLoad()), txt, higherLoanMoreEquity: L.grid[0][0].eq > L.grid[5][0].eq }; });
  check('the lab grid has 6 loan-to-value rows and 7 rate columns, all computed', fl.rows === 6 && fl.cols === 7 && fl.nulls === 0, JSON.stringify([fl.rows, fl.cols, fl.nulls]));
  check('a lab cell equals a direct engine rerun with the same inputs', fl.same);
  check('more leverage means less equity, and viewing the lab leaves the deal unchanged', fl.higherLoanMoreEquity && fl.untouched);
  check('the Financing Lab sheet shows the grid and the structure table', /LTV \\ RATE/i.test(fl.txt) && /Interest-only 2 years/.test(fl.txt) && !/NaN|undefined/.test(fl.txt));
  // 20. Deal Documents and Import OM (the OM is read by text recognition; the engine is served from BK_TESSERACT_DIR, default /tmp/claude-0/ocr/node_modules)
  const TESS = process.env.BK_TESSERACT_DIR || '/tmp/claude-0/ocr/node_modules/'; const fsx = require('fs');
  await p.evaluate(a => bkCreateNewDeal(a), A_); await p.waitForTimeout(400);
  await p.evaluate(() => showSheet('Deal Documents')); await p.waitForTimeout(500);
  await p.setInputFiles('input[onchange*="\'photo\'"]', path.join(__dirname, 'fixtures', 'sample_photo.jpg')); await p.waitForTimeout(1500);
  await p.setInputFiles('input[onchange*="\'costar\'"]', path.join(__dirname, 'fixtures', 'sample_om.pdf')); await p.waitForTimeout(1500);
  const dd = await p.evaluate(async () => ({ list: (await bkDocsList()).map(f => f.slot), photo: bkDealPhotoURL().length > 500, txt: document.querySelector('#viewport').innerText }));
  check('a photo and a document are stored with the deal and listed', dd.list.includes('photo') && dd.list.includes('costar') && dd.photo && /sample_om\.pdf/.test(dd.txt), JSON.stringify(dd.list));
  check('the PDF summary cover carries the deal photo', await p.evaluate(() => { const h = bkReportHTML(); return /class="coverphoto"/.test(h) && /class="th"/.test(h); }));
  if (!fsx.existsSync(TESS + 'tesseract.js')) console.log('SKIP Import OM (text recognition engine not found in ' + TESS + ')');
  else {
    await p.route(/cdn\.jsdelivr\.net\/npm\//, r => { const u = r.request().url().replace(/^.*\/npm\//, ''), m = /^(@?[^@]+(?:\/[^@/]+)?)@[^/]+\/(.*)$/.exec(u), f = m && TESS + m[1] + '/' + m[2].split('?')[0]; if (f && fsx.existsSync(f)) r.fulfill({ path: f }); else r.abort(); });
    const exp = JSON.parse(fsx.readFileSync(path.join(__dirname, 'fixtures', 'sample_om_expected.json'), 'utf8'));
    await p.evaluate(() => showSheet('Import OM')); await p.waitForTimeout(500);
    await p.setInputFiles('#bkOMFile', path.join(__dirname, 'fixtures', 'sample_om.pdf'));
    await p.waitForFunction(() => /Read sample_om|could not find|Could not|has no readable/i.test(document.querySelector('#viewport').innerText), null, { timeout: 240000 });
    const om = await p.evaluate(() => ({ t: document.querySelector('#viewport').innerText }));
    check('the OM is read and its NOI ties to the engine', /TIES TO OM NOI/.test(om.t) && /Maple Court Apartments/.test(om.t) && /\$2,950,000/.test(om.t), om.t.slice(om.t.indexOf('Maple'), om.t.indexOf('Maple') + 120));
    const cf = await p.evaluate(() => document.querySelector('#viewport').innerText);
    check('every imported figure carries a confidence level, and a clean read has none marked Low', /Confidence in what was read/i.test(cf) && /\d+ verified/i.test(cf) && /\b0 low\b/i.test(cf) && /Real estate taxes[\s\S]{0,160}Verified/i.test(cf) && /Exit cap rate[\s\S]{0,120}Assumed/i.test(cf), cf.slice(cf.indexOf('Confidence in'), cf.indexOf('Confidence in') + 140));
    /* a misread figure must show: nudge one parsed expense, re-render, then restore it */
    const bad = await p.evaluate(async () => { const S = window.__bkOMState, e = S.om.ie.exp.filter(x => /tax/i.test(x.label))[0]; const was = e.cur, wasPf = e.pf; e.cur += 9000; e.pf += 9000; showSheet('Import OM'); await new Promise(r => setTimeout(r, 400)); const t = document.querySelector('#viewport').innerText; e.cur = was; e.pf = wasPf; showSheet('Import OM'); return t; });
    check('a misread expense is flagged Low and the summary says the figures do not reconcile', /NOI DIFFERS/.test(bad) && /Real estate taxes[\s\S]{0,260}Low/i.test(bad) && /did not reconcile/i.test(bad) && !/\b0 low\b/i.test(bad));
    /* learning: move Landscaping out of contract services; the NOI must not move and the next import must classify it the same way */
    await p.evaluate(() => bkLearn.clear());
    const lc = await p.evaluate(() => { const b0 = bkOMBuild(window.__bkOMState.om, 'cur'), i = b0.lines.findIndex(l => /landscap/i.test(l.label)); bkOMClass(i, 'ga'); const b1 = bkOMBuild(window.__bkOMState.om, 'cur'); return { i, c0: b0.deal.contract, c1: b1.deal.contract, g0: b0.deal.ga, g1: b1.deal.ga, t0: Math.round(b0.tie), t1: Math.round(b1.tie), learned: b1.lines[i].learned, html: document.querySelector('#viewport').innerHTML.indexOf('LEARNED') >= 0 }; });
    check('reclassifying an expense line moves it between categories without changing the NOI, and marks it learned', lc.i >= 0 && lc.c1 === lc.c0 - 3400 && Math.round(lc.g1 - lc.g0) === 3400 && lc.t0 === lc.t1 && lc.learned && lc.html, JSON.stringify(lc));
    await p.setInputFiles('#bkOMFile', path.join(__dirname, 'fixtures', 'sample_om.pdf'));
    await p.waitForFunction(() => /Read sample_om/i.test(document.querySelector('#viewport').innerText), null, { timeout: 240000 }); await p.waitForTimeout(400);
    check('a fresh import of the same wording applies the learned class by itself', await p.evaluate(() => { const b = bkOMBuild(window.__bkOMState.om, 'cur'); return b.deal.contract === 0 && /What the importer has learned/.test(document.querySelector('#viewport').innerText); }));
    await p.evaluate(() => { bkLearn.clear(); showSheet('Import OM'); });
    await p.evaluate(() => bkOMBasis('pf')); await p.waitForTimeout(400);
    check('the broker pro forma basis also ties to the OM NOI', await p.evaluate(() => /TIES TO OM NOI/.test(document.querySelector('#viewport').innerText)));
    await p.evaluate(() => bkOMBasis('cur')); await p.evaluate(() => bkOMCreate()); await p.waitForTimeout(2500);
    const nd = await p.evaluate(async () => { const s = bkLoad(); return { id: s.dealId, price: s.purchasePrice, units: s.units, gsf: s.gsf, noi: Math.round(bkCalc().noi), slots: (await bkDocsList()).map(f => f.slot).sort(), loc: s.location }; });
    check('creating the deal loads price, units, area and NOI from the OM', nd.price === exp.price && nd.units === exp.units && nd.gsf === exp.sf && Math.abs(nd.noi - exp.curNOI) <= 2 && nd.loc === 'Fairview, OH', JSON.stringify(nd));
    const imp = await p.evaluate(() => { const s = bkLoad(); return { has: !!s._imp, keys: s._imp ? Object.keys(s._imp.fields) : [], levels: s._imp ? Object.values(s._imp.fields).map(x => x.l) : [] }; });
    check('the import leaves its low and check flags on the deal', imp.has && imp.keys.length > 0 && imp.levels.every(l => l === 'low' || l === 'check'), JSON.stringify(imp));
    check('the OM and a photo are attached to the new deal', JSON.stringify(nd.slots) === '["om","photo"]', JSON.stringify(nd.slots));
    await p.evaluate(() => { bkGuideOn(); bkGuideGo('exit'); }); await p.waitForTimeout(500);
    const gx = await p.evaluate(() => ({ chk: !!document.querySelector('.gd-chk input'), t: document.querySelector('.gd').innerText }));
    await p.evaluate(() => bkGuideNext()); await p.waitForTimeout(400);
    const unc = await p.evaluate(() => JSON.stringify(bkLoad()._guide.confirmed));
    check('continuing does not silently confirm my assumptions; each needs a deliberate check', gx.chk && unc === '{}', unc);
    await p.evaluate(() => { bkGuideGo('exit'); }); await p.waitForTimeout(400);
    await p.evaluate(() => { const c = document.querySelector('.gd-chk input'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); bkGuideNext(); }); await p.waitForTimeout(400);
    check('ticking "I have checked this figure" confirms that assumption', await p.evaluate(() => Object.keys(bkLoad()._guide.confirmed).length === 1));
    await p.evaluate(() => { bkGuideGo('price'); }); await p.waitForTimeout(400);
    check('figures read from an OM carry the page they came from, with a way to view it', await p.evaluate(() => /from the OM, p\.\d+/i.test(document.querySelector('.gd').innerText) && !!document.querySelector('.gd-view')));
    {
      const ids = ['property', 'price', 'income', 'expenses', 'financing', 'exit']; let seen = null;
      for (const id of ids) { await p.evaluate(i => bkGuideGo(i), id); await p.waitForTimeout(300); const t = await p.evaluate(() => document.querySelector('.gd').innerText); if (/import: (check it|low confidence)/i.test(t)) { seen = id; break; } }
      const before = await p.evaluate(() => Object.keys(bkLoad()._imp.fields).length);
      check('a flagged import figure is marked in the Guide with its reason', !!seen, String(seen));
      if (seen) {
        await p.evaluate(() => { const c = document.querySelector('.gd-chk input'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); bkGuideNext(); }); await p.waitForTimeout(400);
        const after = await p.evaluate(() => Object.keys(bkLoad()._imp.fields).length);
        check('confirming a flagged figure clears its flag', after < before, before + ' -> ' + after);
        const fx = await p.evaluate(() => { const s = bkLoad(), ks = Object.keys(s._imp.fields).filter(k => typeof s[k] === 'number'); return ks[0] || null; });
        if (fx) {
          const sec = await p.evaluate(k => { const ids = ['property', 'price', 'income', 'expenses', 'financing', 'exit']; for (const id of ids) { bkGuideGo(id); if (document.getElementById('gdf-' + k)) return id; } return null; }, fx); await p.waitForTimeout(300);
          if (sec) { await p.evaluate(k => { bkGuideDraft(k, String(Number(bkLoad()[k]) + 1)); bkGuideNext(); }, fx); await p.waitForTimeout(300); }
          check('correcting a flagged figure is noted so the importer can learn from it', !!sec && await p.evaluate(k => bkLearn.logAll().some(e => e.kind === 'fix' && e.field === k), fx), String(fx));
        }
        await p.evaluate(() => bkLearn.clear());
      }
    }
    await p.evaluate(() => { bkGuideGo('exit'); }); await p.waitForTimeout(400);
    const gt = await p.evaluate(() => document.querySelector('.gd').innerText);
    check('after an OM import the guide marks my assumptions for checking, and offers a suggestion', /my assumption: check it/i.test(gt) && /I suggest/.test(gt), gt.slice(0, 160));
    await p.evaluate(() => { bkGuideGo('expenses'); }); await p.waitForTimeout(400);
    check('and tags the figures read from the OM', await p.evaluate(() => /from the OM/i.test(document.querySelector('.gd').innerText)));
    await p.evaluate(() => bkGuideOff()); await p.waitForTimeout(300);
    /* a second layout: two pages, no price, a hyphenated street number, additional income without its own heading */
    const expb = JSON.parse(fsx.readFileSync(path.join(__dirname, 'fixtures', 'sample_om_b_expected.json'), 'utf8'));
    await p.evaluate(() => { showSheet('Import OM'); }); await p.waitForTimeout(500);
    await p.setInputFiles('#bkOMFile', path.join(__dirname, 'fixtures', 'sample_om_b.pdf'));
    await p.waitForFunction(() => /✓ Read sample_om_b|could not find|Could not/i.test(document.querySelector('#viewport').innerText), null, { timeout: 240000 }); await p.waitForTimeout(500);
    const ob = await p.evaluate(() => ({ t: document.querySelector('#viewport').innerText, dis: !!document.querySelector('button[onclick="bkOMCreate()"]').disabled }));
    check('an entered price is shown as verified, with the reason', await p.evaluate(async () => { bkOMManual('mPrice', '1,600,000'); await new Promise(r => setTimeout(r, 300)); const t = document.querySelector('#viewport').innerText; bkOMManual('mPrice', ''); return /Purchase price[\s\S]{0,200}Verified/i.test(t); }));
    check('a second OM layout is read, and a missing price is asked for', /NOT FOUND IN THE OM/i.test(ob.t) && /Elm Street Apartments/.test(ob.t) && /Brookfield, CT/.test(ob.t) && /TIES TO OM NOI/.test(ob.t) && ob.dis, ob.t.slice(ob.t.indexOf('Elm'), ob.t.indexOf('Elm') + 100));
    await p.evaluate(() => bkOMManual('mPrice', '1,600,000')); await p.waitForTimeout(400); await p.evaluate(() => bkOMCreate()); await p.waitForTimeout(2500);
    const nb = await p.evaluate(async () => { const s = bkLoad(); return { price: s.purchasePrice, units: s.units, noi: Math.round(bkCalc().noi), slots: (await bkDocsList()).map(f => f.slot).sort() }; });
    check('the entered price and the OM figures build the deal, and a table page is not used as the photo', nb.price === 1600000 && nb.units === expb.units && Math.abs(nb.noi - expb.curNOI) <= 2 && JSON.stringify(nb.slots) === '["om"]', JSON.stringify(nb));
    /* speed and accuracy of the reading itself: a 32-page image OM is scanned by heading and only the relevant pages are read in full; a poor first read is retried larger */
    {
      const clear = () => p.evaluate(() => { Object.keys(localStorage).filter(k => k.indexOf('bkcapital.omocr.') === 0).forEach(k => localStorage.removeItem(k)); });
      const bigPath = path.join(__dirname, 'fixtures', 'sample_om_big.pdf');
      try { require('child_process').execSync('python3 ' + JSON.stringify(path.join(__dirname, 'fixtures', 'make_om_big.py')), { stdio: 'ignore' }); } catch (e) {}
      if (fsx.existsSync(bigPath)) {
        await clear(); await p.evaluate(() => { showSheet('Import OM'); }); await p.waitForTimeout(400);
        await p.setInputFiles('#bkOMFile', bigPath);
        await p.waitForFunction(() => /✓ Read sample_om_big|could not find|Could not/i.test(document.querySelector('#viewport').innerText), null, { timeout: 280000 });
        const bg = await p.evaluate(() => ({ t: document.querySelector('#viewport').innerText, info: window.__bkOMState.info }));
        check('a 32-page image OM is read by heading, ties to the OM NOI, and only a few pages are read in full', /TIES TO OM NOI/.test(bg.t) && bg.info.t && bg.info.t.scan > 0 && bg.info.fullPages <= 10 && bg.info.n === 32, JSON.stringify({ n: bg.info.n, full: bg.info.fullPages, t: bg.info.t }));
        check('the read time is shown on the page', /read in \d+(\.\d)?s/.test(bg.t));
        fsx.unlinkSync(bigPath);
      } else console.log('SKIP big OM timing (python3 / PIL not available)');
      await clear(); await p.evaluate(() => { window.bkOMWidths = [450, 2700]; showSheet('Import OM'); }); await p.waitForTimeout(400);
      await p.setInputFiles('#bkOMFile', path.join(__dirname, 'fixtures', 'sample_om.pdf'));
      await p.waitForFunction(() => /✓ Read sample_om|could not find|Could not/i.test(document.querySelector('#viewport').innerText), null, { timeout: 200000 });
      const rt = await p.evaluate(() => ({ t: document.querySelector('#viewport').innerText, info: window.__bkOMState.info }));
      check('a poor first read (tiny scan size) is retried at full size and then ties to the OM NOI', /TIES TO OM NOI/.test(rt.t) && rt.info.t.ocr > rt.info.t.read, JSON.stringify(rt.info.t));
      await p.evaluate(() => { window.bkOMWidths = null; }); await clear();
    }
    /* a development-site OM (a text PDF, read with PDF.js) plus the developer's pro forma workbook */
    const expd = JSON.parse(fsx.readFileSync(path.join(__dirname, 'fixtures', 'dev_expected.json'), 'utf8'));
    await p.evaluate(() => { showSheet('Import OM'); }); await p.waitForTimeout(500);
    await p.setInputFiles('#bkOMFile', path.join(__dirname, 'fixtures', 'dev_om.pdf'));
    await p.waitForSelector('#bkOMDevFile', { timeout: 120000 }).catch(() => {});
    check('a development-site OM is recognised and asks for the pro forma workbook', await p.evaluate(() => !!document.querySelector('#bkOMDevFile') && /development site/i.test(document.querySelector('#viewport').innerText)));
    await p.setInputFiles('#bkOMDevFile', path.join(__dirname, 'fixtures', 'dev_proforma.xlsx')); await p.waitForTimeout(5000);
    const dv = await p.evaluate(() => document.querySelector('#viewport').innerText);
    check('the development import shows confidence too, with nothing Low on a clean read', /Confidence in what was read/i.test(dv) && /\b0 low\b/i.test(dv) && /Land price[\s\S]{0,160}(Verified|Check)/i.test(dv));
    check('the development pro forma ties to the workbook NOI', /TIES TO PRO FORMA NOI/.test(dv) && /\$600,000/.test(dv) && /\$4,000,000/.test(dv), dv.slice(dv.indexOf('TIES'), dv.indexOf('TIES') + 90));
    await p.evaluate(() => bkOMDevCreate()); await p.waitForTimeout(4000);
    const dd2 = await p.evaluate(async () => { const s = bkLoad(); const m = bkMonthlyReturns(); return { t: s.dealType, price: s.purchasePrice, units: s.units, src: s.sourceConstruction, noi: Math.round(bkCalc().noi), irrOk: isFinite(m.irr), slots: (await bkDocsList()).map(f => f.slot).sort() }; });
    check('the development deal is created and runs through the development engine', dd2.t === 'Development' && dd2.price === expd.price && dd2.units === expd.units && dd2.src === expd.construction && Math.abs(dd2.noi - expd.noi) <= 3 && dd2.irrOk && dd2.slots.includes('om') && dd2.slots.includes('other'), JSON.stringify(dd2));
  }
  // 22. Step-by-step guide
  await p.evaluate(() => { bkGuideOff && bkGuideOff(); }); await p.waitForTimeout(300);
  await p.evaluate(() => showSheet('Home')); await p.waitForTimeout(400);
  check('the Overview is the normal page while the guide is off', await p.evaluate(() => !document.documentElement.classList.contains('bk-guide') && !document.querySelector('.gd')));
  await p.evaluate(() => bkGuideOn()); await p.waitForTimeout(500);
  await p.evaluate(() => bkGuideBlank('Acquisition')); await p.waitForTimeout(500);
  check('guide on shows one section at a time and hides the rest of the app', await p.evaluate(() => document.documentElement.classList.contains('bk-guide') && /Step 1 of 6/i.test(document.querySelector('.gd').innerText) && getComputedStyle(document.querySelector('.rail')).display === 'none'));
  await p.fill('#gdf-name', 'Guide Court'); await p.dispatchEvent('#gdf-name', 'change'); await p.fill('#gdf-units', '14'); await p.dispatchEvent('#gdf-units', 'change');
  const g1 = await p.evaluate(() => ({ name: bkLoad().name, units: bkLoad().units, panel: document.getElementById('gd-chg').innerText, btn: document.getElementById('gd-next').innerText }));
  check('typed values are only proposed: nothing is saved until the change is confirmed', g1.units !== 14 && g1.name !== 'Guide Court' && /Guide Court/.test(g1.panel) && /2 change/i.test(g1.btn), JSON.stringify(g1));
  await p.evaluate(() => bkGuideNext()); await p.waitForTimeout(500);
  const g2 = await p.evaluate(() => ({ name: bkLoad().name, units: bkLoad().units, done: bkLoad()._guide.done, h: document.querySelector('.gd h1').innerText }));
  check('confirming saves the changes, marks the step done and moves on', g2.name === 'Guide Court' && g2.units === 14 && g2.done.property === 1 && /price/i.test(g2.h), JSON.stringify(g2));
  await p.evaluate(() => bkGuideSkip()); await p.waitForTimeout(400);
  await p.evaluate(() => bkGuideGo('expenses')); await p.waitForTimeout(400);
  await p.evaluate(() => bkGuideUse('reserves')); await p.waitForTimeout(400);
  const g3 = await p.evaluate(() => ({ draft: document.getElementById('gdf-reserves').value, saved: bkLoad().reserves }));
  check('a suggestion fills the proposal (14 units x $300) without saving it', g3.draft === '4,200' && !(g3.saved > 0), JSON.stringify(g3));
  await p.evaluate(() => bkGuideGo('review')); await p.waitForTimeout(400);
  const g4 = await p.evaluate(() => document.querySelector('.gd').innerText);
  check('the review lists the skipped step and the steps not yet done', /Price and closing was skipped/.test(g4) && /Rents and other income has not been done/.test(g4));
  await p.evaluate(() => bkGuideDetail('Deal Underwrite')); await p.waitForTimeout(500);
  check('leaving for the full sheet shows the full app and a way back to the guide', await p.evaluate(() => !document.documentElement.classList.contains('bk-guide') && !!document.getElementById('bk-guide-back')));
  await p.evaluate(() => bkGuideOff()); await p.waitForTimeout(400);
  check('turning the guide off restores the normal app', await p.evaluate(() => !document.documentElement.classList.contains('bk-guide') && !document.getElementById('bk-guide-back') && !document.querySelector('.gd')));
  // 23. Guide: turning it on mid-deal reads the current inputs, gives advice, explains impact and the loan, and checks assumptions deliberately
  await p.evaluate(a => { bkCreateNewDeal(Object.assign({}, a, { vacancy: 0, reserves: 0, mgmtPct: 0 })); }, A_); await p.waitForTimeout(500);
  await p.evaluate(() => bkGuideOn()); await p.waitForTimeout(700);
  const w1 = await p.evaluate(() => document.querySelector('.gd').innerText);
  check('turning the guide on mid-deal opens a reading of where the deal stands', /Where this deal stands/i.test(w1) && /Entered, not yet reviewed/i.test(w1) && /120 units/.test(w1) && /Needs: vacancy/i.test(w1), w1.slice(0, 120));
  check('it offers advice from the current inputs (vacancy, management, reserves)', /Vacancy is 0\.0%/.test(w1) && /no management fee/i.test(w1) && /No replacement reserves/.test(w1));
  await p.evaluate(() => bkGuideProp('vacancy', 0.05)); await p.waitForTimeout(800);
  const w2 = await p.evaluate(() => ({ imp: document.getElementById('gd-imp').innerText, saved: bkLoad().vacancy, val: document.getElementById('gdf-vacancy').value }));
  check('a proposal shows its effect on the return and is not saved', /With your changes/.test(w2.imp) && w2.saved === 0 && w2.val === '5', JSON.stringify(w2));
  await p.evaluate(() => bkGuideGo('debt')); await p.waitForTimeout(600);
  check('the financing step says what the lender would actually give and why', await p.evaluate(() => /What the lender would actually give/.test((document.getElementById('gd-dbt') || {}).innerText || '') && /sized by/.test(document.getElementById('gd-dbt').innerText)));
  await p.evaluate(() => bkGuideGo('property')); await p.waitForTimeout(400);
  await p.focus('#gdf-name'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  check('Enter moves to the next field', await p.evaluate(() => document.activeElement.id === 'gdf-location'));
  // development path through the guide
  await p.evaluate(() => bkGuideBlank('Development')); await p.waitForTimeout(500);
  const setv = async (k, v) => { await p.fill('#gdf-' + k, v); await p.dispatchEvent('#gdf-' + k, 'change'); };
  await setv('name', 'Guided Dev'); await setv('units', '40'); await setv('gsf', '36000'); await p.evaluate(() => bkGuideNext()); await p.waitForTimeout(400);
  await setv('purchasePrice', '1,200,000'); await setv('sourceConstruction', '8,000,000'); await setv('constructionMonths', '18'); await p.evaluate(() => bkGuideNext()); await p.waitForTimeout(400);
  await setv('avgRent', '1,900'); await setv('vacancy', '5'); await p.evaluate(() => bkGuideNext()); await p.waitForTimeout(400);
  await setv('taxes', '120,000'); await setv('insurance', '40,000'); await setv('rm', '30,000'); await setv('mgmtPct', '3'); await p.evaluate(() => bkGuideNext()); await p.waitForTimeout(400);
  await setv('conLTC', '65'); await setv('conRate', '7.5'); await p.evaluate(() => bkGuideNext()); await p.waitForTimeout(400);
  await setv('holdYears', '6'); await setv('exitCap', '5.75'); await p.evaluate(() => bkGuideNext()); await p.waitForTimeout(600);
  const dv2 = await p.evaluate(() => { const s = bkLoad(), m = bkMonthlyReturns(); return { t: s.dealType, done: Object.keys(s._guide.done).length, price: s.purchasePrice, src: s.sourceConstruction, ltc: s.conLTC, exit: s.exitCap, irrOk: isFinite(m.irr) && m.irr !== 0, h: document.querySelector('.gd h1').innerText }; });
  check('a development deal can be built through the guide, step by step, and runs in the engine', dv2.t === 'Development' && dv2.done === 6 && dv2.price === 1200000 && dv2.src === 8000000 && dv2.ltc === 0.65 && dv2.exit === 0.0575 && dv2.irrOk && /Review/.test(dv2.h), JSON.stringify(dv2));
  await p.evaluate(() => bkGuideOff()); await p.waitForTimeout(300);
  // 21. Header sign-in / sign-out (last: signing out clears the page)
  p.on('dialog', d => d.accept());
  await p.evaluate(() => showSheet('Home')); await p.waitForTimeout(400);
  check('the header offers Sign in when there is no session', await p.evaluate(() => /sign in/i.test((document.getElementById('pl-user') || {}).innerText || '')));
  await p.evaluate(() => { localStorage.setItem('bkcapital.supabase.auth.v01', JSON.stringify({ access_token: 'x', user: { id: '1', email: 'tester@example.com' }, expires_at: Date.now() + 3.6e6 })); bkHeaderUserPaint(); });
  check('with a session the header shows the account and Sign out', await p.evaluate(() => { const t = (document.getElementById('pl-user') || {}).innerText || ''; return /tester@example\.com/.test(t) && /sign out/i.test(t); }));
  await p.evaluate(() => bkHeaderSignOut()); await p.waitForTimeout(1500);
  check('signing out clears the session and returns to the sign-in screen', await p.evaluate(() => !document.documentElement.classList.contains('bk-auth-ok') && !localStorage.getItem('bkcapital.supabase.auth.v01') && getComputedStyle(document.getElementById('bk-auth-gate')).display !== 'none'));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
