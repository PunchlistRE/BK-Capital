// Interface test: the conventions panel, its explanations, the loan-sizing labels and the readiness
// checks must describe the settings the engine is actually using.
//   node audit/ui_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path');
const B = require(path.join(__dirname, 'dealB.js'));
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
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
