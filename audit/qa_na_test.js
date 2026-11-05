// QA sheet > Engine Self-Tests > Floating Debt QA (src/047 bkFloatingDebtQA, shown by src/082): a deal with no debt reads N/A with its reason, never ERROR, and the check never touches the deal.
// A deal with debt keeps the same 8 checks. Covers a blank deal, an all-cash deal that is not blank, a deal with debt turned off, an unchanged deal with debt (fixed and floating), the grey N/A chip, the shape of the
// result, that nothing is written to storage for a deal with no debt, and that the deal is identical after the sheet has rendered.
//   node audit/qa_na_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 420) + ']' : '')); };
  const open = async () => { const p = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); }); return p; };
  /* open the QA sheet on a deal and read the Floating Debt QA row, every self-test row, the grey-chip attribute, and whether the deal changed */
  const QA = (p, make) => p.evaluate(async (make) => { new Function('A', make)(window.__A || null);
    const before = JSON.stringify(bkLoad()); showSheet('QA'); await new Promise(r => setTimeout(r, 700));
    const rows = [...document.querySelectorAll('#viewport tr')].filter(r => /^(Source Ingestion QA|Floating Debt QA|Waterfall Conservation Audit)/.test((r.children[0] || {}).textContent || '')).map(r => ({ name: r.children[0].textContent.trim(), text: r.innerText.replace(/\s+/g, ' ').trim(), chip: (r.querySelector('.status-chip') || {}).textContent, kind: (r.querySelector('.status-chip') || { getAttribute: () => null }).getAttribute('data-bk-chip') }));
    return { rows, floating: rows.find(r => r.name === 'Floating Debt QA'), anyError: /ERROR|Cannot read properties/.test(document.querySelector('#viewport').innerText), unchanged: before === JSON.stringify(bkLoad()), debt: (() => { const d = bkDebt(); return { enabled: d.debtEnabled, loan: d.loan, months: (d.months || []).length }; })() }; }, make);

  /* a blank deal */
  let p = await open(); await p.evaluate(a => { window.__A = a; }, A);
  let r = await QA(p, "bkCreateNewDeal({ name: 'Cash Test', dealId: 'CT', dealType: 'Acquisition', propertyType: 'Multifamily', blankStructure: true });");
  check('blank deal: Floating Debt QA reads N/A, with the reason, not ERROR', r.floating && r.floating.chip === 'N/A' && /This deal has no debt/.test(r.floating.text) && !/ERROR/.test(r.floating.text), JSON.stringify(r.floating));
  check('blank deal: nothing on the QA sheet reads ERROR or shows a script error message', !r.anyError, '');
  check('blank deal: the N/A chip is the grey "not applicable" kind, like the other N/A chips in the app', r.floating && r.floating.kind === 'na', r.floating && r.floating.kind);
  check('blank deal: the deal is identical after the QA sheet has rendered', r.unchanged);
  check('blank deal: the engine really has no loan (the case the check is meant for), and the other two self-tests still run', r.debt.loan === 0 && r.debt.months === 0 && r.rows.length === 3 && r.rows.filter(x => x.name !== 'Floating Debt QA').every(x => /\d+ \/ \d+/.test(x.text)), JSON.stringify(r.debt));
  const direct = await p.evaluate(() => { let saves = 0; const orig = Storage.prototype.setItem; Storage.prototype.setItem = function(){ saves++; return orig.apply(this, arguments); }; let res; try { res = bkFloatingDebtQA(); } finally { Storage.prototype.setItem = orig; } return { res, saves }; });
  check('blank deal: the function says it does not apply (na, a reason, no checks) and writes nothing to storage: the deal is never touched', direct.res.na === true && /no debt/i.test(direct.res.reason) && direct.res.tests.length === 0 && direct.res.passed === 0 && direct.res.failed === 0 && direct.saves === 0, JSON.stringify(direct));
  check('no page errors', p.errs.length === 0, p.errs.slice(0, 2).join(' | ')); await p.close();

  /* a deal with debt: the same 8 checks as before, and the deal is restored */
  p = await open(); await p.evaluate(a => { window.__A = a; }, A);
  r = await QA(p, "bkCreateNewDeal(A);");
  check('a deal with debt: Floating Debt QA still reads 8 / 8, all passed', r.floating && r.floating.chip === '8 / 8' && /All checks passed/.test(r.floating.text) && r.floating.kind !== 'na', JSON.stringify(r.floating));
  check('a deal with debt: the deal is identical after the QA sheet has rendered (the checks save changed rate terms and put them back)', r.unchanged && !r.anyError);
  const names = await p.evaluate(() => bkFloatingDebtQA().tests.map(t => t.name + ':' + t.pass));
  check('a deal with debt: the checks are the same eight, by name, all passing', names.length === 8 && names.every(x => /:true$/.test(x)) && /Fixed coupon equals acqRate/.test(names[0]) && /Year 2 curve applied/.test(names.join()), names.join(' | '));
  const dsaved = await p.evaluate(() => { let saves = 0; const orig = Storage.prototype.setItem; Storage.prototype.setItem = function(){ saves++; return orig.apply(this, arguments); }; const before = JSON.stringify(bkLoad()); try { bkFloatingDebtQA(); } finally { Storage.prototype.setItem = orig; } return { saves, same: before === JSON.stringify(bkLoad()) }; });
  check('a deal with debt: the check writes its trial rate terms to storage and then restores the original deal exactly', dsaved.saves > 0 && dsaved.same, JSON.stringify(dsaved));
  r = await QA(p, "bkCreateNewDeal(Object.assign({}, A, { debtRateType: 'Floating', debtIndexRate: 0.045, debtSpread: 0.03 }));");
  const fl = await p.evaluate(() => { const s = bkLoad(); return { type: s.debtRateType, idx: s.debtIndexRate, spread: s.debtSpread }; });
  check('a floating-rate deal: still 8 / 8, and its own rate type, index and spread are back as they were', r.floating && r.floating.chip === '8 / 8' && fl.type === 'Floating' && fl.idx === 0.045 && fl.spread === 0.03, JSON.stringify([r.floating, fl]));
  await p.close();

  /* no debt without being blank */
  p = await open(); await p.evaluate(a => { window.__A = a; }, A);
  r = await QA(p, "bkCreateNewDeal(Object.assign({}, A, { debtEnabled: false }));");
  check('a deal with debt turned off: N/A, with the reason', r.floating && r.floating.chip === 'N/A' && /no debt/.test(r.floating.text) && !r.anyError && r.unchanged, JSON.stringify(r.floating));
  r = await QA(p, "bkCreateNewDeal(Object.assign({}, A, { acqLTV: 0, acqLTC: 0, acqDSCR: 0, acqDebtYield: 0, debtEnabled: true }));");
  check('an all-cash deal that is not blank: whatever the engine says about the loan, the sheet never reads ERROR', !r.anyError && r.unchanged && (r.floating.chip === 'N/A' ? r.debt.loan === 0 || r.debt.months === 0 : r.floating.chip === '8 / 8'), JSON.stringify([r.floating, r.debt]));
  await p.close();
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
